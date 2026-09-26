// smoke パート393（コアを「取り除く」器 removeCores：side4種・from単／複ゾーン・target5種・to3種・
// count all/toLowerLevel/countCounter・leaveAtLeast・downTo（数値／equalize）・chooser owner・
// AIの自動選択の向き・下限（coreFloorByCost）で取れないこと）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ・Lv1BP1000）
const GREEN = "BS01-051" // フライングミラージュ（緑・コスト1・バニラ・Lv1BP2000）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1・バニラ・Lv1BP1000）
const LEVELED = "BS10-056" // 蒼天大聖モンゴクウ（青・Lv1コア1/Lv2コア3/Lv3コア6）
const FLOOR_NEXUS = "BS08-059" // 聖なる柱状彫刻（『お互いのアタックステップ』スピリットのコアはLv1コスト未満にならない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors.includes("red"), "REDは赤")
    assert(getCard(GREEN).name === "フライングミラージュ" && getCard(GREEN).colors.includes("green"), "GREENは緑")
    assert(getCard(WHITE).name === "バーサーカー・ガン" && getCard(WHITE).colors.includes("white"), "WHITEは白")
    assert(getCard(LEVELED).name === "蒼天大聖モンゴクウ" && getCard(LEVELED).levels.length === 3, "LEVELEDは3段階Lv")
    assert(getCard(FLOOR_NEXUS).name === "聖なる柱状彫刻" && getCard(FLOOR_NEXUS).type === "nexus", "FLOOR_NEXUSはネクサス")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. side: opponent（既定）・target one・to reserve ===")
{
    const s = game("side-opp")
    const enemy = put(s, "p2", RED, 2)
    resolveAction(s, "p1", null, { type: "removeCores", count: 1 })
    assert(enemy.cores === 1, "相手のスピリットからコアが1個減る")
    assert(s.players.p2.reserve === 1, "相手のリザーブに1個置かれる")
}

console.log("=== 2. side: own・to trash ===")
{
    const s = game("side-own")
    const mine = put(s, "p1", RED, 2)
    resolveAction(s, "p1", null, { type: "removeCores", side: "own", to: "trash", count: 1 })
    assert(mine.cores === 1 && s.players.p1.trashCores === 1, "自分のスピリットからトラッシュへ1個")
}

console.log("=== 3. side: any（自分/相手どちらか実効BP最大） ===")
{
    const s = game("side-any")
    // cores=1のまま（=Lv1）にしてBPを素のカード値で比べる。cores2以上だとLvが上がりBPが変わってしまう
    const mineWeak = put(s, "p1", RED, 1) // Lv1 BP1000
    const enemyStrong = put(s, "p2", GREEN, 1) // Lv1 BP2000
    resolveAction(s, "p1", null, { type: "removeCores", side: "any", count: 1 })
    assert(enemyStrong.cores === 0 && mineWeak.cores === 1, "anyはBP最大（相手GREEN）を選ぶ")
}

console.log("=== 4. side: both（お互いそれぞれ自分の分を処理） ===")
{
    const s = game("side-both")
    const mine = put(s, "p1", RED, 2)
    const enemy = put(s, "p2", GREEN, 2)
    resolveAction(s, "p1", null, { type: "removeCores", side: "both", to: "trash", count: 1 })
    assert(mine.cores === 1 && enemy.cores === 1, "both は両陣営とも1個ずつ減る")
    assert(s.players.p1.trashCores === 1 && s.players.p2.trashCores === 1, "各持ち主のトラッシュへ")
}

console.log("=== 5. from 複数ゾーン（spirit+reserve）のspread：対話は1個ずつ取り先を選ぶ ===")
{
    const s = game("from-multi", true)
    const enemySpirit = put(s, "p2", RED, 2)
    s.players.p2.reserve = 1
    resolveAction(s, "p1", null, { type: "removeCores", from: ["spirit", "reserve"], target: "spread", to: "void", count: 2 })
    assert(s.pendingChoice !== null && s.pendingChoice?.kind === "target", "取り先の選択待ちが立つ")
    assert(s.pendingChoice!.candidates.length === 2, "候補はスピリットとリザーブの2つ")
    const reserveCandidate = s.pendingChoice!.candidates.find((c) => c !== enemySpirit.instanceId)!
    assert(act(s, "p1", { type: "resolveChoice", instanceId: reserveCandidate }) === null, "リザーブを選ぶ")
    assert(s.players.p2.reserve === 0, "リザーブから1個ボイドへ")
    // 残りの取り先候補がスピリット1つだけになったので、requestChoiceの「候補1件は即決」で自動的に続きが解決する
    assert(s.pendingChoice === null, "候補が1件になったので選択待ちを挟まず自動で解決する")
    assert(enemySpirit.cores === 1, "スピリットから1個ボイドへ")
}

console.log("=== 6. to: void（消える。リザーブ/トラッシュは増えない） ===")
{
    const s = game("to-void")
    const enemy = put(s, "p2", RED, 2)
    resolveAction(s, "p1", null, { type: "removeCores", to: "void", count: 1 })
    assert(enemy.cores === 1 && s.players.p2.reserve === 0 && s.players.p2.trashCores === 0, "voidは消える")
}

console.log("=== 7. target: all（条件を満たす全個体からcount個ずつ） ===")
{
    const s = game("target-all")
    const e1 = put(s, "p2", RED, 3)
    const e2 = put(s, "p2", GREEN, 3)
    resolveAction(s, "p1", null, { type: "removeCores", target: "all", to: "trash", count: 1 })
    assert(e1.cores === 2 && e2.cores === 2, "全員から1個ずつ")
    assert(s.players.p2.trashCores === 2, "合計2個トラッシュへ")
}

console.log("=== 8. target: self（発生源自身） ===")
{
    const s = game("target-self")
    const me = put(s, "p1", RED, 2)
    resolveAction(s, "p1", me, { type: "removeCores", side: "own", target: "self", count: 1 })
    assert(me.cores === 1 && s.players.p1.reserve === 1, "自分自身から1個")
}

console.log("=== 9. target: event（誘発のきっかけの個体をtargetInstanceIdで渡す） ===")
{
    const s = game("target-event")
    const enemy = put(s, "p2", RED, 2)
    resolveAction(s, "p1", null, { type: "removeCores", target: "event", to: "trash", count: 1 }, enemy.instanceId)
    assert(enemy.cores === 1 && s.players.p2.trashCores === 1, "イベントで渡された個体から取り除く")
}

console.log("=== 10. count: all（対象上のコアすべて） ===")
{
    const s = game("count-all")
    const enemy = put(s, "p2", RED, 4)
    resolveAction(s, "p1", null, { type: "removeCores", count: "all" })
    assert(enemy.cores === 0 && s.players.p2.reserve === 4, "全部リザーブへ")
}

console.log("=== 11. count: toLowerLevel（1つ下のLvのコア数まで） ===")
{
    const s = game("count-lower")
    const enemy = put(s, "p2", LEVELED, 6) // Lv3
    resolveAction(s, "p1", null, { type: "removeCores", count: "toLowerLevel", to: "trash" })
    assert(enemy.cores === 3, "Lv3(6個)からLv2の閾値(3個)まで下がる")
}

console.log("=== 12. count: countCounter（ownReserve×1） ===")
{
    const s = game("count-counter")
    s.players.p1.reserve = 2
    const enemy = put(s, "p2", RED, 5)
    resolveAction(s, "p1", null, { type: "removeCores", count: 1, countCounter: "ownReserve" })
    assert(enemy.cores === 3, "自分のリザーブ2個ぶん＝2個取り除く")
}

console.log("=== 13. leaveAtLeast（下限を残す） ===")
{
    const s = game("leave-at-least")
    const enemy = put(s, "p2", RED, 3)
    resolveAction(s, "p1", null, { type: "removeCores", count: "all", leaveAtLeast: 1 })
    assert(enemy.cores === 1, "1個は残る")
}

console.log("=== 14. downTo: 数値（合計がlimit以下になるまで1個ずつ） ===")
{
    const s = game("down-to-number")
    const e1 = put(s, "p2", RED, 2)
    const e2 = put(s, "p2", GREEN, 2)
    resolveAction(s, "p1", null, { type: "removeCores", from: ["spirit"], to: "void", downTo: 1, count: 0 })
    assert(e1.cores + e2.cores === 1, "相手のスピリット上のコア合計が1個になるまで取り除く")
}

console.log("=== 15. downTo: equalize（多い方が少ない方に揃える） ===")
{
    const s = game("down-to-equalize")
    put(s, "p1", RED, 5)
    s.players.p2.reserve = 2
    resolveAction(s, "p1", null, { type: "removeCores", from: ["spirit", "reserve"], to: "void", downTo: "equalize", count: 0 })
    const totalP1 = s.players.p1.field.spirits.reduce((n, sp) => n + sp.cores, 0) + s.players.p1.reserve
    assert(totalP1 === 2, "多かった自分側が相手の合計2個まで減る")
}

console.log("=== 16. chooser: owner（コアを失う側が選ぶ） ===")
{
    const s = game("chooser-owner", true)
    // 候補1件だと「候補1件は即決」で選択待ちを挟まないため、2件用意して選択待ちを立たせる
    put(s, "p2", RED, 2)
    put(s, "p2", GREEN, 2)
    resolveAction(s, "p1", null, { type: "removeCores", target: "spread", chooser: "owner", count: 1 })
    assert(s.pendingChoice !== null && s.pendingChoice?.pid === "p2", "選ぶのはコアを失う相手")
}

console.log("=== 17. 自動選択の向き：使用者が選ぶ＝コア最少／相手が選ぶ＝コア最多 ===")
{
    const s = game("auto-direction-owner")
    const few = put(s, "p2", RED, 1)
    const many = put(s, "p2", GREEN, 3)
    resolveAction(s, "p1", null, { type: "removeCores", target: "spread", count: 1 })
    assert(few.cores === 0 && many.cores === 3, "使用者が選ぶ＝コア最少の相手スピリットから")
}
{
    const s = game("auto-direction-target")
    const few = put(s, "p2", RED, 1)
    const many = put(s, "p2", GREEN, 3)
    resolveAction(s, "p1", null, { type: "removeCores", target: "spread", chooser: "owner", count: 1 })
    assert(few.cores === 1 && many.cores === 2, "相手が選ぶ＝コア最多の自分のスピリットから（損の小さい方）")
}

console.log("=== 18. コア下限（coreFloorByCost）で取れない ===")
{
    const s = game("floor")
    s.phase = "attack"
    putNexus(s, "p1", FLOOR_NEXUS, 0)
    const enemy = put(s, "p2", LEVELED, 6) // Lv3。Lv1コスト(=instMinLevelCores)未満にはならない
    const floor = enemy.cores // 後で比較用に使わないダミー参照回避
    void floor
    resolveAction(s, "p1", null, { type: "removeCores", count: "all" })
    // FLOOR_NEXUSはお互いのアタックステップで有効。LEVELEDのLv1コスト（=Lv1に必要なコア数）までしか減らない
    assert(enemy.cores >= 1, "Lv1コスト未満には減らない")
}

console.log("=== お互い・それぞれの持ち主が選ぶ：ターンプレイヤーから順に、自分のスピリットを選ぶ ===")
{
    const s = game("both-owner-choose", true)
    s.turnPlayer = "p1"
    const a1 = put(s, "p1", RED, 3)
    const a2 = put(s, "p1", GREEN, 3)
    const b1 = put(s, "p2", RED, 3)
    const b2 = put(s, "p2", GREEN, 3)
    resolveAction(s, "p1", null, { type: "removeCores", side: "both", target: "spread", to: "void", count: 1, chooser: "owner" })
    assert(s.pendingChoice?.pid === "p1", "先にターンプレイヤー（p1）が選ぶ")
    assert(
        s.pendingChoice !== null && s.pendingChoice.candidates.every((id) => id === a1.instanceId || id === a2.instanceId),
        "p1 の候補は自分のスピリットだけ",
    )
    assert(act(s, "p1", { type: "resolveChoice", instanceId: a2.instanceId }) === null, "p1 が自分のスピリットを選ぶ")
    assert(a2.cores === 2 && a1.cores === 3, "p1 の選んだスピリットから1個")
    assert(s.pendingChoice?.pid === "p2", "続いて p2 が選ぶ")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: b1.instanceId }) === null, "p2 が自分のスピリットを選ぶ")
    assert(b1.cores === 2 && b2.cores === 3, "p2 の選んだスピリットから1個")
    assert(s.pendingChoice === null, "選択待ちは残らない")
}

console.log("すべてのチェックに合格しました 🎉（part393）")
