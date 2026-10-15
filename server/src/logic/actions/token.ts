// トークンを「出す」（26系。batspi wiki「トークンスピリット」／2026-10-08 ユーザー確定）。
// 召喚ではない: 召喚時効果・「召喚された時」は起きず、召喚制限も受けない。カードのコストは払わず、
// 最低Lvぶんのコアを自分のリザーブ＋フィールドから置く。体数の上限は設けない（用意枚数は管理しない簡略化）
import type { ActionRegistry, ActionHandler } from "./types"
import { CARD_DB, createInstance, findSpirit, log } from "../GameState"
import { autoPayPlan, payCost } from "../EffectModules"
import { moveSoulCore, wouldDeplete } from "../soulCore"
import { destroySpirit } from "../removal"
import { minLevelCores } from "../../../../shared/rules/activation"
import { isTokenCard } from "../../../../shared/cardDb"

const spawnTokenHandler: ActionHandler<"spawnToken"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const card = [...CARD_DB.values()].find((c) => isTokenCard(c.cardId) && c.name === action.token)
    if (!card) {
        log(state, `${sourceName}：トークン「${action.token}」のカードが見つからない。`)
        return
    }
    const maintain = minLevelCores(card)
    let made = 0
    // ponytail: 「N体まで」は払える限り最大数を出し、置くコアの出どころも自動（autoPayPlan）。体数・支払い元を選ばせるなら PendingChoice を足す
    for (let i = 0; i < action.count; i++) {
        const plan = autoPayPlan(state, owner, maintain)
        if (plan === null) break
        const normal = maintain - (plan.soulFromReserve ? 1 : 0)
        const placedFromField = payCost(state, owner, 0, plan.paySources, normal)
        player.reserve -= normal - placedFromField
        const inst = createInstance(card.cardId, state.turn, normal)
        player.field.spirits.push(inst)
        if (plan.soulFromReserve) moveSoulCore(player, { zone: "instance", instanceId: inst.instanceId })
        made++
        // コアを出したスピリットが維持コアを割ったら消滅（支払い元はまだ場にあるので次の1体の支払いには使わない）
        for (const src of plan.paySources) {
            const sp = findSpirit(player, src.instanceId)
            if (sp && wouldDeplete(state, owner, sp)) destroySpirit(state, owner, sp.instanceId, "deplete")
        }
    }
    log(state, made > 0 ? `${sourceName}：${player.name}はトークンの「${card.name}」を${made}体出した。` : `${sourceName}：コアが足りずトークンを出せなかった。`)
}

const handlers = { spawnToken: spawnTokenHandler } satisfies Partial<ActionRegistry>

export default handlers
