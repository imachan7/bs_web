// smoke パート739（BS19-yellow：BS19-076 ジャッククリ／BS19-091 天翼の大観覧車／BS19-092 菓子の森の宴／
// BS19-093 ネコロン山／BS19-110 ディバインフィールド／BS19-111 リバーサルポイント／BS19-X05 大天使ガブリエレン。
// 効果文とカードの属性だけから書いた期待値（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23〜3.25・PROMO_PLAN §2 参照）。
// 【強化】の行は part726 担当のためここでは見ない。【連鎖】は条件あり／なしの両方を書く。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ---------- 対象 ----------
const JACK = "BS19-076" // ジャッククリ（黄・ブレイヴ・コスト4・小玩）
const FERRIS = "BS19-091" // 天翼の大観覧車（黄・ネクサス・コスト4）
const SWEETS = "BS19-092" // 菓子の森の宴（黄・ネクサス・コスト5）
const NEKO = "BS19-093" // ネコロン山（黄白・ネクサス・コスト5）
const DIVINE = "BS19-110" // ディバインフィールド（黄・マジック・コスト3）
const REVERSAL = "BS19-111" // リバーサルポイント（黄・マジック・コスト4）
const GABRIEL = "BS19-X05" // 大天使ガブリエレン（黄・スピリット・コスト5・天霊）

// ---------- 脇役（data/cards から選定。先頭で機械を確認する） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const CANDEL = "BS06-055" // コットン・キャンデル（黄・コスト4・バニラ・BP4000）
const POWER = "BS10-048" // 天使パワー（黄・コスト5・天霊・バニラ・BP3000）
const MAIDEN = "BS14-036" // アイスメイデンMk-II（白・コスト2・バニラ・BP3000）
const SIDEROPE = "BS14-058" // 闘犬獣サイドロープ（青・コスト2・バニラ・BP3000）
const CRYSTAL = "BS10-036" // 水晶魚クリスティール（白・コスト4・バニラ・BP4000）
const TONBIR = "BS06-045" // トンビュール（白・コスト4・バニラ・BP4000・白シンボル）
const CHUN = "BS02-051" // チュンポポ（黄・コスト1・バニラ）
const JAD = "BS17-026" // ジャドバルジャー（緑・コスト5・Lv3 BP12000）
const OKU = "BS13-035" // オリンピアの天使オク（黄・コスト3・コスト4未満の合体先）
const HAMMER = "BS03-144" // マジックハンマー（青・メイン：相手のデッキを上から5枚破棄）
const POTION = "BS02-102" // ホワイトポーション（白・フラッシュ：自分のスピリット1体を回復）
const BRAVEBREAK = "BS12-076" // ブレイヴブレイク（紫・フラッシュ：合体スピリット1体のブレイヴ1つを破壊）
const DIALCRAB = "BS14-070" // ダイヤドカリ（白・ブレイヴ・コスト4・合体条件コスト4以上）
const DEMOBONE = "BS19-013" // ダーク・デモボーン（紫・コスト2・【連鎖：黄】持ち・破壊時効果は場面で発動しない）
const AMATERASU = "PX18" // 時統べる幻龍神アマテラス（赤・コスト8・召喚時に相手のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    assert(c(JACK).name === "ジャッククリ" && c(JACK).type === "brave" && c(JACK).colors[0] === "yellow" && c(JACK).cost === 4, "BS19-076 はジャッククリ（黄・ブレイヴ・コスト4）")
    assert(c(FERRIS).name === "天翼の大観覧車" && c(FERRIS).type === "nexus" && c(FERRIS).colors[0] === "yellow" && c(FERRIS).cost === 4, "BS19-091 は天翼の大観覧車（黄・ネクサス・コスト4）")
    assert(c(SWEETS).name === "菓子の森の宴" && c(SWEETS).type === "nexus" && c(SWEETS).colors[0] === "yellow" && c(SWEETS).cost === 5, "BS19-092 は菓子の森の宴（黄・ネクサス・コスト5）")
    assert(c(NEKO).name === "ネコロン山" && c(NEKO).type === "nexus" && c(NEKO).colors.join("/") === "yellow/white" && c(NEKO).cost === 5, "BS19-093 はネコロン山（黄白・ネクサス・コスト5）")
    assert(c(DIVINE).name === "ディバインフィールド" && c(DIVINE).type === "magic" && c(DIVINE).colors[0] === "yellow" && c(DIVINE).cost === 3, "BS19-110 はディバインフィールド（黄・マジック・コスト3）")
    assert(c(REVERSAL).name === "リバーサルポイント" && c(REVERSAL).type === "magic" && c(REVERSAL).colors[0] === "yellow" && c(REVERSAL).cost === 4, "BS19-111 はリバーサルポイント（黄・マジック・コスト4）")
    assert(c(GABRIEL).name === "大天使ガブリエレン" && c(GABRIEL).type === "spirit" && c(GABRIEL).colors[0] === "yellow" && c(GABRIEL).cost === 5 && c(GABRIEL).family.includes("天霊"), "BS19-X05 は大天使ガブリエレン（黄・スピリット・コスト5・天霊）")

    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).type === "spirit" && c(VANILLA).colors[0] === "red" && c(VANILLA).cost === 1, "BS01-002 はロクケラトプス（赤・コスト1・バニラ）")
    assert(c(CANDEL).name === "コットン・キャンデル" && c(CANDEL).colors[0] === "yellow" && c(CANDEL).cost === 4, "BS06-055 はコットン・キャンデル（黄・コスト4）")
    assert(c(POWER).name === "天使パワー" && c(POWER).colors[0] === "yellow" && c(POWER).cost === 5 && c(POWER).family.includes("天霊"), "BS10-048 は天使パワー（黄・コスト5・天霊）")
    assert(c(MAIDEN).name === "アイスメイデンMk-II" && c(MAIDEN).colors[0] === "white" && c(MAIDEN).cost === 2, "BS14-036 はアイスメイデンMk-II（白・コスト2）")
    assert(c(SIDEROPE).name === "闘犬獣サイドロープ" && c(SIDEROPE).colors[0] === "blue" && c(SIDEROPE).cost === 2, "BS14-058 は闘犬獣サイドロープ（青・コスト2）")
    assert(c(CRYSTAL).name === "水晶魚クリスティール" && c(CRYSTAL).colors[0] === "white" && c(CRYSTAL).cost === 4, "BS10-036 は水晶魚クリスティール（白・コスト4）")
    assert(c(TONBIR).name === "トンビュール" && c(TONBIR).colors[0] === "white" && c(TONBIR).cost === 4, "BS06-045 はトンビュール（白・コスト4・白シンボル）")
    assert(c(CHUN).name === "チュンポポ" && c(CHUN).colors[0] === "yellow" && c(CHUN).cost === 1, "BS02-051 はチュンポポ（黄・コスト1）")
    assert(c(JAD).name === "ジャドバルジャー" && c(JAD).colors[0] === "green" && c(JAD).cost === 5, "BS17-026 はジャドバルジャー（緑・コスト5）")
    assert(c(OKU).name === "オリンピアの天使オク" && c(OKU).colors[0] === "yellow" && c(OKU).cost === 3, "BS13-035 はオリンピアの天使オク（黄・コスト3）")
    assert(c(HAMMER).name === "マジックハンマー" && c(HAMMER).type === "magic" && c(HAMMER).colors[0] === "blue" && c(HAMMER).cost === 4, "BS03-144 はマジックハンマー（青・マジック・コスト4）")
    assert(c(POTION).name === "ホワイトポーション" && c(POTION).type === "magic" && c(POTION).colors[0] === "white" && c(POTION).cost === 4, "BS02-102 はホワイトポーション（白・マジック・コスト4）")
    assert(c(BRAVEBREAK).name === "ブレイヴブレイク" && c(BRAVEBREAK).type === "magic" && c(BRAVEBREAK).colors[0] === "purple" && c(BRAVEBREAK).cost === 5, "BS12-076 はブレイヴブレイク（紫・マジック・コスト5）")
    assert(c(DIALCRAB).name === "ダイヤドカリ" && c(DIALCRAB).type === "brave" && c(DIALCRAB).colors[0] === "white" && c(DIALCRAB).cost === 4, "BS14-070 はダイヤドカリ（白・ブレイヴ・コスト4）")
    assert(c(DEMOBONE).name === "ダーク・デモボーン" && c(DEMOBONE).colors[0] === "purple" && c(DEMOBONE).cost === 2, "BS19-013 はダーク・デモボーン（紫・コスト2・【連鎖】持ち）")
    assert(c(AMATERASU).name === "時統べる幻龍神アマテラス" && c(AMATERASU).type === "spirit" && c(AMATERASU).colors[0] === "red" && c(AMATERASU).cost === 8, "PX18 は時統べる幻龍神アマテラス（赤・コスト8）")
}

const deck40 = (top?: string) =>
    top ? [top, ...Array.from({ length: 39 }, () => VANILLA)] : Array.from({ length: 40 }, () => VANILLA)

// =====================================================================
// BS19-076 ジャッククリ【合体時】『合体アタック時』自分がマジックカードを使用したとき、
// その効果発揮後、このターンの間、相手のスピリット1体をBP-2000する
// =====================================================================
console.log("=== BS19-076 ジャッククリ ===")

// 1. 成立：合体アタック中にマジックを使用 → 効果発揮後に相手1体へBP-2000
scenario({
    name: "jack_union_attack_magic_bpminus",
    start: {
        me: { reserve: 10, hand: [JACK, POTION], spirits: [{ card: CANDEL, label: "キャンデル" }] },
        opp: { spirits: [{ card: CRYSTAL, label: "クリスティール" }] },
    },
    steps(t) {
        // ダイレクト合体（ジャッククリのコスト4・軽減[黄黄]に対して場の黄シンボルは1つ → 3支払い）
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("キャンデル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("キャンデル") })
        // 合体アタック中にマジックを使用（フラッシュの優先権は守備側が先なので相手がパスしてから）
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キャンデル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 3", // ジャッククリ3 + ポーション4
        "自分.トラッシュのコア: 0 → 7",
        "自分.手札: ジャッククリ、ホワイトポーション → なし",
        "自分.トラッシュ: なし → ホワイトポーション",
        "自分.ジャッククリ.場所: なし → 合体",
        "自分.ジャッククリ.コア: なし → 0",
        "自分.ジャッククリ.Lv: なし → 1",
        "自分.ジャッククリ.疲労: なし → false",
        "自分.キャンデル.BP: 4000 → 6000", // 合体で+2000
        // キャンデルは攻撃で疲労したがポーションで回復したので疲労の行は無い
        "相手.クリスティール.BP: 4000 → 2000", // マジック効果発揮後のBP-2000
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 2. 不成立：合体アタックしてもマジックを使わない → BP-2000しない
scenario({
    name: "jack_union_attack_no_magic",
    start: {
        me: { reserve: 10, hand: [JACK], spirits: [{ card: CANDEL, label: "キャンデル" }] },
        opp: { spirits: [{ card: CRYSTAL, label: "クリスティール" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("キャンデル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("キャンデル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ジャッククリ → なし",
        "自分.ジャッククリ.場所: なし → 合体",
        "自分.ジャッククリ.コア: なし → 0",
        "自分.ジャッククリ.Lv: なし → 1",
        "自分.ジャッククリ.疲労: なし → false",
        "自分.キャンデル.BP: 4000 → 6000",
        "自分.キャンデル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // クリスティールのBPは変わらない
    ],
})

// 3. 合体条件：コスト4未満のスピリットへのダイレクト合体は拒否される
scenario({
    name: "jack_reject_cost3_host",
    start: {
        me: { hand: [JACK], spirits: [{ card: OKU, label: "オク" }] },
    },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("オク") })
    },
    expect: [],
})

// =====================================================================
// BS19-X05 大天使ガブリエレン
// Lv1-3『バトル時』このターンの間、相手のスピリット2体をBP-3000する
// Lv2-3 相手の効果によって破壊されたとき回復状態でフィールドに残り、1枚ドローする
// Lv3『自分のアタックステップ』天霊すべては、バトル解決時、ブロックした相手がBP3000以下のとき
//        BPを比べずブロックされなかったものとして扱う
// （Lv1節は BS19-091 Lv1 との組み合わせで2場面に共有）
// =====================================================================
console.log("=== BS19-X05 大天使ガブリエレン ===")

// 4. Lv1『バトル時』が成立し、相手2体がBP0になる → 観覧車のドローはターンで1回だけ
scenario({
    name: "gab_battle_bpminus2_bp0_draw_once",
    start: {
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 1 }], nexuses: [{ card: FERRIS }] },
        opp: { spirits: [{ card: MAIDEN, label: "アイス" }, { card: SIDEROPE, label: "サイドロープ" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガブリエレン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ガブリエレン.疲労: false → true",
        "相手.アイス.BP: 3000 → 0",
        "相手.サイドロープ.BP: 3000 → 0",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39", // BP0は2体同時でも「ターンで初めて」は1回
        "自分.手札: なし → ロクケラトプス",
    ],
})

// 5. BP-3000は効くがBP0にならない → ドローしない（091 Lv1 の否定場面）
scenario({
    name: "gab_battle_bpminus_no_bp0_no_draw",
    start: {
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 1 }], nexuses: [{ card: FERRIS }] },
        opp: { spirits: [{ card: CRYSTAL, label: "クリスティール" }, { card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガブリエレン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ガブリエレン.疲労: false → true",
        "相手.クリスティール.BP: 4000 → 1000",
        "相手.キャンデル.BP: 4000 → 1000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // BP0になっていないのでドローしない（デッキ枚数は変わらない）
    ],
})

// 6. ガブリエレン以外のバトルではBP-3000しない（Lv1節の否定）
scenario({
    name: "gab_not_battling_no_bpminus",
    start: {
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 1 }, { card: POWER, label: "天使パワー" }] },
        opp: { spirits: [{ card: CRYSTAL, label: "クリスティール" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.天使パワー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // クリスティールのBPは変わらない
    ],
})

// 7. Lv2・相手の効果による破壊 → 回復状態で残り、1枚ドロー
scenario({
    name: "gab_revive_on_opponent_effect_destroy",
    start: {
        turn: "opp",
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 2, rested: true }] },
        opp: { hand: [AMATERASU], reserve: 10 },
    },
    steps(t) {
        // アマテラスの召喚時効果で相手のスピリット1体を破壊する（コスト8・場に赤シンボル無し → 8支払い）
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.リザーブ: 10 → 1", // コスト8 + 維持コア1
        "相手.トラッシュのコア: 0 → 8",
        "相手.手札: 時統べる幻龍神アマテラス → なし",
        "相手.時統べる幻龍神アマテラス.場所: なし → フィールド",
        "相手.時統べる幻龍神アマテラス.コア: なし → 1",
        "相手.時統べる幻龍神アマテラス.Lv: なし → 1",
        "相手.時統べる幻龍神アマテラス.BP: なし → 8000",
        "相手.時統べる幻龍神アマテラス.疲労: なし → false",
        "自分.ガブリエレン.疲労: true → false", // 回復状態でフィールドに残る
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        // トラッシュへは行かない
    ],
})

// 8. Lv2でもバトルでの破壊は「相手の効果による破壊」でない → 残らずドローもしない
scenario({
    name: "gab_battle_destroyed_no_revive",
    start: {
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 2 }] },
        opp: { spirits: [{ card: JAD, label: "ジャドバルジャー", cores: 4 }, { card: MAIDEN, label: "アイス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガブリエレン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("ジャドバルジャー") })
        t.closeFlash()
    },
    expect: [
        // 『バトル時』で相手2体へBP-3000（12000→9000, 3000→0）
        "相手.ジャドバルジャー.BP: 12000 → 9000",
        "相手.ジャドバルジャー.疲労: false → true", // ブロックの宣言で疲労する
        "相手.アイス.BP: 3000 → 0",
        "自分.ガブリエレン.場所: フィールド → なし", // 7000 < 9000 で破壊
        "自分.トラッシュ: なし → 大天使ガブリエレン",
        "自分.リザーブ: 10 → 12",
        // ドローしない（デッキ枚数は変わらない）
    ],
})

// 9. Lv3：BP3000以下のブロッカーはブロックされなかったものとして扱う → ライフを減らす
scenario({
    name: "gab_lv3_unblocked_treatment",
    start: {
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 4 }, { card: POWER, label: "天使パワー" }] },
        opp: { spirits: [{ card: MAIDEN, label: "アイス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("アイス") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        "相手.アイス.疲労: false → true", // ブロックの宣言で疲労する（破壊はされない）
    ],
})

// 10. Lv3でもブロッカーがBP3000超 → 通常どおりBPを比べる
scenario({
    name: "gab_lv3_blocker_over_3000",
    start: {
        me: { spirits: [{ card: GABRIEL, label: "ガブリエレン", cores: 4 }, { card: POWER, label: "天使パワー" }] },
        opp: { spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("キャンデル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.場所: フィールド → なし", // 3000 < 4000
        "自分.トラッシュ: なし → 天使パワー",
        "自分.リザーブ: 10 → 11",
        "相手.キャンデル.疲労: false → true", // ブロックの宣言で疲労する
    ],
})

// =====================================================================
// BS19-091 天翼の大観覧車
// Lv1-2 相手のスピリットがターンで初めてBP0になったとき1枚ドロー（Lv1節は場面4・5で共有）
// Lv2『自分のアタックステップ』天霊がBPを比べ相手のスピリットだけに破壊されたとき
//        ボイドからコア1個を自分のライフに置く
// =====================================================================
console.log("=== BS19-091 天翼の大観覧車 ===")

// 11. Lv2：自分の天霊だけが破壊された → ボイドからライフへコア1個
scenario({
    name: "ferris_lv2_life_core",
    start: {
        me: { spirits: [{ card: POWER, label: "天使パワー" }], nexuses: [{ card: FERRIS, cores: 1 }] },
        opp: { spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("キャンデル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.場所: フィールド → なし", // 3000 < 4000 で自分だけ破壊
        "自分.トラッシュ: なし → 天使パワー",
        "自分.リザーブ: 10 → 11", // 破壊されたスピリットのコアはリザーブへ
        "自分.ライフ: 5 → 6", // ボイドからライフへ
        "相手.キャンデル.疲労: false → true", // ブロックの宣言で疲労する
    ],
})

// 12. Lv2の否定：相打ち（相手のスピリットだけの破壊でない）→ ライフにコアは置かない
scenario({
    name: "ferris_lv2_mutual_destroy_no_life",
    start: {
        me: { spirits: [{ card: POWER, label: "天使パワー" }], nexuses: [{ card: FERRIS, cores: 1 }] },
        opp: { spirits: [{ card: MAIDEN, label: "アイス" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("アイス") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.場所: フィールド → なし", // 3000 vs 3000 で相打ち
        "自分.トラッシュ: なし → 天使パワー",
        "自分.リザーブ: 10 → 11",
        "相手.アイス.場所: フィールド → なし",
        "相手.トラッシュ: なし → アイスメイデンMk-II",
        "相手.リザーブ: 10 → 11",
        // 自分のライフは変わらない
    ],
})

// =====================================================================
// BS19-092 菓子の森の宴
// Lv1-2 お互いのデッキは破棄されない
// Lv2『自分のコアステップ』ライフ2以下のとき、リザーブに置くかわりにライフへ置ける
// =====================================================================
console.log("=== BS19-092 菓子の森の宴 ===")

// 13. Lv1：デッキ破棄マジックが通らない
scenario({
    name: "sweets_deck_mill_negated",
    start: {
        me: { reserve: 10, hand: [HAMMER], nexuses: [{ card: SWEETS }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.リザーブ: 10 → 6", // コスト4（場に青シンボル無し）
        "自分.トラッシュのコア: 0 → 4",
        "自分.手札: マジックハンマー → なし",
        "自分.トラッシュ: なし → マジックハンマー",
        // 相手のデッキは破棄されない（デッキ枚数・トラッシュは変わらない）
    ],
})

// 14. 否定（ネクサス無し）：同じマジックで相手のデッキが破棄される
scenario({
    name: "sweets_absent_mill_baseline",
    start: {
        me: { reserve: 10, hand: [HAMMER] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.手札: マジックハンマー → なし",
        "自分.トラッシュ: なし → マジックハンマー",
        "相手.デッキ枚数: 40 → 35",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

// 15. Lv2コアステップ：ライフ2以下 → リザーブに置くかわりにライフへ
scenario({
    name: "sweets_core_step_to_life",
    start: {
        me: { life: 2, reserve: 10, nexuses: [{ card: SWEETS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "endTurn" })
    },
    expect: [
        "自分.ライフ: 2 → 3", // ボイドからライフへ
        "自分.デッキ枚数: 40 → 39", // ドローステップ
        "自分.手札: なし → ロクケラトプス",
        // 自分のリザーブは増えない（かわりに置く）
        "相手.リザーブ: 10 → 11", // 相手のコアステップ＋ドロー
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
    ],
})

// 16. Lv2の否定：ライフ3 → 通常どおりリザーブへ
scenario({
    name: "sweets_core_step_normal_life3",
    start: {
        me: { life: 3, reserve: 10, nexuses: [{ card: SWEETS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "endTurn" })
    },
    expect: [
        "自分.リザーブ: 10 → 11",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        // 自分のライフは変わらない
    ],
})

// 17. Lv2コアステップ＋ソウルコア（リザーブ）：ソウルコアはライフへ行かずリザーブに残る
scenario({
    name: "sweets_core_step_soulcore",
    start: {
        me: { life: 2, reserve: 10, soulCore: "リザーブ", nexuses: [{ card: SWEETS, cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "endTurn" })
    },
    expect: [
        "自分.ライフ: 2 → 3",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        // ソウルコアはリザーブに残る（変化なし）
    ],
})

// =====================================================================
// BS19-093 ネコロン山
// Lv1-2『自分のメインステップ』【連鎖】持ちの自分のスピリットが召喚されたとき、
//        デッキを上から1枚オープンできる（ブレイヴ/マジックは手札、他は破棄）
// Lv2 自分の合体スピリットのブレイヴだけが破壊されたとき、そのブレイヴを手札に戻せる
// =====================================================================
console.log("=== BS19-093 ネコロン山 ===")

// 18. Lv1：オープンしたカードがマジック → 手札に加える
scenario({
    name: "neko_open_magic_to_hand",
    start: {
        me: { reserve: 10, hand: [DEMOBONE], deck: deck40(POTION), nexuses: [{ card: NEKO }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 7", // コスト2（場に紫シンボル無し）＋維持コア1
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ダーク・デモボーン → ホワイトポーション",
        "自分.デッキ枚数: 40 → 39",
        "自分.ダーク・デモボーン.場所: なし → フィールド",
        "自分.ダーク・デモボーン.コア: なし → 1",
        "自分.ダーク・デモボーン.Lv: なし → 1",
        "自分.ダーク・デモボーン.BP: なし → 1000",
        "自分.ダーク・デモボーン.疲労: なし → false",
    ],
})

// 19. Lv1：オープンしたカードがスピリット → 破棄する
scenario({
    name: "neko_open_spirit_to_trash",
    start: {
        me: { reserve: 10, hand: [DEMOBONE], deck: deck40(VANILLA), nexuses: [{ card: NEKO }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ダーク・デモボーン → なし",
        "自分.デッキ枚数: 40 → 39",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.ダーク・デモボーン.場所: なし → フィールド",
        "自分.ダーク・デモボーン.コア: なし → 1",
        "自分.ダーク・デモボーン.Lv: なし → 1",
        "自分.ダーク・デモボーン.BP: なし → 1000",
        "自分.ダーク・デモボーン.疲労: なし → false",
    ],
})

// 20. Lv1の否定：【連鎖】を持たないスピリットの召喚ではオープンしない
scenario({
    name: "neko_nonrensa_no_open",
    start: {
        me: { reserve: 10, hand: [VANILLA], deck: deck40(POTION), nexuses: [{ card: NEKO }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 8", // コスト1＋維持コア1
        "自分.トラッシュのコア: 0 → 1",
        "自分.手札: ロクケラトプス → なし",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
        "自分.ロクケラトプス.疲労: なし → false",
        // デッキ枚数・トラッシュは変わらない
    ],
})

// 21. Lv2：合体スピリットのブレイヴだけが破壊された → そのブレイヴを手札に戻す
scenario({
    name: "neko_brave_to_hand",
    start: {
        me: {
            reserve: 10,
            spirits: [
                { card: CANDEL, label: "キャンデル" },
                { card: DIALCRAB, label: "ダイヤドカリ" },
            ],
            nexuses: [{ card: NEKO, cores: 1 }],
        },
        opp: { reserve: 10, hand: [BRAVEBREAK] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ダイヤドカリ"), hostInstanceId: t.id("キャンデル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("キャンデル") })
        // フラッシュの優先権は守備側が先なので、相手はそのままブレイヴブレイクを使用できる
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" }) // ブレイヴブレイク（コスト5）
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ダイヤドカリ.場所: フィールド → なし",
        "自分.手札: なし → ダイヤドカリ", // 破壊されたブレイヴを手札に戻す
        "自分.キャンデル.コア: 1 → 2", // 合体でブレイヴの維持コアがホストに載る
        "自分.キャンデル.Lv: 1 → 2",
        "自分.キャンデル.BP: 4000 → 5000", // ブレイヴが離れたあとはホスト単体のLv2
        "自分.キャンデル.疲労: false → true",
        "相手.リザーブ: 10 → 6", // 5支払い＋ライフ減少で+1
        "相手.トラッシュのコア: 0 → 5",
        "相手.手札: ブレイヴブレイク → なし",
        "相手.トラッシュ: なし → ブレイヴブレイク",
        "相手.ライフ: 5 → 4",
    ],
})

// 22. Lv2の否定：Lv1ではブレイヴはトラッシュへ行く
scenario({
    name: "neko_brave_to_trash_lv1",
    start: {
        me: {
            reserve: 10,
            spirits: [
                { card: CANDEL, label: "キャンデル" },
                { card: DIALCRAB, label: "ダイヤドカリ" },
            ],
            nexuses: [{ card: NEKO }],
        },
        opp: { reserve: 10, hand: [BRAVEBREAK] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ダイヤドカリ"), hostInstanceId: t.id("キャンデル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("キャンデル") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ダイヤドカリ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダイヤドカリ",
        "自分.キャンデル.コア: 1 → 2",
        "自分.キャンデル.Lv: 1 → 2",
        "自分.キャンデル.BP: 4000 → 5000",
        "自分.キャンデル.疲労: false → true",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 5",
        "相手.手札: ブレイヴブレイク → なし",
        "相手.トラッシュ: なし → ブレイヴブレイク",
        "相手.ライフ: 5 → 4",
    ],
})

// =====================================================================
// BS19-110 ディバインフィールド（場に残るマジック）
// メイン：お互い、デッキを破棄できず、効果でスピリットを回復できない。
//        相手のスピリットのアタックでライフが減るまで自分のフィールドに置き、効果を発揮し続ける
// フラッシュ：このターンの間、スピリット1体をBP+2000する
// =====================================================================
console.log("=== BS19-110 ディバインフィールド ===")

// 23. メインで使用 → フィールドに置いたまま、デッキ破棄も効果回復も通らない
scenario({
    name: "divine_stays_blocks_mill_and_refresh",
    start: {
        me: { reserve: 20, hand: [DIVINE, HAMMER, POTION], spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }) // ディバインフィールド（コスト3・黄軽減1 → 2支払い）
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" }) // マジックハンマー（コスト4）
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("キャンデル") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キャンデル") }) // 回復は通らない
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 20 → 10", // 2 + 4 + 4
        "自分.トラッシュのコア: 0 → 10",
        "自分.手札: ディバインフィールド、ホワイトポーション、マジックハンマー → なし",
        "自分.トラッシュ: なし → ホワイトポーション、マジックハンマー", // ディバインフィールドは場に残りトラッシュへ行かない
        "自分.キャンデル.疲労: false → true", // 効果での回復はできない
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
        // 相手のデッキは破棄されない
    ],
})

// 24. 相手のアタックでライフが減る → 破棄されてトラッシュへ、以降は回復が通る
scenario({
    name: "divine_destroyed_then_refresh_works",
    start: {
        me: { reserve: 20, hand: [DIVINE, POTION], spirits: [{ card: CANDEL, label: "キャンデル", rested: true }] },
        opp: { reserve: 10, spirits: [{ card: VANILLA, label: "ロク" }, { card: CHUN, label: "チュンポポ" }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        // 相手のアタック1（疲労したキャンデルはブロックできない）→ ライフが減りディバインフィールドは破棄
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        // 相手のアタック2のフラッシュ（守備側が先）で回復マジックが通るようになっている
        t.act("opp", { type: "attack", instanceId: t.id("チュンポポ") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キャンデル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 20 → 16", // 2支払い＋4支払い＋ライフ減少で+1×2
        "自分.トラッシュのコア: 0 → 6",
        "自分.ライフ: 5 → 3",
        "自分.手札: ディバインフィールド、ホワイトポーション → なし",
        "自分.トラッシュ: なし → ディバインフィールド、ホワイトポーション",
        "自分.キャンデル.疲労: true → false", // 破棄された後は効果での回復が通る
        "相手.ロク.疲労: false → true",
        "相手.チュンポポ.疲労: false → true",
        "相手.リザーブ: 10 → 11", // 相手のコアステップ＋ドロー
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
    ],
})

// 25. フラッシュ：使用したバトルのターンの間、スピリット1体をBP+2000（フラッシュ使用は通常どおりトラッシュへ）
scenario({
    name: "divine_flash_bp2000",
    start: {
        me: { reserve: 20, hand: [DIVINE], spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("キャンデル") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("キャンデル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 20 → 18", // コスト3・黄軽減1 → 2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ディバインフィールド → なし",
        "自分.トラッシュ: なし → ディバインフィールド",
        "自分.キャンデル.BP: 4000 → 6000",
        "自分.キャンデル.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// =====================================================================
// BS19-111 リバーサルポイント
// フラッシュ：バトル解決時、BPを比べずにバトルを終了させる
// 【連鎖：条件《白シンボル》】[白]：相手のスピリット1体を手札に戻す
// =====================================================================
console.log("=== BS19-111 リバーサルポイント ===")

// 26. フラッシュ効果が成立（白シンボルが無いので連鎖は発揮しない）
scenario({
    name: "reversal_end_battle_no_white",
    start: {
        me: { reserve: 10, hand: [REVERSAL], spirits: [{ card: POWER, label: "天使パワー" }] },
        opp: { spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("キャンデル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.疲労: false → true",
        "自分.リザーブ: 10 → 7", // コスト4・黄軽減1 → 3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: リバーサルポイント → なし",
        "自分.トラッシュ: なし → リバーサルポイント",
        // BPを比べないので天使パワーは破壊されない。キャンデルは破壊されないがブロックの宣言で疲労する
        "相手.キャンデル.疲労: false → true",
    ],
})

// 27. 【連鎖】白シンボルがあるとき → 相手のスピリット1体を手札に戻す
scenario({
    name: "reversal_chain_white_bounce",
    start: {
        me: {
            reserve: 10,
            hand: [REVERSAL],
            spirits: [{ card: POWER, label: "天使パワー" }, { card: TONBIR, label: "トンビュール" }],
        },
        opp: { spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("キャンデル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.疲労: false → true",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: リバーサルポイント → なし",
        "自分.トラッシュ: なし → リバーサルポイント",
        "相手.キャンデル.場所: フィールド → なし", // 手札に戻る
        "相手.手札: なし → コットン・キャンデル",
        "相手.リザーブ: 10 → 11", // 戻したスピリットのコアはリザーブへ
    ],
})

// 28. 使わない場合（基線）：BPを比べて天使パワーが破壊される
scenario({
    name: "reversal_baseline_compare_destroy",
    start: {
        me: { spirits: [{ card: POWER, label: "天使パワー" }] },
        opp: { spirits: [{ card: CANDEL, label: "キャンデル" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パワー") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("キャンデル") })
        t.closeFlash()
    },
    expect: [
        "自分.天使パワー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 天使パワー",
        "自分.リザーブ: 10 → 11",
        "相手.キャンデル.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part739）")
