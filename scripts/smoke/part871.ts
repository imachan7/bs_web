// smoke パート871（BS23-071 聖ミカファール大聖堂「スピリットすべては、効果では疲労しない」が、コストの疲労も止める入口3つ。2026-11-09 ユーザー確認・Q22553）
// 入口：pay の「このスピリットを疲労させることで」／マジック無効化【氷壁】のスピリット自身の疲労／復活の発生源の疲労（ネクサスは止めない）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const CATHEDRAL = "BS23-071" // 聖ミカファール大聖堂（Lv1 は 0 コアで働く）
const TERI = "BS18-001" // テリジーノ（赤・コスト1・「このスピリットを疲労させることで」で相手の召喚したスピリットを破壊）
const MAIPA = "BS06-029" // メイパロット（緑・コスト3・召喚時にボイドからコアを自分のスピリットへ）
const PX08 = "PX08" // 甲蟲武神ギラファ・ランドウ（緑・【氷壁：紫/白/青】）
const POISON = "BS01-129" // ポイズンシュート（紫マジック・コスト5・スピリット1体の上のコア1個をリザーブへ）
const ROKU = "BS01-002" // ロクケラトプス
const TOMB = "BS17-069" // 輝く三連王墓（ネクサス。Lv2 で光芒持ちを疲労状態で残す。疲労コストの発生源がネクサス）
const FERN = "BS17-045" // 黄玉の女王フェルネイト（光芒持ち）
const METAL = "BS01-008" // メタルバーン

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CATHEDRAL).name === "聖ミカファール大聖堂" && getCard(CATHEDRAL).type === "nexus", "CATHEDRALは聖ミカファール大聖堂")
    assert(getCard(TERI).name === "テリジーノ" && getCard(TERI).cost === 1, "TERIはテリジーノ")
    assert(getCard(MAIPA).name === "メイパロット" && getCard(MAIPA).cost === 3, "MAIPAはメイパロット")
    assert(getCard(PX08).name === "甲蟲武神ギラファ・ランドウ", "PX08はギラファ・ランドウ")
    assert(getCard(POISON).name === "ポイズンシュート" && getCard(POISON).cost === 5, "POISONはポイズンシュート")
    assert(getCard(TOMB).name === "輝く三連王墓" && getCard(FERN).name === "黄玉の女王フェルネイト", "TOMB / FERN")
}

const cathedral = { card: CATHEDRAL, label: "大聖堂", cores: 0 }
const yes = (t: ScenarioCtx): void => {
    const option = t.state.pendingChoice?.options?.[0]
    if (option === undefined) throw new Error("確認の選択肢が無い")
    t.act("me", { type: "resolveChoice", option })
}

// ───────── 入口1：pay（テリジーノ）。メイパロット（コスト3）の召喚：リザーブ10→8（軽減1）、コア2個で Lv2・BP3000 ─────────
const maipaRows = [
    "相手.リザーブ: 10 → 6", "相手.トラッシュのコア: 0 → 3", `相手.手札: ${getCard(MAIPA).name} → なし`,
    "相手.メイパロット.BP: なし → 3000", "相手.メイパロット.Lv: なし → 2", "相手.メイパロット.コア: なし → 2",
    "相手.メイパロット.場所: なし → フィールド", "相手.メイパロット.疲労: なし → false",
]
console.log("=== 1. pay：071 があるとテリジーノは自分を疲労させるコストを払えず、確認も出ない ===")
scenario({
    name: "pay-teri-locked",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: TERI }], nexuses: [cathedral] }, opp: { hand: [MAIPA] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        assert(t.state.pendingChoice === null, "疲労コストが払えないので確認は出ない")
    },
    expect: maipaRows,
})
console.log("=== 1b. pay 対照：071 が無ければ確認が出て、払うとメイパロットが破壊されテリジーノが疲労する ===")
scenario({
    name: "pay-teri-control",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: TERI }] }, opp: { hand: [MAIPA] } },
    steps: (t) => {
        t.act("opp", { type: "summon", handIndex: 0 })
        yes(t)
    },
    expect: [
        "相手.リザーブ: 10 → 8", "相手.トラッシュのコア: 0 → 3", `相手.手札: ${getCard(MAIPA).name} → なし`,
        `相手.トラッシュ: なし → ${getCard(MAIPA).name}`, "自分.テリジーノ.疲労: false → true",
    ],
})

// ───────── 入口2：【氷壁】（ギラファ・ランドウ）。ポイズンシュートは ロクケラトプス(2コア)の上のコア1個を取り除く ─────────
const poisonCost = ["相手.手札: ポイズンシュート → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5", "相手.トラッシュ: なし → ポイズンシュート"]
const castPoison = (t: ScenarioCtx): void => {
    t.act("opp", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("自分.ロクケラトプス") })
    for (let i = 0; i < 30 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        t.act(pc.pid === t.me ? "me" : "opp", pc.kind === "target" ? { type: "resolveChoice", instanceId: pc.candidates[0]! } : { type: "resolveChoice" })
    }
}
console.log("=== 2. 氷壁：071 があるとギラファは疲労できず、マジックは無効にされない ===")
scenario({
    name: "hyoheki-locked",
    start: { turn: "opp", me: { spirits: [{ card: PX08 }, { card: ROKU, cores: 2 }], nexuses: [cathedral] }, opp: { hand: [POISON] } },
    steps: castPoison,
    expect: [...poisonCost, "自分.ロクケラトプス.コア: 2 → 1", "自分.ロクケラトプス.Lv: 2 → 1", "自分.ロクケラトプス.BP: 3000 → 1000", "自分.リザーブ: 10 → 11"],
})
console.log("=== 2b. 氷壁 対照：071 が無ければギラファが疲労してマジックを無効にする ===")
scenario({
    name: "hyoheki-control",
    start: { turn: "opp", me: { spirits: [{ card: PX08 }, { card: ROKU, cores: 2 }] }, opp: { hand: [POISON] } },
    steps: castPoison,
    expect: [...poisonCost, "自分.甲蟲武神ギラファ・ランドウ.疲労: false → true"],
})

// ───────── 入口3：復活の疲労コスト。プールの発生源は全部ネクサスなので、止めないことを確かめる ─────────
// 発生源がスピリットの reviveOnDestroy は現プールに無く、スピリット側の判定（revive.ts）はこの smoke では通らない
console.log("=== 3. 復活：疲労コストの発生源がネクサスなら 071 があっても残せる（ネクサスの疲労は止めない） ===")
scenario({
    name: "revive-nexus-source-not-locked",
    start: {
        turn: "opp", phase: "attack", interactive: true,
        me: { spirits: [{ card: FERN, label: "U" }], nexuses: [{ card: TOMB, cores: 2 }, cathedral] },
        opp: { spirits: [{ card: METAL, label: "敵メタル", cores: 8 }] },
    },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("敵メタル") })
        t.act("me", { type: "pass" })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("U") })
        t.closeFlash()
        yes(t)
    },
    expect: ["相手.敵メタル.疲労: false → true", "自分.U.疲労: false → true", "自分.輝く三連王墓.疲労: false → true"],
})

console.log("すべてのチェックに合格しました 🎉（part871）")
