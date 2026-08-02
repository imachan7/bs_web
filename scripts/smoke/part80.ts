// smoke パート80（キーワード能力の未到達カード：実装済みだが一度も適用実績のない12枚）
//
// coverage:effects の「★ 場に出ているのに一度も適用されていない効果」で検出された
// kind:"keyword" エントリ12件を、カードデータ経由（そのカード自身を場に出して実際に
// キーワードを発動させる）で1件ずつ通す。対象は各カードの e1（keyword）のみ。
// e2（triggered/fieldEvent）を併せ持つカードもあるが、e2 は今回のスコープ外
import { act, takeLifeAndResolve, assert, createGame, createInstance, effectiveCost, getCard, minLevelCores } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS01-020 翼刃竜スティラノドン：【覚醒】でコアを移動できる ===")
{
    const s = setup("stiranodon-awaken", "red", "green")
    const target = put(s, "p1", "BS01-020", 1) // Lv1 cores1（覚醒 Lv1-2）
    const source = put(s, "p1", "BS01-001", 2) // ゴラドン（コア提供元）
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    assert(
        act(s, "p1", { type: "awaken", instanceId: target.instanceId, fromInstanceId: source.instanceId, count: 1 }) === null,
        "【覚醒】でコアを移動できる",
    )
    assert(target.cores === 2, "対象にコアが1個移動して2個になった")
    assert(source.cores === 1, "移動元は維持コア(1)が残り消滅しない")
}

console.log("=== BS02-007 昇龍バルムンク：【覚醒】でコアを移動できる ===")
{
    const s = setup("balmunk-awaken", "red", "green")
    const target = put(s, "p1", "BS02-007", 1) // Lv1 cores1（覚醒 Lv1-3）
    const source = put(s, "p1", "BS01-001", 2) // ゴラドン（コア提供元）
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    assert(
        act(s, "p1", { type: "awaken", instanceId: target.instanceId, fromInstanceId: source.instanceId, count: 1 }) === null,
        "【覚醒】でコアを移動できる",
    )
    assert(target.cores === 2, "対象にコアが1個移動して2個になった")
}

console.log("=== BS02-011 ツヴァイ・ハウル：【覚醒】でコアを移動できる ===")
{
    const s = setup("zwei-haul-awaken", "red", "green")
    const target = put(s, "p1", "BS02-011", 1) // Lv1 cores1（覚醒 Lv1-3。e2はonAttack destroyだが今回対象外）
    const source = put(s, "p1", "BS01-001", 2) // ゴラドン（コア提供元）
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    assert(
        act(s, "p1", { type: "awaken", instanceId: target.instanceId, fromInstanceId: source.instanceId, count: 1 }) === null,
        "【覚醒】でコアを移動できる",
    )
    assert(target.cores === 2, "対象にコアが1個移動して2個になった")
}

console.log("=== BS03-006 ランカフォリンクス：【覚醒】でコアを移動できる ===")
{
    const s = setup("lanka-awaken", "red", "purple")
    const target = put(s, "p1", "BS03-006", 1) // Lv1 cores1（覚醒 Lv1-3。e2の同BP破壊はpart20で別途検証済み）
    const source = put(s, "p1", "BS01-001", 2) // ゴラドン（コア提供元）
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    assert(
        act(s, "p1", { type: "awaken", instanceId: target.instanceId, fromInstanceId: source.instanceId, count: 1 }) === null,
        "【覚醒】でコアを移動できる",
    )
    assert(target.cores === 2, "対象にコアが1個移動して2個になった")
}

console.log("=== BS01-064 ジガ・ワスプ：【神速】で相手ターンのフラッシュタイミングでも手札から召喚できる ===")
{
    const s = setup("ziga-wasp-soku", "green", "red")
    s.turnPlayer = "p2" // 相手ターンでも神速召喚できることを併せて確認する
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.players.p1.hand[0] = "BS01-064" // ジガ・ワスプ（神速）コスト4
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        "相手ターンのフラッシュタイミングでも【神速】により手札から召喚できる",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-064"),
        "ジガ・ワスプが場に出た",
    )
    assert(
        s.players.p1.reserve === reserveBefore - 4 - 1,
        "コスト4＋配置コア1個がすべてリザーブから支払われた",
    )
}

console.log("=== BS01-073 極彩鳥ヴァルペルチャー：【神速】で相手ターンのフラッシュタイミングでも手札から召喚できる ===")
{
    const s = setup("valpercher-soku", "green", "red")
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.players.p1.hand[0] = "BS01-073" // 極彩鳥ヴァルペルチャー（神速）コスト8
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        "相手ターンのフラッシュタイミングでも【神速】により手札から召喚できる",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-073"),
        "極彩鳥ヴァルペルチャーが場に出た",
    )
    assert(
        s.players.p1.reserve === reserveBefore - 8 - 1,
        "コスト8＋配置コア1個がすべてリザーブから支払われた",
    )
}

console.log("=== BS03-028 モグランナー：【神速】で相手ターンのフラッシュタイミングでも手札から召喚できる ===")
{
    const s = setup("mogurannaa-soku", "green", "red")
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.players.p1.hand[0] = "BS03-028" // モグランナー（神速）コスト3（e2 fieldEventは今回対象外）
    const reserveBefore = s.players.p1.reserve
    assert(
        act(s, "p1", { type: "summon", handIndex: 0 }) === null,
        "相手ターンのフラッシュタイミングでも【神速】により手札から召喚できる",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS03-028"),
        "モグランナーが場に出た",
    )
    assert(
        s.players.p1.reserve === reserveBefore - 3 - 1,
        "コスト3＋配置コア1個がすべてリザーブから支払われた",
    )
}

console.log("=== BS03-023 人造生命体No.44：【呪撃】でBPに負けてもブロッカーを破壊する ===")
{
    const s = setup("jinzou44-jugeki", "purple", "red")
    const attacker = put(s, "p1", "BS03-023", 1) // Lv1 cores1 bp4000（呪撃 Lv1-2。e2は今回対象外）
    const blocker = put(s, "p2", "BS01-025", 1) // 要塞龍ギガ Lv1 cores1 bp5000（呪撃・装甲なし）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "人造生命体No.44でアタック")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "要塞龍ギガでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === attacker.instanceId),
        "アタッカーはBP比較で敗北し破壊される（4000<5000）",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === blocker.instanceId),
        "本来BP比較では生き残るはずのブロッカーも【呪撃】で破壊される",
    )
}

console.log("=== BS03-096 巨人王ランドルフ：【粉砕】でアタック時に相手デッキを破棄する ===")
{
    const s = setup("randolph-funsai", "blue", "purple")
    const randolph = put(s, "p1", "BS03-096", 4) // Lv2 cores4 bp7000（粉砕 Lv1-3）
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: randolph.instanceId }) === null, "ランドルフでアタック（粉砕発動）")
    assert(s.players.p2.deck.length === deckBefore - 2, "現在レベル(Lv2)ぶん相手デッキが2枚減った")
    assert(s.players.p2.trashCards.length === trashBefore + 2, "相手トラッシュが2枚増えた")
}

console.log("=== BS05-047 ブロンズ・ゴレム：【粉砕】でアタック時に相手デッキを破棄する ===")
{
    const s = setup("golem-funsai", "blue", "green")
    const golem = put(s, "p1", "BS05-047", 1) // Lv1 cores1 bp3000（粉砕 Lv1-3。e2 fieldEventは今回対象外）
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: golem.instanceId }) === null, "ブロンズ・ゴレムでアタック（粉砕発動）")
    assert(s.players.p2.deck.length === deckBefore - 1, "現在レベル(Lv1)ぶん相手デッキが1枚減った")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "相手トラッシュが1枚増えた")
}

console.log("=== BS05-042 天使長ソフィア：【光芒】でバトル中に使用したマジックが手札へ戻る ===")
{
    const s = setup("sophia-kobo", "yellow", "purple")
    const sophia = put(s, "p1", "BS05-042", 3) // Lv2 cores3 bp5000（光芒 Lv2-3。e2は今回対象外）
    s.players.p1.hand[0] = "BS01-123" // リターンドロー（フラッシュ、コスト2）
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: sophia.instanceId }) === null, "ソフィアでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権が移る）")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フラッシュでリターンドローを使用")
    assert(s.players.p1.trashCards.includes("BS01-123"), "使用直後はトラッシュにある")
    assert(takeLifeAndResolve(s, "p2") === null, "防御側はライフで受ける（バトル終了）")
    assert(s.players.p1.hand.includes("BS01-123"), "【光芒】でリターンドローが手札へ戻った")
    assert(!s.players.p1.trashCards.includes("BS01-123"), "トラッシュからは消えている")
}

console.log("=== BS05-X19 聖皇ジークフリーデン：【転召】(void) でコスト6以上の自分のスピリットのコアがボイドへ ===")
{
    const s = setup("jiifuriden-tensho", "red", "purple")
    const candidate = put(s, "p1", "BS01-020", 1) // 翼刃竜スティラノドン：コスト6ちょうど（転召の対象条件を満たす）Lv1 cores1
    s.players.p1.hand[0] = "BS05-X19" // 聖皇ジークフリーデン（転召：コスト6以上/ボイド）
    s.players.p1.reserve = 30
    const trashCoresBefore = s.players.p1.trashCores
    const reserveBeforeSummon = s.players.p1.reserve
    const card = getCard("BS05-X19")
    // reduction（赤赤赤白白白）がスティラノドンの赤シンボル1個ぶん適用され、基本コスト9より下がる点に注意
    const cost = effectiveCost(s, "p1", card)
    const maintain = minLevelCores(card)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "聖皇ジークフリーデンを召喚できる")
    assert(s.players.p1.field.spirits.length === 1, "候補スピリットは維持コア割れで消滅し、残るのは召喚したスピリットのみ")
    assert(s.players.p1.field.spirits[0]?.cardId === "BS05-X19", "残っているのは聖皇ジークフリーデン")
    assert(
        s.players.p1.trashCores === trashCoresBefore + cost,
        `召喚コスト(${cost})ぶんだけトラッシュのコアが増える。ボイド送りの転召分は加算されない（実際${s.players.p1.trashCores - trashCoresBefore}）`,
    )
    assert(
        s.players.p1.reserve === reserveBeforeSummon - cost - maintain,
        `ボイド送りのため転召分のコアはリザーブに戻らない（召喚コスト${cost}＋維持コア${maintain}の支払い分だけ減る）`,
    )
    assert(s.players.p1.trashCards.includes("BS01-020"), "維持コア割れでスティラノドンはトラッシュへ（カードのみ）")
}

console.log("パート80 完了")
