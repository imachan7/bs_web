// 効果の解決通知（画面の「どのカードのどの効果か」の表示）。スピリット・ネクサス・ブレイヴの効果だけで、マジック・バーストは別の出来事を持つ
import type { CardInstance, EffectAction, EffectDef, GameState, PlayerId, TriggerEvent } from "../type"
import { getCard } from "./GameState"
import { emitEvent } from "./EffectModules"

// 見出し行（Lv1･Lv2『このスピリットのアタック時』）に含まれる語。誘発の種類ごと。ここに無い種類は見出しを出さずカード名だけにする
const HEADING_WORDS: Partial<Record<TriggerEvent, string[]>> = {
    onSummon: ["召喚時"],
    onDeploy: ["配置時"],
    onAttack: ["アタック時"],
    onBlock: ["ブロック時"],
    onDestroy: ["破壊時"],
    onBlocked: ["ブロックされ"],
    onBattleStart: ["バトル時"],
    onBattleEnd: ["バトル終了時"],
    onRefreshed: ["回復"],
}

function headingOf(cardId: string, effect: EffectDef): string | undefined {
    if (effect.kind !== "triggered") return undefined
    const words = HEADING_WORDS[effect.trigger]
    if (!words) return undefined
    for (const line of getCard(cardId).effect.split("\n")) {
        const at = line.indexOf("』")
        if (!line.includes("『") || at === -1) continue
        const head = line.slice(0, at + 1)
        if (!words.some((w) => head.includes(w))) continue
        const lvs = [...head.matchAll(/Lv(\d)/g)].map((m) => Number(m[1]))
        if (effect.levels === null || lvs.length === 0 || lvs.some((l) => effect.levels!.includes(l))) return head
    }
    return undefined
}

// action は EffectDef が持つ同じオブジェクトで来るので、参照一致で効果を引く（ターン1回の包み直しなどで外れたら見出しだけ省く）
export function emitEffectNotice(state: GameState, owner: PlayerId, self: CardInstance, action: EffectAction): void {
    const card = getCard(self.cardId)
    const effect = card.effects.find((e) => "action" in e && e.action === action)
    const heading = effect ? headingOf(self.cardId, effect) : undefined
    emitEvent(state, { type: "effect", pid: owner, cardId: self.cardId, cardName: card.name, instanceId: self.instanceId, ...(heading !== undefined ? { heading } : {}) })
}
