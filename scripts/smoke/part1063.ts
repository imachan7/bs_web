// smoke パート1063（ID を作る関数：crypto.randomUUID が無い環境でも動くか。2026-11-25 に http の Tailscale のアドレスで AI 戦が止まった）
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { assert } from "./helpers"
import { randomId } from "../../shared/randomId"

console.log("=== randomUUID が無い環境（http で開いたページ）でも ID を返す ===")
{
    const c = globalThis.crypto as { randomUUID?: unknown }
    const saved = c.randomUUID
    Object.defineProperty(c, "randomUUID", { value: undefined, configurable: true, writable: true })
    try {
        const a = randomId()
        const b = randomId()
        assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a), `UUID と同じ形（${a}）`)
        assert(a !== b, "呼ぶたびに違う ID")
    } finally {
        Object.defineProperty(c, "randomUUID", { value: saved, configurable: true, writable: true })
    }
}

console.log("=== ブラウザでも動くコードは crypto.randomUUID を直接呼ばない（randomId を使う） ===")
{
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : []
    })
    // エンジン（AI 戦は aiWorker で動く）・共有層・クライアント
    const hits = ["server/src/logic", "shared", "public/src"].flatMap(files)
        .filter((p) => !p.endsWith("shared/randomId.ts") && readFileSync(p, "utf8").includes("crypto.randomUUID"))
    assert(hits.length === 0, `crypto.randomUUID を直接呼ぶ所が無い（${hits.join(", ")}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1063）")
