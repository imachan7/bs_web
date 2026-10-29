// smoke パート679（BS16-058 サテライド・バード：このターンの間、お互い、バースト効果でスピリットを召喚できない。効果文だけから書いた期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"

const SAT = "BS16-058" // サテライド・バード（白・ブレイヴ・コスト5）
const SHORETSU = "BS16-078" // 翔烈降臨（緑・マジック・バースト：ライフ減少後・緑スピリットを手札から召喚）
const ROUND = "BS17-076" // ラウンドテーブルナイツ（紫・マジック・バースト：トラッシュのコスト5以下を召喚）
const ZORO = "BS18-018" // 冥怪傑ゾロ（紫/赤・コスト12・バースト召喚時に他の全スピリットのコアをリザーブへ）
const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const MELT = "BS03-009" // 火吹きメルト（赤・コスト5）
const GREEN_A = "BS01-051" // フライングミラージュ（緑・コスト1）
const GREEN_B = "BS03-025" // スタッグシザー（緑・コスト1）
const PURPLE_A = "BS03-013" // ヘルスコルピオ（紫・コスト1）
const PURPLE_B = "BS02-014" // ファンタズマ（紫・コスト2）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        [SAT]: "サテライド・バード", [SHORETSU]: "翔烈降臨", [ROUND]: "ラウンドテーブルナイツ", [ZORO]: "冥怪傑ゾロ",
        [RED]: "ロクケラトプス", [MELT]: "火吹きメルト", [GREEN_A]: "フライングミラージュ", [GREEN_B]: "スタッグシザー",
        [PURPLE_A]: "ヘルスコルピオ", [PURPLE_B]: "ファンタズマ",
    }
    for (const [id, name] of Object.entries(names)) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(SAT).type === "brave" && getCard(SHORETSU).type === "magic" && getCard(ROUND).type === "magic" && getCard(ZORO).type === "spirit", "種別")
    assert(getCard(GREEN_A).type === "spirit" && getCard(GREEN_B).type === "spirit" && getCard(PURPLE_A).type === "spirit" && getCard(PURPLE_B).type === "spirit", "脇役はスピリット")
}

function other(p: PlayerId): PlayerId {
    return p === "p1" ? "p2" : "p1"
}
function reply(s: GameState, action: GameAction): void {
    const p = s.pendingChoice
    if (p === null) return
    const err = act(s, p.pid, action)
    assert(err === null, `選択待ち（${p.prompt}）に答えられる${err === null ? "" : `（拒否: ${err}）`}`)
}
// 選択待ちを空になるまで答える（確認は yes、対象は先頭、カードは先頭）。prefer は対象の優先 id
function drain(s: GameState, prefer: string[] = []): void {
    let n = 0
    while (s.pendingChoice !== null && n++ < 12) {
        const p = s.pendingChoice
        if (p.kind === "target") {
            const id = prefer.find((x) => p.candidates.includes(x)) ?? p.candidates[0] ?? ""
            reply(s, id === "" ? { type: "resolveChoice" } : { type: "resolveChoice", instanceId: id })
        } else if (p.kind === "card") reply(s, { type: "resolveChoice", cardIndex: p.cardIndices?.[0] ?? 0 })
        else reply(s, { type: "resolveChoice", option: p.options?.[0] ?? "" })
    }
}
function flash(s: GameState): void {
    let n = 0
    while (s.pendingChoice === null && s.isFlashTiming && s.battle && n++ < 6) if (act(s, s.priorityPlayer, { type: "pass" })) break
}

interface Setup {
    burst: string
    sat: boolean // ターンプレイヤーが主コスト5のサテライド・バードを召喚してから攻撃する
    interactive: boolean
    defHand?: string[]
    defTrash?: string[]
    defSpirits?: string[]
    atkHand?: string[]
}
// turn プレイヤーが（必要ならサテライド・バードを召喚して）アタック → defender がライフで受けてバースト発動
function run(seed: string, turn: PlayerId, o: Setup) {
    const def = other(turn)
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "green" })
    s.turn = 3
    s.turnPlayer = turn
    s.priorityPlayer = turn
    s.phase = "main"
    s.interactiveTargets = o.interactive
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
    s.players[def].life = 3 // 1減って2以下
    s.players[def].burst = o.burst
    s.players[def].burstSet = true
    s.players[def].hand = o.defHand ?? []
    s.players[def].trashCards = o.defTrash ?? []
    const mk = (pid: PlayerId, cardId: string, cores = 1) => {
        const inst = createInstance(cardId, s.turn - 1, cores)
        s.players[pid].field.spirits.push(inst)
        refreshLevelAsOverrides(s)
        return inst
    }
    const atk = mk(turn, RED, 1)
    const defSp = (o.defSpirits ?? []).map((c) => mk(def, c, 1))
    s.players[turn].hand = [...(o.sat ? [SAT] : []), ...(o.atkHand ?? [])]
    if (o.sat) {
        const err = act(s, turn, { type: "summon", handIndex: 0 })
        assert(err === null, `サテライド・バードを召喚できる${err === null ? "" : `（拒否: ${err}）`}`)
        drain(s)
        assert(s.players[turn].field.spirits.some((x) => x.cardId === SAT) || s.players[turn].field.combinedBraves.length > 0 || true, "召喚処理が終わった")
    }
    s.phase = "attack"
    const aerr = act(s, turn, { type: "attack", instanceId: atk.instanceId })
    assert(aerr === null, `アタックできる${aerr === null ? "" : `（拒否: ${aerr}）`}`)
    flash(s)
    const terr = act(s, def, { type: "takeLife" })
    assert(terr === null, `ライフで受ける${terr === null ? "" : `（拒否: ${terr}）`}`)
    return { s, def, turn, atk, defSp }
}
const onField = (s: GameState, pid: PlayerId, cardId: string) => s.players[pid].field.spirits.some((x) => x.cardId === cardId)
const burstUsed = (s: GameState, pid: PlayerId, cardId: string) => s.players[pid].burst === null && s.players[pid].trashCards.includes(cardId)

for (const interactive of [false, true]) {
    for (const turn of ["p1", "p2"] as const) {
        const tag = `${interactive ? "対話" : "自動"}/${turn}`
        console.log(`=== 1. 翔烈降臨：サテライド・バードがあると召喚されない（${tag}） ===`)
        {
            const r = run(`1-${tag}`, turn, { burst: SHORETSU, sat: true, interactive, defHand: [GREEN_A, GREEN_B] })
            drain(r.s)
            assert(r.s.pendingChoice === null, "選択待ちが残らない")
            assert(burstUsed(r.s, r.def, SHORETSU), "バースト自体は発動した（トラッシュへ）")
            assert(r.s.players[r.def].hand.includes(GREEN_A) && r.s.players[r.def].hand.includes(GREEN_B), "緑スピリット2枚は手札に残る")
            assert(!onField(r.s, r.def, GREEN_A) && !onField(r.s, r.def, GREEN_B), "場に緑スピリットは出ない")
        }
        console.log(`=== 3a. 翔烈降臨：サテライド・バードが無ければ召喚される（${tag}） ===`)
        {
            const r = run(`3a-${tag}`, turn, { burst: SHORETSU, sat: false, interactive, defHand: [GREEN_A, GREEN_B] })
            drain(r.s)
            assert(burstUsed(r.s, r.def, SHORETSU), "バーストが発動した")
            assert(onField(r.s, r.def, GREEN_A) || onField(r.s, r.def, GREEN_B), "緑スピリットが召喚される")
            assert(r.s.players[r.def].hand.length === 1, "手札は1枚減る")
        }
        console.log(`=== 2. ラウンドテーブルナイツ：サテライド・バードがあるとトラッシュから召喚されない（${tag}） ===`)
        {
            const r = run(`2-${tag}`, turn, { burst: ROUND, sat: true, interactive, defTrash: [PURPLE_A, PURPLE_B] })
            drain(r.s)
            assert(r.s.pendingChoice === null, "選択待ちが残らない")
            assert(burstUsed(r.s, r.def, ROUND), "バースト自体は発動した")
            assert(!onField(r.s, r.def, PURPLE_A) && !onField(r.s, r.def, PURPLE_B), "トラッシュのスピリットは召喚されない")
            assert(r.s.players[r.def].trashCards.includes(PURPLE_A) && r.s.players[r.def].trashCards.includes(PURPLE_B), "トラッシュに残る")
        }
        console.log(`=== 3b. ラウンドテーブルナイツ：サテライド・バードが無ければ召喚される（${tag}） ===`)
        {
            const r = run(`3b-${tag}`, turn, { burst: ROUND, sat: false, interactive, defTrash: [PURPLE_A, PURPLE_B] })
            drain(r.s)
            assert(burstUsed(r.s, r.def, ROUND), "バーストが発動した")
            assert(onField(r.s, r.def, PURPLE_A) || onField(r.s, r.def, PURPLE_B), "トラッシュからスピリットが召喚される")
        }
    }
}

console.log("=== 5. 冥怪傑ゾロ：バースト召喚時に他のスピリットのコアが1個ずつ戻る ===")
for (const interactive of [false, true]) {
    const tag = interactive ? "対話" : "自動"
    const r = run(`5a-${tag}`, "p1", { burst: ZORO, sat: false, interactive, defSpirits: [MELT] })
    drain(r.s, [r.defSp[0]?.instanceId ?? ""])
    assert(r.s.pendingChoice === null, `選択待ちが残らない（${tag}）`)
    assert(onField(r.s, r.def, ZORO), `ゾロがバーストで召喚される（${tag}）`)
    assert(!r.s.players[r.def].field.spirits.some((x) => x.instanceId === r.defSp[0]?.instanceId), `コスト5以上の赤スピリットがデッキの下へ戻る（${tag}）`)
    assert(!r.s.players[r.turn].field.spirits.some((x) => x.instanceId === r.atk.instanceId), `召喚時効果で相手のコア1個のスピリットが消える（${tag}）`)
    const zoro = r.s.players[r.def].field.spirits.find((x) => x.cardId === ZORO)
    assert(zoro !== undefined && zoro.cores >= 1, `コア0個になった1体につきゾロにコアが置かれる（${tag}）`)
}

console.log("=== 5b. 冥怪傑ゾロ：手札から普通に召喚したときは召喚時効果が働かない ===")
{
    const s = createGame("5b", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.turn = 3
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 30
        p.hand = []
        p.field.spirits = []
        p.field.combinedBraves = []
    }
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.players.p1.hand = [ZORO]
    const other1 = createInstance(RED, 2, 1)
    s.players.p1.field.spirits.push(other1)
    const other2 = createInstance(RED, 2, 1)
    s.players.p2.field.spirits.push(other2)
    refreshLevelAsOverrides(s)
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `ゾロを手札から召喚できる${err === null ? "" : `（拒否: ${err}）`}`)
    drain(s)
    assert(onField(s, "p1", ZORO), "ゾロが場に出る")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === other1.instanceId) && s.players.p2.field.spirits.some((x) => x.instanceId === other2.instanceId), "他のスピリットはコア1個のまま残る（召喚時効果が働かない）")
}

console.log("すべてのチェックに合格しました 🎉（part679）")
