// smoke パート463（遥かなる衛星砲：手札に戻るのは「アタックしたスピリット」であること）
// 同じ名前の個体を2体並べ、アタックした側にだけ効くことを確かめる
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SATELLITE = "BS13-068"
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    const sat = getCard(SATELLITE)
    assert(sat.name === "遥かなる衛星砲" && sat.type === "nexus", "SATELLITEは衛星砲")
    assert(sat.levels.find((l) => l.level === 2)?.cores === 1, "衛星砲はコア1個でLv2")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

// 確認が出たら押す。出た回数を返す。確認以外は先頭の候補で答える
function drive(t: ScenarioCtx): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            t.act(side, { type: "resolveChoice", option: "発動する" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

const oppSide = {
    spirits: [
        { card: VANILLA, label: "アタッカー" },
        { card: VANILLA, label: "待機" },
    ],
}
const meSide = { nexuses: [{ card: SATELLITE, cores: 1 }] }

function oppAttack(t: ScenarioCtx, who: string, expectedConfirms: number) {
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id(who) })
    let n = drive(t)
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t)
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        n += drive(t)
    }
    assert(n === expectedConfirms, `確認の回数は${expectedConfirms}回（実際 ${n} 回）`)
}

const returned = (who: string) => [
    "自分.遥かなる衛星砲.疲労: false → true",
    `相手.${who}.場所: フィールド → なし`,
    "相手.手札: なし → ロクケラトプス",
    "相手.リザーブ: 10 → 11",
]

console.log("=== 1. 非対話：アタッカーが戻り、待機は場に残る ===")
scenario({
    name: "sat-attacker",
    start: { turn: "opp", me: meSide, opp: oppSide },
    steps: (t) => oppAttack(t, "アタッカー", 0),
    expect: returned("アタッカー"),
})

console.log("=== 2. 対話：確認は1回。押すとアタッカーが戻り、待機は場に残る ===")
scenario({
    name: "sat-attacker-interactive",
    start: { turn: "opp", interactive: true, me: meSide, opp: oppSide },
    steps: (t) => oppAttack(t, "アタッカー", 1),
    expect: returned("アタッカー"),
})

console.log("=== 3. 非対話：逆の個体でアタックすると、その個体が戻る ===")
scenario({
    name: "sat-other",
    start: { turn: "opp", me: meSide, opp: oppSide },
    steps: (t) => oppAttack(t, "待機", 0),
    expect: returned("待機"),
})

console.log("すべてのチェックに合格しました 🎉（part463）")
