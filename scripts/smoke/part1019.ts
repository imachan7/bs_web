// smoke パート1019（moveCards from:"deck"・shuffleDeck・効果召喚するブレイヴの合体先の選択。BRAVE.md §12.6）
import { answerCoreLevel, assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, resolveAction, runTurnStart, viewFor } from "./helpers"
import type { GameState } from "./helpers"
import type { EffectAction } from "../../server/src/type"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1）
const TODOL = "BS17-030" // トドール（白・コスト3・機獣）
const TENREI = "BS23-040" // 人形遣いの天使マリエル（黄・コスト3）
const BRAVE1 = "BS21-063" // ぐるみパンダ（黄ブレイヴ・コスト4）
const HOST = "BS16-053" // 合体先に使うスピリット（part1014 と同じ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).type === "spirit", "VAN")
    assert(getCard(TODOL).name === "トドール" && getCard(TODOL).type === "spirit", "TODOL")
    assert(getCard(TENREI).name === "人形遣いの天使マリエル" && getCard(TENREI).type === "spirit", "TENREI")
    assert(getCard(BRAVE1).name === "ぐるみパンダ" && getCard(BRAVE1).type === "brave", "BRAVE1")
    assert(getCard(HOST).type === "spirit" && getCard(HOST).cost >= 4, "HOSTはコスト4以上のスピリット")
}

const fromDeck: EffectAction = { type: "moveCards", from: "deck", pick: { cardType: "spirit", nameIncludes: "トドール" }, count: 1, dest: "summon", optional: true }
const seq = (...a: EffectAction[]): EffectAction => ({ type: "sequence", actions: a }) as EffectAction

function game(seed: string, interactive: boolean, deck: string[]): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p1.deck = [...deck]
    s.players.p2.deck = Array.from({ length: 40 }, () => VAN)
    return s
}

const sorted = (a: string[]): string => [...a].sort().join(",")
const mixed = (): string[] => [...Array.from({ length: 10 }, () => VAN), TENREI, TODOL, ...Array.from({ length: 10 }, () => VAN)]

console.log("=== 1. デッキから条件に合う1枚を選んで召喚し、その後シャッフルする ===")
{
    const s = game("deck1", true, mixed())
    const before = sorted(s.players.p1.deck)
    resolveAction(s, "p1", null, seq(fromDeck, { type: "shuffleDeck" }))
    const pc = s.pendingChoice
    assert(pc !== null && pc.kind === "card" && pc.cardZone === "deck" && pc.pid === "p1", "デッキからの選択待ちが立つ")
    assert((pc?.cardIndices ?? []).length === 1 && s.players.p1.deck[pc!.cardIndices![0]!] === TODOL, "候補は条件に合うトドールだけ")
    assert(pc?.optional === true, "「できる」は断れる")
    assert(viewFor(s, "p1").pendingChoice?.cardIds?.[0] === TODOL, "選ぶ本人の view にはデッキの候補が出る")
    const oppView = viewFor(s, "p2").pendingChoice
    assert(oppView?.cardIds === undefined && (oppView?.cardIndices ?? []).length === 0, "相手の view にはデッキの候補が出ない")
    assert(!JSON.stringify(oppView).includes(TODOL), "相手の view にカードIDが漏れない")
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: pc!.cardIndices![0]! })
    answerCoreLevel(s, "p1") // 置くコアの数の待ち
    assert(s.pendingChoice === null, "選択が解決される")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === TODOL), "トドールが召喚された")
    assert(s.players.p1.deck.length === 21 && sorted([...s.players.p1.deck, TODOL]) === before, "デッキは1枚減り、残りは元と同じ中身（シャッフル後）")
}

console.log("=== 2. 候補が無くてもシャッフルは行う ===")
{
    const s = game("deck2", false, Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? VAN : TENREI)))
    const before = sorted(s.players.p1.deck)
    resolveAction(s, "p1", null, seq(fromDeck, { type: "shuffleDeck" }))
    assert(s.players.p1.field.spirits.length === 0, "候補が無いので召喚されない")
    assert(sorted(s.players.p1.deck) === before, "デッキの中身は変わらない")
    assert(s.log.some((l) => l.includes("シャッフル")), "シャッフルは行われる（ログ）")
}

console.log("=== 3. 「できる」を断るとデッキに残り、その後シャッフルは行う ===")
{
    const s = game("deck3", true, mixed())
    const before = sorted(s.players.p1.deck)
    resolveAction(s, "p1", null, seq(fromDeck, { type: "shuffleDeck" }))
    assert(s.pendingChoice?.cardZone === "deck", "選択待ち")
    handleAction(s, "p1", { type: "resolveChoice" })
    assert(s.pendingChoice === null && s.players.p1.field.spirits.length === 0, "断ったので召喚されない")
    assert(sorted(s.players.p1.deck) === before, "カードはデッキに残る")
    assert(s.log.some((l) => l.includes("シャッフル")), "断ってもその後のシャッフルは行う")
}

console.log("=== 4. 非対話ではコスト最大の候補を召喚する ===")
{
    const s = game("deck4", false, mixed())
    resolveAction(s, "p1", null, { type: "moveCards", from: "deck", pick: { cardType: "spirit" }, count: 1, dest: "summon" })
    assert(s.players.p1.field.spirits.length === 1 && [TENREI, TODOL].includes(s.players.p1.field.spirits[0]!.cardId), "コスト3のスピリットが出る")
}

console.log("=== 5. トラッシュから効果召喚したブレイヴの合体先の選択 ===")
{
    const setup = (seed: string): GameState => {
        const s = game(seed, true, mixed())
        s.players.p1.trashCards = [BRAVE1]
        const host = createInstance(HOST, s.turn - 1, 2)
        s.players.p1.field.spirits.push(host)
        refreshLevelAsOverrides(s)
        return s
    }
    const brave: EffectAction = { type: "moveCards", from: "trash", pick: { cardType: "brave" }, count: 1, dest: "summon", optional: true }
    {
        const s = setup("brave1")
        resolveAction(s, "p1", null, brave)
        assert(s.pendingChoice?.cardZone === "trash", "まず召喚するカードの選択")
        handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
        assert(s.pendingChoice?.kind === "target" && s.pendingChoice.candidates.length === 1, "合体先の選択が出る")
        const hostId = s.pendingChoice!.candidates[0]!
        handleAction(s, "p1", { type: "resolveChoice", instanceId: hostId })
        const host = s.players.p1.field.spirits.find((x) => x.instanceId === hostId)!
        assert(s.pendingChoice === null && s.players.p1.field.combinedBraves.length === 1 && (host.braveRefs ?? []).length === 1, "選んだスピリットに合体した")
        assert(!s.players.p1.field.spirits.some((x) => x.cardId === BRAVE1) && s.players.p1.trashCards.length === 0, "スピリット状態では出ていない")
    }
    {
        const s = setup("brave2")
        resolveAction(s, "p1", null, brave)
        handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
        assert(s.pendingChoice?.kind === "target", "合体先の選択が出る")
        handleAction(s, "p1", { type: "resolveChoice" })
        answerCoreLevel(s, "p1")
        assert(s.pendingChoice === null && s.players.p1.field.spirits.some((x) => x.cardId === BRAVE1), "選ばなければスピリット状態で出る")
        assert(s.players.p1.field.combinedBraves.length === 0, "合体していない")
    }
    {
        const s = setup("brave3")
        s.interactiveTargets = false
        resolveAction(s, "p1", null, brave)
        assert(s.pendingChoice === null && s.players.p1.field.spirits.some((x) => x.cardId === BRAVE1), "非対話はスピリット状態で出す")
    }
}

console.log("=== 6. デッキから効果召喚したブレイヴも合体先を選べる ===")
{
    const s = game("brave4", true, [BRAVE1, ...Array.from({ length: 19 }, () => VAN)])
    s.players.p1.field.spirits.push(createInstance(HOST, s.turn - 1, 2))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", null, { type: "moveCards", from: "deck", pick: { cardType: "brave" }, count: 1, dest: "summon", optional: true })
    handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
    assert(s.pendingChoice?.kind === "target", "合体先の選択が出る")
    handleAction(s, "p1", { type: "resolveChoice", instanceId: s.pendingChoice!.candidates[0]! })
    assert(s.players.p1.field.combinedBraves.length === 1 && s.players.p1.deck.length === 19 && !s.players.p1.deck.includes(BRAVE1), "デッキから合体して出た")
}

console.log("=== 7. オープンしたブレイヴを召喚すると合体先の選択が出る ===")
{
    for (const combine of [true, false]) {
        const s = game(`reveal${combine ? "1" : "2"}`, true, mixed())
        s.players.p1.field.spirits.push(createInstance(HOST, s.turn - 1, 2))
        refreshLevelAsOverrides(s)
        s.revealedCards = { pid: "p1", cardIds: [BRAVE1] }
        resolveAction(s, "p1", null, { type: "moveCards", from: "revealed", pick: { cardType: "brave" }, count: 1, dest: "summon", optional: true })
        handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 })
        assert(s.pendingChoice?.kind === "target", "合体先の選択が出る")
        handleAction(s, "p1", combine ? { type: "resolveChoice", instanceId: s.pendingChoice!.candidates[0]! } : { type: "resolveChoice" })
        answerCoreLevel(s, "p1")
        assert(s.pendingChoice === null, "選択が解決される")
        assert(combine ? s.players.p1.field.combinedBraves.length === 1 : s.players.p1.field.spirits.some((x) => x.cardId === BRAVE1), combine ? "選べば合体する" : "選ばなければスピリット状態")
        assert((s.revealedCards?.cardIds.length ?? 0) === 0, "公開ゾーンから抜けている")
    }
}

console.log("=== 8. コストを払うデッキ召喚はリザーブが足りなければデッキに残る ===")
{
    const s = game("deck5", true, mixed())
    s.players.p1.reserve = 2 // トドールはコスト3＋置くコア1
    const before = sorted(s.players.p1.deck)
    resolveAction(s, "p1", null, { type: "moveCards", from: "deck", pick: { cardType: "spirit", nameIncludes: "トドール" }, count: 1, dest: "summon", pay: "cost", optional: true })
    assert(s.pendingChoice === null && s.players.p1.field.spirits.length === 0, "払えないので聞かれず召喚もされない")
    assert(sorted(s.players.p1.deck) === before && s.players.p1.trashCards.length === 0, "カードはデッキに残り、トラッシュへ行かない")
    s.players.p1.reserve = 10
    resolveAction(s, "p1", null, { type: "moveCards", from: "deck", pick: { cardType: "spirit", nameIncludes: "トドール" }, count: 1, dest: "summon", pay: "cost", optional: true })
    assert(s.pendingChoice?.cardZone === "deck", "払えるなら選べる")
}

console.log("すべてのチェックに合格しました 🎉（part1019）")
