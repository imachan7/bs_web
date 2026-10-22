// 付与系（キーワード／色／系統／レベル置換など）のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, EffectAction, GameState, PlayerId } from "../../type"
import { createInstance, currentLevel, findInstanceAnywhere, getCard, log, suspend } from "../GameState"
import {
    bothSidesRedirectKeepPid,
    findSpiritAny,
    getAllFamilies,
    pickAnySideCandidates,
    pickAnySideByBp,
    pickEnemyByBp,
    pickEnemyCandidates,
    exhaustSpirit,
    pickOwnKeywordTarget,
    requestCardChoice,
    requestChoice,
    requestUpToChoice,
    returnSpiritToHand,
    tryInteractiveTargetChoice,
    recordTimed,
    recordPlayerRule,
} from "../EffectModules"
import { handGainBlocked, KEYWORDS, activeConstraints, effectiveBp, instBaseCost, instHasColor, instHasCost, instIsCombined, instIsVanilla, matchesTarget, spiritHasFamily, spiritHasKeyword } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"
import { normalizeFilter, SELF_REQUIRED } from "./filter"
import { normalReserveOf, wouldDeplete } from "../soulCore"
import { destroySpirit } from "../removal"
import { notifyHandGained, placeCoresOnSpirit } from "../EffectModules"
import { recordTargets } from "../record"

const grantKeywordToHandCardHandler: ActionHandler<"grantKeywordToHandCard"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 手札の条件一致カード（all指定時はすべて、それ以外は1枚）に、このターンの間キーワードを付与する
        const player = state.players[owner]
        const label = KEYWORDS[action.keyword].label
        const grant = (cardId: string): void => {
            player.tempHandKeywordGrants = player.tempHandKeywordGrants ?? []
            player.tempHandKeywordGrants.push({ cardId, keyword: action.keyword })
            log(
                state,
                `${player.name}の手札「${getCard(cardId).name}」に【${label}】が与えられた（ターン終了時まで）。`,
            )
        }
        if (chosenCardIndex !== undefined) {
            const cardId = player.hand[chosenCardIndex]
            if (cardId === undefined) {
                log(state, `${sourceName}：対象の手札がなかった。`)
                return
            }
            grant(cardId)
            return
        }
        const indices = player.hand
            .map((_, i) => i)
            .filter((i) => {
                const c = getCard(player.hand[i]!)
                if (action.cardType !== undefined && c.type !== action.cardType) return false
                if (action.familyFilter !== undefined) {
                    const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
                    if (!wanted.some((f) => c.family.includes(f))) return false
                }
                return true
            })
        if (indices.length === 0) {
            log(state, `${sourceName}：対象の手札がなかった。`)
            return
        }
        if (action.all) {
            // BS08ライトニングスピード：選択を挟まず、条件一致する手札カードすべてに付与する。
            // 付与はcardId単位（RuleValidatorがcardId一致で判定）のため、同名重複カードは1回にまとめる
            const uniqueCardIds = new Set(indices.map((i) => player.hand[i]!))
            for (const cardId of uniqueCardIds) grant(cardId)
            return
        }
        if (state.interactiveTargets) {
            requestCardChoice(
                state,
                owner,
                `${sourceName}：【${label}】を与える手札カードを選んでください`,
                "hand",
                indices,
                false,
                action,
                self,
            )
            return
        }
        // 自動時：手札末尾（新しい方）の該当カードを対象にする簡略化
        const idx = indices[indices.length - 1]!
        grant(player.hand[idx]!)
        return
}

const grantFamilyChoiceAllHandler: ActionHandler<"grantFamilyChoiceAll"> = (ctx, action) => {
    const { state, owner, self, sourceCardId, sourceName, chosenOption } = ctx
        if (!self) return
        // 「フィールド、または手札にある系統：X を持つスピリット/スピリットカードすべて」が対象のため、
        // 発動可否は場と手札の両方で見る（付与系統は見ない＝カード静的な系統だけ。音鳥クルーク）
        const onField = state.players[owner].field.spirits.some((s) =>
            getCard(s.cardId).family.includes(action.targetFamily),
        )
        const inHand = state.players[owner].hand.some((cardId) =>
            getCard(cardId).family.includes(action.targetFamily),
        )
        if (!onField && !inHand) {
            return
        }
        if (chosenOption === undefined) {
            requestChoice(
                state,
                owner,
                `「${action.targetFamily}」持ちに与える系統を選んでください`,
                [],
                true,
                action,
                self,
                "option",
                getAllFamilies(),
            )
            return
        }
        // 選んだ系統を載せた仮想発生源を積む（lendSelfThisTurn と同じ貸与。以後 kind:"familyGrant" の
        // familyFromChoice エントリが継続付与するので、このターンに召喚したスピリットにも乗る）
        const virtual = pushVirtualSource(state, owner, sourceCardId)
        if (!virtual) return
        virtual.lentChoiceFamily = chosenOption
        log(
            state,
            `${sourceName}：このターンの間、系統「${chosenOption}」を「${action.targetFamily}」持ちすべてに与えた。`,
        )
        return
}

const levelOverrideOpponentNexusesHandler: ActionHandler<"levelOverrideOpponentNexuses"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const oppPlayer = state.players[opp]
        for (const nexus of oppPlayer.field.nexuses) {
            recordTimed(state, { content: [{ type: "level", set: action.level }], target: { kind: "instance", instanceId: nexus.instanceId }, until: "turn", ownerPid: owner })
        }
        log(
            state,
            `${sourceName}：${oppPlayer.name}のネクサスすべてを、このターンの間Lv${action.level}として扱う。`,
        )
        return
}

// 26系【レベルアップ】『アタック/ブロック時』: このバトル中、発生源個体（self）を指定レベルとして扱う。
// BPもそのレベルの表になる（currentLevel は timedLevel を読むので timed への書き込みで自然に効く）。
// until:"battle" の記録はバトル終了で自動的に消える
const levelAsSelfThisBattleHandler: ActionHandler<"levelAsSelfThisBattle"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        if (!self) return
        recordTimed(
            state,
            {
                content: [{ type: "level", set: action.level, requireLevelExists: true }],
                target: { kind: "instance", instanceId: self.instanceId },
                until: "battle",
                ownerPid: owner,
            },
        )
        log(
            state,
            `${sourceName}は、このバトルの間Lv${action.level}として扱う。`,
        )
        return
}

// 「自分か相手のスピリット1体を指定する」系の対象決定（ダブルハート／ビルドアップ）。
// targetInstanceId 指定時はそれを使う。未指定なら anySide のとき両陣営から、
// そうでなければ自分側だけから候補を作り、interactiveTargets ならプレイヤーに選ばせる。
// choice を立てた場合は "pending" を返す（呼び出し側はそのまま return する）
function pickSingleTarget(
    ctx: ActionCtx,
    action: { anySide?: true },
    prompt: string,
): CardInstance | undefined | "pending" {
    const { state, owner, self, srcColors, srcType, targetInstanceId } = ctx
    if (targetInstanceId) {
        const found = findSpiritAny(state, targetInstanceId)
        return found?.inst
    }
    const candidates = action.anySide
        ? pickAnySideCandidates(state, owner, () => true, srcColors, srcType)
        : state.players[owner].field.spirits.slice()
    if (state.interactiveTargets && tryInteractiveTargetChoice(state, owner, self, prompt, candidates, action as EffectAction, null)) {
        return "pending"
    }
    // 自動選択は実効BP最大（既存挙動）。両陣営のときは相手側→自分側の順で同値は先勝ち
    return candidates.reduce<CardInstance | undefined>(
        (best: CardInstance | undefined, s: CardInstance) =>
            !best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        undefined,
    )
}

const addSymbolPermanentHandler: ActionHandler<"addSymbolPermanent"> = (ctx, action) => {
    const { state, self, sourceName } = ctx
    // BS13-003カメレオプス：本来のコストが7以上のスピリットカードを召喚するたび、自身に永続的にシンボルを追加する。
    // symbolAddGrant（継続の再計算式）と異なりトリガーで蓄積するため、専用フィールドextraSymbolsPermanentへ加算する
    if (!self) {
        log(state, `${sourceName}：シンボルを追加する対象がいなかった。`)
        return
    }
    if (!self.extraSymbolsPermanent) self.extraSymbolsPermanent = []
    for (let i = 0; i < action.count; i++) self.extraSymbolsPermanent.push(action.color)
    log(
        state,
        `${sourceName}：${getCard(self.cardId).name}に${COLOR_LABELS[action.color]}のシンボル${action.count}個を追加した。`,
    )
    return
}


// BS12-055ゲッコ・グライダー『このブレイヴの召喚時』：このターンの間、このブレイヴといま合体している
// ホストはブロックされない。selfはブレイヴ自身のインスタンス（毎回いまのホストをshared/block.tsが引き直す）
const grantHostUnblockableThisTurnHandler: ActionHandler<"grantHostUnblockableThisTurn"> = (ctx) => {
    const { state, owner, self, sourceName } = ctx
    if (!self) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    recordTimed(state, { content: [{ type: "unblockable" }], target: { kind: "braveHost", braveInstanceId: self.instanceId }, until: "turn", ownerPid: owner })
    log(state, `${sourceName}：このターンの間、このブレイヴと合体しているスピリットはブロックされない。`)
}



const grantBlockerImmunityHandler: ActionHandler<"grantBlockerImmunity"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // フェザーバリア：ブロック中の自分スピリット優先、なければバトル中の自分、なければ先頭
        const mine = state.players[owner].field.spirits
        let target: CardInstance | null = null
        if (state.battle) {
            target =
                mine.find(
                    (s) =>
                        s.instanceId === state.battle?.blockerInstanceId ||
                        s.instanceId === state.battle?.attackerInstanceId,
                ) ?? null
        }
        if (!target) target = mine[0] ?? null
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        recordTimed(state, { content: [{ type: "immune" }], target: { kind: "instance", instanceId: target.instanceId }, until: "turn", ownerPid: owner })
        log(
            state,
            `${getCard(target.cardId).name}はこのターン、相手のカードの効果を受けない。`,
        )
        return
}

// 26系【激突】付与（飛兵コーンヒーロ『召喚時』／浮岩城塞『配置時』）: 自分のスピリット1体
// （filterで絞り込み）に、このターンの間キーワードを与える。候補0体なら不発。
// 発生源自身も候補に含む（原文に自己除外はなく、『召喚時』のコーンヒーロ自身も赤スピリット。
// 除外したい場合はデータレコードの filter.excludeSelf を使う。2026-10-08 レビュー修正）。
// 対話時は候補2体以上でプレイヤーが選ぶ（選択の再入は targetInstanceId で戻る）。
// 非対話・候補1体は自動選択（先頭＝最も場に出たのが古い個体）
const grantKeywordThisTurnHandler: ActionHandler<"grantKeywordThisTurn"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) {
        log(state, `${sourceName}：対象のスピリットがいなかった。`)
        return
    }
    const candidates = state.players[owner].field.spirits.filter(
        (s) => matchesTarget(state, owner, s, filter, self?.instanceId),
    )
    if (candidates.length === 0) {
        log(state, `${sourceName}：対象のスピリットがいなかった。`)
        return
    }
    if (
        targetInstanceId === undefined &&
        tryInteractiveTargetChoice(
            state,
            owner,
            self,
            `${sourceName}：【${KEYWORDS[action.keyword].label}】を与えるスピリットを選んでください`,
            candidates,
            action,
            null,
        )
    ) {
        return
    }
    const target =
        (targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : undefined) ??
        candidates[0]!
    recordTimed(state, {
        content: [{ type: "keyword", keyword: action.keyword }],
        target: { kind: "instance", instanceId: target.instanceId },
        until: "turn",
        ownerPid: owner,
    })
    log(
        state,
        `${getCard(target.cardId).name}は、このターンの間【${KEYWORDS[action.keyword].label}】を持つ。`,
    )
    return
}

const negateOwnBlockConstraintHandler: ActionHandler<"negateOwnBlockConstraint"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // バーストファイア：『ブロックできない』を受けている自分のスピリットが候補。
        // 誰の効果を消すかはプレイヤーが選ぶ（候補が無ければフィールド全体から選ぶ）
        const mine = state.players[owner].field.spirits
        const blocked = mine.filter((s) =>
            activeConstraints(state, owner, s).some(
                (c) => c.type === "cantBlock" || c.type === "cantBlockLowerBp",
            ),
        )
        const candidates = blocked.length > 0 ? blocked : mine
        if (
            targetInstanceId === undefined &&
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：『ブロックできない』効果を無効にするスピリットを選んでください`,
                candidates,
                action,
                null,
            )
        ) {
            return
        }
        // 非対話（テスト・AI）と候補1体のとき：『ブロックできない』持ちを優先、なければ先頭
        const target =
            (targetInstanceId !== undefined ? mine.find((s) => s.instanceId === targetInstanceId) : undefined) ??
            candidates[0] ??
            null
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        target.blockConstraintNegatedThisTurn = true
        log(
            state,
            `${getCard(target.cardId).name}の『ブロックできない』効果を無効にした。`,
        )
        return
}


const negateLifeDamageFromTargetHandler: ActionHandler<"negateLifeDamageFromTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // 「相手のスピリット1体を指定する」＝対話中は常に持ち主が選ぶ（非対話は従来どおり自動。2026-10-02 ユーザー確認）
        const filter = normalizeFilter(ctx, action)
        const pool = filter === SELF_REQUIRED ? [] : state.players[opp].field.spirits.filter((s) => matchesTarget(state, owner, s, filter, self?.instanceId))
        if (targetInstanceId === undefined && state.interactiveTargets && pool.length > 0) {
            requestChoice(
                state,
                owner,
                `${sourceName}：ライフを守る相手のスピリットを選んでください`,
                pool.map((s) => s.instanceId),
                false,
                action,
                self,
            )
            return
        }
        // ミストカーテン：対象の相手スピリットのアタックでは、このターン使用者のライフが減らない
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : (() => {
                  const t = action.filter === undefined ? pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType) : pool[0]
                  return t ? { pid: opp, inst: t } : null
              })()
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        recordTimed(state, { content: [action.cap !== undefined ? { type: "lifeCap", max: action.cap } : { type: "noLifeDamage" }], target: { kind: "instance", instanceId: found.inst.instanceId }, until: "turn", ownerPid: owner })
        log(
            state,
            action.cap !== undefined
                ? `${sourceName}：このターン、${state.players[owner].name}のライフは${getCard(found.inst.cardId).name}から${action.cap}しか減らされない。`
                : `${sourceName}：このターン、${getCard(found.inst.cardId).name}のアタックでは${state.players[owner].name}のライフは減らない。`,
        )
        return
}

// 「このターンの間」継続効果を貸す共通処理：仮想発生源を1つ積んで返す（積めなければ null）。
// grantFamilyChoiceAll（選択結果を載せる音鳥クルーク）も同じ器を使う。
// scope:"battle" のときだけ積む先が battleVirtualInstances に変わる（lendSelfThisBattle）。
// 積んだあとの扱い（effectSources に混ざる／isVirtualSource が "virtual-" で判定する）は共通
function pushVirtualSource(
    state: Parameters<ActionHandler<"lendSelfThisTurn">>[0]["state"],
    owner: Parameters<ActionHandler<"lendSelfThisTurn">>[0]["owner"],
    sourceCardId: string | undefined,
    scope: "turn" | "battle" = "turn",
): CardInstance | null {
    if (sourceCardId === undefined) {
        log(state, "効果：貸し出す発生源のカードIDが特定できなかった。")
        return null
    }
    const inst = createInstance(sourceCardId, state.turn, 0)
    inst.instanceId = `virtual-${inst.instanceId}`
    const player = state.players[owner]
    if (scope === "battle") player.battleVirtualInstances.push(inst)
    else player.turnVirtualInstances.push(inst)
    return inst
}

// マジックが「このターンの間」継続効果を貸す機構（TURN_EFFECT_SOURCES.md）。
// マジックのselfは常にnull（resolveMagicがself=nullで呼ぶ）ため、ctx.sourceCardIdを使うこと。
// ここでselfを参照すると（マジックの唯一の用途で）必ずno-opになる罠なので注意（§3.3）
const lendSelfThisTurnHandler: ActionHandler<"lendSelfThisTurn"> = (ctx) => {
    const { state, owner, sourceCardId } = ctx
    if (!pushVirtualSource(state, owner, sourceCardId)) return
    log(
        state,
        `${getCard(sourceCardId!).name}：このターンの間、自分の仮想発生源としてこの効果を貸し出した。`,
    )
}

// BS12-081メロディアスハープ：「スピリット1体は」＝どちらの陣営でもよい1体を選び、
// このターンの間その1体だけへ継続効果を貸す（colorChoiceLendThisTurnの「選ぶもの」を色でなく
// 対象インスタンスにした版。仮想発生源にlentChoiceInstanceIdを載せ、以後は
// kind:"vanillaAsGrant"/"spiritEffectsDisabledGrant"のtarget:"chosenInstance"がそれを読む）
const targetChoiceLendThisTurnHandler: ActionHandler<"targetChoiceLendThisTurn"> = (ctx, action) => {
    const { state, owner, sourceCardId, targetInstanceId } = ctx
    if (targetInstanceId === undefined) {
        const candidates = pickAnySideCandidates(state, owner, () => true)
        if (candidates.length === 0) {
            log(state, "効果：対象がいなかった。")
            return
        }
        if (state.interactiveTargets && candidates.length >= 2) {
            requestChoice(
                state,
                owner,
                "効果を与えるスピリットを選んでください",
                candidates.map((s) => s.instanceId),
                false,
                { type: "targetChoiceLendThisTurn", ...(sourceCardId !== undefined ? { sourceCardId } : {}) },
                null,
            )
            return
        }
        const found = pickAnySideByBp(state, owner, Infinity, () => true)
        if (!found) {
            log(state, "効果：対象がいなかった。")
            return
        }
        doTargetChoiceLendThisTurn(state, owner, sourceCardId, found.inst.instanceId)
        return
    }
    doTargetChoiceLendThisTurn(state, owner, sourceCardId, targetInstanceId)
}

function doTargetChoiceLendThisTurn(
    state: GameState,
    owner: PlayerId,
    sourceCardId: string | undefined,
    targetInstanceId: string,
): void {
    const virtual = pushVirtualSource(state, owner, sourceCardId)
    if (!virtual) return
    virtual.lentChoiceInstanceId = targetInstanceId
    const targetInst =
        state.players.p1.field.spirits.find((s) => s.instanceId === targetInstanceId) ??
        state.players.p2.field.spirits.find((s) => s.instanceId === targetInstanceId)
    log(
        state,
        `${getCard(sourceCardId!).name}：このターンの間、${targetInst ? getCard(targetInst.cardId).name : "対象"}へ効果を与えた。`,
    )
}

// 上の「このバトルの間」版（BS07ダーティフィスト／ニードルショット／ブルームフルート）。
// バトル外（メインステップ等）で使われた場合、貸与は直後の clearBattle まで残るが、
// これらのカードはいずれもフラッシュ限定なのでバトル中にしか撃てない
const lendSelfThisBattleHandler: ActionHandler<"lendSelfThisBattle"> = (ctx) => {
    const { state, owner, sourceCardId } = ctx
    const virtual = pushVirtualSource(state, owner, sourceCardId, "battle")
    if (!virtual) return
    // 同じマジックの直前の効果でBP増加した1体を写しておく（「そのスピリットが〜したとき」の限定に使う。
    // kind:"battleWon" の winnerIsLentBuffTarget が読む。BS07ニードルショット）
    if (state.lastBpBuffTargetId !== undefined) virtual.lentBuffTargetId = state.lastBpBuffTargetId
    log(
        state,
        `${getCard(sourceCardId!).name}：このバトルの間、自分の仮想発生源としてこの効果を貸し出した。`,
    )
}

// このバトルの間、相手はリザーブのコアを払わなければブロックできない（BS11-037 ヒポグリフィーLv2-3）
const requireCoreToBlockThisBattleHandler: ActionHandler<"requireCoreToBlockThisBattle"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中でないため何も起きなかった。`)
        return
    }
    // このバトルのアタッカーへのブロックに支払いを課す
    recordTimed(state, { content: [{ type: "blockCost", cost: "reserveCoreToTrash", count: action.count }], target: { kind: "instance", instanceId: state.battle.attackerInstanceId }, until: "battle", ownerPid: owner })
    log(
        state,
        `${sourceName}：${state.players[opp].name}はリザーブのコア${action.count}個をトラッシュに置かなければブロックできない。`,
    )
}





// BS03ゴーレムクラフト：自分のフィールドのコアが1個以上置かれているネクサスすべてを、
// このターンの間「コスト:1／系統:「造兵」／Lv1コスト:1／Lv1BP:2000／効果の記述なし」のスピリットとして扱う。
//
// **ネクサスをバトルに参加させる仕組みは作らない**。field.nexuses から field.spirits へ
// 同じインスタンスのまま移してしまえば、アタック・ブロック・BP比較・全体破壊・体数カウント・
// 対象選択といったスピリットの器（エンジン内で field.spirits を列挙している数百箇所）がそのまま効く。
// 別カードへの差し替えにしないのも同じ理由で、cardId が変わらないので
// 破壊時は destroySpirit がネクサスのカードをそのままトラッシュへ送る（追加実装が要らない）。
//
// カード側がステータスを全部明記しているため、上書きの中身は effects データから受け取る。
// 対象は解決時点のネクサスに固定される（このあと置かれたネクサスは変換されない）
const treatOwnNexusesAsSpiritsThisTurnHandler: ActionHandler<"treatOwnNexusesAsSpiritsThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const minCores = action.minCores ?? 1
    const targets = player.field.nexuses.filter((n) => n.cores >= minCores)
    if (targets.length === 0) {
        log(state, `${sourceName}：コアが${minCores}個以上置かれた自分のネクサスがなかった。`)
        return
    }
    for (const nexus of targets) {
        const index = player.field.nexuses.indexOf(nexus)
        player.field.nexuses.splice(index, 1)
        nexus.asSpiritThisTurn = {
            cost: action.cost,
            family: [...action.family],
            levels: action.levels.map((l) => ({ ...l })),
        }
        player.field.spirits.push(nexus)
    }
    const familyLabel = action.family.length > 0 ? `系統：「${action.family.join("・")}」の` : ""
    log(
        state,
        `${sourceName}：${player.name}のネクサス${targets.length}つ（${targets.map((n) => getCard(n.cardId).name).join("・")}）は、このターンの間${familyLabel}スピリットとして扱われる。`,
    )
    return
}

// 「自分のネクサス1つを、このステップ中スピリットとして扱う」（26RBS02-066/068/069/086。2026-10-11 ユーザー確認）。
// スピリット扱いの間のコスト・系統はネクサスカードのまま。Lv表は原文の「<コア>Lv BP」。置いたコアも元からあるコアもLvに数える。
// 戻すのはステップの終わり（PhaseManager.endStepScoped）。置く数は選べる（フィールド/リザーブの合計まで）
const nexusAsSpiritThisStepHandler: ActionHandler<"nexusAsSpiritThisStep"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId, chosenOption } = ctx
    const player = state.players[owner]
    let nexus: CardInstance | undefined
    if (action.chosenId !== undefined) nexus = player.field.nexuses.find((n) => n.instanceId === action.chosenId)
    else if (action.target === "self") nexus = self && player.field.nexuses.includes(self) ? self : undefined
    else {
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) return
        const open = player.field.nexuses.filter((n) => matchesTarget(state, owner, n, filter, self?.instanceId))
        if (targetInstanceId) nexus = open.find((n) => n.instanceId === targetInstanceId)
        else if ((open.length > 1 || (action.upTo && open.length > 0)) && state.interactiveTargets) {
            const prompt = `${sourceName}：スピリットとして扱うネクサスを選んでください`
            if (action.upTo) requestUpToChoice(state, owner, prompt, open.map((n) => n.instanceId), action, self)
            else requestChoice(state, owner, prompt, open.map((n) => n.instanceId), false, action, self)
            return
        } else nexus = open[0]
    }
    if (!nexus) {
        log(state, `${sourceName}：対象のネクサスがいなかった。`)
        return
    }
    if (action.placeCores) {
        const max = normalReserveOf(player) + player.field.spirits.reduce((k, sp) => k + sp.cores, 0)
        if (max <= 0) {
            log(state, `${sourceName}：置けるコアがなかった。`)
            return
        }
        let n = 1
        if (chosenOption !== undefined) n = Math.max(1, Math.min(max, Number(chosenOption) || 1))
        else if (state.interactiveTargets && max > 1) {
            requestChoice(state, owner, `${sourceName}：${getCard(nexus.cardId).name}に置くコアの数を選んでください`, [], false, { ...action, chosenId: nexus.instanceId }, self, "option", Array.from({ length: max }, (_, i) => String(i + 1)), undefined, true)
            return
        }
        // ponytail: どこから取るかは選ばせず、リザーブ優先→コアの多いスピリットから（payCoresFromFieldOrReserveToTrash と同じ方針）。取り元の選択UIが要るなら足す
        const fromReserve = Math.min(n, normalReserveOf(player))
        player.reserve -= fromReserve
        for (let rest = n - fromReserve; rest > 0; rest--) {
            const richest = player.field.spirits.filter((sp) => sp.cores > 0).reduce<CardInstance | undefined>((b, sp) => (b === undefined || sp.cores > b.cores ? sp : b), undefined)
            if (!richest) break
            richest.cores -= 1
            if (wouldDeplete(state, owner, richest)) destroySpirit(state, owner, richest.instanceId, "deplete")
        }
        placeCoresOnSpirit(state, nexus, n, owner)
        log(state, `${sourceName}：フィールド/リザーブのコア${n}個を${getCard(nexus.cardId).name}に置いた。`)
    }
    const card = getCard(nexus.cardId)
    player.field.nexuses.splice(player.field.nexuses.indexOf(nexus), 1)
    nexus.asSpiritThisTurn = { cost: card.cost, family: [...card.family], levels: action.levels.map((l) => ({ ...l })) }
    nexus.asSpiritAttackStepScoped = true
    if (action.until === "battle" && state.battle) nexus.asSpiritBattleScoped = true
    player.field.spirits.push(nexus)
    recordTargets(state, [nexus.instanceId])
    log(state, `${sourceName}：${card.name}は、${action.until === "battle" ? "このバトル中" : "このステップ中"}スピリットとして扱われる。`)
}

// 使ったマジックを効果発揮後に手札へ戻す（旧【光芒】と同じ戻し方。ただしバトル終了時ではなく、使用した直後）
const returnLastUsedMagicToHandHandler: ActionHandler<"returnLastUsedMagicToHand"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const used = state.lastMagicUsed
    const player = state.players[owner]
    if (handGainBlocked(state)) {
        log(state, `${sourceName}：効果によって手札が増やせないため、マジックはトラッシュに残った。`)
        return
    }
    const idx = used?.pid === owner ? player.trashCards.lastIndexOf(used.cardId) : -1
    if (!used || idx === -1) {
        log(state, `${sourceName}：手札に戻せるマジックがトラッシュになかった。`)
        return
    }
    player.trashCards.splice(idx, 1)
    player.hand.push(used.cardId)
    notifyHandGained(state, owner, 1)
    log(state, `${sourceName}：${getCard(used.cardId).name}をトラッシュから手札に戻した。`)
}

const handlers = {
    returnLastUsedMagicToHand: returnLastUsedMagicToHandHandler,
    nexusAsSpiritThisStep: nexusAsSpiritThisStepHandler,
    treatOwnNexusesAsSpiritsThisTurn: treatOwnNexusesAsSpiritsThisTurnHandler,
    grantKeywordToHandCard: grantKeywordToHandCardHandler,
    grantFamilyChoiceAll: grantFamilyChoiceAllHandler,
    levelOverrideOpponentNexuses: levelOverrideOpponentNexusesHandler,
    levelAsSelfThisBattle: levelAsSelfThisBattleHandler,
    addSymbolPermanent: addSymbolPermanentHandler,
    requireCoreToBlockThisBattle: requireCoreToBlockThisBattleHandler,
    grantBlockerImmunity: grantBlockerImmunityHandler,
    grantKeywordThisTurn: grantKeywordThisTurnHandler,
    negateOwnBlockConstraint: negateOwnBlockConstraintHandler,
    negateLifeDamageFromTarget: negateLifeDamageFromTargetHandler,
    lendSelfThisTurn: lendSelfThisTurnHandler,
    targetChoiceLendThisTurn: targetChoiceLendThisTurnHandler,
    lendSelfThisBattle: lendSelfThisBattleHandler,
    grantHostUnblockableThisTurn: grantHostUnblockableThisTurnHandler,
} satisfies Partial<ActionRegistry>

export default handlers
