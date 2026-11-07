// smoke パート835（BS23 B1：043 アマルティアの【聖命】付与、044 スフィエルのBP+5000、082 ダンシングソード、075 デッドソード。公式Q&A Q25238）
// 効果文だけから書いた期待値役のテスト。実装に合わせて期待値を変えないこと
import { assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart, act } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { bravesOf, spiritHasKeyword } from "../../shared/rules"
import { scenario } from "./scenario"
import { appear, cardIdOf, drive, handRow, left, trashRow } from "./b1helpers"

const AMARTIA = "BS23-043" // 月影の剣聖アマルティア（黄・コスト5・剣使。【抜刀】は持たない）
const SPHIEL = "BS23-044" // 氷火の剣聖スフィエル（黄・コスト6・剣使・Lv1 BP4000）
const DANCING = "BS23-082" // ダンシングソード（黄マジック・コスト4・フラッシュ）
const DEADSWORD = "BS23-075" // デッドソード（紫マジック・コスト3・フラッシュ）
const NICHI = "BS23-060" // 翡翠の小太刀 日輪丸（剣刃ブレイヴ・コスト4・合体条件コスト4以上・BP3000）
const SUN = "BS23-055" // 太陽剣カーディナル・サン（剣刃ブレイヴ・合体条件剣使・BP3000）
const HALO = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃ブレイヴ・コスト4・合体条件コスト4以上・BP2000）
const ZAGNA = "BS23-057" // ザグナ・オリックス（無魔ブレイヴ・コスト4・剣刃ではない）
const MINO = "BS23-033" // 機甲剣聖ミノタウロス（白・コスト5・剣使・Lv1 BP3000）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・効果なし）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const AIBURN = "BS01-005" // アイバーン（赤・コスト2・効果なし）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・効果なし）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・効果なし）
const WINGAL = "BS02-046" // ウィンガル（白・コスト6・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const eq = (id: string, name: string, type: string) => assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}`)
    eq(AMARTIA, "月影の剣聖アマルティア", "spirit")
    eq(SPHIEL, "氷火の剣聖スフィエル", "spirit")
    eq(DANCING, "ダンシングソード", "magic")
    eq(DEADSWORD, "デッドソード", "magic")
    eq(NICHI, "翡翠の小太刀 日輪丸", "brave")
    eq(SUN, "太陽剣カーディナル・サン", "brave")
    eq(HALO, "光輪剣エンジェルハイロゥ", "brave")
    eq(ZAGNA, "ザグナ・オリックス", "brave")
    eq(MINO, "機甲剣聖ミノタウロス", "spirit")
    for (const [id, n, c] of [[BELL, "デュアルキャノン・ベル", 4], [ROKU, "ロクケラトプス", 1], [AIBURN, "アイバーン", 2], [SHOCK, "ショックイーター", 2], [METAL, "メタルバーン", 3], [WINGAL, "ウィンガル", 6]] as const) {
        assert(getCard(id).name === n && getCard(id).cost === c && getCard(id).effects.length === 0, `${id}はコスト${c}で効果なしの${n}`)
    }
    assert(getCard(NICHI).family.includes("剣刃") && getCard(HALO).family.includes("剣刃") && !getCard(ZAGNA).family.includes("剣刃"), "日輪丸・ハイロゥは剣刃、ザグナは剣刃でない")
    assert(getCard(SPHIEL).family.includes("剣使") && getCard(AMARTIA).family.includes("剣使"), "スフィエル・アマルティアは剣使")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 手札からブレイヴを直接合体で出す
function combine(s: GameState, pid: PlayerId, braveId: string, host: { instanceId: string }) {
    s.players[pid].hand = [braveId]
    assert(act(s, pid, { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, `${getCard(braveId).name}を直接合体で出せる`)
    refreshLevelAsOverrides(s)
}

console.log("=== G1. 043：自身と、剣刃のスピリット状態のブレイヴだけに【聖命】が与えられる（合体中のブレイヴ・剣刃でないブレイヴ・相手のブレイヴには与えない） ===")
{
    const s = game("amartia-seimei")
    const self = put(s, "p1", AMARTIA)
    const kenjin = put(s, "p1", NICHI)
    const notKenjin = put(s, "p1", ZAGNA)
    const hostOther = put(s, "p1", MINO)
    combine(s, "p1", SUN, hostOther)
    const combined = bravesOf(s.players.p1, hostOther)[0]!
    const oppBrave = put(s, "p2", NICHI)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", self, "seimei"), "アマルティア自身は【聖命】を持つ")
    assert(spiritHasKeyword(s, "p1", kenjin, "seimei"), "剣刃のスピリット状態のブレイヴは【聖命】を持つ")
    assert(!spiritHasKeyword(s, "p1", notKenjin, "seimei"), "剣刃でないスピリット状態のブレイヴには与えない")
    assert(!spiritHasKeyword(s, "p1", combined, "seimei"), "合体中の剣刃ブレイヴには与えない")
    assert(!spiritHasKeyword(s, "p1", hostOther, "seimei"), "合体中のブレイヴ経由でホストが【聖命】を持つことはない")
    assert(!spiritHasKeyword(s, "p2", oppBrave, "seimei"), "相手の剣刃ブレイヴには与えない")
}

console.log("=== G2. 043：場にいなければ誰も【聖命】を持たない ===")
{
    const s = game("amartia-absent")
    const kenjin = put(s, "p1", NICHI)
    assert(!spiritHasKeyword(s, "p1", kenjin, "seimei"), "アマルティアがいなければ剣刃ブレイヴは【聖命】を持たない")
}

console.log("=== H1. 044 Lv1：お互いのアタックステップの間、自分のスピリット状態のブレイヴすべてがBP+5000（合体中・相手・スフィエル自身は対象外） ===")
for (const turnOwner of ["p1", "p2"] as const) {
    const s = game(`sphiel-bp-${turnOwner}`)
    const self = put(s, "p1", SPHIEL)
    const braveA = put(s, "p1", NICHI)
    const braveB = put(s, "p1", ZAGNA)
    const hostOther = put(s, "p1", MINO)
    combine(s, "p1", SUN, hostOther)
    const oppBrave = put(s, "p2", NICHI)
    const all = [self, braveA, braveB, hostOther, oppBrave]
    const owner = (i: typeof self) => (i === oppBrave ? "p2" : "p1")
    s.turnPlayer = turnOwner
    s.phase = "main"
    const before = all.map((i) => effectiveBp(s, owner(i), i))
    s.phase = "attack"
    const after = all.map((i) => effectiveBp(s, owner(i), i))
    const d = after.map((a, k) => a - before[k]!)
    assert(d[1] === 5000 && d[2] === 5000, `${turnOwner}のターン：自分のスピリット状態のブレイヴ2体がBP+5000`)
    assert(d[0] === 0, `${turnOwner}のターン：スフィエル自身は対象外`)
    assert(d[3] === 0, `${turnOwner}のターン：合体中のブレイヴ（のホスト）は対象外`)
    assert(d[4] === 0, `${turnOwner}のターン：相手のブレイヴは対象外`)
}

console.log("=== I1. 082 モードA：剣刃のスピリット状態のブレイヴすべてを回復（剣刃でないブレイヴは回復しない） ===")
scenario({
    name: "dancing-recover-all-spirit-state",
    start: {
        interactive: true,
        phase: "main",
        me: {
            hand: [DANCING],
            spirits: [
                { card: NICHI, label: "日輪丸", rested: true },
                { card: HALO, label: "ハイロゥ", rested: true },
                { card: ZAGNA, label: "ザグナ", rested: true },
            ],
        },
        opp: { spirits: [{ card: SUN, label: "サン", rested: true }] },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        drive(t, { opt: /スピリット状態|すべて/ })
    },
    expect: [
        "自分.リザーブ: 10 → 7",
        "自分.トラッシュのコア: 0 → 3",
        "自分.日輪丸.疲労: true → false",
        "自分.ハイロゥ.疲労: true → false",
        "相手.サン.疲労: true → false",
        handRow("自分", [DANCING], []),
        trashRow("自分", [], [DANCING]),
    ],
})

console.log("=== I2. 082 モードB：剣刃のブレイヴと合体している自分の合体スピリット1体を回復 ===")
scenario({
    name: "dancing-recover-combined",
    start: {
        interactive: true,
        me: {
            hand: [NICHI, DANCING],
            spirits: [{ card: MINO, label: "ミノ", rested: true }, { card: BELL, label: "ベル", rested: true }],
        },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ミノ") })
        drive(t, { decline: true })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        drive(t, { opt: /合体/, picks: [MINO] })
    },
    expect: [
        "自分.リザーブ: 10 → 3",
        "自分.トラッシュのコア: 0 → 7",
        "自分.ミノ.疲労: true → false",
        "自分.ミノ.BP: 3000 → 6000",
        handRow("自分", [NICHI, DANCING], []),
        trashRow("自分", [], [DANCING]),
        ...appear("自分", NICHI, { where: "合体", cores: 0 }),
    ],
})

// 075：疲労状態でコスト4以下の相手のスピリットはアイバーン・ショックイーター・メタルバーン。ウィンガル（コスト6）と回復状態のロクケラトプスは対象外
const oppSpirits = [
    { card: AIBURN, rested: true },
    { card: SHOCK, rested: true },
    { card: METAL, rested: true },
    { card: WINGAL, rested: true },
    { card: ROKU },
]
const checkOppCandidates = (t: Parameters<NonNullable<import("./b1helpers").Want["onPrompt"]>>[0]) => {
    const pc = t.state.pendingChoice!
    if (pc.pid !== t.opp || pc.kind !== "target") return
    const ids = pc.candidates.map((id) => cardIdOf(t, id))
    assert(!ids.includes(WINGAL) && !ids.includes(ROKU), "相手が選ぶ候補にコスト超過・回復状態のスピリットはいない")
    // エンジンは複数体の選択を1体ずつ聞くので、2回目は1体目を除いた候補になる（同時に2体を選ぶ器は無い。BS23_PLAN §5）
    assert(ids.length > 0 && ids.every((id) => id !== undefined && [AIBURN, SHOCK, METAL].includes(id)), "相手が選ぶ候補は疲労状態でコスト4以下のものだけ")
}

console.log("=== J1. 075：スピリット状態のブレイヴ1体を破壊し、相手が疲労状態のコスト4以下のスピリット2体を選んで破壊。剣使がいなければマジックはトラッシュへ（Q25238） ===")
scenario({
    name: "deadsword-spirit-state-no-kenshi",
    start: {
        interactive: true,
        phase: "main",
        me: { hand: [DEADSWORD], spirits: [{ card: HALO, label: "ハイロゥ" }] },
        opp: { spirits: oppSpirits },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        drive(t, { picks: [HALO, AIBURN, SHOCK], onPrompt: checkOppCandidates })
    },
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        left("自分", "ハイロゥ"),
        handRow("自分", [DEADSWORD], []),
        trashRow("自分", [], [DEADSWORD, HALO]),
        left("相手", "アイバーン"),
        left("相手", "ショックイーター"),
        "相手.リザーブ: 10 → 12",
        trashRow("相手", [], [AIBURN, SHOCK]),
    ],
})

console.log("=== J2. 075：系統：剣使の自分のスピリットがいるとき、このマジックカードは手札に戻る ===")
scenario({
    name: "deadsword-returns-with-kenshi",
    start: {
        interactive: true,
        phase: "main",
        me: { hand: [DEADSWORD], spirits: [{ card: HALO, label: "ハイロゥ" }, { card: MINO, label: "ミノ" }] },
        opp: { spirits: oppSpirits },
    },
    steps(t) {
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        drive(t, { picks: [HALO, AIBURN, SHOCK], onPrompt: checkOppCandidates })
    },
    expect: [
        "自分.リザーブ: 10 → 8",
        "自分.トラッシュのコア: 0 → 3",
        left("自分", "ハイロゥ"),
        trashRow("自分", [], [HALO]),
        left("相手", "アイバーン"),
        left("相手", "ショックイーター"),
        "相手.リザーブ: 10 → 12",
        trashRow("相手", [], [AIBURN, SHOCK]),
    ],
})

console.log("=== J3. 075：合体スピリットのブレイヴ1つを破壊できる（コストはそのブレイヴのもの）。破壊されたブレイヴはトラッシュへ ===")
scenario({
    name: "deadsword-combined-brave",
    start: {
        interactive: true,
        me: { hand: [NICHI, DEADSWORD], spirits: [{ card: MINO, label: "ミノ" }] },
        opp: { spirits: oppSpirits },
    },
    steps(t) {
        t.act("me", { type: "summon", handIndex: 0, braveTargetInstanceId: t.id("ミノ") })
        drive(t, { decline: true })
        t.act("me", { type: "castMagic", handIndex: 0, timing: "flash" })
        drive(t, { picks: [NICHI, AIBURN, SHOCK], onPrompt: checkOppCandidates })
    },
    // ミノ（剣使）がいるのでマジックは手札に戻る。ブレイヴの召喚（コスト4）とマジック（コスト3）を払う
    expect: [
        "自分.リザーブ: 10 → 4",
        "自分.トラッシュのコア: 0 → 6",
        handRow("自分", [NICHI, DEADSWORD], [DEADSWORD]),
        trashRow("自分", [], [NICHI]),
        left("相手", "アイバーン"),
        left("相手", "ショックイーター"),
        "相手.リザーブ: 10 → 12",
        trashRow("相手", [], [AIBURN, SHOCK]),
    ],
})

console.log("=== J4. 075：自分のブレイヴがいなければ、剣使がいても使えない（2026-11-08 ユーザー確認） ===")
scenario({
    name: "deadsword-no-brave",
    start: {
        interactive: true,
        phase: "main",
        me: { hand: [DEADSWORD], spirits: [{ card: MINO, label: "ミノ" }] },
        opp: { spirits: oppSpirits },
    },
    steps(t) {
        t.actRejected("me", { type: "castMagic", handIndex: 0, timing: "flash" })
    },
    expect: [],
})

console.log("すべてのチェックに合格しました 🎉（part835）")
