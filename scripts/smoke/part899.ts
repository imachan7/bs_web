// smoke パート899（#437 SP-1・SP-2：複数の対象は全部選んでから同時に適用する。2026-11-12 ユーザー決定。logic/pickTargets.ts）
import { assert, createGame, createInstance, fireTrigger, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const CURSE = "SD13-X01" // 邪龍王カースドラゴン（召喚時：疲労状態の相手2体を破壊、1体につき1ドロー）
const MIKENE = "BS03-049" // ミケネ（破壊時：自分のスピリット1体を回復）
const GIGA = "BS12-016" // 骸巨人ギ・ガッシャ（召喚時：コスト合計13まで無魔を好きなだけ手札へ）
const MUMA6 = "BS04-019" // 首無し馬車（無魔・コスト6）
const MUMA8 = "BS19-X02" // 冥府三巨頭バロック・ボルドー（無魔・コスト8）
const GRIFFON = "BS22-X04" // 黒皇機獣ダークネス・グリフォン（召喚時：相手のスピリット2体までを手札に戻す）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CURSE).name === "邪龍王カースドラゴン", "CURSEはカースドラゴン")
    assert(getCard(MIKENE).name === "ミケネ" && getCard(MIKENE).cost === 1, "MIKENEはミケネ")
    assert(getCard(GIGA).name === "骸巨人ギ・ガッシャ", "GIGAはギ・ガッシャ")
    assert(getCard(MUMA6).cost === 6 && getCard(MUMA6).family.includes("無魔") && getCard(MUMA6).type === "spirit", "MUMA6は無魔コスト6")
    assert(getCard(MUMA8).cost === 8 && getCard(MUMA8).family.includes("無魔") && getCard(MUMA8).type === "spirit", "MUMA8は無魔コスト8")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはバニラ")
    assert(getCard(GRIFFON).name === "黒皇機獣ダークネス・グリフォン", "GRIFFONはダークネス・グリフォン")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "yellow" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}
function put(s: GameState, pid: "p1" | "p2", cardId: string, rested = false) {
    const inst = createInstance(cardId, s.turn, 1)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 欠陥B：カースドラゴンで2体破壊すると2枚ドローする（対話） ===")
{
    const s = game("p899-1")
    const curse = put(s, "p1", CURSE)
    const [a, b] = [put(s, "p2", VANILLA, true), put(s, "p2", VANILLA, true), put(s, "p2", VANILLA, true)]
    const hand = s.players.p1.hand.length
    fireTrigger(s, "p1", curse, "onSummon")
    assert(s.pendingChoice?.kind === "target" && s.pendingChoice.candidates.length === 3, "疲労状態の3体から選ぶ")
    handleAction(s, "p1", { type: "resolveChoice", instanceId: a!.instanceId })
    assert(s.players.p2.field.spirits.length === 3, "1体目を選んだ時点ではまだ破壊されない")
    handleAction(s, "p1", { type: "resolveChoice", instanceId: b!.instanceId })
    assert(s.players.p2.field.spirits.length === 1, `2体そろったら同時に破壊される（残り${s.players.p2.field.spirits.length}）`)
    assert(s.players.p1.hand.length === hand + 2, `破壊した2体ぶん2枚ドローする（+${s.players.p1.hand.length - hand}）`)
}

console.log("=== 2. 欠陥A：「2体まで破壊」の1体目の破壊時効果が選択をはさんでも、2体目が消えない ===")
{
    const s = game("p899-2")
    const mikene = put(s, "p2", MIKENE)
    const v = put(s, "p2", VANILLA)
    put(s, "p2", VANILLA, true) // ミケネの回復先（選ばない）
    put(s, "p2", VANILLA, true)
    resolveAction(s, "p1", null, { type: "destroy", count: 2, upTo: true })
    handleAction(s, "p1", { type: "resolveChoice", instanceId: mikene.instanceId })
    handleAction(s, "p1", { type: "resolveChoice", instanceId: v.instanceId })
    // ミケネの破壊時（回復させる1体を選ぶ）に答える
    for (let i = 0; i < 5 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        handleAction(s, pc.pid, pc.kind === "target" ? { type: "resolveChoice", instanceId: pc.candidates[0]! } : { type: "resolveChoice", option: pc.options?.[0] ?? "発動する" })
    }
    const left = s.players.p2.field.spirits.map((x) => x.instanceId)
    assert(!left.includes(mikene.instanceId) && !left.includes(v.instanceId), "選んだ2体とも破壊される")
    assert(left.length === 2, `選ばなかった2体は残る（${left.length}）`)
}

console.log("=== 3. 「2体まで」は1体で確定できる ===")
{
    const s = game("p899-3")
    const [a] = [put(s, "p2", VANILLA), put(s, "p2", VANILLA), put(s, "p2", VANILLA)]
    resolveAction(s, "p1", null, { type: "destroy", count: 2, upTo: true })
    handleAction(s, "p1", { type: "resolveChoice", instanceId: a!.instanceId })
    assert(s.pendingChoice?.optional === true, "2体目は選ばずに終えられる")
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.players.p2.field.spirits.length === 2 && !s.players.p2.field.spirits.includes(a!), "選んだ1体だけ破壊される")
}

console.log("=== 4. SP-2：ギ・ガッシャは予算内で選べる（8/6/6/6 から 6+6） ===")
{
    const s = game("p899-4")
    const giga = put(s, "p1", GIGA)
    s.players.p1.trashCards = [MUMA8, MUMA6, MUMA6, MUMA6]
    const hand = s.players.p1.hand.length
    fireTrigger(s, "p1", giga, "onSummon")
    assert(s.pendingChoice?.kind === "card" && s.pendingChoice.optional === true, "戻すカードを選ぶ待ちが出る（自動で全部にならない）")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: 1 })
    assert(s.pendingChoice?.kind === "card" && !(s.pendingChoice.cardIndices ?? []).includes(0), "残り予算7ではコスト8は選べない")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: 2 })
    // 残り予算1：選べるものが無いので確定する
    assert(s.pendingChoice === null, "予算が尽きたら確定する")
    assert(s.players.p1.hand.length === hand + 2 && s.players.p1.trashCards.length === 2, `コスト6の2枚が手札に戻る（+${s.players.p1.hand.length - hand}）`)
}

console.log("=== 5. ダークネス・グリフォン：「2体までを手札に戻す」は1体で確定できる（効果文の「まで」） ===")
{
    const s = game("p899-5")
    const griffon = put(s, "p1", GRIFFON)
    const [a] = [put(s, "p2", VANILLA), put(s, "p2", VANILLA), put(s, "p2", VANILLA)]
    const hand = s.players.p2.hand.length
    fireTrigger(s, "p1", griffon, "onSummon")
    handleAction(s, "p1", { type: "resolveChoice", instanceId: a!.instanceId })
    assert(s.pendingChoice?.optional === true, "2体目は選ばずに終えられる")
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.players.p2.field.spirits.length === 2 && s.players.p2.hand.length === hand + 1, `選んだ1体だけ手札に戻る（場${s.players.p2.field.spirits.length}・手札+${s.players.p2.hand.length - hand}）`)
}

console.log("すべてのチェックに合格しました 🎉（part899）")
