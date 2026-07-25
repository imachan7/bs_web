// smoke パート55（個別設計バッチC）
//   - BS04-033 甲殻戦士ロングホーン: 召喚時、【神速】を持つ自分のスピリットすべてにボイドからコア1個
//   - BS04-061 戦闘獣ジャッカー: 自分のネクサスが破壊されたとき、自身のコアすべてを支払って戻す
//   - BS04-081 強者統べる大地: BP6000以上の自分スピリットはBP比較の破壊で疲労状態で場に戻る（reviveOnDestroy minBp）
import { assert, act, createGame, createInstance, destroyNexus, destroySpirit, runTurnStart } from "./helpers"

console.log("=== BS04-033 甲殻戦士ロングホーン: 召喚時に【神速】持ちへコア1個ずつ ===")
{
    const s = createGame("bs04-033", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const soku1 = createInstance("BS01-053", s.turn, 1) // リーヴォルフ（神速）
    const soku2 = createInstance("BS01-064", s.turn, 1) // ジガ・ワスプ（神速）
    const other = createInstance("BS01-001", s.turn, 1) // ゴラドン（神速なし）
    for (const sp of [soku1, soku2, other]) s.players.p1.field.spirits.push(sp)
    s.players.p1.hand[0] = "BS04-033"
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ロングホーンを召喚")
    assert(soku1.cores === 2 && soku2.cores === 2, "【神速】を持つスピリットにコアが1個ずつ置かれる")
    assert(other.cores === 1, "【神速】を持たないスピリットには置かれない")
}

console.log("=== BS04-061 戦闘獣ジャッカー: ネクサス破壊に反応し、自身のコアを払って戻す ===")
{
    const s = createGame("bs04-061", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const jacker = createInstance("BS04-061", s.turn, 3) // 戦闘獣ジャッカー（コア3個）
    s.players.p1.field.spirits.push(jacker)
    const nexus = createInstance("BS04-080", s.turn, 2) // 旋風渦巻く渓谷
    s.players.p1.field.nexuses.push(nexus)
    const trashCoresBefore = s.players.p1.trashCores
    destroyNexus(s, "p1", nexus.instanceId)
    assert(
        s.players.p1.field.nexuses.some((n) => n.cardId === "BS04-080"),
        "破壊されたネクサスがフィールドに戻る",
    )
    assert(jacker.cores === 0 || !s.players.p1.field.spirits.some((x) => x.instanceId === jacker.instanceId),
        "ジャッカーのコアはすべて支払われる（維持コア割れで消滅する）")
    assert(s.players.p1.trashCores >= trashCoresBefore + 3, "支払ったコアはトラッシュへ置かれる")
}

console.log("=== BS04-081 強者統べる大地: BP6000以上ならBP比較の破壊で疲労状態で場に戻る ===")
{
    const s = createGame("bs04-081", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-081", s.turn, 0)) // 強者統べる大地 Lv1
    const big = createInstance("BS01-025", s.turn, 3) // 要塞龍ギガ Lv2 BP10000（6000以上）
    s.players.p1.field.spirits.push(big)
    s.phase = "attack" // 『自分のアタックステップ』条件
    destroySpirit(s, "p1", big.instanceId, "destroy", { sourcePid: "p2", battle: { attackerColor: "red", attackerLevel: 1 } })
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === big.instanceId),
        "BP6000以上なのでBP比較の破壊では場に戻る",
    )
    assert(big.isRested, "戻るときは疲労状態")
}
{
    const s = createGame("bs04-081-small", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance("BS04-081", s.turn, 0))
    const small = createInstance("BS01-001", s.turn, 1) // ゴラドン BP1000（6000未満）
    s.players.p1.field.spirits.push(small)
    s.phase = "attack"
    destroySpirit(s, "p1", small.instanceId, "destroy", { sourcePid: "p2", battle: { attackerColor: "red", attackerLevel: 1 } })
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === small.instanceId),
        "BP6000未満のスピリットは通常どおり破壊される",
    )
}

console.log("パート55 完了")
