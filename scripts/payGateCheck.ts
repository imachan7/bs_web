// 効果文の「ことで」が、確認関門（COST_MODEL §10）を通る器で書かれているかの検査。
// 節と効果エントリを1対1に対応づけるのは難しいので、「ことで」の数 ≦ 関門の数 を見る（validate:gaps と同じ割り切り）。
// 関門の一覧は 2026-10-02 の仕分け（docs/design/PAY_GATE_AUDIT.md）で、確認を出すことを確かめた器だけ
import type { CardData } from "../server/src/type"

// action の type（入れ子も数える）
const GATE_TYPES = new Set([
    "pay",
    "tenshoCoreSubstitute",
    "reviveLastDestroyedNexus",
    "summonRepeatFromHand",
    "millUntilMagicCastFree",
    "detachBrave",
    "deployNexusFromTrashByFieldCores",
    "magicNegate",
])
// EffectDef の kind
const GATE_KINDS = new Set([
    "magicNegate",
    "deckMillNegate",
    "targetNegateByHandDiscard",
    "nexusCostMillPay",
    "battleSwapSummon",
    "altSummonFromHand",
    "summonCostHandDiscardPay",
    "fushiFreeByExhaust",
    "magicNegatePayByNexusGrant",
    "shinsokuPayAssist",
])
// cost 欄があるときだけ関門になる kind
const GATE_KINDS_WITH_COST = new Set(["reviveOnDestroy", "activated", "handActivated"])
// キーワード（keyword エントリと handKeywordGrant の keyword）
const GATE_KEYWORDS = new Set(["soku", "resshinsoku", "tensho", "hyoheki", "kyoshu"])
// 支払いを引数で持つ action の欄
const GATE_PARAMS = ["payCost", "costDestroyOwnSpiritSameCost", "costSkipCoreStep", "costSkipDraw", "costMillSelfCount", "extraPerCoreToTrash", "thenPay"]

// 確認を出さないのが正しいもの・「ことで」がコストの意味でないもの
const VERIFIED: Record<string, string> = {
    "BS14-084": "払わないと負けるので自動で払う（2026-10-02 ユーザー決定。COST_MODEL §10）",
    "BS12-075": "「ことで」はマジックの通常コストの支払い手段の言い直し",
}

function countGates(node: unknown): number {
    if (Array.isArray(node)) return node.reduce((n: number, x) => n + countGates(x), 0)
    if (!node || typeof node !== "object") return 0
    const obj = node as Record<string, unknown>
    let n = 0
    if (typeof obj["type"] === "string" && GATE_TYPES.has(obj["type"])) n++
    if (typeof obj["kind"] === "string") {
        if (GATE_KINDS.has(obj["kind"])) n++
        if (GATE_KINDS_WITH_COST.has(obj["kind"]) && obj["cost"] !== undefined) n++
    }
    if (typeof obj["keyword"] === "string" && GATE_KEYWORDS.has(obj["keyword"])) n++
    for (const k of GATE_PARAMS) if (obj[k] !== undefined) n++
    for (const v of Object.values(obj)) n += countGates(v)
    return n
}

export function checkPayGates(card: CardData, add: (cardId: string, message: string) => void): void {
    const clauses = (card.effect?.match(/ことで/g) ?? []).length
    if (clauses === 0 || VERIFIED[card.cardId] !== undefined) return
    const gates = countGates(card.effects)
    if (gates < clauses) {
        add(card.cardId, `効果文の「ことで」${clauses}か所に対し、確認関門を通る器が${gates}つしかない（pay か関門を持つ器で書く。正しい例外なら scripts/payGateCheck.ts の VERIFIED に理由つきで足す）`)
    }
}
