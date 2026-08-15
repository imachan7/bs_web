// smoke パート190（全効果エントリの火入れ＝総当たり）
//
// `npm run coverage:effects` が「**カードデータに書いてあるのに一度も発火していない**」と
// 報告する効果エントリを、まとめて潰すためのドライバ。
//
// **1枚ずつ挙動を検証するテストではない**（それは他のパートの仕事）。
// ここが見るのは「どのカードの、どの効果エントリも、**現実的な盤面で例外を出さずに解決しきる**」こと:
//   - 例外が出ない
//   - 選択待ち（pendingChoice）が残らない
//   - カードの総数が変わらない（保存則）
// カバレッジの穴を埋めるついでに、めったに触られないカードのクラッシュを拾う網になる。
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    fireStepTriggers,
    effectiveBp,
    effectSources,
    spiritHasKeyword,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger, fireFieldEventTriggers, fireBattleWonTriggers, resolveMagic } from "../../server/src/logic/EffectModules"
import { activeConstraints, instHasColor, noLifeDamageByCost } from "../../shared/rules"
import { canBlock } from "../../shared/block"
import { effectiveCost } from "../../server/src/logic/RuleValidator"
import { loadAllCards } from "../../data/loadCards"
import { KEYWORDS } from "../../shared/rules"
import type { CardData, EffectDef, Phase, TriggerEvent } from "../../server/src/type"

const CARDS = loadAllCards() as unknown as CardData[]
const PHASES: Phase[] = ["start", "core", "draw", "refresh", "main", "attack", "end"]

// 盤面を作るときの脇役。**実データから決定的に選ぶ**（cardIdの直書きは過去にIDズレ事故があるため）。
// 色ごとに「効果の記述を持たないスピリット」を1枚ずつ拾う
const VANILLA_BY_COLOR = new Map<string, CardData>()
for (const c of CARDS) {
    if (c.type !== "spirit") continue
    if ((c.effects ?? []).length > 0) continue
    for (const col of c.colors) if (!VANILLA_BY_COLOR.has(col)) VANILLA_BY_COLOR.set(col, c)
}
const HELPERS = [...VANILLA_BY_COLOR.values()]
// 手札・トラッシュに入れる種別ごとの1枚（効果を持たないものを優先し、無ければ先頭）
const pickByType = (type: string): CardData =>
    CARDS.find((c) => c.type === type && (c.effects ?? []).length === 0) ??
    CARDS.find((c) => c.type === type)!
const FILLER = { spirit: pickByType("spirit"), nexus: pickByType("nexus"), magic: pickByType("magic") }

// 効果の中に書かれた**系統名**をすべて集める（familyFilter / ownFamily / family …）。
// 「系統：殻虫のスピリット1体につき」のような条件は、盤面にその系統がいないと**一度も発火しない**。
// EffectDef は判別共用体で系統の書き場所が型ごとに散らばっているため、値として再帰的に拾う
function familiesIn(node: unknown, acc: Set<string>): void {
    if (Array.isArray(node)) {
        for (const v of node) familiesIn(v, acc)
        return
    }
    if (node === null || typeof node !== "object") return
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (/family/i.test(k)) {
            if (typeof v === "string") acc.add(v)
            else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") acc.add(x)
        }
        familiesIn(v, acc)
    }
}

function put(s: GameState, pid: PlayerId, card: CardData, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, card: CardData, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(card.cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}
// そのカードの最高レベルに必要なコア数
const maxCores = (card: CardData): number =>
    (card.levels ?? []).reduce((max, lv) => Math.max(max, lv.cores), 1)

// カードの総数（保存則の検査用）
function totalCards(s: GameState): number {
    let n = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        n += p.deck.length + p.hand.length + p.trashCards.length + p.tegamoto.length
        n += p.field.spirits.length + p.field.nexuses.length
    }
    n += s.revealedCards?.cardIds.length ?? 0
    return n
}

// 立っている選択待ちを候補の先頭で解消する（非対話モードでも一部の効果は選択を立てる）
function drain(s: GameState): boolean {
    for (let i = 0; i < 40; i++) {
        if (!s.pendingChoice || s.winner) return true
        const pending = s.pendingChoice
        const response: Record<string, unknown> = { type: "resolveChoice" }
        if (pending.kind === "target") response["instanceId"] = pending.candidates[0]
        else if (pending.kind === "option") response["option"] = pending.options?.[0]
        else response["cardIndex"] = pending.cardIndices?.[0]
        const before = pending
        handleAction(s, pending.pid, response as never)
        if (s.pendingChoice === before) return false
    }
    return false
}

// 「現実的で、条件が通りやすい」盤面を作る。テスト対象のカードは p1 のフィールド（またはネクサス帯）に置く
function buildBoard(testCard: CardData): {
    s: GameState
    selfInst: ReturnType<typeof createInstance> | null
} {
    const s: GameState = createGame(
        `cov-${testCard.cardId}`,
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "red", p2: "blue" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        p.reserve = 12
        p.trashCores = 6
        p.life = 5
        // 手札・トラッシュに種別ひととおり（回収・破棄・召喚系が空振りしないように）
        p.hand.push(FILLER.spirit.cardId, FILLER.nexus.cardId, FILLER.magic.cardId)
        p.trashCards.push(FILLER.spirit.cardId, FILLER.nexus.cardId, FILLER.magic.cardId)
        // 脇役スピリットを色違いで並べる（色・系統・コストの条件が通りやすくなる）
        for (const h of HELPERS) put(s, pid, h, maxCores(h))
        putNexus(s, pid, FILLER.nexus, 3)
    }
    // テスト対象が**系統を条件にしている**なら、その系統を持つスピリットを両陣営に置く。
    // これが無いと「系統：〇〇のスピリット」を見る効果は永久に発火しない（殻虫・剣獣・天霊…）
    const families = new Set<string>()
    familiesIn(testCard.effects ?? [], families)
    for (const fam of families) {
        const helper = CARDS.find(
            (c) => c.type === "spirit" && (c.family ?? []).includes(fam) && c.cardId !== testCard.cardId,
        )
        if (!helper) continue
        for (const pid of ["p1", "p2"] as PlayerId[]) put(s, pid, helper, maxCores(helper))
    }
    // **Lv1 の個体も**1体ずつ置く（「Lv1のスピリットは〜」のようなレベル条件のため。
    // 他の脇役は最高Lvで置いているので、Lv1 を見る効果はそれだけでは通らない）
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const low = HELPERS[0]
        if (low) put(s, pid, low, 1)
    }
    // 疲労状態のものも1体ずつ作る（「疲労状態の〜」「回復させる」が空振りしないように）
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const first = s.players[pid].field.spirits[0]
        if (first) first.isRested = true
    }
    let selfInst: ReturnType<typeof createInstance> | null = null
    if (testCard.type === "spirit") selfInst = put(s, "p1", testCard, maxCores(testCard))
    else if (testCard.type === "nexus") selfInst = putNexus(s, "p1", testCard, maxCores(testCard))
    refreshLevelAsOverrides(s)
    return { s, selfInst }
}

// バトルを成立させる（バトル関連の誘発・継続効果のため）
function setBattle(s: GameState, attacker: string, blocker: string | null): void {
    s.battle = { attackerInstanceId: attacker, blockerInstanceId: blocker, flashLockedPlayer: null, directed: false }
}

// 継続効果は「読まれた時点」で計測されるので、盤面を一通り読む
function readContinuousEffects(s: GameState): void {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of s.players[pid].field.spirits) {
            effectiveBp(s, pid, inst)
            activeConstraints(s, pid, inst)
            noLifeDamageByCost(s, inst)
            for (const kw of Object.keys(KEYWORDS)) spiritHasKeyword(s, pid, inst, kw as never)
            for (const col of ["red", "purple", "green", "white", "yellow", "blue"] as const) instHasColor(inst, col)
        }
        effectSources(s, pid)
        for (const cardId of s.players[pid].hand) effectiveCost(s, pid, getCard(cardId))
    }
    // ブロック可否（constraint 系の読み出し）
    const a = s.players.p1.field.spirits[0]
    for (const b of s.players.p2.field.spirits) {
        if (a) canBlock(s, "p2", b, "p1", a)
    }
}

// 誘発イベントごとの前準備（バトル関連はバトルを成立させ、対象を渡す）
const BATTLE_EVENTS: TriggerEvent[] = [
    "onBlock",
    "onBlocked",
    "onBattleWin",
    "onBattleLose",
    "onBattleStart",
    "onBattleEnd",
]

let fired = 0
let crashed = 0
const crashes: string[] = []

console.log("=== 全効果エントリの火入れ（例外なし・選択待ちが残らない・保存則を維持） ===")
for (const card of CARDS) {
    const effects = (card.effects ?? []) as EffectDef[]
    if (effects.length === 0) continue
    try {
        const { s, selfInst } = buildBoard(card)
        const before = totalCards(s)
        // (1) マジックは両タイミングで使用する
        if (card.type === "magic") {
            for (const timing of ["main", "flash"] as const) {
                const target = s.players.p2.field.spirits[0]
                setBattle(s, s.players.p1.field.spirits[0]!.instanceId, target?.instanceId ?? null)
                resolveMagic(s, "p1", card.cardId, timing, target?.instanceId)
                if (!drain(s)) throw new Error(`選択待ちが解消しない（${timing}）`)
            }
        }
        if (selfInst) {
            // (2) 誘発効果：カードが持つトリガーをすべて撃つ
            const triggers = new Set<TriggerEvent>()
            for (const e of effects) if (e.kind === "triggered") triggers.add(e.trigger)
            // **自分のターン／相手のターンの両方**で撃つ。『相手のターン』条件の効果は
            // turnPlayer を固定したままだと一度も発火しない（BS09-021 武士インパラー等）
            for (const ev of triggers) {
                for (const tp of ["p1", "p2"] as PlayerId[]) {
                    s.turnPlayer = tp
                    const opp = s.players.p2.field.spirits[0]
                    if (BATTLE_EVENTS.includes(ev)) {
                        setBattle(s, selfInst.instanceId, opp?.instanceId ?? null)
                    }
                    fireTrigger(s, "p1", selfInst, ev, "attacker", opp?.instanceId)
                    if (!drain(s)) throw new Error(`選択待ちが解消しない（${ev}／turn:${tp}）`)
                    fired++
                }
                s.turnPlayer = "p1"
            }
            // (3) バトル勝利誘発（battleWon は勝者を渡す別経路）
            if (effects.some((e) => e.kind === "battleWon")) {
                for (const role of ["attacker", "blocker"] as const) {
                    fireBattleWonTriggers(s, "p1", s.players.p1.field.spirits[0]!, role)
                    if (!drain(s)) throw new Error("選択待ちが解消しない（battleWon）")
                    fired++
                }
            }
            // (4) フィールド誘発：カードが持つイベントをすべて撃つ
            const events = new Set<string>()
            for (const e of effects) if (e.kind === "fieldEvent") events.add(e.event)
            for (const ev of events) {
                for (const tp of ["p1", "p2"] as PlayerId[]) {
                    s.turnPlayer = tp
                    const subject = s.players.p1.field.spirits[0]!
                    fireFieldEventTriggers(s, "p1", ev as never, { pid: "p1", inst: subject }, undefined, s.players.p2.field.spirits[0]?.instanceId)
                    if (!drain(s)) throw new Error(`選択待ちが解消しない（${ev}／turn:${tp}）`)
                    fired++
                }
                s.turnPlayer = "p1"
            }
        }
        // (5) ステップ誘発：カードが持つステップを、自分ターン／相手ターンの両方で撃つ
        const steps = new Set<Phase>()
        for (const e of effects) if (e.kind === "step") steps.add(e.step)
        for (const st of steps.size > 0 ? [...steps] : []) {
            for (const tp of ["p1", "p2"] as PlayerId[]) {
                s.turnPlayer = tp
                s.phase = st
                fireStepTriggers(s, st)
                if (!drain(s)) throw new Error(`選択待ちが解消しない（step:${st}）`)
                fired++
            }
        }
        // (6) 継続効果は「読まれた時点」で計測されるので、各ステップで読み直す
        for (const ph of PHASES) {
            for (const tp of ["p1", "p2"] as PlayerId[]) {
                s.turnPlayer = tp
                s.phase = ph
                refreshLevelAsOverrides(s)
                readContinuousEffects(s)
            }
        }
        const after = totalCards(s)
        if (after !== before) {
            throw new Error(`カードの総数が変わった（${before} → ${after}）`)
        }
    } catch (e) {
        crashed++
        if (crashes.length < 25) crashes.push(`${card.cardId} ${card.name}: ${(e as Error).message}`)
    }
}
for (const c of crashes) assert(false, `火入れで失敗: ${c}`)
assert(crashed === 0, `全カードの火入れが通る（発火${fired}回／失敗${crashed}件）`)
