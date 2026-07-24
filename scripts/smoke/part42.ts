// smoke パート42（BS04第四弾 黄・青バッチ: 構造化した代表効果の検証）
// 収録セクション:
//   - BS04-050 ハートレス・ティン：aura colorFilter:white + phaseTurn（相手のアタックステップのみ自分の白+1000）
//   - BS04-051 アルカナビースト・ハルト：kind effectGrant（nameIncludes「アルカナ」でonAttack selfBuff+2000。発生源自身も対象）
//   - BS04-067 ドラ・ゴレム：kind levelAs（ownSpiritsByKeyword:awaken + coresScaled、sourceLevels[2]で発生源自身がLv2の間のみ）
//   - BS04-068 アイアン・ゴレム：selfBuffByHandDiscard（onBlock/onAttackで手札ネクサス1枚破棄しBP+4000）
//   - BS04-074 異合竜ハイドラス：magicRestriction oncePerTurnAll（Lv1）／noFreeCastOpponent（Lv2、バロッサの無償化を打ち消す）
//   - BS04-111 マジックドリル：magic main millPer(counter:opponentHand) + flash bpBuff
import {
    assert,
    act,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"

console.log("=== BS04-050 ハートレス・ティン: 相手のアタックステップのみ自分の白スピリット+1000 ===")
{
    const s = createGame(
        "bs04-050-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "blue" },
    )
    runTurnStart(s)
    const tin = createInstance("BS04-050", s.turn, 1) // ハートレス・ティン Lv1
    s.players.p1.field.spirits.push(tin)
    const white = createInstance("BS01-090", s.turn, 1) // ヘル・ブリンディ Lv1 BP1000（白）
    s.players.p1.field.spirits.push(white)

    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(effectiveBp(s, "p1", white) === 2000, "相手（p2）のアタックステップ中は白スピリットがBP+1000")

    s.turnPlayer = "p1"
    assert(effectiveBp(s, "p1", white) === 1000, "自分のアタックステップ中はオーラが発揮されない")
}

console.log("=== BS04-051 アルカナビースト・ハルト: Lv3でアタック時BP+2000（発生源自身がアルカナ名で対象） ===")
{
    const s = createGame(
        "bs04-051-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const haruto = createInstance("BS04-051", s.turn, 4) // アルカナビースト・ハルト Lv3
    s.players.p1.field.spirits.push(haruto)
    const blocker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(blocker)

    const baseBp = currentLevel(haruto).bp // 5000（Lv3、まだバフ前）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: haruto.instanceId }) === null, "Lv3ハルトでアタック（onAttackでBP+2000）")
    assert(effectiveBp(s, "p1", haruto) === baseBp + 2000, "アタック時に自身がBP+2000される")
}

console.log("=== BS04-067 ドラ・ゴレム: 自身がLv2の間のみ、自分のアタックステップ中【覚醒】持ちをコア数換算Lvとして扱う ===")
{
    const s = createGame(
        "bs04-067-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "green" },
    )
    runTurnStart(s)
    const golem = createInstance("BS04-067", s.turn, 4) // ドラ・ゴレム Lv2（4コア）
    s.players.p1.field.spirits.push(golem)
    const tauros = createInstance("BS01-013", s.turn, 2) // タウロスナイト（【覚醒】持ち）コア2個
    s.players.p1.field.spirits.push(tauros)

    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(currentLevel(tauros).level === 2, "ゴレムがLv2・自分のアタックステップ中はコア2個の覚醒持ちがLv2として扱われる")

    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(currentLevel(tauros).level === 1, "アタックステップ以外は発揮されない（コア2個の素のLvは1）")

    s.phase = "attack"
    golem.cores = 1 // ゴレムをLv1に戻す（sourceLevels:[2]から外れる）
    refreshLevelAsOverrides(s)
    assert(currentLevel(tauros).level === 1, "ゴレムがLv1のときは発揮されない（sourceLevels不一致）")
}

console.log("=== BS04-068 アイアン・ゴレム: ブロック時/アタック時に手札ネクサス1枚破棄でBP+4000（任意コスト） ===")
{
    const s = createGame(
        "bs04-068-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const golem = createInstance("BS04-068", s.turn, 3) // アイアン・ゴレム Lv2（3コア）
    s.players.p2.field.spirits.push(golem)
    s.players.p2.hand = ["BS01-098"] // 燃えさかる戦場（ネクサス）のみに固定（自動選択は「該当タイプの末尾」を破棄するため、引いた手札に別ネクサスがあると対象がぶれてフレーキーになる）
    const atk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p1.field.spirits.push(atk)

    const baseBp = currentLevel(golem).bp // 4000（Lv2、まだバフ前）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "block", instanceId: golem.instanceId }) === null, "アイアン・ゴレムでブロック（手札ネクサス破棄でBP+4000）")
    assert(effectiveBp(s, "p2", golem) === baseBp + 4000, "ブロック時に手札ネクサスを破棄しBP+4000")
    assert(s.players.p2.trashCards.includes("BS01-098"), "破棄したネクサスカードがトラッシュへ")
}

console.log("=== BS04-074 異合竜ハイドラス: oncePerTurnAll（Lv1）／noFreeCastOpponent（Lv2） ===")
{
    const s = createGame(
        "bs04-074-a-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "green" },
    )
    runTurnStart(s)
    const hydras = createInstance("BS04-074", s.turn, 2) // 異合竜ハイドラス Lv1（2コア）
    s.players.p1.field.spirits.push(hydras)
    s.players.p1.hand[0] = "BS02-105" // グレートウォール（黄マジック・コスト3）
    s.players.p1.hand[1] = "BS02-105"
    s.players.p1.reserve = 10

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "1回目のマジック使用は成功")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "Lv1のoncePerTurnAllにより2回目は拒否される")
}
{
    const s = createGame(
        "bs04-074-b-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "yellow" },
    )
    runTurnStart(s)
    const barossa = createInstance("BS03-064", s.turn, 4) // 薔薇人バロッサ Lv2（自分のアタックステップに黄マジック無償化）
    s.players.p2.field.spirits.push(barossa)
    s.turnPlayer = "p2"
    s.phase = "attack"
    const greatWall = getCard("BS02-105") // 黄マジック・コスト3
    assert(effectiveCost(s, "p2", greatWall) === 0, "ハイドラス不在ならバロッサの無償化が有効")

    const hydras = createInstance("BS04-074", s.turn, 4) // 異合竜ハイドラス Lv2（noFreeCastOpponent発揮）
    s.players.p1.field.spirits.push(hydras)
    assert(effectiveCost(s, "p2", greatWall) > 0, "Lv2ハイドラスのnoFreeCastOpponentでバロッサの無償化が打ち消される")
}

console.log("=== BS04-111 マジックドリル: メインで相手の手札枚数ぶんデッキ破棄 + フラッシュBP+2000 ===")
{
    const s = createGame(
        "bs04-111-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.hand[0] = "BS04-111"
    s.players.p1.reserve = 10
    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"] // 相手の手札3枚
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "マジックドリルを使用")
    assert(s.players.p2.deck.length === deckBefore - 3, "相手の手札枚数（3枚）ぶんデッキが破棄される")
    assert(s.players.p2.trashCards.length === trashBefore + 3, "破棄したカードは相手のトラッシュへ")
}

console.log("パート42 完了")
