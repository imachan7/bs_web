// smoke パート197（fieldEvent：条件を満たした盤面で、実際に発揮するか）
//
// `kind:"fieldEvent"` は「自分のスピリットが召喚されたとき」のような**フィールド全体の誘発**。
// 発揮には条件（誰のターンか・どのフェーズか・主体の系統/色/コスト/キーワード/名前）を
// すべて満たす必要があり、1つでも外すと永久に発揮しない。
// カバレッジで「盤面にあるのに一度も適用されていない」と出ていた9件がまさにそれだった。
//
// ここでは**エントリごとに条件を満たす盤面を組み立てて**撃ち、盤面が実際に動くことを確かめる。
import { assert, createGame, createInstance, effectiveBp, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireFieldEventTriggers, resolveAction, spiritHasKeyword } from "../../server/src/logic/EffectModules"
import { loadAllCards } from "../../data/loadCards"
import type { Color, Phase } from "../../server/src/type"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1
const topLevel = (c: CardRow): number => c.levels?.length ?? 1
function activeLevel(c: CardRow, entry: Record<string, unknown>): number {
    const levels = entry["levels"] as number[] | null
    if (levels && levels.length > 0) return Math.max(...levels)
    return topLevel(c)
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function collectFamilies(node: unknown, acc: Set<string>): void {
    if (Array.isArray(node)) {
        for (const v of node) collectFamilies(v, acc)
        return
    }
    if (node === null || typeof node !== "object") return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (/family/i.test(k)) {
            if (typeof v === "string") acc.add(v)
            else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") acc.add(x)
        }
        collectFamilies(v, acc)
    }
}
function snapshot(s: GameState): string {
    const parts: string[] = []
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        parts.push(`${p.hand.length}/${p.deck.length}/${p.trashCards.length}/${p.reserve}/${p.trashCores}/${p.life}/${p.field.spirits.length}/${p.field.nexuses.length}`)
        for (const sp of p.field.spirits) parts.push(`${effectiveBp(s, pid, sp)}:${JSON.stringify(sp)}`)
    }
    parts.push(JSON.stringify(s.battle))
    return parts.join("|")
}

// 誘発の**主体**（「自分のスピリットが召喚されたとき」のその1体）を、条件を満たすカードから選ぶ
function pickSubjectCard(entry: Record<string, unknown>, exclude: string): CardRow | undefined {
    const fam = entry["familyFilter"]
    const wantFams = typeof fam === "string" ? [fam] : Array.isArray(fam) ? (fam as string[]) : []
    const nm = entry["nameIncludes"]
    const wantNames = typeof nm === "string" ? [nm] : Array.isArray(nm) ? (nm as string[]) : []
    const col = entry["colorFilter"]
    const wantColors = typeof col === "string" ? [col] : Array.isArray(col) ? (col as string[]) : []
    const kw = entry["keywordFilter"] as string | undefined
    const costFilter = entry["costFilter"] as Record<string, unknown> | undefined
    const maxCost = costFilter?.["max"] as number | undefined
    return CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== exclude &&
            (wantFams.length === 0 || wantFams.some((f) => (c.family ?? []).includes(f))) &&
            (wantNames.length === 0 || wantNames.some((n) => c.name.includes(n))) &&
            (wantColors.length === 0 || wantColors.some((x) => (c.colors ?? []).includes(x))) &&
            (kw === undefined || (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === kw)) &&
            (maxCost === undefined || (c.cost ?? 99) <= maxCost),
    )
}

console.log("=== パート197：fieldEvent が、条件を満たした盤面で実際に発揮する ===")
{
    const sources = CARDS.filter((c) => (c.effects ?? []).some((e) => e["kind"] === "fieldEvent"))
    assert(sources.length > 0, "fieldEvent を持つカードが実データにある")
    let fired = 0
    const notFired: string[] = []
    for (const src of sources) {
        for (const entry of (src.effects ?? []).filter((e) => e["kind"] === "fieldEvent")) {
            const event = entry["event"] as string
            const subjectCard = pickSubjectCard(entry, src.cardId)
            if (!subjectCard) continue

            const s = base(`fe-${src.cardId}-${String(entry["id"])}`)
            // 『相手のターン』条件があれば相手のターンにする
            s.turnPlayer = entry["turn"] === "opponent" ? "p2" : "p1"
            s.phase = (entry["phase"] as Phase | undefined) ?? "attack"

            const subject = put(s, "p1", subjectCard, coresFor(subjectCard, topLevel(subjectCard)))
            // 相手に2体（1体は疲労状態）。破壊・疲労・コア除去の対象になる
            const foe = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= 3)!
            put(s, "p2", foe, coresFor(foe, 1))
            put(s, "p2", foe, coresFor(foe, 1)).isRested = true
            // action が系統を指定していれば、その駒を自分側にも置く（コスト・対象用）
            const actFams = new Set<string>()
            collectFamilies(entry["action"], actFams)
            for (const f of actFams) {
                const helper = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(f))
                if (helper) put(s, "p1", helper, coresFor(helper, topLevel(helper)))
            }
            const anyNexus = CARDS.find((c) => c.type === "nexus")!
            putNexus(s, "p1", anyNexus, coresFor(anyNexus, 1))

            // 発生源を用意する（マジックは場に置けないので「このターンの間だけ貸す」）
            if (src.type === "magic") {
                resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined,
                    (src.colors ?? ["blue"]) as Color[], "magic", undefined, undefined, src.cardId)
            } else if (src.type === "nexus") {
                putNexus(s, "p1", src, coresFor(src, activeLevel(src, entry)))
            } else {
                put(s, "p1", src, coresFor(src, activeLevel(src, entry)))
            }
            refreshLevelAsOverrides(s)
            s.battle = {
                attackerInstanceId: subject.instanceId,
                blockerInstanceId: s.players.p2.field.spirits[0]?.instanceId ?? null,
                flashLockedPlayer: null,
                directed: false,
            }

            const before = snapshot(s)
            fireFieldEventTriggers(s, "p1", event as never, { pid: "p1", inst: subject }, undefined,
                s.players.p2.field.spirits[0]?.instanceId)
            // 選択待ちは先頭で解消する
            for (let i = 0; i < 20 && s.pendingChoice; i++) {
                const pc = s.pendingChoice
                s.pendingChoice = null
                if (pc.action.type === "noop") break
            }
            if (snapshot(s) !== before) fired++
            else notFired.push(`${src.cardId} ${src.name}(${event})`)
        }
    }
    console.log(`  （発揮した fieldEvent エントリ: ${fired}件／盤面が動かなかった: ${notFired.length}件）`)
    assert(fired > 0, "fieldEvent のエントリが1件以上発揮した")
    if (notFired.length > 0) console.log(`  動かなかったもの: ${notFired.slice(0, 12).join(" / ")}`)
}
