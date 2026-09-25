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
    returnSpiritToHand,
    tryInteractiveTargetChoice,
} from "../EffectModules"
import { KEYWORDS, activeConstraints, cantActByTimedRule, effectiveBp, instBaseCost, instHasColor, instHasCost, instIsCombined, instIsVanilla, matchesFamilyFilter, matchesTarget, spiritHasFamily, spiritHasKeyword } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"
import { normalizeFilter, SELF_REQUIRED } from "./filter"

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
        // 皇帝アンプルール：costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。
        // 足りればその数のコアをリザーブからボイドへ送ってから、相手の全ネクサスの
        // levelOverrideThisTurn を level に設定する（このターンの間。ターン終了処理でリセット）
        if (action.costReserveToVoid !== undefined) {
            const player = state.players[owner]
            if (player.reserve < action.costReserveToVoid) {
                log(state, `${sourceName}：リザーブが足りず発動しなかった。`)
                return
            }
            // B（レベルを変える相手のネクサス）が無ければ発揮できない（COST_MODEL.md §1）。
            // 以前は払ってから相手のネクサスを見ていたため、いないときも払い損になっていた
            if (state.players[opp].field.nexuses.length === 0) {
                log(state, `${sourceName}：相手のネクサスがないため発動しなかった。`)
                return
            }
            player.reserve -= action.costReserveToVoid
            log(
                state,
                `${player.name}は${sourceName}の効果で、リザーブのコア${action.costReserveToVoid}個をボイドに置いた。`,
            )
        }
        const oppPlayer = state.players[opp]
        for (const nexus of oppPlayer.field.nexuses) {
            nexus.levelOverrideThisTurn = action.level
        }
        log(
            state,
            `${sourceName}：${oppPlayer.name}のネクサスすべてを、このターンの間Lv${action.level}として扱う。`,
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

const protectLifeByCostThisTurnHandler: ActionHandler<"protectLifeByCostThisTurn"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
        // BS07秘密の花園Lv2：「楽族」1体を疲労させることで、このターンの間、
        // コストmaxCost以下のスピリットのアタックでは**自分の**ライフが減らされない。
        // **誰を疲労させるかは候補2体以上ならプレイヤーが選ぶ**（COST_MODEL.md §2）
        if (action.costExhaustFamily !== undefined) {
            const candidates = state.players[owner].field.spirits.filter(
                (s) => !s.isRested && matchesFamilyFilter(state, owner, s, action.costExhaustFamily!),
            )
            if (candidates.length === 0) {
                log(state, `${sourceName}：疲労させられるスピリットがいなかった。`)
                return
            }
            const { costExhaustFamily: _paid, costSacrificeChosen: _flag, ...rest } = action
            if (action.costSacrificeChosen && targetInstanceId !== undefined) {
                const picked = candidates.find((s) => s.instanceId === targetInstanceId)
                if (!picked) {
                    log(state, `${sourceName}：指定されたスピリットはコストにできなかった。`)
                    return
                }
                exhaustSpirit(state, owner, picked)
                ctx.resolve(rest)
                return
            }
            if (state.interactiveTargets && candidates.length >= 2) {
                requestChoice(
                    state,
                    owner,
                    `${sourceName}：コストとして疲労させる自分のスピリットを選んでください`,
                    candidates.map((s) => s.instanceId),
                    false,
                    { ...action, costSacrificeChosen: true },
                    self,
                )
                return
            }
            // 非対話・候補1体：実効BP最小を自動選択（犠牲を最小化する決定的簡略化）
            const chosen = candidates.reduce((min, s) =>
                effectiveBp(state, owner, s) < effectiveBp(state, owner, min) ? s : min,
            )
            exhaustSpirit(state, owner, chosen)
        }
        state.turnConstraints.push({
            type: "noLifeDamageByCostForPid",
            pid: owner,
            ...(action.symbolCount !== undefined
                ? { symbolCount: action.symbolCount, ...(action.combinedOnly ? { combinedOnly: true as const } : {}) }
                : { maxCost: action.maxCost! }),
        })
        log(
            state,
            action.symbolCount !== undefined
                ? `${sourceName}：このターンの間、シンボル${action.symbolCount}つを持つ${action.combinedOnly ? "合体" : ""}スピリットのアタックでは${state.players[owner].name}のライフは減らされない。`
                : `${sourceName}：このターンの間、コスト${action.maxCost}以下のスピリットのアタックでは${state.players[owner].name}のライフは減らされない。`,
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
    state.turnConstraints.push({ type: "braveHostUnblockableThisTurn", pid: owner, braveInstanceId: self.instanceId })
    log(state, `${sourceName}：このターンの間、このブレイヴと合体しているスピリットはブロックされない。`)
}

// BS12-079 アブソリュートストライク専用（好きなだけ指定＋使用条件）。1体・すべては timedEffect の内容 mustAttack
const forceAttackThisTurnHandler: ActionHandler<"forceAttackThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    // **使用宣言の時点**で自分のフィールドにカード名にこの文字列を含むスピリットがいなければ不発（撃った後に場を離れても効果は継続する。2026-09-07 ユーザー確認）
    if (
        action.requireOwnNameIncludes !== undefined &&
        !action.choosing &&
        !state.players[owner].field.spirits.some((s) => getCard(s.cardId).name.includes(action.requireOwnNameIncludes!))
    ) {
        log(state, `${sourceName}：カード名に「${action.requireOwnNameIncludes}」と入っているスピリットがいないため使用できない。`)
        return
    }
    // トグル選択（budgetToggleDestroyと同型）
    const onField = (id: string): CardInstance | undefined => state.players[opp].field.spirits.find((sp) => sp.instanceId === id)
    let chosen = [...(action.chosenIds ?? [])]
    if (action.choosing && targetInstanceId !== undefined) {
        chosen = chosen.includes(targetInstanceId) ? chosen.filter((id) => id !== targetInstanceId) : [...chosen, targetInstanceId]
    }
    chosen = chosen.filter((id) => onField(id) !== undefined)
    if (state.interactiveTargets) {
        if (!(action.choosing && targetInstanceId === undefined)) {
            const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType)
            if (candidates.length > 0) {
                suspend(state, {
                    pid: owner,
                    kind: "target",
                    prompt: `${sourceName}：必ずアタックさせる相手のスピリットを選んでください（選んだものをもう一度押すと外れます）`,
                    candidates: candidates.map((sp) => sp.instanceId),
                    selectedIds: chosen,
                    skipLabel: chosen.length > 0 ? `これで確定する（${chosen.length}体）` : "指定しない",
                    optional: true,
                    resolveOnSkip: true,
                    action: { ...action, choosing: true as const, chosenIds: chosen },
                    selfInstanceId: self ? self.instanceId : null,
                })
                return
            }
        }
        if (chosen.length === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        for (const id of chosen) {
            const target = onField(id)
            if (!target) continue
            target.mustAttackThisTurn = true
            log(state, `${sourceName}：${getCard(target.cardId).name}は、このターンの間可能ならば必ずアタックする。`)
        }
        return
    }
    // 非対話：候補すべてに課す
    const candidates = pickEnemyCandidates(state, opp, Infinity, () => true, srcColors, srcType)
    if (candidates.length === 0) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    for (const target of candidates) target.mustAttackThisTurn = true
    log(state, `${sourceName}：${state.players[opp].name}のスピリットすべては、このターンの間可能ならば必ずアタックする。`)
}

const handReductionColorAsThisTurnHandler: ActionHandler<"handReductionColorAsThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        state.turnConstraints.push({
            type: "handReductionColorAsForPid",
            pid: owner,
            color: action.color,
            cardType: action.cardType,
        })
        log(
            state,
            `${sourceName}：このターンの間、${state.players[owner].name}の手札にある${action.cardType === "nexus" ? "ネクサス" : action.cardType}カードすべての軽減シンボルは${COLOR_LABELS[action.color]}として扱う。`,
        )
        return
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
        target.immuneToOpponentThisTurn = true
        log(
            state,
            `${getCard(target.cardId).name}はこのターン、相手のカードの効果を受けない。`,
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

const ignoreUnblockableThisTurnHandler: ActionHandler<"ignoreUnblockableThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // レッドウォール：このターンの間、自分のスピリットは「ブロックされない」効果を無視してブロックできる
        if (!state.ignoreUnblockableThisTurn.includes(owner)) {
            state.ignoreUnblockableThisTurn.push(owner)
        }
        log(state, `${sourceName}：このターンの間、${state.players[owner].name}のスピリットは「ブロックされない」効果を無視してブロックできる。`)
        return
}

const negateLifeDamageFromTargetHandler: ActionHandler<"negateLifeDamageFromTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // 器AN：costReturnSelfToHand指定時は、このスピリット自身を手札に戻すことがコスト
        // （COST_MODEL.md §1：対象になれる相手のスピリットが1体もいなければ不発）。BS13-027ムーンショウウオ。
        // costPaidは支払い済みの再入を示す内部専用フラグ（cards.jsonには書かない。costSacrificeChosenと同型）
        if (action.costReturnSelfToHand && !action.costPaid) {
            if (!self || state.players[opp].field.spirits.length === 0) {
                log(state, `${sourceName}：対象がいないため発動しなかった。`)
                return
            }
            returnSpiritToHand(state, owner, self, sourceName)
            if (state.winner) return
            // 呼び出し元が明示的にtargetInstanceIdを渡していた場合（誘発・テスト等）はそのまま引き継ぐ。
            // 渡していなければ後続のinteractiveTargets分岐でプレイヤーに選ばせる
            ctx.resolve({ ...action, costPaid: true }, targetInstanceId !== undefined ? { targetInstanceId } : undefined)
            return
        }
        // costReturnSelfToHand持ちは「相手のスピリット1体を指定する」＝プレイヤーが選ぶ（BS13-027）。
        // 既存のBS04ミストカーテン（costReturnSelfToHand無し）は従来どおり自動選択のまま変えない
        if (action.costReturnSelfToHand && targetInstanceId === undefined && state.interactiveTargets) {
            requestChoice(
                state,
                owner,
                `${sourceName}：ライフを守る相手のスピリットを選んでください`,
                state.players[opp].field.spirits.map((s) => s.instanceId),
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
                  const t = pickEnemyByBp(state, opp, Infinity, undefined, srcColors, srcType)
                  return t ? { pid: opp, inst: t } : null
              })()
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        found.inst.lifeDamageNegatedFor = owner
        log(
            state,
            `${sourceName}：このターン、${getCard(found.inst.cardId).name}のアタックでは${state.players[owner].name}のライフは減らない。`,
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

// BS06ヒナペンタン：「このスピリットを疲労させることで、このターンの間〜」。
// 疲労（任意コスト）と貸与（効果）を1つのアクションで行う。**分けてはいけない**：
// optional エントリを2つに割ると確認が2回になり、実際に「疲労だけして効果が出ない」状態になっていた
const exhaustSelfThenLendThisTurnHandler: ActionHandler<"exhaustSelfThenLendThisTurn"> = (ctx) => {
    const { state, owner, self, sourceName } = ctx
    if (!self) return
    if (self.isRested) {
        log(state, `${sourceName}：すでに疲労しているため発動できなかった。`)
        return
    }
    exhaustSpirit(state, owner, self)
    log(state, `${sourceName}：疲労することで効果を発動した。`)
    // 貸与は lendSelfThisTurn と同じ器（スピリット発生源なので self.cardId から引く）
    if (!pushVirtualSource(state, owner, self.cardId)) return
    log(state, `${sourceName}：このターンの間、自分の仮想発生源としてこの効果を貸し出した。`)
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

// スピリットイリュージョン：全色からの1色choiceを経て、選ばれた色を仮想発生源のlentChoiceColorに
// 載せてこのターンの間貸し出す（familyGrantのfamilyFromChoiceと同形。BS02-111）。
// マジックのselfは常にnullのため、pushVirtualSourceと同じ§3.3の罠を踏む：resolveChoice再開時に
// resolveActionのsourceCardId引数が渡されず失われるので、sourceCardIdをaction自身（第2段階の
// EffectAction）に載せて引き継ぐ（ctx.sourceCardIdではなくaction.sourceCardIdを読む）
// このバトルの間、相手はリザーブのコアを払わなければブロックできない（BS11-037 ヒポグリフィーLv2-3）
const requireCoreToBlockThisBattleHandler: ActionHandler<"requireCoreToBlockThisBattle"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
    if (!state.battle) {
        log(state, `${sourceName}：バトル中でないため何も起きなかった。`)
        return
    }
    state.battle.blockCostReserveToTrash = { pid: opp, count: action.count }
    log(
        state,
        `${sourceName}：${state.players[opp].name}はリザーブのコア${action.count}個をトラッシュに置かなければブロックできない。`,
    )
}

// 器BU：このターンの間、このスピリットがアタックしたとき、相手は手札のマジック1枚を破棄しなければ
// ブロックできない、という制約を発生源自身に付与する（kind:"triggered" trigger:"onSummon"専用）。
// requireCoreToBlockThisBattleと違い「このバトルだけ」でなく「このターンの以後の全アタック」に効くため、
// state.battleでなく自分自身（self）にターン番号を刻む。実際のブロック要求への橋渡しはGameEngine.doAttackが行う
// （self.blockRequiresMagicDiscardGrantedTurn === state.turn を見て state.battle.blockCostDiscardMagic を立てる）。
// BS13-047深海大帝ノーグ・デンス召喚時
const grantBlockRequiresMagicDiscardThisTurnHandler: ActionHandler<"grantBlockRequiresMagicDiscardThisTurn"> = (ctx) => {
    const { state, self, sourceName } = ctx
    if (!self) return
    self.blockRequiresMagicDiscardGrantedTurn = state.turn
    log(state, `${sourceName}：このターンの間、このスピリットがアタックしたとき、相手はマジック1枚を破棄しなければブロックできない。`)
}

// 色1色を指定し、このターンの間、発生源自身はその色のスピリットにブロックされたとき回復する
// （BS11-054 武槍鳥スピニード・ハヤト）。非対話は相手のフィールドに最も多い色を自動指定する
const refreshWhenBlockedByChosenColorThisTurnHandler: ActionHandler<"refreshWhenBlockedByChosenColorThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenOption } = ctx
    if (!self) return
    const allColors: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
    if (chosenOption === undefined) {
        if (state.interactiveTargets) {
            requestChoice(
                state,
                owner,
                `${sourceName}：指定する色を選んでください`,
                [],
                false,
                action,
                self,
                "option",
                allColors.map((c) => COLOR_LABELS[c]),
            )
            return
        }
        // 非対話：相手のフィールドに最も多い色（同数は定義順の先頭）を選ぶ
        const counts = allColors.map(
            (c) => [c, state.players[opp].field.spirits.filter((sp) => instHasColor(sp, c)).length] as const,
        )
        const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a))
        self.refreshOnBlockedByColorThisTurn = best[0]
        log(state, `${sourceName}：色「${COLOR_LABELS[best[0]]}」を指定した。（この色にブロックされたら回復する）`)
        return
    }
    const colorEntry = (Object.entries(COLOR_LABELS) as [Color, string][]).find(([, label]) => label === chosenOption)
    if (!colorEntry) return
    self.refreshOnBlockedByColorThisTurn = colorEntry[0]
    log(state, `${sourceName}：色「${chosenOption}」を指定した。（この色にブロックされたら回復する）`)
}

const colorChoiceLendThisTurnHandler: ActionHandler<"colorChoiceLendThisTurn"> = (ctx, action) => {
    const { state, owner, sourceCardId, chosenOption } = ctx
        if (chosenOption === undefined) {
            const allColors: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
            requestChoice(
                state,
                owner,
                "指定する色を選んでください",
                [],
                false,
                { type: "colorChoiceLendThisTurn", ...(sourceCardId !== undefined ? { sourceCardId } : {}) },
                null,
                "option",
                allColors.map((c) => COLOR_LABELS[c]),
            )
            return
        }
        const colorEntry = (Object.entries(COLOR_LABELS) as [Color, string][]).find(
            ([, label]) => label === chosenOption,
        )
        if (!colorEntry) return
        const [color] = colorEntry
        const cardId = action.sourceCardId
        const virtual = pushVirtualSource(state, owner, cardId)
        if (!virtual) return
        virtual.lentChoiceColor = color
        // 封印された魔導書Lv1：「対象を片側のみに変更する」を選んでいたら、その答えを仮想発生源に残す。
        // 継続効果はマジックの解決が終わった後もターン中ずっと生きるため、
        // 解決中しか生きない magicSideDecision ではなく**こちら側に写す**（2026-08-16 ユーザー確認）
        const keepPid = bothSidesRedirectKeepPid(state, "magic")
        if (keepPid !== null) virtual.lentKeepPid = keepPid
        const sideLabel = keepPid !== null ? `${state.players[keepPid].name}の` : ""
        log(
            state,
            `${getCard(cardId!).name}：このターンの間、色「${COLOR_LABELS[color]}」を指定した${sideLabel}色のスピリットすべてを、そのスピリットの持つ最高Lvとして扱う。`,
        )
        return
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

const handlers = {
    treatOwnNexusesAsSpiritsThisTurn: treatOwnNexusesAsSpiritsThisTurnHandler,
    grantKeywordToHandCard: grantKeywordToHandCardHandler,
    grantFamilyChoiceAll: grantFamilyChoiceAllHandler,
    levelOverrideOpponentNexuses: levelOverrideOpponentNexusesHandler,
    addSymbolPermanent: addSymbolPermanentHandler,
    requireCoreToBlockThisBattle: requireCoreToBlockThisBattleHandler,
    grantBlockRequiresMagicDiscardThisTurn: grantBlockRequiresMagicDiscardThisTurnHandler,
    refreshWhenBlockedByChosenColorThisTurn: refreshWhenBlockedByChosenColorThisTurnHandler,
    colorChoiceLendThisTurn: colorChoiceLendThisTurnHandler,
    protectLifeByCostThisTurn: protectLifeByCostThisTurnHandler,
    grantBlockerImmunity: grantBlockerImmunityHandler,
    negateOwnBlockConstraint: negateOwnBlockConstraintHandler,
    ignoreUnblockableThisTurn: ignoreUnblockableThisTurnHandler,
    negateLifeDamageFromTarget: negateLifeDamageFromTargetHandler,
    lendSelfThisTurn: lendSelfThisTurnHandler,
    targetChoiceLendThisTurn: targetChoiceLendThisTurnHandler,
    lendSelfThisBattle: lendSelfThisBattleHandler,
    exhaustSelfThenLendThisTurn: exhaustSelfThenLendThisTurnHandler,
    forceAttackThisTurn: forceAttackThisTurnHandler,
    grantHostUnblockableThisTurn: grantHostUnblockableThisTurnHandler,
    handReductionColorAsThisTurn: handReductionColorAsThisTurnHandler,
} satisfies Partial<ActionRegistry>

export default handlers
