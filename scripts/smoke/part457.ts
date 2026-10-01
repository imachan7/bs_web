// smoke パート457（払う確認を断った／払えず不発のときは「ターンに1回」を使っていない扱いに戻る。ユーザー確認 2026-10-01 のルール5・6）
// 前提のルール1〜4は part456 を参照
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const BARRIER = "BS13-070"

console.log("=== 前提: カードの機械確認 ===")
const lv2Cores = getCard(BARRIER).levels.find((l) => l.level === 2)!.cores
const attackerCard = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 4)!
assert(getCard(BARRIER).name === "星宿の障壁" && getCard(BARRIER).type === "nexus", "BARRIERは星宿の障壁")
assert(lv2Cores >= 0, `Lv2 になるコア数は ${lv2Cores}`)
assert(attackerCard !== undefined && attackerCard.cost >= 4 && attackerCard.effects.length === 0, `アタッカーはコスト4以上・効果なしの ${attackerCard.name}`)

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

function drive(t: ScenarioCtx, answer: "press" | "decline"): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            t.act(side, answer === "press" ? { type: "resolveChoice", option: "発動する" } : { type: "resolveChoice" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// 相手が2体で順にアタックし、どちらもライフで受ける。1回目と2回目の確認への答えと、確認が出る回数を指定する
function twoAttacks(t: ScenarioCtx, answers: ["press" | "decline", "press" | "decline"], expected: [number, number]) {
    t.act("opp", { type: "nextPhase" })
    answers.forEach((ans, i) => {
        t.act("opp", { type: "attack", instanceId: t.id(`アタッカー${i + 1}`) })
        let n = drive(t, ans)
        if (t.state.battle) t.closeFlash()
        n += drive(t, ans)
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        n += drive(t, ans)
        assert(n === expected[i]!, `${i + 1}回目のアタックで確認が${expected[i]}回出る（実際 ${n} 回）`)
    })
}

const start = (rested: boolean) => ({
    turn: "opp" as const,
    interactive: true,
    me: { nexuses: [{ card: BARRIER, cores: lv2Cores, rested }] },
    opp: { spirits: [{ card: attackerCard.cardId, label: "アタッカー1" }, { card: attackerCard.cardId, label: "アタッカー2" }] },
})

console.log("=== A. 1回目は断る → 2回目でまた確認が出る → 押す（ルール5） ===")
scenario({
    name: "barrier-decline-then-press",
    start: start(false),
    steps: (t) => twoAttacks(t, ["decline", "press"], [1, 1]),
    expect: [
        "自分.星宿の障壁.疲労: false → true",
        "自分.ライフ: 5 → 4", // 2回減って1回戻る
        "自分.リザーブ: 10 → 12", // ライフのコア2個
        "相手.アタッカー1.疲労: false → true",
        "相手.アタッカー2.疲労: false → true",
    ],
})

console.log("=== B. 1回目で押して発揮 → 2回目は確認が出ない（ルール6） ===")
scenario({
    name: "barrier-press-then-none",
    start: start(false),
    steps: (t) => twoAttacks(t, ["press", "press"], [1, 0]),
    expect: [
        "自分.星宿の障壁.疲労: false → true",
        "自分.ライフ: 5 → 4", // 減る→戻る→減る
        "自分.リザーブ: 10 → 12",
        "相手.アタッカー1.疲労: false → true",
        "相手.アタッカー2.疲労: false → true",
    ],
})

console.log("=== C. 最初から疲労（払えない）：押しても不発、2回目でもまた確認が出る（ルール3・5） ===")
scenario({
    name: "barrier-cannot-pay-twice",
    start: start(true),
    steps: (t) => twoAttacks(t, ["press", "press"], [1, 1]),
    expect: [
        "自分.ライフ: 5 → 3",
        "自分.リザーブ: 10 → 12",
        "相手.アタッカー1.疲労: false → true",
        "相手.アタッカー2.疲労: false → true",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part457）")
