// smoke パート985（効果の出口の列：破壊した数は列が選択待ちで止まっても再開後に元の効果の記録へ書かれる（Q25205）。
// ネクサス・合体中のブレイヴ・スピリットの破壊の誘発は1本の列になり、ターンプレイヤーが順番を決める。2026-11-17 ユーザー決定）
import { act, assert, resolveAction, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const GENERATE = "BS22-073" // ジェネレートファイア（赤・コスト5・メイン：BP3000以下の相手のスピリットすべてを破壊。この効果発揮後、手札のスピリット1枚を、破壊した1体につき1コスト支払ったものとして召喚できる）
const LOCO = "BS11-009" // スモークロコ（紫・コスト1・BP1000。『このスピリットの破壊時』1枚ドロー）
const HEDIRES = "BS01-045" // 切り裂きヘディレス（紫・BP2000。『破壊時』このスピリットを手札に戻す）
const PECKER = "BS20-011" // スモッグペッカー（紫・コスト2。召喚される側）
const GARDEN = "BS07-063" // 秘密の花園（黄ネクサス。自分のネクサスが相手の効果で破壊されたとき、ボイドからコア1個をライフに置く）
const PANDA = "BS21-063" // ぐるみパンダ（黄ブレイヴ。合体するブレイヴ役）
const NEKO = "BS19-093" // ネコロン山（黄白ネクサス。Lv2：自分の合体スピリットのブレイヴだけが破壊されたとき、そのブレイヴを手札に戻せる）

console.log("=== 前提: カードの機械確認 ===")
{
    const chk: [string, string, string][] = [
        [VAN, "ロクケラトプス", "spirit"], [GENERATE, "ジェネレートファイア", "magic"], [LOCO, "スモークロコ", "spirit"],
        [PECKER, "スモッグペッカー", "spirit"], [HEDIRES, "切り裂きヘディレス", "spirit"], [GARDEN, "秘密の花園", "nexus"], [PANDA, "ぐるみパンダ", "brave"], [NEKO, "ネコロン山", "nexus"],
    ]
    for (const [id, name, type] of chk) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}`)
    assert(getCard(PECKER).cost === 2, "スモッグペッカーはコスト2")
}

interface Unit { card: string; cores: number }
interface Side { life?: number; hand?: string[]; spirits?: Unit[]; nexuses?: Unit[] }

function build(seed: string, me: Side, opp: Side) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    const ids: Record<string, string> = {}
    for (const [pid, spec] of [["p1", me], ["p2", opp]] as [PlayerId, Side][]) {
        const p = s.players[pid]
        p.life = spec.life ?? 5
        p.reserve = pid === "p1" ? 6 : 10
        p.hand = [...(spec.hand ?? [])]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
        p.soulCore = null
        const place = (list: Unit[] | undefined, zone: typeof p.field.spirits) => {
            for (const x of list ?? []) {
                const inst = createInstance(x.card, s.turn - 1, x.cores)
                zone.push(inst)
                ids[`${pid}.${x.card}.${zone.length}`] = inst.instanceId
            }
        }
        place(spec.spirits, p.field.spirits)
        place(spec.nexuses, p.field.nexuses)
    }
    refreshLevelAsOverrides(s)
    return { s, ids }
}

type PC = NonNullable<GameState["pendingChoice"]>
function runner(s: GameState) {
    const trace: string[] = []
    const go = (pid: PlayerId, action: GameAction): void => {
        const err = act(s, pid, action)
        assert(err === null, `${action.type} が通る${err === null ? "" : `（拒否: ${err}）`}`)
    }
    const until = (pred: (pc: PC) => boolean): PC | null => {
        for (let i = 0; i < 20; i++) {
            const pc = s.pendingChoice
            if (!pc) return null
            trace.push(`${pc.pid}:${pc.kind}:${pc.prompt}`)
            if (pred(pc)) return pc
            if (pc.kind === "target") go(pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            else if (pc.kind === "card") go(pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 })
            else go(pc.pid, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        }
        return null
    }
    return { go, until, trace }
}

console.log("=== 1. ジェネレートファイア: 区切りの列が順番の選択で止まっても、再開後の「破壊した数につき」は2体ぶん ===")
{
    // 規則（Q25205）「この効果で破壊したスピリット1体につき」は、列を解決し終えて実際にトラッシュに置かれた数
    const { s } = build("settle-1", { hand: [GENERATE, PECKER] }, { spirits: [{ card: LOCO, cores: 1 }, { card: LOCO, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "main" })
    const pc = r.until((c) => /どれから/.test(c.prompt))
    assert(pc !== null, `相手の2体の『破壊時』ドローが1本の列になり、順番を聞かれる（経過: ${r.trace.join(" / ")}）`)
    r.until(() => false)
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットは2体とも破壊された")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === PECKER), `2体破壊ぶんの支払い済みとして、コスト2のスモッグペッカーが召喚された（経過: ${r.trace.join(" / ")}）`)
}

console.log("=== 1b. ジェネレートファイア: 列が順番の選択で止まり、破壊された1体が手札に戻って場に残らなかったとき、数は実際にトラッシュに置かれた1体ぶん ===")
{
    // 規則（Q25205）「破壊した数」は列を解決し終えてトラッシュに置かれた数。止まらなければ1、止まっても同じでなければならない（止まると書かれず、効果の中で数えた2のままだった）
    const { s } = build("settle-1b", { hand: [GENERATE, PECKER] }, { spirits: [{ card: LOCO, cores: 1 }, { card: HEDIRES, cores: 1 }] })
    const r = runner(s)
    r.go("p1", { type: "castMagic", handIndex: 0, timing: "main" })
    const pc = r.until((c) => /どれから/.test(c.prompt))
    assert(pc !== null, `2体の『破壊時』が1本の列になり、順番を聞かれる（経過: ${r.trace.join(" / ")}）`)
    r.until(() => false)
    assert(s.players.p2.hand.includes(HEDIRES) && s.players.p2.field.spirits.length === 0, "ヘディレスは手札に戻り、トラッシュに置かれたのはスモークロコだけ")
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === PECKER), `1体ぶんの支払い済みではコスト2は召喚できない（経過: ${r.trace.join(" / ")}）`)
}

const DESTROY_LOCO = { type: "destroy", count: 1, all: true, filter: { maxBp: 1000 } }

console.log("=== 2. ネクサスとスピリットの破壊: 両方の誘発が1本の列になり、ターンプレイヤーが順番を決める ===")
{
    const { s } = build("settle-2", {}, { spirits: [{ card: LOCO, cores: 1 }], nexuses: [{ card: GARDEN, cores: 0 }] })
    const r = runner(s)
    resolveAction(s, "p1", null, { type: "sequence", actions: [DESTROY_LOCO, { type: "destroy", nexus: "only", count: 1 }] } as never, undefined, undefined, "magic")
    const pc = r.until((c) => /どれから/.test(c.prompt))
    assert(pc !== null, `スピリットの『破壊時』とネクサスの誘発が1本の列になり、順番を聞かれる（経過: ${r.trace.join(" / ")}）`)
    if (pc) {
        assert(pc.pid === "p1", "順番を決めるのはターンプレイヤー（p1）")
        assert(s.players.p2.hand.length === 0 && s.players.p2.life === 5, "順番を聞かれた時点で、どちらの誘発も未解決")
    }
    r.until(() => false)
    assert(s.players.p2.field.nexuses.length === 0 && s.players.p2.trashCards.includes(GARDEN), "確定：ネクサスはトラッシュへ")
    assert(s.players.p2.hand.length === 1, "スピリットの『破壊時』のドローが解決された")
}

console.log("=== 3. 合体中のブレイヴとスピリットの破壊: 両方の誘発が1本の列になる ===")
{
    const { s, ids } = build("settle-3", {}, { spirits: [{ card: "SD01-007", cores: 3 }, { card: LOCO, cores: 1 }], nexuses: [{ card: NEKO, cores: 1 }] })
    const host = s.players.p2.field.spirits.find((x) => x.instanceId === ids[`p2.SD01-007.1`])! // スティラホーン（コスト5・効果なし）。ぐるみパンダの合体条件コスト4以上を満たす
    const brave = createInstance(PANDA, s.turn - 1, 0)
    brave.braveCombined = true
    s.players.p2.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    const r = runner(s)
    resolveAction(s, "p1", null, { type: "sequence", actions: [DESTROY_LOCO, { type: "destroyBrave", allHosts: true }] } as never, undefined, undefined, "magic")
    const pc = r.until((c) => /どれから/.test(c.prompt))
    assert(pc !== null, `スピリットの『破壊時』とブレイヴの誘発が1本の列になり、順番を聞かれる（経過: ${r.trace.join(" / ")}）`)
    if (pc) {
        assert(pc.pid === "p1", "順番を決めるのはターンプレイヤー（p1）")
        assert(s.players.p2.hand.length === 0 && s.players.p2.life === 5, "順番を聞かれた時点で、どちらの誘発も未解決")
    }
    r.until(() => false)
    assert(s.players.p2.field.combinedBraves.length === 0, "確定：ブレイヴは合体中でなくなった")
    assert(s.players.p2.hand.length >= 1, `両方の誘発が解決された（手札 ${s.players.p2.hand.length}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part985）")
