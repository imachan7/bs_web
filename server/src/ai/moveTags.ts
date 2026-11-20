// マジック・起動能力に「何をする効果か」のタグを付け、無意味な手を足切りする。
//
// タグはカードの構造化された効果（action の木）の形だけから付ける。カード ID では分岐しない。
// 木の読み方は粗く、迷ったら unknown に倒す（unknown は低い点で打つだけで、足切りはしない）。
import type { EffectAction, GameView, PlayerId } from "../type"
import { getCard } from "../logic/GameState"
import type { AiMove } from "./legalMoves"

export type MoveTag = "battleOnly" | "removal" | "buffOwn" | "draw" | "unknown"

export interface MoveTags {
    tags: MoveTag[]
    // BP+ 系の最大加算量。バトルで逆転できるかの判定に使う（0＝BP+ を含まない）
    bpPlus: number
}

// 「このバトルの間」だけ意味を持つ効果。バトルが無ければ何も起きない
const BATTLE_SCOPED = new Set([
    "lendSelfThisBattle",
    "endBattle",
    "skipBpCompare",
    "swapBattler",
    "endAttackStepAfterBattle",
    "negateLifeDamageFromTarget",
])

// 木の葉ごとのタグ。null は判断に影響しない部品（自分を場に貸すだけ等）
function leafTags(a: EffectAction, out: MoveTag[], bp: { max: number }): void {
    const x = a as Record<string, any>
    switch (x.type) {
        case "sequence":
            for (const s of x.actions) leafTags(s, out, bp)
            return
        case "if":
            leafTags(x.then, out, bp)
            if (x.else) leafTags(x.else, out, bp)
            return
        case "pay":
            leafTags(x.then, out, bp)
            return
        case "chooseActionMode":
            for (const m of x.modes) for (const s of m.actions) leafTags(s, out, bp)
            return
        case "lendSelfThisTurn":
            return
        case "timedEffect": {
            if (x.duration === "battle") {
                const bpc = (x.content as { type: string; amount?: number }[]).find((c) => c.type === "bp")
                if (bpc && typeof bpc.amount === "number" && bpc.amount > 0) bp.max = Math.max(bp.max, bpc.amount)
                out.push("battleOnly")
                return
            }
            const bpContent = (x.content as { type: string; amount?: number }[]).find((c) => c.type === "bp")
            if (bpContent && typeof bpContent.amount === "number") {
                if (bpContent.amount > 0) {
                    out.push("buffOwn")
                    bp.max = Math.max(bp.max, bpContent.amount)
                } else out.push("removal")
                return
            }
            out.push("unknown")
            return
        }
        case "destroy":
            out.push(x.asCost || x.side === "own" ? "unknown" : "removal")
            return
        case "destroyBrave":
            out.push(x.side === "own" ? "unknown" : "removal")
            return
        case "exhaust":
        case "return":
            out.push(x.side === "own" || x.target === "self" ? "unknown" : "removal")
            return
        case "removeCores":
            out.push(x.side === "own" ? "unknown" : "removal")
            return
        case "bpMinus":
            out.push("removal")
            return
        case "refresh":
            out.push("buffOwn")
            return
        case "draw":
        case "placeCores":
            out.push("draw")
            return
        default:
            out.push(BATTLE_SCOPED.has(x.type) ? "battleOnly" : "unknown")
    }
}

export function tagsOfAction(actions: EffectAction[]): MoveTags {
    const out: MoveTag[] = []
    const bp = { max: 0 }
    for (const a of actions) leafTags(a, out, bp)
    // 葉がすべて battleOnly のときだけ battleOnly（一部でもバトル外で働くなら足切りしない）
    const rest = out.filter((t) => t !== "battleOnly")
    const tags: MoveTag[] = out.length === 0 ? ["unknown"] : rest.length === 0 ? ["battleOnly"] : [...new Set(rest)]
    return { tags, bpPlus: bp.max }
}

// マジックを timing の側の効果で使うときのタグ
export function magicTags(cardId: string, timing: "main" | "flash"): MoveTags {
    const actions = getCard(cardId).effects.flatMap((e) => (e.kind === "magic" && e.timing === timing ? [e.action] : []))
    return tagsOfAction(actions)
}

// アクションの木のどこかが条件に合うか（葉の type と行き先を効果データから読む）
export function anyNode(a: unknown, pred: (x: Record<string, any>) => boolean): boolean {
    if (Array.isArray(a)) return a.some((v) => anyNode(v, pred))
    if (a === null || typeof a !== "object") return false
    const x = a as Record<string, any>
    return pred(x) || Object.values(x).some((v) => anyNode(v, pred))
}

// セットするバーストの種類。守り＝ライフを増やす（placeCores の行き先が life）か、同じカードのフラッシュ効果が
// アタックステップを終える（thenPay で追加発揮できる）。判定は効果データの type と行き先だけで、カード ID は見ない
export type BurstKind = "removal" | "guard" | "buffOwn" | "draw" | "other"
export function burstKind(cardId: string): BurstKind {
    const effects = getCard(cardId).effects
    const burst = effects.filter((e) => e.kind === "burst")
    const tags = burst.flatMap((e) => tagsOfAction([e.action]).tags)
    if (tags.includes("removal")) return "removal"
    const guard =
        burst.some((e) => anyNode(e.action, (x) => x.type === "placeCores" && x.to === "life")) ||
        (burst.some((e) => e.thenPay === "flash") && effects.some((e) => e.kind === "magic" && e.timing === "flash" && anyNode(e.action, (x) => x.type === "endAttackStepAfterBattle")))
    if (guard) return "guard"
    return tags.includes("buffOwn") ? "buffOwn" : tags.includes("draw") ? "draw" : "other"
}

// セットするバーストの良し悪し（除去 > 自分を強く > ドロー > その他）。守りの位置は BURST_RANK で決める
const BURST_RANK: Record<BurstKind, number> = { removal: 3, guard: 3, buffOwn: 2, draw: 1, other: 0 }
// 守りは自分のライフが少ないほど価値が上がる（ライフ5以上で除去と同格、4以下で除去の上、2以下でほかのどの種類よりも上）
export const GUARD_RANK_LOW_LIFE = 4
export const GUARD_RANK_CRITICAL_LIFE = 5
export function burstRank(cardId: string, life: number): number {
    const kind = burstKind(cardId)
    if (kind !== "guard") return BURST_RANK[kind]
    return life <= 2 ? GUARD_RANK_CRITICAL_LIFE : life <= 4 ? GUARD_RANK_LOW_LIFE : BURST_RANK.guard
}

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// 相手の場に removal の的になりうるものがいるか
export function opponentHasTargets(view: GameView, me: PlayerId): boolean {
    const f = view.players[opponentOf(me)].field
    return f.spirits.length + f.nexuses.length > 0
}

// 打っても何も起きない手を合法手から落とす。タグの無い手（pass・nextPhase・endTurn・選択）は触らない。
// 全部落ちてしまうなら何も落とさない（合法手を1つ以上残す）
export function pruneMoves(view: GameView, me: PlayerId, moves: AiMove[]): AiMove[] {
    const mine = view.players[me].field.spirits.length > 0
    const dead = (t: MoveTag): boolean =>
        t === "battleOnly" ? !view.battle : t === "removal" ? !opponentHasTargets(view, me) : t === "buffOwn" ? !mine : false
    // 複数のタグを持つ手は、すべてのタグが空振りのときだけ落とす
    const kept = moves.filter((m) => !m.tags || !m.tags.tags.every(dead))
    return kept.length > 0 ? kept : moves
}
