// smoke パート33（第三弾 BS03 色・シンボル・レベル操作4枚）
// 収録セクション:
//   - kind colorAs（BS03-053 百面相のフラットフェイス：Lv2で白、Lv3で紫。レベル表記は完全一致で有効）
//   - triggered onSummon + grantColorAll（BS03-058 妖精ティングリー）
//   - magic action addSymbolThisTurn（BS03-121 ダブルハート：ライフダメージ+1）
//   - magic action levelUpThisTurn（BS03-141 ビルドアップ：Lv+1、最大Lvでキャップ）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { fireTrigger, instHasColor } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"

console.log("=== BS03-053 百面相のフラットフェイス：Lv2は白、Lv3は紫として扱われる ===")
{
    const s = createGame(
        "flatface-colouras-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "red" },
    )
    runTurnStart(s)
    const face = createInstance("BS03-053", s.turn, 1) // Lv1
    s.players.p1.field.spirits.push(face)
    refreshLevelAsOverrides(s)
    assert(!instHasColor(face, "white"), "Lv1では白として扱われない")
    assert(!instHasColor(face, "purple"), "Lv1では紫として扱われない")

    face.cores = 3 // Lv2
    refreshLevelAsOverrides(s)
    assert(instHasColor(face, "white"), "Lv2では白として扱われる")
    assert(!instHasColor(face, "purple"), "Lv2ではまだ紫として扱われない")

    face.cores = 4 // Lv3
    refreshLevelAsOverrides(s)
    assert(!instHasColor(face, "white"), "Lv3ではLv2効果の白は無効（レベル表記は完全一致）")
    assert(instHasColor(face, "purple"), "Lv3では紫として扱われる")
}

console.log("=== BS03-058 妖精ティングリー：召喚時に自分のスピリットすべてが黄として扱われる（ターン終了でリセット） ===")
{
    const s = createGame(
        "tingley-grantcolorall-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const other = createInstance("BS01-001", s.turn, 1) // ゴラドン（赤）
    const tingley = createInstance("BS03-058", s.turn, 1)
    s.players.p1.field.spirits.push(other, tingley)
    fireTrigger(s, "p1", tingley, "onSummon")
    assert(instHasColor(other, "yellow"), "他の自分のスピリットも黄として扱われる")
    endTurn(s)
    assert(!instHasColor(other, "yellow"), "ターン終了でtempColorsがリセットされ黄でなくなる")
}

console.log("=== BS03-121 ダブルハート：シンボル+1でライフダメージが+1（ターン終了でリセット） ===")
{
    const s = createGame(
        "doubleheart-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（シンボル1つ）
    s.players.p1.field.spirits.push(attacker)
    resolveAction(s, "p1", null, { type: "addSymbolThisTurn" }, attacker.instanceId, undefined, "magic")
    assert(attacker.tempExtraSymbols === 1, "tempExtraSymbolsが1になる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ゴラドンでアタック")
    assert(act(s, "p2", { type: "takeLife" }) === null, "防御側はライフで受ける")
    assert(s.players.p2.life === lifeBefore - 2, "シンボル1つ+追加1つ＝ダメージ2")
}

console.log("=== BS03-121 ダブルハート：ターン終了でtempExtraSymbolsがリセットされる ===")
{
    const s = createGame(
        "doubleheart-reset-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "purple" },
    )
    runTurnStart(s)
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    resolveAction(s, "p1", null, { type: "addSymbolThisTurn" }, attacker.instanceId, undefined, "magic")
    assert(attacker.tempExtraSymbols === 1, "tempExtraSymbolsが1になる")
    endTurn(s)
    assert((attacker.tempExtraSymbols ?? 0) === 0, "ターン終了でtempExtraSymbolsがリセットされる")
}

console.log("=== BS03-141 ビルドアップ：対象のLvを+1する（最大Lvでキャップ、ターン終了でリセット） ===")
{
    const s = createGame(
        "buildup-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "red" },
    )
    runTurnStart(s)
    const spirit = createInstance("BS01-001", s.turn, 1) // ゴラドン Lv1（最大Lv2）
    s.players.p1.field.spirits.push(spirit)
    resolveAction(s, "p1", null, { type: "levelUpThisTurn" }, spirit.instanceId, undefined, "magic")
    assert(currentLevel(spirit).level === 2, "Lv1からLv2として扱われる")
    resolveAction(s, "p1", null, { type: "levelUpThisTurn" }, spirit.instanceId, undefined, "magic")
    assert(currentLevel(spirit).level === 2, "最大Lv2でキャップされる（Lv3にはならない）")
    endTurn(s)
    assert(currentLevel(spirit).level === 1, "ターン終了でlevelOverrideThisTurnがリセットされ元のLvに戻る")
}
