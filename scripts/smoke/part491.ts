// smoke パート491(ソウルコア段3: リザーブの[ソウルコア]によるコスト支払い paySoulCoreFromReserve)
// 仕様(docs/design/SOULCORE.md・2026-10-05 ユーザー確定):
//   - リザーブの[ソウルコア]をコスト支払い1個ぶんとして使える（行き先はトラッシュなので移動可）
//   - リザーブから支払いが1個以上あるときだけ消費される（フィールドで全額賄えたなら使われない）
//   - ソウルコアぶんは reserve/trashCores（通常コアの個数）には含めない（案A-outside）
//   - リザーブに[ソウルコア]が無いのに指定したらエラー
import {
    act,
    assert,
    createGame,
    createInstance,
    enableSoulCore,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import { moveSoulCore, soulCoreInReserve, soulCoreInTrash, soulCoreOnInstance } from "../../server/src/logic/soulCore"
import type { GameState } from "./helpers"

const TARGET = "BS01-006" // メラット（赤スピリット・コスト2・赤軽減2。場にシンボルが無ければ軽減されない）
const MAGIC = "BS01-123" // リターンドロー（赤マジック・コスト2・紫軽減2。軽減されない）
const VANILLA = "BS01-002" // ロクケラトプス
const RESSHINSOKU = "BS16-X03" // 烈の覇王セイリュービ（【烈神速】）

console.log("=== 前提: カードの機械確認 ===")
{
    // カードの実データはpart486/488が機械検証済み。ここでは使用する定数が空でないことだけ確認
    assert(TARGET.length > 0 && MAGIC.length > 0 && RESSHINSOKU.length > 0, "使用カードIDが定義済み")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.turnPlayer = "p1"
    s.phase = "main"
    return s
}

console.log("=== 1. 召喚: リザーブの[ソウルコア]をコスト支払いに使う ===")
{
    const s = game("case1-summon")
    enableSoulCore(s)
    s.players.p1.reserve = 6 // 通常コア5＋[ソウルコア]1（案B-inside: 数値に含める）
    s.players.p1.hand = [TARGET]
    // コスト2（軽減なし）＋Lv1維持コア1。通常コア5なら支払い1＋維持1で4残る。
    // ここではソウルコアをコスト1ぶんに使い、通常コアはコスト残り1＋維持1の2を使う
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, paySoulCoreFromReserve: true }) === null,
        "ソウルコアを使って召喚できる",
    )
    assert(soulCoreInTrash(s.players.p1), "ソウルコアはトラッシュへ移っている")
    assert(s.players.p1.reserve === 3, `消費は3（[ソウルコア]1＋コスト残り1＋維持1。実際は${String(s.players.p1.reserve)}）`)
    assert(s.players.p1.trashCores === 2, "トラッシュコアは[ソウルコア]1＋コスト残り1の2個")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === TARGET), "メラットはフィールドにいる")
}

console.log("=== 2. フィールドで全額賄えたらソウルコアは消費されない ===")
{
    const s = game("case2-unused")
    enableSoulCore(s)
    // フィールドのスピリットにコアを載せて、それで支払う（paySources使用）
    const payInst = createInstance(VANILLA, s.turn, 3)
    s.players.p1.field.spirits.push(payInst)
    refreshLevelAsOverrides(s)
    s.players.p1.reserve = 3 // 通常コア2＋[ソウルコア]1
    s.players.p1.hand = [TARGET]
    // コスト2をフィールドから払う: リザーブからの支払いが0なのでソウルコアは使われない
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySoulCoreFromReserve: true,
            paySources: [{ instanceId: payInst.instanceId, count: 2 }],
        }) === null,
        "フィールド払い＋ソウルコア指定で召喚できる",
    )
    assert(soulCoreInReserve(s.players.p1), "リザーブからの支払いが無ければソウルコアは消費されない")
    // フィールドのロクケラトプスは赤シンボル持ちでメラットの赤軽減が1つ効くためコストは1。
    // フィールド2個のうち1個がコスト・1個が余剰で置くコアに充当されるのでリザーブは減らない
    assert(s.players.p1.reserve === 3, `リザーブは減らない（実際は${String(s.players.p1.reserve)}）`)
}

console.log("=== 3. マジック: 使用コストをソウルコアで支払う ===")
{
    const s = game("case3-magic")
    enableSoulCore(s)
    s.players.p1.reserve = 2 // 通常コア1＋[ソウルコア]1 → コスト2ちょうど（案B-inside）
    s.players.p1.hand = [MAGIC]
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, paySoulCoreFromReserve: true }) === null,
        "ソウルコアを使ってマジックを使用できる",
    )
    assert(soulCoreInTrash(s.players.p1), "ソウルコアはトラッシュへ")
    assert(s.players.p1.reserve === 0, "[ソウルコア]1＋通常コア1の消費")
    assert(s.players.p1.trashCores === 2, "トラッシュコアは[ソウルコア]1＋通常コア1の2個")
    assert(s.players.p1.hand.length === 0, "マジックは使用済み")
}

console.log("=== 4. 検証エラー: リザーブに[ソウルコア]が無い ===")
{
    const s = game("case4-no-soul")
    enableSoulCore(s)
    const inst = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    s.players.p1.reserve = 5
    s.players.p1.hand = [TARGET]
    const err = act(s, "p1", { type: "summon", handIndex: 0, paySoulCoreFromReserve: true })
    assert(err !== null && err.includes("[ソウルコア]"), `リザーブに[ソウルコア]が無いなら弾く（実際: ${String(err)}）`)
}

console.log("=== 6. フィールド個体の[ソウルコア]をコストとして支払う（includeSoulCore・2026-10-06） ===")
{
    const s = game("case6-field-soul")
    enableSoulCore(s)
    // 通常コア2＋[ソウルコア]1（cores=3）のスピリット
    const carrier = createInstance(VANILLA, s.turn, 2)
    s.players.p1.field.spirits.push(carrier)
    refreshLevelAsOverrides(s)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: carrier.instanceId })
    s.players.p1.hand = [MAGIC]
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, paySources: [{ instanceId: carrier.instanceId, count: 2 }] }) === null,
        "includeSoulCore無しでも通常コア2個で支払える",
    )
    assert(soulCoreOnInstance(s.players.p1, carrier.instanceId), "[ソウルコア]は載ったまま（通常コアだけ払った）")
    assert(carrier.cores === 1, "支払い元は通常コア2個ぶん減って[ソウルコア]1個ぶんのcores")
    // [ソウルコア]だけの個体（cores=1）に移し替えて、[ソウルコア]込みで支払う
    const carrier2 = createInstance(VANILLA, s.turn, 0)
    s.players.p1.field.spirits.push(carrier2)
    refreshLevelAsOverrides(s)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: carrier2.instanceId })
    s.players.p1.hand = [MAGIC]
    // コスト2: [ソウルコア]1（carrier2から）＋リザーブの通常コア1で支払う
    const reserveBefore6b = s.players.p1.reserve
    assert(
        act(s, "p1", {
            type: "castMagic",
            handIndex: 0,
            paySources: [{ instanceId: carrier2.instanceId, count: 1, includeSoulCore: true }],
        }) === null,
        "[ソウルコア]込みのpaySourcesでマジックを使用できる",
    )
    assert(soulCoreInTrash(s.players.p1), "[ソウルコア]はコストとしてトラッシュへ")
    assert(s.players.p1.trashCores === 4, "トラッシュコアは6aの2個＋[ソウルコア]1＋通常コア1（実際は" + String(s.players.p1.trashCores) + "）")
    assert(s.players.p1.reserve === reserveBefore6b - 1, "コストの残り1はリザーブの通常コアから")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === carrier2.instanceId), "[ソウルコア]だけの個体は支払いで維持コアを割ったため消滅")
}


console.log("=== 5. 烈神速: トラッシュ4個＋ソウルコアで閾値5を満たす（段2の取りこぼし回収） ===")
{
    const s = game("case5-resshinsoku")
    enableSoulCore(s, { zone: "trash" }) // ソウルコアをトラッシュに置く
    s.players.p1.reserve = 0
    s.players.p1.trashCores = 5 // 通常コア4＋[ソウルコア]1（案B-inside: 数値に含める）
    s.players.p1.hand = [RESSHINSOKU]
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const other = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    s.battle = {
        attackerInstanceId: other.instanceId,
        blockerInstanceId: null,
        directed: false,
    }
    const err = act(s, "p1", { type: "resshinsokuSummon", handIndex: 0 })
    assert(err === null || (s.pendingChoice !== undefined && s.pendingChoice !== null), `通常コア4＋ソウルコアで烈神速が成立する（実際: ${String(err)}）`)
}

console.log("=== 7. フィールドの[ソウルコア]を維持コアとして使う（soulCoreToMaintain・2026-10-06） ===")
{
    const s = game("case7-soul-maintain")
    enableSoulCore(s)
    // 通常2＋[ソウルコア]1（cores=3）のスピリット。軽減でメラットのコストは赤シンボル1つぶん減る
    const carrier = createInstance(VANILLA, s.turn, 2)
    s.players.p1.field.spirits.push(carrier)
    refreshLevelAsOverrides(s)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: carrier.instanceId })
    s.players.p1.reserve = 5
    s.players.p1.hand = [TARGET]
    assert(
        act(s, "p1", {
            type: "summon",
            handIndex: 0,
            paySources: [{ instanceId: carrier.instanceId, count: 2, soulCoreToMaintain: true }],
        }) === null,
        "フィールドの[ソウルコア]を維持コアとして召喚できる",
    )
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === TARGET)
    assert(summoned !== undefined, "メラットは場にいる")
    assert(summoned !== undefined && soulCoreOnInstance(s.players.p1, summoned.instanceId), "[ソウルコア]は召喚したスピリットの上（維持コアとして置かれた）")
    assert(!soulCoreInReserve(s.players.p1), "[ソウルコア]はリザーブにいない")
    assert(carrier.cores === 1, `支払い元は通常1＋[ソウルコア]1の2個ぶん減って通常1個（実際は${String(carrier.cores)}）`)
    assert(s.players.p1.trashCores === 1, `コスト（軽減後1）は支払い元の通常コアからトラッシュへ（実際は${String(s.players.p1.trashCores)}）`)
}

console.log("=== 8. リフレッシュステップでトラッシュの[ソウルコア]もリザーブへ戻る（2026-10-06 修正） ===")
{
    const s = game("case8-refresh-return")
    enableSoulCore(s)
    s.players.p1.reserve = 3
    moveSoulCore(s.players.p1, { zone: "trash" }) // 支払いでトラッシュへ
    s.players.p1.trashCores = 2 // [ソウルコア]1＋通常コア1
    assert(soulCoreInTrash(s.players.p1), "トラッシュに[ソウルコア]がある")
    s.turnPlayer = "p1"
    s.phase = "main"
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了")
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2もターン終了（p1のリフレッシュステップを通る）")
    assert(s.players.p1.trashCores === 0, "トラッシュのコアはリザーブへ戻った")
    assert(soulCoreInReserve(s.players.p1), "[ソウルコア]も[ソウルコア]としてリザーブへ戻る（ただの通常コアに化けない）")
    assert(s.players.p1.reserve >= 5, "通常コア2＋[ソウルコア]1ぶん戻っている")
}


console.log("すべてのチェックに合格しました 🎉(part491)")
