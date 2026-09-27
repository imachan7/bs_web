// smoke パート424（R5：「記録から引いた個体」を対象にする1枚専用typeを絞り込みの軸へ畳んだ
// 3枚の検証。BS06-080颶風高原Lv2／BS14-032ヤツノカンゾウLv2／BS16-080次元断。
// docs/design/R5_TRIAGE.md）
// TargetFilter.bofuExhausted（any/self）・damagedOwnLife → instanceIn を経由する。
// カードデータは実際のJSONを読み、そこに書かれたactionをそのまま使う（手書きの別データにしない）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    colors?: string[]
    effects?: Record<string, unknown>[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS06-080").name === "颶風高原" && getCard("BS06-080").type === "nexus", "BS06-080は颶風高原")
    assert(getCard("BS14-032").name === "ヤツノカンゾウ" && getCard("BS14-032").type === "spirit", "BS14-032はヤツノカンゾウ")
    assert(getCard("BS16-080").name === "次元断" && getCard("BS16-080").type === "magic", "BS16-080は次元断")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// カード自身に書かれた action を、effects[].id で引く（手打ちの別データにしない）
function actionOf(cardId: string, effectId: string): Record<string, unknown> {
    const row = CARDS.find((c) => c.cardId === cardId)!
    const entry = (row.effects ?? []).find((e) => e["id"] === effectId)!
    return (entry["action"] as Record<string, unknown>) ?? (entry["granted"] as Record<string, unknown>)["action"] as Record<string, unknown>
}

console.log("=== 1. BS06-080颶風高原Lv2：戻す順番を選べる（all/bofuExhausted:any） ===")
{
    const s = game("highland-order", true)
    const a = put(s, "p2", VANILLA, 1)
    const b = put(s, "p2", VANILLA, 1)
    s.bofuExhaustedThisBattle = [
        { pid: "p2", instanceId: a.instanceId },
        { pid: "p2", instanceId: b.instanceId },
    ]
    const deckBefore = s.players.p2.deck.length
    resolveAction(s, "p1", null, actionOf("BS06-080", "BS06-080-e2") as never)
    assert(!!s.pendingChoice, "戻す順番を聞かれる")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "b を先に戻す")
    assert(!s.pendingChoice, "残り1体は聞かずに確定する")
    const deck = s.players.p2.deck
    assert(s.players.p2.deck.length === deckBefore + 2, "2体ともデッキの下に戻る")
    assert(deck[deck.length - 2] === b.cardId, "先に選んだbが先に下へ")
    assert(deck[deck.length - 1] === a.cardId, "後のaがその下")
}

console.log("--- 記録が空なら何も起きない ---")
{
    const s = game("highland-empty")
    const deckBefore = s.players.p2.deck.length
    resolveAction(s, "p1", null, actionOf("BS06-080", "BS06-080-e2") as never)
    assert(s.players.p2.deck.length === deckBefore, "デッキは変わらない")
}

console.log("--- 装甲を持つ相手はデッキの下に戻されない（範囲効果としての耐性判定） ---")
{
    const armored = CARDS.find((c) =>
        (c.effects ?? []).some(
            (e) =>
                e["kind"] === "keyword" &&
                e["keyword"] === "armor" &&
                ((e["colors"] as string[] | undefined) ?? []).includes("green") &&
                (((e["levels"] as number[] | null) ?? [1])[0] === 1),
        ),
    )!
    const s = game("highland-armor")
    const guarded = put(s, "p2", armored.cardId, 1)
    const plain = put(s, "p2", VANILLA, 1)
    s.bofuExhaustedThisBattle = [
        { pid: "p2", instanceId: guarded.instanceId },
        { pid: "p2", instanceId: plain.instanceId },
    ]
    resolveAction(s, "p1", null, actionOf("BS06-080", "BS06-080-e2") as never, undefined, ["green"] as never, "nexus")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === guarded.instanceId), "装甲持ちは場に残る")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === plain.instanceId), "装甲を持たない側は戻される")
}

console.log("=== 2. BS14-032ヤツノカンゾウLv2：selfの【暴風】で疲労させた相手だけを戻す（bofuExhausted:self） ===")
{
    const s = game("kanzou-self")
    const kanzou = put(s, "p1", "BS14-032", 3)
    const other = put(s, "p1", VANILLA, 1)
    const bySelf = put(s, "p2", VANILLA, 1)
    const byOther = put(s, "p2", VANILLA, 1)
    s.bofuExhaustedThisBattle = [
        { pid: "p2", instanceId: bySelf.instanceId, bofuSourceInstanceId: kanzou.instanceId },
        { pid: "p2", instanceId: byOther.instanceId, bofuSourceInstanceId: other.instanceId },
    ]
    resolveAction(s, "p1", kanzou, actionOf("BS14-032", "BS14-032-e3") as never)
    assert(s.players.p2.hand.includes(bySelf.cardId), "自身の【暴風】で疲労させた相手は手札に戻る")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === byOther.instanceId), "他の個体の【暴風】で疲労させた相手は戻らない")
}

console.log("--- selfが無ければ発揮しない（bofuExhausted:selfはselfが必須） ---")
{
    const s = game("kanzou-no-self")
    const bySelf = put(s, "p2", VANILLA, 1)
    s.bofuExhaustedThisBattle = [{ pid: "p2", instanceId: bySelf.instanceId, bofuSourceInstanceId: "not-on-field" }]
    resolveAction(s, "p1", null, actionOf("BS14-032", "BS14-032-e3") as never)
    assert(!s.players.p2.hand.includes(bySelf.cardId), "self不在では戻らない")
}

console.log("=== 3. BS16-080次元断：バトル中の個体とバーストの個体の両方が候補になる（damagedOwnLife） ===")
{
    const s = game("gendan-union", true)
    const battleTarget = put(s, "p2", VANILLA, 1)
    const burstTarget = put(s, "p2", VANILLA, 1)
    s.battle = { attackerInstanceId: battleTarget.instanceId, blockerInstanceId: null, directed: false, lifeDamagers: [battleTarget.instanceId] }
    s.burstEventLifeDamagerId = burstTarget.instanceId
    resolveAction(s, "p1", null, actionOf("BS16-080", "BS16-080-e2") as never, undefined, undefined, "magic")
    assert(!!s.pendingChoice && s.pendingChoice.kind === "target", "両方に対象がいるので選ばせる")
    assert((s.pendingChoice?.candidates ?? []).length === 2, "候補はバトル側・バースト側の2体")
}

console.log("--- 記録が空なら破壊は起きない ---")
{
    const s = game("gendan-empty")
    const bystander = put(s, "p2", VANILLA, 1)
    resolveAction(s, "p1", null, actionOf("BS16-080", "BS16-080-e2") as never, undefined, undefined, "magic")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === bystander.instanceId), "対象がいないので破壊されない")
}

console.log("すべてのチェックに合格しました 🎉（part424）")
