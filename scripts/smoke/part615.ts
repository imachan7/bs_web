// smoke パート615（BS17-063 黒き聖杯：globalConstraint coreGainCap。相手の効果でボイド/トラッシュからコアを置けるのはターンに合計1個まで）
// 黒き聖杯は staging にしか無いので、効果エントリを BS01-102 に一時的に載せて確かめる（終わりに必ず戻す）
import { assert, createGame, createInstance, endTurn, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectDef } from "../../server/src/type"

const CUP = "BS01-102" // 主無き古城（紫・ネクサス）。黒き聖杯の代役
const SPIRIT = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CUP).name === "主無き古城" && getCard(CUP).type === "nexus", "CUPは主無き古城（ネクサス）")
    assert(getCard(SPIRIT).name === "ロクケラトプス" && getCard(SPIRIT).type === "spirit", "SPIRITはロクケラトプス")
}

const capEffect: Extract<EffectDef, { kind: "globalConstraint" }> = {
    id: "part615-cap",
    kind: "globalConstraint",
    levels: [1, 2],
    constraint: { type: "coreGainCap", max: 1, sourceTypes: ["spirit", "brave", "nexus"], from: ["void", "trash"], to: ["life", "field", "reserve"] },
}

function game(seed: string, withCup = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => SPIRIT)
    s.players.p2.deck = Array.from({ length: 40 }, () => SPIRIT)
    if (withCup) s.players.p1.field.nexuses.push(createInstance(CUP, s.turn, 1))
    refreshLevelAsOverrides(s)
    return s
}

function spirit(s: GameState, pid: PlayerId) {
    const inst = createInstance(SPIRIT, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const card = getCard(CUP)
card.effects.push(capEffect)
try {
    console.log("=== 1. 相手のスピリットの効果は合計1個まで（累計） ===")
    {
        const s = game("cap1")
        const a = spirit(s, "p2")
        const b = spirit(s, "p2")
        const before = s.players.p2.reserve
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p2.reserve === before + 1, "1回目：3個置こうとして1個だけ置かれる")
        resolveAction(s, "p2", b, { type: "placeCores", from: "void", to: "reserve", count: 2 })
        assert(s.players.p2.reserve === before + 1, "別のスピリットの2回目は0個")
        const c0 = a.cores
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "spirit", target: "self", count: 2 })
        assert(a.cores === c0, "ボイドからフィールドへも累計の上限で0個")
        const life0 = s.players.p2.life
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "life", count: 1 })
        assert(s.players.p2.life === life0, "ボイドからライフへも0個")
    }
    console.log("=== 2. マジックの効果は制限されず、累計にも入らない ===")
    {
        const s = game("cap2")
        const a = spirit(s, "p2")
        const before = s.players.p2.reserve
        resolveAction(s, "p2", null, { type: "placeCores", from: "void", to: "reserve", count: 3 }, undefined, undefined, "magic")
        assert(s.players.p2.reserve === before + 3, "マジックなら3個置ける")
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p2.reserve === before + 4, "マジックは累計に入らず、スピリットの効果で1個置ける")
    }
    console.log("=== 3. 自分の効果・リザーブ起点・コアステップは制限されない ===")
    {
        const s = game("cap3")
        const mine = spirit(s, "p1")
        const b0 = s.players.p1.reserve
        resolveAction(s, "p1", mine, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p1.reserve === b0 + 3, "発生源の持ち主自身の効果は制限されない")
        const a = spirit(s, "p2")
        const c0 = a.cores
        resolveAction(s, "p2", a, { type: "placeCores", from: "reserve", to: "spirit", target: "self", count: 2 })
        assert(a.cores === c0 + 2, "リザーブからの移動は対象外")
        s.coreGainCountThisTurn.p2 = 1
        const r0 = s.players.p2.reserve
        endTurn(s)
        assert(s.players.p2.reserve > r0, "累計が上限でも、相手ターンのコアステップでコアは置かれる")
    }
    console.log("=== 4. ターンが変われば再び1個置ける ===")
    {
        const s = game("cap4")
        const a = spirit(s, "p2")
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 1 })
        assert(s.coreGainCountThisTurn.p2 === 1, "1個で上限に達した")
        endTurn(s)
        assert(s.coreGainCountThisTurn.p2 === 0, "ターンが変わると累計は0")
        const before = s.players.p2.reserve
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p2.reserve === before + 1, "次のターンも1個置ける")
    }
    console.log("=== 5. ネクサスの効果も数え、トラッシュ起点も制限される ===")
    {
        const s = game("cap5")
        const nx = s.players.p2.field.nexuses[0] ?? (s.players.p2.field.nexuses.push(createInstance(CUP, s.turn, 1)), s.players.p2.field.nexuses[0]!)
        s.players.p2.trashCores = 5
        const before = s.players.p2.reserve
        resolveAction(s, "p2", nx, { type: "placeCores", from: "trash", to: "reserve", count: 4 })
        assert(s.players.p2.reserve === before + 1 && s.players.p2.trashCores === 4, "ネクサスの効果・トラッシュ起点も合計1個まで（置いていない分はトラッシュに残る）")
    }
    console.log("=== 6. 黒き聖杯が無ければ制限されない ===")
    {
        const s = game("cap6", false)
        const a = spirit(s, "p2")
        const before = s.players.p2.reserve
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p2.reserve === before + 3, "場に無ければ3個置ける")
    }
    console.log("=== 7. Lv外なら制限されない ===")
    {
        const s = game("cap7")
        capEffect.levels = [2] // 聖杯は1コア＝Lv1なので対象外
        const a = spirit(s, "p2")
        const before = s.players.p2.reserve
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p2.reserve === before + 3, "Lvが合わなければ3個置ける")
        s.players.p1.field.nexuses[0]!.cores = 2
        refreshLevelAsOverrides(s)
        resolveAction(s, "p2", a, { type: "placeCores", from: "void", to: "reserve", count: 3 })
        assert(s.players.p2.reserve === before + 4, "Lv2になれば効き、3個のうち1個だけ置かれる")
    }
} finally {
    card.effects.pop()
}

console.log("すべてのチェックに合格しました 🎉（part615）")
