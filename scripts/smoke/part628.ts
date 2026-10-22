// smoke パート628（陣営の書かれていない「スピリット1体」「ネクサス1つ」は自分と相手のどちらからでも選べる。2026-10-22）
import { act, assert, createGame, createInstance, fireTrigger, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const ZON = "BS04-006" // 骸竜ゾン・サウル（Lv3アタック時：疲労状態のスピリット1体を破壊する）
const CYCLONE = "BS03-120" // フレイムサイクロン（BP5000以下のスピリット1体を破壊する）
const SPEAR = "BS01-114" // バスタースピア（ネクサス1つを破壊。相手のネクサスを破壊したらドロー）
const NEXUS = "BS01-102" // 主無き古城
const VANILLA = "BS01-002" // ロクケラトプス
for (const [id, name] of [[ZON, "骸竜ゾン・サウル"], [CYCLONE, "フレイムサイクロン"], [SPEAR, "バスタースピア"], [NEXUS, "主無き古城"], [VANILLA, "ロクケラトプス"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 20 }, () => VANILLA)
    return s
}
const spirit = (s: GameState, pid: "p1" | "p2", cardId: string, cores: number, rested = false) => {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 強制の破壊は、相手側に候補がいなければ自分のスピリットに当たる ===")
{
    const s = game("zon-own")
    const max = getCard(ZON).levels.reduce((m, l) => Math.max(m, l.cores), 0)
    const zon = spirit(s, "p1", ZON, max)
    const mine = spirit(s, "p1", VANILLA, 1, true)
    spirit(s, "p2", VANILLA, 1, false)
    fireTrigger(s, "p1", zon, "onAttack")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId), "疲労状態の自分のスピリットが破壊される")
    assert(s.players.p2.field.spirits.length === 1, "回復状態の相手のスピリットは残る")
}

console.log("=== マジックも同じ：相手にいなくても自分のスピリットを対象に使える／両方いれば相手側を自動で選ぶ ===")
{
    const s = game("cyclone-own")
    s.players.p1.hand = [CYCLONE]
    const mine = spirit(s, "p1", VANILLA, 1)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mine.instanceId), "自分のスピリットが破壊される")
}
{
    const s = game("cyclone-both")
    s.players.p1.hand = [CYCLONE]
    spirit(s, "p1", VANILLA, 1)
    spirit(s, "p2", VANILLA, 1)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用できる")
    assert(s.players.p1.field.spirits.length === 1 && s.players.p2.field.spirits.length === 0, "自動で選ぶときは相手のスピリット")
}

console.log("=== バスタースピア：自分のネクサスを壊したらドローしない／相手のなら1枚ドロー ===")
{
    const s = game("spear-own")
    s.players.p1.hand = [SPEAR]
    s.players.p1.field.nexuses.push(createInstance(NEXUS, s.turn, 0))
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "相手にネクサスがなくても使える")
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスが破壊される")
    assert(s.players.p1.hand.length === 0, "ドローしない")
}
{
    const s = game("spear-opp")
    s.players.p1.hand = [SPEAR]
    s.players.p2.field.nexuses.push(createInstance(NEXUS, s.turn, 0))
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使える")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスが破壊される")
    assert(s.players.p1.hand.length === 1, "1枚ドロー")
}

console.log("すべてのチェックに合格しました 🎉（part628）")
