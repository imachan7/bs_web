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
