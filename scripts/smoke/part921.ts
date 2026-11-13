// smoke パート921（BS09-045 光輝の勇者皇リュート：ブロックした相手の Lv1 扱いはバトルが終わったら元に戻る。公式Q2716）
import { act, assert, createGame, createInstance, currentLevel, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const LUTE = "BS09-045" // 光輝の勇者皇リュート（紫黄）
const ATTACKER = "BS01-002" // ロクケラトプス（Lv1 BP1000）
const BLOCKER = "BS03-101" // ボルカノ・ゴレム（Lv1 6000／Lv2 7000。Lv1 扱いでもバトルに勝って場に残る）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LUTE).name === "光輝の勇者皇リュート", "LUTEは光輝の勇者皇リュート")
    assert(getCard(ATTACKER).name === "ロクケラトプス", "ATTACKERはロクケラトプス")
    assert(getCard(BLOCKER).name === "ボルカノ・ゴレム" && getCard(BLOCKER).levels[0]!.bp > getCard(ATTACKER).levels[0]!.bp, "BLOCKERはLv1でもアタッカーより強い")
}

console.log("=== 1. ブロックした相手はバトルの間だけ Lv1、終わったら元の Lv に戻る（Q2716） ===")
{
    const s = createGame("bs09-045", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits.push(createInstance(LUTE, s.turn, 1))
    const atk = createInstance(ATTACKER, s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    const blocker = createInstance(BLOCKER, s.turn, 4)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    assert(currentLevel(blocker).level === 2, "ブロック前は Lv2")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    assert(currentLevel(blocker).level === 1, "ブロックしたので Lv1 として扱う")
    while (s.battle && s.isFlashTiming) assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュを閉じる")
    assert(s.battle === null || s.battle === undefined, "バトルが終わった")
    assert(s.players.p2.field.spirits.includes(blocker), "ブロックした側はバトルに勝って場に残る")
    assert(currentLevel(blocker).level === 2, "バトルが終わったら Lv2 に戻る")
}

console.log("すべてのチェックに合格しました 🎉（part921）")
