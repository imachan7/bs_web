// smoke パート75（範囲効果の免疫バイパス回帰・4アクション）
//
// CardInstance.immuneToOpponentThisTurn（フェザーバリアが付与する一時免疫）は
// 「相手のカード効果を一切受けない（対象・範囲の両方から除外）」と定義されている（SPEC 2章）。
// 述語 isImmuneToArea を経由していない範囲アクションが4箇所あった：
// exhaustAll / exhaustAllByLevel / exhaustAllByColor / returnAllToHand。
// exhaustAllByLevel は装甲判定そのものが欠落していたため、装甲による回避も併せて固定する。
// 各アクションは実カード（グラウンドハウリング・ジャングルロウ・バインディングウッズ・ドリームハンド）の
// data/cards.json 上の action 定義をそのまま resolveAction に渡して検証する。
import { assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function spiritOf(s: GameState, pid: PlayerId, instanceId: string) {
    return s.players[pid].field.spirits.find((sp) => sp.instanceId === instanceId)
}

console.log("=== §A exhaustAll（BS04-099 グラウンドハウリング：BP4000以上の相手を疲労） ===")
{
    const s = setupMain("part75-exhaustAll")
    // BS01-018 リザードマン Lv1 BP4000（条件のBP4000以上を満たす）
    const immune = put(s, "p2", "BS01-018", 1)
    const control = put(s, "p2", "BS01-018", 1)
    const immuneInst = spiritOf(s, "p2", immune)
    if (immuneInst) immuneInst.immuneToOpponentThisTurn = true

    // 実カード（BS04-099-e1）の action をそのまま解決
    resolveAction(s, "p1", null, { type: "exhaustAll", side: "opponent", minBp: 4000 }, undefined, ["green"], "magic")

    assert(spiritOf(s, "p2", immune)?.isRested === false, "exhaustAll：免疫スピリットは疲労しない")
    assert(spiritOf(s, "p2", control)?.isRested === true, "exhaustAll：免疫を持たない対照は疲労する")
}

console.log("=== §B exhaustAllByColor（BS01-140 バインディングウッズ：最多色を疲労） ===")
{
    const s = setupMain("part75-exhaustAllByColor")
    // BS01-018 リザードマン（緑）を相手フィールドの最多色にする
    const immune = put(s, "p2", "BS01-018", 1)
    const control = put(s, "p2", "BS01-018", 1)
    const immuneInst = spiritOf(s, "p2", immune)
    if (immuneInst) immuneInst.immuneToOpponentThisTurn = true
    // 自分（効果所有者）側の同色スピリットにも免疫フラグを立てるが、
    // 免疫は「相手の効果」を防ぐものなので自分側には適用されないはず
    const ownSpirit = put(s, "p1", "BS01-018", 1)
    const ownInst = spiritOf(s, "p1", ownSpirit)
    if (ownInst) ownInst.immuneToOpponentThisTurn = true

    // 実カード（BS01-140-e2）の action をそのまま解決
    resolveAction(s, "p1", null, { type: "exhaustAllByColor" }, undefined, ["green"], "magic")

    assert(spiritOf(s, "p2", immune)?.isRested === false, "exhaustAllByColor：相手の免疫スピリットは疲労しない")
    assert(spiritOf(s, "p2", control)?.isRested === true, "exhaustAllByColor：免疫を持たない相手対照は疲労する")
    assert(spiritOf(s, "p1", ownSpirit)?.isRested === true, "exhaustAllByColor：免疫フラグは自分のスピリットには適用されない")
}

console.log("=== §C exhaustAllByLevel（BS04-100 ジャングルロウのaction型・装甲：緑の実カードで検証） ===")
{
    // cards.jsonに緑装甲Lv1持ちが存在しないため、装甲判定を実カードで通すためLv2で検証する
    // （level指定以外はジャングルロウのaction定義＝exhaustAllByLevelそのもの）
    const s = setupMain("part75-exhaustAllByLevel")
    // BS04-041 フェンリルキャノンMk-II Lv2（cores3）：装甲：赤/緑を持つ（緑発生源から守られるはず）
    const armored = put(s, "p2", "BS04-041", 3)
    // BS01-002 ロクケラトプス Lv2（cores2）：免疫フラグを直接付与
    const immune = put(s, "p2", "BS01-002", 2)
    const immuneInst = spiritOf(s, "p2", immune)
    if (immuneInst) immuneInst.immuneToOpponentThisTurn = true
    // BS01-018 リザードマン Lv2（cores2）：無防備な対照
    const control = put(s, "p2", "BS01-018", 2)

    resolveAction(s, "p1", null, { type: "exhaustAllByLevel", level: 2 }, undefined, ["green"], "magic")

    assert(spiritOf(s, "p2", armored)?.isRested === false, "exhaustAllByLevel：装甲（緑）を持つスピリットは疲労しない")
    assert(spiritOf(s, "p2", immune)?.isRested === false, "exhaustAllByLevel：免疫スピリットは疲労しない")
    assert(spiritOf(s, "p2", control)?.isRested === true, "exhaustAllByLevel：免疫も装甲も持たない対照は疲労する")
}

console.log("=== §D returnAllToHand（BS04-102 ドリームハンド：コスト1以下を手札へ） ===")
{
    const s = setupMain("part75-returnAllToHand")
    // BS01-002 ロクケラトプス（コスト1）
    const immune = put(s, "p2", "BS01-002", 1)
    const control = put(s, "p2", "BS01-002", 1)
    const immuneInst = spiritOf(s, "p2", immune)
    if (immuneInst) immuneInst.immuneToOpponentThisTurn = true
    const handBefore = s.players.p2.hand.length

    // 実カード（BS04-102-e1）の action をそのまま解決
    resolveAction(
        s,
        "p1",
        null,
        { type: "returnAllToHand", side: "both", costFilter: { max: 1 } },
        undefined,
        ["white"],
        "magic",
    )

    assert(spiritOf(s, "p2", immune) !== undefined, "returnAllToHand：免疫スピリットは手札に戻らない")
    assert(spiritOf(s, "p2", control) === undefined, "returnAllToHand：免疫を持たない対照は手札に戻る")
    assert(s.players.p2.hand.length === handBefore + 1, "returnAllToHand：戻ったのは対照の1体のみ")
}
