// smoke パート353（BS16バッチ2 B群：BS16-X04魁の覇王ミブロック・ブレイヴァー／BS16-036氷聖女ジャンヌダルク／
// BS16-079ムーンボウクローク。docs/design/BS16_HOOKS_B.md）
// - X04-e1: burst event:"ownSpiritDestroyed"（自分の白のスピリットが破壊されていたら自身を召喚）
// - X04-e2: kind:"step" attack/end/opponent（相手が1回もアタックしなければ相手ライフのコアをリザーブへ。neverZero）
// - X04-e3: 【合体時】fieldEvent event:"opponentHandAdded"（相手の手札が増えたとき相手のバースト1つを破棄）
// - 036-e4: 【合体時】fieldEvent event:"anySpiritAttacked"（【氷壁】を持つ自分のスピリットのアタック時、同じ色の相手を手札に戻す）
// - 079-e1: action:"markUnblockableByIceWallColorThisTurn"（指定スピリットは【氷壁】と同じ色からブロックされない）
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・色・コストを機械検証してから使う。
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { canBlock } from "../../shared/block"
import {
    act,
    assert,
    createGame,
    createInstance,
    draw,
    fireStepTriggers,
    getCard,
    placeBurst,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
    timedHas,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X04 = "BS16-X04"
const C036 = "BS16-036"
const C079 = "BS16-079"
const WHITE_VANILLA = "BS01-074" // バーサーカー・ガン（白・コスト1・バニラ）
const RED_VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const YELLOW_VANILLA = "BS02-049" // ピヨン（黄・コスト0・バニラ）
const BURST_MAGIC = "BS15-084" // 爆砕轟神掌（バースト持ちマジック。バースト破棄の確認に使うだけで発動条件は見ない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X04).name === "魁の覇王ミブロック・ブレイヴァー" && getCard(X04).type === "spirit" && getCard(X04).colors.includes("white") && getCard(X04).cost === 10, "X04")
    assert(getCard(C036).name === "氷聖女ジャンヌダルク" && getCard(C036).type === "spirit" && getCard(C036).colors.includes("white") && getCard(C036).cost === 7, "036")
    assert(getCard(C079).name === "ムーンボウクローク" && getCard(C079).type === "magic" && getCard(C079).colors.includes("white") && getCard(C079).cost === 3, "079")
    assert(getCard(WHITE_VANILLA).name === "バーサーカー・ガン" && getCard(WHITE_VANILLA).colors.includes("white"), "白バニラ")
    assert(getCard(RED_VANILLA).name === "ロクケラトプス" && getCard(RED_VANILLA).colors.includes("red"), "赤バニラ")
    assert(getCard(YELLOW_VANILLA).name === "ピヨン" && getCard(YELLOW_VANILLA).colors.includes("yellow"), "黄バニラ")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. X04：自分の白のスピリットが破壊されていたら自身を召喚し直す（色が違えば戻らない） ===")
{
    const s = game("x04-burst-yes")
    placeBurst(s, "p1", X04)
    const whiteVictim = put(s, "p1", WHITE_VANILLA, 1)
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: whiteVictim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === X04), "白が破壊されていたのでX04が召喚し直された")
}
{
    const s = game("x04-burst-no")
    placeBurst(s, "p1", X04)
    const redVictim = put(s, "p1", RED_VANILLA, 1)
    destroyTargetsBatch(s, "p2", [{ pid: "p1", instanceId: redVictim.instanceId }], { sourcePid: "p2", sourceType: "spirit" })
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === X04), "白が破壊されていないのでX04は召喚されない")
    assert(s.players.p1.trashCards.includes(X04), "その代わりトラッシュへ置かれた")
}

console.log("=== 2. X04 Lv1-3：相手のアタックステップ終了時、相手が1回もアタックしていなければライフのコアをリザーブへ（0にはしない） ===")
{
    const s = game("x04-step-yes")
    put(s, "p1", X04, 1) // Lv1
    s.turnPlayer = "p2" // p1から見て「相手のアタックステップ」
    s.phase = "attack"
    s.attacksThisTurn = 0
    s.players.p2.life = 5
    const reserveBefore = s.players.p2.reserve
    fireStepTriggers(s, "attack", undefined, "end")
    assert(s.players.p2.life === 4, `相手のライフが1個減った（実際${s.players.p2.life}）`)
    assert(s.players.p2.reserve === reserveBefore + 1, "減ったコアは相手のリザーブに置かれた")
}
{
    const s = game("x04-step-neverzero")
    put(s, "p1", X04, 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.attacksThisTurn = 0
    s.players.p2.life = 1
    fireStepTriggers(s, "attack", undefined, "end")
    assert(s.players.p2.life === 1, `この効果によってライフは0にならない（実際${s.players.p2.life}）`)
}
{
    const s = game("x04-step-attacked")
    put(s, "p1", X04, 1)
    s.turnPlayer = "p2"
    s.phase = "attack"
    s.attacksThisTurn = 1 // このターン既にアタックした
    s.players.p2.life = 5
    fireStepTriggers(s, "attack", undefined, "end")
    assert(s.players.p2.life === 5, "このターン相手が1回アタックしていたので発動しない")
}

console.log("=== 3. X04【合体時】Lv2：相手の手札が増えたとき相手のバースト1つを破棄する（合体していなければ発動しない） ===")
{
    const s = game("x04-combined-yes")
    const host = put(s, "p1", X04, 2) // Lv2
    host.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 【合体時】のゲートだけを満たす簡略化
    refreshLevelAsOverrides(s)
    s.turnPlayer = "p2" // p1から見て「相手のアタックステップ」＝相手のターン
    s.players.p2.burst = BURST_MAGIC
    s.players.p2.burstSet = true
    draw(s, "p2", 1)
    assert(s.players.p2.burst === null, "相手のバーストが破棄された")
    assert(s.players.p2.trashCards.includes(BURST_MAGIC), "破棄されたバーストはトラッシュへ")
}
{
    const s = game("x04-combined-no")
    put(s, "p1", X04, 2) // 合体していない
    s.turnPlayer = "p2"
    s.players.p2.burst = BURST_MAGIC
    s.players.p2.burstSet = true
    draw(s, "p2", 1)
    assert(s.players.p2.burst === BURST_MAGIC, "合体していないので相手のバーストは破棄されない")
}

console.log("=== 4. 036【合体時】Lv2：【氷壁】を持つ自分のスピリットがアタックしたとき、同じ色の相手を手札に戻す ===")
{
    const s = game("c036-bounce-yes")
    const jeanne = put(s, "p1", C036, 3) // Lv2（氷壁：赤/紫/緑/白）
    jeanne.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
    refreshLevelAsOverrides(s)
    const foe = put(s, "p2", RED_VANILLA, 1) // 赤＝氷壁の色に含まれる
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: jeanne.instanceId }) === null, "ジャンヌダルクでアタック")
    assert(s.players.p2.hand.includes(RED_VANILLA), "赤の相手スピリットが手札に戻った")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === foe.instanceId), "場からは消えている")
}
{
    const s = game("c036-bounce-no")
    const jeanne = put(s, "p1", C036, 3)
    jeanne.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }]
    refreshLevelAsOverrides(s)
    const foe = put(s, "p2", YELLOW_VANILLA, 1) // 黄＝氷壁の色に含まれない
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: jeanne.instanceId }) === null, "ジャンヌダルクでアタック")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === foe.instanceId), "黄は氷壁の色に含まれないので戻らない")
}

console.log("=== 5. 079：【氷壁】を持つ自分のスピリット1体を指定し、同じ色の相手からブロックされない ===")
{
    const s = game("p079-unblockable")
    const jeanne = put(s, "p1", C036, 1) // Lv1（氷壁：赤/紫/緑/白）
    resolveAction(s, "p1", null, { type: "markUnblockableByIceWallColorThisTurn" }, undefined, undefined, "magic")
    assert(timedHas(s, jeanne, "unblockable"), "【氷壁】の色の相手からブロックされない効果が掛かる")
    const redBlocker = put(s, "p2", RED_VANILLA, 1)
    const yellowBlocker = put(s, "p2", YELLOW_VANILLA, 1)
    assert(canBlock(s, "p2", redBlocker, "p1", jeanne) !== null, "赤のスピリットはブロックできない")
    assert(canBlock(s, "p2", yellowBlocker, "p1", jeanne) === null, "黄のスピリットは通常どおりブロックできる")
}

console.log("すべてのチェックに合格しました 🎉（part353）")
