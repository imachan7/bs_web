// smoke パート885（復活の複数選択 pickMany：自分の強制の「残る」で残る体は、戻す候補に出さない。2026-11-10）
// 候補に出すと、選んで手札を捨てても、その体は自分の効果で先に残るので、捨てた手札が無駄になる
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { PlayerId } from "./helpers"

const KOSHU = "BS10-046" // 龍仙公主（系統の限定なし・手札のマジックを破棄）
const BLAST = "SD15-005" // 天使ブラスティエル（Lv3：破壊されたとき確認なしで手札に戻る。条件なし）
const VANILLA = "BS01-001" // ゴラドン
const MAGIC = "BS01-125" // デッドリィバランス

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(KOSHU).name === "龍仙公主" && getCard(BLAST).name === "天使ブラスティエル" && getCard(VANILLA).name === "ゴラドン", "対象カード")
assert(getCard(MAGIC).type === "magic", "MAGIC はマジック")

console.log("=== 龍仙公主・ブラスティエル（Lv3）・ゴラドンが同時に破壊 → 戻す候補にブラスティエルは出ない ===")
{
    const s = createGame("pickmany-self-stay", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.hand = [MAGIC, MAGIC, MAGIC]
    s.turnPlayer = "p2"
    s.phase = "attack"
    const koshu = createInstance(KOSHU, s.turn, 1)
    const neko = createInstance(BLAST, s.turn, 3)
    const gora = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(koshu, neko, gora)
    refreshLevelAsOverrides(s)
    destroyTargetsBatch(s, "p2", [koshu, neko, gora].map((x) => ({ pid: "p1" as PlayerId, instanceId: x.instanceId })), { sourcePid: "p2", sourceType: "spirit" })
    const pc = s.pendingChoice
    assert(pc?.revivePickMany?.phase === "bodies", "戻す体の選択が出る")
    assert(pc !== null && pc.candidates.includes(koshu.instanceId) && pc.candidates.includes(gora.instanceId), "龍仙公主とゴラドンは候補")
    assert(pc !== null && !pc.candidates.includes(neko.instanceId), "自分の効果で手札に戻るブラスティエルは候補に出ない")
}

console.log("すべてのチェックに合格しました 🎉（part885）")
