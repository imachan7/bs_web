// smoke パート4（scripts/smoke.ts から機械分割）
// 収録セクション:
//   - recoverSpiritFromTrash：ドラグノ祈祷師 e1（BS01-014、召喚時に自分のトラッシュのスピリット1枚を手札へ）
//   - coreSqueezeOne：コブライガ e1（BS01-041、召喚時に相手の実効BP最大スピリットのコアを1個だけ残す）
//   - coreToVoidOwn：ハンマドレイク e1（BS01-007、召喚時に自分のコア1個をボイドへ）
//   - 免疫・効果無効システム（ワルキューレ／フェザーバリア／バーストファイア）
//   - 遅延アタックステップ終了：妖機妃ソール（BS01-096、endAttackStep onlyOpponentTurn）
//   - 指定アタック（canDirectAttack）：イリュージョナ（BS01-037、targetFilter:rested）
//   - 指定アタック（canDirectAttack）：牛霊スモゥグ（BS01-044、targetFilter:singleCore）
//   - 山札公開（スワロウアイヴィー）・起動能力（グラン）・コア配置修飾（グラーバ）
//   - 先攻1ターン目はアタック不可
//   - 装甲：色（BS02-040 ロブスターク）
//   - 呪撃（BS02-015 ハンプダンプ）
import {
    createGame,
    createInstance,
    draw,
    getCard,
    minLevelCores,
    validateDeckCards,
    viewFor,
    engineRunTurnStart,
    handleAction,
    destroySpirit,
    effectiveBp,
    hasKeyword,
    resolveAction,
    spiritHasKeyword,
    effectiveCost,
    DECK_RECIPES,
    DECK_SIZE,
    assert,
    act,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"

console.log("=== recoverSpiritFromTrash：ドラグノ祈祷師 e1（BS01-014、召喚時に自分のトラッシュのスピリット1枚を手札へ） ===")
{
    const s = createGame(
        "recoverspirit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    console.log("--- スピリットだけが手札に戻り、マジックは戻らない ---")
    // スピリット（ゴラドン）→マジック（バスタースピア）の順でトラッシュに積む（マジックが末尾＝新しい方）
    s.players.p1.trashCards.push("BS01-001", "BS01-114")
    s.players.p1.hand[0] = "BS01-014"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ドラグノ祈祷師を召喚できる")
    assert(s.players.p1.hand.includes("BS01-001"), "スピリット（ゴラドン）が手札に戻る")
    assert(s.players.p1.trashCards.includes("BS01-114"), "マジック（バスタースピア）はトラッシュに残る")
    assert(!s.players.p1.trashCards.includes("BS01-001"), "回収したスピリットはトラッシュから消える")

    console.log("--- 該当なしはno-op ---")
    s.players.p1.trashCards = ["BS01-114"] // マジックのみ
    s.players.p1.hand[0] = "BS01-014"
    s.players.p1.reserve = 20
    const handBefore2 = s.players.p1.hand.length
    const logLen = s.log.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "対象なしでも召喚はできる")
    assert(s.players.p1.hand.length === handBefore2 - 1, "召喚分の-1のみ（回収は発生しない）")
    assert(s.log.length > logLen, "no-opのログが出る")
}

console.log("=== coreSqueezeOne：コブライガ e1（BS01-041、召喚時に相手の実効BP最大スピリットのコアを1個だけ残す） ===")
{
    const s = createGame(
        "coresqueezeone-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const enemyHigh = createInstance("BS01-053", s.turn, 3) // リーヴォルフ Lv1・BP2000（コア3）
    const enemyLow = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1・BP1000（コア1）
    s.players.p2.field.spirits.push(enemyHigh, enemyLow)

    s.players.p1.hand[0] = "BS01-041"
    s.players.p1.reserve = 20
    const p2ReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "コブライガを召喚できる")

    assert(enemyHigh.cores === 1, "コア3個の相手スピリット（実効BP最大）が1個になる")
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "超過コア2個が持ち主（相手）のリザーブへ")
    assert(enemyLow.cores === 1, "他のスピリットは不変")

    console.log("--- 対象なしはno-op ---")
    const s2 = createGame(
        "coresqueezeone-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    s2.players.p1.hand[0] = "BS01-041"
    s2.players.p1.reserve = 20
    const logLen = s2.log.length
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, "相手フィールドが空でも召喚できる")
    assert(s2.log.length > logLen, "対象なしのログが出る")
}

console.log("=== coreToVoidOwn：ハンマドレイク e1（BS01-007、召喚時に自分のコア1個をボイドへ） ===")
{
    // 注: 通常の召喚（summon）はコスト支払い分もいったんtrashCoresへ積む仕様（次のリフレッシュで
    // リザーブへ戻る）ため、summon経由だとtrashCoresの検証にコスト支払い分が混ざってしまう。
    // このアクション自体の挙動（trashCores優先／フィールド優先）を厳密に検証するため、
    // resolveActionを直接呼んで（コスト支払いを経由せず）テストする。
    console.log("--- trashCoresがある場合はそこから減る（フィールド不変） ---")
    const s = createGame(
        "coretovoid-trash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const hammer = createInstance("BS01-007", s.turn, 1) // ハンマドレイク自身（維持コア1）
    s.players.p1.field.spirits.push(hammer)
    s.players.p1.trashCores = 2
    resolveAction(s, "p1", hammer, { type: "coreToVoidOwn", count: 1 })
    assert(s.players.p1.trashCores === 1, "トラッシュのコアが1個減る")
    assert(hammer.cores === 1, "ハンマドレイク自身のコアは変化しない（維持コア1）")

    console.log(
        "--- trashCoresが0の場合はフィールドのコア（実効BP最小）が減りボイドへ（リザーブにもトラッシュにも増えない） ---",
    )
    const s2 = createGame(
        "coretovoid-field-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s2)
    const weak = createInstance("BS01-001", s2.turn, 2) // ゴラドン Lv1・BP1000（コア2）
    const hammer2 = createInstance("BS01-007", s2.turn, 1) // ハンマドレイク自身 Lv1・BP4000（コア1）
    s2.players.p1.field.spirits.push(weak, hammer2)
    const reserveBefore = s2.players.p1.reserve
    resolveAction(s2, "p1", hammer2, { type: "coreToVoidOwn", count: 1 })
    assert(weak.cores === 1, "実効BP最小のゴラドンのコアが1個減る")
    assert(hammer2.cores === 1, "ハンマドレイク自身は変化しない（自身よりBPが低い対象が優先される）")
    assert(s2.players.p1.trashCores === 0, "トラッシュのコアは増えない")
    assert(s2.players.p1.reserve === reserveBefore, "リザーブはボイド分では変化しない")
}

console.log(
    "=== bothSidesCoreToTrash：メタルディー・バグ e1（BS01-087、召喚時に両者の実効BP最大スピリットのコア1個をそれぞれのトラッシュへ） ===",
)
{
    // coreToVoidOwn同様、コスト支払いのtrashCores混入を避けるためresolveActionを直接呼ぶ
    const s = createGame(
        "bothsides-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const bug = createInstance("BS01-087", s.turn, 1) // メタルディー・バグ自身（維持コア1）
    s.players.p1.field.spirits.push(bug)
    const p1Ally = createInstance("BS01-046", s.turn, 2) // 幻龍シェイロン Lv1・BP4000（コア2）
    s.players.p1.field.spirits.push(p1Ally)
    const p2Enemy = createInstance("BS01-053", s.turn, 2) // リーヴォルフ Lv1・BP2000（コア2）
    s.players.p2.field.spirits.push(p2Enemy)

    resolveAction(s, "p1", bug, { type: "bothSidesCoreToTrash", count: 1 })

    assert(p1Ally.cores === 1, "p1側の実効BP最大スピリット（シェイロン）のコアが1個減る")
    assert(s.players.p1.trashCores === 1, "p1側のトラッシュコアが1個増える")
    assert(p2Enemy.cores === 1, "p2側の実効BP最大スピリット（リーヴォルフ）のコアが1個減る")
    assert(s.players.p2.trashCores === 1, "p2側のトラッシュコアが1個増える")
    assert(bug.cores === 1, "メタルディー・バグ自身は対象にならなかった（p1側はBP最大のシェイロンが選ばれた）")

    console.log("--- 片側のみ対象がいてもその側は処理される（相手フィールドが空） ---")
    const s2 = createGame(
        "bothsides-oneside-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s2)
    const bug2 = createInstance("BS01-087", s2.turn, 1)
    s2.players.p1.field.spirits.push(bug2)
    const p1Ally2 = createInstance("BS01-046", s2.turn, 2) // 幻龍シェイロン Lv1・BP4000（コア2）
    s2.players.p1.field.spirits.push(p1Ally2)
    resolveAction(s2, "p1", bug2, { type: "bothSidesCoreToTrash", count: 1 })
    assert(p1Ally2.cores === 1, "p1側は処理される（シェイロンのコアが1個減る）")
    assert(s2.players.p1.trashCores === 1, "p1側のトラッシュコアが1個増える")
    assert(s2.players.p2.trashCores === 0, "p2側は対象がいなかったのでトラッシュコアは増えない")
}

console.log(
    "=== フィールドイベント誘発（opponentDrew）：シダフクロウ（BS01-059、相手がドローするとこのスピリットは回復する） ===",
)
{
    const s = createGame(
        "opponentdrew-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const owl = createInstance("BS01-059", s.turn, 1)
    s.players.p1.field.spirits.push(owl)
    owl.isRested = true

    console.log("--- 相手（p2）がドローすると回復する ---")
    draw(s, "p2", 1)
    assert(!owl.isRested, "p2がドローすると、p1のシダフクロウは回復する")

    console.log("--- 自分（p1）がドローしても回復しない ---")
    owl.isRested = true // いったん疲労させ直す
    draw(s, "p1", 1)
    assert(owl.isRested === true, "p1自身がドローしても、p1のシダフクロウは回復しない（疲労のまま）")
}

console.log(
    "=== onDestroy（refreshOne）：甲精ディース e2（BS01-093 Lv2、破壊されると自分の疲労スピリットを回復させる） ===",
)
{
    const s = createGame(
        "kouseidys-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const dice = createInstance("BS01-093", s.turn, 4) // Lv2（e2はLv2のみ有効）
    s.players.p1.field.spirits.push(dice)
    const ally = createInstance("BS01-001", s.turn, 1) // ゴラドン（疲労状態にしておく）
    ally.isRested = true
    s.players.p1.field.spirits.push(ally)

    destroySpirit(s, "p1", dice.instanceId)
    assert(s.players.p1.field.spirits.length === 1, "甲精ディースは破壊されてフィールドから消える")
    assert(!ally.isRested, "自分の疲労スピリット（ゴラドン）が回復する")

    console.log("--- Lv1（破壊時効果なし）では回復効果が発火しない ---")
    const s2 = createGame(
        "kouseidys-lv1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s2)
    const dice2 = createInstance("BS01-093", s2.turn, 1) // Lv1
    s2.players.p1.field.spirits.push(dice2)
    const ally2 = createInstance("BS01-001", s2.turn, 1)
    ally2.isRested = true
    s2.players.p1.field.spirits.push(ally2)
    destroySpirit(s2, "p1", dice2.instanceId)
    assert(ally2.isRested === true, "Lv1では破壊時効果が発火しないため、疲労スピリットは回復しない")
}

console.log(
    "=== costMod：ルビーの太陽 e1（BS01-100、白のカードは使用時+1コスト。両陣営の白カードに効く） ===",
)
{
    const s = createGame(
        "costmod-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const whiteCard = getCard("BS01-074") // バーサーカー・ガン：白・コスト1・軽減なし
    const redCard = getCard("BS01-001") // ゴラドン：赤・コスト0・軽減なし

    assert(effectiveCost(s, "p1", whiteCard) === 1, "ルビーの太陽なしでは白カードは通常コスト1")

    console.log("--- 相手（p2）が出したルビーの太陽でも、自分（p1）の白カードが+1される ---")
    const ruby = createInstance("BS01-100", s.turn, 0) // ルビーの太陽 Lv1（コア0）
    s.players.p2.field.nexuses.push(ruby)
    assert(effectiveCost(s, "p1", whiteCard) === 2, "白カードのコストが+1される（発生源が相手でも効く）")
    assert(effectiveCost(s, "p2", whiteCard) === 2, "自分（p2）が白カードを使う場合も+1される（自分のカードも対象）")
    assert(effectiveCost(s, "p1", redCard) === 0, "白以外（赤）のカードは変化しない")

    console.log("--- ルビーの太陽が2枚あれば+2 ---")
    const ruby2 = createInstance("BS01-100", s.turn, 0)
    s.players.p1.field.nexuses.push(ruby2)
    assert(effectiveCost(s, "p1", whiteCard) === 3, "ルビーの太陽2枚で白カードは元コスト1+2=3")
}

console.log(
    "=== discardSelfOne：自分の手札末尾1枚をトラッシュへ（本来は自分が選ぶ処理の簡略化） ===",
)
{
    const s = createGame(
        "discardself-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    s.players.p1.hand = ["BS01-001", "BS01-002", "BS01-003"]
    resolveAction(s, "p1", null, { type: "discardSelfOne" })
    assert(s.players.p1.hand.length === 2, "手札が1枚減る")
    assert(s.players.p1.trashCards.includes("BS01-003"), "手札末尾のカードがトラッシュへ積まれる")

    console.log("--- 手札0はno-op ---")
    s.players.p1.hand = []
    const logLen = s.log.length
    resolveAction(s, "p1", null, { type: "discardSelfOne" })
    assert(s.players.p1.hand.length === 0, "手札0のまま変化しない")
    assert(s.log.length > logLen, "no-opのログが出る")
}

console.log(
    "=== 百識の谷（BS01-099、自分のドローステップにドロー+1。Lv1のみドロー後に手札1枚を破棄） ===",
)
{
    console.log("--- Lv2：ドロー+1のみ（破棄なし） ---")
    const s = createGame(
        "hyakushiki-lv2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s) // turn1：p1（先攻のため通常ドローなし）
    const tani = createInstance("BS01-099", s.turn, 3) // 百識の谷 Lv2（コア3）
    s.players.p1.field.nexuses.push(tani)
    act(s, "p1", { type: "endTurn" }) // → turn2：p2

    const handBeforeTurn3 = s.players.p1.hand.length
    act(s, "p2", { type: "endTurn" }) // → turn3：p1（通常ドロー1枚＋百識の谷Lv2の+1枚が発火）
    assert(
        s.players.p1.hand.length === handBeforeTurn3 + 2,
        "通常ドロー1枚＋百識の谷Lv2の+1枚で、手札は+2枚になる",
    )

    console.log("--- 相手（p2）のドローステップでは発火しない ---")
    const handBeforeP2Draw = s.players.p1.hand.length
    act(s, "p1", { type: "endTurn" }) // → turn4：p2（p1の百識の谷はturn:"own"のため相手ターンには反応しない）
    assert(s.players.p1.hand.length === handBeforeP2Draw, "相手のドローステップではp1の手札は変化しない")
}

console.log("--- Lv1：ドロー+1のあと手札1枚を破棄（差し引き+1枚） ---")
{
    const s = createGame(
        "hyakushiki-lv1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s) // turn1：p1（先攻のため通常ドローなし）
    const tani = createInstance("BS01-099", s.turn, 0) // 百識の谷 Lv1（コア0）
    s.players.p1.field.nexuses.push(tani)
    act(s, "p1", { type: "endTurn" }) // → turn2：p2

    const handBeforeTurn3 = s.players.p1.hand.length
    const trashBeforeTurn3 = s.players.p1.trashCards.length
    act(s, "p2", { type: "endTurn" }) // → turn3：p1（通常ドロー1枚＋Lv1の+1枚を引いてから1枚破棄）
    assert(
        s.players.p1.hand.length === handBeforeTurn3 + 1,
        "通常ドロー1枚＋百識の谷Lv1の+1枚のあと手札1枚を破棄＝差し引き+1枚",
    )
    assert(
        s.players.p1.trashCards.length === trashBeforeTurn3 + 1,
        "破棄した1枚がトラッシュに積まれる",
    )
}

console.log(
    "--- 既知の挙動：先攻1ターン目は通常ドローがスキップされても、ドローステップのstep効果は発火する ---",
)
{
    // PhaseManager.runTurnStart は turn===1 の通常ドロー（draw()）はスキップするが、
    // その直後の fireStepTriggers(state, "draw") は無条件に呼ばれる（既存の全step効果に共通の挙動で、
    // 今回の百識の谷実装で変更した箇所ではない）。そのため理論上は「先攻1ターン目でも
    // 百識の谷がすでに場にあれば、通常ドローなしでもstep効果のドロー+1だけは発火する」。
    // 実戦でネクサスをターン1開始前に場に出すことはできないため実運用上は起こらないが、
    // エンジンの既知の挙動として記録しておく。
    const s = createGame(
        "hyakushiki-turn1-quirk-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    s.players.p1.field.nexuses.push(createInstance("BS01-099", 1, 3)) // 百識の谷 Lv2
    const handBefore = s.players.p1.hand.length
    runTurnStart(s) // turn1：p1（通常ドローはスキップされるが、fireStepTriggers("draw")は呼ばれる）
    assert(
        s.players.p1.hand.length === handBefore + 1,
        "先攻1ターン目でも、場にある百識の谷のドローステップ効果（+1）自体は発火する（既存挙動）",
    )
}

console.log(
    "=== coreDrainAllOthers：魔界七将デスペラード e1（BS01-X02、召喚時にこのスピリット以外の全スピリット上からコアを1個ずつ持ち主のリザーブへ。この効果で消滅した数ぶんボイドから自身にコア） ===",
)
{
    const s = createGame(
        "coredrain-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const despe = createInstance("BS01-X02", s.turn, 1) // 魔界七将デスペラード自身 Lv1（維持コア1）
    s.players.p1.field.spirits.push(despe)
    const ally = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（維持コア1、コア1個→1個減ると消滅）
    s.players.p1.field.spirits.push(ally)
    const ally2 = createInstance("BS01-046", s.turn, 2) // 幻龍シェイロン Lv1（維持コア1、コア2個→1個減っても消滅しない）
    s.players.p1.field.spirits.push(ally2)
    const enemy = createInstance("BS01-053", s.turn, 2) // リーヴォルフ Lv1（維持コア1、コア2個→1個減っても消滅しない）
    s.players.p2.field.spirits.push(enemy)

    const p1ReserveBefore = s.players.p1.reserve
    const p2ReserveBefore = s.players.p2.reserve

    resolveAction(s, "p1", despe, { type: "coreDrainAllOthers" })

    assert(despe.cores === 2, "消滅が1体（ゴラドン）発生したため、デスペラード自身のコアがボイドから1個増える（1→2）")
    assert(!s.players.p1.field.spirits.includes(ally), "維持コア1個のゴラドンはコアを1個失って消滅する")
    assert(ally2.cores === 1, "シェイロンはコアが2→1に減るが消滅しない（維持コア1）")
    assert(enemy.cores === 1, "相手（リーヴォルフ）のコアも2→1に減る（両陣営が対象）")
    assert(
        s.players.p1.reserve === p1ReserveBefore + 2,
        "p1側：ゴラドン分＋シェイロン分の合計2個が持ち主（p1）のリザーブへ",
    )
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "p2側：リーヴォルフ分の1個が持ち主（p2）のリザーブへ")

    console.log("--- self以外に対象がいなければno-op ---")
    const s2 = createGame(
        "coredrain-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s2)
    const despe2 = createInstance("BS01-X02", s2.turn, 1)
    s2.players.p1.field.spirits.push(despe2)
    const logLen = s2.log.length
    resolveAction(s2, "p1", despe2, { type: "coreDrainAllOthers" })
    assert(despe2.cores === 1, "対象がいなければデスペラード自身のコアも変化しない")
    assert(s2.log.length > logLen, "no-opのログが出る")
}

console.log("=== 免疫・効果無効システム（ワルキューレ／フェザーバリア／バーストファイア） ===")
{
    // --- ワルキューレ: 相手の対象を取る効果（destroy）の対象にならない ---
    const s = createGame(
        "immune-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const walk = createInstance("BS01-086", s.turn, 1) // クイーン・ワルキューレ（untargetable）
    const other = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000
    s.players.p2.field.spirits.push(walk, other)

    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === walk.instanceId),
        "destroyの自動選択はワルキューレを避ける",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === other.instanceId),
        "代わりに別のスピリットが破壊される",
    )
    // ワルキューレしかいない状態では destroy は no-op
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(
        s.players.p2.field.spirits.some((x) => x.instanceId === walk.instanceId),
        "ワルキューレだけなら対象を取る破壊は当たらない",
    )
    // ただし範囲破壊（destroyAll）にはワルキューレも当たる
    resolveAction(s, "p1", null, { type: "destroyAll", maxBp: 9000 })
    assert(
        s.players.p2.field.spirits.length === 0,
        "範囲破壊(destroyAll)にはワルキューレも当たる",
    )

    // --- フェザーバリア: 免疫フラグは範囲破壊からも守る、ターン終了で解除 ---
    const s2 = createGame(
        "featherbarrier-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const protectee = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(protectee)
    protectee.immuneToOpponentThisTurn = true
    resolveAction(s2, "p1", null, { type: "destroy", count: 1 })
    assert(
        s2.players.p2.field.spirits.length === 1,
        "フェザーバリア免疫スピリットは対象破壊されない",
    )
    resolveAction(s2, "p1", null, { type: "destroyAll", maxBp: 9000 })
    assert(
        s2.players.p2.field.spirits.length === 1,
        "フェザーバリア免疫スピリットは範囲破壊でも破壊されない",
    )

    // --- バーストファイア: cantBlock を無効化するとブロックできる ---
    const s3 = createGame(
        "burstfire-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s3)
    // p1にアタッカー、p2に cantBlock 持ち（テラノセイバー BS01-003 Lv1）
    const atk = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(atk)
    const cantBlocker = createInstance("BS01-003", s3.turn, 1) // テラノセイバー: cantBlock Lv1
    s3.players.p2.field.spirits.push(cantBlocker)
    act(s3, "p1", { type: "nextPhase" })
    act(s3, "p1", { type: "attack", instanceId: atk.instanceId })
    // 優先権を防御側→攻撃側と回してブロック可能タイミングへ（フラッシュ終了）
    act(s3, "p2", { type: "pass" })
    act(s3, "p1", { type: "pass" })
    assert(
        act(s3, "p2", { type: "block", instanceId: cantBlocker.instanceId }) !== null,
        "無効化前はcantBlock持ちはブロックできない",
    )
    // バーストファイアで無効化 → ブロック可能に
    cantBlocker.blockConstraintNegatedThisTurn = true
    assert(
        act(s3, "p2", { type: "block", instanceId: cantBlocker.instanceId }) === null,
        "無効化後はブロックできる",
    )
}

console.log("=== 遅延アタックステップ終了：妖機妃ソール（BS01-096、endAttackStep onlyOpponentTurn） ===")
{
    console.log("--- 相手ターンのバトルで破壊 → アタックステップ終了（ターン強制終了） ---")
    const s = createGame(
        "soul-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000
    s.players.p1.field.spirits.push(attacker)
    const soul = createInstance("BS01-096", s.turn, 1) // 妖機妃ソール Lv1 BP2000（p2が持ち主＝p1のターンでは相手ターン扱い）
    s.players.p2.field.spirits.push(soul)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ終了、ブロック待ち）")
    assert(act(s, "p2", { type: "block", instanceId: soul.instanceId }) === null, "p2がソールでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(soul), "BPで劣るソールが破壊される")
    assert(s.turnPlayer === "p2", "相手ターン中の破壊のため、アタックステップ終了でp1のターンが強制終了しp2のターンになる")
    assert(s.phase === "main", "p2のターンがメインステップから始まる")
    assert(s.endAttackStepAfterBattle === false, "フラグは消費されて戻る")

    console.log("--- 自分のターンの破壊では発動しない（onlyOpponentTurn） ---")
    const s2 = createGame(
        "soul-ownturn-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "green" },
    )
    runTurnStart(s2)

    const soul2 = createInstance("BS01-096", s2.turn, 1) // 妖機妃ソール Lv1 BP2000（p1が持ち主＝アタッカー側）
    s2.players.p1.field.spirits.push(soul2)
    const blocker2 = createInstance("BS01-053", s2.turn, 4) // リーヴォルフ Lv2 BP3000
    s2.players.p2.field.spirits.push(blocker2)

    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: soul2.instanceId }) === null, "p1がソールでアタック")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ終了、ブロック待ち）")
    assert(act(s2, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "p2がリーヴォルフでブロック")
    assert(act(s2, "p2", { type: "pass" }) === null, "ブロック後フラッシュで防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s2.players.p1.field.spirits.includes(soul2), "BPで劣るソールが破壊される（アタッカー側）")
    assert(s2.turnPlayer === "p1", "自分（p1）のターン中の破壊のため、アタックステップは終了しない")
    assert(s2.endAttackStepAfterBattle === false, "フラグは立たない")

    console.log("--- アタックステップ外での発動はno-op ---")
    const s3 = createGame(
        "soul-phase-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s3)
    const soul3 = createInstance("BS01-096", s3.turn, 1)
    s3.players.p2.field.spirits.push(soul3)
    const logLen = s3.log.length
    resolveAction(s3, "p2", soul3, { type: "endAttackStep", onlyOpponentTurn: true })
    assert(s3.endAttackStepAfterBattle === false, "メインステップではフラグが立たない")
    assert(s3.log.length > logLen, "no-opのログが出る")
}

console.log("=== 指定アタック（canDirectAttack）：イリュージョナ（BS01-037、targetFilter:rested） ===")
{
    const s = createGame(
        "illusiona-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const illusiona = createInstance("BS01-037", s.turn, 2) // イリュージョナ Lv2 BP5000
    s.players.p1.field.spirits.push(illusiona)
    const restedTarget = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（疲労状態）
    restedTarget.isRested = true
    s.players.p2.field.spirits.push(restedTarget)
    const readyOther = createInstance("BS01-001", s.turn, 1) // 回復状態のゴラドン
    s.players.p2.field.spirits.push(readyOther)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: illusiona.instanceId,
            targetSpiritInstanceId: readyOther.instanceId,
        }) !== null,
        "回復状態の相手は指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: illusiona.instanceId,
            targetSpiritInstanceId: restedTarget.instanceId,
        }) === null,
        "疲労状態の相手を指定してアタックできる",
    )
    assert(s.battle !== null, "バトルが発生")
    assert(s.battle?.blockerInstanceId === restedTarget.instanceId, "指定した相手がblockerInstanceIdにセットされる")
    assert(s.battle?.directed === true, "directedフラグが立つ")
    assert(
        s.log.some((line) => line.includes("指定してアタックした")),
        "指定アタックのログが出る",
    )
    assert(act(s, "p2", { type: "takeLife" }) !== null, "指定アタック成立後はライフで受けられない")
    assert(
        act(s, "p2", { type: "block", instanceId: readyOther.instanceId }) !== null,
        "指定アタック成立後は別のスピリットでブロックもできない",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(restedTarget), "指定した相手（BP5000 vs BP1000）が敗北して破壊される")
    assert(s.battle === null, "バトル終了")
}

console.log("=== 指定アタック（canDirectAttack）：牛霊スモゥグ（BS01-044、targetFilter:singleCore） ===")
{
    const s = createGame(
        "sumogu-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const sumogu = createInstance("BS01-044", s.turn, 1) // 牛霊スモゥグ Lv1
    s.players.p1.field.spirits.push(sumogu)
    const singleCoreTarget = createInstance("BS01-001", s.turn, 1) // ゴラドン コア1個
    s.players.p2.field.spirits.push(singleCoreTarget)
    const multiCoreTarget = createInstance("BS01-001", s.turn, 3) // ゴラドン コア3個
    s.players.p2.field.spirits.push(multiCoreTarget)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: sumogu.instanceId,
            targetSpiritInstanceId: multiCoreTarget.instanceId,
        }) !== null,
        "コア2個以上の相手は指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: sumogu.instanceId,
            targetSpiritInstanceId: singleCoreTarget.instanceId,
        }) === null,
        "コア1個の相手を指定してアタックできる",
    )
    assert(s.battle?.blockerInstanceId === singleCoreTarget.instanceId, "指定した相手がblockerInstanceIdにセットされる")

    console.log("--- canDirectAttack を持たない通常スピリットは指定アタックを拒否 ---")
    const s2 = createGame(
        "direct-attack-reject-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s2)
    const plain = createInstance("BS01-001", s2.turn, 1) // ゴラドン（canDirectAttackを持たない）
    s2.players.p1.field.spirits.push(plain)
    const target = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(target)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s2, "p1", {
            type: "attack",
            instanceId: plain.instanceId,
            targetSpiritInstanceId: target.instanceId,
        }) !== null,
        "canDirectAttackを持たないスピリットは指定アタックできない",
    )
}

console.log("=== 山札公開（スワロウアイヴィー）・起動能力（グラン）・コア配置修飾（グラーバ） ===")
{
    // --- deckReveal: 上5枚にネクサスがあれば手札へ、残りは下へ ---
    const s = createGame(
        "deckreveal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    // デッキ先頭を既知の並びにする（先頭付近にネクサス BS01-088 タワーミットクラブ）
    const deckBefore = s.players.p1.deck.length
    s.players.p1.deck.splice(0, 5, "BS01-098", "BS01-001", "BS01-001", "BS01-001", "BS01-001")
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" })
    assert(s.players.p1.hand.includes("BS01-098"), "公開したネクサスが手札に入る")
    assert(s.players.p1.hand.length === handBefore + 1, "手札が1枚増える")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキは公開5枚のうち1枚が手札へ移り残り4枚が下へ（枚数-1）")

    // 上5枚にネクサスが無ければ手札に入らず全部下へ（枚数不変）
    const s2 = createGame(
        "deckreveal-none-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s2)
    s2.players.p1.deck.splice(0, 5, "BS01-001", "BS01-001", "BS01-001", "BS01-001", "BS01-001")
    const deck2 = s2.players.p1.deck.length
    const hand2 = s2.players.p1.hand.length
    resolveAction(s2, "p1", null, { type: "deckReveal", count: 5, pickType: "nexus" })
    assert(s2.players.p1.hand.length === hand2, "一致なしでは手札は増えない")
    assert(s2.players.p1.deck.length === deck2, "一致なしではデッキ枚数は変わらない（順だけ変わる）")

    // --- coreBonus: グラーバへの効果コア配置が+1される ---
    const s3 = createGame(
        "corebonus-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s3)
    const graba = createInstance("BS01-057", s3.turn, 1) // グラーバ（coreBonus +1）
    s3.players.p1.field.spirits.push(graba)
    // voidCoreToSelf 1 → グラーバは coreBonus で +1 され、計 +2
    resolveAction(s3, "p1", graba, { type: "voidCoreToSelf", count: 1 })
    assert(graba.cores === 1 + 2, "グラーバへのボイド配置は+1され計2個置かれる")
    // coreBonus を持たない通常スピリットは増えない
    const plain = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(plain)
    resolveAction(s3, "p1", plain, { type: "voidCoreToSelf", count: 1 })
    assert(plain.cores === 1 + 1, "通常スピリットは修飾なし（+1のみ）")

    // --- activateAbility: グランがバトル中フラッシュでコアを払い自分でバトル終了 ---
    const s4 = createGame(
        "activate-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s4)
    // p1にグラン（Lv3=コア5）を出し、アタッカーにする
    const gran = createInstance("BS01-094", s4.turn, 5)
    s4.players.p1.field.spirits.push(gran)
    const eff = getCard("BS01-094").effects[0]!
    const granEffectId = eff.id
    s4.players.p1.reserve = 3
    act(s4, "p1", { type: "nextPhase" })
    act(s4, "p1", { type: "attack", instanceId: gran.instanceId })
    // アタック直後は防御側(p2)に優先権 → グラン側(p1)は発動できない
    assert(
        act(s4, "p1", { type: "activateAbility", instanceId: gran.instanceId, effectId: granEffectId }) !== null,
        "優先権のない側は起動できない",
    )
    // 防御側パス → p1に優先権 → 発動できる
    act(s4, "p2", { type: "pass" })
    const reserveBefore = s4.players.p1.reserve
    const trashBefore = s4.players.p1.trashCores
    assert(
        act(s4, "p1", { type: "activateAbility", instanceId: gran.instanceId, effectId: granEffectId }) === null,
        "優先権保持側はコアを払って起動できる",
    )
    assert(s4.battle === null, "起動能力(endBattle)でバトルが終了する")
    assert(s4.players.p1.reserve === reserveBefore - 1, "リザーブのコアが1個減る")
    assert(s4.players.p1.trashCores === trashBefore + 1, "払ったコアがトラッシュへ")
}

console.log("=== 先攻1ターン目はアタック不可 ===")
{
    const s = createGame(
        "first-turn-attack-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    engineRunTurnStart(s) // ラッパーを使わず、実際のターン1のまま検証する
    assert(s.turn === 1, "開始直後はターン1")
    const sp = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(sp)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへは移行できる")
    assert(
        act(s, "p1", { type: "attack", instanceId: sp.instanceId }) !== null,
        "先攻1ターン目のアタックは拒否される",
    )
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターン終了はできる")
    // ターン2（後攻p2）はアタックできる
    const sp2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(sp2)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(
        act(s, "p2", { type: "attack", instanceId: sp2.instanceId }) === null,
        "ターン2（後攻）はアタックできる",
    )
}

console.log("=== 装甲：色（BS02-040 ロブスターク） ===")
{
    // --- 赤マジックの単体破壊：装甲：赤持ちのみだと対象が取れず破壊されない ---
    const s = createGame(
        "armor-destroy-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const rob = createInstance("BS02-040", s.turn, 1) // ロブスターク Lv1（装甲：赤）
    s.players.p2.field.spirits.push(rob)
    s.players.p1.hand[0] = "BS01-121" // フレイムダンス（赤・destroy maxBp4000）
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムダンスを使用")
    assert(s.players.p2.field.spirits.length === 1, "装甲：赤持ちは赤の破壊効果の対象にならず生存")

    // --- 赤マジックの範囲破壊：装甲：赤持ちだけ生き残り、無装甲は破壊される ---
    const s2 = createGame(
        "armor-destroyall-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const rob2 = createInstance("BS02-040", s2.turn, 1) // ロブスターク Lv1（装甲：赤）
    const plain = createInstance("BS01-001", s2.turn, 1) // ゴラドン（無装甲）
    s2.players.p2.field.spirits.push(rob2, plain)
    s2.players.p1.hand[0] = "BS01-122" // フレイムテンペスト（赤・destroyAll maxBp3000）
    s2.players.p1.reserve = 10
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムテンペストを使用")
    assert(s2.players.p2.field.spirits.includes(rob2), "装甲：赤持ちは範囲破壊でも生存")
    assert(!s2.players.p2.field.spirits.includes(plain), "無装甲のゴラドンは範囲破壊で破壊される")

    // --- 紫ソースの効果は装甲：赤を貫通する ---
    const s3 = createGame(
        "armor-pierce-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "white" },
    )
    runTurnStart(s3)
    const rob3 = createInstance("BS02-040", s3.turn, 2) // ロブスターク Lv1（コア2）
    s3.players.p2.field.spirits.push(rob3)
    s3.players.p1.hand[0] = "BS01-129" // ポイズンシュート（紫・coreRemove count1）
    s3.players.p1.reserve = 10
    assert(
        act(s3, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: rob3.instanceId }) === null,
        "ポイズンシュートを使用（紫は装甲：赤を貫通）",
    )
    assert(rob3.cores === 1, "装甲：赤は紫の効果を防げず、コアが1個減る")

    // --- レベル不足（維持コア未満）なら装甲は働かない ---
    const s4 = createGame(
        "armor-level-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s4)
    const rob4 = createInstance("BS02-040", s4.turn, 0) // コア0＝Lv0（装甲の levels [1,2] 対象外）
    s4.players.p2.field.spirits.push(rob4)
    s4.players.p1.hand[0] = "BS01-121" // フレイムダンス
    s4.players.p1.reserve = 10
    assert(act(s4, "p1", { type: "castMagic", handIndex: 0 }) === null, "フレイムダンスを使用")
    assert(s4.players.p2.field.spirits.length === 0, "Lv条件外では装甲が働かず破壊される")
}

console.log("=== 呪撃（BS02-015 ハンプダンプ） ===")
{
    // --- アタック→ブロック→双方パスで、BP比較の勝敗に関わらずブロッカーが破壊される ---
    const s = createGame(
        "jugeki-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "green" },
    )
    runTurnStart(s)
    const hampdump = createInstance("BS02-015", s.turn, 3) // ハンプダンプ Lv2（呪撃）BP4000
    s.players.p1.field.spirits.push(hampdump)
    const leewolf = createInstance("BS01-053", s.turn, 6) // リーヴォルフ Lv3 BP5000（BP比較なら勝つ）
    s.players.p2.field.spirits.push(leewolf)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: hampdump.instanceId }) === null, "ハンプダンプでアタック")
    assert(act(s, "p2", { type: "block", instanceId: leewolf.instanceId }) === null, "リーヴォルフでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.field.spirits.length === 0, "BP負けのハンプダンプはBP比較で破壊される")
    assert(s.players.p2.field.spirits.length === 0, "BP比較で勝ったリーヴォルフも【呪撃】で破壊される")

    // --- ブロックされなければ何も起きない ---
    const s2 = createGame(
        "jugeki-noblock-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "green" },
    )
    runTurnStart(s2)
    const hampdump2 = createInstance("BS02-015", s2.turn, 3) // ハンプダンプ Lv2（呪撃）
    s2.players.p1.field.spirits.push(hampdump2)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s2, "p1", { type: "attack", instanceId: hampdump2.instanceId }) === null,
        "ハンプダンプでアタック（ブロッカーなし）",
    )
    assert(act(s2, "p2", { type: "takeLife" }) === null, "防御側はライフで受ける")
    assert(s2.players.p1.field.spirits.length === 1, "ブロックされなければ【呪撃】は発動せずアタッカーは生存")
    assert(s2.battle === null, "バトル終了")
}

