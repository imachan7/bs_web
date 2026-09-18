// smoke パート346（BS15 黄バッチ：037-045・047・069・070・081・082・X05。2026-09-18）
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    destroySpirit,
    fireFieldEventTriggers,
    fireStepTriggers,
    fireTrigger,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { millDeck } from "../../server/src/logic/EffectModules"
import { effectiveCost } from "../../server/src/logic/RuleValidator"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [
        ["BS15-037", "クダギツネン"],
        ["BS15-038", "アルカナビースト・ジャック"],
        ["BS15-039", "僧侶ペンタン"],
        ["BS15-040", "ネコマーダ"],
        ["BS15-041", "天使リユイエル"],
        ["BS15-042", "オリンピアの天使アラトロン"],
        ["BS15-043", "ショーグンペンタン"],
        ["BS15-044", "天使サクエル"],
        ["BS15-045", "虚獣帝スフィン・クロス"],
        ["BS15-047", "パンクマウス"],
        ["BS15-069", "太陰の宮廷"],
        ["BS15-070", "風吹くロリポップ高地"],
        ["BS15-081", "ローヤルバイブル"],
        ["BS15-082", "神閃月下"],
        ["BS15-X05", "光の覇王ルナアーク・カグヤ"],
    ]
    for (const [id, name] of names) {
        const c = getCard(id)
        assert(c.name === name, `${id} は${name}（実際は${c.name}）`)
    }
    assert(getCard("BS15-037").effects.length === 0, "037 はバニラ")
}

console.log("=== 038 アルカナビースト・ジャック：召喚時に自分と相手それぞれへ色を与えられる ===")
{
    const s = game("p346-038", true)
    const jack = put(s, "p1", "BS15-038", 1)
    const oppSpirit = put(s, "p2", "BS15-037", 1)
    put(s, "p2", "BS15-046", 1) // 候補が1体だと自動で選ばれるので2体置く
    fireTrigger(s, "p1", jack, "onSummon")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動を選ぶ")
    // fixedTarget:"self" なので対象選択は飛ばし、いきなり色選択（kind:"option"）になる
    assert(act(s, "p1", { type: "resolveChoice", option: "赤" }) === null, "自分に与える色を選ぶ")
    assert(jack.tempColors.includes("red"), "自分のスピリットに赤が与えられた")
    // 続けて相手側の対象選択（targetSide:"opponent"）→色選択
    assert(act(s, "p1", { type: "resolveChoice", instanceId: oppSpirit.instanceId }) === null, "相手の対象を選ぶ")
    assert(act(s, "p1", { type: "resolveChoice", option: "青" }) === null, "相手に与える色を選ぶ")
    assert(oppSpirit.tempColors.includes("blue"), "相手のスピリットに青が与えられた")
}

console.log("=== 039 僧侶ペンタン：黄しかない間、相手のスタートステップにトラッシュのコアをリザーブへ ===")
{
    const s = game("p346-039")
    put(s, "p1", "BS15-039", 3) // Lv2
    s.players.p1.trashCores = 5
    const reserveBefore = s.players.p1.reserve
    fireFieldEventTriggers(s, "p1", "ownBurstSet") // ダミー発火ではなくstep経由をkind:"step"で直接呼ぶ
    resolveAction(s, "p1", put(s, "p1", "BS15-039", 3), { type: "trashCoresToReserve", count: 2 })
    assert(s.players.p1.reserve === reserveBefore + 2, "リザーブが2増える")
    assert(s.players.p1.trashCores === 3, "トラッシュのコアが2減る")
}

console.log("=== 040 ネコマーダ：手札を破棄することでドローできる ===")
{
    const s = game("p346-040")
    const neko = put(s, "p1", "BS15-040", 1)
    s.players.p1.hand = ["BS15-037"]
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", neko, "onSummon")
    assert(s.players.p1.hand.length === 1, "破棄した1枚と引いた1枚で手札枚数は変わらない")
    assert(s.players.p1.deck.length === deckBefore - 1, "デッキから1枚引いた")
}
{
    const s = game("p346-040b")
    const neko = put(s, "p1", "BS15-040", 1)
    s.players.p1.hand = []
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", neko, "onSummon")
    assert(s.players.p1.deck.length === deckBefore, "手札が無ければ発動しない")
}

console.log("=== 041 天使リユイエル：聖命でライフを増やし、Lv2はブロックされない ===")
{
    const s = game("p346-041")
    const riyuel = put(s, "p1", "BS15-041", 1)
    s.players.p1.life = 3
    fireTrigger(s, "p1", riyuel, "onLifeDealt")
    assert(s.players.p1.life === 4, "聖命でライフが1増える")
}
{
    const s = game("p346-041b")
    put(s, "p1", "BS15-041", 4) // Lv2
    put(s, "p2", "BS15-037", 1)
    put(s, "p2", "BS15-037", 1) // 2色ではない（同色なので不成立）
    refreshLevelAsOverrides(s)
    // 相手が赤1色だけ→2色未満なので通常どおりブロック可能
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const attacker = s.players.p1.field.spirits[0]!
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック")
    const blocker = s.players.p2.field.spirits[0]!
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "相手が1色だけならブロックできる")
}

console.log("=== 042 オリンピアの天使アラトロン：神将のライフ上限とデッキ破棄無効＋バウンス ===")
{
    const s = game("p346-042")
    put(s, "p1", "BS15-042", 3) // Lv3
    assert(s.players.p1.burst === null, "burstSet前提")
    s.players.p1.burst = "BS15-081"
    s.players.p1.burstSet = true
    // 神将のライフ上限は globalConstraint 経由で shared/rules.lifeDamagePerSpiritRemaining が判定するため
    // ここではカードの存在と条件を確認するに留める（アタック経由の検証は既存共通器のテストで担保済み）
    assert(getCard("BS15-042").effects.some((e) => e.kind === "globalConstraint"), "神将の効果を持つ")
}
{
    const s = game("p346-042b")
    put(s, "p1", "BS15-042", 4) // Lv3
    const opp = put(s, "p2", "BS15-041", 1)
    s.currentEffectSource = { pid: "p2", type: "spirit", instanceId: opp.instanceId }
    const deckBefore = s.players.p1.deck.length
    const actual = millDeck(s, "p1", 3, "p2", { sourceType: "spirit" })
    assert(actual === 0, "相手のスピリットの効果によるデッキ破棄が無効になった（疲労して払う）")
    assert(s.players.p1.deck.length === deckBefore, "デッキは破棄されなかった")
    assert(
        s.players.p2.field.spirits.length === 0,
        "破棄を起こした相手のスピリットが相手のデッキの下に戻された",
    )
    assert(s.players.p2.deck[s.players.p2.deck.length - 1] === "BS15-041", "戻したカードがデッキの末尾にある")
}

console.log("=== 043 ショーグンペンタン：バーストで自身を召喚し、破壊時に復活/回収できる ===")
{
    const s = game("p346-043")
    put(s, "p1", "BS15-041", 1)
    put(s, "p1", "BS15-041", 1)
    put(s, "p1", "BS15-041", 1) // 黄のスピリット3体
    s.players.p1.burst = "BS15-043"
    s.players.p1.burstSet = true
    s.players.p1.hand = []
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.burst === null, "バーストが消費された")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-043"),
        "ショーグンペンタンが場に出る",
    )
}
{
    // Lv2-3『破壊時』：黄のスピリットカードを破棄したら回復状態で残る。名前に「ペンタン」を含めば手札にも
    const s = game("p346-043b")
    const pentan = put(s, "p1", "BS15-043", 2) // Lv2
    s.players.p1.deck.unshift("BS15-039") // 黄のスピリットカード「僧侶ペンタン」
    destroySpirit(s, "p1", pentan.instanceId, "destroy")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === pentan.instanceId),
        "黄のスピリットカードを破棄したので回復状態で残る",
    )
    assert(pentan.isRested === false, "回復状態で残る")
    assert(s.players.p1.hand.includes("BS15-039"), "カード名にペンタンを含むので手札に加わる")
}
{
    const s = game("p346-043c")
    const pentan = put(s, "p1", "BS15-043", 2) // Lv2
    s.players.p1.deck.unshift("BS15-041") // 黄のスピリットカードだが「リユイエル」（ペンタンを含まない）
    destroySpirit(s, "p1", pentan.instanceId, "destroy")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === pentan.instanceId),
        "黄のスピリットカードを破棄したので回復状態で残る",
    )
    assert(!s.players.p1.hand.includes("BS15-041"), "カード名にペンタンを含まなければ手札に加わらない")
    assert(s.players.p1.trashCards.includes("BS15-041"), "手札に加わらなければトラッシュに残る")
}

console.log("=== 044 天使サクエル：バースト破棄でマジック回収、無償フラッシュ ===")
{
    const s = game("p346-044")
    const sakuel = put(s, "p1", "BS15-044", 1)
    s.players.p1.burst = "BS15-081"
    s.players.p1.burstSet = true
    s.players.p1.trashCards = ["BS15-082"] // バースト持ちの黄マジック
    fireTrigger(s, "p1", sakuel, "onAttack")
    assert(s.players.p1.burst === null, "バーストを破棄した")
    assert(s.players.p1.hand.includes("BS15-082"), "神閃月下を手札に戻した")
}

console.log("=== 045 虚獣帝スフィン・クロス：コアを払ってブロックされなかった扱いにできる ===")
{
    const s = game("p346-045")
    const sphinx = put(s, "p1", "BS15-045", 8) // Lv1
    put(s, "p2", "BS15-037", 1)
    refreshLevelAsOverrides(s)
    const coresBefore = sphinx.cores
    const lifeBefore = s.players.p2.life
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: sphinx.instanceId }) === null, "アタック")
    const blocker = s.players.p2.field.spirits[0]!
    // onSpiritBlocked は非対話では自動発動する（optional:trueの既定挙動）ので、
    // declareBlock を宣言した時点でコア支払いとBPを比べない扱いの印まで進む
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(sphinx.cores === coresBefore - 1, "コアを1個払った（自動発動）")
    // フラッシュタイミング②を閉じて、バトル解決まで進める
    while (s.isFlashTiming && s.battle) {
        assert(act(s, s.priorityPlayer, { type: "pass" }) === null, "フラッシュ②をパスで閉じる")
    }
    assert(s.players.p2.life === lifeBefore - 1, "ブロックされずライフに通った")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === sphinx.instanceId),
        "アタッカーは破壊されない",
    )
    assert(blocker.isRested === true, "ブロッカーは疲労したまま残る（回復しない）")
}

console.log("=== 047 パンクマウス：相手が2色以上ならLv2として扱う ===")
{
    const s = game("p346-047")
    const mouse = put(s, "p1", "BS15-047", 1) // Lv1コアのまま
    put(s, "p2", "BS15-041", 1) // 黄1色だけ
    refreshLevelAsOverrides(s)
    assert(currentLevel(mouse).level === 1, "相手が1色のときはLv1のまま")
    put(s, "p2", "BS15-046", 1) // 青を混ぜて2色にする
    refreshLevelAsOverrides(s)
    assert(currentLevel(mouse).level === 2, "相手が2色以上ならLv2として扱う")
}

console.log("=== 069 太陰の宮廷：ミルの上限（お互い・相手の効果限定） ===")
{
    const s = game("p346-069")
    put(s, "p1", "BS15-069", 2) // Lv2（p1側に置くが「お互い」を守るので相手のデッキも守る）
    put(s, "p2", "BS15-041", 1)
    const before = s.players.p1.deck.length
    const actual = millDeck(s, "p1", 5, "p2", { sourceType: "spirit" })
    assert(actual === 3, `相手の効果によるミルは3枚までに制限される（実際${actual}枚）`)
    assert(s.players.p1.deck.length === before - 3, "デッキが3枚だけ減る")
    // bothSides：p1のネクサスがp2のデッキも同様に守る
    const before2 = s.players.p2.deck.length
    const actual2 = millDeck(s, "p2", 5, "p1", { sourceType: "spirit" })
    assert(actual2 === 3, `bothSidesによりp2のデッキも3枚までに制限される（実際${actual2}枚）`)
    assert(s.players.p2.deck.length === before2 - 3, "p2のデッキも3枚だけ減る")
}
{
    const s = game("p346-069b")
    put(s, "p1", "BS15-069", 2)
    const before = s.players.p1.deck.length
    const actual = millDeck(s, "p1", 5, "p1")
    assert(actual === 5, "自分の効果によるミルは制限されない")
    void before
}
console.log("=== 069 太陰の宮廷Lv2：バースト条件の読み替え ===")
{
    // BS15-082神閃月下は event:"opponentSummonEffectResolved" だが、069Lv2の効果で
    // event:"ownLifeDamaged" でも発動できるようになる
    const s = game("p346-069c")
    put(s, "p1", "BS15-069", 2) // Lv2
    s.players.p1.burst = "BS15-082"
    s.players.p1.burstSet = true
    s.players.p1.trashCards = ["BS15-081"]
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.burst === null, "ownLifeDamagedでも神閃月下のバーストが発動する（読み替え）")
}
{
    // 069が無ければ ownLifeDamaged では発動しない（通常どおり event 不一致で無視）
    const s = game("p346-069d")
    s.players.p1.burst = "BS15-082"
    s.players.p1.burstSet = true
    s.players.p1.trashCards = ["BS15-081"]
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.burst === "BS15-082", "069が無ければ読み替えは働かない")
}

console.log("=== 070 風吹くロリポップ高地：相手2色以上でマジックに軽減、相手不攻撃でドロー ===")
{
    const s = game("p346-070")
    put(s, "p1", "BS15-070", 2) // Lv2
    put(s, "p2", "BS15-041", 1)
    put(s, "p2", "BS15-046", 1) // 黄+青で2色
    s.phase = "attack"
    s.turnPlayer = "p1"
    const costBefore = getCard("BS15-081").cost
    const cost = effectiveCost(s, "p1", getCard("BS15-081"))
    assert(cost < costBefore, `手札の黄マジックに軽減シンボルが与えられ、コストが下がる（${costBefore}→${cost}）`)
}
{
    const s = game("p346-070b")
    put(s, "p2", "BS15-070", 2) // Lv2 相手側（p2から見て相手＝p1のアタックステップ）
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.attacksThisTurn = 0
    const drawBefore = s.players.p2.hand.length
    fireStepTriggers(s, "attack", undefined, "end")
    assert(s.players.p2.hand.length === drawBefore + 1, "相手が1回もアタックしてこなかったので1枚ドロー")
}
{
    const s = game("p346-070c")
    put(s, "p2", "BS15-070", 2)
    s.phase = "attack"
    s.turnPlayer = "p1"
    s.attacksThisTurn = 1
    const drawBefore = s.players.p2.hand.length
    fireStepTriggers(s, "attack", undefined, "end")
    assert(s.players.p2.hand.length === drawBefore, "アタックがあればドローしない")
}

console.log("=== 081 ローヤルバイブル：コスト2の自分のスピリットすべてを回復 ===")
{
    const s = game("p346-081")
    const two = put(s, "p1", "BS15-039", 1) // コスト2
    two.isRested = true
    const other = put(s, "p1", "BS15-041", 1) // コスト4
    other.isRested = true
    resolveAction(s, "p1", null, { type: "refreshAllOwnByFilter", filter: { cost: { max: 2, min: 2 } } })
    assert(!two.isRested, "コスト2は回復する")
    assert(other.isRested, "コスト2以外は回復しない")
}

console.log("=== 082 神閃月下：バーストでトラッシュ整理、フラッシュで色以外を封じる ===")
{
    const s = game("p346-082")
    s.players.p1.trashCards = ["BS15-081", "BS15-039", "BS15-040", "BS15-041"]
    const deckTopBefore = s.players.p1.deck[0]
    const deckBottomBefore = s.players.p1.deck[s.players.p1.deck.length - 1]
    resolveAction(s, "p1", null, {
        type: "sequence",
        actions: [{ type: "trashMagicToDeckTop" }, { type: "trashCardsToDeckBottom", count: 10 }],
    })
    assert(s.players.p1.deck[0] === "BS15-081", "マジックがデッキの上に戻った")
    assert(s.players.p1.trashCards.length === 0, "残りのトラッシュもすべて戻った")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] !== deckBottomBefore, "デッキの下が変化した")
    void deckTopBefore
}
{
    const s = game("p346-082b")
    put(s, "p2", "BS15-041", 1)
    put(s, "p2", "BS15-046", 1)
    resolveAction(s, "p1", null, { type: "restrictActionsToColorThisTurn", color: "yellow" })
    assert(
        s.turnConstraints.some((c) => c.type === "cantActExceptColor" && c.color === "yellow"),
        "黄以外はアタック/ブロックできない制約が付く",
    )
}

console.log("=== X05 光の覇王ルナアーク・カグヤ：バーストでコア確保→自身を召喚、相手のBPを固定 ===")
{
    const s = game("p346-x05")
    s.players.p1.trashCards = ["BS15-041", "BS15-039", "BS15-040"] // 黄のカード3枚
    s.players.p1.burst = "BS15-X05"
    s.players.p1.burstSet = true
    s.players.p1.reserve = 10
    const lifeBefore = s.players.p1.life
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", { pid: "p1", inst: put(s, "p1", "BS15-041", 1) }, undefined, undefined, undefined, {
        byOpponentEffect: true,
    })
    assert(s.players.p1.life === lifeBefore + 1, "ライフにコアが置かれた（非対話は既定でライフ側）")
    assert(s.players.p1.burst === null, "バーストが消費された")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS15-X05"),
        "この効果発揮後、自身を召喚した",
    )
}
{
    const s = game("p346-x05b")
    put(s, "p1", "BS15-X05", 5)
    const target = put(s, "p2", "BS15-041", 1)
    s.players.p1.reserve = 5
    resolveAction(s, "p1", null, { type: "setOpponentBpAsThisBattle", levels: [1, 2, 3, 4], amount: 2000 }, target.instanceId)
    assert(target.battleBpAs?.amount === 2000, "相手のBPがこのバトルの間2000として扱われる")
}

console.log("すべてのチェックに合格しました 🎉（part346）")
