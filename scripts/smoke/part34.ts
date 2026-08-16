// smoke パート34（第三弾 BS03 構造化バッチ：フレイア／オリバー／トランプの王国／ユナイテッドパワー／セイムタイアード）
//   - kind: "lifeDamageNegate"（BS03-047 硝子の女神フレイア）
//   - アクション: discardOpponentDownTo（BS03-095 奇術師オリバー）
//   - kind: "exhaustImmunityGrant"（BS03-112 トランプの王国 e1）＋既存fieldEvent refreshOne（e2）
//   - アクション: bpBuffByExhaustOwn（BS03-131 ユナイテッドパワー）
//   - アクション: exhaustOpponentToMatch（BS03-139 セイムタイアード）
import {
    act,
    takeLifeAndResolve,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    fireStepTriggers,
    resolveAction,
    runTurnStart,
} from "./helpers"

console.log("=== BS03-047 硝子の女神フレイア：アタッカーBP<=フレイアBPならライフは減らない ===")
{
    const s = createGame(
        "freya-negate-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "white" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS03-047", s.turn, 1) // Lv1 BP3000
    const freya = createInstance("BS03-047", s.turn, 1) // Lv1 BP3000（防御側）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(freya)
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "attackerでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "防御側はライフで受ける（バトル終了）")
    assert(s.players.p2.life === lifeBefore, "アタッカーBP<=フレイアBPのためライフは減らなかった")
}

console.log("=== BS03-047 硝子の女神フレイア：アタッカーBPがフレイアBPを超える場合は通常通り減る ===")
{
    const s = createGame(
        "freya-exceed-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "white" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS03-047", s.turn, 3) // Lv2 BP5000
    const freya = createInstance("BS03-047", s.turn, 1) // Lv1 BP3000（防御側）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(freya)
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "attackerでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "防御側はライフで受ける（バトル終了）")
    assert(s.players.p2.life === lifeBefore - 1, "アタッカーBPがフレイアBPを超えるためライフが1減った")
}

console.log("=== BS03-095 奇術師オリバー：相手のスタートステップに手札5枚→3枚まで破棄 ===")
{
    const s = createGame(
        "oliver-discard-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const oliver = createInstance("BS03-095", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(oliver)
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003", "BS01-004", "BS01-005"]
    s.turnPlayer = "p2" // 「相手のスタートステップ」＝オリバーの持ち主(p1)から見て非turnPlayerのとき
    fireStepTriggers(s, "start")
    assert(s.players.p2.hand.length === 3, "相手の手札が3枚になるまで破棄された")
}

console.log("=== BS03-095 奇術師オリバー：手札3枚以下なら不発 ===")
{
    const s = createGame(
        "oliver-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const oliver = createInstance("BS03-095", s.turn, 1)
    s.players.p1.field.spirits.push(oliver)
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]
    s.turnPlayer = "p2"
    fireStepTriggers(s, "start")
    assert(s.players.p2.hand.length === 3, "手札3枚のままで発動しなかった")
}

console.log("=== BS03-112 トランプの王国 e1：自分のアタックステップ中、相手の効果で四道は疲労しない ===")
{
    const s = createGame(
        "trump-immunity-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const trump = createInstance("BS03-112", s.turn, 0) // Lv1
    const ken = createInstance("BS02-056", s.turn, 1) // アルカナビースト・ケン（四道）Lv1
    s.players.p1.field.nexuses.push(trump)
    s.players.p1.field.spirits.push(ken)
    s.phase = "attack"
    s.turnPlayer = "p1" // 自分のアタックステップ
    resolveAction(s, "p2", null, { type: "exhaust", count: 1 }, ken.instanceId)
    assert(!ken.isRested, "相手の効果では四道は疲労しなかった")
    resolveAction(s, "p1", null, { type: "exhaust", count: 1 }, ken.instanceId)
    assert(ken.isRested, "自分の効果では通常通り疲労した")
}

console.log("=== BS03-112 トランプの王国 e2：自分の黄のスピリットが破壊されたとき四道1体を回復 ===")
{
    const s = createGame(
        "trump-refresh-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const trump = createInstance("BS03-112", s.turn, 3) // Lv2
    const ken = createInstance("BS02-056", s.turn, 1) // 四道（疲労中）
    ken.isRested = true
    const piyon = createInstance("BS02-049", s.turn, 1) // 黄・四道でない
    s.players.p1.field.nexuses.push(trump)
    s.players.p1.field.spirits.push(ken, piyon)
    s.phase = "attack"
    s.turnPlayer = "p1"
    destroySpirit(s, "p1", piyon.instanceId)
    assert(!ken.isRested, "自分の黄スピリット破壊で四道ケンが回復した")
}

console.log("=== BS03-131 ユナイテッドパワー：疲労させたスピリットのBP分バフ ===")
{
    const s = createGame(
        "unitedpower-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const low = createInstance("BS02-049", s.turn, 1) // ピヨン Lv1 BP1000
    const high = createInstance("BS03-054", s.turn, 3) // アルカナドール・トリア Lv2 BP4000
    s.players.p1.field.spirits.push(low, high)
    resolveAction(s, "p1", null, { type: "bpBuffByExhaustOwn" })
    assert(high.isRested, "実効BP最大の回復スピリット(high)が疲労させられた")
    assert(low.tempBpBuff === 4000, "field先頭(low)がhighの実効BP分バフされた")
    assert(high.tempBpBuff === 0, "疲労させた側(high)自身はバフされない")
}

console.log("=== BS03-131 ユナイテッドパワー：回復状態のスピリットがいなければ不発 ===")
{
    const s = createGame(
        "unitedpower-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const rested = createInstance("BS02-049", s.turn, 1)
    rested.isRested = true
    s.players.p1.field.spirits.push(rested)
    resolveAction(s, "p1", null, { type: "bpBuffByExhaustOwn" })
    assert(rested.tempBpBuff === 0, "対象がいないためバフされなかった")
    assert(rested.isRested, "疲労状態も変化しなかった")
}

console.log("=== BS03-131 ユナイテッドパワー：interactiveTargets時は疲労元→バフ先の2段choice ===")
{
    const s = createGame(
        "unitedpower-choice-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    s.interactiveTargets = true
    const low = createInstance("BS02-049", s.turn, 1) // BP1000
    const high = createInstance("BS03-054", s.turn, 3) // BP4000
    s.players.p1.field.spirits.push(low, high)
    resolveAction(s, "p1", null, { type: "bpBuffByExhaustOwn" })
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.candidates.length === 2, "疲労させる対象の選択待ちになった")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: high.instanceId }) === null, "highを疲労対象に選ぶ")
    assert(high.isRested, "選んだhighが疲労した")
    assert(s.pendingChoice?.kind === "target", "続けてバフ先の選択待ちになった")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: low.instanceId }) === null, "lowをバフ先に選ぶ")
    assert(low.tempBpBuff === 4000, "lowがhighの実効BP分バフされた")
    assert(s.pendingChoice === null, "選択が完了した")
}

console.log("=== BS03-139 セイムタイアード：疲労数が同じになるまで相手を疲労させる ===")
{
    const s = createGame(
        "sametired-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const mine = createInstance("BS02-049", s.turn, 1)
    mine.isRested = true // 自分の疲労スピリット1体
    const enemyLow = createInstance("BS02-049", s.turn, 1) // BP1000
    const enemyHigh = createInstance("BS03-054", s.turn, 3) // BP4000
    s.players.p1.field.spirits.push(mine)
    s.players.p2.field.spirits.push(enemyLow, enemyHigh)
    resolveAction(s, "p1", null, { type: "exhaustOpponentToMatch" })
    assert(enemyHigh.isRested, "実効BP最大(enemyHigh)が疲労させられた")
    assert(!enemyLow.isRested, "差分は1体分のためenemyLowはそのまま")
}

console.log("=== BS03-139 セイムタイアード：自分の疲労数が相手以下なら不発 ===")
{
    const s = createGame(
        "sametired-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const mine = createInstance("BS02-049", s.turn, 1) // 自分は疲労なし
    const enemyRested = createInstance("BS02-049", s.turn, 1)
    enemyRested.isRested = true
    const enemyReady = createInstance("BS03-054", s.turn, 3)
    s.players.p1.field.spirits.push(mine)
    s.players.p2.field.spirits.push(enemyRested, enemyReady)
    resolveAction(s, "p1", null, { type: "exhaustOpponentToMatch" })
    assert(!enemyReady.isRested, "自分の疲労数が相手以下のため発動しなかった")
}
