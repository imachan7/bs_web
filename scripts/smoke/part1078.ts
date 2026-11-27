// smoke パート1074（アルティメットの土台 段6a：【Uトリガー】。docs/design/ULTIMATE_STAGE6.md・ULTIMATE_PLAN C12・C14）
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { CARD_DB } from "../../server/src/logic/GameState"
import { magicColorBanned } from "../../shared/rules/constraints"
import { resolveUTrigger } from "../../server/src/logic/uTrigger"

const BASE = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const lv = [{ level: 3, cores: 1, bp: 5000 }, { level: 4, cores: 3, bp: 7000 }]
const vanilla = (id: string, cost: number, extra: object = {}): string => {
    CARD_DB.set(id, { ...getCard(BASE), cardId: id, cost, ...extra })
    return id
}
// デッキの札（印刷コスト n）／ガード札（ultimateMaxCost 以下のアルティメットのUトリガーをガードする）
const D = (n: number): string => vanilla(`TEST-D${n}`, n)
const GUARD7 = vanilla("TEST-G7", 2, { effects: [{ id: "TEST-G7-e1", kind: "uTriggerGuard", levels: null, ultimateMaxCost: 7 }] })
const GUARDANY = vanilla("TEST-GA", 2, { effects: [{ id: "TEST-GA-e1", kind: "uTriggerGuard", levels: null }] })

const destroyOne: EffectAction = { type: "destroy", count: 1 }
const draw = (n: number): EffectAction => ({ type: "draw", count: n })
let seq = 0
// 『アタック時』に uTrigger を発揮するアルティメット（偽）。xu＝XU の中身。other＝同じアタック時のもう1つの効果（XU なし）
function mkUlt(cost: number, count: number, hit: EffectAction[], xu?: EffectAction[], other?: EffectAction, trig = "onAttack"): string {
    const id = `TEST-U${++seq}`
    const uTrigger: EffectAction = { type: "uTrigger", count, hit, ...(xu ? { xu } : {}) }
    const effects: object[] = [{ id: `${id}-e1`, kind: "triggered", trigger: trig, levels: null, action: uTrigger }]
    if (other) effects.push({ id: `${id}-e2`, kind: "triggered", trigger: trig, levels: null, action: other })
    CARD_DB.set(id, { ...getCard(BASE), cardId: id, type: "ultimate", cost, levels: lv, effects: effects as never })
    return id
}
// 派生を見張る自分のスピリット（偽）。ヒット＝1枚・ガード＝3枚・発揮後＝9枚ドロー（手札の増え方から、どれが出たか読む）
const WATCH = (() => {
    const id = "TEST-W"
    const fe = (event: string, n: number) => ({ id: `${id}-${event}`, kind: "fieldEvent", event, levels: null, action: draw(n) })
    CARD_DB.set(id, { ...getCard(BASE), cardId: id, effects: [fe("ownUTriggerHit", 1), fe("ownUTriggerGuarded", 3), fe("ownUTriggered", 9)] as never })
    return id
})()
// 手札の増えた枚数 → 発火した派生（1=ヒット・3=ガード・9=発揮後）。例：10 → "ヒット+発揮後"
function fired(delta: number): string {
    const names: string[] = []
    if (delta >= 9) { names.unshift("発揮後"); delta -= 9 }
    if (delta >= 3) { names.unshift("ガード"); delta -= 3 }
    if (delta >= 1) names.unshift("ヒット")
    return names.join("+")
}

type Scene = { s: GameState; ult: ReturnType<typeof createInstance>; oppDeck: string[] }
function scene(seed: string, ultId: string, oppDeck: string[], oppSpirits = 1, watch = true): Scene {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.deck = Array.from({ length: 60 }, () => BASE)
    s.players.p1.hand = []
    s.players.p2.deck = [...oppDeck]
    s.players.p2.trashCards = []
    s.players.p1.field.spirits = watch ? [createInstance(WATCH, 1, 1)] : []
    s.players.p2.field.spirits = Array.from({ length: oppSpirits }, () => createInstance(BASE, 1, 1))
    const ult = createInstance(ultId, 1, 1)
    s.players.p1.field.ultimates = [ult]
    return { s, ult, oppDeck }
}
const attack = (sc: Scene): void => {
    const err = handleAction(sc.s, "p1", { type: "attack", instanceId: sc.ult.instanceId } as never)
    assert(err === null || err === undefined || typeof err !== "string", `（前提）アタックできる ${String(err)}`)
}
const handOf = (sc: Scene) => sc.s.players.p1.hand.length
const trashOf = (sc: Scene) => sc.s.players.p2.trashCards
const oppSpirits = (sc: Scene) => sc.s.players.p2.field.spirits.length


// バトル外のUトリガー：段1〜2 を同期で通す（再開の列は積まない）
function resolveUTriggerDirect(sc: Scene, ult: ReturnType<typeof createInstance>): void {
    const ctx = { state: sc.s, owner: "p1", opp: "p2", self: ult, sourceName: "偽", srcColors: undefined, srcType: "ultimate", sourceCardId: ult.cardId, srcInstanceId: ult.instanceId, destroyContext: {}, targetInstanceId: undefined, chosenOption: undefined, chosenCardIndex: undefined, paySources: undefined, resolve: () => {} }
    resolveUTrigger(ctx as never, { type: "uTrigger", count: 1, hit: [] })
}
const idx = (sc: Scene, n: number, from = 0): number => sc.s.log.findIndex((l, i) => i >= from && new RegExp(`(^|[^0-9])${n}枚ドロー`).test(l))
const noChoice = (sc: Scene): void => assert(!sc.s.pendingChoice, `（前提）選択待ちで止まっていない ${JSON.stringify(sc.s.pendingChoice)?.slice(0, 120)}`)

try {
    console.log("=== C14 XU は派生がすべて解決した後・同じアタック時の別の効果より先 ===")
    {
        // ヒット効果 draw2 → 破壊の「破壊したとき」(4) → ヒットしたとき(1)→発揮後(9) → XU(30)。別の効果(300)は XU の後
        const sc = scene("x1", mkUlt(5, 1, [draw(2)], [draw(20)], draw(15)), [D(1)])
        attack(sc)
        noChoice(sc)
        const iHit = idx(sc, 2), iAfter = idx(sc, 9), iXu = idx(sc, 20), iOther = idx(sc, 15)
        assert(iHit >= 0 && iHit < iAfter && iAfter < iXu, `ヒット効果 → 発揮後 → XU の順（${iHit},${iAfter},${iXu}）`)
        assert(iXu < iOther, `XU は同じアタック時の別の効果より先に解決される（${iXu},${iOther}）`)
        assert(handOf(sc) === 2 + 1 + 9 + 20 + 15, `すべて発揮された（${handOf(sc)}）`)
    }
    {
        // 派生より後：破壊の誘発（opponentSpiritDestroyed=4）も XU より先
        const DW = vanilla("TEST-DW", 1, { effects: [{ id: "TEST-DW-e1", kind: "fieldEvent", event: "opponentSpiritDestroyed", levels: null, action: draw(20) }] })
        const sc = scene("x1b", mkUlt(5, 1, [destroyOne], [draw(30)]), [D(1)], 1, false)
        sc.s.players.p1.field.spirits.push(createInstance(DW, 1, 1))
        attack(sc)
        const iD = idx(sc, 20), iXu = idx(sc, 30)
        assert(iD >= 0 && iD < iXu, `破壊時の誘発は XU より先（${iD},${iXu}）`)
    }
    {
        const sc = scene("x2", mkUlt(5, 1, [draw(2)], [draw(30)]), [GUARD7], 1, false)
        attack(sc)
        assert(handOf(sc) === 30, `ガードされてもXUは行う（ヒット効果は出ない）（${handOf(sc)}）`)
    }
    {
        const sc = scene("x3", mkUlt(5, 2, [draw(2)], [draw(30)]), [], 1, false)
        attack(sc)
        assert(handOf(sc) === 30, `相手のデッキが0枚でもXUは行う（${handOf(sc)}）`)
    }
    {
        const sc = scene("x4", mkUlt(5, 1, [draw(2)], [draw(30)]), [D(9)], 1, false)
        attack(sc)
        assert(handOf(sc) === 30, `全ミスでもXUは行う（${handOf(sc)}）`)
    }
    {
        // 入れ子：XU もUトリガー。同じ手順が通る（置く→判定→ヒット効果→派生）
        const sc = scene("x5", mkUlt(5, 1, [draw(2)], [{ type: "uTrigger", count: 1, hit: [draw(30)] } as EffectAction]), [D(1), D(1)])
        attack(sc)
        assert(trashOf(sc).length === 2, "XU のUトリガーも相手のデッキから置く")
        assert(handOf(sc) === 2 + 1 + 9 + 30 + 1 + 9, `入れ子のXUにもヒット効果と派生が出る（${handOf(sc)}）`)
    }
    {
        const sc = scene("x6", mkUlt(5, 1, [draw(2)]), [D(1)], 1, false)
        attack(sc)
        assert(handOf(sc) === 2, "xu が無いUトリガーはXUなし")
    }

    console.log("=== C12 ヒットしているバトルの印・uTriggerHitting ===")
    // 相手はマジックを使えない（既存の globalConstraint magicOnlyOwnFieldSymbolColors＝自分のシンボル色以外のマジックは使えない）に条件を付けた偽のスピリット。p2 は緑のみ→赤マジックは使えない
    const LOCK = vanilla("TEST-LOCK", 1, { effects: [{ id: "TEST-LOCK-e1", kind: "globalConstraint", levels: null, constraint: { type: "magicOnlyOwnFieldSymbolColors" }, condition: { uTriggerHitting: { kinds: ["ultimate"] } } }] })
    const banned = (sc: Scene): boolean => magicColorBanned(sc.s, "p1", ["blue"])
    const withLock = (sc: Scene): void => { sc.s.players.p1.field.spirits.push(createInstance(LOCK, 1, 1)) }
    // バトル中の別の窓で見るため、ヒット効果の中で状態を記録する代わりに、ステップ終了後に battle が残っている間（フラッシュ）を使う
    {
        const sc = scene("m1", mkUlt(5, 1, []), [D(1)], 1, false)
        withLock(sc)
        assert(!banned(sc), "（前提）バトル前は制限なし")
        attack(sc)
        assert(sc.s.battle?.uTriggerHitters?.includes(sc.ult.instanceId) === true, "ヒットした → バトルの印にアルティメットが入る")
        assert(banned(sc), "ヒットしているバトル中は条件が真になり、globalConstraint が効く")
    }
    {
        const sc = scene("m2", mkUlt(5, 1, []), [D(9)], 1, false)
        withLock(sc)
        attack(sc)
        assert(!sc.s.battle?.uTriggerHitters?.length && !banned(sc), "ミスなら印は付かず制限されない")
    }
    {
        const sc = scene("m3", mkUlt(5, 1, []), [GUARD7], 1, false)
        withLock(sc)
        attack(sc)
        assert(!sc.s.battle?.uTriggerHitters?.length && !banned(sc), "ガード札だけなら印は付かず制限されない")
    }
    {
        const sc = scene("m4", mkUlt(5, 1, []), [D(1)], 1, false)
        withLock(sc)
        attack(sc)
        sc.s.battle = null as never
        assert(!banned(sc), "バトルが終われば偽")
    }
    {
        // バトル外（召喚時）では印を書かない
        const sc = scene("m5", mkUlt(5, 1, [], undefined, undefined, "onSummon"), [D(1)], 1, false)
        withLock(sc)
        sc.s.battle = null as never
        sc.s.phase = "main"
        sc.s.players.p1.field.ultimates = []
        sc.s.players.p1.hand = [sc.ult.cardId]
        const ult = createInstance(sc.ult.cardId, 1, 1)
        sc.s.players.p1.field.ultimates = [ult]
        // 召喚時の効果を直接発火できないので、ハンドラを直接呼ぶ
        resolveUTriggerDirect(sc, ult)
        assert(sc.s.battle == null && trashOf(sc).length === 1, "（前提）バトル外でUトリガーが発揮された")
        assert(!banned(sc), "バトル外のUトリガーでは印が付かない")
    }
    {
        // 絞り込み：色が合わない条件では偽
        const LOCKB = vanilla("TEST-LOCKB", 1, { effects: [{ id: "TEST-LOCKB-e1", kind: "globalConstraint", levels: null, constraint: { type: "magicOnlyOwnFieldSymbolColors" }, condition: { uTriggerHitting: { kinds: ["ultimate"], color: "green" } } }] })
        const sc = scene("m6", mkUlt(5, 1, []), [D(1)], 1, false)
        sc.s.players.p1.field.spirits.push(createInstance(LOCKB, 1, 1))
        attack(sc)
        assert(!banned(sc), "絞り込みに合わないアルティメット（赤。条件は緑）のヒットでは偽")
    }
}
finally {
    // 後始末は不要（偽カードは CARD_DB のみ）
}
console.log("すべてのチェックに合格しました 🎉（part1078）")
