// 付与系（キーワード／色／系統／レベル置換など）のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionCtx, ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, EffectAction } from "../../type"
import { createInstance, currentLevel, findInstanceAnywhere, getCard, log } from "../GameState"
import {
    bothSidesRedirectKeepPid,
    findSpiritAny,
    getAllFamilies,
    pickAnySideCandidates,
    pickEnemyByBp,
    pickEnemyCandidates,
    exhaustSpirit,
    pickOwnKeywordTarget,
    requestCardChoice,
    requestChoice,
    tryInteractiveTargetChoice,
} from "../EffectModules"
import { KEYWORDS, activeConstraints, cantActByCost, effectiveBp, instBaseCost, instHasColor, instHasCost, instIsCombined, instIsVanilla, matchesFamilyFilter, matchesTarget, spiritHasFamily } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"
import { normalizeFilter, SELF_REQUIRED } from "./filter"

const grantKeywordHandler: ActionHandler<"grantKeyword"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // スピリットリンク／インビンシブルシールド：自分のスピリット1体に一時的にキーワードを付与
        const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        target.tempKeywords.push({
            keyword: action.keyword,
            ...(action.colors ? { colors: action.colors } : {}),
        })
        log(
            state,
            `${getCard(target.cardId).name}に【${KEYWORDS[action.keyword].label}】を付与した。`,
        )
        return
}

// BS08グロウアップ：自分のスピリット1体のコストを、このターンの間 amount だけ増減する
// （対象選択はgrantKeywordと同型＝pickOwnKeywordTarget）。
// **増減であって追加ではない**ので、元のコストは残らない（+3したスピリットは
// 相手の「コスト3以下を破壊」にもう当たらない）。読み口は instCostDelta → instBaseCost の1本
const costBuffThisTurnHandler: ActionHandler<"costBuffThisTurn"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    if (
        targetInstanceId === undefined &&
        tryInteractiveTargetChoice(
            state,
            owner,
            self,
            `${sourceName}：コストを変えるスピリットを選んでください`,
            state.players[owner].field.spirits,
            action,
            null,
        )
    ) {
        return
    }
    const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
    if (!target) {
        log(state, `${sourceName}：対象のスピリットがいなかった。`)
        return
    }
    target.tempCostDelta = (target.tempCostDelta ?? 0) + action.amount
    log(
        state,
        `${getCard(target.cardId).name}は、このターンの間コスト${instBaseCost(target)}になる。（コスト${action.amount >= 0 ? "+" : ""}${action.amount}）`,
    )
    return
}

// BS08メテオストーム：カード名に「ヴルム」と入っている自分のスピリット1体に、このターンの間だけ
// 誘発効果を直接付与する（CardInstance.tempGrantedTriggers。fireTriggerが静的effectsと合成して読む）
const grantEffectToTargetThisTurnHandler: ActionHandler<"grantEffectToTargetThisTurn"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
        if (targetInstanceId !== undefined) {
            const target = state.players[owner].field.spirits.find((s) => s.instanceId === targetInstanceId)
            if (!target) {
                log(state, `${sourceName}：対象のスピリットがいなかった。`)
                return
            }
            target.tempGrantedTriggers = [
                ...(target.tempGrantedTriggers ?? []),
                { trigger: action.trigger, action: action.action, ...(action.battleRole ? { battleRole: action.battleRole } : {}) },
            ]
            log(state, `${getCard(target.cardId).name}に効果を付与した。`)
            return
        }
        const filter = normalizeFilter(ctx, action)
        if (filter === SELF_REQUIRED) {
            log(state, `${sourceName}：BP参照元がいなかった。`)
            return
        }
        const candidates = state.players[owner].field.spirits.filter((s) =>
            matchesTarget(state, owner, s, filter, self?.instanceId),
        )
        if (candidates.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        if (
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：効果を付与するスピリットを選んでください`,
                candidates,
                action,
                null,
            )
        ) {
            return
        }
        // 自動選択：実効BP最大の1体（決定的簡略化）
        const target = candidates.reduce((best, s) =>
            effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
        )
        target.tempGrantedTriggers = [
            ...(target.tempGrantedTriggers ?? []),
            { trigger: action.trigger, action: action.action, ...(action.battleRole ? { battleRole: action.battleRole } : {}) },
        ]
        log(state, `${getCard(target.cardId).name}に効果を付与した。`)
        return
}

const grantKeywordAllHandler: ActionHandler<"grantKeywordAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // リフレクションアーマー：自分のスピリット全員（costFilter指定時はコスト一致のみ）に
        // このターンの間キーワードを付与する（grantKeywordの全体版）
        // vanillaFilter指定時は効果の記述を持たないスピリットのみ（BS05サーキュラーソー・アーム）
        const targets = state.players[owner].field.spirits.filter(
            (s) =>
                (action.costFilter === undefined || instHasCost(s, action.costFilter)) &&
                (!action.vanillaFilter || instIsVanilla(s)),
        )
        if (targets.length === 0) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        for (const t of targets) {
            t.tempKeywords.push({
                keyword: action.keyword,
                ...(action.colors ? { colors: action.colors } : {}),
            })
        }
        log(
            state,
            `${state.players[owner].name}の${action.costFilter !== undefined ? `コスト${action.costFilter}の` : ""}${action.vanillaFilter ? "効果の記述を持たない" : ""}スピリットすべてに【${KEYWORDS[action.keyword].label}】を付与した。（${targets.length}体）`,
        )
        return
}

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

// BS07マクラーンスラッシュ：『ブロック時』効果を持つ自分のスピリット1体を指定し、
// このターンの間その効果を『アタック時』に発揮させる（ブロック時には発揮しなくなる＝移し替え）
const blockTriggersAsAttackTargetThisTurnHandler: ActionHandler<"blockTriggersAsAttackTargetThisTurn"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
        const hasBlockTrigger = (inst: CardInstance): boolean =>
            getCard(inst.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === "onBlock")
        const mine = state.players[owner].field.spirits.filter(hasBlockTrigger)
        if (
            targetInstanceId === undefined &&
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：『ブロック時』効果を『アタック時』に変えるスピリットを選んでください`,
                mine,
                action,
                null,
            )
        ) {
            return
        }
        const target = targetInstanceId
            ? mine.find((s) => s.instanceId === targetInstanceId)
            : // 未指定時は実効BP最大（プレイヤー選択の決定的簡略化）
              mine.reduce<CardInstance | undefined>(
                  (best, s) =>
                      !best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best) ? s : best,
                  undefined,
              )
        if (!target) {
            log(state, `${sourceName}：『ブロック時』効果を持つ自分のスピリットがいなかった。`)
            return
        }
        target.blockTriggersAsAttackThisTurn = true
        log(
            state,
            `${sourceName}：このターンの間、${getCard(target.cardId).name}の『ブロック時』効果は『アタック時』に発揮される。`,
        )
        return
}

const grantColorThisTurnHandler: ActionHandler<"grantColorThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName, targetInstanceId } = ctx
        // BS07メテオフォール：自分のスピリット1体を、このターンの間その色としても扱う（色は固定）。
        // 対象の選び方は grantKeyword と同じ（指定優先→バトル中→フィールド先頭）
        const target = pickOwnKeywordTarget(state, owner, targetInstanceId)
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        if (!target.tempColors.includes(action.color)) target.tempColors.push(action.color)
        log(
            state,
            `${getCard(target.cardId).name}に色「${COLOR_LABELS[action.color]}」が与えられた（ターン終了時まで）。`,
        )
        return
}

const grantColorChoiceHandler: ActionHandler<"grantColorChoice"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 第3段階を先に判定する：doResolveChoiceのoption応答はtargetInstanceIdを渡さず
        // （selfに退避済みの対象を積んでchosenOptionだけを渡す）resolveActionを呼ぶため、
        // 「targetInstanceId未指定なら第1段階」という判定を先にしてしまうと
        // 第3段階に到達できず第1段階の選択要求へ戻ってしまう。そのためchosenOptionの有無を最優先で見る。
        if (chosenOption !== undefined) {
            // 第3段階：選ばれた色を対象（第2段階でselfとして退避したもの）のtempColorsへ反映
            if (!self) return
            const colorEntry = (Object.entries(COLOR_LABELS) as [Color, string][]).find(
                ([, label]) => label === chosenOption,
            )
            if (!colorEntry) return
            const [color] = colorEntry
            if (!self.tempColors.includes(color)) self.tempColors.push(color)
            log(state, `${getCard(self.cardId).name}に色「${COLOR_LABELS[color]}」が与えられた（ターン終了時まで）。`)
            return
        }
        if (targetInstanceId === undefined) {
            // 第1段階：色を与える対象スピリットを選ぶ（両陣営のフィールド全体）
            const candidates = [
                ...state.players.p1.field.spirits,
                ...state.players.p2.field.spirits,
            ].map((s) => s.instanceId)
            requestChoice(state, owner, "色を与える対象のスピリットを選んでください", candidates, false, action, self)
            return
        }
        // 第2段階：色を選ぶ。対象のinstanceIdをselfとして退避し、次の選択（kind:"option"）へ引き継ぐ
        const target = findInstanceAnywhere(state, targetInstanceId)
        if (!target) return
        const allColors: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]
        requestChoice(
            state,
            owner,
            "与える色を選んでください",
            [],
            false,
            action,
            target,
            "option",
            allColors.map((c) => COLOR_LABELS[c]),
        )
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

const levelOverrideTargetHandler: ActionHandler<"levelOverrideTarget"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 花の子リップ：対象（targetInstanceId＝ブロックした相手スピリット）の
        // levelOverrideThisTurn を level に設定する（このターンの間。ターン終了処理でリセット）
        // 未指定時は自分のフィールドの候補から選ばせる（マッシブアップ）。
        // targetInstanceId が入っているのは誘発がイベント対象を渡してきた経路（花の子リップ）
        const ownCandidates = state.players[owner].field.spirits.filter(
            (s) =>
                (action.colorFilter === undefined || instHasColor(s, action.colorFilter)) &&
                (!action.requireLevelExists ||
                    getCard(s.cardId).levels.some((l) => l.level === action.level)),
        )
        if (
            targetInstanceId === undefined &&
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：Lv${action.level}として扱うスピリットを選んでください`,
                ownCandidates,
                action,
                null,
            )
        ) {
            return
        }
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : // 非対話（テスト・AI）と候補1体のときは先頭を自動選択（決定的簡略化）
              (ownCandidates[0] ? { pid: owner, inst: ownCandidates[0] } : null)
        if (!found) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        // 対象フィルタ（色・そのレベルをカードが持つか）を満たさない対象には効果がない
        if (action.colorFilter !== undefined && !instHasColor(found.inst, action.colorFilter)) {
            log(state, `${sourceName}：対象の色が条件と合わなかった。`)
            return
        }
        if (
            action.requireLevelExists &&
            !getCard(found.inst.cardId).levels.some((l) => l.level === action.level)
        ) {
            log(state, `${sourceName}：対象はLv${action.level}を持っていなかった。`)
            return
        }
        found.inst.levelOverrideThisTurn = action.level
        log(
            state,
            `${sourceName}：${getCard(found.inst.cardId).name}はこのターンの間Lv${action.level}として扱われる。`,
        )
        return
}

const levelUpThisTurnHandler: ActionHandler<"levelUpThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 対象スピリットのLvをこのターンの間1つ上として扱う（最大Lvでキャップ。anySide指定で両陣営から選べる。ビルドアップ）
        const picked = pickSingleTarget(ctx, action, `${sourceName}：Lvを上げるスピリットを選んでください`)
        if (picked === "pending") return
        const target = picked
        if (!target) {
            log(state, `${sourceName}：Lvを上げる対象がいなかった。`)
            return
        }
        const maxLevel = getCard(target.cardId).levels.reduce((max, lv) => Math.max(max, lv.level), 0)
        const nextLevel = Math.min(currentLevel(target).level + 1, maxLevel)
        target.levelOverrideThisTurn = nextLevel
        log(
            state,
            `${sourceName}：${getCard(target.cardId).name}のLvを、このターンの間${nextLevel}として扱う。`,
        )
        return
}

const levelMaxAllOwnThisTurnHandler: ActionHandler<"levelMaxAllOwnThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 自分のスピリットすべてを、各カードの最高Lvとして扱う（このターンの間。levelOverrideThisTurnはターン終了でリセット）
        const player = state.players[owner]
        let count = 0
        for (const s of player.field.spirits) {
            const maxLevel = getCard(s.cardId).levels.reduce((m, l) => Math.max(m, l.level), 1)
            s.levelOverrideThisTurn = maxLevel
            count++
        }
        log(state, `${sourceName}：このターンの間、自分のスピリット${count}体を最高Lvとして扱う。`)
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

const attackTriggersAsBlockThisTurnHandler: ActionHandler<"attackTriggersAsBlockThisTurn"> = (ctx) => {
    const { state, owner, sourceName, targetInstanceId } = ctx
        // ブレイブチャージ：自分のスピリット1体の『このスピリットのアタック時』効果を、このターンの間
        // 『このスピリットのブロック時』に発揮させる（未指定時は自分の実効BP最大。addSymbolThisTurn と同じ選び方）
        const target = targetInstanceId
            ? state.players[owner].field.spirits.find((s) => s.instanceId === targetInstanceId)
            : state.players[owner].field.spirits.reduce<CardInstance | undefined>(
                  (best, s) =>
                      !best || effectiveBp(state, owner, s) > effectiveBp(state, owner, best)
                          ? s
                          : best,
                  undefined,
              )
        if (!target) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        target.attackTriggersAsBlockThisTurn = true
        log(
            state,
            `${getCard(target.cardId).name}の『アタック時』効果は、このターンの間『ブロック時』に発揮される。`,
        )
        return
}

const blockTriggersAsAttackAllThisTurnHandler: ActionHandler<"blockTriggersAsAttackAllThisTurn"> = (ctx) => {
    const { state, sourceName } = ctx
        // アタックシフト：このターンの間、両陣営スピリットすべての『ブロック時』効果を『アタック時』に移す
        // （ブロック時には発揮されなくなる＝移し替え。fireTriggerが state.blockTriggersAsAttackThisTurn を参照）
        state.blockTriggersAsAttackThisTurn = true
        log(
            state,
            `${sourceName}：このターンの間、『このスピリットのブロック時』効果はすべて『このスピリットのアタック時』に発揮される。`,
        )
        return
}

const addSymbolThisTurnHandler: ActionHandler<"addSymbolThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 対象スピリットのtempExtraSymbolsをこのターンの間+1する（anySide指定で両陣営から選べる。ダブルハート）
        const picked = pickSingleTarget(ctx, action, `${sourceName}：シンボルを追加するスピリットを選んでください`)
        if (picked === "pending") return
        const target = picked
        if (!target) {
            log(state, `${sourceName}：シンボルを追加する対象がいなかった。`)
            return
        }
        target.tempExtraSymbols = (target.tempExtraSymbols ?? 0) + 1
        log(
            state,
            `${sourceName}：${getCard(target.cardId).name}に、このターンの間シンボル1つを追加した。`,
        )
        return
}

const suppressTriggerThisTurnHandler: ActionHandler<"suppressTriggerThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ユーサネイジア：このターンの間、相手のスピリットの指定トリガーを発揮させない
        const already = state.triggerSuppressionThisTurn.some(
            (e) => e.pid === opp && e.trigger === action.trigger,
        )
        if (!already) state.triggerSuppressionThisTurn.push({ pid: opp, trigger: action.trigger })
        log(state, `${sourceName}：このターンの間、${state.players[opp].name}のスピリットの誘発効果は発揮されない。`)
        return
}

const banActByCostThisTurnHandler: ActionHandler<"banActByCostThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // ヘビィゲート：このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可。
        // side:"opponent" / nonVanillaOnly で対象を絞れる（BS11-082 ウィッグバインド）
        state.turnConstraints.push({
            type: "cantActByCost",
            ...(action.maxCost !== undefined ? { maxCost: action.maxCost } : {}),
            ...(action.costs !== undefined ? { costs: action.costs } : {}),
            ...(action.blockOnly ? { blockOnly: true as const } : {}),
            ...(action.side === "opponent" ? { pid: opp } : {}),
            ...(action.nonVanillaOnly ? { nonVanillaOnly: true as const } : {}),
        })
        const who = action.side === "opponent" ? `${state.players[opp].name}の` : ""
        const what = action.nonVanillaOnly ? "効果の記述を持つスピリット" : "スピリット"
        const cost = action.costs !== undefined
            ? `コスト${action.costs.join("/")}の`
            : action.maxCost !== undefined
              ? `コスト${action.maxCost}以下の`
              : ""
        const verb = action.blockOnly ? "ブロックができない" : "アタックとブロックができない"
        log(state, `${sourceName}：このターンの間、${cost}${who}${what}は${verb}。`)
        return
}

// このターンの間、指定側は手札のカードを使えない（BS11-082 ウィッグバインド＝「相手は黄以外の手札のカードを使えない」）
const banHandCardsThisTurnHandler: ActionHandler<"banHandCardsThisTurn"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
    state.turnConstraints.push({
        type: "cantUseHandCardsForPid",
        pid: opp,
        ...(action.allowedColor !== undefined ? { allowedColor: action.allowedColor } : {}),
    })
    log(
        state,
        action.allowedColor !== undefined
            ? `${sourceName}：このターンの間、${state.players[opp].name}は${COLOR_LABELS[action.allowedColor]}以外の手札のカードを使えない。`
            : `${sourceName}：このターンの間、${state.players[opp].name}は手札のカードを使えない。`,
    )
}

// このターンの間、持ち主のスピリットの【装甲】を働かなくする（SD01-040 アーマーパージ）。
// 「【装甲】をないものとして扱い、**新たに得ることもない**」＝ すでに持っている分も、
// このターンに付与された分もまとめて落とす。判定の入口（boardResistanceAgainst）で一括して無視する
const disableOwnArmorThisTurnHandler: ActionHandler<"disableOwnArmorThisTurn"> = (ctx, action) => {
    const { state, owner, opp, sourceName } = ctx
    // side:"opponent"（BS11-049 ジャンビ・オレピス）＝相手のスピリットの【装甲】を落とす
    const pid = action.side === "opponent" ? opp : owner
    state.turnConstraints.push({ type: "armorDisabledForPid", pid })
    log(state, `${sourceName}：このターンの間、${state.players[pid].name}のスピリットの【装甲】は働かない。`)
}

// このターンの間、持ち主のライフが1回のアタックで減る量に**上限**を設ける（SD01-039 ブリザードウォール）。
// 「減るか／減らないか」ではなく**値**で持つので、今後の同種の効果（〇しか減らない）もここに集まる
const capLifeDamageThisTurnHandler: ActionHandler<"capLifeDamageThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    state.turnConstraints.push({ type: "lifeDamageMaxForPid", max: action.max, pid: owner })
    log(
        state,
        `${sourceName}：このターンの間、${state.players[owner].name}のライフは1回のアタックで${action.max}しか減らない。`,
    )
}

// このターンの間、持ち主のライフはあらゆる原因（アタック・lifeCrushアクション）で減らない
// （capLifeDamageThisTurnのmax:0はアタック限定なので届かない。BS10-093時刻む花時計）
const lifeImmuneThisTurnHandler: ActionHandler<"lifeImmuneThisTurn"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    state.turnConstraints.push({ type: "lifeImmuneForPid", pid: owner })
    log(state, `${sourceName}：このターンの間、${state.players[owner].name}のライフは減らない。`)
}

// このターンの間、持ち主のライフが指定の下限を下回らないようにする（BS11-080 デルタバリア）。
// 「減らない」（lifeImmuneThisTurn）とは別物で、**下限まではふつうに減る**
const lifeFloorThisTurnHandler: ActionHandler<"lifeFloorThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    state.turnConstraints.push({
        type: "lifeFloorForPid",
        pid: owner,
        floor: action.floor,
        ...(action.byAttackMinCost !== undefined ? { byAttackMinCost: action.byAttackMinCost } : {}),
        ...(action.byEffectSourceTypes !== undefined ? { byEffectSourceTypes: action.byEffectSourceTypes } : {}),
    })
    log(state, `${sourceName}：このターンの間、${state.players[owner].name}のライフは${action.floor}を下回らない。`)
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
            maxCost: action.maxCost,
            pid: owner,
        })
        log(
            state,
            `${sourceName}：このターンの間、コスト${action.maxCost}以下のスピリットのアタックでは${state.players[owner].name}のライフは減らされない。`,
        )
        return
}

const forceAttackThisTurnHandler: ActionHandler<"forceAttackThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
        // maxCost指定時：コスト条件を満たす相手スピリットすべてに一括で課す（BS08アンブッシュブロッカー）
        if (action.maxCost !== undefined) {
            state.turnConstraints.push({ type: "mustAttackByCost", pid: opp, maxCost: action.maxCost })
            log(
                state,
                `${sourceName}：このターンの間、${state.players[opp].name}のコスト${action.maxCost}以下のスピリットは可能ならば必ずアタックする。`,
            )
            return
        }
        // 対象指定時：その1体に課す（targetInstanceId優先→interactiveTargets時はpendingChoice→自動時は実効BP最大。BS08獣機合神セイ・ドリガン）
        if (targetInstanceId) {
            const found = findSpiritAny(state, targetInstanceId)
            if (!found || found.pid !== opp) {
                log(state, `${sourceName}：対象がいなかった。`)
                return
            }
            state.turnConstraints.push({ type: "mustAttackByInstance", pid: opp, instanceId: found.inst.instanceId })
            log(
                state,
                `${sourceName}：${getCard(found.inst.cardId).name}は、このターンの間可能ならば必ずアタックする。`,
            )
            return
        }
        const count = action.count ?? 1
        const combinedOk = (s: CardInstance) => !action.excludeCombined || !instIsCombined(s)
        const candidates = pickEnemyCandidates(state, opp, Infinity, combinedOk, srcColors, srcType)
        if (
            tryInteractiveTargetChoice(
                state,
                owner,
                self,
                `${sourceName}：必ずアタックさせる相手のスピリットを選んでください`,
                candidates,
                action,
                count > 1 ? { ...action, count: count - 1 } : null,
            )
        ) {
            return
        }
        const chosenIds = new Set<string>()
        let marked = 0
        for (let i = 0; i < count; i++) {
            const target = pickEnemyByBp(
                state,
                opp,
                Infinity,
                (s) => !chosenIds.has(s.instanceId) && combinedOk(s),
                srcColors,
                srcType,
            )
            if (!target) break
            chosenIds.add(target.instanceId)
            state.turnConstraints.push({ type: "mustAttackByInstance", pid: opp, instanceId: target.instanceId })
            log(
                state,
                `${sourceName}：${getCard(target.cardId).name}は、このターンの間可能ならば必ずアタックする。`,
            )
            marked++
        }
        if (marked === 0) {
            log(state, `${sourceName}：対象がいなかった。`)
        }
        return
}

const grantCanBlockWhileRestedThisTurnHandler: ActionHandler<"grantCanBlockWhileRestedThisTurn"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
        state.turnConstraints.push({
            type: "canBlockWhileRestedThisTurn",
            pid: owner,
            ...(action.familyFilter !== undefined ? { familyFilter: action.familyFilter } : {}),
        })
        const familyLabel = action.familyFilter
            ? `系統：「${(Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]).join("」/「")}」を持つ`
            : ""
        log(
            state,
            `${sourceName}：このターンの間、${state.players[owner].name}の${familyLabel}スピリットすべては疲労状態でもブロックできる。`,
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
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
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
    grantKeyword: grantKeywordHandler,
    grantEffectToTargetThisTurn: grantEffectToTargetThisTurnHandler,
    grantKeywordAll: grantKeywordAllHandler,
    grantKeywordToHandCard: grantKeywordToHandCardHandler,
    grantColorChoice: grantColorChoiceHandler,
    grantColorThisTurn: grantColorThisTurnHandler,
    blockTriggersAsAttackTargetThisTurn: blockTriggersAsAttackTargetThisTurnHandler,
    grantFamilyChoiceAll: grantFamilyChoiceAllHandler,
    levelOverrideOpponentNexuses: levelOverrideOpponentNexusesHandler,
    levelOverrideTarget: levelOverrideTargetHandler,
    levelUpThisTurn: levelUpThisTurnHandler,
    levelMaxAllOwnThisTurn: levelMaxAllOwnThisTurnHandler,
    addSymbolThisTurn: addSymbolThisTurnHandler,
    attackTriggersAsBlockThisTurn: attackTriggersAsBlockThisTurnHandler,
    blockTriggersAsAttackAllThisTurn: blockTriggersAsAttackAllThisTurnHandler,
    colorChoiceLendThisTurn: colorChoiceLendThisTurnHandler,
    suppressTriggerThisTurn: suppressTriggerThisTurnHandler,
    banActByCostThisTurn: banActByCostThisTurnHandler,
    banHandCardsThisTurn: banHandCardsThisTurnHandler,
    capLifeDamageThisTurn: capLifeDamageThisTurnHandler,
    lifeImmuneThisTurn: lifeImmuneThisTurnHandler,
    lifeFloorThisTurn: lifeFloorThisTurnHandler,
    disableOwnArmorThisTurn: disableOwnArmorThisTurnHandler,
    protectLifeByCostThisTurn: protectLifeByCostThisTurnHandler,
    grantBlockerImmunity: grantBlockerImmunityHandler,
    negateOwnBlockConstraint: negateOwnBlockConstraintHandler,
    ignoreUnblockableThisTurn: ignoreUnblockableThisTurnHandler,
    negateLifeDamageFromTarget: negateLifeDamageFromTargetHandler,
    lendSelfThisTurn: lendSelfThisTurnHandler,
    lendSelfThisBattle: lendSelfThisBattleHandler,
    exhaustSelfThenLendThisTurn: exhaustSelfThenLendThisTurnHandler,
    forceAttackThisTurn: forceAttackThisTurnHandler,
    grantCanBlockWhileRestedThisTurn: grantCanBlockWhileRestedThisTurnHandler,
    costBuffThisTurn: costBuffThisTurnHandler,
} satisfies Partial<ActionRegistry>

export default handlers
