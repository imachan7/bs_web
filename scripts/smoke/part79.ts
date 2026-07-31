// smoke パート79（効果の無効化・読み替え層 その2）
//
//   - BS05-060 茨の決戦地 Lv2: globalConstraint "battlingEffectImmune"
//     （バトル中の両陣営スピリットは、お互いのスピリット/マジックの効果を受けない。
//      破壊・コア除去・疲労・バウンス等のガード地点＝装甲/マジック効果耐性と同じ箇所で判定する）
//   - BS05-048 合成恐竜ディノゾール Lv2: kind "awakenFromReserve"
//     （【覚醒】の効果を「自分のスピリット上か自分のリザーブから」に差し替える。
//      GameAction awaken の fromInstanceId に番兵 AWAKEN_FROM_RESERVE を渡す）
import {
    act,
    assert,
    createGame,
    createInstance,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { AWAKEN_FROM_RESERVE } from "../../shared/rules"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS05-060 茨の決戦地 Lv2：バトル中のスピリットはスピリット/マジックの効果を受けない ===")
{
    const s = setup("ibara-immune-test", "green", "red")
    const nexus = createInstance("BS05-060", s.turn, 1) // 茨の決戦地 Lv2（維持コア1）
    s.players.p1.field.nexuses.push(nexus)
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン（アタッカー）
    const blocker = put(s, "p2", "BS01-031", 1) // デス・ハーデス（ブロッカー）
    const bystander = put(s, "p2", "BS01-001", 1) // バトルに参加していない相手スピリット

    s.phase = "attack"
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: blocker.instanceId,
        flashLockedPlayer: null,
        directed: false,
    }

    // マジックの効果でバトル中のブロッカーを破壊しようとしても受けない
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { maxBp: 99000 } }, blocker.instanceId, undefined, "magic")
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId),
        "バトル中のブロッカーはマジックの破壊効果を受けない",
    )

    // バトルに参加していないスピリットには通常どおり効く
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { maxBp: 99000 } }, bystander.instanceId, undefined, "magic")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === bystander.instanceId),
        "バトル外のスピリットは通常どおり破壊される",
    )

    // コア除去・疲労も同様に通らない
    const coresBefore = blocker.cores
    resolveAction(s, "p1", null, { type: "coreRemove", count: 1 }, blocker.instanceId, undefined, "magic")
    assert(blocker.cores === coresBefore, "バトル中のスピリットはコア除去も受けない")

    resolveAction(s, "p1", null, { type: "exhaust", count: 1 }, blocker.instanceId, undefined, "spirit")
    assert(!blocker.isRested, "バトル中のスピリットはスピリットの効果でも疲労しない")

    // ネクサスの効果は通る（カードテキストは「お互いのスピリット/マジックの効果」）
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 }, blocker.instanceId, undefined, "nexus")
    assert(blocker.isRested, "ネクサスの効果は通る")
}

console.log("--- Lv1（維持コア0）では効果免疫は働かない（コア保護のみ） ---")
{
    const s = setup("ibara-lv1-test", "green", "red")
    const nexus = createInstance("BS05-060", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-031", 1)

    s.phase = "attack"
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: blocker.instanceId,
        flashLockedPlayer: null,
        directed: false,
    }

    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { maxBp: 99000 } }, blocker.instanceId, undefined, "magic")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId),
        "Lv1では効果免疫が無いため破壊される",
    )
}

console.log("--- バトルが終わっていれば免疫は働かない ---")
{
    const s = setup("ibara-nobattle-test", "green", "red")
    const nexus = createInstance("BS05-060", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    const enemy = put(s, "p2", "BS01-031", 1)
    s.phase = "attack"

    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { maxBp: 99000 } }, enemy.instanceId, undefined, "magic")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId),
        "バトル中でなければ通常どおり破壊される",
    )
}

console.log("=== BS05-048 合成恐竜ディノゾール Lv2：【覚醒】がリザーブからも行えるようになる ===")
{
    const s = setup("dinozor-awaken-test", "blue", "red")
    const awakener = put(s, "p1", "BS01-013", 1) // タウロスナイト Lv1（【覚醒】持ち）
    s.players.p1.reserve = 5
    // バトル中のフラッシュタイミングを作る（覚醒はフラッシュタイミングのみ）
    const enemy = put(s, "p2", "BS01-001", 1)
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.battle = {
        attackerInstanceId: enemy.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }

    // ディノゾールがいなければリザーブからの覚醒は拒否される
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: awakener.instanceId,
            fromInstanceId: AWAKEN_FROM_RESERVE,
            count: 2,
        }) !== null,
        "ディノゾールがいなければリザーブからは覚醒できない",
    )

    const dino = put(s, "p1", "BS05-048", 3) // 合成恐竜ディノゾール Lv2（維持コア3）
    s.priorityPlayer = "p1"
    const coresBefore = awakener.cores
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: awakener.instanceId,
            fromInstanceId: AWAKEN_FROM_RESERVE,
            count: 2,
        }) === null,
        "ディノゾールLv2がいればリザーブから覚醒できる",
    )
    assert(awakener.cores === coresBefore + 2, "覚醒先にコア2個が乗る")
    assert(s.players.p1.reserve === reserveBefore - 2, "リザーブからコア2個が減る")
    assert(dino.cores === 3, "ディノゾール自身のコアは減らない（移動元はリザーブ）")

    // リザーブ不足は拒否される
    s.players.p1.reserve = 1
    s.priorityPlayer = "p1"
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: awakener.instanceId,
            fromInstanceId: AWAKEN_FROM_RESERVE,
            count: 5,
        }) !== null,
        "リザーブのコアが足りなければ拒否される",
    )
}

console.log("--- ディノゾールがLv1のときは書き換わらない ---")
{
    const s = setup("dinozor-lv1-test", "blue", "red")
    const awakener = put(s, "p1", "BS01-013", 1)
    put(s, "p1", "BS05-048", 2) // ディノゾール Lv1（維持コア2、Lv2は3）
    s.players.p1.reserve = 5
    const enemy = put(s, "p2", "BS01-001", 1)
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.battle = {
        attackerInstanceId: enemy.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }

    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: awakener.instanceId,
            fromInstanceId: AWAKEN_FROM_RESERVE,
            count: 1,
        }) !== null,
        "Lv1では【覚醒】が書き換わらずリザーブからは覚醒できない",
    )
}
