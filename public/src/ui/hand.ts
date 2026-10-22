// 手札の表示
import { handToggleTarget, markSelected } from "../handToggleChoice"
import type { GameView } from "../../../server/src/type"
import { CARD_TYPE_LABELS, COLOR_LABELS } from "../../../data/constants"
import { effectiveCost, hasMagicRestriction, ownFieldSymbolColors } from "../../../shared/cost"
import { attachCardArt } from "../cardArt"
import { hasHandKeywordGrant, flashSummonFromHandNow, hasKeyword, burstSetCoresRequired, timedFlashLocked, timedMagicLocked, magicColorBanned } from "../../../shared/rules"
import { handBurstEffectDenial } from "../../../shared/handBurstEffect"
import { payableFieldCores, payingAltPay } from "./paying"
import { master, UiState, $ } from "../renderer"

export function renderHand(view: GameView, ui: UiState): void {
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
    const flashLocked = timedFlashLocked(view, view.you)
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
                hasHandKeywordGrant(view, view.you, m, "soku") ||
                flashSummonFromHandNow(view, view.you, cardId))

        // 【烈神速】：トラッシュのコア5個以上ならコストを支払わず召喚できる（BS16-X03）。
        // コストはトラッシュのコアから賄うので、reserve >= need の判定は通さない
        const resshinsokuReady =
            m.type === "spirit" &&
            hasKeyword(cardId, "resshinsoku") &&
            view.players[view.you].trashCores >= 5

        // 力奪う凱旋門：相手フィールドに発生源があれば、自分のフィールドのシンボル色と一致しない
        // 色のマジックは使用不可（クリック自体は可能だが usable ハイライトからは除外する）
        const magicColorLocked =
            m.type === "magic" &&
            hasMagicRestriction(view, view.you, "colorLockOpponent") &&
            !m.colors.some((c) => ownFieldSymbolColors(view, view.you).has(c))
        // battleLock "magic"（BS16-X06）：メイン・フラッシュとも使用不可（バースト発動は別経路なので掛からない）
        const magicBattleLocked = m.type === "magic" && (timedMagicLocked(view, view.you) || magicColorBanned(view, view.you, m.colors))

        const fieldCores = payableFieldCores(view, cardId)
        const isTimingValid =
            (myMainFree) ||
            (inFlash && !flashLocked && ((m.type === "magic" && m.flash) || flashSummonable || resshinsokuReady))

        const isUsableState = !view.pendingChoice && !magicColorLocked && !magicBattleLocked && isTimingValid
        const usable = isUsableState && (resshinsokuReady || reserve >= need)
        const usableField = isUsableState && !usable && (reserve + fieldCores >= need)
        const unusable = !usable && !usableField

        let targetable = false
        let activeIndex = index
        const toggle = handChoiceIndices ? handToggleTarget(g.indices, handChoiceIndices, view) : null
        if (toggle?.target !== undefined) {
            targetable = true
            activeIndex = toggle.target
        }

        const el = document.createElement("div")
        el.className = "card"
        el.style.setProperty("--c-main", `var(--c-${m.colors[0]})`)
        el.style.setProperty("--c-sub", `var(--c-${m.colors[m.colors.length > 1 ? 1 : 0]})`)
        el.dataset.handIndex = String(activeIndex)
        el.dataset.cardId = cardId
        attachCardArt(el, cardId, m.name)
        
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
        markSelected(el, toggle?.selected ?? 0)

        // 召喚・配置・マジック使用のために選択されたカードをハイライト
        const selectedHandIndex =
            ui.paying?.handIndex ??
            ui.soulCoreOnlySelect?.handIndex ??
            ui.magicTimingSelect?.handIndex ??
            ui.exReductionSelect?.handIndex ??
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
        costBadge.className = `cost-badge cost-${m.type}`
        // 軽減前のコストは出さず、軽減されているときだけバッジを緑にする（2026-10-04 ユーザー指示）
        if (cost < m.cost) costBadge.classList.add("discounted")
        costBadge.textContent = String(cost)
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

        // バーストセットボタン（docs/design/BURST.md）：kind:"burst"を持つカードにだけ出す。
        // 通常のカード種別ごとの使い方（召喚・配置・使用）とは別枠の操作なので、
        // カード本体のクリックとは独立したバッジボタンとして重ねる
        if (m.effects.some((e) => e.kind === "burst")) {
            const burstSetThisTurn = view.players[view.you].burstSetThisTurn
            // BS16-067氷聖女の塔Lv2：相手の効果でリザーブのコアが足りなければセットできない
            const burstCoresRequired = burstSetCoresRequired(view, view.you)
            const burstCoresShort = burstCoresRequired > 0 && view.players[view.you].reserve < burstCoresRequired
            const canSetBurst = myMainFree && !view.pendingChoice && !burstSetThisTurn && !burstCoresShort
            const badge = document.createElement("button")
            badge.className = "burst-set-badge" + (canSetBurst ? "" : " disabled")
            badge.dataset.burstSet = String(index)
            badge.textContent = "バーストセット"
            badge.title = burstSetThisTurn
                ? "このターンはすでにバーストをセットしています"
                : burstCoresShort
                  ? `相手の効果により、セットにはリザーブのコアが${burstCoresRequired}個必要です`
                  : "バーストエリアに伏せてセットする"
            badge.disabled = !canSetBurst
            el.appendChild(badge)
        }

        // 手札から使う効果ボタン（kind:"handActivated"。BS15-011ミーアバット）。
        // 神速召喚の召喚ボタンと同じ並びで、カード本体のクリックとは独立したバッジボタンにする
        // （マジックではないので castMagic の対象選択UIには乗せない。サーバーは useHandAbility を送る）
        const handAbility = m.effects.find((e) => e.kind === "handActivated")
        if (handAbility && handAbility.kind === "handActivated") {
            const phaseOk = handAbility.phase === undefined || view.phase === handAbility.phase
            const canUseAbility = inFlash && !flashLocked && phaseOk && !view.pendingChoice
            const badge = document.createElement("button")
            badge.className = "hand-ability-badge" + (canUseAbility ? "" : " disabled")
            badge.dataset.handAbility = String(index)
            badge.dataset.handAbilityEffectId = handAbility.id
            badge.textContent = "効果を使う"
            badge.title = "手札のこのカードを破棄して効果を発動する"
            badge.disabled = !canUseAbility
            el.appendChild(badge)
        }

        // 手札のバースト効果を使うボタン（handBurstEffectGrant）。通常の使用とは別操作で、使える場面でだけ出す
        if (handBurstEffectDenial(view, view.you, cardId) === null) {
            const canUse = !view.pendingChoice && reserve + fieldCores >= cost
            const badge = document.createElement("button")
            badge.className = "hand-ability-badge" + (canUse ? "" : " disabled")
            badge.dataset.handBurstEffect = String(index)
            badge.textContent = "バースト効果を使う"
            badge.title = `コスト${cost}を支払い、バースト条件を無視してバースト効果を発揮する`
            badge.disabled = !canUse
            el.appendChild(badge)
        }

        handEl.appendChild(el)
    })
}
