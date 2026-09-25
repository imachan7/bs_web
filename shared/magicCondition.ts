// マジックの条件。condition（「〜とき、〜する」＝解決の時点で見る）と useCondition（「この効果は〜ないと使えない」＝使う前に見る）が
// 同じ軸を使う（2026-09-26 ユーザー確認：そもそも使えないものは使用条件、条件を満たすと効果が出るものは解決時の条件）
import type { MagicCondition, PlayerId } from "../server/src/type"
import type { Board } from "./board"
import { card } from "./cardDb"
import { countSpiritsWeighted, instanceSymbolCount, instHasColor, opponentFieldColorCount, spiritHasFamily } from "./rules"
import { ownFieldSymbolColors } from "./cost"

// 満たしていれば null、満たしていなければ理由の文を返す
export function magicConditionFailure(board: Board, owner: PlayerId, cond: MagicCondition): string | null {
    const field = board.players[owner].field
    if ("ownFamilyCountAtLeast" in cond) {
        const { family, count } = cond.ownFamilyCountAtLeast
        const total = countSpiritsWeighted(board, owner, owner, (s) => spiritHasFamily(board, owner, s, family), "magic")
        return total < count ? `系統「${family}」を持つスピリットが${count}体未満` : null
    }
    if ("ownFieldHasMinSymbolSpirit" in cond) {
        const min = cond.ownFieldHasMinSymbolSpirit
        return field.spirits.some((s) => instanceSymbolCount(s) >= min) ? null : `シンボル${min}個以上を持つスピリットがいない`
    }
    if ("ownSpiritIsBlocking" in cond) {
        const blockerId = board.battle?.blockerInstanceId
        return blockerId != null && field.spirits.some((s) => s.instanceId === blockerId) ? null : "自分のスピリットがブロックしていない"
    }
    if ("bothFieldsHaveNexus" in cond) {
        return board.players.p1.field.nexuses.length > 0 && board.players.p2.field.nexuses.length > 0 ? null : "どちらかのフィールドにネクサスがない"
    }
    if ("ownSpiritCountAtLeast" in cond) {
        return field.spirits.length >= cond.ownSpiritCountAtLeast ? null : `自分のスピリットが${cond.ownSpiritCountAtLeast}体未満`
    }
    if ("ownFieldHasColorSpirits" in cond) {
        return cond.ownFieldHasColorSpirits.every((c) => field.spirits.some((s) => instHasColor(s, c))) ? null : "必要な色のスピリットがそろっていない"
    }
    if ("ownFieldHasAllNames" in cond) {
        // cardId ではなく名前の完全一致
        const names = new Set(field.spirits.map((s) => card(s.cardId).name))
        return cond.ownFieldHasAllNames.every((n) => names.has(n)) ? null : "指定されたスピリットがフィールドにそろっていない"
    }
    if ("ownNameIncludesCountAtLeast" in cond) {
        const { names, count } = cond.ownNameIncludesCountAtLeast
        const matched = field.spirits.filter((s) => names.some((n) => card(s.cardId).name.includes(n))).length
        return matched >= count ? null : `カード名に「${names.join("」か「")}」と入っているスピリットがいない`
    }
    if ("opponentFieldColorsAtLeast" in cond) {
        const { opponentFieldColorsAtLeast: min, spiritsOnly } = cond
        return opponentFieldColorCount(board, owner, spiritsOnly) >= min ? null : `相手のフィールドの色が${min}色未満`
    }
    // 数え方は shared/cost.ts の ownFieldSymbolColors に一本化してある（軽減計算とそろえるため。2026-08-20）
    return ownFieldSymbolColors(board, owner).size >= cond.ownFieldSymbolColorsAtLeast ? null : `シンボルの色が${cond.ownFieldSymbolColorsAtLeast}色未満`
}
