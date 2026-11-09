// smoke パート872（召喚時効果を発揮しない召喚でも、ほかのカードの「自分のスピリットが召喚されたとき」は出る。RESUME_STACK §6・2026-11-08 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart, destroySpirit } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const MAMON = "BS15-064" // 冥府へ続く魔門（Lv2で疲労させて【不死】を無償召喚。召喚時は発揮されない）
const FOGNIX = "BS14-021" // 不紫鳥フォグニクス（紫・コスト6・【不死】）召喚時：Lv数だけドロー
const ZENAS = "BS11-016" // 邪眼皇ゼナス：【不死】で召喚されたとき、疲労状態の相手スピリット1体を破壊
const ANT = "BS02-030" // 兵隊アントマン Lv2 破壊時：手札の怪虫を召喚（召喚時は発揮されない）
const KIRI = "BS01-065" // キリカブト（緑・コスト4・怪虫）召喚時：ボイドからコア1個を自分のスピリットに置く
const TOWER = "BS19-090" // 凍てつくつららの逆塔 Lv1-2：自分の緑のスピリットが召喚されたとき、ボイドからコア1個を白のスピリットに置く
const WHITE = "BS01-074" // 白のスピリット（コスト1）
const VANILLA = "BS01-002" // ロクケラトプス
const COST4 = "BS01-089" // デュアルキャノン・ベル（コスト4・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string][] = [
        [MAMON, "冥府へ続く魔門"], [FOGNIX, "不紫鳥フォグニクス"], [ZENAS, "邪眼皇ゼナス"], [ANT, "兵隊アントマン"],
        [KIRI, "キリカブト"], [TOWER, "凍てつくつららの逆塔"], [VANILLA, "ロクケラトプス"], [COST4, "デュアルキャノン・ベル"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(WHITE).colors.join() === "white" && getCard(WHITE).type === "spirit", "WHITE は白のスピリット")
    assert(getCard(KIRI).family.includes("怪虫") && getCard(KIRI).cost === 4, "キリカブトは怪虫・コスト4")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = []
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. 魔門の無償【不死】：自身の召喚時は出ず、ゼナスの誘発は出る ===")
{
    const s = game("p872-1")
    s.phase = "attack"
    s.players.p1.reserve = 1 // 通常のコストは払えない＝魔門の無償だけが残る
    s.players.p1.trashCards = [FOGNIX]
    const mamon = createInstance(MAMON, s.turn, 2)
    s.players.p1.field.nexuses.push(mamon)
    put(s, "p1", ZENAS, 1)
    const victim = put(s, "p1", COST4, 1)
    const foe = put(s, "p2", VANILLA, 1)
    foe.isRested = true
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: victim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.field.spirits.some((x) => x.cardId === FOGNIX), "フォグニクスが魔門の無償で召喚される")
    assert(mamon.isRested, "魔門が疲労している")
    assert(s.players.p1.hand.length === 0, `フォグニクス自身の召喚時（ドロー）は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "ゼナスの「【不死】で召喚されたとき」で疲労状態の相手スピリットが破壊される")
}

console.log("=== 2. アントマンの破壊時召喚：自身の召喚時は出ず、逆塔の誘発は出る ===")
{
    const s = game("p872-2")
    s.phase = "main"
    s.players.p1.reserve = 8
    s.players.p1.trashCores = 0
    s.players.p1.hand = [KIRI]
    const tower = createInstance(TOWER, s.turn, 2)
    s.players.p1.field.nexuses.push(tower)
    const ant = put(s, "p1", ANT, 2)
    const white = put(s, "p1", WHITE, 1)
    refreshLevelAsOverrides(s)
    destroySpirit(s, "p1", ant.instanceId, "destroy")
    const kiri = s.players.p1.field.spirits.find((x) => x.cardId === KIRI)
    assert(!!kiri, "キリカブトが手札から召喚される")
    assert(kiri?.cores === 1 && white.cores === 2, `キリカブト自身の召喚時（コア1個追加）は発揮されず、逆塔の1個だけが白に置かれる（キリカブト${kiri?.cores}個・白${white.cores}個）`)
}

console.log("すべてのチェックに合格しました 🎉（part872）")
