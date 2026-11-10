// smoke パート883（選択バーの「選んだ量／上限」表示の純粋関数）
import { assert } from "./helpers"
import { choiceCounterView } from "../../public/src/choiceCounter"

console.log("=== choiceCounterView ===")
{
    const a = choiceCounterView({ label: "BP合計", current: 3000, max: 10000 })
    assert(a.text === "BP合計　3000／10000" && !a.full, "上限未満は full でない")
    const b = choiceCounterView({ label: "戻す", current: 2, max: 2 })
    assert(b.text === "戻す　2／2" && b.full, "上限ちょうどで full")
}
console.log("すべてのチェックに合格しました 🎉（part883）")
