// smoke パート1038（AI のアタックの計画。docs/design/AI_OPPONENT.md §9.v「アタックの計画の形」。CANDIDATE_POLICY の回帰テスト）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { decideAiAction } from "../../server/src/ai/index"
import { CANDIDATE_POLICY } from "../../server/src/ai/policy"

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
    s.turnPlayer = "p1"
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
const attacks = (s: GameState) => decideAiAction(s, "p1", new Set(), CANDIDATE_POLICY)?.action.type === "attack"

console.log("=== 1. 守りを残す：打点2で削り切られるのにアタックしない ===")
assert(!attacks(scene({ life: 2, units: [u(ROKU, 2)] }, { life: 5, units: [u(BEET, 1, true), u(BEET, 1, true)] })), "K=1 で回復状態が0になるのでアタックしない")

console.log("=== 2. 取り切れるなら全員で行く ===")
const p1three = [u(ROKU, 1), u(ROKU, 1), u(ROKU, 1)]
const p2wall = [u(HERA, 3), u(BEET, 1, true), u(BEET, 1, true), u(BEET, 1, true)]
assert(attacks(scene({ life: 1, units: p1three }, { life: 2, units: p2wall })), "ブロッカー1体を除いても2点残る")
assert(attacks(scene({ life: 1, units: [u(ROKU, 1), u(ROKU, 1), u(ROKU, 1, true)] }, { life: 1, units: p2wall })), "2b: 1体疲労・相手ライフ1でも取り切れる")

console.log("=== 3. 返り討ち ===")
assert(!attacks(scene({ life: 5, units: [u(ROKU, 2), u(ROKU, 2)] }, { life: 5, units: [u(HERA, 3)] })), "相手のブロッカーのBPが上ならアタックしない")

console.log("=== 4. BP で勝てるなら行く ===")
assert(attacks(scene({ life: 5, units: [u(ROKU, 2), u(ROKU, 2)] }, { life: 5, units: [u(BEET, 1)] })), "ブロッカーのBPが低く、守り手も残る")

console.log("=== 5. 疲労状態でブロックできる個体を数える ===")
assert(!attacks(scene({ life: 5, units: [u(ROKU, 2), u(ROKU, 2)] }, { life: 5, units: [u(RHINO, 4, true)] })), "疲労したライノゴルド（BP6000）はブロッカー")

console.log("=== 6. 相打ち ===")
assert(!attacks(scene({ life: 5, units: [u(ROKU, 2), u(ROKU, 2)] }, { life: 5, units: [u(ROKU, 2)] })), "同じBPは相打ちなのでアタックしない")

console.log("すべてのチェックに合格しました 🎉（part1038）")
