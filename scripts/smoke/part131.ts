// smoke パート131（第六弾 BS06 バッチ8：赤の残り8枚）
//
// 実装したカード:
//   BS06-005 恐竜姫ジュラ／BS06-007 曲刀竜パラサウル／BS06-010 戦斧のアポロディノス／
//   BS06-011 鉄蠍竜スコルド・ゴラン／BS06-074 紅玉の火山弾／BS06-075 神鳴る霊峰／
//   BS06-093 ライトニングオーラ／BS06-X21 激神皇カタストロフドラゴン
// エンジン拡張:
//   immunityGrant.against に "bounce" を追加（hasBounceImmunity。isEffectBlockedにsourcePid引数を追加し、
//     returnToHand/returnAllToHandのガードでのみ判定＝自分自身の効果は対象外）
//   triggered.condition に targetHasColor / targetMaxCost を追加（onBlocked用）
//   fieldEvent.condition に firstAttackOfTurn を追加（anySpiritAttacked用）
//   deckReveal に familyFilter / returnToTop を追加
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    effectiveBp,
    effectiveCost,
    getCard,
    hasKeyword,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic, returnSpiritToHand } from "../../server/src/logic/EffectModules"

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
        ["BS06-005", "恐竜姫ジュラ"],
        ["BS06-007", "曲刀竜パラサウル"],
        ["BS06-010", "戦斧のアポロディノス"],
        ["BS06-011", "鉄蠍竜スコルド・ゴラン"],
        ["BS06-074", "紅玉の火山弾"],
        ["BS06-075", "神鳴る霊峰"],
        ["BS06-093", "ライトニングオーラ"],
        ["BS06-X21", "激神皇カタストロフドラゴン"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    assert(hasKeyword("BS06-011", "clash"), "鉄蠍竜スコルド・ゴランは【激突】を持つ")
    assert(hasKeyword("BS06-X21", "clash"), "激神皇カタストロフドラゴンは【激突】を持つ")
}

console.log("=== 虚神サイクル：BS06-010が場にいると手札のX21・X23（コスト10）が両方コスト6になる ===")
{
    const s = createGame("t131-kyoshin", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS06-010", 1) // Lv1
    assert(
        effectiveCost(s, "p1", getCard("BS06-X21")) === 6,
        `X21がコスト6になる（実際: ${String(effectiveCost(s, "p1", getCard("BS06-X21")))}）`,
    )
    assert(
        effectiveCost(s, "p1", getCard("BS06-X23")) === 6,
        `X23がコスト6になる（実際: ${String(effectiveCost(s, "p1", getCard("BS06-X23")))}）`,
    )
}

console.log("=== BS06-010③：Lv2以上、【激突】持ちがバトルで勝利したらアポロディノス自身が回復 ===")
{
    const s = createGame("t131-apollo-heal", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const apollo = put(s, "p1", "BS06-010", 3) // Lv2
    apollo.isRested = true as boolean
    const scorlod = put(s, "p1", "BS06-011", 1) // Lv1【激突】BP4000
    const golladon = put(s, "p2", "BS01-001", 1) // ゴラドン Lv1 BP1000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: scorlod.instanceId }) === null, "スコルド・ゴランでアタック宣言")
    assert(declareBlock(s, "p2", golladon.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === golladon.instanceId), "ゴラドンが破壊される")
    assert(apollo.isRested === false, "勝利スピリット側でなくアポロディノス自身が回復する（selfMode:source）")
}

console.log("=== BS06-005：地竜は相手の効果でバウンスされない（地竜以外／自分の効果は通る） ===")
{
    const s = createGame("t131-jura-immune", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const jura = put(s, "p1", "BS06-005", 1) // Lv1（地竜）
    resolveMagic(s, "p2", "BS01-146", "flash", jura.instanceId) // 相手のドリームリボン（相手のスピリット1体を手札に戻す）
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === jura.instanceId),
        "地竜は相手の効果によるバウンスを受けない",
    )
}
{
    const s = createGame("t131-jura-nonjura", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const other = put(s, "p1", "BS01-001", 1) // ゴラドン（地竜でない）
    resolveMagic(s, "p2", "BS01-146", "flash", other.instanceId)
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === other.instanceId),
        "地竜以外は通常どおりバウンスされる",
    )
}
{
    const s = createGame("t131-jura-selfbounce", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const jura = put(s, "p1", "BS06-005", 1)
    returnSpiritToHand(s, "p1", jura) // 自分自身の効果によるバウンスは対象外
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === jura.instanceId),
        "自分の効果でのバウンスは免疫を貫通して通る",
    )
    assert(s.players.p1.hand.includes("BS06-005"), "手札に戻った")
}

console.log("=== BS06-011 Lv3：白にブロックされたら回復、赤では回復しない ===")
{
    const s = createGame("t131-scolgoran-white", { p1: "red", p2: "white" }, { p1: "red", p2: "white" })
    runTurnStart(s)
    const scorlod = put(s, "p1", "BS06-011", 4) // Lv3
    assert(currentLevel(scorlod).level === 3, `4コアでLv3（実際: ${String(currentLevel(scorlod).level)}）`)
    const blocker = put(s, "p2", "BS01-074", 1) // 白のスピリット（バーサーカー・ガン）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: scorlod.instanceId }) === null, "アタック宣言（疲労する）")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "白にブロックされる")
    assert(scorlod.isRested === false, "白にブロックされたので回復する")
}
{
    const s = createGame("t131-scolgoran-red", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const scorlod = put(s, "p1", "BS06-011", 4) // Lv3
    const blocker = put(s, "p2", "BS01-001", 1) // 赤のスピリット
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: scorlod.instanceId }) === null, "アタック宣言（疲労する）")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "赤にブロックされる")
    assert(scorlod.isRested === true, "赤にブロックされても回復しない")
}

console.log("=== BS06-X21①：召喚時、系統「古竜」1体につき1ドロー（自身も古竜として数える） ===")
{
    const s = createGame("t131-catastrophe-draw", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    put(s, "p1", "BS06-011", 1) // 古竜（他に1体）
    s.players.p1.hand[0] = "BS06-X21"
    s.players.p1.reserve = 20
    const deckBefore = s.players.p1.deck.length
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "激神皇カタストロフドラゴンを召喚")
    assert(
        deckBefore - s.players.p1.deck.length === 2,
        `古竜2体（自身+1体）ぶん2ドロー（実際: ${String(deckBefore - s.players.p1.deck.length)}枚）`,
    )
}

console.log("=== BS06-X21③：Lv3、コスト5以下にブロックされたら回復、コスト6では回復しない ===")
{
    const s = createGame("t131-catastrophe-heal", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const cata = put(s, "p1", "BS06-X21", 10) // Lv3
    assert(currentLevel(cata).level === 3, `10コアでLv3（実際: ${String(currentLevel(cata).level)}）`)
    const blocker = put(s, "p2", "BS01-001", 1) // コスト0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: cata.instanceId }) === null, "アタック宣言（疲労する）")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "コスト0にブロックされる")
    assert(cata.isRested === false, "コスト5以下にブロックされたので回復する")
}
{
    const s = createGame("t131-catastrophe-noheal", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const cata = put(s, "p1", "BS06-X21", 10) // Lv3
    const blocker = put(s, "p2", "BS06-011", 1) // コスト6
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: cata.instanceId }) === null, "アタック宣言（疲労する）")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "コスト6にブロックされる")
    assert(cata.isRested === true, "コスト6にブロックされても回復しない")
}

console.log("=== BS06-007①：アタック時デッキ上1枚公開、地竜なら手札へ・他はデッキの上に残る ===")
{
    const s = createGame("t131-parasaur-hit", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const parasaur = put(s, "p1", "BS06-007", 1) // Lv1
    s.players.p1.deck.unshift("BS06-005") // 地竜スピリット
    const handSizeBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: parasaur.instanceId }) === null, "アタック宣言")
    assert(s.players.p1.hand.length === handSizeBefore + 1, "地竜スピリットなら手札が1枚増える")
}
{
    const s = createGame("t131-parasaur-miss", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const parasaur = put(s, "p1", "BS06-007", 1)
    s.players.p1.deck.unshift("BS01-001") // 地竜でない
    const handSizeBefore = s.players.p1.hand.length
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: parasaur.instanceId }) === null, "アタック宣言")
    assert(s.players.p1.hand.length === handSizeBefore, "地竜でなければ手札は増えない")
    assert(s.players.p1.deck[0] === "BS01-001", "公開したカードはデッキの上に残る（returnToTop）")
}

console.log("=== BS06-007②：Lv2、アタック時 系統「地竜」1体につきBP+1000（自身も含む） ===")
{
    const s = createGame("t131-parasaur-buff", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const parasaur = put(s, "p1", "BS06-007", 3) // Lv2 BP5000
    put(s, "p1", "BS06-005", 1) // 地竜（もう1体）
    s.players.p1.deck.unshift("BS01-001") // 公開結果は本テストと無関係
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: parasaur.instanceId }) === null, "アタック宣言")
    assert(
        effectiveBp(s, "p1", parasaur) === 7000,
        `地竜2体（自身+1体）ぶんBP+2000（実際: ${String(effectiveBp(s, "p1", parasaur))}）`,
    )
}

console.log("=== BS06-074①：地竜がバトルで破壊／手札に戻ったとき、BP3000以下の相手を破壊 ===")
{
    const s = createGame("t131-volcano-battle", { p1: "red", p2: "purple" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-074", 0) // Lv1
    const jura = put(s, "p1", "BS06-005", 1) // 地竜 BP2000（負ける）
    const strong = put(s, "p2", "BS01-031", 4) // デス・ハーデス Lv2 BP7000
    const weak = put(s, "p2", "BS01-001", 1) // BP1000（破壊対象）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: jura.instanceId }) === null, "地竜でアタック宣言")
    assert(declareBlock(s, "p2", strong.instanceId) === null, "強いブロッカーで受ける")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === jura.instanceId), "地竜は破壊される")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === weak.instanceId), "BP3000以下の相手が破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === strong.instanceId), "BP3000超のブロッカーは残る")
}
{
    const s = createGame("t131-volcano-bounce", { p1: "red", p2: "purple" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-074", 0)
    const jura = put(s, "p1", "BS06-005", 1)
    const weak = put(s, "p2", "BS01-001", 1)
    returnSpiritToHand(s, "p1", jura)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === weak.instanceId), "手札に戻ったときも同様に発火する")
}

console.log("=== BS06-074②：Lv2、自分の赤スピリットに付与された効果で地竜を疲労させBP+ ===")
{
    const s = createGame("t131-volcano-grant", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-074", 2) // Lv2
    const attacker = put(s, "p1", "BS01-001", 1) // 赤（地竜でない）BP1000
    const jura = put(s, "p1", "BS06-005", 1) // 地竜 BP2000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(jura.isRested === true, "付与された効果で地竜が疲労する")
    assert(
        effectiveBp(s, "p1", attacker) === 3000,
        `疲労させた地竜のBP（2000）ぶんBP+（実際: ${String(effectiveBp(s, "p1", attacker))}）`,
    )
}

console.log("=== BS06-075①：【激突】持ちがバトルで破壊されたら、そのコアを自分のスピリットへ ===")
{
    const s = createGame("t131-thunderpeak-cores", { p1: "red", p2: "purple" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-075", 0) // Lv1
    const scorlod = put(s, "p1", "BS06-011", 3) // Lv2【激突】BP6000・3コア
    const recipient = put(s, "p1", "BS01-001", 1) // コアの受け取り先
    const strong = put(s, "p2", "BS01-031", 4) // BP7000（勝つ）
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: scorlod.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", strong.instanceId) === null, "強いブロッカーで受ける")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === scorlod.instanceId), "スコルド・ゴランは破壊される")
    assert(
        recipient.cores === 1 + 3,
        `破壊されたスピリットのコア3個が自分のスピリットへ移る（実際: ${String(recipient.cores)}）`,
    )
    assert(s.players.p1.reserve === reserveBefore, "リザーブへは残らない（自分のスピリットへ移動済み）")
}

console.log("=== BS06-075②：Lv2、自分のターン最初のアタックのみ【激突】持ちが回復する ===")
{
    const s = createGame("t131-thunderpeak-first", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-075", 3) // Lv2
    const first = put(s, "p1", "BS06-011", 1) // 【激突】Lv1
    const second = put(s, "p1", "BS06-011", 1) // 【激突】Lv1（もう1体）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: first.instanceId }) === null, "1体目でアタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(first.isRested === false, "最初のアタックなので回復する")
    assert(act(s, "p1", { type: "attack", instanceId: second.instanceId }) === null, "2体目でアタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(second.isRested === true, "2回目以降のアタックでは回復しない")
}

console.log("=== BS06-093：アタック中のみBP+1000、【激突】持ちはさらに+2000（合計+3000） ===")
{
    const s = createGame("t131-lightning-clash", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const scorlod = put(s, "p1", "BS06-011", 1) // 【激突】BP4000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: scorlod.instanceId }) === null, "アタック宣言")
    resolveMagic(s, "p1", "BS06-093", "flash")
    assert(
        effectiveBp(s, "p1", scorlod) === 4000 + 1000 + 2000,
        `【激突】持ちはBP+3000（実際: ${String(effectiveBp(s, "p1", scorlod) - 4000)}）`,
    )
}
{
    const s = createGame("t131-lightning-plain", { p1: "red", p2: "red" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    const golladon = put(s, "p1", "BS01-001", 1) // 【激突】なし BP1000
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: golladon.instanceId }) === null, "アタック宣言")
    resolveMagic(s, "p1", "BS06-093", "flash")
    assert(
        effectiveBp(s, "p1", golladon) === 1000 + 1000,
        `【激突】なしはBP+1000のみ（実際: ${String(effectiveBp(s, "p1", golladon) - 1000)}）`,
    )
}
