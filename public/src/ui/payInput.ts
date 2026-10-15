// コスト支払いの入力（自動／手動の切り替え、コアの割り当て、支払いの送信）
import type { GameView, PaySource } from "../../../server/src/type"
import { effectiveCost, hasKeyword, master } from "../renderer"
import { payingAltPay } from "./paying"
import { flashSummonFromHandNow, minLevelCores, placedCoresForSummon, sokuPayableInstanceIds } from "../../../shared/rules"
import { view, ui, send, rerender } from "../main"
import { sendPlay } from "./play"

// コアの支払い方式はブラウザごとに覚える。保存できない環境（プライベートモード等）では毎回「自動」に戻る
export const PAY_MODE_KEY = "bs_pay_mode"

export function loadPayMode(): "auto" | "manual" {
    try {
        return localStorage.getItem(PAY_MODE_KEY) === "manual" ? "manual" : "auto"
    } catch {
        return "auto"
    }
}

export function savePayMode(mode: "auto" | "manual"): void {
    try {
        localStorage.setItem(PAY_MODE_KEY, mode)
    } catch {
        // 保存できなくても、このタブの間は切り替えた方式で動く
    }
}

export function payModeLabel(mode: "auto" | "manual"): string {
    return mode === "manual" ? "🪙 支払い：手動" : "🪙 支払い：自動"
}

export function payModeHint(mode: "auto" | "manual"): string {
    return mode === "manual"
        ? "手動：コストを払うたびに支払い画面を開き、リザーブ・フィールドのコア・[ソウルコア]から支払い元を選びます。\nクリックで「自動」に切り替え"
        : "自動：[ソウルコア]以外のリザーブのコアで足りるときは、支払い画面を出さずにリザーブから払います（[ソウルコア]は使いません）。\n足りないときは支払い画面を開き、フィールドのコアから選びます。\nクリックで「手動」に切り替え"
}

// 支払いモードの内容を確定して送信する。代替コスト（手札破棄／デッキ破棄）も一緒に送る
// 支払い元の割り当てから paySources を組み立てる。案B-inside: 割り当て数がその個体の通常コア数を
// 超えていたら[ソウルコア]込みの指定で送る（個体の上の[ソウルコア]もコストとして使える。2026-10-06）
export function buildPaySources(view: GameView, assigned: Record<string, number>, soulPayInstanceId?: string, soulPayMode?: "cost" | "maintain"): PaySource[] {
    // soulPayInstanceId（対象カード上の専用ボタンで選んだ[ソウルコア]支払い）は assigned とは別に1個足す
    const ids = new Set([...Object.keys(assigned), ...(soulPayInstanceId !== undefined ? [soulPayInstanceId] : [])])
    return [...ids].map((id) => {
        const soulIncluded = soulPayInstanceId === id
        return {
            instanceId: id,
            count: (assigned[id] ?? 0) + (soulIncluded ? 1 : 0),
            ...(soulIncluded && soulPayMode === "maintain" ? { soulCoreToMaintain: true } : {}),
            ...(soulIncluded && soulPayMode !== "maintain" ? { includeSoulCore: true } : {}),
        }
    })
}

export function submitPaying(): void {
    if (!view || !ui.paying) return
    const pay = ui.paying
    // 場を離れるときにブレイヴを残す（BRAVE.md §6.3）：選択待ちの解決として支払う
    if (pay.forBraveKeep !== undefined) {
        send({
            type: "resolveChoice",
            option: pay.forBraveKeep.option,
            ...(Object.keys(pay.assigned).length > 0
                ? { paySources: Object.entries(pay.assigned).map(([id, count]) => ({ instanceId: id, count })) }
                : {}),
        })
        ui.paying = null
        return
    }
    if (pay.forBlock !== undefined || pay.forMeisai !== undefined || pay.forAttack !== undefined) {
        const sources = buildPaySources(view, pay.assigned, pay.soulPayInstanceId, "cost")
        const payment = {
            ...(sources.length > 0 ? { paySources: sources } : {}),
            ...(pay.useSoulCore === true ? { paySoulCoreFromReserve: true } : {}),
        }
        if (pay.forBlock !== undefined) send({ type: "block", instanceId: pay.forBlock.instanceId, ...payment })
        else if (pay.forAttack !== undefined) send({ type: "attack", instanceId: pay.forAttack.instanceId, ...(pay.forAttack.targetSpiritInstanceId !== undefined ? { targetSpiritInstanceId: pay.forAttack.targetSpiritInstanceId } : {}), ...payment })
        else send({ type: "resolveChoice", option: pay.forMeisai!.option, ...payment })
        ui.paying = null
        return
    }
    // 任意分離（BRAVE.md §6.4）：手札ではなく場の合体中ブレイヴが起点なので、ここで先に分岐する
    if (pay.forDetachBraveInstanceId !== undefined) {
        send({
            type: "detachBrave",
            braveInstanceId: pay.forDetachBraveInstanceId,
            ...(Object.keys(pay.assigned).length > 0
                ? { paySources: Object.entries(pay.assigned).map(([id, count]) => ({ instanceId: id, count })) }
                : {}),
        })
        ui.paying = null
        return
    }
    const cardId = view.players[view.you].hand?.[pay.handIndex]
    if (cardId === undefined) {
        ui.paying = null
        rerender()
        return
    }
    const card = master(cardId)
    const paySources: PaySource[] = buildPaySources(view, pay.assigned, pay.soulPayInstanceId, pay.soulPayMode)
    // 選択待ちの解決として支払う場合（「コストを支払って召喚できる」起動効果）は
    // summon ではなく resolveChoice を送る
    if (pay.forChoiceCardIndex !== undefined) {
        send({
            type: "resolveChoice",
            cardIndex: pay.forChoiceCardIndex,
            ...(paySources.length > 0 ? { paySources } : {}),
        })
        ui.paying = null
        return
    }
    sendPlay(
        card.type,
        pay.handIndex,
        pay.targetInstanceId,
        paySources.length > 0 ? paySources : undefined,
        pay.level,
        pay.substituteInstanceId,
        pay.discardHandIndices.length > 0 ? pay.discardHandIndices : undefined,
        pay.millPay > 0 ? pay.millPay : undefined,
        pay.braveTargetInstanceId,
        pay.altSummonNexusInstanceIds,
        pay.shinsokuAssistInstanceIds,
        pay.exReductionTrashIndices,
        pay.useSoulCore === true ? true : undefined,
        pay.placeSoulCore === true ? true : undefined,
    )
    ui.paying = null
}

// 支払いモード中に、代替コストの支払い量を変える。
// 手札破棄（ビクティム）は「すべて、または一部」なので1枚ずつ増減し、どの手札かは手札クリック側で選ぶ。
// デッキ破棄（栄光の表彰台）は**コア払いと併用できない**ので、全額払う／払わないのトグル（delta は見ない）
export function changeAltPay(delta: number): void {
    if (!view || !ui.paying) return
    const alt = payingAltPay(view, ui.paying)
    if (alt.kind === "mill") {
        ui.paying.millPay = ui.paying.millPay > 0 ? 0 : alt.max
    } else if (alt.kind === "handDiscard" && delta < 0) {
        ui.paying.discardHandIndices.pop()
    }
    rerender()
}

// 支払いモード中に、手札1枚を「破棄して払う」対象として選ぶ／外す（BS08ビクティム）
export function toggleDiscardPay(handIndex: number): void {
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

// 選択待ちで選んだカードのコストがリザーブだけでは足りないとき、通常の召喚と同じ
// 支払いモードを開始する（開始したら true）。フィールドのコアでも足りないカードは
// そもそもサーバーが候補に入れないので、ここでは不足＝フィールドから払う場面とみなす。
// 対象は「コストを支払う」2種：
//   summonFromHandFree.payCost   手札から召喚（BS08帝竜騎サイクル）
//   moveCards.pay:"cost"         トラッシュから召喚（BS07常闇の聖堂）・トラッシュのマジックを使用（BS08-X33ミカファール）
export function startChoicePaying(cardIndex: number): boolean {
    if (!view || !view.pendingChoice) return false
    // 既にこの選択の支払い中なら、クリックでは何もしない（割り当てをリセットさせない）
    if (ui.paying?.forChoiceCardIndex !== undefined) return true
    const action = view.pendingChoice.action as { type?: string; payCost?: true; pay?: string } | undefined
    const zone = view.pendingChoice.cardZone === "trash" ? "trash" : "hand"
    const paysCost = (action?.type === "summonFromHandFree" && action.payCost === true) || (action?.type === "moveCards" && action.pay === "cost")
    if (!paysCost) return false
    const player = view.players[view.you]
    const cardId = zone === "trash" ? player.trashCards[cardIndex] : player.hand?.[cardIndex]
    if (cardId === undefined) return false
    const card = master(cardId)
    // マジックには「置くコア」が無いのでコストだけ
    const need = effectiveCost(view, view.you, card) + (card.type === "magic" ? 0 : minLevelCores(card))
    // 案B-inside: [ソウルコア]ぶんを差し引いた通常コアでauto判定する
    if (ui.payMode === "auto" && player.reserve - (player.soulCore?.zone === "reserve" ? 1 : 0) >= need) return false
    ui.paying = {
        handIndex: cardIndex,
        forChoiceCardIndex: cardIndex,
        ...(zone === "trash" ? { choiceZone: zone } : {}),
        assigned: {},
        discardHandIndices: [],
        millPay: 0,
        shinsokuAssistInstanceIds: [],
    }
    rerender()
    return true
}

// 支払いモード中、指定スピリットにコアを1個割り当てる。合計が必要数に達したら自動送信する。
export function assignPayCore(instanceId: string): void {
    if (!view || !ui.paying) return
    const pay = ui.paying
    const player = view.players[view.you]
    const inst =
        player.field.spirits.find((s) => s.instanceId === instanceId) ??
        player.field.nexuses.find((n) => n.instanceId === instanceId)
    if (!inst) return
    // 残すブレイヴに置くコア（BRAVE.md §6.3）。起点は場のどこにも無いので必要数は選択待ちから来る
    if (pay.forBraveKeep !== undefined) {
        assignOneCore(pay, instanceId, inst.cores, pay.forBraveKeep.need, player.reserve)
        return
    }
    if (pay.forAttack !== undefined) {
        const soulLoc = player.soulCore
        const normals = inst.cores - (soulLoc?.zone === "instance" && soulLoc.instanceId === inst.instanceId ? 1 : 0)
        const usable = instanceId === pay.forAttack.instanceId ? Math.min(normals, inst.cores - minLevelCores(master(inst.cardId))) : normals
        assignOneCore(pay, instanceId, usable, pay.forAttack.need, player.reserve - (soulLoc?.zone === "reserve" ? 1 : 0))
        return
    }
    if (pay.forBlock !== undefined) {
        // ブロックするスピリット自身は維持コア（Lv1）を残す（割ると宣言と同時に消滅する。サーバーも弾く）
        const soulLoc = player.soulCore
        const normals = inst.cores - (soulLoc?.zone === "instance" && soulLoc.instanceId === inst.instanceId ? 1 : 0)
        const usable = instanceId === pay.forBlock.instanceId ? Math.min(normals, inst.cores - minLevelCores(master(inst.cardId))) : normals
        assignOneCore(pay, instanceId, usable, pay.forBlock.need, player.reserve - (soulLoc?.zone === "reserve" ? 1 : 0))
        return
    }
    if (pay.forMeisai !== undefined) {
        const soulLoc = player.soulCore
        const normals = inst.cores - (soulLoc?.zone === "instance" && soulLoc.instanceId === inst.instanceId ? 1 : 0)
        assignOneCore(pay, instanceId, normals, pay.forMeisai.need, player.reserve - (soulLoc?.zone === "reserve" ? 1 : 0))
        return
    }
    // 任意分離（BRAVE.md §6.4）は**手札が起点ではない**ので、先にここで分岐する。
    // コストは無く、必要なのは置くコア（そのブレイヴのスピリット状態のLv1維持コスト）だけ
    if (pay.forDetachBraveInstanceId !== undefined) {
        const brave = player.field.combinedBraves.find((b) => b.instanceId === pay.forDetachBraveInstanceId)
        if (!brave) {
            ui.paying = null
            rerender()
            return
        }
        // 案B-inside: coresには[ソウルコア]が含まれる。[ソウルコア]は専用ボタンで支払うため上限は通常コア
        const soulLoc = view.players[view.you].soulCore
        const soulOnDetachSrc = soulLoc !== null && soulLoc.zone === "instance" && soulLoc.instanceId === inst.instanceId
        assignOneCore(pay, instanceId, inst.cores - (soulOnDetachSrc ? 1 : 0), minLevelCores(master(brave.cardId)), player.reserve)
        return
    }
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
    if (view.isFlashTiming && card.type === "spirit" && (hasKeyword(cardId, "soku") || flashSummonFromHandNow(view, view.you, cardId))) {
        if (!sokuPayableInstanceIds(view, view.you).has(instanceId)) return
    }
    // payingRemaining（renderer）と同じ計算にすること。
    // 代替召喚は召喚コスト0、ダイレクトブレイヴは維持コアを置かない
    const cost = pay.altSummonNexusInstanceIds ? 0 : effectiveCost(view, view.you, card)
    // [ソウルコア]を維持コアに使う選択の《真界放》マーカー付きはwaiver配置（1コア）
    const maintain =
        card.type === "magic" || pay.braveTargetInstanceId !== undefined
            ? 0
            : placedCoresForSummon(card, pay.level, { placeSoulCoreFromReserve: pay.placeSoulCore === true })
    const assignedTotal = Object.values(pay.assigned).reduce((a, b) => a + b, 0)
    const already = pay.assigned[instanceId] ?? 0
    // 代替コスト（手札破棄／デッキ破棄）で肩代わりしたぶん、コアで払う額が減る
    const alt = payingAltPay(view, pay)
    const need = cost + maintain - Math.min(alt.used, cost)
    // フィールドのコアはコストにも置くコアにも充当できるため、上限は need
    // 案B-inside: [ソウルコア]トグルを使っていないときは通常コアぶんで足りるかを見る
    const soulUsable = pay.useSoulCore === true || pay.placeSoulCore === true || player.soulCore?.zone !== "reserve"
    // 案B-inside: coresには[ソウルコア]が含まれる。[ソウルコア]は専用ボタンで支払うため上限は通常コア
    const soulLoc2 = player.soulCore
    const soulOnPayingSrc = soulLoc2 !== null && soulLoc2.zone === "instance" && soulLoc2.instanceId === inst.instanceId
    assignOneCore(pay, instanceId, inst.cores - (soulOnPayingSrc ? 1 : 0), need, soulUsable ? player.reserve : player.reserve - 1)
}

// 支払い元1つにコアを1個割り当て、必要数に達したら送信する。
// 召喚・配置と任意分離で共通（need の求め方だけが呼び出し側で違う）
export function assignOneCore(
    pay: { assigned: Record<string, number>; soulPayInstanceId?: string | undefined },
    instanceId: string,
    instCores: number,
    need: number,
    reserve: number,
): void {
    const assignedTotal = Object.values(pay.assigned).reduce((a, b) => a + b, 0)
    const already = pay.assigned[instanceId] ?? 0
    // 必要数に到達済みならそれ以上割り当てない（[ソウルコア]ボタンぶんも数える。過払いは選べない）
    if (assignedTotal + (pay.soulPayInstanceId !== undefined ? 1 : 0) >= need) return
    if (already >= instCores) return // このスピリットのコアを使い切った
    pay.assigned[instanceId] = already + 1
    if (ui.payMode === "auto" && reserve + assignedTotal + 1 + (pay.soulPayInstanceId !== undefined ? 1 : 0) >= need) {
        // 必要数に達したので送信する（代替コストの選択も submitPaying が一緒に送る）
        submitPaying()
        return
    }
    rerender()
}
