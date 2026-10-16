// smoke パート598（トラッシュから効果で召喚したスピリットの『このスピリットの召喚時』が、効果文どおりに発揮される／されないか）
//
// 召喚される側は「召喚時に1枚引くだけ」のスピリットにして、手札の増減で発揮を見分ける。
// 召喚する側の効果文に「ただし、『このスピリットの召喚時』効果は発揮されない」があるときだけ発揮しない。
// 【不死】（召喚する効果を召喚される本人が持つ）も「召喚」なので発揮する。魔門で無償にしたときだけ発揮しない
import {
    assert,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance, EffectAction } from "../../server/src/type"
import { destroyTargetsBatch } from "../../server/src/logic/removal"

const SHIKITSURU = "BS14-016" // シキツル（紫・コスト3・魔影）召喚時：1枚ドロー
const FOGNIX = "BS14-021" // 不紫鳥フォグニクス（紫・コスト6）【不死：コスト4/5】召喚時：Lv数だけドロー
const QUETZAL = "BS04-022" // 王蛇ケツァルカトル（紫・コスト8）召喚時：2枚ドロー
const SHUTEN = "BS14-019" // シュテン・ドーガ 召喚時：トラッシュの魔影コスト3以下を召喚（制限なし）
const ZANEI = "BS14-097" // 刹那残影弓 メイン：トラッシュのコスト4以下を召喚（召喚時は発揮されない）
const SCAPEGOAT = "BS16-075" // スケープゴート トラッシュの紫を召喚（召喚時は発揮されない）
const CUBIC = "BS05-004" // 妖狐キュービック 破壊時：トラッシュの紫コスト5〜7を召喚（召喚時は発揮されない）
const AGRAVAIN = "BS13-014" // 闇騎士アグラヴェイン【不死：妖蛇】召喚時（不死で召喚されたとき）：トラッシュのコスト7以上を召喚（召喚時は発揮されない）
const MAMON = "BS15-064" // 冥府へ続く魔門 Lv2：疲労させてコスト6以下の【不死】を無償で召喚
const COST4 = "BS01-089" // デュアルキャノン・ベル（コスト4・効果なし）
const SNAKE = "BS01-038" // スケル・バイパー（妖蛇）
const VANILLA = "BS01-002" // ロクケラトプス
const DIVINE = "BS02-096" // ディバインウィンド 手札のコスト（トラッシュのコア数以下）を召喚（召喚時は発揮されない）

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string, number][] = [
        [SHIKITSURU, "シキツル", 3],
        [FOGNIX, "不紫鳥フォグニクス", 6],
        [QUETZAL, "王蛇ケツァルカトル", 8],
        [SHUTEN, "シュテン・ドーガ", 5],
        [ZANEI, "刹那残影弓", 4],
        [SCAPEGOAT, "スケープゴート", 4],
        [CUBIC, "妖狐キュービック", 3],
        [AGRAVAIN, "闇騎士アグラヴェイン", 5],
        [COST4, "デュアルキャノン・ベル", 4],
        [VANILLA, "ロクケラトプス", 1],
        [DIVINE, "ディバインウィンド", 2],
    ]
    for (const [id, name, cost] of expect) assert(getCard(id).name === name && getCard(id).cost === cost, `${id} は ${name}（コスト${cost}）`)
    assert(getCard(MAMON).name === "冥府へ続く魔門", "BS15-064 は冥府へ続く魔門")
    assert(getCard(SNAKE).family.includes("妖蛇"), "BS01-038 は妖蛇")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 20
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

function actionOf(cardId: string, index = 0): EffectAction {
    const e = getCard(cardId).effects.filter((x) => "action" in x)[index]
    if (!e || !("action" in e)) throw new Error(`${cardId} に action が無い`)
    return e.action as EffectAction
}

// 相手の効果で破壊する（【不死】は破壊バッチの中で候補に並ぶ）
const destroyByEffect = (s: GameState, pid: PlayerId, instanceId: string): void => {
    destroyTargetsBatch(s, "p2", [{ pid, instanceId }], { sourcePid: "p2", sourceType: "spirit" })
}

const onField = (s: GameState, cardId: string): boolean => s.players.p1.field.spirits.some((x) => x.cardId === cardId)

console.log("=== 1. 制限なし：シュテン・ドーガの召喚時でトラッシュから召喚したシキツルの召喚時は発揮する ===")
{
    const s = game("p598-1")
    s.players.p1.trashCards = [SHIKITSURU]
    const self = put(s, "p1", SHUTEN, 1)
    resolveAction(s, "p1", self, actionOf(SHUTEN))
    assert(onField(s, SHIKITSURU), "シキツルがトラッシュから召喚される")
    assert(s.players.p1.hand.length === 1, `シキツルの召喚時で1枚引く（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 2. 制限あり（マジック）：刹那残影弓で召喚したシキツルの召喚時は発揮しない ===")
{
    const s = game("p598-2")
    s.players.p1.trashCards = [SHIKITSURU]
    resolveAction(s, "p1", null, actionOf(ZANEI, 1))
    assert(onField(s, SHIKITSURU), "シキツルがトラッシュから召喚される")
    assert(s.players.p1.hand.length === 0, `召喚時は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 3. 制限あり（マジック）：スケープゴートで召喚したシキツルの召喚時は発揮しない ===")
{
    const s = game("p598-3")
    s.players.p1.trashCards = [SHIKITSURU]
    resolveAction(s, "p1", null, actionOf(SCAPEGOAT))
    assert(onField(s, SHIKITSURU), "シキツルがトラッシュから召喚される")
    assert(s.players.p1.hand.length === 0, `召喚時は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 4. 制限あり（スピリットの破壊時）：妖狐キュービックで召喚したフォグニクスの召喚時は発揮しない ===")
{
    const s = game("p598-4")
    s.players.p1.trashCards = [FOGNIX]
    const self = put(s, "p1", CUBIC, 1)
    resolveAction(s, "p1", self, actionOf(CUBIC))
    assert(onField(s, FOGNIX), "フォグニクスがトラッシュから召喚される")
    assert(s.players.p1.hand.length === 0, `召喚時は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 5. 【不死】：コスト4が破壊されてフォグニクスが自分の【不死】で召喚されたら、召喚時は発揮する ===")
{
    const s = game("p598-5")
    s.phase = "attack"
    s.players.p1.trashCards = [FOGNIX]
    const victim = put(s, "p1", COST4, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(onField(s, FOGNIX), "フォグニクスが【不死】で召喚される")
    assert(s.players.p1.hand.length >= 1, `召喚時でドローする（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 6. 【不死】を魔門 Lv2 で無償にしたら、召喚時は発揮しない ===")
{
    const s = game("p598-6")
    s.phase = "attack"
    s.players.p1.reserve = 1 // 通常のコストは払えない＝魔門の無償だけが残る
    s.players.p1.trashCards = [FOGNIX]
    const mamon = createInstance(MAMON, s.turn, 2) // Lv2 ちょうど（通常のコストに回せるコアを残さない）
    s.players.p1.field.nexuses.push(mamon)
    const victim = put(s, "p1", COST4, 1)
    refreshLevelAsOverrides(s)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(onField(s, FOGNIX), "フォグニクスが魔門の無償で召喚される")
    assert(mamon.isRested, "魔門が疲労している")
    assert(s.players.p1.hand.length === 0, `召喚時は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 7. 【不死】で召喚されたアグラヴェインの召喚時は発揮し、それで召喚したケツァルカトルの召喚時は発揮しない ===")
{
    const s = game("p598-7")
    s.phase = "attack"
    s.players.p1.trashCards = [AGRAVAIN, QUETZAL]
    const victim = put(s, "p1", SNAKE, 1)
    destroyByEffect(s, "p1", victim.instanceId)
    assert(onField(s, AGRAVAIN), "アグラヴェインが【不死】で召喚される")
    assert(onField(s, QUETZAL), "アグラヴェインの召喚時でケツァルカトルが召喚される")
    assert(s.players.p1.hand.length === 0, `ケツァルカトルの召喚時は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("=== 8. 手札からでも同じ：ディバインウィンドで召喚したシキツルの召喚時は発揮しない ===")
{
    const s = game("p598-8")
    s.players.p1.trashCores = 3
    s.players.p1.hand = [SHIKITSURU]
    resolveAction(s, "p1", null, actionOf(DIVINE))
    assert(onField(s, SHIKITSURU), "シキツルが手札から召喚される")
    assert(s.players.p1.hand.length === 0, `召喚時は発揮されない（手札 ${s.players.p1.hand.length}枚）`)
}

console.log("すべてのチェックに合格しました 🎉（part598）")
