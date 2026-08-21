// smoke パート223（マジックの対象は、効果の条件に合うものだけ採用する。2026-08-21 利用者確定）
//
// マジックだけは「クライアントが対象を選んでから castMagic を送る」作りで、
// 送られてくる対象が効果の条件を満たしているとは限らなかった。実プレイでは次の形で出た:
//
//   BS06-097 ブラッディコフィン  疲労していないスピリットも選べ、選ぶとマジックだけ消費された
//   BS06-094 トライデントフレア  「3体を破壊」なのに1体しか渡されず、残り2体ぶんが失われた
//   BS06-100 ソーンプリズン      「相手が選ぶ」効果なのに、使用者が選んでいた
//
// 対象選択はサーバー側（pendingChoice）へ一本化するのが本筋だが、その間の受け口として
// GameEngine.usableMagicTarget が採用可否を判定する。捨てた場合は対象未指定として解決へ進む。
//
// castMagic だけ handleAction を直接呼ぶ（helpers.act は対話モードで pendingChoice を先に消化するため）
import { act, assert, createGame, createInstance, handleAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const COFFIN = "BS06-097" // ブラッディコフィン：疲労状態のコスト4以下のスピリット1体を破壊
const TRIDENT = "BS06-094" // トライデントフレア：BP3000以下の相手のスピリット3体を破壊
const THORN = "BS06-100" // ソーンプリズン：相手は、相手のスピリット2体を疲労させる
const SMALL = "BS01-004" // ドラグノ偵察兵：コスト2 / Lv1 BP2000

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false): string {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// フラッシュのマジックを使えるところまで進める（アタック宣言 → 防御側パスで優先権が攻撃側へ）
function setup(name: string, hand: string[]): { s: GameState; attacker: string } {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.reserve = 20
    s.players.p1.hand = hand
    const attacker = putSpirit(s, "p1", SMALL, 1)
    putSpirit(s, "p2", SMALL, 1) // 相手のブロッカー候補（バトルは解決させない）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（優先権が攻撃側へ）")
    return { s, attacker }
}

console.log("=== ブラッディコフィン：条件を満たさない対象を渡されても、選び直しになる ===")
{
    const { s } = setup("coffin-bad-target", [COFFIN])
    const ok = putSpirit(s, "p2", SMALL, 1, true) // 疲労コスト2＝条件に合う
    putSpirit(s, "p2", SMALL, 1) // 回復状態＝条件に合わない（アタック中の1体と合わせて2体）
    const bad = s.players.p2.field.spirits.find((x) => !x.isRested)!.instanceId

    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: bad }) === null, "使用できる")
    assert(!!s.pendingChoice, "条件外の対象は採用されず、対象選択になる（マジックだけ消えない）")
    assert(
        s.pendingChoice!.candidates.includes(ok) && !s.pendingChoice!.candidates.includes(bad),
        "候補は疲労かつコスト4以下だけ",
    )
}

console.log("=== ブラッディコフィン：条件に合う対象を渡されたときは、従来どおりそのまま解決する ===")
{
    const { s } = setup("coffin-good-target", [COFFIN])
    const ok = putSpirit(s, "p2", SMALL, 1, true)
    const before = s.players.p2.field.spirits.length
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: ok }) === null, "使用できる")
    assert(s.pendingChoice === null, "選び直しにはならない")
    assert(s.players.p2.field.spirits.length === before - 1, "指定した対象が破壊される")
}

console.log("=== トライデントフレア：3体が対象なのに1体だけ渡されたら、体数ぶん選ばせる ===")
{
    const { s } = setup("trident-one-target", [TRIDENT])
    const t1 = putSpirit(s, "p2", SMALL, 1)
    putSpirit(s, "p2", SMALL, 1)
    putSpirit(s, "p2", SMALL, 1)
    const before = s.players.p2.field.spirits.length
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: t1 }) === null, "使用できる")
    assert(!!s.pendingChoice, "1体だけの指定は採用せず、対象選択になる")
    assert(
        s.pendingChoice!.candidates.length === before,
        `BP3000以下の相手すべてが候補（実際: ${s.pendingChoice!.candidates.length}体 / 場: ${before}体）`,
    )
}

console.log("=== ソーンプリズン：「相手が選ぶ」効果は、使用者が対象を渡しても相手に選ばせる ===")
{
    const { s } = setup("thorn-chooser", [THORN])
    const t1 = putSpirit(s, "p2", SMALL, 1)
    putSpirit(s, "p2", SMALL, 1)
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: t1 }) === null, "使用できる")
    assert(!!s.pendingChoice, "対象選択になる")
    assert(s.pendingChoice!.pid === "p2", `選ぶのは相手（実際: ${s.pendingChoice!.pid}）`)
}
