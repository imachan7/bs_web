// smoke パート705（fieldEvent の主語の色・系統は付与込みで判定する。docs/design/FILTER_UNIFY.md §6-1 / 2026-10-31 決定）
import { assert, createGame, createInstance, destroySpirit, getCard, giveTimed, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

console.log("=== 前提: カードの機械確認 ===")
{
    const chk = (id: string, name: string, type: string, color?: string, fam?: string) => {
        const c = getCard(id)
        assert(c.name === name && c.type === type, `${id}は${name}(${type})`)
        if (color) assert(c.colors.includes(color as never), `${id}は${color}`)
        if (fam) assert(c.family.includes(fam), `${id}は系統${fam}`)
    }
    chk("BS09-011", "盾騎士ガードナー", "spirit", "purple")
    chk("BS01-002", "ロクケラトプス", "spirit", "red", "地竜")
    chk("BS03-116", "英雄の喪失", "nexus", "blue")
    chk("BS07-008", "重刀竜ブレイガザウラー", "spirit", "red", "勇傑")
    chk("BS02-003", "ディノハウンド", "spirit", "red", "地竜")
    assert(!getCard("BS02-003").family.includes("勇傑"), "ディノハウンドは印刷では勇傑でない")
    assert(!getCard("BS09-011").colors.includes("red"), "ガードナーは赤でない")
}

function game(seed: string, turnPlayer: PlayerId): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.phase = "attack"
    s.players.p1.deck = Array.from({ length: 40 }, () => "BS01-002")
    s.players.p2.deck = Array.from({ length: 40 }, () => "BS01-002")
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== A. colorFilter: 赤としても扱う非赤スピリットの破壊で発火する ===")
function scenarioA(victimId: string, grantRed: boolean): number {
    const s = game("a-" + victimId + grantRed, "p2")
    put(s, "p1", "BS09-011", 3) // Lv2
    const enemy = put(s, "p2", "BS01-002", 2)
    const victim = put(s, "p1", victimId, 1)
    if (grantRed) giveTimed(s, victim, { type: "color", color: "red" })
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    return enemy.cores
}
{
    const printedRed = scenarioA("BS01-002", false)
    assert(printedRed === 1, "印刷どおり赤のスピリットの破壊で発火（相手スピリットのコア2→1）")
    assert(scenarioA("BS09-011", false) === 2, "赤でないスピリットの破壊では発火しない")
    assert(scenarioA("BS09-011", true) === printedRed, "赤としても扱うスピリットの破壊で発火する")
}

console.log("=== B. familyFilter: 付与された系統のスピリットの破壊で発火する ===")
function scenarioB(victimId: string, withGrantSource: boolean): number {
    const s = game("b-" + victimId + withGrantSource, "p1")
    put(s, "p1", "BS03-116", 2) // Lv2
    if (withGrantSource) put(s, "p1", "BS07-008", 2) // 地竜に勇傑を与える（Lv2。攻撃ステップ・自分のターン）
    const victim = put(s, "p1", victimId, 1)
    destroySpirit(s, "p1", victim.instanceId, "destroy", { sourcePid: "p2", battle: { attackerColors: ["red"] } })
    return s.players.p2.deck.length
}
{
    assert(scenarioB("BS07-008", false) === 35, "印刷どおり勇傑のスピリットのバトル破壊で発火（山札40→35）")
    assert(scenarioB("BS02-003", false) === 40, "付与元がいなければ地竜だけでは発火しない")
    assert(scenarioB("BS02-003", true) === 35, "勇傑を与えられた地竜のバトル破壊で発火する")
}

console.log("すべてのチェックに合格しました 🎉（part705）")
