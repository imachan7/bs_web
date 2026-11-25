// 召喚・配置の支払いを「①コスト → ②置くコア」の2段で見せる画面と、その入力。
// 状態は PayingState の step／costAssigned／costReserve／placeReserve に持つ。①②は画面の上で分けて数えるだけで、
// サーバーへ送る形（assigned の合計＝paySources）は変えない。リザーブの取り分はサーバーが残りから取るので送らない
import type { CardInstance, GameView } from "../../../server/src/type"
import { flashSummonFromHandNow, minLevelCores, ownHandKeyword, sokuPayableInstanceIds, summonLevelCostBonus, summonMinCores } from "../../../shared/rules"
import { master } from "../renderer"
import type { UiState } from "../renderer"
import { payableFieldCores, payingCardId, payingStageFilled, payingStageNeeds, type PayingState } from "./paying"

// 本体（main.ts）の状態と操作は起動時に受け取る。ここから main.ts や payInput.ts を読み込むと、
// renderer 経由でブラウザの無い smoke に通信の初期化まで入って落ちる
interface PayStageDeps { view: () => GameView | null; ui: UiState; rerender: () => void; submitPaying: () => void }
let deps: PayStageDeps | null = null
export function installPayStages(d: PayStageDeps): void {
    deps = d
}
const ui = (): UiState => {
    if (!deps) throw new Error("installPayStages が呼ばれていない")
    return deps.ui
}

type Stage = "cost" | "place"
type Inst = CardInstance

const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0)

function fieldInsts(v: GameView): Inst[] {
    const p = v.players[v.you]
    return [...p.field.spirits, ...p.field.nexuses]
}

// 通常コアのリザーブ（[ソウルコア]は専用の選び方があるので数えない）
function reservePool(v: GameView): number {
    const p = v.players[v.you]
    return p.reserve - (p.soulCore?.zone === "reserve" ? 1 : 0)
}

// 1個体から取れる通常コア数。【神速】召喚は sokuPaySourceGrant が許した個体だけ（サーバー validateSummon と同じ共有実装）
function usableOn(v: GameView, pay: PayingState, inst: Inst): number {
    const soul = v.players[v.you].soulCore
    const soulHere = soul?.zone === "instance" && soul.instanceId === inst.instanceId ? 1 : 0
    const cardId = payingCardId(v, pay)
    if (pay.forMeisai === undefined && cardId !== undefined && v.isFlashTiming) {
        const t = master(cardId).type
        const soku = (t === "spirit" || t === "brave") && (ownHandKeyword(v, cardId, "soku") || flashSummonFromHandNow(v, v.you, cardId))
        if (soku && !sokuPayableInstanceIds(v, v.you).has(inst.instanceId)) return 0
    }
    return inst.cores - soulHere
}

function stageField(pay: PayingState, stage: Stage): Record<string, number> {
    const cost = pay.costAssigned ?? {}
    if (stage === "cost") return { ...cost }
    const out: Record<string, number> = {}
    for (const [id, n] of Object.entries(pay.assigned)) if (n - (cost[id] ?? 0) > 0) out[id] = n - (cost[id] ?? 0)
    return out
}

function resetStage(pay: PayingState, stage: Stage): void {
    if (stage === "cost") {
        pay.assigned = stageField(pay, "place")
        pay.costAssigned = {}
        pay.costReserve = 0
    } else {
        pay.assigned = { ...(pay.costAssigned ?? {}) }
        pay.placeReserve = 0
    }
}

// 置く数が変わると②で数えたものが合わなくなるので、②だけやり直す
function changePlace(pay: PayingState, change: () => void): void {
    change()
    resetStage(pay, "place")
}

// 効果による召喚の「置く数」を選び直す（PendingChoice の options の位置。need はその位置の置くコアに合わせる）
function setMeisaiOption(v: GameView, pay: PayingState, index: number): void {
    const pc = v.pendingChoice
    const m = pay.forMeisai
    const opt = pc?.options?.[index]
    if (!pc?.effectCostPay || !m || opt === undefined) return
    m.optionIndex = index
    m.option = opt
    m.need = pc.effectCostPay.need + (pc.effectCostPay.keepByOption?.[index] ?? pc.effectCostPay.keep ?? 0)
}

// 効果による召喚・配置の支払いを2段の画面で開く。②の置く数は index 番目から始める
export function openEffectSummonPay(v: GameView, index = 0): void {
    const pc = v.pendingChoice
    const cp = pc?.effectCostPay
    if (!pc || !cp || cp.keepByOption === undefined) return
    const opt = pc.options?.[index]
    if (opt === undefined) return
    const need = cp.need + (cp.keepByOption[index] ?? cp.keep ?? 0)
    ui().targeting = null
    ui().awakenTarget = null
    ui().combineBrave = null
    ui().paying = {
        handIndex: -1,
        forMeisai: { option: opt, optionIndex: index, cardId: cp.sourceCardId, need, costNeed: cp.need, effectCost: true, placing: true },
        step: cp.need > 0 ? "cost" : "place",
        assigned: {},
        costAssigned: {},
        costReserve: 0,
        placeReserve: 0,
        discardHandIndices: [],
        millPay: 0,
        shinsokuAssistInstanceIds: [],
    }
}

// 画面を出さずに済む判定（自動で、リザーブだけで最小の置くコアまで払える）。通常の召喚と同じ
export function effectSummonNeedsScreen(v: GameView): boolean {
    const pc = v.pendingChoice
    const cp = pc?.effectCostPay
    if (pc?.pid !== v.you || !cp || cp.keepByOption === undefined || cp.reserveOnly) return false
    const min = Math.min(...cp.keepByOption)
    return ui().payMode === "manual" || reservePool(v) < cp.need + (Number.isFinite(min) ? min : 0)
}

// 通常の召喚・配置：②で Lv／置く数を選べるか
export function summonLevelChoosable(v: GameView, pay: PayingState): boolean {
    return pay.levelChoosable === true && pay.forMeisai === undefined && payingCardId(v, pay) !== undefined
}

// ---- おまかせで割り当てる ----

function autoFieldList(v: GameView, pay: PayingState, count: number): string[] {
    if (count <= 0) return []
    const m = pay.forMeisai
    const sug = m?.placing === true ? v.pendingChoice?.effectCostPay?.suggestByOption?.[m.optionIndex ?? 0] : undefined
    if (sug !== undefined && sum(Object.fromEntries(sug.map((s) => [s.instanceId, s.count]))) === count) {
        return sug.flatMap((s) => Array<string>(s.count).fill(s.instanceId))
    }
    // 維持コアを残して払える個体から多い順に取り、足りなければスピリットを消滅させる払い方まで進む
    const spiritIds = new Set(v.players[v.you].field.spirits.map((s) => s.instanceId))
    const free = new Map<string, number>()
    const rest = new Map<string, number>()
    for (const inst of fieldInsts(v)) {
        const u = usableOn(v, pay, inst)
        const keep = spiritIds.has(inst.instanceId) ? minLevelCores(master(inst.cardId)) : 0
        free.set(inst.instanceId, Math.max(0, u - keep))
        rest.set(inst.instanceId, u - Math.max(0, u - keep))
    }
    const out: string[] = []
    while (out.length < count) {
        const pick = (from: Map<string, number>) => [...from.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0]
        const hit = pick(free) ?? pick(rest)
        if (!hit) break
        const pool = (free.get(hit[0]) ?? 0) > 0 ? free : rest
        pool.set(hit[0], (pool.get(hit[0]) ?? 0) - 1)
        out.push(hit[0])
    }
    return out
}

function applyAutoPlan(v: GameView, pay: PayingState): void {
    const needs = payingStageNeeds(v, pay)
    const soulCost = (pay.useSoulCore === true ? 1 : 0) + (pay.soulPayInstanceId !== undefined && pay.soulPayMode !== "maintain" ? 1 : 0)
    const soulPlace = (pay.placeSoulCore === true ? 1 : 0) + (pay.soulPayInstanceId !== undefined && pay.soulPayMode === "maintain" ? 1 : 0)
    const costT = Math.max(0, needs.cost - soulCost)
    const placeT = Math.max(0, needs.place - soulPlace)
    const pool = reservePool(v)
    const list = autoFieldList(v, pay, Math.max(0, costT + placeT - pool))
    const reserveN = Math.min(pool, costT + placeT - list.length)
    const r1 = Math.min(costT, reserveN)
    const toRecord = (ids: string[]) => ids.reduce<Record<string, number>>((o, id) => ({ ...o, [id]: (o[id] ?? 0) + 1 }), {})
    const costIds = list.slice(0, costT - r1)
    pay.costAssigned = toRecord(costIds)
    pay.assigned = toRecord(list)
    pay.costReserve = r1
    pay.placeReserve = reserveN - r1
}

// 自動でリザーブだけで払えるときに、最小の置き方までリザーブで埋めて②から始める（play.tryPlay から）
export function fillFromReserve(v: GameView, pay: PayingState): void {
    applyAutoPlan(v, pay)
    pay.step = "place"
}

// 通常の召喚・配置の②は置く数を先に決めない。取ったコアの数がそのまま置く数になる（最小は Lv1 の維持コア。2026-11-25 ユーザー案）
// [ソウルコア]を維持コアに置く選び方のときは置く数が決まっているので、従来どおり数を満たすまで取る
function placeFollowsSources(v: GameView, pay: PayingState): boolean {
    return pay.step === "place" && summonLevelChoosable(v, pay) && pay.placeSoulCore !== true
}
function syncPlaceToSources(v: GameView, pay: PayingState): void {
    const id = payingCardId(v, pay)
    if (id === undefined || !placeFollowsSources(v, pay)) return
    pay.cores = Math.max(summonMinCores(v, v.you, master(id)), payingStageFilled(pay, "place"))
    delete pay.level
}

// ---- 入力 ----

function assignStagedCore(v: GameView, pay: PayingState, instanceId: string): void {
    const stage = pay.step
    if (stage === undefined) return
    const inst = fieldInsts(v).find((i) => i.instanceId === instanceId)
    if (!inst) return
    const needs = payingStageNeeds(v, pay)
    if (payingStageFilled(pay, stage) >= needs[stage] && !placeFollowsSources(v, pay)) return
    const already = pay.assigned[instanceId] ?? 0
    if (already >= usableOn(v, pay, inst)) return
    pay.assigned[instanceId] = already + 1
    if (stage === "cost") (pay.costAssigned ??= {})[instanceId] = (pay.costAssigned?.[instanceId] ?? 0) + 1
    syncPlaceToSources(v, pay)
    deps?.rerender()
}

// フィールドの個体を押したときの入口（payInput.assignPayCore から呼ぶ）
export function assignPayStageCore(instanceId: string): void {
    const v = deps?.view()
    const pay = ui().paying
    if (v && pay) assignStagedCore(v, pay, instanceId)
}

export function onPayStageClick(e: Event): void {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-ps]")
    const pay = ui().paying
    const v = deps?.view()
    if (!t || !v || !pay || pay.step === undefined || (t as HTMLButtonElement).disabled) return
    const stage = pay.step
    const needs = payingStageNeeds(v, pay)
    const key = stage === "cost" ? "costReserve" : "placeReserve"
    switch (t.dataset.ps) {
        case "res+":
            if ((payingStageFilled(pay, stage) < needs[stage] || placeFollowsSources(v, pay)) && (pay.costReserve ?? 0) + (pay.placeReserve ?? 0) < reservePool(v)) pay[key] = (pay[key] ?? 0) + 1
            break
        case "res-":
            pay[key] = Math.max(0, (pay[key] ?? 0) - 1)
            break
        case "fld-": {
            const id = String(t.dataset.id)
            if ((stageField(pay, stage)[id] ?? 0) <= 0) break
            const left = (pay.assigned[id] ?? 0) - 1
            if (left > 0) pay.assigned[id] = left
            else delete pay.assigned[id]
            if (stage === "cost" && pay.costAssigned) {
                const c = (pay.costAssigned[id] ?? 0) - 1
                if (c > 0) pay.costAssigned[id] = c
                else delete pay.costAssigned[id]
            }
            break
        }
        case "reset":
            resetStage(pay, stage)
            break
        case "auto":
            applyAutoPlan(v, pay)
            break
        case "next":
            if (payingStageFilled(pay, "cost") === needs.cost) pay.step = "place"
            break
        case "back":
            pay.step = "cost"
            break
        case "submit":
            if (payingStageFilled(pay, "cost") === needs.cost && payingStageFilled(pay, "place") === needs.place) deps?.submitPaying()
            break
        case "waiver":
            changePlace(pay, () => {
                delete pay.level
                delete pay.cores
                pay.placeSoulCore = true
                pay.useSoulCore = false
            })
            break
        case "opt-":
        case "opt+": {
            const len = v.pendingChoice?.options?.length ?? 0
            const next = Math.max(0, Math.min(len - 1, (pay.forMeisai?.optionIndex ?? 0) + (t.dataset.ps === "opt+" ? 1 : -1)))
            changePlace(pay, () => setMeisaiOption(v, pay, next))
            break
        }
    }
    syncPlaceToSources(v, pay)
    deps?.rerender()
}

// ---- 描画 ----

function btn(label: string, ps: string, opts: { id?: string; disabled?: boolean; on?: boolean } = {}): HTMLButtonElement {
    const b = document.createElement("button")
    b.dataset.ps = ps
    b.textContent = label
    if (opts.id !== undefined) b.dataset.id = opts.id
    if (opts.disabled) b.disabled = true
    if (opts.on) b.classList.add("selected")
    return b
}

function stepRow(minus: HTMLButtonElement, text: string, plus: HTMLButtonElement): HTMLElement {
    const row = document.createElement("div")
    row.className = "stepper-row"
    const readout = document.createElement("span")
    readout.className = "stepper-value"
    readout.textContent = text
    row.append(minus, readout, plus)
    return row
}

function div(cls: string, text?: string): HTMLDivElement {
    const d = document.createElement("div")
    d.className = cls
    if (text !== undefined) d.textContent = text
    return d
}

// ②の置き方の選択。効果による召喚は置く数の −／＋、通常の召喚・配置は《真界放》の置き方だけ（数は取ったコアで決まる）
function levelControls(v: GameView, pay: PayingState, needs: { cost: number; place: number }): HTMLElement[] {
    const out: HTMLElement[] = []
    const m = pay.forMeisai
    if (m?.placing === true) {
        const options = v.pendingChoice?.options ?? []
        if (options.length >= 2) {
            const i = m.optionIndex ?? 0
            out.push(stepRow(btn("−", "opt-", { disabled: i <= 0 }), options[i] ?? "", btn("＋", "opt+", { disabled: i >= options.length - 1 })))
        }
        return out
    }
    const cardId = payingCardId(v, pay)
    if (!summonLevelChoosable(v, pay) || cardId === undefined) return out
    const card = master(cardId)
    const reserve = v.players[v.you].reserve
    const field = payableFieldCores(v, cardId)
    // Lv ごとのボタンは置かない（置く数と同じことを二重に出していた。2026-11-25 ユーザー指摘）
    // 《真界放》：[ソウルコア]1個だけで Lv2 にする置き方（2026-10-07 ユーザー裁定）は増減では選べないので残す
    if (card.levels.some((l) => l.soulCoreRequired === true) && v.players[v.you].soulCore?.zone === "reserve" && reserve + field >= needs.cost + 1) {
        const lvRow = div("pay-levels")
        lvRow.append(btn("Lv2を[ソウルコア]で置く（1コア）", "waiver", { on: pay.placeSoulCore === true && needs.place === 1 }))
        out.push(lvRow)
    }
    return out
}

function levelFor(v: GameView, pay: PayingState, placed: number): number {
    const card = master(payingCardId(v, pay)!)
    const bonus = summonLevelCostBonus(v, v.you, card)
    return [...card.levels].sort((a, b) => a.cores - b.cores).filter((l) => l.cores + bonus <= placed).at(-1)?.level ?? card.levels[0]?.level ?? 1
}

function vanishingNote(v: GameView, assigned: Record<string, number>): string {
    const names = v.players[v.you].field.spirits
        .filter((sp) => (assigned[sp.instanceId] ?? 0) > 0 && sp.cores - (assigned[sp.instanceId] ?? 0) < minLevelCores(master(sp.cardId)))
        .map((sp) => master(sp.cardId).name)
    return names.length > 0 ? `⚠️ ${names.join("、")}が消滅します` : ""
}

// 見出し（#targeting-info に出す1行）
export function payStageHeading(v: GameView, pay: PayingState): string {
    const id = payingCardId(v, pay)
    if (id === undefined) return ""
    const c = master(id)
    return `${c.type === "nexus" ? "配置" : "召喚"}：${c.name}`
}

export function renderPayStageSheet(v: GameView, pay: PayingState, host: HTMLElement): void {
    const stage = pay.step
    if (stage === undefined) return
    const needs = payingStageNeeds(v, pay)
    const need = needs[stage]
    const filled = payingStageFilled(pay, stage)
    const cardId = payingCardId(v, pay)
    const verb = cardId !== undefined && master(cardId).type === "nexus" ? "配置" : "召喚"
    const hasCostStage = needs.cost > 0
    const hasPlaceStage = needs.place > 0
    const sheet = div("pay-sheet")

    // 見出しと払った数は1行にまとめる（「② 置くコア」と「置くコア 1 / 1」、取り分のまとめとリザーブの行が同じことを重ねて出していた。2026-11-25 ユーザー指摘）
    const meter = div("pay-meter")
    const title = document.createElement("span")
    title.className = "pay-stage-title"
    const follows = placeFollowsSources(v, pay)
    // 取った数で置く数が決まるときは、最小を満たしたら「N（LvM）」だけ出す
    title.textContent = follows && filled >= need ? `② 置くコア　${filled}（Lv${levelFor(v, pay, filled)}）` : `${stage === "cost" ? "① コスト" : "② 置くコア"}　${filled} / ${need}`
    const boxes = document.createElement("span")
    boxes.className = "pay-boxes"
    boxes.textContent = "■".repeat(filled) + "□".repeat(Math.max(need - filled, 0))
    meter.append(title, boxes)
    sheet.append(meter)
    if (stage === "place") for (const c of levelControls(v, pay, needs)) sheet.append(c)

    const fields = stageField(pay, stage)
    const reserveTaken = (stage === "cost" ? pay.costReserve : pay.placeReserve) ?? 0
    const fieldTaken = sum(fields)
    const canTakeReserve = (filled < need || follows) && (pay.costReserve ?? 0) + (pay.placeReserve ?? 0) < reservePool(v)
    // 「リザーブ 使う数 / 使える数」。使える数はもう一方の段で使った分を除く（いくつあるか分からないまま −／＋ を押すことになっていた。2026-11-25 ユーザー指摘）
    const reserveUsable = reservePool(v) - ((stage === "cost" ? pay.placeReserve : pay.costReserve) ?? 0)
    // 使えるリザーブが無いときは −／＋ を出さない（押せそうに見えるのに押しても何も起きなかった）
    if (reserveUsable > 0) sheet.append(stepRow(btn("−", "res-", { disabled: reserveTaken <= 0 }), `リザーブ ${reserveTaken} / ${reserveUsable}`, btn("＋", "res+", { disabled: !canTakeReserve })))
    else sheet.append(div("pay-hint pay-no-reserve", "リザーブ 0（使えるコアなし）"))
    const list = div("pay-fields")
    for (const [id, n] of Object.entries(fields)) {
        const inst = fieldInsts(v).find((i) => i.instanceId === id)
        if (!inst) continue
        const total = pay.assigned[id] ?? n
        const row = div("pay-field-row")
        const label = document.createElement("span")
        label.textContent = `${master(inst.cardId).name}　コア ${inst.cores}→${inst.cores - total}`
        row.append(label, btn("−", "fld-", { id }))
        list.append(row)
    }
    if (fieldTaken === 0 && (filled < need || follows)) list.append(div("pay-hint", "場のスピリット／ネクサスを押すと、そこから取れます"))
    sheet.append(list)
    const note = vanishingNote(v, pay.assigned)
    if (note) sheet.append(div("pay-warn", note))

    const tools = div("pay-tools")
    tools.append(btn("やり直す", "reset"), btn("おまかせで割り当てる", "auto"))
    sheet.append(tools)

    const nav = div("pay-nav")
    const ok = filled === need
    if (stage === "cost" && hasPlaceStage) {
        nav.append(btn("次へ", "next", { disabled: !ok }))
    } else {
        if (stage === "place" && hasCostStage) nav.append(btn("戻る", "back"))
        const allOk = payingStageFilled(pay, "cost") === needs.cost && payingStageFilled(pay, "place") === needs.place
        nav.append(btn(verb, "submit", { disabled: !allOk }))
    }
    sheet.append(nav)
    host.append(sheet)
}
