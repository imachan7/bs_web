// smoke パート277（BS11 グループC その6：解釈確定の3件。2026-09-02 ユーザー確認）
//
// - BS11-052 魔銃ヴェスパー「このスピリットのシンボル1つにつき」＝**合体スピリット全体**のシンボル数
// - BS11-X02 Lv3「相手はブレイヴをスピリット状態にできない」＝任意分離／場を離れるときの「残す」／単体召喚の3経路を止める
// - BS11-064 Lv1「破壊されたスピリットをコスト3/4としても扱う」＝【不死】の引き金コスト判定にだけ効く
import { assert, createGame, createInstance, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, destroySpirit, fushiCandidates } from "../../server/src/logic/removal"
import { validateDetachBrave, validateSummon } from "../../server/src/logic/RuleValidator"

const VESPER = "BS11-052" // 魔銃ヴェスパー（シンボル紫1つ・合体条件コスト5以上）
const NOVA = "BS11-X02" // 滅神星龍ダークヴルム・ノヴァ（Lv3＝5コア）
const DARK_SWORD = "BS11-064" // 闇の聖剣
const bigVanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0 && c.cost >= 5 && c.symbol.length === 1)
const vanilla = ALL_CARDS.filter((c) => c.type === "spirit" && c.effects.length === 0)
const braveVanillaCond = ALL_CARDS.find(
    (c) => c.type === "brave" && JSON.stringify(c.braveCondition) === JSON.stringify({ vanilla: true }),
)
assert(bigVanilla.length >= 1 && braveVanillaCond !== undefined, "テスト前提: コスト5以上のバニラとブレイヴがいる")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function combine(s: GameState, pid: PlayerId, hostCardId: string, braveCardId: string, cores: number) {
    const host = createInstance(hostCardId, s.turn, cores)
    s.players[pid].field.spirits.push(host)
    const brave = createInstance(braveCardId, s.turn, 0)
    attachBrave(s, pid, host, brave)
    refreshLevelAsOverrides(s)
    return { host, brave }
}

console.log("=== §A BS11-052：シンボル数は合体スピリット全体（ホスト1＋ブレイヴ1＝2個） ===")
{
    const s = game("vesper")
    const { brave } = combine(s, "p1", bigVanilla[0]!.cardId, VESPER, 3)
    const target = createInstance(vanilla[0]!.cardId, s.turn, 5)
    s.players.p2.field.spirits.push(target)
    const before = s.players.p2.reserve
    // 発生源は合体中のブレイヴ自身（【合体時】のエントリ）
    resolveAction(s, "p1", brave, { type: "coreRemove", count: 1, countCounter: "selfSymbols" })
    assert(target.cores === 3, `コアが2個減る（実際は${String(target.cores)}個残り）`)
    assert(s.players.p2.reserve === before + 2, "取り除いたコアは相手のリザーブへ")
}

console.log("=== §B BS11-X02 Lv3：相手はブレイヴをスピリット状態にできない ===")
{
    const s = game("nova-lv3")
    const nova = createInstance(NOVA, s.turn, 5) // Lv3
    s.players.p1.field.spirits.push(nova)
    refreshLevelAsOverrides(s)
    // ① 相手（p2）のブレイヴ単体召喚は拒否される
    s.players.p2.hand = [braveVanillaCond!.cardId]
    assert(
        validateSummon(s, "p2", 0) !== null,
        "スピリット状態のブレイヴ召喚は拒否される",
    )
    // ② 相手の任意分離も拒否される
    const { brave } = combine(s, "p2", vanilla[0]!.cardId, braveVanillaCond!.cardId, 2)
    assert(validateDetachBrave(s, "p2", brave.instanceId) !== null, "任意分離は拒否される")
    // ③ 自分（p1）は影響を受けない
    const own = combine(s, "p1", vanilla[1]!.cardId, braveVanillaCond!.cardId, 2)
    assert(validateDetachBrave(s, "p1", own.brave.instanceId) === null, "発生源の持ち主は分離できる")
}

console.log("=== §C BS11-X02 Lv3：場を離れるときも「残す」を選べない ===")
{
    const s = game("nova-leave")
    const nova = createInstance(NOVA, s.turn, 5)
    s.players.p1.field.spirits.push(nova)
    s.interactiveTargets = true
    const { host, brave } = combine(s, "p2", vanilla[0]!.cardId, braveVanillaCond!.cardId, 2)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p2", host.instanceId, "destroy")
    assert(s.pendingChoice?.braveKeep === undefined, "「残す」の確認は出ない")
    assert(s.players.p2.trashCards.includes(brave.cardId), "ブレイヴはトラッシュへ")
}

console.log("=== §D BS11-064 Lv1：破壊されたスピリットは【不死】の判定でコスト3/4としても扱われる ===")
{
    const s = game("dark-sword-cost")
    s.phase = "attack" // 【不死】は『お互いのアタックステップ』限定
    const sword = createInstance(DARK_SWORD, s.turn, 1) // Lv1
    s.players.p1.field.nexuses.push(sword)
    const cheap = vanilla.find((c) => c.cost === 0 || c.cost === 1)!
    const inst = createInstance(cheap.cardId, s.turn, 1)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    assert(
        JSON.stringify(inst.alsoCostsWhenDestroyed) === JSON.stringify([3, 4]),
        "破壊時用のコストが付く（常時のコストは変わらない）",
    )
    assert(inst.alsoCostsContinuous === undefined, "常時扱いのコストには入らない")
    // トラッシュに【不死：コスト3】のカードを置くと、コスト1のスピリットの破壊で引ける
    const fushiCard = ALL_CARDS.find((c) =>
        c.effects.some((e) => e.kind === "keyword" && e.keyword === "fushi" && (e.triggerCosts ?? []).includes(3)),
    )
    assert(fushiCard !== undefined, "テスト前提: 【不死：コスト3】のカードがいる")
    s.players.p1.trashCards.push(fushiCard!.cardId)
    assert(fushiCandidates(s, "p1", [cheap.cost]).length === 0, "本来のコストだけでは引けない")
    assert(
        fushiCandidates(s, "p1", [cheap.cost, ...(inst.alsoCostsWhenDestroyed ?? [])]).length === 1,
        "コスト3としても扱われるので引ける",
    )
}

console.log("すべてのチェックに合格しました 🎉（part277）")
