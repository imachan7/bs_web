// smoke パート629（疲労・回復・コアを置くマジックも、対象がいなければ使用できない。疲労済みのスピリットも「疲労させる」の対象に選べる。2026-10-22）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const THORN = "BS01-134" // バインディングソーン（相手のスピリット1体を疲労させる）
const POTION = "BS02-102" // ホワイトポーション（自分のスピリット1体を回復させる）
const FORCE = "BS02-097" // ネイチャーフォース（トラッシュのコアすべてを自分のスピリット1体に置く。メインステップで使えない）
const VANILLA = "BS01-002" // ロクケラトプス
for (const [id, name] of [[THORN, "バインディングソーン"], [POTION, "ホワイトポーション"], [FORCE, "ネイチャーフォース"], [VANILLA, "ロクケラトプス"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
}

function game(seed: string, hand: string[]): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.hand = hand
    return s
}
const put = (s: GameState, pid: PlayerId, rested = false) => {
    const inst = createInstance(VANILLA, s.turn, 1)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 疲労させる：疲労済みの相手スピリットしかいなくても使える／相手がいなければ使えない ===")
{
    const s = game("thorn-rested", [THORN])
    put(s, "p2", true)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "疲労済みのスピリットだけでも使える")
}
{
    const s = game("thorn-none", [THORN])
    put(s, "p1")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "相手のスピリットがいなければ使えない")
}

console.log("=== 回復させる：回復状態の自分のスピリットしかいなくても使える／いなければ使えない ===")
{
    const s = game("potion-ready", [POTION])
    put(s, "p1")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "回復状態のスピリットだけでも使える")
}
{
    const s = game("potion-none", [POTION])
    put(s, "p2", true)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "自分のスピリットがいなければ使えない")
}

console.log("=== コアを置く：置くコアが0個でも自分のスピリットがいれば使える／いなければ使えない ===")
function battleFor(seed: string, defenderHasSpirit: boolean): GameState {
    const s = game(seed, [])
    s.turnPlayer = "p2"
    s.phase = "attack"
    const atk = put(s, "p2")
    if (defenderHasSpirit) put(s, "p1", true)
    s.players.p1.hand = [FORCE]
    s.players.p1.trashCores = 0
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    return s
}
{
    const s = battleFor("force-mine", true)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "トラッシュのコアが0個でも使える")
}
{
    const s = battleFor("force-none", false)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "自分のスピリットがいなければ使えない")
}

console.log("すべてのチェックに合格しました 🎉（part629）")
