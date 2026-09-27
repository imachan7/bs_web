// smoke パート414（選択をまたいでもマジックの効果として続く：PendingChoice.effectSource。EFFECT_SOURCE_CONTEXT.md）
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"

const WOODS = "BS01-140" // バインディングウッズ（緑・マジック）
const POKUN = "BS02-062" // ポークン（黄・漂精。Lv2以上で漂精は相手のマジックの効果を受けない）
const YELLOW = "BS02-049" // ピヨン（黄・歌鳥）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(WOODS).name === "バインディングウッズ" && getCard(WOODS).type === "magic", "WOODS")
    assert(getCard(POKUN).name === "ポークン" && getCard(POKUN).family.includes("漂精") && getCard(POKUN).colors.join() === "yellow", "POKUN")
    assert(getCard(YELLOW).colors.join() === "yellow" && !getCard(YELLOW).family.includes("漂精"), "YELLOW")
}

console.log("=== バインディングウッズで色を選んだあとも、マジックの効果を受けない漂精は疲労しない ===")
{
    const s = createGame("woods-immune", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "yellow" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.reserve = 20
    const pokun = createInstance(POKUN, s.turn, getCard(POKUN).levels![1]!.cores)
    const piyon = createInstance(YELLOW, s.turn, 1)
    s.players.p2.field.spirits.push(pokun, piyon)
    s.players.p1.hand = [WOODS]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用する")
    assert(act(s, "p1", { type: "resolveChoice", option: "黄" }) === null, "黄を選ぶ")
    assert(piyon.isRested, "漂精でない黄は疲労する")
    assert(!pokun.isRested, "漂精のポークンは相手のマジックの効果を受けない")
}

console.log("すべてのチェックに合格しました 🎉（part414）")
