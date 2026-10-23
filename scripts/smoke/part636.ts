// smoke パート636（BS18 部品：symbolFix の colorFilter/minCores、重装甲の colorsFrom:"opponentFieldSymbols"）
// 効果エントリは BS01-007 に一時的に載せて確かめる（終わりに必ず戻す）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectDef } from "../../server/src/type"
import { hasHeavyArmorAgainst, instanceSymbolCount } from "../../shared/rules"

const HOST = "BS01-007" // ハンマドレイク（赤・コスト2）
const RED = "BS01-002" // ロクケラトプス（赤）
const WHITE = "BS01-074" // バーサーカー・ガン（白）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOST).name === "ハンマドレイク" && getCard(HOST).type === "spirit", "HOSTはハンマドレイク")
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors[0] === "red", "REDはロクケラトプス（赤）")
    assert(getCard(WHITE).name === "バーサーカー・ガン" && getCard(WHITE).colors[0] === "white", "WHITEはバーサーカー・ガン（白）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const fix: EffectDef = { id: "part636-fix", kind: "symbolFix", levels: null, target: "ownAll", colorFilter: "red", minCores: 2, count: 3 }
const heavy: EffectDef = { id: "part636-heavy", kind: "keyword", keyword: "heavyArmor", levels: null, colorsFrom: "opponentFieldSymbols" }
const host = getCard(HOST)
host.effects.push(fix, heavy)
try {
    console.log("=== 1. symbolFix：色とコア数の両方を満たすスピリットだけ固定される ===")
    {
        const s = game("fix1")
        put(s, "p1", HOST, 1)
        const redTwo = put(s, "p1", RED, 2)
        const redOne = put(s, "p1", RED, 1)
        const whiteTwo = put(s, "p1", WHITE, 2)
        assert(instanceSymbolCount(redTwo) === 3, "赤でコア2個：シンボル3個に固定される")
        assert(instanceSymbolCount(redOne) === 1, "赤でもコア1個：固定されない")
        assert(instanceSymbolCount(whiteTwo) === 1, "コア2個でも白：固定されない")
        // コアが減れば外れる（毎回再計算）
        redTwo.cores = 1
        refreshLevelAsOverrides(s)
        assert(instanceSymbolCount(redTwo) === 1, "コアが1個に減ると固定が外れる")
    }

    console.log("=== 2. symbolFix：相手のスピリットには効かない ===")
    {
        const s = game("fix2")
        put(s, "p1", HOST, 1)
        const oppRed = put(s, "p2", RED, 2)
        assert(instanceSymbolCount(oppRed) === 1, "発生源の持ち主でない側は固定されない")
    }

    console.log("=== 3. 重装甲 colorsFrom:opponentFieldSymbols：相手フィールドのシンボル色の効果を受けない ===")
    {
        const s = game("heavy1")
        const me = put(s, "p1", HOST, 1)
        assert(!hasHeavyArmorAgainst(me, ["red"]), "相手のフィールドが空なら、どの色も防がない")
        put(s, "p2", RED, 1)
        refreshLevelAsOverrides(s)
        assert(hasHeavyArmorAgainst(me, ["red"]), "相手に赤シンボルがいれば赤の効果を受けない")
        assert(!hasHeavyArmorAgainst(me, ["blue"]), "相手にいない色（青）の効果は受ける")
        put(s, "p2", WHITE, 1)
        assert(hasHeavyArmorAgainst(me, ["white"]), "相手の白スピリットが増えれば白も防ぐ")
        s.players.p2.field.spirits.length = 0
        refreshLevelAsOverrides(s)
        assert(!hasHeavyArmorAgainst(me, ["red"]), "相手がいなくなれば再計算で防がなくなる")
    }
} finally {
    host.effects.splice(host.effects.indexOf(fix), 1)
    host.effects.splice(host.effects.indexOf(heavy), 1)
}

console.log("すべてのチェックに合格しました 🎉（part636）")
