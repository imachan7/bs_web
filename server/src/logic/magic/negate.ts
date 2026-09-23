import type { CardData, CardInstance, PendingChoice, EffectDef, GameState, PlayerId } from "../../type"
import { currentLevel, getCard, log, opponentOf } from "../GameState"
import { magicEffectiveColors } from "../../../../shared/cost"
import { effectActiveAtLevel, effectSources, hasKeyword, isVirtualSource } from "../../../../shared/rules"
import { canExhaustNexus, exhaustSpirit } from "../EffectModules"
import { fireFieldEventTriggers } from "../triggers"
import { resolveMagicEffects, fireMagicUsedTriggers } from "./resolve"

// マジックを無効にできる発生源（kind:"magicNegate"）を、使用者の相手側のフィールドから探す。
// 見つからない条件（レベル・色・ステップ・ターン・ターン1回・コストが払えない）はすべてここで弾くので、
// 呼び出し側は「見つかったら必ず無効化できる」前提で書ける
// 【氷壁】の支払いを肩代わりできる、持ち主の回復状態のネクサス（BS09-062ノルンの泉）。
// 無ければ null。ノルンの泉自身も対象に含む（除外の記述が無いため）
export function magicNegateNexusPayer(state: GameState, ownerPid: PlayerId): CardInstance | null {
    let granted = false
    for (const source of effectSources(state, ownerPid)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicNegatePayByNexusGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
            if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
            granted = true
        }
    }
    if (!granted) return null
    // BS09-063花の宮殿Lv2：相手がネクサスの疲労を禁じている間は肩代わりできない
    if (!canExhaustNexus(state, ownerPid)) return null
    return state.players[ownerPid].field.nexuses.find((n) => !n.isRested) ?? null
}

// 【氷壁】の発揮タイミングの置き換え（BS09-077アイスバーグ）。無ければ undefined
export function magicNegateTurnOverride(state: GameState, ownerPid: PlayerId): "own" | "opponent" | undefined {
    for (const source of effectSources(state, ownerPid)) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "magicNegateTurnOverrideGrant") continue
            if (effect.lentOnly && !isVirtualSource(source)) continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            return effect.turn
        }
    }
    return undefined
}

export function findMagicNegateSource(
    state: GameState,
    casterPid: PlayerId,
    card: CardData,
): {
    pid: PlayerId
    inst: CardInstance
    effect: Extract<EffectDef, { kind: "magicNegate" }>
    nexusPayer?: CardInstance
} | null {
    const defenderPid = opponentOf(casterPid)
    // 【氷壁】限定の支払い代替・タイミング置換（BS09-062ノルンの泉／BS09-077アイスバーグ）
    const nexusPayer = magicNegateNexusPayer(state, defenderPid)
    const turnOverride = magicNegateTurnOverride(state, defenderPid)
    for (const inst of effectSources(state, defenderPid)) {
        const level = currentLevel(inst).level
        const isHyoheki = hasKeyword(inst.cardId, "hyoheki")
        // grantedMagicNegate（kind:"effectEntryGrant"。BS12-068光の聖剣Lv1）：継続付与された
        // magicNegateエントリもcard自身のeffectsと合わせて走査する（levelsは常に有効扱い）
        const entries: Extract<EffectDef, { kind: "magicNegate" }>[] = [
            ...getCard(inst.cardId).effects.filter(
                (e): e is Extract<EffectDef, { kind: "magicNegate" }> => e.kind === "magicNegate",
            ),
            ...(inst.grantedMagicNegate ?? []),
        ]
        for (const effect of entries) {
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            // 【氷壁】を持つスピリットだけ、発揮タイミングを置き換えられる
            const turn = isHyoheki && turnOverride !== undefined ? turnOverride : effect.turn
            if (turn === "own" && defenderPid !== state.turnPlayer) continue
            if (turn === "opponent" && defenderPid === state.turnPlayer) continue
            // 【氷壁：赤】＝赤のマジックのみ無効にできる。色はmagicEffectiveColorsを通す
            // （BS15-015吸血令嬢エサルフリーダ「自分が使用する紫のマジックカードの色を無いものとして扱う」が
            // 【氷壁】の色判定もすり抜ける。BS15_PLAN.md §7.3）
            if (
                effect.colors !== undefined &&
                !effect.colors.some((c) => magicEffectiveColors(state, casterPid, card).includes(c))
            )
                continue
            if (effect.oncePerTurn && inst.magicNegateUsedTurn === state.turn) continue
            // コストを払えないなら発動できない。
            // 【氷壁】はネクサスの疲労で肩代わりできる（ノルンの泉）。**代替できるときはそちらを優先**して
            // スピリットを回復状態のまま残す（プレイヤー選択の決定的簡略化）
            const payer = isHyoheki && nexusPayer ? nexusPayer : null
            if ("exhaustSelf" in effect.cost) {
                if (!payer && inst.isRested) continue
            } else if ("selfCoresToVoid" in effect.cost) {
                if (inst.cores < effect.cost.selfCoresToVoid) continue
            }
            // cost:{none} は支払い無し（SD02-014 魔法監視塔Lv2）。そのまま発動できる
            return payer && "exhaustSelf" in effect.cost
                ? { pid: defenderPid, inst, effect, nexusPayer: payer }
                : { pid: defenderPid, inst, effect }
        }
    }
    return null
}

// 無効化のコストを支払い、ログを残す。呼び出し側はこのあとマジックの効果を解決しない
export function payMagicNegate(
    state: GameState,
    found: {
        pid: PlayerId
        inst: CardInstance
        effect: Extract<EffectDef, { kind: "magicNegate" }>
        nexusPayer?: CardInstance
    },
    card: CardData,
): void {
    const { pid, inst, effect } = found
    if ("exhaustSelf" in effect.cost) {
        if (found.nexusPayer) {
            // ノルンの泉：スピリットの代わりにネクサス1つを疲労させる
            found.nexusPayer.isRested = true
            log(state, `${getCard(found.nexusPayer.cardId).name}（ネクサス）を代わりに疲労させた。`)
        } else {
            exhaustSpirit(state, pid, inst)
            // ownHyohekiUsed（BS12-032蹴激皇ヴィーザル）：【氷壁】を発揮して自身を疲労させた時点で発火する。
            // 無効化が実際に成功したかは問わない（2026-09-07 ユーザー確認）
            if (hasKeyword(inst.cardId, "hyoheki")) {
                fireFieldEventTriggers(state, pid, "ownHyohekiUsed", { pid, inst })
            }
        }
    } else if ("selfCoresToVoid" in effect.cost) {
        // ボイド行きなので、リザーブにもトラッシュにも戻らない
        inst.cores -= effect.cost.selfCoresToVoid
        log(
            state,
            `${getCard(inst.cardId).name}：コア${effect.cost.selfCoresToVoid}個をボイドに置いた。`,
        )
    }
    if (effect.oncePerTurn) inst.magicNegateUsedTurn = state.turn
    log(state, `${getCard(inst.cardId).name}の効果で、${card.name}の効果は無効になった。`)
    // afterNegate:"selfToDeckBottom"（SD02-014 魔法監視塔Lv2）：無効にした**後**、発生源をデッキの下へ。
    // 「その後」＝前後関係なので支払いではない（無効にしなければ戻らない）。2026-08-16 ユーザー確認
    if (effect.afterNegate === "selfToDeckBottom") {
        const player = state.players[pid]
        const index = player.field.nexuses.findIndex((n) => n.instanceId === inst.instanceId)
        const zone = index >= 0 ? player.field.nexuses : player.field.spirits
        const idx = index >= 0 ? index : player.field.spirits.findIndex((sp) => sp.instanceId === inst.instanceId)
        if (idx >= 0) {
            // 場を離れるので、上に乗っていたコアは持ち主のリザーブへ戻る（通常の離脱と同じ）
            player.reserve += inst.cores
            zone.splice(idx, 1)
            player.deck.push(inst.cardId)
            log(state, `${getCard(inst.cardId).name}はデッキの下に戻った。`)
        }
    }
}

// pendingChoice（無効化の確認）で「無効にする」が選ばれたときの後処理。
// GameEngine.doResolveChoice から呼ぶ
export function applyMagicNegateChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicNegate"]>,
): void {
    const card = getCard(info.cardId)
    const found = findMagicNegateSource(state, info.casterPid, card)
    // 確認を出したあとに盤面が変わってコストを払えなくなった場合は、無効化せず通常どおり解決する
    if (!found || found.inst.instanceId !== info.sourceInstanceId) {
        resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId, info.paidCost)
        return
    }
    payMagicNegate(state, found, card)
    fireMagicUsedTriggers(state, info.casterPid, card, info.timing, info.paidCost)
}

// pendingChoice（無効化の確認）で「無効にしない」が選ばれたときの後処理。中断していた解決を続ける
export function declineMagicNegateChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicNegate"]>,
): void {
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId, info.paidCost)
}
