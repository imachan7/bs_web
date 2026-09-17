// smoke パート341（破壊されたスピリット自身の「このスピリットが破壊されたとき」が2回発火しない。2026-09-17）
//
// fireFieldEventTriggers は extraSources を effectSources と連結するとき instanceId の重複を除いていなかった。
// destroySpirit が fireOwnSpiritDestroyed を呼ぶ時点では、破壊された個体はまだ field.spirits に居るので、
// extraSources に渡した同じ個体が2回数えられ、fieldEvent＋selfOnly の効果が2回解決されていた。
// BS13-010 スカルザード（「トラッシュのコスト1以下のスピリットカード2枚までを召喚」）が4体召喚していた。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { assert, createGame, createInstance, destroySpirit, runTurnStart } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const skull = ALL_CARDS.find((c) => c.name === "スカルザード")!
assert(skull !== undefined && skull.type === "spirit", "テスト前提: スカルザードがいる")
const cheap = ALL_CARDS.filter((c) => c.type === "spirit" && c.cost <= 1 && c.effect === "").slice(0, 4)
assert(cheap.length === 4, "テスト前提: コスト1以下のバニラのスピリットが4種いる")

console.log("=== BS13-010 スカルザード Lv2：相手の効果で破壊されたとき、召喚は2体まで ===")
{
    const s = createGame("p341", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turnPlayer = "p2" // スカルザードの持ち主（p1）から見て『相手のターン』
    const p1 = s.players.p1
    p1.field.spirits = []
    const inst = createInstance(skull.cardId, s.turn, skull.levels[1]!.cores)
    p1.field.spirits.push(inst)
    p1.trashCards.push(...cheap.map((c) => c.cardId))
    destroySpirit(s, "p1", inst.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const summoned = p1.field.spirits.filter((x) => cheap.some((c) => c.cardId === x.cardId))
    assert(summoned.length === 2, `召喚されたのは2体（${summoned.length}体）`)
    assert(p1.trashCards.filter((id) => cheap.some((c) => c.cardId === id)).length === 2, "トラッシュに2枚残る")
}

console.log("すべてのチェックに合格しました 🎉（part341）")
