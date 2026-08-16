// smoke パート107（【転召】置換の任意発動化 ＋ 竜使い6枚への実装漏れ修正）
// 検証する挙動:
//   - BS05の竜使い6枚すべてが constraint "tenshoCoreSubstitute" を持つ（アルブス以外の5枚は未実装だった）
//   - interactiveTargets時、【転召】の対象になったとき「疲労してコアを維持する／疲労せずコアを置く」を選ばせる
//     （「〜することで」は任意発動なので自動で疲労させない）
//   - 「疲労せずコアを置く」を選ぶと通常の転召（コアをトラッシュへ・維持コア割れで消滅）になる
//   - 自動時（テスト既定）は従来どおり疲労してコアを維持する決定的簡略化
//   - BS04-X15 カイザーアトラス皇帝の「コア1個をボイドに置くことで」が optional（発動確認が出る）
import {
    assert,
    act,
    createGame,
    createInstance,
    getCard,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { effectiveCost } from "../../server/src/logic/RuleValidator"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// 竜使い6枚（各色1枚ずつ）。cardId と「置換が有効なレベル」の対応
const DRAGON_RIDERS: { cardId: string; name: string; levels: number[] }[] = [
    { cardId: "BS05-007", name: "真紅の竜使いロッソ", levels: [1, 2, 3] },
    { cardId: "BS05-017", name: "紫煙の竜使いヴァイオレット", levels: [1, 2, 3] },
    { cardId: "BS05-026", name: "碧緑の竜使いグリューン", levels: [1, 2] },
    { cardId: "BS05-034", name: "白亜の竜使いアルブス", levels: [1, 2, 3] },
    { cardId: "BS05-043", name: "黄昏の竜使いフラウム", levels: [1, 2, 3] },
    { cardId: "BS05-053", name: "蒼海の竜使いアズール", levels: [1, 2] },
]

console.log("=== 竜使い6枚すべてが constraint tenshoCoreSubstitute を持つ ===")
for (const { cardId, name, levels } of DRAGON_RIDERS) {
    const card = getCard(cardId)
    assert(card.name === name, `${cardId} は${name}（cardIdのズレ検出）`)
    const entry = card.effects.find(
        (e) => e.kind === "constraint" && e.constraint.type === "tenshoCoreSubstitute",
    )
    assert(entry !== undefined, `${name}は【転召】置換の constraint を持つ`)
    const entryLevels = entry && entry.kind === "constraint" ? entry.levels : undefined
    assert(
        JSON.stringify(entryLevels) === JSON.stringify(levels),
        `${name}の置換は Lv${levels.join("･")} で有効（実際 ${JSON.stringify(entryLevels)}）`,
    )
}

console.log("=== 自動時（interactiveTargets=false）は従来どおり疲労してコアを維持する ===")
{
    const s = createGame("tensho-sub-auto", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turnPlayer = "p1"
    s.phase = "main"
    const rosso = putSpirit(s, "p1", "BS05-007", 3) // 真紅の竜使いロッソ（コスト6・転召候補になれる）
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010" // 雷帝エール・クレル（転召：コスト5以上/トラッシュ）
    const trashCoresBefore = s.players.p1.trashCores
    const summonCost = effectiveCost(s, "p1", getCard("BS04-010"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "雷帝エール・クレルを召喚できる")
    const inst = s.players.p1.field.spirits.find((x) => x.instanceId === rosso)!
    assert(inst.cores === 3, "ロッソはコアを失わない（置換）")
    assert(inst.isRested === true, "ロッソは疲労する")
    assert(
        s.players.p1.trashCores === trashCoresBefore + summonCost,
        "トラッシュのコアは召喚コスト分のみ増える",
    )
}

console.log("=== interactive時：【転召】の対象になったとき、疲労するかコアを置くかを選ばせる ===")
{
    const s = createGame("tensho-sub-choice", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    const azur = putSpirit(s, "p1", "BS05-053", 4) // 蒼海の竜使いアズール（コスト6）
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    const pending = s.pendingChoice
    assert(pending !== null, "【転召】置換の選択待ちが立つ（任意発動なので自動で疲労させない）")
    assert(pending?.kind === "option", "選択肢形式（option）で聞く")
    assert(
        JSON.stringify(pending?.options) === JSON.stringify(["疲労してコアを維持する", "疲労せずコアを置く"]),
        `選択肢は2つ（実際 ${JSON.stringify(pending?.options)}）`,
    )
    assert(pending?.pid === "p1", "選ぶのは転召の持ち主")
    assert(
        act(s, "p1", { type: "resolveChoice", option: "疲労してコアを維持する" }) === null,
        "「疲労してコアを維持する」を選べる",
    )
    const inst = s.players.p1.field.spirits.find((x) => x.instanceId === azur)!
    assert(s.pendingChoice === null, "選択後は選択待ちが解消する")
    assert(inst.cores === 4 && inst.isRested === true, "コアを維持したまま疲労する")
}

console.log("=== interactive時：「疲労せずコアを置く」を選ぶと通常の転召になる ===")
{
    const s = createGame("tensho-sub-decline", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    const azur = putSpirit(s, "p1", "BS05-053", 4)
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010"
    const trashCoresBefore = s.players.p1.trashCores
    const summonCost = effectiveCost(s, "p1", getCard("BS04-010"))
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(
        act(s, "p1", { type: "resolveChoice", option: "疲労せずコアを置く" }) === null,
        "「疲労せずコアを置く」を選べる",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === azur),
        "コアをすべて置いたため維持コア割れでアズールは消滅する",
    )
    assert(s.players.p1.trashCards.includes("BS05-053"), "アズールはトラッシュへ")
    assert(
        s.players.p1.trashCores === trashCoresBefore + summonCost + 4,
        `召喚コスト分＋転召で移したコア4個がトラッシュへ（実際${s.players.p1.trashCores - trashCoresBefore}）`,
    )
}

console.log("=== interactive時：転召対象が2体以上なら、対象選択のあとに置換の確認が続く ===")
{
    const s = createGame("tensho-sub-chain", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    const azur = putSpirit(s, "p1", "BS05-053", 4) // 竜使い（置換を持つ）
    putSpirit(s, "p1", "BS04-010", 1) // 雷帝エール・クレル（コスト5以上・置換を持たない）
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(s.pendingChoice?.kind === "target", "まず転召の対象を選ぶ")
    assert(
        act(s, "p1", { type: "resolveChoice", instanceId: azur }) === null,
        "竜使いを転召の対象に選べる",
    )
    assert(s.pendingChoice !== null, "対象選択の解決中に置換の確認が続けて立つ")
    assert(s.pendingChoice?.kind === "option", "置換の確認は選択肢形式")
    assert(
        act(s, "p1", { type: "resolveChoice", option: "疲労してコアを維持する" }) === null,
        "疲労を選べる",
    )
    const inst = s.players.p1.field.spirits.find((x) => x.instanceId === azur)!
    assert(inst.cores === 4 && inst.isRested === true, "コアを維持したまま疲労する")
}

console.log("=== BS05-053 アズール：すでに疲労中なら置換を選べず、通常の転召になる ===")
{
    const s = createGame("tensho-sub-rested", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    const azur = putSpirit(s, "p1", "BS05-053", 4)
    s.players.p1.field.spirits.find((x) => x.instanceId === azur)!.isRested = true
    s.players.p1.reserve = 30
    s.players.p1.hand[0] = "BS04-010"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    assert(s.pendingChoice === null, "疲労中は確認を出さない（コストを払えないため）")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === azur),
        "通常の転召としてコアをすべて失い消滅する",
    )
}

console.log("=== BS04-X15 カイザーアトラス皇帝：「コアをボイドに置くことで」は任意発動 ===")
{
    const entry = getCard("BS04-X15").effects.find((e) => e.id === "BS04-X15-e2")
    assert(entry?.kind === "triggered" && entry.optional === true, "ライフ回収は optional（発動確認を出す）")
}
