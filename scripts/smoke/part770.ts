// smoke パート770（アタック宣言の誘発は同時発揮。TIMING_CHART ＞１-2・＞１-3。2026-11-03 ユーザー確認・attackDeclared.ts）
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const WITCH = "BS01-040" // ダークウィッチ：Lv2･Lv3 アタック時、疲労状態のスピリット1体を破壊
const MIST = "BS11-031" // ワルキューレ・ミスト：Lv2･Lv3 相手のアタックステップ、相手のスピリットがアタックしたとき、相手のスピリット1体を疲労
const SPEARS = "BS01-104" // 千本槍の古戦場：相手のスピリットが疲労したとき、1枚ドロー
const MUSASHI = "BS15-X01" // 刀の覇王ムサシード・アシュライガー：バースト【相手のスピリットのアタック後】
const VANILLA = "BS01-002" // ロクケラトプス
const SANK = "BS04-054" // アルカナソルジャー・サンク：Lv2 相手のターン、相手の効果の対象をこのスピリットだけにできる

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(WITCH).name === "ダークウィッチ" && getCard(WITCH).levels[1]!.cores === 3, "WITCHはダークウィッチ（Lv2はコア3）")
    assert(getCard(MIST).name === "ワルキューレ・ミスト" && getCard(MIST).levels[1]!.cores === 3, "MISTはワルキューレ・ミスト（Lv2はコア3）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場")
    assert(getCard(MUSASHI).name === "刀の覇王ムサシード・アシュライガー", "MUSASHIはムサシード・アシュライガー")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはロクケラトプス")
    assert(getCard(SANK).name === "アルカナソルジャー・サンク" && getCard(SANK).levels[1]!.cores === 2, "SANKはサンク（Lv2はコア2）")
}

function game(): { s: GameState; witch: string; mine: string } {
    const s = createGame("part770", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p2.deck = Array.from({ length: 20 }, () => VANILLA)
    const witch = createInstance(WITCH, s.turn, 3)
    const mine = createInstance(VANILLA, s.turn, 1)
    s.players.p1.field.spirits.push(witch, mine)
    const rested = createInstance(VANILLA, s.turn, 1)
    rested.isRested = true
    s.players.p2.field.spirits.push(rested)
    return { s, witch: witch.instanceId, mine: mine.instanceId }
}

function answer(s: GameState, pick: (options: string[]) => string | undefined, target?: (c: string[]) => string | undefined): string[] {
    const prompts: string[] = []
    for (let i = 0; i < 10 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        prompts.push(pc.prompt)
        const res: Record<string, unknown> = { type: "resolveChoice" }
        if (pc.kind === "option") res["option"] = pick(pc.options ?? []) ?? pc.options![0]
        else if (pc.kind === "target") res["instanceId"] = target?.(pc.candidates ?? []) ?? pc.candidates![0]
        else res["cardIndex"] = pc.cardIndices?.[0]
        if (handleAction(s, pc.pid as PlayerId, res as never) !== null) break
    }
    return prompts
}

console.log("=== 1. アタック時と相手の「アタックしたとき」は、解決順を選ぶ。相手を先にすると、その疲労が破壊の候補に入る ===")
{
    const { s, witch, mine } = game()
    s.players.p2.field.spirits.push(createInstance(MIST, s.turn, 3))
    refreshLevelAsOverrides(s)
    assert(handleAction(s, "p1", { type: "attack", instanceId: witch }) === null, "アタックできる")
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined && (pc.options ?? []).length === 2, `解決順の確認が立つ（${pc?.prompt}）`)
    let candidates: string[] = []
    answer(
        s,
        (o) => o.find((x) => x.includes("ワルキューレ")),
        (c) => {
            if (c.includes(witch) || c.includes(mine)) candidates = c
            return c.includes(mine) ? mine : c[0]
        },
    )
    assert(candidates.includes(mine), "先に解決したワルキューレ・ミストで疲労した自分のロクケラトプスが、ダークウィッチの破壊の候補に入る")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === mine), "選んだロクケラトプスが破壊される")
}

console.log("=== 2. アタッカーの疲労による「疲労したとき」も同じ列に入る ===")
{
    const { s, witch } = game()
    s.players.p2.field.nexuses.push(createInstance(SPEARS, s.turn, 0))
    refreshLevelAsOverrides(s)
    const hand = s.players.p2.hand.length
    handleAction(s, "p1", { type: "attack", instanceId: witch })
    const opts = s.pendingChoice?.options ?? []
    assert(opts.some((o) => o.includes("ダークウィッチ")) && opts.some((o) => o.includes("千本槍の古戦場")), `ダークウィッチと千本槍の古戦場の解決順を選ぶ（${opts.join("／")}）`)
    answer(s, (o) => o[0])
    assert(s.players.p2.hand.length === hand + 1, "千本槍の古戦場で1枚ドローする")
}

console.log("=== 3. アタック時効果が対象選択で止まっても、アタック後バーストは判定される ===")
{
    const { s, witch } = game()
    s.players.p2.burst = MUSASHI
    s.players.p2.burstSet = true
    refreshLevelAsOverrides(s)
    handleAction(s, "p1", { type: "attack", instanceId: witch })
    assert(s.pendingChoice?.kind === "target", "ダークウィッチの破壊の対象選択で止まる")
    const prompts = answer(s, (o) => o[0])
    assert(prompts.some((p) => p.includes("ムサシード・アシュライガーのバーストを発動しますか")), `破壊を解決したあとにバーストの発動確認が出る（${prompts.join("／")}）`)
}

console.log("=== 4. 解決順を選んだ経路でも、相手の対象の付け替え（サンク）が効く ===")
{
    const { s, witch } = game()
    const sank = createInstance(SANK, s.turn, 2)
    sank.isRested = true
    s.players.p2.field.spirits.push(sank)
    s.players.p2.field.nexuses.push(createInstance(SPEARS, s.turn, 0))
    refreshLevelAsOverrides(s)
    handleAction(s, "p1", { type: "attack", instanceId: witch })
    assert(s.pendingChoice?.triggerOrder !== undefined, "解決順の確認が立つ")
    let candidates: string[] = []
    answer(
        s,
        (o) => o.find((x) => x.includes("ダークウィッチ")),
        (c) => {
            candidates = c
            return c[0]
        },
    )
    const p2Others = s.players.p2.field.spirits.filter((x) => x.cardId === VANILLA).map((x) => x.instanceId)
    assert(candidates.includes(sank.instanceId) && !p2Others.some((id) => candidates.includes(id)), "相手のスピリットの候補はサンクだけに絞られる")
}

console.log("すべてのチェックに合格しました 🎉（part770）")
