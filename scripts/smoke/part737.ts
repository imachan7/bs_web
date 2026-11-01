// smoke パート737（BS19 white 8枚：BS19-074/088/089/090/106/107/108/X04）
// 効果文と属性だけから期待値を書いた実装前テスト（docs/design/BS19_PLAN.md §2・SEMANTICS_AUDIT §3.23〜3.25・PROMO_PLAN §2）。
// 【強化】の行は扱わない（part726）。090 Lv2 の「【連鎖】持ちが破壊された」起きる場面は、
// 既存の弾に【連鎖】を持つスピリットがいないため未カバー（起きない場面のみ。報告参照）。
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ---------- 対象8枚 ----------
const ARKWIDRY = "BS19-074" // 砲獣アークィドリー（白ブレイヴ・機獣・コスト4）
const ICECAVERN = "BS19-088" // 獣の氷窟（白ネクサス・コスト4）
const FORTRESSCUBE = "BS19-089" // フォートレスキューブ（白ネクサス・コスト4）
const FROSTTOWER = "BS19-090" // 凍てつくつららの逆塔（白/緑ネクサス・コスト5）
const ICESHIELD = "BS19-106" // アイスエイジシールド（白マジック・コスト2）
const REGAIN = "BS19-107" // リゲイン（白マジック・コスト4）
const RECOVERYRUSH = "BS19-108" // リカバリーラッシュ（白マジック・コスト4）
const FIN = "BS19-X04" // 黄金騎神フィン・マックラン（白スピリット・武装・コスト7）

// ---------- 脇役（既存の弾から。機械確認で名前・色・系統・効果を確かめる） ----------
const VANILLA = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・古竜/異合・コスト5・BP5000・バニラ）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・機人/武装・コスト4・Lv1 BP3000・バニラ）
const JANGARRY = "BS10-031" // ジャンガリー（白・機獣・コスト1・Lv1 BP2000・バニラ）
const TERIMUCK = "BS17-019" // テリムック（緑・歌鳥・コスト0・緑シンボル・バニラ）
const GRIPHANS = "BS01-030" // グリプ・ハンズ（紫・幽魔・コスト3・『召喚時』1枚ドロー）
const POTION = "BS02-102" // ホワイトポーション（白マジック・コスト4・フラッシュ：自分のスピリット1体を回復させる）
const DREAMRIBBON = "BS01-146" // ドリームリボン（白マジック・コスト4・フラッシュ：相手のスピリット1体を手札に戻す）
const AARDERFLAME = "BS17-073" // アーダーフレイム（赤マジック・コスト4・フラッシュ：BP4000以下の相手のスピリット1体を破壊する）
const FLAMEGUST = "BS09-069" // フレイムガスト（赤マジック・コスト6・フラッシュ：BP6000以下の相手のスピリット1体を破壊する）

console.log("=== 前提: カードの機械確認 ===")
{
    // 対象8枚
    assert(getCard(ARKWIDRY).name === "砲獣アークィドリー" && getCard(ARKWIDRY).type === "brave" && getCard(ARKWIDRY).colors.join() === "white" && getCard(ARKWIDRY).family.join() === "機獣" && getCard(ARKWIDRY).cost === 4 && getCard(ARKWIDRY).effect.includes("合体条件：コスト4以上"), "ARKWIDRYは白ブレイヴ機獣コスト4・合体条件コスト4以上")
    assert(getCard(ICECAVERN).name === "獣の氷窟" && getCard(ICECAVERN).type === "nexus" && getCard(ICECAVERN).colors.join() === "white" && getCard(ICECAVERN).cost === 4 && getCard(ICECAVERN).symbol.join() === "white", "ICECAVERNは白ネクサスコスト4・白シンボル")
    assert(getCard(FORTRESSCUBE).name === "フォートレスキューブ" && getCard(FORTRESSCUBE).type === "nexus" && getCard(FORTRESSCUBE).colors.join() === "white" && getCard(FORTRESSCUBE).cost === 4 && getCard(FORTRESSCUBE).symbol.join() === "white", "FORTRESSCUBEは白ネクサスコスト4・白シンボル")
    assert(getCard(FROSTTOWER).name === "凍てつくつららの逆塔" && getCard(FROSTTOWER).type === "nexus" && getCard(FROSTTOWER).colors.join() === "white,green" && getCard(FROSTTOWER).cost === 5 && getCard(FROSTTOWER).symbol.join() === "white,green", "FROSTTOWERは白/緑ネクサスコスト5")
    assert(getCard(ICESHIELD).name === "アイスエイジシールド" && getCard(ICESHIELD).type === "magic" && getCard(ICESHIELD).colors.join() === "white" && getCard(ICESHIELD).cost === 2 && getCard(ICESHIELD).reduction.join() === "white", "ICESHIELDは白マジックコスト2")
    assert(getCard(REGAIN).name === "リゲイン" && getCard(REGAIN).type === "magic" && getCard(REGAIN).colors.join() === "white" && getCard(REGAIN).cost === 4 && getCard(REGAIN).reduction.join() === "white,white", "REGAINは白マジックコスト4")
    assert(getCard(RECOVERYRUSH).name === "リカバリーラッシュ" && getCard(RECOVERYRUSH).type === "magic" && getCard(RECOVERYRUSH).colors.join() === "white" && getCard(RECOVERYRUSH).cost === 4 && getCard(RECOVERYRUSH).effect.includes("【連鎖：条件《緑シンボル》】"), "RECOVERYRUSHは白マジックコスト4・緑シンボル連鎖")
    assert(getCard(FIN).name === "黄金騎神フィン・マックラン" && getCard(FIN).type === "spirit" && getCard(FIN).colors.join() === "white" && getCard(FIN).family.join() === "武装" && getCard(FIN).cost === 7 && getCard(FIN).effect.includes("【重装甲：赤/紫/白】"), "FINは白スピリット武装コスト7・重装甲赤/紫/白")
    // 脇役
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).colors.join() === "red" && getCard(VANILLA).family.join() === "地竜" && getCard(VANILLA).cost === 1 && getCard(VANILLA).effect === "", "VANILLAは赤地竜コスト1バニラ（BP1000）")
    assert(getCard(DUALDO).name === "デュアルド" && getCard(DUALDO).colors.join() === "red" && getCard(DUALDO).family.join() === "古竜,異合" && getCard(DUALDO).cost === 5 && getCard(DUALDO).effect === "" && getCard(DUALDO).levels?.[0]?.bp === 5000, "DUALDOは赤コスト5バニラ・Lv1 BP5000")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).colors.join() === "white" && getCard(BELL).family.join() === "機人,武装" && getCard(BELL).cost === 4 && getCard(BELL).effect === "" && getCard(BELL).levels?.[0]?.bp === 3000, "BELLは白コスト4バニラ・Lv1 BP3000")
    assert(getCard(JANGARRY).name === "ジャンガリー" && getCard(JANGARRY).colors.join() === "white" && getCard(JANGARRY).family.join() === "機獣" && getCard(JANGARRY).cost === 1 && getCard(JANGARRY).effect === "" && getCard(JANGARRY).levels?.[0]?.bp === 2000, "JANGARRYは白機獣コスト1バニラ・Lv1 BP2000")
    assert(getCard(TERIMUCK).name === "テリムック" && getCard(TERIMUCK).colors.join() === "green" && getCard(TERIMUCK).family.join() === "歌鳥" && getCard(TERIMUCK).cost === 0 && getCard(TERIMUCK).effect === "" && getCard(TERIMUCK).symbol.join() === "green", "TERIMUCKは緑歌鳥コスト0バニラ・緑シンボル")
    assert(getCard(GRIPHANS).name === "グリプ・ハンズ" && getCard(GRIPHANS).colors.join() === "purple" && getCard(GRIPHANS).family.join() === "幽魔" && getCard(GRIPHANS).cost === 3 && getCard(GRIPHANS).effect.includes("1枚ドローする"), "GRIPHANSは紫幽魔コスト3・召喚時1枚ドロー")
    assert(getCard(POTION).name === "ホワイトポーション" && getCard(POTION).type === "magic" && getCard(POTION).colors.join() === "white" && getCard(POTION).cost === 4 && getCard(POTION).effect.includes("自分のスピリット1体を回復させる"), "POTIONは白マジックコスト4・回復")
    assert(getCard(DREAMRIBBON).name === "ドリームリボン" && getCard(DREAMRIBBON).type === "magic" && getCard(DREAMRIBBON).colors.join() === "white" && getCard(DREAMRIBBON).cost === 4 && getCard(DREAMRIBBON).effect.includes("相手のスピリット1体を手札に戻す"), "DREAMRIBBONは白マジックコスト4・バウンス")
    assert(getCard(AARDERFLAME).name === "アーダーフレイム" && getCard(AARDERFLAME).type === "magic" && getCard(AARDERFLAME).colors.join() === "red" && getCard(AARDERFLAME).cost === 4 && getCard(AARDERFLAME).effect.includes("BP4000以下の相手のスピリット1体を破壊する"), "AARDERFLAMEは赤マジックコスト4・BP4000以下破壊")
    assert(getCard(FLAMEGUST).name === "フレイムガスト" && getCard(FLAMEGUST).type === "magic" && getCard(FLAMEGUST).colors.join() === "red" && getCard(FLAMEGUST).cost === 6 && getCard(FLAMEGUST).effect.includes("BP6000以下の相手のスピリット1体を破壊する"), "FLAMEGUSTは赤マジックコスト6・BP6000以下破壊")
}

// ============================================================
// BS19-074 砲獣アークィドリー（合体条件：コスト4以上）
// 【合体中】『相手のアタックステップ』自分のライフが減ったとき、このスピリットは回復する。
// ============================================================

// 起きる場面：コスト4のホストにダイレクトブレイヴで合体させ、相手のアタックでライフが減ると合体スピリットが回復する
scenario({
    name: "074_combined_refresh",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: BELL, rested: true }], hand: [ARKWIDRY] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("デュアルキャノン・ベル") })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: 砲獣アークィドリー → なし",
        "自分.リザーブ: 10 → 8", // コスト4から白シンボル1つで軽減→3支払い。ライフ減少で+1
        "自分.トラッシュのコア: 0 → 3",
        "自分.デュアルキャノン・ベル.BP: 3000 → 7000", // ホストLv1+ブレイヴ合体時BP4000
        "自分.デュアルキャノン・ベル.疲労: true → false", // 【合体中】の回復
        "自分.砲獣アークィドリー.場所: なし → 合体",
        "自分.砲獣アークィドリー.疲労: なし → false",
        "自分.砲獣アークィドリー.コア: なし → 0",
        "自分.砲獣アークィドリー.Lv: なし → 1",
        "自分.ライフ: 5 → 4",
        "相手.ロクケラトプス.疲労: false → true",
        "相手.リザーブ: 10 → 11", // 相手ターン開始のコアステップ+1
        "相手.手札: なし → ロクケラトプス", // 相手ターン開始のドロー
        "相手.デッキ枚数: 40 → 39",
    ],
})

// 起きない場面：ブレイヴがスピリット状態（未合体）のときは、ライフが減っても回復しない
scenario({
    name: "074_uncombined_no_refresh",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: ARKWIDRY }] }, // スピリット状態のブレイヴ
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("砲獣アークィドリー") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        t.act("me", { type: "endTurn" })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.砲獣アークィドリー.疲労: false → true", // アタックで疲労したまま（回復しない）
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11", // ライフ減少で+1
        "相手.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4", // ブレイヴのアタック（白シンボル1つ）
        "相手.リザーブ: 10 → 12", // ライフで受けて+1、相手ターン開始のコアステップ+1
        "相手.手札: なし → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
    ],
})

// 合体条件：コスト4未満のスピリットにはダイレクトブレイヴできない
scenario({
    name: "074_combine_condition",
    start: { turn: "me", phase: "main", me: { spirits: [{ card: JANGARRY }], hand: [ARKWIDRY] } },
    steps(t) {
        t.actRejected("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ジャンガリー") })
    },
    expect: [],
})

// ============================================================
// BS19-088 獣の氷窟
// Lv1･Lv2『お互いのアタックステップ』BP4000以下のスピリットのアタックでは、お互いのライフは減らない。
// Lv2：相手のスピリット/マジックの効果で相手の手札が増えたとき、増えたカード1枚につき、自分はデッキから1枚ドローできる。
// ============================================================

// 起きる場面：BP1000のアタックはブロックされなくてもライフを減らさない
scenario({
    name: "088_low_bp_attack_no_life",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: ICECAVERN, cores: 0 }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 起きない場面：BP4000超（BP5000）のアタックでは通常どおりライフが減る
scenario({
    name: "088_high_bp_attack_reduces",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: ICECAVERN, cores: 0 }] }, opp: { spirits: [{ card: DUALDO }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.デュアルド.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv2の間、相手のスピリットの効果で相手が1枚ドローしたら、自分も1枚ドローできる
scenario({
    name: "088_lv2_draw",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: ICECAVERN, cores: 1 }] }, opp: { hand: [GRIPHANS] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.手札: グリプ・ハンズ → ロクケラトプス", // 召喚時効果で1枚ドロー
        "相手.リザーブ: 10 → 6", // 紫シンボルなし→3支払い＋維持コア1
        "相手.トラッシュのコア: 0 → 3",
        "相手.グリプ・ハンズ.場所: なし → フィールド",
        "相手.グリプ・ハンズ.疲労: なし → false",
        "相手.グリプ・ハンズ.コア: なし → 1",
        "相手.グリプ・ハンズ.Lv: なし → 1",
        "相手.グリプ・ハンズ.BP: なし → 2000",
        "相手.デッキ枚数: 40 → 39",
        "自分.手札: なし → ロクケラトプス", // 増えた1枚につき1枚ドロー
        "自分.デッキ枚数: 40 → 39",
    ],
})

// 起きない場面：Lv1ではドローできない
scenario({
    name: "088_lv1_no_draw",
    start: { turn: "opp", phase: "main", me: { nexuses: [{ card: ICECAVERN, cores: 0 }] }, opp: { hand: [GRIPHANS] } },
    steps(t) {
        t.act("opp", { type: "summon", handIndex: 0 })
    },
    expect: [
        "相手.手札: グリプ・ハンズ → ロクケラトプス",
        "相手.リザーブ: 10 → 6",
        "相手.トラッシュのコア: 0 → 3",
        "相手.グリプ・ハンズ.場所: なし → フィールド",
        "相手.グリプ・ハンズ.疲労: なし → false",
        "相手.グリプ・ハンズ.コア: なし → 1",
        "相手.グリプ・ハンズ.Lv: なし → 1",
        "相手.グリプ・ハンズ.BP: なし → 2000",
        "相手.デッキ枚数: 40 → 39",
    ],
})

// ============================================================
// BS19-089 フォートレスキューブ
// Lv1･Lv2『お互いのアタックステップ』自分の白のスピリットが回復したとき、ボイドからコア1個を自分のスピリットに置く。
// Lv2『相手のアタックステップ』自分のライフが相手のスピリットのアタックで減ったとき、その相手のスピリット1体を手札に戻す。
// ============================================================

// 起きる場面：相手のアタックステップのフラッシュで白のスピリットを回復させると、ボイドからコア1個が乗る
scenario({
    name: "089_refresh_core",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FORTRESSCUBE, cores: 0 }], spirits: [{ card: JANGARRY, rested: true }], hand: [POTION] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジャンガリー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ホワイトポーション → なし",
        "自分.リザーブ: 10 → 9", // コスト4から白シンボル2つ（ジャンガリー＋このネクサス）で軽減→2支払い。ライフ減少で+1
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ホワイトポーション",
        "自分.ジャンガリー.疲労: true → false",
        "自分.ジャンガリー.コア: 1 → 2", // ボイドからコア1個
        "自分.ライフ: 5 → 4",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// ソウルコアあり：ボイドから置かれるのは通常コアで、リザーブの[ソウルコア]はそのまま
scenario({
    name: "089_refresh_core_soulcore",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FORTRESSCUBE, cores: 0 }], spirits: [{ card: JANGARRY, rested: true }], hand: [POTION], soulCore: "リザーブ" },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジャンガリー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ホワイトポーション → なし",
        "自分.リザーブ: 10 → 9",
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ホワイトポーション",
        "自分.ジャンガリー.疲労: true → false",
        "自分.ジャンガリー.コア: 1 → 2",
        "自分.ライフ: 5 → 4",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 起きない場面：回復したスピリットが白でなければコアは置かれない
scenario({
    name: "089_non_white_no_core",
    start: {
        turn: "opp", phase: "attack",
        me: { nexuses: [{ card: FORTRESSCUBE, cores: 0 }], spirits: [{ card: DUALDO, rested: true }], hand: [POTION] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ホワイトポーション → なし",
        "自分.リザーブ: 10 → 8", // 白シンボルはこのネクサスのみ→3支払い。ライフ減少で+1
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → ホワイトポーション",
        "自分.デュアルド.疲労: true → false",
        "自分.ライフ: 5 → 4",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 起きる場面：Lv2の間、相手のアタックでライフが減ったら、そのアタックしたスピリットを手札に戻す
scenario({
    name: "089_lv2_bounce_attacker",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: FORTRESSCUBE, cores: 2 }] }, opp: { spirits: [{ card: DUALDO }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.デュアルド.場所: フィールド → なし", // 手札に戻す
        "相手.手札: なし → デュアルド",
        "相手.リザーブ: 10 → 11", // 戻したスピリットのコアはリザーブへ
    ],
})

// 起きない場面：Lv1では手札に戻さない
scenario({
    name: "089_lv1_no_bounce",
    start: { turn: "opp", phase: "attack", me: { nexuses: [{ card: FORTRESSCUBE, cores: 0 }] }, opp: { spirits: [{ card: DUALDO }] } },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.デュアルド.疲労: false → true",
    ],
})

// ============================================================
// BS19-090 凍てつくつららの逆塔
// Lv1･Lv2『自分のメインステップ』自分の緑のスピリットが召喚されたとき、ボイドからコア1個を自分の白のスピリットに置く。
// Lv2：【連鎖】を持つ自分のスピリットが相手の効果によって破壊されたとき、破壊された自分のスピリット1体を手札に戻す。
// ============================================================

// 起きる場面：自分のメインステップで緑のスピリットを召喚すると、ボイドから白のスピリットにコア1個が乗る
scenario({
    name: "090_green_summon_core",
    start: { turn: "me", phase: "main", me: { nexuses: [{ card: FROSTTOWER, cores: 0 }], spirits: [{ card: JANGARRY }], hand: [TERIMUCK] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: テリムック → なし",
        "自分.リザーブ: 10 → 9", // コスト0。維持コア1のみ
        "自分.テリムック.場所: なし → フィールド",
        "自分.テリムック.疲労: なし → false",
        "自分.テリムック.コア: なし → 1",
        "自分.テリムック.Lv: なし → 1",
        "自分.テリムック.BP: なし → 2000",
        "自分.ジャンガリー.コア: 1 → 2", // ボイドから白のスピリットにコア1個
    ],
})

// ソウルコアあり：ボイドから置かれるのは通常コアで、リザーブの[ソウルコア]はそのまま
scenario({
    name: "090_green_summon_core_soulcore",
    start: { turn: "me", phase: "main", me: { nexuses: [{ card: FROSTTOWER, cores: 0 }], spirits: [{ card: JANGARRY }], hand: [TERIMUCK], soulCore: "リザーブ" } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: テリムック → なし",
        "自分.リザーブ: 10 → 9",
        "自分.テリムック.場所: なし → フィールド",
        "自分.テリムック.疲労: なし → false",
        "自分.テリムック.コア: なし → 1",
        "自分.テリムック.Lv: なし → 1",
        "自分.テリムック.BP: なし → 2000",
        "自分.ジャンガリー.コア: 1 → 2",
    ],
})

// 起きない場面：召喚されたスピリットが緑でなければコアは置かれない
scenario({
    name: "090_non_green_no_core",
    start: { turn: "me", phase: "main", me: { nexuses: [{ card: FROSTTOWER, cores: 0 }], spirits: [{ card: JANGARRY }], hand: [VANILLA] } },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: ロクケラトプス → なし",
        "自分.リザーブ: 10 → 8", // 赤シンボルなし→1支払い＋維持コア1
        "自分.トラッシュのコア: 0 → 1",
        "自分.ロクケラトプス.場所: なし → フィールド",
        "自分.ロクケラトプス.疲労: なし → false",
        "自分.ロクケラトプス.コア: なし → 1",
        "自分.ロクケラトプス.Lv: なし → 1",
        "自分.ロクケラトプス.BP: なし → 1000",
    ],
})

// 起きない場面：Lv2でも、【連鎖】を持たないスピリットが相手の効果で破壊されても手札に戻さない
// （【連鎖】持ちが破壊される「起きる場面」は、既存の弾に【連鎖】を持つスピリットがおらず未カバー。報告参照）
scenario({
    name: "090_lv2_non_rensa_no_bounce",
    start: {
        turn: "opp", phase: "main",
        me: { nexuses: [{ card: FROSTTOWER, cores: 2 }], spirits: [{ card: JANGARRY }] },
        opp: { hand: [AARDERFLAME] },
    },
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジャンガリー") })
    },
    expect: [
        "自分.ジャンガリー.場所: フィールド → なし",
        "自分.リザーブ: 10 → 11", // 破壊されたスピリットのコアはリザーブへ
        "自分.トラッシュ: なし → ジャンガリー",
        "相手.手札: アーダーフレイム → なし",
        "相手.リザーブ: 10 → 6", // 赤シンボルなし→4支払い
        "相手.トラッシュのコア: 0 → 4",
        "相手.トラッシュ: なし → アーダーフレイム",
    ],
})

// ============================================================
// BS19-106 アイスエイジシールド
// フラッシュ：相手のスピリット1体を指定する。このターンの間、指定された相手のスピリットのアタック/効果によって、自分のライフは減らない。
// ============================================================

// 起きる場面：指定したスピリットのアタックではライフが減らない
scenario({
    name: "106_shield_blocks_life",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: JANGARRY }], hand: [ICESHIELD] },
        opp: { spirits: [{ card: VANILLA }, { card: DUALDO }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: アイスエイジシールド → なし",
        "自分.リザーブ: 10 → 9", // コスト2から白シンボル1つ（ジャンガリー）で軽減→1支払い
        "自分.トラッシュのコア: 0 → 1",
        "自分.トラッシュ: なし → アイスエイジシールド",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 起きない場面：指定していない別のスピリットのアタックではライフが減る
scenario({
    name: "106_other_attacker_reduces",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: JANGARRY }], hand: [ICESHIELD] },
        opp: { spirits: [{ card: VANILLA }, { card: DUALDO }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.デュアルド") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("相手.ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.手札: アイスエイジシールド → なし",
        "自分.トラッシュのコア: 0 → 1",
        "自分.トラッシュ: なし → アイスエイジシールド",
        "自分.ライフ: 5 → 4",
        "相手.デュアルド.疲労: false → true",
    ],
})

// ============================================================
// BS19-107 リゲイン
// フラッシュ：自分のスピリット1体を回復させる。または、このターンの間、自分のスピリットすべてをBP+3000する。
// ============================================================

// 「または」の回復側：自分のスピリット1体を回復させる
scenario({
    name: "107_refresh_branch",
    start: { turn: "me", phase: "main", interactive: true, me: { spirits: [{ card: JANGARRY, rested: true }], hand: [REGAIN] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        // 「または」の2択から回復側を選ぶ
        const opts = t.state.pendingChoice?.options ?? []
        const opt = opts.find((o) => o.includes("回復")) ?? opts[0] ?? ""
        t.act("me", { type: "resolveChoice", option: opt })
        // 回復対象の選択が出ていれば答える
        if (t.state.pendingChoice) t.act("me", { type: "resolveChoice", instanceId: t.id("ジャンガリー") })
    },
    expect: [
        "自分.手札: リゲイン → なし",
        "自分.リザーブ: 10 → 7", // コスト4から白シンボル1つで軽減→3支払い
        "自分.トラッシュのコア: 0 → 3",
        "自分.トラッシュ: なし → リゲイン",
        "自分.ジャンガリー.疲労: true → false",
    ],
})

// 「または」のBP+側：このターンの間、自分のスピリットすべてをBP+3000する
scenario({
    name: "107_bp_branch",
    start: { turn: "me", phase: "main", interactive: true, me: { spirits: [{ card: JANGARRY }, { card: BELL }], hand: [REGAIN] } },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        // 「または」の2択からBP+側を選ぶ
        const opts = t.state.pendingChoice?.options ?? []
        const opt = opts.find((o) => o.includes("BP")) ?? opts.find((o) => !o.includes("回復")) ?? opts[0] ?? ""
        t.act("me", { type: "resolveChoice", option: opt })
    },
    expect: [
        "自分.手札: リゲイン → なし",
        "自分.リザーブ: 10 → 8", // コスト4から白シンボル2つで軽減→2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → リゲイン",
        "自分.ジャンガリー.BP: 2000 → 5000",
        "自分.デュアルキャノン・ベル.BP: 3000 → 6000",
    ],
})

// ============================================================
// BS19-108 リカバリーラッシュ
// フラッシュ：自分の白のスピリットすべてを回復させる。このターンの間、この効果で回復した、コスト10以下のスピリットはアタックできない。
// 【連鎖：条件《緑シンボル》】[緑]：相手は、相手のスピリット2体を疲労させる。
// ============================================================

// 起きる場面：白2体が回復し、緑シンボルがあるので連鎖で相手2体が疲労する。回復したコスト10以下はこのターンアタックできない
scenario({
    name: "108_refresh_ban_chain",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: JANGARRY, rested: true }, { card: BELL, rested: true }, { card: TERIMUCK }], hand: [RECOVERYRUSH] },
        opp: { spirits: [{ card: VANILLA }, { card: DUALDO }] },
    },
    steps(t) {
        // 疲労状態の白2体は回復の様子が見えるように最初から疲労させておく。アタックするのは緑のテリムック
        t.act("me", { type: "attack", instanceId: t.id("テリムック") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
        // この効果で回復したコスト10以下のスピリットはアタックできない
        t.actRejected("me", { type: "attack", instanceId: t.id("ジャンガリー") })
        t.actRejected("me", { type: "attack", instanceId: t.id("デュアルキャノン・ベル") })
    },
    expect: [
        "自分.手札: リカバリーラッシュ → なし",
        "自分.リザーブ: 10 → 8", // コスト4から白シンボル2つで軽減→2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → リカバリーラッシュ",
        "自分.ジャンガリー.疲労: true → false", // 白のスピリットすべてを回復
        "自分.デュアルキャノン・ベル.疲労: true → false",
        "自分.テリムック.疲労: false → true", // 緑は回復せず、アタックできる
        "相手.ロクケラトプス.疲労: false → true", // 連鎖[緑]で相手のスピリット2体を疲労
        "相手.デュアルド.疲労: false → true",
        "相手.ライフ: 5 → 4", // テリムックのアタック（緑シンボル1つ）
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きない場面（連鎖）：自分の緑シンボルが無いときは[緑]の疲労は発揮しない（回復は通常どおり）
scenario({
    name: "108_no_green_no_chain",
    start: {
        turn: "me", phase: "main",
        me: { spirits: [{ card: JANGARRY, rested: true }, { card: BELL, rested: true }], hand: [RECOVERYRUSH] },
        opp: { spirits: [{ card: VANILLA }, { card: DUALDO }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [
        "自分.手札: リカバリーラッシュ → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → リカバリーラッシュ",
        "自分.ジャンガリー.疲労: true → false",
        "自分.デュアルキャノン・ベル.疲労: true → false",
    ],
})

// ============================================================
// BS19-X04 黄金騎神フィン・マックラン
// Lv1･Lv2･Lv3【重装甲：赤/紫/白】このスピリットは、相手の赤/紫/白の効果を受けない。
// Lv2･Lv3『このスピリットのアタック時』このスピリットのシンボルを白のシンボル2つにする。
// Lv3『お互いのアタックステップ』相手のスピリットが手札に戻ったとき、自分のスピリット1体を回復させる。
// ============================================================

// 【重装甲：赤/紫/白】：相手の赤マジックの対象には選べない（SEMANTICS_AUDIT §3.20）
scenario({
    name: "x04_armor_reject_target",
    start: {
        turn: "opp", phase: "attack",
        me: { spirits: [{ card: FIN, label: "フィン" }, { card: JANGARRY }] },
        opp: { spirits: [{ card: VANILLA }], hand: [FLAMEGUST] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("相手.ロクケラトプス") })
        t.act("me", { type: "pass" })
        // BP6000以下でBPは条件に当たるが、相手の赤の効果を受けないので対象に選べない
        t.actRejected("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("フィン") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.ロクケラトプス.疲労: false → true",
    ],
})

// 起きる場面：Lv2のアタック時、白のシンボル2つになり、ブロックされなければライフを2つ減らす
scenario({
    name: "x04_lv2_two_symbols",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: FIN, label: "フィン", cores: 3 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("フィン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.フィン.疲労: false → true",
        "相手.ライフ: 5 → 3",
        "相手.リザーブ: 10 → 12",
    ],
})

// 起きない場面：Lv1ではシンボルは1つのまま、ライフは1つしか減らない
scenario({
    name: "x04_lv1_one_symbol",
    start: { turn: "me", phase: "attack", me: { spirits: [{ card: FIN, label: "フィン", cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("フィン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.フィン.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

// 起きる場面：Lv3の間、アタックステップで相手のスピリットが手札に戻ったら、自分のスピリット1体を回復させる
scenario({
    name: "x04_lv3_bounce_refresh",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: JANGARRY, rested: true }, { card: FIN, label: "フィン", cores: 5 }], hand: [DREAMRIBBON] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("フィン") })
        t.act("opp", { type: "pass" })
        // フラッシュで相手のスピリット1体を手札に戻す（対象はロクケラトプスのみ）
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ドリームリボン → なし",
        "自分.リザーブ: 10 → 8", // コスト4から白シンボル2つ（ジャンガリー＋フィン）で軽減→2支払い
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ドリームリボン",
        "自分.ジャンガリー.疲労: true → false", // Lv3の誘発で回復
        "自分.フィン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13", // 戻したスピリットのコア+1、ライフ2つ減少で+2
        "相手.ライフ: 5 → 3", // Lv3のアタック時、白のシンボル2つ
    ],
})

// 起きない場面：Lv2では相手のスピリットが手札に戻っても回復の誘発はない
scenario({
    name: "x04_lv2_no_bounce_refresh",
    start: {
        turn: "me", phase: "attack",
        me: { spirits: [{ card: JANGARRY, rested: true }, { card: FIN, label: "フィン", cores: 3 }], hand: [DREAMRIBBON] },
        opp: { spirits: [{ card: VANILLA }] },
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("フィン") })
        t.act("opp", { type: "pass" })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.手札: ドリームリボン → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.トラッシュ: なし → ドリームリボン",
        "自分.フィン.疲労: false → true",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.手札: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 13",
        "相手.ライフ: 5 → 3", // Lv2でもアタック時のシンボル2つは働く
    ],
})

console.log("すべてのチェックに合格しました 🎉（part737）")
