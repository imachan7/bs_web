// smoke パート881（BS13-038 魔女タランダ：破棄した手札のスピリットカード1枚につき、破壊された導魔のスピリット1体を戻す。
// 同時に2体破壊されたら、破棄した枚数ぶん戻せる。2026-11-10 ユーザー指示で「破棄は1枚まで」の簡略化を外した）
import { destroyTargetsBatch } from "../../server/src/logic/removal"
import { assert, createGame, createInstance, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const TARANDA = "BS13-038" // 魔女タランダ（導魔・Lv1-2）
const SABRINA = "BS10-045" // 闇魔女サブリナ（導魔・効果なし）
const VANILLA = "BS01-001" // ゴラドン（導魔ではない）
const MAGIC = "BS01-125" // 手札コストにできない種別のカードとして使う（スピリットでなければよい）

console.log("=== 前提: カードの機械確認 ===")
assert(getCard(TARANDA).name === "魔女タランダ" && getCard(TARANDA).family.includes("導魔"), "タランダは導魔")
assert(getCard(SABRINA).name === "闇魔女サブリナ" && getCard(SABRINA).family.includes("導魔"), "サブリナは導魔")
assert(getCard(VANILLA).name === "ゴラドン" && !getCard(VANILLA).family.includes("導魔"), "ゴラドンは導魔ではない")
assert(getCard(MAGIC).type !== "spirit", "MAGICはスピリットではない")

function game(seed: string, hand: string[], interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.hand = [...hand]
    s.turnPlayer = "p2"
    s.phase = "attack"
    return s
}

function put(s: GameState, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    return inst
}

// 相手（p2）のスピリットの効果で p1 のスピリットをまとめて破壊する
function destroyTogether(s: GameState, ids: string[]): void {
    destroyTargetsBatch(s, "p2", ids.map((instanceId) => ({ pid: "p1" as PlayerId, instanceId })), { sourcePid: "p2", sourceType: "spirit" })
}

// 選択待ちを消化する。「復活させる」確認は answers の先頭から順に true＝復活させる／false＝しない。
// 順番の選択（ターンプレイヤー）と手札の選択は先頭を選ぶ
function drain(s: GameState, answers: boolean[]): number {
    let confirms = 0
    for (let guard = 0; s.pendingChoice && guard < 30; guard++) {
        const pc = s.pendingChoice
        if (pc.kind === "card") {
            assert(handleAction(s, pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! }) === null, "手札のカードを選ぶ")
        } else if (pc.kind === "target") {
            assert(handleAction(s, pc.pid, { type: "resolveChoice", instanceId: pc.candidates[0]! }) === null, "対象を選ぶ")
        } else {
            const yes = pc.options!.find((o) => o.includes("復活させる"))
            if (yes !== undefined) {
                const accept = answers[confirms++] ?? false
                const option = accept ? yes : pc.options!.find((o) => o !== yes)!
                assert(handleAction(s, pc.pid, { type: "resolveChoice", option }) === null, "復活の確認に答える")
            } else {
                assert(handleAction(s, pc.pid, { type: "resolveChoice", option: pc.options![0]! }) === null, "順番を選ぶ")
            }
        }
    }
    return confirms
}

console.log("=== 導魔2体が同時に破壊され、スピリットカードを2枚破棄 → 2体とも疲労状態で戻る ===")
{
    const s = game("taranda-two", [VANILLA, VANILLA, VANILLA], true)
    const tar = put(s, TARANDA)
    const sab = put(s, SABRINA)
    refreshLevelAsOverrides(s)
    destroyTogether(s, [tar.instanceId, sab.instanceId])
    const confirms = drain(s, [true, true])
    assert(confirms === 2, `破壊された体数ぶん確認が出る（${confirms}回）`)
    assert(s.players.p1.field.spirits.includes(tar) && s.players.p1.field.spirits.includes(sab), "2体とも場に残る")
    assert(tar.isRested && sab.isRested, "疲労状態で戻る")
    assert(s.players.p1.hand.length === 1 && s.players.p1.trashCards.length === 2, "破棄したスピリットカードは2枚")
}

console.log("=== 1枚だけ破棄（もう1体は戻さない） → 1体だけ戻る ===")
{
    const s = game("taranda-one", [VANILLA, VANILLA, VANILLA], true)
    const tar = put(s, TARANDA)
    const sab = put(s, SABRINA)
    refreshLevelAsOverrides(s)
    destroyTogether(s, [tar.instanceId, sab.instanceId])
    drain(s, [true, false])
    const onField = [tar, sab].filter((x) => s.players.p1.field.spirits.includes(x))
    assert(onField.length === 1, `戻るのは1体（${onField.length}体）`)
    assert(s.players.p1.hand.length === 2, "破棄したのは1枚")
}

console.log("=== 手札のスピリットカードが1枚だけ → 2体同時に破壊されても戻れるのは1体 ===")
{
    const s = game("taranda-hand1", [VANILLA, MAGIC], true)
    const tar = put(s, TARANDA)
    const sab = put(s, SABRINA)
    refreshLevelAsOverrides(s)
    destroyTogether(s, [tar.instanceId, sab.instanceId])
    drain(s, [true, true])
    const onField = [tar, sab].filter((x) => s.players.p1.field.spirits.includes(x))
    assert(onField.length === 1, `スピリットカード1枚ぶん＝1体だけ戻る（${onField.length}体）`)
    assert(s.players.p1.hand.includes(MAGIC), "スピリットカードでない手札は破棄されない")
}

console.log("=== 導魔でないスピリットは戻せない／スピリットカードが手札に無ければ戻せない ===")
{
    const s = game("taranda-notfamily", [VANILLA, VANILLA], true)
    put(s, TARANDA)
    const plain = put(s, VANILLA)
    refreshLevelAsOverrides(s)
    destroyTogether(s, [plain.instanceId])
    drain(s, [true])
    assert(!s.players.p1.field.spirits.includes(plain), "導魔でないスピリットは破壊される")
    assert(s.players.p1.hand.length === 2, "確認が出ないので手札も減らない")
}
{
    const s = game("taranda-nocard", [MAGIC], true)
    const tar = put(s, TARANDA)
    const sab = put(s, SABRINA)
    refreshLevelAsOverrides(s)
    destroyTogether(s, [tar.instanceId, sab.instanceId])
    drain(s, [true, true])
    assert(s.players.p1.field.spirits.length === 0, "スピリットカードが手札に無ければ戻せず、2体とも破壊される")
}

console.log("すべてのチェックに合格しました 🎉（part881）")
