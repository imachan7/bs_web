// smoke パート641（BS18 部品：globalConstraint opponentMustAttackOnce／constraint mustBeAttackTarget。BS18-029／035 の読み 2026-10-23 ユーザー確認）
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { validateAttack, validateEndTurn } from "../../server/src/logic/RuleValidator"
import { directAttackFilter } from "../../shared/rules"
import { matchesDirectedAttackFilter } from "../../shared/block"
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HOLDER = "BS01-001" // ゴラドン（赤・コスト0）。テスト中だけ効果を差し込む
const COST1 = "BS01-002" // ロクケラトプス（コスト1）
const COST2 = "BS01-003" // テラノセイバー（コスト2）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HOLDER).cost === 0 && getCard(COST1).cost === 1 && getCard(COST2).cost === 2, "コストは0／1／2")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const effects = getCard(HOLDER).effects as unknown[]
function withEffect(entry: object, body: () => void): void {
    effects.push({ id: "t-641", levels: [1], ...entry })
    try {
        body()
    } finally {
        effects.pop()
    }
}

console.log("=== 1. opponentMustAttackOnce：アタックできるのに1回もアタックしていなければ終えられない ===")
{
    const entry = { kind: "globalConstraint", constraint: { type: "opponentMustAttackOnce" }, phase: "attack", turn: "opponent" }
    withEffect(entry, () => {
        const s = game("once-1")
        put(s, "p2", HOLDER)
        const atk = put(s, "p1", COST1)
        assert(validateEndTurn(s, "p1") !== null, "アタックステップ：アタックできる個体がいて未アタックならターンを終えられない")
        s.phase = "main"
        assert(validateEndTurn(s, "p1") !== null, "メインからの終了も同じ（アタックステップは必ず来る）")
        s.phase = "attack"
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(validateEndTurn(s, "p1") === null, "1回アタックした後は終えられる")
    })
    withEffect(entry, () => {
        const s = game("once-rested")
        put(s, "p2", HOLDER)
        put(s, "p1", COST1).isRested = true
        assert(validateEndTurn(s, "p1") === null, "アタックできる個体がいなければ終えられる")
    })
    withEffect(entry, () => {
        const s = game("once-rejected")
        put(s, "p2", HOLDER)
        put(s, "p1", COST1)
        s.players.p1.reserve = 0
        const tollSrc = getCard(HOLDER).effects as unknown[]
        tollSrc.push({ id: "t-toll", kind: "globalConstraint", levels: [1], constraint: { type: "attackRequiresCoreToll", maxCost: 5 } })
        try {
            assert(validateAttack(s, "p1", s.players.p1.field.spirits[0]!.instanceId) !== null, "前提：リザーブ不足でどのアタックも拒否される")
            assert(validateEndTurn(s, "p1") === null, "アタッカーはいるがどのアタックも拒否されるなら終了できる")
        } finally {
            tollSrc.pop()
        }
    })
    withEffect(entry, () => {
        const s = game("once-own")
        put(s, "p1", HOLDER)
        put(s, "p1", COST1)
        assert(validateEndTurn(s, "p1") === null, "発生源が自分側なら（相手に課す効果なので）自分は縛られない")
    })
    withEffect({ ...entry, turn: "own" }, () => {
        const s = game("once-turn")
        put(s, "p2", HOLDER)
        put(s, "p1", COST1)
        assert(validateEndTurn(s, "p1") === null, "窓が『自分のアタックステップ』（発生源の持ち主のターン）ならこのターンは効かない")
    })
    {
        const s = game("once-none")
        put(s, "p1", COST1)
        assert(validateEndTurn(s, "p1") === null, "効果が無ければ終えられる")
    }
}

console.log("=== 2. mustBeAttackTarget：コスト6以上（ここでは2以上）は発生源を指定してアタックしなければならない ===")
{
    const entry = { kind: "constraint", constraint: { type: "mustBeAttackTarget", attackerMinCost: 2 }, phaseTurn: { phase: "attack", turn: "opponent" } }
    withEffect(entry, () => {
        const s = game("target-1")
        const def = put(s, "p2", HOLDER)
        const other = put(s, "p2", COST1)
        const big = put(s, "p1", COST2)
        const small = put(s, "p1", COST1)
        def.isRested = true
        assert(validateAttack(s, "p1", big.instanceId) !== null, "しきい値ちょうどのコスト：ライフ（指定なし）へのアタックは不可")
        assert(validateAttack(s, "p1", big.instanceId, def.instanceId) === null, "発生源は疲労していても指定できる")
        assert(validateAttack(s, "p1", big.instanceId, other.instanceId) !== null, "発生源以外は指定できない")
        assert(validateAttack(s, "p1", small.instanceId) === null, "コストが足りない個体は従来どおりライフへアタックできる")
        const filter = directAttackFilter(s, "p1", big)
        assert(filter !== null && filter.onlyInstanceIds?.length === 1 && matchesDirectedAttackFilter(filter, def, s, "p2") === null, "共有層：指定できるのは発生源だけ")
        assert(filter !== null && matchesDirectedAttackFilter(filter, other, s, "p2") !== null, "共有層：他のスピリットはハイライトされない")
        assert(directAttackFilter(s, "p1", small) === null, "共有層：しきい値未満は通常アタック")
        const moves = enumerateLegalMoves(s, "p1").filter((m) => m.action.type === "attack")
        assert(moves.some((m) => m.action.type === "attack" && m.action.instanceId === big.instanceId && m.action.targetSpiritInstanceId === def.instanceId), "AI の合法手：指定アタックが出る")
        assert(!moves.some((m) => m.action.type === "attack" && m.action.instanceId === big.instanceId && m.action.targetSpiritInstanceId === undefined), "AI の合法手：ライフへのアタックは出ない")
        assert(act(s, "p1", { type: "attack", instanceId: big.instanceId, targetSpiritInstanceId: def.instanceId }) === null, "指定アタックが成立する")
    })
    withEffect({ ...entry, phaseTurn: { phase: "attack", turn: "own" } }, () => {
        const s = game("target-window")
        put(s, "p2", HOLDER)
        const big = put(s, "p1", COST2)
        assert(validateAttack(s, "p1", big.instanceId) === null, "窓の外（相手のターンのアタックステップでない）なら制限なし")
    })
}

console.log("すべてのチェックに合格しました 🎉（part641）")
