// smoke パート470（「〜することで」を聞く前に発動できないなら、確認を出さず理由をログに残す。ユーザー確認 2026-10-02）
// 規則：①聞く前に払えない／解決できないなら「発動しますか？」を出さない ②ログに「発生源のカード名」「発動しなかった」「理由のキーワード」を含む行が1行増える
//       ③盤面は何も変わらない（part456〜468 の「払えない」場面と同じ期待値）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const SATELLITE = "BS13-068" // 遥かなる衛星砲（ネクサス）
const TSURI = "BS16-063" // 釣魂台（ネクサス）
const SAIGER = "BS15-023" // タケノ・サイガー
const USHI = "BS14-X03" // 風の覇王ドルクス・ウシワカ
const PAO = "BS07-042" // パオ・ペイール
const BLADE = "BS14-092" // 烈光閃刃（バースト）
const MARNI = "BS14-043" // 月光姫マーニ
const BEAST = "BS14-050" // エアレイ（黄・効果なし・想獣）
const BIG = "BS01-031" // デス・ハーデス（紫・効果なし）
const VANILLA = "BS01-002"
const PYTHON = "BS01-034" // バイ・パイソン（紫。アタック時にデッキから1枚ドロー）

console.log("=== 前提: カードの機械確認 ===")
{
    const nameOf: [string, string][] = [
        [SATELLITE, "遥かなる衛星砲"], [TSURI, "釣魂台"], [SAIGER, "タケノ・サイガー"], [USHI, "風の覇王ドルクス・ウシワカ"],
        [PAO, "パオ・ペイール"], [BLADE, "烈光閃刃"], [MARNI, "月光姫マーニ"], [BEAST, "エアレイ"], [BIG, "デス・ハーデス"], [VANILLA, "ロクケラトプス"], [PYTHON, "バイ・パイソン"],
    ]
    for (const [id, name] of nameOf) assert(getCard(id).name === name, `${id}は${name}`)
    assert(getCard(VANILLA).effects.length === 0 && getCard(BEAST).effects.length === 0, "VANILLAとBEASTは効果なし")
}

const isConfirm = (t: ScenarioCtx) => {
    const pc = t.state.pendingChoice
    return pc !== null && pc.kind === "option" && ((pc.options ?? []).includes("発動する") || (pc.options ?? []).includes("復活させる"))
}

// 選択待ちを答え切る。払うかの確認（バースト自体の発動確認は数えない）の回数を返す。バーストの発動確認は押す
function drive(t: ScenarioCtx): number {
    let confirms = 0
    for (let i = 0; t.state.pendingChoice; i++) {
        if (i > 12) throw new Error("選択待ちが終わらない")
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (isConfirm(t)) {
            if (!pc.prompt.includes("バーストを発動")) confirms++
            t.act(side, { type: "resolveChoice", option: (pc.options ?? []).includes("発動する") ? "発動する" : "復活させる" })
        } else {
            t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
        }
    }
    return confirms
}

// steps の前後でログの増えた行を取り、発生源のカード名と「発動しなかった」を含む行がちょうど1行で、理由のキーワードのどれかを含むことを見る
function skipLogOf(t: ScenarioCtx, before: number, source: string, keywords: string[]): void {
    const added = t.state.log.slice(before)
    const hits = added.filter((l) => l.includes(source) && l.includes("発動しなかった"))
    assert(hits.length === 1, `「${source}」の「発動しなかった」行がちょうど1行増える（実際 ${hits.length} 行）`)
    const line = hits[0] ?? ""
    assert(keywords.some((k) => line.includes(k)), `理由のキーワード（${keywords.join("／")}）を含む（実際「${line}」）`)
}

const oppTurnStart = ["相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39", "相手.リザーブ: 10 → 11"]

console.log("=== 1. 衛星砲・対話：疲労済み（コストが疲労）。確認0回・ログに「疲労」 ===")
scenario({
    name: "log-sat-rested",
    start: { turn: "opp", interactive: true, me: { nexuses: [{ card: SATELLITE, cores: 1, rested: true }] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        let n = drive(t)
        t.closeFlash()
        n += drive(t)
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        n += drive(t)
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        skipLogOf(t, before, "遥かなる衛星砲", ["疲労"])
    },
    expect: ["相手.ロクケラトプス.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11"],
})

console.log("=== 2. 釣魂台・対話：手札に無魔のスピリットがない（コストが手札の破棄）。確認0回・ログに「手札」 ===")
scenario({
    name: "log-tsuri-nohand",
    start: { interactive: true, me: { nexuses: [{ card: TSURI, cores: 1 }], hand: [VANILLA] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("me", { type: "nextPhase" })
        t.act("me", { type: "endTurn" })
        const n = drive(t)
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        skipLogOf(t, before, "釣魂台", ["手札"])
    },
    expect: [...oppTurnStart],
})

console.log("=== 3. サイガー・対話：回復させる【暴風】のスピリットがいない（解決できない）。確認0回・ログに「回復」 ===")
scenario({
    name: "log-saiger-nothing",
    start: { turn: "me", interactive: true, me: { spirits: [{ card: SAIGER, cores: 4 }] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("me", { type: "endTurn" })
        const n = drive(t)
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        skipLogOf(t, before, "タケノ・サイガー", ["回復"])
    },
    expect: [...oppTurnStart],
})

console.log("=== 4. ウシワカ・対話：他に自分のスピリットがいない（手札に戻すコストは払えるが、BP+の対象がいない）。確認0回・ログに理由 ===")
scenario({
    name: "log-ushi-alone",
    start: { turn: "me", phase: "attack", interactive: true, me: { spirits: [{ card: USHI, cores: 1 }] }, opp: { spirits: [{ card: VANILLA, label: "壁" }] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("me", { type: "attack", instanceId: t.id("風の覇王ドルクス・ウシワカ") })
        let n = drive(t)
        t.closeFlash()
        n += drive(t)
        t.act("opp", { type: "block", instanceId: t.id("壁") })
        n += drive(t)
        for (let i = 0; i < 6 && t.state.battle; i++) {
            t.closeFlash()
            n += drive(t)
        }
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        // 理由の言い方は実装が決める。手札に戻すコスト側か、BP+の対象側のどちらの言葉でもよい
        skipLogOf(t, before, "風の覇王ドルクス・ウシワカ", ["手札", "スピリット", "BP", "対象"])
    },
    expect: [
        "自分.風の覇王ドルクス・ウシワカ.疲労: false → true",
        "相手.壁.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 5. パオ・ペイール・対話：想獣が疲労済み（フィールドに残るのコストが疲労）。確認0回・ログに「疲労」 ===")
scenario({
    name: "log-pao-rested",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: PAO }, { card: BEAST, rested: true }] }, opp: { spirits: [{ card: BIG, cores: 4 }] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("デス・ハーデス") })
        let n = drive(t)
        t.closeFlash()
        t.act("me", { type: "block", instanceId: t.id("パオ・ペイール") })
        n += drive(t)
        t.closeFlash()
        n += drive(t)
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        skipLogOf(t, before, "パオ・ペイール", ["疲労"])
    },
    expect: [
        "自分.パオ・ペイール.場所: フィールド → なし",
        "自分.トラッシュ: なし → パオ・ペイール",
        "自分.リザーブ: 10 → 11",
        "相手.デス・ハーデス.疲労: false → true",
    ],
})

console.log("=== 6. 烈光閃刃・対話：リザーブ0（バースト後のコストがコア不足）。払う確認0回・ログに「コア」 ===")
scenario({
    name: "log-blade-noreserve",
    start: { turn: "opp", interactive: true, me: { reserve: 0, burst: BLADE, trash: [VANILLA] }, opp: { spirits: [{ card: VANILLA }] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("ロクケラトプス") })
        let n = drive(t)
        if (t.state.battle) {
            t.closeFlash()
            n += drive(t)
            if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
            n += drive(t)
        }
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        skipLogOf(t, before, "烈光閃刃", ["コア"])
    },
    expect: [
        "自分.ライフ: 5 → 4",
        "自分.リザーブ: 0 → 1",
        "自分.バースト: 烈光閃刃 → なし",
        "自分.トラッシュ: ロクケラトプス → ロクケラトプス、烈光閃刃",
        "相手.ロクケラトプス.場所: フィールド → なし",
        "相手.トラッシュ: なし → ロクケラトプス",
        "相手.リザーブ: 10 → 11",
    ],
})

console.log("=== 7. マーニ・対話：すでに疲労（コストが疲労）。確認0回・ログに「疲労」 ===")
scenario({
    name: "log-marni-rested",
    start: { turn: "opp", interactive: true, me: { spirits: [{ card: MARNI, cores: 2, rested: true }] }, opp: { spirits: [{ card: PYTHON, label: "P" }] } },
    steps: (t) => {
        const before = t.state.log.length
        t.act("opp", { type: "nextPhase" })
        let n = drive(t)
        t.act("opp", { type: "attack", instanceId: t.id("P") })
        n += drive(t)
        if (t.state.battle) {
            t.closeFlash()
            n += drive(t)
            if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
            n += drive(t)
        }
        assert(n === 0, `払う確認は出ない（実際 ${n} 回）`)
        skipLogOf(t, before, "月光姫マーニ", ["疲労"])
    },
    expect: ["相手.P.疲労: false → true", "自分.ライフ: 5 → 4", "自分.リザーブ: 10 → 11", "相手.手札: なし → ロクケラトプス", "相手.デッキ枚数: 40 → 39"],
})

console.log("すべてのチェックに合格しました 🎉（part470）")
