// smoke パート873（keywordGrant の【装甲】【重装甲】の付与先。装甲の色を組み直す側が uncombinedFilter・braveInSpiritState を読み落としていた）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const FORT = "BSC05-019" // 絶望壁の要塞（Lv2：スピリット状態のブレイヴに【装甲：赤/青】）
const GERONIMO = "BS18-031" // ジェロニモンド（Lv2：合体していないスピリットに【重装甲：赤/白】）
const BANBOOL = "BS19-071" // バンブール（緑ブレイヴ・合体条件コスト3以上）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FORT).name === "絶望壁の要塞" && getCard(FORT).type === "nexus", "FORT は絶望壁の要塞")
    assert(getCard(GERONIMO).name === "ジェロニモンド", "GERONIMO はジェロニモンド")
    assert(getCard(BANBOOL).name === "バンブール" && getCard(BANBOOL).type === "brave", "BANBOOL はブレイヴ")
    assert(getCard(HERA).name === "ヘラクレス・ジオ" && getCard(HERA).cost === 3, "HERA はコスト3")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    return s
}

console.log("=== 1. BSC05-019 Lv2：【装甲】はスピリット状態のブレイヴだけに付き、ふつうのスピリットには付かない ===")
{
    const s = game("fort-armor")
    s.players.p1.field.nexuses.push(createInstance(FORT, 2, 2))
    const brave = createInstance(BANBOOL, 2, 1)
    const spirit = createInstance(HERA, 2, 1)
    s.players.p1.field.spirits.push(brave, spirit)
    refreshLevelAsOverrides(s)
    assert((brave.armorColorsGranted ?? []).includes("red"), "スピリット状態のブレイヴは【装甲：赤】を持つ")
    assert((spirit.armorColorsGranted ?? []).length === 0, "ブレイヴでないスピリットは【装甲】を持たない")
}

console.log("=== 2. BS18-031 Lv2：【重装甲】は合体していないスピリットだけに付く ===")
{
    const s = game("geronimo-heavy")
    const geronimo = createInstance(GERONIMO, 2, 3)
    const host = createInstance(HERA, 2, 1)
    const solo = createInstance(HERA, 2, 1)
    const brave = createInstance(BANBOOL, 2, 0)
    s.players.p1.field.spirits.push(geronimo, host, solo, brave)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "バンブールをジオに合体できる")
    refreshLevelAsOverrides(s)
    assert((solo.heavyArmorColorsGranted ?? []).includes("red"), "合体していないスピリットは【重装甲：赤】を持つ")
    assert((host.heavyArmorColorsGranted ?? []).length === 0, "合体したスピリットは【重装甲】を持たない")
}

console.log("すべてのチェックに合格しました 🎉（part873）")
