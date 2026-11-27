// smoke part1048（召喚・配置で置くコアの数を Lv の境目以外にも決められる。summon／setNexus の cores）
import { assert, createGame, currentLevel, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SPIRIT = "BS01-008" // メタルバーン（コスト3・Lv1=1/Lv2=3/Lv3=8）
const NEXUS = "BS01-098" // 燃えさかる戦場（コスト3・Lv1=0/Lv2=2）

console.log("=== 前提: カードの機械確認 ===")
{
    const sp = getCard(SPIRIT)
    assert(sp.name === "メタルバーン" && sp.type === "spirit" && sp.cost === 3, "SPIRITはコスト3のスピリット")
    assert(sp.levels.map((l) => l.cores).join() === "1,3,8", "SPIRITのコアは1,3,8")
    const nx = getCard(NEXUS)
    assert(nx.name === "燃えさかる戦場" && nx.type === "nexus" && nx.cost === 3, "NEXUSはコスト3のネクサス")
    assert(nx.levels.map((l) => l.cores).join() === "0,2", "NEXUSのコアは0,2")
}

function game(cardId: string, reserve = 10): GameState {
    const s = createGame("cores1048", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = reserve
    s.players.p1.hand = [cardId]
    return s
}

const snap = (s: GameState): string => JSON.stringify([s.players.p1.reserve, s.players.p1.hand, s.players.p1.field])

console.log("=== 1. cores=2 で召喚：2コア・Lv1 ===")
{
    const s = game(SPIRIT)
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, cores: 2 })
    const sp = s.players.p1.field.spirits[0]
    assert(err === null && sp !== undefined, "召喚できる")
    assert(sp?.cores === 2 && currentLevel(sp!).level === 1, "2コア・Lv1")
    assert(s.players.p1.reserve === 10 - 3 - 2, "リザーブがコスト3＋置く2コアぶん減る")
}

console.log("=== 2. cores=4 で召喚：Lv2 ===")
{
    const s = game(SPIRIT)
    const err = handleAction(s, "p1", { type: "summon", handIndex: 0, cores: 4 })
    const sp = s.players.p1.field.spirits[0]
    assert(err === null && sp?.cores === 4 && currentLevel(sp).level === 2, "4コア・Lv2")
}

console.log("=== 3. 最小未満・整数でない・払えない数は拒否し状態は変わらない ===")
{
    for (const cores of [0, 1.5, -1, 9]) {
        const s = game(SPIRIT, 10) // 9コア＋コスト3＝12 > 10
        const before = snap(s)
        const err = handleAction(s, "p1", { type: "summon", handIndex: 0, cores })
        assert(err !== null, `cores=${String(cores)} は拒否`)
        assert(snap(s) === before, `cores=${String(cores)} の拒否で状態が変わらない`)
    }
}

console.log("=== 4. cores 省略・level 指定は従来どおり ===")
{
    const s = game(SPIRIT)
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "level=2で召喚")
    assert(s.players.p1.field.spirits[0]?.cores === 3, "level=2は3コア")
    const s2 = game(SPIRIT)
    assert(handleAction(s2, "p1", { type: "summon", handIndex: 0 }) === null, "省略で召喚")
    assert(s2.players.p1.field.spirits[0]?.cores === 1, "省略は1コア")
}

console.log("=== 5. ネクサスの配置でも cores が効く ===")
{
    const s = game(NEXUS)
    const err = handleAction(s, "p1", { type: "setNexus", handIndex: 0, cores: 3 })
    const nx = s.players.p1.field.nexuses[0]
    assert(err === null && nx?.cores === 3 && currentLevel(nx).level === 2, "ネクサスに3コア・Lv2")
    const s2 = game(NEXUS, 5)
    const before = snap(s2)
    assert(handleAction(s2, "p1", { type: "setNexus", handIndex: 0, cores: 4 }) !== null, "払えない数は拒否")
    assert(snap(s2) === before, "拒否で状態が変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part1048）")
