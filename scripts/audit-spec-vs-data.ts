// 効果文から作った期待値（docs/design/EFFECT_SPEC_RULES.md）と、実装データの解決結果を突き合わせる。
// 使い方: npx tsx scripts/audit-spec-vs-data.ts <期待値.json>...
// 現在の対象: fieldEvent の「〜Self」系アクションが指す先（発生源かイベント対象か）と、ドローの実行者。
import { readFileSync } from "node:fs"
import { loadAllCards } from "../data/loadCards"

// 実装側の解決規則（SEMANTICS_AUDIT §3.1・§3.4、triggers.ts の contextOf）
// selfOverride を渡すイベントでは、selfMode:"source" が無いと self はイベント対象になる
const EVENTS_WITH_TARGET_SELF = new Set([
    "ownSpiritExhausted", "anySpiritExhausted", "ownSpiritSummoned", "anySpiritAttacked", "anySpiritCombined",
    "ownSpiritBlocked", "ownSpiritDestroyed", "ownSpiritRefreshed", "anySpiritRefreshed", "ownSpiritReturnedToHand",
    "anySpiritReturnedToHand", "ownSpiritDealtLife", "ownSpiritDeclaredBlock", "anySpiritDeclaredBlock",
    "ownSeimeiLifeCharged", "anyBraveSummoned",
])
// 発火先の陣営とイベント対象の陣営が食い違いうるイベント（§3.4）。固定の印が無いと実行者がイベント対象の持ち主になる
const EVENTS_WITH_SWAPPING_ACTOR = new Set([
    "ownBofuExhausted", "anySpiritExhausted", "anySpiritAttacked", "anySpiritDeclaredBlock", "anySpiritCombined",
    "anySpiritReturnedToHand", "anySpiritRefreshed", "anyBraveSummoned",
])
const EVENT_ALIASES: Record<string, string[]> = {
    "疲労した": ["ownSpiritExhausted", "anySpiritExhausted"],
    "召喚された": ["ownSpiritSummoned", "anyBraveSummoned"],
    "破壊された": ["ownSpiritDestroyed", "opponentSpiritDestroyed"],
    "アタックした": ["anySpiritAttacked"],
    "ブロックされた": ["ownSpiritBlocked"],
    "ブロックした": ["ownSpiritDeclaredBlock", "anySpiritDeclaredBlock"],
    "合体した": ["anySpiritCombined"],
    "回復した": ["ownSpiritRefreshed", "anySpiritRefreshed"],
    "手札に戻った": ["ownSpiritReturnedToHand", "anySpiritReturnedToHand"],
    "ライフが減った": ["ownLifeDamaged", "opponentLifeDamaged", "ownSpiritDealtLife"],
    "デッキが破棄された": ["opponentDeckMilled", "ownDeckMilled", "ownFunsaiMilled"],
    "ドローした": ["opponentDrew", "opponentDrewByEffect"],
    "マジックを使用した": ["ownMagicUsed", "opponentMagicUsed"],
    "バーストをセットした": ["ownBurstSet", "opponentBurstSet"],
    "バトルが終わった": ["ownCombinedSpiritBattleEnded"],
}

type Clause = {
    text: string
    trigger?: { kind?: string; event?: string | null; subject?: string | null }
    actor?: string | null
    op?: string | null
    target?: { ref?: string | null }
    unclassified?: string | null
}
type FieldEvent = { id: string; kind: string; event: string; selfMode?: string; ownOnly?: boolean; subjectSide?: string; action?: { type: string; target?: string; chooserIsTarget?: boolean } }

// op → データ側のアクション名の前置き。一致するものを優先して対応付ける
const OP_PREFIX: Record<string, string[]> = {
    "破壊": ["destroy"], "疲労させる": ["exhaust"], "回復させる": ["refresh"], "ドロー": ["draw"],
    "コアを取り除く": ["removeCores", "coreRemove"], "手札に戻す": ["bounce", "returnToHand"],
    "ライフを減らす": ["lifeDamage", "damageLife"],
}

function resolvedSelf(e: FieldEvent): "source" | "eventSubject" {
    if (e.selfMode === "source") return "source"
    return EVENTS_WITH_TARGET_SELF.has(e.event) ? "eventSubject" : "source"
}
function resolvedActor(e: FieldEvent): "owner" | "eventSubjectOwner" {
    // destroySelf／exhaustSelf は fix/self-action-cause-context 以降、常に発生源の持ち主が実行者
    if (e.action?.type === "destroySelf" || e.action?.type === "exhaustSelf") return "owner"
    if (e.selfMode === "source" || e.ownOnly || e.subjectSide === "own") return "owner"
    return EVENTS_WITH_SWAPPING_ACTOR.has(e.event) ? "eventSubjectOwner" : "owner"
}

const cards = new Map(loadAllCards().map((c) => [c.cardId, c as unknown as { effects: FieldEvent[] }]))
const problems: string[] = []
let checked = 0
let unmatched = 0

for (const file of process.argv.slice(2)) {
    for (const spec of JSON.parse(readFileSync(file, "utf8")) as { id: string; clauses: Clause[] }[]) {
        const card = cards.get(spec.id)
        if (!card) continue
        const used = new Set<string>()
        for (const c of spec.clauses) {
            if (c.unclassified || c.trigger?.kind !== "field" || !c.trigger.event) continue
            const events = EVENT_ALIASES[c.trigger.event] ?? []
            const candidates = card.effects.filter((e) => e.kind === "fieldEvent" && !used.has(e.id) && events.includes(e.event))
            const prefixes = OP_PREFIX[c.op ?? ""] ?? []
            const eff = candidates.find((e) => prefixes.some((pre) => e.action?.type.startsWith(pre))) ?? (candidates.length === 1 ? candidates[0] : undefined)
            if (!eff) {
                unmatched++
                if (process.env.VERBOSE) console.log(`未照合: ${spec.id}「${c.text.slice(0, 40)}」event=${c.trigger.event} op=${c.op} / データ: ${card.effects.filter((e) => e.kind === "fieldEvent").map((e) => `${e.event}:${e.action?.type}`).join(",") || "fieldEventなし"}`)
                continue
            }
            used.add(eff.id)
            checked++
            const where = `${spec.id} ${eff.id}（${eff.event}）「${c.text.slice(0, 32)}」`
            // 〜Self 系は、発生源かイベント対象かも照合する（「相手のスピリット1体を破壊」等の対象選択は別のアクション）
            if (eff.action?.type.endsWith("Self")) {
                const expected = c.target?.ref === "source" ? "source" : c.target?.ref === "prevClause" ? "eventSubject" : null
                if (expected && expected !== resolvedSelf(eff)) problems.push(`${where}: 効果文は${expected === "source" ? "発生源（このスピリット）" : "イベント対象（そのスピリット）"}を指すが、実装は${resolvedSelf(eff) === "source" ? "発生源" : "イベント対象"}に作用する`)
            }
            // イベント対象自身が行う処理（target:"self"・chooserIsTarget）は、実行者がイベント対象の持ち主であることが意図
            const actsAsSubject = eff.action?.target === "self" || eff.action?.chooserIsTarget === true
            if (c.actor === "owner" && !actsAsSubject && resolvedActor(eff) !== "owner") problems.push(`${where}: 効果文の実行者は持ち主だが、実装はイベント対象の持ち主が実行する（${eff.action?.type}）`)
        }
    }
}
console.log(`突き合わせ: ${checked}件（対応するデータ効果が見つからず未照合 ${unmatched}件）`)
for (const p of problems) console.log(`❌ ${p}`)
console.log(problems.length === 0 ? "食い違いは見つかりませんでした ✅" : `${problems.length}件の食い違い`)
process.exit(problems.length === 0 ? 0 : 1)
