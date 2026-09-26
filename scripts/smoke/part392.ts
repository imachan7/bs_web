// smoke パート392（placeCores：複数体に置くときは1体ずつ選ばせ別々の個体にする／自分のコアを動かすときも下限を見る）
import { act, assert, createGame, createInstance, getCard, resolveAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1）
const FLOOR = "BS08-059" // 聖なる柱状彫刻（お互いのアタックステップ、コアの数はLv1コストより少なくならない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(WHITE).name === "バーサーカー・ガン" && getCard(WHITE).colors.includes("white"), "WHITEは白")
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).cost === 1, "REDはコスト1")
    assert(getCard(FLOOR).name === "聖なる柱状彫刻" && getCard(FLOOR).type === "nexus", "FLOORはネクサス")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.phase = "main"
    s.players.p1.reserve = 0
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const twoWhites = { type: "placeCores", from: "void", to: "spirit", count: 1, targets: 2, filter: { color: "white" } } as const

console.log("=== 1. 候補3体から2体：1体ずつ選ばせ、2体目の候補から1体目を外す ===")
{
    const s = game("pick2", true)
    const a = put(s, "p1", WHITE, 1)
    const b = put(s, "p1", WHITE, 1)
    const c = put(s, "p1", WHITE, 1)
    resolveAction(s, "p1", null, twoWhites)
    assert(s.pendingChoice?.candidates.length === 3, "1体目は3体から選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: a.instanceId }) === null, "1体目を選ぶ")
    assert(a.cores === 2, "1体目に1個置かれる")
    assert(s.pendingChoice !== null && !s.pendingChoice.candidates.includes(a.instanceId), "2体目の候補に1体目は入らない")
    assert(s.pendingChoice?.candidates.length === 2, "2体目は残り2体から選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: c.instanceId }) === null, "2体目を選ぶ")
    assert(c.cores === 2 && b.cores === 1 && a.cores === 2, "選んだ2体にだけ1個ずつ置かれる")
    assert(s.pendingChoice === null, "選択待ちは残らない")
}

console.log("=== 2. 候補がちょうど2体なら選ばせずに両方へ置く ===")
{
    const s = game("exact2", true)
    const a = put(s, "p1", WHITE, 1)
    const b = put(s, "p1", WHITE, 1)
    put(s, "p1", RED, 1)
    resolveAction(s, "p1", null, twoWhites)
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(a.cores === 2 && b.cores === 2, "白2体に1個ずつ置かれる")
}

console.log("=== 3. 自分のスピリットからライフへ：下限（聖なる柱状彫刻）を下回るまでは取らない ===")
{
    const s = game("floor", false)
    s.phase = "attack"
    s.turnPlayer = "p1"
    const nx = createInstance(FLOOR, s.turn, 1)
    s.players.p1.field.nexuses.push(nx)
    const r = put(s, "p1", RED, 3)
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", r, { type: "placeCores", from: "self", to: "life", count: 3 })
    assert(r.cores === 1, "Lv1コスト（1）までしか減らない")
    assert(s.players.p1.life === lifeBefore + 2, "取れた2個だけライフに置かれる")
    assert(s.players.p1.field.spirits.includes(r), "スピリットは場に残る")
}

console.log("=== 4. 下限が無ければ全部動かし、維持コアを割ったら消滅する ===")
{
    const s = game("nofloor", false)
    const r = put(s, "p1", RED, 3)
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", r, { type: "placeCores", from: "self", to: "life", count: 3 })
    assert(s.players.p1.life === lifeBefore + 3, "3個ともライフに置かれる")
    assert(!s.players.p1.field.spirits.includes(r), "コア0で消滅する")
}

console.log("=== 5. from:field で1個も取れないスピリットしか残らなくても止まる ===")
{
    const s = game("fieldfloor", false)
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.players.p1.field.nexuses.push(createInstance(FLOOR, s.turn, 0))
    const r = put(s, "p1", RED, 1)
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", null, { type: "placeCores", from: "field", to: "life", count: 2 })
    assert(r.cores === 1 && s.players.p1.life === lifeBefore, "下限で取れず、何も動かない")
}

console.log("すべてのチェックに合格しました 🎉（part392）")
