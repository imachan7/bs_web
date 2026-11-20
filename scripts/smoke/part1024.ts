// smoke パート1024（#631 GX14 ダーティフォビッド・GX08 ギャラクシーステップ：playerRule skipSteps・追加のコア〜アタックの各ステップ）
import { assert, createGame, createInstance, getCard, handleAction, resolveAction, runTurnStart, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { EffectAction } from "../../server/src/types/effectAction"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1）
const HYAKUSHIKI = "BS01-099" // 百識の谷（ネクサス。自分のドローステップに+1ドロー）
const SHAKUNETSU = "BS06-073" // 灼熱の谷（ネクサス。自分のドローステップに手札1枚を破棄）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(VAN).name === "ロクケラトプス", "VANはロクケラトプス")
assert(getCard(HYAKUSHIKI).name === "百識の谷" && getCard(HYAKUSHIKI).type === "nexus", "HYAKUSHIKIは百識の谷")
assert(getCard(SHAKUNETSU).name === "灼熱の谷" && getCard(SHAKUNETSU).type === "nexus", "SHAKUNETSUは灼熱の谷")
assert(getCard("GX14").name === "ダーティフォビッド" && getCard("GX08").name === "ギャラクシーステップ", "GX14・GX08の名前")

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VAN)
    s.players.p2.deck = Array.from({ length: 40 }, () => VAN)
    return s
}
function nexus(s: GameState, pid: PlayerId, cardId: string): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, 2))
    refreshLevelAsOverrides(s)
}
const count = (s: GameState, text: string): number => s.log.filter((l) => l.includes(text)).length
const main = (id: string): EffectAction => (getCard(id).effects.find((e) => e.id === `${id}-e1`) as unknown as { action: EffectAction }).action

console.log("=== 1. GX14：相手の次のターンはコアステップとドローステップを行えない ===")
{
    const s = game("gx14a")
    nexus(s, "p2", HYAKUSHIKI)
    s.turnPlayer = "p1"
    s.phase = "main"
    resolveAction(s, "p1", null, main("GX14"))
    const deck = s.players.p2.deck.length
    const hand = s.players.p2.hand.length
    handleAction(s, "p1", { type: "endTurn" })
    assert((s.turnPlayer as string) === "p2", "相手のターンになった")
    assert(s.players.p2.reserve === 10, "コアが増えない")
    assert(s.players.p2.deck.length === deck && s.players.p2.hand.length === hand, "ドローしない")
    assert(count(s, "コアステップを行えない") === 1 && count(s, "ドローステップを行えない") === 1, "行えない旨のログ")
    assert(s.players.p2.hand.length === hand, "ドローステップの誘発（百識の谷の追加ドロー）も発揮されない")
    assert((s.phase as string) === "main", "リフレッシュを経てメインステップへ進む")
    assert(!s.timedEffects.some((r) => r.content.some((c) => c.type === "playerRule" && c.rule.type === "skipSteps")), "リフレッシュステップで使い切って消える")
    handleAction(s, "p2", { type: "endTurn" })
    handleAction(s, "p1", { type: "endTurn" })
    assert((s.turnPlayer as string) === "p2" && s.players.p2.reserve > 10 - 1, "その次の相手のターンはコアが増える")
}

console.log("=== 2. GX14：対照（置かなければ通常どおり、誘発も出る） ===")
{
    const s = game("gx14b")
    nexus(s, "p2", HYAKUSHIKI)
    s.turnPlayer = "p1"
    s.phase = "main"
    const deck = s.players.p2.deck.length
    handleAction(s, "p1", { type: "endTurn" })
    assert(s.players.p2.reserve === 11, "コアが1個増える")
    assert(s.players.p2.deck.length === deck - 2, "ドロー1枚＋百識の谷の追加ドロー1枚")
}

console.log("=== 3. GX08：アタックステップ後にコア→ドロー→リフレッシュ→メイン→アタックを1回ずつ ===")
{
    const s = game("gx08a")
    nexus(s, "p1", HYAKUSHIKI)
    s.turnPlayer = "p1"
    s.phase = "main"
    resolveAction(s, "p1", null, main("GX08"))
    assert(s.extraTurnStepsPending === true, "予約が立つ")
    const deck = s.players.p1.deck.length
    handleAction(s, "p1", { type: "nextPhase" })
    assert((s.phase as string) === "attack", "1回目のアタックステップ")
    handleAction(s, "p1", { type: "endTurn" })
    assert((s.turnPlayer as string) === "p1" && (s.phase as string) === "main", "追加のメインステップで止まる（相手に移らない）")
    assert(s.extraMainStep !== true, "追加のメインは通常のメイン")
    assert(s.players.p1.reserve === 11, "追加のコアステップでコア1個")
    assert(s.players.p1.deck.length === deck - 2, "追加のドローステップ（百識の谷の誘発も出る）")
    handleAction(s, "p1", { type: "nextPhase" })
    assert((s.phase as string) === "attack" && (s.turnPlayer as string) === "p1", "追加のアタックステップ")
    handleAction(s, "p1", { type: "endTurn" })
    assert((s.turnPlayer as string) === "p2", "そのあとエンドステップを経て相手のターン")
    assert(count(s, "コア・ドロー・リフレッシュ・メイン・アタックの各ステップを、もう1回ずつ") === 1, "追加は1回だけ")
}

console.log("=== 4. GX08：追加のドローステップで選択待ちが出ても、続きが失われない ===")
{
    const s = game("gx08b", true)
    nexus(s, "p1", SHAKUNETSU)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.hand = [VAN, VAN, VAN]
    resolveAction(s, "p1", null, main("GX08"))
    handleAction(s, "p1", { type: "nextPhase" })
    handleAction(s, "p1", { type: "endTurn" })
    assert(!!s.pendingChoice && (s.phase as string) === "draw", "追加のドローステップで破棄の選択待ち")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(!s.pendingChoice && (s.phase as string) === "main" && (s.turnPlayer as string) === "p1", "選択のあとリフレッシュを経て追加のメインへ")
    handleAction(s, "p1", { type: "nextPhase" })
    assert((s.phase as string) === "attack", "追加のアタックステップへ進める")
    handleAction(s, "p1", { type: "endTurn" })
    assert(!s.pendingChoice && (s.turnPlayer as string) === "p2", "終わったら相手のターン")
}

console.log("=== 5. GX08：相手のターンでは不発・先攻1ターン目は予約が残らない ===")
{
    const s = game("gx08c")
    s.turnPlayer = "p2"
    s.phase = "main"
    resolveAction(s, "p1", null, main("GX08"))
    assert(s.extraTurnStepsPending !== true, "自分のターンでなければ予約されない")
    const t = game("gx08d")
    t.turn = 1
    t.turnPlayer = "p1"
    t.phase = "main"
    resolveAction(t, "p1", null, main("GX08"))
    handleAction(t, "p1", { type: "endTurn" })
    assert((t.turnPlayer as string) === "p2" && t.extraTurnStepsPending !== true, "アタックステップが無いので追加は行われず、予約も消える")
}

console.log("すべてのチェックに合格しました 🎉（part1024）")
