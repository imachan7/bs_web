// smoke パート454（場面テストの道具 scenario.ts の受け入れ。BS13-X04 獅機龍神ストライクヴルム・レオ）
// 期待値は効果文だけから書いた。#229 前のデータ（selfMode 無し）では「書いていない変化」で落ちることを確認済み
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const LEO = "BS13-X04"
const STAR = "BS10-036" // 水晶魚クリスティール（白・系統：空魚/星魂・効果なし）
const VANILLA = "BS01-002" // ロクケラトプス（赤・系統：地竜・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LEO).name === "獅機龍神ストライクヴルム・レオ", "LEOは獅機龍神ストライクヴルム・レオ")
    assert(getCard(STAR).name === "水晶魚クリスティール" && getCard(STAR).family.includes("星魂") && getCard(STAR).effects.length === 0, "STARは効果なしの星魂")
    assert(getCard(VANILLA).name === "ロクケラトプス" && !getCard(VANILLA).family.some((f) => f === "光導" || f === "星魂"), "VANILLAは光導/星魂でない")
}

console.log("=== 1. 自分の星魂がアタックで疲労したとき、レオが回復する ===")
scenario({
    name: "leo-own-star-attacks",
    start: { me: { spirits: [{ card: LEO, label: "レオ", rested: true }, { card: STAR }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("水晶魚クリスティール") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.レオ.疲労: true → false",
        "自分.水晶魚クリスティール.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 2. 系統が違う味方の疲労では回復しない ===")
scenario({
    name: "leo-own-vanilla-attacks",
    start: { me: { spirits: [{ card: LEO, label: "レオ", rested: true }, { card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: [
        "自分.ロクケラトプス.疲労: false → true",
        "相手.ライフ: 5 → 4",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 3. 相手の星魂が疲労しても回復しない（「自分のスピリット」） ===")
scenario({
    name: "leo-opp-star-attacks",
    start: {
        turn: "opp",
        me: { spirits: [{ card: LEO, label: "レオ", rested: true }] },
        opp: { spirits: [{ card: STAR }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("水晶魚クリスティール") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: [
        "相手.水晶魚クリスティール.疲労: false → true",
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part454）")
