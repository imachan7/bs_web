// smoke パート306（BS13 青バッチ7枚。docs/design/BS13_PLAN.md §12）
// 新しく足した器 BM（アタックにコア支払いを要求）・BO（トラッシュ回収の片側封じ）・
// BK拡張（forceEndMainStepのwho:"turnPlayer"）・BU（ブロックにマジック破棄を要求）・
// BV（自分のスピリットが少ないとアタックできない）を1つずつ固定する。
import {
    act,
    assert,
    createInstance,
    createGame,
    declareBlock,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

const costLE3Spirit = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 3 && c.levels[0]?.cores === 1)!.cardId
const costEq6Spirit = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 6 && c.levels[0]?.cores === 1)!.cardId
const mainDrawMagic = ALL_CARDS.find(
    (c) => c.type === "magic" && c.cost <= 3 && c.effects.some((e) => e.kind === "magic" && e.timing === "main" && (e.action as { type: string }).type === "draw"),
)!.cardId
const anyMagic = ALL_CARDS.find((c) => c.type === "magic")!.cardId

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS13-041").name === "チョーター" && getCard("BS13-041").type === "spirit", "BS13-041はチョーター")
    assert(getCard("BS13-042").name === "ナイト・ゴーン", "BS13-042はナイト・ゴーン")
    assert(getCard("BS13-043").name === "鳥人イカロッシュ", "BS13-043は鳥人イカロッシュ")
    assert(getCard("BS13-044").name === "吟遊詩人のオルフェ", "BS13-044は吟遊詩人のオルフェ")
    assert(getCard("BS13-046").name === "シャンターグ", "BS13-046はシャンターグ")
    assert(getCard("BS13-047").name === "深海大帝ノーグ・デンス", "BS13-047は深海大帝ノーグ・デンス")
    assert(getCard("BS13-071").name === "巨人港" && getCard("BS13-071").type === "nexus", "BS13-071は巨人港（ネクサス）")
}

console.log("=== 器BM：BS13-043「コスト3以下のアタックはリザーブのコア1個をトラッシュに置かなければならない」 ===")
{
    const s = game("bm-attack-core-toll")
    const source = createInstance("BS13-043", s.turn, getCard("BS13-043").levels[0]!.cores)
    s.players.p1.field.spirits.push(source)
    const attacker1 = createInstance(costLE3Spirit, s.turn, 1)
    const attacker2 = createInstance(costLE3Spirit, s.turn, 1)
    s.players.p1.field.spirits.push(attacker1, attacker2)
    refreshLevelAsOverrides(s)
    s.players.p1.reserve = 1
    act(s, "p1", { type: "nextPhase" })

    assert(act(s, "p1", { type: "attack", instanceId: attacker1.instanceId }) === null, "コア1個あれば払ってアタックできる")
    assert(s.players.p1.reserve === 0, "器BM：アタックの支払いでリザーブのコアが1個減った")
    assert(s.players.p1.trashCores === 1, "器BM：減った1個は持ち主のトラッシュへ置かれた")

    assert(takeLifeAndResolve(s, "p2") === null, "ブロックされずライフで受けてバトルが終了する")

    const err = act(s, "p1", { type: "attack", instanceId: attacker2.instanceId })
    assert(err !== null, "器BM：リザーブが空だとそもそもアタックできない")
}

console.log("=== 器BO：BS13-044 Lv2「相手は、トラッシュからカードを手札に戻せない」 ===")
{
    const s = game("bo-no-trash-recovery")
    const source = createInstance("BS13-044", s.turn, getCard("BS13-044").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(source)
    refreshLevelAsOverrides(s)
    s.players.p1.trashCards.push(anyMagic)
    s.players.p2.trashCards.push(anyMagic)

    const p2HandBefore = s.players.p2.hand.length
    resolveAction(s, "p2", null, { type: "recoverMagicFromTrash" })
    assert(s.players.p2.hand.length === p2HandBefore, "器BO：発生源の持ち主から見た相手はトラッシュから手札に戻せない")

    const p1HandBefore = s.players.p1.hand.length
    resolveAction(s, "p1", null, { type: "recoverMagicFromTrash" })
    assert(s.players.p1.hand.length === p1HandBefore + 1, "器BO：発生源の持ち主自身は従来どおり戻せる")
}

console.log("=== 器BK拡張：BS13-046「お互い、マジックの効果を使用したとき、その効果発揮後、メインステップを終了する」（自分のマジック使用でも自分のメインステップが終わる） ===")
{
    const s = game("bk-who-turnplayer")
    assert(s.turnPlayer === "p1" && s.phase === "main", "前提：p1のメインステップにいる")
    const source = createInstance("BS13-046", s.turn, getCard("BS13-046").levels[0]!.cores)
    s.players.p1.field.spirits.push(source)
    refreshLevelAsOverrides(s)
    s.players.p1.hand = [mainDrawMagic]
    s.interactiveTargets = false // マジックのドロー後の追加選択（手札破棄など）で止まらせない

    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "自分のマジックを使用")

    assert(s.phase === "attack", "器BK拡張：who省略時と違い、自分のマジック使用でも自分のメインステップが終わる")
    assert(s.turnPlayer === "p1", "ターンプレイヤーはそのまま")
}

console.log("=== 器BU：BS13-047召喚時「このターンの間、アタックしたとき、相手はマジック1枚を破棄しなければブロックできない」 ===")
{
    const s = game("bu-block-discard-magic")
    const attacker = createInstance("BS13-047", s.turn, getCard("BS13-047").levels[0]!.cores)
    s.players.p1.field.spirits.push(attacker)
    const blocker = createInstance(costLE3Spirit, s.turn, 1)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", attacker, { type: "grantBlockRequiresMagicDiscardThisTurn" })
    act(s, "p1", { type: "nextPhase" })

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "召喚時に付与された制約は、このターンの以後のアタックにも効く")
    assert(s.battle?.blockCostDiscardMagic?.pid === "p2", "器BU：このバトルのブロックにマジック破棄が要求される")

    s.players.p2.hand = [] // デッキ由来の初期手札にマジックが紛れていても判定が崩れないよう空にする
    act(s, "p2", { type: "pass" })
    const errNoMagic = declareBlock(s, "p2", blocker.instanceId)
    assert(errNoMagic !== null, "器BU：手札にマジックがなければブロックできない")

    s.players.p2.hand = [anyMagic]
    const handBefore = s.players.p2.hand.length
    const trashBefore = s.players.p2.trashCards.length
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "手札にマジックがあればブロックできる")
    assert(s.players.p2.hand.length === handBefore - 1, "器BU：ブロックのコストとして手札のマジック1枚が破棄された")
    assert(s.players.p2.trashCards.length === trashBefore + 1, "破棄されたカードはトラッシュへ")
}

console.log("=== 器BV：BS13-071「自分のスピリットが3体以下のとき、自分はアタックできない」（両陣営それぞれ独立） ===")
{
    const s = game("bv-few-own-spirits")
    const nexus = createInstance("BS13-071", s.turn, getCard("BS13-071").levels[0]!.cores)
    s.players.p1.field.nexuses.push(nexus)
    const attacker = createInstance(costLE3Spirit, s.turn, 1)
    s.players.p1.field.spirits.push(attacker) // p1のスピリットは1体（3体以下）
    const p2spirit1 = createInstance(costLE3Spirit, s.turn, 1)
    const p2spirit2 = createInstance(costLE3Spirit, s.turn, 1)
    s.players.p2.field.spirits.push(p2spirit1, p2spirit2) // p2は2体（アタックには無関係）
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" })

    const err = act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    assert(err !== null, "器BV：自分のスピリットが3体以下だとアタックできない")

    // p1のスピリットを4体に増やせばアタックできる（自分の数だけを見る＝相手の数は無関係）
    const extra1 = createInstance(costLE3Spirit, s.turn, 1)
    const extra2 = createInstance(costLE3Spirit, s.turn, 1)
    const extra3 = createInstance(costLE3Spirit, s.turn, 1)
    s.players.p1.field.spirits.push(extra1, extra2, extra3)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "器BV：4体以上いればアタックできる")
}

console.log("=== BS13-046召喚時「コスト3以下2体を破壊」または「コスト6を1体を破壊」（2択・器BQ2択枠の再利用） ===")
{
    const s = game("shangtag-choose-mode")
    const source = createInstance("BS13-046", s.turn, getCard("BS13-046").levels[0]!.cores)
    s.players.p1.field.spirits.push(source)
    const target = createInstance(costEq6Spirit, s.turn, 1)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)

    resolveAction(
        s,
        "p1",
        source,
        {
            type: "chooseActionMode",
            modes: [
                { label: "相手のコスト3以下のスピリット2体を破壊", actions: [{ type: "destroy", count: 2, filter: { cost: { max: 3 } } }] },
                { label: "相手のコスト6のスピリット1体を破壊", actions: [{ type: "destroy", count: 1, filter: { cost: { max: 6, min: 6 } } }] },
            ],
        },
        undefined,
        undefined,
        undefined,
        "相手のコスト6のスピリット1体を破壊",
    )

    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === target.instanceId), "選んだモード（コスト6を1体）で破壊された")
}

console.log("すべてのチェックに合格しました 🎉（part306）")
