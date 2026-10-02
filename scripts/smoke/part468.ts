// smoke パート468（「〜することで」の移行：トール／ヴァルハランス／アーケランサー／ウシワカの自己BP+）
// 効果文だけから書いた期待値。実装に合わせて変えないこと
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { InstanceSpec, ScenarioCtx, SideSpec } from "./scenario"

const THOR = "BS02-X07"
const VALH = "BS06-X24"
const LANCER = "BS12-050"
const USHI = "BS14-X03"
const GATLING = "BS01-084" // 武装・Lv1 BP3000 / Lv2(2コア) BP5000
const WINGAL = "BS02-046" // 武装・Lv2(2コア) BP6000
const VANILLA = "BS01-002" // 地竜・Lv1 BP1000
const SHOCK = "BS01-054" // ショックイーター（緑・効果なし）。トールは赤をブロックしても疲労しないので、赤でない相手に使う

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(THOR).name === "巨神機トール" && getCard(THOR).type === "spirit", "THORはトール")
    assert(getCard(VALH).name === "鎧神機ヴァルハランス" && getCard(VALH).type === "spirit", "VALHはヴァルハランス")
    assert(getCard(LANCER).name === "突機竜アーケランサー" && getCard(LANCER).type === "brave", "LANCERはアーケランサー")
    assert(getCard(USHI).name === "風の覇王ドルクス・ウシワカ" && getCard(USHI).type === "spirit", "USHIはウシワカ")
    assert(getCard(GATLING).name === "ガトリングスタンド" && getCard(GATLING).family?.includes("武装"), "GATLINGは武装")
    assert(getCard(WINGAL).name === "ウィンガル" && getCard(WINGAL).family?.includes("武装"), "WINGALは武装")
    assert(getCard(SHOCK).name === "ショックイーター" && getCard(SHOCK).colors.includes("green") && getCard(SHOCK).effects.length === 0, "SHOCKは緑の効果なし")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

// 確認が出たら押す。出た回数を返す。確認以外は先頭の候補で答える
function drive(t: ScenarioCtx, decline = false): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            if (decline) assert(pc.optional, "確認はスキップ（断る）できる")
            t.act(side, decline ? { type: "resolveChoice" } : { type: "resolveChoice", option: "発動する" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}

// 自分のアタック。blocker を渡すと相手がブロックし、バトルを最後まで進める。stopAtBattle なら BP比較の前で止める
function myAttack(t: ScenarioCtx, who: string, blocker?: string, decline = false): number {
    t.act("me", { type: "attack", instanceId: t.id(who) })
    let n = drive(t, decline)
    t.closeFlash()
    n += drive(t, decline)
    if (blocker) {
        t.act("opp", { type: "block", instanceId: t.id(blocker) })
        n += drive(t, decline)
    }
    return n
}
function finishBattle(t: ScenarioCtx, decline = false): number {
    let n = 0
    for (let i = 0; i < 6 && t.state.battle; i++) {
        t.closeFlash()
        n += drive(t, decline)
    }
    return n
}
// 相手のアタックを自分がブロックする
function oppAttack(t: ScenarioCtx, who: string, blocker: string): number {
    t.act("opp", { type: "attack", instanceId: t.id(who) })
    let n = drive(t)
    t.closeFlash()
    n += drive(t)
    t.act("me", { type: "block", instanceId: t.id(blocker) })
    n += drive(t)
    return n
}

const nConfirm = (t: ScenarioCtx, n: number, got: number) => assert(got === n, `確認は${n}回（実際 ${got} 回）`)

const THOR_ME = { card: THOR, cores: 2 } // Lv2（BP6000）
const GATLING2 = (extra: object = {}) => ({ card: GATLING, cores: 2, ...extra }) // Lv2（BP5000）
const wall = (card = VANILLA, cores = 1) => ({ spirits: [{ card, cores, label: "壁" }] })

console.log("=== トール：アタック時、武装1体を疲労させて疲労させたスピリットのBPぶんBP+ ===")
const thorMid = (interactive: boolean, me: SideSpec) => ({ turn: "me" as const, phase: "attack" as const, interactive, me })
for (const interactive of [true, false]) {
    const tag = interactive ? "対話" : "非対話"
    console.log(`--- ${tag}：払えると、アタック直後にBP+5000（疲労させたガトリングスタンドLv2のBP） ---`)
    scenario({
        name: `thor-pay-${tag}`,
        start: thorMid(interactive, { spirits: [THOR_ME, GATLING2()] }),
        steps: (t) => nConfirm(t, interactive ? 1 : 0, myAttack(t, "巨神機トール")),
        expect: ["自分.ガトリングスタンド.疲労: false → true", "自分.巨神機トール.疲労: false → true", "自分.巨神機トール.BP: 6000 → 11000"],
    })
    console.log(`--- ${tag}：Lv1でも発揮する（BP4000+3000） ---`)
    scenario({
        name: `thor-lv1-${tag}`,
        start: thorMid(interactive, { spirits: [{ card: THOR, cores: 1 }, { card: GATLING, cores: 1 }] }),
        steps: (t) => nConfirm(t, interactive ? 1 : 0, myAttack(t, "巨神機トール")),
        expect: ["自分.ガトリングスタンド.疲労: false → true", "自分.巨神機トール.疲労: false → true", "自分.巨神機トール.BP: 4000 → 7000"],
    })
    console.log(`--- ${tag}：BP+がバトルを勝たせ、バトルが終わるとBPは元に戻る ---`)
    scenario({
        name: `thor-battle-${tag}`,
        start: { ...thorMid(interactive, { spirits: [THOR_ME, GATLING2()] }), opp: wall(WINGAL, 2) },
        steps: (t) => {
            const n = myAttack(t, "巨神機トール", "壁")
            nConfirm(t, interactive ? 1 : 0, n + finishBattle(t))
        },
        expect: [
            "自分.ガトリングスタンド.疲労: false → true",
            "自分.巨神機トール.疲労: false → true",
            "相手.壁.場所: フィールド → なし",
            "相手.トラッシュ: なし → ウィンガル",
            "相手.リザーブ: 10 → 12",
        ],
    })
}
console.log("--- 払えない（他に武装がいない）：対話でも確認は出ず、BPは増えない ---")
scenario({
    name: "thor-nopay-no-armed",
    start: thorMid(true, { spirits: [THOR_ME, { card: VANILLA, label: "地竜" }] }),
    steps: (t) => nConfirm(t, 0, myAttack(t, "巨神機トール")),
    expect: ["自分.巨神機トール.疲労: false → true"],
})
console.log("--- 払えない（武装が既に疲労）：BPは増えない ---")
scenario({
    name: "thor-nopay-rested",
    start: thorMid(true, { spirits: [THOR_ME, GATLING2({ rested: true })] }),
    steps: (t) => nConfirm(t, 0, myAttack(t, "巨神機トール")),
    expect: ["自分.巨神機トール.疲労: false → true"],
})
console.log("--- 非対話で払えない：何も起きずBPは増えない ---")
scenario({
    name: "thor-nopay-noninteractive",
    start: thorMid(false, { spirits: [THOR_ME, { card: VANILLA, label: "地竜" }] }),
    steps: (t) => nConfirm(t, 0, myAttack(t, "巨神機トール")),
    expect: ["自分.巨神機トール.疲労: false → true"],
})
console.log("--- 相手の武装は払えない（自分のスピリットだけが候補） ---")
scenario({
    name: "thor-opp-armed",
    start: { ...thorMid(true, { spirits: [THOR_ME] }), opp: { spirits: [{ card: GATLING, cores: 2, label: "相手武装" }] } },
    steps: (t) => nConfirm(t, 0, myAttack(t, "巨神機トール")),
    expect: ["自分.巨神機トール.疲労: false → true"],
})
console.log("--- 相手のアタック時には発揮しない（ブロック側のトールは『このスピリットのアタック時』ではない） ---")
scenario({
    name: "thor-block-no-trigger",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [THOR_ME, GATLING2()] }, opp: wall(SHOCK, 1) },
    steps: (t) => nConfirm(t, 0, oppAttack(t, "壁", "巨神機トール") + finishBattle(t)),
    expect: [
        "自分.巨神機トール.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ショックイーター",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== ヴァルハランス：バトル時（Lv2以上）、武装1体を疲労させてBP+ ===")
const VALH_ME = { card: VALH, cores: 3 } // Lv2（BP7000）
const bigWall = wall(WINGAL, 4) // Lv3 BP9000
for (const interactive of [true, false]) {
    const tag = interactive ? "対話" : "非対話"
    console.log(`--- ${tag}：自分のアタックでブロックされた直後にBP+5000 ---`)
    scenario({
        name: `valh-atk-mid-${tag}`,
        start: { ...thorMid(interactive, { spirits: [VALH_ME, GATLING2()] }), opp: bigWall },
        steps: (t) => nConfirm(t, interactive ? 1 : 0, myAttack(t, "鎧神機ヴァルハランス", "壁")),
        expect: ["自分.ガトリングスタンド.疲労: false → true", "自分.鎧神機ヴァルハランス.疲労: false → true", "自分.鎧神機ヴァルハランス.BP: 7000 → 12000", "相手.壁.疲労: false → true"],
    })
    console.log(`--- ${tag}：BP+でBP9000の壁に勝ち、バトルが終わるとBPは元に戻る ---`)
    scenario({
        name: `valh-atk-end-${tag}`,
        start: { ...thorMid(interactive, { spirits: [VALH_ME, GATLING2()] }), opp: bigWall },
        steps: (t) => nConfirm(t, interactive ? 1 : 0, myAttack(t, "鎧神機ヴァルハランス", "壁") + finishBattle(t)),
        expect: [
            "自分.ガトリングスタンド.疲労: false → true",
            "自分.鎧神機ヴァルハランス.疲労: false → true",
            "相手.壁.場所: フィールド → なし",
            "相手.トラッシュ: なし → ウィンガル",
            "相手.リザーブ: 10 → 14",
        ],
    })
    console.log(`--- ${tag}：相手のアタックをブロックしたバトルでもBP+し、勝って元に戻る ---`)
    scenario({
        name: `valh-block-${tag}`,
        start: { turn: "opp", phase: "attack", interactive, me: { spirits: [VALH_ME, GATLING2()] }, opp: bigWall },
        steps: (t) => nConfirm(t, interactive ? 1 : 0, oppAttack(t, "壁", "鎧神機ヴァルハランス") + finishBattle(t)),
        expect: [
            "自分.ガトリングスタンド.疲労: false → true",
            "自分.鎧神機ヴァルハランス.疲労: false → true",
            "相手.壁.場所: フィールド → なし",
            "相手.トラッシュ: なし → ウィンガル",
            "相手.リザーブ: 10 → 14",
        ],
    })
}
console.log("--- ブロックした側：宣言の時点でヴァルハランスは疲労済みなので自分は候補外。他の武装も疲労済みなら、確認は出ずBPは増えない ---")
scenario({
    name: "valh-block-mid",
    start: { turn: "opp", phase: "attack", interactive: true, me: { spirits: [VALH_ME, GATLING2({ rested: true })] }, opp: bigWall },
    steps: (t) => nConfirm(t, 0, oppAttack(t, "壁", "鎧神機ヴァルハランス")),
    expect: ["自分.鎧神機ヴァルハランス.疲労: false → true", "相手.壁.疲労: false → true"],
})
console.log("--- Lv1では発揮しない（確認も出ず、武装は疲労しない） ---")
scenario({
    name: "valh-lv1",
    start: { ...thorMid(true, { spirits: [{ card: VALH, cores: 1 }, GATLING2()] }), opp: wall(VANILLA, 1) },
    steps: (t) => nConfirm(t, 0, myAttack(t, "鎧神機ヴァルハランス", "壁")),
    expect: ["自分.鎧神機ヴァルハランス.疲労: false → true", "相手.壁.疲労: false → true"],
})
console.log("--- ブロックされないアタックでもアタック宣言の時点で発揮する（確認1回）。BP+はそのアタックが終わると消える ---")
scenario({
    name: "valh-no-block",
    start: thorMid(true, { spirits: [VALH_ME, GATLING2()] }),
    steps: (t) => {
        let n = myAttack(t, "鎧神機ヴァルハランス")
        assert(t.state.battle !== null, "アタック中")
        t.act("opp", { type: "takeLife" })
        n += drive(t)
        n += finishBattle(t)
        nConfirm(t, 1, n)
    },
    expect: ["自分.ガトリングスタンド.疲労: false → true", "自分.鎧神機ヴァルハランス.疲労: false → true", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("--- 払えない（他に武装がいない）：対話でも確認は出ず、BPは増えない ---")
scenario({
    name: "valh-nopay",
    start: { ...thorMid(true, { spirits: [VALH_ME, { card: VANILLA, label: "地竜" }] }), opp: bigWall },
    steps: (t) => nConfirm(t, 0, myAttack(t, "鎧神機ヴァルハランス", "壁")),
    expect: ["自分.鎧神機ヴァルハランス.疲労: false → true", "相手.壁.疲労: false → true"],
})
console.log("--- 非対話で払えない：何も起きない ---")
scenario({
    name: "valh-nopay-noninteractive",
    start: { ...thorMid(false, { spirits: [VALH_ME, GATLING2({ rested: true })] }), opp: bigWall },
    steps: (t) => nConfirm(t, 0, myAttack(t, "鎧神機ヴァルハランス", "壁")),
    expect: ["自分.鎧神機ヴァルハランス.疲労: false → true", "相手.壁.疲労: false → true"],
})

console.log("=== アーケランサー：【合体時】フラッシュ、スピリット1体を疲労させてこのターンの間BP+3000 ===")
const combine = (t: ScenarioCtx) => t.act("me", { type: "combineBrave", braveInstanceId: t.id("突機竜アーケランサー"), hostInstanceId: t.id("ガトリングスタンド") })
const lancerBase = (extra: InstanceSpec[] = [], hostRested = false) => ({
    turn: "me" as const,
    me: { spirits: [{ card: LANCER, cores: 1 }, { card: GATLING, cores: 1, rested: hostRested }, ...extra] },
})
// 合体そのものの盤面変化（効果と無関係）
const COMBINED = ["自分.リザーブ: 10 → 11", "自分.突機竜アーケランサー.BP: 3000 → なし", "自分.突機竜アーケランサー.コア: 1 → 0", "自分.突機竜アーケランサー.場所: フィールド → 合体"]
const activate = (t: ScenarioCtx, pick?: string): number => {
    t.act("me", { type: "activateAbility", instanceId: t.id("突機竜アーケランサー"), effectId: "BS12-050-e3" })
    let n = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        if (isConfirm(t)) {
            n++
            t.act("me", { type: "resolveChoice", option: "発動する" })
        } else if (pc.kind === "option") t.act("me", { type: "resolveChoice", option: pc.options![0]! })
        else t.act("me", { type: "resolveChoice", instanceId: pick ? t.id(pick) : pc.candidates[0]! })
    }
    return n
}
for (const interactive of [true, false]) {
    const tag = interactive ? "対話" : "非対話"
    console.log(`--- ${tag}：疲労させられるのが合体先だけなら、合体先を疲労させてBP+3000（起動で確認済みなので聞き直さない） ---`)
    scenario({
        name: `lancer-self-${tag}`,
        start: { ...lancerBase(), interactive },
        steps: (t) => {
            combine(t)
            nConfirm(t, 0, activate(t))
        },
        expect: [...COMBINED, "自分.ガトリングスタンド.疲労: false → true", "自分.ガトリングスタンド.BP: 3000 → 9000"],
    })
}
console.log("--- 対話：他のスピリットを選んで疲労させる。合体先は疲労しない ---")
scenario({
    name: "lancer-helper",
    start: { ...lancerBase([{ card: WINGAL, cores: 2 }]), interactive: true },
    steps: (t) => {
        combine(t)
        nConfirm(t, 0, activate(t, "ウィンガル"))
    },
    expect: [...COMBINED, "自分.ウィンガル.疲労: false → true", "自分.ガトリングスタンド.BP: 3000 → 9000"],
})
console.log("--- 払えない（疲労させられるスピリットがいない）：BPは増えない ---")
for (const interactive of [true, false]) {
    scenario({
        name: `lancer-nopay-${interactive ? "対話" : "非対話"}`,
        start: { ...lancerBase([], true), interactive },
        steps: (t) => {
            combine(t)
            activate(t)
        },
        expect: [...COMBINED, "自分.ガトリングスタンド.BP: 3000 → 6000"],
    })
}
console.log("--- このターンの間：バトルが終わってもBP+3000は残る ---")
scenario({
    name: "lancer-persist",
    start: { ...lancerBase([{ card: WINGAL, cores: 2 }]), interactive: true, opp: wall(VANILLA, 1) },
    steps: (t) => {
        combine(t)
        activate(t, "ウィンガル")
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("ガトリングスタンド") })
        drive(t)
        t.closeFlash()
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        finishBattle(t)
    },
    expect: [
        ...COMBINED,
        "自分.ウィンガル.疲労: false → true",
        "自分.ガトリングスタンド.疲労: false → true",
        "自分.ガトリングスタンド.BP: 3000 → 9000",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== ウシワカ：バトル終了時、このスピリットを手札に戻して、自分のスピリット1体にこのターンの間BP+3000 ===")
const USHI_ME = { card: USHI, cores: 1 } // Lv1 BP5000
const GAT1 = { card: GATLING, cores: 1 } // BP3000
const ushiReturned = [
    "自分.風の覇王ドルクス・ウシワカ.場所: フィールド → なし",
    "自分.手札: なし → 風の覇王ドルクス・ウシワカ",
    "自分.リザーブ: 10 → 11",
]
for (const interactive of [true, false]) {
    const tag = interactive ? "対話" : "非対話"
    console.log(`--- ${tag}：自分のアタックで勝ち、バトル終了時に手札へ戻して他のスピリットがターンの間BP+3000 ---`)
    scenario({
        name: `ushi-atk-${tag}`,
        start: { ...thorMid(interactive, { spirits: [USHI_ME, GAT1] }), opp: wall(VANILLA, 1) },
        steps: (t) => nConfirm(t, interactive ? 1 : 0, myAttack(t, "風の覇王ドルクス・ウシワカ", "壁") + finishBattle(t)),
        expect: [
            ...ushiReturned,
            "自分.ガトリングスタンド.BP: 3000 → 6000",
            "相手.壁.場所: フィールド → なし",
            "相手.トラッシュ: なし → ロクケラトプス",
            "相手.リザーブ: 10 → 11",
        ],
    })
    console.log(`--- ${tag}：相手のアタックをブロックしたバトルでも同じ ---`)
    scenario({
        name: `ushi-block-${tag}`,
        start: { turn: "opp", phase: "attack", interactive, me: { spirits: [USHI_ME, GAT1] }, opp: wall(VANILLA, 1) },
        steps: (t) => nConfirm(t, interactive ? 1 : 0, oppAttack(t, "壁", "風の覇王ドルクス・ウシワカ") + finishBattle(t)),
        expect: [
            ...ushiReturned,
            "自分.ガトリングスタンド.BP: 3000 → 6000",
            "相手.壁.場所: フィールド → なし",
            "相手.トラッシュ: なし → ロクケラトプス",
            "相手.リザーブ: 10 → 11",
        ],
    })
}
console.log("--- 他に自分のスピリットがいない：払わない（手札に戻らない）。確認は出ない ---")
scenario({
    name: "ushi-alone",
    start: { ...thorMid(true, { spirits: [USHI_ME] }), opp: wall(VANILLA, 1) },
    steps: (t) => nConfirm(t, 0, myAttack(t, "風の覇王ドルクス・ウシワカ", "壁") + finishBattle(t)),
    expect: [
        "自分.風の覇王ドルクス・ウシワカ.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("--- 非対話で他にいない：払わない ---")
scenario({
    name: "ushi-alone-noninteractive",
    start: { ...thorMid(false, { spirits: [USHI_ME] }), opp: wall(VANILLA, 1) },
    steps: (t) => nConfirm(t, 0, myAttack(t, "風の覇王ドルクス・ウシワカ", "壁") + finishBattle(t)),
    expect: [
        "自分.風の覇王ドルクス・ウシワカ.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})
console.log("--- バトルで破壊された：バトル終了時に場にいないので、何も起きない ---")
scenario({
    name: "ushi-destroyed",
    start: { ...thorMid(true, { spirits: [USHI_ME, GAT1] }), opp: wall(WINGAL, 2) },
    steps: (t) => nConfirm(t, 0, myAttack(t, "風の覇王ドルクス・ウシワカ", "壁") + finishBattle(t)),
    expect: [
        "自分.風の覇王ドルクス・ウシワカ.場所: フィールド → なし",
        "自分.トラッシュ: なし → 風の覇王ドルクス・ウシワカ",
        "自分.リザーブ: 10 → 11",
        "相手.壁.疲労: false → true",
    ],
})
console.log("--- ブロックされない（バトルにならない）アタックでは発揮しない ---")
scenario({
    name: "ushi-no-battle",
    start: thorMid(true, { spirits: [USHI_ME, GAT1] }),
    steps: (t) => nConfirm(t, 0, myAttack(t, "風の覇王ドルクス・ウシワカ")),
    expect: ["自分.風の覇王ドルクス・ウシワカ.疲労: false → true"],
})

console.log("=== 確認を断る（対話）：払わず、BP+も起きない ===")
console.log("--- トール：断るとガトリングは疲労せずBPも増えない ---")
scenario({
    name: "thor-decline",
    start: thorMid(true, { spirits: [THOR_ME, GATLING2()] }),
    steps: (t) => nConfirm(t, 1, myAttack(t, "巨神機トール", undefined, true)),
    expect: ["自分.巨神機トール.疲労: false → true"],
})
console.log("--- ヴァルハランス：自分のアタックでブロックされて断ると、ガトリングは疲労せずBPも増えない ---")
scenario({
    name: "valh-decline",
    start: { ...thorMid(true, { spirits: [VALH_ME, GATLING2()] }), opp: bigWall },
    steps: (t) => nConfirm(t, 1, myAttack(t, "鎧神機ヴァルハランス", "壁", true)),
    expect: ["自分.鎧神機ヴァルハランス.疲労: false → true", "相手.壁.疲労: false → true"],
})
console.log("--- ウシワカ：バトル終了時に断ると、手札に戻らずガトリングのBPも増えない ---")
scenario({
    name: "ushi-decline",
    start: { ...thorMid(true, { spirits: [USHI_ME, GAT1] }), opp: wall(VANILLA, 1) },
    steps: (t) => nConfirm(t, 1, myAttack(t, "風の覇王ドルクス・ウシワカ", "壁", true) + finishBattle(t, true)),
    expect: [
        "自分.風の覇王ドルクス・ウシワカ.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part468）")
