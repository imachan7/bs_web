// smoke パート677（return{to:"deckBottom"} のマジックも、使用時に渡された対象の陣営を確かめる。2026-10-29 PR 6 で to:"hand"／"deckTop" とそろえた）
import { assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import { usableMagicTarget } from "../../server/src/logic/magic/cast"

const KOSOKU = "BS15-080" // 光速三段突：フラッシュ：相手のスピリット1体をデッキの下に戻す
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KOSOKU).name === "光速三段突" && getCard(KOSOKU).type === "magic", "KOSOKUは光速三段突")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
}

console.log("=== 1. 光速三段突：自分のスピリットを対象に渡しても捨て、相手のスピリットは採用する ===")
{
    const s = createGame("kosoku", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const own = createInstance(VANILLA, s.turn, 1)
    const foe = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(own)
    s.players.p2.field.spirits.push(foe)
    assert(usableMagicTarget(s, "p1", KOSOKU, "flash", own.instanceId) === undefined, "自分のスピリットは対象として捨てる")
    assert(usableMagicTarget(s, "p1", KOSOKU, "flash", foe.instanceId) === foe.instanceId, "相手のスピリットは採用する")
}

console.log("すべてのチェックに合格しました 🎉（part677）")
