// smoke パート64（BS05-071 リアニメイト：マジックが「このターンの間」継続効果を貸す機構の検証）
//
// TURN_EFFECT_SOURCES.md の設計（PlayerState.turnVirtualInstances / effectSources() / lendSelfThisTurn）を
// 実際にマジックを使って通す。「ハンドラが呼ばれる」だけでは no-op を見逃すため、必ず
// castMagic → ブロック → フラッシュ → バトル解決の実対戦経路を通し、【呪撃】持ちが疲労状態で
// 自分のフィールドに戻ることまで確認する。
import { assert, act, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

// フィールドにスピリットを直接置くヘルパー（cores はレベルが立つ数を渡す）
function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// 1回のバトルをアタック宣言から解決まで進める共通手順（p1がアタック、p2がブロック）。
// riAnimateHandIndex を指定すると、ブロック後のフラッシュで防御側(p2)がリアニメイトを使用する
function runBattle(
    s: GameState,
    attackerId: string,
    blockerId: string,
    castRiAnimate: boolean,
): void {
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attackerId }) === null, "p1がアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blockerId }) === null, "p2がブロック")
    assert(
        s.isFlashTiming === true && s.priorityPlayer === "p2",
        "ブロック後フラッシュ再オープン・防御側に優先権",
    )
    if (castRiAnimate) {
        assert(
            act(s, "p2", { type: "castMagic", handIndex: 0 }) === null,
            "防御側がリアニメイトをフラッシュで使用",
        )
        // castMagicで優先権が攻撃側(p1)へ移るため、p1→p2の順でパスする
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス→バトル解決")
    } else {
        // 何も使わない場合、ブロック直後の優先権は防御側(p2)のまま
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス→バトル解決")
    }
}

console.log("=== BS05-071 リアニメイト：使用時は【呪撃】持ちがBP比較破壊の代わりに疲労状態で戻る ===")
{
    const s = createGame("bs05-071-revive", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const attacker = putSpirit(s, "p1", "BS01-025", 1) // 要塞龍ギガ Lv1 BP5000
    const jugeki = putSpirit(s, "p2", "BS02-015", 1) // ハンプダンプ Lv1 BP1000・【呪撃】
    s.players.p2.hand = ["BS05-071"]
    s.players.p2.reserve = 20

    runBattle(s, attacker, jugeki, true)

    assert(s.players.p2.turnVirtualInstances.length === 1, "p2に仮想発生源が1件立つ")
    const revived = s.players.p2.field.spirits.find((x) => x.instanceId === jugeki)
    assert(revived !== undefined, "ハンプダンプは破壊されず自分のフィールドに残る")
    assert(revived?.isRested === true, "疲労状態で戻る")
    assert(!s.players.p2.trashCards.includes("BS02-015"), "トラッシュへは送られていない")

    console.log("--- ターンが終わると効果が消える ---")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1ターン終了")
    assert(s.players.p2.turnVirtualInstances.length === 0, "p1のターン終了でp2の仮想発生源もリセットされる")
    assert(act(s, "p2", { type: "endTurn" }) === null, "p2ターン終了（何もせず）")
    // p1の2ターン目：p1のリフレッシュでattackerが、p2のリフレッシュでjugekiが回復している
    const attackerAfter = s.players.p1.field.spirits.find((x) => x.instanceId === attacker)!
    const jugekiAfter = s.players.p2.field.spirits.find((x) => x.instanceId === jugeki)!
    assert(attackerAfter.isRested === false, "テスト前提：攻撃側は回復状態")
    assert(jugekiAfter.isRested === false, "テスト前提：ハンプダンプも回復状態")

    runBattle(s, attacker, jugeki, false) // リアニメイトは使わない

    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === jugeki),
        "ターン終了後の再戦では貸与が効かず、ハンプダンプは通常どおり破壊される",
    )
    assert(s.players.p2.trashCards.includes("BS02-015"), "破壊されトラッシュへ送られる")
}

console.log("=== リアニメイトを使っていないときは戻らない（貸与が効いている証明） ===")
{
    const s = createGame("bs05-071-no-cast", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const attacker = putSpirit(s, "p1", "BS01-025", 1) // 要塞龍ギガ Lv1 BP5000
    const jugeki = putSpirit(s, "p2", "BS02-015", 1) // ハンプダンプ Lv1 BP1000・【呪撃】
    s.players.p2.hand = ["BS05-071"]
    s.players.p2.reserve = 20

    runBattle(s, attacker, jugeki, false) // リアニメイトを使わない

    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === jugeki),
        "リアニメイト未使用ではハンプダンプは通常どおり破壊される",
    )
    assert(s.players.p2.trashCards.includes("BS02-015"), "破壊されトラッシュへ送られる")
}

console.log("=== 【呪撃】を持たないスピリットは戻らない（keywordFilterが効いている証明） ===")
{
    const s = createGame("bs05-071-no-jugeki", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    const attacker = putSpirit(s, "p1", "BS01-025", 1) // 要塞龍ギガ Lv1 BP5000
    const nonJugeki = putSpirit(s, "p2", "BS01-002", 1) // ロクケラトプス Lv1 BP1000・キーワードなし
    s.players.p2.hand = ["BS05-071"]
    s.players.p2.reserve = 20

    runBattle(s, attacker, nonJugeki, true) // リアニメイトは使うが対象は呪撃を持たない

    assert(s.players.p2.turnVirtualInstances.length === 1, "貸与自体は成立している")
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === nonJugeki),
        "【呪撃】を持たないスピリットはkeywordFilterで対象外となり通常どおり破壊される",
    )
    assert(s.players.p2.trashCards.includes("BS01-002"), "破壊されトラッシュへ送られる")
}
