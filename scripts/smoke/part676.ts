// smoke パート676（BS06-106 ホワイトホール／BS13-032 光速の騎士ヘルモード／BS03-130 メビウスリング：ネクサスを手札に戻す節。効果文のみから書いた回帰）
import { assert, createGame, createInstance, fireSummonTrigger, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// ネクサスが無いときにマジックを使えるか（ユーザー確認待ち。ACTION_UNIFY_PLAN §4 PR 2b の注記）。決まったら assert に戻す
function pending(cond: boolean, msg: string): void {
    console.log(`  ${cond ? "✅" : "⏸ 未対応"} ${msg}`)
}

const WHITEHOLE = "BS06-106"
const HERMODE = "BS13-032"
const MEBIUS = "BS03-130"
const NX_A = "BS01-099" // 百識の谷
const NX_B = "BS02-077" // 決闘台地
const VANILLA = "BS01-002"

console.log("=== 前提 ===")
{
    assert(getCard(WHITEHOLE).name === "ホワイトホール" && getCard(WHITEHOLE).type === "magic", "WHITEHOLE")
    assert(getCard(HERMODE).name === "光速の騎士ヘルモード" && getCard(HERMODE).type === "spirit", "HERMODE")
    assert(getCard(MEBIUS).name === "メビウスリング" && getCard(MEBIUS).cost === 4, "MEBIUS")
    assert(getCard(NX_A).name === "百識の谷" && getCard(NX_A).type === "nexus", "NX_A")
    assert(getCard(NX_B).name === "決闘台地" && getCard(NX_B).type === "nexus", "NX_B")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 12
    s.players.p2.reserve = 12
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    s.players.p2.hand = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

function nex(s: GameState, pid: PlayerId, cardId: string): string {
    const inst = createInstance(cardId, s.turn, 0)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst.instanceId
}

function cast(s: GameState, cardId: string): string | null {
    s.players.p1.hand = [cardId]
    return handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
}

function pick(s: GameState, id: string): void {
    const pc = s.pendingChoice
    assert(!!pc && pc.kind === "target" && pc.pid === "p1", "使う人が対象を選ぶ待ちになる")
    if (pc) assert(pc.candidates.includes(id), "選んだネクサスは候補に含まれる")
    const err = handleAction(s, "p1", { type: "resolveChoice", instanceId: id })
    assert(err === null, "選択が通る")
}

console.log("=== 1. ホワイトホール：両陣営のネクサスが各持ち主の手札へ ===")
{
    const s = game("wh1")
    nex(s, "p1", NX_A)
    nex(s, "p2", NX_B)
    const err = cast(s, WHITEHOLE)
    assert(err === null, "使用できる")
    assert(s.pendingChoice == null, "「すべて」なので選択待ちなし")
    assert(s.players.p1.field.nexuses.length === 0 && s.players.p2.field.nexuses.length === 0, "両者のネクサスが場から消える")
    assert(s.players.p1.hand.includes(NX_A) && !s.players.p1.hand.includes(NX_B), "自分のネクサスは自分の手札")
    assert(s.players.p2.hand.includes(NX_B) && !s.players.p2.hand.includes(NX_A), "相手のネクサスは相手の手札")
    assert(s.players.p1.trashCards.includes(WHITEHOLE), "マジック自身はトラッシュ")
}

console.log("=== 2. ホワイトホール：片側だけでも使える ===")
{
    const s = game("wh2")
    nex(s, "p2", NX_B)
    assert(cast(s, WHITEHOLE) === null, "相手側のみでも使用できる")
    assert(s.players.p2.hand.includes(NX_B) && s.players.p2.field.nexuses.length === 0, "相手のネクサスが相手の手札へ")
}

console.log("=== 3. ホワイトホール：ネクサスが無ければ使用できない ===")
{
    const s = game("wh3")
    const err = cast(s, WHITEHOLE)
    pending(err !== null, "不発になるので使用できない")
    pending(s.players.p1.hand.includes(WHITEHOLE) && !s.players.p1.trashCards.includes(WHITEHOLE), "手札に残る")
}

console.log("=== 4. ヘルモード召喚時：相手のネクサスのみ戻る ===")
{
    const s = game("hm1")
    const mine = nex(s, "p1", NX_A)
    nex(s, "p2", NX_B)
    const hm = createInstance(HERMODE, s.turn, 3)
    s.players.p1.field.spirits.push(hm)
    refreshLevelAsOverrides(s)
    fireSummonTrigger(s, "p1", hm)
    assert(s.players.p2.field.nexuses.length === 0 && s.players.p2.hand.includes(NX_B), "相手のネクサスは相手の手札へ")
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === mine) && !s.players.p1.hand.includes(NX_A), "自分のネクサスは残る")
}

console.log("=== 5. ヘルモード召喚時：相手の複数ネクサスがすべて戻る／自分側のみなら何も起きない ===")
{
    const s = game("hm2")
    nex(s, "p2", NX_A)
    nex(s, "p2", NX_B)
    const hm = createInstance(HERMODE, s.turn, 3)
    s.players.p1.field.spirits.push(hm)
    refreshLevelAsOverrides(s)
    fireSummonTrigger(s, "p1", hm)
    assert(s.players.p2.field.nexuses.length === 0 && s.players.p2.hand.length === 2, "相手の2つとも戻る")
    const t = game("hm3")
    nex(t, "p1", NX_A)
    const hm2 = createInstance(HERMODE, t.turn, 3)
    t.players.p1.field.spirits.push(hm2)
    refreshLevelAsOverrides(t)
    fireSummonTrigger(t, "p1", hm2)
    assert(t.players.p1.field.nexuses.length === 1 && t.players.p1.hand.length === 0, "自分のネクサスは戻らない")
}

console.log("=== 6. メビウスリング：相手のネクサスを戻すとコア+1 ===")
{
    const s = game("mb1")
    const mine = nex(s, "p1", NX_A)
    const theirs = nex(s, "p2", NX_B)
    const base = s.players.p1.trashCores
    assert(cast(s, MEBIUS) === null, "使用できる")
    pick(s, theirs)
    assert(s.players.p2.hand.includes(NX_B) && s.players.p2.field.nexuses.length === 0, "相手のネクサスは相手の手札")
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === mine), "自分のネクサスは残る")
    assert(s.players.p1.trashCores === base + 4 + 1, "コスト4＋ボイドから1個でトラッシュ+5")
}

console.log("=== 7. メビウスリング：自分のネクサスを戻してもコアは増えない ===")
{
    const s = game("mb2")
    const mine = nex(s, "p1", NX_A)
    const theirs = nex(s, "p2", NX_B)
    const base = s.players.p1.trashCores
    assert(cast(s, MEBIUS) === null, "使用できる")
    pick(s, mine)
    assert(s.players.p1.hand.includes(NX_A) && s.players.p1.field.nexuses.length === 0, "自分のネクサスは自分の手札")
    assert(s.players.p2.field.nexuses.some((n) => n.instanceId === theirs), "相手のネクサスは残る")
    assert(s.players.p1.trashCores === base + 4, "コスト4のみ。追加の+1なし")
}

console.log("=== 8. メビウスリング：自分のネクサスだけでも使える／無ければ使用できない ===")
{
    const s = game("mb3")
    const mine = nex(s, "p1", NX_A)
    assert(cast(s, MEBIUS) === null, "自分のみでも使用できる")
    if (s.pendingChoice) pick(s, mine)
    assert(s.players.p1.hand.includes(NX_A), "自分のネクサスが戻る")
    const t = game("mb4")
    pending(cast(t, MEBIUS) !== null, "ネクサスが無ければ使用できない")
    pending(t.players.p1.hand.includes(MEBIUS), "手札に残る")
}

console.log("すべてのチェックに合格しました 🎉（part676）")
