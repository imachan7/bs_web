// smoke パート417（期間つき効果を置くだけの1枚専用 type 3種を timedEffect で書いた。実カードデータで解決する）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction, PlayerId } from "../../server/src/type"

const IGO = "BS13-047" // 「このスピリットがアタックしたとき、相手はマジック1枚を破棄しなければブロックできない」
const KAGUYA = "BS15-X05" // 光の覇王ルナアーク・カグヤ
const GARDEN = "BS07-063" // 秘密の花園
const VANILLA = "BS01-002" // ロクケラトプス
const RAKU = "BS02-053" // 妖精ターニャ（楽族）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KAGUYA).name === "光の覇王ルナアーク・カグヤ" && getCard(GARDEN).name === "秘密の花園", "カード名")
    assert(getCard(IGO).effect.includes("マジックカード1枚を破棄しなければブロックできない"), "IGO の効果文")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    return s
}
function put(s: GameState, pid: PlayerId, id: string): CardInstance {
    const inst = createInstance(id, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    return inst
}
const actionOf = (cardId: string, eid: string): EffectAction => (getCard(cardId).effects.find((e) => e.id === eid) as { action: EffectAction }).action
const onInstance = (s: GameState, i: CardInstance, type: string, until: string): boolean =>
    s.timedEffects.some((r) => r.target.kind === "instance" && r.target.instanceId === i.instanceId && r.until === until && r.content.some((c) => c.type === type))

console.log("=== 1. BS13-047：召喚時、このターンの間このスピリットのブロックに追加コスト ===")
{
    const s = game("igo")
    const self = put(s, "p1", IGO)
    resolveAction(s, "p1", self, actionOf(IGO, "BS13-047-e2"))
    assert(onInstance(s, self, "blockCost", "turn"), "このスピリットにブロックの追加コストが付く")
}

console.log("=== 2. ルナアーク・カグヤ：相手のスピリット1体を選び、このバトルの間BPを2000として扱う ===")
{
    const s = game("kaguya")
    const a = put(s, "p2", VANILLA)
    const b = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, actionOf(KAGUYA, "BS15-X05-e2"))
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.candidates.length === 2, "使用者が相手の2体から選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId })
    assert(onInstance(s, b, "bpAs", "battle") && !onInstance(s, a, "bpAs", "battle"), "選んだ1体だけに、このバトルの間")
}

console.log("=== 3. 秘密の花園：楽族を疲労させることで、このターンの間の制約が自分に掛かる ===")
{
    const s = game("garden")
    s.interactiveTargets = false
    assert(getCard(RAKU).name === "妖精ターニャ" && getCard(RAKU).family.includes("楽族"), "前提：BS02-053 は楽族の妖精ターニャ")
    const r = put(s, "p1", RAKU)
    resolveAction(s, "p1", null, actionOf(GARDEN, "BS07-063-e2"))
    assert(r.isRested, "楽族が疲労した")
    assert(s.timedEffects.some((x) => x.target.kind === "player" && x.target.pid === "p1" && x.content.some((c) => c.type === "playerRule")), "自分に制約が掛かる")
}

console.log("すべてのチェックに合格しました 🎉（part417）")
