// smoke パート144（第八弾「戦嵐」赤15枚：新規エンジン拡張の経路確認）
//
// BS08の赤15枚取り込みで追加したエンジン拡張を実カード経由で1回ずつ通す:
//   TargetFilter.hasTrigger／fieldEvent.excludePhase／FieldEvent"ownTensho"＋discardOpponent.cardTypeFilter／
//   fieldEvent.condition"targetMaxBp"／battleWon.firstAttackOfTurn＋destroyByBpBudget.budgetFromSelfBp／
//   reviveOnDestroy.cost.ownLifeOneToVoid／summonFromHandFree.keywordFilter+skipTensho／
//   destroyAll.drawPerDestroyed／grantEffectToTargetThisTurn＋lifeCrush.countCounter／
//   destroyDownToOwnCount＋magic condition"ownSpiritCountAtLeast"／revealAndSummonAllByFamily／
//   destroyPer（EffectCounter { ownFamily }）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    draw,
    effectiveBp,
    fireStepTriggers,
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
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
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
function resolveBattle(s: GameState): void {
    let guard = 0
    while (s.battle && guard++ < 10) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
}
const FILLER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.levels?.[0]?.cores ?? 99) === 1,
)!
const FILLER2 = CARDS.find(
    (c) =>
        c.type === "spirit" &&
        (c.effects ?? []).length === 0 &&
        (c.levels?.[0]?.cores ?? 99) === 1 &&
        c.cardId !== FILLER.cardId,
)!

console.log("=== BS08プテラディア捕獲部隊：destroy filter『召喚時』効果持ちに限定（hasTrigger） ===")
{
    const ptera = findByEffect(
        (e) =>
            e["kind"] === "triggered" &&
            e["trigger"] === "onAttack" &&
            ((e["action"] as Record<string, unknown> | undefined)?.["filter"] as Record<string, unknown> | undefined)
                ?.["hasTrigger"] === "onSummon",
    )
    const entry = entryOf(
        ptera,
        (e) =>
            ((e["action"] as Record<string, unknown> | undefined)?.["filter"] as Record<string, unknown> | undefined)
                ?.["hasTrigger"] === "onSummon",
    )
    const level = (entry["levels"] as number[])[0]!
    const maxBp = ((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["maxBp"] as number
    const hasOnSummon = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== ptera.cardId &&
            (c.effects ?? []).some((e) => e["kind"] === "triggered" && e["trigger"] === "onSummon") &&
            bpAt(c, 1) <= maxBp,
    )!
    const noOnSummon = CARDS.find(
        (c) => c.cardId === FILLER.cardId,
    )!

    const s = base("ptera-hastrigger")
    const attacker = put(s, "p1", ptera.cardId, coresFor(ptera, level))
    const withOnSummon = put(s, "p2", hasOnSummon.cardId, coresFor(hasOnSummon, 1))
    const withoutOnSummon = put(s, "p2", noOnSummon.cardId, coresFor(noOnSummon, 1))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === withOnSummon.instanceId),
        `『召喚時』効果を持つ${hasOnSummon.name}が破壊される`,
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === withoutOnSummon.instanceId),
        `対照実験：『召喚時』効果を持たない${noOnSummon.name}は破壊されない`,
    )
}

console.log("=== BS08ダークアンキラーザウルス：opponentDrewのexcludePhase（ドローステップ以外） ===")
{
    const anki = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "opponentDrew" && e["excludePhase"] !== undefined,
    )
    const entry = entryOf(anki, (e) => e["kind"] === "fieldEvent" && e["event"] === "opponentDrew")
    const level = (entry["levels"] as number[])[0]!
    const maxBp = ((entry["action"] as Record<string, unknown>)["filter"] as Record<string, unknown>)["maxBp"] as number
    const victim = CARDS.find((c) => c.cardId === FILLER.cardId)!

    const s = base("anki-outside-draw")
    s.turnPlayer = "p2"
    put(s, "p1", anki.cardId, coresFor(anki, level))
    const target = put(s, "p2", victim.cardId, coresFor(victim, 1))
    s.phase = "main"
    draw(s, "p2", 1)
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId),
        `ドローステップ以外で相手がドローしたとき、BP${maxBp}以下の${victim.name}が破壊される`,
    )

    const s2 = base("anki-draw-step")
    s2.turnPlayer = "p2"
    put(s2, "p1", anki.cardId, coresFor(anki, level))
    const target2 = put(s2, "p2", victim.cardId, coresFor(victim, 1))
    s2.phase = "draw"
    draw(s2, "p2", 1)
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === target2.instanceId),
        "対照実験：ドローステップ中のドローでは発火しない",
    )
}

console.log("=== BS08関将龍皇ドラグロン：ownTensho＋familyFilter、discardOpponent.cardTypeFilter ===")
{
    const dragron = findByEffect((e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho")
    const entry = entryOf(dragron, (e) => e["kind"] === "fieldEvent" && e["event"] === "ownTensho")
    const family = String(entry["familyFilter"])
    const tenshoEntry = entryOf(dragron, (e) => e["kind"] === "keyword" && e["keyword"] === "tensho")
    const minCost = Number(tenshoEntry["minCost"] ?? 0)

    const sacrificeMatch = CARDS.find(
        (c) => c.type === "spirit" && c.cardId !== dragron.cardId && (c.family ?? []).includes(family) && (c.cost ?? 0) >= minCost,
    )!
    const sacrificeOther = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.cardId !== dragron.cardId &&
            !(c.family ?? []).includes(family) &&
            (c.cost ?? 0) >= minCost &&
            c.cardId !== sacrificeMatch.cardId,
    )!
    const opponentSpiritCard = CARDS.find((c) => c.type === "spirit")!

    const s = base("dragron-tensho-discard")
    s.players.p1.hand = [dragron.cardId]
    put(s, "p1", sacrificeMatch.cardId, coresFor(sacrificeMatch, 1))
    s.players.p2.hand.push(opponentSpiritCard.cardId)
    const p2HandBefore = s.players.p2.hand.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${dragron.name}を召喚（【転召】は系統「${family}」）`)
    assert(s.players.p2.hand.length === p2HandBefore - 1, "系統「竜人」で【転召】したとき、相手の手札からスピリット1枚を破棄させる")

    const s2 = base("dragron-tensho-nodiscard")
    s2.players.p1.hand = [dragron.cardId]
    put(s2, "p1", sacrificeOther.cardId, coresFor(sacrificeOther, 1))
    s2.players.p2.hand.push(opponentSpiritCard.cardId)
    const p2HandBefore2 = s2.players.p2.hand.length
    assert(act(s2, "p1", { type: "summon", handIndex: 0 }) === null, `${dragron.name}を召喚（【転召】は系統「${family}」以外）`)
    assert(s2.players.p2.hand.length === p2HandBefore2, "対照実験：系統が違うスピリットで【転召】しても手札は破棄されない")
}

console.log("=== BS08竜騎集う円卓：fieldEvent condition targetMaxBp（ownLifeDamaged） ===")
{
    const roundtable = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "ownLifeDamaged" && e["condition"] !== undefined,
    )
    const entry = entryOf(roundtable, (e) => e["kind"] === "fieldEvent" && e["event"] === "ownLifeDamaged")
    const level = (entry["levels"] as number[])[0]!
    const maxBp = ((entry["condition"] as Record<string, unknown>)["targetMaxBp"]) as number
    const weakAttacker = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) <= maxBp)!
    const strongAttacker = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) > maxBp)!

    const s = base("roundtable-weak")
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", roundtable.cardId, coresFor(roundtable, level))
    const weak = put(s, "p2", weakAttacker.cardId, coresFor(weakAttacker, 1))
    // 破壊されるのは「そのスピリット」＝アタッカー本人。BP最大の1体を選ぶ既定の絞り込みに
    // 落ちていないことを示すため、**より強い相手を隣に置いた状態**で確かめる
    const bystander = put(s, "p2", strongAttacker.cardId, coresFor(strongAttacker, 1))
    assert(act(s, "p2", { type: "attack", instanceId: weak.instanceId }) === null, "BP低いスピリットでアタック")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === weak.instanceId),
        `BP${maxBp}以下のアタックで自分のライフが減らされたとき、そのスピリットを破壊する`,
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === bystander.instanceId),
        "破壊されるのはアタッカー本人だけで、BPの高い別の相手は巻き込まない",
    )

    const s2 = base("roundtable-strong")
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    putNexus(s2, "p1", roundtable.cardId, coresFor(roundtable, level))
    const strong = put(s2, "p2", strongAttacker.cardId, coresFor(strongAttacker, 1))
    assert(act(s2, "p2", { type: "attack", instanceId: strong.instanceId }) === null, "BP高いスピリットでアタック")
    assert(takeLifeAndResolve(s2, "p1") === null, "ライフで受ける")
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === strong.instanceId),
        `対照実験：BP${maxBp}を超えるアタッカーは破壊されない`,
    )
}

console.log("=== BS08太陽石の神殿：battleWon.firstAttackOfTurn＋destroyByBpBudget.budgetFromSelfBp ===")
{
    const sunstone = findByEffect(
        (e) => e["kind"] === "battleWon" && (e["action"] as Record<string, unknown> | undefined)?.["budgetFromSelfBp"] === true,
    )
    const entry = entryOf(
        sunstone,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["budgetFromSelfBp"] === true,
    )
    const level = (entry["levels"] as number[])[0]!
    const clashKeyword = String(entry["winnerKeywordFilter"])
    const clashCard = findByEffect((e) => e["kind"] === "keyword" && e["keyword"] === clashKeyword)
    const clashEntry = entryOf(clashCard, (e) => e["kind"] === "keyword" && e["keyword"] === clashKeyword)
    const clashLevel = (clashEntry["levels"] as number[] | null)?.[0] ?? 1

    const s = base("sunstone-first")
    putNexus(s, "p1", sunstone.cardId, coresFor(sunstone, level))
    const attacker = put(s, "p1", clashCard.cardId, coresFor(clashCard, clashLevel))
    attacker.tempBpBuff = 999999
    const blocker = put(s, "p2", FILLER.cardId, 1)
    const bonus = put(s, "p2", FILLER2.cardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【激突】持ちでアタック（このターン最初）")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    resolveBattle(s)
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === blocker.instanceId),
        "ブロッカーはBP比較で破壊される",
    )
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === bonus.instanceId),
        "このターン最初のアタックで勝利したので、破壊したスピリットのBPまで追加破壊できる",
    )

    const s2 = base("sunstone-second")
    putNexus(s2, "p1", sunstone.cardId, coresFor(sunstone, level))
    const filler = put(s2, "p1", FILLER.cardId, 1)
    const attacker2 = put(s2, "p1", clashCard.cardId, coresFor(clashCard, clashLevel))
    attacker2.tempBpBuff = 999999
    const blocker1 = put(s2, "p2", FILLER.cardId, 1)
    const blocker2 = put(s2, "p2", FILLER.cardId, 1)
    const bonus2 = put(s2, "p2", FILLER2.cardId, 1)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: filler.instanceId }) === null, "1回目のアタック（別のスピリット）")
    assert(takeLifeAndResolve(s2, "p2") === null, "ブロックせずライフで受ける")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "2回目のアタック（【激突】持ち）")
    assert(declareBlock(s2, "p2", blocker2.instanceId) === null, "相手がブロック")
    resolveBattle(s2)
    assert(
        !s2.players.p2.field.spirits.some((sp) => sp.instanceId === blocker2.instanceId),
        "2回目でもBP比較の勝敗自体は成立する",
    )
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === bonus2.instanceId),
        "対照実験：このターン最初のアタックでなければ追加破壊は発動しない",
    )
}

console.log("=== BS08太陽石の神殿：reviveOnDestroy.cost.ownLifeOneToVoid ===")
{
    const sunstone = findByEffect(
        (e) => e["kind"] === "reviveOnDestroy" && (e["cost"] as Record<string, unknown> | undefined)?.["ownLifeOneToVoid"] === true,
    )
    const entry = entryOf(
        sunstone,
        (e) => (e["cost"] as Record<string, unknown> | undefined)?.["ownLifeOneToVoid"] === true,
    )
    const level = (entry["levels"] as number[])[0]!
    const clashKeyword = String(entry["keywordFilter"])
    const clashCard = findByEffect((e) => e["kind"] === "keyword" && e["keyword"] === clashKeyword)
    const clashEntry = entryOf(clashCard, (e) => e["kind"] === "keyword" && e["keyword"] === clashKeyword)
    const clashLevel = (clashEntry["levels"] as number[] | null)?.[0] ?? 1

    const s = base("sunstone-revive")
    putNexus(s, "p1", sunstone.cardId, coresFor(sunstone, level))
    const clashAttacker = put(s, "p1", clashCard.cardId, coresFor(clashCard, clashLevel))
    const plainAttacker = put(s, "p1", FILLER.cardId, 1)
    const strongBlocker1 = put(s, "p2", FILLER.cardId, 1)
    strongBlocker1.tempBpBuff = 999999
    const strongBlocker2 = put(s, "p2", FILLER.cardId, 1)
    strongBlocker2.tempBpBuff = 999999
    const lifeBefore = s.players.p1.life
    const reserveBefore = s.players.p1.reserve

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: clashAttacker.instanceId }) === null, "【激突】持ちでアタック")
    assert(declareBlock(s, "p2", strongBlocker1.instanceId) === null, "強いブロッカーが受ける")
    resolveBattle(s)
    const revived = s.players.p1.field.spirits.find((sp) => sp.instanceId === clashAttacker.instanceId)
    assert(revived !== undefined && revived.isRested === false, "【激突】持ちが破壊されても回復状態で場に戻る")
    assert(s.players.p1.life === lifeBefore - 1, "コストとして自分のライフのコア1個をボイドに置く")
    assert(s.players.p1.reserve === reserveBefore, "ライフのコアはリザーブへは戻らない（ボイドへ）")

    assert(act(s, "p1", { type: "attack", instanceId: plainAttacker.instanceId }) === null, "【激突】を持たないスピリットでアタック")
    assert(declareBlock(s, "p2", strongBlocker2.instanceId) === null, "強いブロッカーが受ける")
    resolveBattle(s)
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === plainAttacker.instanceId),
        "対照実験：【激突】を持たないスピリットは復活しない",
    )
    assert(s.players.p1.life === lifeBefore - 1, "対照実験：ライフはさらに減らない")
}

console.log("=== BS08雷帝竜騎レイブリッツ：activated(timing:main)＋keywordFilter+skipTensho ===")
{
    // 2026-08-20：kind:"step"（ステップ開始時に自動発動）から kind:"activated" timing:"main"
    // （メインステップ中の任意発動）へ変更。コストも通常どおり支払う（詳細な検証は part219）
    const bolt = findByEffect(
        (e) =>
            e["kind"] === "activated" &&
            e["timing"] === "main" &&
            (e["action"] as Record<string, unknown> | undefined)?.["skipTensho"] === true,
    )
    const entry = entryOf(bolt, (e) => (e["action"] as Record<string, unknown> | undefined)?.["skipTensho"] === true)
    const level = (entry["levels"] as number[])[0]!
    const keyword = String((entry["action"] as Record<string, unknown>)["keywordFilter"])
    const tenshoCard = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === keyword))!
    const tenshoKeywordEntry = entryOf(tenshoCard, (e) => e["kind"] === "keyword" && e["keyword"] === keyword)
    const minCost = Number(tenshoKeywordEntry["minCost"] ?? 0)
    const bystander = CARDS.find((c) => c.type === "spirit" && c.cardId !== tenshoCard.cardId && (c.cost ?? 0) >= minCost)!

    const s = base("bolt-skiptensho")
    const boltInst = put(s, "p1", bolt.cardId, coresFor(bolt, level))
    const untouched = put(s, "p1", bystander.cardId, coresFor(bystander, 1))
    const coresBefore = untouched.cores
    s.players.p1.hand = [tenshoCard.cardId]
    s.phase = "main"
    s.turnPlayer = "p1"
    s.players.p1.reserve = 30
    const reserveBefore = s.players.p1.reserve
    // ステップ開始時には発動しない（任意発動になった）
    fireStepTriggers(s, "main")
    assert(s.players.p1.hand.length === 1, "メインステップの開始では自動発動しない")
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: boltInst.instanceId, effectId: String(entry["id"]) }) === null,
        `${bolt.name}の効果をメインステップ中に発動できる`,
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === tenshoCard.cardId),
        `${tenshoCard.name}を召喚できる`,
    )
    assert(s.players.p1.hand.length === 0, "手札から使用される")
    assert(s.players.p1.reserve < reserveBefore, "召喚コストを支払っている（コストを支払わない召喚ではない）")
    assert(untouched.cores === coresBefore, "【転召】させずに召喚するため、他の自分のスピリットは犠牲にならない")
}

console.log("=== BS08ドラゴンスクランブル：lendSelfThisTurn＋destroyAll.drawPerDestroyed ===")
{
    const scramble = findByEffect(
        (e) => e["kind"] === "fieldEvent" && e["event"] === "anySpiritAttacked" && (e["action"] as Record<string, unknown> | undefined)?.["drawPerDestroyed"] === true,
    )
    const entry = entryOf(
        scramble,
        (e) => (e["action"] as Record<string, unknown> | undefined)?.["drawPerDestroyed"] === true,
    )
    const families = entry["familyFilter"] as string[]
    const maxBp = (((entry["action"] as Record<string, unknown>)["filter"]) as Record<string, unknown>)["maxBp"] as number
    const attackerCard = CARDS.find((c) => c.type === "spirit" && families.some((f) => (c.family ?? []).includes(f)))!
    const lowBp = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) <= maxBp)!
    const highBp = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) > maxBp)!

    const s = base("scramble")
    const attacker = put(s, "p1", attackerCard.cardId, coresFor(attackerCard, 1))
    put(s, "p2", lowBp.cardId, coresFor(lowBp, 1))
    put(s, "p2", highBp.cardId, coresFor(highBp, 1))
    s.players.p1.hand = [scramble.cardId]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${scramble.name}をメインで使用`)
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "系統一致のスピリットでアタック")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.cardId === lowBp.cardId),
        `BP${maxBp}以下の${lowBp.name}が破壊される`,
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.cardId === highBp.cardId),
        `対照実験：BP${maxBp}を超える${highBp.name}は破壊されない`,
    )
    assert(s.players.p1.hand.length === handBefore + 1, "破壊した数ぶんデッキから1枚ドローする")
}

console.log("=== BS08メテオストーム：grantEffectToTargetThisTurn＋lifeCrush.countCounter ===")
{
    const meteor = findByEffect((e) => e["kind"] === "magic" && (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantEffectToTargetThisTurn")
    const entry = entryOf(meteor, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "grantEffectToTargetThisTurn")
    const grantAction = (entry["action"] as Record<string, unknown>)
    const nameFilter = String(((grantAction["filter"]) as Record<string, unknown>)["nameContains"])
    const targetCard = CARDS.find((c) => c.type === "spirit" && c.name.includes(nameFilter))!
    const symbolCount = (targetCard.symbol ?? []).length

    const s = base("meteor-grant")
    const attacker = put(s, "p1", targetCard.cardId, coresFor(targetCard, 1))
    attacker.tempBpBuff = 999999
    const blocker = put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand = [meteor.cardId]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${meteor.name}をフラッシュで使用`)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手がブロック")
    resolveBattle(s)
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.instanceId === blocker.instanceId),
        "ブロッカーはBP比較で破壊される",
    )
    assert(
        s.players.p2.life === lifeBefore - symbolCount,
        `付与された効果でシンボル数(${symbolCount})ぶん相手のライフが減る（${lifeBefore}→${s.players.p2.life}）`,
    )

    const s2 = base("meteor-nogrant")
    const attacker2 = put(s2, "p1", targetCard.cardId, coresFor(targetCard, 1))
    attacker2.tempBpBuff = 999999
    const blocker2 = put(s2, "p2", FILLER.cardId, 1)
    const lifeBefore2 = s2.players.p2.life
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "アタック宣言（マジックなし）")
    assert(declareBlock(s2, "p2", blocker2.instanceId) === null, "相手がブロック")
    resolveBattle(s2)
    assert(s2.players.p2.life === lifeBefore2, "対照実験：付与しなければブロックされた勝利でライフは減らない")
}

console.log("=== BS08ジャッジメントフレア：magic condition ownSpiritCountAtLeast＋destroyDownToOwnCount ===")
{
    const judgment = findByEffect((e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyDownToOwnCount")

    const s = base("judgment-ok")
    const attacker = put(s, "p1", FILLER.cardId, 1)
    put(s, "p1", FILLER2.cardId, 1)
    for (let i = 0; i < 4; i++) put(s, "p2", FILLER.cardId, 1)
    s.players.p1.hand = [judgment.cardId]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "フラッシュを開くためアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, `${judgment.name}をフラッシュで使用（自分は2体）`)
    assert(
        s.players.p2.field.spirits.length === s.players.p1.field.spirits.length,
        `相手のスピリット数が自分と同じ${s.players.p1.field.spirits.length}体まで破壊される`,
    )

    const s2 = base("judgment-ng")
    const attacker2 = put(s2, "p1", FILLER.cardId, 1)
    for (let i = 0; i < 3; i++) put(s2, "p2", FILLER.cardId, 1)
    s2.players.p1.hand = [judgment.cardId]
    const oppCountBefore = s2.players.p2.field.spirits.length
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: attacker2.instanceId }) === null, "フラッシュを開くためアタック宣言")
    assert(act(s2, "p2", { type: "pass" }) === null, "防御側がパスして優先権が攻撃側へ")
    assert(act(s2, "p1", { type: "castMagic", handIndex: 0 }) === null, `${judgment.name}をフラッシュで使用（自分は1体のみ）`)
    assert(
        s2.players.p2.field.spirits.length === oppCountBefore,
        "対照実験：自分のスピリットが2体未満なら発動しない",
    )
}

console.log("=== BS08魔帝龍騎ダーク・クリムゾン：revealAndSummonAllByFamily ===")
{
    const crimson = findByEffect((e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "revealAndSummonAllByFamily")
    const entry = entryOf(crimson, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "revealAndSummonAllByFamily")
    const revealAction = entry["action"] as Record<string, unknown>
    const count = Number(revealAction["count"])
    const families = revealAction["familyFilter"] as string[]
    const matchCard = CARDS.find((c) => c.type === "spirit" && c.cardId !== crimson.cardId && families.some((f) => (c.family ?? []).includes(f)))!
    const nonMatchCard = FILLER

    const s = base("crimson-reveal")
    const top: string[] = [matchCard.cardId]
    for (let i = 1; i < count; i++) top.push(nonMatchCard.cardId)
    s.players.p1.deck = [...top, ...s.players.p1.deck]
    s.players.p1.hand = [crimson.cardId]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, `${crimson.name}を召喚（デッキ上${count}枚を公開）`)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === matchCard.cardId),
        `系統一致の${matchCard.name}がコストを支払わず召喚される`,
    )
    const trashedNonMatch = s.players.p1.trashCards.filter((id) => id === nonMatchCard.cardId).length
    assert(trashedNonMatch === count - 1, "対照実験：系統不一致のカードはすべてトラッシュへ破棄される")
}

console.log("=== BS08魔帝龍騎ダーク・クリムゾン：destroyPer（EffectCounter { ownFamily }） ===")
{
    const crimson = findByEffect((e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyPer")
    const entry = entryOf(crimson, (e) => (e["action"] as Record<string, unknown> | undefined)?.["type"] === "destroyPer")
    const level = (entry["levels"] as number[])[0]!
    const destroyAction = entry["action"] as Record<string, unknown>
    const family = String((destroyAction["counter"] as Record<string, unknown>)["ownFamily"])
    const maxBp = ((destroyAction["filter"] as Record<string, unknown>)["maxBp"]) as number
    const extraFamilyMember = CARDS.find((c) => c.type === "spirit" && c.cardId !== crimson.cardId && (c.family ?? []).includes(family))!
    const lowBp1 = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) <= maxBp)!
    const lowBp2 = CARDS.find((c) => c.type === "spirit" && c.cardId !== lowBp1.cardId && bpAt(c, 1) <= maxBp)!
    const highBp = CARDS.find((c) => c.type === "spirit" && bpAt(c, 1) > maxBp)!

    const s = base("crimson-destroyper")
    const crimsonInst = put(s, "p1", crimson.cardId, coresFor(crimson, level))
    put(s, "p1", extraFamilyMember.cardId, coresFor(extraFamilyMember, 1))
    put(s, "p2", lowBp1.cardId, coresFor(lowBp1, 1))
    put(s, "p2", lowBp2.cardId, coresFor(lowBp2, 1))
    put(s, "p2", highBp.cardId, coresFor(highBp, 1))
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: crimsonInst.instanceId }) === null, "アタック宣言")
    assert(
        !s.players.p2.field.spirits.some((sp) => sp.cardId === lowBp1.cardId) &&
            !s.players.p2.field.spirits.some((sp) => sp.cardId === lowBp2.cardId),
        `系統「${family}」を持つ自分のスピリット2体につき、BP${maxBp}以下の相手を2体破壊する`,
    )
    assert(
        s.players.p2.field.spirits.some((sp) => sp.cardId === highBp.cardId),
        `対照実験：BP${maxBp}を超える${highBp.name}は破壊されない`,
    )
}
