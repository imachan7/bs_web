// 複数の対象を、全部選んでから同時に適用する（2026-11-12 ユーザー決定。#437 SP-1）。
// 「1体選ぶ→適用→次を選ぶ」だと、1体目の誘発が選択をはさんだときに残りが消え、
// 「〜した1体につき」も1体ぶんしか数えられなかった。
//
// 途中経過は action に持たせて持ち回る（cards.json には書かない）：
//   選ぶ途中 … choosing / chosenIds（choosing があるときだけ targetInstanceId をトグルとして読む）
//   選び終えた後 … picked（耐性の確認の途中経過。payNegateDecide の再開は targetInstanceId を渡すので、
//                   picked があれば選択には戻らない）
import type { CardInstance, EffectAction, PlayerId } from "../type"
import type { PickedTargets } from "../types/effectAction"
import type { ActionCtx } from "./actions/types"
import { suspend } from "./GameState"
import { gateTargetedApply } from "./EffectModules"
import type { EffectAttempt, Resistance } from "../../../shared/rules"

export interface PickProgress {
    choosing?: true
    chosenIds?: string[]
    picked?: PickedTargets
}

export interface PickOptions {
    candidates: string[]
    count: number
    upTo: boolean // 「N体まで」：0〜N で確定できる。無ければ min(候補, N) ちょうど
    prompt: string
    verb: string // 確定ボタンの動詞（「破壊する」）
    chooserPid?: PlayerId // 選ぶのが効果の持ち主でないとき（「相手は、相手のスピリットN体を〜」）
    ordered?: true // 選ぶ順に意味がある（デッキに「好きな順番で」戻す）。全員が対象でも聞き、最後の1体だけ自動
}

// 対話で選ばせる。確定した対象を返す。選択待ちを立てたら null。非対話では呼ばない（呼び出し側の自動選択を使う）
export function pickTargets<A extends EffectAction & PickProgress>(ctx: ActionCtx, action: A, opts: PickOptions): string[] | null {
    const { state, owner, self, targetInstanceId } = ctx
    if (action.picked) return action.picked.ids
    const need = opts.upTo ? opts.count : Math.min(opts.count, opts.candidates.length)
    // 選ぶ余地が無い（全員が対象）なら聞かない
    if (!action.choosing && !opts.upTo && opts.candidates.length <= (opts.ordered ? 1 : opts.count)) return opts.candidates
    if (!action.choosing && opts.candidates.length === 0) return []
    const chooser = opts.chooserPid ?? owner
    // 1体なら、押した時点で決まる（トグルにしない）。「1体まで」はスキップで0体
    if (opts.count === 1) {
        if (action.choosing) {
            if (targetInstanceId !== undefined && opts.candidates.includes(targetInstanceId)) return [targetInstanceId]
            if (targetInstanceId === undefined && opts.upTo) return []
        }
        suspend(state, {
            pid: chooser,
            kind: "target",
            prompt: opts.prompt,
            candidates: opts.candidates,
            optional: opts.upTo,
            ...(opts.upTo ? { resolveOnSkip: true } : {}),
            action: { ...action, choosing: true as const } as unknown as EffectAction,
            selfInstanceId: self ? self.instanceId : null,
            ...(chooser !== owner ? { actorPid: owner } : {}),
        })
        return null
    }
    // 2体以上：1体ずつ選ばせ（選んだ体は候補から外す。操作は従来の「1体ずつ」と同じ）、適用は選び終えてからまとめて。
    // 「N体」は N 体そろった時点で、「N体まで」はスキップか上限で確定する
    let chosen = (action.chosenIds ?? []).filter((id) => opts.candidates.includes(id))
    if (action.choosing && targetInstanceId !== undefined && opts.candidates.includes(targetInstanceId) && !chosen.includes(targetInstanceId)) {
        chosen = [...chosen, targetInstanceId]
    }
    const rest = opts.candidates.filter((id) => !chosen.includes(id))
    // 順番だけを決めている最後の1体は聞かない
    if (opts.ordered && !opts.upTo && rest.length === 1 && need - chosen.length === 1) return [...chosen, rest[0]!]
    if (chosen.length >= need || rest.length === 0) return chosen
    if (action.choosing && targetInstanceId === undefined && opts.upTo) return chosen
    const left = need - chosen.length
    const verbNot = opts.verb.endsWith("する") ? `${opts.verb.slice(0, -2)}しない` : `${opts.verb}ない`
    suspend(state, {
        pid: chooser,
        kind: "target",
        prompt: `${opts.prompt}（${opts.upTo ? `あと${left}体まで` : `あと${left}体`}）`,
        candidates: rest,
        ...(chosen.length > 0 ? { selectedIds: chosen } : {}),
        optional: opts.upTo,
        ...(opts.upTo ? { resolveOnSkip: true, skipLabel: chosen.length > 0 ? `これで${opts.verb}（${chosen.length}体）` : verbNot } : {}),
        action: { ...action, choosing: true as const, chosenIds: chosen } as unknown as EffectAction,
        selfInstanceId: self ? self.instanceId : null,
        ...(chooser !== owner ? { actorPid: owner } : {}),
    })
    return null
}

// 選び終えた対象に、1体ずつ耐性（手札を破棄して受けない、を含む）を通す。通った対象を返す。確認を出したら null。
// 受けなかった対象は onResisted でログを出す。自分側の対象など耐性を見ないものは skipGate で外す
export function gatePickedTargets<A extends EffectAction & PickProgress>(
    ctx: ActionCtx,
    action: A,
    ids: string[],
    find: (id: string) => { pid: PlayerId; inst: CardInstance } | undefined,
    attempt: EffectAttempt,
    onResisted: (inst: CardInstance, r: Resistance) => void,
    skipGate: (pid: PlayerId) => boolean = () => false,
): string[] | null {
    const { state, self, sourceName } = ctx
    const passed = [...(action.picked?.passed ?? [])]
    const failed = [...(action.picked?.failed ?? [])]
    for (const id of ids) {
        if (passed.includes(id) || failed.includes(id)) continue
        const found = find(id)
        // 選んでから適用するまでに場を離れた対象は何もしない（今のプールでは起きない。念のため）
        if (!found) {
            failed.push(id)
            continue
        }
        if (skipGate(found.pid)) {
            passed.push(id)
            continue
        }
        const resume = { ...action, picked: { ids, passed, failed } } as unknown as EffectAction
        const r = gateTargetedApply(state, found.pid, found.inst, attempt, resume, self, sourceName)
        if (r === "asked") return null
        if (r) {
            onResisted(found.inst, r)
            failed.push(id)
        } else passed.push(id)
    }
    return passed
}
