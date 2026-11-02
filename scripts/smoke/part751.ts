// smoke パート751（SD17 redB：SD17-003〜009・011 の期待値。docs/design/STARTER_PLAN.md §2・BS19_PLAN.md §2）
// 【激突】『アタック時』の働き・【連鎖：条件《緑シンボル》】・召喚時のネクサス破壊・トラッシュ回収・
// 『自分のアタックステップ』の地竜全体BP+ を、効果文だけから期待値として書く（effects はまだ空でよい）
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

// ▼ 主役8枚（効果文と属性は data/cards/STARTER-redB.json で確認済み）
const STEGO = "SD17-003" // 刀竜ステゴディータ（赤・スピリット・コスト3・地竜）Lv1-3【激突】
const BRONSO = "SD17-004" // ブロンソードザウルス（赤・スピリット・コスト3・地竜）召喚時：相手のネクサス1つ破壊＋【連鎖：緑】コア1個
const PEDO = "SD17-005" // 羽竜ペドペンナー（赤・スピリット・コスト3・地竜/空牙）『自分のアタックステップ』地竜すべてBP+2000
const RAMBE = "SD17-006" // 激竜ランベオス（赤・スピリット・コスト4・地竜）Lv1-2【激突】＋Lv2アタック時：1枚ドロー
const PTERA = "SD17-007" // プテラスラッシャー（赤・スピリット・コスト4・地竜/空牙）アタック時：自分BP+3000＋【連鎖：緑】コア1個
const MONO = "SD17-008" // モノフォースザウルス（赤・スピリット・コスト5・地竜）Lv1-2【激突】＋【連鎖：緑】最初のアタックで回復
const STIRA = "SD17-009" // 突竜スティラゴーン（赤・スピリット・コスト5・地竜）Lv1-3【激突】＋Lv2-3アタック時：このBP以下の相手1体破壊
const SILVI = "SD17-011" // 鎧機竜シルヴィード（赤・ブレイヴ・コスト3・地竜/機竜）召喚時：トラッシュの【連鎖】持ち1枚回収＋【合体時】【激突】

// ▼ 脇役（data/cards/*.json から選んだバニラ等。属性を先頭で確認する）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・地竜・バニラ）
const MIRA = "BS01-051" // フライングミラージュ（緑・コスト1・殻虫・バニラ）→ 自分の緑シンボル
const BEETLE = "BS01-050" // ビートビートル（緑・コスト0・殻虫・バニラ）→ 【連鎖】を持たないトラッシュのカード
const VAJU = "BS17-007" // ヴァジュランガ（赤・コスト6・皇獣・バニラ）→ 地竜ではない味方／BP4000のブロッカー
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・巨獣・バニラ）→ BP6000のブロッカー
const KAMOME = "BS10-024" // カモメーヴェ（緑・コスト3・爪鳥・バニラ）→ BP5000のブロッカー
const METAL = "BS01-008" // メタルバーン（赤・コスト3・機竜・バニラ）→ BP3000のブロッカー
const NEXUS = "BS17-066" // 聖者の樹の実（緑・コスト4・ネクサス）→ 破壊される相手のネクサス

console.log("=== 前提: カードの機械確認 ===")
{
    const c = (id: string) => getCard(id)
    assert(c(STEGO).name === "刀竜ステゴディータ" && c(STEGO).type === "spirit" && c(STEGO).colors[0] === "red" && c(STEGO).cost === 3, "STEGOは赤コスト3のスピリット")
    assert(c(BRONSO).name === "ブロンソードザウルス" && c(BRONSO).type === "spirit" && c(BRONSO).colors[0] === "red" && c(BRONSO).cost === 3, "BRONSOは赤コスト3のスピリット")
    assert(c(PEDO).name === "羽竜ペドペンナー" && c(PEDO).type === "spirit" && c(PEDO).colors[0] === "red" && c(PEDO).cost === 3, "PEDOは赤コスト3のスピリット")
    assert(c(RAMBE).name === "激竜ランベオス" && c(RAMBE).type === "spirit" && c(RAMBE).colors[0] === "red" && c(RAMBE).cost === 4, "RAMBEは赤コスト4のスピリット")
    assert(c(PTERA).name === "プテラスラッシャー" && c(PTERA).type === "spirit" && c(PTERA).colors[0] === "red" && c(PTERA).cost === 4, "PTERAは赤コスト4のスピリット")
    assert(c(MONO).name === "モノフォースザウルス" && c(MONO).type === "spirit" && c(MONO).colors[0] === "red" && c(MONO).cost === 5, "MONOは赤コスト5のスピリット")
    assert(c(STIRA).name === "突竜スティラゴーン" && c(STIRA).type === "spirit" && c(STIRA).colors[0] === "red" && c(STIRA).cost === 5, "STIRAは赤コスト5のスピリット")
    assert(c(SILVI).name === "鎧機竜シルヴィード" && c(SILVI).type === "brave" && c(SILVI).colors[0] === "red" && c(SILVI).cost === 3, "SILVIは赤コスト3のブレイヴ")
    assert(c(ROKU).name === "ロクケラトプス" && c(ROKU).colors[0] === "red" && c(ROKU).family.includes("地竜") && c(ROKU).cost === 1, "ROKUは赤コスト1の地竜")
    assert(c(MIRA).name === "フライングミラージュ" && c(MIRA).colors[0] === "green" && c(MIRA).family.includes("殻虫") && c(MIRA).cost === 1, "MIRAは緑コスト1の殻虫")
    assert(c(BEETLE).name === "ビートビートル" && c(BEETLE).colors[0] === "green" && c(BEETLE).family.includes("殻虫") && c(BEETLE).cost === 0, "BEETLEは緑コスト0の殻虫")
    assert(c(VAJU).name === "ヴァジュランガ" && c(VAJU).colors[0] === "red" && c(VAJU).family.includes("皇獣") && !c(VAJU).family.includes("地竜") && c(VAJU).cost === 6, "VAJUは赤コスト6の皇獣（地竜ではない）")
    assert(c(HERA).name === "ヘラクレス・ジオ" && c(HERA).colors[0] === "green" && c(HERA).family.includes("巨獣") && c(HERA).cost === 3, "HERAは緑コスト3の巨獣")
    assert(c(KAMOME).name === "カモメーヴェ" && c(KAMOME).colors[0] === "green" && c(KAMOME).family.includes("爪鳥") && c(KAMOME).cost === 3, "KAMOMEは緑コスト3の爪鳥")
    assert(c(METAL).name === "メタルバーン" && c(METAL).colors[0] === "red" && c(METAL).family.includes("機竜") && c(METAL).cost === 3, "METALは赤コスト3の機竜")
    assert(c(NEXUS).name === "聖者の樹の実" && c(NEXUS).type === "nexus" && c(NEXUS).colors[0] === "green" && c(NEXUS).cost === 4, "NEXUSは緑コスト4のネクサス")
}

// ─── SD17-003 刀竜ステゴディータ【激突】（キーワード単独：働く場面1件）───
// Lv1（BP3000）でアタック。相手は可能ならば必ずブロックする → 直接攻撃（takeLife）は拒否され、
// ブロックしたヴァジュランガ（BP4000）とのバトルでステゴディータが破壊される
scenario({
    name: "sd17_003_clash_forced_block",
    start: {
        me: { spirits: [{ card: STEGO, label: "ステゴ", cores: 1 }] },
        opp: { spirits: [{ card: VAJU, label: "ブロッカー", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ステゴ") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" }) // 【激突】により直接攻撃は選べない
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.ステゴ.場所: フィールド → なし", // BP3000 vs 4000 で敗北
        "自分.リザーブ: 10 → 11", // 破壊されたステゴのコア1個がリザーブへ
        "相手.ブロッカー.疲労: false → true",
    ],
})

// ─── SD17-004 ブロンソードザウルス：召喚時（相手のネクサス1つを破壊）＋【連鎖：緑】───
// 緑シンボル（フライングミラージュ）があるので連鎖も発揮：ボイドからコア1個をこのスピリットに置く。
// 自分の赤シンボルはないのでコスト3の支払いは軽減されない（リザーブ10−3−維持コア1）
scenario({
    name: "sd17_004_summon_destroy_nexus_and_rensa",
    start: {
        me: { hand: [BRONSO], spirits: [{ card: MIRA, cores: 1 }] },
        opp: { nexuses: [{ card: NEXUS, label: "樹の実", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6", // コスト3（軽減なし）＋Lv1の維持コア1
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ブロンソードザウルス → なし",
        "自分.ブロンソードザウルス.場所: なし → フィールド",
        "自分.ブロンソードザウルス.コア: なし → 2", // 維持コア1＋連鎖でボイドから1
        "自分.ブロンソードザウルス.Lv: なし → 1",
        "自分.ブロンソードザウルス.疲労: なし → false",
        "自分.ブロンソードザウルス.BP: なし → 2000",
        "相手.樹の実.場所: ネクサス → なし", // 召喚時：相手のネクサス1つを破壊
        "相手.リザーブ: 10 → 11", // 破壊されたネクサスのコア1個がリザーブへ
    ],
})

// ─── SD17-004【連鎖】起きない場面：自分の緑シンボルがない（条件を1つ外す）───
// 赤のロクケラトプスだけなので軽減は1（コスト3−1）。連鎖は発揮せずコアは増えない
scenario({
    name: "sd17_004_rensa_needs_green_symbol",
    start: {
        me: { hand: [BRONSO], spirits: [{ card: ROKU, cores: 1 }] },
        opp: { nexuses: [{ card: NEXUS, label: "樹の実", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 7", // 赤シンボル1つで軽減1：コスト2＋維持コア1
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: ブロンソードザウルス → なし",
        "自分.ブロンソードザウルス.場所: なし → フィールド",
        "自分.ブロンソードザウルス.コア: なし → 1", // 連鎖は発揮しない：ボイドからは置かれない
        "自分.ブロンソードザウルス.Lv: なし → 1",
        "自分.ブロンソードザウルス.疲労: なし → false",
        "自分.ブロンソードザウルス.BP: なし → 2000",
        "相手.樹の実.場所: ネクサス → なし",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD17-004 召喚時 起きない場面：相手のネクサスがない（条件を1つ外す）───
// 破壊する相手のネクサスがいないので何も破壊されない。連鎖（緑シンボルあり）は発揮する
scenario({
    name: "sd17_004_no_nexus_to_destroy",
    start: {
        me: { hand: [BRONSO], spirits: [{ card: MIRA, cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 3",
        "自分.手札: ブロンソードザウルス → なし",
        "自分.ブロンソードザウルス.場所: なし → フィールド",
        "自分.ブロンソードザウルス.コア: なし → 2",
        "自分.ブロンソードザウルス.Lv: なし → 1",
        "自分.ブロンソードザウルス.疲労: なし → false",
        "自分.ブロンソードザウルス.BP: なし → 2000",
    ],
})

// ─── SD17-005 羽竜ペドペンナー：『自分のアタックステップ』地竜すべてBP+2000 ───
// 自分のアタックステップでは、地竜のペドペンナー自身・ロクケラトプスが+2000され、
// 地竜ではないヴァジュランガ（皇獣）は+されない
scenario({
    name: "sd17_005_ryuryu_bp_plus_on_own_attack_step",
    start: {
        me: {
            spirits: [
                { card: PEDO, label: "ペドペンナー", cores: 1 },
                { card: ROKU, cores: 1 },
                { card: VAJU, cores: 1 },
            ],
        },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" }) // メイン → アタックステップ
    },
    expect: [
        "自分.ペドペンナー.BP: 3000 → 5000", // 自身も地竜なので対象に入る
        "自分.ロクケラトプス.BP: 1000 → 3000",
        // ヴァジュランガ（皇獣・BP4000）は地竜ではないので変化なし
    ],
})

// ─── SD17-005 起きない場面：相手のアタックステップ（条件を1つ外す）───
// 『自分のアタックステップ』限定なので、相手のアタックステップの間はBP+されない
scenario({
    name: "sd17_005_not_on_opponent_attack_step",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: PEDO, label: "ペドペンナー", cores: 1 }, { card: ROKU, cores: 1 }] },
        opp: { spirits: [{ card: VAJU, label: "攻撃役", cores: 1 }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.攻撃役.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        // ペドペンナー（BP3000）・ロクケラトプス（BP1000）ともにBPは変わらない
    ],
})

// ─── SD17-006 激竜ランベオス：Lv2アタック時「1枚ドロー」＋【激突】───
// Lv2（BP6000）でアタック → 1枚ドロー。【激突】でブロックが強制され、
// ブロックしたヴァジュランガ（BP4000）が破壊される
scenario({
    name: "sd17_006_lv2_attack_draw",
    start: {
        me: { spirits: [{ card: RAMBE, label: "ランベオス", cores: 3 }] },
        opp: { spirits: [{ card: VAJU, label: "ブロッカー", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランベオス") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.ランベオス.疲労: false → true",
        "自分.デッキ枚数: 40 → 39", // Lv2のアタック時：1枚ドロー
        "自分.手札: なし → ロクケラトプス",
        "相手.ブロッカー.場所: フィールド → なし", // BP6000 vs 4000
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD17-006 ドロー起きない場面：Lv1（条件を1つ外す）───
// Lv1（BP3000）のアタックではドローしない。【激突】はLv1でも働く
scenario({
    name: "sd17_006_lv1_no_draw",
    start: {
        me: { spirits: [{ card: RAMBE, label: "ランベオス", cores: 1 }] },
        opp: { spirits: [{ card: VAJU, label: "ブロッカー", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ランベオス") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.ランベオス.場所: フィールド → なし", // BP3000 vs 4000 で敗北
        "自分.リザーブ: 10 → 11",
        "相手.ブロッカー.疲労: false → true",
        // デッキ枚数・手札は変わらない（Lv1なのでドローしない）
    ],
})

// ─── SD17-007 プテラスラッシャー：アタック時BP+3000＋【連鎖：緑】コア1個 ───
// Lv2（BP5000）のアタックでバトルの間BP+3000 → 8000となり、ブロックしたヘラクレス・ジオ（BP6000）を破壊。
// 緑シンボルがあるので連鎖も発揮し、ボイドからコア1個を自身に置く
scenario({
    name: "sd17_007_attack_bp_plus_and_rensa_core",
    start: {
        me: { spirits: [{ card: PTERA, label: "プテラ", cores: 3 }, { card: MIRA, cores: 1 }] },
        opp: { spirits: [{ card: HERA, label: "ブロッカー", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("プテラ") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.プテラ.コア: 3 → 4", // 連鎖：ボイドからコア1個（Lv2は維持3なのでLvのまま）
        "自分.プテラ.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし", // 5000+3000=8000 vs 6000
        "相手.リザーブ: 10 → 13",
    ],
})

// ─── SD17-007【連鎖】起きない場面：自分の緑シンボルがない（条件を1つ外す）───
// BP+3000（アタック時の無条件節）は働き、ヘラクレス・ジオを破壊する。コアは増えない
scenario({
    name: "sd17_007_rensa_needs_green_symbol",
    start: {
        me: { spirits: [{ card: PTERA, label: "プテラ", cores: 3 }] },
        opp: { spirits: [{ card: HERA, label: "ブロッカー", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("プテラ") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.プテラ.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 13",
        // プテラのコアは3のまま（連鎖は発揮しない）
    ],
})

// ─── SD17-008 モノフォースザウルス：【連鎖：緑】最初のアタックで回復 ───
// 緑シンボルがあり、自分のターンの最初のアタック → 連鎖で回復する。
// 【激突】でブロックしたロクケラトプス（BP1000）は破壊され、モノフォースは疲労していないまま
scenario({
    name: "sd17_008_rensa_refresh_on_first_attack",
    start: {
        me: { spirits: [{ card: MONO, label: "モノフォース", cores: 1 }, { card: MIRA, cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "ブロッカー", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("モノフォース") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "相手.ブロッカー.場所: フィールド → なし", // BP4000 vs 1000
        "相手.リザーブ: 10 → 11",
        // モノフォース.疲労は false → false（アタックで疲労するが連鎖で回復するので差分なし）
    ],
})

// ─── SD17-008【連鎖】起きない場面：自分の緑シンボルがない（条件を1つ外す）───
// 連鎖が発揮しないので、アタックしたモノフォースは疲労したまま
scenario({
    name: "sd17_008_rensa_needs_green_symbol",
    start: {
        me: { spirits: [{ card: MONO, label: "モノフォース", cores: 1 }] },
        opp: { spirits: [{ card: ROKU, label: "ブロッカー", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("モノフォース") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.モノフォース.疲労: false → true", // 連鎖は発揮しない：回復しない
        "相手.ブロッカー.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD17-009 突竜スティラゴーン：Lv2アタック時「このBP以下の相手1体を破壊」───
// Lv2（BP6000）のアタック時、相手のヘラクレス・ジオ（BP4000）を破壊する。
// 相手のスピリットがいなくなるので【激突】のブロックは不可能 → 直接攻撃が通る
scenario({
    name: "sd17_009_lv2_destroy_then_direct",
    start: {
        me: { spirits: [{ card: STIRA, label: "スティラ", cores: 3 }] },
        opp: { spirits: [{ card: HERA, label: "標的", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スティラ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" }) // ブロッカーがいないので直接攻撃できる
    },
    expect: [
        "自分.スティラ.疲労: false → true",
        "相手.標的.場所: フィールド → なし", // BP4000 ≦ 6000 なのでアタック時に破壊
        "相手.リザーブ: 10 → 12", // 破壊されたコア1＋ライフのコア1
        "相手.ライフ: 5 → 4",
    ],
})

// ─── SD17-009 破壊 起きない場面：Lv1（条件を1つ外す）───
// Lv1（BP4000）ではBP5000のカモメーヴェを破壊できない。【激突】でブロックが強制され、
// バトル敗北でスティラゴーンが破壊される
scenario({
    name: "sd17_009_lv1_cannot_destroy",
    start: {
        me: { spirits: [{ card: STIRA, label: "スティラ", cores: 1 }] },
        opp: { spirits: [{ card: KAMOME, label: "ブロッカー", cores: 3 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("スティラ") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.スティラ.場所: フィールド → なし", // BP4000 vs 5000 で敗北
        "自分.リザーブ: 10 → 11",
        "相手.ブロッカー.疲労: false → true",
    ],
})

// ─── SD17-011 鎧機竜シルヴィード：召喚時（トラッシュの【連鎖】持ち1枚回収）＋【合体時】【激突】───
// 地竜のロクケラトプスにダイレクトブレイヴで召喚（維持コアは置かない）。
// 召喚時：トラッシュのブロンソードザウルス（【連鎖】持ち）を手札に戻す。
// 合体アタック時【激突】でブロックが強制され、メタルバーン（BP3000）を破壊する
scenario({
    name: "sd17_011_brave_summon_recover_and_combined_clash",
    start: {
        me: { hand: [SILVI], trash: [BRONSO], spirits: [{ card: ROKU, label: "宿主", cores: 1 }] },
        opp: { spirits: [{ card: METAL, label: "ブロッカー", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("宿主") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("宿主") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" })
        t.act("opp", { type: "block", instanceId: t.id("ブロッカー") })
        t.closeFlash()
    },
    expect: [
        "自分.リザーブ: 10 → 8", // コスト3、赤シンボル1つで軽減1 → 2を支払う（ダイレクトブレイヴは維持コアなし）
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: 鎧機竜シルヴィード → ブロンソードザウルス", // 召喚時：トラッシュの【連鎖】持ちを回収
        "自分.トラッシュ: ブロンソードザウルス → なし",
        "自分.鎧機竜シルヴィード.場所: なし → 合体",
        "自分.鎧機竜シルヴィード.コア: なし → 0",
        "自分.鎧機竜シルヴィード.Lv: なし → 1",
        "自分.鎧機竜シルヴィード.疲労: なし → false",
        "自分.宿主.BP: 1000 → 4000", // ホストLv1の1000＋ブレイヴの3000
        "自分.宿主.疲労: false → true",
        "相手.ブロッカー.場所: フィールド → なし", // 4000 vs 3000
        "相手.リザーブ: 10 → 11",
    ],
})

// ─── SD17-011 回収 起きない場面：トラッシュに【連鎖】持ちがいない（条件を1つ外す）───
// トラッシュのビートビートルは【連鎖】を持たないので、手札に戻るカードはない
scenario({
    name: "sd17_011_no_rensa_card_in_trash",
    start: {
        me: { hand: [SILVI], trash: [BEETLE], spirits: [{ card: ROKU, label: "宿主", cores: 1 }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("宿主") })
    },
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        "自分.手札: 鎧機竜シルヴィード → なし", // 戻るカードがない
        "自分.鎧機竜シルヴィード.場所: なし → 合体",
        "自分.鎧機竜シルヴィード.コア: なし → 0",
        "自分.鎧機竜シルヴィード.Lv: なし → 1",
        "自分.鎧機竜シルヴィード.疲労: なし → false",
        "自分.宿主.BP: 1000 → 4000",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part751）")
