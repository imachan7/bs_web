// smoke パート146（第八弾「戦嵐」緑15枚：新規エンジン拡張の経路確認）
//
// BS08の緑15枚取り込みで追加したエンジン拡張を実カード経由で1回ずつ通す:
//   kind"bofuCountBonus"＋bofuCountFor（自分のスピリットすべての【暴風】の指定数+1。BS08-023）／
//   action"bpBuffAllByBofuCount"（【暴風】の指定体数1につきBP+2000。BS08-074）／
//   action"bpBuffAllPer"＋filter.nameContains配列OR（「ダーク」/「ブラック」。BS08-075）／
//   action"grantKeywordToHandCard".all（手札の該当カードすべてに【神速】。BS08-073）／
//   action"refreshSelf".costSelfCoresToVoid（自身のコアを払って回復。BS08-X31）／
//   fieldEvent"ownTensho"のnameIncludes加算（コア2+2=4。BS08-025）／
//   fieldEvent"opponentDrew"のrepeatPerCount（ドロー1枚につき回復。BS08-022）／
//   fieldEvent.optional（「できる」の発動確認。BS08-059）／
//   globalConstraint"coreFloorByCost"（アタックステップ限定でコストを下回らない。BS08-059）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    draw,
    effectiveBp,
    resolveAction,
    refreshLevelAsOverrides,
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
function bpAt(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.bp ?? 0
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 40
    s.players.p2.reserve = 40
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
)!

console.log("=== BS08ゲラン准将：kind bofuCountBonus（自分の【暴風】の指定数すべて+1） ===")
{
    const geran = findByEffect((e) => e["kind"] === "bofuCountBonus")
    const bonusEntry = entryOf(geran, (e) => e["kind"] === "bofuCountBonus")
    const bonusLevel = (bonusEntry["levels"] as number[])[0]!
    const bofuEntry = entryOf(geran, (e) => e["kind"] === "keyword" && e["keyword"] === "bofu")
    const baseCount = Number(bofuEntry["count"] ?? 1)
    const otherRecovered = CARDS.find((c) => c.type === "spirit" && c.cardId !== geran.cardId)!

    // Lv1（ボーナス無効）：暴風の指定数は基本値のまま＝1体だけ疲労する
    const s = base("geran-lv1")
    const attacker = put(s, "p1", geran.cardId, coresFor(geran, 1))
    const blocker = put(s, "p2", FILLER.cardId, coresFor(FILLER, 1) + 2)
    const a = put(s, "p2", otherRecovered.cardId, coresFor(otherRecovered, 1))
    const b = put(s, "p2", otherRecovered.cardId, coresFor(otherRecovered, 1) + 1) // 実効BPを変えて自動選択を決定的にする
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    const restedCount = [a, b].filter((x) => x.isRested).length
    assert(restedCount === baseCount, `Lv1では【暴風：${baseCount}】どおり${baseCount}体だけ疲労する`)

    // Lv2（bofuCountBonus+1で実効2）：候補2体がどちらも疲労する
    const s2 = base("geran-lv2")
    const attacker2 = put(s2, "p1", geran.cardId, coresFor(geran, bonusLevel))
    const blocker2 = put(s2, "p2", FILLER.cardId, coresFor(FILLER, 1) + 2)
    const a2 = put(s2, "p2", otherRecovered.cardId, coresFor(otherRecovered, 1))
    const b2 = put(s2, "p2", otherRecovered.cardId, coresFor(otherRecovered, 1) + 1)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s2, "p2", blocker2.instanceId) === null, "ブロック宣言")
    assert(a2.isRested && b2.isRested, "Lv2ではbofuCountBonusにより実効2体になり、両方疲労する")
    assert(
        s2.players.p1.field.spirits.every((x) => x.instanceId === attacker2.instanceId || !x.isRested),
        "疲労するのは相手側だけで、自分の他のスピリットは巻き込まない",
    )
}

console.log("=== BS08スナイピングブラスト：bpBuffAllByBofuCount（【暴風】の指定体数1につきBP+2000） ===")
{
    const sniping = findByEffect(
        (e) =>
            e["kind"] === "magic" &&
            e["timing"] === "main" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuffAllByBofuCount",
    )
    const entry = entryOf(sniping, (e) => e["kind"] === "magic" && e["timing"] === "main")
    const amountPer = Number((entry["action"] as Record<string, unknown>)["amountPer"])
    const bofuCard = findByEffect((e) => e["kind"] === "keyword" && e["keyword"] === "bofu")
    const bofuEntry = entryOf(bofuCard, (e) => e["kind"] === "keyword" && e["keyword"] === "bofu")
    const bofuLevel = (bofuEntry["levels"] as number[])[0]!
    const bofuCount = Number(bofuEntry["count"] ?? 1)

    const s = base("sniping")
    const bofuSpirit = put(s, "p1", bofuCard.cardId, coresFor(bofuCard, bofuLevel))
    const plain = put(s, "p1", FILLER.cardId, coresFor(FILLER, 1))
    s.players.p1.hand.push(sniping.cardId)
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null, "使用（メインステップ）")
    assert(
        effectiveBp(s, "p1", bofuSpirit) === bpAt(bofuCard, bofuLevel) + amountPer * bofuCount,
        `【暴風：${bofuCount}】持ちはBP+${amountPer * bofuCount}`,
    )
    assert(effectiveBp(s, "p1", plain) === bpAt(FILLER, 1), "対照実験：【暴風】を持たないスピリットは変化しない")
}

console.log("=== BS08ダークパワー：bpBuffAllPer + filter.nameContains配列（「ダーク」/「ブラック」のOR） ===")
{
    const darkpower = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuffAllPer",
    )
    const entry = entryOf(darkpower, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "bpBuffAllPer")
    const action = entry["action"] as Record<string, unknown>
    const amountPer = Number(action["amountPer"])
    const names = ((action["filter"] as Record<string, unknown>)["nameContains"] as string[]) ?? []
    const matchSpirit = CARDS.find(
        (c) => c.type === "spirit" && names.some((n) => c.name.includes(n)) && c.cardId !== darkpower.cardId,
    )!
    const otherSpirit = CARDS.find(
        (c) => c.type === "spirit" && !names.some((n) => c.name.includes(n)) && c.cardId !== matchSpirit.cardId,
    )!
    const exhaustedFiller = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== matchSpirit.cardId && c.cardId !== otherSpirit.cardId,
    )!

    const s = base("darkpower")
    const match = put(s, "p1", matchSpirit.cardId, coresFor(matchSpirit, 1))
    const other = put(s, "p1", otherSpirit.cardId, coresFor(otherSpirit, 1))
    const exhausted = put(s, "p1", exhaustedFiller.cardId, coresFor(exhaustedFiller, 1))
    exhausted.isRested = true
    const matchBefore = effectiveBp(s, "p1", match)
    const otherBefore = effectiveBp(s, "p1", other)
    s.players.p1.hand.push(darkpower.cardId)
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null, "使用")
    assert(
        effectiveBp(s, "p1", match) === matchBefore + amountPer * 1,
        `カード名に「${names.join("」/「")}」を含むスピリットは、疲労スピリット1体につきBP+${amountPer}`,
    )
    assert(effectiveBp(s, "p1", other) === otherBefore, "対照実験：名前が一致しないスピリットは変化しない")
}

console.log("=== BS08ライトニングスピード：grantKeywordToHandCard.all（手札の該当カードすべてに【神速】） ===")
{
    const lightning = findByEffect(
        (e) =>
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantKeywordToHandCard" &&
            (e["action"] as Record<string, unknown>)["all"] === true,
    )
    const entry = entryOf(
        lightning,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantKeywordToHandCard",
    )
    const action = entry["action"] as Record<string, unknown>
    const families = action["familyFilter"] as string[]
    const matchA = CARDS.find(
        (c) => c.type === "spirit" && families.some((f) => (c.family ?? []).includes(f)) && c.cardId !== lightning.cardId,
    )!
    const matchB = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            families.some((f) => (c.family ?? []).includes(f)) &&
            c.cardId !== matchA.cardId &&
            c.cardId !== lightning.cardId,
    )!
    const other = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            !families.some((f) => (c.family ?? []).includes(f)) &&
            c.cardId !== lightning.cardId &&
            c.cardId !== matchA.cardId &&
            c.cardId !== matchB.cardId,
    )!

    const s = base("lightning-all")
    s.players.p1.hand = [matchA.cardId, matchB.cardId, other.cardId, lightning.cardId]
    assert(act(s, "p1", { type: "castMagic", handIndex: 3 }) === null, "使用")
    const grants = s.players.p1.tempHandKeywordGrants ?? []
    assert(
        grants.some((g) => g.cardId === matchA.cardId && g.keyword === "soku"),
        "条件一致1枚目に【神速】が与えられる",
    )
    assert(
        grants.some((g) => g.cardId === matchB.cardId && g.keyword === "soku"),
        "条件一致2枚目にも、選択を挟まず【神速】が与えられる",
    )
    assert(!grants.some((g) => g.cardId === other.cardId), "対照実験：条件に合わないカードには与えられない")
}

console.log("=== BS08ブラックタウロス大王：refreshSelf.costSelfCoresToVoid（自身のコアを払って回復） ===")
{
    const taurus = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "refreshSelf" &&
            (e["action"] as Record<string, unknown>)["costSelfCoresToVoid"] !== undefined,
    )
    const entry = entryOf(
        taurus,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "refreshSelf",
    )
    const cost = Number((entry["action"] as Record<string, unknown>)["costSelfCoresToVoid"])
    const minCores = coresFor(taurus, 1)

    const s = base("taurus-pay")
    const inst = put(s, "p1", taurus.cardId, cost + minCores + 2)
    inst.isRested = true
    const before = inst.cores
    resolveAction(s, "p1", inst, { type: "refreshSelf", costSelfCoresToVoid: cost })
    assert(inst.cores === before - cost, `自身のコア${cost}個をボイドに置いて回復する`)
    assert(!inst.isRested, "支払うと回復する")

    const s2 = base("taurus-insufficient")
    const inst2 = put(s2, "p1", taurus.cardId, cost + minCores - 1)
    inst2.isRested = true
    const before2 = inst2.cores
    resolveAction(s2, "p1", inst2, { type: "refreshSelf", costSelfCoresToVoid: cost })
    assert(inst2.cores === before2, "対照実験：払うと維持コアを割り込む場合は発動せず、コアは変化しない")
    assert(inst2.isRested, "対照実験：発動しなければ疲労状態のまま")
}

console.log("=== BS08女王アントレーヌ：ownTenshoのnameIncludes加算（コア2+2＝4個） ===")
{
    const antoreine = findByEffect(
        (e) =>
            e["kind"] === "fieldEvent" &&
            e["event"] === "ownTensho" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "coreGain",
    )
    const tenshoEntry = entryOf(antoreine, (e) => e["kind"] === "keyword" && e["keyword"] === "tensho")
    const minCost = Number(tenshoEntry["minCost"] ?? 0)
    const nameEntry = entryOf(antoreine, (e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho")
    const names = nameEntry["nameIncludes"] as string[]
    const sacrificeMatch = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== antoreine.cardId && names.some((n) => c.name.includes(n)) && (c.cost ?? 0) >= minCost,
    )!
    // 比較対象はリザーブの増分なので、**召喚コストが両者で同じ**でなければならない。
    // 場のスピリットのシンボルはコスト軽減に効くため、犠牲役のシンボルを揃えて選ぶ
    // （揃えないと兵隊アントマン＝緑シンボルのときだけ軽減が1効き、差が2ではなく3になる）
    const symbolKey = (c: CardRow) => (c.symbol ?? []).join(",")
    const sacrificeOther = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== antoreine.cardId &&
            !names.some((n) => c.name.includes(n)) &&
            (c.cost ?? 0) >= minCost &&
            symbolKey(c) === symbolKey(sacrificeMatch),
    )!

    const s = base("antoreine-match")
    s.players.p1.hand = [antoreine.cardId]
    put(s, "p1", sacrificeMatch.cardId, coresFor(sacrificeMatch, 1))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${antoreine.name}を召喚（【転召】は${sacrificeMatch.name}）`)
    const reserveMatch = s.players.p1.reserve

    const s2 = base("antoreine-other")
    s2.players.p1.hand = [antoreine.cardId]
    put(s2, "p1", sacrificeOther.cardId, coresFor(sacrificeOther, 1))
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, `${antoreine.name}を召喚（【転召】は${sacrificeOther.name}）`)
    const reserveOther = s2.players.p1.reserve

    assert(
        reserveMatch === reserveOther + 2,
        `カード名に「${names.join("」/「")}」と入っているスピリットで【転召】すると、置くコアが2個多くなる（合計4個）`,
    )
}

console.log('=== BS08マンゴース：fieldEvent"opponentDrew".repeatPerCount（ドロー1枚につき回復） ===')
{
    const mangoose = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "opponentDrew" && e["repeatPerCount"] === true,
    )
    const entry = entryOf(mangoose, (e) => e["kind"] === "fieldEvent" && e["event"] === "opponentDrew")
    const level = (entry["levels"] as number[])[0]!
    const family = String((entry["action"] as Record<string, unknown>)["filter"] ? ((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["family"] : "")
    const swordBeasts = CARDS.filter((c) => c.type === "spirit" && (c.family ?? []).includes(family) && c.cardId !== mangoose.cardId)
    const swA = swordBeasts[0]!
    const swB = swordBeasts[1]!

    const s = base("mangoose-2draws")
    s.turnPlayer = "p2"
    s.phase = "main"
    put(s, "p1", mangoose.cardId, coresFor(mangoose, level))
    const a = put(s, "p1", swA.cardId, coresFor(swA, 1))
    const b = put(s, "p1", swB.cardId, coresFor(swB, 1) + 1) // 実効BPをずらして自動選択を決定的にする
    a.isRested = true
    b.isRested = true
    draw(s, "p2", 2)
    assert(!a.isRested && !b.isRested, `系統「${family}」の2体とも、相手のドロー2枚ぶんで回復する`)

    const s2 = base("mangoose-1draw")
    s2.turnPlayer = "p2"
    s2.phase = "main"
    put(s2, "p1", mangoose.cardId, coresFor(mangoose, level))
    const a2 = put(s2, "p1", swA.cardId, coresFor(swA, 1))
    const b2 = put(s2, "p1", swB.cardId, coresFor(swB, 1) + 1)
    a2.isRested = true
    b2.isRested = true
    draw(s2, "p2", 1)
    const recovered2 = [a2, b2].filter((x) => !x.isRested).length
    assert(recovered2 === 1, "対照実験：相手のドローが1枚なら回復するのも1体だけ")
}

console.log("=== BS08聖なる柱状彫刻：fieldEvent.optional（ownLifeDamaged、「できる」の発動確認） ===")
{
    const pillar = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "ownLifeDamaged" && e["optional"] === true,
    )
    const entry = entryOf(pillar, (e) => e["kind"] === "fieldEvent" && e["event"] === "ownLifeDamaged")
    const level = (entry["levels"] as number[])[0]!
    const tenshoCard = CARDS.find((c) => c.type === "spirit" && c.cardId !== pillar.cardId && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "tensho"))!
    const attackerCard = FILLER

    // 非interactive（自動）では常に発動する
    const s = base("pillar-auto")
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", pillar.cardId, coresFor(pillar, level))
    s.players.p1.hand.push(tenshoCard.cardId)
    const attacker = put(s, "p2", attackerCard.cardId, coresFor(attackerCard, 1))
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === tenshoCard.cardId),
        "自動解決（テスト）では『できる』効果が常に発動し、【転召】持ちが手札から召喚される",
    )

    // interactiveでは発動確認のpendingChoiceが挟まる
    const s2 = base("pillar-confirm")
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    putNexus(s2, "p1", pillar.cardId, coresFor(pillar, level))
    s2.players.p1.hand.push(tenshoCard.cardId)
    const attacker2 = put(s2, "p2", attackerCard.cardId, coresFor(attackerCard, 1))
    s2.interactiveTargets = true
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s2, "p1") === null, "ライフで受ける")
    assert(s2.pendingChoice?.kind === "option", "『できる』のため発動確認のpendingChoiceが立つ")
    assert(s2.pendingChoice?.confirm === true, "発動確認（confirm）である")
    assert(
        !s2.players.p1.field.spirits.some((sp) => sp.cardId === tenshoCard.cardId),
        "確認待ち中はまだ召喚されていない",
    )
    assert(act(s2, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    assert(
        s2.players.p1.field.spirits.some((sp) => sp.cardId === tenshoCard.cardId),
        "発動を選ぶと【転召】持ちが手札から召喚される",
    )
}

// 「Lv1コスト」＝**Lv1に必要なコア数**（レベル表の「Lv1コスト：1」の表記。2026-08-14 ユーザー確認）。
// 以前はカードの召喚コストとして実装していたため、テストもコスト基準で書かれていた
console.log("=== BS08聖なる柱状彫刻：globalConstraint coreFloorByCost（アタックステップ限定でLv1コアを下回らない） ===")
{
    const pillar = findByEffect(
        (e) =>
            e["kind"] === "globalConstraint" &&
            (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "coreFloorByCost",
    )
    const entry = entryOf(pillar, (e) => e["kind"] === "globalConstraint")
    const level = (entry["levels"] as number[])[0]!
    // Lv1に必要なコア数が2個以上のカードを使うと、下限が効いているかを観測できる
    const target = CARDS.find(
        (c) => c.type === "spirit" && ((c.levels ?? [])[0]?.cores ?? 0) >= 2,
    )!
    const floor = (target.levels ?? [])[0]?.cores ?? 1

    const s = base("floor-attack")
    s.phase = "attack"
    putNexus(s, "p1", pillar.cardId, coresFor(pillar, level))
    const spirit = put(s, "p2", target.cardId, floor + 5)
    resolveAction(s, "p2", spirit, { type: "coreRemoveSelf", count: 99 })
    assert(spirit.cores === floor, `アタックステップ中はLv1コスト${floor}を下回らない`)

    const s2 = base("floor-main")
    s2.phase = "main"
    putNexus(s2, "p1", pillar.cardId, coresFor(pillar, level))
    const spirit2 = put(s2, "p2", target.cardId, floor + 5)
    resolveAction(s2, "p2", spirit2, { type: "coreRemoveSelf", count: 99 })
    // 制約が無ければ「維持コア（＝Lv1コスト）を割る」ところまで取り除ける
    assert(spirit2.cores < floor, "対照実験：アタックステップでなければ下限は効かない")
}
