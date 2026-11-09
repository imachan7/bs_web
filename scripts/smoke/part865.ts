// smoke パート865（BS23 黄バッチ：043 アマルティアの【合体時】・064 ネフィリム。効果文だけを根拠にした期待値。docs/design/BS23_PLAN.md §1）
// 合体後の盤面は写像に載らない行が多いので、scenario ではなく操作と assert で書く
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { combinedSpiritSymbolColors } from "../../shared/rules/symbols"

const AMAL = "BS23-043" // 月影の剣聖アマルティア（コスト5・Lv2 は 2 コア）
const NEPH = "BS23-064" // 殲滅天使ネフィリム（ブレイヴ・合体条件コスト5以上）
const AVRIEL = "BS23-X05" // 大天使アヴリエル（コスト6）
const ANGEL = "BS10-048" // 天使パワー（天霊・コスト5・効果なし）
const SWORD = "BS23-063" // 光輪剣エンジェルハイロゥ（剣刃のブレイヴ・合体条件コスト4以上）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1。1/2/3 コアで Lv1/2/3）
const TORN = "BS10-009" // トルネードラ（赤・BP5000／3 コアで 9000／5 コアで 10000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(AMAL).name === "月影の剣聖アマルティア" && getCard(AMAL).cost === 5, "AMAL")
    assert(getCard(NEPH).name === "殲滅天使ネフィリム" && getCard(NEPH).type === "brave", "NEPH")
    assert(getCard(AVRIEL).name === "大天使アヴリエル" && getCard(AVRIEL).cost === 6, "AVRIEL")
    assert(getCard(ANGEL).name === "天使パワー" && getCard(ANGEL).cost === 5 && getCard(ANGEL).family.includes("天霊"), "ANGEL")
    assert(getCard(SWORD).type === "brave" && getCard(SWORD).family.includes("剣刃"), "SWORD")
    assert(getCard(TORN).levels.map((l) => `${l.cores}/${l.bp}`).join() === "1/5000,3/9000,5/10000", "TORN")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = interactive
    for (const p of ["p1", "p2"] as const) {
        s.players[p].reserve = 10
        s.players[p].life = 5
        s.players[p].deck = Array.from({ length: 40 }, () => VAN)
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function closeFlash(s: GameState): void {
    while (s.isFlashTiming && s.battle) {
        const err = act(s, s.priorityPlayer, { type: "pass" })
        if (err) throw new Error(`フラッシュを閉じられない: ${err}`)
    }
}

type Inst = ReturnType<typeof put>

function combine(s: GameState, host: Inst, brave: Inst): void {
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "合体できる")
}

// 選択待ちを答え切る。対象は prefer の先頭から、選択肢は「3体」「3000」を含むものを優先する
function answerAll(s: GameState, prefer: string[]): void {
    for (let i = 0; s.pendingChoice; i++) {
        if (i > 12) throw new Error("選択待ちが終わらない")
        const pc = s.pendingChoice
        if (pc.kind === "option") {
            const opts = pc.options ?? []
            const err = act(s, pc.pid, { type: "resolveChoice", option: opts.find((o) => /3体|3000/.test(o)) ?? opts[0]! })
            if (err) throw new Error(err)
            continue
        }
        const pick = prefer.find((id) => pc.candidates.includes(id)) ?? pc.candidates[0]!
        const err = act(s, pc.pid, { type: "resolveChoice", instanceId: pick })
        if (err) throw new Error(err)
    }
}

function attackWith(s: GameState, inst: Inst, prefer: string[] = []): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ進める")
    assert(act(s, "p1", { type: "attack", instanceId: inst.instanceId }) === null, "アタックできる")
    answerAll(s, prefer)
    closeFlash(s)
}

const blockErr = (s: GameState, inst: Inst) => act(s, "p2", { type: "block", instanceId: inst.instanceId })

// ───────────── 043 月影の剣聖アマルティア ─────────────
console.log("=== 1. 043：合体中（Lv2）、スピリット状態のブレイヴはLv1・Lv3の相手のスピリットからブロックされない ===")
{
    const s = game("p865-amal-1")
    const host = put(s, "p1", AMAL, 2)
    const braveA = put(s, "p1", SWORD, 1)
    const braveB = put(s, "p1", SWORD, 1)
    const lv1 = put(s, "p2", VAN, 1)
    const lv3 = put(s, "p2", VAN, 3)
    combine(s, host, braveA)
    attackWith(s, braveB)
    assert(blockErr(s, lv1) !== null, "Lv1 の相手はブロックできない")
    assert(blockErr(s, lv3) !== null, "Lv3 の相手はブロックできない")
    assert(act(s, "p2", { type: "takeLife" }) === null && s.players.p2.life === 4, "ブロックされずライフを受ける")
}
console.log("=== 2. 043：Lv2 の相手はブロックできる／合体していなければLv1もブロックできる ===")
{
    const s = game("p865-amal-2")
    const host = put(s, "p1", AMAL, 2)
    const braveA = put(s, "p1", SWORD, 1)
    const braveB = put(s, "p1", SWORD, 1)
    const lv2 = put(s, "p2", VAN, 2)
    combine(s, host, braveA)
    attackWith(s, braveB)
    assert(blockErr(s, lv2) === null, "Lv2 の相手はブロックできる")
}
{
    const s = game("p865-amal-3")
    put(s, "p1", AMAL, 2)
    const braveB = put(s, "p1", SWORD, 1)
    const lv1 = put(s, "p2", VAN, 1)
    attackWith(s, braveB)
    assert(blockErr(s, lv1) === null, "合体していなければ【合体時】は効かず、Lv1 もブロックできる")
}
console.log("=== 3. 043：合体した本体のアタックは「スピリット状態のブレイヴ」ではないので、Lv1 にもブロックされる ===")
{
    const s = game("p865-amal-4")
    const host = put(s, "p1", AMAL, 2)
    const braveA = put(s, "p1", SWORD, 1)
    const lv1 = put(s, "p2", VAN, 1)
    combine(s, host, braveA)
    attackWith(s, host)
    assert(blockErr(s, lv1) === null, "合体スピリット自身のアタックは Lv1 にもブロックされる")
}

// ───────────── 064 殲滅天使ネフィリム ─────────────
const yellowSymbols = (s: GameState, host: Inst) => combinedSpiritSymbolColors(s, "p1", host).filter((c) => c === "yellow").length

console.log("=== 4. 064：アヴリエルと合体。BP-5000（1体）に、黄シンボル+1、Lv1/Lv2 からブロックされない／Lv3 はブロックできる ===")
{
    const s = game("p865-neph-1", true)
    const host = put(s, "p1", AVRIEL, 2) // 本体も Lv2 の【合体時】で相手3体を-3000する。選ぶ側の答えは answerAll が「3体」を優先する
    const neph = put(s, "p1", NEPH, 1)
    const lv3 = put(s, "p2", TORN, 5)
    const lv1 = put(s, "p2", TORN, 1)
    const lv2 = put(s, "p2", TORN, 3)
    combine(s, host, neph)
    const before = yellowSymbols(s, host)
    attackWith(s, host, [lv3.instanceId])
    assert(effectiveBp(s, "p2", lv3) === 10000 - 5000 - 3000, `対象のLv3 は 10000-5000-3000=2000（実際: ${effectiveBp(s, "p2", lv3)}）`)
    assert(effectiveBp(s, "p2", lv1) === 5000 - 3000, "Lv1 は 5000-3000（アヴリエル側のみ）")
    assert(effectiveBp(s, "p2", lv2) === 9000 - 3000, "Lv2 は 9000-3000（アヴリエル側のみ）")
    assert(yellowSymbols(s, host) === before + 1, "アヴリエルとの合体なら黄シンボルが1つ増える")
    assert(blockErr(s, lv1) !== null, "Lv1 の相手はブロックできない")
    assert(blockErr(s, lv2) !== null, "Lv2 の相手はブロックできない")
    assert(blockErr(s, lv3) === null, "Lv3 の相手はブロックできる")
}
console.log("=== 5. 064：アヴリエル以外と合体なら、BP-5000だけ（シンボルは増えず、Lv1 もブロックできる）。BP0 でも破壊されない（Q20358） ===")
{
    const s = game("p865-neph-2", true)
    const host = put(s, "p1", ANGEL, 2)
    const neph = put(s, "p1", NEPH, 1)
    const weak = put(s, "p2", VAN, 1)
    const lv1 = put(s, "p2", TORN, 1)
    combine(s, host, neph)
    const before = yellowSymbols(s, host)
    attackWith(s, host, [weak.instanceId])
    assert(effectiveBp(s, "p2", weak) <= 0, "ロクケラトプスは BP0 以下")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === weak.instanceId), "BP0 になっても破壊されない")
    assert(effectiveBp(s, "p2", lv1) === 5000, "対象外のトルネードラは BP そのまま")
    assert(yellowSymbols(s, host) === before, "黄シンボルは増えない")
    assert(blockErr(s, lv1) === null, "Lv1 の相手もブロックできる")
}

console.log("すべてのチェックに合格しました 🎉（part865）")
