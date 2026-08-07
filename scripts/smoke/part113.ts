// smoke パート113（BS05-069 トランスマイグレーション）
//
// 「デッキ上3枚を公開 →【転召】持ちスピリット1体をコストを支払わず召喚できる → 残りは破棄 →
//   召喚した個体はエンドステップに自分のデッキの下に戻す」。
//
// 新設した機構:
//   - action "revealAndSummonKeyword"（公開→キーワード持ちを無償召喚→残りを破棄）
//   - CardInstance.returnToDeckBottomAtEndStep ＋ PhaseManager.endTurn の遅延処理
//   - requestCardChoice の alwaysAsk（候補1枚でも選択を出す＝「召喚できる」の任意性）
//
// ⚠️ この効果は summonFromHandFree / summonFromTrashFree と違い、効果文に
//    「召喚時効果は発揮されない」の記載が**無い**ので、召喚時効果と【転召】を通常どおり発揮する。
import { assert, act, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"
import { hasKeyword } from "../../shared/rules"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS05-069").name === "トランスマイグレーション", "BS05-069 はトランスマイグレーション")
    assert(hasKeyword("BS04-010", "tensho"), "BS04-010 雷帝エール・クレルは【転召】を持つ")
    assert(hasKeyword("BS04-X13", "tensho"), "BS04-X13 魔龍帝ジークフリードは【転召】を持つ")
    assert(!hasKeyword("BS01-002", "tensho"), "BS01-002 ロクケラトプスは【転召】を持たない")
    assert(getCard("BS04-010").levels[0]!.cores === 1, "BS04-010 のLv1維持コアは1個")
}

console.log("=== BS05-069（メイン）：公開3枚から【転召】持ちを無償召喚し、残りは破棄する ===")
{
    const s = createGame("bs05-069-main", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    // デッキ上3枚を仕込む（転召持ち1枚＋非転召2枚）
    s.players.p1.deck.unshift("BS01-002", "BS04-010", "BS01-001")
    const trashBefore = s.players.p1.trashCards.length
    const deckBefore = s.players.p1.deck.length
    resolveMagic(s, "p1", "BS05-069", "main")
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS04-010")
    assert(summoned !== undefined, "【転召】持ちが召喚された")
    assert(summoned?.cores === 1, `維持コアがリザーブから置かれる（実際${String(summoned?.cores)}）`)
    assert(
        s.players.p1.trashCards.length === trashBefore + 2,
        `残り2枚がトラッシュへ（実際+${s.players.p1.trashCards.length - trashBefore}）`,
    )
    assert(s.players.p1.deck.length === deckBefore - 3, "公開した3枚はデッキから抜ける")
    assert(summoned?.returnToDeckBottomAtEndStep === true, "エンドステップにデッキの下へ戻る印が付く")
}

console.log("=== BS05-069：召喚した個体はエンドステップに自分のデッキの下へ戻る ===")
{
    const s = createGame("bs05-069-endstep", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.deck.unshift("BS01-002", "BS04-010", "BS01-001")
    const stay = putSpirit(s, "p1", "BS01-001", 1) // 通常のスピリット（戻らない対照）
    resolveMagic(s, "p1", "BS05-069", "main")
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS04-010")!
    const reserveBefore = s.players.p1.reserve
    endTurn(s)
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === summoned.instanceId),
        "エンドステップでフィールドから離れる",
    )
    assert(
        s.players.p1.deck[s.players.p1.deck.length - 1] === "BS04-010",
        "デッキの一番下に戻る",
    )
    assert(
        s.players.p1.reserve >= reserveBefore + 1,
        "上に置かれていたコアはリザーブへ戻る",
    )
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === stay.instanceId),
        "印が付いていないスピリットは残る",
    )
}

console.log("=== BS05-069：【転召】を発揮したものとして扱う（自分のスピリットのコアが移る） ===")
{
    const s = createGame("bs05-069-tensho", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    // 転召の対象になれる自分のスピリット（コスト5以上・コア3個）
    const victim = putSpirit(s, "p1", "BS04-020", 3) // 闇帝オプス・キュリテ（コスト6）
    s.players.p1.deck.unshift("BS01-002", "BS04-010", "BS01-001")
    const trashCoresBefore = s.players.p1.trashCores
    resolveMagic(s, "p1", "BS05-069", "main")
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === "BS04-010"),
        "【転召】持ちが召喚された",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId),
        "【転召】でコアをすべて失った対象は維持コア割れで消滅する",
    )
    assert(
        s.players.p1.trashCores === trashCoresBefore + 3,
        `転召で移したコア3個がトラッシュへ（実際+${s.players.p1.trashCores - trashCoresBefore}）`,
    )
}

console.log("=== BS05-069：【転召】持ちが無ければ3枚とも破棄され、何も召喚されない ===")
{
    const s = createGame("bs05-069-none", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p1.deck.unshift("BS01-002", "BS01-001", "BS01-050")
    const fieldBefore = s.players.p1.field.spirits.length
    const trashBefore = s.players.p1.trashCards.length
    resolveMagic(s, "p1", "BS05-069", "main")
    assert(s.players.p1.field.spirits.length === fieldBefore, "何も召喚されない")
    assert(
        s.players.p1.trashCards.length === trashBefore + 3,
        `公開した3枚すべてがトラッシュへ（実際+${s.players.p1.trashCards.length - trashBefore}）`,
    )
}

console.log("=== BS05-069：リザーブが足りなければ召喚できない（そのカードも破棄される） ===")
{
    const s = createGame("bs05-069-noreserve", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 0
    s.players.p1.deck.unshift("BS01-002", "BS04-010", "BS01-001")
    const trashBefore = s.players.p1.trashCards.length
    resolveMagic(s, "p1", "BS05-069", "main")
    assert(
        !s.players.p1.field.spirits.some((x) => x.cardId === "BS04-010"),
        "維持コアを置けないので召喚されない",
    )
    assert(
        s.players.p1.trashCards.length === trashBefore + 3,
        "公開した3枚はすべてトラッシュへ",
    )
}

console.log("=== BS05-069（interactive）：候補1枚でも選択が出る（召喚しないを選べる） ===")
{
    const s = createGame("bs05-069-choice", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    s.players.p1.reserve = 10
    s.players.p1.deck.unshift("BS01-002", "BS04-010", "BS01-001")
    resolveMagic(s, "p1", "BS05-069", "main")
    assert(s.pendingChoice !== null, "候補1枚でも選択待ちが立つ（alwaysAsk）")
    assert(s.pendingChoice?.kind === "card", "公開ゾーンからのカード選択")
    assert(s.pendingChoice?.optional === true, "「召喚できる」なのでスキップできる")
    const trashBefore = s.players.p1.trashCards.length
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "スキップできる")
    assert(
        !s.players.p1.field.spirits.some((x) => x.cardId === "BS04-010"),
        "スキップすれば召喚されない",
    )
    assert(
        s.players.p1.trashCards.length === trashBefore + 3,
        `スキップしても公開した3枚は破棄される（実際+${s.players.p1.trashCards.length - trashBefore}）`,
    )
    assert(s.revealedCards === undefined, "公開ゾーンは片付いている")
}

console.log("=== BS05-069（interactive）：選べば召喚される ===")
{
    const s = createGame("bs05-069-pick", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = true
    s.players.p1.reserve = 10
    s.players.p1.deck.unshift("BS01-002", "BS04-010", "BS01-001")
    resolveMagic(s, "p1", "BS05-069", "main")
    const index = s.pendingChoice?.cardIndices?.[0]
    assert(index !== undefined, "選択可能なインデックスがある")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: index! }) === null, "候補を選べる")
    assert(
        s.players.p1.field.spirits.some((x) => x.cardId === "BS04-010"),
        "選んだスピリットが召喚される",
    )
    assert(s.revealedCards === undefined, "公開ゾーンは片付いている")
}
