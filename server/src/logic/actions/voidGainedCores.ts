// coresGainedFromVoid で増えたコアを、置かれた場所からボイドへ戻す（BS18-013）
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, log, opponentOf } from "../GameState"
import { removeCoresToVoid } from "../EffectModules"
import { lifeLossAllowed, recordLifeLoss } from "../lifeGate"

// 「すべて」でも直近の1イベントぶんだけ。その場所のコアがすでに減っていれば残りぶんだけ戻す
const voidGainedCoresHandler: ActionHandler<"voidGainedCores"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const g = state.lastCoresGained
    if (!g) {
        log(state, `${sourceName}：戻すコアがなかった。`)
        return
    }
    const gp = state.players[g.gainerPid]
    for (const pl of g.places) {
        if (pl.where === "reserve") {
            const n = Math.min(pl.n, gp.reserve)
            gp.reserve -= n
            if (n > 0) log(state, `${gp.name}のリザーブのコア${n}個をボイドに置いた。`)
        } else if (pl.where === "life") {
            const n = lifeLossAllowed(state, { pid: g.gainerPid, amount: Math.min(pl.n, gp.life), cause: "effect", actorPid: owner, sourceType: ctx.srcType, sourceInstance: ctx.self ?? undefined })
            gp.life -= n
            recordLifeLoss(state, g.gainerPid, n, ctx.self)
            if (n > 0) log(state, `${gp.name}のライフのコア${n}個をボイドに置いた。`)
            if (gp.life <= 0 && !state.winner) {
                state.winner = opponentOf(g.gainerPid)
                log(state, `${state.players[state.winner].name}の勝利！`)
            }
        } else {
            const spirit = gp.field.spirits.find((i) => i.instanceId === pl.instanceId)
            if (spirit) {
                removeCoresToVoid(state, g.gainerPid, spirit, pl.n, owner, ctx.srcType)
                continue
            }
            const nexus = gp.field.nexuses.find((i) => i.instanceId === pl.instanceId)
            if (nexus) {
                const n = Math.min(pl.n, nexus.cores)
                nexus.cores -= n
                if (n > 0) log(state, `${gp.name}の${getCard(nexus.cardId).name}のコア${n}個をボイドに置いた。`)
            }
        }
    }
}

const handlers = { voidGainedCores: voidGainedCoresHandler } satisfies Partial<ActionRegistry>
export default handlers
