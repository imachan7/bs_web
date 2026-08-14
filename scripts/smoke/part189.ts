// smoke パート189（第九弾「超星」＝カバレッジ第2弾）
//
// `npm run coverage:effects` が残した2種類の穴を、**カードデータ経由で**動かして潰す:
//   (1) 効果エントリが一度も発火していないもの
//   (2) action は動いているが、テストが手で組んだものだけでカードデータ経由が未検証のもの
import {
    assert,
    act,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    getCard,
    refreshLevelAsOverrides,
    fireStepTriggers,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireFieldEventTriggers, fireTrigger } from "../../server/src/logic/EffectModules"
import { fireBattleWonTriggers } from "../../server/src/logic/triggers"
import { instHasColor } from "../../shared/rules"

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
// 手札の先頭に置いたマジックを、コストを気にせず使えるようにして使用する
function castFromHand(s: GameState, pid: PlayerId, cardId: string, phase: "main" | "attack" = "main"): string | null {
    s.players[pid].hand.unshift(cardId)
    s.players[pid].reserve = 20
    s.turnPlayer = pid
    s.phase = phase
    return act(s, pid, { type: "castMagic", handIndex: 0 })
}
const PLAIN = "BS01-001" // ゴラドン（赤のバニラ）

console.log("=== BS09-016 闇騎士モルドレッド：相手のアタックステップに自分の赤が破壊されたら発揮 ===")
{
    const s: GameState = createGame("bs09-016cov", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    put(s, "p1", "BS09-016", 1) // Lv1
    const red = put(s, "p1", PLAIN, 1)
    const enemy = put(s, "p2", PLAIN, 3)
    destroySpirit(s, "p1", red.instanceId, "destroy", { sourcePid: "p2" })
    assert(enemy.cores === 2, "自分の赤が破壊されると相手のコアが1個減る")
}

console.log("=== BS09-056 星創られし場所 Lv2：「星竜」が勝ったらトラッシュのスピリットを回収 ===")
{
    const s: GameState = createGame("bs09-056cov", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS09-056", 3) // Lv2
    const seiryu = put(s, "p1", "BS09-005", 1) // 銀河竜アンドロメテオス＝「星竜」
    s.players.p1.trashCards.push(PLAIN)
    const handBefore = s.players.p1.hand.length
    fireBattleWonTriggers(s, "p1", seiryu, "attacker")
    assert(s.players.p1.hand.length === handBefore + 1, "トラッシュのスピリットカードが手札に戻る")
}

console.log("=== マジックの使用（カードデータ経由）：ビッグバンエナジー／オンザエッジ／キャラクターロスト ===")
{
    const s: GameState = createGame("bs09-magic1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    assert(castFromHand(s, "p1", "BS09-067") === null, "ビッグバンエナジーをメインで使用できる")
    assert(s.players.p1.turnVirtualInstances.length > 0, "このターンの継続効果が貸し出される")
}
{
    const s: GameState = createGame("bs09-magic2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "blue" })
    runTurnStart(s)
    assert(castFromHand(s, "p1", "BS09-073") === null, "オンザエッジをメインで使用できる")
    assert(s.players.p1.turnVirtualInstances.length > 0, "このターンの継続効果が貸し出される")
}
{
    const s: GameState = createGame("bs09-magic3", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "blue" })
    runTurnStart(s)
    const theirs = put(s, "p2", "BS09-042", 1) // 「楽族」
    assert(castFromHand(s, "p1", "BS09-079") === null, "キャラクターロストをメインで使用できる")
    const { spiritHasFamily } = require("../../shared/rules") as {
        spiritHasFamily: (b: GameState, p: PlayerId, i: typeof theirs, f: string) => boolean
    }
    assert(!spiritHasFamily(s, "p2", theirs, "楽族"), "相手のスピリットが系統を失う")
}

console.log("=== カードデータ経由で動かす（手で組んだ action しか通っていなかったもの） ===")
{
    // 探偵ペンタン：『自分のスタートステップ』
    const s: GameState = createGame("cov-039", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    put(s, "p1", "BS09-039", 1)
    s.players.p1.hand = ["BS09-079"] // キャラクターロスト
    s.players.p2.hand = ["BS09-041"]
    fireStepTriggers(s, "start")
    assert(s.players.p1.peekedOpponentCardIds?.[0] === "BS09-041", "探偵ペンタンが相手の手札の内容を見る")
}
{
    // フォレスト・ゴレム：『召喚時』（自分のフィールドに緑がいるとき）
    const s: GameState = createGame("cov-052", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS09-019", 1) // オオクチバ＝緑
    const golem = put(s, "p1", "BS09-052", 1)
    const c3 = put(s, "p2", "BS09-049", 1) // コスト3
    const c4 = put(s, "p2", "BS09-050", 1) // コスト4
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", golem, "onSummon")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === c3.instanceId), "コスト3が破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === c4.instanceId), "コスト4も破壊される")
}
{
    // 妖精騎士ピーター：『アタック時』
    const s: GameState = createGame("cov-042", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const peter = put(s, "p1", "BS09-042", 2) // Lv2
    const blocker = put(s, "p2", PLAIN, 1)
    s.battle = { attackerInstanceId: peter.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    fireTrigger(s, "p1", peter, "onAttack")
    assert(blocker.cantBlockThisBattle === true, "指定された相手はこのバトルの間ブロックできない")
}
{
    // 密林の勇者皇ヴォルザ：『アタック時』
    const s: GameState = createGame("cov-027", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    const volza = put(s, "p1", "BS09-027", 3) // Lv2
    s.battle = { attackerInstanceId: volza.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    fireTrigger(s, "p1", volza, "onAttack")
    assert(s.battle?.blockerCoresProtected === true, "ブロッカー上のコアが保護される")
}
{
    // ドラゴニックハウル：フラッシュで使用
    const s: GameState = createGame("cov-084", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.deck.unshift("BS09-049") // コスト3
    const same = put(s, "p2", "BS09-049", 1)
    // フラッシュマジックはフラッシュタイミング（バトル中）にしか使えない
    const attacker = put(s, "p1", PLAIN, 1)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const err = castFromHand(s, "p1", "BS09-084", "attack")
    assert(err === null, `ドラゴニックハウルを使用できる（${err ?? "ok"}）`)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === same.instanceId), "同じコストの相手が破壊される")
}

console.log("=== BS09-045 光輝の勇者皇リュート：自分をブロックした相手はLv1として扱う ===")
{
    const s: GameState = createGame("cov-045", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const lute = put(s, "p1", "BS09-045", 1)
    const blocker = put(s, "p2", PLAIN, 3) // 本来 Lv2
    refreshLevelAsOverrides(s)
    assert(currentLevel(blocker).level === 2, "前提：ブロッカーはLv2")
    fireFieldEventTriggers(s, "p1", "ownSpiritBlocked", { pid: "p1", inst: lute }, undefined, blocker.instanceId)
    assert(currentLevel(blocker).level === 1, "ブロックした相手はLv1として扱われる")
}

console.log("=== BS09-005 銀河竜アンドロメテオス Lv2：青のスピリットとしても扱う ===")
{
    const s: GameState = createGame("cov-005", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    const andro = put(s, "p1", "BS09-005", 2) // Lv2
    refreshLevelAsOverrides(s)
    assert(instHasColor(andro, "blue"), "Lv2では青としても扱う")
    const lv1 = put(s, "p1", "BS09-005", 1)
    refreshLevelAsOverrides(s)
    assert(!instHasColor(lv1, "blue"), "Lv1では青にならない")
}
