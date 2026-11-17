// smoke パート996（EX009 の器：reviveOnDestroy.cost.alsoFromTegamoto＝手札か手元のマジックを破棄）
import { assert, createGame, createInstance, destroySpirit, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const NEXUS = "BS06-076" // 暴かれた墓石（Lv2：系統「無魔」の破壊の代わりに手札1枚破棄で残る）
const VICTIM = "BS06-013" // ピジョンヘディレス（系統：無魔）
const MAGIC_A = "BS01-114" // バスタースピア（マジック）
const MAGIC_B = "BS06-095" // マジック
const HAND_CARD = "BS01-001" // ゴラドン

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(NEXUS).name === "暴かれた墓石", "NEXUSは暴かれた墓石")
    assert(getCard(MAGIC_A).type === "magic" && getCard(MAGIC_B).type === "magic" && getCard(MAGIC_A).name !== getCard(MAGIC_B).name, "MAGIC_A・Bは別名のマジック")
    assert(getCard(HAND_CARD).type === "spirit", "HAND_CARDはスピリット")
    const e = getCard(NEXUS).effects.find((x) => x.kind === "reviveOnDestroy")
    assert(e !== undefined && e.kind === "reviveOnDestroy" && e.cost?.handDiscardOne === true, "reviveOnDestroy の cost は handDiscardOne")
    // EX009 のデータの形をこのカードに一時的に当てる（テスト終了で戻す）
    if (e && e.kind === "reviveOnDestroy" && e.cost) e.cost.alsoFromTegamoto = true
}

function setup(seed: string, hand: string[], tegamoto: string[], interactive: boolean) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    const nexus = createInstance(NEXUS, s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(nexus)
    const victim = createInstance(VICTIM, s.turn, 1)
    s.players.p1.field.spirits.push(victim)
    s.players.p1.hand = [...hand]
    s.players.p1.tegamoto = [...tegamoto]
    return { s, victim }
}
const alive = (s: GameState, id: string): boolean => s.players.p1.field.spirits.some((x) => x.instanceId === id)

// 選択待ちを順に答える。復活の確認には「復活させる」、option は choose、手札は先頭の候補
function answerAll(s: GameState, choose: (options: string[]) => string): string[] {
    const seen: string[] = []
    for (let i = 0; i < 8 && s.pendingChoice; i++) {
        const p = s.pendingChoice
        seen.push(`${p.kind}:${(p.options ?? []).join("|")}`)
        const err =
            p.reviveConfirm !== undefined
                ? handleAction(s, p.pid, { type: "resolveChoice", option: "復活させる" })
                : p.kind === "card"
                  ? handleAction(s, p.pid, { type: "resolveChoice", cardIndex: p.cardIndices![0]! })
                  : handleAction(s, p.pid, { type: "resolveChoice", option: choose(p.options ?? []) })
        if (err) {
            seen.push("ERR:" + err)
            break
        }
    }
    return seen
}

console.log("=== 1. 手札だけ（非対話）：手札を破棄して残る ===")
{
    const { s, victim } = setup("hand-only", [HAND_CARD], [], false)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    assert(alive(s, victim.instanceId) && s.players.p1.hand.length === 0, "手札1枚を破棄して残る")
}

console.log("=== 2. 手元のマジックだけ（非対話）：手元の末尾を破棄して残る。手札は減らない ===")
{
    const { s, victim } = setup("tegamoto-only", [], [HAND_CARD, MAGIC_A], false)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    assert(alive(s, victim.instanceId), "手元のマジックを破棄して残る")
    assert(!s.players.p1.tegamoto.includes(MAGIC_A) && s.players.p1.tegamoto.includes(HAND_CARD), "手元のマジックだけがトラッシュへ（手元のスピリットは残る）")
    assert(s.players.p1.trashCards.includes(MAGIC_A), "トラッシュに入った")
}

console.log("=== 3. どちらも無い：不発で破壊される ===")
{
    const { s, victim } = setup("none", [], [HAND_CARD], false)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    assert(!alive(s, victim.instanceId), "手元にマジックが無い（スピリットのみ）なら破棄できず破壊される")
}

console.log("=== 4. 手札と手元の両方（非対話）：手札の末尾を優先 ===")
{
    const { s, victim } = setup("both-auto", [HAND_CARD], [MAGIC_A], false)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    assert(alive(s, victim.instanceId) && s.players.p1.hand.length === 0 && s.players.p1.tegamoto.includes(MAGIC_A), "手札が破棄され、手元は残る")
}

console.log("=== 5. 手元だけで同名なし1種（対話）：選ばせずそのまま破棄 ===")
{
    const { s, victim } = setup("tegamoto-single-i", [], [MAGIC_A, MAGIC_A], true)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    const seen = answerAll(s, (o) => o[0]!)
    assert(alive(s, victim.instanceId) && s.players.p1.tegamoto.length === 1, `同名2枚でも1枚だけ破棄して残る（${seen.join(" / ")}）`)
}

console.log("=== 6. 両方あり（対話）：option で選ばせ、各経路へ ===")
for (const route of ["hand", "tegamoto"] as const) {
    const { s, victim } = setup("both-" + route, [HAND_CARD, HAND_CARD], [MAGIC_A, MAGIC_B], true)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    const seen = answerAll(s, (o) => (route === "hand" ? o.find((x) => x.includes("手札から"))! : o.find((x) => x.includes(getCard(MAGIC_B).name))!))
    assert(alive(s, victim.instanceId), `${route}：残る（${seen.join(" / ")}）`)
    if (route === "hand") assert(s.players.p1.hand.length === 1 && s.players.p1.tegamoto.length === 2, "手札から1枚だけ破棄")
    else assert(s.players.p1.hand.length === 2 && s.players.p1.tegamoto.length === 1 && !s.players.p1.tegamoto.includes(MAGIC_B), "手元のマジックBだけ破棄")
}

console.log("すべてのチェックに合格しました 🎉（part996）")
