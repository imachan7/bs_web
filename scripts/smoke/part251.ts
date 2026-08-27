// smoke パート251（BS10黄バッチ：ownHand カウンタ・discardBothHands.all・雷神獣ヌエの【聖命】連動）
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== AuraCounter ownHand：BS10-049 妖精神官アンドロメダが自分の手札枚数ぶんBP+1000 ===")
{
    const s = base("ownhand-aura")
    const andromeda = put(s, "p1", "BS10-049", 1) // Lv1 BP1000
    s.players.p1.hand = []
    assert(effectiveBp(s, "p1", andromeda) === 1000, "手札0枚なら素のBPのまま")
    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003"]
    assert(effectiveBp(s, "p1", andromeda) === 1000 + 3000, "手札3枚ぶんBP+3000")
}

console.log("=== discardBothHands.all：countを無視してお互いの手札すべてを破棄する ===")
{
    const s = base("discardall")
    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003"]
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003", "BS01-004", "BS01-005"]
    resolveAction(s, "p1", null, { type: "discardBothHands", count: 0, all: true })
    assert(s.players.p1.hand.length === 0, "p1の手札はすべて破棄される")
    assert(s.players.p2.hand.length === 0, "p2の手札（枚数が違っても）すべて破棄される")
    assert(s.players.p1.trashCards.length === 3, "p1のトラッシュに3枚")
    assert(s.players.p2.trashCards.length === 5, "p2のトラッシュに5枚")
}

console.log("=== BS10-050 雷神獣ヌエ：【聖命】持ちのアタックで相手のライフが減ったとき、追加でライフのコアをリザーブへ ===")
{
    const s = base("nue-seimei")
    // 百合の妖精ユリィ（BS07-040）はLv2･Lv3で【聖命】。cores=2でLv2にする
    const yurii = put(s, "p1", "BS07-040", 2)
    put(s, "p1", "BS10-050", 1) // 雷神獣ヌエはLv1から発揮
    const p1LifeBefore = s.players.p1.life
    const p2LifeBefore = s.players.p2.life
    const p2ReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: yurii.instanceId }) === null, "ユリィでアタック（p2はブロッカー無し）")
    assert(takeLifeAndResolve(s, "p2") === null, "p2はライフで受ける")
    // 通常のライフダメージ（シンボル1）+ 雷神獣ヌエの追加lifeCrush 1個 = ライフ-2/リザーブ+2
    assert(s.players.p2.life === p2LifeBefore - 2, `p2のライフが2減る（${p2LifeBefore}→${s.players.p2.life}）`)
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "減った2個ぶんp2のリザーブへ")
    // ユリィ自身の【聖命】でp1のライフはボイドから+1
    assert(s.players.p1.life === p1LifeBefore + 1, "ユリィの【聖命】でp1のライフ+1（ボイドから）")
}

console.log("すべてのチェックに合格しました 🎉（part251）")
