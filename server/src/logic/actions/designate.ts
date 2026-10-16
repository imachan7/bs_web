// 「〜N体を指定する」だけ（選んだ個体を直前の対象に書き、後ろの効果は filter.lastTarget で使う）。
// 「指定する。それを回復させる。さらに〜なら、それをBP+N」のように、1つの指定に複数の効果をつなぐ書き方用
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log, suspend } from "../GameState"
import { effectiveBp, matchesTarget } from "../../../../shared/rules"
import { pickEnemyCandidates } from "../targeting"
import { lastTargetsOf, recordTargets } from "../record"
import { normalizeFilter, SELF_REQUIRED } from "./filter"

const designateHandler: ActionHandler<"designate"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, targetInstanceId } = ctx
    const pid = action.side === "opponent" ? opp : owner
    const filter = normalizeFilter(ctx, action)
    const chosen = action.chosen ?? []
    const finish = (ids: string[]): void => {
        recordTargets(state, action.add ? [...lastTargetsOf(state), ...ids] : ids)
        if (ids.length === 0) log(state, `${sourceName}：指定できる対象がいなかった。`)
        else log(state, `${sourceName}：${ids.map((id) => getCard(state.players[pid].field.spirits.find((s) => s.instanceId === id)!.cardId).name).join("、")}を指定した。`)
    }
    if (filter === SELF_REQUIRED) {
        finish([])
        return
    }
    const matches = (s: Parameters<typeof matchesTarget>[2]): boolean => !chosen.includes(s.instanceId) && matchesTarget(state, pid, s, filter, self?.instanceId)
    // 相手のスピリットは装甲などの「指定されない」を通す（自分のスピリットには働かない）
    const candidates = action.side === "opponent" ? pickEnemyCandidates(state, opp, Infinity, matches, srcColors, srcType) : state.players[owner].field.spirits.filter(matches)
    const count = action.count ?? 1
    // 選択の解決（awaiting が付いているときだけ targetInstanceId を選ばれた個体として読む。素の targetInstanceId は誘発のイベント対象）
    if (action.awaiting) {
        const { awaiting: _a, ...rest } = action
        const picked = targetInstanceId !== undefined && candidates.some((s) => s.instanceId === targetInstanceId) ? [...chosen, targetInstanceId] : chosen
        // スキップ（「まで」で選ばずに終えた）か、選び終えた
        if (picked.length === chosen.length || picked.length >= count) finish(picked)
        else ctx.resolve({ ...rest, chosen: picked })
        return
    }
    if (chosen.length >= count || candidates.length === 0) {
        finish(chosen)
        return
    }
    // 候補2体以上なら聞く。「まで」は1体でも聞く（選ばずに終えられる）
    if (state.interactiveTargets && (candidates.length >= 2 || action.upTo)) {
        suspend(state, {
            pid: owner,
            kind: "target",
            prompt: `${sourceName}：指定するスピリットを選んでください（${chosen.length + 1}/${count}体目${action.upTo ? "。選ばずに終えることもできる" : ""}）`,
            candidates: candidates.map((s) => s.instanceId),
            optional: action.upTo === true,
            ...(action.upTo ? { resolveOnSkip: true } : {}),
            action: { ...action, chosen, awaiting: true },
            selfInstanceId: self ? self.instanceId : null,
        })
        return
    }
    // 非対話と選ぶ余地が無いとき：実効BPの高い順
    const ordered = [...candidates].sort((a, b) => effectiveBp(state, pid, b) - effectiveBp(state, pid, a))
    finish([...chosen, ...ordered.slice(0, count - chosen.length).map((s) => s.instanceId)])
}

const handlers = {
    designate: designateHandler,
} satisfies Partial<ActionRegistry>

export default handlers
