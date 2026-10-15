// smoke パート589（BS16-045 オフィエル Lv3：オリンピアのスピリットに『バトル時』相手すべてをLv1扱いにする能力を与える）
// 『バトル時』＝アタック時・ブロック時と同じ発揮点、期間はそのバトルの終わりまで（2026-10-15 ユーザー確認）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const OPHIEL = "BS16-045" // オリンピアの天使長オフィエル（黄・コスト8・Lv3は5コア）
const FULL = "BS12-035" // オリンピアの天使フル（黄・コスト3・Lv1 BP1000）
const ROKU = "BS01-002" // ロクケラトプス（Lv1 BP1000）
const OPP = "BS01-002" // 相手側のLv/BP観測用（Lv2は2コア・BP3000、Lv1はBP1000。アタック時の自前効果が無い）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(OPHIEL).name === "オリンピアの天使長オフィエル", "OPHIELはオフィエル")
    assert(getCard(FULL).name === "オリンピアの天使フル", "FULLはフル")
    assert(getCard(ROKU).name === "ロクケラトプス", "ROKUはロクケラトプス")
    assert(getCard(OPP).name === "ロクケラトプス", "OPPはロクケラトプス")
}

const attackAndClose = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], label: string) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(label) })
    t.closeFlash()
}

console.log("=== 1. Lv3のオフィエルがいる間、オリンピアのスピリットのアタックで相手すべてがLv1扱い ===")
scenario({
    name: "oph-attack",
    start: { me: { spirits: [{ card: OPHIEL, cores: 5 }, { card: FULL }] }, opp: { spirits: [{ card: OPP, cores: 2, label: "敵" }] } },
    steps(t) {
        attackAndClose(t, "オリンピアの天使フル")
    },
    expect: ["自分.オリンピアの天使フル.疲労: false → true", "相手.敵.Lv: 2 → 1", "相手.敵.BP: 3000 → 1000"],
})

console.log("=== 2. バトルが終わると元に戻る（ライフで受けた後は疲労とライフの変化だけ） ===")
scenario({
    name: "oph-restore",
    start: { me: { spirits: [{ card: OPHIEL, cores: 5 }, { card: FULL }] }, opp: { spirits: [{ card: OPP, cores: 2, label: "敵" }] } },
    steps(t) {
        attackAndClose(t, "オリンピアの天使フル")
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.オリンピアの天使フル.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("=== 3. 相手のターンにオリンピアの個体がブロックしたときも相手すべてがLv1扱い ===")
scenario({
    name: "oph-block",
    start: {
        turn: "opp",
        phase: "attack",
        me: { spirits: [{ card: OPHIEL, cores: 5 }, { card: FULL }] },
        opp: { spirits: [{ card: OPP, cores: 2, label: "敵" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("敵") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("オリンピアの天使フル") })
    },
    expect: ["相手.敵.疲労: false → true", "自分.オリンピアの天使フル.疲労: false → true", "相手.敵.Lv: 2 → 1", "相手.敵.BP: 3000 → 1000"],
})

console.log("=== 4. オフィエルがLv2なら何も起きない ===")
scenario({
    name: "oph-lv2",
    start: { me: { spirits: [{ card: OPHIEL, cores: 3 }, { card: FULL }] }, opp: { spirits: [{ card: OPP, cores: 2, label: "敵" }] } },
    steps(t) {
        attackAndClose(t, "オリンピアの天使フル")
    },
    expect: ["自分.オリンピアの天使フル.疲労: false → true"],
})

console.log("=== 5. オリンピアでない自分のスピリットがアタックしても何も起きない ===")
scenario({
    name: "oph-non-olympia",
    start: { me: { spirits: [{ card: OPHIEL, cores: 5 }, { card: ROKU }] }, opp: { spirits: [{ card: OPP, cores: 2, label: "敵" }] } },
    steps(t) {
        attackAndClose(t, "ロクケラトプス")
    },
    expect: ["自分.ロクケラトプス.疲労: false → true"],
})

console.log("=== 6. オフィエル自身（名前にオリンピアを含む）がアタックしても起きる ===")
scenario({
    name: "oph-self",
    start: { me: { spirits: [{ card: OPHIEL, cores: 5 }] }, opp: { spirits: [{ card: OPP, cores: 2, label: "敵" }] } },
    steps(t) {
        attackAndClose(t, "オリンピアの天使長オフィエル")
    },
    expect: ["自分.オリンピアの天使長オフィエル.疲労: false → true", "相手.敵.Lv: 2 → 1", "相手.敵.BP: 3000 → 1000"],
})

console.log("すべてのチェックに合格しました 🎉（part589）")
