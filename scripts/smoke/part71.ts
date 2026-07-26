// smoke パート71（未通過経路の回帰）
//
//   §A negateOwnBlockConstraint（ブロック制約の無効化）
//   §B grantBlockerImmunity（ブロッカーへの効果免疫）
//   §C returnSelfToHand（破壊時に手札へ戻る。実行時カバレッジ計測で発見）
//
// §A・§B は「実装済みだが、使用カードが一度も smoke/E2E に登場しない」経路だった
// （実装担当の棚卸しによる。9件のうち、制約無効化・免疫の2件をこちらで担当）。
// この2つを選んだ理由は、**【激突】の詰みバグと同型**だから:
//   - negateOwnBlockConstraint（BS01-119 バーストファイア）＝ブロック制約の無効化
//   - grantBlockerImmunity（BS01-139 フェザーバリア）＝相手の効果を受けない
// 「無効化しきれていない」「守れていない」の両方向に外しやすく、外しても全緑のまま通る。
//
// 対象カードは cards.json を python3 で引いて機械照合済み（HANDOFF_DESIGN.md §4.2）:
//   BS01-119 バーストファイア   magic/赤/コスト4/flash  action: negateOwnBlockConstraint
//   BS01-139 フェザーバリア     magic/緑/コスト5/flash  action: grantBlockerImmunity
//   BS01-003 テラノセイバー     constraint cantBlock（Lv1のみ）
//   BS01-018 リザードマン       constraint cantBlockLowerBp（Lv1-3）
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// p1 のアタックステップ直前の状態を作る（両者のフィールドを空にしてから配置する）
function setupAttackStep(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function findSpiritById(s: GameState, pid: PlayerId, instanceId: string) {
    return s.players[pid].field.spirits.find((sp) => sp.instanceId === instanceId)
}

console.log("=== §A negateOwnBlockConstraint: cantBlock の無効化（バーストファイア） ===")
{
    const s = setupAttackStep("negate-cantblock")
    const attacker = put(s, "p1", "BS01-002", 1) // ロクケラトプス Lv1 BP1000
    const decoy = put(s, "p2", "BS01-001", 1) // ゴラドン（制約なし）＝ field.spirits[0]
    const terano = put(s, "p2", "BS01-003", 1) // テラノセイバー Lv1＝cantBlock

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")

    // 無効化前: cantBlock 持ちはブロックできない
    const before = act(s, "p2", { type: "block", instanceId: terano })
    assert(before !== null, "無効化前は cantBlock でブロックが拒否される")
    assert(
        String(before).includes("ブロックできません"),
        `拒否理由が『ブロックできない』であること（実際: ${before}）`,
    )

    // 無効化（バーストファイアの action を直接解決）
    resolveAction(s, "p2", null, { type: "negateOwnBlockConstraint" })

    // 対象選択: field.spirits[0]（制約なしのゴラドン）ではなく、制約持ちが選ばれること
    assert(
        findSpiritById(s, "p2", terano)?.blockConstraintNegatedThisTurn === true,
        "制約を持つスピリットが対象に選ばれる",
    )
    assert(
        findSpiritById(s, "p2", decoy)?.blockConstraintNegatedThisTurn === false,
        "先頭の制約なしスピリットは対象にならない（フォールバック誤爆なし）",
    )

    // 無効化後: ブロックできる
    assert(act(s, "p2", { type: "block", instanceId: terano }) === null, "無効化後はブロックできる")
    assert(s.battle?.blockerInstanceId === terano, "ブロッカーとして登録された")
}

console.log("=== §A-2 negateOwnBlockConstraint: cantBlockLowerBp も無効化される ===")
{
    const s = setupAttackStep("negate-lowerbp")
    // リザードマン Lv1 BP4000 は「自分より実効BPが低いアタッカー」をブロックできない
    const attacker = put(s, "p1", "BS01-002", 1) // BP1000 < 4000
    const lizard = put(s, "p2", "BS01-018", 1) // リザードマン Lv1＝cantBlockLowerBp

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")

    const before = act(s, "p2", { type: "block", instanceId: lizard })
    assert(before !== null, "無効化前は cantBlockLowerBp でブロックが拒否される")
    assert(
        String(before).includes("BPの低いスピリット"),
        `拒否理由が cantBlockLowerBp であること（実際: ${before}）`,
    )

    resolveAction(s, "p2", null, { type: "negateOwnBlockConstraint" })
    assert(act(s, "p2", { type: "block", instanceId: lizard }) === null, "無効化後はブロックできる")
}

console.log("=== §A-3 negateOwnBlockConstraint: 実対戦経路（フラッシュでカードを使用） ===")
{
    const s = setupAttackStep("negate-castmagic")
    const attacker = put(s, "p1", "BS01-002", 1)
    const terano = put(s, "p2", "BS01-003", 1)
    // p2 の手札の先頭をバーストファイアにし、支払えるだけのリザーブを持たせる
    s.players.p2.hand = ["BS01-119"]
    s.players.p2.reserve = 10

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: terano }) !== null, "使用前はブロックできない")

    // 防御側が優先権を持っている状態でフラッシュ使用
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "バーストファイアをフラッシュで使用できる",
    )
    assert(
        findSpiritById(s, "p2", terano)?.blockConstraintNegatedThisTurn === true,
        "カード使用でも制約が無効化される",
    )
    // 使用で優先権が相手へ移るので、相手のパスを挟んでからブロックする
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス")
    assert(act(s, "p2", { type: "block", instanceId: terano }) === null, "使用後はブロックできる")
}

console.log("=== §A-4 negateOwnBlockConstraint: 「このターンの間」＝ターン終了でリセット ===")
{
    const s = setupAttackStep("negate-reset")
    const terano = put(s, "p2", "BS01-003", 1)
    resolveAction(s, "p2", null, { type: "negateOwnBlockConstraint" })
    assert(
        findSpiritById(s, "p2", terano)?.blockConstraintNegatedThisTurn === true,
        "無効化フラグが立つ",
    )
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了")
    assert(
        findSpiritById(s, "p2", terano)?.blockConstraintNegatedThisTurn === false,
        "ターン終了でフラグがリセットされる",
    )
}

console.log("=== §B grantBlockerImmunity: ブロック中のスピリットが相手の効果を受けない（フェザーバリア） ===")

// p1 のアタック → p2 がブロック宣言済みの状態を作る。
// p2 は field.spirits[0] に囮（低BP・非ブロック）、[1] にブロッカーを置く
function setupBlocked(seed: string): { s: GameState; decoy: string; blocker: string } {
    const s = setupAttackStep(seed)
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン BP1000
    const decoy = put(s, "p2", "BS01-001", 1) // 囮 BP1000（ブロックしない）
    const blocker = put(s, "p2", "BS01-002", 3) // ロクケラトプス Lv3 BP4000
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker })
    act(s, "p2", { type: "block", instanceId: blocker })
    return { s, decoy, blocker }
}

{
    // 対照実験: 免疫を付けなければ、相手の破壊効果でブロッカーは破壊される
    const { s, blocker } = setupBlocked("immunity-control")
    assert(s.battle?.blockerInstanceId === blocker, "ブロック宣言済み（対照）")
    resolveAction(s, "p1", null, { type: "destroy", count: 1, maxBp: 99999 })
    assert(
        findSpiritById(s, "p2", blocker) === undefined,
        "免疫なしならブロッカーは破壊される（対照実験）",
    )
}
{
    const { s, decoy, blocker } = setupBlocked("immunity-target")
    resolveAction(s, "p2", null, { type: "grantBlockerImmunity" })

    // 対象選択: field.spirits[0]（囮）ではなくブロック中のスピリットに付くこと
    assert(
        findSpiritById(s, "p2", blocker)?.immuneToOpponentThisTurn === true,
        "ブロック中のスピリットが対象に選ばれる",
    )
    assert(
        findSpiritById(s, "p2", decoy)?.immuneToOpponentThisTurn === false,
        "先頭の非ブロックスピリットは対象にならない（フォールバック誤爆なし）",
    )

    // 対象を取る効果（destroy は実効BP最大を自動選択＝本来ブロッカーが選ばれる）
    resolveAction(s, "p1", null, { type: "destroy", count: 1, maxBp: 99999 })
    assert(
        findSpiritById(s, "p2", blocker) !== undefined,
        "免疫中は相手の対象を取る破壊で破壊されない",
    )
}
{
    // 実対戦経路（カードデータ経由）: ブロック後のフラッシュでフェザーバリアを使用する。
    // ※ この節は `npm run coverage:effects` の (b)「テストが手で組んだ action でしか
    //    実行されていない」に grantBlockerImmunity が出ていたため追加した。
    //    action を直接叩くテストだけでは、cards.json 側の記述（timing/flash）が検証されない
    const { s, blocker } = setupBlocked("immunity-castmagic")
    s.players.p2.hand = ["BS01-139"] // フェザーバリア（緑・コスト5・フラッシュ）
    s.players.p2.reserve = 10
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "フェザーバリアをブロック後のフラッシュで使用できる",
    )
    assert(
        findSpiritById(s, "p2", blocker)?.immuneToOpponentThisTurn === true,
        "カード使用でもブロッカーに免疫が付く",
    )
    resolveAction(s, "p1", null, { type: "destroy", count: 1, maxBp: 99999 })
    assert(
        findSpiritById(s, "p2", blocker) !== undefined,
        "カード経由の免疫でも破壊されない",
    )
}
{
    const { s, blocker } = setupBlocked("immunity-range")
    resolveAction(s, "p2", null, { type: "grantBlockerImmunity" })
    // 範囲効果（destroyAll）も受けない＝untargetableByOpponent との違い
    resolveAction(s, "p1", null, { type: "destroyAll", maxBp: 99999 })
    assert(
        findSpiritById(s, "p2", blocker) !== undefined,
        "免疫中は範囲効果（destroyAll）でも破壊されない",
    )
}
{
    // 「このターンの間」＝ターン終了でリセットされる
    const { s, blocker } = setupBlocked("immunity-reset")
    resolveAction(s, "p2", null, { type: "grantBlockerImmunity" })
    assert(
        findSpiritById(s, "p2", blocker)?.immuneToOpponentThisTurn === true,
        "免疫フラグが立つ",
    )
    // バトル中なのでまずバトルを終わらせる（ブロック後の優先権は防御側から。双方パスで解決）
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス＝バトル解決")
    assert(s.battle === null, "バトルが解決済み")
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了")
    const survived = findSpiritById(s, "p2", blocker)
    assert(
        survived === undefined || survived.immuneToOpponentThisTurn === false,
        "ターン終了で免疫フラグがリセットされる",
    )
}

// ---------------------------------------------------------------------------
// §C returnSelfToHand（破壊時に自分の手札へ戻る）
//
// `npm run coverage:effects`（実行時カバレッジ計測）で、**この action.type だけ
// 実行実績が0件**だと判明した。使用3枚（BS01-032 ガウルム／BS01-045 切り裂きヘディレス／
// BS02-020 レディ・フランケリー）はいずれも smoke に登場するため、
// 「機構の使用カードが smoke に出てくるか」の静的な棚卸しでは見つからなかった層。
//
// 実装は「破壊で**すでにトラッシュへ送られた**自分のカードを lastIndexOf で拾い直す」形なので、
// **破壊処理とトリガー発火の順序**に依存する。順序が変わると log も出さず無言で不発になる。
console.log("=== §C returnSelfToHand: 破壊時に手札へ戻る（実行実績0だった経路） ===")
{
    // ガウルムは Lv2（コア3個）でのみ発揮する
    const s = setupAttackStep("returnself-effect")
    const gaurum = put(s, "p2", "BS01-032", 3)
    const before = s.players.p2.hand.length
    resolveAction(s, "p1", null, { type: "destroy", count: 1, maxBp: 99999 })

    assert(findSpiritById(s, "p2", gaurum) === undefined, "破壊されてフィールドを離れる")
    assert(
        s.players.p2.hand.filter((c) => c === "BS01-032").length === 1,
        "破壊時に手札へ戻る（効果による破壊）",
    )
    assert(s.players.p2.hand.length === before + 1, "手札が1枚増えている")
    assert(
        !s.players.p2.trashCards.includes("BS01-032"),
        "トラッシュには残らない（拾い直しが効いている）",
    )
}
{
    // レベル条件: Lv1（コア1個）では発揮しない＝トラッシュに残る
    const s = setupAttackStep("returnself-level")
    put(s, "p2", "BS01-032", 1)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, maxBp: 99999 })
    assert(
        !s.players.p2.hand.includes("BS01-032"),
        "Lv1 では手札に戻らない（levels 条件が効いている）",
    )
    assert(s.players.p2.trashCards.includes("BS01-032"), "Lv1 ではトラッシュに残る")
}
{
    // バトルによる破壊（BP比較）でも戻る＝効果破壊とは別経路
    const s = setupAttackStep("returnself-battle")
    const attacker = put(s, "p1", "BS01-002", 1)
    const gaurum = put(s, "p2", "BS01-032", 3) // Lv2 BP5000
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 10000 }, attacker) // BP勝ちさせる

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: gaurum }) === null, "ガウルムがブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側がパス＝バトル解決")

    assert(findSpiritById(s, "p2", gaurum) === undefined, "バトルで破壊された")
    assert(
        s.players.p2.hand.filter((c) => c === "BS01-032").length === 1,
        "バトルによる破壊でも手札へ戻る",
    )
}
