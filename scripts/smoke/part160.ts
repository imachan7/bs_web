// smoke パート160（実行時カバレッジの計測点がカードデータのすべての kind にあるかの検査）
//
// coverage:effects は重いので定型に入っていない。計測点の無い kind が増えても気づけず、
// その効果は「発火したか分からない」まま残る。ここでは smoke を流さずにソースを grep し、
// カードデータにある継続効果の kind それぞれに noteCoverage が書かれているかだけを見る
import { assert } from "./helpers"
import { unmeasuredKinds } from "../coverage-effects"

console.log("=== カードデータの継続効果の kind すべてに計測点がある ===")
const missing = unmeasuredKinds()
for (const kind of missing) {
    // 1件ずつ失敗として出す（まとめて1件にすると、どの kind か分からない）
    assert(false, `計測点がありません: ${kind}（効果が効いた所に noteCoverage(effect, "${kind}") を書く）`)
}
assert(missing.length === 0, `計測点の無い kind: ${String(missing.length)}件`)

console.log("すべてのチェックに合格しました 🎉（part160）")
