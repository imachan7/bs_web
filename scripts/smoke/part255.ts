// smoke パート255（BS10青バッチ：戦闘獣ライギャロップ／守護神バートラム／ロコモ・ゴレム／
// フォート・ゴレム／巨人猟兵オライオン／バニラ3枚の8枚を新規構造化。2026-08-28）
//
// 新設した機構: costMod mode:"set" の scope:"self"（手札にあるこのカード自身の効果）と
// condition:{ ownNexusAtLeast } を costSetOverride に追加（BS10-059フォート・ゴレム）。
// 既存機構の踏襲: colorAs（BS10-051）／globalConstraint ownNexusIndestructible（BS10-053）／
// keyword funsai・kyoshu＋refreshSelfByExhaustNexus（BS10-054／059）／triggered onSummon mill（BS10-060）。
// ⚠️ cardId はハードコードせず、名前をカードデータで機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    destroyNexus,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { countSymbols, instHasColor, isVanillaCard } from "../../shared/rules"
import { resolveFunsai } from "../../server/src/logic/EffectModules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

const PLAIN_NEXUS = "BS01-101" // 古龍の縄張り：単純な常在効果のみ（kyoshuの疲労先として使う。part218と同じ選定）
const BLUE_NEXUS = ALL_CARDS.find((c) => c.type === "nexus" && c.colors.includes("blue"))!
const OTHER_NEXUS = ALL_CARDS.find((c) => c.type === "nexus" && !c.colors.includes("blue"))!

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-051").name === "戦闘獣ライギャロップ", "BS10-051 は戦闘獣ライギャロップ")
    assert(getCard("BS10-052").name === "木こりのゴブリ・ゴブリ", "BS10-052 は木こりのゴブリ・ゴブリ")
    assert(getCard("BS10-053").name === "守護神バートラム", "BS10-053 は守護神バートラム")
    assert(getCard("BS10-054").name === "ロコモ・ゴレム", "BS10-054 はロコモ・ゴレム")
    assert(getCard("BS10-055").name === "グラーキー", "BS10-055 はグラーキー")
    assert(getCard("BS10-057").name === "鹿人ディアルド", "BS10-057 は鹿人ディアルド")
    assert(getCard("BS10-059").name === "フォート・ゴレム", "BS10-059 はフォート・ゴレム")
    assert(getCard("BS10-060").name === "巨人猟兵オライオン", "BS10-060 は巨人猟兵オライオン")
    assert(getCard(PLAIN_NEXUS).type === "nexus", "PLAIN_NEXUS はネクサス")
    assert(BLUE_NEXUS !== undefined && OTHER_NEXUS !== undefined, "テスト用ネクサスが用意できる")
}

console.log("=== BS10-051 戦闘獣ライギャロップ：黄のスピリットとしても扱う（colorAs） ===")
{
    const s = base("t255-raigallop")
    const inst = put(s, "p1", "BS10-051", 1) // Lv1
    refreshLevelAsOverrides(s)
    assert(instHasColor(inst, "blue"), "元の色（青）はそのまま持つ")
    assert(instHasColor(inst, "yellow"), "黄のスピリットとしても扱われる")
    assert(countSymbols(s.players.p1, ["yellow"]) === 1, "黄シンボルの数え上げでも黄として扱われる")
}

console.log("=== BS10-053 守護神バートラム：自分の青のネクサスは相手のマジックの効果では破壊されない ===")
{
    const s = base("t255-bartram")
    put(s, "p1", "BS10-053", 1) // Lv1
    const blue = putNexus(s, "p1", BLUE_NEXUS.cardId, 0)
    const other = putNexus(s, "p1", OTHER_NEXUS.cardId, 0)
    refreshLevelAsOverrides(s)
    assert(destroyNexus(s, "p1", blue.instanceId, { sourcePid: "p2", sourceType: "magic" }) === false, "青のネクサスは破壊されない")
    assert(destroyNexus(s, "p1", other.instanceId, { sourcePid: "p2", sourceType: "magic" }) === true, "青以外のネクサスは守られない（色の絞り込みが効いている）")
}

console.log("=== BS10-054 ロコモ・ゴレム：【粉砕】でLvと同じ枚数を破棄する ===")
{
    const s1 = base("t255-locomo-funsai-lv1")
    const lv1 = put(s1, "p1", "BS10-054", 1) // Lv1（コア1）
    const before1 = s1.players.p2.trashCards.length
    resolveFunsai(s1, "p1", lv1)
    assert(s1.players.p2.trashCards.length === before1 + 1, "Lv1は1枚破棄")

    const s2 = base("t255-locomo-funsai-lv2")
    const lv2 = put(s2, "p1", "BS10-054", 2) // Lv2（コア2）
    const before2 = s2.players.p2.trashCards.length
    resolveFunsai(s2, "p1", lv2)
    assert(s2.players.p2.trashCards.length === before2 + 2, "Lv2は2枚破棄")
}

function testKyoshu(cardId: string, cores: number, label: string) {
    const s = base(`t255-kyoshu-${cardId}`)
    const spirit = put(s, "p1", cardId, cores)
    spirit.isRested = true
    const light = putNexus(s, "p1", PLAIN_NEXUS, 0) // コア0＝最少
    const heavy = putNexus(s, "p1", PLAIN_NEXUS, 3) // コア3＝残しておく
    resolveAction(s, "p1", spirit, { type: "refreshSelfByExhaustNexus" })
    assert(!spirit.isRested, `${label}：ネクサスを疲労させて回復した`)
    assert(light.isRested && !heavy.isRested, "疲労するのはコア数最少のネクサス1つだけ")
    spirit.isRested = true // 再び疲労させて2回目を試す（疲労していないネクサスはまだ残っている）
    resolveAction(s, "p1", spirit, { type: "refreshSelfByExhaustNexus" })
    assert(spirit.isRested, `${label}：ターン中2回目は発動できない（回復しないまま）`)
    assert(!heavy.isRested, "上限に達しているので残っていたネクサスも消費されない")
}
console.log("=== BS10-054／BS10-059 の【強襲：1】：ネクサス1つを疲労させて回復できる。ターン中2回目は不可 ===")
{
    testKyoshu("BS10-054", 2, "BS10-054 Lv2") // 【強襲】はLv2･Lv3
    testKyoshu("BS10-059", 1, "BS10-059 Lv1") // 【強襲】はLv1･Lv2
}

console.log("=== BS10-059 フォート・ゴレム：自分のネクサスがある間、手札のコストが4になる ===")
{
    const s = base("t255-fort-cost")
    const cardData = getCard("BS10-059")
    assert(effectiveCost(s, "p1", cardData) === 6, "自分のネクサスが無ければ本来のコスト6のまま")
    putNexus(s, "p1", PLAIN_NEXUS, 0)
    assert(effectiveCost(s, "p1", cardData) === 4, "自分のネクサスが1つでもあればコスト4")
    // scope:"self" は「手札にあるこのカード自身」限定。059 が**場に出た**とたんに
    // 他のカードのコストまで4に置換してしまわないこと（059は絞り込みを持たないため、
    // 発生源の走査から除外していないと全カードに効いてしまう）
    s.players.p1.field.spirits.push(createInstance("BS10-059", s.turn, 1))
    // 059 は青シンボルを1つ持つので、青2軽減の BS10-060（記載コスト7）は 7→6 に**軽減**される。
    // ここで見たいのは「置換されて4になっていないこと」＝ scope:"self" が発生源の走査から除外されていること
    // （除外を外すと 059 は絞り込みを持たないため、あらゆるカードのコストが4になる）
    const other = getCard("BS10-060")
    assert(effectiveCost(s, "p1", other) === 6, "059が場にいても、他のカードのコストは置換されない（軽減で6）")
}

console.log("=== BS10-060 巨人猟兵オライオン：召喚時、相手のデッキを上から12枚破棄する ===")
{
    const s = base("t255-orion-summon")
    s.players.p1.hand = ["BS10-060"]
    const before = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "巨人猟兵オライオンを召喚")
    assert(s.players.p2.trashCards.length === before + 12, "相手のデッキが12枚破棄される")
}

console.log("=== バニラ3枚：効果の記述を持たない ===")
{
    assert(isVanillaCard(getCard("BS10-052")), "木こりのゴブリ・ゴブリはバニラ")
    assert(isVanillaCard(getCard("BS10-055")), "グラーキーはバニラ")
    assert(isVanillaCard(getCard("BS10-057")), "鹿人ディアルドはバニラ")
}

console.log("すべてのチェックに合格しました 🎉（part255）")
