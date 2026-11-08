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

// 【連鎖】の[色]の節（keyword:"rensa" のエントリの if）か。コンテキストに効果エントリが渡らないので、
// 発生源（合体中のブレイヴ込み）の rensa エントリの中に同じ if があるかを JSON の一致で見る
export function isRensaClause(state: GameState, pid: PlayerId, self: CardInstance, clause: EffectAction): boolean {
    const text = JSON.stringify(clause)
    for (const source of [self, ...bravesOf(state.players[pid], self)]) {
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind === "triggered" && effect.keyword === "rensa" && JSON.stringify(effect.action).includes(text)) return true
        }
    }
    return false
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
