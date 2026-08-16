// smoke パート204（SD02 段階2・重い8種）
//
// 実装前にユーザーへ確認して確定した解釈は docs/design/SD02_PLAN.md §1:
//   - 013 転召の祭壇 Lv2 の「コスト+3」は、**生贄にできる対象を広げる**（召喚コストは上がらない）
//   - 012 天の城門 Lv1 は、シンボル数に関係なく**そのアタック分を丸ごと防ぐ**
//   - 009 クジャルタが手札に戻るとき、上のコアは**リザーブ**へ（指定場所には行かない）
//   - 007 バーナルドの「疲労状態で」の主語は**このスピリット**（自分が疲労中でもブロックできる）
//   - 014 魔法監視塔 Lv2 は、無効にしたら**必ず**デッキの下へ戻る
import { act, assert, createGame, createInstance, currentLevel, declareBlock, destroyNexus, effectiveBp, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { effectiveCost } from "../../shared/cost"
import { instHasCost } from "../../shared/rules"
import { dumpAllCoresTensho } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers, fireTrigger } from "../../server/src/logic/triggers"
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
    levels?: { cores: number; bp: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const byId = (id: string): CardRow => {
    const c = CARDS.find((x) => x.cardId === id)
    if (!c) throw new Error(`カードが見つかりません: ${id}`)
    return c
}
const coresFor = (c: CardRow, level: number): number => c.levels?.[level - 1]?.cores ?? 1

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "yellow" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardRow, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function check(id: string, name: string, color: string, type: string): CardRow {
    const c = byId(id)
    assert(c.name === name, `${id} は「${name}」`)
    assert((c.colors ?? []).includes(color), `${id} は${color}`)
    assert(c.type === type, `${id} は${type}`)
    return c
}
function vanillaCost(cost: number): CardRow {
    const c = CARDS.find((x) => x.type === "spirit" && (x.effects?.length ?? 0) === 0 && x.cost === cost)
    if (!c) throw new Error(`コスト${cost}のバニラスピリットが見つかりません`)
    return c
}
// 【転召】を静的に持つスピリットカード（相手役・自分役として使う）
function tenshoCard(): CardRow {
    const c = CARDS.find((x) =>
        x.type === "spirit" && (x.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "tensho"),
    )
    if (!c) throw new Error("【転召】持ちが見つかりません")
    return c
}

console.log("=== パート204：SD02 段階2（8種） ===")

const HAKUTAKU = check("SD02-004", "神獣ハクタク", "yellow", "spirit")
const HELVIM = check("SD02-005", "天使ヘルヴィム", "yellow", "spirit")
const BARNARD = check("SD02-007", "犬兵バーナルド", "blue", "spirit")
const KUJARTA = check("SD02-009", "獣将軍クジャルタ", "blue", "spirit")
const BAHAMUND = check("SD02-011", "獣皇子バハムンド", "blue", "spirit")
const GATE = check("SD02-012", "天の城門", "yellow", "nexus")
const ALTAR = check("SD02-013", "転召の祭壇", "blue", "nexus")
const TOWER = check("SD02-014", "魔法監視塔", "blue", "nexus")

console.log("--- SD02-004 神獣ハクタク：系統を選び、その系統の自分のスピリット数ぶん引く ---")
{
    const s = base("hakutaku-draw")
    // ハクタク自身が系統「想獣」を持つので、自分も数に入る
    assert((HAKUTAKU.family ?? []).includes("想獣"), "前提：ハクタクは系統「想獣」を持つ")
    const self = put(s, "p1", HAKUTAKU, coresFor(HAKUTAKU, 1))
    const sameFamily = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes("想獣") && c.cardId !== HAKUTAKU.cardId,
    )!
    put(s, "p1", sameFamily, coresFor(sameFamily, 1))
    const handBefore = s.players.p1.hand.length
    fireTrigger(s, "p1", self, "onSummon")
    assert(
        s.players.p1.hand.length === handBefore + 2,
        `想獣2体（自身を含む）ぶん引く（${handBefore}→${s.players.p1.hand.length}）`,
    )
}
{
    // Lv2-3：コスト4以下の相手にブロックされたとき、【転召】を持つ自分のスピリット1体を回復
    const tensho = tenshoCard()
    const s = base("hakutaku-refresh")
    s.phase = "attack"
    putNexus(s, "p1", HAKUTAKU as never, 0) // 置き場所を間違えないよう、ここでは使わない
    s.players.p1.field.nexuses = []
    const source = put(s, "p1", HAKUTAKU, coresFor(HAKUTAKU, 2))
    const ally = put(s, "p1", tensho, coresFor(tensho, 1))
    ally.isRested = true
    const attacker = put(s, "p1", vanillaCost(1), 1)
    const blocker = put(s, "p2", vanillaCost(4), 1)
    refreshLevelAsOverrides(s)
    assert(currentLevel(source).level >= 2, "前提：ハクタクはLv2以上")
    fireFieldEventTriggers(s, "p1", "ownSpiritBlocked", { pid: "p1", inst: attacker }, undefined, blocker.instanceId)
    assert(!ally.isRested, "コスト4以下にブロックされたので【転召】持ちが回復する")
}
{
    // コスト5以上にブロックされたときは発揮しない
    const tensho = tenshoCard()
    const s = base("hakutaku-refresh-high")
    s.phase = "attack"
    put(s, "p1", HAKUTAKU, coresFor(HAKUTAKU, 2))
    const ally = put(s, "p1", tensho, coresFor(tensho, 1))
    ally.isRested = true
    const attacker = put(s, "p1", vanillaCost(1), 1)
    const blocker = put(s, "p2", vanillaCost(5), 1)
    fireFieldEventTriggers(s, "p1", "ownSpiritBlocked", { pid: "p1", inst: attacker }, undefined, blocker.instanceId)
    assert(ally.isRested, "コスト5以上にブロックされたときは回復しない")
}

console.log("--- SD02-005 天使ヘルヴィム：黄シンボル数ぶん公開し、マジック1枚を手札へ ---")
{
    const s = base("helvim")
    const self = put(s, "p1", HELVIM, coresFor(HELVIM, 1))
    // ヘルヴィム自身の黄シンボルぶんだけ公開される。デッキの一番上にマジックを仕込む
    const magic = CARDS.find((c) => c.type === "magic")!
    s.players.p1.deck.unshift(magic.cardId)
    const symbols = (HELVIM.symbol ?? []).filter((c) => c === "yellow").length
    assert(symbols >= 1, `前提：ヘルヴィムは黄シンボルを持つ（${symbols}）`)
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", self, "onSummon")
    assert(s.players.p1.hand.length === handBefore + 1, "マジック1枚が手札に加わる")
    assert(s.players.p1.hand.includes(magic.cardId), "加わったのは仕込んだマジック")
    assert(s.players.p1.deck.length === deckBefore - 1, "公開したぶんはデッキから抜け、残りは下に戻る")
}
{
    // Lv2-3：【光芒】を持つ自分のスピリットをブロックしている相手はLv1として扱う
    const kobo = CARDS.find(
        (c) =>
            c.type === "spirit" &&
            (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "kobo"),
    )!
    const s = base("helvim-levelas")
    s.phase = "attack"
    put(s, "p1", HELVIM, coresFor(HELVIM, 2))
    const attacker = put(s, "p1", kobo, coresFor(kobo, 3))
    const blockerCard = vanillaCost(3)
    const blocker = put(s, "p2", blockerCard, coresFor(blockerCard, 2))
    refreshLevelAsOverrides(s)
    assert(currentLevel(blocker).level >= 2, "前提：ブロッカーはLv2以上")
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: blocker.instanceId } as never
    refreshLevelAsOverrides(s)
    assert(currentLevel(blocker).level === 1, "【光芒】持ちをブロックしている相手はLv1として扱われる")
}

console.log("--- SD02-007 犬兵バーナルド：疲労中でもコスト3以下ならブロックできる ---")
{
    const s = base("barnard-low")
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", vanillaCost(3), 1)
    const blocker = put(s, "p1", BARNARD, coresFor(BARNARD, 1))
    blocker.isRested = true
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "疲労中でもコスト3以下をブロックできる")
}
{
    const s = base("barnard-high")
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", vanillaCost(5), 1)
    const blocker = put(s, "p1", BARNARD, coresFor(BARNARD, 1))
    blocker.isRested = true
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p1", blocker.instanceId) !== null, "コスト4以上には疲労中はブロックできない")
}

console.log("--- SD02-009 獣将軍クジャルタ：【転召】の身代わりに手札へ戻り、コアはリザーブへ ---")
{
    const s = base("kujarta")
    const self = put(s, "p1", KUJARTA, 3)
    const handBefore = s.players.p1.hand.length
    const reserveBefore = s.players.p1.reserve
    const trashCoresBefore = s.players.p1.trashCores
    dumpAllCoresTensho(s, "p1", self, "trash")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === self.instanceId),
        "場を離れる",
    )
    assert(s.players.p1.hand.length === handBefore + 1, "手札に戻る")
    assert(s.players.p1.reserve === reserveBefore + 3, `上のコア3個はリザーブへ（${reserveBefore}→${s.players.p1.reserve}）`)
    assert(s.players.p1.trashCores === trashCoresBefore, "指定場所（トラッシュ）にはコアが行かない")
}
{
    // Lv2：このスピリットと【転召】持ちに「バトル時BP+2000」を与える
    const tensho = tenshoCard()
    const s = base("kujarta-buff")
    const self = put(s, "p1", KUJARTA, coresFor(KUJARTA, 2))
    const ally = put(s, "p1", tensho, coresFor(tensho, 1))
    refreshLevelAsOverrides(s)
    assert(currentLevel(self).level === 2, "前提：クジャルタはLv2")
    const selfBase = effectiveBp(s, "p1", self)
    const allyBase = effectiveBp(s, "p1", ally)
    s.battle = { attackerInstanceId: self.instanceId, blockerInstanceId: ally.instanceId } as never
    assert(effectiveBp(s, "p1", self) === selfBase + 2000, "バトル中の自身がBP+2000")
    assert(effectiveBp(s, "p1", ally) === allyBase + 2000, "バトル中の【転召】持ちもBP+2000")
}

console.log("--- SD02-011 獣皇子バハムンド：相手の手札のマジックを破棄／トラッシュの色を封じる ---")
{
    const magic = CARDS.find((c) => c.type === "magic")!
    const spirit = CARDS.find((c) => c.type === "spirit")!
    const s = base("bahamund-discard")
    const self = put(s, "p1", BAHAMUND, coresFor(BAHAMUND, 1))
    s.players.p2.hand = [spirit.cardId, magic.cardId, spirit.cardId]
    fireTrigger(s, "p1", self, "onSummon")
    assert(s.players.p2.hand.length === 2, "相手の手札が1枚減る")
    assert(!s.players.p2.hand.includes(magic.cardId), "破棄されたのはマジックカード")
}
{
    const s = base("bahamund-lock")
    s.phase = "attack"
    put(s, "p1", BAHAMUND, coresFor(BAHAMUND, 2))
    // 相手（p2）のトラッシュに赤のマジックを置くと、赤のマジックが使えなくなる
    const redMagic = CARDS.find((c) => c.type === "magic" && (c.colors ?? []).includes("red"))!
    const otherMagic = CARDS.find(
        (c) => c.type === "magic" && !(c.colors ?? []).includes("red"),
    )!
    s.players.p2.trashCards.push(redMagic.cardId)
    s.players.p2.hand = [redMagic.cardId, otherMagic.cardId]
    s.players.p2.reserve = 20
    s.turnPlayer = "p2"
    const lockedError = act(s, "p2", { type: "castMagic", handIndex: 0 })
    assert(
        lockedError !== null && lockedError.includes("トラッシュ"),
        `トラッシュと同じ色のマジックは使用できない（${lockedError}）`,
    )
    // 対照実験：違う色は**この制限では**止まらない（ステップ違いなど別の理由で弾かれるのは想定内）
    const otherError = act(s, "p2", { type: "castMagic", handIndex: 1 })
    assert(
        otherError === null || !otherError.includes("トラッシュ"),
        `違う色のマジックは色の制限では止まらない（${otherError}）`,
    )
}

console.log("--- SD02-012 天の城門：Lv1のアタックをデッキ破棄で防ぐ ---")
{
    const spirit = CARDS.find((c) => c.type === "spirit" && !(c.effects ?? []).some((e) => e["keyword"] === "tensho"))!
    const s = base("gate-guard")
    s.turnPlayer = "p2"
    putNexus(s, "p1", GATE, coresFor(GATE, 1))
    s.players.p1.deck.unshift(spirit.cardId) // 破棄されるのはスピリットカード＝守れる
    const attackerCard = vanillaCost(1)
    const attacker = put(s, "p2", attackerCard, coresFor(attackerCard, 1))
    refreshLevelAsOverrides(s)
    assert(currentLevel(attacker).level === 1, "前提：アタッカーはLv1")
    const lifeBefore = s.players.p1.life
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    let guard = 0
    while (s.isFlashTiming && guard < 10) {
        guard += 1
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    assert(act(s, "p1", { type: "takeLife" }) === null, "ライフで受ける宣言")
    assert(s.players.p1.life === lifeBefore, "スピリットカードを破棄したのでライフは減らない")
}
{
    // 破棄したカードが【転召】を持っていたら手札に加える
    const tensho = tenshoCard()
    const s = base("gate-tohand")
    s.turnPlayer = "p2"
    putNexus(s, "p1", GATE, coresFor(GATE, 1))
    s.players.p1.deck.unshift(tensho.cardId)
    const attackerCard = vanillaCost(1)
    const attacker = put(s, "p2", attackerCard, coresFor(attackerCard, 1))
    const handBefore = s.players.p1.hand.length
    const lifeBefore = s.players.p1.life
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    let guard = 0
    while (s.isFlashTiming && guard < 10) {
        guard += 1
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    assert(act(s, "p1", { type: "takeLife" }) === null, "ライフで受ける宣言")
    assert(s.players.p1.life === lifeBefore, "スピリットカードなのでライフは減らない")
    assert(s.players.p1.hand.length === handBefore + 1, "【転召】を持っていたので手札に加わる")
}
{
    // 【転召】を持つアタッカーには働かない
    const tensho = tenshoCard()
    const s = base("gate-tensho-attacker")
    s.turnPlayer = "p2"
    putNexus(s, "p1", GATE, coresFor(GATE, 1))
    const deckBefore = s.players.p1.deck.length
    const attacker = put(s, "p2", tensho, coresFor(tensho, 1))
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    let guard = 0
    while (s.isFlashTiming && guard < 10) {
        guard += 1
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    assert(act(s, "p1", { type: "takeLife" }) === null, "ライフで受ける宣言")
    assert(s.players.p1.deck.length === deckBefore, "【転召】持ちのアタックではデッキを破棄しない")
}

console.log("--- SD02-013 転召の祭壇：相手の召喚コスト+1／自分を「コスト+3」として扱う ---")
{
    const s = base("altar-cost")
    putNexus(s, "p1", ALTAR, coresFor(ALTAR, 1))
    const cheapNonTensho = CARDS.find(
        (c) => c.type === "spirit" && (c.cost ?? 9) <= 3 && !(c.effects ?? []).some((e) => e["keyword"] === "tensho"),
    )!
    const before = effectiveCost(s, "p2", byId(cheapNonTensho.cardId) as never)
    s.players.p1.field.nexuses = []
    const without = effectiveCost(s, "p2", byId(cheapNonTensho.cardId) as never)
    putNexus(s, "p1", ALTAR, coresFor(ALTAR, 1))
    const withAltar = effectiveCost(s, "p2", byId(cheapNonTensho.cardId) as never)
    assert(before === withAltar, "同じ盤面なら同じコスト（測り方の確認）")
    assert(withAltar === without + 1, `相手のコスト3以下の召喚が1コスト増える（${without}→${withAltar}）`)
    // 自分（発生源の持ち主）は影響を受けない
    assert(
        effectiveCost(s, "p1", byId(cheapNonTensho.cardId) as never) === without,
        "発生源の持ち主自身は増えない",
    )
}
{
    // Lv2：自分のスピリットを「コスト+3」としても扱う（【転召：コスト3以上】の対象を広げる）
    const s = base("altar-plus")
    putNexus(s, "p1", ALTAR, coresFor(ALTAR, 2))
    const cheap = vanillaCost(0)
    const inst = put(s, "p1", cheap, coresFor(cheap, 1))
    refreshLevelAsOverrides(s)
    assert(instHasCost(inst, 3), "コスト0のスピリットが「コスト3」としても扱われる（0+3）")
    assert(instHasCost(inst, 0), "元のコストも保つ（置換ではなく追加）")
}

console.log("--- SD02-014 魔法監視塔：ネクサスを戻す／マジックを無効にしてデッキの下へ ---")
{
    const otherNexus = CARDS.find((c) => c.type === "nexus" && c.cardId !== TOWER.cardId)!
    const s = base("tower-revive")
    putNexus(s, "p1", TOWER, coresFor(TOWER, 1))
    const victim = putNexus(s, "p1", otherNexus, 2)
    const trashBefore = s.players.p1.trashCores
    const reserveBefore = s.players.p1.reserve
    destroyNexus(s, "p1", victim.instanceId, { sourcePid: "p2", sourceType: "spirit" })
    assert(
        s.players.p1.field.nexuses.some((n) => n.instanceId === victim.instanceId && !n.pendingDestruction),
        "破壊されたネクサスが同じ状態でフィールドに残る",
    )
    assert(victim.cores === 2, "コアもそのまま（同じ状態）")
    assert(s.players.p1.trashCores === trashBefore + 1, "コスト1個はトラッシュへ")
    assert(s.players.p1.reserve === reserveBefore - 1, "コストはリザーブから優先して払う")
}
{
    const s = base("tower-negate")
    s.turnPlayer = "p2"
    const tower = putNexus(s, "p1", TOWER, coresFor(TOWER, 2))
    refreshLevelAsOverrides(s)
    assert(currentLevel(tower).level === 2, "前提：監視塔はLv2")
    const magic = CARDS.find((c) => c.type === "magic" && (c.effects?.length ?? 0) > 0)!
    s.players.p2.hand = [magic.cardId]
    s.players.p2.reserve = 20
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がマジックを使用")
    assert(
        !s.players.p1.field.nexuses.some((n) => n.instanceId === tower.instanceId),
        "無効にしたので監視塔は場を離れる",
    )
    assert(s.players.p1.deck.length === deckBefore + 1, "監視塔はデッキの下に戻る")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === TOWER.cardId, "戻り先はデッキの一番下")
}
