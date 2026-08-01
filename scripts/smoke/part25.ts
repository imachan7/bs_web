// smoke パート25（第三弾 BS03 汎用ミルアクション拡張バッチ）
// 収録セクション:
//   - 汎用: mill（相手/自分デッキ・不足時は可能な分）
//   - 汎用: millPer（EffectCounter { ownColor } 経由）
//   - 汎用: bpBuffAll familyFilter（指定系統のみBP+）
//   - 汎用: deployNexus all（該当ネクサスをすべて配置）
//   - 実カード: BS03-073 ストン・スタチュー（onSummon mill）
//   - 実カード: BS03-087 戦闘獣ライノ・セーラス（onDestroy millPer selfCoresAtDestruction）
//   - 実カード: BS03-145 スクランブル（magic main bpBuffAll familyFilter）
//   - 実カード: BS03-148 コンストラクション（magic main deployNexus all 赤/緑/青）
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

console.log("=== 汎用 mill：相手のデッキを上からcount枚トラッシュへ（side省略=相手） ===")
{
    const s = createGame(
        "mill-basic-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    resolveAction(s, "p1", null, { type: "mill", count: 3 })
    assert(s.players.p2.deck.length === deckBefore - 3, "相手のデッキが3枚減る")
    assert(s.players.p2.trashCards.length === trashBefore + 3, "相手のトラッシュが3枚増える")
}

console.log("=== 汎用 mill：side:\"own\"指定時は自分のデッキを破棄 ===")
{
    const s = createGame(
        "mill-own-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const deckBefore = s.players.p1.deck.length
    const opponentDeckBefore = s.players.p2.deck.length
    resolveAction(s, "p1", null, { type: "mill", count: 2, side: "own" })
    assert(s.players.p1.deck.length === deckBefore - 2, "自分のデッキが2枚減る")
    assert(s.players.p2.deck.length === opponentDeckBefore, "相手のデッキは変化しない")
}

console.log("=== 汎用 mill：デッキ不足時は可能な分だけ破棄する ===")
{
    const s = createGame(
        "mill-shortage-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.players.p2.deck = ["BS01-001", "BS01-001"]
    resolveAction(s, "p1", null, { type: "mill", count: 5 })
    assert(s.players.p2.deck.length === 0, "デッキが尽きる")
    assert(s.players.p2.trashCards.length === 2, "実際に破棄できた2枚のみトラッシュへ")
}

console.log("=== 汎用 millPer：EffectCounter { ownColor } 経由でカウント値ぶん破棄 ===")
{
    const s = createGame(
        "millper-owncolor-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.field.spirits.push(
        createInstance("BS03-072", s.turn, 1), // 青
        createInstance("BS03-076", s.turn, 1), // 青
        createInstance("BS01-001", s.turn, 1), // 赤（対象外）
    )
    const deckBefore = s.players.p2.deck.length
    resolveAction(s, "p1", null, { type: "millPer", counter: { ownColor: "blue" } })
    assert(s.players.p2.deck.length === deckBefore - 2, "自分の青スピリット数（2）ぶん相手のデッキが減る")
}

console.log("=== 汎用 bpBuffAll familyFilter：指定系統のスピリットのみBP+ ===")
{
    const s = createGame(
        "bpbuffall-family-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const tousin = createInstance("BS03-072", s.turn, 1) // 系統:闘神
    const other = createInstance("BS01-001", s.turn, 1) // 系統:爬獣
    s.players.p1.field.spirits.push(tousin, other)
    resolveAction(s, "p1", null, { type: "bpBuffAll", amount: 1000, filter: { family: "闘神" } })
    assert(tousin.tempBpBuff === 1000, "系統一致のスピリットはBP+1000される")
    assert(other.tempBpBuff === 0, "系統不一致のスピリットはBPが変化しない")
}

console.log("=== 汎用 deployNexus all：該当色のネクサスカードをすべて配置 ===")
{
    const s = createGame(
        "deploynexus-all-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.trashCards = ["BS01-106", "BS01-112", "BS01-098", "BS03-113"] // 緑/白/赤/青
    resolveAction(s, "p1", null, {
        type: "deployNexus",
        from: "trash",
        colors: ["green", "white"],
        all: true,
    })
    const nexusColors = s.players.p1.field.nexuses.map((n) => n.cardId).sort()
    assert(
        nexusColors.length === 2 && nexusColors.includes("BS01-106") && nexusColors.includes("BS01-112"),
        "緑と白の2枚がすべて場に出る",
    )
    assert(
        s.players.p1.trashCards.length === 2 &&
            s.players.p1.trashCards.includes("BS01-098") &&
            s.players.p1.trashCards.includes("BS03-113"),
        "対象外の赤/青はトラッシュに残る",
    )
}

console.log("=== BS03-073 ストン・スタチュー：召喚時、相手のデッキを上から1枚破棄 ===")
{
    const s = createGame(
        "bs03-073-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const statue = createInstance("BS03-073", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(statue)
    const deckBefore = s.players.p2.deck.length
    fireTrigger(s, "p1", statue, "onSummon")
    assert(s.players.p2.deck.length === deckBefore - 1, "召喚時に相手のデッキが1枚減る")
}

console.log("=== BS03-087 戦闘獣ライノ・セーラス：破壊時、置かれていたコア数ぶん相手のデッキを破棄 ===")
{
    const s = createGame(
        "bs03-087-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const rhino = createInstance("BS03-087", s.turn, 3) // コア3個
    s.players.p1.field.spirits.push(rhino)
    const deckBefore = s.players.p2.deck.length
    // destroySpirit が破壊直前のコア数(coresAtDestruction)を記録してからonDestroyを発火する
    // （fireTriggerを直接呼ぶだけではcoresAtDestructionが未設定のまま=0になってしまうため）
    destroySpirit(s, "p1", rhino.instanceId)
    assert(s.players.p2.deck.length === deckBefore - 3, "破壊時点のコア数（3）ぶん相手のデッキが減る")
}

console.log("=== BS03-145 スクランブル：メインで系統「闘神」の自分スピリットすべてをBP+3000 ===")
{
    const s = createGame(
        "bs03-145-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const tousin = createInstance("BS03-072", s.turn, 1) // 系統:闘神
    const other = createInstance("BS01-001", s.turn, 1) // 系統:爬獣
    s.players.p1.field.spirits.push(tousin, other)
    resolveAction(s, "p1", null, { type: "bpBuffAll", amount: 3000, filter: { family: "闘神" } })
    assert(tousin.tempBpBuff === 3000, "闘神のスピリットはBP+3000される")
    assert(other.tempBpBuff === 0, "闘神以外は変化しない")
}

console.log("=== BS03-148 コンストラクション：メインで自分のトラッシュの赤/緑/青ネクサスをすべて無償配置 ===")
{
    const s = createGame(
        "bs03-148-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.trashCards = ["BS01-098", "BS01-106", "BS03-113", "BS01-112"] // 赤/緑/青/白
    resolveAction(s, "p1", null, {
        type: "deployNexus",
        from: "trash",
        colors: ["red", "green", "blue"],
        all: true,
    })
    const nexusIds = s.players.p1.field.nexuses.map((n) => n.cardId).sort()
    assert(nexusIds.length === 3, "赤/緑/青の3枚がすべて場に出る")
    assert(
        s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === "BS01-112",
        "対象外の白はトラッシュに残る",
    )
}
