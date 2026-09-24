// smoke パート366（ステップの見出し・見出しの無い行の BP+ は発揮し続ける継続効果。ACTION_VOCABULARY §4・2026-09-24 ユーザー確認）
import { assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

const CHOUHI = "BS16-024" // 『自分のアタックステップ』このスピリットのコア1個につき、このスピリットをBP+1000
const OGRE = "BS16-007" // Lv2『自分のアタックステップ』カード名に「ドラゴン」と入っている自分のスピリットすべてをBP+2000
const VOLCANO = "BS13-061" // Lv2『自分のアタックステップ』ライフのコア1個につき、地竜と竜人の両方を持つ自分のスピリットすべてをBP+1000
const PHEASANT = "BS12-004" // Lv2（見出し無し）自分のスピリット状態のブレイヴすべてをBP+3000
const BOTH = "BS13-002" // 鎧竜人アンキロング（地竜・竜人）
const BRAVE = "BS12-057" // ハイドランディア（ブレイヴ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CHOUHI).name === "バーバリ・チョウヒ", "CHOUHI")
    assert(getCard(OGRE).name === "オーガ・ドラゴン", "OGRE")
    assert(getCard(VOLCANO).name === "戴冠する活火山" && getCard(VOLCANO).type === "nexus", "VOLCANO")
    assert(getCard(PHEASANT).name === "ドラゴン・フェゼント", "PHEASANT")
    assert(getCard(BRAVE).type === "brave", "BRAVEはブレイヴ")
}

function coresFor(cardId: string, level: number): number {
    return getCard(cardId).levels.find((l) => l.level === level)!.cores
}

function game(): GameState {
    const s = createGame("p366", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turnPlayer = "p1"
    s.phase = "main"
    return s
}

function put(s: GameState, cardId: string, cores: number) {
    const inst = createInstance(cardId, 1, cores)
    if (getCard(cardId).type === "nexus") s.players.p1.field.nexuses.push(inst)
    else s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. バーバリ・チョウヒ：自分のアタックステップの間だけ、コアの数ぶん（途中の増減も反映） ===")
{
    const s = game()
    const me = put(s, CHOUHI, 2)
    const main = effectiveBp(s, "p1", me)
    s.phase = "attack"
    assert(effectiveBp(s, "p1", me) === main + 2000, "コア2個で BP+2000")
    me.cores += 1
    assert(effectiveBp(s, "p1", me) - 1000 * 3 === effectiveBp({ ...s, phase: "main" } as GameState, "p1", me), "コアが増えるとその場で BP+3000")
    s.turnPlayer = "p2"
    assert(effectiveBp(s, "p1", me) === effectiveBp({ ...s, phase: "main" } as GameState, "p1", me), "相手のアタックステップでは効かない")
}

console.log("=== 2. オーガ・ドラゴン：発生源が場を離れたら消える ===")
{
    const s = game()
    put(s, OGRE, coresFor(OGRE, 2))
    const dragon = ALL_CARDS.find((c) => c.type === "spirit" && c.name.includes("ドラゴン") && c.effects.length === 0 && c.cardId !== OGRE)!
    const target = put(s, dragon.cardId, coresFor(dragon.cardId, 1))
    const base = effectiveBp(s, "p1", target)
    s.phase = "attack"
    assert(effectiveBp(s, "p1", target) === base + 2000, "アタックステップの間 BP+2000")
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.cardId !== OGRE)
    assert(effectiveBp(s, "p1", target) === base, "発生源が場を離れたら消える")
}

console.log("=== 3. 戴冠する活火山：地竜と竜人の両方を持つスピリットだけ、ライフの数ぶん ===")
{
    const s = game()
    put(s, VOLCANO, coresFor(VOLCANO, 2))
    const both = put(s, BOTH, 1)
    const onlyOne = put(s, "BS01-002", 1) // ロクケラトプス（地竜だけ）
    const bothBase = effectiveBp(s, "p1", both)
    const oneBase = effectiveBp(s, "p1", onlyOne)
    s.phase = "attack"
    const life = s.players.p1.life
    assert(effectiveBp(s, "p1", both) === bothBase + 1000 * life, `ライフ${life}個ぶん BP+${1000 * life}`)
    assert(effectiveBp(s, "p1", onlyOne) === oneBase, "片方の系統だけなら乗らない")
    s.players.p1.life -= 1
    assert(effectiveBp(s, "p1", both) === bothBase + 1000 * (life - 1), "ライフが減ればその場で減る")
}

console.log("=== 4. ドラゴン・フェゼント Lv2：見出しの無い行はステップを問わず効く ===")
{
    const s = game()
    put(s, PHEASANT, coresFor(PHEASANT, 2))
    const brave = createInstance(BRAVE, 1, 1)
    s.players.p1.field.spirits.push(brave)
    refreshLevelAsOverrides(s)
    const lv2 = effectiveBp(s, "p1", brave)
    s.players.p1.field.spirits = s.players.p1.field.spirits.filter((x) => x.cardId !== PHEASANT)
    assert(lv2 === effectiveBp(s, "p1", brave) + 3000, "メインステップでもスピリット状態のブレイヴは BP+3000")
}

console.log("すべてのチェックに合格しました 🎉（part366）")
