// 【連鎖】の条件無視（SD11-X02【合体時】「このスピリットの【連鎖】は、条件を無視して発揮する」）。
// 合体中のブレイヴが kind:"rensaIgnoreCondition" を持つとき、ホストの【連鎖】の条件
// （if cond:{count:{ownColorSymbols}}）を成立扱いにする。合体解除で効かなくなる
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteCoverage } from "../../../../shared/coverage"
import { bravesOf, currentLevel } from "../../../../shared/rules"
import type { CardInstance, Color, EffectAction, GameState, PlayerId } from "../../type"
import { getCard } from "../GameState"
import { fireFieldEventTriggers } from "../fieldEventTriggers"

export function rensaConditionIgnored(state: GameState, pid: PlayerId, self: CardInstance): boolean {
    for (const brave of bravesOf(state.players[pid], self)) {
        const level = currentLevel(brave).level
        for (const effect of getCard(brave.cardId).effects) {
            if (effect.kind !== "rensaIgnoreCondition") continue
            if (!entryActive(state, pid, brave, effect, level)) continue
            noteCoverage(effect, "rensaIgnoreCondition")
            return true
        }
    }
    return false
}

// 【連鎖】の節の中のアクションすべてに rensa を付ける。選択待ちで中断しても、再開用の action（{...action}）が印を運ぶ。
// 古の魔王城（Q23568）が、解決中の対象選択を【連鎖】の部分と見分けるのに読む
export function markRensa(action: EffectAction): EffectAction {
    const walk = (v: unknown): unknown =>
        Array.isArray(v) ? v.map(walk)
        : v !== null && typeof v === "object"
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]).concat("type" in v ? [["rensa", true]] : []))
            : v
    return walk(action) as EffectAction
}

// 節を解決し終えた直後（選択待ちから再開した後でも sequence の続きとして）呼ばれる
export function fireRensaActivated(state: GameState, pid: PlayerId, self: CardInstance | null, color: Color, drawFrom: number): void {
    if (self === null) return
    const drew = (state.drawCount?.[pid] ?? 0) > drawFrom
    fireFieldEventTriggers(state, pid, "ownKeywordActivated", { pid, inst: self }, undefined, undefined, undefined, {
        keyword: "rensa",
        rensaColor: color,
        ...(drew ? { rensaDrew: true } : {}),
    })
}
