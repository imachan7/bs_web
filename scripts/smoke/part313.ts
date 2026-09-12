// smoke パート313（BS14赤バッチ21種）
// バースト持ち（BS14-010/091/092/094/X01/X012R）と、確認済み解釈3枚
// （BS14-093の「バーストがセットされている間」＝自分のバーストのみ／BS14-073のBP+累積／
//  BS14-X01のcondition:ownLifeAtMostが破壊のほうだけに掛かる）を確認する
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    getCard,
    minLevelCores,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { placeBurst } from "../../server/src/logic/EffectModules"
import { fireFieldEventTriggers, resolveMagic } from "../../server/src/logic/triggers"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== 前提: BS14赤カード定義（cardIdのズレ検出） ===")
{
    assert(getCard("BS14-010").name === "皇牙獣キンタローグ・ベアー", "BS14-010は皇牙獣キンタローグ・ベアー")
    assert(getCard("BS14-091").name === "双光気弾", "BS14-091は双光気弾")
    assert(getCard("BS14-092").name === "烈光閃刃", "BS14-092は烈光閃刃")
    assert(getCard("BS14-093").name === "リベレイションオーラ", "BS14-093はリベレイションオーラ")
    assert(getCard("BS14-094").name === "天翔龍神覇", "BS14-094は天翔龍神覇")
    assert(getCard("BS14-X01").name === "龍の覇王ジーク・ヤマト・フリード", "BS14-X01は龍の覇王ジーク・ヤマト・フリード")
    assert(getCard("X012R").name === "英雄皇ロード・ドラゴン・ドミニオン", "X012Rは英雄皇ロード・ドラゴン・ドミニオン")
    assert(getCard("BS14-073").name === "赤き前方後円墳", "BS14-073は赤き前方後円墳")
}

console.log("=== BS14-010 皇牙獣キンタローグ・ベアー：バースト（破壊2体。その後ドロー1枚） ===")
{
    const s = game("bs14-010-burst")
    placeBurst(s, "p1", "BS14-010")
    const w1 = createInstance("BS01-001", s.turn, 1)
    w1.cores = 0
    const w2 = createInstance("BS01-030", s.turn, 1)
    w2.cores = 0
    s.players.p2.field.spirits.push(w1, w2)
    refreshLevelAsOverrides(s)
    const deckBefore = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === w1.instanceId), "BP4000以下のw1を破壊した")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === w2.instanceId), "BP4000以下のw2を破壊した")
    assert(s.players.p1.deck.length === deckBefore - 1, "その後ドロー1枚（破壊数によらず固定）")
}

console.log("=== BS14-010：『このスピリットの召喚時』BP4000以下2体を破壊 ===")
{
    const s = game("bs14-010-onsummon")
    const kin = createInstance("BS14-010", s.turn, minLevelCores(getCard("BS14-010")))
    const w1 = createInstance("BS01-001", s.turn, 1)
    w1.cores = 0
    s.players.p1.field.spirits.push(kin)
    s.players.p2.field.spirits.push(w1)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", kin, { type: "destroy", count: 2, filter: { maxBp: 4000 } })
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === w1.instanceId), "召喚時にBP4000以下を破壊する")
}

console.log("=== BS14-010 Lv2-3：系統「皇獣」を持つ自分のスピリットがアタックしたとき、そのBP以下の相手を破壊 ===")
{
    const s = game("bs14-010-atk")
    const kin = createInstance("BS14-010", s.turn, 3) // Lv2のコア数
    s.players.p1.field.spirits.push(kin)
    const prey = createInstance("BS01-001", s.turn, 1)
    prey.cores = 0
    s.players.p2.field.spirits.push(prey)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: kin.instanceId }) === null, "皇獣を持つkin自身でアタック宣言")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === prey.instanceId), "そのスピリットのBP以下の相手を破壊した")
}

console.log("=== BS14-091 双光気弾：バースト（ドロー2枚。その後payでフラッシュ＝ブレイヴかネクサスを破壊） ===")
{
    const s = game("bs14-091-burst")
    placeBurst(s, "p1", "BS14-091")
    const deckBefore = s.players.p1.deck.length
    fireFieldEventTriggers(s, "p1", "ownSpiritDestroyed", undefined, undefined, undefined, undefined, {
        byOpponentEffect: true,
    })
    assert(s.players.p1.deck.length === deckBefore - 2, "相手による自分のスピリット破壊後、2枚ドローする")
}

console.log("=== BS14-092 烈光閃刃：バースト（BP3000以下すべて破壊。その後payでメイン＝ブレイヴかブレイヴかスピリット手札に） ===")
{
    const s = game("bs14-092-burst")
    placeBurst(s, "p1", "BS14-092")
    const weakOwn = createInstance("BS01-001", s.turn, 1)
    weakOwn.cores = 0
    const weakOpp = createInstance("BS01-030", s.turn, 1)
    weakOpp.cores = 0
    s.players.p1.field.spirits.push(weakOwn)
    s.players.p2.field.spirits.push(weakOpp)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === weakOwn.instanceId), "修飾なし「スピリット」＝自陣も破壊対象")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === weakOpp.instanceId), "相手側も破壊対象")
}

console.log("=== BS14-092メイン効果：bravesAnyOrSpiritColorFilter（ブレイヴか赤のスピリット） ===")
{
    const s = game("bs14-092-recover")
    s.players.p1.trashCards = ["BS11-051", "BS01-001", "BS01-030"] // 紫ブレイヴ／赤スピリット／紫スピリット
    resolveAction(s, "p1", null, {
        type: "recoverSpiritFromTrash",
        count: 1,
        bravesAnyOrSpiritColorFilter: "red",
    })
    const hand = s.players.p1.hand
    assert(
        hand.includes("BS11-051") || hand.includes("BS01-001"),
        "ブレイヴ（色問わず）か赤のスピリットのいずれかが手札に戻る",
    )
    assert(!hand.includes("BS01-030"), "紫のスピリットは対象にならない")
}

console.log("=== BS14-010の器：recoverSpiritFromTrash costAtMostOrHasBurst（コスト4以下かバースト持ち） ===")
{
    const s = game("bs14-005-recover")
    // BS14-001: コスト1・バーストなし／BS14-010: コスト6・バーストあり／BS14-009: コスト6・バーストなし
    s.players.p1.trashCards = ["BS14-009", "BS14-010", "BS14-001"]
    resolveAction(s, "p1", null, {
        type: "recoverSpiritFromTrash",
        count: 2,
        costAtMostOrHasBurst: 4,
    })
    const hand = s.players.p1.hand
    assert(hand.includes("BS14-001"), "コスト4以下は対象になる")
    assert(hand.includes("BS14-010"), "コストが4を超えてもバースト持ちなら対象になる")
    assert(!hand.includes("BS14-009"), "コスト4超・バーストなしは対象にならない")
}

console.log("=== BS14-094 天翔龍神覇：バースト（ネクサス2つ破壊。その後payでフラッシュ＝BP6000以下を破壊） ===")
{
    const s = game("bs14-094-burst")
    placeBurst(s, "p1", "BS14-094")
    const n1 = createInstance("BS14-073", s.turn, 0)
    const n2 = createInstance("BS14-074", s.turn, 0)
    s.players.p2.field.nexuses.push(n1, n2)
    fireFieldEventTriggers(s, "p1", "opponentSummonEffectResolved")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサス2つを破壊する")
}

console.log("=== BS14-X01 龍の覇王ジーク・ヤマト・フリード：バースト（ライフ3以下でだけ破壊、召喚は常に発揮） ===")
{
    // ライフ3以下：破壊も召喚も発揮する
    const s = game("bs14-x01-low-life")
    s.players.p1.life = 3
    placeBurst(s, "p1", "BS14-X01")
    const prey = createInstance("BS01-001", s.turn, 1)
    s.players.p2.field.spirits.push(prey)
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === prey.instanceId), "ライフ3以下なら相手を破壊する")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-X01"), "この効果発揮後、コストを支払わずに自身を召喚する")

    // ライフ4（3を超える）：破壊は発揮しないが、召喚は「この効果発揮後」なので常に発揮する
    const s2 = game("bs14-x01-high-life")
    s2.players.p1.life = 4
    placeBurst(s2, "p1", "BS14-X01")
    const prey2 = createInstance("BS01-001", s2.turn, 1)
    s2.players.p2.field.spirits.push(prey2)
    fireFieldEventTriggers(s2, "p1", "ownLifeDamaged")
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === prey2.instanceId),
        "ライフ4なら破壊は発揮しない（conditionは破壊のほうだけに掛かる）",
    )
    assert(
        s2.players.p1.field.spirits.some((sp) => sp.cardId === "BS14-X01"),
        "破壊が不発でも、召喚はconditionの成否によらず発揮する",
    )
}

console.log("=== BS14-X01 Lv3-4：自分のバーストをセットしているとき、このスピリットのBP以下の相手を破壊 ===")
{
    const s = game("bs14-x01-atk")
    const jiku = createInstance("BS14-X01", s.turn, 5) // Lv3のコア数
    s.players.p1.field.spirits.push(jiku)
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    const prey = createInstance("BS01-001", s.turn, 1)
    prey.cores = 0
    s.players.p2.field.spirits.push(prey)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(act(s, "p1", { type: "attack", instanceId: jiku.instanceId }) === null, "アタック宣言")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === prey.instanceId), "バーストセット中はBP以下の相手を破壊する")
}

console.log("=== X012R 英雄皇ロード・ドラゴン・ドミニオン：バースト（自身を召喚する） ===")
{
    const s = game("x012r-burst")
    placeBurst(s, "p1", "X012R")
    fireFieldEventTriggers(s, "p1", "ownLifeDamaged")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "X012R"), "自分のライフ減少後、このスピリットカードを召喚する")
}

console.log("=== X012R：『このスピリットの召喚時』バースト持ちをセットすることでドロー1枚（costSetBurstThenDraw） ===")
{
    const s = game("x012r-onsummon")
    const dom = createInstance("X012R", s.turn, minLevelCores(getCard("X012R")))
    s.players.p1.field.spirits.push(dom)
    s.players.p1.hand = ["BS14-091"] // バースト効果を持つカード（双光気弾）
    const deckBefore = s.players.p1.deck.length
    resolveAction(s, "p1", dom, { type: "costSetBurstThenDraw", count: 1 })
    assert(s.players.p1.burst === "BS14-091", "バースト持ちの手札カードがセットされる")
    assert(s.players.p1.deck.length === deckBefore - 1, "セットできたときだけ1枚ドローする")

    // バースト持ちが手札に無いときは不発（ドローしない）
    const s2 = game("x012r-onsummon-none")
    const dom2 = createInstance("X012R", s2.turn, minLevelCores(getCard("X012R")))
    s2.players.p1.field.spirits.push(dom2)
    s2.players.p1.hand = ["BS01-001"] // バースト効果を持たない
    const deckBefore2 = s2.players.p1.deck.length
    resolveAction(s2, "p1", dom2, { type: "costSetBurstThenDraw", count: 1 })
    assert(s2.players.p1.deck.length === deckBefore2, "バースト持ちの手札カードが無ければドローしない")
}

console.log("=== X012R Lv3：自分のバーストをセットしている間、BP+3000する ===")
{
    const s = game("x012r-aura")
    const dom = createInstance("X012R", s.turn, 5) // Lv3のコア数
    s.players.p1.field.spirits.push(dom)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const baseBp = effectiveBp(s, "p1", dom)
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    assert(effectiveBp(s, "p1", dom) === baseBp + 3000, "バーストセット中はBP+3000")
}

console.log("=== 確認済み解釈: BS14-093 リベレイションオーラ『バーストがセットされている間』＝自分のバーストのみ、BP+2000が累積 ===")
{
    const s = game("bs14-093")
    const attacker = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    const baseBp = effectiveBp(s, "p1", attacker)
    resolveMagic(s, "p1", "BS14-093", "flash")
    assert(effectiveBp(s, "p1", attacker) === baseBp + 2000, "バースト未セットならBP+2000のみ")

    const s2 = game("bs14-093-burstset")
    const attacker2 = createInstance("BS01-001", s2.turn, 1)
    s2.players.p1.field.spirits.push(attacker2)
    refreshLevelAsOverrides(s2)
    s2.phase = "attack"
    s2.battle = { attackerInstanceId: attacker2.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    const baseBp2 = effectiveBp(s2, "p1", attacker2)
    s2.players.p1.burst = "SD06-013"
    s2.players.p1.burstSet = true
    resolveMagic(s2, "p1", "BS14-093", "flash")
    assert(effectiveBp(s2, "p1", attacker2) === baseBp2 + 4000, "自分のバーストをセットしている間はBP+2000がさらに乗り合計+4000")

    // 相手のバーストは見ない（「自分の」の省略）
    const s3 = game("bs14-093-opp-burstset")
    const attacker3 = createInstance("BS01-001", s3.turn, 1)
    s3.players.p1.field.spirits.push(attacker3)
    refreshLevelAsOverrides(s3)
    s3.phase = "attack"
    s3.battle = { attackerInstanceId: attacker3.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    const baseBp3 = effectiveBp(s3, "p1", attacker3)
    s3.players.p2.burst = "SD06-013"
    s3.players.p2.burstSet = true
    resolveMagic(s3, "p1", "BS14-093", "flash")
    assert(effectiveBp(s3, "p1", attacker3) === baseBp3 + 2000, "相手だけがバーストをセットしていてもBP+2000のまま（自分のバーストだけを見る）")
}

console.log("=== 確認済み解釈: BS14-073 赤き前方後円墳：BP+1000が2つとも常時発揮で累積（バーストセット中は合計+2000） ===")
{
    const s = game("bs14-073")
    const nexus = createInstance("BS14-073", s.turn, 0)
    const ally = createInstance("BS01-001", s.turn, 1)
    s.players.p1.field.nexuses.push(nexus)
    s.players.p1.field.spirits.push(ally)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    const printedBp = currentLevel(ally).bp
    assert(effectiveBp(s, "p1", ally) === printedBp + 1000, "バースト未セットでは自分の赤スピリットすべてがBP+1000のみ")
    s.players.p1.burst = "SD06-013"
    s.players.p1.burstSet = true
    assert(effectiveBp(s, "p1", ally) === printedBp + 2000, "バーストをセットすると、さらにBP+1000が乗り合計+2000")
}

console.log("すべてのチェックに合格しました 🎉（part313）")
