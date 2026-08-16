// smoke パート96（「メイン：〈固有効果〉／フラッシュ：〈BP+N〉」構造のマジックのうち、
// メイン側が未実装だった5枚を実装：レベル読み替え系3枚＋誘発の移し替え2枚）
//
// - BS03-137 フォーカード／BS04-107 ジャッジメントライツ：levelAs の target:"opponentSpiritsAll" 新設
// - BS02-111 スピリットイリュージョン：levelAs の target:"allSpiritsByChosenColor" 新設（色choice→貸与）
// - BS01-149 アタックシフト：blockTriggersAsAttackAllThisTurn（attackTriggersAsBlockThisTurnの逆方向・全体版）
// - BS03-143 ブリッツ：effectGrant(lentOnly) + 新action voidCoreToOwnTrash
// いずれも既存の lendSelfThisTurn（マジック自身をこのターンだけ仮想発生源として場に置く器）を使う。
import { act, assert, createGame, createInstance, currentLevel, effectiveBp, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== BS03-137 フォーカード：四道4体以上でメインを使うと、相手のスピリットすべてがLv1として扱われる ===")
{
    const s = setup("fourcard-main")
    for (let i = 0; i < 4; i++) put(s, "p1", "BS02-056", 1) // アルカナビースト・ケン（四道）Lv1 ×4
    const enemy = put(s, "p2", "BS01-002", 3) // ロクケラトプス Lv3（BP4000）
    assert(currentLevel(enemy).level === 3, "使用前：相手スピリットはLv3のまま")
    assert(effectiveBp(s, "p2", enemy) === 4000, "使用前：実効BPもLv3相当（4000）")

    s.players.p1.hand = ["BS03-137"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "四道4体以上でメインを使用できる")
    assert(s.players.p1.turnVirtualInstances.length === 1, "仮想発生源が1件立つ")
    assert(currentLevel(enemy).level === 1, "使用後：相手スピリットはLv1として扱われる")
    assert(effectiveBp(s, "p2", enemy) === 1000, "使用後：実効BPもLv1相当（1000）に落ちる")
}

console.log("--- 四道が3体以下だと発動しない（条件ゲート）＝マジックを使わなければ従来どおり ---")
{
    const s = setup("fourcard-condition-unmet")
    for (let i = 0; i < 3; i++) put(s, "p1", "BS02-056", 1) // 四道3体のみ
    const enemy = put(s, "p2", "BS01-002", 3)

    s.players.p1.hand = ["BS03-137"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用自体はできる（条件未成立で不発）")
    assert(s.players.p1.turnVirtualInstances.length === 0, "条件未成立のため仮想発生源は立たない")
    assert(currentLevel(enemy).level === 3, "相手スピリットはLv3のまま（従来どおり＝恒久化していない）")
}

console.log("=== BS04-107 ジャッジメントライツ：シンボル2つ以上を持つスピリットがいればメインで相手をLv1化 ===")
{
    const s = setup("judgmentlights-main")
    put(s, "p1", "BS04-055", 1) // 光帝リュミエール（シンボル黄×2）Lv1
    const enemy = put(s, "p2", "BS01-002", 3)

    s.players.p1.hand = ["BS04-107"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "シンボル2つ以上のスピリットがいればメインで使用できる")
    assert(currentLevel(enemy).level === 1, "相手スピリットはLv1として扱われる")
    assert(effectiveBp(s, "p2", enemy) === 1000, "実効BPも1000に落ちる")
}

console.log("--- シンボル2つ以上のスピリットがいないと不発 ---")
{
    const s = setup("judgmentlights-condition-unmet")
    put(s, "p1", "BS01-001", 1) // ゴラドン（シンボル赤×1のみ）
    const enemy = put(s, "p2", "BS01-002", 3)

    s.players.p1.hand = ["BS04-107"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "使用自体はできる（条件未成立で不発）")
    assert(s.players.p1.turnVirtualInstances.length === 0, "条件未成立のため仮想発生源は立たない")
    assert(currentLevel(enemy).level === 3, "相手スピリットはLv3のまま")
}

console.log("=== BS02-111 スピリットイリュージョン：色を1つ選ぶと、その色のスピリットだけが最高Lv扱いになる ===")
{
    const s = setup("spiritillusion-color")
    const red = put(s, "p1", "BS01-002", 1) // ロクケラトプス（赤）Lv1（最高Lv3・BP4000）
    const green = put(s, "p2", "BS01-054", 1) // ショックイーター（緑）Lv1（最高Lv2・BP4000）
    assert(currentLevel(red).level === 1 && currentLevel(green).level === 1, "使用前：両者ともLv1")

    s.players.p1.hand = ["BS02-111"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(s.pendingChoice !== null && s.pendingChoice.kind === "option", "色選択のpendingChoiceが立つ")
    assert((s.pendingChoice?.options ?? []).includes("赤"), "選択肢に「赤」が含まれる")

    assert(act(s, "p1", { type: "resolveChoice", option: "赤" }) === null, "色「赤」を選ぶ")
    assert(s.players.p1.turnVirtualInstances.length === 1, "仮想発生源が1件立つ")
    assert(currentLevel(red).level === 3, "赤スピリットは最高Lv（3）として扱われる")
    assert(effectiveBp(s, "p1", red) === 4000, "赤スピリットの実効BPも最高Lv相当（4000）")
    assert(currentLevel(green).level === 1, "選ばなかった緑スピリットはLv1のまま（別色は変わらない）")
    assert(effectiveBp(s, "p2", green) === 3000, "緑スピリットの実効BPもLv1のまま（3000）")
}

console.log("=== BS01-149 アタックシフト：『ブロック時』効果が『アタック時』に発揮される ===")
{
    const s = setup("attackshift-fires-on-attack")
    const attacker = put(s, "p1", "BS01-081", 1) // 銀燐竜ニーズホッグ：Lv1･Lv2『ブロック時』BP+4000

    s.players.p1.hand = ["BS01-149"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(attacker.tempBpBuff === 0, "アタック宣言前はまだ+0")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックを宣言する")
    assert(attacker.tempBpBuff === 4000, "『ブロック時』のBP+4000がアタック時に発揮される")
}

console.log("--- アタックシフト適用中は『ブロック時』には発揮されない ---")
{
    const s = setup("attackshift-not-on-block")
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン（バニラ）
    const blocker = put(s, "p2", "BS01-081", 1) // 銀燐竜ニーズホッグ：Lv1『ブロック時』BP+4000

    s.players.p1.hand = ["BS01-149"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "p1がメインで使用（自分のカードだが両陣営に効く）")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(blocker.tempBpBuff === 0, "ブロック時には発揮されない（移し替え済みのため+0のまま）")
}

console.log("--- マジックを使わなければ従来どおりブロック時に発揮される（逆ケース・lentOnly回帰） ---")
{
    const s = setup("attackshift-baseline")
    const attacker = put(s, "p1", "BS01-001", 1)
    const blocker = put(s, "p2", "BS01-081", 1)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "p2がブロック")
    assert(blocker.tempBpBuff === 4000, "マジック未使用ではブロック時に通常どおりBP+4000する")
}

console.log("=== BS03-143 ブリッツ：【粉砕】持ちのアタック時、ボイドからコア1個を自分のトラッシュに置く ===")
{
    const s = setup("blitz-main")
    const attacker = put(s, "p1", "BS03-076", 1) // 爪剣のラザラス（【粉砕】）Lv1

    s.players.p1.hand = ["BS03-143"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "メインで使用できる")
    assert(s.players.p1.turnVirtualInstances.length === 1, "仮想発生源が1件立つ")
    const before = s.players.p1.trashCores
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【粉砕】持ちがアタックする")
    assert(s.players.p1.trashCores === before + 1, "ボイドからコア1個が自分のトラッシュに置かれる")
}

console.log("--- マジックを使わなければ【粉砕】アタックでもコアは増えない（逆ケース・lentOnly回帰） ---")
{
    const s = setup("blitz-baseline")
    const attacker = put(s, "p1", "BS03-076", 1)
    const before = s.players.p1.trashCores

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "【粉砕】持ちがアタックする")
    assert(s.players.p1.trashCores === before, "マジック未使用ではトラッシュのコアは増えない")
}
