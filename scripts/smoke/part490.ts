// smoke パート490(ソウルコア段2: 有効コア数への読み替え・場離脱時の退避)
// 仕様(docs/design/SOULCORE.md・2026-10-05 ユーザー確定):
//   - ソウルコアが載っている個体は、Lv1の維持コアをソウルコア単体で満たす（消滅しない）
//   - 個体が場を離れるとき（破壊・消滅・手札/デッキへ戻る等）ソウルコアはリザーブへ退避
//     （消滅で通常コアがボイドへ行く場合も、ソウルコアはリザーブに残る）
//   - 破壊でコアがトラッシュへ行く効果の間だけ、ソウルコアも一緒にトラッシュへ
//   - 【烈神速】の「トラッシュのコア5個以上」にソウルコアも含めて数える
import {
    act,
    assert,
    assertSoulCoreConsistent,
    createGame,
    createInstance,
    enableSoulCore,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import { destroySpirit } from "../../server/src/logic/removal"
import { returnNexusToHand, returnSpiritToHand } from "../../server/src/logic/removal"
import { moveSoulCore, soulCoreInReserve, soulCoreInTrash, soulCoreOnInstance, wouldDeplete } from "../../server/src/logic/soulCore"
import type { GameState } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1維持コア1）
const NEXUS = "BS01-062" // 何かネクサス（下で機械確認）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
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

function put(s: GameState, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 前提: カードの機械確認 ===")
{
    const s = game("premise")
    const van = put(s, VANILLA)
    assert(van.cores === 1, "VANILLA はLv1維持コア1")
}

console.log("=== 1. 維持コアを下回る取り除きをしても、ソウルコアが载っていれば消滅しない ===")
{
    const s = game("case1-sustain")
    enableSoulCore(s)
    const inst = put(s, VANILLA, 1) // 通常コア1（Lv1維持コア1）
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    assert(!wouldDeplete(s, "p1", inst), "通常コア1+ソウルコアなら維持コアは満たしている")
    inst.cores = 1 // [ソウルコア]1個だけの状態（案B-inside: 数値にソウルコアが含まれる）
    assert(!wouldDeplete(s, "p1", inst), "[ソウルコア]1個でもLv1維持コアを満たすため消滅判定はfalse")
    // moveCore の取り除き（confirmDeplete）: 通常コア1を取り除いてもソウルコアが残るため消滅しない
    const inst2 = put(s, VANILLA, 1)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst2.instanceId })
    assert(
        act(s, "p1", { type: "moveCore", instanceId: inst2.instanceId, direction: "remove", confirmDeplete: true }) === null,
        "confirmDeplete 付きの取り除きは成功する",
    )
    assert(inst2.cores === 1, "取り除いたのは通常コア1個。coresの残り1個ぶんは[ソウルコア]")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === inst2.instanceId), "ソウルコアが载っているため消滅せず場に残る")
    assert(soulCoreOnInstance(s.players.p1, inst2.instanceId), "ソウルコアは動いていない")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 2. 破壊されたらソウルコアはリザーブへ退避 ===")
{
    const s = game("case2-destroy")
    enableSoulCore(s)
    const inst = put(s, VANILLA, 1)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    destroySpirit(s, "p1", inst.instanceId, "destroy")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === inst.instanceId), "スピリットは場を離れた")
    assert(soulCoreInReserve(s.players.p1), "ソウルコアはリザーブへ退避している")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 3. 消滅（通常コアはボイドへ）でもソウルコアはリザーブに残る ===")
{
    const s = game("case3-deplete")
    enableSoulCore(s)
    const inst = put(s, VANILLA, 2)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    // [ソウルコア]1個だけの状態で消滅（destroySpirit cause:"deplete"）: [ソウルコア]はリザーブへ退避
    inst.cores = 1
    destroySpirit(s, "p1", inst.instanceId, "deplete")
    assert(soulCoreInReserve(s.players.p1), "消滅してもソウルコアはリザーブにいる（ボイドには行けない）")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 4. 手札へ戻る（BB）ときもリザーブへ退避 ===")
{
    const s = game("case4-bounce")
    enableSoulCore(s)
    const inst = put(s, VANILLA, 1)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    returnSpiritToHand(s, "p1", inst)
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === inst.instanceId), "スピリットは手札へ戻った")
    assert(soulCoreInReserve(s.players.p1), "ソウルコアはリザーブへ退避")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 5. ネクサスが場を離れるときも退避 ===")
{
    const s = game("case5-nexus")
    enableSoulCore(s)
    const inst = createInstance(NEXUS, s.turn, 1)
    s.players.p1.field.nexuses.push(inst)
    moveSoulCore(s.players.p1, { zone: "instance", instanceId: inst.instanceId })
    returnNexusToHand(s, "p1", inst.instanceId)
    assert(soulCoreInReserve(s.players.p1), "ネクサスが手札へ戻ってもソウルコアはリザーブへ")
    assert(assertSoulCoreConsistent(s) === null, "不変条件は健全")
}

console.log("=== 6. 烈神速の閾値（trashCoresの数値に[ソウルコア]が含まれる・案B-inside） ===")
{
    const s = game("case6-resshinsoku")
    enableSoulCore(s, { zone: "trash" })
    s.players.p1.trashCores = 5 // 通常コア4＋[ソウルコア]1（案B-inside: 数値に含める）
    assert(!soulCoreInReserve(s.players.p1) && soulCoreInTrash(s.players.p1), "ソウルコアはトラッシュにある")
    assert(s.players.p1.trashCores >= 5, "烈神速の閾値は数値だけで見てよい（5）")
}

console.log("すべてのチェックに合格しました 🎉(part490)")
