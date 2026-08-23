// 列挙された手に点数を付ける。点数がいちばん高い手を AI が打つ。
//
// ⚠️ **ここが受け取るのは GameState ではなく GameView（AI自身の視点）**。
// GameView は相手の手札・デッキ内容を持たないので、「AIが盤面の裏を覗いて指している」ことが
// 構造的に起こらない（shared/board.ts の _GameViewIsBoard により、共有ルール層の判定は
// GameView のままで呼べる）。合法手の列挙だけは GameState を要る検証関数を使うが、
// あれは「その手が合法か」しか答えないので情報の非対称は生まれない。
//
// 先読みはしない（1手評価）。打った結果の盤面を作るにはエンジンの状態を複製する必要があり、
// 効果解決の副作用まで正しく巻き戻せる保証がないため、**現在の盤面と手の内容だけ**から点を付ける。
import type { CardInstance, GameAction, GameView, PlayerId } from "../type"
import { getCard } from "../logic/GameState"
import { canBlock } from "../../../shared/block"
import { currentLevel, effectiveBp, instLevels, instanceSymbolCount } from "../../../shared/rules"
import type { AiMove } from "./legalMoves"

function opponentOf(pid: PlayerId): PlayerId {
    return pid === "p1" ? "p2" : "p1"
}

// instanceId から「誰のどのカードか」を引く。選択待ちの候補を評価するのに使う
function findOnBoard(
    view: GameView,
    instanceId: string,
): { inst: CardInstance; owner: PlayerId } | null {
    for (const pid of ["p1", "p2"] as const) {
        const field = view.players[pid].field
        for (const inst of [...field.spirits, ...field.nexuses]) {
            if (inst.instanceId === instanceId) return { inst, owner: pid }
        }
    }
    return null
}

// BP は 1000 単位で扱うと点数が跳ねすぎるので、比較用に千分の一へ落とす
function bpScore(view: GameView, owner: PlayerId, inst: CardInstance): number {
    return effectiveBp(view, owner, inst) / 1000
}

// このアタッカーを止められる相手スピリットが1体でもいるか。
// 判定は共有層の canBlock を通す（防御側UIが出すブロック候補と同じ実装）
function hasBlocker(view: GameView, attackerPid: PlayerId, attacker: CardInstance): boolean {
    const defenderPid = opponentOf(attackerPid)
    return view.players[defenderPid].field.spirits.some(
        (inst) => canBlock(view, defenderPid, inst, attackerPid, attacker) === null,
    )
}

// 相手のスピリットのうち、このアタッカーを返り討ちにできる（BPが上）ブロッカーがいるか
function hasLethalBlocker(view: GameView, attackerPid: PlayerId, attacker: CardInstance): boolean {
    const defenderPid = opponentOf(attackerPid)
    const attackerBp = effectiveBp(view, attackerPid, attacker)
    return view.players[defenderPid].field.spirits.some(
        (inst) =>
            canBlock(view, defenderPid, inst, attackerPid, attacker) === null &&
            effectiveBp(view, defenderPid, inst) > attackerBp,
    )
}

// 選択待ちへの応答を評価する。
// 相手のものを選ぶ場面（破壊・疲労など）と自分のものを選ぶ場面（コスト・破棄など）が
// 同じ resolveChoice で来るため、**候補の持ち主で符号を変える**のが基本方針:
// 相手のものなら強い個体を、自分のものなら弱い個体を選ぶ
function scoreChoice(view: GameView, me: PlayerId, action: GameAction): number {
    if (action.type !== "resolveChoice") return 0
    const choice = view.pendingChoice
    if (!choice) return 0

    if (action.instanceId !== undefined) {
        const found = findOnBoard(view, action.instanceId)
        if (!found) return 30
        const strength = bpScore(view, found.owner, found.inst) + currentLevel(found.inst).level
        return found.owner === me ? 50 - strength : 50 + strength
    }

    if (action.option !== undefined) {
        const index = (choice.options ?? []).indexOf(action.option)
        // 「〜できる」の発動確認（confirm）は発揮する側に倒す。
        // 選択肢が1つしか無く、スキップが「発動しない」を意味するため、ここで下げるとAIが何も撃たなくなる
        if (choice.confirm) return 80
        // 順序の選択（誰から破壊するか・どの誘発から解決するか）は優劣が読めないので先頭でよい
        return 50 - index
    }

    if (action.cardIndex !== undefined) {
        const zone = choice.cardZone
        const owner = choice.cardOwner ?? me
        const cards =
            zone === "hand"
                ? (view.players[owner].hand ?? [])
                : zone === "trash"
                  ? view.players[owner].trashCards
                  : (view.revealedCards?.cardIds ?? [])
        const cardId = cards[action.cardIndex]
        const cost = cardId ? getCard(cardId).cost : 0
        // 手札から選ぶ場面は破棄・コストであることが多いので**軽いカード**を出す。
        // トラッシュ・公開ゾーンから選ぶ場面は回収・召喚が多いので**重いカード**を取る
        return zone === "hand" ? 50 - cost : 50 + cost
    }

    // スキップ。選ばずに済ませるのは、他に選ぶものがないときの最後の逃げ道にする
    return choice.optional ? 20 : 10
}

// 1手の点数。高いほど「打ちたい手」
export function scoreMove(view: GameView, me: PlayerId, move: AiMove): number {
    const action = move.action
    const my = view.players[me]
    const opp = view.players[opponentOf(me)]

    switch (action.type) {
        case "attack": {
            const attacker = my.field.spirits.find((s) => s.instanceId === action.instanceId)
            if (!attacker) return 0
            let score = 100 + bpScore(view, me, attacker)
            // 止める相手がいないならライフを削れる。相手のライフが残り1ならそれが勝ち筋
            if (!hasBlocker(view, me, attacker)) score += opp.life <= 1 ? 300 : 60
            // 返り討ちにされる相手がいるなら踏み込まない（ブロックするかは相手の判断なので減点にとどめる）
            if (hasLethalBlocker(view, me, attacker)) score -= 50
            // **守りを1体は残す**。アタックしたスピリットは疲労してブロックに回れないので、
            // 全員で殴ると次の相手ターンにライフで受けるしかなくなる。
            // 1手だけを見る評価だとこれが見えず、両者が殴り合って5ターンで終わる展開になっていた（2026-08-23）。
            // 今ターンで削り切れる見込み（相手ライフ1）のときは温存しない
            const defendersLeft = my.field.spirits.filter(
                (s) => !s.isRested && s.instanceId !== action.instanceId,
            ).length
            const opponentThreats = opp.field.spirits.filter((s) => !s.isRested).length
            if (defendersLeft === 0 && opponentThreats > 0 && opp.life > 1) score -= 130
            return score
        }
        case "summon": {
            const cardId = my.hand?.[action.handIndex]
            if (!cardId) return 0
            const card = getCard(cardId)
            const level = card.levels.find((l) => l.level === (action.level ?? 1))
            // 場のスピリットは打点でもブロッカーでもあるので、召喚は基本的に強い手として扱う。
            // シンボルはコスト軽減に効くので体数と別に加点する
            return 80 + (level ? level.bp / 1000 : 0) + card.symbol.length * 5
        }
        case "setNexus":
            return 60
        case "castMagic":
            // 効果の内容までは読まない（構造化された効果の意味づけは AI では扱わない）。
            // バトル中のフラッシュは撃ちどころなので上げ、それ以外は控えめにする
            return view.battle ? 65 : 45
        case "activateAbility":
            return 70
        case "moveCore": {
            const inst =
                my.field.spirits.find((s) => s.instanceId === action.instanceId) ??
                my.field.nexuses.find((n) => n.instanceId === action.instanceId)
            if (!inst) return 0
            // レベルが上がるコアだけ置く。上がらないコアはリザーブに残したほうが
            // 次の召喚・コスト支払いに使えるので、選ばれない点数にしておく
            const before = currentLevel(inst).level
            const after = instLevels(inst)
                .filter((l) => l.cores <= inst.cores + 1)
                .reduce((max, l) => Math.max(max, l.level), 0)
            return after > before ? 75 : 5
        }
        case "block": {
            const blocker = my.field.spirits.find((s) => s.instanceId === action.instanceId)
            const battle = view.battle
            if (!blocker || !battle) return 0
            const attacker = opp.field.spirits.find(
                (s) => s.instanceId === battle.attackerInstanceId,
            )
            const blockerBp = effectiveBp(view, me, blocker)
            const attackerBp = attacker ? effectiveBp(view, opponentOf(me), attacker) : 0
            // ライフが残り1なら、失う体を惜しまずに止める
            if (my.life <= 1) return 200 + blockerBp / 1000
            if (blockerBp > attackerBp) return 150 // 一方的に倒せる
            if (blockerBp === attackerBp) return 60 // 相打ち
            // 一方的に失うだけの当たり方。ライフに余裕があるうちは受けたほうがよいが、
            // 残り2まで削られたら体を捨ててでも止める（takeLife の点数と釣り合わせてある）
            return my.life <= 2 ? 70 : 10
        }
        case "takeLife":
            // ライフが減るほど受けたくなくなる（残り1では必ずブロックへ倒すので0）。
            // block の点数と突き合わせて「いつ体を捨てて止めるか」が決まる
            return my.life <= 1 ? 0 : 20 + my.life * 15
        case "pass":
            return 40
        case "nextPhase":
            return 20
        case "endTurn":
            return 5
        case "resolveChoice":
            return scoreChoice(view, me, action)
        default:
            return 0
    }
}

// 候補のうち最も点数の高い手を返す。同点なら列挙順（＝決定的）
export function pickBestMove(view: GameView, me: PlayerId, moves: AiMove[]): AiMove | null {
    let best: AiMove | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const move of moves) {
        const score = scoreMove(view, me, move)
        if (score > bestScore) {
            best = move
            bestScore = score
        }
    }
    return best
}

// フィールドの厚み（テストとログ用の簡易指標。手の選択には使わない）
export function boardStrength(view: GameView, pid: PlayerId): number {
    const player = view.players[pid]
    return (
        player.life * 10 +
        player.field.spirits.reduce(
            (sum, inst) => sum + bpScore(view, pid, inst) + instanceSymbolCount(inst),
            0,
        )
    )
}
