// smoke パート681（バースト効果の範囲：バーストで召喚されたスピリットの召喚時効果はバースト効果ではない。効果文だけから書いた期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const SHUTEN = "BS14-019" // シュテン・ドーガ（紫・スピリット）
const SETSUNA = "BS14-097" // 刹那残影弓（紫・マジック・バースト：相手の召喚時発揮後）
const ROUND = "BS17-076" // ラウンドテーブルナイツ（紫・マジック・バースト：ライフ減少後）
const MAMIRA = "BS02-017" // マミーラ（紫・スピリット・召喚時：相手スピリットのコア1個をリザーブへ）
const SHORETSU = "BS16-078" // 翔烈降臨（緑・マジック・バースト：ライフ減少後・緑スピリットを手札から召喚）
const SPA = "BS18-027" // 翼の覇獣スパ・ルーダ（緑/青・コスト12）
const GREEN_B = "BS03-025" // スタッグシザー（緑・コスト1）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [SHUTEN]: "シュテン・ドーガ", [SETSUNA]: "刹那残影弓", [ROUND]: "ラウンドテーブルナイツ", [MAMIRA]: "マミーラ",
        [SHORETSU]: "翔烈降臨", [SPA]: "翼の覇獣スパ・ルーダ", [GREEN_B]: "スタッグシザー", [RED]: "ロクケラトプス",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(SHUTEN).type === "spirit" && getCard(MAMIRA).type === "spirit" && getCard(SPA).type === "spirit" && getCard(GREEN_B).type === "spirit", "スピリット")
    assert(getCard(SETSUNA).type === "magic" && getCard(ROUND).type === "magic" && getCard(SHORETSU).type === "magic", "マジック")
}

const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")
function reply(s: GameState, action: GameAction): void {
    const p = s.pendingChoice
    if (p === null) return
    const err = act(s, p.pid, action)
    assert(err === null, `選択待ち（${p.prompt}）に答えられる${err === null ? "" : `（拒否: ${err}）`}`)
}
// 確認は先頭の選択肢、対象は prefer の id を優先、カードは preferCard の cardId を優先
function drain(s: GameState, prefer: string[] = [], preferCard = ""): void {
    let n = 0
    while (s.pendingChoice !== null && n++ < 12) {
        const p = s.pendingChoice
        if (p.kind === "target") {
            const id = prefer.find((x) => p.candidates.includes(x)) ?? p.candidates[0] ?? ""
            reply(s, id === "" ? { type: "resolveChoice" } : { type: "resolveChoice", instanceId: id })
        } else if (p.kind === "card") {
            const idxs = p.cardIndices ?? []
            const hit = idxs.find((i) => s.players[p.pid].hand[i] === preferCard)
            reply(s, { type: "resolveChoice", cardIndex: hit ?? idxs[0] ?? 0 })
        } else reply(s, { type: "resolveChoice", option: p.options?.[0] ?? "" })
    }
}
function flash(s: GameState): void {
    let n = 0
    while (s.pendingChoice === null && s.isFlashTiming && s.battle && n++ < 6) if (act(s, s.priorityPlayer, { type: "pass" })) break
}

function base(seed: string, turn: PlayerId, interactive: boolean) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    s.turn = 3
    s.turnPlayer = turn
    s.priorityPlayer = turn
    s.phase = "main"
    s.interactiveTargets = interactive
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 20
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => RED)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
    }
    const mk = (pid: PlayerId, cardId: string, cores: number) => {
        const inst = createInstance(cardId, s.turn - 1, cores)
        s.players[pid].field.spirits.push(inst)
        refreshLevelAsOverrides(s)
        return inst
    }
    return { s, mk }
}

// 場面1: 防御側のバースト（刹那残影弓）が、攻撃側の召喚したマミーラの召喚時効果の後に発動。置かれるコアを攻撃側のリザーブ増で測る
function scene1(withShuten: boolean) {
    const turn: PlayerId = "p1"
    const def = other(turn)
    const { s, mk } = base(`s1-${withShuten}`, turn, true)
    const stooge = mk(turn, RED, 3)
    mk(def, withShuten ? SHUTEN : RED, 3) // マミーラの召喚時効果の的を兼ねる
    s.players[def].burst = SETSUNA
    s.players[def].burstSet = true
    s.players[turn].hand = [MAMIRA]
    const before = stooge.cores
    const err = act(s, turn, { type: "summon", handIndex: 0 })
    assert(err === null, `マミーラを召喚できる${err === null ? "" : `（拒否: ${err}）`}`)
    drain(s, [stooge.instanceId])
    const burstUsed = s.players[def].burst === null && s.players[def].trashCards.includes(SETSUNA)
    return { removed: before - stooge.cores, burstUsed }
}
console.log("=== 1. シュテン・ドーガ：自分のバースト効果で置かれるコア+1 ===")
{
    const a = scene1(true)
    const b = scene1(false)
    assert(a.burstUsed && b.burstUsed, "刹那残影弓のバーストが発動した")
    assert(a.removed === 2, `シュテンがいる：置かれるコアは2個（実際 ${a.removed}）`)
    assert(b.removed === 1, `シュテンがいない：置かれるコアは1個（実際 ${b.removed}）`)
}

// 場面2: 防御側のバースト（ラウンドテーブルナイツ）で召喚したマミーラの召喚時効果は、バースト効果ではない
function scene2(interactive: boolean) {
    const turn: PlayerId = "p1"
    const def = other(turn)
    const { s, mk } = base(`s2-${interactive}`, turn, interactive)
    const atk = mk(turn, RED, 1)
    const stooge = mk(turn, GREEN_B, 3)
    mk(def, SHUTEN, 3)
    s.players[def].life = 3
    s.players[def].burst = ROUND
    s.players[def].burstSet = true
    s.players[def].trashCards = [MAMIRA]
    s.phase = "attack"
    const aerr = act(s, turn, { type: "attack", instanceId: atk.instanceId })
    assert(aerr === null, `アタックできる${aerr === null ? "" : `（拒否: ${aerr}）`}`)
    flash(s)
    const terr = act(s, def, { type: "takeLife" })
    assert(terr === null, `ライフで受ける${terr === null ? "" : `（拒否: ${terr}）`}`)
    drain(s, [stooge.instanceId])
    const burstUsed = s.players[def].burst === null && s.players[def].trashCards.includes(ROUND)
    const mamira = s.players[def].field.spirits.some((x) => x.cardId === MAMIRA)
    return { removed: 3 - stooge.cores, burstUsed, mamira }
}
console.log("=== 2. バーストで召喚したマミーラの召喚時効果は+1されない ===")
for (const interactive of [true, false]) {
    const r = scene2(interactive)
    assert(r.burstUsed && r.mamira, `ラウンドテーブルナイツが発動しマミーラが召喚された（対話=${interactive}）`)
    assert(r.removed === 1, `置かれるコアは1個（実際 ${r.removed}。対話=${interactive}）`)
}

// 場面3・4: スパ・ルーダ
function scene3(interactive: boolean) {
    const turn: PlayerId = "p1"
    const def = other(turn)
    const { s, mk } = base(`s3-${interactive}`, turn, interactive)
    const atk = mk(turn, RED, 1)
    const others = [mk(turn, RED, 1), mk(turn, RED, 1), mk(turn, RED, 1)]
    s.players[def].life = 3
    s.players[def].burst = SHORETSU
    s.players[def].burstSet = true
    s.players[def].hand = [GREEN_B, SPA]
    s.phase = "attack"
    const aerr = act(s, turn, { type: "attack", instanceId: atk.instanceId })
    assert(aerr === null, `アタックできる${aerr === null ? "" : `（拒否: ${aerr}）`}`)
    flash(s)
    const terr = act(s, def, { type: "takeLife" })
    assert(terr === null, `ライフで受ける${terr === null ? "" : `（拒否: ${terr}）`}`)
    drain(s, [], SPA)
    const spa = s.players[def].field.spirits.some((x) => x.cardId === SPA)
    return { spa, rested: others.filter((x) => x.isRested).length }
}
console.log("=== 3. バーストで召喚したスパ・ルーダ：相手3体が疲労 ===")
for (const interactive of [true, false]) {
    const r = scene3(interactive)
    if (!interactive) continue // 自動では手札のどれが選ばれるか不定。召喚されたときだけ判定する
    assert(r.spa, "スパ・ルーダが召喚された（対話）")
    assert(r.rested === 3, `相手の回復状態のスピリット3体が疲労（実際 ${r.rested}）`)
}
{
    const r = scene3(false)
    if (r.spa) assert(r.rested === 3, `自動でスパ・ルーダが召喚されたなら3体疲労（実際 ${r.rested}）`)
    else console.log("（自動：スタッグシザーが選ばれたため判定対象外）")
}

console.log("=== 4. 対照：スパ・ルーダを手札から普通に召喚 ===")
for (const interactive of [true, false]) {
    const { s, mk } = base(`s4-${interactive}`, "p1", interactive)
    const foes = [mk("p2", RED, 1), mk("p2", RED, 1), mk("p2", RED, 1)]
    s.players.p1.hand = [SPA]
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `スパ・ルーダを召喚できる${err === null ? "" : `（拒否: ${err}）`}`)
    drain(s)
    assert(s.players.p1.field.spirits.some((x) => x.cardId === SPA), "スパ・ルーダが場にいる")
    assert(foes.every((x) => !x.isRested), `バースト召喚でないので疲労しない（対話=${interactive}）`)
}

console.log("すべてのチェックに合格しました 🎉（part681）")
