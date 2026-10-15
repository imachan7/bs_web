// 「コストを支払わずに」の召喚でも、相手の転召の祭壇などが課す余分のコストは払う
// （公式Q&A Q3657/Q3718/Q3753、2026-10-15 ユーザー確認）。通常の召喚の余分は effectiveCost に入っている。
// 支払い元はリザーブとフィールドのコア。対話中は効果のコストと同じ effectCostPay の待ちで聞き、非対話は autoPayPlan で払う
import { summonSurcharge } from "../../../shared/cost"
import type { CardData, EffectAction, GameState, PlayerId } from "../type"
import { autoPayPlan, payCost } from "./EffectModules"
import { log, suspend } from "./GameState"
import { normalReserveOf } from "./soulCore"
import { fieldCoresSpendable } from "./actions/moveCards"

// batch＝1つの効果で複数体を同時に召喚している（召喚は1回なので余分も1回）。単発の召喚は毎回払う。
// 払い済みの印は複数体を召喚する効果の1枚目（moveCards）と handleAction の末尾で消す。
// ponytail: 選択待ちを挟まずに1回の操作の中で「複数体を召喚する効果」が2つ続くと、オープン／summonFromHandFree の側は印を消さないので2つ目の余分が無料になる。起きたら効果の開始時に印を消す
export function surchargeOwed(state: GameState, pid: PlayerId, cardData: CardData, batch: boolean): number {
    const n = summonSurcharge(state, pid, cardData)
    return n > 0 && batch && state.summonSurchargePaid === pid ? 0 : n
}

// 余分に加えて、続けて置くコア（extraNeeded）も賄えるか。余分が無いときは従来どおりリザーブだけで見る
export function canPayFreeSummonSurcharge(state: GameState, pid: PlayerId, cardData: CardData, extraNeeded = 0, batch = false): boolean {
    const n = surchargeOwed(state, pid, cardData, batch)
    if (n === 0) return state.players[pid].reserve >= extraNeeded
    return autoPayPlan(state, pid, n + extraNeeded, true) !== null
}

// 余分を払い、置くコア（maintain）のうちフィールドのコアで賄えた数を返す（呼び出し側はリザーブから maintain - 戻り値 を引く）。
// 払えないときは何も動かさず null。余分が無い・同じ召喚で払済みは 0
export function payFreeSummonSurchargeKeeping(state: GameState, pid: PlayerId, cardData: CardData, batch: boolean, maintain: number): number | null {
    const n = surchargeOwed(state, pid, cardData, batch)
    if (n === 0) return 0
    const plan = autoPayPlan(state, pid, n + maintain, true)
    if (plan === null) return null
    const placed = payCost(state, pid, n, plan.paySources, maintain, plan.soulFromReserve)
    if (batch) state.summonSurchargePaid = pid
    log(state, `${state.players[pid].name}：転召の祭壇により${n}コスト余分に支払った。`)
    return placed
}

// 払えたら true（置くコアは考えない。余分が無い・同じ召喚で払済みも true）。払えないときは何も動かさず false
export function payFreeSummonSurcharge(state: GameState, pid: PlayerId, cardData: CardData, batch = false): boolean {
    return payFreeSummonSurchargeKeeping(state, pid, cardData, batch, 0) !== null
}

// 対話中で支払い元を選べる場面なら、コストの支払い待ち（effectCostPay）を立てて true を返す。
// resume は払ったあとに解決する続き。立てる条件は効果のコストの支払い（pay.ts）と同じ。
// 後で置くコア（keep）はリザーブから出すので、リザーブがそれに満たないときは待ちを立てず（false）、呼び出し側が自動で払う
export function askCostPay(state: GameState, pid: PlayerId, need: number, keep: number, prompt: string, sourceCardId: string, resume: EffectAction, surcharge = false): boolean {
    if (need <= 0 || !state.interactiveTargets) return false
    const player = state.players[pid]
    const soulSelectable = player.soulCore != null && player.soulCore.zone !== "trash"
    if (normalReserveOf(player) < keep) return false
    if (!(soulSelectable || fieldCoresSpendable(player).length > 0 || normalReserveOf(player) < need)) return false
    suspend(state, {
        pid,
        kind: "option",
        candidates: [],
        prompt,
        options: ["支払う"],
        optional: false,
        action: resume,
        selfInstanceId: null,
        effectCostPay: { pid, need, sourceCardId, keep, ...(surcharge ? { surcharge: true as const } : {}) },
    })
    return true
}

// 無償召喚の余分の支払い待ち。resume には余分を払い済みとして扱う続きを渡す
export function askSurchargePay(state: GameState, pid: PlayerId, cardData: CardData, batch: boolean, keep: number, resume: EffectAction): boolean {
    const n = surchargeOwed(state, pid, cardData, batch)
    return n > 0 && askCostPay(state, pid, n, keep, `転召の祭壇：${cardData.name}の召喚に${n}コスト余分に支払ってください`, cardData.cardId, resume, true)
}
