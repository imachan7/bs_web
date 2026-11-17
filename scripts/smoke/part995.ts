// smoke パート995（SJ13-03 の器：destroyedCoresTo.byBattle／lifeDamageCoresTo）
import { act, assert, resolveAction, takeLifeAndResolve, createGame, createInstance, declareBlock, destroySpirit, getCard, giveTimedToPlayer, runTurnStart } from "./helpers"
import { timedContentsFor } from "../../shared/rules"
import type { GameState } from "./helpers"

const ATK = "BS01-003" // テラノセイバー（効果持ち・Lv1BP4000）
const ROKU = "BS01-002" // ロクケラトプス（Lv1BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ATK).name === "テラノセイバー" && getCard(ATK).levels[0]!.bp === 4000, "ATKはBP4000")
    assert(getCard(ROKU).name === "ロクケラトプス" && getCard(ROKU).levels[0]!.bp === 1000, "ROKUはBP1000")
}

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function attackWith(s: GameState): string {
    const atk = createInstance(ATK, s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    return atk.instanceId
}

console.log("=== 1. byBattle：BPを比べた破壊はトラッシュへ、効果による破壊はリザーブへ ===")
{
    const s = base("byBattle")
    const bystander = createInstance(ROKU, s.turn, 3)
    s.players.p2.field.spirits.push(bystander)
    const blocker = createInstance(ROKU, s.turn, 2)
    s.players.p2.field.spirits.push(blocker)
    attackWith(s)
    giveTimedToPlayer(s, "p2", { type: "destroyedCoresTo", to: "trash", byBattle: true }, "battle")
    const reserve0 = s.players.p2.reserve
    const trash0 = s.players.p2.trashCores
    // 効果による破壊（バトルの BP 比較ではない）：記録は無いものとして扱う
    assert(destroySpirit(s, "p2", bystander.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" }) === true, "効果で破壊")
    assert(s.players.p2.reserve === reserve0 + 3 && s.players.p2.trashCores === trash0, "効果による破壊のコアはリザーブへ")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "バトル解決")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "ブロッカーはBPで敗れて破壊")
    assert(s.players.p2.trashCores === trash0 + 2 && s.players.p2.reserve === reserve0 + 3, "BP比較の破壊のコアはトラッシュへ")
}

console.log("=== 1b. byBattle：最後の記録が効かないとき、その前の効く記録が使われる ===")
{
    const s = base("byBattle-fallback")
    const victim = createInstance(ROKU, s.turn, 2)
    s.players.p2.field.spirits.push(victim)
    attackWith(s)
    giveTimedToPlayer(s, "p2", { type: "destroyedCoresTo", to: "void" }, "battle")
    giveTimedToPlayer(s, "p2", { type: "destroyedCoresTo", to: "trash", byBattle: true }, "battle")
    const reserve0 = s.players.p2.reserve
    const trash0 = s.players.p2.trashCores
    destroySpirit(s, "p2", victim.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    assert(s.players.p2.reserve === reserve0 && s.players.p2.trashCores === trash0, "効果の破壊では byBattle を飛ばして void の記録が効く（コアはどこにも置かれない）")
}

for (const to of ["trash", "void"] as const) {
    console.log(`=== 2. lifeDamageCoresTo ${to}：ライフで受けたコアの行き先 ===`)
    const s = base("life-" + to)
    attackWith(s)
    giveTimedToPlayer(s, "p2", { type: "lifeDamageCoresTo", to }, "battle")
    const life0 = s.players.p2.life
    const reserve0 = s.players.p2.reserve
    const trash0 = s.players.p2.trashCores
    assert(takeLifeAndResolve(s, "p2") === null, "ブロックせずライフで受ける")
    const dealt = life0 - s.players.p2.life
    assert(dealt >= 1, "ライフが減った")
    assert(s.players.p2.reserve === reserve0, "リザーブには戻らない")
    assert(s.players.p2.trashCores === trash0 + (to === "trash" ? dealt : 0), to === "trash" ? "コアはトラッシュへ" : "コアはボイドへ（トラッシュにも行かない）")
}

console.log("=== 2b. timedEffect の中身2つを同じ記録として相手に置く（SJ13-03 の形） ===")
{
    const s = base("place")
    const atkId = attackWith(s)
    const self = s.players.p1.field.spirits.find((x) => x.instanceId === atkId)!
    resolveAction(s, "p1", self, {
        type: "timedEffect",
        content: [{ type: "destroyedCoresTo", to: "trash", byBattle: true }, { type: "lifeDamageCoresTo", to: "trash" }],
        duration: "battle",
    } as never)
    const rec = s.timedEffects.filter((r) => r.target.kind === "player" && r.target.pid === "p2")
    assert(rec.length === 2 && rec.every((r) => r.content.length === 1) || rec.length === 1 && rec[0]!.content.length === 2, "相手に2つの中身が置かれる")
    assert(timedContentsFor(s, "p2").some((c) => c.type === "lifeDamageCoresTo") && timedContentsFor(s, "p2").some((c) => c.type === "destroyedCoresTo" && c.byBattle), "両方が読める")
}

console.log("=== 3. 記録が無ければ従来どおりリザーブへ ===")
{
    const s = base("life-none")
    attackWith(s)
    const life0 = s.players.p2.life
    const reserve0 = s.players.p2.reserve
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(s.players.p2.reserve === reserve0 + (life0 - s.players.p2.life), "ライフのコアはリザーブへ")
}

console.log("すべてのチェックに合格しました 🎉（part995）")
