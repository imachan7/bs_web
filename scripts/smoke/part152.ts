// smoke パート152（未実装だった2枚：BS06カウンターカース／BS08猫娘アニー）
//
//   kind"jugekiOnBlockReplace"（【呪撃】の発揮タイミングを『ブロック時』へ**差し替える**。
//     funsaiOnBlock 等の「にも発揮される」＝追加とは違い、アタック時には発揮されなくなる）／
//   kind"freeSummonFromHandOnLifeDamaged"（**手札にあるカード自身**が持つ効果。
//     ライフが減ったときコストを支払わず召喚できる。実対戦では確認を出す）
import { act, assert, createGame, createInstance, declareBlock, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { resolveAction } from "./helpers"
import { tryHandFreeSummonOnLifeDamaged } from "../../server/src/logic/EffectModules"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const ALIVE = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)

// ブロック宣言後に開くフラッシュを閉じ、バトルを解決まで進める（part140 と同じヘルパー）
function resolveBattle(s: GameState): void {
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
}

// 【呪撃】を静的に持つスピリット（レベル不問で持つもの＝Lv1から効く個体を選ぶ）
const JUGEKI = CARDS.find((c) =>
    (c.effects ?? []).some(
        (e) =>
            e["kind"] === "keyword" &&
            e["keyword"] === "jugeki" &&
            (e["levels"] === null || (e["levels"] as number[]).includes(1)),
    ),
)!
// BPが十分高く、呪撃持ちとのBP比較で相打ちにならない詰め物
const BIG = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.bp ?? 0) >= 5000,
)!

function battleBase(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 通常時：【呪撃】はアタック時に発揮し、ブロッカーを破壊する ===")
{
    const s = battleBase("jugeki-normal")
    const attacker = put(s, "p1", JUGEKI.cardId, JUGEKI.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "呪撃持ちがアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    resolveBattle(s)
    assert(!ALIVE(s, "p2", blocker.instanceId), "【呪撃】でブロッカーが破壊される")
}

console.log("=== BS06カウンターカース：差し替え後、アタック時には発揮しなくなる ===")
{
    const counter = findByEffect((e) => e["kind"] === "jugekiOnBlockReplace")
    const s = battleBase("jugeki-replaced-attacker")
    const attacker = put(s, "p1", JUGEKI.cardId, JUGEKI.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    // アタッカー側（p1）に差し替えを貸す
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, (counter.colors ?? ["purple"]) as never, "magic", undefined, undefined, counter.cardId)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "呪撃持ちがアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    resolveBattle(s)
    assert(ALIVE(s, "p2", blocker.instanceId), "差し替え後はアタック時の【呪撃】が発揮しない（追加ではなく変更）")
}

console.log("--- 差し替え後は、ブロックした自分のスピリットの【呪撃】がアタッカーを破壊する ---")
{
    const counter = findByEffect((e) => e["kind"] === "jugekiOnBlockReplace")
    const s = battleBase("jugeki-replaced-blocker")
    const attacker = put(s, "p1", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", JUGEKI.cardId, JUGEKI.levels?.[0]?.cores ?? 1)
    // ブロッカー側（p2）に差し替えを貸す
    resolveAction(s, "p2", null, { type: "lendSelfThisTurn" }, undefined, (counter.colors ?? ["purple"]) as never, "magic", undefined, undefined, counter.cardId)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "呪撃持ちがブロック")
    resolveBattle(s)
    assert(!ALIVE(s, "p1", attacker.instanceId), "ブロック時の【呪撃】でアタッカーが破壊される")
}

console.log("--- 貸与のないターンには差し替えは効かない ---")
{
    const s = battleBase("jugeki-no-lend")
    const attacker = put(s, "p1", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", JUGEKI.cardId, JUGEKI.levels?.[0]?.cores ?? 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "呪撃持ちがブロック")
    resolveBattle(s)
    assert(ALIVE(s, "p1", attacker.instanceId), "ブロッカー側の【呪撃】は通常は発揮しない")
}

console.log("=== BS08猫娘アニー：ライフが減ったとき、手札からコストを支払わず召喚できる ===")
{
    const annie = findByEffect((e) => e["kind"] === "freeSummonFromHandOnLifeDamaged")
    // 非対話（テスト既定）は自動で召喚する
    const s = battleBase("annie-auto")
    const attacker = put(s, "p2", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.players.p1.hand.push(annie.cardId)
    const fieldBefore = s.players.p1.field.spirits.length
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "p1がライフで受ける")
    assert(s.players.p1.field.spirits.length === fieldBefore + 1, "手札から自動で召喚される")
    assert(!s.players.p1.hand.includes(annie.cardId), "手札から無くなる")
    // コストは支払わず、維持コア（Lv1ぶん）だけがリザーブから置かれる。
    // ライフで受けるとライフのコアがリザーブへ移るので、召喚された個体のコア数で確かめる
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === annie.cardId)!
    assert(summoned.cores === (annie.levels?.[0]?.cores ?? 1), "維持コアぶんだけ置かれている")
}

console.log("--- 実対戦では召喚するかを確認する ---")
{
    const annie = findByEffect((e) => e["kind"] === "freeSummonFromHandOnLifeDamaged")
    const s = battleBase("annie-confirm")
    s.interactiveTargets = true
    const attacker = put(s, "p2", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.players.p1.hand.push(annie.cardId)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "p1がライフで受ける")
    assert(s.pendingChoice !== null, "召喚するかの確認が立つ")
    assert(s.pendingChoice?.pid === "p1", "選択するのは手札の持ち主")
    assert(s.players.p1.hand.includes(annie.cardId), "確認中はまだ手札にある")

    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップ（召喚しない）")
    assert(s.players.p1.hand.includes(annie.cardId), "断れば手札に残る")

    // 断ったあとも、次にライフが減れば再び確認が出る
    const s2 = battleBase("annie-confirm-accept")
    s2.interactiveTargets = true
    const attacker2 = put(s2, "p2", BIG.cardId, BIG.levels?.[0]?.cores ?? 1)
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    s2.players.p1.hand.push(annie.cardId)
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2がアタック")
    assert(takeLifeAndResolve(s2, "p1") === null, "p1がライフで受ける")
    assert(act(s2, "p1", { type: "resolveChoice", option: "召喚する" }) === null, "「召喚する」を選ぶ")
    assert(
        s2.players.p1.field.spirits.some((x) => x.cardId === annie.cardId),
        "手札から場に出る",
    )
}

console.log("--- 『相手のアタックステップ』以外では候補にならない ---")
{
    const annie = findByEffect((e) => e["kind"] === "freeSummonFromHandOnLifeDamaged")
    // 条件判定そのものを直接叩いて確かめる（自分のターンに自分のライフが減る局面は通常作れないため）
    const s = battleBase("annie-phaseturn")
    s.interactiveTargets = true
    s.players.p1.hand.push(annie.cardId)

    s.turnPlayer = "p1" // 持ち主がターンプレイヤー＝『相手のアタックステップ』ではない
    s.phase = "attack"
    tryHandFreeSummonOnLifeDamaged(s, "p1")
    assert(s.pendingChoice === null, "自分のターンでは確認が出ない")

    s.turnPlayer = "p2"
    s.phase = "main" // ステップが違う
    tryHandFreeSummonOnLifeDamaged(s, "p1")
    assert(s.pendingChoice === null, "メインステップでは確認が出ない")

    s.phase = "attack" // 相手のアタックステップ
    tryHandFreeSummonOnLifeDamaged(s, "p1")
    assert(s.pendingChoice !== null, "『相手のアタックステップ』でだけ確認が出る")
}

console.log("--- リザーブが足りなければ確認自体を出さない ---")
{
    const annie = findByEffect((e) => e["kind"] === "freeSummonFromHandOnLifeDamaged")
    const s = battleBase("annie-no-reserve")
    s.interactiveTargets = true
    s.players.p1.hand.push(annie.cardId)
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.players.p1.reserve = 0 // 維持コアを置けない
    tryHandFreeSummonOnLifeDamaged(s, "p1")
    assert(s.pendingChoice === null, "維持コアを置けないなら確認を出さない")
}
