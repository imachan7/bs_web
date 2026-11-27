// smoke part1050（相手の「Lvコスト+1」は、入れ替え召喚・【不死】・繰り返しの召喚でも置くコアに足される。summonMinCores）
import { act, assert, createGame, createInstance, currentLevel, declareBlock, destroySpirit, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { canBattleSwapSummon } from "../../shared/summon"

const BAARU = "BS09-017" // 蛇凰神バァラル（Lv2-3で相手スピリットのLvコスト+1。Lv2=5コア）
const KARAKA = "BS06-026" // カラカロッサム（入れ替え元）
const SWAPPER = "BS07-022" // ブラックカラカロッサム（入れ替え召喚。Lv1=1コア）
const FUSHI = "BS17-011" // キャメロット・ナイト（【不死：コスト0】。Lv1=1コア・コスト2）
const COST0 = "BS01-001" // ゴラドン（コスト0）
const ANTMAN = "BS02-030" // 兵隊アントマン（Lv2『破壊時』に手札の怪虫を好きなだけ召喚）
const INSECT = "BS01-055" // エメアント（怪虫・コスト2・Lv1=1コア）
const FILLER = "BS01-008"

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(BAARU).name === "蛇凰神バァラル", "BAARU")
    assert(getCard(KARAKA).name === "カラカロッサム", "KARAKA")
    assert(getCard(SWAPPER).name === "ブラックカラカロッサム" && getCard(SWAPPER).levels[0]!.cores === 1, "SWAPPER")
    assert(getCard(FUSHI).name === "キャメロット・ナイト" && getCard(FUSHI).levels[0]!.cores === 1, "FUSHI")
    assert(getCard(COST0).name === "ゴラドン" && getCard(COST0).cost === 0, "COST0")
    assert(getCard(ANTMAN).name === "兵隊アントマン", "ANTMAN")
    assert(getCard(INSECT).name === "エメアント" && getCard(INSECT).family.includes("怪虫") && getCard(INSECT).levels[0]!.cores === 1, "INSECT")
}

function game(seed: string, baaru: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    if (baaru) s.players.p2.field.spirits.push(createInstance(BAARU, s.turn, 5))
    return s
}

console.log("=== 1. 入れ替え召喚：バァラルがいると2コアで出る／いなければ1コア ===")
for (const baaru of [true, false]) {
    const s = game(`swap-${String(baaru)}`, baaru)
    const orig = createInstance(KARAKA, s.turn, baaru ? 2 : 1) // バァラルがいるとLv1は2コアから
    s.players.p1.field.spirits.push(orig)
    const attacker = createInstance(FILLER, s.turn, 1)
    s.players.p2.field.spirits.push(attacker)
    s.players.p1.hand = [SWAPPER]
    s.turnPlayer = "p2"
    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(act(s, "p2", { type: "nextPhase" }) === null, "p2 のアタックステップへ")
    assert(act(s, "p2", { type: "attack", instanceId: attacker.instanceId }) === null, "p2 がアタック")
    assert(declareBlock(s, "p1", orig.instanceId) === null, "カラカロッサムでブロック")
    const want = baaru ? 2 : 1
    assert(canBattleSwapSummon(s, "p1", 0)?.placeCores === want, `事前判定の置くコアは${want}`)
    assert(act(s, "p1", { type: "summon", handIndex: 0, substituteInstanceId: orig.instanceId }) === null, "入れ替え召喚できる")
    const sp = s.players.p1.field.spirits.find((x) => x.cardId === SWAPPER)
    assert(sp?.cores === want && sp !== undefined && currentLevel(sp).level === 1, `置かれるコアは${want}・場に残る`)
}

console.log("=== 2. 【不死】：バァラルがいると2コアで出る／いなければ1コア ===")
for (const baaru of [true, false]) {
    const s = game(`fushi-${String(baaru)}`, baaru)
    s.phase = "attack" // 『お互いのアタックステップ』限定
    s.players.p1.trashCards.push(FUSHI)
    const bait = createInstance(COST0, s.turn, 1)
    s.players.p1.field.spirits.push(bait)
    refreshLevelAsOverrides(s)
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: bait.instanceId }])
    const sp = s.players.p1.field.spirits.find((x) => x.cardId === FUSHI)
    const want = baaru ? 2 : 1
    assert(sp !== undefined, "【不死】で場に出る")
    assert(sp?.cores === want, `置かれるコアは${want}（${String(sp?.cores)}）`)
}

console.log("=== 3. 繰り返しの召喚（アントマンの『破壊時』）：バァラルがいると2コアで出る／いなければ1コア ===")
for (const baaru of [true, false]) {
    const s = game(`repeat-${String(baaru)}`, baaru)
    s.turnPlayer = "p1"
    s.phase = "attack"
    const ant = createInstance(ANTMAN, s.turn, 3) // バァラルがいるとLv2は3コアから
    s.players.p1.field.spirits.push(ant)
    s.players.p1.hand = [INSECT]
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", ant.instanceId, "destroy")
    const sp = s.players.p1.field.spirits.find((x) => x.cardId === INSECT)
    const want = baaru ? 2 : 1
    assert(sp !== undefined, "手札の怪虫が召喚される")
    assert(sp?.cores === want, `置かれるコアは${want}（${String(sp?.cores)}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1050）")
