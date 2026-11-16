// smoke パート975（BS01-124 イビルオーラ・BS01-111 ダイヤモンドの月・BSC05-011 電精ビリット。期待値役が効果文だけから書いた場面テスト）
import { assert, effectiveBp, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const AURA = "BS01-124" // イビルオーラ（紫マジック・コスト3・フラッシュ）
const MOON = "BS01-111" // ダイヤモンドの月（白ネクサス・コスト5。Lv2＝コア3）
const BILIT = "BSC05-011" // 電精ビリット（黄・コスト4）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1・Lv3＝コア3でBP4000）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1・BP1000）
const GREEN = "BS01-051" // フライングミラージュ（緑・コスト1・BP2000）
const IBARN = "BS01-005" // アイバーン（赤・コスト2・コア4でBP6000）
const SLASH = "BS07-068" // フェラールスラッシュ（赤マジック・コスト4・メイン：BP2000以下の相手のスピリットすべてを破壊）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[AURA, "イビルオーラ"], [MOON, "ダイヤモンドの月"], [BILIT, "電精ビリット"], [RED, "ロクケラトプス"],
        [WHITE, "バーサーカー・ガン"], [GREEN, "フライングミラージュ"], [IBARN, "アイバーン"], [SLASH, "フェラールスラッシュ"]]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id}は${name}`)
}

// 「〜することで」は任意（確認つき）。確認の選択待ちが出ていれば「はい」「いいえ」を答える（出ていなければ何もしない）
const confirm = (t: ScenarioCtx, side: Side, yes: boolean) => {
    const pc = t.state.pendingChoice
    if (!pc || pc.kind !== "option" || !pc.options) return
    const hit = pc.options.find((o) => (yes ? /はい|する|払|発動/ : /いいえ|しない|しません/).test(o) && (yes ? !/しない|しません/.test(o) : true))
    t.act(side, { type: "resolveChoice", option: hit ?? (yes ? pc.options[0] : pc.options[pc.options.length - 1]) ?? "" })
}
const answer = (t: ScenarioCtx, side: Side, label: string) => t.act(side, { type: "resolveChoice", instanceId: t.id(label) })
// 自分がエンドしたあと、相手のターン開始で起きる変化（ドロー1枚・コアステップ）
const oppStart = (reserve = 10) => [`相手.リザーブ: ${reserve} → ${reserve + 1}`, "相手.デッキ枚数: 40 → 39", "相手.手札: なし → ロクケラトプス"]

console.log("=== BS01-124 イビルオーラ ===")
// 節1：フラッシュでスピリット1体（どちらの陣営でも）にボイドからコア4個
// 節2：使ったターンのエンドステップに、自分のコア4個をボイドへ（置いたコアに限らない。足りなければ置ける分だけ）
scenario({
    name: "aura-足りない（トラッシュの3個だけ）",
    start: { me: { hand: [AURA], reserve: 3 }, opp: { spirits: [{ card: RED, label: "R" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") })
        t.act("me", { type: "endTurn" })
    },
    expect: ["相手.R.コア: 1 → 5", "相手.R.Lv: 1 → 3", "相手.R.BP: 1000 → 4000", "自分.手札: イビルオーラ → なし",
        "自分.トラッシュ: なし → イビルオーラ", "自分.リザーブ: 3 → 0", ...oppStart()],
})
scenario({
    name: "aura-ちょうど4個（リザーブ1＋トラッシュ3）。置いた相手のコアは取らない",
    start: { me: { hand: [AURA], reserve: 4 }, opp: { spirits: [{ card: RED, label: "R" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") })
        t.act("me", { type: "endTurn" })
    },
    expect: ["相手.R.コア: 1 → 5", "相手.R.Lv: 1 → 3", "相手.R.BP: 1000 → 4000", "自分.手札: イビルオーラ → なし",
        "自分.トラッシュ: なし → イビルオーラ", "自分.リザーブ: 4 → 0", ...oppStart()],
})
scenario({
    name: "aura-ソウルコアはボイドへ行かない",
    start: { me: { hand: [AURA], reserve: 4, soulCore: "リザーブ" }, opp: { spirits: [{ card: RED, label: "R" }] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("R") })
        t.act("me", { type: "endTurn" })
    },
    expect: ["相手.R.コア: 1 → 5", "相手.R.Lv: 1 → 3", "相手.R.BP: 1000 → 4000", "自分.手札: イビルオーラ → なし",
        "自分.トラッシュ: なし → イビルオーラ", "自分.リザーブ: 4 → 1", ...oppStart()],
})
scenario({
    name: "aura-メイン効果は無いのでメインタイミングでは使えない",
    start: { me: { hand: [AURA], reserve: 3 }, opp: { spirits: [{ card: RED, label: "R" }] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: t.id("R") })
    },
    expect: [],
})

console.log("=== BS01-111 ダイヤモンドの月 ===")
// 節1（Lv1･Lv2）：相手の赤にブロックされた／相手の赤のアタッカーをブロックした自分のスピリットすべて BP+1000
// 節2（Lv2）：自分のスピリットをアタックかブロックした相手の赤のスピリットは、バトル終了時に破壊される（勝っても負けても）
// buffed＝バトル中だけ BP+1000 されているはずの自分のスピリット（バトル終了後は元のBPに戻るので expect には書かない）
const attackAndBlock = (t: ScenarioCtx, attacker: Side, atk: string, blk: string, buffed?: string) => {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(attacker, { type: "nextPhase" })
    t.act(attacker, { type: "attack", instanceId: t.id(atk) })
    t.closeFlash()
    t.act(defender, { type: "block", instanceId: t.id(blk) })
    if (buffed) assert(effectiveBp(t.state, t.me, t.inst(buffed)) === 2000, `バトル中は${buffed}がBP+1000（2000）`)
    t.closeFlash()
}
const moon = (cores: number) => [{ card: MOON, cores }]
scenario({
    name: "moon-Lv1-自分がアタック・相手の赤にブロックされるとBP+1000で勝つ",
    start: { me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(0) }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "me", "白", "赤", "白"),
    expect: ["自分.白.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "moon-Lv1-ブロックしたのが赤でなければBP+1000は付かない",
    start: { me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(0) }, opp: { spirits: [{ card: GREEN, label: "緑" }] } },
    steps: (t) => attackAndBlock(t, "me", "白", "緑"),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.緑.疲労: false → true"],
})
scenario({
    name: "moon-Lv1-相手の赤のアタッカーをブロックするとBP+1000で勝つ",
    start: { turn: "opp", me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(0) }, opp: { spirits: [{ card: RED, label: "赤" }] } },
    steps: (t) => attackAndBlock(t, "opp", "赤", "白", "白"),
    expect: ["自分.白.疲労: false → true", "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 11",
        "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "moon-Lv1-赤でないアタッカーをブロックしてもBP+1000は付かない",
    start: { turn: "opp", me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(0) }, opp: { spirits: [{ card: GREEN, label: "緑" }] } },
    steps: (t) => attackAndBlock(t, "opp", "緑", "白"),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.緑.疲労: false → true"],
})
scenario({
    name: "moon-Lv2-自分がアタックして相手の赤にブロックされ、負けても赤はバトル終了時に破壊される",
    start: { me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(3) }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackAndBlock(t, "me", "白", "赤"),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "moon-Lv2-相手の赤がアタックして自分のスピリットにブロックされ、勝っても赤はバトル終了時に破壊される",
    start: { turn: "opp", me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(3) }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackAndBlock(t, "opp", "赤", "白"),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン",
        "相手.赤.場所: フィールド → なし", "相手.リザーブ: 10 → 13", "相手.トラッシュ: なし → ロクケラトプス"],
})
scenario({
    name: "moon-Lv1-バトル終了時の破壊はLv2だけ（赤は勝って生き残る）",
    start: { me: { spirits: [{ card: WHITE, label: "白" }], nexuses: moon(0) }, opp: { spirits: [{ card: RED, label: "赤", cores: 3 }] } },
    steps: (t) => attackAndBlock(t, "me", "白", "赤"),
    expect: ["自分.白.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.赤.疲労: false → true"],
})

console.log("=== BSC05-011 電精ビリット ===")
// 節1（Lv1-3）：このスピリットの破壊時、1枚ドロー
// 節2（Lv3）：他の自分のスピリットが破壊されたとき、このスピリットを手札に戻すことで、破壊されたスピリットを破壊時のまま場に残す（同時破壊でも1体）
const defendWith = (t: ScenarioCtx, atk: string, blk: string) => attackAndBlock(t, "opp", atk, blk)
scenario({
    name: "bilit-Lv3-他のスピリットが破壊されると、ビリットを手札に戻してそのスピリットを破壊時のまま残す",
    start: { turn: "opp", me: { spirits: [{ card: BILIT, label: "ビリット", cores: 3 }, { card: WHITE, label: "A" }] }, opp: { spirits: [{ card: RED, label: "敵", cores: 3 }] } },
    steps(t) {
        defendWith(t, "敵", "A")
        confirm(t, "me", true)
    },
    expect: ["自分.ビリット.場所: フィールド → なし", "自分.手札: なし → 電精ビリット", "自分.リザーブ: 10 → 13", "自分.A.疲労: false → true", "相手.敵.疲労: false → true"],
})
scenario({
    name: "bilit-Lv2-他のスピリットが破壊されても戻さない",
    start: { turn: "opp", me: { spirits: [{ card: BILIT, label: "ビリット", cores: 2 }, { card: WHITE, label: "A" }] }, opp: { spirits: [{ card: RED, label: "敵", cores: 3 }] } },
    steps: (t) => defendWith(t, "敵", "A"),
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.敵.疲労: false → true"],
})
scenario({
    name: "bilit-Lv3-戻すのを断れば、他のスピリットは破壊されたまま（ビリットは場に残る）",
    start: { turn: "opp", me: { spirits: [{ card: BILIT, label: "ビリット", cores: 3 }, { card: WHITE, label: "A" }] }, opp: { spirits: [{ card: RED, label: "敵", cores: 3 }] } },
    steps(t) {
        defendWith(t, "敵", "A")
        confirm(t, "me", false)
    },
    expect: ["自分.A.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → バーサーカー・ガン", "相手.敵.疲労: false → true"],
})
// Q2814：ビリット自身と他の1体が同時に破壊されるなら、ビリットを手札に戻して他を残せる（ビリット自身の破壊時ドローは起きない）
// シャドウブレイド（紫・コスト7。紫のシンボル1つで軽減されコスト6）：疲労状態の相手のスピリットすべてを破壊（赤と紫のスピリットがいるとき）
scenario({
    name: "bilit-Lv3-自分と他の1体が同時に破壊されるなら、ビリットを戻して他を残せる",
    start: { turn: "opp", interactive: true,
        me: { spirits: [{ card: BILIT, label: "ビリット", cores: 3, rested: true }, { card: WHITE, label: "A", rested: true }] },
        opp: { hand: ["BS09-072"], spirits: [{ card: RED, label: "赤" }, { card: "BS01-031", label: "紫" }] } },
    steps(t) {
        const a = t.id("A")
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        confirm(t, "me", true)
        t.act("me", { type: "resolveChoice", instanceId: a })
    },
    expect: ["自分.ビリット.場所: フィールド → なし", "自分.手札: なし → 電精ビリット", "自分.リザーブ: 10 → 13", "相手.手札: シャドウブレイド → なし",
        "相手.トラッシュ: なし → シャドウブレイド", "相手.リザーブ: 10 → 4", "相手.トラッシュのコア: 0 → 6"],
})
scenario({
    name: "bilit-Lv3-相手のスピリットが破壊されても戻さない",
    start: { me: { spirits: [{ card: BILIT, label: "ビリット", cores: 3 }, { card: RED, label: "A", cores: 3 }] }, opp: { spirits: [{ card: WHITE, label: "B" }] } },
    steps: (t) => attackAndBlock(t, "me", "A", "B"),
    expect: ["自分.A.疲労: false → true", "相手.B.場所: フィールド → なし", "相手.リザーブ: 10 → 11", "相手.トラッシュ: なし → バーサーカー・ガン"],
})
scenario({
    name: "bilit-Lv3-自身が破壊されたときは1枚ドロー（手札に戻らない）",
    start: { turn: "opp", me: { spirits: [{ card: BILIT, label: "ビリット", cores: 3 }] }, opp: { spirits: [{ card: IBARN, label: "敵", cores: 4 }] } },
    steps: (t) => defendWith(t, "敵", "ビリット"),
    expect: ["自分.ビリット.場所: フィールド → なし", "自分.リザーブ: 10 → 13", "自分.トラッシュ: なし → 電精ビリット", "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39", "相手.敵.疲労: false → true"],
})
scenario({
    name: "bilit-Lv1-自身が破壊されたときも1枚ドロー",
    start: { turn: "opp", me: { spirits: [{ card: BILIT, label: "ビリット", cores: 1 }] }, opp: { spirits: [{ card: IBARN, label: "敵", cores: 4 }] } },
    steps: (t) => defendWith(t, "敵", "ビリット"),
    expect: ["自分.ビリット.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "自分.トラッシュ: なし → 電精ビリット", "自分.手札: なし → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39", "相手.敵.疲労: false → true"],
})
scenario({
    name: "bilit-Lv3-同時に2体破壊されても戻せるのは選んだ1体だけ",
    start: { turn: "opp", interactive: true,
        me: { spirits: [{ card: BILIT, label: "ビリット", cores: 3 }, { card: WHITE, label: "A" }, { card: RED, label: "B" }] },
        opp: { hand: [SLASH], spirits: [] } },
    steps(t) {
        const a = t.id("A") // 破壊待機に入るとラベルで引けなくなるので先に取る
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        confirm(t, "me", true)
        t.act("me", { type: "resolveChoice", instanceId: a })
    },
    expect: ["自分.ビリット.場所: フィールド → なし", "自分.手札: なし → 電精ビリット", "自分.B.場所: フィールド → なし", "自分.リザーブ: 10 → 14",
        "自分.トラッシュ: なし → ロクケラトプス", "相手.手札: フェラールスラッシュ → なし", "相手.トラッシュ: なし → フェラールスラッシュ",
        "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 4"],
})

console.log("すべてのチェックに合格しました 🎉（part975）")
