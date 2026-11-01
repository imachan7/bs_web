// smoke パート728（付与された【聖命】の働き。effectGrant の granted.keywordBody：元から持つ個体には付けず、重なっても1回）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ISLAND = "BS11-070" // 彷徨う無重力島（Lv2：お互いのアタックステップ、戯狩に【聖命】）
const KUDA = "BS15-037" // クダギツネン（黄・コスト0・戯狩・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ISLAND).name === "彷徨う無重力島" && getCard(ISLAND).type === "nexus", "ISLANDは彷徨う無重力島")
    assert(getCard(KUDA).name === "クダギツネン" && getCard(KUDA).family.includes("戯狩") && getCard(KUDA).effect === "", "KUDAは効果なしの戯狩")
}

const attackAndTake = (t: ScenarioCtx) => {
    t.act("me", { type: "attack", instanceId: t.id("クダギツネン") })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}

console.log("=== BS11-070 Lv2：与えられた【聖命】で、アタックで相手のライフを減らすと自分のライフ+1 ===")
scenario({
    name: "無重力島Lv2の聖命",
    start: { phase: "attack", me: { nexuses: [{ card: ISLAND, cores: 2 }], spirits: [{ card: KUDA }] } },
    steps: attackAndTake,
    expect: ["自分.クダギツネン.疲労: false → true", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 6"],
})

console.log("=== BS11-070 Lv1：【聖命】は与えない ===")
scenario({
    name: "無重力島Lv1",
    start: { phase: "attack", me: { nexuses: [{ card: ISLAND, cores: 0 }], spirits: [{ card: KUDA }] } },
    steps: attackAndTake,
    expect: ["自分.クダギツネン.疲労: false → true", "自分.デッキ枚数: 40 → 39", "自分.手札: なし → ロクケラトプス", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 無重力島2つ：【聖命】は重ねて持っても1回 ===")
scenario({
    name: "無重力島2つ",
    start: { phase: "attack", me: { nexuses: [{ card: ISLAND, cores: 2, label: "島A" }, { card: ISLAND, cores: 2, label: "島B" }], spirits: [{ card: KUDA }] } },
    steps: attackAndTake,
    expect: ["自分.クダギツネン.疲労: false → true", "自分.デッキ枚数: 40 → 38", "自分.手札: なし → ロクケラトプス、ロクケラトプス", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11", "自分.ライフ: 5 → 6"],
})

console.log("すべてのチェックに合格しました 🎉（part728）")
