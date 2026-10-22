// smoke パート642（flashLockWhileAttackingFamily の minSymbols / cardType / family省略。BS18-053 型）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { validateCastMagic } from "../../server/src/logic/RuleValidator"
import { isFlashLockedFor } from "../../shared/rules"

const MAGIC = "BS04-110" // レッドウォール（赤・コスト2・フラッシュ）
const VANILLA = "BS01-002" // ロクケラトプス（赤・シンボル1つ）。ロックの発生源・アタッカーの両方に使う

console.log("=== 前提 ===")
{
    assert(getCard(MAGIC).name === "レッドウォール" && getCard(MAGIC).type === "magic", "MAGICはレッドウォール")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

// p1 の発生源がロックを持ち、p1 のアタッカー（extraSymbols で枚数調整）がアタック中。p2 が優先権を持つ
function game(extraSymbols: number): GameState {
    const s = createGame("p642", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    const source = createInstance("BS01-003", s.turn, 1) // 発生源（アタッカーとは別個体）
    const atk = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(source, atk)
    refreshLevelAsOverrides(s)
    atk.timedExtraSymbols = extraSymbols
    s.players.p2.hand = [MAGIC]
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: null, directed: false }
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    return s
}

function withLock(extra: Record<string, unknown>, fn: () => void): void {
    const src = getCard("BS01-003")
    const saved = src.effects
    src.effects = [...saved, { id: "t", kind: "flashLockWhileAttackingFamily", levels: null, ...extra } as never]
    try {
        fn()
    } finally {
        src.effects = saved
    }
}

console.log("=== 1. minSymbols:2 + cardType:magic ===")
{
    const two = game(1)
    withLock({ minSymbols: 2, cardType: "magic" }, () => {
        assert(isFlashLockedFor(two, "p2", "magic"), "シンボル2つのアタッカー：相手はマジックを使えない")
        assert(validateCastMagic(two, "p2", 0) === "効果により、フラッシュで手札のカードを使用できません", "validateCastMagic が拒否する")
        assert(!isFlashLockedFor(two, "p2", "spirit"), "スピリットは止めない（種別が違う）")
        assert(!isFlashLockedFor(two, "p2"), "種別不明の経路（バーストの発動など）は止めない")
        assert(!isFlashLockedFor(two, "p1", "magic"), "止まるのは相手だけ")
        assert(validateCastMagic(two, "p2", 0, undefined, undefined, true) === "手元にカードがありません", "手元経路はロックの対象外（別の理由で落ちるだけ）")
    })
    const one = game(0)
    withLock({ minSymbols: 2, cardType: "magic" }, () => {
        assert(!isFlashLockedFor(one, "p2", "magic"), "シンボル1つのアタッカー：止めない（境界）")
        assert(validateCastMagic(one, "p2", 0) === null, "シンボル1つなら使える")
    })
    withLock({ minSymbols: 1 }, () => {
        assert(isFlashLockedFor(one, "p2", "spirit"), "cardType・family 省略なら種別を問わず止める")
    })
}

console.log("すべてのチェックに合格しました 🎉（part642）")
