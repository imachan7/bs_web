// ファイルの大きさの検査（npm run validate:size）。1ファイルが大きくなるほど、実装役が差し込み先を探す手間が増える（REFACTOR_PLAN §0・§3）。
// 基準：2000行（型ファイルは行が長いので 120KB）。すでに超えているファイルは下の一覧の値を上限にし、それより増えたら落とす。
// 超えそうになったら、足す前に「どの概念を切り出すか」を決める（CLAUDE.md「設計の2原則」の2）
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["server/src", "shared", "public/src"]
const MAX_LINES = 2000
const MAX_TYPE_KB = 120

// 2026-09-26 時点で基準を超えていたもの（行数、型ファイルは KB）。分割して基準を下回ったら、ここから消す
const BASELINE: Record<string, number> = {
    "server/src/logic/EffectModules.ts": 3051,
    "server/src/logic/actions/battleFlow.ts": 2200,
    "server/src/logic/actions/cores.ts": 2745,
    "server/src/logic/actions/destroy.ts": 2345,
    "server/src/logic/triggers.ts": 2037,
    "server/src/type.ts": 211,
    "server/src/types/effectAction.ts": 190,
}

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name)
        return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []
    })
}

const isTypeFile = (p: string): boolean => p === "server/src/type.ts" || p.startsWith("server/src/types/")
const errors: string[] = []
const shrunk: string[] = []
for (const p of ROOTS.flatMap(walk)) {
    const text = readFileSync(p, "utf8")
    const size = isTypeFile(p) ? Math.round(Buffer.byteLength(text) / 1024) : text.split("\n").length - (text.endsWith("\n") ? 1 : 0)
    const unit = isTypeFile(p) ? "KB" : "行"
    const limit = isTypeFile(p) ? MAX_TYPE_KB : MAX_LINES
    const base = BASELINE[p]
    if (base === undefined) {
        if (size > limit) errors.push(`${p}：${size}${unit}（基準 ${limit}${unit}）。足す前に切り出す概念を決めること`)
    } else if (size > base) {
        errors.push(`${p}：${size}${unit}（一覧の上限 ${base}${unit} から増えた）。足す前に切り出す概念を決めること`)
    } else if (size <= limit) {
        shrunk.push(`${p}：${size}${unit} で基準を下回った。scripts/check-file-size.ts の一覧から消すこと`)
    }
}
for (const p of Object.keys(BASELINE)) {
    if (!ROOTS.some((r) => p.startsWith(r + "/"))) errors.push(`一覧の ${p} は検査の範囲外`)
}

if (shrunk.length > 0) console.log(shrunk.join("\n"))
if (errors.length > 0) {
    console.error(errors.join("\n"))
    process.exit(1)
}
console.log(`ファイルの大きさは基準内です ✅（基準超えで据え置き ${Object.keys(BASELINE).length} 本）`)
