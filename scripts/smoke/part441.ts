// smoke パート441（BS16青バッチ3：047警備兵パグ／050ガイメイル・ヒドラ／052エンキドゥ・ゴレム／
// 060テクノヒュード／071海の主を祭る島／072二つの川に挟まれた王国／083クラッシュ・ザ・バビロン／
// X06霊峰魔龍ヤマタノヒドラ。docs/design/BS16_BATCH3.md）
//
// ⚠️ このworktreeはfeat/bs16-yellow-blueの新しい部品（FieldEvent opponentBurstSet／
// TargetFilter.familyExclude／battleLock"magic"）を含む上流コミットをまだ取り込めていない。
// 050 Lv1・052 Lv2・X06 Lv3 はそれに依存するためここではテストしない（052 Lv2は未実装としてcard-notesに登録済み。
// 050 Lv1・X06 Lv3はJSONは書いたが、このworktreeのエンジンでは未検証）。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroyNexus,
    destroySpirit,
    effectiveBp,
    fireStepTriggers,
    fireTrigger,
    getCard,
    placeBurst,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { hasGlobalConstraint } from "../../shared/rules"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard("BS16-047").name === "警備兵パグ" && getCard("BS16-047").type === "spirit", "047は警備兵パグ（スピリット）")
    assert(getCard("BS16-050").name === "ガイメイル・ヒドラ" && getCard("BS16-050").type === "spirit", "050はガイメイル・ヒドラ")
    assert(getCard("BS16-052").name === "エンキドゥ・ゴレム" && getCard("BS16-052").type === "spirit", "052はエンキドゥ・ゴレム")
    assert(getCard("BS16-060").name === "テクノヒュード" && getCard("BS16-060").type === "brave", "060はテクノヒュード（ブレイヴ）")
    assert(getCard("BS16-071").name === "海の主を祭る島" && getCard("BS16-071").type === "nexus" && getCard("BS16-071").cost === 4, "071は海の主を祭る島（コスト4ネクサス）")
    assert(getCard("BS16-072").name === "二つの川に挟まれた王国" && getCard("BS16-072").type === "nexus", "072は二つの川に挟まれた王国")
    assert(getCard("BS16-083").name === "クラッシュ・ザ・バビロン" && getCard("BS16-083").type === "magic", "083はクラッシュ・ザ・バビロン（マジック）")
    assert(getCard("BS16-X06").name === "霊峰魔龍ヤマタノヒドラ" && getCard("BS16-X06").type === "spirit", "X06は霊峰魔龍ヤマタノヒドラ")
    assert(getCard("BS16-050").cost === 4, "前提：050はコスト4")
    assert(getCard("BS16-053").family.includes("海首"), "前提：053は系統「海首」")
    assert(getCard("BS16-054").family.includes("覇皇"), "前提：054は系統「覇皇」")
}

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 047 警備兵パグ：自分のネクサスが破壊されたとき、フィールドに残す（コストは簡略化） ===")
{
    const s = game("047-a")
    putSpirit(s, "p1", "BS16-047", 3) // Lv2
    const nexus = putNexus(s, "p1", "BS16-071", 1)
    destroyNexus(s, "p1", nexus.instanceId)
    assert(s.players.p1.field.nexuses.length === 1, "破壊されたネクサスがフィールドに残る（reviveLastDestroyedNexus）")
}
console.log("=== 047：047自身がいなければ何も起きない ===")
{
    const s = game("047-b")
    const nexus = putNexus(s, "p1", "BS16-071", 1)
    destroyNexus(s, "p1", nexus.instanceId)
    assert(s.players.p1.field.nexuses.length === 0, "047がいなければネクサスは戻らない")
}

console.log("=== 050 ガイメイル・ヒドラ Lv2：自分のエンドステップ、ネクサス1つ破壊でコアをリザーブに（kind:step+pay） ===")
{
    const s = game("050-a")
    putSpirit(s, "p1", "BS16-050", 3) // Lv2
    putNexus(s, "p1", "BS16-071", 0)
    s.phase = "end"
    s.turnPlayer = "p1"
    const reserveBefore = s.players.p1.reserve
    fireStepTriggers(s, "end")
    assert(s.players.p1.field.nexuses.length === 0, "コスト：自分のネクサス1つが破壊された")
    assert(s.players.p1.reserve === reserveBefore + 1, "ボイドからコア1個がリザーブに置かれた")
}
console.log("=== 050：ネクサスが無ければコストが払えず不発 ===")
{
    const s = game("050-b")
    putSpirit(s, "p1", "BS16-050", 3)
    s.phase = "end"
    s.turnPlayer = "p1"
    const reserveBefore = s.players.p1.reserve
    fireStepTriggers(s, "end")
    assert(s.players.p1.reserve === reserveBefore, "ネクサスが無ければコストを払えず不発")
}

console.log("=== 052 エンキドゥ・ゴレム Lv1：【強襲：1】ネクサス疲労で回復（既存の器。familyExclude不要） ===")
{
    const s = game("052-a")
    const me = putSpirit(s, "p1", "BS16-052", 1) // Lv1
    me.isRested = true
    const nexus = putNexus(s, "p1", "BS16-071", 1)
    fireTrigger(s, "p1", me, "onAttack")
    assert(!me.isRested, "自分を回復させた")
    assert(nexus.isRested === true, "代わりにネクサスを疲労させた")
}

console.log("=== 060 テクノヒュード Lv1：召喚時、5枚破棄しトラッシュのネクサスを無償配置 ===")
{
    const s = game("060-a")
    s.players.p1.trashCards = ["BS16-071"] // 事前にトラッシュへネクサスを1枚
    const brave = createInstance("BS16-060", s.turn, 1)
    s.players.p1.field.spirits.push(brave) // スピリット状態のブレイヴとして場に出す
    refreshLevelAsOverrides(s)
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", brave, "onSummon")
    assert(s.players.p1.deck.length === deckBefore - 5, "デッキ上から5枚破棄した")
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS16-071"), "トラッシュのネクサスを無償配置した")
}
console.log("=== 071 海の主を祭る島：このネクサスの破壊時、トラッシュのネクサスを無償配置できる ===")
{
    const s = game("071-a")
    s.players.p1.trashCards = ["BS16-072"]
    const self = putNexus(s, "p1", "BS16-071", 0) // Lv1
    destroyNexus(s, "p1", self.instanceId)
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS16-072"), "破壊された071自身が、トラッシュのネクサスを無償配置した")
}
console.log("=== 071 Lv2：お互いのアタックステップ、系統「海首」の自分のスピリットのLvを1つ上として扱う ===")
{
    const s = game("071-b")
    putNexus(s, "p1", "BS16-071", 2) // Lv2
    const notKaishu = putSpirit(s, "p1", "BS16-046", 1) // 系統「戦獣」・コスト1・Lv1のバニラ（海首ではない）
    const kaishu = putSpirit(s, "p1", "BS16-053", 1) // 系統「海首」・Lv1
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(currentLevel(kaishu).level === 2, "海首を持つ053はLv2として扱われる（素のLv1+1）")
    assert(currentLevel(notKaishu).level === 1, "海首を持たない046は影響を受けない")
}

console.log("=== 072 二つの川に挟まれた王国：配置時、自分のネクサス1つを指定→同コストの相手を破壊 ===")
{
    const s = game("072-a")
    const oppSpirit = createInstance("BS16-050", s.turn, 1) // コスト4の相手のスピリット
    s.players.p2.field.spirits.push(oppSpirit)
    refreshLevelAsOverrides(s)
    const other = putNexus(s, "p1", "BS16-071", 0) // 自分のネクサス（コスト4）：手札から配置した072が指定する対象
    const self072 = createInstance("BS16-072", s.turn, 0)
    s.players.p1.field.nexuses.push(self072) // 配置直後の072自身（手札から配置）
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", self072, "onDeploy", undefined, undefined, undefined, undefined, true)
    assert(s.players.p2.field.spirits.length === 0, "自分のネクサスと同コストの相手が破壊された")
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === other.instanceId), "指定した自分のネクサス自体は残る")
}
console.log("=== 072 Lv2：お互いのアタックステップ、スピリットはネクサス/マジックの効果で回復しない ===")
{
    const s = game("072-b")
    putNexus(s, "p1", "BS16-072", 1) // Lv2
    assert(hasGlobalConstraint(s, "noRefreshByNexusOrMagic"), "noRefreshByNexusOrMagic 制約が場に出ている")
}

console.log("=== 083 クラッシュ・ザ・バビロン：フラッシュで系統「覇皇」/「雄将」の自分全てBP+4000 ===")
{
    const s = game("083-a")
    const hao = putSpirit(s, "p1", "BS16-054", 1) // 系統「覇皇」
    const other = putSpirit(s, "p1", VANILLA, 1) // 覇皇/雄将を持たない
    s.players.p1.hand[0] = "BS16-083"
    s.players.p1.reserve = 20
    const bpBefore = effectiveBp(s, "p1", hao)
    const otherBpBefore = effectiveBp(s, "p1", other)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フラッシュの使用は成功")
    assert(effectiveBp(s, "p1", hao) === bpBefore + 4000, "覇皇を持つスピリットはBP+4000")
    assert(effectiveBp(s, "p1", other) === otherBpBefore, "覇皇/雄将を持たないスピリットは影響を受けない")
}
console.log("=== 083 バースト：相手による自分のスピリット破壊後、相手のスピリット1体を破壊する（簡略化：コスト上限なし） ===")
{
    const s = game("083-b")
    placeBurst(s, "p1", "BS16-083")
    const me = putSpirit(s, "p1", VANILLA, 1)
    const oppSpirit = createInstance(VANILLA, s.turn, 1)
    s.players.p2.field.spirits.push(oppSpirit)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", me.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" } as never)
    assert(s.players.p1.burst === null, "バーストが発動しトラッシュへ置かれた")
    assert(s.players.p2.field.spirits.length === 0, "相手のスピリットが1体破壊された")
}

console.log("=== X06 霊峰魔龍ヤマタノヒドラ Lv1：【強襲：8】ネクサス疲労で回復（既存の器） ===")
{
    const s = game("x06-a")
    const me = putSpirit(s, "p1", "BS16-X06", 1) // Lv1
    me.isRested = true
    const nexus = putNexus(s, "p1", "BS16-071", 1)
    fireTrigger(s, "p1", me, "onAttack")
    assert(!me.isRested, "自分を回復させた")
    assert(nexus.isRested === true, "代わりにネクサスを疲労させた")
}
console.log("=== X06 Lv2-3：アタック時、バトル終了時にトラッシュのネクサスを無償配置できる ===")
{
    const s = game("x06-b")
    s.players.p1.trashCards = ["BS16-071"]
    const me = putSpirit(s, "p1", "BS16-X06", 4) // Lv2
    fireTrigger(s, "p1", me, "onBattleEnd", "attacker")
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS16-071"), "バトル終了時にトラッシュのネクサスを無償配置した")
}

console.log("すべてのチェックに合格しました 🎉（part441）")
