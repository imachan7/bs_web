// smoke パート125（第六弾 BS06 バッチ2：赤10枚）
//
// エンジンの新設はなし。既存の器だけで書けたカード（SURVEY の A/B 分類）を取り込んだ。
// - bpBuffAll（filter.family）／selfBuff／destroy（filter.maxBp）
// - recoverSpiritFromTrash（familyFilter）／destroyNexus（drawPerDestroyed）
// - step:"draw"（ドロー枚数+1 → 手札破棄）／aura（keywordFilter・phaseTurn）
//
// 実装したカード:
//   - BS06-001 オヴィラプト（召喚時、このターン「地竜」全体をBP+1000）
//   - BS06-002 イグアナイフ / BS06-004 ドラグロン十人隊長 / BS06-008 刀剣魚エスパーダ（バニラ）
//   - BS06-006 サーベカウラス（【覚醒】＋Lv2･Lv3 自分のアタックステップに【激突】持ち全体をBP+1000）
//   - BS06-009 雲刃竜ソードラグーン（アタック時に自身をBP+4000）
//   - BS06-073 灼熱の谷（ドローステップに+1枚引いて手札1枚破棄／Lv2 自分全体をBP+1000）
//   - BS06-091 バスタージャベリン（メイン：ネクサス破壊＋ドロー／フラッシュ：BP+2000）
//   - BS06-092 エクスキャベーション（メイン：トラッシュの「地竜」3枚を手札へ）
//   - BS06-094 トライデントフレア（フラッシュ：BP3000以下の相手3体を破壊）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    getCard,
    hasKeyword,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

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
        ["BS06-001", "オヴィラプト"],
        ["BS06-002", "イグアナイフ"],
        ["BS06-004", "ドラグロン十人隊長"],
        ["BS06-006", "サーベカウラス"],
        ["BS06-008", "刀剣魚エスパーダ"],
        ["BS06-009", "雲刃竜ソードラグーン"],
        ["BS06-073", "灼熱の谷"],
        ["BS06-091", "バスタージャベリン"],
        ["BS06-092", "エクスキャベーション"],
        ["BS06-094", "トライデントフレア"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    assert(getCard("BS06-001").family.includes("地竜"), "オヴィラプトは系統「地竜」")
    assert(getCard("BS06-009").family.includes("地竜") === false, "雲刃竜ソードラグーンは地竜でない（対照用）")
    assert(hasKeyword("BS06-006", "awaken"), "サーベカウラスは【覚醒】を持つ")
    assert(getCard("BS06-073").type === "nexus", "灼熱の谷はネクサス")
    assert((getCard("BS06-002").effects ?? []).length === 0, "イグアナイフはバニラ")
}

console.log("=== BS06-001 オヴィラプト：召喚時、このターン「地竜」全体をBP+1000 ===")
{
    const s = createGame("t125-ovirapt", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const chiryu = put(s, "p1", "BS06-004", 1) // ドラグロン十人隊長…は竜人。地竜は BS06-002 イグアナイフではない
    const other = put(s, "p1", "BS06-009", 1) // 星竜/翼竜＝地竜でない
    const dino = put(s, "p1", "BS06-001", 1) // 自身も地竜
    const beforeChiryu = effectiveBp(s, "p1", chiryu)
    const beforeOther = effectiveBp(s, "p1", other)
    const beforeSelf = effectiveBp(s, "p1", dino)

    s.players.p1.hand[0] = "BS06-001"
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "オヴィラプトを召喚")

    assert(effectiveBp(s, "p1", other) === beforeOther, `地竜でないスピリットは変わらない（実際: +${String(effectiveBp(s, "p1", other) - beforeOther)}）`)
    assert(effectiveBp(s, "p1", dino) === beforeSelf + 1000, `既にいた地竜（オヴィラプト）もBP+1000（実際: +${String(effectiveBp(s, "p1", dino) - beforeSelf)}）`)
    assert(effectiveBp(s, "p1", chiryu) === beforeChiryu, "竜人（地竜でない）は変わらない")
}

console.log("=== BS06-009 雲刃竜ソードラグーン：アタック時に自身をBP+4000 ===")
{
    const s = createGame("t125-swordragoon", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-009", 1)
    const before = effectiveBp(s, "p1", attacker)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(
        effectiveBp(s, "p1", attacker) === before + 4000,
        `BP+4000（実際: +${String(effectiveBp(s, "p1", attacker) - before)}）`,
    )
}

console.log("=== BS06-006 サーベカウラス Lv2：自分のアタックステップに【激突】持ち全体をBP+1000 ===")
{
    const s = createGame("t125-sabercaurus", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const source = put(s, "p1", "BS06-006", 3) // Lv2
    assert(currentLevel(source).level === 2, `サーベカウラスは3コアでLv2（実際: ${String(currentLevel(source).level)}）`)
    const clash = put(s, "p1", "BS06-003", 1) // 猛角獣ホーングリズリー＝【激突】
    const noClash = put(s, "p1", "BS06-009", 1) // 激突を持たない
    const clashBase = effectiveBp(s, "p1", clash)
    const noClashBase = effectiveBp(s, "p1", noClash)

    // メインステップでは効かない（phaseTurn: attack / own）
    assert(effectiveBp(s, "p1", clash) === clashBase, "メインステップでは加算されない")

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(
        effectiveBp(s, "p1", clash) === clashBase + 1000,
        `【激突】持ちはBP+1000（実際: +${String(effectiveBp(s, "p1", clash) - clashBase)}）`,
    )
    assert(
        effectiveBp(s, "p1", noClash) === noClashBase,
        `【激突】を持たないスピリットは変わらない（実際: +${String(effectiveBp(s, "p1", noClash) - noClashBase)}）`,
    )
}

console.log("=== BS06-073 灼熱の谷：ドローステップに+1枚引いて手札1枚を破棄 ===")
{
    // ※ helpers の runTurnStart は「初回呼び出しのドローステップ分を巻き戻す」ため、
    //    手札の増減ではなく **デッキとトラッシュの動き** で判定する
    //    （効果ドロー1枚はデッキから減り、破棄した1枚はトラッシュへ行く）
    const base = createGame("t125-valley-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    const baseDeck = base.players.p1.deck.length
    runTurnStart(base)
    assert(base.players.p1.deck.length === baseDeck, "ネクサスなしならデッキは元に戻る（巻き戻しの確認）")
    assert(base.players.p1.trashCards.length === 0, "ネクサスなしなら破棄も起きない")

    const s = createGame("t125-valley", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    putNexus(s, "p1", "BS06-073", 0) // Lv1
    const deckBefore = s.players.p1.deck.length
    runTurnStart(s) // ドローステップを含むターン開始処理

    assert(
        s.players.p1.deck.length === deckBefore - 1,
        `効果でもう1枚引くのでデッキが1枚減る（実際: ${String(deckBefore - s.players.p1.deck.length)}枚）`,
    )
    assert(
        s.players.p1.trashCards.length === 1,
        `引いたあと手札1枚を破棄する（実際: ${String(s.players.p1.trashCards.length)}枚）`,
    )
}

console.log("=== BS06-073 灼熱の谷 Lv2：自分のアタックステップに自分全体をBP+1000 ===")
{
    const s = createGame("t125-valley-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-073", 1) // Lv2（1コア）
    const own = put(s, "p1", "BS06-009", 1)
    const enemy = put(s, "p2", "BS06-009", 1)
    const ownBase = effectiveBp(s, "p1", own)
    const enemyBase = effectiveBp(s, "p2", enemy)

    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(effectiveBp(s, "p1", own) === ownBase + 1000, `自分のスピリットはBP+1000（実際: +${String(effectiveBp(s, "p1", own) - ownBase)}）`)
    assert(effectiveBp(s, "p2", enemy) === enemyBase, "相手のスピリットは変わらない")
}

console.log("=== BS06-094 トライデントフレア：BP3000以下の相手3体を破壊 ===")
{
    const s = createGame("t125-trident", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const a = put(s, "p2", "BS01-001", 1) // BP1000
    const b = put(s, "p2", "BS01-005", 1) // BP2000
    const c = put(s, "p2", "BS06-009", 1) // BP3000
    const tough = put(s, "p2", "BS01-031", 1) // デス・ハーデス Lv1（BP4000）＝対象外

    resolveMagic(s, "p1", "BS06-094", "flash")
    for (const [inst, label] of [
        [a, "BP1000"],
        [b, "BP2000"],
        [c, "BP3000"],
    ] as const) {
        assert(!s.players.p2.field.spirits.some((x) => x.instanceId === inst.instanceId), `${label}は破壊される`)
    }
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === tough.instanceId), "BP4000は破壊されない")
}

console.log("=== BS06-092 エクスキャベーション：トラッシュの「地竜」3枚を手札へ ===")
{
    const s = createGame("t125-excavation", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    // 地竜3枚＋地竜でない1枚をトラッシュに置く
    s.players.p1.trashCards = ["BS06-009", "BS06-001", "BS06-001", "BS06-001"]
    const handBefore = s.players.p1.hand.length

    resolveMagic(s, "p1", "BS06-092", "main")
    assert(
        s.players.p1.hand.length === handBefore + 3,
        `3枚を手札に戻す（実際: ${String(s.players.p1.hand.length - handBefore)}枚）`,
    )
    assert(
        s.players.p1.trashCards.includes("BS06-009"),
        "地竜でないカード（雲刃竜ソードラグーン）はトラッシュに残る",
    )
}

console.log("=== BS06-091 バスタージャベリン：相手のネクサスを破壊してドロー ===")
{
    const s = createGame("t125-javelin", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p2", "BS06-073", 0)
    const handBefore = s.players.p1.hand.length

    resolveMagic(s, "p1", "BS06-091", "main")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスが破壊される")
    assert(
        s.players.p1.hand.length === handBefore + 1,
        `破壊できたので1枚ドロー（実際: ${String(s.players.p1.hand.length - handBefore)}枚）`,
    )
}
