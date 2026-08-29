// smoke パート258（BS10-058 水星神龍メルクリウス・サーペント新規構造化。2026-08-28）
//
// 新設した機構:
//   - kind:"altSummonFromHand"（手札にあるこのカード自身の代替召喚ルート。cost.returnOwnNexusToDeckBottom
//     で指定した自分のネクサスをデッキの下に戻すことがコストで、召喚コストは支払わない。維持コアは通常どおり）
//   - GameAction.summon.altSummonNexusInstanceIds（上の代替召喚を選ぶ指定）
//   - shared/rules.ts の canAltSummonFromHand（UI向け発動可否判定。サーバーの検証と同じ実装を通す）
//   - server/src/logic/removal.ts の returnNexusToDeckBottom（ネクサスをデッキの下へ。returnNexusToHandのデッキ下版）
//   - action "randomOpponentHandMagicDiscard"（相手の手札から1枚を内容を見ないで＝ランダムに選び、
//     マジックカードなら破棄・それ以外はそのまま。決定的簡略化はしない。SEMANTICS_AUDIT.md §3.14）
// ⚠️ cardId はハードコードせず、名前をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { canAltSummonFromHand } from "../../shared/rules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS10-058").name === "水星神龍メルクリウス・サーペント", "BS10-058 は水星神龍メルクリウス・サーペント")
    assert(getCard("BS03-114").name === "サファイアの城壁" && getCard("BS03-114").colors.includes("blue"), "BS03-114は青ネクサス")
    assert(getCard("BS01-135").name === "パワーオーラ" && getCard("BS01-135").type === "magic", "BS01-135は緑マジック")
    assert(getCard("BS03-141").name === "ビルドアップ" && getCard("BS03-141").type === "magic", "BS03-141は青マジック")
    assert(getCard("BS01-001").name === "ゴラドン" && getCard("BS01-001").type === "spirit", "BS01-001は非マジック（スピリット）")
    assert(getCard("BS03-071").name === "戦闘獣ブルトップ" && getCard("BS03-071").type === "spirit", "BS03-071は非マジック（スピリット）")
}

console.log("=== BS10-058 節1：青のネクサスをデッキの下に戻すことで、コストを支払わずに召喚できる ===")
{
    const s = base("t258-altsummon-ok")
    s.players.p1.hand = ["BS10-058"]
    const nexus = createInstance("BS03-114", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)

    const check = canAltSummonFromHand(s, "p1", 0)
    assert(check.ok === true, "青ネクサスがあれば代替召喚を選べる")
    assert(check.candidateNexusIds.includes(nexus.instanceId), "候補にそのネクサスが入っている")

    const reserveBefore = s.players.p1.reserve
    const deckLenBefore = s.players.p1.deck.length
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, altSummonNexusInstanceIds: [nexus.instanceId] }) === null,
        "代替召喚ルートで召喚できる",
    )
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS10-058"), "メルクリウス・サーペントが場に出た")
    assert(!s.players.p1.field.nexuses.some((n) => n.instanceId === nexus.instanceId), "支払ったネクサスは場から消えた")
    assert(s.players.p1.deck.length === deckLenBefore + 1, "デッキが1枚増えた（ネクサスが戻った分）")
    assert(s.players.p1.deck[s.players.p1.deck.length - 1] === "BS03-114", "そのネクサスはデッキの一番下（末尾）に入った")
    // 召喚コスト6は免除。維持コアはLv1で1個のみリザーブから払う
    assert(s.players.p1.reserve === reserveBefore - 1, "リザーブは維持コア1個ぶんだけ減った（召喚コスト6は免除された）")
}

console.log("=== BS10-058 節1：自分の青のネクサスが無ければ代替召喚を選べない ===")
{
    const s = base("t258-altsummon-none")
    s.players.p1.hand = ["BS10-058"]
    const check = canAltSummonFromHand(s, "p1", 0)
    assert(check.ok === false, "青ネクサスが無ければ ok:false")
    assert(check.candidateNexusIds.length === 0, "候補ネクサスは空")
    assert(
        act(s, "p1", { type: "summon", handIndex: 0, altSummonNexusInstanceIds: ["dummy"] }) !== null,
        "候補が無いのに指定してもサーバー側で拒否される",
    )
}

console.log("=== BS10-058 節2：合体アタック時、相手の手札がすべてマジックなら必ず1枚破棄する ===")
{
    const s = base("t258-attack-allmagic")
    const merc = createInstance("BS10-058", s.turn, 4) // Lv2（cores4）
    merc.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化（instIsCombined）
    s.players.p1.field.spirits.push(merc)
    s.players.p2.hand = ["BS01-135", "BS03-141"] // 緑マジック／青マジック＝すべてマジック
    const handBefore = s.players.p2.hand.length
    fireTrigger(s, "p1", merc, "onAttack")
    assert(s.players.p2.hand.length === handBefore - 1, "手札がすべてマジックなら必ず1枚破棄された")
    assert(s.players.p2.trashCards.length === 1, "破棄されたカードはトラッシュへ")
}

console.log("=== BS10-058 節2：相手の手札にマジックが1枚も無ければ手札枚数は変わらない ===")
{
    const s = base("t258-attack-nomagic")
    const merc = createInstance("BS10-058", s.turn, 4)
    merc.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
    s.players.p1.field.spirits.push(merc)
    s.players.p2.hand = ["BS01-001", "BS03-071"] // 非マジック2枚のみ
    const handBefore = s.players.p2.hand.length
    fireTrigger(s, "p1", merc, "onAttack")
    assert(s.players.p2.hand.length === handBefore, "手札枚数は変わらない")
    assert(s.players.p2.trashCards.length === 0, "トラッシュは増えない")
}

console.log("=== BS10-058 節2：合体していない（スピリット単体）ときはこの効果は発揮されない ===")
{
    const s = base("t258-attack-notcombined")
    const merc = createInstance("BS10-058", s.turn, 4) // Lv2だがbraveRefs無し＝非合体
    s.players.p1.field.spirits.push(merc)
    s.players.p2.hand = ["BS01-135", "BS03-141"] // すべてマジックでも
    const handBefore = s.players.p2.hand.length
    fireTrigger(s, "p1", merc, "onAttack")
    assert(s.players.p2.hand.length === handBefore, "合体していないので手札は変わらない（whileCombinedゲート）")
    assert(s.players.p2.trashCards.length === 0, "トラッシュも増えない")
}

console.log("すべてのチェックに合格しました 🎉（part258）")
