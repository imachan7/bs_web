// 効果の**流れ**を決めるだけのアクション（何かを破壊したりコアを動かしたりはしない）。
// いまは「〜する。**または**、〜する」の分岐だけが入っている。
import type { ActionHandler, ActionRegistry } from "./types"
import { log, opponentOf, resolveInOrder } from "../GameState"
import { requestChoice } from "../EffectModules"
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
// （PhaseManager.toAttackPhase。相手がメインステップにいなければ何もしない＝BS13-067光導く巨塔Lv2）
const forceEndMainStepHandler: ActionHandler<"forceEndMainStep"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const opp = opponentOf(owner)
    if (state.turnPlayer !== opp || state.phase !== "main") return
    log(state, `${sourceName}：${state.players[opp].name}のメインステップを終了させた。`)
    toAttackPhase(state)
}

const handlers = {
    chooseActionMode: chooseActionModeHandler,
    forceEndMainStep: forceEndMainStepHandler,
} satisfies Partial<ActionRegistry>

export default handlers
