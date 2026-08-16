// smoke パート202（SD01 の残り6種と、そのために足した器）
//
// 6種はどれも新しい器か解釈が要るものとして最後まで残っていた。
// 解釈は 2026-08-16 にユーザーへ確認済みで、要点は次の2つ:
//   ① 効果は Lv表記のあとの『』で大きく分けられ、制限文はその『』ブロックの中にしか及ばない
//      （ベリトの「0個にはできない」は召喚時だけ。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）
//   ② 「『破壊時』効果は発揮されない」が封じるのは『』でカテゴライズされた効果だけで、
//      ネクサスの常在効果による「フィールドに残る」は封じられない（朝焼け岬Lv2）
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, fireStepTriggers, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { effectiveBp } from "../../shared/rules"
import { fireTrigger } from "../../server/src/logic/triggers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    colors?: string[]
    effects?: Record<string, unknown>[]
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`カードが見つかりません: ${id}`)
    return c
}
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// カードデータの ID と名前・色が一致していることを機械検証する
// （CLAUDE.md「cardId のハードコード注意」：過去に ID が全面的にズレた事故がある）
function check(id: string, name: string, color: string, type: string): CardRow {
    const c = byId(id)
    assert(c.name === name, `${id} は「${name}」`)
    assert((c.colors ?? []).includes(color), `${id} は${color}`)
    assert(c.type === type, `${id} は${type}`)
    return c
}

console.log("=== パート202：SD01 の残り6種 ===")

const BERITH = check("SD01-013", "冥剣士ベリト", "purple", "spirit")
const ATRIES = check("SD01-024", "人馬機兵アトリーズ", "white", "spirit")
const CATACOMB = check("SD01-029", "蠢く地下墓地", "purple", "nexus")
const CAPE = check("SD01-031", "朝焼け岬", "green", "nexus")
const AEGIS = check("SD01-032", "機械神の加護", "white", "nexus")
const VICTORY = check("SD01-033", "ヴィクトリーファイア", "red", "magic")

// 汎用のバニラ枠（効果を持たないスピリット）。相手役として置くだけの箇所で使う
const VANILLA = CARDS.find((c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0)!

console.log("--- SD01-013 冥剣士ベリト：召喚時はコア3個を配分して取り、0個にはできない ---")
{
    const s = base("berith-summon")
    // 相手のスピリット2体（コア3個ずつ）。合計3個を取っても、どちらも0個にはならない
    const a = put(s, "p2", VANILLA, 3)
    const b = put(s, "p2", VANILLA, 3)
    const self = put(s, "p1", BERITH, coresFor(BERITH, 1))
    const before = s.players.p2.reserve
    resolveAction(s, "p1", self, { type: "coreRemoveDistributed", count: 3, leaveAtLeast: 1, chooserIsTarget: true })
    assert(a.cores >= 1 && b.cores >= 1, `どちらも0個にはならない（${a.cores}/${b.cores}）`)
    assert(a.cores + b.cores === 3, `合計3個が取り除かれる（残り${a.cores + b.cores}個）`)
    assert(s.players.p2.reserve === before + 3, "取り除いたコアは相手のリザーブへ置かれる")
}
{
    // 取れる余地が足りないとき（各1個ずつ＝1個も取れない）は、取れる分だけで止まる
    const s = base("berith-floor")
    const a = put(s, "p2", VANILLA, 1)
    const self = put(s, "p1", BERITH, coresFor(BERITH, 1))
    const before = s.players.p2.reserve
    resolveAction(s, "p1", self, { type: "coreRemoveDistributed", count: 3, leaveAtLeast: 1, chooserIsTarget: true })
    assert(a.cores === 1, "コア1個の相手からは取れない（0個にはできない）")
    assert(s.players.p2.reserve === before, "リザーブも増えない")
}
{
    // 『』ブロックの範囲：アタック時の1個には「0個にはできない」が効かない（維持コア割れで消滅しうる）
    const s = base("berith-attack")
    const a = put(s, "p2", VANILLA, 1)
    const self = put(s, "p1", BERITH, coresFor(BERITH, 2))
    resolveAction(s, "p1", self, { type: "coreRemove", count: 1 })
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === a.instanceId),
        "アタック時の効果は0個にできる＝維持コア割れで消滅する",
    )
}

{
    // 対話モード（実対戦と同じ経路）：召喚から選択を1個ずつ解決し、3個ぶん配分できることを見る。
    // 選ぶのは**コアを取られる側**（chooserIsTarget）なので、選択待ちの pid は p2 になる
    const s = base("berith-interactive")
    s.interactiveTargets = true
    const a = put(s, "p2", VANILLA, 3)
    const b = put(s, "p2", VANILLA, 3)
    s.players.p1.hand[0] = BERITH.cardId
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ベリトを召喚")
    let guard = 0
    while (s.pendingChoice && guard < 10) {
        guard += 1
        assert(s.pendingChoice.pid === "p2", "選択するのはコアを取られる側（相手）")
        assert(s.pendingChoice.actorPid === "p1", "解決は発生源の持ち主の効果として行う")
        const pick = s.pendingChoice.candidates[0]!
        assert(act(s, "p2", { type: "resolveChoice", instanceId: pick }) === null, "コアを取り除く1体を選ぶ")
    }
    // 3個目は候補が1体しか残らない（同じ的から2個取ると leaveAtLeast:1 で候補から外れる）ため、
    // requestChoice が自動解決する＝選択は2回で済む
    assert(guard === 2, `候補が2体以上ある間だけ選ばせる（実際は${guard}回）`)
    assert(a.cores + b.cores === 3, `合計3個が取り除かれる（残り${a.cores + b.cores}個）`)
    assert(a.cores >= 1 && b.cores >= 1, "どちらも0個にはならない")
}

console.log("--- SD01-024 人馬機兵アトリーズ：BP4000以下をブロックしたときだけ回復する ---")
{
    // まず実際のブロック経路を通す（Lv1･Lv2 のBP+3000が乗ることを見る）
    const lowBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 4000,
    )!
    const s = base("atries-block")
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", lowBp, coresFor(lowBp, 1))
    const blocker = put(s, "p1", ATRIES, coresFor(ATRIES, 2))
    const bpBefore = ATRIES.levels?.[1]?.bp ?? 0
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "アトリーズでブロック")
    assert(
        effectiveBp(s, "p1", blocker) === bpBefore + 3000,
        `ブロック時にBP+3000される（${bpBefore}→${effectiveBp(s, "p1", blocker)}）`,
    )
}
{
    // 回復の条件（targetBlockedMaxBp）は誘発を直接叩いて見る。
    // このエンジンではブロックしても疲労しないため、実際のブロック経路では
    // 「回復した／しなかった」の差が出ない（疲労中のスピリットはそもそもブロックできない）
    const lowBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 4000,
    )!
    const highBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) > 4000,
    )!
    const s = base("atries-condition")
    const low = put(s, "p2", lowBp, coresFor(lowBp, 1))
    const high = put(s, "p2", highBp, coresFor(highBp, 1))
    const blocker = put(s, "p1", ATRIES, coresFor(ATRIES, 2))

    blocker.isRested = true
    fireTrigger(s, "p1", blocker, "onBlock", undefined, high.instanceId)
    assert(blocker.isRested, `BP${effectiveBp(s, "p2", high)}をブロックしても回復しない`)

    fireTrigger(s, "p1", blocker, "onBlock", undefined, low.instanceId)
    assert(!blocker.isRested, `BP${effectiveBp(s, "p2", low)}（4000以下）をブロックしたら回復する`)
}

console.log("--- SD01-029 蠢く地下墓地：相手が緑の効果でコアを置いたら、置いた数だけボイドへ ---")
{
    const s = base("catacomb-green")
    s.turnPlayer = "p2" // 『相手のターン』＝ネクサスの持ち主(p1)から見て相手のターン
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 1))
    const victim = put(s, "p2", VANILLA, 3)
    // 相手（p2）の緑のスピリットの効果で、相手のリザーブへコア2個を置く
    const green = CARDS.find((c) => c.type === "spirit" && (c.colors ?? []).includes("green"))!
    const source = put(s, "p2", green, coresFor(green, 1))
    const reserveBefore = s.players.p2.reserve
    const coresBefore = victim.cores
    resolveAction(s, "p2", source, { type: "coreGain", count: 2 }, undefined, ["green"], "spirit")
    assert(s.players.p2.reserve === reserveBefore + 2, "前提：緑の効果でリザーブにコアが2個置かれた")
    assert(coresBefore - victim.cores === 2, `置いたコア1個につき1個がボイドへ（${coresBefore}→${victim.cores}）`)
}
{
    // 緑以外の効果では発火しない
    const s = base("catacomb-nongreen")
    s.turnPlayer = "p2"
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 1))
    const victim = put(s, "p2", VANILLA, 3)
    const source = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p2", source, { type: "coreGain", count: 2 }, undefined, ["red"], "spirit")
    assert(victim.cores === 3, "緑以外の効果では発火しない")
}
{
    // 効果によらないコアの動き（コアステップ）では発火しない
    const s = base("catacomb-corestep")
    s.turnPlayer = "p2"
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 1))
    const victim = put(s, "p2", VANILLA, 3)
    const reserveBefore = s.players.p2.reserve
    runTurnStart(s)
    assert(s.players.p2.reserve > reserveBefore, "前提：コアステップでリザーブが増えた")
    assert(victim.cores === 3, "通常のコアの移動では発火しない（『効果で』の限定）")
}

{
    // Lv2『お互いのアタックステップ』相手の緑のスピリットがアタックしたとき、相手のスピリット1体を疲労させる
    const green = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.colors ?? []).includes("green"),
    )!
    const s = base("catacomb-attack")
    s.turnPlayer = "p2"
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 2))
    const attacker = put(s, "p2", green, coresFor(green, 1))
    const other = put(s, "p2", VANILLA, 3)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "緑のスピリットでアタック")
    assert(other.isRested, "相手の緑がアタックしたら、相手のスピリット1体が疲労する")
}
{
    // 緑でなければ発火しない
    const s = base("catacomb-attack-nongreen")
    s.turnPlayer = "p2"
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 2))
    const attacker = put(s, "p2", VANILLA, 1)
    const other = put(s, "p2", VANILLA, 3)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(!other.isRested, "緑以外のアタックでは疲労させない")
}
{
    // 相手の緑がブロックしたときも同じ（ownSpiritBlocked の targetColorFilter 経由）
    const green = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.colors ?? []).includes("green"),
    )!
    const s = base("catacomb-block")
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 2))
    const attacker = put(s, "p1", VANILLA, 1)
    const blocker = put(s, "p2", green, coresFor(green, 1))
    const other = put(s, "p2", VANILLA, 3)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "緑のスピリットでブロック")
    assert(other.isRested || blocker.isRested, "相手の緑がブロックしたら、相手のスピリット1体が疲労する")
}
{
    // 対照実験：ブロックしたのが緑でなければ、誰も疲労しない
    const s = base("catacomb-block-nongreen")
    putNexus(s, "p1", CATACOMB, coresFor(CATACOMB, 2))
    const attacker = put(s, "p1", VANILLA, 1)
    const blocker = put(s, "p2", VANILLA, 1)
    const other = put(s, "p2", VANILLA, 3)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "緑以外でブロック")
    assert(!other.isRested && !blocker.isRested, "緑以外のブロックでは疲労させない")
}

console.log("--- SD01-031 朝焼け岬 Lv2：相手の紫の『召喚時』『破壊時』は発揮されない ---")
{
    // シャ・ズー（BS01-036）は『破壊時』にスピリット2体までを疲労させる紫のスピリット
    const shazoo = check("BS01-036", "シャ・ズー", "purple", "spirit")
    const bigBp = CARDS.reduce((best, c) =>
        c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) > (best.levels?.[0]?.bp ?? 0)
            ? c
            : best,
    )
    const s = base("cape-block")
    putNexus(s, "p1", CAPE, coresFor(CAPE, 2))
    const victim = put(s, "p2", shazoo, coresFor(shazoo, 1))
    const mine = put(s, "p1", bigBp, coresFor(bigBp, 1))
    destroySpirit(s, "p2", victim.instanceId, "destroy")
    assert(!mine.isRested, "相手の紫の『破壊時』効果は発揮されない")
}
{
    // Lv1 では封じない（レベル条件の確認＝上のテストが本当に封じているかの対照実験）。
    // シャ・ズーの疲労は anySide＝実効BP最大を自動選択するので、確実に選ばれる高BPの的を置く
    const shazoo = byId("BS01-036")
    const bigBp = CARDS.reduce((best, c) =>
        c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) > (best.levels?.[0]?.bp ?? 0)
            ? c
            : best,
    )
    const s = base("cape-lv1")
    putNexus(s, "p1", CAPE, coresFor(CAPE, 1))
    const victim = put(s, "p2", shazoo, coresFor(shazoo, 1))
    const mine = put(s, "p1", bigBp, coresFor(bigBp, 1))
    destroySpirit(s, "p2", victim.instanceId, "destroy")
    assert(mine.isRested, "Lv1 では封じないので『破壊時』が発揮される")
}

{
    // ⚠️ 封じるのは『』でカテゴライズされた効果だけ。ネクサスの常在効果による
    // 「破壊されたときフィールドに残る」（reviveOnDestroy）は封じられない（2026-08-16 ユーザー確認）
    const shazoo = byId("BS01-036")
    const amethyst = check("BS02-079", "紫水晶の森", "purple", "nexus")
    const bigBp = CARDS.reduce((best, c) =>
        c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) > (best.levels?.[0]?.bp ?? 0)
            ? c
            : best,
    )
    const s = base("cape-revive")
    s.turnPlayer = "p2" // 紫水晶の森は『自分のアタックステップ』＝所有者(p2)のターン
    s.phase = "attack"
    putNexus(s, "p1", CAPE, coresFor(CAPE, 2))
    putNexus(s, "p2", amethyst, coresFor(amethyst, 1))
    const victim = put(s, "p2", shazoo, 2)
    const mine = put(s, "p1", bigBp, coresFor(bigBp, 1))
    destroySpirit(s, "p2", victim.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(!mine.isRested, "『破壊時』効果は封じられたまま")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "ネクサスの常在効果による「フィールドに残る」は封じられない",
    )
}

console.log("--- SD01-031 朝焼け岬 Lv1：相手が紫の効果で手札を得たら、その枚数だけ破棄させる ---")
{
    const purple = CARDS.find((c) => c.type === "spirit" && (c.colors ?? []).includes("purple"))!
    const s = base("cape-hand")
    s.turnPlayer = "p2" // 『相手のターン』＝ネクサスの持ち主(p1)から見て相手のターン
    putNexus(s, "p1", CAPE, coresFor(CAPE, 1))
    const source = put(s, "p2", purple, coresFor(purple, 1))
    const handBefore = s.players.p2.hand.length
    resolveAction(s, "p2", source, { type: "draw", count: 2 }, undefined, ["purple"], "spirit")
    assert(
        s.players.p2.hand.length === handBefore,
        `2枚引いて2枚破棄する＝差し引き変わらない（${handBefore}→${s.players.p2.hand.length}）`,
    )
}
{
    // 紫以外の効果では発火しない
    const s = base("cape-hand-nonpurple")
    s.turnPlayer = "p2"
    putNexus(s, "p1", CAPE, coresFor(CAPE, 1))
    const source = put(s, "p2", VANILLA, 1)
    const handBefore = s.players.p2.hand.length
    resolveAction(s, "p2", source, { type: "draw", count: 2 }, undefined, ["red"], "spirit")
    assert(s.players.p2.hand.length === handBefore + 2, "紫以外の効果では破棄させない")
}
{
    // ドローステップの通常ドローでは発火しない（『効果で』の限定）
    const s = base("cape-hand-drawstep")
    s.turnPlayer = "p2"
    putNexus(s, "p1", CAPE, coresFor(CAPE, 1))
    const handBefore = s.players.p2.hand.length
    runTurnStart(s)
    assert(s.players.p2.hand.length > handBefore, "通常のドローでは破棄させない（『効果で』の限定）")
}

console.log("--- SD01-032 機械神の加護：白のネクサスは相手の赤のスピリット/マジックの効果では破壊されない ---")
{
    const whiteNexus = CARDS.find(
        (c) => c.type === "nexus" && (c.colors ?? []).includes("white") && c.cardId !== AEGIS.cardId,
    )!
    const s = base("aegis-red")
    putNexus(s, "p1", AEGIS, coresFor(AEGIS, 1))
    const guarded = putNexus(s, "p1", whiteNexus, 0)
    const attacker = put(s, "p2", VANILLA, 1)
    // 相手（p2）の赤のスピリットの効果でネクサスを破壊しようとする
    resolveAction(s, "p2", attacker, { type: "destroyNexus", count: 1 }, undefined, ["red"], "spirit")
    assert(
        s.players.p1.field.nexuses.some((n) => n.instanceId === guarded.instanceId),
        "相手の赤のスピリットの効果では破壊されない",
    )
    // 青の効果なら通る（発生源の色で絞れていることの確認）
    resolveAction(s, "p2", attacker, { type: "destroyNexus", count: 1 }, undefined, ["blue"], "spirit")
    assert(
        !s.players.p1.field.nexuses.some((n) => n.instanceId === guarded.instanceId && !n.pendingDestruction),
        "赤以外の効果では守られない",
    )
}
{
    // Lv2『相手のスタートステップ』相手のスピリット1体に「必ずアタックする」を課す
    const s = base("aegis-force")
    s.turnPlayer = "p2"
    putNexus(s, "p1", AEGIS, coresFor(AEGIS, 2))
    const target = put(s, "p2", VANILLA, 1)
    s.phase = "start"
    fireStepTriggers(s, "start")
    assert(
        s.turnConstraints.some(
            (c) => c.type === "mustAttackByInstance" && c.pid === "p2" && c.instanceId === target.instanceId,
        ),
        "相手のスタートステップに、相手のスピリット1体へ強制アタックが課される",
    )
}

console.log("--- SD01-033 ヴィクトリーファイア：2体破壊か、1体＋ネクサス1つかを選ぶ ---")
{
    // 非対話（テスト）では先頭のモード＝「スピリット2体」を選ぶ決定的簡略化
    const lowBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 3000,
    )!
    const s = base("victory-two")
    const a = put(s, "p2", lowBp, coresFor(lowBp, 1))
    const b = put(s, "p2", lowBp, coresFor(lowBp, 1))
    resolveAction(s, "p1", null, byId(VICTORY.cardId).effects![0]!["action"] as never, undefined, ["red"], "magic")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === a.instanceId) &&
            !s.players.p2.field.spirits.some((x) => x.instanceId === b.instanceId),
        "BP3000以下の相手2体が破壊される",
    )
}
{
    // 対象が1体しかいなくても選べて、いる分だけ破壊する（「〜することで」ではないのでコストではない）
    const lowBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 3000,
    )!
    const s = base("victory-one")
    const a = put(s, "p2", lowBp, coresFor(lowBp, 1))
    resolveAction(s, "p1", null, byId(VICTORY.cardId).effects![0]!["action"] as never, undefined, ["red"], "magic")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === a.instanceId),
        "1体しかいなくても発揮でき、いる分だけ破壊する",
    )
}
{
    // もう一方のモード（スピリット1体＋ネクサス1つ）を明示的に選んだ場合
    const lowBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 3000,
    )!
    const plainNexus = CARDS.find((c) => c.type === "nexus")!
    const s = base("victory-mode2")
    const a = put(s, "p2", lowBp, coresFor(lowBp, 1))
    const n = putNexus(s, "p2", plainNexus, 0)
    resolveAction(
        s,
        "p1",
        null,
        byId(VICTORY.cardId).effects![0]!["action"] as never,
        undefined,
        ["red"],
        "magic",
        "スピリット1体とネクサス1つ",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === a.instanceId),
        "スピリット1体が破壊される",
    )
    assert(
        !s.players.p2.field.nexuses.some((x) => x.instanceId === n.instanceId && !x.pendingDestruction),
        "ネクサス1つも破壊される",
    )
}
{
    // 対話モード：モードの選択肢が2つ出て、選んだ側だけが解決される
    const lowBp = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 3000,
    )!
    const anyNexus = CARDS.find((c) => c.type === "nexus")!
    const s = base("victory-interactive")
    s.interactiveTargets = true
    const a = put(s, "p2", lowBp, coresFor(lowBp, 1))
    const n = putNexus(s, "p2", anyNexus, 0)
    s.players.p1.hand[0] = VICTORY.cardId
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ヴィクトリーファイアを使用")
    assert(s.pendingChoice?.kind === "option", "モードの選択待ちになる")
    assert(s.pendingChoice?.options?.length === 2, "選択肢は常に2つ出る（対象が足りなくても選べる）")
    assert(
        act(s, "p1", { type: "resolveChoice", option: "スピリット1体とネクサス1つ" }) === null,
        "2つめのモードを選ぶ",
    )
    let guard = 0
    while (s.pendingChoice && guard < 10) {
        guard += 1
        const pick = s.pendingChoice.candidates[0]
        assert(
            act(s, s.pendingChoice.pid, pick !== undefined ? { type: "resolveChoice", instanceId: pick } : { type: "resolveChoice" }) === null,
            "対象を選ぶ",
        )
    }
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === a.instanceId), "スピリット1体が破壊される")
    assert(
        !s.players.p2.field.nexuses.some((x) => x.instanceId === n.instanceId && !x.pendingDestruction),
        "ネクサス1つも破壊される",
    )
}
