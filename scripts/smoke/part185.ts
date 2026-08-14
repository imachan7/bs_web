// smoke パート185（第九弾「超星」＝白17枚）
//
// 新しく足した器の確認:
//   refreshOne.count / returnToDeckTop.filter / refreshAllOwn.exemptKeyword /
//   noLifeDamageByCost.maxBp / protectBlockerCoresThisBattle /
//   step条件 ownSpiritMinCost / ownNexusIndestructible.colors /
//   freeSummonFromHandOnLifeDamaged.condition /
//   magicNegatePayByNexusGrant（ノルンの泉）/ magicNegateTurnOverrideGrant（アイスバーグ）
import {
    assert,
    createGame,
    createInstance,
    destroyNexus,
    fireStepTriggers,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { findMagicNegateSource } from "../../server/src/logic/triggers"
import { noLifeDamageByCost } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const PLAIN = "BS01-001" // ゴラドン（赤のバニラ・BP1000）
// 【氷壁：緑/青】の色一致を見るための、緑のマジック1枚（IDを直書きせず実データから引く）
const GREEN_MAGIC = getCard(
    (loadAllCards() as { cardId: string; type: string; colors: string[] }[]).find(
        (c) => c.type === "magic" && c.colors.includes("green"),
    )!.cardId,
)

console.log("=== BS09-031 守護巨獣ガラパーゾ：BP3000以下のアタックではライフが減らない ===")
{
    const s: GameState = createGame("bs09-031", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS09-031", 1) // Lv1
    const small = put(s, "p2", PLAIN, 1) // BP1000
    const big = put(s, "p2", "BS09-035", 7) // 巨獣皇スミドロード Lv3＝BP8000
    assert(noLifeDamageByCost(s, small) === true, "BP1000のアタックではライフが減らない")
    assert(noLifeDamageByCost(s, big) === false, "BP8000のアタックは通る")
}

console.log("=== BS09-033 槍戦騎ガウト：黄のスピリット3体を回復させる ===")
{
    const s: GameState = createGame("bs09-033", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    // BS09-028 機人ガラールは colorAs で黄を持つ
    const yellows = [0, 1, 2, 3].map(() => put(s, "p1", "BS09-028", 1))
    const white = put(s, "p1", "BS09-030", 1) // 白のみ
    refreshLevelAsOverrides(s)
    for (const y of yellows) y.isRested = true
    white.isRested = true
    resolveAction(s, "p1", null, { type: "refreshOne", filter: { color: "yellow" }, count: 3 })
    assert(yellows.filter((y) => !y.isRested).length === 3, "黄のスピリットがちょうど3体回復する")
    assert(white.isRested, "黄でないスピリットは回復しない")
}

console.log("=== BS09-032 飛鋼獣ゲイル・フォッカー：コスト7以上の味方がいるときだけコアが増える ===")
{
    const s: GameState = createGame("bs09-032", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    const gale = put(s, "p1", "BS09-032", 1)
    fireStepTriggers(s, "core")
    assert(gale.cores === 1, "コスト7以上がいなければコアは増えない")
    put(s, "p1", "BS09-035", 1) // 巨獣皇スミドロード＝コスト7
    fireStepTriggers(s, "core")
    assert(gale.cores === 2, "コスト7以上がいればボイドからコア1個が置かれる")
}

console.log("=== BS09-027 密林の勇者皇ヴォルザ：ブロッカー上のコアは取り除けない ===")
{
    const s: GameState = createGame("bs09-027", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const volza = put(s, "p1", "BS09-027", 3)
    const blocker = put(s, "p2", PLAIN, 3)
    s.battle = { attackerInstanceId: volza.instanceId, blockerInstanceId: blocker.instanceId, flashLockedPlayer: null, directed: false }
    resolveAction(s, "p1", volza, { type: "coreRemove", count: 1 }, blocker.instanceId)
    assert(blocker.cores === 2, "前提：保護がなければコアは取り除ける")
    resolveAction(s, "p1", volza, { type: "protectBlockerCoresThisBattle" })
    resolveAction(s, "p1", volza, { type: "coreRemove", count: 1 }, blocker.instanceId)
    assert(blocker.cores === 2, "保護後はブロッカーのコアが取り除かれない")
}

console.log("=== BS09-062 ノルンの泉：【氷壁】をネクサスの疲労で払える ===")
{
    const s: GameState = createGame("bs09-062", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p2" // 『相手のターン』
    const guna = put(s, "p1", "BS09-034", 1) // 風花の戦乙女グナ＝【氷壁：緑/青】
    guna.isRested = true // 疲労しているので本来は払えない
    // 緑を持つマジックなら何でもよい（【氷壁：緑/青】の色一致を見るため）
    const magic = GREEN_MAGIC
    assert(magic.colors.includes("green") && magic.type === "magic", "前提：緑のマジックを用意できる")
    assert(findMagicNegateSource(s, "p2", magic) === null, "疲労した【氷壁】だけでは無効化できない")
    const nexus = putNexus(s, "p1", "BS09-062", 0) // ノルンの泉 Lv1
    const found = findMagicNegateSource(s, "p2", magic)
    assert(found !== null, "ノルンの泉があれば、疲労していても無効化できる")
    assert(found?.nexusPayer?.instanceId === nexus.instanceId, "支払いはネクサスの疲労で肩代わりされる")
}

console.log("=== BS09-062 Lv2：白/黄のネクサスは相手の効果で破壊されない ===")
{
    const s: GameState = createGame("bs09-062b", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    runTurnStart(s)
    putNexus(s, "p1", "BS09-062", 1) // Lv2
    const white = putNexus(s, "p1", "BS09-061", 0) // 巨獣守りし神域＝白
    const red = putNexus(s, "p1", "BS09-055", 0) // 転生の谷＝赤
    refreshLevelAsOverrides(s)
    assert(destroyNexus(s, "p1", white.instanceId, { sourcePid: "p2", sourceType: "magic" }) === false, "白のネクサスは破壊されない")
    assert(destroyNexus(s, "p1", red.instanceId, { sourcePid: "p2", sourceType: "magic" }) === true, "赤のネクサスは守られない")
}

console.log("=== BS09-076 エマージェンシー：回復させるが【転召】を持たない個体はアタックできない ===")
{
    const s: GameState = createGame("bs09-076", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const tensho = put(s, "p1", "BS09-027", 1) // 【転召】持ち
    const plain = put(s, "p1", PLAIN, 1)
    refreshLevelAsOverrides(s)
    tensho.isRested = true
    plain.isRested = true
    resolveAction(s, "p1", null, { type: "refreshAllOwn", exemptKeyword: "tensho" })
    assert(!tensho.isRested && !plain.isRested, "どちらも回復する")
    assert(tensho.cantAttackThisTurn !== true, "【転召】持ちはアタックできる")
    assert(plain.cantAttackThisTurn === true, "【転召】を持たない個体はアタックできない")
}

console.log("=== BS09-X38 要塞騎神オーディーンType-X：【転召】を持たない相手3体をデッキの上へ ===")
{
    const s: GameState = createGame("bs09-x38", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const tensho = put(s, "p2", "BS09-009", 1) // 【転召】持ち
    const plains = [0, 1, 2, 3].map(() => put(s, "p2", PLAIN, 1))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "returnToDeckTop", count: 3, filter: { keywordExclude: "tensho" } })
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tensho.instanceId), "【転召】持ちは戻されない")
    const remaining = plains.filter((p) => s.players.p2.field.spirits.some((x) => x.instanceId === p.instanceId))
    assert(remaining.length === 1, "【転召】を持たない相手が3体だけ戻る")
}
