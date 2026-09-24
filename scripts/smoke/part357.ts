// smoke パート357（pay 移行バッチ2：destroy/returnToHand/returnToDeckTop/destroyNexusのside:"own"、
// coreRemoveのspread/chooserIsTarget、pay判定表への追加。docs/design/COST_MODEL.md §1）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・スピリット・コスト1・系統「地竜」・Lv1維持コア1）
const NEXUS = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
    assert(getCard(VANILLA).family?.includes("地竜") === true, "VANILLAは系統「地竜」")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. destroy side:own（excludeSelf・family絞り込み） ===")
{
    const s = game("case1")
    const me = put(s, "p1", VANILLA, 1)
    const mate = put(s, "p1", VANILLA, 1)
    const enemy = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", me, { type: "destroy", side: "own", count: 1, filter: { family: ["地竜"], excludeSelf: true } })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === me.instanceId), "selfは破壊されない")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === mate.instanceId), "自分側の非selfが破壊された")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId), "相手側は対象外")
}

console.log("=== 2. returnToHand side:own ===")
{
    const s = game("case2")
    const me = put(s, "p1", VANILLA, 1)
    const mate = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", me, { type: "returnToHand", side: "own", count: 1, filter: { excludeSelf: true } })
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.field.spirits[0]!.instanceId === me.instanceId, "非selfだけ手札へ戻った")
    assert(s.players.p1.hand.includes(mate.cardId), "戻したカードが手札にある")
}

console.log("=== 3. returnToDeckTop side:own ===")
{
    const s = game("case3")
    const me = put(s, "p1", VANILLA, 1)
    const mate = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", me, { type: "returnToDeckTop", side: "own", filter: { excludeSelf: true } })
    assert(s.players.p1.field.spirits.length === 1 && s.players.p1.field.spirits[0]!.instanceId === me.instanceId, "非selfだけデッキへ戻った")
    assert(s.players.p1.deck[0] === mate.cardId, "デッキの一番上に戻った")
}

console.log("=== 4. destroyNexus side:own ===")
{
    const s = game("case4")
    const own = createInstance(NEXUS, s.turn, 0)
    const opp = createInstance(NEXUS, s.turn, 0)
    s.players.p1.field.nexuses.push(own)
    s.players.p2.field.nexuses.push(opp)
    resolveAction(s, "p1", null, { type: "destroyNexus", side: "own", count: 1 })
    assert(s.players.p1.field.nexuses.length === 0, "自分側ネクサスが破壊された")
    assert(s.players.p2.field.nexuses.length === 1, "相手側ネクサスは対象外")
}

console.log("=== 5. coreRemove spread（非対話：2体にまたがって合計count個） ===")
{
    const s = game("case5")
    const a = put(s, "p2", VANILLA, 3)
    const b = put(s, "p2", VANILLA, 2)
    const trashBefore = s.players.p2.trashCores
    resolveAction(s, "p1", null, { type: "coreRemove", spread: true, count: 5, dest: "trash" })
    assert(s.players.p2.trashCores - trashBefore === 5, `2体合計5個をトラッシュへ（実際: ${String(s.players.p2.trashCores - trashBefore)}）`)
    void a
    void b
}

console.log("=== 6. coreRemove spread（対話：1個ずつ選び、残数で再入） ===")
{
    const s = game("case6", true)
    const a = put(s, "p1", VANILLA, 2)
    const b = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", null, { type: "coreRemove", side: "own", spread: true, count: 3, dest: "trash" })
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "target", "1個目の選択待ちが立つ")
    assert(s.pendingChoice!.pid === "p1", "選ぶのはowner（chooserIsTarget無し）")
    let err = handleAction(s, "p1", { type: "resolveChoice", instanceId: a.instanceId })
    assert(err === null, `1個目の応答が通る（実際: ${String(err)}）`)
    assert(s.pendingChoice !== null, "残り2個ぶん（aに1個残っている）の選択待ちが続く")
    err = handleAction(s, "p1", { type: "resolveChoice", instanceId: a.instanceId })
    assert(err === null, "2個目もaから（aは0個になり消滅）")
    // 残り1個・候補はbだけ（1体）になったので requestChoice が自動解決する
    // （EffectModules.requestChoice：候補1件は選択を立てず即resolveAction）
    assert(s.pendingChoice === null, "候補が1体だけになり自動解決して選択がすべて解消した")
    assert(s.players.p1.trashCores === 3, `合計3個がトラッシュへ（実際: ${String(s.players.p1.trashCores)}）`)
}

console.log("=== 7. coreRemove spread + chooserIsTarget（相手が選ぶ） ===")
{
    // 候補が2体以上あるときだけ実際に選択待ちが立つ（1体しかいないとrequestChoiceが自動解決するため）
    const s = game("case7", true)
    const enemyA = put(s, "p2", VANILLA, 2)
    const enemyB = put(s, "p2", VANILLA, 2)
    resolveAction(s, "p1", null, { type: "coreRemove", spread: true, count: 1, dest: "trash", chooserIsTarget: true })
    assert(s.pendingChoice !== null && s.pendingChoice.pid === "p2", "選ぶのは対象側（相手）")
    const err = handleAction(s, "p2", { type: "resolveChoice", instanceId: enemyA.instanceId })
    assert(err === null, `相手の応答が通る（実際: ${String(err)}）`)
    assert(s.players.p2.trashCores === 1, "1個トラッシュへ置かれた")
    void enemyB
}

console.log("=== 8. pay：cost destroy(side:own) → then refreshSelf ===")
{
    const s = game("case8")
    const me = put(s, "p1", VANILLA, 1)
    me.isRested = true
    const mate = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", me, {
        type: "pay",
        cost: { type: "destroy", side: "own", count: 1, filter: { family: ["地竜"], excludeSelf: true } },
        then: { type: "refreshSelf" },
    })
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === mate.instanceId), "コストとして自分の別のスピリットが破壊された")
    assert(!me.isRested, "selfが回復した")
}
{
    // 候補（自分の別のスピリット）がいなければ不発（COST_MODEL.md §1）
    const s = game("case8b")
    const me = put(s, "p1", VANILLA, 1)
    me.isRested = true
    resolveAction(s, "p1", me, {
        type: "pay",
        cost: { type: "destroy", side: "own", count: 1, filter: { family: ["地竜"], excludeSelf: true } },
        then: { type: "refreshSelf" },
    })
    assert(me.isRested === true, "コストが払えないので発動しなかった")
}
{
    // selfが既に回復状態なら then が成立しないので発動しない（コストも払わない）
    const s = game("case8c")
    const me = put(s, "p1", VANILLA, 1)
    const mate = put(s, "p1", VANILLA, 1)
    resolveAction(s, "p1", me, {
        type: "pay",
        cost: { type: "destroy", side: "own", count: 1, filter: { family: ["地竜"], excludeSelf: true } },
        then: { type: "refreshSelf" },
    })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === mate.instanceId), "回復状態のためコストも払われなかった")
}

console.log("=== 9. pay：cost coreRemove(side:own,spread) → then coreRemove(spread,chooserIsTarget) ===")
{
    const s = game("case9")
    const myA = put(s, "p1", VANILLA, 3)
    const myB = put(s, "p1", VANILLA, 2)
    const enemyA = put(s, "p2", VANILLA, 3)
    const enemyB = put(s, "p2", VANILLA, 2)
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "coreRemove", side: "own", spread: true, count: 5, dest: "trash" },
        then: { type: "coreRemove", spread: true, count: 5, dest: "trash", chooserIsTarget: true },
    })
    assert(s.players.p1.trashCores === 5, `自分側から合計5個払った（実際: ${String(s.players.p1.trashCores)}）`)
    assert(s.players.p2.trashCores === 5, `相手側から合計5個取り除かれた（実際: ${String(s.players.p2.trashCores)}）`)
    void myA
    void myB
    void enemyA
    void enemyB
}
{
    // 相手のコア合計が4個（不足）なら then が成立せず、cost も払わない
    const s = game("case9b")
    const myA = put(s, "p1", VANILLA, 3)
    const myB = put(s, "p1", VANILLA, 2)
    const enemyA = put(s, "p2", VANILLA, 2)
    const enemyB = put(s, "p2", VANILLA, 2)
    enemyB.cores = 1
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "coreRemove", side: "own", spread: true, count: 5, dest: "trash" },
        then: { type: "coreRemove", spread: true, count: 5, dest: "trash", chooserIsTarget: true },
    })
    assert(s.players.p1.trashCores === 0, "相手のコアが足りないのでコストも払わなかった")
    assert(s.players.p2.trashCores === 0, "相手のコアは取り除かれなかった")
    void myA
    void myB
    void enemyA
    void enemyB
}

console.log("=== 10. pay：cost destroyNexus(side:own) → then nexusCoresToTrash ===")
{
    const s = game("case10")
    const ownNexus = createInstance(NEXUS, s.turn, 0)
    const oppNexus = createInstance(NEXUS, s.turn, 0)
    oppNexus.cores = 2
    s.players.p1.field.nexuses.push(ownNexus)
    s.players.p2.field.nexuses.push(oppNexus)
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "destroyNexus", side: "own", count: 1 },
        then: { type: "nexusCoresToTrash", side: "opponent" },
    })
    assert(s.players.p1.field.nexuses.length === 0, "自分側ネクサスを破壊した")
    assert(s.players.p2.trashCores === 2, "相手ネクサスのコアがトラッシュへ置かれた")
}
{
    // 相手ネクサスにコアが無ければ不発（コストも払わない）
    const s = game("case10b")
    const ownNexus = createInstance(NEXUS, s.turn, 0)
    const oppNexus = createInstance(NEXUS, s.turn, 0)
    s.players.p1.field.nexuses.push(ownNexus)
    s.players.p2.field.nexuses.push(oppNexus)
    resolveAction(s, "p1", null, {
        type: "pay",
        cost: { type: "destroyNexus", side: "own", count: 1 },
        then: { type: "nexusCoresToTrash", side: "opponent" },
    })
    assert(s.players.p1.field.nexuses.length === 1, "コストのネクサスは破壊されなかった")
}

console.log("すべてのチェックに合格しました 🎉（part357）")
