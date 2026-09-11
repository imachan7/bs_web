// 効果の**流れ**を決めるだけのアクション（何かを破壊したりコアを動かしたりはしない）。
// いまは「〜する。**または**、〜する」の分岐だけが入っている。
import type { ActionHandler, ActionRegistry } from "./types"
import { createInstance, getCard, log, minLevelCores, opponentOf, resolveInOrder } from "../GameState"
import { fireNexusDeployed, fireSummonSequence, placeBurst, requestChoice, resolveTensho, tryInteractiveCardChoice } from "../EffectModules"
import { toAttackPhase } from "../PhaseManager"

// 効果文の「AするB。または、CするD。」。使用者がモードを1つ選び、その actions を順に解決する
// （SD01-033 ヴィクトリーファイア）。
//
// 選択肢は**常に全部出す**：ここに並ぶのは「〜することで」ではない普通の効果なので、
// 対象が足りなくても発揮でき、いる分だけ解決する（2026-08-16 ユーザー確認）。
// 「成立するモードだけ出す」にすると、モードごとに成立判定を書く必要が生まれるうえ、
// 実対戦では「1体しかいないがネクサスは壊したくない」のような選び方もできなくなる。
//
// interactiveTargets が無い（テスト・自動解決）ときは modes の先頭を選ぶ決定的簡略化。
// requestChoice の kind:"option" は候補1件でも自動選択しないため、
// 非対話の分岐はここで明示的に書く必要がある
const chooseActionModeHandler: ActionHandler<"chooseActionMode"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcColors, srcType, chosenOption } = ctx
        if (action.modes.length === 0) return
        const runMode = (index: number): void => {
            const mode = action.modes[index]
            if (!mode) return
            log(state, `${sourceName}：「${mode.label}」を選んだ。`)
            // 選択待ちに入ったら**残りを再開スタックへ積む**（resolveInOrder が面倒を見る）。
            // 積まずに break していたため、モードの後半が永久に失われていた
            // （ヴィクトリーファイアで「スピリット1体とネクサス1つ」を選ぶと、
            // スピリットの対象選択で中断してネクサスが壊れなかった。2026-08-17）
            resolveInOrder(state, mode.actions, {
                resolve: (a) => ctx.resolve(a, { sourceColors: srcColors, sourceType: srcType }),
                frame: (a) => ({
                    kind: "action" as const,
                    selfInstanceId: self ? self.instanceId : null,
                    action: a,
                    actorPid: owner,
                    ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
                    ...(srcType !== undefined ? { sourceType: srcType } : {}),
                }),
            })
        }
        // 選択の再入：選ばれたラベルからモードを引く
        if (chosenOption !== undefined) {
            const index = action.modes.findIndex((m) => m.label === chosenOption)
            runMode(index === -1 ? 0 : index)
            return
        }
        if (!state.interactiveTargets || action.modes.length === 1) {
            runMode(0)
            return
        }
        requestChoice(
            state,
            owner,
            `${sourceName}：どちらの効果にしますか`,
            [],
            false,
            action,
            self,
            "option",
            action.modes.map((m) => m.label),
        )
        return
}

// 器AK：発生源の持ち主から見た相手がいま自分のメインステップにいるなら、強制的にアタックステップへ進める
// （PhaseManager.toAttackPhase。相手がメインステップにいなければ何もしない＝BS13-067光導く巨塔Lv2）。
// who:"turnPlayer"（BS13-046/071青バッチ）は誰のターンかを問わず、メインステップにいれば終了させる
// （「お互い、マジックの効果を使用したとき」＝自分がマジックを使っても自分のメインステップが終わる）
const forceEndMainStepHandler: ActionHandler<"forceEndMainStep"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    if (state.phase !== "main") return
    if ((action.who ?? "opponent") === "opponent") {
        const opp = opponentOf(owner)
        if (state.turnPlayer !== opp) return
        log(state, `${sourceName}：${state.players[opp].name}のメインステップを終了させた。`)
    } else {
        log(state, `${sourceName}：${state.players[state.turnPlayer].name}のメインステップを終了させた。`)
    }
    toAttackPhase(state)
}

// バースト専用（docs/design/BURST.md）：発動中のバーストのカード自身をコストを支払わずに召喚する。
// スピリット/ネクサスのみ（マジックには書かない。validate:cardsが検査する）。
// **バースト発動の確認応答は self=null で解決される**ため、対象カードは state.players[owner].burst
// から読む（burst は承認された時点でもまだ非公開のまま残っている＝この関数がここで空にする）
const summonBurstCardFreeHandler: ActionHandler<"summonBurstCardFree"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.burst
    if (cardId === null) {
        log(state, `${sourceName}：発動中のバーストが見つからなかった。`)
        return
    }
    const card = getCard(cardId)
    if (card.type === "nexus") {
        player.burst = null
        player.burstSet = false
        const inst = createInstance(cardId, state.turn, 0)
        player.field.nexuses.push(inst)
        log(state, `${player.name}はバーストとして${card.name}を配置した。`)
        fireNexusDeployed(state, owner, inst)
        return
    }
    if (card.type !== "spirit") {
        log(state, `${sourceName}：このカードは召喚できない。`)
        return
    }
    const maintain = minLevelCores(card)
    if (player.reserve < maintain) {
        log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
        return
    }
    player.burst = null
    player.burstSet = false
    player.reserve -= maintain
    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    log(state, `${player.name}はバーストとして${card.name}を召喚した。`)
    if (!state.winner) resolveTensho(state, owner, inst)
    if (!state.winner) fireSummonSequence(state, owner, inst)
}

// バースト専用：自分の手札にあるバースト効果（kind:"burst"）を持つカード1枚をセットする。
// setBurst（GameAction）と異なりターン1回制限を受けない
const setBurstFromHandHandler: ActionHandler<"setBurstFromHand"> = (ctx) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        placeBurst(state, owner, cardId)
        return
    }
    const candidates = player.hand
        .map((cardId, i) => ({ cardId, i }))
        .filter(({ cardId }) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    if (candidates.length === 0) {
        log(state, `${sourceName}：セットできるバースト持ちのカードが手札になかった。`)
        return
    }
    if (
        tryInteractiveCardChoice(
            state,
            owner,
            self,
            `${sourceName}：セットするバーストを選んでください`,
            "hand",
            candidates.map((c) => c.i),
            { type: "setBurstFromHand" },
            null,
        )
    ) {
        return
    }
    // 非対話：コスト最大の1枚（決定的簡略化）
    let best = candidates[0]!
    for (const c of candidates) {
        if (getCard(c.cardId).cost > getCard(best.cardId).cost) best = c
    }
    player.hand.splice(best.i, 1)
    placeBurst(state, owner, best.cardId)
}

const handlers = {
    chooseActionMode: chooseActionModeHandler,
    forceEndMainStep: forceEndMainStepHandler,
    summonBurstCardFree: summonBurstCardFreeHandler,
    setBurstFromHand: setBurstFromHandHandler,
} satisfies Partial<ActionRegistry>

export default handlers
