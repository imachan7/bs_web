// smoke パート877（指定アタックはフラッシュ①を飛ばす：TIMING_CHART §1.10。2026-11-10 ユーザー確認）
// 指定先がアタック時効果などで破壊されていればフラッシュ①を行い、破壊されていなければフラッシュ①を飛ばしてブロック宣言へ移る
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/brave"

const APOLLO = "SD03-006" // 太陽龍ジーク・アポロドラゴン（回復状態の相手を指定。【合体時】Lv3の合体アタック時にBP9000以下を1体破壊）
const BRAVE = "BS21-057" // 冥獣騎シトリー（合体時の効果は自分の破壊時だけ）
const FLASH = "BS11-078" // ブレイヴフラッシュ（ブロック宣言後のフラッシュでは使えない）
const VANILLA = "BS01-001" // ゴラドン

console.log("=== 前提: カードの機械確認 ===")
assert(
    getCard(APOLLO).name === "太陽龍ジーク・アポロドラゴン" && getCard(BRAVE).name === "冥獣騎シトリー" && getCard(FLASH).name === "ブレイヴフラッシュ",
    "対象カード",
)

const act = (s: GameState, pid: "p1" | "p2", a: Parameters<typeof handleAction>[2]) => handleAction(s, pid, a)

function game(seed: string, interactive: boolean, combined: boolean) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 10
    const apollo = createInstance(APOLLO, s.turn, 5) // Lv3
    s.players.p1.field.spirits.push(apollo)
    if (combined) attachBrave(s, "p1", apollo, createInstance(BRAVE, s.turn, 0))
    const target = createInstance(VANILLA, s.turn, 1)
    const other = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(target, other)
    return { s, apollo, target, other }
}

console.log("=== 指定先が有効：フラッシュ①を行わずブロックが確定し、フラッシュ②になる ===")
{
    const { s, apollo, target } = game("directed-valid", false, false)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: target.instanceId }) === null, "指定してアタック")
    assert(s.battle?.blockerInstanceId === target.instanceId, "アタック宣言のあと、フラッシュ①を挟まずにブロックが確定している")
    assert(s.isFlashTiming && s.flashCount === 0 && s.priorityPlayer === "p2", "開いているのはブロック後のフラッシュ②（防御側から優先権）")
}

console.log("=== 指定先が有効：ブレイヴフラッシュは使えない（ブロック宣言後） ===")
{
    const { s, apollo, target } = game("directed-braveflash", false, false)
    s.players.p1.field.spirits.push(createInstance(BRAVE, s.turn, 1)) // スピリット状態のブレイヴ
    s.players.p1.hand[0] = FLASH
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: target.instanceId }) === null, "指定してアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（攻撃側に優先権が移る）")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) !== null, "ブレイヴフラッシュは使えない")
}

console.log("=== 指定先がアタック時効果で破壊された：フラッシュ①を行い、そのあと防御側がブロックかライフ受けを選ぶ ===")
for (const interactive of [true, false]) {
    const { s, apollo, target, other } = game(`directed-destroyed-${String(interactive)}`, interactive, true)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: apollo.instanceId, targetSpiritInstanceId: target.instanceId }) === null, "指定してアタック")
    if (interactive) {
        assert(s.pendingChoice?.kind === "target", "合体アタック時の破壊の対象選択が出る")
        assert(s.battle?.blockerInstanceId === null, "選択待ちの間はブロックは確定しない")
        assert(act(s, "p1", { type: "resolveChoice", instanceId: target.instanceId }) === null, "指定先を破壊する")
    }
    if (!s.players.p2.field.spirits.includes(target)) {
        assert(s.battle?.blockerInstanceId === null && s.battle?.directed === true, "指定先が破壊されたのでブロックは確定しない")
        assert(s.isFlashTiming && s.priorityPlayer === "p2", "フラッシュ①が開く")
        assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュ①を終える")
        assert(s.battle !== null && s.battle.blockerInstanceId === null, "バトルは続き、防御側のブロック/ライフ受け待ちになる")
        const result = s.players.p2.field.spirits.includes(other)
            ? act(s, "p2", { type: "block", instanceId: other.instanceId })
            : act(s, "p2", { type: "takeLife" })
        assert(result === null, "防御側はブロックまたはライフ受けを選べる")
    }
}

console.log("すべてのチェックに合格しました 🎉（part877）")
