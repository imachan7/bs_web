// smoke パート155（BS03ゴーレムクラフト：ネクサスをこのターンだけスピリットとして扱う）
//
// 「ネクサスがアタック・ブロック・バトルに参加する仕組み」は作っていない。
// field.nexuses から field.spirits へ**同じインスタンスのまま**移し、
// CardInstance.asSpiritThisTurn に cost/family/levels の上書きを載せる方式にした。
// スピリットの器（アタック・BP比較・体数カウント・対象選択）は field.spirits に入るだけで手に入るので、
// ここで確かめるのは「カードの静的な値では出せないぶん」だけ:
//   ① 移動と対象（コアが1個以上置かれたネクサスのみ）
//   ② 上書き（Lv1/BP2000・維持コア1・コスト1・系統「造兵」）
//   ③ ネクサスとしての効果を失う（effectSources に出てこない）
//   ④ コア0で消滅し、ネクサスのカードがトラッシュへ行く
//   ⑤ ターン終了で生き残りだけがネクサスへ戻る
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    effectSources,
    endTurn,
    getCard,
    instHasCost,
    instMinLevelCores,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasFamily,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

// 対象のマジックと、そのメイン側エントリの action をカードデータから取る
// （ここを固定値で書くとデータ変更に気づけない）
const GOLEM = CARDS.find((c) => c.name === "ゴーレムクラフト")!
// メイン側のエントリが存在することだけ確認しておく（実際の発動は castMagic 経由）
if (!(GOLEM.effects ?? []).some((e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "treatOwnNexusesAsSpiritsThisTurn")) {
    throw new Error("ゴーレムクラフトのメイン効果エントリが見つかりません")
}

// 効果を持つネクサス2枚（③で「効果を失う」ことを見るため、効果なしのネクサスでは意味がない）
const NEXUSES = CARDS.filter((c) => c.type === "nexus" && (c.effects ?? []).length > 0)
const NEXUS_A = NEXUSES[0]!
const NEXUS_B = NEXUSES[1]!

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// **マジックとして実際に使う**。resolveAction に action を直接渡すと、カードデータ側
// （kind:"magic" / timing:"main" / コスト・軽減）が一度も検証されないまま通ってしまう
// （coverage:effects の「テストが手で組んだ action でしか実行されていない」に出る）
function craft(s: GameState): void {
    s.players.p1.hand = [GOLEM.cardId]
    s.phase = "main"
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.players.p1.reserve = 20
    const err = act(s, "p1", { type: "castMagic", handIndex: 0 })
    assert(err === null, `${GOLEM.name}をマジックとして使用できた（${String(err)}）`)
}

console.log("=== コアが1個以上置かれた自分のネクサスだけがスピリットになる ===")
{
    const s = base("golem-target")
    const withCores = putNexus(s, "p1", NEXUS_A.cardId, 1)
    const rich = putNexus(s, "p1", NEXUS_B.cardId, 3)
    const empty = putNexus(s, "p1", NEXUS_A.cardId, 0)
    const oppNexus = putNexus(s, "p2", NEXUS_A.cardId, 2)

    craft(s)

    const spiritIds = s.players.p1.field.spirits.map((x) => x.instanceId)
    const nexusIds = s.players.p1.field.nexuses.map((x) => x.instanceId)
    assert(spiritIds.includes(withCores.instanceId), "コア1個のネクサスはスピリットになった")
    assert(spiritIds.includes(rich.instanceId), "コア3個のネクサスもスピリットになった")
    assert(nexusIds.includes(empty.instanceId), "コア0個のネクサスはネクサスのまま")
    assert(
        s.players.p2.field.nexuses.some((x) => x.instanceId === oppNexus.instanceId),
        "相手のネクサスは対象外（「自分のフィールド」限定）",
    )
    assert(withCores.cardId === NEXUS_A.cardId, "カードIDは変わらない（別カードへの差し替えではない）")
}

console.log("=== 上書きされるステータス（Lv1/BP2000・維持コア1・コスト1・系統「造兵」） ===")
{
    const s = base("golem-stats")
    const golem = putNexus(s, "p1", NEXUS_B.cardId, 1)
    craft(s)

    assert(currentLevel(golem).level === 1, "Lv1として扱われる")
    assert(currentLevel(golem).bp === 2000, `BPは2000（実際: ${String(currentLevel(golem).bp)}）`)
    assert(effectiveBp(s, "p1", golem) === 2000, "実効BPも2000")
    assert(instMinLevelCores(golem) === 1, "維持コアは1（ネクサス本来のLv1コア0ではない）")
    assert(instHasCost(golem, 1), "コスト1として扱われる")
    assert(
        !instHasCost(golem, NEXUS_B.cost ?? -1) || NEXUS_B.cost === 1,
        `元のネクサスのコスト${String(NEXUS_B.cost)}では扱われない（上書きであって追加ではない）`,
    )
    assert(spiritHasFamily(s, "p1", golem, "造兵"), "系統「造兵」を持つ")
}

console.log("=== ネクサスとしての効果を失う ===")
{
    const s = base("golem-noeffect")
    const golem = putNexus(s, "p1", NEXUS_A.cardId, 2)
    assert(
        effectSources(s, "p1").some((x) => x.instanceId === golem.instanceId),
        "変換前は効果の発生源として数えられている",
    )
    craft(s)
    assert(
        !effectSources(s, "p1").some((x) => x.instanceId === golem.instanceId),
        `スピリット化した${getCard(golem.cardId).name}は効果の発生源から外れる`,
    )
}

console.log("=== コアが0個になるとスピリットとして消滅し、ネクサスのカードがトラッシュへ行く ===")
{
    const s = base("golem-deplete")
    const golem = putNexus(s, "p1", NEXUS_A.cardId, 1)
    craft(s)
    const trashBefore = s.players.p1.trashCards.length
    // 相手（p2）の効果でコアを1個取り除く＝維持コア割れ
    resolveAction(s, "p2", null, { type: "coreRemove", count: 1 } as never, undefined, ["white"] as never, "magic")
    assert(golem.cores === 0, "コアが0個になった")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === golem.instanceId),
        "維持コア割れで場から消えた（ネクサスのLv1コア0のままなら消えない）",
    )
    assert(
        s.players.p1.trashCards.length === trashBefore + 1 &&
            s.players.p1.trashCards[s.players.p1.trashCards.length - 1] === NEXUS_A.cardId,
        "ネクサスのカードがトラッシュへ行った（destroySpirit が cardId をそのまま送る）",
    )
}

console.log("=== ターン終了で生き残りだけがネクサスへ戻る ===")
{
    const s = base("golem-endturn")
    const survivor = putNexus(s, "p1", NEXUS_A.cardId, 2)
    const doomed = putNexus(s, "p1", NEXUS_B.cardId, 1)
    craft(s)
    // doomed だけコアを抜いて消滅させる（維持コア割れ）
    doomed.cores = 0
    resolveAction(
        s,
        "p2",
        null,
        { type: "coreRemove", count: 1 } as never,
        doomed.instanceId,
        ["white"] as never,
        "magic",
    )
    endTurn(s)

    assert(
        s.players.p1.field.nexuses.some((x) => x.instanceId === survivor.instanceId),
        "生き残ったネクサスはネクサスに戻った",
    )
    assert(survivor.asSpiritThisTurn === undefined, "上書き（asSpiritThisTurn）は消えている")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === survivor.instanceId),
        "スピリットの列からは抜けている",
    )
    assert(
        !s.players.p1.field.nexuses.some((x) => x.instanceId === doomed.instanceId),
        "消滅した個体はネクサスとして復活しない",
    )
    assert(currentLevel(survivor).bp === 0, "戻ったあとは本来のネクサス（BP2000ではない）")
}
