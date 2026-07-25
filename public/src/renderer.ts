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
import { COLOR_LABELS, PHASE_LABELS } from "../../data/constants"
import { setCardLookup } from "../../shared/cardDb"
import { effectiveCost, hasMagicRestriction, ownFieldSymbolColors } from "../../shared/cost"
import { canBlock, matchesDirectedAttackFilter as sharedMatchesDirectedAttackFilter } from "../../shared/block"
// ルール判定はサーバーと同一の実装を共有する（二重実装によるズレを防ぐ）
import {
    activeConstraints,
    cantActByCost,
    currentLevel,
    effectiveBp,
    hasArmorAgainst,
    hasGlobalConstraint,
    hasKeyword,
    hasMagicImmunity,
    isUntargetableByOpponent,
    instHasColor,
    instHasCost,
    isVanillaCard,
    matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword,
} from "../../shared/rules"
export { activeConstraints, cantActByCost, hasArmorAgainst, hasGlobalConstraint, hasKeyword, instHasCost, instHasColor, isUntargetableByOpponent }

// ---- カードマスターデータ（起動時に /data/cards.json から取得） ----

let DB = new Map<string, CardData>()

export function setCardDb(cards: CardData[]): void {
    DB = new Map(cards.map((c) => [c.cardId, c]))
    // 共有ルール層（shared/）へカードマスタ参照を注入する（サーバーは GameState.getCard を注入）
    setCardLookup(master)
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

// 状態を考慮した色判定（サーバー instHasColor のミラー）
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

// 支払いモードでの残り不足コア数（0なら送信可能）
export function payingRemaining(view: GameView, paying: PayingState): number {
    const hand = view.players[view.you].hand
    const cardId = hand?.[paying.handIndex]
    if (cardId === undefined) return 0
    const card = master(cardId)
    const cost = effectiveCost(view, view.you, card)
    const targetLevel = paying.level || 1
    const lv = card.levels.find((l) => l.level === targetLevel)
    const maintain = card.type === "magic" ? 0 : (lv ? lv.cores : 0)
    const assignedTotal = Object.values(paying.assigned).reduce((a, b) => a + b, 0)
    const need = cost + maintain
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
    if (
        effect.action.type === "destroy" ||
        effect.action.type === "coreRemove" ||
        effect.action.type === "exhaust" ||
        effect.action.type === "destroyExhausted" ||
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
        effect.action.type === "levelUpThisTurn"
    )
        return "self"
    return null
}

// 【覚醒】を持っているか（静的キーワードは現在レベル限定、一時付与・keywordGrant も含む）
export function canAwaken(view: GameView, inst: CardInstance): boolean {
    const { level } = levelOf(inst)
    const staticAwaken = master(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "awaken" &&
            (e.levels === null || e.levels.includes(level)),
    )
    if (staticAwaken) return true
    // 一時付与（スピリットリンク）・継続付与（ディラノス）。覚醒UIは自分のスピリット専用
    return spiritHasKeywordView(view, view.you, inst, "awaken")
}

// 起動能力（kind: "activated"）が今このスピリットで発動可能なら {effectId, cost} を返す。
// フラッシュ中・優先権保持・self がバトル当事者・コスト支払い可能を判定（サーバー validateActivateAbility のミラー）。
export function activatableAbility(
    view: GameView,
    you: PlayerId,
    inst: CardInstance,
): { effectId: string; cost: number } | null {
    if (!view.battle || !view.isFlashTiming) return null
    if (view.priorityPlayer !== you) return null
    const inBattle =
        view.battle.attackerInstanceId === inst.instanceId ||
        view.battle.blockerInstanceId === inst.instanceId
    if (!inBattle) return null
    const { level } = levelOf(inst)
    for (const e of master(inst.cardId).effects) {
        if (e.kind !== "activated") continue
        if (!(e.levels === null || e.levels.includes(level))) continue
        if (view.players[you].reserve < e.cost.reserveToTrash) continue
        return { effectId: e.id, cost: e.cost.reserveToTrash }
    }
    return null
}

// 支払いモード：不足コストをスピリット上のコアで賄うための一時状態
export interface PayingState {
    handIndex: number
    targetInstanceId?: string // マジックで対象選択済みの場合のみ
    level?: number // 召喚レベル指定用
    assigned: Record<string, number> // instanceId -> 割り当てたコア数
}

export interface UiState {
    targeting: { handIndex: number; side: TargetSide } | null
    // 覚醒モード：コアの移動先（覚醒持ちスピリット）の instanceId
    awakenTarget: string | null
    paying: PayingState | null
    // 指定アタックモード：対象選択中のアタッカーと、選べる相手の条件
    directedAttack: { attackerInstanceId: string; filter: "rested" | "singleCore" | "recovered" } | null
    // 召喚・配置レベル選択モード
    summonLevelSelect: { handIndex: number; cardId: string; targetInstanceId?: string } | null
}

// 指定アタック（canDirectAttack）を現在レベルで持っているか（判定は共有実装 activeConstraints を参照）
export function canDirectAttack(
    view: GameView,
    pid: PlayerId,
    inst: CardInstance,
): "rested" | "singleCore" | "recovered" | null {
    const constraint = activeConstraints(view, pid, inst).find((c) => c.type === "canDirectAttack")
    if (!constraint || constraint.type !== "canDirectAttack") return null
    return constraint.targetFilter
}

// 指定アタックの対象条件に相手スピリットが合致するか（判定はサーバーと同一の共有実装）
export function matchesDirectedAttackFilter(
    filter: "rested" | "singleCore" | "recovered",
    target: CardInstance,
): boolean {
    return sharedMatchesDirectedAttackFilter(filter, target) === null
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
const EVENT_BANNER_DURATION_MS = 800

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
    // 防御側の応答（ブロック・ライフ受け）が可能か：優先権を持つ間かフラッシュ終了後
    const canDefend =
        isDefender && (!view.isFlashTiming || hasPriority)

    // ステータスバー
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

    show("btn-attack-phase", myMainFree && !pendingChoiceActive)
    show(
        "btn-end-turn",
        myTurn && !view.battle && (view.phase === "main" || view.phase === "attack") && !pendingChoiceActive,
    )
    show("btn-take-life", canDefend && !view.battle?.blockerInstanceId && !pendingChoiceActive)
    show("btn-pass", inFlash && !pendingChoiceActive)
    const anyMode =
        ui.targeting !== null || ui.awakenTarget !== null || ui.paying !== null || ui.directedAttack !== null || ui.summonLevelSelect !== null
    show("btn-cancel-target", anyMode)
    show("btn-attack-player", ui.directedAttack !== null)
    show("targeting-info", anyMode || pendingChoiceActive)
    show("btn-skip-choice", myPendingChoice?.optional === true)
    // kind:"option"の選択肢ボタンを描画する（myPendingChoiceが自分宛かつoption式のときのみ）。
    // kind:"card"かつcardZone:"trash"のときも同じボタンUIでカード名を並べる
    // （cardZone:"hand"は手札のカード自体をクリックさせるためここには描画しない）
    const choiceOptionsEl = $("choice-options")
    choiceOptionsEl.innerHTML = ""
    if (myPendingChoice && myPendingChoice.kind === "option") {
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
    } else if (ui.summonLevelSelect) {
        const card = master(ui.summonLevelSelect.cardId)
        const cost = effectiveCost(view, view.you, card)
        const reserve = view.players[view.you].reserve
        const affordableLevels = card.levels.filter(l => reserve >= cost + l.cores)
        for (const l of affordableLevels) {
            const b = document.createElement("button")
            b.dataset.summonLevel = String(l.level)
            b.textContent = `Lv${l.level} (${l.cores}コア)`
            choiceOptionsEl.appendChild(b)
        }
        show("choice-options", true)
    } else {
        show("choice-options", false)
    }
    if (myPendingChoice) {
        $("targeting-info").textContent = `⚡ ${myPendingChoice.prompt}`
    } else if (oppPendingChoice) {
        $("targeting-info").textContent = `⏳ ${oppPendingChoice.prompt}`
    } else if (ui.paying !== null) {
        const remaining = payingRemaining(view, ui.paying)
        $("targeting-info").textContent =
            `💎 コスト支払い: 残り ${remaining} コア。スピリット上のコアを割り当ててください`
    } else if (ui.awakenTarget !== null) {
        $("targeting-info").textContent =
            "🔄 覚醒: コアの移動元にする自分のスピリットを選んでください"
    } else if (ui.directedAttack !== null) {
        $("targeting-info").textContent =
            "⚔️ 指定アタック: アタック対象の相手スピリットを選択（またはプレイヤーへアタック）"
    } else if (ui.summonLevelSelect) {
        $("targeting-info").textContent =
            `🌟 召喚/配置レベルを選択してください (リザーブからコアを置きます)`
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
    renderInfo("opp-info", view, opp, false, lifeDamagedPids.has(opp))
    renderInfo("my-info", view, you, true, lifeDamagedPids.has(you))

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
        div.textContent = line
        if (line.includes("ターン")) {
            div.className = "log-turn"
        } else if (line.includes("ステップ")) {
            div.className = "log-phase"
        } else if (line.includes("破壊") || line.includes("ダメージ") || line.includes("ライフ")) {
            div.className = "log-important"
        }
        logEl.appendChild(div)
    }
    logEl.scrollTop = logEl.scrollHeight

    // 勝敗
    if (view.winner) {
        show("result-overlay", true)
        $("result-message").textContent =
            view.winner === you ? "🏆 勝利！" : "敗北…"
    } else {
        show("result-overlay", false)
    }
}

function renderInfo(
    id: string,
    view: GameView,
    pid: PlayerId,
    isSelf: boolean,
    lifeDamaged: boolean,
): void {
    const p = view.players[pid]
    const el = $(id)
    el.innerHTML = ""
    // ライフダメージのGameEventがあれば演出用クラスを付与（一過性のアニメーションなので毎描画で再生されるだけでよい）
    const items: [string, string][] = [
        ["", (isSelf ? "あなた: " : "相手: ") + p.name + (view.turnPlayer === pid ? " ⏵ターン中" : "")],
        ["life" + (lifeDamaged ? " life-changed" : ""), `❤ ${p.life}`],
        ["", `リザーブ ${p.reserve}`],
        ["", `トラッシュコア ${p.trashCores}`],
        ["", `デッキ ${p.deckCount}枚`],
        ["", isSelf ? `手札 ${p.handCount}枚` : `相手手札 ${p.handCount}枚`],
        ["", `トラッシュ ${p.trashCards.length}枚`],
    ]
    for (const [cls, text] of items) {
        const span = document.createElement("span")
        if (cls) span.className = cls
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
    // 防御側の応答（ブロック）が可能か：優先権を持つ間かフラッシュ終了後
    const canDefend =
        isDefender &&
        (!view.isFlashTiming || view.priorityPlayer === view.you)
    // ブロック判定用：現在のバトルのアタッカー（攻撃側は常にターンプレイヤー）
    const attacker = view.battle
        ? view.players[view.turnPlayer].field.spirits.find(
              (s) => s.instanceId === view.battle?.attackerInstanceId,
          )
        : undefined

    const el = document.createElement("div")
    el.className = `card color-${m.color}`
    if (inst.isRested) el.classList.add("rested")
    el.dataset.instanceId = inst.instanceId
    el.dataset.cardId = inst.cardId
    el.dataset.side = isMine ? "mine" : "opp"

    const name = document.createElement("div")
    name.className = "name"
    name.textContent = m.name
    el.appendChild(name)

    const stats = document.createElement("div")
    stats.className = "stats"
    stats.textContent = isNexus
        ? `コスト${m.cost} Lv${level}`
        : `コスト${m.cost} BP${bp}${inst.tempBpBuff ? "↑" : ""}`
    el.appendChild(stats)

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

    if (m.effect) {
        const eff = document.createElement("div")
        eff.className = "effect-text"
        eff.textContent = m.effect
        el.appendChild(eff)
    }

    if (view.battle?.attackerInstanceId === inst.instanceId) {
        el.classList.add("attacker-mark")
    }

    // 効果解決中の選択待ち（自分宛）：候補なら最優先でハイライトし、他の操作モードは無視する
    if (view.pendingChoice && view.pendingChoice.pid === view.you) {
        if (view.pendingChoice.candidates.includes(inst.instanceId)) {
            el.classList.add("targetable", "clickable")
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
        // 「相手宛のpendingChoice」または「pendingChoiceなし」のケースのみ）
        if (view.pendingChoice) {
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
        // 起動能力（フラッシュ中のバトルでコストを払って任意発動）：バッジのクリックで発動
        const activatable = activatableAbility(view, view.you, inst)
        if (activatable) {
            const badge = document.createElement("button")
            badge.className = "activate-badge"
            badge.dataset.activate = inst.instanceId
            badge.dataset.effect = activatable.effectId
            badge.textContent = "起動"
            badge.title = `コア${activatable.cost}個を払って効果を発動`
            el.appendChild(badge)
        }
        // フィールド全体制約（魔帝の墓標）：コア1個しか置いていないスピリットはアタック/ブロック不可
        const singleCoreLocked =
            inst.cores === 1 && hasGlobalConstraint(view, "singleCoreCantAct")
        // このスピリットはアタックできない（カイザレオン大帝Lv1）
        const cantAttack = activeConstraints(view, ownerPid, inst).some((c) => c.type === "cantAttack")
        // このターンの間だけの全体制約（ヘビィゲート）：コストがmaxCost以下のスピリットはアタック/ブロック不可
        const costLocked = cantActByCost(view, inst)
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
        // ブロック可能（cantBlock / cantBlockLowerBp / unblockableBy / singleCoreCantAct の制約を反映）
        if (
            canDefend &&
            !view.battle?.blockerInstanceId &&
            !inst.isRested &&
            !singleCoreLocked &&
            !costLocked &&
            level >= 1 &&
            (!attacker || canBlockAttacker(view, ownerPid, inst, view.turnPlayer, attacker))
        ) {
            el.classList.add("clickable", "usable")
        }
        // コア移動ボタン（メインステップのみ）
        if (myMainFree) {
            const btns = document.createElement("div")
            btns.className = "core-buttons"
            for (const dir of ["add", "remove"] as const) {
                const b = document.createElement("button")
                b.dataset.core = dir
                b.dataset.instanceId = inst.instanceId
                b.textContent = dir === "add" ? "+" : "−"
                b.title = dir === "add" ? "リザーブからコアを置く" : "コアをリザーブへ戻す"
                btns.appendChild(b)
            }
            el.appendChild(btns)
        }
    } else {
        // 指定アタックの対象選択モード中：フィルタに合う相手スピリットのみ選択可能
        if (ui.directedAttack !== null) {
            if (matchesDirectedAttackFilter(ui.directedAttack.filter, inst)) {
                el.classList.add("targetable", "clickable")
            }
            return el
        }
        // 対象選択中（相手側）。免疫スピリット（ワルキューレ／フェザーバリア）・
        // 使用中マジックの色に対する装甲持ち・マジック効果耐性持ち（ポークン）は選択不可
        // （対象選択モードは常にマジック使用時のみのため、sourceTypeの判定は不要）
        if (ui.targeting?.side === "opponent" && !isUntargetableByOpponent(inst)) {
            const usingCardId = view.players[view.you].hand?.[ui.targeting.handIndex]
            const usingColor = usingCardId ? master(usingCardId).color : undefined
            if (!hasArmorAgainst(inst, usingColor) && !hasMagicImmunityView(view, ownerPid, inst)) {
                el.classList.add("targetable", "clickable")
            }
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
        // 神速：静的に持つか、grantKeywordToHandCardで一時付与されているか
        const flashSummonable =
            m.type === "spirit" && (hasKeyword(cardId, "soku") || tempSokuCardIds.has(cardId))

        // 力奪う凱旋門：相手フィールドに発生源があれば、自分のフィールドのシンボル色と一致しない
        // 色のマジックは使用不可（クリック自体は可能だが usable ハイライトからは除外する）
        const magicColorLocked =
            m.type === "magic" &&
            hasMagicRestriction(view, view.you, "colorLockOpponent") &&
            !ownFieldSymbolColors(view, view.you).has(m.color)

        const usable =
            !view.pendingChoice &&
            !magicColorLocked &&
            ((myMainFree && reserve >= need) ||
                (inFlash &&
                    !flashLocked &&
                    reserve >= need &&
                    ((m.type === "magic" && m.flash) || flashSummonable)))

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
        el.className = `card color-${m.color}`
        el.dataset.handIndex = String(activeIndex)
        el.dataset.cardId = cardId
        if (usable) el.classList.add("usable", "clickable")
        if (targetable) el.classList.add("targetable", "clickable")

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
            m.type === "spirit" ? "スピリット" : m.type === "nexus" ? "ネクサス" : "マジック"

        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        el.appendChild(name)

        const stats = document.createElement("div")
        stats.className = "stats"
        stats.textContent = `${COLOR_LABELS[m.color]}/${typeLabel}`
        el.appendChild(stats)

        if (m.levels.length > 0) {
            const bp = document.createElement("div")
            bp.className = "stats"
            bp.textContent = m.levels
                .filter((l) => l.bp > 0)
                .map((l) => `Lv${l.level}:${l.bp}`)
                .join(" ")
            el.appendChild(bp)
        }

        if (m.effect) {
            const eff = document.createElement("div")
            eff.className = "effect-text"
            eff.textContent = m.effect
            el.appendChild(eff)
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
            message = `⚔ ${m.name}（BP${bp}）がアタック！ フラッシュマジックを使うか「パス」、またはブロック／「ライフで受ける」で応答してください。`
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
                if (lv.bp !== undefined) {
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

    const hide = (): void => tip.classList.add("hidden")

    // PC: ホバーで表示・カードから離れたら消す
    document.addEventListener("mouseover", (e) => {
        const card = (e.target as HTMLElement).closest<HTMLElement>(".card")
        if (card) showFor(card)
    })
    document.addEventListener("mouseout", (e) => {
        const from = (e.target as HTMLElement).closest(".card")
        const to = (e.relatedTarget as HTMLElement | null)?.closest?.(".card")
        if (from && from !== to) hide()
    })

    // スマホ: 長押し（500ms）で表示。指を離しても表示は残し、次のタップで消す。
    // 長押し後のタップがカードの操作（アタック等）として誤発火しないよう、直後のクリックを1回握りつぶす
    let pressTimer = 0
    let longPressed = false
    document.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return
        const card = (e.target as HTMLElement).closest<HTMLElement>(".card")
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
