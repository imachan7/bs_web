// smoke パート986（BS08-X33 堕天使ミカファール Lv2 e2：トラッシュのマジックを、フィールドのコアも使ってコストを支払って使用する）
// COST_MODEL §12。支払いの待ちは magic/payThenResolve.ts と同じ（askCostPay）
import { act, assert, createGame, createInstance, effectiveCost, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

const MAGIC = "BS08-079" // キャッツアイ（黄のマジック）

console.log("=== 前提 ===")
assert(getCard("BS08-X33").name === "堕天使ミカファール", "BS08-X33 は堕天使ミカファール")
assert(getCard(MAGIC).type === "magic", "BS08-079 はマジック")

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function setup(seed: string, interactive: boolean, reserve: number) {
    const s = game(seed, interactive)
    put(s, "p2", "BS01-005", 3)
    if (interactive) put(s, "p2", "BS01-005", 3) // 対象を2体にして選択待ちを立てる
    const mika = put(s, "p1", "BS08-X33", 2)
    const donor = put(s, "p1", "BS01-005", 6)
    s.players.p1.trashCards.push(MAGIC)
    const cost = effectiveCost(s, "p1", getCard(MAGIC))
    s.players.p1.reserve = reserve
    return { s, mika, donor, cost }
}

console.log("=== 1. 非対話：リザーブが足りなくてもフィールドのコアで払って使用される ===")
{
    const { s, mika, cost } = setup("auto", false, 0)
    assert(cost > 0, "コストが0より大きい")
    const field = () => s.players.p1.field.spirits.reduce((n, i) => n + i.cores, 0)
    const before = field()
    fireTrigger(s, "p1", mika, "onAttack")
    assert(s.players.p1.trashCards.includes(MAGIC), "使用後のマジックはトラッシュへ戻る")
    assert(before - field() === cost, `フィールドから${String(cost)}個払った（実際: ${String(before - field())}）`)
    assert(s.players.p1.trashCores >= cost, "払ったコアはトラッシュへ")
}

console.log("=== 2. 対話：支払いの選択が出て、選んだコアから払って使用される ===")
{
    const { s, mika, donor, cost } = setup("ask", true, 0)
    fireTrigger(s, "p1", mika, "onAttack")
    assert(s.pendingChoice?.kind === "card", "カードの選択待ち")
    const idx = (s.pendingChoice?.cardIndices ?? [])[0]
    assert(idx !== undefined, "候補にキャッツアイが出る（リザーブ0でも）")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx as number }) === null, "選ぶ")
    assert(s.pendingChoice?.effectCostPay !== undefined, "支払いの選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: "支払う", paySources: [{ instanceId: donor.instanceId, count: cost }] }) === null, "支払う")
    assert(donor.cores === 6 - cost, `選んだスピリットから${String(cost)}個減る（実際: ${String(donor.cores)}）`)
    assert(s.pendingChoice?.kind === "target", "使用されて対象選択が出る")
}

console.log("=== 3. リザーブ0でも、発揮しているミカファール自身を消滅させてコストを払える：候補に出る（#662・#665。COST_MODEL §13） ===")
{
    const s = game("short", true)
    put(s, "p2", "BS01-005", 3)
    const mika = put(s, "p1", "BS08-X33", 2) // Lv2の維持コアぶんしか持たない。払うと消滅する
    s.players.p1.trashCards.push(MAGIC)
    s.players.p1.reserve = 0
    fireTrigger(s, "p1", mika, "onAttack")
    assert(s.pendingChoice?.kind === "card" && (s.pendingChoice.cardIndices ?? []).length > 0, `候補に出る（実際: ${String(s.pendingChoice?.kind)}）`)
}
console.log("すべてのチェックに合格しました 🎉（part986）")
