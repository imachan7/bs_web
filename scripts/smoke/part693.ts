// smoke パート693（BS13-065 八分儀の祠 Lv2：相手の効果以外ではコアを取り除けない。2026-10-30 ユーザー確認の規則1〜3）
// 「〜することで」のコストは効果の一部（取り除ける）／召喚コストの支払いは効果ではない（取り除けない）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス
const ELIM = "BS09-070" // エリミネイション（紫マジック・フラッシュ。「自分のスピリット上のコア1個をトラッシュに置くことで…」）
const OCTANT = "BS13-065" // 八分儀の祠
const ARCHER = "BS16-006" // アーチャー・ドラゴン（コスト5）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[VAN, "ロクケラトプス"], [ELIM, "エリミネイション"], [OCTANT, "八分儀の祠"], [ARCHER, "アーチャー・ドラゴン"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
}

// 開始盤面: p1 がメインステップのターンプレイヤー。盤面は空にして自分で置く
function game(seed: string, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 10
        p.trashCores = 0
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, kind: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field[kind].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function flash(s: GameState, pid: PlayerId): void {
    s.isFlashTiming = true
    s.priorityPlayer = pid
}

// 開始盤面: 祠の持ち主 p1、ターンプレイヤー p2（＝祠にとっての相手のメインステップ）。祠の核数で Lv を決める（3=Lv2 / 1=Lv1）
function scene(seed: string, octantCores: number, p2Hand: string[]) {
    const s = game(seed, [], p2Hand)
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    put(s, "p1", OCTANT, octantCores, "nexuses")
    const foe = put(s, "p1", VAN, 3)
    const mine = put(s, "p2", VAN, 6)
    return { s, foe, mine }
}

console.log("=== A. 祠 Lv2: 「〜することで」のコスト（効果の一部）なら相手のスピリットのコアも払える ===")
{
    const { s, foe, mine } = scene("a", 3, [ELIM])
    flash(s, "p2")
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(err === null, `A: エリミネイションを使える（${err}）`)
    assert(mine.cores === 5, `A: コストで自分のスピリットのコア1個が払われる: ${mine.cores}`)
    assert(foe.cores === 2, `A: 効果が発揮され、祠の持ち主側のスピリットのコア1個が動く: ${foe.cores}`)
}

console.log("=== B. 祠 Lv2: 召喚コストの支払い（効果ではない）では取り除けない ===")
{
    const { s, mine } = scene("b", 3, [ARCHER])
    const err = act(s, "p2", { type: "summon", handIndex: 0, paySources: [{ instanceId: mine.instanceId, count: 4 }] })
    assert(err !== null, "B: 召喚コストにスピリットのコアは使えない")
    assert(mine.cores === 6, "B: コアは動かない")
}

console.log("=== C. 対照: 祠が Lv1 ならどちらも通る ===")
{
    const { s, foe, mine } = scene("c-a", 1, [ELIM])
    flash(s, "p2")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "C: エリミネイションを使える")
    assert(mine.cores === 5 && foe.cores === 2, `C: コストも効果も通る: ${mine.cores}/${foe.cores}`)
    const t = scene("c-b", 1, [ARCHER])
    const err = act(t.s, "p2", { type: "summon", handIndex: 0, paySources: [{ instanceId: t.mine.instanceId, count: 4 }] })
    assert(err === null, `C: Lv1 なら召喚コストにも使える（${err}）`)
    assert(t.mine.cores === 2, "C: 4個払って2個残る")
}

console.log("すべてのチェックに合格しました 🎉（part693）")
