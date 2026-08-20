// smoke パート221（【転召】の手順：召喚されたスピリットは転召の後に場へ出る）
//
// 手順（docs/design/RESUME_STACK.md §6。2026-08-13 ユーザー確認）:
//   1. 手札から召喚するカードを提示する
//   2. コストを支払う
//   3. 【転召】で指定された処理を行う   ← 対象選択で中断するのはここ
//   4. カードに維持コストを置く
//   5. 召喚完了。その後、召喚時効果などがあれば発揮される
//
// 2026-08-20 まで実装は先にカードを場へ出してから転召を解決していたため、
// 対戦者からは「召喚が済んだ後に転召の対象を選ばされる」ように見えていた。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"

const TENSHO = "BS04-010" // 雷帝エール・クレル（【転召：コスト5以上/トラッシュ】）
const VICTIM = "BS01-016" // スケルトン・ジョウ（コスト5＝転召の対象になれる）

console.log("=== 【転召】の対象選択中は、召喚したスピリットはまだ場に出ていない ===")
{
    const s = createGame("tensho-order", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 40
    s.interactiveTargets = true // 実対戦と同じく選択を出す（既定の false では中断しない）

    // 転召の候補を2体置く（1体だと選択にならず自動で決まる）
    const victimA = createInstance(VICTIM, s.turn, 3)
    const victimB = createInstance(VICTIM, s.turn, 3)
    s.players.p1.field.spirits.push(victimA, victimB)
    s.players.p1.hand = [TENSHO]
    const handBefore = s.players.p1.hand.length
    const reserveAfterNoCost = s.players.p1.reserve

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚を宣言できる")

    // ここが本題：転召の対象選択で止まっており、召喚したカードはまだフィールドに無い
    assert(s.pendingChoice !== null, "【転召】の対象選択で中断している")
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO),
        "選択待ちの間、召喚したスピリットはまだ場に出ていない",
    )
    assert(s.players.p1.hand.length === handBefore - 1, "手札からは出ている（提示済み）")
    assert(s.players.p1.reserve < reserveAfterNoCost, "召喚コストは支払い済み")
    assert(s.players.p1.field.spirits.length === 2, "場にいるのは犠牲候補の2体だけ")

    // 犠牲を選ぶと、コアが移って消滅し、そこで初めて召喚が完了する
    const pick = s.pendingChoice?.candidates?.[0] ?? victimA.instanceId
    assert(act(s, "p1", { type: "resolveChoice", instanceId: pick }) === null, "犠牲を選ぶ")

    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO),
        "選択の解決後に召喚が完了し、場に出ている",
    )
    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === TENSHO)
    assert(
        !!summoned && summoned.cores === getCard(TENSHO).levels[0]!.cores,
        `維持コアが置かれている（実際: ${summoned?.cores}）`,
    )
    assert(
        s.players.p1.field.spirits.filter((sp) => sp.cardId === VICTIM).length === 1,
        "選ばれた犠牲は維持コア割れで消滅し、もう1体は残る",
    )
}

console.log("=== 中断しない場合（候補1体）でも手順は同じ ===")
{
    const s = createGame("tensho-order-single", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 40
    s.players.p1.field.spirits.push(createInstance(VICTIM, s.turn, 3))
    s.players.p1.hand = [TENSHO]

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(s.pendingChoice === null, "候補1体なので選択待ちは立たない")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO),
        "召喚は完了して場に出ている",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === VICTIM),
        "犠牲は消滅している",
    )
}
