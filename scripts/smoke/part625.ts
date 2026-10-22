// smoke パート625（BS17-063 黒き聖杯 Lv2：「相手のスピリット/マジックの効果で」はネクサスの効果を含まない）
import { assert, createGame, createInstance, destroySpirit, getCard, runTurnStart } from "./helpers"
import type { CardType } from "../../server/src/type"

const GRAIL = "BS17-063"
const GAHERIS = "BS11-010" // 闇騎士ガヘリス
const R1 = "BS01-002" // ロクケラトプス
for (const [id, name] of [[GRAIL, "黒き聖杯"], [GAHERIS, "闇騎士ガヘリス"], [R1, "ロクケラトプス"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
}

function destroyBy(sourceType: CardType): boolean {
    const s = createGame(`grail-${sourceType}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.field.nexuses.push(createInstance(GRAIL, s.turn, 2))
    const victim = createInstance(GAHERIS, s.turn, 1)
    s.players.p1.field.spirits.push(victim)
    s.players.p2.field.spirits.push(createInstance(R1, s.turn, 1))
    destroySpirit(s, "p1", victim.instanceId, "destroy", { sourcePid: "p2", sourceType })
    return s.players.p2.field.spirits.length === 0
}

console.log("=== 063 Lv2：発生源の種別で絞る ===")
assert(destroyBy("spirit"), "相手のスピリットの効果で闇騎士が破壊されたら、相手のスピリットが破壊される")
assert(destroyBy("magic"), "相手のマジックの効果でも同じ")
assert(!destroyBy("nexus"), "相手のネクサスの効果では発揮しない")

console.log("すべてのチェックに合格しました 🎉（part625）")
