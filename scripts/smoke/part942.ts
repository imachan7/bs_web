// smoke パート942（「疲労したとき」は、解決する時点で主語のスピリットが回復していれば発揮しない。公式Q230。#537）
// Q230 と同じ構成：シベルザ Lv2『アタック時』自分のターンの最初のアタックのとき回復 ／ 相手の千本槍の古戦場「相手のスピリットが疲労するたびにドロー」
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"

const SIBERZA = "BS12-020" // 一番槍のシベルザ
const BATTLEFIELD = "BS01-104" // 千本槍の古戦場
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(SIBERZA).name === "一番槍のシベルザ", "SIBERZA")
assert(getCard(BATTLEFIELD).name === "千本槍の古戦場", "BATTLEFIELD")

function attackWith(cores: number): { drew: number; rested: boolean } {
    const s = createGame(`t942-${cores}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    const sib = createInstance(SIBERZA, s.turn, cores)
    s.players.p1.field.spirits.push(sib)
    s.players.p2.field.nexuses.push(createInstance(BATTLEFIELD, s.turn, 0))
    s.players.p2.deck = Array.from({ length: 10 }, () => VANILLA)
    refreshLevelAsOverrides(s)
    const hand = s.players.p2.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: sib.instanceId }) === null, "シベルザでアタック")
    return { drew: s.players.p2.hand.length - hand, rested: sib.isRested }
}

console.log("=== 対照：Lv1（回復しない）なら、疲労したのでドローする ===")
{
    const r = attackWith(1)
    assert(r.rested && r.drew === 1, `ドローする（${r.drew}枚）`)
}

console.log("=== Lv2：同じ列で回復を先に解決すると、疲労状態でなくなるのでドローしない ===")
{
    const r = attackWith(3)
    assert(!r.rested, "テスト前提: シベルザは回復した")
    assert(r.drew === 0, `ドローしない（${r.drew}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part942）")
