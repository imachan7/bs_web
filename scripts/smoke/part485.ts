// smoke パート485（スピリット状態のブレイヴにはブレイヴを合体できない。2026-10-03 ユーザー指摘）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { braveCombineCandidates } from "../../shared/summon"

const KAKUREIN = "BS10-069" // 千刀鳥カクレイン（ブレイヴ・コスト5）
const FENRIR = "BS10-071" // フェンリルキャノンType-B（ブレイヴ・コスト4・合体条件コスト4以上）
const HOST = "BS01-089" // デュアルキャノン・ベル（スピリット・コスト4・効果なし）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KAKUREIN).name === "千刀鳥カクレイン" && getCard(KAKUREIN).type === "brave" && getCard(KAKUREIN).cost === 5, "KAKUREINはコスト5のブレイヴ")
    assert(getCard(FENRIR).name === "フェンリルキャノンType-B" && getCard(FENRIR).type === "brave", "FENRIRはブレイヴ")
    assert(getCard(HOST).name === "デュアルキャノン・ベル" && getCard(HOST).type === "spirit" && getCard(HOST).cost === 4, "HOSTはコスト4のスピリット")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 合体先の候補にスピリット状態のブレイヴは入らない ===")
{
    const s = game("t485-cand")
    const kaku = put(s, "p1", KAKUREIN)
    const host = put(s, "p1", HOST)
    const cands = braveCombineCandidates(s, "p1", FENRIR)
    assert(cands.includes(host.instanceId), "スピリットは合体先の候補に入る")
    assert(!cands.includes(kaku.instanceId), "スピリット状態のブレイヴは合体先の候補に入らない")
}

console.log("=== 2. メインステップの任意合体：ブレイヴ同士は拒否、スピリットへは通る ===")
{
    const s = game("t485-combine")
    const kaku = put(s, "p1", KAKUREIN)
    const fen = put(s, "p1", FENRIR)
    const host = put(s, "p1", HOST)
    assert(s.phase === "main", "前提：メインステップ")
    const err = handleAction(s, "p1", { type: "combineBrave", braveInstanceId: fen.instanceId, hostInstanceId: kaku.instanceId })
    assert(err !== null, `スピリット状態のブレイヴへの合体は拒否される（${err}）`)
    assert((kaku.braveRefs ?? []).length === 0, "カクレインには何も合体していない")
    const ok = handleAction(s, "p1", { type: "combineBrave", braveInstanceId: fen.instanceId, hostInstanceId: host.instanceId })
    assert(ok === null, `スピリットへの合体は通る（${ok}）`)
}

console.log("=== 3. ダイレクトブレイヴ：スピリット状態のブレイヴを合体先に指定できない ===")
{
    const s = game("t485-direct")
    const kaku = put(s, "p1", KAKUREIN)
    s.players.p1.hand = [FENRIR]
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: kaku.instanceId })
    assert(err !== null, `拒否される（${err}）`)
    assert(s.players.p1.hand.length === 1 && (kaku.braveRefs ?? []).length === 0, "手札も盤面も変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part485）")
