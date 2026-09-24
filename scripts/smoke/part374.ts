// smoke パート374（シンボル・コストの変更：timedEffect の内容 symbolAdd／symbolSet／symbolLoss／cost）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { instBaseCost, instanceSymbolCount } from "../../shared/rules"

const VACUUM = "BS12-080" // バキュームシンボル：このターンの間、相手のスピリットすべては指定した色のシンボル1つを失う
const GROW = "BS08-082" // グロウアップ：このターンの間、自分のスピリット1体をコスト+3
const DOUBLE = "BS03-121" // ダブルハート：スピリット1体に同じ色のシンボルを1つ追加
const RED = "BS01-001" // ゴラドン（赤・シンボル1つ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VACUUM).name === "バキュームシンボル", "VACUUM")
    assert(getCard(GROW).name === "グロウアップ", "GROW")
    assert(getCard(DOUBLE).name === "ダブルハート", "DOUBLE")
}

function dataAction(cardId: string, contentType: string): EffectAction {
    let found: EffectAction | undefined
    const walk = (o: unknown): void => {
        if (found || !o || typeof o !== "object") return
        if (Array.isArray(o)) return o.forEach(walk)
        const r = o as Record<string, unknown>
        if (r.type === "timedEffect" && (r.content as { type: string }[]).some((c) => c.type === contentType)) found = r as unknown as EffectAction
        Object.values(r).forEach(walk)
    }
    walk(getCard(cardId).effects)
    assert(found !== undefined, `${cardId}：カードデータに ${contentType} がある`)
    return found!
}

function game(): GameState {
    return createGame("p374", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
}

console.log("=== 1. バキュームシンボル：相手のスピリットすべて（後から出たものも）が赤のシンボルを1つ失う ===")
{
    const s = game()
    const theirs = createInstance(RED, 1, 1)
    const mine = createInstance(RED, 1, 1)
    s.players.p2.field.spirits = [theirs]
    s.players.p1.field.spirits = [mine]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, dataAction(VACUUM, "symbolLoss"), undefined, undefined, "magic")
    assert(instanceSymbolCount(theirs) === 0, "いた相手のスピリットはシンボル0（非対話は相手に最も多い赤）")
    assert(instanceSymbolCount(mine) === 1, "自分のスピリットはそのまま")
    const later = createInstance(RED, 1, 1)
    s.players.p2.field.spirits.push(later)
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(later) === 0, "解決後に出た相手のスピリットも赤のシンボルを失う")
}

console.log("=== 2. グロウアップ：自分のスピリット1体をコスト+3 ===")
{
    const s = game()
    const mine = createInstance(RED, 1, 1)
    s.players.p1.field.spirits = [mine]
    refreshLevelAsOverrides(s)
    const before = instBaseCost(mine)
    resolveAction(s, "p1", null, dataAction(GROW, "cost"), mine.instanceId, undefined, "magic")
    assert(instBaseCost(mine) === before + 3, "コスト+3")
}

console.log("=== 3. ダブルハート：指定した1体に同じ色のシンボルを1つ追加 ===")
{
    const s = game()
    const theirs = createInstance(RED, 1, 1)
    s.players.p2.field.spirits = [theirs]
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, dataAction(DOUBLE, "symbolAdd"), theirs.instanceId, undefined, "magic")
    assert(instanceSymbolCount(theirs) === 2, "相手のスピリットにも追加できる（シンボル2つ）")
}

console.log("すべてのチェックに合格しました 🎉（part374）")
