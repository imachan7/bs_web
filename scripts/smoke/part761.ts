// smoke パート761（BS10-088 天貫く塔の城：効果文どおり「ブロックしたスピリット上」にコアを置くことの確認）
// STARTER_PLAN §2.1：既存データはネクサス自身に置く誤りだったので、SD11-012 と同じ形に直した。
// SD11-012（part755）と同じ場面を BS10-088 Lv1（効果の記述を持たない自分のスピリット）で写す
import { scenario } from "./scenario"
import { assert, getCard } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    const C = (id: string) => getCard(id)
    assert(C("BS10-088").name === "天貫く塔の城" && C("BS10-088").type === "nexus" && C("BS10-088").colors.join() === "white" && C("BS10-088").cost === 3, "BS10-088は白コスト3のネクサス")
    assert(C("BS10-031").name === "ジャンガリー" && C("BS10-031").effect === "", "BS10-031はバニラ")
    assert(C("BS01-002").name === "ロクケラトプス" && C("BS01-002").effect === "", "BS01-002はバニラ")
}

console.log("=== BS10-088 Lv1･Lv2『相手のアタックステップ』バニラがブロックしたとき、ボイドからコア1個をそのスピリット上に置く ===")
// 効果の記述は「そのスピリット上に置く」：コアはブロックしたジャンガリーに乗り、ネクサス自身には乗らない
scenario({
    name: "bs10-088-e1-core-on-blocker",
    start: { turn: "opp", phase: "attack", me: { spirits: [{ card: "BS10-031" }], nexuses: [{ card: "BS10-088", cores: 0 }] }, opp: { spirits: [{ card: "BS01-002" }] } },
    steps: (t) => {
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジャンガリー") })
        t.closeFlash()
    },
    expect: [
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
        "自分.ジャンガリー.疲労: false → true",
        "自分.ジャンガリー.コア: 1 → 2",
        "自分.ジャンガリー.Lv: 1 → 2",
        "自分.ジャンガリー.BP: 2000 → 3000",
        // 天貫く塔の城のコアは0のまま（コアを置く先がネクサスでないことの確認）
    ],
})
