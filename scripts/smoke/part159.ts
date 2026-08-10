// smoke パート159（BS08竜騎集う円卓Lv2：手札1枚を破棄して効果を受けない）
//
// これまでの耐性と違い、**コストを払う＝副作用がある**耐性。素直に純粋述語へ足すと、
// 候補フィルタが1体ごとに呼ぶため手札が溶ける。そこで2段に分けた:
//   - 候補列挙（pickEnemy* が EffectAttempt.probing を立てる）→ **防がない**＝対象にはなる
//   - 実際に適用する1点（probing なし）→ ここで初めて手札を破棄して防ぐ
// 実際のルールも「対象にはなる → そのあと受けない」なので、この順序が原作に合う。
//
// probing の向きに注意: **既定が「適用する」側**。立て忘れると払いすぎる＝ここが落ちる。
// 逆向きだと立て忘れが「耐性が無言で効かない」になり検出できない。
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { pickEnemyCandidates, resistanceAgainst } from "../../server/src/logic/EffectModules"
import type { EffectAttempt } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    family?: string[]
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

const TABLE = CARDS.find((c) => (c.effects ?? []).some((e) => e["kind"] === "targetNegateByHandDiscard"))!
const ENTRY = (TABLE.effects ?? []).find((e) => e["kind"] === "targetNegateByHandDiscard")!
const FAMILIES = ENTRY["familyFilter"] as string[]
const LV2_CORES = TABLE.levels?.find((l) => l.level === 2)?.cores ?? 1
// 守られる系統を持つスピリットと、持たないスピリット
const GUARDED = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).some((f) => FAMILIES.includes(f)))!
const OTHER = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).length === 0 && !(c.family ?? []).some((f) => FAMILIES.includes(f)),
)!

// p2 が円卓の持ち主。『自分のアタックステップ』なので p2 をターンプレイヤーにする
function base(seed: string, opts?: { withTable?: boolean; cores?: number }): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.players.p2.hand = [OTHER.cardId, OTHER.cardId, OTHER.cardId]
    if (opts?.withTable !== false) {
        const nexus = createInstance(TABLE.cardId, s.turn, opts?.cores ?? LV2_CORES)
        s.players.p2.field.nexuses.push(nexus)
    }
    refreshLevelAsOverrides(s)
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 3)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// p1 のスピリットの効果が、p2 のスピリット1体を対象にする
const TARGETED: EffectAttempt = { op: "destroy", scope: "targeted", actorPid: "p1", sourceType: "spirit", sourceColors: ["red"] }

console.log("=== 対象になると手札1枚を破棄して効果を受けない ===")
{
    const s = base("table-negate")
    const guarded = put(s, "p2", GUARDED.cardId)
    const handBefore = s.players.p2.hand.length
    const trashBefore = s.players.p2.trashCards.length

    const r = resistanceAgainst(s, "p2", guarded, TARGETED)
    assert(r?.category === "paidNegate", `${GUARDED.name}は効果を受けなかった`)
    assert(s.players.p2.hand.length === handBefore - 1, "手札を1枚破棄した")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "破棄したカードはトラッシュへ")
}

console.log("=== 候補を数えるだけ（probing）では払わない＝対象にはなる ===")
{
    const s = base("table-probe")
    put(s, "p2", GUARDED.cardId)
    put(s, "p2", GUARDED.cardId)
    const handBefore = s.players.p2.hand.length

    const candidates = pickEnemyCandidates(s, "p2", Infinity, undefined, ["red"], "spirit")
    assert(candidates.length === 2, "2体とも候補に残る（対象にはなるため）")
    assert(s.players.p2.hand.length === handBefore, "候補を数えただけでは手札が減らない")
}

console.log("=== 効果文の限定 ===")
{
    // 守られる系統を持たないスピリット
    const s1 = base("table-family")
    const other = put(s1, "p2", OTHER.cardId)
    const hand1 = s1.players.p2.hand.length
    assert(resistanceAgainst(s1, "p2", other, TARGETED) === null, `系統「${FAMILIES.join("・")}」を持たなければ守られない`)
    assert(s1.players.p2.hand.length === hand1, "手札も減らない")

    // 範囲効果（「効果の**対象**になるたび」なので範囲は対象外）
    const s2 = base("table-area")
    const guarded2 = put(s2, "p2", GUARDED.cardId)
    const hand2 = s2.players.p2.hand.length
    assert(resistanceAgainst(s2, "p2", guarded2, { ...TARGETED, scope: "area" }) === null, "範囲効果は防がない")
    assert(s2.players.p2.hand.length === hand2, "範囲効果では手札を払わない")

    // 相手の**スピリット**の効果限定
    const s3 = base("table-magic")
    const guarded3 = put(s3, "p2", GUARDED.cardId)
    assert(
        resistanceAgainst(s3, "p2", guarded3, { ...TARGETED, sourceType: "magic" }) === null,
        "マジックの効果は防がない",
    )

    // Lv1（levels:[2] 指定）
    const s4 = base("table-lv1", { cores: 0 })
    const guarded4 = put(s4, "p2", GUARDED.cardId)
    assert(resistanceAgainst(s4, "p2", guarded4, TARGETED) === null, "Lv1では発揮しない")

    // 『自分のアタックステップ』以外
    const s5 = base("table-phase")
    s5.phase = "main"
    const guarded5 = put(s5, "p2", GUARDED.cardId)
    assert(resistanceAgainst(s5, "p2", guarded5, TARGETED) === null, "アタックステップ以外では発揮しない")

    const s6 = base("table-turn")
    s6.turnPlayer = "p1" // 持ち主のアタックステップではない
    const guarded6 = put(s6, "p2", GUARDED.cardId)
    assert(resistanceAgainst(s6, "p2", guarded6, TARGETED) === null, "相手のターンでは発揮しない")

    // 手札が無ければ支払えない＝受ける
    const s7 = base("table-nohand")
    s7.players.p2.hand = []
    const guarded7 = put(s7, "p2", GUARDED.cardId)
    assert(resistanceAgainst(s7, "p2", guarded7, TARGETED) === null, "手札が無ければ支払えないので効果を受ける")
}

console.log("=== 元々防げる対象化では手札を払わない（判定の順序） ===")
{
    const s = base("table-order")
    const guarded = put(s, "p2", GUARDED.cardId)
    guarded.immuneToOpponentThisTurn = true // 盤面だけで決まる耐性が先に成立する
    const handBefore = s.players.p2.hand.length

    const r = resistanceAgainst(s, "p2", guarded, TARGETED)
    assert(r?.category === "fullImmune", "盤面の耐性で防がれる")
    assert(s.players.p2.hand.length === handBefore, "無駄に手札を払わない（コスト付きは最後に判定する）")
}
