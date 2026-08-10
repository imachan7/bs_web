// smoke パート158（効果耐性の一本化：resistanceAgainst の判定表）
//
// 耐性は6つの述語に分かれていて、**呼び出し側が「どれを見るべきか」を毎回自分で判断していた**（約70か所）。
// 書き忘れても型は通り smoke も落ちないので、実際に穴が空いていた:
//   - 範囲コア奪取が【装甲】を素通り（2026-08-10 に修正）
//   - destroy の対象指定経路だけ hasFullEffectImmunity が抜けていた（この一本化で解消）
//   - クライアントの対象ハイライトにも3つ目のコピーがあり、同じく抜けていた
//
// ここでは判定表そのもの（shared/rules.boardResistanceAgainst ＋ サーバー側の上乗せ）を直接叩き、
// **どの耐性がどの操作・どの範囲で効くか**を固定する。個々のカードの挙動は各パートが見ているので、
// このパートは「表が壊れていないこと」だけを見る。
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resistanceAgainst } from "../../server/src/logic/EffectModules"
import type { EffectAttempt } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some(pred))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
// 【装甲：赤】をLv1から持つスピリット
const ARMORED = findByEffect(
    (e) =>
        e["kind"] === "keyword" &&
        e["keyword"] === "armor" &&
        ((e["colors"] as string[] | undefined) ?? []).includes("red") &&
        (((e["levels"] as number[] | null) ?? [1])[0] === 1),
)
// 「相手の効果の対象にならない」を持つスピリット
const UNTARGETABLE = findByEffect(
    (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "untargetableByOpponent",
)
const PLAIN = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// p1（赤）のスピリット効果として p2 のスピリットに何かをする
function byP1(op: EffectAttempt["op"], scope: EffectAttempt["scope"]): EffectAttempt {
    return { op, scope, actorPid: "p1", sourceType: "spirit", sourceColors: ["red"] }
}

console.log("=== 耐性が無ければ何も返さない（null＝通る） ===")
{
    const s = base("resist-none")
    const t = put(s, "p2", PLAIN.cardId, 3)
    for (const op of ["destroy", "bounce", "exhaust", "coreRemove", "other"] as const) {
        assert(resistanceAgainst(s, "p2", t, byP1(op, "targeted")) === null, `${op}：耐性なしなら通る`)
    }
}

console.log("=== 【装甲：色】は発生源の色で決まり、対象指定でも範囲でも防ぐ ===")
{
    const s = base("resist-armor")
    const t = put(s, "p2", ARMORED.cardId, 3)
    assert(resistanceAgainst(s, "p2", t, byP1("destroy", "targeted"))?.category === "armor", "赤の効果は装甲で防がれる")
    assert(resistanceAgainst(s, "p2", t, byP1("destroy", "area"))?.category === "armor", "範囲効果も同様に防ぐ")
    // 発生源の色が違えば防がない
    assert(
        resistanceAgainst(s, "p2", t, { ...byP1("destroy", "targeted"), sourceColors: ["white"] }) === null,
        "白の効果は【装甲：赤】では防げない",
    )
    // **色が渡っていないと装甲を判定できない**（不明時は防がない側に倒す仕様）
    assert(
        resistanceAgainst(s, "p2", t, { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "spirit" }) === null,
        "発生源の色が不明なら装甲は判定できない（渡し忘れると無言で効かなくなる）",
    )
}

console.log("=== 「相手の効果の対象にならない」は対象指定だけを防ぎ、範囲はすり抜ける ===")
{
    const s = base("resist-untargetable")
    const t = put(s, "p2", UNTARGETABLE.cardId, 3)
    assert(
        resistanceAgainst(s, "p2", t, byP1("destroy", "targeted"))?.category === "untargetable",
        "対象指定の効果は防がれる",
    )
    assert(resistanceAgainst(s, "p2", t, byP1("destroy", "area")) === null, "範囲効果は防がない（ここが2軸に分けた理由）")
}

console.log("=== 「このターンの間、相手の効果を受けない」は範囲も防ぐ ===")
{
    const s = base("resist-feather")
    const t = put(s, "p2", PLAIN.cardId, 3)
    t.immuneToOpponentThisTurn = true
    assert(resistanceAgainst(s, "p2", t, byP1("destroy", "area"))?.category === "fullImmune", "範囲効果も防ぐ")
    assert(resistanceAgainst(s, "p2", t, byP1("coreRemove", "targeted"))?.category === "fullImmune", "操作の種類も問わない")
}

console.log("=== 相手限定の耐性は、自分の効果には働かない ===")
{
    const s = base("resist-own")
    const armored = put(s, "p1", ARMORED.cardId, 3)
    const feather = put(s, "p1", PLAIN.cardId, 3)
    feather.immuneToOpponentThisTurn = true
    const own: EffectAttempt = { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "spirit", sourceColors: ["red"] }
    assert(resistanceAgainst(s, "p1", armored, own) === null, "自分の効果は自分の装甲持ちに通る")
    assert(resistanceAgainst(s, "p1", feather, own) === null, "「相手の効果を受けない」も自分の効果は止めない")
}
