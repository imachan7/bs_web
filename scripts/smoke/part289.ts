// smoke パート289（BS12 バッチ2・紫：新しく足した6つの器を1件ずつ発火させる）
// K=mutualKeepChoice／T=coresToOpponentReserveGoToTrash／reviveOnDestroy.whileCombined／
// exhaustImmunityGrant.scope:"self"（ブレイヴの効果も防ぐ）／costMod.ownTrashFamilyCountAtLeast／
// discardOpponentTegamotoVoidCoresPer／voidCoresFromField／coreRemoveByPayingSelfCores
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    effectiveCost,
    getCard,
    handleAction,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave } from "../../server/src/logic/removal"
import { refreshLevelAsOverrides } from "../../server/src/logic/EffectModules"

const DILGAN = "BS12-012" // 戦車皇ディルガン（coreRemoveByPayingSelfCores／exhaustImmunityGrant scope:self）
const KURONO = "BS12-015" // 冥王神龍クロノ・ハデス（mutualKeepChoice／symbol2つ）
const GIGASHA = "BS12-016" // 骸巨人ギ・ガッシャ（costMod ownTrashFamilyCountAtLeast）
const SWORDOLE = "BS12-009" // ソードール（系統「無魔」のトラッシュ枚数稼ぎ用）
const DESUHEIZU = "BS12-052" // デス・ヘイズ（reviveOnDestroy whileCombined）
const NO_SYMBOL_BRAVE = "BS12-050" // 突機竜アーケランサー（symbol: []。combined:trueだけ作る用）
const STEINBORG = "BS12-X02" // 魔羯邪神シュタイン・ボルグ（coresToOpponentReserveGoToTrash／countCounter回収）

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== §A mutualKeepChoice：お互い自分のフィールドから1体ずつ指定し、指定されなかった全員を破壊 ===")
{
    const s = game("mutual-keep")
    const self = createInstance(KURONO, s.turn, 3) // 発生源自身（破壊待機中を想定。候補から除外される）
    const ownKeep = createInstance("BS01-001", s.turn, 1) // p1唯一の候補→自動で残る
    const oppKeep = createInstance("BS01-003", s.turn, 3) // p2でBP最大（BP6000）→自動で残る
    const oppDie = createInstance("BS01-002", s.turn, 1) // p2でBP最小（BP1000）→破壊される
    s.players.p1.field.spirits.push(self, ownKeep)
    s.players.p2.field.spirits.push(oppKeep, oppDie)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", self, { type: "mutualKeepChoice" })
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === self.instanceId), "発生源自身は対象外のまま場に残る")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === ownKeep.instanceId), "自分側の唯一の候補は指定されて残る")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === oppKeep.instanceId), "相手側のBP最大は自動指定されて残る")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === oppDie.instanceId), "指定されなかったスピリットは破壊される")
}

console.log("=== §B coresToOpponentReserveGoToTrash：相手のリザーブに置かれるはずのコアがトラッシュへ振り替わる ===")
{
    const s = game("core-to-trash")
    const stein = createInstance(STEINBORG, s.turn, 3) // cores3＝Lv2でconstraint有効（levels cores[1,3,6]）
    const p2spirit = createInstance("BS01-001", s.turn, 2)
    p2spirit.cores = 5
    s.players.p1.field.spirits.push(stein)
    s.players.p2.field.spirits.push(p2spirit)
    refreshLevelAsOverrides(s)
    const reserveBefore = s.players.p2.reserve
    const trashBefore = s.players.p2.trashCores
    // spirit効果によるcoreRemove（既定dest=リザーブ）が、コンストレイントによりp2のトラッシュへ振り替わることを確認
    resolveAction(s, "p1", stein, { type: "coreRemove", count: 2 }, p2spirit.instanceId, undefined, "spirit")
    assert(p2spirit.cores === 3, "対象スピリットのコアは2個減った")
    assert(s.players.p2.reserve === reserveBefore, "本来増えるはずのリザーブは増えていない")
    assert(s.players.p2.trashCores === trashBefore + 2, "代わりに相手のトラッシュへ2個置かれた")
}

console.log("=== §C reviveOnDestroy whileCombined：合体しているホストが破壊される代わりに疲労状態で戻る ===")
{
    const s = game("revive-combined")
    const host = createInstance("BS01-001", s.turn, 2)
    const brave = createInstance(DESUHEIZU, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    s.players.p1.hand.push("BS01-002") // handDiscardOneのコスト用
    attachBrave(s, "p1", host, brave)
    refreshLevelAsOverrides(s)
    const handBefore = s.players.p1.hand.length
    destroySpirit(s, "p1", host.instanceId)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは破壊される代わりに場に残る")
    assert(host.isRested === true, "戻ったホストは疲労状態")
    assert(s.players.p1.hand.length === handBefore - 1, "コストの手札1枚を破棄した")
}

console.log("=== §D exhaustImmunityGrant scope:\"self\"：ブレイヴの効果でも疲労しない ===")
{
    const s = game("exhaust-immune-self")
    const dilgan = createInstance(DILGAN, s.turn, 3) // cores3＝Lv2で有効（levels cores[1,3,6]）
    s.players.p1.field.spirits.push(dilgan)
    refreshLevelAsOverrides(s)
    // 相手のブレイヴの効果として疲労させようとする（sourceType:"brave"）
    resolveAction(s, "p2", null, { type: "exhaust", count: 1 }, dilgan.instanceId, undefined, "brave")
    assert(dilgan.isRested === false, "ブレイヴの効果でも疲労しない（scope:self）")
}

console.log("=== §E costMod ownTrashFamilyCountAtLeast：トラッシュの「無魔」が5枚以上でコストが下がる ===")
{
    const s = game("costmod-trash")
    const card = getCard(GIGASHA)
    assert(effectiveCost(s, "p1", card) === card.cost, "トラッシュ条件を満たす前は素のコストのまま")
    for (let i = 0; i < 5; i++) s.players.p1.trashCards.push(SWORDOLE)
    assert(effectiveCost(s, "p1", card) === 3, "無魔のスピリットカードが5枚以上でコスト3になる")
}

console.log("=== §F discardOpponentTegamotoVoidCoresPer：手元を破棄した枚数ぶんリザーブ優先でボイドへ ===")
{
    const s = game("tegamoto-void")
    s.players.p2.tegamoto = ["BS01-001", "BS01-002"]
    s.players.p2.reserve = 3
    const spirit = createInstance("BS01-003", s.turn, 2)
    spirit.cores = 5
    s.players.p2.field.spirits.push(spirit)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "discardOpponentTegamotoVoidCoresPer" })
    assert(s.players.p2.tegamoto.length === 0, "手元のカードはすべて破棄された")
    assert(s.players.p2.trashCards.includes("BS01-001") && s.players.p2.trashCards.includes("BS01-002"), "破棄したカードはトラッシュへ")
    assert(s.players.p2.reserve === 1, "破棄した2枚ぶん、リザーブ優先でコアがボイドに置かれた")
    assert(spirit.cores === 5, "リザーブで足りたのでフィールドのコアは減らなかった")
}

console.log("=== §G voidCoresFromField：自分のフィールドのコアを払うことで相手のフィールドのコアをボイドへ ===")
{
    const s = game("void-cores-field")
    const ownSpirit = createInstance("BS01-001", s.turn, 2)
    ownSpirit.cores = 3
    const oppSpirit = createInstance("BS01-002", s.turn, 2)
    oppSpirit.cores = 5
    s.players.p1.field.spirits.push(ownSpirit)
    s.players.p2.field.spirits.push(oppSpirit)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "voidCoresFromField", side: "opponent", count: 4, costOwnFieldCoresToVoid: 3 })
    assert(ownSpirit.cores === 0, "自分のフィールドのコア3個をコストとしてボイドに置いた")
    assert(oppSpirit.cores === 1, "相手のフィールドのコア4個をボイドに置いた")
}
{
    const s = game("void-cores-field-cost-short")
    const ownSpirit = createInstance("BS01-001", s.turn, 2)
    ownSpirit.cores = 2 // 3個に届かない
    const oppSpirit = createInstance("BS01-002", s.turn, 2)
    oppSpirit.cores = 5
    s.players.p1.field.spirits.push(ownSpirit)
    s.players.p2.field.spirits.push(oppSpirit)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "voidCoresFromField", side: "opponent", count: 4, costOwnFieldCoresToVoid: 3 })
    assert(ownSpirit.cores === 2, "コストを払いきれないときは何も起きない（自分側）")
    assert(oppSpirit.cores === 5, "コストを払いきれないときは何も起きない（相手側）")
}

console.log("=== §H coreRemoveByPayingSelfCores：selfのコアを好きなだけ払い、1個につき対象のコアをトラッシュへ ===")
{
    const s = game("pay-self-cores")
    s.interactiveTargets = true
    const dilgan = createInstance(DILGAN, s.turn, 3)
    dilgan.cores = 5
    const target = createInstance(KURONO, s.turn, 3) // symbol2つ
    target.cores = 3
    const brave = createInstance(NO_SYMBOL_BRAVE, s.turn, 1) // symbol:[] のまま合体させてcombined:trueにする
    s.players.p1.field.spirits.push(dilgan)
    s.players.p2.field.spirits.push(target)
    attachBrave(s, "p2", target, brave)
    refreshLevelAsOverrides(s)
    const trashBefore = s.players.p1.trashCores
    resolveAction(s, "p1", dilgan, {
        type: "coreRemoveByPayingSelfCores",
        filter: { symbolCount: 2, combined: true },
        dest: "trash",
    })
    assert(s.pendingChoice?.kind === "option" && s.pendingChoice.stepper === true, "支払う数を増減式で選ばせる")
    const err = handleAction(s, "p1", { type: "resolveChoice", option: "2" })
    assert(err === null, "2個払う選択に応答できる")
    assert(dilgan.cores === 3, "selfのコアを2個トラッシュに置いた")
    assert(s.players.p1.trashCores === trashBefore + 2, "自分のトラッシュにコア2個が置かれた")
    assert(target.cores === 1, "支払った2個ぶん、対象（シンボル2つの合体スピリット）のコアがトラッシュへ")
}

console.log("=== §おまけ recoverSpiritFromTrash：countCounter / anyCardType（BS12-X02）===")
{
    const s = game("recover-any-type")
    s.players.p1.trashCards = ["BS12-076"] // ブレイヴブレイク（紫のマジックカード）
    const hikaridoSpirit = createInstance(STEINBORG, s.turn, 1) // 系統「光導」「冥主」を持つ→ownFamily["光導","星魂"]に1体一致
    s.players.p1.field.spirits.push(hikaridoSpirit)
    refreshLevelAsOverrides(s)
    const handBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, {
        type: "recoverSpiritFromTrash",
        count: 0, // countCounter指定時は無視される
        countCounter: { ownFamily: ["光導", "星魂"] },
        colorFilter: "purple",
        anyCardType: true,
    })
    assert(s.players.p1.hand.length === handBefore + 1, "紫のマジックカードも対象になり手札へ戻った")
    assert(!s.players.p1.trashCards.includes("BS12-076"), "回収したカードはトラッシュから消えた")
}

console.log("すべてのチェックに合格しました 🎉（part289）")
