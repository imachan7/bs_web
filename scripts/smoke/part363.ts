// smoke パート363（timedEffect の1体指定BP：旧bpBuffの単純形からの変換一致・可変量・battle寿命・
// 古代闘技場の発揮時抑止・対話選択・新設4カウンタの一致を確かめる。設計はHANDOFF.md§1参照）
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS, clearBattle } from "../../server/src/logic/GameState"
import { countEffectCounter } from "../../server/src/logic/EffectModules"
import { countedAmount } from "../../server/src/logic/counted"
import { countAuraCounter } from "../../shared/rules"
import type { EffectAction } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const ARENA = "BS04-086" // 古代闘技場（青・ネクサス）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはコスト1のバニラスピリット")
    assert(getCard(ARENA).name === "古代闘技場" && getCard(ARENA).type === "nexus", "ARENAは古代闘技場（ネクサス）")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

type BpBuffAction = Extract<EffectAction, { type: "bpBuff" }>

// 対象外キー（コスト・特殊な量決定を伴うもの。COST_MODEL.md）：これらを持つbpBuffは変換対象から外す
const EXCLUDED_KEYS = [
    "costReturnSelfToHand",
    "costDiscardOwnBurst",
    "costMillSelfCount",
    "thenRefreshIfMilledFamily",
    "costExhaustFamily",
    "amountFromExhaustedCost",
    "costSacrificeChosen",
    "amountFromSelfBp",
    "extraPerCoreToTrash",
    "thenAddSymbolThisBattle",
    "boostTargetInstanceId",
]

// data/cards/*.json のbpBuffアクションを深さ優先で列挙する（sequence等にネストしていても拾う）
function collectBpBuff(): { cardId: string; cardName: string; action: BpBuffAction }[] {
    const results: { cardId: string; cardName: string; action: BpBuffAction }[] = []
    function walk(node: unknown, cardId: string, cardName: string): void {
        if (node === null || typeof node !== "object") return
        if (Array.isArray(node)) {
            for (const x of node) walk(x, cardId, cardName)
            return
        }
        const obj = node as Record<string, unknown>
        if (obj.type === "bpBuff") results.push({ cardId, cardName, action: obj as unknown as BpBuffAction })
        for (const k of Object.keys(obj)) walk(obj[k], cardId, cardName)
    }
    for (const c of ALL_CARDS) walk(c.effects, c.cardId, c.name)
    return results
}

// 確定済みスキーマ：旧bpBuffの単純形 → 新timedEffectへの変換
function toTimedEffect(old: BpBuffAction): EffectAction {
    return {
        type: "timedEffect",
        content: [{ type: "bp", amount: old.amount, ...(old.amountCounter !== undefined ? { amountCounter: old.amountCounter } : {}) }],
        duration: old.scope === "battle" ? "battle" : "turn",
        side: old.anySide ? "both" : "own",
        ...(old.filter !== undefined ? { filter: old.filter } : {}),
    }
}

// カードデータはすでに timedEffect へ移してあるので、データの1体指定 BP から旧 bpBuff を組み立て直して比べる
function collectMigrated(): { cardId: string; cardName: string; action: BpBuffAction; now: EffectAction }[] {
    const results: { cardId: string; cardName: string; action: BpBuffAction; now: EffectAction }[] = []
    function walk(node: unknown, cardId: string, cardName: string): void {
        if (node === null || typeof node !== "object") return
        if (Array.isArray(node)) {
            for (const x of node) walk(x, cardId, cardName)
            return
        }
        const obj = node as Record<string, unknown>
        const content = obj.content as { type: string; amount: number; amountCounter?: unknown }[] | undefined
        if (obj.type === "timedEffect" && obj.all === undefined && obj.target === undefined && content?.length === 1 && content[0]!.type === "bp") {
            const bp = content[0]!
            const old = {
                type: "bpBuff",
                amount: bp.amount,
                ...(bp.amountCounter !== undefined ? { amountCounter: bp.amountCounter } : {}),
                ...(obj.duration === "battle" ? { scope: "battle" } : {}),
                ...(obj.side === "both" ? { anySide: true } : {}),
                ...(obj.filter !== undefined ? { filter: obj.filter } : {}),
            } as unknown as BpBuffAction
            results.push({ cardId, cardName, action: old, now: obj as unknown as EffectAction })
        }
        for (const k of Object.keys(obj)) walk(obj[k], cardId, cardName)
    }
    for (const c of ALL_CARDS) walk(c.effects, c.cardId, c.name)
    return results
}

const candidates = collectMigrated()
assert(candidates.length === 148, `移行したカードデータの1体指定 BP は148件（フェネボラック・キマイラ・デブリは「このスピリット」へ移した）（実際: ${candidates.length}）`)
assert(
    candidates.every(({ action, now }) => JSON.stringify(toTimedEffect(action)) === JSON.stringify(now)),
    "データの書き方は確定スキーマの変換どおり",
)
assert(collectBpBuff().every(({ action }) => Object.keys(action).some((k) => EXCLUDED_KEYS.includes(k))), "旧 bpBuff に残るのはオプション付きだけ")

console.log(`=== 1. 新旧一致：対象外を除く全${candidates.length}件 ===`)
{
    let checked = 0
    let mismatches = 0
    for (const { cardId, cardName, action, now } of candidates) {
        for (const withTarget of [false, true] as const) {
            for (const battling of [false, true] as const) {
                if (battling && withTarget) continue // battling優先の検証はtargetInstanceId無指定のときだけ意味がある
                const sOld = game(`bpbuff-${cardId}-${withTarget}-${battling}-old`)
                const sNew = game(`bpbuff-${cardId}-${withTarget}-${battling}-new`)
                const selfOld = put(sOld, "p1", VANILLA, 1)
                const selfNew = put(sNew, "p1", VANILLA, 1)
                const t1Old = put(sOld, "p1", VANILLA, 1)
                const t1New = put(sNew, "p1", VANILLA, 1)
                const t2Old = put(sOld, "p2", VANILLA, 1)
                const t2New = put(sNew, "p2", VANILLA, 1)
                if (battling) {
                    sOld.battle = { attackerInstanceId: t1Old.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
                    sNew.battle = { attackerInstanceId: t1New.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
                }
                resolveAction(sOld, "p1", selfOld, action, withTarget ? t1Old.instanceId : undefined)
                resolveAction(sNew, "p1", selfNew, now, withTarget ? t1New.instanceId : undefined)
                checked++
                const bpOld = [selfOld, t1Old, t2Old].map((i) => effectiveBp(sOld, "p1", i))
                const bpNew = [selfNew, t1New, t2New].map((i) => effectiveBp(sNew, "p1", i))
                const posOf = (id: string | undefined, self: typeof selfOld, t1: typeof t1Old, t2: typeof t2Old) =>
                    id === self.instanceId ? "self" : id === t1.instanceId ? "t1" : id === t2.instanceId ? "t2" : id === undefined ? "none" : "?"
                const posOld = posOf(sOld.lastBpBuffTargetId, selfOld, t1Old, t2Old)
                const posNew = posOf(sNew.lastBpBuffTargetId, selfNew, t1New, t2New)
                if (JSON.stringify(bpOld) !== JSON.stringify(bpNew) || posOld !== posNew) {
                    mismatches++
                    console.log(
                        `不一致: ${cardId} ${cardName} withTarget=${withTarget} battling=${battling} bpOld=${JSON.stringify(bpOld)} bpNew=${JSON.stringify(bpNew)} posOld=${posOld} posNew=${posNew}`,
                    )
                }
            }
        }
    }
    console.log(`新旧一致チェック：${checked}件中 不一致${mismatches}件`)
    assert(mismatches === 0, "旧bpBuffと新timedEffectの単純形は同じ結果になる")
}

console.log("=== 2. 可変：exhaustedEnemisで相手の疲労数に応じて増減 ===")
{
    const s = game("variable1")
    const self = put(s, "p1", VANILLA, 1)
    const target = put(s, "p1", VANILLA, 1)
    const e1 = put(s, "p2", VANILLA, 1)
    const e2 = put(s, "p2", VANILLA, 1)
    const before = effectiveBp(s, "p1", target)
    const action: EffectAction = {
        type: "timedEffect",
        content: [{ type: "bp", amount: 1000, amountCounter: "exhaustedEnemies" }],
        duration: "turn",
        side: "own",
    }
    resolveAction(s, "p1", self, action, target.instanceId)
    assert(effectiveBp(s, "p1", target) === before, "疲労0体なら+0")
    e1.isRested = true
    assert(effectiveBp(s, "p1", target) === before + 1000, "疲労1体になったら+1000（計算のたびに数え直す）")
    e2.isRested = true
    assert(effectiveBp(s, "p1", target) === before + 2000, "疲労2体になったら+2000")
}

console.log("=== 3. battle：clearBattleで戻る（固定・可変の両方） ===")
{
    const s = game("battle1")
    const self = put(s, "p1", VANILLA, 1)
    const fixedTarget = put(s, "p1", VANILLA, 1)
    const varTarget = put(s, "p1", VANILLA, 1)
    const enemy = put(s, "p2", VANILLA, 1)
    const beforeFixed = effectiveBp(s, "p1", fixedTarget)
    const beforeVar = effectiveBp(s, "p1", varTarget)
    resolveAction(s, "p1", self, { type: "timedEffect", content: [{ type: "bp", amount: 500 }], duration: "battle", side: "own" }, fixedTarget.instanceId)
    resolveAction(
        s,
        "p1",
        self,
        { type: "timedEffect", content: [{ type: "bp", amount: 500, amountCounter: "exhaustedEnemies" }], duration: "battle", side: "own" },
        varTarget.instanceId,
    )
    enemy.isRested = true
    assert(effectiveBp(s, "p1", fixedTarget) === beforeFixed + 500, "battle固定：即時+500")
    assert(effectiveBp(s, "p1", varTarget) === beforeVar + 500, "battle可変：疲労1体で+500")
    clearBattle(s)
    assert(effectiveBp(s, "p1", fixedTarget) === beforeFixed, "clearBattle後：固定は戻る")
    assert(effectiveBp(s, "p1", varTarget) === beforeVar, "clearBattle後：可変も戻る")
}

console.log("=== 4. 古代闘技場：発揮時だけ抑止を見る ===")
{
    // (a) 発揮時に抑止が効いていれば乗らない
    const sA = game("arena-a")
    putNexus(sA, "p2", ARENA, 0)
    sA.turnPlayer = "p2"
    sA.phase = "attack"
    const selfA = put(sA, "p1", VANILLA, 1)
    const targetA = put(sA, "p1", VANILLA, 1)
    const beforeA = effectiveBp(sA, "p1", targetA)
    resolveAction(sA, "p1", selfA, { type: "timedEffect", content: [{ type: "bp", amount: 1000 }], duration: "turn", side: "own" }, targetA.instanceId)
    assert(effectiveBp(sA, "p1", targetA) === beforeA, "抑止が効いている間はBP+が発揮されない")

    // (b) 発揮後に抑止が効き始めても残る
    const sB = game("arena-b")
    const selfB = put(sB, "p1", VANILLA, 1)
    const targetB = put(sB, "p1", VANILLA, 1)
    const beforeB = effectiveBp(sB, "p1", targetB)
    resolveAction(sB, "p1", selfB, { type: "timedEffect", content: [{ type: "bp", amount: 1000 }], duration: "turn", side: "own" }, targetB.instanceId)
    assert(effectiveBp(sB, "p1", targetB) === beforeB + 1000, "発揮した直後はBP+が乗る")
    putNexus(sB, "p2", ARENA, 0)
    sB.turnPlayer = "p2"
    sB.phase = "attack"
    assert(effectiveBp(sB, "p1", targetB) === beforeB + 1000, "発揮後に抑止が効き始めても、既に乗ったBP+は残る")
}

console.log('=== 5. 対話：side:"both"で候補2体以上ならpendingChoiceが立つ ===')
{
    const s = game("interactive1", true)
    const self = put(s, "p1", VANILLA, 1)
    const own = put(s, "p1", VANILLA, 1)
    const enemy = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", self, { type: "timedEffect", content: [{ type: "bp", amount: 1000 }], duration: "turn", side: "both" }, undefined)
    assert(s.pendingChoice !== null, "候補2体以上でpendingChoiceが立つ")
    // filter無指定なのでself/own/enemyの3体すべてが候補（旧bpBuffのanySideと同じくpickAnySideCandidatesはselfを除外しない）
    assert(s.pendingChoice?.candidates.length === 3, "self/own/enemyの3体が候補")
    const before = effectiveBp(s, "p1", enemy)
    act(s, "p1", { type: "resolveChoice", instanceId: enemy.instanceId })
    assert(s.pendingChoice === null, "選択で解消される")
    assert(effectiveBp(s, "p1", enemy) === before + 1000, "選んだ個体にBP+が乗る")
    void own
}

console.log("=== 6. 新設4カウンタがサーバーの既存の数え方と一致する ===")
{
    const s = game("counters1")
    const target = put(s, "p1", VANILLA, 1)
    put(s, "p1", VANILLA, 1)
    const e1 = put(s, "p2", VANILLA, 1)
    e1.isRested = true
    put(s, "p2", VANILLA, 1)
    const n1 = putNexus(s, "p1", ARENA, 0)
    n1.isRested = true
    putNexus(s, "p1", ARENA, 0)

    assert(
        countAuraCounter(s, "p1", "exhaustedEnemies", target) === countEffectCounter(s, "p1", null, "exhaustedEnemies", undefined),
        "exhaustedEnemies：AuraCounter版とEffectCounter版が一致",
    )
    assert(
        countAuraCounter(s, "p1", "ownRestedNexuses", target) === countEffectCounter(s, "p1", null, "ownRestedNexuses", undefined),
        "ownRestedNexuses：AuraCounter版とEffectCounter版が一致",
    )
    assert(
        countAuraCounter(s, "p1", "targetSymbols", target) === countedAmount(s, "p1", null, 1, "targetSymbols", undefined, undefined, target),
        "targetSymbols：AuraCounter版とcounted.ts版が一致",
    )
    assert(
        countAuraCounter(s, "p1", "targetSameFamilyOwn", target) === countedAmount(s, "p1", null, 1, "targetSameFamilyOwn", undefined, undefined, target),
        "targetSameFamilyOwn：AuraCounter版とcounted.ts版が一致",
    )
}

console.log("すべてのチェックに合格しました 🎉（part363）")
