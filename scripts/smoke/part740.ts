// smoke パート740（BS19 青9枚：057/059/060/061/062/064/065/066/077。docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23）
// 期待値役が効果文とカードの属性だけから書いた場面テスト。BS19 の effects はまだ空なので、
// 効果が効くべき場面はいまは落ちてよい（例外で止まらず最後まで走ることだけを確認する）
// 【強化】の行（057・059・061・062 の強化）は part726 が見るので、ここには場面を書かない
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

// ── 主役（BS19 青）──
const ADRIAN = "BS19-057" // 光の衛士アドリアン（青・闘神・コスト1。Lv1 BP2000/Lv2 BP3000【強化】のみ）
const GAIUS = "BS19-059" // 光の戦士ガイウス（青・闘神・コスト2。【強化】のみ）
const MINOTA = "BS19-060" // ミノタ・コルス（青・異合・コスト3）アタック時：白のバースト不可＋連鎖[赤]ドロー
const RANDAL = "BS19-061" // 光の闘士ランダル（青・闘神・コスト3。【強化】のみ）
const HOPE = "BS19-062" // 光の騎士ホープ（青・闘神・コスト4）【粉砕】＋Lv2-3【強襲：1】
const EGBARD = "BS19-064" // 十剣聖エグバード（青・剣使/闘神・コスト5）アタック時デッキ2枚＋強化アタックで赤バースト不可＋合体時コスト以下破壊
const RESQURA = "BS19-065" // 異海女帝レスキュラ（青・異合・コスト6）召喚時：コスト5以下破壊＋連鎖[赤]トラッシュ回収
const MAZE = "BS19-066" // メイズ・ハイドラ（青・海首/異合・コスト7）緑/白/黄マジック禁止＋Lv2相手はトラッシュ回収不可＋連鎖[赤]青シンボル2つ
const FESKIENA = "BS19-077" // フェスキーナ・アームズ（青・造兵・ブレイヴ・コスト3）召喚時：強化持ちを最高Lv扱い＋合体条件【強化】＋合体時【粉砕】

// ── 脇役（既存の弾。data/cards から選んだ）──
const ROKU = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）＝赤シンボル源
const METABURN = "BS01-008" // メタルバーン（赤・機竜・コスト3・BP3000・バニラ）＝コスト5以下の的
const WINGAL = "BS02-046" // ウィンガル（白・武装・コスト6・Lv1 BP5000・バニラ）＝コスト6（5以下に入らない）
const MATENRO = "BS12-063" // 旅団の摩天楼（紫・ネクサス・コスト3）【強襲】の疲労支払い用（配置時効果は場面で発動しない）
const GATHERFORCE = "BS01-136" // ギャザーフォース（緑・マジック・コスト3・メインあり）＝禁止色のマジック
const MAGICHAMMER = "BS03-144" // マジックハンマー（青・マジック・コスト4・メイン：相手のデッキを5枚破棄）
const BINDTHORN = "BS01-134" // バインディングソーン（緑・マジック・コスト2・フラッシュのみ）
const REBORNFLAME = "BS07-069" // リボーンフレイム（赤・マジック・コスト4・メイン：自分のトラッシュのスピリットカード1枚を手札に戻す）
const TROLL = "BS03-078" // 暴れトロル（青・コスト2・BP3000・バニラ・軽減[青][青]）＝シンボル数の軽減を見る
const DOMINION_R = "X012R" // 英雄皇ロード・ドラゴン・ドミニオン（赤・スピリット・コスト6）バースト：ライフ減少後、このカードを召喚（支払い追尾なし）
const JEANNE = "BS16-036" // 氷聖女ジャンヌダルク（白・スピリット・コスト7）バースト：ライフ減少後、このカードを召喚
const GYOKURUNE = "BS10-077" // ギョクリューン（青・ブレイヴ・コスト4・合体条件コスト4以上・合体時BP+3000・合体時効果はこの場面では働かない）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    const chk = (id: string, name: string, type: string, color: string, cost: number) =>
        assert(c(id).name === name && c(id).type === type && c(id).colors.join() === color && c(id).cost === cost, `${id}は${color}の${type}「${name}」コスト${cost}`)
    chk(ADRIAN, "光の衛士アドリアン", "spirit", "blue", 1)
    chk(GAIUS, "光の戦士ガイウス", "spirit", "blue", 2)
    chk(MINOTA, "ミノタ・コルス", "spirit", "blue", 3)
    chk(RANDAL, "光の闘士ランダル", "spirit", "blue", 3)
    chk(HOPE, "光の騎士ホープ", "spirit", "blue", 4)
    chk(EGBARD, "十剣聖エグバード", "spirit", "blue", 5)
    chk(RESQURA, "異海女帝レスキュラ", "spirit", "blue", 6)
    chk(MAZE, "メイズ・ハイドラ", "spirit", "blue", 7)
    chk(FESKIENA, "フェスキーナ・アームズ", "brave", "blue", 3)
    assert(c(ADRIAN).family.join() === "闘神" && c(ADRIAN).levels[1]!.bp === 3000, "アドリアンは闘神で最高Lv2のBPは3000")
    assert(c(MINOTA).family.join() === "異合" && c(MINOTA).levels[0]!.bp === 3000, "ミノタ・コルスは異合でLv1のBPは3000")
    assert(c(EGBARD).family.join() === "剣使,闘神" && c(EGBARD).levels[2]!.bp === 7000, "エグバードは剣使/闘神でLv3のBPは7000")
    assert(c(RESQURA).family.join() === "異合" && c(RESQURA).levels[0]!.bp === 5000, "レスキュラは異合でLv1のBPは5000")
    assert(c(MAZE).family.join() === "海首,異合" && c(MAZE).levels[1]!.cores === 5, "メイズ・ハイドラは海首/異合でLv2はコア5個")
    assert(c(HOPE).levels[1]!.cores === 2 && c(HOPE).levels[1]!.bp === 5000, "ホープはLv2がコア2個・BP5000")
    assert(c(FESKIENA).braveLevels?.[0]?.bp === 3000, "フェスキーナの合体時BP+は3000")
    chk(ROKU, "ロクケラトプス", "spirit", "red", 1)
    chk(METABURN, "メタルバーン", "spirit", "red", 3)
    chk(WINGAL, "ウィンガル", "spirit", "white", 6)
    assert(c(ROKU).levels[0]!.bp === 1000 && c(ROKU).effect === "", "ロクケラトプスはBP1000のバニラ")
    assert(c(METABURN).levels[0]!.bp === 3000 && c(METABURN).effect === "", "メタルバーンはBP3000のバニラ")
    assert(c(WINGAL).levels[0]!.bp === 5000 && c(WINGAL).effect === "", "ウィンガルはBP5000のバニラ")
    chk(MATENRO, "旅団の摩天楼", "nexus", "purple", 3)
    chk(GATHERFORCE, "ギャザーフォース", "magic", "green", 3)
    chk(MAGICHAMMER, "マジックハンマー", "magic", "blue", 4)
    chk(BINDTHORN, "バインディングソーン", "magic", "green", 2)
    chk(REBORNFLAME, "リボーンフレイム", "magic", "red", 4)
    assert(c(GATHERFORCE).effect.includes("メイン"), "ギャザーフォースはメイン効果を持つ緑マジック")
    assert(c(MAGICHAMMER).effect.includes("相手のデッキを上から5枚破棄"), "マジックハンマーは相手のデッキを5枚破棄する")
    assert(c(BINDTHORN).effect.includes("フラッシュ"), "バインディングソーンはフラッシュ効果を持つ緑マジック")
    assert(c(REBORNFLAME).effect.includes("トラッシュにあるスピリットカード1枚を手札に戻す"), "リボーンフレイムは自分のトラッシュのスピリットカード1枚を手札に戻す")
    chk(TROLL, "暴れトロル", "spirit", "blue", 2)
    assert(c(TROLL).levels[0]!.bp === 3000 && c(TROLL).effect === "" && c(TROLL).reduction.join() === "blue,blue", "暴れトロルはBP3000のバニラで軽減[青][青]")
    chk(DOMINION_R, "英雄皇ロード・ドラゴン・ドミニオン", "spirit", "red", 6)
    chk(JEANNE, "氷聖女ジャンヌダルク", "spirit", "white", 7)
    assert(c(DOMINION_R).effect.includes("【バースト：自分のライフ減少後】") && c(DOMINION_R).levels[0]!.bp === 5000, "英雄皇ロード・ドラゴン・ドミニオンはライフ減少後のバーストで召喚する赤スピリット（Lv1 BP5000）")
    assert(c(JEANNE).effect.includes("【バースト：自分のライフ減少後】") && c(JEANNE).levels[0]!.bp === 4000, "氷聖女ジャンヌダルクはライフ減少後のバーストで召喚する白スピリット（Lv1 BP4000）")
    chk(GYOKURUNE, "ギョクリューン", "brave", "blue", 4)
    assert(c(GYOKURUNE).effect.includes("合体条件：コスト4以上") && c(GYOKURUNE).braveLevels?.[0]?.bp === 3000, "ギョクリューンはコスト4以上に合体でき、合体時BP+3000")
}

// ═══ BS19-057・059・061：効果は【強化】の行だけ → 場面は part726 が見る（ここでは機械確認のみ） ═══

// ═══ BS19-060 ミノタ・コルス ═══
// Lv1･Lv2『このスピリットのアタック時』相手は白のバーストを発動できない。
// 【連鎖：条件《赤シンボル》】[赤]：自分はデッキから1枚ドローする。

console.log("=== BS19-060: アタック中は相手は白のバーストを発動できない（ジャンヌダルクが発動しない） ===")
scenario({
    name: "minota-white-burst-blocked",
    start: { phase: "attack", me: { spirits: [{ card: MINOTA }] }, opp: { burst: JEANNE } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミノタ・コルス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ミノタ・コルス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS19-060: 相手のバーストが赤なら（条件を1つ外す）発動できる ===")
scenario({
    name: "minota-red-burst-fires",
    start: { phase: "attack", me: { spirits: [{ card: MINOTA }] }, opp: { burst: DOMINION_R } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミノタ・コルス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // バーストでコストを支払わず召喚（維持コア1個はリザーブから。ライフのコアで相殺されてリザーブは10のまま）
    expect: [
        "自分.ミノタ・コルス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.場所: なし → フィールド",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.疲労: なし → false",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.コア: なし → 1",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.Lv: なし → 1",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.BP: なし → 5000",
    ],
})

console.log("=== BS19-060: 連鎖[赤]：自分の赤シンボル（ロクケラトプス）があるときドローする ===")
scenario({
    name: "minota-rensa-draw",
    start: { phase: "attack", me: { spirits: [{ card: MINOTA }, { card: ROKU }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミノタ・コルス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ミノタ・コルス.疲労: false → true",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-060: 赤シンボルがなければ（条件を1つ外す）連鎖は発揮しない ===")
scenario({
    name: "minota-rensa-no-red",
    start: { phase: "attack", me: { spirits: [{ card: MINOTA }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ミノタ・コルス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ミノタ・コルス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

// ═══ BS19-062 光の騎士ホープ ═══
// Lv1･Lv2･Lv3【粉砕】『このスピリットのアタック時』相手のデッキを上から、このスピリットのLvと同じ枚数破棄する。
// Lv2･Lv3【強襲：1】『このスピリットのアタック時』このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる。

console.log("=== BS19-062: 【粉砕】Lv1のアタックで相手のデッキを1枚破棄（Lv1なので【強襲】はまだ無い） ===")
scenario({
    name: "hope-funsai-lv1",
    start: { phase: "attack", me: { spirits: [{ card: HOPE }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("光の騎士ホープ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.光の騎士ホープ.疲労: false → true",
        "相手.デッキ枚数: 40 → 39",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-062: 【強襲：1】Lv2のアタックで自分のネクサス（摩天楼）を疲労させて回復する ===")
scenario({
    name: "hope-kyoshu-refresh",
    start: { phase: "attack", me: { spirits: [{ card: HOPE, cores: 2 }], nexuses: [{ card: MATENRO }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("光の騎士ホープ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // アタックで疲労しても【強襲】の回復で戻る（疲労の差分は出ない）。粉砕はLv2なので2枚
    expect: [
        "自分.旅団の摩天楼.疲労: false → true",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-062: ネクサスがなければ（条件を1つ外す）【強襲】で回復できない ===")
scenario({
    name: "hope-kyoshu-no-nexus",
    start: { phase: "attack", me: { spirits: [{ card: HOPE, cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("光の騎士ホープ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.光の騎士ホープ.疲労: false → true",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ BS19-064 十剣聖エグバード ═══
// Lv1･Lv2･Lv3『このスピリットのアタック時』相手のデッキを上から2枚破棄する。
// Lv2･Lv3『自分のアタックステップ』【強化】を持つ自分のスピリットがアタックしたとき、相手は赤のバーストを発動できない。
// 【合体時】Lv3『このスピリットの合体アタック時』このスピリットのコスト以下の相手のスピリット1体を破壊する。

console.log("=== BS19-064: アタック時、相手のデッキを上から2枚破棄 ===")
scenario({
    name: "egbard-deck-two",
    start: { phase: "attack", me: { spirits: [{ card: EGBARD }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("十剣聖エグバード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.十剣聖エグバード.疲労: false → true",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-064: Lv2で【強化】持ち（アドリアン）がアタックしたとき、相手は赤のバーストを発動できない ===")
scenario({
    name: "egbard-kyoka-attacker-blocks-burst",
    start: { phase: "attack", me: { spirits: [{ card: EGBARD, cores: 2 }, { card: ADRIAN }] }, opp: { burst: DOMINION_R } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("光の衛士アドリアン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.光の衛士アドリアン.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS19-064: アタックしたのが【強化】を持たないスピリットなら（条件を1つ外す）赤のバーストは発動できる ===")
scenario({
    name: "egbard-vanilla-attacker-burst-fires",
    start: { phase: "attack", me: { spirits: [{ card: EGBARD, cores: 2 }, { card: ROKU }] }, opp: { burst: DOMINION_R } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.バースト: 英雄皇ロード・ドラゴン・ドミニオン → なし",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.場所: なし → フィールド",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.疲労: なし → false",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.コア: なし → 1",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.Lv: なし → 1",
        "相手.英雄皇ロード・ドラゴン・ドミニオン.BP: なし → 5000",
    ],
})

console.log("=== BS19-064: 【合体時】Lv3の合体アタックで、コスト5以下の相手（メタルバーン＝コスト3）を破壊する ===")
scenario({
    name: "egbard-combined-destroy",
    start: {
        me: { spirits: [{ card: EGBARD, cores: 4 }], hand: [GYOKURUNE] },
        opp: { spirits: [{ card: METABURN }] },
    },
    steps(t) {
        // ダイレクトブレイヴ：エグバード（コスト5）に合体した状態で召喚。軽減[緑][青][青]のうち青1つでコスト4→支払い3
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("十剣聖エグバード") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("十剣聖エグバード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // 合体スピリットのシンボルはホスト（青1）＋ブレイヴ（青1）の合計2つ →
    // ブロックされなければライフは2減り、リザーブにはメタルバーンのコア1個＋ライフのコア2個が入る
    expect: [
        "自分.手札: ギョクリューン → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.十剣聖エグバード.BP: 7000 → 10000",
        "自分.十剣聖エグバード.疲労: false → true",
        "自分.ギョクリューン.場所: なし → 合体",
        "自分.ギョクリューン.疲労: なし → false",
        "自分.ギョクリューン.コア: なし → 0",
        "自分.ギョクリューン.Lv: なし → 1",
        "相手.デッキ枚数: 40 → 38",
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス、ロクケラトプス",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 13",
    ],
})

console.log("=== BS19-064: 合体スピリットのコストはエグバード5＋ギョクリューン4＝9なので、コスト6のウィンガルも破壊する ===")
scenario({
    name: "egbard-combined-cost6",
    start: {
        me: { spirits: [{ card: EGBARD, cores: 4 }], hand: [GYOKURUNE] },
        opp: { spirits: [{ card: WINGAL }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("十剣聖エグバード") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("十剣聖エグバード") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // 合体スピリットのコストはスピリットとブレイヴの合計（2026-11-09 ユーザー確認。効果文に断りが無い限り）
    // シンボルはホスト＋ブレイヴで2つ → ブロックされなければライフは2減る
    expect: [
        "自分.手札: ギョクリューン → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.十剣聖エグバード.BP: 7000 → 10000",
        "自分.十剣聖エグバード.疲労: false → true",
        "自分.ギョクリューン.場所: なし → 合体",
        "自分.ギョクリューン.疲労: なし → false",
        "自分.ギョクリューン.コア: なし → 0",
        "自分.ギョクリューン.Lv: なし → 1",
        "相手.デッキ枚数: 40 → 38",
        "相手.ウィンガル.場所: フィールド → なし",
        "相手.トラッシュ: なし → ウィンガル、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 13",
    ],
})

// ═══ BS19-065 異海女帝レスキュラ ═══
// Lv1･Lv2『このスピリットの召喚時』コスト5以下の相手のスピリット1体を破壊する。
// 【連鎖：条件《赤シンボル》】[赤]：自分のトラッシュにあるスピリットカード1枚を手札に戻す。

console.log("=== BS19-065: 召喚時にコスト5以下の相手（メタルバーン＝コスト3）を破壊し、連鎖[赤]でトラッシュのスピリットカードを手札に戻す ===")
scenario({
    name: "resqura-destroy-and-rensa",
    start: { me: { spirits: [{ card: ROKU }], hand: [RESQURA], trash: [ROKU] }, opp: { spirits: [{ card: METABURN }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // 軽減[青][青][青]に対して自分のシンボルは赤1つだけ → 支払い6＋維持コア1個
    expect: [
        "自分.手札: 異海女帝レスキュラ → ロクケラトプス",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.トラッシュ: ロクケラトプス → なし",
        "自分.異海女帝レスキュラ.場所: なし → フィールド",
        "自分.異海女帝レスキュラ.疲労: なし → false",
        "自分.異海女帝レスキュラ.コア: なし → 1",
        "自分.異海女帝レスキュラ.Lv: なし → 1",
        "自分.異海女帝レスキュラ.BP: なし → 5000",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-065: コスト5以下の相手がいなければ破壊は不発。連鎖は連鎖元のタイミングが来ていれば発揮する（Q773） ===")
scenario({
    name: "resqura-no-target-rensa-only",
    start: { me: { spirits: [{ card: ROKU }], hand: [RESQURA], trash: [ROKU] }, opp: { spirits: [{ card: WINGAL }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 異海女帝レスキュラ → ロクケラトプス",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.トラッシュ: ロクケラトプス → なし",
        "自分.異海女帝レスキュラ.場所: なし → フィールド",
        "自分.異海女帝レスキュラ.疲労: なし → false",
        "自分.異海女帝レスキュラ.コア: なし → 1",
        "自分.異海女帝レスキュラ.Lv: なし → 1",
        "自分.異海女帝レスキュラ.BP: なし → 5000",
    ],
})

console.log("=== BS19-065: 赤シンボルがなければ（条件を1つ外す）連鎖は発揮せず、トラッシュのカードは戻らない ===")
scenario({
    name: "resqura-no-red-symbol",
    start: { me: { hand: [RESQURA], trash: [ROKU] }, opp: { spirits: [{ card: METABURN }] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 異海女帝レスキュラ → なし",
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 6",
        "自分.異海女帝レスキュラ.場所: なし → フィールド",
        "自分.異海女帝レスキュラ.疲労: なし → false",
        "自分.異海女帝レスキュラ.コア: なし → 1",
        "自分.異海女帝レスキュラ.Lv: なし → 1",
        "自分.異海女帝レスキュラ.BP: なし → 5000",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン",
        "相手.リザーブ: 10 → 11",
    ],
})

// ═══ BS19-066 メイズ・ハイドラ ═══
// Lv1･Lv2 お互い、緑/白/黄のマジックカードを使用できない。
// Lv2 相手は、トラッシュのカードを手札に戻せない。
// 【連鎖：条件《赤シンボル》】[赤]：このスピリットに青のシンボル2つを追加する。

console.log("=== BS19-066: 緑のマジック（ギャザーフォース）は使えず、青のマジック（マジックハンマー）は使える ===")
scenario({
    name: "maze-ban-green-cast-blue",
    start: { me: { spirits: [{ card: MAZE }], hand: [GATHERFORCE, MAGICHAMMER] } },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "main" })
        t.act("me", { type: "castMagic", handIndex: 1, timing: "main" })
    },
    // マジックハンマーはコスト4・軽減[青][青]。メイズの青シンボル1つで支払い3
    expect: [
        "自分.手札: ギャザーフォース、マジックハンマー → ギャザーフォース",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → マジックハンマー",
        "相手.デッキ枚数: 40 → 35",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス、ロクケラトプス",
    ],
})

console.log("=== BS19-066: お互いに効く：相手もフラッシュで緑のマジック（バインディングソーン）を使えない ===")
scenario({
    name: "maze-ban-opp-flash",
    start: { phase: "attack", me: { spirits: [{ card: MAZE }, { card: ROKU }] }, opp: { hand: [BINDTHORN] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ロクケラトプス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== BS19-066: Lv2の間、相手はトラッシュのカードを手札に戻せない（リボーンフレイムの回収が不発） ===")
scenario({
    name: "maze-lv2-block-trash-return",
    start: { turn: "opp", me: { spirits: [{ card: MAZE, cores: 5 }] }, opp: { hand: [REBORNFLAME], trash: [ROKU] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    // マジックの使用自体（赤）は許される。トラッシュからロクケラトプスは戻らないまま
    expect: [
        "相手.手札: リボーンフレイム → なし",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: ロクケラトプス → リボーンフレイム、ロクケラトプス",
    ],
})

console.log("=== BS19-066: Lv1なら（条件を1つ外す）相手はトラッシュから手札に戻せる ===")
scenario({
    name: "maze-lv1-allow-trash-return",
    start: { turn: "opp", me: { spirits: [{ card: MAZE }] }, opp: { hand: [REBORNFLAME], trash: [ROKU] } },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
    },
    expect: [
        "相手.手札: リボーンフレイム → ロクケラトプス",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: ロクケラトプス → リボーンフレイム",
    ],
})

console.log("=== BS19-066: 連鎖[赤]：赤シンボルがある間、青シンボル2つが追加される（暴れトロルの軽減[青][青]が満ちて支払い0） ===")
scenario({
    name: "maze-rensa-two-blue-symbols",
    start: { me: { spirits: [{ card: MAZE }, { card: ROKU }], hand: [TROLL] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 暴れトロル → なし",
        "自分.リザーブ: 10 → 9",
        "自分.暴れトロル.場所: なし → フィールド",
        "自分.暴れトロル.疲労: なし → false",
        "自分.暴れトロル.コア: なし → 1",
        "自分.暴れトロル.Lv: なし → 1",
        "自分.暴れトロル.BP: なし → 3000",
    ],
})

console.log("=== BS19-066: 赤シンボルがなければ（条件を1つ外す）追加は無く、軽減は青1つぶんで支払い1 ===")
scenario({
    name: "maze-no-red-pay-one",
    start: { me: { spirits: [{ card: MAZE }], hand: [TROLL] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 暴れトロル → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        "自分.暴れトロル.場所: なし → フィールド",
        "自分.暴れトロル.疲労: なし → false",
        "自分.暴れトロル.コア: なし → 1",
        "自分.暴れトロル.Lv: なし → 1",
        "自分.暴れトロル.BP: なし → 3000",
    ],
})

// ═══ BS19-077 フェスキーナ・アームズ ═══
// Lv1『このブレイヴの召喚時』このターンの間、【強化】を持つ自分のスピリット1体を、そのスピリットが持つ最高Lvとして扱う。
// 合体条件：【強化】を持つ
// 【合体時】【粉砕】『このスピリットの合体アタック時』相手のデッキを上から、このスピリットのLvと同じ枚数破棄する。

console.log("=== BS19-077: 召喚時、【強化】を持つアドリアン（Lv1）をこのターン最高Lv（Lv2）として扱う ===")
scenario({
    name: "feski-summon-maxlv",
    start: { me: { spirits: [{ card: ADRIAN }], hand: [FESKIENA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 }) // スピリット状態で召喚
    },
    // コスト3・軽減[青][青]のうちアドリアンの青1つで支払い2＋維持コア1個
    expect: [
        "自分.手札: フェスキーナ・アームズ → なし",
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.光の衛士アドリアン.Lv: 1 → 2",
        "自分.光の衛士アドリアン.BP: 2000 → 3000",
        "自分.フェスキーナ・アームズ.場所: なし → フィールド",
        "自分.フェスキーナ・アームズ.疲労: なし → false",
        "自分.フェスキーナ・アームズ.コア: なし → 1",
        "自分.フェスキーナ・アームズ.Lv: なし → 1",
        "自分.フェスキーナ・アームズ.BP: なし → 3000",
    ],
})

console.log("=== BS19-077: 【強化】を持つスピリットがいなければ（条件を1つ外す）誰も最高Lv扱いにならない ===")
scenario({
    name: "feski-summon-no-kyoka",
    start: { me: { spirits: [{ card: ROKU }], hand: [FESKIENA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    // 自分のシンボルは赤1つのみ → 軽減0で支払い3＋維持コア1個
    expect: [
        "自分.手札: フェスキーナ・アームズ → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.フェスキーナ・アームズ.場所: なし → フィールド",
        "自分.フェスキーナ・アームズ.疲労: なし → false",
        "自分.フェスキーナ・アームズ.コア: なし → 1",
        "自分.フェスキーナ・アームズ.Lv: なし → 1",
        "自分.フェスキーナ・アームズ.BP: なし → 3000",
    ],
})

console.log("=== BS19-077: ダイレクトブレイヴでアドリアンに合体し、合体アタックで【粉砕】 ===")
scenario({
    name: "feski-direct-combine-funsai",
    start: { me: { spirits: [{ card: ADRIAN }], hand: [FESKIENA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("光の衛士アドリアン") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("光の衛士アドリアン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // 召喚時効果でアドリアンはこのターン最高LvのLv2扱い → 合体スピリットのLvは2。
    // 【粉砕】はLvと同じ2枚に、アドリアン自身の【強化】（デッキ破棄+1枚）が重なって3枚破棄になる
    // （合体条件が【強化】を持つなので、ホストの【強化】を外すことはできない。強化の+1枚は part726 の担当）
    expect: [
        "自分.手札: フェスキーナ・アームズ → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.光の衛士アドリアン.Lv: 1 → 2",
        "自分.光の衛士アドリアン.BP: 2000 → 6000",
        "自分.光の衛士アドリアン.疲労: false → true",
        "自分.フェスキーナ・アームズ.場所: なし → 合体",
        "自分.フェスキーナ・アームズ.疲労: なし → false",
        "自分.フェスキーナ・アームズ.コア: なし → 0",
        "自分.フェスキーナ・アームズ.Lv: なし → 1",
        "相手.デッキ枚数: 40 → 37",
        "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス、ロクケラトプス",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== BS19-077: 合体条件【強化】を持つ：ロクケラトプスには合体できない ===")
scenario({
    name: "feski-combine-rejected",
    start: { me: { spirits: [{ card: FESKIENA }, { card: ROKU }] } },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("フェスキーナ・アームズ"), hostInstanceId: t.id("ロクケラトプス") })
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part740）")
