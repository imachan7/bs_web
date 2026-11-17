// smoke パート992（EX009 月華龍ストライクヴルム・プロキオン：破壊時に手札1枚（かオープンしたマジック1枚）を破棄して回復状態で残る／【合体時】BPを比べ相手のスピリットだけを破壊したときライフ+1）
// 「オープンしたマジック（手元）」の場面は start に手元を置く方法が無いので質問欄に残してある
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const PROCYON = "EX009" // 月華龍ストライクヴルム・プロキオン（黄・コスト6・Lv1 BP4000(1コア)／Lv2 BP6000(2コア)）
const LANCE = "SJ13-23" // 獅魂の剣刃レオンエクスカリバー（白ブレイヴ・コスト4・剣刃）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv2 BP7000・4コア）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PROCYON).name === "月華龍ストライクヴルム・プロキオン" && getCard(HADES).name === "デス・ハーデス", "プロキオンとハーデスの名前")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(BELL).name === "デュアルキャノン・ベル" && getCard(LANCE).type === "brave", "バニラ・ブレイヴの属性")
}

// 選択待ちに答え切る。decline＝スキップ（断る）／cardIndex＝手札のその位置を選ぶ
function settle(t: ScenarioCtx, opt: { decline?: true; cardIndex?: number } = {}): void {
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (opt.decline) t.act(side, { type: "resolveChoice" })
        else if (pc.kind === "card") t.act(side, { type: "resolveChoice", cardIndex: opt.cardIndex ?? pc.cardIndices![0]! })
        else if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        else t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
}

// 相手のターン：ハーデス（BP7000）がアタックし、プロキオン（Lv1 BP4000）がブロックして負ける
function blockAndLose(t: ScenarioCtx): void {
    t.act("opp", { type: "attack", instanceId: t.id("攻") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id("プロキオン") })
    t.closeFlash()
}

const OPP_TURN = {
    turn: "opp" as const,
    phase: "attack" as const,
    interactive: true,
    opp: { spirits: [{ card: HADES, label: "攻", cores: 4 }] },
}

console.log("=== 1. 手札1枚を破棄：破壊されず回復状態で残る ===")
scenario({
    name: "ex009-discard-hand",
    start: { ...OPP_TURN, me: { hand: [ROKU], spirits: [{ card: PROCYON, label: "プロキオン" }] } },
    steps(t) {
        blockAndLose(t)
        settle(t)
    },
    expect: ["自分.手札: ロクケラトプス → なし", "自分.トラッシュ: なし → ロクケラトプス", "相手.攻.疲労: false → true"],
})

console.log("=== 2. 手札が無い（手元にもマジックが無い）：払えず破壊される ===")
scenario({
    name: "ex009-no-hand",
    start: { ...OPP_TURN, me: { spirits: [{ card: PROCYON, label: "プロキオン" }] } },
    steps(t) {
        blockAndLose(t)
        settle(t)
    },
    expect: [
        "自分.プロキオン.場所: フィールド → なし",
        "自分.トラッシュ: なし → 月華龍ストライクヴルム・プロキオン",
        "自分.リザーブ: 10 → 11",
        "相手.攻.疲労: false → true",
    ],
})

console.log("=== 3. 手札があっても断れば破壊される（任意） ===")
scenario({
    name: "ex009-decline",
    start: { ...OPP_TURN, me: { hand: [ROKU], spirits: [{ card: PROCYON, label: "プロキオン" }] } },
    steps(t) {
        blockAndLose(t)
        settle(t, { decline: true })
    },
    expect: [
        "自分.プロキオン.場所: フィールド → なし",
        "自分.トラッシュ: なし → 月華龍ストライクヴルム・プロキオン",
        "自分.リザーブ: 10 → 11",
        "相手.攻.疲労: false → true",
    ],
})

console.log("=== 4. 手札2枚：持ち主が選ぶ（相手は答えられない）。選んだ1枚だけ破棄 ===")
scenario({
    name: "ex009-owner-chooses",
    start: { ...OPP_TURN, me: { hand: [ROKU, BELL], spirits: [{ card: PROCYON, label: "プロキオン" }] } },
    steps(t) {
        blockAndLose(t)
        t.actRejected("opp", { type: "resolveChoice", cardIndex: 0 })
        settle(t, { cardIndex: 1 })
    },
    expect: ["自分.手札: デュアルキャノン・ベル、ロクケラトプス → ロクケラトプス", "自分.トラッシュ: なし → デュアルキャノン・ベル", "相手.攻.疲労: false → true"],
})

console.log("=== 5. 合体アタック時（Lv2）：BP比較で相手のスピリットだけを破壊 → ボイドからライフへ1個 ===")
scenario({
    name: "ex009-combined-life",
    start: {
        me: { spirits: [{ card: PROCYON, label: "host", cores: 2 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("剣"), hostInstanceId: t.id("host") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.剣.場所: フィールド → 合体",
        "自分.剣.コア: 1 → 0",
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 6000 → 9000",
        "自分.host.疲労: false → true",
        "自分.ライフ: 5 → 6",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 6. 同じ合体でも、ブロックされず破壊が起きなければライフは増えない ===")
scenario({
    name: "ex009-combined-unblocked",
    start: { me: { spirits: [{ card: PROCYON, label: "host", cores: 2 }, { card: LANCE, label: "剣" }] } },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("剣"), hostInstanceId: t.id("host") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.剣.場所: フィールド → 合体",
        "自分.剣.コア: 1 → 0",
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 6000 → 9000",
        "自分.host.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 7. ソウルコアがリザーブにある場面：ボイドからのコアはライフへ置かれ、ソウルコアはリザーブから動かない ===")
scenario({
    name: "ex009-combined-soulcore",
    start: {
        me: { soulCore: "リザーブ", spirits: [{ card: PROCYON, label: "host", cores: 2 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: ROKU, label: "壁" }] },
    },
    steps(t) {
        t.act("me", { type: "combineBrave", braveInstanceId: t.id("剣"), hostInstanceId: t.id("host") })
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("host") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: [
        "自分.剣.場所: フィールド → 合体",
        "自分.剣.コア: 1 → 0",
        "自分.リザーブ: 10 → 11",
        "自分.host.BP: 6000 → 9000",
        "自分.host.疲労: false → true",
        "自分.ライフ: 5 → 6",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part992）")
