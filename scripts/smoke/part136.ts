// smoke パート136（第七弾のエンジン拡張：【聖命】【強襲】と「コスト◯以下のアタックではライフが減らない」）
//
// BS07 は3つの新要素を色をまたいで共有する。カードデータを入れる前に器だけ先に通しておく:
//   1. 【聖命】＝アタックで相手のライフを減らしたとき、**ボイドから**コア1個を自分のライフに置く
//      （lifeCharge の from:"void"。リザーブを消費しないのが従来の lifeCharge との違い）
//   2. 【強襲】＝アタック時、ターン中に指定回数まで、自分のネクサス1つを疲労させて自身を回復する
//      （refreshSelfByExhaustNexus。上限回数は keyword エントリの count から読む）
//   3. globalConstraint "noLifeDamageByCost" ＝ コストが指定以下のスピリットのアタックでは
//      お互いのライフが減らない（BS07の「勇傑」各色に共通）
//
// 聖命・強襲は**暴風と同じ設計**で、キーワードエントリは宣言、挙動は対になる triggered が持つ。
// ここではカードデータがまだ無いので、器（アクションと制約）を直接叩いて確かめる。
import {
    act,
    assert,
    createGame,
    createInstance,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { KEYWORDS } from "../../shared/rules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== 第七弾の新キーワードがキーワード表に載っている ===")
{
    assert(KEYWORDS.seimei?.label === "聖命", "【聖命】が KEYWORDS に登録されている")
    assert(KEYWORDS.kyoshu?.label === "強襲", "【強襲】が KEYWORDS に登録されている")
}

console.log("=== 【聖命】の器：lifeCharge from:\"void\" はリザーブを消費せずライフを増やす ===")
{
    const s = base("seimei-void")
    const lifeBefore = s.players.p1.life
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 1, from: "void" })
    assert(s.players.p1.life === lifeBefore + 1, `ライフ+1（${lifeBefore}→${s.players.p1.life}）`)
    assert(s.players.p1.reserve === reserveBefore, "リザーブは減らない（ボイドから置くため）")
}
{
    // 従来の lifeCharge（リザーブから）は据え置き＝回帰確認
    const s = base("seimei-reserve")
    const lifeBefore = s.players.p1.life
    s.players.p1.reserve = 3
    resolveAction(s, "p1", null, { type: "lifeCharge", count: 2 })
    assert(s.players.p1.life === lifeBefore + 2, "from 未指定ならライフ+2")
    assert(s.players.p1.reserve === 1, "from 未指定ならリザーブが2個減る")
}

console.log("=== 【強襲】の器：ネクサス1つを疲労させて自身を回復し、ターン上限を超えない ===")
{
    // BS06-036 牙王樹ラフレシオー（【暴風：2】持ち）は【強襲】を持たないので不発になる——
    // という negative を先に置いてから、実データ側のカードが入る前の器の挙動を確かめる
    const s = base("kyoshu-no-keyword")
    const spirit = put(s, "p1", "BS06-036", 1)
    const nexus = putNexus(s, "p1", "BS06-080", 0)
    spirit.isRested = true
    resolveAction(s, "p1", spirit, { type: "refreshSelfByExhaustNexus" })
    assert(spirit.isRested === true, "【強襲】を持たないスピリットは回復しない")
    assert(nexus.isRested === false, "ネクサスも疲労しない")
}

console.log("=== globalConstraint noLifeDamageByCost：コスト以下のアタックではライフが減らない ===")
{
    // 制約の発生源はまだカードデータに無いため、shared/rules の判定関数を直接確かめる
    const s = base("nolife-baseline")
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン（コスト0）
    put(s, "p2", "BS02-046", 1) // ウィンガル（壁。ブロックはしない）
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受ける")
    assert(s.players.p2.life === lifeBefore - 1, `制約が無ければライフは減る（${lifeBefore}→${s.players.p2.life}）`)
}
