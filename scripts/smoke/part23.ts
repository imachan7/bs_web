// smoke パート23（第三弾 BS03 黄カード構造化バッチ）
// 収録セクション:
//   - BS03-049 ミケネ：破壊時、自分のスピリット1体を回復（refreshOne フィルタなし）
//   - BS03-061 苺っ娘ストロベリ：破壊時、【光芒】持ちの自分のスピリット1体を回復（refreshOne keywordFilter:kobo）
//   - BS03-055 ゴマザラシ：相手のアタックステップ中のみ、白がいれば自身+1000／自分の白全体+1000（aura phaseTurn:opponent）
//   - BS03-066 天使アルケー：自分の黄マジック/手札の黄スピリットに軽減シンボル[黄][黄]を付与（reductionGrant）
//   - BS03-067 アルカナプリンセス・アン：アタック時、名前に「アルカナ」を含む自分のスピリット数×1000で自身+BP（selfBuffPer counter:ownNameIncludes）
//   - BS03-110 星降る巡礼地：相手のアタックステップ中のみ、【光芒】持ちの自分のスピリットすべて+2000（aura keywordFilter:kobo）
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    effectiveCost,
    getCard,
    runTurnStart,
} from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

console.log("=== BS03-049 ミケネ：破壊時に自分のスピリット1体を回復 ===")
{
    const s = createGame(
        "bs03-049-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const mikene = createInstance("BS03-049", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(mikene)
    const ally = createInstance("BS01-001", s.turn, 1)
    ally.isRested = true
    s.players.p1.field.spirits.push(ally)
    fireTrigger(s, "p1", mikene, "onDestroy")
    assert(!ally.isRested, "破壊時の効果で自分のスピリットが回復する")
}

console.log("=== BS03-061 苺っ娘ストロベリ：破壊時、【光芒】持ちのみ回復する ===")
{
    const s = createGame(
        "bs03-061-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const strawberry = createInstance("BS03-061", s.turn, 3) // Lv2
    s.players.p1.field.spirits.push(strawberry)
    const koboAlly = createInstance("BS03-054", s.turn, 3) // アルカナドール・トリア Lv2：【光芒】持ち
    koboAlly.isRested = true
    s.players.p1.field.spirits.push(koboAlly)
    const plainAlly = createInstance("BS01-001", s.turn, 1)
    plainAlly.isRested = true
    s.players.p1.field.spirits.push(plainAlly)
    fireTrigger(s, "p1", strawberry, "onDestroy")
    assert(!koboAlly.isRested, "【光芒】持ちは回復する")
    assert(plainAlly.isRested, "【光芒】を持たないスピリットは回復対象外")
}

console.log("=== BS03-055 ゴマザラシ：相手のアタックステップ中のみ白関連BPが上がる ===")
{
    const s = createGame(
        "bs03-055-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const gomazarashi = createInstance("BS03-055", s.turn, 3) // Lv2 cores3 bp4000
    s.players.p1.field.spirits.push(gomazarashi)
    const whiteAlly = createInstance("BS01-074", s.turn, 1) // 白スピリット
    s.players.p1.field.spirits.push(whiteAlly)
    const gomaBase = effectiveBp(s, "p1", gomazarashi)
    const whiteBase = effectiveBp(s, "p1", whiteAlly)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1（自分）のアタックステップへ移行")
    assert(
        effectiveBp(s, "p1", gomazarashi) === gomaBase,
        "自分のターンのアタックステップではオーラが効かない",
    )
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了、p2のターンへ")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(
        effectiveBp(s, "p1", gomazarashi) === gomaBase + 1000,
        "相手のアタックステップ中は白スピリットがいるので自身+1000",
    )
    assert(
        effectiveBp(s, "p1", whiteAlly) === whiteBase + 1000,
        "相手のアタックステップ中は自分の白スピリット全体も+1000（Lv2）",
    )
}

console.log("=== BS03-066 天使アルケー：黄マジック/黄スピリットに軽減シンボルを付与 ===")
{
    const s = createGame(
        "bs03-066-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const virtue = getCard("BS02-057") // 妖精女王ティ・ターニャ：黄スピリット cost3 reduction[黄]
    const royalPotion = getCard("BS02-106") // ローヤルポーション：黄マジック cost4 reduction[黄,黄]

    // カード自身の symbol は色ごとに常に1個のため、軽減シンボル数ぶんの黄フィールドシンボルを
    // 別途用意する（アルケー1体＋黄スピリット2体＝黄シンボル3個）
    const arche = createInstance("BS03-066", s.turn, 1) // Lv1（スピリット軽減は未付与）
    s.players.p1.field.spirits.push(arche)
    s.players.p1.field.spirits.push(createInstance("BS02-054", s.turn, 1)) // ポム（黄）
    s.players.p1.field.spirits.push(createInstance("BS02-055", s.turn, 1)) // チャウー（黄）
    assert(effectiveCost(s, "p1", virtue) === 2, "Lv1では手札の黄スピリット軽減は付与されない（3-1=2）")
    assert(
        effectiveCost(s, "p1", royalPotion) === 1,
        "Lv1でも黄マジックには軽減シンボルが付与される（4-3=1、フィールドの黄シンボル3個が上限）",
    )

    arche.cores = 3 // Lv2へ
    assert(effectiveCost(s, "p1", virtue) === 0, "Lv2になると手札の黄スピリットにも[黄][黄]が付与される（3-3=0）")
}

console.log("=== BS03-067 アルカナプリンセス・アン：アタック時「アルカナ」名の数×1000で自身+BP ===")
{
    const s = createGame(
        "bs03-067-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const anne = createInstance("BS03-067", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(anne)
    const arcanaAlly = createInstance("BS02-070", s.turn, 1) // アルカナプリンス・オベロ（名前に「アルカナ」を含む）
    s.players.p1.field.spirits.push(arcanaAlly)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: anne.instanceId }) === null, "アンでアタック")
    assert(anne.tempBpBuff === 2000, "「アルカナ」を含む自分2体（アン自身＋オベロ）ぶんBP+2000")
}

console.log("=== BS03-110 星降る巡礼地：相手のアタックステップ中のみ【光芒】持ちすべて+2000 ===")
{
    const s = createGame(
        "bs03-110-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const shrine = createInstance("BS03-110", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(shrine)
    const koboAlly = createInstance("BS03-054", s.turn, 3) // アルカナドール・トリア Lv2：【光芒】持ち
    s.players.p1.field.spirits.push(koboAlly)
    const plainAlly = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(plainAlly)
    const koboBase = effectiveBp(s, "p1", koboAlly)
    const plainBase = effectiveBp(s, "p1", plainAlly)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1（自分）のアタックステップへ移行")
    assert(effectiveBp(s, "p1", koboAlly) === koboBase, "自分のターンのアタックステップではオーラが効かない")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1がターン終了、p2のターンへ")
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2がアタックステップへ移行")
    assert(effectiveBp(s, "p1", koboAlly) === koboBase + 2000, "【光芒】持ちは相手のアタックステップ中+2000")
    assert(effectiveBp(s, "p1", plainAlly) === plainBase, "【光芒】を持たないスピリットは対象外")
}
