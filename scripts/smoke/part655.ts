// smoke パート655（exhaustAndForceBlock：相手のスピリットを疲労させ、そのスピリットでブロックさせる。2026-10-23 ユーザー裁定1〜7）
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const ATK = "BS01-008" // メタルバーン（BP3000）
const WEAK = "BS01-050" // ビートビートル（BP1000）
const STRONG = "BS01-031" // デス・ハーデス（BP4000）
const OTHER = "BS01-001" // ゴラドン（BP1000）
const DEF = "BS01-002" // ロクケラトプス（BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = { [ATK]: "メタルバーン", [WEAK]: "ビートビートル", [STRONG]: "デス・ハーデス", [OTHER]: "ゴラドン", [DEF]: "ロクケラトプス" }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n && getCard(id).type === "spirit", `${id}は${n}`)
}

type Effects = ReturnType<typeof getCard>["effects"]
// 既存カードの effects へ一時的に足す。fn のあとで必ず戻す
function withEffects(extra: Record<string, unknown[]>, fn: () => void): void {
    const saved = Object.keys(extra).map((id) => [id, getCard(id).effects.length] as const)
    for (const [id, list] of Object.entries(extra)) (getCard(id).effects as unknown[]).push(...list)
    try {
        fn()
    } finally {
        for (const [id, n] of saved) (getCard(id).effects as Effects).length = n
    }
}

// p1(アタッカー)がアタック宣言した直後＝ブロック前のフラッシュ。p2 が防御側
function setup(seed: string, forcedCard: string, defenders: string[] = [DEF]) {
    const s: GameState = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    const put = (pid: "p1" | "p2", cardId: string) => {
        const inst = createInstance(cardId, s.turn - 1, 1)
        s.players[pid].field.spirits.push(inst)
        return inst
    }
    const atk = put("p1", ATK)
    const forced = put("p1", forcedCard)
    const defs = defenders.map((c) => put("p2", c))
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言が通る")
    return { s, atk, forced, defs }
}
const force = (s: GameState): void => resolveAction(s, "p2", null, { type: "exhaustAndForceBlock" })
// ブロック前のフラッシュだけを閉じる（宣言後のフラッシュは開いたまま残す）
function closeFirstFlash(s: GameState): void {
    act(s, s.priorityPlayer, { type: "pass" })
    act(s, s.priorityPlayer, { type: "pass" })
}
function closeFlash(s: GameState): void {
    while (s.isFlashTiming && s.battle) assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "パスが通る")
}

console.log("=== 1. 疲労させ、フラッシュ後にそのスピリットが宣言する（裁定1・7） ===")
{
    const { s, atk, forced } = setup("fb1", WEAK)
    force(s)
    assert(forced.isRested, "対象が疲労した")
    assert(s.battle?.forcedBlockerInstanceId === forced.instanceId, "記録された")
    assert(s.battle?.blockerInstanceId === null, "フラッシュ中はまだ宣言されていない")
    const life = s.players.p2.life
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(s.battle?.blockerInstanceId === forced.instanceId && s.battle?.blockerPid === "p1", "フラッシュ後に記録した個体がブロッカーになる（陣営はアタッカー側）")
    assert(s.battle?.forcedBlockerInstanceId === undefined, "記録は消費された")
    assert(s.isFlashTiming, "ブロック宣言後のフラッシュが開く")
    closeFlash(s)
    assert(s.battle === null, "バトルが終わった")
    assert(s.players.p1.trashCards.includes(WEAK) && !s.players.p1.field.spirits.some((x) => x.instanceId === forced.instanceId), "BPで負けた個体は持ち主(p1)のトラッシュへ")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === atk.instanceId), "アタッカーは残る")
    assert(s.players.p2.life === life, "ブロックされたのでライフは減らない")
}
{
    const { s, atk } = setup("fb1b", STRONG)
    force(s)
    closeFlash(s)
    assert(s.battle === null && s.players.p1.trashCards.includes(ATK), "アタッカーが負けても持ち主のトラッシュへ")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === atk.instanceId), "アタッカーは場にいない")
    assert(s.players.p2.field.spirits.length === 1, "防御側のスピリットは無傷")
}

console.log("=== 2. ブロックできない個体は疲労するがブロックは不発（裁定2） ===")
withEffects({ [OTHER]: [{ id: "t-cb", kind: "constraint", levels: [1], constraint: { type: "cantBlock" } }] }, () => {
    const { s, forced, defs } = setup("fb2", OTHER)
    force(s)
    assert(forced.isRested, "ブロックできなくても疲労はする")
    closeFlash(s)
    assert(s.battle?.blockerInstanceId === null && s.battle?.forcedBlockerInstanceId === undefined, "ブロックは不発")
    assert(act(s, "p2", { type: "block", instanceId: defs[0]!.instanceId }) === null, "防御側が自分のスピリットで宣言できる")
    assert(s.battle?.blockerInstanceId === defs[0]!.instanceId && s.battle?.blockerPid === undefined, "ブロッカーは防御側の個体")
})

console.log("=== 3. 応酬中に場を離れたら通常どおり（裁定3） ===")
{
    const { s, forced, defs } = setup("fb3", WEAK)
    force(s)
    destroySpirit(s, "p1", forced.instanceId)
    closeFlash(s)
    assert(s.battle?.blockerInstanceId === null, "宣言は不成立")
    assert(act(s, "p2", { type: "block", instanceId: defs[0]!.instanceId }) === null, "防御側が通常どおり宣言できる")
}

console.log("=== 4. 複数体でないとブロックできないアタッカー（裁定4） ===")
withEffects({ [ATK]: [{ id: "t-rc", kind: "constraint", levels: [1], constraint: { type: "blockRequiresCount", count: 2 } }] }, () => {
    const { s, forced, defs } = setup("fb4", OTHER)
    force(s)
    closeFlash(s)
    assert(s.battle?.blockerInstanceId === null && (s.battle?.pendingBlockerIds ?? []).join() === forced.instanceId, "記録した個体が1体目として貯まる")
    assert(act(s, "p2", { type: "takeLife" }) !== null, "宣言の途中でライフ受けはできない")
    assert(act(s, "p2", { type: "block", instanceId: defs[0]!.instanceId }) === null, "防御側が残りを足せる")
    const ids = [s.battle?.blockerInstanceId, ...(s.battle?.extraBlockerIds ?? [])].sort().join()
    assert(ids === [forced.instanceId, defs[0]!.instanceId].sort().join(), "2体のブロックが成立")
})
withEffects({ [ATK]: [{ id: "t-rc", kind: "constraint", levels: [1], constraint: { type: "blockRequiresCount", count: 2 } }] }, () => {
    const { s } = setup("fb4b", OTHER, [])
    force(s)
    closeFlash(s)
    assert((s.battle?.pendingBlockerIds ?? []).length === 0 && s.battle?.blockerInstanceId === null, "揃えられないなら不成立")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側はライフで受けられる")
})

console.log("=== 5. 陣営指定のブロック不可は自陣営に効かない（裁定5） ===")
withEffects({ [ATK]: [{ id: "t-ub", kind: "constraint", levels: [1], constraint: { type: "unblockableBy", opponentOnly: true } }] }, () => {
    const { s, forced } = setup("fb5", OTHER)
    force(s)
    closeFirstFlash(s)
    assert(s.battle?.blockerInstanceId === forced.instanceId, "陣営指定ならアタッカー側の個体はブロックできる")
})
withEffects({ [ATK]: [{ id: "t-ub", kind: "constraint", levels: [1], constraint: { type: "unblockableBy" } }] }, () => {
    const { s, forced, defs } = setup("fb5b", OTHER)
    force(s)
    assert(forced.isRested, "疲労はする")
    closeFlash(s)
    assert(s.battle?.blockerInstanceId === null, "陣営の指定が無い「ブロックされない」は効く＝不発")
    assert(act(s, "p2", { type: "block", instanceId: defs[0]!.instanceId }) !== null, "ブロックされないアタッカーを防御側もブロックできない")
})

console.log("=== 6. 勝敗の誘発は同陣営では発揮しない／ブロック時は通常どおり（裁定6） ===")
const drawWin = { id: "t-win", kind: "triggered", trigger: "onBattleWin", levels: [1], action: { type: "draw", count: 1 }, optional: false }
const drawBlock = { id: "t-blk", kind: "triggered", trigger: "onBlock", levels: [1], action: { type: "draw", count: 1 }, optional: false }
withEffects({ [ATK]: [drawWin] }, () => {
    // 対照：通常のブロック（防御側の個体）に勝てば発揮する
    const c = setup("fb6c", WEAK)
    const before = c.s.players.p1.hand.length
    closeFlash(c.s)
    act(c.s, "p2", { type: "block", instanceId: c.defs[0]!.instanceId })
    closeFlash(c.s)
    assert(c.s.players.p1.hand.length === before + 1, "対照：通常のバトルでは勝利時の効果が発揮する")
    const { s } = setup("fb6", WEAK)
    const b = s.players.p1.hand.length
    force(s)
    closeFlash(s)
    closeFlash(s)
    assert(s.battle === null && s.players.p1.hand.length === b, "同陣営のバトルでは勝利時の効果は発揮しない")
})
withEffects({ [WEAK]: [drawBlock] }, () => {
    const { s } = setup("fb6b", WEAK)
    const b = s.players.p1.hand.length
    force(s)
    closeFlash(s)
    assert(s.players.p1.hand.length === b + 1, "ブロッカー側のブロック時効果は持ち主(p1)のものとして誘発する")
})

console.log("=== 7. 同陣営のバトルでの破壊は「相手による破壊」ではない（誘発の洗い出し） ===")
const drawIfOpp = { id: "t-dd", kind: "triggered", trigger: "onDestroy", levels: [1], condition: { selfDestroyedByOpponent: true }, action: { type: "draw", count: 1 }, optional: false }
withEffects({ [WEAK]: [drawIfOpp] }, () => {
    const { s } = setup("fb7", WEAK)
    const b = s.players.p1.hand.length
    force(s)
    closeFlash(s)
    closeFlash(s)
    assert(s.players.p1.trashCards.includes(WEAK) && s.players.p1.hand.length === b, "同陣営のバトルで破壊されても「相手に破壊されたとき」は発揮しない")
})

console.log("すべてのチェックに合格しました 🎉（part655）")
