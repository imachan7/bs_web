// smoke パート650（BS18-052 globalConstraint handTrashSpiritEffectsDisabled：手札・トラッシュのスピリットの効果を止める）
import { act, assert, createGame, createInstance, getCard, hasKeyword, refreshLevelAsOverrides, runTurnStart, effectiveCost } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fushiCandidates } from "../../server/src/logic/revive"
import { ownHandKeyword, zoneSpiritEffectsDisabled } from "../../shared/rules"

const SOURCE = "BS01-002" // ロクケラトプス（バニラ。一時的にこの部品を持たせる）
const SOKU = "BS02-026" // マッハジー（緑・コスト1・神速）
const FUSHI = "BS11-010" // 闇騎士ガヘリス（不死：コスト3）
const COST_SET = "BS01-003" // 効果を一時的に足して「手札のこのカードをコスト0にする」にする
const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン
const MAGIC = "BS01-114" // バスタースピア

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SOURCE).name === "ロクケラトプス" && getCard(SOURCE).effects.length === 0, "SOURCEはバニラ")
    assert(getCard(SOKU).name === "マッハジー" && hasKeyword(SOKU, "soku"), "SOKUは神速持ち")
    assert(getCard(FUSHI).name === "闇騎士ガヘリス" && hasKeyword(FUSHI, "fushi"), "FUSHIは不死持ち")
    assert(getCard(COST_SET).type === "spirit" && getCard(COST_SET).cost >= 1, "COST_SETはスピリット")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// 自分のアタックステップのフラッシュ（p1 が手札から神速を試みる）
function flash(s: GameState): void {
    const atk = put(s, "p1", COST_SET, 1)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.battle = { attackerInstanceId: atk.instanceId, blockerInstanceId: null, directed: false }
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.players.p1.hand = [SOKU]
}

const sourceEffects = getCard(SOURCE).effects
const costSetEffects = getCard(COST_SET).effects
const costSetOriginalLength = costSetEffects.length
sourceEffects.push({ id: "t650-e1", kind: "globalConstraint", levels: null, constraint: { type: "handTrashSpiritEffectsDisabled" } } as never)
const withConstraint = (s: GameState): void => {
    put(s, "p2", SOURCE, 1)
}
try {
    costSetEffects.push({ id: "t650-e2", kind: "costMod", levels: null, mode: "set", scope: "self", setTo: 0 } as never)

    console.log("=== 1. 【神速】：発生源が無ければ召喚でき、有ると召喚できない ===")
    {
        const s = game("t650-soku-off")
        flash(s)
        assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "発生源が無いとき：手札の神速で召喚できる")
        assert(s.players.p1.field.spirits.some((x) => x.cardId === SOKU), "マッハジーが場に出た")
        const t = game("t650-soku-on")
        withConstraint(t)
        flash(t)
        const err = act(t, "p1", { type: "summon", handIndex: 0 })
        assert(err !== null && !t.players.p1.field.spirits.some((x) => x.cardId === SOKU), `発生源が場にあるとき：神速の召喚は拒否される（${String(err)}）`)
        assert(!ownHandKeyword(t, SOKU, "soku") && hasKeyword(SOKU, "soku"), "神速は持っているが行使できない")
    }

    console.log("=== 2. 【不死】：トラッシュからの召喚候補が出ない ===")
    {
        const s = game("t650-fushi-off")
        s.phase = "attack"
        s.players.p1.trashCards = [FUSHI]
        assert(fushiCandidates(s, "p1", [3]).length === 1, "発生源が無いとき：不死の候補が出る")
        const t = game("t650-fushi-on")
        withConstraint(t)
        t.phase = "attack"
        t.players.p1.trashCards = [FUSHI]
        assert(fushiCandidates(t, "p1", [3]).length === 0, "発生源が場にあるとき：不死の候補が出ない")
    }

    console.log("=== 3. 手札のコスト変更（selfコスト置換）が働かない ===")
    {
        const s = game("t650-cost-off")
        assert(effectiveCost(s, "p1", getCard(COST_SET)) === 0, "発生源が無いとき：手札のこのカードはコスト0")
        const t = game("t650-cost-on")
        withConstraint(t)
        assert(effectiveCost(t, "p1", getCard(COST_SET)) === getCard(COST_SET).cost, "発生源が場にあるとき：印刷どおりのコスト")
    }

    console.log("=== 4. 通常の召喚は止まらない ===")
    {
        const t = game("t650-normal")
        withConstraint(t)
        t.phase = "main"
        t.turnPlayer = "p1"
        t.players.p1.hand = [SOKU]
        assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "メインステップの通常召喚は成立する")
        assert(t.players.p1.field.spirits.some((x) => x.cardId === SOKU), "マッハジーが場に出た")
    }

    console.log("=== 5. 持っていることの参照は止まらず、スピリット以外は対象外 ===")
    {
        const t = game("t650-ref")
        withConstraint(t)
        assert(hasKeyword(FUSHI, "fushi"), "「【不死】を持つ」の参照は成立する")
        assert(zoneSpiritEffectsDisabled(t, FUSHI), "スピリットカードは対象")
        assert(!zoneSpiritEffectsDisabled(t, BRAVE) && getCard(BRAVE).type === "brave", "ブレイヴカードは対象外")
        assert(!zoneSpiritEffectsDisabled(t, MAGIC) && getCard(MAGIC).type === "magic", "スピリット以外のカードは対象外")
    }

    console.log("=== 6. 他の効果で与えられた【神速】も止まる（2026-10-23 ユーザー確認） ===")
    {
        assert(getCard("BS01-005").name === "アイバーン" && !hasKeyword("BS01-005", "soku"), "アイバーンは神速を持たない")
        for (const on of [false, true]) {
            const s = game(on ? "t650-grant-on" : "t650-grant-off")
            if (on) withConstraint(s)
            flash(s)
            s.players.p1.hand = ["BS01-005"]
            s.players.p1.tempHandKeywordGrants = [{ cardId: "BS01-005", keyword: "soku" }]
            const err = act(s, "p1", { type: "summon", handIndex: 0 })
            assert(on ? err !== null : err === null, on ? `発生源があると与えられた神速でも召喚できない（${String(err)}）` : "発生源が無ければ与えられた神速で召喚できる")
        }
    }
} finally {
    sourceEffects.length = 0
    costSetEffects.length = costSetOriginalLength
}

console.log("すべてのチェックに合格しました 🎉（part650）")
