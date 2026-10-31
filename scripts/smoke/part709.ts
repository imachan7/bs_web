// smoke パート709（付与とコア系の絞り込みを filter 1本に寄せた後の挙動：docs/design/FILTER_UNIFY.md 2-1・2-6・付録）
//   braveImmuneGrant（BS12-028・BS12-067）／constraintGrant（BS16-061・BS13-064・BS05-066・BS05-056）／coreFloorByCost（BS12-065）
import { assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { refreshLevelAsOverrides } from "../../server/src/logic/EffectModules"
import { coreFloorFor } from "../../server/src/logic/removal"
import { activeConstraints, hasBraveImmuneAgainst } from "../../shared/rules"

const CARDS = loadAllCards()

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string][] = [
        ["BS12-028", "セイルフィッシュ"], ["BS12-067", "月光集める塔"], ["BS12-065", "大樹茂る天守閣"],
        ["BS16-061", "暗雲射す鬼ヶ島"], ["BS13-064", "蛇教徒の宮殿"], ["BS05-066", "天焦がす大聖火"],
        ["BS05-051", "巨人騎士アルダス"], ["BS05-056", "最古龍の顎"], ["BS01-001", "ゴラドン"], ["BS01-002", "ロクケラトプス"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id}は${name}`)
    assert(getCard("BS12-025").colors.includes("white") && getCard("BS01-002").colors.includes("red"), "白と赤の前提")
    assert(getCard("BS12-031").effects.some((e) => e.kind === "keyword" && e.keyword === "armor"), "BS12-031は【装甲】持ち")
    assert(getCard("BS04-010").symbol.length === 2 && getCard("BS01-001").symbol.length === 1, "シンボル2つ/1つ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}
const has = (s: GameState, inst: ReturnType<typeof createInstance>, type: string): boolean =>
    activeConstraints(s, "p1", inst).some((c) => c.type === type)

console.log("=== braveImmuneGrant filter.color：BS12-028 セイルフィッシュ Lv2 は自分の白だけ ===")
{
    const s = game("brave-color")
    s.turnPlayer = "p2"
    s.phase = "main"
    putSpirit(s, "p1", "BS12-028", 2)
    const white = putSpirit(s, "p1", "BS12-025", 1)
    const red = putSpirit(s, "p1", "BS01-002", 1)
    refreshLevelAsOverrides(s)
    assert(white.braveImmuneAll === true, "白のスピリットに立つ")
    assert(red.braveImmuneAll !== true, "赤のスピリットには立たない")
}

console.log("=== braveImmuneGrant filter.keyword：BS12-067 月光集める塔 Lv2 は【装甲】持ちだけ ===")
{
    const s = game("brave-keyword")
    putNexus(s, "p1", "BS12-067", 2)
    const armored = putSpirit(s, "p1", "BS12-031", 1)
    const plain = putSpirit(s, "p1", "BS01-002", 1)
    refreshLevelAsOverrides(s)
    assert(armored.braveImmuneMatchArmorColors === true, "装甲持ちに立つ")
    assert(plain.braveImmuneMatchArmorColors !== true, "装甲を持たないスピリットには立たない")
    assert(!hasBraveImmuneAgainst(plain, ["green"]), "装甲なしは防がない")
}

console.log("=== constraintGrant filter.family：BS16-061 暗雲射す鬼ヶ島 Lv2 は系統「戦竜」だけ ===")
{
    const fam = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("戦竜") && (c.levels?.[0]?.cores ?? 99) <= 3)!
    const other = CARDS.find((c) => c.type === "spirit" && !(c.family ?? []).includes("戦竜") && c.cardId === "BS01-002")!
    assert((fam.family ?? []).includes("戦竜") && !(other.family ?? []).includes("戦竜"), "系統の前提")
    const s = game("grant-family")
    putNexus(s, "p1", "BS16-061", 2)
    const a = putSpirit(s, "p1", fam.cardId, 1)
    const b = putSpirit(s, "p1", other.cardId, 1)
    assert(has(s, a, "canDirectAttack"), "戦竜には指定アタックが付く")
    assert(!has(s, b, "canDirectAttack"), "戦竜でないスピリットには付かない")
}

console.log("=== constraintGrant filter.minLevel+family：BS13-064 蛇教徒の宮殿 は Lv2 以上の妖蛇だけ ===")
{
    const snake = CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("妖蛇") && (c.levels ?? []).length >= 2 && (c.levels?.[1]?.cores ?? 99) <= 4)!
    assert((snake.family ?? []).includes("妖蛇"), "妖蛇の前提")
    const s = game("grant-minlevel")
    putNexus(s, "p1", "BS13-064", 1)
    const lv1 = putSpirit(s, "p1", snake.cardId, snake.levels![0]!.cores)
    const lv2 = putSpirit(s, "p1", snake.cardId, snake.levels![1]!.cores)
    assert(has(s, lv2, "lifeDamageToVoid"), "Lv2の妖蛇には付く")
    assert(!has(s, lv1, "lifeDamageToVoid"), "Lv1の妖蛇には付かない")
}

console.log("=== constraintGrant filter.nameContains：BS05-066 天焦がす大聖火 は「巨人」を含むスピリットだけ ===")
{
    const s = game("grant-name")
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-066", 3)
    const giant = putSpirit(s, "p1", "BS05-051", 1)
    const other = putSpirit(s, "p1", "BS01-001", 1)
    assert(has(s, giant, "canDirectAttack"), "名前に巨人を含むスピリットに付く")
    assert(!has(s, other, "canDirectAttack"), "含まないスピリットには付かない")
}

console.log("=== constraintGrant filter.minSymbols：BS05-056 最古龍の顎 は シンボル2つ以上だけ ===")
{
    const s = game("grant-symbols")
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-056", 2)
    const two = putSpirit(s, "p1", "BS04-010", 1)
    const one = putSpirit(s, "p1", "BS01-001", 1)
    assert(has(s, two, "canDirectAttack"), "シンボル2つに付く")
    assert(!has(s, one, "canDirectAttack"), "シンボル1つには付かない")
}

console.log("=== constraintGrant の keywordFilter は【激突】の1件だけ残っている（BS07-X25） ===")
{
    const e = getCard("BS07-X25").effects.find((x) => x.id === "BS07-X25-e3") as unknown as Record<string, unknown>
    assert(e["keywordFilter"] === "clash" && e["filter"] === undefined, "BS07-X25-e3 は keywordFilter:clash のまま")
}

console.log("=== coreFloorByCost filter.color：BS12-065 大樹茂る天守閣 は自分の緑だけ守る ===")
{
    const green = CARDS.find((c) => c.type === "spirit" && c.colors.includes("green") && !c.colors.includes("red") && (c.levels?.[0]?.cores ?? 99) === 1 && c.cost >= 2)!
    const s = game("floor-color")
    s.turnPlayer = "p2" // turn:"opponent"＝相手のターンの間
    putNexus(s, "p1", "BS12-065", 2)
    const g = putSpirit(s, "p1", green.cardId, 3)
    const r = putSpirit(s, "p1", "BS01-002", 3)
    assert(coreFloorFor(s, g, "p1", "p2") >= 1, "緑のスピリットは床が張られる")
    assert(coreFloorFor(s, r, "p1", "p2") === 0, "赤のスピリットには張られない")
}

console.log("すべてのチェックに合格しました 🎉（part709）")
