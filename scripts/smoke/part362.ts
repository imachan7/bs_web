// smoke パート362（M8 試行：期間つき継続効果の器 timedEffect。カードデータの4か所が旧 type と同じ結果になるか。REFACTOR_PLAN §2.2）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { GameState } from "./helpers"
import { cantActByTimedRule, effectiveBp } from "../../shared/rules"
import type { EffectAction } from "../../server/src/type"

const FAREG = "BS12-038"
const VANILLA = "BS01-002"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(FAREG).name === "オリンピアの天使ファレグ", "FAREGはオリンピアの天使ファレグ")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

// 自分：ファレグ2体（天霊2体）／相手：スピリット3体（2体目だけ合体、3体目だけコア3個でBPが高い）
function board(interactive = false): GameState {
    const s = createGame("m8", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    s.players.p1.field.spirits = [createInstance(FAREG, 1, 1), createInstance(FAREG, 1, 1)]
    const opp = [createInstance(VANILLA, 1, 1), createInstance(VANILLA, 1, 1), createInstance(VANILLA, 1, 3)]
    s.players.p2.field.spirits = opp
    refreshLevelAsOverrides(s)
    opp[1]!.braveCombined = true // refreshLevelAsOverrides が引き直して消すので後に立てる
    return s
}

function flags(s: GameState): string {
    return s.players.p2.field.spirits
        .map((i) => `${i.cantAttackThisTurn ? "A" : "-"}${i.cantBlockThisTurn ? "B" : "-"}${i.cantBlockThisBattle ? "b" : "-"}`)
        .join(" ")
}

function run(action: EffectAction, interactive = false): GameState {
    const s = board(interactive)
    resolveAction(s, "p1", s.players.p1.field.spirits[0]!, action, undefined, undefined, "spirit")
    return s
}

// カードデータに書いた timedEffect のエントリをそのまま取り出す
function cardAction(id: string): EffectAction {
    const found = getCard(id).effects?.map((e) => ("action" in e ? e.action : undefined)).find((a) => a?.type === "timedEffect")
    assert(found !== undefined, `${id}：カードデータに timedEffect がある`)
    return found!
}

console.log("=== 1. カードデータの書き方で、旧 type と同じ個体に同じ印が付く ===")
{
    // 期待値は旧 type（banAttackTargetThisTurn・markCantBlockThisBattle）を同じ盤面で解決して記録したもの
    const cases: [string, string][] = [
        ["BS11-030", "--- A-- ---"],
        ["SD06-012", "--- AB- ---"],
        ["BS09-042", "--- --- --b"],
    ]
    for (const [id, expected] of cases) {
        const got = flags(run(cardAction(id)))
        assert(got === expected, `${id}：${expected}（結果 ${got}）`)
    }
}

console.log("=== 2. 「〜1体につき」の体数：同じ個体を2回選ばない（旧 markCantBlockThisTurn は BP 最大の1体に2回付けて --- --- -B- だった） ===")
{
    const got = flags(run(cardAction("BS12-038")))
    assert(got === "-B- --- -B-", `BS12-038：天霊2体ぶん、BP の高い順に別々の2体へ付ける（結果 ${got}）`)
}

console.log("=== 3. 対話時：1体ずつ選び、選んだ個体は次の候補から外れる ===")
{
    const s = run({ type: "timedEffect", content: [{ type: "cantBlock" }], duration: "turn", count: 2 }, true)
    const [x, y, z] = s.players.p2.field.spirits
    assert(s.pendingChoice?.candidates?.length === 3, "1体目の候補は3体")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: y!.instanceId }) === null, "1体目を選ぶ")
    assert(s.pendingChoice?.candidates?.length === 2 && !s.pendingChoice.candidates.includes(y!.instanceId), "2体目の候補から1体目が外れる")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: x!.instanceId }) === null, "2体目を選ぶ")
    assert(x!.cantBlockThisTurn === true && y!.cantBlockThisTurn === true && z!.cantBlockThisTurn !== true, "選んだ2体だけがブロックできない")
}

console.log("=== 4. 内容をすべて既に持つ個体しかいなければ何もしない ===")
{
    const s = board()
    for (const i of s.players.p2.field.spirits) i.cantAttackThisTurn = true
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "cantAttack" }, { type: "cantBlock" }], duration: "turn" })
    assert(s.players.p2.field.spirits.filter((i) => i.cantBlockThisTurn).length === 1, "アタックだけ持つ個体には、足りないブロックを付けられる")
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "cantAttack" }], duration: "turn" })
    assert(s.log.at(-1)?.includes("対象がいなかった") === true, "全員が既に持っていれば対象なし")
}

console.log("=== 5. all:true：解決後に場に出たスピリットにも効く（2026-09-24 ユーザー確認） ===")
{
    const s = board()
    resolveAction(s, "p1", null, cardAction("BS02-110")) // ヘビィゲート：コスト1以下すべて・両陣営
    const later = createInstance(VANILLA, 1, 1)
    s.players.p2.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(cantActByTimedRule(s, later) && cantActByTimedRule(s, later, "block"), "解決後に出たコスト1もアタック・ブロックできない")
    assert(cantActByTimedRule(s, s.players.p1.field.spirits[0]!) === false, "コスト1より大きい自分のスピリットは止まらない")
    assert(later.cantAttackThisTurn === false && later.cantBlockThisTurn !== true, "個体には印を書かない")
}

console.log("=== 6. all:true の陣営：既定は相手／own は自分／both は両方 ===")
{
    const make = (side?: "own" | "both") => {
        const s = board()
        resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "cantAttack" }], duration: "turn", all: true, ...(side ? { side } : {}) })
        return [cantActByTimedRule(s, s.players.p1.field.spirits[0]!), cantActByTimedRule(s, s.players.p2.field.spirits[0]!)]
    }
    assert(make().join() === "false,true", "既定は相手だけ")
    assert(make("own").join() === "true,false", "own は自分だけ")
    assert(make("both").join() === "true,true", "both は両方")
}

console.log("=== 7. 絞り込み：cost.in と vanilla:false、内容 cantBlock だけ ===")
{
    const s = board()
    resolveAction(s, "p1", null, cardAction("BS11-057")) // バタホルン：コスト4/6/8の相手はブロックできない
    const opp = s.players.p2.field.spirits[0]!
    assert(!cantActByTimedRule(s, opp, "block"), "コスト1は止まらない")
    opp.tempAlsoCosts.push(4)
    assert(cantActByTimedRule(s, opp, "block") && !cantActByTimedRule(s, opp), "コスト4としても扱うならブロックだけ止まる")

    const t = board()
    resolveAction(t, "p1", null, cardAction("BS11-082")) // ウィッグバインド：効果の記述を持つ相手
    assert(!cantActByTimedRule(t, t.players.p2.field.spirits[0]!), "バニラの相手は止まらない")
    const withText = createInstance(FAREG, 1, 1)
    t.players.p2.field.spirits.push(withText)
    assert(cantActByTimedRule(t, withText), "効果の記述を持つ相手は止まる")
}

console.log("=== 8. すべてをBP+：解決後に場に出たスピリットにも乗る（2026-09-24 ユーザー確認） ===")
{
    const s = board()
    const own = s.players.p1.field.spirits[0]!
    const before = effectiveBp(s, "p1", own)
    resolveAction(s, "p1", null, cardAction("BS14-025")) // ムシャメガ：このターンの間、自分のスピリットすべてをBP+1000
    assert(effectiveBp(s, "p1", own) === before + 1000, "解決時にいたスピリットはBP+1000")
    assert(own.tempBpBuff === 0, "個体には書かない")
    const later = createInstance(FAREG, 1, 1)
    s.players.p1.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", later) === before + 1000, "解決後に出たスピリットもBP+1000")
    assert(effectiveBp(s, "p2", s.players.p2.field.spirits[0]!) === 1000, "相手のスピリットには乗らない")
}

console.log("=== 9. BP を条件にしたBP変更は循環するので発揮しない ===")
{
    const s = board()
    resolveAction(s, "p1", null, { type: "timedEffect", content: [{ type: "bp", amount: 1000 }], duration: "turn", all: true, side: "own", filter: { maxBp: 5000 } })
    assert(s.turnConstraints.length === 0 && s.log.at(-1)?.includes("未対応") === true, "ルールを置かずに未対応と記録する")
}

console.log("=== 10. 古代闘技場：発揮する時点でだけ止める（発揮し終わった BP+ は止めない。2026-09-24 ユーザー確認） ===")
{
    const ARENA = "BS04-086"
    assert(getCard(ARENA).name === "古代闘技場", "ARENAは古代闘技場")
    const buff: EffectAction = { type: "timedEffect", content: [{ type: "bp", amount: 1000 }], duration: "turn", all: true, side: "own" }

    const s = board()
    const own = s.players.p1.field.spirits[0]!
    const before = effectiveBp(s, "p1", own)
    s.players.p2.field.nexuses.push(createInstance(ARENA, 1, 0))
    s.phase = "attack" // 古代闘技場の抑止は持ち主（p2）のアタックステップの間だけ
    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, buff)
    assert(effectiveBp(s, "p1", own) === before && s.turnConstraints.length === 0, "相手に古代闘技場があれば発揮されない")

    const t = board()
    const mine = t.players.p1.field.spirits[0]!
    resolveAction(t, "p1", null, buff)
    t.players.p2.field.nexuses.push(createInstance(ARENA, 1, 0))
    t.phase = "attack"
    t.turnPlayer = "p2"
    refreshLevelAsOverrides(t)
    assert(effectiveBp(t, "p1", mine) === before + 1000, "発揮した後に出た古代闘技場は、乗った BP+ を止めない")
}

console.log("すべてのチェックに合格しました 🎉（part362）")
