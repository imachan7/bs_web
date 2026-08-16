// smoke パート137（第七弾 青バッチ：新要素の発揮確認）
//
// part136 は器（アクション単体）の確認までだった。ここでは**実カードデータ経由**で
// 青15枚が持ち込んだ新要素が実際に働くことを確かめる:
//   【強襲】／noLifeDamageByCost／noRestWhenBlockingCost／onRefreshed／
//   kyoshuOnBlock／ownRestedNexuses／lockFlash の系統条件／destroyThenMillByCost／
//   destroyOwnByCost の thenDestroyEnemyByCostBudget
//
// カードIDは直書きせず、**カードデータから条件で引いて**使う（IDズレ事故の予防）。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function byId(cardId: string): CardRow {
    const found = CARDS.find((c) => c.cardId === cardId)
    if (!found) throw new Error(`${cardId} が見つかりません`)
    return found
}

// 効果の中身から1枚を引く（カードIDの直書きを避けるため）
function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

// レベル1でコア1のバニラ（盤面に干渉しない詰め物）
const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)
if (!FILLER) throw new Error("バニラが見つかりません")

console.log("=== BS07 青：【強襲】はネクサスを疲労させて回復し、ターン上限を超えない ===")
{
    // 【強襲：1】をLv1から持つスピリット（隼の剣士ファルコニア）をデータから引く
    const kyoshu1 = findByEffect(
        (e) =>
            e["kind"] === "keyword" &&
            e["keyword"] === "kyoshu" &&
            e["count"] === 1 &&
            Array.isArray(e["levels"]) &&
            (e["levels"] as number[]).includes(1),
    )
    const s = base("kyoshu-1")
    const attacker = put(s, "p1", kyoshu1.cardId, 1)
    const nexusA = putNexus(s, "p1", byId("BS07-065").cardId, 0)
    const nexusB = putNexus(s, "p1", byId("BS07-066").cardId, 0)
    put(s, "p2", FILLER.cardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${kyoshu1.name}がアタック`)
    // アタックで疲労したあと、【強襲】の onAttack 誘発でネクサス1つを疲労させて回復している
    assert(attacker.isRested === false, "【強襲】でアタッカーが回復している")
    const restedNexuses = s.players.p1.field.nexuses.filter((n) => n.isRested)
    assert(restedNexuses.length === 1, `ネクサス1つだけが疲労する（実際${restedNexuses.length}つ）`)
    assert(nexusA.isRested !== nexusB.isRested, "疲労したのはどちらか一方だけ")
    assert(attacker.kyoshuUsed?.count === 1, "このターンの使用回数が1になる")
}
{
    // 上限（1回）を超えて2回目は回復しない
    const kyoshu1 = findByEffect(
        (e) =>
            e["kind"] === "keyword" &&
            e["keyword"] === "kyoshu" &&
            e["count"] === 1 &&
            Array.isArray(e["levels"]) &&
            (e["levels"] as number[]).includes(1),
    )
    const s = base("kyoshu-limit")
    const attacker = put(s, "p1", kyoshu1.cardId, 1)
    putNexus(s, "p1", byId("BS07-065").cardId, 0)
    putNexus(s, "p1", byId("BS07-066").cardId, 0)
    put(s, "p2", FILLER.cardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "1回目のアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフで受ける")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "回復したので2回目のアタック")
    assert(attacker.isRested === true, "上限1回のため2回目は回復しない")
    assert(s.players.p1.field.nexuses.filter((n) => n.isRested).length === 1, "ネクサスも1つしか疲労しない")
}

console.log("=== BS07 青：コスト2以下のスピリットのアタックではお互いのライフが減らない ===")
{
    const holder = findByEffect(
        (e) =>
            e["kind"] === "globalConstraint" &&
            (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noLifeDamageByCost",
    )
    const maxCost = Number(
        ((holder.effects ?? []).find(
            (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noLifeDamageByCost",
        )?.["constraint"] as Record<string, unknown>)["maxCost"],
    )
    // 制約の発生源は p2 側に置く（両陣営に効くことも同時に確かめる）
    const cheap = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost,
    )
    const pricey = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 0) > maxCost && (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!cheap || !pricey) throw new Error("コスト条件を満たすバニラが見つかりません")

    const s = base("nolifedamage")
    put(s, "p2", holder.cardId, 1) // 相手の場に制約の発生源
    const attacker = put(s, "p1", cheap.cardId, 1)
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${cheap.name}（コスト${cheap.cost}）でアタック`)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ライフ受けを宣言")
    assert(s.players.p2.life === lifeBefore, `コスト${String(maxCost)}以下のアタックではライフが減らない（${lifeBefore}→${s.players.p2.life}）`)

    // 対照実験：コストが上回るスピリットならライフは減る
    const s2 = base("nolifedamage-over")
    put(s2, "p2", holder.cardId, 1)
    const bigAttacker = put(s2, "p1", pricey.cardId, 1)
    const life2 = s2.players.p2.life
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: bigAttacker.instanceId }) === null, `${pricey.name}（コスト${pricey.cost}）でアタック`)
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s2, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s2, "p2", { type: "takeLife" }) === null, "ライフ受けを宣言")
    assert(s2.players.p2.life < life2, "対照実験：コストが上回ればライフは減る")
}

console.log("=== BS07 青：コスト3以下をブロックしたとき疲労しない（シルバー・ゴレム） ===")
{
    const blockerCard = findByEffect(
        (e) =>
            e["kind"] === "constraint" &&
            (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noRestWhenBlockingCost",
    )
    const cheapAttacker = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= 3 && (c.levels?.[0]?.cores ?? 99) === 1,
    )
    const bigAttacker = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 0) >= 4 && (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!cheapAttacker || !bigAttacker) throw new Error("コスト条件のアタッカーが見つかりません")

    for (const [atk, expectRested, label] of [
        [cheapAttacker, false, "コスト3以下をブロックしても疲労しない"],
        [bigAttacker, true, "対照実験：コスト4以上をブロックすれば疲労する"],
    ] as [CardRow, boolean, string][]) {
        const s = base(`norest-${atk.cardId}`)
        const attacker = put(s, "p2", atk.cardId, 1)
        const blocker = put(s, "p1", blockerCard.cardId, 1)
        // p2 のターンにする（p1がブロック側）
        s.turnPlayer = "p2"
        assert(act(s, "p2", { type: "nextPhase" }) === null, `${label}：アタックステップへ`)
        assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, `${label}：アタック`)
        assert(act(s, "p1", { type: "pass" }) === null, `${label}：防御側パス`)
        assert(act(s, "p2", { type: "pass" }) === null, `${label}：攻撃側パス`)
        assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, `${label}：ブロック`)
        assert(act(s, "p1", { type: "pass" }) === null, `${label}：パス`)
        assert(act(s, "p2", { type: "pass" }) === null, `${label}：パス→バトル解決`)
        const after = s.players.p1.field.spirits.find((x) => x.instanceId === blocker.instanceId)
        assert(after === undefined || after.isRested === expectRested, label)
    }
}

console.log("=== BS07 青：疲労状態のネクサス1つにつきBP+2000（ネクサスアタック） ===")
{
    const magic = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["counter"] === "ownRestedNexuses",
    )
    const amountPer = Number(
        ((magic.effects ?? []).find(
            (e) => (e["action"] as Record<string, unknown> | undefined)?.["counter"] === "ownRestedNexuses",
        )?.["action"] as Record<string, unknown>)["amountPer"],
    )
    const kyoshuHolder = findByEffect(
        (e) => e["kind"] === "keyword" && e["keyword"] === "kyoshu" && Array.isArray(e["levels"]) && (e["levels"] as number[]).includes(1),
    )
    const s = base("nexusattack")
    const attacker = put(s, "p1", kyoshuHolder.cardId, 1)
    const n1 = putNexus(s, "p1", byId("BS07-065").cardId, 0)
    const n2 = putNexus(s, "p1", byId("BS07-066").cardId, 0)
    n1.isRested = true
    n2.isRested = true
    put(s, "p2", FILLER.cardId, 1)
    refreshLevelAsOverrides(s)
    const before = effectiveBp(s, "p1", attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    s.players.p1.hand = [magic.cardId]
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId }) === null,
        `${magic.name}をフラッシュで使用`,
    )
    // 【強襲】がネクサス1つを疲労させた直後なので、疲労ネクサスは2つのまま（すでに両方疲労）
    const restedCount = s.players.p1.field.nexuses.filter((n) => n.isRested).length
    assert(
        effectiveBp(s, "p1", attacker) === before + amountPer * restedCount,
        `疲労ネクサス${restedCount}つ×${amountPer}のBP増加（${before}→${effectiveBp(s, "p1", attacker)}）`,
    )
}

console.log("=== BS07 青：コスト4以下を破壊し、そのコスト分だけデッキを破棄する（巨人大帝アレクサンダー） ===")
{
    const alexander = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyThenMillByCost",
    )
    const levels = ((alexander.effects ?? []).find(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyThenMillByCost",
    )?.["levels"] ?? [1]) as number[]
    const lv = Math.min(...levels)
    const victim = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 0) >= 2 && (c.cost ?? 99) <= 4 && (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!victim) throw new Error("コスト2〜4のバニラが見つかりません")

    const s = base("alexander")
    const attacker = put(s, "p1", alexander.cardId, alexander.levels?.[lv - 1]?.cores ?? 1)
    const target = put(s, "p2", victim.cardId, 1)
    putNexus(s, "p1", byId("BS07-065").cardId, 0) // 【強襲】がネクサスを探すので置いておく
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${alexander.name}がアタック`)
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId),
        `コスト${victim.cost}の${victim.name}が破壊される`,
    )
    const milled = deckBefore - s.players.p2.deck.length
    assert(milled === victim.cost, `破壊したスピリットのコストと同じ${String(victim.cost)}枚が破棄される（実際${milled}枚）`)
}

console.log("=== BS07 青：回復するたびデッキを破棄する（onRefreshed／神凰兵フェニックス・ゴレム） ===")
{
    const phoenix = findByEffect((e) => e["kind"] === "triggered" && e["trigger"] === "onRefreshed")
    const entry = (phoenix.effects ?? []).find((e) => e["trigger"] === "onRefreshed")
    const lv = Math.min(...((entry?.["levels"] as number[] | null) ?? [1]))
    const millCount = Number((entry?.["action"] as Record<string, unknown>)["count"])
    const s = base("onrefreshed")
    const spirit = put(s, "p1", phoenix.cardId, phoenix.levels?.[lv - 1]?.cores ?? 1)
    spirit.isRested = true
    const before = s.players.p2.deck.length
    // 効果による回復（refreshSpirit 経由）でトリガーが発火する
    putNexus(s, "p1", byId("BS07-065").cardId, 0)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    // 疲労状態なのでアタックはできない。【強襲】Lv3ではないため、回復はリフレッシュステップで起こす
    assert(act(s, "p1", { type: "endTurn" }) === null, "ターンを終える")
    assert(act(s, "p2", { type: "endTurn" }) === null, "相手もターンを終える（自分のリフレッシュステップへ）")
    const milled = before - s.players.p2.deck.length
    assert(milled >= millCount, `回復時に${millCount}枚以上デッキが破棄される（実際${milled}枚）`)
}

console.log("=== BS07 青：【強襲】をブロック時にも発揮させる（kyoshuOnBlock／蹴撃の戦場跡Lv2） ===")
{
    const nexus = findByEffect((e) => e["kind"] === "kyoshuOnBlock")
    const nexusLv = Math.min(...(((nexus.effects ?? []).find((e) => e["kind"] === "kyoshuOnBlock")?.["levels"] as number[] | null) ?? [1]))
    const kyoshuHolder = findByEffect(
        (e) => e["kind"] === "keyword" && e["keyword"] === "kyoshu" && Array.isArray(e["levels"]) && (e["levels"] as number[]).includes(1),
    )
    const s = base("kyoshu-on-block")
    // p2 のターン。p1 がブロックする側。ブロッカーはバトルで疲労し、そのあと【強襲】で回復する
    const attacker = put(s, "p2", FILLER.cardId, 1)
    const blocker = put(s, "p1", kyoshuHolder.cardId, 1)
    putNexus(s, "p1", nexus.cardId, nexus.levels?.[nexusLv - 1]?.cores ?? 0)
    putNexus(s, "p1", byId("BS07-065").cardId, 0) // 疲労させる先のネクサス
    s.turnPlayer = "p2"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, "ブロック宣言")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    // バトル解決でブロッカーは疲労するが、kyoshuOnBlock により【強襲】が発揮して回復している
    const after = s.players.p1.field.spirits.find((x) => x.instanceId === blocker.instanceId)
    assert(after?.isRested === false, "ブロックで疲労したブロッカーが【強襲】で回復している")
    assert(
        s.players.p1.field.nexuses.filter((n) => n.isRested).length === 1,
        "ブロック時にも【強襲】が発揮してネクサス1つが疲労する",
    )
}

console.log("=== BS07 青：自分のスピリットを破壊し、そのコスト分の予算で相手を破壊（アームズインパクト） ===")
{
    const magic = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["thenDestroyEnemyByCostBudget"] === true,
    )
    const maxCost = Number(
        ((magic.effects ?? []).find(
            (e) => (e["action"] as Record<string, unknown> | undefined)?.["thenDestroyEnemyByCostBudget"] === true,
        )?.["action"] as Record<string, unknown>)["maxCost"],
    )
    const sacrifice = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) === maxCost && (c.levels?.[0]?.cores ?? 99) === 1,
    )
    const prey = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= maxCost && (c.cost ?? 0) >= 1 && (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!sacrifice || !prey) throw new Error("コスト条件のバニラが見つかりません")
    const s = base("arms-impact")
    const attacker = put(s, "p2", FILLER.cardId, 1)
    const blocker = put(s, "p1", FILLER.cardId, 1)
    const own = put(s, "p1", sacrifice.cardId, 1)
    const enemy = put(s, "p2", prey.cardId, 1)
    s.turnPlayer = "p2"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p1", { type: "block", instanceId: blocker.instanceId }) === null, "p1がブロック")
    s.players.p1.hand = [magic.cardId]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${magic.name}をフラッシュで使用`)
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === own.instanceId),
        `自分の${sacrifice.name}（コスト${sacrifice.cost}）が破壊される`,
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === enemy.instanceId),
        `その予算で相手の${prey.name}（コスト${prey.cost}）が破壊される`,
    )
}

console.log("=== BS07 青：系統「勇傑」でアタックしているときだけ相手のフラッシュを封じる（ウィリアンスラッシュ） ===")
{
    const magic = findByEffect((e) => e["kind"] === "flashLockWhileAttackingFamily")
    const family = String(
        (magic.effects ?? []).find((e) => e["kind"] === "flashLockWhileAttackingFamily")?.["familyFilter"],
    )
    const yuketsu = CARDS.find(
        (c) => c.type === "spirit" && (c.cardId.startsWith("BS07") && (c as unknown as { family?: string[] }).family?.includes(family) === true),
    )
    if (!yuketsu) throw new Error(`系統「${family}」のスピリットが見つかりません`)
    // 系統一致：ロックがかかる
    {
        const s = base("lockflash-hit")
        const attacker = put(s, "p1", yuketsu.cardId, 1)
        putNexus(s, "p1", byId("BS07-065").cardId, 0)
        put(s, "p2", FILLER.cardId, 1)
        // メイン側は「このターンの間」の継続効果なので、メインステップで使ってからアタックする
        s.players.p1.hand = [magic.cardId]
        assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${magic.name}をメインで使用`)
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${yuketsu.name}でアタック`)
        // 相手はフラッシュで手札のカードを使えない
        s.players.p2.hand = [byId("BS07-082").cardId]
        assert(
            act(s, "p2", { type: "castMagic", handIndex: 0 }) !== null,
            `系統「${family}」でアタック中なら相手のフラッシュを封じる`,
        )
    }
    // 系統不一致：ロックはかからない（対照実験）
    {
        const s = base("lockflash-miss")
        const attacker = put(s, "p1", FILLER.cardId, 1)
        put(s, "p2", FILLER.cardId, 1)
        s.players.p1.hand = [magic.cardId]
        assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "同じマジックをメインで使用")
        assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
        assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "系統を持たないスピリットでアタック")
        s.players.p2.hand = [byId("BS07-082").cardId]
        assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "対照実験：系統が一致しなければ封じない")
    }
}

console.log("=== BS07 青：系統「造兵」のコスト3以上をBP+2000（造兵工房Lv2のコスト下限） ===")
{
    const nexus = findByEffect(
        (e) => (e["aura"] as Record<string, unknown> | undefined)?.["costMinFilter"] !== undefined,
    )
    const auraEntry = (nexus.effects ?? []).find(
        (e) => (e["aura"] as Record<string, unknown> | undefined)?.["costMinFilter"] !== undefined,
    )
    const aura = auraEntry?.["aura"] as Record<string, unknown>
    const family = String(aura["familyFilter"])
    const costMin = Number(aura["costMinFilter"])
    const amount = Number(aura["amount"])
    const nexusLv = Math.min(...((auraEntry?.["levels"] as number[] | null) ?? [1]))
    const big = CARDS.find(
        (c) => c.cardId.startsWith("BS07") && c.type === "spirit" && (c as unknown as { family?: string[] }).family?.includes(family) === true && (c.cost ?? 0) >= costMin,
    )
    const small = CARDS.find(
        (c) => c.type === "spirit" && (c as unknown as { family?: string[] }).family?.includes(family) === true && (c.cost ?? 99) < costMin,
    )
    if (!big) throw new Error(`系統「${family}」でコスト${costMin}以上が見つかりません`)
    const s = base("kouhei-aura")
    putNexus(s, "p1", nexus.cardId, nexus.levels?.[nexusLv - 1]?.cores ?? 0)
    const target = put(s, "p1", big.cardId, 1)
    const under = small ? put(s, "p1", small.cardId, 1) : undefined
    const baseBp = target.tempBpBuff
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ（オーラの発揮条件）")
    refreshLevelAsOverrides(s)
    const boosted = effectiveBp(s, "p1", target)
    const raw = (big.levels?.[0]?.bp ?? 0) + baseBp
    assert(boosted === raw + amount, `コスト${big.cost}の${big.name}はBP+${amount}（${raw}→${boosted}）`)
    if (under) {
        const underRaw = small?.levels?.[0]?.bp ?? 0
        assert(
            effectiveBp(s, "p1", under) === underRaw,
            `対照実験：コスト${small?.cost}の${small?.name}にはかからない`,
        )
    }
}
