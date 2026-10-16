// フィールドのスピリット・ネクサス1枚の表示（コア・レベル・ボタン）
import type { CardInstance, GameView, PlayerId } from "../../../server/src/type"
import { braveCombineCandidates } from "../../../shared/summon"
import { attachCardArt } from "../cardArt"
import { activeConstraints, cantActByTimed, instCostCantAct, effectiveBp, hasGlobalConstraint, minLevelCores, effectActiveAtLevel, boardResistanceAgainst, bravesOf, instanceSymbolColors } from "../../../shared/rules"
import { payingCardId } from "./paying"
import { master, COLOR_SYMBOLS, levelOf, canBlockAttacker, canAwaken, activatableAbility, UiState, matchesDirectedAttackFilter, $ } from "../renderer"

export function renderField(
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
export function coreButtonsEl(
    instanceId: string,
    currentCores: number,
    levels: { level: number, cores: number }[],
    // [ソウルコア]の置き/戻しボタンを出すか（メインステップの自分フィールドのみ渡す）
    soulOpts?: { soulHere: boolean; soulInReserve: boolean },
): HTMLElement {
    const btns = document.createElement("div")
    btns.className = "core-buttons"

    const removeBtn = document.createElement("button")
    removeBtn.dataset.core = "remove"
    removeBtn.dataset.instanceId = instanceId
    removeBtn.textContent = "−"
    removeBtn.title = "コアを1個リザーブへ戻す"
    btns.appendChild(removeBtn)

    // この個体の[ソウルコア]をリザーブへ戻す
    if (soulOpts?.soulHere) {
        const soulRemoveBtn = document.createElement("button")
        soulRemoveBtn.dataset.core = "remove-soul"
        soulRemoveBtn.dataset.instanceId = instanceId
        soulRemoveBtn.textContent = "魂−"
        soulRemoveBtn.title = "[ソウルコア]をリザーブへ戻す"
        btns.appendChild(soulRemoveBtn)
    }

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

    // リザーブの[ソウルコア]をこの個体に置く（docs/design/SOULCORE.md §1.4の自由なコア移動）
    if (soulOpts?.soulInReserve) {
        const soulAddBtn = document.createElement("button")
        soulAddBtn.dataset.core = "add-soul"
        soulAddBtn.dataset.instanceId = instanceId
        soulAddBtn.textContent = "魂＋"
        soulAddBtn.title = "リザーブの[ソウルコア]をこの個体に置く"
        btns.appendChild(soulAddBtn)
    }

    return btns
}

export function fieldCardEl(
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
    if (inst.heavyRested) el.classList.add("heavy-rested")
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
            // ホストの**右へ半分ずらして重ねる**（BRAVE.md §6.4。実物の合体の見た目に寄せる）。
            // ずらしたぶんの幅は has-brave の margin-right で確保する（隣のカードと重ならないように）
            el.classList.add("has-brave")
            const box = document.createElement("div")
            box.className = "brave-combined-box"
            for (const brave of braves) {
                const row = document.createElement("div")
                row.className = "brave-combined"
                row.dataset.instanceId = brave.instanceId
                row.dataset.cardId = brave.cardId
                const braveName = master(brave.cardId).name
                // はみ出す幅は40pxしかないので、名前は**縦書き**で出す（日本語はこの向きで読める）。
                // 収まらない分は省略されるので、フル名は title 属性で見せる。
                // レベルは出さない（合体中のブレイヴのレベルはホストのコア数で決まるので、
                // ホストのカードが出している Lv 表示と二重になる。2026-09-02 ユーザー指示）
                const nameEl = document.createElement("span")
                nameEl.className = "brave-name"
                nameEl.textContent = braveName
                row.appendChild(nameEl)
                row.title = `合体中: ${braveName}`
                // メインステップの任意分離（§6.4）。自分のブレイヴだけ、自分のメインステップに出す
                if (isMine && myTurn && view.phase === "main" && !view.battle && view.pendingChoice === null) {
                    const need = minLevelCores(master(brave.cardId))
                    const btn = document.createElement("button")
                    btn.className = "detach-badge"
                    btn.dataset.detach = brave.instanceId
                    btn.textContent = "分離"
                    btn.title = `分離してスピリット状態にする（コア${need}個が必要）`
                    row.appendChild(btn)
                }
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

    attachCardArt(el, inst.cardId, m.name)

    const name = document.createElement("div")
    name.className = "name"
    name.textContent = m.name
    el.appendChild(name)

    // Lv・BP・コア数は .card-overlay にまとめる。画像表示のときは疲労で回転しても
    // 正位置のまま読めるよう、この枠だけ逆回転させる（CSS）。画像なしなら display:contents で素通し
    const overlay = document.createElement("div")
    overlay.className = "card-overlay"
    const stats = document.createElement("div")
    stats.className = "stats"
    const lvEl = document.createElement("span")
    lvEl.className = "stat-lv"
    lvEl.textContent = `Lv${level}`
    stats.appendChild(lvEl)
    if (!isNexus) {
        const bpEl = document.createElement("span")
        bpEl.className = "stat-bp"
        bpEl.textContent = `BP${bp}${inst.tempBpBuff ? "↑" : ""}`
        stats.append(" ", bpEl)
    }
    overlay.appendChild(stats)

    // コストバッジを左上に表示
    const costBadge = document.createElement("div")
    costBadge.className = `cost-badge cost-${m.type}`
    costBadge.textContent = String(m.cost)
    el.appendChild(costBadge)

    const cores = document.createElement("div")
    cores.className = "cores"
    // [ソウルコア]が載っている個体には画像バッジ（soulcore.png）で示すため、コア数値は通常コアのみ（2026-10-06 ユーザー確認）
    const soulOnThis =
        view.players[ownerPid].soulCore?.zone === "instance" &&
        view.players[ownerPid].soulCore.instanceId === inst.instanceId
    // 支払いモード中は支払い後のコア数を並記する（例: ◉ コア 4→2。2026-10-06 ユーザー要望）
    const payAssigned = ui.paying?.assigned[inst.instanceId] ?? 0
    const paySoulHere = ui.paying?.soulPayInstanceId === inst.instanceId ? 1 : 0
    const afterPay = inst.cores - payAssigned - paySoulHere
    cores.textContent = `◉ コア ${inst.cores}${afterPay !== inst.cores ? `→${afterPay}` : ""}`
    overlay.appendChild(cores)
    el.appendChild(overlay)
    // [ソウルコア]が載っている個体には画像バッジを重ねる（公開情報。docs/design/SOULCORE.md）
    if (soulOnThis) {
        const soulBadge = document.createElement("div")
        soulBadge.className = "soul-core-badge"
        soulBadge.title = "[ソウルコア]"
        el.appendChild(soulBadge)
    }

    const symbolsDiv = document.createElement("div")
    symbolsDiv.className = "symbols"
    const symbols = instanceSymbolColors(inst)
    if (symbols.length === 0) {
        symbolsDiv.textContent = "無"
        symbolsDiv.style.color = "var(--text-muted)"
        symbolsDiv.style.fontSize = "10px"
    } else {
        symbols.forEach(symColor => {
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
        // ネクサスの起動能力（BS11-067 白き楯の長城Lv2＝コアを払ってバトル終了）。
        // 判定はスピリットと同じ共有層（activatableAbility）に任せる
        if (isMine) {
            const nexusActivatable = activatableAbility(view, view.you, inst)
            if (nexusActivatable) {
                const badge = document.createElement("button")
                badge.className = "activate-badge"
                badge.dataset.activate = inst.instanceId
                badge.dataset.effect = nexusActivatable.effectId
                badge.textContent = "起動"
                badge.title = nexusActivatable.costLabel
                el.appendChild(badge)
            }
        }
        // 支払いモード中：自分のネクサス上のコアも支払いに割り当てられる
        if (isMine && ui.paying !== null) {
            const assigned = ui.paying.assigned[inst.instanceId] ?? 0
            const soulPayHere = ui.paying.soulPayInstanceId === inst.instanceId
            // 案B-inside: coresには[ソウルコア]が含まれる。[ソウルコア]は専用ボタンで支払うため、
            // クリック割り当ての上限は通常コア数にする（2026-10-06）
            const normals = inst.cores - (soulOnThis ? 1 : 0)
            if (assigned > 0 || soulPayHere) {
                const badge = document.createElement("div")
                badge.className = "pay-badge"
                badge.textContent = soulPayHere ? `支払${assigned}＋魂` : `支払${assigned}`
                el.appendChild(badge)
            }
            if (assigned < normals) {
                el.classList.add("targetable", "clickable")
            }
            // [ソウルコア]が載っているときは[ソウルコア]の使い方を選ぶ専用ボタンを出す（2026-10-06）。
            // クリックで 使わない→コスト→維持コア→使わない のサイクル
            if (soulOnThis && ui.paying.forDetachBraveInstanceId === undefined && ui.paying.forBraveKeep === undefined) {
                const soulBtn = document.createElement("button")
                soulBtn.className = "soul-pay-badge"
                soulBtn.dataset.soulpay = inst.instanceId
                const payMode = soulPayHere ? (ui.paying.soulPayMode ?? "cost") : "none"
                const placesCores =
                    ui.paying.braveTargetInstanceId === undefined &&
                    payingCardId(view, ui.paying) !== undefined &&
                    master(payingCardId(view, ui.paying)!).type !== "magic"
                if (payMode === "cost") {
                    soulBtn.classList.add("active")
                    soulBtn.title = "この個体の[ソウルコア]をコスト支払いに使う（→トラッシュ）"
                    soulBtn.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]">コスト`
                } else if (payMode === "maintain") {
                    soulBtn.classList.add("active", "maintain")
                    soulBtn.title = "この個体の[ソウルコア]を維持コアとして場のカードに置く"
                    soulBtn.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]">維持`
                } else {
                    soulBtn.title = "この個体の[ソウルコア]を支払いに使う（クリックで切り替え）"
                    soulBtn.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]">使わない`
                }
                if (payMode === "none" && !placesCores) {
                    // コアを置かない支払い（マジック等）では維持コアの選択肢が無いことを明記
                    soulBtn.title = "この個体の[ソウルコア]をコスト支払いに使う"
                }
                el.appendChild(soulBtn)
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

    // 期間つき効果でアタック不可（ピュアエリクサー等で回復した個体・「〜すべてはアタックできない」）
    if (!isNexus && cantActByTimed(view, inst)) {
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
            const soulPayHere = ui.paying.soulPayInstanceId === inst.instanceId
            // 案B-inside: coresには[ソウルコア]が含まれる。[ソウルコア]は専用ボタンで支払うため、
            // クリック割り当ての上限は通常コア数にする（2026-10-06）
            const normals = inst.cores - (soulOnThis ? 1 : 0)
            if (assigned > 0 || soulPayHere) {
                const badge = document.createElement("div")
                badge.className = "pay-badge"
                badge.textContent = soulPayHere ? `支払${assigned}＋魂` : `支払${assigned}`
                el.appendChild(badge)
            }
            if (assigned < normals) {
                el.classList.add("targetable", "clickable")
            }
            // [ソウルコア]が載っているときは[ソウルコア]の使い方を選ぶ専用ボタンを出す（2026-10-06）。
            // クリックで 使わない→コスト→維持コア→使わない のサイクル
            if (soulOnThis && ui.paying.forDetachBraveInstanceId === undefined && ui.paying.forBraveKeep === undefined) {
                const soulBtn = document.createElement("button")
                soulBtn.className = "soul-pay-badge"
                soulBtn.dataset.soulpay = inst.instanceId
                const payMode = soulPayHere ? (ui.paying.soulPayMode ?? "cost") : "none"
                const placesCores =
                    ui.paying.braveTargetInstanceId === undefined &&
                    payingCardId(view, ui.paying) !== undefined &&
                    master(payingCardId(view, ui.paying)!).type !== "magic"
                if (payMode === "cost") {
                    soulBtn.classList.add("active")
                    soulBtn.title = "この個体の[ソウルコア]をコスト支払いに使う（→トラッシュ）"
                    soulBtn.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]">コスト`
                } else if (payMode === "maintain") {
                    soulBtn.classList.add("active", "maintain")
                    soulBtn.title = "この個体の[ソウルコア]を維持コアとして場のカードに置く"
                    soulBtn.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]">維持`
                } else {
                    soulBtn.title = "この個体の[ソウルコア]を支払いに使う（クリックで切り替え）"
                    soulBtn.innerHTML = `<img src="/imgs/soulcore.png" class="soul-core-inline" alt="[ソウルコア]">使わない`
                }
                if (payMode === "none" && !placesCores) {
                    // コアを置かない支払い（マジック等）では維持コアの選択肢が無いことを明記
                    soulBtn.title = "この個体の[ソウルコア]をコスト支払いに使う"
                }
                el.appendChild(soulBtn)
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
        // メインステップの任意合体（BRAVE.md §6.4）：スピリット状態のブレイヴにだけ「合体」を出す。
        // 候補の列挙は braveCombineCandidates に一本化する（サーバーの受理条件と同じ実装）
        if (myTurn && view.phase === "main" && !view.battle && master(inst.cardId).type === "brave") {
            const candidates = braveCombineCandidates(view, view.you, inst.cardId)
            if (candidates.length > 0) {
                const badge = document.createElement("button")
                badge.className = "combine-badge"
                badge.dataset.combine = inst.instanceId
                badge.textContent = "合体"
                badge.title = "クリックして合体先のスピリットを選ぶ（このブレイヴのコアはリザーブへ戻る）"
                el.appendChild(badge)
            }
        }
        // 任意合体モード中：合体先に選べるスピリットを強調する
        if (ui.combineBrave !== null && ui.combineBrave.candidateIds.includes(inst.instanceId)) {
            el.classList.add("targetable", "clickable")
        }
        // 起動能力（フラッシュ中のバトル／自分のメインステップで任意発動）：バッジのクリックで発動。
        // 出す条件は共有層の activatableAbility が一手に判定する（サーバーの受理条件と同じ実装）
        const activatable = activatableAbility(view, view.you, inst)
        if (activatable) {
            const badge = document.createElement("button")
            badge.className = "activate-badge"
            // 【合体時】の起動能力はブレイヴが持つので、起動対象はそのブレイヴの instanceId になる
            badge.dataset.activate = activatable.instanceId ?? inst.instanceId
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
        const costLocked = cantActByTimed(view, inst) || instCostCantAct(view, inst)
        // アタック可能（先攻1ターン目はアタック禁止）
        if (
            myTurn &&
            view.phase === "attack" &&
            view.turn !== 1 &&
            !view.battle &&
            !inst.isRested &&
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
        // [ソウルコア]の1:1交換モード中: 交換相手（通常コア1個以上の自分の個体）をハイライト
        if (ui.soulSwapSelect !== null && ui.soulSwapSelect.fromInstanceId !== inst.instanceId && inst.cores >= 1) {
            el.classList.add("targetable", "clickable")
        }
        // コア移動ボタン（メインステップのみ）＋[ソウルコア]の置き/戻し
        if (myMainFree) {
            const levelsToUse = inst.asSpiritThisTurn?.levels ?? m.levels
            el.appendChild(
                coreButtonsEl(inst.instanceId, inst.cores, levelsToUse, {
                    soulHere: soulOnThis,
                    soulInReserve: view.players[view.you].soulCore?.zone === "reserve",
                }),
            )
        }
        // [ソウルコア]の1:1交換（§1.4・メインステップのみ）: [ソウルコア]が載った個体に出す
        if (myMainFree && view.pendingChoice === null && soulOnThis && ui.paying === null) { // 支払いモード中は[ソウルコア]支払いボタンと被るため出さない
            const btn = document.createElement("button")
            btn.className = "soul-swap-badge"
            btn.dataset.soulswap = inst.instanceId
            btn.textContent = "魂交換"
            btn.title = "この個体の[ソウルコア]と、他の個体の通常コア1個を同時に交換する"
            el.appendChild(btn)
        }
    } else {
        // 指定アタックの対象選択モード中：フィルタに合う相手スピリットのみ選択可能
        if (ui.directedAttack !== null) {
            const attackerInst = view.players[view.you].field.spirits.find(
                (s) => s.instanceId === ui.directedAttack?.attackerInstanceId,
            )
            const attacker = attackerInst ? { pid: view.you, inst: attackerInst } : undefined
            if (matchesDirectedAttackFilter(ui.directedAttack.filter, inst, view, ownerPid, attacker)) {
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
