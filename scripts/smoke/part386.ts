// smoke パート386（「Lv◯BPを◯として扱う」：ブレイヴの合体時BP+ は含めて置き換わり、効果による BP+ は前後を問わず乗る。
// Q3630・Q3632・Q18859。2026-09-25 ユーザー確認）
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction } from "./helpers"
import type { EffectAction, GameState } from "../../server/src/type"
import { attachBrave } from "../../server/src/logic/removal"
import { effectiveBp } from "../../shared/rules"

const LUNA = "BS15-X05" // 光の覇王ルナアーク・カグヤ
const BETOR = "BS12-037" // オリンピアの天使ベトール
const X011 = "X011" // 光導龍騎ゾディアックアポロクリムゾン
const KAMYURA = "BS11-053" // カーミュラ1（ブレイヴ）
const HADES = "BS01-031" // デス・ハーデス（Lv2 BP7000）
const PISCES = "BS10-X02" // 双魚賊神ピスケガレオン（光導）

function game(id: string): GameState {
    const s = createGame(id, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    return s
}
function put(s: GameState, pid: "p1" | "p2", cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}
function cardAction(cardId: string, type: string): EffectAction {
    const e = getCard(cardId).effects.find((x) => JSON.stringify(x).includes(`"${type}"`)) as { action: EffectAction } | undefined
    assert(e !== undefined, `${cardId}：${type} の効果がある`)
    return e!.action
}
const plus3000 = { type: "timedEffect", content: [{ type: "bp", amount: 3000 }], duration: "turn", target: "self" } as unknown as EffectAction

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(LUNA).name === "光の覇王ルナアーク・カグヤ", "BS15-X05 はルナアーク・カグヤ")
    assert(getCard(BETOR).name === "オリンピアの天使ベトール", "BS12-037 はベトール")
    assert(getCard(X011).name === "光導龍騎ゾディアックアポロクリムゾン", "X011 はゾディアックアポロクリムゾン")
    assert(getCard(KAMYURA).name === "カーミュラ1" && getCard(KAMYURA).type === "brave", "BS11-053 はブレイヴのカーミュラ1")
    assert(getCard(HADES).levels[1]?.bp === 7000, "デス・ハーデス Lv2 は BP7000")
    assert(getCard(PISCES).family.includes("光導"), "ピスケガレオンは光導")
}

console.log("=== 1. Q3630：先に BP+3000 されていても、ルナアーク・カグヤで 2000＋3000＝5000 ===")
{
    const s = game("p386-q3630")
    const target = put(s, "p2", HADES, 4)
    resolveAction(s, "p2", target, plus3000)
    assert(effectiveBp(s, "p2", target) === 10000, "前提：7000＋3000")
    resolveAction(s, "p1", null, cardAction(LUNA, "setOpponentBpAsThisBattle"), target.instanceId)
    assert(effectiveBp(s, "p2", target) === 5000, "BP5000")
}

console.log("=== 2. ベトールも同じ：先の BP+ は乗り、後の BP+ も乗る ===")
{
    const s = game("p386-betor")
    const target = put(s, "p2", HADES, 4)
    resolveAction(s, "p2", target, plus3000)
    resolveAction(s, "p1", null, cardAction(BETOR, "setTargetBpAsThisBattle"), target.instanceId)
    assert(effectiveBp(s, "p2", target) === 5000, "先の +3000 が乗って5000")
    resolveAction(s, "p2", target, plus3000)
    assert(effectiveBp(s, "p2", target) === 8000, "後の +3000 も乗って8000")
}

console.log("=== 3. Q3632：書き換えた後に合体しても、ブレイヴの合体時BP+ は足さない ===")
{
    const s = game("p386-q3632")
    const target = put(s, "p2", HADES, 4)
    resolveAction(s, "p1", null, cardAction(LUNA, "setOpponentBpAsThisBattle"), target.instanceId)
    const brave = createInstance(KAMYURA, s.turn, 0)
    attachBrave(s, "p2", target, brave)
    assert(effectiveBp(s, "p2", target) === 2000, "合体しても2000のまま")
}

console.log("=== 4. Q18859：X011 は合体して13000以上のスピリットも12000にする ===")
{
    const s = game("p386-q18859")
    const x011 = put(s, "p1", X011, 5)
    attachBrave(s, "p1", x011, createInstance(KAMYURA, s.turn, 0))
    const pisces = put(s, "p1", PISCES, 3) // Lv2 BP8000
    attachBrave(s, "p1", pisces, createInstance(KAMYURA, s.turn, 0))
    refreshLevelAsOverrides(s)
    assert(effectiveBp(s, "p1", pisces) === 12000, `合体した光導のスピリットは12000（実際 ${effectiveBp(s, "p1", pisces)}）`)
}

console.log("すべてのチェックに合格しました 🎉（part386）")
