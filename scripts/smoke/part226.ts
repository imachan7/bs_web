// smoke パート226（アタックしていたスピリットが場を離れたらバトルは終了する。2026-08-23 ユーザー確認）
//
// フラッシュタイミングでアタッカーをマジックで破壊すると、バトルが終わらずに残り、
// **アタッカーが居ないのに防御側が「ブロックする／ライフで受ける」を選ばされる**状態になっていた
// （2026-08-23 利用者報告）。ライフダメージ自体は doTakeLife のガードで防がれていたが、
// 手順としては誤りで、アタックはその時点で終了していなければならない。
//
// ⚠️ 判定は「破壊されたか」ではなく「**場にいないか**」で行う（2026-08-23 ユーザー確認）:
//   破壊されてもフィールドに残る効果で盤面に残った場合、そのアタックは**継続する**。
//   破壊待機状態（＞６の途中でまだ場にいる）も同じ理由で継続する。
import { assert, createGame, createInstance, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { validateBlock, validateTakeLife } from "../../server/src/logic/RuleValidator"

const ATTACKER = "BS01-008" // メタルバーン（バニラ Lv1 BP3000）＝フレイムダンスの対象になる
const BLOCKER = "BS01-031" // デス・ハーデス（バニラ Lv1 BP4000・紫）
const FLAME_DANCE = "BS01-121" // フレイムダンス（フラッシュ：BP4000以下のスピリット1体を破壊する）
const SURVIVOR = "BS07-016" // 冥勇士デスカラビア（破壊時、デッキの上が紫のスピリットなら回復状態で場に残る）

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const atk = getCard(ATTACKER)
    assert(atk.type === "spirit" && atk.levels[0]?.bp === 3000, `${ATTACKER} はBP3000のスピリット（${atk.name}）`)
    const magic = getCard(FLAME_DANCE)
    assert(magic.type === "magic" && magic.flash === true, `${FLAME_DANCE} はフラッシュマジック（${magic.name}）`)
    const survivor = getCard(SURVIVOR)
    assert(
        JSON.stringify(survivor.effects).includes("reviveOnDestroy"),
        `${SURVIVOR} は破壊されても場に残る効果を持つ（${survivor.name}）`,
    )
    assert(getCard(BLOCKER).colors.includes("purple"), `${BLOCKER} は紫（デスカラビアの残留条件に使う）`)
}

// p1 のアタッカーと p2 のブロッカーを並べ、p2 にフラッシュマジックを持たせた盤面
function setup(attackerCardId = ATTACKER): GameState {
    const s = createGame(`battle-end-${attackerCardId}`, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.field.spirits.push(createInstance(attackerCardId, s.turn, 1))
    s.players.p2.field.spirits.push(createInstance(BLOCKER, s.turn, 1))
    s.players.p2.hand = [FLAME_DANCE]
    s.players.p2.reserve = 12 // コストは確実に払える状態にする
    return s
}

// 選択待ちに答える（対象は指定した instanceId を優先）
function answerChoices(s: GameState, preferred?: string): void {
    let guard = 0
    while (s.pendingChoice && guard++ < 10) {
        const pid = s.pendingChoice.pid as PlayerId
        const target =
            preferred && s.pendingChoice.candidates.includes(preferred)
                ? preferred
                : s.pendingChoice.candidates[0]
        const action = target
            ? ({ type: "resolveChoice", instanceId: target } as const)
            : s.pendingChoice.options && s.pendingChoice.options.length > 0
              ? ({ type: "resolveChoice", option: s.pendingChoice.options[0]! } as const)
              : ({ type: "resolveChoice" } as const)
        if (handleAction(s, pid, action)) break
    }
}

function closeFlash(s: GameState): void {
    let guard = 0
    while (s.isFlashTiming && s.battle && guard++ < 10) {
        if (handleAction(s, s.priorityPlayer, { type: "pass" })) break
    }
}

console.log("=== ブロック宣言前のフラッシュでアタッカーが破壊されたら、バトルは終了する ===")
{
    const s = setup()
    const attacker = s.players.p1.field.spirits[0]!
    handleAction(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    assert(s.battle !== null, "アタック宣言でバトルが始まる")

    handleAction(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId })
    answerChoices(s, attacker.instanceId)
    assert(s.players.p1.field.spirits.length === 0, "アタッカーが場を離れた")
    assert(s.battle === null, "アタッカーが場を離れた時点でバトルが終了している")

    // 終了しているので、防御側は何も選ばされない
    const blocker = s.players.p2.field.spirits[0]!
    assert(
        validateBlock(s, "p2", blocker.instanceId) !== null,
        "ブロックは宣言できない（バトルが無い）",
    )
    assert(validateTakeLife(s, "p2") !== null, "ライフで受ける宣言もできない（バトルが無い）")
    assert(s.players.p2.life === 5, "ライフは減らない")
    assert(!s.isFlashTiming, "フラッシュタイミングも閉じている")
}

console.log("=== 破壊されてもフィールドに残ったときは、アタックが継続する ===")
{
    const s = setup(SURVIVOR)
    // デスカラビアの残留条件：破壊時にデッキの上が紫のスピリットカードであること
    s.players.p1.deck.unshift(BLOCKER) // BS01-031 デス・ハーデス（紫のスピリット）
    const attacker = s.players.p1.field.spirits[0]!
    handleAction(s, "p1", { type: "attack", instanceId: attacker.instanceId })

    handleAction(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId })
    answerChoices(s, attacker.instanceId)

    const stillThere = s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId)
    assert(stillThere, "破壊されてもフィールドに残っている")
    if (stillThere) {
        assert(s.battle !== null, "場に残っているならバトルは継続する（破壊されたことでは終わらない）")
        assert(
            s.battle?.attackerInstanceId === attacker.instanceId,
            "アタッカーはそのまま同じ個体",
        )
    }
}

console.log("=== ブロック宣言後にアタッカーが破壊された場合（既存の挙動を壊さない） ===")
{
    const s = setup()
    const attacker = s.players.p1.field.spirits[0]!
    const blocker = s.players.p2.field.spirits[0]!
    handleAction(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    closeFlash(s)
    handleAction(s, "p2", { type: "block", instanceId: blocker.instanceId })
    assert(s.battle?.blockerInstanceId === blocker.instanceId, "ブロックが宣言されている")

    handleAction(s, "p2", { type: "castMagic", handIndex: 0, targetInstanceId: attacker.instanceId })
    answerChoices(s, attacker.instanceId)
    closeFlash(s)

    assert(s.battle === null, "バトルは終了している")
    assert(s.players.p2.life === 5, "ブロックされているのでライフは減らない")
    assert(s.players.p2.field.spirits.length === 1, "ブロッカーは生き残る（アタッカーは既に場を離れている）")
}
