// アタックの計画（docs/design/AI_OPPONENT.md §9.v）。自分のアタックステップで手を選ぶたびに今の盤面から立て直すので、
// バトルが1つ終わるたびに見直しになる。基準（BURST_POLICY）を動かさないため、scoreMove は変えずに手を引いてから pickBestMove に渡す
import type { CardInstance, GameView, PlayerId } from "../type"
import { canBlock } from "../../../shared/block"
import { effectiveBp, instLevels } from "../../../shared/rules"
import { instanceSymbolCount } from "../../../shared/rules/symbols"
import { battlers, instMinLevelCores } from "../../../shared/rules/level"
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
        .map((id) => battlers(mine).find((s) => s.instanceId === id))
        .filter((s): s is CardInstance => s !== undefined)
    const blockersOf = (a: CardInstance) => battlers(theirs).filter((b) => canBlock(view, opp, b, me, a) === null)
    const blockerCount = battlers(theirs).filter((b) => attackers.some((a) => canBlock(view, opp, b, me, a) === null)).length
    const through = restAfterTop(attackers.map(instanceSymbolCount), blockerCount)
    const lethal = through >= theirs.life
    // シンボル0はライフを減らせず、相手もブロックしないので、取り切れる局面でも出さない（2026-11-22 ユーザー指示）
    const hits = (): Set<string> => new Set(attackers.filter((a) => instanceSymbolCount(a) > 0).map((a) => a.instanceId))
    if (lethal) return { lethal, allowed: hits() }

    // 次の相手のターンは相手の全スピリットが回復してアタックしてくる。上から k 体止めれば残りがライフ未満になる最小の k
    const threats = battlers(theirs).map(instanceSymbolCount)
    // 相手が次のターンに出す分を「手札の枚数まで最大2体・シンボル1つずつ」と見積もる。基準との 1200局：0体 49.9%・1体 52.0〜53.5%・2体 54.5〜57.9%・3体 56.3%・上限なし 52.3%（2026-11-20）
    // ponytail: 手札とコアからは数えない。BS_AI_PLAN_SUMMON で体数を上書きして測る
    // coreSummon：相手が次のターンに使えるコア（リザーブ＋トラッシュ＋コアステップの1＋このターンこちらが取りうるライフ）を1体あたりのコアで割った数が多ければ見込みを増やす。下限は EXTRA_SUMMON
    const byCores = opts.coreSummon ? Math.floor((theirs.reserve + theirs.trashCores + 1 + through) / opts.coreSummon) : 0
    for (let i = 0; i < Math.min(Math.max(EXTRA_SUMMON, byCores), theirs.handCount ?? 0); i++) threats.push(1)
    let need = 0
    while (need < threats.length && restAfterTop(threats, need) >= mine.life) need++
    const idle = battlers(mine).filter((s) => !s.isRested).length
    // 全員残しても相手の場の個体だけで次のターンに削り切られるなら、守っても負けるので全員で行く（召喚の見込みは入れない）
    if (opts.desperate && restAfterTop(battlers(theirs).map(instanceSymbolCount), idle) >= mine.life) return { lethal, allowed: hits() }
    const allowed = new Set<string>()
    if (idle - 1 < need) return { lethal, allowed }
    for (const a of attackers) {
        const bp = effectiveBp(view, me, a)
        if (instanceSymbolCount(a) > 0 && blockersOf(a).every((b) => effectiveBp(view, opp, b) < bp)) allowed.add(a.instanceId)
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


const planScore = (p: AttackPlan): number => (p.lethal ? 1000 : p.allowed.size)

// アタックステップに入る前のレベルの調整（§9.v）。リザーブと、ほかのスピリットの Lv1 を超える余りのコアを1体に集めると、計画（取り切れる・行ける個体の数）が
// 良くなるなら、その移し替えの1手目を返す（リザーブにあれば置く、無ければ余りのある個体から外す）。手を選ぶたびに今の盤面から計算し直すので、続けて打たれる。
// 召喚などを打ち終えて、基の方針が「アタックステップへ」かコアを置く手を選んだときだけ見る（召喚の邪魔をしない）。
// ponytail: 外した個体の BP が下がって次の相手のターンの守りが弱くなる分は数えない
export function levelPick(view: GameView, me: PlayerId, moves: AiMove[], inner: (v: GameView, m: PlayerId, mv: AiMove[]) => AiMove | null, opts: PlanOptions = {}): AiMove | null {
    const pick = inner(view, me, moves)
    if (view.phase !== "main" || view.turnPlayer !== me || (pick?.action.type !== "nextPhase" && pick?.action.type !== "moveCore")) return pick
    const mine = view.players[me]
    const idleIds = battlers(mine).filter((s) => !s.isRested).map((s) => s.instanceId)
    if (idleIds.length === 0) return pick
    const spare = (s: CardInstance) => Math.max(0, s.cores - instMinLevelCores(s))
    const base = planScore(planAttacks(view, me, idleIds, opts))
    let best: { target: string; donor: string | null; score: number; n: number } | null = null
    for (const target of idleIds) {
        const donors = battlers(mine).filter((s) => s.instanceId !== target && spare(s) > 0).sort((a, b) => Number(b.isRested) - Number(a.isRested) || spare(b) - spare(a))
        const supply = mine.reserve + donors.reduce((n, s) => n + spare(s), 0)
        const t = battlers(mine).find((s) => s.instanceId === target)!
        // 試すのは、目的の個体が上のレベルにちょうど届く数だけ（レベルが変わらない数は BP も変わらない）
        const steps = instLevels(t).map((l) => l.cores - t.cores).filter((n) => n > 0 && n <= supply)
        for (const n of steps) {
            const v = structuredClone(view)
            const p = v.players[me]
            let left = n
            const fromReserve = Math.min(left, p.reserve)
            p.reserve -= fromReserve
            left -= fromReserve
            let firstDonor: string | null = null
            for (const d of donors) {
                if (left === 0) break
                const take = Math.min(left, spare(d))
                battlers(p).find((s) => s.instanceId === d.instanceId)!.cores -= take
                firstDonor ??= d.instanceId
                left -= take
            }
            battlers(p).find((s) => s.instanceId === target)!.cores += n
            const score = planScore(planAttacks(v, me, idleIds, opts))
            if (score > base && (!best || score > best.score || (score === best.score && n < best.n))) best = { target, donor: mine.reserve > 0 ? null : firstDonor, score, n }
        }
    }
    if (!best) return pick
    const want = best.donor === null ? { id: best.target, dir: "add" } : { id: best.donor, dir: "remove" }
    return moves.find((m) => m.action.type === "moveCore" && m.action.instanceId === want.id && m.action.direction === want.dir) ?? pick
}
