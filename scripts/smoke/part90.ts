// smoke パート90（簡略化の解消：破壊する「自分の」カードをプレイヤーが選べるようにする）
//
//   - BS02-075 天使長プリンシパール（destroyOwnByCost）: 破壊する自分のスピリットを選ぶ
//   - BS02-095 サクリファイス（sacrificeNexusThenWipeEnemyNexusCores）: 破壊する自分のネクサスを選ぶ
//
// どちらも従来は決定的な自動選択（コスト最大／コア数最小）だった。
// interactiveTargets（実対戦）ではプレイヤーが選び、テスト既定（false）では従来どおり自動選択。
import { act, assert, createGame, createInstance, resolveAction } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS02-075 天使長プリンシパール：破壊する自分のスピリットを選べる ===")
{
    const s = setup("principal-choice-test")
    s.interactiveTargets = true
    const cheap = put(s, "p1", "BS01-001", 1) // ゴラドン（コスト0）
    const pricey = put(s, "p1", "BS01-054", 1) // ショックイーター（コスト2）＝自動選択ならこちら

    resolveAction(s, "p1", null, { type: "destroyOwnByCost", maxCost: 4, gainCoresEqualCost: true }, undefined, undefined, "spirit")
    assert(s.pendingChoice !== null, "破壊する自分のスピリットの選択待ちが立つ")
    const cands = s.pendingChoice?.candidates ?? []
    assert(cands.includes(cheap.instanceId) && cands.includes(pricey.instanceId), "自分のスピリットが候補になる")

    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice", instanceId: cheap.instanceId }) === null, "コストの低い方を選ぶ")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === cheap.instanceId),
        "選んだスピリットが破壊される",
    )
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === pricey.instanceId),
        "自動選択されていた方は残る",
    )
    // 破壊でスピリット上のコア1個がリザーブへ戻り、さらにコスト（ゴラドンは0）ぶんを得る
    assert(s.players.p1.reserve === reserveBefore + 1, "破壊した個体のコアが戻り、コスト0ぶんの追加は無い")
}

console.log("--- 非対話時は従来どおりコスト最大を自動選択 ---")
{
    const s = setup("principal-auto-test")
    const cheap = put(s, "p1", "BS01-001", 1)
    const pricey = put(s, "p1", "BS01-054", 1)

    resolveAction(s, "p1", null, { type: "destroyOwnByCost", maxCost: 4, gainCoresEqualCost: true }, undefined, undefined, "spirit")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === pricey.instanceId),
        "コスト最大のスピリットが自動で破壊される",
    )
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === cheap.instanceId), "もう一方は残る")
}

console.log("=== BS02-095 サクリファイス：破壊する自分のネクサスを選べる ===")
{
    const s = setup("sacrifice-choice-test")
    s.interactiveTargets = true
    const few = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場（コア0）＝自動選択ならこちら
    const many = createInstance("BS01-102", s.turn, 2) // 主無き古城（コア2）
    s.players.p1.field.nexuses.push(few, many)
    const enemyNexus = createInstance("BS01-098", s.turn, 3)
    s.players.p2.field.nexuses.push(enemyNexus)

    resolveAction(s, "p1", null, { type: "sacrificeNexusThenWipeEnemyNexusCores" }, undefined, undefined, "magic")
    assert(s.pendingChoice !== null, "破壊する自分のネクサスの選択待ちが立つ")
    const cands = s.pendingChoice?.candidates ?? []
    assert(cands.includes(few.instanceId) && cands.includes(many.instanceId), "自分のネクサスが候補になる")

    assert(act(s, "p1", { type: "resolveChoice", instanceId: many.instanceId }) === null, "コア数の多い方を選ぶ")
    assert(
        !s.players.p1.field.nexuses.some((x) => x.instanceId === many.instanceId),
        "選んだネクサスが破壊される",
    )
    assert(
        s.players.p1.field.nexuses.some((x) => x.instanceId === few.instanceId),
        "自動選択されていた方は残る",
    )
    assert(enemyNexus.cores === 0, "相手のネクサス上のコアがすべてトラッシュへ")
}

console.log("--- 非対話時は従来どおりコア数最小を自動選択 ---")
{
    const s = setup("sacrifice-auto-test")
    const few = createInstance("BS01-098", s.turn, 0)
    const many = createInstance("BS01-102", s.turn, 2)
    s.players.p1.field.nexuses.push(few, many)

    resolveAction(s, "p1", null, { type: "sacrificeNexusThenWipeEnemyNexusCores" }, undefined, undefined, "magic")
    assert(s.pendingChoice === null, "選択待ちは立たない")
    assert(
        !s.players.p1.field.nexuses.some((x) => x.instanceId === few.instanceId),
        "コア数最小のネクサスが自動で破壊される",
    )
}
