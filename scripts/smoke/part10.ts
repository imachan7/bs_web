// smoke パート10（BS02構造化 波1b）
// 収録セクション:
//   - BS02-070 アルカナプリンス・オベロ：自分のアタックステップ中、カード名に「アルカナ」を
//     含む自分のスピリット数ぶんBP+1000（kind:aura counter:{ownNameIncludes}・phaseTurn限定）
//   - BS02-X06 魔界七将デストロード e2：アタック時BPを比べ相手のブロッカーだけを破壊したとき、
//     破壊直前のブロッカーのコア数ぶんボイドから自分のリザーブへ（kind:triggered onBattle
//     battleRole:attacker・coreGainPer counter:lastBattleDestroyedCores）。相打ちでは発火しない
//   - BS02-X08 大天使ミカファール e1：召喚時、自分の黄スピリット/ネクサス数ぶんデッキ上を公開し
//     マジックカードだけ手札へ・残りはデッキ下へ（deckReveal countPer/pickAllOfType）
//   - BS02-033 騎獣スレイプホース：緑マジックでBP+されたとき、アタックステップ中ならさらに
//     BP+2000（kind:magicBuffBonus target:self/ownOthers）。赤マジックでは上乗せなし
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    resolveAction,
    runTurnStart,
} from "./helpers"

console.log("=== BS02-070 アルカナプリンス・オベロ：自分のアタックステップ中のみBP+1000×アルカナ数 ===")
{
    const s = createGame(
        "obero-aura-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const obero = createInstance("BS02-070", s.turn, 1) // Lv1 BP3000
    s.players.p1.field.spirits.push(obero)
    const arcanaBeast = createInstance("BS02-056", s.turn, 1) // アルカナビースト・ケン Lv1（名前に「アルカナ」を含む）
    s.players.p1.field.spirits.push(arcanaBeast)

    assert(
        effectiveBp(s, "p1", obero) === 3000,
        "メインステップ中はオーラが効かずBP3000のまま",
    )

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        effectiveBp(s, "p1", obero) === 5000,
        "自分のアタックステップ中はアルカナ2体（オベロ自身＋ケン）ぶんBP+2000",
    )
}

console.log("=== BS02-X06 魔界七将デストロード e2：BP比較でブロッカーだけ破壊→コア数ぶんリザーブ+ ===")
{
    const s = createGame(
        "destroroad-corepain-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const destroroad = createInstance("BS02-X06", s.turn, 6) // Lv2 BP8000
    s.players.p1.field.spirits.push(destroroad)
    const blocker = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000・コア3個
    s.players.p2.field.spirits.push(blocker)

    const p1ReserveBefore = s.players.p1.reserve
    const p2ReserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: destroroad.instanceId }) === null, "デストロードでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        s.players.p2.reserve === p2ReserveBefore + 3,
        "破壊されたゴラドン自身のコア3個は持ち主(p2)のリザーブへ戻る",
    )
    assert(
        s.players.p1.reserve === p1ReserveBefore + 3,
        "デストロードの効果で、破壊されたブロッカーのコア数(3)ぶんボイドからp1のリザーブへ追加",
    )

    console.log("--- 相打ちでは発火しない ---")
    const s2 = createGame(
        "destroroad-clash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    const destroroad2 = createInstance("BS02-X06", s2.turn, 6) // Lv2 BP8000
    s2.players.p1.field.spirits.push(destroroad2)
    const evenBlocker = createInstance("BS02-X06", s2.turn, 6) // 同カードでBPを揃える（Lv2 BP8000・コア6個）
    s2.players.p2.field.spirits.push(evenBlocker)

    const p1ReserveBefore2 = s2.players.p1.reserve

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: destroroad2.instanceId }) === null, "デストロードでアタック")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s2, "p2", { type: "block", instanceId: evenBlocker.instanceId }) === null, "同BPでブロック（相打ち）")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(
        s2.players.p1.reserve === p1ReserveBefore2 + 6,
        "相打ちでは自分のデストロード自身のコア6個が戻るのみ（コア獲得効果は発火しない）",
    )
}

console.log("=== BS02-X08 大天使ミカファール e1：黄2つでデッキ上2枚公開、マジックだけ手札へ ===")
{
    const s = createGame(
        "mikafal-deckreveal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)

    const mikafal = createInstance("BS02-X08", s.turn, 1) // Lv1・自身も黄1つとしてカウント
    s.players.p1.field.spirits.push(mikafal)
    const yellowSpirit = createInstance("BS02-049", s.turn, 1) // ピヨン（黄）でもう1つぶん
    s.players.p1.field.spirits.push(yellowSpirit)

    // デッキ先頭を既知の並びにする：マジック(BS01-133)・スピリット(BS01-001)
    s.players.p1.deck.splice(0, 2, "BS01-133", "BS01-001")
    const deckBefore = s.players.p1.deck.length
    const handBefore = s.players.p1.hand.length

    resolveAction(s, "p1", mikafal, {
        type: "deckReveal",
        countPer: { ownColorTotal: "yellow" },
        pickAllOfType: "magic",
    })

    assert(s.players.p1.hand.includes("BS01-133"), "公開したマジックが手札に入る")
    assert(!s.players.p1.hand.includes("BS01-001"), "スピリットは手札に入らない")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える（マジック1枚）")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキは公開2枚のうち1枚が手札へ移り、残り1枚は下へ（枚数-1）")
    assert(s.players.p1.deck.includes("BS01-001"), "残ったスピリットはデッキの下に戻る")
}

console.log("=== BS02-033 騎獣スレイプホース：緑マジックのBP+にさらに+2000（赤マジックは対象外） ===")
{
    const s = createGame(
        "sleipnir-magicbuffbonus-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const sleipnir = createInstance("BS02-033", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(sleipnir)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")

    // 緑マジック（ワイルドパワー・bpBuff+2000）を模した resolveAction 呼び出し：sourceType="magic" / sourceColor="green"
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuff", amount: 2000 },
        sleipnir.instanceId,
        ["green"],
        "magic",
    )
    assert(
        sleipnir.tempBpBuff === 4000,
        "緑マジックのBP+2000に、アタックステップ中のスレイプホース自身の効果でさらに+2000（計4000）",
    )

    // メインステップに戻すと自身の magicBuffBonus 条件（アタックステップ中）を満たさない
    sleipnir.tempBpBuff = 0
    s.phase = "main"
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuff", amount: 2000 },
        sleipnir.instanceId,
        ["green"],
        "magic",
    )
    assert(
        sleipnir.tempBpBuff === 2000,
        "メインステップ中は上乗せなし（BP+2000のみ）",
    )

    // アタックステップに戻し、赤マジックでは上乗せなし
    s.phase = "attack"
    sleipnir.tempBpBuff = 0
    resolveAction(
        s,
        "p1",
        null,
        { type: "bpBuff", amount: 1000 },
        sleipnir.instanceId,
        ["red"],
        "magic",
    )
    assert(
        sleipnir.tempBpBuff === 1000,
        "赤マジックのBP+1000には上乗せなし",
    )
}
