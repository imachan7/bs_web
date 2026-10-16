// smoke パート607（部品バッチ6：declare level／TimedContent effectsDisabled／IfCond opponentMainStepNow／symbolWhenSummoning のブレイヴ対応）
import {
    assert,
    createGame,
    createInstance,
    effectiveCost,
    endTurn,
    getCard,
    giveTimed,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン（ブレイヴ・赤・コスト3・軽減赤赤）
const SPIRIT = "BS01-010" // チャクラムバット（赤・軽減赤赤）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
    assert(getCard(BRAVE).name === "剣鎧竜バスター・ドラゴン" && getCard(BRAVE).type === "brave", "BRAVEはブレイヴ")
    assert(getCard(SPIRIT).name === "チャクラムバット" && getCard(SPIRIT).type === "spirit", "SPIRITはチャクラムバット")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const DISABLE: EffectAction = {
    type: "declare",
    what: "level",
    options: [1, 2, 3, 4, 5],
    then: { type: "timedEffect", content: [{ type: "effectsDisabled" }], duration: "turn", all: true, filter: { declared: "match" } },
}

function declareLevel(lv: number): EffectAction {
    return { ...(DISABLE as object), picked: { p1: lv } } as EffectAction
}

console.log("=== 1. declare level：宣言した Lv の相手スピリットだけが効果を失う ===")
{
    const s = game("lv1")
    // 相手に Lv1（コア1）と Lv2（コア3）のスピリットを置く
    const cand = getCard(SPIRIT)
    const lv2Cores = cand.levels.find((l) => l.level === 2)!.cores
    const a = put(s, "p2", SPIRIT, 1)
    const b = put(s, "p2", SPIRIT, lv2Cores)
    resolveAction(s, "p1", null, declareLevel(2))
    refreshLevelAsOverrides(s)
    const timed = s.timedEffects.filter((r) => r.content.some((c) => c.type === "effectsDisabled"))
    assert(timed.length === 1, "期間つき効果が1件記録される")
    assert(a.timedEffectsDisabled !== true, "Lv1 は効果を失わない")
    assert(b.timedEffectsDisabled === true, "Lv2 は効果を失う")
}

console.log("=== 2. effectsDisabled：付与キーワードも失い、後から出た該当 Lv も失い、ターン終了で戻る ===")
{
    const s = game("lv2")
    const lv2Cores = getCard(SPIRIT).levels.find((l) => l.level === 2)!.cores
    const victim = put(s, "p2", VANILLA, 1)
    // 事前: 継続付与のキーワード（timedEffect keyword）を持たせる
    giveTimed(s, victim, { type: "keyword", keyword: "jugeki" })
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p2", victim, "jugeki"), "（前提）付与したキーワードは効果を失う前は有効")
    resolveAction(s, "p1", null, declareLevel(1))
    refreshLevelAsOverrides(s)
    assert(victim.timedEffectsDisabled === true, "Lv1 の個体が効果を失う")
    assert(spiritHasKeyword(s, "p2", victim, "jugeki") === false, "付与されていたキーワードも発揮しない")
    // 後から出た Lv1 のスピリットにも効く
    const late = put(s, "p2", VANILLA, 1)
    assert(late.timedEffectsDisabled === true, "後から出た該当 Lvのスピリットも失う")
    // 違う Lv（Lv2）で出た個体は失わない
    const other = put(s, "p2", SPIRIT, lv2Cores)
    assert(other.timedEffectsDisabled !== true, "Lv2 の個体は失わない")
    // 自分側（宣言者）には効かない
    const mine = put(s, "p1", VANILLA, 1)
    assert(mine.timedEffectsDisabled !== true, "自分のスピリットは失わない")
    endTurn(s)
    refreshLevelAsOverrides(s)
    assert(victim.timedEffectsDisabled !== true && late.timedEffectsDisabled !== true, "ターンが終われば戻る")
}

console.log("=== 3. IfCond opponentMainStepNow ===")
{
    const act: EffectAction = { type: "if", cond: { opponentMainStepNow: true }, then: { type: "draw", count: 1 } } as unknown as EffectAction
    const hand = (s: GameState): number => s.players.p1.hand.length
    const s1 = game("if1")
    s1.turnPlayer = "p2"
    s1.phase = "main"
    const h1 = hand(s1)
    resolveAction(s1, "p1", null, act)
    assert(hand(s1) === h1 + 1, "相手のメインステップなら then")
    const s2 = game("if2")
    s2.turnPlayer = "p1"
    s2.phase = "main"
    const h2 = hand(s2)
    resolveAction(s2, "p1", null, act)
    assert(hand(s2) === h2, "自分のメインステップなら then しない")
    const s3 = game("if3")
    s3.turnPlayer = "p2"
    s3.phase = "attack"
    const h3 = hand(s3)
    resolveAction(s3, "p1", null, act)
    assert(hand(s3) === h3, "相手のアタックステップなら then しない")
}

console.log("=== 4. symbolWhenSummoning：pick.cardType:brave でブレイヴの召喚だけが軽くなる ===")
{
    const s = game("sym")
    const src = put(s, "p1", VANILLA, 1)
    const srcCard = getCard(src.cardId)
    const saved = srcCard.effects
    const brave = getCard(BRAVE)
    const spirit = getCard(SPIRIT)
    const baseBrave = effectiveCost(s, "p1", brave)
    const baseSpirit = effectiveCost(s, "p1", spirit)
    srcCard.effects = [...saved, { kind: "symbolWhenSummoning", color: "red", levels: null, pick: { cardType: "brave" } } as never]
    try {
        assert(effectiveCost(s, "p1", brave) === baseBrave - 1, "ブレイヴの召喚コストが1軽くなる")
        assert(effectiveCost(s, "p1", spirit) === baseSpirit, "スピリットの召喚は変わらない")
        srcCard.effects = [...saved, { kind: "symbolWhenSummoning", color: "red", levels: null } as never]
        assert(effectiveCost(s, "p1", brave) === baseBrave, "pick なしのエントリはブレイヴに効かない（従来どおりスピリットのみ）")
        assert(effectiveCost(s, "p1", spirit) === baseSpirit - 1, "pick なしのエントリはスピリットに効く")
    } finally {
        srcCard.effects = saved
    }
}

console.log("すべてのチェックに合格しました 🎉（part607）")
