// smoke パート334（011ミーアバット：手札から使うフラッシュ。kind:"handActivated" / GameAction "useHandAbility"）
//
// 「手札にあるこのカードを破棄することで」使う能力は前例なし。検証（validateHandFlash）・対象選択・装甲は
// フラッシュマジックと【神速】の既存コードを使い回す（docs/design/BS15_PLAN.md §7.2）。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械確認してから使う。
import { act, assert, createGame, createInstance, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: カードの機械確認 ===")
{
    const miirbat = getCard("BS15-011")
    assert(miirbat.name === "ミーアバット" && miirbat.colors.includes("purple") && miirbat.type === "spirit", "BS15-011 は紫のミーアバット")
    const heavyArmored = getCard("BS12-027")
    assert(heavyArmored.name === "近衛機クリザンテMk-VIII", "BS12-027 は近衛機クリザンテMk-VIII（【重装甲：紫】）")
    const immune = getCard("BS04-043")
    assert(immune.name === "ワルキューレ・ヒルド", "BS04-043 はワルキューレ・ヒルド（相手のスピリット/マジックの効果を受けない）")
}

const EFFECT_ID = getCard("BS15-011").effects.find((e) => e.kind === "handActivated")!.id

function declareAttack(s: GameState, attackerCardId = "BS01-001") {
    const attacker = put(s, "p1", attackerCardId, 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（フラッシュ開始）")
    return attacker
}

console.log("=== §A メインステップでは使えない ===")
{
    const s = game("p334-a", false)
    s.players.p1.hand = ["BS15-011"]
    const err = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID })
    assert(err !== null, "メインステップでは使用を拒否する")
    assert(s.players.p1.hand.length === 1, "拒否されたので手札は破棄されない")
}

console.log("=== §B バトル中でも優先権がないと使えない ===")
{
    const s = game("p334-b", false)
    s.players.p1.hand = ["BS15-011"]
    declareAttack(s)
    assert(s.priorityPlayer === "p2", "アタック宣言直後の優先権は防御側（前提確認）")
    const err = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID })
    assert(err !== null, "優先権がないプレイヤーは使用できない")
    assert(s.players.p1.hand.length === 1, "拒否されたので手札は破棄されない")
}

console.log("=== §C lockFlash 中は使えない ===")
{
    const s = game("p334-c", false)
    s.players.p1.hand = ["BS15-011"]
    declareAttack(s)
    s.priorityPlayer = "p1"
    s.timedEffects.push({ content: [{ type: "battleLock", lock: "flash" }], target: { kind: "player", pid: "p1" }, until: "battle", ownerPid: "p2" })
    const err = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID })
    assert(err !== null, "lockFlash 中は使用できない")
    assert(s.players.p1.hand.length === 1, "拒否されたので手札は破棄されない")
}

console.log("=== §D アタックステップのバトル中は使える。手札のカードがトラッシュへ行く ===")
{
    const s = game("p334-d", false)
    s.players.p1.hand = ["BS15-011"]
    const attacker = declareAttack(s)
    s.priorityPlayer = "p1"
    const err = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID })
    assert(err === null, "アタックステップのバトル中は使用できる")
    assert(s.players.p1.hand.length === 0, "手札のこのカードが無くなる")
    assert(s.players.p1.trashCards.includes("BS15-011"), "破棄したカードはトラッシュへ行く（召喚されない）")
    // 非対話のanySideは自分の場から自動選択する（BP増加は自分に使うのが自然。テストの決定性のための簡略化）
    assert(attacker.tempBpBuff === 2000, "自分のスピリットがBP+2000される")
}

console.log("=== §E メインステップで使う独自の検証（フラッシュタイミングではない） ===")
{
    const s = game("p334-e", false)
    s.players.p1.hand = ["BS15-011"]
    s.phase = "attack" // フェーズだけ合わせても battle が無ければフラッシュタイミングではない
    const err = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID })
    assert(err !== null, "バトルが無ければアタックステップでも使用できない")
}

console.log("=== §F 対話：自分・相手どちらのスピリットも対象に選べる ===")
{
    const s = game("p334-f", true)
    s.players.p1.hand = ["BS15-011"]
    const attacker = declareAttack(s)
    const enemy = put(s, "p2", "BS01-001", 1)
    s.priorityPlayer = "p1"
    const err = act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID })
    assert(err === null, "対話でも使用宣言は通る")
    const candidates = s.pendingChoice?.candidates ?? []
    assert(candidates.includes(attacker.instanceId), "自分のスピリットが候補に含まれる")
    assert(candidates.includes(enemy.instanceId), "相手のスピリットも候補に含まれる")
}

console.log("=== §G 紫の【重装甲】を持つ相手は候補に出ない ===")
{
    const s = game("p334-g", true)
    s.players.p1.hand = ["BS15-011"]
    const attacker = declareAttack(s)
    const bystander = put(s, "p1", "BS01-001", 1) // 候補を2件以上にして選択待ちを立てるための対照
    const armored = put(s, "p2", "BS12-027", 1) // 【重装甲：紫】
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID }) === null, "使用宣言は通る")
    const candidates = s.pendingChoice?.candidates ?? []
    assert(!candidates.includes(armored.instanceId), "紫の【重装甲】を持つ相手は候補に出ない")
    assert(candidates.includes(attacker.instanceId) && candidates.includes(bystander.instanceId), "対照：自分のスピリットは候補に出る")
}

console.log("=== §H 「相手のスピリットの効果を受けない」耐性を持つ相手も候補に出ない ===")
{
    const s = game("p334-h", true)
    s.players.p1.hand = ["BS15-011"]
    const attacker = declareAttack(s)
    const bystander = put(s, "p1", "BS01-001", 1) // 候補を2件以上にして選択待ちを立てるための対照
    const immune = put(s, "p2", "BS04-043", 1) // ワルキューレ・ヒルド：相手のスピリット/マジックの効果を受けない
    s.priorityPlayer = "p1"
    assert(act(s, "p1", { type: "useHandAbility", handIndex: 0, effectId: EFFECT_ID }) === null, "使用宣言は通る")
    const candidates = s.pendingChoice?.candidates ?? []
    assert(!candidates.includes(immune.instanceId), "「スピリットの効果を受けない」耐性を持つ相手は候補に出ない")
    assert(candidates.includes(attacker.instanceId) && candidates.includes(bystander.instanceId), "対照：自分のスピリットは候補に出る")
}

console.log("すべてのチェックに合格しました 🎉（part334）")
