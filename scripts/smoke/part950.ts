// smoke パート950（BP比べの勝敗の誘発は敗者の破壊待機の列で解決し、敗者が破壊待機でなくなったら発揮しない。#554。TIMING_CHART §2）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const WHEEL = "BS19-091" // 天翼の大観覧車（Lv2『自分のアタックステップ』天霊がBPを比べ相手のスピリットだけに破壊されたとき、ボイドからコア1個をライフに）
const HILL = "BS04-084" // 奇跡の丘（Lv2『自分のアタックステップ』バトルで破壊された天霊は手札に戻る）
const ANGEL = "BS10-048" // 天使パワー（黄・天霊・BP3000・バニラ）
const DUALDO = "BS10-007" // デュアルド（赤・BP5000・バニラ）
const EIRIK = "BS17-034" // レッド・エイリーク（【合体時】Lv2･Lv3：BPを比べ相手のスピリットだけを破壊したとき、破壊したスピリットをデッキの上に戻せる）
const WALL = "BS14-101" // 仁王壁（バースト：相手による自分のスピリット破壊後）

console.log("=== 前提: カードの機械確認 ===")
{
    const c = getCard
    assert(c(WHEEL).name === "天翼の大観覧車" && c(WHEEL).effect.includes("BPを比べ相手のスピリットだけに破壊されたとき"), "WHEELは天翼の大観覧車")
    assert(c(HILL).name === "奇跡の丘" && c(HILL).type === "nexus", "HILLは奇跡の丘")
    assert(c(ANGEL).name === "天使パワー" && c(ANGEL).family.includes("天霊") && c(ANGEL).levels?.[0]?.bp === 3000 && c(ANGEL).effects.length === 0, "ANGELは天霊のバニラ BP3000")
    assert(c(DUALDO).name === "デュアルド" && c(DUALDO).levels?.[0]?.bp === 5000 && c(DUALDO).effects.length === 0, "DUALDOはバニラ BP5000")
    assert(c(EIRIK).name === "レッド・エイリーク" && c(EIRIK).effect.includes("破壊したスピリット1体をデッキの上に戻すことができる"), "EIRIKはレッド・エイリーク")
    assert(c(WALL).name === "仁王壁", "WALLは仁王壁")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.interactiveTargets = true
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => DUALDO)
    s.players.p2.deck = Array.from({ length: 40 }, () => DUALDO)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number, zone: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field[zone].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// p1 が attacker でアタックし、p2 が blocker でブロックする。選択待ちは order の語を含む選択肢を先頭から優先して答える
function battle(s: GameState, attackerId: string, blockerId: string, order: string[]): string[][] {
    const seen: string[][] = []
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1 がアタック")
    const drive = (): void => {
        for (let i = 0; i < 30; i++) {
            const pc = s.pendingChoice
            if (pc) {
                const opts = pc.options ?? []
                seen.push(opts)
                const key = order.find((k) => opts.some((o) => o.includes(k)))
                if (pc.kind === "option") act(s, pc.pid, { type: "resolveChoice", option: opts.find((o) => key !== undefined && o.includes(key)) ?? opts[0]! })
                else act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
            } else if (s.isFlashTiming && s.battle && !s.winner) {
                if (act(s, s.priorityPlayer, { type: "pass" })) return
            } else return
        }
    }
    drive()
    assert(declareBlock(s, "p2", blockerId) === null, "p2 がブロック")
    drive()
    return seen
}

console.log("=== 1. 天翼の大観覧車：「手札に戻る」を先に解決したら発揮しない／先に解決すれば発揮する ===")
for (const wheelFirst of [true, false]) {
    const s = game(`wheel-${String(wheelFirst)}`)
    put(s, "p1", WHEEL, 1, "nexuses")
    put(s, "p1", HILL, getCard(HILL).levels![1]!.cores, "nexuses")
    const angel = put(s, "p1", ANGEL, 1)
    const blocker = put(s, "p2", DUALDO, 1)
    const life = s.players.p1.life
    const seen = battle(s, angel.instanceId, blocker.instanceId, wheelFirst ? ["天翼の大観覧車", "奇跡の丘"] : ["奇跡の丘", "天翼の大観覧車"])
    assert(seen.some((o) => o.some((x) => x.includes("天翼の大観覧車")) && o.some((x) => x.includes("奇跡の丘"))), "ターンプレイヤーに、大観覧車と「手札に戻る」の順番を聞く")
    assert(s.players.p1.hand.includes(ANGEL) && !s.players.p1.trashCards.includes(ANGEL), "天使パワーは手札に戻る")
    assert(s.players.p1.life === life + (wheelFirst ? 1 : 0), wheelFirst ? "大観覧車を先に解決すればライフが増える" : `「手札に戻る」を先に解決したら大観覧車は発揮しない（ライフ ${life} → ${s.players.p1.life}）`)
}

console.log("=== 2. レッド・エイリーク：破壊したスピリットはトラッシュに置かれずデッキの上に戻り、破壊後バーストは発動できない ===")
{
    const s = game("eirik-decktop")
    const brave = getCard("BS13-053") // モクバオー（ブレイヴ）
    assert(brave.type === "brave", "合体させるブレイヴ")
    const eirik = put(s, "p1", EIRIK, 2)
    const b = put(s, "p1", brave.cardId, 0)
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: b.instanceId, hostInstanceId: eirik.instanceId }) === null, "合体する")
    const blocker = put(s, "p2", ANGEL, 1)
    s.players.p2.burst = WALL
    s.players.p2.burstSet = true
    const seen = battle(s, eirik.instanceId, blocker.instanceId, ["発動する", "はい"])
    assert(s.players.p2.deck[0] === ANGEL && !s.players.p2.trashCards.includes(ANGEL), "破壊した天使パワーは相手のデッキの上に戻る（トラッシュに置かれない）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === blocker.instanceId), "場からは離れる")
    assert(s.players.p2.burst === WALL && !seen.some((o) => o.some((x) => x.includes("バースト"))), "トラッシュに置かれていないので、破壊後バーストは確認されない")
}

console.log("すべてのチェックに合格しました 🎉（part950）")
