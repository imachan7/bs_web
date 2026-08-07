// smoke パート115（§5-C-3「アタック時→ブロック時」の読み替え：継続版）
//
// ターン限定の器（CardInstance.attackTriggersAsBlockThisTurn＝ブレイブチャージ／
// GameState.blockTriggersAsAttackThisTurn＝アタックシフト）はあったが、
// 「発生源が場にある間ずっと」の継続版が無く2枚が未実装だった。
//
// 新設した機構:
//   - kind:"attackTriggersAsBlockGrant"（『アタック時』効果を『ブロック時』へ**移し替え**る継続付与。
//     target:"anyAll" で両陣営が対象。fireTrigger が hasAttackTriggersAsBlock 経由で参照）
//   - kind:"koboOnBlock"（【光芒】を『ブロック時』**にも**発揮させる。funsaiOnBlock の光芒版）
// 実装したカード:
//   - BS04-007 ドラグノ近衛兵 Lv1･Lv2（相手のアタックステップ中、「竜人」のアタック時効果をブロック時に）
//   - BS03-110 星降る巡礼地 Lv2（自分のスピリットの【光芒】をブロック時にも）
import {
    assert,
    act,
    declareBlock,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS04-007").name === "ドラグノ近衛兵", "BS04-007 はドラグノ近衛兵")
    assert(getCard("BS03-110").name === "星降る巡礼地", "BS03-110 は星降る巡礼地")
    assert(getCard("BS01-004").name === "ドラグノ偵察兵", "BS01-004 はドラグノ偵察兵")
    assert(getCard("BS01-004").family.includes("竜人"), "ドラグノ偵察兵は系統「竜人」")
    assert(getCard("BS01-001").name === "ゴラドン" && !getCard("BS01-001").family.includes("竜人"), "BS01-001 は竜人でない")
    assert(getCard("BS03-070").name === "天使長エクスシア", "BS03-070 は天使長エクスシア（光芒持ち）")
}

console.log("=== BS04-007 Lv1：相手のアタックステップ中、竜人の『アタック時』はブロック時に発揮される ===")
{
    // p2 のターン。p1（ドラグノ近衛兵の持ち主）から見て『相手のアタックステップ』
    const s = createGame("bs04-007-block", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    putSpirit(s, "p1", "BS04-007", 1) // ドラグノ近衛兵 Lv1（読み替えの発生源）
    const blocker = putSpirit(s, "p1", "BS01-004", 1) // ドラグノ偵察兵（竜人・アタック時BP+2000）
    const attacker = putSpirit(s, "p2", "BS01-050", 1)
    const baseBp = effectiveBp(s, "p1", blocker)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手がアタックできる")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ドラグノ偵察兵でブロックできる")
    assert(
        effectiveBp(s, "p1", blocker) === baseBp + 2000,
        `ブロック時に『アタック時』効果が発揮される（実際${effectiveBp(s, "p1", blocker) - baseBp}）`,
    )
}

console.log("=== BS04-007：竜人でないスピリットには読み替えが効かない ===")
{
    const s = createGame("bs04-007-nofamily", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    putSpirit(s, "p1", "BS04-007", 1)
    const blocker = putSpirit(s, "p1", "BS01-013", 3) // タウロスナイト（竜人でない）
    const attacker = putSpirit(s, "p2", "BS01-050", 1)
    const baseBp = effectiveBp(s, "p1", blocker)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロックできる")
    assert(effectiveBp(s, "p1", blocker) === baseBp, "竜人でなければ何も起きない（familyFilter）")
}

console.log("=== BS04-007：読み替えは移し替えなので、アタック時には発揮されなくなる ===")
{
    // p1 のターン（＝発生源から見て『自分のアタックステップ』）では phaseTurn 条件を満たさないため
    // 読み替えは起きず、アタック時に通常どおり発揮される
    const s = createGame("bs04-007-ownturn", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putSpirit(s, "p1", "BS04-007", 1)
    const scout = putSpirit(s, "p1", "BS01-004", 1)
    const baseBp = effectiveBp(s, "p1", scout)
    assert(act(s, "p1", { type: "attack", instanceId: scout.instanceId }) === null, "アタックできる")
    assert(
        effectiveBp(s, "p1", scout) === baseBp + 2000,
        "『自分のアタックステップ』では読み替えが起きず、アタック時に発揮される（phaseTurn）",
    )
}

console.log("=== BS04-007：発生源がいなければ従来どおり（ブロックしてもアタック時効果は出ない） ===")
{
    const s = createGame("bs04-007-nosource", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    const blocker = putSpirit(s, "p1", "BS01-004", 1) // 発生源なし
    const attacker = putSpirit(s, "p2", "BS01-050", 1)
    const baseBp = effectiveBp(s, "p1", blocker)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロックできる")
    assert(effectiveBp(s, "p1", blocker) === baseBp, "ドラグノ近衛兵がいなければ読み替えは起きない")
}

console.log("=== BS03-110 Lv2：自分のスピリットの【光芒】がブロック時にも発揮される ===")
{
    const s = createGame("bs03-110-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", "BS03-110", 4) // 星降る巡礼地 Lv2
    const blocker = putSpirit(s, "p1", "BS03-070", 1) // 天使長エクスシア（Lv1から光芒）
    const attacker = putSpirit(s, "p2", "BS01-050", 1)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "相手がアタックできる")
    // ブロック宣言→フラッシュでブロッカー側がマジックを使う→バトル解決で手札に戻ることを見る
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロックできる")
    s.players.p1.hand = ["BS01-132"]
    const handBefore = s.players.p1.hand.length
    resolveMagic(s, "p1", "BS01-132", "flash", blocker.instanceId)
    s.players.p1.hand.pop() // 使用したマジックは手札から抜けてトラッシュへ、という前提を作る
    s.players.p1.trashCards.push("BS01-132")
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        s.players.p1.hand.includes("BS01-132"),
        "ブロッカー側で使ったマジックが【光芒】で手札に戻る",
    )
    assert(s.players.p1.hand.length === handBefore, "枚数も戻っている")
}

console.log("=== BS03-110 Lv1：ブロック時の【光芒】は発揮されない（levels:[2]） ===")
{
    const s = createGame("bs03-110-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p2"
    s.phase = "attack"
    putNexus(s, "p1", "BS03-110", 0) // Lv1
    const blocker = putSpirit(s, "p1", "BS03-070", 1)
    const attacker = putSpirit(s, "p2", "BS01-050", 1)
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "ブロックできる")
    resolveMagic(s, "p1", "BS01-132", "flash", blocker.instanceId)
    s.players.p1.trashCards.push("BS01-132")
    const handBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.hand.length === handBefore, "Lv1ではブロック時に光芒が発揮されない")
}
