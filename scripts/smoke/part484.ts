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

const nexusIn = (name: string, lv = 1, cores = 0, side = "自分") => [
    `${side}.${name}.Lv: なし → ${lv}`,
    `${side}.${name}.コア: なし → ${cores}`,
    `${side}.${name}.場所: なし → ネクサス`,
    `${side}.${name}.疲労: なし → false`,
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
        return answer === null ? 0 : drive(t, answer)
    }
    const me = (card: string, nexusCores = 1) => ({ nexuses: [{ card: "BS16-064", cores: nexusCores }], spirits: [{ card, label: "守り", cores: 1 }] })
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
    const stays = ["自分.守り.場所: フィールド → なし", "自分.リザーブ: 10 → 11", "相手.攻撃役.疲労: false → true"]
    scenario({
        name: "gokyou-lv2-decline",
        start: { turn: "opp", interactive: true, me: me("BS16-001"), opp },
        steps: (t) => {
            const n = lose(t, "守り", false)
            assert(n === 1, `確認は1回（実際 ${n}）`)
        },
        expect: [...stays, "自分.トラッシュ: なし → ノデッポ"],
    })
    scenario({
        name: "gokyou-lv1",
        start: { turn: "opp", interactive: true, me: me("BS16-001", 0), opp },
        steps: (t) => assert(lose(t, "守り", true) === 0, "Lv1 では確認は出ない"),
        expect: [...stays, "自分.トラッシュ: なし → ノデッポ"],
    })
    scenario({
        name: "gokyou-lv2-no-summon-effect",
        start: { turn: "opp", interactive: true, me: me(VANILLA), opp },
        steps: (t) => assert(lose(t, "守り", true) === 0, "『召喚時』効果を持たないスピリットでは確認は出ない"),
        expect: [...stays, "自分.トラッシュ: なし → ロクケラトプス"],
    })
    scenario({
        name: "gokyou-lv2-cost6",
        start: { turn: "opp", interactive: true, me: me("X005A"), opp },
        steps: (t) => assert(lose(t, "守り", true) === 0, "コスト6では確認は出ない"),
        expect: [...stays, "自分.トラッシュ: なし → 北斗七星龍ジーク・アポロドラゴン"],
    })
}

// ===== BS16-066 浮遊関 =====
console.log("=== BS16-066 配置時：相手のスピリット2体を疲労させる ===")
need("BS16-066", "浮遊関", "nexus")
need("BS02-026", "マッハジー", "spirit")
{
    const placed = ["自分.手札: 浮遊関 → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5", ...nexusIn("浮遊関")]
    scenario({
        name: "fuyuukan-place",
        start: { me: { hand: ["BS16-066"] }, opp: { spirits: [{ card: VANILLA, label: "A" }, { card: VANILLA, label: "B" }] } },
        steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
        expect: [...placed, "相手.A.疲労: false → true", "相手.B.疲労: false → true"],
    })
    scenario({
        name: "fuyuukan-place-already-rested",
        start: { me: { hand: ["BS16-066"] }, opp: { spirits: [{ card: VANILLA, label: "A", rested: true }, { card: VANILLA, label: "B", rested: true }] } },
        steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
        expect: placed,
    })
}

console.log("=== BS16-066 Lv2 エンドステップ：【神速】を持つ自分のスピリットを手札に戻すことでコア1個 ===")
{
    const oppTurnStart = ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"]
    const end = (t: ScenarioCtx, answer: boolean) => {
        t.act("me", { type: "endTurn" })
        return drive(t, answer)
    }
    scenario({
        name: "fuyuukan-lv2-pay",
        start: { interactive: true, me: { nexuses: [{ card: "BS16-066", cores: 1 }], spirits: [{ card: "BS02-026", cores: 1 }] } },
        steps: (t) => assert(end(t, true) === 1, "確認は1回"),
        expect: [...oppTurnStart, "自分.マッハジー.場所: フィールド → なし", "自分.手札: なし → マッハジー", "自分.リザーブ: 10 → 12"],
    })
    scenario({
        name: "fuyuukan-lv2-decline",
        start: { interactive: true, me: { nexuses: [{ card: "BS16-066", cores: 1 }], spirits: [{ card: "BS02-026", cores: 1 }] } },
        steps: (t) => assert(end(t, false) === 1, "確認は1回"),
        expect: oppTurnStart,
    })
    scenario({
        name: "fuyuukan-lv2-no-shinsoku",
        start: { interactive: true, me: { nexuses: [{ card: "BS16-066", cores: 1 }], spirits: [{ card: VANILLA }] } },
        steps: (t) => assert(end(t, true) === 0, "【神速】持ちがいなければ確認は出ない"),
        expect: oppTurnStart,
    })
    scenario({
        name: "fuyuukan-lv1",
        start: { interactive: true, me: { nexuses: [{ card: "BS16-066", cores: 0 }], spirits: [{ card: "BS02-026", cores: 1 }] } },
        steps: (t) => assert(end(t, true) === 0, "Lv1 では確認は出ない"),
        expect: oppTurnStart,
    })
}

// ===== BS16-062 天下眺める絶景門 =====
console.log("=== BS16-062 配置時：BP5000以下の相手のスピリット1体を破壊 ===")
need("BS16-062", "天下眺める絶景門", "nexus")
{
    const placed = ["自分.手札: 天下眺める絶景門 → なし", "自分.リザーブ: 10 → 5", "自分.トラッシュのコア: 0 → 5", ...nexusIn("天下眺める絶景門")]
    scenario({
        name: "zekkei-place",
        start: { me: { hand: ["BS16-062"] }, opp: { spirits: [{ card: VANILLA, label: "弱い" }, { card: "X007", label: "強い" }] } },
        steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
        expect: [...placed, "相手.弱い.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "zekkei-place-only-strong",
        start: { me: { hand: ["BS16-062"] }, opp: { spirits: [{ card: "X007", label: "強い" }] } },
        steps: (t) => t.act("me", { type: "setNexus", handIndex: 0 }),
        expect: placed,
    })
}

console.log("=== BS16-062 Lv2 自分のドローステップ：ドローの枚数を+1枚 ===")
{
    const drawn = (n: number) => [
        `自分.手札: なし → ${Array(n).fill("ロクケラトプス").join("、")}`,
        `自分.デッキ枚数: 40 → ${40 - n}`,
        "自分.リザーブ: 10 → 11",
    ]
    scenario({
        name: "zekkei-lv2-draw",
        start: { turn: "opp", me: { nexuses: [{ card: "BS16-062", cores: 3 }] } },
        steps: (t) => t.act("opp", { type: "endTurn" }),
        expect: drawn(2),
    })
    scenario({
        name: "zekkei-lv1-draw",
        start: { turn: "opp", me: { nexuses: [{ card: "BS16-062", cores: 0 }] } },
        steps: (t) => t.act("opp", { type: "endTurn" }),
        expect: drawn(1),
    })
    scenario({
        name: "zekkei-opp-nexus-draw",
        start: { turn: "opp", opp: { nexuses: [{ card: "BS16-062", cores: 3 }] } },
        steps: (t) => t.act("opp", { type: "endTurn" }),
        expect: drawn(1),
    })
}

// ===== BS08-062 超時空重力炉 =====
console.log("=== BS08-062 Lv2 自分のメインステップ：召喚時、シンボルが白3つ ／ コスト3以下は軽減不可 ===")
need("BS08-062", "超時空重力炉", "nexus")
need("BS01-089", "デュアルキャノン・ベル", "spirit")
need("BS01-084", "ガトリングスタンド", "spirit")
{
    // 召喚した個体の行（コア1個・Lv1）
    const born = (name: string, bp: number) => [
        `${name}.Lv: なし → 1`, `${name}.BP: なし → ${bp}`, `${name}.コア: なし → 1`, `${name}.場所: なし → フィールド`, `${name}.疲労: なし → false`,
    ]
    // 支払うコスト n：リザーブ n+1 減り（上に置くコア1個）、トラッシュのコアが n 増える
    const paid = (side: string, hand: string, n: number) => [
        `${side}.手札: ${hand} → なし`, `${side}.リザーブ: 10 → ${10 - n - 1}`, `${side}.トラッシュのコア: 0 → ${n}`,
    ]
    scenario({
        name: "gravity-lv2-cost4",
        start: { me: { hand: ["BS01-089"], nexuses: [{ card: "BS08-062", cores: 1 }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...paid("自分", "デュアルキャノン・ベル", 1), ...born("自分.デュアルキャノン・ベル", 3000)],
    })
    scenario({
        name: "gravity-lv1-cost4",
        start: { me: { hand: ["BS01-089"], nexuses: [{ card: "BS08-062", cores: 0 }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...paid("自分", "デュアルキャノン・ベル", 3), ...born("自分.デュアルキャノン・ベル", 3000)],
    })
    scenario({
        name: "gravity-lv2-cost3-no-reduction",
        start: { me: { hand: ["BS01-084"], nexuses: [{ card: "BS08-062", cores: 1 }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...paid("自分", "ガトリングスタンド", 3), ...born("自分.ガトリングスタンド", 3000)],
    })
    // 相手が召喚するときも軽減できない（相手の盤面の白シンボル1つ。ネクサスは自分側）
    const oppBoard = { spirits: [{ card: "BS01-089", label: "白い盤面" }], hand: ["BS01-084"] }
    scenario({
        name: "gravity-opp-cost3-no-reduction",
        start: { turn: "opp", me: { nexuses: [{ card: "BS08-062", cores: 1 }] }, opp: oppBoard },
        steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
        expect: [...paid("相手", "ガトリングスタンド", 3), ...born("相手.ガトリングスタンド", 3000)],
    })
    scenario({
        name: "gravity-control-no-nexus",
        start: { turn: "opp", opp: oppBoard },
        steps: (t) => t.act("opp", { type: "summon", handIndex: 0 }),
        expect: [...paid("相手", "ガトリングスタンド", 2), ...born("相手.ガトリングスタンド", 3000)],
    })
}

// ===== BS16-038 クラブソーサラー・スケアクロウ =====
console.log("=== BS16-038 相手によって系統「四道」の自分のスピリットが破壊されたときドロー ===")
need("BS16-038", "クラブソーサラー・スケアクロウ", "spirit")
{
    // 相手が手札から絶景門を配置し、BP5000以下の自分のスピリットを破壊する（相手の効果による破壊）
    const oppPlace = (t: ScenarioCtx) => t.act("opp", { type: "setNexus", handIndex: 0 })
    const oppSide = { hand: ["BS16-062"] }
    const oppRows = ["相手.手札: 天下眺める絶景門 → なし", "相手.リザーブ: 10 → 5", "相手.トラッシュのコア: 0 → 5", ...nexusIn("天下眺める絶景門", 1, 0, "相手")]
    scenario({
        name: "scarecrow-draw",
        start: { turn: "opp", me: { spirits: [{ card: "BS16-038" }] }, opp: oppSide },
        steps: oppPlace,
        expect: [
            ...oppRows,
            "自分.クラブソーサラー・スケアクロウ.場所: フィールド → なし",
            "自分.トラッシュ: なし → クラブソーサラー・スケアクロウ",
            "自分.リザーブ: 10 → 11",
            "自分.手札: なし → ロクケラトプス",
            "自分.デッキ枚数: 40 → 39",
        ],
    })
    scenario({
        name: "scarecrow-no-draw-for-non-shido",
        start: { turn: "opp", interactive: true, me: { spirits: [{ card: "BS16-038", rested: true }, { card: VANILLA, label: "バニラ" }] }, opp: oppSide },
        steps: (t) => {
            oppPlace(t)
            assert(t.state.pendingChoice?.pid === t.opp, "対象は配置した相手が選ぶ")
            t.act("opp", { type: "resolveChoice", instanceId: t.id("バニラ") })
        },
        expect: [
            ...oppRows,
            "自分.バニラ.場所: フィールド → なし",
            "自分.トラッシュ: なし → ロクケラトプス",
            "自分.リザーブ: 10 → 11",
        ],
    })
}

// ===== BS16-039 グリムの天使ラプンツェル =====
console.log("=== BS16-039 Lv2：相手のスピリットの効果で1度に10枚以上破棄されたとき、5枚までデッキの上に戻す ===")
need("BS16-039", "グリムの天使ラプンツェル", "spirit")
need("BS03-X12", "英雄巨人タイタス", "spirit")
{
    // 戻す順番（デッキの上から何番目か）は写像に出ないので、ここでは枚数だけを確かめる
    const titusRows = [
        "相手.手札: 英雄巨人タイタス → なし", "相手.トラッシュのコア: 0 → 8", "相手.リザーブ: 10 → 1",
        "相手.英雄巨人タイタス.BP: なし → 6000", "相手.英雄巨人タイタス.Lv: なし → 1", "相手.英雄巨人タイタス.コア: なし → 1",
        "相手.英雄巨人タイタス.場所: なし → フィールド", "相手.英雄巨人タイタス.疲労: なし → false",
    ]
    const names = (n: number) => Array(n).fill("ロクケラトプス").join("、")
    const mine = (cores: number, deck?: string[]) => ({ spirits: [{ card: "BS16-039", cores }], ...(deck ? { deck } : {}) })
    scenario({
        name: "rapunzel-lv2-return5",
        mirror: true,
        start: { turn: "opp", interactive: true, me: mine(2), opp: { hand: ["BS03-X12"] } },
        steps: (t) => {
            t.act("opp", { type: "summon", handIndex: 0 })
            assert(t.state.pendingChoice?.pid === t.me && t.state.pendingChoice.kind === "card", "戻すカードは持ち主が選ぶ")
            for (let i = 0; i < 5; i++) {
                if (!t.state.pendingChoice) break
                t.act("me", { type: "resolveChoice", cardIndex: i })
            }
            assert(t.state.pendingChoice === null, "5枚選んだら終わる")
        },
        expect: [...titusRows, "自分.デッキ枚数: 40 → 35", `自分.トラッシュ: なし → ${names(5)}`],
    })
    scenario({
        name: "rapunzel-lv2-return2-then-stop",
        start: { turn: "opp", interactive: true, me: mine(2), opp: { hand: ["BS03-X12"] } },
        steps: (t) => {
            t.act("opp", { type: "summon", handIndex: 0 })
            t.act("me", { type: "resolveChoice", cardIndex: 0 })
            t.act("me", { type: "resolveChoice", cardIndex: 1 })
            if (t.state.pendingChoice) t.act("me", { type: "resolveChoice" })
            assert(t.state.pendingChoice === null, "途中で止められる（5枚までなので）")
        },
        expect: [...titusRows, "自分.デッキ枚数: 40 → 32", `自分.トラッシュ: なし → ${names(8)}`],
    })
    scenario({
        name: "rapunzel-lv1",
        start: { turn: "opp", interactive: true, me: mine(1), opp: { hand: ["BS03-X12"] } },
        steps: (t) => {
            t.act("opp", { type: "summon", handIndex: 0 })
            assert(t.state.pendingChoice === null, "Lv1 では選択は出ない")
        },
        expect: [...titusRows, "自分.デッキ枚数: 40 → 30", `自分.トラッシュ: なし → ${names(10)}`],
    })
    scenario({
        name: "rapunzel-lv2-only-9",
        start: { turn: "opp", interactive: true, me: mine(2, Array.from({ length: 9 }, () => VANILLA)), opp: { hand: ["BS03-X12"] } },
        steps: (t) => {
            t.act("opp", { type: "summon", handIndex: 0 })
            assert(t.state.pendingChoice === null, "破棄されたのが9枚なら選択は出ない")
        },
        expect: [...titusRows, "自分.デッキ枚数: 9 → 0", `自分.トラッシュ: なし → ${names(9)}`],
    })
}

// ===== BS16-013 闇騎士フローレンス =====
console.log("=== BS16-013 【不死】で召喚されたとき、相手の合体スピリットのブレイヴ1つを破壊 ===")
need("BS16-013", "闇騎士フローレンス", "spirit")
need("BS03-018", "ダークレイス", "spirit")
{
    const answer = (t: ScenarioCtx, summon: boolean) => {
        let asked = 0
        while (t.state.pendingChoice) {
            const pc = t.state.pendingChoice
            if (pc.kind === "option" && (pc.options ?? []).includes("召喚する")) {
                asked++
                t.act("me", summon ? { type: "resolveChoice", option: "召喚する" } : { type: "resolveChoice" })
            } else throw new Error("想定外の選択待ち: " + pc.prompt)
        }
        return asked
    }
    // 相手は自分のターンに合体してアタックする。自分のスピリットがブロックして破壊される
    const battle = (t: ScenarioCtx, blocker: string, withBrave: boolean) => {
        if (withBrave) t.act("opp", { type: "combineBrave", braveInstanceId: t.id("トランプン"), hostInstanceId: t.id("天地神龍ガイ・アスラ") })
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("天地神龍ガイ・アスラ") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id(blocker) })
        t.closeFlash()
    }
    const oppBraved = { spirits: [{ card: "X007", cores: 1 }, { card: "BS14-071", cores: 0 }] }
    const oppRows = ["相手.天地神龍ガイ・アスラ.疲労: false → true"]
    const combined = ["相手.トランプン.BP: 0 → なし", "相手.トランプン.Lv: 0 → 1"]
    scenario({
        name: "florence-fushi-destroys-brave",
        start: { turn: "opp", interactive: true, me: { spirits: [{ card: "BS03-018", label: "守り" }], trash: ["BS16-013"] }, opp: oppBraved },
        steps: (t) => {
            battle(t, "守り", true)
            assert(answer(t, true) === 1, "【不死】の確認は1回")
        },
        expect: [
            ...oppRows,
            "相手.トランプン.場所: フィールド → なし",
            "相手.トラッシュ: なし → トランプン",
            "自分.守り.場所: フィールド → なし",
            "自分.トラッシュ: 闇騎士フローレンス → ダークレイス",
            "自分.トラッシュのコア: 0 → 2",
            "自分.リザーブ: 10 → 8",
            "自分.闇騎士フローレンス.BP: なし → 2000", "自分.闇騎士フローレンス.Lv: なし → 1", "自分.闇騎士フローレンス.コア: なし → 1",
            "自分.闇騎士フローレンス.場所: なし → フィールド", "自分.闇騎士フローレンス.疲労: なし → false",
        ],
    })
    scenario({
        name: "florence-fushi-declined",
        start: { turn: "opp", interactive: true, me: { spirits: [{ card: "BS03-018", label: "守り" }], trash: ["BS16-013"] }, opp: oppBraved },
        steps: (t) => {
            battle(t, "守り", true)
            assert(answer(t, false) === 1, "【不死】の確認は1回")
        },
        expect: [
            ...oppRows, ...combined, "相手.トランプン.場所: フィールド → 合体", "相手.天地神龍ガイ・アスラ.BP: 8000 → 11000",
            "自分.守り.場所: フィールド → なし",
            "自分.トラッシュ: 闇騎士フローレンス → ダークレイス、闇騎士フローレンス",
            "自分.リザーブ: 10 → 11",
        ],
    })
    scenario({
        name: "florence-fushi-no-brave",
        start: { turn: "opp", interactive: true, me: { spirits: [{ card: "BS03-018", label: "守り" }], trash: ["BS16-013"] }, opp: { spirits: [{ card: "X007", cores: 1 }, { card: "BS14-071", cores: 0, label: "ブレイヴ" }] } },
        steps: (t) => {
            battle(t, "守り", false)
            assert(answer(t, true) === 1, "【不死】の確認は1回")
        },
        expect: [
            ...oppRows,
            "自分.守り.場所: フィールド → なし",
            "自分.トラッシュ: 闇騎士フローレンス → ダークレイス",
            "自分.トラッシュのコア: 0 → 2",
            "自分.リザーブ: 10 → 8",
            "自分.闇騎士フローレンス.BP: なし → 2000", "自分.闇騎士フローレンス.Lv: なし → 1", "自分.闇騎士フローレンス.コア: なし → 1",
            "自分.闇騎士フローレンス.場所: なし → フィールド", "自分.闇騎士フローレンス.疲労: なし → false",
        ],
    })
    scenario({
        name: "florence-fushi-cost6",
        start: { turn: "opp", interactive: true, me: { spirits: [{ card: "X005A", label: "守り" }], trash: ["BS16-013"] }, opp: oppBraved },
        steps: (t) => {
            battle(t, "守り", true)
            assert(answer(t, true) === 0, "コスト6では【不死】は出ない")
        },
        expect: [
            ...oppRows, ...combined, "相手.トランプン.場所: フィールド → 合体", "相手.天地神龍ガイ・アスラ.BP: 8000 → 11000",
            "自分.守り.場所: フィールド → なし",
            "自分.トラッシュ: 闇騎士フローレンス → 北斗七星龍ジーク・アポロドラゴン、闇騎士フローレンス",
            "自分.リザーブ: 10 → 11",
        ],
    })
}

// ===== BS16-001 ノデッポ =====
console.log("=== BS16-001 召喚時：バーストをセットしているとき BP3000以下の相手のスピリット1体を破壊 ===")
{
    const born = [
        "自分.ノデッポ.Lv: なし → 1", "自分.ノデッポ.BP: なし → 1000", "自分.ノデッポ.コア: なし → 1",
        "自分.ノデッポ.場所: なし → フィールド", "自分.ノデッポ.疲労: なし → false",
        "自分.手札: ノデッポ → なし", "自分.リザーブ: 10 → 7", "自分.トラッシュのコア: 0 → 2",
    ]
    const oppSide = { spirits: [{ card: VANILLA, label: "弱い" }, { card: "X007", label: "強い" }] }
    scenario({
        name: "nodeppo-burst",
        start: { me: { hand: ["BS16-001"], burst: "P069" }, opp: oppSide },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: [...born, "相手.弱い.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
    scenario({
        name: "nodeppo-no-burst",
        start: { me: { hand: ["BS16-001"] }, opp: oppSide },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: born,
    })
    scenario({
        name: "nodeppo-burst-only-strong",
        start: { me: { hand: ["BS16-001"], burst: "P069" }, opp: { spirits: [{ card: "X007", label: "強い" }] } },
        steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
        expect: born,
    })
}

// ===== BS16-031 ジル・ド・レ =====
console.log("=== BS16-031 Lv2 ブロック時：BPを比べ相手のスピリットだけを破壊したとき回復 ===")
need("BS16-031", "ジル・ド・レ", "spirit")
{
    const block = (t: ScenarioCtx) => {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("攻撃役") })
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("ジル・ド・レ") })
        t.closeFlash()
    }
    const killed = ["相手.攻撃役.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"]
    scenario({
        name: "gilles-lv2-untap",
        start: { turn: "opp", me: { spirits: [{ card: "BS16-031", cores: 2 }] }, opp: { spirits: [{ card: VANILLA, label: "攻撃役" }] } },
        steps: block,
        expect: killed,
    })
    scenario({
        name: "gilles-lv1-stays-rested",
        start: { turn: "opp", me: { spirits: [{ card: "BS16-031", cores: 1 }] }, opp: { spirits: [{ card: VANILLA, label: "攻撃役" }] } },
        steps: block,
        expect: [...killed, "自分.ジル・ド・レ.疲労: false → true"],
    })
    scenario({
        name: "gilles-lv2-loses",
        start: { turn: "opp", me: { spirits: [{ card: "BS16-031", cores: 2 }] }, opp: { spirits: [{ card: "X007", label: "攻撃役" }] } },
        steps: block,
        expect: ["相手.攻撃役.疲労: false → true", "自分.ジル・ド・レ.場所: フィールド → なし", "自分.トラッシュ: なし → ジル・ド・レ", "自分.リザーブ: 10 → 12"],
    })
}

// ===== P069 ロード・ブレイバン =====
console.log("=== P069 合体アタック時：アタックで相手のライフを減らしたとき、ライフのコア1個を相手のリザーブへ ===")
need("P069", "ロード・ブレイバン", "brave")
{
    const HOST = "ダークレイス"
    const merged = ["自分.ロード・ブレイバン.場所: フィールド → 合体", "自分.ロード・ブレイバン.BP: 0 → なし", "自分.ロード・ブレイバン.Lv: 0 → 1", `自分.${HOST}.BP: 2000 → 5000`, `自分.${HOST}.疲労: false → true`]
    const mine = { spirits: [{ card: "BS03-018", label: HOST }, { card: "P069", cores: 0 }] }
    scenario({
        name: "braban-life-core",
        start: { me: mine },
        steps: (t) => {
            combine(t, "ロード・ブレイバン", HOST)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(HOST) })
            t.closeFlash()
            t.act("opp", { type: "takeLife" })
        },
        expect: [...merged, "相手.ライフ: 5 → 3", "相手.リザーブ: 10 → 12"],
    })
    scenario({
        name: "braban-blocked",
        start: { me: mine, opp: { spirits: [{ card: VANILLA, label: "守り" }] } },
        steps: (t) => {
            combine(t, "ロード・ブレイバン", HOST)
            t.act("me", { type: "nextPhase" })
            t.act("me", { type: "attack", instanceId: t.id(HOST) })
            t.closeFlash()
            t.act("opp", { type: "block", instanceId: t.id("守り") })
            t.closeFlash()
        },
        expect: [...merged, "相手.守り.場所: フィールド → なし", "相手.トラッシュ: なし → ロクケラトプス", "相手.リザーブ: 10 → 11"],
    })
}
