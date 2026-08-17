// smoke パート218（【強襲】で疲労させるネクサスを持ち主が選ぶ。2026-08-17 ユーザー確認）
//
// docs/design/PROCEDURES_AUDIT.md §4 の棚卸しで見つけた「対戦者が選べていない」箇所のうち、
// 影響カード枚数が最大（11枚）のもの。従来は**コア数最少のネクサスに固定**されていた。
//
// 効果文（BS07 以降の【強襲】）：
//   「自分の回復状態のネクサス1つを疲労させることで、このスピリットを回復する」
// 「1つを疲労させる」＝どれを疲労させるかは持ち主が選ぶ。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { resolveAction } from "../../server/src/logic/EffectModules"

const KYOSHU = "BS07-051" // 天斧の勇者カイオー（【強襲】持ち）
const NEXUS_A = "BS01-101" // 古龍の縄張り
const NEXUS_B = "BS06-073" // 灼熱の谷

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const kws = getCard(KYOSHU).effects.filter((e) => e.kind === "keyword").map((e) => (e.kind === "keyword" ? e.keyword : ""))
    assert(kws.includes("kyoshu"), `${KYOSHU} は【強襲】を持つ（${getCard(KYOSHU).name}）`)
    assert(getCard(NEXUS_A).type === "nexus" && getCard(NEXUS_B).type === "nexus", "ネクサス2種を使う")
}

// 疲労状態の【強襲】持ちと、回復状態のネクサス2つ（コア数を変えて、自動選択との差が見えるようにする）
function setup(interactive: boolean): GameState {
    const s = createGame(`kyoshu-${interactive}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turnPlayer = "p1"
    s.phase = "attack"
    const spirit = createInstance(KYOSHU, s.turn, 6)
    spirit.isRested = true // 【強襲】は疲労状態から回復するための効果
    s.players.p1.field.spirits.push(spirit)
    s.players.p1.field.nexuses.push(createInstance(NEXUS_A, s.turn, 1)) // コア1個（＝従来の自動選択で選ばれる側）
    s.players.p1.field.nexuses.push(createInstance(NEXUS_B, s.turn, 3)) // コア3個
    return s
}

console.log("=== 実対戦：どのネクサスを疲労させるか聞かれる（ここが直った点） ===")
{
    const s = setup(true)
    const spirit = s.players.p1.field.spirits[0]
    assert(spirit !== undefined, "【強襲】持ちが場にいる")
    if (spirit !== undefined) {
        resolveAction(s, "p1", spirit, { type: "refreshSelfByExhaustNexus" })
        assert(s.pendingChoice !== null, "疲労させるネクサスを聞かれる")
        assert(s.pendingChoice?.kind === "target", "盤面の個体から選ぶ")
        assert(s.pendingChoice?.pid === "p1", "選ぶのは持ち主")
        assert(s.pendingChoice?.optional === false, "発動した以上どれかは疲労させる（スキップ不可）")
        assert((s.pendingChoice?.candidates ?? []).length === 2, "回復状態のネクサス2つが候補")

        // 従来の自動選択では選ばれなかった側（コアが多い灼熱の谷）を選べる
        const heavy = s.players.p1.field.nexuses.find((n) => n.cardId === NEXUS_B)
        assert(heavy !== undefined, "灼熱の谷が場にある")
        if (heavy !== undefined) {
            assert(act(s, "p1", { type: "resolveChoice", instanceId: heavy.instanceId }) === null, "コアが多い側を選ぶ")
            assert(heavy.isRested, "選んだネクサスが疲労した")
            const light = s.players.p1.field.nexuses.find((n) => n.cardId === NEXUS_A)
            assert(light !== undefined && !light.isRested, "選ばなかったネクサスは疲労していない")
            assert(!spirit.isRested, "【強襲】持ちは回復した")
        }
    }
}

console.log("=== 候補が1つなら聞かない ===")
{
    const s = setup(true)
    const only = s.players.p1.field.nexuses[0]
    s.players.p1.field.nexuses = only !== undefined ? [only] : []
    const spirit = s.players.p1.field.spirits[0]
    if (spirit !== undefined && only !== undefined) {
        resolveAction(s, "p1", spirit, { type: "refreshSelfByExhaustNexus" })
        assert(s.pendingChoice === null, "1つしかないので聞かれない")
        assert(only.isRested && !spirit.isRested, "そのネクサスが疲労して回復した")
    }
}

console.log("=== 非対話（テスト）は従来どおりコア数最少を自動で選ぶ ===")
{
    const s = setup(false)
    const spirit = s.players.p1.field.spirits[0]
    if (spirit !== undefined) {
        resolveAction(s, "p1", spirit, { type: "refreshSelfByExhaustNexus" })
        assert(s.pendingChoice === null, "選択待ちにならない")
        const light = s.players.p1.field.nexuses.find((n) => n.cardId === NEXUS_A)
        assert(light !== undefined && light.isRested, "コア数最少のネクサスが疲労した")
        assert(!spirit.isRested, "【強襲】持ちは回復した")
    }
}
