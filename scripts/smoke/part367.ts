// smoke パート367（キーワードを与える：timedEffect の内容 keyword と、見出しの継続効果 keywordGrant。ACTION_VOCABULARY §4）
import { timedKeywords } from "../../shared/rules"
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, spiritHasKeyword } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const REEF = "BS03-105" // 暗礁海域 Lv2『自分のアタックステップ』自分のコスト2のスピリットすべてに【呪撃】
const GIVERS: [string, string, string][] = [
    ["BS02-089", "スピリットリンク", "awaken"],
    ["BS02-100", "インビンシブルシールド", "armor"],
    ["BS04-106", "グリームホープ", "kobo"],
    ["BS16-073", "アグレッシブレイジ", "clash"],
    ["SD01-036", "カースエンチャント", "jugeki"],
]

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(REEF).name === "暗礁海域" && getCard(REEF).type === "nexus", "REEFは暗礁海域")
    for (const [id, name] of GIVERS) assert(getCard(id).name === name, `${id}は${name}`)
}

function game(): GameState {
    const s = createGame("p367", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.turnPlayer = "p1"
    s.phase = "main"
    return s
}

function keywordAction(cardId: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => {
        const a = (x as { action?: { type: string; content?: { type: string }[] } }).action
        return a?.type === "timedEffect" && a.content?.some((c) => c.type === "keyword") === true
    })
    return (e as { action: EffectAction }).action
}

console.log("=== 1. 1体に与える5枚：指定した1体に付き、指定が無ければ自分のスピリットから選ぶ ===")
for (const [id, name, keyword] of GIVERS) {
    const s = game()
    const a = createInstance("BS01-001", 1, 1)
    const b = createInstance("BS01-001", 1, 1)
    s.players.p1.field.spirits = [a, b]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, keywordAction(id), b.instanceId, undefined, "magic")
    assert(timedKeywords(s, b).some((k) => k.keyword === keyword) && timedKeywords(s, a).length === 0, `${name}：指定した1体だけに付く`)
    const t = game()
    const c = createInstance("BS01-001", 1, 1)
    t.players.p1.field.spirits = [c]
    t.players.p2.field.spirits = [createInstance("BS01-001", 1, 1)]
    refreshLevelAsOverrides(t)
    resolveAction(t, "p1", null, keywordAction(id), undefined, undefined, "magic")
    assert(timedKeywords(t, c).some((k) => k.keyword === keyword), `${name}：指定が無ければ自分のスピリットに付く`)
}
{
    const armor = (keywordAction("BS02-100") as { content: { colors?: string[] }[] }).content[0]!.colors
    assert(JSON.stringify(armor) === JSON.stringify(["red", "purple", "green", "blue"]), "インビンシブルシールドの【装甲】の色が引き継がれる")
}

console.log("=== 2. 暗礁海域：自分のアタックステップの間だけ、コスト2のスピリットすべて（後から出たものも）が【呪撃】を持つ ===")
{
    const cost2 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 2 && c.effects.length === 0)!
    const cost3 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 3 && c.effects.length === 0)!
    const s = game()
    const reefCores = getCard(REEF).levels.find((l) => l.level === 2)!.cores
    s.players.p1.field.nexuses = [createInstance(REEF, 1, reefCores)]
    const two = createInstance(cost2.cardId, 1, 1)
    const three = createInstance(cost3.cardId, 1, 1)
    s.players.p1.field.spirits = [two, three]
    refreshLevelAsOverrides(s)
    assert(!spiritHasKeyword(s, "p1", two, "jugeki"), "メインステップでは持たない")
    s.phase = "attack"
    assert(spiritHasKeyword(s, "p1", two, "jugeki"), "アタックステップではコスト2が【呪撃】を持つ")
    assert(!spiritHasKeyword(s, "p1", three, "jugeki"), "コスト3は持たない")
    const later = createInstance(cost2.cardId, 1, 1)
    s.players.p1.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", later, "jugeki"), "後から出たコスト2も持つ")
    s.turnPlayer = "p2"
    assert(!spiritHasKeyword(s, "p1", two, "jugeki"), "相手のアタックステップでは持たない")
}

console.log("すべてのチェックに合格しました 🎉（part367）")
