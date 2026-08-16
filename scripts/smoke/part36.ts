// smoke パート36（BS04第四弾基盤エンジン: 新キーワード【転召】・ダブルシンボルのライフダメージ・制限カード）
// 収録セクション:
//   - 【転召】（trash）: 候補1体でコアがすべてトラッシュへ、維持コア割れで消滅
//   - 【転召】: 候補0体は不発（召喚自体は成立）
//   - 【転召】（void）: 候補1体でコアが消滅（トラッシュにもリザーブにも移らない）
//   - ダブルシンボル: symbol2つのアタッカーの被ブロックなしライフダメージは2
//   - limitCount: 同名上限を3枚未満に絞る制限カードの検証
import {
    assert,
    act,
    takeLifeAndResolve,
    createGame,
    createInstance,
    effectiveCost,
    getCard,
    minLevelCores,
    runTurnStart,
    validateDeckCards,
} from "./helpers"

console.log("=== 【転召】(trash): 候補1体、コアがすべてトラッシュへ、維持コア割れで消滅 ===")
{
    const s = createGame(
        "tensho-trash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const other = createInstance("BS01-016", s.turn, 3) // スケルトン・ジョウ：コスト5・維持1、コア3個
    s.players.p1.field.spirits.push(other)
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010" // 雷帝エール・クレル（転召：コスト5以上/トラッシュ）
    const trashCoresBefore = s.players.p1.trashCores
    // 召喚コスト支払い分も既存仕様でtrashCoresへ計上されるため、期待値には召喚コストぶんも加える
    const cost = effectiveCost(s, "p1", getCard("BS04-010"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "BS04-010を召喚できる")
    assert(s.players.p1.field.spirits.length === 1, "候補スピリットは維持コア割れで消滅し、残るのは召喚したスピリットのみ")
    assert(s.players.p1.field.spirits[0]?.cardId === "BS04-010", "残っているのは雷帝エール・クレル")
    assert(
        s.players.p1.trashCores === trashCoresBefore + cost + 3,
        `召喚コスト(${cost})+転召で移したコア3個がトラッシュに置かれる（実際${s.players.p1.trashCores - trashCoresBefore}）`,
    )
    assert(s.players.p1.trashCards.includes("BS01-016"), "維持コア割れでスケルトン・ジョウがトラッシュへ")
}

// 2026-08-13：候補0体のときは**召喚そのものができない**（【転召】は召喚のコスト）。
// 以前は「召喚は成立し、転召だけ不発」だったため、犠牲なしで出せてしまっていた
console.log("=== 【転召】: 候補0体では召喚できない ===")
{
    const s = createGame(
        "tensho-notarget-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) !== null, "対象がいないので召喚できない")
    assert(s.players.p1.field.spirits.length === 0, "場には何も出ていない")
    assert(s.players.p1.hand[0] === "BS04-010", "カードは手札に残る")
}

console.log("=== 【転召】(void): 候補1体、コアが消滅（トラッシュにもリザーブにも移らない） ===")
{
    const s = createGame(
        "tensho-void-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const other = createInstance("BS01-020", s.turn, 3) // 翼刃竜スティラノドン：コスト6・維持1、コア3個
    s.players.p1.field.spirits.push(other)
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-X13" // 魔龍帝ジークフリード（転召：コスト6以上/ボイド）
    const trashCoresBefore = s.players.p1.trashCores
    const reserveBeforeSummon = s.players.p1.reserve
    const card = getCard("BS04-X13")
    const cost = effectiveCost(s, "p1", card)
    const maintain = minLevelCores(card)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "BS04-X13を召喚できる")
    assert(s.players.p1.field.spirits.length === 1, "候補スピリットは維持コア割れで消滅する")
    assert(s.players.p1.field.spirits[0]?.cardId === "BS04-X13", "残っているのは魔龍帝ジークフリード")
    assert(
        s.players.p1.trashCores === trashCoresBefore + cost,
        `ボイド送りのため転召分は加算されず、召喚コスト(${cost})分だけトラッシュのコアが増える（実際${s.players.p1.trashCores - trashCoresBefore}）`,
    )
    assert(
        s.players.p1.reserve === reserveBeforeSummon - cost - maintain,
        "ボイド送りの3個はリザーブにも戻らない（召喚コスト+維持コア支払い分だけ減っている）",
    )
    assert(s.players.p1.trashCards.includes("BS01-020"), "維持コア割れでスティラノドンはトラッシュへ（カードのみ）")
}

console.log("=== ダブルシンボル: symbol2つのアタッカーの被ブロックなしライフダメージは2 ===")
{
    const s = createGame(
        "doublesymbol-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    const attacker = createInstance("BS04-X13", s.turn, 1) // symbol:[red, red]
    s.players.p1.field.spirits.push(attacker)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言できる")
    const lifeBefore = s.players.p2.life
    assert(takeLifeAndResolve(s, "p2") === null, "防御側はライフで受けられる")
    assert(s.players.p2.life === lifeBefore - 2, "シンボル2つぶんライフが2減る")
}

console.log("=== limitCount: 制限カードを2枚入れたデッキは validateDeckCards で拒否される ===")
{
    const error = validateDeckCards({ "BS04-082": 2 })
    assert(error !== null, "限度枚数(1)を超えると拒否される")
    assert(!!error && error.includes("1枚"), `エラーメッセージに上限枚数(1)が含まれる（実際: ${error}）`)
}
