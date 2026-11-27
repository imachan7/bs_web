// smoke パート1075（アルティメットの土台 段5：TargetFilter の kinds。docs/design/ULTIMATE.md §2.2・ULTIMATE_PLAN B1）
// 省略時は ["spirit"]＝「スピリット」と書いた効果はアルティメットに当たらない。kinds に "ultimate" を書いたときだけ当たる
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"
import { CARD_DB } from "../../server/src/logic/GameState"
import { countEffectCounter } from "../../server/src/logic/EffectModules"

const BASE = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。Lv1 BP1000）
const ULT = "TEST-K01" // BP5000 のアルティメット（偽）
const HIGH = "TEST-K02" // BP5000 のスピリット（偽）
const lv = (bp: number) => [{ level: 1, cores: 1, bp }, { level: 2, cores: 2, bp }, { level: 3, cores: 3, bp }]
CARD_DB.set(ULT, { ...getCard(BASE), cardId: ULT, type: "ultimate", levels: lv(5000) })
CARD_DB.set(HIGH, { ...getCard(BASE), cardId: HIGH, levels: lv(5000) })

function actionOf(cardId: string, kind: string): EffectAction {
    const e = (getCard(cardId).effects ?? []).find((x) => (x as { action?: { type?: string } }).action?.type === kind) as unknown as { action: EffectAction }
    return e.action
}

function scene(seed: string, spirits: string[]): { s: GameState; ult: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    for (const id of spirits) s.players.p2.field.spirits.push(createInstance(id, s.turn, 1))
    const ult = createInstance(ULT, s.turn, 1)
    s.players.p2.field.ultimates.push(ult)
    return { s, ult }
}

try {
    console.log("=== 前提: カードの機械確認 ===")
    assert(getCard("BS09-069").name === "フレイムガスト" && getCard("BS09-069").effect.includes("BP6000以下の相手のスピリット1体を破壊する"), "BS09-069は『BP6000以下の相手のスピリット1体を破壊する』")
    assert(getCard("BS04-099").name === "グラウンドハウリング" && getCard("BS04-099").effect.includes("BP4000以上の相手のスピリットすべてを疲労させる"), "BS04-099は『BP4000以上の相手のスピリットすべてを疲労させる』")

    console.log("=== A. 『相手のスピリット1体を破壊する』はアルティメットに当たらない ===")
    {
        const { s, ult } = scene("k-a1", [BASE])
        const src = createInstance("BS09-069", s.turn, 0)
        resolveAction(s, "p1", src, actionOf("BS09-069", "destroy"))
        assert(s.players.p2.field.ultimates.includes(ult), "BP5000のアルティメットは破壊されず場に残る")
        assert(s.players.p2.field.spirits.length === 0, "対照：スピリットは（アルティメットより低BPでも）破壊される")
    }
    {
        const { s, ult } = scene("k-a2", [])
        const src = createInstance("BS09-069", s.turn, 0)
        resolveAction(s, "p1", src, actionOf("BS09-069", "destroy"))
        assert(s.players.p2.field.ultimates.includes(ult), "対象がアルティメットしかいなければ何も壊れない")
    }

    console.log("=== B. 『相手のスピリットすべてを疲労させる』でアルティメットは疲労しない ===")
    {
        const { s, ult } = scene("k-b", [HIGH])
        const src = createInstance("BS04-099", s.turn, 0)
        resolveAction(s, "p1", src, actionOf("BS04-099", "exhaust"))
        assert(s.players.p2.field.spirits[0]!.isRested === true, "対照：BP5000のスピリットは疲労する")
        assert(ult.isRested === false, "アルティメットは疲労しない")
    }

    console.log("=== C. kinds:[spirit, ultimate] を書くとアルティメットも対象 ===")
    {
        const { s, ult } = scene("k-c1", [BASE])
        const src = createInstance("BS09-069", s.turn, 0)
        resolveAction(s, "p1", src, { type: "destroy", count: 1, filter: { maxBp: 6000, kinds: ["spirit", "ultimate"] } })
        assert(!s.players.p2.field.ultimates.includes(ult), "高BPのアルティメットが候補に入り破壊される")
        assert(s.players.p2.field.spirits.length === 1, "選ばれなかったスピリットは残る")
    }
    {
        const { s, ult } = scene("k-c2", [HIGH])
        const src = createInstance("BS04-099", s.turn, 0)
        resolveAction(s, "p1", src, { type: "exhaust", count: 1, all: true, filter: { minBp: 4000, kinds: ["spirit", "ultimate"] } })
        assert(ult.isRested === true && s.players.p2.field.spirits[0]!.isRested === true, "範囲の疲労はアルティメットにも及ぶ")
    }
    {
        const { s, ult } = scene("k-c3", [HIGH])
        const src = createInstance("BS09-069", s.turn, 0)
        resolveAction(s, "p1", src, { type: "destroy", count: 1, filter: { kinds: ["ultimate"] } })
        assert(!s.players.p2.field.ultimates.includes(ult) && s.players.p2.field.spirits.length === 1, "kinds:[ultimate] だけならスピリットは当たらない")
    }

    console.log("=== D. counter ownSpirits は kinds を受ける ===")
    {
        const { s } = scene("k-d", [BASE, HIGH])
        const count = (kinds?: ("spirit" | "ultimate")[]) => countEffectCounter(s, "p2", null, { ownSpirits: kinds ? { kinds } : {} }, undefined)
        assert(count() === 2, "kinds 省略はスピリットだけ（2）")
        assert(count(["ultimate"]) === 1, "kinds:[ultimate] はアルティメットの数（1）")
        assert(count(["spirit", "ultimate"]) === 3, "両方なら3")
    }
} finally {
    CARD_DB.delete(ULT)
    CARD_DB.delete(HIGH)
}

console.log("すべてのチェックに合格しました 🎉（part1075）")
