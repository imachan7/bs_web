// smoke パート311（『』カテゴリの棚卸し。docs/design/SEMANTICS_AUDIT.md §3.17）
// 『』で囲まれた効果はカテゴリで、借りる／止める器は『』付きしか対象にできない。
// ここでは2件を固定する:
//   - ネクサスの『このネクサスの配置時』は onDeploy（onSummon とは別カテゴリ）
//   - BS13-010 スカルザードは『破壊時』効果ではないので kind:"fieldEvent" + selfOnly
import { assert, createGame, createInstance, getCard, minLevelCores, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { destroySpirit } from "../../server/src/logic/removal"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== ネクサスの『配置時』は onDeploy として書かれている（onSummon と混ざらない） ===")
{
    for (const cid of ["BS09-066", "BS10-096", "BS12-063"]) {
        const card = getCard(cid)
        assert(card.type === "nexus", `${cid}はネクサス`)
        const deploys = card.effects.filter((e) => e.kind === "triggered" && e.trigger === "onDeploy")
        assert(deploys.length >= 1, `${cid}（${card.name}）は onDeploy を持つ`)
        assert(
            !card.effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon"),
            `${cid}（${card.name}）は onSummon を持たない＝『召喚時』を借りる器の対象にならない`,
        )
    }
}

console.log("=== BS13-010 スカルザードは『破壊時』効果ではない（借りる／止める器の対象外） ===")
{
    const card = getCard("BS13-010")
    assert(card.name === "スカルザード", "BS13-010はスカルザード")
    assert(
        !card.effects.some((e) => e.kind === "triggered"),
        "triggered エントリを持たない＝イビルグライダーに借りられず、破壊時封じでも止まらない",
    )
    assert(
        card.effects.some((e) => e.kind === "fieldEvent" && e.event === "ownSpiritDestroyed" && e.selfOnly === true),
        "fieldEvent ownSpiritDestroyed + selfOnly で書かれている",
    )
}

console.log("=== BS13-010：相手のターンに相手によって破壊されると、トラッシュから2体まで召喚できる ===")
{
    const s = game("skullzard-fire")
    s.turnPlayer = "p2" // 『相手のターン』
    const skull = createInstance("BS13-010", s.turn, minLevelCores(getCard("BS13-010")) + 2)
    s.players.p1.field.spirits.push(skull)
    s.players.p1.trashCards.push("BS01-001", "BS01-001")
    const before = s.players.p1.field.spirits.length

    destroySpirit(s, "p1", skull.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })

    const after = s.players.p1.field.spirits.length
    assert(after > before - 1, `破壊された1体より多く場に残る＝召喚が発揮された（${before} → ${after}）`)
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-001"),
        "トラッシュのコスト1以下のスピリットが場に出ている",
    )
}

console.log("=== BS13-010：同じ持ち主の別のスピリットが破壊されても発火しない（selfOnly） ===")
{
    const s = game("skullzard-selfonly")
    s.turnPlayer = "p2"
    const skull = createInstance("BS13-010", s.turn, minLevelCores(getCard("BS13-010")) + 2)
    s.players.p1.field.spirits.push(skull)
    const other = createInstance("BS01-002", s.turn, minLevelCores(getCard("BS01-002")))
    s.players.p1.field.spirits.push(other)
    s.players.p1.trashCards.push("BS01-001", "BS01-001")

    destroySpirit(s, "p1", other.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })

    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === "BS01-001"),
        "自分以外の破壊では召喚は発揮されない",
    )
}

console.log("すべてのチェックに合格しました 🎉（part311）")
