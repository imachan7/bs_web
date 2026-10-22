// smoke パート613（BS17部品バッチ12：effectTaxForPid／kind:"effectTax"／CardPick.atLeastTaxedCost。server/src/logic/effectTax.ts）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction, EffectDef } from "../../server/src/type"
import { activateBurstCard } from "../../server/src/logic/keywords/burst"

const MAGIC = "BS14-092" // 烈光閃刃（赤・マジック・コスト4。効果を差し替えて使う）
const BURST_CARD = "BS14-097" // 刹那残影弓（紫・マジック・コスト4。効果を差し替えて使う）
const NEXUS = "BS14-075" // 焔竜の城塞都市（赤ネクサス。効果を差し替えて使う）
const BIG = "BS01-073" // 極彩鳥ヴァルペルチャー（コスト8）
const LOW = "BS01-002" // ロクケラトプス（コスト1）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(MAGIC).type === "magic" && getCard(MAGIC).cost === 4, "MAGICはコスト4のマジック")
    assert(getCard(BURST_CARD).type === "magic", "BURST_CARDはマジック")
    assert(getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
    assert(getCard(BIG).cost === 8 && getCard(LOW).cost === 1, "BIGはコスト8・LOWはコスト1")
}

const originals: [string, EffectDef[]][] = []
function setEffects(cardId: string, effects: EffectDef[]): void {
    const c = getCard(cardId)
    originals.push([cardId, c.effects])
    c.effects = effects
}
function restore(): void {
    for (const [id, effects] of originals.reverse()) getCard(id).effects = effects
    originals.length = 0
}

const DRAW2: EffectDef = { id: "T-m", kind: "magic", timing: "main", action: { type: "draw", count: 2 } }
const BURST_DRAW2: EffectDef = { id: "T-b", kind: "burst", event: "ownLifeDamaged", action: { type: "draw", count: 2 } }
const BURST_DRAW2_THEN: EffectDef = { id: "T-b", kind: "burst", event: "ownLifeDamaged", action: { type: "draw", count: 2 }, thenPay: "main" }
const DISCARD_TAXED: EffectAction = { type: "moveCards", from: "hand", dest: "trash", count: 1, pick: { atLeastTaxedCost: true } }
const RESERVE_2: EffectAction = { type: "removeCores", side: "own", from: ["reserve"], to: "trash", count: 2, chooser: "owner" }

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p1.reserve = 12
    s.players.p2.reserve = 12
    s.players.p1.deck = Array.from({ length: 40 }, () => LOW)
    s.players.p2.deck = Array.from({ length: 40 }, () => LOW)
    return s
}

// BS17-060 の使い道：p1 が p2 に「このターンの間」の税を課す
function impose060(s: GameState): void {
    resolveAction(s, "p1", null, {
        type: "timedEffect",
        content: [{ type: "playerRule", rule: { type: "effectTaxForPid", on: "magic", cost: DISCARD_TAXED } }],
        duration: "turn",
    })
}

function cast(s: GameState, hand: string[]): void {
    s.players.p2.hand = [...hand]
    handleAction(s, "p2", { type: "castMagic", handIndex: 0 })
}

console.log("=== 060-1. 払うと効果が出る（聞かれるのは使用者） ===")
{
    setEffects(MAGIC, [DRAW2])
    const s = game("tax1", true)
    impose060(s)
    cast(s, [MAGIC, LOW, BIG])
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p2" && pc.kind === "option", `使用者p2が聞かれる（実際: ${String(pc?.pid)}/${String(pc?.kind)}）`)
    assert((pc?.prompt ?? "").includes("手札のコスト4以上のカード1枚を破棄しなければ、烈光閃刃の効果を発揮できません。破棄しますか？"), `確認文（実際: ${pc?.prompt}）`)
    handleAction(s, "p2", { type: "resolveChoice", option: "発動する" })
    // 候補はコスト4以上のBIG1枚だけなので、選ばせずに破棄される
    assert(s.pendingChoice === null, "破棄は自動（候補が1枚）")
    assert(s.players.p2.trashCards.includes(BIG), "BIGが破棄された")
    assert(s.players.p2.hand.length === 3 && !s.players.p2.hand.includes(BIG), "効果でドロー2（LOW+2枚。BIG破棄済み）")
    restore()
}

console.log("=== 060-2. 払わないと効果は出ないがマジックは使用済み・コストは払済み ===")
{
    setEffects(MAGIC, [DRAW2])
    const s = game("tax2", true)
    impose060(s)
    cast(s, [MAGIC, LOW, BIG])
    handleAction(s, "p2", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "選択待ちは終わる")
    assert(s.players.p2.hand.length === 2 && s.players.p2.hand.includes(BIG), "ドローされず、BIGも破棄されていない")
    assert(s.players.p2.trashCards.includes(MAGIC), "マジックはトラッシュへ")
    assert(s.players.p2.reserve === 8, "コストは払われている")
    restore()
}

console.log("=== 060-3. 条件に合う手札が無ければ聞かれずに不発 ===")
{
    setEffects(MAGIC, [DRAW2])
    const s = game("tax3", true)
    impose060(s)
    cast(s, [MAGIC, LOW])
    assert(s.pendingChoice === null, "聞かれない")
    assert(s.players.p2.hand.length === 1, "ドローされない")
    assert(s.players.p2.trashCards.includes(MAGIC), "マジックはトラッシュへ")
    restore()
}

console.log("=== 060-4. ターンが変われば税は消える ===")
{
    setEffects(MAGIC, [DRAW2])
    const s = game("tax4", true)
    impose060(s)
    s.timedEffects = s.timedEffects.filter((t) => t.until !== "turn")
    cast(s, [MAGIC, LOW])
    assert(s.pendingChoice === null && s.players.p2.hand.length === 3, "税なしで効果が出る")
    restore()
}

console.log("=== 060-5. 非対話では払えるなら自動で払って効果が出る ===")
{
    setEffects(MAGIC, [DRAW2])
    const s = game("tax5", false)
    impose060(s)
    cast(s, [MAGIC, LOW, BIG])
    assert(s.players.p2.trashCards.includes(BIG) && s.players.p2.hand.length === 3, "BIGを破棄してドロー2")
    restore()
}

const TAX_NEXUS: EffectDef = {
    id: "T-t",
    kind: "effectTax",
    levels: [1, 2],
    on: "burst",
    phaseTurn: { phase: "attack", turn: "both" },
    cost: RESERVE_2,
}

function burstGame(seed: string, interactive: boolean, phase: GameState["phase"] = "attack"): GameState {
    setEffects(BURST_CARD, [BURST_DRAW2])
    setEffects(NEXUS, [TAX_NEXUS])
    const s = game(seed, interactive)
    s.turnPlayer = "p1"
    s.phase = phase
    const nx = createInstance(NEXUS, s.turn, 1)
    s.players.p1.field.nexuses.push(nx)
    refreshLevelAsOverrides(s)
    return s
}

console.log("=== 068-1. 払えば効果が出る ===")
{
    const s = burstGame("b1", true)
    const trash0 = s.players.p2.trashCores
    const h0 = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_CARD)
    const pc = s.pendingChoice
    assert(pc !== null && pc.pid === "p2", `発動者p2が聞かれる（実際: ${String(pc?.pid)}）`)
    handleAction(s, "p2", { type: "resolveChoice", option: "発動する" })
    for (let i = 0; i < 3 && s.pendingChoice; i++) handleAction(s, "p2", { type: "resolveChoice", option: "支払う" })
    assert(s.players.p2.reserve === 10 && s.players.p2.trashCores === trash0 + 2, `リザーブ2個がトラッシュへ（実際: ${s.players.p2.reserve}）`)
    assert(s.players.p2.hand.length === h0 + 2, "効果でドロー2")
    assert(s.players.p2.trashCards.includes(BURST_CARD), "バーストはトラッシュへ")
    restore()
}

console.log("=== 068-2. 払わなければ効果は出ずバーストはトラッシュへ ===")
{
    const s = burstGame("b2", true)
    const h0 = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_CARD)
    handleAction(s, "p2", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "選択待ちは終わる")
    assert(s.players.p2.hand.length === h0 && s.players.p2.reserve === 12, "ドローされず、コアも動かない")
    assert(s.players.p2.trashCards.includes(BURST_CARD) && s.players.p2.burst === null, "バーストはトラッシュへ")
    restore()
}

console.log("=== 068-2b. 断ったら thenPay の支払い確認も出ない／払えば出る ===")
{
    const THEN_PAY: EffectDef[] = [BURST_DRAW2_THEN, { id: "T-m2", kind: "magic", timing: "main", action: { type: "draw", count: 1 } }]
    const s = burstGame("b2b", true)
    setEffects(BURST_CARD, THEN_PAY)
    activateBurstCard(s, "p2", BURST_CARD)
    const prompt = s.pendingChoice?.prompt ?? ""
    assert(prompt.startsWith("焔竜の城塞都市：") && prompt.endsWith("置きますか？"), `確認文に税の内容が入る（実際: ${prompt}）`)
    handleAction(s, "p2", { type: "resolveChoice" })
    assert(s.pendingChoice === null, "断ったら thenPay の確認も出ない")
    restore()
    const t = burstGame("b2c", true)
    setEffects(BURST_CARD, THEN_PAY)
    activateBurstCard(t, "p2", BURST_CARD)
    handleAction(t, "p2", { type: "resolveChoice", option: "発動する" })
    assert(t.pendingChoice !== null, "払えば thenPay の確認が出る")
    restore()
}

console.log("=== 068-3. リザーブ1個なら聞かれずに不発 ===")
{
    const s = burstGame("b3", true)
    s.players.p2.reserve = 1
    const h0 = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_CARD)
    assert(s.pendingChoice === null, "聞かれない")
    assert(s.players.p2.hand.length === h0 && s.players.p2.trashCards.includes(BURST_CARD), "不発でバーストはトラッシュへ")
    restore()
}

console.log("=== 068-4. メインステップの発動には掛からない ===")
{
    const s = burstGame("b4", false, "main")
    const h0 = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_CARD)
    assert(s.players.p2.hand.length === h0 + 2 && s.players.p2.reserve === 12, "税なしで効果が出る")
    restore()
}

console.log("=== 068-5. ネクサスが場に無ければ掛からない／非対話で払える場合は自動で払う ===")
{
    const s = burstGame("b5", false)
    s.players.p1.field.nexuses = []
    const h0 = s.players.p2.hand.length
    activateBurstCard(s, "p2", BURST_CARD)
    assert(s.players.p2.hand.length === h0 + 2 && s.players.p2.reserve === 12, "ネクサスが無ければ税なし")
    restore()
    const t = burstGame("b6", false)
    const t0 = t.players.p2.hand.length
    activateBurstCard(t, "p2", BURST_CARD)
    assert(t.players.p2.hand.length === t0 + 2 && t.players.p2.reserve === 10, "非対話は自動で2個払って効果が出る")
    restore()
}

console.log("すべてのチェックに合格しました 🎉（part613）")
