// ライフを増やす・減らすアクション
import type { ActionHandler, ActionRegistry } from "./types"
import { log, suspend } from "../GameState"
import { fireFieldEventTriggers, recordTimed } from "../EffectModules"
import { spiritHasKeyword, isEndStepLocked, hasGlobalConstraint } from "../../../../shared/rules"
import { countedAmount } from "../counted"


const lifeChargeHandler: ActionHandler<"lifeCharge"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, srcColors, srcType, destroyContext, targetInstanceId, chosenOption, chosenCardIndex } = ctx
        const player = state.players[owner]
        // 器BF：costMillSelfCount（BS13-058シユウ）「デッキを上からN枚破棄することで」。
        // 一般則（COST_MODEL.md §1）どおり、デッキがN枚未満なら払わず発揮もしない
        // （2026-09-26修正：以前はあるだけ破棄して成立させていた）
        if (action.costMillSelfCount !== undefined) {
            const n = action.costMillSelfCount
            if (player.deck.length < n) {
                log(state, `${sourceName}：デッキが足りないため発動しなかった。`)
                return
            }
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
    lifeCharge: lifeChargeHandler,
    opponentLifeToReserve: opponentLifeToReserveHandler,
} satisfies Partial<ActionRegistry>

export default handlers
