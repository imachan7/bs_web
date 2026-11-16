// smoke パート957（合体中のブレイヴだけが破壊されたら、【合体時】『このスピリットの破壊時』は発揮しない。
// PENDING_STATE §3 C5。2026-11-16 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"
import { destroySpirit } from "../../server/src/logic/removal"

const CITRI = "BS21-057" // 冥獣騎シトリー（【合体時】『このスピリットの破壊時』相手のスピリット2体を疲労させる）
const NEKO = "BS19-093" // ネコロン山（Lv2：自分の合体スピリットのブレイヴだけが破壊されたとき、そのブレイヴを手札に戻せる）
const BELL = "BS01-089" // デュアルキャノン・ベル（コスト3以上・効果なし）
const ROKU = "BS01-002" // ロクケラトプス（効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const e = getCard(CITRI).effects.find((x) => x.kind === "triggered" && x.trigger === "onDestroy")
    assert(getCard(CITRI).name === "冥獣騎シトリー" && getCard(CITRI).type === "brave" && e?.kind === "triggered" && e.whileCombined === true && e.action.type === "exhaust", "シトリーは【合体時】の破壊時に相手を疲労させる")
    assert(getCard(NEKO).name === "ネコロン山" && getCard(NEKO).effects.some((x) => x.kind === "fieldEvent" && x.event === "ownBraveOnlyDestroyed"), "ネコロン山はブレイヴだけの破壊で誘発する")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost >= 3 && getCard(BELL).effects.length === 0 && getCard(ROKU).effects.length === 0, "ベルはコスト3以上・効果なし、ロクケラトプスは効果なし")
}

function game(seed: string): { s: GameState; host: CardInstance; brave: CardInstance; enemies: CardInstance[] } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.hand = []
    const host = createInstance(BELL, 1, 3)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance(CITRI, 1, 0)
    attachBrave(s, "p1", host, brave)
    const enemies = [createInstance(ROKU, 1, 1), createInstance(ROKU, 1, 1)]
    s.players.p2.field.spirits.push(...enemies)
    refreshLevelAsOverrides(s)
    return { s, host, brave, enemies }
}
const onField = (s: GameState, pid: PlayerId, inst: CardInstance) => s.players[pid].field.spirits.includes(inst)

console.log("=== 1. ブレイヴだけが破壊された：【合体時】『このスピリットの破壊時』は発揮しない ===")
{
    const { s, host, enemies } = game("brave-only")
    resolveAction(s, "p2", null, { type: "destroyBrave" })
    assert(s.players.p1.trashCards.includes(CITRI) && onField(s, "p1", host) && host.braveRefs === undefined, "ブレイヴだけがトラッシュへ行き、スピリットは残る")
    assert(s.pendingChoice === null && enemies.every((e) => !e.isRested), "相手のスピリットは疲労しない")
}

console.log("=== 2. 合体スピリットが破壊された：【合体時】『このスピリットの破壊時』は発揮する ===")
{
    const { s, host, enemies } = game("host")
    destroySpirit(s, "p1", host.instanceId)
    assert(!onField(s, "p1", host) && s.players.p1.trashCards.includes(BELL), "スピリットは破壊される")
    assert(enemies.every((e) => e.isRested), "相手のスピリット2体が疲労する")
}

console.log("=== 3. ブレイヴだけが破壊された：ネコロン山 Lv2 でそのブレイヴを手札に戻せる ===")
{
    const { s, enemies } = game("neko")
    s.interactiveTargets = false
    s.players.p1.field.nexuses.push(createInstance(NEKO, 1, 3))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p2", null, { type: "destroyBrave" })
    assert(s.players.p1.hand.includes(CITRI) && !s.players.p1.trashCards.includes(CITRI), "ブレイヴは手札に戻る")
    assert(enemies.every((e) => !e.isRested), "相手のスピリットは疲労しない")
}

console.log("すべてのチェックに合格しました 🎉（part957）")
