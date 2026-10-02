// smoke パート462（「〜することで」の払う確認：【破壊時】の残留とバーストの「その後コストを支払うことで」。ユーザー確定 2026-09-29）
// 規則：①対話中は払うかを持ち主に必ず確認 ②払えなくても確認は出し、押しても何も起きない ③非対話は確認なしで払えるなら払う
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const PAO = "BS07-042"
const CASTLE = "BS15-063"
const BLADE = "BS14-092"
const BEAST = "BS14-050" // エアレイ（黄・効果なし・想獣）
const NIGHT = "SD01-010" // コウモリブレラ（紫・効果なし・夜族。Lv1 コア1）
const VANILLA = "BS01-002"
const BIG = "BS01-031" // デス・ハーデス（紫・効果なし。Lv2 コア4 で BP7000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PAO).name === "パオ・ペイール" && getCard(PAO).family.includes("想獣"), "PAOはパオ・ペイール")
    assert(getCard(CASTLE).name === "吊られた古城" && getCard(CASTLE).type === "nexus", "CASTLEは吊られた古城")
    assert(getCard(BLADE).name === "烈光閃刃" && getCard(BLADE).type === "magic", "BLADEは烈光閃刃")
    for (const [id, fam] of [[BEAST, "想獣"], [NIGHT, "夜族"]] as const) {
        assert(getCard(id).type === "spirit" && getCard(id).effects.length === 0 && getCard(id).family.includes(fam), `${id}は効果なしの${fam}`)
    }
    assert(getCard(VANILLA).effects.length === 0 && getCard(BIG).effects.length === 0, "VANILLAとBIGは効果なし")
}

// 押す側の選択肢の文言は「発動する」か（残留の確認では）「復活させる」。文言は UI の都合でルールの違いではない
const CONFIRM_LABELS = ["発動する", "復活させる"]
const confirmLabel = (t: ScenarioCtx): string | undefined => {
    const pc = t.state.pendingChoice
    if (pc === null || pc.kind !== "option") return undefined
    return CONFIRM_LABELS.find((l) => (pc.options ?? []).includes(l))
}
const isConfirm = (t: ScenarioCtx) => confirmLabel(t) !== undefined

// 選択待ちを答え切る。確認が出たら prompts に控えて answer で答える。確認以外は先頭の候補で答える
function drive(t: ScenarioCtx, answer: "press" | "decline", prompts: string[]): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            prompts.push(pc.prompt)
            t.act(side, answer === "press" ? { type: "resolveChoice", option: confirmLabel(t)! } : { type: "resolveChoice" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// 相手が BIG でアタック → 自分が blocker でブロックして負ける
function blockAndLose(t: ScenarioCtx, blocker: string, answer: "press" | "decline", expectedConfirms: number) {
    const prompts: string[] = []
    let n = 0
    t.act("opp", { type: "nextPhase" })
    t.act("opp", { type: "attack", instanceId: t.id("デス・ハーデス") })
    n += drive(t, answer, prompts)
    t.closeFlash() // アタック宣言後のフラッシュを閉じるとブロック宣言に進む
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    n += drive(t, answer, prompts)
    t.closeFlash()
    n += drive(t, answer, prompts)
    assert(n === expectedConfirms, `確認の回数は${expectedConfirms}回（実際 ${n} 回）`)
}

const bigOpp = { spirits: [{ card: BIG, cores: 4 }] }
const stays = ["相手.デス・ハーデス.疲労: false → true"]
const paoDies = [
    "自分.パオ・ペイール.場所: フィールド → なし",
    "自分.トラッシュ: なし → パオ・ペイール",
    "自分.リザーブ: 10 → 11",
    "相手.デス・ハーデス.疲労: false → true",
]

console.log("=== 1. パオ・ペイール・対話：押すと想獣が疲労し、回復状態で残る ===")
scenario({
    name: "pao-press",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: PAO }, { card: BEAST }] }, opp: bigOpp },
    steps: (t) => blockAndLose(t, "パオ・ペイール", "press", 1),
    expect: ["自分.エアレイ.疲労: false → true", ...stays],
})

console.log("=== 2. パオ・ペイール・対話：断ると破壊される ===")
scenario({
    name: "pao-decline",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: PAO }, { card: BEAST }] }, opp: bigOpp },
    steps: (t) => blockAndLose(t, "パオ・ペイール", "decline", 1),
    expect: paoDies,
})

console.log("=== 3. パオ・ペイール・対話：想獣が疲労済み（払えない）でも確認は出る。押しても破壊される ===")
scenario({
    name: "pao-cannot-pay",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: PAO }, { card: BEAST, rested: true }] }, opp: bigOpp },
    steps: (t) => blockAndLose(t, "パオ・ペイール", "press", 1),
    expect: paoDies,
})

console.log("=== 4. パオ・ペイール・非対話：確認なしで払って残る ===")
scenario({
    name: "pao-noninteractive",
    start: { turn: "opp", interactive: false, me: { spirits: [{ card: PAO }, { card: BEAST }] }, opp: bigOpp },
    steps: (t) => blockAndLose(t, "パオ・ペイール", "press", 0),
    expect: ["自分.エアレイ.疲労: false → true", ...stays],
})

console.log("=== 5. 吊られた古城Lv2・対話：手札0枚（払えない）でも確認は出る。押しても破壊される ===")
scenario({
    name: "castle-cannot-pay",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: NIGHT }], nexuses: [{ card: CASTLE, cores: 1 }] }, opp: bigOpp },
    steps: (t) => blockAndLose(t, "コウモリブレラ", "press", 1),
    expect: [
        "自分.コウモリブレラ.場所: フィールド → なし",
        "自分.トラッシュ: なし → コウモリブレラ",
        "自分.リザーブ: 10 → 11",
        ...stays,
    ],
})

console.log("=== 6. 烈光閃刃・対話：バースト後の「その後コストを支払うことで」はコスト不足でも確認が出る。押してもメイン効果は出ない ===")
{
    const prompts: string[] = []
    scenario({
        name: "blade-cannot-pay",
        start: {
            turn: "opp",
            interactive: true,
            me: { reserve: 0, burst: BLADE, trash: [VANILLA] },
            opp: { spirits: [{ card: VANILLA }] },
        },
        steps: (t) => {
            prompts.length = 0
            t.act("opp", { type: "nextPhase" })
            t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
            drive(t, "press", prompts)
            if (t.state.battle) {
                t.closeFlash()
                drive(t, "press", prompts)
                if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
                drive(t, "press", prompts)
            }
            console.log("  確認の文面:", JSON.stringify(prompts))
            // バースト自体の発動確認が出る実装でも、払う確認とは文面で区別して数える
            const pay = prompts.filter((p) => !p.includes("バーストを発動"))
            assert(pay.length === 1, `「コストを支払う」確認はちょうど1回（実際 ${pay.length} 回）`)
        },
        expect: [
            "自分.ライフ: 5 → 4",
            "自分.リザーブ: 0 → 1",
            "自分.バースト: 烈光閃刃 → なし",
            "自分.トラッシュ: ロクケラトプス → ロクケラトプス、烈光閃刃",
            "相手.ロクケラトプス.場所: フィールド → なし",
            "相手.トラッシュ: なし → ロクケラトプス",
            "相手.リザーブ: 10 → 11",
        ],
    })
}

console.log("すべてのチェックに合格しました 🎉（part462）")
