// smoke パート40（BS04第四弾 緑・白バッチ: 構造化した代表効果の検証）
// 収録セクション:
//   - BS04-025 ファル・コンドル：onBattle battleRole:attacker で Lv1/2 coreGain・Lv2のみ追加でrefreshSelf
//   - BS04-032 槍蟲ルカニドス：onBattle（battleRole省略）でブロッカー勝利でもrefreshSelf
//   - BS04-036 オッドセイ：constraint cantAttack（アタック不可）／ fieldEvent ownLifeDamaged で refreshSelf
//   - BS04-039 宝石虫スカラベール：aura keywordFilter:soku + phaseTurn（自分のアタックステップ中のみ+1000）
//   - BS04-043 ワルキューレ・ヒルド：fieldEvent ownLifeDamaged の refreshSelf はLv2のみ発揮
//   - BS04-100 ジャングルロウ：メイン exhaustAllByLevel(1) ／ フラッシュ bpBuff+4000
import { assert, act, createGame, createInstance, effectiveBp, runTurnStart } from "./helpers"

console.log("=== BS04-025 ファル・コンドル: onBattle battleRole:attacker で coreGain(Lv1/2) / refreshSelf(Lv2のみ) ===")
{
    const s = createGame(
        "bs04-025-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const falconLv1 = createInstance("BS04-025", s.turn, 1) // ファル・コンドル Lv1 BP3000
    s.players.p1.field.spirits.push(falconLv1)
    const falconLv2 = createInstance("BS04-025", s.turn, 3) // ファル・コンドル Lv2 BP5000
    s.players.p1.field.spirits.push(falconLv2)
    const blocker1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(blocker1)
    const blocker2 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(blocker2)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")

    console.log("--- Lv1: coreGainのみ発揮（refreshSelfは発揮されない） ---")
    const reserveBefore1 = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: falconLv1.instanceId }) === null, "Lv1ファル・コンドルでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker1.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.reserve === reserveBefore1 + 1, "Lv1: 勝利でボイドからコアがリザーブへ+1")
    assert(falconLv1.isRested, "Lv1: refreshSelfは発揮されないためアタック後は疲労のまま")

    console.log("--- Lv2: coreGainに加えてrefreshSelfも発揮される ---")
    const reserveBefore2 = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: falconLv2.instanceId }) === null, "Lv2ファル・コンドルでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "ゴラドンでブロック（アタッカー勝利）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.reserve === reserveBefore2 + 1, "Lv2: 勝利でボイドからコアがリザーブへ+1")
    assert(!falconLv2.isRested, "Lv2: refreshSelfが発揮されアタック後も回復状態に戻る")
}

console.log("=== BS04-032 槍蟲ルカニドス: onBattle（battleRole省略）でブロッカー勝利でもrefreshSelf ===")
{
    const s = createGame(
        "bs04-032-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p1.field.spirits.push(weakAttacker)
    const lucanidos = createInstance("BS04-032", s.turn, 5) // 槍蟲ルカニドス Lv2 BP10000
    s.players.p2.field.spirits.push(lucanidos)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "p1がゴラドンでアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: lucanidos.instanceId }) === null,
        "ルカニドスでブロック（ブロッカー勝利）",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    assert(!lucanidos.isRested, "battleRole省略のためブロッカー勝利でもrefreshSelfが発揮され回復状態")
}

console.log("=== BS04-036 オッドセイ: constraint cantAttack / fieldEvent ownLifeDamaged で refreshSelf ===")
{
    const s = createGame(
        "bs04-036-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const oddsea = createInstance("BS04-036", s.turn, 1) // オッドセイ Lv1
    s.players.p1.field.spirits.push(oddsea)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: oddsea.instanceId }) !== null,
        "オッドセイはconstraint cantAttackでアタックできない",
    )

    console.log("--- 自分のライフが減ったとき、疲労状態でもrefreshSelfで回復する ---")
    oddsea.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（シンボル1）
    s.players.p2.field.spirits.push(attacker)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    const lifeBefore = s.players.p1.life
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける（ブロッカーなし）")
    assert(s.players.p1.life === lifeBefore - 1, "p1のライフが1減る")
    assert(!oddsea.isRested, "自分のライフが減ったのでオッドセイはrefreshSelfで回復する")
}

console.log("=== BS04-039 宝石虫スカラベール: aura keywordFilter:soku + 自分のアタックステップ限定で+1000 ===")
{
    const s = createGame(
        "bs04-039-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const scarabale = createInstance("BS04-039", s.turn, 1) // 宝石虫スカラベール Lv1
    s.players.p1.field.spirits.push(scarabale)
    const wolf = createInstance("BS01-053", s.turn, 1) // リーヴォルフ（【神速】持ち）Lv1 BP2000
    s.players.p1.field.spirits.push(wolf)

    assert(effectiveBp(s, "p1", wolf) === 2000, "メインステップ中は素のBP2000のまま")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(effectiveBp(s, "p1", wolf) === 3000, "自分のアタックステップ中は【神速】持ちが+1000でBP3000")
}

console.log("=== BS04-043 ワルキューレ・ヒルド: fieldEvent ownLifeDamaged の refreshSelf はLv2のみ ===")
{
    const s = createGame(
        "bs04-043-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const hild = createInstance("BS04-043", s.turn, 1) // ワルキューレ・ヒルド Lv1
    s.players.p1.field.spirits.push(hild)
    hild.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    const attacker1 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker1)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: attacker1.instanceId }) === null, "p2がアタック")
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(hild.isRested, "Lv1ではfieldEvent ownLifeDamagedのrefreshSelfは発揮されない")

    console.log("--- Lv2ではrefreshSelfが発揮される ---")
    hild.cores = 3 // Lv2へ
    hild.isRested = true
    const attacker2 = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(attacker2)
    assert(act(s, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2が2体目でアタック")
    assert(act(s, "p1", { type: "takeLife" }) === null, "p1がライフで受ける")
    assert(!hild.isRested, "Lv2ではrefreshSelfが発揮され回復状態になる")
}

console.log("=== BS04-100 ジャングルロウ: メイン exhaustAllByLevel(1) ／ フラッシュ bpBuff+4000 ===")
{
    console.log("--- メイン：Lv1スピリットすべてを疲労させる ---")
    const s1 = createGame(
        "bs04-100-main-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s1)
    const ownLv1 = createInstance("BS01-001", s1.turn, 1) // ゴラドン Lv1
    s1.players.p1.field.spirits.push(ownLv1)
    const enemyLv1 = createInstance("BS01-001", s1.turn, 1) // ゴラドン Lv1
    s1.players.p2.field.spirits.push(enemyLv1)
    s1.players.p1.hand[0] = "BS04-100"
    s1.players.p1.reserve = 10
    assert(act(s1, "p1", { type: "castMagic", handIndex: 0 }) === null, "ジャングルロウをメインで使用")
    assert(ownLv1.isRested && enemyLv1.isRested, "両陣営のLv1スピリットが疲労する")

    console.log("--- フラッシュ：スピリット1体をBP+4000 ---")
    const s2 = createGame(
        "bs04-100-flash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const atk = createInstance("BS01-001", s2.turn, 1) // ゴラドン Lv1 BP1000
    s2.players.p1.field.spirits.push(atk)
    s2.players.p1.hand[0] = "BS04-100"
    s2.players.p1.reserve = 10
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s2, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    assert(
        act(s2, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "ジャングルロウをフラッシュで使用",
    )
    assert(atk.tempBpBuff === 4000, "ジャングルロウのフラッシュ効果でBP+4000")
}
