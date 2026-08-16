// smoke パート175（【転召】の順序と必須化。2026-08-13 の利用者報告）
//
// 報告された2点:
//   ① 犠牲になるスピリットがいなくても召喚できてしまう
//   ② 召喚時効果のほうが【転召】より先に発動している
//
// 正しい順序は「召喚できるかの判定 → 転召の対象選択 → 対象の消滅 → 召喚 → 召喚時効果」。
//
// ②は状態で見分けられる：【転召】でコアを置かれた犠牲は**コアがトラッシュへ**行くのに対し、
// 破壊された場合はコアが**リザーブへ**戻る。異神獣クトゥルム（転召:コスト3以上/トラッシュ、
// 召喚時に【転召】を持たないスピリットすべてを破壊）で召喚すると、
// 旧実装では召喚時効果が先に犠牲を破壊してしまい、転召は「対象がいない」で不発になっていた。
import { act, assert, createGame, createInstance, effectiveCost, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const KUTHULUM = "BS08-054" // 異神獣クトゥルム：【転召:コスト3以上/トラッシュ】＋召喚時に転召なしをすべて破壊
const VANILLA6 = "BS02-023" // 双蛇ヒュドラム：効果を持たないコスト6のスピリット（犠牲役）
const RAITEI = "BS04-010" // 雷帝エール・クレル：【転召:コスト5以上】

function setup(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p1.reserve = 30
    return s
}
function putVanilla(s: GameState, cores: number): string {
    const inst = createInstance(VANILLA6, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    return inst.instanceId
}

console.log("=== 犠牲になるスピリットがいなければ召喚できない ===")
{
    const s = setup("tensho-required")
    s.players.p1.hand[0] = RAITEI
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err !== null, "召喚が拒否される")
    assert(err?.includes("転召") === true, `理由に【転召】が出る（実際: ${String(err)}）`)
    assert(s.players.p1.field.spirits.length === 0, "場に出ていない")
    assert(s.players.p1.hand[0] === RAITEI, "手札に残る")
}

console.log("=== コスト条件を満たさないスピリットしかいなければ召喚できない ===")
{
    const s = setup("tensho-cost-short")
    s.players.p1.field.spirits.push(createInstance("BS01-003", s.turn, 1)) // テラノセイバー：コスト2
    s.players.p1.hand[0] = RAITEI // 【転召:コスト5以上】
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) !== null, "コスト5未満しかいないので召喚できない")
}

console.log("=== 【転召】は召喚時効果より先に解決する ===")
{
    const s = setup("tensho-before-summon-trigger")
    const victim = putVanilla(s, 3)
    s.players.p1.hand[0] = KUTHULUM
    const trashBefore = s.players.p1.trashCores
    const cost = effectiveCost(s, "p1", getCard(KUTHULUM))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "クトゥルムを召喚できる")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === victim),
        "犠牲は場から消えている",
    )
    // 支払った召喚コストもトラッシュへ行くので、その分を差し引いて見る
    assert(
        s.players.p1.trashCores === trashBefore + cost + 3,
        `犠牲のコア3個はトラッシュへ（＝【転召】で消えた。破壊ならリザーブに戻る。実際${s.players.p1.trashCores - trashBefore - cost}個）`,
    )
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === KUTHULUM),
        "召喚したクトゥルムは場にいる（自身は【転召】持ちなので召喚時効果の破壊対象外）",
    )
}

console.log("=== 転召の対象選択で中断しても、選び終わってから召喚時効果が発揮される ===")
{
    const s = setup("tensho-choice-then-trigger", true)
    const a = putVanilla(s, 3)
    const b = putVanilla(s, 3)
    s.players.p1.hand[0] = KUTHULUM
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚を宣言できる")
    assert(s.pendingChoice !== null, "【転召】の対象選択で中断する")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは召喚した側")
    assert(
        s.players.p1.field.spirits.filter((x) => x.cardId === VANILLA6).length === 2,
        "この時点では召喚時効果はまだ発揮されていない（2体とも生きている）",
    )

    assert(act(s, "p1", { type: "resolveChoice", instanceId: a }) === null, "犠牲を選ぶ")
    assert(s.pendingChoice === null, "選択が片付く")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === a), "選ばれた犠牲は【転召】で消える")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === b),
        "選ばれなかったほうは、そのあと発揮された召喚時効果で破壊される",
    )
    assert(s.players.p1.field.spirits.some((x) => x.cardId === KUTHULUM), "クトゥルムは場に残る")
}

console.log("=== 転召の犠牲は「消滅」（維持コア割れ）なので破壊時効果は発揮されない ===")
{
    // ミストウィゼル（コスト5）：破壊時に3枚ドローする。【転召】で選ばれた場合は
    // 破壊ではなく維持コア割れによる消滅なので、このドローは起きない
    const s = setup("tensho-victim-not-destroyed")
    s.players.p1.field.spirits.push(createInstance("BS01-042", s.turn, 3))
    s.players.p1.hand[0] = RAITEI // 【転召:コスト5以上】
    const handBefore = s.players.p1.hand.length
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "雷帝エール・クレルを召喚できる")
    assert(
        !s.players.p1.field.spirits.some((x) => x.cardId === "BS01-042"),
        "犠牲は場から消えている",
    )
    assert(s.players.p1.deck.length === deckBefore, "破壊時効果のドローは起きていない")
    assert(s.players.p1.hand.length === handBefore - 1, "手札は召喚したぶん1枚減っただけ")
}
