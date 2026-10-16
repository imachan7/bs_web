// smoke パート465（「〜することで」の節：BS15-023 タケノ・サイガー Lv2 エンドステップ／BS15-048 釣り仙人ジゴロウ スタートステップ）
// 効果文だけから書いた期待値役のテスト。実装に合わせて期待値を変えないこと
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SAIGER = "BS15-023" // タケノ・サイガー（緑・コスト4・遊精。Lv1･Lv2【暴風：1】）
const GIGOROU = "BS15-048" // 釣り仙人ジゴロウ（青・コスト3・創手）
const HUMPHREY = "BS06-066" // 力自慢のハンフリー（青・コスト3。【粉砕】：デッキを上から自身のLvと同じ枚数破棄）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SAIGER).name === "タケノ・サイガー" && getCard(SAIGER).type === "spirit", "SAIGERはタケノ・サイガー")
    assert(getCard(GIGOROU).name === "釣り仙人ジゴロウ" && getCard(GIGOROU).type === "spirit", "GIGOROUは釣り仙人ジゴロウ")
    assert(getCard(HUMPHREY).name === "力自慢のハンフリー" && getCard(HUMPHREY).type === "spirit", "HUMPHREYは力自慢のハンフリー")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effects.length === 0, "VANILLAは効果なし")
    assert(getCard(SAIGER).levels.find((l) => l.level === 2)?.cores === 3, "サイガーはコア3個でLv2")
    assert(getCard(GIGOROU).levels.find((l) => l.level === 2)?.cores === 3, "ジゴロウはコア3個でLv2")
    assert(getCard(HUMPHREY).levels.find((l) => l.level === 1)?.cores === 1, "ハンフリーはコア1個でLv1")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && (pc.options ?? []).includes("発動する")
}

function drive(t: ScenarioCtx, answers: boolean[] = []): number {
    let confirms = 0
    let guard = 0
    while (t.state.pendingChoice) {
        if (++guard > 20) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            const yes = answers[confirms] ?? true
            confirms++
            t.act(side, yes ? { type: "resolveChoice", option: "発動する" } : { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            t.act(side, { type: "resolveChoice", option: pc.options![0]! })
        } else {
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
    }
    return confirms
}

// ============================================================
// BS15-023 タケノ・サイガー Lv2『自分のエンドステップ』
//   このスピリットのコア1個を自分のトラッシュに置くことで、【暴風】を持つ自分のスピリット1体を回復させる。
//   （場の【暴風】持ちはサイガー自身だけ。ターンを終えて相手のターンの頭まで進める）
// ============================================================
// 自分がターンを終えて、相手のスタート〜ドローまで進んだ分
const turnPass = [
    "相手.手札: なし → ロクケラトプス",
    "相手.デッキ枚数: 40 → 39",
    "相手.リザーブ: 10 → 11",
]
const saigerMe = (cores: number, rested: boolean, extra: { card: string; label: string; cores: number; rested: boolean }[] = []) => ({
    spirits: [{ card: SAIGER, cores, rested }, ...extra],
})
const endTurn = (t: ScenarioCtx, answers: boolean[] = []) => {
    t.act("me", { type: "endTurn" })
    return drive(t, answers)
}

console.log("=== K1. 非対話・Lv2：コア1個がトラッシュへ。疲労していたサイガー自身が回復する ===")
scenario({
    name: "saiger-pay",
    start: { turn: "me", me: saigerMe(4, true) },
    steps: (t) => void endTurn(t),
    expect: [...turnPass, "自分.タケノ・サイガー.疲労: true → false", "自分.タケノ・サイガー.コア: 4 → 3", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== K2. 非対話・コア3個（払うとLv1に下がる）：払った後にLv1でも効果は発揮される（Q3576） ===")
scenario({
    name: "saiger-last-lv",
    start: { turn: "me", me: saigerMe(3, true) },
    steps: (t) => void endTurn(t),
    expect: [...turnPass, "自分.タケノ・サイガー.疲労: true → false", "自分.タケノ・サイガー.コア: 3 → 2", "自分.タケノ・サイガー.Lv: 2 → 1", "自分.タケノ・サイガー.BP: 6000 → 3000", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== K3. 非対話・回復させる対象がいない（サイガーは疲労していない）：コアは払わない ===")
scenario({
    name: "saiger-nothing-to-recover",
    start: { turn: "me", me: saigerMe(4, false) },
    steps: (t) => void endTurn(t),
    expect: [...turnPass],
})

console.log("=== K4. 非対話・疲労しているのは【暴風】を持たないスピリットだけ：対象にならず、コアも払わない ===")
scenario({
    name: "saiger-not-storm",
    start: { turn: "me", me: saigerMe(4, false, [{ card: VANILLA, label: "バニラ", cores: 1, rested: true }]) },
    steps: (t) => void endTurn(t),
    expect: [...turnPass],
})

console.log("=== K5. 非対話・Lv1（コア2個）：この節はLv2限定なので何も起きない ===")
scenario({
    name: "saiger-lv1",
    start: { turn: "me", me: saigerMe(2, true) },
    steps: (t) => void endTurn(t),
    expect: [...turnPass],
})

console.log("=== K6. 対話：確認1回→押す→サイガーが回復しコアが1個トラッシュへ ===")
scenario({
    name: "saiger-interactive",
    start: { turn: "me", interactive: true, me: saigerMe(4, true) },
    steps: (t) => {
        const n = endTurn(t, [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...turnPass, "自分.タケノ・サイガー.疲労: true → false", "自分.タケノ・サイガー.コア: 4 → 3", "自分.トラッシュのコア: 0 → 1"],
})

console.log("=== K7. 対話：断ると回復せず、コアも払わない ===")
scenario({
    name: "saiger-decline",
    start: { turn: "me", interactive: true, me: saigerMe(4, true) },
    steps: (t) => {
        const n = endTurn(t, [false])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...turnPass],
})

console.log("=== K8. 対話・回復させる対象がいない：確認は出ず、コアも払わない ===")
scenario({
    name: "saiger-interactive-nothing",
    start: { turn: "me", interactive: true, me: saigerMe(4, false) },
    steps: (t) => {
        const n = endTurn(t, [true])
        assert(n === 0, `確認は出ない（実際 ${n} 回）`)
    },
    expect: [...turnPass],
})

// ============================================================
// BS15-048 釣り仙人ジゴロウ Lv1･Lv2『自分のスタートステップ』
//   このスピリットのコア1個を自分のトラッシュに置くことで、このターンの間、自分のスピリットの【粉砕】/【大粉砕】で破棄するカードを+1枚する。
//   （自分のハンフリー Lv1【粉砕】は通常、相手のデッキを上から1枚破棄する。相手のターン終了→自分のスタートステップ）
// ============================================================
// 相手がターンを終えて、自分のスタート〜ドローまで進んだ分
// （リザーブの増減は場面ごとに書く：コアステップで+1、リフレッシュステップでトラッシュのコアがリザーブへ戻る分が加わる）
const myTurnPass = [
    "自分.手札: なし → ロクケラトプス",
    "自分.デッキ枚数: 40 → 39",
]
const gigMe = (cores: number) => ({ spirits: [{ card: GIGOROU, cores }, { card: HUMPHREY, cores: 1 }] })
const smashTurn = (t: ScenarioCtx, answers: boolean[] = []): number => {
    t.act("opp", { type: "endTurn" })
    let n = drive(t, answers)
    t.act("me", { type: "nextPhase" })
    t.act("me", { type: "attack", instanceId: t.id("力自慢のハンフリー") })
    n += drive(t, answers)
    if (t.state.battle) {
        t.closeFlash()
        n += drive(t, answers)
        if (t.state.battle && !t.state.pendingChoice) t.act("opp", { type: "takeLife" })
        n += drive(t, answers)
    }
    return n
}
// ハンフリーのアタックで相手のライフが1減り（コアはリザーブへ）、粉砕で相手のデッキが破棄される
const smash = (discarded: number) => [
    "相手.ライフ: 5 → 4",
    "相手.リザーブ: 10 → 11",
    "自分.力自慢のハンフリー.疲労: false → true",
    `相手.デッキ枚数: 40 → ${40 - discarded}`,
    `相手.トラッシュ: なし → ${Array.from({ length: discarded }, () => "ロクケラトプス").join("、")}`,
]

console.log("=== G1. 非対話・Lv2：コア1個がトラッシュへ。粉砕で破棄されるのは1+1=2枚 ===")
scenario({
    name: "gigorou-pay",
    start: { turn: "opp", me: gigMe(4) },
    steps: (t) => void smashTurn(t),
    expect: [...myTurnPass, ...smash(2), "自分.釣り仙人ジゴロウ.コア: 4 → 3", "自分.リザーブ: 10 → 12"],
})

console.log("=== G2. 非対話・Lv1（コア1個）：最後のコアを払ってジゴロウが場を離れても、効果は発揮される（Q3576）。破棄は2枚 ===")
scenario({
    name: "gigorou-last-core",
    start: { turn: "opp", me: gigMe(1) },
    steps: (t) => void smashTurn(t),
    expect: [...myTurnPass, ...smash(2), "自分.釣り仙人ジゴロウ.場所: フィールド → なし", "自分.トラッシュ: なし → 釣り仙人ジゴロウ", "自分.リザーブ: 10 → 12"],
})

console.log("=== G3. 対話：確認1回→押す→破棄は2枚 ===")
scenario({
    name: "gigorou-interactive",
    start: { turn: "opp", interactive: true, me: gigMe(4) },
    steps: (t) => {
        const n = smashTurn(t, [true])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...myTurnPass, ...smash(2), "自分.釣り仙人ジゴロウ.コア: 4 → 3", "自分.リザーブ: 10 → 12"],
})

console.log("=== G4. 対話：断るとコアは払わず、破棄は通常の1枚 ===")
scenario({
    name: "gigorou-decline",
    start: { turn: "opp", interactive: true, me: gigMe(4) },
    steps: (t) => {
        const n = smashTurn(t, [false])
        assert(n === 1, `確認は1回（実際 ${n} 回）`)
    },
    expect: [...myTurnPass, ...smash(1), "自分.リザーブ: 10 → 11"],
})

console.log("=== G5. 非対話・ジゴロウがいない（比較用）：破棄は通常の1枚 ===")
scenario({
    name: "gigorou-absent",
    start: { turn: "opp", me: { spirits: [{ card: HUMPHREY, cores: 1 }] } },
    steps: (t) => void smashTurn(t),
    expect: [...myTurnPass, ...smash(1), "自分.リザーブ: 10 → 11"],
})

console.log("すべてのチェックに合格しました 🎉（part465）")
