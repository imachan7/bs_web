// smoke パート287（BS12 バッチ0の器：【重装甲】／【転召：系統/ボイド】／シンボル数フィルタ）
import { assert, createGame, createInstance, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS, getCard } from "../../server/src/logic/GameState"
import { boardResistanceAgainst, matchesTarget } from "../../shared/rules"
import { tenshoCandidates, tenshoSpecOf } from "../../server/src/logic/EffectModules"

const FORSETI = "BS12-030" // 機人フォルセティ（【重装甲：紫/緑】）
const LUNATEC = "BS12-X04" // 月光神龍ルナテック・ストライクヴルム（【重装甲：可変】＝白）
const MARS = "BS12-007" // 炎星神龍マルス・ドラグーン（【転召：星魂/ボイド】＋シンボル数フィルタ）
// 【装甲：紫】を持つ既存カード（重装甲との差＝ブレイヴの効果を防ぐかどうか、の対照に使う）
const armorPurple = ALL_CARDS.find(
    (c) =>
        c.type === "spirit" &&
        c.effects.some((e) => e.kind === "keyword" && e.keyword === "armor" && (e.colors ?? []).includes("purple")),
)
assert(armorPurple !== undefined, "テスト前提: 【装甲：紫】を持つスピリットが存在する")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== §A 【重装甲】はブレイヴの効果も防ぐ（【装甲】は防がない） ===")
{
    const s = game("heavy-armor")
    const heavy = createInstance(FORSETI, s.turn, 2)
    const light = createInstance(armorPurple!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(heavy, light)
    refreshLevelAsOverrides(s)
    const attempt = { actorPid: "p2" as const, sourceColors: ["purple" as const], op: "destroy" as const, scope: "targeted" as const }
    assert(
        boardResistanceAgainst(s, "p1", heavy, { ...attempt, sourceType: "spirit" })?.category === "armor",
        "【重装甲：紫】は相手の紫のスピリットの効果を防ぐ",
    )
    assert(
        boardResistanceAgainst(s, "p1", heavy, { ...attempt, sourceType: "brave" })?.category === "armor",
        "【重装甲：紫】は相手の紫の**ブレイヴ**の効果も防ぐ",
    )
    assert(
        boardResistanceAgainst(s, "p1", light, { ...attempt, sourceType: "spirit" })?.category === "armor",
        "【装甲：紫】は相手の紫のスピリットの効果を防ぐ",
    )
    assert(
        boardResistanceAgainst(s, "p1", light, { ...attempt, sourceType: "brave" }) === null,
        "【装甲：紫】は相手のブレイヴの効果は防がない（重装甲との唯一の差）",
    )
    assert(
        boardResistanceAgainst(s, "p1", heavy, { ...attempt, sourceColors: ["red"], sourceType: "brave" }) === null,
        "指定色以外の効果は素通りする",
    )
}

console.log("=== §B 【重装甲：可変】は自分自身の色（付与色も含む）で防ぐ ===")
{
    const s = game("heavy-armor-var")
    const luna = createInstance(LUNATEC, s.turn, 1)
    s.players.p1.field.spirits.push(luna)
    refreshLevelAsOverrides(s)
    const attempt = { actorPid: "p2" as const, op: "destroy" as const, scope: "targeted" as const, sourceType: "magic" as const }
    assert(getCard(LUNATEC).colors.includes("white"), "テスト前提: ルナテックは白")
    assert(
        boardResistanceAgainst(s, "p1", luna, { ...attempt, sourceColors: ["white"] })?.category === "armor",
        "自分の色（白）の相手の効果を受けない",
    )
    assert(
        boardResistanceAgainst(s, "p1", luna, { ...attempt, sourceColors: ["purple"] }) === null,
        "自分が持たない色（紫）の効果は受ける",
    )
    // 色が増えたら防ぐ色も増える（毎回算出。2026-09-03 ユーザー確認）。tempColors は
    // refreshLevelAsOverrides に消されない枠なので、そこへ足して再計算させる
    luna.tempColors.push("purple")
    refreshLevelAsOverrides(s)
    assert(
        boardResistanceAgainst(s, "p1", luna, { ...attempt, sourceColors: ["purple"] })?.category === "armor",
        "付与色（紫）も防ぐ色に入る",
    )
}

console.log("=== §C 【転召：星魂/ボイド】は系統で対象を絞る（コストは問わない） ===")
{
    const s = game("tensho-family")
    const spec = tenshoSpecOf(getCard(MARS), 1)
    assert(spec !== null && spec.dest === "void", "【転召：星魂/ボイド】のコアの行き先はボイド")
    assert(spec!.familyFilter !== undefined, "系統指定を持つ")
    const seikon = ALL_CARDS.find((c) => c.type === "spirit" && (c.family ?? []).includes("星魂") && c.cardId !== MARS)
    const other = ALL_CARDS.find((c) => c.type === "spirit" && !(c.family ?? []).includes("星魂"))
    assert(seikon !== undefined && other !== undefined, "テスト前提: 系統「星魂」を持つ／持たないスピリットが存在する")
    const target = createInstance(seikon!.cardId, s.turn, 1)
    const decoy = createInstance(other!.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(target, decoy)
    refreshLevelAsOverrides(s)
    const cands = tenshoCandidates(s, "p1", spec!.minCost, undefined, spec!.familyFilter)
    assert(cands.length === 1 && cands[0]!.instanceId === target.instanceId, "系統「星魂」を持つスピリットだけが候補になる")
}

console.log("=== §D TargetFilter.symbolCount はシンボル数の完全一致で絞る ===")
{
    const s = game("symbol-count")
    const oneSymbol = ALL_CARDS.find((c) => c.type === "spirit" && c.symbol.length === 1)
    const twoSymbols = ALL_CARDS.find((c) => c.type === "spirit" && c.symbol.length === 2)
    assert(oneSymbol !== undefined && twoSymbols !== undefined, "テスト前提: シンボル1つ／2つのスピリットが存在する")
    const a = createInstance(oneSymbol!.cardId, s.turn, 1)
    const b = createInstance(twoSymbols!.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(a, b)
    refreshLevelAsOverrides(s)
    assert(matchesTarget(s, "p2", a, { symbolCount: 1 }), "シンボル1つのスピリットは symbolCount:1 に一致する")
    assert(!matchesTarget(s, "p2", b, { symbolCount: 1 }), "シンボル2つのスピリットは symbolCount:1 に一致しない")
    assert(matchesTarget(s, "p2", b, { symbolCount: 2 }), "シンボル2つのスピリットは symbolCount:2 に一致する")
    // minSymbols（以上）とは別軸であることを固定する
    assert(matchesTarget(s, "p2", b, { minSymbols: 1 }), "minSymbols は「以上」なので2つでも一致する")
}

console.log("すべてのチェックに合格しました 🎉（part287）")
