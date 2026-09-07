// smoke パート294（BS12 バッチ7・多色2枚：新しく足した2つの器）
// BK=combinedBraveColors（合体しているブレイヴの色による発揮条件。いずれか1つが該当色なら成立）／
// BL=FieldEvent anySpiritReturnedToHand（「相手のスピリットが手札に戻ったとき」を書けるようにする）
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart, getCard } from "./helpers"
import type { GameState } from "./helpers"
import { attachBrave, returnSpiritToHand } from "../../server/src/logic/removal"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { combinedBraveColorsOk } from "../../shared/rules"

const APOLLO = "X008" // 神星皇ストライク・アポロドラゴン（弾の接頭辞を持たないXレア枠）
const CAELUS = "BS12-040" // 天王神龍スレイ・カエルス

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

// 色でブレイヴを引く（cardId のハードコード事故を避けるためデータから探す）
function braveOfColor(color: string): string {
    const found = ALL_CARDS.find((c) => c.type === "brave" && c.colors.length === 1 && c.colors[0] === color)
    assert(found !== undefined, `テスト前提: ${color} の単色ブレイヴが存在する`)
    return found!.cardId
}

console.log("=== 前提: X008 / BS12-040 のカード定義 ===")
{
    assert(getCard(APOLLO).name === "神星皇ストライク・アポロドラゴン", "X008 は接頭辞なしの cardId で引ける")
    assert(getCard(CAELUS).colors.length === 2, "BS12-040 は多色（黄白）")
}

console.log("=== BK: combinedBraveColors（いずれか1つが該当色なら成立） ===")
{
    const s = game("bk-bravecolors")
    const host = createInstance(APOLLO, s.turn, 2)
    s.players.p1.field.spirits.push(host)
    const green = createInstance(braveOfColor("green"), s.turn, 0)
    attachBrave(s, "p1", host, green)
    refreshLevelAsOverrides(s)

    const p1 = s.players.p1
    assert(
        combinedBraveColorsOk(p1, host, ["green", "white", "yellow"]) === true,
        "緑のブレイヴが合体していれば「緑/白/黄のブレイヴとの合体時」が成立する",
    )
    assert(
        combinedBraveColorsOk(p1, host, ["red", "purple", "blue"]) === false,
        "緑だけでは「赤/紫/青のブレイヴとの合体時」は成立しない",
    )

    // 赤のブレイヴも足すと、色違いの2つの効果が両方成立する
    const red = createInstance(braveOfColor("red"), s.turn, 0)
    attachBrave(s, "p1", host, red)
    refreshLevelAsOverrides(s)
    assert(
        combinedBraveColorsOk(p1, host, ["green", "white", "yellow"]) === true &&
            combinedBraveColorsOk(p1, host, ["red", "purple", "blue"]) === true,
        "緑と赤のブレイヴを両方付ければ、色違いの2つの効果が両方成立する（2026-09-07 ユーザー確認）",
    )

    assert(
        combinedBraveColorsOk(p1, host, undefined) === true,
        "colors 未指定なら常に成立＝既存カードの挙動は変わらない",
    )
}

console.log("=== BL: anySpiritReturnedToHand（相手のスピリットが手札に戻ったとき） ===")
{
    const s = game("bl-returned")
    // BS12-040 を p1 に、合体させて Lv2 にする（【合体時】Lv2-3）
    const caelus = createInstance(CAELUS, s.turn, 2)
    s.players.p1.field.spirits.push(caelus)
    const brave = createInstance(braveOfColor("yellow"), s.turn, 0)
    attachBrave(s, "p1", caelus, brave)
    refreshLevelAsOverrides(s)

    const victim = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(victim)
    const lifeBefore = s.players.p1.life
    returnSpiritToHand(s, "p2", victim)
    assert(
        s.players.p1.life === lifeBefore + 1,
        `相手のスピリットが手札に戻ったとき、ボイドからコア1個が自分のライフに置かれる（実際 ${lifeBefore} → ${s.players.p1.life}）`,
    )
}

console.log("=== BL: 自分のスピリットが戻ったときは発火しない（subjectSide:\"opponent\"） ===")
{
    const s = game("bl-ownside")
    const caelus = createInstance(CAELUS, s.turn, 2)
    s.players.p1.field.spirits.push(caelus)
    const brave = createInstance(braveOfColor("yellow"), s.turn, 0)
    attachBrave(s, "p1", caelus, brave)
    refreshLevelAsOverrides(s)

    const own = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(own)
    const lifeBefore = s.players.p1.life
    returnSpiritToHand(s, "p1", own)
    assert(s.players.p1.life === lifeBefore, "自分のスピリットが手札に戻ってもライフは増えない")
}

console.log("すべてのチェックに合格しました 🎉（part294）")
