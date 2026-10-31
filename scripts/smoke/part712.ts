// smoke パート712（プロモ A1：P049 バーサーカー・ドラゴン／P052 アイアン・ラックル／P033 ステイショナー／P076 トリン。期待値役が効果文だけから書いた場面テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, string][] = [
        ["P049", "バーサーカー・ドラゴン", "spirit"],
        ["P052", "白炎の闘機アイアン・ラックル", "spirit"],
        ["P033", "文具ロボ ステイショナー", "brave"],
        ["P076", "発明魔女トリン", "spirit"],
        ["BS01-002", "ロクケラトプス", "spirit"], // 赤・コスト1・BP1000
        ["BS01-005", "アイバーン", "spirit"], // 赤・コスト2・Lv2(コア4)でBP6000
        ["BS01-031", "デス・ハーデス", "spirit"], // 紫・コスト3・Lv1でBP4000
        ["BS02-046", "ウィンガル", "spirit"], // 白・コスト6・Lv1でBP5000／Lv2(コア2)でBP6000
        ["BS10-039", "ビアンコ・ティーガー", "spirit"], // 白・コスト6・Lv2(コア2)でBP9000
        ["BS05-006", "城塞龍メガロン", "spirit"], // 赤・コスト5
        ["BS10-009", "トルネードラ", "spirit"], // 赤・コスト6
        ["BS15-076", "妖華吸血爪", "magic"], // 紫・コスト5。バースト【自分のライフ減少後】で2枚ドロー
        ["BS14-090", "勇壮なる船上都市", "nexus"], // 青・効果は合体スピリットの合体時BPだけ（場にあるだけ）
        ["BS03-060", "ランプキン", "spirit"], // 黄・コスト4・バニラ（P033の合体先）
        ["BS03-042", "海獣ジューゴン", "spirit"], // 白・コスト4・バニラ
        ["BS01-058", "ヘラクレス・ジオ", "spirit"], // 緑・コスト3・バニラ
        ["BS03-063", "ポニサス", "spirit"], // 黄・コスト5・バニラ
        ["BS11-081", "ライトニングデリバリー", "magic"], // 黄・コスト3・フラッシュで1枚ドロー
        ["BS02-106", "ローヤルポーション", "magic"], // 黄・コスト4・フラッシュ「コスト2のスピリットすべてを回復」（コスト2がいなければ何も起きない）
        ["BS02-110", "ヘビィゲート", "magic"], // 黄・コスト5・フラッシュ「コスト1以下のスピリットすべてはアタック/ブロック不可」
    ]
    for (const [id, name, type] of expect) assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}(${type})`)
    const c = (id: string) => getCard(id)
    assert(c("P049").cost === 6 && c("P049").family.includes("戦竜"), "P049 はコスト6・戦竜")
    assert(c("P052").cost === 5 && c("P052").family.includes("武装"), "P052 はコスト5・武装")
    assert(c("BS01-002").levels[0]?.bp === 1000 && c("BS01-031").levels[0]?.bp === 4000 && c("BS02-046").levels[0]?.bp === 5000, "脇役のBP")
    assert(c("BS10-039").levels[1]?.bp === 9000 && c("BS01-005").levels[1]?.bp === 6000 && c("BS02-046").levels[1]?.bp === 6000, "脇役のLv2のBP")
    assert(c("BS05-006").cost === 5 && c("BS10-009").cost === 6, "メガロンはコスト5・トルネードラはコスト6")
}

// 相手が攻撃した（または自分が攻撃した）あとの、フラッシュを両者パスで閉じるところまで。防御側が先に優先権を持つ
function settle(t: ScenarioCtx, attacker: Side): void {
    const defender: Side = attacker === "me" ? "opp" : "me"
    t.act(defender, { type: "pass" })
    t.act(attacker, { type: "pass" })
}

// 妖華吸血爪（バースト【自分のライフ減少後】で2枚ドロー。追撃のフラッシュはコスト不足で払えない）が1回発動した差分
const MY_LIFE_BURST = [
    "自分.ライフ: 5 → 4",
    "自分.リザーブ: 0 → 1",
    "自分.手札: なし → ロクケラトプス、ロクケラトプス",
    "自分.デッキ枚数: 40 → 38",
    "自分.トラッシュ: なし → 妖華吸血爪",
    "自分.バースト: 妖華吸血爪 → なし",
]
const OPP_LIFE_BURST = [
    "相手.ライフ: 5 → 4",
    "相手.リザーブ: 0 → 1",
    "相手.手札: なし → ロクケラトプス、ロクケラトプス",
    "相手.デッキ枚数: 40 → 38",
    "相手.トラッシュ: なし → 妖華吸血爪",
    "相手.バースト: 妖華吸血爪 → なし",
]

console.log("=== P049 / 自分のバースト発動後：BP4000以下の相手スピリット1体を破壊（境界ちょうど4000） ===")
scenario({
    name: "P049-バースト後に破壊",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS15-076", spirits: [{ card: "P049", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }, { card: "BS01-031", cores: 1 }, { card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    // BP4000のデス・ハーデスだけが対象（アタッカー6000・ウィンガル5000は対象外）
    expect: [
        ...MY_LIFE_BURST,
        "相手.アタッカー.疲労: false → true",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P049 / BP4000以下のスピリットがいなければ、ネクサスを破壊する（『または』の2択のうち成立する側） ===")
scenario({
    name: "P049-ネクサス破壊",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS15-076", spirits: [{ card: "P049", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }, { card: "BS02-046", cores: 1 }], nexuses: [{ card: "BS14-090", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [
        ...MY_LIFE_BURST,
        "相手.アタッカー.疲労: false → true",
        "相手.勇壮なる船上都市.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 勇壮なる船上都市",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P049 / どちらの対象もなければ何も壊れない（BP5000・6000のみ、ネクサスなし） ===")
scenario({
    name: "P049-対象なし",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS15-076", spirits: [{ card: "P049", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-005", label: "アタッカー", cores: 4 }, { card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: [...MY_LIFE_BURST, "相手.アタッカー.疲労: false → true"],
})

console.log("=== P049 / 相手のバースト発動では働かない（BP1000の相手スピリットがいても壊れない） ===")
scenario({
    name: "P049-相手のバースト",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P049", cores: 1 }, { card: "BS01-002", label: "アタッカー", cores: 1 }] },
        opp: { reserve: 0, burst: "BS15-076", spirits: [{ card: "BS01-002", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: [...OPP_LIFE_BURST, "自分.アタッカー.疲労: false → true"],
})

console.log("=== P049 / 激突：アタック時、相手は可能ならば必ずブロックする ===")
scenario({
    name: "P049-激突で強制ブロック",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P049", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("バーサーカー・ドラゴン") })
        settle(t, "me")
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
    },
    // P049(BP4000)がロクケラトプス(1000)を倒す
    expect: ["自分.バーサーカー・ドラゴン.疲労: false → true", "相手.ロクケラトプス.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
})

console.log("=== P049 / 激突：ブロックできるスピリットがいなければ（疲労のみ）ライフで受けられる ===")
scenario({
    name: "P049-激突でもブロック不能ならライフ",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P049", cores: 1 }] },
        opp: { spirits: [{ card: "BS01-002", cores: 1, rested: true }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("バーサーカー・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.バーサーカー・ドラゴン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== P049 / Lv2・バーストセット中：アタック時BP+4000（6000+4000=10000 が 9000 に勝つ） ===")
scenario({
    name: "P049-Lv2でBP+4000",
    start: {
        turn: "me",
        phase: "attack",
        me: { burst: "BS15-076", spirits: [{ card: "P049", cores: 3 }] },
        opp: { spirits: [{ card: "BS10-039", cores: 2 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("バーサーカー・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ビアンコ・ティーガー") })
        t.closeFlash()
    },
    // BP+4000はバトルの間だけ（アタック時・ブロック時の効果は、期間が書かれていなくてもバトル解決後に戻る）。終了後のBPは元の6000
    expect: [
        "自分.バーサーカー・ドラゴン.疲労: false → true",
        "相手.ビアンコ・ティーガー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ビアンコ・ティーガー",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== P049 / Lv2でもバーストをセットしていなければBP+4000されない（6000 は 9000 に負ける） ===")
scenario({
    name: "P049-バーストなしならBP上がらない",
    start: {
        turn: "me",
        phase: "attack",
        me: { spirits: [{ card: "P049", cores: 3 }] },
        opp: { spirits: [{ card: "BS10-039", cores: 2 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("バーサーカー・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ビアンコ・ティーガー") })
        t.closeFlash()
    },
    expect: [
        "自分.バーサーカー・ドラゴン.場所: フィールド → なし",
        "自分.トラッシュ: なし → バーサーカー・ドラゴン",
        "自分.リザーブ: 10 → 13",
        "相手.ビアンコ・ティーガー.疲労: false → true",
    ],
})

console.log("=== P049 / Lv1ではバーストセット中でもBP+4000されない（4000+4000=8000 が出れば 5000 に勝ってしまう） ===")
scenario({
    name: "P049-Lv1はBP上がらない",
    start: {
        turn: "me",
        phase: "attack",
        me: { burst: "BS15-076", spirits: [{ card: "P049", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("バーサーカー・ドラゴン") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    expect: [
        "自分.バーサーカー・ドラゴン.場所: フィールド → なし",
        "自分.トラッシュ: なし → バーサーカー・ドラゴン",
        "自分.リザーブ: 10 → 11",
        "相手.ウィンガル.疲労: false → true",
    ],
})

console.log("=== P052 / ブロック時：バーストセット中は合体していない自身をBP+4000（4000→8000 が 6000 に勝つ） ===")
scenario({
    name: "P052-ブロック時BP+4000",
    start: {
        turn: "opp",
        phase: "attack",
        me: { burst: "BS15-076", spirits: [{ card: "P052", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", label: "アタッカー", cores: 2 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("白炎の闘機アイアン・ラックル") })
        t.closeFlash()
    },
    expect: [
        "自分.白炎の闘機アイアン・ラックル.疲労: false → true",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== P052 / 「バーストをセットしている間」なので、バトル中にバーストが無くなったらその場でBPが下がる（8000→4000 になり 6000 に負ける） ===")
scenario({
    name: "P052-バトル中にバーストが無くなればBPが下がる",
    start: {
        turn: "opp",
        phase: "attack",
        me: { reserve: 0, burst: "BS14-101", spirits: [{ card: "BS01-002", cores: 1 }, { card: "P052", cores: 1 }] },
        opp: { hand: ["BS01-121"], spirits: [{ card: "BS02-046", label: "アタッカー", cores: 2 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("白炎の闘機アイアン・ラックル") })
        // 相手がフレイムダンス(BP4000以下を破壊)で自分のロクケラトプスだけを破壊する。→ 仁王壁のバースト(相手による自分のスピリット破壊後)が発動して、バーストが無くなる
        t.act("me", { type: "pass" })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
    },
    // 仁王壁の発動後にバーストが無くなるので、P052 は 4000 に戻り、アタッカー(6000)に負ける。ロクケラトプスが先に破壊されるのは、P052 が 8000 で破壊の対象(BP4000以下)から外れているから
    expect: [
        "相手.アタッカー.疲労: false → true",
        "相手.トラッシュ: なし → フレイムダンス",
        "相手.トラッシュのコア: 0 → 5",
        "相手.リザーブ: 10 → 5",
        "相手.手札: フレイムダンス → なし",
        "自分.ロクケラトプス.場所: フィールド → なし",
        "自分.白炎の闘機アイアン・ラックル.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス、仁王壁、白炎の闘機アイアン・ラックル",
        "自分.バースト: 仁王壁 → なし",
        "自分.リザーブ: 0 → 3",
    ],
})

console.log("=== P052 / バーストをセットしていなければブロック時もBP+されない（4000 は 6000 に負ける） ===")
scenario({
    name: "P052-バーストなしなら上がらない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "P052", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", label: "アタッカー", cores: 2 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("白炎の闘機アイアン・ラックル") })
        t.closeFlash()
    },
    expect: [
        "自分.白炎の闘機アイアン・ラックル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 白炎の闘機アイアン・ラックル",
        "自分.リザーブ: 10 → 11",
        "相手.アタッカー.疲労: false → true",
    ],
})

console.log("=== P052 / アタック時にはBP+されない（ブロック時の効果。4000 は 5000 に負ける） ===")
scenario({
    name: "P052-アタック時は上がらない",
    start: {
        turn: "me",
        phase: "attack",
        me: { burst: "BS15-076", spirits: [{ card: "P052", cores: 1 }] },
        opp: { spirits: [{ card: "BS02-046", cores: 1 }] },
    },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("白炎の闘機アイアン・ラックル") })
        settle(t, "me")
        t.act("opp", { type: "block", instanceId: t.id("ウィンガル") })
        t.closeFlash()
    },
    expect: [
        "自分.白炎の闘機アイアン・ラックル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 白炎の闘機アイアン・ラックル",
        "自分.リザーブ: 10 → 11",
        "相手.ウィンガル.疲労: false → true",
    ],
})

console.log("=== P052 / Lv2・相手のアタックステップ：コスト5以下の相手スピリットがアタックしたとき回復する（境界ちょうど5） ===")
scenario({
    name: "P052-Lv2で回復",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "P052", cores: 3, rested: true }] },
        opp: { spirits: [{ card: "BS05-006", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("城塞龍メガロン") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: ["自分.白炎の闘機アイアン・ラックル.疲労: true → false", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.城塞龍メガロン.疲労: false → true"],
})

console.log("=== P052 / コスト6の相手スピリットのアタックでは回復しない ===")
scenario({
    name: "P052-コスト6では回復しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "P052", cores: 3, rested: true }] },
        opp: { spirits: [{ card: "BS10-009", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("トルネードラ") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.トルネードラ.疲労: false → true"],
})

console.log("=== P052 / Lv1では回復しない（この節はLv2限定） ===")
scenario({
    name: "P052-Lv1では回復しない",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: "P052", cores: 1, rested: true }] },
        opp: { spirits: [{ card: "BS05-006", cores: 1 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("城塞龍メガロン") })
        settle(t, "opp")
        t.act("me", { type: "takeLife" })
    },
    expect: ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.城塞龍メガロン.疲労: false → true"],
})


// ── P033 文具ロボ ステイショナー（合体条件：コスト4以上。ランプキン=黄・コスト4・バニラに合体させる） ──
// 合体時の差分（合体するとブレイヴのコア1個はホストへ載り、ホストのBPにブレイヴのBP3000が乗る。黄のシンボルが2つになるのでマジックのコストは2軽減される）
const COMBINE = [
    "自分.文具ロボ ステイショナー.場所: フィールド → 合体",
    "自分.文具ロボ ステイショナー.コア: 1 → 0",
    "自分.文具ロボ ステイショナー.BP: 3000 → なし",
    "自分.ランプキン.BP: 3000 → 6000",
    "自分.ランプキン.コア: 1 → 2",
]
const combine = (t: ScenarioCtx): void =>
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("文具ロボ ステイショナー"), hostInstanceId: t.id("ランプキン") })
const P033_MINE = [{ card: "BS03-060", cores: 1 }, { card: "P033", cores: 1 }]

console.log("=== P033 / 合体したスピリットのアタック時：マジックを使用したあと、そのコスト(3)以下の相手スピリット1体を破壊 ===")
scenario({
    name: "P033-アタック時にマジック",
    start: { turn: "me", phase: "main", me: { hand: ["BS11-081"], spirits: P033_MINE }, opp: { spirits: [{ card: "BS01-058", cores: 1 }, { card: "BS03-042", cores: 1 }, { card: "BS03-063", cores: 1 }] } },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // コスト3のヘラクレス・ジオだけが対象（ジューゴン4・ポニサス5は対象外）。マジックは黄シンボル2つで軽減され1コア払い
    expect: [
        ...COMBINE,
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
        "相手.ヘラクレス・ジオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
    ],
})

console.log("=== P033 / 使用したマジックの印刷コスト(4)で判定する（軽減で2コア払いでも、コスト4のジューゴンが対象） ===")
scenario({
    name: "P033-軽減前のコストで判定",
    start: { turn: "me", phase: "main", me: { hand: ["BS02-106"], spirits: P033_MINE }, opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS03-063", cores: 1 }] } },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        ...COMBINE,
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ローヤルポーション → なし",
        "自分.トラッシュ: なし → ローヤルポーション",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
        "相手.海獣ジューゴン.場所: フィールド → なし",
        "相手.トラッシュ: なし → 海獣ジューゴン",
    ],
})

console.log("=== P033 / 対象になるコストの相手スピリットがいなければ何も壊れない（コスト3のマジック、相手はコスト4・5のみ） ===")
scenario({
    name: "P033-対象なし",
    start: { turn: "me", phase: "main", me: { hand: ["BS11-081"], spirits: P033_MINE }, opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS03-063", cores: 1 }] } },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        ...COMBINE,
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P033 / 相手がマジックを使用しても働かない（自分がマジックの効果を使用したときだけ） ===")
scenario({
    name: "P033-相手のマジックでは壊さない",
    start: { turn: "me", phase: "main", me: { spirits: P033_MINE }, opp: { hand: ["BS11-081"], spirits: [{ card: "BS01-058", cores: 1 }] } },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        ...COMBINE,
        "自分.ランプキン.疲労: false → true",
        "相手.手札: ライトニングデリバリー → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → ライトニングデリバリー",
        "相手.トラッシュのコア: 0 → 3",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 8",
    ],
})

console.log("=== P033 / バトルの外（メインステップ）でのマジック使用では働かない ===")
scenario({
    name: "P033-バトル外では壊さない",
    start: { turn: "me", phase: "main", me: { hand: ["BS11-081"], spirits: P033_MINE }, opp: { spirits: [{ card: "BS01-058", cores: 1 }] } },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        ...COMBINE,
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
    ],
})

console.log("=== P033 / 合体していなければ（スピリット状態のまま）働かない ===")
scenario({
    name: "P033-合体していない",
    start: { turn: "me", phase: "attack", me: { hand: ["BS11-081"], spirits: P033_MINE }, opp: { spirits: [{ card: "BS01-058", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P033 / 合体したスピリットのブロック時にも働く（相手のターンに自分がブロックし、フラッシュでマジックを使用） ===")
scenario({
    name: "P033-ブロック時にマジック",
    start: { turn: "me", phase: "main", me: { hand: ["BS11-081"], spirits: P033_MINE }, opp: { spirits: [{ card: "BS03-063", label: "アタッカー", cores: 1 }, { card: "BS01-058", cores: 1 }, { card: "BS03-042", cores: 1 }] } },
    steps: (t) => {
        combine(t)
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        settle(t, "opp")
        t.act("me", { type: "block", instanceId: t.id("ランプキン") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
    },
    // ホスト(BP6000)がアタッカー(ポニサスLv1=4000)に勝って破壊し、さらにマジック(コスト3)後にコスト3のヘラクレス・ジオが破壊される。ジューゴン(4)は残る。
    // 相手のターン開始でドロー1・コア+1が入る
    expect: [
        ...COMBINE,
        "自分.ランプキン.疲労: false → true",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.トラッシュのコア: 0 → 1",
        "自分.リザーブ: 10 → 9",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "相手.アタッカー.場所: フィールド → なし",
        "相手.ヘラクレス・ジオ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ、ポニサス",
    ],
})

// ── P076 発明魔女トリン ──
console.log("=== P076 / 自分のアタックステップ：マジック使用後、そのコスト以下の相手スピリット1体を手札に戻す（コスト3） ===")
scenario({
    name: "P076-アタックステップにマジック",
    start: { turn: "me", phase: "attack", me: { hand: ["BS11-081"], spirits: [{ card: "BS03-060", cores: 1 }, { card: "P076", cores: 1 }] }, opp: { spirits: [{ card: "BS01-058", cores: 1 }, { card: "BS03-042", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // 黄シンボル2つでコスト3→1コア払い。コスト3のヘラクレス・ジオだけが対象（ジューゴンは4）
    expect: [
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.ヘラクレス・ジオ.場所: フィールド → なし",
        "相手.手札: なし → ヘラクレス・ジオ",
    ],
})

console.log("=== P076 / 軽減前のコスト(4)で判定する（2コア払いでも、コスト4のジューゴンが戻る） ===")
scenario({
    name: "P076-軽減前のコストで判定",
    start: { turn: "me", phase: "attack", me: { hand: ["BS02-106"], spirits: [{ card: "BS03-060", cores: 1 }, { card: "P076", cores: 1 }] }, opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS03-063", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ローヤルポーション → なし",
        "自分.トラッシュ: なし → ローヤルポーション",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.海獣ジューゴン.場所: フィールド → なし",
        "相手.手札: なし → 海獣ジューゴン",
    ],
})

console.log("=== P076 / コストが足りない相手スピリットしかいなければ何も戻らない ===")
scenario({
    name: "P076-対象なし",
    start: { turn: "me", phase: "attack", me: { hand: ["BS11-081"], spirits: [{ card: "BS03-060", cores: 1 }, { card: "P076", cores: 1 }] }, opp: { spirits: [{ card: "BS03-042", cores: 1 }, { card: "BS03-063", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ランプキン.疲労: false → true",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== P076 / 相手のアタックステップでは働かない（自分のアタックステップ限定） ===")
scenario({
    name: "P076-相手のアタックステップでは戻さない",
    start: { turn: "opp", phase: "attack", me: { hand: ["BS11-081"], spirits: [{ card: "BS03-060", cores: 1 }, { card: "P076", cores: 1 }] }, opp: { spirits: [{ card: "BS03-063", label: "アタッカー", cores: 1 }, { card: "BS01-058", cores: 1 }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.アタッカー.疲労: false → true",
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.トラッシュのコア: 0 → 1",
        "自分.ライフ: 5 → 4",
    ],
})

console.log("=== P076 / 相手がマジックを使用しても働かない ===")
scenario({
    name: "P076-相手のマジックでは戻さない",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: "BS03-060", cores: 1 }, { card: "P076", cores: 1 }] }, opp: { hand: ["BS11-081"], spirits: [{ card: "BS01-058", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "attack", instanceId: t.id("ランプキン") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ランプキン.疲労: false → true",
        "相手.手札: ライトニングデリバリー → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → ライトニングデリバリー",
        "相手.トラッシュのコア: 0 → 3",
        "相手.リザーブ: 10 → 8",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("=== P076 / メインステップでのマジック使用では働かない（アタックステップ限定） ===")
scenario({
    name: "P076-メインステップでは戻さない",
    start: { turn: "me", phase: "main", me: { hand: ["BS11-081"], spirits: [{ card: "BS03-060", cores: 1 }, { card: "P076", cores: 1 }] }, opp: { spirits: [{ card: "BS01-058", cores: 1 }] } },
    steps: (t) => {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "自分.手札: ライトニングデリバリー → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ライトニングデリバリー",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 1",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part712）")
