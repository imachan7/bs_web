// smoke パート750（SD10赤B 8枚：SD10-013/014/015/016/X01/X02・SD17-001/002。docs/design/STARTER_PLAN.md §2・STARTER_SURVEY_redB.md §3）
// 期待値役が効果文とカードの属性だけから書いた場面テスト。これらのカードの effects はまだ空なので、
// 効果が効くべき場面はいまは落ちてよい（例外で止まらず最後まで走ることだけを確認する）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

// ── 主役（STARTER-redB）──
const YAJIRUTAI = "SD10-013" // 天目指す竜射台（赤・ネクサス・コスト4）
const TWINFLAME = "SD10-014" // ツインフレイム（赤・マジック・コスト3・フラッシュ：BP2000以下2体破壊）
const FIREWALL = "SD10-015" // ファイアーウォール（赤・マジック・コスト4・フラッシュ：赤1体を破壊することでアタックステップ終了）
const CHARGEDRAW = "SD10-016" // チャージドロー（赤・マジック・コスト5・メイン：ドロー＋【強化】持ち回収／フラッシュ：BP+3000）
const SHINING_DRAGON = "SD10-X01" // 輝龍シャイニング・ドラゴン（赤・星竜・コスト6）
const SHINING_SWORD = "SD10-X02" // 輝きの聖剣シャイニング・ソード（赤・剣刃・ブレイヴ・コスト7）
const PINAKO = "SD17-001" // ピナコチャザウルス（赤・地竜・コスト1。色とシンボルは緑としても扱う）
const DARK_DINO = "SD17-002" // ダーク・ディノニクソー（赤・地竜・コスト2。Lv2から緑のスピリットとしても扱う）

// ── 脇役（既存の弾。data/cards から選んだ）──
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・バニラ）＝赤シンボル源・ファイアーウォールの犠牲
const METABURN = "BS01-008" // メタルバーン（赤・コスト3・BP3000・バニラ）
const VAJURANGA = "BS17-007" // ヴァジュランガ（赤・コスト6・BP4000・バニラ）＝BP4000（3000超）
const ULBIE = "BS11-022" // ウルビー（緑・コスト4・BP5000・バニラ）＝BP5000ぴったり
const MATANGOL = "BS10-028" // マタンゴル（緑・コスト5・BP6000・バニラ・シンボル1つ）＝BP5000超・6000ぴったり
const ODRAN = "SD06-001" // オードラン（赤・コスト0・BP1000・バニラ）
const TERIMUCK = "BS17-019" // テリムック（緑・コスト0・BP2000・バニラ）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・コスト1・軽減[緑]・バニラ）＝緑シンボルの軽減を見る
const DAMSKUS = "BS19-009" // 流星の剣使いダマスクス（赤・剣使/星竜・コスト5・Lv1 BP4000・Lv1〜3【強化】）＝【強化】持ち
const BUSTER = "BS10-061" // 剣鎧竜バスター・ドラゴン（赤・ブレイヴ・コスト3。召喚時：このターンの間、自分のスピリットすべてをBP+2000。合体条件：効果の記述を持たない）
const GYOKURUNE = "BS10-077" // ギョクリューン（青・ブレイヴ・コスト4）＝赤ではないブレイヴ
const BANFA = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・BP4000・バニラ）＝コスト5以上の合体先
const MATENRO = "BS12-063" // 旅団の摩天楼（紫・ネクサス・コスト3）＝破壊されるネクサス
const REDRAY = "BS19-098" // レッドレイ（赤・マジック・コスト5・フラッシュ：BP5000以下の相手のスピリット1体を破壊）＝【強化】の観察者

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(YAJIRUTAI, "天目指す竜射台", "nexus", "red", 4)
    chk(TWINFLAME, "ツインフレイム", "magic", "red", 3)
    chk(FIREWALL, "ファイアーウォール", "magic", "red", 4)
    chk(CHARGEDRAW, "チャージドロー", "magic", "red", 5)
    chk(SHINING_DRAGON, "輝龍シャイニング・ドラゴン", "spirit", "red", 6)
    chk(SHINING_SWORD, "輝きの聖剣シャイニング・ソード", "brave", "red", 7)
    chk(PINAKO, "ピナコチャザウルス", "spirit", "red", 1)
    chk(DARK_DINO, "ダーク・ディノニクソー", "spirit", "red", 2)
    assert(c(SHINING_DRAGON).family.join() === "星竜" && c(SHINING_DRAGON).levels[1]!.bp === 8000 && c(SHINING_DRAGON).levels[2]!.bp === 11000, "輝龍は星竜でLv2がBP8000・Lv3がBP11000")
    assert(c(SHINING_SWORD).family.join() === "剣刃" && c(SHINING_SWORD).levels[0]!.bp === 5000 && c(SHINING_SWORD).braveLevels?.[0]?.bp === 5000, "輝きの聖剣は剣刃でBP5000・合体時BP+5000")
    assert(c(PINAKO).family.join() === "地竜" && c(PINAKO).levels[0]!.bp === 1000, "ピナコチャザウルスは地竜でLv1のBPは1000")
    assert(c(DARK_DINO).family.join() === "地竜" && c(DARK_DINO).levels[1]!.cores === 2, "ダーク・ディノニクソーは地竜でLv2はコア2個")
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METABURN, "メタルバーン", "spirit", "red", 3)
    chk(VAJURANGA, "ヴァジュランガ", "spirit", "red", 6)
    chk(ULBIE, "ウルビー", "spirit", "green", 4)
    chk(MATANGOL, "マタンゴル", "spirit", "green", 5)
    chk(ODRAN, "オードラン", "spirit", "red", 0)
    chk(TERIMUCK, "テリムック", "spirit", "green", 0)
    chk(MIRAGE, "フライングミラージュ", "spirit", "green", 1)
    chk(DAMSKUS, "流星の剣使いダマスクス", "spirit", "red", 5)
    chk(BUSTER, "剣鎧竜バスター・ドラゴン", "brave", "red", 3)
    chk(GYOKURUNE, "ギョクリューン", "brave", "blue", 4)
    chk(BANFA, "戦闘獣バン・ファロー", "spirit", "blue", 5)
    chk(MATENRO, "旅団の摩天楼", "nexus", "purple", 3)
    chk(REDRAY, "レッドレイ", "magic", "red", 5)
    assert(c(ROKU).levels[0]!.bp === 1000 && c(ROKU).effect === "", "ロクケラトプスはBP1000のバニラ")
    assert(c(METABURN).levels[0]!.bp === 3000 && c(METABURN).effect === "", "メタルバーンはBP3000のバニラ")
    assert(c(VAJURANGA).levels[0]!.bp === 4000 && c(VAJURANGA).effect === "", "ヴァジュランガはBP4000のバニラ")
    assert(c(ULBIE).levels[0]!.bp === 5000 && c(ULBIE).effect === "", "ウルビーはBP5000のバニラ")
    assert(c(MATANGOL).levels[0]!.bp === 6000 && c(MATANGOL).effect === "" && c(MATANGOL).symbol.length === 1, "マタンゴルはBP6000・シンボル1つのバニラ")
    assert(c(ODRAN).levels[0]!.bp === 1000 && c(ODRAN).effect === "", "オードランはBP1000のバニラ")
    assert(c(TERIMUCK).levels[0]!.bp === 2000 && c(TERIMUCK).effect === "", "テリムックはBP2000のバニラ")
    assert(c(MIRAGE).levels[0]!.bp === 2000 && c(MIRAGE).effect === "" && c(MIRAGE).reduction.join() === "green", "フライングミラージュはBP2000のバニラで軽減[緑]")
    assert(c(DAMSKUS).levels[0]!.bp === 4000 && c(DAMSKUS).effect.includes("【強化】"), "ダマスクスはLv1 BP4000で【強化】を持つ")
    assert(c(BUSTER).effect.includes("自分のスピリットすべてをBP+2000する") && c(BUSTER).effect.includes("合体条件：効果の記述を持たない"), "バスター・ドラゴンは召喚時にBP+2000で、効果の記述を持たないスピリットにだけ合体できる")
    assert(c(BANFA).levels[0]!.bp === 4000 && c(BANFA).effect === "", "バン・ファローはBP4000のバニラ")
    assert(c(REDRAY).effect.includes("フラッシュ") && c(REDRAY).effect.includes("BP5000以下の相手のスピリット1体を破壊"), "レッドレイはフラッシュでBP5000以下1体を破壊する")
}

// ═══ SD10-013 天目指す竜射台 ═══
// Lv1･Lv2『相手のアタックステップ』相手のスピリットのアタックによって自分のライフが減ったとき、
//   アタックしたBP5000以下の相手のスピリット1体を破壊する。
// Lv2『自分のアタックステップ』【強化】を持つ自分のスピリットが相手のスピリットを破壊したとき、
//   相手のネクサス1つを破壊する。

console.log("=== SD10-013 Lv1: 相手のアタックでライフが減ったら、アタックしたBP3000が破壊される ===")
scenario({
    name: "yajirutai-destroy-attacker",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: YAJIRUTAI, cores: 1 }] }, opp: { spirits: [{ card: METABURN }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("メタルバーン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.リザーブ: 10 → 11", // 破壊されたメタルバーンのコア1個（ライフのコアはライフを減らされた自分のリザーブへ）
    ],
})

console.log("=== SD10-013 Lv1: アタッカーがBP6000なら（条件を1つ外す）破壊されない ===")
scenario({
    name: "yajirutai-attacker-too-strong",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: YAJIRUTAI, cores: 1 }] }, opp: { spirits: [{ card: MATANGOL }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("マタンゴル") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.マタンゴル.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== SD10-013 Lv2: 【強化】持ち（ダマスクス）がブロッカーを破壊したら、相手のネクサスも破壊 ===")
scenario({
    name: "yajirutai-kyoka-destroys-nexus",
    start: {
        phase: "attack",
        me: { nexuses: [{ card: YAJIRUTAI, cores: 1 }], spirits: [{ card: DAMSKUS }] },
        opp: { spirits: [{ card: METABURN }], nexuses: [{ card: MATENRO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("流星の剣使いダマスクス") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.流星の剣使いダマスクス.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.旅団の摩天楼.場所: ネクサス → なし",
        "相手.トラッシュ: なし → メタルバーン、旅団の摩天楼", // ブロッカーの破壊→その後の誘発でネクサス破壊の順。効果文は並びを決めていない
        "相手.リザーブ: 10 → 12", // 破壊されたスピリットとネクサスのコア1個ずつ
    ],
})

// 効果による破壊の側（バトルの破壊は上の場面）：Lv3 の輝龍は【強化】を持ち、アタック時の効果で BP6000（5000＋強化1000）以下を破壊する
console.log("=== SD10-013 Lv2: 【強化】持ち（輝龍 Lv3）がアタック時の効果で相手を破壊したら、相手のネクサスも破壊 ===")
scenario({
    name: "yajirutai-kyoka-effect-destroys-nexus",
    start: {
        phase: "attack",
        me: { nexuses: [{ card: YAJIRUTAI, cores: 1 }], spirits: [{ card: SHINING_DRAGON, cores: 4 }] },
        opp: { spirits: [{ card: MATANGOL }], nexuses: [{ card: MATENRO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("輝龍シャイニング・ドラゴン") })
    },
    expect: [
        "自分.輝龍シャイニング・ドラゴン.疲労: false → true",
        "相手.マタンゴル.場所: フィールド → なし",
        "相手.旅団の摩天楼.場所: ネクサス → なし",
        "相手.トラッシュ: なし → マタンゴル、旅団の摩天楼",
        "相手.リザーブ: 10 → 12", // 破壊されたスピリットとネクサスのコア1個ずつ
    ],
})

console.log("=== SD10-013 Lv2: 破壊したのが【強化】を持たないスピリットなら（条件を1つ外す）ネクサスは残る ===")
scenario({
    name: "yajirutai-no-kyoka-no-nexus",
    start: {
        phase: "attack",
        me: { nexuses: [{ card: YAJIRUTAI, cores: 1 }], spirits: [{ card: VAJURANGA }] },
        opp: { spirits: [{ card: METABURN }], nexuses: [{ card: MATENRO, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヴァジュランガ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("メタルバーン") })
        t.closeFlash()
    },
    expect: [
        "自分.ヴァジュランガ.疲労: false → true",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ SD10-014 ツインフレイム ═══
// フラッシュ：BP2000以下の相手のスピリット2体を破壊する。

console.log("=== SD10-014: フラッシュでBP2000以下の2体（BP1000とBP2000）を破壊 ===")
scenario({
    name: "twinflame-two-destroyed",
    start: { phase: "attack", me: { spirits: [{ card: ROKU }], hand: [TWINFLAME] }, opp: { spirits: [{ card: ODRAN }, { card: TERIMUCK }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ツインフレイム → なし",
        "自分.リザーブ: 10 → 8", // コスト3−軽減[赤]1（ロクケラトプスの赤シンボル）
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ツインフレイム",
        "相手.オードラン.場所: フィールド → なし",
        "相手.テリムック.場所: フィールド → なし",
        "相手.トラッシュ: なし → オードラン、テリムック",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 13", // 破壊された2体のコア＋ライフのコア
    ],
})

console.log("=== SD10-014: BP2000以下が1体しかいなければ（条件を1つ外す）その1体だけ破壊 ===")
scenario({
    name: "twinflame-one-destroyed",
    start: { phase: "attack", me: { spirits: [{ card: ROKU }], hand: [TWINFLAME] }, opp: { spirits: [{ card: ODRAN }, { card: VAJURANGA }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "自分.手札: ツインフレイム → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ツインフレイム",
        "相手.オードラン.場所: フィールド → なし",
        "相手.トラッシュ: なし → オードラン",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

// ═══ SD10-015 ファイアーウォール ═══
// フラッシュ：自分の赤のスピリット1体を破壊することで、このバトルが終了したとき、アタックステップを終了する。
// この効果は、『相手のアタックステップ』でしか使えない。

console.log("=== SD10-015: 相手のアタックステップでロクケラトプスを破壊し、バトル終了後にアタックステップが終わる ===")
scenario({
    name: "firewall-ends-attack-step",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: ROKU }], hand: [FIREWALL] },
        opp: { spirits: [{ card: METABURN }, { card: MATANGOL }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("メタルバーン") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
        // アタックステップが終わっているので、2体目のマタンゴルではアタックできない
        t.actRejected("opp", { type: "attack", instanceId: t.id("マタンゴル") })
    },
    expect: [
        "相手.メタルバーン.疲労: false → true",
        "自分.ロクケラトプス.場所: フィールド → なし",
        // アタックステップが終わると相手のターンも終わり、自分のターンのドロー・コア・リフレッシュまで進む
        "自分.手札: ファイアーウォール → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "自分.リザーブ: 10 → 13", // 支払い3（コスト4−軽減1）、ロクとライフのコア各1、コアステップ1、リフレッシュでトラッシュの3個が戻る
        "自分.トラッシュ: なし → ファイアーウォール、ロクケラトプス",
        "自分.ライフ: 5 → 4",
    ],
})

console.log("=== SD10-015: 自分のターンでは（条件を1つ外す）使えない ===")
scenario({
    name: "firewall-own-turn-forbidden",
    start: { phase: "attack", me: { spirits: [{ card: ROKU }], hand: [FIREWALL] }, opp: { spirits: [{ card: METABURN }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.act("opp", { type: "pass" })
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ SD10-016 チャージドロー ═══
// メイン：自分はデッキから2枚ドローする。その後、デッキを上から2枚オープンし、
//   その中の【強化】を持つスピリットカード/ブレイヴカードすべてを手札に加える。残ったカードはデッキの上に戻す。
// フラッシュ：このターンの間、スピリット1体をBP+3000する。

console.log("=== SD10-016 メイン: 2枚ドローし、オープンした【強化】持ち（ダマスクス）を回収し、残りを戻す ===")
scenario({
    name: "chargedraw-main-pick-kyoka",
    start: { me: { hand: [CHARGEDRAW], deck: [ROKU, ROKU, DAMSKUS, ROKU] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: チャージドロー → ロクケラトプス、ロクケラトプス、流星の剣使いダマスクス", // 効果文は手札の並びを決めていない。ドロー2枚の後に回収1枚が加わる
        "自分.デッキ枚数: 4 → 1", // ドロー2＋オープン2−戻す1
        "自分.リザーブ: 10 → 5", // コスト5（赤シンボルなし）
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → チャージドロー",
    ],
})

console.log("=== SD10-016 メイン: オープンした2枚に【強化】持ちがいなければ（条件を1つ外す）回収しない ===")
scenario({
    name: "chargedraw-main-no-kyoka",
    start: { me: { hand: [CHARGEDRAW], deck: [ROKU, ROKU, ROKU, ROKU] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "自分.手札: チャージドロー → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 4 → 2", // ドロー2＋オープン2−戻す2
        "自分.リザーブ: 10 → 5",
        "自分.トラッシュのコア: 0 → 5",
        "自分.トラッシュ: なし → チャージドロー",
    ],
})

console.log("=== SD10-016 フラッシュ: このターンの間、スピリット1体をBP+3000 ===")
scenario({
    name: "chargedraw-flash-bp3000",
    start: { phase: "attack", me: { spirits: [{ card: VAJURANGA }], hand: [CHARGEDRAW] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ヴァジュランガ") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ヴァジュランガ.疲労: false → true",
        "自分.ヴァジュランガ.BP: 4000 → 7000",
        "自分.手札: チャージドロー → なし",
        "自分.リザーブ: 10 → 6", // コスト5−軽減[赤]1（ヴァジュランガの赤シンボル）
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → チャージドロー",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ SD10-X01 輝龍シャイニング・ドラゴン ═══
// Lv1･Lv2･Lv3『このスピリットの召喚時』自分の手札にある赤のブレイヴカード1枚を、コストを支払わずに召喚できる。
// Lv2･Lv3『このスピリットのアタック時』BP5000以下の相手のスピリット1体を破壊する。
// Lv3【強化】自分の「BP破壊効果」の上限を+1000する。

console.log("=== SD10-X01 召喚時: 手札の赤ブレイヴ（バスター・ドラゴン）をコストを支払わずに召喚 ===")
scenario({
    name: "shiningdragon-free-brave",
    start: { me: { hand: [SHINING_DRAGON, BUSTER] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // バスター・ドラゴンは「効果の記述を持たない」スピリットにしか合体できないので、効果を持つ輝龍には合体せずスピリット状態。
    // バスター自身の召喚時効果でこのターンの間、自分のスピリットすべてがBP+2000される
    expect: [
        "自分.手札: 剣鎧竜バスター・ドラゴン、輝龍シャイニング・ドラゴン → なし",
        "自分.リザーブ: 10 → 2", // 輝龍のコスト6＋維持コア2個（輝龍1個・バスター1個。バスターのコストは支払わない）
        "自分.トラッシュのコア: 0 → 6",
        "自分.輝龍シャイニング・ドラゴン.場所: なし → フィールド",
        "自分.輝龍シャイニング・ドラゴン.疲労: なし → false",
        "自分.輝龍シャイニング・ドラゴン.コア: なし → 1",
        "自分.輝龍シャイニング・ドラゴン.Lv: なし → 1",
        "自分.輝龍シャイニング・ドラゴン.BP: なし → 7000", // 5000＋バスターのBP+2000
        "自分.剣鎧竜バスター・ドラゴン.場所: なし → フィールド",
        "自分.剣鎧竜バスター・ドラゴン.疲労: なし → false",
        "自分.剣鎧竜バスター・ドラゴン.コア: なし → 1",
        "自分.剣鎧竜バスター・ドラゴン.Lv: なし → 1",
        "自分.剣鎧竜バスター・ドラゴン.BP: なし → 4000", // 2000＋自分自身へのBP+2000
    ],
})

console.log("=== SD10-X01 召喚時: 手札のブレイヴが赤でなければ（条件を1つ外す）召喚されない ===")
scenario({
    name: "shiningdragon-no-red-brave",
    start: { me: { hand: [SHINING_DRAGON, GYOKURUNE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ギョクリューン、輝龍シャイニング・ドラゴン → ギョクリューン",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.輝龍シャイニング・ドラゴン.場所: なし → フィールド",
        "自分.輝龍シャイニング・ドラゴン.疲労: なし → false",
        "自分.輝龍シャイニング・ドラゴン.コア: なし → 1",
        "自分.輝龍シャイニング・ドラゴン.Lv: なし → 1",
        "自分.輝龍シャイニング・ドラゴン.BP: なし → 5000",
    ],
})

console.log("=== SD10-X01 Lv2 アタック時: BP5000以下のウルビーを破壊してからライフを減らす ===")
scenario({
    name: "shiningdragon-lv2-destroy",
    start: { phase: "attack", me: { spirits: [{ card: SHINING_DRAGON, cores: 3 }] }, opp: { spirits: [{ card: ULBIE }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("輝龍シャイニング・ドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.輝龍シャイニング・ドラゴン.疲労: false → true",
        "相手.ウルビー.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウルビー",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12", // 破壊されたウルビーのコア1個＋ライフのコア1個
    ],
})

console.log("=== SD10-X01 Lv2 アタック時: BP6000なら（条件を1つ外す）破壊されない ===")
scenario({
    name: "shiningdragon-lv2-too-strong",
    start: { phase: "attack", me: { spirits: [{ card: SHINING_DRAGON, cores: 3 }] }, opp: { spirits: [{ card: MATANGOL }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("輝龍シャイニング・ドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.輝龍シャイニング・ドラゴン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== SD10-X01 Lv3【強化】: 上限が+1000されてBP6000のマタンゴルまで破壊できる ===")
scenario({
    name: "shiningdragon-lv3-kyoka",
    start: { phase: "attack", me: { spirits: [{ card: SHINING_DRAGON, cores: 4 }] }, opp: { spirits: [{ card: MATANGOL }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("輝龍シャイニング・ドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.輝龍シャイニング・ドラゴン.疲労: false → true",
        "相手.マタンゴル.場所: フィールド → なし",
        "相手.トラッシュ: なし → マタンゴル",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

// ═══ SD10-X02 輝きの聖剣シャイニング・ソード ═══
// Lv1『このブレイヴの召喚時』BP3000以下の相手のスピリットすべてを破壊し、破壊したスピリット1体につき1枚ドローする。
// Lv1【強化】／【合体時】【強化】アルティメット以外の自分の「BP破壊効果」の上限を+1000する。

console.log("=== SD10-X02 召喚時: BP3000以下の2体を破壊し、2枚ドローする ===")
scenario({
    name: "shiningsword-summon-destroy-draw",
    start: { me: { hand: [SHINING_SWORD] }, opp: { spirits: [{ card: ODRAN }, { card: METABURN }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // 合体先を指定しない＝スピリット状態で召喚
    },
    expect: [
        "自分.手札: 輝きの聖剣シャイニング・ソード → ロクケラトプス、ロクケラトプス",
        "自分.デッキ枚数: 40 → 38",
        "自分.リザーブ: 10 → 2", // コスト7＋維持コア1個
        "自分.トラッシュのコア: 0 → 7",
        "自分.輝きの聖剣シャイニング・ソード.場所: なし → フィールド",
        "自分.輝きの聖剣シャイニング・ソード.疲労: なし → false",
        "自分.輝きの聖剣シャイニング・ソード.コア: なし → 1",
        "自分.輝きの聖剣シャイニング・ソード.Lv: なし → 1",
        "自分.輝きの聖剣シャイニング・ソード.BP: なし → 5000",
        "相手.オードラン.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → オードラン、メタルバーン",
        "相手.リザーブ: 10 → 12",
    ],
})

// 自身の Lv1【強化】が召喚時効果にも効き、上限は BP4000 になる（batspi Q21587。2026-11-02 期待値を改めた）
console.log("=== SD10-X02 召喚時: 自身の【強化】で BP4000 のヴァジュランガも破壊し、1枚ドローする ===")
scenario({
    name: "shiningsword-summon-own-kyoka",
    start: { me: { hand: [SHINING_SWORD] }, opp: { spirits: [{ card: VAJURANGA }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 輝きの聖剣シャイニング・ソード → ロクケラトプス",
        "自分.デッキ枚数: 40 → 39",
        "相手.ヴァジュランガ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヴァジュランガ",
        "相手.リザーブ: 10 → 11",
        "自分.リザーブ: 10 → 2",
        "自分.トラッシュのコア: 0 → 7",
        "自分.輝きの聖剣シャイニング・ソード.場所: なし → フィールド",
        "自分.輝きの聖剣シャイニング・ソード.疲労: なし → false",
        "自分.輝きの聖剣シャイニング・ソード.コア: なし → 1",
        "自分.輝きの聖剣シャイニング・ソード.Lv: なし → 1",
        "自分.輝きの聖剣シャイニング・ソード.BP: なし → 5000",
    ],
})

console.log("=== SD10-X02 Lv1【強化】: レッドレイ（BP5000以下）の上限が+1000されてBP6000のマタンゴルを破壊 ===")
scenario({
    name: "shiningsword-kyoka-spirit-state",
    start: { phase: "attack", me: { spirits: [{ card: SHINING_SWORD }], hand: [REDRAY] }, opp: { spirits: [{ card: MATANGOL }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("輝きの聖剣シャイニング・ソード") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.輝きの聖剣シャイニング・ソード.疲労: false → true",
        "自分.手札: レッドレイ → なし",
        "自分.リザーブ: 10 → 6", // コスト5−軽減[赤]1（聖剣の赤シンボル）
        "自分.トラッシュのコア: 0 → 4",
        "自分.トラッシュ: なし → レッドレイ",
        "相手.マタンゴル.場所: フィールド → なし",
        "相手.トラッシュ: なし → マタンゴル",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
    ],
})

console.log("=== SD10-X02 【合体時】【強化】: 合体中もレッドレイの上限が+1000されてBP6000を破壊 ===")
scenario({
    name: "shiningsword-kyoka-combined",
    start: { phase: "main", me: { spirits: [{ card: BANFA }], hand: [SHINING_SWORD, REDRAY], reserve: 12 }, opp: { spirits: [{ card: MATANGOL }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("戦闘獣バン・ファロー") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("戦闘獣バン・ファロー") })
        t.act("opp", { type: "pass" }) // アタック後のフラッシュは防御側が先
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: レッドレイ、輝きの聖剣シャイニング・ソード → なし",
        "自分.リザーブ: 12 → 1", // 聖剣のコスト7＋レッドレイのコスト5−軽減[赤]1（合体中の聖剣の赤シンボル）
        "自分.トラッシュのコア: 0 → 11",
        "自分.トラッシュ: なし → レッドレイ",
        "自分.輝きの聖剣シャイニング・ソード.場所: なし → 合体",
        "自分.輝きの聖剣シャイニング・ソード.疲労: なし → false",
        "自分.輝きの聖剣シャイニング・ソード.コア: なし → 0",
        "自分.輝きの聖剣シャイニング・ソード.Lv: なし → 1",
        "自分.戦闘獣バン・ファロー.BP: 4000 → 9000", // 合体時BP+5000
        "自分.戦闘獣バン・ファロー.疲労: false → true",
        "相手.マタンゴル.場所: フィールド → なし",
        "相手.トラッシュ: なし → マタンゴル",
        "相手.ライフ: 5 → 3", // 合体スピリットのシンボルはホスト（青1）とブレイヴ（赤1）の合計2つ
        "相手.リザーブ: 10 → 13", // 破壊されたマタンゴルのコア1個＋ライフのコア2個
    ],
})

// ═══ SD17-001 ピナコチャザウルス ═══
// Lv1･Lv2･Lv3 このスピリットの色とシンボルは緑としても扱う。

console.log("=== SD17-001: 緑のシンボルとしても数えられ、軽減[緑]のフライングミラージュが軽くなる ===")
scenario({
    name: "pinako-green-symbol-reduction",
    start: { me: { spirits: [{ card: PINAKO }], hand: [MIRAGE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: フライングミラージュ → なし",
        "自分.リザーブ: 10 → 9", // コスト1−軽減[緑]1（ピナコチャザウルスの緑シンボル）＋維持コア1個
        "自分.フライングミラージュ.場所: なし → フィールド",
        "自分.フライングミラージュ.疲労: なし → false",
        "自分.フライングミラージュ.コア: なし → 1",
        "自分.フライングミラージュ.Lv: なし → 1",
        "自分.フライングミラージュ.BP: なし → 2000",
    ],
})

console.log("=== SD17-001: 緑シンボルがなければ（条件を1つ外す）軽減されない ===")
scenario({
    name: "pinako-no-green-symbol",
    start: { me: { spirits: [{ card: ROKU }], hand: [MIRAGE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: フライングミラージュ → なし",
        "自分.リザーブ: 10 → 8", // コスト1（ロクの赤シンボルでは軽減できない）＋維持コア1個
        "自分.トラッシュのコア: 0 → 1",
        "自分.フライングミラージュ.場所: なし → フィールド",
        "自分.フライングミラージュ.疲労: なし → false",
        "自分.フライングミラージュ.コア: なし → 1",
        "自分.フライングミラージュ.Lv: なし → 1",
        "自分.フライングミラージュ.BP: なし → 2000",
    ],
})

// ═══ SD17-002 ダーク・ディノニクソー ═══
// Lv2･Lv3 このスピリットは緑のスピリットとしても扱う。（SEMANTICS_AUDIT §3.9：シンボルの色にも及ぶ）

console.log("=== SD17-002: Lv2なら緑としても扱われ、軽減[緑]が効く ===")
scenario({
    name: "darkdino-lv2-green-reduction",
    start: { me: { spirits: [{ card: DARK_DINO, cores: 2 }], hand: [MIRAGE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: フライングミラージュ → なし",
        "自分.リザーブ: 10 → 9", // コスト1−軽減[緑]1（Lv2のディノニクソーの緑シンボル）＋維持コア1個
        "自分.フライングミラージュ.場所: なし → フィールド",
        "自分.フライングミラージュ.疲労: なし → false",
        "自分.フライングミラージュ.コア: なし → 1",
        "自分.フライングミラージュ.Lv: なし → 1",
        "自分.フライングミラージュ.BP: なし → 2000",
    ],
})

console.log("=== SD17-002: Lv1なら（条件を1つ外す）緑として扱われず軽減されない ===")
scenario({
    name: "darkdino-lv1-no-green",
    start: { me: { spirits: [{ card: DARK_DINO, cores: 1 }], hand: [MIRAGE] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: フライングミラージュ → なし",
        "自分.リザーブ: 10 → 8", // コスト1＋維持コア1個
        "自分.トラッシュのコア: 0 → 1",
        "自分.フライングミラージュ.場所: なし → フィールド",
        "自分.フライングミラージュ.疲労: なし → false",
        "自分.フライングミラージュ.コア: なし → 1",
        "自分.フライングミラージュ.Lv: なし → 1",
        "自分.フライングミラージュ.BP: なし → 2000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part750）")
