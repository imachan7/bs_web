// smoke パート215（実プレイで見つかった不具合②：コストを支払わない召喚で召喚時効果が出ない）
//
// X002 極龍帝ジーク・ソル・フリード『このスピリットの召喚時』
// 「自分の手札にあるカード名に「ジーク」と入っているスピリットカード1枚を、
//   コストを支払わず、【転召】させずに召喚できる。」
//
// ここで召喚したスピリットの**召喚時効果が発揮されていなかった**。
// summonFreeFromHandIndex / summonFreeFromTrashIndex が fireSummonSequence を呼んでおらず、
// ログにも「（このスピリットの召喚時効果は発揮されない）」と出していた。
// **対象26枚のどのカードにも、効果文にその制限は書かれていない**（「【転召】させずに」の明記はある）。
// 召喚時効果だけでなく「自分のスピリットが召喚されたとき」の誘発も同時に失われていた。
import { assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const SOL_FREED = "X002" // 極龍帝ジーク・ソル・フリード（「ジーク」を手札からコスト無しで召喚）
const CRIMSON = "X003D" // 極帝龍騎ジーク・クリムゾン（召喚時：BP3000以下をすべて破壊）
const WEAK = "BS01-002" // ロクケラトプス（バニラ。BP3000以下＝上の召喚時効果で消える側）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard(SOL_FREED).name === "極龍帝ジーク・ソル・フリード", "X002 は極龍帝ジーク・ソル・フリード")
    assert(getCard(CRIMSON).name === "極帝龍騎ジーク・クリムゾン" && getCard(CRIMSON).name.includes("ジーク"), "X003D は名前に「ジーク」を含む")
    assert(
        getCard(CRIMSON).effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon"),
        "X003D は召喚時効果を持つ（これが発揮されるかを見る）",
    )
    assert(getCard(WEAK).name === "ロクケラトプス" && getCard(WEAK).effects.length === 0, "BS01-002 はロクケラトプス（バニラ）")
    const bp = getCard(WEAK).levels[0]?.bp ?? 0
    assert(bp > 0 && bp <= 3000, "ロクケラトプスの Lv1 BP は3000以下（クリムゾンの召喚時効果で破壊される）")
}

function setup(): { s: GameState; src: ReturnType<typeof createInstance> } {
    const s = createGame("solfreed-summon", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    // 発生源（ソル・フリード）は場に置いておき、その召喚時効果だけを直接起こす
    const src = createInstance(SOL_FREED, s.turn, 1)
    s.players.p1.field.spirits.push(src)
    // 手札に「ジーク」持ち（召喚時効果あり）を1枚だけ入れる
    s.players.p1.hand = [CRIMSON]
    // 相手に BP3000以下のスピリットを2体（召喚時効果が働けば消える）
    s.players.p2.field.spirits.push(createInstance(WEAK, s.turn, 1))
    s.players.p2.field.spirits.push(createInstance(WEAK, s.turn, 1))
    return { s, src }
}

console.log("=== コストを支払わない召喚でも、召喚時効果が発揮される ===")
{
    const { s, src } = setup()
    const enemiesBefore = s.players.p2.field.spirits.length
    assert(enemiesBefore === 2, "相手に BP3000以下が2体いる（前提）")

    resolveAction(s, "p1", src, { type: "summonFromHandFree", nameIncludes: "ジーク", skipTensho: true })

    assert(s.players.p1.field.spirits.some((x) => x.cardId === CRIMSON), "手札のジークが場に出た")
    assert(s.players.p1.hand.length === 0, "手札から抜けている")
    // ここが直った点：以前は召喚時効果が呼ばれず、相手のスピリットが残っていた
    assert(s.players.p2.field.spirits.length === 0, "召喚時効果（BP3000以下をすべて破壊）が発揮された")
}

console.log("=== 「召喚されたとき」のフィールド誘発も発火する ===")
{
    // fireSummonSequence は召喚時効果のあとに ownSpiritSummoned を発火させる。
    // 呼んでいなかったので、この誘発も一緒に失われていた。
    // BS09-071 イモータルドローのような「自分のスピリットが召喚されたとき」を持つカードで確かめる
    const DRAW_ON_SUMMON = "BS06-087" // 夢中漂う桃幻郷（系統「想獣」が召喚されたとき1枚引く）
    const card = getCard(DRAW_ON_SUMMON)
    assert(card.name === "夢中漂う桃幻郷", "BS06-087 は夢中漂う桃幻郷")
    const fe = card.effects.find((e) => e.kind === "fieldEvent")
    assert(fe !== undefined && fe.event === "ownSpiritSummoned", "「自分のスピリットが召喚されたとき」の誘発を持つ")

    // 「想獣」を持つバニラを手札に用意して、コスト無し召喚で出す
    const SOJU = "BS03-063" // ポニサス（系統「想獣」・バニラ）
    assert(getCard(SOJU).name === "ポニサス" && getCard(SOJU).family.includes("想獣"), "BS03-063 はポニサス（想獣）")
    assert(getCard(SOJU).effects.length === 0, "ポニサスはバニラ（自身の効果が結果に混ざらない）")

    const s = createGame("summon-fieldevent", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1" // 桃幻郷の誘発は turn:"own"
    s.players.p1.reserve = 20
    s.players.p1.field.nexuses.push(createInstance(DRAW_ON_SUMMON, s.turn, 1))
    const src2 = createInstance(SOL_FREED, s.turn, 1)
    s.players.p1.field.spirits.push(src2)
    s.players.p1.hand = [SOJU]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", src2, { type: "summonFromHandFree", skipTensho: true })
    assert(s.players.p1.field.spirits.some((x) => x.cardId === SOJU), "想獣が場に出た")
    assert(s.players.p1.deck.length === deckBefore - 1, "「召喚されたとき」の誘発でカードを1枚引いた")
}
