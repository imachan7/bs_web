// smoke パート147（第八弾「戦嵐」白15枚：新規エンジン拡張の経路確認）
//
// BS08の白15枚取り込みで追加したエンジン拡張を実カード経由で1回ずつ通す:
//   action"forceAttackThisTurn"（GameState.turnConstraints。maxCost版=BS08アンブッシュブロッカー／
//   count版=BS08獣機合神セイ・ドリガン）／
//   action"grantCanBlockWhileRestedThisTurn"（GameState.turnConstraints。BS08インフィニティシールド）／
//   constraint"canBlockWhileRested".targetKeywordExclude（BS08一角魚モノケロック）／
//   constraint"protectOwnLifeByBpUpToSelf"（BS08空帝竜騎プラチナム）／
//   globalConstraint"noSummonTriggerByCost"（BS08共鳴する音叉の塔）／
//   globalConstraint"noReductionBySummonCost"（BS08超時空重力炉）／
//   kind"tenshoSelfCostBonus"（BS08冥機グングニル）／
//   kind"activated".timing"flash"（バトル外でも発動可。BS08機人フィアラル）／
//   action"bpBuff".amountFromSelfBp（BS08機人フィアラル）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    effectiveBp,
    effectiveCost,
    getCard,
    resolveAction,
    refreshLevelAsOverrides,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { fireSummonTrigger, resolveTensho } from "../../server/src/logic/EffectModules"
import { validateEndTurn } from "../../server/src/logic/RuleValidator"

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
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
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

console.log("=== BS08アンブッシュブロッカー：action forceAttackThisTurn（maxCost版。GameState.turnConstraints） ===")
{
    const ambush = findByEffect(
        (e) =>
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "forceAttackThisTurn" &&
            (e["action"] as Record<string, unknown>)["maxCost"] !== undefined,
    )
    const entry = entryOf(
        ambush,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "forceAttackThisTurn",
    )
    const action = entry["action"] as Record<string, unknown>
    const maxCost = Number(action["maxCost"])
    const cheap = CARDS.find((c) => c.type === "spirit" && (c.cost ?? 99) <= maxCost)!

    const s = base("ambush-maxcost")
    const marked = put(s, "p2", cheap.cardId, coresFor(cheap, 1))
    resolveAction(s, "p1", null, { type: "forceAttackThisTurn", side: "opponent", maxCost })
    assert(
        s.turnConstraints.some((c) => c.type === "mustAttackByCost" && c.pid === "p2" && c.maxCost === maxCost),
        "p2側にコスト条件つきの強制アタックが積まれる",
    )
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(validateEndTurn(s, "p2") !== null, "対象スピリットが未アタックの間はターン終了を拒否")
    assert(act(s, "p2", { type: "attack", instanceId: marked.instanceId }) === null, "対象スピリットでアタック宣言")
    assert(takeLifeAndResolve(s, "p1") === null, "p1がライフで受ける")
    assert(validateEndTurn(s, "p2") === null, "アタック済みなのでターン終了できる")
}

console.log("=== BS08獣機合神セイ・ドリガン：action forceAttackThisTurn（count版。実効BP最大を自動選択） ===")
{
    const seidorigan = findByEffect(
        (e) =>
            e["kind"] === "step" &&
            (e["action"] as Record<string, unknown> | undefined)?.["type"] === "forceAttackThisTurn" &&
            (e["action"] as Record<string, unknown>)["maxCost"] === undefined,
    )
    const filler = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!

    const s = base("seidorigan-count")
    const weak = put(s, "p2", filler.cardId, coresFor(filler, 1))
    const strong = put(s, "p2", filler.cardId, coresFor(filler, 1) + 2) // 実効BPを変えて自動選択を決定的にする
    resolveAction(s, "p1", null, { type: "forceAttackThisTurn", side: "opponent", count: 1 })
    assert(
        s.turnConstraints.some((c) => c.type === "mustAttackByInstance" && c.pid === "p2" && c.instanceId === strong.instanceId),
        "実効BP最大の相手スピリットが強制アタック対象に指定される",
    )
    assert(
        !s.turnConstraints.some((c) => c.type === "mustAttackByInstance" && c.instanceId === weak.instanceId),
        "BPが低い方は対象にならない",
    )
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(validateEndTurn(s, "p2") !== null, "指定されたスピリットが未アタックの間はターン終了を拒否")
    assert(act(s, "p2", { type: "attack", instanceId: strong.instanceId }) === null, "指定されたスピリットでアタック宣言")
    assert(takeLifeAndResolve(s, "p1") === null, "p1がライフで受ける")
    assert(validateEndTurn(s, "p2") === null, "アタック済みなのでターン終了できる")
    // seidoriganの実カード自体（kind:"keyword" tensho／onBattleStart returnToHand）も参照できることの確認
    assert(seidorigan.name.length > 0, "対象カードを実カード経由で特定できた")
}

console.log("=== BS08インフィニティシールド：action grantCanBlockWhileRestedThisTurn（GameState.turnConstraints） ===")
{
    const shield = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantCanBlockWhileRestedThisTurn",
    )
    const entry = entryOf(
        shield,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantCanBlockWhileRestedThisTurn",
    )
    const action = entry["action"] as Record<string, unknown>
    const families = action["familyFilter"] as string[]
    const matchBlocker = CARDS.find((c) => c.type === "spirit" && families.some((f) => (c.family ?? []).includes(f)))!
    const otherBlocker = CARDS.find(
        (c) => c.type === "spirit" && !families.some((f) => (c.family ?? []).includes(f)) && c.cardId !== matchBlocker.cardId,
    )!
    const attackerCard = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== matchBlocker.cardId && c.cardId !== otherBlocker.cardId,
    )!

    const s = base("shield-grant")
    const blocker = put(s, "p1", matchBlocker.cardId, coresFor(matchBlocker, 1))
    blocker.isRested = true
    const other = put(s, "p1", otherBlocker.cardId, coresFor(otherBlocker, 1))
    other.isRested = true
    resolveAction(s, "p1", null, { type: "grantCanBlockWhileRestedThisTurn", familyFilter: families })

    const attacker1 = put(s, "p2", attackerCard.cardId, coresFor(attackerCard, 1))
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: attacker1.instanceId }) === null, "1体目がアタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "系統一致の疲労スピリットは疲労状態でもブロックできる")
    // ブロック後のフラッシュ再オープンは防御側（p1）から優先権を持つ
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")

    const attacker2 = put(s, "p2", attackerCard.cardId, coresFor(attackerCard, 1) + 1)
    assert(act(s, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "2体目がアタック宣言")
    assert(declareBlock(s, "p1", other.instanceId) !== null, "対照実験：系統が一致しない疲労スピリットはブロックできない")
}

console.log("=== BS08一角魚モノケロック：constraint canBlockWhileRested.targetKeywordExclude（【転召】持ちの攻撃はブロックできない） ===")
{
    const monokerokku = findByEffect(
        (e) =>
            e["kind"] === "constraint" &&
            (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "canBlockWhileRested" &&
            (e["constraint"] as Record<string, unknown>)["targetKeywordExclude"] !== undefined,
    )
    const entry = entryOf(monokerokku, (e) => e["kind"] === "constraint")
    const activeLevel = (entry["levels"] as number[])[0]!
    const tenshoAttacker = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "tensho"))!
    const plainAttacker = CARDS.find(
        (c) => c.type === "spirit" && !(c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "tensho"),
    )!

    const s = base("monokerokku-tensho-blocked")
    const blocker = put(s, "p1", monokerokku.cardId, coresFor(monokerokku, activeLevel))
    blocker.isRested = true
    const attacker = put(s, "p2", tenshoAttacker.cardId, coresFor(tenshoAttacker, 1))
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "【転召】持ちがアタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) !== null, "【転召】持ちのアタックには疲労状態でブロックできない")

    const s2 = base("monokerokku-normal-block")
    const blocker2 = put(s2, "p1", monokerokku.cardId, coresFor(monokerokku, activeLevel))
    blocker2.isRested = true
    const attacker2 = put(s2, "p2", plainAttacker.cardId, coresFor(plainAttacker, 1))
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "【転召】を持たない相手がアタック宣言")
    assert(declareBlock(s2, "p1", blocker2.instanceId) === null, "【転召】を持たない相手には疲労状態でもブロックできる")
}

console.log("=== BS08空帝竜騎プラチナム：constraint protectOwnLifeByBpUpToSelf（発生源以下の実効BPアタックはライフが減らない・片側のみ） ===")
{
    const platinum = findByEffect(
        (e) => e["kind"] === "constraint" && (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "protectOwnLifeByBpUpToSelf",
    )
    const entry = entryOf(platinum, (e) => e["kind"] === "constraint")
    const activeLevel = (entry["levels"] as number[])[0]!
    const platBp = bpAt(platinum, activeLevel)
    const weakAttacker = CARDS.find((c) => c.type === "spirit" && (c.levels?.[0]?.bp ?? 999999) <= platBp)!
    const strongAttacker = CARDS.find((c) => c.type === "spirit" && (c.levels?.[0]?.bp ?? 0) > platBp)!

    const s = base("platinum-protect-weak")
    put(s, "p1", platinum.cardId, coresFor(platinum, activeLevel))
    const attacker = put(s, "p2", weakAttacker.cardId, coresFor(weakAttacker, 1))
    s.turnPlayer = "p2"
    s.phase = "attack"
    const lifeBefore = s.players.p1.life
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "プラチナムのBP以下のスピリットがアタック宣言")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける宣言")
    assert(s.players.p1.life === lifeBefore, "プラチナム以下の実効BPのアタックではライフが減らない")

    const s2 = base("platinum-protect-strong")
    put(s2, "p1", platinum.cardId, coresFor(platinum, activeLevel))
    const attacker2 = put(s2, "p2", strongAttacker.cardId, coresFor(strongAttacker, 1))
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    const lifeBefore2 = s2.players.p1.life
    assert(act(s2, "p2", { type: "attack", instanceId: attacker2.instanceId }) === null, "プラチナムのBPを超えるスピリットがアタック宣言")
    assert(takeLifeAndResolve(s2, "p1") === null, "ライフで受ける宣言")
    assert(s2.players.p1.life < lifeBefore2, "対照実験：プラチナムのBPを超えるアタックはライフが減る")
}

console.log("=== BS08共鳴する音叉の塔：globalConstraint noSummonTriggerByCost（コスト以下の召喚時効果を抑止） ===")
{
    const onsakuto = findByEffect(
        (e) => e["kind"] === "globalConstraint" && (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noSummonTriggerByCost",
    )
    const entry = entryOf(onsakuto, (e) => e["kind"] === "globalConstraint")
    const constraint = entry["constraint"] as Record<string, unknown>
    const maxCost = Number(constraint["maxCost"])
    const activeLevel = (entry["levels"] as number[])[0]!
    const cheapWithOnSummon = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 99) <= maxCost && (c.effects ?? []).some((e) => e["kind"] === "triggered" && e["trigger"] === "onSummon"),
    )!

    const s = base("onsakuto-block")
    putNexus(s, "p1", onsakuto.cardId, coresFor(onsakuto, activeLevel))
    const summoned = put(s, "p2", cheapWithOnSummon.cardId, coresFor(cheapWithOnSummon, 1))
    fireSummonTrigger(s, "p2", summoned)
    assert(s.log.some((l) => l.includes("召喚時効果は発揮されなかった")), "コスト以下の召喚時効果が抑止される")

    const s2 = base("onsakuto-noblock")
    const summoned2 = put(s2, "p2", cheapWithOnSummon.cardId, coresFor(cheapWithOnSummon, 1))
    fireSummonTrigger(s2, "p2", summoned2)
    assert(!s2.log.some((l) => l.includes("召喚時効果は発揮されなかった")), "対照実験：発生源がなければ通常どおり召喚時効果が発揮される")
}

console.log("=== BS08超時空重力炉：globalConstraint noReductionBySummonCost（コスト以下のスピリットは軽減シンボルが効かない） ===")
{
    const juryokuro = findByEffect(
        (e) => e["kind"] === "globalConstraint" && (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noReductionBySummonCost",
    )
    const entry = entryOf(juryokuro, (e) => e["kind"] === "globalConstraint")
    const constraint = entry["constraint"] as Record<string, unknown>
    const maxCost = Number(constraint["maxCost"])
    const activeLevel = (entry["levels"] as number[])[0]!
    const targetCard = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 99) <= maxCost && (c as unknown as { reduction?: string[] }).reduction?.length,
    )! as unknown as { cardId: string; cost: number; reduction: string[] }
    const symbolFiller = CARDS.find(
        (c) => c.type === "spirit" && (c.symbol ?? []).includes(targetCard.reduction[0] as string) && (c.effects ?? []).length === 0,
    )!

    const s = base("juryokuro-noblock")
    put(s, "p1", symbolFiller.cardId, coresFor(symbolFiller, 1))
    const cardData = getCard(targetCard.cardId)
    const reducedCost = effectiveCost(s, "p1", cardData)
    assert(reducedCost < targetCard.cost, "対照実験：発生源がなければ軽減シンボルどおり軽減される")

    const s2 = base("juryokuro-block")
    put(s2, "p1", symbolFiller.cardId, coresFor(symbolFiller, 1))
    putNexus(s2, "p1", juryokuro.cardId, coresFor(juryokuro, activeLevel))
    const blockedCost = effectiveCost(s2, "p1", cardData)
    assert(blockedCost === targetCard.cost, "コスト以下のスピリットは軽減シンボルによる軽減ができなくなる")
}

console.log("=== BS08冥機グングニル：kind tenshoSelfCostBonus（【転召】の生贄候補列挙でだけ自身のコストに+amount） ===")
{
    const gungnir = findByEffect((e) => e["kind"] === "tenshoSelfCostBonus")
    const entry = entryOf(gungnir, (e) => e["kind"] === "tenshoSelfCostBonus")
    const bonus = Number(entry["amount"])
    const bonusLevel = (entry["levels"] as number[])[0]!
    const gungnirCost = gungnir.cost ?? 0
    // 素のコストでは対象外だが、+bonus後なら対象になる【転召】持ちを探す
    const tenshoCard = CARDS.find((c) => {
        if (c.type !== "spirit" || c.cardId === gungnir.cardId) return false
        const t = (c.effects ?? []).find((e) => e["kind"] === "keyword" && e["keyword"] === "tensho")
        if (!t) return false
        const minCost = Number(t["minCost"] ?? 0)
        return minCost > gungnirCost && minCost <= gungnirCost + bonus
    })!

    const s = base("gungnir-tensho")
    const gu = put(s, "p1", gungnir.cardId, coresFor(gungnir, bonusLevel))
    const summonedSpirit = put(s, "p1", tenshoCard.cardId, coresFor(tenshoCard, 1))
    resolveTensho(s, "p1", summonedSpirit)
    assert(
        !s.players.p1.field.spirits.includes(gu),
        "コスト+amountにより転召の生贄候補になり、コアをすべて置かれて消滅した",
    )
    assert(s.players.p1.field.spirits.includes(summonedSpirit), "召喚した本体はそのまま場に残る")
}

console.log("=== BS08機人フィアラル：kind activated timing:\"flash\"（バトル外でも発動可）＋ action bpBuff.amountFromSelfBp ===")
{
    const fiaral = findByEffect((e) => e["kind"] === "activated" && e["timing"] === "flash")
    const entry = entryOf(fiaral, (e) => e["kind"] === "activated")
    const effectId = String(entry["id"])
    const filterFamily = String(((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["family"])
    const buffTarget = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(filterFamily) && c.cardId !== fiaral.cardId)!

    // (a) バトル外（自分のメインステップ）でも発動できる
    // pickBpBuffTargetは対象未指定時「自分フィールドの先頭からfilter一致」を拾うため、
    // フィアラル自身もfamilyFilter"武装"に一致してしまわないよう、対象を先に置く
    const s = base("fiaral-outside-battle")
    const target = put(s, "p1", buffTarget.cardId, coresFor(buffTarget, 1))
    const fi = put(s, "p1", fiaral.cardId, coresFor(fiaral, 1))
    const selfBp = effectiveBp(s, "p1", fi)
    assert(s.phase === "main" && s.battle === null, "現在バトル外の自分のメインステップ")
    assert(act(s, "p1", { type: "activateAbility", instanceId: fi.instanceId, effectId }) === null, "バトル外でも起動能力を発動できる（flashBattleとの違い）")
    assert(fi.isRested === true, "コスト（自身を疲労）を支払った")
    assert(
        effectiveBp(s, "p1", target) === bpAt(buffTarget, 1) + selfBp,
        "対象はフィアラル自身の実効BP分だけBP+（amountFromSelfBp）",
    )

    // (b) バトル中のフラッシュでも発動できる（防御側が優先権を持つタイミング）
    const filler = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
    const s2 = base("fiaral-in-battle")
    const target2 = put(s2, "p2", buffTarget.cardId, coresFor(buffTarget, 1))
    const fi2 = put(s2, "p2", fiaral.cardId, coresFor(fiaral, 1))
    const attacker2 = put(s2, "p1", filler.cardId, coresFor(filler, 1))
    const selfBp2 = effectiveBp(s2, "p2", fi2)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "p1のアタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "p1がアタック宣言（防御側p2に優先権）")
    assert(
        act(s2, "p2", { type: "activateAbility", instanceId: fi2.instanceId, effectId }) === null,
        "防御側のバトル中フラッシュでも発動できる",
    )
    assert(
        effectiveBp(s2, "p2", target2) === bpAt(buffTarget, 1) + selfBp2,
        "バトル中でも自身の実効BP分だけBP+",
    )
}

console.log('=== BS08機神獣インフェニット・ヴォルス：lifeCrush.dest"trash"（ライフのコアがリザーブでなくトラッシュへ） ===')
{
    const volse = findByEffect(
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["dest"] === "trash" &&
            (e["action"] as Record<string, unknown>)["type"] === "lifeCrush",
    )
    const entry = entryOf(volse, (e) => (e["action"] as Record<string, unknown> | undefined)?.["dest"] === "trash")
    const level = (entry["levels"] as number[])[0]!
    // ブロック側で勝つ必要があるので、ヴォルスのBPより十分に低いアタッカーを選ぶ
    const volseBp = bpAt(volse, level)
    const weak = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.bp ?? 99999) < volseBp,
    )!

    const s = base("volse-trash")
    const blocker = put(s, "p1", volse.cardId, coresFor(volse, level))
    const attacker = put(s, "p2", weak.cardId, coresFor(weak, 1))
    const attackerCores = attacker.cores // 破壊されるとこのコアはリザーブへ戻る（ライフ由来の増加と区別するため控える）
    s.turnPlayer = "p2"
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2がアタック宣言")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ヴォルスでブロック")
    // ブロック宣言後に開くフラッシュを閉じないと onBattleWin まで進まない
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    assert(s.players.p2.life === lifeBefore - 1, "ブロック側のバトル勝利で相手のライフが1減る")
    assert(
        s.players.p2.trashCores === trashBefore + 1,
        "減ったライフのコアは相手のトラッシュへ置かれる（dest:\"trash\"）",
    )
    // リザーブは「破壊されたアタッカーの上のコアが戻った分」だけしか増えない。
    // ライフのコアまでリザーブへ行っていれば、ここがさらに1多くなる（既定の lifeCrush との違い）
    assert(
        s.players.p2.reserve === reserveBefore + attackerCores,
        "ライフのコアはリザーブに戻らない（増えるのは破壊されたアタッカーのコア分だけ）",
    )
}
