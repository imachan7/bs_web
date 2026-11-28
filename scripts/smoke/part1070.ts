// smoke パート1070（任意の効果の断るボタンの文言。public/src/ui/declineLabel.ts。2026-11-28 ユーザー合意）
import { assert } from "./helpers"
import { declineLabelOf } from "../../public/src/ui/declineLabel"

console.log("=== 1. 「発動しますか」型の確認は、選択肢の動詞を打ち消す ===")
{
    const cases: [string, string][] = [["発動する", "発動しない"], ["召喚する", "召喚しない"], ["戻す", "戻さない"], ["残す", "残さない"], ["疲労させて残す", "疲労させて残さない"], ["置き換える", "置き換えない"]]
    for (const [opt, want] of cases) {
        const got = declineLabelOf({ confirm: true, options: [opt] })
        assert(got === want, `「${opt}」→「${want}」（実際: ${got}）`)
    }
}

console.log("=== 2. 確認でないもの・選択肢が2つ以上なら「選ばない」 ===")
{
    assert(declineLabelOf({ options: ["発動する"] }) === "選ばない", "confirm でなければ選ばない")
    assert(declineLabelOf({ confirm: true, options: ["コスト3で発動する", "コスト5で発動する"] }) === "選ばない", "選択肢が2つ以上なら選ばない")
    assert(declineLabelOf(null) === "選ばない", "選択待ちが無ければ選ばない")
}

console.log("すべてのチェックに合格しました 🎉（part1070）")
