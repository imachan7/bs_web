// smoke パート160（実行時カバレッジの計測点が生きているかの検査）
//
// `npm run coverage:effects` は、HEAD の使い捨て worktree にソース書き換えで計測コードを差し込む。
// 差し込み先はソースの文字列一致なので、**エンジンの形が変わると差し込めなくなって落ちる**。
// 落ちること自体は設計どおり（黙って no-op になるより良い）だが、
// coverage:effects は重いので定型に入っておらず、**壊れたまま放置される**という別の穴があった。
//
// 実際 2026-08-10 に3件たまっていて、うち2件は数日前から壊れていた:
//   - coreStepBonus の差し込み先が2箇所に増えていた（赤き砂の座Lv2）
//   - magicFreeGrant が「true返し」から「発生源のinstanceId返し」に変わっていた（第七弾バッチ2）
//
// ここでは **worktree も smoke も使わず**、作業ツリーのソースに対して
// 「差し込み先が今も1箇所ずつ存在するか」だけを検査する（ファイルは書き換えない）。
// これで、計測点を壊した変更はその場の smoke で落ちる。
import { assert } from "./helpers"
import { checkPatchTargets } from "../coverage-effects"

console.log("=== 実行時カバレッジの差し込み先がすべて1箇所ずつ存在する ===")
// ⚠️ coverage:effects 自身が回す smoke（COV_OUT つき）では飛ばす。
// あちらは計測コードを差し込み**済み**の worktree で走るので、差し込み先はもう元の形をしていない。
// ここで検査すると「計測が成功しているときに限って落ちる」自己矛盾になる（実際に一度そうなった）
if (process.env["COV_OUT"]) {
    console.log("  （計測中の worktree では検査しない）")
} else {
    const problems = checkPatchTargets()
    for (const p of problems) {
        // 1件ずつ失敗として出す（まとめて1件にすると、何箇所壊れたか分からない）
        assert(false, `カバレッジの計測点が壊れています: ${p.split("\n").slice(0, 2).join(" / ")}`)
    }
    assert(
        problems.length === 0,
        `計測点は全件健在（壊れている差し込み先: ${String(problems.length)}件）`,
    )
}
