// smoke パート129（第六弾 BS06 バッチ6：黄19枚 ＋ エンジン拡張Y1〜Y10）
//
// 実装したカード:
//   BS06-049/050/051/052/053/054/055/056/057/058/059/060（スピリット）
//   BS06-085/086/087（ネクサス）／BS06-107/108/109/110（マジック）
// エンジン拡張:
//   Y1: exhaustSelf（発生源自身を疲労させる。唯一の入口exhaustSpirit経由）
//   Y2: kind:"summonedExhaustGrant"（発生源の持ち主から見た相手の召喚スピリットを疲労させる）
//   Y3: revealHandMagicToTegamotoDraw（手札のマジック1枚を手元へ+1ドローの単発版）
//   Y5: EffectCounter { anyNameIncludes }（両陣営でカード名に指定文字列を含む数）
//   Y6: reductionGrant.phase（このステップ中のみ有効）
//   Y9: summonFromHandFree.count（コスト最大から複数体、維持コア不足で打ち切り）
//   Y10: battleCompareByCores（BPの代わりにコア数を比較）
//   その他: reviveOnDestroy.colorFilter/condition・magicTargetRedirect.turn:"own"/protectCost・
//     magicBuffBonus.target:"ownAll"・AuraCounter { ownCost }
import {
    act,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { resolveMagic } from "../../server/src/logic/EffectModules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    for (const [cid, name] of [
        ["BS06-049", "ピョリット"],
        ["BS06-050", "雪ん子イエティ"],
        ["BS06-051", "グレムリー"],
        ["BS06-052", "ヒナペンタン"],
        ["BS06-053", "レーザーパンダ"],
        ["BS06-054", "占いペンタン"],
        ["BS06-055", "コットン・キャンデル"],
        ["BS06-056", "細剣の猫騎士ケット・シー"],
        ["BS06-057", "アルカナキング・カール"],
        ["BS06-058", "アルカナナイト・ヘクス"],
        ["BS06-059", "賢獣アイベリックス"],
        ["BS06-060", "天使長ファニム"],
        ["BS06-085", "混迷する魔法実験場"],
        ["BS06-086", "開かれし魔導書"],
        ["BS06-087", "夢中漂う桃幻郷"],
        ["BS06-107", "セカンドサイト"],
        ["BS06-108", "ディスコンティニュー"],
        ["BS06-109", "アルカイックスマイル"],
        ["BS06-110", "イマジンフィールド"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    for (const cid of ["BS06-049", "BS06-053", "BS06-055", "BS06-108"]) {
        assert(getCard(cid).effects.length === 0, `${cid}：効果文なし／未実装のためeffects空`)
    }
}

console.log("=== Y1: exhaustSelf（BS06-050 雪ん子イエティ）召喚時に自分が疲労する ===")
{
    const s = createGame("t129-yeti-exhaust", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-050"]
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0, level: 2 }) === null, "雪ん子イエティをLv2で召喚")
    const yeti = s.players.p1.field.spirits.find((x) => x.cardId === "BS06-050")!
    assert(yeti.isRested === true, "召喚時に自分が疲労する")
}

console.log("--- BS06-050 Lv2：相手のアタックステップに相手がマジックを使用すると回復する ---")
{
    const s = createGame("t129-yeti-refresh", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    const yeti = put(s, "p1", "BS06-050", 3) // Lv2
    yeti.isRested = true
    const attacker = put(s, "p2", "BS01-003", 1)
    s.turnPlayer = "p2" // p1から見て「相手のアタックステップ」
    s.phase = "attack"
    s.battle = {
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    s.players.p2.hand = ["BS06-109"] // アルカイックスマイル（フラッシュ）
    s.players.p2.reserve = 10
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "相手がフラッシュでマジックを使用")
    const yetiAfter = s.players.p1.field.spirits.find((x) => x.instanceId === yeti.instanceId)
    assert(yetiAfter?.isRested === false, "相手のマジック使用でイエティが回復する")
}

console.log("=== Y2: summonedExhaustGrant（BS06-060 天使長ファニム）===")
{
    const s = createGame("t129-fanim-rested", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    const fanim = put(s, "p1", "BS06-060", 2) // Lv2
    fanim.isRested = true
    s.turnPlayer = "p2"
    s.players.p2.hand = ["BS01-003"]
    s.players.p2.reserve = 10
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手（p2）が召喚")
    const summoned = s.players.p2.field.spirits.find((x) => x.cardId === "BS01-003")!
    assert(summoned.isRested === true, "ファニムが疲労中：相手の召喚スピリットは疲労する")
}
{
    const s = createGame("t129-fanim-refreshed", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    const fanim = put(s, "p1", "BS06-060", 2) // Lv2
    fanim.isRested = false
    s.turnPlayer = "p2"
    s.players.p2.hand = ["BS01-003"]
    s.players.p2.reserve = 10
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手（p2）が召喚")
    const summoned = s.players.p2.field.spirits.find((x) => x.cardId === "BS01-003")!
    assert(summoned.isRested === false, "ファニムが回復状態：相手の召喚スピリットは疲労しない")
}
{
    const s = createGame("t129-fanim-self", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    const fanim = put(s, "p1", "BS06-060", 2) // Lv2
    fanim.isRested = true
    s.players.p1.hand = ["BS01-003"]
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ファニムの持ち主（p1）自身が召喚")
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-003")!
    assert(summoned.isRested === false, "自分の召喚スピリットは疲労しない")
}

console.log("=== Y3: revealHandMagicToTegamotoDraw（BS06-054 占いペンタン）===")
{
    const s = createGame("t129-fortune-magic", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-054", "BS06-109"]
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "占いペンタンを召喚")
    assert(s.players.p1.tegamoto.includes("BS06-109"), "手札のマジックが手元へオープンされた")
    assert(!s.players.p1.hand.includes("BS06-109"), "手元へ移ったので手札には残らない")
    assert(s.players.p1.hand.length === 1, "1枚移動+1ドローで手札は正味1枚（召喚消費後0枚から+1ドロー）")
}
{
    const s = createGame("t129-fortune-nomagic", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-054"]
    s.players.p1.reserve = 10
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "占いペンタンを召喚（手札にマジック無し）")
    assert(s.players.p1.tegamoto.length === 0, "手札にマジックが無いため不発")
    assert(s.players.p1.hand.length === 0, "ドローもされない")
}

console.log("=== Y5: EffectCounter anyNameIncludes（BS06-058 アルカナナイト・ヘクス）===")
{
    const s = createGame("t129-hex-anyname", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    const hex = put(s, "p1", "BS06-058", 1) // Lv1
    put(s, "p1", "BS02-070", 1) // アルカナプリンス・オベロ（自陣営）
    put(s, "p2", "BS02-056", 1) // アルカナビースト・ケン（相手陣営）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: hex.instanceId }) === null, "ヘクスでアタック")
    assert(
        hex.tempBpBuff === 3000,
        "「アルカナ」を含む両陣営3体（自身＋自陣営1体＋相手陣営1体）ぶんBP+3000",
    )
}

console.log("=== Y9: summonFromHandFree.count（コスト最大から複数体、維持コア不足で打ち切り）===")
{
    const s = createGame("t129-count-cutoff", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.hand = ["BS03-067", "BS04-054", "BS02-066", "BS03-054", "BS02-056"] // コスト6/5/4/3/2の「アルカナ」持ち（維持コアは全て1）
    s.players.p1.reserve = 2
    resolveAction(s, "p1", null, { type: "summonFromHandFree", nameIncludes: "アルカナ", count: 4 })
    const summonedIds = s.players.p1.field.spirits.map((x) => x.cardId)
    assert(summonedIds.length === 2, "count=4を指定しても、リザーブ2ではコスト最大から2体までしか召喚できず打ち切られる")
    assert(
        summonedIds.includes("BS03-067") && summonedIds.includes("BS04-054"),
        "コスト最大から貪欲に選ばれる（コスト6→5の順）",
    )
    assert(s.players.p1.reserve === 0, "リザーブは使い切られる")
    assert(s.players.p1.hand.length === 3, "残り3枚は手札に残る")
}

console.log("=== Y10: battleCompareByCores（BS06-110 イマジンフィールド）===")
{
    const s = createGame("t129-imaginfield-cores", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "yellow" })
    runTurnStart(s)
    const atk = put(s, "p1", "BS02-074", 1) // 風船魔人バーバル：コア1・BP5000
    const blk = put(s, "p2", "BS02-001", 2) // リザドエッジ：コア2・BP2000
    s.players.p2.hand[0] = "BS06-110"
    s.players.p2.reserve = 20
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "バーバルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（フラッシュ①を閉じる）")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（フラッシュ①終了）")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "リザドエッジでブロック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "イマジンフィールドを使用（コア比較へ切り替え）")
    assert(s.battle?.compareByCores === true, "compareByCoresフラグが立つ")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(atk), "コアが1個しかないバーバルが破壊される（BPは高いのに）")
    assert(s.players.p2.field.spirits.includes(blk), "コア2個のリザドエッジは生存する")
}
console.log("--- 同コア数は相打ち ---")
{
    const s = createGame("t129-imaginfield-tie", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "yellow" })
    runTurnStart(s)
    const atk = put(s, "p1", "BS02-074", 1)
    const blk = put(s, "p2", "BS02-001", 1) // 同じコア1個
    s.players.p2.hand[0] = "BS06-110"
    s.players.p2.reserve = 20
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "バーバルでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "リザドエッジでブロック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "イマジンフィールドを使用")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス（バトル解決）")
    assert(!s.players.p1.field.spirits.includes(atk), "同コア数のため攻撃側も破壊される（相打ち）")
    assert(!s.players.p2.field.spirits.includes(blk), "同コア数のため防御側も破壊される（相打ち）")
}

console.log("=== BS06-056 細剣の猫騎士ケット・シー：コスト2のスピリットへの相手マジックの対象を自身に付け替える ===")
{
    const s = createGame("t129-ketsi-redirect-own", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const ketsi = put(s, "p1", "BS06-056", 1) // Lv1・BP4000
    ketsi.tempBpBuff = -500 // BP3500（コスト2側より低くしておく）
    const cost2 = put(s, "p1", "BS01-003", 1) // テラノセイバー：コスト2・BP4000
    s.turnPlayer = "p1" // 『自分のターン』（ケット・シーの持ち主のターン）
    resolveMagic(s, "p2", "BS03-120", "flash") // フレイムサイクロン：BP5000以下の相手スピリット1体を破壊（対象未指定＝BP上位を自動選択）
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === cost2.instanceId),
        "コスト2のテラノセイバーは対象から外れて生き残る",
    )
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === ketsi.instanceId),
        "代わりにケット・シーが破壊される",
    )
}
console.log("--- 相手のターンには働かない ---")
{
    const s = createGame("t129-ketsi-redirect-opp", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const ketsi = put(s, "p1", "BS06-056", 1)
    ketsi.tempBpBuff = -500
    const cost2 = put(s, "p1", "BS01-003", 1)
    s.turnPlayer = "p2" // 『相手のターン』＝ケット・シーの持ち主のターンではない
    resolveMagic(s, "p2", "BS03-120", "flash")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === cost2.instanceId),
        "相手のターンでは付け替えが働かず、BP上位のコスト2側が破壊される",
    )
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === ketsi.instanceId), "ケット・シーは残る")
}
console.log("--- Lv2-3：自分のコスト2のスピリット1体につきBP+1000 ---")
{
    const s = createGame("t129-ketsi-aura", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    const ketsi = put(s, "p1", "BS06-056", 2) // Lv2・基礎BP5000
    put(s, "p1", "BS01-003", 1) // コスト2 その1
    put(s, "p1", "BS01-003", 1) // コスト2 その2
    assert(effectiveBp(s, "p1", ketsi) === 5000 + 2000, "コスト2のスピリット2体ぶんBP+2000（5000→7000）")
}

console.log("=== BS06-057 アルカナキング・カール：召喚時「アルカナ」入りを手札から複数召喚 ===")
{
    const s = createGame("t129-karl-summon", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    s.players.p1.hand = ["BS06-057", "BS03-067", "BS04-054", "BS02-066", "BS03-054", "BS02-056"]
    s.players.p1.reserve = 30
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アルカナキング・カールを召喚")
    const summonedIds = s.players.p1.field.spirits.map((x) => x.cardId)
    assert(summonedIds.includes("BS06-057"), "カール自身は場にいる")
    const freeSummoned = summonedIds.filter((id) => id !== "BS06-057")
    assert(freeSummoned.length === 4, "手札の「アルカナ」入りスピリットが最大4枚まで無償召喚される")
    assert(!summonedIds.includes("BS02-056"), "コスト最小（2）のカードは4枚の枠から漏れる")
}
console.log("--- Lv2：コスト5の自分のスピリットすべてを「アルカナ」入り扱い ---")
{
    const s = createGame("t129-karl-nameas-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    put(s, "p1", "BS06-057", 3) // Lv2（cores3）
    put(s, "p1", "BS06-056", 1) // 細剣の猫騎士ケット・シー：コスト5・名前に「アルカナ」を含まない
    const probe = put(s, "p1", "BS02-049", 1)
    refreshLevelAsOverrides(s) // nameAsGrant等の継続付与（CardInstance.namesAsContinuous）を反映
    resolveAction(s, "p1", probe, {
        type: "selfBuffPer",
        counter: { ownNameIncludes: "アルカナ" },
        amountPer: 1000,
    })
    assert(
        probe.tempBpBuff === 2000,
        "カール自身＋コスト5のケット・シーの2体ぶんBP+2000（Lv2のnameAsGrantでケット・シーも「アルカナ」扱い）",
    )
}
{
    const s = createGame("t129-karl-nameas-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "yellow" })
    runTurnStart(s)
    put(s, "p1", "BS06-057", 1) // Lv1（nameAsGrant無し）
    put(s, "p1", "BS06-056", 1)
    const probe = put(s, "p1", "BS02-049", 1)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", probe, {
        type: "selfBuffPer",
        counter: { ownNameIncludes: "アルカナ" },
        amountPer: 1000,
    })
    assert(probe.tempBpBuff === 1000, "Lv1ではnameAsGrantが無いため、カール自身の1体分のみ")
}
