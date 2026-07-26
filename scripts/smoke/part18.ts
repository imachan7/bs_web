// smoke パート18（第三弾 BS03 データの検証）
import {
    assert,
    createGame,
    engineRunTurnStart,
    getCard,
} from "./helpers"
import { cardHasColor } from "../../shared/rules"

console.log("=== 第三弾（BS03）データの検証 ===")
{
    // cards.json に BS03 全153枚（通常141＋Xレア）が入っていること
    const probes = ["001", "030", "071", "121", "141", "X09", "X12"].map((n) => `BS03-${n}`)
    for (const cardId of probes) getCard(cardId) // 実在チェック（無ければ throw）
    assert(getCard("BS03-030").limited === true, "BS03-030 は禁止カード")
    assert(cardHasColor(getCard("BS03-071"), "blue"), "戦闘獣ブルトップは青")
    assert(getCard("BS03-071").name === "戦闘獣ブルトップ", "青デッキ採用カードの ID・名前が一致")
    assert(getCard("BS03-121").rarity === "C,R", "複数レアリティ表記（C,R）を取り込めている")

    // 青デッキでゲームを開始できる
    const s = createGame(
        "bs03-blue-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    engineRunTurnStart(s)
    assert(
        s.players.p1.deck.length + s.players.p1.hand.length === 40,
        "青デッキ40枚でゲーム開始できる",
    )
}
