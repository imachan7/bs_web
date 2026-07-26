// 付与系（キーワード／色／系統／レベル置換など）のアクションハンドラ（旧 resolveAction の switch から移設）。
// 本体は移設元と同一のロジックで、closure ローカルの参照だけを ctx からの分割代入に置き換えている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color } from "../../type"
import { currentLevel, findInstanceAnywhere, getCard, log } from "../GameState"
import {
    findSpiritAny,
    getAllFamilies,
    pickEnemyByBp,
    pickOwnKeywordTarget,
    requestCardChoice,
    requestChoice,
} from "../EffectModules"
import { KEYWORDS, activeConstraints, cantActByCost, effectiveBp, instHasColor, instHasCost, isVanillaCard, spiritHasFamily } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"

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

const grantKeywordAllHandler: ActionHandler<"grantKeywordAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // リフレクションアーマー：自分のスピリット全員（costFilter指定時はコスト一致のみ）に
        // このターンの間キーワードを付与する（grantKeywordの全体版）
        // vanillaFilter指定時は効果の記述を持たないスピリットのみ（BS05サーキュラーソー・アーム）
        const targets = state.players[owner].field.spirits.filter(
            (s) =>
                (action.costFilter === undefined || instHasCost(s, action.costFilter)) &&
                (!action.vanillaFilter || isVanillaCard(getCard(s.cardId))),
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
        // 手札の条件一致カード1枚に、このターンの間キーワードを付与する
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
                if (action.familyFilter !== undefined && !c.family.includes(action.familyFilter)) {
                    return false
                }
                return true
            })
        if (indices.length === 0) {
            log(state, `${sourceName}：対象の手札がなかった。`)
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

const grantColorAllHandler: ActionHandler<"grantColorAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // このターンの間、自分のスピリットすべてを指定色のスピリットとしても扱う（妖精ティングリー）
        for (const s of state.players[owner].field.spirits) {
            if (!s.tempColors.includes(action.color)) s.tempColors.push(action.color)
        }
        log(
            state,
            `${sourceName}：このターンの間、${state.players[owner].name}のスピリットすべてが${COLOR_LABELS[action.color]}のスピリットとしても扱われる。`,
        )
        return
}

const grantFamilyChoiceAllHandler: ActionHandler<"grantFamilyChoiceAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        if (!self) return
        const holders = state.players[owner].field.spirits.filter((s) =>
            spiritHasFamily(state, owner, s, action.targetFamily),
        )
        if (holders.length === 0) {
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
        for (const s of holders) {
            if (!s.tempFamilies.includes(chosenOption)) s.tempFamilies.push(chosenOption)
        }
        log(
            state,
            `${sourceName}：系統「${chosenOption}」を「${action.targetFamily}」持ちすべてに与えた（ターン終了時まで）。`,
        )
        return
}

const grantAlsoCostAllHandler: ActionHandler<"grantAlsoCostAll"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 道化師クラン：自分のスピリットすべてを、このターンの間コストaction.costのスピリットとしても扱う
        const targets = state.players[owner].field.spirits
        for (const t of targets) t.tempAlsoCosts.push(action.cost)
        log(
            state,
            `${state.players[owner].name}のスピリットすべては、このターンの間コスト${action.cost}のスピリットとしても扱われる。`,
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
        const found = targetInstanceId
            ? findSpiritAny(state, targetInstanceId)
            : (() => {
                  // 未指定時は自分のフィールドから条件を満たすスピリットを1体自動選択する（マッシブアップ）
                  const cand = state.players[owner].field.spirits.find(
                      (s) =>
                          (action.colorFilter === undefined || instHasColor(s, action.colorFilter)) &&
                          (!action.requireLevelExists ||
                              getCard(s.cardId).levels.some((l) => l.level === action.level)),
                  )
                  return cand ? { pid: owner, inst: cand } : null
              })()
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
        // 対象の自分スピリットのLvをこのターンの間1つ上として扱う（カードの最大Lvでキャップ。未指定時は自分の実効BP最大。ビルドアップ）
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

const addSymbolThisTurnHandler: ActionHandler<"addSymbolThisTurn"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        // 対象の自分スピリットのtempExtraSymbolsをこのターンの間+1する（未指定時は自分の実効BP最大。ダブルハート）
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
        // ヘビィゲート：このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可
        state.turnConstraints.push({ type: "cantActByCost", maxCost: action.maxCost })
        log(
            state,
            `${sourceName}：このターンの間、コスト${action.maxCost}以下のスピリットはアタックとブロックができない。`,
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
        // バーストファイア：cantBlock/cantBlockLowerBp を持つ自分スピリット優先、なければ先頭
        const mine = state.players[owner].field.spirits
        const target =
            mine.find((s) =>
                activeConstraints(state, owner, s).some(
                    (c) =>
                        c.type === "cantBlock" ||
                        c.type === "cantBlockLowerBp",
                ),
            ) ??
            mine[0] ??
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

const handlers = {
    grantKeyword: grantKeywordHandler,
    grantKeywordAll: grantKeywordAllHandler,
    grantKeywordToHandCard: grantKeywordToHandCardHandler,
    grantColorChoice: grantColorChoiceHandler,
    grantColorAll: grantColorAllHandler,
    grantFamilyChoiceAll: grantFamilyChoiceAllHandler,
    grantAlsoCostAll: grantAlsoCostAllHandler,
    levelOverrideOpponentNexuses: levelOverrideOpponentNexusesHandler,
    levelOverrideTarget: levelOverrideTargetHandler,
    levelUpThisTurn: levelUpThisTurnHandler,
    levelMaxAllOwnThisTurn: levelMaxAllOwnThisTurnHandler,
    addSymbolThisTurn: addSymbolThisTurnHandler,
    suppressTriggerThisTurn: suppressTriggerThisTurnHandler,
    banActByCostThisTurn: banActByCostThisTurnHandler,
    grantBlockerImmunity: grantBlockerImmunityHandler,
    negateOwnBlockConstraint: negateOwnBlockConstraintHandler,
    ignoreUnblockableThisTurn: ignoreUnblockableThisTurnHandler,
    negateLifeDamageFromTarget: negateLifeDamageFromTargetHandler,
} satisfies Partial<ActionRegistry>

export default handlers
