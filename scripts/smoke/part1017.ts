// smoke パート1017（LM13-01 光と闇の聖剣シャイニング・オブ・ダーク／LM13-03 白夜の光剣ミッドナイト・ソーラー。
// 01: 破壊を解決したあとに相手のスピリットを指定してアタック（ユーザー決定 2026-11-20）。03: 【連鎖】の条件無視。期待値は効果文のみから）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { activeConstraints } from "../../shared/rules"

const DARK = "LM13-01" // 光と闇の聖剣シャイニング・オブ・ダーク（赤・ブレイヴ・BP4000）
const SOLAR = "LM13-03" // 白夜の光剣ミッドナイト・ソーラー（白・ブレイヴ）
const WYBORN = "BS20-016" // ワイボーン（紫。e2【連鎖】：赤シンボルがあるとき直接アタック）
const VAN = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000）
const BIG = "BS01-003" // テラノセイバー（赤・Lv2 3コアで BP6000）

console.log("=== 前提: カードの機械確認 ===")
{
    for (const [id, name, type] of [[DARK, "光と闇の聖剣シャイニング・オブ・ダーク", "brave"], [SOLAR, "白夜の光剣ミッドナイト・ソーラー", "brave"], [WYBORN, "ワイボーン", "spirit"], [VAN, "ロクケラトプス", "spirit"], [BIG, "テラノセイバー", "spirit"]] as [string, string, string][])
        assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}`)
}

function build(seed: string, mine: { card: string; cores: number }[], opp: { card: string; cores: number }[]) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = true
    for (const [pid, list] of [["p1", mine], ["p2", opp]] as [PlayerId, typeof mine][]) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
        p.soulCore = null
        p.field.spirits = list.map((x) => createInstance(x.card, s.turn - 1, x.cores))
    }
    refreshLevelAsOverrides(s)
    return s
}

// 合体の条件判定は通さず状態を直接組む
function combine(s: GameState, host: ReturnType<typeof createInstance>, braveId: string): void {
    const brave = createInstance(braveId, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

const log: string[] = []
function pick(s: GameState, pred: (id: string) => boolean): boolean {
    const pc = s.pendingChoice
    if (!pc) return false
    log.push(`${pc.pid}:${pc.kind}:${pc.prompt}`)
    if (pc.kind === "target") {
        const id = pc.candidates.find(pred)
        if (!id) return false
        assert(act(s, pc.pid, { type: "resolveChoice", instanceId: id }) === null, "選択が通る")
        return true
    }
    return false
}

function attackWithDark(seed: string, opp: { card: string; cores: number }[], combined = true) {
    const s = build(seed, [{ card: BIG, cores: 3 }], opp)
    const host = s.players.p1.field.spirits[0]!
    if (combined) combine(s, host, DARK)
    else s.players.p1.field.spirits.push(createInstance(DARK, s.turn - 1, 1)) // スピリット状態のブレイヴ
    refreshLevelAsOverrides(s)
    const err = act(s, "p1", { type: "attack", instanceId: host.instanceId })
    assert(err === null, `アタックできる（${err ?? ""}）`)
    return { s, host }
}

console.log("=== 1. 破壊 → 残った相手のスピリットを指定 → 指定されたスピリットとバトル ===")
{
    const { s, host } = attackWithDark("dark-1", [{ card: VAN, cores: 1 }, { card: BIG, cores: 3 }])
    const weak = { instanceId: "inst-weak-destroyed" } // 破壊済みなので場からは引けない。候補に居ないことだけ確かめる
    const big = s.players.p2.field.spirits.find((x) => x.cardId === BIG)!
    assert(s.players.p2.field.spirits.length === 1, "BP5000以下の相手は破壊され、BP6000の相手が残る")
    // 破壊の候補は1体だけなので自動で解決され、指定の選択が出る時点では破壊済み
    const pc = s.pendingChoice
    assert(pc !== null, `指定の選択が出る（${log.join(" / ")}）`)
    const c2 = pc && "candidates" in pc && pc.candidates ? pc.candidates : []
    assert(c2.length === 1 && c2[0] === big.instanceId && !c2.includes(weak.instanceId), "破壊された個体は指定の候補にいない")
    assert(c2.includes(big.instanceId), "残った相手のスピリットは候補にいる")
    pick(s, (id) => id === big.instanceId)
    // バトルへ：相手はブロックを選べない。両者パスで進める
    for (let i = 0; i < 8 && !s.players.p2.field.spirits.every((x) => x.instanceId !== big.instanceId); i++) {
        const who = s.priorityPlayer
        const a = (s.pendingChoice ? null : { type: "pass" }) as GameAction | null
        if (!a) break
        act(s, who, a)
    }
    assert(s.players.p2.life === 5, `ライフは減らない＝指定されたスピリットとのバトルになった（${s.players.p2.life}）`)
    assert(s.players.p2.field.spirits.every((x) => x.instanceId !== big.instanceId), "指定されたスピリットがバトルで破壊された（合体BP 10000 vs 6000）")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === host.instanceId), "アタックしたスピリットは残る")
}

console.log("=== 2. BP5000以下の相手がいなくても指定には進む ===")
{
    const { s, host } = attackWithDark("dark-2", [{ card: BIG, cores: 3 }])
    const big = s.players.p2.field.spirits[0]!
    const pc = s.pendingChoice
    assert(pc !== null, `選択が出る（${pc?.kind}）`)
    const c = pc && "candidates" in pc && pc.candidates ? pc.candidates : []
    assert(c.includes(big.instanceId), "指定の候補に相手のスピリットがいる")
    assert(s.players.p2.field.spirits.length === 1, "破壊は起きていない")
    void host
}

console.log("=== 3. 合体していない（スピリット状態）では出ない ===")
{
    const { s } = attackWithDark("dark-3", [{ card: VAN, cores: 1 }, { card: BIG, cores: 3 }], false)
    assert(s.pendingChoice === null || s.pendingChoice.pid !== "p1" || s.players.p2.field.spirits.length === 2, "相手は破壊されない")
    assert(s.players.p2.field.spirits.length === 2, "BP5000以下の相手のスピリットが破壊されていない")
}

console.log("=== 4. LM13-03 合体中: 条件を満たさなくても【連鎖】が発揮される ===")
{
    const s = build("solar-1", [{ card: WYBORN, cores: 1 }], [])
    const host = s.players.p1.field.spirits[0]!
    const direct = () => activeConstraints(s, "p1", host).some((c) => c.type === "canDirectAttack")
    assert(!direct(), "赤シンボルが無く合体もしていないので直接アタックできない")
    combine(s, host, SOLAR)
    assert(direct(), "LM13-03 と合体中は条件を無視して【連鎖】が発揮される")
    host.braveRefs = []
    s.players.p1.field.combinedBraves = []
    refreshLevelAsOverrides(s)
    assert(!direct(), "合体を解くと発揮されない")
}

console.log("すべてのチェックに合格しました 🎉（part1017）")
