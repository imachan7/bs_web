// smoke パート350（BS16バッチ1：赤・紫＋P069/P070 で新設した器のテスト）
// - onMilledFromDeck then:"destroyMillSource"/"voidOpponentLife"（BS16-002/014）
// - kind:"bpEqualizeFamily"（BS16-009。自分のアタックステップ限定）
// - kind:"destroyBpThresholdBonus"（BS16-061）
// - action:"summonBurstCardFreeIfDestroyedColor"（BS16-018）
// - action:"battleInvertBpWinner"（P070）
// - action:"openOwnBurstActivateIfSummonCond"（BS16-X01）
// - globalConstraint "allSpiritsCantBounce"（BS16-012）
// - summonBurstCardFree のブレイヴ対応（自動合体。P069）
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・色・コストを機械検証してから使う。
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { attachBrave } from "../../server/src/logic/EffectModules"
import { instColors } from "../../shared/rules"
import {
    assert,
    act,
    createGame,
    createInstance,
    declareBlock,
    getCard,
    handleAction,
    placeBurst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    effectiveBp,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS16-002").name === "パイルドラコ" && getCard("BS16-002").type === "spirit" && getCard("BS16-002").colors.includes("red"), "002はパイルドラコ")
    assert(getCard("BS16-014").name === "オカピエン" && getCard("BS16-014").colors.includes("purple"), "014はオカピエン")
    assert(getCard("BS16-009").name === "爬獣使い百地ダイル" && getCard("BS16-009").family.includes("爬獣"), "009は爬獣使い百地ダイル")
    assert(getCard("BS16-003").family.includes("爬獣"), "003は爬獣を持つ")
    assert(getCard("BS16-061").name === "暗雲射す鬼ヶ島" && getCard("BS16-061").type === "nexus", "061は暗雲射す鬼ヶ島（ネクサス）")
    assert(getCard("BS16-018").name === "太骨望", "018は太骨望")
    assert(getCard("P070").name === "カオティック・リクゴー" && getCard("P070").type === "brave", "P070はカオティック・リクゴー（ブレイヴ）")
    assert(getCard("P069").name === "ロード・ブレイバン" && getCard("P069").type === "brave", "P069はロード・ブレイバン（ブレイヴ）")
    assert(getCard("BS16-X01").name === "爆炎の覇王ロード・ドラゴン・バゼル", "X01はバゼル")
    assert(getCard("BS16-012").name === "金狐角", "012は金狐角")
    assert(getCard("BS16-074").type === "magic" && getCard("BS16-074").effects.some((e) => e.kind === "burst" && e.event === "opponentSummonEffectResolved"), "074は相手召喚時発揮後バーストのマジック")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. BS16-002パイルドラコ：破棄された瞬間に発揮し、残りの破棄を打ち切る＋以後このターン自分のデッキは破棄されない ===")
{
    const s = game("p002-stop")
    const causer = put(s, "p2", "BS01-001", 1)
    s.players.p1.deck = ["BS16-002", "BS16-002", "BS01-001", "BS01-001"]
    resolveAction(s, "p2", causer, { type: "mill", count: 3 }, undefined, instColors(causer), "spirit")
    assert(s.players.p1.deck.length === 3, `1枚だけ破棄されて止まった（残り${s.players.p1.deck.length}枚）`)
    assert(s.players.p1.trashCards.includes("BS16-002"), "破棄されたパイルドラコはトラッシュに残る")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === causer.instanceId), "破棄を引き起こした相手のスピリットは破壊された")
    // このターンの間、自分（p1）のデッキは自分の効果でも破棄されない
    const before = s.players.p1.deck.length
    resolveAction(s, "p1", null, { type: "mill", count: 1, side: "own" }, undefined, undefined, "spirit")
    assert(s.players.p1.deck.length === before, "このターンの間、自分の効果でもデッキは破棄されない")
}

console.log("=== 2. BS16-014オカピエン：2枚破棄されたら相手のライフが2個減る（破棄し終えてから） ===")
{
    const s = game("p014-void")
    const causer = put(s, "p2", "BS01-001", 1)
    s.players.p1.deck = ["BS16-014", "BS16-014", "BS01-001"]
    const lifeBefore = s.players.p2.life
    resolveAction(s, "p2", causer, { type: "mill", count: 3 }, undefined, instColors(causer), "spirit")
    assert(s.players.p1.deck.length === 0, "3枚とも破棄された（オカピエンは破棄を止めない）")
    assert(s.players.p2.life === lifeBefore - 2, `相手（p2）のライフが2個減った（${s.players.p2.life}）`)
}

console.log("=== 3. BS16-009爬獣使い百地ダイル：自分のアタックステップ限定でBPを同じにする ===")
{
    const s = game("p009-bpeq")
    const daile = put(s, "p1", "BS16-009", 6) // Lv3 BP12000
    const other = put(s, "p1", "BS16-003", 5) // Lv3 BP6000（爬獣）
    assert(effectiveBp(s, "p1", other) === 6000, "メインステップでは百地ダイルの効果は効かない（本来のBP）")
    act(s, "p1", { type: "nextPhase" })
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", other) === effectiveBp(s, "p1", daile), "アタックステップでは百地ダイルと同じBPになる")
    assert(effectiveBp(s, "p1", daile) === 12000, "百地ダイル自身のBPは変わらない")
}

console.log("=== 4. BS16-061暗雲射す鬼ヶ島：自分のスピリット/マジックの効果で破壊できるBPを+1000 ===")
{
    const s = game("p061-bonus")
    const nexus = createInstance("BS16-061", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    const target = put(s, "p2", "BS01-001", 3) // BP4000（Lv2)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { maxBp: 3000 } }, undefined, ["red"], "spirit")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId), "BP4000だが閾値+1000でBP3000以下扱いになり破壊された")
}

console.log("=== 5. BS16-018太骨望：破壊後、紫が破壊されていれば自身を召喚し直す（色が違えば戻らない） ===")
{
    const s = game("p018-resummon")
    placeBurst(s, "p1", "BS16-018")
    const purpleVictim = put(s, "p1", "BS16-010", 1) // 紫
    const restedEnemy = put(s, "p2", "BS01-001", 1)
    restedEnemy.isRested = true
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: purpleVictim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === restedEnemy.instanceId), "疲労状態の相手スピリットが破壊された")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS16-018"), "紫が破壊されていたので太骨望が召喚し直された")
}
{
    const s = game("p018-noresummon")
    placeBurst(s, "p1", "BS16-018")
    const redVictim = put(s, "p1", "BS01-001", 1) // 赤（紫ではない）
    const restedEnemy = put(s, "p2", "BS01-001", 1)
    restedEnemy.isRested = true
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: redVictim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === "BS16-018"), "紫が破壊されていないので太骨望は召喚されない")
    assert(s.players.p1.trashCards.includes("BS16-018"), "その代わりトラッシュへ置かれた")
}

console.log("=== 6. P070カオティック・リクゴー：バトル解決の勝敗を反転する（BPの高い方が破壊される） ===")
{
    const s = game("p070-invert")
    const host = put(s, "p1", "BS01-001", 1) // Lv1 BP1000
    const brave = createInstance("P070", s.turn, 0)
    attachBrave(s, "p1", host, brave)
    const enemy = put(s, "p2", "BS16-003", 5) // Lv3 BP6000（防御側）
    act(s, "p1", { type: "nextPhase" })
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "P070合体スピリットでアタック")
    assert(declareBlock(s, "p2", enemy.instanceId) === null, "相手がBP6000でブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === host.instanceId), "反転により、BPの低いホスト側は破壊されず生き残った")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId), "反転により、BPの高い相手のスピリットが破壊された")
}

console.log("=== 7. P069ロード・ブレイバン：バーストで召喚するとき、合体条件を満たすホストがいれば直接合体する ===")
{
    const s = game("p069-combine")
    assert(getCard("BS16-005").cost >= 4, "BS16-005はコスト4以上（合体条件を満たす）")
    const host = put(s, "p1", "BS16-005", 4) // コスト4（合体条件を満たす）
    s.players.p1.burst = "P069"
    s.players.p1.burstSet = true
    resolveAction(s, "p1", null, { type: "summonBurstCardFree" })
    assert(s.players.p1.field.combinedBraves.some((b) => b.cardId === "P069"), "コスト4以上のホストがいたので直接合体した")
    assert((host.braveRefs ?? []).some((r) => s.players.p1.field.combinedBraves.some((b) => b.cardId === "P069" && b.instanceId === r.instanceId)), "ホストがP069を参照している")
}

console.log("=== 8. BS16-X01：バーストをオープンし、条件が合えば発動・合わなければデッキの下 ===")
{
    const s = game("x01-match")
    s.players.p1.burst = "BS16-074" // 【バースト：相手の召喚時発揮後】
    s.players.p1.burstSet = true
    const x01 = put(s, "p1", "BS16-X01", 5)
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", x01, { type: "openOwnBurstActivateIfSummonCond" })
    assert(s.players.p1.burst === null && !s.players.p1.burstSet, "バーストは空になった")
    assert(!s.players.p1.deck.includes("BS16-074"), "条件が合ったのでデッキの下には戻らない")
    assert(s.players.p1.trashCards.includes("BS16-074") || s.players.p1.deck.length === deckBefore + 1, "発動して手順どおり後始末された")
}
{
    const s = game("x01-nomatch")
    s.players.p1.burst = "BS16-018" // 【バースト：相手による自分のスピリット破壊後】＝条件が違う
    s.players.p1.burstSet = true
    const x01 = put(s, "p1", "BS16-X01", 5)
    resolveAction(s, "p1", x01, { type: "openOwnBurstActivateIfSummonCond" })
    assert(s.players.p1.burst === null && !s.players.p1.burstSet, "バーストは空になった")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === "BS16-018", "条件が合わないのでデッキの下に戻った")
    assert(!s.players.p1.trashCards.includes("BS16-018"), "トラッシュには置かれない")
}

console.log("=== 9. BS16-012金狐角：自分のアタックステップの間、スピリットすべては手札に戻らない（お互い） ===")
{
    const s = game("p012-nobounce")
    put(s, "p1", "BS16-012", 3)
    const enemy = put(s, "p2", "BS01-001", 1)
    resolveAction(s, "p1", null, { type: "returnToHand", count: 1 }, undefined, undefined, "spirit")
    assert(s.players.p2.hand.includes("BS01-001"), "メインステップでは通常どおり手札に戻る")
    const enemy2 = put(s, "p2", "BS01-001", 1)
    act(s, "p1", { type: "nextPhase" })
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "returnToHand", count: 1 }, undefined, undefined, "spirit")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy2.instanceId),
        "アタックステップ中はスピリットが手札に戻らない",
    )
    void enemy
}

console.log("すべてのチェックに合格しました 🎉（part350）")
