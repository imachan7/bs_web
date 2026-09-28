// smoke パート438（BS16バッチ3・組C：coreFloorByCostのbyOpponentOnly／nexusEffectsDisabledのtargetLevels＋phase／battleLock"magic"）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectSources,
    getCard,
    giveTimedToPlayer,
    lockedFor,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { coreFloorFor, removeCores } from "../../server/src/logic/removal"
import type { EffectDef } from "../../server/src/types/effectDef"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ。Lv1コア1）
const SOURCE1 = "BS01-050" // ビートビートル（赤スピリット。coreFloorByCostのbyOpponentOnly検証用に効果を差し替える）
const SOURCE2 = "BS01-051" // フライングミラージュ（赤スピリット。nexusEffectsDisabledのtargetLevels検証用に効果を差し替える）
const TARGET_NEXUS = "BS01-098" // 燃えさかる戦場（赤ネクサス・2レベル。Lv1コア0／Lv2コア2）
const MAGIC = "BS01-117" // ダブルドロー（赤マジック・コスト4。メイン：デッキから2枚ドロー。対象指定なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1, "VANILLAはコスト1のバニラ")
    assert(getCard(SOURCE1).name === "ビートビートル" && getCard(SOURCE1).type === "spirit", "SOURCE1はスピリット")
    assert(getCard(SOURCE2).name === "フライングミラージュ" && getCard(SOURCE2).type === "spirit", "SOURCE2はスピリット")
    assert(getCard(TARGET_NEXUS).name === "燃えさかる戦場" && getCard(TARGET_NEXUS).type === "nexus", "TARGET_NEXUSはネクサス")
    assert(getCard(MAGIC).name === "ダブルドロー" && getCard(MAGIC).type === "magic" && getCard(MAGIC).cost === 4, "MAGICはコスト4のマジック")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

// カード定義を一時的に差し替えて元に戻す（実カードは未実装のため、器そのものの動作をここで確かめる）
function withTempEffects(cardId: string, effects: EffectDef[], run: () => void): void {
    const card = getCard(cardId)
    const original = card.effects
    card.effects = effects
    try {
        run()
    } finally {
        card.effects = original
    }
}

console.log("=== 1. coreFloorByCost byOpponentOnly：相手の減少は床で止まり、自分の減少は止まらない ===")
{
    const coreFloorEffect: EffectDef = {
        id: "test-corefloor",
        kind: "globalConstraint",
        levels: null,
        constraint: { type: "coreFloorByCost", ownOnly: true, byOpponentOnly: true },
    }
    withTempEffects(SOURCE1, [coreFloorEffect], () => {
        const s = game("core-floor")
        const source = createInstance(SOURCE1, s.turn, 1)
        s.players.p1.field.spirits.push(source)
        const target1 = createInstance(VANILLA, s.turn, 5)
        const target2 = createInstance(VANILLA, s.turn, 5)
        s.players.p1.field.spirits.push(target1, target2)
        refreshLevelAsOverrides(s)

        assert(coreFloorFor(s, target1, "p1", "p2") === 1, "相手が減らす場合はLv1コア(1)が床になる")
        assert(coreFloorFor(s, target1, "p1", "p1") === 0, "自分が減らす場合は床が無い")

        const removedByOpponent = removeCores(s, "p1", target1, 10, "p2")
        assert(removedByOpponent === 4 && target1.cores === 1, "相手による除去は床(1個)で止まる")

        const removedByOwner = removeCores(s, "p1", target2, 10, "p1")
        assert(removedByOwner === 5, "自分による除去は床を無視してすべて取り除ける")
        assert(!s.players.p1.field.spirits.includes(target2), "維持コアを下回ったので消滅した")
    })
}

console.log("=== 2. nexusEffectsDisabled targetLevels＋phase：Lv1の相手ネクサスだけ、アタックステップ中だけ止まる ===")
{
    const nexusLockEffect: EffectDef = {
        id: "test-nexuslock",
        kind: "nexusEffectsDisabled",
        levels: null,
        target: "opponentAll",
        targetLevels: [1],
        phase: "attack",
    }
    withTempEffects(SOURCE2, [nexusLockEffect], () => {
        const s = game("nexus-lock")
        const source = createInstance(SOURCE2, s.turn, 1)
        s.players.p1.field.spirits.push(source)
        const nexus = createInstance(TARGET_NEXUS, s.turn, 0) // Lv1（コア0）
        s.players.p2.field.nexuses.push(nexus)
        refreshLevelAsOverrides(s)
        s.phase = "attack"

        assert(currentLevel(nexus).level === 1, "検証用ネクサスはLv1")
        assert(!effectSources(s, "p2").includes(nexus), "アタックステップ中、Lv1の相手ネクサスは効果が止まる")

        nexus.cores = 2 // Lv2へ
        refreshLevelAsOverrides(s)
        assert(currentLevel(nexus).level === 2, "検証用ネクサスはLv2")
        assert(effectSources(s, "p2").includes(nexus), "Lv2のネクサスは対象外なので止まらない")

        nexus.cores = 0
        refreshLevelAsOverrides(s)
        s.phase = "main"
        assert(effectSources(s, "p2").includes(nexus), "アタックステップ以外ではLv1でも止まらない")
    })
}

console.log("=== 3. battleLock \"magic\"：ロック中は使用できず、解除後は使える ===")
{
    const s = game("magic-lock")
    const pid: PlayerId = s.turnPlayer
    s.players[pid].hand = [MAGIC]
    s.players[pid].reserve = 10

    giveTimedToPlayer(s, pid, { type: "battleLock", lock: "magic" }, "battle")
    assert(lockedFor(s, pid, "magic"), "battleLock \"magic\"が記録されている")

    const lockedErr = act(s, pid, { type: "castMagic", handIndex: 0 })
    assert(lockedErr !== null, "ロック中はマジックを使用できない")
    assert(s.players[pid].hand.length === 1, "拒否されたのでカードは手札に残ったまま")

    // 「このバトルの間」が終わった状態を再現する（battleLockの記録を消す）
    s.timedEffects = s.timedEffects.filter((r) => !r.content.some((c) => c.type === "battleLock"))
    assert(!lockedFor(s, pid, "magic"), "解除後はロックが残っていない")

    const afterErr = act(s, pid, { type: "castMagic", handIndex: 0 })
    assert(afterErr === null, "解除後はマジックを使用できる")
    // MAGICのメイン効果は「デッキから2枚ドロー」なので、使用後の手札はマジック自身が抜けてドロー2枚分になる
    assert(!s.players[pid].hand.includes(MAGIC), "使用できたのでマジック自身は手札から無くなった")
}

console.log("すべてのチェックに合格しました 🎉（part438）")
