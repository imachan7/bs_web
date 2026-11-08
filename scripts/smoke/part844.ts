// smoke パート844（BS23-X05 大天使アヴリエル：ブレイヴの無償召喚・合体アタック時の BP-。Q4609〜Q4611）
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const AVRIEL = "BS23-X05" // 大天使アヴリエル（黄・Lv1 コア1 BP4000／Lv2 コア2 BP6000・シンボル黄1）
const X07 = "BS23-X07" // 真・裁きの神剣トゥルース・エデン（ブレイヴ・コスト6・軽減 6色各1・1コスト以上支払わなければ召喚できない）
const BANBOOL = "BS19-071" // バンブール（緑ブレイヴ・コスト3・召喚時：相手1体を疲労／合体条件 コスト3以上・合体アタック時：相手1体を疲労）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄マジック・フラッシュ：このターン相手1体をBP-3000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・バニラ Lv1 BP4000）
const KAMO = "BS10-024" // カモメーヴェ（緑・バニラ Lv1 BP4000／Lv2 コア2 BP5000）
const METAL = "BS01-008" // メタルバーン（赤・バニラ Lv1 BP3000）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Array<[string, string]> = [
        [AVRIEL, "大天使アヴリエル"], [X07, "真・裁きの神剣トゥルース・エデン"], [BANBOOL, "バンブール"], [PRESSURE, "エンジェリックプレッシャー"],
        [HERA, "ヘラクレス・ジオ"], [KAMO, "カモメーヴェ"], [METAL, "メタルバーン"],
    ]
    for (const [id, name] of names) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(BANBOOL).type === "brave" && getCard(X07).type === "brave", "バンブールと X07 はブレイヴ")
    assert(getCard(AVRIEL).symbol?.length === 1 && getCard(AVRIEL).symbol?.[0] === "yellow", "アヴリエルのシンボルは黄1個")
}

function settle(t: ScenarioCtx, optionRe: RegExp = /支払わ|トラッシュ/): void {
    for (let i = 0; i < 12 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "option") {
            const opt = (pc.options ?? []).find((o) => optionRe.test(o)) ?? (pc.options ?? [])[0]
            t.act(side, { type: "resolveChoice", option: opt! })
        } else if (pc.kind === "target") {
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        } else {
            t.act(side, { type: "resolveChoice", cardIndex: (pc.cardIndices ?? [])[0]! })
        }
    }
    assert(t.state.pendingChoice === null, "選択待ちが残らない")
}

const braveLines = (label: string, bp: number) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.コア: なし → 1`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.Lv: なし → 1`,
    `自分.${label}.BP: なし → ${bp}`,
]

console.log("=== 1. X05：手札のブレイヴを、リザーブのコア1個をトラッシュに置いて無償で召喚（召喚時効果は発揮されない） ===")
scenario({
    name: "avriel-free-brave",
    start: {
        interactive: true,
        me: { hand: [BANBOOL], spirits: [{ card: AVRIEL, label: "アヴリエル" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.手札: バンブール → なし",
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 1",
        ...braveLines("バンブール", 2000),
    ],
})

console.log("=== 2. X05：何回でも（Q4609）。2枚目も同じ ===")
scenario({
    name: "avriel-free-brave-twice",
    start: {
        interactive: true,
        me: { hand: [BANBOOL, BANBOOL], spirits: [{ card: AVRIEL, label: "アヴリエル" }] },
        opp: { spirits: [{ card: HERA, label: "ジオ" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
        t.act("me", { type: "summon", handIndex: 0 })
        settle(t)
    },
    expect: [
        "自分.手札: バンブール、バンブール → なし",
        "自分.リザーブ: 10 → 6",
        "自分.トラッシュのコア: 0 → 2",
        ...braveLines("バンブール", 2000),
        ...braveLines("バンブール#2", 2000),
    ],
})

console.log("=== 3. X05：X07 は出せない。払うのは召喚コストではないので通常の召喚（コスト6−黄シンボル1＋Lv1のコア1。Q4611） ===")
scenario({
    name: "avriel-x07-normal-summon",
    start: {
        interactive: true,
        me: { hand: [X07], spirits: [{ card: AVRIEL, label: "アヴリエル" }] },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0 })
    },
    expect: [
        "自分.手札: 真・裁きの神剣トゥルース・エデン → なし",
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 5",
        ...braveLines("真・裁きの神剣トゥルース・エデン", 10000),
    ],
})

console.log("=== 4. 合体アタック時：BP-5000 か BP-3000×3 を選び、そのバトル中に新しく BP0 になったスピリットすべてを破壊 ===")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 選択待ちを答える。BP- の対象はターゲット候補に preferred があればそれ、モードは modeRe に合うもの
function drain(s: GameState, modeRe: RegExp, preferred: string[]): void {
    for (let i = 0; i < 12 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        let err: string | null
        if (pc.kind === "option") {
            err = act(s, pc.pid, { type: "resolveChoice", option: ((pc.options ?? []).find((o) => modeRe.test(o)) ?? (pc.options ?? [])[0])! })
        } else if (pc.kind === "target") {
            err = act(s, pc.pid, { type: "resolveChoice", instanceId: (pc.candidates.find((c) => preferred.includes(c)) ?? pc.candidates[0])! })
        } else {
            err = act(s, pc.pid, { type: "resolveChoice", cardIndex: (pc.cardIndices ?? [])[0]! })
        }
        assert(err === null, `選択に答えられる（${err ?? ""}）`)
        if (err) return
    }
}

const onField = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some((x) => x.instanceId === id)

function combinedAttack(s: GameState, host: ReturnType<typeof createInstance>, brave: ReturnType<typeof createInstance>): void {
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "バンブールがアヴリエルに合体できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ進める")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "合体したアヴリエルでアタックできる")
}

{
    const s = game("x05-three")
    const host = put(s, "p1", AVRIEL, 2)
    const brave = put(s, "p1", BANBOOL, 1)
    const opp = [put(s, "p2", METAL, 1, true), put(s, "p2", METAL, 1, true), put(s, "p2", METAL, 1, true)]
    combinedAttack(s, host, brave)
    drain(s, /3体|3/, [])
    assert(opp.every((x) => !onField(s, "p2", x.instanceId)), "3体を選ぶと BP3000−3000＝0 の3体がすべて破壊される")
    assert(s.players.p2.trashCards.filter((c) => c === METAL).length === 3, "破壊された3体は相手のトラッシュにある")
}

{
    const s = game("x05-one")
    const host = put(s, "p1", AVRIEL, 2)
    const brave = put(s, "p1", BANBOOL, 1)
    const old = put(s, "p2", METAL, 1, true) // 先に BP0 にしておく。そのバトル中に新しくなったものではない
    const fresh = put(s, "p2", KAMO, 2, true) // Lv2 で BP5000
    s.players.p1.hand = [PRESSURE]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: old.instanceId }) === null, "メインステップのフラッシュでプレッシャーを使える")
    drain(s, /./, [old.instanceId])
    assert(effectiveBp(s, "p2", old) === 0 && onField(s, "p2", old.instanceId), "BP0 になっただけでは破壊されない（Q4547）")
    combinedAttack(s, host, brave)
    drain(s, /1体|5000/, [fresh.instanceId])
    assert(!onField(s, "p2", fresh.instanceId), "1体を選ぶと BP5000−5000＝0 のスピリットが破壊される")
    assert(onField(s, "p2", old.instanceId), "先に BP0 だったスピリットは破壊されない（Q4610）")
}

console.log("=== 5. 合体アタック時：Lv1 では発揮しない・合体していなければ発揮しない ===")
{
    const s = game("x05-lv1")
    const host = put(s, "p1", AVRIEL, 1)
    const brave = put(s, "p1", BANBOOL, 0)  // 合体でブレイヴのコアがホストへ移るので、Lv1 のままにするため0個
    const target = put(s, "p2", METAL, 1, true)
    combinedAttack(s, host, brave)
    drain(s, /3体|3/, [])
    assert(onField(s, "p2", target.instanceId) && effectiveBp(s, "p2", target) === 3000, "Lv1 のアヴリエルの合体アタックでは BP-も破壊も起きない")
}

{
    const s = game("x05-alone")
    const host = put(s, "p1", AVRIEL, 2)
    const target = put(s, "p2", METAL, 1, true)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ進める")
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "単独でアタックできる")
    drain(s, /3体|3/, [])
    assert(onField(s, "p2", target.instanceId) && effectiveBp(s, "p2", target) === 3000, "合体していなければ BP-も破壊も起きない")
}

console.log("すべてのチェックに合格しました 🎉（part844）")
