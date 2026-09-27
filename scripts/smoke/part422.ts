// smoke パート422（removeCores の count:"any" とカウンタ lastCores。「〜1つにつき、相手のスピリット1体のコア1個」は1体に N 回。HANDOFF §1 R5 pay の残り②）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"
import { refreshLevelAsOverrides } from "../../server/src/logic/EffectModules"

const MIST = "BS03-124" // ポイズンミスト
const DILGAN = "BS12-012" // 戦車皇ディルガン
const KURONO = "BS12-015" // 冥王神龍クロノ・ハデス（シンボル2つ）
const NO_SYMBOL_BRAVE = "BS12-050" // 突機竜アーケランサー（シンボル無し）
const YOKA = "BS15-076" // 妖華吸血爪
const KETSU = "BS04-022" // 王蛇ケツァルカトル
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MIST).name === "ポイズンミスト" && getCard(DILGAN).name === "戦車皇ディルガン", "カード名1")
    assert(getCard(YOKA).name === "妖華吸血爪" && getCard(KETSU).name === "王蛇ケツァルカトル", "カード名2")
    assert(getCard(KURONO).symbol.length === 2 && getCard(NO_SYMBOL_BRAVE).symbol.length === 0, "シンボル数")
}

const actionOf = (cardId: string, id: string): EffectAction =>
    (getCard(cardId).effects.find((e) => e.id === id) as { action: EffectAction }).action

function game(): GameState {
    const s = createGame("cores", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    return s
}

console.log("=== ポイズンミスト：相手のリザーブが2個なら、置ける数は0〜2 ===")
{
    const s = game()
    s.players.p1.reserve = 5
    s.players.p2.reserve = 2
    resolveAction(s, "p1", null, actionOf(MIST, "BS03-124-e1"))
    assert(s.pendingChoice?.options?.join(",") === "0,1,2", "選べるのは0〜2")
    act(s, "p1", { type: "resolveChoice", option: "2" })
    assert(s.players.p1.reserve === 3 && s.players.p1.trashCores === 2, "自分のリザーブから2個")
    assert(s.players.p2.reserve === 0 && s.players.p2.trashCores === 2, "相手のリザーブから同じ2個")
}

console.log("=== ディルガン：置ける数は相手の1体から取れる数まで。選んだ1体から N 個 ===")
{
    const s = game()
    const dilgan = createInstance(DILGAN, s.turn, 5)
    s.players.p1.field.spirits.push(dilgan)
    const a = createInstance(KURONO, s.turn, 3)
    const b = createInstance(KURONO, s.turn, 2)
    s.players.p2.field.spirits.push(a, b)
    attachBrave(s, "p2", a, createInstance(NO_SYMBOL_BRAVE, s.turn, 0))
    attachBrave(s, "p2", b, createInstance(NO_SYMBOL_BRAVE, s.turn, 0))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", dilgan, actionOf(DILGAN, "BS12-012-e1"))
    assert(s.pendingChoice?.options?.join(",") === "0,1,2,3", "選べるのは0〜3（1体の最大コア数）")
    act(s, "p1", { type: "resolveChoice", option: "2" })
    assert(dilgan.cores === 3, "自分のコアを2個トラッシュへ")
    assert(s.pendingChoice?.kind === "target", "対象を1体選ぶ")
    act(s, "p1", { type: "resolveChoice", instanceId: a.instanceId })
    assert(!s.pendingChoice && a.cores === 1 && b.cores === 2, "選んだ1体から2個（2体目は選ばない）")
}

console.log("=== 妖華吸血爪：破棄した2枚ぶん、選んだ1体から2個 ===")
{
    const s = game()
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    const a = createInstance(VANILLA, s.turn, 3)
    const b = createInstance(VANILLA, s.turn, 3)
    s.players.p2.field.spirits.push(a, b)
    resolveAction(s, "p1", null, actionOf(YOKA, "BS15-076-e2"))
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice" })
    act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId })
    assert(!s.pendingChoice && a.cores === 3 && b.cores === 1, "1体から2個")
}

console.log("=== 王蛇ケツァルカトル：相手のスピリットが1体なら破棄できるのは1枚まで ===")
{
    const s = game()
    const k = createInstance(KETSU, s.turn, 3)
    s.players.p1.field.spirits.push(k)
    s.players.p1.hand = [VANILLA, VANILLA, VANILLA]
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 3))
    resolveAction(s, "p1", k, actionOf(KETSU, "BS04-022-e2"))
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.players.p1.hand.length === 2, "1枚破棄した")
    assert(s.pendingChoice?.kind !== "card", "2枚目は選ばせない")
}

console.log("すべてのチェックに合格しました 🎉（part422）")
