// smoke パート754（SD11 white：SD11-004〜011 の期待値。docs/design/STARTER_PLAN.md §2・BS19_PLAN.md §2・STARTER_SURVEY_white.md §3）
// 疲労ブロック・ブロック時BP+・召喚時バウンス＋【連鎖：緑】・【重装甲：赤/青】・『相手のアタックステップ』の白全体BP+・
// 必須アタック・『ブロック時』効果の『アタック時』発揮・バトル勝利時ライフ減らし＋バースト封じ・色の置き換え・
// 合体アタック時の「疲労させることで回復」・ブレイヴ召喚時のネクサス・バウンスと【合体時】回復を、
// 効果文だけから期待値として書く（effects はまだ空でよい）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ▼ 主役8枚（効果文と属性は data/cards/STARTER-white.json で確認済み）
const RHINO = "SD11-004" // ライノゴルド（白・スピリット・コスト3・機獣）Lv1-3疲労ブロック可＋Lv2-3ブロック時BP+3000
const GADO = "SD11-005" // ダーク・ガドファント（白・スピリット・コスト3・機獣）召喚時BP2000以下バウンス＋【連鎖：緑】コア1個＋Lv2【重装甲：赤/青】
const FALCO = "SD11-006" // ブラン・ファルコン（白・スピリット・コスト4・機獣）『相手のアタックステップ』自分の白すべてBP+2000
const BEAR = "SD11-007" // ベア・ポーラー（白・スピリット・コスト4・機獣）『相手のアタックステップ』必須アタック＋Lv2ブロック時BP+3000＋【連鎖：緑】疲労
const MONKEY = "SD11-008" // ワイズ・モンキー（白・スピリット・コスト5・機獣）『自分のアタックステップ』機獣の『ブロック時』効果は『アタック時』に発揮
const JACKAL = "SD11-009" // 猟機獣シルバー・ジャッカル（白・スピリット・コスト6・機獣）ブロック時バトル勝利でライフ減らし＋【連鎖：緑】バースト封じ
const URANOS = "SD11-010" // ダーク・ウラノス（白・スピリット・コスト6・機獣/遊精）Lv2-3緑として扱う＋【合体時】合体アタック時疲労させることで回復＋【連鎖：緑】コア1個
const GANNET = "SD11-011" // ジェット・ガネット（白・ブレイヴ・コスト3・機獣・合体条件コスト4以上）召喚時ネクサス・バウンス＋【合体時】BP4000以上アタックで回復

// ▼ 脇役（data/cards/*.json から選んだバニラ等。属性を先頭で確認する）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ）BP1000
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・殻虫・バニラ）BP1000 → 自分の緑シンボル
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・巨獣・バニラ）BP4000 → 相手のアタッカー/ブロッカー
const KAMOME = "BS10-024" // カモメーヴェ（緑・コスト3・爪鳥・バニラ）BP4000（Lv2で5000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・機竜・バニラ）BP3000 → BP2000超のバウンス不可対象
const VAJU = "BS17-007" // ヴァジュランガ（赤・コスト6・皇獣・バニラ）Lv2 BP10000 → BP7000以上の疲労対象/勝てないアタッカー
const NEXUS = "BS17-066" // 聖者の樹の実（緑・コスト4・ネクサス）→ バウンスされるネクサス
const ARDA = "BS17-073" // アーダーフレイム（赤・コスト4・マジック）フラッシュ：BP4000以下の相手のスピリット1体を破壊する → 【重装甲】で防ぐ赤マジック
const BENKEI = "BS14-030" // グラント・ベンケイ（緑・コスト5・スピリット）【バースト：自分のライフ減少後】相手は手札1枚を破棄し、このカードを手札に戻す

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    assert(c(RHINO).name === "ライノゴルド" && c(RHINO).type === "spirit" && c(RHINO).colors[0] === "white" && c(RHINO).cost === 3 && c(RHINO).family.includes("機獣"), "RHINOは白コスト3の機獣")
    assert(c(GADO).name === "ダーク・ガドファント" && c(GADO).type === "spirit" && c(GADO).colors[0] === "white" && c(GADO).cost === 3 && c(GADO).family.includes("機獣"), "GADOは白コスト3の機獣")
    assert(c(FALCO).name === "ブラン・ファルコン" && c(FALCO).type === "spirit" && c(FALCO).colors[0] === "white" && c(FALCO).cost === 4 && c(FALCO).family.includes("機獣"), "FALCOは白コスト4の機獣")
    assert(c(BEAR).name === "ベア・ポーラー" && c(BEAR).type === "spirit" && c(BEAR).colors[0] === "white" && c(BEAR).cost === 4 && c(BEAR).family.includes("機獣"), "BEARは白コスト4の機獣")
    assert(c(MONKEY).name === "ワイズ・モンキー" && c(MONKEY).type === "spirit" && c(MONKEY).colors[0] === "white" && c(MONKEY).cost === 5 && c(MONKEY).family.includes("機獣"), "MONKEYは白コスト5の機獣")
    assert(c(JACKAL).name === "猟機獣シルバー・ジャッカル" && c(JACKAL).type === "spirit" && c(JACKAL).colors[0] === "white" && c(JACKAL).cost === 6 && c(JACKAL).family.includes("機獣"), "JACKALは白コスト6の機獣")
    assert(c(URANOS).name === "ダーク・ウラノス" && c(URANOS).type === "spirit" && c(URANOS).colors[0] === "white" && c(URANOS).cost === 6 && c(URANOS).family.includes("機獣") && c(URANOS).family.includes("遊精"), "URANOSは白コスト6の機獣/遊精")
    assert(c(GANNET).name === "ジェット・ガネット" && c(GANNET).type === "brave" && c(GANNET).colors[0] === "white" && c(GANNET).cost === 3 && c(GANNET).family.includes("機獣"), "GANNETは白コスト3の機獣ブレイヴ")
    assert(c(ROKU).name === "ロクケラトプス" && c(ROKU).colors[0] === "red" && c(ROKU).family.includes("地竜") && c(ROKU).cost === 1, "ROKUは赤コスト1の地竜")
    assert(c(BEETLE).name === "ビートビートル" && c(BEETLE).colors[0] === "green" && c(BEETLE).family.includes("殻虫") && c(BEETLE).cost === 0, "BEETLEは緑コスト0の殻虫")
    assert(c(HERA).name === "ヘラクレス・ジオ" && c(HERA).colors[0] === "green" && c(HERA).family.includes("巨獣") && c(HERA).cost === 3, "HERAは緑コスト3の巨獣")
    assert(c(KAMOME).name === "カモメーヴェ" && c(KAMOME).colors[0] === "green" && c(KAMOME).family.includes("爪鳥") && c(KAMOME).cost === 3, "KAMOMEは緑コスト3の爪鳥")
    assert(c(METAL).name === "メタルバーン" && c(METAL).colors[0] === "red" && c(METAL).family.includes("機竜") && c(METAL).cost === 3, "METALは赤コスト3の機竜")
    assert(c(VAJU).name === "ヴァジュランガ" && c(VAJU).colors[0] === "red" && c(VAJU).family.includes("皇獣") && c(VAJU).cost === 6, "VAJUは赤コスト6の皇獣")
    assert(c(NEXUS).name === "聖者の樹の実" && c(NEXUS).type === "nexus" && c(NEXUS).colors[0] === "green" && c(NEXUS).cost === 4, "NEXUSは緑コスト4のネクサス")
    assert(c(ARDA).name === "アーダーフレイム" && c(ARDA).type === "magic" && c(ARDA).colors[0] === "red" && c(ARDA).cost === 4, "ARDAは赤コスト4のマジック")
    assert(c(BENKEI).name === "グラント・ベンケイ" && c(BENKEI).type === "spirit" && c(BENKEI).colors[0] === "green" && c(BENKEI).cost === 5, "BENKEIは緑コスト5のスピリット")
}

// ─── SD11-004 Lv1〜3：疲労状態でブロックできる（キーワード単独：働く場面1件）───
// 疲労状態のライノゴルドがブロックを宣言できる。BP3000 vs BP1000 でアタッカーが破壊される
scenario({
    name: "sd11_004_block_while_rested",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: RHINO, label: "ライノ", cores: 1, rested: true }] },
        opp: { spirits: [{ card: ROKU, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ライノ") }) // 疲労状態でもブロックできる
        t.closeFlash()
    },
    expect: [
        "相手.ロク.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-004 Lv2･Lv3『ブロック時』BP+3000：起きる場面 ───
// Lv2（BP4000）でブロック → バトルの間 BP+3000（7000）になり BP4000 のアタッカーを破壊する
scenario({
    name: "sd11_004_block_bp_plus",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: RHINO, label: "ライノ", cores: 2 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ライノ") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
        "自分.ライノ.疲労: false → true",
    ],
})

// ─── SD11-004『ブロック時』起きない場面：Lv1 では発揮しない（条件を1つ外す）───
// Lv1（BP3000）は『ブロック時』効果の対象Lvでない → BP+3000 されず BP4000 に破壊される
scenario({
    name: "sd11_004_lv1_no_bp_plus",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: RHINO, label: "ライノ", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ライノ") })
        t.closeFlash()
    },
    expect: [
        "自分.ライノ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ライノゴルド",
        "自分.リザーブ: 10 → 11",
        "相手.ヘラ.疲労: false → true",
    ],
})

// ─── SD11-005『召喚時』BP2000以下バウンス＋【連鎖：緑】：起きる場面 ───
// 緑シンボル（ビートビートル）があるので連鎖も発揮：ボイドからコア1個がガドファントに載る（Lv2になる）。
// 白シンボルが場にないのでコスト3の軽減はない
scenario({
    name: "sd11_005_summon_bounce_and_rensa",
    start: {
        me: { hand: [GADO], spirits: [{ card: BEETLE, label: "ビートル", cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ダーク・ガドファント → なし",
        "自分.ダーク・ガドファント.場所: なし → フィールド",
        "自分.ダーク・ガドファント.コア: なし → 2",
        "自分.ダーク・ガドファント.Lv: なし → 2",
        "自分.ダーク・ガドファント.疲労: なし → false",
        "自分.ダーク・ガドファント.BP: なし → 4000",
        "相手.ロク.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-005『召喚時』起きない場面：相手がBP2000超（条件を1つ外す）───
// BP3000 のメタルバーンは戻らない。緑シンボルも白シンボルもないので連鎖も軽減もない
scenario({
    name: "sd11_005_bounce_needs_bp2000_or_less",
    start: {
        me: { hand: [GADO] },
        opp: { spirits: [{ card: METAL, label: "メタル", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ダーク・ガドファント → なし",
        "自分.ダーク・ガドファント.場所: なし → フィールド",
        "自分.ダーク・ガドファント.コア: なし → 1",
        "自分.ダーク・ガドファント.Lv: なし → 1",
        "自分.ダーク・ガドファント.疲労: なし → false",
        "自分.ダーク・ガドファント.BP: なし → 3000",
    ],
})

// ─── SD11-005【連鎖】起きない場面：自分の緑シンボルがない（条件を1つ外す）───
// 赤のロクケラトプスだけでは緑シンボルにならない → ボイドからコアは載らない
scenario({
    name: "sd11_005_rensa_needs_green_symbol",
    start: {
        me: { hand: [GADO], spirits: [{ card: ROKU, label: "ロク", cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "相手ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ダーク・ガドファント → なし",
        "自分.ダーク・ガドファント.場所: なし → フィールド",
        "自分.ダーク・ガドファント.コア: なし → 1",
        "自分.ダーク・ガドファント.Lv: なし → 1",
        "自分.ダーク・ガドファント.疲労: なし → false",
        "自分.ダーク・ガドファント.BP: なし → 3000",
        "相手.相手ロク.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-005 Lv2【重装甲：赤/青】：相手の赤マジックを受けない（働く場面1件）───
// Lv2（BP4000）のガドファントはアーダーフレイム（赤・BP4000以下破壊）で破壊されない。
// アタッカーが生き残るので直接攻撃になり相手のライフが減る
scenario({
    name: "sd11_005_heavy_armor_blocks_red_magic",
    start: {
        me: { spirits: [{ card: GADO, label: "ガドファント", cores: 2 }] },
        opp: { hand: [ARDA] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガドファント") })
        // 【重装甲】の相手は対象に選べず、使用そのものが拒否される（SEMANTICS_AUDIT §3.20。2026-11-02 期待値を改めた）
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ガドファント") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ガドファント.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-005【重装甲】起きない場面：Lv1 では【重装甲】がない（条件を1つ外す）───
// Lv1（BP3000）は赤マジックで破壊される。アタッカーがいなくなったのでライフは減らない
scenario({
    name: "sd11_005_lv1_destroyed_by_red_magic",
    start: {
        me: { spirits: [{ card: GADO, label: "ガドファント", cores: 1 }] },
        opp: { hand: [ARDA] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガドファント") })
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ガドファント") })
        t.closeFlash()
    },
    expect: [
        "自分.ガドファント.場所: フィールド → なし",
        "自分.トラッシュ: なし → ダーク・ガドファント",
        "自分.リザーブ: 10 → 11",
        "相手.手札: アーダーフレイム → なし",
        "相手.トラッシュ: なし → アーダーフレイム",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 4",
    ],
})

// ─── SD11-006『相手のアタックステップ』自分の白すべてBP+2000：起きる場面 ───
// Lv1（BP3000）がBP+2000（5000）になり BP4000 のアタッカーを破壊する。
// 相手のアタックステップの間は BP5000 のまま
scenario({
    name: "sd11_006_opp_attack_step_bp_plus",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: FALCO, label: "ファルコン", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ファルコン") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
        "自分.ファルコン.疲労: false → true",
        "自分.ファルコン.BP: 3000 → 5000",
    ],
})

// ─── SD11-006 起きない場面：白でないスピリットはBP+2000されない（条件を1つ外す）───
// 赤のメタルバーン（BP3000）は加算されず BP4000 に破壊される。白のファルコンは加算される
scenario({
    name: "sd11_006_white_only",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: FALCO, label: "ファルコン", cores: 1 }, { card: METAL, label: "メタル", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("メタル") })
        t.closeFlash()
    },
    expect: [
        "自分.メタル.場所: フィールド → なし",
        "自分.トラッシュ: なし → メタルバーン",
        "自分.リザーブ: 10 → 11",
        "自分.ファルコン.BP: 3000 → 5000",
        "相手.ヘラ.疲労: false → true",
    ],
})

// ─── SD11-007『相手のアタックステップ』必須アタック：起きる場面 ───
// アタックできるスピリットがいるのにアタックせずターンを終えようとする → 拒否される
scenario({
    name: "sd11_007_must_attack",
    start: {
        turn: "opp",
        phase: "main",
        me: { spirits: [{ card: BEAR, label: "ポーラー", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.actRejected("opp", { type: "endTurn" }) // 1回もアタックしていないので終われない
    },
    expect: [],
})

// ─── SD11-007 必須アタック起きない場面：ポーラーがいない（条件を1つ外す）───
// 同じ盤面でもベア・ポーラーがなければアタックせずにターンを終えられる。
// ターンが自分に移り、自分はドローする
scenario({
    name: "sd11_007_must_attack_off",
    start: {
        turn: "opp",
        phase: "main",
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "endTurn" })
    },
    expect: [
        "自分.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ],
})

// ─── SD11-007 Lv2『ブロック時』BP+3000：起きる場面 ───
// Lv2（BP4000）でブロック → BP+3000（7000）で BP4000 のアタッカーを破壊する
scenario({
    name: "sd11_007_block_bp_plus",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: BEAR, label: "ポーラー", cores: 3 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ポーラー") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
        "自分.ポーラー.疲労: false → true",
    ],
})

// ─── SD11-007【連鎖：緑】相手のスピリット1体を疲労させる：起きる場面 ───
// Lv2でブロック（連鎖元の発揮タイミング）＋緑シンボル（ビートビートル）→
// 相手のスピリット1体（カモメーヴェ）を疲労させる。対象は対話で選ぶ
scenario({
    name: "sd11_007_rensa_exhaust",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: { spirits: [{ card: BEAR, label: "ポーラー", cores: 3 }, { card: BEETLE, label: "ビートル", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }, { card: KAMOME, label: "カモメ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ポーラー") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
        "相手.カモメ.疲労: false → true",
        "自分.ポーラー.疲労: false → true",
    ],
})

// ─── SD11-007【連鎖】起きない場面：自分の緑シンボルがない（条件を1つ外す）───
// 赤のロクケラトプスでは緑シンボルにならない → カモメーヴェは疲労しない
scenario({
    name: "sd11_007_rensa_needs_green_symbol",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: BEAR, label: "ポーラー", cores: 3 }, { card: ROKU, label: "ロク", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }, { card: KAMOME, label: "カモメ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ポーラー") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.リザーブ: 10 → 11",
        "自分.ポーラー.疲労: false → true",
    ],
})

// ─── SD11-008『自分のアタックステップ』機獣の『ブロック時』効果が『アタック時』に発揮：起きる場面 ───
// 機獣のライノゴルド（Lv2・ブロック時BP+3000）がアタックすると『アタック時』にBP+3000（7000）。
// BP5000 のブロッカーを破壊する
scenario({
    name: "sd11_008_block_effect_as_attack",
    start: {
        me: { spirits: [{ card: MONKEY, label: "モンキー", cores: 1 }, { card: RHINO, label: "ライノ", cores: 2 }] },
        opp: { spirits: [{ card: KAMOME, label: "カモメ", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ライノ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("カモメ") })
        t.closeFlash()
    },
    expect: [
        "相手.カモメ.場所: フィールド → なし",
        "相手.トラッシュ: なし → カモメーヴェ",
        "相手.リザーブ: 10 → 12",
        "自分.ライノ.疲労: false → true",
    ],
})

// ─── SD11-008 起きない場面：ワイズ・モンキーがいない（条件を1つ外す）───
// 『ブロック時』効果はアタック時には発揮されない → BP4000 のまま BP5000 に破壊される
scenario({
    name: "sd11_008_off_without_monkey",
    start: {
        me: { spirits: [{ card: RHINO, label: "ライノ", cores: 2 }] },
        opp: { spirits: [{ card: KAMOME, label: "カモメ", cores: 2 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ライノ") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("カモメ") })
        t.closeFlash()
    },
    expect: [
        "自分.ライノ.場所: フィールド → なし",
        "自分.トラッシュ: なし → ライノゴルド",
        "自分.リザーブ: 10 → 12",
        "相手.カモメ.疲労: false → true",
    ],
})

// ─── SD11-009『ブロック時』バトル勝利でライフ減らし：起きる場面 ───
// Lv2（BP7000）で BP4000 のアタッカーだけを破壊した → 相手のライフのコア1個が相手のリザーブへ。
// 破壊したヘラクレス・ジオのコアもリザーブに戻る
scenario({
    name: "sd11_009_battle_win_life_crush",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: JACKAL, label: "ジャッカル", cores: 2 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャッカル") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
        "自分.ジャッカル.疲労: false → true",
    ],
})

// ─── SD11-009 起きない場面：バトルに負ける（条件を1つ外す）───
// BP10000 には勝てない → ジャッカルが破壊され、ライフは減らない
scenario({
    name: "sd11_009_lose_no_life_crush",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: JACKAL, label: "ジャッカル", cores: 2 }] },
        opp: { spirits: [{ card: VAJU, label: "ヴァジュ", cores: 3 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヴァジュ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャッカル") })
        t.closeFlash()
    },
    expect: [
        "自分.ジャッカル.場所: フィールド → なし",
        "自分.トラッシュ: なし → 猟機獣シルバー・ジャッカル",
        "自分.リザーブ: 10 → 12",
        "相手.ヴァジュ.疲労: false → true",
    ],
})

// ─── SD11-009【連鎖：緑】相手はバーストを発動できない：起きる場面 ───
// 緑シンボル（ビートビートル）があるので、勝利したこのバトルが終わるまで相手のバースト
// （ライフ減少後のグラント・ベンケイ）は発動できない
scenario({
    name: "sd11_009_rensa_burst_lock",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: JACKAL, label: "ジャッカル", cores: 2 }, { card: BEETLE, label: "ビートル", cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }], burst: BENKEI },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャッカル") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
        "自分.ジャッカル.疲労: false → true",
    ],
})

// ─── SD11-009【連鎖】起きない場面：自分の緑シンボルがない（条件を1つ外す）───
// バースト封じがなければ、ライフ減少後のバーストが発動する：自分は手札1枚を破棄し、
// バーストカードは相手の手札に戻る
scenario({
    name: "sd11_009_rensa_off_burst_fires",
    start: {
        turn: "opp",
        phase: "attack",
        me: { hand: [ROKU], spirits: [{ card: JACKAL, label: "ジャッカル", cores: 2 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }], burst: BENKEI },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャッカル") })
        t.closeFlash()
    },
    expect: [
        "相手.ヘラ.場所: フィールド → なし",
        "相手.トラッシュ: なし → ヘラクレス・ジオ",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 12",
        "相手.バースト: グラント・ベンケイ → なし",
        "相手.手札: なし → グラント・ベンケイ",
        "自分.ジャッカル.疲労: false → true",
        "自分.手札: ロクケラトプス → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
    ],
})

// ─── SD11-010 Lv2･Lv3：緑のスピリットとしても扱う：起きる場面 ───
// Lv2のウラノスは緑のシンボルとしても数える → ダーク・ガドファントの【連鎖：緑】が発揮し、
// ボイドからコア1個が載る（Lv2になる）。白シンボル1つでコスト3は1軽減
scenario({
    name: "sd11_010_treated_as_green",
    start: {
        me: { hand: [GADO], spirits: [{ card: URANOS, label: "ウラノス", cores: 2 }] },
        opp: { spirits: [{ card: ROKU, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ダーク・ガドファント → なし",
        "自分.ダーク・ガドファント.場所: なし → フィールド",
        "自分.ダーク・ガドファント.コア: なし → 2",
        "自分.ダーク・ガドファント.Lv: なし → 2",
        "自分.ダーク・ガドファント.疲労: なし → false",
        "自分.ダーク・ガドファント.BP: なし → 4000",
        "相手.ロク.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-010 起きない場面：Lv1 では緑として扱わない（条件を1つ外す）───
// Lv1のウラノスは緑シンボルにならない → 連鎖は発揮せずコアは載らない
scenario({
    name: "sd11_010_lv1_not_green",
    start: {
        me: { hand: [GADO], spirits: [{ card: URANOS, label: "ウラノス", cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ダーク・ガドファント → なし",
        "自分.ダーク・ガドファント.場所: なし → フィールド",
        "自分.ダーク・ガドファント.コア: なし → 1",
        "自分.ダーク・ガドファント.Lv: なし → 1",
        "自分.ダーク・ガドファント.疲労: なし → false",
        "自分.ダーク・ガドファント.BP: なし → 3000",
        "相手.ロク.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-010【合体時】合体アタック時「疲労させることで回復」＋【連鎖：緑】：起きる場面 ───
// ジェット・ガネットをダイレクト合体（白シンボル1つでコスト3は1軽減・維持コアなし）。
// 合体アタック時：BP10000 のヴァジュランガを疲労させることでウラノスは回復する（疲労したままにならない）。
// Lv2のウラノスは緑としても扱うので自分の緑シンボルがあり、連鎖でボイドからコア1個が
// 自分のスピリット（ここではウラノスだけ）に載る。疲労したヴァジュランガはブロックできず直接攻撃
scenario({
    name: "sd11_010_combined_attack_exhaust_refresh",
    start: {
        me: { hand: [GANNET], spirits: [{ card: URANOS, label: "ウラノス", cores: 2 }] },
        opp: { spirits: [{ card: VAJU, label: "ヴァジュ", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ウラノス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ウラノス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ジェット・ガネット → なし",
        "自分.ジェット・ガネット.場所: なし → 合体",
        "自分.ジェット・ガネット.コア: なし → 0",
        "自分.ジェット・ガネット.Lv: なし → 1",
        "自分.ジェット・ガネット.疲労: なし → false",
        "自分.ウラノス.コア: 2 → 3",
        "自分.ウラノス.BP: 7000 → 11000",
        "相手.ヴァジュ.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-010【合体時】起きない場面：BP7000以上の相手がいない（条件を1つ外す）───
// 疲労させる相手がいないのでコストを払えず回復もしない（ウラノスは疲労したまま）。
// 連鎖は連鎖元の発揮タイミング（合体アタック時）が来ていれば発揮する（Q773）のでコアは載る
scenario({
    name: "sd11_010_combined_attack_no_target",
    start: {
        me: { hand: [GANNET], spirits: [{ card: URANOS, label: "ウラノス", cores: 2 }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ウラノス") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ウラノス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ジェット・ガネット → なし",
        "自分.ジェット・ガネット.場所: なし → 合体",
        "自分.ジェット・ガネット.コア: なし → 0",
        "自分.ジェット・ガネット.Lv: なし → 1",
        "自分.ジェット・ガネット.疲労: なし → false",
        "自分.ウラノス.コア: 2 → 3",
        "自分.ウラノス.疲労: false → true",
        "自分.ウラノス.BP: 7000 → 11000",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-011『このブレイヴの召喚時』相手のネクサス1つを手札に戻す：起きる場面 ───
// スピリット状態で召喚（白シンボルが場にないので軽減なし）。相手のネクサスが手札に戻り、
// ネクサスのコアは相手のリザーブへ
scenario({
    name: "sd11_011_summon_bounce_nexus",
    start: {
        me: { hand: [GANNET] },
        opp: { nexuses: [{ card: NEXUS, label: "樹の実", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ジェット・ガネット → なし",
        "自分.ジェット・ガネット.場所: なし → フィールド",
        "自分.ジェット・ガネット.コア: なし → 1",
        "自分.ジェット・ガネット.Lv: なし → 1",
        "自分.ジェット・ガネット.疲労: なし → false",
        "自分.ジェット・ガネット.BP: なし → 3000",
        "相手.樹の実.場所: ネクサス → なし",
        "相手.手札: なし → 聖者の樹の実",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD11-011『召喚時』起きない場面：相手のネクサスがない（条件を1つ外す）───
// 自分のネクサスは「相手のネクサス1つ」に当たらない → 何も戻らない
scenario({
    name: "sd11_011_no_opponent_nexus",
    start: {
        me: { hand: [GANNET], nexuses: [{ card: NEXUS, label: "樹の実", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ジェット・ガネット → なし",
        "自分.ジェット・ガネット.場所: なし → フィールド",
        "自分.ジェット・ガネット.コア: なし → 1",
        "自分.ジェット・ガネット.Lv: なし → 1",
        "自分.ジェット・ガネット.疲労: なし → false",
        "自分.ジェット・ガネット.BP: なし → 3000",
    ],
})

// ─── SD11-011【合体時】BP4000以上のアタックで回復：起きる場面 ───
// 疲労状態のファルコンにダイレクト合体（白シンボル1つでコスト3は1軽減）し、ターンを終える。
// 相手のアタックステップで BP4000 のヘラクレス・ジオがアタックしたとき合体スピリットは回復する。
// 回復してもブロックせず直接攻撃を受ける
scenario({
    name: "sd11_011_combined_refresh_on_attack",
    start: {
        me: { hand: [GANNET], spirits: [{ card: FALCO, label: "ファルコン", cores: 1, rested: true }] },
        opp: { spirits: [{ card: HERA, label: "ヘラ", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ファルコン") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ヘラ") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ジェット・ガネット → なし",
        "自分.ジェット・ガネット.場所: なし → 合体",
        "自分.ジェット・ガネット.コア: なし → 0",
        "自分.ジェット・ガネット.Lv: なし → 1",
        "自分.ジェット・ガネット.疲労: なし → false",
        "自分.ファルコン.疲労: true → false",
        "自分.ファルコン.BP: 3000 → 9000",
        "自分.ライフ: 5 → 4",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ヘラ.疲労: false → true",
    ],
})

// ─── SD11-011【合体時】起きない場面：アタッカーがBP4000未満（条件を1つ外す）───
// BP1000 のロクケラトプスのアタックでは回復しない → 合体スピリットは疲労したまま
scenario({
    name: "sd11_011_combined_no_refresh_low_bp",
    start: {
        me: { hand: [GANNET], spirits: [{ card: FALCO, label: "ファルコン", cores: 1, rested: true }] },
        opp: { spirits: [{ card: ROKU, label: "ロク", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ファルコン") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ジェット・ガネット → なし",
        "自分.ジェット・ガネット.場所: なし → 合体",
        "自分.ジェット・ガネット.コア: なし → 0",
        "自分.ジェット・ガネット.Lv: なし → 1",
        "自分.ジェット・ガネット.疲労: なし → false",
        "自分.ファルコン.BP: 3000 → 9000",
        "自分.ライフ: 5 → 4",
        "相手.デッキ枚数: 40 → 39",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ロク.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part754）")
