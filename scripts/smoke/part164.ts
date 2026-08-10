// smoke パート164（「◯体分として数える」の、数える側の発生源種別の限定）
//
//   BS05-038 シーサーズLv2  「自分の**スピリット/マジック**の効果で数えるとき」2体分（＝ネクサス除外）
//   BS05-079 スリーカード    「自分の**スピリット/ネクサス**の効果で数えるとき」3体分（＝マジック除外）
//
// 数える側の入口は shared/rules.countSpiritsWeighted 1本で、発生源の種別を渡すようにした。
// **許可された種別では効く／除外された種別では効かない**の両方を、実カード経由で見る。
// 数える側の実カードは次の2枚（どちらも counter "ownExhausted"＝疲労している自分のスピリット数）:
//
//   BS01-106 隠されたる賢者の樹（ネクサス）  アタック/ブロック中の自分すべてを 疲労数×1000 BP+
//   BS03-128 マルチプルコア（マジック）      疲労数ぶんボイドからリザーブへコアを置く
import { act, assert, createGame, createInstance, effectiveBp, effectiveCost, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false): string {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, cores))
}
// アタック宣言 → フラッシュ①の優先権を攻撃側へ回す（防御側パス）ところまで
function attackAndTakePriority(s: GameState, attackerId: string): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（優先権が攻撃側へ）")
}

console.log("=== BS05-038 シーサーズLv2：ネクサスの効果では2体分に数えない ===")
{
    const s = createGame("bs05-038-source-types", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    putNexus(s, "p1", "BS01-106", 0) // 隠されたる賢者の樹 Lv1（疲労数×1000のBPオーラ）
    const attacker = putSpirit(s, "p1", "BS02-014", 1) // ファンタズマ Lv1 BP2000
    putSpirit(s, "p1", "BS05-038", 3, true) // シーサーズ Lv2（コア3）を疲労状態で置く
    putSpirit(s, "p2", "BS01-031", 1) // 相手のブロッカー候補（バトルは解決させない）
    s.players.p1.hand = ["BS03-128"] // マルチプルコア

    attackAndTakePriority(s, attacker)
    // アタック宣言でアタッカー自身も疲労するので、疲労しているのは アタッカー＋シーサーズ の2体。
    // ネクサスの効果はシーサーズを1体分としか数えないので 2×1000 = +2000
    assert(
        effectiveBp(s, "p1", s.players.p1.field.spirits.find((x) => x.instanceId === attacker)!) === 2000 + 2000,
        "ネクサスのオーラは疲労2体ぶん（シーサーズを2体分に数えない）",
    )

    console.log("--- マジックの効果では2体分に数える（限定に含まれる種別） ---")
    // 支払いコストは軽減シンボル（賢者の樹の緑1つ）で変わるので、期待値は effectiveCost から立てる
    const cost = effectiveCost(s, "p1", getCard("BS03-128"))
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1がマルチプルコアを使用")
    // マジックなので シーサーズは2体分。アタッカー1＋シーサーズ2 = 3個
    assert(
        s.players.p1.reserve === reserveBefore - cost + 3,
        "マジックの効果では疲労3体ぶん（シーサーズを2体分に数える）",
    )
}

console.log("=== BS05-079 スリーカード：マジックの効果では3体分に数えない ===")
{
    const s = createGame("bs05-079-source-types", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    putNexus(s, "p1", "BS01-106", 0)
    const attacker = putSpirit(s, "p1", "BS02-014", 1)
    const marked = putSpirit(s, "p1", "BS02-014", 1, true) // 印を付ける相手（疲労状態）
    putSpirit(s, "p2", "BS01-031", 1)
    s.players.p1.hand = ["BS05-079", "BS03-128"] // スリーカード → マルチプルコア

    attackAndTakePriority(s, attacker)
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: marked }) === null,
        "p1がスリーカードを使用（対象を指定）",
    )
    const markedInst = s.players.p1.field.spirits.find((x) => x.instanceId === marked)!
    assert(markedInst.countAsThisTurn?.count === 3, "3体分の印が付く")
    assert(
        markedInst.countAsThisTurn?.sourceTypes?.join(",") === "spirit,nexus",
        "印に発生源種別の限定（スピリット/ネクサス）が写っている",
    )

    console.log("--- ネクサスの効果では3体分に数える（限定に含まれる種別） ---")
    // 疲労しているのは アタッカー1体＋印つき1体。ネクサスなので印が効いて 1+3 = 4体ぶん
    assert(
        effectiveBp(s, "p1", s.players.p1.field.spirits.find((x) => x.instanceId === attacker)!) === 2000 + 4000,
        "ネクサスのオーラは疲労4体ぶん（印つきを3体分に数える）",
    )

    console.log("--- マジックの効果では3体分に数えない ---")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（優先権を攻撃側へ戻す）")
    const cost = effectiveCost(s, "p1", getCard("BS03-128"))
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1がマルチプルコアを使用")
    // マジックなので印は無視され、疲労は アタッカー1＋印つき1 の2体ぶん
    assert(
        s.players.p1.reserve === reserveBefore - cost + 2,
        "マジックの効果では疲労2体ぶん（印を数えない）",
    )
}
