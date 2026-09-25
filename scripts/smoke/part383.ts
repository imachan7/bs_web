// smoke パート383（シンボルを固定されたスピリットには、追加・失う・ブレイヴのシンボルが効かない。2026-09-25 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"
import { countSymbols, instanceSymbolCount } from "../../shared/rules"

const CITY = "BS08-066" // 海底に眠りし古代都市（Lv2：異合のスピリットのシンボルを同じ色2つにする）
const DANSTON = "BS03-081" // 人馬巨兵ダンストン（異合・青シンボル1）
const BARI = "BS10-063" // 飛槍獣バリ・スター（ブレイヴ・赤シンボル1）
const VACUUM = "BS12-080" // バキュームシンボル
const DOUBLE_HEART = "BS03-121" // ダブルハート

function magicAction(cardId: string): EffectAction {
    const magic = getCard(cardId).effects.find((e) => e.kind === "magic") as { action: EffectAction } | undefined
    assert(magic !== undefined, `${cardId}：マジックの効果がある`)
    return JSON.parse(JSON.stringify(magic!.action)) as EffectAction
}

function vacuumBlue(s: GameState): void {
    const action = magicAction(VACUUM) as unknown as { content: { color?: string }[] }
    action.content[0]!.color = "blue"
    resolveAction(s, "p2", null, action as unknown as EffectAction, undefined, undefined, "magic")
}

// cityCores：3 なら Lv2（固定が掛かる）、0 なら Lv1（掛からない）
function game(cityCores: number): { s: GameState; spirit: ReturnType<typeof createInstance> } {
    const s = createGame("p383", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    const spirit = createInstance(DANSTON, 1, 3)
    s.players.p1.field.spirits = [spirit]
    s.players.p1.field.nexuses = [createInstance(CITY, 1, cityCores)]
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    refreshLevelAsOverrides(s)
    return { s, spirit }
}

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CITY).name === "海底に眠りし古代都市", "BS08-066 は海底に眠りし古代都市")
    assert(getCard(DANSTON).name === "人馬巨兵ダンストン" && getCard(DANSTON).family.includes("異合"), "BS03-081 は異合のダンストン")
    assert(getCard(BARI).name === "飛槍獣バリ・スター" && getCard(BARI).type === "brave", "BS10-063 はブレイヴのバリ・スター")
    assert(getCard(VACUUM).name === "バキュームシンボル", "BS12-080 はバキュームシンボル")
    assert(getCard(DOUBLE_HEART).name === "ダブルハート", "BS03-121 はダブルハート")
}

console.log("=== 1. 固定（古代都市 Lv2）はブレイヴのシンボルより強い ===")
{
    const { s, spirit } = game(3)
    assert(instanceSymbolCount(spirit) === 2, "合体前：ダンストンは青2つ")
    const bari = createInstance(BARI, 1, 0)
    s.players.p1.field.spirits.push(bari)
    attachBrave(s, "p1", spirit, bari)
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(spirit) === 2, "合体後もシンボルは2つのまま")
    assert(countSymbols(s.players.p1, ["red"]) === 0, "バリ・スターの赤シンボルは数えない")
    assert(countSymbols(s.players.p1, ["blue"]) === 3, "場の青シンボルは3つ（ダンストン2＋古代都市1）")
}

console.log("=== 2. 固定されたシンボルは、失う効果（バキュームシンボル）で減らない ===")
{
    const { s, spirit } = game(3)
    vacuumBlue(s)
    assert(instanceSymbolCount(spirit) === 2, "ダンストンは青2つのまま")
    assert(countSymbols(s.players.p1, ["blue"]) === 3, "場の青シンボルは3つのまま")
}

console.log("=== 3. 固定されたシンボルは、追加する効果（ダブルハート）で増えない ===")
{
    const { s, spirit } = game(3)
    resolveAction(s, "p1", null, magicAction(DOUBLE_HEART), undefined, undefined, "magic")
    assert(instanceSymbolCount(spirit) === 2, "ダンストンは2つのまま")
    assert(countSymbols(s.players.p1, ["blue"]) === 3, "場の青シンボルは3つのまま")
}

console.log("=== 4. 固定されていなければ、失う・追加するは効く ===")
{
    const { s, spirit } = game(0)
    assert(instanceSymbolCount(spirit) === 1, "古代都市 Lv1：ダンストンは青1つ")
    resolveAction(s, "p1", null, magicAction(DOUBLE_HEART), undefined, undefined, "magic")
    assert(instanceSymbolCount(spirit) === 2, "ダブルハートで2つ")
    const t = game(0)
    vacuumBlue(t.s)
    assert(instanceSymbolCount(t.spirit) === 0, "バキュームシンボルで青を失い0")
}

console.log("すべてのチェックに合格しました 🎉（part383）")
