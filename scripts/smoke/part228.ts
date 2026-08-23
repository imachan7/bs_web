// smoke パート228（「コストを支払って召喚できる」起動効果は、フィールドのコアからも払える。2026-08-23 利用者報告）
//
// BS08帝竜騎サイクル6枚（空帝竜騎プラチナム等）の
// 「手札の【転召】持ちを【転召】させずに召喚できる」は payCost＝通常の召喚コストが要る。
// これまで支払い元は**リザーブだけ**という簡略化だったため、
//
//   1. リザーブでは足りないが盤面のコアでなら払えるカードが、候補にすら出なかった
//   2. 通常の召喚では paySources でフィールドのコアを使えるのに、この経路だけ使えなかった
//
// 候補判定を「リザーブ＋フィールドのコア」に広げ、選択の解決（resolveChoice）に
// paySources を添えられるようにした。支払いは通常の召喚と同じ payCost が処理する
// （フィールドのコアはコスト優先で充当し、支払い元が維持コア割れしたら消滅する）。
// 起動能力は handleAction を直接呼ぶ（helpers.act は対話モードで pendingChoice を先に消化してしまい、
// 選択待ちが立ったことを確かめられないため。part223 と同じ理由）
import { assert, createGame, createInstance, effectiveCost, getCard, handleAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PLATINUM = "BS08-034" // 空帝竜騎プラチナム：Lv1=1コア。起動＝手札の【転召】持ちを召喚（コストは支払う）
const PLATINUM_ABILITY = "BS08-034-e1"
const TENSHO = "BS04-010" // 雷帝エール・クレル：【転召】持ち。cost6 / Lv1=1コア
const BANK = "BS01-004" // ドラグノ偵察兵：Lv1=1コア。コアを乗せておく置き場に使う

function putSpirit(s: GameState, pid: PlayerId, cardId: string, cores: number): string {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst.instanceId
}

// 自分のメインステップ（起動能力を使えるタイミング）で、プラチナムとコア置き場を並べる
function setup(name: string, bankCores: number): { s: GameState; plat: string; bank: string; need: number } {
    const s = createGame(name, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "blue" })
    runTurnStart(s)
    s.interactiveTargets = true
    const plat = putSpirit(s, "p1", PLATINUM, 1)
    const bank = putSpirit(s, "p1", BANK, bankCores)
    s.players.p1.hand = [TENSHO]
    // 軽減はフィールドのシンボルで変わるので、必要額はここで実測する（コスト＋Lv1の維持コア）
    const need = effectiveCost(s, "p1", getCard(TENSHO)) + 1
    return { s, plat, bank, need }
}

console.log("=== リザーブが足りなくても、盤面のコアで払えるなら候補に出る ===")
{
    const { s, plat, need } = setup("platinum-field-candidate", 5)
    s.players.p1.reserve = need - 4 // 4個ぶんフィールドから払う必要がある
    assert(
        handleAction(s, "p1", { type: "activateAbility", instanceId: plat, effectId: PLATINUM_ABILITY }) === null,
        "起動できる",
    )
    assert(!!s.pendingChoice, "召喚するカードの選択待ちになる")
    assert(
        (s.pendingChoice!.cardIndices ?? []).includes(0),
        "リザーブでは足りなくても、盤面のコアで払えるので候補に入る",
    )
}

console.log("=== 盤面のコアを含めても足りないカードは、従来どおり候補に出ない ===")
{
    const { s, plat, need } = setup("platinum-not-affordable", 1)
    s.players.p1.reserve = need - 5 // リザーブ＋盤面（プラチナム1＋置き場1）でも届かない
    handleAction(s, "p1", { type: "activateAbility", instanceId: plat, effectId: PLATINUM_ABILITY })
    const candidates = s.pendingChoice ? (s.pendingChoice.cardIndices ?? []) : []
    assert(!candidates.includes(0), "払えないカードは候補に入らない")
}

console.log("=== paySources を添えて解決すると、フィールドのコアで召喚できる ===")
{
    const { s, plat, bank, need } = setup("platinum-pay-from-field", 5)
    s.players.p1.reserve = need - 4
    assert(
        handleAction(s, "p1", { type: "activateAbility", instanceId: plat, effectId: PLATINUM_ABILITY }) === null,
        "起動できる",
    )
    assert(
        handleAction(s, "p1", {
            type: "resolveChoice",
            cardIndex: 0,
            paySources: [{ instanceId: bank, count: 4 }],
        }) === null,
        "フィールドのコア4個を添えて解決できる",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO),
        "【転召】持ちが召喚された",
    )
    const bankInst = s.players.p1.field.spirits.find((sp) => sp.instanceId === bank)
    assert(bankInst?.cores === 1, `支払い元のコアが4個減る（実際は${bankInst?.cores}）`)
    assert(s.players.p1.reserve === 0, `リザーブは使い切る（実際は${s.players.p1.reserve}）`)
}

console.log("=== 支払いで維持コアを下回った支払い元は消滅する ===")
{
    const { s, plat, bank, need } = setup("platinum-pay-deplete", 5)
    s.players.p1.reserve = need - 5 // 置き場のコア5個をすべて使う
    assert(
        handleAction(s, "p1", { type: "activateAbility", instanceId: plat, effectId: PLATINUM_ABILITY }) === null,
        "起動できる",
    )
    assert(
        handleAction(s, "p1", {
            type: "resolveChoice",
            cardIndex: 0,
            paySources: [{ instanceId: bank, count: 5 }],
        }) === null,
        "コアをすべて出して解決できる",
    )
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO),
        "【転召】持ちが召喚された",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.instanceId === bank),
        "コアを出し切った支払い元は維持コア割れで消滅した",
    )
}

console.log("=== 従来どおり：リザーブだけで払えるなら paySources なしで解決できる ===")
{
    const { s, plat, bank, need } = setup("platinum-pay-from-reserve", 1)
    s.players.p1.reserve = need
    assert(
        handleAction(s, "p1", { type: "activateAbility", instanceId: plat, effectId: PLATINUM_ABILITY }) === null,
        "起動できる",
    )
    assert(handleAction(s, "p1", { type: "resolveChoice", cardIndex: 0 }) === null, "paySources なしで解決できる")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === TENSHO),
        "【転召】持ちが召喚された",
    )
    const bankInst = s.players.p1.field.spirits.find((sp) => sp.instanceId === bank)
    assert(bankInst?.cores === 1, "フィールドのコアは減らない")
    assert(s.players.p1.reserve === 0, "リザーブから払った")
}
