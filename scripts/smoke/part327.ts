// smoke パート327（「自分のライフは0にならない」が働いている間は、ライフのコアをコストとして
// 払って0にすることもできない。2026-09-16 ユーザー確定）
//
// 永久凍土の王都（BS14-084）は原因を限定せずライフ0を止める。したがって
// 「自分のライフのコア1個を置くことで〜する」効果は、払えばライフが0になる状況では
// **コストを完全に支払えない＝その効果を発揮できない**（COST_MODEL.md の一般則）。
// 対象は4枚: BS08-056 太陽石の神殿 / BS13-036 星鳥クージャ / BS13-039 神獣バーロン / BS08-064 鳳翼の聖剣
import { assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

function base(seed: string, life: number, withKingdom: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = false
    s.phase = "attack"
    s.players.p1.life = life
    if (withKingdom) s.players.p1.field.nexuses.push(createInstance("BS14-084", s.turn, 1)) // Lv1
    return s
}

console.log("=== カードデータの機械確認 ===")
{
    assert(getCard("BS14-084").name === "永久凍土の王都", "BS14-084 は永久凍土の王都")
    assert(getCard("BS13-036").name === "星鳥クージャ", "BS13-036 は星鳥クージャ")
    assert(getCard("BS13-034").name === "ミノガメン", "BS13-034 はミノガメン（黄）")
}

console.log("=== 星鳥クージャ：王都があってライフ1なら、コストを払えないので復活しない ===")
{
    const s = base("p327-kuja-blocked", 1, true)
    s.players.p1.field.spirits.push(createInstance("BS13-036", s.turn, 1))
    const target = createInstance("BS13-034", s.turn, 1) // 黄のスピリット
    s.players.p1.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", target.instanceId)
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === target.instanceId),
        "ライフのコアを置けないので復活しない",
    )
    assert(s.players.p1.life === 1, "ライフは減らない")
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === "BS14-084"), "王都も消費されない")
}

console.log("=== 対照：ライフ2なら払えるので復活する（王都があっても） ===")
{
    const s = base("p327-kuja-paid", 2, true)
    s.players.p1.field.spirits.push(createInstance("BS13-036", s.turn, 1))
    const target = createInstance("BS13-034", s.turn, 1)
    s.players.p1.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", target.instanceId)
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === target.instanceId && x.isRested === true),
        "ライフのコア1個を払って疲労状態で残る",
    )
    assert(s.players.p1.life === 1, "ライフは1に減る（0にはならないので床には触れない）")
}

console.log("=== 対照：王都が無ければライフ1でも払える（払った結果0になり敗北する） ===")
{
    const s = base("p327-kuja-nokingdom", 1, false)
    s.players.p1.field.spirits.push(createInstance("BS13-036", s.turn, 1))
    const target = createInstance("BS13-034", s.turn, 1)
    s.players.p1.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", target.instanceId)
    assert(s.players.p1.life === 0, "ライフは0になる")
    assert(s.winner === "p2", "ライフ0で敗北する（床が無ければ止まらない）")
}

console.log("すべてのチェックに合格しました 🎉（part327）")
