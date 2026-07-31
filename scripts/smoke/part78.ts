// smoke パート78（効果の無効化・読み替え層 その1）
//
//   - BS05-075 ブレイブチャージ: action "attackTriggersAsBlockThisTurn"
//     （CardInstance.attackTriggersAsBlockThisTurn。fireTrigger が『アタック時』効果を『ブロック時』へ移す）
//   - BS04-086 古代闘技場 Lv1: kind "bpBuffSuppression"
//     （相手の「BPを+する」効果を発揮させない。BP増加アクション＝buff.ts のレジストリ包み込み、
//      BP増加オーラ＝effectiveBp のオーラ走査、の2経路をふさぐ）
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    resolveAction,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"

function setup(seed: string, p1Color: string, p2Color: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1Color, p2: p2Color })
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS05-075 ブレイブチャージ：『アタック時』効果が『ブロック時』に発揮されるようになる ===")
{
    const s = setup("bravecharge-test", "green", "red")
    // BS01-004 ドラグノ偵察兵 Lv1：『このスピリットのアタック時』に自身をBP+2000（誘発はこれ1つだけ）
    const spirit = put(s, "p1", "BS01-004", 1)
    const before = effectiveBp(s, "p1", spirit)

    fireTrigger(s, "p1", spirit, "onBlock")
    assert(
        effectiveBp(s, "p1", spirit) === before,
        "通常はブロック時に『アタック時』効果は発揮されない",
    )

    resolveAction(s, "p1", null, { type: "attackTriggersAsBlockThisTurn" }, spirit.instanceId, undefined, "magic")
    assert(spirit.attackTriggersAsBlockThisTurn === true, "対象に読み替えフラグが立つ")

    fireTrigger(s, "p1", spirit, "onBlock")
    const afterBlock = effectiveBp(s, "p1", spirit)
    assert(afterBlock > before, "読み替え後はブロック時に『アタック時』効果が発揮される")

    fireTrigger(s, "p1", spirit, "onAttack")
    assert(
        effectiveBp(s, "p1", spirit) === afterBlock,
        "『アタック時』には発揮されなくなる（＝ブロック時へ移し替え）",
    )

    endTurn(s)
    assert(
        spirit.attackTriggersAsBlockThisTurn === undefined,
        "ターン終了で読み替えフラグがリセットされる",
    )
}

console.log("--- 対象を取らなかった場合（自分のスピリットがいない）は不発 ---")
{
    const s = setup("bravecharge-notarget-test", "green", "red")
    resolveAction(s, "p1", null, { type: "attackTriggersAsBlockThisTurn" }, undefined, undefined, "magic")
    assert(s.winner === null, "対象不在でもエラーにならず続行する")
}

console.log("=== BS04-086 古代闘技場 Lv1：自分のアタックステップ中、相手の「BPを+する」効果は発揮されない ===")
{
    const s = setup("arena-bpsuppress-test", "blue", "red")
    const arena = createInstance("BS04-086", s.turn, 0) // 古代闘技場 Lv1（維持コア0）
    s.players.p1.field.nexuses.push(arena)
    const enemy = put(s, "p2", "BS01-001", 1) // ゴラドン（相手のスピリット）
    const base = effectiveBp(s, "p2", enemy)

    // メインステップ（抑止の窓の外）では相手のBP+効果はそのまま通る
    resolveAction(s, "p2", null, { type: "bpBuff", amount: 3000 }, enemy.instanceId, undefined, "magic")
    assert(effectiveBp(s, "p2", enemy) === base + 3000, "メインステップでは相手のBP+効果は通る")

    s.phase = "attack" // 自分（p1）のアタックステップ＝闘技場の抑止が効く窓
    const inWindow = effectiveBp(s, "p2", enemy)
    resolveAction(s, "p2", null, { type: "bpBuff", amount: 3000 }, enemy.instanceId, undefined, "magic")
    assert(
        effectiveBp(s, "p2", enemy) === inWindow,
        "自分のアタックステップ中は相手のBP増加アクションが発揮されない",
    )

    // 自分（闘技場の持ち主）のBP+効果は抑止されない
    const mine = put(s, "p1", "BS01-001", 1)
    const mineBase = effectiveBp(s, "p1", mine)
    resolveAction(s, "p1", null, { type: "bpBuff", amount: 2000 }, mine.instanceId, undefined, "magic")
    assert(effectiveBp(s, "p1", mine) === mineBase + 2000, "持ち主自身のBP+効果は抑止されない")
}

console.log("--- BP増加オーラ（相手のネクサス/スピリット由来）も抑止される ---")
{
    const s = setup("arena-aura-test", "blue", "purple")
    const enemy = put(s, "p2", "BS01-031", 1) // デス・ハーデス（紫のバニラスピリット）
    // BS01-102 主無き古城 Lv1：持ち主の紫のスピリットすべてをBP+1000（phaseTurn 指定なし＝常時）
    const buffNexus = createInstance("BS01-102", s.turn, 0)
    s.players.p2.field.nexuses.push(buffNexus)
    const buffed = effectiveBp(s, "p2", enemy)

    const arena = createInstance("BS04-086", s.turn, 0)
    s.players.p1.field.nexuses.push(arena)
    assert(effectiveBp(s, "p2", enemy) === buffed, "メインステップ中はオーラも通常どおり乗る")

    s.phase = "attack"
    assert(
        effectiveBp(s, "p2", enemy) < buffed,
        "自分のアタックステップ中は相手のBP増加オーラも発揮されない",
    )

    endTurn(s) // p2 のターンへ（闘技場の turn:"own" が外れる）
    s.phase = "attack"
    assert(effectiveBp(s, "p2", enemy) === buffed, "相手のターンのアタックステップでは抑止されない")
}
