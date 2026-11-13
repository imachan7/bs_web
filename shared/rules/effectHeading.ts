// 効果の見出し（『このスピリットのアタック時』『ブロック時』）と、その書き換え（アタックシフト等）。
// 見出しは2つの読み方をする（2026-11-13 ユーザー確定。HANDOFF §1。#505）:
//   printedSides … 印刷された見出し。「『〜時』効果は発揮されない」（月光姫マーニ等）が見る（Q20010／Q24529／Q24751）
//   firesAs      … 書き換えを足した見出し。いつ発揮するか・借用・付与・再発揮が見る
// 書き換えはすべて「追加」で、元の見出しでも発揮する（Q24527 アタックシフト・Q1953 ドラグノ近衛兵・Q24677 ブレイブチャージ）。
// 「アタック時効果になる」（印刷の側を変える）効果は今のプールに無い。出たら printedSides の側に足す
import { noteCoverage } from "../coverage"
import type { CardInstance, PlayerId, TriggerEvent } from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { effectSources, currentLevel } from "./level"
import { entryActive } from "./effectStop"
import { matchesFamilyFilter, spiritHasKeyword } from "./keywordState"
import { timedContentsOn } from "./constraints"

export type HeadingSide = "attack" | "block"
type Headed = { trigger: TriggerEvent; heading?: "attack" | "block" | "attackOrBlock" }
export type HeadingRewrites = { blockToAttack: boolean; attackToBlock: boolean }

export function printedSides(e: Headed): HeadingSide[] {
    if (e.trigger === "onAttack") return ["attack"]
    if (e.trigger === "onBlock") return ["block"]
    if (e.heading === "attackOrBlock") return ["attack", "block"]
    return e.heading !== undefined ? [e.heading] : []
}

export function firesAs(e: Headed, rw: HeadingRewrites): HeadingSide[] {
    const sides = printedSides(e)
    const out = new Set(sides)
    if (rw.blockToAttack && sides.includes("block")) out.add("attack")
    if (rw.attackToBlock && sides.includes("attack")) out.add("block")
    return [...out]
}

// 誘発 event が起きたとき、e がその側（side）の効果として発揮するか。
// アタック宣言・ブロック宣言は onAttack／onBlock のどちらの見出しのエントリも候補にし、書き換え後の側で絞る。
// 結果連動型（onBattleWin 等）は trigger が一致し、見出しがあれば発揮した側（side）で絞る（旧 battleRole）
export function firesAt(e: Headed, event: TriggerEvent, side: HeadingSide | undefined, rw: HeadingRewrites): boolean {
    const declaration = event === "onAttack" || event === "onBlock"
    if (declaration ? e.trigger !== "onAttack" && e.trigger !== "onBlock" : e.trigger !== event) return false
    if (side === undefined || printedSides(e).length === 0) return true
    return firesAs(e, rw).includes(side)
}

// 「『〜時』効果は発揮されない」の照合に使う、印刷された見出しの誘発名。見出しの無いものは trigger のまま。
// 『アタック時／ブロック時』の両方を持つ見出しは、いま発揮している側で読む
export function printedTrigger(e: Headed, side: HeadingSide | undefined): TriggerEvent {
    const sides = printedSides(e)
    if (sides.length === 0) return e.trigger
    const s = sides.length === 1 || side === undefined ? sides[0]! : side
    return s === "attack" ? "onAttack" : "onBlock"
}

export function sideOf(event: TriggerEvent, battleRole: "attacker" | "blocker" | undefined): HeadingSide | undefined {
    if (event === "onAttack") return "attack"
    if (event === "onBlock") return "block"
    return battleRole === "attacker" ? "attack" : battleRole === "blocker" ? "block" : undefined
}

export function headingRewritesOn(board: Board, ownerPid: PlayerId, inst: CardInstance): HeadingRewrites {
    const timed = timedContentsOn(board, inst)
    return {
        blockToAttack: timed.some((c) => c.type === "triggerSwap" && c.from === "onBlock") || blockTriggersAsAttack(board, ownerPid, inst),
        attackToBlock: timed.some((c) => c.type === "triggerSwap" && c.from === "onAttack") || attackTriggersAsBlock(board, ownerPid, inst),
    }
}

// kind:"blockTriggersAsAttackGrant"（発生源の持ち主のスピリットに効く）
function blockTriggersAsAttack(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    for (const source of effectSources(board, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "blockTriggersAsAttackGrant") continue
            if (!entryActive(board, ownerPid, source, effect, level)) continue
            if (effect.whileOwnBurstSet === true && !board.players[ownerPid].burstSet) continue
            if (effect.phaseTurn) {
                const { phase, turn } = effect.phaseTurn
                if (board.phase !== phase) continue
                if (turn === "own" && ownerPid !== board.turnPlayer) continue
                if (turn === "opponent" && ownerPid === board.turnPlayer) continue
            }
            if (effect.familyFilter && !matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)) continue
            noteCoverage(effect, "blockTriggersAsAttackGrant")
            return true
        }
    }
    return false
}

// kind:"attackTriggersAsBlockGrant"。target:"anyAll" は両陣営のスピリットに効くので両プレイヤーの発生源を見る。
// phaseTurn は発生源の持ち主基準（『相手のアタックステップ』＝発生源の持ち主が非ターンプレイヤー）
function attackTriggersAsBlock(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(board, sourcePid)) {
            const level = currentLevel(source).level
            for (const effect of card(source.cardId).effects) {
                if (effect.kind !== "attackTriggersAsBlockGrant") continue
                if (!entryActive(board, sourcePid, source, effect, level)) continue
                if (effect.target === "ownAll" && sourcePid !== ownerPid) continue
                if (effect.target === "self" && source.instanceId !== inst.instanceId) continue
                if (effect.phaseTurn) {
                    const { phase, turn } = effect.phaseTurn
                    if (board.phase !== phase) continue
                    if (turn === "own" && sourcePid !== board.turnPlayer) continue
                    if (turn === "opponent" && sourcePid === board.turnPlayer) continue
                }
                if (effect.familyFilter && !matchesFamilyFilter(board, ownerPid, inst, effect.familyFilter)) continue
                noteCoverage(effect, "attackTriggersAsBlockGrant")
                if (effect.keywordFilter && !spiritHasKeyword(board, ownerPid, inst, effect.keywordFilter)) continue
                return true
            }
        }
    }
    return false
}
