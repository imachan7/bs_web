// smoke パート771（ブロック宣言の誘発は同時発揮。ブロッカーの疲労による「疲労したとき」も同じ列に入る。2026-11-03 ユーザー確認）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const GABU = "BS06-028" // ガブノハシ：Lv1【暴風：1】ブロックされたとき、相手は相手の回復状態のスピリット1体を疲労させる
const MINK = "BS07-019" // スペアミンク（剣獣・効果なし）
const IMPALA = "BS09-021" // 武士インパラー：『相手のアタックステップ』系統：剣獣/勇傑を持つ自分のスピリットが疲労したとき、このスピリットは回復する
const VANILLA = "BS01-002" // ロクケラトプス（地竜・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(GABU).name === "ガブノハシ" && getCard(GABU).cost === 3 && getCard(GABU).levels[0]!.cores === 1, "GABUはガブノハシ（コスト3・Lv1はコア1）")
    assert(getCard(MINK).name === "スペアミンク" && getCard(MINK).family.includes("剣獣"), "MINKはスペアミンク（剣獣）")
    assert(getCard(IMPALA).name === "武士インパラー" && getCard(IMPALA).levels[0]!.cores === 1, "IMPALAは武士インパラー（Lv1はコア1）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).effect === "" && !getCard(VANILLA).family.includes("剣獣") && !getCard(VANILLA).family.includes("勇傑"), "VANILLAはロクケラトプス（効果なし・剣獣/勇傑でない）")
}

function setup(interactive: boolean, impalaRested: boolean, extraVanilla = false): { s: GameState; gabu: string; mink: string; impala: string; vanilla: string } {
    const s = createGame("part771", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "green" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    const gabu = createInstance(GABU, s.turn, 1)
    s.players.p1.field.spirits.push(gabu)
    const mink = createInstance(MINK, s.turn, 1)
    const impala = createInstance(IMPALA, s.turn, 1)
    impala.isRested = impalaRested
    s.players.p2.field.spirits.push(mink, impala)
    let vanilla = ""
    if (extraVanilla) {
        const v = createInstance(VANILLA, s.turn, 1)
        s.players.p2.field.spirits.push(v)
        vanilla = v.instanceId
    }
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: gabu.instanceId }) === null, "ガブノハシでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: mink.instanceId }) === null, "スペアミンクでブロック")
    return { s, gabu: gabu.instanceId, mink: mink.instanceId, impala: impala.instanceId, vanilla }
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
        if (act(s, pc.pid as PlayerId, res as never) !== null) break
    }
    return prompts
}

console.log("=== A（規則1・2）: ブロック宣言の暴風と、ブロッカーの疲労によるインパラーの誘発が同じ列に入る ===")
{
    const { s, impala } = setup(true, true)
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined, "解決順の確認が立つ")
    assert(pc?.pid === "p1", "選ぶのはターンプレイヤー（攻撃側）")
    const options = pc?.options ?? []
    assert(options.some((o) => o.includes("ガブノハシ")) && options.some((o) => o.includes("武士インパラー")), `候補に暴風とインパラーの誘発の両方がある（${options.join(" / ")}）`)
    answer(s, (o) => o[0])
}

console.log("=== B（規則1・2）: 順1 インパラーを先に解決すると、暴風でインパラーが疲労する ===")
{
    const { s, impala } = setup(true, true)
    answer(
        s,
        (o) => o.find((x) => x.includes("武士インパラー")),
        (c) => c.find((x) => x === impala) ?? c[0],
    )
    const inst = s.players.p2.field.spirits.find((x) => x.instanceId === impala)!
    assert(inst.isRested === true, `最後はインパラー疲労状態（isRested=${inst.isRested}）`)
}

console.log("=== B（規則1・2）: 順2 暴風を先に解決すると、疲労させる対象がおらず、インパラーは回復したまま ===")
{
    const { s, impala } = setup(true, true)
    answer(s, (o) => o.find((x) => x.includes("ガブノハシ")))
    const inst = s.players.p2.field.spirits.find((x) => x.instanceId === impala)!
    assert(inst.isRested === false, `最後はインパラー回復状態（isRested=${inst.isRested}）`)
}

console.log("=== C（規則3）: 暴風の対象選択で止まっても、答えたあと列の残り（インパラーの誘発）が解決する ===")
{
    const { s, impala, vanilla } = setup(true, false, true)
    let sawTarget = false
    const prompts = answer(
        s,
        (o) => o.find((x) => x.includes("ガブノハシ")),
        (c) => {
            sawTarget = true
            assert(c.includes(vanilla) && c.includes(impala), `疲労させる候補に回復状態の2体が出る（${c.join(" / ")}）`)
            return vanilla
        },
    )
    assert(sawTarget, "暴風でP2が疲労させる1体を選ぶ待ちになる")
    const impalaInst = s.players.p2.field.spirits.find((x) => x.instanceId === impala)!
    const vanillaInst = s.players.p2.field.spirits.find((x) => x.instanceId === vanilla)!
    assert(impalaInst.isRested === false, `インパラーは回復状態のまま（isRested=${impalaInst.isRested}）`)
    assert(vanillaInst.isRested === true, `選んだロクケラトプスは疲労（isRested=${vanillaInst.isRested}）`)
}

console.log("=== D（規則4）: 非対話では解決順を聞かず、止まらずに進む（インパラー疲労・ロクケラトプス回復で置く） ===")
{
    // どちらの順でも、暴風とインパラーの誘発の両方が解決したことになる結果にしかならない
    const { s, impala, vanilla } = setup(false, true, true)
    assert(s.pendingChoice === null, `解決順の確認は出ず止まらない（${s.pendingChoice?.prompt ?? "null"}）`)
    const impalaInst = s.players.p2.field.spirits.find((x) => x.instanceId === impala)!
    const vanillaInst = s.players.p2.field.spirits.find((x) => x.instanceId === vanilla)!
    assert(
        (impalaInst.isRested === false && vanillaInst.isRested === true) ||
            (impalaInst.isRested === true && vanillaInst.isRested === false),
        `暴風とインパラーの誘発の両方が解決している（インパラー=${impalaInst.isRested}・ロクケラトプス=${vanillaInst.isRested}）`,
    )
}

console.log("すべてのチェックに合格しました 🎉（part771）")
