// smoke パート1069（#743：任意の召喚・配置は、置くコアの選択待ちでやめられる。強制の召喚はやめられない）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const NEXUS = "BS12-065" // 大樹茂る天守閣（緑ネクサス）
const BEETLE = "BS01-050" // ビートビートル（緑・殻虫・コスト0・Lv1 コア1）
const ATTACKER = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(NEXUS).name === "大樹茂る天守閣" && getCard(NEXUS).type === "nexus", "天守閣はネクサス")
    const b = getCard(BEETLE)
    assert(b.name === "ビートビートル" && b.type === "spirit" && b.colors.includes("green") && b.cost === 0 && b.family.includes("殻虫"), "ビートビートルは緑・殻虫・コスト0")
    assert(b.levels.length >= 2 && b.levels[0]!.cores === 1, "ビートビートルは Lv が2つ以上ありコア1で Lv1")
    assert(getCard(ATTACKER).name === "ロクケラトプス" && getCard(ATTACKER).type === "spirit", "ロクケラトプスはスピリット")
}

// 相手（p2）のアタックで天守閣 Lv2 の確認まで進め、オープンしたカードの選択待ちを経て置くコアの待ちまで進める
function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => BEETLE)
    s.players.p1.field.nexuses.push(createInstance(NEXUS, s.turn, 2))
    act(s, "p1", { type: "endTurn" })
    act(s, "p2", { type: "nextPhase" })
    const atk = createInstance(ATTACKER, s.turn, 1)
    s.players.p2.field.spirits.push(atk)
    refreshLevelAsOverrides(s)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "p2 がアタック")
    return s
}

function toCoreChoice(s: GameState): void {
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "天守閣の確認に答える")
    const pc = s.pendingChoice
    assert(pc !== null && pc.kind === "card", "オープンしたカードの選択待ち")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "ビートビートルを選ぶ")
}

console.log("=== 1. 任意の召喚：置くコアの選択待ちでやめると、召喚せずにオープンしたカードを破棄する ===")
{
    const s = setup("decline")
    toCoreChoice(s)
    const pc = s.pendingChoice
    assert(pc?.effectCostPay !== undefined && pc.optional === true && pc.skipLabel === "召喚しない", "置くコアの待ちが optional で立つ")
    const reserve = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップが受理される")
    assert(s.pendingChoice === null, "選択待ちが残らない")
    assert(s.players.p1.field.spirits.length === 0, "召喚されていない")
    assert(s.players.p1.trashCards.includes(BEETLE) && s.players.p1.reserve === reserve, "ビートビートルはトラッシュへ・コアは動かない")
    assert(s.log.some((l) => l.includes("ビートビートルを召喚しなかった")), "やめたログが出る")
}

console.log("=== 2. 同じ場面で数を選んで払えば従来どおり召喚される ===")
{
    const s = setup("accept")
    toCoreChoice(s)
    assert(act(s, "p1", { type: "resolveChoice", option: "コア2個（Lv2）" }) === null, "数を選ぶ")
    assert(s.pendingChoice === null && s.players.p1.field.spirits.length === 1, "ビートビートルが召喚された")
    assert(s.players.p1.field.spirits[0]!.cores === 2, "選んだ数のコアが載る")
}

console.log("=== 3. 強制の召喚（moveCards に任意の印なし）では optional が立たず、スキップは拒否される ===")
{
    const s = setup("forced")
    // 確認を飛ばし、任意の印を外した同じ処理を直接解決する（強制の召喚の実カードに置くコアの待ちが立つ場面が無いため）
    s.pendingChoice = null
    resolveAction(s, "p1", null, {
        type: "sequence",
        keepScope: true,
        actions: [
            { type: "revealOpen", count: 1 },
            { type: "moveCards", from: "revealed", count: 1, dest: "summon", pick: { cardType: "spirit" } },
        ],
    })
    const pc = s.pendingChoice as GameState["pendingChoice"]
    assert(pc?.effectCostPay !== undefined, "強制でも置くコアの待ちは立つ")
    assert(pc?.optional === false && pc.skipLabel === undefined, "optional が立たない")
    const err = act(s, "p1", { type: "resolveChoice" })
    assert(typeof err === "string", `スキップは拒否される（${String(err)}）`)
    assert(s.pendingChoice !== null && s.players.p1.field.spirits.length === 0, "待ちは残ったまま・召喚されない")
}

console.log("=== 4. 手札からの召喚（summon）に declinable があれば、置くコアの待ちで「召喚しない」を選べ、カードは手札に残る ===")
{
    for (const declinable of [true, false]) {
        const s = setup(declinable ? "hand-declinable" : "hand-forced")
        s.pendingChoice = null
        s.players.p1.hand = [BEETLE]
        resolveAction(s, "p1", null, { type: "summon", from: "hand", ...(declinable ? { declinable: true as const } : {}) })
        const pc = s.pendingChoice as GameState["pendingChoice"]
        assert(pc?.effectCostPay !== undefined, `置くコアの待ちが立つ（declinable=${String(declinable)}）`)
        assert(pc?.optional === declinable, `optional は ${String(declinable)}`)
        const err = act(s, "p1", { type: "resolveChoice" })
        if (declinable) {
            assert(err === null && s.pendingChoice === null, "スキップで終わる")
            assert(s.players.p1.hand.includes(BEETLE) && s.players.p1.field.spirits.length === 0, "召喚されず手札に残る")
        } else {
            assert(typeof err === "string" && s.pendingChoice !== null, "印が無ければスキップは拒否される")
        }
    }
}

console.log("すべてのチェックに合格しました 🎉（part1069）")
