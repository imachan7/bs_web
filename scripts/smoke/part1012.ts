// smoke パート1012（AI の段階1：マジックの無意味手の足切りと点数。docs/design/AI_OPPONENT.md §7）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart, viewFor } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { decideAiAction } from "../../server/src/ai"
import { scoreMove } from "../../server/src/ai/evaluate"
import { magicTags, pruneMoves, tagsOfAction } from "../../server/src/ai/moveTags"
import type { AiMove } from "../../server/src/ai"

const WEAK = "BS01-001" // ゴラドン（Lv1 BP1000）
const STRONG = "BS01-008" // メタルバーン（Lv1 BP3000）
const HUGE = "BS01-031" // デス・ハーデス（Lv1 BP4000）
const BP_PLUS = "BS01-133" // ワイルドパワー（緑・コスト2・フラッシュ：スピリット1体BP+2000）
const EXHAUST = "BS01-134" // バインディングソーン（緑・コスト2・フラッシュ：疲労させる）
const SKIP_BP = "BS06-109" // アルカイックスマイル（黄・コスト4・フラッシュ：BP比較を飛ばす）
const DRAW_FLASH = "BS01-135" // パワーオーラ（緑・コスト3・フラッシュ：ドロー）
const BATTLE_ONLY = "BS01-143" // ディバインチェイン（白・フラッシュ：このバトルの間だけ効く）

console.log("=== 前提: カードの機械確認 ===")
{
    for (const [id, name] of [[BP_PLUS, "ワイルドパワー"], [EXHAUST, "バインディングソーン"], [BATTLE_ONLY, "ディバインチェイン"]] as const) {
        assert(getCard(id).name === name && getCard(id).type === "magic", `${id} は ${name}`)
    }
    const bp = (id: string, n: number) => getCard(id).levels.find((l) => l.level === 1)?.bp === n
    assert(bp(WEAK, 1000) && bp(STRONG, 3000) && bp(HUGE, 4000), "BP は 1000/3000/4000")
}

console.log("=== タグは効果の形から付く ===")
{
    assert(magicTags(BATTLE_ONLY, "flash").tags.join() === "battleOnly", "このバトルの間だけの効果は battleOnly")
    assert(magicTags(EXHAUST, "flash").tags.join() === "removal", "疲労させる効果は removal")
    const buff = magicTags(BP_PLUS, "flash")
    assert(buff.tags.join() === "buffOwn" && buff.bpPlus === 2000, "BP+2000 は buffOwn（bpPlus 2000）")
    assert(tagsOfAction([{ type: "draw", count: 2 }]).tags.join() === "draw", "ドローは draw")
    assert(tagsOfAction([{ type: "lendSelfThisTurn" }]).tags.join() === "unknown", "貸与だけなら unknown")
}

const mv = (type: "castMagic", tags: AiMove["tags"], targetInstanceId?: string): AiMove => ({
    action: targetInstanceId ? { type, handIndex: 0, targetInstanceId } : { type, handIndex: 0 },
    reason: "テスト",
    tags,
})

function base(seed: string, p1: string, p2: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1, p2 } as never)
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 8
    s.players.p2.reserve = 8
    s.players.p1.deck = Array.from({ length: 40 }, () => WEAK)
    s.players.p2.deck = Array.from({ length: 40 }, () => WEAK)
    return s
}

console.log("=== 足切り ===")
{
    const s = base("prune", "red", "red")
    s.players.p1.field.spirits.push(createInstance(WEAK, s.turn, 1))
    const view = viewFor(s, "p1")
    const pass: AiMove = { action: { type: "nextPhase" }, reason: "テスト" }
    const battleOnly = mv("castMagic", { tags: ["battleOnly"], bpPlus: 0 })
    assert(pruneMoves(view, "p1", [battleOnly, pass]).length === 1, "バトル外では battleOnly のマジックを撃たない")
    assert(pruneMoves(view, "p1", [battleOnly]).length === 1, "全部落ちるなら何も落とさない（合法手を残す）")
    const removal = mv("castMagic", { tags: ["removal"], bpPlus: 0 })
    assert(pruneMoves(view, "p1", [removal, pass]).length === 1, "相手の場が空なら removal を撃たない")
    s.players.p2.field.spirits.push(createInstance(WEAK, s.turn, 1))
    assert(pruneMoves(viewFor(s, "p1"), "p1", [removal, pass]).length === 2, "相手の場に個体がいれば removal は残る")
    const buff = mv("castMagic", { tags: ["buffOwn"], bpPlus: 2000 })
    s.players.p1.field.spirits.length = 0
    assert(pruneMoves(viewFor(s, "p1"), "p1", [buff, pass]).length === 1, "自分のスピリットがいなければ buffOwn を撃たない")
}

// p1 がアタックし、p2 のスピリット（あれば）でブロックされた直後のフラッシュを p2 の視点で返す
function flashAfterBlock(attacker: string, blocker: string | null): GameState {
    const s = base("flash-" + attacker + blocker, "red", "green")
    s.players.p1.field.spirits.push(createInstance(attacker, s.turn, 1))
    if (blocker) s.players.p2.field.spirits.push(createInstance(blocker, s.turn, 1))
    s.players.p2.hand = [BP_PLUS]
    s.phase = "attack"
    handleAction(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId })
    let guard = 0
    while (s.isFlashTiming && s.battle && guard++ < 10) handleAction(s, s.priorityPlayer, { type: "pass" })
    if (blocker) handleAction(s, "p2", { type: "block", instanceId: s.players.p2.field.spirits[0]!.instanceId })
    // p1 が先にパスして p2 に優先権を渡す
    guard = 0
    while (s.battle && s.isFlashTiming && s.priorityPlayer !== "p2" && guard++ < 5) handleAction(s, s.priorityPlayer, { type: "pass" })
    return s
}

console.log("=== バトル中の BP+ は逆転できるときだけ撃つ ===")
{
    const flip = flashAfterBlock(HUGE, STRONG) // 3000+2000 > 4000
    assert(flip.battle?.blockerInstanceId !== undefined && flip.priorityPlayer === "p2", "前提：p2 がブロックし、フラッシュの優先権を持つ")
    assert(decideAiAction(flip, "p2")?.action.type === "castMagic", "負けていて BP+ で逆転するなら撃つ")

    const hopeless = flashAfterBlock(HUGE, WEAK) // 1000+2000 < 4000
    assert(hopeless.priorityPlayer === "p2", "前提：p2 に優先権がある")
    assert(decideAiAction(hopeless, "p2")?.action.type === "pass", "BP+ しても負けるなら撃たない")

    const winning = flashAfterBlock(WEAK, HUGE) // すでに勝っている
    assert(winning.priorityPlayer === "p2", "前提：p2 に優先権がある")
    assert(decideAiAction(winning, "p2")?.action.type === "pass", "すでに勝っているなら撃たない")
}

// p1 が STRONG でアタックし、p2 の STRONG とバトル中。cardId を持つ側のフラッシュ（優先権を渡して）を返す
function battleWith(seed: string, holder: PlayerId, cardId: string): GameState {
    const s = base(seed, "yellow", "yellow")
    s.players.p1.field.spirits.push(createInstance(STRONG, s.turn, 1))
    s.players.p2.field.spirits.push(createInstance(STRONG, s.turn, 1))
    s.players[holder].hand = [cardId]
    s.phase = "attack"
    handleAction(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId })
    let guard = 0
    while (s.battle && s.isFlashTiming && s.priorityPlayer !== holder && guard++ < 5) handleAction(s, s.priorityPlayer, { type: "pass" })
    return s
}

console.log("=== BP+ を持たない守りと、フラッシュのドロー ===")
{
    assert(magicTags(SKIP_BP, "flash").tags.join() === "battleOnly" && magicTags(SKIP_BP, "flash").bpPlus === 0, "アルカイックスマイルは BP+ の無い battleOnly")
    assert(magicTags(DRAW_FLASH, "flash").tags.join() === "draw", "パワーオーラのフラッシュは draw")
    const def = battleWith("guard-def", "p2", SKIP_BP)
    assert(def.priorityPlayer === "p2" && decideAiAction(def, "p2")?.action.type === "castMagic", "アタックを受ける側は守りの battleOnly を撃つ")
    const atk = battleWith("guard-atk", "p1", SKIP_BP)
    assert(atk.priorityPlayer === "p1" && decideAiAction(atk, "p1")?.action.type === "pass", "アタックしている側は守りの battleOnly を撃たない")
    const dr = battleWith("draw-flash", "p2", DRAW_FLASH)
    assert(dr.priorityPlayer === "p2" && decideAiAction(dr, "p2")?.action.type === "castMagic", "フラッシュのドローはパスより先に撃つ")
}

console.log("=== removal ===")
{
    // 相手の場が空のアタック中は、疲労のマジックを撃たない
    const empty = base("removal-empty", "green", "red")
    empty.players.p1.hand = [EXHAUST]
    empty.players.p1.field.spirits.push(createInstance(STRONG, empty.turn, 1))
    empty.phase = "attack"
    handleAction(empty, "p1", { type: "attack", instanceId: empty.players.p1.field.spirits[0]!.instanceId })
    handleAction(empty, "p2", { type: "pass" })
    assert(empty.isFlashTiming && empty.priorityPlayer === "p1", "前提：p1 がフラッシュの優先権を持つ")
    assert(decideAiAction(empty, "p1")?.action.type !== "castMagic", "相手の場が空なら removal を撃たない")

    const present = base("removal-present", "green", "red")
    present.players.p1.hand = [EXHAUST]
    present.players.p1.field.spirits.push(createInstance(STRONG, present.turn, 1))
    present.players.p2.field.spirits.push(createInstance(HUGE, present.turn, 1))
    present.phase = "attack"
    handleAction(present, "p1", { type: "attack", instanceId: present.players.p1.field.spirits[0]!.instanceId })
    handleAction(present, "p2", { type: "pass" })
    assert(present.priorityPlayer === "p1" && decideAiAction(present, "p1")?.action.type === "castMagic", "相手に強い個体がいれば removal を撃つ")

    // 対象を指す手は、相手の強い個体ほど高く、自分の個体は最後
    const s = base("removal-target", "green", "red")
    const weak = createInstance(WEAK, s.turn, 1)
    const huge = createInstance(HUGE, s.turn, 1)
    const own = createInstance(HUGE, s.turn, 1)
    s.players.p2.field.spirits.push(weak, huge)
    s.players.p1.field.spirits.push(own)
    const view = viewFor(s, "p1")
    const tags = { tags: ["removal" as const], bpPlus: 0 }
    const sWeak = scoreMove(view, "p1", mv("castMagic", tags, weak.instanceId))
    const sHuge = scoreMove(view, "p1", mv("castMagic", tags, huge.instanceId))
    const sOwn = scoreMove(view, "p1", mv("castMagic", tags, own.instanceId))
    assert(sHuge > sWeak && sWeak > sOwn, `removal の対象は相手の強い個体から（強${sHuge} 弱${sWeak} 自分${sOwn}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1012）")
