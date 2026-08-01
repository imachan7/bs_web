// smoke パート2（scripts/smoke.ts から機械分割）
// 収録セクション:
//   - フラッシュ封じアクション（lockFlash）
//   - 実カード経由（castMagic）：ラークドライブでバトル即終了
//   - 新規構造化スピリットの誘発確認（実カード経由）
//   - ステップ誘発効果：千年雪の尖塔（BS01-112）
//   - ステップ誘発効果：侵食されゆく銀世界（BS01-113）
//   - 常時BP修正（オーラ）系のテスト
//   - バトル勝利時効果（onBattle: 相手だけ破壊したとき）
//   - refreshSelf: このスピリットを回復
//   - lifeCrush: 相手のライフのコアをリザーブへ
//   - voidCoreToSelf / voidCoreToSelfPer: ボイドから自身の上にコア
//   - カードデータの検証
//   - 第二弾（BS02）データの検証
//   - カスタムデッキ検証（validateDeckCards）
//   - destroy のキーワードフィルタ（ディアマット）
//   - 制約：ブロック不可（cantBlock）
//   - 制約：ブロック不可（cantBlock、複数レベル）
//   - 制約：BPの低いスピリットをブロックできない（cantBlockLowerBp）
//   - 制約：cantBlockLowerBp（同BP以上なら可能）
//   - 制約：unblockableBy（キーワード：神速持ちにブロックされない）
//   - 制約：unblockableBy（色フィルタ：緑にブロックされない）
//   - 制約：unblockableBy（色フィルタ：赤にブロックされない）
//   - discardOpponent: 相手の手札を破棄
//   - 実カード経由（召喚）：マッチュラの召喚時手札破棄
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
import { cardHasColor } from "../../shared/rules"

console.log("=== フラッシュ封じアクション（lockFlash） ===")
{
    const s = createGame(
        "lockflash-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS01-001", s.turn, 1) // Lv1 BP1000
    s.players.p1.field.spirits.push(atk)
    s.players.p1.hand[0] = "BS01-118" // コールオブロスト: フラッシュ bpBuff+2000（p1が使う用）
    s.players.p2.hand[0] = "BS01-123" // リターンドロー: フラッシュ（p2が使おうとして拒否される）
    s.players.p2.hand[1] = "BS01-053" // リーヴォルフ: 神速（p2が使おうとして拒否される）
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(s.priorityPlayer === "p2", "アタック直後は防御側に優先権")

    resolveAction(s, "p1", null, { type: "lockFlash" })
    assert(s.battle?.flashLockedPlayer === "p2", "lockFlashで相手（p2）がロックされる")

    const lockedMagicErr = act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId })
    assert(
        lockedMagicErr !== null && lockedMagicErr.includes("フラッシュで手札のカードを使用できません"),
        "ロックされた相手のフラッシュマジックは拒否される",
    )
    const lockedSummonErr = act(s, "p2", { type: "summon", handIndex: 1 })
    assert(
        lockedSummonErr !== null && lockedSummonErr.includes("フラッシュで手札のカードを使用できません"),
        "ロックされた相手の神速召喚も拒否される",
    )

    assert(act(s, "p2", { type: "pass" }) === null, "ロック中でもパスはできる")
    assert(s.priorityPlayer === "p1", "パスで優先権が攻撃側へ移る")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: atk.instanceId }) === null,
        "ロックされていない自分はフラッシュマジックを使用できる",
    )
    assert(atk.tempBpBuff === 2000, "コールオブロストの効果が適用される")

    // 両者連続パスでフラッシュ終了 → このバトルを終える
    assert(act(s, "p2", { type: "pass" }) === null, "防御側の再パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(s.isFlashTiming === false, "両者連続パスでフラッシュ終了")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受けてバトルを終える")
    assert(s.battle === null, "バトルが終了する")

    // 2回目のバトル：新しいbattleではflashLockedPlayerがnullに戻っている
    const atk2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk2)
    s.players.p2.hand[0] = "BS01-123"
    assert(act(s, "p1", { type: "attack", instanceId: atk2.instanceId }) === null, "2体目でアタック")
    assert(s.battle?.flashLockedPlayer === null, "新しいバトルではflashLockedPlayerがリセットされている")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: atk2.instanceId }) === null,
        "制限が残っていないため相手も通常通りフラッシュマジックを使える",
    )
}

console.log("=== 実カード経由（castMagic）：ラークドライブでバトル即終了 ===")
{
    const s = createGame(
        "real-card-endbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    const atk = createInstance("BS01-001", s.turn, 1)
    const blk = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    s.players.p2.field.spirits.push(blk)

    s.players.p2.hand[0] = "BS01-148" // ラークドライブ: フラッシュ endBattle（コスト6）
    s.players.p2.reserve = 20

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(s.priorityPlayer === "p2", "防御側に優先権がある")

    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "ラークドライブを実際に使用してバトルを終了させられる",
    )
    assert(s.battle === null, "castMagic経由でもバトルが即終了する")
    assert(s.players.p1.field.spirits.includes(atk), "アタック側スピリットは破壊されない")
    assert(s.players.p2.field.spirits.includes(blk), "防御側スピリットも破壊されない")
}

console.log("=== 新規構造化スピリットの誘発確認（実カード経由） ===")
{
    const s = createGame(
        "structured-spirit-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "purple" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20

    console.log("--- エメラルドシーザー（BS01-063）: 召喚時に相手スピリット1体を疲労 ---")
    const enemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（回復状態）
    s.players.p2.field.spirits.push(enemy)
    s.players.p1.hand[0] = "BS01-063"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エメラルドシーザーを召喚できる")
    assert(enemy.isRested === true, "召喚時効果（exhaust）で相手スピリットが疲労する")

    console.log("--- エイプウィップ（BS01-061）: 召喚時にボイドからコア1個をリザーブへ ---")
    s.players.p1.hand[0] = "BS01-061"
    const cost61 = effectiveCost(s, "p1", getCard("BS01-061"))
    const reserveBefore61 = s.players.p1.reserve
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "エイプウィップを召喚できる")
    assert(
        s.players.p1.reserve === reserveBefore61 - cost61 - 1 + 1,
        "コスト＋維持コア1個の支払い後、召喚時効果（coreGain）でリザーブが1個増える",
    )

    console.log("--- ヘル・ブリンディ（BS01-090）: 召喚時にスピリット1体を手札へ戻す ---")
    const p2HandBefore = s.players.p2.hand.length
    s.players.p1.hand[0] = "BS01-090"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヘル・ブリンディを召喚できる")
    assert(
        !s.players.p2.field.spirits.includes(enemy),
        "召喚時効果（returnToHand）で相手スピリットがフィールドから消える",
    )
    assert(s.players.p2.hand.length === p2HandBefore + 1, "戻されたスピリットが持ち主の手札に入る")
    assert(s.players.p2.hand.includes("BS01-001"), "手札に戻ったのは対象のカードそのもの")
    assert(!s.players.p2.trashCards.includes("BS01-001"), "破壊ではないためトラッシュへは行かない")

    console.log("--- 吸血姫ヴァンピレス（BS01-048）: 召喚時に疲労状態のスピリット1体を破壊 ---")
    const restedEnemy = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（疲労状態にする）
    restedEnemy.isRested = true
    const freshEnemy = createInstance("BS01-001", s.turn, 1) // 回復状態（破壊されないこと）
    s.players.p2.field.spirits.push(restedEnemy, freshEnemy)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS01-048"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ヴァンピレスを召喚できる")
    assert(
        !s.players.p2.field.spirits.includes(restedEnemy),
        "召喚時効果（destroyExhausted）で疲労状態のスピリットが破壊される",
    )
    assert(s.players.p2.trashCards.includes("BS01-001"), "破壊されたカードがトラッシュへ")
    assert(s.players.p2.field.spirits.includes(freshEnemy), "回復状態のスピリットは破壊されない")
}

console.log("=== ステップ誘発効果：千年雪の尖塔（BS01-112） ===")
{
    const s = createGame(
        "step-trigger-spire-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    // p1フィールドに千年雪の尖塔（Lv1・コア0）、p2フィールドにネクサスとスピリットを配置
    const spire = createInstance("BS01-112", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(spire)
    const oppNexus = createInstance("BS01-098", s.turn, 0) // 燃えさかる戦場（赤ネクサス）Lv1
    s.players.p2.field.nexuses.push(oppNexus)
    const oppSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1
    s.players.p2.field.spirits.push(oppSpirit)

    console.log("--- Lv1：p1のスタートステップでネクサスのみバウンス（スピリットはバウンスしない） ---")
    const p2HandBefore = s.players.p2.hand.length
    // p1のターンを再度スタートステップから実行する（turn===1のためドローはスキップされ、デッキアウトの心配がない）
    runTurnStart(s)
    assert(!s.players.p2.field.nexuses.includes(oppNexus), "p2のネクサスがフィールドから消える")
    assert(s.players.p2.hand.includes("BS01-098"), "p2のネクサスがp2の手札に戻る")
    assert(s.players.p2.hand.length === p2HandBefore + 1, "手札がちょうど1枚増える（Lv1ではスピリットバウンスなし）")
    assert(s.players.p2.field.spirits.includes(oppSpirit), "Lv1ではスピリットはバウンスされない（レベル不足で不発火）")

    console.log("--- Lv2：ネクサスバウンスに加えてスピリットバウンスも発火 ---")
    spire.cores = 4 // Lv2へ
    const oppNexus2 = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(oppNexus2)
    const p2HandBefore2 = s.players.p2.hand.length
    runTurnStart(s)
    assert(!s.players.p2.field.nexuses.includes(oppNexus2), "Lv2でもネクサスがバウンスされる")
    assert(!s.players.p2.field.spirits.includes(oppSpirit), "Lv2ではスピリットもバウンスされる")
    assert(s.players.p2.hand.length === p2HandBefore2 + 2, "ネクサス＋スピリットの2枚ぶん手札が増える")

    console.log('--- turn="own"：p2のターン開始では発火しない ---')
    const oppNexus3 = createInstance("BS01-098", s.turn, 0)
    s.players.p2.field.nexuses.push(oppNexus3)
    s.turnPlayer = "p2" // p2のターン開始処理を直接検証するため切り替える
    runTurnStart(s)
    assert(
        s.players.p2.field.nexuses.includes(oppNexus3),
        "千年雪の尖塔の持ち主（p1）がturnPlayerでないため発火せず、p2のネクサスは残る",
    )
    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}

console.log("=== ステップ誘発効果：侵食されゆく銀世界（BS01-113） ===")
{
    const s = createGame(
        "step-trigger-permafrost-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const permafrost = createInstance("BS01-113", s.turn, 0) // Lv1: コア0
    s.players.p1.field.nexuses.push(permafrost)

    console.log('--- p1自身のアタックステップでは発火しない（turn="opponent"） ---')
    s.players.p1.trashCores = 3
    const p1ReserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(s.players.p1.trashCores === 3, "p1自身のターンではtrashCoresが動かない（不発火）")
    assert(s.players.p1.reserve === p1ReserveBefore, "p1自身のターンではreserveも変化しない")

    console.log("--- 相手（p2）のアタックステップで発火する ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了、p2のターンへ")
    assert(s.turnPlayer === "p2", "ターンプレイヤーがp2に交代")
    const p1ReserveBefore2 = s.players.p1.reserve
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(s.players.p1.trashCores === 0, "相手（p2）のアタックステップでp1のtrashCoresが0になる")
    assert(s.players.p1.reserve === p1ReserveBefore2 + 3, "trashCoresの3個がp1のリザーブへ移る")
}

console.log("=== 常時BP修正（オーラ）系のテスト ===")
{
    console.log("--- ガウシルヴィア（BS01-072）：自己参照カウンタ型（自分のリザーブのコア数） ---")
    const s = createGame(
        "aura-gausylvia-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const gausylvia = createInstance("BS01-072", s.turn, 3) // Lv2: コア3・素のBP4000
    s.players.p1.field.spirits.push(gausylvia)
    s.players.p1.reserve = 3
    assert(
        effectiveBp(s, "p1", gausylvia) === 4000 + 3 * 1000,
        "リザーブ3個ぶんBP+3000（素のBP4000+3000=7000）",
    )
    s.players.p1.reserve = 0
    assert(
        effectiveBp(s, "p1", gausylvia) === 4000,
        "リザーブが0個になると実効BPも素のBP4000まで下がる",
    )

    console.log("--- レインボウパピヨン（BS01-079）：条件型（自分フィールドに緑スピリット） ---")
    const papillon = createInstance("BS01-079", s.turn, 1) // Lv1: コア1・素のBP2000
    s.players.p2.field.spirits.push(papillon)
    assert(
        effectiveBp(s, "p2", papillon) === 2000,
        "緑スピリットがいない間は素のBPのまま",
    )
    const greenAlly = createInstance("BS01-052", s.turn, 1) // ペリリィフ（緑）
    s.players.p2.field.spirits.push(greenAlly)
    assert(
        effectiveBp(s, "p2", papillon) === 3000,
        "緑スピリットが自分フィールドに現れるとBP+1000",
    )
}

{
    console.log("--- 主無き古城（BS01-102）：全体オーラ（自分の紫スピリットのみ、色・持ち主・レベルで判定） ---")
    const s = createGame(
        "aura-castle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "purple" },
    )
    runTurnStart(s)
    const castle = createInstance("BS01-102", s.turn, 0) // Lv1: コア0（levels: [1,2]で発動中）
    s.players.p1.field.nexuses.push(castle)
    const ownPurple = createInstance("BS01-027", s.turn, 1) // ウィル・オーブ（紫・p1）
    s.players.p1.field.spirits.push(ownPurple)
    const ownRed = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤・p1）
    s.players.p1.field.spirits.push(ownRed)
    const oppPurple = createInstance("BS01-027", s.turn, 1) // ウィル・オーブ（紫・p2）
    s.players.p2.field.spirits.push(oppPurple)

    assert(
        effectiveBp(s, "p1", ownPurple) === 3000 + 1000,
        "p1の紫スピリットはBP+1000される（素のBP3000→実効4000、Lv1で発動中）",
    )
    assert(
        effectiveBp(s, "p1", ownRed) === 1000,
        "p1でも紫以外のスピリットには効かない",
    )
    assert(
        effectiveBp(s, "p2", oppPurple) === 3000,
        "相手（p2）の紫スピリットには効かない（発生源の持ち主基準）",
    )

    console.log("--- ネクサスのレベル条件：Lv2（コア2）でも発動継続 ---")
    castle.cores = 2 // Lv2へ
    assert(
        effectiveBp(s, "p1", ownPurple) === 4000,
        "主無き古城がLv2になってもp1の紫スピリットへのBP+1000は継続する",
    )
}

console.log("--- 燃えさかる戦場（BS01-098）：バトル限定オーラでresolveBattleの勝敗が変わる ---")
{
    const s = createGame(
        "aura-battlefield-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)

    // 燃えさかる戦場を2枚並べて、アタック中の自分スピリットにBP+1000×2する
    s.players.p1.field.nexuses.push(createInstance("BS01-098", s.turn, 0))
    s.players.p1.field.nexuses.push(createInstance("BS01-098", s.turn, 0))
    s.players.p1.hand[0] = "BS01-001" // ゴラドン：Lv1 素のBP1000
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゴラドンを召喚")
    const attacker = s.players.p1.field.spirits[0]!

    const blocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：Lv1 素のBP2000
    s.players.p2.field.spirits.push(blocker)

    assert(
        effectiveBp(s, "p1", attacker) === 1000,
        "バトル外では燃えさかる戦場は効かない（battlingOnly）",
    )

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    assert(
        effectiveBp(s, "p1", attacker) === 1000 + 2000,
        "アタック中は燃えさかる戦場2枚ぶんBP+2000（実効BP3000）",
    )
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "リーヴォルフでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    // 素のBPなら1000<2000でゴラドンが破壊されるはずが、実効BP3000>2000で逆転勝利する
    // → resolveBattle が currentLevel ではなく effectiveBp でBP比較していることの確認でもある
    assert(s.players.p1.field.spirits.includes(attacker), "実効BPで逆転し、ゴラドンは生存する")
    assert(!s.players.p2.field.spirits.includes(blocker), "リーヴォルフが破壊される")
}

console.log("--- 賢者の樹（BS01-106）：e1バトル限定カウンタ型 / e2エンドステップの全回復 ---")
{
    const s = createGame(
        "aura-sagetree-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const sageTree = createInstance("BS01-106", s.turn, 3) // Lv2: コア3
    s.players.p1.field.nexuses.push(sageTree)

    const battler = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：Lv1 素のBP2000
    s.players.p1.field.spirits.push(battler)
    const rested1 = createInstance("BS01-001", s.turn, 1)
    rested1.isRested = true
    const rested2 = createInstance("BS01-001", s.turn, 1)
    rested2.isRested = true
    s.players.p1.field.spirits.push(rested1, rested2)

    s.battle = { attackerInstanceId: battler.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    assert(
        effectiveBp(s, "p1", battler) === 2000 + 2 * 1000,
        "疲労スピリット2体ぶん、バトル中のスピリットにBP+2000（e1: amountPer×ownExhausted）",
    )
    s.battle = null

    console.log("--- e2：Lv1（コア0）ではエンドステップの全回復は発動しない ---")
    sageTree.cores = 0 // Lv1へ
    rested1.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(rested1.isRested === true, "Lv1では自分のエンドステップでも回復しない（levels: [2]）")

    console.log("--- e2：Lv2（コア3）なら自分のエンドステップで自分のスピリットが全回復 ---")
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2がターン終了、p1のターンへ")
    assert(s.turnPlayer === "p1", "p1のターンに戻る")
    sageTree.cores = 3 // Lv2へ
    rested1.isRested = true
    rested2.isRested = true
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了（エンドステップで賢者の樹e2が発動）")
    assert(!rested1.isRested, "Lv2では自分のエンドステップで疲労スピリットが回復する（rested1）")
    assert(!rested2.isRested, "Lv2では自分のエンドステップで疲労スピリットが回復する（rested2）")
}

console.log("=== バトル勝利時効果（onBattle: 相手だけ破壊したとき） ===")
{
    const s = createGame(
        "onbattle-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- 魔女ナージャ: バトル勝利で相手スピリット1体を疲労させる ---")
    // ナージャ Lv1（BP3000）でアタックし、ゴラドン Lv1（BP1000）にブロックさせて勝つ。
    // ブロッカーは破壊されるため、疲労付与の対象として回復状態の別スピリットを置いておく
    const nadja = createInstance("BS01-047", s.turn, 1) // 魔女ナージャ Lv1 BP3000
    s.players.p1.field.spirits.push(nadja)
    const blocker1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const bystander = createInstance("BS01-001", s.turn, 1) // 疲労付与の対象になる
    s.players.p2.field.spirits.push(blocker1, bystander)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: nadja.instanceId }) === null, "ナージャでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker1.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(blocker1), "BPで負けたブロッカーが破壊される")
    assert(s.players.p1.field.spirits.includes(nadja), "勝ったナージャは生存")
    assert(bystander.isRested === true, "onBattle誘発：相手スピリット1体が疲労する")

    console.log("--- 相打ち（同BP）では onBattle が発火しない ---")
    bystander.isRested = false
    const nadja2 = createInstance("BS01-047", s.turn, 1) // Lv1 BP3000
    s.players.p1.field.spirits.push(nadja2)
    const blocker2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000（同BP）
    s.players.p2.field.spirits.push(blocker2)

    assert(act(s, "p1", { type: "attack", instanceId: nadja2.instanceId }) === null, "2体目のナージャでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "同BPのゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(nadja2), "相打ちでナージャも破壊される")
    assert(!s.players.p2.field.spirits.includes(blocker2), "相打ちでブロッカーも破壊される")
    assert(bystander.isRested === false, "相打ちではonBattleが発火しない（疲労しない）")

    console.log("--- 原始鳥フェニキオス: バトル勝利でボイドからコア1個を自身の上に ---")
    const phenikios = createInstance("BS01-023", s.turn, 4) // フェニキオス Lv2（コア4）BP7000
    s.players.p1.field.spirits.push(phenikios)
    const blocker3 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(blocker3)
    const p1ReserveBefore = s.players.p1.reserve

    assert(act(s, "p1", { type: "attack", instanceId: phenikios.instanceId }) === null, "フェニキオスでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker3.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(blocker3), "BPで負けたブロッカーが破壊される")
    assert(phenikios.cores === 5, "onBattle誘発：フェニキオスのコアが4→5に増える")
    assert(s.players.p1.reserve === p1ReserveBefore, "コアはボイド由来（自分のリザーブは変化しない）")
}

console.log("=== refreshSelf: このスピリットを回復 ===")
{
    const s = createGame(
        "refreshself-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const boar = createInstance("BS01-071", s.turn, 4) // 爆進獣ブランボアー Lv2
    boar.isRested = true
    s.players.p1.field.spirits.push(boar)

    resolveAction(s, "p1", boar, { type: "refreshSelf" })
    assert(!boar.isRested, "疲労していた自身が回復する")

    // すでに回復状態なら no-op（ログのみ）
    const logLen1 = s.log.length
    resolveAction(s, "p1", boar, { type: "refreshSelf" })
    assert(!boar.isRested && s.log.length === logLen1 + 1, "回復状態へのrefreshSelfはログのみで安全")

    // self が null（マジック等）でも安全に no-op
    const logLen2 = s.log.length
    resolveAction(s, "p1", null, { type: "refreshSelf" })
    assert(s.log.length === logLen2 + 1, "selfがnullでもログのみで安全")
}

console.log("=== lifeCrush: 相手のライフのコアをリザーブへ ===")
{
    const s = createGame(
        "lifecrush-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    const p2ReserveBefore = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 2 })
    assert(s.players.p2.life === 3, "相手のライフが5→3に減る")
    assert(s.players.p2.reserve === p2ReserveBefore + 2, "減ったライフのコアが相手のリザーブへ移る")
    assert(s.winner === null, "ライフが残っていれば勝敗は付かない")

    // 残りライフを超える量は残量まで。ライフ0で勝敗が付く
    const p2ReserveBefore2 = s.players.p2.reserve
    resolveAction(s, "p1", null, { type: "lifeCrush", count: 99 })
    assert(s.players.p2.life === 0, "ライフが0になる")
    assert(s.players.p2.reserve === p2ReserveBefore2 + 3, "残りライフぶんだけリザーブへ移る（過剰分は無視）")
    assert(s.winner === "p1", "ライフ0で効果の使用者が勝利する")
}

console.log("=== voidCoreToSelf / voidCoreToSelfPer: ボイドから自身の上にコア ===")
{
    const s = createGame(
        "voidcore-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    console.log("--- voidCoreToSelf ---")
    const sp = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(sp)
    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", sp, { type: "voidCoreToSelf", count: 2 })
    assert(sp.cores === 3, "自身のコアが1→3に増える")
    assert(s.players.p1.reserve === reserveBefore, "コアはボイド由来（リザーブは変化しない）")

    // self が null なら no-op（ログのみ）
    const logLen1 = s.log.length
    resolveAction(s, "p1", null, { type: "voidCoreToSelf", count: 1 })
    assert(s.log.length === logLen1 + 1, "selfがnullでもログのみで安全")

    console.log("--- voidCoreToSelfPer: キングタウロス大公の召喚時 ---")
    // 自分の他スピリット2体を用意し、キングタウロス大公を召喚 → onSummonでコア2個増
    const other1 = createInstance("BS01-001", s.turn, 1)
    const other2 = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(other1, other2)
    s.players.p1.hand[0] = "BS01-X03" // キングタウロス大公: コスト8・緑軽減4
    s.players.p1.reserve = 20
    const reserveAfterPay = 20 - effectiveCost(s, "p1", getCard("BS01-X03")) - minLevelCores(getCard("BS01-X03"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "キングタウロス大公を召喚できる")
    const king = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-X03")!
    // 維持コア1 ＋ onSummonで「自分の他スピリット数（sp/other1/other2の3体）」ぶんボイドから追加
    assert(king.cores === minLevelCores(getCard("BS01-X03")) + 3, "自分の他スピリット3体ぶんコアが増える（維持1+3）")
    assert(s.players.p1.reserve === reserveAfterPay, "増えたコアはボイド由来（リザーブはコスト・維持分のみ減る）")

    // 他スピリットが0体なら no-op（ログのみ）
    const s2 = createGame(
        "voidcore-noop-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s2)
    const lone = createInstance("BS01-X03", s2.turn, 1)
    s2.players.p1.field.spirits.push(lone)
    const logLen2 = s2.log.length
    resolveAction(s2, "p1", lone, { type: "voidCoreToSelfPer", counter: "ownOtherSpirits" })
    assert(lone.cores === 1 && s2.log.length === logLen2 + 1, "他スピリットが0体ならコアは増えずログのみ")
}

console.log("=== カードデータの検証 ===")
for (const [name, recipe] of Object.entries(DECK_RECIPES)) {
    const total = Object.values(recipe.cards).reduce((a, b) => a + b, 0)
    assert(total === DECK_SIZE, `${name}デッキは${DECK_SIZE}枚（実際: ${total}）`)
    for (const cardId of Object.keys(recipe.cards)) {
        getCard(cardId)
    }
}

console.log("=== 第二弾（BS02）データの検証 ===")
{
    // cards.json に BS02 全115枚（通常111＋Xレア4）が入っていること
    const bs02 = ["001", "050", "063", "111", "X05", "X08"].map((n) => `BS02-${n}`)
    for (const cardId of bs02) getCard(cardId) // 実在チェック（無ければ throw）
    assert(getCard("BS02-063").limited === true, "冥犬ケルル・ベロスは禁止カード")
    assert(cardHasColor(getCard("BS02-049"), "yellow"), "ピヨンは黄")
    assert(getCard("BS02-X05").name === "暴双龍ディラノス", "XレアのID・名前が一致")

    // 黄デッキでゲームを開始できる
    const s = createGame(
        "bs02-yellow-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    engineRunTurnStart(s)
    assert(
        s.players.p1.deck.length + s.players.p1.hand.length === 40,
        "黄デッキ40枚でゲーム開始できる",
    )
}

console.log("=== カスタムデッキ検証（validateDeckCards） ===")
{
    // DECK_RECIPES.red 相当の40枚（cardId はレシピ定義を流用。実在チェックは上のループ済み）
    const base: Record<string, number> = { ...DECK_RECIPES.red!.cards }
    assert(validateDeckCards(base) === null, "有効な40枚デッキは合格")

    const short: Record<string, number> = { ...base, "BS01-114": 2 }
    assert(
        (validateDeckCards(short) ?? "").includes("40枚"),
        "39枚のデッキは「40枚」エラー",
    )

    const sameName: Record<string, number> = { ...base, "BS01-001": 4, "BS01-114": 2 }
    assert(
        (validateDeckCards(sameName) ?? "").includes("同名"),
        "同名4枚のデッキは「同名」エラー",
    )

    const banned: Record<string, number> = { ...base, "BS01-132": 3 } // ストームドロー（禁止）
    delete banned["BS01-116"]
    assert(
        (validateDeckCards(banned) ?? "").includes("禁止"),
        "禁止カード入りのデッキは「禁止」エラー",
    )

    const unknown: Record<string, number> = { ...base, "BS01-999": 3 }
    assert(
        (validateDeckCards(unknown) ?? "").includes("存在しない"),
        "存在しないカードIDは「存在しない」エラー",
    )

    const fractional: Record<string, number> = { ...base, "BS01-114": 1.5 }
    assert(
        (validateDeckCards(fractional) ?? "").includes("枚数が不正"),
        "小数の枚数は「枚数が不正」エラー",
    )
}

console.log("=== destroy のキーワードフィルタ（ディアマット） ===")
{
    const s = createGame(
        "keyword-filter-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    // 相手フィールドに神速持ち（リーヴォルフ BP2000）と非神速の高BP（ゴラドン Lv2 BP3000）を配置
    const soku = createInstance("BS01-053", s.turn, 1) // リーヴォルフ: 神速持ち
    const plain = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2: BP3000（神速なし）
    s.players.p2.field.spirits.push(soku, plain)

    // keywordFilter: "soku" → BPが低くても神速持ちだけが対象になる
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { keyword: "soku" } })
    assert(s.players.p2.field.spirits.length === 1, "1体だけ破壊される")
    assert(
        s.players.p2.field.spirits[0]!.instanceId === plain.instanceId,
        "破壊されるのは神速持ちのリーヴォルフ（BP最大のゴラドンではない）",
    )

    // 神速持ちがいなくなったら no-op
    const logLen = s.log.length
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { keyword: "soku" } })
    assert(s.players.p2.field.spirits.length === 1, "神速持ち不在なら破壊されない")
    assert(s.log.length === logLen + 1, "対象なしのログが出る")

    // maxBp 省略（BP不問）の破壊も動くこと
    resolveAction(s, "p1", null, { type: "destroy", count: 1 })
    assert(s.players.p2.field.spirits.length === 0, "maxBp省略の破壊はBP不問で破壊できる")
}

console.log("=== 制約：ブロック不可（cantBlock） ===")
{
    const s = createGame(
        "constraint-cantblock-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const blocker = createInstance("BS01-003", s.turn, 1) // テラノセイバー Lv1: cantBlock（levels:[1]）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    const blockErr = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(
        blockErr !== null && blockErr.includes("ブロックできません"),
        "Lv1のテラノセイバーはcantBlockでブロック拒否される",
    )

    // Lv2（コア3）ではcantBlockの対象外（levels:[1]）になり、ブロックできる
    blocker.cores = 3
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "Lv2ではcantBlockが効かずブロックできる")
}

console.log("=== 制約：ブロック不可（cantBlock、複数レベル） ===")
{
    const s = createGame(
        "constraint-cantblock-multilevel-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-001", s.turn, 1)
    const blocker = createInstance("BS01-009", s.turn, 1) // ヴォルク・バブーン Lv1: cantBlock（levels:[1,2]）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    let err = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(err !== null && err.includes("ブロックできません"), "Lv1でもcantBlockでブロック拒否される")

    blocker.cores = 3 // Lv2
    err = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(err !== null && err.includes("ブロックできません"), "Lv2でもcantBlockでブロック拒否される（levels:[1,2]）")
}

console.log("=== 制約：BPの低いスピリットをブロックできない（cantBlockLowerBp） ===")
{
    const s = createGame(
        "constraint-cantblocklowerbp-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const weakAttacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    const blocker = createInstance("BS01-012", s.turn, 4) // トライソードン Lv2: コア4 BP7000、cantBlockLowerBp（levels:[2]）
    s.players.p1.field.spirits.push(weakAttacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "BP1000のゴラドンでアタック")
    const err = act(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(
        err !== null && err.includes("BPの低いスピリットはブロックできません"),
        "BP1000のゴラドンはBP7000のトライソードンにブロックされない",
    )

    // Lv1（コア1、BP1000）ならcantBlockLowerBpの対象外（levels:[2]）で、BPが同じなのでブロックできる
    blocker.cores = 1
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "Lv1ではcantBlockLowerBpが効かずブロックできる（BP1000同士）",
    )
}

console.log("=== 制約：cantBlockLowerBp（同BP以上なら可能） ===")
{
    const s = createGame(
        "constraint-cantblocklowerbp-equal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const strongAttacker = createInstance("BS01-012", s.turn, 4) // トライソードン Lv2 BP7000
    const blocker = createInstance("BS01-012", s.turn, 4) // トライソードン Lv2 BP7000、cantBlockLowerBp
    s.players.p1.field.spirits.push(strongAttacker)
    s.players.p2.field.spirits.push(blocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: strongAttacker.instanceId }) === null, "BP7000のトライソードンでアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null,
        "アタッカーのBPがブロッカー以上（同BP）ならcantBlockLowerBpでもブロックできる",
    )
}

console.log("=== 制約：unblockableBy（キーワード：神速持ちにブロックされない） ===")
{
    const s = createGame(
        "constraint-unblockable-keyword-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-015", s.turn, 1) // スピノアックス Lv1: unblockableBy keywordFilter soku
    const sokuBlocker = createInstance("BS01-053", s.turn, 1) // リーヴォルフ：【神速】持ち
    const plainBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン：神速なし
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(sokuBlocker, plainBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "スピノアックスでアタック")
    const err = act(s, "p2", { type: "block", instanceId: sokuBlocker.instanceId })
    assert(
        err !== null && err.includes("ブロックされません"),
        "【神速】持ちのリーヴォルフはスピノアックスのアタックをブロックできない",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: plainBlocker.instanceId }) === null,
        "【神速】を持たないゴラドンは通常通りブロックできる",
    )
}

console.log("=== 制約：unblockableBy（色フィルタ：緑にブロックされない） ===")
{
    const s = createGame(
        "constraint-unblockable-color-green-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-035", s.turn, 1) // ボーン・グラディエイター Lv1: unblockableBy colorFilter green
    const greenBlocker = createInstance("BS01-052", s.turn, 1) // ペリリィフ（緑）
    const otherBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(greenBlocker, otherBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ボーン・グラディエイターでアタック")
    const err = act(s, "p2", { type: "block", instanceId: greenBlocker.instanceId })
    assert(err !== null && err.includes("ブロックされません"), "緑のペリリィフはブロックできない")
    assert(
        act(s, "p2", { type: "block", instanceId: otherBlocker.instanceId }) === null,
        "緑以外（赤）のゴラドンは通常通りブロックできる",
    )
}

console.log("=== 制約：unblockableBy（色フィルタ：赤にブロックされない） ===")
{
    const s = createGame(
        "constraint-unblockable-color-red-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)

    const attacker = createInstance("BS01-083", s.turn, 1) // ラビクリスタ Lv1: unblockableBy colorFilter red
    const redBlocker = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    const otherBlocker = createInstance("BS01-052", s.turn, 1) // ペリリィフ（緑）
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(redBlocker, otherBlocker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ラビクリスタでアタック")
    const err = act(s, "p2", { type: "block", instanceId: redBlocker.instanceId })
    assert(err !== null && err.includes("ブロックされません"), "赤のゴラドンはブロックできない")
    assert(
        act(s, "p2", { type: "block", instanceId: otherBlocker.instanceId }) === null,
        "赤以外（緑）のペリリィフは通常通りブロックできる",
    )
}

console.log("=== discardOpponent: 相手の手札を破棄 ===")
{
    const s = createGame(
        "discard-opponent-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)

    s.players.p2.hand = ["BS01-001", "BS01-002", "BS01-003"]
    const trashBefore = s.players.p2.trashCards.length
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 1 })
    assert(s.players.p2.hand.length === 2, "相手の手札が1枚減る")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "破棄したカードがトラッシュへ増える")
    assert(s.players.p2.trashCards.includes("BS01-003"), "手札末尾のカードが破棄される（決定的選択）")

    console.log("--- 手札が足りない場合はある分だけ破棄 ---")
    s.players.p2.hand = ["BS01-001"]
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 3 })
    assert(s.players.p2.hand.length === 0, "手札1枚に対しcount3でも1枚だけ破棄される")

    console.log("--- 手札0枚でも安全（no-op） ---")
    const logLenBefore = s.log.length
    resolveAction(s, "p1", null, { type: "discardOpponent", count: 1 })
    assert(s.players.p2.hand.length === 0, "手札0枚のままno-op")
    assert(s.log.length === logLenBefore + 1, "手札0枚でもログのみで安全に処理される")
}

console.log("=== 実カード経由（召喚）：マッチュラの召喚時手札破棄 ===")
{
    const s = createGame(
        "matchura-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)

    s.players.p1.hand[0] = "BS01-056" // マッチュラ: コスト1・維持1、召喚時 discardOpponent 1
    s.players.p1.reserve = 20
    s.players.p2.hand = ["BS01-001", "BS01-002"]
    const p2HandBefore = s.players.p2.hand.length
    const p2TrashBefore = s.players.p2.trashCards.length

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マッチュラを召喚できる")
    assert(s.players.p2.hand.length === p2HandBefore - 1, "召喚時効果で相手の手札が1枚減る")
    assert(s.players.p2.trashCards.length === p2TrashBefore + 1, "破棄したカードが相手のトラッシュへ増える")
}

