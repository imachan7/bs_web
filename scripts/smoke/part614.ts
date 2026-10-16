// smoke パート614（lifeDamageReplace：相手のライフを段階表の個数までリザーブへ置く置換。BS17-051・X06の器）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectAction, EffectDef } from "../../server/src/type"

const SRC = "BS01-001" // ゴラドン（爬獣・バニラ）
const ROKU = "BS01-002" // ロクケラトプス（地竜・バニラ）
const AIBAN = "BS01-005" // アイバーン（翼竜・バニラ）
const FRUIT = "BS01-107" // fieldEvent ownLifeDamaged で1ドローするネクサス

const downTo = (n: number): EffectAction => ({ type: "removeCores", side: "opponent", from: ["life"], to: "reserve", downTo: n, count: 0 })
const TABLE: EffectAction = {
    type: "if",
    cond: { count: "opponentLife", atLeast: 7 },
    then: downTo(4),
    else: {
        type: "if",
        cond: { count: "opponentLife", atLeast: 5 },
        then: downTo(3),
        else: { type: "if", cond: { count: "opponentLife", atLeast: 4 }, then: downTo(2) },
    },
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SRC).name === "ゴラドン" && getCard(SRC).family.includes("爬獣"), "SRCはゴラドン（爬獣）")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).family.includes("地竜"), "ROKUは地竜")
    assert(getCard(AIBAN).name === "アイバーン" && getCard(AIBAN).family.includes("翼竜"), "AIBANは翼竜")
    assert(getCard(FRUIT).type === "nexus", "FRUITはネクサス")
}

const saved = new Map<string, EffectDef[]>()
function setEffects(cardId: string, effects: EffectDef[]): void {
    const card = getCard(cardId)
    if (!saved.has(cardId)) saved.set(cardId, card.effects)
    card.effects = effects
}
function restore(): void {
    for (const [id, e] of saved) getCard(id).effects = e
    saved.clear()
}
const selfRule: EffectDef = { id: "t-self", kind: "lifeDamageReplace", levels: null, target: "self", action: TABLE }
const allRule: EffectDef = {
    id: "t-all",
    kind: "lifeDamageReplace",
    levels: null,
    target: "ownAll",
    familyFilter: ["地竜"],
    phaseTurn: { phase: "attack", turn: "own" },
    action: TABLE,
}

function game(seed: string, oppLife: number, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p2.life = oppLife
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string) {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function attack(s: GameState, id: string): void {
    assert(handleAction(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(handleAction(s, "p1", { type: "attack", instanceId: id }) === null, "アタック宣言")
    while (s.isFlashTiming && s.battle) assert(handleAction(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュを閉じる")
}
const takeLife = (s: GameState) => handleAction(s, "p2", { type: "takeLife" })

try {
    console.log("=== 1. self：相手ライフ7→4（確認に答える）。コア3個は相手のリザーブへ、ライフ減少の後続も通る ===")
    {
        setEffects(ROKU, [selfRule])
        const s = game("c1", 7, true)
        const a = put(s, "p1", ROKU)
        s.players.p2.field.nexuses.push(createInstance(FRUIT, s.turn, 1))
        const handBefore = s.players.p2.hand.length
        attack(s, a.instanceId)
        assert(takeLife(s) === null, "ライフで受ける")
        assert(s.pendingChoice?.confirm === true && s.pendingChoice.pid === "p1", "アタック側に確認が出る")
        assert(handleAction(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "置換を選ぶ")
        assert(s.players.p2.life === 4, "ライフは4")
        assert(s.players.p2.reserve === 13, "コア3個が相手のリザーブへ")
        assert(s.players.p2.hand.length === handBefore + 1, "ownLifeDamaged が誘発した")
        assert(s.events.some((e) => e.type === "lifeDamage" && e.amount === 3), "ライフ減少のイベント")
        assert(s.battle === null && s.pendingChoice === null, "バトルが片付く")
    }
    console.log("=== 2. 相手ライフ5→3、4→2、3は確認なしで通常の1減少 ===")
    for (const [from, to] of [[5, 3], [4, 2], [6, 3]] as const) {
        setEffects(ROKU, [selfRule])
        const s = game(`c2-${from}`, from, true)
        const a = put(s, "p1", ROKU)
        attack(s, a.instanceId)
        takeLife(s)
        assert(handleAction(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, `ライフ${from}で置換を選ぶ`)
        assert(s.players.p2.life === to, `ライフ${from}→${to}`)
    }
    {
        setEffects(ROKU, [selfRule])
        const s = game("c2-3", 3, true)
        const a = put(s, "p1", ROKU)
        attack(s, a.instanceId)
        assert(takeLife(s) === null, "ライフで受ける")
        assert(s.pendingChoice === null, "ライフ3では確認が出ない")
        assert(s.players.p2.life === 2 && s.players.p2.reserve === 11, "通常どおり1減ってリザーブへ")
    }
    console.log("=== 3. 置換を選ばない → 通常どおり1減る ===")
    {
        setEffects(ROKU, [selfRule])
        const s = game("c3", 7, true)
        const a = put(s, "p1", ROKU)
        attack(s, a.instanceId)
        takeLife(s)
        assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "断る")
        assert(s.players.p2.life === 6 && s.players.p2.reserve === 11, "通常の減少")
        assert(s.battle === null && s.pendingChoice === null, "バトルが片付く")
    }
    console.log("=== 4. ブロックされた → 何も起きない ===")
    {
        setEffects(ROKU, [selfRule])
        const s = game("c4", 7, true)
        const a = put(s, "p1", ROKU)
        const blocker = put(s, "p2", AIBAN)
        attack(s, a.instanceId)
        assert(handleAction(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロック")
        while (s.isFlashTiming && s.battle) handleAction(s, s.priorityPlayer, { type: "pass" })
        assert(s.pendingChoice === null && s.players.p2.life === 7, "確認なし・ライフは減らない")
    }
    console.log("=== 5. ownAll＋familyFilter＋自分のアタックステップ ===")
    {
        setEffects(SRC, [allRule])
        const s = game("c5a", 7, true)
        put(s, "p1", SRC)
        const a = put(s, "p1", ROKU)
        attack(s, a.instanceId)
        takeLife(s)
        assert(s.pendingChoice?.confirm === true, "系統が合う地竜のアタックには確認が出る")
        handleAction(s, "p1", { type: "resolveChoice", option: "発動する" })
        assert(s.players.p2.life === 4, "地竜のアタックで7→4")

        const t = game("c5b", 7, true)
        put(t, "p1", SRC)
        const b = put(t, "p1", AIBAN)
        attack(t, b.instanceId)
        takeLife(t)
        assert(t.pendingChoice === null && t.players.p2.life === 6, "系統が合わない翼竜には出ない")
    }
    console.log("=== 6. 非対話：自動で置換する（減る数が最大の候補） ===")
    {
        setEffects(ROKU, [selfRule])
        setEffects(SRC, [allRule])
        const s = game("c6", 7, false)
        put(s, "p1", SRC)
        const a = put(s, "p1", ROKU)
        attack(s, a.instanceId)
        assert(takeLife(s) === null, "ライフで受ける")
        assert(s.players.p2.life === 4 && s.players.p2.reserve === 13, "非対話は置換を選ぶ（7→4）")
    }
} finally {
    restore()
}

console.log("すべてのチェックに合格しました 🎉（part614）")
