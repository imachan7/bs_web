// smoke パート473（天使長セラフィー BS04-057：召喚時、リザーブのコアを好きなだけトラッシュに置いて天霊を無償召喚）
// 読み方は 2026-10-02 ユーザー確認。実装は見ずに効果文から期待値を書いている
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SERA = "BS04-057" // 天使長セラフィー（黄・コスト8・天霊）
const POWER = "BS10-048" // 天使パワー（黄・コスト5・天霊・効果なし）
const KUREIO = "BS05-037" // 天使クレイオ（黄・コスト2・天霊）
const VIERGE = "BS12-X05" // 戦神乙女ヴィエルジェ（黄・コスト6・天霊・召喚時：ライフ5以下ならライフ+1）
const ISFIEL = "BS07-X27" // 大天使イスフィール（黄・コスト7・天霊）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・地竜）

console.log("=== 前提: カードの機械確認 ===")
{
    const fam = (id: string) => getCard(id).family ?? []
    assert(getCard(SERA).name === "天使長セラフィー" && getCard(SERA).cost === 8 && getCard(SERA).type === "spirit", "SERAはコスト8のセラフィー")
    assert(getCard(POWER).name === "天使パワー" && getCard(POWER).cost === 5 && fam(POWER).includes("天霊"), "POWERはコスト5の天霊")
    assert(getCard(KUREIO).name === "天使クレイオ" && getCard(KUREIO).cost === 2 && fam(KUREIO).includes("天霊"), "KUREIOはコスト2の天霊")
    assert(getCard(VIERGE).name === "戦神乙女ヴィエルジェ" && getCard(VIERGE).cost === 6 && fam(VIERGE).includes("天霊"), "VIERGEはコスト6の天霊")
    assert(getCard(ISFIEL).name === "大天使イスフィール" && getCard(ISFIEL).cost === 7 && fam(ISFIEL).includes("天霊"), "ISFIELはコスト7の天霊")
    assert(getCard(ROKU).name === "ロクケラトプス" && !fam(ROKU).includes("天霊"), "ROKUは天霊ではない")
    for (const id of [SERA, POWER, KUREIO, VIERGE, ISFIEL, ROKU]) assert(getCard(id).levels[0]!.cores === 1, `${getCard(id).name}はLv1がコア1個`)
}

const bp1 = (id: string) => getCard(id).levels[0]!.bp
const nm = (id: string) => getCard(id).name

// 場に出る1体ぶんの変化（召喚直後・コア1個・回復状態・Lv1）。同名が2体になるなら「#2」を付けた名前を渡す
const appears = (label: string, id: string) => [
    `自分.${label}.場所: なし → フィールド`,
    `自分.${label}.疲労: なし → false`,
    `自分.${label}.コア: なし → 1`,
    `自分.${label}.Lv: なし → 1`,
    `自分.${label}.BP: なし → ${bp1(id)}`,
]

const RESERVE = 30

// セラフィーを手札の先頭から召喚する
function summonSera(t: ScenarioCtx) {
    t.act("me", { type: "summon", handIndex: 0 })
}

// 選択待ちに答える。確認は「発動する」を押す。
// 数の選択：選択肢の文字列から数字だけを取り出して count と一致するものを選ぶ。
// 召喚するカードの選択：candidates の中から、手札のカード名が picks の先頭に一致するものを選ぶ
interface Drive { confirms: number; log: string[] }
function drive(t: ScenarioCtx, count: number, picks: string[]): Drive {
    const out: Drive = { confirms: 0, log: [] }
    const queue = [...picks]
    let guard = 0
    while (t.state.pendingChoice) {
        if (guard++ > 20) throw new Error(`選択が終わらない: ${out.log.join(" / ")}`)
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        out.log.push(`${pc.kind}:${pc.prompt}:${JSON.stringify(pc.kind === "option" ? pc.options : (pc as unknown as { cardIndices?: number[] }).cardIndices)}`)
        if (pc.kind === "option") {
            const opts = pc.options ?? []
            if (opts.includes("発動する")) {
                out.confirms++
                t.act(side, { type: "resolveChoice", option: "発動する" })
                continue
            }
            const hit = opts.find((o) => o.replace(/\D/g, "") === String(count))
            if (hit === undefined) throw new Error(`数の選択肢に ${count} が無い: ${JSON.stringify(opts)}`)
            t.act(side, { type: "resolveChoice", option: hit })
        } else {
            const want = queue.shift()
            const hand = t.state.players[pc.pid].hand
            const idxs = (pc as unknown as { cardIndices?: number[] }).cardIndices ?? []
            const hit = want === undefined ? idxs[0] : idxs.find((i) => getCard(hand[i]!).name === want)
            if (hit === undefined) throw new Error(`カード選択に ${want} が無い: ${JSON.stringify(idxs)}`)
            t.act(side, { type: "resolveChoice", cardIndex: hit })
        }
    }
    return out
}

console.log("=== 1. 非対話：天霊2枚（コスト5と2）・リザーブ十分 → 2枚とも無償で召喚される ===")
scenario({
    name: "sera-two",
    start: { me: { reserve: RESERVE, hand: [SERA, POWER, KUREIO] } },
    steps: (t) => summonSera(t),
    // セラフィーのコスト8＋コア1、トラッシュに置く2、天霊2体に置く2 → リザーブ 30-8-1-2-2=17
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("天使パワー", POWER),
        ...appears("天使クレイオ", KUREIO),
        "自分.リザーブ: 30 → 17",
        "自分.トラッシュのコア: 0 → 10",
        `自分.手札: ${[nm(SERA), nm(POWER), nm(KUREIO)].sort().join("、")} → なし`,
    ],
})

console.log("=== 2. 非対話：コスト7の天霊は対象外（コスト6以下ではない） ===")
scenario({
    name: "sera-cost7",
    start: { me: { reserve: RESERVE, hand: [SERA, ISFIEL] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        "自分.リザーブ: 30 → 21",
        "自分.トラッシュのコア: 0 → 8",
        `自分.手札: ${[nm(SERA), nm(ISFIEL)].sort().join("、")} → ${nm(ISFIEL)}`,
    ],
})

console.log("=== 3. 非対話：天霊でない（ロクケラトプス）は対象外 ===")
scenario({
    name: "sera-nonfamily",
    start: { me: { reserve: RESERVE, hand: [SERA, ROKU] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        "自分.リザーブ: 30 → 21",
        "自分.トラッシュのコア: 0 → 8",
        `自分.手札: ${[nm(SERA), nm(ROKU)].sort().join("、")} → ${nm(ROKU)}`,
    ],
})

console.log("=== 4. 非対話：対象は手札のコスト6以下の天霊だけ。7と天霊でないものは手札に残る ===")
scenario({
    name: "sera-mixed",
    start: { me: { reserve: RESERVE, hand: [SERA, KUREIO, ISFIEL, ROKU] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("天使クレイオ", KUREIO),
        "自分.リザーブ: 30 → 19",
        "自分.トラッシュのコア: 0 → 9",
        `自分.手札: ${[nm(SERA), nm(KUREIO), nm(ISFIEL), nm(ROKU)].sort().join("、")} → ${[nm(ISFIEL), nm(ROKU)].sort().join("、")}`,
    ],
})

console.log("=== 5. 非対話：リザーブが足りず1枚しか召喚できない（コストの大きいパワーから） ===")
// リザーブ12：セラフィー召喚で コスト8＋コア1 → 3 残る。1枚ぶん＝置く1＋召喚先1＝2 は払えるが、2枚ぶん＝4 は払えない
scenario({
    name: "sera-short",
    start: { me: { reserve: 12, hand: [SERA, POWER, KUREIO] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("天使パワー", POWER),
        "自分.リザーブ: 12 → 1",
        "自分.トラッシュのコア: 0 → 9",
        `自分.手札: ${[nm(SERA), nm(POWER), nm(KUREIO)].sort().join("、")} → ${nm(KUREIO)}`,
    ],
})

console.log("=== 6. 非対話：手札に条件に合うカードが無い → 何も起きない ===")
scenario({
    name: "sera-nothing",
    start: { me: { reserve: RESERVE, hand: [SERA] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        "自分.リザーブ: 30 → 21",
        "自分.トラッシュのコア: 0 → 8",
        `自分.手札: ${nm(SERA)} → なし`,
    ],
})

console.log("=== 7. 相手の手札の天霊は対象にならない ===")
scenario({
    name: "sera-opp-hand",
    start: { me: { reserve: RESERVE, hand: [SERA] }, opp: { hand: [KUREIO] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        "自分.リザーブ: 30 → 21",
        "自分.トラッシュのコア: 0 → 8",
        `自分.手札: ${nm(SERA)} → なし`,
    ],
})

console.log("=== 8. 非対話：召喚された天霊の『召喚時』効果は発揮されない（ヴィエルジェ：ライフは増えない） ===")
scenario({
    name: "sera-no-onsummon",
    start: { me: { reserve: RESERVE, hand: [SERA, VIERGE] } },
    steps: (t) => summonSera(t),
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("戦神乙女ヴィエルジェ", VIERGE),
        "自分.リザーブ: 30 → 19",
        "自分.トラッシュのコア: 0 → 9",
        `自分.手札: ${[nm(SERA), nm(VIERGE)].sort().join("、")} → なし`,
    ],
})

console.log("=== 9. 対照：ヴィエルジェを普通に召喚すれば召喚時効果が出てライフが増える（上の8が「出ない」ことの裏づけ） ===")
scenario({
    name: "vierge-normal",
    start: { me: { reserve: RESERVE, hand: [VIERGE] } },
    steps: (t) => t.act("me", { type: "summon", handIndex: 0 }),
    expect: [
        ...appears("戦神乙女ヴィエルジェ", VIERGE),
        "自分.ライフ: 5 → 6",
        "自分.リザーブ: 30 → 23",
        "自分.トラッシュのコア: 0 → 6",
        `自分.手札: ${nm(VIERGE)} → なし`,
    ],
})

console.log("=== 10. 対話：置くコアを1個にして、2枚のうち1枚（クレイオ）を選ぶ。確認は1回 ===")
scenario({
    name: "sera-interactive-one",
    start: { interactive: true, me: { reserve: RESERVE, hand: [SERA, POWER, KUREIO] } },
    steps: (t) => {
        summonSera(t)
        const d = drive(t, 1, [nm(KUREIO)])
        assert(d.confirms === 1, `確認は1回（実際 ${d.confirms} 回: ${d.log.join(" / ")}）`)
    },
    // 8+1 + 置く1 + 召喚先1 = 11 → 19
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("天使クレイオ", KUREIO),
        "自分.リザーブ: 30 → 19",
        "自分.トラッシュのコア: 0 → 9",
        `自分.手札: ${[nm(SERA), nm(POWER), nm(KUREIO)].sort().join("、")} → ${nm(POWER)}`,
    ],
})

console.log("=== 11. 対話：置くコアを2個にして、1枚ずつ2枚選ぶ。確認は1回 ===")
scenario({
    name: "sera-interactive-two",
    start: { interactive: true, me: { reserve: RESERVE, hand: [SERA, POWER, KUREIO] } },
    steps: (t) => {
        summonSera(t)
        const d = drive(t, 2, [nm(POWER), nm(KUREIO)])
        assert(d.confirms === 1, `確認は1回（実際 ${d.confirms} 回: ${d.log.join(" / ")}）`)
    },
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("天使パワー", POWER),
        ...appears("天使クレイオ", KUREIO),
        "自分.リザーブ: 30 → 17",
        "自分.トラッシュのコア: 0 → 10",
        `自分.手札: ${[nm(SERA), nm(POWER), nm(KUREIO)].sort().join("、")} → なし`,
    ],
})

console.log("=== 12. 対話：0個を選ぶ（断る）→ 何も召喚されず、トラッシュにも置かれない ===")
scenario({
    name: "sera-interactive-zero",
    start: { interactive: true, me: { reserve: RESERVE, hand: [SERA, POWER, KUREIO] } },
    steps: (t) => {
        summonSera(t)
        drive(t, 0, [])
    },
    expect: [
        ...appears("天使長セラフィー", SERA),
        "自分.リザーブ: 30 → 21",
        "自分.トラッシュのコア: 0 → 8",
        `自分.手札: ${[nm(SERA), nm(POWER), nm(KUREIO)].sort().join("、")} → ${[nm(POWER), nm(KUREIO)].sort().join("、")}`,
    ],
})

console.log("=== 13. 対話：手札に条件に合う天霊が無い → 確認も選択も出ない ===")
scenario({
    name: "sera-interactive-none",
    start: { interactive: true, me: { reserve: RESERVE, hand: [SERA, ISFIEL, ROKU] } },
    steps: (t) => {
        summonSera(t)
        assert(t.state.pendingChoice === null, "確認も選択待ちも出ない")
    },
    expect: [
        ...appears("天使長セラフィー", SERA),
        "自分.リザーブ: 30 → 21",
        "自分.トラッシュのコア: 0 → 8",
        `自分.手札: ${[nm(SERA), nm(ISFIEL), nm(ROKU)].sort().join("、")} → ${[nm(ISFIEL), nm(ROKU)].sort().join("、")}`,
    ],
})

console.log("=== 14. 対話：リザーブが足りない → 置ける上限まで。上限を超える数は選べない ===")
// リザーブ12：セラフィー後に3。1個置いて1体召喚（計2）まで。2個は払えない
scenario({
    name: "sera-interactive-limit",
    start: { interactive: true, me: { reserve: 12, hand: [SERA, POWER, KUREIO] } },
    steps: (t) => {
        summonSera(t)
        const pc = t.state.pendingChoice
        assert(pc !== null, "確認が出る")
        t.act("me", { type: "resolveChoice", option: "発動する" })
        const pc2 = t.state.pendingChoice
        const opts = pc2 !== null && pc2.kind === "option" ? (pc2.options ?? []) : []
        assert(opts.length > 0, "置く数の選択が出る")
        const nums = opts.map((o) => o.replace(/\D/g, ""))
        assert(nums.includes("1") && !nums.includes("2"), `選べる数は1まで（実際 ${JSON.stringify(opts)}）`)
        drive(t, 1, [nm(POWER)])
    },
    expect: [
        ...appears("天使長セラフィー", SERA),
        ...appears("天使パワー", POWER),
        "自分.リザーブ: 12 → 1",
        "自分.トラッシュのコア: 0 → 9",
        `自分.手札: ${[nm(SERA), nm(POWER), nm(KUREIO)].sort().join("、")} → ${nm(KUREIO)}`,
    ],
})

console.log("すべてのチェックに合格しました 🎉（part473）")
