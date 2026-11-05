// smoke パート796（BS20 の合体時効果と【強化】デッキ破棄：coverage:effects で未実行だった BS20-006-e2・044-e2・044-e3・054-e1）
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SHUMARD = "BS20-006" // 魔炎の剣使いシュマルド（赤・コスト5・Lvコア1/3/4）
const PENTAN = "BS20-044" // 剣士ペンタン（黄・コスト5・Lvコア1/2/4）
const PATRO = "BS20-054" // 戦騎将パトロクロス（青・コスト8）【強化】デッキ破棄+1
const DATAS = "BS20-050" // トライデントのデータス（青・コスト4）【粉砕】
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・合体条件コスト4以上。合体時はエンドステップに回復するだけ）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1BP3000・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SHUMARD).name === "魔炎の剣使いシュマルド" && getCard(SHUMARD).levels.map((l) => l.cores).join("/") === "1/3/4", "SHUMARDはシュマルド（Lvコア1/3/4）")
    assert(getCard(PENTAN).name === "剣士ペンタン" && getCard(PENTAN).levels.map((l) => l.cores).join("/") === "1/2/4", "PENTANは剣士ペンタン（Lvコア1/2/4）")
    assert(getCard(PATRO).name === "戦騎将パトロクロス", "PATROはパトロクロス")
    assert(getCard(DATAS).name === "トライデントのデータス" && getCard(DATAS).effect.includes("【粉砕】"), "DATASはデータス（【粉砕】）")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave", "KARAKURIはカラクリバッタ（ブレイヴ）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).effect === "", "VANはロクケラトプス（効果なし）")
    assert(getCard(STIRA).name === "スティラホーン" && getCard(STIRA).effect === "", "STIRAはスティラホーン（効果なし）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

// 対象の選択は picks を優先して答える
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        const next = pc.kind === "target" ? (picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]) : undefined
        const err = next !== undefined
            ? act(s, who, { type: "resolveChoice", instanceId: next })
            : pc.kind === "option" ? act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" }) : act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

console.log("=== 006【合体時】Lv2『合体アタック時』：BP6000以下の相手のスピリット1体を破壊する（合体していなければ破壊しない） ===")
{
    const s = game("shumard-combined")
    const shumard = put(s, "p1", SHUMARD, 3) // Lv2
    combine(s, "p1", shumard, KARAKURI)
    const stira = put(s, "p2", STIRA, 1) // BP3000
    assert(act(s, "p1", { type: "attack", instanceId: shumard.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [stira.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId), "BP6000以下のスティラホーンは破壊される")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("shumard-alone")
    const shumard = put(s, "p1", SHUMARD, 3) // Lv2・合体していない
    const stira = put(s, "p2", STIRA, 1)
    assert(act(s, "p1", { type: "attack", instanceId: shumard.instanceId }) === null, "シュマルドでアタックできる")
    settle(s, [stira.instanceId])
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === stira.instanceId), "合体していなければ破壊しない")
    takeLifeAndResolve(s, "p2")
}

console.log("=== 044【合体時】Lv2『アタック/ブロック時』：このターンの間、相手のスピリット1体をBP-3000する ===")
{
    const s = game("pentan-attack")
    const pentan = put(s, "p1", PENTAN, 2) // Lv2
    combine(s, "p1", pentan, KARAKURI)
    const stira = put(s, "p2", STIRA, 1) // BP3000
    const van = put(s, "p2", VAN, 3) // BP4000（Lv3）
    assert(act(s, "p1", { type: "attack", instanceId: pentan.instanceId }) === null, "合体スピリットでアタックできる")
    settle(s, [van.instanceId])
    assert(effectiveBp(s, "p2", van) === 1000, "選んだロクケラトプスはBP-3000（4000→1000）")
    assert(effectiveBp(s, "p2", stira) === 3000, "選ばなかったスティラホーンはそのまま")
    takeLifeAndResolve(s, "p2")
}
{
    const s = game("pentan-block")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    const pentan = put(s, "p1", PENTAN, 2) // Lv2
    combine(s, "p1", pentan, KARAKURI)
    const attacker = put(s, "p2", STIRA, 1) // BP3000
    const other = put(s, "p2", VAN, 3) // BP4000
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手のスティラホーンがアタック")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス")
    assert(declareBlock(s, "p1", pentan.instanceId) === null, "合体スピリットでブロックできる")
    settle(s, [other.instanceId])
    assert(effectiveBp(s, "p2", other) === 1000, "ブロック時：アタッカー以外の相手のスピリットも選べてBP-3000（4000→1000）")
    assert(effectiveBp(s, "p2", attacker) === 3000, "選ばなかったアタッカーはそのまま")
}

console.log("=== 054【強化】：自分の「相手へのデッキ破棄効果」の枚数を+1枚する（【粉砕】Lv1 の1枚が2枚に） ===")
for (const withPatro of [true, false]) {
    const s = game(withPatro ? "patro-kyoka" : "patro-none")
    if (withPatro) put(s, "p1", PATRO, 1)
    const datas = put(s, "p1", DATAS, 1) // Lv1
    const deck = s.players.p2.deck.length
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "データスでアタックできる")
    settle(s)
    const milled = deck - s.players.p2.deck.length
    assert(milled === (withPatro ? 2 : 1), withPatro ? "パトロクロスの【強化】で【粉砕】の破棄は2枚" : "【強化】が無ければ【粉砕】Lv1 は1枚")
    takeLifeAndResolve(s, "p2")
}

console.log("すべてのチェックに合格しました 🎉（part796）")
