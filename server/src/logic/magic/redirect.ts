// 両陣営を対象にするマジックの対象の付け替え
import { entryActive } from "../../../../shared/rules/effectStop"
import { noteCoverage } from "../../../../shared/coverage"
import type { CardData, CardInstance, CardType, PendingChoice, EffectAction, GameState, PlayerId } from "../../type"
import { currentLevel, findInstanceAnywhere, getCard, log, opponentOf, suspend } from "../GameState"
import { effectSources } from "../../../../shared/rules"
import type { MagicUsedDecision } from "../../types/choice"
import { resolveMagicEffects } from "./resolve"

// 封印された魔導書Lv1（kind:"targetRedirect"（includes:"bothSides"））：「お互いを対象とするマジックの効果」の
// 対象を片側だけに変更する。両陣営を対象にするアクション（destroy{nexus:"only", side:"both"} / bothSidesCoreToTrash /
// bothSidesCoreToVoid / exhaust{all, anySide} / returnToHand{all, anySide} / removeCores side:"both" /
// draw / discard の side:"both"）は、ハードコードの ["p1","p2"] の代わりにこれを呼ぶ。
// beneficial=true は「受ける側にとって得な効果」（ドロー）で、そのときだけ相手を外す。
// マジック以外の発生源（スピリット・ネクサスの効果）は対象外なので、そのまま両陣営を返す
export function bothSidesPids(
    state: GameState,
    srcType: CardType | undefined,
    beneficial = false,
): PlayerId[] {
    const all: PlayerId[] = ["p1", "p2"]
    if (srcType !== "magic") return all
    const found = findBothSidesRedirectSource(state)
    if (!found) return all
    // 対話モードでは、どちらに変更するかを魔導書の持ち主に確認済み（resolveMagic が1回だけ聞く）。
    // 「変更しない」を選んでいたら両陣営のまま（『〜に変更できる』の任意性）
    const decision = state.magicSideDecision
    if (decision && decision.sourceInstanceId === found.inst.instanceId) {
        if (decision.keepPid === null) return all
        log(
            state,
            `${getCard(found.inst.cardId).name}：このマジックの効果の対象を${state.players[decision.keepPid].name}のみに変更した。`,
        )
        return [decision.keepPid]
    }
    // 決定が無い＝非対話（テスト・自動解決）なので、従来どおり持ち主に有利な側へ固定する
    const excluded = beneficial ? opponentOf(found.pid) : found.pid
    log(
        state,
        `${getCard(found.inst.cardId).name}：このマジックの効果の対象を${state.players[opponentOf(excluded)].name}のみに変更した。（どちらに変更するかは簡略化）`,
    )
    return all.filter((p) => p !== excluded)
}

// 封印された魔導書Lv1（kind:"targetRedirect"（includes:"bothSides"））の発生源を探す。
// **どちらに変更するか（あるいは変更しないか）は呼び出し側が決める**。
// resolveMagic の事前確認（このマジックで対象変更が起こりうるか）と、実際に絞り込む
// bothSidesPids / anySide の候補列挙が共用する。相手が使ったマジックにも効くので両陣営を走査する
// （選ぶのはあくまで発生源の持ち主。docs/design/CHOOSER_RULES.md）
export function findBothSidesRedirectSource(
    state: GameState,
): { pid: PlayerId; inst: CardInstance } | null {
    for (const ownerPid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, ownerPid)) {
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "targetRedirect" || effect.includes !== "bothSides") continue
                if (!entryActive(state, ownerPid, source, effect, currentLevel(source).level)) continue
                if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
                noteCoverage(effect, "targetRedirect")
                return { pid: ownerPid, inst: source }
            }
        }
    }
    return null
}

// 封印された魔導書Lv1 の答えのうち「**対象として残る側**」を返す（null＝絞らない）。
// 「お互いを対象とする効果」（bothSidesPids）だけでなく、**陣営を指定していない単体対象**
// （action.anySide の「スピリット1体」「ネクサス1つ」）にも効かせるためのもの。
// **マジックの効果にだけ効く**のは bothSidesPids と同じで、決定が無いとき
// （非対話・魔導書が無い・「変更しない」を選んだ）は null を返して素通しさせる
export function bothSidesRedirectKeepPid(
    state: GameState,
    sourceType: CardType | undefined,
): PlayerId | null {
    if (sourceType !== "magic") return null
    const decision = state.magicSideDecision
    if (!decision || decision.keepPid === null) return null
    const found = findBothSidesRedirectSource(state)
    if (!found || found.inst.instanceId !== decision.sourceInstanceId) return null
    return decision.keepPid
}

// 上の答えで候補列挙（pickAnySideCandidates）を片側に絞る。スピリットとネクサスの両方を見る
// （「ネクサス1つ」を対象にする anySide があるため。BS03メビウスリング）
export function applyBothSidesRedirectToCandidates(
    state: GameState,
    sourceType: CardType | undefined,
    candidates: CardInstance[],
): CardInstance[] {
    const keepPid = bothSidesRedirectKeepPid(state, sourceType)
    if (keepPid === null) return candidates
    const keep = state.players[keepPid].field
    const ids = new Set([...keep.spirits, ...keep.nexuses].map((c) => c.instanceId))
    return candidates.filter((c) => ids.has(c.instanceId))
}

// 封印された魔導書Lv1（kind:"targetRedirect"（includes:"bothSides"））の「対象を相手のみ／自分のみに変更できる」の確認。
// 出したら true（中断）を返す。**このマジックが実際に両陣営に関わる場合だけ**聞く
// （相手だけを対象にする大多数のマジックで確認を出さないため）。答えはマジックの解決中ずっと使い回す
export function askBothSidesRedirect(
    state: GameState,
    owner: PlayerId,
    card: CardData,
    timing: "main" | "flash",
    targetInstanceId: string | undefined,
    paidCost: boolean,
    triggers: MagicUsedDecision,
): boolean {
    delete state.magicSideDecision
    if (!state.interactiveTargets) return false
    const found = findBothSidesRedirectSource(state)
    if (!found) return false
    const touches = card.effects.some(
        (e) => e.kind === "magic" && e.timing === timing && actionTouchesBothSides(e.action),
    )
    if (!touches) return false
    suspend(state, {
        pid: found.pid, // 選ぶのは**魔導書の持ち主**（マジックの使用者とは限らない）
        kind: "option",
        prompt: `${getCard(found.inst.cardId).name}：${card.name}の効果の対象を変更しますか？`,
        candidates: [],
        options: BOTH_SIDES_REDIRECT_OPTIONS,
        optional: false,
        magicSideChoice: {
            casterPid: owner,
            cardId: card.cardId,
            timing,
            targetInstanceId,
            sourceInstanceId: found.inst.instanceId,
            ownerPid: found.pid,
            paidCost,
            triggers,
        },
        action: { type: "noop" },
        selfInstanceId: found.inst.instanceId,
    })
    return true
}

// 確認の選択肢。**この並び順に GameEngine.doResolveChoice が依存する**（0=変更しない / 1=相手のみ / 2=自分のみ）。
// 「相手」「自分」はどちらも**魔導書の持ち主から見た**呼び方
export const BOTH_SIDES_REDIRECT_OPTIONS = ["変更しない", "相手のみ", "自分のみ"]

// 「お互いを対象とする」効果（side:"both" 等）か、陣営を指定しない単体対象（anySide）を含むか。
// EffectAction は判別共用体で、両陣営を示す印が型ごとに散らばっているため、
// **ここだけは値として再帰的に**走査する（新しい action を足しても印さえ同じなら追随不要）
export function actionTouchesBothSides(node: unknown): boolean {
    if (Array.isArray(node)) return node.some(actionTouchesBothSides)
    if (node === null || typeof node !== "object") return false
    const o = node as Record<string, unknown>
    if (o["anySide"] === true) return true
    if (o["side"] === "both" || o["side"] === "any") return true
    if (o["target"] === "anyAll") return true
    return Object.values(o).some(actionTouchesBothSides)
}

// pendingChoice（対象の変更の確認）の後処理。keepPid=null なら変更せず、
// それ以外はその側だけを対象として中断していた解決を続ける。GameEngine.doResolveChoice から呼ぶ
export function applyMagicSideChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicSideChoice"]>,
    keepPid: PlayerId | null,
): void {
    state.magicSideDecision = { sourceInstanceId: info.sourceInstanceId, keepPid }
    if (keepPid === null) {
        const source = findInstanceAnywhere(state, info.sourceInstanceId)
        const name = source ? getCard(source.cardId).name : "効果"
        log(state, `${name}：${getCard(info.cardId).name}の効果の対象を変更しなかった。`)
    }
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId, info.paidCost, info.triggers)
}
