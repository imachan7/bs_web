// smoke パート190（全効果エントリの火入れ＝総当たり）
//
// `npm run coverage:effects` が「**カードデータに書いてあるのに一度も発火していない**」と
// 報告する効果エントリを、まとめて潰すためのドライバ。盤面作りと発火の手順は fireAll.ts。
//
// **1枚ずつ挙動を検証するテストではない**（それは他のパートの仕事）。
// ここが見るのは「どのカードの、どの効果エントリも、**現実的な盤面で例外を出さずに解決しきる**」こと:
//   - 例外が出ない
//   - 選択待ち（pendingChoice）が残らない
//   - カードの総数が変わらない（保存則）
// カバレッジの穴を埋めるついでに、めったに触られないカードのクラッシュを拾う網になる。
import { assert } from "./helpers"
import { fireAll } from "./fireAll"

const { fired, crashed, crashes } = fireAll()
for (const c of crashes) assert(false, `火入れで失敗: ${c}`)
assert(crashed === 0, `全カードの火入れが通る（発火${fired}回／失敗${crashed}件）`)
