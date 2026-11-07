// smoke パート843（BS23-041 光の天使ダリエル・BS23-032 黒き女神ネヴァン。Q4520・Q4521・Q4547〜Q4549）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const DARIEL = "BS23-041" // 光の天使ダリエル（黄・Lv1 コア1 BP3000／Lv2 コア2／シンボル黄1）
const NEVAN = "BS23-032" // 黒き女神ネヴァン（白・系統 氷姫・Lv1 コア1 BP4000）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄マジック・コスト3・軽減 黄黄・フラッシュ：このターン相手1体をBP-3000）
const HULA = "BS06-040" // 薄氷の侍女長フッラ（白・氷姫・バニラ）
const ZON = "BS04-006" // 骸竜ゾン・サウル（赤・Lv1-3 自分のアタックステップ：自分の紫のスピリットすべてBP+1000）
const HADES = "BS01-031" // デス・ハーデス（紫・バニラ BP4000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・バニラ Lv1 BP4000）
const KAMO = "BS10-024" // カモメーヴェ（緑・バニラ Lv1 BP4000／Lv2 コア2 BP5000）
const ROKU = "BS01-002" // ロクケラトプス（赤・バニラ BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Array<[string, string]> = [
        [DARIEL, "光の天使ダリエル"], [NEVAN, "黒き女神ネヴァン"], [PRESSURE, "エンジェリックプレッシャー"], [HULA, "薄氷の侍女長フッラ"],
        [ZON, "骸竜ゾン・サウル"], [HADES, "デス・ハーデス"], [HERA, "ヘラクレス・ジオ"], [KAMO, "カモメーヴェ"], [ROKU, "ロクケラトプス"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(NEVAN).family?.includes("氷姫") === true && getCard(HULA).family?.includes("氷姫") === true, "ネヴァンとフッラは氷姫")
    assert(getCard(KAMO).levels.find((l) => l.level === 2)?.cores === 2 && getCard(KAMO).levels.find((l) => l.level === 2)?.bp === 5000, "カモメーヴェ Lv2 は コア2・BP5000")
}

function settle(t: ScenarioCtx, labels: string[] = []): void {
    const queue = [...labels]
    for (let i = 0; i < 12 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            const hit = queue.findIndex((l) => {
                try {
                    return pc.candidates.includes(t.id(l))
                } catch {
                    return false
                }
            })
            assert(hit >= 0, `対象の選択待ちに答えられる（候補: ${pc.candidates.length}件、残り: ${queue.join("、")}）`)
            if (hit < 0) return
            t.act(side, { type: "resolveChoice", instanceId: t.id(queue.splice(hit, 1)[0]!) })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: (pc.options ?? [])[0]! })
        } else {
            t.act(side, { type: "resolveChoice", cardIndex: (pc.cardIndices ?? [])[0]! })
        }
    }
    assert(t.state.pendingChoice === null, "選択待ちが残らない")
}

// アタック宣言 → フラッシュでプレッシャーを対象に使う（軽減は黄シンボル1個ぶん＝コスト2）
// アタック宣言の直後の優先権は守る側（相手）にあるので、先に相手のパスを入れる
function castFlash(t: ScenarioCtx, target: string): void {
    if (t.state.priorityPlayer !== t.me) t.act("opp", { type: "pass" })
    t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id(target) })
    settle(t)
}

function attackThenPressure(t: ScenarioCtx, target: string, count = 1): void {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("ロク") })
    for (let i = 0; i < count; i++) {
        castFlash(t, target)
    }
}

const costLines = (n: number) => [
    `自分.リザーブ: 10 → ${10 - 2 * n}`,
    `自分.トラッシュのコア: 0 → ${2 * n}`,
    "自分.ロク.疲労: false → true",
]
const pressureHand = (n: number) => Array(n).fill("エンジェリックプレッシャー").join("、")

console.log("=== 1. 041 Lv2：相手がターンで初めて BP0 → ライフに1個（BP-3000 が -4000 になり、BP4000 が 0。破壊はされない） ===")
scenario({
    name: "dariel-first-bp0-life",
    start: {
        interactive: true,
        me: { hand: [PRESSURE], spirits: [{ card: DARIEL, label: "ダリエル", cores: 2 }, { card: ROKU, label: "ロク" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ", rested: true }] },
    },
    steps: (t) => attackThenPressure(t, "ジオ"),
    expect: [
        ...costLines(1),
        `自分.手札: ${pressureHand(1)} → なし`,
        `自分.トラッシュ: なし → ${pressureHand(1)}`,
        "自分.ライフ: 5 → 6",
        "相手.ジオ.BP: 4000 → 0",
    ],
})

console.log("=== 2. 041 Lv2：BP0 にならなければライフは増えない（BP5000 → 1000） ===")
scenario({
    name: "dariel-not-bp0",
    start: {
        interactive: true,
        me: { hand: [PRESSURE], spirits: [{ card: DARIEL, label: "ダリエル", cores: 2 }, { card: ROKU, label: "ロク" }] },
        opp: { spirits: [{ card: KAMO, label: "カモメ", cores: 2, rested: true }] },
    },
    steps: (t) => attackThenPressure(t, "カモメ"),
    expect: [...costLines(1), `自分.手札: ${pressureHand(1)} → なし`, `自分.トラッシュ: なし → ${pressureHand(1)}`, "相手.カモメ.BP: 5000 → 1000"],
})

console.log("=== 3. 041 Lv1：【強化】は効くが、ライフの誘発は Lv2 から ===")
scenario({
    name: "dariel-lv1-no-life",
    start: {
        interactive: true,
        me: { hand: [PRESSURE], spirits: [{ card: DARIEL, label: "ダリエル" }, { card: ROKU, label: "ロク" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ", rested: true }] },
    },
    steps: (t) => attackThenPressure(t, "ジオ"),
    expect: [...costLines(1), `自分.手札: ${pressureHand(1)} → なし`, `自分.トラッシュ: なし → ${pressureHand(1)}`, "相手.ジオ.BP: 4000 → 0"],
})

console.log("=== 4. 041 Lv2：ターンに1回。2体目が BP0 になってもライフは置かない（Q4549） ===")
scenario({
    name: "dariel-once-per-turn",
    start: {
        interactive: true,
        me: { hand: [PRESSURE, PRESSURE], spirits: [{ card: DARIEL, label: "ダリエル", cores: 2 }, { card: ROKU, label: "ロク" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ", rested: true }, { card: KAMO, label: "カモメ", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ロク") })
        castFlash(t, "ジオ")
        castFlash(t, "カモメ")
    },
    expect: [
        ...costLines(2),
        `自分.手札: ${pressureHand(2)} → なし`,
        `自分.トラッシュ: なし → ${pressureHand(2)}`,
        "自分.ライフ: 5 → 6",
        "相手.ジオ.BP: 4000 → 0",
        "相手.カモメ.BP: 4000 → 0",
    ],
})

console.log("=== 5. 041：相手のアタックステップ（『自分のアタックステップ』でない）では BP0 になってもライフは置かない ===")
scenario({
    name: "dariel-opp-attack-step",
    start: {
        turn: "opp",
        phase: "attack",
        interactive: true,
        me: { hand: [PRESSURE], spirits: [{ card: DARIEL, label: "ダリエル", cores: 2 }] },
        opp: { spirits: [{ card: ROKU, label: "ロク" }, { card: HERA, label: "ジオ" }] },
    },
    steps(t) {
        t.act("opp", { type: "attack", instanceId: t.id("ロク") })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.id("ジオ") })
        settle(t)
    },
    expect: [
        "相手.ロク.疲労: false → true",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 2",
        `自分.手札: ${pressureHand(1)} → なし`,
        `自分.トラッシュ: なし → ${pressureHand(1)}`,
        "相手.ジオ.BP: 4000 → 0",
    ],
})

console.log("=== 6. 032：相手のアタックステップ開始時、自身（氷姫）を疲労させて相手の『自分のアタックステップ』効果を無効にする ===")
scenario({
    name: "nevan-negates-attack-step-effect",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: NEVAN, label: "ネヴァン" }] },
        opp: { spirits: [{ card: ZON, label: "ゾン" }, { card: HADES, label: "ハーデス" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        settle(t, ["ネヴァン", "ゾン"])
    },
    expect: ["自分.ネヴァン.疲労: false → true"],
})

console.log("=== 7. 032 の対照：氷姫がいなければ『自分のアタックステップ』効果はそのまま効く ===")
scenario({
    name: "nevan-control-effect-applies",
    start: {
        turn: "opp",
        opp: { spirits: [{ card: ZON, label: "ゾン" }, { card: HADES, label: "ハーデス" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
    },
    expect: ["相手.ハーデス.BP: 4000 → 5000"],
})

console.log("=== 8. 032：疲労させる氷姫は他の氷姫でもよい（自身は疲労しない） ===")
scenario({
    name: "nevan-rests-another-hime",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: NEVAN, label: "ネヴァン" }, { card: HULA, label: "フッラ" }] },
        opp: { spirits: [{ card: ZON, label: "ゾン" }, { card: HADES, label: "ハーデス" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        settle(t, ["フッラ", "ゾン"])
    },
    expect: ["自分.フッラ.疲労: false → true"],
})

console.log("=== 9. 032：無効にするのは選んだ1体の効果だけ（もう1体の ゾン・サウルの +1000 は残る） ===")
scenario({
    name: "nevan-only-chosen-spirit",
    start: {
        turn: "opp",
        interactive: true,
        me: { spirits: [{ card: NEVAN, label: "ネヴァン" }] },
        opp: { spirits: [{ card: ZON, label: "ゾン1" }, { card: ZON, label: "ゾン2" }, { card: HADES, label: "ハーデス" }] },
    },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        settle(t, ["ネヴァン", "ゾン1"])
    },
    expect: ["自分.ネヴァン.疲労: false → true", "相手.ハーデス.BP: 4000 → 5000"],
})

console.log("=== 10. 032：相手のスピリットがいなければ疲労させることもできない（Q4520） ===")
scenario({
    name: "nevan-no-opp-spirit",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: NEVAN, label: "ネヴァン" }] } },
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        settle(t)
    },
    expect: [],
})

console.log("=== 11. 032：自分のターンのアタックステップ開始時には発揮しない（『相手のアタックステップ』） ===")
scenario({
    name: "nevan-own-turn",
    start: {
        interactive: true,
        me: { spirits: [{ card: NEVAN, label: "ネヴァン" }] },
        opp: { spirits: [{ card: ZON, label: "ゾン" }] },
    },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        settle(t)
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part843）")
