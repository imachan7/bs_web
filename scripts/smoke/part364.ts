// smoke パート364（timedEffect target:"self" ＝旧 selfBuff の置き換え：新旧一致・可変量・countOnce・追加カウンタの検証）
import {
    assert,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { countedAmount } from "../../server/src/logic/counted"
import type { CardData, CardInstance, EffectAction, EffectCounter } from "../../server/src/type"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    return s
}

function putSpirit(s: GameState, pid: PlayerId, cardId: string, rested = false): CardInstance {
    const inst = createInstance(cardId, s.turn, 1)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

function findCard(pred: (c: CardData) => boolean): CardData | undefined {
    return ALL_CARDS.find(pred)
}

// 効果に selfBuff アクションが要求する盤面を、対応するカードを ALL_CARDS から探して用意する
// （足りなければ何もしない＝カウント0のまま。呼び出し側で0件を数える）
function setupForCounter(s: GameState, self: CardInstance, owner: PlayerId, opp: PlayerId, counter: EffectCounter | undefined): void {
    if (counter === undefined) return
    if (counter === "readyEnemies") {
        const c = findCard((c) => c.type === "spirit")
        if (c) putSpirit(s, opp, c.cardId, false)
        return
    }
    if (counter === "ownReserve") {
        s.players[owner].reserve = 3
        return
    }
    if (counter === "ownNexuses" || counter === "allNexuses") {
        const c = findCard((c) => c.type === "nexus")
        if (c) putNexus(s, owner, c.cardId)
        return
    }
    if (counter === "opponentTrashCores") {
        s.players[opp].trashCores = 3
        return
    }
    if (counter === "ownBraveSpirits") {
        const c = findCard((c) => c.type === "brave")
        if (c) putSpirit(s, owner, c.cardId)
        return
    }
    if (counter === "ownExhausted") {
        putSpirit(s, owner, self.cardId, true)
        return
    }
    if (counter === "selfCores") {
        self.cores = 3
        return
    }
    if (counter === "battlingOpponentSymbols" || counter === "battlingOpponentCombinedSymbols") {
        const c = counter === "battlingOpponentCombinedSymbols" ? findCard((c) => c.type === "brave") : findCard((c) => c.type === "spirit")
        if (!c) return
        const otherInst = putSpirit(s, opp, c.cardId)
        s.battle = { attackerInstanceId: self.instanceId, blockerInstanceId: otherInst.instanceId, flashLockedPlayer: null, directed: false }
        return
    }
    if (counter === "lastFunsaiSpirits") {
        s.lastFunsai = { total: 3, spirits: 2, nexuses: 0, magics: 0, costAtLeast4: 0 }
        return
    }
    if (typeof counter === "object") {
        if ("ownFamily" in counter) {
            const fam = Array.isArray(counter.ownFamily) ? counter.ownFamily[0] : counter.ownFamily
            if (fam === undefined) return
            const c = findCard((c) => c.type === "spirit" && c.family.includes(fam))
            if (c) putSpirit(s, owner, c.cardId)
            return
        }
        if ("ownNameIncludes" in counter) {
            const c = findCard((c) => c.type === "spirit" && c.name.includes(counter.ownNameIncludes))
            if (c) putSpirit(s, owner, c.cardId)
            return
        }
        if ("anyNameIncludes" in counter) {
            const c = findCard((c) => c.type === "spirit" && c.name.includes(counter.anyNameIncludes))
            if (c) putSpirit(s, owner, c.cardId)
            return
        }
        if ("ownColor" in counter) {
            const c = findCard((c) => c.type === "spirit" && c.colors.includes(counter.ownColor))
            if (c) putSpirit(s, owner, c.cardId)
            return
        }
        if ("ownNexusColor" in counter) {
            const c = findCard((c) => c.type === "nexus" && c.colors.includes(counter.ownNexusColor))
            if (c) putNexus(s, owner, c.cardId)
            return
        }
        if ("ownKeyword" in counter) {
            const c = findCard((c) => c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === counter.ownKeyword))
            if (c) putSpirit(s, owner, c.cardId)
            return
        }
        if ("enemyCost" in counter) {
            const { max, min } = counter.enemyCost
            const c = findCard((c) => c.type === "spirit" && c.cost >= (min ?? 0) && c.cost <= (max ?? 99))
            if (c) putSpirit(s, opp, c.cardId)
            return
        }
    }
}

type OldSelfBuff = { type: "selfBuff"; amount: number; amountCounter?: EffectCounter }

// card.effects を再帰的に探索し、selfBuff アクションをすべて集める（sequence/pay 等どこに入っていても拾う）
function collectSelfBuffActions(node: unknown, out: OldSelfBuff[]): void {
    if (Array.isArray(node)) {
        for (const item of node) collectSelfBuffActions(item, out)
        return
    }
    if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>
        if (obj.type === "selfBuff" && typeof obj.amount === "number") {
            out.push(obj as unknown as OldSelfBuff)
        }
        // カードデータは timedEffect（target:"self"）へ移してあるので、そこから旧 selfBuff を組み立て直す
        const content = obj.content as { type: string; amount: number; amountCounter?: EffectCounter }[] | undefined
        if (obj.type === "timedEffect" && obj.target === "self" && content?.length === 1 && content[0]!.type === "bp") {
            const bp = content[0]!
            const old: OldSelfBuff = { type: "selfBuff", amount: bp.amount, ...(bp.amountCounter !== undefined ? { amountCounter: bp.amountCounter } : {}) }
            // 期間は『アタック時』『ブロック時』なら battle、それ以外は turn（ACTION_VOCABULARY §4）。ここでは形だけを比べる
            assert(
                (obj.duration === "turn" || obj.duration === "battle") &&
                    canonical({ ...(toTimedEffect(old) as Record<string, unknown>), duration: obj.duration }) === canonical(obj),
                `データの書き方は確定スキーマの変換どおり（${JSON.stringify(obj)}）`,
            )
            out.push(old)
        }
        for (const key of Object.keys(obj)) collectSelfBuffActions(obj[key], out)
    }
}

function canonical(v: unknown): string {
    return JSON.stringify(v, (_k, x: unknown) =>
        x && typeof x === "object" && !Array.isArray(x)
            ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
            : x,
    )
}

function toTimedEffect(action: OldSelfBuff): EffectAction {
    return {
        type: "timedEffect",
        duration: "turn",
        target: "self",
        content: [
            {
                type: "bp",
                amount: action.amount,
                ...(action.amountCounter !== undefined ? { amountCounter: action.amountCounter } : {}),
                ...(action.amountCounter === "lastFunsaiSpirits" ? { countOnce: true } : {}),
            },
        ],
    }
}

function runAction(cardId: string, action: EffectAction, counter: EffectCounter | undefined, seed: string): number {
    const s = game(seed)
    const self = putSpirit(s, "p1", cardId)
    setupForCounter(s, self, "p1", "p2", counter)
    resolveAction(s, "p1", self, action)
    return effectiveBp(s, "p1", self)
}

// 旧 selfBuff（削除済み）の結果：解決時に countedAmount で数えた値を tempBpBuff に足す（0なら何もしない）
function oldSelfBuffBp(cardId: string, action: OldSelfBuff, seed: string): number {
    const s = game(seed)
    const self = putSpirit(s, "p1", cardId)
    setupForCounter(s, self, "p1", "p2", action.amountCounter)
    const add = action.amountCounter !== undefined ? countedAmount(s, "p1", self, action.amount, action.amountCounter, undefined) : action.amount
    self.tempBpBuff += add
    return effectiveBp(s, "p1", self)
}

console.log("=== 1. 新旧一致：selfBuff を持つ全カード（変換後の timedEffect target:self と解決直後のBPを比べる） ===")
{
    const entries: { cardId: string; action: OldSelfBuff }[] = []
    for (const c of ALL_CARDS) {
        const found: OldSelfBuff[] = []
        collectSelfBuffActions(c.effects, found)
        for (const a of found) entries.push({ cardId: c.cardId, action: a })
    }
    // BS16-024 は『自分のアタックステップ』見出しの継続効果としてオーラへ移したので 82-1
    assert(entries.length === 83, `移行した「このスピリットをBP+」は83件（フェネボラック・キマイラ・デブリを含む）（実際:${entries.length}）`)
    assert(!JSON.stringify(ALL_CARDS.map((c) => c.effects)).includes('"type":"selfBuff"'), "カードデータに旧 selfBuff は残っていない")

    let mismatches = 0
    let zeroCount = 0
    for (const { cardId, action } of entries) {
        const oldBp = oldSelfBuffBp(cardId, action, `old-${cardId}-${action.amount}`)
        const newAction = toTimedEffect(action)
        const newBp = runAction(cardId, newAction, action.amountCounter, `new-${cardId}-${action.amount}`)
        if (action.amountCounter !== undefined) {
            const s = game(`count-${cardId}`)
            const self = putSpirit(s, "p1", cardId)
            setupForCounter(s, self, "p1", "p2", action.amountCounter)
            const raw = countedAmount(s, "p1", self, action.amount, action.amountCounter, getCard(cardId).type)
            if (raw === 0) zeroCount++
        }
        if (oldBp !== newBp) {
            mismatches++
            console.log(`  不一致: ${cardId} action=${JSON.stringify(action)} old=${oldBp} new=${newBp}`)
        }
    }
    console.log(`不一致: ${mismatches}件 / 82件中カウントが0だった盤面: ${zeroCount}件`)
    assert(mismatches === 0, "全selfBuffカードで新旧のBPが一致すること")
}

console.log("=== 2. 可変量：readyEnemies（解決後に相手の回復スピリットが増えるとBPも増える） ===")
{
    const anySpirit = findCard((c) => c.type === "spirit" && c.cardId !== "BS01-002")
    assert(anySpirit !== undefined, "相手側に置くスピリットカードが見つかること")
    const s = game("variable-readyEnemies")
    const self = putSpirit(s, "p1", "BS01-002")
    const action = toTimedEffect({ type: "selfBuff", amount: 1000, amountCounter: "readyEnemies" })
    resolveAction(s, "p1", self, action)
    const bpBefore = effectiveBp(s, "p1", self)
    putSpirit(s, "p2", anySpirit!.cardId, false)
    const bpAfter = effectiveBp(s, "p1", self)
    assert(bpAfter > bpBefore, `場に出た相手スピリットぶんBPが増える（before=${bpBefore} after=${bpAfter}）`)
}

console.log("=== 2b. 可変量：{ownFamily}（解決後に自分の同系統が増えるとBPも増える） ===")
{
    const famCard = findCard((c) => c.type === "spirit" && c.family.length > 0)
    assert(famCard !== undefined, "系統を持つスピリットカードが見つかること")
    const fam = famCard!.family[0]!
    const s = game("variable-ownFamily")
    const self = putSpirit(s, "p1", "BS01-002")
    const action = toTimedEffect({ type: "selfBuff", amount: 1000, amountCounter: { ownFamily: fam } as unknown as EffectCounter })
    resolveAction(s, "p1", self, action)
    const bpBefore = effectiveBp(s, "p1", self)
    putSpirit(s, "p1", famCard!.cardId, false)
    const bpAfter = effectiveBp(s, "p1", self)
    assert(bpAfter > bpBefore, `場に出た自分の同系統ぶんBPが増える（before=${bpBefore} after=${bpAfter}）`)
}

console.log("=== 3. countOnce：lastFunsaiSpirits 相当は解決後に数が変わってもBPが変わらない ===")
{
    const s = game("countOnce")
    const self = putSpirit(s, "p1", "BS01-002")
    const base = effectiveBp(s, "p1", self)
    s.lastFunsai = { total: 3, spirits: 2, nexuses: 0, magics: 0, costAtLeast4: 0 }
    const action = toTimedEffect({ type: "selfBuff", amount: 1000, amountCounter: "lastFunsaiSpirits" })
    resolveAction(s, "p1", self, action)
    const bpFixed = effectiveBp(s, "p1", self)
    assert(bpFixed === base + 2000, `countOnceで2体ぶん固定される（期待:${base + 2000} 実際:${bpFixed}）`)
    s.lastFunsai.spirits = 0
    const bpAfter = effectiveBp(s, "p1", self)
    assert(bpAfter === bpFixed, `解決後にlastFunsaiが変わってもBPは変わらない（fixed=${bpFixed} after=${bpAfter}）`)
}

console.log("=== 4. 追加したカウンタが countEffectCounter（サーバーの数え方）と同じ値を返す ===")
{
    // opponentTrashCores
    {
        const s = game("counter-check-1")
        const self = putSpirit(s, "p1", "BS01-002")
        const base = effectiveBp(s, "p1", self)
        s.players.p2.trashCores = 4
        const action: EffectAction = { type: "timedEffect", duration: "turn", target: "self", content: [{ type: "bp", amount: 1000, amountCounter: "opponentTrashCores" }] }
        resolveAction(s, "p1", self, action)
        assert(effectiveBp(s, "p1", self) === base + 4000, "opponentTrashCoresは相手のトラッシュコア数と同じ値で計算される")
    }
    // ownBraveSpirits
    {
        const braveCard = findCard((c) => c.type === "brave")
        assert(braveCard !== undefined, "ブレイヴカードが見つかること")
        const s = game("counter-check-2")
        const self = putSpirit(s, "p1", "BS01-002")
        const base = effectiveBp(s, "p1", self)
        putSpirit(s, "p1", braveCard!.cardId)
        putSpirit(s, "p1", braveCard!.cardId)
        const action: EffectAction = { type: "timedEffect", duration: "turn", target: "self", content: [{ type: "bp", amount: 1000, amountCounter: "ownBraveSpirits" }] }
        resolveAction(s, "p1", self, action)
        assert(effectiveBp(s, "p1", self) === base + 2000, "ownBraveSpiritsは自分の場のスピリット状態ブレイヴ数と同じ値で計算される")
    }
    // selfCores（コア数を変えると現在Lvも変わるため、コアを足す前のBPを基準に増分だけを比べる）
    {
        const s = game("counter-check-3")
        const self = putSpirit(s, "p1", "BS01-002")
        const coresBefore = self.cores
        const action: EffectAction = { type: "timedEffect", duration: "turn", target: "self", content: [{ type: "bp", amount: 100, amountCounter: "selfCores" }] }
        resolveAction(s, "p1", self, action)
        const bp = effectiveBp(s, "p1", self)
        const withoutBuff = bp - 100 * coresBefore
        assert(100 * coresBefore > 0 && bp > withoutBuff, `selfCoresは自身のコア数と同じ値で計算される（コア数:${coresBefore} BP:${bp}）`)
    }
    // battlingOpponentSymbols
    {
        const oppCard = findCard((c) => c.type === "spirit" && c.symbol.length > 0)
        assert(oppCard !== undefined, "シンボルを持つスピリットカードが見つかること")
        const s = game("counter-check-4")
        const self = putSpirit(s, "p1", "BS01-002")
        const base = effectiveBp(s, "p1", self)
        const otherInst = putSpirit(s, "p2", oppCard!.cardId)
        s.battle = { attackerInstanceId: self.instanceId, blockerInstanceId: otherInst.instanceId, flashLockedPlayer: null, directed: false }
        const action: EffectAction = { type: "timedEffect", duration: "turn", target: "self", content: [{ type: "bp", amount: 1000, amountCounter: "battlingOpponentSymbols" }] }
        resolveAction(s, "p1", self, action)
        const expected = base + 1000 * oppCard!.symbol.length
        assert(effectiveBp(s, "p1", self) === expected, `battlingOpponentSymbolsはバトル相手のシンボル数と同じ値で計算される（期待:${expected} 実際:${effectiveBp(s, "p1", self)}）`)
    }
}

console.log("=== 5. 【装甲】の数（BS06-048 の数え方）が実カードで1以上になる ===")
{
    const ARMOR = "BS05-028"
    assert(getCard(ARMOR).name === "アーメットクラブ", "ARMORはアーメットクラブ（【装甲】持ち）")
    const s = game("armor-count")
    const self = putSpirit(s, "p1", "BS06-048")
    putSpirit(s, "p1", ARMOR)
    const before = effectiveBp(s, "p1", self)
    resolveAction(s, "p1", self, { type: "timedEffect", content: [{ type: "bp", amount: 1000, amountCounter: { ownKeyword: "armor" } }], duration: "turn", target: "self" })
    assert(effectiveBp(s, "p1", self) === before + 1000, "【装甲】を持つ自分のスピリット1体ぶん BP+1000")
}

console.log("=== 6. 1体指定の「相手のフィールドの色の数」も可変（BS15-033・BS15-028。#106 で固定になっていた） ===")
{
    const s = game("field-colors")
    const target = putSpirit(s, "p1", "BS01-001")
    putSpirit(s, "p2", "BS01-001") // 赤
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "bp", amount: 3000, amountCounter: "opponentFieldColors" }], duration: "turn", side: "own" }, target.instanceId)
    const one = effectiveBp(s, "p1", target)
    const blue = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "blue")!
    putSpirit(s, "p2", blue.cardId)
    assert(effectiveBp(s, "p1", target) === one + 3000, "解決後に相手の色が1つ増えると BP+3000 増える")
}

console.log("すべてのチェックに合格しました 🎉（part364）")
