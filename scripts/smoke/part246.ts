// smoke パート246（BS10-085 浮遊する岩塊。2026-08-27）
//
// 拡張した機構:
//   - fieldEvent.vanillaOnly を event:"anySpiritAttacked" でも使えるようにした。
//     破壊/召喚は主体が既にフィールドを離れているため eventInfo.vanilla を見るが、
//     アタックは主体が場に残るので selfOverride の instIsVanilla で判定する
//   - kind:"handKeywordGrant" に vanillaFilter を追加（手札のカードなので静的判定でよい）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, currentLevel, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { hasHandKeywordGrant } from "../../shared/rules"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
const iwakai = byName("浮遊する岩塊")
const vanilla = byName("ムシャゼミ") // BS10 緑のバニラ（効果の記述を持たない）
const nonVanilla = byName("ヘラジグサ") // 効果の記述を持つ緑スピリット
{
    assert(iwakai.type === "nexus" && iwakai.colors.includes("green"), "浮遊する岩塊は緑のネクサス")
    assert(iwakai.cost === 3, "浮遊する岩塊のコストは3")
    assert(vanilla.type === "spirit" && vanilla.effect === "", "ムシャゼミは効果の記述を持たないスピリット")
    assert(nonVanilla.type === "spirit" && nonVanilla.effect !== "", "ヘラジグサは効果の記述を持つスピリット")
}

console.log("=== §A Lv1：効果の記述を持たない自分のスピリットがアタックしたとき、そのスピリットにコア1個 ===")
{
    const s = game("bs10-085-a")
    const nexus = putNexus(s, "p1", iwakai.cardId, iwakai.levels[0]!.cores)
    assert(currentLevel(nexus).level === 1, "浮遊する岩塊はLv1")

    const attacker = createInstance(vanilla.cardId, s.turn, vanilla.levels[0]!.cores)
    const before = attacker.cores
    s.players.p1.field.spirits.push(attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "バニラのスピリットでアタック")
    assert(attacker.cores === before + 1, `アタックしたバニラにボイドからコア1個が置かれる（実際: ${String(attacker.cores)}）`)
}

console.log("=== §B 効果の記述を持つスピリットのアタックでは発火しない ===")
{
    const s = game("bs10-085-b")
    putNexus(s, "p1", iwakai.cardId, iwakai.levels[0]!.cores)

    const attacker = createInstance(nonVanilla.cardId, s.turn, nonVanilla.levels[0]!.cores)
    const before = attacker.cores
    s.players.p1.field.spirits.push(attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "効果を持つスピリットでアタック")
    assert(attacker.cores === before, `コアは置かれない（実際: ${String(attacker.cores)}）`)
}

console.log("=== §C 相手のバニラがアタックしても発火しない（ownOnly） ===")
{
    const s = game("bs10-085-c")
    putNexus(s, "p1", iwakai.cardId, iwakai.levels[0]!.cores)

    const attacker = createInstance(vanilla.cardId, s.turn, vanilla.levels[0]!.cores)
    const before = attacker.cores
    s.players.p2.field.spirits.push(attacker)
    s.turnPlayer = "p2"
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のバニラでアタック")
    assert(attacker.cores === before, `相手のスピリットには置かれない（実際: ${String(attacker.cores)}）`)
}

console.log("=== §D Lv2：手札の効果の記述を持たないスピリットカードに【神速】を与える ===")
{
    const s = game("bs10-085-d")
    const nexus = putNexus(s, "p1", iwakai.cardId, iwakai.levels[1]!.cores)
    assert(currentLevel(nexus).level === 2, "浮遊する岩塊はLv2")

    assert(hasHandKeywordGrant(s, "p1", getCard(vanilla.cardId), "soku"), "手札のバニラのスピリットカードは【神速】を得る")
    assert(!hasHandKeywordGrant(s, "p1", getCard(nonVanilla.cardId), "soku"), "効果の記述を持つカードは得ない")
    assert(!hasHandKeywordGrant(s, "p2", getCard(vanilla.cardId), "soku"), "相手の手札には与えない")
}

console.log("=== §E Lv1では手札への【神速】付与は起きない ===")
{
    const s = game("bs10-085-e")
    const nexus = putNexus(s, "p1", iwakai.cardId, iwakai.levels[0]!.cores)
    assert(currentLevel(nexus).level === 1, "浮遊する岩塊はLv1")
    assert(!hasHandKeywordGrant(s, "p1", getCard(vanilla.cardId), "soku"), "Lv1では【神速】を与えない")
}
