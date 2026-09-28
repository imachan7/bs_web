// smoke パート432（R5：スナイピングブラストを timedEffect{all} とカウンタ targetBofuCount で書いた。
// 「このターンの間、自分のスピリットすべて」は、あとから出たスピリットにも効く（SEMANTICS_AUDIT §3.12。09-28 ユーザー了承））
import { assert, createGame, createInstance, currentLevel, effectiveBp, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SNIPING = "BS08-074" // スナイピングブラスト
const BOFU1 = "BS06-028" // ガブノハシ（【暴風：1】Lv1〜）
const PLAIN = "BS01-002" // ロクケラトプス（バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SNIPING).name === "スナイピングブラスト" && getCard(SNIPING).type === "magic", "SNIPINGはスナイピングブラスト")
    const bofu = getCard(BOFU1).effects.find((e) => e.kind === "keyword" && e.keyword === "bofu") as { count?: number; levels: number[] | null } | undefined
    assert(getCard(BOFU1).name === "ガブノハシ" && bofu?.count === 1 && (bofu.levels ?? [1]).includes(1), "BOFU1はLv1で【暴風：1】のガブノハシ")
    assert(getCard(PLAIN).name === "ロクケラトプス", "PLAINはロクケラトプス")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    return s
}
function mainAction(): Parameters<typeof resolveAction>[3] {
    const e = getCard(SNIPING).effects.find((x) => x.kind === "magic" && x.timing === "main") as { action: Parameters<typeof resolveAction>[3] }
    return e.action
}

console.log("=== 使ったあとに出た【暴風】持ちにも、その指定数ぶんのBP+が付く ===")
{
    const s = game("p432-later")
    const plain = createInstance(PLAIN, s.turn, 1)
    s.players.p1.field.spirits.push(plain)
    refreshLevelAsOverrides(s)
    const plainBefore = effectiveBp(s, "p1", plain)
    resolveAction(s, "p1", null, mainAction())
    const later = createInstance(BOFU1, s.turn, 1)
    const baseline = currentLevel(later).bp // 印刷の Lv1 BP
    s.players.p1.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", later) === baseline + 2000, `あとから出たガブノハシは BP+2000（${effectiveBp(s, "p1", later)} / 基準 ${baseline}）`)
    assert(effectiveBp(s, "p1", plain) === plainBefore, "【暴風】を持たないスピリットは変わらない")
}

console.log("=== 相手のスピリットには効かない ===")
{
    const s = game("p432-side")
    const enemy = createInstance(BOFU1, s.turn, 1)
    s.players.p2.field.spirits.push(enemy)
    refreshLevelAsOverrides(s)
    const before = effectiveBp(s, "p2", enemy)
    resolveAction(s, "p1", null, mainAction())
    assert(effectiveBp(s, "p2", enemy) === before, "相手の【暴風】持ちは変わらない")
}

console.log("すべてのチェックに合格しました 🎉（part432）")
