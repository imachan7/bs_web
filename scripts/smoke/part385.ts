// smoke パート385（期間つきの「ブロックされない」を unblockable { from } 1つにまとめた後の挙動。
// 条件つきでも「ブロックされない効果を持つ」に数える＝2026-09-25 ユーザー決定。ゲッコ・グライダーは読むたびにホストを見る）
import { assert, createGame, createInstance, currentLevel, getCard, refreshLevelAsOverrides, resolveAction, timedHas } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { attachBrave, detachBraveByEffect } from "../../server/src/logic/removal"
import { canBlock } from "../../shared/block"

function game(id: string): GameState {
    const s = createGame(id, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}
function put(s: GameState, pid: "p1" | "p2", cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function firstAction(cardId: string, kind: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => x.kind === kind && JSON.stringify(x).toLowerCase().includes("unblockable")) as { action: EffectAction } | undefined
    assert(e !== undefined, `${cardId}：${kind} の効果がある`)
    return e!.action
}
function redVoice(s: GameState): void {
    const magic = getCard("BS11-083").effects.find((e) => e.kind === "magic") as { action: EffectAction }
    resolveAction(s, "p2", null, JSON.parse(JSON.stringify(magic.action)) as EffectAction, undefined, undefined, "magic")
}
const alive = (s: GameState, id: string) => s.players.p1.field.spirits.some((x) => x.instanceId === id)

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS13-032").name === "光速の騎士ヘルモード", "BS13-032 はヘルモード")
    assert(getCard("BS10-073").name === "エンジェドール", "BS10-073 はエンジェドール")
    assert(getCard("BS12-055").name === "ゲッコ・グライダー", "BS12-055 はゲッコ・グライダー")
    assert(getCard("BS11-083").name === "レッドボイス", "BS11-083 はレッドボイス")
    assert(getCard("BS01-031").levels[1]?.bp === 7000 && getCard("BS01-001").levels[0]?.bp === 1000, "デス・ハーデス Lv2 は7000、ゴラドン Lv1 は1000")
}

console.log("=== 1. ヘルモード：BP6000以上の相手からだけブロックされない。レッドボイスで破壊される ===")
{
    const s = game("p385-hell")
    const hell = put(s, "p1", "BS13-032", 4)
    resolveAction(s, "p1", hell, firstAction("BS13-032", "triggered"))
    const big = put(s, "p2", "BS01-031", 4) // BP7000
    const small = put(s, "p2", "BS01-001", 1) // BP1000
    assert(canBlock(s, "p2", big, "p1", hell) !== null, "BP7000 のスピリットはブロックできない")
    assert(canBlock(s, "p2", small, "p1", hell) === null, "BP1000 のスピリットはブロックできる")
    redVoice(s)
    assert(!alive(s, hell.instanceId), "条件つきでも「ブロックされない」効果を持つので、レッドボイスで破壊される")
}

console.log("=== 2. エンジェドール：自分のスピリットすべて（後から出たものも）が Lv2 の相手からブロックされない ===")
{
    const s = game("p385-angel")
    resolveAction(s, "p1", null, firstAction("BS10-073", "triggered"))
    const later = put(s, "p1", "BS01-025", 1) // 効果の後に出たスピリット
    const lv2 = put(s, "p2", "BS01-001", 3)
    const lv1 = put(s, "p2", "BS01-031", 1)
    assert(currentLevel(lv2).level === 2 && currentLevel(lv1).level === 1, "ブロッカーは Lv2 と Lv1")
    assert(canBlock(s, "p2", lv2, "p1", later) !== null, "Lv2 はブロックできない")
    assert(canBlock(s, "p2", lv1, "p1", later) === null, "Lv1 はブロックできる")
    assert(!timedHas(s, lv2, "unblockable"), "相手のスピリットには掛からない")
    redVoice(s)
    assert(!alive(s, later.instanceId), "レッドボイスで破壊される")
}

console.log("=== 3. ゲッコ・グライダー：分離したら元のホストには効かず、合体し直した先に効く ===")
{
    const s = game("p385-gecko")
    const host = put(s, "p1", "BS01-001", 1)
    const other = put(s, "p1", "BS01-025", 1)
    const glider = createInstance("BS12-055", s.turn, 0)
    attachBrave(s, "p1", host, glider)
    resolveAction(s, "p1", glider, firstAction("BS12-055", "triggered"))
    const blocker = put(s, "p2", "BS01-031", 1)
    assert(canBlock(s, "p2", blocker, "p1", host) !== null, "合体しているホストはブロックされない")
    detachBraveByEffect(s, "p1", host, glider)
    assert(canBlock(s, "p2", blocker, "p1", host) === null, "分離した後の元ホストはブロックできる")
    assert(canBlock(s, "p2", blocker, "p1", glider) === null, "スピリット状態のブレイヴ自身もブロックできる")
    attachBrave(s, "p1", other, glider)
    assert(canBlock(s, "p2", blocker, "p1", other) !== null, "同じターンに合体し直した先はブロックされない")
    redVoice(s)
    assert(!alive(s, other.instanceId) && alive(s, host.instanceId), "レッドボイスはいまのホストだけを破壊する")
}

console.log("すべてのチェックに合格しました 🎉（part385）")
