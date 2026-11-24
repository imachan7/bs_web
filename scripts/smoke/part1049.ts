// smoke part1049（相手の「Lvコスト+1」は、召喚・配置で置くコアの数にも足される。levelCostMod / summonLevelCostBonus）
import { assert, createGame, createInstance, currentLevel, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { summonCoreOptions } from "../../server/src/logic/summonCores"

const BAARU = "BS09-017" // 蛇凰神バァラル（Lv1=1/Lv2=5/Lv3=10。Lv2-3で相手スピリットのLvコスト+1）
const ESAL = "BS15-015" // 吸血令嬢エサルフリーダ（Lv1=1/Lv2=2/Lv3=4。Lv2-3で相手ネクサスのLvコスト+1）
const SPIRIT = "BS01-008" // メタルバーン（コスト3・Lv1=1/Lv2=3/Lv3=8）
const NEXUS = "BS01-098" // 燃えさかる戦場（コスト3・Lv1=0/Lv2=2）

console.log("=== 前提: カードの機械確認 ===")
{
    const b = getCard(BAARU)
    assert(b.name === "蛇凰神バァラル" && b.levels.map((l) => l.cores).join() === "1,5,10", "BAARUの名前とコア")
    assert(b.effects.some((e) => e.kind === "levelCostMod" && e.target === "opponentAll" && e.levels?.join() === "2,3"), "BAARUはLv2-3で相手スピリット")
    const e = getCard(ESAL)
    assert(e.name === "吸血令嬢エサルフリーダ" && e.levels.map((l) => l.cores).join() === "1,2,4", "ESALの名前とコア")
    assert(e.effects.some((x) => x.kind === "levelCostMod" && x.target === "opponentNexusesAll" && x.levels?.join() === "2,3"), "ESALはLv2-3で相手ネクサス")
    assert(getCard(SPIRIT).levels.map((l) => l.cores).join() === "1,3,8", "SPIRITのコア")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).levels.map((l) => l.cores).join() === "0,2", "NEXUSのコア")
}

// p1 が手札のカードを出す。p2 の場に発生源を置く（owner を変えれば自分の場にも置ける）
function game(hand: string, src: string | null, srcCores: number, srcOwner: "p1" | "p2" = "p2"): GameState {
    const s = createGame("lvcost1049", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 12
    s.players.p1.hand = [hand]
    if (src !== null) s.players[srcOwner].field.spirits.push(createInstance(src, s.turn, srcCores))
    return s
}

console.log("=== 1. 相手のバァラルがLv2：Lv指定なしの召喚は2コア（消滅しない・Lv1） ===")
{
    const s = game(SPIRIT, BAARU, 5)
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0 })
    const sp = s.players.p1.field.spirits[0]
    assert(err === null && sp?.cores === 2, "2コア置かれる")
    assert(sp !== undefined && currentLevel(sp).level === 1, "Lv1で場に残る")
    assert(s.players.p1.reserve === 12 - 3 - 2, "リザーブはコスト3＋2コアぶん減る")
}

console.log("=== 2. 同じ盤面でLv2指定：素のLv2のコア＋1 ===")
{
    const s = game(SPIRIT, BAARU, 5)
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "Lv2で召喚")
    const sp = s.players.p1.field.spirits[0]
    assert(sp?.cores === 4 && currentLevel(sp).level === 2, "4コア・Lv2")
}

console.log("=== 3. バァラルがLv1（効果が無効）なら従来どおり1コア ===")
{
    const s = game(SPIRIT, BAARU, 1)
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(s.players.p1.field.spirits[0]?.cores === 1, "1コア")
}

console.log("=== 4. 自分の場のバァラルは自分のスピリットに掛からない ===")
{
    const s = game(SPIRIT, BAARU, 5, "p1")
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(s.players.p1.field.spirits.find((x) => x.cardId === SPIRIT)?.cores === 1, "1コア")
}

console.log("=== 5. cores=1 の指定は拒否（最小が2）、2は通る ===")
{
    const s = game(SPIRIT, BAARU, 5)
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, cores: 1 }) !== null, "cores=1は拒否")
    assert(s.players.p1.field.spirits.length === 0 && s.players.p1.hand.length === 1, "拒否で状態が変わらない")
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, cores: 2 }) === null, "cores=2は通る")
}

console.log("=== 6. 効果による召喚の選択肢の最小も2 ===")
{
    const s = game(SPIRIT, BAARU, 5)
    assert(summonCoreOptions(s, "p1", getCard(SPIRIT), 0)[0]?.cores === 2, "最小の選択肢は2コア")
    assert(summonCoreOptions(s, "p1", getCard(SPIRIT), 0)[0]?.level === 1, "2コアはLv1")
    const t = game(SPIRIT, null, 0)
    assert(summonCoreOptions(t, "p1", getCard(SPIRIT), 0)[0]?.cores === 1, "発生源なしなら1コア")
}

console.log("=== 7. 相手のエサルフリーダ（Lv2）：ネクサスの配置は+1、スピリットには掛からない ===")
{
    const s = game(NEXUS, ESAL, 2)
    assert(handleAction(s, "p1", { type: "setNexus", handIndex: 0 }) === null, "配置できる")
    const nx = s.players.p1.field.nexuses[0]
    assert(nx?.cores === 1, "Lv1=0コアに+1で1コア")
    assert(nx !== undefined && currentLevel(nx).level === 1, "Lv1で残る")
    const t = game(NEXUS, ESAL, 2)
    assert(handleAction(t, "p1", { type: "setNexus", handIndex: 0, cores: 0 }) !== null, "cores=0は拒否")
    const u = game(SPIRIT, ESAL, 2)
    assert(handleAction(u, "p1", { type: "summon", handIndex: 0 }) === null && u.players.p1.field.spirits[0]?.cores === 1, "スピリットは1コアのまま")
}

console.log("すべてのチェックに合格しました 🎉（part1049）")
