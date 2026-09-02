// smoke パート269（自動選択の解消 その1：付与・レベル・コストの対象をプレイヤーに選ばせる）
//
// docs/design/PROCEDURES_AUDIT.md §5 の一般則（2026-09-02 ユーザー確定）:
// **効果文が「選ぶ」と書いているなら、候補が2つ以上あるとき実装も選ばせる。**
// 非対話（テスト・AI）は従来の自動選択を残す。ここでは grant.ts の4アクションを見る。
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}
// 対象になれる青のスピリット（Lv3を持つ）を、名前ではなくカードデータから引く
const blueLv3 = ALL_CARDS.filter(
    (c) => c.type === "spirit" && c.colors.includes("blue") && c.levels.some((l) => l.level === 3),
)
assert(blueLv3.length >= 2, "テスト前提: Lv3を持つ青のスピリットが2種類以上いる")

function game(interactive: boolean): GameState {
    const s = createGame("auto-choice-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== §A levelOverrideTarget（マッシブアップ）：どれをLv3扱いにするかを選ぶ ===")
{
    const card = byName("マッシブアップ")
    const action = card.effects[0]!.kind === "magic" ? card.effects[0]!.action : null
    assert(action !== null, "テスト前提: マッシブアップはマジック効果を持つ")

    // 対話：候補2体 → 選択待ちが立ち、選んだ側にだけ効く
    const s = game(true)
    const a = put(s, "p1", blueLv3[0]!.cardId)
    const b = put(s, "p1", blueLv3[1]!.cardId)
    resolveAction(s, "p1", null, action!)
    assert(s.pendingChoice?.kind === "target", "対象の選択待ちが立つ")
    assert(s.pendingChoice?.candidates.length === 2, "候補は青のLv3持ち2体")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "2体目を選ぶ")
    assert(b.levelOverrideThisTurn === 3, "選んだスピリットがLv3として扱われる")
    assert(a.levelOverrideThisTurn === undefined, "選ばなかったほうは変わらない")

    // 非対話：従来どおり先頭を自動選択
    const s2 = game(false)
    const a2 = put(s2, "p1", blueLv3[0]!.cardId)
    put(s2, "p1", blueLv3[1]!.cardId)
    resolveAction(s2, "p1", null, action!)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(a2.levelOverrideThisTurn === 3, "先頭が自動選択される（従来どおり）")
}

console.log("=== §B costBuffThisTurn（グロウアップ）：コストを上げる1体を選ぶ ===")
{
    const card = byName("グロウアップ")
    const main = card.effects.find((e) => e.kind === "magic" && e.timing === "main")
    assert(main !== undefined && main.kind === "magic", "テスト前提: グロウアップはメイン効果を持つ")
    const action = (main as { action: Parameters<typeof resolveAction>[3] }).action

    const s = game(true)
    const a = put(s, "p1", blueLv3[0]!.cardId)
    const b = put(s, "p1", blueLv3[1]!.cardId)
    resolveAction(s, "p1", null, action)
    assert(s.pendingChoice?.kind === "target", "対象の選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "2体目を選ぶ")
    assert(b.tempCostDelta === 3, "選んだスピリットのコストが+3される")
    assert(a.tempCostDelta === undefined, "選ばなかったほうは変わらない")

    const s2 = game(false)
    const a2 = put(s2, "p1", blueLv3[0]!.cardId)
    put(s2, "p1", blueLv3[1]!.cardId)
    resolveAction(s2, "p1", null, action)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(a2.tempCostDelta === 3, "従来どおり自動選択される")
}

console.log("=== §C negateOwnBlockConstraint（バーストファイア）：『ブロックできない』を消す1体を選ぶ ===")
{
    const card = byName("バーストファイア")
    const action = card.effects[0]!.kind === "magic" ? card.effects[0]!.action : null
    assert(action !== null, "テスト前提: バーストファイアはマジック効果を持つ")

    const s = game(true)
    const a = put(s, "p1", blueLv3[0]!.cardId)
    const b = put(s, "p1", blueLv3[1]!.cardId)
    resolveAction(s, "p1", null, action!)
    assert(s.pendingChoice?.kind === "target", "対象の選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "2体目を選ぶ")
    assert(b.blockConstraintNegatedThisTurn === true, "選んだスピリットの『ブロックできない』が無効になる")
    assert(a.blockConstraintNegatedThisTurn === false, "選ばなかったほうは変わらない")

    const s2 = game(false)
    const a2 = put(s2, "p1", blueLv3[0]!.cardId)
    put(s2, "p1", blueLv3[1]!.cardId)
    resolveAction(s2, "p1", null, action!)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(a2.blockConstraintNegatedThisTurn === true, "従来どおり先頭が自動選択される")
}

console.log("=== §D blockTriggersAsAttackTargetThisTurn（マクラーンスラッシュ）：指定する1体を選ぶ ===")
{
    const card = byName("マクラーンスラッシュ")
    const main = card.effects.find((e) => e.kind === "magic" && e.timing === "main")
    assert(main !== undefined && main.kind === "magic", "テスト前提: マクラーンスラッシュはメイン効果を持つ")
    const action = (main as { action: Parameters<typeof resolveAction>[3] }).action
    // 『ブロック時』効果を持つスピリットを2体、カードデータから引く
    const blockers = ALL_CARDS.filter(
        (c) => c.type === "spirit" && c.effects.some((e) => e.kind === "triggered" && e.trigger === "onBlock"),
    )
    assert(blockers.length >= 2, "テスト前提: 『ブロック時』効果を持つスピリットが2種類以上いる")

    const s = game(true)
    const a = put(s, "p1", blockers[0]!.cardId)
    const b = put(s, "p1", blockers[1]!.cardId)
    resolveAction(s, "p1", null, action)
    assert(s.pendingChoice?.kind === "target", "対象の選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "2体目を選ぶ")
    assert(b.blockTriggersAsAttackThisTurn === true, "選んだスピリットの『ブロック時』が『アタック時』になる")
    assert(a.blockTriggersAsAttackThisTurn === undefined, "選ばなかったほうは変わらない")

    const s2 = game(false)
    put(s2, "p1", blockers[0]!.cardId)
    put(s2, "p1", blockers[1]!.cardId)
    resolveAction(s2, "p1", null, action)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(
        s2.players.p1.field.spirits.some((sp) => sp.blockTriggersAsAttackThisTurn === true),
        "従来どおり実効BP最大が自動選択される",
    )
}

console.log("すべてのチェックに合格しました 🎉（part269）")
