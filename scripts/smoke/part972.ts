// smoke パート972（Q765 の陣営判定：行き先変更は相手のスピリットから取るときだけ。BS01-129 ポイズンシュートは陣営を書かない除去）
// 対象がまだ決まっていない除去（side "any"）は【強化】の+1を外さず、対象が決まってから見る（2026-11-16 ユーザー指示）
import { act, assert, createGame, createInstance, effectiveCost, getCard, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const STEINBORG = "BS12-X02" // 魔羯邪神シュタイン・ボルグ（Lv2 で相手のリザーブ行きのコアをトラッシュへ）
const SIDOLON = "BS19-017" // 大蛇サイドロン（Lv2 で【強化】：コアを取り除く効果でリザーブに置くコアが+1）
const POISON = "BS01-129" // ポイズンシュート（紫マジック・コスト5・フラッシュ：スピリット1体の上のコア1個を持ち主のリザーブへ）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(STEINBORG).name === "魔羯邪神シュタイン・ボルグ" && getCard(STEINBORG).type === "spirit", "STEINBORGはスピリット")
    assert(getCard(SIDOLON).name === "大蛇サイドロン" && getCard(SIDOLON).type === "spirit", "SIDOLONはスピリット")
    assert(getCard(POISON).name === "ポイズンシュート" && getCard(POISON).type === "magic", "POISONはマジック")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).cost === 1, "ROKUはコスト1のバニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true // 対象は PendingChoice で選ばせる
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p1.hand[0] = POISON
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, cores) // 1ターン前に出ていたことにして、アタックの召喚酔いを避ける
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 攻撃から入り、防御側がパスして攻撃側に優先権が移った状態でポイズンシュートを使う
function castPoisonInAttack(s: GameState, attacker: ReturnType<typeof createInstance>): void {
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして攻撃側に優先権が移る")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ポイズンシュートを使用（対象は未指定）")
}

console.log("=== A. 自分のスピリットを選ぶ：陣営を書かない除去なので +1 が乗り、2個とも自分のリザーブへ ===")
{
    const s = game("poison-own")
    put(s, "p1", STEINBORG, 3) // cores3＝Lv2（行き先変更が有効）
    put(s, "p1", SIDOLON, 3) // cores3＝Lv2で【強化】
    const own = put(s, "p1", ROKU, 3)
    const attacker = put(s, "p1", ROKU, 1)
    const reserveBefore = s.players.p1.reserve
    const cost = effectiveCost(s, "p1", getCard(POISON)) // 支払うコア数は手札の実効コストで決まる
    castPoisonInAttack(s, attacker)
    assert(s.pendingChoice !== null, "対象を選ぶ確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: own.instanceId }) === null, "自分のスピリットを選ぶ")
    assert(own.cores === 1, "自分のスピリットのコアは2個減る（1＋【強化】の+1）")
    // 払ったコストはリザーブから出ていき、取り除いた2個は持ち主（自分）のリザーブへ戻る
    assert(s.players.p1.reserve === reserveBefore - cost + 2, "取り除いた2個は自分のリザーブへ")
}

console.log("=== B. 相手のスピリットを選ぶ：行き先変更が効き、コア1個だけが相手のトラッシュへ（Q765） ===")
{
    const s = game("poison-opp")
    put(s, "p1", STEINBORG, 3)
    put(s, "p1", SIDOLON, 3)
    const target = put(s, "p2", ROKU, 5)
    const attacker = put(s, "p1", ROKU, 1)
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    castPoisonInAttack(s, attacker)
    assert(s.pendingChoice !== null, "対象を選ぶ確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: target.instanceId }) === null, "相手のスピリットを選ぶ")
    assert(target.cores === 4, "相手のスピリットのコアは1個だけ減る（+1されない）")
    assert(s.players.p2.trashCores === trashBefore + 1, "減ったコア1個が相手のトラッシュに置かれた")
    assert(s.players.p2.reserve === reserveBefore, "相手のリザーブは増えていない")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
}

console.log("すべてのチェックに合格しました 🎉（part972）")
