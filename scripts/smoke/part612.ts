// smoke パート612（BS17部品バッチ11：returnToBurst／peekOpponentBurst／payAssistByExhaust の via・minBaseCost・oncePerTurn）
import {
    assert,
    createGame,
    createInstance,
    fireStepTriggers,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    viewFor,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectDef } from "../../server/src/type"

const BURST_SPIRIT = "BS15-004" // ハンゾウ・シノビ・ドラゴン（バースト持ちスピリット）
const PLAIN_SPIRIT = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BIG_SPIRIT = "BS01-073" // 極彩鳥ヴァルペルチャー（緑・コスト8）
const NEXUS = "BS14-075" // 焔竜の城塞都市（赤ネクサス。効果を差し替えて使う）
const SEVEN = "BS05-045" // ドワッフー・セブン（黄・コスト7）
const BRAVE = "BS16-058" // サテライド・バード（白ブレイヴ）
const NOUZEN = "BS16-021"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BURST_SPIRIT).type === "spirit" && getCard(BURST_SPIRIT).effects.some((e) => e.kind === "burst"), "BURST_SPIRITはバースト持ちスピリット")
    assert(getCard(PLAIN_SPIRIT).cost === 1 && getCard(PLAIN_SPIRIT).effects.length === 0, "PLAIN_SPIRITはバニラ")
    assert(getCard(BIG_SPIRIT).type === "spirit" && getCard(BIG_SPIRIT).cost === 8, "BIG_SPIRITはコスト8のスピリット")
    assert(getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
    assert(getCard(SEVEN).type === "spirit" && getCard(SEVEN).cost === 7, "SEVENはコスト7のスピリット")
    assert(getCard(BRAVE).type === "brave", "BRAVEはブレイヴ")
    assert(getCard(NOUZEN).name === "ノウゼンサーバル", "NOUZENはノウゼンサーバル")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 12
    s.players.p2.reserve = 12
    s.players.p1.deck = Array.from({ length: 40 }, () => PLAIN_SPIRIT)
    s.players.p2.deck = Array.from({ length: 40 }, () => PLAIN_SPIRIT)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 共有カードデータの効果を差し替える。戻し忘れは他パートに漏れるので、パート末尾で restore を呼ぶ
const originals: [string, EffectDef[]][] = []
function setEffects(cardId: string, effects: EffectDef[]): void {
    const c = getCard(cardId)
    originals.push([cardId, c.effects])
    c.effects = effects
}
function restore(): void {
    for (const [id, effects] of originals) getCard(id).effects = effects
    originals.length = 0
}

const START_RETURN_TO_BURST: EffectDef = {
    id: "T-e1",
    kind: "step",
    step: "start",
    turn: "own",
    levels: [1, 2],
    optional: true,
    condition: { ownBurstSet: false },
    action: { type: "returnToBurst", side: "own", count: 1, filter: { hasBurst: true } },
}

console.log("=== 1. returnToBurst：スタートステップに確認ありでバースト持ちが1体バーストエリアへ ===")
{
    setEffects(NEXUS, [START_RETURN_TO_BURST])
    const s = game("rtb1", true)
    putNexus(s, "p1", NEXUS)
    const burstSp = put(s, "p1", BURST_SPIRIT, 3)
    const plain = put(s, "p1", PLAIN_SPIRIT, 1)
    const handBefore = s.players.p1.hand.length
    s.phase = "start"
    fireStepTriggers(s, "start")
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "option" && s.pendingChoice.confirm === true, `確認が出る（実際: ${String(s.pendingChoice?.kind)}）`)
    const reserveBefore = s.players.p1.reserve
    handleAction(s, "p1", { type: "resolveChoice", option: "発動する" })
    assert(s.players.p1.burst === BURST_SPIRIT && s.players.p1.burstSet, "バースト持ちのカードがバーストにセットされた")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === burstSp.instanceId), "場から離れた")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === plain.instanceId), "バースト効果を持たないスピリットは残る")
    assert(s.players.p1.reserve === reserveBefore + 3, "乗っていたコアはリザーブへ")
    assert(s.players.p1.hand.length === handBefore && !s.players.p1.trashCards.includes(BURST_SPIRIT), "手札にもトラッシュにも行かない")
    restore()
}

console.log("=== 2. returnToBurst：ownBurstSet の誘発が起きる／離脱でブレイヴが外れる ===")
{
    setEffects(NEXUS, [
        {
            id: "T-e2",
            kind: "fieldEvent",
            event: "ownBurstSet",
            levels: [1, 2],
            action: { type: "draw", count: 1 },
        },
    ])
    const s = game("rtb2")
    putNexus(s, "p1", NEXUS)
    const host = put(s, "p1", BURST_SPIRIT, 3)
    const hand0 = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "returnToBurst", side: "own", count: 1, filter: { hasBurst: true } })
    assert(s.players.p1.burst === BURST_SPIRIT, "セットされた")
    assert(s.players.p1.hand.length === hand0 + 1, "ownBurstSet の誘発でドローした")
    assert(!host.pendingBounce, "待機状態は解けている")
    restore()
}

console.log("=== 3. returnToBurst：既にバーストがセットされていれば不発 ===")
{
    const s = game("rtb3")
    const burstSp = put(s, "p1", BURST_SPIRIT, 2)
    s.players.p1.burst = "BS01-002"
    s.players.p1.burstSet = true
    resolveAction(s, "p1", null, { type: "returnToBurst", side: "own", count: 1, filter: { hasBurst: true } })
    assert(s.players.p1.burst === "BS01-002", "既存のバーストは入れ替わらない")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === burstSp.instanceId), "スピリットは場に残る")
    assert(s.players.p1.reserve === 12, "コアも動かない")
}

console.log("=== 4. returnToBurst：condition.ownBurstSet:false の step はバースト済みなら発火しない／候補が無ければ不発 ===")
{
    setEffects(NEXUS, [START_RETURN_TO_BURST])
    const s = game("rtb4", true)
    putNexus(s, "p1", NEXUS)
    put(s, "p1", BURST_SPIRIT, 1)
    s.players.p1.burst = PLAIN_SPIRIT
    s.players.p1.burstSet = true
    s.phase = "start"
    fireStepTriggers(s, "start")
    assert(s.pendingChoice === null, "バーストをセット済みなら確認も出ない")
    const t = game("rtb4b")
    put(t, "p1", PLAIN_SPIRIT, 1)
    resolveAction(t, "p1", null, { type: "returnToBurst", side: "own", count: 1, filter: { hasBurst: true } })
    assert(!t.players.p1.burstSet, "バースト効果を持つスピリットがいなければ不発")
    restore()
}

console.log("=== 5. peekOpponentBurst：持ち主の View にだけ中身が出る ===")
{
    const s = game("peek1")
    s.players.p2.burst = BURST_SPIRIT
    s.players.p2.burstSet = true
    resolveAction(s, "p1", null, { type: "peekOpponentBurst" })
    assert(viewFor(s, "p1").players.p1.peekedOpponentBurstCardId === BURST_SPIRIT, "持ち主には見える")
    assert(viewFor(s, "p2").players.p1.peekedOpponentBurstCardId === undefined, "相手の View には出ない")
    assert(viewFor(s, "p2").players.p2.peekedOpponentBurstCardId === undefined, "相手自身の欄にも出ない")
    assert(viewFor(s, "p1").players.p2.burst === null, "相手のバーストの中身そのものは従来どおり伏せたまま")
    // 発動して無くなったら控えは消える
    s.players.p2.burst = null
    s.players.p2.burstSet = false
    assert(viewFor(s, "p1").players.p1.peekedOpponentBurstCardId === undefined, "バーストが無くなったら表示されない")
    // 別のカードに入れ替わっても表示されない
    s.players.p2.burst = PLAIN_SPIRIT
    s.players.p2.burstSet = true
    assert(viewFor(s, "p1").players.p1.peekedOpponentBurstCardId === undefined, "入れ替わったら表示されない")
}

console.log("=== 6. peekOpponentBurst：相手がバーストを置いていなければ不発 ===")
{
    const s = game("peek2")
    resolveAction(s, "p1", null, { type: "peekOpponentBurst" })
    assert(s.players.p1.peekedOpponentBurstCardId === undefined, "控えは作られない")
}

const ASSIST_NEXUS: EffectDef = {
    id: "T-e3",
    kind: "payAssistByExhaust",
    levels: [1],
    cost: 2,
    via: "any",
    minBaseCost: 8,
    oncePerTurn: true,
    phase: "main",
}

function summonBig(s: GameState, cardId: string, assist: string[]): string | null {
    s.players.p1.hand[0] = cardId
    return handleAction(s, "p1", { type: "summon", handIndex: 0, ...(assist.length > 0 ? { shinsokuAssistInstanceIds: assist } : {}) })
}

console.log("=== 7. payAssistByExhaust：印刷コスト8以上の通常召喚で、ネクサスを疲労させて2軽くなる ===")
{
    setEffects(NEXUS, [ASSIST_NEXUS])
    const base = game("pa0")
    putNexus(base, "p1", NEXUS)
    base.players.p1.reserve = 12
    assert(summonBig(base, BIG_SPIRIT, []) === null, "支援なしでも召喚できる")
    const noAssistReserve = base.players.p1.reserve

    const s = game("pa1")
    const nex = putNexus(s, "p1", NEXUS)
    const err = summonBig(s, BIG_SPIRIT, [nex.instanceId])
    assert(err === null, `支援つきで召喚できる（実際: ${String(err)}）`)
    assert(nex.isRested === true, "ネクサスが疲労した")
    assert(s.players.p1.reserve === noAssistReserve + 2, "リザーブの減りが2少ない")
    assert(viewFor(s, "p1").players.p1.payAssistUsedThisTurn?.includes(nex.instanceId) === true, "使用記録が View に出る")

    // 2回目は使えない（ターンに1回）。疲労を戻しても使えない
    nex.isRested = false
    const err2 = summonBig(s, BIG_SPIRIT, [nex.instanceId])
    assert(typeof err2 === "string", "同じターンの2回目は拒否される")
    restore()
}

console.log("=== 8. payAssistByExhaust：印刷コスト7・ブレイヴは対象外 ===")
{
    setEffects(NEXUS, [ASSIST_NEXUS])
    const s = game("pa2")
    const nex = putNexus(s, "p1", NEXUS)
    assert(typeof summonBig(s, SEVEN, [nex.instanceId]) === "string", "印刷コスト7は対象外")
    assert(nex.isRested === false, "疲労しない")
    setEffects(NEXUS, [{ ...ASSIST_NEXUS, minBaseCost: 1 }])
    assert(typeof summonBig(s, BRAVE, [nex.instanceId]) === "string", "ブレイヴの召喚には使えない")
    restore()
}

console.log("=== 9. payAssistByExhaust：BS16-021 の【神速】経路は従来どおり ===")
{
    const s = game("pa3")
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const helper = put(s, "p1", NOUZEN, 1)
    s.players.p1.reserve = 1
    s.players.p1.hand[0] = "BS01-053"
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [helper.instanceId] }) === null, "【神速】召喚で通る")
    assert(helper.isRested === true, "疲労した")
    // 通常召喚（via省略）では使えない
    const t = game("pa4")
    const h2 = put(t, "p1", NOUZEN, 1)
    t.players.p1.reserve = 0
    t.players.p1.hand[0] = PLAIN_SPIRIT
    assert(typeof handleAction(t, "p1", { type: "summon", handIndex: 0, shinsokuAssistInstanceIds: [h2.instanceId] }) === "string", "via省略は【神速】以外では使えない")
}

console.log("すべてのチェックに合格しました 🎉（part612）")
