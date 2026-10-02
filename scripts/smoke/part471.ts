// smoke パート471（「ことで」の確認関門の検査 payGateCheck が、関門の無い書き方を落とすこと）
import { assert, getCard } from "./helpers"
import { checkPayGates } from "../payGateCheck"
import type { CardData } from "../../server/src/type"

const issues = (card: CardData) => {
    const out: string[] = []
    checkPayGates(card, (_id, m) => out.push(m))
    return out
}
const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip)
    if (!node || typeof node !== "object") return node
    const obj = node as Record<string, unknown>
    // pay を then だけに置き換える（確認関門を外した書き方）
    if (obj["type"] === "pay") return strip(obj["then"])
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, strip(v)]))
}

console.log("=== 1. 今のデータは通る ===")
for (const id of ["BS16-063", "BS13-068", "SD02-010", "BS15-067"]) {
    assert(issues(getCard(id)).length === 0, `${getCard(id).name}は関門を通っている`)
}

console.log("=== 2. pay を外すと落ちる ===")
for (const id of ["BS16-063", "BS13-068", "BS15-067"]) {
    const card = getCard(id)
    const broken = { ...card, effects: strip(card.effects) } as CardData
    assert(issues(broken).length === 1, `${card.name}から pay を外すと落ちる`)
}

console.log("=== 3. 【強襲】はキーワードが関門として数えられる（キーワードを消すと落ちる） ===")
{
    const card = getCard("SD02-010")
    const noKeyword = { ...card, effects: (strip(card.effects) as { kind?: string }[]).filter((e) => e.kind !== "keyword") } as CardData
    assert(issues(noKeyword).length === 1, "【強襲】のキーワードと pay を外すと落ちる")
}

console.log("すべてのチェックに合格しました 🎉（part471）")
