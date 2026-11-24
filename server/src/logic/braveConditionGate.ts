// 合体条件が後から厳しくなったときの強制分離（BS21-X06「合体条件をコスト7以上にする」。2026-11-06 ユーザー確認）
import { isWaiting } from "../../../shared/rules/waiting"
import type { GameState, PlayerId } from "../type"
import { boardResistanceAgainst, braveExtraMinCostFor, instCostWithoutBraves } from "../../../shared/rules"
import { braveSlotsUsed } from "../../../shared/rules/braveExtraCombine"
import { combineLimitFor } from "../../../shared/summon"
import { detachBraveByOwnerChoice } from "./brave"
import { cantSpiritStateBrave } from "../../../shared/rules/constraints"
import { soulCoreLeavesField } from "./soulCore"
import { getCard, log } from "./GameState"

// handleAction の後始末（継続効果を組み直した後）で呼ぶ。
// 分離したブレイヴは持ち主が残すかトラッシュかを選ぶ（detachBraveByOwnerChoice＝相手の効果による分離と同じ手順）。
// X06 の効果を受けないホストは分離しない。X06 が消えても分離したものは戻らない。
// 規則は「満たさなくなった時点で分離」だが、効果の解決を終えてから分離する（2026-11-06 ユーザー確認）。
// 他の選択待ちが出ている間は見送り、次のアクション後に判定する（途中で盤面を動かさないため）
export function separateBravesBelowMinCost(state: GameState): void {
    if (state.pendingChoice || state.winner) return
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const host of [...player.field.spirits]) {
            if ((host.braveRefs ?? []).length === 0) continue
            // 待機状態（破壊・消滅・バウンス待機）の合体スピリットは、条件を満たさなくなっても合体したまま（ルールマニュアル（エターナル）Ver.17.0 の改訂「待機状態の統一」）
            if (isWaiting(host)) continue
            const extra = braveExtraMinCostFor(state, pid, host)
            if (extra === null || instCostWithoutBraves(host) >= extra.minCost) continue
            if (boardResistanceAgainst(state, pid, host, { op: "other", scope: "area", actorPid: extra.sourceOwner, sourceType: "spirit" }) !== null) continue
            for (const brave of (host.braveRefs ?? []).map((r) => player.field.combinedBraves.find((b) => b.instanceId === r.instanceId)).filter((b) => b !== undefined)) {
                detachBraveByOwnerChoice(state, pid, host, brave!)
                if (state.pendingChoice) return
            }
        }
    }
}

// 合体数の上限を上げていた効果（BS23-X01 など）が消えて、上限を超えたホストの分離（Q4588）。
// 持ち主が選ぶのは残すかトラッシュかの確認だけで、**どのブレイヴを外すかは最後に合体したものに固定する簡略化**
export function separateBravesOverLimit(state: GameState): void {
    if (state.pendingChoice || state.winner) return
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const host of [...player.field.spirits]) {
            if (isWaiting(host)) continue
            while (braveSlotsUsed(state, pid, host) > combineLimitFor(state, pid, host)) {
                const last = (host.braveRefs ?? []).at(-1)
                const brave = last && player.field.combinedBraves.find((b) => b.instanceId === last.instanceId)
                if (!brave) break
                const before = (host.braveRefs ?? []).length
                detachBraveByOwnerChoice(state, pid, host, brave)
                if (state.pendingChoice || (host.braveRefs ?? []).length === before) return
            }
        }
    }
}

// BS11-X02 Lv3「相手は、ブレイヴをスピリット状態にできない」が効いている間、その側のスピリット状態のブレイヴは
// トラッシュに置く（公式 Q3042・Q16924。2026-11-24 ユーザー確認）。**破壊でも消滅でもない**ので破壊時・消滅時の誘発は出さず、
// 上のコアはリザーブへ。バトル中の攻撃側・ブロック側でも特別な後始末はしない（バウンスと同じく場から消えるだけ）
// 効果の途中でも、手を解決するたびに置く（ノヴァ優先。2026-11-24 ユーザー決定）。選択待ちの間は見送り、答えた後の手の出口で置く。
// 1枚でも置いたら true（呼び出し側が継続効果を組み直す）
export function trashSpiritStateBravesWhenForbidden(state: GameState): boolean {
    if (state.pendingChoice || state.winner) return false
    let trashed = false
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        if (!cantSpiritStateBrave(state, pid)) continue
        const player = state.players[pid]
        for (const brave of [...player.field.spirits]) {
            if (getCard(brave.cardId).type !== "brave" || isWaiting(brave)) continue
            player.field.spirits.splice(player.field.spirits.indexOf(brave), 1)
            player.trashCards.push(brave.cardId)
            soulCoreLeavesField(player, brave)
            player.reserve += brave.cores
            log(state, `${player.name}の${getCard(brave.cardId).name}は、ブレイヴをスピリット状態にできないためトラッシュに置かれた。`)
            trashed = true
        }
    }
    return trashed
}
