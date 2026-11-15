// smoke パート953（バーストの宣言と適用。BURST.md §1.4。2026-11-15 ユーザー確認）
// 宣言は条件を満たした時点、適用は「以降に解決する効果が無くなってから」。適用の時点を見る場面は handleAction（act）経由で書く
import { act, applyDeclaredBursts, assert, createGame, createInstance, declareBlock, getCard, placeBurst, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectDef } from "../../server/src/type"
import { fireEventBursts } from "../../server/src/logic/keywords/burst"
import { fireFieldEventTriggers } from "../../server/src/logic/fieldEventTriggers"

const KAISER = "BS02-036" // カイザレオン大帝（Lv2 アタック時：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く）
const JIGEN = "BS16-080" // 次元断（バースト：自分のライフ減少後、相手のスピリット1体を手札に戻す）
const YAMATO = "BS14-X01" // 龍の覇王ジーク・ヤマト・フリード（バースト：自分のライフ減少後、ライフ3以下のとき破壊→召喚）
const GANDINOS = "X13-01" // 太陽凶龍アポロ・ガンディノス（アタック時：BP5000以下の相手のスピリット1体を破壊。Lv2 から指定アタック）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ）
const TARAN = "BS16-025" // タランドーズ（Lv1 BP6000・効果なし）
const SOKO = "BS14-091" // 双光気弾（バースト：相手の効果による自分のスピリット破壊後、2枚ドロー）
const VANILLA = "BS01-002" // ロクケラトプス
const ACTOR = "BS01-089" // デュアルキャノン・ベル（効果なし）。アタック時効果を手で差し替えて使う

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(KAISER).name === "カイザレオン大帝" && getCard(KAISER).effects.some((e) => e.kind === "triggered" && e.trigger === "onBattleWin" && e.action.type === "lifeCrush"), "KAISER は勝利時に相手のライフを減らす")
    assert(getCard(JIGEN).name === "次元断" && getCard(JIGEN).effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged" && e.action.type === "return"), "JIGEN はライフ減少後に手札へ戻すバースト")
    assert(getCard(YAMATO).name === "龍の覇王ジーク・ヤマト・フリード" && getCard(YAMATO).effects.some((e) => e.kind === "burst" && e.event === "ownLifeDamaged" && e.action.type === "if" && JSON.stringify(e.action.cond).includes('"ownLife"') && JSON.stringify(e.action.cond).includes('"atMost":3')), "YAMATO はライフ3以下が条件のライフ減少後バースト")
    assert(getCard(GANDINOS).name === "太陽凶龍アポロ・ガンディノス" && getCard(KARAKURI).type === "brave" && getCard(TARAN).name === "タランドーズ", "指定アタックの場面のカード")
    assert(getCard(SOKO).name === "双光気弾" && getCard(SOKO).effects.some((e) => e.kind === "burst" && e.event === "ownSpiritDestroyed"), "SOKO は破壊後バースト")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(ACTOR).name === "デュアルキャノン・ベル" && getCard(ACTOR).effects.length === 0, "VANILLA・ACTOR は効果なし")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const texts = (s: GameState, from: number): string[] => s.log.slice(from).map((l) => (typeof l === "string" ? l : (l as { message: string }).message))
const at = (t: string[], part: string): number => t.findIndex((m) => m.includes(part))
// ACTOR の『アタック時』効果を手で組む（終わったら戻す）
function withAttackEffect(action: Extract<EffectDef, { kind: "triggered" }>["action"], run: () => void): void {
    const card = getCard(ACTOR)
    const original = card.effects
    card.effects = [{ id: "t953", kind: "triggered", trigger: "onAttack", levels: [1, 2, 3], optional: false, action }]
    try {
        run()
    } finally {
        card.effects = original
    }
}

console.log("=== 1. ライフを減らす。その後ドロー：バースト効果の適用はドローの後（非対話） ===")
withAttackEffect({ type: "sequence", actions: [{ type: "lifeCrush", count: 1 }, { type: "draw", count: 1 }] }, () => {
    const s = game("after-draw")
    const actor = put(s, "p1", ACTOR)
    placeBurst(s, "p2", JIGEN)
    s.phase = "attack"
    const from = s.log.length
    assert(act(s, "p1", { type: "attack", instanceId: actor.instanceId }) === null, "アタックできる")
    const t = texts(s, from)
    const declared = at(t, "バースト（次元断）を発動した")
    const drew = at(t, "アキラは1枚ドローした")
    const applied = at(t, "手札に戻った")
    assert(s.players.p2.life === 4 && declared !== -1 && drew !== -1 && applied !== -1, "ライフが減り、バーストを宣言し、ドローし、バースト効果を適用した")
    assert(declared < drew, "宣言は、ライフが減った時点（ドローより前）")
    assert(drew < applied, "バースト効果の適用は、ドローの後")
    assert(!s.players.p2.burstSet && s.declaredBursts === undefined, "適用し終えたらバーストエリアは空で、控えも残らない")
})

console.log("=== 2. 同じ場面を対話で：発動の確認はライフが減った時点、適用はドローの後 ===")
withAttackEffect({ type: "sequence", actions: [{ type: "lifeCrush", count: 1 }, { type: "draw", count: 1 }] }, () => {
    const s = game("after-draw-interactive", true)
    const actor = put(s, "p1", ACTOR)
    placeBurst(s, "p2", JIGEN)
    s.phase = "attack"
    const hand = s.players.p1.hand.length
    const from = s.log.length
    act(s, "p1", { type: "attack", instanceId: actor.instanceId })
    assert(s.pendingChoice?.pid === "p2" && s.pendingChoice.prompt.includes("次元断"), "ライフが減った時点で、発動の確認が出る")
    assert(s.players.p1.hand.length === hand, "確認の時点では、まだドローしていない")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options![0]! })
    for (let i = 0; i < 6 && s.pendingChoice; i++) act(s, s.pendingChoice.pid, { type: "resolveChoice", option: s.pendingChoice.options![0]! })
    const t = texts(s, from)
    assert(at(t, "アキラは1枚ドローした") !== -1 && at(t, "アキラは1枚ドローした") < at(t, "手札に戻った"), "バースト効果の適用は、ドローの後")
    assert(!s.players.p1.field.spirits.includes(actor), "バースト効果で、アタックしたスピリットが手札に戻った")
})

console.log("=== 3. 宣言から適用までに効果の条件を満たさなくなったら不発（カードはトラッシュへ） ===")
// 後半は対象を選ぶ効果にして、その選択待ちの間にライフを4へ戻す（星宿の障壁 Lv2 の代わり）
withAttackEffect({ type: "sequence", actions: [{ type: "lifeCrush", count: 1 }, { type: "exhaust", count: 1 }] }, () => {
    for (const heal of [false, true]) {
        const s = game(`fizzle-${heal}`, true)
        s.players.p2.life = 4
        const actor = put(s, "p1", ACTOR)
        put(s, "p2", VANILLA)
        put(s, "p2", VANILLA)
        placeBurst(s, "p2", YAMATO)
        s.phase = "attack"
        act(s, "p1", { type: "attack", instanceId: actor.instanceId })
        assert(s.players.p2.life === 3 && s.pendingChoice?.prompt.includes("ジーク・ヤマト・フリード") === true, "ライフ3で発動の確認が出る")
        act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options![0]! })
        assert(s.pendingChoice?.kind === "target" && s.pendingChoice.pid === "p1" && s.declaredBursts?.length === 1, "宣言は済み、アタック時効果の続き（対象選び）で止まっている")
        if (heal) s.players.p2.life = 4
        act(s, "p1", { type: "resolveChoice", instanceId: s.pendingChoice!.candidates[0]! })
        for (let i = 0; i < 6 && s.pendingChoice; i++) {
            const pc = s.pendingChoice
            act(s, pc.pid, pc.kind === "target" ? { type: "resolveChoice", instanceId: pc.candidates[0]! } : { type: "resolveChoice", option: pc.options![0]! })
        }
        const summoned = s.players.p2.field.spirits.some((x) => x.cardId === YAMATO)
        if (heal) {
            assert(!summoned && s.players.p2.trashCards.includes(YAMATO) && s.players.p2.burst === null, "条件を満たさなくなった：召喚されず、バーストはトラッシュに置かれる")
            assert(s.players.p1.field.spirits.includes(actor), "破壊も発揮されない")
        } else {
            assert(summoned && !s.players.p1.field.spirits.includes(actor), "条件を満たしたまま：破壊して召喚する（対照）")
        }
    }
})

console.log("=== 4. バトルの勝利時にライフが減った：適用は、敗者をトラッシュに置いた後（バトルの step 5） ===")
{
    const s = game("battle")
    const kaiser = put(s, "p1", KAISER, 7)
    const loser = put(s, "p2", VANILLA)
    placeBurst(s, "p2", JIGEN)
    s.phase = "attack"
    const from = s.log.length
    let appliedWithLoserOnField: boolean | undefined
    const push = s.log.push.bind(s.log)
    s.log.push = (...items) => {
        for (const it of items) {
            const m = typeof it === "string" ? it : (it as { message: string }).message
            if (m.includes("手札に戻った")) appliedWithLoserOnField = s.players.p2.field.spirits.includes(loser)
        }
        return push(...items)
    }
    assert(act(s, "p1", { type: "attack", instanceId: kaiser.instanceId }) === null && declareBlock(s, "p2", loser.instanceId) === null, "アタックしてブロックされる")
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    assert(s.players.p2.life === 4 && at(texts(s, from), "バースト（次元断）を発動した") !== -1, "勝利時効果でライフが減り、バーストを宣言した")
    assert(appliedWithLoserOnField === false, "バースト効果を適用した時点で、敗者はもう場にいない")
    assert(!s.players.p1.field.spirits.includes(kaiser) && s.players.p1.hand.includes(KAISER), "バースト効果で、勝ったスピリットが手札に戻った")
}

console.log("=== 5. 破壊後バースト：破壊した効果の「その後」の句まで解決してから適用する ===")
withAttackEffect({ type: "sequence", actions: [{ type: "destroy", filter: { maxBp: 5000 }, count: 1 }, { type: "draw", count: 1 }] }, () => {
    const s = game("destroy-then")
    const actor = put(s, "p1", ACTOR)
    put(s, "p2", VANILLA)
    placeBurst(s, "p2", SOKO)
    s.phase = "attack"
    const from = s.log.length
    act(s, "p1", { type: "attack", instanceId: actor.instanceId })
    const t = texts(s, from)
    const mine = at(t, "アキラは1枚ドローした")
    const theirs = at(t, "ユウキは2枚ドローした")
    assert(mine !== -1 && theirs !== -1 && mine < theirs, "破壊した効果のその後のドローが先、破壊後バーストの2枚ドローが後")
})

console.log("=== 6. 待機状態のカードがいる間は適用しない ===")
{
    const s = game("waiting")
    const waiting = put(s, "p1", VANILLA)
    const target = put(s, "p1", VANILLA)
    placeBurst(s, "p2", JIGEN)
    waiting.waiting = { kind: "destroy" }
    fireFieldEventTriggers(s, "p2", "ownLifeLost")
    assert(s.declaredBursts?.length === 1 && s.players.p2.burstSet, "条件を満たした時点で宣言する（カードは適用までバーストエリアに残る）")
    applyDeclaredBursts(s)
    assert(s.declaredBursts?.length === 1 && s.players.p1.field.spirits.includes(target), "待機状態のカードがいる間は適用しない")
    delete waiting.waiting
    applyDeclaredBursts(s)
    assert(s.declaredBursts === undefined && !s.players.p2.burstSet, "待機状態のカードがいなくなったら適用する")
}

console.log("=== 7. 条件を満たした後にセットしたバーストは、その条件では発動できない ===")
{
    const s = game("set-later")
    put(s, "p1", VANILLA)
    placeBurst(s, "p2", JIGEN)
    // 確認を後回しにした経路：条件の時点ではセットなし（null）だった
    fireEventBursts(s, [{ pid: "p2", event: "ownLifeDamaged", setCardId: null }])
    assert(s.declaredBursts === undefined && s.players.p2.burstSet, "後からセットしたバーストは宣言されない")
    fireEventBursts(s, [{ pid: "p2", event: "ownLifeDamaged", setCardId: JIGEN }])
    assert(s.declaredBursts?.length === 1, "条件の時点でセットされていたバーストは宣言できる（対照）")
    fireEventBursts(s, [{ pid: "p2", event: "ownLifeDamaged" }])
    assert(s.declaredBursts?.length === 1, "宣言済みのバーストは、次の条件で宣言し直さない")
}

console.log("=== 8. 両者が宣言していたら、防御側から適用する ===")
{
    const s = game("defender-first")
    put(s, "p1", VANILLA)
    put(s, "p2", VANILLA)
    placeBurst(s, "p1", JIGEN)
    placeBurst(s, "p2", JIGEN)
    s.players.p1.reserve = 10
    fireFieldEventTriggers(s, "p1", "ownLifeLost") // ターンプレイヤー（p1）が先に宣言
    fireFieldEventTriggers(s, "p2", "ownLifeLost")
    assert(s.turnPlayer === "p1" && s.declaredBursts?.map((d) => d.pid).join(",") === "p1,p2", "宣言の順はターンプレイヤーが先")
    const from = s.log.length
    applyDeclaredBursts(s)
    const t = texts(s, from)
    const p2 = at(t, "アキラのロクケラトプスは手札に戻った")
    const p1 = at(t, "ユウキのロクケラトプスは手札に戻った")
    assert(p2 !== -1 && p1 !== -1 && p2 < p1, "防御側（p2）のバースト効果を先に適用する")
}

console.log("=== 9. 指定アタック：バーストを解決し終えてから、ブロックを確定する（TIMING_CHART §1.10） ===")
{
    const s = game("directed", true)
    const atk = put(s, "p1", GANDINOS, 3)
    // アタック時効果で破壊される合体スピリット（ブレイヴを残す確認が挟まる）と、指定先（BP6000 で破壊されない）
    const host = put(s, "p2", VANILLA)
    const target = put(s, "p2", TARAN)
    const brave = createInstance(KARAKURI, 1, 0)
    s.players.p2.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    placeBurst(s, "p2", SOKO)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId, targetSpiritInstanceId: target.instanceId }) === null, "指定アタックできる")
    assert(s.pendingChoice?.kind === "option" && s.pendingChoice.prompt.includes("カラクリバッタ"), "ブレイヴを残すかの確認が出る")
    act(s, "p2", { type: "resolveChoice", option: s.pendingChoice!.options![0]! })
    assert(s.pendingChoice?.prompt.includes("双光気弾") === true, "次に破壊後バーストの確認が出る")
    assert(s.battle?.blockerInstanceId == null, "バーストの確認の時点では、ブロックはまだ確定していない")
    for (let i = 0; i < 6 && s.pendingChoice; i++) act(s, s.pendingChoice.pid, { type: "resolveChoice", option: s.pendingChoice.options![0]! })
    assert(!s.players.p2.burstSet, "バーストが発動した")
    assert(s.battle?.blockerInstanceId === target.instanceId, "バーストを解決し終えたら、指定先のブロックが確定する")
}

console.log("すべてのチェックに合格しました 🎉（part953）")
