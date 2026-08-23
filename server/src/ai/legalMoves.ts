// AI が「今この瞬間に打てる手」を列挙する。
//
// 可否の判定はすべて RuleValidator の validateXxx を通す。あれらは副作用のない検証関数なので、
// 候補を作っては捨てる用途にそのまま使える。**AI 専用の可否判定を書き起こさない**のが要点で、
// 「AIが打てるつもりの手をサーバーが弾く」種類のズレを構造的に防ぐ
// （クライアントUIが共有層の activatableAbility を通してボタンを出すのと同じ考え方）。
//
// ここは「合法かどうか」だけを見る。どれを選ぶかは evaluate.ts が決める。
import type { GameAction, GameState, PlayerId } from "../type"
import { getCard } from "../logic/GameState"
import {
    validateActivateAbility,
    validateAttack,
    validateBlock,
    validateCastMagic,
    validateEndTurn,
    validateMoveCore,
    validatePass,
    validateSetNexus,
    validateSummon,
    validateTakeLife,
} from "../logic/RuleValidator"
import { activatableAbility } from "../../../shared/rules"

// 1手の候補。reason は対戦ログとテストのために持つ（AIがなぜその手を選んだかを後から追えるように）
export interface AiMove {
    action: GameAction
    reason: string
}

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
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
        for (const option of choice.options ?? []) {
            moves.push({ action: { type: "resolveChoice", option }, reason: `選択：${option}` })
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

// 手札からのカード使用（召喚・配置・マジック）。メインとフラッシュの両方から呼ぶ。
// 召喚と配置は**払える最大レベル**をひとつだけ候補にする（レベルが高いほどBPも効果も強く、
// 低いレベルで出す手をすべて候補に混ぜても評価が薄まるだけのため）
function handMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    const player = state.players[pid]
    player.hand.forEach((cardId, handIndex) => {
        const card = getCard(cardId)
        if (card.type === "spirit") {
            for (const lv of [...card.levels].sort((a, b) => b.level - a.level)) {
                if (validateSummon(state, pid, handIndex, undefined, lv.level) === null) {
                    moves.push({
                        action: { type: "summon", handIndex, level: lv.level },
                        reason: `${card.name}をLv${lv.level}で召喚`,
                    })
                    break
                }
            }
        } else if (card.type === "nexus") {
            for (const lv of [...card.levels].sort((a, b) => b.level - a.level)) {
                if (validateSetNexus(state, pid, handIndex, undefined, lv.level) === null) {
                    moves.push({
                        action: { type: "setNexus", handIndex, level: lv.level },
                        reason: `${card.name}をLv${lv.level}で配置`,
                    })
                    break
                }
            }
        } else if (card.type === "magic") {
            // 対象を取らない形で通るならそれを使う（対象が要る効果は解決中に選択待ちが立つ）。
            // 通らない場合だけ、盤面のスピリット・ネクサスを1つずつ対象に当ててみる
            if (validateCastMagic(state, pid, handIndex) === null) {
                moves.push({ action: { type: "castMagic", handIndex }, reason: `${card.name}を使用` })
            } else {
                for (const side of ["p1", "p2"] as const) {
                    const field = state.players[side].field
                    for (const inst of [...field.spirits, ...field.nexuses]) {
                        if (validateCastMagic(state, pid, handIndex, inst.instanceId) === null) {
                            moves.push({
                                action: { type: "castMagic", handIndex, targetInstanceId: inst.instanceId },
                                reason: `${card.name}を${getCard(inst.cardId).name}に使用`,
                            })
                        }
                    }
                }
            }
        }
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
        moves.push({
            action: { type: "activateAbility", instanceId: inst.instanceId, effectId: ability.effectId },
            reason: `${getCard(inst.cardId).name}の効果を発動`,
        })
    }
    return moves
}

// コアを置いてレベルを上げる手。取り除く方向は AI では扱わない
// （レベルを下げて得をする場面は限られており、誤って自滅する手を候補に入れたくないため）
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
    return moves
}

// 自分のメインステップ
function mainStepMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves = [
        ...handMoves(state, pid),
        ...abilityMoves(state, pid),
        ...coreMoves(state, pid),
    ]
    moves.push({ action: { type: "nextPhase" }, reason: "アタックステップへ進む" })
    if (validateEndTurn(state, pid) === null) {
        moves.push({ action: { type: "endTurn" }, reason: "ターンを終了する" })
    }
    return moves
}

// 自分のアタックステップ
function attackStepMoves(state: GameState, pid: PlayerId): AiMove[] {
    const moves: AiMove[] = []
    for (const inst of state.players[pid].field.spirits) {
        if (validateAttack(state, pid, inst.instanceId) !== null) continue
        moves.push({
            action: { type: "attack", instanceId: inst.instanceId },
            reason: `${getCard(inst.cardId).name}でアタック`,
        })
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
    for (const inst of state.players[pid].field.spirits) {
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
