// smoke パート408（R5 G-delegate：1枚専用 type を既存の部品で書き直した5枚を、実カードデータで解決する）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const ANKYLO = "BS13-002" // 鎧竜人アンキロング
const SHIKONSO = "BS14-095" // 紫魂葬
const KAITEI = "BS14-089" // 爆発する海底火山
const TARANCHU = "BS14-069" // タランチュー
const OLIVER = "BS03-095" // 奇術師オリバー
const VANILLA = "BS01-002" // ロクケラトプス
const SA = "BS10-X01" // 幻羅星龍ガイ・アスラ（【超覚醒】）
const NEXUS = "BS01-098" // 燃えさかる戦場

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ANKYLO).name === "鎧竜人アンキロング", "ANKYLO")
    assert(getCard(SHIKONSO).name === "紫魂葬", "SHIKONSO")
    assert(getCard(KAITEI).name === "爆発する海底火山", "KAITEI")
    assert(getCard(TARANCHU).name === "タランチュー", "TARANCHU")
    assert(getCard(OLIVER).name === "奇術師オリバー", "OLIVER")
    assert(getCard(SA).name === "幻羅星龍ガイ・アスラ" && getCard(NEXUS).type === "nexus", "SA／NEXUS")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.phase = "attack"
    return s
}
function actionOf(cardId: string, type: string): EffectAction {
    const e = getCard(cardId).effects!.find((x) => "action" in x && (x as { action: EffectAction }).action.type === type)
    return (e as { action: EffectAction }).action
}

console.log("=== 1. アンキロング：【超覚醒】を持つ自分のスピリット1体を手札に戻す ===")
{
    const s = game("ankylo")
    const self = createInstance(ANKYLO, s.turn, 1)
    const plain = createInstance(VANILLA, s.turn, 1)
    const sa = createInstance(SA, s.turn, 1)
    s.players.p1.field.spirits.push(self, sa, plain)
    const hand = s.players.p1.hand.length
    resolveAction(s, "p1", self, actionOf(ANKYLO, "returnToHand"))
    assert(s.players.p1.hand.length === hand + 1 && !s.players.p1.field.spirits.some((x) => x.instanceId === sa.instanceId) && s.players.p1.field.spirits.length === 2, "【超覚醒】持ちだけが戻る")
}

console.log("=== 2. 紫魂葬フラッシュ：相手のネクサス1つのコアすべてを相手のトラッシュへ ===")
{
    const s = game("shikonso")
    const nx = createInstance(NEXUS, s.turn, 3)
    const foe = createInstance(VANILLA, s.turn, 3)
    s.players.p2.field.spirits.push(foe)
    s.players.p2.field.nexuses.push(nx)
    const trash = s.players.p2.trashCores
    resolveAction(s, "p1", null, actionOf(SHIKONSO, "removeCores"))
    assert(nx.cores === 0 && s.players.p2.trashCores === trash + 3, "3個すべてが相手のトラッシュへ")
    assert(foe.cores === 3, "相手のスピリットのコアは取らない（from がネクサスだけ）")
}

console.log("=== 3. 海底火山：お互いの手札を4枚になるように破棄（4枚以下は何もしない） ===")
{
    const s = game("kaitei")
    s.players.p1.hand = Array.from({ length: 6 }, () => VANILLA)
    s.players.p2.hand = Array.from({ length: 4 }, () => VANILLA)
    const e = getCard(KAITEI).effects!.find((x) => x.kind === "step") as { action: EffectAction }
    resolveAction(s, "p1", null, e.action)
    assert(s.players.p1.hand.length === 4, "自分は6→4枚")
    assert(s.players.p2.hand.length === 4, "相手は4枚のまま")
}

console.log("=== 4. オリバー：相手の手札を指定枚数になるまで破棄 ===")
{
    const s = game("oliver")
    const act = actionOf(OLIVER, "discardOpponent") as { downTo?: number }
    s.players.p2.hand = Array.from({ length: act.downTo! + 2 }, () => VANILLA)
    resolveAction(s, "p1", null, act as EffectAction)
    assert(s.players.p2.hand.length === act.downTo, "相手の手札が指定枚数になる")
}

console.log("=== 5. タランチュー：ボイドからコア1個をこのスピリットに置く ===")
{
    const s = game("taranchu")
    const self = createInstance(TARANCHU, s.turn, 1)
    s.players.p1.field.spirits.push(self)
    resolveAction(s, "p1", self, actionOf(TARANCHU, "placeCores"))
    assert(self.cores === 2, "自身の上に1個増える")
}

console.log("すべてのチェックに合格しました 🎉（part408）")
