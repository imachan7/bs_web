// smoke パート876（BS23-X01「このカードは【強化】を持つものとして扱う」は場の外だけ。場では Lv3 の付与でだけ持つ＝Q4582・Q4583）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import { spiritHasKeyword } from "../../shared/rules/keywordState"

const X01 = "BS23-X01" // 龍輝神シャイニング・ドラゴン・オーバーレイ（赤）
const MAGICAL = "SD15-008" // マジカルドロー（1枚ドロー→5枚オープンし【強化】を持つスピリットカードを手札へ）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X01).name === "龍輝神シャイニング・ドラゴン・オーバーレイ", "X01 は龍輝神")
    assert(getCard(MAGICAL).name === "マジカルドロー" && getCard(MAGICAL).type === "magic", "MAGICAL はマジカルドロー")
}

function game() {
    const s = createGame("x01-kyoka", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    return s
}

console.log("=== 1. デッキの X01 は【強化】を持つスピリットカードとして、マジカルドローで手札に加わる ===")
{
    const s = game()
    s.players.p1.hand = []
    s.players.p1.deck = [VANILLA, X01, VANILLA, VANILLA, VANILLA, VANILLA, ...Array.from({ length: 10 }, () => VANILLA)]
    const src = createInstance(VANILLA, s.turn, 1)
    resolveAction(s, "p1", src, getCard(MAGICAL).effects.find((e) => e.kind === "magic")!.action)
    assert(s.players.p1.hand.filter((c) => c === X01).length === 1, "オープンした X01 は手札に加わる")
}

console.log("=== 2. 場の X01 は Lv1 では【強化】を持たず、Lv3 では持つ ===")
{
    const s = game()
    const lv1 = createInstance(X01, s.turn - 1, 1)
    s.players.p1.field.spirits.push(lv1)
    refreshLevelAsOverrides(s)
    assert(!spiritHasKeyword(s, "p1", lv1, "kyoka"), "Lv1 の X01 は【強化】を持たない")
    lv1.cores = 4
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", lv1, "kyoka"), "Lv3 の X01 は【強化】を持つ（自身への付与）")
}

console.log("すべてのチェックに合格しました 🎉（part876）")
