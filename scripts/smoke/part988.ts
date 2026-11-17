// smoke パート988（BS14-030 グラント・ベンケイ：【バースト：自分のライフ減少後】。バースト発動の GameEvent に cardId が入ること＝画面が効果文を出せること（#611））
import {
    assert,
    createGame,
    getCard,
} from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { activateBurstCard } from "../../server/src/logic/keywords/burst"

const BURST = "BS14-030" // グラント・ベンケイ（緑・コスト5・【バースト：自分のライフ減少後】）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BURST).name === "グラント・ベンケイ" && getCard(BURST).type === "spirit", "BURSTはグラント・ベンケイ")
    assert(getCard(BURST).effect.startsWith("【バースト"), "BURSTはバースト持ち")
}

function game(seed: string): GameState {
    return createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
}

console.log("=== バーストを発動すると、cardId つきの burst イベントが積まれる ===")
{
    const s = game("burst-event-cardid")
    placeBurst(s, "p1", BURST)
    activateBurstCard(s, "p1", BURST, true)
    const burstEvents = s.events.filter((e) => e.type === "burst")
    assert(burstEvents.length === 1, "burst イベントが1件積まれる")
    const ev = burstEvents[0]
    if (!ev || ev.type !== "burst") throw new Error("burst イベントが無い")
    assert(ev.pid === "p1", "発動したのは p1")
    assert(ev.cardName === "グラント・ベンケイ", "cardName は発動したカード名")
    assert(ev.cardId === BURST, "cardId は発動したカードの id（画面が効果文を出すのに使う）")
}

console.log("すべてのチェックに合格しました 🎉（part988）")
