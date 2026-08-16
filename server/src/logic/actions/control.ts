// 効果の**流れ**を決めるだけのアクション（何かを破壊したりコアを動かしたりはしない）。
// いまは「〜する。**または**、〜する」の分岐だけが入っている。
import type { ActionHandler, ActionRegistry } from "./types"
import { log } from "../GameState"
import { requestChoice } from "../EffectModules"

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
            for (const next of mode.actions) {
                ctx.resolve(next, { sourceColors: srcColors, sourceType: srcType })
                // 途中で選択待ちに入ったら、残りは再開されるまで進めない
                if (state.pendingChoice) break
            }
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

const handlers = {
    chooseActionMode: chooseActionModeHandler,
} satisfies Partial<ActionRegistry>

export default handlers
