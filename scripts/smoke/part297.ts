// smoke パート297（簡略化5件を原作どおりにする。2026-09-07 ユーザー指示）
//   #1 BS11-036 冥土の魔女ヘレン: handMagicToTegamotoDraw に max:3 の上限を足す（既存カードは無制限のまま）
//   #2 BS11-042 海賊ラッコルセア: fieldEvent ownFunsaiMilled に lastFunsaiHasSpirit 条件を足す（既存カードは条件なしのまま）
//   #4 BS08-062 超時空重力炉: reductionGrant に replace 軸を足す（既存カードは加算のまま）
//   #3 BS12-078 カシオペアシール: デッキ横のコアを実際に持つ（voidCoreToDeckSide／エンドステップに1個ずつ戻す）
import { act, assert, createGame, createInstance, effectiveCost, endTurn, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireSummonTrigger, resolveFunsai } from "../../server/src/logic/EffectModules"
import { reductionGrantSymbols } from "../../shared/cost"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== #1 BS11-036 冥土の魔女ヘレン：手元に置けるのは3枚まで（非対話） ===")
{
    const s = game("helen-max3-auto")
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108", "BS02-109"] // 手札にマジックを4枚（非マジック混在なし）
    const deckBefore = s.players.p1.deck.length
    const inst = createInstance("BS11-036", s.turn, 3)
    s.players.p1.field.spirits.push(inst)
    fireSummonTrigger(s, "p1", inst)
    assert(s.players.p1.tegamoto.length === 3, `手元に置けるのは3枚まで（実際は${s.players.p1.tegamoto.length}枚）`)
    assert(s.players.p1.deck.length === deckBefore - 3, "ドローも3枚まで")
    assert(s.players.p1.hand.length === 4, "手札は置かれなかった1枚＋ドローした3枚の4枚になる")
}

console.log("=== #1 BS11-036：対話モードでも3枚で打ち切ってドローに移る ===")
{
    const s = game("helen-max3-interactive")
    s.interactiveTargets = true
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108", "BS02-109"]
    const deckBefore = s.players.p1.deck.length
    const inst = createInstance("BS11-036", s.turn, 3)
    s.players.p1.field.spirits.push(inst)
    fireSummonTrigger(s, "p1", inst)
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "任意効果の発動を確認する")
    let loops = 0
    while (s.pendingChoice && loops < 10) {
        loops++
        const idx = s.pendingChoice.cardIndices?.[0]
        if (idx === undefined) break
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx }) === null, "手元に1枚置く")
    }
    assert(loops === 3, `選択は3回で自動的に打ち切られる（実際は${loops}回）`)
    assert(s.pendingChoice === null, "3枚に達したら選択待ちにならない")
    assert(s.players.p1.tegamoto.length === 3, "手元は3枚")
    assert(s.players.p1.deck.length === deckBefore - 3, "ドローは3枚")
}

console.log("=== #1 上限を指定しない既存カード（マジックブック）は従来どおり無制限 ===")
{
    const s = createGame("magicbook-still-unlimited", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    // マジック4枚 + マジックブック自身
    s.players.p1.hand = ["BS01-114", "BS01-115", "BS02-108", "BS02-109", "BS02-108"]
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "castMagic", handIndex: 4 }) === null, "マジックブックを使用できる")
    assert(s.players.p1.tegamoto.length === 4, "手札にあったマジック4枚すべてを手元へ置ける（上限なし）")
    assert(s.players.p1.deck.length === deckBefore - 4, "4枚ぶんドローする")
}

console.log("=== #2 BS11-042 海賊ラッコルセア：【粉砕】でスピリットカードが出たときのみ発火 ===")
{
    const s = game("rakko-spirit-milled")
    const inst = createInstance("BS11-042", s.turn, 2)
    s.players.p1.field.spirits.push(inst)
    // 適当な【粉砕】持ちスピリット（BS04-071 スチーム・ゴレム）で解決。相手デッキの先頭をスピリットカードにする
    const funsaiSpirit = createInstance("BS04-071", s.turn, 3)
    s.players.p1.field.spirits.push(funsaiSpirit)
    s.players.p2.deck = ["BS01-001", "BS01-002", "BS01-003"] // 先頭はスピリットカード
    const totalCoresBefore = inst.cores + funsaiSpirit.cores
    resolveFunsai(s, "p1", funsaiSpirit)
    const totalCoresAfter = inst.cores + funsaiSpirit.cores
    assert(totalCoresAfter === totalCoresBefore + 1, "スピリットカードが破棄されたのでコアが1個置かれる")
}

console.log("=== #2 【粉砕】でスピリットカードが出なかったときは発火しない ===")
{
    const s = game("rakko-no-spirit-milled")
    const inst = createInstance("BS11-042", s.turn, 2)
    s.players.p1.field.spirits.push(inst)
    const funsaiSpirit = createInstance("BS04-071", s.turn, 3)
    s.players.p1.field.spirits.push(funsaiSpirit)
    // 相手デッキの先頭をマジック/ネクサスだけにする（スピリットカードなし）
    s.players.p2.deck = ["BS02-108", "BS02-108", "BS02-108"]
    const totalCoresBefore = inst.cores + funsaiSpirit.cores
    resolveFunsai(s, "p1", funsaiSpirit)
    const totalCoresAfter = inst.cores + funsaiSpirit.cores
    assert(totalCoresAfter === totalCoresBefore, "スピリットカードが出ていないのでコアは置かれない")
}

console.log("=== #2 条件を書いていない他カードは lastFunsai の記録に影響を受けない（回帰確認） ===")
{
    // BS03巨人王ランドルフ等の lastFunsaiTotal 参照カードは種別を問わないので、
    // condition の有無で lastFunsai の記録そのものが変わっていないことだけ確認する
    // （BS04-071スチーム・ゴレム Lv1＝素の【粉砕】1枚。cores=1で level1）
    const s = game("landolf-unaffected")
    s.players.p2.deck = ["BS02-108"] // スピリットが出ない粉砕（マジック1枚のみ）
    const funsaiSpirit = createInstance("BS04-071", s.turn, 1)
    s.players.p1.field.spirits.push(funsaiSpirit)
    resolveFunsai(s, "p1", funsaiSpirit)
    assert(s.lastFunsai?.total === 1, "lastFunsai.total は種別を問わず記録される（他カードの参照は影響を受けない）")
    assert((s.lastFunsai?.spirits ?? 0) === 0, "今回はスピリットカードが0枚だった")
}

console.log("=== #4 BS08-062 超時空重力炉：軽減シンボルは白3つに置換される（加算ではない） ===")
{
    const s = createGame("juryokuro-replace", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "white" })
    runTurnStart(s)
    const nexus = createInstance("BS08-062", s.turn, 4) // Lv2（cores足りることを確認する必要はなく現在レベルの判定のみ使う）
    s.players.p1.field.nexuses.push(nexus)
    const granted = reductionGrantSymbols(s, "p1", getCard("BS01-001"))
    assert(granted.replace !== null, "replace指定のエントリなのでreplaceが立つ")
    assert(
        JSON.stringify(granted.replace) === JSON.stringify(["white", "white", "white"]),
        "置換後は白3つ（素の軽減シンボルとは無関係の値）",
    )
}

console.log("=== #4 置換を指定しない既存カード（天使バーチュ等）は従来どおり加算 ===")
{
    // BS02-030（兵隊アントマン）は素のreductionが空。BS06-079神葉樹の森（既存の加算型reductionGrant、
    // 【神速】持ちに緑1つ付与）で確認する。ここではエンジンの共通関数レベルで
    // 「replace未指定ならreplace:null、extraに積まれる」ことだけを直接確認する
    const s = createGame("shinyoku-still-additive", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const nexus = createInstance("BS06-079", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    const granted = reductionGrantSymbols(s, "p1", getCard("BS02-030"))
    assert(granted.replace === null, "置換を指定しないカードはreplaceがnullのまま")
    assert(JSON.stringify(granted.extra) === JSON.stringify(["green"]), "従来どおり加算ぶんがextraに積まれる")
}

console.log("=== #3 BS12-078 カシオペアシール：デッキ横のコアを5個持ち、自分のエンドステップに1個ずつ戻す ===")
{
    const s = game("078-deckside")
    assert(s.players.p1.deckSideCores === 0, "前提: 初期状態ではデッキ横のコアは0")

    const reserveBefore = s.players.p1.reserve
    resolveAction(s, "p1", null, { type: "voidCoreToDeckSide", count: 5 })
    assert(s.players.p1.deckSideCores === 5, "ボイドからコア5個がデッキの横に置かれる")
    // 「このコアは、この効果以外に使用することはできない」＝どのゾーンにも属さない
    assert(s.players.p1.reserve === reserveBefore, "デッキ横のコアはリザーブに入らない（コストの支払いに使えない）")

    // 自分のターンを終える（＝自分のエンドステップを通す）と1個ずつ減る
    s.turnPlayer = "p1"
    endTurn(s)
    assert(
        s.players.p1.deckSideCores === 4,
        `自分のエンドステップでデッキ横のコアが1個ボイドへ戻る（実際 ${s.players.p1.deckSideCores}）`,
    )

    // 相手のターンを終えても自分のぶんは減らない（『自分のエンドステップ』限定）
    s.turnPlayer = "p2"
    endTurn(s)
    assert(s.players.p1.deckSideCores === 4, "相手のエンドステップでは自分のデッキ横のコアは減らない")

    // 5回の自分のエンドステップで0になり、それ以上は減らない
    for (let i = 0; i < 8; i++) {
        s.turnPlayer = "p1"
        endTurn(s)
    }
    assert(s.players.p1.deckSideCores === 0, "自分のエンドステップを重ねると0になる")
    assert(s.players.p1.deckSideCores >= 0, "0を下回らない")
}

console.log("すべてのチェックに合格しました 🎉（part297）")
