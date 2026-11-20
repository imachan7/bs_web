// smoke パート1037（AI が場のスピリットのコアも支払い元にする手を候補に出す。server/src/ai/legalMoves.ts の fieldPaid・payLevels）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { instMinLevelCores } from "../../shared/rules/level"

const VANILLA = "BS01-002" // ロクケラトプス（Lv1=1コア・Lv2=2・Lv3=3）
const GORADON = "BS01-001" // ゴラドン（コスト0・Lv1=1コア・Lv2=3）

assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(GORADON).name === "ゴラドン", "cardId の機械確認")

function scene(reserve: number, cores: number[]): GameState {
    const s = createGame("pay", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = reserve
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = [GORADON]
    s.players.p2.hand = []
    for (const c of cores) s.players.p1.field.spirits.push(createInstance(VANILLA, s.turn, c))
    refreshLevelAsOverrides(s)
    return s
}
const summons = (s: GameState) => enumerateLegalMoves(s, "p1").filter((m) => m.action.type === "summon")
const levelOf = (m: { action: object }): number | undefined => (m.action as { level?: number }).level

console.log("=== 1. リザーブが0でも、場のスピリットの余りのコアで召喚できる手が出る ===")
{
    const s = scene(0, [3])
    const m = summons(s)
    assert(m.length === 1 && levelOf(m[0]!) === 1, "Lv1の召喚が1つだけ出る（Lv2は3コア要るが、Lv1を保って出せる余りは2）")
    const ps = (m[0]!.action as { paySources?: { instanceId: string; count: number }[] }).paySources
    assert(ps?.length === 1 && ps[0]!.count === 1, "支払い元は場のスピリット1個ぶん")
    assert(m[0]!.added === true, "場のコアを払う手は added（旧の方針は使わない）")
    assert(handleAction(s, "p1", m[0]!.action) === null, "その手をサーバーが受け付ける")
    assert(s.players.p1.field.spirits.length === 2 && s.players.p1.field.spirits[0]!.cores === 2, "場が1体増え、払った側は3→2コア（Lv3→Lv2）")
}

console.log("=== 2. どのスピリットも0コアにしない・レベルが下がる払い方も出る ===")
{
    const s = scene(0, [3, 3])
    const m = summons(s)
    const lv2 = m.find((x) => levelOf(x) === 2)
    assert(lv2 !== undefined, "Lv2（3コア）の召喚が、2体のレベルを下げる払い方で出る")
    const [a, b] = s.players.p1.field.spirits
    const ps = (lv2!.action as { paySources?: { instanceId: string; count: number }[] }).paySources!
    const left = (inst: NonNullable<typeof a>) => inst.cores - (ps.find((p) => p.instanceId === inst.instanceId)?.count ?? 0)
    assert(ps.reduce((n, p) => n + p.count, 0) === 3, "支払いは必要数ちょうど")
    assert(left(a!) >= instMinLevelCores(a!) && left(b!) >= instMinLevelCores(b!), "どの支払い元もLv1を保つコアが残る（消滅しない）")
    assert(left(a!) < 3 || left(b!) < 3, "いまのレベル（Lv3）を保てない払い方になっている")
    assert(handleAction(s, "p1", lv2!.action) === null && s.players.p1.field.spirits.every((x) => x.cores >= 1), "受け付けられ、全員が1コア以上")
}

console.log("=== 3. いまのレベルを保てる余りがあれば、それだけで払う ===")
{
    const s = scene(0, [5])
    const m = summons(s).find((x) => levelOf(x) === 1)!
    const inst = s.players.p1.field.spirits[0]!
    handleAction(s, "p1", m.action)
    assert(inst.cores >= 3, "Lv3を保つ3コアが残る")
}

console.log("=== 4. 召喚は最大レベルに加えてLv1も候補に出る ===")
{
    const s = scene(10, [])
    const m = summons(s)
    assert(m.some((x) => levelOf(x) === 2 && !x.added), "最大レベル（Lv2）は従来の手")
    assert(m.some((x) => levelOf(x) === 1 && x.added === true), "Lv1は追加候補")
    assert(m.length === 2, "2つだけ")
}

console.log("すべてのチェックに合格しました 🎉（part1037）")
