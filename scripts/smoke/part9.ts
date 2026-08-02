// smoke パート9（BS02構造化 波1a）
// 収録セクション:
//   - BS02-010 溶海竜プレシオス：召喚時、両者ネクサス色数合計3色未満なら不発／3色以上で
//     指定外の色のネクサスを破壊（kind:triggered destroyAllNexusesExceptChosenColors）。
//     Lv3アタック時、相手ネクサス2色以上でライフダメージ後さらにライフクラッシュ（condition付きtriggered）
//   - BS02-038 盾精ラングリーズ：破壊時、置かれていたコア数ぶんをリザーブ経由で自分のBP最大の
//     スピリットへ付け替える（kind:triggered destructionCoresToOwnSpirit）
//   - BS02-042 スクルディア：リフレッシュステップで回復しない（kind:constraint noRefresh）
//   - BS02-065 花の子リップ：黄3つ以上で、黄スピリットをブロックした相手をこのターンLv1として扱う
//     （kind:fieldEvent ownSpiritBlocked、ターン終了でリセット）
//   - BS02-077 決闘台地 e2：相手のスタートステップに覚醒持ちを全回復（cantAttackThisTurnは付けない）
import {
    act,
    takeLifeAndResolve,
    assert,
    createGame,
    createInstance,
    destroySpirit,
    engineRunTurnStart,
    fireStepTriggers,
    resolveAction,
    runTurnStart,
} from "./helpers"

console.log("=== BS02-010 溶海竜プレシオス e1：両者ネクサス色数合計3色未満なら不発 ===")
{
    const s = createGame(
        "bs02-plesio-insufficient-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const plesio = createInstance("BS02-010", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(plesio)
    const ownNexus = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場（赤）
    const enemyNexus = createInstance("BS01-102", s.turn, 0) // 主無き古城（紫）
    s.players.p1.field.nexuses.push(ownNexus)
    s.players.p2.field.nexuses.push(enemyNexus)

    resolveAction(s, "p1", plesio, {
        type: "destroyAllNexusesExceptChosenColors",
        minTotalColors: 3,
    })
    assert(s.players.p1.field.nexuses.includes(ownNexus), "色数合計2色（未満）のため自分のネクサスは破壊されない")
    assert(s.players.p2.field.nexuses.includes(enemyNexus), "相手のネクサスも破壊されない")
}

console.log("=== BS02-010 溶海竜プレシオス e1：3色以上で指定外の色のネクサスだけ破壊される ===")
{
    const s = createGame(
        "bs02-plesio-destroy-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const plesio = createInstance("BS02-010", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(plesio)
    // p1: 赤2つ（多数派）+紫1つ → 自分の指定色は赤
    const red1 = createInstance("BS01-098", s.turn, 0)
    const red2 = createInstance("BS01-099", s.turn, 0)
    const purple = createInstance("BS01-102", s.turn, 0)
    s.players.p1.field.nexuses.push(red1, red2, purple)
    // p2: 緑1つ → 指定色は緑
    const green = createInstance("BS01-106", s.turn, 0)
    s.players.p2.field.nexuses.push(green)

    resolveAction(s, "p1", plesio, {
        type: "destroyAllNexusesExceptChosenColors",
        minTotalColors: 3,
    })
    assert(s.players.p1.field.nexuses.includes(red1), "自分の指定色（赤）のネクサスは残る")
    assert(s.players.p1.field.nexuses.includes(red2), "自分の指定色（赤）のネクサスは残る（2つ目）")
    assert(!s.players.p1.field.nexuses.includes(purple), "指定色でない紫のネクサスは破壊される")
    assert(s.players.p2.field.nexuses.includes(green), "相手の指定色（緑）のネクサスは残る")
}

console.log("=== BS02-010 溶海竜プレシオス e2：Lv3アタック時、相手ネクサス2色以上でライフクラッシュ追加 ===")
{
    const s = createGame(
        "bs02-plesio-lifecrush-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const plesio = createInstance("BS02-010", s.turn, 8) // Lv3
    s.players.p1.field.spirits.push(plesio)
    const redNexus = createInstance("BS01-098", s.turn, 0)
    const purpleNexus = createInstance("BS01-102", s.turn, 0)
    s.players.p2.field.nexuses.push(redNexus, purpleNexus) // 相手ネクサス2色
    s.players.p2.life = 5
    s.players.p2.reserve = 0

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: plesio.instanceId }) === null, "プレシオスでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "p2がライフで受ける")
    assert(
        s.players.p2.life === 3,
        "通常ダメージ1（symbol数）+ 相手ネクサス2色以上でのe2追加ライフクラッシュ1で、ライフ5→3",
    )
    assert(s.players.p2.reserve === 2, "取り除かれたコア2個はリザーブへ")
}

console.log("=== BS02-010 溶海竜プレシオス e2：相手ネクサス1色以下では追加ライフクラッシュなし ===")
{
    const s = createGame(
        "bs02-plesio-lifecrush-none-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const plesio = createInstance("BS02-010", s.turn, 8) // Lv3
    s.players.p1.field.spirits.push(plesio)
    const redNexus = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(redNexus) // 相手ネクサス1色のみ
    s.players.p2.life = 5
    s.players.p2.reserve = 0

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: plesio.instanceId }) === null, "プレシオスでアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "p2がライフで受ける")
    assert(s.players.p2.life === 4, "通常ダメージ1のみ、e2の追加ライフクラッシュは発火しない")
    assert(s.players.p2.reserve === 1, "取り除かれたコアは1個のみ")
}

console.log("=== BS02-038 盾精ラングリーズ e2：破壊時、コアがリザーブ経由で自分のBP最大スピリットへ ===")
{
    const s = createGame(
        "bs02-langris-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const langris = createInstance("BS02-038", s.turn, 2) // Lv2（e2はlevels:[2]）
    const low = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const high = createInstance("BS01-002", s.turn, 2) // ロクケラトプス Lv2 BP3000（BP最大）
    s.players.p1.field.spirits.push(langris, low, high)
    s.players.p1.reserve = 5

    // destroySpirit は破壊直前のコア数(coresAtDestruction)を記録してからリザーブへ加算し、
    // その後onDestroyでdestructionCoresToOwnSpiritが同数をリザーブから移す（ネット±0を期待）
    destroySpirit(s, "p1", langris.instanceId)

    assert(s.players.p1.reserve === 5, "リザーブ経由の付け替えでリザーブは元の量に戻る")
    assert(high.cores === 4, "BP最大のhighにコア2個が移った（2→4）")
    assert(low.cores === 1, "BP最大でないlowのコアは変化しない")
}

console.log("=== BS02-042 スクルディア e1：リフレッシュステップで回復しない ===")
{
    const s = createGame(
        "bs02-skrudia-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const skrudia = createInstance("BS02-042", s.turn, 1) // Lv1
    const control = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(skrudia, control)
    skrudia.isRested = true
    control.isRested = true

    // p1自身のリフレッシュステップを再度起こす（先攻1ターン目扱いに戻しドローの影響を避ける）
    s.turn = 1
    engineRunTurnStart(s)

    assert(skrudia.isRested === true, "noRefresh持ちのスクルディアは回復しない")
    assert(!control.isRested, "他のスピリットは通常通り回復する")
}

console.log("=== BS02-065 花の子リップ e1：黄3つ以上で、黄スピリットをブロックした相手をLv1扱いに ===")
{
    const s = createGame(
        "bs02-rip-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const rip = createInstance("BS02-065", s.turn, 3) // Lv2（e1はlevels:[2]）
    const yellowAlly = createInstance("BS02-049", s.turn, 1) // ピヨン（黄）
    const yellowNexus = createInstance("BS02-084", s.turn, 0) // 祝福されし大聖堂（黄）
    s.players.p1.field.spirits.push(rip, yellowAlly)
    s.players.p1.field.nexuses.push(yellowNexus) // 黄の合計=リップ+ピヨン+ネクサス=3
    const blocker = createInstance("BS02-046", s.turn, 1) // ウィンガル 白 Lv1 BP5000（バニラ。リップ4000より高BPで生存させ、リセット確認に使う）
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: rip.instanceId }) === null, "リップでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(blocker.levelOverrideThisTurn === 1, "ブロックした相手はこのターンLv1として扱われる")

    assert(act(s, "p2", { type: "pass" }) === null, "p2がパス")
    assert(act(s, "p1", { type: "pass" }) === null, "p1がパス（両者パスでバトル解決）")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターンを終了")
    assert(blocker.levelOverrideThisTurn === undefined, "ターン終了でLv上書きは解除される")
}

console.log("=== BS02-077 決闘台地 e2：相手のスタートステップに覚醒持ちを全回復（cantAttackThisTurnは付けない） ===")
{
    const s = createGame(
        "bs02-kettoudaichi-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const daichi = createInstance("BS02-077", s.turn, 4) // Lv2
    s.players.p1.field.nexuses.push(daichi)
    const awaken1 = createInstance("BS01-013", s.turn, 1) // タウロスナイト（覚醒持ち）
    const awaken2 = createInstance("BS01-013", s.turn, 1)
    const plain = createInstance("BS01-001", s.turn, 1) // 覚醒を持たない対照
    s.players.p1.field.spirits.push(awaken1, awaken2, plain)
    awaken1.isRested = true
    awaken2.isRested = true
    plain.isRested = true

    // 「相手のスタートステップ」= 決闘台地の持ち主(p1)から見て非turnPlayerのとき
    s.turnPlayer = "p2"
    fireStepTriggers(s, "start")

    assert(!awaken1.isRested, "覚醒持ちawaken1は回復した")
    assert(!awaken2.isRested, "覚醒持ちawaken2も回復した（全体回復）")
    assert(plain.isRested === true, "覚醒を持たないplainは回復しない")
    assert(awaken1.cantAttackThisTurn === false, "refreshAllOwnと異なりcantAttackThisTurnは付与されない")
    assert(awaken2.cantAttackThisTurn === false, "awaken2もcantAttackThisTurnは付与されない")
}
