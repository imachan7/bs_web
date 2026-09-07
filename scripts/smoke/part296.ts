// smoke パート296（BS11-X05 魔導双神ジェミナイズ Lv2-3：コストを支払ってマジックを使用したとき、
// もう1枚を無償で使用できる。ターンに2回まで）
import { act, assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { getCard } from "../../server/src/logic/GameState"
import { resolveMagic } from "../../server/src/logic/EffectModules"
import type { CardInstance } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const GEMINIZE = "BS11-X05" // 魔導双神ジェミナイズ
const DOUBLE_DRAW = "BS01-117" // ダブルドロー（ドロー2。対象不要の単純なマジック）
const EXTRA_DRAW = "SD01-034" // エクストラドロー（ドロー2。同じく対象不要）
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)

function game(seed: string): { s: GameState; gem: CardInstance } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    const gem = createInstance(GEMINIZE, s.turn, 2) // Lv2
    s.players.p1.field.spirits.push(gem)
    refreshLevelAsOverrides(s)
    s.phase = "main"
    // デッキ上部をバニラのスピリットで固定する（DOUBLE_DRAWのドローで意図せずマジックが手札に
    // 混ざり、候補が増えてテストの前提が崩れるのを避けるため）
    s.players.p1.deck = [vanilla[0]!.cardId, vanilla[1]!.cardId, ...s.players.p1.deck.filter((id) => getCard(id).type !== "magic")]
    return { s, gem }
}

console.log("=== §A 通常の使用（コストを支払って）で、もう1枚を無償で使用できる ===")
{
    const { s, gem } = game("geminize-free")
    s.players.p1.hand = [EXTRA_DRAW]
    resolveMagic(s, "p1", DOUBLE_DRAW, "main")
    assert(s.players.p1.trashCards.includes(EXTRA_DRAW), "手札の候補が無償で使用され、トラッシュへ行った")
    assert(!s.players.p1.hand.includes(EXTRA_DRAW), "無償使用されたカードは手札から無くなる")
    assert(gem.magicFreeUseCount === 1, "無償使用の回数が1増える")
}

console.log("=== §B 無償使用したカード自身の使用からは連鎖しない ===")
{
    const { s, gem } = game("geminize-no-chain")
    s.players.p1.hand = [EXTRA_DRAW]
    resolveMagic(s, "p1", DOUBLE_DRAW, "main")
    // 1回目の無償使用（EXTRA_DRAW）は起きるが、その無償使用（paidCost=false）からは
    // さらに連鎖しない＝回数は1のまま（連鎖していれば候補切れでも例外にはならないが、
    // 2回目としてカウントされてしまう）
    assert(gem.magicFreeUseCount === 1, "無償使用自身からは連鎖せず、回数は1のまま")
}

console.log("=== §C 候補が無ければ発動しても消費しない ===")
{
    const { s, gem } = game("geminize-no-candidate")
    s.players.p1.hand = []
    resolveMagic(s, "p1", DOUBLE_DRAW, "main")
    assert(gem.magicFreeUseCount === undefined || gem.magicFreeUseCount === 0, "候補が無ければ回数は消費しない")
}

console.log("=== §D ターンに2回まで：3回目は誘発しない ===")
{
    const { s, gem } = game("geminize-twice")
    s.players.p1.hand = [EXTRA_DRAW]
    resolveMagic(s, "p1", DOUBLE_DRAW, "main")
    assert(gem.magicFreeUseCount === 1, "1回目は誘発する")
    s.players.p1.hand = [EXTRA_DRAW]
    resolveMagic(s, "p1", DOUBLE_DRAW, "main")
    assert(gem.magicFreeUseCount === 2, "2回目も誘発する")
    s.players.p1.hand = [EXTRA_DRAW]
    resolveMagic(s, "p1", DOUBLE_DRAW, "main")
    assert(gem.magicFreeUseCount === 2, "3回目は誘発しない（手札のEXTRA_DRAWは無償使用されず残る）")
    assert(s.players.p1.hand.includes(EXTRA_DRAW), "3回目の分は手札に残ったまま")
}

console.log("=== §E 対話モード：発動確認で「使わない」を選んだら消費しない ===")
{
    const { s, gem } = game("geminize-decline")
    s.interactiveTargets = true
    s.players.p1.hand = [DOUBLE_DRAW, EXTRA_DRAW]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ダブルドローを使用")
    assert(s.pendingChoice !== null, "無償使用の発動確認が立つ")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "「使わない」を選ぶ（スキップ）")
    assert(s.pendingChoice === null, "選択待ちは解消される")
    assert(gem.magicFreeUseCount === undefined || gem.magicFreeUseCount === 0, "使わなかったので回数は消費しない")
    assert(s.players.p1.hand.includes(EXTRA_DRAW), "候補のカードは手札に残ったまま")
}

console.log("すべてのチェックに合格しました 🎉（part296）")
