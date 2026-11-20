// smoke パート1040（AI が無駄撃ちのマジックを撃たない。server/src/ai/keepGuard.ts・spellFilter.ts）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { BLOCK_POLICY, DEFAULT_POLICY } from "../../server/src/ai/policy"

const WALL = "SD11-014" // ウィンドウォール（コスト4。フラッシュ：このバトルが終了したとき、アタックステップを終了する＋【連鎖】）
const LEAP = "SD13-008" // ソウルリープ（フラッシュ：疲労状態のコスト4以下の相手1体を破壊＋対象を取らない【連鎖】。的がいなくても使える）
const DEADLY = "BS01-125" // デッドリィバランス（コスト3。フラッシュ：お互い、それぞれのスピリット1体を破壊する）
const ROKU = "BS01-002" // ロクケラトプス
const HERA = "BS01-058" // ヘラクレス・ジオ（3コア=BP6000）
const BEET = "BS01-050" // ビートビートル（1コア=BP1000）
assert(
    getCard(WALL).name === "ウィンドウォール" && getCard(LEAP).name === "ソウルリープ" && getCard(DEADLY).name === "デッドリィバランス" &&
        getCard(ROKU).name === "ロクケラトプス" && getCard(HERA).name === "ヘラクレス・ジオ" && getCard(BEET).name === "ビートビートル",
    "cardId の機械確認",
)

// p1 のメインステップ。p1 の個体は最高レベルを超えるコアを乗せ、コアを置く手（点75）を消す。残る手はマジック・アタックステップへ・ターン終了
function scene(card: string, opp: [string, number, boolean?][]): GameState {
    const s = createGame("waste", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    // 実際の対戦と同じ設定。これが無いと、的のいない除去はサーバーの検証で弾かれて合法手に出ない
    s.interactiveTargets = true
    s.turn = 5
    s.turnPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.hand = []
        p.burst = null
    }
    s.players.p1.field.spirits = [createInstance(ROKU, 1, 5)]
    s.players.p2.field.spirits = opp.map(([id, cores, rested]) => {
        const inst = createInstance(id, 1, cores)
        inst.isRested = !!rested
        return inst
    })
    s.players.p1.hand = [card]
    s.players.p1.reserve = 6
    refreshLevelAsOverrides(s)
    return s
}
const casts = (s: GameState, policy: typeof DEFAULT_POLICY) => decideAiAction(s, "p1", new Set(), policy)?.action.type === "castMagic"

console.log("=== 1. 守りのマジックを自分のメインステップで撃たない ===")
assert(casts(scene(WALL, [[HERA, 3]]), BLOCK_POLICY), "変更前の方針は撃つ（このテストが変更を検出できることの確認）")
assert(!casts(scene(WALL, [[HERA, 3]]), DEFAULT_POLICY), "既定は撃たずに相手のアタックまで持つ")

console.log("=== 2. 的のいない除去を撃たない ===")
assert(casts(scene(LEAP, [[BEET, 1]]), BLOCK_POLICY), "変更前の方針は、疲労状態の相手がいなくても撃つ（【連鎖】があるのでルール上は使える）")
assert(!casts(scene(LEAP, [[BEET, 1]]), DEFAULT_POLICY), "既定は、破壊の的（疲労状態のコスト4以下）がいなければ撃たない")
assert(casts(scene(LEAP, [[BEET, 1, true]]), DEFAULT_POLICY), "疲労状態の的がいれば撃つ")

console.log("=== 3. 自分の個体だけが壊れるお互いの破壊を撃たない ===")
assert(casts(scene(DEADLY, []), BLOCK_POLICY), "変更前の方針は相手の場が空でも撃つ")
assert(!casts(scene(DEADLY, []), DEFAULT_POLICY), "既定は撃たない")

console.log("すべてのチェックに合格しました 🎉（part1040）")
