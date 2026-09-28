// 効果文の表示用の補足。カードデータ（印刷どおりの文面）は書き換えず、画面に出すときだけ補う

export type EffectSegment = { text: string; note?: true }

const BURST_HEAD = /^【バースト/
const NEXT_BLOCK = /^(Lv[1-5]|フラッシュ|メイン|【)/
const SUMMON_OR_DEPLOY = /(召喚|配置)する/g

// バースト効果の「召喚する／配置する」は、「コストを支払わずに」と書かれていなくても無償
// （ブロックアイコン《1》までのカード。いま実装しているカードはすべて該当。docs/design/BURST.md。2026-09-28 ユーザー確認）
export function effectLineSegments(effect: string): EffectSegment[][] {
    let inBurst = false
    return effect.split("\n").map((line) => {
        if (BURST_HEAD.test(line)) {
            inBurst = true
            return [{ text: line }]
        }
        if (NEXT_BLOCK.test(line)) inBurst = false
        if (!inBurst || line.includes("コストを支払わずに")) return [{ text: line }]
        const out: EffectSegment[] = []
        let last = 0
        for (const m of line.matchAll(SUMMON_OR_DEPLOY)) {
            out.push({ text: line.slice(last, m.index) }, { text: "コストを支払わずに", note: true })
            last = m.index
        }
        out.push({ text: line.slice(last) })
        return out.filter((s) => s.text !== "")
    })
}
