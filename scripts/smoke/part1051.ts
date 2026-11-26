// smoke パート1051（効果の解決通知：スピリットの効果が解決を始めたとき "effect" の出来事を1件だけ出す。マジック・効果なしでは出さない）
import { assert, createGame, createInstance, destroySpirit, getCard, handleAction, runTurnStart } from "./helpers"
import { noticeOf } from "../../server/src/logic/effectNotice"
import type { GameState } from "./helpers"
import type { GameEvent } from "../../server/src/type"

const ON_SUMMON = "BS01-030" // グリプ・ハンズ（紫・召喚時ドロー）
const ON_ATTACK = "BS01-034" // バイ・パイソン（紫・アタック時ドロー）
const SUMMON_PICK = "BS01-063" // エメラルドシーザー（緑・召喚時に相手スピリット1体を疲労）
const MAGIC = "BS01-136" // ギャザーフォース（メインでコア1個）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
for (const [id, name, type] of [[ON_SUMMON, "グリプ・ハンズ", "spirit"], [ON_ATTACK, "バイ・パイソン", "spirit"], [SUMMON_PICK, "エメラルドシーザー", "spirit"], [MAGIC, "ギャザーフォース", "magic"], [VANILLA, "ロクケラトプス", "spirit"]] as const) {
    assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
}
assert(getCard(ON_SUMMON).effect.includes("『このスピリットの召喚時』") && getCard(ON_ATTACK).effect.includes("『このスピリットのアタック時』"), "効果文の見出しを確認")

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
const effects = (s: GameState): Extract<GameEvent, { type: "effect" }>[] => s.events.filter((e): e is Extract<GameEvent, { type: "effect" }> => e.type === "effect")

console.log("=== 1. 召喚時の効果で出る ===")
{
    const s = game("n1")
    s.players.p1.hand = [ON_SUMMON]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    const ev = effects(s)
    assert(ev.length === 1 && ev[0]!.pid === "p1" && ev[0]!.cardId === ON_SUMMON, "effect が1件・持ち主と cardId が合う")
    assert(ev[0]!.heading?.includes("このスピリットの召喚時") === true, "見出しは召喚時")
    assert(ev[0]!.instanceId === s.players.p1.field.spirits[0]!.instanceId, "発生源の個体")
}

console.log("=== 2. アタック時の効果で出る ===")
{
    const s = game("n2")
    s.players.p1.hand = [ON_ATTACK]
    handleAction(s, "p1", { type: "summon", handIndex: 0 })
    s.players.p1.field.spirits[0]!.summonedTurn = 0
    handleAction(s, "p1", { type: "nextPhase" })
    assert(handleAction(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "アタックできる")
    const ev = effects(s)
    assert(ev.length === 1 && ev[0]!.cardId === ON_ATTACK && ev[0]!.heading?.includes("アタック時") === true, "アタック時の effect が1件")
}

console.log("=== 3. マジックでは出ない ===")
{
    const s = game("n3")
    s.players.p1.hand = [MAGIC]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "マジックを使える")
    assert(s.events.some((e) => e.type === "magic") && effects(s).length === 0, "magic だけで effect は出ない")
}

console.log("=== 4. 効果を持たないスピリットでは出ない ===")
{
    const s = game("n4")
    s.players.p1.hand = [VANILLA]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(effects(s).length === 0, "effect は出ない")
}

console.log("=== 5. 選ぶ場面で中断・再開しても1回だけ ===")
{
    const s = game("n5", true)
    s.players.p1.hand = [SUMMON_PICK]
    s.players.p2.field.spirits.push(...[0, 1].map(() => { return createInstance(VANILLA, s.turn, 1) }))
    let total = 0
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    total += effects(s).length
    assert(s.pendingChoice !== undefined && s.pendingChoice !== null, "対象を選ぶ場面で止まる")
    for (let i = 0; s.pendingChoice && i < 5; i++) {
        const pc = s.pendingChoice
        const target = s.players.p2.field.spirits[0]!.instanceId
        handleAction(s, pc.pid, { type: "resolveChoice", instanceId: target })
        total += effects(s).length
    }
    assert(total === 1, `effect は合計1件（${total}）`)
}

console.log("=== 6. 破壊時の誘発は見出しが「破壊時」になる ===")
{
    const D = "BS01-055" // エメアント（Lv1･Lv2『このスピリットの破壊時』）
    assert(getCard(D).name === "エメアント" && getCard(D).effect.includes("『このスピリットの破壊時』"), "エメアントの効果文を確認")
    const s = game("n6")
    const sp = createInstance(D, s.turn, 1)
    s.players.p2.field.spirits.push(sp)
    destroySpirit(s, "p2", sp.instanceId)
    const ev = effects(s)
    assert(ev.length === 1 && ev[0]!.pid === "p2" && ev[0]!.cardId === D && ev[0]!.heading?.includes("このスピリットの破壊時") === true, "破壊時の effect が1件")
    assert(ev[0]!.trigger === undefined, "見出しが誘発を言っているので trigger は付けない")
}

console.log("=== 7. 見出しが誘発の形を言わない効果は、本文の「〜とき」を trigger に出す ===")
{
    const eff = (id: string, eid: string) => getCard(id).effects.find((e) => e.id === eid)!
    const WON = "相手のスピリットだけを破壊したとき"
    const nexus = noticeOf("BS01-101", eff("BS01-101", "BS01-101-e2")) // 古龍の縄張り（battleWon）
    assert(nexus.heading === "Lv2『自分のアタックステップ』" && nexus.trigger === `BPを比べ${WON}`, "battleWon：見出しはステップ、trigger は本文の文")
    const bat = noticeOf("BS01-047", eff("BS01-047", "BS01-047-e1")) // 魔女ナージャ（onBattleWin）
    assert(bat.heading === "Lv1･Lv2『このスピリットのバトル時』" && bat.trigger === `BPを比べ${WON}`, "onBattleWin：バトル時の見出しと trigger")
    const fe = noticeOf("BS01-113", eff("BS01-113", "BS01-113-e2")) // 侵食されゆく銀世界（fieldEvent）
    assert(fe.heading === "Lv2『相手のアタックステップ』" && fe.trigger === "自分のスピリットが破壊されたとき", "fieldEvent：2段落のうち破壊の段落を選ぶ")
    const st = noticeOf("BS01-113", eff("BS01-113", "BS01-113-e1")) // 同じカードの step
    assert(st.heading === "Lv1･Lv2『相手のアタックステップ』" && st.trigger === undefined, "step：Lv の合う段落を選ぶ")
    assert(Object.keys(noticeOf("BS01-113", { ...eff("BS01-113", "BS01-113-e2"), event: "ownMagicUsed" } as never)).length === 0, "段落に合う語が無ければ何も出さない")
}

console.log("=== 8. 場の出来事で動く効果（fieldEvent）も通知が出る：ネクサスの「自分のスピリットが破壊されたとき」 ===")
{
    const N = "BS01-113" // 侵食されゆく銀世界（Lv2『相手のアタックステップ』自分のスピリットが破壊されたとき）
    assert(getCard(N).name === "侵食されゆく銀世界" && getCard(N).effect.includes("自分のスピリットが破壊されたとき"), "銀世界の効果文を確認")
    const s = game("n8")
    s.turnPlayer = "p1"
    s.phase = "attack"
    const nx = createInstance(N, s.turn, 4) // Lv2 は4コア
    s.players.p2.field.nexuses.push(nx)
    const sp = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(sp)
    destroySpirit(s, "p2", sp.instanceId)
    const ev = effects(s).filter((e) => e.cardId === N)
    assert(ev.length === 1 && ev[0]!.pid === "p2" && ev[0]!.instanceId === nx.instanceId, `ネクサスの fieldEvent の effect が1件（${ev.length}件）`)
    assert(ev[0]?.trigger === "自分のスピリットが破壊されたとき", `trigger の文（${ev[0]?.trigger}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1051）")
