// smoke パート123（スピリットの「数を数える」の一元化）
//
// 新設した機構:
//   - shared/rules.spiritCountWeight / countSpiritsWeighted
//     「効果がスピリットの数を数える」箇所をすべて重みつきの共通ヘルパーに寄せた。
//     通常のスピリットは重み1なので、該当カードが場にない限り従来と同じ結果になる。
//   - kind:"countAsMultiple"（発生源自身を、**持ち主の効果**では N 体分として数える）
//   - action:"countAsMultipleThisTurn" ＋ CardInstance.countAsThisTurn
//     （このターンの間、印を付けた側の効果でだけ N 体分。相手のスピリットにも付けられる）
// 実装したカード:
//   - BS05-038 シーサーズ Lv2（このスピリットは2体分として数える）
//   - BS05-079 スリーカード（フラッシュ：指定したスピリットはこのターン3体分として数える）
//
// ※「スピリットの効果か・ネクサスの効果か・マジックの効果か」の区別は簡略化して見ていない
//    （シーサーズはネクサス除外、スリーカードはマジック除外が原作の条件。card-notes に記載）
import { assert, createGame, createInstance, currentLevel, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { countSpiritsWeighted, spiritCountWeight } from "../../shared/rules"
import { resolveMagic } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS05-038").name === "シーサーズ" && getCard("BS05-038").type === "spirit", "BS05-038 はシーサーズ（スピリット）")
    assert(getCard("BS05-079").name === "スリーカード" && getCard("BS05-079").type === "magic", "BS05-079 はスリーカード（マジック）")
    assert(getCard("BS05-038").levels[1]?.cores === 3, "シーサーズのLv2は3コア")
    assert(getCard("BS01-001").name === "ゴラドン", "BS01-001 はゴラドン")
}

console.log("=== 通常のスピリットは重み1（従来の数え方が変わらないこと） ===")
{
    const s = createGame("t123-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const a = put(s, "p1", "BS01-001", 1)
    put(s, "p1", "BS01-001", 1)
    assert(spiritCountWeight(s, "p1", "p1", a) === 1, "通常のスピリットの重みは1")
    assert(countSpiritsWeighted(s, "p1", "p1") === 2, `2体は2として数える（実際: ${String(countSpiritsWeighted(s, "p1", "p1"))}）`)
}

console.log("=== BS05-038 シーサーズ Lv2：自分の効果では2体分として数える ===")
{
    const s = createGame("t123-caesars-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const caesars = put(s, "p1", "BS05-038", 3) // Lv2
    assert(currentLevel(caesars).level === 2, `シーサーズは3コアでLv2（実際: ${String(currentLevel(caesars).level)}）`)
    put(s, "p1", "BS01-001", 1)

    assert(spiritCountWeight(s, "p1", "p1", caesars) === 2, "持ち主の効果では2体分")
    assert(
        countSpiritsWeighted(s, "p1", "p1") === 3,
        `シーサーズ+ゴラドンは3体分（実際: ${String(countSpiritsWeighted(s, "p1", "p1"))}）`,
    )
    // 相手の効果が数えるときは1体分のまま（『自分のスピリット/マジックの効果で』）
    assert(spiritCountWeight(s, "p2", "p1", caesars) === 1, "相手の効果では1体分のまま")
    assert(
        countSpiritsWeighted(s, "p2", "p1") === 2,
        `相手視点では2体（実際: ${String(countSpiritsWeighted(s, "p2", "p1"))}）`,
    )
}

console.log("=== BS05-038 シーサーズ：Lv1では1体分のまま ===")
{
    const s = createGame("t123-caesars-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const caesars = put(s, "p1", "BS05-038", 1) // Lv1
    assert(currentLevel(caesars).level === 1, `シーサーズは1コアでLv1（実際: ${String(currentLevel(caesars).level)}）`)
    assert(spiritCountWeight(s, "p1", "p1", caesars) === 1, "Lv1では1体分")
}

console.log("=== BS05-079 スリーカード：このターンの間、指定したスピリットは3体分として数える ===")
{
    const s = createGame("t123-three-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const own = put(s, "p1", "BS01-001", 1)
    put(s, "p1", "BS01-001", 1)
    assert(countSpiritsWeighted(s, "p1", "p1") === 2, "使用前は2体")

    resolveMagic(s, "p1", "BS05-079", "flash")
    assert(own.countAsThisTurn?.count === 3 || s.players.p1.field.spirits.some((x) => x.countAsThisTurn?.count === 3), "自分のスピリット1体に印が付く")
    assert(
        countSpiritsWeighted(s, "p1", "p1") === 4,
        `1体が3体分になるので合計4体分（実際: ${String(countSpiritsWeighted(s, "p1", "p1"))}）`,
    )
    // 印を付けたのは p1 なので、p2 の効果が数えるときは1体分のまま
    assert(
        countSpiritsWeighted(s, "p2", "p1") === 2,
        `相手視点では2体のまま（実際: ${String(countSpiritsWeighted(s, "p2", "p1"))}）`,
    )
}

console.log("=== BS05-079 スリーカード：相手のスピリットにも指定できる ===")
{
    const s = createGame("t123-three-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const enemy = put(s, "p2", "BS01-001", 1)
    resolveMagic(s, "p1", "BS05-079", "flash")
    assert(enemy.countAsThisTurn?.pid === "p1", "相手のスピリットに、使用者p1の印が付く")
    assert(
        countSpiritsWeighted(s, "p1", "p2") === 3,
        `p1の効果が相手を数えると3体分（実際: ${String(countSpiritsWeighted(s, "p1", "p2"))}）`,
    )
    assert(
        countSpiritsWeighted(s, "p2", "p2") === 1,
        `p2自身の効果では1体のまま（実際: ${String(countSpiritsWeighted(s, "p2", "p2"))}）`,
    )
}

console.log("=== 重みが効くのは「条件に一致したスピリット」だけ ===")
{
    const s = createGame("t123-count-effect", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    const caesars = put(s, "p1", "BS05-038", 3) // Lv2＝2体分
    put(s, "p1", "BS01-001", 1)
    assert(
        countSpiritsWeighted(s, "p1", "p1", (x) => x.instanceId === caesars.instanceId) === 2,
        "条件に一致すれば2体分として数える",
    )
    assert(
        countSpiritsWeighted(s, "p1", "p1", (x) => x.instanceId !== caesars.instanceId) === 1,
        "条件に一致しないシーサーズは数えない（ゴラドンの1体だけ）",
    )
}

console.log("=== スリーカードの印はターン終了でリセットされる ===")
{
    const s = createGame("t123-three-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const own = put(s, "p1", "BS01-001", 1)
    resolveMagic(s, "p1", "BS05-079", "flash")
    assert(own.countAsThisTurn?.count === 3, "印が付いている（3体分）")
    assert(countSpiritsWeighted(s, "p1", "p1") === 3, "この時点では3体分")

    s.phase = "main"
    endTurn(s)
    assert(own.countAsThisTurn === undefined, "ターン終了で印が消える")
    assert(
        countSpiritsWeighted(s, "p1", "p1") === 1,
        `次のターンは1体として数える（実際: ${String(countSpiritsWeighted(s, "p1", "p1"))}）`,
    )
}
