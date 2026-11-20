// アタックの計画（docs/design/AI_OPPONENT.md §9.v）。自分のアタックステップで手を選ぶたびに今の盤面から立て直すので、
// バトルが1つ終わるたびに見直しになる。基準（BURST_POLICY）を動かさないため、scoreMove は変えずに手を引いてから pickBestMove に渡す
import type { CardInstance, GameView, PlayerId } from "../type"
import { canBlock } from "../../../shared/block"
import { effectiveBp } from "../../../shared/rules"
import { instanceSymbolCount } from "../../../shared/rules/symbols"
import { pickBestMove } from "./evaluate"
import type { AiMove } from "./legalMoves"

const env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env
const EXTRA_SUMMON = env.BS_AI_PLAN_SUMMON === undefined ? 2 : Number(env.BS_AI_PLAN_SUMMON) || 0

const other = (pid: PlayerId): PlayerId => (pid === "p1" ? "p2" : "p1")

// 大きい順に並べた数の列から上 k 個を除いた合計
export function restAfterTop(values: number[], k: number): number {
    return [...values].sort((a, b) => b - a).slice(k).reduce((s, v) => s + v, 0)
}

export type AttackPlan = { lethal: boolean; allowed: Set<string> }

// ponytail: 相手の手札の守り・伏せたバースト・自分の守り手と相手のアタッカーの BP の比較は数えない（§9.v の後回し）
export type PlanOptions = { desperate?: boolean; coreSummon?: number }

export function planAttacks(view: GameView, me: PlayerId, attackerIds: string[], opts: PlanOptions = {}): AttackPlan {
    const opp = other(me)
    const mine = view.players[me]
    const theirs = view.players[opp]
    const attackers = attackerIds
        .map((id) => mine.field.spirits.find((s) => s.instanceId === id))
        .filter((s): s is CardInstance => s !== undefined)
    const blockersOf = (a: CardInstance) => theirs.field.spirits.filter((b) => canBlock(view, opp, b, me, a) === null)
    const blockerCount = theirs.field.spirits.filter((b) => attackers.some((a) => canBlock(view, opp, b, me, a) === null)).length
    const through = restAfterTop(attackers.map(instanceSymbolCount), blockerCount)
    const lethal = through >= theirs.life
    if (lethal) return { lethal, allowed: new Set(attackerIds) }

    // 次の相手のターンは相手の全スピリットが回復してアタックしてくる。上から k 体止めれば残りがライフ未満になる最小の k
    const threats = theirs.field.spirits.map(instanceSymbolCount)
    // 相手が次のターンに出す分を「手札の枚数まで最大2体・シンボル1つずつ」と見積もる。基準との 1200局：0体 49.9%・1体 52.0〜53.5%・2体 54.5〜57.9%・3体 56.3%・上限なし 52.3%（2026-11-20）
    // ponytail: 手札とコアからは数えない。BS_AI_PLAN_SUMMON で体数を上書きして測る
    // coreSummon：相手が次のターンに使えるコア（リザーブ＋トラッシュ＋コアステップの1＋このターンこちらが取りうるライフ）を1体あたりのコアで割った数が多ければ見込みを増やす。下限は EXTRA_SUMMON
    const byCores = opts.coreSummon ? Math.floor((theirs.reserve + theirs.trashCores + 1 + through) / opts.coreSummon) : 0
    for (let i = 0; i < Math.min(Math.max(EXTRA_SUMMON, byCores), theirs.handCount ?? 0); i++) threats.push(1)
    let need = 0
    while (need < threats.length && restAfterTop(threats, need) >= mine.life) need++
    const idle = mine.field.spirits.filter((s) => !s.isRested).length
    // 全員残しても相手の場の個体だけで次のターンに削り切られるなら、守っても負けるので全員で行く（召喚の見込みは入れない）
    if (opts.desperate && restAfterTop(theirs.field.spirits.map(instanceSymbolCount), idle) >= mine.life) return { lethal, allowed: new Set(attackerIds) }
    const allowed = new Set<string>()
    if (idle - 1 < need) return { lethal, allowed }
    for (const a of attackers) {
        const bp = effectiveBp(view, me, a)
        if (blockersOf(a).every((b) => effectiveBp(view, opp, b) < bp)) allowed.add(a.instanceId)
    }
    return { lethal, allowed }
}

const passesAttackStep = (m: AiMove | null): boolean => m?.action.type === "endTurn" || m?.action.type === "nextPhase"

export function planPick(view: GameView, me: PlayerId, moves: AiMove[], opts: PlanOptions = {}): AiMove | null {
    const attacks = moves.filter((m) => m.action.type === "attack")
    if (attacks.length === 0 || view.turnPlayer !== me) return pickBestMove(view, me, moves)
    const ids = attacks.map((m) => (m.action as { instanceId: string }).instanceId)
    const plan = planAttacks(view, me, ids, opts)
    const isAllowed = (m: AiMove) => m.action.type !== "attack" || plan.allowed.has((m.action as { instanceId: string }).instanceId)
    // アタックしなければならない効果（強制アタック）があると endTurn が合法手に無く、計画で全部引くと手が無くなる。そのときは引かない
    const kept = moves.filter(isAllowed)
    if (kept.length === 0) return pickBestMove(view, me, moves)
    const pick = pickBestMove(view, me, kept)
    if (!passesAttackStep(pick)) return pick
    return pickBestMove(view, me, attacks.filter(isAllowed)) ?? pick
}

