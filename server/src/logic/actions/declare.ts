// 「〜を指定する。指定した〜」（DECLARE_UNIFY.md）。指定した値で then の中の declared を置き換えてから解決する
import type { ActionHandler, ActionRegistry } from "./types"
import type { CardInstance, Color, EffectAction, PlayerId } from "../../type"
import { getCard, log } from "../GameState"
import { requestChoice } from "../EffectModules"
import { instBaseCost, instColors } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"
import { matchesPick } from "./revealAction"

type DeclareAction = Extract<EffectAction, { type: "declare" }>
type Value = string | number

const ALL_COLORS: Color[] = ["red", "purple", "green", "white", "yellow", "blue"]

// ponytail: 系統は印刷された系統だけを見る（付与された系統は候補に出ない）。付与系統を指定したいカードが出たら spiritHasFamily 側の一覧を使う
function valuesOf(what: DeclareAction["what"], inst: CardInstance): Value[] {
    if (what === "color") return instColors(inst)
    if (what === "family") return getCard(inst.cardId).family
    return [instBaseCost(inst)]
}

function labelOf(what: DeclareAction["what"], v: Value): string {
    if (what === "color") return COLOR_LABELS[v as Color]
    if (what === "cost") return `コスト${String(v)}`
    return String(v)
}

function cardValuesOf(what: DeclareAction["what"], cardId: string): Value[] {
    const card = getCard(cardId)
    if (what === "color") return card.colors
    if (what === "family") return card.family
    return [card.cost]
}

// 候補の中で pool に最も多く現れる値（同数は候補の並び順で先）。非対話（テスト・AI）の自動選択
function mostFrequent(candidates: Value[], valuesPerItem: Value[][]): Value {
    const count = (v: Value): number => valuesPerItem.filter((vs) => vs.includes(v)).length
    return candidates.reduce((best, v) => (count(v) > count(best) ? v : best))
}

// then の中の declared を実際の値に置き換える（入れ子の declare の中は触らない）
function substitute(node: unknown, what: DeclareAction["what"], values: Value[]): unknown {
    if (Array.isArray(node)) return node.map((x) => substitute(x, what, values))
    if (node === null || typeof node !== "object") return node
    const obj = node as Record<string, unknown>
    if (obj["type"] === "declare") return obj
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) if (k !== "declared") out[k] = substitute(v, what, values)
    if (obj["declared"] === "except") out["colorNotIn"] = values
    else if (obj["declared"] === "match") {
        const v = values[0]!
        if (what === "color") out["color"] = v
        else if (what === "family") out["family"] = v
        else out["cost"] = { min: v, max: v }
    }
    return out
}

const declareHandler: ActionHandler<"declare"> = (ctx, action) => {
    const { state, owner, opp, self, sourceName, chosenOption, srcColors, srcType } = ctx
    const src = { sourceColors: srcColors, sourceType: srcType }
    const choosers: PlayerId[] = action.chooser === "opponent" ? [opp] : action.chooser === "each" ? [owner, opp] : [owner]
    const zoneOf = (pid: PlayerId): CardInstance[] =>
        action.from === "nexuses" ? state.players[pid].field.nexuses : state.players[pid].field.spirits
    const candidatesFor = (pid: PlayerId): Value[] => {
        if (action.options) return action.options
        if (action.from) {
            const seen = zoneOf(pid).flatMap((i) => valuesOf(action.what, i))
            const order: Value[] = action.what === "color" ? ALL_COLORS : [...new Set(seen)]
            return order.filter((v) => seen.includes(v))
        }
        return action.what === "color" ? ALL_COLORS : []
    }

    const picked = { ...(action.picked ?? {}) }
    const next = choosers.find((pid) => picked[pid] === undefined)
    if (next !== undefined) {
        const candidates = candidatesFor(next)
        const fromOption = chosenOption !== undefined ? candidates.find((v) => labelOf(action.what, v) === chosenOption) : undefined
        if (fromOption !== undefined) {
            picked[next] = fromOption
        } else if (candidates.length === 0) {
            picked[next] = "" // 指定できる値がない側は指定なし
        } else if (candidates.length === 1 || !state.interactiveTargets) {
            // 自動選択：autoFrom があればその基準、from があれば選ぶ人の場で最多、系統は自分の場、色・コストは相手の場で最多
            if (action.autoFrom) {
                const pick = action.autoFrom.ownTrash
                const ids = state.players[next].trashCards.filter((id) => matchesPick(id, pick))
                picked[next] = mostFrequent(candidates, ids.map((id) => cardValuesOf(action.what, id)))
            } else {
                const pool = action.from
                    ? zoneOf(next)
                    : action.what === "family"
                      ? state.players[owner].field.spirits
                      : [...state.players[opp].field.spirits, ...state.players[opp].field.nexuses]
                picked[next] = mostFrequent(candidates, pool.map((i) => valuesOf(action.what, i)))
            }
        } else {
            const what = action.what === "color" ? "色" : action.what === "family" ? "系統" : "コスト"
            requestChoice(
                state,
                owner,
                `${sourceName}：${what}を1つ指定してください`,
                [],
                false,
                { ...action, picked },
                self,
                "option",
                candidates.map((v) => labelOf(action.what, v)),
                next !== owner ? next : undefined,
            )
            return
        }
        ctx.resolve({ ...action, picked }, src)
        return
    }

    const values = choosers.map((pid) => picked[pid]!).filter((v) => v !== "")
    if (values.length === 0) {
        log(state, `${sourceName}：指定できるものがなかった。`)
        return
    }
    log(state, `${sourceName}：${values.map((v) => labelOf(action.what, v)).join("・")}を指定した。`)
    ctx.resolve(substitute(action.then, action.what, values) as EffectAction, src)
}

const handlers = {
    declare: declareHandler,
} satisfies Partial<ActionRegistry>

export default handlers
