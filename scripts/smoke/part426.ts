// smoke パート426（R5：costDiscardNamedThenPeek・millOpponentThenReact・lifeCharge の埋め込みコストを
// pay/sequence/timedEffectと部品1つ（peekOpponentHand・discardSelfChoose.cardName・playerRule.bannedColors:"last"）で書き直す）
// BS09-039探偵ペンタン／BS13-058シユウ／BS11-060雷神砲カノン・アームズ
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { validateSummon } from "../../server/src/logic/RuleValidator"
import { ALL_CARDS, clearBattle } from "../../server/src/logic/GameState"
import { canBlock } from "../../shared/block"

const PENTAN = "BS09-039" // 探偵ペンタン（黄・スピリット）
const SHIYU = "BS13-058" // シユウ（黄・ブレイヴ）
const CANNON_ARMS = "BS11-060" // 雷神砲カノン・アームズ（青・ブレイヴ）
const CHARALOST = "BS09-079" // キャラクターロスト
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(PENTAN).name === "探偵ペンタン" && getCard(PENTAN).type === "spirit", "PENTANは探偵ペンタン")
    assert(getCard(SHIYU).name === "シユウ" && getCard(SHIYU).type === "brave", "SHIYUはシユウ（ブレイヴ）")
    assert(getCard(CANNON_ARMS).name === "雷神砲カノン・アームズ" && getCard(CANNON_ARMS).type === "brave", "CANNON_ARMSは雷神砲カノン・アームズ（ブレイヴ）")
    assert(getCard(CHARALOST).name === "キャラクターロスト", "CHARALOSTはキャラクターロスト")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const PENTAN_ACTION = {
    type: "pay" as const,
    cost: { type: "discardSelfChoose" as const, count: 1, cardName: "キャラクターロスト" },
    then: { type: "peekOpponentHand" as const },
}

console.log("=== ペンタン：名前の違うカードでは払えない ===")
{
    const s = game("pentan-wrong-name")
    s.players.p1.hand = [VANILLA]
    s.players.p2.hand = ["BS09-041"]
    resolveAction(s, "p1", null, PENTAN_ACTION)
    assert(s.players.p1.peekedOpponentCardIds === undefined, "手札に[キャラクターロスト]が無ければ発動しない")
    assert(s.players.p1.hand.length === 1, "手札は破棄されない")
}

console.log("=== ペンタン：相手の手札0なら払わない ===")
{
    const s = game("pentan-no-target")
    s.players.p1.hand = [CHARALOST]
    s.players.p2.hand = []
    resolveAction(s, "p1", null, PENTAN_ACTION)
    assert(s.players.p1.peekedOpponentCardIds === undefined, "相手の手札が無ければ発動しない")
    assert(s.players.p1.hand.includes(CHARALOST), "コストも払われない（COST_MODEL.md §1：両方揃うときだけ）")
}

console.log("=== ペンタン：揃えば払って相手の手札を見る ===")
{
    const s = game("pentan-ok")
    s.players.p1.hand = [CHARALOST]
    s.players.p2.hand = ["BS09-041"]
    resolveAction(s, "p1", null, PENTAN_ACTION)
    assert(!s.players.p1.hand.includes(CHARALOST), "コストとして破棄される")
    assert(s.players.p1.peekedOpponentCardIds?.[0] === "BS09-041", "相手の手札1枚の内容が記録される")
}

const SHIYU_ACTION = {
    type: "pay" as const,
    cost: { type: "mill" as const, side: "own" as const, count: 5 },
    then: {
        type: "sequence" as const,
        actions: [
            { type: "placeCores" as const, from: "void" as const, to: "life" as const, count: 1 },
            {
                type: "timedEffect" as const,
                duration: "battle" as const,
                target: "self" as const,
                content: [{ type: "unblockable" as const, from: { level: [1, 2] } }],
            },
        ],
    },
}

function shiyuGame(seed: string, deckSize: number): { s: GameState; brave: ReturnType<typeof createInstance>; host: ReturnType<typeof createInstance> } {
    const s = game(seed)
    const host = put(s, "p1", "BS13-039", 1) // コスト6
    const brave = createInstance(SHIYU, s.turn, 5)
    brave.braveCombined = true
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.combinedBraves.push(brave)
    s.players.p1.deck = Array.from({ length: deckSize }, () => VANILLA)
    refreshLevelAsOverrides(s)
    return { s, brave, host }
}

console.log("=== シユウ：デッキ4枚以下なら何も起きない ===")
{
    const { s, host } = shiyuGame("shiyu-short-deck", 4)
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", host, SHIYU_ACTION)
    assert(s.players.p1.deck.length === 4, "デッキが払われず残っている")
    assert(s.players.p1.life === lifeBefore, "ライフも増えない")
}

console.log("=== シユウ：5枚ならライフ+1、Lv1/Lv2からブロックされない（Lv3は対象外） ===")
{
    const { s, host } = shiyuGame("shiyu-ok", 5)
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", host, SHIYU_ACTION)
    assert(s.players.p1.deck.length === 0, "デッキ5枚を払う")
    assert(s.players.p1.life === lifeBefore + 1, "ボイドからライフにコア1個")
    const lv1 = createInstance("BS13-034", s.turn, 1) // Lv1
    const lv2 = createInstance("BS13-036", s.turn, 2) // Lv2
    const lv3 = createInstance("BS13-036", s.turn, 3) // Lv3
    s.players.p2.field.spirits.push(lv1, lv2, lv3)
    refreshLevelAsOverrides(s)
    assert(canBlock(s, "p2", lv1, "p1", host) !== null, "Lv1の相手はブロックできない")
    assert(canBlock(s, "p2", lv2, "p1", host) !== null, "Lv2の相手もブロックできない")
    assert(canBlock(s, "p2", lv3, "p1", host) === null, "Lv3からはブロックされる")
}

const CANNON_ARMS_ACTION = {
    type: "sequence" as const,
    actions: [
        { type: "mill" as const, count: 1 },
        {
            type: "timedEffect" as const,
            duration: "battle" as const,
            content: [{ type: "playerRule" as const, rule: { type: "cantUseHandCardsForPid" as const, bannedColors: "last" as const } }],
        },
    ],
}

function cannonArmsGame(seed: string): { s: GameState; atk: ReturnType<typeof createInstance> } {
    const s = game(seed)
    const atk = put(s, "p1", VANILLA, 2)
    s.phase = "attack"
    return { s, atk }
}

console.log("=== カノン・アームズ：破棄した色の手札をこのバトルの間使えない ===")
{
    const { s, atk } = cannonArmsGame("cannon-color")
    const red = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("red") && c.cost === 0)!
    const blue = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("blue") && !c.colors.includes("red") && c.cost === 0)!
    s.players.p2.deck.unshift(red.cardId)
    s.players.p2.hand = [red.cardId, blue.cardId]
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（バトル成立）")
    resolveAction(s, "p1", null, CANNON_ARMS_ACTION)
    assert(s.players.p2.trashCards.includes(red.cardId), "デッキ上から1枚破棄される")
    const BAN = "効果により、このカードは使えません"
    assert(validateSummon(s, "p2", 0) === BAN, "破棄した色（赤）の手札は使えない")
    assert(validateSummon(s, "p2", 1) !== BAN, "違う色の手札は制限を受けない")
}

console.log("=== カノン・アームズ：多色カードを破棄したら全色が使えなくなる ===")
{
    const { s, atk } = cannonArmsGame("cannon-multicolor")
    const multi = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length >= 2)!
    const other = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && !multi.colors.includes(c.colors[0]!))!
    s.players.p2.deck.unshift(multi.cardId)
    s.players.p2.hand = [multi.cardId, other.cardId]
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（バトル成立）")
    resolveAction(s, "p1", null, CANNON_ARMS_ACTION)
    const BAN = "効果により、このカードは使えません"
    assert(validateSummon(s, "p2", 0) === BAN, "多色カードを破棄したら、その色の1つを持つカードは使えない")
    assert(validateSummon(s, "p2", 1) !== BAN, "破棄したカードの色を1つも持たないカードは制限を受けない")
}

console.log("=== カノン・アームズ：バトル後は使える ===")
{
    const { s, atk } = cannonArmsGame("cannon-after-battle")
    const red = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("red") && c.cost === 0)!
    s.players.p2.deck.unshift(red.cardId)
    s.players.p2.hand = [red.cardId]
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（バトル成立）")
    resolveAction(s, "p1", null, CANNON_ARMS_ACTION)
    const BAN = "効果により、このカードは使えません"
    assert(validateSummon(s, "p2", 0) === BAN, "バトル中は使えない")
    clearBattle(s) // until:"battle" の記録はここで消える
    assert(validateSummon(s, "p2", 0) !== BAN, "バトルが終われば使える")
}

console.log("=== カノン・アームズ：デッキ0枚なら何も置かない ===")
{
    const { s, atk } = cannonArmsGame("cannon-empty-deck")
    s.players.p2.deck = []
    const blue = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("blue"))!
    s.players.p2.hand = [blue.cardId]
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言（バトル成立）")
    resolveAction(s, "p1", null, CANNON_ARMS_ACTION)
    const BAN = "効果により、このカードは使えません"
    assert(validateSummon(s, "p2", 0) !== BAN, "デッキ0枚なら制約が置かれない")
}

console.log("すべてのチェックに合格しました 🎉（part426）")
