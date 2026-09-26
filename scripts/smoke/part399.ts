// smoke パート399（バーストの発動側：BURST.md §10 A〜C。左右を入れ替えても確かめる）
// A：「自分のライフ減少後」は持ち主のライフが減ったときだけ。B：「相手による自分のスピリット破壊後」は持ち主のスピリットだけ。
// C：「相手の『召喚時』発揮後」は相手の召喚時効果を実際に発揮した後に1回（2026-09-27 ユーザー確認）
import {
    act,
    assert,
    createGame,
    createInstance,
    fireFieldEventTriggers,
    getCard,
    handleAction,
    placeBurst,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireBurstOnEvent } from "../../server/src/logic/keywords/burst"

const LIFE_BURST = "BS15-076" // 妖華吸血爪（紫・マジック。【バースト：自分のライフ減少後】2枚ドロー）
const SUMMON_BURST = "SD06-013" // 双翼乱舞（赤・マジック。【バースト：相手の召喚時発揮後】2枚ドロー）
const DESTROY_BURST = "BS14-091" // 【バースト：相手による自分のスピリット破壊後】（subjectSide なし）
const DRAW_ON_SUMMON = "BS01-030" // グリプ・ハンズ（紫・コスト3。召喚時：1枚ドロー、必須）
const OPTIONAL_ON_SUMMON = "BS02-066" // アルカナドール・パン（黄・コスト4。召喚時：相手1体を疲労できる）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    const burstOf = (id: string) => getCard(id).effects.find((e) => e.kind === "burst")
    assert(getCard(LIFE_BURST).name === "妖華吸血爪" && burstOf(LIFE_BURST)?.kind === "burst" && burstOf(LIFE_BURST)?.event === "ownLifeDamaged", "LIFE_BURSTは妖華吸血爪")
    assert(getCard(SUMMON_BURST).name === "双翼乱舞" && burstOf(SUMMON_BURST)?.kind === "burst" && burstOf(SUMMON_BURST)?.event === "opponentSummonEffectResolved", "SUMMON_BURSTは双翼乱舞")
    const d = burstOf(DESTROY_BURST)
    assert(d?.kind === "burst" && d.event === "ownSpiritDestroyed" && d.subjectSide === undefined, "DESTROY_BURSTは subjectSide なしの破壊後バースト")
    assert(getCard(DRAW_ON_SUMMON).name === "グリプ・ハンズ" && getCard(DRAW_ON_SUMMON).cost === 3, "DRAW_ON_SUMMONはグリプ・ハンズ")
    assert(getCard(OPTIONAL_ON_SUMMON).name === "アルカナドール・パン" && getCard(OPTIONAL_ON_SUMMON).cost === 4, "OPTIONAL_ON_SUMMONはアルカナドール・パン")
    assert(getCard(VANILLA).name === "ロクケラトプス", "VANILLAはロクケラトプス")
}

function game(seed: string, turn: PlayerId, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.phase = "main"
    s.turnPlayer = turn
    s.priorityPlayer = turn
    for (const p of ["p1", "p2"] as const) {
        s.players[p].reserve = 10
        s.players[p].deck = Array.from({ length: 40 }, () => VANILLA)
    }
    return s
}
const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")

for (const turn of ["p1", "p2"] as const) {
    console.log(`=== A. ライフ減少後（ターンプレイヤー ${turn}） ===`)
    for (const damaged of ["p1", "p2"] as const) {
        const s = game(`a-${turn}-${damaged}`, turn)
        placeBurst(s, "p1", LIFE_BURST)
        placeBurst(s, "p2", LIFE_BURST)
        fireFieldEventTriggers(s, damaged, "ownLifeDamaged")
        assert(s.players[damaged].burst === null, `${damaged}のライフが減ったら${damaged}のバーストが発動する`)
        assert(s.players[other(damaged)].burst === LIFE_BURST, `${damaged}のライフ減少では${other(damaged)}のバーストは発動しない`)
    }

    console.log(`=== B. 相手による自分のスピリット破壊後（ターンプレイヤー ${turn}） ===`)
    for (const victim of ["p1", "p2"] as const) {
        const s = game(`b-${turn}-${victim}`, turn)
        placeBurst(s, "p1", DESTROY_BURST)
        placeBurst(s, "p2", DESTROY_BURST)
        // 本番の破壊後バーストは removal.ts の fireQueuedDestroyBursts が fireBurstOnEvent を直接呼ぶ（同じ引数で呼ぶ）
        fireBurstOnEvent(s, victim, "ownSpiritDestroyed", { pid: victim, cardId: VANILLA }, ["red"], undefined, { byOpponentEffect: true, destroyedBp: 1000, costs: [1] })
        assert(s.players[victim].burst === null, `${victim}のスピリットが相手に破壊されたら${victim}のバーストが発動する`)
        assert(s.players[other(victim)].burst === DESTROY_BURST, `${victim}のスピリットが破壊されても${other(victim)}のバーストは発動しない`)
    }

    console.log(`=== C. 相手の召喚時発揮後：実際の召喚で発動する（召喚するのはターンプレイヤー ${turn}） ===`)
    {
        const s = game(`c-${turn}`, turn)
        placeBurst(s, turn, SUMMON_BURST)
        placeBurst(s, other(turn), SUMMON_BURST)
        s.players[turn].hand = [DRAW_ON_SUMMON]
        const handOther = s.players[other(turn)].hand.length
        assert(handleAction(s, turn, { type: "summon", handIndex: 0 }) === null, "召喚が通った")
        assert(s.players[other(turn)].burst === null && s.players[other(turn)].hand.length >= handOther + 2, "召喚時効果を発揮したので相手のバーストが発動する")
        assert(s.players[turn].burst === SUMMON_BURST, "召喚した側のバーストは発動しない")
    }
    {
        const s = game(`c-vanilla-${turn}`, turn)
        placeBurst(s, other(turn), SUMMON_BURST)
        s.players[turn].hand = [VANILLA]
        assert(handleAction(s, turn, { type: "summon", handIndex: 0 }) === null, "召喚が通った")
        assert(s.players[other(turn)].burst === SUMMON_BURST, "召喚時効果の無いスピリットでは発動しない")
    }
}

console.log("=== C. 任意の召喚時効果を「使わない」なら発動しない／使えば選択の後に発動する ===")
{
    const s = game("c-decline", "p1", true)
    placeBurst(s, "p2", SUMMON_BURST)
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    s.players.p1.hand = [OPTIONAL_ON_SUMMON]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚が通った")
    assert(s.pendingChoice?.pid === "p1", "召喚時効果の発動確認が出る")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "使わないを選んだ")
    assert(s.players.p2.burst === SUMMON_BURST, "使わなかったので相手のバーストは発動しない")
}
{
    const s = game("c-accept", "p1", true)
    placeBurst(s, "p2", SUMMON_BURST)
    s.players.p2.field.spirits.push(createInstance(VANILLA, s.turn, 1))
    s.players.p1.hand = [OPTIONAL_ON_SUMMON]
    assert(handleAction(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚が通った")
    assert(act(s, "p1", { type: "resolveChoice", option: "発動する" }) === null, "発動するを選んだ")
    // 疲労させる対象の選択が出ていれば答える（候補1体なら自動で決まる）
    if (s.pendingChoice?.pid === "p1" && s.pendingChoice.candidates.length > 0) {
        act(s, "p1", { type: "resolveChoice", instanceId: s.pendingChoice.candidates[0]! })
    }
    // 相手のバーストは相手に発動確認が出る（対話モード）。出ていれば承認する
    if (s.pendingChoice?.pid === "p2") act(s, "p2", { type: "resolveChoice", option: s.pendingChoice.options?.[0] ?? "発動する" })
    assert(s.players.p2.burst === null, "召喚時効果を解決しきった後に相手のバーストが発動する")
}

console.log("すべてのチェックに合格しました 🎉（part399）")
