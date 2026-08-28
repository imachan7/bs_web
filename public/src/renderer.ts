// 受け取った状態をDOMへ反映する描画処理
import type {
    AuraCondition,
    AuraCounter,
    AuraDef,
    CardData,
    CardInstance,
    Color,
    ConstraintDef,
    FamilyFilter,
    GameEvent,
    GameView,
    GlobalConstraintDef,
    Keyword,
    PlayerId,
} from "../../server/src/type"
import { CARD_TYPE_LABELS, COLOR_LABELS, PHASE_LABELS } from "../../data/constants"
import { setCardLookup } from "../../shared/cardDb"
import { canPayNexusCostByMill, canPaySummonCostByHandDiscard, effectiveCost, hasMagicRestriction, ownFieldSymbolColors } from "../../shared/cost"
import { canBlock, matchesDirectedAttackFilter as sharedMatchesDirectedAttackFilter } from "../../shared/block"
// ルール判定はサーバーと同一の実装を共有する（二重実装によるズレを防ぐ）
import {
    activeConstraints,
    cantActByCost,
    currentLevel,
    instCostCantAct,
    effectiveBp,
    hasArmorAgainst,
    hasGlobalConstraint,
    hasHandKeywordGrant,
    hasKeyword,
    hasMagicImmunity,
    isUntargetableByOpponent,
    activatableAbility as sharedActivatableAbility,
    canAwaken as sharedCanAwaken,
    sokuPayableInstanceIds,
    OPPONENT_RESERVE_TARGET,
    canAwakenFromReserve,
    directAttackFilter,
    instHasColor,
    instHasCost,
    isVanillaCard,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
    effectActiveAtLevel,
    handSizeOf,
    type DirectAttackFilter,
    boardResistanceAgainst,
    isEndStepLocked,
    bravesOf,
} from "../../shared/rules"
export { activeConstraints, cantActByCost, hasArmorAgainst, hasGlobalConstraint, hasKeyword, instHasCost, instHasColor, isUntargetableByOpponent }

// ---- カードマスターデータ（起動時に /api/cards から取得。実体は data/cards/BS0N.json） ----

// エンドステップを数える封印（ルナティックシール）の表示ラベル
const LOCK_LABELS: Record<string, string> = {
    attackStep: "アタックステップ不可",
    deckMill: "デッキ破棄されない",
    lifeChargeFromVoidOrReserve: "ボイド/リザーブからライフにコアを置けない",
}

let DB = new Map<string, CardData>()

let cardNameRegex: RegExp | null = null
const cardNameMap = new Map<string, CardData>()

export function setCardDb(cards: CardData[]): void {
    DB = new Map(cards.map((c) => [c.cardId, c]))
    // 共有ルール層（shared/）へカードマスタ参照を注入する（サーバーは GameState.getCard を注入）
    setCardLookup(master)

    const uniqueNames = Array.from(new Set(cards.map((c) => c.name))).sort((a, b) => b.length - a.length)
    const escapedNames = uniqueNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    cardNameRegex = new RegExp(`(${escapedNames.join('|')})`, 'g')
    
    for (const card of cards) {
        if (!cardNameMap.has(card.name)) {
            cardNameMap.set(card.name, card)
        }
    }
}

export function master(cardId: string): CardData {
    const card = DB.get(cardId)
    if (!card) throw new Error(`カードが見つかりません: ${cardId}`)
    return card
}

const COLOR_SYMBOLS: Record<string, string> = {
    red: "🔥",
    purple: "💀",
    green: "🌿",
    white: "◇",
    yellow: "⭐",
    blue: "💧"
}

// ---- ルール計算は shared/ の共有実装を使う（従来はここにサーバーのミラーを持っていた） ----

// main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.currentLevel）
export const levelOf = currentLevel

// オーラ計算・実効BPはサーバーと同一の共有実装（shared/rules）を使う。
// main.ts など既存の呼び出しを壊さないため effectiveBp の名前はここから再エクスポートする
export { effectiveBp }



// main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.spiritHasKeyword）
export const spiritHasKeywordView = spiritHasKeyword

// main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.instHasColor）
export const instHasColorView = instHasColor

// main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.spiritHasFamily）
export const spiritHasFamilyView = spiritHasFamily

// 実体は shared/rules.matchesFamilyFilter（配列＝OR判定）
const matchesFamilyFilterView = matchesFamilyFilter






// ブロック可能ハイライト用: blocker が attacker をブロックできるか。
// 判定はサーバー validateBlock と同一の共有実装（優先権・疲労・レベル等の前提条件は呼び出し側でチェック済み）
export function canBlockAttacker(
    view: GameView,
    blockerPid: PlayerId,
    blockerInst: CardInstance,
    attackerPid: PlayerId,
    attackerInst: CardInstance,
): boolean {
    // 判定はサーバーの validateBlock と同一の共有実装（shared/block.canBlock）
    return canBlock(view, blockerPid, blockerInst, attackerPid, attackerInst) === null
}

// main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.hasMagicImmunity）
export const hasMagicImmunityView = hasMagicImmunity

// コスト計算はサーバーと同一の共有実装（shared/cost）を使う。
// main.ts が effectiveCost を import しているため、ここから再エクスポートする
export { effectiveCost }

// 支払いに使える自分のフィールドのコア総数（スピリット/ネクサス上）。
// 【神速】召喚のときは基礎ルールでリザーブのみのため、sokuPaySourceGrant が許可した対象だけ数える
// （判定はサーバー validateSummon と同一の共有実装）
export function payableFieldCores(view: GameView, cardId: string): number {
    const player = view.players[view.you]
    const card = master(cardId)
    const isSoku = view.isFlashTiming && card.type === "spirit" && hasKeyword(cardId, "soku")
    const allowed = isSoku ? sokuPayableInstanceIds(view, view.you) : null
    return [...player.field.spirits, ...player.field.nexuses]
        .filter((i) => allowed === null || allowed.has(i.instanceId))
        .reduce((sum, i) => sum + i.cores, 0)
}

// 支払いモードでの残り不足コア数（0なら送信可能）
export function payingRemaining(view: GameView, paying: PayingState): number {
    const cardId = payingCardId(view, paying)
    if (cardId === undefined) return 0
    const card = master(cardId)
    // 代替召喚（ネクサスをデッキの下に戻して払う）は召喚コストが0になる
    const cost = paying.altSummonNexusInstanceIds ? 0 : effectiveCost(view, view.you, card)
    const targetLevel = paying.level || 1
    const lv = card.levels.find((l) => l.level === targetLevel)
    // ダイレクトブレイヴは維持コアを置かない（合体状態のLv1は0コア。BRAVE.md §5）
    const maintain =
        card.type === "magic" || paying.braveTargetInstanceId !== undefined ? 0 : (lv ? lv.cores : 0)
    const assignedTotal = Object.values(paying.assigned).reduce((a, b) => a + b, 0)
    // 代替コスト（手札破棄／デッキ破棄）は**コスト側だけ**を肩代わりする（置くコアには使えない）
    const alt = payingAltPay(view, paying)
    const need = cost + maintain - Math.min(alt.used, cost)
    const reserve = view.players[view.you].reserve
    return Math.max(need - reserve - assignedTotal, 0)
}

// マジックが対象を必要とするか（"opponent" = 相手スピリット、"self" = 自分スピリット）
export type TargetSide = "self" | "opponent"

// timing: メイン効果とフラッシュ効果で対象側が異なるカード（例: BS01-131）があるため、
// 実際に使用するタイミングに一致する効果だけを見て判定する
// （メイン・フラッシュ双方の効果を持つカードで対象側を混同するとサーバー側の
// 対象検索が両陣営から検索するため誤ったスピリットを対象にしてしまう）
export function magicTargetSide(
    card: CardData,
    timing: "main" | "flash",
): TargetSide | null {
    const effect = card.effects.find(
        (e) => e.kind === "magic" && e.timing === timing,
    )
    if (!effect || effect.kind !== "magic") return null
    // anySide（陣営を書いていない「スピリット1体を〜」。フレイムダンス／ダークコフィン等8枚）は
    // **対象を先取りしない**。ここは片側しか選ばせられず、選べるはずの側が選べなくなるため、
    // サーバー側の pendingChoice へ委ねる（対象選択はサーバーへ一本化する方針。2026-08-21 利用者確定）
    if ((effect.action as { anySide?: true }).anySide) return null
    if (
        effect.action.type === "destroy" ||
        effect.action.type === "coreRemove" ||
        effect.action.type === "exhaust" ||
        effect.action.type === "returnToHand" ||
        effect.action.type === "returnToDeckTop"
    ) {
        return "opponent"
    }
    if (
        effect.action.type === "bpBuff" ||
        effect.action.type === "bpBuffPer" ||
        effect.action.type === "coreCharge" ||
        effect.action.type === "grantKeyword" ||
        effect.action.type === "refireSummonEffect" ||
        effect.action.type === "trashCoresToSpirit" ||
        effect.action.type === "voidCoreToTarget" ||
        effect.action.type === "addSymbolThisTurn" ||
        effect.action.type === "levelUpThisTurn" ||
        effect.action.type === "attackTriggersAsBlockThisTurn"
    )
        return "self"
    return null
}

// 【覚醒】を現在レベルで持っているか（判定はサーバー validateAwaken と同一の共有実装）
export function canAwaken(view: GameView, inst: CardInstance): boolean {
    return sharedCanAwaken(view, view.you, inst)
}

// 起動能力が今このスピリットで発動可能なら {effectId, costLabel} を返す
// （判定はサーバー validateActivateAbility と同一の共有実装）
export function activatableAbility(
    view: GameView,
    you: PlayerId,
    inst: CardInstance,
): { effectId: string; costLabel: string } | null {
    return sharedActivatableAbility(view, you, inst)
}

// 支払いモード：コストをフィールドのコア／代替コストで賄うための一時状態
export interface PayingState {
    handIndex: number
    // 選択待ち（pendingChoice）の解決として送る場合の手札インデックス。
    // 「コストを支払って召喚できる」起動効果（BS08帝竜騎サイクル＝summonFromHandFree の payCost）で、
    // リザーブだけでは払えないときに通常の召喚と同じ支払いUIを流用するためのもの。
    // 立っているときは summon ではなく resolveChoice を送る（2026-08-23）
    forChoiceCardIndex?: number
    // 選択待ちの解決として支払うとき、選んだカードがどのゾーンにあるか（既定は手札）。
    // "trash" のときは handIndex を trashCards の添字として読む
    // （BS07常闇の聖堂＝トラッシュから召喚／BS08-X33ミカファール＝トラッシュのマジックを使用。2026-08-24）
    choiceZone?: "hand" | "trash"
    targetInstanceId?: string // マジックで対象選択済みの場合のみ
    level?: number // 召喚レベル指定用
    substituteInstanceId?: string // 入れ替え召喚の入れ替え元
    braveTargetInstanceId?: string // ダイレクトブレイヴの合体先スピリット（維持コアは置かない）
    altSummonNexusInstanceIds?: string[] // 代替召喚でデッキの下に戻すネクサス（召喚コストは0になる）
    assigned: Record<string, number> // instanceId -> 割り当てたコア数
    // 代替コスト（コア以外での支払い）。1つにつきコスト1が減る
    discardHandIndices: number[] // 破棄する手札のindex（BS08ビクティム。スピリット召喚のみ）
    millPay: number // デッキ破棄で払う枚数（BS04栄光の表彰台。ネクサス配置のみ）
}

// この支払いで使える代替コストの種類と上限。
// kind が null なら代替コストは使えない（＝従来どおりコアだけで払う）
export interface AltPayInfo {
    kind: "handDiscard" | "mill" | null
    used: number
    max: number
}

// 支払いモードで使える代替コストを求める。**サーバーの上限計算と同じ式にすること**
// （RuleValidator.summonHandDiscardPayAmount / nexusMillPayAmount。ズレると
//  「UIで選べるのにサーバーが弾く」形の食い違いになる）
// 支払い中のカードを取り出す（選択待ちの解決ならトラッシュを見ることもある）。
// **payingAltPay と payingRemaining は必ずこれを通す**（ゾーンの読み違いで別のカードを見ないように）
export function payingCardId(view: GameView, paying: PayingState): string | undefined {
    const player = view.players[view.you]
    if (paying.choiceZone === "trash") return player.trashCards[paying.handIndex]
    return player.hand?.[paying.handIndex]
}

export function payingAltPay(view: GameView, paying: PayingState): AltPayInfo {
    const player = view.players[view.you]
    const cardId = payingCardId(view, paying)
    if (cardId === undefined) return { kind: null, used: 0, max: 0 }
    const card = master(cardId)
    const cost = effectiveCost(view, view.you, card)
    if (card.type === "spirit" && canPaySummonCostByHandDiscard(view, view.you)) {
        // 召喚するカード自身は破棄に使えないので手札枚数から1枚引く
        const max = Math.min(cost, Math.max(0, handSizeOf(player) - 1))
        return { kind: "handDiscard", used: paying.discardHandIndices.length, max }
    }
    if (card.type === "nexus" && canPayNexusCostByMill(view, view.you)) {
        // 配置コストは**コア払いと併用できない**ので、選べるのは「全額デッキ破棄」か「使わない」の二択。
        // デッキが実効コストに足りなければ全額払えない＝この支払い方法自体が使えない
        if (player.deckCount < cost) return { kind: null, used: 0, max: 0 }
        return { kind: "mill", used: paying.millPay, max: cost }
    }
    return { kind: null, used: 0, max: 0 }
}

export interface UiState {
    targeting: { handIndex: number; side: TargetSide } | null
    // 覚醒モード：コアの移動先（覚醒持ちスピリット）の instanceId
    awakenTarget: string | null
    paying: PayingState | null
    // 指定アタックモード：対象選択中のアタッカーと、選べる相手の条件
    directedAttack: { attackerInstanceId: string; filter: DirectAttackFilter } | null
    // 召喚・配置レベル選択モード
    summonLevelSelect: { handIndex: number; cardId: string; targetInstanceId?: string; altSummonNexusInstanceIds?: string[] } | null
    // 入れ替え召喚モード：手札に戻す対象（自分のスピリット）を選択中
    battleSwapSummon: { handIndex: number; substituteInstanceIds: string[] } | null
    // ブレイヴの召喚方法を選択中。ブレイヴは「スピリット状態で単体召喚」と
    // 「合体した状態で召喚（ダイレクトブレイヴ）」のどちらかを毎回選ぶ（2026-08-28 ユーザー指示）。
    // candidateIds は合体先に選べる自分のスピリット（空でも単体召喚の選択肢は出す）
    braveSummonSelect: { handIndex: number; cardId: string; candidateIds: string[] } | null
    // 代替召喚（kind:"altSummonFromHand"）の方法を選択中。通常召喚と、
    // 支払いに使えるネクサスごとの選択肢を出す（BS10-058 水星神龍メルクリウス・サーペント）
    altSummonSelect: { handIndex: number; cardId: string; candidateNexusIds: string[] } | null
    // 増減式の選択（PendingChoice.stepper）でいま表示している数。選択が変わったら null に戻す
    stepper: number | null
}

// 指定アタック（canDirectAttack）を現在レベルで持っていれば対象条件を返す（共有実装）
export function canDirectAttack(
    view: GameView,
    pid: PlayerId,
    inst: CardInstance,
): DirectAttackFilter | null {
    return directAttackFilter(view, pid, inst)
}

// 指定アタックの対象条件に相手スピリットが合致するか（判定はサーバーと同一の共有実装）。
// targetPid は対象スピリットの持ち主（targetMinBp判定の実効BP計算に使う）
export function matchesDirectedAttackFilter(
    filter: DirectAttackFilter,
    target: CardInstance,
    view: GameView,
    targetPid: PlayerId,
): boolean {
    return sharedMatchesDirectedAttackFilter(filter, target, view, targetPid) === null
}

// ---- DOM ヘルパー ----

function $(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`要素が見つかりません: #${id}`)
    return el
}

function show(id: string, visible: boolean): void {
    $(id).classList.toggle("hidden", !visible)
}

// innerHTML に差し込む文字列のエスケープ（ツールチップの効果テキスト強調表示で使用）
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

// ---- 描画本体 ----

// イベント通知レイヤー：直前に処理済みのGameEvent.seq（初回は0で全件未処理扱い）
let lastEventSeq = 0

// バナー1件が画面に残る時間（CSSの event-banner-inout と合わせる）
const EVENT_BANNER_DURATION_MS = 3000

function eventBannerText(ev: GameEvent, you: PlayerId): string | null {
    switch (ev.type) {
        case "summon":
            return `✨ ${ev.cardName} 召喚`
        case "destroy":
            return `💥 ${ev.cardName} 破壊`
        case "magic":
            return `📜 ${ev.cardName} 使用`
        case "draw":
            // 自分のドローは手札の増加で分かるため表示しない。相手のドローのみ通知する
            return ev.pid === you ? null : `🃏 相手が${ev.count}枚ドロー`
        case "lifeDamage":
            return null // バナーは出さず、ライフ表示のシェイク演出のみ
        case "returnToHand":
            return `💨 ${ev.cardName} 手札へ戻る`
        case "returnToDeck":
            return `🌪 ${ev.cardName} デッキ${ev.position === "top" ? "上" : "下"}へ戻る`
    }
}

// view.events のうち前回描画より新しいものだけを処理する：
// 召喚・破壊・マジック・相手ドローはオーバーレイのバナー通知、ライフダメージは
// 対象プレイヤーのpidを集めて返す（renderInfoでの life-changed クラス付与に使う）
function processNewEvents(view: GameView): Set<PlayerId> {
    const layer = document.getElementById("event-layer")
    const lifeDamagedPids = new Set<PlayerId>()
    const newEvents = view.events.filter((ev) => ev.seq > lastEventSeq)
    for (const ev of newEvents) {
        if (ev.type === "lifeDamage") {
            lifeDamagedPids.add(ev.pid)
            continue
        }
        const text = eventBannerText(ev, view.you)
        if (text === null || !layer) continue
        const banner = document.createElement("div")
        banner.className = `event-banner event-${ev.type}`
        banner.textContent = text // サーバー由来の文字列（cardName等）を含むためtextContentで挿入
        layer.appendChild(banner)
        setTimeout(() => banner.remove(), EVENT_BANNER_DURATION_MS)
    }
    if (newEvents.length > 0) {
        lastEventSeq = newEvents.reduce((max, ev) => Math.max(max, ev.seq), lastEventSeq)
    }
    return lifeDamagedPids
}

export function render(view: GameView, ui: UiState): void {
    const lifeDamagedPids = processNewEvents(view)
    show("lobby", false)
    show("game", true)

    const you = view.you
    const opp: PlayerId = you === "p1" ? "p2" : "p1"
    const myTurn = view.turnPlayer === you
    const myMainFree = myTurn && view.phase === "main" && !view.battle
    const isDefender = !!view.battle && !myTurn
    // フラッシュ中で自分が優先権を持つか
    const hasPriority = view.priorityPlayer === you
    const inFlash = !!view.battle && view.isFlashTiming && hasPriority
    // 防御側の応答（ブロック・ライフ受け）が可能か：ブロック宣言はフラッシュタイミングの外
    // （フラッシュ①終了後）でのみ行える。優先権の有無は関係ない
    const canDefend = isDefender && !view.isFlashTiming

    // ステータスバー
    const hasRyukiEntaku = view.players[you].field.nexuses.some(n => n.cardId === "BS08-055")
    show("lbl-pay-to-negate", hasRyukiEntaku)
    if (hasRyukiEntaku) {
        ($("chk-pay-to-negate") as HTMLInputElement).checked = view.players[you].payToNegate ?? true
    }

    // エンドステップを数える封印（ルナティックシール）。カードは「デッキの横にコアを置く」と書くが、
    // 置かれたコアは以後どこからも参照されないので、**カウンターとして数だけ出す**
    const locks = view.endStepLocks ?? []
    show("end-step-lock", locks.length > 0)
    if (locks.length > 0) {
        $("end-step-lock").textContent = locks
            .map(l => {
                const whose = l.pid === you ? "自分" : "相手"
                const what = l.locks.map(k => LOCK_LABELS[k] ?? k).join("・")
                return `🔒 ${master(l.cardId).name}：${whose}のエンドステップ残り${l.remaining}回（${what}）`
            })
            .join(" / ")
    }

    $("turn-info").textContent = `ターン${view.turn}（${myTurn ? "あなた" : "相手"}）`
    document.querySelectorAll(".phase-step").forEach(el => {
        el.classList.remove("active")
        if ((el as HTMLElement).dataset.phase === view.phase) {
            el.classList.add("active")
        }
    })

    // フラッシュ状態の表示（ボーダーとパルス）
    const board = $("board")
    const oppHasFlash = !!view.battle && view.isFlashTiming && !hasPriority
    if (inFlash) {
        board.classList.add("your-priority")
        board.classList.remove("opp-thinking")
        $("btn-pass").classList.add("pulse")
    } else if (oppHasFlash) {
        board.classList.remove("your-priority")
        board.classList.add("opp-thinking")
        $("btn-pass").classList.remove("pulse")
    } else {
        board.classList.remove("your-priority")
        board.classList.remove("opp-thinking")
        $("btn-pass").classList.remove("pulse")
    }

    // 効果解決中の選択待ち（サーバーがresolveChoice以外のアクションを全拒否するため、
    // 自分宛・相手宛を問わず通常の操作ボタンを隠す）
    const pendingChoiceActive = !!view.pendingChoice
    const myPendingChoice =
        view.pendingChoice && view.pendingChoice.pid === view.you ? view.pendingChoice : null
    const oppPendingChoice =
        view.pendingChoice && view.pendingChoice.pid !== view.you ? view.pendingChoice : null

    // 「お互い、アタックステップは行えず」（ルナティックシール）。サーバーも同じ判定で弾く
    show("btn-attack-phase", myMainFree && !pendingChoiceActive && !isEndStepLocked(view, "attackStep"))
    show(
        "btn-end-turn",
        myTurn && !view.battle && (view.phase === "main" || view.phase === "attack") && !pendingChoiceActive,
    )
    show(
        "btn-take-life",
        canDefend && !view.battle?.blockerInstanceId && !pendingChoiceActive,
    )
    show("btn-pass", inFlash && !pendingChoiceActive)
    const anyMode =
        ui.targeting !== null || ui.awakenTarget !== null || ui.paying !== null || ui.directedAttack !== null || ui.summonLevelSelect !== null || ui.battleSwapSummon !== null || ui.braveSummonSelect !== null || ui.altSummonSelect !== null
    show("btn-cancel-target", anyMode)
    // 支払いモードで、これ以上コアを足さなくても成立するときに出す確定ボタン。
    // 代替コスト（手札破棄／デッキ破棄）を「使わない」まま確定したいケースがあるので、
    // コアが足りていても支払いモードへ入る仕様（tryPlay）とセットで必要になる
    show("btn-confirm-pay", ui.paying !== null && payingRemaining(view, ui.paying) === 0)
    show("btn-attack-player", ui.directedAttack !== null)
    show("targeting-info", anyMode || pendingChoiceActive)
    show("btn-skip-choice", myPendingChoice?.optional === true)
    // トグル選択では、スキップは「中止」ではなく「これで確定」を意味する（PendingChoice.skipLabel）
    $("btn-skip-choice").textContent = myPendingChoice?.skipLabel ?? "選ばない"
    // kind:"option"の選択肢ボタンを描画する（myPendingChoiceが自分宛かつoption式のときのみ）。
    // kind:"card"かつcardZone:"trash"のときも同じボタンUIでカード名を並べる
    // （cardZone:"hand"は手札のカード自体をクリックさせるためここには描画しない）
    const choiceOptionsEl = $("choice-options")
    choiceOptionsEl.innerHTML = ""
    if (myPendingChoice && myPendingChoice.kind === "option" && myPendingChoice.stepper) {
        // 増減式（PendingChoice.stepper）：ボタンを options の数だけ並べる代わりに −／＋ で数を決める。
        // 「どれを選ぶか」に意味が無く候補数が多くなりうるもの（トラッシュに置くコアの数）に使う
        const opts = myPendingChoice.options ?? []
        const max = opts.length - 1
        if (ui.stepper === null || ui.stepper > max) ui.stepper = 0
        const value = ui.stepper
        const minus = document.createElement("button")
        minus.dataset.stepper = "-"
        minus.textContent = "−"
        minus.disabled = value <= 0
        const readout = document.createElement("span")
        readout.className = "stepper-value"
        readout.textContent = `${String(value)} / ${String(max)}`
        const plus = document.createElement("button")
        plus.dataset.stepper = "+"
        plus.textContent = "＋"
        plus.disabled = value >= max
        const confirm = document.createElement("button")
        confirm.dataset.option = opts[value] ?? "0"
        confirm.textContent = "決定"
        choiceOptionsEl.append(minus, readout, plus, confirm)
        show("choice-options", true)
    } else if (myPendingChoice && myPendingChoice.kind === "option") {
        for (const opt of myPendingChoice.options ?? []) {
            const b = document.createElement("button")
            b.dataset.option = opt
            b.textContent = opt
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else if (myPendingChoice && myPendingChoice.kind === "card" && myPendingChoice.cardZone === "trash") {
        const trash = view.players[view.you].trashCards
        for (const idx of myPendingChoice.cardIndices ?? []) {
            const cardId = trash[idx]
            if (cardId === undefined) continue
            const b = document.createElement("button")
            b.dataset.cardIndex = String(idx)
            b.textContent = master(cardId).name
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else if (myPendingChoice && myPendingChoice.kind === "card" && myPendingChoice.cardZone === "reveal") {
        // 公開ゾーン（デッキから「オープン」したカード）。トラッシュと同じボタンUIで並べる
        const revealed = view.revealedCards?.cardIds ?? []
        for (const idx of myPendingChoice.cardIndices ?? []) {
            const cardId = revealed[idx]
            if (cardId === undefined) continue
            const card = master(cardId)
            const b = document.createElement("button")
            b.dataset.cardIndex = String(idx)
            b.textContent = `${card.name}（${CARD_TYPE_LABELS[card.type]}）`
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else if (ui.summonLevelSelect) {
        const card = master(ui.summonLevelSelect.cardId)
        // 代替召喚（ネクサスをデッキの下に戻して払う）では召喚コストが0になる
        const cost = ui.summonLevelSelect.altSummonNexusInstanceIds ? 0 : effectiveCost(view, view.you, card)
        const reserve = view.players[view.you].reserve
        // コストも置くコアも、リザーブに加えてフィールドのコアで賄える。
        // リザーブだけでは足りないレベルは「フィールドから取得」と明示する
        const fieldCores = payableFieldCores(view, ui.summonLevelSelect.cardId)
        const affordableLevels = card.levels.filter((l) => reserve + fieldCores >= cost + l.cores)
        for (const l of affordableLevels) {
            const b = document.createElement("button")
            b.dataset.summonLevel = String(l.level)
            const needsField = reserve < cost + l.cores
            b.textContent = needsField
                ? `Lv${l.level} (${l.cores}コア・フィールドから取得)`
                : `Lv${l.level} (${l.cores}コア)`
            if (needsField) b.classList.add("needs-field-cores")
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else if (ui.braveSummonSelect) {
        // ブレイヴの召喚方法。単体（スピリット状態）と、合体先ごとのボタンを並べる
        const single = document.createElement("button")
        single.dataset.braveSummon = "single"
        single.textContent = "スピリット状態で召喚"
        choiceOptionsEl.appendChild(single)
        for (const hostId of ui.braveSummonSelect.candidateIds) {
            const host = view.players[view.you].field.spirits.find((s) => s.instanceId === hostId)
            if (host === undefined) continue
            const b = document.createElement("button")
            b.dataset.braveSummon = hostId
            // ダイレクトブレイヴは維持コアを置かない（合体状態のLv1は0コア）
            b.textContent = `${master(host.cardId).name} に合体`
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else if (ui.altSummonSelect) {
        // 代替召喚。通常どおり払う道と、ネクサスをデッキの下に戻して払う道を並べる
        const normal = document.createElement("button")
        normal.dataset.altSummon = "normal"
        normal.textContent = `通常どおり召喚（コスト${effectiveCost(view, view.you, master(ui.altSummonSelect.cardId))}）`
        choiceOptionsEl.appendChild(normal)
        for (const nexusId of ui.altSummonSelect.candidateNexusIds) {
            const nexus = view.players[view.you].field.nexuses.find((n) => n.instanceId === nexusId)
            if (nexus === undefined) continue
            const b = document.createElement("button")
            b.dataset.altSummon = nexusId
            b.textContent = `${master(nexus.cardId).name} をデッキの下に戻して召喚（コストなし）`
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else {
        show("choice-options", false)
    }
    // 選択待ちの解決として支払い中（起動効果の召喚コストをフィールドのコアから払う）のときは、
    // 選択待ちの文言ではなく支払いの案内を優先して出す（2026-08-23）
    if (myPendingChoice && ui.paying?.forChoiceCardIndex === undefined) {
        $("targeting-info").textContent = `⚡ ${myPendingChoice.prompt}`
    } else if (oppPendingChoice) {
        $("targeting-info").textContent = `⏳ ${oppPendingChoice.prompt}`
    } else if (ui.paying !== null) {
        const remaining = payingRemaining(view, ui.paying)
        const alt = payingAltPay(view, ui.paying)
        const base = `💎 コアの支払い: 残り ${remaining} コア。フィールドのスピリット/ネクサス上のコアを割り当ててください（コストと置くコアのどちらにも使えます）`
        if (alt.kind === "handDiscard") {
            // 破棄する手札は「どれを捨てるか」を選ぶので、手札そのものをクリックさせる
            $("targeting-info").textContent =
                `${base}／🗑 手札を破棄してコストに充てられます（${alt.used}/${alt.max}枚）。手札をクリックして選んでください`
        } else if (alt.kind === "mill") {
            // 配置コストはコアかデッキ破棄のどちらか一方（併用不可）なので、枚数ではなく方法を選ぶ
            const on = alt.used > 0
            $("targeting-info").innerHTML =
                `${base}／📚 配置コストの払い方: ` +
                `<button data-altpay="toggle">${on ? "☑" : "☐"} デッキを上から${alt.max}枚破棄して払う</button>` +
                (on ? "（コアは置くコアぶんだけ必要です）" : "")
        } else {
            $("targeting-info").textContent = base
        }
    } else if (ui.awakenTarget !== null) {
        const fromReserve = canAwakenFromReserve(view, view.you)
        $("targeting-info").textContent = fromReserve
            ? "🔄 覚醒: コアの移動元にする自分のスピリットまたはリザーブを選んでください"
            : "🔄 覚醒: コアの移動元にする自分のスピリットを選んでください"
    } else if (ui.directedAttack !== null) {
        $("targeting-info").textContent =
            "⚔️ 指定アタック: アタック対象の相手スピリットを選択（またはプレイヤーへアタック）"
    } else if (ui.summonLevelSelect) {
        $("targeting-info").textContent =
            `🌟 召喚/配置レベルを選択してください (リザーブからコアを置きます)`
    } else if (ui.battleSwapSummon) {
        $("targeting-info").textContent =
            `🔄 入れ替え召喚: 手札に戻す自分のスピリットを選んでください`
    } else if (ui.braveSummonSelect) {
        $("targeting-info").textContent =
            `⚔ ブレイヴの召喚方法を選んでください（スピリット状態／合体した状態）`
    } else if (ui.altSummonSelect) {
        $("targeting-info").textContent =
            `🌀 召喚の方法を選んでください（コストを払う／ネクサスをデッキの下に戻す）`
    } else if (ui.targeting) {
        $("targeting-info").textContent =
            `🎯 対象にする${ui.targeting.side === "opponent" ? "相手" : "自分"}のスピリットを選んでください`
    } else if (oppHasFlash) {
        show("targeting-info", true)
        $("targeting-info").textContent = "⏳ 相手がフラッシュタイミングを検討中…"
    } else if (!myTurn && !view.battle && !pendingChoiceActive && !anyMode) {
        show("targeting-info", true)
        $("targeting-info").textContent = "⏳ 相手のターン…"
    }

    // プレイヤー情報
    renderInfo("opp-info", view, ui, opp, false, lifeDamagedPids.has(opp))
    renderInfo("my-info", view, ui, you, true, lifeDamagedPids.has(you))

    // フィールド
    renderField("opp-spirits", "opp-nexuses", view, ui, opp, false)
    renderField("my-spirits", "my-nexuses", view, ui, you, true)

    // 手札
    renderHand(view, ui)

    // 手元ボタン
    const myTegamotoCount = view.players[you].tegamoto?.length ?? 0
    const oppTegamotoCount = view.players[opp].tegamoto?.length ?? 0
    $("btn-my-tegamoto").textContent = `手元(${myTegamotoCount})`
    show("btn-my-tegamoto", myTegamotoCount > 0)
    $("btn-opp-tegamoto").textContent = `相手の手元(${oppTegamotoCount})`
    show("btn-opp-tegamoto", oppTegamotoCount > 0)

    // バトル情報
    renderBattle(view)

    // ログ（内容のヒューリスティックでクラスを付与し、視認性を上げる。サーバーの文字列自体は変更しない）
    const logEl = $("log")
    logEl.innerHTML = ""
    for (const line of view.log) {
        const div = document.createElement("div")
        if (cardNameRegex && line.match(cardNameRegex)) {
            const parts = line.split(cardNameRegex)
            for (const part of parts) {
                const card = cardNameMap.get(part)
                if (card) {
                    const span = document.createElement("span")
                    span.className = "log-card-name"
                    span.dataset.cardId = card.cardId
                    span.textContent = part
                    div.appendChild(span)
                } else {
                    div.appendChild(document.createTextNode(part))
                }
            }
        } else {
            div.textContent = line
        }

        if (line.includes("ターン")) {
            div.className = "log-turn"
        } else if (line.includes("ステップ")) {
            div.className = "log-phase"
        } else if (line.includes("破壊") || line.includes("ダメージ") || line.includes("ライフ")) {
            div.className = "log-important"
        } else if (line.includes("：")) {
            div.className = "log-effect"
        }
        logEl.appendChild(div)
    }
    logEl.scrollTop = logEl.scrollHeight

    // 勝敗
    if (view.winner) {
        show("result-overlay", true)
        $("result-message").textContent =
            view.winner === you ? "勝利" : "敗北"
    } else {
        show("result-overlay", false)
    }
}

function renderInfo(
    id: string,
    view: GameView,
    ui: UiState,
    pid: PlayerId,
    isSelf: boolean,
    lifeDamaged: boolean,
): void {
    const p = view.players[pid]
    const el = $(id)
    el.innerHTML = ""
    // 覚醒モード中にリザーブからコアを移せるか（ディノゾールLv2の効果）
    const reserveHighlight = isSelf
        && ui.awakenTarget !== null
        && canAwakenFromReserve(view, view.you)
        && p.reserve >= 1
    // 効果解決の選択待ちで「相手のリザーブ」が候補になっているか（犬人マードック）
    const oppReserveChoice = !isSelf
        && view.pendingChoice?.pid === view.you
        && (view.pendingChoice?.candidates ?? []).includes(OPPONENT_RESERVE_TARGET)
    // ライフダメージのGameEventがあれば演出用クラスを付与（一過性のアニメーションなので毎描画で再生されるだけでよい）
    const items: [string, string][] = [
        ["", (isSelf ? "あなた: " : "相手: ") + p.name + (view.turnPlayer === pid ? " ⏵ターン中" : "")],
        ["life" + (lifeDamaged ? " life-changed" : ""), `❤ ${p.life}`],
        ["reserve", `🔵 リザーブ ${p.reserve}`],
        ["", `トラッシュコア ${p.trashCores}`],
        ["", `デッキ ${p.deckCount}枚`],
        ["", isSelf ? `手札 ${p.handCount}枚` : `相手手札 ${p.handCount}枚`],
        ["", `トラッシュ ${p.trashCards.length}枚`],
    ]

    if (!isSelf && view.players[view.you].peekedOpponentCardIds?.length) {
        const peeked = view.players[view.you].peekedOpponentCardIds!.map(id => master(id).name).join(" / ")
        items.push(["", `(判明: ${peeked})`])
    }
    for (const [cls, text] of items) {
        const span = document.createElement("span")
        if (cls) span.className = cls
        const isReserve = cls.includes("reserve")
        // 覚醒モードでリザーブをコアの移動元にできるカード（ディノゾールLv2）のため、
        // 自分のリザーブ表示をクリック対象として識別できるようにする
        if (isSelf && isReserve) {
            span.dataset.reserve = "self"
            if (reserveHighlight) span.classList.add("targetable", "clickable")
        }
        // 相手のリザーブも、選択待ちの候補になっているときだけクリック対象にする
        if (!isSelf && isReserve) {
            span.dataset.reserve = "opponent"
            if (oppReserveChoice) span.classList.add("targetable", "clickable")
        }
        span.textContent = text
        el.appendChild(span)
    }
}

function renderField(
    spiritZoneId: string,
    nexusZoneId: string,
    view: GameView,
    ui: UiState,
    pid: PlayerId,
    isMine: boolean,
): void {
    const player = view.players[pid]
    const spiritZone = $(spiritZoneId)
    const nexusZone = $(nexusZoneId)
    spiritZone.innerHTML = ""
    nexusZone.innerHTML = ""

    for (const inst of player.field.spirits) {
        spiritZone.appendChild(fieldCardEl(view, ui, inst, isMine, pid))
    }
    for (const inst of player.field.nexuses) {
        nexusZone.appendChild(fieldCardEl(view, ui, inst, isMine, pid, true))
    }
}

// コア移動ボタン（+/−、および各レベルへのショートカット）。スピリットとネクサスで共用する
function coreButtonsEl(instanceId: string, currentCores: number, levels: { level: number, cores: number }[]): HTMLElement {
    const btns = document.createElement("div")
    btns.className = "core-buttons"
    
    const removeBtn = document.createElement("button")
    removeBtn.dataset.core = "remove"
    removeBtn.dataset.instanceId = instanceId
    removeBtn.textContent = "−"
    removeBtn.title = "コアを1個リザーブへ戻す"
    btns.appendChild(removeBtn)

    // レベルごとのショートカットボタン
    for (const lv of levels) {
        if (lv.cores <= 0) continue // コア0個のレベル（基本ないが念のため）はスキップ
        const isCurrentLv = currentCores >= lv.cores && (levels.find(l => l.level === lv.level + 1)?.cores || Infinity) > currentCores
        if (isCurrentLv) {
            continue // 現在のレベルのボタンは表示しない
        }
        
        const lvBtn = document.createElement("button")
        lvBtn.dataset.core = `set-${lv.cores}`
        lvBtn.dataset.currentCores = String(currentCores)
        lvBtn.dataset.instanceId = instanceId
        lvBtn.textContent = `Lv${lv.level}`
        lvBtn.title = `コアを${lv.cores}個（Lv${lv.level}）にする`
        btns.appendChild(lvBtn)
    }

    const addBtn = document.createElement("button")
    addBtn.dataset.core = "add"
    addBtn.dataset.instanceId = instanceId
    addBtn.textContent = "＋"
    addBtn.title = "リザーブからコアを1個置く"
    btns.appendChild(addBtn)

    return btns
}

function fieldCardEl(
    view: GameView,
    ui: UiState,
    inst: CardInstance,
    isMine: boolean,
    ownerPid: PlayerId,
    isNexus = false,
): HTMLElement {
    const m = master(inst.cardId)
    const { level } = levelOf(inst)
    const bp = effectiveBp(view, ownerPid, inst)
    const myTurn = view.turnPlayer === view.you
    const myMainFree = myTurn && view.phase === "main" && !view.battle
    const isDefender = !!view.battle && !myTurn
    // 防御側の応答（ブロック）が可能か：フラッシュタイミングの外（フラッシュ①終了後）でのみ行える
    const canDefend = isDefender && !view.isFlashTiming
    // ブロック判定用：現在のバトルのアタッカー（攻撃側は常にターンプレイヤー）
    const attacker = view.battle
        ? view.players[view.turnPlayer].field.spirits.find(
              (s) => s.instanceId === view.battle?.attackerInstanceId,
          )
        : undefined

    const el = document.createElement("div")
    el.className = "card"
    el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
    el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
    if (inst.isRested) el.classList.add("rested")
    el.dataset.instanceId = inst.instanceId
    el.dataset.cardId = inst.cardId
    el.dataset.side = isMine ? "mine" : "opp"

    // 現在のフェーズで発動しているステップ効果があるか
    const hasActiveStepEffect = m.effects.some((e) => {
        if (e.kind !== "step") return false
        if (e.step !== view.phase) return false
        const isOwnerTurn = view.turnPlayer === ownerPid
        if (e.turn === "own" && !isOwnerTurn) return false
        if (e.turn === "opponent" && isOwnerTurn) return false
        return effectActiveAtLevel(e.levels, level)
    })
    if (hasActiveStepEffect) {
        el.classList.add("step-active")
        const badge = document.createElement("div")
        badge.className = "step-active-badge"
        badge.textContent = "発動中"
        el.appendChild(badge)
    }

    if (inst.asSpiritThisTurn) {
        const badge = document.createElement("div")
        badge.className = "as-spirit-badge"
        badge.textContent = "スピリット化中"
        el.appendChild(badge)
    }

    // 合体しているブレイヴ。実体は field.combinedBraves にいて braveRefs で参照されており、
    // 単独のカードとして場に並ばない（BRAVE.md §2.3）ので、ホストのカードの中に名前とLvを出す。
    // BP・シンボル・コストは既に合体後の値が effectiveBp などから出ている
    if (!isNexus) {
        const braves = bravesOf(view.players[ownerPid], inst)
        if (braves.length > 0) {
            // カードは固定サイズなので、行を通常フローに足すと下へはみ出す。
            // 下端に重ねる箱にまとめて入れる（異魔神ブレイヴのように2体合体しても縦に積める）
            const box = document.createElement("div")
            box.className = "brave-combined-box"
            for (const brave of braves) {
                const row = document.createElement("div")
                row.className = "brave-combined"
                row.dataset.instanceId = brave.instanceId
                row.dataset.cardId = brave.cardId
                const braveName = master(brave.cardId).name
                // カード幅が76pxしかないので記号は置かず名前を優先する（左の色バーで見分けがつく）
                row.textContent = `${braveName} Lv${levelOf(brave).level}`
                row.title = `合体中: ${braveName}` // カードが狭く名前が省略されるため、フル名はここで見せる
                box.appendChild(row)
            }
            el.appendChild(box)
        }
    }

    let unexhaustable = false
    if (isNexus && view.phase === "attack") {
        const otherPid = Object.keys(view.players).find(id => id !== ownerPid) as PlayerId
        if (otherPid) {
            const otherNexuses = view.players[otherPid].field.nexuses
            for (const n of otherNexuses) {
                if (n.cardId === "BS09-063" && levelOf(n).level >= 2) {
                    unexhaustable = true
                    break
                }
            }
        }
    }
    if (unexhaustable) {
        el.classList.add("unexhaustable")
        const badge = document.createElement("div")
        badge.className = "unexhaustable-badge"
        badge.textContent = "疲労不可"
        badge.style.position = "absolute"
        badge.style.top = "-6px"
        badge.style.right = "-6px"
        badge.style.background = "#d32f2f"
        badge.style.color = "white"
        badge.style.fontSize = "10px"
        badge.style.padding = "2px 6px"
        badge.style.borderRadius = "4px"
        badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.5)"
        badge.style.zIndex = "2"
        badge.style.pointerEvents = "none"
        el.appendChild(badge)
    }

    const name = document.createElement("div")
    name.className = "name"
    name.textContent = m.name
    el.appendChild(name)

    const stats = document.createElement("div")
    stats.className = "stats"
    stats.textContent = isNexus
        ? `Lv${level}`
        : `Lv${level} BP${bp}${inst.tempBpBuff ? "↑" : ""}`
    el.appendChild(stats)

    // コストバッジを左上に表示
    const costBadge = document.createElement("div")
    costBadge.className = `cost-badge cost-${m.type}`
    costBadge.textContent = String(m.cost)
    el.appendChild(costBadge)

    const cores = document.createElement("div")
    cores.className = "cores"
    cores.textContent = `◉ コア ${inst.cores}`
    el.appendChild(cores)

    const symbolsDiv = document.createElement("div")
    symbolsDiv.className = "symbols"
    if (m.symbol.length === 0) {
        symbolsDiv.textContent = "無"
        symbolsDiv.style.color = "var(--text-muted)"
        symbolsDiv.style.fontSize = "10px"
    } else {
        m.symbol.forEach(symColor => {
            const sym = document.createElement("span")
            sym.className = `sym-icon bg-${symColor}`
            sym.dataset.colorLabel = COLOR_SYMBOLS[symColor] || ""
            symbolsDiv.appendChild(sym)
        })
    }
    el.appendChild(symbolsDiv)



    if (view.battle?.attackerInstanceId === inst.instanceId) {
        el.classList.add("attacker-mark")
    }

    // 効果解決中の選択待ち（自分宛）：候補なら最優先でハイライトし、他の操作モードは無視する。
    // ただし**選択の解決として支払い中**（起動効果の召喚コストをフィールドのコアから払う）のときは、
    // コアの割り当てを続けられるよう下の支払いモードへ通す（2026-08-23）
    if (view.pendingChoice && view.pendingChoice.pid === view.you && ui.paying?.forChoiceCardIndex === undefined) {
        if (view.pendingChoice.candidates.includes(inst.instanceId)) {
            el.classList.add("targetable", "clickable")
            // トグル選択（予算内で好きなだけ破壊する）で、いま選ばれているもの。
            // 候補のまま残っているので、もう一度押すと選択が外れる
            if (view.pendingChoice.selectedIds?.includes(inst.instanceId)) {
                el.classList.add("choice-selected")
            }
        }
        return el
    }

    if (isNexus) {
        // 支払いモード中：自分のネクサス上のコアも支払いに割り当てられる
        if (isMine && ui.paying !== null) {
            const assigned = ui.paying.assigned[inst.instanceId] ?? 0
            if (assigned > 0) {
                const badge = document.createElement("div")
                badge.className = "pay-badge"
                badge.textContent = `支払${assigned}`
                el.appendChild(badge)
            }
            if (assigned < inst.cores) {
                el.classList.add("targetable", "clickable")
            }
            return el
        }
        // コア移動ボタン（メインステップのみ）。ネクサスもコアを置いてレベルを上げ下げできる。
        // ⚠️ ネクサスは clip-path で六角形に切り抜いているため、カード要素の**子**に置くと
        // ボタンごとクリップされて消える（「−」が見えない・「+」が押しにくい原因）。
        // クリップされないラッパーの直下へ、カードと**兄弟**として置く
        if (isMine && myMainFree && !view.pendingChoice) {
            const slot = document.createElement("div")
            slot.className = "nexus-slot"
            slot.appendChild(el)
            const levelsToUse = inst.asSpiritThisTurn?.levels ?? m.levels
            slot.appendChild(coreButtonsEl(inst.instanceId, inst.cores, levelsToUse))
            return slot
        }
        return el
    }

    // このターンアタック不可（ピュアエリクサー等で回復した個体）
    if (inst.cantAttackThisTurn) {
        const badge = document.createElement("div")
        badge.className = "cant-attack-badge"
        badge.textContent = "アタック不可"
        el.appendChild(badge)
    }

    // フラッシュ中で自分が優先権を持つか（覚醒可否の判定に使用）
    const inFlash =
        !!view.battle && view.isFlashTiming && view.priorityPlayer === view.you

    if (isMine) {
        // 選択待ち中（自分・相手いずれか宛）は自分側の操作UIをすべて抑止する
        // （自分宛のときはこの関数はここに到達する前に既にreturn済み。ここに来るのは
        // 「相手宛のpendingChoice」または「pendingChoiceなし」のケースのみ）。
        // 選択の解決として支払い中のときだけは、下の支払いモードへ通す（2026-08-23）
        if (view.pendingChoice && ui.paying?.forChoiceCardIndex === undefined) {
            return el
        }
        // 支払いモード中：割り当て済みコア数をバッジ表示し、割り当て可能なら強調表示のみ行う
        // （他の操作（コア移動・アタック・覚醒等）と競合しないよう、ここで処理を打ち切る）
        if (ui.paying !== null) {
            const assigned = ui.paying.assigned[inst.instanceId] ?? 0
            if (assigned > 0) {
                const badge = document.createElement("div")
                badge.className = "pay-badge"
                badge.textContent = `支払${assigned}`
                el.appendChild(badge)
            }
            if (assigned < inst.cores) {
                el.classList.add("targetable", "clickable")
            }
            return el
        }
        // 覚醒モード中：移動先を強調し、他の自分スピリットを移動元候補として表示
        if (ui.awakenTarget !== null) {
            if (inst.instanceId === ui.awakenTarget) {
                el.classList.add("awaken-target", "clickable")
            } else if (inst.cores >= 1) {
                el.classList.add("targetable", "clickable")
            }
            return el
        }
        // 指定アタックの対象選択モード中：他の操作（ブロック・対象選択・覚醒等）を抑止する
        if (ui.directedAttack !== null) {
            if (inst.instanceId === ui.directedAttack.attackerInstanceId) {
                el.classList.add("directed-attacker")
            }
            return el
        }
        // 入れ替え召喚の対象選択中
        if (ui.battleSwapSummon !== null) {
            if (ui.battleSwapSummon.substituteInstanceIds.includes(inst.instanceId)) {
                el.classList.add("targetable", "clickable")
            }
            return el
        }
        // 対象選択中（自分側）
        if (ui.targeting?.side === "self") el.classList.add("targetable", "clickable")
        // 覚醒可能（フラッシュ中で優先権あり）：バッジのクリックで覚醒モード開始
        if (inFlash && canAwaken(view, inst)) {
            const badge = document.createElement("button")
            badge.className = "awaken-badge"
            badge.dataset.awaken = inst.instanceId
            badge.textContent = "覚醒可能"
            badge.title = "クリックしてコアの移動元を選ぶ"
            el.appendChild(badge)
        }
        // 起動能力（フラッシュ中のバトル／自分のメインステップで任意発動）：バッジのクリックで発動。
        // 出す条件は共有層の activatableAbility が一手に判定する（サーバーの受理条件と同じ実装）
        const activatable = activatableAbility(view, view.you, inst)
        if (activatable) {
            const badge = document.createElement("button")
            badge.className = "activate-badge"
            badge.dataset.activate = inst.instanceId
            badge.dataset.effect = activatable.effectId
            badge.textContent = "起動"
            badge.title = activatable.costLabel
            el.appendChild(badge)
        }
        // フィールド全体制約（魔帝の墓標）：コア1個しか置いていないスピリットはアタック/ブロック不可
        const singleCoreLocked =
            inst.cores === 1 && hasGlobalConstraint(view, "singleCoreCantAct")
        // このスピリットはアタックできない（カイザレオン大帝Lv1）
        const cantAttack = activeConstraints(view, ownerPid, inst).some((c) => c.type === "cantAttack")
        // このターンの間だけの全体制約（ヘビィゲート）：コストがmaxCost以下のスピリットはアタック/ブロック不可
        // フィールド全体制約（BS05白夜の虚空／青嵐の虚空／BS02グレートウォール）：コスト条件に合うスピリットはアタック/ブロック不可
        // （道化師クランの付与コストも考慮する instCostCantAct を使う）
        const costLocked = cantActByCost(view, inst) || instCostCantAct(view, inst)
        // アタック可能（先攻1ターン目はアタック禁止）
        if (
            myTurn &&
            view.phase === "attack" &&
            view.turn !== 1 &&
            !view.battle &&
            !inst.isRested &&
            !inst.cantAttackThisTurn &&
            !singleCoreLocked &&
            !cantAttack &&
            !costLocked &&
            level >= 1
        ) {
            el.classList.add("clickable", "usable")
        }
        // ブロック可能（cantBlock / cantBlockLowerBp / unblockableBy / singleCoreCantAct の制約を反映）。
        // 疲労状態でも canBlockWhileRested（BS06計画された場外乱闘）を持てばブロックできるため、
        // isRestedでの早期除外はせず canBlockAttacker（shared/block.canBlock）にまとめて判定させる
        if (
            canDefend &&
            !view.battle?.blockerInstanceId &&
            !singleCoreLocked &&
            !costLocked &&
            level >= 1 &&
            (!attacker || canBlockAttacker(view, ownerPid, inst, view.turnPlayer, attacker))
        ) {
            el.classList.add("clickable", "usable")
        }
        // コア移動ボタン（メインステップのみ）
        if (myMainFree) {
            const levelsToUse = inst.asSpiritThisTurn?.levels ?? m.levels
            el.appendChild(coreButtonsEl(inst.instanceId, inst.cores, levelsToUse))
        }
    } else {
        // 指定アタックの対象選択モード中：フィルタに合う相手スピリットのみ選択可能
        if (ui.directedAttack !== null) {
            if (matchesDirectedAttackFilter(ui.directedAttack.filter, inst, view, ownerPid)) {
                el.classList.add("targetable", "clickable")
            }
            return el
        }
        // 対象選択中（相手側）。耐性の判定は共有層に一本化されている（サーバーとまったく同じ表を通る）
        if (ui.targeting?.side === "opponent") {
            const usingCardId = view.players[view.you].hand?.[ui.targeting.handIndex]
            const usingColors = usingCardId ? master(usingCardId).colors : undefined
            const resisted = boardResistanceAgainst(view, ownerPid, inst, {
                op: "other",
                scope: "targeted",
                actorPid: view.you,
                sourceType: "magic",
                ...(usingColors ? { sourceColors: usingColors } : {}),
            })
            if (!resisted) el.classList.add("targetable", "clickable")
        }
    }

    return el
}

function renderHand(view: GameView, ui: UiState): void {
    const handEl = $("hand")
    handEl.innerHTML = ""
    const hand = view.players[view.you].hand
    if (!hand) return

    const myTurn = view.turnPlayer === view.you
    const myMainFree = myTurn && view.phase === "main" && !view.battle
    // フラッシュ中で自分が優先権を持つとき（攻撃側・防御側どちらでも使用可）
    const inFlash =
        !!view.battle && view.isFlashTiming && view.priorityPlayer === view.you
    // ディバインチェイン等でこのバトルの間フラッシュの手札使用を封じられているか
    const flashLocked = view.battle?.flashLockedPlayer === view.you
    const reserve = view.players[view.you].reserve

    // 効果解決中の選択待ち（自分宛・kind:"card"・cardZone:"hand"）：候補インデックスをハイライトする
    const handChoiceIndices =
        view.pendingChoice &&
        view.pendingChoice.pid === view.you &&
        view.pendingChoice.kind === "card" &&
        view.pendingChoice.cardZone === "hand"
            ? new Set(view.pendingChoice.cardIndices ?? [])
            : null

    // grantKeywordToHandCard（ビートプリースト等）で一時的に神速を付与された手札カードのcardId一覧
    const tempSokuCardIds = new Set(
        (view.players[view.you].tempHandKeywordGrants ?? [])
            .filter((g) => g.keyword === "soku")
            .map((g) => g.cardId),
    )

    const groupedHand = new Map<string, { count: number, indices: number[] }>()
    hand.forEach((cardId, index) => {
        if (!groupedHand.has(cardId)) {
            groupedHand.set(cardId, { count: 0, indices: [] })
        }
        const g = groupedHand.get(cardId)!
        g.count++
        g.indices.push(index)
    })

    groupedHand.forEach((g, cardId) => {
        const index = g.indices[0]
        const m = master(cardId)
        const cost = effectiveCost(view, view.you, m)
        const lv1 = m.levels.find((l) => l.level === 1)
        const need = cost + (lv1 ? lv1.cores : 0)
        // 神速：静的に持つか、grantKeywordToHandCardで一時付与されているか、
        // 場の発生源から継続的に与えられているか（緑芽吹く原野Lv2。判定はサーバーと同一の共有実装）
        const flashSummonable =
            m.type === "spirit" &&
            (hasKeyword(cardId, "soku") ||
                tempSokuCardIds.has(cardId) ||
                hasHandKeywordGrant(view, view.you, m, "soku"))

        // 力奪う凱旋門：相手フィールドに発生源があれば、自分のフィールドのシンボル色と一致しない
        // 色のマジックは使用不可（クリック自体は可能だが usable ハイライトからは除外する）
        const magicColorLocked =
            m.type === "magic" &&
            hasMagicRestriction(view, view.you, "colorLockOpponent") &&
            !m.colors.some((c) => ownFieldSymbolColors(view, view.you).has(c))

        const fieldCores = payableFieldCores(view, cardId)
        const isTimingValid =
            (myMainFree) ||
            (inFlash && !flashLocked && ((m.type === "magic" && m.flash) || flashSummonable))

        const isUsableState = !view.pendingChoice && !magicColorLocked && isTimingValid
        const usable = isUsableState && reserve >= need
        const usableField = isUsableState && !usable && (reserve + fieldCores >= need)
        const unusable = !usable && !usableField

        let targetable = false
        let activeIndex = index
        if (handChoiceIndices) {
            const tIdx = g.indices.find(idx => handChoiceIndices.has(idx))
            if (tIdx !== undefined) {
                targetable = true
                activeIndex = tIdx
            }
        }

        const el = document.createElement("div")
        el.className = "card"
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        el.dataset.handIndex = String(activeIndex)
        el.dataset.cardId = cardId
        
        if (usable) el.classList.add("usable", "clickable")
        else if (usableField) {
            el.classList.add("usable-field", "clickable")
            const badge = document.createElement("div")
            badge.className = "field-req-badge"
            badge.textContent = "盤面コア必要"
            el.appendChild(badge)
        }
        else el.classList.add("unusable")

        if (targetable) {
            el.classList.add("targetable", "clickable")
            el.classList.remove("unusable")
        }

        // 召喚・配置・マジック使用のために選択されたカードをハイライト
        const selectedHandIndex =
            ui.paying?.handIndex ??
            ui.summonLevelSelect?.handIndex ??
            ui.targeting?.handIndex ?? null
        if (selectedHandIndex !== null && g.indices.includes(selectedHandIndex)) {
            el.classList.add("selected")
        }

        // 支払いモードで「破棄してコストに充てる」ために選んだ手札（BS08ビクティム）。
        // 手札は同名カードをまとめて表示しているので、この束から何枚選ばれているかを出す
        if (ui.paying !== null) {
            const picked = g.indices.filter((i) => ui.paying!.discardHandIndices.includes(i)).length
            if (picked > 0) {
                el.classList.add("pay-discard")
                const badge = document.createElement("div")
                badge.className = "pay-discard-badge"
                badge.textContent = `🗑${picked}`
                el.appendChild(badge)
            }
            // 破棄に選べる手札（＝召喚するカード自身以外）はクリックできると分かるようにする
            if (payingAltPay(view, ui.paying).kind === "handDiscard" && !g.indices.includes(ui.paying.handIndex)) {
                el.classList.add("clickable")
                el.classList.remove("unusable")
            }
        }

        const costBadge = document.createElement("div")
        costBadge.className = "cost-badge"
        if (cost < m.cost) {
            costBadge.classList.add("discounted")
            costBadge.innerHTML = `<span class="original-cost">${m.cost}</span><span class="current-cost">${cost}</span>`
        } else {
            costBadge.textContent = String(cost)
        }
        el.appendChild(costBadge)

        const typeLabel =
            CARD_TYPE_LABELS[m.type]

        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        el.appendChild(name)

        const reductionCounts: Record<string, number> = {}
        for (const c of m.reduction) {
            reductionCounts[c] = (reductionCounts[c] || 0) + 1
        }
        const reductionText = Object.entries(reductionCounts)
            .map(([c, count]) => `${COLOR_LABELS[c as keyof typeof COLOR_LABELS]}${count}`)
            .join("")

        const stats = document.createElement("div")
        stats.className = "stats"
        stats.textContent = `${m.colors.map((c) => COLOR_LABELS[c]).join("・")}/${typeLabel}`
        el.appendChild(stats)

        if (reductionText) {
            const reductionEl = document.createElement("div")
            reductionEl.className = "stats"
            reductionEl.textContent = `軽減:${reductionText}`
            el.appendChild(reductionEl)
        }

        if (m.levels.length > 0) {
            const bp = document.createElement("div")
            bp.className = "stats"
            bp.innerHTML = m.levels
                .filter((l) => l.bp > 0)
                .map((l) => `Lv${l.level}(${l.cores}):${l.bp}`)
                .join("<br>")
            el.appendChild(bp)
        }

        if (!m.effect) {
            const vanilla = document.createElement("div")
            vanilla.className = "stats"
            vanilla.style.fontStyle = "italic"
            vanilla.style.color = "var(--text-muted)"
            vanilla.textContent = "（効果なし）"
            el.appendChild(vanilla)
        }

        if (g.count > 1) {
            const badge = document.createElement("div")
            badge.className = "count-badge"
            badge.textContent = `x${g.count}`
            el.appendChild(badge)
        }

        handEl.appendChild(el)
    })
}

function renderBattle(view: GameView): void {
    const el = $("battle-info")
    if (!view.battle) {
        el.classList.add("hidden")
        return
    }
    el.classList.remove("hidden")

    const attackerPid = view.turnPlayer
    const attacker = view.players[attackerPid].field.spirits.find(
        (s) => s.instanceId === view.battle?.attackerInstanceId,
    )
    if (!attacker) {
        el.textContent = "バトル解決中…"
        return
    }
    const m = master(attacker.cardId)
    const bp = effectiveBp(view, attackerPid, attacker)
    const isDefender = view.you !== attackerPid
    const hasPriority = view.priorityPlayer === view.you
    // ブロック宣言済みか（宣言後はフラッシュが再オープンされる）
    const blocked = !!view.battle.blockerInstanceId

    // ブロッカーの名前・BP（ブロック宣言後のみ算出。相手陣営のフィールドから探す）
    let blockerText = ""
    if (blocked) {
        const defenderPid: PlayerId = attackerPid === "p1" ? "p2" : "p1"
        const blocker = view.players[defenderPid].field.spirits.find(
            (s) => s.instanceId === view.battle?.blockerInstanceId,
        )
        if (blocker) {
            const bm = master(blocker.cardId)
            const blockerBp = effectiveBp(view, defenderPid, blocker)
            blockerText = ` ブロッカー: ${bm.name}（BP${blockerBp}）。`
        }
    }

    let message: string
    if (blocked) {
        // ブロック宣言後の追加フラッシュ
        if (isDefender) {
            if (view.isFlashTiming && hasPriority) {
                message = `⚔ ${m.name}（BP${bp}）をブロック宣言中。${blockerText}追加でフラッシュマジックを使うか「パス」してください。`
            } else {
                message = `⚔ ${m.name}（BP${bp}）をブロック宣言中。${blockerText}相手の対応を待っています…`
            }
        } else {
            if (view.isFlashTiming && hasPriority) {
                message = `⚔ ${m.name}（BP${bp}）はブロックされました。${blockerText}フラッシュマジックを使うか「パス」してください。`
            } else {
                message = `⚔ ${m.name}（BP${bp}）はブロックされました。${blockerText}相手の対応を待っています…`
            }
        }
    } else if (isDefender) {
        if (view.isFlashTiming && !hasPriority) {
            message = `⚔ ${m.name}（BP${bp}）がアタック中。相手がフラッシュの優先権を持っています…`
        } else if (view.isFlashTiming) {
            message = `⚔ ${m.name}（BP${bp}）がアタック！ フラッシュマジックを使うか「パス」してください。パス後にブロック／「ライフで受ける」を選べます。`
        } else {
            message = `⚔ ${m.name}（BP${bp}）がアタック！ フラッシュ終了。ブロックするスピリットを選ぶか「ライフで受ける」を押してください。`
        }
    } else {
        if (view.isFlashTiming && hasPriority) {
            message = `⚔ ${m.name}（BP${bp}）でアタック中。フラッシュの優先権があります。マジックを使うか「パス」してください。`
        } else {
            message = `⚔ ${m.name}（BP${bp}）でアタック中。相手の対応を待っています…`
        }
    }

    // ディバインチェイン等でフラッシュ封印中の場合、封じられている側の視点で追記
    if (view.battle.flashLockedPlayer === view.you) {
        message += " あなたはフラッシュ封印中（手札のカードを使用できない）。"
    } else if (view.battle.flashLockedPlayer !== null) {
        message += " 相手はフラッシュ封印中（手札のカードを使用できない）。"
    }

    el.textContent = message
}

// ロビー側の表示制御
export function showWaiting(): void {
    show("waiting-message", true)
    // 待機中はボタンの文言を「参加を取り消す」に変えて残す
    const joinBtn = document.getElementById("join-btn")
    if (joinBtn) {
        joinBtn.textContent = "参加を取り消す"
        joinBtn.classList.add("cancel-mode")
    }
}

export function hideWaiting(): void {
    show("waiting-message", false)
    // ボタンの文言を元に戻す
    const joinBtn = document.getElementById("join-btn")
    if (joinBtn) {
        joinBtn.textContent = "対戦ルームに入る"
        joinBtn.classList.remove("cancel-mode")
    }
}

export function showToast(message: string): void {
    const toast = $("toast")
    toast.textContent = message
    toast.classList.remove("hidden")
    window.setTimeout(() => toast.classList.add("hidden"), 2500)
}

// ---- 効果テキストのツールチップ（PC: ホバー / スマホ: 長押し） ----
// カード内の .effect-text は高さ制限で見切れるため、カード全体にカーソルを合わせると
// カード名＋効果全文をカードの上（入らなければ下）に重ねて表示する。
// カードは再描画のたびに作り直されるため、document への委譲で拾う。

export function setupEffectTooltip(): void {
    const tip = document.createElement("div")
    tip.id = "effect-tooltip"
    tip.classList.add("hidden")
    document.body.appendChild(tip)

    const showFor = (card: HTMLElement): void => {
        const cardId = card.dataset.cardId
        if (!cardId) return
        const m = master(cardId)
        
        tip.innerHTML = ""
        const titleArea = document.createElement("div")
        titleArea.style.display = "flex"
        titleArea.style.alignItems = "center"
        titleArea.style.gap = "8px"
        titleArea.style.marginBottom = "6px"
        titleArea.style.borderBottom = "1px solid #333"
        titleArea.style.paddingBottom = "4px"

        const title = document.createElement("div")
        title.className = "tooltip-name"
        title.textContent = m.name
        title.style.margin = "0"
        title.style.borderBottom = "none"
        title.style.paddingBottom = "0"
        titleArea.appendChild(title)
        tip.appendChild(titleArea)
        
        if (m.family && m.family.length > 0) {
            const fam = document.createElement("div")
            fam.className = "tooltip-family"
            fam.textContent = "系統: " + m.family.join(" / ")
            fam.style.fontSize = "11px"
            fam.style.color = "var(--text-muted)"
            fam.style.marginBottom = "6px"
            tip.appendChild(fam)
        }
        
        const costArea = document.createElement("div")
        costArea.style.display = "flex"
        costArea.style.gap = "8px"
        costArea.style.alignItems = "center"
        costArea.style.marginBottom = "8px"
        costArea.style.fontSize = "12px"
        
        const costEl = document.createElement("div")
        costEl.textContent = `コスト: ${m.cost}`
        costArea.appendChild(costEl)

        const redEl = document.createElement("div")
        redEl.style.display = "flex"
        redEl.style.alignItems = "center"
        redEl.style.gap = "2px"
        redEl.textContent = `軽減: `
        if (m.reduction.length === 0) {
            redEl.textContent += "なし"
        } else {
            m.reduction.forEach(r => {
                const icon = document.createElement("span")
                icon.className = `sym-icon bg-${r}`
                icon.dataset.colorLabel = COLOR_SYMBOLS[r] || ""
                redEl.appendChild(icon)
            })
        }
        costArea.appendChild(redEl)

        const symbolEl = document.createElement("div")
        symbolEl.style.display = "flex"
        symbolEl.style.alignItems = "center"
        symbolEl.style.gap = "2px"
        symbolEl.textContent = `シンボル: `
        if (m.symbol && m.symbol.length > 0) {
            m.symbol.forEach(symColor => {
                const icon = document.createElement("span")
                icon.className = `sym-icon bg-${symColor}`
                symbolEl.appendChild(icon)
            })
        } else {
            symbolEl.textContent += "なし"
        }
        costArea.appendChild(symbolEl)
        tip.appendChild(costArea)
        
        if (m.levels && m.levels.length > 0) {
            const lvArea = document.createElement("div")
            lvArea.style.marginBottom = "8px"
            lvArea.style.fontSize = "11px"
            lvArea.style.color = "#94a3b8"
            
            m.levels.forEach(lv => {
                const lvLine = document.createElement("div")
                let text = `Lv${lv.level} (維持コア${lv.cores})`
                if (m.type === "spirit" && lv.bp !== undefined) {
                    text += ` BP ${lv.bp}`
                }
                lvLine.textContent = text
                lvArea.appendChild(lvLine)
            })
            tip.appendChild(lvArea)
        }
        
        if (m.effect) {
            // 行頭が「Lv1」「Lv2」「Lv3」「フラッシュ」の行は強調表示する（innerHTMLのためエスケープ必須）
            const eff = document.createElement("div")
            eff.innerHTML = m.effect
                .split("\n")
                .map((line) => {
                    const escaped = escapeHtml(line)
                    const isHighlight = /^(Lv[123]|フラッシュ)/.test(line)
                    return `<div class="tooltip-effect-line${isHighlight ? " tooltip-effect-highlight" : ""}">${escaped}</div>`
                })
                .join("")
            tip.appendChild(eff)
        } else {
            const vanilla = document.createElement("div")
            vanilla.textContent = "（効果なし）"
            vanilla.style.fontStyle = "italic"
            vanilla.style.color = "var(--text-muted)"
            tip.appendChild(vanilla)
        }
        
        tip.classList.remove("hidden")
        // 位置決め: カードの上に出し、画面上端にかかるならカードの下へ。左右は画面内へクランプ
        const rect = card.getBoundingClientRect()
        const tipRect = tip.getBoundingClientRect()
        let top = rect.top - tipRect.height - 8
        if (top < 4) top = rect.bottom + 8
        let left = rect.left + rect.width / 2 - tipRect.width / 2
        left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))
        tip.style.top = `${top}px`
        tip.style.left = `${left}px`
    }

    let currentHoverCard: HTMLElement | null = null
    const hide = (): void => {
        tip.classList.add("hidden")
        currentHoverCard = null
    }

    // PC: ホバーで表示・カードから離れたら消す
    document.addEventListener("mouseover", (e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>(".card, .log-card-name")
        if (card && card !== currentHoverCard) {
            currentHoverCard = card
            showFor(card)
        }
    })
    document.addEventListener("mouseout", (e) => {
        const from = (e.target as HTMLElement).closest(".card, .log-card-name")
        const to = (e.relatedTarget as HTMLElement | null)?.closest?.(".card, .log-card-name")
        if (from && from !== to) hide()
    })

    // スマホ: 長押し（500ms）で表示。指を離しても表示は残し、次のタップで消す。
    // 長押し後のタップがカードの操作（アタック等）として誤発火しないよう、直後のクリックを1回握りつぶす
    let pressTimer = 0
    let longPressed = false
    document.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return
        const card = (e.target as HTMLElement).closest<HTMLElement>(".card, .log-card-name")
        window.clearTimeout(pressTimer)
        if (!card) {
            hide()
            return
        }
        pressTimer = window.setTimeout(() => {
            longPressed = true
            showFor(card)
        }, 500)
    })
    const cancelPress = (): void => window.clearTimeout(pressTimer)
    document.addEventListener("pointermove", cancelPress)
    document.addEventListener("pointercancel", cancelPress)
    document.addEventListener("pointerup", cancelPress)
    document.addEventListener(
        "click",
        (e) => {
            if (!longPressed) return
            longPressed = false
            e.preventDefault()
            e.stopPropagation()
        },
        true,
    )
    // 長押しでOSのコンテキストメニュー（テキスト選択等）が出るのを抑止
    document.addEventListener("contextmenu", (e) => {
        if (longPressed) e.preventDefault()
    })
}
