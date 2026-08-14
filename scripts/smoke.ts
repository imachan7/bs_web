// smoke テストのランナー（本体は scripts/smoke/ に分割。npm run smoke / smoke:quiet で実行）
//
// 新しいテストは scripts/smoke/partN.ts を追加するだけでよい（**ここへの import 追記は不要**。
// ファイル名から自動で拾って番号順に実行する）。
//
// パートごとに try/catch で囲っているのは対話モード（--interactive）のため。
// 対話モードでは選択結果が非対話時と変わるので、**テスト本体が落ちる**ことがある
// （例：期待した位置にスピリットがおらず undefined を参照する）。それは engine のバグではなく
// テストコードの前提崩れなので、1件で残り全パートを止めないよう捕捉して次へ進む。
// 通常モードでは従来どおり即座に投げ直す（挙動を変えない）。
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { noteHarnessError, summary } from "./smoke/helpers"

const INTERACTIVE =
    process.argv.includes("--interactive") || process.env.SMOKE_INTERACTIVE === "1"

const dir = join(__dirname, "smoke")
const parts = readdirSync(dir)
    .map((f) => /^part(\d+)\.ts$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ file: `./smoke/part${m[1]}`, n: Number(m[1]) }))
    .sort((a, b) => a.n - b.n)

for (const part of parts) {
    try {
        require(part.file)
    } catch (e) {
        if (!INTERACTIVE) throw e
        noteHarnessError(`part${part.n}`, e as Error)
    }
}

summary()
