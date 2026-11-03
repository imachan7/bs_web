// 経路の同値性の総当たり（docs/design/TEST_STRATEGY.md §7）。誘発効果を1つずつ、次の3通りで解決して盤面を比べる。
//   単独       ：その効果だけが誘発する
//   後に相方   ：同じ条件で誘発する「何もしない効果」（相方）と同時に誘発させ、解決順でこの効果を先に選ぶ
//   先に相方   ：相方を先に選ぶ
// 後の2つは解決順の確認・再開スタックを通るので、そこで発生源などを見失うと盤面が食い違う
// （竜騎集う円卓＋賢者の樹の実で【装甲】が抜けた #235 の型）。誤検出を含むので終了コードは常に 0（人が読む道具）。
import { CARDS, buildBoard, drain } from "./smoke/fireAll"
import { fireFieldEventTriggers, fireStepTriggers } from "../server/src/logic/EffectModules"
import { CARD_DB, createInstance } from "../server/src/logic/GameState"
import { handleAction, refreshLevelAsOverrides } from "./smoke/helpers"
import type { GameState, PlayerId } from "./smoke/helpers"
import type { CardData, EffectDef, Phase } from "../server/src/type"

const ECHO_ID = "AUDIT-ECHO"
const echoCard = {
    cardId: ECHO_ID,
    name: "監査の相方",
    type: "nexus",
    colors: ["white"],
    cost: 1,
    reduction: [],
    family: [],
    levels: [{ level: 1, cores: 0 }],
    symbol: [],
    flash: false,
    rarity: "",
    limited: false,
    effect: "",
    effects: [] as EffectDef[],
} as unknown as CardData
CARD_DB.set(ECHO_ID, echoCard)

// 相方の効果：同じ条件で誘発し、何もしない。確認・支払い・ターンの回数制限は外す（相方が先に使い切らないように）。
// 相方は発生源としての Lv・合体を持たず、主体にもなれないので、発生源の Lv・合体の条件と「主体が自分自身」の条件も外す
// （外さないと Lv2 以上の効果や「このスピリットが〜したとき」で相方だけ誘発しない）
function echoOf(e: EffectDef): EffectDef {
    const { optional: _o, cost: _c, thenPay: _p, whileCombined: _w, sourceLevels: _l, sourceMinLevel: _m, selfOnly: _s, eventTargetIsSelf: _t, bySelfEffectOnly: _b, maxPerTurn: _x, ...rest } =
        e as unknown as Record<string, unknown>
    for (const k of Object.keys(rest)) if (/^once/i.test(k)) delete rest[k]
    return { ...rest, id: "AE-e1", levels: null, action: { type: "noop" } } as unknown as EffectDef
}

// 個体の ID は対戦をまたいで通し番号なので、その対戦の中での大小順に振り直す（出てきた順だと、記録の並びの違いで別の番号になる）
function norm(s: GameState): string {
    const raw = JSON.stringify(s, (k, v) => (k === "log" || k === "history" || k === "triggerOrderPick" || k === "resumeInsertAt" || k === "events" ? undefined : v))
    // 通し番号は全カードを回すと6桁を超える（inst-1000000）ので、桁数を決め打ちしない
    const num = (id: string): number => Number(id.slice(5))
    const rank = new Map([...new Set(raw.match(/inst-\d+/g) ?? [])].sort((a, b) => num(a) - num(b)).map((id, i) => [id, `I${i}`]))
    return raw
        .replace(/inst-\d+/g, (m) => rank.get(m)!)
        .replace(/AE-e1/g, "")
        // 記録の枠の ID（randomUUID）。単独で撃つと枠が無く "" になる
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")
}

// 盤面の食い違いを、最初に違った所の前後だけ切り出す
function firstDiff(a: string, b: string): string {
    let i = 0
    while (i < a.length && a[i] === b[i]) i++
    return `単独…${a.slice(Math.max(0, i - 120), i + 80)}\n      経路…${b.slice(Math.max(0, i - 120), i + 80)}`
}

// 無＝この効果を外して撃つ（単独と比べて、効果がそもそも誘発したかを見る）
type Variant = "無" | "単独" | "後に相方" | "先に相方"
// フィールド誘発の撃ち方：誰のイベントとして撃つか（firePid）と、主体（場の何体目のスピリットか）
interface Subj {
    firePid: PlayerId
    pid: PlayerId
    idx: number
    info: boolean // 効果の条件から作った付帯情報（eventInfo）を渡すか
}

// 付帯情報（「戦闘で破壊されたとき」「【不死】で召喚されたとき」など）を、効果側の条件の欄から作る。
// 発生源は p1 に置くので、相手＝p2
function infoFor(e: EffectDef): Record<string, unknown> {
    const f = e as unknown as Record<string, unknown>
    const info: Record<string, unknown> = {}
    const first = <T,>(x: unknown): T | undefined => (Array.isArray(x) ? (x[0] as T) : (x as T | undefined))
    if (f["byBattleOnly"] || f["attackerOnly"]) info["byBattle"] = true
    if (f["attackerOnly"]) info["wasAttacker"] = true
    if (typeof f["destroyedMaxBp"] === "number") info["destroyedBp"] = f["destroyedMaxBp"]
    if (f["byOpponentEffectOnly"] || f["byOpponentOnly"] || f["byOpponentSpiritEffectOnly"] || f["causedByOpponent"]) {
        info["byOpponentEffect"] = true
        info["causePid"] = "p2"
        info["causeType"] = "spirit"
    }
    if (f["byOpponentSpiritEffectOnly"]) info["bySpiritEffect"] = true
    if (f["opponentEffectSourceTypes"]) info["destroySourceType"] = first(f["opponentEffectSourceTypes"])
    if (f["causedByOwnEffect"]) {
        info["causePid"] = "p1"
        info["causeType"] = f["causedByOwnEffect"] === true ? "spirit" : f["causedByOwnEffect"]
    }
    if (f["refreshSourceTypeFilter"]) info["refreshSourceType"] = first(f["refreshSourceTypeFilter"])
    if (f["keywordActivatedFilter"]) info["keyword"] = f["keywordActivatedFilter"]
    if (f["magicCostEquals"] !== undefined) info["magicCost"] = f["magicCostEquals"]
    if (f["magicTiming"]) info["magicTiming"] = f["magicTiming"]
    if (f["nameIncludes"]) info["names"] = f["nameIncludes"]
    if (f["familyFilter"]) info["families"] = Array.isArray(f["familyFilter"]) ? f["familyFilter"] : [f["familyFilter"]]
    if (f["fushiSummonOnly"]) info["byFushi"] = true
    if (f["sokuSummonOnly"]) info["bySoku"] = true
    if (f["keishoSummonOnly"]) info["byKeisho"] = true
    if (f["byOpponentVanishOnly"]) info["vanishedByOpponent"] = true
    if (f["fromHandOnly"]) info["fromHand"] = true
    if (f["paidCostOnly"]) info["paidCost"] = true
    if (f["subjectSide"] === "own") info["gainerPid"] = "p1"
    if (f["subjectSide"] === "opponent") info["gainerPid"] = "p2"
    const cf = f["costFilter"] as { min?: number; max?: number } | undefined
    if (cf) info["costs"] = [cf.min ?? cf.max ?? 0]
    return info
}
// via:"attack"＝誘発を直接撃たず、主体にアタックを宣言させて起こす（アタック宣言の同時発揮の列・アタック後バーストを通す）。
// このときの相方は「スピリットがアタックしたとき、何もしない」（どの効果の列にも同時に入る）
type Via = "direct" | "attack"
const ATTACK_ECHO = { kind: "fieldEvent", event: "anySpiritAttacked", id: "AE-e1", levels: null, action: { type: "noop" } } as unknown as EffectDef
function run(card: CardData, e: EffectDef, tp: PlayerId, ph: Phase, v: Variant, subj: Subj | null, via: Via = "direct"): { s: string; ok: boolean; asked: boolean } | null {
    const saved = Math.random
    let x = 12345
    Math.random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
    try {
        echoCard.effects = v === "単独" || v === "無" ? [] : [via === "attack" ? ATTACK_ECHO : echoOf(e)]
        const db = CARD_DB.get(card.cardId)!
        const own = db.effects
        if (v === "無") db.effects = (own ?? []).filter((x) => x !== e && x.id !== e.id)
        const { s } = buildBoard(card)
        s.interactiveTargets = true
        // 相方は単独のときも置く（盤面の条件を揃える）
        const echo = createInstance(ECHO_ID, s.turn, 0)
        s.players.p1.field.nexuses.push(echo)
        refreshLevelAsOverrides(s)
        s.turnPlayer = tp
        s.phase = ph
        const cond = e as unknown as Record<string, unknown>
        if (via === "attack") {
            const sj = subj!
            const attacker = s.players[sj.pid].field.spirits[sj.idx]!
            attacker.isRested = false
            s.turnPlayer = sj.pid
            s.phase = "attack"
            if (handleAction(s, sj.pid, { type: "attack", instanceId: attacker.instanceId }) !== null) {
                db.effects = own
                return null
            }
        } else if (e.kind === "fieldEvent") {
            const sj = subj ?? { firePid: "p1", pid: "p1", idx: 0, info: false }
            const subject = s.players[sj.pid].field.spirits[sj.idx]!
            const info = sj.info ? infoFor(e) : undefined
            fireFieldEventTriggers(s, sj.firePid, e.event as never, { pid: sj.pid, inst: subject }, getCardColors(subject.cardId), s.players[sj.pid === "p1" ? "p2" : "p1"].field.spirits[0]?.instanceId, undefined, info as never)
        } else {
            fireStepTriggers(s, ph, undefined, ((cond["timing"] as "enter" | "end" | undefined) ?? "enter"))
        }
        // 解決順の確認は、立ったら「この効果」側を選ぶ（後に相方＝先頭、先に相方＝相方が先頭なので末尾を選ぶ）
        let asked = false
        for (let i = 0; i < 40 && s.pendingChoice?.triggerOrder; i++) {
            asked = true
            const pc = s.pendingChoice
            const opts = pc.options ?? []
            const want = opts.find((o) => (v === "先に相方" ? o.includes("監査の相方") : !o.includes("監査の相方"))) ?? opts[0]
            handleChoice(s, pc.pid, want!)
        }
        // 実対戦では誘発は操作（handleAction）の中で起きるので、操作の終わりの後始末（一時記録の消去・破壊後バースト等）を
        // どちらの経路にも通す。選択待ちが無いときの resolveChoice は何もせずに後始末だけ走る
        let ok = drain(s)
        for (let i = 0; ok && i < 5 && !s.winner; i++) {
            handleAction(s, "p1", { type: "resolveChoice" } as never)
            if (!s.pendingChoice) break
            ok = drain(s)
        }
        db.effects = own
        return { s: norm(s).replace(/"name":"監査の相方"/g, ""), ok, asked }
    } finally {
        Math.random = saved
    }
}

function getCardColors(cardId: string): CardData["colors"] {
    return CARD_DB.get(cardId)!.colors
}

// 主体の候補：場の全スピリット × イベントの持ち主。主体の条件（色・系統・コスト…）をここで読み直すと条件の種類だけ穴が残るので、
// 順に試して効果が実際に誘発した最初の1つを使う（誘発したか＝この効果を外した盤面と違うか）
function subjectsFor(card: CardData, e: EffectDef): Subj[] {
    const { s } = buildBoard(card)
    const out: Subj[] = []
    const infos = Object.keys(infoFor(e)).length > 0 ? [true, false] : [false]
    for (const info of infos) {
        for (const firePid of ["p1", "p2"] as PlayerId[]) {
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                for (let idx = 0; idx < s.players[pid].field.spirits.length; idx++) out.push({ firePid, pid, idx, info })
            }
        }
    }
    return out
}

function handleChoice(s: GameState, pid: PlayerId, option: string): void {
    handleAction(s, pid, { type: "resolveChoice", option } as never)
}

let compared = 0
let notFired = 0
const allIds = new Map<string, string>()
const comparedIds = new Set<string>()
const notFiredBy = new Map<string, number>()
let echoMissed = 0
const echoMissedIds = new Set<string>()
const lines: string[] = []

// 1つの効果を、主体の候補を順に試して誘発させ（単独≠無）、相方を挟んだ2経路と比べる
function sweep(card: CardData, e: EffectDef, tp: PlayerId, ph: Phase, cands: (Subj | null)[], via: Via, key: string): void {
    const tag = via === "attack" ? "アタック宣言" : `turn:${tp} ${ph}`
    let base: NonNullable<ReturnType<typeof run>> | null = null
    let subj: Subj | null = null
    let fired = false
    try {
        for (const c of cands) {
            const b = run(card, e, tp, ph, "単独", c, via)
            if (b === null) continue
            let none: string | null = null
            try {
                none = run(card, e, tp, ph, "無", c, via)?.s ?? null
            } catch {
                // 無で例外なら、少なくとも違う経路を通っている
            }
            if (base === null) {
                base = b
                subj = c
            }
            if (none !== b.s) {
                base = b
                subj = c
                fired = true
                break
            }
        }
    } catch (err) {
        lines.push(`${e.id} ${tag}：単独で例外 ${(err as Error).message.slice(0, 80)}`)
        return
    }
    if (base === null) return
    for (const v of ["後に相方", "先に相方"] as const) {
        let r: ReturnType<typeof run>
        try {
            r = run(card, e, tp, ph, v, subj, via)
        } catch (err) {
            lines.push(`${e.id} ${tag} ${v}：例外 ${(err as Error).message.slice(0, 80)}`)
            continue
        }
        if (r === null) continue
        compared++
        if (r.asked) comparedIds.add(key)
        if (!r.asked) {
            if (fired) {
                echoMissed++
                echoMissedIds.add(key)
            } else {
                notFired++
                notFiredBy.set(allIds.get(key)!, (notFiredBy.get(allIds.get(key)!) ?? 0) + 1)
            }
            continue
        }
        if (r.ok !== base.ok) lines.push(`${e.id} ${tag} ${v}：選択待ちの解消が食い違う（単独=${base.ok} 経路=${r.ok}）`)
        else if (r.s !== base.s) lines.push(`${e.id} ${card.name} ${tag} ${v}：盤面が食い違う\n      ${firstDiff(base.s, r.s)}`)
    }
}

// アタック宣言から起こす効果：アタック時・『バトル時』（アタッカー自身）と、アタックしたとき・疲労したとき（場の誰か）
const ATTACK_EVENTS = new Set(["anySpiritAttacked", "ownSpiritExhausted", "anySpiritExhausted"])
function attackKind(card: CardData, e: EffectDef): "self" | "any" | null {
    const f = e as unknown as Record<string, unknown>
    if (card.type === "spirit" && e.kind === "triggered" && (f["trigger"] === "onAttack" || f["trigger"] === "onBattleStart")) return "self"
    if (e.kind === "fieldEvent" && ATTACK_EVENTS.has(e.event)) return "any"
    return null
}

// ONLY=<cardId> で1枚だけ回す。VIA=direct|attack で片方だけ
const vias = (process.env["VIA"] ? [process.env["VIA"]] : ["direct", "attack"]) as Via[]
for (const card of CARDS.filter((c) => !process.env["ONLY"] || c.cardId === process.env["ONLY"])) {
    if (card.type !== "spirit" && card.type !== "nexus") continue
    for (const e of (card.effects ?? []) as EffectDef[]) {
        if (vias.includes("direct") && (e.kind === "fieldEvent" || e.kind === "step")) {
            allIds.set(e.id, e.kind === "fieldEvent" ? `fieldEvent:${e.event}` : `step:${e.step}`)
            const cond = e as unknown as Record<string, unknown>
            const phases: Phase[] =
                e.kind === "step" ? [e.step] : typeof cond["phase"] === "string" ? [cond["phase"] as Phase] : ["attack", "main"]
            const cands: (Subj | null)[] = e.kind === "fieldEvent" ? subjectsFor(card, e) : [null]
            for (const tp of ["p1", "p2"] as PlayerId[]) for (const ph of phases) sweep(card, e, tp, ph, cands, "direct", e.id)
        }
        const ak = vias.includes("attack") ? attackKind(card, e) : null
        if (ak !== null) {
            const key = `${e.id}@attack`
            allIds.set(key, `アタック宣言:${e.kind === "fieldEvent" ? e.event : (e as unknown as Record<string, string>)["trigger"]}`)
            // 自身のアタック時はテスト対象のカード（p1 の場の1体目）だけ。場の誰かが主体なら、両陣営の全スピリットを試す
            const { s } = buildBoard(card)
            const cands: Subj[] = []
            for (const pid of ["p1", "p2"] as PlayerId[]) {
                s.players[pid].field.spirits.forEach((sp, idx) => {
                    if (ak === "any" || (pid === "p1" && sp.cardId === card.cardId)) cands.push({ firePid: pid, pid, idx, info: false })
                })
            }
            sweep(card, e, "p1", "attack", cands, "attack", key)
        }
    }
}
console.log(lines.join("\n"))
console.log(`\n比較 ${compared}回／食い違い ${lines.length}件`)
console.log(`  解決順の確認が立たず比べなかった回：効果が誘発しなかった ${notFired}／効果は誘発したが相方が誘発しなかった ${echoMissed}（${echoMissedIds.size}エントリ）`)
const never = [...allIds].filter(([id]) => !comparedIds.has(id))
console.log(`  効果エントリ ${allIds.size}件のうち、一度も比べられなかった ${never.length}件`)
if (process.env["SHOW_MISSED"] === "1") {
    console.log(`  相方が誘発しなかった: ${[...echoMissedIds].join(" ")}`)
    const by = new Map<string, string[]>()
    for (const [id, k] of never) by.set(k, [...(by.get(k) ?? []), id])
    for (const [k, list] of [...by].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${list.length}\t${k}\t${list.slice(0, 4).join(" ")}`)
}
