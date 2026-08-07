// smoke パート116（プレイブック §5-A の残り3枚）
//
// 新設した機構:
//   - battleWon.selfOnly（『このスピリットのバトル時』＝発生源自身が勝ったときだけ発火）
//   - battleWon.optional（「〜できる」。step / triggered と同じく interactiveTargets で確認を出す）
//   - moveCoresLeavingOne.selfTarget / allowNexusDest（対象を発生源自身に固定・移し先にネクサスも許す）
//   - action:"swapOpponentCores"（相手スピリット2体のコアをすべて入れ替える）
//   - step.timing:"end"（ステップ終了時の誘発。PhaseManager.endTurn がアタックステップ終了時に呼ぶ）
//   - step.condition:{ownRefreshedSpiritsAtLeast}（自分の回復状態スピリットの体数条件）
// 実装したカード:
//   - BS01-025 要塞龍ギガ Lv2（バトル勝利時に自身のコアを他のスピリット／ネクサスへ）
//   - BS04-053 天使スローン Lv2･Lv3（スタートステップに相手スピリット2体のコアを入れ替える）
//   - BS02-079 紫水晶の森 Lv2（アタックステップ終了時、回復状態3体以上で2ドロー）
import { assert, createGame, createInstance, currentLevel, getCard, fireStepTriggers, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireBattleWonTriggers } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS01-025").name === "要塞龍ギガ", "BS01-025 は要塞龍ギガ")
    assert(getCard("BS04-053").name === "天使スローン", "BS04-053 は天使スローン")
    assert(getCard("BS02-079").name === "紫水晶の森", "BS02-079 は紫水晶の森")
    assert(getCard("BS01-001").name === "ゴラドン", "BS01-001 はゴラドン")
    assert(getCard("BS01-008").name === "メタルバーン", "BS01-008 はメタルバーン")
    assert(getCard("BS02-079").type === "nexus", "紫水晶の森はネクサス")
}

console.log("=== BS01-025 要塞龍ギガ Lv2：バトル勝利時、自身のコアを他のスピリットへ移す ===")
{
    const s = createGame("t116-giga-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const giga = putSpirit(s, "p1", "BS01-025", 3)
    const dest = putSpirit(s, "p1", "BS01-001", 1)
    assert(currentLevel(giga).level === 2, `ギガは3コアでLv2（実際: ${String(currentLevel(giga).level)}）`)

    fireBattleWonTriggers(s, "p1", giga, "attacker")
    assert(giga.cores === 1, `ギガのコアは1個だけ残る（実際: ${String(giga.cores)}）`)
    assert(dest.cores === 3, `ゴラドンへ2個移る（実際: ${String(dest.cores)}）`)
}

console.log("=== BS01-025 要塞龍ギガ Lv2：移し先のスピリットがいなければネクサスへ ===")
{
    const s = createGame("t116-giga-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const giga = putSpirit(s, "p1", "BS01-025", 3)
    const nexus = putNexus(s, "p1", "BS02-079", 0)

    fireBattleWonTriggers(s, "p1", giga, "blocker")
    assert(giga.cores === 1, `ギガのコアは1個だけ残る（実際: ${String(giga.cores)}）`)
    assert(nexus.cores === 2, `ネクサスへ2個移る（実際: ${String(nexus.cores)}）`)
}

console.log("=== BS01-025 要塞龍ギガ：Lv1では発揮しない／自身が勝っていなければ発揮しない ===")
{
    // Lv1（2コア。Lv2は3コア必要）。コアは2個あるので、レベル判定が効いていなければ移動してしまう
    const s = createGame("t116-giga-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const giga = putSpirit(s, "p1", "BS01-025", 2)
    const other = putSpirit(s, "p1", "BS01-001", 1)
    assert(currentLevel(giga).level === 1, `ギガは2コアでLv1（実際: ${String(currentLevel(giga).level)}）`)
    fireBattleWonTriggers(s, "p1", giga, "attacker")
    assert(giga.cores === 2 && other.cores === 1, `Lv1では発揮しない（実際: ギガ${String(giga.cores)}／ゴラドン${String(other.cores)}）`)

    // selfOnly：ギガ以外のスピリットが勝っても、ギガの効果は発火しない
    const s2 = createGame("t116-giga-4", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s2)
    const giga2 = putSpirit(s2, "p1", "BS01-025", 3)
    const winner = putSpirit(s2, "p1", "BS01-001", 1)
    fireBattleWonTriggers(s2, "p1", winner, "attacker")
    assert(giga2.cores === 3, `他のスピリットの勝利では発火しない（実際: ${String(giga2.cores)}）`)
}

console.log("=== BS04-053 天使スローン Lv2：スタートステップに相手スピリット2体のコアを入れ替える ===")
{
    const s = createGame("t116-throne-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    const throne = putSpirit(s, "p1", "BS04-053", 3)
    assert(currentLevel(throne).level === 2, `スローンは3コアでLv2（実際: ${String(currentLevel(throne).level)}）`)
    // 実効BP：メタルバーン(3コア=Lv2 4000) > ゴラドン(1コア=Lv1 1000)
    const high = putSpirit(s, "p2", "BS01-008", 3)
    const low = putSpirit(s, "p2", "BS01-001", 1)

    fireStepTriggers(s, "start")
    assert(high.cores === 1, `メタルバーンのコアは1個になる（実際: ${String(high.cores)}）`)
    assert(low.cores === 3, `ゴラドンのコアは3個になる（実際: ${String(low.cores)}）`)
    assert(throne.cores === 3, `スローン自身のコアは変わらない（実際: ${String(throne.cores)}）`)
}

console.log("=== BS04-053 天使スローン：Lv1では発揮しない／相手が1体なら不発 ===")
{
    const s = createGame("t116-throne-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    putSpirit(s, "p1", "BS04-053", 1) // Lv1
    const high = putSpirit(s, "p2", "BS01-008", 3)
    const low = putSpirit(s, "p2", "BS01-001", 1)
    fireStepTriggers(s, "start")
    assert(high.cores === 3 && low.cores === 1, `Lv1では入れ替えない（実際: ${String(high.cores)}／${String(low.cores)}）`)

    const s2 = createGame("t116-throne-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s2)
    s2.turnPlayer = "p1"
    putSpirit(s2, "p1", "BS04-053", 3)
    const only = putSpirit(s2, "p2", "BS01-008", 3)
    fireStepTriggers(s2, "start")
    assert(only.cores === 3, `相手が1体なら不発（実際: ${String(only.cores)}）`)
}

console.log("=== BS04-053 天使スローン：入れ替えで維持コアを割った側は消滅する ===")
{
    const s = createGame("t116-throne-4", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    putSpirit(s, "p1", "BS04-053", 4) // Lv3
    const high = putSpirit(s, "p2", "BS01-008", 3)
    const empty = putSpirit(s, "p2", "BS01-001", 1)
    empty.cores = 0 // 何らかの効果でコアを失った状態を想定

    fireStepTriggers(s, "start")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === high.instanceId),
        "コア0になったメタルバーンは消滅する",
    )
    assert(empty.cores === 3, `ゴラドンは3コアを受け取る（実際: ${String(empty.cores)}）`)
}

console.log("=== BS02-079 紫水晶の森 Lv2：アタックステップ終了時、回復状態3体以上で2ドロー ===")
{
    const s = createGame("t116-forest-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS02-079", 3) // Lv2
    for (const cardId of ["BS01-001", "BS01-008", "BS01-005"]) putSpirit(s, "p1", cardId, 1)

    // ステップ**開始**時には発揮しない（timing:"end" の切り分け）
    const before = s.players.p1.hand.length
    fireStepTriggers(s, "attack")
    assert(s.players.p1.hand.length === before, `開始時には引かない（実際: ${String(s.players.p1.hand.length - before)}枚）`)

    fireStepTriggers(s, "attack", undefined, "end")
    assert(
        s.players.p1.hand.length === before + 2,
        `終了時に2枚引く（実際: ${String(s.players.p1.hand.length - before)}枚）`,
    )
}

console.log("=== BS02-079 紫水晶の森：回復状態が2体なら引かない／Lv1では発揮しない ===")
{
    const s = createGame("t116-forest-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS02-079", 3)
    const spirits = ["BS01-001", "BS01-008", "BS01-005"].map((cardId) => putSpirit(s, "p1", cardId, 1))
    spirits[0]!.isRested = true // 回復状態は2体

    const before = s.players.p1.hand.length
    fireStepTriggers(s, "attack", undefined, "end")
    assert(s.players.p1.hand.length === before, `2体では引かない（実際: ${String(s.players.p1.hand.length - before)}枚）`)

    // Lv1（0コア）では発揮しない
    const s2 = createGame("t116-forest-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s2)
    s2.turnPlayer = "p1"
    s2.phase = "attack"
    putNexus(s2, "p1", "BS02-079", 0)
    for (const cardId of ["BS01-001", "BS01-008", "BS01-005"]) putSpirit(s2, "p1", cardId, 1)
    const before2 = s2.players.p1.hand.length
    fireStepTriggers(s2, "attack", undefined, "end")
    assert(s2.players.p1.hand.length === before2, `Lv1では引かない（実際: ${String(s2.players.p1.hand.length - before2)}枚）`)
}

console.log("=== BS02-079 紫水晶の森：endTurn がアタックステップ終了時の誘発を呼ぶ（配線確認） ===")
{
    const s = createGame("t116-forest-4", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS02-079", 3)
    for (const cardId of ["BS01-001", "BS01-008", "BS01-005"]) putSpirit(s, "p1", cardId, 1)

    const before = s.players.p1.hand.length
    endTurn(s)
    assert(
        s.players.p1.hand.length === before + 2,
        `endTurn 経由でも2枚引く（実際: ${String(s.players.p1.hand.length - before)}枚）`,
    )
}
