// 効果文から作った期待値（docs/design/EFFECT_SPEC_RULES.md）を、実際にエンジンで動かして確かめる。
// 使い方: npx tsx scripts/audit-spec-dynamic.ts <期待値.json>...
// 各 fieldEvent エントリについて、場面を自動で作って誘発を起こし、「誰の何が変わったか」を期待値と比べる。
// 条件つきの効果（系統・コスト・BP・キーワードの絞り込みなど）が汎用の場面で発火しなかったときは
// 失敗ではなく「判定不能」に数える。
import { readFileSync } from "node:fs"
import { createGame, createInstance, fireFieldEventTriggers, getCard, refreshLevelAsOverrides, runTurnStart } from "./smoke/helpers"
import type { GameState, PlayerId } from "./smoke/helpers"
import { ALL_CARDS } from "../server/src/logic/GameState"
import { instColors } from "../server/src/logic/EffectModules"
import { loadAllCards } from "../data/loadCards"

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

type Clause = { text: string; trigger?: { kind?: string; event?: string | null; subject?: string | null }; actor?: string | null; op?: string | null; target?: { ref?: string | null }; amount?: number | string | null; unclassified?: string | null }
type Data = {
    id: string; kind: string; event: string; levels?: number[] | null; subjectSide?: string; turn?: string; phase?: string
    colorFilter?: string; keywordFilter?: string; familyFilter?: string | string[]; costFilter?: { max?: number; min?: number }; maxBp?: number
    action?: { type: string; count?: number; amount?: number }
}
type Card = { cardId: string; type: string; effects: Data[]; levels: { level: number; cores: number; bp: number }[]; colors: string[]; family?: string[]; cost: number }

const cards = new Map((loadAllCards() as unknown as Card[]).map((c) => [c.cardId, c]))

function pickSubject(e: Data, sourceId: string): string {
    const wantFamilies = e.familyFilter === undefined ? null : Array.isArray(e.familyFilter) ? e.familyFilter : [e.familyFilter]
    const ok = (c: Card): boolean =>
        c.type === "spirit" && c.cardId !== sourceId &&
        (e.keywordFilter === undefined ? c.effects.length === 0 : c.effects.some((x) => (x as unknown as { kind: string; keyword?: string }).kind === "keyword" && (x as unknown as { keyword?: string }).keyword === e.keywordFilter)) &&
        (e.colorFilter === undefined || c.colors.includes(e.colorFilter)) &&
        (wantFamilies === null || (c.family ?? []).some((f) => wantFamilies.includes(f))) &&
        (e.costFilter?.max === undefined || c.cost <= e.costFilter.max) && (e.costFilter?.min === undefined || c.cost >= e.costFilter.min) &&
        (e.maxBp === undefined || (c.levels[0]?.bp ?? 0) <= e.maxBp)
    const pool = [...cards.values()].filter(ok)
    return (pool[0] ?? cards.get("BS01-001")!).cardId
}

type Verdict = { kind: "pass" | "fail" | "skip"; detail: string }

function run(specId: string, c: Clause, e: Data): Verdict {
    const src = cards.get(specId)!
    if (src.type !== "spirit" && src.type !== "nexus") return { kind: "skip", detail: `発生源が${src.type}` }
    const s: GameState = createGame("dyn-" + e.id, { p1: "A", p2: "B" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turn = 3
    const lv = e.levels?.[0] ?? 1
    const cores = Math.max(1, src.levels.find((l) => l.level === lv)?.cores ?? 1)
    const source = createInstance(specId, s.turn, cores)
    const subjectSideOpp = e.subjectSide !== "own" && (e.subjectSide === "opponent" || c.trigger?.subject === "opponent") && !e.event.startsWith("own")
    const subjectPid: PlayerId = subjectSideOpp ? "p2" : "p1"
    const subject = createInstance(pickSubject(e, specId), s.turn, 3)
    if (src.type === "spirit") s.players.p1.field.spirits.push(source)
    else s.players.p1.field.nexuses.push(source)
    s.players[subjectPid].field.spirits.push(subject)
    refreshLevelAsOverrides(s)
    if (e.turn === "own") s.turnPlayer = "p1"
    if (e.turn === "opponent") s.turnPlayer = "p2"
    if (e.phase) s.phase = e.phase as GameState["phase"]
    const op = c.op ?? ""
    const restedBefore = op === "回復させる"
    source.isRested = restedBefore
    subject.isRested = restedBefore
    const hand = { p1: s.players.p1.hand.length, p2: s.players.p2.hand.length }
    try {
        fireFieldEventTriggers(s, "p1", e.event as never, EVENTS_WITH_SUBJECT.has(e.event) ? { pid: subjectPid, inst: subject } : undefined, instColors(subject))
    } catch (err) {
        return { kind: "skip", detail: `例外: ${(err as Error).message.slice(0, 40)}` }
    }
    const gone = (inst: { instanceId: string; pendingDestruction?: boolean }, pid: PlayerId): boolean => {
        const zone = inst === source && src.type === "nexus" ? s.players[pid].field.nexuses : s.players[pid].field.spirits
        return !zone.some((x) => x.instanceId === inst.instanceId) || inst.pendingDestruction === true
    }
    if (op === "ドロー") {
        const d1 = s.players.p1.hand.length - hand.p1
        const d2 = s.players.p2.hand.length - hand.p2
        if (d1 === 0 && d2 === 0) return { kind: "skip", detail: "発火せず（条件が合わない）" }
        return c.actor === "owner" && d1 > 0 && d2 === 0 ? { kind: "pass", detail: "持ち主がドロー" } : { kind: "fail", detail: `ドローしたのは p1:${d1} p2:${d2}（効果文は持ち主）` }
    }
    const changed = (inst: typeof source, pid: PlayerId): boolean => (op === "回復させる" ? !inst.isRested : op === "疲労させる" ? inst.isRested : gone(inst, pid))
    const srcChanged = changed(source, "p1")
    const subChanged = changed(subject, subjectPid)
    if (!srcChanged && !subChanged) return { kind: "skip", detail: "発火せず（条件が合わない）" }
    const expectSource = c.target?.ref === "source"
    const expectSubject = c.target?.ref === "prevClause"
    if (expectSource) return srcChanged && !subChanged ? { kind: "pass", detail: "発生源に作用" } : { kind: "fail", detail: `効果文は発生源を指すが、変化したのは 発生源:${srcChanged} イベント対象:${subChanged}` }
    if (expectSubject) return subChanged && !srcChanged ? { kind: "pass", detail: "イベント対象に作用" } : { kind: "fail", detail: `効果文はイベント対象を指すが、変化したのは 発生源:${srcChanged} イベント対象:${subChanged}` }
    return { kind: "skip", detail: "対象の期待値なし" }
}

const tally = { pass: 0, fail: 0, skip: 0 }
const lines: string[] = []
for (const file of process.argv.slice(2)) {
    for (const spec of JSON.parse(readFileSync(file, "utf8")) as { id: string; clauses: Clause[] }[]) {
        const card = cards.get(spec.id)
        if (!card) continue
        const used = new Set<string>()
        for (const c of spec.clauses) {
            if (c.unclassified || c.trigger?.kind !== "field" || !c.trigger.event || !c.op || !OP_PREFIX[c.op]) continue
            const events = EVENT_ALIASES[c.trigger.event] ?? []
            const eff = card.effects.find((e) => e.kind === "fieldEvent" && !used.has(e.id) && events.includes(e.event) && OP_PREFIX[c.op!]!.some((p) => e.action?.type.startsWith(p)))
            if (!eff) continue
            used.add(eff.id)
            if (c.op !== "ドロー" && c.target?.ref !== "source" && c.target?.ref !== "prevClause") continue
            const v = run(spec.id, c, eff)
            tally[v.kind]++
            if (v.kind === "fail") lines.push(`❌ ${spec.id} ${eff.id}（${eff.event}）「${c.text.slice(0, 30)}」: ${v.detail}`)
            else if (process.env.VERBOSE) lines.push(`${v.kind === "pass" ? "✅" : "・"} ${spec.id} ${eff.id}: ${v.detail}`)
        }
    }
}
for (const l of [...new Set(lines)]) console.log(l)
console.log(`動的検証: 合格 ${tally.pass} / 失敗 ${tally.fail} / 判定不能 ${tally.skip}`)
process.exit(tally.fail === 0 ? 0 : 1)
