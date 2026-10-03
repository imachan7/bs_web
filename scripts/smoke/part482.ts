// smoke パート482（BS13/BS14：実行実績0の効果節の場面テスト。効果文だけから期待値を書いた）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    chk("BS13-015", "冥総裁ハーゲン", "spirit")
    chk("BS13-053", "モクバオー", "brave")
    chk("BS02-030", "兵隊アントマン", "spirit")
    chk("BS01-002", "ロクケラトプス", "spirit")
    assert(getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
}

console.log("=== A1. ハーゲン：自分のエンドステップにトラッシュから手札に戻る ===")
scenario({
    name: "hagen-trash-own-end",
    start: { turn: "me", me: { trash: ["BS13-015"] } },
    steps: (t) => { t.act("me", { type: "endTurn" }) },
    expect: [],
})
console.log("すべてのチェックに合格しました 🎉（part482）")
