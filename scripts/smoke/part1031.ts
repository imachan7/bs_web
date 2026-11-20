// smoke パート1031（#631 PB13-05 グラウンド・オブ・ロロ：エンドステップのゲーム再開始・1回だけ・無償配置不可。docs/design/IMPORT_631_PLAN.md §9.3 部品10）
import { assert, createGame, createInstance, destroyNexus, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { countCards } from "./countCards"

const LORO = "PB13-05"
const SPIRITS = ["BS01-001", "BS02-014", "BS01-050", "BS01-074", "BS02-049", "BS03-071"] // 赤・紫・緑・白・黄・青（いずれも単色）
const COLORS = ["red", "purple", "green", "white", "yellow", "blue"]
const LAMP = "BS12-083" // マジックランプ（デッキ上3枚から、ネクサスをコストを支払わずに配置できる）
const VAN = "BS01-002"

assert(getCard(LORO).name === "グラウンド・オブ・ロロ" && getCard(LORO).type === "nexus" && getCard(LORO).cost === 6, "PB13-05はコスト6のネクサス")
SPIRITS.forEach((id, i) => assert(getCard(id).type === "spirit" && getCard(id).colors.length === 1 && getCard(id).colors[0] === COLORS[i], `${id}は${COLORS[i]}の単色スピリット`))
assert(getCard(LAMP).name === "マジックランプ", "BS12-083はマジックランプ")

function game(spirits: string[]): GameState {
    const s = createGame("loro", { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.priorityPlayer = "p1"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 4
    s.players.p1.field.nexuses.push(createInstance(LORO, 3, 1))
    for (const id of spirits) s.players.p1.field.spirits.push(createInstance(id, 3, 1))
    s.players.p2.field.spirits.push(createInstance(VAN, 3, 2))
    s.players.p1.trashCards = [VAN, VAN]
    s.players.p1.excludedCards = [VAN]
    s.players.p1.trashCores = 3
    s.players.p1.life = 4
    refreshLevelAsOverrides(s)
    return s
}
const total = (s: GameState, pid: PlayerId) => {
    const p = s.players[pid]
    return p.deck.length + p.hand.length + p.trashCards.length + p.field.spirits.length + p.field.nexuses.length + p.excludedCards.length + (p.burst === null ? 0 : 1)
}

console.log("=== 1. 6色そろってエンドステップ：再開する ===")
{
    const s = game(SPIRITS)
    s.players.p1.burst = VAN
    s.players.p1.burstSet = true
    const cardsBefore = countCards(s)
    const before = { p1: total(s, "p1"), p2: total(s, "p2") }
    s.players.p1.turnVirtualInstances = [createInstance(VAN, 3, 0)]
    handleAction(s, "p1", { type: "endTurn" })
    assert(s.gameRestartCount === 1, "再開は1回行われた")
    assert(s.turn === 1, "1ターン目から再開")
    assert(s.phase === "main", "新しい1ターン目はメインステップで止まる")
    assert(countCards(s) === cardsBefore, "カードの総数は変わらない")
    for (const pid of ["p1", "p2"] as PlayerId[]) {
        const p = s.players[pid]
        assert(total(s, pid) === before[pid], `${pid}のカード枚数（除外・場を含む）は変わらない`)
        assert(p.field.spirits.length === 0 && p.field.nexuses.length === 0 && p.trashCards.length === 0, `${pid}の場とトラッシュは空`)
        assert(p.trashCores === 0 && p.burst === null && p.turnVirtualInstances.length === 0, `${pid}のトラッシュのコア・バースト・貸与は空`)
        assert(p.reserve === 6, `${pid}のリザーブは6`)
    }
    // 手札：先攻は1ターン目のドローがない。後攻は2枚
    const second: PlayerId = s.turnPlayer === "p1" ? "p2" : "p1"
    assert(s.players[second].hand.length === 2, "後攻の手札は2枚")
    assert(s.players[s.turnPlayer].hand.length === 3, "先攻は1ターン目のドローで手札3枚（既存のドローステップのまま）")
    assert(s.players.p1.life === 4, "ライフはそのまま")
    assert(s.players.p1.excludedCards.length === 1, "ゲームから取り除いたカードは戻らない")
}

console.log("=== 1b. 対話モードでも再開し、再開スタックは残らない ===")
{
    const s = game(SPIRITS)
    s.interactiveTargets = true
    s.players.p2.field.nexuses.push(createInstance(LORO, 3, 1)) // 相手のロロは自分のエンドステップではないので発揮しない
    handleAction(s, "p1", { type: "endTurn" })
    for (let i = 0; i < 5 && s.pendingChoice; i++) handleAction(s, s.pendingChoice.pid, { type: "resolveChoice", chosenOption: "1. " + s.pendingChoice.options?.[0] } as never)
    assert(s.gameRestartCount === 1 && s.turn === 1 && s.resumeStack.length === 0, "再開は1回だけで、再開スタックは空")
    assert(s.players.p2.field.nexuses.length === 0, "相手のロロも場から戻っている")
}

console.log("=== 2. 6色そろわなければ何も起きない ===")
{
    const s = game(SPIRITS.slice(0, 5))
    handleAction(s, "p1", { type: "endTurn" })
    assert((s.gameRestartCount ?? 0) === 0, "5色では再開しない")
    assert(s.turn === 4 && s.turnPlayer === "p2", "通常どおり相手のターンへ進む")
    assert(s.players.p1.field.nexuses.length === 1, "ロロは場に残る")
}

console.log("=== 3. 2回目は起きない（相手のロロでも） ===")
{
    const s = game(SPIRITS)
    s.gameRestartCount = 1
    handleAction(s, "p1", { type: "endTurn" })
    assert(s.gameRestartCount === 1 && s.turn === 4, "使用済みなら再開しない")
    const t = game([])
    // 相手が6色そろえて自分のエンドステップに（p2のターン）ロロを使う場面
    t.turn = 4
    t.turnPlayer = "p2"
    t.players.p1.field.nexuses = []
    t.players.p2.field.nexuses.push(createInstance(LORO, 4, 1))
    for (const id of SPIRITS) t.players.p2.field.spirits.push(createInstance(id, 4, 1))
    refreshLevelAsOverrides(t)
    t.gameRestartCount = 1 // p1のロロで使用済み
    handleAction(t, "p2", { type: "endTurn" })
    assert(t.gameRestartCount === 1 && t.turn === 5, "どちらかが使っていれば相手のロロも発揮しない")
}

console.log("=== 4. コストを支払わずに配置する効果では配置できない ===")
{
    const s = game([])
    s.players.p1.field.nexuses = []
    s.players.p1.hand = [LAMP]
    s.players.p1.deck = [LORO, VAN, VAN, ...s.players.p1.deck]
    handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(s.players.p1.field.nexuses.length === 0, "マジックランプでロロは配置されない")
    assert(s.players.p1.trashCards.includes(LORO), "配置されなかったロロは破棄される")
}

console.log("=== 5. 通常の配置はできる ===")
{
    const s = game([])
    s.players.p1.field.nexuses = []
    s.players.p1.hand = [LORO]
    s.players.p1.reserve = 10
    handleAction(s, "p1", { type: "setNexus", handIndex: 0 })
    assert(s.players.p1.field.nexuses.some((n) => n.cardId === LORO), "コスト6を支払ってロロを配置できる")
    assert(s.players.p1.reserve === 4, "リザーブから6支払う")
}

console.log("=== 6. 無償で配置する他の経路（placeDenial）===")
{
    // ネクサスリペアー（BS04-113）：トラッシュのネクサスを無償で配置。ロロは対象外・ほかのネクサスは配置できる
    const REPAIR = "BS04-113"
    const OTHER = "KF-07" // 青のネクサス（noFreeSummon なし）
    assert(getCard(REPAIR).name === "ネクサスリペアー" && getCard(OTHER).type === "nexus", "ネクサスリペアーと青のネクサス")
    for (const [id, onField] of [[LORO, 0], [OTHER, 1]] as const) {
        const s = game([])
        s.players.p1.field.nexuses = []
        s.players.p1.hand = [REPAIR]
        s.players.p1.trashCards = [id]
        handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
        assert(s.players.p1.field.nexuses.length === onField, `deployNexus：${id}は${onField === 1 ? "配置される" : "配置されない"}`)
        assert(onField === 1 || s.players.p1.trashCards.includes(LORO), "配置されなかったロロはトラッシュに残る")
    }
    // 警備兵ジャッカー（BS04-061）：破壊された自分のネクサスを復活。ロロは復活しない
    const JACKAL = "BS04-061"
    assert(getCard(JACKAL).name === "戦闘獣ジャッカー", "BS04-061は戦闘獣ジャッカー")
    for (const [id, back] of [[LORO, 0], [OTHER, 1]] as const) {
        const s = game([])
        s.players.p1.field.nexuses = [createInstance(id, 3, 1)]
        s.players.p1.field.spirits.push(createInstance(JACKAL, 3, 2))
        refreshLevelAsOverrides(s)
        destroyNexus(s, "p1", s.players.p1.field.nexuses[0]!.instanceId)
        assert(s.players.p1.field.nexuses.length === back, `reviveLastDestroyedNexus：${id}は${back === 1 ? "復活する" : "復活しない"}`)
    }
}
// 配置できない経路（作れない場面）：デッキから破棄された自身を無償配置する効果（mill.ts deployThisNexusFree）とバーストの配置（control.ts）は、
// そのカード自身が持つ効果なので、効果を持たないロロでは起きない。入口の判定 placeDenial は上の場面と revealApplyOne で共通

console.log("すべてのチェックに合格しました 🎉（part1031）")
