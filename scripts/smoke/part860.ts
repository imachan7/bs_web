// smoke パート860（召喚時効果を止める範囲の限定・ミゴーの破壊を召喚コストの支払いより先にする。2026-11-08 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { summonFreeFromTrashIndex } from "../../server/src/logic/EffectModules"
import { scenario } from "./scenario"

const SHOOTING = "BS23-005" // 流星の剣聖シューティングスター（トラッシュから戻る）
const ARK = "BS21-X01" // 光輝龍皇シャイニング・ドラゴン・アーク（コスト7・召喚時効果なし）
const ORION = "BS10-060" // 巨人猟兵オライオン（コスト7・召喚時：相手のデッキ12枚破棄）
const HARBIG = "BS21-004" // ハービッグ・ワイバーン（Lv2：コスト5以上が召喚されたとき1ドロー）
const MIGO = "BS23-047"
const LUXION = "BS21-X06"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SHOOTING).name === "流星の剣聖シューティングスター", "SHOOTING")
    assert(getCard(ARK).name.includes("シャイニング・ドラゴン") && getCard(ARK).cost === 7, "ARK")
    assert(getCard(ORION).name === "巨人猟兵オライオン" && getCard(ORION).cost === 7, "ORION")
    assert(getCard(HARBIG).name === "ハービッグ・ワイバーン", "HARBIG")
    assert(getCard(MIGO).name === "ミゴー" && getCard(LUXION).cost === 8, "MIGO / LUXION")
}

function game(trash: string[]): GameState {
    const s = createGame("p860", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.trashCards = trash
    s.players.p2.deck = Array.from({ length: 40 }, () => "BS01-002")
    return s
}

console.log("=== 1. 召喚時効果を止める召喚：トラッシュのカードの戻りと場の「召喚されたとき」は出る ===")
{
    const s = game([SHOOTING, ARK])
    const harbig = createInstance(HARBIG, s.turn, 3)
    s.players.p1.field.spirits.push(harbig)
    refreshLevelAsOverrides(s)
    const hand0 = s.players.p1.hand.length
    summonFreeFromTrashIndex(s, "p1", "テスト", 1, { skipOnSummon: true })
    assert(s.players.p1.field.spirits.some((x) => x.cardId === ARK), "アークが召喚された")
    assert(s.players.p1.hand.includes(SHOOTING), "(a) シャイニング・ドラゴンの召喚でトラッシュのシューティングスターが手札に戻る")
    assert(s.players.p1.hand.length === hand0 + 2, "(c) 場のハービッグの「召喚されたとき」で1枚引く（戻り1＋ドロー1）")
}

console.log("=== 2. 召喚されたスピリット自身の召喚時効果は出ない（対照：skipOnSummon なしでは出る） ===")
for (const skip of [true, false]) {
    const s = game([ORION])
    summonFreeFromTrashIndex(s, "p1", "テスト", 0, skip ? { skipOnSummon: true } : undefined)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === ORION), "オライオンが召喚された")
    assert(s.players.p2.deck.length === (skip ? 40 : 28), skip ? "(b) 自身の召喚時効果は出ない" : "対照：自身の召喚時効果は出る")
}

console.log("=== 3. ミゴー：破壊を先に行い、戻ったコアで召喚コストを払える ===")
// ルクシオンは軽減をすべて満たして4。維持コア1。リザーブ3だけでは足りず、ミゴーのコア2個が戻って 3+2=5 で払える
scenario({
    name: "migo-order",
    start: { me: { reserve: 3, hand: [LUXION], spirits: [{ card: MIGO, cores: 2 }] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0, payOffInstanceId: t.id("ミゴー"), paySources: [{ instanceId: t.id("ミゴー"), count: 2 }] }),
    expect: [
        "自分.ミゴー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ミゴー",
        "自分.手札: 異海神ディスト・ルクシオン → なし",
        "自分.リザーブ: 3 → 0",
        "自分.トラッシュのコア: 0 → 4",
        "自分.異海神ディスト・ルクシオン.場所: なし → フィールド",
        "自分.異海神ディスト・ルクシオン.疲労: なし → false",
        "自分.異海神ディスト・ルクシオン.コア: なし → 1",
        "自分.異海神ディスト・ルクシオン.Lv: なし → 1",
        "自分.異海神ディスト・ルクシオン.BP: なし → 6000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part860）")
