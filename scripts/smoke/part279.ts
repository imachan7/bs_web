// smoke パート279（BS11 グループA/B その2：047 / 049 / 057 / 066 / 067）
import { act, assert, createGame, createInstance, currentLevel, effectiveBp, hasArmorAgainst, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { destroySpirit } from "../../server/src/logic/removal"
import { validateBlock } from "../../server/src/logic/RuleValidator"

const POSEIDOS = "BS11-047" // 海王神獣トライ・ポセイドス（Lv1＝コスト7以上を最高Lvとして扱う）
const OREPIS = "BS11-049" // ジャンビ・オレピス（相手の【装甲】を無効）
const BUTTAHORN = "BS11-057" // バタホルン（コスト4/6/8の相手はブロック不可）
const TREE = "BS11-066" // 発見されし世界樹（Lv2＝コア3個で自分のスピリットを戻す）
const WALL = "BS11-067" // 白き楯の長城（Lv2＝コア3個でバトル終了）
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const big = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 7 && c.levels.length >= 2)
const armored = ALL_CARDS.find((c) =>
    c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "armor"),
)
assert(big !== undefined && armored !== undefined && vanilla.length >= 2, "テスト前提: 必要なカードがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.phase = "attack"
    return s
}

console.log("=== §A BS11-047 Lv1：コスト7以上の自分のスピリットを最高Lvとして扱う ===")
{
    const s = game("poseidos")
    const p = createInstance(POSEIDOS, s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(p)
    const target = createInstance(big!.cardId, s.turn, 1) // 本来はLv1
    const small = createInstance(vanilla[0]!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(target, small)
    refreshLevelAsOverrides(s)
    const maxLv = Math.max(...big!.levels.map((l) => l.level))
    assert(currentLevel(target).level === maxLv, `コスト7以上は最高Lv（${String(maxLv)}）として扱う`)
    assert(currentLevel(small).level === 1, "コスト7未満は変わらない")
    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(currentLevel(target).level === 1, "自分のアタックステップ以外では効かない")
}

console.log("=== §B BS11-049：このターンの間、相手のスピリットの【装甲】が働かない ===")
{
    const s = game("orepis")
    const enemy = createInstance(armored!.cardId, s.turn, 3)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    assert(hasArmorAgainst(enemy, ["red", "blue", "green", "white", "yellow", "purple"]), "テスト前提: 装甲を持つ")
    resolveAction(s, "p1", null, { type: "disableOwnArmorThisTurn", side: "opponent" })
    assert(
        s.turnConstraints.some((c) => c.type === "armorDisabledForPid" && c.pid === "p2"),
        "相手側の装甲が落ちる",
    )
    assert(
        !s.turnConstraints.some((c) => c.type === "armorDisabledForPid" && c.pid === "p1"),
        "自分側は落ちない",
    )
}

console.log("=== §C BS11-057：コスト4/6/8の相手のスピリットはブロックできない ===")
{
    const s = game("buttahorn")
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    const cost4 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 4 && c.effects.length === 0)
    const cost5 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 5 && c.effects.length === 0)
    assert(cost4 !== undefined && cost5 !== undefined, "テスト前提: コスト4と5のバニラがいる")
    const b4 = createInstance(cost4!.cardId, s.turn, 2)
    const b5 = createInstance(cost5!.cardId, s.turn, 2)
    s.players.p2.field.spirits.push(b4, b5)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "banActByCostThisTurn", costs: [4, 6, 8], blockOnly: true, side: "opponent" })
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(validateBlock(s, "p2", b4.instanceId) !== null, "コスト4はブロックできない")
    assert(validateBlock(s, "p2", b5.instanceId) === null, "コスト5はブロックできる")
}
{
    // blockOnly なのでアタックは止めない
    const s = game("buttahorn-attack")
    const cost4 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 4 && c.effects.length === 0)!
    const mine = createInstance(cost4.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(mine)
    refreshLevelAsOverrides(s)
    s.turnConstraints.push({ type: "cantActByCost", costs: [4], blockOnly: true, pid: "p1" })
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "アタックは止まらない")
}

console.log("=== §D BS11-066 Lv2：ネクサスのコア3個を払って、破壊された自分のスピリットを疲労状態で戻す ===")
{
    const s = game("world-tree")
    const tree = createInstance(TREE, s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(tree)
    const inst = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", inst.instanceId, "destroy")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === inst.instanceId), "破壊されず場に残る")
    assert(inst.isRested === true, "疲労状態で戻る")
    assert(tree.cores === 0, "ネクサスのコア3個を払う")
    assert(s.players.p1.trashCores === 3, "払ったコアはトラッシュへ")
}
{
    const s = game("world-tree-nocost")
    const tree = createInstance(TREE, s.turn, 3)
    s.players.p1.field.nexuses.push(tree)
    tree.cores = 2 // 払えない（Lv2の判定はレベル表に従うので levels は別途）
    const inst = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", inst.instanceId, "destroy")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === inst.instanceId), "コアが足りなければ復活しない")
}

console.log("=== §E BS11-067 Lv2：ネクサスのコア3個を払ってバトルを終了させる ===")
{
    const s = game("white-wall")
    const wall = createInstance(WALL, s.turn, 3) // Lv2
    s.players.p2.field.nexuses.push(wall)
    const atk = createInstance(vanilla[0]!.cardId, s.turn, 2)
    s.players.p1.field.spirits.push(atk)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(
        act(s, "p2", { type: "activateAbility", instanceId: wall.instanceId, effectId: "BS11-067-e2" }) === null,
        "コア3個を払ってバトル終了",
    )
    assert(s.battle === null, "バトルが終わる")
    assert(wall.cores === 0, "ネクサスのコアを払う")
    assert(s.players.p2.trashCores === 3, "払ったコアはトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part279）")
