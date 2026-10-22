// smoke パート616（BS17-043神獣セグー用 handBurstEffectGrant：手札のバースト持ちマジックのバースト効果を、アタック中のフラッシュで発揮する）
import { assert, createGame, createInstance, effectiveCost, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { handBurstEffectDenial } from "../../shared/handBurstEffect"
import { resolveKoboOnBattleEnd } from "../../server/src/logic/keywords/kobo"
import type { EffectAction } from "../../server/src/type"

const MAGIC = "BS14-091" // 双光気弾（赤・コスト3・軽減赤・バースト:ownSpiritDestroyed→2枚ドロー、thenPay flash）
const PLAIN_MAGIC = "BS01-114" // バスタースピア（バースト無しのマジック）
const BURST_SPIRIT = "BS14-010" // 皇牙獣キンタローグ・ベアー（バースト持ちのスピリット）
const KOBO = "BS03-054" // アルカナドール・トリア（【光芒】持ち）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    const m = getCard(MAGIC)
    assert(m.name === "双光気弾" && m.type === "magic" && m.cost === 3 && m.effects.filter((e) => e.kind === "burst").length === 1, "MAGICはバースト持ちマジック")
    assert(getCard(PLAIN_MAGIC).type === "magic" && !getCard(PLAIN_MAGIC).effects.some((e) => e.kind === "burst"), "PLAIN_MAGICはバースト無し")
    assert(getCard(BURST_SPIRIT).type === "spirit" && getCard(BURST_SPIRIT).effects.some((e) => e.kind === "burst"), "BURST_SPIRITはバースト持ちスピリット")
    assert(getCard(KOBO).effects.some((e) => e.kind === "keyword" && e.keyword === "kobo"), "KOBOは光芒持ち")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1")
}

// 共有カードデータへ継続効果を一時的に足す。必ず finally で戻す
const host = getCard(VANILLA)
const hostEffectsBefore = host.effects
function withGrant<T>(attackerKeyword: ("kobo" | "makobo")[], body: () => T): T {
    host.effects = [...hostEffectsBefore, { id: "t616-grant", kind: "handBurstEffectGrant", levels: null, attackerKeyword }]
    try {
        return body()
    } finally {
        host.effects = hostEffectsBefore
    }
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = [MAGIC, PLAIN_MAGIC, BURST_SPIRIT]
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// attackerPid の attackerCard がアタックし、p1 が優先権を持つフラッシュまで進める（p1 の手札は MAGIC 2枚・PLAIN_MAGIC・BURST_SPIRIT）
function attackState(seed: string, attackerCard: string, attackerPid: PlayerId = "p1"): { s: GameState; atk: ReturnType<typeof createInstance> } {
    const s = game(seed)
    s.turnPlayer = attackerPid
    s.players.p1.hand = [MAGIC, PLAIN_MAGIC, BURST_SPIRIT, MAGIC]
    put(s, "p1", VANILLA, 1) // 発生源（赤）
    put(s, "p1", VANILLA, 1) // 軽減用の赤シンボル
    const atk = put(s, attackerPid, attackerCard, 3)
    handleAction(s, attackerPid, { type: "nextPhase" })
    handleAction(s, attackerPid, { type: "nextPhase" })
    assert(s.phase === "attack", "アタックステップに入った")
    assert(handleAction(s, attackerPid, { type: "attack", instanceId: atk.instanceId }) === null, "アタックできた")
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    return { s, atk }
}
const use = (s: GameState, handIndex = 0): string | null => handleAction(s, "p1", { type: "useHandBurstEffect", handIndex })

console.log("=== 1. 光芒持ちのアタック中：軽減込みのコストで発揮され、トラッシュへ ===")
withGrant(["kobo", "makobo"], () => {
    const { s, atk } = attackState("c1", KOBO)
    const p = s.players.p1
    const cost = effectiveCost(s, "p1", getCard(MAGIC))
    assert(cost < 3, `軽減が効いている（コスト${cost}）`)
    assert(handBurstEffectDenial(s, "p1", MAGIC) === null, "判定は真")
    const hand = p.hand.length
    const reserve = p.reserve
    assert(use(s) === null, "発揮できた")
    assert(p.hand.length === hand - 1 + 2, "バースト条件を満たさなくても2枚ドローし、使ったカードは手札から離れた")
    assert(p.trashCards.includes(MAGIC), "使ったマジックはトラッシュへ")
    // thenPay(flash) が「その後コストを支払うことで」同じコストをもう一度払う
    assert(reserve - p.reserve === cost * 2, `コストは軽減込みで払われた（${reserve - p.reserve}）`)
    assert(s.priorityPlayer === "p2", "優先権が相手へ移った")
    assert((s.magicUsedThisTurn.p1 ?? 0) === 0, "マジックの使用に数えない")
    assert(!(s.battle?.usedMagicCardIds?.p1 ?? []).includes(MAGIC), "【光芒】の回収対象（使用済みマジック）に入らない")
    resolveKoboOnBattleEnd(s, "p1", atk)
    assert(!p.hand.includes(MAGIC) || p.hand.filter((c) => c === MAGIC).length === 1, "バトル終了時の回収で手札に戻らない（残りの1枚は元から持っていた分）")
    assert(!s.log.some((l) => l.includes("バーストを発動した")), "バーストの発動にならない")
})

console.log("=== 2. 同じアタック中に2回使える ===")
withGrant(["kobo"], () => {
    const { s } = attackState("c2", KOBO)
    assert(use(s) === null, "1回目")
    s.priorityPlayer = "p1"
    assert(use(s, 2) === null, "2回目（手札の位置はずれている）")
    assert(s.players.p1.trashCards.filter((c) => c === MAGIC).length === 2, "2枚ともトラッシュ")
})

console.log("=== 3. 効果税(on:burst)は掛からず、noBurstEffectForPid は効く ===")
withGrant(["kobo"], () => {
    const tax: EffectAction = { type: "removeCores", side: "own", from: ["reserve"], to: "trash", count: 2, chooser: "owner" }
    const { s } = attackState("c3a", KOBO)
    resolveAction(s, "p2", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "effectTaxForPid", on: "burst", cost: tax } }], duration: "turn" })
    const cost = effectiveCost(s, "p1", getCard(MAGIC))
    const reserve = s.players.p1.reserve
    assert(use(s) === null && reserve - s.players.p1.reserve === cost * 2, "税の2コアは払われない")
    assert(s.players.p1.hand.length === 4 - 1 + 2, "税があっても効果は発揮される")

    const b = attackState("c3b", KOBO)
    resolveAction(b.s, "p2", null, { type: "timedEffect", content: [{ type: "playerRule", rule: { type: "noBurstEffectForPid" } }], duration: "turn" })
    const reserveB = b.s.players.p1.reserve
    assert(use(b.s) === null, "操作自体は成立する")
    assert(b.s.players.p1.hand.length === 4 - 1, "効果は発揮されない（ドローなし）")
    assert(b.s.players.p1.trashCards.includes(MAGIC) && reserveB > b.s.players.p1.reserve, "コストは払われ、トラッシュへ行く")
})

console.log("=== 4. 使えない場面 ===")
withGrant(["kobo", "makobo"], () => {
    const c = attackState("c4a", VANILLA)
    assert(handBurstEffectDenial(c.s, "p1", MAGIC) !== null && use(c.s) !== null, "光芒を持たないスピリットのアタック中は不可")
    assert(c.s.players.p1.hand.length === 4, "拒否されたら何も変わらない")

    const d = attackState("c4b", KOBO, "p2")
    assert(d.s.players.p1.field.spirits.some((i) => i.cardId === VANILLA), "発生源は p1 の場にいる")
    assert(handBurstEffectDenial(d.s, "p1", MAGIC) !== null && use(d.s) !== null, "相手のアタック中（自分の光芒持ちはアタックしていない）は不可")

    const e = attackState("c4c", KOBO)
    e.s.battle = null
    e.s.isFlashTiming = false
    assert(handBurstEffectDenial(e.s, "p1", MAGIC) !== null && use(e.s) !== null, "アタック中でなければ不可")

    const f = attackState("c4d", KOBO)
    f.s.priorityPlayer = "p2"
    assert(use(f.s) !== null, "優先権が無ければ不可")

    const g = attackState("c4e", KOBO)
    assert(use(g.s, 1) !== null, "バーストを持たないマジックは対象外")
    assert(use(g.s, 2) !== null, "バーストを持つスピリットカードは対象外")
    assert(g.s.players.p1.hand.length === 4, "何も起きていない")
})
{
    const { s } = attackState("c4f", KOBO)
    assert(handBurstEffectDenial(s, "p1", MAGIC) !== null && use(s) !== null, "継続効果の発生源が場に無ければ不可")
}
{
    const g = game("c4g")
    g.players.p1.hand = [MAGIC]
    assert(use(g) !== null && handBurstEffectDenial(g, "p1", MAGIC) !== null, "メインステップでは不可")
}

console.log("=== 5. コストが払えなければ拒否 ===")
withGrant(["kobo"], () => {
    const { s } = attackState("c5", KOBO)
    s.players.p1.reserve = 0
    assert(use(s) !== null && s.players.p1.hand.length === 4 && !s.players.p1.trashCards.includes(MAGIC), "コアが足りなければ拒否され、何も動かない")
})

console.log("=== 6. 後始末：共有カードデータを戻した ===")
assert(host.effects === hostEffectsBefore && !host.effects.some((e) => e.kind === "handBurstEffectGrant"), "VANILLA の効果が元に戻っている")

console.log("すべてのチェックに合格しました 🎉（part616）")
