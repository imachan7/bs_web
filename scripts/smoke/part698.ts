// smoke パート698（BS01-086 クイーン・ワルキューレ「相手のスピリット/マジックの効果の対象にならない」。公式 Q1679）
// 規則：相手のスピリット・マジックの効果は、1体を選ぶものも「すべて」のものも届かない。
//       ブレイヴ自身の効果・ネクサスの効果は効果文に挙がっていないので届く。持ち主自身の効果も届く。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const WALK = "BS01-086" // クイーン・ワルキューレ（白・Lv1 BP2000）
const VAN = "BS01-002" // ロクケラトプス（赤・Lv1 BP1000・バニラ）。対照
const TEMPEST = "BS01-122" // フレイムテンペスト（赤フラッシュ：BP3000以下のスピリットすべてを破壊）
const AIR = "BS10-035" // 樹氷の女神エイル（スピリット。召喚時：相手のスピリット1体を手札に戻す）
const ALF = "BS10-070" // 鎧馬アルファズル（ブレイヴ。ブレイヴの召喚時：相手のスピリット1体を手札に戻す）
const KAMA = "BS16-062" // 天下眺める絶景門（ネクサス。配置時：手札から配置したとき、BP5000以下の相手のスピリット1体を破壊）
const VANDA = "BS10-010" // 覇竜ヴァンダライザー（スピリット。召喚時：BP3000以下の相手のスピリットすべてを破壊）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, n] of [[WALK, "クイーン・ワルキューレ"], [VAN, "ロクケラトプス"], [TEMPEST, "フレイムテンペスト"], [AIR, "樹氷の女神エイル"],
    [ALF, "鎧馬アルファズル"], [KAMA, "天下眺める絶景門"], [VANDA, "覇竜ヴァンダライザー"]] as const) assert(getCard(id).name === n, `${id}は${n}`)

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 3
        p.burst = null
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function settle(s: GameState, pid: PlayerId): void {
    for (let i = 0; i < 8 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const opts: string[] = pc.options ?? []
        const err = act(s, pc.pid ?? pid, opts.length ? { type: "resolveChoice", option: opts.includes("発動する") ? "発動する" : opts[0] } : { type: "pass" } as any)
        if (err) break
    }
}

const onField = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some(x => x.cardId === id)

console.log("=== A. 相手のマジックの「BP3000以下のスピリットすべてを破壊」はワルキューレに届かない ===")
for (const target of [WALK, VAN]) {
    const s = game(`a-${target}`, "p2", [], [TEMPEST])
    put(s, "p1", target, 1) // どちらも BP3000 以下
    put(s, "p1", AIR, 1) // 並んだ別のスピリット（BP1000）は破壊される
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" } as any)
    assert(err === null, `A: テンペストを使える（${err}）`)
    settle(s, "p2")
    assert(onField(s, "p1", target) === (target === WALK), target === WALK ? "A: ワルキューレは破壊されない" : "A対照: バニラは破壊される")
    assert(!onField(s, "p1", AIR), "A: 並んだ別のスピリットは破壊される")
}

console.log("=== B. 相手のスピリットの召喚時「相手のスピリット1体を手札に戻す」はワルキューレを選べない ===")
for (const target of [WALK, VAN]) {
    const s = game(`b-${target}`, "p2", [], [AIR])
    put(s, "p1", target, 1)
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "B: エイルを召喚")
    answerPayConfirm(s, "p2")
    settle(s, "p2")
    if (target === WALK) {
        assert(onField(s, "p1", WALK) && !s.players.p1.hand.includes(WALK), "B: ワルキューレは場に残り、手札に戻らない")
    } else {
        assert(!onField(s, "p1", VAN) && s.players.p1.hand.includes(VAN), "B対照: バニラは手札に戻る")
    }
}

console.log("=== C. 相手のブレイヴ自身の召喚時効果は、ワルキューレに届く ===")
for (const target of [WALK, VAN]) {
    const s = game(`c-${target}`, "p2", [], [ALF])
    put(s, "p1", target, 1)
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "C: アルファズルを召喚")
    answerPayConfirm(s, "p2")
    settle(s, "p2")
    assert(!onField(s, "p1", target) && s.players.p1.hand.includes(target), `C: ${target === WALK ? "ワルキューレ" : "バニラ"}は手札に戻る`)
}

console.log("=== D. 相手のネクサスの配置時効果（BP5000以下の相手のスピリット1体を破壊）は、ワルキューレにも届く ===")
for (const target of [WALK, VAN]) {
    const s = game(`d-${target}`, "p2", [], [KAMA])
    put(s, "p1", target, 1)
    const err = act(s, "p2", { type: "setNexus", handIndex: 0 })
    assert(err === null, `D: 絶景門を配置（${err}）`)
    answerPayConfirm(s, "p2")
    settle(s, "p2")
    assert(!onField(s, "p1", target), `D: ${target === WALK ? "ワルキューレ" : "バニラ"}は破壊される`)
}

console.log("=== E. 相手のスピリットの召喚時「BP3000以下の相手のスピリットすべてを破壊」はワルキューレに届かない ===")
for (const target of [WALK, VAN]) {
    const s = game(`e-${target}`, "p2", [], [VANDA])
    put(s, "p1", target, 1)
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "E: ヴァンダライザーを召喚")
    answerPayConfirm(s, "p2")
    settle(s, "p2")
    assert(onField(s, "p1", target) === (target === WALK), target === WALK ? "E: ワルキューレは破壊されない" : "E対照: バニラは破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part698）")
