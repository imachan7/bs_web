// smoke パート411（declare へ移した「指定する」カードを実カードデータで解決する。DECLARE_UNIFY §2）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction, PlayerId } from "../../server/src/type"

const WOODS = "BS01-140" // バインディングウッズ
const FLOCK = "BS03-129" // フロックリカバリー
const KENDRA = "BS02-012" // 地龍王ケンドラゴス
const TYR = "BS15-035" // 軍神機メガ・テュール
const RAIJIN = "BS14-114" // 雷神轟招来
const RED = "BS01-001" // ゴラドン（赤・コスト0・爬獣）
const PURPLE = "BS01-031" // デス・ハーデス（紫・コスト3・呪鬼）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(WOODS).name === "バインディングウッズ", "WOODS")
    assert(getCard(FLOCK).name === "フロックリカバリー", "FLOCK")
    assert(getCard(KENDRA).name === "地龍王ケンドラゴス", "KENDRA")
    assert(getCard(TYR).name === "軍神機メガ・テュール", "TYR")
    assert(getCard(RAIJIN).name === "雷神轟招来", "RAIJIN")
    assert(getCard(RED).colors.join() === "red" && getCard(PURPLE).colors.join() === "purple", "RED／PURPLE")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function declareOf(cardId: string): EffectAction {
    const e = getCard(cardId).effects!.find((x) => "action" in x && (x as { action: EffectAction }).action.type === "declare")
    return (e as { action: EffectAction }).action
}
const alive = (s: GameState, inst: CardInstance): boolean =>
    [...s.players.p1.field.spirits, ...s.players.p2.field.spirits].some((x) => x.instanceId === inst.instanceId)

console.log("=== 1. バインディングウッズ：6色から選び、その色を持つスピリットすべて（両陣営）を疲労 ===")
{
    const s = game("woods")
    const mine = put(s, "p1", PURPLE)
    const theirs = put(s, "p2", PURPLE)
    const red = put(s, "p2", RED)
    resolveAction(s, "p1", null, declareOf(WOODS))
    assert(s.pendingChoice?.options?.length === 6, "6色が候補")
    act(s, "p1", { type: "resolveChoice", option: "紫" })
    assert(mine.isRested && theirs.isRested && !red.isRested, "紫だけが両陣営とも疲労")
}

console.log("=== 2. フロックリカバリー：自分の場の系統から選び、その系統の自分のスピリットを回復 ===")
{
    const s = game("flock")
    const a = put(s, "p1", RED)
    const b = put(s, "p1", PURPLE)
    a.isRested = true
    b.isRested = true
    resolveAction(s, "p1", null, declareOf(FLOCK))
    assert(s.pendingChoice?.options?.join() === "爬獣,呪鬼", "自分の場の系統が候補")
    act(s, "p1", { type: "resolveChoice", option: "呪鬼" })
    assert(a.isRested && !b.isRested, "呪鬼だけ回復")
}

console.log("=== 3. ケンドラゴス：お互いが自分の場の色を指定し、指定されなかった色を破壊 ===")
{
    const s = game("kendra")
    const r1 = put(s, "p1", RED)
    const p1 = put(s, "p1", PURPLE)
    const r2 = put(s, "p2", RED)
    const p2 = put(s, "p2", PURPLE)
    resolveAction(s, "p1", null, declareOf(KENDRA))
    act(s, "p1", { type: "resolveChoice", option: "赤" })
    act(s, "p2", { type: "resolveChoice", option: "赤" })
    assert(alive(s, r1) && alive(s, r2) && !alive(s, p1) && !alive(s, p2), "赤だけ残る")
}

console.log("=== 4. メガ・テュール：相手が自分の場の色を指定し、それ以外の色の相手のスピリットを手札に戻す ===")
{
    const s = game("tyr")
    const red = put(s, "p2", RED)
    const purple = put(s, "p2", PURPLE)
    resolveAction(s, "p1", null, declareOf(TYR))
    assert(s.pendingChoice?.pid === "p2", "相手が指定する")
    act(s, "p2", { type: "resolveChoice", option: "赤" })
    assert(alive(s, red) && !alive(s, purple) && s.players.p2.hand.includes(PURPLE), "紫が手札に戻る")
}

console.log("=== 5. 雷神轟招来：コスト0〜4から指定し、そのコストの相手のスピリットすべてを破壊 ===")
{
    const s = game("raijin")
    const zero = put(s, "p2", RED)
    const three = put(s, "p2", PURPLE)
    resolveAction(s, "p1", null, declareOf(RAIJIN))
    assert(s.pendingChoice?.options?.join() === "コスト0,コスト1,コスト2,コスト3,コスト4", "コスト0〜4が候補")
    act(s, "p1", { type: "resolveChoice", option: "コスト3" })
    assert(alive(s, zero) && !alive(s, three), "コスト3だけ破壊")
}

console.log("すべてのチェックに合格しました 🎉（part411）")
