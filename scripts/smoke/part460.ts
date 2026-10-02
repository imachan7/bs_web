// smoke パート460（竜騎集う円卓 Lv2：「〜対象になるたび手札1枚を破棄することで、その効果を受けない」は払うかを守る側に必ず聞く。ユーザー確定 2026-09-29）
// ルール：対象ごとに聞く／自動で対象が決まっても聞く／スキップなら払わず効果を受ける／非対話は聞かず払える限り払う
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const TABLE = "BS08-055"
const RIKUTEI = "BS04-031"
const GAGUN = "BS06-048"
const HAND_A = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
const lvCores = (id: string, lv: number) => getCard(id).levels.find((l) => l.level === lv)!.cores
const handB = ALL_CARDS.find((c) => c.cardId !== HAND_A && c.effects.length === 0 && c.type === "spirit")!
assert(getCard(TABLE).name === "竜騎集う円卓" && getCard(TABLE).type === "nexus", "TABLEは竜騎集う円卓")
assert(getCard(RIKUTEI).name === "陸帝フォン・ダシオン", "RIKUTEIは陸帝フォン・ダシオン")
assert(getCard(GAGUN).name === "銀狼皇ガグンラーズ", "GAGUNは銀狼皇ガグンラーズ")
assert(getCard(HAND_A).name === "ロクケラトプス" && handB.name !== getCard(HAND_A).name, `手札の2種は ${getCard(HAND_A).name} と ${handB.name}`)
assert(lvCores(TABLE, 1) === 0 && lvCores(TABLE, 2) === 1, "円卓は Lv1 コア0／Lv2 コア1")
assert(lvCores(GAGUN, 2) === 4, "ガグンラーズ Lv2 はコア4")

const nameOf = (c: string) => getCard(c).name

// 疲労させる対象の選択（相手が選ぶ）は先頭候補で進め、円卓の払う選択（自分の手札から選ぶ）は answers で答える
// answers の要素：払うなら手札のカード名、スキップなら null。聞かれた回数を返す
function drive(t: ScenarioCtx, answers: (string | null)[]): number {
    let asked = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (++guard > 30) throw new Error("選択が終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "card" && pc.pid === t.me && /破棄/.test(pc.prompt)) {
            const ans = answers[asked++]
            if (ans === undefined) throw new Error(`聞かれすぎ（${asked}回目）: ${pc.prompt}`)
            if (ans === null) t.act(side, { type: "resolveChoice" })
            else {
                const h = t.state.players[t.me].hand
                const idx = (pc.cardIndices ?? []).find((i) => nameOf(h[i]!) === ans)
                if (idx === undefined) throw new Error(`候補に ${ans} が無い: ${(pc.cardIndices ?? []).map((i) => nameOf(h[i]!)).join(",")}`)
                t.act(side, { type: "resolveChoice", cardIndex: idx })
            }
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            // 疲労させる対象は、相手（選ぶ側）が回復状態のものから選ぶとする
            const all = [...t.state.players.p1.field.spirits, ...t.state.players.p2.field.spirits]
            const pick = pc.candidates.find((c) => all.find((x) => x.instanceId === c)?.isRested === false) ?? pc.candidates[0]!
            t.act(side, { type: "resolveChoice", instanceId: pick })
        }
    }
    return asked
}

// 自分のアタック→相手がガグンラーズでブロック→ブロック時の「相手のスピリット2体を疲労させる」
function attackAndBlock(t: ScenarioCtx, answers: (string | null)[], expectedAsks: number) {
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("陸帝A") })
    let n = drive(t, answers)
    if (t.state.battle && !t.state.pendingChoice) {
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("銀狼皇ガグンラーズ") })
        n += drive(t, answers.slice(n))
        t.closeFlash()
        n += drive(t, answers.slice(n))
    }
    assert(n === expectedAsks, `払う選択が ${expectedAsks} 回聞かれる（実際 ${n} 回）`)
}

const rikutei = (label: string, rested = false) => ({ card: RIKUTEI, label, cores: lvCores(RIKUTEI, 1), rested })
const gagun = { card: GAGUN, cores: lvCores(GAGUN, 2) }
const hand = [HAND_A, handB.cardId]
const interactiveStart = (tableCores: number, spirits: ReturnType<typeof rikutei>[]) => ({
    interactive: true,
    phase: "main" as const,
    me: { hand, nexuses: [{ card: TABLE, cores: tableCores }], spirits },
    opp: { spirits: [gagun] },
})

const A = getCard(HAND_A).name
const B = handB.name
const lv2 = lvCores(TABLE, 2)
const RK = nameOf(RIKUTEI)
const trash = (...names: string[]) => names.sort().join("、")
// 陸帝A（Lv1 BP5000）は BP7000 のガグンラーズに負けて破壊される（バトルは決着まで進める）。コア1個はリザーブへ
const aLost = ["自分.陸帝A.場所: フィールド → なし", "自分.リザーブ: 10 → 11"]
// 対象の聞かれる順は盤面の並び（陸帝B→陸帝C）とした。決め方は報告の「質問」に記載

console.log("=== 1. 2体が対象：対象ごとに聞く。1体目は払い、2体目はスキップ ===")
scenario({
    name: "table-ask-per-target",
    start: interactiveStart(lv2, [rikutei("陸帝A"), rikutei("陸帝B"), rikutei("陸帝C")]),
    steps: (t) => attackAndBlock(t, [A, null], 2),
    expect: [
        ...aLost,
        "相手.銀狼皇ガグンラーズ.疲労: false → true", // ブロックした // アタック
        "自分.陸帝C.疲労: false → true", // 払わなかった方
        "自分.手札: " + [A, B].sort().join("、") + " → " + B,
        "自分.トラッシュ: なし → " + trash(A, RK),
    ],
})

console.log("=== 1b. 2体が対象：両方とも払う ===")
scenario({
    name: "table-pay-both",
    start: interactiveStart(lv2, [rikutei("陸帝A"), rikutei("陸帝B"), rikutei("陸帝C")]),
    steps: (t) => attackAndBlock(t, [A, B], 2),
    expect: [
        ...aLost,
        "相手.銀狼皇ガグンラーズ.疲労: false → true", // ブロックした
        "自分.手札: " + [A, B].sort().join("、") + " → なし",
        "自分.トラッシュ: なし → " + trash(A, B, RK),
    ],
})

console.log("=== 2. 疲労させられる候補が1体だけ（自動で対象に決まる）でも聞く ===")
scenario({
    name: "table-ask-single-auto",
    start: interactiveStart(lv2, [rikutei("陸帝A"), rikutei("陸帝B")]),
    steps: (t) => attackAndBlock(t, [A], 1),
    expect: [
        ...aLost,
        "相手.銀狼皇ガグンラーズ.疲労: false → true", // ブロックした
        "自分.手札: " + [A, B].sort().join("、") + " → " + B,
        "自分.トラッシュ: なし → " + trash(A, RK),
    ],
})

console.log("=== 3. 非対話：聞かれず、払える限り払う（手札2枚がトラッシュへ） ===")
scenario({
    name: "table-noninteractive",
    start: { ...interactiveStart(lv2, [rikutei("陸帝A"), rikutei("陸帝B"), rikutei("陸帝C")]), interactive: false },
    steps: (t) => attackAndBlock(t, [], 0),
    expect: [
        ...aLost,
        "相手.銀狼皇ガグンラーズ.疲労: false → true", // ブロックした
        "自分.手札: " + [A, B].sort().join("、") + " → なし",
        "自分.トラッシュ: なし → " + trash(A, B, RK),
    ],
})

console.log("=== 4. 円卓が Lv1：耐性は効かない。聞かれず、2体とも疲労 ===")
scenario({
    name: "table-lv1",
    start: interactiveStart(0, [rikutei("陸帝A"), rikutei("陸帝B"), rikutei("陸帝C")]),
    steps: (t) => attackAndBlock(t, [], 0),
    expect: [
        ...aLost,
        "自分.トラッシュ: なし → " + RK,
        "相手.銀狼皇ガグンラーズ.疲労: false → true", // ブロックした
        "自分.陸帝B.疲労: false → true",
        "自分.陸帝C.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part460）")
