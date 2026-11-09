// smoke パート845（BS23 B5：X06 異海双龍ハスターク の「手札を破棄しなければブロックできない」節と「シンボル2つにする」節。BS23_PLAN §1・Q4613〜Q4616・Q4620。実装前に書いた期待値テスト）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const X06 = "BS23-X06" // 異海双龍ハスターク（青・コスト9・異合/海首・シンボル青2・Lvコア1/2/6）
const DORAT = "BS20-046" // ドラットフィッシュ（青・コスト2・異合・シンボル青1・Lv1 BP4000・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・シンボル赤1・Lv1 BP1000・効果なし）
const STAGGER = "BS12-041" // スタッガー（青・コスト1・異合・Lv1 BP2000・効果なし）
const DEMON = "BS19-013" // ダーク・デモボーン（紫・コスト2・無魔・シンボル紫1・【連鎖】を持つ。Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X06).name === "異海双龍ハスターク" && getCard(X06).family.includes("異合") && getCard(X06).cost === 9, "X06は異海双龍ハスターク（異合・コスト9）")
    assert(getCard(DORAT).name === "ドラットフィッシュ" && getCard(DORAT).family.includes("異合") && getCard(DORAT).effect === "", "DORATは異合・効果なし")
    assert(getCard(VAN).name === "ロクケラトプス" && !getCard(VAN).family.includes("異合") && getCard(VAN).effect === "", "VANは異合でない・効果なし")
    assert(getCard(STAGGER).name === "スタッガー" && getCard(STAGGER).family.includes("異合") && getCard(STAGGER).effect === "", "STAGGERは異合・効果なし")
    assert(getCard(DEMON).name === "ダーク・デモボーン" && !getCard(DEMON).family.includes("異合") && getCard(DEMON).effect.includes("【連鎖："), "DEMONは異合でなく連鎖を持つ")
}

// 選択待ちを答える。手札の破棄は最初の候補、確認は断る
function drain(t: ScenarioCtx, side: Side): void {
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice as { cardIndices?: number[]; candidates?: string[] }
        if (pc.cardIndices?.[0] !== undefined) t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else if (pc.candidates?.[0] !== undefined) t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else t.act(side, { type: "resolveChoice" })
    }
}

console.log("=== 節1: 異合のスピリットのアタックに、相手は手札1枚を破棄してブロックする（ブロックと同時＝Q4614） ===")
scenario({
    name: "x06-block-discard-ok",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }, { card: DORAT, label: "異合兵" }] },
        opp: { hand: [STAGGER], spirits: [{ card: VAN, label: "壁" }] },
        phase: "attack",
        interactive: true,
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("異合兵") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        drain(t, "opp")
        t.closeFlash()
    },
    expect: [
        "自分.異合兵.疲労: false → true",
        "相手.手札: スタッガー → なし",
        "相手.トラッシュ: なし → スタッガー、ロクケラトプス",
        "相手.壁.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 節1: 手札が無ければブロックできない（Q4615）。ブロックされないわけではなくライフで受ける ===")
scenario({
    name: "x06-block-no-hand",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }, { card: DORAT, label: "異合兵" }] },
        opp: { spirits: [{ card: VAN, label: "壁" }] },
        phase: "attack",
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("異合兵") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("壁") })
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.異合兵.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 節1: X06 自身のアタックにも効く（Q4613） ===")
scenario({
    name: "x06-self-attack",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }] },
        opp: { hand: [STAGGER], spirits: [{ card: VAN, label: "壁" }] },
        phase: "attack",
        interactive: true,
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ハスターク") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        drain(t, "opp")
        t.closeFlash()
    },
    expect: [
        "自分.ハスターク.疲労: false → true",
        "相手.手札: スタッガー → なし",
        "相手.トラッシュ: なし → スタッガー、ロクケラトプス",
        "相手.壁.場所: フィールド → なし",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 節1: X06 自身のアタックで手札が無ければブロックできない ===")
scenario({
    name: "x06-self-attack-no-hand",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }] },
        opp: { spirits: [{ card: VAN, label: "壁" }] },
        phase: "attack",
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("ハスターク") })
        t.closeFlash()
        t.actRejected("opp", { type: "block", instanceId: t.id("壁") })
    },
    expect: ["自分.ハスターク.疲労: false → true"],
})

console.log("=== 節1: 異合でないスピリットのアタックには効かない（手札があっても破棄なしでブロックできる） ===")
scenario({
    name: "x06-nonfamily-attack",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク" }, { card: VAN, label: "赤兵" }] },
        opp: { hand: [STAGGER], spirits: [{ card: STAGGER, label: "壁" }] },
        phase: "attack",
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("赤兵") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    // BP1000 対 BP2000 でアタッカーが負ける。ブロッカーは疲労する
    expect: ["自分.赤兵.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11", "相手.壁.疲労: false → true"],
})

console.log("=== 節1: 相手のターンの相手の異合のアタックには効かない（『自分のアタックステップ』限定） ===")
scenario({
    name: "x06-opp-turn",
    start: {
        turn: "opp",
        me: { hand: [STAGGER], spirits: [{ card: X06, label: "ハスターク" }, { card: VAN, label: "壁" }] },
        opp: { spirits: [{ card: DORAT, label: "異合兵" }] },
        phase: "attack",
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("異合兵") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    // BP4000 対 BP1000 でブロッカーが負ける。手札は破棄されない
    expect: ["相手.異合兵.疲労: false → true", "自分.壁.場所: フィールド → なし", "自分.トラッシュ: なし → ロクケラトプス", "自分.リザーブ: 10 → 11"],
})

console.log("=== 節3: Lv2/Lv3 では、異合のスピリットのシンボルが同じ色2つになる（ライフ2減る）。Lv1 では1 ===")
for (const [label, cores, lifeLoss] of [["Lv1", 1, 1], ["Lv2", 2, 2], ["Lv3", 6, 2]] as const) {
    scenario({
        name: `x06-symbol-family-${label}`,
        start: {
            me: { spirits: [{ card: X06, label: "ハスターク", cores }, { card: DORAT, label: "異合兵" }] },
            opp: {},
            phase: "attack",
        },
        steps(t) {
            t.act("me", { type: "attack", instanceId: t.id("異合兵") })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.異合兵.疲労: false → true",
            `相手.ライフ: 5 → ${5 - lifeLoss}`,
            `相手.リザーブ: 10 → ${10 + lifeLoss}`,
        ],
    })
}

console.log("=== 節3: 【連鎖】を持つスピリットも2つになる（異合でなくても） ===")
scenario({
    name: "x06-symbol-chain",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク", cores: 2 }, { card: DEMON, label: "連鎖兵" }] },
        opp: {},
        phase: "attack",
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("連鎖兵") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.連鎖兵.疲労: false → true", "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
})

console.log("=== 節3: 異合でも【連鎖】持ちでもないスピリットは1つのまま ===")
scenario({
    name: "x06-symbol-other",
    start: {
        me: { spirits: [{ card: X06, label: "ハスターク", cores: 2 }, { card: VAN, label: "赤兵" }] },
        opp: {},
        phase: "attack",
    },
    steps(t) {
        t.act("me", { type: "attack", instanceId: t.id("赤兵") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.赤兵.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 節3: 相手のスピリットのシンボルは変わらない（相手のターン、相手の異合がアタック） ===")
scenario({
    name: "x06-symbol-opp-turn",
    start: {
        turn: "opp",
        me: { spirits: [{ card: X06, label: "ハスターク", cores: 2 }] },
        opp: { spirits: [{ card: DORAT, label: "異合兵" }] },
        phase: "attack",
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("異合兵") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: ["相手.異合兵.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part845）")
