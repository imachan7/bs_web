// smoke パート186（第九弾「超星」＝黄14枚）
//
// 新しく足した器の確認:
//   対象の付け替え（magicTargetRedirect）を**スピリットの効果にも**効かせた（2026-08-14 ユーザー確認）/
//   costDiscardNamedThenPeek（探偵ペンタン）/ markCantBlockThisBattle（妖精騎士ピーター）/
//   treatAsUnblockedIfBlockerLevel1（ハマ・ドリュアス）/ reviveOnDestroy.cost.oneCoreToTrash（花の宮殿）/
//   opponentNexusesUnexhaustable（花の宮殿Lv2）/ ownSeimeiLifeCharged（天駆ける方舟）/
//   familySuppression.target:"opponentAll"（キャラクターロスト）/ EffectCounter restedEnemyNexuses
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasFamily,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { canBlock } from "../../shared/block"
import { fireTrigger } from "../../server/src/logic/EffectModules"

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

console.log("=== BS09-038 ティンカ：スピリットの効果の対象も自分に付け替える ===")
{
    const s: GameState = createGame("bs09-038", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2" // 『相手のターン』
    // ティンカの効果文は『相手の**アタックステップ**』なので、ステップも合わせる
    // （下で使う『アタック時』誘発はアタックステップでしか起きない。2026-08-16 に phase 限定を実装）
    s.phase = "attack"
    const tinka = put(s, "p1", "BS09-038", 1)
    // 守る対象＝系統「楽族」を持つ自分のスピリット（BS09-042 妖精騎士ピーターも「楽族」）
    const guarded = put(s, "p1", "BS09-042", 1)
    assert(spiritHasFamily(s, "p1", guarded, "楽族"), "前提：守る対象は「楽族」を持つ")
    // p2 のスピリットの**誘発効果**として、p1 のスピリットからコアを取り除こうとする
    // （BS09-018 暗空の勇者皇ザンバ＝『アタック時』相手のコアをLvと同じ個数リザーブへ）。
    // 付け替えは誘発の解決に噛ませているので、fireTrigger を通す
    const zanba = put(s, "p2", "BS09-018", 1) // Lv1＝コア1個ぶん
    guarded.cores = 3
    tinka.cores = 3
    // 対象は自動選択（実効BP最大）。守られている「楽族」は候補から外れるので、
    // 付け替え先のティンカが選ばれる（＝マジックのときと同じ効き方）
    fireTrigger(s, "p2", zanba, "onAttack")
    assert(guarded.cores === 3, "守られた「楽族」はスピリットの効果を受けない")
    assert(tinka.cores === 2, "付け替え先のティンカがコアを取り除かれる")
}

console.log("=== BS09-039 探偵ペンタン：[キャラクターロスト]を捨てて相手の手札1枚の内容を見る ===")
{
    const s: GameState = createGame("bs09-039", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand = [PLAIN]
    s.players.p2.hand = ["BS09-041"]
    resolveAction(s, "p1", null, { type: "costDiscardNamedThenPeek", cardName: "キャラクターロスト" })
    assert(s.players.p1.peekedOpponentCardIds === undefined, "手札に[キャラクターロスト]が無ければ発動しない")
    s.players.p1.hand = [PLAIN, "BS09-079"] // BS09-079＝キャラクターロスト
    assert(getCard("BS09-079").name === "キャラクターロスト", "前提：BS09-079 はキャラクターロスト")
    resolveAction(s, "p1", null, { type: "costDiscardNamedThenPeek", cardName: "キャラクターロスト" })
    assert(!s.players.p1.hand.includes("BS09-079"), "コストとして破棄される")
    assert(s.players.p1.peekedOpponentCardIds?.[0] === "BS09-041", "相手の手札1枚の内容が記録される")
    assert(s.players.p2.hand.length === 1, "相手の手札は動かない（盤面を変えない）")
}

console.log("=== BS09-042 妖精騎士ピーター：指定した相手はこのバトルの間ブロックできない ===")
{
    const s: GameState = createGame("bs09-042", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const peter = put(s, "p1", "BS09-042", 2)
    const blocker = put(s, "p2", PLAIN, 1)
    s.battle = { attackerInstanceId: peter.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    assert(canBlock(s, "p2", blocker, "p1", peter) === null, "前提：指定前はブロックできる")
    resolveAction(s, "p1", peter, { type: "markCantBlockThisBattle" })
    assert(canBlock(s, "p2", blocker, "p1", peter) !== null, "指定後はブロックできない")
}

console.log("=== BS09-063 花の宮殿：コア1個をトラッシュに置いて疲労状態で場に残る ===")
{
    const s: GameState = createGame("bs09-063", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", "BS09-063", 0) // Lv1
    const gakuzoku = put(s, "p1", "BS09-042", 3) // 「楽族」・コア3個
    const trashBefore = s.players.p1.trashCores
    destroySpirit(s, "p1", gakuzoku.instanceId, "destroy", { sourcePid: "p2" })
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === gakuzoku.instanceId), "破壊されず場に残る")
    assert(gakuzoku.isRested, "疲労状態で残る")
    assert(gakuzoku.cores === 2, "コア1個を支払っている")
    assert(s.players.p1.trashCores === trashBefore + 1, "支払ったコアはトラッシュへ")
}
{
    // コア1個の個体は支払うと0個になり、待機解除の後に維持コア割れで消滅する（2026-08-14 ユーザー確認）
    const s: GameState = createGame("bs09-063b", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", "BS09-063", 0)
    const one = put(s, "p1", "BS09-042", 1)
    destroySpirit(s, "p1", one.instanceId, "destroy", { sourcePid: "p2" })
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === one.instanceId), "コア1個の個体は戻ってから消滅する")
}

console.log("=== BS09-063 Lv2：相手のネクサスは疲労させられない ===")
{
    const s: GameState = createGame("bs09-063c", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    putNexus(s, "p2", "BS09-064", 0) // 相手のネクサス（疲労させる対象）
    const { canExhaustNexus } = require("../../server/src/logic/EffectModules") as {
        canExhaustNexus: (s: GameState, pid: PlayerId) => boolean
    }
    assert(canExhaustNexus(s, "p2"), "前提：制約が無ければ疲労させられる")
    putNexus(s, "p1", "BS09-063", 2) // Lv2
    refreshLevelAsOverrides(s)
    assert(!canExhaustNexus(s, "p2"), "花の宮殿Lv2があると相手はネクサスを疲労させられない")
    assert(canExhaustNexus(s, "p1"), "自分のネクサスは疲労させられる")
}

console.log("=== BS09-079 キャラクターロスト：相手のスピリットだけ系統を失う ===")
{
    const s: GameState = createGame("bs09-079", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const mine = put(s, "p1", "BS09-042", 1) // 「楽族」
    const theirs = put(s, "p2", "BS09-042", 1)
    assert(spiritHasFamily(s, "p2", theirs, "楽族"), "前提：相手のスピリットは系統を持つ")
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS09-079")
    assert(!spiritHasFamily(s, "p2", theirs, "楽族"), "相手のスピリットは系統を失う")
    assert(spiritHasFamily(s, "p1", mine, "楽族"), "自分のスピリットは系統を保つ")
}

console.log("=== BS09-080 エグゾーストネクサス：疲労状態の相手ネクサス1つにつき1体破壊 ===")
{
    const s: GameState = createGame("bs09-080", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const a = put(s, "p2", PLAIN, 1)
    const b = put(s, "p2", PLAIN, 1)
    const tensho = put(s, "p2", "BS09-009", 1) // 【転召】持ち＝対象外
    const n1 = putNexus(s, "p2", "BS09-064", 0)
    const n2 = putNexus(s, "p2", "BS09-063", 0)
    n1.isRested = true
    n2.isRested = true
    resolveAction(s, "p1", null, { type: "destroyPer", counter: "restedEnemyNexuses", filter: { keywordExclude: "tensho" } })
    const alive = [a, b].filter((x) => s.players.p2.field.spirits.some((y) => y.instanceId === x.instanceId))
    assert(alive.length === 0, "疲労ネクサス2つぶん、2体が破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tensho.instanceId), "【転召】持ちは破壊されない")
}
