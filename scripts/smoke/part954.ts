// smoke パート954（同時に破壊されたスピリットの誘発は、全員ぶんを1本の列で解決する。PENDING_STATE §3 C1。2026-11-15 ユーザー確認）
// 効果は手で組む（破壊時にドローするだけ、など）。選択への回答は handleAction（act）経由
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectDef } from "../../server/src/type"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const CORONA = "BS20-002" // 炎楯の守護者コロナ・ドラゴン（コスト3以下の自分のスピリットすべては、相手の効果で破壊されたとき残ることができる）
const GORADON = "BS01-001" // ゴラドン（コスト0・効果なし）
const ROKU = "BS01-002" // ロクケラトプス（コスト1・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（コスト4・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CORONA).name === "炎楯の守護者コロナ・ドラゴン" && getCard(CORONA).effects.some((e) => e.kind === "reviveOnDestroy" && e.scope === "ownAll" && e.perDestroyed === true), "コロナは自分のスピリットすべてに「残ることができる」")
    assert(getCard(GORADON).name === "ゴラドン" && getCard(GORADON).cost === 0 && getCard(GORADON).effects.length === 0, "ゴラドンはコスト0・効果なし")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).cost === 1 && getCard(ROKU).effects.length === 0, "ロクケラトプスはコスト1・効果なし")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).effects.length === 0, "ベルはコスト4・効果なし（コロナの対象外）")
}

const ON_DESTROY_DRAW = { id: "t954-d", kind: "triggered", trigger: "onDestroy", levels: [1, 2, 3], optional: false, action: { type: "draw", count: 1 } } as EffectDef
// 「自分のスピリットが破壊されたとき、1枚ドローする」
const OWN_DESTROYED_DRAW = { id: "t954-f", kind: "fieldEvent", event: "ownSpiritDestroyed", levels: [1, 2, 3], action: { type: "draw", count: 1 } } as EffectDef

function withEffects(map: Record<string, EffectDef[]>, run: () => void): void {
    const originals = Object.keys(map).map((id) => [id, getCard(id).effects] as const)
    for (const id of Object.keys(map)) getCard(id).effects = map[id]!
    try {
        run()
    } finally {
        for (const [id, effects] of originals) getCard(id).effects = effects
    }
}
function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p2" // 相手（p2）のターンに p2 の効果で破壊する＝順番を決めるのは p2
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p1.hand = []
    s.players.p2.hand = []
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, 1, 1)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const destroyAll = (s: GameState, targets: [PlayerId, CardInstance][]) =>
    destroyTargetsBatch(s, "p2", targets.map(([pid, inst]) => ({ pid, instanceId: inst.instanceId })), { sourcePid: "p2", sourceType: "spirit" })
const onField = (s: GameState, pid: PlayerId, inst: CardInstance) => s.players[pid].field.spirits.includes(inst)
const texts = (s: GameState, from: number): string[] => s.log.slice(from).map((l) => (typeof l === "string" ? l : (l as { message: string }).message))
// 順番の選択で、ラベルに part を含む項目を選ぶ
function pickOrder(s: GameState, part: string): void {
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined && pc.pid === "p2", `順番の選択がターンプレイヤー（p2）に出る（${part}）`)
    const option = pc?.options?.find((t) => t.includes(part))
    assert(option !== undefined && act(s, "p2", { type: "resolveChoice", option }) === null, `「${part}」を先に解決する`)
}
// ログの1行が出る瞬間の盤面を見る
function watchLog(s: GameState, part: string, see: () => void): void {
    const push = s.log.push.bind(s.log)
    s.log.push = (...items) => {
        for (const it of items) if ((typeof it === "string" ? it : (it as { message: string }).message).includes(part)) see()
        return push(...items)
    }
}

console.log("=== 1. 両者のスピリットが同時に破壊された：破壊誘発元をまたいで順番を選べ、解決の間は全員が場に残る ===")
withEffects({ [GORADON]: [ON_DESTROY_DRAW], [BELL]: [ON_DESTROY_DRAW] }, () => {
    const s = game("cross", true)
    const mine = put(s, "p1", GORADON)
    const theirs = put(s, "p2", BELL)
    let mineStillThere: boolean | undefined
    let theirsStillThere: boolean | undefined
    watchLog(s, "ユウキは1枚ドローした", () => (mineStillThere = onField(s, "p1", mine) && mine.waiting?.kind === "destroy"))
    watchLog(s, "アキラは1枚ドローした", () => (theirsStillThere = onField(s, "p2", theirs) && theirs.waiting?.kind === "destroy"))
    const from = s.log.length
    destroyAll(s, [["p1", mine], ["p2", theirs]])
    assert(onField(s, "p1", mine) && onField(s, "p2", theirs) && mine.waiting?.kind === "destroy" && theirs.waiting?.kind === "destroy", "順番を聞く時点で、2体とも破壊待機で場にいる")
    assert(s.pendingChoice?.options?.length === 2, "列には、2体の破壊時効果が並ぶ")
    pickOrder(s, "デュアルキャノン・ベル（破壊時）") // 後ろの破壊誘発元から
    const t = texts(s, from)
    const a = t.findIndex((m) => m.includes("ユウキは1枚ドローした"))
    const b = t.findIndex((m) => m.includes("アキラは1枚ドローした"))
    assert(a !== -1 && b !== -1 && a < b, "選んだ順（後ろの破壊誘発元の破壊時 → 前の破壊誘発元の破壊時）で解決する")
    assert(mineStillThere === true, "後ろの破壊誘発元の破壊時効果を解決する時点で、前のスピリットはまだ破壊待機で場にいる")
    assert(theirsStillThere === true, "前の破壊誘発元の破壊時効果を解決する時点で、後ろのスピリットもまだ破壊待機で場にいる")
    assert(s.pendingChoice === null && !onField(s, "p1", mine) && !onField(s, "p2", theirs), "列を解決し終えたら、2体ともトラッシュへ置く")
    assert(s.players.p1.trashCards.includes(GORADON) && s.players.p2.trashCards.includes(BELL), "カードはそれぞれの持ち主のトラッシュ")
})

console.log("=== 2. 「自分のスピリットが破壊されたとき」は、当てはまるスピリットが同時に2体破壊されても1回だけ ===")
withEffects({ [BELL]: [OWN_DESTROYED_DRAW] }, () => {
    const s = game("once", false)
    put(s, "p1", BELL)
    const a = put(s, "p1", GORADON)
    const b = put(s, "p1", ROKU)
    destroyAll(s, [["p1", a], ["p1", b]])
    assert(!onField(s, "p1", a) && !onField(s, "p1", b), "2体とも破壊された")
    assert(s.players.p1.hand.length === 1, `ドローは1回だけ（手札 ${s.players.p1.hand.length} 枚）`)
})

console.log("=== 3. 先に「残る」を解決したスピリットがいても、もう1体が破壊されるなら「破壊されたとき」は発揮する ===")
withEffects({ [BELL]: [OWN_DESTROYED_DRAW] }, () => {
    const s = game("once-after-stay", true)
    put(s, "p1", CORONA)
    put(s, "p1", BELL)
    const stays = put(s, "p1", GORADON)
    const dies = put(s, "p1", ROKU)
    destroyAll(s, [["p1", stays], ["p1", dies]])
    pickOrder(s, "ゴラドンがフィールドに残る")
    assert(s.pendingChoice?.reviveConfirm?.instanceId === stays.instanceId, "ゴラドンを残すかの確認が出る")
    act(s, "p1", { type: "resolveChoice", option: "復活させる" })
    assert(onField(s, "p1", stays) && stays.waiting === undefined, "ゴラドンは残った")
    pickOrder(s, "デュアルキャノン・ベル")
    assert(s.players.p1.hand.length === 1, `もう1体（ロクケラトプス）の破壊で「破壊されたとき」が1回発揮する（手札 ${s.players.p1.hand.length} 枚）`)
    assert(s.pendingChoice?.reviveConfirm?.instanceId === dies.instanceId, "続けて、ロクケラトプスを残すかの確認が出る")
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null && onField(s, "p1", stays) && !onField(s, "p1", dies), "断ったロクケラトプスだけがトラッシュへ行く")
    assert(s.players.p1.hand.length === 1, "ドローは増えない（同時破壊につき1回）")
})

console.log("=== 4. 列の中で「残る」を断っても、破壊はやり直さない（破壊時効果は1回） ===")
withEffects({ [GORADON]: [ON_DESTROY_DRAW] }, () => {
    const s = game("decline", true)
    put(s, "p1", CORONA)
    const a = put(s, "p1", GORADON)
    const b = put(s, "p1", ROKU)
    const from = s.log.length
    destroyAll(s, [["p1", a], ["p1", b]])
    pickOrder(s, "ゴラドンがフィールドに残る")
    act(s, "p1", { type: "resolveChoice" }) // 断る
    assert(onField(s, "p1", a) && a.waiting?.kind === "destroy", "断ったゴラドンは、破壊待機のまま場にいる")
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.triggerOrder) act(s, pc.pid, { type: "resolveChoice", option: pc.options![0]! })
        else act(s, pc.pid, { type: "resolveChoice" }) // ロクケラトプスの「残る」も断る
    }
    const t = texts(s, from)
    assert(t.filter((m) => m.includes("ゴラドンは破壊された")).length === 1, "「破壊された」は1回だけ")
    assert(s.players.p1.hand.length === 1, `ゴラドンの破壊時効果は1回だけ発揮する（手札 ${s.players.p1.hand.length} 枚）`)
    assert(s.pendingChoice === null && !onField(s, "p1", a) && !onField(s, "p1", b), "2体ともトラッシュへ行く")
})

console.log("すべてのチェックに合格しました 🎉（part954）")
