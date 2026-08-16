// smoke パート97（トリガー改名 onBattle→onBattleWin と、新トリガー onBattleStart/onBattleLose の検証）
//
// 背景：『このスピリットのバトル時』は本来「アタック時またはブロック時（バトルが成立した時点）」を
// 意味するが、旧トリガー onBattle は「BPを比べ相手のスピリットだけを破壊したとき（勝利時）」にしか
// 発火しなかった。名前を意味に合わせて onBattleWin に改名し、勝敗を問わない『バトル時』を表す
// onBattleStart（バトル成立時点で発火）と、敗北時のみ発火する onBattleLose を新設した。
//
// 収録セクション:
//   - onBattleStart: アタック宣言時・ブロック宣言時の両方で、勝敗を問わず発火（BS05-025 神樹ディオネアス）
//   - onBattleLose: BP比較で負けた側でのみ発火し、相打ちでは発火しない（BS03-036 神鳥ピーゴッド）
//   - onBattleWin: 改名後も従来どおり勝った側だけで発火する（回帰確認。BS01-047 魔女ナージャ）
//   - BS05-053 蒼海の竜使いアズール：誤実装（onBattleのため勝敗依存だった）をonBattleStartに修正し、勝敗不問で発火することを確認
import { act, assert, createGame, createInstance, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function setup(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "p1アタックステップへ移行")
    return s
}

console.log("=== onBattleStart: アタック宣言直後（バトル解決より前）に、勝敗を問わず発火する ===")
{
    const s = setup("battlestart-attacker")
    const dionaea = put(s, "p1", "BS05-025", 3) // 神樹ディオネアス Lv2（コア3・BP8000）
    put(s, "p2", "BS01-001", 1) // ゴラドン Lv1（BP1000）＝ブロッカー候補（未使用）

    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "attack", instanceId: dionaea.instanceId }) === null, "ディオネアスでアタック宣言")
    assert(
        s.players.p1.reserve === reserveBefore + 1,
        "アタック宣言直後（バトル解決の前）にonBattleStartが発火してコア+1",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "takeLife" }) === null, "ブロックせずライフで受けることを宣言")
}

console.log("--- onBattleStart: ブロック宣言直後（バトル解決より前）にも発火する ---")
{
    const s = setup("battlestart-blocker")
    const atk = put(s, "p1", "BS01-001", 1) // ゴラドン Lv1（BP1000）＝アタッカー
    const dionaea = put(s, "p2", "BS05-025", 3) // 神樹ディオネアス Lv2（コア3・BP8000）＝ブロッカー
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ゴラドンでアタック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")

    const reserveBeforeBlock = s.players.p2.reserve
    assert(act(s, "p2", { type: "block", instanceId: dionaea.instanceId }) === null, "ディオネアスでブロック宣言")
    assert(
        s.players.p2.reserve === reserveBeforeBlock + 1,
        "ブロック宣言直後（バトル解決の前）にonBattleStartが発火してコア+1",
    )
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
}

console.log("--- onBattleStart: 勝ち・負け・相打ちのいずれでも発火する（BS05-025） ---")
{
    console.log("勝ち")
    {
        const s = setup("battlestart-win")
        const dionaea = put(s, "p1", "BS05-025", 3) // Lv2 BP8000
        const foe = put(s, "p2", "BS01-001", 1) // Lv1 BP1000（そのまま＝ディオネアスの勝ち）
        const reserveBefore = s.players.p1.reserve
        assert(act(s, "p1", { type: "attack", instanceId: dionaea.instanceId }) === null, "アタック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
        assert(act(s, "p2", { type: "block", instanceId: foe.instanceId }) === null, "ブロック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
        assert(s.players.p1.field.spirits.includes(dionaea), "勝利：ディオネアスは生存")
        assert(!s.players.p2.field.spirits.includes(foe), "勝利：相手が破壊される")
        assert(s.players.p1.reserve === reserveBefore + 1, "勝利でもonBattleStartのコア+1は発生済み")
    }
    console.log("負け")
    {
        const s = setup("battlestart-lose")
        const dionaea = put(s, "p1", "BS05-025", 3) // Lv2 BP8000
        const foe = put(s, "p2", "BS01-001", 1) // BP1000+8000=9000でディオネアスの負け
        foe.tempBpBuff = 8000
        const reserveBefore = s.players.p1.reserve
        assert(act(s, "p1", { type: "attack", instanceId: dionaea.instanceId }) === null, "アタック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
        assert(act(s, "p2", { type: "block", instanceId: foe.instanceId }) === null, "ブロック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
        assert(!s.players.p1.field.spirits.includes(dionaea), "敗北：ディオネアスが破壊される")
        assert(s.players.p2.field.spirits.includes(foe), "敗北：相手は生存")
        // onBattleStartのコア+1（宣言時）＋destroySpiritによる自身のコア3個の払い戻し＝合計+4
        assert(s.players.p1.reserve === reserveBefore + 4, "敗北でもonBattleStartのコア+1は発生済み（+破壊による払い戻し3）")
    }
    console.log("相打ち")
    {
        const s = setup("battlestart-draw")
        const dionaea = put(s, "p1", "BS05-025", 3) // Lv2 BP8000
        const foe = put(s, "p2", "BS01-001", 1) // BP1000+7000=8000で相打ち
        foe.tempBpBuff = 7000
        const reserveBefore = s.players.p1.reserve
        assert(act(s, "p1", { type: "attack", instanceId: dionaea.instanceId }) === null, "アタック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
        assert(act(s, "p2", { type: "block", instanceId: foe.instanceId }) === null, "ブロック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
        assert(!s.players.p1.field.spirits.includes(dionaea), "相打ち：ディオネアスも破壊される")
        assert(!s.players.p2.field.spirits.includes(foe), "相打ち：相手も破壊される")
        assert(s.players.p1.reserve === reserveBefore + 4, "相打ちでもonBattleStartのコア+1は発生済み（+破壊による払い戻し3）")
    }
}

console.log("=== onBattleLose: BP比較で負けた側だけで発火し、相打ちでは発火しない（BS03-036） ===")
{
    console.log("--- アタッカーが負けたとき ---")
    {
        const s = setup("battlelose-attacker")
        const pigod = put(s, "p1", "BS03-036", 1) // 神鳥ピーゴッド Lv1（コア1・BP4000）
        const foe = put(s, "p2", "BS01-001", 1) // BP1000+4000=5000でピーゴッドの負け
        foe.tempBpBuff = 4000
        const reserveBefore = s.players.p1.reserve
        assert(act(s, "p1", { type: "attack", instanceId: pigod.instanceId }) === null, "ピーゴッドでアタック")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
        assert(act(s, "p2", { type: "block", instanceId: foe.instanceId }) === null, "ブロック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
        assert(!s.players.p1.field.spirits.includes(pigod), "ピーゴッドが破壊される")
        // onBattleLoseのコア+4（ボイドから）＋destroySpiritによる自身のコア1個の払い戻し＝合計+5
        assert(s.players.p1.reserve === reserveBefore + 5, "onBattleLoseが発火しコア+4（+破壊による払い戻し1）")
    }
    console.log("--- ブロッカーが負けたとき ---")
    {
        const s = setup("battlelose-blocker")
        const atk = put(s, "p1", "BS01-001", 1) // BP1000+4000=5000でピーゴッドの負け
        atk.tempBpBuff = 4000
        const pigod = put(s, "p2", "BS03-036", 1) // Lv1（コア1・BP4000）＝ブロッカー
        const reserveBefore = s.players.p2.reserve
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
        assert(act(s, "p2", { type: "block", instanceId: pigod.instanceId }) === null, "ピーゴッドでブロック")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
        assert(!s.players.p2.field.spirits.includes(pigod), "ピーゴッドが破壊される")
        assert(s.players.p2.reserve === reserveBefore + 5, "onBattleLoseが発火しコア+4（+破壊による払い戻し1）")
    }
    console.log("--- 相打ちでは発火しない ---")
    {
        const s = setup("battlelose-draw")
        const atk = put(s, "p1", "BS01-001", 1) // BP1000+3000=4000でピーゴッドと相打ち
        atk.tempBpBuff = 3000
        const pigod = put(s, "p2", "BS03-036", 1) // Lv1（コア1・BP4000）＝ブロッカー
        const reserveBefore = s.players.p2.reserve
        assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
        assert(act(s, "p2", { type: "block", instanceId: pigod.instanceId }) === null, "ピーゴッドでブロック")
        assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
        assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
        assert(!s.players.p2.field.spirits.includes(pigod), "相打ちでピーゴッドも破壊される")
        // 相打ちではonBattleLoseが発火しないため、増えるのは破壊による払い戻し1個分だけ
        assert(s.players.p2.reserve === reserveBefore + 1, "相打ちではonBattleLoseが発火しない（コア+4は無し）")
    }
}

console.log("=== onBattleWin: 改名後も従来どおり勝った側だけで発火する（回帰確認。BS01-047 魔女ナージャ） ===")
{
    const s = setup("battlewin-regression")
    const nadja = put(s, "p1", "BS01-047", 1) // 魔女ナージャ Lv1 BP3000
    const blocker1 = put(s, "p2", "BS01-001", 1) // ゴラドン Lv1 BP1000
    const bystander = put(s, "p2", "BS01-001", 1) // 疲労付与の対象

    assert(act(s, "p1", { type: "attack", instanceId: nadja.instanceId }) === null, "ナージャでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker1.instanceId }) === null, "ゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.includes(blocker1), "BPで負けたブロッカーが破壊される")
    assert(bystander.isRested === true, "onBattleWin誘発：勝利で相手スピリット1体が疲労する")

    console.log("--- 相打ちではonBattleWinが発火しない ---")
    bystander.isRested = false
    const nadja2 = put(s, "p1", "BS01-047", 1) // Lv1 BP3000
    const blocker2 = put(s, "p2", "BS01-001", 3) // Lv2 BP3000（同BP＝相打ち）
    assert(act(s, "p1", { type: "attack", instanceId: nadja2.instanceId }) === null, "2体目のナージャでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blocker2.instanceId }) === null, "同BPのゴラドンでブロック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(nadja2), "相打ちでナージャも破壊される")
    assert(bystander.isRested === false, "相打ちではonBattleWinが発火しない（疲労しない）")
}

console.log("=== BS05-053 蒼海の竜使いアズール：バトルするたびに相手のデッキ上から5枚破棄する（勝敗不問） ===")
{
    const s = setup("azul-millperbattle")
    const azul = put(s, "p1", "BS05-053", 4) // 蒼海の竜使いアズール Lv2（コア4・BP9000）
    const weakFoe = put(s, "p2", "BS01-001", 1) // 弱いブロッカー（アズールの勝ち）
    const strongFoe = put(s, "p2", "BS01-001", 1) // 強化してアズールの負けにする

    console.log("--- 勝ったとき ---")
    const trashBefore1 = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "attack", instanceId: azul.instanceId }) === null, "アズールでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: weakFoe.instanceId }) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.players.p1.field.spirits.includes(azul), "アズールは勝って生存")
    // trashCardsはデッキのミル先とスピリット破壊先が共通のため、
    // ミル5枚に加え破壊されたweakFoe自身のカードも1枚積まれる（合計+6）
    assert(s.players.p2.trashCards.length === trashBefore1 + 6, "勝利でも相手のデッキが5枚トラッシュへ")

    console.log("--- 負けたとき ---")
    azul.isRested = false // 2回目のアタックのため回復させる
    strongFoe.tempBpBuff = 9000 // BP1000+9000=10000でアズールの負け
    const trashBefore2 = s.players.p2.trashCards.length
    assert(act(s, "p1", { type: "attack", instanceId: azul.instanceId }) === null, "アズールで再度アタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: strongFoe.instanceId }) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(azul), "アズールは負けて破壊される")
    assert(s.players.p2.trashCards.length === trashBefore2 + 5, "敗北でも相手のデッキが5枚トラッシュへ（勝敗不問）")
}
