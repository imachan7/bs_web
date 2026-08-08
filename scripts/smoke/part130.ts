// smoke パート130（第六弾 BS06 バッチ7：緑の残り7枚）
//
// 実装したカード:
//   BS06-034 鉄拳のカクタスガルー／BS06-079 神葉樹の森／BS06-080 颶風高原／
//   BS06-099 サベージパワー／BS06-101 ミストラルコア／BS06-102 スピードスター／
//   BS06-X23 天帝ホウオウガ
// エンジン拡張:
//   refreshSelf.costReserveToVoid（BS06-X23Lv3）
//   voidCoreToSelfPerBofuCount（新アクション。BS06-080）
//   fieldEvent.excludeSelfAsEventTarget（BS06-034③）
//   AuraCondition { ownLifeAtMost }（BS06-034②）
//   battleBpAsLevel.keywordFilter（BS06-079Lv2）
//   EffectCounter "targetSymbols" ＋ bpBuffPerの対象基準カウント（BS06-099）
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
import { resolveMagic } from "../../server/src/logic/EffectModules"
import { reductionGrantSymbols } from "../../shared/cost"

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
        ["BS06-034", "鉄拳のカクタスガルー"],
        ["BS06-079", "神葉樹の森"],
        ["BS06-080", "颶風高原"],
        ["BS06-099", "サベージパワー"],
        ["BS06-101", "ミストラルコア"],
        ["BS06-102", "スピードスター"],
        ["BS06-X23", "天帝ホウオウガ"],
    ] as const) {
        assert(getCard(cid).name === name, `${cid} は${name}`)
    }
    assert(hasKeyword("BS06-X23", "bofu"), "天帝ホウオウガは【暴風】を持つ")
    assert(getCard("BS06-034").family.includes("虚神") === false, "カクタスガルー自身は虚神でない（対照用）")
}

console.log("=== BS06-X23【暴風：3】：ブロックされたとき相手が自分のスピリット3体を疲労させる ===")
{
    const s = createGame("t130-x23-bofu", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-X23", 1) // Lv1
    const blocker = put(s, "p2", "BS01-031", 4) // デス・ハーデス Lv2（ブロック宣言で疲労する）
    const c1 = put(s, "p2", "BS01-001", 1)
    const c2 = put(s, "p2", "BS01-005", 1)
    const c3 = put(s, "p2", "BS02-030", 1)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    assert(c1.isRested && c2.isRested && c3.isRested, "【暴風：3】で候補3体すべてが疲労する")
}

console.log("=== BS06-X23 Lv3：ライフを減らしたとき、リザーブ1個を払って回復（不足なら不発） ===")
{
    const s = createGame("t130-x23-life-ok", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-X23", 10) // Lv3
    assert(currentLevel(attacker).level === 3, `10コアでLv3（実際: ${String(currentLevel(attacker).level)}）`)
    s.players.p1.reserve = 5
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言（疲労する）")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(s.players.p1.reserve === 4, "リザーブ1個をボイドに払った")
    assert(attacker.isRested === false, "リザーブを払って回復した")
}
{
    const s = createGame("t130-x23-life-shortage", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS06-X23", 10)
    s.players.p1.reserve = 0
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(s.players.p1.reserve === 0, "リザーブは0のまま")
    assert(attacker.isRested === true, "リザーブが払えず不発、疲労したまま")
}

console.log("=== 虚神サイクル：手札のBS06-X23（コスト10）が場のコストMod持ちでコスト6になる ===")
// BS06-010（赤・戦斧のアポロディノス）と BS06-071（青）はこのバッチ時点で未実装のため対象外
// （相談事項参照）。実装済みの紫/緑/白/黄の4枚のみ確認する
for (const [cid, name, color] of [
    ["BS06-022", "斬首刀のシャドウスライサー", "purple"],
    ["BS06-034", "鉄拳のカクタスガルー", "green"],
    ["BS06-046", "鍵鎚のヴァルグリンド", "white"],
    ["BS06-056", "細剣の猫騎士ケット・シー", "yellow"],
] as const) {
    const s = createGame(`t130-kyoshin-${cid}`, { p1: "アキラ", p2: "ユウキ" }, { p1: color, p2: "red" })
    runTurnStart(s)
    put(s, "p1", cid, 1) // Lv1
    assert(
        effectiveCost(s, "p1", getCard("BS06-X23")) === 6,
        `${name}（${cid}）が場にいると天帝ホウオウガはコスト6になる（実際: ${String(effectiveCost(s, "p1", getCard("BS06-X23")))}）`,
    )
}

console.log("=== BS06-034②：自分のライフが3以下の間BP+3000（4以上では加算しない） ===")
{
    const s = createGame("t130-cactus-bp", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const cactus = put(s, "p1", "BS06-034", 1) // Lv1（BP4000）
    s.players.p1.life = 3
    assert(effectiveBp(s, "p1", cactus) === 7000, `ライフ3以下でBP+3000（実際: ${String(effectiveBp(s, "p1", cactus))}）`)
    s.players.p1.life = 4
    assert(effectiveBp(s, "p1", cactus) === 4000, `ライフ4以上では加算されない（実際: ${String(effectiveBp(s, "p1", cactus))}）`)
}

console.log("=== BS06-034③：他の【暴風】持ちがライフを減らしたら回復（自分自身では回復しない） ===")
{
    const s = createGame("t130-cactus-heal-other", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const cactus = put(s, "p1", "BS06-034", 3) // Lv2
    cactus.isRested = true
    const bofuAttacker = put(s, "p1", "BS06-028", 1) // ガブノハシ（【暴風】持ち）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: bofuAttacker.instanceId }) === null, "ガブノハシでアタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(!cactus.isRested, "他の【暴風】持ちがライフを減らしたのでカクタスガルーは回復する")
}
{
    const s = createGame("t130-cactus-heal-self", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const cactus = put(s, "p1", "BS06-034", 3) // Lv2（虚神サイクル自体はbofuを持たないが、③の「以外」判定確認には十分）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: cactus.instanceId }) === null, "カクタスガルー自身でアタック宣言（疲労する）")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(cactus.isRested === true, "自分自身がライフを減らしても回復しない（excludeSelfAsEventTarget）")
}

console.log("=== BS06-079：手札の【神速】持ちに軽減シンボル[緑]／Lv2で神速Lv1がバトル時にLv2BPを使う ===")
{
    const s = createGame("t130-shinyou-reduction", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-079", 0) // Lv1
    assert(
        JSON.stringify(reductionGrantSymbols(s, "p1", getCard("BS02-030"))) === JSON.stringify(["green"]),
        "神速持ち（兵隊アントマン）には軽減シンボル[緑]が付与される",
    )
    assert(
        reductionGrantSymbols(s, "p1", getCard("BS01-001")).length === 0,
        "神速を持たないカード（ゴラドン）には付与されない",
    )
}
{
    // 対照：ネクサスなしでは神速Lv1（BP1000）はゴラドンLv2（BP3000）に負ける
    const base = createGame("t130-shinyou-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(base)
    const atk0 = put(base, "p1", "BS02-030", 1) // 兵隊アントマン Lv1（BP1000／Lv2BPは4000）
    const blk0 = put(base, "p2", "BS01-001", 3) // ゴラドン Lv2（BP3000）
    assert(act(base, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(base, "p1", { type: "attack", instanceId: atk0.instanceId }) === null, "アタック宣言")
    assert(declareBlock(base, "p2", blk0.instanceId) === null, "ブロック宣言")
    assert(act(base, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(base, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        !base.players.p1.field.spirits.some((x) => x.instanceId === atk0.instanceId),
        "ネクサスなしならLv1（1000）の兵隊アントマンが破壊される",
    )

    const s = createGame("t130-shinyou-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-079", 2) // Lv2
    const atk = put(s, "p1", "BS02-030", 1) // 兵隊アントマン Lv1
    const blk = put(s, "p2", "BS01-001", 3) // ゴラドン Lv2（BP3000）
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "ブロック宣言")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側パス")
    assert(act(s, "p1", { type: "pass" }) === null, "攻撃側パス（バトル解決）")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === atk.instanceId),
        "Lv2の効果でLv2BP（4000）を使うので兵隊アントマンは生き残る",
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === blk.instanceId),
        "ゴラドン（3000）が破壊される",
    )
}

console.log("=== BS06-080：【暴風】持ちを召喚したらコアが乗る（暴風なしでは乗らない） ===")
{
    const s = createGame("t130-guufuu-with", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-080", 0) // Lv1
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS06-036" // 牙王樹ラフレシオー【暴風：2】
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "牙王樹ラフレシオーを召喚")
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS06-036")
    assert(!!summoned && summoned.cores === 3, `【暴風：2】ぶんコア+2（1+2=3。実際: ${String(summoned?.cores)}）`)
}
{
    const s = createGame("t130-guufuu-without", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS06-080", 0)
    s.players.p1.reserve = 20
    s.players.p1.hand[0] = "BS01-001" // ゴラドン（暴風なし）
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゴラドンを召喚")
    const summoned = s.players.p1.field.spirits.find((x) => x.cardId === "BS01-001")
    assert(!!summoned && summoned.cores === 1, `【暴風】なしではコアが乗らない（実際: ${String(summoned?.cores)}）`)
}

console.log("=== BS06-099 サベージパワー：シンボル1つで+2000、2つで+4000 ===")
{
    const s = createGame("t130-savage-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const target = put(s, "p1", "BS01-001", 1) // ゴラドン（シンボル1つ）
    resolveMagic(s, "p1", "BS06-099", "flash", target.instanceId)
    assert(target.tempBpBuff === 2000, `シンボル1つでBP+2000（実際: ${String(target.tempBpBuff)}）`)
}
{
    const s = createGame("t130-savage-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const target = put(s, "p1", "BS04-010", 1) // 雷帝エール・クレル（シンボル2つ）
    resolveMagic(s, "p1", "BS06-099", "flash", target.instanceId)
    assert(target.tempBpBuff === 4000, `シンボル2つでBP+4000（実際: ${String(target.tempBpBuff)}）`)
}

console.log("=== BS06-101 ミストラルコア：フラッシュでBP+2000 ===")
{
    const s = createGame("t130-mistral", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const target = put(s, "p1", "BS01-001", 1)
    resolveMagic(s, "p1", "BS06-101", "flash", target.instanceId)
    assert(target.tempBpBuff === 2000, `フラッシュでBP+2000（実際: ${String(target.tempBpBuff)}）`)
}

console.log("=== BS06-102 スピードスター：ライフを減らすたびボイドからリザーブへ2個／フラッシュでBP+3000 ===")
{
    const s = createGame("t130-speedstar", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const attacker = put(s, "p1", "BS01-001", 1)
    resolveMagic(s, "p1", "BS06-102", "main")
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    assert(takeLifeAndResolve(s, "p2") === null, "相手はライフで受ける")
    assert(
        s.players.p1.reserve === reserveBefore + 2,
        `ライフを減らしたのでリザーブ+2（実際: +${String(s.players.p1.reserve - reserveBefore)}）`,
    )
}
{
    const s = createGame("t130-speedstar-flash", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    const target = put(s, "p1", "BS01-001", 1)
    resolveMagic(s, "p1", "BS06-102", "flash", target.instanceId)
    assert(target.tempBpBuff === 3000, `フラッシュでBP+3000（実際: ${String(target.tempBpBuff)}）`)
}
