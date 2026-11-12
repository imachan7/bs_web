// smoke パート907（【覚醒】の移動元にも「コアを取り除くと疲労する」を効かせる。手動のコア移動と同じ後始末を通す。#437 R11A-1）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const RUBY = "BS01-100" // ルビーの太陽（Lv2：白のスピリットは、コアを置く/取り除くと疲労する）
const AWAKENER = "BS01-013" // タウロスナイト（【覚醒】）
const WHITE = "BS17-030" // トドール（白・効果なし・Lv1 維持コア1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RUBY).effects.some((e) => e.kind === "exhaustOnManualCoreAdd"), "ルビーの太陽はコアの増減で疲労させる")
    assert(getCard(WHITE).colors.includes("white") && getCard(WHITE).effects.length === 0, "トドールは白で効果なし")
}

function awakenFrom(seed: string, sourceCores: number, count: number) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance(RUBY, s.turn, 2))
    const awakener = createInstance(AWAKENER, s.turn, 1)
    const source = createInstance(WHITE, s.turn, sourceCores)
    s.players.p1.field.spirits.push(awakener, source)
    s.players.p2.field.spirits = []
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null && act(s, "p1", { type: "attack", instanceId: awakener.instanceId }) === null, "アタックしてフラッシュへ")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    const err = act(s, "p1", { type: "awaken", instanceId: awakener.instanceId, fromInstanceId: source.instanceId, count })
    assert(err === null, `覚醒できる（${String(err)}）`)
    return { s, source }
}

console.log("=== ルビーの太陽 Lv2：白のスピリットから【覚醒】でコアを移すと、移動元が疲労する ===")
{
    const { s, source } = awakenFrom("p907-rest", 3, 1)
    assert(s.players.p1.field.spirits.includes(source) && source.cores === 2, "移動元は残る（コア2）")
    assert(source.isRested, "移動元の白のスピリットが疲労する")
}

console.log("=== 移動元が維持コアを下回れば、疲労でなく消滅（手動のコア移動と同じ順） ===")
{
    const { s, source } = awakenFrom("p907-deplete", 1, 1)
    assert(!s.players.p1.field.spirits.includes(source), "移動元は消滅する")
}

console.log("すべてのチェックに合格しました 🎉（part907）")
