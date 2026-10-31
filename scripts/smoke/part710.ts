// smoke パート710（fieldEvent の主語・相手役の絞り込みを subjectFilter／partnerFilter に寄せた。docs/design/FILTER_UNIFY.md §7）
// 系統・コスト・excludeSelf は subjectFilter、相手役の色は partnerFilter。eventInfo を渡さなくても主体の個体から判定される
import { assert, createGame, createInstance, getCard, hasKeyword, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireFieldEventTriggers } from "../../server/src/logic/EffectModules"
import { instColors } from "../../shared/rules"
import { loadAllCards } from "../../data/loadCards"

const CARDS = loadAllCards() as unknown as { cardId: string; type?: string; cost?: number; colors?: string[]; family?: string[]; effects?: unknown[] }[]
const plain = (f: (c: (typeof CARDS)[number]) => boolean): string =>
    CARDS.find((c) => c.type === "spirit" && (c.effects ?? []).length === 0 && f(c))!.cardId

const VERIAM = "BS12-014" // 骸騎士ヴェリアム（無魔の自分のスピリットが破壊されたとき1枚ドロー）
const CLEIO = "BS05-037" // 天使クレイオ（コスト2の自分のスピリットが破壊されたとき1枚ドロー・アタックステップ）
const CATASTROPHE = "BS15-009" // 虚龍帝カタストロフドラゴン（自分の【激突】持ちが攻撃したとき、自身を回復。自身は除く）
const NECROPOLIS = "SD01-029" // 蠢く地下墓地（Lv2：緑のスピリットにブロックされたとき）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VERIAM).name === "骸騎士ヴェリアム" && getCard(CLEIO).name === "天使クレイオ", "ヴェリアム・クレイオ")
    assert(getCard(CATASTROPHE).name === "虚龍帝カタストロフドラゴン" && getCard(NECROPOLIS).name === "蠢く地下墓地", "カタストロフ・地下墓地")
    for (const id of [VERIAM, CLEIO, CATASTROPHE, NECROPOLIS]) {
        const fe = getCard(id).effects.filter((e) => e.kind === "fieldEvent")
        assert(fe.length > 0 && fe.every((e) => !("familyFilter" in e) && !("colorFilter" in e) && !("excludeSelfSubject" in e)), `${id} は旧軸を持たない`)
    }
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p1.reserve = 30
    s.players.p2.reserve = 30
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
const destroyedDraws = (holder: string, subjectId: string, seed: string): boolean => {
    const s = game(seed)
    put(s, "p1", holder, 4)
    const subject = put(s, "p1", subjectId, 1)
    const hand = s.players.p1.hand.length
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: subject }, instColors(subject), undefined, undefined, {})
    return s.players.p1.hand.length === hand + 1
}

console.log("=== 1. subjectFilter.family（ヴェリアム） ===")
{
    const mumaId = plain((c) => (c.family ?? []).includes("無魔"))
    const otherId = plain((c) => !(c.family ?? []).includes("無魔"))
    assert(destroyedDraws(VERIAM, mumaId, "fam-ok"), "無魔のスピリットが破壊されたら引く")
    assert(!destroyedDraws(VERIAM, otherId, "fam-ng"), "無魔でなければ引かない")
}

console.log("=== 2. subjectFilter.cost（クレイオ） ===")
{
    const cost2 = plain((c) => c.cost === 2)
    const cost3 = plain((c) => c.cost === 3)
    assert(destroyedDraws(CLEIO, cost2, "cost-ok"), "コスト2が破壊されたら引く")
    assert(!destroyedDraws(CLEIO, cost3, "cost-ng"), "コスト3なら引かない")
}

console.log("=== 3. subjectFilter.keyword＋excludeSelf（カタストロフ） ===")
{
    const clashId = CARDS.find((c) => c.type === "spirit" && c.cardId !== CATASTROPHE && hasKeyword(c.cardId, "clash"))!.cardId
    const noClashId = plain((c) => !hasKeyword(c.cardId, "clash"))
    const refreshedAfter = (attackerOf: "self" | "clash" | "plain", seed: string): boolean => {
        const s = game(seed)
        const self = put(s, "p1", CATASTROPHE, 4)
        const other = put(s, "p1", attackerOf === "clash" ? clashId : noClashId, 1)
        const attacker = attackerOf === "self" ? self : other
        self.isRested = true
        fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: attacker }, instColors(attacker), undefined, undefined, { costs: [] })
        return !self.isRested
    }
    assert(refreshedAfter("clash", "ex-ok"), "ほかの【激突】持ちが攻撃したら自身が回復する")
    assert(!refreshedAfter("self", "ex-self"), "自身が攻撃したときは発火しない（excludeSelf）")
    assert(!refreshedAfter("plain", "ex-kw"), "【激突】を持たなければ発火しない")
}

console.log("=== 4. partnerFilter.color（地下墓地Lv2：緑にブロックされたとき） ===")
{
    const fired = (attackerColor: "green" | "red", seed: string): boolean => {
        const s = game(seed)
        s.turnPlayer = "p2"
        const nexus = createInstance(NECROPOLIS, s.turn, 2)
        s.players.p1.field.nexuses.push(nexus)
        const blocker = put(s, "p1", plain((c) => (c.colors ?? []).length === 1 && c.colors![0] === "red"), 1)
        const attacker = put(s, "p2", plain((c) => (c.colors ?? []).length === 1 && c.colors![0] === attackerColor), 1)
        refreshLevelAsOverrides(s)
        fireFieldEventTriggers(s, "p1", "ownSpiritBlocked", { pid: "p1", inst: blocker }, instColors(blocker), attacker.instanceId, undefined, undefined)
        return attacker.isRested === true || nexus.isRested === true || blocker.isRested === true
    }
    assert(fired("green", "pf-ok"), "ブロックした相手のアタッカーが緑なら効果が働く")
    assert(!fired("red", "pf-ng"), "緑でなければ働かない")
}

console.log("すべてのチェックに合格しました 🎉（part710）")
