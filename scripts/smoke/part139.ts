// smoke パート139（第七弾 赤バッチ：新要素の発揮確認）
//
// 赤15枚が持ち込んだ新要素を**実カードデータ経由**で確かめる:
//   EffectCounter の { enemyCost } ／ destroyByBpBudget ／
//   recoverSpiritFromTrash.thenDestroyIfFamily ／ grantColorThisTurn ／
//   keywordGrant / familyGrant の turn 条件 ／ 貸与された reductionGrant
//
// カードIDは直書きせず、**カードデータから条件で引いて**使う（IDズレ事故の予防）。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    effectiveCost,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    spiritHasFamily,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    symbol?: string[]
    reduction?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

function byId(cardId: string): CardRow {
    const found = CARDS.find((c) => c.cardId === cardId)
    if (!found) throw new Error(`${cardId} が見つかりません`)
    return found
}
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

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
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

const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)
if (!FILLER) throw new Error("バニラが見つかりません")

console.log("=== BS07 赤：相手のコスト3以下の体数ぶんBP+する（バジリザード） ===")
{
    const basi = findByEffect(
        (e) =>
            ((e["action"] as Record<string, unknown> | undefined)?.["counter"] as Record<string, unknown> | undefined)?.[
                "enemyCost"
            ] !== undefined,
    )
    const action = entryOf(basi, (e) => (e["action"] as Record<string, unknown> | undefined)?.["counter"] !== undefined)[
        "action"
    ] as Record<string, unknown>
    const enemyCost = (action["counter"] as Record<string, unknown>)["enemyCost"] as { max: number }
    const amountPer = Number(action["amountPer"])
    const cheap = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.cost ?? 99) <= enemyCost.max,
    )
    const pricey = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.cost ?? 0) > enemyCost.max &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!cheap || !pricey) throw new Error("コスト条件を満たすバニラが見つかりません")

    const s = base("enemy-cost-counter")
    const attacker = put(s, "p1", basi.cardId, 1)
    put(s, "p2", cheap.cardId, 1)
    put(s, "p2", cheap.cardId, 1)
    put(s, "p2", pricey.cardId, 1) // コストが上回るので数えない
    const raw = effectiveBp(s, "p1", attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${basi.name}がアタック`)
    assert(
        effectiveBp(s, "p1", attacker) === raw + amountPer * 2,
        `コスト${enemyCost.max}以下の2体ぶんBP+${amountPer * 2}（${raw}→${effectiveBp(s, "p1", attacker)}）`,
    )
}

console.log("=== BS07 赤：BP合計まで相手を好きなだけ破壊する（エクス・キャリバス） ===")
{
    const excalibur = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyByBpBudget",
    )
    const budget = Number(
        (entryOf(excalibur, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyByBpBudget")[
            "action"
        ] as Record<string, unknown>)["budget"],
    )
    // Lv1コア1のバニラをBPちょうどで引く（効果を持たないので実効BP＝カードのBP）
    const vanillaWithBp = (bp: number): CardRow | undefined =>
        CARDS.find(
            (c) =>
                c.type === "spirit" &&
                (c.effects ?? []).length === 0 &&
                (c.levels?.[0]?.cores ?? 99) === 1 &&
                (c.levels?.[0]?.bp ?? -1) === bp,
        )
    const vanillaBps = [
        ...new Set(
            CARDS.filter(
                (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
            ).map((c) => c.levels?.[0]?.bp ?? 0),
        ),
    ].sort((a, b) => a - b)
    // 予算をちょうど割り切れて3体以上並べられるBP。大きい方から探す
    // （小さいBPを取ると「残り予算では倒せない」対照実験が作れなくなるため。6000なら2000）
    const unitBp = [...vanillaBps].reverse().find((bp) => bp > 0 && budget % bp === 0 && budget / bp >= 3)
    // 予算内に収まる最大のBP（6000なら5000）。1体取ると残りが unitBp 未満になる
    const bigBp = [...vanillaBps].reverse().find((bp) => bp <= budget && unitBp !== undefined && budget - bp < unitBp)
    if (unitBp === undefined || bigBp === undefined) throw new Error("BP予算の検証に使えるBP値が見つかりません")
    const unit = vanillaWithBp(unitBp)!
    const big = vanillaWithBp(bigBp)!
    const times = budget / unitBp

    // 予算ぴったりに収まるぶんはすべて破壊される
    const s = base("bp-budget")
    const victims = Array.from({ length: times }, () => put(s, "p2", unit.cardId, 1))
    const src = put(s, "p1", excalibur.cardId, 1)
    resolveAction(s, "p1", src, { type: "destroyByBpBudget", budget })
    assert(
        s.players.p2.field.spirits.length === 0,
        `BP${unitBp}の${times}体（合計${budget}）がすべて破壊される（残り${s.players.p2.field.spirits.length}体）`,
    )

    // 対照実験：予算を使い切ると残りは破壊されない（貪欲にBP最大から取るので big が先に落ちる）
    const s2 = base("bp-budget-over")
    const bigInst = put(s2, "p2", big.cardId, 1)
    const rest = put(s2, "p2", unit.cardId, 1)
    const src2 = put(s2, "p1", excalibur.cardId, 1)
    resolveAction(s2, "p1", src2, { type: "destroyByBpBudget", budget })
    const alive = s2.players.p2.field.spirits.map((sp) => sp.instanceId)
    assert(!alive.includes(bigInst.instanceId), `BP最大の${big.name}（BP${bigBp}）から破壊される`)
    assert(
        alive.includes(rest.instanceId),
        `対照実験：残り予算${budget - bigBp}ではBP${unitBp}の${unit.name}を破壊できず残る`,
    )
}

console.log("=== BS07 赤：トラッシュ回収したカードが「勇傑」なら続けて相手を破壊する（ドラグロン占術師） ===")
{
    const oracle = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["thenDestroyIfFamily"] !== undefined,
    )
    const spec = (entryOf(oracle, (e) => (e["action"] as Record<string, unknown> | undefined)?.["thenDestroyIfFamily"] !== undefined)[
        "action"
    ] as Record<string, unknown>)["thenDestroyIfFamily"] as { family: string; maxBp: number }
    const yuketsu = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(spec.family))
    const notYuketsu = CARDS.find(
        (c) => c.type === "spirit" && !(c.family ?? []).includes(spec.family) && (c.effects ?? []).length === 0,
    )
    const victim = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.bp ?? 99999) <= spec.maxBp &&
            (c.levels?.[0]?.cores ?? 99) === 1,
    )
    if (!yuketsu || !notYuketsu || !victim) throw new Error("追撃の検証に使えるカードが見つかりません")

    const s = base("recover-then-destroy")
    const src = put(s, "p1", oracle.cardId, 1)
    const enemy = put(s, "p2", victim.cardId, 1)
    s.players.p1.trashCards.push(yuketsu.cardId)
    resolveAction(s, "p1", src, {
        type: "recoverSpiritFromTrash",
        count: 1,
        thenDestroyIfFamily: { family: spec.family, maxBp: spec.maxBp },
    })
    assert(s.players.p1.hand.includes(yuketsu.cardId), `${yuketsu.name}を手札に戻した`)
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === enemy.instanceId),
        `戻したカードが「${spec.family}」なので相手が破壊される`,
    )

    // 対照実験：系統が違えば追撃しない
    const s2 = base("recover-no-destroy")
    const src2 = put(s2, "p1", oracle.cardId, 1)
    const enemy2 = put(s2, "p2", victim.cardId, 1)
    s2.players.p1.trashCards.push(notYuketsu.cardId)
    resolveAction(s2, "p1", src2, {
        type: "recoverSpiritFromTrash",
        count: 1,
        thenDestroyIfFamily: { family: spec.family, maxBp: spec.maxBp },
    })
    assert(s2.players.p1.hand.includes(notYuketsu.cardId), `${notYuketsu.name}を手札に戻した`)
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === enemy2.instanceId),
        `対照実験：「${spec.family}」でなければ破壊されない`,
    )
}

console.log("=== BS07 赤：自分のスピリット1体を青としても扱い、あわせてBP+する（メテオフォール） ===")
{
    const meteor = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantColorThisTurn",
    )
    const color = String(
        (entryOf(meteor, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantColorThisTurn")[
            "action"
        ] as Record<string, unknown>)["color"],
    )
    const buffAmount = Number(
        (entryOf(meteor, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuff")[
            "action"
        ] as Record<string, unknown>)["amount"],
    )
    const s = base("meteor-fall")
    const target = put(s, "p1", FILLER.cardId, 1)
    put(s, "p2", FILLER.cardId, 1)
    const raw = effectiveBp(s, "p1", target)
    s.players.p1.hand.push(meteor.cardId)
    const handIndex = s.players.p1.hand.length - 1
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: target.instanceId }) === null, "アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    assert(
        act(s, "p1", { type: "castMagic", handIndex, targetInstanceId: target.instanceId }) === null,
        `${meteor.name}をフラッシュで使用`,
    )
    assert(target.tempColors.includes(color as never), `対象が「${color}」としても扱われる`)
    assert(
        effectiveBp(s, "p1", target) === raw + buffAmount,
        `同じ1体がBP+${buffAmount}（${raw}→${effectiveBp(s, "p1", target)}）`,
    )
}

console.log("=== BS07 赤：『自分のアタックステップ』限定の継続付与（系統・キーワード） ===")
{
    // familyGrant に turn:"own" を持つカード（重刀竜ブレイガザウラー）
    const grantor = findByEffect((e) => e["kind"] === "familyGrant" && e["turn"] === "own")
    const entry = entryOf(grantor, (e) => e["kind"] === "familyGrant" && e["turn"] === "own")
    const givenFamily = String(entry["family"])
    const needFamily = String(entry["familyFilter"])
    const level = (entry["levels"] as number[])[0]!
    const cores = grantor.levels?.[level - 1]?.cores ?? 2
    const receiver = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(needFamily) && !(c.family ?? []).includes(givenFamily),
    )
    if (!receiver) throw new Error(`系統「${needFamily}」だけを持つスピリットが見つかりません`)

    const s = base("family-grant-turn")
    put(s, "p1", grantor.cardId, cores)
    const target = put(s, "p1", receiver.cardId, 1)
    assert(
        !spiritHasFamily(s, "p1", target, givenFamily),
        `メインステップでは系統「${givenFamily}」が付かない`,
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "自分のアタックステップへ")
    assert(
        spiritHasFamily(s, "p1", target, givenFamily),
        `自分のアタックステップでは系統「${givenFamily}」が付く`,
    )

    // 対照実験：相手のアタックステップでは付かない
    const s2 = base("family-grant-oppturn")
    put(s2, "p1", grantor.cardId, cores)
    const target2 = put(s2, "p1", receiver.cardId, 1)
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    assert(
        !spiritHasFamily(s2, "p1", target2, givenFamily),
        "対照実験：相手のアタックステップでは付かない",
    )
}
{
    // keywordGrant に turn:"own" を持つカード（龍星皇メテオヴルム）
    const grantor = findByEffect((e) => e["kind"] === "keywordGrant" && e["turn"] === "own")
    const entry = entryOf(grantor, (e) => e["kind"] === "keywordGrant" && e["turn"] === "own")
    const keyword = String(entry["keyword"])
    const needFamily = String(entry["familyFilter"])
    const level = (entry["levels"] as number[])[0]!
    const cores = grantor.levels?.[level - 1]?.cores ?? 3
    const receiver = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== grantor.cardId &&
            (c.family ?? []).includes(needFamily) &&
            !(c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === keyword),
    )
    if (!receiver) throw new Error(`系統「${needFamily}」で【${keyword}】非所持のスピリットが見つかりません`)

    const s = base("keyword-grant-turn")
    put(s, "p1", grantor.cardId, cores)
    const target = put(s, "p1", receiver.cardId, 1)
    assert(
        !spiritHasKeyword(s, "p1", target, keyword as never),
        `メインステップでは【${keyword}】が付かない`,
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "自分のアタックステップへ")
    assert(
        spiritHasKeyword(s, "p1", target, keyword as never),
        `自分のアタックステップでは【${keyword}】が付く`,
    )
}

console.log("=== BS07 赤：マジックが貸した軽減シンボル付与が手札のコストに効く（リボーンフレイム） ===")
{
    const reborn = findByEffect((e) => e["kind"] === "reductionGrant" && e["lentOnly"] === true)
    const entry = entryOf(reborn, (e) => e["kind"] === "reductionGrant")
    const family = String(entry["familyFilter"])
    const symbols = entry["symbols"] as string[]
    const color = symbols[0]!
    // 対象：該当系統のスピリットカードのうち、その色の軽減シンボルが最も少ないもの
    // （軽減は「必要数」と「フィールドのシンボル数」の小さい方までしか効かないので、
    //  シンボルを必要数+1だけ並べれば、付与された1つぶんがそのままコスト差になる）
    const redCount = (c: CardRow): number => (c.reduction ?? []).filter((r) => r === color).length
    const target = CARDS.filter((c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.cost ?? 0) >= 3)
        .sort((a, b) => redCount(a) - redCount(b))[0]
    // フィールドに置く「その色のシンボルをちょうど1つ持つバニラ」
    const symbolCarrier = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).length === 0 &&
            (c.levels?.[0]?.cores ?? 99) === 1 &&
            (c.symbol ?? []).length === 1 &&
            (c.symbol ?? []).includes(color),
    )
    if (!target || !symbolCarrier) throw new Error("軽減シンボル付与の検証に使えるカードが見つかりません")
    const carriers = redCount(target) + 1

    const s = base("reborn-flame")
    // 付与後に必要な軽減シンボル数（元の数+1）ぶんだけフィールドに並べる
    for (let i = 0; i < carriers; i++) put(s, "p1", symbolCarrier.cardId, 1)
    const before = effectiveCost(s, "p1", byId(target.cardId) as never)
    s.players.p1.hand.push(reborn.cardId)
    const handIndex = s.players.p1.hand.length - 1
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, `${reborn.name}をメインで使用`)
    assert(
        s.players.p1.turnVirtualInstances.length > 0,
        "マジックが仮想発生源を貸している（lentOnly の付与はここからのみ効く）",
    )
    const after = effectiveCost(s, "p1", byId(target.cardId) as never)
    assert(
        after === before - 1,
        `軽減シンボル[${color}]が1つ増えて${target.name}のコストが1下がる（${before}→${after}）`,
    )

    // 対照実験：系統が違うスピリットカードには効かない
    const other = CARDS.find(
        (c) => c.type === "spirit" && !(c.family ?? []).includes(family) && (c.cost ?? 0) >= 3,
    )!
    const s2 = base("reborn-flame-other")
    for (let i = 0; i < carriers; i++) put(s2, "p1", symbolCarrier.cardId, 1)
    const otherBefore = effectiveCost(s2, "p1", byId(other.cardId) as never)
    s2.players.p1.hand.push(reborn.cardId)
    assert(
        act(s2, "p1", { type: "castMagic", handIndex: s2.players.p1.hand.length - 1 }) === null,
        "リボーンフレイムを使用",
    )
    assert(
        effectiveCost(s2, "p1", byId(other.cardId) as never) === otherBefore,
        `対照実験：系統「${family}」でない${other.name}のコストは変わらない`,
    )
}
