// smoke パート35（第三弾 BS03 最終バッチ4枚＋力奪う凱旋門e2追加）
// 収録セクション:
//   - kind levelAs target opponentNexusesAll / sourceLevels（BS03-085 ウッド・ゴレム）
//   - kind magicFreeGrant（BS03-064 薔薇人バロッサ）／magicRestriction noFreeCastOpponent（BS03-113 力奪う凱旋門e2）
//   - fieldEvent ownSpiritCoresRemovedByOpponent（BS03-109 極光の大地e1）
//   - coreStepBonus condition ownFieldHasFamily（BS03-109 極光の大地e2）
//   - EffectAction swapBattler（BS03-138 テレポートチェンジ）
import {
    assert,
    createGame,
    createInstance,
    currentLevel,
    effectiveBp,
    effectiveCost,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import { coreStepBonusFor } from "../../server/src/logic/EffectModules"

console.log("=== ウッド・ゴレム：相手ネクサスすべてをLv1として扱う（Lv2効果は発揮されない） ===")
{
    const s = createGame(
        "woodgolem-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "blue", p2: "green" },
    )
    runTurnStart(s)
    const golem = createInstance("BS03-085", s.turn, 4) // Lv2（4コア）
    s.players.p1.field.spirits.push(golem)
    const hill = createInstance("BS01-109", s.turn, 2) // 風吹く丘陵Lv2（Lv2専用オーラ+1000持ち）
    s.players.p2.field.nexuses.push(hill)
    const summonedSpirit = createInstance("BS01-002", s.turn, 1)
    s.players.p2.field.spirits.push(summonedSpirit)
    refreshLevelAsOverrides(s)
    assert(currentLevel(hill).level === 1, "ゴレムLv2で相手ネクサスはLv1として扱われる")
    assert(
        effectiveBp(s, "p2", summonedSpirit) === currentLevel(summonedSpirit).bp,
        "Lv2専用オーラ（召喚ターン+1000）は発揮されない",
    )
    golem.cores = 1 // ゴレムをLv1に戻す
    refreshLevelAsOverrides(s)
    assert(currentLevel(hill).level === 2, "ゴレムがLv1のときは相手ネクサスのLvを書き換えない（sourceLevels完全一致）")
}

console.log("=== 薔薇人バロッサ：自分のアタックステップに黄マジックを無償化 ===")
{
    const s = createGame(
        "barossa-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "blue" },
    )
    runTurnStart(s)
    const barossa = createInstance("BS03-064", s.turn, 4) // Lv2（4コア）
    s.players.p1.field.spirits.push(barossa)
    const puppetString = getCard("BS03-134") // 黄マジック・コスト2・軽減[黄,黄]
    s.phase = "main"
    assert(
        effectiveCost(s, "p1", puppetString) === 1,
        "メインステップは無償化されず、バロッサのシンボル軽減のみ効く（コスト2-1）",
    )
    s.phase = "attack"
    assert(effectiveCost(s, "p1", puppetString) === 0, "自分のアタックステップは黄マジックが無償になる")

    const gate = createInstance("BS03-113", s.turn, 2) // 力奪う凱旋門Lv2（noFreeCastOpponent）
    s.players.p2.field.nexuses.push(gate)
    assert(
        effectiveCost(s, "p1", puppetString) === 1,
        "相手の力奪う凱旋門Lv2があると無償化は適用されず通常コストに戻る",
    )
}

console.log("=== 極光の大地e1：相手の効果でスピリットのコアが取り除かれたとき自分のリザーブ+1 ===")
{
    const s = createGame(
        "koukounodaichi-e1-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const daichi = createInstance("BS03-109", s.turn, 0) // Lv1（e1はLv1･Lv2共通）
    s.players.p1.field.nexuses.push(daichi)
    const p1Spirit = createInstance("BS01-002", s.turn, 2) // 維持コア1・現在2個
    s.players.p1.field.spirits.push(p1Spirit)
    const before = s.players.p1.reserve
    resolveAction(s, "p2", null, { type: "coreRemove", count: 1 }, p1Spirit.instanceId)
    assert(
        s.players.p1.reserve === before + 2,
        `相手のcoreRemoveで、除去された分(1)+極光の大地のボーナス(1)=2だけリザーブ増加（実際${s.players.p1.reserve - before}）`,
    )
}

console.log("=== 極光の大地e2：自分のフィールドに系統「武装」がいるときコアステップ+1 ===")
{
    const s = createGame(
        "koukounodaichi-e2-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "white", p2: "red" },
    )
    runTurnStart(s)
    const daichi = createInstance("BS03-109", s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(daichi)
    assert(coreStepBonusFor(s, "p1") === 0, "武装スピリットがいなければコアステップ+1は発生しない")
    const busou = createInstance("BS01-084", s.turn, 3) // ガトリングスタンド（系統:武装）
    s.players.p1.field.spirits.push(busou)
    assert(coreStepBonusFor(s, "p1") === 1, "武装スピリットがいればコアステップ+1")
}

console.log("=== テレポートチェンジ：バトル中の自分のスピリットを疲労スピリットと入れ替える ===")
{
    const s = createGame(
        "teleportchange-test",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "blue" },
    )
    runTurnStart(s)
    s.turnPlayer = "p1"
    const attackerA = createInstance("BS01-002", s.turn, 1)
    attackerA.isRested = true
    const restedB = createInstance("BS01-002", s.turn, 1)
    restedB.isRested = true
    s.players.p1.field.spirits.push(attackerA, restedB)
    s.battle = {
        attackerInstanceId: attackerA.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s, "p1", null, { type: "swapBattler" })
    assert(
        s.battle.attackerInstanceId === restedB.instanceId,
        "アタッカー側：疲労状態のスピリット（実効BP最大）と入れ替わる",
    )

    // 入れ替え候補（疲労中のほかのスピリット）がいない場合は不発
    const s2 = createGame(
        "teleportchange-test2",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "blue" },
    )
    runTurnStart(s2)
    s2.turnPlayer = "p1"
    const onlyAttacker = createInstance("BS01-002", s2.turn, 1)
    onlyAttacker.isRested = true
    s2.players.p1.field.spirits.push(onlyAttacker)
    s2.battle = {
        attackerInstanceId: onlyAttacker.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s2, "p1", null, { type: "swapBattler" })
    assert(
        s2.battle.attackerInstanceId === onlyAttacker.instanceId,
        "入れ替えられる疲労スピリットがいなければ不発",
    )

    // 使用者がバトルに参加していない（ブロック未宣言の防御側）場合は不発
    const s3 = createGame(
        "teleportchange-test3",
        { p1: "アキラ", p2: "ユウキ" },
        { p1: "yellow", p2: "blue" },
    )
    runTurnStart(s3)
    s3.turnPlayer = "p1"
    const attackerC = createInstance("BS01-002", s3.turn, 1)
    attackerC.isRested = true
    const p2Rested = createInstance("BS01-002", s3.turn, 1)
    p2Rested.isRested = true
    s3.players.p1.field.spirits.push(attackerC)
    s3.players.p2.field.spirits.push(p2Rested)
    s3.battle = {
        attackerInstanceId: attackerC.instanceId,
        blockerInstanceId: null,
        flashLockedPlayer: null,
        directed: false,
    }
    resolveAction(s3, "p2", null, { type: "swapBattler" })
    assert(
        s3.battle.attackerInstanceId === attackerC.instanceId && s3.battle.blockerInstanceId === null,
        "ブロック未宣言の防御側（バトル非参加）は不発",
    )
}
