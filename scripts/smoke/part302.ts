// smoke パート302（破壊で誘発した効果を1列に並べ、ターンプレイヤーが順番を決める。2026-09-08 ユーザー指示）
// 列に入るのは ①破壊されたカード自身の『破壊時』 ②他カードの「〜が破壊されたとき」
// ③「フィールドに残る／戻る」。③が解決した時点でその破壊は無かったことになり、列の残りは空振りする。
// docs/design/TIMING_CHART.md ／ docs/design/RULES_BATSPI_WIKI.md §1
import { act, assert, createGame, createInstance, destroySpirit, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import { destroySpiritsFrom } from "../../server/src/logic/removal"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

// X02 Lv2（光導/妖蛇は BPを比べ破壊されたとき回復状態で残る）と、
// 『破壊時』に「相手のコア1個を相手のトラッシュへ」を持つ妖蛇のジャイナガンを並べる
function setup(seed: string): { s: GameState; jaina: ReturnType<typeof createInstance>; enemy: ReturnType<typeof createInstance> } {
    const s = game(seed)
    s.players.p1.field.spirits.push(createInstance("BS13-X02", s.turn, 4))
    const jaina = createInstance("BS13-012", s.turn, 1)
    s.players.p1.field.spirits.push(jaina)
    const enemy = createInstance("BS13-013", s.turn, 3)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    return { s, jaina, enemy }
}

const battleContext = { battle: { attackerColors: ["red" as const], attackerBp: 99999 } }

console.log("=== 2件が同時に誘発するので、ターンプレイヤーに解決順を聞く ===")
{
    const { s } = setup("order-ask")
    const jaina = s.players.p1.field.spirits[1]!
    destroySpirit(s, "p1", jaina.instanceId, "destroy", battleContext)
    assert(s.pendingChoice !== null, "解決順の選択が出る")
    assert(s.pendingChoice!.kind === "option", "option 形式の選択")
    assert(s.pendingChoice!.triggerOrder !== undefined, "誘発の解決順を聞く選択（triggerOrder）")
    assert(s.pendingChoice!.pid === s.turnPlayer, "聞かれるのはターンプレイヤー")
    const options = s.pendingChoice!.options ?? []
    assert(options.length === 2, "選択肢は2つ（自身の『破壊時』と「フィールドに残る」）")
    assert(
        options.some((o) => o.includes("破壊時")) && options.some((o) => o.includes("フィールドに残る")),
        "自身の『破壊時』と「フィールドに残る」が両方並ぶ",
    )
}

console.log("=== 『破壊時』を先に選ぶ：効果が発揮され、そのあと場に残る ===")
{
    const { s, enemy } = setup("order-trigger-first")
    const jaina = s.players.p1.field.spirits[1]!
    const before = enemy.cores
    destroySpirit(s, "p1", jaina.instanceId, "destroy", battleContext)
    const triggerOption = (s.pendingChoice!.options ?? []).find((o) => o.includes("破壊時"))!
    assert(act(s, "p1", { type: "resolveChoice", option: triggerOption }) === null, "『破壊時』を先に選ぶ")
    assert(enemy.cores === before - 1, "『破壊時』効果が発揮した")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === jaina.instanceId),
        "そのあと「フィールドに残る」も解決して場に残る",
    )
    assert(!s.players.p1.trashCards.includes("BS13-012"), "トラッシュには置かれない")
}

console.log("=== 「フィールドに残る」を先に選ぶ：破壊が無かったことになり、『破壊時』は発揮しない ===")
{
    const { s, enemy } = setup("order-revive-first")
    const jaina = s.players.p1.field.spirits[1]!
    const before = enemy.cores
    destroySpirit(s, "p1", jaina.instanceId, "destroy", battleContext)
    const reviveOption = (s.pendingChoice!.options ?? []).find((o) => o.includes("フィールドに残る"))!
    assert(act(s, "p1", { type: "resolveChoice", option: reviveOption }) === null, "「フィールドに残る」を先に選ぶ")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === jaina.instanceId),
        "場に残る",
    )
    assert(
        enemy.cores === before,
        "先に残ったので、以降の破壊誘発（自身の『破壊時』）は処理されない（RULES_BATSPI_WIKI §1）",
    )
}

console.log("=== 【不死】も同じ列に並ぶ（かつては破壊の外側で別の2択だった） ===")
{
    const { s } = setup("order-fushi")
    s.phase = "attack" // 【不死】は『お互いのアタックステップ』限定
    // BS13-012 ジャイナガンは【不死：コスト7/8】。引き金はコスト7/8の自分のスピリットの破壊
    s.players.p1.trashCards.push("BS13-012")
    // コスト7の自分のスピリット（恐竜王メガロ・ザウル）を破壊する
    const bait = createInstance("BS13-008", s.turn, 1)
    s.players.p1.field.spirits.push(bait)
    refreshLevelAsOverrides(s)
    destroySpiritsFrom(s, [{ pid: "p1", instanceId: bait.instanceId }], 0, 0)
    // メガロ・ザウルは『破壊時』を持たず、この破壊で誘発するのは【不死】だけ＝列は1件。
    // 1件なら順番を聞かずにそのまま解決するので、出るのは【不死】の召喚確認になる
    assert(s.pendingChoice !== null, "【不死】の確認が出る")
    assert(s.pendingChoice!.fushiSummon !== undefined, "【不死】がこの破壊の列から解決された")
    assert(
        s.pendingChoice!.destroyOrder === undefined,
        "かつての「破壊と【不死】のどちらを先に」の2択はもう出ない（列に統合した）",
    )
}

console.log("すべてのチェックに合格しました 🎉（part302）")
