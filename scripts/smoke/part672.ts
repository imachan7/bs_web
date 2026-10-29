// smoke パート672（ネクサスを手札／デッキの上に戻す効果で、効果の使い手が戻すネクサスを選ぶ。
// BS01-112・BS10-089・BS14-083・BS18-058・BS17-025・BS13-055。効果文のみから書いた期待値）
import { assert, createGame, createInstance, currentLevel, endTurn, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const NA = "BS11-064" // 闇の聖剣（候補。0コアでLv1）
const NB = "BS16-069" // セブンブリッジ
const NC = "BS14-083" // 氷結した瀑布

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, [string, string]> = {
        "BS01-112": ["千年雪の尖塔", "nexus"],
        "BS10-089": ["月照す氷結湖", "nexus"],
        "BS14-083": ["氷結した瀑布", "nexus"],
        "BS18-058": ["ガン・ホース", "brave"],
        "BS17-025": ["ライ・シュウユ", "spirit"],
        "BS13-055": ["重装合体シールド・ドラゴンMk-II", "brave"],
        "BS11-064": ["闇の聖剣", "nexus"],
        "BS16-069": ["セブンブリッジ", "nexus"],
    }
    for (const [id, [n, t]] of Object.entries(names)) assert(getCard(id).name === n && getCard(id).type === t, `${id}は${n}`)
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    return s
}

function nexus(s: GameState, pid: PlayerId, cardId: string, cores = 0) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 選択待ちが立っていて、候補に pick があれば答える。立っていなければ何もしない（その不在は呼び出し側が assert する）
function answer(s: GameState, pick: string): boolean {
    const pc = s.pendingChoice
    if (!pc || !pc.candidates?.includes(pick)) return false
    return handleAction(s, pc.pid, { type: "resolveChoice", instanceId: pick }) === null
}

const nexusIds = (s: GameState, pid: PlayerId) => s.players[pid].field.nexuses.map((n) => n.instanceId)
const handCount = (s: GameState, pid: PlayerId, cardId: string) => s.players[pid].hand.filter((c) => c === cardId).length

// 自分（p2）のスタートステップで発動するネクサス。相手（p1）のネクサスは3つ（NA・NB・NC）
function startStepCase(label: string, ownerCard: string, ownerCores: number, level: number) {
    console.log(`=== ${label}: 相手のネクサスが3つ→使い手が選ぶ（先頭以外を選ぶ） ===`)
    {
        const s = game(`${label}-3`)
        const mine = nexus(s, "p2", ownerCard, ownerCores)
        assert(currentLevel(mine).level === level, `${label}: Lv${level}で発動する場面`)
        const [a, b, c] = [nexus(s, "p1", NA), nexus(s, "p1", NB), nexus(s, "p1", NC)]
        const handBefore = s.players.p1.hand.length
        endTurn(s) // p1 → p2 のターン開始（スタートステップで発動）
        assert(s.turnPlayer === "p2", `${label}: p2のターン`)
        assert(s.pendingChoice !== null, `${label}: 3つ以上あるので選択待ちが立つ`)
        assert(s.pendingChoice?.pid === "p2", `${label}: 選ぶのは効果の使い手（p2）`)
        assert(!s.pendingChoice?.candidates?.includes(mine.instanceId), `${label}: 自分のネクサスは候補に入らない`)
        assert(answer(s, b.instanceId), `${label}: 先頭以外（${b.instanceId}）を選べる`)
        assert(s.pendingChoice === null, `${label}: 解決して選択待ちが残らない`)
        assert(nexusIds(s, "p1").join() === [a.instanceId, c.instanceId].join(), `${label}: 選んだ1つだけが場を離れる`)
        assert(s.players.p1.hand.length === handBefore + 1 && handCount(s, "p1", NB) === 1, `${label}: 選んだネクサスが持ち主（p1）の手札へ`)
        assert(nexusIds(s, "p2").includes(mine.instanceId), `${label}: 自分のネクサスは残る`)
    }
    console.log(`=== ${label}: 相手のネクサスがちょうど1つなら選ばずに戻る ===`)
    {
        const s = game(`${label}-1`)
        nexus(s, "p2", ownerCard, ownerCores)
        nexus(s, "p1", NB)
        endTurn(s)
        assert(s.pendingChoice === null, `${label}: 候補1つなら選択待ちなし`)
        assert(nexusIds(s, "p1").length === 0 && handCount(s, "p1", NB) === 1, `${label}: そのネクサスが手札へ`)
    }
    console.log(`=== ${label}: 相手のネクサスが0なら何も起きない（自分のネクサスは戻らない） ===`)
    {
        const s = game(`${label}-0`)
        const mine = nexus(s, "p2", ownerCard, ownerCores)
        endTurn(s)
        assert(s.pendingChoice === null, `${label}: 選択待ちなし`)
        assert(nexusIds(s, "p2").includes(mine.instanceId) && s.players.p2.hand.every((c) => c !== ownerCard), `${label}: 自分のネクサスは動かない`)
    }
}

startStepCase("BS01-112 Lv1", "BS01-112", 1, 1)
startStepCase("BS10-089 Lv1", "BS10-089", 0, 1)
startStepCase("BS14-083 Lv2", "BS14-083", 1, 2)

console.log("=== BS14-083: Lv1 では戻す効果は発動しない ===")
{
    const s = game("bs14083-lv1")
    const mine = nexus(s, "p2", "BS14-083", 0)
    assert(currentLevel(mine).level === 1, "Lv1")
    nexus(s, "p1", NA)
    nexus(s, "p1", NB)
    endTurn(s)
    assert(s.pendingChoice === null && nexusIds(s, "p1").length === 2, "相手のネクサスは動かない")
}

console.log("=== BS01-112: 相手のスタートステップでは発動しない ===")
{
    const s = game("bs01112-opp-turn")
    nexus(s, "p1", "BS01-112", 1)
    nexus(s, "p2", NA)
    nexus(s, "p2", NB)
    endTurn(s) // p2 のターン（p1 のネクサスは発動しない）
    assert(s.pendingChoice === null && nexusIds(s, "p2").length === 2, "p2のネクサスは動かない")
}

// ---- 召喚時 ----
function summonInto(s: GameState, cardId: string) {
    s.players.p1.hand = [cardId]
    return handleAction(s, "p1", { type: "summon", handIndex: 0 })
}

console.log("=== BS18-058 ガン・ホース: 召喚時、相手のネクサス1つを手札に戻す ===")
{
    const s = game("bs18058")
    const [a, b, c] = [nexus(s, "p2", NA), nexus(s, "p2", NB), nexus(s, "p2", NC)]
    assert(summonInto(s, "BS18-058") === null, "召喚できる")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは召喚した側（p1）")
    assert(answer(s, c.instanceId), "末尾のネクサスを選べる")
    assert(nexusIds(s, "p2").join() === [a.instanceId, b.instanceId].join(), "選んだ1つだけが離れる")
    assert(handCount(s, "p2", NC) === 1, "相手（持ち主）の手札へ")
}

console.log("=== BS13-055 シールド・ドラゴンMk-II: 召喚時、相手のネクサス1つをデッキの上に戻す ===")
{
    const s = game("bs13055")
    const [a, b, c] = [nexus(s, "p2", NA), nexus(s, "p2", NB), nexus(s, "p2", NC)]
    const deckBefore = s.players.p2.deck.length
    assert(summonInto(s, "BS13-055") === null, "召喚できる")
    assert(s.pendingChoice?.pid === "p1", "選ぶのは召喚した側（p1）")
    assert(answer(s, b.instanceId), "先頭以外を選べる")
    assert(nexusIds(s, "p2").join() === [a.instanceId, c.instanceId].join(), "選んだ1つだけが離れる")
    assert(s.players.p2.deck.length === deckBefore + 1 && s.players.p2.deck[0] === NB, "相手のデッキの一番上に置かれる")
    assert(handCount(s, "p2", NB) === 0, "手札には行かない")
}

console.log("=== BS17-025 ライ・シュウユ: ネクサス2つを戻し、戻した数だけ相手のスピリットを疲労 ===")
{
    const s = game("bs17025-2")
    const [a, b, c] = [nexus(s, "p2", NA), nexus(s, "p2", NB), nexus(s, "p2", NC)]
    const sp = [1, 2, 3].map(() => createInstance(VANILLA, s.turn - 1, 1))
    s.players.p2.field.spirits.push(...sp)
    assert(summonInto(s, "BS17-025") === null, "召喚できる")
    assert(s.pendingChoice?.pid === "p1", "ネクサスを選ぶのは召喚した側（p1）")
    assert(answer(s, c.instanceId), "1つ目（末尾）を選べる")
    assert(answer(s, a.instanceId), "2つ目を選べる（2つ選ぶ）")
    assert(nexusIds(s, "p2").join() === b.instanceId, "選ばなかった1つだけが残る")
    assert(handCount(s, "p2", NA) === 1 && handCount(s, "p2", NC) === 1, "選んだ2つが相手の手札へ")
    assert(answer(s, sp[2]!.instanceId), "疲労させる1体目を選べる")
    assert(answer(s, sp[1]!.instanceId), "疲労させる2体目を選べる（戻した2つにつき2体）")
    assert(sp[2]!.isRested && sp[1]!.isRested && !sp[0]!.isRested, "選んだ2体だけ疲労")
    assert(s.pendingChoice === null, "3体目は疲労させない")
}

console.log("=== BS17-025: 相手のネクサスが1つだけなら戻すのは1つ、疲労も1体 ===")
{
    const s = game("bs17025-1")
    nexus(s, "p2", NB)
    const sp = [1, 2, 3].map(() => createInstance(VANILLA, s.turn - 1, 1))
    s.players.p2.field.spirits.push(...sp)
    assert(summonInto(s, "BS17-025") === null, "召喚できる")
    assert(nexusIds(s, "p2").length === 0 && handCount(s, "p2", NB) === 1, "1つ戻る")
    assert(answer(s, sp[1]!.instanceId), "疲労させる1体を選べる")
    assert(s.pendingChoice === null, "追加の選択はない")
    assert(sp.filter((x) => x.isRested).length === 1 && sp[1]!.isRested, "疲労は1体だけ")
}

console.log("=== BS17-025: 相手のネクサスが0なら疲労もさせない ===")
{
    const s = game("bs17025-0")
    const sp = [1, 2].map(() => createInstance(VANILLA, s.turn - 1, 1))
    s.players.p2.field.spirits.push(...sp)
    assert(summonInto(s, "BS17-025") === null, "召喚できる")
    assert(s.pendingChoice === null && sp.every((x) => !x.isRested), "戻したネクサスが0なので疲労なし")
}

console.log("すべてのチェックに合格しました 🎉（part672）")
