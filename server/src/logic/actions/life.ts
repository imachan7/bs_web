// ライフを増やす・減らすアクション
import type { ActionHandler, ActionRegistry } from "./types"
import { getCard, instMinLevelCores, log, suspend } from "../GameState"
import { fireFieldEventTriggers, destroySpirit, exhaustSpirit, recordTimed } from "../EffectModules"
import { effectiveBp, spiritHasKeyword, isEndStepLocked, hasGlobalConstraint } from "../../../../shared/rules"
import { countedAmount } from "../counted"


// BS07ライフセービング：このスピリット（self）の上のコアを自分のライフに置く。
// 維持コア割れになる場合は消滅処理を通す（checkExhaustOnCoreChange と同じ扱いを destroySpirit に委ねる）
const selfCoreToOwnLifeHandler: ActionHandler<"selfCoreToOwnLife"> = (ctx, action) => {
    const { state, owner, self, sourceName } = ctx
        if (!self) {
            log(state, `${sourceName}：対象のスピリットがいなかった。`)
            return
        }
        const moved = Math.min(action.count, self.cores)
        if (moved === 0) {
            log(state, `${sourceName}：置けるコアがなかった。`)
            return
        }
        self.cores -= moved
        state.players[owner].life += moved
        log(
            state,
            `${getCard(self.cardId).name}の上のコア${moved}個を${state.players[owner].name}のライフに置いた。（現在ライフ${state.players[owner].life}）`,
        )
        if (self.cores < instMinLevelCores(self)) {
            destroySpirit(state, owner, self.instanceId, "deplete")
        }
        return
}

// BS12-037オリンピアの天使ベトールLv2-3：selfCoreToOwnLifeの「このスピリット」限定を、
// 「自分のフィールドのコア」＝場のどこからでもよい版に広げたもの。ネクサス（コア最多）を優先し、
// 足りなければスピリット（実効BP最小）から取る。スピリットから取って維持コアを割ったら消滅処理を通す
const fieldCoreToLifeHandler: ActionHandler<"fieldCoreToLife"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    let remaining = action.count
    let moved = 0
    while (remaining > 0) {
        const nexusCandidates = player.field.nexuses.filter((n) => n.cores > 0)
        if (nexusCandidates.length > 0) {
            const target = nexusCandidates.reduce((most, n) => (n.cores > most.cores ? n : most))
            const taken = Math.min(remaining, target.cores)
            target.cores -= taken
            remaining -= taken
            moved += taken
            continue
        }
        const spirits = player.field.spirits.filter((s) => s.cores > 0)
        if (spirits.length === 0) break
        const target = spirits.reduce((worst, s) =>
            effectiveBp(state, owner, s) < effectiveBp(state, owner, worst) ? s : worst,
        )
        const taken = Math.min(remaining, target.cores)
        target.cores -= taken
        remaining -= taken
        moved += taken
        if (target.cores < instMinLevelCores(target)) {
            destroySpirit(state, owner, target.instanceId, "deplete")
        }
    }
    if (moved === 0) {
        log(state, `${sourceName}：フィールドに置けるコアがなかった。`)
        return
    }
    player.life += moved
    log(state, `${player.name}は自分のフィールドのコア${moved}個をライフに置いた。（現在ライフ${player.life}）`)
}

const lifeChargeHandler: ActionHandler<"lifeCharge"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        // costExhaustSelf（BS13-070星宿の障壁Lv2）：発生源自身（ネクサス）を疲労させることがコスト。
        // 既に疲労状態なら不発（COST_MODEL.md §1）
        if (action.costExhaustSelf) {
            if (!self || self.isRested) {
                log(state, `${sourceName}：疲労できないため発動しなかった。`)
                state.effectFizzled = true
                return
            }
            exhaustSpirit(state, owner, self)
        }
        // 器BF：costMillSelfCount（BS13-058シユウ）「デッキを上からN枚破棄することで」。
        // 破棄はあるだけ処理してコストも払う（COST_MODEL.md）ので、デッキが尽きていても0枚破棄で成立する
        if (action.costMillSelfCount !== undefined) {
            const n = Math.min(action.costMillSelfCount, player.deck.length)
            for (let i = 0; i < n; i++) {
                const cardId = player.deck.shift()!
                player.trashCards.push(cardId)
            }
            log(state, `${player.name}はデッキを上から${n}枚破棄した。`)
        }
        // 「お互い、ボイド/リザーブからライフにコアを置けない」（BS10-108 ルナティックシール）。
        // このハンドラの置き元はボイドかリザーブのみ（スピリット上のコアから置く経路は別ハンドラ）
        if (isEndStepLocked(state, "lifeChargeFromVoidOrReserve")) {
            log(state, `${sourceName}：効果により、ボイド/リザーブからライフにコアを置けなかった。`)
            return
        }
        // 「お互い、ボイドからライフにコアを置けない」（BS11-072 未完成の古代戦艦：船尾）。
        // 置き元がボイドのときだけ止める（リザーブ・スピリット上からの経路は通す）
        if (action.from === "void" && hasGlobalConstraint(state, "noVoidToLife")) {
            log(state, `${sourceName}：効果により、ボイドからライフにコアを置けなかった。`)
            return
        }
        // upTo（BS09-X35超神星龍ジークヴルム・ノヴァ）：「ライフが5になるように」不足分だけ置く。
        // すでにその数以上なら何も置かない。ボイドから置くので必ず届く
        if (action.upTo !== undefined) {
            const need = action.upTo - player.life
            if (need <= 0) {
                log(state, `${sourceName}：ライフはすでに${String(action.upTo)}以上のため、コアは置かれなかった。`)
                return
            }
            player.life += need
            log(state, `${player.name}はボイドからライフにコア${String(need)}個を置いた。（現在ライフ${String(player.life)}）`)
            return
        }
        // 器BF：thenUnblockableByLevelThisBattle（BS13-058）：置いた後に発生源自身へブロック不可の印を付ける
        const grantThenUnblockable = (): void => {
            if (action.thenUnblockableByLevelThisBattle === undefined || !self) return
            recordTimed(state, { content: [{ type: "unblockable", from: { level: action.thenUnblockableByLevelThisBattle } }], target: { kind: "instance", instanceId: self.instanceId }, until: "battle", ownerPid: owner })
            log(
                state,
                `${sourceName}：このバトルの間、Lv${action.thenUnblockableByLevelThisBattle.join("/")}のスピリットからブロックされない。`,
            )
        }
        // from:"void"（【聖命】）はボイドから置くのでリザーブを消費せず、必ず count 個置ける
        if (action.from === "void") {
            // countCounter（BS13-040金星神龍ヴィーナ・フェーザー）：count×EffectCounterの値を枚数として使う（0ならログのみ）
            const voidCount = action.countCounter !== undefined ? countedAmount(state, owner, self, action.count ?? 1, action.countCounter, srcType) : action.count
            if (voidCount <= 0) {
                log(state, `${sourceName}：対象がいないため発動しなかった。`)
                return
            }
            // orReserve（BS15-X05光の覇王ルナアーク・カグヤ）：「自分のライフか、自分のリザーブに置く」を
            // 効果の使用者が毎回選ぶ（voidCoreToSelf.orReserveの鏡。非対話時はライフ側に倒す）
            if (action.orReserve) {
                if (chosenOption === "リザーブに置く") {
                    player.reserve += voidCount
                    log(state, `${player.name}はボイドからコア${voidCount}個をリザーブに置いた。（リザーブ${player.reserve}）`)
                    return
                }
                if (chosenOption !== "ライフに置く" && state.interactiveTargets) {
                    suspend(state, {
                        pid: owner,
                        kind: "option",
                        prompt: `${sourceName}：ボイドからコア${voidCount}個を、自分のライフか、自分のリザーブのどちらに置きますか？`,
                        candidates: [],
                        options: ["ライフに置く", "リザーブに置く"],
                        optional: false,
                        action,
                        selfInstanceId: self ? self.instanceId : null,
                    })
                    return
                }
            }
            player.life += voidCount
            log(
                state,
                `${player.name}はボイドからライフにコア${voidCount}個を置いた。（現在ライフ${player.life}）`,
            )
            // BS09-064天駆ける方舟：「【聖命】の効果で自分のライフにコアが置かれたとき」。
            // 発生源が【聖命】持ちのときだけ発火させる（同じ lifeCharge でも他のカードは対象外）
            if (self && spiritHasKeyword(state, owner, self, "seimei")) {
                fireFieldEventTriggers(state, owner, "ownSeimeiLifeCharged", { pid: owner, inst: self })
            }
            grantThenUnblockable()
            return
        }
        const amount = Math.min(action.count, player.reserve)
        player.reserve -= amount
        player.life += amount
        log(
            state,
            `${player.name}はリザーブからライフにコア${amount}個を置いた。（現在ライフ${player.life}）`,
        )
        return
}

// BS15-X01刀の覇王ムサシード・アシュライガーLv3：相手のライフのコアをcount個、相手のリザーブへ置く
// （相手のライフがcountに満たなければあるだけ移す。0枚なら不発）
const opponentLifeToReserveHandler: ActionHandler<"opponentLifeToReserve"> = (ctx, action) => {
    const { state, opp, sourceName } = ctx
    const target = state.players[opp]
    const moved = Math.min(action.count, target.life)
    if (moved <= 0) {
        log(state, `${sourceName}：${target.name}のライフが無いため発動しなかった。`)
        return
    }
    target.life -= moved
    target.reserve += moved
    log(state, `${sourceName}：${target.name}のライフのコア${moved}個をリザーブに置いた。`)
}

const handlers = {
    selfCoreToOwnLife: selfCoreToOwnLifeHandler,
    fieldCoreToLife: fieldCoreToLifeHandler,
    lifeCharge: lifeChargeHandler,
    opponentLifeToReserve: opponentLifeToReserveHandler,
} satisfies Partial<ActionRegistry>

export default handlers
