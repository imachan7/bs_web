// smoke パート95（「メイン：〈固有効果〉／フラッシュ：〈BP+N〉」構造のマジックのうち、
// メイン側が「このターンの間、〜」の継続効果になっている8枚を実装）
//
// すべて既存の lendSelfThisTurn（マジック自身をこのターンだけ仮想発生源として場に置く器）を使う。
// TURN_EFFECT_SOURCES.md の3つの罠（levels:null必須／selfは使えない／effectSources経由の走査）を
// 実際にマジックを使う経路（castMagic → attack/block/takeLife）で検証する。
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== BS03-132 パーフェクトガード：メイン＝装甲持ちの自分のスピリットはBP比較破壊の代わりに疲労状態で戻る ===")
{
    const s = setup("perfectguard-revive")
    const attacker = put(s, "p1", "BS02-040", 1) // ロブスターク（装甲：赤）Lv1 BP1000
    const blocker = put(s, "p2", "BS01-054", 1) // ショックイーター（バニラ）Lv1 BP3000
    s.players.p1.hand = ["BS03-132"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(s.players.p1.turnVirtualInstances.length === 1, "p1に仮想発生源が1件立つ")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    const survivor = s.players.p1.field.spirits.find((x) => x.instanceId === attacker.instanceId)
    assert(survivor !== undefined, "装甲持ちはBP比較破壊の代わりに自分のフィールドに残る")
    assert(survivor?.isRested === true, "疲労状態で戻る")
    assert(!s.players.p1.trashCards.includes("BS02-040"), "トラッシュへは送られていない")
}

console.log("=== BS03-132 パーフェクトガード：マジックを使わなければ従来どおりBP比較で破壊される（逆ケース） ===")
{
    const s = setup("perfectguard-baseline")
    const attacker = put(s, "p1", "BS02-040", 1) // ロブスターク（装甲：赤）Lv1 BP1000
    const blocker = put(s, "p2", "BS01-054", 1) // ショックイーター（バニラ）Lv1 BP3000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        s.players.p1.field.spirits.find((x) => x.instanceId === attacker.instanceId) === undefined,
        "マジックなしでは通常どおり場から消える",
    )
    assert(s.players.p1.trashCards.includes("BS02-040"), "トラッシュへ送られる")
}

console.log("=== BS01-127 キラーテレスコープ：メイン＝疲労状態のスピリットをアタックの対象に選べる ===")
{
    console.log("--- 使用前は疲労スピリットを指定アタックできない ---")
    const s1 = setup("killertelescope-before")
    const attacker1 = put(s1, "p1", "BS01-001", 1) // ゴラドン
    const rested1 = put(s1, "p2", "BS01-054", 1) // ショックイーター
    rested1.isRested = true
    assert(act(s1, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s1, "p1", {
            type: "attack",
            instanceId: attacker1.instanceId,
            targetSpiritInstanceId: rested1.instanceId,
        }) !== null,
        "指定アタックできない（canDirectAttackを持たない）",
    )

    console.log("--- 使用後は疲労スピリットを指定アタックできる ---")
    const s2 = setup("killertelescope-after")
    const attacker2 = put(s2, "p1", "BS01-001", 1) // ゴラドン
    const rested2 = put(s2, "p2", "BS01-054", 1) // ショックイーター
    rested2.isRested = true
    s2.players.p1.hand = ["BS01-127"]
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s2, "p1", {
            type: "attack",
            instanceId: attacker2.instanceId,
            targetSpiritInstanceId: rested2.instanceId,
        }) === null,
        "疲労状態のスピリットを指定してアタックできる",
    )
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
}

console.log("=== BS03-135 エスケープルート：メイン＝系統2つ以上の自分のスピリットはBP比較破壊の代わりに手札に戻る ===")
{
    const s = setup("escaperoute")
    const attacker = put(s, "p1", "BS03-026", 1) // 木精ドリアドナ（樹魔/楽族＝系統2つ）Lv1 BP1000
    const blocker = put(s, "p2", "BS01-054", 1) // ショックイーター Lv1 BP3000
    s.players.p1.hand = ["BS03-135"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        s.players.p1.field.spirits.find((x) => x.instanceId === attacker.instanceId) === undefined,
        "場からは消える（トラッシュではなく手札へ）",
    )
    assert(s.players.p1.hand.includes("BS03-026"), "手札に戻る")
    assert(!s.players.p1.trashCards.includes("BS03-026"), "トラッシュへは送られていない")
}

console.log("=== BS04-092 ドラゴンズラッシュ：メイン＝翼竜/竜人/古竜の自分のスピリットは相手だけを破壊したとき回復する ===")
{
    const s = setup("dragonsrush")
    const attacker = put(s, "p1", "BS01-005", 1) // アイバーン（翼竜）Lv1 BP2000
    const blocker = put(s, "p2", "BS01-001", 1) // ゴラドン Lv1 BP1000
    s.players.p1.hand = ["BS04-092"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決（相手だけ破壊）")
    assert(s.players.p2.trashCards.includes("BS01-001"), "ブロッカーは破壊されトラッシュへ")
    const survivor = s.players.p1.field.spirits.find((x) => x.instanceId === attacker.instanceId)
    assert(survivor !== undefined, "アタッカーは生存")
    assert(survivor?.isRested === false, "勝利したドラゴン系統は回復する（アタック直後の疲労が解除される）")
}

console.log("=== BS05-068 シンクロニシティ：メイン＝覚醒持ちはBP4000以上の相手スピリットを指定してアタックできる ===")
{
    console.log("--- BP4000以上の相手は指定アタックできる ---")
    const s1 = setup("synchronicity-ok")
    const attacker1 = put(s1, "p1", "BS01-013", 1) // タウロスナイト（覚醒）Lv1 BP3000
    const highBpTarget = put(s1, "p2", "BS01-025", 1) // 要塞龍ギガ Lv1 BP5000
    s1.players.p1.hand = ["BS05-068"]
    assert(act(s1, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s1, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s1, "p1", {
            type: "attack",
            instanceId: attacker1.instanceId,
            targetSpiritInstanceId: highBpTarget.instanceId,
        }) === null,
        "BP5000（4000以上）のスピリットを指定してアタックできる",
    )
    assert(act(s1, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s1, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")

    console.log("--- BP4000未満の相手は指定アタックできない ---")
    const s2 = setup("synchronicity-ng")
    const attacker2 = put(s2, "p1", "BS01-013", 1) // タウロスナイト（覚醒）Lv1 BP3000
    const lowBpTarget = put(s2, "p2", "BS01-001", 1) // ゴラドン Lv1 BP1000
    s2.players.p1.hand = ["BS05-068"]
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s2, "p1", {
            type: "attack",
            instanceId: attacker2.instanceId,
            targetSpiritInstanceId: lowBpTarget.instanceId,
        }) !== null,
        "BP1000（4000未満）のスピリットは指定できない",
    )
}

console.log("=== BS05-084 ポテンシャルパワー：メイン＝バニラの自分のスピリットは同コスト以下にブロックされない ===")
{
    console.log("--- 同コスト以下のブロッカーはブロックできない ---")
    const s1 = setup("potentialpower-blocked")
    const attacker1 = put(s1, "p1", "BS01-005", 1) // アイバーン（バニラ）コスト2 BP2000
    const lowCostBlocker = put(s1, "p2", "BS01-002", 1) // ロクケラトプス（バニラ）コスト1
    s1.players.p1.hand = ["BS05-084"]
    assert(act(s1, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s1, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s1, "p1", { type: "attack", instanceId: attacker1.instanceId }) === null, "p1がアタック")
    assert(
        act(s1, "p2", { type: "block", instanceId: lowCostBlocker.instanceId }) !== null,
        "コスト1（アタッカーのコスト2以下）はブロックできない",
    )

    console.log("--- コストが高いブロッカーはブロックできる ---")
    const s2 = setup("potentialpower-unblocked")
    const attacker2 = put(s2, "p1", "BS01-005", 1) // アイバーン（バニラ）コスト2 BP2000
    const highCostBlocker = put(s2, "p2", "BS01-008", 1) // メタルバーン（バニラ）コスト3
    s2.players.p1.hand = ["BS05-084"]
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック")
    assert(
        act(s2, "p2", { type: "block", instanceId: highCostBlocker.instanceId }) === null,
        "コスト3（アタッカーのコスト2より高い）はブロックできる",
    )
}

console.log("=== BS05-067 ワーニングアタック：メイン＝翼竜/空牙の自分のスピリットは相手にBP3000以下のブロックを強制する ===")
{
    console.log("--- BP3000以下の合法ブロッカーがいるときはライフ受け拒否 ---")
    const s1 = setup("warningattack-forced")
    const attacker1 = put(s1, "p1", "BS01-005", 1) // アイバーン（翼竜）
    put(s1, "p2", "BS03-026", 1) // 木精ドリアドナ（バニラ）BP1000
    s1.players.p1.hand = ["BS05-067"]
    assert(act(s1, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s1, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s1, "p1", { type: "attack", instanceId: attacker1.instanceId }) === null, "p1がアタック")
    assert(
        act(s1, "p2", { type: "takeLife" }) !== null,
        "BP3000以下の合法ブロッカーがいるためライフ受けは拒否される",
    )

    console.log("--- BP3000以下の合法ブロッカーがいないときはライフ受け可能 ---")
    const s2 = setup("warningattack-free")
    const attacker2 = put(s2, "p1", "BS01-005", 1) // アイバーン（翼竜）
    put(s2, "p2", "BS01-025", 1) // 要塞龍ギガ BP5000（3000超）
    s2.players.p1.hand = ["BS05-067"]
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック")
    assert(
        act(s2, "p2", { type: "takeLife" }) === null,
        "BP3000以下の合法ブロッカーがいなければライフ受けできる",
    )
}

console.log("=== BS02-105 グレートウォール：メイン＝コスト6と8のスピリットはアタック/ブロック不可 ===")
{
    const s = setup("greatwall")
    const locked = put(s, "p1", "BS01-020", 1) // 翼刃竜スティラノドン コスト6
    const free = put(s, "p1", "BS03-020", 1) // メガ・ハンプダンプ（バニラ）コスト5
    const blocker = put(s, "p2", "BS01-025", 1) // 要塞龍ギガ コスト8
    s.players.p1.hand = ["BS02-105"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: locked.instanceId }) !== null,
        "コスト6のスピリットはアタックできない",
    )
    assert(
        act(s, "p1", { type: "attack", instanceId: free.instanceId }) === null,
        "コスト5のスピリットは影響を受けずアタックできる",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) !== null,
        "コスト8のスピリットはブロックできない",
    )
    assert(act(s, "p2", { type: "takeLife" }) === null, "ブロックできないためライフで受ける")
}
