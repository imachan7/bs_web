// 効果を発揮させる（ACTION_VOCABULARY §3）：自分のスピリットの『召喚時』『破壊時』効果を、その出来事なしに発揮させる。
// 通常の誘発と同じ経路（fireTrigger）を通すので、条件・「〜できる」・ターンに1回もそのまま見る（2026-09-27 ユーザー確認）
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, EffectAction, EffectDef, GameState, PlayerId } from "../../type"
import { getCard, log, pushResumeFrames } from "../GameState"
import { fireSummonTrigger, fireTrigger, requestChoice } from "../EffectModules"
import { bravesOf, currentLevel, effectActiveAtLevel, matchesTarget } from "../../../../shared/rules"
import { normalizeFilter, SELF_REQUIRED } from "./filter"

type FireEffect = Extract<EffectAction, { type: "fireEffect" }>
type Triggered = Extract<EffectDef, { kind: "triggered" }>

// 「効果1つ」の単位。1つの効果を複数エントリに分けて書いたカード（BS13-048）があるので、
// きっかけ・レベル・条件・任意が同じエントリを1つにまとめる
// ponytail: 見出しが同じ別々の効果が2つあるカードは1つにまとまってしまう。現れたらデータ側に見出しの印を持たせる
function effectGroups(state: GameState, owner: PlayerId, inst: CardInstance, trigger: FireEffect["trigger"]): string[][] {
    return effectGroupsWithLabel(state, owner, inst, trigger).map((g) => g.ids)
}

// 選択肢の文言は効果の見出しのレベル（「Lv1･Lv2の効果」）。同じ見出しが重なったら番号を付ける
function effectGroupsWithLabel(state: GameState, owner: PlayerId, inst: CardInstance, trigger: FireEffect["trigger"]): { ids: string[]; label: string }[] {
    const level = currentLevel(inst).level
    const entries = [inst, ...bravesOf(state.players[owner], inst)].flatMap((src) =>
        getCard(src.cardId).effects.filter(
            (e): e is Triggered => e.kind === "triggered" && e.trigger === trigger && effectActiveAtLevel(e.levels, level),
        ),
    )
    const groups = new Map<string, { ids: string[]; label: string }>()
    for (const e of entries) {
        const key = JSON.stringify([e.levels, e.condition ?? null, e.optional ?? false, e.whileCombined ?? false])
        const label = e.levels ? `${e.levels.map((l) => `Lv${l}`).join("･")}の効果` : "効果"
        groups.set(key, { ids: [...(groups.get(key)?.ids ?? []), e.id], label })
    }
    const list = [...groups.values()]
    return list.map((g, i) => (list.filter((x) => x.label === g.label).length > 1 ? { ...g, label: `${g.label}${i + 1}` } : g))
}

const fireEffectHandler: ActionHandler<"fireEffect"> = (ctx, action) => {
    const { state, owner, self, sourceName, targetInstanceId, chosenOption } = ctx
    const player = state.players[owner]
    const fire = (inst: CardInstance, ids?: string[]): void => {
        log(state, `${sourceName}：${getCard(inst.cardId).name}の${action.trigger === "onSummon" ? "『召喚時』" : "『破壊時』"}効果を発揮させる。`)
        if (action.trigger === "onSummon") fireSummonTrigger(state, owner, inst, false, ids)
        else fireTrigger(state, owner, inst, "onDestroy", undefined, undefined, undefined, undefined, undefined, ids)
    }

    // すべて：開始時点の個体を順に。途中で場を離れた個体は飛ばし、選択で中断したら残りを積む
    if (action.all) {
        const ids = action.instanceIds ?? player.field.spirits.filter((s) => effectGroups(state, owner, s, action.trigger).length > 0).map((s) => s.instanceId)
        if (ids.length === 0) {
            log(state, `${sourceName}：発揮できる効果を持つ自分のスピリットがいなかった。`)
            return
        }
        for (let i = 0; i < ids.length; i++) {
            const inst = player.field.spirits.find((s) => s.instanceId === ids[i])
            if (inst) fire(inst)
            if (state.winner) return
            if (state.pendingChoice) {
                const rest = ids.slice(i + 1)
                if (rest.length > 0) pushResumeFrames(state, [{ kind: "action", selfInstanceId: self ? self.instanceId : null, actorPid: owner, action: { ...action, instanceIds: rest } }])
                return
            }
        }
        return
    }

    const filter = normalizeFilter(ctx, action)
    if (filter === SELF_REQUIRED) return
    const candidates = player.field.spirits.filter(
        (s) => matchesTarget(state, owner, s, filter, self?.instanceId) && effectGroups(state, owner, s, action.trigger).length > 0,
    )
    const chosenId = action.chosenId ?? targetInstanceId
    const inst = chosenId !== undefined ? candidates.find((s) => s.instanceId === chosenId) : candidates.length === 1 || !state.interactiveTargets ? candidates[0] : undefined
    if (inst === undefined) {
        if (candidates.length === 0 || chosenId !== undefined) {
            log(state, `${sourceName}：発揮できる効果を持つ自分のスピリットがいなかった。`)
            return
        }
        requestChoice(state, owner, `${sourceName}：効果を発揮させるスピリットを選んでください`, candidates.map((s) => s.instanceId), false, action, self)
        return
    }
    if (!action.oneEffect) {
        fire(inst)
        return
    }
    const labeled = effectGroupsWithLabel(state, owner, inst, action.trigger)
    const labels = labeled.map((g) => g.label)
    const groups = labeled.map((g) => g.ids)
    const picked = chosenOption !== undefined ? groups[labels.indexOf(chosenOption)] : groups.length === 1 || !state.interactiveTargets ? groups[0] : undefined
    if (picked === undefined) {
        requestChoice(state, owner, `${sourceName}：${getCard(inst.cardId).name}のどの効果を発揮させますか`, [], false, { ...action, chosenId: inst.instanceId }, self, "option", labels)
        return
    }
    fire(inst, picked)
}

const handlers = {
    fireEffect: fireEffectHandler,
} satisfies Partial<ActionRegistry>

export default handlers
