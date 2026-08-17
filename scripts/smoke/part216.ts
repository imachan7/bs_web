// smoke パート216（効果の「重複」で処理が順次行われない不具合。2026-08-17）
//
// part214（灼熱の谷＝ステップ誘発）と**同じ原因**が他の誘発にも残っていた。
// 「発火するものをループしながら直接解決し、選択待ちが立ったら `return` するだけ」だと、
// **同じイベントの残りの誘発が永久に失われる**。
//
//   ① fireFieldEventTriggers（「〜されたとき」系。使用箇所が最多）
//   ② fireBattleWonTriggers（バトル勝利時）
//
// あわせて、**1枚のカードの中で OR を2エントリに分けたために二重発火する**例も直した。
//   ③ SD01-027 溶岩の大瀑布Lv2「【覚醒】/【激突】を持つ自分のスピリットが…1枚ドローする」
//      → 両方を持つ X004 龍星神ジーク・メテオヴルムだと2枚引いてしまっていた
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireBattleWonTriggers, fireFieldEventTriggers } from "../../server/src/logic/triggers"
import { resolveAction } from "../../server/src/logic/EffectModules"

const TUNING_TOWER = "BS08-061" // 共鳴する音叉の塔
const LAVA_FALLS = "SD01-027" // 溶岩の大瀑布
const ZIEK = "X004" // 龍星神ジーク・メテオヴルム（【覚醒】と【激突】を両方持つ唯一のスピリット）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(TUNING_TOWER).name === "共鳴する音叉の塔" && getCard(TUNING_TOWER).type === "nexus", "BS08-061 は共鳴する音叉の塔（ネクサス）")
    const fe = getCard(TUNING_TOWER).effects.filter((e) => e.kind === "fieldEvent")
    assert(fe.length === 1 && fe[0]?.kind === "fieldEvent" && fe[0].optional === true, "『相手がドローしたとき…できる』の任意の fieldEvent を1つ持つ")

    assert(getCard(LAVA_FALLS).name === "溶岩の大瀑布" && getCard(LAVA_FALLS).type === "nexus", "SD01-027 は溶岩の大瀑布（ネクサス）")
    assert(getCard(ZIEK).name === "龍星神ジーク・メテオヴルム", "X004 は龍星神ジーク・メテオヴルム")
    const kws = getCard(ZIEK).effects.filter((e) => e.kind === "keyword").map((e) => (e.kind === "keyword" ? e.keyword : ""))
    assert(kws.includes("awaken") && kws.includes("clash"), "ジークは【覚醒】と【激突】を両方持つ")
}

// ① fieldEvent：共鳴する音叉の塔を n 枚置き、相手のターンのメインステップで相手にドローさせる
function setupTower(n: number, interactive: boolean): GameState {
    const s = createGame(`tower-${n}-${interactive}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.turnPlayer = "p2" // 『相手のターン』
    s.phase = "main" // excludePhase:"draw" を避ける
    for (let i = 0; i < n; i++) s.players.p1.field.nexuses.push(createInstance(TUNING_TOWER, s.turn, 3)) // Lv2
    return s
}

console.log("=== ① 音叉の塔1枚：相手のドローに1回反応する ===")
{
    const s = setupTower(1, true)
    const before = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "opponentDrew", undefined, undefined, undefined, 1)
    assert(s.pendingChoice !== null, "発動するか聞かれる（「〜できる」）")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動する")
    assert(s.players.p1.deck.length === before - 1, "1枚引いた")
    assert(s.pendingChoice === null, "1枚ぶんで終わる")
}

console.log("=== ① 音叉の塔2枚：2回聞かれて2枚引ける（ここが直った点） ===")
{
    const s = setupTower(2, true)
    const before = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "opponentDrew", undefined, undefined, undefined, 1)
    assert(s.pendingChoice !== null, "1枚目のぶんを聞かれる")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "1枚目は発動する")
    // 直す前はここで終わっていた（2枚目のネクサスの誘発が失われていた）
    assert(s.pendingChoice !== null, "2枚目のぶんも聞かれる")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "2枚目も発動する")
    assert(s.pendingChoice === null, "2回で終わる")
    assert(s.players.p1.deck.length === before - 2, "合計2枚引けた")
}

console.log("=== ① 2枚のうち1枚目を「発動しない」と答えても、2枚目は聞かれる ===")
{
    const s = setupTower(2, true)
    const before = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "opponentDrew", undefined, undefined, undefined, 1)
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "1枚目は発動しない（選択なしで応答）")
    assert(s.pendingChoice !== null, "2枚目のぶんは聞かれる")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "2枚目は発動する")
    assert(s.players.p1.deck.length === before - 1, "引けたのは2枚目のぶんだけ＝1枚")
}

console.log("=== ③ 溶岩の大瀑布Lv2：【覚醒】と【激突】の両方を持っていても1枚だけ引く ===")
{
    const s = createGame("lava-falls", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.turnPlayer = "p1" // turn:"own"
    s.phase = "attack"
    s.players.p1.field.nexuses.push(createInstance(LAVA_FALLS, s.turn, 3)) // Lv2
    const ziek = createInstance(ZIEK, s.turn, 6)
    s.players.p1.field.spirits.push(ziek)
    const before = s.players.p1.deck.length
    fireBattleWonTriggers(s, "p1", ziek, "attacker")
    // 直す前は awaken 用と clash 用の2エントリが**両方**発火して2枚引いていた
    assert(s.players.p1.deck.length === before - 1, "引いたのは1枚だけ（効果文は「1枚ドローする」）")
}

console.log("=== ③ 溶岩の大瀑布2枚なら、ネクサスの枚数ぶん（2枚）引く ===")
{
    const s = createGame("lava-falls-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.turnPlayer = "p1"
    s.phase = "attack"
    for (let i = 0; i < 2; i++) s.players.p1.field.nexuses.push(createInstance(LAVA_FALLS, s.turn, 3))
    const ziek = createInstance(ZIEK, s.turn, 6)
    s.players.p1.field.spirits.push(ziek)
    const before = s.players.p1.deck.length
    fireBattleWonTriggers(s, "p1", ziek, "attacker")
    assert(s.players.p1.deck.length === before - 2, "ネクサス2枚ぶんで2枚（1枚につき1枚）")
}

console.log("=== ④ chooseActionMode：モード内の残りアクションが選択待ちで消えないこと ===")
// SD01-033 ヴィクトリーファイア「BP3000以下の相手のスピリット1体と相手のネクサス1つを破壊する」。
// 1つ目（スピリット破壊）で対象選択が立つと、2つ目（ネクサス破壊）が失われていた。
{
    const VICTORY = "SD01-033"
    assert(getCard(VICTORY).name === "ヴィクトリーファイア" && getCard(VICTORY).type === "magic", "SD01-033 はヴィクトリーファイア（マジック）")
    const s = createGame("victory-fire", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turnPlayer = "p1"
    s.phase = "main"
    // 相手にBP3000以下のスピリット2体（選択が立つように2体以上）とネクサス2つ（同じく2つ以上）
    s.players.p2.field.spirits.push(createInstance("BS01-001", s.turn, 1), createInstance("BS01-002", s.turn, 1))
    s.players.p2.field.nexuses.push(createInstance("BS01-101", s.turn, 1), createInstance("BS01-108", s.turn, 1))
    const eff = getCard(VICTORY).effects[0]
    assert(eff !== undefined && eff.kind === "magic", "マジック効果を1つ持つ")
    if (eff !== undefined && eff.kind === "magic") {
        resolveAction(s, "p1", null, eff.action)
        assert(s.pendingChoice?.kind === "option", "まずモードを聞かれる")
        assert(act(s, "p1", { type: "resolveChoice", option: "スピリット1体とネクサス1つ" }) === null, "「スピリット1体とネクサス1つ」を選ぶ")
        assert(s.pendingChoice !== null, "破壊するスピリットを聞かれる")
        const spiritTarget = s.pendingChoice?.candidates[0]
        assert(spiritTarget !== undefined, "候補が出ている")
        if (spiritTarget !== undefined) {
            assert(act(s, "p1", { type: "resolveChoice", instanceId: spiritTarget }) === null, "スピリット1体を選ぶ")
        }
        // 直す前はここでモードの後半が消えていた（ネクサスが壊れずに終わっていた）。
        // ※ destroyNexus は現状**対象選択を出さず自動で1つ選ぶ**実装なので、ここで pendingChoice は立たない
        assert(s.players.p2.field.spirits.length === 1, "スピリットは1体破壊された")
        assert(s.players.p2.field.nexuses.length === 1, "ネクサスも1つ破壊された（モードの後半が失われない）")
        assert(s.pendingChoice === null, "これで解決しきる")
    }
}
