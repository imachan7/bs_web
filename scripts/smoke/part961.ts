// smoke パート961（「回復したとき」は、解決する時点で主語のスピリットが回復状態でなくなっていれば発揮しない。公式Q230の対称形。#567）
// 対照は part942（疲労側）。同じ列で先に状態を戻す組み方を向きを逆にして使う
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, refreshSpirit, runTurnStart } from "./helpers"

const FORTRESS = "BS19-089" // フォートレスキューブ（白ネクサス・Lv1･Lv2『自分の白のスピリットが回復したとき』ボイドからコア1個）
const ARMADILLO = "SD06-008" // アルマジトカゲ（白スピリット・コスト1）
const DIARU = "BS13-024" // 武神獣ディアル・ユキムラ（緑・Lv2『自分のスピリットが回復したとき』自分以外のスピリットなら、このスピリットを回復）
const RED = "BS01-002" // ロクケラトプス（赤・相手側に置く候補）
// 同じ列で先に解決して、回復したスピリット（主語）を再び疲労させる効果（フォートレスキューブの効果より前に並べる）。target self＝主語
const EXHAUST_FIRST = { id: "t961-exhaust", kind: "fieldEvent", event: "anySpiritRefreshed", levels: [1, 2], phase: "attack", subjectSide: "own", action: { type: "exhaust", target: "self", count: 1 } }
// 対話モードで選択待ちを先に立てる効果（相手のスピリット1体を疲労。候補2体）
const PICK_FIRST = { id: "t961-pick", kind: "fieldEvent", event: "anySpiritRefreshed", levels: [1, 2], phase: "attack", subjectSide: "own", action: { type: "exhaust", count: 1 } }
// ディアルの『自分のスピリットが回復したとき』の前に並べる、回復した主語の再疲労
// excludeSelf：ディアル自身の回復（ディアルの効果の結果）でこの効果が再び誘発しないようにする
const DIARU_EXHAUST_FIRST = { id: "t961-diaru-ex", kind: "fieldEvent", event: "ownSpiritRefreshed", levels: [2], phase: "attack", subjectFilter: { excludeSelf: true }, action: { type: "exhaust", target: "self", count: 1 } }

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(FORTRESS).name === "フォートレスキューブ" && getCard(FORTRESS).type === "nexus", "FORTRESSはフォートレスキューブ")
assert(getCard(ARMADILLO).name === "アルマジトカゲ" && getCard(ARMADILLO).colors.includes("white"), "ARMADILLOは白のアルマジトカゲ")
assert(getCard(DIARU).name === "武神獣ディアル・ユキムラ", "DIARUは武神獣ディアル・ユキムラ")
assert(getCard(RED).name === "ロクケラトプス", "REDはロクケラトプス")

// 攻撃ステップへ進めた盤面。p1 の白スピリット（疲労状態）とフォートレスキューブを置く
function run(seed: string, exhaustFirst: boolean): { cores: number; rested: boolean } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p1.field.nexuses.push(createInstance(FORTRESS, s.turn, 0))
    const spirit = createInstance(ARMADILLO, s.turn, 0)
    spirit.isRested = true
    s.players.p1.field.spirits.push(spirit)
    refreshLevelAsOverrides(s)
    const effects = getCard(FORTRESS).effects as unknown[]
    if (exhaustFirst) effects.unshift(EXHAUST_FIRST)
    try {
        refreshSpirit(s, "p1", spirit)
    } finally {
        if (exhaustFirst) effects.shift()
    }
    return { cores: spirit.cores, rested: spirit.isRested === true }
}

console.log("=== B（対照）：回復状態のまま → 発揮してコア+1 ===")
{
    const r = run("t961-b", false)
    assert(!r.rested, "テスト前提: 回復した")
    assert(r.cores === 1, `コアが1つ乗る（${r.cores}個）`)
}

console.log("=== A：同じ列で先に再び疲労させると、回復状態でなくなっているので発揮しない ===")
{
    const r = run("t961-a", true)
    assert(r.rested, "テスト前提: 先の効果で再び疲労した")
    assert(r.cores === 0, `コアが乗らない（${r.cores}個）`)
}

// 対話モード：選択待ちが先に立つと、フォートレスキューブの効果は再開スタック経由で解決される（choice.ts）
function runInteractive(seed: string, exhaustFirst: boolean): { cores: number; rested: boolean; pendingAfter: string | null } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p1.field.nexuses.push(createInstance(FORTRESS, s.turn, 0))
    const spirit = createInstance(ARMADILLO, s.turn, 0)
    spirit.isRested = true
    s.players.p1.field.spirits.push(spirit)
    s.players.p2.field.spirits.push(createInstance(RED, s.turn, 0), createInstance(RED, s.turn, 0))
    refreshLevelAsOverrides(s)
    const effects = getCard(FORTRESS).effects as unknown[]
    effects.unshift(PICK_FIRST)
    if (exhaustFirst) effects.splice(1, 0, EXHAUST_FIRST)
    try {
        refreshSpirit(s, "p1", spirit)
    } finally {
        effects.shift()
        if (exhaustFirst) effects.shift()
    }
    const p = s.pendingChoice
    assert(p?.kind === "target" && p.candidates.length === 2, `先に相手のスピリットの選択待ちが立つ（${p?.kind ?? "なし"}）`)
    assert(act(s, p!.pid, { type: "resolveChoice", instanceId: p!.candidates[0]! }) === null, "選択に答える")
    return { cores: spirit.cores, rested: spirit.isRested === true, pendingAfter: s.pendingChoice?.kind ?? null }
}

console.log("=== 対話B（対照）：選択のあとも回復状態なら、発揮してコア+1 ===")
{
    const r = runInteractive("t961-ib", false)
    assert(!r.rested && r.cores === 1, `コアが1つ乗る（${r.cores}個・疲労${r.rested}）`)
}

console.log("=== 対話A：選択の前に再び疲労させると、再開のときに回復状態でなくなっているので発揮しない ===")
{
    const r = runInteractive("t961-ia", true)
    assert(r.rested && r.cores === 0, `コアが乗らない（${r.cores}個・疲労${r.rested}）`)
}

// ownSpiritRefreshed（ディアル）：主語は回復させられたスピリット。ディアル自身の疲労状態は見ない
function runDiaru(exhaustFirst: boolean): { diaruRested: boolean; subjectRested: boolean } {
    const s = createGame(`t961-d-${exhaustFirst}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const diaru = createInstance(DIARU, s.turn, 3) // Lv2 は3コア
    diaru.isRested = true
    const subject = createInstance(ARMADILLO, s.turn, 0)
    subject.isRested = true
    s.players.p1.field.spirits.push(diaru, subject)
    refreshLevelAsOverrides(s)
    const effects = getCard(DIARU).effects as unknown[]
    if (exhaustFirst) effects.unshift(DIARU_EXHAUST_FIRST)
    try {
        refreshSpirit(s, "p1", subject)
    } finally {
        if (exhaustFirst) effects.shift()
    }
    return { diaruRested: diaru.isRested === true, subjectRested: subject.isRested === true }
}

console.log("=== C（対照）：ディアル：主語が回復のまま → ディアル自身を回復させる ===")
{
    const r = runDiaru(false)
    assert(!r.diaruRested, `ディアルが回復した（疲労${r.diaruRested}）`)
}

console.log("=== C：同じ列で主語を再び疲労させると、回復状態でなくなっているのでディアルは発揮しない ===")
{
    const r = runDiaru(true)
    assert(r.subjectRested, "テスト前提: 主語は再び疲労した")
    assert(r.diaruRested, `ディアルは疲労のまま（疲労${r.diaruRested}）`)
}

console.log("すべてのチェックに合格しました 🎉（part961）")
