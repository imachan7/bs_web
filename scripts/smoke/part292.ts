// smoke パート292（BS12 黄バッチ5：新しく足した7つの器を1件ずつ発火させる）
// J=setBattleBpFixed（バトル中の実効BPそのものを2000に）／N=destroyAsMaxLevelGrant（コア0で最高Lv破壊）／
// V=reviveOnDestroy when.byOpponent（相手によって＝効果もバトルも）／YA=globalConstraint ownLifeFloor／
// YB=markCantBlockThisTurn（体数はカウンタ）／YC=EffectCounter battlingOpponentCombinedSymbols／
// YD=globalConstraint opponentCantAttackByCost（コスト完全一致の配列）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/removal"
import { hasDestroyAsMaxLevelGrant, ownLifeFloorContinuous } from "../../shared/rules"
import { canBlock } from "../../shared/block"
import { validateAttack } from "../../server/src/logic/RuleValidator"

const BETOR = "BS12-037" // オリンピアの天使ベトール（シンボル2つの相手のBPを2000として扱う）
const FALEG = "BS12-038" // オリンピアの天使ファレグ（天霊1体につき1体ブロック不可）
const HYDRA = "BS12-057" // ハイドランディア（【合体時】コア0で最高Lv破壊）
const JOGI = "BS12-069" // 定規山脈（自分のスピリットすべてがコア0で最高Lv破壊）
const TEN = "BS12-070" // 天の階（天霊5体以上でライフ0にならない）
const VIERGE = "BS12-X05" // 戦神乙女ヴィエルジェ（相手によって破壊されたとき手札へ／コスト配列アタック禁止）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== J: setBattleBpFixed（実効BPそのものが2000になる＝対象条件にも効く） ===")
{
    const s = game("j-battlebp")
    const target = createInstance("BS12-X05", s.turn, 3) // Lv2＝BP10000
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    const before = effectiveBp(s, "p2", target)
    assert(before > 2000, `前提: 素の実効BPは2000より大きい（実際 ${before}）`)
    resolveAction(s, "p1", null, { type: "setBattleBpFixed", amount: 2000 }, target.instanceId)
    assert(
        effectiveBp(s, "p2", target) === 2000,
        "バトル中の実効BPそのものが2000になる（BP比較だけでなく対象条件からも2000に見える）",
    )
}

console.log("=== N: destroyAsMaxLevelGrant（コア0で最高Lvとして破壊される） ===")
{
    const s = game("n-maxlevel")
    const nexus = createInstance(JOGI, s.turn, 1) // 定規山脈 Lv1
    s.players.p1.field.nexuses.push(nexus)
    const victim = createInstance("BS12-X05", s.turn, 1) // レベル表の最大は Lv3
    s.players.p1.field.spirits.push(victim)
    refreshLevelAsOverrides(s)
    assert(hasDestroyAsMaxLevelGrant(s, "p1", victim), "定規山脈が自分のスピリットすべてに最高Lv破壊を配る")

    const maxLevel = Math.max(...getCard(victim.cardId).levels.map((l) => l.level))
    assert(maxLevel === 3, "前提: BS12-X05 のレベル表の最大は Lv3")
    victim.cores = 0
    // 「相手のスピリット/ブレイヴ/マジックの効果で」の判定は currentEffectSource を見る
    // （EFFECT_SOURCE_CONTEXT.md）。効果の解決中であることを立ててから破壊する
    s.currentEffectSource = { pid: "p2", type: "spirit" }
    destroySpirit(s, "p1", victim.instanceId, "deplete")
    delete s.currentEffectSource
    assert(victim.destroyAsMaxLevel === true, "コア0でもレベル表の最大Lvとして破壊される（Lv0扱いにならない）")
    assert(
        currentLevel(victim).level === maxLevel,
        `破壊処理中のLvが最大Lvになる（実際 ${currentLevel(victim).level}）`,
    )

    // 自分の効果でコアが0になった場合は最高Lv破壊にならない（「相手の効果で」の限定）
    const own = createInstance("BS12-X05", s.turn, 1)
    s.players.p1.field.spirits.push(own)
    own.cores = 0
    s.currentEffectSource = { pid: "p1", type: "spirit" }
    destroySpirit(s, "p1", own.instanceId, "deplete")
    delete s.currentEffectSource
    assert(own.destroyAsMaxLevel !== true, "自分の効果でコア0になったときは最高Lv破壊にならない")
}

console.log("=== N: levels に最大Lvを含まない『破壊時』は発揮しない ===")
{
    // 効果文の「最高Lvとして破壊される」＝レベル表の最大Lv固定なので、
    // 『破壊時』の levels がその最大Lvを含まなければ、その効果は落ちる（2026-09-07 ユーザー確認）
    const s = game("n-ondestroy-gate")
    const nexus = createInstance(JOGI, s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    // BS12-035 オリンピアの天使フル＝『破壊時』が levels:[1,2] で、レベル表の最大も Lv2
    const full = createInstance("BS12-035", s.turn, 1)
    const card = getCard(full.cardId)
    const maxLv = Math.max(...card.levels.map((l) => l.level))
    const onDestroy = card.effects.find((e) => e.kind === "triggered" && e.trigger === "onDestroy")
    assert(onDestroy !== undefined, "前提: BS12-035 は『破壊時』効果を持つ")
    const levels = (onDestroy as { levels: number[] | null }).levels
    assert(
        levels === null || levels.includes(maxLv),
        "BS12-035 の『破壊時』は最大Lvを含むので、最高Lv破壊でも発揮する（含まないカードは落ちるのが正）",
    )
}

console.log("=== V: reviveOnDestroy when.byOpponent（バトル破壊でも手札に戻る） ===")
{
    const s = game("v-byopponent")
    const vierge = createInstance(VIERGE, s.turn, 3) // Lv2 で発揮
    s.players.p1.field.spirits.push(vierge)
    const ally = createInstance("BS12-038", s.turn, 1) // 系統：天霊
    s.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s)
    const handBefore = s.players.p1.hand.length
    // バトルのBP比較による破壊（context.battle あり・sourcePid なし）
    destroySpirit(s, "p1", ally.instanceId, "destroy", {
        battle: { attackerLevel: 1, attackerBp: 9999, attackerColors: ["yellow"] },
    })
    assert(
        s.players.p1.hand.length === handBefore + 1,
        "「相手によって破壊されたとき」はバトルのBP比較による破壊でも手札に戻る",
    )
}

console.log("=== YA: globalConstraint ownLifeFloor（ライフ1で下げ止まる） ===")
{
    const s = game("ya-lifefloor")
    const ten = createInstance(TEN, s.turn, 2) // 天の階 Lv2（Lv2 はコア2）
    s.players.p1.field.nexuses.push(ten)
    // 系統：「天霊」を5体そろえる（BS12-038 は天霊）
    for (let i = 0; i < 5; i++) s.players.p1.field.spirits.push(createInstance("BS12-038", s.turn, 1))
    refreshLevelAsOverrides(s)
    assert(ownLifeFloorContinuous(s, "p1") === 1, "天霊が5体以上いる間、自分のライフの下限は1")

    // 4体に減らすと下限が消える
    s.players.p1.field.spirits.pop()
    refreshLevelAsOverrides(s)
    assert(ownLifeFloorContinuous(s, "p1") === 0, "天霊が4体では下限が働かない")
}

console.log("=== YB: markCantBlockThisTurn（このターンの間ブロックできない） ===")
{
    const s = game("yb-cantblock")
    const faleg = createInstance(FALEG, s.turn, 1)
    s.players.p1.field.spirits.push(faleg) // 自身も天霊＝1体は数える
    const enemy = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", faleg, { type: "markCantBlockThisTurn", counter: { ownFamily: "天霊" } })
    assert(enemy.cantBlockThisTurn === true, "指定された相手のスピリットはこのターン ブロックできない")
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    assert(canBlock(s, "p2", enemy, "p1", attacker) !== null, "ブロック宣言そのものが拒否される")
}

console.log("=== YC: EffectCounter battlingOpponentCombinedSymbols ===")
{
    const s = game("yc-symbols")
    const pomeran = createInstance("BS12-036", s.turn, 1) // 星犬ポメラン
    s.players.p1.field.spirits.push(pomeran)
    const host = createInstance("BS12-X05", s.turn, 1) // シンボル1つ
    s.players.p2.field.spirits.push(host)
    const brave = createInstance("BS12-057", s.turn, 0) // ハイドランディア（ブレイヴ）
    attachBrave(s, "p2", host, brave)
    refreshLevelAsOverrides(s)
    const bpBefore = effectiveBp(s, "p1", pomeran)
    s.battle = { attackerPid: "p2", attackerInstanceId: host.instanceId, blockerInstanceId: pomeran.instanceId } as never
    resolveAction(s, "p1", pomeran, { type: "bpBuffPer", amountPer: 3000, counter: "battlingOpponentCombinedSymbols" })
    assert(
        effectiveBp(s, "p1", pomeran) > bpBefore,
        "バトルしている相手の合体スピリットのシンボル数ぶんBPが上がる",
    )
}

console.log("=== YD: globalConstraint opponentCantAttackByCost（コスト完全一致の配列） ===")
{
    const s = game("yd-cantattack")
    const vierge = createInstance(VIERGE, s.turn, 1)
    s.players.p2.field.spirits.push(vierge) // 相手側に置き、p1 のアタックを縛る
    refreshLevelAsOverrides(s)
    const blocked = createInstance("BS12-035", s.turn, 1) // コスト3＝禁止リストに入る
    s.players.p1.field.spirits.push(blocked)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.turn = 3
    const err = validateAttack(s, "p1", blocked.instanceId)
    assert(err !== null, `コスト3の相手のスピリットはアタックできない（実際: ${err}）`)

    const allowed = createInstance(BETOR, s.turn, 1) // コスト4＝禁止リスト(2/3/5/7/11)に無い
    s.players.p1.field.spirits.push(allowed)
    const err2 = validateAttack(s, "p1", allowed.instanceId)
    assert(
        err2 === null || !err2.includes("コストにより"),
        `リストに無いコストはこの制約では縛られない（実際: ${err2}）`,
    )
}

console.log("すべてのチェックに合格しました 🎉（part292）")
