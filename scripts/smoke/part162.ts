// smoke パート162（「このバトルの間」の貸与：lendSelfThisBattle / PlayerState.battleVirtualInstances）
//
// BS07のフラッシュマジック3枚は効果テキストが「このバトルの間」なのに lendSelfThisTurn で
// 貸与していたため、**同じターンの2回目のバトルでも効果が出ていた**（印刷されたカードより強い）。
// 貸与先を battleVirtualInstances に分け、clearBattle で切るようにしたのがこのパートの対象。
//
//   BS07-071 ダーティフィスト   ライフを減らしたとき2枚ドロー
//   BS07-074 ニードルショット   剣獣がBP比較で相手だけを破壊したとき相手1体を疲労
//   BS07-079 ブルームフルート   【聖命】持ちがブロックされたときボイドからライフへコア1個
//
// 3枚とも「1回目のバトルでは効く」だけでなく「**2回目のバトルでは効かない**」ところまで見る。
// 前者だけだと、貸与先を取り違えても（＝直す前の実装でも）通ってしまう。
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}
// アタック宣言 → フラッシュ①で攻撃側がマジックを1枚使う、までを進める。
// フラッシュ①の優先権は防御側から始まるので、p2のパスを挟んでからでないと攻撃側は使えない
function attackAndCast(s: GameState, attackerId: string, handIndex: number): void {
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（優先権が攻撃側へ）")
    assert(act(s, "p1", { type: "castMagic", handIndex }) === null, "攻撃側がフラッシュでマジックを使用")
}

console.log("=== BS07-071 ダーティフィスト：ライフを減らしたときの2枚ドローはそのバトル限り ===")
{
    const s = createGame("bs07-071-battle-scope", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    const attacker1 = putSpirit(s, "p1", "BS02-014", 1) // ファンタズマ Lv1 BP2000（効果なし）
    const attacker2 = putSpirit(s, "p1", "BS02-014", 1)
    s.players.p1.hand = ["BS07-071"]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    console.log("--- 1回目のバトル：貸与が効いてドローする ---")
    attackAndCast(s, attacker1, 0)
    assert(s.players.p1.battleVirtualInstances.length === 1, "このバトル限定の仮想発生源が1件立つ")
    assert(s.players.p1.turnVirtualInstances.length === 0, "ターン限定の側には積まれない")
    const beforeHand = s.players.p1.hand.length
    const beforeDeck = s.players.p1.deck.length
    assert(takeLifeAndResolve(s, "p2") === null, "p2がライフで受ける")
    assert(s.players.p1.hand.length === beforeHand + 2, "ライフを減らして2枚ドローした")
    assert(s.players.p1.deck.length === beforeDeck - 2, "デッキが2枚減っている")

    console.log("--- バトル終了で貸与が切れる ---")
    assert(s.battle === null, "バトルは終了している")
    assert(s.players.p1.battleVirtualInstances.length === 0, "clearBattleで仮想発生源が消える")

    console.log("--- 2回目のバトル：同じターンでもドローしない ---")
    const handAfter1 = s.players.p1.hand.length
    assert(act(s, "p1", { type: "attack", instanceId: attacker2 }) === null, "2体目でアタック")
    assert(takeLifeAndResolve(s, "p2") === null, "p2がライフで受ける")
    assert(s.players.p1.hand.length === handAfter1, "2回目のバトルではドローが発生しない")
    assert(s.players.p2.life === 3, "p2のライフは2回分だけ減っている")
}

console.log("=== BS07-074 ニードルショット：BP比較勝利時の疲労はそのバトル限り ===")
{
    const s = createGame("bs07-074-battle-scope", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    // アリゲイド（剣獣）Lv1 BP3000。ニードルショットで+2000され、ブロッカーのBP4000を上回る
    const attacker1 = putSpirit(s, "p1", "BS04-027", 1)
    const attacker2 = putSpirit(s, "p1", "BS04-027", 1)
    const blocker1 = putSpirit(s, "p2", "BS01-031", 1) // デス・ハーデス Lv1 BP4000（効果なし）
    const watcher = putSpirit(s, "p2", "BS02-014", 1) // 疲労させられる側（バトルには関わらない）
    s.players.p1.hand = ["BS07-074"]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    console.log("--- 1回目のバトル：BP+2000で勝ち、相手1体が疲労する ---")
    attackAndCast(s, attacker1, 0)
    assert(s.players.p1.battleVirtualInstances.length === 1, "このバトル限定の仮想発生源が1件立つ")
    const attackerInst1 = s.players.p1.field.spirits.find((x) => x.instanceId === attacker1)!
    assert(attackerInst1.battleBpBuff === 2000, "BP+2000はバトル寿命の側（battleBpBuff）に積まれる")
    assert(attackerInst1.tempBpBuff === 0, "ターン寿命の側には積まれない")
    assert(effectiveBp(s, "p1", attackerInst1) === 5000, "実効BPは3000+2000=5000")
    assert(declareBlock(s, "p2", blocker1) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        s.players.p2.field.spirits.every((x) => x.instanceId !== blocker1),
        "ブロッカーはBP比較で破壊されている",
    )
    const watcherInst = () => s.players.p2.field.spirits.find((x) => x.instanceId === watcher)
    assert(watcherInst()?.isRested === true, "battleWonの効果で相手1体が疲労した")
    assert(s.players.p1.battleVirtualInstances.length === 0, "バトル終了で貸与が切れる")

    console.log("--- BP+2000も同じ寿命（このバトルの間）---")
    const attackerInst2 = () => s.players.p1.field.spirits.find((x) => x.instanceId === attacker2)!
    assert(
        (attackerInst2().battleBpBuff ?? 0) === 0 && attackerInst2().tempBpBuff === 0,
        "強化されなかった側（2体目）にはBP増減が残っていない",
    )
    assert(
        s.players.p1.field.spirits.every((x) => (x.battleBpBuff ?? 0) === 0),
        "バトル終了で battleBpBuff が0に戻る（2回目のバトルへ持ち越さない）",
    )
    assert(effectiveBp(s, "p1", attackerInst1) === 3000, "強化された側の実効BPも3000へ戻っている")

    console.log("--- 2回目のバトル：勝っても疲労させない ---")
    watcherInst()!.isRested = false // 検証用に回復させておく（2回目で再び疲労するかを見る）
    const blocker2 = putSpirit(s, "p2", "BS02-014", 1) // BP2000。アリゲイドLv1（BP3000）に一方的に負ける
    assert(act(s, "p1", { type: "attack", instanceId: attacker2 }) === null, "2体目でアタック")
    assert(declareBlock(s, "p2", blocker2) === null, "p2がブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(
        s.players.p2.field.spirits.every((x) => x.instanceId !== blocker2),
        "2回目もBP比較で相手だけが破壊されている（＝battleWonの条件自体は成立している）",
    )
    assert(watcherInst()?.isRested === false, "2回目のバトルでは疲労効果が発揮されない")
}

console.log("=== BS07-079 ブルームフルート：ブロックされたときのライフ回復はそのバトル限り ===")
{
    const s = createGame("bs07-079-battle-scope", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    // 百合の妖精ユリィ Lv2（コア2）＝【聖命】持ち・BP2000
    const attacker1 = putSpirit(s, "p1", "BS07-040", 2)
    const attacker2 = putSpirit(s, "p1", "BS07-040", 2)
    const blocker1 = putSpirit(s, "p2", "BS02-014", 1) // ファンタズマ Lv1 BP2000（相打ち）
    s.players.p1.hand = ["BS07-079"]
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    console.log("--- 1回目のバトル：ブロック宣言でライフにコアが置かれる ---")
    const lifeBefore = s.players.p1.life
    attackAndCast(s, attacker1, 0)
    assert(s.players.p1.battleVirtualInstances.length === 1, "このバトル限定の仮想発生源が1件立つ")
    assert(declareBlock(s, "p2", blocker1) === null, "p2がブロック")
    assert(s.players.p1.life === lifeBefore + 1, "ボイドからライフへコア1個が置かれた")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    assert(s.players.p1.battleVirtualInstances.length === 0, "バトル終了で貸与が切れる")

    console.log("--- 2回目のバトル：ブロックされてもライフは増えない ---")
    const lifeAfter1 = s.players.p1.life
    const blocker2 = putSpirit(s, "p2", "BS02-014", 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker2 }) === null, "2体目でアタック")
    assert(declareBlock(s, "p2", blocker2) === null, "p2がブロック")
    assert(s.players.p1.life === lifeAfter1, "2回目のバトルではライフが増えない")
}

console.log("=== ターンをまたいでも貸与は残らない（endTurnのリセット） ===")
{
    const s = createGame("lend-battle-endturn", { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    runTurnStart(s)
    // バトルが成立しないままターンが終わる経路の保険（PhaseManager側のリセット）
    s.players.p1.battleVirtualInstances.push(createInstance("BS07-071", s.turn, 0))
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(s.players.p1.battleVirtualInstances.length === 0, "ターン終了でも空になる")
}
