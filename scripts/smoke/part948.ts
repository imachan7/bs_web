// smoke パート948（ネクサスの破壊で誘発する効果は1つの列に並び、「残す／戻す」が先に解決したら残りは発揮しない。#553。TIMING_CHART §1.5）
import { assert, getCard } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"

const CITADEL = "SD16-008" // 鉄壁なる巨人城塞（青ネクサス。自分のネクサスが破壊されたとき、疲労させて青のネクサスを残す）
const TOWER = "SD02-014" // 魔法監視塔（青ネクサス。コア1個で破壊されたネクサスをフィールドに戻す）
const SAIL = "BS12-071" // 未完成の古代戦艦：帆（青ネクサス）
const SHARK = "BS03-082" // シャークハンマー（青。自分のネクサスが破壊されたとき回復する）
const ARCHEO = "BS02-009" // 竜狩りのアーケオルニ（赤。Lv2 ネクサスが破壊されたとき1枚ドロー）
const JAVELIN = "BS06-091" // バスタージャベリン（赤マジック。ネクサス1つを破壊する。破壊したとき1枚ドロー）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(CITADEL).name === "鉄壁なる巨人城塞" && c(CITADEL).type === "nexus" && c(CITADEL).effect.includes("疲労状態でフィールドに残す"), "CITADELは鉄壁なる巨人城塞")
    assert(c(TOWER).name === "魔法監視塔" && c(TOWER).type === "nexus" && c(TOWER).effect.includes("自分のフィールドに戻す"), "TOWERは魔法監視塔")
    assert(c(SAIL).name === "未完成の古代戦艦：帆" && c(SAIL).type === "nexus" && c(SAIL).colors.join() === "blue", "SAILは青ネクサス")
    assert(c(SHARK).name === "シャークハンマー" && c(SHARK).effect.includes("自分のネクサスが破壊されたとき回復する"), "SHARKはシャークハンマー")
    assert(c(ARCHEO).name === "竜狩りのアーケオルニ" && c(ARCHEO).levels?.[1]?.cores === 3 && c(ARCHEO).effect.includes("ネクサスが破壊されたとき"), "ARCHEOは竜狩りのアーケオルニ（Lv2はコア3）")
    assert(c(JAVELIN).name === "バスタージャベリン" && c(JAVELIN).type === "magic" && c(JAVELIN).effect.includes("ネクサス"), "JAVELINはバスタージャベリン")
}

// 選択待ちを答える。順番の質問は order の先頭から、まだ選択肢に残っているものを選ぶ。確認は「はい」側
function answer(t: ScenarioCtx, order: string[], seen: string[][]): void {
    for (let i = 0; i < 20 && t.state.pendingChoice; i++) {
        const pc = t.state.pendingChoice
        const side = pc.pid === t.me ? "me" : "opp"
        if (pc.kind === "target") {
            t.act(side, { type: "resolveChoice", instanceId: pc.candidates.includes(t.id("帆")) ? t.id("帆") : pc.candidates[0]! })
        } else if (pc.kind === "option") {
            const opts = pc.options!
            seen.push(opts)
            const key = order.find((k) => opts.some((o) => o.includes(k)))
            t.act(side, { type: "resolveChoice", option: opts.find((o) => key !== undefined && o.includes(key)) ?? opts[0]! })
        } else t.act(side, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
    }
}

const start = (saver: string) => ({
    turn: "opp" as const, phase: "main" as const, interactive: true,
    me: {
        nexuses: [{ card: saver, label: "守り", cores: 0 }, { card: SAIL, label: "帆", cores: 0 }],
        spirits: [{ card: SHARK, label: "シャーク", cores: 1, rested: true }],
    },
    opp: { hand: [JAVELIN], spirits: [{ card: ARCHEO, label: "アーケオルニ", cores: 3 }] },
})

// 「残す」を先に解決：破壊は無かったことになり、同じ列の「破壊されたとき」は発揮しない
scenario({
    name: "nexus-queue-stay-first",
    start: start(CITADEL),
    steps(t) {
        const seen: string[][] = []
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        answer(t, ["フィールドに残す", "疲労させて残す"], seen)
        const first = seen.find((o) => o.length >= 3) ?? []
        assert(first.some((o) => o.includes("アーケオルニ")) && first.some((o) => o.includes("シャークハンマー")) && first.some((o) => o.includes("フィールドに残す")), "ターンプレイヤーに、両陣営の誘発と「残す」を1つの列として順番を聞く")
        assert(t.state.pendingChoice === null, "選択待ちが残らない")
    },
    expect: [
        "相手.手札: バスタージャベリン → なし", // アーケオルニもジャベリンもドローしない
        "相手.リザーブ: 10 → 8", // アーケオルニの赤シンボルで軽減1
        "相手.トラッシュのコア: 0 → 2",
        "相手.トラッシュ: なし → バスタージャベリン",
        "自分.守り.疲労: false → true",
        "自分.帆.疲労: false → true",
        // シャークは疲労のまま
    ],
})

// 「破壊されたとき」を先に解決：発揮してから、最後に「残す」で残れる
scenario({
    name: "nexus-queue-stay-last",
    start: start(CITADEL),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        answer(t, ["アーケオルニ", "シャークハンマー", "フィールドに残す", "疲労させて残す"], [])
    },
    expect: [
        "相手.手札: バスタージャベリン → ロクケラトプス", // アーケオルニのドローだけ（残ったのでジャベリンのドローは無い）
        "相手.デッキ枚数: 40 → 39",
        "相手.リザーブ: 10 → 8", // アーケオルニの赤シンボルで軽減1
        "相手.トラッシュのコア: 0 → 2",
        "相手.トラッシュ: なし → バスタージャベリン",
        "自分.シャーク.疲労: true → false",
        "自分.守り.疲労: false → true",
        "自分.帆.疲労: false → true",
    ],
})

// 「フィールドに戻す」を先に解決：破壊待機の解除なので、残りも、破壊した側の「破壊したとき」も発揮しない
scenario({
    name: "nexus-queue-return-first",
    start: start(TOWER),
    steps(t) {
        t.act("opp", { type: "castMagic", handIndex: 0, timing: "main" })
        answer(t, ["魔法監視塔", "はい", "発動"], [])
        assert(t.state.pendingChoice === null, "選択待ちが残らない")
    },
    expect: [
        "相手.手札: バスタージャベリン → なし",
        "相手.リザーブ: 10 → 8", // アーケオルニの赤シンボルで軽減1
        "相手.トラッシュのコア: 0 → 2",
        "相手.トラッシュ: なし → バスタージャベリン",
        "自分.リザーブ: 10 → 9", // 戻すコスト
        "自分.トラッシュのコア: 0 → 1",
    ],
})

console.log("すべてのチェックに合格しました 🎉（part948）")
