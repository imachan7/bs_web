// smoke パート492(ソウルコア段4: §1.3の持ち主選択。相手効果で[ソウルコア]が載った個体から
// リザーブ/トラッシュへコアを移すとき、文言の有無にかかわらず一律に持ち主へ「含めるか」を聞く)
// 仕様(2026-10-05 ユーザー確定):
//   - 効果の発動者と対象の持ち主が違い、対象に[ソウルコア]が載っていて、行き先がリザーブ/トラッシュのとき聞く
//   - 選ぶのは対象の持ち主（効果の解決は発動者側のまま）。非対話のデフォルトは含めない（通常コア優先）
//   - 含めたとき: ソウルコア1個ぶんも移す個数に数える。数値(reserve/trashCores)には含めない（案A-outside）
//   - ボイド行きは選択なし（ソウルコアは行けない）
import {
    act,
    assert,
    createGame,
    createInstance,
    enableSoulCore,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import { moveSoulCore, soulCoreInReserve, soulCoreInTrash, soulCoreOnInstance } from "../../server/src/logic/soulCore"
import { removeCoresToTrash } from "../../server/src/logic/removal"
import type { GameState, PlayerId } from "./helpers"

const TARGET = "BS10-066" // 騎士王蛇ペンドラゴン（ブレイヴ。召喚時: 相手スピリット1体のコア2個をリザーブへ）
const VANILLA = "BS01-002" // ロクケラトプス（Lv1維持コア1）

console.log("=== 前提: カードの機械確認 ===")
{
    const card = getCard(TARGET)
    assert(card.name === "騎士王蛇ペンドラゴン" && card.type === "brave", "TARGET は騎士王蛇ペンドラゴン（ブレイヴ）")
    assert(
        card.effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon" && e.action.type === "coreRemove"),
        "召喚時に coreRemove を持つ",
    )
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.turnPlayer = "p1"
    s.phase = "main"
    return s
}

// p2の場に「通常コア2個＋[ソウルコア]」のスピリットを置く
function putSoulCarrier(s: GameState, cores = 2): ReturnType<typeof createInstance> {
    const inst = createInstance(VANILLA, s.turn, cores)
    s.players.p2.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    moveSoulCore(s.players.p2, { zone: "instance", instanceId: inst.instanceId })
    return inst
}

// pendingChoice に部分一致で答える
function answer(s: GameState, pid: PlayerId, includes: string): string | null {
    const pending = s.pendingChoice
    if (!pending) return "選択待ちがありません"
    const option = (pending.options ?? []).find((o) => o.includes(includes))
    if (option === undefined) return `候補が見つかりません（${includes}）`
    return handleAction(s, pid, { type: "resolveChoice", option })
}

console.log("=== 1. 非対話: デフォルトは含めない（通常コア2個だけ動き、ソウルコアは残る） ===")
{
    const s = game("case1-noninteractive")
    enableSoulCore(s)
    const carrier = putSoulCarrier(s)
    s.players.p1.hand = [TARGET]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(carrier.cores === 1, "通常コア2個が取り除かれた（残り1個ぶんは[ソウルコア]）")
    assert(soulCoreOnInstance(s.players.p2, carrier.instanceId), "ソウルコアは対象に載ったまま")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === carrier.instanceId), "ソウルコアが維持コアを満たすため消滅しない")
    const deckAfter = s.players.p1.deck.length
    assert(deckAfter === 40, `[ソウルコア]が残るため cores は0にならず drawIfEmptied は不発（実際は${String(deckAfter)}）`)
}

console.log("=== 2. 対話・「残す」: 持ち主(p2)に選択が出て、残せばソウルコアは動かない ===")
{
    const s = game("case2-keep")
    enableSoulCore(s)
    s.interactiveTargets = true
    const carrier = putSoulCarrier(s)
    s.players.p1.hand = [TARGET]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚する")
    assert(
        s.pendingChoice !== null && s.pendingChoice.pid === "p2" && (s.pendingChoice.options ?? []).some((o) => o.includes("[ソウルコア]")),
        "対象の持ち主(p2)に[ソウルコア]を含めるかの選択待ちが立つ",
    )
    assert(answer(s, "p2", "[ソウルコア]は残す") === null, "「残す」で応答")
    assert(carrier.cores === 1, "通常コア2個だけ取り除かれた（残り1個ぶんは[ソウルコア]）")
    assert(soulCoreOnInstance(s.players.p2, carrier.instanceId), "ソウルコアは残る")
    assert(s.players.p2.reserve === 11, `通常コア2個がリザーブへ（putSoulCarrierでソウルコアぶん-1済み。実際は${String(s.players.p2.reserve)}）`)
}

console.log("=== 3. 対話・「含める」: ソウルコアも一緒にリザーブへ。数値には含めない ===")
{
    const s = game("case3-include")
    enableSoulCore(s)
    s.interactiveTargets = true
    const carrier = putSoulCarrier(s)
    s.players.p1.hand = [TARGET]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚する")
    assert(
        s.pendingChoice !== null && s.pendingChoice.pid === "p2",
        "選択待ちが立つ",
    )
    assert(answer(s, "p2", "[ソウルコア]を含める") === null, "「含める」で応答")
    // 2個 = [ソウルコア]1個＋通常コア1個
    assert(carrier.cores === 1, "取り除き2個のうち通常コアは1個（残り1個ぶんは[ソウルコア]）")
    assert(soulCoreInReserve(s.players.p2), "ソウルコアはリザーブへ移った")
    assert(s.players.p2.reserve === 11, `リザーブへ通常コア1＋[ソウルコア]1（putSoulCarrierで-1済み。実際は${String(s.players.p2.reserve)}）`)
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === carrier.instanceId), "通常コア1個が残るため消滅しない")
}

console.log("=== 4. トラッシュ行きの primitive: includeSoul でソウルコアもトラッシュへ（trashCoresには含めない） ===")
{
    const s = game("case4-trash")
    enableSoulCore(s)
    const carrier = putSoulCarrier(s, 1)
    s.players.p2.trashCores = 0
    removeCoresToTrash(s, "p2", carrier, 2, "p1", true)
    assert(soulCoreInTrash(s.players.p2), "ソウルコアはトラッシュへ")
    assert(carrier.cores === 0, "通常コア1個＋[ソウルコア]1個の両方が取り除かれた")
    assert(s.players.p2.trashCores === 2, "トラッシュコアは通常コア1＋[ソウルコア]1の2個")
}

console.log("すべてのチェックに合格しました 🎉(part492)")
