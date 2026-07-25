// smoke パート37（公開ゾーン「手元」＝tegamoto の基盤実装）
// 収録セクション:
//   - マジックブック main（非interactive）: 手札のマジックカードを一括で手元へ+同数ドロー
//   - 透明人間エクリア召喚: 相手の手元をすべて破棄し、その枚数ぶん相手スピリットを破壊
//   - 大天使ミカファールLv2がいれば、手元のマジックをfromTegamotoで無償使用できる
//   - ミカファール不在時、fromTegamotoのcastMagicは拒否される
//   - エクリアで相手の手元が0枚のときはno-op
import {
    act,
    assert,
    createGame,
    createInstance,
    runTurnStart,
} from "./helpers"

console.log("=== マジックブック main（非interactive）: 手札のマジックを一括で手元へ+同数ドロー ===")
{
    const s = createGame(
        "tegamoto-magicbook-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "purple" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108"] // バスタースピア・アウェイクン・マジックブック
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 2 }) === null, "マジックブックをmainで使用できる")
    assert(s.players.p1.tegamoto.length === 2, "手札のマジック2枚が手元へ移動した")
    assert(
        s.players.p1.tegamoto.includes("BS01-114") && s.players.p1.tegamoto.includes("BS01-115"),
        "手元の中身は元の手札マジック2枚",
    )
    assert(
        s.players.p1.hand.length === 2,
        "手札は手元に置いた2枚が抜け、ドローした2枚に入れ替わる（元の手札3枚-使用1枚-手元2枚+ドロー2枚）",
    )
    assert(s.players.p1.deck.length === deckBefore - 2, "手元に置いた2枚ぶんデッキから2枚引いた")
    assert(s.players.p1.trashCards.includes("BS02-108"), "マジックブック自身は通常どおりトラッシュへ")
}

console.log("=== 透明人間エクリア召喚: 相手の手元をすべて破棄し、その枚数ぶん相手スピリットを破壊 ===")
{
    const s = createGame(
        "tegamoto-ecuria-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    s.players.p2.tegamoto = ["BS01-114", "BS01-115"] // 破棄される相手の手元カード（種別は問わない）
    const enemy1 = createInstance("BS01-001", s.turn, 1) // ゴラドン
    const enemy2 = createInstance("BS01-002", s.turn, 1) // ロクケラトプス
    s.players.p2.field.spirits.push(enemy1, enemy2)
    s.players.p1.hand[0] = "BS03-016" // 透明人間エクリア
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エクリアを召喚できる")
    assert(s.players.p2.tegamoto.length === 0, "相手の手元は破棄された")
    assert(
        s.players.p2.trashCards.includes("BS01-114") && s.players.p2.trashCards.includes("BS01-115"),
        "破棄したカードは相手のトラッシュへ",
    )
    assert(s.players.p2.field.spirits.length === 0, "手元2枚ぶん相手スピリット2体が破壊された")
}

console.log("=== 大天使ミカファールLv2がいれば、手元のマジックをfromTegamotoで無償使用できる ===")
{
    const s = createGame(
        "tegamoto-mikafarl-free-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    const mika = createInstance("BS02-X08", s.turn, 2) // 大天使ミカファール Lv2（維持コア2個）
    s.players.p1.field.spirits.push(mika)
    s.players.p1.tegamoto = ["BS01-114"] // バスタースピア
    const trashBefore = s.players.p1.trashCards.length
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, fromTegamoto: true }) === null,
        "ミカファールLv2がいれば手元のマジックをfromTegamotoで無償使用できる",
    )
    assert(s.players.p1.tegamoto.length === 0, "使用したカードは手元から消えた")
    assert(
        s.players.p1.trashCards.length === trashBefore + 1 && s.players.p1.trashCards.includes("BS01-114"),
        "使用後は通常どおりトラッシュへ",
    )
    assert(s.players.p1.reserve === reserveBefore, "無償化のためリザーブは消費されない")
}

console.log("=== ミカファール不在時、fromTegamotoのcastMagicは拒否される ===")
{
    const s = createGame(
        "tegamoto-mikafarl-absent-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.tegamoto = ["BS01-114"]
    const error = act(s, "p1", { type: "castMagic", handIndex: 0, fromTegamoto: true })
    assert(error !== null, "ミカファール不在ならfromTegamotoのcastMagicは拒否される")
    assert(s.players.p1.tegamoto.length === 1, "拒否されたので手元のカードは残ったまま")
}

console.log("=== エクリアで相手の手元が0枚のときはno-op ===")
{
    const s = createGame(
        "tegamoto-ecuria-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    const enemy = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS03-016"
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        "エクリアを召喚できる（相手の手元は0枚）",
    )
    assert(s.players.p2.field.spirits.length === 1, "相手の手元が0枚のため相手スピリットは破壊されない")
}
