// smoke パート250（BS10白17枚バッチ。2026-08-27）
//
// 新設した機構:
//   - FieldEvent "ownSpiritDeclaredBlock"（自分のスピリットがブロックしたとき。
//     GameEngine.finishBlockDeclarationから発火。BS10-088天貫く塔の城Lv1）
//   - EffectAction "refreshAllOwnByFilter"（filterに一致する自分の疲労スピリットすべてを回復。
//     BS10-088天貫く塔の城Lv2＝「効果の記述を持たない自分のスピリットすべて」）
//   - TargetFilter.lowerBpThanBattleLoser（直前のバトルで破壊された相手より実効BPが低い。
//     BS10-X04月光龍ストライク・ジークヴルム Lv2）
//   - EffectAction "endStepLock"（既存の型・エンジン処理を初めてカードから使う。BS10-108ルナティックシール）
//   - returnAllToHand side:"both"（BS10-038黒槍機ボルヴェルグ：修飾なしの「スピリットすべて」）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { isEndStepLocked, isVanillaCard } from "../../shared/rules"

function setup(seed: string, turnPlayer: PlayerId): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-031").name === "ジャンガリー" && isVanillaCard(getCard("BS10-031")), "ジャンガリーはバニラ")
    assert(getCard("BS10-032").name === "ガドファント", "ガドファント")
    assert(getCard("BS10-088").name === "天貫く塔の城" && getCard("BS10-088").type === "nexus", "天貫く塔の城はネクサス")
    assert(getCard("BS10-108").name === "ルナティックシール" && getCard("BS10-108").type === "magic", "ルナティックシールはマジック")
    assert(getCard("BS10-X04").name === "月光龍ストライク・ジークヴルム", "月光龍ストライク・ジークヴルム")
}

console.log("=== BS10-088天貫く塔の城 Lv1：バニラの自分のスピリットがブロックしたときコアが置かれる ===")
{
    const s = setup("bs10-088-a", "p2")
    const tower = createInstance("BS10-088", s.turn, 2) // Lv2
    s.players.p1.field.nexuses.push(tower)
    const blocker = createInstance("BS10-031", s.turn, 1) // ジャンガリー（バニラ）Lv1
    s.players.p1.field.spirits.push(blocker)
    const attacker = createInstance("BS10-035", s.turn, 1) // 樹氷の女神エイル（効果持ち・攻撃側は無関係）Lv1
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    const coresBefore = blocker.cores
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "バニラのジャンガリーでブロック")
    assert(blocker.cores === coresBefore + 1, "ブロックしたバニラのスピリット上にボイドからコアが置かれる")
}

console.log("=== BS10-088天貫く塔の城 Lv1：効果を持つ自分のスピリットがブロックしてもコアは置かれない（vanillaOnly） ===")
{
    const s = setup("bs10-088-b", "p2")
    const tower = createInstance("BS10-088", s.turn, 2)
    s.players.p1.field.nexuses.push(tower)
    const blocker = createInstance("BS10-032", s.turn, 1) // ガドファント（効果持ち）Lv1
    s.players.p1.field.spirits.push(blocker)
    const attacker = createInstance("BS10-035", s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    const coresBefore = blocker.cores
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "効果持ちのガドファントでブロック")
    assert(blocker.cores === coresBefore, "効果を持つスピリットのブロックではコアが置かれない")
}

console.log("=== BS10-088天貫く塔の城 Lv2：相手がアタックしたとき、バニラの自分のスピリットだけが回復する ===")
{
    const s = setup("bs10-088-c", "p2")
    const tower = createInstance("BS10-088", s.turn, 2) // Lv2
    s.players.p1.field.nexuses.push(tower)
    const vanillaSpirit = createInstance("BS10-031", s.turn, 1) // バニラ
    const nonVanillaSpirit = createInstance("BS10-032", s.turn, 1) // 効果持ち
    s.players.p1.field.spirits.push(vanillaSpirit, nonVanillaSpirit)
    const attacker = createInstance("BS10-035", s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    vanillaSpirit.isRested = true
    nonVanillaSpirit.isRested = true
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(!vanillaSpirit.isRested, "バニラのスピリットは回復する")
    assert(nonVanillaSpirit.isRested === true, "効果を持つスピリットは回復しない")
}

console.log("=== BS10-038黒槍機ボルヴェルグ：召喚時、BP4000以下のスピリットすべてが両陣営とも手札へ戻る ===")
{
    const s = setup("bs10-038", "p1")
    s.phase = "main"
    const p1High = createInstance("BS10-033", s.turn, 1) // BP3000
    const p2Low = createInstance("BS10-031", s.turn, 1) // BP2000
    const p2High = createInstance("BS10-037", s.turn, 3) // Lv2 BP6000
    s.players.p1.field.spirits.push(p1High)
    s.players.p2.field.spirits.push(p2Low, p2High)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p2", p2High) > 4000, "テスト前提: p2Highは4000超")
    assert(effectiveBp(s, "p1", p1High) <= 4000, "テスト前提: p1Highは4000以下")
    s.players.p1.hand[0] = "BS10-038"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ボルヴェルグを召喚")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === p1High.instanceId), "p1のBP4000以下は手札へ戻る")
    assert(s.players.p1.hand.includes("BS10-033"), "p1の手札にノーザンベアードが戻る")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === p2Low.instanceId), "p2のBP4000以下も手札へ戻る（修飾なし＝両陣営）")
    assert(s.players.p2.hand.includes("BS10-031"), "p2の手札にジャンガリーが戻る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === p2High.instanceId), "p2のBP4000超は残る")
}

console.log("=== BS10-X04月光龍ストライク・ジークヴルム Lv2：ブロックで破壊した相手よりBPが低い相手のスピリットだけ手札へ戻る ===")
{
    const s = setup("bs10-x04", "p2")
    const jiek = createInstance("BS10-X04", s.turn, 3) // Lv2 BP8000
    s.players.p1.field.spirits.push(jiek)
    const attacker = createInstance("BS10-031", s.turn, 1) // BP2000。破壊される
    const lower = createInstance("BS10-035", s.turn, 1) // BP1000。破壊された相手より低い→戻る
    const equal = createInstance("BS10-031", s.turn, 1) // BP2000。同値は戻らない
    const higher = createInstance("BS10-033", s.turn, 1) // BP3000。高いので戻らない
    s.players.p2.field.spirits.push(attacker, lower, equal, higher)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", jiek) === 8000, "テスト前提: ジークヴルムはBP8000")
    assert(effectiveBp(s, "p2", attacker) === 2000, "テスト前提: アタッカーはBP2000")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(declareBlock(s, "p1", jiek.instanceId) === null, "ジークヴルムでブロック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === attacker.instanceId), "破壊されたアタッカーは場を離れる")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === lower.instanceId), "破壊された相手よりBPが低いスピリットは手札へ戻る")
    assert(s.players.p2.hand.includes("BS10-035"), "手札に樹氷の女神エイルが戻る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === equal.instanceId), "同じBPのスピリットは戻らない（未満のみ）")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === higher.instanceId), "BPが高いスピリットは戻らない")
}

console.log("=== BS10-108ルナティックシール：メインの封印とフラッシュのBPバフ ===")
{
    const s = setup("bs10-108", "p1")
    s.phase = "main"
    resolveAction(s, "p1", null, { type: "endStepLock", turns: 3, locks: ["attackStep", "deckMill", "lifeChargeFromVoidOrReserve"] })
    assert(s.endStepLocks.length === 1 && s.endStepLocks[0]!.remaining === 3, "エンドステップの封印が3回ぶん積まれる")
    assert(isEndStepLocked(s, "attackStep") === true, "アタックステップが封じられる")
    assert(isEndStepLocked(s, "deckMill") === true, "デッキ破棄が封じられる")
    assert(isEndStepLocked(s, "lifeChargeFromVoidOrReserve") === true, "ライフへのコア移動が封じられる")

    const spirit = createInstance("BS10-031", s.turn, 1) // BP2000
    s.players.p1.field.spirits.push(spirit)
    refreshLevelAsOverrides(s)
    const bpBefore = effectiveBp(s, "p1", spirit)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 3000, anySide: true }, spirit.instanceId)
    assert(effectiveBp(s, "p1", spirit) === bpBefore + 3000, "フラッシュ側：スピリット1体をBP+3000する")
}

console.log("すべてのチェックに合格しました 🎉（part250）")
