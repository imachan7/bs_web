// smoke パート626（メインステップではマジックのメイン効果とフラッシュ効果のどちらも選んで使える。castMagic.timing）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"

const DOUBLE = "BS01-117" // ダブルドロー（メイン：2枚ドロー／フラッシュ：スピリット1体をBP+2000）
const REKKO = "BS14-092" // 烈光閃刃（メイン効果だけ）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(DOUBLE).name === "ダブルドロー" && getCard(DOUBLE).type === "magic", "DOUBLEはダブルドロー")
assert(getCard(REKKO).name === "烈光閃刃" && !getCard(REKKO).flash, "REKKOはフラッシュ効果のない烈光閃刃")
assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")

function game(seed: string): { s: GameState; ally: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = [DOUBLE]
    const ally = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s)
    return { s, ally }
}

console.log("=== 1. 指定しなければメイン効果 ===")
{
    const { s, ally } = game("timing-default")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.hand.length === 2, "メイン効果で2枚ドロー")
    assert((ally.tempBpBuff ?? 0) === 0 && s.timedEffects.every((r) => r.target.kind !== "instance" || r.target.instanceId !== ally.instanceId), "BPは上がらない")
}

console.log("=== 2. メインステップでフラッシュ効果を選ぶ ===")
{
    const { s, ally } = game("timing-flash")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュ効果を選んで使用できる")
    assert(s.players.p1.hand.length === 0, "ドローしない")
    assert(s.players.p1.trashCards.includes(DOUBLE), "使ったカードはトラッシュへ")
    assert(s.timedEffects.some((r) => r.target.kind === "instance" && r.target.instanceId === ally.instanceId), "自分のスピリットがBP+される")
}

console.log("=== 3. 持っていない効果・使えないタイミングは拒否 ===")
{
    const { s } = game("timing-missing")
    s.players.p1.hand = [REKKO]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "フラッシュ効果のないマジックをフラッシュ効果で使えない")
    assert(s.players.p1.hand.length === 1, "手札は減らない")
}
{
    const { s, ally } = game("timing-battle")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: ally.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) !== null, "バトル中はメイン効果を選べない")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "指定しなければフラッシュ効果で使える")
}

console.log("=== 4. AI はメインステップで両方を候補にする ===")
{
    const { s } = game("timing-ai")
    const casts = enumerateLegalMoves(s, "p1").filter((m) => m.action.type === "castMagic")
    assert(casts.some((m) => m.action.type === "castMagic" && m.action.timing === undefined), "メイン効果の候補")
    assert(casts.some((m) => m.action.type === "castMagic" && m.action.timing === "flash"), "フラッシュ効果の候補")
}

console.log("すべてのチェックに合格しました 🎉（part626）")
