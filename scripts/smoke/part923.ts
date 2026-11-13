// smoke パート923（場の出来事の誘発がイベントの主語を self にするとき、発生源は効果を持つカードのまま扱う：ログの名前・召喚時効果の印）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const LUTE = "BS09-045" // 光輝の勇者皇リュート（自分のスピリットをブロックした相手を Lv1。主語＝ブロックされた自分のスピリット）
const THRONE = "BS04-077" // 七龍帝の玉座（ネクサス。Lv2：古竜/龍帝が召喚されたとき。主語＝召喚されたスピリット）
const LEVIA = "BS03-012" // 水龍王リヴァイア（古竜。「〜できる」の召喚時効果）
const ROKU = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LUTE).name === "光輝の勇者皇リュート", "LUTEは光輝の勇者皇リュート")
    assert(getCard(THRONE).name === "七龍帝の玉座" && getCard(THRONE).type === "nexus", "THRONEは七龍帝の玉座")
    const levia = getCard(LEVIA)
    assert(levia.name === "水龍王リヴァイア" && levia.family.includes("古竜") && levia.effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon" && e.optional === true), "LEVIAは「〜できる」召喚時効果を持つ古竜")
    assert(getCard(ROKU).name === "ロクケラトプス", "ROKUはロクケラトプス")
}

console.log("=== 1. ログの発生源は効果を持つカード（ブロックされた側ではない） ===")
{
    const s = createGame("src-name", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits.push(createInstance(LUTE, s.turn, 1))
    const atk = createInstance(ROKU, s.turn, 1)
    s.players.p1.field.spirits.push(atk)
    const blocker = createInstance(ROKU, s.turn, 1)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    assert(s.log.some((l) => l.startsWith("光輝の勇者皇リュート：") && l.includes("Lv1として扱われる")), "ログの発生源は光輝の勇者皇リュート")
    assert(!s.log.some((l) => l.startsWith("ロクケラトプス：") && l.includes("Lv1として扱われる")), "ブロックされたロクケラトプスの名前で出ない")
}

// 玉座 Lv2 を置いてリヴァイアを召喚し、同時発揮の列でリヴァイアを先に選んで、その「〜できる」に答える
function summonLevia(accept: boolean): GameState {
    const s = createGame(`src-summon-${accept}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.nexuses.push(createInstance(THRONE, s.turn, 3))
    s.players.p1.reserve = 12
    s.players.p1.hand = [LEVIA]
    s.players.p2.field.spirits.push(createInstance(ROKU, s.turn, 1))
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "リヴァイアを召喚できる")
    const first = s.pendingChoice?.options?.find((o) => o.includes("水龍王リヴァイア"))
    assert(first !== undefined && act(s, "p1", { type: "resolveChoice", option: first }) === null, "リヴァイアを先に解決する")
    assert(s.pendingChoice?.confirm === true, "リヴァイアの「〜できる」を聞く")
    assert(act(s, "p1", accept ? { type: "resolveChoice", option: "発動する" } : { type: "resolveChoice" }) === null, accept ? "発動する" : "断る")
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        assert(act(s, pc.pid, pc.kind === "target" ? { type: "resolveChoice", instanceId: pc.candidates[0]! } : { type: "resolveChoice" }) === null, "残りの選択に答える")
    }
    return s
}

console.log("=== 2. 召喚時効果を断ったら、玉座の効果が召喚されたスピリットを主語にしても「発揮した」ことにならない ===")
{
    const s = summonLevia(false)
    assert(s.log.some((l) => l.includes("水龍王リヴァイア：効果を発動しなかった")), "リヴァイアの召喚時効果は断った")
    assert(s.lastOpponentSummonEffect === undefined, "相手の『召喚時』発揮後の記録が付かない")
}

console.log("=== 3. 発動すれば記録が付く（対照） ===")
{
    const s = summonLevia(true)
    assert(s.lastOpponentSummonEffect?.cardId === LEVIA, "相手の『召喚時』発揮後の記録が付く")
}

console.log("すべてのチェックに合格しました 🎉（part923）")
