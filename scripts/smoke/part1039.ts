// smoke パート1039（AI がブロックかライフで受けるかを、アタッカーのシンボル数と残りのアタックで決める。server/src/ai/blockPlan.ts）
import { handleAction, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { CANDIDATE_POLICY } from "../../server/src/ai/policy"
import { planPick } from "../../server/src/ai/attackPlan"
import { enumerateLegalMoves } from "../../server/src/ai/legalMoves"
import { viewFor } from "../../server/src/logic/GameState"

const ROKU = "BS01-002" // ロクケラトプス（1コア=BP1000・2コア=BP3000）
const HERA = "BS01-058" // ヘラクレス・ジオ（3コア=BP6000）
const BEET = "BS01-050" // ビートビートル（1コア=BP1000）
const RHINO = "SD11-004" // ライノゴルド（無条件で疲労状態でブロックできる。4コア=BP6000）

const bpAt = (id: string, cores: number) => [...getCard(id).levels].reverse().find((l) => l.cores <= cores)!.bp
for (const id of [ROKU, HERA, BEET, RHINO]) assert(getCard(id).type === "spirit" && getCard(id).symbol?.length === 1, `${id} はシンボル1つのスピリット`)
assert(getCard(ROKU).name === "ロクケラトプス" && bpAt(ROKU, 2) === 3000, "ロクケラトプス 2コア=3000")
assert(getCard(HERA).name === "ヘラクレス・ジオ" && bpAt(HERA, 3) === 6000, "ヘラクレス・ジオ 3コア=6000")
assert(getCard(BEET).name === "ビートビートル" && bpAt(BEET, 1) === 1000, "ビートビートル 1コア=1000")
assert(getCard(RHINO).name === "ライノゴルド" && bpAt(RHINO, 4) === 6000, "ライノゴルド 4コア=6000")
assert(JSON.stringify(getCard(RHINO).effects[0]) .includes('"canBlockWhileRested"') && !JSON.stringify(getCard(RHINO).effects[0]).includes("filter"), "ライノゴルドの疲労ブロックは無条件")

type Unit = { id: string; cores: number; rested?: boolean }

function scene(p1: { life: number; units: Unit[] }, p2: { life: number; units: Unit[] }): GameState {
    const s = createGame("plan", { p1: "A", p2: "B" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 5
    s.turnPlayer = "p2"
    s.phase = "attack"
    for (const [pid, side] of [["p1", p1], ["p2", p2]] as const) {
        const p = s.players[pid]
        p.life = side.life
        p.reserve = 0
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.field.spirits = side.units.map((u) => {
            const inst = createInstance(u.id, 1, u.cores)
            inst.isRested = !!u.rested
            return inst
        })
    }
    refreshLevelAsOverrides(s)
    return s
}
const u = (id: string, cores: number, rested = false): Unit => ({ id, cores, rested })

// p2 の先頭の個体でアタックさせ、p1 がブロックかライフかを決める手を返す（フラッシュの間は両者パス）
function defense(s: GameState): string | undefined {
    assert(handleAction(s, "p2", { type: "attack", instanceId: s.players.p2.field.spirits[0]!.instanceId }) === null, "p2 のアタックが通る")
    for (let i = 0; i < 10; i++) {
        const m = decideAiAction(s, "p1", new Set(), CANDIDATE_POLICY)
        if (m && (m.action.type === "block" || m.action.type === "takeLife")) return m.action.type
        const pid = m ? "p1" : "p2"
        const mv = m ?? decideAiAction(s, "p2", new Set(), CANDIDATE_POLICY)
        if (!mv || handleAction(s, pid, mv.action) !== null) return undefined
    }
    return undefined
}

console.log("=== 1. 受けると残りのアタックで負ける：ブロックする ===")
// ライフ3・アタッカー1シンボル。受けると2、残り3体のうち1体を止めても2点通って0になる
assert(defense(scene({ life: 3, units: [u(ROKU, 1)] }, { life: 5, units: [u(HERA, 3), u(BEET, 1), u(BEET, 1), u(BEET, 1)] })) === "block", "負けるならBPで負けるブロッカーでも止める")

console.log("=== 2. 受けても負けない：ライフで受ける ===")
assert(defense(scene({ life: 5, units: [u(ROKU, 1)] }, { life: 5, units: [u(HERA, 3)] })) === "takeLife", "残りのアタックが無くライフ5なら、負けるブロックはせず受ける")
assert(defense(scene({ life: 2, units: [u(ROKU, 1)] }, { life: 5, units: [u(HERA, 3)] })) === "takeLife", "ライフ2でも、この1点で終わりなら受けて資源にする")

console.log("=== 3. BP で勝てるブロッカーがいればブロックする ===")
assert(defense(scene({ life: 5, units: [u(HERA, 3)] }, { life: 5, units: [u(ROKU, 1)] })) === "block", "一方的に倒せるならブロック")

console.log("すべてのチェックに合格しました 🎉（part1039）")
