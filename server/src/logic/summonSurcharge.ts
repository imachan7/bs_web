// 「コストを支払わずに」の召喚でも、相手の転召の祭壇などが課す余分のコストは払う
// （公式Q&A Q3657/Q3718/Q3753、2026-10-15 ユーザー確認）。通常の召喚の余分は effectiveCost に入っている。
import { summonSurcharge } from "../../../shared/cost"
import type { CardData, GameState, PlayerId } from "../type"
import { payCost } from "./EffectModules"
import { log } from "./GameState"

// batch＝1つの効果で複数体を同時に召喚している（召喚は1回なので余分も1回）。単発の召喚は毎回払う。
// 払い済みの印は複数体を召喚する効果の1枚目（moveCards）と handleAction の末尾で消す。
// ponytail: 選択待ちを挟まずに1回の操作の中で「複数体を召喚する効果」が2つ続くと、オープン／summonFromHandFree の側は印を消さないので2つ目の余分が無料になる。起きたら効果の開始時に印を消す
function owed(state: GameState, pid: PlayerId, cardData: CardData, batch: boolean): number {
    const n = summonSurcharge(state, pid, cardData)
    return n > 0 && batch && state.summonSurchargePaid === pid ? 0 : n
}

// 余分に加えて、続けて置くコア（extraNeeded）もリザーブで賄えるか。支払い元はリザーブのみ（簡略化。2026-10-15）
export function canPayFreeSummonSurcharge(state: GameState, pid: PlayerId, cardData: CardData, extraNeeded = 0, batch = false): boolean {
    return state.players[pid].reserve >= owed(state, pid, cardData, batch) + extraNeeded
}

// 払えたら true（余分が無い・同じ召喚で払済みも true）。払えないときは何も動かさず false
export function payFreeSummonSurcharge(state: GameState, pid: PlayerId, cardData: CardData, batch = false): boolean {
    const n = owed(state, pid, cardData, batch)
    if (n === 0) return true
    if (state.players[pid].reserve < n) return false
    payCost(state, pid, n)
    if (batch) state.summonSurchargePaid = pid
    log(state, `${state.players[pid].name}：転召の祭壇により${n}コスト余分に支払った。`)
    return true
}
