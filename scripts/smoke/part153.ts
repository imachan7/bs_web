// smoke パート153（【暴風】で疲労させた個体を覚える：BS06颶風高原Lv2／BS06ミストラルコア）
//
// 「【暴風】で疲労させた相手を覚える仕組みが無い」として一部未実装だった2枚。
// 疲労の唯一の入口 exhaustSpirit に【暴風】の持ち主を渡す形にして、そこから
//   GameState.bofuExhaustedThisBattle への記録（颶風高原Lv2が参照）と
//   FieldEvent "ownBofuExhausted" の発火（ミストラルコアが1体につき1回受け取る）
// を行う。記録はバトル単位で、clearBattle が捨てる。
import { act, assert, createGame, createInstance, declareBlock, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    colors?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
// ブロック宣言後に開くフラッシュを閉じ、バトルを解決まで進める
function resolveBattle(s: GameState): void {
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
}
const ON_FIELD = (s: GameState, pid: PlayerId, id: string): boolean =>
    s.players[pid].field.spirits.some((x) => x.instanceId === id)

// 【暴風】持ち（onBlocked で相手を疲労させる）。BPが高くバトルに勝てる個体を選ぶ
const BOFU = CARDS.find(
    (c) =>
        (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "bofu") &&
        (c.effects ?? []).some((e) => e["trigger"] === "onBlocked") &&
        (c.levels?.[0]?.bp ?? 0) >= 5000,
)!
const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.bp ?? 99999) <= 3000,
)!

console.log("=== 【暴風】で疲労させた相手を、バトル単位で記録する ===")
{
    const s = base("bofu-record")
    const attacker = put(s, "p1", BOFU.cardId, BOFU.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    const bystander = put(s, "p2", FILLER.cardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【暴風】持ちがアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")

    assert(s.bofuExhaustedThisBattle.length > 0, "【暴風】で疲労させた相手が記録される")
    assert(
        s.bofuExhaustedThisBattle.every((r) => r.pid === "p2"),
        "記録されるのは相手側のスピリットだけ",
    )
    assert(bystander.isRested || blocker.isRested, "実際に相手のスピリットが疲労している")

    resolveBattle(s)
    assert(s.bofuExhaustedThisBattle.length === 0, "バトルが終わると記録は捨てられる（バトル単位）")
}

console.log("=== BS06颶風高原Lv2：BP比較で勝ったとき、【暴風】で疲労した相手をデッキの下に戻す ===")
{
    const highland = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnBofuExhaustedToDeckBottom",
    )
    const entry = (highland.effects ?? []).find(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnBofuExhaustedToDeckBottom",
    )!
    const level = (entry["levels"] as number[])[0]!

    const s = base("highland-return")
    putNexus(s, "p1", highland.cardId, highland.levels?.[level - 1]?.cores ?? 3)
    const attacker = put(s, "p1", BOFU.cardId, BOFU.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    const bystander = put(s, "p2", FILLER.cardId, 1)
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【暴風】持ちがアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    const exhaustedIds = s.bofuExhaustedThisBattle.map((r) => r.instanceId)
    assert(exhaustedIds.length > 0, "【暴風】で疲労した個体がいる")
    resolveBattle(s)

    // BP比較でブロッカーだけが破壊され（BOFUのBPが高い）、そのうえで暴風疲労組がデッキの下へ
    const stillThere = exhaustedIds.filter((id) => ON_FIELD(s, "p2", id))
    assert(stillThere.length === 0, "【暴風】で疲労した相手は場から居なくなる")
    assert(s.players.p2.deck.length > deckBefore, `デッキの下に戻る（${deckBefore}→${s.players.p2.deck.length}）`)
    assert(bystander !== undefined, "盤面の準備")
}

console.log("--- 発生源がLv1なら戻さない（levels 指定が効いている） ---")
{
    const highland = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnBofuExhaustedToDeckBottom",
    )
    const s = base("highland-level1")
    putNexus(s, "p1", highland.cardId, 0) // Lv1
    const attacker = put(s, "p1", BOFU.cardId, BOFU.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    put(s, "p2", FILLER.cardId, 1)
    const deckBefore = s.players.p2.deck.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    resolveBattle(s)
    assert(s.players.p2.deck.length === deckBefore, "Lv1ではデッキに戻らない")
}

console.log("=== BS06ミストラルコア：【暴風】で疲労させるたび、ボイドからコアを自分のスピリットに置く ===")
{
    const mistral = findByEffect((e) => e["event"] === "ownBofuExhausted")
    const s = base("mistral-core")
    const attacker = put(s, "p1", BOFU.cardId, BOFU.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    put(s, "p2", FILLER.cardId, 1)
    // メインで貸与しておく
    resolveAction(
        s,
        "p1",
        null,
        { type: "lendSelfThisTurn" },
        undefined,
        (mistral.colors ?? ["green"]) as never,
        "magic",
        undefined,
        undefined,
        mistral.cardId,
    )
    refreshLevelAsOverrides(s)
    const coresBefore = attacker.cores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【暴風】持ちがアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    const exhausted = s.bofuExhaustedThisBattle.length
    assert(exhausted > 0, "【暴風】で疲労させている")
    assert(
        attacker.cores === coresBefore + exhausted,
        `疲労させた${exhausted}体につき1個ずつコアが置かれる（${coresBefore}→${attacker.cores}）`,
    )
}

console.log("--- 貸与がなければコアは置かれない ---")
{
    const s = base("mistral-absent")
    const attacker = put(s, "p1", BOFU.cardId, BOFU.levels?.[0]?.cores ?? 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    put(s, "p2", FILLER.cardId, 1)
    const coresBefore = attacker.cores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    assert(attacker.cores === coresBefore, "貸与がなければコアは置かれない")
}

console.log("--- 装甲を持つ相手は、デッキの下に戻されない ---")
{
    // 対象を GameState の記録から引く形なので、他のハンドラのように候補選びの中で
    // 耐性を弾く経路が無い。範囲効果として明示的に判定していることを確かめる。
    // 【装甲】は【暴風】の疲労自体も防ぐため、自然な流れでは記録に載らない
    // （＝バトル中に装甲を付与された等でだけ起きる）。ここは記録を直接組んで判定だけを見る
    const highland = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "returnBofuExhaustedToDeckBottom",
    )
    const sourceColor = (highland.colors ?? [])[0]!
    const armored = CARDS.find((c) =>
        (c.effects ?? []).some(
            (e) =>
                e["kind"] === "keyword" &&
                e["keyword"] === "armor" &&
                ((e["colors"] as string[] | undefined) ?? []).includes(sourceColor) &&
                (((e["levels"] as number[] | null) ?? [1])[0] === 1),
        ),
    )!

    const s = base("highland-armor")
    const guarded = put(s, "p2", armored.cardId, armored.levels?.[0]?.cores ?? 1)
    const plain = put(s, "p2", FILLER.cardId, 1)
    s.bofuExhaustedThisBattle = [
        { pid: "p2", instanceId: guarded.instanceId },
        { pid: "p2", instanceId: plain.instanceId },
    ]
    resolveAction(
        s,
        "p1",
        null,
        { type: "returnBofuExhaustedToDeckBottom" },
        undefined,
        [sourceColor] as never,
        "nexus",
    )
    assert(
        ON_FIELD(s, "p2", guarded.instanceId),
        `【装甲：${sourceColor}】を持つ${armored.name}はデッキの下に戻されない`,
    )
    assert(!ON_FIELD(s, "p2", plain.instanceId), "装甲を持たないスピリットは戻される")
}
