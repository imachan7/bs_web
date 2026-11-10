// smoke パート888（BS04-039 宝石虫スカラベール Lv2：【神速】を持つ自分のスピリットが BP比べで破壊されたとき、
// 自分のフィールド/リザーブのコア1個をトラッシュに置くことで手札に戻る。
// 破壊される本人のコアも払える。ただし0個になると消滅の待機に変わって戻れないので、2個以上のときだけ（PENDING_STATE.md・2026-11-11 ユーザー確認）
import { assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const SCARABEL = "BS04-039"
const SOKU = "BS02-026" // マッハジー（効果は【神速】だけ）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(SCARABEL).name === "宝石虫スカラベール", "BS04-039 は宝石虫スカラベール")
assert(getCard(SOKU).name === "マッハジー", "BS02-026 はマッハジー")

function setup(seed: string, sokuCores: number) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 0
    const scarabel = createInstance(SCARABEL, s.turn, 3) // Lv2
    const soku = createInstance(SOKU, s.turn, sokuCores)
    s.players.p1.field.spirits.push(scarabel, soku)
    refreshLevelAsOverrides(s)
    // 相手のスピリットとBPを比べて破壊された
    destroySpirit(s, "p1", soku.instanceId, "destroy", { battle: { attackerLevel: 1, attackerBp: 9999, attackerColors: ["red"] }, battleLoser: true })
    return { s, scarabel, soku }
}

console.log("=== 本人のコアが2個：本人のコア1個を払って手札に戻る（スカラベールのコアは減らない） ===")
{
    const { s, scarabel } = setup("scarabel-self2", 2)
    assert(s.players.p1.hand.includes(SOKU), "マッハジーは手札に戻る")
    assert(scarabel.cores === 3, `スカラベールのコアは減らない（実際: ${scarabel.cores}）`)
    assert(s.players.p1.trashCores === 1, "トラッシュにコア1個")
    assert(s.players.p1.reserve === 1, "本人に残っていたコア1個はリザーブへ")
}

console.log("=== 本人のコアが1個：本人からは払えない（0個で消滅になる）のでスカラベールから払って戻る ===")
{
    const { s, scarabel } = setup("scarabel-self1", 1)
    assert(s.players.p1.hand.includes(SOKU), "マッハジーは手札に戻る")
    assert(scarabel.cores === 2, `スカラベールのコアから1個払う（実際: ${scarabel.cores}）`)
    assert(s.players.p1.trashCores === 1, "トラッシュにコア1個")
}

console.log("すべてのチェックに合格しました 🎉（part888）")
