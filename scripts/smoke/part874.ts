// smoke パート874（色の絞り込みは合体スピリットの合成後の色で見る。instHasColor に合体中のブレイヴの色を含めた。BRAVE §12.2）
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const CASTLE = "BS01-102" // 主無き古城（自分の紫のスピリットすべてを BP+1000）
const SITRI = "BS21-057" // 冥獣騎シトリー（紫ブレイヴ・合体条件コスト3以上）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CASTLE).name === "主無き古城" && getCard(CASTLE).type === "nexus", "CASTLE は主無き古城")
    assert(getCard(SITRI).type === "brave" && getCard(SITRI).colors.join() === "purple", "SITRI は紫のブレイヴ")
    assert(getCard(HERA).colors.join() === "green" && getCard(HERA).cost === 3, "HERA は緑・コスト3")
}

function game(withCastle: boolean): { s: GameState; host: ReturnType<typeof createInstance>; solo: ReturnType<typeof createInstance> } {
    const s = createGame("grant-color", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    if (withCastle) s.players.p1.field.nexuses.push(createInstance(CASTLE, 2, 0))
    const host = createInstance(HERA, 2, 1)
    const solo = createInstance(HERA, 2, 1)
    const brave = createInstance(SITRI, 2, 0)
    s.players.p1.field.spirits.push(host, solo, brave)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "シトリーをジオに合体できる")
    refreshLevelAsOverrides(s)
    return { s, host, solo }
}

console.log("=== 1. 緑のスピリットに紫のブレイヴが合体すると、紫のスピリットとして BP+1000 を受ける／単体の緑は受けない ===")
{
    const a = game(false)
    const b = game(true)
    assert(effectiveBp(b.s, "p1", b.host) - effectiveBp(a.s, "p1", a.host) === 1000, "合体スピリットは主無き古城で BP+1000")
    assert(effectiveBp(b.s, "p1", b.solo) === effectiveBp(a.s, "p1", a.solo), "合体していない緑のスピリットは BP が変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part874）")
