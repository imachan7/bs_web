// 同時発揮の列で後回しにした誘発の Lv の見直し（公式 Q2717。2026-11-13 ユーザー決定）。
// 自分の番が来た時点の Lv でも levels を満たさなければ発揮しない。
// 見るのは Lv だけ：効果を失った・場を離れた発生源の扱いは各経路の既存の判定のまま（場にいない発生源は見直さない）

import type { GameState } from "../type"
import { currentLevel, findInstanceAnywhere, getCard, log } from "./GameState"
import { ownerPidOfInstance } from "./oncePerTurn"
import { effectActiveAtLevel } from "../../../shared/rules"

export interface LevelRecheck {
    instanceId: string
    effectId: string
}

// 満たさなければログを残して false
export function levelStillMet(state: GameState, ref: LevelRecheck): boolean {
    const src = findInstanceAnywhere(state, ref.instanceId)
    if (!src || ownerPidOfInstance(state, src) === undefined) return true
    const effect = getCard(src.cardId).effects.find((e) => e.id === ref.effectId)
    if (!effect || !("levels" in effect)) return true
    const level = currentLevel(src).level
    if (effectActiveAtLevel(effect.levels ?? null, level)) return true
    log(state, `${getCard(src.cardId).name}はLv${level}になっていたため、その効果は発揮しなかった。`)
    return false
}
