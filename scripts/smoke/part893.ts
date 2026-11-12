// smoke パート893（効果による召喚・配置の残りの経路でも、置くコアの数＝Lvを選べる。2026-11-11 ユーザー決定。part892 の続き）
// 経路：オープンした札の召喚（無償・pay:"cost"）／ミノガメンの無償召喚／フィールドのコアで払う配置／バーストの召喚／
// 同時召喚（1体ずつ Lv を聞き、全員分が決まってから一括で払う）／ネクサスの一括配置（1枚ずつ聞く）／ボイドの通行料つき
import { assert, handleAction as act, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { applySpiritMillFreeSummon } from "../../server/src/logic/revive"

const BELD = "BS09-X36" // 魔界七将ベルドゴール（紫・コスト3・Lv1=1コア/Lv2=3コア）
const ROKU = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const GATE = "BS15-064" // 冥府へ続く魔門（紫ネクサス・Lv1=0コア/Lv2=2コア）
const CANNON = "BS01-089" // デュアルキャノン・ベル（白・コスト4・効果なし・Lv1=1/Lv2=3コア）
const IMP = "BS22-012" // 骸魔インプ（コスト4/6/7のスピリットの召喚にリザーブ1個の通行料）

console.log("=== 前提: カードの機械確認 ===")
{
    const b = getCard(BELD)
    assert(b.name === "魔界七将ベルドゴール" && b.type === "spirit" && b.cost === 3 && b.levels[0]!.cores === 1 && b.levels[1]!.cores === 3, "BELDはコスト3・Lv1=1/Lv2=3コア")
    assert(getCard(ROKU).name === "ロクケラトプス", "ROKUはロクケラトプス")
    const g = getCard(GATE)
    assert(g.name === "冥府へ続く魔門" && g.type === "nexus" && g.levels[0]!.cores === 0 && g.levels[1]!.cores === 2, "GATEはLv1=0/Lv2=2コアのネクサス")
    const c = getCard(CANNON)
    assert(c.name === "デュアルキャノン・ベル" && c.type === "spirit" && c.cost === 4 && c.effects.length === 0 && c.levels[0]!.cores === 1 && c.levels[1]!.cores === 3, "CANNONはコスト4・効果なし・Lv1=1/Lv2=3コア")
    const i = getCard(IMP)
    assert(i.name === "骸魔インプ" && i.effects.some((e: any) => e.constraint?.type === "summonPayToll" && e.constraint.costIn.includes(4)), "IMPはコスト4に通行料を課す")
}

function game(seed: string, reserve = 10): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 4
    s.phase = "main"
    s.players.p1.reserve = reserve
    s.players.p1.deck = Array.from({ length: 40 }, () => ROKU)
    s.players.p2.deck = Array.from({ length: 40 }, () => ROKU)
    return s
}
const spiritOf = (s: GameState, cardId: string) => s.players.p1.field.spirits.find((x) => x.cardId === cardId)
// 置くコアの数（Lv）の待ちに答える。待ちの選択肢にその Lv が出ていることも確かめる
function askLv(s: GameState, label: string): void {
    const pc: any = s.pendingChoice
    assert(pc?.kind === "option" && pc.options.includes(label), `置くコアの数を選ぶ待ちに「${label}」が出る（${JSON.stringify(pc?.options)}）`)
    assert(act(s, "p1", { type: "resolveChoice", option: label }) === null, `${label} を答える`)
}

console.log("=== 1. オープンした札の召喚（無償）：Lv2 を選ぶとコア3個で出る ===")
{
    const s = game("reveal-free")
    resolveAction(s, "p1", null, { type: "revealApplyOne", cardId: BELD, srcPid: "p1", dest: "summon" })
    assert(spiritOf(s, BELD) === undefined, "選ぶ時点ではまだ場に出ていない")
    askLv(s, "コア3個（Lv2）")
    assert(spiritOf(s, BELD)?.cores === 3, `コア3個で出る（${spiritOf(s, BELD)?.cores}）`)
    assert(s.players.p1.reserve === 7, `リザーブは10→7（${s.players.p1.reserve}）`)
}

console.log("=== 2. オープンした札の召喚（pay:cost）：コスト3を払い、Lv2 のコア3個を置く ===")
{
    const s = game("reveal-cost")
    resolveAction(s, "p1", null, { type: "revealApplyOne", cardId: BELD, srcPid: "p1", dest: "summon", pay: "cost" })
    askLv(s, "コア3個（Lv2）")
    assert(spiritOf(s, BELD)?.cores === 3, `コア3個で出る（${spiritOf(s, BELD)?.cores}）`)
    assert(s.players.p1.reserve === 4, `リザーブは10→4（コスト3＋置く3。${s.players.p1.reserve}）`)
    assert(s.players.p1.trashCores === 3, `コスト分3個はトラッシュへ（${s.players.p1.trashCores}）`)
}

console.log("=== 3. オープンした札の配置（ネクサス）：Lv2 を選ぶとコア2個で置かれる ===")
{
    const s = game("reveal-nexus")
    resolveAction(s, "p1", null, { type: "revealApplyOne", cardId: GATE, srcPid: "p1", dest: "placeNexus" })
    askLv(s, "コア2個（Lv2）")
    const n = s.players.p1.field.nexuses.find((x) => x.cardId === GATE)
    assert(n?.cores === 2 && s.players.p1.reserve === 8, `コア2個・リザーブ10→8（${n?.cores}・${s.players.p1.reserve}）`)
}

console.log("=== 4. ミノガメン（無償召喚）：Lv2 を選ぶとコア3個で出る ===")
{
    const s = game("mill")
    s.players.p1.trashCards = [BELD]
    applySpiritMillFreeSummon(s, { pid: "p1", cardId: BELD, trashIndex: 0 })
    askLv(s, "コア3個（Lv2）")
    assert(spiritOf(s, BELD)?.cores === 3 && s.players.p1.reserve === 7, `コア3個・リザーブ10→7（${spiritOf(s, BELD)?.cores}・${s.players.p1.reserve}）`)
    assert(!s.players.p1.trashCards.includes(BELD), "トラッシュから消える")
}

console.log("=== 5. フィールドのコアで払う配置：コストは自動で払い、Lv2 を選ぶと置くコアが2個 ===")
{
    const s = game("field-cores")
    s.players.p1.trashCards = [GATE]
    const host = createInstance(ROKU, 1, 6)
    s.players.p1.field.spirits.push(host)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "moveCards", from: "trash", count: 1, dest: "placeNexus", pay: "fieldCoresOnly", pick: { cardType: "nexus" } })
    for (let i = 0; i < 3 && s.pendingChoice && (s.pendingChoice as any).kind === "card"; i++) act(s, "p1", { type: "resolveChoice", cardIndex: (s.pendingChoice as any).cardIndices[0] })
    askLv(s, "コア2個（Lv2）")
    const n = s.players.p1.field.nexuses.find((x) => x.cardId === GATE)
    assert(n?.cores === 2, `コア2個で置かれる（${n?.cores}）`)
    assert(host.cores === 6 - getCard(GATE).cost, `コストはフィールドのコアから払う（${host.cores}）`)
    assert(s.players.p1.reserve === 8, `置くコアはリザーブから（10→8。${s.players.p1.reserve}）`)
}

console.log("=== 6. バーストの召喚：Lv2 を選ぶとコア3個で出る ===")
{
    const s = game("burst")
    s.players.p1.burst = BELD
    s.players.p1.burstSet = true
    resolveAction(s, "p1", null, { type: "summon", from: "burst" })
    askLv(s, "コア3個（Lv2）")
    assert(spiritOf(s, BELD)?.cores === 3 && s.players.p1.burst === null, `コア3個で出て、バーストエリアは空（${spiritOf(s, BELD)?.cores}）`)
    assert(s.players.p1.reserve === 7, `リザーブは10→7（${s.players.p1.reserve}）`)
}

console.log("=== 7. ネクサスの一括配置（all）：1枚ずつ Lv を聞く ===")
{
    const s = game("deploy-all")
    s.players.p1.trashCards = [GATE, GATE]
    resolveAction(s, "p1", null, { type: "deployNexus", from: "trash", all: true })
    askLv(s, "コア2個（Lv2）")
    assert(s.players.p1.field.nexuses.length === 1 && s.pendingChoice !== null, "1枚目の Lv を答えたあと、2枚目の Lv を聞かれる")
    askLv(s, "コア0個（Lv1）")
    const cores = s.players.p1.field.nexuses.map((n) => n.cores).sort()
    assert(s.players.p1.field.nexuses.length === 2 && JSON.stringify(cores) === "[0,2]", `2枚が別の Lv で置かれる（${JSON.stringify(cores)}）`)
    assert(s.pendingChoice === null && s.players.p1.trashCards.length === 0, "待ちは残らず、トラッシュは空")
}

console.log("=== 8. 同時召喚：1体ずつ Lv を聞き、全員分が決まってから一括で払う ===")
{
    const s = game("repeat", 20)
    s.players.p1.hand = [BELD, BELD]
    resolveAction(s, "p1", null, { type: "summon", from: "hand", repeatWhileChosen: true, payCost: true })
    // 手札を2枚選んで決定
    act(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    act(s, "p1", { type: "resolveChoice", cardIndex: 1 })
    act(s, "p1", { type: "resolveChoice" })
    askLv(s, "コア3個（Lv2）")
    assert(s.players.p1.field.spirits.length === 0 && s.players.p1.reserve === 20, "全員の Lv が決まるまで、払いも召喚も始まらない")
    askLv(s, "コア1個（Lv1）")
    for (let i = 0; i < 3 && s.pendingChoice; i++) act(s, "p1", { type: "resolveChoice", option: (s.pendingChoice as any).options?.[0] ?? "支払う" })
    const cores = s.players.p1.field.spirits.filter((x) => x.cardId === BELD).map((x) => x.cores).sort()
    assert(JSON.stringify(cores) === "[1,3]", `2体が別の Lv（コア3個と1個）で出る（${JSON.stringify(cores)}）`)
    assert(s.players.p1.reserve === 20 - 6 - 4, `リザーブは20→10（コスト6＋置く4。${s.players.p1.reserve}）`)
}

console.log("=== 9. ボイドの通行料つき：通行料を除いて Lv が選べ、通行料はリザーブから払う ===")
{
    const s = game("toll", 5)
    s.players.p2.field.spirits.push(createInstance(IMP, 1, 1))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "revealApplyOne", cardId: CANNON, srcPid: "p1", dest: "summon" })
    // 通行料1＋Lv2の3コア＝4 ≤ 5。通行料を引かずに数えると Lv2 が出ない／足りないのに出る、のどちらかになる
    askLv(s, "コア3個（Lv2）")
    assert(spiritOf(s, CANNON)?.cores === 3, `コア3個で出る（${spiritOf(s, CANNON)?.cores}）`)
    assert(s.players.p1.reserve === 1, `リザーブは5→1（通行料1＋置く3。${s.players.p1.reserve}）`)
}
{
    const s = game("toll-short", 3)
    s.players.p2.field.spirits.push(createInstance(IMP, 1, 1))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "revealApplyOne", cardId: CANNON, srcPid: "p1", dest: "summon" })
    // リザーブ3：通行料1＋Lv2の3コア＝4 は足りない。置けるのは1〜2個（どちらも Lv1）
    assert(JSON.stringify(s.pendingChoice?.options) === JSON.stringify(["コア1個（Lv1）", "コア2個（Lv1）"]), `足りない Lv は選べない（${JSON.stringify(s.pendingChoice?.options)}）`)
    askLv(s, "コア2個（Lv1）")
    assert(spiritOf(s, CANNON)?.cores === 2 && s.players.p1.reserve === 0, `コア2個で出る（${spiritOf(s, CANNON)?.cores}・${s.players.p1.reserve}）`)
}

console.log("すべてのチェックに合格しました 🎉（part893）")
