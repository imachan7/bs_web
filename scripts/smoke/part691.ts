// smoke パート691（回復の問い合わせ。禁止の効く範囲の3規則）
// 1) 場面を限らない「回復できない／しない」はリフレッシュステップにも効果による回復にも効く。『自分のリフレッシュステップ』のように限れば、その場面だけ
// 2) 「リフレッシュステップ以外で回復できない」はキーワード能力（【超覚醒】）による回復も止める
// 3) 「回復できない」は対象に取ることを防がない
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SKULDIA = "BS02-042" // スクルディア（Lv1･Lv2 自分のリフレッシュステップ：自身は回復しない／Lv2 疲労したとき相手の疲労スピリット1体を指定、疲労状態で場にいる間それは回復できない）
const OUMI = "BS15-072" // 渦巻く大海峡（Lv1･Lv2 疲労状態のスピリットすべては、リフレッシュステップ以外で回復できない）
const GAI = "BS10-X01" // 幻羅星龍ガイ・アスラ（フラッシュ【超覚醒】：コアを置いたとき回復する）
const MOKU = "BS13-053" // モクバオー（ブレイヴ。【神速】スピリット召喚時、このブレイヴを回復させ合体できる。合体条件コスト3以上）
const ANT = "BS02-030" // 兵隊アントマン（緑・コスト3・フラッシュ【神速】）
const ELYSION = "BS11-X04" // 宝瓶神機アクア・エリシオン（お互いのリフレッシュステップ：ネクサスすべては回復できない）
const NEXUS = "BS03-112" // トランプの王国（ネクサス。回復の対象に使うだけ）
const REBOOT = "BS11-079" // リブートコード（白フラッシュ：疲労状態の自分のスピリットすべてを回復させる）
const VAN = "BS01-002" // ロクケラトプス

console.log("=== 前提: カードの機械確認 ===")
{
    const names: [string, string][] = [[SKULDIA, "スクルディア"], [OUMI, "渦巻く大海峡"], [GAI, "幻羅星龍ガイ・アスラ"], [MOKU, "モクバオー"],
        [ANT, "兵隊アントマン"], [ELYSION, "宝瓶神機アクア・エリシオン"], [NEXUS, "トランプの王国"], [REBOOT, "リブートコード"], [VAN, "ロクケラトプス"]]
    for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)
}

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 10
        p.trashCores = 0
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, kind: "spirits" | "nexuses" = "spirits", rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field[kind].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function flash(s: GameState, pid: PlayerId): void {
    s.isFlashTiming = true
    s.priorityPlayer = pid
}

console.log("=== A. 規則1・3: スクルディアの指定は、持ち主の効果による回復も止める ===")
{
    // mode: lv2＝指定が起きる／lv1＝Lv2効果が無く指定されない／recovered＝指定後にスクルディアが回復状態
    const make = (mode: "lv2" | "lv1" | "recovered") => {
        const s = game(`a-${mode}`, "p1", [], [REBOOT])
        s.phase = "attack"
        const sk = put(s, "p1", SKULDIA, mode === "lv1" ? 1 : 2)
        const foeA = put(s, "p2", VAN, 1, "spirits", true)
        const foeB = put(s, "p2", VAN, 1, "spirits", true)
        assert(act(s, "p1", { type: "attack", instanceId: sk.instanceId }) === null, `A(${mode}): スクルディアがアタックできる`)
        for (let i = 0; i < 5 && s.priorityPlayer !== "p2"; i++) act(s, s.priorityPlayer, { type: "pass" })
        if (mode === "recovered") sk.isRested = false
        flash(s, "p2")
        const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" })
        assert(err === null, `A(${mode}): リブートコードを使える（${err}）`)
        return [foeA, foeB].filter((x) => x.isRested).length
    }
    assert(make("lv2") === 1, "A: 指定された1体だけが、相手の効果による回復でも疲労のまま")
    assert(make("lv1") === 0, "A対照: Lv1 は指定しないので2体とも回復する")
    assert(make("recovered") === 0, "A対照: スクルディアが回復状態なら指定されていても回復する")
}

console.log("=== B. 規則2: 渦巻く大海峡は【超覚醒】による回復も止める ===")
for (const oumi of [true, false]) {
    const s = game(`b-${oumi}`, "p1")
    if (oumi) put(s, "p2", OUMI, 0, "nexuses")
    const gai = put(s, "p1", GAI, 1, "spirits", true)
    const src = put(s, "p1", VAN, 3)
    flash(s, "p1")
    const err = act(s, "p1", { type: "awaken", instanceId: gai.instanceId, fromInstanceId: src.instanceId, count: 1 })
    assert(err === null, `B: 【超覚醒】でコアを置ける（${err}）`)
    assert(gai.isRested === oumi, oumi ? "B: 大海峡の下ではコアを置いても回復しない" : "B対照: 大海峡が無ければ回復する")
}

console.log("=== C. 規則1: 大海峡の下で、モクバオーは回復せず、回復とセットの合体もしない ===")
for (const oumi of [true, false]) {
    const s = game(`c-${oumi}`, "p1", [ANT])
    s.phase = "attack"
    if (oumi) put(s, "p2", OUMI, 0, "nexuses")
    const moku = put(s, "p1", MOKU, 1, "spirits", true)
    flash(s, "p1")
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `C: 【神速】で召喚できる（${err}）`)
    if (s.pendingChoice) assert(false, `C: 確認待ちが出た（${JSON.stringify(s.pendingChoice).slice(0, 150)}）`)
    const combined = s.players.p1.field.combinedBraves.length > 0 || s.players.p1.field.spirits.some((x) => x.instanceId !== moku.instanceId && (x as any).braves?.length)
    assert(moku.isRested === oumi, oumi ? "C: モクバオーは回復しない" : "C対照: 大海峡が無ければ回復する")
    assert(!oumi || !combined, "C: 回復できないので合体もしない（CONJUNCTION「Aし、Bできる」は両方か、どちらもしない）")
}

console.log("=== D. 回帰: 『リフレッシュステップ』に限った禁止は、その場面だけ ===")
{
    // スクルディア自身（Lv1･Lv2）：自分のリフレッシュステップで回復しない。効果による回復は止まらない
    const s = game("d-sk", "p1", [REBOOT])
    const sk = put(s, "p1", SKULDIA, 2, "spirits", true)
    const other = put(s, "p1", VAN, 1, "spirits", true)
    runTurnStart(s)
    assert(sk.isRested === true, "D: スクルディアは自分のリフレッシュステップで回復しない")
    assert(other.isRested === false, "D対照: 並んだ別のスピリットは回復する")
    s.phase = "main"
    flash(s, "p1")
    const hi = s.players.p1.hand.indexOf(REBOOT)
    assert(hi >= 0 && act(s, "p1", { type: "castMagic", handIndex: hi, timing: "flash" }) === null, "D: リブートコードを使える")
    assert(sk.isRested === false, "D対照: 効果による回復はスクルディア自身にも効く")
}
for (const ely of [true, false]) {
    const s = game(`d-ely-${ely}`, "p1")
    if (ely) put(s, "p2", ELYSION, 1)
    const nex = put(s, "p1", NEXUS, 1, "nexuses", true)
    runTurnStart(s)
    assert(nex.isRested === ely, ely ? "D: エリシオンの下ではネクサスは回復しない" : "D対照: エリシオンが無ければネクサスは回復する")
}
// エリシオンの禁止が効果による回復を止めないことは、ネクサスを回復させる効果の持ち主が組めず書いていない

console.log("すべてのチェックに合格しました 🎉（part691）")
