// smoke パート126（第六弾 BS06 バッチ3：緑10枚）
//
// エンジンの新設はなし。既存の器＋バッチ1で足した chooserIsTarget で書けたカードを取り込んだ。
//
// 実装したカード:
//   - BS06-025 メェ～ポン / BS06-027 ガゼルケイド / BS06-032 ウッディコング（バニラ）
//   - BS06-026 カラカロッサム（【神速】＋Lv2･Lv3 破壊時にこのターン自分全体をBP+1000）
//   - BS06-029 メイパロット / BS06-031 ミツジャラシ（召喚時、ボイドからコア1個を自分のスピリットへ）
//   - BS06-030 働きアントマン（Lv2 アタック時、ボイドからコア1個を自分のリザーブへ）
//   - BS06-035 ツクシンモア（【神速】＋召喚時、相手は手札1枚を破棄）
//   - BS06-081 賢者の樹の実（ライフが減ったらボイドからコア1個／Lv2 自分のエンドステップに全回復）
//   - BS06-100 ソーンプリズン（フラッシュ：相手は相手のスピリット2体を疲労させる）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    destroySpirit,
    effectiveBp,
    getCard,
    hasKeyword,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"
import { endTurn } from "../../server/src/logic/PhaseManager"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
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
    for (const [cid, name] of [
        ["BS06-025", "メェ～ポン"],
        ["BS06-026", "カラカロッサム"],
        ["BS06-027", "ガゼルケイド"],
        ["BS06-029", "メイパロット"],
        ["BS06-030", "働きアントマン"],
        ["BS06-031", "ミツジャラシ"],
        ["BS06-032", "ウッディコング"],
        ["BS06-035", "ツクシンモア"],
        ["BS06-081", "賢者の樹の実"],
        ["BS06-100", "ソーンプリズン"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    assert(hasKeyword("BS06-026", "soku"), "カラカロッサムは【神速】を持つ")
    assert(hasKeyword("BS06-035", "soku"), "ツクシンモアは【神速】を持つ")
    assert(getCard("BS06-081").type === "nexus", "賢者の樹の実はネクサス")
    assert(getCard("BS06-100").type === "magic", "ソーンプリズンはマジック")
}

console.log("=== BS06-029 メイパロット：召喚時、ボイドからコア1個を自分のスピリットへ ===")
{
    const s = createGame("t126-parrot", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const existing = put(s, "p1", "BS06-032", 1) // ウッディコング（BP4000）＝実効BP最大
    s.players.p1.hand[0] = "BS06-029"
    s.players.p1.reserve = 10
    const coresBefore = existing.cores

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "メイパロットを召喚")
    const total = s.players.p1.field.spirits.reduce((sum, x) => sum + x.cores, 0)
    assert(
        existing.cores === coresBefore + 1 || total > coresBefore + 1,
        `ボイドからコア1個が自分のスピリットに置かれる（実際: ウッディコング${String(existing.cores)}個）`,
    )
}

console.log("=== BS06-030 働きアントマン Lv2：アタック時、ボイドからコア1個をリザーブへ ===")
{
    const s = createGame("t126-antman", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-030", 2) // Lv2（2コア）
    assert(currentLevel(attacker).level === 2, `働きアントマンは2コアでLv2（実際: ${String(currentLevel(attacker).level)}）`)
    s.players.p1.reserve = 0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(s.players.p1.reserve === 1, `リザーブにコア1個（実際: ${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS06-030 働きアントマン：Lv1では発揮しない ===")
{
    const s = createGame("t126-antman-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-030", 1) // Lv1
    s.players.p1.reserve = 0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(s.players.p1.reserve === 0, `Lv1では増えない（実際: ${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS06-026 カラカロッサム Lv2：破壊時、このターン自分全体をBP+1000 ===")
{
    const s = createGame("t126-karakarossam", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const dying = put(s, "p1", "BS06-026", 3) // Lv2
    assert(currentLevel(dying).level === 2, `カラカロッサムは3コアでLv2（実際: ${String(currentLevel(dying).level)}）`)
    const survivor = put(s, "p1", "BS06-032", 1)
    const enemy = put(s, "p2", "BS06-032", 1)
    const before = effectiveBp(s, "p1", survivor)
    const enemyBefore = effectiveBp(s, "p2", enemy)

    destroySpirit(s, "p1", dying.instanceId, "destroy")
    assert(
        effectiveBp(s, "p1", survivor) === before + 1000,
        `自分のスピリットがBP+1000（実際: +${String(effectiveBp(s, "p1", survivor) - before)}）`,
    )
    assert(effectiveBp(s, "p2", enemy) === enemyBefore, "相手のスピリットは変わらない")
}

console.log("=== BS06-026 カラカロッサム：Lv1では破壊時に発揮しない ===")
{
    const s = createGame("t126-karakarossam-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const dying = put(s, "p1", "BS06-026", 1) // Lv1
    const survivor = put(s, "p1", "BS06-032", 1)
    const before = effectiveBp(s, "p1", survivor)
    destroySpirit(s, "p1", dying.instanceId, "destroy")
    assert(
        effectiveBp(s, "p1", survivor) === before,
        `Lv1では加算されない（実際: +${String(effectiveBp(s, "p1", survivor) - before)}）`,
    )
}

console.log("=== BS06-035 ツクシンモア：召喚時、相手の手札1枚を破棄 ===")
{
    const s = createGame("t126-tsukushinmoa", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.players.p1.hand[0] = "BS06-035"
    s.players.p1.reserve = 20
    const oppHandBefore = s.players.p2.hand.length
    const oppTrashBefore = s.players.p2.trashCards.length

    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ツクシンモアを召喚")
    assert(
        s.players.p2.hand.length === oppHandBefore - 1,
        `相手の手札が1枚減る（実際: ${String(oppHandBefore - s.players.p2.hand.length)}枚）`,
    )
    assert(
        s.players.p2.trashCards.length === oppTrashBefore + 1,
        `破棄したカードは相手のトラッシュへ（実際: ${String(s.players.p2.trashCards.length - oppTrashBefore)}枚）`,
    )
}

console.log("=== BS06-100 ソーンプリズン：相手は相手のスピリット2体を疲労させる ===")
{
    const s = createGame("t126-thornprison", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const a = put(s, "p2", "BS01-001", 1)
    const b = put(s, "p2", "BS01-005", 1)
    const c = put(s, "p2", "BS01-031", 1)

    resolveMagic(s, "p1", "BS06-100", "flash")
    const rested = [a, b, c].filter((x) => x.isRested).length
    assert(rested === 2, `相手のスピリット2体が疲労する（実際: ${String(rested)}体）`)
    assert(s.players.p1.field.spirits.every((x) => !x.isRested), "自分側は疲労しない")
}

console.log("=== BS06-100 ソーンプリズン：実対戦では疲労させられる側が選ぶ ===")
{
    const s = createGame("t126-thornprison-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    put(s, "p2", "BS01-001", 1)
    put(s, "p2", "BS01-005", 1)
    put(s, "p2", "BS01-031", 1)
    s.interactiveTargets = true

    resolveMagic(s, "p1", "BS06-100", "flash")
    assert(s.pendingChoice !== null, "対象の選択待ちになる")
    assert(s.pendingChoice?.pid === "p2", "選ぶのは疲労させられる側（p2）")
    assert(s.pendingChoice?.actorPid === "p1", "効果を解決するのは使用者（p1）")
}

console.log("=== BS06-081 賢者の樹の実：相手のスピリットでライフが減ったらボイドからコア1個 ===")
{
    const s = createGame("t126-sagefruit", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-081", 0) // Lv1
    // p2 のターンにして、p2 のスピリットでアタック → p1 がライフで受ける
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了（p2のターンへ）")
    const attacker = put(s, "p2", "BS01-001", 1)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p1.reserve = 0
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける")

    assert(s.players.p1.reserve >= 1, `ライフが減ったのでボイドからコア1個（実際: ${String(s.players.p1.reserve)}個）`)
}

console.log("=== BS06-081 賢者の樹の実 Lv2：自分のエンドステップに自分のスピリットを全回復 ===")
{
    const s = createGame("t126-sagefruit-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-081", 3) // Lv2
    const a = put(s, "p1", "BS06-032", 1)
    const b = put(s, "p1", "BS06-027", 1)
    a.isRested = true
    b.isRested = true

    endTurn(s)
    assert(!a.isRested && !b.isRested, "エンドステップに自分のスピリットが全回復する")
}
