// smoke パート459（「同名で1回」は発揮したときだけ消費する／同名2体が同時に誘発しても1回。ユーザー提供のルール 2026-10-01）
// 「既に発揮した」なら使用不可。同名の1枚目が払えず不発・確認を断ったなら発揮していないので、2枚目はまだ使える
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import { scenario } from "./scenario"
import type { ScenarioCtx } from "./scenario"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const BARRIER = "BS13-070"
const ARES = "BS10-008"

console.log("=== 前提: カードの機械確認 ===")
const attacker4 = ALL_CARDS.find((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 4)!
const brave = ALL_CARDS.find((c) => c.type === "brave" && c.effects.length <= 1)!
const coresAt = (id: string, lv: number) => getCard(id).levels.find((l) => l.level === lv)!.cores
assert(getCard(BARRIER).name === "星宿の障壁" && coresAt(BARRIER, 2) === 2, "BARRIERは星宿の障壁（Lv2 コア2）")
assert(getCard(ARES).name === "火星神龍アレス・ドラグーン" && coresAt(ARES, 2) === 3, "ARESはアレス・ドラグーン（Lv2 コア3）")
assert(brave !== undefined && attacker4.cost >= 4, `ブレイヴ=${brave.name} / アタッカー=${attacker4.name}`)

const barrierStart = (interactive: boolean) => ({
    turn: "opp" as const,
    interactive,
    me: { nexuses: [{ card: BARRIER, label: "障壁疲労", cores: 2, rested: true }, { card: BARRIER, label: "障壁回復", cores: 2 }] },
    opp: { spirits: [{ card: attacker4.cardId, label: "アタッカー" }] },
})
// 払えない方が疲労中のままなので、変化は「回復している方が疲労する」だけ。ライフは減って戻り、減ったライフのコアがリザーブへ
const barrierExpect = [
    "自分.障壁回復.疲労: false → true",
    "自分.リザーブ: 10 → 11",
    "相手.アタッカー.疲労: false → true",
]

console.log("=== A. 障壁2枚の片方が疲労中：払える方が発揮する（解決順によらない） ===")
scenario({
    name: "barrier-one-rested",
    start: barrierStart(false),
    steps(t) {
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        t.closeFlash()
        t.act("me", { type: "takeLife" })
    },
    expect: barrierExpect,
})

console.log("=== B. 同じ場面を対話式で：確認はすべて押す ===")
scenario({
    name: "barrier-one-rested-interactive",
    start: barrierStart(true),
    steps(t: ScenarioCtx) {
        let confirms = 0
        const drive = () => {
            while (t.state.pendingChoice) {
                const pc = t.state.pendingChoice
                const side = pc.pid === t.me ? "me" : "opp"
                if (pc.kind === "option" && (pc.options ?? []).includes("発動する")) {
                    confirms++
                    t.act(side, { type: "resolveChoice", option: "発動する" })
                } else {
                    t.act(side, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
                }
                assert(confirms <= 3, "確認が繰り返し出ている")
            }
        }
        t.act("opp", { type: "nextPhase" })
        t.act("opp", { type: "attack", instanceId: t.id("アタッカー") })
        drive()
        t.closeFlash()
        drive()
        if (t.state.battle && !t.state.pendingChoice) t.act("me", { type: "takeLife" })
        drive()
        // 疲労中の方は聞く前に払えないので確認が出ない（2026-10-02 改訂）。払える方の1回だけ。発揮済みなので2枚目は出ない
        assert(confirms === 1, `確認は払える方の1回だけ（実際 ${confirms} 回）`)
    },
    expect: barrierExpect,
})

console.log("=== C. アレス・ドラグーン2体（それぞれ合体・Lv2）：追加のアタックステップ／エンドステップは1回だけ ===")
{
    const s = createGame("ares-two", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    const p = s.players.p1
    p.field.spirits = []
    p.field.nexuses = []
    p.field.combinedBraves = []
    for (let i = 0; i < 2; i++) {
        const host = createInstance(ARES, s.turn - 1, 3)
        const b = createInstance(brave.cardId, s.turn - 1, 1)
        p.field.spirits.push(host)
        p.field.combinedBraves.push(b)
        host.braveRefs = [{ instanceId: b.instanceId } as any]
        b.braveCombined = true
    }
    refreshLevelAsOverrides(s)
    let guard = 0
    while (s.turnPlayer === "p1" && guard++ < 8) {
        while (s.pendingChoice) {
            const pc = s.pendingChoice
            const err = act(s, pc.pid, pc.kind === "option" ? { type: "resolveChoice", option: pc.options![0]! } : { type: "resolveChoice", instanceId: pc.candidates[0]! })
            assert(err === null, `選択に答えられる（${err}）`)
        }
        const err = act(s, "p1", { type: "endTurn" })
        assert(err === null, `endTurn が通る（${err}）`)
    }
    const extra = s.log.filter((l) => l.includes("アタックステップとエンドステップを、もう1回ずつ行う")).length
    assert(extra === 1, `追加のアタックステップ／エンドステップは1回だけ（実際 ${extra} 回）`)
    assert((s.turnPlayer as string) === "p2", "追加のあと相手のターンになる")
}

console.log("すべてのチェックに合格しました 🎉（part459）")
