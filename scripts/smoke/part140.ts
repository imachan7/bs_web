// smoke パート140（第七弾 緑バッチ：新要素の発揮確認）
//
// 緑15枚が持ち込んだ新要素を**実カードデータ経由**で確かめる:
//   triggered.condition の battleLoserMaxCost ／ exhaustAllByColor の side ／
//   refreshAllByKeyword の keywordCount ／ voidCoreToTarget の familyFilter ／
//   TargetFilter の keywordExclude ／ returnToHand の costReserveToTrash ／
//   bofuOnBlock（【暴風】をブロック時に発揮）／ bofuChooserSelf（【暴風】の対象を自分で選ぶ）
//
// カードIDは直書きせず、**カードデータから条件で引いて**使う（IDズレ事故の予防）。
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    destroyNexus,
    effectiveBp,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
    symbol?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function findByEffect(pred: (e: Record<string, unknown>, c: CardRow) => boolean): CardRow {
    const found = CARDS.find((c) => (c.effects ?? []).some((e) => pred(e, c)))
    if (!found) throw new Error("条件に合うカードが見つかりません")
    return found
}
function entryOf(c: CardRow, pred: (e: Record<string, unknown>) => boolean): Record<string, unknown> {
    const found = (c.effects ?? []).find(pred)
    if (!found) throw new Error(`${c.name} に該当エントリがありません`)
    return found
}
function coresFor(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.cores ?? 1
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
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

// ブロック宣言後に開くフラッシュを閉じ、バトルを解決まで進める
// （onBattleWin や、ブロッカー疲労後に走る bofuOnBlock はここまで進めないと発火しない）
function resolveBattle(s: GameState): void {
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
}

const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)!

console.log("=== BS07 緑：コスト条件を満たす相手だけを破壊したとき回復する（天刃の勇者ヴォルザ） ===")
{
    const volza = findByEffect(
        (e) => (e["condition"] as Record<string, unknown> | undefined)?.["battleLoserMaxCost"] !== undefined,
    )
    const entry = entryOf(volza, (e) => (e["condition"] as Record<string, unknown> | undefined)?.["battleLoserMaxCost"] !== undefined)
    const maxCost = Number((entry["condition"] as Record<string, unknown>)["battleLoserMaxCost"])
    const level = (entry["levels"] as number[])[0]!
    const cores = coresFor(volza, level)
    const volzaBp = volza.levels?.[level - 1]?.bp ?? 0
    // ヴォルザに一方的に倒される（BPが下）ブロッカーを、コスト条件の内/外でそれぞれ用意する
    const weakBlocker = (maxOk: boolean): CardRow | undefined =>
        CARDS.find(
            (c) =>
                c.type === "spirit" &&
                (c.effects ?? []).length === 0 &&
                (c.levels?.[0]?.cores ?? 99) === 1 &&
                (c.levels?.[0]?.bp ?? 99999) < volzaBp &&
                (maxOk ? (c.cost ?? 99) <= maxCost : (c.cost ?? 0) > maxCost),
        )
    const inRange = weakBlocker(true)
    const outRange = weakBlocker(false)
    if (!inRange || !outRange) throw new Error("コスト条件の内/外のブロッカーが見つかりません")

    const s = base("volza-in")
    const attacker = put(s, "p1", volza.cardId, cores)
    const blocker = put(s, "p2", inRange.cardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    resolveBattle(s)
    assert(!attacker.isRested, `コスト${maxCost}以下（${inRange.name}）だけを破壊したので回復する`)

    const s2 = base("volza-out")
    const attacker2 = put(s2, "p1", volza.cardId, cores)
    const blocker2 = put(s2, "p2", outRange.cardId, 1)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック")
    assert(declareBlock(s2, "p2", blocker2.instanceId) === null, "ブロック宣言")
    resolveBattle(s2)
    assert(
        attacker2.isRested,
        `対照実験：コストが上回る${outRange.name}（コスト${outRange.cost}）を破壊しても回復しない`,
    )
}

console.log("=== BS07 緑：ネクサス破壊で、選んだ色の「相手だけ」を疲労させる（大風車の丘） ===")
{
    const windmill = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "exhaustAllByColor" && (e["action"] as Record<string, unknown>)["side"] === "opponent",
    )
    // 相手フィールドで最多になる色のバニラと、自分側にも同じ色のスピリットを置く
    const carrier = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.cores ?? 99) === 1 &&
            (c.colors ?? []).length === 1,
    )!
    const color = (carrier.colors ?? [])[0]!

    const s = base("windmill")
    putNexus(s, "p1", windmill.cardId, 0)
    const victimNexus = putNexus(s, "p1", CARDS.find((c) => c.type === "nexus" && c.cardId !== windmill.cardId)!.cardId, 0)
    const enemyA = put(s, "p2", carrier.cardId, 1)
    const enemyB = put(s, "p2", carrier.cardId, 1)
    const mine = put(s, "p1", carrier.cardId, 1)
    destroyNexus(s, "p1", victimNexus.instanceId)
    assert(enemyA.isRested && enemyB.isRested, `色「${color}」の相手スピリットがすべて疲労する`)
    assert(!mine.isRested, "対照実験：同じ色でも自分のスピリットは疲労しない（side:opponent）")
}

console.log("=== BS07 緑：【暴風：1】を持つ自分のスピリットだけを回復させる（突風侯爵コカトリーフ） ===")
{
    const cocka = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["keywordCount"] !== undefined,
    )
    const action = entryOf(cocka, (e) => (e["action"] as Record<string, unknown> | undefined)?.["keywordCount"] !== undefined)[
        "action"
    ] as Record<string, unknown>
    const wantCount = Number(action["keywordCount"])
    const keyword = String(action["keyword"])
    const bofuWith = (n: number): CardRow | undefined =>
        CARDS.find(
            (c) =>
                c.type === "spirit" &&
                (c.effects ?? []).some(
                    (e) => e["kind"] === "keyword" && e["keyword"] === keyword && Number(e["count"]) === n,
                ),
        )
    const match = bofuWith(wantCount)
    const other = bofuWith(wantCount + 1)
    if (!match || !other) throw new Error("【暴風】の指定数違いのスピリットが見つかりません")

    const s = base("bofu-refresh-count")
    const src = put(s, "p1", cocka.cardId, 1)
    const a = put(s, "p1", match.cardId, 1)
    const b = put(s, "p1", other.cardId, 1)
    a.isRested = true
    b.isRested = true
    resolveAction(s, "p1", src, {
        type: "refreshAllByKeyword",
        keyword: keyword as never,
        side: "own",
        keywordCount: wantCount,
    })
    assert(!a.isRested, `【${keyword}：${wantCount}】の${match.name}が回復する`)
    assert(b.isRested, `対照実験：【${keyword}：${wantCount + 1}】の${other.name}は回復しない`)
}

console.log("=== BS07 緑：ボイドからのコアを系統条件を満たす自分のスピリットにだけ置く（デルファングス） ===")
{
    const delphangs = findByEffect(
        (e) =>
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "voidCoreToTarget" &&
            (e["action"] as Record<string, unknown>)["familyFilter"] !== undefined,
    )
    const action = entryOf(delphangs, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "voidCoreToTarget")[
        "action"
    ] as Record<string, unknown>
    const families = action["familyFilter"] as string[]
    // 系統に該当しないがBPが高いスピリットを置いて、自動選択が系統で絞られることを見る
    const outsider = CARDS.filter(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && !families.some((f) => (c.family ?? []).includes(f)),
    ).sort((a, b) => (b.levels?.[0]?.bp ?? 0) - (a.levels?.[0]?.bp ?? 0))[0]!

    const s = base("void-core-family")
    const src = put(s, "p1", delphangs.cardId, 1)
    const strong = put(s, "p1", outsider.cardId, 1)
    const coresBefore = src.cores
    const strongBefore = strong.cores
    resolveAction(s, "p1", src, { type: "voidCoreToTarget", count: 1, familyFilter: families })
    assert(
        src.cores === coresBefore + 1,
        `系統「${families.join("/")}」を持つ${delphangs.name}にコアが置かれる（${coresBefore}→${src.cores}）`,
    )
    assert(strong.cores === strongBefore, `対照実験：系統が違う${outsider.name}には置かれない`)
}

console.log("=== BS07 緑：【転召】を持たない相手だけを手札に戻す（剣王獣ビャク・ガロウ） ===")
{
    // keywordExclude と costReserveToTrash を両方持つエントリ（＝ビャク・ガロウ）に絞る
    // （keywordExclude だけなら BS07鋼翼魚オルカノンも該当してしまう）
    const hasBoth = (e: Record<string, unknown>): boolean => {
        const a = e["action"] as Record<string, unknown> | undefined
        if (a === undefined || a["costReserveToTrash"] === undefined) return false
        return (a["filter"] as Record<string, unknown> | undefined)?.["keywordExclude"] !== undefined
    }
    const byakko = findByEffect((e) => hasBoth(e))
    const action = entryOf(byakko, hasBoth)["action"] as Record<string, unknown>
    const excluded = String((action["filter"] as Record<string, unknown>)["keywordExclude"])
    const cost = Number(action["costReserveToTrash"])
    const withKw = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === excluded),
    )!
    const withoutKw = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    const s = base("byakko-return")
    const src = put(s, "p1", byakko.cardId, 1)
    const plain = put(s, "p2", withoutKw.cardId, 1)
    const immune = put(s, "p2", withKw.cardId, coresFor(withKw, 1))
    const reserveBefore = s.players.p1.reserve
    const trashBefore = s.players.p1.trashCores
    resolveAction(s, "p1", src, {
        type: "returnToHand",
        count: 2,
        costReserveToTrash: cost,
        filter: { keywordExclude: excluded as never },
    })
    const alive = s.players.p2.field.spirits.map((sp) => sp.instanceId)
    assert(!alive.includes(plain.instanceId), `【${excluded}】を持たない${withoutKw.name}は手札に戻る`)
    assert(alive.includes(immune.instanceId), `対照実験：【${excluded}】を持つ${withKw.name}は戻らない`)
    assert(
        s.players.p1.reserve === reserveBefore - cost && s.players.p1.trashCores === trashBefore + cost,
        `コストとしてリザーブのコア${cost}個がトラッシュへ移る`,
    )

    // 対照実験：リザーブが足りなければ不発
    const s2 = base("byakko-no-reserve")
    const src2 = put(s2, "p1", byakko.cardId, 1)
    const plain2 = put(s2, "p2", withoutKw.cardId, 1)
    s2.players.p1.reserve = 0
    resolveAction(s2, "p1", src2, {
        type: "returnToHand",
        count: 2,
        costReserveToTrash: cost,
        filter: { keywordExclude: excluded as never },
    })
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === plain2.instanceId),
        "対照実験：リザーブが足りなければ不発",
    )
}

console.log("=== BS07 緑：【暴風】をブロック時に発揮させる（大風車の丘Lv2） ===")
{
    const windmill = findByEffect((e) => e["kind"] === "bofuOnBlock")
    const grant = entryOf(windmill, (e) => e["kind"] === "bofuOnBlock")
    const nexusCores = windmill.levels?.[(grant["levels"] as number[])[0]! - 1]?.cores ?? 2
    // 【暴風】持ちをブロッカーにする。アタッカー側には疲労させられる余剰スピリットを置く
    const bofuSpirit = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "bofu") &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!

    // p2 のターン（＝ネクサスの持ち主 p1 から見て『相手のアタックステップ』）でブロックする
    const s = base("bofu-on-block")
    putNexus(s, "p1", windmill.cardId, nexusCores)
    const blocker = put(s, "p1", bofuSpirit.cardId, 1)
    const attacker = put(s, "p2", FILLER.cardId, 1)
    const spare = put(s, "p2", FILLER.cardId, 1)
    s.turnPlayer = "p2"
    s.phase = "main"
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "【暴風】持ちでブロック")
    resolveBattle(s)
    assert(spare.isRested, "ブロック時に【暴風】が発揮し、アタッカー側の別スピリットが疲労する")

    // 対照実験：ネクサスが無ければブロック時には発揮しない
    const s2 = base("bofu-on-block-off")
    const blocker2 = put(s2, "p1", bofuSpirit.cardId, 1)
    const attacker2 = put(s2, "p2", FILLER.cardId, 1)
    const spare2 = put(s2, "p2", FILLER.cardId, 1)
    s2.turnPlayer = "p2"
    s2.phase = "main"
    assert(act(s2, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s2, "p1", blocker2.instanceId) === null, "ブロック")
    resolveBattle(s2)
    assert(!spare2.isRested, "対照実験：ネクサスが無ければブロック時には発揮しない")
}

console.log("=== BS07 緑：【暴風】の疲労対象を自分で指定する（ワールウィンド） ===")
{
    const whirl = findByEffect((e) => e["kind"] === "bofuChooserSelf")
    const bofuSpirit = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "bofu") &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )!
    // 非対話モードでは chooserIsTarget の有無で自動選択の経路が変わる。
    // ここでは「使用しても【暴風】自体は働く（疲労が起きる）」ことと、貸与が立つことを確かめる
    const s = base("whirlwind")
    const attacker = put(s, "p1", bofuSpirit.cardId, 1)
    const blocker = put(s, "p2", FILLER.cardId, 1)
    const spare = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand.push(whirl.cardId)
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        `${whirl.name}をメインで使用`,
    )
    assert(s.players.p1.turnVirtualInstances.length > 0, "マジックが仮想発生源を貸している")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【暴風】持ちでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    assert(spare.isRested, "【暴風】で相手のスピリットが疲労する（対象の選び手が変わっても発揮する）")
}
