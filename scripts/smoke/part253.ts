// smoke パート253（BS10黄バッチ：明星きらめく花園／堕天神龍ヴィーナ・ルシファー）
// 新設した機構:
//   - 継続効果 kind "trashSymbolReduction"（フィールドのシンボルに加え、自分のトラッシュにあるカードの
//     シンボルでも召喚コストを軽減できる。scope:"ownHand"＝発生源の持ち主の手札全体（cardType/cardColor絞り込み）／
//     scope:"self"＝手札にあるカード自身。BS10-092／BS10-X05）
//   - shared/rules.ts の countTrashSymbols（トラッシュのシンボル数）と shared/cost.ts の
//     hasTrashSymbolReduction（effectiveCostの軽減ループへ組み込み）
//   - action "millUntilMagicCastFree"（手札の指定種別カード1枚を破棄することで＝任意コスト、デッキを上から
//     マジックカードが出るまで破棄し、そのマジックのフラッシュ効果をコストを支払わずに即時発揮する。BS10-X05）
import { act, assert, createGame, createInstance, effectiveCost, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-092").name === "明星きらめく花園", "BS10-092 は明星きらめく花園")
    assert(getCard("BS10-X05").name === "堕天神龍ヴィーナ・ルシファー", "BS10-X05 は堕天神龍ヴィーナ・ルシファー")
}

console.log("=== BS10-092：場にあるとき、手札の黄のスピリットカードはトラッシュの黄シンボルでも軽減できる ===")
{
    const s = base("hanazono-reduction")
    const ken = getCard("BS02-056") // アルカナビースト・ケン：黄スピリット cost2 reduction[黄,黄]
    s.players.p1.trashCards.push("BS02-056", "BS02-056")
    assert(effectiveCost(s, "p1", ken) === 2, "092が無ければトラッシュのシンボルは軽減に使えない")
    const hanazono = createInstance("BS10-092", s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(hanazono)
    assert(effectiveCost(s, "p1", ken) === 0, "092(Lv1)があればトラッシュの黄シンボル2つで軽減されコスト0になる")
}

console.log("=== BS10-092：黄でないスピリット／マジックカードは軽減されない（絞り込みの確認） ===")
{
    const s = base("hanazono-filter")
    const hanazono = createInstance("BS10-092", s.turn, 0)
    s.players.p1.field.nexuses.push(hanazono)
    s.players.p1.trashCards.push("BS02-056", "BS02-056") // 黄シンボル2つ（軽減の原資はある）
    const merat = getCard("BS01-006") // 赤スピリット cost2 reduction[赤,赤]
    assert(effectiveCost(s, "p1", merat) === 2, "色が違うスピリットカードは軽減されない（cardColor）")
    // 092自身が場でシンボル黄1つを提供するため通常軽減で1コスト減るが（cost2→1）、
    // トラッシュぶんの追加軽減（cardType:"spirit"限定）はマジックには効かない
    const additionalColor = getCard("BS02-104") // 黄マジック cost2 reduction[黄,黄]
    assert(effectiveCost(s, "p1", additionalColor) === 1, "黄でも種別が違うマジックカードはトラッシュぶんは軽減されない（cardType）")
}

console.log("=== BS10-X05：自分自身の効果でトラッシュのシンボルでも軽減できる（092が場になくても効く） ===")
{
    const s = base("vinalucifer-self-reduction")
    const vina = getCard("BS10-X05") // cost6 reduction[黄]x5
    assert(effectiveCost(s, "p1", vina) === 6, "トラッシュが空なら軽減なし")
    s.players.p1.trashCards.push("BS02-056", "BS02-056", "BS02-056", "BS02-056", "BS02-056")
    assert(effectiveCost(s, "p1", vina) === 1, "トラッシュの黄シンボル5つで5軽減されコスト1になる")
}

console.log("=== BS10-092 Lv2：系統一致の自分のスピリット召喚時、リザーブ→ライフへコア1個 ===")
{
    const sLv1 = base("hanazono-lv1-nofire")
    sLv1.turnPlayer = "p1"
    sLv1.phase = "main"
    sLv1.players.p1.field.nexuses.push(createInstance("BS10-092", sLv1.turn, 0)) // Lv1
    sLv1.players.p1.hand = ["BS10-X05"] // 系統「神星」を持つ（handIndex:0を確定させる）
    const lifeBeforeLv1 = sLv1.players.p1.life
    assert(act(sLv1, "p1", { type: "summon", handIndex: 0 }) === null, "Lv1花園がある状態でヴィーナ・ルシファーを召喚")
    assert(sLv1.players.p1.life === lifeBeforeLv1, "092がLv1のときはこの効果は発火しない")

    const sLv2 = base("hanazono-lv2-fire")
    sLv2.turnPlayer = "p1"
    sLv2.phase = "main"
    sLv2.players.p1.field.nexuses.push(createInstance("BS10-092", sLv2.turn, 1)) // Lv2
    sLv2.players.p1.hand = ["BS10-X05"] // handIndex:0を確定させる
    const lifeBeforeLv2 = sLv2.players.p1.life
    assert(act(sLv2, "p1", { type: "summon", handIndex: 0 }) === null, "Lv2花園がある状態でヴィーナ・ルシファーを召喚")
    assert(sLv2.players.p1.life === lifeBeforeLv2 + 1, "系統「神星」を持つ自分のスピリット召喚でリザーブ→ライフへコア1個")
}

console.log("=== BS10-X05 Lv3【合体時】合体アタック時：手札のスピリット破棄→デッキをマジックが出るまで破棄→無償で発揮 ===")
{
    const s = base("vinalucifer-mill")
    const vina = createInstance("BS10-X05", s.turn, 5) // Lv3
    vina.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化（instIsCombined）
    s.players.p1.field.spirits.push(vina)
    s.players.p1.hand = ["BS01-001"] // 破棄用のスピリットカード（ゴラドン。初期手札を上書きして確定させる）
    s.players.p1.deck.unshift("BS01-126") // シャドウエリクサー（フラッシュ：リザーブ→ライフへコア1個）
    s.players.p1.deck.unshift("BS01-006") // 空振り用の非マジックカード
    s.players.p1.deck.unshift("BS01-002") // 空振り用の非マジックカード
    const lifeBefore = s.players.p1.life
    const reserveBefore = s.players.p1.reserve
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", vina, "onAttack")
    assert(!s.players.p1.hand.includes("BS01-001"), "手札のゴラドンを破棄した")
    assert(s.players.p1.trashCards.includes("BS01-001"), "破棄したゴラドンはトラッシュへ")
    assert(s.players.p1.trashCards.includes("BS01-126"), "出たシャドウエリクサーはトラッシュに残ったまま")
    assert(s.players.p1.deck.length === deckBefore - 3, "デッキを上から3枚（空振り2枚＋マジック1枚）破棄した")
    assert(s.players.p1.life === lifeBefore + 1, "シャドウエリクサーのフラッシュ効果（リザーブ→ライフ）が無償で発揮された")
    assert(s.players.p1.reserve === reserveBefore - 1, "発揮自体のコストは免除されるが、効果本体のコスト（リザーブ→ライフ）は払う")
}

console.log("=== BS10-X05：手札にスピリットカードが無ければ不発 ===")
{
    const s = base("vinalucifer-nospirit")
    const vina = createInstance("BS10-X05", s.turn, 5) // Lv3
    vina.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
    s.players.p1.field.spirits.push(vina)
    s.players.p1.hand = ["BS01-126"] // マジックカードのみ（スピリットではない。初期手札を上書きして確定させる）
    s.players.p1.deck.unshift("BS01-126")
    const trashBefore = s.players.p1.trashCards.length
    const deckBefore = s.players.p1.deck.length
    const lifeBefore = s.players.p1.life
    fireTrigger(s, "p1", vina, "onAttack")
    assert(s.players.p1.trashCards.length === trashBefore, "手札にスピリットが無いのでトラッシュは変化しない")
    assert(s.players.p1.deck.length === deckBefore, "デッキも破棄されない")
    assert(s.players.p1.life === lifeBefore, "ライフも変化しない（不発）")
}

console.log("すべてのチェックに合格しました 🎉（part253）")
