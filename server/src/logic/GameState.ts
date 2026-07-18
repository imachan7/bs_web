// GameState / PlayerState の状態生成・更新の土台
import * as fs from "node:fs"
import * as path from "node:path"
import type {
    CardData,
    CardInstance,
    Color,
    DeckSpec,
    GameState,
    GameView,
    PlayerId,
    PlayerState,
    PlayerView,
} from "../type"
import {
    DECK_RECIPES,
    DECK_SIZE,
    INITIAL_HAND,
    INITIAL_LIFE,
    INITIAL_RESERVE,
} from "../../../data/constants"
// 注意（循環importについて）: EffectModules.ts は本ファイルの関数を多数importしているため、
// ここで EffectModules.ts から import すると相互参照になる。ただし双方とも関数宣言のみで
// トップレベルで呼び出し合うことはなく（呼び出しは対戦処理中＝両モジュールの読み込み完了後）、
// CommonJS の循環require（関数宣言はホイストされ、モジュール読み込み完了時点で exports に
// 反映されている）で安全に動作する。fireFieldEventTriggers（相手ドロー時の誘発）を draw() から
// 呼ぶために必要
import { fireFieldEventTriggers, refreshLevelAsOverrides } from "./EffectModules"

// ---- カードマスターデータの読み込み ----

const CARDS_PATH = path.resolve(__dirname, "../../../data/cards.json")

export const CARD_DB: Map<string, CardData> = new Map(
    (JSON.parse(fs.readFileSync(CARDS_PATH, "utf-8")) as CardData[]).map(
        (c) => [c.cardId, c],
    ),
)

export function getCard(cardId: string): CardData {
    const card = CARD_DB.get(cardId)
    if (!card) throw new Error(`カードが見つかりません: ${cardId}`)
    return card
}

// ---- ユーティリティ ----

let instanceSeq = 0

export function createInstance(
    cardId: string,
    turn: number,
    cores: number,
): CardInstance {
    instanceSeq += 1
    return {
        instanceId: `inst-${String(instanceSeq).padStart(6, "0")}`,
        cardId,
        cores,
        isRested: false,
        summonedTurn: turn,
        tempBpBuff: 0,
        cantAttackThisTurn: false,
        immuneToOpponentThisTurn: false,
        blockConstraintNegatedThisTurn: false,
        tempKeywords: [],
        tempAlsoCosts: [],
        tempColors: [],
        tempFamilies: [],
    }
}

function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const a = array[i] as T
        array[i] = array[j] as T
        array[j] = a
    }
    return array
}

// ---- デッキ検証・構築 ----

// 同名カードの上限枚数（デッキビルダーと共通の制約）
const MAX_COPIES = 3

// カスタムデッキの内容を検証する。問題があれば日本語のエラーメッセージ、なければ null を返す
// 検証項目: cardId の実在 / 枚数が正の整数 / 合計40枚ちょうど / 同名（カード名で合算）3枚まで / 禁止カード不可
export function validateDeckCards(cards: Record<string, number>): string | null {
    let total = 0
    const byName = new Map<string, number>()
    for (const [cardId, count] of Object.entries(cards)) {
        const card = CARD_DB.get(cardId)
        if (!card) return `存在しないカードIDが含まれています: ${cardId}`
        if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
            return `枚数が不正です: ${cardId} → ${String(count)}`
        }
        if (card.limited) {
            return `禁止カードは入れられません: ${card.name}（${cardId}）`
        }
        total += count
        byName.set(card.name, (byName.get(card.name) ?? 0) + count)
    }
    for (const [name, count] of byName) {
        if (count > MAX_COPIES) {
            return `同名カードは${MAX_COPIES}枚までです: ${name}（${count}枚）`
        }
    }
    if (total !== DECK_SIZE) {
        return `デッキはちょうど${DECK_SIZE}枚必要です（現在${total}枚）`
    }
    return null
}

// 色キー（DECK_RECIPES）またはカスタムカードリストからデッキ（cardId の配列）を構築する
export function buildDeck(spec: DeckSpec): string[] {
    let cards: Record<string, number>
    if (typeof spec === "string") {
        const recipe = DECK_RECIPES[spec]
        if (!recipe) throw new Error(`デッキレシピが見つかりません: ${spec}`)
        cards = recipe.cards
    } else {
        cards = spec
    }
    const deck: string[] = []
    for (const [cardId, count] of Object.entries(cards)) {
        getCard(cardId) // 存在チェック
        for (let i = 0; i < count; i++) deck.push(cardId)
    }
    return shuffle(deck)
}

// ---- ゲーム状態の生成 ----

function createPlayer(id: PlayerId, name: string, deckSpec: DeckSpec): PlayerState {
    const deck = buildDeck(deckSpec)
    const hand = deck.splice(0, INITIAL_HAND)
    return {
        id,
        name,
        life: INITIAL_LIFE,
        reserve: INITIAL_RESERVE,
        trashCores: 0,
        deck,
        hand,
        trashCards: [],
        field: { spirits: [], nexuses: [] },
    }
}

export function createGame(
    gameId: string,
    names: Record<PlayerId, string>,
    decks: Record<PlayerId, DeckSpec>,
): GameState {
    const state: GameState = {
        gameId,
        turn: 1,
        turnPlayer: "p1",
        phase: "start",
        priorityPlayer: "p1",
        isFlashTiming: false,
        flashCount: 0,
        battle: null,
        players: {
            p1: createPlayer("p1", names.p1, decks.p1),
            p2: createPlayer("p2", names.p2, decks.p2),
        },
        log: [],
        winner: null,
        endAttackStepAfterBattle: false,
        turnConstraints: [],
        lastBattleDestroyedCores: 0,
        pendingChoice: null,
        interactiveTargets: false,
    }
    // 生成直後のフィールド（初期状態では通常空だが将来拡張に備えて）にもレベル置換を反映しておく
    refreshLevelAsOverrides(state)
    return state
}

// ---- 状態更新のヘルパー ----

export function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

export function log(state: GameState, message: string): void {
    state.log.push(message)
}

// バトル状態を終了させる（GameEngine の通常解決・endBattle アクションの双方から使う共有ヘルパー）
export function clearBattle(state: GameState): void {
    state.battle = null
    state.isFlashTiming = false
    state.flashCount = 0
    state.priorityPlayer = state.turnPlayer
}

// デッキからドローする。引けない場合は相手の勝利（デッキアウト）
export function draw(state: GameState, pid: PlayerId, count: number): void {
    const player = state.players[pid]
    for (let i = 0; i < count; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) {
            state.winner = opponentOf(pid)
            log(state, `${player.name}はデッキからカードを引けない！ デッキアウトで敗北。`)
            return
        }
        player.hand.push(cardId)
    }
    log(state, `${player.name}は${count}枚ドローした。`)
    // フィールドイベント誘発「相手がドローしたとき」：ドローしたpidの相手側（opponentOf(pid)）の
    // フィールドから発火する（シダフクロウ＝「相手がドローするとき、このスピリットは回復する」）。
    // 注意（無限ループ）: ここで発火するactionがdrawを含むカードがあると、
    // draw→誘発→draw→…と再帰する恐れがある。現対象カード（シダフクロウ）はrefreshSelfのみのため
    // 安全。将来opponentDrewにdrawを組み合わせる場合は無限再帰が起きないか設計時に確認すること。
    // 対戦開始時の初期手札はdeck.spliceで直接配られdraw()を経由しないため、
    // フィールド未初期化での呼び出しは発生しない（createPlayerがfield.spirits/nexusesを
    // 同期的に初期化済みでもあり、fireFieldEventTriggersはフィールドが空でも安全に何もしない）。
    fireFieldEventTriggers(state, opponentOf(pid), "opponentDrew")
}

// コア数のみによる素のレベル判定（levelAsContinuous / levelOverrideThisTurn による上書きは無視する）。
// レベル置換効果（kind: "levelAs"）が自分自身の発動条件（sourceMinLevel）を判定する際など、
// currentLevel の再帰・自己参照を避けたい箇所で使う
export function rawLevel(inst: CardInstance): number {
    const master = getCard(inst.cardId)
    let level = 0
    for (const lv of master.levels) {
        if (inst.cores >= lv.cores && lv.level > level) level = lv.level
    }
    return level
}

// 現在のコア数からレベルとBPを求める（レベル未満なら level: 0）。
// levelOverrideThisTurn（このターンの上書き。皇帝アンプルール）または levelAsContinuous
// （継続的な「Lv◯として扱う」。ジャグリーン／トパーズの流星）が設定されていれば、
// 優先順位 levelOverrideThisTurn > levelAsContinuous でそのレベルのLevelDefを返す
// （該当レベルがカードに無ければ通常計算にフォールバック）
export function currentLevel(inst: CardInstance): { level: number; bp: number } {
    const master = getCard(inst.cardId)
    const override = inst.levelOverrideThisTurn ?? inst.levelAsContinuous
    if (override !== undefined) {
        const lv = master.levels.find((l) => l.level === override)
        if (lv) {
            return { level: lv.level, bp: lv.bp + (lv.level > 0 ? inst.tempBpBuff : 0) }
        }
    }
    // coresOverride（クロスシザースのネクサスコア数リンク）があれば、レベル判定はそちらを使う
    const coreCount = inst.coresOverride ?? inst.cores
    let result = { level: 0, bp: 0 }
    for (const lv of master.levels) {
        if (coreCount >= lv.cores && lv.level > result.level) {
            result = { level: lv.level, bp: lv.bp }
        }
    }
    return { level: result.level, bp: result.bp + (result.level > 0 ? inst.tempBpBuff : 0) }
}

// レベル1の維持コア数
export function lv1Cores(card: CardData): number {
    const lv1 = card.levels.find((l) => l.level === 1)
    return lv1 ? lv1.cores : 0
}

// 軽減計算用：自分のフィールドにある指定色シンボルの数を数える
export function countSymbols(player: PlayerState, colors: Color[]): number {
    let count = 0
    const all = [...player.field.spirits, ...player.field.nexuses]
    for (const inst of all) {
        for (const sym of getCard(inst.cardId).symbol) {
            if (colors.includes(sym)) count++
        }
    }
    return count
}

export function findSpirit(
    player: PlayerState,
    instanceId: string,
): CardInstance | undefined {
    return player.field.spirits.find((s) => s.instanceId === instanceId)
}

// 両プレイヤーのスピリット（ネクサスは含まない）から instanceId を検索する。
// pendingChoice.selfInstanceId の解決用（self は常にスピリットのため）
export function findInstanceAnywhere(
    state: GameState,
    instanceId: string,
): CardInstance | undefined {
    return (
        findSpirit(state.players.p1, instanceId) ??
        findSpirit(state.players.p2, instanceId)
    )
}

// ---- クライアントへ送る公開ビュー ----

function playerView(player: PlayerState, isSelf: boolean): PlayerView {
    return {
        id: player.id,
        name: player.name,
        life: player.life,
        reserve: player.reserve,
        trashCores: player.trashCores,
        deckCount: player.deck.length,
        hand: isSelf ? [...player.hand] : null,
        handCount: player.hand.length,
        trashCards: [...player.trashCards],
        field: {
            spirits: player.field.spirits.map((s) => ({ ...s })),
            nexuses: player.field.nexuses.map((n) => ({ ...n })),
        },
    }
}

export function viewFor(state: GameState, viewer: PlayerId): GameView {
    return {
        gameId: state.gameId,
        turn: state.turn,
        turnPlayer: state.turnPlayer,
        phase: state.phase,
        priorityPlayer: state.priorityPlayer,
        isFlashTiming: state.isFlashTiming,
        battle: state.battle ? { ...state.battle } : null,
        players: {
            p1: playerView(state.players.p1, viewer === "p1"),
            p2: playerView(state.players.p2, viewer === "p2"),
        },
        log: state.log.slice(-60),
        winner: state.winner,
        you: viewer,
        turnConstraints: [...state.turnConstraints],
        pendingChoice: state.pendingChoice
            ? viewer === state.pendingChoice.pid
                ? { ...state.pendingChoice }
                : { ...state.pendingChoice, candidates: [], prompt: "相手が対象を選択中…" }
            : null,
    }
}
