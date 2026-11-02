// smoke パート749（SD10 赤A：SD10-007〜SD10-012。効果文と属性だけから書いた期待値。
// effects は未実装なので、効果が絡む行は今は落ちてよい。例外で止まらないこと）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

const FIRESTORM = "SD10-007" // 火旋竜ファイアーストーム（赤・スピリット・コスト4・星竜）
const ANNULLER = "SD10-008" // ドラゴン・アンヌラー（赤・スピリット・コスト4・星竜）
const SUNPILLAR = "SD10-009" // サンピラー・ドラゴン（赤・スピリット・コスト4・星竜）
const SUPERCELL = "SD10-010" // 荒天竜スーパーセル・ドラグーン（赤・スピリット・コスト5・星竜）
const DUSTWHIRL = "SD10-011" // ダストワール（赤・ブレイヴ・コスト3・星竜/機竜）
const MAGMACITY = "SD10-012" // 噴き上がるマグマの星都（赤・ネクサス・コスト3）

// 脇役
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ）
const HARDES = "BS01-031" // デス・ハーデス（紫・コスト3・呪鬼・バニラ。Lv1 BP4000/Lv2 BP7000）
const METALBURN = "BS01-008" // メタルバーン（赤・コスト3・機竜・バニラ。Lv1 BP3000）
const BATTLEFIELD = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3）
const PATIEL = "SD15-001" // 天使パティエル（黄・コスト2・天霊。【強化】（黄）持ち。合体条件の相手役）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    assert(c(FIRESTORM).name === "火旋竜ファイアーストーム" && c(FIRESTORM).type === "spirit" && c(FIRESTORM).colors.includes("red") && c(FIRESTORM).family.includes("星竜") && c(FIRESTORM).cost === 4, "SD10-007 は赤コスト4の星竜スピリット")
    assert(c(ANNULLER).name === "ドラゴン・アンヌラー" && c(ANNULLER).type === "spirit" && c(ANNULLER).colors.includes("red") && c(ANNULLER).family.includes("星竜") && c(ANNULLER).cost === 4, "SD10-008 は赤コスト4の星竜スピリット")
    assert(c(SUNPILLAR).name === "サンピラー・ドラゴン" && c(SUNPILLAR).type === "spirit" && c(SUNPILLAR).colors.includes("red") && c(SUNPILLAR).family.includes("星竜") && c(SUNPILLAR).cost === 4, "SD10-009 は赤コスト4の星竜スピリット")
    assert(c(SUPERCELL).name === "荒天竜スーパーセル・ドラグーン" && c(SUPERCELL).type === "spirit" && c(SUPERCELL).colors.includes("red") && c(SUPERCELL).family.includes("星竜") && c(SUPERCELL).cost === 5, "SD10-010 は赤コスト5の星竜スピリット")
    assert(c(DUSTWHIRL).name === "ダストワール" && c(DUSTWHIRL).type === "brave" && c(DUSTWHIRL).colors.includes("red") && c(DUSTWHIRL).family.includes("星竜") && c(DUSTWHIRL).cost === 3, "SD10-011 は赤コスト3の星竜ブレイヴ")
    assert(c(MAGMACITY).name === "噴き上がるマグマの星都" && c(MAGMACITY).type === "nexus" && c(MAGMACITY).colors.includes("red") && c(MAGMACITY).cost === 3, "SD10-012 は赤コスト3のネクサス")
    assert(c(VANILLA).name === "ロクケラトプス" && c(VANILLA).colors.includes("red") && c(VANILLA).family.includes("地竜") && c(VANILLA).cost === 1, "BS01-002 は赤コスト1の地竜（星竜ではない）")
    assert(c(HARDES).name === "デス・ハーデス" && c(HARDES).colors.includes("purple") && c(HARDES).family.includes("呪鬼") && c(HARDES).cost === 3, "BS01-031 は紫コスト3の呪鬼")
    assert(c(METALBURN).name === "メタルバーン" && c(METALBURN).colors.includes("red") && c(METALBURN).family.includes("機竜") && c(METALBURN).cost === 3, "BS01-008 は赤コスト3の機竜")
    assert(c(BATTLEFIELD).name === "燃えさかる戦場" && c(BATTLEFIELD).type === "nexus" && c(BATTLEFIELD).colors.includes("red") && c(BATTLEFIELD).cost === 3, "BS01-098 は赤コスト3のネクサス")
    assert(c(PATIEL).name === "天使パティエル" && c(PATIEL).type === "spirit" && c(PATIEL).colors.includes("yellow") && c(PATIEL).family.includes("天霊") && c(PATIEL).cost === 2, "SD15-001 は黄コスト2の天霊（【強化】持ち・星竜ではない）")
}

// ---------------------------------------------------------------------------
// SD10-007 火旋竜ファイアーストーム
// Lv1･Lv2･Lv3『このスピリットのアタック時』BP3000以下の相手のスピリット1体を破壊する。
// ---------------------------------------------------------------------------
scenario({
    name: "sd10_007_attack_destroy",
    start: {
        me: { spirits: [{ card: FIRESTORM }] },
        opp: { spirits: [{ card: VANILLA }, { card: HARDES }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "sd10_007_attack_too_high_bp",
    start: {
        me: { spirits: [{ card: FIRESTORM }] },
        opp: { spirits: [{ card: HARDES }] }, // Lv1 BP4000。3000以下に入らない
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ---------------------------------------------------------------------------
// SD10-008 ドラゴン・アンヌラー
// Lv1･Lv2『自分のアタックステップ』【強化】を持つ自分のスピリットすべてをBP+2000する。
// ---------------------------------------------------------------------------
scenario({
    name: "sd10_008_aura_own_attack_step",
    start: {
        me: { spirits: [{ card: ANNULLER, cores: 2 }, { card: VANILLA }] }, // Lv2＝【強化】持ち
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [
        "自分.ドラゴン・アンヌラー.BP: 4000 → 6000",
    ],
})

scenario({
    name: "sd10_008_aura_not_opp_attack_step",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: ANNULLER, cores: 2 }] },
    },
    steps(t) {},
    expect: [],
})

// Lv2【強化】自分の「BP破壊効果」の上限を+1000する。
scenario({
    name: "sd10_008_kyoka_raises_destroy_limit",
    start: {
        me: { spirits: [{ card: FIRESTORM }, { card: ANNULLER, cores: 2 }] },
        opp: { spirits: [{ card: HARDES }] }, // BP4000。強化で 3000+1000 に届く
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "自分.ドラゴン・アンヌラー.BP: 4000 → 6000",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "sd10_008_kyoka_lv1_not_active",
    start: {
        me: { spirits: [{ card: FIRESTORM }, { card: ANNULLER, cores: 1 }] }, // Lv1＝【強化】なし
        opp: { spirits: [{ card: HARDES }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ---------------------------------------------------------------------------
// SD10-009 サンピラー・ドラゴン
// Lv1･Lv2『このスピリットの召喚時』自分のトラッシュにある系統：「星竜」を持つ
// スピリットカード/ブレイヴカード1枚を手札に戻す。
// ---------------------------------------------------------------------------
scenario({
    name: "sd10_009_summon_return_seiryu",
    start: {
        me: { hand: [SUNPILLAR], trash: [FIRESTORM] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: サンピラー・ドラゴン → 火旋竜ファイアーストーム",
        "自分.トラッシュ: 火旋竜ファイアーストーム → なし",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 5",
        "自分.サンピラー・ドラゴン.場所: なし → フィールド",
        "自分.サンピラー・ドラゴン.疲労: なし → false",
        "自分.サンピラー・ドラゴン.コア: なし → 1",
        "自分.サンピラー・ドラゴン.Lv: なし → 1",
        "自分.サンピラー・ドラゴン.BP: なし → 2000",
    ],
})

scenario({
    name: "sd10_009_summon_no_seiryu_in_trash",
    start: {
        me: { hand: [SUNPILLAR], trash: [VANILLA] }, // 地竜であって星竜ではない
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: サンピラー・ドラゴン → なし",
        "自分.トラッシュのコア: 0 → 4",
        "自分.リザーブ: 10 → 5",
        "自分.サンピラー・ドラゴン.場所: なし → フィールド",
        "自分.サンピラー・ドラゴン.疲労: なし → false",
        "自分.サンピラー・ドラゴン.コア: なし → 1",
        "自分.サンピラー・ドラゴン.Lv: なし → 1",
        "自分.サンピラー・ドラゴン.BP: なし → 2000",
    ],
})

// Lv2【強化】アルティメット以外の自分の「BP破壊効果」の上限を+1000する。
scenario({
    name: "sd10_009_kyoka_raises_destroy_limit",
    start: {
        me: { spirits: [{ card: FIRESTORM }, { card: SUNPILLAR, cores: 3 }] }, // Lv2＝【強化】
        opp: { spirits: [{ card: HARDES }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "sd10_009_kyoka_lv1_not_active",
    start: {
        me: { spirits: [{ card: FIRESTORM }, { card: SUNPILLAR, cores: 1 }] }, // Lv1＝【強化】なし
        opp: { spirits: [{ card: HARDES }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
    ],
})

// ---------------------------------------------------------------------------
// SD10-010 荒天竜スーパーセル・ドラグーン
// Lv1･Lv2･Lv3『このスピリットの召喚時』BP4000以下の相手のスピリット2体を破壊する。
// ---------------------------------------------------------------------------
scenario({
    name: "sd10_010_summon_destroy_two",
    start: {
        me: { hand: [SUPERCELL] },
        opp: { spirits: [{ card: VANILLA }, { card: METALBURN }, { card: HARDES, cores: 4 }] }, // ハーデスはLv2 BP7000
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 荒天竜スーパーセル・ドラグーン → なし",
        "自分.トラッシュのコア: 0 → 5",
        "自分.リザーブ: 10 → 4",
        "自分.荒天竜スーパーセル・ドラグーン.場所: なし → フィールド",
        "自分.荒天竜スーパーセル・ドラグーン.疲労: なし → false",
        "自分.荒天竜スーパーセル・ドラグーン.コア: なし → 1",
        "自分.荒天竜スーパーセル・ドラグーン.Lv: なし → 1",
        "自分.荒天竜スーパーセル・ドラグーン.BP: なし → 4000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.メタルバーン.場所: フィールド → なし",
        "相手.トラッシュ: なし → メタルバーン、ロクケラトプス",
        "相手.リザーブ: 10 → 12",
    ],
})

scenario({
    name: "sd10_010_summon_all_too_high_bp",
    start: {
        me: { hand: [SUPERCELL] },
        opp: { spirits: [{ card: HARDES, cores: 4 }] }, // BP7000。4000以下に入らない
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 荒天竜スーパーセル・ドラグーン → なし",
        "自分.トラッシュのコア: 0 → 5",
        "自分.リザーブ: 10 → 4",
        "自分.荒天竜スーパーセル・ドラグーン.場所: なし → フィールド",
        "自分.荒天竜スーパーセル・ドラグーン.疲労: なし → false",
        "自分.荒天竜スーパーセル・ドラグーン.コア: なし → 1",
        "自分.荒天竜スーパーセル・ドラグーン.Lv: なし → 1",
        "自分.荒天竜スーパーセル・ドラグーン.BP: なし → 4000",
    ],
})

// Lv2･Lv3『このスピリットのアタック時』【強化】を持つ自分のスピリット1体につき、
// このスピリットをBP+2000する。
scenario({
    name: "sd10_010_attack_bp_per_kyoka",
    start: {
        me: { spirits: [{ card: SUPERCELL, cores: 3 }, { card: ANNULLER, cores: 2 }] }, // Lv2＋【強化】1体
        opp: { spirits: [{ card: HARDES, cores: 4 }] }, // BP7000でブロック
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("荒天竜スーパーセル・ドラグーン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("デス・ハーデス") })
        t.closeFlash()
    },
    expect: [
        "自分.荒天竜スーパーセル・ドラグーン.疲労: false → true",
        "自分.ドラゴン・アンヌラー.BP: 4000 → 6000",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 14",
    ],
})

scenario({
    name: "sd10_010_attack_no_kyoka_ally",
    start: {
        me: { spirits: [{ card: SUPERCELL, cores: 3 }] }, // 【強化】持ちがいない
        opp: { spirits: [{ card: HARDES, cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("荒天竜スーパーセル・ドラグーン") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("デス・ハーデス") })
        t.closeFlash()
    },
    expect: [
        "自分.荒天竜スーパーセル・ドラグーン.場所: フィールド → なし",
        "自分.トラッシュ: なし → 荒天竜スーパーセル・ドラグーン",
        "自分.リザーブ: 10 → 13",
        "相手.デス・ハーデス.疲労: false → true",
    ],
})

// Lv3『このスピリットのアタック時』相手のスピリット1体を指定し、そのスピリットにアタックできる。
scenario({
    name: "sd10_010_lv3_target_attack",
    start: {
        me: { spirits: [{ card: SUPERCELL, cores: 5 }] }, // Lv3
        opp: { spirits: [{ card: HARDES, rested: true }] }, // 疲労状態のBP4000も指定できる
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("荒天竜スーパーセル・ドラグーン"), targetSpiritInstanceId: t.id("デス・ハーデス") })
        t.closeFlash()
    },
    expect: [
        "自分.荒天竜スーパーセル・ドラグーン.疲労: false → true",
        "相手.デス・ハーデス.場所: フィールド → なし",
        "相手.トラッシュ: なし → デス・ハーデス",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "sd10_010_lv2_target_attack_rejected",
    start: {
        me: { spirits: [{ card: SUPERCELL, cores: 3 }] }, // Lv2＝指定アタック不可
        opp: { spirits: [{ card: HARDES }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("荒天竜スーパーセル・ドラグーン"), targetSpiritInstanceId: t.id("デス・ハーデス") })
    },
    expect: [],
})

// ---------------------------------------------------------------------------
// SD10-011 ダストワール
// Lv1『このブレイヴの召喚時』相手のネクサス1つを破壊する。
// ---------------------------------------------------------------------------
scenario({
    name: "sd10_011_summon_destroy_nexus",
    start: {
        me: { hand: [DUSTWHIRL] },
        opp: { nexuses: [{ card: BATTLEFIELD }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ダストワール → なし",
        "自分.トラッシュのコア: 0 → 3",
        "自分.リザーブ: 10 → 6",
        "自分.ダストワール.場所: なし → フィールド",
        "自分.ダストワール.疲労: なし → false",
        "自分.ダストワール.コア: なし → 1",
        "自分.ダストワール.Lv: なし → 1",
        "自分.ダストワール.BP: なし → 3000",
        "相手.燃えさかる戦場.場所: ネクサス → なし",
        "相手.トラッシュ: なし → 燃えさかる戦場",
        "相手.リザーブ: 10 → 11",
    ],
})

scenario({
    name: "sd10_011_summon_no_nexus",
    start: {
        me: { hand: [DUSTWHIRL] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ダストワール → なし",
        "自分.トラッシュのコア: 0 → 3",
        "自分.リザーブ: 10 → 6",
        "自分.ダストワール.場所: なし → フィールド",
        "自分.ダストワール.疲労: なし → false",
        "自分.ダストワール.コア: なし → 1",
        "自分.ダストワール.Lv: なし → 1",
        "自分.ダストワール.BP: なし → 3000",
    ],
})

// 合体条件：【強化】を持つ
scenario({
    name: "sd10_011_combine_to_kyoka_host",
    start: {
        me: { spirits: [{ card: PATIEL }, { card: DUSTWHIRL }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ダストワール"), hostInstanceId: t.id("天使パティエル") })
    },
    expect: [
        "自分.ダストワール.場所: フィールド → 合体",
        "自分.ダストワール.コア: 1 → 0",
        "自分.ダストワール.BP: 3000 → なし",
        "自分.天使パティエル.コア: 1 → 2",
        "自分.天使パティエル.BP: 3000 → 6000",
    ],
})

scenario({
    name: "sd10_011_combine_to_plain_host_rejected",
    start: {
        me: { spirits: [{ card: VANILLA }, { card: DUSTWHIRL }] }, // ロクケラトプスは【強化】を持たない
    },
    steps(t) {
        t.actRejected("me", { type: "combineBrave", braveInstanceId: t.id("ダストワール"), hostInstanceId: t.id("ロクケラトプス") })
    },
    expect: [],
})

// 【合体時】『このスピリットの合体アタック時』BP3000以下の相手のスピリット1体を破壊する。
scenario({
    name: "sd10_011_combined_attack_destroy",
    start: {
        me: { spirits: [{ card: PATIEL }, { card: DUSTWHIRL }] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("ダストワール"), hostInstanceId: t.id("天使パティエル") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("天使パティエル") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ダストワール.場所: フィールド → 合体",
        "自分.ダストワール.コア: 1 → 0",
        "自分.ダストワール.BP: 3000 → なし",
        "自分.天使パティエル.コア: 1 → 2",
        "自分.天使パティエル.BP: 3000 → 6000",
        "自分.天使パティエル.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "sd10_011_uncombined_attack_no_destroy",
    start: {
        me: { spirits: [{ card: DUSTWHIRL }] }, // スピリット状態＝【合体時】は発揮しない
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ダストワール") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ダストワール.疲労: false → true",
    ],
})

// ---------------------------------------------------------------------------
// SD10-012 噴き上がるマグマの星都
// Lv1･Lv2『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットすべてをBP+2000する。
// ---------------------------------------------------------------------------
scenario({
    name: "sd10_012_aura_seiryu_own_attack_step",
    start: {
        me: {
            nexuses: [{ card: MAGMACITY }],
            spirits: [{ card: FIRESTORM }, { card: VANILLA }], // ロクケラトプスは星竜ではない
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.BP: 3000 → 5000",
    ],
})

scenario({
    name: "sd10_012_aura_not_opp_attack_step",
    start: {
        turn: "opp",
        phase: "attack",
        me: { nexuses: [{ card: MAGMACITY }], spirits: [{ card: FIRESTORM }] },
    },
    steps(t) {},
    expect: [],
})

// Lv2『お互いのアタックステップ』自分のスピリットの効果で相手のスピリットを破壊したとき、
// 自分はデッキから1枚ドローする。
scenario({
    name: "sd10_012_lv2_draw_on_effect_destroy",
    start: {
        me: { nexuses: [{ card: MAGMACITY, cores: 2 }], spirits: [{ card: FIRESTORM }] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "自分.火旋竜ファイアーストーム.BP: 3000 → 5000",
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

scenario({
    name: "sd10_012_lv1_no_draw",
    start: {
        me: { nexuses: [{ card: MAGMACITY, cores: 1 }], spirits: [{ card: FIRESTORM }] }, // Lv1
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("火旋竜ファイアーストーム") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.火旋竜ファイアーストーム.疲労: false → true",
        "自分.火旋竜ファイアーストーム.BP: 3000 → 5000",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 12",
        "相手.ライフ: 5 → 4",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part749）")
