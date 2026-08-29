// smoke パート261（ブレイヴ入りのプリセットデッキ。2026-08-28）
//
// 2026-08-28 まで、DECK_RECIPES の11種すべてにブレイヴが1枚も入っておらず、
// デッキビルダーで自作しない限り対戦者はブレイヴを引けなかった。
// そこで brave_red を足したが、**ブレイヴを入れるだけでは遊べない**：
// 合体条件（効果を持たない／コストN以上）を満たすスピリットが同じデッキに居ないと、
// そのブレイヴは永久に合体できず、スピリット状態でしか場に出せない。
//
// ここで見るのは「レシピに入っている各ブレイヴが、同じレシピ内のスピリットに合体できるか」。
// 枚数と実在チェックは part2 の DECK_RECIPES ループが既に見ている（重複させない）。
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { DECK_RECIPES } from "../../data/constants"
import { matchesBraveCondition } from "../../shared/rules"

function base(): GameState {
    const s = createGame("deck-brave-check", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    return s
}

console.log("=== ブレイヴを含むレシピは、合体できるスピリットも同梱している ===")
{
    const s = base()
    let recipesWithBrave = 0
    for (const [name, recipe] of Object.entries(DECK_RECIPES)) {
        const ids = Object.keys(recipe.cards)
        const braves = ids.filter((id) => getCard(id).type === "brave")
        if (braves.length === 0) continue
        recipesWithBrave++
        const spirits = ids.filter((id) => getCard(id).type === "spirit")
        for (const braveId of braves) {
            // 同じレシピのスピリットを1体ずつ場に置いて、合体条件を満たすものがあるか調べる
            const found = spirits.some((spiritId) => {
                const card = getCard(spiritId)
                if (card.levels.length === 0) return false
                const host = createInstance(spiritId, s.turn, card.levels[0]!.cores)
                s.players.p1.field.spirits = [host]
                refreshLevelAsOverrides(s)
                return matchesBraveCondition(s, "p1", host, braveId)
            })
            assert(found, `${name}: ${getCard(braveId).name} は同じデッキのスピリットに合体できる`)
        }
    }
    assert(recipesWithBrave > 0, "ブレイヴを含むプリセットデッキが1つ以上ある（0だと対戦者がブレイヴを引けない）")
}

console.log("すべてのチェックに合格しました 🎉（part261）")
