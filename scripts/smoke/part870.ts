// smoke パート870（coverage:check で未実行だった BS23-003-e2【強化】／BS23-058-e0 トラッシュ耐性の場面テスト。BS23-043 の【聖命】は自身と付与先のスピリット状態の剣刃ブレイヴの両方）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { scenario } from "./scenario"
import { isTrashCardProtected } from "../../shared/rules"
import { moveCardCandidates } from "../../server/src/logic/actions/moveCards"

const BLADRA = "BS23-003" // シャイニング・ブレイドラ（赤・【強化】BP破壊）
const DEATHSCYTHE = "BS23-058" // 魔剣デスサイズ（紫ブレイヴ・トラッシュ耐性）
const TRIDENT = "BS06-094" // トライデントフレア（赤マジック・BP3000以下を3体破壊）
const TERRA = "BS01-003" // テラノセイバー（Lv1 BP4000）
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BLADRA).name === "シャイニング・ブレイドラ" && getCard(BLADRA).type === "spirit", "BLADRAはブレイドラ")
    assert(getCard(DEATHSCYTHE).name === "魔剣デスサイズ" && getCard(DEATHSCYTHE).type === "brave", "DEATHSCYTHEはデスサイズ")
    assert(getCard(TRIDENT).name === "トライデントフレア" && getCard(TRIDENT).type === "magic" && getCard(TRIDENT).cost === 6, "TRIDENTはコスト6のマジック")
    assert(getCard(TERRA).name === "テラノセイバー" && getCard(TERRA).levels[0]!.bp === 4000, "TERRAはLv1 BP4000")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function castTrident(withBladra: boolean): GameState {
    const s = game(withBladra ? "bladra-on" : "bladra-off")
    if (withBladra) put(s, "p1", BLADRA, 1)
    put(s, "p2", TERRA, 1)
    put(s, "p2", "BS01-004", 1) // BP2000：対象が0件だと使用自体が拒否されるので入れる
    s.players.p1.hand[0] = TRIDENT
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "トライデントフレアを使用")
    return s
}

console.log("=== 1. BS23-003-e2: ブレイドラがいるとBP4000を破壊できる ===")
assert(castTrident(true).players.p2.field.spirits.length === 0, "上限+1000でBP4000の相手が破壊される")

console.log("=== 2. ブレイドラがいなければBP4000は破壊できない ===")
assert(castTrident(false).players.p2.field.spirits.length === 1, "ブレイドラ無しではBP2000だけ破壊されBP4000の相手は残る")

console.log("=== 3. BS23-058-e0: トラッシュのデスサイズは効果の候補にならない ===")
{
    const s = game("deathscythe")
    s.players.p1.trashCards.push(DEATHSCYTHE, "BS01-114")
    assert(isTrashCardProtected(DEATHSCYTHE) === true, "デスサイズは保護対象")
    const action = { type: "moveCards", from: "trash", count: 1, dest: "hand", pick: { cardType: "brave" } } as const
    assert(moveCardCandidates(s, "p1", action).length === 0, "ブレイヴ指定でもトラッシュのデスサイズは候補に出ない")
    assert(moveCardCandidates(s, "p1", { ...action, pick: { cardType: "magic" } }).length === 1, "対照: 通常のマジックは候補に出る")
}

const AMARTIA = "BS23-043" // 月影の剣聖アマルティア
const NICHI = "BS23-060" // 翡翠の小太刀 日輪丸（剣刃ブレイヴ）
console.log("=== 4. BS23-043: 自身の【聖命】でアタックしてライフを減らすと自分のライフ+1 ===")
scenario({
    name: "amartia-own-seimei",
    start: { me: { spirits: [{ card: AMARTIA, label: "アマルティア" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("アマルティア") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.アマルティア.疲労: false → true", "自分.ライフ: 5 → 6", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})
console.log("=== 5. BS23-043: スピリット状態の剣刃ブレイヴに与えた【聖命】でもライフ+1 ===")
scenario({
    name: "amartia-granted-seimei",
    start: { me: { spirits: [{ card: AMARTIA, label: "アマルティア" }, { card: NICHI, label: "日輪丸" }] } },
    steps(t) {
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "attack", instanceId: t.id("日輪丸") })
        t.closeFlash()
        t.act("opp", { type: "takeLife" })
    },
    expect: ["自分.日輪丸.疲労: false → true", "自分.ライフ: 5 → 6", "相手.ライフ: 5 → 4", "相手.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part870）")
