// smoke パート301（「フィールドに残る／戻る」でも『破壊時』効果は発揮する。2026-09-08 ユーザー確認）
// 「フィールドに残る／戻る」は破壊を無効にするのではなく、**破壊待機状態を経て破壊で誘発された
// 効果をすべて解決したあと、トラッシュに置かれる代わりに場へ戻す**効果。
// 詳細は docs/design/TIMING_CHART.md「『フィールドに残る／戻る』と『破壊時』」
import { assert, createGame, createInstance, destroySpirit, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 残ったスピリット自身の『破壊時』効果が発揮する（BS13-X02 ＋ BS13-012） ===")
{
    const s = game("revive-fires-ondestroy")
    const p1 = s.players.p1
    // X02 Lv2：系統「光導」/「妖蛇」を持つ自分のスピリットすべては、
    // BPを比べ破壊されたとき回復状態でフィールドに残る
    p1.field.spirits.push(createInstance("BS13-X02", s.turn, 4))
    // ジャイナガン（系統「妖蛇」）は『破壊時』に「相手のスピリットのコア1個を相手のトラッシュへ」
    const jaina = createInstance("BS13-012", s.turn, 1)
    p1.field.spirits.push(jaina)
    const enemy = createInstance("BS13-013", s.turn, 3)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)

    const before = enemy.cores
    const destroyed = destroySpirit(s, "p1", jaina.instanceId, "destroy", {
        battle: { attackerColors: ["red"], attackerBp: 99999 },
    })
    assert(
        destroyed === true,
        "destroySpirit は true を返す（場に残っても破壊自体は成立している）",
    )
    assert(enemy.cores === before - 1, "残ったスピリット自身の『破壊時』効果が発揮した")
    const still = p1.field.spirits.find((sp) => sp.instanceId === jaina.instanceId)
    assert(still !== undefined, "そのうえでフィールドに残っている")
    assert(still!.isRested === false, "効果文の指定どおり回復状態で残る")
    assert(still!.cores === 1, "上のコアはそのまま（Lvも変わらない）")
    assert(!p1.trashCards.includes("BS13-012"), "トラッシュには置かれない")
}

console.log("=== 対照：残らない場合は普通にトラッシュへ行き、『破壊時』も1回だけ発揮する ===")
{
    const s = game("no-revive")
    const p1 = s.players.p1
    // X02 を置かない＝「フィールドに残る」の付与が無い
    const jaina = createInstance("BS13-012", s.turn, 1)
    p1.field.spirits.push(jaina)
    const enemy = createInstance("BS13-013", s.turn, 3)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)

    const before = enemy.cores
    destroySpirit(s, "p1", jaina.instanceId, "destroy", {
        battle: { attackerColors: ["red"], attackerBp: 99999 },
    })
    assert(enemy.cores === before - 1, "『破壊時』効果は1回だけ発揮する（二重発火しない）")
    assert(
        p1.field.spirits.every((sp) => sp.instanceId !== jaina.instanceId),
        "残る効果が無ければフィールドから離れる",
    )
    assert(p1.trashCards.includes("BS13-012"), "トラッシュに置かれる")
}

console.log("すべてのチェックに合格しました 🎉（part301）")
