// smoke パート260（BS10-096 最後の優勝旗）
//
// Lv1･Lv2『このネクサスの配置時』ボイドからコア1個をこのネクサスに置く（triggered onSummon）。
// Lv2『自分のメインステップ開始時』自分のスピリット1体を破壊することで、その破壊したスピリットと
// 同じコストのブレイヴカード1枚を、コストを支払わずに召喚する（kind:"step" step:"main"
// + summonFromHandFree.bravesOnly + costDestroyOwnSpiritSameCost）。
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・コストを機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveCost,
    fireStepTriggers,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { matchesBraveCondition } from "../../shared/rules"

const CARD_ID = "BS10-096"
const card = getCard(CARD_ID)
assert(card.name === "最後の優勝旗" && card.type === "nexus", `${CARD_ID} は最後の優勝旗（ネクサス）`)

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    return s
}
function putNexus(s: GameState, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function fireMain(s: GameState): void {
    s.turnPlayer = "p1"
    fireStepTriggers(s, "main")
    // optional（発動確認）は対話時だけ出る（kind:"step" の optional:true）。
    // 対話モードのテストでは自動的に「発動する」を選んで先へ進める
    if (s.pendingChoice?.confirm) {
        act(s, "p1", { type: "resolveChoice", option: "発動する" })
    }
}

const SPIRITS = ALL_CARDS.filter((c) => c.type === "spirit" && c.levels.length > 0)
const BRAVES = ALL_CARDS.filter((c) => c.type === "brave")

console.log("=== Lv1･Lv2『配置時』：ボイドからコア1個をこのネクサスに置く ===")
{
    const s = base("olympic-flag-place")
    s.players.p1.hand = [CARD_ID]
    const cost = effectiveCost(s, "p1", card)
    s.players.p1.reserve = cost + 5
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "配置できる")
    const nexus = s.players.p1.field.nexuses.find((n) => n.cardId === CARD_ID)
    assert(nexus !== undefined, "最後の優勝旗が場に出る")
    assert(nexus!.cores === 1, `配置時にコアが1個乗る（実際: ${String(nexus?.cores)}）`)
    assert(
        s.players.p1.reserve === reserveBefore - cost,
        `リザーブは配置コスト分しか減らない＝コアはボイドから（実際: ${String(reserveBefore - s.players.p1.reserve)}／期待: ${String(cost)}）`,
    )
}

// req2〜5共通：任意のブレイヴ1枚と、そのコストに一致するスピリット／一致しないスピリットを実データから探す
const brave = BRAVES.find((b) => SPIRITS.some((sp) => sp.cost === b.cost) && SPIRITS.some((sp) => sp.cost !== b.cost))
assert(brave !== undefined, "テスト前提：コストが一致／不一致のスピリットが両方見つかるブレイヴがある")
const braveId = brave!.cardId
const braveCost = brave!.cost
const matchSpirit = SPIRITS.find((sp) => sp.cost === braveCost)!
const mismatchSpirit = SPIRITS.find((sp) => sp.cost !== braveCost)!

console.log("=== Lv2『メインステップ開始時』：同コストの組み合わせだけが破壊候補になる ===")
{
    const s = base("olympic-flag-cost-match")
    const nexus = putNexus(s, CARD_ID, 1) // Lv2
    const matched = createInstance(matchSpirit.cardId, s.turn, matchSpirit.levels[0]!.cores)
    const mismatched = createInstance(mismatchSpirit.cardId, s.turn, mismatchSpirit.levels[0]!.cores)
    s.players.p1.field.spirits = [mismatched, matched]
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [braveId]
    fireMain(s)
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === matched.instanceId),
        "同コストのスピリットが破壊される",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === mismatched.instanceId),
        "同コストのブレイヴが手札にないスピリットは破壊候補にならず場に残る",
    )
    assert(s.players.p1.hand.length === 0, "ブレイヴが手札から召喚される")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === braveId),
        "破壊したスピリットと同コストのブレイヴが召喚される",
    )
    assert(
        s.log.some((l) => l.includes("コストを支払わずに召喚した")),
        "召喚コストは支払っていない（コストを支払わずに召喚のログが残る）",
    )
    void nexus
}

console.log("=== 成立する組み合わせが無ければ何も起きない（破壊も起きない） ===")
{
    const s = base("olympic-flag-no-combo")
    putNexus(s, CARD_ID, 1) // Lv2
    const lone = createInstance(mismatchSpirit.cardId, s.turn, mismatchSpirit.levels[0]!.cores)
    s.players.p1.field.spirits = [lone]
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [braveId] // コストが一致しないので組み合わせが成立しない
    fireMain(s)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === lone.instanceId),
        "組み合わせが成立しないので破壊は起きない",
    )
    assert(s.players.p1.hand.length === 1, "ブレイヴも手札から出ない")
    assert(
        s.log.some((l) => l.includes("組み合わせがないため発動しなかった")),
        "発動しなかったとログに残る",
    )
}

console.log("=== Lv1では発揮しない（levels:[2]） ===")
{
    const s = base("olympic-flag-lv1")
    putNexus(s, CARD_ID, 0) // Lv1
    const matched = createInstance(matchSpirit.cardId, s.turn, matchSpirit.levels[0]!.cores)
    s.players.p1.field.spirits = [matched]
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [braveId]
    fireMain(s)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === matched.instanceId),
        "Lv1では発揮しないので破壊が起きない",
    )
    assert(s.players.p1.hand.length === 1, "Lv1では召喚も起きない")
}

// req6：合体先の選択（ダイレクトブレイヴ／スピリット状態）。
// 合体条件を持つブレイヴと、それを満たすホスト（破壊するスピリットとはコストを変えて区別する）を探す
const combineBrave = BRAVES.find((b) => {
    const cond = b.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0
})
assert(combineBrave !== undefined, "テスト前提：合体条件を持つブレイヴが1枚以上ある")
const combineBraveId = combineBrave!.cardId
const combineBraveCost = combineBrave!.cost

function findHost(): string {
    for (const c of SPIRITS) {
        if (c.cost === combineBraveCost) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("olympic-flag-host-probe")
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, combineBraveId)) return c.cardId
    }
    throw new Error("合体条件を満たし、コストがブレイヴと異なるホストが見つからない")
}
const hostCardId = findHost()
const combineSacrifice = SPIRITS.find((c) => c.cost === combineBraveCost && c.cardId !== hostCardId)!

function setupCombineTest(seed: string, interactive: boolean): { s: GameState; hostInst: ReturnType<typeof createInstance> } {
    const s = base(seed)
    s.interactiveTargets = interactive
    putNexus(s, CARD_ID, 1) // Lv2
    const sacrificeInst = createInstance(combineSacrifice.cardId, s.turn, combineSacrifice.levels[0]!.cores)
    const hostInst = createInstance(hostCardId, s.turn, getCard(hostCardId).levels[0]!.cores)
    s.players.p1.field.spirits = [sacrificeInst, hostInst]
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [combineBraveId]
    fireMain(s)
    return { s, hostInst }
}

console.log("=== ブレイヴ召喚の合体選択：非対話では単体召喚になる ===")
{
    const { s } = setupCombineTest("olympic-flag-combine-noninteractive", false)
    assert(s.pendingChoice === null, "非対話では合体選択を出さずに解決する")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === combineBraveId),
        "非対話では単体スピリットとして召喚される",
    )
    assert(s.players.p1.field.combinedBraves.length === 0, "非対話では合体しない")
}

console.log("=== ブレイヴ召喚の合体選択：対話でスキップすると単体召喚になる ===")
{
    const { s } = setupCombineTest("olympic-flag-combine-skip", true)
    assert(s.pendingChoice !== null, "合体先を選ぶ選択待ちが立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "選ばずにスキップできる")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === combineBraveId),
        "スキップすると単体スピリットとして召喚される",
    )
    assert(s.players.p1.field.combinedBraves.length === 0, "スキップすると合体しない")
}

console.log("=== ブレイヴ召喚の合体選択：合体先を選ぶと合体した状態で場に出る ===")
{
    const { s, hostInst } = setupCombineTest("olympic-flag-combine-selected", true)
    assert(s.pendingChoice !== null, "合体先を選ぶ選択待ちが立つ")
    assert(
        (s.pendingChoice?.candidates ?? []).includes(hostInst.instanceId),
        "合体条件を満たすホストが候補に出る",
    )
    assert(
        act(s, "p1", { type: "resolveChoice", instanceId: hostInst.instanceId }) === null,
        "合体先を選べる",
    )
    const combined = s.players.p1.field.combinedBraves.find((b) => b.cardId === combineBraveId)
    assert(combined !== undefined, "合体した状態のブレイヴがcombinedBravesに入る")
    assert(combined!.cores === 0, "ダイレクトブレイヴは維持コアを置かない（合体状態のLv1は0コア）")
    assert(
        (hostInst.braveRefs ?? []).some((r) => r.instanceId === combined!.instanceId),
        "ホストのbraveRefsが合体先を参照する",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === combineBraveId),
        "合体した場合はfield.spiritsには単体で追加されない",
    )
}

// 2026-08-28 に見つかった既存バグの再発防止。
// doSetNexus が fireSummonTrigger を呼んでおらず、**ネクサスの『配置時』効果が実戦で
// 一度も発揮されていなかった**（BS10-096 の実装中に発覚）。BS10-096 だけでなく、
// 同じ形で先に書かれていた BS09-066 目覚める要塞城も長期間死んでいたので、そちらも固定する。
console.log("=== 既存バグの再発防止：ネクサスの『配置時』は BS09-066 でも発火する ===")
{
    const OLD_ID = "BS09-066"
    const oldCard = getCard(OLD_ID)
    assert(
        oldCard.name === "目覚める要塞城" && oldCard.type === "nexus",
        `${OLD_ID} は目覚める要塞城（ネクサス）`,
    )
    // 『配置時』＝手札のコスト4以下の青スピリット1枚をコストを支払わずに召喚できる
    const target = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.cost <= 4 && c.colors.length === 1 && c.colors[0] === "blue",
    )
    assert(target !== undefined, "コスト4以下の青スピリットがカードデータにある")

    const s = base("bs09-066-place")
    s.players.p1.hand = [OLD_ID, target!.cardId]
    const cost = effectiveCost(s, "p1", oldCard)
    s.players.p1.reserve = cost + 5
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "目覚める要塞城を配置できる")
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === target!.cardId)
    assert(summoned !== undefined, "『配置時』が発火して手札の青スピリットが召喚される")
    // 召喚コストは支払わない（減るのはネクサスの配置コストと、召喚したスピリットの維持コアだけ）
    const maintain = target!.levels[0]!.cores
    assert(
        s.players.p1.reserve === reserveBefore - cost - maintain,
        `召喚コストは支払わない（実際の減少: ${String(reserveBefore - s.players.p1.reserve)}／期待: ${String(cost + maintain)}）`,
    )
}

console.log("すべてのチェックに合格しました 🎉（part260）")
