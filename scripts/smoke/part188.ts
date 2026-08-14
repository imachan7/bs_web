// smoke パート188（第九弾「超星」＝カバレッジで実行実績0だった経路を潰す）
//
// `npm run coverage:effects` が「カードデータに書いてあるのに一度も発火していない」と報告した
// BS09 の効果エントリを、**カードデータ経由で**動かして固定する。
import {
    assert,
    createGame,
    createInstance,
    destroySpirit,
    effectiveCost,
    fireStepTriggers,
    getCard,
    hasArmorAgainst,
    refreshLevelAsOverrides,
    runTurnStart,
    spiritHasKeyword,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { fireTrigger } from "../../server/src/logic/EffectModules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== BS09-061 巨獣守りし神域：「巨獣」/「戯狩」がブロックしたときコア1個 ===")
{
    const s: GameState = createGame("bs09-061", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    putNexus(s, "p1", "BS09-061", 0) // Lv1
    const kyoju = put(s, "p1", "BS09-035", 1) // 巨獣皇スミドロード＝「巨獣」/「戯狩」
    const other = put(s, "p1", "BS09-030", 1) // 白銀の守護者リン＝「氷姫」
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", kyoju, "onBlock")
    assert(kyoju.cores === 2, "「巨獣」持ちがブロックするとボイドからコア1個が置かれる")
    fireTrigger(s, "p1", other, "onBlock")
    assert(other.cores === 1, "対象外の系統には置かれない")
}

console.log("=== BS09-030 白銀の守護者リン Lv2：「氷姫」に【装甲：紫/青】を与える ===")
{
    const s: GameState = createGame("bs09-030", { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    put(s, "p1", "BS09-030", 2) // Lv2（付与元）
    const guna = put(s, "p1", "BS09-034", 1) // 風花の戦乙女グナ＝「氷姫」
    const plain = put(s, "p1", "BS09-031", 1) // 守護巨獣ガラパーゾ＝「巨獣」
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", guna, "armor"), "「氷姫」は【装甲】を得る")
    assert(hasArmorAgainst(guna, ["purple"]), "紫の効果を受けない")
    assert(!hasArmorAgainst(plain, ["purple"]), "「氷姫」でないスピリットは得ない")
}

console.log("=== BS09-064 天駆ける方舟 Lv2：自分のマジックに軽減シンボル[黄]を与える ===")
{
    const s: GameState = createGame("bs09-064", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.phase = "attack"
    // 黄のシンボルを場に用意する（軽減は自分のフィールドの一致シンボル数ぶん効く）
    put(s, "p1", "BS09-042", 1) // 妖精騎士ピーター＝黄シンボル1
    const magic = getCard("BS09-078") // ヒーリングサークル（黄を含むマジック）
    const before = effectiveCost(s, "p1", magic)
    putNexus(s, "p1", "BS09-064", 2) // Lv2
    refreshLevelAsOverrides(s)
    const after = effectiveCost(s, "p1", magic)
    assert(after < before, `軽減シンボル[黄]が足され、コストが下がる（${before}→${after}）`)
}

console.log("=== BS09-026 軍艦長ドレッドノート Lv2：【暴風】持ちはバトルで破壊されると疲労状態で戻る ===")
{
    const s: GameState = createGame("bs09-026", { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    put(s, "p1", "BS09-026", 3) // Lv2（発生源）
    const bofu = put(s, "p1", "BS09-022", 1) // ミノバ子爵＝【暴風】持ち
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", bofu, "bofu"), "前提：【暴風】を持つ")
    destroySpirit(s, "p1", bofu.instanceId, "destroy", {
        sourcePid: "p2",
        sourceType: "spirit",
        battle: { attackerColors: ["red"] },
    })
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === bofu.instanceId), "バトルで破壊されても場に残る")
    assert(bofu.isRested, "疲労状態で戻る")
}

console.log("=== BS09-065 名工集いし大工房 Lv2：フィールドのコアだけでトラッシュのネクサスを配置 ===")
{
    const s: GameState = createGame("bs09-065", { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    putNexus(s, "p1", "BS09-065", 1) // Lv2
    // トラッシュに青のネクサス（BS09-066 目覚める要塞城＝コスト5）を置く
    s.players.p1.trashCards.push("BS09-066")
    // フィールドにコストぶんのコアを用意する（スピリット上に余分に載せる）
    const holder = put(s, "p1", "BS09-051", 10)
    const reserveBefore = s.players.p1.reserve
    const nexusesBefore = s.players.p1.field.nexuses.length
    fireStepTriggers(s, "end")
    assert(s.players.p1.field.nexuses.length === nexusesBefore + 1, "トラッシュからネクサスが配置される")
    assert(!s.players.p1.trashCards.includes("BS09-066"), "トラッシュから取り除かれる")
    assert(s.players.p1.reserve === reserveBefore, "リザーブは使わない")
    assert(holder.cores < 10, "フィールドのコアが支払いに使われる")
}
