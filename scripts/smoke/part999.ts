// smoke パート999（P13-11 ヤタグロス／P13-06 ライト・ダグラス／P13-01 ライト・ジークヴルム）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"

const YATA = "P13-11" // 白鴉鳥ヤタグロス（緑・Lv1/2/3 = 1/3/4コア、BP4000/6000/8000）
const DOUGLAS = "P13-06" // 爆光巨人ライト・ダグラス（青・Lv1/2/3 = 1/2/4コア、BP5000/6000/7000）
const JIG = "P13-01" // 雷光龍ライト・ジークヴルム（赤・Lv1/2/3 = 1/3/5コア、BP4000/6000/9000）
const BURST_CARD = "P048" // 武威煌炎刃（バースト効果を持つ赤マジック）
const VANILLA = "BS01-002" // ロクケラトプス
const HARDES = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000）
const LANCE = "SD17-010" // ランスモザウルス（赤・コスト5・Lv1 BP5000 / Lv2 3コア BP7000）
const HORN = "SD03-005" // ビッグ・ホーン（赤・コスト5）
const VAJ = "BS17-007" // ヴァジュランガ（赤・コスト6・Lv1 BP4000）
const WOLF = "BS21-002" // ウォルフドラゴン（赤・【強化】・Lv1 BP2000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(YATA).name === "白鴉鳥ヤタグロス" && getCard(DOUGLAS).name === "爆光巨人ライト・ダグラス" && getCard(JIG).name === "雷光龍ライト・ジークヴルム", "対象3枚")
    assert(getCard(BURST_CARD).name === "武威煌炎刃" && getCard(HORN).cost === 5 && getCard(VAJ).cost === 6, "バースト役・コスト5/6の相手役")
}

const attackAndTakeLife = (t: Parameters<Parameters<typeof scenario>[0]["steps"]>[0], attacker: string) => {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id(attacker) })
    t.closeFlash()
    t.act("opp", { type: "takeLife" })
}
const lifeLines = ["相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"]

console.log("=== P13-11 ヤタグロス：相手が自分のスピリットを疲労させる（選ぶのは相手）。させたら1体につきボイドからコアを置く ===")
scenario({
    name: "yata-lv2-opp-rests-one-gets-core",
    start: { interactive: true, me: { spirits: [{ card: YATA, cores: 3 }] }, opp: { spirits: [{ card: VANILLA, label: "A" }, { card: HORN, label: "B" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("白鴉鳥ヤタグロス") })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("相手.A") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.白鴉鳥ヤタグロス.疲労: false → true", "自分.白鴉鳥ヤタグロス.コア: 3 → 4", "自分.白鴉鳥ヤタグロス.Lv: 2 → 3", "自分.白鴉鳥ヤタグロス.BP: 6000 → 8000", "相手.A.疲労: false → true", ...lifeLines],
})
scenario({
    name: "yata-lv1-rests-but-no-core",
    start: { interactive: true, me: { spirits: [{ card: YATA, cores: 1 }] }, opp: { spirits: [{ card: VANILLA, label: "A" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("白鴉鳥ヤタグロス") })
        t.act("opp", { type: "resolveChoice", instanceId: t.id("相手.A") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.白鴉鳥ヤタグロス.疲労: false → true", "相手.A.疲労: false → true", ...lifeLines], // Lv1は疲労だけでコアは置かない
})
scenario({
    name: "yata-lv2-all-opp-already-rested-no-core",
    start: { me: { spirits: [{ card: YATA, cores: 3 }] }, opp: { spirits: [{ card: VANILLA, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "白鴉鳥ヤタグロス"),
    expect: ["自分.白鴉鳥ヤタグロス.疲労: false → true", ...lifeLines], // 疲労させていないのでコアは置かない
})
scenario({
    name: "yata-lv2-no-opp-spirit-no-core",
    start: { me: { spirits: [{ card: YATA, cores: 3 }] } },
    steps: (t) => attackAndTakeLife(t, "白鴉鳥ヤタグロス"),
    expect: ["自分.白鴉鳥ヤタグロス.疲労: false → true", ...lifeLines],
})

console.log("=== P13-06 ライト・ダグラス：【粉砕】でバースト効果を持つカードが破棄されたら、コスト5以下の相手のスピリット1体を破壊 ===")
const burstDeck = Array.from({ length: 40 }, () => BURST_CARD)
scenario({
    name: "douglas-lv2-burst-mill-destroys-cost5",
    start: { me: { spirits: [{ card: DOUGLAS, cores: 2 }] }, opp: { deck: burstDeck, spirits: [{ card: HORN, rested: true }, { card: VAJ, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "爆光巨人ライト・ダグラス"),
    expect: ["自分.爆光巨人ライト・ダグラス.疲労: false → true", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → 武威煌炎刃、武威煌炎刃、ビッグ・ホーン", "相手.ビッグ・ホーン.場所: フィールド → なし", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "douglas-lv1-mills-one-and-destroys",
    start: { me: { spirits: [{ card: DOUGLAS, cores: 1 }] }, opp: { deck: burstDeck, spirits: [{ card: HORN, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "爆光巨人ライト・ダグラス"),
    expect: ["自分.爆光巨人ライト・ダグラス.疲労: false → true", "相手.デッキ枚数: 40 → 39", "相手.トラッシュ: なし → 武威煌炎刃、ビッグ・ホーン", "相手.ビッグ・ホーン.場所: フィールド → なし", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "douglas-no-burst-card-no-destroy",
    start: { me: { spirits: [{ card: DOUGLAS, cores: 2 }] }, opp: { spirits: [{ card: HORN, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "爆光巨人ライト・ダグラス"),
    expect: ["自分.爆光巨人ライト・ダグラス.疲労: false → true", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → ロクケラトプス、ロクケラトプス", ...lifeLines],
})
scenario({
    name: "douglas-burst-but-only-cost6-nothing-destroyed",
    start: { me: { spirits: [{ card: DOUGLAS, cores: 2 }] }, opp: { deck: burstDeck, spirits: [{ card: VAJ, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "爆光巨人ライト・ダグラス"),
    expect: ["自分.爆光巨人ライト・ダグラス.疲労: false → true", "相手.デッキ枚数: 40 → 38", "相手.トラッシュ: なし → 武威煌炎刃、武威煌炎刃", ...lifeLines],
})

console.log("=== P13-01 ジークヴルム：アタック時BP4000以下を破壊。Lv3【強化】で上限+1000。Lv2以上で【強化】持ちに【激突】 ===")
const hardesGone = ["相手.デス・ハーデス.場所: フィールド → なし", "相手.トラッシュ: なし → デス・ハーデス", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"]
scenario({
    name: "jig-lv1-destroys-bp4000",
    start: { me: { spirits: [{ card: JIG, cores: 1 }] }, opp: { spirits: [{ card: HARDES }, { card: LANCE, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "雷光龍ライト・ジークヴルム"),
    expect: ["自分.雷光龍ライト・ジークヴルム.疲労: false → true", ...hardesGone],
})
scenario({
    name: "jig-lv1-bp5000-not-destroyed",
    start: { me: { spirits: [{ card: JIG, cores: 1 }] }, opp: { spirits: [{ card: LANCE, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "雷光龍ライト・ジークヴルム"),
    expect: ["自分.雷光龍ライト・ジークヴルム.疲労: false → true", ...lifeLines],
})
scenario({
    name: "jig-lv3-limit-plus1000-destroys-bp5000-not-7000",
    start: { me: { spirits: [{ card: JIG, cores: 5 }] }, opp: { spirits: [{ card: LANCE, label: "5000", rested: true }, { card: LANCE, label: "7000", cores: 3, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "雷光龍ライト・ジークヴルム"),
    expect: ["自分.雷光龍ライト・ジークヴルム.疲労: false → true", "相手.5000.場所: フィールド → なし", "相手.トラッシュ: なし → ランスモザウルス", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})
scenario({
    name: "jig-lv2-limit-stays-4000-bp5000-not-destroyed",
    start: { me: { spirits: [{ card: JIG, cores: 3 }] }, opp: { spirits: [{ card: LANCE, rested: true }] } },
    steps: (t) => attackAndTakeLife(t, "雷光龍ライト・ジークヴルム"),
    expect: ["自分.雷光龍ライト・ジークヴルム.疲労: false → true", ...lifeLines], // 上限+1000はLv3だけ
})
scenario({
    name: "jig-lv2-gives-gekitotsu-to-kyoka-spirit",
    start: { me: { spirits: [{ card: JIG, cores: 3 }, { card: WOLF }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ウォルフドラゴン") })
        t.closeFlash()
        t.actRejected("opp", { type: "takeLife" }) // 激突：ブロックできる相手は必ずブロックする
    },
    expect: ["自分.ウォルフドラゴン.疲労: false → true"],
})
scenario({
    name: "jig-lv1-no-gekitotsu",
    start: { me: { spirits: [{ card: JIG, cores: 1 }, { card: WOLF }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ウォルフドラゴン") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.ウォルフドラゴン.疲労: false → true", ...lifeLines],
})

console.log("すべてのチェックに合格しました 🎉（part999）")
