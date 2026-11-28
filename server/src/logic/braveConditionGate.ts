// 合体条件が後から厳しくなったときの強制分離（BS21-X06「合体条件をコスト7以上にする」。2026-11-06 ユーザー確認）
import { isWaiting } from "../../../shared/rules/waiting"
import type { CardInstance, GameState, PlayerId } from "../type"
import { boardResistanceAgainst, braveExtraMinCostFor, bravesOf, matchesBraveCondition } from "../../../shared/rules"
import { braveCompositeOf, refreshLevelAsOverrides } from "./state/continuous"
import { braveSlotsUsed } from "../../../shared/rules/braveExtraCombine"
import { combineLimitFor } from "../../../shared/summon"
import { detachBraveByOwnerChoice } from "./brave"
import { cantSpiritStateBrave } from "../../../shared/rules/constraints"
import { leaveField } from "./leaveField"
import { getCard, log } from "./GameState"

// 効果の手ごとの出口（EffectModules）と handleAction の後始末（継続効果を組み直した後）で呼ぶ（#707）。
// 合体条件（系統・コスト・シンボル・キーワードなど）を、**そのブレイヴ自身の寄与を除いたホスト**で確かめ直し、
// 満たさなくなったブレイヴは持ち主が残すかトラッシュかを選ぶ（detachBraveByOwnerChoice＝相手の効果による分離と同じ手順）。
// 自分の寄与を除くのは、そのブレイヴのコストやシンボルで条件を満たしている誤りを避けるため。ほかのブレイヴの寄与は残す。
// 規則は「満たさなくなった時点で分離」。効果の途中でも、1つのアクションを解決したら次の効果を解決する前に分離する（2026-11-25 ユーザー決定。11-06 の「解決を終えてから」を改めた）。
// 1枚外れて別のブレイヴの条件が崩れる連鎖は、継続効果を組み直して変化が無くなるまで確かめ直す（選択待ちが立ったら、答えた後の後始末で続きを見る）。
// 合体条件を無視して合体しているホスト（ignoreBraveCondition）は matchesBraveCondition が通すので分離しない。
// BS21-X06 の追加下限は、ホストが X06 の効果を受けないときだけ見ない。分離したものは X06 が消えても戻らない。
// 他の選択待ちが出ている間は見送り、次のアクション後に判定する（途中で盤面を動かさないため）
export function separateBravesLostCondition(state: GameState): void {
    for (let guard = 0; guard < 20; guard++) {
        const before = state.players.p1.field.combinedBraves.length + state.players.p2.field.combinedBraves.length
        separateOnce(state)
        if (state.pendingChoice || state.winner) return
        if (state.players.p1.field.combinedBraves.length + state.players.p2.field.combinedBraves.length === before) return
        refreshLevelAsOverrides(state)
    }
}

function separateOnce(state: GameState): void {
    if (state.pendingChoice || state.winner) return
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[pid]
        for (const host of [...player.field.spirits]) {
            if ((host.braveRefs ?? []).length === 0) continue
            // 待機状態（破壊・消滅・バウンス待機）の合体スピリットは、条件を満たさなくなっても合体したまま（ルールマニュアル（エターナル）Ver.17.0 の改訂「待機状態の統一」）
            if (isWaiting(host)) continue
            const extra = braveExtraMinCostFor(state, pid, host)
            const resisted = extra !== null && boardResistanceAgainst(state, pid, host, { op: "other", scope: "area", actorPid: extra.sourceOwner, sourceType: "spirit" }) !== null
            const braves = bravesOf(player, host)
            const lost = braves.filter((brave) => !matchesWithout(state, pid, host, braves, brave, resisted))
            for (const brave of lost) {
                detachBraveByOwnerChoice(state, pid, host, brave)
                if (state.pendingChoice) return
            }
        }
    }
}

// host から brave 1枚ぶんの寄与（braveRefs・braveComposite）だけを一時的に外して合体条件を判定し、必ず元に戻す。
// 判定側（keyword・シンボル・コスト）が host の実体を見るので、複製ではなく同じ実体を書き換える
function matchesWithout(state: GameState, pid: PlayerId, host: CardInstance, braves: CardInstance[], brave: CardInstance, ignoreExtraMinCost: boolean): boolean {
    const refs = host.braveRefs
    const composite = host.braveComposite
    const rest = braves.filter((b) => b !== brave)
    try {
        host.braveRefs = (refs ?? []).filter((r) => r.instanceId !== brave.instanceId)
        host.braveComposite = braveCompositeOf(state, pid, rest)
        return matchesBraveCondition(state, pid, host, brave.cardId, false, ignoreExtraMinCost)
    } finally {
        if (refs === undefined) delete host.braveRefs
        else host.braveRefs = refs
        if (composite === undefined) delete host.braveComposite
        else host.braveComposite = composite
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
            leaveField(state, pid, brave, false)
            player.trashCards.push(brave.cardId)
            log(state, `${player.name}の${getCard(brave.cardId).name}は、ブレイヴをスピリット状態にできないためトラッシュに置かれた。`)
            trashed = true
        }
    }
    return trashed
}
