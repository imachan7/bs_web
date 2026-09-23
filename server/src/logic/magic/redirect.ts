import type { CardData, CardInstance, CardType, PendingChoice, EffectAction, GameState, PlayerId, ResolvedTargetFilter, TargetFilter } from "../../type"
import { currentLevel, findInstanceAnywhere, getCard, log, opponentOf, suspend } from "../GameState"
import { effectActiveAtLevel, effectSources, instHasColor, instHasCost, matchesTarget, matchesFamilyFilter } from "../../../../shared/rules"
import { resolveMagicEffects } from "./resolve"

// 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）：「お互いを対象とするマジックの効果」の
// 対象を片側だけに変更する。両陣営を対象にするアクション（destroyNexus side:"both" / bothSidesCoreToTrash /
// bothSidesCoreToVoid / exhaustAll side:"both" / returnAllToHand side:"both" / nexusCoresToTrash side:"both" /
// draw side:"both" / discardBothHands）は、ハードコードの ["p1","p2"] の代わりにこれを呼ぶ。
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

// 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の発生源を探す。
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
                if (effect.kind !== "bothSidesTargetRedirect") continue
                if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
                if (effect.turn === "own" && ownerPid !== state.turnPlayer) continue
                if (effect.turn === "opponent" && ownerPid === state.turnPlayer) continue
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

// マジックカードの効果を実行する（timing に一致するすべての効果を配列順に実行）。
// 「ドロー＋バフ」のような複合テキストは effects に複数エントリを並べて表現する。
// アルカナソルジャー・サンクLv2（kind:"magicTargetRedirect"）の判定。
// 「相手がこのスピリットを対象に含むマジックの効果を使用したとき、その対象をこのスピリットのみにできる」。
// 「できる」は自動適用の簡略化（magicFreeGrant と同じ扱い）。
// 対象に含むかの判定:
//   - 明示ターゲットあり → それがサンク自身のときだけ絞り込む（他の1体を選んだならサンクは対象外）
//   - 明示ターゲットなし（全体効果・自動選択） → 対象に含むものとして絞り込む
//     （利用者確認：マジックの「対象」には全体を含む効果も含まれる。DECISIONS.md）
export function setTargetRedirect(
    state: GameState,
    casterPid: PlayerId,
    targetInstanceId: string | undefined,
    action: EffectAction,
): void {
    delete state.magicRedirectTo
    const found = findMagicRedirectSource(state, casterPid, targetInstanceId, action)
    if (!found) return
    // 対話モードでは、絞り込むかどうかを発生源の持ち主（＝守る側）に確認済み。
    // 「しない」を選んでいたら絞り込まない（『〜にできる』の任意性。BS04サンク／BS05スノーホワイト）。
    // 決定が無い＝非対話（テスト・自動解決）なので、従来どおり自動で絞り込む
    const decision = state.magicRedirectDecision
    if (decision && decision.sourceInstanceId === found.instanceId && !decision.approved) return
    state.magicRedirectTo = { pid: opponentOf(casterPid), instanceId: found.instanceId }
    log(
        state,
        `${getCard(found.cardId).name}：このマジックの効果の対象を、このスピリットのみにした。`,
    )
}

// この発生源の絞り込みが「〜にできる」＝任意か（optional:true）。
// 任意のものだけ、絞り込む前に持ち主へ確認を出す。強制（optional 未指定）なら確認せず自動で絞り込む
export function isRedirectOptional(inst: CardInstance): boolean {
    return getCard(inst.cardId).effects.some(
        (e) => e.kind === "magicTargetRedirect" && e.optional === true,
    )
}

// magicTargetRedirect の発生源を探す（実際に絞り込むかは呼び出し側が決める）。
// resolveMagic の事前確認（このマジックで絞り込みが起こりうるか）と setMagicRedirect が共用する
export function findMagicRedirectSource(
    state: GameState,
    casterPid: PlayerId,
    targetInstanceId: string | undefined,
    action: EffectAction,
): CardInstance | null {
    const defenderPid = opponentOf(casterPid)
    for (const inst of state.players[defenderPid].field.spirits) {
        for (const effect of getCard(inst.cardId).effects) {
            if (effect.kind !== "magicTargetRedirect") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(inst).level)) continue
            // 『相手のターン』＝発生源の持ち主がターンプレイヤーでないとき／『自分のターン』＝turnPlayerのとき
            if (effect.turn === "opponent" && defenderPid === state.turnPlayer) continue
            if (effect.turn === "own" && defenderPid !== state.turnPlayer) continue
            // 『相手の**アタックステップ**』のようにステップまで限定されているとき（BS09-038ティンカ）。
            // turn だけでは相手のメインステップに使われた効果からも守ってしまう
            if (effect.phase !== undefined && state.phase !== effect.phase) continue
            if (effect.protectFamily !== undefined || effect.protectCost !== undefined) {
                // スノーホワイト：守る対象は「持ち主の指定系統（＋指定色）のスピリット」で、
                // 絞り込み先は発生源自身。守る対象が1体も対象に含まれていなければ発動しない
                // （BS06細剣の猫騎士ケット・シー：protectCostで「持ち主の指定コストのスピリット」を守る同型版）
                const guarded = state.players[defenderPid].field.spirits.filter(
                    (s) =>
                        (effect.protectFamily === undefined ||
                            matchesFamilyFilter(state, defenderPid, s, effect.protectFamily)) &&
                        (effect.protectColor === undefined || instHasColor(s, effect.protectColor)) &&
                        (effect.protectCost === undefined || instHasCost(s, effect.protectCost)),
                )
                if (guarded.length === 0) continue
                const included =
                    targetInstanceId !== undefined
                        ? guarded.some((s) => s.instanceId === targetInstanceId)
                        : guarded.some((s) => redirectTargetMatches(state, defenderPid, s, action))
                if (!included) continue
            } else {
                if (targetInstanceId !== undefined && targetInstanceId !== inst.instanceId) continue
                // そもそもこのアクションの絞り込みに合致しなければ「対象に含む」ではない
                // （例: BP3000以下を破壊するマジックに対し、BP4000のサンクは対象外＝絞り込みは起きない）
                if (!redirectTargetMatches(state, defenderPid, inst, action)) continue
            }
            return inst
        }
    }
    return null
}

// 絞り込み対象（サンク）が、そのアクションの filter に合致するか。
// self 相対BP・バトル敗者参照など「マジック単体では解決できない軸」を含む場合は
// 判定できないため false（＝絞り込まない＝従来どおりの挙動）にする
export function redirectTargetMatches(
    state: GameState,
    defenderPid: PlayerId,
    inst: CardInstance,
    action: EffectAction,
): boolean {
    const spec = (action as { filter?: TargetFilter }).filter
    if (!spec) return true
    if (spec.maxBp === "selfBp" || spec.minBp === "selfBp" || spec.exactBp === "selfBp") return false
    if (spec.sameColorAsBattleLoser || spec.sameFamilyAsBattleLoser) return false
    // ここまでで "selfBp" 系は除外済みなので、数値のみの ResolvedTargetFilter として扱える
    return matchesTarget(state, defenderPid, inst, spec as unknown as ResolvedTargetFilter)
}

// 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の「対象を相手のみ／自分のみに変更できる」の確認。
// 出したら true（中断）を返す。**このマジックが実際に両陣営に関わる場合だけ**聞く
// （相手だけを対象にする大多数のマジックで確認を出さないため）。答えはマジックの解決中ずっと使い回す
export function askBothSidesRedirect(
    state: GameState,
    owner: PlayerId,
    card: CardData,
    timing: "main" | "flash",
    targetInstanceId: string | undefined,
    paidCost: boolean,
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
export const BOTH_SIDES_ACTION_TYPES = new Set([
    "bothSidesCoreToTrash",
    "bothSidesCoreToVoid",
    "discardBothHands",
    // 「指定した色のスピリットすべて」＝両陣営が対象（BS02-111スピリットイリュージョン）。
    // 効果本体は貸与した継続効果なので、絞り込みの答えは仮想発生源の lentKeepPid に写して
    // ターン中ずっと使う（colorChoiceLendThisTurnHandler）
    "colorChoiceLendThisTurn",
])

export function actionTouchesBothSides(node: unknown): boolean {
    if (Array.isArray(node)) return node.some(actionTouchesBothSides)
    if (node === null || typeof node !== "object") return false
    const o = node as Record<string, unknown>
    if (o["anySide"] === true) return true
    if (o["side"] === "both") return true
    if (o["target"] === "anyAll") return true
    if (typeof o["type"] === "string" && BOTH_SIDES_ACTION_TYPES.has(o["type"])) return true
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
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId, info.paidCost)
}

// このマジックが解決する効果のうち、1つでも magicTargetRedirect の絞り込み対象になるものがあるか。
// あればその発生源を返す（確認を出すかどうかの事前判定。runMagicActions と同じ timing 絞り込みを使う）
export function findMagicRedirectSourceForCard(
    state: GameState,
    casterPid: PlayerId,
    card: CardData,
    timing: "main" | "flash",
    targetInstanceId: string | undefined,
): CardInstance | null {
    for (const effect of card.effects) {
        if (effect.kind !== "magic" || effect.timing !== timing) continue
        const found = findMagicRedirectSource(state, casterPid, targetInstanceId, effect.action)
        if (found) return found
    }
    return null
}

// pendingChoice（対象の絞り込みの確認）の後処理。承認・拒否のどちらでも、中断していた解決を続ける。
// GameEngine.doResolveChoice から呼ぶ
export function applyMagicRedirectChoice(
    state: GameState,
    info: NonNullable<PendingChoice["magicRedirect"]>,
    approved: boolean,
): void {
    state.magicRedirectDecision = { sourceInstanceId: info.sourceInstanceId, approved }
    // 絞り込みの確認で中断していた場合も、封印された魔導書の確認はここで出す（解決へ直行させない）
    if (askBothSidesRedirect(state, info.casterPid, getCard(info.cardId), info.timing, info.targetInstanceId, info.paidCost)) return
    resolveMagicEffects(state, info.casterPid, info.cardId, info.timing, info.targetInstanceId, info.paidCost)
}
