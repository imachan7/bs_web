// smoke パート848（BS23-013 白蛇剣聖アルビナーガ：紫ブレイヴの合体条件無視・バトル時のコア除去・合体時のブレイヴ破壊による支払い）
// 公式Q&A Q4474・Q4475・Q4477・Q4478（docs/design/BS23_PLAN.md §1）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const ALBINAGA = "BS23-013" // 白蛇剣聖アルビナーガ（紫・コスト4・Lv2 コア3）
const VESPER = "BS11-052" // 魔銃ヴェスパー（紫ブレイヴ・コスト5・合体条件コスト5以上＝アルビナーガは本来満たさない）
const ZIONE = "BS23-X08" // ライトニング・シオン（紫ブレイヴ・コスト6・合体条件コスト5以上）
const CITRY = "BS21-057" // 冥獣騎シトリー（紫ブレイヴ・コスト3・合体条件コスト3以上・シンボルなし）
const BUSTER = "BS10-061" // バスター・ドラゴン（赤ブレイヴ・コスト3・合体条件＝効果の記述を持たない）
const ALDEUS = "BS23-017" // シャドー・アルデウス（紫・コスト6・軽減紫3）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ALBINAGA).name === "白蛇剣聖アルビナーガ" && getCard(ALBINAGA).cost === 4, "ALBINAGA")
    assert(getCard(VESPER).name === "魔銃ヴェスパー" && getCard(VESPER).type === "brave", "VESPER")
    assert(getCard(ZIONE).name === "紫電の霊剣ライトニング・シオン" && getCard(ZIONE).cost === 6, "ZIONE")
    assert(getCard(CITRY).name === "冥獣騎シトリー" && getCard(CITRY).cost === 3, "CITRY")
    assert(getCard(BUSTER).name === "剣鎧竜バスター・ドラゴン" && getCard(BUSTER).type === "brave", "BUSTER")
    assert(getCard(ALDEUS).name === "シャドー・アルデウス" && getCard(ALDEUS).cost === 6, "ALDEUS")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLA")
}

const names = (...n: string[]) => (n.length ? n.sort().join("、") : "なし")
const handIdx = (t: ScenarioCtx, cardId: string) => t.state.players[t.me].hand.indexOf(cardId)
const summonBrave = (t: ScenarioCtx, cardId: string, host = "白蛇剣聖アルビナーガ") =>
    t.act("me", { type: "summon", handIndex: handIdx(t, cardId), braveTargetInstanceId: t.id(host) })

// ブレイヴはコスト（軽減後）をリザーブから払い、合体状態は Lv1 のコア0個
const VESPER_LINES = [
    "自分.魔銃ヴェスパー.場所: なし → 合体",
    "自分.魔銃ヴェスパー.疲労: なし → false",
    "自分.魔銃ヴェスパー.コア: なし → 0",
    "自分.魔銃ヴェスパー.Lv: なし → 1",
    "自分.手札: 魔銃ヴェスパー → なし",
]

console.log("=== 1. Lv2：条件（コスト5以上）を満たさない紫ブレイヴに合体できる ===")
scenario({
    name: "albinaga-ignore-lv2",
    start: { me: { hand: [VESPER], spirits: [{ card: ALBINAGA, cores: 3 }] } },
    steps: (t) => summonBrave(t, VESPER),
    expect: [...VESPER_LINES, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", "自分.白蛇剣聖アルビナーガ.BP: 5000 → 8000"],
})

console.log("=== 2. Lv1でも同じ（Lv1・Lv2 の効果） ===")
scenario({
    name: "albinaga-ignore-lv1",
    start: { me: { hand: [VESPER], spirits: [{ card: ALBINAGA, cores: 1 }] } },
    steps: (t) => summonBrave(t, VESPER),
    expect: [...VESPER_LINES, "自分.リザーブ: 10 → 6", "自分.トラッシュのコア: 0 → 4", "自分.白蛇剣聖アルビナーガ.BP: 2000 → 5000"],
})

console.log("=== 3. 紫でないブレイヴの条件は無視できない ===")
scenario({
    name: "albinaga-not-purple",
    start: { me: { hand: [BUSTER], spirits: [{ card: ALBINAGA, cores: 3 }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("白蛇剣聖アルビナーガ") }),
    expect: [],
})

console.log("=== 4. 無視できるのはアルビナーガだけ（ほかのスピリットには合体できない） ===")
scenario({
    name: "albinaga-only-self",
    start: { me: { hand: [VESPER], spirits: [{ card: VANILLA, cores: 1 }, { card: ALBINAGA, cores: 3 }] } },
    steps: (t) => t.actRejected("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ロクケラトプス") }),
    expect: [],
})

console.log("=== 5. 合体できる数は1つのまま（Q4474・Q4475） ===")
scenario({
    name: "albinaga-one-brave",
    start: { me: { reserve: 12, hand: [VESPER, ZIONE], spirits: [{ card: ALBINAGA, cores: 3 }] } },
    steps: (t) => {
        summonBrave(t, VESPER)
        t.actRejected("me", { type: "summon", handIndex: handIdx(t, ZIONE), braveTargetInstanceId: t.id("白蛇剣聖アルビナーガ") })
    },
    expect: [...VESPER_LINES.slice(0, 4), "自分.手札: 紫電の霊剣ライトニング・シオン、魔銃ヴェスパー → 紫電の霊剣ライトニング・シオン", "自分.リザーブ: 12 → 8", "自分.トラッシュのコア: 0 → 4", "自分.白蛇剣聖アルビナーガ.BP: 5000 → 8000"],
})

console.log("=== 6. バトル時（Lv2）：相手のスピリットのコア1個を相手のリザーブへ ===")
scenario({
    name: "albinaga-battle-lv2",
    start: { me: { spirits: [{ card: ALBINAGA, cores: 3 }] }, opp: { spirits: [{ card: VANILLA, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("白蛇剣聖アルビナーガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    // 相手のリザーブ：効果で+1、ライフ減少で+1
    expect: ["自分.白蛇剣聖アルビナーガ.疲労: false → true", "相手.ロクケラトプス.コア: 2 → 1", "相手.ロクケラトプス.Lv: 2 → 1", "相手.ロクケラトプス.BP: 3000 → 1000", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})

console.log("=== 7. バトル時はLv2だけ：Lv1 では相手のコアは動かない ===")
scenario({
    name: "albinaga-battle-lv1",
    start: { me: { spirits: [{ card: ALBINAGA, cores: 1 }] }, opp: { spirits: [{ card: VANILLA, cores: 2 }] } },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("白蛇剣聖アルビナーガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.白蛇剣聖アルビナーガ.疲労: false → true", "相手.リザーブ: 10 → 11", "相手.ライフ: 5 → 4"],
})

console.log("=== 8. バトル時のコア除去・ソウルコアありの場面（ソウルコアは動かさない前提） ===")
scenario({
    name: "albinaga-battle-soul",
    start: {
        me: { spirits: [{ card: ALBINAGA, cores: 3 }] },
        opp: { spirits: [{ card: VANILLA, cores: 2 }], soulCore: "ロクケラトプス" },
    },
    steps: (t) => {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("白蛇剣聖アルビナーガ") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.白蛇剣聖アルビナーガ.疲労: false → true", "相手.ロクケラトプス.コア: 2 → 1", "相手.ロクケラトプス.Lv: 2 → 1", "相手.ロクケラトプス.BP: 3000 → 1000", "相手.リザーブ: 10 → 12", "相手.ライフ: 5 → 4"],
})

console.log("=== 9. 合体時（Lv2）：ブレイヴを破壊してアルデウスの召喚コストに充てる ===")
// 軽減はアルビナーガの紫1つ → アルデウスは5。シトリー（コスト3）で3払ったことになり、残り2をコアで払う
const ALDEUS_PAID = [
    "自分.シャドー・アルデウス.場所: なし → フィールド",
    "自分.シャドー・アルデウス.疲労: なし → false",
    "自分.シャドー・アルデウス.コア: なし → 1",
    "自分.シャドー・アルデウス.Lv: なし → 1",
    "自分.シャドー・アルデウス.BP: なし → 4000",
    "自分.手札: シャドー・アルデウス、冥獣騎シトリー → なし",
    "自分.トラッシュ: なし → 冥獣騎シトリー",
]
scenario({
    name: "albinaga-substitute",
    start: { me: { reserve: 15, hand: [CITRY, ALDEUS], spirits: [{ card: ALBINAGA, cores: 3 }] } },
    steps: (t) => {
        summonBrave(t, CITRY)
        const brave = t.state.players[t.me].field.combinedBraves[0]!
        t.act("me", { type: "summon", handIndex: handIdx(t, ALDEUS), substituteInstanceId: brave.instanceId })
    },
    // シトリー召喚で15→13（トラッシュのコア+2）、アルデウスで13→10（払う2＋維持コア1。トラッシュのコア+2）
    expect: [...ALDEUS_PAID, "自分.リザーブ: 15 → 10", "自分.トラッシュのコア: 0 → 4"],
})

console.log("=== 10. 使えない場面：Lv1／アルデウスでないカード ===")
scenario({
    name: "albinaga-substitute-lv1",
    start: { me: { reserve: 15, hand: [CITRY, ALDEUS], spirits: [{ card: ALBINAGA, cores: 1 }] } },
    steps: (t) => {
        summonBrave(t, CITRY)
        const brave = t.state.players[t.me].field.combinedBraves[0]!
        t.actRejected("me", { type: "summon", handIndex: handIdx(t, ALDEUS), substituteInstanceId: brave.instanceId })
    },
    expect: ["自分.冥獣騎シトリー.場所: なし → 合体", "自分.冥獣騎シトリー.疲労: なし → false", "自分.冥獣騎シトリー.コア: なし → 0", "自分.冥獣騎シトリー.Lv: なし → 1", "自分.手札: シャドー・アルデウス、冥獣騎シトリー → シャドー・アルデウス", "自分.リザーブ: 15 → 13", "自分.トラッシュのコア: 0 → 2"],
})
scenario({
    name: "albinaga-substitute-notaldeus",
    start: { me: { reserve: 15, hand: [CITRY, VANILLA], spirits: [{ card: ALBINAGA, cores: 3 }] } },
    steps: (t) => {
        summonBrave(t, CITRY)
        const brave = t.state.players[t.me].field.combinedBraves[0]!
        t.actRejected("me", { type: "summon", handIndex: handIdx(t, VANILLA), substituteInstanceId: brave.instanceId })
    },
    expect: ["自分.冥獣騎シトリー.場所: なし → 合体", "自分.冥獣騎シトリー.疲労: なし → false", "自分.冥獣騎シトリー.コア: なし → 0", "自分.冥獣騎シトリー.Lv: なし → 1", "自分.手札: ロクケラトプス、冥獣騎シトリー → ロクケラトプス", "自分.リザーブ: 15 → 13", "自分.トラッシュのコア: 0 → 2"],
})

console.log("すべてのチェックに合格しました 🎉（part848）")
