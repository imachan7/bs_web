// 合体条件が後から厳しくなったときの強制分離（BS21-X06「合体条件をコスト7以上にする」。2026-11-06 ユーザー確認）
import { isWaiting } from "../../../shared/rules/waiting"
import type { GameState, PlayerId } from "../type"
import { boardResistanceAgainst, braveExtraMinCostFor, instCostWithoutBraves } from "../../../shared/rules"
import { braveSlotsUsed } from "../../../shared/rules/braveExtraCombine"
import { combineLimitFor } from "../../../shared/summon"
import { detachBraveByOwnerChoice } from "./brave"

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
