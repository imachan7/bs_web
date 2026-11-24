// smoke パート1057（BS11-X02 ノヴァLv3：相手のスピリット状態のブレイヴを解決後にトラッシュへ。issue #691・Q3042・Q16924）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const NOVA = "BS11-X02"
const BRAVE = "BS21-057" // 破壊時の誘発を持つ安いブレイヴ
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(NOVA).name === "滅神星龍ダークヴルム・ノヴァ" && getCard(NOVA).type === "spirit", "NOVAはノヴァ")
    assert(getCard(BRAVE).name === "冥獣騎シトリー" && getCard(BRAVE).type === "brave", "BRAVEはシトリー")
    assert(getCard(BRAVE).effects.some((e) => e.kind === "triggered" && e.trigger === "onDestroy"), "BRAVEは破壊時を持つ")
}

function game(seed: string, novaCores: number): { s: GameState; reserve2: number } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.field.spirits.push(createInstance(NOVA, s.turn, novaCores))
    refreshLevelAsOverrides(s)
    return { s, reserve2: s.players.p2.reserve }
}

function settle(s: GameState): void {
    handleAction(s, s.turnPlayer, { type: "nextPhase" } as never)
}

const trashed = (s: GameState, pid: PlayerId): number => s.players[pid].trashCards.filter((c) => c === BRAVE).length
const onField = (s: GameState, pid: PlayerId): boolean => s.players[pid].field.spirits.some((i) => i.cardId === BRAVE)

console.log("=== 1. Lv3：相手のスピリット状態のブレイヴはトラッシュへ、コアはリザーブへ ===")
{
    const { s, reserve2 } = game("c1", 5)
    s.players.p2.field.spirits.push(createInstance(BRAVE, s.turn, 2))
    const logBefore = s.log.length
    settle(s)
    assert(!onField(s, "p2") && trashed(s, "p2") === 1, "相手のブレイヴはトラッシュにある")
    assert(s.players.p2.reserve === reserve2 + 2, "コア2個が相手のリザーブへ")
    const newLog = s.log.slice(logBefore).join("\n")
    assert(!/破壊|消滅/.test(newLog), "破壊・消滅の経過が出ていない")
}

console.log("=== 2. Lv2：残る ===")
{
    const { s } = game("c2", 3)
    s.players.p2.field.spirits.push(createInstance(BRAVE, s.turn, 2))
    settle(s)
    assert(onField(s, "p2") && trashed(s, "p2") === 0, "相手のブレイヴは残る")
}

console.log("=== 3. 自分のブレイヴは残る ===")
{
    const { s } = game("c3", 5)
    s.players.p1.field.spirits.push(createInstance(BRAVE, s.turn, 2))
    settle(s)
    assert(onField(s, "p1"), "自分のブレイヴは残る")
}

console.log("=== 4. 合体中のブレイヴは残る ===")
{
    const { s } = game("c4", 5)
    const host = createInstance(VANILLA, s.turn, 1)
    const brave = createInstance(BRAVE, s.turn, 0)
    host.braveRefs = [{ instanceId: brave.instanceId, cardId: BRAVE } as never]
    s.players.p2.field.spirits.push(host)
    s.players.p2.field.combinedBraves.push(brave)
    settle(s)
    assert(s.players.p2.field.combinedBraves.length === 1 && trashed(s, "p2") === 0, "合体中のブレイヴは残る")
}

console.log("=== 6. 効果の手の出口で置く：handleAction を通さず、効果1手（コア2個配置）でLv3になった時点で相手のブレイヴはトラッシュ ===")
{
    const { s } = game("c6", 3)
    s.players.p2.field.spirits.push(createInstance(BRAVE, s.turn, 2))
    const nova = s.players.p1.field.spirits.find((i) => i.cardId === NOVA)!
    resolveAction(s, "p1", nova, { type: "placeCores", from: "void", to: "spirit", target: "self", count: 2 } as never)
    assert(!onField(s, "p2") && trashed(s, "p2") === 1, "効果の1手が終わった時点で相手のブレイヴはトラッシュにある")
}

console.log("すべてのチェックに合格しました 🎉（part1057）")
