// smoke パート682（兵隊アントマンの「好きなだけ、コストを支払い召喚」を summon{from:"hand"} で書いた形と、召喚の禁止がこの経路にも効くこと。EFFECT_GATE §4 2c）
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const ANTMAN = "BS02-030" // 兵隊アントマン
const EMEANT = "BS01-055" // エメアント（怪虫・コスト2）
const MACHJI = "BS02-026" // マッハジー（怪虫・コスト1）
const TAKARA = "BS12-072" // 海賊王の秘宝島：お互いのメインステップ、効果でスピリットを召喚できない

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ANTMAN).name === "兵隊アントマン", "ANTMANは兵隊アントマン")
    assert(getCard(EMEANT).name === "エメアント" && getCard(EMEANT).family.includes("怪虫"), "EMEANTは怪虫")
    assert(getCard(MACHJI).name === "マッハジー" && getCard(MACHJI).family.includes("怪虫"), "MACHJIは怪虫")
    assert(getCard(TAKARA).name === "海賊王の秘宝島" && getCard(TAKARA).type === "nexus", "TAKARAは海賊王の秘宝島")
}

const antmanAction = (): EffectAction => {
    const e = getCard(ANTMAN).effects.find((x) => x.kind === "triggered" && x.trigger === "onDestroy")
    return (e as { action: EffectAction }).action
}

function game(seed: string, takara: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "blue" })
    runTurnStart(s)
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.hand = [EMEANT, MACHJI]
    if (takara) s.players.p2.field.nexuses.push(createInstance(TAKARA, 1, 0))
    return s
}

console.log("=== 1. データは summon{from:\"hand\"} の repeatWhileChosen＋payCost＋skipOnSummon ===")
{
    const a = antmanAction() as { type: string; from?: string; repeatWhileChosen?: boolean; payCost?: boolean; skipOnSummon?: boolean }
    assert(a.type === "summon" && a.from === "hand" && a.repeatWhileChosen === true && a.payCost === true && a.skipOnSummon === true, "兵隊アントマンの破壊時効果の形")
}

console.log("=== 2. 怪虫を好きなだけ、コストを支払って召喚する ===")
{
    const s = game("ant", false)
    resolveAction(s, "p1", null, antmanAction())
    assert(s.players.p1.hand.length === 0 && s.players.p1.field.spirits.length === 2, "手札の怪虫2枚がどちらも召喚される")
    assert(s.players.p1.reserve === 10 - (2 + 1) - (1 + 1), "コストと維持コアをリザーブから払う")
}

console.log("=== 3. 海賊王の秘宝島があれば、効果による召喚なので1枚も召喚されない ===")
{
    const s = game("ant-takara", true)
    resolveAction(s, "p1", null, antmanAction())
    assert(s.players.p1.hand.length === 2 && s.players.p1.field.spirits.length === 0, "手札に残る")
}

console.log("すべてのチェックに合格しました 🎉（part682）")
