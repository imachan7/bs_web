// smoke パート884（BS09-X39 魔導女皇アンブロシウス Lv3：黄のマジックだけをコストなしで使用できる）
//
// 期待値は効果文と属性だけから書いた。報告されたバグ：黄以外のマジックもコストなしで使えてしまう。
// 判定は effectiveCost（使用に必要なコスト）と castMagic の受理／拒否の両方で見る。
import { act, assert, createGame, createInstance, effectiveCost, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const AMBRO = "BS09-X39"
const Y_FLASH = "BS03-134" // パペットストリング（黄・メイン／フラッシュ・コスト2。選択を挟まない）
const Y_MAIN = "BS03-134"
const G_FLASH = "BS01-133" // ワイルドパワー（緑・フラッシュ・コスト2）
const B_FLASH = "BS03-141" // ビルドアップ（青・フラッシュ・コスト3）
const W_FLASH = "BS01-143" // ディバインチェイン（白・フラッシュ・コスト3）
const YW_MULTI = "P079" // 激翔（白・黄。メイン／フラッシュ）
const ATK = "BS01-003"
const Y_PAID = 1 // 黄のコスト2は、場のアンブロシウスの黄シンボル1個の軽減で、支払いは1になる

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    assert(c(AMBRO).name === "魔導女皇アンブロシウス" && c(AMBRO).colors.join() === "yellow", "アンブロシウスは黄")
    assert(c(Y_FLASH).colors.join() === "yellow" && c(Y_FLASH).cost === 2 && c(Y_MAIN).colors.join() === "yellow" && c(Y_MAIN).cost === 2, "黄のマジック2枚")
    assert(c(G_FLASH).colors.join() === "green" && c(G_FLASH).cost === 2, "緑のマジック")
    assert(c(B_FLASH).colors.join() === "blue" && c(B_FLASH).cost === 3, "青のマジック")
    assert(c(W_FLASH).colors.join() === "white" && c(W_FLASH).cost === 3, "白のマジック")
    assert(c(YW_MULTI).type === "magic" && c(YW_MULTI).colors.includes("yellow") && c(YW_MULTI).colors.length === 2 && c(YW_MULTI).cost === 2, "激翔は白と黄の多色マジック")
}

interface Opt {
    cores: number // アンブロシウスのコア数（5=Lv3・3=Lv2）
    turn: "me" | "opp" // どちらのアタックステップか（phase が main なら無視）
    phase?: "attack" | "main"
    hand?: string[]
    tegamoto?: string[]
    reserve?: number
}
function setup(seed: string, o: Opt) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p2.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p1.reserve = o.reserve ?? 0
    s.players.p2.reserve = 10
    const put = (pid: PlayerId, cardId: string, cores: number) => {
        const i = createInstance(cardId, s.turn, cores)
        s.players[pid].field.spirits.push(i)
        return i
    }
    const ambro = put("p1", AMBRO, o.cores)
    const mine = put("p1", ATK, 1)
    const theirs = put("p2", ATK, 1)
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [...(o.hand ?? [])]
    s.players.p1.tegamoto = [...(o.tegamoto ?? [])]
    if (o.phase === "main") {
        s.turnPlayer = "p1"
        s.phase = "main"
    } else if (o.turn === "me") {
        s.turnPlayer = "p1"
        s.phase = "attack"
        s.battle = { attackerInstanceId: mine.instanceId, blockerInstanceId: null, directed: false }
        s.isFlashTiming = true
        s.priorityPlayer = "p1"
    } else {
        s.turnPlayer = "p2"
        s.phase = "attack"
        s.battle = { attackerInstanceId: theirs.instanceId, blockerInstanceId: mine.instanceId, directed: false }
        mine.isRested = true
        s.isFlashTiming = true
        s.priorityPlayer = "p1"
    }
    return { s, ambro, mine, theirs }
}
const cost = (s: GameState, id: string) => effectiveCost(s, "p1", getCard(id))
const cast = (s: GameState, handIndex: number, target: string, tegamoto = false) =>
    act(s, "p1", { type: "castMagic", handIndex, targetInstanceId: target, ...(tegamoto ? { fromTegamoto: true } : {}) })

for (const who of ["me", "opp"] as const) {
    const label = who === "me" ? "自分のアタックステップ" : "相手のアタックステップ（お互いの）"
    console.log(`=== Lv3・${label}：手札の黄のマジックは無償 ===`)
    {
        const { s, mine } = setup(`y-${who}`, { cores: 5, turn: who, hand: [Y_FLASH] })
        assert(cost(s, Y_FLASH) === 0, "必要コストは0")
        assert(cast(s, 0, mine.instanceId) === null, "リザーブ0でも使用できる")
        assert(s.players.p1.reserve === 0 && s.players.p1.trashCards.includes(Y_FLASH), "コアは減らずトラッシュへ")
    }
    console.log(`=== Lv3・${label}：黄以外のマジックは無償にならない（緑・青・白） ===`)
    for (const id of [G_FLASH, B_FLASH, W_FLASH]) {
        const color = getCard(id).colors[0]
        const a = setup(`n-${who}-${id}`, { cores: 5, turn: who, hand: [id] })
        assert(cost(a.s, id) === getCard(id).cost, `${color}：必要コストは通常の${getCard(id).cost}`)
        assert(cast(a.s, 0, a.mine.instanceId) !== null, `${color}：リザーブ0では拒否される`)
        assert(a.s.players.p1.hand.includes(id), `${color}：拒否されたら手札に残る`)
        const b = setup(`p-${who}-${id}`, { cores: 5, turn: who, hand: [id], reserve: 10 })
        assert(cast(b.s, 0, b.mine.instanceId) === null, `${color}：コストを払えば使える`)
        assert(b.s.players.p1.reserve === 10 - getCard(id).cost, `${color}：通常のコスト分だけ減る`)
    }
    console.log(`=== Lv3・${label}：手札の黄のマジックすべて（複数枚）が無償 ===`)
    {
        const { s, mine } = setup(`multi-${who}`, { cores: 5, turn: who, hand: [Y_FLASH, G_FLASH, Y_FLASH] })
        assert(cost(s, Y_FLASH) === 0 && cost(s, G_FLASH) === 2, "黄は0・緑は2")
        assert(cast(s, 0, mine.instanceId) === null, "黄の1枚目は無償で使える")
        // 使うと優先権が相手に移るので、相手のパスで戻してから2枚目を使う
        assert(act(s, "p2", { type: "pass" }) === null, "相手がパス")
        assert(cast(s, 1, mine.instanceId) === null, "黄の2枚目も無償で使える（手札の並びは詰まる）")
        assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === G_FLASH, "緑だけ手札に残る")
    }
}

console.log("=== Lv3：黄と白の多色マジック（激翔）は「黄のマジック」に当たる ===")
{
    const { s, mine } = setup("multi-color", { cores: 5, turn: "opp", hand: [YW_MULTI] })
    assert(cost(s, YW_MULTI) === 0, "黄を含むので必要コストは0")
    assert(cast(s, 0, mine.instanceId) === null, "リザーブ0で使用できる")
}

console.log("=== Lv3：手元（tegamoto）の黄のマジックは無償・黄以外は不可 ===")
{
    const a = setup("tego-y", { cores: 5, turn: "me", tegamoto: [Y_FLASH] })
    assert(cast(a.s, 0, a.mine.instanceId, true) === null, "手元の黄は無償で使える")
    assert(a.s.players.p1.reserve === 0 && !a.s.players.p1.tegamoto.includes(Y_FLASH), "コアは減らず手元から出る")
    const b = setup("tego-g", { cores: 5, turn: "me", tegamoto: [G_FLASH] })
    assert(cast(b.s, 0, b.mine.instanceId, true) !== null, "手元の緑はリザーブ0では拒否される")
    assert(b.s.players.p1.tegamoto.includes(G_FLASH), "拒否されたら手元に残る")
    const c = setup("tego-g-paid", { cores: 5, turn: "me", tegamoto: [G_FLASH], reserve: 10 })
    // 手元のカードは、使用を許す効果（アンブロシウスは黄だけ）が無ければ、コストを払っても使えない
    assert(cast(c.s, 0, c.mine.instanceId, true) !== null && c.s.players.p1.reserve === 10, "手元の緑は、リザーブがあっても使用できない")
}

console.log("=== Lv2（効果はLv3のみ）：アタックステップでも無償にならない ===")
{
    const { s, mine } = setup("lv2-attack", { cores: 3, turn: "me", hand: [Y_FLASH] })
    assert(cost(s, Y_FLASH) === Y_PAID, "必要コストは通常（軽減後）の1")
    assert(cast(s, 0, mine.instanceId) !== null, "リザーブ0では拒否される")
}

console.log("=== Lv3：メインステップでは無償にならない（アタックステップ限定） ===")
{
    const { s, mine } = setup("lv3-main", { cores: 5, turn: "me", phase: "main", hand: [Y_MAIN] })
    assert(cost(s, Y_MAIN) === Y_PAID, "必要コストは通常（軽減後）の1")
    assert(cast(s, 0, mine.instanceId) !== null, "リザーブ0では拒否される")
    const t = setup("lv3-main-paid", { cores: 5, turn: "me", phase: "main", hand: [Y_MAIN], reserve: 10 })
    assert(cast(t.s, 0, t.mine.instanceId) === null && t.s.players.p1.reserve === 10 - Y_PAID, "通常のコストを払えば使える")
}

console.log("すべてのチェックに合格しました 🎉（part884）")
