// smoke パート110（§5-A バッチ：既存の器＋小さなフィールド追加で書ける4枚）
// 新設した機構:
//   - constraintGrant の minSymbols（シンボル数で対象を絞る。最古龍の顎Lv2）
//   - constraintGrant の nameIncludes（カード名で対象を絞る。天焦がす大聖火Lv2）
//   - canDirectAttack の targetMinCost（指定アタックの対象をコスト下限で絞る。天焦がす大聖火Lv2）
//   - fieldEvent の nameIncludes / targetSameLevelAsSelf（ペンタン帝国Lv2）
//   - fieldEvent "ownSpiritBlocked" の self にブロックされたスピリットを渡すよう変更（refreshSelf 用）
// 実装したカード:
//   - BS03-X10 凍獣マン・モール Lv2/Lv3（自分のスピリットすべてに装甲を継続付与）
//   - BS05-056 最古龍の顎 Lv2（シンボル2つ以上はBP4000以上を指定アタック）
//   - BS05-066 天焦がす大聖火 Lv2（「巨人」はコスト5以上を指定アタック）
//   - BS05-064 ペンタン帝国 Lv2（同Lvの相手にブロックされたとき回復）
import { assert, act, declareBlock, createGame, createInstance, getCard, hasArmorAgainst, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { directAttackFilter } from "../../shared/rules"
import { matchesDirectedAttackFilter } from "../../shared/block"

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number) {
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
    assert(getCard("BS03-X10").name === "凍獣マン・モール", "BS03-X10 は凍獣マン・モール")
    assert(getCard("BS05-056").name === "最古龍の顎", "BS05-056 は最古龍の顎")
    assert(getCard("BS05-066").name === "天焦がす大聖火", "BS05-066 は天焦がす大聖火")
    assert(getCard("BS05-064").name === "ペンタン帝国", "BS05-064 はペンタン帝国")
    assert(getCard("BS04-010").symbol.length === 2, "BS04-010 雷帝エール・クレルはシンボル2つ")
    assert(getCard("BS01-001").symbol.length === 1, "BS01-001 ゴラドンはシンボル1つ")
    assert(getCard("BS05-051").name === "巨人騎士アルダス", "BS05-051 は巨人騎士アルダス")
}

console.log("=== BS03-X10 凍獣マン・モール Lv2：自分のスピリットすべてに装甲：赤/紫/緑 ===")
{
    const s = createGame("bs03-x10-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS03-X10", 5) // Lv2（コア5）
    const ally = putSpirit(s, "p1", "BS01-001", 1)
    const enemy = putSpirit(s, "p2", "BS01-001", 1)
    refreshLevelAsOverrides(s)
    assert(hasArmorAgainst(ally, ["red"]) === true, "自分のスピリットは装甲：赤を得る")
    assert(hasArmorAgainst(ally, ["purple"]) === true, "装甲：紫も得る")
    assert(hasArmorAgainst(ally, ["green"]) === true, "装甲：緑も得る")
    assert(hasArmorAgainst(ally, ["yellow"]) === false, "Lv2では黄は含まれない")
    assert(hasArmorAgainst(ally, ["blue"]) === false, "Lv2では青は含まれない")
    assert(hasArmorAgainst(enemy, ["red"]) === false, "相手のスピリットには付与されない")
}

console.log("=== BS03-X10 Lv3：装甲：赤/紫/緑/黄/青 に広がる ===")
{
    const s = createGame("bs03-x10-lv3", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS03-X10", 8) // Lv3（コア8）
    const ally = putSpirit(s, "p1", "BS01-001", 1)
    refreshLevelAsOverrides(s)
    for (const color of ["red", "purple", "green", "yellow", "blue"] as const) {
        assert(hasArmorAgainst(ally, [color]) === true, `Lv3では装甲：${color} を得る`)
    }
}

console.log("=== BS03-X10 Lv1：装甲は付与されない（levels:[2]/[3]） ===")
{
    const s = createGame("bs03-x10-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putSpirit(s, "p1", "BS03-X10", 1) // Lv1
    const ally = putSpirit(s, "p1", "BS01-001", 1)
    refreshLevelAsOverrides(s)
    assert(hasArmorAgainst(ally, ["red"]) === false, "Lv1では装甲を配らない")
}

console.log("=== BS05-056 最古龍の顎 Lv2：シンボル2つ以上はBP4000以上を指定アタックできる ===")
{
    const s = createGame("bs05-056-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-056", 2) // Lv2
    const doubleSymbol = putSpirit(s, "p1", "BS04-010", 1) // シンボル2つ
    const singleSymbol = putSpirit(s, "p1", "BS01-001", 1) // シンボル1つ
    assert(directAttackFilter(s, "p1", doubleSymbol) !== null, "シンボル2つ以上は指定アタックを得る")
    assert(directAttackFilter(s, "p1", singleSymbol) === null, "シンボル1つには付与されない（minSymbols）")

    const filter = directAttackFilter(s, "p1", doubleSymbol)!
    const bigBp = putSpirit(s, "p2", "BS04-010", 3) // Lv2＝BP8000
    const smallBp = putSpirit(s, "p2", "BS01-001", 1) // BP1000
    assert(matchesDirectedAttackFilter(filter, bigBp, s, "p2") === null, "BP4000以上は指定できる")
    assert(matchesDirectedAttackFilter(filter, smallBp, s, "p2") !== null, "BP4000未満は指定できない")
}

console.log("=== BS05-056 Lv1／相手のターンでは付与されない ===")
{
    const s = createGame("bs05-056-lv1", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const nexus = putNexus(s, "p1", "BS05-056", 0) // Lv1
    const doubleSymbol = putSpirit(s, "p1", "BS04-010", 1)
    assert(directAttackFilter(s, "p1", doubleSymbol) === null, "Lv1では付与されない")
    nexus.cores = 2 // Lv2にする
    assert(directAttackFilter(s, "p1", doubleSymbol) !== null, "Lv2にすると付与される")
    s.turnPlayer = "p2"
    assert(directAttackFilter(s, "p1", doubleSymbol) === null, "『自分のアタックステップ』限定なので相手ターンでは付与されない")
}

console.log("=== BS05-066 天焦がす大聖火 Lv2：「巨人」はコスト5以上を指定アタックできる ===")
{
    const s = createGame("bs05-066-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-066", 3) // Lv2
    const giant = putSpirit(s, "p1", "BS05-051", 1) // 巨人騎士アルダス
    const other = putSpirit(s, "p1", "BS01-001", 1)
    assert(directAttackFilter(s, "p1", giant) !== null, "カード名に「巨人」を含むスピリットは指定アタックを得る")
    assert(directAttackFilter(s, "p1", other) === null, "「巨人」を含まないスピリットには付与されない（nameIncludes）")

    const filter = directAttackFilter(s, "p1", giant)!
    const cost6 = putSpirit(s, "p2", "BS04-010", 1) // コスト6
    const cost0 = putSpirit(s, "p2", "BS01-001", 1) // コスト0
    assert(matchesDirectedAttackFilter(filter, cost6, s, "p2") === null, "コスト5以上は指定できる")
    assert(matchesDirectedAttackFilter(filter, cost0, s, "p2") !== null, "コスト5未満は指定できない（targetMinCost）")
}

console.log("=== BS05-064 ペンタン帝国 Lv2：同Lvの相手にブロックされたとき回復する ===")
{
    const s = createGame("bs05-064-lv2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-064", 2) // Lv2
    const pentan = putSpirit(s, "p1", "BS02-058", 1) // ペンタン Lv1
    const blocker = putSpirit(s, "p2", "BS01-002", 1) // ロクケラトプス Lv1（同Lv）
    assert(act(s, "p1", { type: "attack", instanceId: pentan.instanceId }) === null, "ペンタンでアタックできる")
    assert(pentan.isRested === true, "アタックで疲労した")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "同Lvのスピリットでブロックできる")
    assert(pentan.isRested === false, "同Lvにブロックされたペンタンは回復する")
}

console.log("=== BS05-064 Lv2：Lvが違うブロッカーでは回復しない ===")
{
    const s = createGame("bs05-064-difflv", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-064", 2)
    const pentan = putSpirit(s, "p1", "BS02-058", 1) // Lv1
    const blocker = putSpirit(s, "p2", "BS01-002", 2) // ロクケラトプス Lv2
    assert(act(s, "p1", { type: "attack", instanceId: pentan.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    assert(pentan.isRested === true, "Lvが違うので回復しない（targetSameLevelAsSelf）")
}

console.log("=== BS05-064 Lv2：名前が該当しないスピリットは回復しない ===")
{
    const s = createGame("bs05-064-name", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    putNexus(s, "p1", "BS05-064", 2)
    const other = putSpirit(s, "p1", "BS01-001", 1) // ゴラドン Lv1
    const blocker = putSpirit(s, "p2", "BS01-002", 1) // Lv1（同Lv）
    assert(act(s, "p1", { type: "attack", instanceId: other.instanceId }) === null, "アタックできる")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックできる")
    assert(other.isRested === true, "「ペンタン」/「アンプルール」を含まない名前では回復しない（nameIncludes）")
}
