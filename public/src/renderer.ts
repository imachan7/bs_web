// 受け取った状態をDOMへ反映する描画処理
import type {
    CardData,
    CardInstance, GameEvent,
    GameView, PlayerId
} from "../../server/src/type"
import { CARD_TYPE_LABELS } from "../../data/constants"
import { setCardLookup } from "../../shared/cardDb"
import { effectiveCost } from "../../shared/cost"
import { canBlock, matchesDirectedAttackFilter as sharedMatchesDirectedAttackFilter } from "../../shared/block"
// ルール判定はサーバーと同一の実装を共有する（二重実装によるズレを防ぐ）
import {
    activeConstraints,
    cantActByTimed,
    currentLevel, effectiveBp,
    hasArmorAgainst,
    hasGlobalConstraint, hasKeyword,
    hasMagicImmunity,
    isUntargetableByOpponent,
    activatableAbility as sharedActivatableAbility,
    canAwaken as sharedCanAwaken, canAwakenFromReserve,
    directAttackFilter,
    instHasColor,
    instHasCost, matchesFamilyFilter,
    spiritHasFamily,
    spiritHasKeyword, type DirectAttackFilter, isEndStepLocked
} from "../../shared/rules"
import { currentHoverCard, hideEffectTooltip, suppressEffectTooltip } from "./ui/tooltip"
import { payableFieldCores, payingIsCostOnly, payingNeed, payingRemaining, PayingState, exReductionSymbolsFor, ExReductionGroup, exReductionPickedIndices, payingCardId, payingAltPay, payingShinsokuAssistCandidates } from "./ui/paying"
import { renderField } from "./ui/fieldCard"
import { renderHand } from "./ui/hand"
import { renderInfo, renderBurst, renderBattle } from "./ui/infoPanels"
export { activeConstraints, cantActByTimed, hasArmorAgainst, hasGlobalConstraint, hasKeyword, instHasCost, instHasColor, isUntargetableByOpponent }

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

export const COLOR_SYMBOLS: Record<string, string> = {
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
    // 体数を数え上げで決める効果（countCounter）も1体だけ先取りできないので、サーバーの自動選択に委ねる
    if ((effect.action as { countCounter?: unknown }).countCounter !== undefined) return null
    // ネクサス・自分自身・自分側や両陣営・すべて、を壊す destroy は相手のスピリットを対象に取らない
    if (effect.action.type === "destroy") {
        const a = effect.action
        if (a.nexus || a.target === "self" || a.side !== undefined || a.all) return null
    }
    if (
        effect.action.type === "destroy" ||
        effect.action.type === "coreRemove" ||
        effect.action.type === "exhaust" ||
        effect.action.type === "returnToHand" ||
        effect.action.type === "returnToDeckTop"
    ) {
        return "opponent"
    }
    // 先取りするのは「相手のスピリット1体から取る」形だけ。複数から1個ずつ・取り先が並ぶ・相手が選ぶ等はサーバーの選択待ちに任せる
    if (effect.action.type === "removeCores") {
        const a = effect.action
        const simple = a.side === undefined && a.target === undefined && a.targets === undefined && a.from === undefined
        return simple && a.chooser === undefined && a.filter === undefined ? "opponent" : null
    }
    if (
        (effect.action.type === "placeCores" &&
            effect.action.to === "spirit" &&
            (effect.action.target ?? "one") === "one" &&
            (effect.action.targets ?? 1) === 1 &&
            // 絞り込みがあると、先取りした対象が条件に合わず不発になりうる（選択はサーバーの選択待ちに任せる）
            effect.action.filter === undefined)
    )
        return "self"
    // timedEffect の1体指定：side:"both"（陣営を問わず選ぶ）は先取りしない、side:"own"は"self"、既定（相手）は"opponent"
    if (effect.action.type === "timedEffect" && effect.action.content.some((c) => c.type === "bp" || c.type === "keyword" || (c.type === "level" && c.up !== undefined) || (c.type === "triggerSwap" && c.from === "onAttack")) && !effect.action.all) {
        if (effect.action.side === "both") return null
        return effect.action.side === "own" ? "self" : "opponent"
    }
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
): { effectId: string; costLabel: string; instanceId?: string } | null {
    return sharedActivatableAbility(view, you, inst)
}

export interface UiState {
    // コアの支払い方式。"manual" だとリザーブで足りても支払いモードへ入り、確定ボタンを押すまで送信しない
    payMode: "auto" | "manual"
    targeting: { handIndex: number; side: TargetSide } | null
    // 覚醒モード：コアの移動先（覚醒持ちスピリット）の instanceId
    awakenTarget: string | null
    paying: PayingState | null
    // 指定アタックモード：対象選択中のアタッカーと、選べる相手の条件
    directedAttack: { attackerInstanceId: string; filter: DirectAttackFilter } | null
    // 召喚・配置レベル選択モード
    summonLevelSelect: { handIndex: number; cardId: string; targetInstanceId?: string; altSummonNexusInstanceIds?: string[]; exReductionTrashIndices?: number[] } | null
    // 《継召》(kind:"exTrashReduction")の除外カード選択モード。手札のスピリット/ブレイヴが効果を持ち、
    // トラッシュにEXシンボル持ちカードがあるとき、コストを支払う通常の召喚の前に開く。
    // candidateIndices/selected はどちらも自分の trashCards 内インデックス
    exReductionSelect: { handIndex: number; cardId: string; targetInstanceId?: string; phase: "ask" | "select"; groups: ExReductionGroup[] } | null // 《継召》の「する／しない」→ 対象選択（同一カードはグループまとめ）
    // 《ソウルマジック》（kind:"soulCoreOnlyCast"）の選択モード:「自分の◯シンボルがあれば[ソウルコア]だけで使用できる」
    soulCoreOnlySelect: { handIndex: number; cardId: string; targetInstanceId?: string } | null
    // メインステップでマジックのメイン効果／フラッシュ効果を選ぶモードと、選んだ結果（castMagic を送るときに付ける）
    magicTimingSelect: { handIndex: number; cardId: string } | null
    magicTiming: "main" | "flash" | null
    // [ソウルコア]の1:1交換モード（メインステップ・§1.4）: fromInstanceId＝[ソウルコア]が載った自分の個体。
    // 次にクリックした通常コア1個以上の自分の個体と交換する
    soulSwapSelect: { fromInstanceId: string } | null
    // 入れ替え召喚モード：手札に戻す対象（自分のスピリット）を選択中
    battleSwapSummon: { handIndex: number; substituteInstanceIds: string[] } | null
    // ブレイヴの召喚方法を選択中。ブレイヴは「スピリット状態で単体召喚」と
    // 「合体した状態で召喚（ダイレクトブレイヴ）」のどちらかを毎回選ぶ（2026-08-28 ユーザー指示）。
    // candidateIds は合体先に選べる自分のスピリット（空でも単体召喚の選択肢は出す）
    braveSummonSelect: { handIndex: number; cardId: string; candidateIds: string[] } | null
    // 代替召喚（kind:"altSummonFromHand"）の方法を選択中。通常召喚と、
    // 支払いに使えるネクサスごとの選択肢を出す（BS10-058 水星神龍メルクリウス・サーペント）
    altSummonSelect: { handIndex: number; cardId: string; candidateNexusIds: string[] } | null
    // 任意合体モード（BRAVE.md §6.4）：合体させるスピリット状態のブレイヴを選んだ状態。
    // candidateIds は合体先に選べる自分のスピリット（braveCombineCandidates と同じ判定）
    combineBrave: { braveInstanceId: string; candidateIds: string[] } | null
    // 増減式の選択（PendingChoice.stepper）でいま表示している数。選択が変わったら null に戻す
    stepper: number | null
    // バーストを再セットするときの確認待ち（既存のバーストはトラッシュへ送られるため確認をはさむ）
    burstResetConfirm: { handIndex: number } | null
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
    attacker?: { pid: PlayerId; inst: CardInstance },
): boolean {
    return sharedMatchesDirectedAttackFilter(filter, target, view, targetPid, attacker) === null
}

// ---- DOM ヘルパー ----

export function $(id: string): HTMLElement {
    const el = document.getElementById(id)
    if (!el) throw new Error(`要素が見つかりません: #${id}`)
    return el
}

function show(id: string, visible: boolean): void {
    $(id).classList.toggle("hidden", !visible)
}

// innerHTML に差し込む文字列のエスケープ（ツールチップの効果テキスト強調表示で使用）
export function escapeHtml(str: string): string {
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
            return ev.vanish ? `💨 ${ev.cardName} 消滅` : `💥 ${ev.cardName} 破壊`
        case "magic": return `📜 ${ev.cardName} 使用`
        case "burst": return `⚡ ${ev.cardName} バースト発動`
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
    // 支払いモード中はホバーの効果ツールチップを抑制する（上の effectTooltipSuppressed）
    suppressEffectTooltip(ui.paying !== null)
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
    // 第2メインステップはアタックの後の専用チップで示す（phaseは"main"を使い回すため、
    // activeだけをメインチップから第2メインチップへ付け替える）
    if (view.secondMainStep) {
        document.querySelector('.phase-step[data-phase="main"]')?.classList.remove("active")
        document.querySelector('.phase-step[data-phase="second-main"]')?.classList.add("active")
    }

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
    // 「ブレイヴを残す」を押して支払いモードへ入っている間は、選択肢ボタンを出さない
    // （出したままだと押し直して二重に入れてしまう。戻り道は「対象選択をやめる」）
    const payingForChoice = ui.paying?.forBraveKeep !== undefined || ui.paying?.forMeisai !== undefined
    const myPendingChoice =
        view.pendingChoice && view.pendingChoice.pid === view.you && !payingForChoice ? view.pendingChoice : null
    const oppPendingChoice =
        view.pendingChoice && view.pendingChoice.pid !== view.you ? view.pendingChoice : null

    // 「お互い、アタックステップは行えず」（ルナティックシール）。サーバーも同じ判定で弾く
    // 先攻1ターン目と第2メインステップにはアタックステップが無い
    show("btn-attack-phase", myMainFree && !pendingChoiceActive && !isEndStepLocked(view, "attackStep") && !view.extraMainStep && !view.secondMainStep && view.turn > 1)
    show(
        "btn-end-turn",
        myTurn && !view.battle && (view.phase === "main" || view.phase === "attack") && !pendingChoiceActive && !view.endTurnBlocked,
    )
    show(
        "btn-take-life",
        canDefend && !view.battle?.blockerInstanceId && !pendingChoiceActive,
    )
    show("btn-pass", inFlash && !pendingChoiceActive)
    const anyMode =
        ui.targeting !== null || ui.awakenTarget !== null || ui.paying !== null || ui.directedAttack !== null || ui.summonLevelSelect !== null || ui.battleSwapSummon !== null || ui.braveSummonSelect !== null || ui.altSummonSelect !== null || ui.exReductionSelect !== null || ui.soulCoreOnlySelect !== null || ui.magicTimingSelect !== null || ui.soulSwapSelect !== null || ui.burstResetConfirm !== null
    show("btn-cancel-target", anyMode)
    // 支払いモードで、これ以上コアを足さなくても成立するときに出す確定ボタン。
    // 代替コスト（手札破棄／デッキ破棄）を「使わない」まま確定したいケースがあるので、
    // コアが足りていても支払いモードへ入る仕様（tryPlay）とセットで必要になる
    show("btn-confirm-pay", ui.paying !== null && payingRemaining(view, ui.paying) === 0)
    show("btn-attack-player", ui.directedAttack !== null && !ui.directedAttack.filter.onlyInstanceIds)
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
    } else if (ui.magicTimingSelect) {
        const main = document.createElement("button")
        main.dataset.magictiming = "main"
        main.textContent = "メイン効果を使う"
        const flash = document.createElement("button")
        flash.dataset.magictiming = "flash"
        flash.textContent = "フラッシュ効果を使う"
        choiceOptionsEl.append(main, flash)
        show("choice-options", true)
    } else if (ui.soulCoreOnlySelect) {
        // 《ソウルマジック》: [ソウルコア]だけで使用するか、通常どおり支払うかの2択
        const card = master(ui.soulCoreOnlySelect.cardId)
        const cost = effectiveCost(view, view.you, card)
        const yes = document.createElement("button")
        yes.dataset.soulonly = "yes"
        yes.textContent = "[ソウルコア]だけで使用する"
        const no = document.createElement("button")
        no.dataset.soulonly = "no"
        no.textContent = `通常どおり支払う（コスト${String(cost)}）`
        choiceOptionsEl.append(yes, no)
        show("choice-options", true)
    } else if (ui.exReductionSelect) {
        // 《継召》：まず「する／しない」の2択。するなら対象をカード単位で選ぶ。
        // 同一カードは1ボタンにまとめ、クリックで選ぶ枚数を 0→1→2→…→0 と回す
        const card = master(ui.exReductionSelect.cardId)
        const base = effectiveCost(view, view.you, card)
        if (ui.exReductionSelect.phase === "ask") {
            const yes = document.createElement("button")
            yes.dataset.exAsk = "yes"
            yes.textContent = "《継召》で軽減する"
            const no = document.createElement("button")
            no.dataset.exAsk = "no"
            no.textContent = `使わない（通常どおりコスト${String(base)}）`
            choiceOptionsEl.append(yes, no)
        } else {
            const picked = exReductionPickedIndices(ui.exReductionSelect.groups)
            const reduced = effectiveCost(view, view.you, card, false, exReductionSymbolsFor(view, picked))
            for (const [i, g] of ui.exReductionSelect.groups.entries()) {
                const b = document.createElement("button")
                b.dataset.exGroup = String(i)
                b.textContent = `${master(g.trashCardId).name} `
                // 選択枚数/トラッシュ内の枚数（手札の枚数バッジと同じ黄色の数字）
                const countSpan = document.createElement("span")
                countSpan.className = "ex-trash-count"
                countSpan.textContent = `${String(g.count)}/${String(g.indices.length)}`
                b.appendChild(countSpan)
                if (g.count > 0) b.classList.add("selected")
                choiceOptionsEl.appendChild(b)
            }
            const confirmEx = document.createElement("button")
            confirmEx.dataset.exConfirm = "1"
            confirmEx.textContent =
                picked.length > 0 ? `決定（コスト${String(base)}→${String(reduced)}）` : `使わない（コスト${String(base)}）`
            choiceOptionsEl.appendChild(confirmEx)
        }
        show("choice-options", true)
    } else if (ui.summonLevelSelect) {
        const card = master(ui.summonLevelSelect.cardId)
        // 代替召喚（ネクサスをデッキの下に戻して払う）では召喚コストが0になる
        const cost = ui.summonLevelSelect.altSummonNexusInstanceIds ? 0 : effectiveCost(view, view.you, card, false, exReductionSymbolsFor(view, ui.summonLevelSelect.exReductionTrashIndices))
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
        // 《真界放》のwaiver配置: [ソウルコア]1個だけでLv2にする置き方（2026-10-07 ユーザー裁定。
        // レベル選択の3パターン「Lv1分置く/Lv2分置く/Lv2を[ソウルコア]で置く」の3つ目）
        const soulInReserve = view.players[view.you].soulCore?.zone === "reserve"
        const marked = card.levels.some((l) => l.soulCoreRequired === true)
        if (marked && soulInReserve && reserve + fieldCores >= cost + 1) {
            const b = document.createElement("button")
            b.dataset.soulWaiver = "1"
            const needsField = reserve < cost + 1
            b.textContent = needsField
                ? "Lv2を[ソウルコア]で置く (1コア・フィールドから取得)"
                : "Lv2を[ソウルコア]で置く (1コア)"
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
    } else if (ui.burstResetConfirm) {
        // すでにセットされているバーストを、新しいカードで上書きしていいかの確認
        const yes = document.createElement("button")
        yes.dataset.burstConfirm = "yes"
        yes.textContent = "はい（セットし直す）"
        const no = document.createElement("button")
        no.dataset.burstConfirm = "no"
        no.textContent = "いいえ"
        choiceOptionsEl.append(yes, no)
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
        // 任意分離（BRAVE.md §6.4）にはコストが無く、置くコアだけなので案内を分ける
        const base =
            ui.paying.forBraveKeep !== undefined
                ? `💎 残すブレイヴに置くコア: 残り ${remaining} コア。フィールドのコアを割り当てられます（そのまま確定すればリザーブから払います）`
                : ui.paying.forMeisai !== undefined
                ? `💎 ${ui.paying.forMeisai.effectCost ? "効果" : "【迷彩】"}のコスト: 残り ${remaining} コア。フィールドのコアを割り当てられます（そのまま確定すればリザーブから払います）`
                : ui.paying.forAttack !== undefined
                ? `💎 アタックのコスト: 残り ${remaining} コア。フィールドのコアを割り当てられます（そのまま確定すればリザーブから払います）`
                : ui.paying.forBlock !== undefined
                ? `💎 ブロックのコスト: 残り ${remaining} コア。フィールドのコアを割り当てられます（そのまま確定すればリザーブから払います）`
                : ui.paying.forDetachBraveInstanceId !== undefined
                ? `💎 分離するブレイヴに置くコア: 残り ${remaining} コア。フィールドのスピリット/ネクサス上のコアを割り当ててください`
                : `💎 コアの支払い: 残り ${remaining} コア。フィールドのスピリット/ネクサス上のコアを割り当ててください（コストと置くコアのどちらにも使えます）`
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
        // リザーブの[ソウルコア]をコスト支払いに使うかの選択（2026-10-05 ユーザー確認: 支払いでプレイヤーが選ぶ）。
        // 置くコアだけの支払い（ブレイヴを残す/分離）と選択待ちの解決では出さない
        const soulInReserve = view.players[view.you].soulCore?.zone === "reserve"
        const soulApplies =
            soulInReserve &&
            ui.paying.forBraveKeep === undefined &&
            ui.paying.forDetachBraveInstanceId === undefined &&
            ui.paying.forChoiceCardIndex === undefined
        if (soulApplies) {
            const useCost = ui.paying.useSoulCore === true
            const useMaintain = ui.paying.placeSoulCore === true
            const need = payingNeed(view, ui.paying)
            const assignedTotal = Object.values(ui.paying.assigned).reduce((a, b) => a + b, 0)
            const reserve = view.players[view.you].reserve
            // 案B-inside: reserveには[ソウルコア]が含まれる。通常コア（reserve-1）だけで足りるかを見る
            const soulRequired = reserve - 1 + assignedTotal < need && reserve + assignedTotal >= need
            // 維持コアを置く支払い（マジック・ダイレクトブレイヴ以外）だけ「維持コアとして置く」を出す
            const payingId = payingCardId(view, ui.paying)
            const placesCores = !payingIsCostOnly(ui.paying) && ui.paying.braveTargetInstanceId === undefined && payingId !== undefined && master(payingId).type !== "magic"
            // 選択中のボタンは青い縁でハイライトする（2026-10-06 ユーザー要望）
            const sel = (on: boolean) => (on ? ' class="souluse-selected"' : "")
            const costBtn = `<button data-souluse="cost"${sel(useCost)}>${useCost ? "☑" : "☐"} コスト支払いに使う（トラッシュへ）</button>`
            const maintainBtn = placesCores ? `<button data-souluse="maintain"${sel(useMaintain)}>${useMaintain ? "☑" : "☐"} 維持コアとして置く（場のカードの上）</button>` : ""
            const noneBtn = `<button data-souluse="none"${sel(!useCost && !useMaintain)}>${!useCost && !useMaintain ? "☑" : "☐"} [ソウルコア]を使わない</button>`
            if (soulRequired) {
                // [ソウルコア]なしでは支払いが成立しないので「使いますか」とは聞かない。
                // 使う前提の注意表示にして、行き先（コスト/維持コア）だけ選ばせる（2026-10-06 ユーザー確認）
                $("targeting-info").innerHTML +=
                    `<br><b>[ソウルコア]を使います（通常コアだけでは足りません）:</b>` + costBtn + maintainBtn
            } else {
                $("targeting-info").innerHTML += `<br>` + noneBtn + costBtn + maintainBtn
            }
        }
        // kind:"payAssistByExhaust"（BS16-021）：【神速】召喚のとき、疲労させて肩代わりする候補があれば選ばせる
        const shinsokuCandidates = payingShinsokuAssistCandidates(view, ui.paying)
        if (shinsokuCandidates.length > 0) {
            const buttons = shinsokuCandidates
                .map((c) => {
                    const inst = [...view.players[view.you].field.spirits, ...view.players[view.you].field.nexuses].find((s) => s.instanceId === c.instanceId)
                    const name = inst ? master(inst.cardId).name : c.instanceId
                    const on = (ui.paying!.shinsokuAssistInstanceIds ?? []).includes(c.instanceId)
                    return `<button data-shinsokuassist="${c.instanceId}">${on ? "☑" : "☐"} ${name}を疲労させてコスト${c.discount}までを肩代わり</button>`
                })
                .join(" ")
            $("targeting-info").innerHTML += `<br>${buttons}`
        }
        if (ui.payMode === "manual") {
            const need = payingNeed(view, ui.paying)
            const fromField = Object.values(ui.paying.assigned).reduce((a, b) => a + b, 0)
            const fromReserve = Math.max(0, Math.min(view.players[view.you].reserve, need - fromField))
            $("targeting-info").innerHTML +=
                `<br>リザーブから${fromReserve}個／フィールドから${fromField}個` +
                (fromField > 0 ? ` <button data-payreset="1">割り当てをやり直す</button>` : "")
        }
    } else if (ui.awakenTarget !== null) {
        const awakenInst = view.players[view.you].field.spirits.find((s) => s.instanceId === ui.awakenTarget)
        const fromReserve = canAwakenFromReserve(view, view.you, awakenInst)
        $("targeting-info").textContent = fromReserve
            ? "🔄 覚醒: コアの移動元にする自分のスピリットまたはリザーブを選んでください"
            : "🔄 覚醒: コアの移動元にする自分のスピリットを選んでください"
    } else if (ui.directedAttack !== null) {
        $("targeting-info").textContent =
            ui.directedAttack.filter.onlyInstanceIds
                ? "⚔️ 相手の効果により、指定された相手スピリットを選んでアタックしてください"
                : "⚔️ 指定アタック: アタック対象の相手スピリットを選択（またはプレイヤーへアタック）"
    } else if (ui.soulSwapSelect !== null) {
        $("targeting-info").textContent = "🔄 [ソウルコア]交換: 交換相手の自分のスピリット/ネクサスを選んでください（通常コア1個以上が必要）"
    } else if (ui.magicTimingSelect) {
        $("targeting-info").textContent = `${master(ui.magicTimingSelect.cardId).name}：メイン効果とフラッシュ効果のどちらを使うか選んでください`
    } else if (ui.soulCoreOnlySelect) {
        $("targeting-info").textContent = "《ソウルマジック》：自分のフィールドに該当色のシンボルがあれば、[ソウルコア]1個だけで使用できます（リザーブ・自分のスピリット/ネクサスの上のどちらでも）"
    } else if (ui.exReductionSelect) {
        $("targeting-info").textContent =
            ui.exReductionSelect.phase === "ask"
                ? `《継召》：トラッシュのEXシンボルを除外して、コスト${String(effectiveCost(view, view.you, master(ui.exReductionSelect.cardId)))}を軽減できます`
                : `《継召》：除外するトラッシュのカードを選んでください（同じカードはまとめて1枚のボタンです）`
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
    } else if (ui.burstResetConfirm) {
        $("targeting-info").textContent =
            "🔥 すでにセットしてあるバーストはトラッシュに置かれます。セットし直しますか？"
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

    // バーストエリア（docs/design/BURST.md）。相手のバーストは常に裏面のみ（cardIdは来ない）
    renderBurst("opp-burst", view, opp, false)
    renderBurst("my-burst", view, you, true)

    // 手札
    renderHand(view, ui)

    // 手元ボタン
    const myTegamotoCount = view.players[you].tegamoto?.length ?? 0
    const oppTegamotoCount = view.players[opp].tegamoto?.length ?? 0
    $("btn-my-tegamoto").textContent = `手元(${myTegamotoCount})`
    show("btn-my-tegamoto", myTegamotoCount > 0)
    $("btn-opp-tegamoto").textContent = `相手の手元(${oppTegamotoCount})`
    show("btn-opp-tegamoto", oppTegamotoCount > 0)

    // 自分のトラッシュのEXシンボル枚数（《継召》の素材）。黄色バッジでボタン右下に、色ごとの内訳も並べる
    const myTrashExCount = view.players[you].trashCards.filter((id) => master(id).symbolEx === true).length
    const trashBtn = $("btn-toggle-trash")
    const exBadge = trashBtn.querySelector<HTMLDivElement>(".count-badge.ex-badge")
    if (myTrashExCount > 0) {
        const badge = exBadge ?? document.createElement("div")
        badge.className = "count-badge ex-badge"
        badge.textContent = ""
        const total = document.createElement("span")
        total.className = "ex-total"
        total.textContent = `EX${String(myTrashExCount)}`
        badge.appendChild(total)
        // 色別の内訳: 赤紫緑白黄青の順。その色のシンボルを持つEXカードの枚数
        const exByColor = new Map<string, number>()
        for (const id of view.players[you].trashCards) {
            const m = master(id)
            if (m.symbolEx !== true) continue
            for (const c of new Set(m.symbol)) exByColor.set(c, (exByColor.get(c) ?? 0) + 1)
        }
        for (const color of ["red", "purple", "green", "white", "yellow", "blue"]) {
            const count = exByColor.get(color)
            if (count === undefined) continue
            const chip = document.createElement("span")
            chip.className = "ex-color-chip"
            const icon = document.createElement("span")
            icon.className = `sym-icon bg-${color}`
            chip.appendChild(icon)
            chip.appendChild(document.createTextNode(String(count)))
            badge.appendChild(chip)
        }
        if (!exBadge) trashBtn.appendChild(badge)
    } else if (exBadge) {
        exBadge.remove()
    }

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
        } else if (line.includes("破壊") || line.includes("消滅") || line.includes("ダメージ") || line.includes("ライフ")) {
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

    // 再描画でホバー中のカードがDOMから外れた場合、ツールチップを消す
    if (currentHoverCard !== null && !document.body.contains(currentHoverCard)) hideEffectTooltip()
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


