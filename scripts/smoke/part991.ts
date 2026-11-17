// smoke パート991（EX014 幻羅獅龍アポロドラゴン・デネボラ：自分のスピリットすべての指定アタック／【合体時】Lv3 このバトルの間、破壊された相手のスピリットのコアはボイドへ）
// 【転召：コスト5以上/ボイド】の場面は質問欄の2点が決まるまで書いていない
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const DENEBOLA = "EX014" // 赤紫・コスト9・Lv1 BP7000(1コア)／Lv2 BP12000(3コア)／Lv3 BP20000(5コア)
const LANCE = "SJ13-23" // 獅魂の剣刃レオンエクスカリバー（白ブレイヴ・コスト4・剣刃。合体条件コスト4以上。召喚時効果は召喚しない場面なので出ない）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(DENEBOLA).name === "幻羅獅龍アポロドラゴン・デネボラ" && getCard(LANCE).name === "獅魂の剣刃レオンエクスカリバー", "EX014とSJ13-23の名前")
    assert(getCard(METAL).name === "メタルバーン" && getCard(ROKU).name === "ロクケラトプス", "バニラの名前")
}

function combine(t: ScenarioCtx, brave: string, host: string): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(brave), hostInstanceId: t.id(host) })
    t.act("me", { type: "nextPhase" })
}

console.log("=== 1. 自分のスピリットすべてが指定アタックできる（EX014以外のスピリットでも） ===")
scenario({
    name: "ex014-designate",
    start: {
        me: { spirits: [{ card: DENEBOLA, label: "デネボラ" }, { card: METAL, label: "攻" }] },
        opp: { spirits: [{ card: ROKU, label: "的" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("攻"), targetSpiritInstanceId: t.id("的") })
        t.closeFlash()
    },
    expect: [
        "自分.攻.疲労: false → true",
        "相手.的.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 2. EX014がいなければ指定アタックは通らない ===")
scenario({
    name: "ex014-none",
    start: {
        me: { spirits: [{ card: METAL, label: "攻" }] },
        opp: { spirits: [{ card: ROKU, label: "的" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("攻"), targetSpiritInstanceId: t.id("的") })
    },
    expect: [],
})

console.log("=== 3. 相手の場にいるEX014は自分に効かない（効果文は「自分のスピリットすべて」） ===")
scenario({
    name: "ex014-opp-side",
    start: {
        me: { spirits: [{ card: METAL, label: "攻" }] },
        opp: { spirits: [{ card: DENEBOLA, label: "デネボラ" }, { card: ROKU, label: "的" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("攻"), targetSpiritInstanceId: t.id("的") })
    },
    expect: [],
})

console.log("=== 4. Lv3＋ブレイヴ合体：BP比較で破壊した相手のスピリットのコアはボイドへ（リザーブにもトラッシュのコアにも増えない） ===")
scenario({
    name: "ex014-lv3-void",
    start: {
        me: { spirits: [{ card: DENEBOLA, label: "host", cores: 5 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combine(t, "剣", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.剣.場所: フィールド → 合体",
        "自分.剣.コア: 1 → 0",
        "自分.剣.BP: 3000 → なし",
        "自分.host.BP: 20000 → 23000",
        "自分.host.コア: 5 → 6",
        "自分.host.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
    ],
})

console.log("=== 5. Lv2（Lv3効果ではない）：同じ破壊でコアはリザーブへ ===")
scenario({
    name: "ex014-lv2-reserve",
    start: {
        me: { spirits: [{ card: DENEBOLA, label: "host", cores: 3 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combine(t, "剣", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.剣.場所: フィールド → 合体",
        "自分.剣.コア: 1 → 0",
        "自分.剣.BP: 3000 → なし",
        "自分.host.BP: 12000 → 15000",
        "自分.host.コア: 3 → 4",
        "自分.host.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 6. Lv3でも合体していない：【合体時】効果なのでコアはリザーブへ ===")
scenario({
    name: "ex014-lv3-alone",
    start: {
        me: { spirits: [{ card: DENEBOLA, label: "host", cores: 5 }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.host.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 7. ソウルコアが載った相手のスピリットを破壊：ソウルコアはボイドへ行かずリザーブへ（SOULCORE.md §1。残りの通常コアはボイド） ===")
scenario({
    name: "ex014-soulcore",
    start: {
        me: { spirits: [{ card: DENEBOLA, label: "host", cores: 5 }, { card: LANCE, label: "剣" }] },
        opp: { soulCore: "壁", spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combine(t, "剣", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.剣.場所: フィールド → 合体",
        "自分.剣.コア: 1 → 0",
        "自分.剣.BP: 3000 → なし",
        "自分.host.BP: 20000 → 23000",
        "自分.host.コア: 5 → 6",
        "自分.host.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ソウルコア: 相手.壁 → リザーブ",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part991）")
