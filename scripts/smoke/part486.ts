// smoke パート486（「【X】を持つ」は現在のレベルで見る。2026-10-08 ユーザー確認）
import { act, assert, createGame, createInstance, getCard, hasKeyword, refreshLevelAsOverrides, runTurnStart, spiritHasKeyword } from "./helpers"
import type { GameState } from "./helpers"
import { validateTakeLife } from "../../server/src/logic/RuleValidator"

const EXCALIBUS = "BS07-009" // 剣龍皇エクス・キャリバス（Lv2【激突】のみ）
const KAIOH = "BS07-051" // 天斧の勇者カイオー（Lv2【強襲】のみ）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(EXCALIBUS).name === "剣龍皇エクス・キャリバス", "EXCALIBUSは剣龍皇エクス・キャリバス")
    assert(getCard(KAIOH).name === "天斧の勇者カイオー", "KAIOHは天斧の勇者カイオー")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

function game(): GameState {
    const s = createGame("kwlv", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

console.log("=== 1. 場のスピリットはLv表記どおりにだけキーワードを持つ ===")
{
    const s = game()
    const lv1 = createInstance(KAIOH, s.turn, 1)
    const lv2 = createInstance(KAIOH, s.turn, 4)
    s.players.p1.field.spirits.push(lv1, lv2)
    refreshLevelAsOverrides(s)
    assert(!spiritHasKeyword(s, "p1", lv1, "kyoshu"), "Lv1のカイオーは【強襲】を持たない")
    assert(spiritHasKeyword(s, "p1", lv2, "kyoshu"), "Lv2のカイオーは【強襲】を持つ")
    assert(spiritHasKeyword(s, "p1", lv1, "tensho") === false, "持っていないキーワードは持たない")
    assert(hasKeyword(KAIOH, "kyoshu"), "手札などのカードは全レベルぶんを持つ扱いのまま")
}

function clashForces(cores: number): boolean {
    const s = game()
    const attacker = createInstance(EXCALIBUS, s.turn, cores)
    s.players.p1.field.spirits.push(attacker)
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    s.isFlashTiming = false
    return validateTakeLife(s, "p2") !== null
}

console.log("=== 2. 【激突】はLv2のときだけブロックを強制する ===")
{
    assert(!clashForces(1), "Lv1のエクス・キャリバスのアタックはライフで受けられる")
    assert(clashForces(3), "Lv2のエクス・キャリバスのアタックはブロックしなければならない")
}

console.log("すべてのチェックに合格しました 🎉（part486）")
