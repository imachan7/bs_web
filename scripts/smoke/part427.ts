// smoke パート427（▼「N体まで／Nつまで」＝0〜Nの好きな数を選べる（A組：exhaust/refreshOne/destroyNexus）。
// BS01-036シャ・ズー／BS14-102烈風神空覇／BS12-073ネクサスコラプス。docs/design/HANDOFF.md参照）
import {
    assert,
    createGame,
    createInstance,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SHAZUU = "BS01-036"
const RETSUFUU = "BS14-102"
const NEXUS_COLLAPSE = "BS12-073"
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const NEXUS_CARD = "BS05-065" // 青嵐の虚空（ネクサス。中身の効果は使わない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SHAZUU).name === "シャ・ズー" && getCard(SHAZUU).type === "spirit", "SHAZUUはシャ・ズー")
    assert(getCard(RETSUFUU).name === "烈風神空覇" && getCard(RETSUFUU).type === "magic", "RETSUFUUは烈風神空覇")
    assert(getCard(NEXUS_COLLAPSE).name === "ネクサスコラプス" && getCard(NEXUS_COLLAPSE).type === "magic", "NEXUS_COLLAPSEはネクサスコラプス")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
    assert(getCard(NEXUS_CARD).type === "nexus", "NEXUS_CARDはネクサス")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// ---- exhaust upTo（シャ・ズー：anySide, count:2, upTo:true） ----
const exhaustAction = { type: "exhaust" as const, count: 2, anySide: true as const, upTo: true as const }

console.log("=== 1. exhaust upTo：対話時、選ばず終える（0個） ===")
{
    const s = game("exhaust-skip0", true)
    const e1 = put(s, "p2", VANILLA)
    const e2 = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, exhaustAction)
    assert(s.pendingChoice !== null && s.pendingChoice.optional === true, "選択が立ち、任意である")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "選ばずに終える")
    assert(!e1.isRested && !e2.isRested, "0個で終えたので誰も疲労していない")
    assert(s.pendingChoice === null, "選択は残らない")
}

console.log("=== 2. exhaust upTo：1つ選んだあとで止められる ===")
{
    const s = game("exhaust-pick1stop", true)
    const e1 = put(s, "p2", VANILLA)
    const e2 = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, exhaustAction)
    assert(s.pendingChoice!.candidates.length === 2, "候補は相手の2体")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: e1.instanceId }) === null, "1体目を選ぶ")
    assert(e1.isRested, "選んだ1体は疲労した")
    assert(!e2.isRested, "残りはまだ疲労していない")
    assert(s.pendingChoice !== null && s.pendingChoice.prompt.includes("あと1体"), "残り1体ぶんの選択が立ち直す")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "残りは選ばずに終える")
    assert(!e2.isRested, "スキップしたので2体目は疲労しないまま")
    assert(s.pendingChoice === null, "選択は残らない")
}

console.log("=== 3. exhaust upTo：候補1体でも自動解決せず聞く ===")
{
    const s = game("exhaust-one-candidate", true)
    const e1 = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, exhaustAction)
    assert(s.pendingChoice !== null && s.pendingChoice.candidates.length === 1, "候補1体でも自動解決せず選択を出す")
    assert(!e1.isRested, "まだ疲労していない（自動解決されていない）")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: e1.instanceId }) === null, "1体を選ぶ")
    assert(e1.isRested, "選んだので疲労した")
    assert(s.pendingChoice === null, "他に候補が無いので選択は続かない")
}

console.log("=== 4. exhaust upTo：N体（2体）まで選べる ===")
{
    const s = game("exhaust-pick-all", true)
    const e1 = put(s, "p2", VANILLA)
    const e2 = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, exhaustAction)
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: e1.instanceId }) === null, "1体目を選ぶ")
    assert(s.pendingChoice !== null, "残り1体ぶんの選択が立つ")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: e2.instanceId }) === null, "2体目を選ぶ")
    assert(e1.isRested && e2.isRested, "2体とも疲労した")
    assert(s.pendingChoice === null, "count分選び終えたので選択は続かない")
}

console.log("=== 5. exhaust upTo：非対話は従来どおり選べるだけ選ぶ（挙動不変） ===")
{
    const s = game("exhaust-noninteractive", false)
    const e1 = put(s, "p2", VANILLA)
    const e2 = put(s, "p2", VANILLA)
    resolveAction(s, "p1", null, exhaustAction)
    assert(s.pendingChoice === null, "非対話では選択を立てない")
    assert(e1.isRested && e2.isRested, "非対話は候補が尽きるまで自動で疲労させる")
}

// ---- refreshOne upTo（烈風神空覇e1のthen：count:3, filter省略, upTo:true） ----
const refreshAction = { type: "refreshOne" as const, count: 3, upTo: true as const }

console.log("=== 6. refreshOne upTo：1つ選んで止め、残りは回復させない ===")
{
    const s = game("refresh-pick1stop", true)
    const r1 = put(s, "p1", VANILLA)
    const r2 = put(s, "p1", VANILLA)
    r1.isRested = true
    r2.isRested = true
    resolveAction(s, "p1", null, refreshAction)
    assert(s.pendingChoice !== null && s.pendingChoice.candidates.length === 2, "疲労中の2体が候補")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: r1.instanceId }) === null, "1体目を回復")
    assert(!r1.isRested, "選んだ1体は回復した")
    assert(r2.isRested, "残りはまだ疲労したまま")
    assert(s.pendingChoice !== null, "残り2体ぶんの選択が立ち直す")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "残りは選ばずに終える")
    assert(r2.isRested, "スキップしたので回復しないまま")
    assert(s.pendingChoice === null, "選択は残らない")
}

console.log("=== 7. refreshOne upTo：候補1体でも自動解決せず聞く ===")
{
    const s = game("refresh-one-candidate", true)
    const r1 = put(s, "p1", VANILLA)
    r1.isRested = true
    resolveAction(s, "p1", null, refreshAction)
    assert(s.pendingChoice !== null && s.pendingChoice.candidates.length === 1, "候補1体でも自動解決せず選択を出す")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: r1.instanceId }) === null, "1体を選ぶ")
    assert(!r1.isRested, "選んだので回復した")
    assert(s.pendingChoice === null, "他に候補が無いので選択は続かない")
}

console.log("=== 8. refreshOne upTo：非対話は従来どおり選べるだけ回復させる（挙動不変） ===")
{
    const s = game("refresh-noninteractive", false)
    const r1 = put(s, "p1", VANILLA)
    const r2 = put(s, "p1", VANILLA)
    r1.isRested = true
    r2.isRested = true
    resolveAction(s, "p1", null, refreshAction)
    assert(s.pendingChoice === null, "非対話では選択を立てない")
    assert(!r1.isRested && !r2.isRested, "非対話は候補が尽きるまで自動で回復させる")
}

// ---- destroyNexus upTo（ネクサスコラプスe1：count:2, side省略=相手, upTo:true） ----
const destroyNexusAction = { type: "destroyNexus" as const, count: 2, upTo: true as const }

console.log("=== 9. destroyNexus upTo：0個で終えられる ===")
{
    const s = game("nexus-skip0", true)
    const n1 = createInstance(NEXUS_CARD, s.turn, 0)
    const n2 = createInstance(NEXUS_CARD, s.turn, 0)
    s.players.p2.field.nexuses.push(n1, n2)
    resolveAction(s, "p1", null, destroyNexusAction)
    assert(s.pendingChoice !== null && s.pendingChoice.optional === true, "選択が立ち、任意である")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "選ばずに終える")
    assert(s.players.p2.field.nexuses.length === 2, "0個で終えたのでネクサスは残る")
    assert(s.pendingChoice === null, "選択は残らない")
}

console.log("=== 10. destroyNexus upTo：1つ選んだあとで止められる ===")
{
    const s = game("nexus-pick1stop", true)
    const n1 = createInstance(NEXUS_CARD, s.turn, 0)
    const n2 = createInstance(NEXUS_CARD, s.turn, 0)
    s.players.p2.field.nexuses.push(n1, n2)
    resolveAction(s, "p1", null, destroyNexusAction)
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: n1.instanceId }) === null, "1つ目を選ぶ")
    assert(!s.players.p2.field.nexuses.some((n) => n.instanceId === n1.instanceId), "選んだネクサスは破壊された")
    assert(s.players.p2.field.nexuses.some((n) => n.instanceId === n2.instanceId), "残りはまだ破壊されていない")
    assert(s.pendingChoice !== null && s.pendingChoice.prompt.includes("あと1つ"), "残り1つぶんの選択が立ち直す")
    assert(handleAction(s, "p1", { type: "resolveChoice" }) === null, "残りは選ばずに終える")
    assert(s.players.p2.field.nexuses.some((n) => n.instanceId === n2.instanceId), "スキップしたので2つ目は破壊されないまま")
}

console.log("=== 11. destroyNexus upTo：候補1つでも自動解決せず聞く ===")
{
    const s = game("nexus-one-candidate", true)
    const n1 = createInstance(NEXUS_CARD, s.turn, 0)
    s.players.p2.field.nexuses.push(n1)
    resolveAction(s, "p1", null, destroyNexusAction)
    assert(s.pendingChoice !== null && s.pendingChoice.candidates.length === 1, "候補1つでも自動解決せず選択を出す")
    assert(s.players.p2.field.nexuses.length === 1, "まだ破壊されていない（自動解決されていない）")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: n1.instanceId }) === null, "1つを選ぶ")
    assert(s.players.p2.field.nexuses.length === 0, "選んだので破壊された")
    assert(s.pendingChoice === null, "他に候補が無いので選択は続かない")
}

console.log("=== 12. destroyNexus upTo：N個（2個）まで選べる ===")
{
    const s = game("nexus-pick-all", true)
    const n1 = createInstance(NEXUS_CARD, s.turn, 0)
    const n2 = createInstance(NEXUS_CARD, s.turn, 0)
    s.players.p2.field.nexuses.push(n1, n2)
    resolveAction(s, "p1", null, destroyNexusAction)
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: n1.instanceId }) === null, "1つ目を選ぶ")
    assert(s.pendingChoice !== null, "残り1つぶんの選択が立つ")
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: n2.instanceId }) === null, "2つ目を選ぶ")
    assert(s.players.p2.field.nexuses.length === 0, "2つとも破壊された")
    assert(s.pendingChoice === null, "count分選び終えたので選択は続かない")
}

console.log("=== 13. destroyNexus upTo：非対話は従来どおり選べるだけ破壊する（挙動不変） ===")
{
    const s = game("nexus-noninteractive", false)
    const n1 = createInstance(NEXUS_CARD, s.turn, 0)
    const n2 = createInstance(NEXUS_CARD, s.turn, 0)
    s.players.p2.field.nexuses.push(n1, n2)
    resolveAction(s, "p1", null, destroyNexusAction)
    assert(s.pendingChoice === null, "非対話では選択を立てない")
    assert(s.players.p2.field.nexuses.length === 0, "非対話は候補が尽きるまで自動で破壊する")
}

console.log("すべてのチェックに合格しました 🎉（part427）")
