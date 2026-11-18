// smoke パート1001（P14-09 ムゲンフレイム：BP3000以下1体を破壊。「ムゲン」入りの自分のスピリットがいればさらに1体）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const FIRE = "P14-09" // ムゲンフレイム（赤マジック・コスト3・フラッシュ）
const BERSERK = "BS01-074" // バーサーカー・ガン（BP1000）
const WOLF = "BS21-002" // ウォルフドラゴン（Lv1 BP2000）
const METAL = "BS01-008" // メタルバーン（Lv1 BP3000）
const HARDES = "BS01-031" // デス・ハーデス（Lv1 BP4000）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FIRE).name === "ムゲンフレイム" && getCard(FIRE).cost === 3 && getCard(FIRE).flash === true, "FIREはコスト3のフラッシュ")
    assert(getCard(METAL).levels[0]!.bp === 3000 && getCard(HARDES).levels[0]!.bp === 4000, "境界のBP3000と4000")
    // カード名に「ムゲン」と入っているスピリットは現状のプールに無い（質問欄）。「ムゲン」入りがいる場面は書けない
}

const castLines = ["自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 3", "自分.手札: ムゲンフレイム → なし", "自分.トラッシュ: なし → ムゲンフレイム"]
const cast = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], target: string) => {
    t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
    t.closeFlash()
}

scenario({
    name: "fire-destroys-bp3000-boundary",
    start: { me: { hand: [FIRE] }, opp: { spirits: [{ card: METAL }] } },
    steps: (t) => cast(t, "メタルバーン"),
    expect: [...castLines, "相手.メタルバーン.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → メタルバーン"],
})
scenario({
    name: "fire-bp4000-not-destroyed",
    start: { me: { hand: [FIRE] }, opp: { spirits: [{ card: HARDES }, { card: WOLF }] } },
    steps: (t) => cast(t, "ウォルフドラゴン"),
    expect: [...castLines, "相手.ウォルフドラゴン.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ウォルフドラゴン"], // 選べるのはBP3000以下だけ。デス・ハーデス（4000）は残る
})
// 「ムゲン」入りがいない：「さらに」の2体目は壊さない（1体だけ）
scenario({
    name: "fire-no-mugen-only-one-destroyed",
    start: { me: { hand: [FIRE], spirits: [{ card: VANILLA }] }, opp: { spirits: [{ card: BERSERK }, { card: WOLF }] } },
    steps: (t) => cast(t, "バーサーカー・ガン"),
    expect: [...castLines, "相手.バーサーカー・ガン.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → バーサーカー・ガン"],
})
// 相手のBP3000以下がいなければ何も起きない（使用コストだけ）
scenario({
    name: "fire-no-valid-target",
    start: { me: { hand: [FIRE] }, opp: { spirits: [{ card: HARDES }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
    },
    expect: castLines,
})
// 自分のスピリットは対象にならない（相手のスピリット限定）
scenario({
    name: "fire-never-hits-own-spirit",
    start: { me: { hand: [FIRE], spirits: [{ card: BERSERK }] }, opp: { spirits: [{ card: WOLF }] } },
    steps: (t) => cast(t, "ウォルフドラゴン"),
    expect: [...castLines, "相手.ウォルフドラゴン.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → ウォルフドラゴン"],
})

console.log("すべてのチェックに合格しました 🎉（part1001）")
