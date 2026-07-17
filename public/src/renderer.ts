// 受け取った状態をDOMへ反映する描画処理
import type {
    AuraCondition,
    AuraCounter,
    AuraDef,
    CardData,
    CardInstance,
    Color,
    ConstraintDef,
    GameView,
    GlobalConstraintDef,
    Keyword,
    PlayerId,
} from "../../server/src/type"
import { COLOR_LABELS, PHASE_LABELS } from "../../data/constants"

// ---- カードマスターデータ（起動時に /data/cards.json から取得） ----

let DB = new Map<string, CardData>()

export function setCardDb(cards: CardData[]): void {
    DB = new Map(cards.map((c) => [c.cardId, c]))
}

export function master(cardId: string): CardData {
    const card = DB.get(cardId)
    if (!card) throw new Error(`カードが見つかりません: ${cardId}`)
    return card
}

// ---- クライアント側でも使うルール計算（サーバーと同じロジックの簡易版） ----

export function levelOf(inst: CardInstance): { level: number; bp: number } {
    const m = master(inst.cardId)
    let result = { level: 0, bp: 0 }
    for (const lv of m.levels) {
        if (inst.cores >= lv.cores && lv.level > result.level) {
            result = { level: lv.level, bp: lv.bp }
        }
    }
    return {
        level: result.level,
        bp: result.bp + (result.level > 0 ? inst.tempBpBuff : 0),
    }
}

// ---- 常時BP修正（オーラ）：サーバー（EffectModules.effectiveBp）と同じロジックの簡易版 ----

function isSpiritOnField(view: GameView, pid: PlayerId, instanceId: string): boolean {
    return view.players[pid].field.spirits.some((s) => s.instanceId === instanceId)
}

function countAuraCounter(view: GameView, sourcePid: PlayerId, counter: AuraCounter): number {
    if (counter === "ownReserve") return view.players[sourcePid].reserve
    if (counter === "ownNexuses") return view.players[sourcePid].field.nexuses.length
    if (counter === "allNexuses") {
        return (
            view.players.p1.field.nexuses.length + view.players.p2.field.nexuses.length
        )
    }
    if (counter === "ownExhausted") {
        return view.players[sourcePid].field.spirits.filter((s) => s.isRested).length
    }
    return view.players[sourcePid].field.spirits.filter((s) =>
        master(s.cardId).family.includes(counter.ownFamily),
    ).length
}

function checkAuraCondition(
    view: GameView,
    sourcePid: PlayerId,
    condition: AuraCondition,
): boolean {
    const player = view.players[sourcePid]
    if (condition === "ownReserveNotEmpty") return player.reserve >= 1
    if ("hasOwnColor" in condition) {
        const all = [...player.field.spirits, ...player.field.nexuses]
        return all.some((inst) => master(inst.cardId).color === condition.hasOwnColor)
    }
    if ("hasOwnColorSpirit" in condition) {
        return player.field.spirits.some(
            (s) => master(s.cardId).color === condition.hasOwnColorSpirit,
        )
    }
    return player.field.spirits.some((s) =>
        master(s.cardId).family.includes(condition.hasOwnFamily),
    )
}

function auraAppliesTo(
    view: GameView,
    sourcePid: PlayerId,
    sourceInst: CardInstance,
    aura: AuraDef,
    targetOwnerPid: PlayerId,
    targetInst: CardInstance,
): boolean {
    if (aura.target === "self") {
        return sourceInst.instanceId === targetInst.instanceId
    }
    if (sourcePid !== targetOwnerPid) return false
    if (!isSpiritOnField(view, targetOwnerPid, targetInst.instanceId)) return false
    if (aura.colorFilter && master(targetInst.cardId).color !== aura.colorFilter) {
        return false
    }
    if (aura.battlingOnly) {
        if (!view.battle) return false
        if (
            view.battle.attackerInstanceId !== targetInst.instanceId &&
            view.battle.blockerInstanceId !== targetInst.instanceId
        ) {
            return false
        }
    }
    if (aura.summonedThisTurnOnly && targetInst.summonedTurn !== view.turn) {
        return false
    }
    if (
        aura.keywordFilter &&
        !spiritHasKeywordView(view, targetOwnerPid, targetInst, aura.keywordFilter)
    ) {
        return false
    }
    return true
}

function auraAmount(view: GameView, sourcePid: PlayerId, aura: AuraDef): number {
    let amount = 0
    if (aura.amountPer !== undefined && aura.counter !== undefined) {
        amount += aura.amountPer * countAuraCounter(view, sourcePid, aura.counter)
    }
    if (aura.amount !== undefined) {
        if (!aura.condition || checkAuraCondition(view, sourcePid, aura.condition)) {
            amount += aura.amount
        }
    }
    return amount
}

// 実効BP：levelOf の基礎BP（tempBpBuff加算済み）に、両陣営の常時BP修正（オーラ）を加算した値
export function effectiveBp(view: GameView, ownerPid: PlayerId, inst: CardInstance): number {
    let total = levelOf(inst).bp
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = view.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            for (const effect of master(source.cardId).effects) {
                if (effect.kind !== "aura" || effect.aura.type !== "bp") continue
                const sourceLevel = levelOf(source).level
                if (!(effect.levels === null || effect.levels.includes(sourceLevel))) continue
                if (!auraAppliesTo(view, pid, source, effect.aura, ownerPid, inst)) continue
                total += auraAmount(view, pid, effect.aura)
            }
        }
    }
    return total
}

// 指定カードがそのキーワードを持つか（サーバー hasKeyword と同じロジックの簡易版）
export function hasKeyword(cardId: string, keyword: Keyword): boolean {
    return master(cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === keyword,
    )
}

// 状態を考慮したキーワード判定（サーバー spiritHasKeyword のミラー）:
// 静的キーワード ‖ 一時付与（tempKeywords） ‖ 持ち主フィールドからの継続付与（keywordGrant）
export function spiritHasKeywordView(
    view: GameView,
    ownerPid: PlayerId,
    inst: CardInstance,
    keyword: Keyword,
): boolean {
    if (hasKeyword(inst.cardId, keyword)) return true
    if (inst.tempKeywords.some((k) => k.keyword === keyword)) return true
    const player = view.players[ownerPid]
    const sources = [...player.field.spirits, ...player.field.nexuses]
    for (const source of sources) {
        const sourceLevel = levelOf(source).level
        for (const effect of master(source.cardId).effects) {
            if (effect.kind !== "keywordGrant") continue
            if (effect.keyword !== keyword) continue
            if (!(effect.levels === null || effect.levels.includes(sourceLevel))) continue
            if (
                effect.familyFilter &&
                !master(inst.cardId).family.includes(effect.familyFilter)
            ) {
                continue
            }
            if (effect.phase && view.phase !== effect.phase) continue
            return true
        }
    }
    return false
}

// フィールド全体制約（kind: "globalConstraint"）が現在有効か
// （サーバー hasGlobalConstraint と同じロジックの簡易版。両陣営のフィールドを走査する）
export function hasGlobalConstraint(
    view: GameView,
    type: GlobalConstraintDef["type"],
): boolean {
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = view.players[pid]
        const instances = [...player.field.spirits, ...player.field.nexuses]
        for (const inst of instances) {
            const { level } = levelOf(inst)
            for (const effect of master(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== type) continue
                if (!(effect.levels === null || effect.levels.includes(level))) continue
                return true
            }
        }
    }
    return false
}

// 指定インスタンスが現在レベルで持つ制約定義の一覧（サーバー activeConstraints と同じロジックの簡易版）
export function activeConstraints(inst: CardInstance): ConstraintDef[] {
    const { level } = levelOf(inst)
    return master(inst.cardId)
        .effects.filter(
            (e) => e.kind === "constraint" && (e.levels === null || e.levels.includes(level)),
        )
        .map((e) => (e as { constraint: ConstraintDef }).constraint)
}

// 相手の対象を取る効果の対象にならないか（サーバー isUntargetableByOpponent のミラー）
export function isUntargetableByOpponent(inst: CardInstance): boolean {
    if (inst.immuneToOpponentThisTurn) return true
    return activeConstraints(inst).some(
        (c) => c.type === "untargetableByOpponent",
    )
}

// 【装甲：色】：inst が sourceColor の相手効果を受けないか（サーバー hasArmorAgainst のミラー）
export function hasArmorAgainst(inst: CardInstance, sourceColor: Color | undefined): boolean {
    if (sourceColor === undefined) return false
    const { level } = levelOf(inst)
    const staticArmor = master(inst.cardId).effects.some(
        (e) =>
            e.kind === "keyword" &&
            e.keyword === "armor" &&
            (e.levels === null || e.levels.includes(level)) &&
            (e.colors?.includes(sourceColor) ?? false),
    )
    if (staticArmor) return true
    // 一時付与の装甲（インビンシブルシールド）
    return inst.tempKeywords.some(
        (k) => k.keyword === "armor" && (k.colors?.includes(sourceColor) ?? false),
    )
}

// ブロック可能ハイライト用: blocker が attacker をブロックできるか（サーバー validateBlock のブロック判定と同じロジックの簡易版。
// 優先権・疲労・レベル等の前提条件は呼び出し側でチェック済みの前提）
export function canBlockAttacker(
    view: GameView,
    blockerPid: PlayerId,
    blockerInst: CardInstance,
    attackerPid: PlayerId,
    attackerInst: CardInstance,
): boolean {
    const blockerConstraints = activeConstraints(blockerInst)
    // バーストファイアで無効化中は cantBlock/cantBlockLowerBp を無視
    if (!blockerInst.blockConstraintNegatedThisTurn) {
        if (blockerConstraints.some((c) => c.type === "cantBlock")) return false
        if (
            blockerConstraints.some((c) => c.type === "cantBlockLowerBp") &&
            effectiveBp(view, attackerPid, attackerInst) < effectiveBp(view, blockerPid, blockerInst)
        ) {
            return false
        }
    }
    const blockerCard = master(blockerInst.cardId)
    const attackerConstraints = activeConstraints(attackerInst)
    for (const c of attackerConstraints) {
        if (c.type !== "unblockableBy") continue
        if (c.colorFilter !== undefined && blockerCard.color === c.colorFilter) return false
        if (
            c.keywordFilter !== undefined &&
            spiritHasKeywordView(view, blockerPid, blockerInst, c.keywordFilter)
        ) {
            return false
        }
        if (c.maxCores !== undefined && blockerInst.cores <= c.maxCores) return false
        if (
            c.levelFilter !== undefined &&
            c.levelFilter.includes(levelOf(blockerInst).level)
        ) {
            return false
        }
    }
    return true
}

// コスト修正（kind: "costMod"）の合計（サーバー costModTotal と同じロジックの簡易版）。
// 両プレイヤーのフィールド（スピリット＋ネクサス）を走査し、レベル有効な costMod のうち
// card.color が colorFilter と一致するものの amount を合計する
function costModTotal(view: GameView, card: CardData): number {
    let total = 0
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = view.players[pid]
        const sources = [...player.field.spirits, ...player.field.nexuses]
        for (const source of sources) {
            const sourceLevel = levelOf(source).level
            for (const effect of master(source.cardId).effects) {
                if (effect.kind !== "costMod") continue
                if (!(effect.levels === null || effect.levels.includes(sourceLevel))) continue
                if (card.color !== effect.colorFilter) continue
                total += effect.amount
            }
        }
    }
    return total
}

export function effectiveCost(
    view: GameView,
    pid: PlayerId,
    card: CardData,
): number {
    const field = view.players[pid].field
    let symbols = 0
    for (const inst of [...field.spirits, ...field.nexuses]) {
        for (const sym of master(inst.cardId).symbol) {
            if (card.reduction.includes(sym)) symbols++
        }
    }
    const base = Math.max(card.cost - Math.min(card.reduction.length, symbols), 0)
    return base + costModTotal(view, card)
}

// 支払いモードでの残り不足コア数（0なら送信可能）
export function payingRemaining(view: GameView, paying: PayingState): number {
    const hand = view.players[view.you].hand
    const cardId = hand?.[paying.handIndex]
    if (cardId === undefined) return 0
    const card = master(cardId)
    const cost = effectiveCost(view, view.you, card)
    const lv1 = card.levels.find((l) => l.level === 1)
    const maintain = card.type === "magic" ? 0 : (lv1 ? lv1.cores : 0)
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
        effect.action.type === "grantKeyword"
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
    assigned: Record<string, number> // instanceId -> 割り当てたコア数
}

export interface UiState {
    targeting: { handIndex: number; side: TargetSide } | null
    // 覚醒モード：コアの移動先（覚醒持ちスピリット）の instanceId
    awakenTarget: string | null
    paying: PayingState | null
    // 指定アタックモード：対象選択中のアタッカーと、選べる相手の条件
    directedAttack: { attackerInstanceId: string; filter: "rested" | "singleCore" | "recovered" } | null
}

// 指定アタック（canDirectAttack）を現在レベルで持っているか（サーバー validateAttack と同じロジックの簡易版）
export function canDirectAttack(inst: CardInstance): "rested" | "singleCore" | "recovered" | null {
    const constraint = activeConstraints(inst).find((c) => c.type === "canDirectAttack")
    if (!constraint || constraint.type !== "canDirectAttack") return null
    return constraint.targetFilter
}

// 指定アタックの対象条件（rested/singleCore/recovered）に、相手スピリットが合致するか
export function matchesDirectedAttackFilter(
    filter: "rested" | "singleCore" | "recovered",
    target: CardInstance,
): boolean {
    if (filter === "rested") return target.isRested
    if (filter === "recovered") return !target.isRested
    return target.cores === 1
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

// ---- 描画本体 ----

export function render(view: GameView, ui: UiState): void {
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
    $("turn-info").textContent = `ターン${view.turn}`
    $("phase-info").textContent = `${PHASE_LABELS[view.phase]}ステップ（${myTurn ? "あなた" : "相手"}のターン）`

    // フラッシュ状態の表示
    show("flash-info", !!view.battle && view.isFlashTiming)
    if (view.battle && view.isFlashTiming) {
        $("flash-info").textContent = `フラッシュ（優先権: ${hasPriority ? "あなた" : "相手"}）`
    }

    show("btn-attack-phase", myMainFree)
    show("btn-end-turn", myTurn && !view.battle && (view.phase === "main" || view.phase === "attack"))
    show("btn-take-life", canDefend && !view.battle?.blockerInstanceId)
    show("btn-pass", inFlash)
    const anyMode =
        ui.targeting !== null || ui.awakenTarget !== null || ui.paying !== null || ui.directedAttack !== null
    show("btn-cancel-target", anyMode)
    show("btn-attack-player", ui.directedAttack !== null)
    show("targeting-info", anyMode)
    if (ui.paying !== null) {
        const remaining = payingRemaining(view, ui.paying)
        $("targeting-info").textContent =
            `コアが足りません。スピリット上のコアを割り当ててください（残り${remaining}個）`
    } else if (ui.awakenTarget !== null) {
        $("targeting-info").textContent =
            "【覚醒】コアの移動元にする自分のスピリットを選んでください"
    } else if (ui.directedAttack !== null) {
        $("targeting-info").textContent =
            "アタック対象の相手スピリットを選択（またはプレイヤーへアタック）"
    } else if (ui.targeting) {
        $("targeting-info").textContent =
            ui.targeting.side === "opponent"
                ? "対象にする相手スピリットを選んでください"
                : "対象にする自分のスピリットを選んでください"
    }

    // プレイヤー情報
    renderInfo("opp-info", view, opp, false)
    renderInfo("my-info", view, you, true)

    // フィールド
    renderField("opp-spirits", "opp-nexuses", view, ui, opp, false)
    renderField("my-spirits", "my-nexuses", view, ui, you, true)

    // 手札
    renderHand(view, ui)

    // バトル情報
    renderBattle(view)

    // ログ
    const logEl = $("log")
    logEl.innerHTML = ""
    for (const line of view.log) {
        const div = document.createElement("div")
        div.textContent = line
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
): void {
    const p = view.players[pid]
    const el = $(id)
    el.innerHTML = ""
    const items: [string, string][] = [
        ["", p.name + (view.turnPlayer === pid ? " ⏵ターン中" : "")],
        ["life", `ライフ ${"♥".repeat(p.life)}（${p.life}）`],
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
    el.dataset.side = isMine ? "mine" : "opp"

    const name = document.createElement("div")
    name.className = "name"
    name.textContent = m.name
    el.appendChild(name)

    const stats = document.createElement("div")
    stats.className = "stats"
    stats.textContent = isNexus
        ? `ネクサス Lv${level}`
        : `Lv${level} BP${bp}${inst.tempBpBuff ? "↑" : ""}`
    el.appendChild(stats)

    const cores = document.createElement("div")
    cores.className = "cores"
    cores.textContent = `◉ コア ${inst.cores}`
    el.appendChild(cores)

    if (m.effect) {
        const eff = document.createElement("div")
        eff.className = "effect-text"
        eff.textContent = m.effect
        el.appendChild(eff)
    }

    if (view.battle?.attackerInstanceId === inst.instanceId) {
        el.classList.add("attacker-mark")
    }

    if (isNexus) return el

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
        const cantAttack = activeConstraints(inst).some((c) => c.type === "cantAttack")
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
        // 使用中マジックの色に対する装甲持ちは選択不可
        if (ui.targeting?.side === "opponent" && !isUntargetableByOpponent(inst)) {
            const usingCardId = view.players[view.you].hand?.[ui.targeting.handIndex]
            const usingColor = usingCardId ? master(usingCardId).color : undefined
            if (!hasArmorAgainst(inst, usingColor)) {
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

    hand.forEach((cardId, index) => {
        const m = master(cardId)
        const cost = effectiveCost(view, view.you, m)
        const lv1 = m.levels.find((l) => l.level === 1)
        const need = cost + (lv1 ? lv1.cores : 0)

        const usable =
            (myMainFree && reserve >= need) ||
            (inFlash && !flashLocked && m.type === "magic" && m.flash && reserve >= cost)

        const el = document.createElement("div")
        el.className = `card color-${m.color}`
        el.dataset.handIndex = String(index)
        if (usable) el.classList.add("usable", "clickable")

        const typeLabel =
            m.type === "spirit" ? "スピリット" : m.type === "nexus" ? "ネクサス" : "マジック"

        const name = document.createElement("div")
        name.className = "name"
        name.textContent = m.name
        el.appendChild(name)

        const stats = document.createElement("div")
        stats.className = "stats"
        stats.textContent = `${COLOR_LABELS[m.color]}/${typeLabel} コスト${cost}${cost !== m.cost ? `(${m.cost})` : ""}`
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

    let message: string
    if (blocked) {
        // ブロック宣言後の追加フラッシュ
        if (isDefender) {
            if (view.isFlashTiming && hasPriority) {
                message = `⚔ ${m.name}（BP${bp}）をブロック宣言中。追加でフラッシュマジックを使うか「パス」してください。`
            } else {
                message = `⚔ ${m.name}（BP${bp}）をブロック宣言中。相手の対応を待っています…`
            }
        } else {
            if (view.isFlashTiming && hasPriority) {
                message = `⚔ ${m.name}（BP${bp}）はブロックされました。フラッシュマジックを使うか「パス」してください。`
            } else {
                message = `⚔ ${m.name}（BP${bp}）はブロックされました。相手の対応を待っています…`
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
        const effect = card.querySelector(".effect-text")?.textContent
        if (!effect) return
        const name = card.querySelector(".name")?.textContent ?? ""
        tip.innerHTML = ""
        const title = document.createElement("div")
        title.className = "tooltip-name"
        title.textContent = name
        tip.appendChild(title)
        tip.appendChild(document.createTextNode(effect))
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
