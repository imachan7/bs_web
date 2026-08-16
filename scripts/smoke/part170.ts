// smoke パート170（destroyExhausted を destroy / destroyAll + filter.rested へ畳んだ回帰テスト）
//
// action の直交化（2026-08-10）。「疲労状態のスピリットを破壊する」は専用アクション
// destroyExhausted で書いていたが、TargetFilter に既に `rested` があるため、
// **destroy（体数指定）／destroyAll（範囲）+ filter.rested** で同じことが書ける。
// 専用アクションを1つ減らし、絞り込みは共通の TargetFilter に一本化した。
//
// 移行対象10枚のうち8枚は既存の smoke が通っていたが、次の2枚は未検査だったのでここで見る。
//   BS01-049 幽騎士ナイトライダー   自分か相手の疲労状態1体（destroy + anySide）
//   BS08-018 暗黒騎士シュヴァルト   疲労状態の相手コスト4以下すべて（destroyAll + cost）
import { assert, createGame, createInstance, runTurnStart } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    return inst
}
const alive = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)

console.log("=== BS01-049 幽騎士ナイトライダー：疲労状態のスピリット1体を破壊する ===")
{
    const s = createGame("night-rider", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const self = put(s, "p1", "BS01-049", 3) // Lv2
    const restedEnemy = put(s, "p2", "BS01-031", 1, true) // 疲労している相手
    const readyEnemy = put(s, "p2", "BS01-031", 1) // 回復状態の相手

    fireTrigger(s, "p1", self, "onAttack")
    assert(!alive(s, "p2", restedEnemy.instanceId), "疲労状態の相手が破壊される")
    assert(alive(s, "p2", readyEnemy.instanceId), "回復状態の相手は破壊されない（filter.rested が効いている）")
}
{
    // anySide：自分の疲労スピリットも対象になりうる（相手に疲労がいない場合）
    const s = createGame("night-rider-own", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const self = put(s, "p1", "BS01-049", 3)
    const ownRested = put(s, "p1", "BS02-014", 1, true)
    put(s, "p2", "BS01-031", 1) // 相手は回復状態のみ

    fireTrigger(s, "p1", self, "onAttack")
    assert(!alive(s, "p1", ownRested.instanceId), "相手に疲労がいなければ自分の疲労スピリットが対象になる")
}

console.log("=== BS08-018 暗黒騎士シュヴァルト：疲労状態の相手コスト4以下すべてを破壊する ===")
{
    const s = createGame("schwarz", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const self = put(s, "p1", "BS08-018", 3) // Lv2
    const restedCheap1 = put(s, "p2", "BS02-014", 1, true) // コスト2・疲労
    const restedCheap2 = put(s, "p2", "BS01-031", 1, true) // コスト3・疲労
    const restedExpensive = put(s, "p2", "BS02-023", 1, true) // コスト6・疲労（対象外）
    const readyCheap = put(s, "p2", "BS02-014", 1) // コスト2・回復（対象外）
    const ownRested = put(s, "p1", "BS02-014", 1, true) // 自分の疲労（対象外＝相手だけ）

    fireTrigger(s, "p1", self, "onAttack")
    assert(!alive(s, "p2", restedCheap1.instanceId), "疲労・コスト2は破壊される")
    assert(!alive(s, "p2", restedCheap2.instanceId), "疲労・コスト3も破壊される（範囲効果なのでまとめて）")
    assert(alive(s, "p2", restedExpensive.instanceId), "コスト6は残る（filter.cost が効いている）")
    assert(alive(s, "p2", readyCheap.instanceId), "回復状態は残る（filter.rested が効いている）")
    assert(alive(s, "p1", ownRested.instanceId), "自分のスピリットは対象外")
}
