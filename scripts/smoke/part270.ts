// smoke パート270（自動選択の解消 その2：コアの取り先・手札の破棄先・指定・順番）
//
// docs/design/PROCEDURES_AUDIT.md §5 の一般則（2026-09-02 ユーザー確定）に沿って、
// 実装が勝手に決めていた4か所を選択式にしたぶんの検査。非対話は従来の自動選択のまま。
// ⚠️ cardId はハードコードせず、名前でカードデータから引いて機械検証する。
import { act, assert, createGame, createInstance, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import type { EffectAction } from "../../server/src/type"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}
// カードの効果からアクションを取り出す（timing 指定があればその効果を選ぶ）
const actionOf = (name: string, timing?: "main" | "flash"): EffectAction => {
    const e = byName(name).effects.find(
        (x) => (timing === undefined || (x.kind === "magic" && x.timing === timing)) && "action" in x,
    )
    assert(e !== undefined && "action" in e, `テスト前提: ${name} にアクションがある`)
    return (e as { action: EffectAction }).action
}
const anySpirit = ALL_CARDS.filter((c) => c.type === "spirit")
const anyNexus = ALL_CARDS.filter((c) => c.type === "nexus")
assert(anySpirit.length >= 5 && anyNexus.length >= 2, "テスト前提: スピリット5種・ネクサス2種以上いる")

function game(interactive: boolean): GameState {
    const s = createGame("auto-choice-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== §A エナジードレイン：相手のネクサスかリザーブか、取り先を選ぶ ===")
{
    const action = actionOf("エナジードレイン", "main")

    const s = game(true)
    const nexus = putNexus(s, "p2", anyNexus[0]!.cardId, 3)
    s.players.p2.reserve = 5
    resolveAction(s, "p1", null, action)
    assert(s.pendingChoice?.kind === "option", "取り先の選択待ちが立つ")
    assert((s.pendingChoice?.options ?? []).length === 2, "候補はネクサスとリザーブの2つ")
    const reserveOption = (s.pendingChoice?.options ?? []).find((o) => o.startsWith("リザーブ"))
    assert(reserveOption !== undefined, "リザーブが選択肢に出る")
    assert(act(s, "p1", { type: "resolveChoice", option: reserveOption! }) === null, "リザーブを選ぶ")
    assert(s.players.p2.reserve === 4, "リザーブからコアが減る")
    assert(nexus.cores === 3, "選ばなかったネクサスは減らない")

    // 非対話：従来どおりコア数最多のネクサスから取る
    const s2 = game(false)
    const nexus2 = putNexus(s2, "p2", anyNexus[0]!.cardId, 3)
    s2.players.p2.reserve = 5
    resolveAction(s2, "p1", null, action)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(nexus2.cores === 2, "従来どおりネクサスから取る")
}

console.log("=== §B トリックプランク：デッキの下に戻す5枚を、選んだ順に積む ===")
{
    const action = actionOf("トリックプランク", "main")
    const ids = anySpirit.slice(0, 6).map((c) => c.cardId)

    const s = game(true)
    s.players.p1.trashCards = [...ids]
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", null, action)
    // 5枚ぶん、1枚ずつ選ばせる
    const pickedOrder: string[] = []
    for (let i = 0; i < 5; i++) {
        assert(s.pendingChoice?.kind === "card", `${i + 1}枚目の選択待ちが立つ`)
        const idx = (s.pendingChoice?.cardIndices ?? [])[0]
        assert(idx !== undefined, `${i + 1}枚目の候補がある`)
        pickedOrder.push(s.players.p1.trashCards[idx as number]!)
        assert(act(s, "p1", { type: "resolveChoice", cardIndex: idx as number }) === null, `${i + 1}枚目を選ぶ`)
    }
    assert(s.pendingChoice === null, "5枚選び終えたら選択待ちは無くなる")
    assert(s.players.p1.deck.length === deckBefore + 5, "デッキが5枚増える")
    assert(
        s.players.p1.deck.slice(-5).join(",") === pickedOrder.join(","),
        "**選んだ順**でデッキの下に積まれる（好きな順番で戻せる）",
    )
    assert(s.players.p1.trashCards.length === 1, "トラッシュからは5枚減る")

    // 非対話：従来どおり末尾（新しい方）からその順で戻す
    const s2 = game(false)
    s2.players.p1.trashCards = [...ids]
    const deckBefore2 = s2.players.p1.deck.length
    resolveAction(s2, "p1", null, action)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(s2.players.p1.deck.length === deckBefore2 + 5, "デッキが5枚増える")
    assert(s2.players.p1.deck.slice(-5).join(",") === [...ids].reverse().slice(0, 5).join(","), "従来どおり末尾から順に戻す")
}

console.log("=== §C 機織のハーフェレシテ：破棄する手札のネクサスを選ぶ ===")
{
    const action = actionOf("機織のハーフェレシテ")
    const self = put(game(true), "p1", byName("機織のハーフェレシテ").cardId, 1) // 型合わせ用（下で作り直す）
    assert(self !== undefined, "テスト前提: 機織のハーフェレシテを場に置ける")

    const s = game(true)
    const source = put(s, "p1", byName("機織のハーフェレシテ").cardId, 1)
    s.players.p1.hand = [anyNexus[0]!.cardId, anySpirit[0]!.cardId, anyNexus[1]!.cardId]
    const coresBefore = source.cores
    resolveAction(s, "p1", source, action)
    assert(s.pendingChoice?.kind === "card", "破棄するネクサスカードの選択待ちが立つ")
    assert((s.pendingChoice?.cardIndices ?? []).length === 2, "候補は手札のネクサス2枚だけ（スピリットは出ない）")
    assert(act(s, "p1", { type: "resolveChoice", cardIndex: 2 }) === null, "2枚目のネクサスを選ぶ")
    assert(s.players.p1.trashCards.includes(anyNexus[1]!.cardId), "選んだネクサスが破棄される")
    assert(s.players.p1.hand.includes(anyNexus[0]!.cardId), "選ばなかったネクサスは手札に残る")
    assert(source.cores === coresBefore + 1, "ボイドからコアが置かれる")

    // 非対話：従来どおり手札の先頭側のネクサスを破棄する
    const s2 = game(false)
    const source2 = put(s2, "p1", byName("機織のハーフェレシテ").cardId, 1)
    s2.players.p1.hand = [anyNexus[0]!.cardId, anySpirit[0]!.cardId, anyNexus[1]!.cardId]
    resolveAction(s2, "p1", source2, action)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(s2.players.p1.trashCards.includes(anyNexus[0]!.cardId), "従来どおり先頭側を破棄する")
}

console.log("=== §D スクルディア：回復できなくする相手のスピリットを選ぶ ===")
{
    const action = actionOf("スクルディア")
    // e2（fieldEvent）のアクションを取る
    const skur = byName("スクルディア")
    const e2 = skur.effects.find((e) => e.kind === "fieldEvent")
    assert(e2 !== undefined && "action" in e2, "テスト前提: スクルディアは fieldEvent 効果を持つ")
    const markAction = (e2 as { action: EffectAction }).action
    assert(action !== undefined, "テスト前提: アクションを取り出せる")

    const s = game(true)
    const self = put(s, "p1", skur.cardId, 3)
    const a = put(s, "p2", anySpirit[0]!.cardId, 1)
    const b = put(s, "p2", anySpirit[1]!.cardId, 1)
    a.isRested = true
    b.isRested = true
    resolveAction(s, "p1", self, markAction)
    assert(s.pendingChoice?.kind === "target", "指定する相手スピリットの選択待ちが立つ")
    assert(s.pendingChoice?.candidates.length === 2, "候補は疲労状態の2体")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b.instanceId }) === null, "2体目を指定する")
    assert(self.noRefreshTargetInstanceId === b.instanceId, "選んだスピリットが指定される")

    // 非対話：従来どおり実効BP最大を自動選択
    const s2 = game(false)
    const self2 = put(s2, "p1", skur.cardId, 3)
    const a2 = put(s2, "p2", anySpirit[0]!.cardId, 1)
    a2.isRested = true
    resolveAction(s2, "p1", self2, markAction)
    assert(s2.pendingChoice === null, "非対話では選択待ちが立たない")
    assert(self2.noRefreshTargetInstanceId === a2.instanceId, "従来どおり自動選択される")
}

console.log("=== §E 探偵ペンタン：「内容を見ないで選ぶ」はランダム（先頭固定にしない） ===")
{
    const pentan = byName("探偵ペンタン")
    const e1 = pentan.effects.find((e) => e.kind === "step")
    assert(e1 !== undefined && "action" in e1, "テスト前提: 探偵ペンタンは『スタートステップ』効果を持つ")
    const action = (e1 as { action: EffectAction }).action
    const costCardName = (action as { cardName?: string }).cardName
    assert(costCardName !== undefined, "テスト前提: コストに破棄するカード名がある")
    const costCard = byName(costCardName!)

    // 相手の手札を5枚にして何度も回し、**先頭以外も選ばれる**ことを見る
    // （ランダムなので「必ず先頭以外」は言えない。20回まわして1度も動かなければ固定と判断する）
    const hand = anySpirit.slice(0, 5).map((c) => c.cardId)
    const seen = new Set<string>()
    for (let i = 0; i < 20; i++) {
        const s = game(false)
        const self = put(s, "p1", pentan.cardId, 1)
        s.players.p1.hand = [costCard.cardId]
        s.players.p2.hand = [...hand]
        resolveAction(s, "p1", self, action)
        const peeked = s.players.p1.peekedOpponentCardIds?.[0]
        assert(peeked !== undefined && hand.includes(peeked), "見たカードは相手の手札のどれか")
        seen.add(peeked!)
    }
    assert(seen.size >= 2, `20回で2種類以上が選ばれる（先頭固定ではない。実際: ${seen.size}種類）`)
}

console.log("すべてのチェックに合格しました 🎉（part270）")
