// AI が「今この瞬間に打てる手」を列挙する。
//
// 可否の判定はすべて RuleValidator の validateXxx を通す。あれらは副作用のない検証関数なので、
// 候補を作っては捨てる用途にそのまま使える。**AI 専用の可否判定を書き起こさない**のが要点で、
// 「AIが打てるつもりの手をサーバーが弾く」種類のズレを構造的に防ぐ
// （クライアントUIが共有層の activatableAbility を通してボタンを出すのと同じ考え方）。
//
// ここは「合法かどうか」だけを見る。どれを選ぶかは evaluate.ts が決める。
import { ifCondMet } from "../logic/actions/control"
import type { ActionCtx } from "../logic/actions/types"
import type { GameAction, GameState, PaySource, PlayerId } from "../type"
import { autoPayPlan } from "../logic/EffectModules"
import { normalReserveOf } from "../logic/soulCore"
import { getCard } from "../logic/GameState"
import { magicTimingChoosable } from "../../../shared/magicTiming"
import {
    validateActivateAbility,
    validateAttack,
    validateBlock,
    validateCastMagic,
    validateEndTurn,
    validateMoveCore,
    validatePass,
    validateSetBurst,
    validateSetNexus,
    validateSummon,
    validateTakeLife,
} from "../logic/RuleValidator"
import { activatableAbility, battlers, activatedActionResolvable, bravesOf, mustBeAttackTargetIds } from "../../../shared/rules"
import { mandatoryDirectAttackTargetIds } from "../../../shared/block"
import { braveCombineCandidates } from "../../../shared/summon"
import { anyNode, burstRank, magicTags, tagsOfAction, type MoveTags } from "./moveTags"

// 1手の候補。reason は対戦ログとテストのために持つ（AIがなぜその手を選んだかを後から追えるように）
export interface AiMove {
    action: GameAction
    reason: string
    // マジック・起動能力だけが持つ。足切りと点数付けに使う（moveTags.ts）
    tags?: MoveTags | undefined
    // setBurst だけが持つ。burstRank の値
    burstRank?: number
    // バーストの発動確認で「発動」を選ぶ手のうち、効果が何もできないもの。新しい方針だけが避ける（policy.ts）
    futile?: true
    // 場のコアを払う手と、最低レベルの追加候補。旧の方針は使わない（policy.ts の OLD_POLICY）
    added?: true
}

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// 条件判定だけに使う ActionCtx（resolve は呼ばれない）
function stubCtx(state: GameState, pid: PlayerId): ActionCtx {
    return { state, owner: pid, opp: pid === "p1" ? "p2" : "p1", self: null, sourceName: "", srcColors: undefined, srcType: "magic", sourceCardId: undefined, srcInstanceId: undefined,
        destroyContext: {}, targetInstanceId: undefined, chosenOption: undefined, chosenCardIndex: undefined, paySources: undefined, resolve: () => {} }
}

// 発動確認を出しているバーストが、いま発動しても何も起きないか。
// 効果の頭が if で条件が成り立たない／相手の場に除去の的がいない。召喚するバーストなどはタグが unknown なので「意味あり」に倒す
function burstFutile(state: GameState, pid: PlayerId, cardId: string, event: unknown): boolean {
    const effect = getCard(cardId).effects.find((e) => e.kind === "burst" && e.event === event)
    if (effect?.kind !== "burst") return false
    const action = effect.action
    const head = action.type === "sequence" ? action.actions[0] : action
    if (head?.type === "if" && !ifCondMet(stubCtx(state, pid), head.cond)) return true
    const opp = state.players[opponentOf(pid)].field
    return tagsOfAction([action]).tags.every((t) => t === "removal") && opp.spirits.length + opp.nexuses.length === 0
}

// 選択待ち（pendingChoice）への応答を列挙する。
// 候補は pendingChoice がすでに絞り込んで持っているので、ここでは形に変換するだけでよい
function choiceMoves(state: GameState, pid: PlayerId): AiMove[] {
    const choice = state.pendingChoice
    if (!choice || choice.pid !== pid) return []
    const moves: AiMove[] = []
    if (choice.kind === "target") {
        for (const instanceId of choice.candidates) {
            moves.push({ action: { type: "resolveChoice", instanceId }, reason: `選択：${instanceId}` })
        }
    } else if (choice.kind === "option") {
        // confirm（「〜できる」の発動確認）でもラベルはそのまま送る。
        // 受け取り側が confirm を見てラベルを捨てるので、クライアントと同じ送り方でよい
        // バーストの「コストを払ってフラッシュ効果を発揮」：効果の頭が if で条件を満たさない（何も起きない）なら払わない（2026-11-20 ユーザー決定。対戦者には払う選択肢を出す）
        const head = choice.action?.type === "sequence" ? choice.action.actions[0] : choice.action
        const oppReady = state.players[opponentOf(pid)].field.spirits.some((sp) => !sp.isRested)
        const wasteful =
            choice.burstThenPay !== undefined &&
            ((head?.type === "if" && !ifCondMet(stubCtx(state, pid), head.cond)) ||
                // 場のスピリットを消滅させないと払えないなら払わない（2026-11-22 ユーザー指示）
                autoPayPlan(state, pid, choice.burstThenPay.cost, false, "lv1") === null ||
                // アタックステップを終える効果は、相手にまだアタックできる回復状態のスピリットがいなければコアを温存する
                (!oppReady && anyNode(choice.action, (x) => x.type === "endAttackStepAfterBattle")))
        // コストの支払い待ちは、スピリットを Lv1 で残す払い方を付けて答え、そう払えない選択肢は出さない（2026-11-22 ユーザー指示：
        // 場のスピリットを消滅させて払わない）。何も残らないときは、断れるなら断り、断れなければサーバーのおまかせ（消滅させる払い方も含む）に任せる
        const pay = choice.effectCostPay
        const kept: AiMove[] = []
        if (pay && !pay.reserveOnly && !wasteful) {
            ;(choice.options ?? []).forEach((option, i) => {
                const plan = autoPayPlan(state, pid, pay.need + (pay.keepByOption?.[i] ?? pay.keep ?? 0) + (pay.tollKeep ?? 0), false, "lv1")
                if (plan && !plan.soulFromReserve) kept.push({ action: { type: "resolveChoice", option, paySources: plan.paySources }, reason: `選択：${option}` })
            })
        }
        moves.push(...kept)
        const vanishOnly = pay !== undefined && !pay.reserveOnly && kept.length === 0 && choice.optional === true
        for (const option of wasteful || kept.length > 0 || vanishOnly ? [] : choice.options ?? []) {
            const ba = choice.burstActivate
            const futile = ba !== undefined && burstFutile(state, pid, ba.cardId, ba.event)
            moves.push({ action: { type: "resolveChoice", option }, reason: `選択：${option}`, ...(futile ? { futile: true as const } : {}) })
        }
    } else {
        for (const cardIndex of choice.cardIndices ?? []) {
            moves.push({ action: { type: "resolveChoice", cardIndex }, reason: `カードを選択：${cardIndex}` })
        }
    }
    // スキップ可能なら「選ばない」も手のひとつ。
    // 候補が1つも無いときは optional でなくてもスキップを入れる（選べないまま止まらないための逃げ道）
    if (choice.optional || moves.length === 0) {
        moves.push({ action: { type: "resolveChoice" }, reason: "選択をスキップ" })
    }
    return moves
}


// 場のスピリット・ネクサスのコアも支払い元にして、check が通る最小の計画（リザーブ → いまのレベルを保つ余り → Lv1まで下げる、の順）。
// 場のコアは**そのスピリットが消滅しない限り使ってよい**（レベルが下がるのは構わない。2026-11-20 ユーザー指示）。
// 必要数は軽減・追加コストで変わるので、総数を1ずつ増やして最初に通るものを取る（通る最小の総数＝必要数ちょうど）
function fieldPaid(state: GameState, pid: PlayerId, check: (ps: PaySource[]) => string | null): PaySource[] | null {
    const reserve = normalReserveOf(state.players[pid])
    for (const keep of ["current", "lv1"] as const) {
        for (let n = reserve + 1; ; n++) {
            const plan = autoPayPlan(state, pid, n, false, keep)
            if (!plan || plan.soulFromReserve) break
            if (check(plan.paySources) === null) return plan.paySources
        }
    }
    return null
}

// 召喚・配置のレベルごとの候補。リザーブだけで払える最大レベル（従来の手）に加えて、
// 場のコアを使って届く最大レベルと、最低レベル（withLv1）を追加候補にする
function payLevels(
    state: GameState,
    pid: PlayerId,
    levelsDesc: number[],
    withLv1: boolean,
    check: (level: number, ps?: PaySource[]) => string | null,
): { level: number; paySources?: PaySource[]; added?: true }[] {
    const out: { level: number; paySources?: PaySource[]; added?: true }[] = []
    const reserveLv = levelsDesc.find((lv) => check(lv) === null)
    if (reserveLv !== undefined) out.push({ level: reserveLv })
    const lv1 = levelsDesc[levelsDesc.length - 1]!
    for (const lv of levelsDesc) {
        if (reserveLv !== undefined && lv <= reserveLv) break
        const ps = fieldPaid(state, pid, (p) => check(lv, p))
        if (ps) {
            out.push({ level: lv, paySources: ps, added: true })
            break
        }
    }
    if (withLv1 && !out.some((o) => o.level === lv1)) {
        if (check(lv1) === null) out.push({ level: lv1, added: true })
        else {
            const ps = fieldPaid(state, pid, (p) => check(lv1, p))
            if (ps) out.push({ level: lv1, paySources: ps, added: true })
        }
    }
    return out
}

// 手札からのカード使用（召喚・配置・マジック）。メインとフラッシュの両方から呼ぶ。
// 召喚と配置は、払える最大レベルと（召喚は）最低レベルだけを候補にする（全レベルを混ぜても評価が薄まるだけのため）
function handMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    const player = state.players[pid]
    player.hand.forEach((cardId, handIndex) => {
        const card = getCard(cardId)
        const levelsDesc = card.type === "magic" ? [] : card.levels.map((l) => l.level).sort((a, b) => b - a)
        if (card.type === "spirit") {
            for (const o of payLevels(state, pid, levelsDesc, true, (lv, ps) => validateSummon(state, pid, handIndex, ps, lv))) {
                moves.push({
                    action: { type: "summon", handIndex, level: o.level, ...(o.paySources ? { paySources: o.paySources } : {}) },
                    reason: `${card.name}をLv${o.level}で召喚`,
                    ...(o.added ? { added: true as const } : {}),
                })
            }
        } else if (card.type === "brave") {
            // ブレイヴは「スピリットとして単体で出す」手と「自分のスピリットに合体させて出す」手（ダイレクトブレイヴ）がある。
            for (const o of payLevels(state, pid, levelsDesc, true, (lv, ps) => validateSummon(state, pid, handIndex, ps, lv))) {
                moves.push({
                    action: { type: "summon", handIndex, level: o.level, ...(o.paySources ? { paySources: o.paySources } : {}) },
                    reason: `${card.name}をLv${o.level}で召喚`,
                    ...(o.added ? { added: true as const } : {}),
                })
            }
            for (const hostId of braveCombineCandidates(state, pid, cardId)) {
                const hostName = getCard(player.field.spirits.find((sp) => sp.instanceId === hostId)!.cardId).name
                for (const o of payLevels(state, pid, levelsDesc, false, (lv, ps) => validateSummon(state, pid, handIndex, ps, lv, undefined, undefined, hostId))) {
                    moves.push({
                        action: { type: "summon", handIndex, level: o.level, braveTargetInstanceId: hostId, ...(o.paySources ? { paySources: o.paySources } : {}) },
                        reason: `${card.name}を${hostName}に合体させて召喚`,
                        ...(o.added ? { added: true as const } : {}),
                    })
                }
            }
        } else if (card.type === "nexus") {
            for (const o of payLevels(state, pid, levelsDesc, false, (lv, ps) => validateSetNexus(state, pid, handIndex, ps, lv))) {
                moves.push({
                    action: { type: "setNexus", handIndex, level: o.level, ...(o.paySources ? { paySources: o.paySources } : {}) },
                    reason: `${card.name}をLv${o.level}で配置`,
                    ...(o.added ? { added: true as const } : {}),
                })
            }
        } else if (card.type === "magic") {
            // 対象を取らない形で通るならそれを使う（対象が要る効果は解決中に選択待ちが立つ）。
            // 通らない場合だけ、盤面のスピリット・ネクサスを1つずつ対象に当ててみる。
            // リザーブだけで払えなければ場のコアも使う（fieldPaid）
            const cast = (check: (ps?: PaySource[]) => string | null): { paySources?: PaySource[] } | null => {
                if (check() === null) return {}
                const ps = fieldPaid(state, pid, check)
                return ps ? { paySources: ps } : null
            }
            const push = (o: { paySources?: PaySource[] }, extra: Record<string, unknown>, reason: string, timing: "main" | "flash"): void => {
                moves.push({ action: { type: "castMagic", handIndex, ...extra, ...(o.paySources ? { paySources: o.paySources } : {}) } as GameAction, reason, tags: magicTags(cardId, timing), ...(o.paySources ? { added: true as const } : {}) })
            }
            const plain = cast((ps) => validateCastMagic(state, pid, handIndex, undefined, ps))
            if (plain) {
                push(plain, {}, `${card.name}を使用`, state.battle ? "flash" : "main")
                // メインステップではフラッシュ効果も選べる（既定はメイン効果）
                if (!state.battle && magicTimingChoosable(card)) {
                    const flash = cast((ps) => validateCastMagic(state, pid, handIndex, undefined, ps, undefined, undefined, undefined, undefined, "flash"))
                    if (flash) push(flash, { timing: "flash" }, `${card.name}のフラッシュ効果を使用`, "flash")
                }
            } else {
                for (const side of ["p1", "p2"] as const) {
                    const field = state.players[side].field
                    for (const inst of [...field.spirits, ...field.nexuses]) {
                        const o = cast((ps) => validateCastMagic(state, pid, handIndex, inst.instanceId, ps))
                        if (o) push(o, { targetInstanceId: inst.instanceId }, `${card.name}を${getCard(inst.cardId).name}に使用`, state.battle ? "flash" : "main")
                    }
                }
            }
        }
    })
    return moves
}

// バーストのセット。入れ替え（旧カードはトラッシュへ行く）は、いまより良いものがあるときだけ候補にする
function burstMoves(state: GameState, pid: PlayerId): AiMove[] {
    const player = state.players[pid]
    const current = player.burst ? burstRank(player.burst, player.life) : -1
    const moves: AiMove[] = []
    const seen = new Set<string>()
    player.hand.forEach((cardId, handIndex) => {
        if (seen.has(cardId) || validateSetBurst(state, pid, handIndex) !== null) return
        const rank = burstRank(cardId, player.life)
        if (rank <= current) return
        seen.add(cardId)
        moves.push({ action: { type: "setBurst", handIndex }, reason: `${getCard(cardId).name}をバーストにセット`, burstRank: rank })
    })
    return moves
}

// 起動能力。発動可否は共有層の activatableAbility が一手に判定する（サーバーの受理条件と同じ実装）
function abilityMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    const field = state.players[pid].field
    for (const inst of [...field.spirits, ...field.nexuses]) {
        const ability = activatableAbility(state, pid, inst)
        if (!ability) continue
        if (validateActivateAbility(state, pid, inst.instanceId, ability.effectId) !== null) continue
        // 候補の無い cancelable 召喚は押せても不発で盤面が変わらない。CPU が同じ起動を繰り返して手数上限で降参していた（#497）
        const effect = [inst, ...bravesOf(state.players[pid], inst)].flatMap((src) => getCard(src.cardId).effects).find((e) => e.id === ability.effectId)
        if (effect?.kind === "activated" && "cancelable" in effect.action && effect.action.cancelable === true && !activatedActionResolvable(state, pid, inst, effect.action)) continue
        moves.push({
            action: { type: "activateAbility", instanceId: inst.instanceId, effectId: ability.effectId },
            reason: `${getCard(inst.cardId).name}の効果を発動`,
            tags: effect?.kind === "activated" ? tagsOfAction([effect.action]) : undefined,
        })
    }
    return moves
}

// コアを置いてレベルを上げる手と、スピリットのコアをリザーブへ外す手（Lv1 を割らない範囲。消滅させる手は出さない）。
// 外す手は scoreMove が 0 点にするので点数だけで選ぶ方針は打たず、アタックの計画（attackPlan.ts の levelPick）がスピリット間の移し替えに使う
function coreMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    const field = state.players[pid].field
    for (const inst of [...field.spirits, ...field.nexuses]) {
        if (validateMoveCore(state, pid, inst.instanceId, "add") !== null) continue
        moves.push({
            action: { type: "moveCore", instanceId: inst.instanceId, direction: "add" },
            reason: `${getCard(inst.cardId).name}にコアを置く`,
        })
    }
    for (const inst of field.spirits) {
        if (validateMoveCore(state, pid, inst.instanceId, "remove") !== null) continue
        moves.push({
            action: { type: "moveCore", instanceId: inst.instanceId, direction: "remove" },
            reason: `${getCard(inst.cardId).name}のコアをリザーブへ外す`,
        })
    }
    return moves
}

// 自分のメインステップ
function mainStepMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves = [
        ...handMoves(state, pid),
        ...abilityMoves(state, pid),
        ...coreMoves(state, pid),
        ...burstMoves(state, pid),
    ]
    // 第2メインステップ中と先攻1ターン目にはアタックステップが無い（サーバーに弾られるので候補に出さない）
    if (!state.extraMainStep && state.secondMainStep !== true && state.turn !== 1) moves.push({ action: { type: "nextPhase" }, reason: "アタックステップへ進む" })
    if (validateEndTurn(state, pid) === null) {
        moves.push({ action: { type: "endTurn" }, reason: "ターンを終了する" })
    }
    return moves
}

// 自分のアタックステップ
function attackStepMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    for (const inst of battlers(state.players[pid])) {
        if (validateAttack(state, pid, inst.instanceId) === null) {
            moves.push({
                action: { type: "attack", instanceId: inst.instanceId },
                reason: `${getCard(inst.cardId).name}でアタック`,
            })
            continue
        }
        // 指定アタックを強いられている個体（mustBeAttackTarget）は、指定先ごとに手を出す
        // 必ず指定アタック（mandatory）の指定先も候補に入れる（指定なしのアタックは validateAttack が拒否する）
        for (const targetId of [...mustBeAttackTargetIds(state, pid, inst), ...mandatoryDirectAttackTargetIds(state, pid, inst)]) {
            if (validateAttack(state, pid, inst.instanceId, targetId) !== null) continue
            moves.push({
                action: { type: "attack", instanceId: inst.instanceId, targetSpiritInstanceId: targetId },
                reason: `${getCard(inst.cardId).name}で指定アタック`,
            })
        }
    }
    if (validateEndTurn(state, pid) === null) {
        moves.push({ action: { type: "endTurn" }, reason: "ターンを終了する" })
    }
    return moves
}

// フラッシュタイミング（優先権を持っているとき）。パスは常に候補に入れる
function flashMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves = [...handMoves(state, pid), ...abilityMoves(state, pid)]
    if (validatePass(state, pid) === null) {
        moves.push({ action: { type: "pass" }, reason: "フラッシュをパス" })
    }
    return moves
}

// ブロック宣言（防御側・フラッシュ窓の外）
function blockMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    for (const inst of battlers(state.players[pid])) {
        if (validateBlock(state, pid, inst.instanceId) !== null) continue
        moves.push({
            action: { type: "block", instanceId: inst.instanceId },
            reason: `${getCard(inst.cardId).name}でブロック`,
        })
    }
    if (validateTakeLife(state, pid) === null) {
        moves.push({ action: { type: "takeLife" }, reason: "ライフで受ける" })
    }
    return moves
}

// 今このプレイヤーが打てる手をすべて返す。空配列＝相手の手番待ち（AIは何もしない）
export function enumerateLegalMoves(state: GameState, pid: PlayerId): AiMove[] {
    if (state.winner) return []
    // 選択待ちがあるときは、それ以外のアクションはすべて拒否される（GameEngine の前提）
    if (state.pendingChoice) return choiceMoves(state, pid)

    if (state.battle) {
        // バトル中。フラッシュ窓なら優先権を持つ側、窓の外ならブロック宣言をする防御側が動ける
        if (state.isFlashTiming) {
            return state.priorityPlayer === pid ? flashMoves(state, pid) : []
        }
        if (pid === opponentOf(state.turnPlayer) && !state.battle.blockerInstanceId) {
            return blockMoves(state, pid)
        }
        return []
    }

    if (state.turnPlayer !== pid) return []
    if (state.phase === "main") return mainStepMoves(state, pid)
    if (state.phase === "attack") return attackStepMoves(state, pid)
    return []
}
