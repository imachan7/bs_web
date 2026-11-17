// smoke パート994（EX013 堕天龍アポロドラゴン・アークトゥルス／EX020 英雄鳥ロード・キジ・トリア）
// EX013 のソウルコア場面（コアを1個に減らすときソウルコアが残るか）は質問欄に残してある
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx, Side } from "./scenario"

const ARCTURUS = "EX013" // 堕天龍アポロドラゴン・アークトゥルス（紫・コスト6・Lv1 BP4000(1コア)／Lv2 BP7000(2コア)）
const KIJI = "EX020" // 英雄鳥ロード・キジ・トリア（白・コスト4・雄将・Lv1 BP4000(1コア)／Lv2 BP6000(2コア)）
const RED_LORD = "SJ12-02" // 最強英雄ロード・ドラゴン・レッド（赤・覇皇・Lv1 BP5000。バースト：自分のライフ減少後）
const LANCE = "SJ13-23" // 獅魂の剣刃レオンエクスカリバー（白ブレイヴ・コスト4・剣刃）
const DARK = "BS03-018" // ダークレイス（紫・コスト4・Lv2 BP4000・3コア）
const HADES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv2 BP7000・4コア）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1 BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ARCTURUS).name === "堕天龍アポロドラゴン・アークトゥルス" && getCard(KIJI).name === "英雄鳥ロード・キジ・トリア", "EX013とEX020の名前")
    assert(getCard(KIJI).family?.includes("雄将") === true && getCard(RED_LORD).family?.includes("覇皇") === true, "雄将・覇皇の系統")
    assert(getCard(DARK).name === "ダークレイス" && getCard(HADES).name === "デス・ハーデス" && getCard(METAL).name === "メタルバーン", "バニラの名前")
}

function settle(t: ScenarioCtx): void {
    for (let i = 0; i < 10 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side: Side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "card") t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        else if (pc.kind === "option") t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        else t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
    }
}

console.log("=== EX013 1. アタック時：疲労状態の相手のスピリットを指定してアタックできる ===")
scenario({
    name: "ex013-designate-rested",
    start: {
        me: { spirits: [{ card: ARCTURUS, label: "host" }] },
        opp: { spirits: [{ card: ROKU, label: "的", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("host"), targetSpiritInstanceId: t.id("的") })
        t.closeFlash()
    },
    expect: [
        "自分.host.疲労: false → true",
        "相手.的.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== EX013 2. 回復状態の相手は指定できない／EX013以外のスピリットは指定アタックできない ===")
scenario({
    name: "ex013-designate-rejected",
    start: {
        me: { spirits: [{ card: ARCTURUS, label: "host" }, { card: METAL, label: "他" }] },
        opp: { spirits: [{ card: ROKU, label: "回復", rested: false }, { card: HADES, label: "疲労", rested: true, cores: 4 }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.actRejected("me", { type: "attack", instanceId: t.id("host"), targetSpiritInstanceId: t.id("回復") })
        t.actRejected("me", { type: "attack", instanceId: t.id("他"), targetSpiritInstanceId: t.id("疲労") })
    },
    expect: [],
})

const combineAttack = (t: ScenarioCtx) => {
    t.act("me", { type: "combineBrave", braveInstanceId: t.id("剣"), hostInstanceId: t.id("host") })
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("host") })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
const COMBINED = ["自分.剣.場所: フィールド → 合体", "自分.剣.コア: 1 → 0", "自分.リザーブ: 10 → 11", "自分.host.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

console.log("=== EX013 3. 合体アタック時（Lv2）：相手のスピリット1体のコアを1個になるようにトラッシュへ（4個→1個。Lv2→Lv1） ===")
scenario({
    name: "ex013-combined-core1",
    start: {
        me: { spirits: [{ card: ARCTURUS, label: "host", cores: 2 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: HADES, label: "的", cores: 4, rested: true }] },
    },
    steps: combineAttack,
    expect: [...COMBINED, "自分.host.BP: 7000 → 10000", "相手.的.コア: 4 → 1", "相手.的.Lv: 2 → 1", "相手.的.BP: 7000 → 4000", "相手.トラッシュのコア: 0 → 3"],
})

console.log("=== EX013 4. 合体していても Lv1：Lv2･Lv3 の効果なのでコアは減らない ===")
scenario({
    name: "ex013-combined-lv1",
    start: {
        me: { spirits: [{ card: ARCTURUS, label: "host", cores: 1 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: HADES, label: "的", cores: 4, rested: true }] },
    },
    steps: combineAttack,
    expect: [...COMBINED, "自分.host.BP: 4000 → 7000"],
})

console.log("=== EX013 5. すでにコア1個の相手：変化なし ===")
scenario({
    name: "ex013-combined-already1",
    start: {
        me: { spirits: [{ card: ARCTURUS, label: "host", cores: 2 }, { card: LANCE, label: "剣" }] },
        opp: { spirits: [{ card: ROKU, label: "的", rested: true }] },
    },
    steps: combineAttack,
    expect: [...COMBINED, "自分.host.BP: 7000 → 10000"],
})

// 相手のターン。ダークレイス（Lv2 BP4000）がアタックし、キジ（Lv1 BP4000）が/ほかのスピリットがブロックする
const oppAttacks = (t: ScenarioCtx, blocker: string) => {
    t.act("opp", { type: "attack", instanceId: t.id("攻") })
    t.closeFlash()
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    t.closeFlash()
}
const OPP_DARK = { spirits: [{ card: DARK, label: "攻", cores: 3 }] }

console.log("=== EX020 1. 相手のターン・バーストをセット中：雄将の自分のスピリット（自身）がBP+3000。同BPでも勝って残る ===")
scenario({
    name: "ex020-burst-set",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: KIJI, label: "鳥" }], burst: RED_LORD }, opp: OPP_DARK },
    steps: (t) => oppAttacks(t, "鳥"),
    expect: ["相手.攻.場所: フィールド → なし", "相手.トラッシュ: なし → ダークレイス", "相手.リザーブ: 10 → 13", "自分.鳥.疲労: false → true"],
})

console.log("=== EX020 2. バーストをセットしていない：同BP（4000対4000）で相打ち ===")
scenario({
    name: "ex020-no-burst",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: KIJI, label: "鳥" }] }, opp: OPP_DARK },
    steps: (t) => oppAttacks(t, "鳥"),
    expect: [
        "相手.攻.場所: フィールド → なし",
        "相手.トラッシュ: なし → ダークレイス",
        "相手.リザーブ: 10 → 13",
        "自分.鳥.場所: フィールド → なし",
        "自分.トラッシュ: なし → 英雄鳥ロード・キジ・トリア",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== EX020 3. 自分のターンには効かない（「相手のターン」）：バーストをセットしていてもBP4000のまま、BP7000の相手に負ける ===")
scenario({
    name: "ex020-my-turn",
    start: { me: { spirits: [{ card: KIJI, label: "鳥" }], burst: RED_LORD }, opp: { spirits: [{ card: HADES, label: "壁", cores: 4 }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("鳥") })
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        t.closeFlash()
    },
    expect: ["自分.鳥.場所: フィールド → なし", "自分.トラッシュ: なし → 英雄鳥ロード・キジ・トリア", "自分.リザーブ: 10 → 11", "相手.壁.疲労: false → true"],
})

console.log("=== EX020 4. 系統「覇皇」の自分のスピリットも+3000（BP5000→8000）。BP7000のアタッカーに勝つ ===")
scenario({
    name: "ex020-haou",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: KIJI, label: "鳥" }, { card: RED_LORD, label: "覇皇" }], burst: RED_LORD },
        opp: { spirits: [{ card: HADES, label: "攻", cores: 4 }] },
    },
    steps: (t) => oppAttacks(t, "覇皇"),
    expect: ["相手.攻.場所: フィールド → なし", "相手.トラッシュ: なし → デス・ハーデス", "相手.リザーブ: 10 → 14", "自分.覇皇.疲労: false → true"],
})

console.log("=== EX020 5. 雄将でも覇皇でもないスピリットは+3000されない：ロクケラトプス同士で相打ち ===")
scenario({
    name: "ex020-other-family",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: KIJI, label: "鳥" }, { card: ROKU, label: "ロク" }], burst: RED_LORD },
        opp: { spirits: [{ card: ROKU, label: "攻" }] },
    },
    steps: (t) => oppAttacks(t, "ロク"),
    expect: [
        "相手.攻.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ロク.場所: フィールド → なし",
        "自分.トラッシュ: なし → ロクケラトプス",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("=== EX020 6. Lv2：エンドステップ、バーストをセットしていないとき手札のバースト効果持ちを1枚セットできる ===")
scenario({
    name: "ex020-endstep-set",
    start: { interactive: true, me: { hand: [RED_LORD], spirits: [{ card: KIJI, label: "鳥", cores: 2 }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        settle(t)
    },
    // 後半は相手のターン開始（ドロー・コア）と、セットしたバーストによる相手のターン中のBP+3000
    expect: [
        "自分.手札: 最強英雄ロード・ドラゴン・レッド → なし",
        "自分.バースト: なし → 最強英雄ロード・ドラゴン・レッド",
        "自分.鳥.BP: 6000 → 9000",
        "相手.手札: なし → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== EX020 7. Lv1（Lv2の効果ではない）：同じ手札でも聞かれず、セットされない ===")
scenario({
    name: "ex020-endstep-lv1",
    start: { interactive: true, me: { hand: [RED_LORD], spirits: [{ card: KIJI, label: "鳥", cores: 1 }] } },
    steps(t) {
        t.act("me", { type: "endTurn" })
        settle(t)
    },
    expect: ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part994）")
