// smoke パート68（coverage:effects の「(b) カードデータ経由で未検証」13種の回帰）
//
// npm run coverage:effects が「テストが手で組んだactionでしか実行されていない」と報告した
// 13種のaction typeを、実際のカード（summon/castMagic）経由で発火させて潰す。
// resolveActionへ直接actionを渡す書き方はカバレッジに乗らないため使わない。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    effectiveCost,
    getCard,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}

function spiritOf(s: GameState, pid: PlayerId, instanceId: string) {
    return s.players[pid].field.spirits.find((sp) => sp.instanceId === instanceId)
}

function summonFromHand(s: GameState, pid: PlayerId, cardId: string): string | null {
    s.players[pid].hand = [cardId]
    const before = new Set(s.players[pid].field.spirits.map((sp) => sp.instanceId))
    const err = act(s, pid, { type: "summon", handIndex: 0 })
    if (err !== null) return null
    return s.players[pid].field.spirits.find((sp) => !before.has(sp.instanceId))?.instanceId ?? null
}

function castFromHand(
    s: GameState,
    pid: PlayerId,
    cardId: string,
    targetInstanceId?: string,
): string | null {
    s.players[pid].hand = [cardId]
    return act(
        s,
        pid,
        targetInstanceId === undefined
            ? { type: "castMagic", handIndex: 0 }
            : { type: "castMagic", handIndex: 0, targetInstanceId },
    )
}

console.log("=== addSymbolThisTurn（BS03-121 ダブルハート） ===")
{
    const s = setupMain("double-heart")
    const target = put(s, "p1", "BS01-001", 1)
    assert(castFromHand(s, "p1", "BS03-121", target) === null, "ダブルハートを使用")
    assert(spiritOf(s, "p1", target)!.tempExtraSymbols === 1, "対象のtempExtraSymbolsが+1された")
}

console.log("=== bpBuffAllByArmorColors（BS05-078 アイシクルアサルト メイン） ===")
{
    // 2026-07-31: bpBuffAllByArmorColors（tempBpBuff直書き）から lendSelfThisTurn + kind:"aura"
    // （counter:"targetArmorColors"・lentOnly）へ移行（part76参照）。実効値は effectiveBp で確認する
    const s = setupMain("icicle-assault")
    const armored = put(s, "p1", "BS03-044", 1) // 鋼人スルト Lv1【装甲：赤/白】
    assert(castFromHand(s, "p1", "BS05-078") === null, "アイシクルアサルトを使用（メイン）")
    const inst = spiritOf(s, "p1", armored)!
    assert(
        effectiveBp(s, "p1", inst) === currentLevel(inst).bp + 2000,
        "装甲2色ぶん（1000×2）BP増加した",
    )
}

console.log("=== bpBuffByExhaustOwn（BS03-131 ユナイテッドパワー） ===")
{
    const s = setupMain("united-power")
    const buffed = put(s, "p1", "BS01-001", 1) // BP1000（field[0]＝自動バフ先）
    const exhausted = put(s, "p1", "BS01-018", 1) // リザードマンLv1 BP4000（自動疲労先＝BP最大）
    const amount = effectiveBp(s, "p1", spiritOf(s, "p1", exhausted)!)
    assert(castFromHand(s, "p1", "BS03-131") === null, "ユナイテッドパワーを使用")
    assert(spiritOf(s, "p1", exhausted)!.isRested, "BP最大の回復スピリットが疲労した")
    assert(
        spiritOf(s, "p1", buffed)!.tempBpBuff === amount,
        "自動選択されたバフ先が疲労元の実効BP分だけ増加した",
    )
}

console.log("=== coreTradeToOpponentTrash（BS03-124 ポイズンミスト） ===")
{
    // castMagicはまずカード自身のコストをリザーブから支払う（player.trashCoresへ）ため、
    // トレード効果本体で使う分（3個）とは別にコスト分のリザーブを確保しておく
    const s = setupMain("poison-mist")
    const cost = effectiveCost(s, "p1", getCard("BS03-124")) // フィールドが空なので軽減なし＝5
    s.players.p1.reserve = cost + 3
    s.players.p2.reserve = 3
    assert(castFromHand(s, "p1", "BS03-124") === null, "ポイズンミストを使用")
    assert(s.players.p1.reserve === 0, "自分のリザーブが（コスト支払い後）min(3,3)=3個減った")
    assert(s.players.p1.trashCores === cost + 3, "自分のトラッシュコアがコスト分+3個になった")
    assert(s.players.p2.reserve === 0, "相手のリザーブも3個減った")
    assert(s.players.p2.trashCores === 3, "相手のトラッシュコアも3個増えた")
}

console.log("=== destroyAllNexusesWithCores（BS03-007 フレイム・エルク召喚時） ===")
{
    const s = setupMain("flame-elk")
    const nexus = putNexus(s, "p2", "BS01-098", 1)
    assert(summonFromHand(s, "p1", "BS03-007") !== null, "フレイム・エルクを召喚")
    assert(
        s.players.p2.field.nexuses.find((n) => n.instanceId === nexus) === undefined,
        "コアが置かれた相手ネクサスが破壊された",
    )
}

console.log("=== exhaustOpponentToMatch（BS03-139 セイムタイアード） ===")
{
    const s = setupMain("same-tired")
    const r1 = put(s, "p1", "BS01-001", 1)
    const r2 = put(s, "p1", "BS01-002", 1)
    spiritOf(s, "p1", r1)!.isRested = true
    spiritOf(s, "p1", r2)!.isRested = true
    const e1 = put(s, "p2", "BS01-001", 1)
    const e2 = put(s, "p2", "BS01-018", 1)
    assert(castFromHand(s, "p1", "BS03-139") === null, "セイムタイアードを使用")
    assert(
        spiritOf(s, "p2", e1)!.isRested && spiritOf(s, "p2", e2)!.isRested,
        "自分の疲労数（2）に一致するまで相手スピリットが疲労した",
    )
}

console.log("=== levelUpThisTurn（BS03-141 ビルドアップ） ===")
{
    const s = setupMain("build-up")
    const target = put(s, "p1", "BS01-018", 1) // リザードマンLv1（最大Lv3）
    assert(currentLevel(spiritOf(s, "p1", target)!).level === 1, "召喚直後はLv1")
    assert(castFromHand(s, "p1", "BS03-141", target) === null, "ビルドアップを使用")
    assert(currentLevel(spiritOf(s, "p1", target)!).level === 2, "このターンLv2として扱われる")
}

console.log("=== refreshByFamilyAuto（BS03-129 フロックリカバリー） ===")
{
    const s = setupMain("flock-recovery")
    const a = put(s, "p1", "BS01-059", 1) // シダフクロウ（系統：爪鳥）
    const b = put(s, "p1", "BS02-032", 1) // ダッチョーノ（系統：爪鳥）
    spiritOf(s, "p1", a)!.isRested = true
    spiritOf(s, "p1", b)!.isRested = true
    assert(castFromHand(s, "p1", "BS03-129") === null, "フロックリカバリーを使用")
    assert(
        !spiritOf(s, "p1", a)!.isRested && !spiritOf(s, "p1", b)!.isRested,
        "最多系統「爪鳥」の疲労スピリットが回復した",
    )
}

console.log("=== swapBattler（BS03-138 テレポートチェンジ） ===")
{
    const s = setupMain("teleport-change")
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-002", 1)
    const replacement = put(s, "p2", "BS01-018", 1)
    spiritOf(s, "p2", replacement)!.isRested = true
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "p1がアタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "p2がブロック宣言")
    assert(castFromHand(s, "p2", "BS03-138") === null, "テレポートチェンジを使用（自動選択）")
    assert(
        s.battle?.blockerInstanceId === replacement,
        "バトル中のブロッカーが疲労状態のスピリットと入れ替わった",
    )
}

console.log("=== trashCoresToKeywordSpirit（BS04-089 グレートリンク） ===")
{
    const s = setupMain("great-link")
    const awakener = put(s, "p1", "BS01-013", 1) // タウロスナイト（【覚醒】Lv1-3）
    s.players.p1.trashCores = 4
    // castMagicはコストもリザーブ→trashCoresで支払う（awakenerの赤シンボルぶん軽減される）ため、
    // 移動される総量は「事前のtrashCores + 支払われたコスト」になる
    const paidCost = effectiveCost(s, "p1", getCard("BS04-089"))
    const oppAttacker = put(s, "p2", "BS01-001", 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: oppAttacker }) === null, "p2がアタック宣言（p1が防御側優先権）")
    assert(castFromHand(s, "p1", "BS04-089") === null, "グレートリンクをフラッシュで使用")
    assert(s.players.p1.trashCores === 0, "自分のトラッシュコアが0になった")
    assert(
        spiritOf(s, "p1", awakener)!.cores === 1 + 4 + paidCost,
        "【覚醒】持ちスピリットへ、事前のトラッシュコア4個＋コスト支払い分が置かれた",
    )
}

console.log("=== voidCoreToAllOwnByFamily（BS03-035 太陽花ゾンネ・ブルム召喚時） ===")
{
    const s = setupMain("sonnenblume")
    const other = put(s, "p1", "BS01-059", 1) // シダフクロウ（系統：爪鳥）
    const selfId = summonFromHand(s, "p1", "BS03-035") // 太陽花ゾンネ・ブルム（系統：樹魔）
    assert(selfId !== null, "太陽花ゾンネ・ブルムを召喚")
    assert(spiritOf(s, "p1", other)!.cores === 2, "系統「爪鳥」の他スピリットにもコアが置かれた")
    assert(spiritOf(s, "p1", selfId!)!.cores === 2, "自身（系統：樹魔）にもコアが置かれた")
}

console.log("=== voidCoreToAllOwnByFamily（BS05-077 クリスタルオーラ メイン） ===")
{
    const s = setupMain("crystal-aura")
    const target = put(s, "p1", "BS05-040", 1) // プリンセス・スノーホワイト（系統：氷姫）
    assert(castFromHand(s, "p1", "BS05-077") === null, "クリスタルオーラを使用（メイン）")
    assert(spiritOf(s, "p1", target)!.cores === 2, "系統「氷姫」のスピリットにコアが置かれた")
}

console.log("=== voidCoreToTarget（BS03-126 ポーションベリー） ===")
{
    const s = setupMain("potion-berry")
    const target = put(s, "p1", "BS01-001", 1)
    assert(castFromHand(s, "p1", "BS03-126", target) === null, "ポーションベリーを使用")
    assert(spiritOf(s, "p1", target)!.cores === 2, "対象のコアが1個増えた")
}

console.log("=== voidCoresAndMillByCost（BS05-083 マジックスパナ） ===")
{
    const s = setupMain("magic-wrench")
    const target = put(s, "p1", "BS03-085", 3) // ウッド・ゴレム（系統：造兵、コスト4）
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    assert(castFromHand(s, "p1", "BS05-083") === null, "マジックスパナを使用")
    assert(spiritOf(s, "p1", target)!.cores === 0, "対象スピリットのコアがすべてボイドに置かれた")
    assert(s.players.p2.deck.length === deckBefore - 4, "相手デッキが対象のコスト分（4枚）破棄された")
    assert(s.players.p2.trashCards.length === trashBefore + 4, "破棄分が相手トラッシュへ積まれた")
}
