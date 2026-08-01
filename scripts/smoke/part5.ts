// smoke パート5（scripts/smoke.ts から機械分割）
// 収録セクション:
//   - BS02第二弾（赤・紫）構造化カードの確認
//   - BS02 緑・白の構造化効果
//   - BS02 黄の構造化効果
//   - BS02 構造化スキップ分：エンジン小拡張
//   - キーワード付与（grantKeyword / keywordGrant）と aura keywordFilter
//   - BS02-009 竜狩りのアーケオルニ：anyNexusDestroyedとdrawPerDestroyedが二重にならず加算
//   - BS02-013 バット・バット：onBlockedでブロッカーのコアが1個減り相手リザーブへ
//   - BS02-024 暗黒将軍ブラッディ・シーザー：onAttackのdestroyExhausted anySideが両陣営から実効BP最大を破壊
//   - BS02-X06 魔界七将デストロード：召喚時にLv2スピリットのみ両陣営で疲労
//   - BS02-012 地龍王ケンドラゴス：召喚時に両陣営で最多色以外のスピリットが破壊される
//   - BS02-006 プテラトマホーク：onAttackのdestroy(bpEqualsSelf)はselfと同BPの相手のみ破壊
//   - BS02-050 コリスタル：バトル（ブロックあり）で生き残っても終了時に自壊する
//   - BS02-016 スライミー：Lv3のアタックでライフのコアがリザーブでなくボイドへ
//   - BS02-058 ペンタン：黄3つ以上でマジックのeffectiveCostが下がる
//   - BS02-067 天使バーチュ：手札の黄スピリットのコストが下がる
//   - BS02-107 タイムリープ：メインで召喚時効果持ちスピリットのonSummonを再発揮
//   - BS02-102 ホワイトポーション：フラッシュで自分のスピリット1体を回復
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

console.log("=== BS02第二弾（赤・紫）構造化カードの確認 ===")
{
    console.log("--- BS02-005 ドラグノ突撃兵：cantBlock制約 + アタック時BP+2000 ---")
    const s = createGame(
        "bs02-005-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const jassei = createInstance("BS02-005", s.turn, 3) // ドラグノ突撃兵 Lv2 BP6000
    s.players.p1.field.spirits.push(jassei)
    const enemyAtk = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(enemyAtk)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ移行")
    assert(act(s, "p2", { type: "attack", instanceId: enemyAtk.instanceId }) === null, "p2がゴラドンでアタック")
    assert(
        act(s, "p1", { type: "block", instanceId: jassei.instanceId }) !== null,
        "cantBlock制約でドラグノ突撃兵はブロックできない",
    )
    assert(act(s, "p1", { type: "takeLife" }) === null, "ブロックできないためライフで受ける")

    assert(act(s, "p2", { type: "endTurn" }) === null, "p2がターン終了")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jassei.instanceId }) === null, "ドラグノ突撃兵でアタック")
    assert(jassei.tempBpBuff === 2000, "アタック時効果（selfBuff）でBP+2000")
}
{
    console.log("--- BS02-017 マミーラ：召喚時に相手スピリット上のコア1個をリザーブへ ---")
    const s = createGame(
        "bs02-017-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const enemy = createInstance("BS01-001", s.turn, 3) // ゴラドン（コア3個）
    s.players.p2.field.spirits.push(enemy)
    const p2ReserveBefore = s.players.p2.reserve
    s.players.p1.hand[0] = "BS02-017"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "マミーラを召喚できる")
    assert(enemy.cores === 2, "召喚時効果（coreRemove）で相手スピリットのコアが1個減る")
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "除去されたコアは持ち主のリザーブへ")
}
{
    console.log("--- BS02-021 髑髏騎士ズ・ガイン：アタック時コア除去 + Lv3で相手手札破棄 ---")
    const s = createGame(
        "bs02-021-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const zugain = createInstance("BS02-021", s.turn, 8) // 髑髏騎士ズ・ガイン Lv3
    s.players.p1.field.spirits.push(zugain)
    const enemy = createInstance("BS01-001", s.turn, 3) // ゴラドン（コア3個）
    s.players.p2.field.spirits.push(enemy)
    s.players.p2.hand.push("BS01-001", "BS01-002")
    const p2HandBefore = s.players.p2.hand.length
    const p2ReserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: zugain.instanceId }) === null, "ズ・ガインでアタック")
    assert(enemy.cores === 2, "アタック時効果（coreRemove）で相手スピリットのコアが1個減る")
    assert(s.players.p2.reserve === p2ReserveBefore + 1, "除去されたコアは持ち主のリザーブへ")
    assert(s.players.p2.hand.length === p2HandBefore - 1, "Lv3効果（discardOpponent）で相手の手札が1枚減る")
}
{
    console.log("--- BS02-076 太古の断層：battleWon（アタッカー勝利/ブロッカー勝利）でドロー ---")
    const s = createGame(
        "bs02-076-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const nexus = createInstance("BS02-076", s.turn, 3) // 太古の断層 Lv2
    s.players.p1.field.nexuses.push(nexus)

    // p1（アタッカー）が勝利 → battleWon(attacker)でp1がドロー
    const atk1 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000
    s.players.p1.field.spirits.push(atk1)
    const def1 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(def1)
    const p1HandBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk1.instanceId }) === null, "atk1でアタック")
    assert(act(s, "p2", { type: "block", instanceId: def1.instanceId }) === null, "p2がブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(def1), "BP勝負でブロッカーが破壊される")
    assert(s.players.p1.hand.length === p1HandBefore + 1, "battleWon(attacker)効果で太古の断層がドロー")

    // p2ターンでp1（ブロッカー）が勝利 → battleWon(blocker)でp1がドロー
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了")
    const atk2 = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（p2の攻撃側）
    s.players.p2.field.spirits.push(atk2)
    const def2 = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000（p1のブロッカー）
    s.players.p1.field.spirits.push(def2)
    const p1HandBefore2 = s.players.p1.hand.length
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: atk2.instanceId }) === null, "atk2でアタック")
    assert(act(s, "p1", { type: "block", instanceId: def2.instanceId }) === null, "p1がブロック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(atk2), "BP勝負でアタッカーが破壊される")
    assert(s.players.p1.hand.length === p1HandBefore2 + 1, "battleWon(blocker)効果で太古の断層がドロー")
}
{
    console.log("--- BS02-077 決闘台地：相手のスタートステップに【覚醒】持ちを回復 ---")
    const s = createGame(
        "bs02-077-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    const ketto = createInstance("BS02-077", s.turn, 0) // 決闘台地 Lv1
    s.players.p1.field.nexuses.push(ketto)
    const balmunk = createInstance("BS02-007", s.turn, 1) // 昇龍バルムンク Lv1（覚醒持ち）
    balmunk.isRested = true
    s.players.p1.field.spirits.push(balmunk)
    const other = createInstance("BS01-001", s.turn, 1) // 覚醒を持たない疲労スピリット（対照）
    other.isRested = true
    s.players.p1.field.spirits.push(other)

    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了 → p2のスタートステップが発生")
    assert(!balmunk.isRested, "決闘台地の効果（refreshOne, keywordFilter:awaken）で覚醒持ちが回復")
    assert(other.isRested === true, "覚醒を持たないスピリットは対象外で疲労のまま")
}
{
    console.log("--- BS02-011 ツヴァイ・ハウル：【覚醒】+ アタック時BP2000以下を破壊 ---")
    const s = createGame(
        "bs02-011-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const hau = createInstance("BS02-011", s.turn, 4) // ツヴァイ・ハウル Lv2 BP5000
    s.players.p1.field.spirits.push(hau)
    const weak = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000（破壊対象）
    const strong = createInstance("BS01-001", s.turn, 3) // ゴラドン Lv2 BP3000（対象外）
    s.players.p2.field.spirits.push(weak, strong)

    assert(hasKeyword("BS02-011", "awaken"), "ツヴァイ・ハウルは【覚醒】キーワードを持つ")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: hau.instanceId }) === null, "ツヴァイ・ハウルでアタック")
    assert(!s.players.p2.field.spirits.includes(weak), "アタック時効果（destroy maxBp2000）でBP1000のゴラドンが破壊される")
    assert(s.players.p2.field.spirits.includes(strong), "BP3000のゴラドンは対象外で生存")
}

console.log("=== BS02 緑・白の構造化効果 ===")
{
    console.log("--- ダッチョーノ：破壊時にボイドからリザーブへコア2個 ---")
    const s = createGame(
        "bs02-gw-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "white" },
    )
    runTurnStart(s)
    const dacho = createInstance("BS02-032", s.turn, 1)
    s.players.p1.field.spirits.push(dacho)
    const reserveBefore = s.players.p1.reserve
    destroySpirit(s, "p1", dacho.instanceId)
    // 破壊されたスピリット上のコア1個もリザーブへ戻るため、+1（自身のコア）+2（coreGain）= +3
    assert(s.players.p1.reserve === reserveBefore + 3, "破壊時にリザーブ+3（自身のコア1+coreGain2）")

    console.log("--- カイザレオン大帝Lv2：アタックで相手だけ破壊→ライフクラッシュ ---")
    const kaiser = createInstance("BS02-036", s.turn, 7) // Lv2 BP15000
    s.players.p1.field.spirits.push(kaiser)
    const gora = createInstance("BS01-001", s.turn, 1) // BP1000
    s.players.p2.field.spirits.push(gora)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: kaiser.instanceId }) === null, "大帝でアタック")
    assert(act(s, "p2", { type: "block", instanceId: gora.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    const lifeBefore = s.players.p2.life
    const oppReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(s.players.p2.field.spirits.length === 0, "ブロッカーが破壊される")
    assert(s.players.p2.life === lifeBefore - 1, "onBattle(attacker)でライフクラッシュ")
    // ブロッカー破壊で戻るコア1個＋ライフクラッシュのコア1個 = +2
    assert(s.players.p2.reserve === oppReserveBefore + 2, "ブロッカーのコアとライフのコアが相手リザーブへ")
}

{
    console.log("--- ライオライダーLv2：ブロックで相手だけ破壊→自身回復 ---")
    const s = createGame(
        "bs02-gw-test2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const gora = createInstance("BS01-001", s.turn, 1) // BP1000
    s.players.p1.field.spirits.push(gora)
    const lio = createInstance("BS02-041", s.turn, 3) // Lv2 BP5000
    s.players.p2.field.spirits.push(lio)
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: gora.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "block", instanceId: lio.instanceId }) === null, "ライオライダーでブロック")
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "pass" }) === null, "バトル解決")
    assert(s.players.p1.field.spirits.length === 0, "アタッカーが破壊される")
    assert(lio.isRested === false, "onBattle(blocker)のrefreshSelfで回復している")

    console.log("--- 機神官フレイLv2：ブロック時に相手のフラッシュを封印 ---")
    const s2 = createGame(
        "bs02-gw-test3",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const gora2 = createInstance("BS01-001", s2.turn, 1)
    s2.players.p1.field.spirits.push(gora2)
    const frey = createInstance("BS02-047", s2.turn, 2) // Lv2
    s2.players.p2.field.spirits.push(frey)
    act(s2, "p1", { type: "nextPhase" })
    act(s2, "p1", { type: "attack", instanceId: gora2.instanceId })
    assert(act(s2, "p2", { type: "block", instanceId: frey.instanceId }) === null, "フレイでブロック")
    assert(s2.battle?.flashLockedPlayer === "p1", "onBlockのlockFlashで攻撃側がフラッシュ封印される")

    console.log("--- リロードコア：フラッシュでBP+3000 ---")
    const s3 = createGame(
        "bs02-gw-test4",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s3)
    const gora3 = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(gora3)
    const blocker = createInstance("BS01-001", s3.turn, 1)
    s3.players.p2.field.spirits.push(blocker)
    s3.players.p2.hand[0] = "BS02-103"
    s3.players.p2.reserve = 10
    act(s3, "p1", { type: "nextPhase" })
    act(s3, "p1", { type: "attack", instanceId: gora3.instanceId })
    assert(
        act(s3, "p2", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: blocker.instanceId,
        }) === null,
        "防御側フラッシュでリロードコアを使用",
    )
    assert(blocker.tempBpBuff === 3000, "対象のBPが+3000される")
}

console.log("=== BS02 黄の構造化効果 ===")
{
    console.log("--- BS02-055 チャウー：coreBonus（効果で置かれるコア+1） ---")
    const s = createGame(
        "bs02-055-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const chau = createInstance("BS02-055", s.turn, 1) // チャウー Lv1
    s.players.p1.field.spirits.push(chau)
    s.players.p1.hand[0] = "BS01-115" // アウェイクン：フラッシュでリザーブからコア3個を対象へ
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: chau.instanceId }) === null,
        "アウェイクンでチャウーへコアチャージ",
    )
    assert(chau.cores === 1 + 3 + 1, "coreBonusで置かれるコアが+1される（元1+チャージ3+bonus1=5）")
}
{
    console.log("--- BS02-066 アルカナドール・パン：召喚時に相手スピリットを疲労 ---")
    const s = createGame(
        "bs02-066-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS02-066"
    const enemy = createInstance("BS01-001", s.turn, 1) // ゴラドン（対象）
    s.players.p2.field.spirits.push(enemy)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アルカナドール・パンを召喚")
    assert(enemy.isRested === true, "onSummon効果（exhaust）で相手スピリットが疲労する")
}
{
    console.log("--- BS02-105/107/108/111：フラッシュでBP+（グレートウォール/タイムリープ/マジックブック/スピリットイリュージョン） ---")
    const s = createGame(
        "bs02-yellow-magic-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 100
    const target = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(target)

    // タイムリープにメイン効果（refireSummonEffect）が追加されたため、バトル外で使用すると
    // メイン効果が優先されフラッシュ効果（BP+2000）が発動しない。フラッシュ効果を確実に
    // 検証するため、アタックでバトルを開始してフラッシュタイミング中に使用する
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(
        act(s, "p1", { type: "attack", instanceId: target.instanceId }) === null,
        "targetでアタック（フラッシュ効果検証のためバトルを開始）",
    )

    s.players.p1.hand[0] = "BS02-105"
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "グレートウォールのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 2000, "グレートウォールでBP+2000")

    s.players.p1.hand[0] = "BS02-107"
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "タイムリープのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 4000, "タイムリープでさらにBP+2000（合計4000）")

    s.players.p1.hand[0] = "BS02-108"
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "マジックブックのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 8000, "マジックブックでさらにBP+4000（合計8000）")

    s.players.p1.hand[0] = "BS02-111"
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パスで攻撃側に優先権")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: target.instanceId }) === null,
        "スピリットイリュージョンのフラッシュ効果を使用",
    )
    assert(target.tempBpBuff === 11000, "スピリットイリュージョンでさらにBP+3000（合計11000）")
}

console.log("=== BS02 構造化スキップ分：エンジン小拡張 ===")
{
    console.log("--- BS02-036 カイザレオン大帝Lv1：constraint cantAttack でアタック不可 ---")
    const s = createGame(
        "bs02-ext-cantattack",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "green", p2: "red" },
    )
    runTurnStart(s)
    const kaiser1 = createInstance("BS02-036", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(kaiser1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", { type: "attack", instanceId: kaiser1.instanceId }) !== null,
        "Lv1のカイザレオン大帝はcantAttack制約でアタックできない",
    )
}
{
    console.log("--- BS02-004 オルカリアLv2：canDirectAttack targetFilter recovered ---")
    const s = createGame(
        "bs02-ext-recovered",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const orca = createInstance("BS02-004", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(orca)
    const restedEnemy = createInstance("BS01-001", s.turn, 1)
    restedEnemy.isRested = true
    const recoveredEnemy = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(restedEnemy, recoveredEnemy)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: orca.instanceId,
            targetSpiritInstanceId: restedEnemy.instanceId,
        }) !== null,
        "疲労状態のスピリットはrecoveredフィルタで指定できない",
    )
    assert(
        act(s, "p1", {
            type: "attack",
            instanceId: orca.instanceId,
            targetSpiritInstanceId: recoveredEnemy.instanceId,
        }) === null,
        "回復状態のスピリットはrecoveredフィルタで指定アタックできる",
    )
}
{
    console.log("--- BS02-018/019：unblockableBy levelFilter ---")
    const s = createGame(
        "bs02-ext-levelfilter",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const supler = createInstance("BS02-018", s.turn, 2) // 悪魔スプラー Lv2（levelFilter[3]）
    s.players.p1.field.spirits.push(supler)
    const lv3Blocker = createInstance("BS01-007", s.turn, 7) // ハンマドレイク Lv3
    const lv2Blocker = createInstance("BS01-007", s.turn, 2) // ハンマドレイク Lv2
    s.players.p2.field.spirits.push(lv3Blocker, lv2Blocker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: supler.instanceId }) === null, "スプラーでアタック")
    assert(
        act(s, "p2", { type: "block", instanceId: lv3Blocker.instanceId }) !== null,
        "Lv3のブロッカーはlevelFilter[3]でブロックできない",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: lv2Blocker.instanceId }) === null,
        "Lv2のブロッカーはブロックできる",
    )
}
{
    console.log("--- BS02-061 天使エンジュ：召喚時にrefreshOne colorFilter yellowで自分の黄のみ回復 ---")
    const s = createGame(
        "bs02-ext-refreshcolor",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const yellowRested = createInstance("BS02-055", s.turn, 1) // チャウー（黄）
    yellowRested.isRested = true
    const redRested = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    redRested.isRested = true
    s.players.p1.field.spirits.push(yellowRested, redRested)
    s.players.p1.hand[0] = "BS02-061"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "天使エンジュを召喚")
    assert(!yellowRested.isRested, "黄のスピリットが回復する")
    assert(redRested.isRested === true, "赤のスピリットはcolorFilter対象外で疲労のまま")
}
{
    console.log("--- BS02-084 祝福されし大聖堂Lv2：fieldEvent colorFilter yellowで自分の黄破壊時のみ発火 ---")
    const s = createGame(
        "bs02-ext-fieldevent-color",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const cathedral = createInstance("BS02-084", s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(cathedral)
    const yellowSpirit = createInstance("BS02-055", s.turn, 1) // チャウー（黄）
    const redSpirit = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    s.players.p1.field.spirits.push(yellowSpirit, redSpirit)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    const reserveBefore = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", redSpirit.instanceId)
    // 破壊された赤スピリット自身のコア1個のみリザーブへ（colorFilter不一致でcoreGainは発火せず）
    assert(s.players.p1.reserve === reserveBefore + 1, "赤のスピリット破壊：colorFilter不一致で発火しない")
    assert(s.players.p1.hand.length === handBefore, "赤のスピリット破壊：ドローも発火しない")

    const reserveBefore2 = s.players.p1.reserve
    const handBefore2 = s.players.p1.hand.length
    destroySpirit(s, "p1", yellowSpirit.instanceId)
    // 自身のコア1個 + coreGain(1) = +2
    assert(s.players.p1.reserve === reserveBefore2 + 2, "黄のスピリット破壊：colorFilter一致でcoreGainが発火")
    assert(s.players.p1.hand.length === handBefore2 + 1, "黄のスピリット破壊：Lv2のdrawも発火")
}
{
    console.log("--- BS02-071 宝石の獣カーバルクLv2：破壊時に想獣数ぶんcoreGainPer+drawPer ---")
    const s = createGame(
        "bs02-ext-family",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const carbuncle = createInstance("BS02-071", s.turn, 3) // Lv2（コア3個）
    const kerberos = createInstance("BS02-063", s.turn, 1) // 冥犬ケルル・ベロス（想獣）
    s.players.p1.field.spirits.push(carbuncle, kerberos)
    const reserveBefore = s.players.p1.reserve
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", carbuncle.instanceId)
    // 自身のコア3個 + coreGainPer（想獣1体=ケルル・ベロスのみ。破壊時点でカーバルク自身はフィールドから除去済み）= +4
    assert(s.players.p1.reserve === reserveBefore + 4, "破壊時：自身のコア3+coreGainPer(想獣1体分)=+4")
    assert(s.players.p1.hand.length === handBefore + 1, "破壊時：drawPer(想獣1体分)で1枚ドロー")
}
{
    console.log("--- BS02-106 ローヤルポーション：refreshAllByCostで両陣営のコスト2スピリットを回復 ---")
    const s = createGame(
        "bs02-ext-refreshcost",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const own2 = createInstance("BS01-004", s.turn, 1) // ドラグノ偵察兵 コスト2
    own2.isRested = true
    const own3 = createInstance("BS01-009", s.turn, 1) // ヴォルク・バブーン コスト3
    own3.isRested = true
    s.players.p1.field.spirits.push(own2, own3)
    const opp2 = createInstance("BS01-004", s.turn, 1)
    opp2.isRested = true
    s.players.p2.field.spirits.push(opp2)
    s.players.p1.hand[0] = "BS02-106"
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ローヤルポーションを使用")
    assert(!own2.isRested, "自分のコスト2スピリットが回復")
    assert(!opp2.isRested, "相手のコスト2スピリットも回復（両陣営）")
    assert(own3.isRested === true, "コスト3のスピリットはrefreshAllByCost対象外で疲労のまま")
}
{
    console.log("--- BS02-075 天使長プリンシパール：召喚時にdestroyOwnByCostでコスト最大の1体を破壊 ---")
    const s = createGame(
        "bs02-ext-destroyowncost",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const low = createInstance("BS01-004", s.turn, 1) // コスト2
    const mid = createInstance("BS01-012", s.turn, 1) // コスト4
    const high = createInstance("BS01-016", s.turn, 1) // コスト5（maxCost超過で対象外）
    s.players.p1.field.spirits.push(low, mid, high)
    s.players.p1.hand[0] = "BS02-075"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "天使長プリンシパールを召喚")
    assert(!s.players.p1.field.spirits.includes(mid), "コスト4以下のうちコスト最大のスピリットが破壊される")
    assert(s.players.p1.field.spirits.includes(low), "コスト2のスピリットは対象外で生存")
    assert(s.players.p1.field.spirits.includes(high), "コスト5のスピリットはmaxCost超過で対象外")
    // 召喚コスト8+維持コア1=9を消費（20→11）、destroyOwnByCostでmid自身のコア1個がリザーブへ（11→12）、
    // gainCoresEqualCostでmidのコスト4ぶんコア追加（12→16）
    assert(s.players.p1.reserve === 16, "召喚コスト消費＋破壊時のコア戻し＋gainCoresEqualCostの合計が一致")
}

console.log("=== キーワード付与（grantKeyword / keywordGrant）と aura keywordFilter ===")
{
    console.log("--- スピリットリンク：付与された覚醒でawakenアクションが通る ---")
    const s = createGame(
        "grant-keyword-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン（覚醒なし）
    const donor = createInstance("BS01-001", s.turn, 2) // コア供給元
    s.players.p1.field.spirits.push(attacker, donor)
    s.players.p1.hand[0] = "BS02-089"
    s.players.p1.reserve = 10
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    // 覚醒なしの時点では拒否される
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: attacker.instanceId,
            fromInstanceId: donor.instanceId,
            count: 1,
        }) !== null,
        "覚醒を持たないスピリットのawakenは拒否",
    )
    act(s, "p2", { type: "pass" }) // 防御側パス → p1に優先権
    assert(
        act(s, "p1", {
            type: "castMagic",
            handIndex: 0,
            targetInstanceId: attacker.instanceId,
        }) === null,
        "フラッシュでスピリットリンクを使用",
    )
    assert(
        attacker.tempKeywords.some((k) => k.keyword === "awaken"),
        "対象に覚醒が一時付与される",
    )
    act(s, "p2", { type: "pass" }) // 使用で優先権がp2へ移る → p2パスでp1へ戻る
    assert(
        act(s, "p1", {
            type: "awaken",
            instanceId: attacker.instanceId,
            fromInstanceId: donor.instanceId,
            count: 1,
        }) === null,
        "付与された覚醒でコアを移動できる",
    )
    assert(attacker.cores === 2 && donor.cores === 1, "コアが移動している")

    console.log("--- ターン終了で一時付与がクリアされる ---")
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" }) // フラッシュ終了
    act(s, "p2", { type: "takeLife" })
    act(s, "p1", { type: "endTurn" })
    assert(attacker.tempKeywords.length === 0, "endTurnでtempKeywordsが空になる")

    console.log("--- インビンシブルシールド：付与された装甲が赤の効果を防ぐ ---")
    const s2 = createGame(
        "grant-armor-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const guard = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(guard)
    resolveAction(s2, "p2", null, {
        type: "grantKeyword",
        keyword: "armor",
        colors: ["red", "purple", "green", "blue"],
    }, guard.instanceId)
    // p1の赤ソースの破壊効果は装甲で対象に取れない
    resolveAction(s2, "p1", null, { type: "destroy", count: 1 }, undefined, ["red"])
    assert(s2.players.p2.field.spirits.length === 1, "付与された装甲が赤の破壊効果を防ぐ")
}

{
    console.log("--- ディラノス：keywordGrant（地竜へ覚醒付与、アタックステップ限定） ---")
    const s = createGame(
        "keyword-grant-field-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s)
    const dillanos = createInstance("BS02-X05", s.turn, 3) // Lv2（keywordGrant有効）
    const dino = createInstance("BS02-003", s.turn, 2) // ディノハウンド（地竜）
    const gora = createInstance("BS01-001", s.turn, 1) // ゴラドン（爬獣＝対象外）
    s.players.p1.field.spirits.push(dillanos, dino, gora)
    assert(
        !spiritHasKeyword(s, "p1", dino, "awaken"),
        "メインステップでは付与されない（phase: attack 限定）",
    )
    act(s, "p1", { type: "nextPhase" })
    assert(
        spiritHasKeyword(s, "p1", dino, "awaken"),
        "アタックステップ中は地竜に覚醒が付与される",
    )
    assert(
        !spiritHasKeyword(s, "p1", gora, "awaken"),
        "地竜以外には付与されない",
    )

    console.log("--- ディラノスの aura keywordFilter：覚醒持ちのみBP+1000 ---")
    const s2 = createGame(
        "aura-keyword-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "white" },
    )
    runTurnStart(s2)
    const dillanos2 = createInstance("BS02-X05", s2.turn, 1) // Lv1（auraは有効、keywordGrantは無効）
    const balmung = createInstance("BS02-007", s2.turn, 1) // バルムンク（静的覚醒持ち・Lv1 BP3000）
    const gora2 = createInstance("BS01-001", s2.turn, 1) // 覚醒なし・Lv1 BP1000
    s2.players.p1.field.spirits.push(dillanos2, balmung, gora2)
    assert(
        effectiveBp(s2, "p1", balmung) === 3000 + 1000,
        "覚醒持ちバルムンクはaura keywordFilterで+1000",
    )
    assert(effectiveBp(s2, "p1", gora2) === 1000, "覚醒を持たないゴラドンは対象外")
}

console.log("=== BS02-009 竜狩りのアーケオルニ：anyNexusDestroyedとdrawPerDestroyedが二重にならず加算 ===")
{
    const s = createGame(
        "bs02-archeorni-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const archeorni = createInstance("BS02-009", s.turn, 3) // Lv2（fieldEvent有効）
    s.players.p1.field.spirits.push(archeorni)
    const nexus = createInstance("BS02-078", s.turn, 0) // 夢魔の寝所（効果なしの中立ネクサス）
    s.players.p2.field.nexuses.push(nexus)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "destroyNexus", count: 1, drawPerDestroyed: 1 })
    assert(s.players.p2.field.nexuses.length === 0, "ネクサスが破壊される")
    assert(
        s.players.p1.hand.length === handBefore + 2,
        "drawPerDestroyed(1枚)とアーケオルニのfieldEvent(1枚)で合計2枚ドロー（二重にならない）",
    )
}

console.log("=== BS02-013 バット・バット：onBlockedでブロッカーのコアが1個減り相手リザーブへ ===")
{
    const s = createGame(
        "bs02-batbat-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const batbat = createInstance("BS02-013", s.turn, 3) // Lv2（onBlocked有効）
    s.players.p1.field.spirits.push(batbat)
    const blocker = createInstance("BS01-001", s.turn, 2) // ゴラドン コア2
    s.players.p2.field.spirits.push(blocker)
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: batbat.instanceId }) === null, "バット・バットでアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ゴラドンでブロック")
    assert(blocker.cores === 1, "ブロッカーのコアが1個減る")
    assert(s.players.p2.reserve === reserveBefore + 1, "減ったコアがブロッカー側（相手）のリザーブへ加算される")
}

console.log("=== BS02-024 暗黒将軍ブラッディ・シーザー：onAttackのdestroyExhausted anySideが両陣営から実効BP最大を破壊 ===")
{
    const s = createGame(
        "bs02-caesar-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const caesar = createInstance("BS02-024", s.turn, 3) // Lv2 BP6000（onAttack有効）
    const ownRested = createInstance("BS01-073", s.turn, 1) // 極彩鳥ヴァルペルチャー Lv1 BP7000（シーザーより高BP）
    ownRested.isRested = true
    s.players.p1.field.spirits.push(caesar, ownRested)
    const oppRested = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    oppRested.isRested = true
    s.players.p2.field.spirits.push(oppRested)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: caesar.instanceId }) === null, "シーザーでアタック")
    assert(!s.players.p1.field.spirits.includes(ownRested), "自陣の疲労スピリット（BP7000）がanySideで破壊される")
    assert(s.players.p2.field.spirits.includes(oppRested), "相手の疲労スピリット（BP1000、より低い）は破壊されない")
    assert(s.players.p1.field.spirits.includes(caesar), "シーザー自身（BP6000、7000より低い）は残る")
}

console.log("=== BS02-X06 魔界七将デストロード：召喚時にLv2スピリットのみ両陣営で疲労 ===")
{
    const s = createGame(
        "bs02-desperado-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const p1Lv1 = createInstance("BS01-004", s.turn, 1) // Lv1
    const p1Lv2 = createInstance("BS01-004", s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(p1Lv1, p1Lv2)
    const p2Lv1 = createInstance("BS01-004", s.turn, 1) // Lv1
    const p2Lv2 = createInstance("BS01-004", s.turn, 2) // Lv2
    s.players.p2.field.spirits.push(p2Lv1, p2Lv2)
    s.players.p1.hand[0] = "BS02-X06"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "デストロードを召喚")
    assert(p1Lv2.isRested === true, "自陣のLv2スピリットが疲労する")
    assert(p2Lv2.isRested === true, "相手陣のLv2スピリットも疲労する")
    assert(p1Lv1.isRested === false, "自陣のLv1スピリットは疲労しない")
    assert(p2Lv1.isRested === false, "相手陣のLv1スピリットは疲労しない")
}

console.log("=== BS02-012 地龍王ケンドラゴス：召喚時に両陣営で最多色以外のスピリットが破壊される ===")
{
    const s = createGame(
        "bs02-kendragos-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "green" },
    )
    runTurnStart(s)
    s.players.p1.reserve = 20
    const p1Red1 = createInstance("BS01-001", s.turn, 1) // 赤
    const p1Red2 = createInstance("BS01-002", s.turn, 1) // 赤
    const p1White = createInstance("BS01-074", s.turn, 1) // 白（少数派）
    s.players.p1.field.spirits.push(p1Red1, p1Red2, p1White)
    const p2Green1 = createInstance("BS01-050", s.turn, 1) // 緑
    const p2Green2 = createInstance("BS01-051", s.turn, 1) // 緑
    const p2Yellow = createInstance("BS02-049", s.turn, 1) // 黄（少数派）
    s.players.p2.field.spirits.push(p2Green1, p2Green2, p2Yellow)
    s.players.p1.hand[0] = "BS02-012"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ケンドラゴスを召喚")
    assert(!s.players.p1.field.spirits.includes(p1White), "自陣の少数派色（白）のスピリットが破壊される")
    assert(s.players.p1.field.spirits.includes(p1Red1) && s.players.p1.field.spirits.includes(p1Red2), "自陣の最多色（赤、ケンドラゴス自身を含め3体）は残る")
    assert(!s.players.p2.field.spirits.includes(p2Yellow), "相手陣の少数派色（黄）のスピリットも破壊される")
    assert(s.players.p2.field.spirits.includes(p2Green1) && s.players.p2.field.spirits.includes(p2Green2), "相手陣の最多色（緑）は残る")
}

console.log("=== BS02-006 プテラトマホーク：onAttackのdestroy(bpEqualsSelf)はselfと同BPの相手のみ破壊 ===")
{
    const s = createGame(
        "bs02-pteratomahawk-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const pteratomahawk = createInstance("BS02-006", s.turn, 1) // Lv1 BP2000
    s.players.p1.field.spirits.push(pteratomahawk)
    const sameBp = createInstance("BS02-006", s.turn, 1) // Lv1 BP2000（同BP）
    const diffBp = createInstance("BS02-006", s.turn, 3) // Lv2 BP4000（異BP）
    s.players.p2.field.spirits.push(sameBp, diffBp)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: pteratomahawk.instanceId }) === null, "プテラトマホークでアタック")
    assert(!s.players.p2.field.spirits.includes(sameBp), "同BPの相手スピリットが破壊される")
    assert(s.players.p2.field.spirits.includes(diffBp), "異BPの相手スピリットは残る")
}

console.log("=== BS02-050 コリスタル：バトル（ブロックあり）で生き残っても終了時に自壊する ===")
{
    const s = createGame(
        "bs02-koristal-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const koristal = createInstance("BS02-050", s.turn, 2) // Lv2 BP5000（onBattleEnd有効）
    s.players.p1.field.spirits.push(koristal)
    const weak = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1 BP1000
    s.players.p2.field.spirits.push(weak)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: koristal.instanceId }) === null, "コリスタルでアタック")
    assert(act(s, "p2", { type: "block", instanceId: weak.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(!s.players.p2.field.spirits.includes(weak), "BPで負けたブロッカーは破壊される")
    assert(!s.players.p1.field.spirits.includes(koristal), "バトルに勝ったコリスタル自身もバトル終了時に自壊する")
}

console.log("=== BS02-016 スライミー：Lv3のアタックでライフのコアがリザーブでなくボイドへ ===")
{
    const s = createGame(
        "bs02-slimy-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "yellow" },
    )
    runTurnStart(s)
    const slimy = createInstance("BS02-016", s.turn, 4) // Lv3（lifeDamageToVoid有効）
    s.players.p1.field.spirits.push(slimy)
    s.players.p2.reserve = 0
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: slimy.instanceId }) === null, "スライミーでアタック")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側はライフで受けられる")
    assert(s.players.p2.life === lifeBefore - 1, "ライフが1減る")
    assert(s.players.p2.reserve === 0, "取り除かれたコアはリザーブでなくボイドへ消える")
}

console.log("=== BS02-058 ペンタン：黄3つ以上でマジックのeffectiveCostが下がる ===")
{
    const s = createGame(
        "bs02-pentan-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const pentan = createInstance("BS02-058", s.turn, 1) // Lv1
    const yellow2 = createInstance("BS02-050", s.turn, 1) // コリスタル（黄）
    s.players.p1.field.spirits.push(pentan, yellow2)
    const timeleap = getCard("BS02-107") // タイムリープ：黄マジック cost5 reduction[黄,黄]
    const costBefore = effectiveCost(s, "p1", timeleap)
    assert(costBefore === 3, "黄が2つ（3つ未満）では従来通りの軽減（cost5-2=3）")
    const yellow3 = createInstance("BS02-067", s.turn, 1) // 天使バーチュ（黄）で3つ目
    s.players.p1.field.spirits.push(yellow3)
    const costAfter = effectiveCost(s, "p1", timeleap)
    assert(costAfter === costBefore - 1, "黄が3つ以上になると軽減シンボルが追加されコストが1下がる")
}

console.log("=== BS02-067 天使バーチュ：手札の黄スピリットのコストが下がる ===")
{
    const s = createGame(
        "bs02-virtue-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const virtue = createInstance("BS02-067", s.turn, 1) // Lv1（軽減シンボル付与は無効）
    s.players.p1.field.spirits.push(virtue)
    const chunpopo = getCard("BS02-051") // チュンポポ：黄スピリット cost1 reduction[]
    assert(effectiveCost(s, "p1", chunpopo) === 1, "バーチュLv1では軽減シンボル付与は効かない")
    virtue.cores = 3 // Lv2へ（軽減シンボル付与が有効になる）
    assert(effectiveCost(s, "p1", chunpopo) === 0, "バーチュLv2になると黄スピリットのコストが1下がる")
}

console.log("=== BS02-107 タイムリープ：メインで召喚時効果持ちスピリットのonSummonを再発揮 ===")
{
    const s = createGame(
        "bs02-timeleap-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "purple", p2: "red" },
    )
    runTurnStart(s)
    const gripHands = createInstance("BS01-030", s.turn, 1) // グリプ・ハンズ Lv1（onSummon draw1）
    s.players.p1.field.spirits.push(gripHands)
    s.players.p1.hand[0] = "BS02-107" // タイムリープ
    s.players.p1.reserve = 10
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: gripHands.instanceId }) === null, "タイムリープを使用")
    assert(s.players.p1.deck.length === deckBefore - 1, "召喚時効果（ドロー）が再発揮してデッキから1枚引く")
    assert(s.players.p1.hand.length === handBefore, "タイムリープの使用（-1）とドロー（+1）で手札枚数は変わらない")
}

console.log("=== BS02-102 ホワイトポーション：フラッシュで自分のスピリット1体を回復 ===")
{
    const s = createGame(
        "bs02-whitepotion-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const rested = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1
    rested.isRested = true
    s.players.p1.field.spirits.push(rested)
    s.players.p1.hand[0] = "BS02-102" // ホワイトポーション
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ホワイトポーションを使用")
    assert(!rested.isRested, "疲労していた自分のスピリットが回復する")
}

