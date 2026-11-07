// BS23 B1（part833〜835）共通の道具。選択待ちの答え方と、盤面の差分の行を組む関数だけを置く
import { getCard } from "./helpers"
import type { ScenarioCtx } from "./scenario"

export const names = (...ids: string[]): string => ids.map((c) => getCard(c).name).sort().join("、") || "なし"

export const handRow = (who: "自分" | "相手", before: string[], after: string[]): string => `${who}.手札: ${names(...before)} → ${names(...after)}`
export const trashRow = (who: "自分" | "相手", before: string[], after: string[]): string => `${who}.トラッシュ: ${names(...before)} → ${names(...after)}`

// 場面の途中で現れた個体の行。合体中のブレイヴは BP の行が出ない（scenario.ts の写像）
export function appear(who: "自分" | "相手", cardId: string, o: { where?: string; rested?: boolean; cores: number; lv?: number; bp?: number }): string[] {
    const k = `${who}.${getCard(cardId).name}`
    const rows = [
        `${k}.場所: なし → ${o.where ?? "フィールド"}`,
        `${k}.疲労: なし → ${o.rested ?? false}`,
        `${k}.コア: なし → ${o.cores}`,
        `${k}.Lv: なし → ${o.lv ?? 1}`,
    ]
    if (o.bp !== undefined) rows.push(`${k}.BP: なし → ${o.bp}`)
    return rows
}

export const left = (who: "自分" | "相手", label: string, from = "フィールド"): string => `${who}.${label}.場所: ${from} → なし`

export interface Want {
    card?: string // 手札から選ぶカードの cardId
    decline?: boolean // 任意の確認・選択を断る
    picks?: string[] // 対象選択で選ぶ個体の cardId（候補にいる最初のもの）。どれも候補になければ選ばない（スキップ）
    opt?: RegExp // 確認でない選択肢から選ぶラベル
    onPrompt?: (t: ScenarioCtx) => void // 選択待ちが出るたびに、答える前に呼ぶ（候補の検査用）
}

export function cardIdOf(t: ScenarioCtx, instanceId: string): string | undefined {
    for (const p of Object.values(t.state.players)) {
        for (const x of [...p.field.spirits, ...p.field.nexuses, ...p.field.combinedBraves]) if (x.instanceId === instanceId) return x.cardId
    }
    return undefined
}

// 選択待ちがなくなるまで答える。スキップ＝断る／選ばない（ブレイヴの置き方の選択ではスピリット状態）
export function drive(t: ScenarioCtx, w: Want = {}): void {
    for (let i = 0; t.state.pendingChoice; i++) {
        if (i > 20) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        const skip = () => t.act(side, { type: "resolveChoice" })
        w.onPrompt?.(t)
        if (pc.kind === "option") {
            if (pc.confirm) {
                if (w.decline) skip()
                else t.act(side, { type: "resolveChoice", option: pc.options![0]! })
            } else {
                const o = w.opt ? pc.options!.find((x) => w.opt!.test(x)) : undefined
                if (o !== undefined) t.act(side, { type: "resolveChoice", option: o })
                else if (pc.optional) skip()
                else t.act(side, { type: "resolveChoice", option: pc.options![0]! })
            }
        } else if (pc.kind === "card") {
            const hand = t.state.players[pc.pid].hand
            const idx = w.decline ? undefined : pc.cardIndices!.find((n) => hand[n] === w.card)
            if (idx === undefined) {
                if (!pc.optional) throw new Error(`手札から選ぶカードが無い（必須の選択）: ${pc.prompt}`)
                skip()
            } else t.act(side, { type: "resolveChoice", cardIndex: idx })
        } else {
            const chosen = new Set(pc.selectedIds ?? [])
            let hit: string | undefined
            for (const want of w.picks ?? []) {
                hit = pc.candidates.find((id) => !chosen.has(id) && cardIdOf(t, id) === want)
                if (hit !== undefined) break
            }
            if (hit !== undefined) t.act(side, { type: "resolveChoice", instanceId: hit })
            else if (pc.optional || pc.resolveOnSkip) skip()
            else t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
    }
}

// 選択待ちに答え、フラッシュは両者パスで閉じる。バトルの解決で【抜刀】が割り込んでも途切れない
export function settle(t: ScenarioCtx, w: Want = {}): void {
    for (let i = 0; i < 30; i++) {
        if (t.state.pendingChoice) drive(t, w)
        else if (t.state.isFlashTiming && t.state.battle) t.act(t.state.priorityPlayer === t.me ? "me" : "opp", { type: "pass" })
        else return
    }
    throw new Error("settle が終わらない")
}
