// smoke パート118（残りの効果実装漏れ：ネクサス2枚＋パンデミウム）
//
// 新設した機構:
//   - action "markUnblockableThisTurn" ＋ CardInstance.unblockableOnceThisTurn
//     （「ターンに1回ブロックされない」印。canBlock が参照し、clearBattle で使い切る）
//   - action "discardBothHands"（お互いが手札からcount枚を破棄。破棄カードは各自が選ぶ→part234。非対話では末尾から）
//   - kind:"battleBpAsLevel"（バトルのBP比較のときだけ別レベルのBPを使う。EffectModules.battleBp）
// 実装したカード:
//   - BS04-081 強者統べる大地 Lv2（BP10000以上の自分のスピリット1体はターンに1回ブロックされない）
//   - BS04-X14 魔界七将パンデミウム Lv2･Lv3（自分がバトル破壊されたとき相手1体を疲労）／Lv3（破壊時お互い手札5枚破棄）
//   - BS03-107 果て無き地平線 Lv1（自分のLv1スピリットはバトルのBP比較でLv2BPを使う）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    destroySpirit,
    getCard,
    handleAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS04-081").name === "強者統べる大地" && getCard("BS04-081").type === "nexus", "BS04-081 は強者統べる大地（ネクサス）")
    assert(getCard("BS04-X14").name === "魔界七将パンデミウム", "BS04-X14 は魔界七将パンデミウム")
    assert(getCard("BS03-107").name === "果て無き地平線" && getCard("BS03-107").type === "nexus", "BS03-107 は果て無き地平線（ネクサス）")
    assert(getCard("BS01-025").levels[1]?.bp === 10000, "要塞龍ギガのLv2BPは10000")
    assert(getCard("BS01-005").levels[0]?.bp === 2000 && getCard("BS01-005").levels[1]?.bp === 6000, "アイバーンはLv1 2000／Lv2 6000")
    assert(getCard("BS01-001").levels[1]?.bp === 3000, "ゴラドンのLv2BPは3000")
}

console.log("=== BS04-081 強者統べる大地 Lv2：BP10000以上の自分のスピリット1体はターンに1回ブロックされない ===")
{
    const s = createGame("t118-land-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS04-081", 1) // Lv2
    assert(currentLevel(nexus).level === 2, `強者統べる大地は1コアでLv2（実際: ${String(currentLevel(nexus).level)}）`)
    const giga = put(s, "p1", "BS01-025", 3) // 要塞龍ギガ Lv2（BP10000）
    const small = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1（BP1000）＝BP10000未満
    const blocker = put(s, "p2", "BS01-031", 4) // デス・ハーデス Lv2（BP7000）

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ（ステップ誘発が発動する）")
    assert(giga.unblockableOnceThisTurn === true, "BP10000以上のギガに印が付く")
    assert(small.unblockableOnceThisTurn !== true, "BP10000未満のスピリットには付かない")

    assert(act(s, "p1", { type: "attack", instanceId: giga.instanceId }) === null, "ギガでアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) !== null, "印の付いたアタッカーはブロックできない")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(giga.unblockableOnceThisTurn === false, "印はそのアタックの解決で使い切る")

    // 印を使い切ったあとは通常どおりブロックできる（同じターンの2回目のアタック）
    giga.isRested = false
    assert(act(s, "p1", { type: "attack", instanceId: giga.instanceId }) === null, "2回目のアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "2回目はブロックできる")
}

console.log("=== BS04-081 強者統べる大地：Lv1では印を付けない／BP10000以上がいなければ不発 ===")
{
    const s = createGame("t118-land-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS04-081", 0) // Lv1
    const giga = put(s, "p1", "BS01-025", 3)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(giga.unblockableOnceThisTurn !== true, "Lv1では印を付けない")

    const s2 = createGame("t118-land-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s2)
    putNexus(s2, "p1", "BS04-081", 1)
    const weak = put(s2, "p1", "BS01-001", 1)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(weak.unblockableOnceThisTurn !== true, "BP10000以上がいなければ印は付かない")
}

console.log("=== BS04-X14 魔界七将パンデミウム Lv2：自分のスピリットがバトルで破壊されたとき相手1体を疲労 ===")
{
    const s = createGame("t118-pande-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const pande = put(s, "p1", "BS04-X14", 3) // Lv2
    assert(currentLevel(pande).level === 2, `パンデミウムは3コアでLv2（実際: ${String(currentLevel(pande).level)}）`)
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1（BP1000）＝バトルで負ける
    const blocker = put(s, "p2", "BS01-031", 4) // デス・ハーデス Lv2（BP7000）
    const bystander = put(s, "p2", "BS01-025", 3) // 要塞龍ギガ Lv2（BP10000）＝疲労させられる側

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId),
        "自分のスピリットがBP比較で破壊される",
    )
    assert(bystander.isRested === true, "パンデミウムの効果で相手のスピリット1体が疲労する")
}

console.log("=== BS04-X14 魔界七将パンデミウム：Lv1では疲労させない ===")
{
    const s = createGame("t118-pande-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    put(s, "p1", "BS04-X14", 1) // Lv1
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-031", 4)
    const bystander = put(s, "p2", "BS01-025", 3)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(bystander.isRested === false, "Lv1では疲労させない")
}

console.log("=== BS04-X14 魔界七将パンデミウム Lv3：このスピリットの破壊時、お互い手札5枚を破棄 ===")
{
    const s = createGame("t118-pande-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const pande = put(s, "p1", "BS04-X14", 6) // Lv3
    assert(currentLevel(pande).level === 3, `パンデミウムは6コアでLv3（実際: ${String(currentLevel(pande).level)}）`)
    while (s.players.p1.hand.length < 6) s.players.p1.hand.push("BS01-001")
    while (s.players.p2.hand.length < 3) s.players.p2.hand.push("BS01-001")
    const p1Before = s.players.p1.hand.length
    const p2Before = s.players.p2.hand.length

    destroySpirit(s, "p1", pande.instanceId, "destroy")
    // 対話モードでは各自が破棄するカードを選ぶ（part234）。消化してから枚数を数える
    let guard = 0
    while (s.pendingChoice && guard++ < 20) {
        const pending = s.pendingChoice
        handleAction(s, pending.pid, { type: "resolveChoice", cardIndex: pending.cardIndices?.[0] ?? 0 })
    }
    assert(
        s.players.p1.hand.length === p1Before - 5,
        `自分は手札5枚を破棄する（実際: ${String(p1Before - s.players.p1.hand.length)}枚）`,
    )
    assert(
        s.players.p2.hand.length === 0,
        `相手は手札が5枚未満ならある分だけ破棄する（実際: ${String(s.players.p2.hand.length)}枚残り。開始${String(p2Before)}枚）`,
    )
}

console.log("=== BS04-X14 魔界七将パンデミウム：Lv2では破壊時の手札破棄は起きない ===")
{
    const s = createGame("t118-pande-4", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    const pande = put(s, "p1", "BS04-X14", 3) // Lv2
    const before = s.players.p1.hand.length
    destroySpirit(s, "p1", pande.instanceId, "destroy")
    assert(s.players.p1.hand.length === before, `Lv2では手札を破棄しない（実際: ${String(before - s.players.p1.hand.length)}枚）`)
}

console.log("=== BS03-107 果て無き地平線 Lv1：自分のLv1スピリットはバトルのBP比較でLv2BPを使う ===")
{
    // 対照：ネクサスなし。アイバーン Lv1（BP2000）はゴラドン Lv2（BP3000）に負ける
    const base = createGame("t118-horizon-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(base)
    const atk0 = put(base, "p1", "BS01-005", 1)
    const blk0 = put(base, "p2", "BS01-001", 3)
    assert(act(base, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(base, "p1", { type: "attack", instanceId: atk0.instanceId }) === null, "アタック宣言")
    assert(declareBlock(base, "p2", blk0.instanceId) === null, "ブロック宣言")
    assert(act(base, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(base, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !base.players.p1.field.spirits.some((x) => x.instanceId === atk0.instanceId),
        "ネクサスなしならLv1のアイバーン（2000）が破壊される",
    )

    const s = createGame("t118-horizon-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const nexus = putNexus(s, "p1", "BS03-107", 0) // Lv1
    assert(currentLevel(nexus).level === 1, `果て無き地平線は0コアでLv1（実際: ${String(currentLevel(nexus).level)}）`)
    const atk = put(s, "p1", "BS01-005", 1) // アイバーン Lv1（Lv2BPは6000）
    const blk = put(s, "p2", "BS01-001", 3) // ゴラドン Lv2（BP3000）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === atk.instanceId),
        "Lv2BP（6000）で比べるのでアイバーンは生き残る",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === blk.instanceId),
        "ゴラドン（3000）が破壊される",
    )
}
