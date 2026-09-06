// smoke パート288（BS12 バッチ1・赤：designateAttackTarget／lifeCoresBySymbolDiff／symbolAddGrant／
// byOpponentEffectOnly（ownSpiritExhausted）／removeOneOfAnyType の types 絞り込み）
import { assert, act, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { instanceSymbolCount, countSymbols } from "../../shared/rules"
import { exhaustSpirit } from "../../server/src/logic/EffectModules"

const CASTLE = "BS12-008" // グランド・ドラグキャッスル（赤・指定アタック）
const ARMOR_RED = "BS02-040" // ロブスターク（【装甲：赤】Lv2 cores4 bp6000）
const VANILLA = "BS01-001" // ゴラドン：キーワードなし
const TAURUS = "BS12-X01" // 金牛龍神ドラゴニック・タウラス
const BS12006 = "BS12-006" // 竜拳士アルディ・バロン（symbolAddGrant）
const BS12062 = "BS12-062" // 白煙の大山脈（byOpponentEffectOnly）
const BS12003 = "BS12-003" // 鎧竜人ガストン（removeOneOfAnyType types/maxBpFromSelf）
const NO_SYMBOL_BRAVE = "BS12-050" // 突機竜アーケランサー（symbol: []。スピリット状態のブレイヴとして使う）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A designateAttackTarget：最もBPの高い相手を指定し、疲労状態でも自動でブロックさせる ===")
{
    const s = game("designate-basic")
    const attacker = createInstance(CASTLE, s.turn, 1) // Lv1
    const strong = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000（キーワードなし）
    strong.isRested = true // 疲労状態でも指定できる
    const weak = createInstance("BS01-002", s.turn, 1) // ロクケラトプスLv1 BP1000
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(strong, weak)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "指定アタック持ちでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了→自動ブロック確定）")
    assert(s.battle?.blockerInstanceId === strong.instanceId, "最もBPの高い相手が自動でブロッカーになる")
    assert(strong.isRested === true, "疲労状態のまま強制ブロックする（validateBlockの疲労チェックを通さない）")
}

console.log("=== §B designateAttackTarget：装甲持ちは指定候補から除外される ===")
{
    const s = game("designate-armor")
    const attacker = createInstance(CASTLE, s.turn, 1)
    const armored = createInstance(ARMOR_RED, s.turn, 4) // Lv2 BP6000・【装甲：赤】
    const plain = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(armored, plain)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "指定アタック持ちでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.battle?.blockerInstanceId === plain.instanceId, "【装甲：赤】持ちは除外され、次点のスピリットが指定される")
}

console.log("=== §C designateAttackTarget：指定先が場を離れたら通常のアタックに戻る ===")
{
    const s = game("designate-gone")
    const attacker = createInstance(CASTLE, s.turn, 1)
    const only = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(only)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "指定アタック持ちでアタック")
    assert(s.battle?.designatedBlockerInstanceId === only.instanceId, "この時点では指定されている")
    // フラッシュ①の間に指定先が場を離れる
    s.players.p2.field.spirits = []
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.battle?.blockerInstanceId === null, "指定先が消えたので自動ブロックは成立しない（通常のアタックに戻る）")
    assert(s.battle !== null, "バトル自体は続いている（防御側のブロック/ライフ受け待ち）")
}

console.log("=== §D symbolAddGrant：盤面のシンボル数に効く（軽減にもライフダメージにも） ===")
{
    const s = game("symbol-add")
    const source = createInstance(BS12006, s.turn, 1) // Lv1
    const brave = createInstance(NO_SYMBOL_BRAVE, s.turn, 1) // スピリット状態のブレイヴ・シンボル0（Lv1）
    s.players.p1.field.spirits.push(source, brave)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(brave) === 1, "自分のアタックステップ中、シンボル0のスピリット状態のブレイヴに赤シンボル1つが追加される")
    assert(countSymbols(s.players.p1, ["red"]) >= 1, "countSymbols（軽減計算）にも追加分が反映される")
    // 自分のアタックステップでなければ追加されない
    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(brave) === 0, "メインステップでは追加されない（phaseTurn条件）")
}

console.log("=== §E lifeCoresBySymbolDiff：シンボル数の差ぶんライフのコアが相手のリザーブへ ===")
{
    const s = game("symbol-diff")
    const attacker = createInstance(TAURUS, s.turn, 3) // Lv2 シンボル1（赤1つ）
    const blocker = createInstance(NO_SYMBOL_BRAVE, s.turn, 1) // シンボル0（Lv1）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "タウラスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "シンボル0のブレイヴでブロック宣言")
    assert(s.players.p2.life === lifeBefore - 1, "シンボル差1ぶんライフのコアが減る")
    assert(s.players.p2.reserve === reserveBefore + 1, "減ったコアは相手のリザーブへ置かれる")
}

console.log("=== §F byOpponentEffectOnly：ownSpiritExhaustedはネクサスの効果による疲労では発火しない ===")
{
    const s = game("exhaust-by-opponent")
    const mountain = createInstance(BS12062, s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(mountain)
    const mySpirit = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000
    s.players.p1.field.spirits.push(mySpirit)
    const enemy = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    // 相手の「ネクサス」の効果で疲労した場合は発火しない
    exhaustSpirit(s, "p1", mySpirit, undefined, "p2", "nexus")
    assert(s.players.p2.field.spirits.length === 1, "ネクサスの効果による疲労では白煙の大山脈は発火しない")
    mySpirit.isRested = false
    // 相手の「スピリット」の効果で疲労した場合は発火する
    exhaustSpirit(s, "p1", mySpirit, undefined, "p2", "spirit")
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリット/ブレイヴ/マジックの効果による疲労では発火する（BP以下の相手を破壊）")
}

console.log("=== §G removeOneOfAnyType：types絞り込みとmaxBpFromSelf ===")
{
    const s = game("remove-any-type")
    const gaston = createInstance(BS12003, s.turn, 1) // Lv1 BP3000
    s.players.p1.field.spirits.push(gaston)
    const strongEnemy = createInstance(ARMOR_RED, s.turn, 4) // BP6000（gastonのBPより高い→対象外）
    const weakEnemy = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000（gaston以下→対象）
    const nexus = createInstance("BS01-098", s.turn, 0) // 適当なネクサス（typesにnexusを含まないので対象外）
    s.players.p2.field.spirits.push(strongEnemy, weakEnemy)
    s.players.p2.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", gaston, {
        type: "removeOneOfAnyType",
        mode: "destroy",
        types: ["spirit", "brave"],
        maxBpFromSelf: true,
    })
    assert(s.players.p2.field.spirits.length === 1 && s.players.p2.field.spirits[0]!.instanceId === strongEnemy.instanceId, "自身のBP以下の相手のみが対象（BPが高い方は残る）")
    assert(s.players.p2.field.nexuses.length === 1, "ネクサスはtypesに含まれないため対象にならない")
}

console.log("すべてのチェックに合格しました 🎉（part288）")
