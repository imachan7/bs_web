// 概念: COV_OUT を付けて起動したときだけ、カバレッジの記録先を差してプロセス終了時に書き出す
import { writeFileSync } from "node:fs"
import type { CardData } from "../type"
import { setCoverageSink } from "../../../shared/coverage"

// 効果エントリとその配下（action を含む）すべてに由来 id を刻む。noteAction はこれで由来を引く
const tag = (node: unknown, eid: string): void => {
    if (Array.isArray(node)) {
        for (const v of node) tag(v, eid)
        return
    }
    if (node === null || typeof node !== "object") return
    const obj = node as Record<string, unknown>
    obj["__eid"] = eid
    for (const v of Object.values(obj)) tag(v, eid)
}

export function startCoverageIfRequested(cards: Map<string, CardData>): void {
    const out = process.env["COV_OUT"]
    if (out === undefined) return
    for (const [cardId, card] of cards) {
        const effects = (card.effects ?? []) as { id?: string }[]
        for (let i = 0; i < effects.length; i++) tag(effects[i], effects[i]?.id ?? cardId + "#" + i)
    }
    // 「一度でも通ったか」だけを見るので重複は捨てる（hasKeyword のような高頻度の経路があるため）
    const lines = new Set<string>()
    setCoverageSink((line) => lines.add(line))
    process.on("exit", () => writeFileSync(out, [...lines].join("\n")))
}
