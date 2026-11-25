// smoke パート1060（#710：手札から無料で召喚する素の count。対戦では候補が2枚以上なら選ばせ、コスト最大を勝手に選ばない）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const LILIA = "X020" // 星文学者リリア
const AQUA = "BS11-X04" // 宝瓶神機アクア・エリシオン（光導・コスト7）
const LIBRA = "BS11-X06" // 天秤造神リブラ・ゴレム（光導・コスト8）
const VANILLA = "BS01-002" // ロクケラトプス

assert(getCard(LILIA).name === "星文学者リリア", "X020 は星文学者リリア")
assert(getCard(AQUA).name === "宝瓶神機アクア・エリシオン" && getCard(AQUA).cost === 7, "アクア・エリシオンはコスト7")
assert(getCard(LIBRA).name === "天秤造神リブラ・ゴレム" && getCard(LIBRA).cost === 8, "リブラ・ゴレムはコスト8")

const ACTION = { type: "summon", from: "hand", familyFilter: "光導", count: 1 } as EffectAction

function setup(hand: string[], interactive: boolean): { s: GameState; lilia: ReturnType<typeof createInstance> } {
    const s = createGame("p1060", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = hand
    const lilia = createInstance(LILIA, s.turn, 1)
    s.players.p1.field.spirits.push(lilia)
    refreshLevelAsOverrides(s)
    return { s, lilia }
}
const onField = (s: GameState, id: string): boolean => s.players.p1.field.spirits.some((sp) => sp.cardId === id)

console.log("=== 1. 対戦：候補が2枚なら選ばせ、コストの低いアクアを選べる ===")
{
    const { s, lilia } = setup([LIBRA, AQUA], true)
    resolveAction(s, "p1", lilia, ACTION)
    const pc = s.pendingChoice
    assert(pc?.kind === "card" && pc.cardZone === "hand" && pc.cardIndices?.length === 2, "手札の2枚から選ぶ待ちが立つ")
    assert(!onField(s, LIBRA) && !onField(s, AQUA), "選ぶ前には召喚しない")
    const aquaIdx = s.players.p1.hand.indexOf(AQUA)
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: aquaIdx })
    for (let k = 0; k < 10 && s.pendingChoice?.pid === "p1"; k++) { handleAction(s, "p1", { type: "resolveChoice", option: s.pendingChoice.options?.[0] ?? "" }) }
    assert(onField(s, AQUA), "選んだアクア・エリシオンが召喚される")
    assert(!onField(s, LIBRA) && s.players.p1.hand.includes(LIBRA), "リブラ・ゴレムは手札に残る")
}

console.log("=== 2. 対戦：候補が1枚なら聞かずにそれを出す ===")
{
    const { s, lilia } = setup([AQUA, VANILLA], true)
    resolveAction(s, "p1", lilia, ACTION)
    assert(s.pendingChoice?.kind !== "card", "候補1枚では選ぶ待ちを立てない")
    for (let k = 0; k < 10 && s.pendingChoice?.pid === "p1"; k++) { handleAction(s, "p1", { type: "resolveChoice", option: s.pendingChoice.options?.[0] ?? "" }) }
    assert(onField(s, AQUA), "アクア・エリシオンが召喚される")
}

console.log("=== 3. 対戦：候補が無ければ何も起きない ===")
{
    const { s, lilia } = setup([VANILLA], true)
    resolveAction(s, "p1", lilia, ACTION)
    assert(s.pendingChoice === null || s.pendingChoice === undefined, "待ちは立たない")
    assert(s.players.p1.field.spirits.length === 1, "召喚されない")
}

console.log("=== 4. 非対話（AI 等）は従来どおりコスト最大を自動で出す ===")
{
    const { s, lilia } = setup([AQUA, LIBRA], false)
    resolveAction(s, "p1", lilia, ACTION)
    assert(onField(s, LIBRA) && !onField(s, AQUA), "コスト8のリブラ・ゴレムが出る")
}

console.log("すべてのチェックに合格しました 🎉（part1060）")
