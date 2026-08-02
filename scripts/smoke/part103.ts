// smoke パート103（【粉砕】で破棄した枚数・内容を参照する効果、および勝利時のリザーブコスト任意発動）
//
// 背景：cards.json は「{"kind":"keyword", ...}」を1件書いた時点で「実装済み」と誤認されており、
// 同じカードの2つ目の効果（onAttack/onBattleWin）が丸ごと欠落していたカードが多数見つかった。
// 今回は次の5枚を実装する:
//   - BS03-096 巨人王ランドルフ Lv3：【粉砕】で破棄した枚数につき、相手スピリット1体からコアを相手リザーブへ
//   - BS04-063 二刀流のアムブローズ Lv2/Lv3：【粉砕】で破棄したスピリットカード1枚につきBP+1000
//   - BS04-075 伝説巨人ジュード Lv2/Lv3：【粉砕】でネクサスカードを破棄していたらバトル終了時に回復
//   - BS04-X15 カイザーアトラス皇帝 Lv2：バトル勝利時、自分のリザーブのコア1個を払うことで相手ライフのコア2個を相手リザーブへ
//   - BS04-004 ダークディノハウンド Lv3：バトル勝利時、自分以外の【覚醒】持ち自分スピリット1体を回復
//
// 新設した器: GameState.lastFunsai（直前の【粉砕】で破棄した内容。アタック宣言のたびにクリア）。
// resolveFunsai内で記録するが、onAttackの誘発（fireTrigger）より前に解決する必要がある
// （doAttack内の呼び出し順を修正済み。逆順だとlastFunsaiが常に空になる）。
import { act, assert, createGame, createInstance, declareBlock, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== BS03-096 巨人王ランドルフ Lv3：【粉砕】の破棄枚数ぶん、相手スピリット1体からコアを相手リザーブへ ===")
{
    const s = createGame("randolph-funsai-coreremove", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS03-096", 9) // Lv3（cores9・BP9000）
    const target = put(s, "p2", "BS01-001", 10) // ゴラドン：除去確認用にコアを多めに置く
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const reserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ランドルフでアタック宣言")
    assert(s.lastFunsai?.total === 3, "【粉砕】でLv3ぶん（3枚）破棄したことが記録される")
    assert(target.cores === 7, "相手スピリットからコア3個が取り除かれる（0個のままでないことを確認＝発火順序の回帰チェック）")
    assert(s.players.p2.reserve === reserveBefore + 3, "取り除いたコア3個が相手のリザーブに置かれる")
}

console.log("=== BS04-063 二刀流のアムブローズ Lv2：【粉砕】で破棄したスピリットカードの枚数ぶんBP+1000 ===")
{
    const s = createGame("ambrose-funsai-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-063", 3) // Lv2（cores3・BP3000）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    // Lv2の粉砕破棄枚数は2枚。スピリット1枚＋マジック1枚を仕込み、スピリット以外は数えないことを確認する
    s.players.p2.deck.unshift("BS01-001", "BS01-114")

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アムブローズでアタック宣言")
    assert(s.lastFunsai?.total === 2, "2枚破棄したことが記録される")
    assert(s.lastFunsai?.spirits === 1, "うちスピリットカードは1枚")
    assert(attacker.tempBpBuff === 1000, "スピリットカード1枚につきBP+1000（マジックは数えない）")
}

console.log("--- Lv3：破棄3枚中スピリット2枚（他系統が混ざっていても正しく数えられる） ---")
{
    const s = createGame("ambrose-funsai-lv3", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-063", 4) // Lv3（cores4・BP5000）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p2.deck.unshift("BS01-001", "BS01-002", "BS01-098") // スピリット・スピリット・ネクサス

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アムブローズでアタック宣言")
    assert(s.lastFunsai?.spirits === 2, "スピリットカード2枚とカウントされる")
    assert(attacker.tempBpBuff === 2000, "BP+2000（ネクサス1枚は数えない）")
}

console.log("=== BS04-075 伝説巨人ジュード Lv2：【粉砕】でネクサスカードを破棄していたらバトル終了時に回復 ===")
{
    const s = createGame("jude-funsai-nexus", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-075", 4) // Lv2（cores4・BP7000）
    const blocker = put(s, "p2", "BS01-001", 1) // 弱小ブロッカー（BP1000）：アタッカーが確実に勝つ
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p2.deck.unshift("BS01-098", "BS01-114") // ネクサス・マジック（Lv2の粉砕破棄枚数=2）

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ジュードでアタック宣言")
    assert(s.lastFunsai?.nexuses === 1, "破棄したカードにネクサスが1枚含まれる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される")
    assert(attacker.isRested === false, "ネクサスを破棄していたため、バトル終了時に回復する")
}

console.log("--- ネクサスを破棄していなければバトル終了時に回復しない ---")
{
    const s = createGame("jude-funsai-no-nexus", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-075", 4)
    const blocker = put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p2.deck.unshift("BS01-001", "BS01-114") // スピリット・マジック（ネクサスなし）

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ジュードでアタック宣言")
    assert(s.lastFunsai?.nexuses === 0, "破棄したカードにネクサスは含まれない")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される")
    assert(attacker.isRested === true, "ネクサスを破棄していないため回復しない")
}

console.log("=== BS04-X15 カイザーアトラス皇帝 Lv2：勝利時、リザーブのコア1個を払って相手ライフのコア2個を相手リザーブへ ===")
{
    const s = createGame("kaiser-atlas-reserve-ok", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-X15", 4) // Lv2（cores4・BP9000）
    const blocker = put(s, "p2", "BS01-001", 1) // 弱小ブロッカー：BPを比べ相手のスピリットだけを破壊する
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p1.reserve = 5
    const p1ReserveBefore = s.players.p1.reserve
    const p2LifeBefore = s.players.p2.life
    const p2ReserveBefore = s.players.p2.reserve

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "カイザーアトラス皇帝でアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される（BP勝利）")
    assert(s.players.p1.reserve === p1ReserveBefore - 1, "自分のリザーブからコア1個をボイドへ払う")
    assert(s.players.p2.life === p2LifeBefore - 2, "相手ライフのコア2個が減る")
    // ライフから移る2個に加えて、BP負けで破壊されたブロッカー（ゴラドンLv1・コア1）のコアも
    // 持ち主のリザーブへ戻るため +3 になる
    assert(s.players.p2.reserve === p2ReserveBefore + 3, "減った分は相手のリザーブに置かれる")
}

console.log("--- リザーブが足りなければ不発（ログのみ・ライフは減らない） ---")
{
    const s = createGame("kaiser-atlas-reserve-shortage", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-X15", 4)
    const blocker = put(s, "p2", "BS01-001", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    s.players.p1.reserve = 0
    const p2LifeBefore = s.players.p2.life

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "カイザーアトラス皇帝でアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される（BP勝利）")
    assert(s.players.p1.reserve === 0, "リザーブは0のまま（払えない）")
    assert(s.players.p2.life === p2LifeBefore, "コストを払えず不発のため、相手のライフは減らない")
}

console.log("=== BS04-004 ダークディノハウンド Lv3：勝利時、自分以外の【覚醒】持ち自分スピリット1体を回復 ===")
{
    const s = createGame("dark-dino-hound", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS04-004", 6) // Lv3（cores6・BP7000）
    const ally = put(s, "p1", "BS04-004", 1) // 同名の別インスタンス（【覚醒】持ち）。疲労状態にしておく
    ally.isRested = true
    const blocker = put(s, "p2", "BS01-001", 1) // 弱小ブロッカー
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")

    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "ダークディノハウンドでアタック宣言")
    assert(attacker.isRested === true, "アタック宣言でアタッカー自身は疲労状態になる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "フラッシュ①を閉じてからブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(s.battle === null, "バトルが解決される（BP勝利）")
    assert(attacker.isRested === true, "自分自身（発生源）は回復対象にならない（excludeSelf）")
    // 代入で型が true に絞られてしまうため、フィールドから取り直して判定する
    const allyAfter = s.players.p1.field.spirits.find((sp) => sp.instanceId === ally.instanceId)
    assert(allyAfter?.isRested === false, "【覚醒】を持つ他の自分のスピリットが回復する")
}
