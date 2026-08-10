// smoke パート156（BS08鳳翼の聖剣Lv2：デッキ破棄をライフのコア1個で無効にする）
//
// 「〜することで、その効果を無効にする」は**任意コスト**なので、実対戦では確認を出す必要がある。
// ところが millDeck はアクションハンドラの奥から呼ばれるので、その場では中断できない。
// そこで復活の確認（reviveOnDestroy.optional）と同じ「保留確認」の形にした:
//   millDeck が破棄を**見送って** GameState.pendingDeckMillNegates へ積む
//     → handleAction の末尾＝安全な地点で1件だけ確認を出す
//     → 断られたら declineDeckMillNegate が skipNegate 付きで millDeck を呼び直す（そこで破棄される）
// 非対話（既定の smoke）では確認を出せないので、その場で支払って無効にする。
//
// ここで確かめるのは効果文の限定4つ（相手のスピリットの効果／【粉砕】以外／Lv2／ライフが足りる）と、
// 保留確認の往復（承認・拒否・発生源が場を離れた場合）。
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { millDeck, resolveFunsai } from "../../server/src/logic/EffectModules"
import { handleAction } from "../../server/src/logic/GameEngine"
import { loadAllCards } from "../../data/loadCards"

interface CardRow {
    cardId: string
    name: string
    type?: string
    effects?: Record<string, unknown>[]
    levels?: { level?: number; cores?: number; bp?: number }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]

const SWORD = CARDS.find((c) => (c.effects ?? []).some((e) => e["kind"] === "deckMillNegate"))!
const LV2_CORES = SWORD.levels?.find((l) => l.level === 2)?.cores ?? 1
// 【粉砕】を静的に持つスピリット（funsai の経路を通すため）
const FUNSAI = CARDS.find(
    (c) => c.type === "spirit" && (c.effects ?? []).some((e) => e["kind"] === "keyword" && e["keyword"] === "funsai"),
)!

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}
// 聖剣は p2（＝デッキを破棄される側）に置く。cores を指定してレベルを作る。
// **配置ターンの「デッキは破棄されない」（e1）と混ざらないよう summonedTurn を過去にする**
function putSword(s: GameState, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(SWORD.cardId, s.turn - 1, cores)
    s.players.p2.field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
// p1 のスピリットの効果として p2 のデッキを破棄する
function millByP1Spirit(s: GameState, count: number): number {
    return millDeck(s, "p2", count, "p1", { sourceType: "spirit" })
}

console.log("=== Lv2なら、相手のスピリットの効果による破棄をライフのコア1個で無効にする ===")
{
    const s = base("sword-negate")
    putSword(s, LV2_CORES)
    const deckBefore = s.players.p2.deck.length
    const lifeBefore = s.players.p2.life
    const reserveBefore = s.players.p2.reserve

    const actual = millByP1Spirit(s, 3)

    assert(actual === 0, "破棄枚数は0（無効化された）")
    assert(s.players.p2.deck.length === deckBefore, "デッキは1枚も減っていない")
    assert(s.players.p2.life === lifeBefore - 1, "ライフのコアを1個支払った")
    assert(s.players.p2.reserve === reserveBefore + 1, "支払ったコアはリザーブへ置かれた（ボイドではない）")
}

console.log("=== 効果文の限定（Lv1・【粉砕】・スピリット以外の発生源・ライフ不足では無効にできない） ===")
{
    // Lv1（levels:[2] 指定なので発動しない）
    const lv1 = base("sword-lv1")
    putSword(lv1, 0)
    const before1 = lv1.players.p2.deck.length
    millByP1Spirit(lv1, 2)
    assert(lv1.players.p2.deck.length === before1 - 2, "Lv1では無効にできない（2枚破棄された）")
    assert(lv1.players.p2.life === 5, "ライフも支払っていない")

    // ネクサス・マジックの効果（by:"opponentSpiritEffect" に一致しない）
    const byNexus = base("sword-bynexus")
    putSword(byNexus, LV2_CORES)
    const before2 = byNexus.players.p2.deck.length
    millDeck(byNexus, "p2", 2, "p1", { sourceType: "nexus" })
    assert(byNexus.players.p2.deck.length === before2 - 2, "ネクサスの効果による破棄は無効にできない")

    // 【粉砕】（exceptFunsai）
    const funsai = base("sword-funsai")
    putSword(funsai, LV2_CORES)
    const attacker = createInstance(FUNSAI.cardId, funsai.turn, 4)
    funsai.players.p1.field.spirits.push(attacker)
    refreshLevelAsOverrides(funsai)
    const before3 = funsai.players.p2.deck.length
    const life3 = funsai.players.p2.life
    resolveFunsai(funsai, "p1", attacker)
    assert(funsai.players.p2.deck.length < before3, `【粉砕】による破棄は無効にできない（${FUNSAI.name}）`)
    assert(funsai.players.p2.life === life3, "【粉砕】ではライフを支払わない")

    // ライフ0（支払えないので確認自体を出さない＝そのまま破棄される）
    const noLife = base("sword-nolife")
    putSword(noLife, LV2_CORES)
    noLife.players.p2.life = 0
    const before4 = noLife.players.p2.deck.length
    millByP1Spirit(noLife, 2)
    assert(noLife.players.p2.deck.length === before4 - 2, "ライフが足りなければ無効にできない")
}

console.log("=== 実対戦（interactiveTargets）では確認を出し、答えるまで破棄を保留する ===")
{
    const s = base("sword-confirm")
    s.interactiveTargets = true
    putSword(s, LV2_CORES)
    const deckBefore = s.players.p2.deck.length

    millByP1Spirit(s, 2)
    assert(s.players.p2.deck.length === deckBefore, "確認を出す時点ではまだ破棄していない")
    assert((s.pendingDeckMillNegates ?? []).length === 1, "確認待ちの行列に1件積まれた")

    // handleAction の末尾で確認が立つ（ここでは「安全な地点」を通すために pass を投げる）
    handleAction(s, "p1", { type: "pass" })
    assert(s.pendingChoice?.deckMillNegate !== undefined, "pendingChoice に確認が立った")
    assert(s.pendingChoice?.pid === "p2", "答えるのはデッキを破棄される側（＝聖剣の持ち主）")

    // 「無効にする」を選ぶ
    const life = s.players.p2.life
    handleAction(s, "p2", { type: "resolveChoice", option: "無効にする" })
    assert(s.pendingChoice === null, "確認は解決された")
    assert(s.players.p2.deck.length === deckBefore, "破棄は無効になった")
    assert(s.players.p2.life === life - 1, "ライフのコア1個を支払った")
}

console.log("=== 確認を断ると、見送っていた破棄がそこで行われる ===")
{
    const s = base("sword-decline")
    s.interactiveTargets = true
    putSword(s, LV2_CORES)
    const deckBefore = s.players.p2.deck.length
    const lifeBefore = s.players.p2.life

    millByP1Spirit(s, 2)
    handleAction(s, "p1", { type: "pass" })
    assert(s.pendingChoice?.deckMillNegate !== undefined, "確認が立っている")

    // option を渡さない＝スキップ（無効にしない）
    handleAction(s, "p2", { type: "resolveChoice" })
    assert(s.players.p2.deck.length === deckBefore - 2, "断ったので2枚破棄された")
    assert(s.players.p2.life === lifeBefore, "ライフは支払っていない")
}

console.log("=== 確認を出すまでに聖剣が場を離れていたら、破棄はそのまま行われる ===")
{
    const s = base("sword-gone")
    s.interactiveTargets = true
    const sword = putSword(s, LV2_CORES)
    const deckBefore = s.players.p2.deck.length

    millByP1Spirit(s, 2)
    // 確認が立つ前にネクサスが場を離れる
    s.players.p2.field.nexuses = s.players.p2.field.nexuses.filter((n) => n.instanceId !== sword.instanceId)
    handleAction(s, "p1", { type: "pass" })

    assert(s.pendingChoice === null, `${getCard(sword.cardId).name}が場に無いので確認は出ない`)
    assert(s.players.p2.deck.length === deckBefore - 2, "見送っていた破棄がここで行われた")
}
