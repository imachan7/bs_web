// smoke パート288（BS12 バッチ1・赤：指定アタック（canDirectAttack targetHighestBp）／lifeCoresBySymbolDiff／symbolAddGrant／
// byOpponentEffectOnly（ownSpiritExhausted）／removeOneOfAnyType の types 絞り込み）
import { assert, act, createGame, createInstance, effectiveBp, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { instanceSymbolCount, countSymbols, activatableAbility } from "../../shared/rules"
import { attachBrave } from "../../server/src/logic/removal"
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

console.log("=== §A 指定アタック：最もBPの高い相手を指定でき、疲労状態でも自動でブロックさせる ===")
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
    // 最もBPの高い個体しか指定できない（targetHighestBp）
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: attacker.instanceId,
            targetSpiritInstanceId: weak.instanceId,
        }) !== null,
        "BPが最大でない相手は指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: attacker.instanceId,
            targetSpiritInstanceId: strong.instanceId,
        }) === null,
        "最もBPの高い相手を指定してアタックできる",
    )
    assert(s.battle?.blockerInstanceId === null, "アタック宣言の時点ではまだブロックは確定しない")
    assert(s.battle?.directedTargetInstanceId === strong.instanceId, "指定先だけが控えられている")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了→ここでブロック確定）")
    assert(s.battle?.blockerInstanceId === strong.instanceId, "指定した相手が自動でブロッカーになる")
    assert(strong.isRested === true, "疲労状態のままブロック宣言する")
}

console.log("=== §B 指定アタック：装甲持ちは指定できない ===")
{
    const s = game("designate-armor")
    const attacker = createInstance(CASTLE, s.turn, 1)
    const armored = createInstance(ARMOR_RED, s.turn, 4) // Lv2 BP6000・【装甲：赤】＝BP最大
    const plain = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(armored, plain)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: attacker.instanceId,
            targetSpiritInstanceId: armored.instanceId,
        }) !== null,
        "【装甲：赤】持ちは指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: attacker.instanceId,
            targetSpiritInstanceId: plain.instanceId,
        }) !== null,
        "装甲持ちを避けても、BP最大でない相手は指定できない",
    )
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "通常のアタックはできる")
    assert(s.battle?.directedTargetInstanceId === undefined, "指定なしのアタックになっている")
}

console.log("=== §C 指定アタック：指定先が場を離れたら通常のアタックに戻る ===")
{
    const s = game("designate-gone")
    const attacker = createInstance(CASTLE, s.turn, 1)
    const only = createInstance(VANILLA, s.turn, 3) // ゴラドンLv2 BP3000
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(only)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: attacker.instanceId,
            targetSpiritInstanceId: only.instanceId,
        }) === null,
        "指定してアタック",
    )
    assert(s.battle?.directedTargetInstanceId === only.instanceId, "この時点では指定されている")
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


console.log("=== §H BS12-050：【合体時】フラッシュの起動能力（自分のスピリット1体を疲労させてBP+3000） ===")
{
    const s = game("brave-activated")
    // 合体条件「コスト3以上」のブレイヴを、コスト3以上のホストへ合体させる
    const host = createInstance("BS12-004", s.turn, 3) // ドラゴン・フェゼント（コスト4）
    s.players.p1.field.spirits.push(host)
    const brave = createInstance("BS12-050", s.turn, 0)
    attachBrave(s, "p1", host, brave)
    const fodder = createInstance(VANILLA, s.turn, 1) // 疲労させる用の回復状態スピリット
    s.players.p1.field.spirits.push(fodder)
    refreshLevelAsOverrides(s)
    // timing:"flash" は自分のメインステップ（バトル外）でも使える
    // バッジはホストに出るが、起動対象は効果を持つブレイヴの instanceId になる
    const found = activatableAbility(s, "p1", host)
    assert(found?.instanceId === brave.instanceId, "【合体時】の起動能力はブレイヴの instanceId で起動する")
    const before = effectiveBp(s, "p1", host)
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: brave.instanceId, effectId: "BS12-050-e3" }) === null,
        "合体中は発動できる",
    )
    assert(fodder.isRested === true, "コストとして自分のスピリット1体が疲労する")
    assert(effectiveBp(s, "p1", host) === before + 3000, "合体スピリット（ホスト）がBP+3000される")
}

console.log("すべてのチェックに合格しました 🎉（part288）")
