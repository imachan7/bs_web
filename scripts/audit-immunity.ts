// 耐性の総当たり（設計は docs/design/IMMUNITY_AUDIT.md）。全カードの効果を、p2 が耐性の盾を持つ盤面で発火させ、
// p2 の盤面が変わった回を一覧にする。誤検出を含むので終了コードは常に 0（人が読む道具）。
// NO_SHIELD=1 で盾なしの対照を取る。
import { fireAll, CARDS } from "./smoke/fireAll"
import { createInstance, currentLevel, effectiveBp, giveTimedToPlayer } from "./smoke/helpers"
import type { GameState, PlayerId } from "./smoke/helpers"
import { CARD_DB } from "../server/src/logic/GameState"
import { hasGlobalConstraint } from "../shared/rules"
import type { CardData, EffectDef } from "../server/src/type"

const SHIELD_ID = "AUDIT-SHIELD"
const useShield = process.env["NO_SHIELD"] !== "1"

CARD_DB.set(SHIELD_ID, {
    cardId: SHIELD_ID,
    name: "耐性の盾",
    type: "nexus",
    colors: ["blue"],
    cost: 1,
    reduction: [],
    family: [],
    levels: [{ level: 1, cores: 1 }],
    symbol: [],
    flash: false,
    rarity: "",
    limited: false,
    effect: "",
    effects: [
        { id: "AS-e1", kind: "constraintGrant", levels: null, target: "ownAll", constraint: { type: "immuneToOpponentEffects" } },
        { id: "AS-e2", kind: "globalConstraint", levels: null, constraint: { type: "handImmuneForPid", includeNexus: true } },
        { id: "AS-e3", kind: "globalConstraint", levels: null, constraint: { type: "noDeckMillByOpponent" } },
    ],
} as unknown as CardData)
const CARD_BY_ID = new Map(CARDS.map((c) => [c.cardId, c]))

// 盾のライフ不減は globalConstraint でなく「このターンの間の制約」（playerRule の lifeGuard）で掛ける。
// 発火はすべて同じターン内で行うので、setup で1回掛ければ足りる
const shieldIds = new Map<GameState, string>()
function setup(s: GameState): void {
    if (!useShield) return
    const shield = createInstance(SHIELD_ID, s.turn, 1)
    s.players.p2.field.nexuses.push(shield)
    shieldIds.set(s, shield.instanceId)
    giveTimedToPlayer(s, "p2", { type: "playerRule", rule: { type: "lifeGuard", max: 0 } } as never, "turn")
    if (!hasGlobalConstraint(s, "handImmuneForPid")) throw new Error("盾の globalConstraint が効いていない")
}

interface Snap {
    spirits: Map<string, string>
    hand: string
    life: number
    deck: number
    trash: string
}
function snap(s: GameState): Snap {
    const p = s.players.p2
    const spirits = new Map<string, string>()
    for (const i of p.field.spirits) {
        spirits.set(i.instanceId, `${i.cardId} 場 コア${i.cores} ${i.isRested ? "疲労" : "回復"} BP${effectiveBp(s, "p2" as PlayerId, i)} Lv${currentLevel(i).level}`)
    }
    return { spirits, hand: p.hand.join(","), life: p.life, deck: p.deck.length, trash: p.trashCards.join(",") }
}
function diff(a: Snap, b: Snap): { kind: string; text: string }[] {
    const out: { kind: string; text: string }[] = []
    for (const [id, t] of a.spirits) {
        const t2 = b.spirits.get(id)
        if (t2 === undefined) out.push({ kind: "spirit", text: `スピリットが場から消えた: ${t}` })
        else if (t2 !== t) out.push({ kind: "spirit", text: `スピリット変化: ${t} → ${t2}` })
    }
    for (const [id, t] of b.spirits) if (!a.spirits.has(id)) out.push({ kind: "spirit", text: `スピリットが増えた: ${t}` })
    if (a.hand !== b.hand) out.push({ kind: "hand", text: `手札: ${a.hand.split(",").length}枚 → ${b.hand.split(",").length}枚` })
    if (a.life !== b.life) out.push({ kind: "life", text: `ライフ: ${a.life} → ${b.life}` })
    if (a.deck !== b.deck) out.push({ kind: "deck", text: `デッキ: ${a.deck}枚 → ${b.deck}枚` })
    if (a.trash !== b.trash) out.push({ kind: "trash", text: `トラッシュのカード: ${a.trash.split(",").length}枚 → ${b.trash.split(",").length}枚` })
    return out
}

// 発火の種類に当たる効果エントリの中の type 名を集める（参考。フィルタ等の type も混ざる）
function typesIn(node: unknown, acc: Set<string>): void {
    if (Array.isArray(node)) return node.forEach((v) => typesIn(v, acc))
    if (node === null || typeof node !== "object") return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (k === "type" && typeof v === "string") acc.add(v)
        else typesIn(v, acc)
    }
}
function actionTypes(card: CardData, label: string): string[] {
    const [head, kindTxt] = label.split(" ")
    const kind = kindTxt!.split(":")[0]!
    const arg = kindTxt!.split(":")[1]
    const acc = new Set<string>()
    for (const e of (card.effects ?? []) as EffectDef[]) {
        const er = e as unknown as Record<string, unknown>
        const hit =
            kind === "magic" ? e.kind === "magic"
            : kind === "trigger" ? e.kind === "triggered" && er["trigger"] === arg
            : kind === "step" ? e.kind === "step" && er["step"] === arg
            : e.id === head
        if (hit) typesIn(er["action"] ?? er, acc)
    }
    return [...acc]
}

const before = new Map<string, { s: Snap; shield: boolean }>()
const lines: string[] = []
const byKind = new Map<string, number>()
const byCard = new Map<string, number>()
const byAction = new Map<string, number>()
const excluded = { nexusSource: 0, shieldGone: 0 }
let fires = 0
let hitFires = 0
const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1)

fireAll({
    setup,
    onFire(ctx, s, when) {
        if (when === "before") {
            before.set(ctx.label, { s: snap(s), shield: true })
            return
        }
        fires++
        const b = before.get(ctx.label)!.s
        const shield = shieldIds.get(s)
        if (useShield && !s.players.p2.field.nexuses.some((n) => n.instanceId === shield)) {
            excluded.shieldGone++
            return
        }
        let diffs = diff(b, snap(s))
        if (ctx.card.type === "nexus") {
            const n = diffs.length
            diffs = diffs.filter((d) => d.kind !== "spirit")
            excluded.nexusSource += n - diffs.length
        }
        if (diffs.length === 0) return
        hitFires++
        for (const d of diffs) {
            lines.push(`${ctx.card.cardId} ${ctx.card.name} | ${ctx.label} | ${d.text}`)
            bump(byKind, d.kind)
        }
        bump(byCard, `${ctx.card.cardId} ${ctx.card.name}`)
        for (const t of actionTypes(ctx.card, ctx.label)) bump(byAction, t)
    },
})

const table = (title: string, m: Map<string, number>, top = 1000): void => {
    console.log(`\n=== ${title} ===`)
    for (const [k, n] of [...m].sort((x, y) => y[1] - x[1]).slice(0, top)) console.log(`${String(n).padStart(5)}  ${k}`)
}
console.log(`=== 変化の一覧（盾${useShield ? "あり" : "なし"}） ===`)
for (const l of lines) console.log(l)
table("変わった所の種類別（行数）", byKind)
table("効果エントリ内の type 名別（発火回数・参考。フィルタの type も混ざる）", byAction)
table("カード別（変化のあった発火回数）", byCard)
console.log(`\n発火${fires}回／変化のあった発火${hitFires}回／変化の行${lines.length}行`)
console.log(`除外: ネクサス発生源のスピリット変化${excluded.nexusSource}行／盾が消えた回${excluded.shieldGone}回`)
