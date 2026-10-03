// smoke パート484（未発火だった効果節の場面テスト：効果文だけから書いた期待値）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const VANILLA = "BS01-002"

const need = (id: string, name: string, type: string) => {
    const c = getCard(id)
    assert(c.name === name && c.type === type, `${id} は ${name}（${type}）`)
}

console.log("=== 前提: カードの機械確認 ===")
need(VANILLA, "ロクケラトプス", "spirit")
need("X008", "神星皇ストライク・アポロドラゴン", "spirit")
need("BS14-067", "ラギアン", "brave")
need("BS14-071", "トランプン", "brave")
need("X007", "天地神龍ガイ・アスラ", "spirit")

// 確認が出たら押す（押した回数を返す）。確認以外は先頭の候補で答える
const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}
function drive(t: ScenarioCtx, answer = true): number {
    let confirms = 0
    while (t.state.pendingChoice) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            confirms++
            t.act(side, answer ? { type: "resolveChoice", option: "発動する" } : { type: "resolveChoice" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
        if (confirms > 5) throw new Error("確認が繰り返し出ている")
    }
    return confirms
}
const combine = (t: ScenarioCtx, brave: string, host: string) =>
    t.act("me", { type: "combineBrave", braveInstanceId: t.id(brave), hostInstanceId: t.id(host) })

const nexusIn = (name: string, lv = 1, cores = 0) => [
    `自分.${name}.Lv: なし → ${lv}`,
    `自分.${name}.コア: なし → ${cores}`,
    `自分.${name}.場所: なし → ネクサス`,
    `自分.${name}.疲労: なし → false`,
]

// ===== X008 =====
const X008 = "神星皇ストライク・アポロドラゴン"
console.log("=== X008-e1 相手のアタック時に回復（緑/白/黄のブレイヴと合体時） ===")
{
    // 自分のターンに合体 → ターンを終える → 相手がアタック
    const oppAtk = (t: ScenarioCtx) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    }
    const common = [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 10 → 11",
        "相手.アタッカー.疲労: false → true",
        "相手.手札: なし → ロクケラトプス",
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 11",
    ]
    scenario({
        name: "x008-e1-yellow",
        start: { turn: "me", me: { spirits: [{ card: "X008", rested: true }, { card: "BS14-071", cores: 0 }] }, opp: { spirits: [{ card: VANILLA, label: "アタッカー" }] } },
        steps: (t) => {
            combine(t, "トランプン", X008)
            t.act("me", { type: "endTurn" })
            oppAtk(t)
        },
        expect: [...common, "自分.トランプン.場所: フィールド → 合体", `自分.${X008}.BP: 6000 → 9000`, `自分.${X008}.疲労: true → false`, "自分.トランプン.BP: 0 → なし", "自分.トランプン.Lv: 0 → 1"],
    })
    scenario({
        name: "x008-e1-red",
        start: { turn: "me", me: { spirits: [{ card: "X008", rested: true }, { card: "BS14-067", cores: 0 }] }, opp: { spirits: [{ card: VANILLA, label: "アタッカー" }] } },
        steps: (t) => {
            combine(t, "ラギアン", X008)
            t.act("me", { type: "endTurn" })
            oppAtk(t)
        },
        expect: [...common, "自分.ラギアン.場所: フィールド → 合体", `自分.${X008}.BP: 6000 → 10000`, "自分.ラギアン.BP: 0 → なし", "自分.ラギアン.Lv: 0 → 1"],
    })
    scenario({
        name: "x008-e1-nobrave",
        start: { turn: "opp", me: { spirits: [{ card: "X008", rested: true }] }, opp: { spirits: [{ card: VANILLA, label: "アタッカー" }] } },
        steps: oppAtk,
        expect: ["自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.アタッカー.疲労: false → true"],
    })
}

console.log("=== X008-e2 合体アタック時に BP10000以下の相手スピリットを破壊（Lv2・赤/紫/青のブレイヴ） ===")
{
    const atk = (t: ScenarioCtx) => {
        combine(t, "ラギアン", X008)
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id(X008) })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    }
    const oppSide = { spirits: [{ card: VANILLA, label: "弱い" }, { card: "X007", cores: 3, label: "強い" }] }
    scenario({
        name: "x008-e2-red-lv2",
        start: { me: { spirits: [{ card: "X008", cores: 2 }, { card: "BS14-067", cores: 0 }] }, opp: oppSide },
        steps: atk,
        expect: [
            "自分.ラギアン.場所: フィールド → 合体",
            `自分.${X008}.BP: 10000 → 14000`,
            `自分.${X008}.疲労: false → true`,
            "相手.弱い.場所: フィールド → なし",
            "相手.トラッシュ: なし → ロクケラトプス",
            "相手.ライフ: 5 → 2",
            "相手.リザーブ: 10 → 14",
            "自分.ラギアン.BP: 0 → なし",
            "自分.ラギアン.Lv: 0 → 1",
        ],
    })
    scenario({
        name: "x008-e2-yellow",
        start: { me: { spirits: [{ card: "X008", cores: 2 }, { card: "BS14-071", cores: 0 }] }, opp: oppSide },
        steps: (t) => {
            combine(t, "トランプン", X008)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(X008) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.トランプン.場所: フィールド → 合体",
            `自分.${X008}.BP: 10000 → 13000`,
            `自分.${X008}.疲労: false → true`,
            "相手.ライフ: 5 → 2",
            "相手.リザーブ: 10 → 13",
            "自分.トランプン.BP: 0 → なし",
            "自分.トランプン.Lv: 0 → 1",
        ],
    })
    scenario({
        name: "x008-e2-lv1",
        start: { me: { spirits: [{ card: "X008", cores: 1 }, { card: "BS14-067", cores: 0 }] }, opp: oppSide },
        steps: (t) => {
            combine(t, "ラギアン", X008)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(X008) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [
            "自分.ラギアン.場所: フィールド → 合体",
            `自分.${X008}.BP: 6000 → 10000`,
            `自分.${X008}.疲労: false → true`,
            "相手.ライフ: 5 → 2",
            "相手.リザーブ: 10 → 13",
            "自分.ラギアン.BP: 0 → なし",
            "自分.ラギアン.Lv: 0 → 1",
        ],
    })
}

// ===== BS16-064 宙吊りの五行山 =====
console.log("=== BS16-064 配置時：相手のスピリット2体のコアをそれぞれ1個だけにする ===")
need("BS16-064", "宙吊りの五行山", "nexus")
need("BS16-001", "ノデッポ", "spirit")
{
    const placed = ["自分.手札: 宙吊りの五行山 → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5", ...nexusIn("宙吊りの五行山")]
    scenario({
        name: "gokyou-place",
        start: { me: { hand: ["BS16-064"] }, opp: { spirits: [{ card: VANILLA, label: "A", cores: 3 }, { card: VANILLA, label: "B", cores: 2 }] } },
        steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
        expect: [...placed, "相手.A.コア: 3 → 1", "相手.B.コア: 2 → 1", "相手.リザーブ: 10 → 13", "相手.A.BP: 4000 → 1000", "相手.A.Lv: 3 → 1", "相手.B.BP: 3000 → 1000", "相手.B.Lv: 2 → 1"],
    })
    scenario({
        name: "gokyou-place-one-core",
        start: { me: { hand: ["BS16-064"] }, opp: { spirits: [{ card: VANILLA, label: "A", cores: 1 }, { card: VANILLA, label: "B", cores: 1 }] } },
        steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
        expect: placed,
    })
}

console.log("=== BS16-064 Lv2：『召喚時』効果を持つコスト5以下の自分のスピリットが破壊されたとき手札に戻せる ===")
{
    // 相手のX007(BP8000)にアタックされ、ブロックしたスピリットが破壊される
    const lose = (t: ScenarioCtx, blocker: string, answer: boolean | null) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id(blocker) })
        t.closeFlash()
        if (t.state.pendingChoice) console.log("DEBUG", JSON.stringify(t.state.pendingChoice).slice(0, 300))
        return answer === null ? 0 : drive(t, answer)
    }
    const me = (card: string) => ({ nexuses: [{ card: "BS16-064", cores: 1 }], spirits: [{ card, label: "守り", cores: 1 }] })
    const opp = { spirits: [{ card: "X007", label: "攻撃役" }] }
    scenario({
        name: "gokyou-lv2-return",
        start: { turn: "opp", interactive: true, me: me("BS16-001"), opp },
        steps: (t) => {
            const n = lose(t, "守り", true)
            assert(n === 1, `確認は1回（実際 ${n}）`)
        },
        expect: ["自分.守り.場所: フィールド → なし", "自分.手札: なし → ノデッポ", "自分.リザーブ: 10 → 11", "相手.攻撃役.疲労: false → true"],
    })
}
