// BS23 緑バッチの場面テスト（part857〜859）の共通部品
import { getCard } from "./helpers"
import type { ScenarioCtx, Side } from "./scenario"

// 分身スピリットのカード名はカード定義側で決まる。効果文に名前が無いため仮置き
export const BN = "分身スピリット"

// 写像の「手札」「トラッシュ」の書式（名前を並べ替えて「、」でつなぐ）
export const names = (ids: string[]): string => ids.map((c) => getCard(c).name).sort().join("、") || "なし"

// 場面の途中で場に出た個体の写像の行
export function arrive(label: string, o: { cores: number; lv: number; bp: number }, side = "自分"): string[] {
    const k = `${side}.${label}`
    return [`${k}.場所: なし → フィールド`, `${k}.疲労: なし → false`, `${k}.コア: なし → ${o.cores}`, `${k}.Lv: なし → ${o.lv}`, `${k}.BP: なし → ${o.bp}`]
}

// n 体目の分身スピリット（Lv1 BP3000。同名は #2 から番号が付く）
export function bunshin(n: number, cores: number): string[] {
    return arrive(n === 1 ? BN : `${BN}#${n}`, { cores, lv: 1, bp: 3000 })
}

// 合体したブレイヴ（コアはホストへ移るので 0 個・Lv1）
export function braved(label: string): string[] {
    const k = `自分.${label}`
    return [`${k}.場所: なし → 合体`, `${k}.疲労: なし → false`, `${k}.コア: なし → 0`, `${k}.Lv: なし → 1`]
}

type Pending = { pid: string; options?: string[]; cardIndices?: number[]; candidates?: string[]; optional?: boolean; confirm?: boolean } | null

// 出た選択待ちに答えきる。yes＝「〜できる」の確認や任意の選択を受ける／no＝断る。
// prefer に対象の instanceId を渡すと、候補にあればそれを選ぶ
export function settle(t: ScenarioCtx, answer: "yes" | "no" = "yes", prefer: string[] = []): void {
    for (let n = 0; n < 20; n++) {
        const pc = t.state.pendingChoice as unknown as Pending
        if (!pc) return
        const side: Side = pc.pid === t.me ? "me" : "opp"
        const opts = pc.options ?? []
        const declines = (o: string) => /しない|いいえ|断る|発揮しない/.test(o)
        if (answer === "no" && pc.confirm && pc.optional) {
            // 「発動する」だけが選択肢に出る確認は、何も選ばずに答えるのが断る操作
            t.act(side, { type: "resolveChoice" })
        } else if (opts.length) {
            const pick = opts.find((o) => (answer === "yes" ? !declines(o) : declines(o))) ?? opts[0]!
            t.act(side, { type: "resolveChoice", option: pick })
        } else if (pc.candidates?.length) {
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates.find((c) => prefer.includes(c)) ?? pc.candidates[0]! })
        } else if (pc.cardIndices?.length) {
            t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices[0]! })
        } else {
            t.act(side, { type: "resolveChoice" })
        }
    }
}

// フラッシュの優先権を side に回す（相手がパスして返ってくる）
export function giveFlash(t: ScenarioCtx, side: Side): void {
    const want = side === "me" ? t.me : t.opp
    for (let n = 0; n < 4 && t.state.priorityPlayer !== want; n++) t.act(side === "me" ? "opp" : "me", { type: "pass" })
}
