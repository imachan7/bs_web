// smoke パート704（コストつき起動能力の「ことで」後半：スピリットに置く timedEffect と手札への付与も、対象がいなければ起動できない）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { activatedActionResolvable } from "../../shared/rules"

const OUKA = "BS07-038" // 桜の妖精オウカ（アタックしている【聖命】を持つ自分のスピリット1体）
const YURI = "BS07-040" // 百合の妖精ユリィ（Lv2-3【聖命】）
const GINGA = "BS13-062" // 光り輝く大銀河（自分のスピリット1体）
const KIGUNA = "BS13-026" // キグナ・スワンMk-II（「光導」/「星魂」の自分のスピリットすべて）
const PISCES = "BS10-X02" // 双魚賊神ピスケガレオン（光導）
const ARCANA = "BS14-051" // アルカナビーストクィーン（相手のスピリット1体をLv1として扱う）
const KAGUYA = "BS15-X05" // 光の覇王ルナアーク・カグヤ（相手のスピリット1体のBPを2000として扱う）
const BEAT = "BS01-050" // ビートビートル（殻虫）
const PRIEST = "BS03-033" // ビートプリースト（手札の「殻虫」スピリットカード1枚に【神速】）
const VANILLA = "BS01-002" // ロクケラトプス（地竜）
for (const [id, name] of [[OUKA, "桜の妖精オウカ"], [YURI, "百合の妖精ユリィ"], [GINGA, "光り輝く大銀河"], [KIGUNA, "キグナ・スワンMk-II"], [PISCES, "双魚賊神ピスケガレオン"], [ARCANA, "アルカナビーストクィーン"], [KAGUYA, "光の覇王ルナアーク・カグヤ"], [BEAT, "ビートビートル"], [PRIEST, "ビートプリースト"], [VANILLA, "ロクケラトプス"]] as const) {
    assert(getCard(id).name === name, `${id} は ${name}`)
}
assert(getCard(PISCES).family.includes("光導") && getCard(BEAT).family.includes("殻虫") && !getCard(VANILLA).family.includes("殻虫"), "系統の前提")

function actionOf(id: string) {
    const e = getCard(id).effects.find((x) => x.kind === "activated")!
    if (e.kind !== "activated") throw new Error("前提")
    return e.action
}
function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    runTurnStart(s)
    s.turnPlayer = "p1"
    s.phase = "attack"
    s.players.p1.hand = []
    return s
}
const put = (s: GameState, pid: "p1" | "p2", id: string, cores = 1) => {
    const i = createInstance(id, s.turn, cores)
    s.players[pid].field.spirits.push(i)
    refreshLevelAsOverrides(s)
    return i
}

console.log("=== オウカ：アタックしている【聖命】の自分のスピリットがいるときだけ ===")
for (const [attacker, ok] of [[YURI, true], [VANILLA, false]] as const) {
    const s = game(`ouka-${ok}`)
    const ouka = put(s, "p1", OUKA, 1)
    const a = put(s, "p1", attacker, 5)
    assert(act(s, "p1", { type: "attack", instanceId: a.instanceId }) === null, "アタック")
    assert(activatedActionResolvable(s, "p1", ouka, actionOf(OUKA)) === ok, ok ? "【聖命】のアタッカーなら起動できる" : "【聖命】のないアタッカーなら起動できない")
}

console.log("=== 大銀河：自分のスピリットが0体なら起動できない ===")
{
    const s = game("ginga")
    const ginga = createInstance(GINGA, s.turn, 2)
    s.players.p1.field.nexuses.push(ginga)
    assert(!activatedActionResolvable(s, "p1", ginga, actionOf(GINGA)), "自分のスピリットがいない")
    put(s, "p1", VANILLA)
    assert(activatedActionResolvable(s, "p1", ginga, actionOf(GINGA)), "1体いれば起動できる")
}

console.log("=== キグナ：自身が「星魂」なので、ほかにいなくても起動できる ===")
{
    const s = game("kiguna")
    const kiguna = put(s, "p1", KIGUNA, 1)
    assert(getCard(KIGUNA).family.includes("星魂"), "前提：キグナは星魂")
    assert(activatedActionResolvable(s, "p1", kiguna, actionOf(KIGUNA)), "自身が対象に入る")
}

console.log("=== アルカナ・カグヤ：相手のスピリットがいなければ起動できない ===")
for (const id of [ARCANA, KAGUYA]) {
    const s = game(`opp-${id}`)
    const self = put(s, "p1", id, 5)
    assert(!activatedActionResolvable(s, "p1", self, actionOf(id)), `${getCard(id).name}：相手がいない`)
    put(s, "p2", VANILLA)
    assert(activatedActionResolvable(s, "p1", self, actionOf(id)), `${getCard(id).name}：相手がいれば起動できる`)
}

console.log("=== ビートプリースト：手札に「殻虫」のスピリットカードがなければ起動できない ===")
{
    const s = game("priest")
    const priest = put(s, "p1", PRIEST, 5)
    s.players.p1.hand = [VANILLA]
    assert(!activatedActionResolvable(s, "p1", priest, actionOf(PRIEST)), "殻虫がない")
    s.players.p1.hand.push(BEAT)
    assert(activatedActionResolvable(s, "p1", priest, actionOf(PRIEST)), "殻虫があれば起動できる")
}

console.log("=== サーバーも同じ判定で拒否する（大銀河） ===")
{
    const s = game("ginga-act")
    const ginga = createInstance(GINGA, s.turn, 2)
    s.players.p1.field.nexuses.push(ginga)
    s.players.p1.hand = [PISCES]
    const a = put(s, "p2", VANILLA, 1)
    s.turnPlayer = "p2"
    assert(act(s, "p2", { type: "attack", instanceId: a.instanceId }) === null, "相手のアタック")
    const id = getCard(GINGA).effects.find((e) => e.kind === "activated")!.id
    assert(act(s, "p1", { type: "activateAbility", instanceId: ginga.instanceId, effectId: id }) !== null, "自分のスピリットがいなければ起動できない")
    assert(s.players.p1.hand.length === 1, "手札も破棄されない")
}

console.log("すべてのチェックに合格しました 🎉（part704）")
