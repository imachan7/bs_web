// 【烈神速】でトラッシュのコアを置く場所を、1画面でまとめて配分する（#740）。
// 最初は全部を「このスピリット」に置いた状態から始め、リザーブの ＋ や場のカードを押してそこから移す。
// このスピリットが維持コアを割る ＋ は押せないので、Lv0 の配分は作れない
import type { PendingChoice } from "../../../server/src/type"
import { master } from "../renderer"

type Dist = NonNullable<PendingChoice["distributeCores"]>

// 置き先ごとの数（このスピリット以外）。選択が変わったら null に戻す
export type CoreAlloc = Record<string, number>

const othersOf = (d: Dist): string[] => d.destinations.filter((x) => x !== "self" && !x.endsWith("_all"))
const sumOf = (a: CoreAlloc): number => Object.values(a).reduce((x, y) => x + y, 0)
const selfCount = (d: Dist, a: CoreAlloc): number => d.remaining - sumOf(a)

function levelAt(cardId: string, cores: number): number {
    return master(cardId).levels.filter((l) => l.cores <= cores).reduce((lv, l) => Math.max(lv, l.level), 0)
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (text !== undefined) e.textContent = text
    return e
}

function stepBtn(label: string, dest: string, delta: 1 | -1, disabled: boolean): HTMLButtonElement {
    const b = el("button", "", label)
    b.dataset.alloc = dest
    b.dataset.delta = String(delta)
    b.disabled = disabled
    return b
}

// 場のカードを押して、もう1個移せるか（維持コアちょうどなら光らせない）
export function coreAllocCanMove(pc: PendingChoice, alloc: CoreAlloc): boolean {
    const d = pc.distributeCores
    return d !== undefined && d.selfCores + selfCount(d, alloc) - 1 >= d.selfMin
}

export function renderCoreAllocSheet(pc: PendingChoice, alloc: CoreAlloc, host: HTMLElement): void {
    const d = pc.distributeCores
    if (!d) return
    const options = pc.options ?? []
    const self = d.selfCores + selfCount(d, alloc)
    const canMove = self - 1 >= d.selfMin
    // 自分の場のカードを押して置くので、スマホではシートを低く保つ（場の下半分を隠していた。2026-11-28 ユーザー指摘）：
    // 見出しと召喚するスピリットのコアを1行、リザーブの −／＋ を1行、やり直す・召喚を1行にする
    const sheet = el("div", "pay-sheet core-alloc")
    // 「移したコア n / 移せる数」。移せる数は、召喚するスピリットの維持コアを除いた分（2026-11-28 ユーザー指示）
    const moved = sumOf(alloc)
    const movable = d.selfCores + d.remaining - d.selfMin
    const meter = el("div", "pay-meter")
    meter.append(el("span", "pay-stage-title", `移すコア ${moved} / ${movable}`), el("span", "pay-boxes", "■".repeat(moved) + "□".repeat(Math.max(movable - moved, 0))))
    sheet.append(meter)
    sheet.append(el("div", "pay-warn", `${master(d.cardId).name} ${self}個（Lv${levelAt(d.cardId, self)}）・維持コア${d.selfMin}個は残す`))

    if (d.destinations.includes("reserve")) {
        const n = alloc["reserve"] ?? 0
        const row = el("div", "stepper-row")
        row.append(stepBtn("−", "reserve", -1, n <= 0), el("span", "stepper-value", `リザーブ +${n}`), stepBtn("＋", "reserve", 1, !canMove))
        sheet.append(row)
    }
    // 場のスピリット・ネクサスは、カードを押して1個ずつ置く（支払い画面と同じ。全員ぶんの行を並べるとスマホで溢れた）。
    // 置いた数はカードのバッジに出るので、スマホではこの一覧を出さない（戻すのは「やり直す」）
    const list = el("div", "pay-fields")
    for (const dest of othersOf(d)) {
        const n = alloc[dest] ?? 0
        if (dest === "reserve" || n === 0) continue
        const row = el("div", "pay-field-row")
        row.append(el("span", "", `${(options[d.destinations.indexOf(dest)] ?? dest).replace(/に置く$/, "")}　+${n}`), stepBtn("−", dest, -1, false))
        list.append(row)
    }
    if (canMove && othersOf(d).some((x) => x !== "reserve")) list.append(el("div", "pay-hint", "場のスピリット／ネクサスを押すと、そこに1個置けます"))
    sheet.append(list)

    const nav = el("div", "pay-nav")
    const reset = el("button", "", "やり直す")
    reset.dataset.allocReset = "1"
    const ok = el("button", "", "この配分で召喚する")
    ok.dataset.allocSubmit = "1"
    nav.append(reset, ok)
    sheet.append(nav)
    host.append(sheet)
}

// −／＋ を押したときの次の配分。押せない操作（下限割れ・0未満）は今のまま返す
export function stepCoreAlloc(pc: PendingChoice, alloc: CoreAlloc, dest: string, delta: number): CoreAlloc {
    const d = pc.distributeCores
    if (!d || !othersOf(d).includes(dest)) return alloc
    const next = { ...alloc, [dest]: (alloc[dest] ?? 0) + delta }
    if ((next[dest] ?? 0) < 0 || d.selfCores + selfCount(d, next) < d.selfMin) return alloc
    return next
}

// サーバーへ送る形（このスピリットのぶんも入れる）
export function coreAllocAnswer(pc: PendingChoice, alloc: CoreAlloc): Record<string, number> {
    const d = pc.distributeCores
    if (!d) return {}
    return { ...alloc, self: selfCount(d, alloc) }
}
