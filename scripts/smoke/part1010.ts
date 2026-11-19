// smoke パート1010（サンク系4枚の付け替え：対象が出そろった後に1回聞く・発生源は全部集める。TARGET_REDIRECT.md §2.3 の3a）
import { assert, getCard, giveBp } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SANK = "BS04-054" // アルカナソルジャー・サンク（黄・コスト5。Lv2＝コア2・BP4000。相手のターンのマジック）
const KETT = "BS06-056" // 細剣の猫騎士ケット・シー（黄・コスト5。自分のターンのマジック。持ち主のコスト2を守る）
const SNOW = "BS05-040" // プリンセス・スノーホワイト（黄・コスト3。相手のターン。持ち主の白の氷姫を守る。スピリットの効果も）
const TINK = "BS09-038" // スズランの妖精ティンカ（黄・コスト2。相手のアタックステップ。持ち主の楽族を守る）
const CASTLE = "BSC05-017" // 古の魔王城（紫ネクサス）
const TEMPEST = "BS01-122" // フレイムテンペスト（赤マジック・コスト6・フラッシュ：BP3000以下のスピリットすべてを破壊）
const GAST = "BS09-069" // フレイムガスト（赤マジック・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊）
const PIYON = "BS02-049" // ピヨン（黄・コスト0・歌鳥）
const IBARN = "BS01-005" // アイバーン（赤・コスト2・BP2000）
const MANI = "BS01-078" // 姫械マーニ（白・コスト2・氷姫）
const DOROTHY = "BS04-046" // 妖精ドロシー（黄・コスト1・楽族）
const BELDGOL = "BS09-X36" // 魔界七将ベルドゴール（紫・コスト3。召喚時：疲労しているコスト4以下の相手のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, type, cost] of [
    [SANK, "アルカナソルジャー・サンク", "spirit", 5], [KETT, "細剣の猫騎士ケット・シー", "spirit", 5], [SNOW, "プリンセス・スノーホワイト", "spirit", 3],
    [TINK, "スズランの妖精ティンカ", "spirit", 2], [CASTLE, "古の魔王城", "nexus", 4], [TEMPEST, "フレイムテンペスト", "magic", 6], [GAST, "フレイムガスト", "magic", 6],
    [PIYON, "ピヨン", "spirit", 0], [IBARN, "アイバーン", "spirit", 2], [MANI, "姫械マーニ", "spirit", 2], [DOROTHY, "妖精ドロシー", "spirit", 1], [BELDGOL, "魔界七将ベルドゴール", "spirit", 3],
] as const) {
    assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost, `${id}は${name}（${type}・コスト${cost}）`)
}
for (const id of [SANK, KETT, SNOW, TINK]) assert(getCard(id).effects.some((e) => e.kind === "targetRedirect"), `${id}は targetRedirect を持つ`)

const castExpect = (cardName: string) => [`相手.手札: ${cardName} → なし`, `相手.トラッシュ: なし → ${cardName}`, "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 6"]
const cast = (t: ScenarioCtx, pick?: string) => {
    t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
    if (pick !== undefined && t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id(pick) })
}
const asked = (t: ScenarioCtx) => t.state.pendingChoice?.pid === t.me && t.state.pendingChoice.kind === "target"
const sankTrash = "自分.トラッシュ: なし → アルカナソルジャー・サンク"

console.log("=== BS04-054 サンク ===")
const sankStart = (opts: { interactive?: boolean; hand?: string } = {}) => ({
    turn: "opp" as const,
    interactive: opts.interactive ?? true,
    me: { spirits: [{ card: SANK, label: "S", cores: 2 }, { card: PIYON, label: "P" }, { card: PIYON, label: "Q" }] },
    opp: { hand: [opts.hand ?? TEMPEST] },
})
scenario({
    name: "sank-「すべて」にサンクが含まれると、サンクに付け替えて味方は破壊されない",
    start: sankStart(),
    steps(t) {
        giveBp(t.state, t.inst("S"), -1000) // Lv2のままBP3000にして、テンペストの対象に入れる
        cast(t)
        assert(asked(t) && t.state.pendingChoice!.candidates?.join() === t.id("S"), "持ち主に確認が出て、付け替え先はサンクだけ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("S") })
    },
    expect: ["自分.S.場所: フィールド → なし", "自分.リザーブ: 10 → 12", sankTrash, ...castExpect("フレイムテンペスト")],
})
scenario({
    name: "sank-付け替えないと味方も破壊される",
    start: sankStart(),
    steps(t) {
        giveBp(t.state, t.inst("S"), -1000)
        cast(t)
        t.act("me", { type: "resolveChoice" })
    },
    expect: ["自分.S.場所: フィールド → なし", "自分.P.場所: フィールド → なし", "自分.Q.場所: フィールド → なし", "自分.リザーブ: 10 → 14", "自分.トラッシュ: なし → アルカナソルジャー・サンク、ピヨン、ピヨン", ...castExpect("フレイムテンペスト")],
})
scenario({
    name: "sank-サンクを選んだ単体は付け替えるまでもなく確認が出ない",
    start: sankStart({ hand: GAST }),
    steps(t) {
        cast(t, "S")
        assert(t.state.pendingChoice === null, "確認は出ない")
    },
    expect: ["自分.S.場所: フィールド → なし", "自分.リザーブ: 10 → 12", sankTrash, ...castExpect("フレイムガスト")],
})
scenario({
    name: "sank-ほかのスピリットを選んだ単体は付け替えない（サンクが対象に含まれない）",
    start: sankStart({ hand: GAST }),
    steps(t) {
        cast(t, "P")
        assert(t.state.pendingChoice === null, "確認は出ない")
    },
    expect: ["自分.P.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ピヨン", ...castExpect("フレイムガスト")],
})
scenario({
    name: "sank-非対話では自動でサンクに付け替える",
    start: sankStart({ interactive: false }),
    steps(t) {
        giveBp(t.state, t.inst("S"), -1000)
        cast(t)
    },
    expect: ["自分.S.場所: フィールド → なし", "自分.リザーブ: 10 → 12", sankTrash, ...castExpect("フレイムテンペスト")],
})

console.log("=== BS06-056 ケット・シー（自分のターン・持ち主のコスト2を守る） ===")
scenario({
    name: "kett-相手のマジックが持ち主のコスト2を選ぶと、選ばれていないケット・シーへ付け替えられる",
    start: {
        turn: "me",
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: KETT, label: "K" }, { card: IBARN, label: "A" }, { card: PIYON, label: "P" }] },
        opp: { hand: [GAST] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("P") })
        cast(t, "A")
        assert(asked(t) && t.state.pendingChoice!.candidates?.join() === t.id("K"), "付け替え先はケット・シーだけ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("K") })
    },
    expect: ["自分.K.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → 細剣の猫騎士ケット・シー", "自分.P.疲労: false → true", ...castExpect("フレイムガスト")],
})
scenario({
    name: "kett-相手のターンには働かない",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: KETT, label: "K" }, { card: IBARN, label: "A" }] }, opp: { hand: [GAST] } },
    steps(t) {
        cast(t, "A")
        assert(t.state.pendingChoice === null, "確認は出ない")
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → アイバーン", ...castExpect("フレイムガスト")],
})

console.log("=== BS05-040 スノーホワイト（スピリットの効果も付け替えられる） ===")
scenario({
    name: "snow-相手のスピリットの効果が白の氷姫を選ぶと、スノーホワイトへ付け替えられる",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: MANI, label: "R", rested: true }, { card: SNOW, label: "W", rested: true }] },
        opp: { hand: [BELDGOL] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
        if (t.state.pendingChoice?.pid === t.opp) t.act("opp", { type: "resolveChoice", instanceId: t.id("R") })
        assert(asked(t) && t.state.pendingChoice!.candidates?.join() === t.id("W"), "付け替え先はスノーホワイトだけ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("W") })
    },
    expect: ["自分.W.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → プリンセス・スノーホワイト", "相手.トラッシュのコア: 0 → 3", "相手.リザーブ: 10 → 6", "相手.手札: 魔界七将ベルドゴール → なし", "相手.魔界七将ベルドゴール.BP: なし → 3000", "相手.魔界七将ベルドゴール.Lv: なし → 1", "相手.魔界七将ベルドゴール.コア: なし → 1", "相手.魔界七将ベルドゴール.場所: なし → フィールド", "相手.魔界七将ベルドゴール.疲労: なし → false"],
})

console.log("=== BS09-038 ティンカ（相手のアタックステップだけ） ===")
const tinkStart = (phase: "main" | "attack") => ({
    turn: "opp" as const,
    phase,
    interactive: true,
    me: { spirits: [{ card: TINK, label: "T" }, { card: DOROTHY, label: "D" }] },
    opp: { hand: [GAST], spirits: [{ card: PIYON, label: "U" }] },
})
scenario({
    name: "tink-メインステップでは付け替えない",
    start: tinkStart("main"),
    steps(t) {
        cast(t, "D")
        assert(t.state.pendingChoice === null, "確認は出ない")
    },
    expect: ["自分.D.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → 妖精ドロシー", ...castExpect("フレイムガスト")],
})
scenario({
    name: "tink-アタックステップでは楽族を選ぶとティンカへ付け替えられる",
    start: tinkStart("attack"),
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("U") })
        t.act("me", { type: "pass" })
        cast(t, "D")
        assert(asked(t) && t.state.pendingChoice!.candidates?.join() === t.id("T"), "付け替え先はティンカだけ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("T") })
    },
    expect: ["自分.T.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → スズランの妖精ティンカ", "相手.U.疲労: false → true", ...castExpect("フレイムガスト")],
})

console.log("=== サンクと古の魔王城：1回の確認に両方の候補が出る ===")
scenario({
    name: "sank+castle-確認は1回で、どちらの付け替え先も選べる（魔王城の候補のピヨンを選ぶ）",
    start: { ...sankStart(), me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: SANK, label: "S", cores: 2 }, { card: PIYON, label: "P" }, { card: PIYON, label: "Q" }] } },
    steps(t) {
        giveBp(t.state, t.inst("S"), -1000)
        cast(t)
        const c = t.state.pendingChoice?.candidates ?? []
        assert(asked(t) && c.includes(t.id("S")) && c.includes(t.id("P")) && c.includes(t.id("Q")), "サンクの候補（S）と魔王城の候補（P・Q）が1回の確認に並ぶ")
        t.act("me", { type: "resolveChoice", instanceId: t.id("P") })
        assert(t.state.pendingChoice === null, "確認は1回だけ")
    },
    expect: ["自分.P.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → ピヨン", "自分.S.BP: 4000 → 3000", ...castExpect("フレイムテンペスト")],
})
console.log("すべてのチェックに合格しました 🎉（part1010）")
