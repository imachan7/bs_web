// サーバー通信、ユーザー操作の受付、状態購読
import type { CardData, GameAction, GameView, PaySource, PlayerId } from "../../server/src/type"
import { DECK_RECIPES, DECK_MIN_SIZE } from "../../data/constants"
import {
    canDirectAttack,
    effectiveCost,
    hasKeyword,
    magicTargetSide,
    master,
    matchesDirectedAttackFilter,
    payableFieldCores,
    payingAltPay,
    render,
    setCardDb,
    setupEffectTooltip,
    showToast,
    showWaiting,
    hideWaiting,
    type UiState,
} from "./renderer"
import { AWAKEN_FROM_RESERVE, OPPONENT_RESERVE_TARGET, canAwakenFromReserve, sokuPayableInstanceIds } from "../../shared/rules"
import { canPayNexusCostByMill, canPaySummonCostByHandDiscard } from "../../shared/cost"
import { canBattleSwapSummon } from "../../shared/summon"

// socket.io クライアントは /socket.io/socket.io.js から読み込まれる
interface SocketLike {
    emit: (event: string, payload?: unknown) => void
    on: (event: string, handler: (payload: any) => void) => void
}

declare const io: () => SocketLike

const socket = io()

let view: GameView | null = null
const ui: UiState = { targeting: null, awakenTarget: null, paying: null, directedAttack: null, summonLevelSelect: null, battleSwapSummon: null }
let activeTrashTab: "mine" | "opp" = "mine"
let activeTegamotoTab: "mine" | "opp" = "mine"
let lastErrorText: string = ""

function send(action: GameAction): void {
    socket.emit("action", action)
}

function renderTrashPanel(view: GameView, tab: "mine" | "opp"): void {
    const trashContent = document.getElementById("trash-content")
    if (!trashContent) return
    trashContent.innerHTML = ""
    
    const pid = tab === "mine" ? view.you : opponentOf(view.you)
    const trash = view.players[pid].trashCards || []
    
    const groupedTrash = new Map<string, number>()
    trash.forEach(cardId => {
        groupedTrash.set(cardId, (groupedTrash.get(cardId) || 0) + 1)
    })
    
    groupedTrash.forEach((count, cardId) => {
        const m = master(cardId)
        const el = document.createElement("div")
        el.className = "card"
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        name.style.fontSize = "10px"
        name.style.whiteSpace = "nowrap"
        name.style.overflow = "hidden"
        name.style.textOverflow = "ellipsis"
        el.appendChild(name)
        
        if (count > 1) {
            const badge = document.createElement("div")
            badge.className = "count-badge"
            badge.textContent = `x${count}`
            el.appendChild(badge)
        }
        
        el.dataset.cardId = cardId // enable tooltip
        trashContent.appendChild(el)
    })
}

function renderTegamotoPanel(view: GameView, tab: "mine" | "opp"): void {
    const tegamotoContent = document.getElementById("tegamoto-content")
    if (!tegamotoContent) return
    tegamotoContent.innerHTML = ""
    
    const pid = tab === "mine" ? view.you : opponentOf(view.you)
    const tegamoto = view.players[pid].tegamoto || []
    
    tegamoto.forEach((cardId, index) => {
        const m = master(cardId)
        const el = document.createElement("div")
        el.className = "card"
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        
        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        name.style.fontSize = "10px"
        name.style.whiteSpace = "nowrap"
        name.style.overflow = "hidden"
        name.style.textOverflow = "ellipsis"
        el.appendChild(name)
        
        el.dataset.cardId = cardId // enable tooltip
        el.dataset.tegamotoIndex = String(index)
        if (tab === "mine" && m.type === "magic") {
            el.classList.add("clickable")
        }
        tegamotoContent.appendChild(el)
    })
}

function rerender(): void {
    if (view) {
        render(view, ui)
        renderTrashPanel(view, activeTrashTab)
        renderTegamotoPanel(view, activeTegamotoTab)
    }
}

// カード種別に応じたアクションを送信する（paySources/targetInstanceId/levelは値がある場合のみキーを含める）
function sendPlay(
    cardType: CardData["type"],
    handIndex: number,
    targetInstanceId?: string,
    paySources?: PaySource[],
    level?: number,
    substituteInstanceId?: string,
    discardHandIndices?: number[],
    millPay?: number,
): void {
    if (cardType === "spirit") {
        send({ 
            type: "summon", 
            handIndex, 
            ...(paySources ? { paySources } : {}), 
            ...(level !== undefined ? { level } : {}),
            ...(substituteInstanceId ? { substituteInstanceId } : {}),
            ...(discardHandIndices ? { discardHandIndices } : {})
        })
    } else if (cardType === "nexus") {
        send({ type: "setNexus", handIndex, ...(paySources ? { paySources } : {}), ...(level !== undefined ? { level } : {}), ...(millPay !== undefined ? { millPay } : {}) })
    } else {
        send({
            type: "castMagic",
            handIndex,
            ...(targetInstanceId ? { targetInstanceId } : {}),
            ...(paySources ? { paySources } : {}),
        })
    }
}

// 軽減後コスト（+維持コア）がリザーブで足りるなら即送信、足りなければ支払いモードを開始する
function tryPlay(handIndex: number, card: CardData, targetInstanceId: string | undefined, level?: number, substituteInstanceId?: string): void {
    if (!view) return
    const cost = effectiveCost(view, view.you, card)
    
    // 入れ替え召喚（substituteInstanceId あり）の場合は強制Lv1（維持コア=minLevelCores）になるためレベル選択をスキップする
    if (level === undefined && substituteInstanceId === undefined && (card.type === "spirit" || card.type === "nexus")) {
        const reserve = view.players[view.you].reserve
        const cardIdForField = view.players[view.you].hand?.[handIndex]
        // コストも置くコアも、リザーブに加えてフィールドのコアで賄える（2026-08-01）ため、
        // 選択肢に出すレベルの判定にもフィールドのコアを含める
        const fieldCores = cardIdForField ? payableFieldCores(view, cardIdForField) : 0
        const affordableLevels = card.levels.filter((l) => reserve + fieldCores >= cost + l.cores)
        
        // If they can afford Lv2 or higher, show level selection
        if (affordableLevels.length > 1) {
            const cardId = view.players[view.you].hand?.[handIndex]
            if (!cardId) return
            ui.targeting = null
            ui.awakenTarget = null
            ui.paying = null
            ui.directedAttack = null
            ui.summonLevelSelect = { handIndex, cardId, ...(targetInstanceId ? { targetInstanceId } : {}) }
            rerender()
            return
        }
        
        // If they can't even afford Lv1 from reserve, affordableLevels.length is 0. 
        // We just fall through and it will enter paying mode for Lv1.
        // If they can afford exactly Lv1, it falls through and sends instantly.
    }
    
    const targetLevel = level || 1
    const lv = card.levels.find((l) => l.level === targetLevel)
    const maintain = card.type === "magic" ? 0 : (lv ? lv.cores : 0)
    const reserve = view.players[view.you].reserve

    // 栄光の表彰台Lv1：ネクサスの配置コストは、コアで足りない分をデッキ破棄で払える。
    // サーバーが不足分を自動でデッキ破棄に回すので、ここでは「払えるか」の判定だけ揃える
    // （判定を揃えないと、サーバーが受け付ける配置をクライアントが支払いモードに入れてしまう）
    const millPayable =
        card.type === "nexus" && canPayNexusCostByMill(view, view.you)
            ? Math.min(cost, view.players[view.you].deckCount)
            : 0

    // BS08ビクティム：スピリットの召喚コストは、コアで足りない分を手札破棄で払える。
    // **召喚するカード自身は破棄に使えない**ので手札枚数から1枚引く
    const handDiscardPayable =
        card.type === "spirit" && canPaySummonCostByHandDiscard(view, view.you)
            ? Math.min(cost, Math.max(0, view.players[view.you].handCount - 1))
            : 0

    // 代替コスト（手札破棄／デッキ破棄）が使えるなら、**コアが足りていても支払いモードへ入る**。
    // 「すべて、または一部を」払えるカードなので、どこまで代替で払うかはプレイヤーが選ぶ
    // （そのまま確定すれば従来どおり全額コア払いになる）
    const altAvailable = millPayable > 0 || handDiscardPayable > 0
    if (!altAvailable && reserve >= cost + maintain) {
        sendPlay(card.type, handIndex, targetInstanceId, undefined, level, substituteInstanceId)
        return
    }
    // コアが足りない、または代替コストを選べる → 支払いモードを開始（他のモードは排他的に解除する）
    ui.targeting = null
    ui.awakenTarget = null
    ui.summonLevelSelect = null
    ui.battleSwapSummon = null
    ui.paying = { 
        handIndex, 
        ...(targetInstanceId ? { targetInstanceId } : {}), 
        assigned: {}, 
        discardHandIndices: [],
        millPay: 0,
        ...(level !== undefined ? { level } : {}),
        ...(substituteInstanceId ? { substituteInstanceId } : {})
    }
    rerender()
}

// 支払いモードの内容を確定して送信する。代替コスト（手札破棄／デッキ破棄）も一緒に送る
function submitPaying(): void {
    if (!view || !ui.paying) return
    const pay = ui.paying
    const cardId = view.players[view.you].hand?.[pay.handIndex]
    if (cardId === undefined) {
        ui.paying = null
        rerender()
        return
    }
    const card = master(cardId)
    const paySources: PaySource[] = Object.entries(pay.assigned).map(
        ([id, count]) => ({ instanceId: id, count }),
    )
    sendPlay(
        card.type,
        pay.handIndex,
        pay.targetInstanceId,
        paySources.length > 0 ? paySources : undefined,
        pay.level,
        pay.substituteInstanceId,
        pay.discardHandIndices.length > 0 ? pay.discardHandIndices : undefined,
        pay.millPay > 0 ? pay.millPay : undefined,
    )
    ui.paying = null
}

// 支払いモード中に、代替コストの支払い量を1つ増減する。
// 手札破棄（ビクティム）は「どの手札か」を選ぶので、増やす操作は手札クリック側で行う
function changeAltPay(delta: number): void {
    if (!view || !ui.paying) return
    const alt = payingAltPay(view, ui.paying)
    if (alt.kind === "mill") {
        ui.paying.millPay = Math.max(0, Math.min(alt.max, ui.paying.millPay + delta))
    } else if (alt.kind === "handDiscard" && delta < 0) {
        ui.paying.discardHandIndices.pop()
    }
    rerender()
}

// 支払いモード中に、手札1枚を「破棄して払う」対象として選ぶ／外す（BS08ビクティム）
function toggleDiscardPay(handIndex: number): void {
    if (!view || !ui.paying) return
    const pay = ui.paying
    if (handIndex === pay.handIndex) return // 召喚するカード自身は破棄に使えない
    const alt = payingAltPay(view, pay)
    if (alt.kind !== "handDiscard") return
    const at = pay.discardHandIndices.indexOf(handIndex)
    if (at !== -1) {
        pay.discardHandIndices.splice(at, 1)
    } else if (pay.discardHandIndices.length < alt.max) {
        pay.discardHandIndices.push(handIndex)
    }
    rerender()
}

// ---- サーバーからのイベント ----

socket.on("joined", () => {
    showWaiting()
})

socket.on("joinCancelled", () => {
    hideWaiting()
})

// ---- ランダムマッチのイベント ----

socket.on("matchQueued", (payload: { waiting: number }) => {
    // ボタンを隠して待機状態を表示する
    const btn = document.getElementById("random-match-btn")
    const status = document.getElementById("random-match-status")
    const count = document.getElementById("random-match-count")
    if (btn) btn.classList.add("hidden")
    if (status) status.classList.remove("hidden")
    if (count) count.textContent = String(payload.waiting)
})

socket.on("matchWaiting", (payload: { waiting: number }) => {
    const count = document.getElementById("random-match-count")
    if (count) count.textContent = String(payload.waiting)
})

socket.on("matchCancelled", () => {
    const btn = document.getElementById("random-match-btn")
    const status = document.getElementById("random-match-status")
    if (btn) btn.classList.remove("hidden")
    if (status) status.classList.add("hidden")
})

socket.on("matchFound", () => {
    showToast("対戦相手が見つかりました")
    const btn = document.getElementById("random-match-btn")
    const status = document.getElementById("random-match-status")
    if (btn) btn.classList.remove("hidden")
    if (status) status.classList.add("hidden")
})

socket.on("state", (v: GameView) => {
    view = v
    ui.targeting = null // 状態が変わったら対象選択はリセット
    ui.awakenTarget = null // 覚醒モードもリセット（続けて移す場合は再度バッジをクリック）
    ui.paying = null // 支払いモードもリセット
    ui.directedAttack = null // 指定アタックの対象選択モードもリセット
    ui.summonLevelSelect = null // レベル選択もリセット
    ui.battleSwapSummon = null // 入れ替え召喚の対象選択もリセット
    rerender()
})

socket.on("errorMessage", (message: string) => {
    lastErrorText = message
    showToast(message)
})

socket.on("opponentLeft", () => {
    showToast("相手が退出しました")
})

// ---- 手札クリック ----

// pendingChoiceが自分宛かつkind:"card"・cardZone:"hand"、クリックしたhandIndexが候補内なら
// resolveChoice を送信する。送信したら true を返す（呼び出し側はそこで処理を打ち切る）
function tryResolveCardChoice(handIndex: number): boolean {
    if (!view || !view.pendingChoice) return false
    if (view.pendingChoice.pid !== view.you) return false
    if (view.pendingChoice.kind !== "card" || view.pendingChoice.cardZone !== "hand") return false
    if (!(view.pendingChoice.cardIndices ?? []).includes(handIndex)) return false
    send({ type: "resolveChoice", cardIndex: handIndex })
    return true
}

function onHandClick(handIndex: number): void {
    if (!view) return
    // 選択待ち中は通常の手札操作（召喚等）をすべて抑止する。自分宛のkind:"card"・cardZone:"hand"
    // なら選択を送信し、それ以外（相手宛や別kind）は何もしない
    if (view.pendingChoice) {
        tryResolveCardChoice(handIndex)
        return
    }
    if (ui.awakenTarget !== null) return // 覚醒モード中は手札操作を抑止
    if (ui.paying !== null) {
        // 支払いモード中は新規の手札操作を抑止するが、
        // 代替コストで「破棄する手札を選ぶ」場合だけはクリックを受け付ける（BS08ビクティム）
        toggleDiscardPay(handIndex)
        return
    }
    if (ui.directedAttack !== null) return // 指定アタックの対象選択モード中は手札操作を抑止
    const hand = view.players[view.you].hand
    const cardId = hand?.[handIndex]
    if (cardId === undefined) return
    const card: CardData = master(cardId)

    const myTurn = view.turnPlayer === view.you
    const myMainFree = myTurn && view.phase === "main" && !view.battle
    // フラッシュ中で自分が優先権を持つとき（攻撃側・防御側どちらでも使用可）
    const inFlash =
        !!view.battle && view.isFlashTiming && view.priorityPlayer === view.you

    if (myMainFree) {
        if (card.type === "spirit") {
            tryPlay(handIndex, card, undefined)
            return
        }
        if (card.type === "nexus") {
            tryPlay(handIndex, card, undefined)
            return
        }
    }

    // 神速召喚または入れ替え召喚（フラッシュで手札のスピリットを使用）
    if (card.type === "spirit" && inFlash) {
        const swapOpt = canBattleSwapSummon(view, view.you, handIndex)
        const tempSoku = (view.players[view.you].tempHandKeywordGrants ?? []).some(
            (g) => g.cardId === cardId && g.keyword === "soku",
        )
        const canSoku = hasKeyword(cardId, "soku") || tempSoku

        // 現在「神速」と「入れ替え召喚」を両方持つカードは存在しないため、排他的に処理する
        if (swapOpt) {
            ui.battleSwapSummon = { handIndex, substituteInstanceIds: swapOpt.substituteInstanceIds }
            rerender()
            return
        }

        if (canSoku) {
            tryPlay(handIndex, card, undefined)
            return
        }
    }

    if (card.type === "magic" && (myMainFree || (inFlash && card.flash))) {
        // メイン効果がなければフラッシュ効果を使う（doCastMagic と同じ判定）
        const hasMain = card.effects.some(
            (e) => e.kind === "magic" && e.timing === "main",
        )
        const timing: "main" | "flash" =
            inFlash || !hasMain ? "flash" : "main"
        const side = magicTargetSide(card, timing)
        if (side) {
            ui.targeting = { handIndex, side }
            rerender()
        } else {
            tryPlay(handIndex, card, undefined)
        }
    }
}

// ---- フィールドクリック ----

// pendingChoiceが自分宛かつクリックしたinstanceIdが候補内なら resolveChoice を送信する。
// 送信したら true を返す（呼び出し側はそこで処理を打ち切る）
function tryResolveChoice(instanceId: string): boolean {
    if (!view || !view.pendingChoice) return false
    if (view.pendingChoice.pid !== view.you) return false
    if (!view.pendingChoice.candidates.includes(instanceId)) return false
    send({ type: "resolveChoice", instanceId })
    return true
}

function onMySpiritClick(instanceId: string): void {
    if (!view) return
    if (tryResolveChoice(instanceId)) return

    // 指定アタックの対象選択モード中：自分のスピリットのクリックは無視する
    // （対象は相手スピリット。プレイヤーへアタックは専用ボタン、キャンセルは対象選択をやめるボタン）
    if (ui.directedAttack !== null) return

    // 支払いモード中：クリックしたスピリットに1個割り当てる
    if (ui.paying !== null) {
        assignPayCore(instanceId)
        return
    }

    // 覚醒モード中：クリックしたスピリットからコアを1個移す（移動先の再クリックでキャンセル）
    if (ui.awakenTarget !== null) {
        if (instanceId === ui.awakenTarget) {
            ui.awakenTarget = null
            rerender()
            return
        }
        send({
            type: "awaken",
            instanceId: ui.awakenTarget,
            fromInstanceId: instanceId,
            count: 1,
        })
        ui.awakenTarget = null
        return
    }

    // 入れ替え召喚の対象選択モード中
    if (ui.battleSwapSummon !== null) {
        if (ui.battleSwapSummon.substituteInstanceIds.includes(instanceId)) {
            const handIndex = ui.battleSwapSummon.handIndex
            const cardId = view.players[view.you].hand?.[handIndex]
            ui.battleSwapSummon = null
            if (cardId !== undefined) {
                tryPlay(handIndex, master(cardId), undefined, undefined, instanceId)
            }
        }
        return
    }

    if (ui.targeting?.side === "self") {
        const handIndex = ui.targeting.handIndex
        const cardId = view.players[view.you].hand?.[handIndex]
        ui.targeting = null
        if (cardId !== undefined) {
            tryPlay(handIndex, master(cardId), instanceId)
        }
        return
    }

    const myTurn = view.turnPlayer === view.you
    const isDefender = !!view.battle && !myTurn
    // ブロック宣言はフラッシュタイミングの外（フラッシュ①終了後）でのみ行える
    const canDefend = isDefender && !view.isFlashTiming

    if (canDefend && !view.battle?.blockerInstanceId) {
        send({ type: "block", instanceId })
        return
    }

    if (myTurn && view.phase === "attack" && !view.battle) {
        const inst = view.players[view.you].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        const filter = inst ? canDirectAttack(view, view.you, inst) : null
        const oppPid = opponentOf(view.you)
        const oppSpirits = view.players[oppPid].field.spirits
        const currentView = view
        const hasValidTarget =
            filter !== null && oppSpirits.some((s) => matchesDirectedAttackFilter(filter, s, currentView, oppPid))
        if (filter !== null && hasValidTarget) {
            // 指定アタック可能で、条件に合う相手がいる：対象選択モードを開始する
            ui.directedAttack = { attackerInstanceId: instanceId, filter }
            rerender()
            return
        }
        send({ type: "attack", instanceId })
    }
}

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// 支払いモード中、指定スピリットにコアを1個割り当てる。合計が必要数に達したら自動送信する。
function assignPayCore(instanceId: string): void {
    if (!view || !ui.paying) return
    const pay = ui.paying
    const player = view.players[view.you]
    const inst =
        player.field.spirits.find((s) => s.instanceId === instanceId) ??
        player.field.nexuses.find((n) => n.instanceId === instanceId)
    if (!inst) return
    const cardId = player.hand?.[pay.handIndex]
    if (cardId === undefined) {
        ui.paying = null
        rerender()
        return
    }
    const card = master(cardId)
    // 【神速】召喚は基礎ルールではリザーブからのみ支払える。
    // sokuPaySourceGrant（旋風渦巻く渓谷Lv2／甲殻戦士ロングホーンLv2-3）が許可した対象のみ例外
    // （判定はサーバー validateSummon と同一の共有実装）
    if (view.isFlashTiming && card.type === "spirit" && hasKeyword(cardId, "soku")) {
        if (!sokuPayableInstanceIds(view, view.you).has(instanceId)) return
    }
    const cost = effectiveCost(view, view.you, card)
    const targetLevel = pay.level || 1
    const lv = card.levels.find((l) => l.level === targetLevel)
    const maintain = card.type === "magic" ? 0 : (lv ? lv.cores : 0)
    const assignedTotal = Object.values(pay.assigned).reduce((a, b) => a + b, 0)
    const already = pay.assigned[instanceId] ?? 0
    // 代替コスト（手札破棄／デッキ破棄）で肩代わりしたぶん、コアで払う額が減る
    const alt = payingAltPay(view, pay)
    const need = cost + maintain - Math.min(alt.used, cost)
    // フィールドのコアはコストにも置くコアにも充当できるため、上限は need
    if (assignedTotal >= need) return // 必要数に到達済み（過払い防止）
    if (already >= inst.cores) return // このスピリットのコアを使い切った
    pay.assigned[instanceId] = already + 1
    const newTotal = assignedTotal + 1
    if (player.reserve + newTotal >= need) {
        // 必要数に達したので送信する（代替コストの選択も submitPaying が一緒に送る）
        submitPaying()
        return
    }
    rerender()
}

function onOppSpiritClick(instanceId: string): void {
    if (!view) return
    if (tryResolveChoice(instanceId)) return
    if (ui.paying !== null) return // v1はスピリット上のコアのみ対応、自分のスピリットのみが支払い元
    if (ui.awakenTarget !== null) return // 覚醒モード中は相手側の操作を抑止
    // 指定アタックの対象選択モード中：フィルタに合う相手スピリットをクリックしたら指定アタックを送信する
    if (ui.directedAttack !== null) {
        const filter = ui.directedAttack.filter
        const oppPid = opponentOf(view.you)
        const target = view.players[oppPid].field.spirits.find(
            (s) => s.instanceId === instanceId,
        )
        if (target && matchesDirectedAttackFilter(filter, target, view, oppPid)) {
            send({
                type: "attack",
                instanceId: ui.directedAttack.attackerInstanceId,
                targetSpiritInstanceId: instanceId,
            })
            ui.directedAttack = null
        }
        return
    }
    if (ui.targeting?.side === "opponent") {
        const handIndex = ui.targeting.handIndex
        const cardId = view.players[view.you].hand?.[handIndex]
        ui.targeting = null
        if (cardId !== undefined) {
            tryPlay(handIndex, master(cardId), instanceId)
        }
    }
}

// ---- カスタムデッキ（デッキビルダーの localStorage 保存分） ----

const DECK_STORAGE_KEY = "bsweb:decks"
const CUSTOM_DECK_PREFIX = "custom:"

// デッキビルダー（deck.ts）と同じ保存フォーマット
interface SavedDeck {
    name: string
    cards: Record<string, number>
    updatedAt: string
}

// デッキ名 → カードリスト（cardId -> 枚数）。ページ表示時に読み込む
const customDecks = new Map<string, Record<string, number>>()

function loadSavedDecks(): SavedDeck[] {
    try {
        const raw = localStorage.getItem(DECK_STORAGE_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(
            (d): d is SavedDeck =>
                typeof d === "object" &&
                d !== null &&
                typeof d.name === "string" &&
                typeof d.cards === "object" &&
                d.cards !== null,
        )
    } catch {
        return []
    }
}

// deck-select に保存済みデッキを「カスタム: <デッキ名>」として追加する（4色プリセットの後ろ）
function populateBuiltinDecks(selectId = "deck-select"): void {
    const select = byId(selectId) as HTMLSelectElement
    for (const [key, recipe] of Object.entries(DECK_RECIPES)) {
        const option = document.createElement("option")
        option.value = key
        option.textContent = recipe.label
        select.appendChild(option)
    }
}

function populateCustomDecks(selectId = "deck-select"): void {
    const select = byId(selectId) as HTMLSelectElement
    // 既存のカスタムデッキをクリア
    const options = Array.from(select.options)
    for (const opt of options) {
        if (opt.value.startsWith(CUSTOM_DECK_PREFIX)) {
            select.removeChild(opt)
        }
    }
    if (selectId === "deck-select") {
        customDecks.clear()
    }

    for (const saved of loadSavedDecks()) {
        if (selectId === "deck-select") {
            customDecks.set(saved.name, saved.cards)
        }
        let total = 0
        for (const count of Object.values(saved.cards)) total += count

        const option = document.createElement("option")
        option.value = `${CUSTOM_DECK_PREFIX}${saved.name}`
        if (total >= DECK_MIN_SIZE) {
            option.textContent = `カスタム: ${saved.name}（${total}枚）`
        } else {
            option.textContent = `カスタム: ${saved.name}（${total}枚のため使用不可）`
            option.disabled = true
        }
        select.appendChild(option)
    }
}

// ロビー・AI対戦用の全デッキセレクトを一括で構築する
const ALL_DECK_SELECT_IDS = ["deck-select", "ai-my-deck-select", "ai-opp-deck-select"]

function populateAllBuiltinDecks(): void {
    for (const id of ALL_DECK_SELECT_IDS) populateBuiltinDecks(id)
}

function populateAllCustomDecks(): void {
    for (const id of ALL_DECK_SELECT_IDS) populateCustomDecks(id)
}

window.addEventListener("storage", (e) => {
    if (e.key === DECK_STORAGE_KEY) {
        populateAllCustomDecks()
    }
})

// ---- DOM イベント登録 ----

function byId(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`要素が見つかりません: #${id}`)
    return el
}

function closestData(
    e: Event,
    attr: string,
): HTMLElement | null {
    return (e.target as HTMLElement).closest<HTMLElement>(`[${attr}]`)
}

// ---- お知らせ（Gitコミット履歴から自動取得） ----

interface ChangelogEntry {
    date: string    // "2026-08-09"（--date=short）
    message: string // "[release:fix] ○○を直した"（プレフィックス込みの生メッセージ）
    hash: string    // "9170e7c"（短縮ハッシュ）
}

// コミットメッセージからカテゴリと表示テキストを抽出する
// 例: "[release:fix] ○○を修正" → { category: "fix", text: "○○を修正" }
//     "[release] ○○を追加"     → { category: "update", text: "○○を追加" }
const CATEGORY_MAP: Record<string, { label: string; cssClass: string }> = {
    fix:    { label: "バグ修正",  cssClass: "badge fix" },
    ui:     { label: "UI改善",    cssClass: "badge update" },
    new:    { label: "機能追加",  cssClass: "badge new" },
    info:   { label: "お知らせ",  cssClass: "badge info" },
    update: { label: "更新",      cssClass: "badge update" },
}

function parseReleaseMessage(message: string): { category: string; text: string } {
    // [release:カテゴリ] テキスト
    const match = message.match(/^\[release(?::(\w+))?\]\s*(.*)$/)
    if (!match) return { category: "update", text: message }
    const category = match[1] ?? "update"
    const text = match[2] ?? ""
    return { category, text }
}

function loadChangelog(): void {
    const container = document.getElementById("announcement-list")
    if (!container) return

    fetch("/api/changelog")
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<ChangelogEntry[]>
        })
        .then(entries => {
            container.textContent = ""

            if (entries.length === 0) {
                const empty = document.createElement("div")
                empty.className = "announcement-loading"
                empty.textContent = "更新情報はありません"
                container.appendChild(empty)
                return
            }

            for (const entry of entries) {
                const item = document.createElement("div")
                item.className = "announcement-item"

                const meta = document.createElement("div")
                meta.className = "announcement-meta"

                const dateEl = document.createElement("span")
                dateEl.className = "date"
                dateEl.textContent = entry.date.replace(/-/g, ".")
                meta.appendChild(dateEl)

                const parsed = parseReleaseMessage(entry.message)
                const catInfo = CATEGORY_MAP[parsed.category] ?? CATEGORY_MAP.update!

                const badge = document.createElement("span")
                badge.className = catInfo.cssClass
                badge.textContent = catInfo.label
                meta.appendChild(badge)

                item.appendChild(meta)

                const text = document.createElement("p")
                text.className = "announcement-text"
                text.textContent = parsed.text
                item.appendChild(text)

                container.appendChild(item)
            }
        })
        .catch(() => {
            if (!container) return
            container.textContent = ""
            const err = document.createElement("div")
            err.className = "announcement-loading"
            err.textContent = "更新情報の取得に失敗しました"
            container.appendChild(err)
        })
}

async function init(): Promise<void> {
    // カードデータは弾ごとに分割されているため、結合済みを返すサーバーのAPIから取る
    const cards = (await (await fetch("/api/cards")).json()) as CardData[]
    setCardDb(cards)
    populateAllBuiltinDecks()
    populateAllCustomDecks()
    setupEffectTooltip()

    // お知らせ（Gitコミット履歴）を非同期で取得・表示
    loadChangelog()

    byId("join-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const roomId =
            (byId("room-input") as HTMLInputElement).value.trim() || "room1"
        const deck = (byId("deck-select") as HTMLSelectElement).value
        if (deck.startsWith(CUSTOM_DECK_PREFIX)) {
            // カスタムデッキ: カードリスト（cardId -> 枚数）を付けて送信する
            const deckName = deck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            socket.emit("join", { roomId, name, deckCards })
        } else {
            socket.emit("join", { roomId, name, deck })
        }
    })

    // ---- ランダムマッチ ----
    byId("random-match-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const deck = (byId("deck-select") as HTMLSelectElement).value
        if (deck.startsWith(CUSTOM_DECK_PREFIX)) {
            const deckName = deck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            socket.emit("randomMatch", { name, deckCards })
        } else {
            socket.emit("randomMatch", { name, deck })
        }
    })

    byId("random-match-cancel").addEventListener("click", () => {
        socket.emit("cancelRandomMatch")
    })

    // ---- AI対戦 ----
    byId("start-ai-btn").addEventListener("click", () => {
        const name =
            (byId("name-input") as HTMLInputElement).value.trim() || "プレイヤー"
        const myDeck = (byId("ai-my-deck-select") as HTMLSelectElement).value
        const oppDeck = (byId("ai-opp-deck-select") as HTMLSelectElement).value

        // AI対戦のペイロードを組み立てる
        const payload: Record<string, unknown> = { name }

        // 自分のデッキ
        if (myDeck.startsWith(CUSTOM_DECK_PREFIX)) {
            const deckName = myDeck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            payload.deckCards = deckCards
        } else {
            payload.deck = myDeck
        }

        // AIのデッキ
        if (oppDeck.startsWith(CUSTOM_DECK_PREFIX)) {
            const deckName = oppDeck.slice(CUSTOM_DECK_PREFIX.length)
            const deckCards = customDecks.get(deckName)
            if (!deckCards) {
                showToast(`カスタムデッキが見つかりません: ${deckName}`)
                return
            }
            payload.aiDeckCards = deckCards
        } else {
            payload.aiDeck = oppDeck
        }

        // AIの表示名をデッキ名から生成する
        const oppLabel = oppDeck.startsWith(CUSTOM_DECK_PREFIX)
            ? `AI（${oppDeck.slice(CUSTOM_DECK_PREFIX.length)}）`
            : `AI（${DECK_RECIPES[oppDeck]?.label?.replace(/デッキ（.*/, "") ?? oppDeck}）`
        payload.aiName = oppLabel

        socket.emit("startAi", payload)
    })

    byId("btn-return-lobby").addEventListener("click", () => {
        location.reload() // ページリロードで初期状態（ロビー）へ戻る
    })

    byId("hand").addEventListener("click", (e) => {
        const el = closestData(e, "data-hand-index")
        if (el) onHandClick(Number(el.dataset.handIndex))
    })

    // 覚醒モード中に自分のリザーブをクリックしたら、リザーブからコアを移す
    // （ディノゾールLv2が【覚醒】を「自分のスピリット上か自分のリザーブから」に書き換えている場合のみ有効）
    byId("my-info").addEventListener("click", (e) => {
        if (ui.awakenTarget === null) return
        if (!closestData(e, "data-reserve")) return
        if (!view || !canAwakenFromReserve(view, view.you)) return
        send({
            type: "awaken",
            instanceId: ui.awakenTarget,
            fromInstanceId: AWAKEN_FROM_RESERVE,
            count: 1,
        })
        ui.awakenTarget = null
    })

    byId("my-spirits").addEventListener("click", (e) => {
        // 覚醒バッジが先（カードクリックと区別する）
        const awakenBtn = closestData(e, "data-awaken")
        if (awakenBtn) {
            ui.awakenTarget = String(awakenBtn.dataset.awaken)
            ui.targeting = null // 覚醒モード開始時はマジックの対象選択を解除
            ui.paying = null
            rerender()
            return
        }
        // 起動能力バッジ（覚醒と同様、カードクリックより先に判定）
        const activateBtn = closestData(e, "data-activate")
        if (activateBtn) {
            send({
                type: "activateAbility",
                instanceId: String(activateBtn.dataset.activate),
                effectId: String(activateBtn.dataset.effect),
            })
            return
        }
        // コア移動ボタンが先（カードクリックと区別する）
        const coreBtn = closestData(e, "data-core")
        if (coreBtn) {
            const direction = String(coreBtn.dataset.core)
            const instanceId = String(coreBtn.dataset.instanceId)
            if (direction === "add" || direction === "remove") {
                send({ type: "moveCore", instanceId, direction })
            } else if (direction.startsWith("set-")) {
                const targetCores = parseInt(direction.split("-")[1] || "0", 10)
                const currentCores = parseInt(coreBtn.dataset.currentCores || "0", 10)
                if (targetCores > currentCores) {
                    for (let i = 0; i < targetCores - currentCores; i++) {
                        send({ type: "moveCore", instanceId, direction: "add" })
                    }
                } else if (currentCores > targetCores) {
                    for (let i = 0; i < currentCores - targetCores; i++) {
                        send({ type: "moveCore", instanceId, direction: "remove" })
                    }
                }
            }
            return
        }
        const el = closestData(e, "data-instance-id")
        if (el) onMySpiritClick(String(el.dataset.instanceId))
    })

    byId("opp-spirits").addEventListener("click", (e) => {
        const el = closestData(e, "data-instance-id")
        if (el) onOppSpiritClick(String(el.dataset.instanceId))
    })

    // ネクサスは通常操作の対象外だが、pendingChoiceの候補になる場合と支払いモード中はコア割り当て対象になる
    byId("my-nexuses").addEventListener("click", (e) => {
        // コア移動ボタンが先（カードクリックと区別する）。ネクサスもコアでレベルを上げ下げできる
        const coreBtn = closestData(e, "data-core")
        if (coreBtn) {
            const direction = String(coreBtn.dataset.core)
            const instanceId = String(coreBtn.dataset.instanceId)
            if (direction === "add" || direction === "remove") {
                send({ type: "moveCore", instanceId, direction })
            } else if (direction.startsWith("set-")) {
                const targetCores = parseInt(direction.split("-")[1] || "0", 10)
                const currentCores = parseInt(coreBtn.dataset.currentCores || "0", 10)
                if (targetCores > currentCores) {
                    for (let i = 0; i < targetCores - currentCores; i++) {
                        send({ type: "moveCore", instanceId, direction: "add" })
                    }
                } else if (currentCores > targetCores) {
                    for (let i = 0; i < currentCores - targetCores; i++) {
                        send({ type: "moveCore", instanceId, direction: "remove" })
                    }
                }
            }
            return
        }
        const el = closestData(e, "data-instance-id")
        if (!el) return
        const instanceId = String(el.dataset.instanceId)
        if (tryResolveChoice(instanceId)) return
        if (ui.paying !== null) {
            assignPayCore(instanceId)
            return
        }
    })
    // 相手のリザーブが選択待ちの候補になっているとき（犬人マードック）にクリックで選ぶ
    byId("opp-info").addEventListener("click", (e) => {
        if (!closestData(e, "data-reserve")) return
        tryResolveChoice(OPPONENT_RESERVE_TARGET)
    })

    byId("opp-nexuses").addEventListener("click", (e) => {
        const el = closestData(e, "data-instance-id")
        if (el) tryResolveChoice(String(el.dataset.instanceId))
    })

    byId("btn-attack-phase").addEventListener("click", () =>
        send({ type: "nextPhase" }),
    )
    byId("btn-end-turn").addEventListener("click", () =>
        send({ type: "endTurn" }),
    )
    byId("btn-take-life").addEventListener("click", () =>
        send({ type: "takeLife" }),
    )
    byId("btn-pass").addEventListener("click", () => send({ type: "pass" }))
    // 降参は押し間違えると対戦が終わってしまうため、必ず確認をはさむ
    byId("btn-surrender").addEventListener("click", () => {
        if (!window.confirm("本当に降参しますか？\n相手の勝利になります。")) return
        send({ type: "surrender" })
    })
    byId("chk-pay-to-negate").addEventListener("change", (e) => {
        const checked = (e.target as HTMLInputElement).checked
        send({ type: "setPayToNegate", enabled: checked })
    })
    byId("btn-attack-player").addEventListener("click", () => {
        if (!ui.directedAttack) return
        send({ type: "attack", instanceId: ui.directedAttack.attackerInstanceId })
        ui.directedAttack = null
    })
    byId("btn-confirm-pay").addEventListener("click", () => {
        submitPaying()
        rerender()
    })
    // デッキ破棄での支払い枚数の増減（栄光の表彰台）。ボタンは支払いバナー内に描画される
    byId("targeting-info").addEventListener("click", (e) => {
        const btn = closestData(e, "data-altpay")
        if (!btn) return
        changeAltPay(String(btn.dataset.altpay) === "inc" ? 1 : -1)
    })
    byId("btn-cancel-target").addEventListener("click", () => {
        ui.targeting = null
        ui.awakenTarget = null
        ui.paying = null
        ui.directedAttack = null
        ui.summonLevelSelect = null
        ui.battleSwapSummon = null
        rerender()
    })
    byId("btn-skip-choice").addEventListener("click", () => {
        send({ type: "resolveChoice" })
    })
    byId("choice-options").addEventListener("click", (e) => {
        const optionEl = closestData(e, "data-option")
        if (optionEl) {
            send({ type: "resolveChoice", option: String(optionEl.dataset.option) })
            return
        }
        const cardEl = closestData(e, "data-card-index")
        if (cardEl) {
            send({ type: "resolveChoice", cardIndex: Number(cardEl.dataset.cardIndex) })
            return
        }
        const levelEl = closestData(e, "data-summon-level")
        if (levelEl && ui.summonLevelSelect) {
            const level = Number(levelEl.dataset.summonLevel)
            const { handIndex, cardId, targetInstanceId } = ui.summonLevelSelect
            ui.summonLevelSelect = null
            tryPlay(handIndex, master(cardId), targetInstanceId, level)
            return
        }
    })
    
    byId("btn-toggle-log").addEventListener("click", () => {
        const panel = byId("log-panel")
        panel.classList.toggle("hidden")
    })
    byId("btn-close-log").addEventListener("click", () => {
        byId("log-panel").classList.add("hidden")
    })
    
    byId("btn-bug-report").addEventListener("click", () => {
        // 現在のゲームコンテキストをlocalStorageに保存してバグ報告画面へ渡す
        if (view) {
            const uiMode = ui.targeting ? "targeting" 
                           : ui.awakenTarget ? "awakenTarget" 
                           : ui.paying ? "paying" 
                           : ui.directedAttack ? "directedAttack" 
                           : ui.summonLevelSelect ? "summonLevelSelect" 
                           : "normal"
            const clientContext = {
                phase: view.phase,
                turn: view.turn,
                uiMode: uiMode,
                lastError: lastErrorText
            }
            const bugReportData = {
                gameId: view.gameId,
                you: view.you,
                clientContext
            }
            localStorage.setItem("bs_bug_report_context", JSON.stringify(bugReportData))
        }
        window.open("/bugreport.html", "_blank")
    })
    
    byId("btn-toggle-trash").addEventListener("click", () => {
        byId("trash-panel").classList.toggle("hidden")
        rerender()
    })
    byId("btn-close-trash").addEventListener("click", () => {
        byId("trash-panel").classList.add("hidden")
    })
    byId("tab-my-trash").addEventListener("click", () => {
        activeTrashTab = "mine"
        byId("tab-my-trash").classList.add("active")
        byId("tab-opp-trash").classList.remove("active")
        rerender()
    })
    byId("tab-opp-trash").addEventListener("click", () => {
        activeTrashTab = "opp"
        byId("tab-opp-trash").classList.add("active")
        byId("tab-my-trash").classList.remove("active")
        rerender()
    })

    // 手元 UI
    byId("btn-my-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "mine"
        byId("tab-my-tegamoto").classList.add("active")
        byId("tab-opp-tegamoto").classList.remove("active")
        byId("tegamoto-panel").classList.remove("hidden")
        rerender()
    })
    byId("btn-opp-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "opp"
        byId("tab-opp-tegamoto").classList.add("active")
        byId("tab-my-tegamoto").classList.remove("active")
        byId("tegamoto-panel").classList.remove("hidden")
        rerender()
    })
    byId("btn-close-tegamoto").addEventListener("click", () => {
        byId("tegamoto-panel").classList.add("hidden")
    })
    byId("tab-my-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "mine"
        byId("tab-my-tegamoto").classList.add("active")
        byId("tab-opp-tegamoto").classList.remove("active")
        rerender()
    })
    byId("tab-opp-tegamoto").addEventListener("click", () => {
        activeTegamotoTab = "opp"
        byId("tab-opp-tegamoto").classList.add("active")
        byId("tab-my-tegamoto").classList.remove("active")
        rerender()
    })
    
    // 手元からのマジック使用
    byId("tegamoto-content").addEventListener("click", (e) => {
        if (activeTegamotoTab !== "mine") return
        const cardEl = closestData(e, "data-tegamoto-index")
        if (cardEl) {
            const index = Number(cardEl.dataset.tegamotoIndex)
            send({ type: "castMagic", handIndex: index, fromTegamoto: true })
            byId("tegamoto-panel").classList.add("hidden")
        }
    })
}

void init()
