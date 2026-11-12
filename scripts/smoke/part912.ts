// smoke パート912（相手の継続効果も【装甲】で防ぐ／メインから直接ターン終了しても強制アタックは避けられない／
// ドラゴニック・タウラス Lv3 のシンボル追加は自分の比較の中だけ。2026-11-12 ユーザー報告）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import { instanceSymbolCount } from "../../shared/rules/symbols"
import type { GameState, PlayerId } from "./helpers"
import { activeConstraints, mustBeAttackTargetIds } from "../../shared/rules/constraints"
import { validateEndTurn } from "../../server/src/logic/RuleValidator"
import type { EffectAction } from "../../server/src/type"

const BILL = "BS18-035" // バッファロング・ビル（白）
const DIARIN = "BS21-034" // 天眼機神ディアリーン（白。Lv3 合体していない相手のスピリットすべては必ずアタック）
const ARMORED = "BS09-036" // 氷雪の勇者皇ウル（コスト6。Lv2 で【装甲：赤/紫/白/青】）
const PLAIN6 = "BS17-007" // ヴァジュランガ（コスト6・効果なし）
const VACUUM = "BS12-080" // バキュームシンボル（白のマジック）
const TAURUS = "BS12-X01" // 金牛龍神ドラゴニック・タウラス

console.log("=== 前提: カードの機械確認 ===")
{
    const armor = getCard(ARMORED).effects.find((e) => e.kind === "keyword" && e.keyword === "armor") as { colors?: string[]; levels?: number[] }
    assert(armor.colors?.includes("white") === true && armor.levels?.includes(2) === true && getCard(ARMORED).cost === 6, "ウルは Lv2 で【装甲：白】・コスト6")
    assert(getCard(PLAIN6).cost === 6 && getCard(PLAIN6).effects.length === 0, "ヴァジュランガはコスト6・効果なし")
    assert(getCard(BILL).colors.includes("white") && getCard(DIARIN).colors.includes("white") && getCard(VACUUM).colors.includes("white"), "ビル・ディアリーン・バキュームシンボルは白")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== バッファロング・ビル：【装甲：白】のアタッカーには指定アタックが掛からない ===")
{
    const s = game("p912-bill")
    const bill = put(s, "p2", BILL, 1)
    const armored = put(s, "p1", ARMORED, 2)
    const plain = put(s, "p1", PLAIN6, 1)
    assert(mustBeAttackTargetIds(s, "p1", plain).includes(bill.instanceId), "装甲の無いコスト6はビルを指定しなければならない")
    assert(mustBeAttackTargetIds(s, "p1", armored).length === 0, "【装甲：白】のコスト6は指定しなくてよい")
}

console.log("=== ディアリーン Lv3：【装甲：白】のスピリットには強制アタックが掛からない ===")
{
    const s = game("p912-diarin")
    put(s, "p2", DIARIN, 4)
    const armored = put(s, "p1", ARMORED, 2)
    const plain = put(s, "p1", PLAIN6, 1)
    assert(activeConstraints(s, "p1", plain).some((c) => c.type === "mustAttack"), "装甲の無いスピリットは必ずアタック")
    assert(!activeConstraints(s, "p1", armored).some((c) => c.type === "mustAttack"), "【装甲：白】は必ずアタックにならない")
}

console.log("=== ディアリーン Lv3：メインステップから直接ターン終了しても、強制アタックは避けられない ===")
{
    const s = game("p912-diarin-main")
    s.phase = "main"
    put(s, "p2", DIARIN, 4)
    put(s, "p1", PLAIN6, 1)
    assert(typeof validateEndTurn(s, "p1") === "string", `ターン終了は拒否される（${String(validateEndTurn(s, "p1"))}）`)
    const t = game("p912-diarin-main-armored")
    t.phase = "main"
    put(t, "p2", DIARIN, 4)
    put(t, "p1", ARMORED, 2)
    assert(validateEndTurn(t, "p1") === null, "【装甲：白】しかいなければターン終了できる")
}

console.log("=== バキュームシンボル：【装甲：白】のスピリットはシンボルを失わない ===")
{
    const s = game("p912-vacuum")
    s.turnPlayer = "p1"
    const armored = put(s, "p1", ARMORED, 2)
    const plain = put(s, "p1", "BS17-030", 1) // トドール（白シンボル1・効果なし）
    const before = { a: instanceSymbolCount(armored), p: instanceSymbolCount(plain) }
    const action = (getCard(VACUUM).effects[0] as { action: EffectAction }).action
    resolveAction(s, "p2", null, action, undefined, ["white"], "magic", "白")
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(plain) === before.p - 1, `装甲の無いスピリットは白シンボルを失う（${before.p}→${instanceSymbolCount(plain)}）`)
    assert(instanceSymbolCount(armored) === before.a, `【装甲：白】は失わない（${before.a}→${instanceSymbolCount(armored)}）`)
}

console.log("=== ドラゴニック・タウラス Lv3：シンボルは常には増えない（軽減に効かない）。ブロックされたときの比較では足す ===")
{
    const s = game("p912-taurus")
    const taurus = put(s, "p1", TAURUS, 5)
    put(s, "p1", "BS11-015", 1) // 冥王神獣インフェルド・ハデス（神星）
    assert(instanceSymbolCount(taurus) === 1, `常時のシンボルは1つのまま（${instanceSymbolCount(taurus)}）`)
    const blocker = put(s, "p2", "BS01-002", 1)
    s.players.p2.life = 5
    const entry = getCard(TAURUS).effects.find((e) => e.id === "BS12-X01-e3") as { action: EffectAction }
    resolveAction(s, "p1", taurus, entry.action, blocker.instanceId)
    // 自分 1＋（神星/光導 2体）＝3、ブロッカー 1 → 差 2
    assert(s.players.p2.life === 3, `比較では足して、相手のライフ -2（${s.players.p2.life}）`)
}

console.log("すべてのチェックに合格しました 🎉（part912）")
