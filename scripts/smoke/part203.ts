// smoke パート203（SD02「轟天のヘヴンズドア」段階1・13種）
//
// SD02 の主題は【転召】で、「【転召】の対象（生贄）になったとき」を引き金にする
// スピリットが5枚入っている（既存の onTenshoTarget トリガーの上に載る）。
// 段階分けと確定した解釈は docs/design/SD02_PLAN.md。
import { act, assert, createGame, createInstance, currentLevel, declareBlock, effectiveBp, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { instHasColor } from "../../shared/rules"
import { fireTrigger } from "../../server/src/logic/triggers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    colors?: string[]
    family?: string[]
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
// ID と名前・色・種別が一致していることを機械検証する（CLAUDE.md「cardId のハードコード注意」）
function check(id: string, name: string, color: string, type: string): CardRow {
    const c = byId(id)
    assert(c.name === name, `${id} は「${name}」`)
    assert((c.colors ?? []).includes(color), `${id} は${color}`)
    assert(c.type === type, `${id} は${type}`)
    return c
}
// 効果を持たない、指定コストのスピリット（相手役に使う）
function vanillaCost(cost: number): CardRow {
    const c = CARDS.find((x) => x.type === "spirit" && (x.effects?.length ?? 0) === 0 && x.cost === cost)
    if (!c) throw new Error(`コスト${cost}のバニラスピリットが見つかりません`)
    return c
}

console.log("=== パート203：SD02 段階1（13種） ===")

const PUSHAN = check("SD02-001", "奇獣プーシャン", "yellow", "spirit")
const MIZAR = check("SD02-002", "ミザール", "yellow", "spirit")
const DUNAMIS = check("SD02-003", "天使デュナミス", "yellow", "spirit")
const WEASEL = check("SD02-006", "鼬の暗殺者ウィゼーブ", "blue", "spirit")
const GRINOS = check("SD02-008", "犀銃士グライノス", "blue", "spirit")
const LOWEN = check("SD02-010", "轟剣士レーヴェン", "blue", "spirit")
const FRIENDLY = check("SD02-015", "フレンドリーパワー", "yellow", "magic")
const WINGBOOTS = check("SD02-016", "ウィングブーツ", "yellow", "magic")
const STRONGDRAW = check("SD02-017", "ストロングドロー", "blue", "magic")
const DRAGRON = check("SD02-018", "猛将ドラグロン", "red", "spirit")
const SCHWALT = check("SD02-019", "黒騎士シュヴァルト", "purple", "spirit")
const JEWELG = check("SD02-020", "虹翼のジュエルグ", "green", "spirit")
const SEIDRILL = check("SD02-021", "獣機セイ・ドリル", "white", "spirit")

console.log("--- SD02-001 奇獣プーシャン：Lv2以上で青としても扱う ---")
{
    const s = base("pushan")
    const lv1 = put(s, "p1", PUSHAN, coresFor(PUSHAN, 1))
    assert(!instHasColor(lv1, "blue"), "Lv1 では青ではない")
    assert(instHasColor(lv1, "yellow"), "元の黄は保つ")

    const lv2 = put(s, "p1", PUSHAN, coresFor(PUSHAN, 2))
    refreshLevelAsOverrides(s)
    assert(currentLevel(lv2).level === 2, "前提：Lv2 になっている")
    assert(instHasColor(lv2, "blue"), "Lv2 では青としても扱う")
    assert(instHasColor(lv2, "yellow"), "黄も保つ（置換ではなく追加）")
}

console.log("--- SD02-002 ミザール：アタックしている相手と同じコストをすべて疲労させる ---")
{
    const s = base("mizar")
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", vanillaCost(2), 1) // コスト2のアタッカー
    const sameCost = put(s, "p2", vanillaCost(2), 1)
    const otherCost = put(s, "p2", vanillaCost(1), 1)
    const mine = put(s, "p1", vanillaCost(2), 1) // 「スピリットすべて」なので自分側も入る
    const blocker = put(s, "p1", MIZAR, coresFor(MIZAR, 1))

    fireTrigger(s, "p1", blocker, "onBlock", undefined, attacker.instanceId)
    assert(sameCost.isRested, "同じコスト（相手側）は疲労する")
    assert(mine.isRested, "同じコスト（自分側）も疲労する（陣営の修飾が無い）")
    assert(!otherCost.isRested, "コストが違うものは疲労しない")
}

console.log("--- SD02-003 天使デュナミス：コスト2以下をブロックしたらアタックステップを終了 ---")
{
    const s = base("dunamis-low")
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", vanillaCost(2), 1)
    const blocker = put(s, "p1", DUNAMIS, coresFor(DUNAMIS, 1))
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "デュナミスでブロック")
    assert(s.endAttackStepAfterBattle, "コスト2以下をブロックしたので、バトル後にアタックステップを終了する")
}
{
    const s = base("dunamis-high")
    s.turnPlayer = "p2"
    const attacker = put(s, "p2", vanillaCost(4), 1)
    const blocker = put(s, "p1", DUNAMIS, coresFor(DUNAMIS, 1))
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "デュナミスでブロック")
    assert(!s.endAttackStepAfterBattle, "コスト3以上ではアタックステップを終了しない")
}

console.log("--- SD02-006 鼬の暗殺者ウィゼーブ：破壊時にトラッシュのネクサスを色不問で配置 ---")
{
    const anyNexus = CARDS.find((c) => c.type === "nexus" && !(c.colors ?? []).includes("blue"))!
    const s = base("weasel")
    const self = put(s, "p1", WEASEL, coresFor(WEASEL, 2))
    s.players.p1.trashCards.push(anyNexus.cardId)
    const before = s.players.p1.field.nexuses.length
    fireTrigger(s, "p1", self, "onDestroy")
    assert(
        s.players.p1.field.nexuses.length === before + 1,
        `自分の色でないネクサスも配置できる（${anyNexus.colors}）`,
    )
    assert(!s.players.p1.trashCards.includes(anyNexus.cardId), "トラッシュからは取り除かれる")
}

console.log("--- SD02-008 犀銃士グライノス：アタック時にコスト1以下を破壊 ---")
{
    const s = base("grinos")
    const low = put(s, "p2", vanillaCost(1), 1)
    const high = put(s, "p2", vanillaCost(3), 1)
    const self = put(s, "p1", GRINOS, coresFor(GRINOS, 1))
    fireTrigger(s, "p1", self, "onAttack")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === low.instanceId), "コスト1以下は破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === high.instanceId), "コスト3は残る")
}

console.log("--- SD02-010 轟剣士レーヴェン：コスト0〜4を1体ずつ破壊 ---")
{
    const s = base("lowen")
    const targets = [0, 1, 2, 3, 4].map((c) => put(s, "p2", vanillaCost(c), 1))
    const spare = put(s, "p2", vanillaCost(2), 1) // コスト2は既に1体壊すので、こちらは残る
    const high = put(s, "p2", vanillaCost(5), 1)
    const self = put(s, "p1", LOWEN, coresFor(LOWEN, 1))
    fireTrigger(s, "p1", self, "onSummon")
    const alive = (id: string) => s.players.p2.field.spirits.some((x) => x.instanceId === id)
    const destroyed = targets.filter((t) => !alive(t.instanceId)).length
    assert(destroyed === 5, `コスト0〜4がそれぞれ1体ずつ破壊される（${destroyed}体）`)
    assert(alive(spare.instanceId) || alive(targets[2]!.instanceId), "同じコストで壊れるのは1体だけ")
    assert(alive(high.instanceId), "コスト5は対象外")
}
{
    // Lv3『自分のアタックステップ』【強襲】を持つ自分のスピリットすべてをBP+3000
    const s = base("lowen-aura")
    s.phase = "attack"
    const self = put(s, "p1", LOWEN, coresFor(LOWEN, 3))
    refreshLevelAsOverrides(s)
    assert(currentLevel(self).level === 3, "前提：Lv3")
    const bp = LOWEN.levels?.[2]?.bp ?? 0
    assert(
        effectiveBp(s, "p1", self) === bp + 3000,
        `【強襲】持ちの自分（自身も含む）がBP+3000（${bp}→${effectiveBp(s, "p1", self)}）`,
    )
}

console.log("--- SD02-015 フレンドリーパワー：同じ系統の自分のスピリット数ぶんBP+1000 ---")
{
    // 系統を共有する自分のスピリットを3体そろえる（対象自身も数える）
    const fam = "想獣"
    const sameFamily = CARDS.filter((c) => c.type === "spirit" && (c.family ?? []).includes(fam))
    assert(sameFamily.length >= 2, `系統「${fam}」のカードが足りている（${sameFamily.length}種）`)
    const s = base("friendly")
    const target = put(s, "p1", sameFamily[0]!, coresFor(sameFamily[0]!, 1))
    put(s, "p1", sameFamily[1]!, coresFor(sameFamily[1]!, 1))
    const other = CARDS.find((c) => c.type === "spirit" && !(c.family ?? []).includes(fam))!
    put(s, "p1", other, coresFor(other, 1))
    const bpBefore = effectiveBp(s, "p1", target)
    resolveAction(s, "p1", null, byId(FRIENDLY.cardId).effects![0]!["action"] as never, target.instanceId, ["yellow"], "magic")
    assert(
        effectiveBp(s, "p1", target) === bpBefore + 2000,
        `同系統2体ぶん（対象自身を含む）でBP+2000（${bpBefore}→${effectiveBp(s, "p1", target)}）`,
    )
}

console.log("--- SD02-016 ウィングブーツ：Lvがブロッカー以上ならブロックされなかった扱い ---")
{
    const s = base("wingboots")
    // アタッカーをLv2、ブロッカーをLv1にして、ライフに通ることを見る
    const attackerCard = vanillaCost(3)
    const attacker = put(s, "p1", attackerCard, coresFor(attackerCard, 2))
    const blockerCard = vanillaCost(2)
    const blocker = put(s, "p2", blockerCard, coresFor(blockerCard, 1))
    refreshLevelAsOverrides(s)
    assert(
        currentLevel(attacker).level >= currentLevel(blocker).level,
        `前提：アタッカーのLvがブロッカー以上（${currentLevel(attacker).level} ≧ ${currentLevel(blocker).level}）`,
    )
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    const lifeBefore = s.players.p2.life
    s.players.p1.hand[0] = WINGBOOTS.cardId
    s.players.p1.reserve = 20
    // ブロック宣言後のフラッシュ②は防御側（p2）から。優先権が回ってくるまで待つ
    if (s.priorityPlayer !== "p1") {
        assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "相手がフラッシュをパス")
    }
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ウィングブーツを使用")
    // フラッシュを閉じるとバトルが解決される
    let guard = 0
    while (s.isFlashTiming && s.battle && guard < 10) {
        guard += 1
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
    }
    assert(s.players.p2.life < lifeBefore, "BPを比べずライフに通る")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId) &&
            s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId),
        "どちらも破壊されない",
    )
}

console.log("--- SD02-017 ストロングドロー：3枚引いて2枚破棄 ---")
{
    const s = base("strongdraw")
    const handBefore = s.players.p1.hand.length
    const trashBefore = s.players.p1.trashCards.length
    const effects = byId(STRONGDRAW.cardId).effects!
    resolveAction(s, "p1", null, effects[0]!["action"] as never, undefined, ["blue"], "magic")
    resolveAction(s, "p1", null, effects[1]!["action"] as never, undefined, ["blue"], "magic")
    assert(s.players.p1.hand.length === handBefore + 1, `差し引き1枚増える（${handBefore}→${s.players.p1.hand.length}）`)
    assert(s.players.p1.trashCards.length === trashBefore + 2, "破棄した2枚はトラッシュへ")
}

console.log("--- 【転召】の対象になったとき（4種） ---")
{
    // 共通の道具：【転召】持ちで生贄を要求するスピリットを召喚し、対象に各カードを置く。
    // ここでは誘発を直接叩いて、アクション側だけを見る（【転召】の手順自体は既存テストが見ている）
    const s = base("tensho-dragron")
    const self = put(s, "p1", DRAGRON, coresFor(DRAGRON, 1))
    const weak1 = put(s, "p2", vanillaCost(1), 1)
    const weak2 = put(s, "p2", vanillaCost(1), 1)
    const strongCard = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) > 4000,
    )!
    const strong = put(s, "p2", strongCard, coresFor(strongCard, 1))
    fireTrigger(s, "p1", self, "onTenshoTarget")
    const alive = (id: string) => s.players.p2.field.spirits.some((x) => x.instanceId === id)
    assert(!alive(weak1.instanceId) && !alive(weak2.instanceId), "BP4000以下2体が破壊される")
    assert(alive(strong.instanceId), "BP4000を超えるものは残る")
}
{
    const s = base("tensho-schwalt")
    const self = put(s, "p1", SCHWALT, coresFor(SCHWALT, 1))
    const victim = put(s, "p2", vanillaCost(3), 4)
    const trashBefore = s.players.p2.trashCores
    fireTrigger(s, "p1", self, "onTenshoTarget")
    assert(victim.cores === 2, `相手のスピリットからコア2個が減る（4→${victim.cores}）`)
    assert(s.players.p2.trashCores === trashBefore + 2, "取ったコアは相手のトラッシュへ")
}
{
    const s = base("tensho-jewelg")
    const self = put(s, "p1", JEWELG, coresFor(JEWELG, 1))
    const before = s.players.p1.reserve
    fireTrigger(s, "p1", self, "onTenshoTarget")
    assert(s.players.p1.reserve === before + 2, `ボイドからコア2個がリザーブへ（${before}→${s.players.p1.reserve}）`)
}
{
    const s = base("tensho-seidrill")
    const self = put(s, "p1", SEIDRILL, coresFor(SEIDRILL, 1))
    const targetCard = CARDS.find(
        (c) => c.type === "spirit" && (c.effects?.length ?? 0) === 0 && (c.levels?.[0]?.bp ?? 0) <= 5000,
    )!
    const victim = put(s, "p2", targetCard, coresFor(targetCard, 1))
    const deckBefore = s.players.p2.deck.length
    fireTrigger(s, "p1", self, "onTenshoTarget")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "BP5000以下1体が場を離れる",
    )
    assert(s.players.p2.deck.length === deckBefore + 1, "相手のデッキの上に戻る")
    assert(s.players.p2.deck[0] === targetCard.cardId, "戻り先はデッキの一番上")
}

// ── カバレッジで「場に出ているのに一度も適用されていない」と出た SD01 の4件 ──
// npm run coverage:effects が挙げたもの。データは正しいが smoke が一度も通していなかった
console.log("--- SD01 の継続効果（カバレッジの穴を埋める） ---")
{
    // SD01-005 タルタルガー：相手の効果では手札に戻らない
    const TARTAR = check("SD01-005", "タルタルガー", "red", "spirit")
    const s = base("tartar")
    const self = put(s, "p1", TARTAR, coresFor(TARTAR, 1))
    const enemy = put(s, "p2", vanillaCost(1), 1)
    resolveAction(s, "p2", enemy, { type: "returnToHand", count: 1 }, self.instanceId, ["red"], "spirit")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === self.instanceId),
        "相手の効果では手札に戻らない",
    )
}
{
    // SD01-027 溶岩の大瀑布 Lv1-2：自分のアタックステップ、アタックしている自分すべてをBP+1000
    const FALLS = check("SD01-027", "溶岩の大瀑布", "red", "nexus")
    const s = base("falls")
    putNexus(s, "p1", FALLS, coresFor(FALLS, 1))
    const attackerCard = vanillaCost(3)
    const attacker = put(s, "p1", attackerCard, coresFor(attackerCard, 1))
    const idle = put(s, "p1", attackerCard, coresFor(attackerCard, 1))
    const base1 = effectiveBp(s, "p1", attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    assert(effectiveBp(s, "p1", attacker) === base1 + 1000, "アタックしている自分はBP+1000")
    assert(effectiveBp(s, "p1", idle) === base1, "アタックしていない自分は上がらない")
}
{
    // SD01-030 豊穣の大地 Lv1-2：バトル中の自分を、疲労状態の自分1体につきBP+1000
    const FIELD = check("SD01-030", "豊穣の大地", "green", "nexus")
    const s = base("fertile")
    putNexus(s, "p1", FIELD, coresFor(FIELD, 1))
    const attackerCard = vanillaCost(3)
    const attacker = put(s, "p1", attackerCard, coresFor(attackerCard, 1))
    const rested = put(s, "p1", attackerCard, coresFor(attackerCard, 1))
    rested.isRested = true
    const base2 = effectiveBp(s, "p1", attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    // アタック宣言で自分も疲労するので、疲労状態は2体になる
    assert(
        effectiveBp(s, "p1", attacker) === base2 + 2000,
        `疲労状態の自分1体につきBP+1000（疲労2体ぶん。${base2}→${effectiveBp(s, "p1", attacker)}）`,
    )
}
{
    // SD01-030 豊穣の大地 Lv2：自分のコアステップで得られるコアが+1
    const FIELD = byId("SD01-030")
    const s = base("fertile-core")
    putNexus(s, "p1", FIELD, coresFor(FIELD, 2))
    s.turnPlayer = "p1"
    s.phase = "start"
    const before = s.players.p1.reserve
    runTurnStart(s)
    // コアステップの基本1個＋ネクサスの+1
    assert(s.players.p1.reserve === before + 2, `コアステップで2個得られる（${before}→${s.players.p1.reserve}）`)
}
