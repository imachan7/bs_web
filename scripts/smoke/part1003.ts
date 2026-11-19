// smoke パート1003（P13-12 光機ミョルニール：合体アタックがコスト4以下にブロックされたとき、自分の合体スピリット1体を選んで回復。
// 白の【強化】で体数+1。#641＝発生源自身しか回復せず、【強化】も効かなかった）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const MJOL = "P13-12" // 光機ミョルニール（白ブレイヴ・コスト4・合体条件コスト4以上）
const SCISSORS = "SJ13-03" // 大魔鋏デス・シザー（紫ブレイヴ・コスト4）
const HOST = "BS03-018" // ダークレイス（紫・コスト4・Lv1 BP2000）
const GAE = "BS21-031" // 神機ゲイボルグ（白・Lv2【強化】スピリット回復効果の体数+1）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5・Lv1 BP4000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MJOL).name === "光機ミョルニール" && getCard(MJOL).type === "brave" && getCard(MJOL).cost === 4, "P13-12の名前")
    assert(getCard(SCISSORS).name === "大魔鋏デス・シザー" && getCard(HOST).name === "ダークレイス" && getCard(HOST).cost === 4, "合体のカード")
    assert(getCard(GAE).name === "神機ゲイボルグ" && getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).cost === 1, "ほかのカード")
    assert(getCard(MELT).name === "火吹きメルト" && getCard(MELT).cost === 5, "MELTはコスト5")
}

function combineBoth(t: ScenarioCtx): void {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("ミョル"), hostInstanceId: t.id("攻め") })
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("シザー"), hostInstanceId: t.id("休み") })
    t.act("me", { type: "nextPhase" })
}

function attackAndBlock(t: ScenarioCtx): void {
    t.act("me", { type: "attack", instanceId: t.id("攻め") })
    t.closeFlash()
    t.act("opp", { type: "block", instanceId: t.id("壁") })
}

const COMBINED = [
    "自分.ミョル.場所: フィールド → 合体", "自分.ミョル.コア: 1 → 0", "自分.ミョル.BP: 3000 → なし",
    "自分.シザー.場所: フィールド → 合体", "自分.シザー.コア: 1 → 0", "自分.シザー.BP: 3000 → なし",
    "自分.攻め.コア: 1 → 2", "自分.攻め.BP: 2000 → 5000",
    "自分.休み.コア: 1 → 2", "自分.休み.BP: 2000 → 5000",
]
const BATTLE = ["相手.壁.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]

console.log("=== 1. 疲労中の別の合体スピリットを選んで回復できる（アタックした側は疲労のまま） ===")
scenario({
    name: "p1312-pick-other",
    start: {
        interactive: true,
        me: { spirits: [{ card: HOST, label: "攻め" }, { card: MJOL, label: "ミョル" }, { card: HOST, label: "休み", rested: true }, { card: SCISSORS, label: "シザー" }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combineBoth(t)
        attackAndBlock(t)
        const pc = t.state.pendingChoice
        assert(pc?.kind === "target" && pc.candidates.includes(t.id("休み")) && pc.candidates.includes(t.id("攻め")), "回復の対象に合体スピリット2体が候補として出る")
        t.act("me", { type: "resolveChoice", instanceId: t.id("休み") })
        t.closeFlash()
    },
    expect: [...COMBINED, "自分.攻め.疲労: false → true", "自分.休み.疲労: true → false", ...BATTLE],
})

console.log("=== 2. 白の【強化】で2体：両方回復する ===")
scenario({
    name: "p1312-kyoka",
    start: {
        me: { spirits: [{ card: HOST, label: "攻め" }, { card: MJOL, label: "ミョル" }, { card: HOST, label: "休み", rested: true }, { card: SCISSORS, label: "シザー" }, { card: GAE, label: "強化", cores: 2 }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        combineBoth(t)
        attackAndBlock(t)
        t.closeFlash()
    },
    expect: [...COMBINED, "自分.休み.疲労: true → false", ...BATTLE],
})

console.log("=== 3. コスト5以上にブロックされたら回復しない ===")
scenario({
    name: "p1312-cost5",
    start: {
        me: { spirits: [{ card: HOST, label: "攻め" }, { card: MJOL, label: "ミョル" }, { card: HOST, label: "休み", rested: true }, { card: SCISSORS, label: "シザー" }] },
        opp: { spirits: [{ card: MELT, label: "壁" }] },
    },
    steps(t) {
        combineBoth(t)
        attackAndBlock(t)
        t.closeFlash()
    },
    expect: [...COMBINED, "自分.攻め.疲労: false → true", "相手.壁.場所: フィールド → なし", "相手.トラッシュ: なし → 火吹きメルト", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part1003）")
