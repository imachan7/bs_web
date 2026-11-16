// smoke パート973（X13-13 ダーク・ティラノザウラー・オーバーレックス／X13-16 覇王マナカ：期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const OVER = "X13-13"
const MANAKA = "X13-16"
const VANILLA = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000）
const METAL = "BS01-008" // メタルバーン（赤・Lv1 BP3000）
const BEETLE = "BS01-050" // ビートビートル（緑・Lv1 BP1000・緑シンボル）
const BALLOON = "BS02-074" // 風船魔人バーバル（黄・Lv1 BP5000）
const LEO = "BS04-056" // ブレイブレス・レオ（黄・Lv2 2コア BP7000）
const LORD = "SD06-007" // 英雄龍ロード・ドラゴン（赤・系統「覇皇」・バースト効果を持つ・Lv1 BP4000）
const MULTI = "X008" // 神星皇ストライク・アポロドラゴン（赤白の2色）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(OVER).name === "ダーク・ティラノザウラー・オーバーレックス" && getCard(OVER).type === "spirit", "X13-13")
    assert(getCard(MANAKA).name === "覇王マナカ" && getCard(MANAKA).type === "spirit", "X13-16")
    assert(getCard(LORD).name === "英雄龍ロード・ドラゴン" && getCard(LORD).family?.includes("覇皇") === true, "SD06-007は覇皇")
    assert(getCard(LEO).name === "ブレイブレス・レオ" && getCard(LEO).levels[1]?.bp === 7000, "LEOはLv2でBP7000")
    assert(getCard(MULTI).colors.length === 2, "X008は2色")
    assert(getCard(BEETLE).colors[0] === "green" && getCard(BALLOON).colors[0] === "yellow", "脇役の色")
}

// 待ちが出ている間、答え続ける。yes＝「発動する」／カードを選ぶ、false＝見送る。prefer＝対象の選択で選ぶ個体のラベル
function settle(t: ScenarioCtx, yes = true, prefer?: string): void {
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (!yes) t.act(side, { type: "resolveChoice" })
        else if (pc.kind === "card") t.act(side, { type: "resolveChoice", cardIndex: 0 })
        else if (pc.options?.length) t.act(side, { type: "resolveChoice", option: pc.options[0] as string })
        else if (prefer) t.act(side, { type: "resolveChoice", instanceId: t.id(prefer) })
        else t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0] as string })
    }
}

console.log("=== X13-13 アタック時：相手のスピリット1体を指定してアタック（必ず） ===")
// 起きる：緑シンボルあり・疲労状態のスピリットを指定・相手のスピリットだけが破壊された → ライフのコア1個がリザーブへ
scenario({
    name: "x13-13 指定して勝つ・連鎖あり",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: OVER, label: "オーバーレックス", cores: 3 }, { card: BEETLE, label: "ビートル" }] },
        opp: { spirits: [{ card: VANILLA, label: "弱", rested: true }, { card: BALLOON, label: "控え" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("オーバーレックス"), targetSpiritInstanceId: t.id("弱") })
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.オーバーレックス.疲労: false → true",
        "相手.弱.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})
// 起きない：緑シンボルが無い → 連鎖は発揮されずライフは減らない（相手は指定した1体だけが破壊される。ライフを直接攻撃できない）
scenario({
    name: "x13-13 緑シンボルなし",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: OVER, label: "オーバーレックス", cores: 3 }] },
        opp: { spirits: [{ card: VANILLA, label: "弱", rested: true }, { card: BALLOON, label: "控え" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("オーバーレックス"), targetSpiritInstanceId: t.id("弱") })
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.オーバーレックス.疲労: false → true",
        "相手.弱.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
// 起きない：BP比較で自分も破壊された（相手のスピリットだけではない） → ライフは動かない
scenario({
    name: "x13-13 相打ち",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: OVER, label: "オーバーレックス" }, { card: BEETLE, label: "ビートル" }] },
        opp: { spirits: [{ card: LEO, label: "レオ", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("オーバーレックス"), targetSpiritInstanceId: t.id("レオ") })
        t.closeFlash()
        settle(t)
    },
    expect: [
        "自分.オーバーレックス.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・ティラノザウラー・オーバーレックス",
        "自分.リザーブ: 10 → 11",
        "相手.レオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ブレイブレス・レオ",
        "相手.リザーブ: 10 → 12",
    ],
})
// 指定できる相手のスピリットがいない → 普通のアタック（ライフを攻撃。連鎖は発揮されない＝バトルが無い）
scenario({
    name: "x13-13 相手のスピリットなし",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: OVER, label: "オーバーレックス", cores: 3 }, { card: BEETLE, label: "ビートル" }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("オーバーレックス") })
        settle(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.オーバーレックス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 「必ず」：指定できる相手のスピリットがいるのに、指定なしのアタックは拒否される
scenario({
    name: "x13-13 指定なしは拒否",
    start: {
        phase: "attack",
        me: { spirits: [{ card: OVER, label: "オーバーレックス", cores: 3 }] },
        opp: { spirits: [{ card: VANILLA, label: "弱", rested: true }] },
    },
    steps(t) {
        t.actRejected("me", { type: "attack", instanceId: t.id("オーバーレックス") })
    },
    expect: [],
})

console.log("=== X13-16 バースト：相手による自分のスピリット破壊後（自分のスピリットの色が2色以上のとき召喚） ===")
const manakaBurstStart = (mySpirits: { card: string; label: string }[], hand: string[] = []) => ({
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    me: { burst: MANAKA, hand, spirits: mySpirits },
    opp: { spirits: [{ card: METAL, label: "攻撃" }] },
})
const manakaBurstSteps = (t: ScenarioCtx) => {
    t.act("opp", { type: "attack", instanceId: t.id("攻撃") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("ブロッカー") })
    t.closeFlash()
    settle(t)
}
const manakaSummoned = [
    "自分.バースト: 覇王マナカ → なし",
    "自分.覇王マナカ.場所: なし → フィールド",
    "自分.覇王マナカ.疲労: なし → false",
    "自分.覇王マナカ.コア: なし → 1",
    "自分.覇王マナカ.Lv: なし → 1",
    "自分.覇王マナカ.BP: なし → 7000",
]
// 起きる：破壊されたスピリットを除いて赤と黄の2色
scenario({
    name: "x13-16 バースト 2色",
    start: manakaBurstStart([{ card: VANILLA, label: "赤" }, { card: BALLOON, label: "黄" }, { card: BEETLE, label: "ブロッカー" }]),
    steps: manakaBurstSteps,
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ビートビートル",
        "相手.攻撃.疲労: false → true",
        ...manakaSummoned,
    ],
})
// 起きる：多色1体で2色
scenario({
    name: "x13-16 バースト 多色1体",
    start: manakaBurstStart([{ card: MULTI, label: "多色" }, { card: BEETLE, label: "ブロッカー" }]),
    steps: manakaBurstSteps,
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ビートビートル",
        "相手.攻撃.疲労: false → true",
        ...manakaSummoned,
    ],
})
// 起きない：破壊されたスピリット（緑）を数えれば2色だが、数えないので赤の1色 → 召喚されない
scenario({
    name: "x13-16 バースト 1色",
    start: manakaBurstStart([{ card: VANILLA, label: "赤" }, { card: BEETLE, label: "ブロッカー" }]),
    steps: manakaBurstSteps,
    expect: [
        "自分.ブロッカー.場所: フィールド → なし",
        "自分.トラッシュ: なし → ビートビートル、覇王マナカ",
        "自分.バースト: 覇王マナカ → なし",
        "自分.リザーブ: 10 → 11",
        "相手.攻撃.疲労: false → true",
    ],
})

console.log("=== X13-16 アタック時：系統「覇皇」を持つ相手のスピリット1体を破壊 ===")
// 起きる
scenario({
    name: "x13-16 アタック時 覇皇を破壊",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: MANAKA, label: "マナカ" }] },
        opp: { spirits: [{ card: LORD, label: "覇皇" }, { card: VANILLA, label: "疲れ", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("マナカ") })
        settle(t, true, "覇皇")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マナカ.疲労: false → true",
        "相手.覇皇.場所: フィールド → なし",
        "相手.トラッシュ: なし → 英雄龍ロード・ドラゴン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})
// 起きない：相手に覇皇がいない（自分の覇皇は対象ではない）
scenario({
    name: "x13-16 アタック時 相手に覇皇なし",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: MANAKA, label: "マナカ" }, { card: LORD, label: "自分覇皇" }] },
        opp: { spirits: [{ card: VANILLA, label: "疲れ", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("マナカ") })
        settle(t)
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.マナカ.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== X13-16 Lv2〜4：相手がバーストをセットしている間／バースト効果を持つ相手のスピリットがいる間 BP+10000（重ねない） ===")
// 起きる：相手がバーストをセットした
scenario({
    name: "x13-16 Lv2 相手がバーストをセット",
    start: { turn: "opp", me: { spirits: [{ card: MANAKA, label: "マナカ", cores: 3 }] }, opp: { hand: [LORD] } },
    steps(t) {
        t.act("opp", { type: "setBurst", handIndex: 0 })
    },
    expect: ["自分.マナカ.BP: 10000 → 20000", "相手.バースト: なし → 英雄龍ロード・ドラゴン", "相手.手札: 英雄龍ロード・ドラゴン → なし"],
})
// 起きない：Lv1
scenario({
    name: "x13-16 Lv1 は上がらない",
    start: { turn: "opp", me: { spirits: [{ card: MANAKA, label: "マナカ", cores: 1 }] }, opp: { hand: [LORD] } },
    steps(t) {
        t.act("opp", { type: "setBurst", handIndex: 0 })
    },
    expect: ["相手.バースト: なし → 英雄龍ロード・ドラゴン", "相手.手札: 英雄龍ロード・ドラゴン → なし"],
})
// 起きる→外れる：バースト効果を持つ相手のスピリットが破壊されると+10000が消える
scenario({
    name: "x13-16 Lv2 バースト効果を持つスピリットがいなくなる",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: MANAKA, label: "マナカ", cores: 3 }] },
        opp: { spirits: [{ card: LORD, label: "覇皇" }, { card: VANILLA, label: "疲れ", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("マナカ") })
        settle(t, true, "覇皇")
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マナカ.疲労: false → true",
        "自分.マナカ.BP: 20000 → 10000",
        "相手.覇皇.場所: フィールド → なし",
        "相手.トラッシュ: なし → 英雄龍ロード・ドラゴン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})
// 両方成り立っても+10000のまま（バーストをセット＋バースト効果を持つスピリット。覇皇が破壊されてもセットは残るので BP は変わらない）
scenario({
    name: "x13-16 Lv2 両方成り立っても重ねない",
    start: {
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: MANAKA, label: "マナカ", cores: 3 }] },
        opp: { burst: LORD, spirits: [{ card: LORD, label: "覇皇" }, { card: VANILLA, label: "疲れ", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("マナカ") })
        if (t.state.pendingChoice?.kind === "target") t.act("me", { type: "resolveChoice", instanceId: t.id("覇皇") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        settle(t, false) // 相手のセット済みバーストの発動確認は見送る（バーストはセットされたまま）
    },
    expect: [
        "自分.マナカ.疲労: false → true",
        "相手.覇皇.場所: フィールド → なし",
        "相手.トラッシュ: なし → 英雄龍ロード・ドラゴン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part973）")
