// ソウルコア（26系）のプリミティブ。設計は docs/design/SOULCORE.md
//
// 案B-inside（2026-10-06 ユーザー確定）: ソウルコアもコア。数値（reserve / trashCores / inst.cores）には
// **最初からソウルコアを含めて数える**。ポインタ (PlayerState.soulCore) は「どのコアが[ソウルコア]か」を
// 示す。レベル判定・維持コア・「コアの数」の比較・烈神速の閾値は数値をそのまま使えばよい。
// ポインタと数値の両方を動かしてよい唯一の関数は moveSoulCore（通常コア側の操作はポインタを触らない）。
//
// 通常コアだけを扱いたい場面（通常コアの取り出し上限・「リザーブからコアを置く」の候補数等）では
// normalReserveOf / normalTrashOf / normalCoresOn を使うこと（ソウルコアぶんを差し引いた数）。
import type { CardInstance, GameState, PlayerId, PlayerState, SoulCoreLocation } from "../type"
import { instMinLevelCores, getCard } from "./GameState"
import { requestChoice } from "./targeting"
import { cardHasTeam } from "../../../shared/rules/level"
import type { EffectAction } from "../types/effectAction"

// ソウルコアが loc にいるか。soulCore === null（この対戦でソウルコアなし）なら常に false
export function soulCoreIsAt(player: PlayerState, loc: SoulCoreLocation): boolean {
    const soul = player.soulCore
    if (soul === null) return false
    if (soul.zone !== loc.zone) return false
    if (loc.zone === "instance" && soul.zone === "instance") return soul.instanceId === loc.instanceId
    return true
}

// instanceId の個体（スピリット/ネクサス）の上にソウルコアが載っているか
export function soulCoreOnInstance(player: PlayerState, instanceId: string): boolean {
    const soul = player.soulCore
    return soul !== null && soul.zone === "instance" && soul.instanceId === instanceId
}

// リザーブにソウルコアがあるか（支払い・「リザーブの[ソウルコア]」効果の判定用）
export function soulCoreInReserve(player: PlayerState): boolean {
    return player.soulCore !== null && player.soulCore.zone === "reserve"
}

// [ソウルコア]がトラッシュ以外（リザーブ・場の個体）にあるか（soulCoreToTrash が成立するか）
export function soulCoreToTrashPossible(soul: SoulCoreLocation | null): boolean {
    return soul !== null && soul.zone !== "trash"
}

// トラッシュにソウルコアがあるか（「トラッシュの[ソウルコア]」効果・支払いの判定用）
export function soulCoreInTrash(player: PlayerState): boolean {
    return player.soulCore !== null && player.soulCore.zone === "trash"
}

// 直近の《継召》（exTrashReduction）で除外したカードのうち、指定チーム（CardData.team）所属が
// count枚以上か（26系「この継召で【X】を持つカードをN枚以上除外していたなら」）。
// GameState.keishoExcludedCardIds は毎回の召喚で上書きされるため、読むのは直近の召喚の《継召》結果だけ
export function keishoExcludedTeamAtLeast(state: GameState, spec: { team: string; count: number }): boolean {
    const n = (state.keishoExcludedCardIds ?? []).filter((id) => cardHasTeam(getCard(id), spec.team)).length
    return n >= spec.count
}

// 個体（スピリット/ネクサス/合体中ブレイヴ）を instanceId で探す。場から splice 済みでも呼び出し側が
// オブジェクトを持っている場合は moveSoulCore の fromInst 引数に直接渡すこと
function soulInstance(player: PlayerState, instanceId: string): CardInstance | undefined {
    return (
        player.field.spirits.find((s) => s.instanceId === instanceId) ??
        player.field.nexuses.find((n) => n.instanceId === instanceId) ??
        player.field.combinedBraves.find((b) => b.instanceId === instanceId)
    )
}

// ソウルコアを to へ移す。**ポインタと数値の両方を書き換えてよい唯一の関数**（案B-inside）。
// 移動元・移動先の数値（reserve / trashCores / inst.cores）を1個ぶんずつ動かす。
// fromInst は移動元が個体で既に field から splice 済みのときに呼び出し側が渡す（数値調整に必要）。
// 移動先の妥当性（行き先の実在・「行けない場所はライフとボイド」）の検証は呼び出し側で済ませること
export function moveSoulCore(player: PlayerState, to: SoulCoreLocation, fromInst?: CardInstance): void {
    const from = player.soulCore
    if (from !== null) {
        if (from.zone === "reserve") {
            player.reserve -= 1
        } else if (from.zone === "trash") {
            player.trashCores -= 1
        } else {
            const inst = fromInst ?? soulInstance(player, from.instanceId)
            if (inst) {
                inst.cores -= 1
                delete inst.soulCoreOn
            }
        }
    }
    if (to.zone === "reserve") {
        player.reserve += 1
    } else if (to.zone === "trash") {
        player.trashCores += 1
    } else {
        const inst = soulInstance(player, to.instanceId)
        if (inst) {
            inst.cores += 1
            inst.soulCoreOn = true
        }
    }
    player.soulCore = to
}

// ---- 通常コアだけを数えるヘルパー（案B-inside: 数値にはソウルコアが含まれているため、
// 通常コアの取り出し上限を数える場面ではソウルコアぶんを差し引く）----

// リザーブの通常コア数（「リザーブからコアを置く」等の候補数・通常コアだけの支払い能力の検証で使う）
export function normalReserveOf(player: PlayerState): number {
    return player.reserve - (soulCoreInReserve(player) ? 1 : 0)
}

// トラッシュの通常コア数（「トラッシュのコアを〜へ置く」効果の取り出し上限で使う）
export function normalTrashOf(player: PlayerState): number {
    return player.trashCores - (soulCoreInTrash(player) ? 1 : 0)
}

// 個体の通常コア数（覚醒等「通常コアを移す」操作の取り出し上限で使う）
export function normalCoresOn(player: PlayerState, inst: CardInstance): number {
    return inst.cores - (soulCoreOnInstance(player, inst.instanceId) ? 1 : 0)
}

// 召喚/配置した個体の維持コアとして[ソウルコア]を置く（2026-10-06 ユーザー確定）。
// 案B-insideでは createInstance の cores に[ソウルコア]ぶんが既に含まれているため、
// ここではリザーブの取り崩し（reserve-1）とポインタの書き換えだけを行う。
// moveSoulCore と違い cores への加算をしない（呼び出し側が維持コア数に最初から含めて個体を作る）。
// 個体はまだフィールドに載っていないことがあるため inst オブジェクトを直接受け取る
export function placeSoulCoreOnSummoned(player: PlayerState, inst: CardInstance): boolean {
    if (!soulCoreInReserve(player)) return false
    player.reserve -= 1
    player.soulCore = { zone: "instance", instanceId: inst.instanceId }
    inst.soulCoreOn = true
    return true
}

// 維持コア（Lv1）を下回っているか（消滅判定）。数値にソウルコアが含まれるため inst.cores と直接比較する。
// ソウルコア1個だけが載っている個体はLv1の維持コアを満たすため消滅しない（2026-10-05 ユーザー確定）
export function wouldDepleteOf(player: PlayerState, inst: CardInstance): boolean {
    return inst.cores < instMinLevelCores(inst)
}

// 上の state + ownerPid 版（呼び出し側が pid しか持っていない場面で使う）
export function wouldDeplete(state: GameState, ownerPid: PlayerId, inst: CardInstance): boolean {
    return wouldDepleteOf(state.players[ownerPid], inst)
}

// 個体が場を離れるときのソウルコア退避（破壊・消滅・手札/デッキへ戻る・バーストへ）。
// 行き先は通常コアと同じリザーブ。inst を渡すのは既に field から splice 済みでも
// 数値（inst.cores）を正しく動かせるようにするため。**cores を移す行より前に呼ぶこと**
export function soulCoreLeavesField(player: PlayerState, inst: CardInstance): void {
    if (soulCoreOnInstance(player, inst.instanceId)) moveSoulCore(player, { zone: "reserve" }, inst)
}

// 段4（§1.3・2026-10-05 ユーザー確定「文言の有無にかかわらず一律に聞く」）:
// 相手の効果で、[ソウルコア]が載った個体からリザーブ/トラッシュへコアを移すとき、
// 持ち主に「ソウルコアを含めるか」を聞く。答えは効果アクションの再送（chosenOption）で戻る。
// ボイド行きは選択なし（ソウルコアは行けないため）。非対話のデフォルトは含めない（通常コア優先）
// 戻り値: true=含める / false=含めない / "asked"=聞いて中断した（呼び出し側はただちに抜けること）
export function soulCoreInclusionDecision(
    state: GameState,
    actorPid: PlayerId,
    targetPid: PlayerId,
    inst: CardInstance,
    dest: "reserve" | "trash",
    action: EffectAction & { soulChoiceTarget?: string },
    self: CardInstance | null,
    sourceName: string,
    chosenOption: string | undefined,
): boolean | "asked" {
    // 再入: この個体についての答えが chosenOption で戻ってきている
    if (action.soulChoiceTarget === inst.instanceId && chosenOption !== undefined) {
        return chosenOption.includes("[ソウルコア]を含める")
    }
    // 聞く条件: 効果の持ち主と対象の持ち主が違い、ソウルコアが載っていて、行き先がリザーブ/トラッシュ
    if (targetPid === actorPid) return false
    if (!soulCoreOnInstance(state.players[targetPid], inst.instanceId)) return false
    if (!state.interactiveTargets) return false // 非対話のデフォルトは含めない
    requestChoice(
        state,
        actorPid,
        `${sourceName}：${getCard(inst.cardId).name}からコアを移す際、[ソウルコア]を含めますか？`,
        [],
        false,
        // soulChoiceTarget は coreRemove の内部用フィールド（effectAction.ts の該当メンバーのみが持つ）
        { ...action, soulChoiceTarget: inst.instanceId } as EffectAction,
        self,
        "option",
        ["[ソウルコア]は残す", "[ソウルコア]を含める"],
        targetPid, // 選ぶのは対象の持ち主。効果の解決は発動者側のまま（actorPid）
    )
    return "asked"
}
