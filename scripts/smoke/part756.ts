// smoke パート756（STARTER blue 9枚：EX006／EX023／SD03-007／SD03-008／SD03-009／SD03-012／SD03-014／SD03-017／SD16-001）
// 期待値役が効果文と属性だけから書いた実装前テスト（docs/design/STARTER_PLAN.md §2・SEMANTICS_AUDIT §3.9/3.11・CONJUNCTION.md）。
// effects はまだ空なので落ちてよい。例外で止まらず最後まで走ることだけを確認する。
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

// ---------- 対象9枚 ----------
const SIEG = "EX006" // 輝星龍ジークヴルム・デネブ（青スピリット・星竜/異合・コスト6）
const ALEX = "EX023" // 巨人皇子アレクサンダー4世（青スピリット・闘神/勇傑・コスト5）
const ELGINIAS = "SD03-007" // 戦竜エルギニアス（青スピリット・戦獣・コスト1）
const MACKOI = "SD03-008" // 棟梁マッコイ（青スピリット・創手・コスト4）
const SERPENT = "SD03-009" // 星海獣シー・サーペンダー（青スピリット・異合/星魂・コスト5）
const CERBERUS = "SD03-012" // 牙皇ケルベロード（青ブレイヴ・異合/皇獣・コスト5・合体条件コスト5以上）
const ARENA = "SD03-014" // オリンスピア競技場（青ネクサス・コスト3）
const SPLASH = "SD03-017" // ブルースプラッシュ（青マジック・コスト4）
const SQUAD = "SD16-001" // 巨人小隊（青スピリット・闘神・コスト1）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const JEFFREY = "BS03-072" // 槍兵のジェフリー（青・闘神・コスト1・BP2000・バニラ）
const METABURN = "BS01-008" // メタルバーン（赤・機竜・コスト3・BP3000・バニラ）
const GOLEM = "BS11-044" // シェル・ゴレム（青・造兵・コスト4・BP4000・バニラ）
const LANCE = "SD17-010" // ランスモザウルス（赤・地竜・コスト5・BP5000・バニラ）
const RECLAMATION = "BS06-111" // リクラメーション（青マジック・コスト3・メイン：ネクサス破壊でコスト4以下の青スピリットを召喚）
const GYOKURUNE = "BS10-077" // ギョクリューン（青ブレイヴ・戦獣・コスト4・合体条件コスト4以上・合体時BP+3000）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(SIEG).name === "輝星龍ジークヴルム・デネブ" && c(SIEG).type === "spirit" && c(SIEG).colors.join() === "blue" && c(SIEG).family.join() === "星竜,異合" && c(SIEG).cost === 6 && c(SIEG).effect.includes("コスト4以下の相手のスピリット1体を指定し") && c(SIEG).effect.includes("【強襲：1】"), "SIEGは青スピリット星竜/異合コスト6・指定アタックと強襲1")
    assert(c(ALEX).name === "巨人皇子アレクサンダー4世" && c(ALEX).type === "spirit" && c(ALEX).colors.join() === "blue" && c(ALEX).family.join() === "闘神,勇傑" && c(ALEX).cost === 5 && c(ALEX).effect.includes("【強襲：1】") && c(ALEX).effect.includes("コスト3以下の相手のスピリット1体を破壊する"), "ALEXは青スピリット闘神/勇傑コスト5・強襲1とコスト3以下破壊")
    assert(c(ELGINIAS).name === "戦竜エルギニアス" && c(ELGINIAS).type === "spirit" && c(ELGINIAS).colors.join() === "blue" && c(ELGINIAS).family.join() === "戦獣" && c(ELGINIAS).cost === 1 && c(ELGINIAS).effect.includes("色とシンボルは赤としても扱う"), "ELGINIASは青スピリット戦獣コスト1・赤としても扱う")
    assert(c(MACKOI).name === "棟梁マッコイ" && c(MACKOI).type === "spirit" && c(MACKOI).colors.join() === "blue" && c(MACKOI).family.join() === "創手" && c(MACKOI).cost === 4 && c(MACKOI).effect.includes("このスピリットのLvと同じ個数のコアを、自分のネクサス1つの上に置く"), "MACKOIは青スピリット創手コスト4・Lvと同じ個数のコアをネクサスへ")
    assert(c(SERPENT).name === "星海獣シー・サーペンダー" && c(SERPENT).type === "spirit" && c(SERPENT).colors.join() === "blue" && c(SERPENT).family.join() === "異合,星魂" && c(SERPENT).cost === 5 && c(SERPENT).effect.includes("コスト4以下の相手のスピリット1体を破壊する") && c(SERPENT).effect.includes("コスト4以下のスピリットはアタックできない"), "SERPENTは青スピリット異合/星魂コスト5・召喚時破壊・強襲1・Lv2合体中アタック封じ")
    assert(c(CERBERUS).name === "牙皇ケルベロード" && c(CERBERUS).type === "brave" && c(CERBERUS).colors.join() === "blue" && c(CERBERUS).family.join() === "異合,皇獣" && c(CERBERUS).cost === 5 && c(CERBERUS).effect.includes("合体条件：コスト5以上") && c(CERBERUS).effect.includes("デッキを上から5枚破棄することで回復する"), "CERBERUSは青ブレイヴ異合/皇獣コスト5・合体条件コスト5以上・合体時デッキ5枚破棄で回復")
    assert(c(ARENA).name === "オリンスピア競技場" && c(ARENA).type === "nexus" && c(ARENA).colors.join() === "blue" && c(ARENA).cost === 3 && c(ARENA).effect.includes("スピリットを召喚できない") && c(ARENA).effect.includes("コア1個をトラッシュに置かなければアタックできない"), "ARENAは青ネクサスコスト3・効果でのスピリット召喚禁止とアタック通行料")
    assert(c(SPLASH).name === "ブルースプラッシュ" && c(SPLASH).type === "magic" && c(SPLASH).colors.join() === "blue" && c(SPLASH).cost === 4 && c(SPLASH).effect.includes("コスト3以下のスピリット1体を破壊する") && c(SPLASH).effect.includes("ネクサスカード1枚を手札に戻す"), "SPLASHは青マジックコスト4・コスト3以下破壊またはトラッシュのネクサス回収")
    assert(c(SQUAD).name === "巨人小隊" && c(SQUAD).type === "spirit" && c(SQUAD).colors.join() === "blue" && c(SQUAD).family.join() === "闘神" && c(SQUAD).cost === 1 && c(SQUAD).effect.includes("相手のデッキを上から2枚破棄する"), "SQUADは青スピリット闘神コスト1・闘神破壊で相手デッキ2枚破棄")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).colors.join() === "red" && c(VANILLA).family.join() === "地竜" && c(VANILLA).cost === 1 && c(VANILLA).effect === "" && c(VANILLA).levels?.[0]?.bp === 1000, "VANILLAは赤地竜コスト1バニラ・BP1000")
    assert(c(JEFFREY).name === "槍兵のジェフリー" && c(JEFFREY).colors.join() === "blue" && c(JEFFREY).family.join() === "闘神" && c(JEFFREY).cost === 1 && c(JEFFREY).effect === "" && c(JEFFREY).levels?.[0]?.bp === 2000, "JEFFREYは青闘神コスト1バニラ・BP2000")
    assert(c(METABURN).name === "メタルバーン" && c(METABURN).colors.join() === "red" && c(METABURN).family.join() === "機竜" && c(METABURN).cost === 3 && c(METABURN).effect === "" && c(METABURN).levels?.[0]?.bp === 3000, "METABURNは赤機竜コスト3バニラ・BP3000")
    assert(c(GOLEM).name === "シェル・ゴレム" && c(GOLEM).colors.join() === "blue" && c(GOLEM).family.join() === "造兵" && c(GOLEM).cost === 4 && c(GOLEM).effect === "" && c(GOLEM).levels?.[0]?.bp === 4000, "GOLEMは青造兵コスト4バニラ・BP4000")
    assert(c(LANCE).name === "ランスモザウルス" && c(LANCE).colors.join() === "red" && c(LANCE).family.join() === "地竜" && c(LANCE).cost === 5 && c(LANCE).effect === "" && c(LANCE).levels?.[0]?.bp === 5000, "LANCEは赤地竜コスト5バニラ・BP5000")
    assert(c(RECLAMATION).name === "リクラメーション" && c(RECLAMATION).type === "magic" && c(RECLAMATION).colors.join() === "blue" && c(RECLAMATION).cost === 3 && c(RECLAMATION).effect.includes("ネクサス1つを破壊することで") && c(RECLAMATION).effect.includes("コスト4以下の青のスピリットカード1枚をコストを支払わずに召喚する"), "RECLAMATIONは青マジックコスト3・ネクサス破壊で青スピリット召喚")
    assert(c(GYOKURUNE).name === "ギョクリューン" && c(GYOKURUNE).type === "brave" && c(GYOKURUNE).colors.join() === "blue" && c(GYOKURUNE).family.join() === "戦獣" && c(GYOKURUNE).cost === 4 && c(GYOKURUNE).effect.includes("合体条件：コスト4以上") && c(GYOKURUNE).braveLevels?.[0]?.bp === 3000, "GYOKURUNEは青ブレイヴ戦獣コスト4・合体条件コスト4以上・合体時BP+3000")
}

// ============================================================
// EX006 輝星龍ジークヴルム・デネブ
// Lv1･Lv2『このスピリットのアタック時』コスト4以下の相手のスピリット1体を指定し、そのスピリットにアタックできる。
// ============================================================

// 起きる場面：Lv1でコスト4の相手を指定アタックし、BP比べで破壊する（ライフは減らない）
scenario({
    name: "sieg-targetAttack-cost4",
    start: {
        me: { spirits: [{ card: SIEG, label: "ジーク", cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ジーク"), targetSpiritInstanceId: t.id("相手.シェル・ゴレム") })
        t.closeFlash()
    },
    expect: [
        "自分.ジーク.疲労: false → true",
        "相手.シェル・ゴレム.場所: フィールド → なし",
        "相手.トラッシュ: なし → シェル・ゴレム",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：コスト5の相手は指定できない（条件を1つ外す）
scenario({
    name: "sieg-targetAttack-cost5-rejected",
    start: {
        me: { spirits: [{ card: SIEG, label: "ジーク", cores: 1 }] },
        opp: { spirits: [{ card: LANCE, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("ジーク"), targetSpiritInstanceId: t.id("相手.ランスモザウルス") })
    },
    expect: [],
})

// Lv2【強襲：1】：アタック時に自分のネクサス1つを疲労させて回復する
scenario({
    name: "sieg-kyoshu-refresh",
    start: {
        me: { spirits: [{ card: SIEG, label: "ジーク", cores: 5 }], nexuses: [{ card: ARENA, label: "競技場", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ジーク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.競技場.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// EX023 巨人皇子アレクサンダー4世
// Lv1･Lv2【強襲：1】／Lv2『このスピリットのアタック時』コスト3以下の相手のスピリット1体を破壊する。
// ============================================================

// 起きる場面：Lv1【強襲：1】でネクサスを疲労させて回復する
scenario({
    name: "alex-kyoshu-refresh",
    start: {
        me: { spirits: [{ card: ALEX, label: "アレク", cores: 1 }], nexuses: [{ card: ARENA, label: "競技場", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アレク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.競技場.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv2アタック時、コスト3以下の相手を破壊する
scenario({
    name: "alex-destroy-cost3",
    start: {
        me: { spirits: [{ card: ALEX, label: "アレク", cores: 4 }] },
        opp: { spirits: [{ card: METABURN, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アレク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アレク.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：コスト4の相手は破壊されない（条件を1つ外す）
scenario({
    name: "alex-destroy-cost4-survives",
    start: {
        me: { spirits: [{ card: ALEX, label: "アレク", cores: 4 }] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アレク") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.アレク.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD03-007 戦竜エルギニアス
// Lv1･Lv2：このスピリットの色とシンボルは赤としても扱う。
// ============================================================

// 起きる場面：赤の軽減シンボルとして数えられ、赤コスト1の召喚が軽減される（シンボルの色にも及ぶ。SEMANTICS_AUDIT §3.9）
scenario({
    name: "elginias-red-reduction",
    start: {
        me: { spirits: [{ card: ELGINIAS, label: "エルギニアス", cores: 1 }], hand: [VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ロクケラトプス → なし",
        "自分.リザーブ: 10 → 9", // コスト1は赤軽減1つで0支払い。Lv1のコア1個だけリザーブから置く
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// 起きない場面：赤として扱うスピリットがいなければ赤の軽減は効かない（条件を1つ外す）
scenario({
    name: "elginias-no-red-symbol",
    start: {
        me: { spirits: [{ card: JEFFREY, label: "ジェフリー", cores: 1 }], hand: [VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ロクケラトプス → なし",
        "自分.リザーブ: 10 → 8", // 軽減なし：コスト1を支払い＋Lv1のコア1個
        "自分.トラッシュのコア: 0 → 1",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// ============================================================
// SD03-008 棟梁マッコイ
// Lv1･Lv2『このスピリットのアタック時』ボイドから、このスピリットのLvと同じ個数のコアを、自分のネクサス1つの上に置く。
// ============================================================

// 起きる場面：Lv1のアタックでボイドから1個、自分のネクサスに置く
scenario({
    name: "mackoi-lv1-place-1core",
    start: {
        me: { spirits: [{ card: MACKOI, label: "マッコイ", cores: 1 }], nexuses: [{ card: ARENA, label: "競技場", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("マッコイ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マッコイ.疲労: false → true",
        "自分.競技場.コア: 0 → 1",
        "自分.競技場.Lv: 1 → 2",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv2のアタックなら「Lvと同じ個数」で2個置く
scenario({
    name: "mackoi-lv2-place-2cores",
    start: {
        me: { spirits: [{ card: MACKOI, label: "マッコイ", cores: 4 }], nexuses: [{ card: ARENA, label: "競技場", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("マッコイ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マッコイ.疲労: false → true",
        "自分.競技場.コア: 0 → 2",
        "自分.競技場.Lv: 1 → 2",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：自分のネクサスがなければ置く場所がない（条件を1つ外す）
scenario({
    name: "mackoi-no-nexus",
    start: {
        me: { spirits: [{ card: MACKOI, label: "マッコイ", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("マッコイ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.マッコイ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD03-009 星海獣シー・サーペンダー
// Lv1･Lv2『このスピリットの召喚時』コスト4以下の相手のスピリット1体を破壊する。
// Lv1･Lv2【強襲：1】／Lv2『相手のアタックステップ』自分の合体スピリットがいる間、コスト4以下のスピリットはアタックできない。
// ============================================================

// 起きる場面：召喚時にコスト4以下の相手を破壊する（コスト5は残る）
scenario({
    name: "serpent-summon-destroy-cost4",
    start: {
        me: { hand: [SERPENT] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }, { card: LANCE, label: "ランス", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 星海獣シー・サーペンダー → なし",
        "自分.リザーブ: 10 → 4", // コスト5（場にシンボルなし・軽減0）＋Lv1のコア1個
        "自分.トラッシュのコア: 0 → 5",
        "自分.星海獣シー・サーペンダー.場所: なし → フィールド",
        "自分.星海獣シー・サーペンダー.疲労: なし → false",
        "自分.星海獣シー・サーペンダー.コア: なし → 1",
        "自分.星海獣シー・サーペンダー.Lv: なし → 1",
        "自分.星海獣シー・サーペンダー.BP: なし → 3000",
        "相手.シェル・ゴレム.場所: フィールド → なし",
        "相手.トラッシュ: なし → シェル・ゴレム",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：【強襲：1】アタック時にネクサスを疲労させて回復する
scenario({
    name: "serpent-kyoshu-refresh",
    start: {
        me: { spirits: [{ card: SERPENT, label: "シー", cores: 1 }], nexuses: [{ card: ARENA, label: "競技場", cores: 0 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("シー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.競技場.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv2で自分の合体スピリットがいる間、相手のコスト4以下はアタックできない
scenario({
    name: "serpent-lv2-combined-lock",
    start: {
        me: { spirits: [{ card: SERPENT, label: "シー", cores: 4 }], hand: [CERBERUS] },
        opp: { spirits: [{ card: METABURN, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("シー") }) // コスト5・青軽減1つで4支払い
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "attack", instanceId: t.id("相手.メタルバーン") })
    },
    expect: [
        "自分.手札: 牙皇ケルベロード → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.牙皇ケルベロード.場所: なし → 合体",
        "自分.牙皇ケルベロード.疲労: なし → false",
        "自分.牙皇ケルベロード.コア: なし → 0",
        "自分.牙皇ケルベロード.Lv: なし → 1",
        "自分.シー.BP: 7000 → 12000", // 合体スピリットのBPはホストとブレイヴの合計
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面：合体スピリットがいなければ相手のコスト3はアタックできる（条件を1つ外す）
scenario({
    name: "serpent-lv2-no-combined-attack-ok",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: SERPENT, label: "シー", cores: 4 }] },
        opp: { spirits: [{ card: METABURN, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.メタルバーン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.メタルバーン.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD03-012 牙皇ケルベロード
// 【合体時】『このスピリットのアタック時』ターンに1回、このスピリットは、自分のデッキを上から5枚破棄することで回復する。
// ============================================================

// 起きる場面：合体時アタックでデッキ5枚を破棄して回復する
scenario({
    name: "cerberus-combined-discard-refresh",
    start: {
        me: { spirits: [{ card: LANCE, label: "ランス", cores: 1 }], hand: [CERBERUS] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ランス") }) // コスト5・赤軽減1つで4支払い
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 牙皇ケルベロード → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 4",
        "自分.牙皇ケルベロード.場所: なし → 合体",
        "自分.牙皇ケルベロード.疲労: なし → false",
        "自分.牙皇ケルベロード.コア: なし → 0",
        "自分.牙皇ケルベロード.Lv: なし → 1",
        "自分.ランス.BP: 5000 → 10000",
        "自分.デッキ枚数: 40 → 35",
        "自分.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 3", // 合体スピリットのシンボルはホストとブレイヴの合計（赤＋青の2つ）
        "相手.リザーブ: 10 → 12",
    ],
})

// 起きない場面：スピリット状態のブレイヴのアタックでは破棄も回復もしない（条件を1つ外す）
scenario({
    name: "cerberus-spirit-state-no-refresh",
    start: {
        me: { spirits: [{ card: CERBERUS, label: "ケルベロード", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ケルベロード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ケルベロード.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD03-014 オリンスピア競技場
// Lv1･Lv2『お互いのメインステップ』スピリット/ネクサス/マジックの効果でスピリットを召喚できない。
// Lv2『相手のアタックステップ』合体していない相手のスピリットがアタックするとき、相手は、相手のリザーブのコア1個をトラッシュに置かなければアタックできない。
// ============================================================

// 起きる場面：マジックの効果によるスピリット召喚が禁止される（「AすることでB」のBができないので何も起きない）
scenario({
    name: "arena-effect-summon-forbidden",
    start: {
        me: { nexuses: [{ card: ARENA, label: "競技場", cores: 0 }], hand: [RECLAMATION, GOLEM] },
    },
    // 「ネクサスを破壊することで召喚する」の召喚が禁じられているので、マジックは使えない（COST_MODEL §1。2026-11-02 期待値を改めた）
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [],
})

// 起きない場面：効果によらない通常の召喚は禁止されない（条件を1つ外す）
scenario({
    name: "arena-normal-summon-ok",
    start: {
        me: { nexuses: [{ card: ARENA, label: "競技場", cores: 0 }], hand: [VANILLA] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ロクケラトプス → なし",
        "自分.リザーブ: 10 → 8", // 赤軽減なし：コスト1支払い＋Lv1のコア1個
        "自分.トラッシュのコア: 0 → 1",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// 起きる場面：Lv2で合体していない相手のアタックに通行料（リザーブのコア1個をトラッシュへ）
scenario({
    name: "arena-lv2-toll",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: ARENA, label: "競技場", cores: 1 }] },
        opp: { spirits: [{ card: METABURN, cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.メタルバーン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.メタルバーン.疲労: false → true",
        "相手.リザーブ: 10 → 9",
        "相手.トラッシュのコア: 0 → 1",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// 起きない場面：合体した相手のアタックには通行料が要らない（条件を1つ外す）
scenario({
    name: "arena-lv2-combined-no-toll",
    start: {
        turn: "opp", phase: "main",
        me: { nexuses: [{ card: ARENA, label: "競技場", cores: 1 }] },
        opp: { spirits: [{ card: LANCE, label: "ランス", cores: 1 }], hand: [GYOKURUNE] },
    },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("相手.ランス") }) // コスト4・軽減0で4支払い
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ランス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.手札: ギョクリューン → なし",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.ギョクリューン.場所: なし → 合体",
        "相手.ギョクリューン.疲労: なし → false",
        "相手.ギョクリューン.コア: なし → 0",
        "相手.ギョクリューン.Lv: なし → 1",
        "相手.ランス.BP: 5000 → 8000",
        "相手.ランス.疲労: false → true",
        "自分.ライフ: 5 → 3", // 合体スピリットのシンボルはホストとブレイヴの合計（赤＋青の2つ）
        "自分.リザーブ: 10 → 12",
    ],
})

// ============================================================
// SD03-017 ブルースプラッシュ
// フラッシュ：相手のコスト3以下のスピリット1体を破壊する。または、自分のトラッシュにあるネクサスカード1枚を手札に戻す。
// ============================================================

// 起きる場面：破壊モードでコスト3以下の相手を破壊する
scenario({
    name: "splash-destroy-cost3",
    start: {
        me: { spirits: [{ card: ELGINIAS, label: "エルギニアス", cores: 1 }, { card: LANCE, label: "ランス", cores: 1 }], hand: [SPLASH] },
        opp: { spirits: [{ card: METABURN, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" }) // コスト4・青軽減1つで3支払い
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ブルースプラッシュ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → ブルースプラッシュ",
        "自分.ランス.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

// 起きない場面：コスト4の相手は破壊モードでも破壊されない（条件を1つ外す）
scenario({
    name: "splash-destroy-cost4-survives",
    start: {
        me: { spirits: [{ card: ELGINIAS, label: "エルギニアス", cores: 1 }, { card: LANCE, label: "ランス", cores: 1 }], hand: [SPLASH] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ブルースプラッシュ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → ブルースプラッシュ",
        "自分.ランス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：回収モードで自分のトラッシュのネクサスカードを手札に戻す
scenario({
    name: "splash-return-nexus",
    start: {
        me: { spirits: [{ card: ELGINIAS, label: "エルギニアス", cores: 1 }, { card: LANCE, label: "ランス", cores: 1 }], hand: [SPLASH], trash: [ARENA] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ブルースプラッシュ → オリンスピア競技場",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: オリンスピア競技場 → ブルースプラッシュ",
        "自分.ランス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ============================================================
// SD16-001 巨人小隊
// Lv1･Lv2：系統：「闘神」を持つ自分のスピリットが相手によって破壊されたとき、相手のデッキを上から2枚破棄する。
// ============================================================

// 起きる場面：自分の闘神が相手のアタックで破壊されたとき、相手のデッキを2枚破棄する
scenario({
    name: "squad-mill-on-toushin-destroyed",
    start: {
        me: { spirits: [{ card: SQUAD, label: "巨人小隊", cores: 1 }, { card: JEFFREY, label: "ジェフリー", cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.シェル・ゴレム") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジェフリー") })
        t.closeFlash()
    },
    expect: [
        "相手.デッキ枚数: 40 → 37", // ドロー1枚のあと、破棄2枚
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.シェル・ゴレム.疲労: false → true",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "自分.ジェフリー.場所: フィールド → なし",
        "自分.トラッシュ: なし → 槍兵のジェフリー",
        "自分.リザーブ: 10 → 11",
    ],
})

// 起きない場面：闘神でない自分のスピリットが破壊されても破棄しない（条件を1つ外す）
scenario({
    name: "squad-no-mill-non-toushin",
    start: {
        me: { spirits: [{ card: SQUAD, label: "巨人小隊", cores: 1 }, { card: VANILLA, label: "ロク", cores: 1 }] },
        opp: { spirits: [{ card: GOLEM, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.シェル・ゴレム") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ロク") })
        t.closeFlash()
    },
    expect: [
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.シェル・ゴレム.疲労: false → true",
        "自分.ロク.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part756）")
