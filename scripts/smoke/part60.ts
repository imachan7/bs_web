// smoke パート60（実対戦経路＝ interactiveTargets = true のカバレッジ）
//
// **なぜ必要か**: `state.interactiveTargets` は smoke では既定 false、実対戦では
// server/src/index.ts が true にする。choice を発行するアクションは
//
//     if (state.interactiveTargets) { pendingChoice を立てて中断 }   ← 実対戦はこちら
//     ...自動選択（BP最大など）                                      ← smoke はこちら
//
// という分岐になっており、**既存テストの大半は実対戦では通らない側の分岐を検証している**。
// choice を発行するハンドラは25個あるが、interactiveTargets を有効にしたテストが実在するのは
// destroy / exhaust / discardOpponent / bpBuffByExhaustOwn / recoverMagicFromTrash /
// summonFromHandFree の6個だけだった（part15 の冒頭コメントには coreRemove・returnToHand・
// returnToDeckTop・destroyExhausted も列挙されているが、実際のテストは無かった）。
//
// ここではそのうち、壊れたときの影響が大きいものを押さえる。
import {
    act,
    assert,
    createGame,
    createInstance,
    engineRunTurnStart,
    getCard,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// pendingChoice を「先頭の候補を選ぶ」方針で消化する（実対戦経路が停止しないことの確認用）。
// 戻り値は消化した回数。上限を超えたら無限ループとみなして失敗させる
function drainChoices(s: GameState, limit = 10): number {
    let n = 0
    while (s.pendingChoice) {
        const pc = s.pendingChoice
        const pid = pc.pid
        if (pc.kind === "target") {
            const id = pc.candidates[0]
            if (id === undefined) {
                assert(false, "target choice に候補が入っている")
                break
            }
            act(s, pid, { type: "resolveChoice", instanceId: id })
        } else if (pc.kind === "card") {
            const idx = pc.cardIndices?.[0]
            if (idx === undefined) {
                assert(false, "card choice に選択可能インデックスが入っている")
                break
            }
            act(s, pid, { type: "resolveChoice", cardIndex: idx })
        } else {
            const opt = pc.options?.[0]
            if (opt === undefined) {
                assert(false, "option choice に選択肢が入っている")
                break
            }
            act(s, pid, { type: "resolveChoice", option: opt })
        }
        n++
        assert(n <= limit, `pendingChoice が ${limit} 回以内に消化される（無限ループ検出）`)
        if (n > limit) break
    }
    return n
}

console.log("=== turnStartResumeStep: ターン開始処理が選択待ちで中断しても main まで再開する ===")
{
    // 百識の谷（BS01-099）Lv1: 自分のドローステップに「1枚引く」＋「手札1枚を破棄」。
    // 破棄が interactiveTargets で選択式になると、**ターン開始処理の途中で pendingChoice が立つ**。
    // ここが再開しないと main に到達できず、プレイヤーが何もできないままゲームが止まる。
    // この再開機構（turnStartResumeStep / resumeTurnStart）には既存テストが1件も無かった。
    const s = createGame("resume-turnstart", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    const valley = getCard("BS01-099")
    assert(valley.type === "nexus", `テスト前提: ${valley.name} はネクサス`)
    s.players.p1.field.nexuses.push(createInstance("BS01-099", 1, 1)) // Lv1
    s.interactiveTargets = true

    const handBefore = s.players.p1.hand.length
    // helpers の runTurnStart はテスト用ラッパで「開始後に手札を1枚デッキへ戻す」処理が入るため、
    // 中断が起きるこのケースでは状態が壊れる。ここは素のエンジン実装を直接呼ぶ
    engineRunTurnStart(s)

    assert(s.pendingChoice !== null, "ドローステップの破棄選択でターン開始処理が中断する")
    assert(
        s.resumeStack.some((fr) => fr.kind === "turnStart"),
        "中断位置が再開フレーム（kind:\"turnStart\"）として積まれる",
    )
    assert(s.phase !== "main", "中断中はまだ main に到達していない")

    const drained = drainChoices(s)
    assert(drained >= 1, `選択が消化された（${drained}回）`)
    assert(s.pendingChoice === null, "選択後に pendingChoice が解消される")
    assert(
        !s.resumeStack.some((fr) => fr.kind === "turnStart"),
        "再開フレームが消化されて残っていない",
    )
    assert(s.phase === "main", "ターン開始処理が再開して main まで到達する")
    // 通常ドロー1枚 + 百識の谷e1のドロー1枚 - 破棄1枚 = +1
    assert(
        s.players.p1.hand.length === handBefore + 1,
        `手札は ドロー2枚 - 破棄1枚 で +1（${handBefore} → ${s.players.p1.hand.length}）`,
    )
}

// 相手フィールドにスピリットを2体置いて、対話経路で1体だけが選ばれることを確認する共通形
function twoEnemies(s: GameState, cardId: string, cores: number): [string, string] {
    const a = createInstance(cardId, s.turn, cores)
    const b = createInstance(cardId, s.turn, cores)
    s.players.p2.field.spirits.push(a, b)
    return [a.instanceId, b.instanceId]
}

console.log("=== coreRemove: 候補2体で choice が立ち、選んだ側だけコアが減る ===")
{
    const s = createGame("interactive-coreremove", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const [a, b] = twoEnemies(s, "BS01-002", 3) // ロクケラトプス（Lv3=コア3）
    const find = (id: string) => s.players.p2.field.spirits.find((x) => x.instanceId === id)

    resolveAction(s, "p1", null, { type: "coreRemove", count: 1 })
    assert(s.pendingChoice !== null, "候補2体で pendingChoice が立つ")
    assert(s.pendingChoice?.candidates.length === 2, "候補は2体")
    assert(find(a)?.cores === 3 && find(b)?.cores === 3, "選択待ち中はまだコアが減っていない")

    act(s, "p1", { type: "resolveChoice", instanceId: b })
    assert(s.pendingChoice === null, "選択後に解消される")
    assert(find(a)?.cores === 3, "選ばなかった方のコアは変わらない")
    assert(find(b)?.cores === 2, "選んだ方のコアだけ1個減る")
}

console.log("=== returnToHand: 候補2体で choice が立ち、選んだ側だけ手札に戻る ===")
{
    const s = createGame("interactive-returnhand", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const [a, b] = twoEnemies(s, "BS01-002", 1)
    const handBefore = s.players.p2.hand.length

    resolveAction(s, "p1", null, { type: "returnToHand", count: 1 })
    assert(s.pendingChoice !== null, "候補2体で pendingChoice が立つ")
    assert(s.players.p2.field.spirits.length === 2, "選択待ち中はまだ戻っていない")

    act(s, "p1", { type: "resolveChoice", instanceId: a })
    assert(s.pendingChoice === null, "選択後に解消される")
    const remain = s.players.p2.field.spirits.map((x) => x.instanceId)
    assert(remain.length === 1 && remain[0] === b, "選んだ方だけが場から消える")
    assert(s.players.p2.hand.length === handBefore + 1, "持ち主の手札に1枚戻る")
}

console.log("=== returnToDeckTop: 候補2体で choice が立ち、選んだ側だけデッキトップへ ===")
{
    const s = createGame("interactive-returndeck", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const [a, b] = twoEnemies(s, "BS01-002", 1)
    const deckBefore = s.players.p2.deck.length

    resolveAction(s, "p1", null, { type: "returnToDeckTop" })
    assert(s.pendingChoice !== null, "候補2体で pendingChoice が立つ")

    act(s, "p1", { type: "resolveChoice", instanceId: b })
    assert(s.pendingChoice === null, "選択後に解消される")
    const remain = s.players.p2.field.spirits.map((x) => x.instanceId)
    assert(remain.length === 1 && remain[0] === a, "選んだ方だけが場から消える")
    assert(s.players.p2.deck.length === deckBefore + 1, "デッキが1枚増える")
    assert(s.players.p2.deck[0] === "BS01-002", "デッキトップに戻っている")
}

console.log("=== destroyExhausted: 疲労2体で choice が立ち、選んだ側だけ破壊される ===")
{
    const s = createGame("interactive-destroyexh", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const [a, b] = twoEnemies(s, "BS01-002", 1)
    for (const x of s.players.p2.field.spirits) x.isRested = true

    resolveAction(s, "p1", null, { type: "destroy", count: 1, filter: { rested: true } })
    assert(s.pendingChoice !== null, "疲労候補2体で pendingChoice が立つ")
    assert(s.players.p2.field.spirits.length === 2, "選択待ち中はまだ破壊されていない")

    act(s, "p1", { type: "resolveChoice", instanceId: a })
    assert(s.pendingChoice === null, "選択後に解消される")
    const remain = s.players.p2.field.spirits.map((x) => x.instanceId)
    assert(remain.length === 1 && remain[0] === b, "選んだ方だけが破壊される")
}

console.log("=== 対話経路でも choice は必ず消化され、ゲームが停止しない ===")
{
    // destroy count:2 は「1体選択 → 残りを queue へ積んで再度選択」という再入経路を通る。
    // ここが詰まると実対戦でゲームが進行不能になるため、drainChoices で完走を確認する
    const s = createGame("interactive-drain", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    const a = createInstance("BS01-002", s.turn, 1)
    const b = createInstance("BS01-002", s.turn, 1)
    const c = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(a, b, c)

    resolveAction(s, "p1", null, { type: "destroy", count: 2 })
    const drained = drainChoices(s)
    assert(drained === 2, `2体ぶんの選択が連続して発生し消化される（${drained}回）`)
    assert(s.pendingChoice === null, "最後に pendingChoice は残らない")
    assert(s.players.p2.field.spirits.length === 1, "2体が破壊され1体だけ残る")
}
