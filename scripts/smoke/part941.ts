// smoke パート941（破壊後バーストは、バトルの破壊に伴う解決（勝った側のバトルの誘発）を終えてから発動する。#536。BURST.md §1.4）
// 報告の場面：ギラファ・ランドウが BP 比較でジューベイを破壊 → ギラファの Lv2「回復し、相手のスピリット1体を疲労させる」→ その後に五輪転生炎でジューベイを召喚
import { act, assert, createGame, createInstance, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const GIRAFA = "PX08" // 甲蟲武神ギラファ・ランドウ：Lv2『アタック時』BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復し、相手のスピリット1体を疲労させる
const RINNE = "BS15-073" // 五輪転生炎：【バースト：相手による自分のスピリット破壊後】破壊された覇皇を召喚する
const JUBEI = "BS14-061" // ヤギュード・ジューベイ（覇皇・BP4000）
const VANILLA = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(GIRAFA).name === "甲蟲武神ギラファ・ランドウ", "GIRAFA")
assert(getCard(RINNE).name === "五輪転生炎", "RINNE")
assert(getCard(JUBEI).name === "ヤギュード・ジューベイ" && getCard(JUBEI).family.includes("覇皇"), "JUBEI は覇皇")

console.log("=== ギラファの疲労が先、五輪転生炎の召喚が後 ===")
{
    const s = createGame("t941", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const girafa = createInstance(GIRAFA, s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(girafa)
    const jubei = createInstance(JUBEI, s.turn, 1)
    const other = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(jubei, other)
    s.players.p2.reserve = 0
    placeBurst(s, "p2", RINNE)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: girafa.instanceId }) === null, "ギラファでアタック")
    assert(act(s, "p2", { type: "pass" }) === null && act(s, "p1", { type: "pass" }) === null, "フラッシュを閉じる")
    assert(act(s, "p2", { type: "block", instanceId: jubei.instanceId }) === null, "ジューベイでブロック")
    for (let i = 0; i < 8 && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
    const revived = s.players.p2.field.spirits.find((sp) => sp.cardId === JUBEI)
    assert(revived !== undefined, "テスト前提: 五輪転生炎でジューベイが召喚された")
    assert(!revived!.isRested, "召喚されたジューベイは疲労していない（ギラファの疲労はその前に解決した）")
    assert(other.isRested, "ギラファの疲労は、その時フィールドにいたスピリットに掛かった")
}

console.log("すべてのチェックに合格しました 🎉（part941）")
