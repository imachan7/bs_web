// smoke パート958（合体中のブレイヴだけの破壊：破壊待機で場に残り、誘発を解決してからトラッシュへ。
// 1つの効果で複数破壊されたら同時破壊で、「ブレイヴだけが破壊されたとき」は1回。戻るのは破壊されたブレイヴ全部。PENDING_STATE §3 C6〜C8。2026-11-16 ユーザー確認）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/brave"
import { viewFor } from "../../server/src/logic/GameState"

const CITRI = "BS21-057" // 冥獣騎シトリー（ブレイヴ・合体条件コスト3以上）
const PANDA = "BS21-063" // ぐるみパンダ（ブレイヴ・合体条件コスト4以上）
const NEKO = "BS19-093" // ネコロン山（Lv2：自分の合体スピリットのブレイヴだけが破壊されたとき、そのブレイヴを手札に戻せる）
const HOST = "BS01-089" // デュアルキャノン・ベル（効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const e = getCard(NEKO).effects.find((x) => x.kind === "fieldEvent" && x.event === "ownBraveOnlyDestroyed")
    assert(getCard(NEKO).name === "ネコロン山" && e?.kind === "fieldEvent" && e.optional === true && JSON.stringify(e.levels) === "[2]" && e.action.type === "return", "ネコロン山 Lv2 は、ブレイヴだけが破壊されたとき、そのブレイヴを手札に戻せる")
    assert(getCard(CITRI).name === "冥獣騎シトリー" && getCard(CITRI).type === "brave" && getCard(PANDA).name === "ぐるみパンダ" && getCard(PANDA).type === "brave", "シトリー・ぐるみパンダはブレイヴ")
    assert(getCard(HOST).name === "デュアルキャノン・ベル" && getCard(HOST).cost >= 4 && getCard(HOST).effects.length === 0, "ベルはコスト4以上・効果なし")
}

// アキラ（p1）の合体スピリットを braveIds の数だけ並べる。破壊する側はユウキ（p2）
function game(seed: string, braveIds: string[], neko: boolean, interactive: boolean): { s: GameState; hosts: CardInstance[]; braves: CardInstance[] } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.hand = []
    const hosts = braveIds.map(() => createInstance(HOST, 1, 3))
    s.players.p1.field.spirits.push(...hosts)
    const braves = braveIds.map((id, i) => {
        const b = createInstance(id, 1, 0)
        attachBrave(s, "p1", hosts[i]!, b)
        return b
    })
    if (neko) s.players.p1.field.nexuses.push(createInstance(NEKO, 1, 3))
    refreshLevelAsOverrides(s)
    return { s, hosts, braves }
}
const combined = (s: GameState, b: CardInstance) => s.players.p1.field.combinedBraves.includes(b)

console.log("=== 1. 誘発の確認が出ている間、ブレイヴは破壊待機で場に残り、スピリットへは何も与えない。発動すると手札に戻る ===")
{
    const { s, hosts, braves } = game("stay", [CITRI], true, true)
    resolveAction(s, "p2", null, { type: "destroyBrave" })
    const pc = s.pendingChoice
    assert(pc?.confirm === true && pc.pid === "p1", "ネコロン山を発動するかを、持ち主に聞く")
    assert(combined(s, braves[0]!) && braves[0]!.waiting?.kind === "destroy" && !s.players.p1.trashCards.includes(CITRI), "この時点で、ブレイヴは破壊待機で場にいる（まだトラッシュに無い）")
    assert(hosts[0]!.braveRefs === undefined && braves[0]!.braveCombined === undefined, "スピリットとの合体は切れている")
    viewFor(s, "p1")
    viewFor(s, "p2")
    act(s, "p1", { type: "resolveChoice", option: pc!.options![0]! })
    assert(s.pendingChoice === null && s.players.p1.hand.includes(CITRI) && !combined(s, braves[0]!) && braves[0]!.waiting === undefined && !s.players.p1.trashCards.includes(CITRI), "発動したら、ブレイヴは手札に戻る（トラッシュへは行かない）")
}

console.log("=== 2. 確認を断ったら、ブレイヴはトラッシュへ行く ===")
{
    const { s, braves } = game("decline", [CITRI], true, true)
    resolveAction(s, "p2", null, { type: "destroyBrave" })
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null && s.resumeStack.length === 0 && !combined(s, braves[0]!) && s.players.p1.trashCards.includes(CITRI) && s.players.p1.hand.length === 0, "ブレイヴはトラッシュへ行き、続きは残らない")
}

console.log("=== 3. 合体スピリットすべてのブレイヴを破壊：同時破壊。ネコロン山は1回だけ発揮し、発動したら破壊されたブレイヴが全部手札に戻る ===")
{
    const { s, braves } = game("simul", [CITRI, PANDA], true, true)
    resolveAction(s, "p2", null, { type: "destroyBrave", allHosts: true })
    const pc = s.pendingChoice
    assert(pc?.confirm === true && pc.pid === "p1", "どのブレイヴかは選ばせず、ネコロン山を発動するかだけを聞く")
    assert(braves.every((b) => combined(s, b) && b.waiting?.kind === "destroy") && braves[0]!.waiting?.event === braves[1]!.waiting?.event, "2つとも同じ出来事の破壊待機で場にいる")
    act(s, "p1", { type: "resolveChoice", option: pc!.options![0]! })
    assert(s.pendingChoice === null && s.resumeStack.length === 0, "確認は1回だけで、続きは残らない")
    assert(JSON.stringify([...s.players.p1.hand].sort()) === JSON.stringify([CITRI, PANDA].sort()), "破壊されたブレイヴは2つとも手札に戻る")
    assert(!s.players.p1.trashCards.includes(CITRI) && !s.players.p1.trashCards.includes(PANDA) && s.players.p1.field.combinedBraves.length === 0 && braves.every((b) => b.waiting === undefined), "トラッシュへは行かず、場にも残らない")
}

console.log("=== 3b. 同時破壊で確認を断ったら、全部トラッシュへ行く（確認は1回だけ） ===")
{
    const { s } = game("simul-decline", [CITRI, PANDA], true, true)
    resolveAction(s, "p2", null, { type: "destroyBrave", allHosts: true })
    assert(s.pendingChoice?.confirm === true, "ネコロン山を発動するかを聞く")
    act(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null && s.resumeStack.length === 0 && s.players.p1.hand.length === 0 && s.players.p1.trashCards.includes(CITRI) && s.players.p1.trashCards.includes(PANDA) && s.players.p1.field.combinedBraves.length === 0, "2回目の確認は出ず、2つともトラッシュへ行く")
}

console.log("=== 4. 選ばせない設定（AI・テスト）でも、破壊されたブレイヴが全部手札に戻る ===")
{
    const { s } = game("auto", [CITRI, PANDA], true, false)
    resolveAction(s, "p2", null, { type: "destroyBrave", allHosts: true })
    assert(s.pendingChoice === null && JSON.stringify([...s.players.p1.hand].sort()) === JSON.stringify([CITRI, PANDA].sort()) && s.players.p1.field.combinedBraves.length === 0, "2つとも手札に戻る")
}

console.log("=== 5. ネコロン山が無ければ、選択なしで全部トラッシュへ行く ===")
{
    const { s } = game("plain", [CITRI, PANDA], false, true)
    resolveAction(s, "p2", null, { type: "destroyBrave", allHosts: true })
    assert(s.pendingChoice === null && s.players.p1.trashCards.includes(CITRI) && s.players.p1.trashCards.includes(PANDA) && s.players.p1.field.combinedBraves.length === 0 && s.players.p1.hand.length === 0, "2つともトラッシュへ行く")
}

console.log("すべてのチェックに合格しました 🎉（part958）")
