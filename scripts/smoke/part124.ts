// smoke パート124（第六弾 BS06 バッチ1：新キーワード【激突】【暴風】）
//
// 新設した機構:
//   - Keyword "bofu"（【暴風：N】）＋ exhaust の chooserIsTarget
//     「相手は、相手のスピリットN体を疲労させる」＝**疲労させられる側が対象を選ぶ**。
//     実対戦では PendingChoice.pid＝相手／actorPid＝発生源の持ち主 に分ける
//     （tryInteractiveTargetChoice に chooserPid を追加）
//   - 【激突】は BS01-05 に保持カードが1枚も無く動作実績がなかった。
//     BS06 で初めてカードが入るので、ここで実際に機能することを確認する
// 実装したカード（BS06 バッチ1）:
//   - BS06-003 猛角獣ホーングリズリー（【激突】のみ）
//   - BS06-012 巨竜ギガノトン（【激突】＋Lv2･Lv3 アタック時にBP4000以下を破壊）
//   - BS06-028 ガブノハシ（【暴風：1】）
//   - BS06-033 ジャコビーノ男爵（【暴風：1】＋Lv2 アタック時に「樹魔」1体につきBP+1000）
//   - BS06-036 牙王樹ラフレシオー（【暴風：2】＋Lv3 ライフを減らしたとき相手1体を疲労）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    getCard,
    hasKeyword,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS06-003").name === "猛角獣ホーングリズリー", "BS06-003 は猛角獣ホーングリズリー")
    assert(getCard("BS06-012").name === "巨竜ギガノトン", "BS06-012 は巨竜ギガノトン")
    assert(getCard("BS06-028").name === "ガブノハシ", "BS06-028 はガブノハシ")
    assert(getCard("BS06-033").name === "ジャコビーノ男爵", "BS06-033 はジャコビーノ男爵")
    assert(getCard("BS06-036").name === "牙王樹ラフレシオー", "BS06-036 は牙王樹ラフレシオー")
    assert(hasKeyword("BS06-003", "clash"), "猛角獣ホーングリズリーは【激突】を持つ")
    assert(hasKeyword("BS06-028", "bofu"), "ガブノハシは【暴風】を持つ")
    assert(getCard("BS06-033").family.includes("爪鳥"), "ジャコビーノ男爵は系統「爪鳥」")
    assert(getCard("BS01-050").family.includes("樹魔") === false, "BS01-050 は樹魔でない（カウント対象外の確認用）")
}

console.log("=== 【激突】：ブロックできる相手がいるならライフで受けられない ===")
{
    const s = createGame("t124-clash-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-003", 1) // Lv1 でも【激突】を持つ
    const blocker = put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")

    assert(takeLifeAndResolve(s, "p2") !== null, "【激突】によりライフで受けられない")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックはできる")
}

console.log("=== 【激突】：ブロックできる相手がいなければライフで受けられる（「可能ならば」） ===")
{
    const s = createGame("t124-clash-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-003", 1)
    const blocker = put(s, "p2", "BS01-001", 1)
    blocker.isRested = true // 疲労していてブロックできない
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "ブロックできる個体がいなければライフで受けられる")
}

console.log("=== 【激突】を持たないアタッカーはライフで受けられる（対照） ===")
{
    const s = createGame("t124-clash-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS01-001", 1) // ゴラドン＝激突なし
    put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "【激突】がなければライフで受けられる")
}

console.log("=== BS06-012 巨竜ギガノトン Lv2：【激突】＋アタック時にBP4000以下を破壊 ===")
{
    const s = createGame("t124-giganoton", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-012", 3) // Lv2
    assert(currentLevel(attacker).level === 2, `ギガノトンは3コアでLv2（実際: ${String(currentLevel(attacker).level)}）`)
    const weak = put(s, "p2", "BS01-001", 1) // ゴラドン Lv1（BP1000）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === weak.instanceId),
        "アタック時にBP4000以下の相手が破壊される",
    )
}

console.log("=== BS06-028 ガブノハシ【暴風：1】：ブロックされたとき、相手が自分のスピリット1体を疲労させる ===")
{
    const s = createGame("t124-bofu-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-028", 1)
    const blocker = put(s, "p2", "BS01-031", 4) // デス・ハーデス Lv2（ブロック宣言で疲労する）
    const other = put(s, "p2", "BS01-001", 1) // 疲労させられる候補（回復状態）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")

    // 自動解決（非interactive）では相手フィールドの回復状態からBP最大が疲労する
    assert(other.isRested === true, "【暴風：1】で相手のスピリット1体が疲労する")
    assert(
        s.players.p1.field.spirits.every((x) => !x.isRested || x.instanceId === attacker.instanceId),
        "疲労するのは相手側であって自分側ではない",
    )
}

console.log("=== 【暴風】：実対戦では疲労させられる側が対象を選ぶ ===")
{
    const s = createGame("t124-bofu-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-028", 1)
    const blocker = put(s, "p2", "BS01-031", 4)
    const a = put(s, "p2", "BS01-001", 1)
    const b = put(s, "p2", "BS01-005", 1) // 候補を2体にして選択待ちにする
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    s.interactiveTargets = true
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")

    assert(s.pendingChoice !== null, "対象の選択待ちになる")
    assert(s.pendingChoice?.pid === "p2", "選ぶのは疲労させられる側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "効果を解決するのは発生源の持ち主（p1）")

    // p2 が自分で「どちらを疲労させるか」を選ぶ
    assert(act(s, "p2", { type: "resolveChoice", instanceId: b.instanceId }) === null, "p2 が対象を選ぶ")
    assert(b.isRested === true, "選ばれた側が疲労する")
    assert(a.isRested === false, "選ばれなかった側は疲労しない")
}

console.log("=== BS06-036 牙王樹ラフレシオー【暴風：2】：2体まとめて疲労させる ===")
{
    const s = createGame("t124-bofu-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-036", 1)
    const blocker = put(s, "p2", "BS01-031", 4)
    const a = put(s, "p2", "BS01-001", 1)
    const b = put(s, "p2", "BS01-005", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(a.isRested && b.isRested, "【暴風：2】で相手のスピリット2体が疲労する")
}

console.log("=== BS06-033 ジャコビーノ男爵 Lv2：アタック時に「樹魔」1体につきBP+1000 ===")
{
    const s = createGame("t124-jacobino", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-033", 3) // Lv2（BP6000）
    assert(currentLevel(attacker).level === 2, `ジャコビーノ男爵は3コアでLv2（実際: ${String(currentLevel(attacker).level)}）`)
    put(s, "p1", "BS06-028", 1) // ガブノハシ＝樹魔
    put(s, "p1", "BS06-036", 1) // 牙王樹ラフレシオー＝樹魔
    const before = effectiveBp(s, "p1", attacker)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(
        effectiveBp(s, "p1", attacker) === before + 2000,
        `「樹魔」2体ぶんBP+2000（実際: +${String(effectiveBp(s, "p1", attacker) - before)}）`,
    )
}
