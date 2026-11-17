// smoke パート990（SJ13-03 大魔鋏デス・シザー：【合体時】BPを比べ破壊した相手のスピリットと、このアタックで減る相手ライフのコアはトラッシュへ。
// 効果による破壊のコアはリザーブのまま。Q21820＝【重装甲】で防げない）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SCISSORS = "SJ13-03" // 大魔鋏デス・シザー（紫ブレイヴ・コスト4・剣刃。合体条件コスト4以上）
const HOST = "BS03-018" // ダークレイス（紫・コスト4・Lv1 BP2000／Lv2 BP4000）
const WEAPON = "SJ13-02" // ウェポンマスター・ドラゴン（赤・コスト8・Lv2 BP10000。合体アタック時 BP5000以下の相手1体を破壊）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SCISSORS).name === "大魔鋏デス・シザー", "SJ13-03の名前")
    assert(getCard(HOST).name === "ダークレイス" && getCard(WEAPON).name === "ウェポンマスター・ドラゴン" && getCard(ROKU).name === "ロクケラトプス", "ほかのカードの名前")
}
// メインステップで合体 → アタックステップへ。ブレイヴが載せていたコアはリザーブへ戻る
function combine(t: ScenarioCtx, brave: string, host: string): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(brave), hostInstanceId: t.id(host) })
    t.act("me", { type: "nextPhase" })
}

const COMBINED = ["自分.シザー.場所: フィールド → 合体", "自分.シザー.コア: 1 → 0"]

console.log("=== 1. BPを比べて破壊：相手のコアはトラッシュへ（リザーブは増えない） ===")
scenario({
    name: "sj1303-bp-destroy",
    start: {
        me: { spirits: [{ card: HOST, label: "host" }, { card: SCISSORS, label: "シザー" }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combine(t, "シザー", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        ...COMBINED,
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 2000 → 5000",
        "自分.host.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.トラッシュのコア: 0 → 1",
    ],
})

console.log("=== 2. 合体していない（ブレイヴ無し）：同じ破壊でコアはリザーブへ ===")
scenario({
    name: "sj1303-no-combine",
    start: {
        me: { spirits: [{ card: HOST, label: "host" }] },
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

console.log("=== 3. アンブロックのライフダメージ：減るライフのコアはトラッシュへ ===")
scenario({
    name: "sj1303-life-damage",
    start: { me: { spirits: [{ card: HOST, label: "host" }, { card: SCISSORS, label: "シザー" }] } },
    steps(t) {
        combine(t, "シザー", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        ...COMBINED,
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 2000 → 5000",
        "自分.host.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.トラッシュのコア: 0 → 1",
    ],
})

console.log("=== 4. 効果による破壊（SJ13-02のLv2合体アタック時）は「BPを比べ」ではないので、そのコアはリザーブのまま。ライフのコアだけトラッシュ ===")
scenario({
    name: "sj1303-effect-destroy",
    start: {
        me: { spirits: [{ card: WEAPON, label: "host", cores: 3 }, { card: SCISSORS, label: "シザー" }] },
        opp: { spirits: [{ card: ROKU, label: "標的", rested: true }] },
    },
    steps(t) {
        combine(t, "シザー", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        ...COMBINED,
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 10000 → 13000",
        "自分.host.疲労: false → true",
        "相手.標的.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "相手.ライフ: 5 → 4",
        "相手.トラッシュのコア: 0 → 1",
    ],
})

console.log("=== 5. ソウルコアが載った相手のスピリットをBP比較で破壊：ソウルコアもトラッシュへ（質問あり：ソウルコアがトラッシュへ行ってよいか） ===")
scenario({
    name: "sj1303-soulcore",
    start: {
        me: { spirits: [{ card: HOST, label: "host" }, { card: SCISSORS, label: "シザー" }] },
        opp: { soulCore: "壁", spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combine(t, "シザー", "host")
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        ...COMBINED,
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 2000 → 5000",
        "自分.host.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.トラッシュのコア: 0 → 1",
        "相手.ソウルコア: 壁 → トラッシュ",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part990）")
