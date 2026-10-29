// smoke パート687（【光芒】で使ったマジックをトラッシュから手札に戻す処理も、「トラッシュからカードを手札に戻せない」で止まる。EFFECT_GATE §4 の 5a）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { resolveKoboOnBattleEnd } from "../../server/src/logic/keywords/kobo"

const TRIA = "BS03-054" // アルカナドール・トリア（Lv2【光芒】）
const CHAIN = "BS06-089" // 鎖縛の武舞台：お互い、トラッシュからカードを手札に戻せない
const MAGIC = "BS13-077" // ブリーズライド（マジック）

console.log("=== 前提 ===")
{
    assert(getCard(TRIA).name === "アルカナドール・トリア", "TRIAはアルカナドール・トリア")
    assert(getCard(CHAIN).name === "鎖縛の武舞台" && getCard(CHAIN).type === "nexus", "CHAINは鎖縛の武舞台")
    assert(getCard(MAGIC).type === "magic", "MAGICはマジック")
}

function run(chain: boolean): GameState {
    const s = createGame(`kobo-${chain}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "blue" })
    runTurnStart(s)
    const tria = createInstance(TRIA, s.turn, 3)
    s.players.p1.field.spirits.push(tria)
    if (chain) s.players.p2.field.nexuses.push(createInstance(CHAIN, 1, 0))
    s.players.p1.trashCards = [MAGIC]
    s.players.p1.hand = []
    refreshLevelAsOverrides(s)
    s.battle = { attackerInstanceId: tria.instanceId, usedMagicCardIds: { p1: [MAGIC] } } as never
    resolveKoboOnBattleEnd(s, "p1", tria)
    return s
}

console.log("=== 1. 対照：【光芒】で使ったマジックが手札に戻る ===")
{
    const s = run(false)
    assert(s.players.p1.hand.includes(MAGIC) && !s.players.p1.trashCards.includes(MAGIC), "手札に戻る")
}

console.log("=== 2. 鎖縛の武舞台があれば、トラッシュに残る ===")
{
    const s = run(true)
    assert(!s.players.p1.hand.includes(MAGIC) && s.players.p1.trashCards.includes(MAGIC), "トラッシュに残る")
}

console.log("すべてのチェックに合格しました 🎉（part687）")
