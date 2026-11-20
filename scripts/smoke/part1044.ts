// smoke パート1044（BS18-X01 超覇王ロード・ドラゴン・セイバー：#664 バースト転召の手順。RESUME_STACK.md §6）
// 転召（対象のコアすべてをボイドへ）→ 置くコアを選んで払う → 場に出す → 召喚時効果
import { act, assert, createGame, createInstance, getCard, placeBurst, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { burstTenshoTargets, burstTenshoUnpayable } from "../../server/src/logic/keywords/tensho"

const SABER = "BS18-X01"
const WORLD = "X022" // 覇王ロード・ドラゴン・ザ・ワールド（Lv3＝6コア）
const LORD = "SD06-007" // 英雄龍ロード・ドラゴン

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SABER).name === "超覇王ロード・ドラゴン・セイバー" && getCard(SABER).levels[0]?.cores === 1, "SABERはLv1が1コア")
    assert(getCard(WORLD).name === "覇王ロード・ドラゴン・ザ・ワールド" && getCard(WORLD).levels.some((l) => l.level === 3 && l.cores === 6), "WORLDはLv3が6コア")
    assert(getCard(LORD).name === "英雄龍ロード・ドラゴン" && getCard(LORD).family.includes("覇皇"), "LORDは覇皇")
    assert(getCard(SABER).effects.some((e) => e.kind === "keyword" && e.keyword === "burstTensho"), "SABERは【バースト転召】を持つ")
}

function scene(seed: string, spirits: [string, number][], reserve: number): { s: GameState; ids: string[] } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = reserve
    const ids = spirits.map(([cardId, cores]) => {
        const inst = createInstance(cardId, s.turn, cores)
        s.players.p1.field.spirits.push(inst)
        return inst.instanceId
    })
    refreshLevelAsOverrides(s)
    return { s, ids }
}

// 転召の対象に targetId を選び、置くコアは最大を選んで進める。待ちの種類を記録して返す
function run(s: GameState, targetId: string | undefined): { kinds: string[]; paySuggested: string[][] } {
    placeBurst(s, "p1", SABER)
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "set" })
    const kinds: string[] = []
    const paySuggested: string[][] = []
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.effectCostPay) {
            kinds.push("cores")
            paySuggested.push((pc.effectCostPay.suggestByOption ?? []).flat().map((x) => x.instanceId))
            act(s, "p1", { type: "resolveChoice", option: pc.options!.at(-1)! })
        } else if (pc.kind === "target") {
            kinds.push("tensho")
            act(s, "p1", { type: "resolveChoice", instanceId: targetId ?? pc.candidates[0]! })
        } else {
            kinds.push("other")
            act(s, "p1", { type: "resolveChoice", option: pc.options![0]! })
        }
    }
    return { kinds, paySuggested }
}
const onField = (s: GameState, id: string): boolean => s.players.p1.field.spirits.some((x) => x.instanceId === id)

console.log("=== (a) 報告の盤面：ワールド6コア＋ロード1コア・リザーブ少なめ。置くコアを最大にしても召喚できる ===")
{
    const { s, ids } = scene("a", [[WORLD, 6], [LORD, 1]], 2)
    const { kinds, paySuggested } = run(s, undefined)
    const saber = s.players.p1.field.spirits.find((x) => x.cardId === SABER)
    assert(kinds[0] === "tensho" && kinds.includes("cores"), `転召の対象選択 → 置くコアの選択の順（${kinds.join(",")}）`)
    assert(saber !== undefined, "セイバーが召喚された")
    assert(!onField(s, ids[0]!), "転召の対象（ワールド）は場にいない")
    assert(!s.players.p1.trashCards.includes(SABER) && s.players.p1.burst === null, "バーストは使い終わっている")
    assert(saber!.cores >= 1, `置くコアがある（${saber?.cores}）`)
    assert(paySuggested.every((l) => !l.includes(ids[0]!)), "(c) 置くコアの支払い元に、転召で消えた対象が入っていない")
}

console.log("=== (b) ロード1体＋リザーブ2：転召でロードのコアはボイドへ、リザーブから置いて召喚 ===")
{
    const { s, ids } = scene("b", [[LORD, 1]], 2)
    const reserveBefore = s.players.p1.reserve
    run(s, undefined)
    const saber = s.players.p1.field.spirits.find((x) => x.cardId === SABER)
    assert(saber !== undefined, "セイバーが召喚された")
    assert(!onField(s, ids[0]!), "ロードは転召で消滅")
    assert(saber!.cores === reserveBefore, `リザーブ${reserveBefore}個すべてを置いた（${saber?.cores}）`)
    assert(s.players.p1.reserve === 0, "リザーブは空")
}

console.log("=== (c) 対象を選んだ後に置くコアを選ぶ。対象のコアは置くコアの選択時にすでに無い ===")
{
    const { s, ids } = scene("c", [[WORLD, 6], [LORD, 1]], 0)
    placeBurst(s, "p1", SABER)
    resolveAction(s, "p1", null, { type: "activateBurstIgnoringCondition", from: "set" })
    assert(s.pendingChoice?.kind === "target", "まず転召の対象選択")
    act(s, "p1", { type: "resolveChoice", instanceId: ids[0]! })
    const pc = s.pendingChoice
    assert(pc?.effectCostPay !== undefined || s.players.p1.field.spirits.some((x) => x.cardId === SABER), "転召の後に置くコアの選択か、自動で召喚")
    assert(s.players.p1.field.spirits.find((x) => x.instanceId === ids[0])?.cores === 0 || !onField(s, ids[0]!), "置くコアの選択時、対象のコアはすでにボイドへ（コア0）")
}

console.log("=== (d) 「コアをボイドに置くことで召喚する」：転召した後に召喚できない個体は対象にしない（〜することでの一般則） ===")
{
    // リザーブ0・ロード・ドラゴン1コアだけ：転召するとコアが1個も残らず、Lv1 の維持コアを置けない
    const none = scene("d-none", [[LORD, 1]], 0)
    assert(burstTenshoTargets(none.s, "p1", getCard(SABER)).length === 0, "対象にできる個体がいない")
    assert(burstTenshoUnpayable(none.s, "p1", getCard(SABER)), "発動しても召喚できない扱い")
    // リザーブ1があれば、ロード・ドラゴンを転召してもリザーブから1個置ける
    const one = scene("d-one", [[LORD, 1]], 1)
    assert(burstTenshoTargets(one.s, "p1", getCard(SABER)).length === 1, "リザーブ1なら対象にできる")
}

console.log("すべてのチェックに合格しました 🎉（part1044）")
