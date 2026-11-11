// smoke パート890（バーストの「その後コストを支払うことで、このカードのフラッシュ効果を発揮する」は、スピリットのコアからも払える。2026-11-11 の報告）
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/fieldEventTriggers"

const TENSHO = "BS14-094" // 天翔龍神覇（マジック・バースト後フラッシュ：BP6000以下1体破壊）
const TARGET = "BS06-037"
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(TENSHO).name === "天翔龍神覇" && getCard(TENSHO).effects.some((e) => e.kind === "burst" && e.thenPay === "flash"), "TENSHOは天翔龍神覇（フラッシュの thenPay）")
    assert(getCard(TARGET).type === "spirit" && getCard(TARGET).levels[0]!.bp <= 6000, "TARGETはBP6000以下のスピリット")
    assert(getCard(VAN).name === "ロクケラトプス", "VANはロクケラトプス")
}

function run(seed: string, reserve: number, cores: number): { s: GameState; target: string; van: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.reserve = reserve
    s.players.p1.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.spirits = []
    s.players.p2.field.nexuses = []
    s.players.p1.burst = TENSHO
    s.players.p1.burstSet = true
    const van = createInstance(VAN, s.turn, cores)
    s.players.p1.field.spirits.push(van)
    const t = createInstance(TARGET, s.turn, 1)
    s.players.p2.field.spirits.push(t)
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved", undefined, undefined, undefined, undefined, { costs: [getCard(TARGET).cost] })
    for (let guard = 0; s.pendingChoice && guard < 10; guard++) {
        const pc = s.pendingChoice
        if (pc.options?.length) act(s, pc.pid, { type: "resolveChoice", option: pc.options[0]! })
        else if ((pc.candidates ?? []).length) act(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! })
        else act(s, pc.pid, { type: "resolveChoice" })
    }
    return { s, target: t.instanceId, van }
}

console.log("=== 1. リザーブが0でも、スピリットのコアで払ってフラッシュ効果を発揮する ===")
{
    const cost = getCard(TENSHO).cost
    const { s, target, van } = run("p890-field", 0, cost + 2)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === target), "フラッシュ効果で相手のスピリットが破壊される")
    assert(van.cores < cost + 2, "スピリットのコアからコストを払った")
    assert(s.players.p1.trashCards.includes(TENSHO) && s.players.p1.burst === null, "発揮し終えてトラッシュへ")
}

console.log("=== 2. どこにもコアが足りなければ発揮しない ===")
{
    const { s, target } = run("p890-short", 0, 1)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === target), "払えないのでフラッシュ効果は発揮されない")
    assert(s.players.p1.trashCards.includes(TENSHO), "バーストはトラッシュへ")
}

console.log("すべてのチェックに合格しました 🎉（part890）")
