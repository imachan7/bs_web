// ルール用語ごとに、効果文で「操作として出る」「〜されたときに反応する」「〜されないで防ぐ」カードの枚数を数える。
// 2つの操作を別のアクションにするかは、どちらか一方にだけ反応するカードがあるかで決める（REFACTOR_PLAN.md §2.1）。
// 正規表現は効果文の言い回しから拾った近似なので、件数が少ない語は例のカードを読んで確かめること。
//
//   npx tsx scripts/count-rule-terms.ts            表だけ
//   npx tsx scripts/count-rule-terms.ts --examples 件数が1〜5件の欄に例のカードを添える
import { loadAllCards } from "../data/loadCards"

type Term = {
    word: string
    group: "ゾーン移動" | "コア移動" | "状態変化" | "数値変更"
    op: RegExp
    trigger: RegExp | null
    immune: RegExp | null
}

const TERMS: Term[] = [
    { word: "召喚", group: "ゾーン移動", op: /召喚する/, trigger: /召喚時|召喚(された|した)(とき|時)/, immune: /召喚できない/ },
    { word: "配置", group: "ゾーン移動", op: /配置する/, trigger: /配置時|配置(された|した)(とき|時)/, immune: /配置できない/ },
    { word: "破壊", group: "ゾーン移動", op: /破壊する/, trigger: /破壊時|破壊(された|した)(とき|時)/, immune: /破壊されない/ },
    { word: "消滅", group: "ゾーン移動", op: /消滅させる/, trigger: /消滅(した|された)(とき|時)?/, immune: /消滅しない/ },
    { word: "手札に戻す", group: "ゾーン移動", op: /手札に戻す/, trigger: /手札に戻(された|った)(とき|時)/, immune: /手札に戻(らない|されない|せない)/ },
    { word: "デッキに戻す", group: "ゾーン移動", op: /デッキの(上|下|底)に戻す/, trigger: /デッキの(上|下|底)に戻(された|った)(とき|時)/, immune: /デッキの(上|下|底)に戻(らない|されない|せない)/ },
    { word: "手札の破棄", group: "ゾーン移動", op: /手札[^。]{0,12}破棄する/, trigger: /手札から破棄(された|した)(とき|時)/, immune: /手札[^。]{0,12}破棄されない/ },
    { word: "デッキの破棄", group: "ゾーン移動", op: /デッキを[^。]{0,12}破棄する/, trigger: /デッキ(から|を)[^。]{0,8}破棄(された|した)(とき|時)|デッキが破棄され/, immune: /デッキは破棄されない|でしか破棄されない/ },
    { word: "ドロー", group: "ゾーン移動", op: /ドローする/, trigger: /ドローした(とき|時)|ドローステップ以外/, immune: /ドローできない/ },
    { word: "手札に加える", group: "ゾーン移動", op: /手札に加える/, trigger: /手札に加え(られた|た)(とき|時)/, immune: /手札に加え(られない|ることはできない)/ },
    { word: "トラッシュに置く", group: "ゾーン移動", op: /トラッシュに置く/, trigger: /トラッシュに置かれた(とき|時)/, immune: /トラッシュに置かれない/ },
    { word: "手元に置く", group: "ゾーン移動", op: /手元に置く/, trigger: /手元に置かれた(とき|時)/, immune: null },
    { word: "オープン", group: "ゾーン移動", op: /オープンする/, trigger: /オープンされた(とき|時)/, immune: null },
    { word: "バーストのセット", group: "ゾーン移動", op: /バーストとしてセット|バーストをセットする/, trigger: /セットした(とき|時)/, immune: /セットできない/ },
    { word: "合体", group: "ゾーン移動", op: /合体させる|合体する/, trigger: /合体(した|された)(とき|時)|合体時/, immune: /合体できない/ },
    { word: "分離", group: "ゾーン移動", op: /分離させる|分離する/, trigger: /分離(した|された)(とき|時)/, immune: /分離(できない|されない)/ },
    { word: "コアを置く", group: "コア移動", op: /コア[^。]{0,12}置く/, trigger: /コアが[^。]{0,8}置かれた(とき|時)|コアを置いた(とき|時)/, immune: /コアを置けない|コアが置かれない/ },
    { word: "コアを取り除く", group: "コア移動", op: /取り除く/, trigger: /取り除かれた(とき|時)/, immune: /取り除(くことができない|くことはできない|かれない)/ },
    { word: "ボイドに置く", group: "コア移動", op: /ボイドに置く/, trigger: /ボイドに置かれた(とき|時)/, immune: /ボイドに置かれない/ },
    { word: "疲労", group: "状態変化", op: /疲労させる/, trigger: /疲労した(とき|時)/, immune: /疲労しない|疲労させられない/ },
    { word: "回復", group: "状態変化", op: /回復させる|回復する(?!(とき|時))/, trigger: /回復(した|する)(とき|時)/, immune: /回復できない|回復しない/ },
    { word: "BPを上げる", group: "数値変更", op: /(ＢＰ|BP)[＋+]/, trigger: /(ＢＰ|BP)[＋+][^。]{0,6}された(とき|時)/, immune: null },
    { word: "BPを下げる", group: "数値変更", op: /(ＢＰ|BP)[－\-−]/, trigger: /(ＢＰ|BP)[－\-−][^。]{0,6}された(とき|時)/, immune: /(ＢＰ|BP)[－\-−][^。]{0,6}されない/ },
    { word: "ライフを減らす", group: "数値変更", op: /ライフ[^。]{0,8}減らす/, trigger: /ライフ[^。]{0,8}(減らした|減った|減らされた)(とき|時)/, immune: /ライフ[^。]{0,8}(減らされない|減らない)/ },
    { word: "ライフに置く", group: "数値変更", op: /ライフに置く/, trigger: /ライフに[^。]{0,4}置かれた(とき|時)/, immune: null },
    { word: "シンボルを増やす", group: "数値変更", op: /シンボル[^。]{0,8}(追加|増や|＋|\+)/, trigger: null, immune: null },
    { word: "コストを変える", group: "数値変更", op: /コスト[＋+－\-−]\d|コストを[^。]{0,8}(として扱う|にする)/, trigger: null, immune: null },
]

const showExamples = process.argv.includes("--examples")
const cards = loadAllCards().map((c) => ({ id: c.cardId, name: c.name, text: (c.effect ?? "").replace(/\s+/g, "") }))

function hits(re: RegExp | null): { id: string; name: string; snippet: string }[] {
    if (!re) return []
    const out: { id: string; name: string; snippet: string }[] = []
    for (const c of cards) {
        const m = re.exec(c.text)
        if (!m) continue
        const from = Math.max(0, m.index - 20)
        out.push({ id: c.id, name: c.name, snippet: c.text.slice(from, m.index + m[0].length + 10) })
    }
    return out
}

console.log(`対象カード: ${cards.length}枚（数えているのは枚数。1枚に何度出ても1）\n`)
console.log("| 分類 | 語 | 操作 | 誘発（〜されたとき） | 耐性（〜されない） |")
console.log("| :-- | :-- | --: | --: | --: |")
const small: string[] = []
for (const t of TERMS) {
    const [op, tr, im] = [hits(t.op), hits(t.trigger), hits(t.immune)]
    console.log(`| ${t.group} | ${t.word} | ${op.length} | ${tr.length} | ${im.length} |`)
    for (const [label, list] of [["誘発", tr], ["耐性", im]] as const) {
        if (list.length < 1 || list.length > 5) continue
        small.push(`- ${t.word}（${label} ${list.length}件）`)
        for (const h of list) small.push(`  - ${h.id} ${h.name}：…${h.snippet}…`)
    }
}
if (showExamples && small.length > 0) console.log(`\n## 件数が少ない欄（境界の候補）\n\n${small.join("\n")}`)
