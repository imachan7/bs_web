// smoke パート69（★「場に出ているのに一度も発火していない効果」の回帰・BS01〜BS04 分16件）
//
// `npm run coverage:effects` の ★ リスト＝**カードは smoke に登場するのに、その効果エントリだけ
// 一度も適用されていない**層。part73（BS01〜BS02 分）と同じ趣旨で、BS01〜BS04 分の16件を
// **カードを実際に使う経路**（召喚・アタック・バトル・ステップ進行・トリガー）で通す。
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    hasArmorAgainst,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function setupMain(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst.instanceId
}

function spiritOf(s: GameState, pid: PlayerId, instanceId: string) {
    return s.players[pid].field.spirits.find((sp) => sp.instanceId === instanceId)
}

function summonFromHand(s: GameState, pid: PlayerId, cardId: string): string | null {
    s.players[pid].hand = [cardId]
    const before = new Set(s.players[pid].field.spirits.map((sp) => sp.instanceId))
    const err = act(s, pid, { type: "summon", handIndex: 0 })
    if (err !== null) return null
    return s.players[pid].field.spirits.find((sp) => !before.has(sp.instanceId))?.instanceId ?? null
}

console.log("=== BS01-X02-e2 魔界七将デスペラード（アタック時coreSqueezeOne） ===")
{
    const s = setupMain("x02-squeeze")
    const desperado = put(s, "p1", "BS01-X02", 4) // Lv2（コア4個）
    const target = put(s, "p2", "BS01-001", 4) // BP最大の相手スピリット
    const reserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: desperado }) === null, "アタック宣言")
    assert(spiritOf(s, "p2", target)?.cores === 1, "相手スピリットのコアが1個だけ残る")
    assert(
        s.players.p2.reserve === reserveBefore + 3,
        "超過分3個が相手のリザーブに置かれる",
    )
}

console.log("=== BS02-012-e1 地龍王ケンドラゴス（Lv2アタック時selfBuff） ===")
{
    const s = setupMain("kendragos-selfbuff")
    const kendragos = put(s, "p1", "BS02-012", 5) // Lv2（コア5個）BP6000
    const bpBefore = effectiveBp(s, "p1", spiritOf(s, "p1", kendragos)!)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: kendragos }) === null, "アタック宣言")
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", kendragos)!) === bpBefore + 4000,
        "Lv2アタック時にBP+4000",
    )
}

console.log("=== BS02-024-e1 暗黒将軍ブラッディ・シーザー（onBlockedでcoreRemove） ===")
{
    const s = setupMain("caesar-onblocked")
    const caesar = put(s, "p1", "BS02-024", 1) // Lv1（levels:[1,2]で有効）
    const blocker = put(s, "p2", "BS01-001", 4) // コア4個
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: caesar }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ブロック宣言")
    assert(
        spiritOf(s, "p2", blocker)?.cores === 2,
        "ブロック宣言でブロッカーのコアが2個減る（onBlocked誘発）",
    )
}

console.log("=== BS03-003-e1 ドラグノ暗殺者（Lv1 unblockableBy【神速】） ===")
{
    const s = setupMain("dragno-unblockable")
    const dragno = put(s, "p1", "BS03-003", 1) // Lv1
    const sokuBlocker = put(s, "p2", "BS01-053", 1) // リーヴォルフ（【神速】持ち）
    const normalBlocker = put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: dragno }) === null, "アタック宣言")
    assert(
        act(s, "p2", { type: "block", instanceId: sokuBlocker }) !== null,
        "【神速】持ちはブロックできない",
    )
    assert(
        act(s, "p2", { type: "block", instanceId: normalBlocker }) === null,
        "【神速】を持たなければブロックできる",
    )
}

console.log("=== BS03-103-e1 熾烈極める最前線（相手アタックステップでdestroy） ===")
{
    const s = setupMain("frontline-step-destroy")
    putNexus(s, "p2", "BS03-103", 0) // Lv1（相手＝p1のアタックステップに反応）
    const weak = put(s, "p1", "BS01-001", 1) // BP1000（1000以下）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1がアタックステップへ移行")
    assert(spiritOf(s, "p1", weak) === undefined, "BP1000以下の相手スピリットがステップ誘発で破壊される")
}

console.log("=== BS03-104-e2 運命分かつ岐路（Lv2 battleWon→exhaust、バニラ勝利限定） ===")
{
    const s = setupMain("crossroads-battlewon")
    putNexus(s, "p1", "BS03-104", 2) // Lv2
    const attacker = put(s, "p1", "BS01-001", 3) // バニラ・Lv2 BP3000
    const blocker = put(s, "p2", "BS01-002", 1) // BP1000（負ける側）
    const bystander = put(s, "p2", "BS01-018", 1) // exhaust対象候補（バトル外）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: blocker }) === null, "ブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス＝バトル解決")
    assert(spiritOf(s, "p2", blocker) === undefined, "バニラの攻撃側が勝ちブロッカーが破壊される")
    assert(
        spiritOf(s, "p2", bystander)?.isRested === true,
        "バニラの勝利で相手スピリットが疲労する（battleWon誘発）",
    )
}

console.log("=== BS04-008-e1 古竜魔人バ・ゴゥ（アタック時selfBuff） ===")
{
    const s = setupMain("bagou-selfbuff")
    const bagou = put(s, "p1", "BS04-008", 1) // Lv1 BP3000
    const bpBefore = effectiveBp(s, "p1", spiritOf(s, "p1", bagou)!)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: bagou }) === null, "アタック宣言")
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", bagou)!) === bpBefore + 5000,
        "アタック時にBP+5000",
    )
}

console.log("=== BS04-018-e2 水蛇シーサーペンタ（相手スタートステップでreturnToHand、手札8枚以上） ===")
{
    const s = setupMain("serpenta-return")
    put(s, "p1", "BS04-018", 3) // Lv2（コア3個）
    const oppTarget = put(s, "p2", "BS01-001", 1)
    s.players.p1.hand = new Array(8).fill("BS01-001") // 条件: 持ち主(p1)の手札8枚以上
    s.turnPlayer = "p2" // p1から見て「相手のスタートステップ」を作る
    runTurnStart(s)
    assert(
        spiritOf(s, "p2", oppTarget) === undefined,
        "手札8枚以上の間、相手のスタートステップに相手スピリットが手札へ戻る",
    )
    assert(s.players.p2.hand.includes("BS01-001"), "戻されたカードは持ち主(p2)の手札へ")
    s.turnPlayer = "p1" // 後続に影響しないよう戻す
}

console.log("=== BS04-021-e1 吸血鬼ダンピール（Lv3 アタック側勝利onBattleでdraw） ===")
{
    const s = setupMain("dampeal-battlewin-draw")
    const dampeal = put(s, "p1", "BS04-021", 6) // Lv3（コア6個）BP7000
    const weak = put(s, "p2", "BS01-001", 1) // BP1000
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: dampeal }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: weak }) === null, "ブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス＝バトル解決")
    assert(spiritOf(s, "p2", weak) === undefined, "アタッカーが勝ちブロッカーが破壊される")
    assert(s.players.p1.hand.length === handBefore + 1, "Lv3アタッカー勝利でドロー")
}

console.log("=== BS04-022-e1 王蛇ケツァルカトル（召喚時draw2） ===")
{
    const s = setupMain("quetzal-summon-draw")
    const handBeforeSummon = s.players.p1.deck.length
    const iid = summonFromHand(s, "p1", "BS04-022")
    assert(iid !== null, "王蛇ケツァルカトルを召喚できる")
    assert(s.players.p1.hand.length === 2, "召喚時に2枚ドローする")
    assert(s.players.p1.deck.length === handBeforeSummon - 2, "ドローぶんデッキが減る")
}

console.log("=== BS04-045-e2 氷の女神フリッグ（Lv2 相手のコスト3フラッシュマジック使用に反応） ===")
{
    const s = setupMain("frigg-magic-react")
    putNexus(s, "p1", "BS04-045", 3) // Lv2（コア3個）
    const attacker = put(s, "p1", "BS01-001", 1)
    s.players.p2.hand = ["BS01-142"] // ピュアエリクサー（白・コスト3・フラッシュ・refreshAllOwn）
    const p2ReserveBefore = s.players.p2.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言（防御側p2に優先権）")
    assert(
        act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
        "p2がコスト3のフラッシュマジックを使用",
    )
    // castMagicのコスト支払い(3)＋フリッグの反応(3)で、あわせて6個がp2のリザーブ→トラッシュへ動く
    assert(
        s.players.p2.reserve === p2ReserveBefore - 3 - 3,
        `氷の女神フリッグの反応でp2のコア3個が追加でトラッシュへ（実際のリザーブ差: ${p2ReserveBefore - s.players.p2.reserve}）`,
    )
}

console.log("=== BS04-068-e2 アイアン・ゴレム（Lv2 アタック時selfBuffByHandDiscard） ===")
{
    const s = setupMain("irongolem-discard-buff")
    const golem = put(s, "p1", "BS04-068", 3) // Lv2（コア3個）
    s.players.p1.hand = ["BS03-102"] // ネクサスカード（破棄対象）
    const bpBefore = effectiveBp(s, "p1", spiritOf(s, "p1", golem)!)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: golem }) === null, "アタック宣言")
    assert(
        effectiveBp(s, "p1", spiritOf(s, "p1", golem)!) === bpBefore + 4000,
        "手札のネクサスを破棄してBP+4000",
    )
    assert(s.players.p1.hand.length === 0, "破棄した手札が減る")
    assert(s.players.p1.trashCards.includes("BS03-102"), "破棄したカードはトラッシュへ")
}

console.log("=== BS04-082-e1 侵されざる聖域（コスト8以上へ継続で【装甲：5色】付与） ===")
{
    const s = setupMain("sanctuary-armorgrant")
    putNexus(s, "p1", "BS04-082", 0) // Lv1（levels:[1,2]で有効）
    const bigCost = put(s, "p1", "BS01-025", 1) // 要塞龍ギガ・コスト8
    const smallCost = put(s, "p1", "BS01-001", 1) // コスト1
    refreshLevelAsOverrides(s)
    assert(
        hasArmorAgainst(spiritOf(s, "p1", bigCost)!, ["purple"]) === true,
        "コスト8以上のスピリットは付与された装甲色（紫）を防ぐ",
    )
    assert(
        hasArmorAgainst(spiritOf(s, "p1", bigCost)!, ["red"]) === false,
        "付与色に含まれない色（赤）は防がない",
    )
    assert(
        hasArmorAgainst(spiritOf(s, "p1", smallCost)!, ["purple"]) === false,
        "コスト8未満のスピリットには付与されない",
    )
}

console.log("=== BS04-085-e2 魔力満ちる泉（Lv2 相手アタック宣言でcoreToTrashSelf、四道3体条件） ===")
{
    const s = setupMain("fountain-attack-react")
    putNexus(s, "p2", "BS04-085", 3) // Lv2（コア3個）・持ち主p2はturnPlayer(p1)ではない
    put(s, "p2", "BS02-056", 1) // 四道1
    put(s, "p2", "BS03-054", 1) // 四道2
    put(s, "p2", "BS04-051", 1) // 四道3（合計3体で条件成立）
    const attacker = put(s, "p1", "BS01-001", 3) // アタックしたスピリット自身がcoreToTrashSelfの対象
    const p1TrashBefore = s.players.p1.trashCores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "p1がアタック宣言")
    assert(spiritOf(s, "p1", attacker)?.cores === 2, "アタックしたスピリット自身のコアが1個トラッシュへ")
    assert(s.players.p1.trashCores === p1TrashBefore + 1, "除去したコアはアタッカー本人のトラッシュへ")
}

console.log("=== BS04-X13-e2 魔龍帝ジークフリード（Lv2 アタック側勝利onBattleでdraw） ===")
{
    const s = setupMain("siegfried-battlewin-draw")
    const siegfried = put(s, "p1", "BS04-X13", 2) // Lv2（コア2個）BP7000
    const weak = put(s, "p2", "BS01-001", 1) // BP1000
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: siegfried }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "block", instanceId: weak }) === null, "ブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス＝バトル解決")
    assert(spiritOf(s, "p2", weak) === undefined, "アタッカーが勝ちブロッカーが破壊される")
    assert(s.players.p1.hand.length === handBefore + 1, "Lv2アタッカー勝利でドロー")
}

console.log("=== BS04-X16-e2 機動要塞キャッスル・ゴレム（Lv2 アタック時millPer青シンボル数） ===")
{
    const s = setupMain("castlegolem-millper")
    const golem = put(s, "p1", "BS04-X16", 6) // Lv2（コア6個）・自身の青シンボル1個ぶんミル
    const deckBefore = s.players.p2.deck.length
    const trashBefore = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: golem }) === null, "アタック宣言")
    assert(s.players.p2.deck.length === deckBefore - 1, "青シンボル1個ぶん相手のデッキが1枚ミルされる")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "ミルされたカードは相手のトラッシュへ")
}
