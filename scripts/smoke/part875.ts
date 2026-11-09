// smoke パート875（絞り込み filter の keyword 軸は、ラベル付きのキーワードでも継続の付与を含める。2026-09-25 ユーザー決定「【X】を持つ」は効果で得たものを含む）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { matchesTarget } from "../../shared/rules/targetFilter"

const METEOR = "BS07-X25" // 龍星皇メテオヴルム（Lv2･Lv3『自分のアタックステップ』勇傑に【激突】を与える）
const ARK = "BS07-005" // 天槍の勇者アーク（勇傑・【激突】を持たない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(METEOR).name === "龍星皇メテオヴルム", "METEOR はメテオヴルム")
    assert(getCard(ARK).family.includes("勇傑") && !getCard(ARK).effects.some((e) => e.kind === "keyword"), "ARK は勇傑でキーワードを持たない")
}

function board(phase: "main" | "attack") {
    const s = createGame("filter-kw", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.phase = phase
    const ark = createInstance(ARK, 2, 1)
    s.players.p1.field.spirits.push(createInstance(METEOR, 2, 3), ark)
    refreshLevelAsOverrides(s)
    return { s, ark }
}

console.log("=== 1. メテオヴルム Lv2 が自分のアタックステップに与えた【激突】を、filter の keyword 軸が拾う ===")
{
    const { s, ark } = board("attack")
    assert(matchesTarget(s, "p1", ark, { keyword: "clash" }), "アタックステップでは、アークは【激突】を持つ")
}
console.log("=== 2. メインステップでは与えられていないので拾わない ===")
{
    const { s, ark } = board("main")
    assert(!matchesTarget(s, "p1", ark, { keyword: "clash" }), "メインステップでは、アークは【激突】を持たない")
}

console.log("すべてのチェックに合格しました 🎉（part875）")
