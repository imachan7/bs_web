// smoke パート219（BS08 帝竜騎サイクル：『自分のメインステップ』の任意発動）
// 収録セクション:
//   - kind:"activated" timing:"main" は**ステップ開始時に自動発動しない**（旧実装は step:"main" で自動発動していた）
//   - メインステップ中に activateAbility で発動でき、**召喚コストは通常どおり支払う**（旧実装はコスト無料だった）
//   - skipTensho：【転召】は行われない／skipOnSummon：『召喚時』効果は発揮されない
//   - oncePerTurn：同じスピリットは2回目を発動できない。別個体はそれぞれ1回使える
//   - アタックステップでは発動できない
import { assert, act, createGame, createInstance, effectiveCost, getCard, runTurnStart } from "./helpers"

// BS08-034 空帝竜騎プラチナム：Lv1-3『自分のメインステップ』ターンに1回、手札の【転召】持ちを
//   【転召】させずに召喚できる。ただし『このスピリットの召喚時』効果は発揮されない
// BS07-017 冥獣士ザブルガン：コスト6・【転召：コスト3以上/トラッシュ】・『召喚時』相手のコア1個をボイドへ
const PLATINUM = "BS08-034"
const ZABURUGAN = "BS07-017"
const SACRIFICE = "BS01-016" // スケルトン・ジョウ：コスト5（＝転召の対象になりうる）

// プラチナムと転召の生贄候補を自分の場に、相手の場にもスピリットを置いた盤面を作る
function setup(name: string) {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 30
    const platinum = createInstance(PLATINUM, s.turn, 1)
    s.players.p1.field.spirits.push(platinum)
    const sacrifice = createInstance(SACRIFICE, s.turn, 3)
    s.players.p1.field.spirits.push(sacrifice)
    const enemy = createInstance(SACRIFICE, s.turn, 3)
    s.players.p2.field.spirits.push(enemy)
    return { s, platinum, sacrifice, enemy }
}

console.log("=== 帝竜騎：メインステップ開始時には自動発動しない ===")
{
    const { s } = setup("teiryuki-no-auto")
    s.players.p1.hand = [ZABURUGAN]
    // ターン開始処理を通してメインステップへ入り直しても、手札は減らない
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "main"
    assert(s.players.p1.hand.includes(ZABURUGAN), "メインステップに入っただけでは召喚されない")
    assert(
        s.players.p1.field.spirits.every((sp) => sp.cardId !== ZABURUGAN),
        "フィールドにも出ていない",
    )
}

console.log("=== 帝竜騎：メインステップ中に発動でき、召喚コストを支払う ===")
{
    const { s, platinum, sacrifice, enemy } = setup("teiryuki-activate")
    s.players.p1.hand = [ZABURUGAN]
    const card = getCard(ZABURUGAN)
    const cost = effectiveCost(s, "p1", card)
    const maintain = card.levels[0]!.cores
    const reserveBefore = s.players.p1.reserve
    const trashBefore = s.players.p1.trashCores
    const enemyCoresBefore = enemy.cores

    const error = act(s, "p1", {
        type: "activateAbility",
        instanceId: platinum.instanceId,
        effectId: "BS08-034-e1",
    })
    assert(error === null, `メインステップ中に発動できる（実際: ${error}）`)

    const summoned = s.players.p1.field.spirits.find((sp) => sp.cardId === ZABURUGAN)
    assert(!!summoned, "ザブルガンが召喚されている")
    assert(!s.players.p1.hand.includes(ZABURUGAN), "手札から出ている")
    assert(
        s.players.p1.reserve === reserveBefore - cost - maintain,
        `召喚コスト(${cost})と維持コア(${maintain})がリザーブから支払われる（実際の減少: ${reserveBefore - s.players.p1.reserve}）`,
    )
    assert(
        s.players.p1.trashCores === trashBefore + cost,
        `支払ったコスト分がトラッシュへ行く（実際: ${s.players.p1.trashCores - trashBefore}）`,
    )
    // skipTensho：【転召】は行われないので、生贄候補のコアはそのまま
    assert(sacrifice.cores === 3, `【転召】が行われず生贄のコアは減らない（実際: ${sacrifice.cores}）`)
    // skipOnSummon：『召喚時』効果（相手のコア1個をボイドへ）は発揮されない
    assert(
        enemy.cores === enemyCoresBefore,
        `『召喚時』効果は発揮されない（相手のコア 実際: ${enemy.cores} / 期待: ${enemyCoresBefore}）`,
    )
}

console.log("=== 帝竜騎：ターンに1回。同じスピリットの2回目は発動できない ===")
{
    const { s, platinum } = setup("teiryuki-once")
    s.players.p1.hand = [ZABURUGAN, ZABURUGAN]
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: platinum.instanceId, effectId: "BS08-034-e1" }) === null,
        "1回目は発動できる",
    )
    const second = act(s, "p1", {
        type: "activateAbility",
        instanceId: platinum.instanceId,
        effectId: "BS08-034-e1",
    })
    assert(second !== null, "2回目は拒否される")
    assert(
        s.players.p1.hand.length === 1,
        `2回目は召喚まで進まない（手札の残り 実際: ${s.players.p1.hand.length}）`,
    )
}

console.log("=== 帝竜騎：別の個体はそれぞれ1回ずつ使える ===")
{
    const { s, platinum } = setup("teiryuki-per-instance")
    const platinum2 = createInstance(PLATINUM, s.turn, 1)
    s.players.p1.field.spirits.push(platinum2)
    s.players.p1.hand = [ZABURUGAN, ZABURUGAN]
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: platinum.instanceId, effectId: "BS08-034-e1" }) === null,
        "1体目は発動できる",
    )
    assert(
        act(s, "p1", { type: "activateAbility", instanceId: platinum2.instanceId, effectId: "BS08-034-e1" }) === null,
        "2体目も同じターンに発動できる（消費は個体ごと）",
    )
    assert(s.players.p1.hand.length === 0, "2枚とも召喚された")
}

console.log("=== 帝竜騎：アタックステップでは発動できない ===")
{
    const { s, platinum } = setup("teiryuki-not-attack")
    s.players.p1.hand = [ZABURUGAN]
    s.phase = "attack"
    const error = act(s, "p1", {
        type: "activateAbility",
        instanceId: platinum.instanceId,
        effectId: "BS08-034-e1",
    })
    assert(error !== null, "アタックステップでは拒否される")
    assert(s.players.p1.hand.includes(ZABURUGAN), "召喚もされない")
}

console.log("=== 帝竜騎：リザーブが足りなければ候補にならない ===")
{
    const { s, platinum } = setup("teiryuki-poor")
    s.players.p1.hand = [ZABURUGAN]
    const need = effectiveCost(s, "p1", getCard(ZABURUGAN)) + getCard(ZABURUGAN).levels[0]!.cores
    s.players.p1.reserve = need - 1
    act(s, "p1", { type: "activateAbility", instanceId: platinum.instanceId, effectId: "BS08-034-e1" })
    assert(s.players.p1.hand.includes(ZABURUGAN), "コストを払えないカードは召喚されない")
    assert(s.players.p1.reserve === need - 1, "リザーブも減らない")
}
