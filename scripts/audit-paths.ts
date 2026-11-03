// 経路の同値性の総当たり（docs/design/TEST_STRATEGY.md §7）。誘発効果を1つずつ、次の3通りで解決して盤面を比べる。
//   単独       ：その効果だけが誘発する
//   後に相方   ：同じ条件で誘発する「何もしない効果」（相方）と同時に誘発させ、解決順でこの効果を先に選ぶ
//   先に相方   ：相方を先に選ぶ
// 後の2つは解決順の確認・再開スタックを通るので、そこで発生源などを見失うと盤面が食い違う
// （竜騎集う円卓＋賢者の樹の実で【装甲】が抜けた #235 の型）。誤検出を含むので終了コードは常に 0（人が読む道具）。
import { CARDS, buildBoard, drain, pickSubject } from "./smoke/fireAll"
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

// 相方の効果：同じ条件で誘発し、何もしない。確認・支払い・1ターンに1回は外す（相方が先に使い切らないように）
function echoOf(e: EffectDef): EffectDef {
    const { optional: _o, cost: _c, thenPay: _p, ...rest } = e as unknown as Record<string, unknown>
    for (const k of Object.keys(rest)) if (/^once/i.test(k)) delete rest[k]
    return { ...rest, id: "AE-e1", action: { type: "noop" } } as unknown as EffectDef
}

const ids = new Map<string, string>()
function norm(s: GameState): string {
    ids.clear()
    return JSON.stringify(s, (k, v) => (k === "log" || k === "history" || k === "triggerOrderPick" || k === "resumeInsertAt" || k === "events" ? undefined : v))
        .replace(/inst-\d{6}/g, (m) => {
            if (!ids.has(m)) ids.set(m, `I${ids.size}`)
            return ids.get(m)!
        })
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

type Variant = "単独" | "後に相方" | "先に相方"
function run(card: CardData, e: EffectDef, tp: PlayerId, ph: Phase, v: Variant): { s: string; ok: boolean; asked: boolean } {
    const saved = Math.random
    let x = 12345
    Math.random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648)
    try {
        echoCard.effects = v === "単独" ? [] : [echoOf(e)]
        const { s } = buildBoard(card)
        s.interactiveTargets = true
        // 相方は単独のときも置く（盤面の条件を揃える）
        const echo = createInstance(ECHO_ID, s.turn, 0)
        s.players.p1.field.nexuses.push(echo)
        refreshLevelAsOverrides(s)
        s.turnPlayer = tp
        s.phase = ph
        const cond = e as unknown as Record<string, unknown>
        if (e.kind === "fieldEvent") {
            const subject = pickSubject(s, cond) ?? s.players.p1.field.spirits[0]!
            fireFieldEventTriggers(s, "p1", e.event as never, { pid: "p1", inst: subject }, undefined, s.players.p2.field.spirits[0]?.instanceId)
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
        return { s: norm(s).replace(/"name":"監査の相方"/g, ""), ok, asked }
    } finally {
        Math.random = saved
    }
}

function handleChoice(s: GameState, pid: PlayerId, option: string): void {
    handleAction(s, pid, { type: "resolveChoice", option } as never)
}

let compared = 0
let notAsked = 0
const lines: string[] = []
for (const card of CARDS) {
    if (card.type !== "spirit" && card.type !== "nexus") continue
    for (const e of (card.effects ?? []) as EffectDef[]) {
        if (e.kind !== "fieldEvent" && e.kind !== "step") continue
        const cond = e as unknown as Record<string, unknown>
        const phases: Phase[] =
            e.kind === "step" ? [e.step] : typeof cond["phase"] === "string" ? [cond["phase"] as Phase] : ["attack", "main"]
        for (const tp of ["p1", "p2"] as PlayerId[]) {
            for (const ph of phases) {
                let base: ReturnType<typeof run>
                try {
                    base = run(card, e, tp, ph, "単独")
                } catch (err) {
                    lines.push(`${e.id} turn:${tp} ${ph}：単独で例外 ${(err as Error).message.slice(0, 80)}`)
                    continue
                }
                for (const v of ["後に相方", "先に相方"] as const) {
                    let r: ReturnType<typeof run>
                    try {
                        r = run(card, e, tp, ph, v)
                    } catch (err) {
                        lines.push(`${e.id} turn:${tp} ${ph} ${v}：例外 ${(err as Error).message.slice(0, 80)}`)
                        continue
                    }
                    compared++
                    if (!r.asked) {
                        notAsked++
                        continue
                    }
                    if (r.ok !== base.ok) lines.push(`${e.id} turn:${tp} ${ph} ${v}：選択待ちの解消が食い違う（単独=${base.ok} 経路=${r.ok}）`)
                    else if (r.s !== base.s) lines.push(`${e.id} ${card.name} turn:${tp} ${ph} ${v}：盤面が食い違う\n      ${firstDiff(base.s, r.s)}`)
                }
            }
        }
    }
}
console.log(lines.join("\n"))
console.log(`\n比較 ${compared}回（解決順の確認が立たず比べなかった回 ${notAsked}）／食い違い ${lines.length}件`)
