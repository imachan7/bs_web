// smoke パート611（BS17部品バッチ10：noBurstEffectForPid／cantUseMagicForPid／opponentLifeCoreFromVoid）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { EffectDef } from "../../server/src/type"
import type { GameState, PlayerId } from "./helpers"
import { activateBurstCard, finishSummonEffect } from "../../server/src/logic/keywords/burst"
import { validateCastMagic } from "../../server/src/logic/RuleValidator"

const HOLDER = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const PLAIN = "BS01-050" // ビートビートル
const BURST_MAGIC3 = "BS14-091" // 双光気弾（赤・コスト3・バーストでドロー2）
const BURST_SPIRIT4 = "BS14-061" // ヤギュード・ジューベイ（青・コスト4・バーストで召喚）
const BURST_BLUE_MAGIC = "BS14-112" // 封渦斬（青・コスト3マジック。効果を差し替えて083の入れ物にする）
const RED_MAGIC = "BS14-091"
const YELLOW_TRASH_MAGIC = "BS08-079" // キャッツアイ（黄・コスト3）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BURST_MAGIC3).cost === 3 && getCard(BURST_MAGIC3).type === "magic" && getCard(BURST_MAGIC3).colors[0] === "red", "BURST_MAGIC3は赤コスト3マジック")
    assert(getCard(BURST_SPIRIT4).cost === 4 && getCard(BURST_SPIRIT4).type === "spirit", "BURST_SPIRIT4はコスト4スピリット")
    assert(getCard(BURST_BLUE_MAGIC).colors[0] === "blue" && getCard(BURST_BLUE_MAGIC).effects.some((e) => e.kind === "burst"), "BURST_BLUE_MAGICは青のバースト持ち")
    assert(getCard(YELLOW_TRASH_MAGIC).colors[0] === "yellow" && getCard(YELLOW_TRASH_MAGIC).type === "magic", "キャッツアイは黄マジック")
    assert(getCard(HOLDER).effects.length === 0, "HOLDERは差し替え前はバニラ")
}

const original: Record<string, EffectDef[]> = {}
function patch(id: string, effects: EffectDef[]): void {
    original[id] ??= getCard(id).effects
    getCard(id).effects = effects
}
function restore(): void {
    for (const [id, e] of Object.entries(original)) getCard(id).effects = e
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => PLAIN)
    s.players.p2.deck = Array.from({ length: 40 }, () => PLAIN)
    return s
}

console.log("=== 084: 宣言したコストのバースト効果が飛ぶ（発動は成立してトラッシュへ） ===")
{
    const s = game("b084a", true)
    resolveAction(s, "p1", null, {
        type: "declare",
        what: "cost",
        options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        then: { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noBurstEffectForPid", declared: "match" } }], duration: "turn" },
    })
    assert(s.pendingChoice?.kind === "option", "コストの宣言が出る")
    handleAction(s, "p1", { type: "resolveChoice", option: "コスト3" })
    const rules = s.timedEffects.flatMap((r) => r.content).filter((c) => c.type === "playerRule")
    const rule = rules[0]?.type === "playerRule" ? rules[0].rule : undefined
    assert(rule?.type === "noBurstEffectForPid" && rule.cost?.min === 3 && rule.cost.max === 3, "宣言したコスト3で埋まる")

    const hand = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_MAGIC3)
    assert(s.players.p2.hand.length === hand, "コスト3のマジックのバーストはドローしない")
    assert(s.players.p2.trashCards.includes(BURST_MAGIC3) && s.players.p2.burst === null, "発動は成立しトラッシュへ行く")

    activateBurstCard(s, "p2", BURST_SPIRIT4)
    assert(s.players.p2.field.spirits.length === 1 && s.players.p2.burst === null, "コスト4は宣言外なので通常どおり召喚される")
}
{
    const s = game("b084b")
    const ban = (min: number, max: number): void =>
        resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noBurstEffectForPid", cost: { min, max } } }], duration: "turn" })
    ban(4, 4)
    const hand = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_MAGIC3)
    assert(s.players.p2.hand.length === hand + 2, "コスト4指定のとき、コスト3のバーストは通常どおりドロー2")
    activateBurstCard(s, "p2", BURST_SPIRIT4)
    assert(s.players.p2.field.spirits.length === 0 && s.players.p2.trashCards.includes(BURST_SPIRIT4), "コスト4のスピリットのバーストは召喚されずトラッシュへ")
    s.turn = 4
    s.timedEffects = s.timedEffects.filter((r) => r.until !== "turn")
    const hand2 = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_MAGIC3)
    assert(s.players.p2.hand.length === hand2 + 2, "ターンが変われば元に戻る")
}
{
    const s = game("b084c")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noBurstEffectForPid" } }], duration: "turn" })
    const hand = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_MAGIC3)
    assert(s.players.p2.hand.length === hand, "cost省略はすべてのバーストが飛ぶ")
}

console.log("=== 083: 召喚時効果を発揮したカードの色のマジックを使用できない ===")
const THIRTEEN: EffectDef[] = [
    {
        id: "t083",
        kind: "burst",
        event: "opponentSummonEffectResolved",
        action: { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "cantUseMagicForPid", colors: "event" } }], duration: "turn" },
    },
]
patch(BURST_BLUE_MAGIC, THIRTEEN)
function scenario083(seed: string, colors: ("red" | "blue")[]): GameState {
    const s = game(seed)
    s.players.p1.hand = [RED_MAGIC, BURST_BLUE_MAGIC]
    s.players.p1.trashCards.push(YELLOW_TRASH_MAGIC)
    s.players.p2.burst = BURST_BLUE_MAGIC
    s.players.p2.burstSet = true
    s.turnPlayer = "p1"
    s.summonEffectSource = { pid: "p1", instanceId: "x", cost: 3, colors, resolved: true }
    finishSummonEffect(s)
    return s
}
{
    const s = scenario083("b083a", ["red"])
    assert(s.players.p2.burst === null && s.players.p2.trashCards.includes(BURST_BLUE_MAGIC), "バーストが発動した")
    assert(String(validateCastMagic(s, "p1", 0)).includes("この色"), "赤のマジックは手札から使えない")
    assert(!String(validateCastMagic(s, "p1", 1)).includes("この色"), "青のマジックは色の禁止にかからない")
    const reserve = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "castMagicFromTrashByColor", colorFilter: "red" })
    assert(s.players.p1.reserve === reserve, "トラッシュからの赤マジックも使えない（支払いも起きない）")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "cantUseMagicForPid", colors: ["yellow"] } }], duration: "turn", side: "own" })
    const reserve2 = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "castMagicFromTrashByColor", colorFilter: "yellow" })
    assert(s.players.p1.reserve === reserve2, "黄を禁止すればトラッシュの黄マジックも使えない")
}
{
    const s = scenario083("b083b", ["red", "blue"])
    assert(String(validateCastMagic(s, "p1", 0)).includes("この色") && String(validateCastMagic(s, "p1", 1)).includes("この色"), "多色（赤青）なら赤も青も使えない")
}
{
    const s = scenario083("b083c", ["red"])
    s.timedEffects = s.timedEffects.filter((r) => r.until !== "turn")
    assert(!String(validateCastMagic(s, "p1", 0)).includes("この色"), "ターンが変われば禁止が消える")
}
restore()

console.log("=== 014: 相手のライフにボイドからコアが置かれたとき、1個につき手札2枚破棄 ===")
patch(HOLDER, [
    { id: "t014", kind: "fieldEvent", levels: null, event: "opponentLifeCoreFromVoid", repeatPerCount: true, action: { type: "discardOpponent", count: 2 } },
])
{
    const s = game("b014a")
    const inst = createInstance(HOLDER, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    s.players.p2.hand = Array.from({ length: 8 }, () => PLAIN)
    resolveAction(s, "p2", null, { type: "placeCores", from: "void", to: "life", count: 2 })
    assert(s.players.p2.hand.length === 4, "ボイドから2個置かれると手札4枚を破棄")
}
{
    const s = game("b014b")
    s.players.p1.field.spirits.push(createInstance(HOLDER, s.turn, 1))
    refreshLevelAsOverrides(s)
    s.players.p2.hand = Array.from({ length: 8 }, () => PLAIN)
    resolveAction(s, "p2", null, { type: "placeCores", from: "reserve", to: "life", count: 2 })
    assert(s.players.p2.hand.length === 8, "リザーブから置いたときは発火しない")
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "life", count: 2 })
    assert(s.players.p2.hand.length === 8, "自分のライフに置いても発火しない")
}
restore()

console.log("すべてのチェックに合格しました 🎉（part611）")
