// smoke パート1005（古の魔王城：「すべて」を対象にする効果も付け替えられる。TARGET_REDIRECT.md §2.3 の2a。魔王城 Q23559）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const CASTLE = "BSC05-017" // 古の魔王城
const TEMPEST = "BS01-122" // フレイムテンペスト（赤マジック・コスト6・フラッシュ：BP3000以下のスピリットすべてを破壊＝両陣営）
const HOWLING = "BS04-099" // グラウンドハウリング（緑マジック・コスト5・メイン：BP4000以上の相手のスピリットすべてを疲労）
const DREAM = "BS04-102" // ドリームハンド（白マジック・コスト4・フラッシュ：コスト1以下のスピリットすべてを手札に戻す＝両陣営）
const IBARN = "BS01-005" // アイバーン（赤・コスト2。Lv1 BP2000）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3。Lv1 BP4000）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1。Lv1 BP1000）
const AUGS = "BS18-050" // アウグスドス（青・コスト4・シンボル2つ）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, cost] of [[CASTLE, "古の魔王城", 4], [TEMPEST, "フレイムテンペスト", 6], [HOWLING, "グラウンドハウリング", 5], [DREAM, "ドリームハンド", 4], [IBARN, "アイバーン", 2], [HADES, "デス・ハーデス", 3], [ROKU, "ロクケラトプス", 1], [AUGS, "アウグスドス", 4]] as const) {
    assert(getCard(id).name === name && getCard(id).cost === cost, `${id}は${name}（コスト${cost}）`)
}
assert(getCard(AUGS).symbol.length === 2, "アウグスドスはシンボル2つ（グラウンドハウリングの使用条件）")
for (const id of [TEMPEST, HOWLING, DREAM]) {
    const a = (getCard(id).effects[0] as { action?: { all?: boolean } }).action
    assert(a?.all === true, `${getCard(id).name}は「すべて」を対象にする`)
}

console.log("=== 「すべて」の付け替え ===")
type T = Parameters<Parameters<typeof scenario>[0]["steps"]>[0]
const cast = (t: T, timing: "flash" | "main"): void => {
    t.act("opp", { type: "castMagic", handIndex: 0, timing })
}

// フレイムテンペスト：持ち主（me）にBP3000以下が2体（A・B）、使った側（opp）に1体（U）
const tempest = (interactive = true) => ({
    turn: "opp" as const,
    interactive,
    me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: IBARN, label: "A" }, { card: IBARN, label: "B" }] },
    opp: { hand: [TEMPEST], spirits: [{ card: IBARN, label: "U" }] },
})
const tempestCast = ["相手.手札: フレイムテンペスト → なし", "相手.トラッシュ: なし → フレイムテンペスト", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5"]
scenario({
    name: "castle-すべての破壊を持ち主の1体へ付け替えると、その1体だけ破壊され、ほかの個体と使った側の個体は残る（Q23559）",
    start: tempest(),
    steps(t) {
        cast(t, "flash")
        assert(t.state.pendingChoice?.pid === t.me && t.state.pendingChoice.candidates?.includes(t.id("A")) === true, "持ち主に付け替え先が出る")
        t.act("me", { type: "resolveChoice", instanceId: t.id("A") })
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → アイバーン", ...tempestCast],
})
scenario({
    name: "castle-付け替えないとBP3000以下の3体がすべて破壊される",
    start: tempest(),
    steps(t) {
        cast(t, "flash")
        t.act("me", { type: "resolveChoice" })
    },
    expect: [
        "自分.A.場所: フィールド → なし", "自分.B.場所: フィールド → なし", "相手.U.場所: フィールド → なし",
        "自分.リザーブ: 10 → 12", "相手.リザーブ: 10 → 6", "自分.トラッシュ: なし → アイバーン、アイバーン", "相手.トラッシュ: なし → アイバーン、フレイムテンペスト",
        "相手.手札: フレイムテンペスト → なし", "相手.トラッシュのコア: 0 → 5",
    ],
})
scenario({
    name: "castle-非対話では付け替えず、すべて破壊される",
    start: tempest(false),
    steps(t) {
        cast(t, "flash")
    },
    expect: [
        "自分.A.場所: フィールド → なし", "自分.B.場所: フィールド → なし", "相手.U.場所: フィールド → なし",
        "自分.リザーブ: 10 → 12", "相手.リザーブ: 10 → 6", "自分.トラッシュ: なし → アイバーン、アイバーン", "相手.トラッシュ: なし → アイバーン、フレイムテンペスト",
        "相手.手札: フレイムテンペスト → なし", "相手.トラッシュのコア: 0 → 5",
    ],
})

// グラウンドハウリング：使用条件のシンボル2つのスピリットが使った側に要る
scenario({
    name: "castle-すべての疲労を持ち主の1体へ付け替えると、その1体だけ疲労する",
    start: {
        turn: "opp",
        interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: HADES, label: "H1" }, { card: HADES, label: "H2" }] },
        opp: { hand: [HOWLING], spirits: [{ card: AUGS }] },
    },
    steps(t) {
        cast(t, "main")
        t.act("me", { type: "resolveChoice", instanceId: t.id("H2") })
    },
    expect: ["自分.H2.疲労: false → true", "相手.手札: グラウンドハウリング → なし", "相手.トラッシュ: なし → グラウンドハウリング", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5"],
})

// ドリームハンド：コスト1以下のスピリットすべて（両陣営）を手札に戻す
scenario({
    name: "castle-すべての手札戻しを持ち主の1体へ付け替えると、その1体だけ戻る",
    start: {
        turn: "opp",
        interactive: true,
        me: { nexuses: [{ card: CASTLE, cores: 1 }], spirits: [{ card: ROKU, label: "R1" }, { card: ROKU, label: "R2" }] },
        opp: { hand: [DREAM], spirits: [{ card: ROKU, label: "U" }] },
    },
    steps(t) {
        cast(t, "flash")
        t.act("me", { type: "resolveChoice", instanceId: t.id("R2") })
    },
    expect: ["自分.R2.場所: フィールド → なし", "自分.手札: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "相手.手札: ドリームハンド → なし", "相手.トラッシュ: なし → ドリームハンド", "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4"],
})
console.log("すべてのチェックに合格しました 🎉（part1005）")
