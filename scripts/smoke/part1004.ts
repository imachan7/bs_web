// smoke パート1004（BSC05-017 古の魔王城：単体対象でも付け替えを聞く・未選択の個体へ付け替えられる・候補はその指定に入るものだけ。TARGET_REDIRECT.md §2.3 の1）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城（紫ネクサス・コスト4）
const GAST = "BS09-069" // フレイムガスト（赤マジック・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3。Lv1 BP4000・Lv2(コア4) BP7000）
const IBARN = "BS01-005" // アイバーン（赤・コスト2。Lv1 BP2000）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost] of [[CASTLE, "古の魔王城", 4], [GAST, "フレイムガスト", 6], [HADES, "デス・ハーデス", 3], [IBARN, "アイバーン", 2]] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost, `${id}は${name}（コスト${cost}）`)
}
assert(getCard(GAST).effects[0]?.kind === "magic", "フレイムガストは単体対象の破壊マジック")

console.log("=== BSC05-017 古の魔王城（単体対象） ===")
const start = (extra: { x?: boolean; interactive?: boolean } = {}) => ({
    turn: "opp" as const,
    interactive: extra.interactive ?? true,
    me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: HADES, label: "H" }, { card: IBARN, label: "A" }, ...(extra.x ? [{ card: HADES, label: "X", cores: 4 }] : [])] },
    opp: { hand: [GAST] },
})
const castGastAt = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], label: string) => {
    t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    if (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id(label) })
}
const castExpect = ["相手.手札: フレイムガスト → なし", "相手.トラッシュ: なし → フレイムガスト", "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 6"]

scenario({
    name: "castle-単体対象のハーデスを、選ばれていないアイバーンへ付け替えるとアイバーンだけ破壊される（Q23564）",
    start: start(),
    steps(t) {
        castGastAt(t, "H")
        assert(t.state.pendingChoice?.pid === t.me && t.state.pendingChoice.candidates?.includes(t.id("A")) === true, "持ち主に未選択のアイバーンが選択肢として出る")
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → アイバーン", ...castExpect],
})
scenario({
    name: "castle-付け替えないとハーデスが破壊される",
    start: start(),
    steps(t) {
        castGastAt(t, "H")
        t.act("me", { type: "resolveChoice" })
    },
    expect: ["自分.H.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → デス・ハーデス", ...castExpect],
})
scenario({
    name: "castle-その指定の候補に入らないBP7000のスピリットは付け替え先に出ない",
    start: start({ x: true }),
    steps(t) {
        castGastAt(t, "H")
        const c = t.state.pendingChoice?.candidates ?? []
        assert(c.includes(t.id("H")) && c.includes(t.id("A")) && !c.includes(t.id("X")), "付け替え先はHとAだけ（BP7000のXは出ない）")
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → アイバーン", ...castExpect],
})
scenario({
    name: "castle-非対話では付け替えない",
    start: start({ interactive: false }),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: ["自分.H.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → デス・ハーデス", ...castExpect],
})
console.log("すべてのチェックに合格しました 🎉（part1004）")
