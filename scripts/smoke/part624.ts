// smoke パート624（マジックは対象を取る効果しかなく対象がいなければ使用できない。2026-10-22 ユーザー確認）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const ADER = "BS17-073" // アーダーフレイム（BP4000以下の相手1体を破壊）
const AWAKEN = "BS01-115" // アウェイクン（コアを自分のスピリット1体に置き、1枚ドロー）
const RATA = "BS03-037" // ラタトスカ（【装甲：赤】）
const GORA = "BS01-001" // ゴラドン
for (const [id, name] of [[ADER, "アーダーフレイム"], [AWAKEN, "アウェイクン"], [RATA, "ラタトスカ"], [GORA, "ゴラドン"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
}

console.log("=== 【装甲】で対象にできないスピリットしかいなければ使えない ===")
scenario({
    name: "624-a",
    start: { interactive: true, turn: "me", me: { hand: [ADER] }, opp: { spirits: [{ card: RATA }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [],
})

console.log("=== 相手のスピリットがいなければ使えない ===")
scenario({
    name: "624-b",
    start: { interactive: true, turn: "me", me: { hand: [ADER], spirits: [{ card: GORA }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [],
})

console.log("=== 対象を取らない文もあれば、対象がいなくても使えて可能な限り解決する ===")
scenario({
    name: "624-c",
    start: { turn: "me", me: { hand: [AWAKEN], deck: [GORA] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0 })
    },
    expect: [
        "自分.手札: アウェイクン → ゴラドン",
        "自分.トラッシュ: なし → アウェイクン",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.デッキ枚数: 1 → 0",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part624）")
