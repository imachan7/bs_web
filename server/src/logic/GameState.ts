// GameState / PlayerState の状態生成・更新の土台
import type {
    CardData,
    CardInstance,
    Color,
    DeckSpec,
    GameState,
    GameView,
    PendingChoice,
    PlayerId,
    PlayerState,
    PlayerView,
    ResumeFrame,
} from "../type"
import {
    DECK_RECIPES,
    DECK_MIN_SIZE,
    INITIAL_HAND,
    INITIAL_LIFE,
    INITIAL_RESERVE,
} from "../../../data/constants"
import { loadAllCards } from "../../../data/loadCards"
// 注意（循環importについて）: EffectModules.ts は本ファイルの関数を多数importしているため、
// ここで EffectModules.ts から import すると相互参照になる。ただし双方とも関数宣言のみで
// トップレベルで呼び出し合うことはなく（呼び出しは対戦処理中＝両モジュールの読み込み完了後）、
// CommonJS の循環require（関数宣言はホイストされ、モジュール読み込み完了時点で exports に
// 反映されている）で安全に動作する。fireFieldEventTriggers（相手ドロー時の誘発）を draw() から
// 呼ぶために必要
import { emitEvent, fireFieldEventTriggers, notifyHandGained, refreshLevelAsOverrides } from "./EffectModules"
import { setCardLookup } from "../../../shared/cardDb"
// 共有ルール層（shared/）へ移設。currentLevel / countSymbols は本ファイル経由で多数 import されているため
// 再エクスポートで名前を残す
import { countSymbols, currentLevel, hasGlobalConstraint } from "../../../shared/rules"
export { countSymbols, currentLevel }

// ---- カードマスターデータの読み込み ----

// 弾ごとに分割された data/cards/BS0N.json をまとめて読む（data/loadCards.ts 参照）
export const ALL_CARDS: CardData[] = loadAllCards()

export const CARD_DB: Map<string, CardData> = new Map(
    ALL_CARDS.map((c) => [c.cardId, c]),
)

export function getCard(cardId: string): CardData {
    const card = CARD_DB.get(cardId)
    if (!card) throw new Error(`カードが見つかりません: ${cardId}`)
    return card
}

// 共有ルール層（shared/）へカードマスタ参照を注入する。
// shared/ は node:fs を使えないため、サーバー側の getCard をここで渡す
setCardLookup(getCard)

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
// 検証項目: cardId の実在 / 枚数が正の整数 / 合計40枚ちょうど /
// 同名（カード名で合算）min(3, limitCount)枚まで（制限カードはlimitCountで3枚未満に絞る） / 禁止カード不可
export function validateDeckCards(cards: Record<string, number>): string | null {
    let total = 0
    const byName = new Map<string, number>()
    const nameLimit = new Map<string, number>()
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
        const limit =
            card.limitCount !== undefined ? Math.min(MAX_COPIES, card.limitCount) : MAX_COPIES
        nameLimit.set(card.name, Math.min(nameLimit.get(card.name) ?? MAX_COPIES, limit))
    }
    for (const [name, count] of byName) {
        const limit = nameLimit.get(name) ?? MAX_COPIES
        if (count > limit) {
            return `同名カードは${limit}枚までです: ${name}（${count}枚）`
        }
    }
    // デッキは**40枚以上**（ちょうど40枚ではない。2026-08-16 ユーザー指摘）。
    // 上限は設けない：構築済みデッキにも42枚のものがある（SD04 ジーク進化レボリューション）
    if (total < DECK_MIN_SIZE) {
        return `デッキは${DECK_MIN_SIZE}枚以上必要です（現在${total}枚）`
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
        tegamoto: [],
        tegamotoPlayable: [],
        field: { spirits: [], nexuses: [] },
        turnVirtualInstances: [],
        battleVirtualInstances: [],
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
        triggerSuppressionThisTurn: [],
        attacksThisTurn: 0,
        ignoreUnblockableThisTurn: [],
        blockTriggersAsAttackThisTurn: false,
        lastDestroyedNexus: null,
        lastBattleDestroyedCores: 0,
        lastBattleDestroyedLevel: 0,
        lastBattleDestroyedColors: [],
        lastBattleDestroyedFamilies: [],
        lastBattleDestroyedBp: 0,
        lastBattleDestroyedCost: 0,
        bofuExhaustedThisBattle: [],
        pendingChoice: null,
        resumeStack: [],
        resumeInsertAt: 0,
        drawStepSkipped: false,
        interactiveTargets: false,
        events: [],
        eventSeq: 0,
        magicUsedThisTurn: { p1: 0, p2: 0 },
        millCountThisTurn: { p1: 0, p2: 0 },
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

// ── 中断と再開（docs/design/RESUME_STACK.md）──────────────────────────────
// 中断を開始する。**pendingChoice を立てる箇所はすべてここを通す**。
// ここが唯一の入口であることで、再開スタックの挿入境界（resumeInsertAt）のリセットを
// 1箇所に集約できる（各所で書き忘れると解決順が壊れる）
export function suspend(state: GameState, choice: PendingChoice): void {
    state.pendingChoice = choice
    // 新しい中断の始まり。ここから積まれるフレームは、既にスタックにある古いフレームより前に入る
    state.resumeInsertAt = 0
    if (DEBUG_CHECKS) suspendFingerprint = boardFingerprint(state)
}

// ── 中断中の盤面変更ガード（検査用。RESUME_STACK.md §5）──────────────────
// 「中断したのに処理を続けた」書き忘れを、静かな二重適用ではなく**赤にする**ための検査。
// 中断した時点の盤面を覚えておき、handleAction を抜ける時点でまだ中断中なら、
// その間に盤面が変わっていないことを確かめる（中断後は何も起きないのが契約）。
//
// 環境変数 BS_DEBUG_CHECKS=1 のときだけ働く（本番の対戦では計算しない）
const DEBUG_CHECKS = process.env.BS_DEBUG_CHECKS === "1"
let suspendFingerprint: string | null = null
let mutationAfterSuspend: string[] = []

// 盤面の要約。ゾーンの枚数とコア数だけを見る（並び順・インスタンスの中身までは追わない）
function boardFingerprint(state: GameState): string {
    const parts: string[] = []
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = state.players[pid]
        parts.push(
            `${p.deck.length},${p.hand.length},${p.trashCards.length},${p.tegamoto.length}`,
            `${p.field.spirits.length},${p.field.nexuses.length}`,
            `${p.life},${p.reserve},${p.trashCores}`,
            [...p.field.spirits, ...p.field.nexuses].map((i) => `${i.instanceId}:${i.cores}`).join("|"),
        )
    }
    parts.push(String(state.revealedCards?.cardIds.length ?? 0))
    return parts.join("/")
}

// handleAction の**入口**から呼ぶ。すでに中断中なら、そこを新しい基準にし直す。
// これで「handleAction を経由しない変更」（smoke が resolveAction を直接呼ぶ書き方）が
// 対象外になる。実対戦では選択待ち中に resolveChoice 以外は拒否されるので、
// エンジンの責任範囲は「1回の handleAction の中で中断後に動かないこと」に限られる
export function noteHandleActionEntry(state: GameState): void {
    if (!DEBUG_CHECKS) return
    suspendFingerprint = state.pendingChoice ? boardFingerprint(state) : null
}

// handleAction の出口から呼ぶ。中断中に盤面が変わっていたら記録する
export function checkNoMutationAfterSuspend(state: GameState): void {
    if (!DEBUG_CHECKS) return
    if (state.pendingChoice && suspendFingerprint !== null) {
        const now = boardFingerprint(state)
        if (now !== suspendFingerprint) {
            mutationAfterSuspend.push(`中断後に盤面が変化した（${suspendFingerprint} → ${now}）`)
        }
    }
    if (!state.pendingChoice) suspendFingerprint = null
}

// 検査結果の取り出し（smoke のハーネスが集計に使う）
export function takeMutationAfterSuspend(): string[] {
    const found = mutationAfterSuspend
    mutationAfterSuspend = []
    return found
}

// 中断した残りの処理を再開スタックへ積む。
// **push でも unshift でもなく「今回の中断で積まれた領域の末尾」へ入れる**。
// 1回の中断では内側の層から外側の層へ順に積まれ、正しい実行順は
// 「内側 → 外側 → それ以前の中断の古いフレーム」であるため。RESUME_STACK.md §3
export function pushResumeFrames(state: GameState, frames: ResumeFrame[]): void {
    for (const frame of frames) {
        state.resumeStack.splice(state.resumeInsertAt++, 0, frame)
    }
}

// 複数の効果／アクションを**順に解決する**共通形（docs/design/RESUME_STACK.md §9）。
//
// ⚠️ 自分でループを書かないこと。「ループの中で解決し、選択待ちが立ったら return する」形は、
// **同じイベントの残りが永久に失われる**（2026-08-17 に実バグ4件。灼熱の谷を2枚並べると
// 破棄が1枚しか起きない、ヴィクトリーファイアでネクサスが壊れない等）。
// このヘルパーは `frame` を**必須**にしてあるので、残りの積み忘れが起きない。
//
// - `skip`：解決の直前に呼ぶ。先に解決した効果で発生源が場を離れていたら飛ばす用
// - `resolve`：1件を解決する（選択待ちを立ててもよい）
// - `frame`：中断したときに**残りの各件**を再開スタックへ積むためのフレーム
export function resolveInOrder<T>(
    state: GameState,
    items: T[],
    handlers: {
        skip?: (item: T) => boolean
        resolve: (item: T) => void
        frame: (item: T) => ResumeFrame
    },
): void {
    for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item === undefined) continue
        if (handlers.skip?.(item) === true) continue
        handlers.resolve(item)
        if (state.winner) return
        if (state.pendingChoice) {
            pushResumeFrames(state, items.slice(i + 1).map(handlers.frame))
            return
        }
    }
}

// バトル状態を終了させる（GameEngine の通常解決・endBattle アクションの双方から使う共有ヘルパー）
export function clearBattle(state: GameState): void {
    // 「ターンに1回だけブロックされない」印は、そのアタックの解決（＝このバトルの終了）で使い切る
    // （強者統べる大地Lv2）。ブロックされずライフに通った場合もここを通る
    const attackerId = state.battle?.attackerInstanceId
    if (attackerId !== undefined) {
        for (const pid of ["p1", "p2"] as PlayerId[]) {
            for (const inst of state.players[pid].field.spirits) {
                if (inst.instanceId === attackerId) inst.unblockableOnceThisTurn = false
            }
        }
    }
    state.battle = null
    // 「このバトルの間ブロックできない」の印もここで切れる（BS09-042妖精騎士ピーター）
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of state.players[pid].field.spirits) delete inst.cantBlockThisBattle
    }
    // 「このバトルの間」の貸与（lendSelfThisBattle）はここで切れる。同じターンの2回目のバトルには持ち越さない
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const lent = state.players[pid].battleVirtualInstances
        if (lent.length > 0) {
            for (const inst of lent) log(state, `${getCard(inst.cardId).name}の「このバトルの間」の効果が切れた。`)
            state.players[pid].battleVirtualInstances = []
        }
        // 「このバトルの間」のBP増減（bpBuff の scope:"battle"）も同じ寿命（BS07ニードルショット）
        for (const inst of state.players[pid].field.spirits) {
            if (inst.battleBpBuff) inst.battleBpBuff = 0
        }
    }
    // 【暴風】で疲労させた相手の記録はバトル単位（BS06颶風高原Lv2）。次のバトルへ持ち越さない
    state.bofuExhaustedThisBattle = []
    state.isFlashTiming = false
    state.flashCount = 0
    state.priorityPlayer = state.turnPlayer
    // マジックミラーが参照する「直前に使用したマジック」はバトルごとにリセットする
    // （「このフラッシュタイミングで」の限定を、バトル単位で近似する簡略化。BS08マジックミラー）
    delete state.lastMagicCast
}

// デッキからドローする。引けない場合は相手の勝利（デッキアウト）
// fromDrawStep: PhaseManagerのドローステップからの呼び出しだけtrueを渡す。
// globalConstraint "noDrawOutsideDrawStep"（BS08豚人チョウハッカイ）は、この引数がfalseの
// すべてのドロー（効果によるドロー）をここで一律に無効化する（draw/drawPer等の共通経路）
export function draw(state: GameState, pid: PlayerId, count: number, fromDrawStep?: boolean): void {
    if (!fromDrawStep && hasGlobalConstraint(state, "noDrawOutsideDrawStep")) {
        log(state, `${state.players[pid].name}は、ドローステップ以外でドローできないため、ドローしなかった。`)
        return
    }
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
    emitEvent(state, { type: "draw", pid, count })
    // フィールドイベント誘発「相手がドローしたとき」：ドローしたpidの相手側（opponentOf(pid)）の
    // フィールドから発火する（シダフクロウ＝「相手がドローするとき、このスピリットは回復する」）。
    // 注意（無限ループ）: ここで発火するactionがdrawを含むカードがあると、
    // draw→誘発→draw→…と再帰する恐れがある。現対象カード（シダフクロウ）はrefreshSelfのみのため
    // 安全。将来opponentDrewにdrawを組み合わせる場合は無限再帰が起きないか設計時に確認すること。
    // 対戦開始時の初期手札はdeck.spliceで直接配られdraw()を経由しないため、
    // フィールド未初期化での呼び出しは発生しない（createPlayerがfield.spirits/nexusesを
    // 同期的に初期化済みでもあり、fireFieldEventTriggersはフィールドが空でも安全に何もしない）。
    // eventCount=count：repeatPerCount指定のエントリが「ドローしたカード1枚につき」を表現できるようにする
    // （BS08マンゴース：相手がドローしたカード1枚につき系統「剣獣」を1体回復）
    fireFieldEventTriggers(state, opponentOf(pid), "opponentDrew", undefined, undefined, undefined, count)
    // フィールドイベント誘発「相手の手札にカードが加えられたとき」（犬人マードック／英雄の喪失）
    notifyHandGained(state, pid, count)
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


// 維持コア数。実体は共有層（shared/rules.ts）にある——クライアント側の召喚可否判定
// （canBattleSwapSummon）が同じ値を必要とするため。ここからの re-export は、
// サーバー側の既存 import（GameEngine / RuleValidator / battleFlow）をそのまま使い続けるためのもの
export { instMinLevelCores, minLevelCores } from "../../../shared/rules"

// 召喚／配置でそのレベルにするために置くコア数。存在しないレベルを指定された場合は null を返す
// （呼び出し側＝RuleValidator が「そのカードに無いレベル」として弾く）
export function coresForLevel(card: CardData, level: number): number | null {
    const def = card.levels.find((l) => l.level === level)
    return def ? def.cores : null
}

// 軽減計算用：自分のフィールドにある指定色シンボルの数を数える。
// tempExtraSymbols（ダブルハート）は「持っているシンボルと同じ色を1つ追加」の簡略化として、
// そのインスタンスが元々colors該当のシンボルを持つ場合にのみ加算する

export function findSpirit(
    player: PlayerState,
    instanceId: string,
): CardInstance | undefined {
    return player.field.spirits.find((s) => s.instanceId === instanceId)
}

export function findNexus(
    player: PlayerState,
    instanceId: string,
): CardInstance | undefined {
    return player.field.nexuses.find((n) => n.instanceId === instanceId)
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
        tegamoto: [...player.tegamoto],
        field: {
            spirits: player.field.spirits.map((s) => ({ ...s })),
            nexuses: player.field.nexuses.map((n) => ({ ...n })),
        },
        turnVirtualInstances: player.turnVirtualInstances.map((s) => ({ ...s })),
        battleVirtualInstances: player.battleVirtualInstances.map((s) => ({ ...s })),
        ...(isSelf && player.tempHandKeywordGrants
            ? { tempHandKeywordGrants: [...player.tempHandKeywordGrants] }
            : {}),
        // 「手札を破棄して効果を受けない」の方針は自分にだけ返す（UIのトグルの現在値）
        ...(isSelf && player.payToNegate !== undefined ? { payToNegate: player.payToNegate } : {}),
        // 「相手の手札の内容を見た」記録は持ち主にだけ返す（BS09-039探偵ペンタン）
        ...(isSelf && player.peekedOpponentCardIds !== undefined
            ? { peekedOpponentCardIds: player.peekedOpponentCardIds }
            : {}),
    }
}

// 相手視点でのpendingChoiceマスク：candidatesは常に空に、kind:"card"のときはcardIndicesも
// 空にし、表示用promptを種別に応じた汎用メッセージに差し替える（内容が漏れないようにする）
function maskPendingChoiceForOpponent(pc: NonNullable<GameState["pendingChoice"]>): NonNullable<GameState["pendingChoice"]> {
    const isCard = pc.kind === "card"
    return {
        ...pc,
        candidates: [],
        ...(isCard ? { cardIndices: [] } : {}),
        prompt: isCard ? "相手がカードを選択中…" : "相手が対象を選択中…",
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
        magicUsedThisTurn: { ...state.magicUsedThisTurn },
        ignoreUnblockableThisTurn: [...state.ignoreUnblockableThisTurn],
        pendingChoice: state.pendingChoice
            ? viewer === state.pendingChoice.pid
                ? { ...state.pendingChoice }
                : maskPendingChoiceForOpponent(state.pendingChoice)
            : null,
        events: [...state.events],
        // 公開ゾーンは「オープンする」効果で両者に見える情報のためマスクしない
        ...(state.revealedCards ? { revealedCards: { ...state.revealedCards, cardIds: [...state.revealedCards.cardIds] } } : {}),
    }
}
