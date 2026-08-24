// smoke パート149（第八弾「戦嵐」青15枚＋多色1枚：新規エンジン拡張の経路確認）
//
// BS08の青バッチ取り込みで追加したエンジン拡張を、実カードデータの記述経由で1回ずつ通す。
// 「型とハンドラは書いたが、カードデータの書き方（引数名・レベル指定）を一度も通していない」
// 状態を作らないためのパート:
//   globalConstraint"noDrawOutsideDrawStep"（BS08豚人チョウハッカイ）／
//   globalConstraint"summonLimitByCostForOpponent"（BS08夢想法師サンゾール）／
//   aura.condition{opponentHandAtLeast}（BS08ブラックウガルルムLv2）／
//   triggered.condition{opponentHandAtLeast}（BS08ボクルガー）／
//   kind"symbolFix"（BS08海底に眠りし古代都市Lv2）／
//   action"costBuffThisTurn"（BS08グロウアップ）／
//   action"destroyAll".voidCoreToSelfPerDestroyed（X003D極帝龍騎ジーク・クリムゾン）／
//   kind"funsaiBonus".amountPerSymbolColor（BS08神造巨兵オリハルコン・ゴレム）／
//   action"deckReveal".countPer{ownNexuses}（BS08古将ドグウ・ゴレム）／
//   kind"keywordGrant".count＋kind"effectGrant"での【強襲】付与（BS08キマイラアサルト）
import {
    act,
    assert,
    createGame,
    createInstance,
    draw,
    effectiveBp,
    endTurn,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import {
    continuousKeywordGrantCount,
    dumpAllCoresTensho,
    fireSummonTrigger,
    fireTrigger,
    resolveFunsai,
} from "../../server/src/logic/EffectModules"
import { validateSummon } from "../../server/src/logic/RuleValidator"
import { countSymbols, instanceSymbolCount, instBaseCost, instHasCost, instMatchesCostFilter } from "../../shared/rules"
import type { Color, EffectAction } from "../../server/src/type"

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
function actionOf(e: Record<string, unknown>): Record<string, unknown> {
    return e["action"] as Record<string, unknown>
}
function coresFor(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.cores ?? 1
}
function bpAt(c: CardRow, level: number): number {
    return c.levels?.[level - 1]?.bp ?? 0
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
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

// 効果を持たない素材カード（テストの副作用を避ける）
const VANILLA = CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0)!
const PLAIN_NEXUS = CARDS.find(
    (c) =>
        c.type === "nexus" &&
        // 効果を持たないネクサスは存在しないので、**盤面に干渉する kind を持たない**もので代用する
        !(c.effects ?? []).some((e) =>
            ["fieldEvent", "globalConstraint", "step", "triggered", "onMilledFromDeck", "constraintGrant"].includes(
                String(e["kind"]),
            ),
        ),
)!

console.log("=== BS08豚人チョウハッカイ：globalConstraint noDrawOutsideDrawStep（ドローの共通経路で判定） ===")
{
    const choha = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "noDrawOutsideDrawStep",
    )
    const s = base("no-draw-outside")
    put(s, "p1", choha.cardId, coresFor(choha, 1))

    const ownBefore = s.players.p1.hand.length
    draw(s, "p1", 1)
    assert(s.players.p1.hand.length === ownBefore, "効果によるドローは無効化される（発生源の持ち主も対象）")
    draw(s, "p1", 1, true)
    assert(s.players.p1.hand.length === ownBefore + 1, "ドローステップのドローは通る（fromDrawStep）")

    const oppBefore = s.players.p2.hand.length
    draw(s, "p2", 1)
    assert(s.players.p2.hand.length === oppBefore, "「お互い」なので相手の効果ドローも止まる")
}

console.log("=== BS08夢想法師サンゾール：globalConstraint summonLimitByCostForOpponent（相手のコストX以下はターンにN体まで） ===")
{
    const sanzo = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "summonLimitByCostForOpponent",
    )
    const entry = entryOf(
        sanzo,
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "summonLimitByCostForOpponent",
    )
    const constraint = entry["constraint"] as Record<string, unknown>
    const maxCost = Number(constraint["maxCost"])
    const limit = Number(constraint["limit"])
    const activeLevel = (entry["levels"] as number[])[0]!
    const cheap = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 99) <= maxCost && (c.effects ?? []).length === 0,
    )!
    const heavy = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 0) > maxCost && (c.effects ?? []).length === 0,
    )!

    const s = base("summon-limit")
    put(s, "p2", sanzo.cardId, coresFor(sanzo, activeLevel)) // 制約の発生源は**相手側**にいる
    s.players.p1.hand.push(cheap.cardId)
    const cheapIndex = s.players.p1.hand.length - 1
    assert(validateSummon(s, "p1", cheapIndex) === null, `${limit}体目までは召喚できる`)

    // 上限ぶんこのターンに召喚済みの状態を作る（CardInstance.summonedTurn で数える）
    for (let i = 0; i < limit; i++) put(s, "p1", cheap.cardId, coresFor(cheap, 1))
    assert(validateSummon(s, "p1", cheapIndex) !== null, "上限に達したらコスト条件内の召喚は拒否される")

    s.players.p1.hand.push(heavy.cardId)
    assert(
        validateSummon(s, "p1", s.players.p1.hand.length - 1) === null,
        "コスト条件を超えるスピリットは制限を受けない",
    )

    // 発生源がレベル不足なら制限しない
    const s2 = base("summon-limit-lv1")
    put(s2, "p2", sanzo.cardId, coresFor(sanzo, 1))
    for (let i = 0; i < limit; i++) put(s2, "p1", cheap.cardId, coresFor(cheap, 1))
    s2.players.p1.hand.push(cheap.cardId)
    assert(
        validateSummon(s2, "p1", s2.players.p1.hand.length - 1) === null,
        "発生源のLvが有効レベル未満なら制限は働かない",
    )
}

console.log("=== BS08ブラックウガルルムLv2：aura.condition{opponentHandAtLeast}（相手の手札枚数を見るオーラ） ===")
{
    const uga = findByEffect(
        (e) =>
            e["kind"] === "aura" &&
            ((e["aura"] as Record<string, unknown>)["condition"] as Record<string, unknown> | undefined)?.[
                "opponentHandAtLeast"
            ] !== undefined,
    )
    const entry = entryOf(uga, (e) => e["kind"] === "aura")
    const aura = entry["aura"] as Record<string, unknown>
    const need = Number((aura["condition"] as Record<string, unknown>)["opponentHandAtLeast"])
    const amount = Number(aura["amount"])
    const phaseTurn = aura["phaseTurn"] as Record<string, string>
    const activeLevel = (entry["levels"] as number[])[0]!

    const s = base("aura-opponent-hand")
    put(s, "p1", uga.cardId, coresFor(uga, activeLevel))
    const ally = put(s, "p1", VANILLA.cardId, coresFor(VANILLA, 1))
    // 『相手のアタックステップ』＝発生源の持ち主(p1)が非turnPlayerのとき
    s.turnPlayer = "p2"
    s.phase = phaseTurn["phase"] as GameState["phase"]

    s.players.p2.hand = new Array<string>(need).fill(VANILLA.cardId)
    assert(
        effectiveBp(s, "p1", ally) === bpAt(VANILLA, 1) + amount,
        `相手の手札が${need}枚以上ならBP+${amount}`,
    )
    s.players.p2.hand = new Array<string>(need - 1).fill(VANILLA.cardId)
    assert(effectiveBp(s, "p1", ally) === bpAt(VANILLA, 1), "1枚足りなければ適用されない")

    s.players.p2.hand = new Array<string>(need).fill(VANILLA.cardId)
    s.turnPlayer = "p1"
    assert(effectiveBp(s, "p1", ally) === bpAt(VANILLA, 1), "自分のターンでは適用されない（phaseTurn.turn=opponent）")
}

console.log("=== BS08ボクルガー：triggered.condition{opponentHandAtLeast}＋discardOpponentDownTo ===")
{
    const bokuru = findByEffect(
        (e) =>
            e["kind"] === "triggered" &&
            (e["condition"] as Record<string, unknown> | undefined)?.["opponentHandAtLeast"] !== undefined,
    )
    const entry = entryOf(bokuru, (e) => e["kind"] === "triggered")
    const need = Number((entry["condition"] as Record<string, unknown>)["opponentHandAtLeast"])
    const limit = Number(actionOf(entry)["limit"])

    const s = base("bokurga-fires")
    const self = put(s, "p1", bokuru.cardId, coresFor(bokuru, 1))
    s.players.p2.hand = new Array<string>(need).fill(VANILLA.cardId)
    fireSummonTrigger(s, "p1", self)
    assert(s.players.p2.hand.length === limit, `相手の手札が${need}枚以上なら${limit}枚まで破棄される`)

    const s2 = base("bokurga-silent")
    const self2 = put(s2, "p1", bokuru.cardId, coresFor(bokuru, 1))
    s2.players.p2.hand = new Array<string>(need - 1).fill(VANILLA.cardId)
    fireSummonTrigger(s2, "p1", self2)
    assert(s2.players.p2.hand.length === need - 1, "条件未満なら誘発そのものが発火しない")
}

console.log("=== BS08海底に眠りし古代都市Lv2：kind symbolFix（シンボル数の固定はコスト軽減にも効く） ===")
{
    const city = findByEffect((e) => e["kind"] === "symbolFix")
    const entry = entryOf(city, (e) => e["kind"] === "symbolFix")
    const family = String(entry["familyFilter"])
    const fixed = Number(entry["count"])
    const activeLevel = (entry["levels"] as number[])[0]!
    const target = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.symbol ?? []).length === 1,
    )!
    const targetColor = target.symbol![0] as Color

    const s = base("symbol-fix")
    const inst = put(s, "p1", target.cardId, coresFor(target, 1))
    assert(instanceSymbolCount(inst) === 1, "固定前はカード静的なシンボル数（1つ）")
    const beforeCount = countSymbols(s.players.p1, [targetColor])

    const nexus = putNexus(s, "p1", city.cardId, coresFor(city, activeLevel))
    assert(instanceSymbolCount(inst) === fixed, `対象系統のシンボルが${fixed}つに固定される`)
    const nexusOwnSymbols = (city.symbol ?? []).filter((c) => c === targetColor).length
    assert(
        countSymbols(s.players.p1, [targetColor]) === beforeCount - 1 + fixed + nexusOwnSymbols,
        "軽減計算に使う countSymbols も固定後のシンボルで数える",
    )

    // 発生源が場を離れれば元に戻る（継続効果なので毎回再計算される）
    s.players.p1.field.nexuses = s.players.p1.field.nexuses.filter((n) => n.instanceId !== nexus.instanceId)
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(inst) === 1, "発生源が離れると固定は解除される")
}

console.log("=== BS08グロウアップ：action costBuffThisTurn（このターンの間コスト+N。置き換え） ===")
{
    const growup = findByEffect((e) => actionOf(e)?.["type"] === "costBuffThisTurn")
    const entry = entryOf(growup, (e) => actionOf(e)?.["type"] === "costBuffThisTurn")
    const amount = Number(actionOf(entry)["amount"])

    // 実カードを手札からメインで使用する（resolveAction を直接叩くと、カードデータ側の
    // timing・引数の書き方を一度も通さないまま緑になるため。2026-08-09 の実行時カバレッジ由来）
    const s = base("grow-up")
    const target = put(s, "p1", VANILLA.cardId, coresFor(VANILLA, 1))
    const baseCost = VANILLA.cost ?? 0
    s.players.p1.hand.push(growup.cardId)
    assert(
        act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null,
        `${growup.name}をメインで使用`,
    )
    assert(instHasCost(target, baseCost + amount), `コスト${baseCost + amount}になる`)
    // **「〜としても扱う」ではなく増減**。元のコストは残らないので、
    // 相手の「コスト◯以下を破壊」のような効果はもう届かない（2026-08-24 ユーザー確認）
    assert(!instHasCost(target, baseCost), "元のコストは残らない（置き換え）")
    assert(instBaseCost(target) === baseCost + amount, "instBaseCost も増減後の値を返す")
    assert(
        !instMatchesCostFilter(target, { max: baseCost }),
        "コスト範囲の判定も増減後で見る（元のコスト以下には当たらない）",
    )
}

console.log("=== BS08グロウアップ：コストの増減はターン終了でリセットされる ===")
{
    const growup = findByEffect((e) => actionOf(e)?.["type"] === "costBuffThisTurn")
    const amount = Number(actionOf(entryOf(growup, (e) => actionOf(e)?.["type"] === "costBuffThisTurn"))["amount"])
    const s = base("grow-up-reset")
    const target = put(s, "p1", VANILLA.cardId, coresFor(VANILLA, 1))
    const baseCost = VANILLA.cost ?? 0
    s.players.p1.hand.push(growup.cardId)
    assert(act(s, "p1", { type: "castMagic", handIndex: s.players.p1.hand.length - 1 }) === null, "使用")
    assert(instBaseCost(target) === baseCost + amount, "このターンは増減後")
    endTurn(s)
    assert(instBaseCost(target) === baseCost, `ターンが終われば元のコストに戻る（実際は${instBaseCost(target)}）`)
}

console.log("=== X003D極帝龍騎ジーク・クリムゾン：destroyAll.voidCoreToSelfPerDestroyed（破壊数ぶん自身にコア） ===")
{
    const zeek = findByEffect((e) => actionOf(e)?.["voidCoreToSelfPerDestroyed"] === true)
    const entry = entryOf(zeek, (e) => actionOf(e)?.["voidCoreToSelfPerDestroyed"] === true)
    const maxBp = Number((actionOf(entry)["filter"] as Record<string, unknown>)["maxBp"])
    const weak = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && bpAt(c, 1) <= maxBp,
    )!

    const s = base("zeek-crimson")
    const self = put(s, "p1", zeek.cardId, coresFor(zeek, 1))
    assert(bpAt(zeek, 1) > maxBp, "自身はBP条件から外れる（anySideでも巻き込まれない）")
    put(s, "p2", weak.cardId, coresFor(weak, 1))
    put(s, "p2", weak.cardId, coresFor(weak, 1))
    const coresBefore = self.cores
    fireSummonTrigger(s, "p1", self)
    assert(s.players.p2.field.spirits.length === 0, `BP${maxBp}以下のスピリットがすべて破壊される`)
    assert(self.cores === coresBefore + 2, "実際に破壊できた数ぶん、ボイドからコアが自身に乗る")

    // 1体も破壊できなければコアは増えない
    const s2 = base("zeek-crimson-none")
    const self2 = put(s2, "p1", zeek.cardId, coresFor(zeek, 1))
    const cores2 = self2.cores
    fireSummonTrigger(s2, "p1", self2)
    assert(self2.cores === cores2, "破壊0体ならコアは置かれない")
}

console.log("=== BS08神造巨兵オリハルコン・ゴレム：funsaiBonus.amountPerSymbolColor（青シンボル数ぶん破棄枚数+） ===")
{
    const golem = findByEffect((e) => e["kind"] === "funsaiBonus" && e["amountPerSymbolColor"] !== undefined)
    const entry = entryOf(golem, (e) => e["kind"] === "funsaiBonus")
    const color = String(entry["amountPerSymbolColor"]) as Color

    const s = base("orihalcon-golem")
    const self = put(s, "p1", golem.cardId, coresFor(golem, 1))
    s.players.p2.deck = new Array<string>(30).fill(VANILLA.cardId)

    const before = s.players.p2.trashCards.length
    const symbols = countSymbols(s.players.p1, [color])
    resolveFunsai(s, "p1", self)
    assert(
        s.players.p2.trashCards.length - before === 1 + symbols,
        `Lv1 + 自分の${color}シンボル${symbols}個ぶん破棄する`,
    )

    // 盤面のシンボルが増えれば破棄枚数も増える（固定値ではなく毎回再計算される）
    const sameColor = CARDS.find(
        (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && (c.symbol ?? []).includes(color),
    )!
    put(s, "p1", sameColor.cardId, coresFor(sameColor, 1))
    const before2 = s.players.p2.trashCards.length
    const symbols2 = countSymbols(s.players.p1, [color])
    assert(symbols2 > symbols, "シンボル数が増えている前提")
    resolveFunsai(s, "p1", self)
    assert(s.players.p2.trashCards.length - before2 === 1 + symbols2, "増えたシンボル数が破棄枚数に反映される")
}

console.log("=== BS08古将ドグウ・ゴレム：deckReveal.countPer{ownNexuses}（自分のネクサス数ぶんオープン） ===")
{
    const dogu = findByEffect(
        (e) => (actionOf(e)?.["countPer"] as Record<string, unknown> | undefined)?.["ownNexuses"] === true,
    )
    const entry = entryOf(
        dogu,
        (e) => (actionOf(e)?.["countPer"] as Record<string, unknown> | undefined)?.["ownNexuses"] === true,
    )
    const families = actionOf(entry)["familyFilter"] as string[]
    const pick = CARDS.find(
        (c) => c.type === "spirit" && families.some((f) => (c.family ?? []).includes(f)),
    )!
    assert(!families.some((f) => (VANILLA.family ?? []).includes(f)), "素材カードは対象系統を持たない前提")

    // ネクサス2つ＝デッキ上2枚をオープン。2枚目に該当スピリットを仕込む
    const s = base("dogu-golem")
    const self = put(s, "p1", dogu.cardId, coresFor(dogu, 1))
    putNexus(s, "p1", PLAIN_NEXUS.cardId, 0)
    putNexus(s, "p1", PLAIN_NEXUS.cardId, 0)
    s.players.p1.deck = [VANILLA.cardId, pick.cardId, ...s.players.p1.deck]
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", self, actionOf(entry) as unknown as EffectAction)
    assert(s.players.p1.hand.length === handBefore + 1, "該当スピリットが1枚手札に加わる")
    assert(s.players.p1.hand[s.players.p1.hand.length - 1] === pick.cardId, "加わったのは対象系統のスピリット")

    // ネクサス1つなら1枚しかオープンしないので、2枚目の該当カードには届かない
    const s2 = base("dogu-golem-one-nexus")
    const self2 = put(s2, "p1", dogu.cardId, coresFor(dogu, 1))
    putNexus(s2, "p1", PLAIN_NEXUS.cardId, 0)
    s2.players.p1.deck = [VANILLA.cardId, pick.cardId, ...s2.players.p1.deck]
    const handBefore2 = s2.players.p1.hand.length
    resolveAction(s2, "p1", self2, actionOf(entry) as unknown as EffectAction)
    assert(s2.players.p1.hand.length === handBefore2, "ネクサス数ぶんしかオープンしない（1枚では届かない）")
}

console.log("=== BS08キマイラアサルト：keywordGrant.count＋effectGrantで【強襲：1】を貸与する ===")
{
    const kimaira = findByEffect(
        (e) => e["kind"] === "keywordGrant" && e["keyword"] === "kyoshu" && e["lentOnly"] === true,
    )
    const grant = entryOf(kimaira, (e) => e["kind"] === "keywordGrant")
    const family = String(grant["familyFilter"])
    const grantCount = Number(grant["count"])
    const target = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes(family) && (c.effects ?? []).length === 0,
    ) ?? CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes(family))!

    const s = base("kimaira-assault")
    const inst = put(s, "p1", target.cardId, coresFor(target, 1))
    const nexus = putNexus(s, "p1", PLAIN_NEXUS.cardId, 0)
    inst.isRested = true

    assert(
        continuousKeywordGrantCount(s, "p1", inst, "kyoshu") === 0,
        "マジックを使う前は【強襲】を持たない",
    )
    fireTrigger(s, "p1", inst, "onAttack")
    assert(inst.isRested, "付与前はアタック時に回復しない")

    // マジック自身を仮想発生源として貸し出す（lentOnly の2エントリがここで効き始める）
    resolveAction(
        s,
        "p1",
        null,
        { type: "lendSelfThisTurn" },
        undefined,
        (kimaira.colors ?? ["blue"]) as Color[],
        "magic",
        undefined,
        undefined,
        kimaira.cardId,
    )
    refreshLevelAsOverrides(s)
    assert(
        continuousKeywordGrantCount(s, "p1", inst, "kyoshu") === grantCount,
        `対象系統に【強襲：${grantCount}】が継続付与される`,
    )

    fireTrigger(s, "p1", inst, "onAttack")
    assert(!inst.isRested, "付与された誘発（effectGrant）でアタック時に回復する")
    assert(nexus.isRested, "回復のコストとして自分のネクサスが疲労する")

    // ターン上限は付与された count ぶん。2回目は疲労できるネクサスも無いので回復しない
    inst.isRested = true
    fireTrigger(s, "p1", inst, "onAttack")
    assert(inst.isRested, `ターン中の回復回数は付与された${grantCount}回まで`)
}

console.log("=== BS08ブラックウガルルムLv1-2：constraint tenshoCoreSubstitute（疲労でコア支払いを代替する） ===")
{
    // 2026-08-09 の実行時カバレッジで「この制約は全カードで一度も適用されていない」と出た。
    // 実装（EffectModules.dumpAllCoresTensho）は揃っていて、テストだけが無かった箇所
    const uga = findByEffect(
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "tenshoCoreSubstitute",
    )
    const entry = entryOf(
        uga,
        (e) => (e["constraint"] as Record<string, unknown> | undefined)?.["type"] === "tenshoCoreSubstitute",
    )
    const activeLevel = (entry["levels"] as number[])[0]!

    // 回復状態なら、コアを失う代わりに疲労する（非対話モードはコアを維持する側を自動で選ぶ）
    const s = base("tensho-core-substitute")
    const inst = put(s, "p1", uga.cardId, coresFor(uga, activeLevel))
    const coresBefore = inst.cores
    const trashBefore = s.players.p1.trashCores
    dumpAllCoresTensho(s, "p1", inst, "trash")
    assert(inst.cores === coresBefore, "【転召】の対象になってもコアを失わない")
    assert(inst.isRested, "代わりに疲労する")
    assert(s.players.p1.trashCores === trashBefore, "トラッシュにコアは移らない")

    // すでに疲労している個体は代替できないので、通常どおりコアがトラッシュへ移る
    const s2 = base("tensho-core-substitute-already-rested")
    const inst2 = put(s2, "p1", uga.cardId, coresFor(uga, activeLevel))
    inst2.isRested = true
    const cores2 = inst2.cores
    const trash2 = s2.players.p1.trashCores
    dumpAllCoresTensho(s2, "p1", inst2, "trash")
    assert(s2.players.p1.trashCores === trash2 + cores2, "疲労済みなら通常どおりコアがトラッシュへ置かれる")
}
