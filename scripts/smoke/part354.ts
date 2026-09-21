// smoke パート354（BS16バッチ2 B群 §3〜5：BS16-027コーカサス・リョフ・ビートル／P071サイゴード・アームズ／
// BS16-080次元断。docs/design/BS16_HOOKS_B.md）
// - 027-e1: kind:"burst" event:"ownSpiritDestroyed" byOpponentEffectOnly + condition:opponentFamilyCountAtLeast
// - 027-e2: kind:"triggered" trigger:"onAttack" action:selfBuff（BP+10000）
// - 027-e3: kind:"fieldEvent" event:"opponentSpiritDestroyed" duringSelfAttack + action:exhaustOpponentSameFamilyAll
// - P071-e2: kind:"triggered" trigger:"onAttack" whileCombined action:millThenCoreIfBurst
// - 080-e1/e2: burst event:"ownLifeDamaged" thenPay:"flash" → magic timing:"flash" action:destroyLifeDamager
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・色・コストを機械検証してから使う。
import { destroyTargetsBatch, attachBrave } from "../../server/src/logic/removal"
import { fireCombinedAttackTrigger, findSpiritAny } from "../../server/src/logic/EffectModules"
import {
    assert,
    createGame,
    createInstance,
    effectiveBp,
    fireFieldEventTriggers,
    fireTrigger,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const COKA = "BS16-027" // コーカサス・リョフ・ビートル（緑・コスト9）
const P071 = "P071" // サイゴード・アームズ（緑/青ブレイヴ・コスト4）
const GENJI_DAN = "BS16-080" // 次元断（白マジック・コスト4）
const FAMILY_SPIRIT = "BS16-005" // ゴエモン・シーフ・ドラゴン（赤・系統：覇皇/戦竜）
const BURST_SPIRIT = "P069" // ロード・ブレイバン（【バースト】持ち。破棄カードとして使うだけ）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(COKA).name === "コーカサス・リョフ・ビートル" && getCard(COKA).type === "spirit" && getCard(COKA).colors.includes("green") && getCard(COKA).cost === 9, "027")
    assert(getCard(P071).name === "サイゴード・アームズ" && getCard(P071).type === "brave" && getCard(P071).cost === 4, "P071")
    assert(getCard(GENJI_DAN).name === "次元断" && getCard(GENJI_DAN).type === "magic" && getCard(GENJI_DAN).colors.includes("white") && getCard(GENJI_DAN).cost === 4, "080")
    assert(getCard(FAMILY_SPIRIT).family.includes("覇皇"), "FAMILY_SPIRITは覇皇を持つ")
    assert(getCard(BURST_SPIRIT).effects.some((e) => e.kind === "burst"), "BURST_SPIRITは【バースト】持ち")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 027-e1：相手による自分のスピリット破壊後、系統一致の相手がいれば自身を召喚する ===")
{
    const s = game("027-burst-yes")
    s.players.p1.burst = COKA
    s.players.p1.burstSet = true
    const victim = put(s, "p1", VANILLA, 1)
    put(s, "p2", FAMILY_SPIRIT, 1) // 覇皇/戦竜を持つ
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: victim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === COKA), "系統一致の相手がいたので027が召喚された")
}
{
    const s = game("027-burst-no")
    s.players.p1.burst = COKA
    s.players.p1.burstSet = true
    const victim = put(s, "p1", VANILLA, 1)
    put(s, "p2", VANILLA, 1) // 系統が無い
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: victim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === COKA), "系統一致の相手がいないので召喚されない")
    assert(s.players.p1.trashCards.includes(COKA), "その代わりトラッシュへ置かれた")
}

console.log("=== 2. 027-e2 Lv1〜3：このスピリットのアタック時、BP+10000する ===")
{
    const s = game("027-selfbuff")
    const coka = put(s, "p1", COKA, 1) // Lv1
    const before = effectiveBp(s, "p1", coka)
    fireTrigger(s, "p1", coka, "onAttack")
    assert(effectiveBp(s, "p1", coka) === before + 10000, `BPが10000上昇した（実際+${effectiveBp(s, "p1", coka) - before}）`)
}

console.log("=== 3. 027-e3 Lv2〜3：このスピリットのアタック中に相手のスピリットが破壊されたとき、同じ系統の相手すべてを疲労させる ===")
{
    const s = game("027-exhaust-yes")
    const coka = put(s, "p1", COKA, 4) // Lv2
    const victim = put(s, "p2", FAMILY_SPIRIT, 1)
    const ally = put(s, "p2", FAMILY_SPIRIT, 1) // 同じ系統
    s.battle = { attackerInstanceId: coka.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    destroyTargetsBatch(s, "p1", [{ pid: "p2", instanceId: victim.instanceId }], { sourcePid: "p1", sourceType: "spirit" })
    assert(ally.isRested === true, "このスピリットのアタック中だったので、同じ系統の相手が疲労した")
}
{
    const s = game("027-exhaust-no")
    put(s, "p1", COKA, 4) // Lv2（アタック中ではない）
    const victim = put(s, "p2", FAMILY_SPIRIT, 1)
    const ally = put(s, "p2", FAMILY_SPIRIT, 1)
    s.battle = null
    destroyTargetsBatch(s, "p1", [{ pid: "p2", instanceId: victim.instanceId }], { sourcePid: "p1", sourceType: "spirit" })
    assert(ally.isRested === false, "このスピリットのアタック中でなければ疲労しない")
}

console.log("=== 4. P071【合体時】合体アタック時：相手のデッキを2枚破棄し、バーストが混ざっていればコア1個を置く ===")
{
    const s = game("p071-core-yes")
    const host = put(s, "p1", VANILLA, 1)
    const brave = createInstance(P071, s.turn, 0)
    s.players.p1.field.spirits.push(brave)
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    s.players.p2.deck = [BURST_SPIRIT, VANILLA, ...s.players.p2.deck]
    const coresBefore = host.cores
    fireCombinedAttackTrigger(s, "p1", host, "onAttack")
    assert(s.players.p2.trashCards.slice(0, 2).includes(BURST_SPIRIT), "デッキの上から2枚が破棄された")
    assert(host.cores === coresBefore + 1, `バースト持ちが混ざっていたのでホストにコアが1個置かれた（実際${host.cores - coresBefore}）`)
}
{
    const s = game("p071-core-no")
    const host = put(s, "p1", VANILLA, 1)
    const brave = createInstance(P071, s.turn, 0)
    s.players.p1.field.spirits.push(brave)
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    s.players.p2.deck = [VANILLA, VANILLA, ...s.players.p2.deck]
    const coresBefore = host.cores
    fireCombinedAttackTrigger(s, "p1", host, "onAttack")
    assert(host.cores === coresBefore, "バースト持ちが混ざっていなければコアは置かれない")
}

console.log("=== 5. 080：ライフ減少後に手札に戻し、その後コストを払ってライフを減らした相手を破壊する ===")
{
    const s = game("080-flash-battle")
    s.players.p1.burst = GENJI_DAN
    s.players.p1.burstSet = true
    const attacker = put(s, "p2", VANILLA, 1) // ライフを減らした相手（軽いBP）
    const bystander = put(s, "p2", FAMILY_SPIRIT, 1) // BPが高いので手札に戻る側の自動選択対象
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false, lifeDamagers: [attacker.instanceId] }
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p2.hand.includes(bystander.cardId), "メイン効果で相手のスピリット1体を手札に戻した")
    assert(findSpiritAny(s, attacker.instanceId) === null, "フラッシュ効果でライフを減らした相手（このバトルの間）が破壊された")
}
{
    const s = game("080-flash-none")
    s.players.p1.burst = GENJI_DAN
    s.players.p1.burstSet = true
    const bystander = put(s, "p2", FAMILY_SPIRIT, 1)
    s.battle = null // ライフを減らした相手の記録が無い
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p2.hand.includes(bystander.cardId), "メイン効果（手札に戻す）は記録が無くても成立する")
    assert(s.players.p2.field.spirits.length === 0, "フラッシュ効果は対象がおらず不発（追加の破壊は起きない）")
}
console.log("=== 6. destroyLifeDamager：両方に対象がいるときはoptionで選ばせる ===")
{
    const s = game("080-option-choice")
    const battleTarget = put(s, "p2", VANILLA, 1)
    const burstTarget = put(s, "p2", FAMILY_SPIRIT, 1)
    s.battle = { attackerInstanceId: battleTarget.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false, lifeDamagers: [battleTarget.instanceId] }
    s.burstEventLifeDamagerId = burstTarget.instanceId
    s.interactiveTargets = true
    resolveAction(s, "p1", null, { type: "destroyLifeDamager" }, undefined, undefined, "magic")
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "option", "両方に対象がいるのでoption選択が立つ")
    assert(
        (s.pendingChoice?.options ?? []).length === 2,
        "選択肢は「このバトルの間」/「このバースト発動時」の2つ",
    )
}

console.log("すべてのチェックに合格しました 🎉（part354）")
