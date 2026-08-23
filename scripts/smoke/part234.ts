// smoke パート234（「選べない簡略化」の棚卸し・その2。2026-08-24）
//
// 効果文が「各自が選ぶ」「好きな順番で」と書いているのに、実装が固定していた3種。
//
//   BS04-X14 魔界七将パンデミウムLv3「お互い、手札5枚を破棄する」→ 手札の末尾から固定だった
//   BS06-080 颶風高原Lv2「【暴風】で疲労させた相手すべてを**好きな順番で**デッキの下に戻す」→ 記録順固定
//   BS07-062 ブリシンガメンの首飾り「相手のスピリット3体をデッキの上に**好きな順番で**戻す」
//     → 順番以前に、**選択で中断すると1体しか戻らないバグ**があった
//
// どれも非対話（テスト・自動解決）では従来の自動選択を残す。
// 選択の応答は handleAction を直接呼ぶ（helpers.act は対話モードで先に消化してしまうため）
import {
    act,
    assert,
    createGame,
    createInstance,
    declareBlock,
    effectiveCost,
    fireStepTriggers,
    getCard,
    handleAction,
    currentLevel,
    minLevelCores,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    viewFor,
} from "./helpers"
import { loadAllCards } from "../../data/loadCards"
import { displayLevel } from "../../shared/rules"

interface CardRow {
    cardId: string
    name: string
    type?: string
    cost?: number
    family?: string[]
    levels?: { level?: number; cores?: number }[]
    effects?: { levels?: unknown }[]
}
const CARDS = loadAllCards() as unknown as CardRow[]
import type { GameState, PlayerId } from "./helpers"

const BIG = "BS01-004" // ドラグノ偵察兵：Lv1 BP2000
const SMALL = "BS01-001" // ゴラドン：Lv1 BP1000
const KENJU = "BS04-027" // アリゲイド：系統「剣獣」Lv1 BP3000

function setup(name: string, interactive: boolean): GameState {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

const nameOf = (id: string): string => getCard(id).name

console.log("=== パンデミウムLv3：お互いが破棄する手札を自分で選ぶ ===")
{
    const s = setup("pandemium-choose", true)
    s.players.p1.hand = [BIG, SMALL, BIG]
    s.players.p2.hand = [SMALL, BIG, SMALL]

    resolveAction(s, "p1", null, { type: "discardBothHands", count: 1 })
    assert(!!s.pendingChoice, "まず自分（p1）の破棄カードを聞かれる")
    assert(s.pendingChoice!.pid === "p1", `選択者は p1（実際は${s.pendingChoice!.pid}）`)
    assert(s.pendingChoice!.kind === "card" && s.pendingChoice!.cardZone === "hand", "自分の手札から選ぶ")
    // 末尾固定だと index 2 が捨てられる。あえて先頭を選ぶ
    assert(handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "p1 が先頭を破棄")
    assert(s.players.p1.hand.length === 2, "p1 の手札が1枚減る")
    assert(s.players.p1.trashCards[s.players.p1.trashCards.length - 1] === BIG, "選んだ先頭のカードが捨てられた")

    assert(!!s.pendingChoice, "続いて相手（p2）に破棄カードを聞く")
    assert(s.pendingChoice!.pid === "p2", `選択者が p2 に移る（実際は${s.pendingChoice!.pid}）`)
    assert(handleAction(s, "p2", { type: "resolveChoice", cardIndex: 1 }) === null, "p2 が2枚目を破棄")
    assert(!s.pendingChoice, "両者ぶんが済んで選択待ちが解ける")
    assert(s.players.p2.hand.length === 2, "p2 の手札が1枚減る")
    assert(s.players.p2.trashCards[s.players.p2.trashCards.length - 1] === BIG, "p2 が選んだカードが捨てられた")
}

console.log("=== パンデミウムLv3：複数枚でも両者ぶんが最後まで走る ===")
{
    const s = setup("pandemium-multi", true)
    s.players.p1.hand = [BIG, SMALL, BIG, SMALL]
    s.players.p2.hand = [SMALL, BIG, SMALL, BIG]

    resolveAction(s, "p1", null, { type: "discardBothHands", count: 2 })
    let guard = 0
    while (s.pendingChoice && guard++ < 10) {
        const pid = s.pendingChoice.pid
        handleAction(s, pid, { type: "resolveChoice", cardIndex: 0 })
    }
    assert(!s.pendingChoice, "選択待ちが残らない")
    assert(s.players.p1.hand.length === 2, `p1 は2枚破棄した（残り${s.players.p1.hand.length}枚）`)
    assert(s.players.p2.hand.length === 2, `p2 は2枚破棄した（残り${s.players.p2.hand.length}枚）`)
}

console.log("=== パンデミウムLv3：非対話では従来どおり手札の末尾から ===")
{
    const s = setup("pandemium-auto", false)
    s.players.p1.hand = [BIG, SMALL]
    s.players.p2.hand = [SMALL, BIG]
    resolveAction(s, "p1", null, { type: "discardBothHands", count: 1 })
    assert(!s.pendingChoice, "選択は出ない")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === BIG, "p1 は末尾を破棄")
    assert(s.players.p2.hand.length === 1 && s.players.p2.hand[0] === SMALL, "p2 は末尾を破棄")
}

console.log("=== ブリシンガメン：3体すべてがデッキの上に戻る（1体で止まらない） ===")
{
    const s = setup("brisingamen-three", true)
    const a = put(s, "p2", BIG, 1)
    const b = put(s, "p2", SMALL, 1)
    const c = put(s, "p2", BIG, 1)
    const deckBefore = s.players.p2.deck.length

    // 「相手は、相手のスピリット3体をデッキの上に好きな順番で戻す」＝選ぶのは戻される側（p2）
    resolveAction(s, "p1", null, { type: "returnToDeckTop", count: 3, chooserIsTarget: true })
    const picked: string[] = []
    let guard = 0
    while (s.pendingChoice && guard++ < 10) {
        assert(s.pendingChoice.pid === "p2", "選ぶのは戻される側（p2）")
        const id = s.pendingChoice.candidates[0]
        if (id === undefined) break
        picked.push(id)
        handleAction(s, "p2", { type: "resolveChoice", instanceId: id })
    }
    assert(!s.pendingChoice, "選択待ちが残らない")
    assert(s.players.p2.field.spirits.length === 0, `3体すべてが場から消える（残り${s.players.p2.field.spirits.length}体）`)
    assert(s.players.p2.deck.length === deckBefore + 3, "デッキが3枚増える")
    // 候補が2体以上のあいだだけ聞く（最後の1体は選ぶ余地がないので自動）
    assert(picked.length === 2, `2回聞いて3体目は自動（実際は${picked.length}回）`)
    void a
    void b
    void c
}

console.log("=== ブリシンガメン：最後に選んだ1体がデッキの一番上 ===")
{
    const s = setup("brisingamen-order", true)
    const a = put(s, "p2", BIG, 1)
    put(s, "p2", SMALL, 1)
    put(s, "p2", SMALL, 1)

    resolveAction(s, "p1", null, { type: "returnToDeckTop", count: 3, chooserIsTarget: true })
    // a（ドラグノ偵察兵）を最後に選ぶ：まず a 以外を2回選び、最後に a
    let guard = 0
    while (s.pendingChoice && guard++ < 10) {
        const cands = s.pendingChoice.candidates
        const id = cands.find((x) => x !== a) ?? cands[0]
        if (id === undefined) break
        handleAction(s, "p2", { type: "resolveChoice", instanceId: id })
    }
    assert(s.players.p2.deck[0] === BIG, `最後に選んだ個体が一番上（実際は${nameOf(s.players.p2.deck[0] ?? "")}）`)
}

console.log("=== 颶風高原Lv2：デッキの下に戻す順番を選べる ===")
{
    const s = setup("bofu-order", true)
    const a = put(s, "p2", BIG, 1)
    const b = put(s, "p2", SMALL, 1)
    s.bofuExhaustedThisBattle = [
        { pid: "p2", instanceId: a },
        { pid: "p2", instanceId: b },
    ]
    const deckBefore = s.players.p2.deck.length

    resolveAction(s, "p1", null, { type: "returnBofuExhaustedToDeckBottom" })
    assert(!!s.pendingChoice, "戻す順番を聞かれる")
    assert(s.pendingChoice!.pid === "p1", "選ぶのは発揮した側（p1）")
    // 記録順どおりなら a が先。あえて b を先にする
    assert(handleAction(s, "p1", { type: "resolveChoice", instanceId: b }) === null, "b を先に戻す")
    assert(!s.pendingChoice, "残り1体は聞かずに確定する")
    assert(s.players.p2.field.spirits.length === 0, "2体とも場から消える")
    assert(s.players.p2.deck.length === deckBefore + 2, "デッキが2枚増える")
    const deck = s.players.p2.deck
    assert(deck[deck.length - 2] === SMALL, `先に選んだ b が先に下へ入る（実際は${nameOf(deck[deck.length - 2] ?? "")}）`)
    assert(deck[deck.length - 1] === BIG, `後の a がその下（実際は${nameOf(deck[deck.length - 1] ?? "")}）`)
}

console.log("=== 颶風高原Lv2：非対話では従来どおり記録順 ===")
{
    const s = setup("bofu-auto", false)
    const a = put(s, "p2", BIG, 1)
    const b = put(s, "p2", SMALL, 1)
    s.bofuExhaustedThisBattle = [
        { pid: "p2", instanceId: a },
        { pid: "p2", instanceId: b },
    ]
    resolveAction(s, "p1", null, { type: "returnBofuExhaustedToDeckBottom" })
    assert(!s.pendingChoice, "選択は出ない")
    const deck = s.players.p2.deck
    assert(deck[deck.length - 2] === BIG, "記録順（a が先）で戻る")
    assert(deck[deck.length - 1] === SMALL, "同上（b が後）")
}

console.log("=== ニードルショット：疲労させるのは「そのスピリット」＝BP増加した1体が勝ったときだけ ===")
{
    // 効果文は「系統：剣獣の自分のスピリット1体をBP+2000する。**そのスピリットが**、BPを比べ
    // 相手のスピリットだけを破壊したとき、相手のスピリット1体を疲労させる」。
    // 剣獣を2体並べ、**バトルに出ていない側**へBP増加を当てると、勝っても疲労は起きない
    const s = setup("needle-that-spirit", true)
    s.players.p1.reserve = 20
    const attacker = put(s, "p1", KENJU, 1) // アリゲイド（剣獣）Lv1 BP3000
    const bench = put(s, "p1", KENJU, 1) // 場にいるだけの剣獣（BP増加はこちらに当てる）
    const blocker = put(s, "p2", "BS02-014", 1) // ファンタズマ Lv1 BP2000＝一方的に負ける
    const watcher = put(s, "p2", "BS02-014", 1) // 疲労させられる側
    s.players.p1.hand = ["BS07-074"]

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    // マジックの対象はクライアントが castMagic に添えて送る（実対戦と同じ経路）
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: bench }) === null,
        "バトルに出ていない剣獣を対象にニードルショットを使用",
    )

    assert(declareBlock(s, "p2", blocker) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        s.players.p2.field.spirits.every((x) => x.instanceId !== blocker),
        "アタッカーはBP比較で相手だけを破壊している（＝battleWon の他の条件は成立）",
    )
    const watcherInst = s.players.p2.field.spirits.find((x) => x.instanceId === watcher)
    assert(watcherInst?.isRested !== true, "BP増加した個体が勝っていないので疲労させない")
}

console.log("=== ニードルショット：BP増加した1体が勝てば従来どおり疲労させる ===")
{
    const s = setup("needle-that-spirit-hit", true)
    s.players.p1.reserve = 20
    const attacker = put(s, "p1", KENJU, 1)
    put(s, "p1", KENJU, 1) // もう1体の剣獣（今度はこちらを選ばない）
    const blocker = put(s, "p2", "BS02-014", 1)
    const watcher = put(s, "p2", "BS02-014", 1)
    s.players.p1.hand = ["BS07-074"]

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker }) === null, "アタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(
        act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: attacker }) === null,
        "アタッカーを対象にニードルショットを使用",
    )

    assert(declareBlock(s, "p2", blocker) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    const watcherInst = s.players.p2.field.spirits.find((x) => x.instanceId === watcher)
    assert(watcherInst?.isRested === true, "BP増加した個体が勝ったので相手1体が疲労する")
}

console.log("=== 常闇の聖堂Lv1：エンドステップの召喚はコストを支払う ===")
{
    // 効果文は「自分のフィールドのコアを**コストとして使うことで**、トラッシュの『夜族』
    // （コスト3以下）1枚を召喚できる」。コストを一切払わない召喚になっていたのを直した
    // （2026-08-24 ユーザー確認：コストは通常どおり必要で、支払い元にフィールドのコアも使える）
    const cathedral = "BS07-058"
    assert(getCard(cathedral).name === "常闇の聖堂", "BS07-058 は常闇の聖堂")
    const yazoku = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes("夜族") && (c.cost ?? 99) <= 3 && (c.cost ?? 0) >= 1,
    )!
    const maintain = minLevelCores(getCard(yazoku.cardId))

    const s = setup("cathedral-pay", false)
    const nexus = createInstance(cathedral, s.turn, 0) // Lv1
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.trashCards.push(yazoku.cardId)
    // 軽減シンボルが効くので、支払う額は effectiveCost で見る（盤面を組んでから測る）
    const cost = effectiveCost(s, "p1", getCard(yazoku.cardId))
    s.players.p1.reserve = cost + maintain
    s.phase = "end"
    fireStepTriggers(s, "end")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === yazoku.cardId),
        `${yazoku.name}がトラッシュから召喚される`,
    )
    assert(s.players.p1.reserve === 0, `コスト${cost}＋維持コア${maintain}を支払う（残り${s.players.p1.reserve}）`)
    assert(s.players.p1.trashCores === cost, `支払ったコストぶんはトラッシュへ（実際は${s.players.p1.trashCores}）`)
}

console.log("=== 常闇の聖堂Lv1：コアが足りなければ召喚できない ===")
{
    const yazoku = CARDS.find(
        (c) => c.type === "spirit" && (c.family ?? []).includes("夜族") && (c.cost ?? 99) <= 3 && (c.cost ?? 0) >= 1,
    )!
    const maintain = minLevelCores(getCard(yazoku.cardId))

    const s = setup("cathedral-poor", false)
    const nexus = createInstance("BS07-058", s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.trashCards.push(yazoku.cardId)
    const cost = effectiveCost(s, "p1", getCard(yazoku.cardId))
    s.players.p1.reserve = cost + maintain - 1 // 1個足りない
    s.phase = "end"
    fireStepTriggers(s, "end")
    assert(
        s.players.p1.field.spirits.length === 0,
        "コアが足りないので召喚されない（無償召喚だった頃は召喚できていた）",
    )
    assert(s.players.p1.trashCards.includes(yazoku.cardId), "対象はトラッシュに残る")
}

console.log("=== ウッド・ゴレムLv2：Lv2効果は止めるが、レベルそのものは下がらない ===")
{
    // 効果文は「相手のネクサスすべての**Lv2効果は発揮されない**」。
    // 「Lv1として扱う」で代用していたため、画面のレベル表示も1になり、
    // 「Lv1のネクサスを破壊する」（BS03バスターランス）にも当たっていた
    const GOLEM = "BS03-085"
    assert(getCard(GOLEM).name === "ウッド・ゴレム", "BS03-085 はウッド・ゴレム")
    // 相手に置くネクサス：Lv2エントリを持ち、Lv2で2コア以上になるもの
    const nexusCard = CARDS.find(
        (c) =>
            c.type === "nexus" &&
            (c.levels ?? []).some((l) => l.level === 2 && (l.cores ?? 0) >= 1) &&
            (c.effects ?? []).some((e) => Array.isArray(e.levels) && e.levels.includes(2) && !e.levels.includes(1)),
    )!
    const lv2Cores = (nexusCard.levels ?? []).find((l) => l.level === 2)!.cores ?? 1

    const s = setup("woodgolem", false)
    const golemLv2Cores = getCard(GOLEM).levels.find((l) => l.level === 2)!.cores
    const golem = createInstance(GOLEM, s.turn, golemLv2Cores)
    s.players.p1.field.spirits.push(golem)
    const nexus = createInstance(nexusCard.cardId, s.turn, lv2Cores)
    s.players.p2.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)

    assert(currentLevel(golem).level === 2, `ウッド・ゴレム自身はLv2（実際は${currentLevel(golem).level}）`)
    // 効果の発揮判定ではLv1扱い（＝相手ネクサスのLv2効果は出ない）
    assert(currentLevel(nexus).level === 1, "効果の発揮判定ではLv1として扱う")
    // 表示・他カードから見えるレベルは実レベルのまま
    assert(
        displayLevel(nexus).level === 2,
        `見えるレベルはLv2のまま（実際は${displayLevel(nexus).level}）`,
    )

    // 「Lv1のネクサスを破壊する」には当たらない
    // 画面に渡すビューでも実レベルが出る（効果判定専用の置き換えはビューに載せない）
    const viewedNexus = viewFor(s, "p2").players.p2.field.nexuses[0]!
    assert(currentLevel(viewedNexus).level === 2, "ビュー越しに見てもLv2（画面のレベル表示が下がらない）")

    resolveAction(s, "p1", null, { type: "destroyNexus", count: 1, levelFilter: [1] })
    assert(
        s.players.p2.field.nexuses.length === 1,
        "Lv1限定のネクサス破壊では壊れない（Lv2として見えている）",
    )
    resolveAction(s, "p1", null, { type: "destroyNexus", count: 1, levelFilter: [2] })
    assert(s.players.p2.field.nexuses.length === 0, "Lv2限定なら壊れる")
}

console.log("=== ウッド・ゴレム：発生源がいなくなれば置き換えも消える ===")
{
    const nexusCard = CARDS.find(
        (c) => c.type === "nexus" && (c.levels ?? []).some((l) => l.level === 2 && (l.cores ?? 0) >= 1),
    )!
    const lv2Cores = (nexusCard.levels ?? []).find((l) => l.level === 2)!.cores ?? 1
    const s = setup("woodgolem-gone", false)
    const nexus = createInstance(nexusCard.cardId, s.turn, lv2Cores)
    s.players.p2.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    assert(currentLevel(nexus).level === 2, "ウッド・ゴレムがいなければ効果判定でもLv2")
    assert(nexus.levelAsEffectsOnly === undefined, "目印も残らない")
}
