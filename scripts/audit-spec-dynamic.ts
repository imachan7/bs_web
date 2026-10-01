// 効果文から作った期待値（docs/design/EFFECT_SPEC_RULES.md）を、実際にエンジンで動かして確かめる。
// 使い方: npx tsx scripts/audit-spec-dynamic.ts <期待値.json>...
// 各 fieldEvent エントリについて、
//   肯定の場面：効果文の条件をすべて満たす盤面で誘発を起こし、「誰の何が変わったか」を期待値と比べる。
//   否定の場面：条件の軸を1つだけ破った盤面で誘発を起こし、何も起きないことを確かめる（軸の数＋1場面。全組み合わせはしない）。
// 否定の軸は、データではなく**効果文**（期待値の conds）から取る。データから取ると「データどおりに動く」ことしか確かめられない。
// 肯定の場面で発火しなかった効果（合体中のみ・条件が合わない等）は、否定も含めて「判定不能」にする。
import { readFileSync } from "node:fs"
import { createGame, createInstance, destroySpirit, fireFieldEventTriggers, refreshLevelAsOverrides, runTurnStart } from "./smoke/helpers"
import type { GameState, PlayerId } from "./smoke/helpers"
import { instColors } from "../server/src/logic/EffectModules"
import { attachBrave } from "../server/src/logic/brave"
import { loadAllCards } from "../data/loadCards"
import type { Conds } from "./spec-skeleton"

// audit-spec-vs-data.ts と同じ対応表（あちらはスクリプトで副作用があるため共有できない）
const EVENT_ALIASES: Record<string, string[]> = {
    "疲労した": ["ownSpiritExhausted", "anySpiritExhausted"], "召喚された": ["ownSpiritSummoned", "anyBraveSummoned"],
    "破壊された": ["ownSpiritDestroyed", "opponentSpiritDestroyed"], "アタックした": ["anySpiritAttacked"],
    "ブロックされた": ["ownSpiritBlocked"], "ブロックした": ["ownSpiritDeclaredBlock", "anySpiritDeclaredBlock"],
    "合体した": ["anySpiritCombined"], "回復した": ["ownSpiritRefreshed", "anySpiritRefreshed"],
    "手札に戻った": ["ownSpiritReturnedToHand", "anySpiritReturnedToHand"], "ライフが減った": ["ownLifeDamaged", "opponentLifeDamaged", "ownSpiritDealtLife"],
    "ドローした": ["opponentDrew", "opponentDrewByEffect"], "マジックを使用した": ["ownMagicUsed", "opponentMagicUsed"],
}
const OP_PREFIX: Record<string, string[]> = { "回復させる": ["refreshSelf"], "疲労させる": ["exhaustSelf"], "破壊": ["destroySelf"], "ドロー": ["draw"] }
const EVENTS_WITH_SUBJECT = new Set([
    "ownSpiritExhausted", "anySpiritExhausted", "ownSpiritSummoned", "anySpiritAttacked", "anySpiritCombined", "ownSpiritBlocked",
    "ownSpiritDestroyed", "ownSpiritRefreshed", "anySpiritRefreshed", "ownSpiritReturnedToHand", "anySpiritReturnedToHand",
    "ownSpiritDealtLife", "ownSpiritDeclaredBlock", "anySpiritDeclaredBlock", "anyBraveSummoned",
])

// イベントの性質上、自然な場面では動かせない軸（これを破った場面は現実に起きないので作らない）
// - アタック／ブロックのイベントは、そのステップ（attack）でしか起きず、起こすのはそのターンのプレイヤーの側
const ATTACK_EVENTS = new Set(["anySpiritAttacked", "anySpiritDeclaredBlock", "ownSpiritDeclaredBlock", "ownSpiritBlocked", "ownSpiritDealtLife"])
// - 陣営が名前に入っているイベント（own*／opponent*）は、陣営を破る場面が作れない
const impliedAxis = (event: string, a: Axis): boolean =>
    (ATTACK_EVENTS.has(event) && (a === "phase" || a === "turn")) || (a === "side" && (event.startsWith("own") || event.startsWith("opponent")))
// 見出しのステップ限定（phase／turn）がデータに無いだけの場合は、効果の性質上そのステップでしか起きない可能性がある
// （SEMANTICS_AUDIT.md §3.3）。失敗ではなく「要確認」に分ける
const SOFT_AXES = new Set<Axis>(["phase", "turn"])

type Clause = { text: string; trigger?: { kind?: string; event?: string | null; subject?: string | null }; actor?: string | null; op?: string | null; target?: { ref?: string | null }; conds?: Conds | null; unclassified?: string | null }
type Data = { id: string; kind: string; event: string; levels?: number[] | null; subjectSide?: string; turn?: string; phase?: string; action?: { type: string } }
type Card = { cardId: string; type: string; effects: (Data & { keyword?: string })[]; levels: { level: number; cores: number; bp: number }[]; colors: string[]; family?: string[]; cost: number }

const cards = new Map((loadAllCards() as unknown as Card[]).map((c) => [c.cardId, c]))
const spirits = [...cards.values()].filter((c) => c.type === "spirit")

type Axis = "families" | "colors" | "cost" | "bp" | "keyword" | "excludeSelf" | "side" | "turn" | "phase"

// 軸 violate だけを破り、ほかの軸はすべて満たすスピリット。無ければ null
function pickSubject(cd: Conds, sourceId: string, violate: Axis | null): string | null {
    const hasKw = (c: Card, kw: string): boolean => c.effects.some((x) => x.kind === "keyword" && x.keyword === kw)
    const ok = (c: Card): boolean => {
        if (c.cardId === sourceId) return false
        const bp = c.levels[0]?.bp ?? 0
        const fam = cd.families.length === 0 || (c.family ?? []).some((f) => cd.families.includes(f))
        const col = cd.colors.length === 0 || c.colors.some((x) => cd.colors.includes(x))
        const costOk = (cd.costMax === null || c.cost <= cd.costMax) && (cd.costMin === null || c.cost >= cd.costMin)
        const bpOk = cd.bpMax === null || bp <= cd.bpMax
        const kw = cd.keyword === null || hasKw(c, cd.keyword)
        const plain = cd.keyword !== null || c.effects.length === 0
        if (!plain) return false
        return (violate === "families" ? !fam : fam) && (violate === "colors" ? !col : col) && (violate === "cost" ? !costOk : costOk) &&
            (violate === "bp" ? !bpOk : bpOk) && (violate === "keyword" ? !kw && c.effects.length === 0 : kw)
    }
    return spirits.find(ok)?.cardId ?? null
}

type Scene = { s: GameState; source: ReturnType<typeof createInstance>; subject: ReturnType<typeof createInstance>; subjectPid: PlayerId; srcType: string }

function build(specId: string, c: Clause, e: Data, cd: Conds, violate: Axis | null): Scene | null {
    const src = cards.get(specId)!
    if (src.type !== "spirit" && src.type !== "nexus" && src.type !== "brave") return null
    const s = createGame("dyn-" + e.id, { p1: "A", p2: "B" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turn = 3
    const lv = e.levels?.[0] ?? 1
    const own = createInstance(specId, s.turn, Math.max(1, src.levels.find((l) => l.level === lv)?.cores ?? 1))
    // ブレイヴは、ホストのスピリットに合体させる。効果が作用する「発生源」は合体スピリット（ホスト）
    const host = src.type === "brave" ? createInstance("BS01-001", s.turn, 3) : null
    const source = host ?? own
    const wantOpp = (cd.side === "opponent" || e.subjectSide === "opponent") && !e.event.startsWith("own")
    const oppSide = violate === "side" ? !wantOpp : wantOpp
    if (violate === "side" && e.event.startsWith("own")) return null
    const subjectPid: PlayerId = oppSide ? "p2" : "p1"
    let subject: ReturnType<typeof createInstance>
    if (violate === "excludeSelf") {
        if (src.type === "nexus") return null
        subject = source
    } else {
        const id = pickSubject(cd, specId, violate && !["side", "excludeSelf", "turn", "phase"].includes(violate) ? violate : null)
        if (id === null) return null
        subject = createInstance(id, s.turn, 3)
    }
    if (src.type === "nexus") s.players.p1.field.nexuses.push(source)
    else s.players.p1.field.spirits.push(source)
    if (subject !== source) s.players[subjectPid].field.spirits.push(subject)
    refreshLevelAsOverrides(s)
    if (host) attachBrave(s, "p1", host, own)
    const turn = e.turn ?? cd.turn
    const phase = e.phase ?? cd.phase
    s.turnPlayer = turn === "opponent" ? "p2" : "p1"
    if (turn === "own" || turn === "opponent") s.turnPlayer = turn === "own" ? "p1" : "p2"
    if (violate === "turn" && (turn === "own" || turn === "opponent")) s.turnPlayer = turn === "own" ? "p2" : "p1"
    if (ATTACK_EVENTS.has(e.event)) s.turnPlayer = subjectPid
    s.phase = (phase ?? "attack") as GameState["phase"]
    if (violate === "phase" && phase) s.phase = (phase === "main" ? "attack" : "main") as GameState["phase"]
    const rested = c.op === "回復させる"
    source.isRested = rested
    subject.isRested = rested
    return { s, source, subject, subjectPid, srcType: src.type === "nexus" ? "nexus" : "spirit" }
}

type Result = { fired: boolean; srcChanged: boolean; subChanged: boolean; d1: number; d2: number }

function fire(sc: Scene, c: Clause, e: Data): Result | null {
    const { s, source, subject, subjectPid } = sc
    const hand = { p1: s.players.p1.hand.length, p2: s.players.p2.hand.length }
    try {
        // 破壊のイベントは、実際に破壊して起こす（破壊待機・破壊後の誘発の順序を本物の経路に任せる）
        if (e.event === "ownSpiritDestroyed" && subject !== source) destroySpirit(s, subjectPid, subject.instanceId, "destroy")
        else fireFieldEventTriggers(s, "p1", e.event as never, EVENTS_WITH_SUBJECT.has(e.event) ? { pid: subjectPid, inst: subject } : undefined, instColors(subject))
    } catch {
        return null
    }
    const op = c.op ?? ""
    const gone = (inst: { instanceId: string; pendingDestruction?: boolean }, pid: PlayerId): boolean => {
        const zone = inst === source && sc.srcType === "nexus" ? s.players[pid].field.nexuses : s.players[pid].field.spirits
        return !zone.some((x) => x.instanceId === inst.instanceId) || inst.pendingDestruction === true
    }
    const changed = (inst: typeof source, pid: PlayerId): boolean => (op === "回復させる" ? !inst.isRested : op === "疲労させる" ? inst.isRested : gone(inst, pid))
    const d1 = s.players.p1.hand.length - hand.p1
    const d2 = s.players.p2.hand.length - hand.p2
    const srcChanged = op === "ドロー" ? false : changed(source, "p1")
    const subChanged = op === "ドロー" || subject === source ? false : changed(subject, subjectPid)
    return { fired: srcChanged || subChanged || d1 !== 0 || d2 !== 0, srcChanged, subChanged, d1, d2 }
}

const AXES: Axis[] = ["families", "colors", "cost", "bp", "keyword", "excludeSelf", "side", "turn", "phase"]
const hasAxis = (cd: Conds, a: Axis, e: Data): boolean =>
    a === "families" ? cd.families.length > 0 : a === "colors" ? cd.colors.length > 0 : a === "cost" ? cd.costMax !== null || cd.costMin !== null
    : a === "bp" ? cd.bpMax !== null : a === "keyword" ? cd.keyword !== null : a === "excludeSelf" ? cd.excludeSelf
    : a === "side" ? cd.side === "own" || cd.side === "opponent" : a === "turn" ? (e.turn ?? cd.turn) !== undefined && (e.turn ?? cd.turn) !== null : (e.phase ?? cd.phase) != null

const tally = { positive: 0, negative: 0, fail: 0, review: 0, skip: 0 }
const lines: string[] = []
for (const file of process.argv.slice(2)) {
    for (const spec of JSON.parse(readFileSync(file, "utf8")) as { id: string; clauses: Clause[] }[]) {
        const card = cards.get(spec.id)
        if (!card) continue
        const used = new Set<string>()
        for (const c of spec.clauses) {
            if (c.unclassified || c.trigger?.kind !== "field" || !c.trigger.event || !c.op || !OP_PREFIX[c.op]) continue
            const events = EVENT_ALIASES[c.trigger.event] ?? []
            const e = card.effects.find((x) => x.kind === "fieldEvent" && !used.has(x.id) && events.includes(x.event) && OP_PREFIX[c.op!]!.some((p) => x.action?.type.startsWith(p)))
            if (!e) continue
            used.add(e.id)
            const selfLike = e.action?.type.endsWith("Self") === true
            if (c.op !== "ドロー" && c.target?.ref !== "source" && c.target?.ref !== "prevClause") continue
            if (selfLike === false && c.op !== "ドロー") continue
            const cd = c.conds
            const where = `${spec.id} ${e.id}（${e.event}）「${c.text.slice(0, 26)}」`
            if (!cd) { tally.skip++; continue }
            const base = build(spec.id, c, e, cd, null)
            const r = base ? fire(base, c, e) : null
            if (!base || !r || !r.fired) { tally.skip++; if (process.env.VERBOSE) lines.push(`・ ${where}: 肯定の場面で発火せず（判定不能）`); continue }
            // 肯定の場面の判定
            if (c.op === "ドロー") {
                const good = c.actor === "owner" && r.d1 > 0 && r.d2 === 0
                tally.positive++
                if (!good) { tally.fail++; lines.push(`❌ ${where}: ドローしたのは p1:${r.d1} p2:${r.d2}（効果文は持ち主）`) }
            } else {
                const wantSrc = c.target?.ref === "source"
                const good = wantSrc ? r.srcChanged && !r.subChanged : r.subChanged && !r.srcChanged
                tally.positive++
                if (!good) { tally.fail++; lines.push(`❌ ${where}: 効果文は${wantSrc ? "発生源" : "イベント対象"}を指すが、変化したのは 発生源:${r.srcChanged} イベント対象:${r.subChanged}`) }
            }
            // 否定の場面：軸を1つずつ破る
            for (const axis of AXES) {
                if (!hasAxis(cd, axis, e) || impliedAxis(e.event, axis)) continue
                const neg = build(spec.id, c, e, cd, axis)
                const nr = neg ? fire(neg, c, e) : null
                if (!neg || !nr) continue
                tally.negative++
                if (nr.fired && SOFT_AXES.has(axis)) { tally.review++; lines.push(`⚠ ${where}: 見出しの「${axis}」の限定がデータに無く、破った場面でも発火する（要確認）`) }
                else if (nr.fired) { tally.fail++; lines.push(`❌ ${where}: 条件「${axis}」を破った場面でも発火した`) }
                else if (process.env.VERBOSE) lines.push(`✅ ${where}: 「${axis}」を破ると発火しない`)
            }
        }
    }
}
for (const l of [...new Set(lines)]) console.log(l)
console.log(`動的検証: 肯定 ${tally.positive}場面 / 否定 ${tally.negative}場面 / 失敗 ${tally.fail} / 要確認 ${tally.review} / 判定不能 ${tally.skip}`)
process.exit(tally.fail === 0 ? 0 : 1)
