// smoke パート669（ネクサスの破壊：誰が・どれを選ぶか。効果文だけから書いた期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1。Lv1 BP1000／Lv3 BP4000）
const NX = ["BS01-098", "BS01-099", "BS01-100"] // ネクサス（赤）。効果を見ずに「ただの的」として使う

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        "BS10-062": "砲凰竜フェニック・キャノン", "BS09-009": "烈火の勇者皇アーク", "BS14-094": "天翔龍神覇",
        "BS18-062": "最も高き山頂", "BS02-088": "クロスファイア", "BS05-054": "鉄槌のオズワルド", "SD01-033": "ヴィクトリーファイア",
        "BS01-030": "グリプ・ハンズ", [VANILLA]: "ロクケラトプス", "BS01-098": "燃えさかる戦場", "BS01-099": "百識の谷", "BS01-100": "ルビーの太陽",
    }
    for (const [id, n] of Object.entries(names)) assert(getCard(id).name === n, `${id} は ${n}`)
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.turn = 3
    for (const p of ["p1", "p2"] as const) {
        s.players[p].reserve = 10
        s.players[p].deck = Array.from({ length: 40 }, () => VANILLA)
        s.players[p].hand = []
    }
    return s
}
const spirit = (s: GameState, pid: PlayerId, card: string, cores = 1) => {
    const i = createInstance(card, s.turn - 1, cores)
    s.players[pid].field.spirits.push(i)
    refreshLevelAsOverrides(s)
    return i
}
const nexus = (s: GameState, pid: PlayerId, card: string, cores = 2) => {
    const i = createInstance(card, s.turn - 1, cores)
    s.players[pid].field.nexuses.push(i)
    refreshLevelAsOverrides(s)
    return i
}
const nexIds = (s: GameState, pid: PlayerId) => s.players[pid].field.nexuses.map((x) => x.instanceId)
const spIds = (s: GameState, pid: PlayerId) => s.players[pid].field.spirits.map((x) => x.instanceId)

interface Seen { pid: PlayerId; kind: string; candidates: string[] }
// 選択待ちを答え切る。want に挙げた id を優先して選び、選択待ちの履歴を返す
function drive(s: GameState, want: string[], opts: { mode?: string; cardIndex?: number } = {}): Seen[] {
    const seen: Seen[] = []
    for (let n = 0; n < 12 && s.pendingChoice; n++) {
        const pc = s.pendingChoice
        const cands = (pc.candidates ?? []) as unknown as string[]
        seen.push({ pid: pc.pid, kind: pc.kind, candidates: [...cands] })
        let err: string | null
        if (pc.kind === "option") {
            const o = (pc.options ?? []) as string[]
            err = act(s, pc.pid, { type: "resolveChoice", option: (opts.mode !== undefined ? o.find((x) => x.includes(opts.mode!)) : o[0]) ?? "" })
        } else if (pc.kind === "card") {
            err = act(s, pc.pid, { type: "resolveChoice", cardIndex: opts.cardIndex ?? 0 })
        } else if (pc.kind === "target") {
            const pick = want.find((w) => cands.includes(w)) ?? cands[0]
            if (pick !== undefined) want.splice(want.indexOf(pick), 1)
            err = act(s, pc.pid, { type: "resolveChoice", instanceId: pick ?? "" })
        } else throw new Error(`未対応の選択待ち: ${JSON.stringify(pc).slice(0, 300)}`)
        assert(err === null, `選択への応答が通る（${pc.kind}／${err ?? ""}）`)
    }
    return seen
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

console.log("=== SD01-033 ヴィクトリーファイア：スピリット1体とネクサス1つ。ネクサスは使用者が選ぶ ===")
{
    const s = game("sd01-033")
    const a = spirit(s, "p2", VANILLA)
    spirit(s, "p2", VANILLA)
    const n0 = nexus(s, "p2", NX[0]!), n1 = nexus(s, "p2", NX[1]!)
    const mine = nexus(s, "p1", NX[2]!)
    s.players.p1.hand = ["SD01-033"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "フラッシュ効果を使える")
    const seen = drive(s, [a.instanceId, n1.instanceId], { mode: "ネクサス" })
    const nx = seen.find((x) => x.candidates.includes(n0.instanceId))
    assert(nx !== undefined, "相手のネクサスが2つあるので、どれを壊すかの選択待ちが立つ")
    assert(nx?.pid === "p1", "ネクサスを選ぶのは効果を使う人（p1）")
    assert(nx !== undefined && sameSet(nx.candidates, [n0.instanceId, n1.instanceId]), "候補は相手のネクサス2つだけ（自分のネクサスは入らない）")
    assert(sameSet(nexIds(s, "p2"), [n0.instanceId]), "選んだ2つ目（先頭でないほう）が壊れ、先頭は残る")
    assert(sameSet(nexIds(s, "p1"), [mine.instanceId]), "自分のネクサスは壊れない")
    assert(spIds(s, "p2").length === 1 && !spIds(s, "p2").includes(a.instanceId), "選んだスピリットが壊れる")
}
{
    const s = game("sd01-033b")
    spirit(s, "p2", VANILLA)
    const only = nexus(s, "p2", NX[0]!)
    s.players.p1.hand = ["SD01-033"]
    act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    drive(s, [], { mode: "ネクサス" })
    assert(!nexIds(s, "p2").includes(only.instanceId), "相手のネクサスが1つなら、そのネクサスが壊れる")
}

console.log("=== BS14-094 天翔龍神覇：相手のネクサス2つ（バーストの持ち主が選ぶ） ===")
{
    const s = game("bs14-094")
    s.turnPlayer = "p2"; s.priorityPlayer = "p2"; s.phase = "main"
    s.players.p1.burst = "BS14-094"; s.players.p1.burstSet = true
    const n = NX.map((c) => nexus(s, "p2", c))
    nexus(s, "p1", NX[0]!)
    s.players.p2.hand = ["BS01-030"]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手がスピリットを召喚する")
    // バースト発動の確認 → 2つの選択
    for (let i = 0; i < 4 && s.pendingChoice && s.pendingChoice.kind === "option"; i++) {
        const pc = s.pendingChoice
        const o = (pc.options ?? []) as string[]
        const yes = o.find((x) => x.includes("発動") || x.includes("はい")) ?? o[0] ?? ""
        act(s, pc.pid, { type: "resolveChoice", option: yes })
    }
    const seen = drive(s, [n[1]!.instanceId, n[2]!.instanceId], { mode: "いいえ" })
    const mineSeen = seen.filter((x) => x.candidates.some((c) => nexIds(s, "p2").concat(n.map((y) => y.instanceId)).includes(c)))
    assert(mineSeen.length >= 1 && mineSeen.every((x) => x.pid === "p1"), "ネクサスを選ぶのはバーストの持ち主（p1）")
    assert(sameSet(nexIds(s, "p2"), [n[0]!.instanceId]), "選んだ2つ（先頭以外）が壊れ、先頭が残る")
    assert(nexIds(s, "p1").length === 1, "自分のネクサスは壊れない")
}

console.log("=== BS09-009 烈火の勇者皇アーク：スピリット1体とネクサス2つ ===")
{
    const s = game("bs09-009")
    const ark = spirit(s, "p1", "BS09-009", 1)
    const sp = spirit(s, "p2", VANILLA)
    const n = NX.map((c) => nexus(s, "p2", c))
    nexus(s, "p1", NX[0]!)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: ark.instanceId }) === null, "アークでアタック")
    const seen = drive(s, [sp.instanceId, n[1]!.instanceId, n[2]!.instanceId])
    const nx = seen.filter((x) => x.candidates.includes(n[0]!.instanceId))
    assert(nx.length >= 1 && nx.every((x) => x.pid === "p1"), "ネクサスを選ぶのは使用者（p1）")
    assert(sameSet(nexIds(s, "p2"), [n[0]!.instanceId]), "相手のネクサス2つ（先頭以外を選択）が壊れる")
    assert(nexIds(s, "p1").length === 1, "自分のネクサスは壊れない")
    assert(!spIds(s, "p2").includes(sp.instanceId), "BP3000以下の相手スピリットが壊れる")
}

console.log("=== BS10-062 フェニック・キャノン：スピリット1体とネクサス1つ ===")
{
    const s = game("bs10-062")
    s.players.p1.hand = ["BS10-062"]
    const sp = spirit(s, "p2", VANILLA)
    const n0 = nexus(s, "p2", NX[0]!), n1 = nexus(s, "p2", NX[1]!)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ブレイヴを召喚")
    const seen = drive(s, [sp.instanceId, n1.instanceId], { mode: "ネクサス" })
    const nx = seen.find((x) => x.candidates.includes(n0.instanceId))
    assert(nx !== undefined && nx.pid === "p1", "相手のネクサスが2つなら、使用者に選択待ちが立つ")
    assert(sameSet(nexIds(s, "p2"), [n0.instanceId]), "選んだ2つ目が壊れる")
}

console.log("=== BS05-054 鉄槌のオズワルド：自分か相手のネクサス1つ ===")
function oswald(seed: string, cores: number, pickMine: boolean, oppNexus = 2, myNexus = 1) {
    const s = game(seed)
    const o = spirit(s, "p1", "BS05-054", cores)
    const opn = Array.from({ length: oppNexus }, (_, i) => nexus(s, "p2", NX[i]!))
    const mine = Array.from({ length: myNexus }, () => nexus(s, "p1", NX[2]!))
    s.players.p2.hand = ["BS01-001", "BS01-002"]
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: o.instanceId })
    const target = pickMine ? mine[0] : opn[opn.length - 1]
    const seen = drive(s, target ? [target.instanceId] : [], { cardIndex: 1 })
    return { s, seen, opn, mine, target }
}
{
    const r = oswald("os-lv1-mine", 1, true)
    const nx = r.seen.find((x) => x.candidates.includes(r.mine[0]!.instanceId))
    assert(nx !== undefined && nx.pid === "p1", "Lv1: 選ぶのは使用者")
    assert(nx !== undefined && sameSet(nx.candidates, [...nexIds(r.s, "p1"), ...r.opn.map((x) => x.instanceId), r.mine[0]!.instanceId]), "候補に自分のネクサスも入る")
    assert(nexIds(r.s, "p1").length === 0, "自分のネクサスを選ぶと自分のが壊れる")
    assert(nexIds(r.s, "p2").length === 2, "相手のネクサスは壊れない")
    assert(r.s.players.p2.hand.length === 2, "Lv1には手札破棄の効果は無い")
}
{
    const r = oswald("os-lv2-mine", 6, true)
    assert(nexIds(r.s, "p1").length === 0, "Lv2: 自分のネクサスを壊せる")
    const d = r.seen.find((x) => x.kind === "card")
    assert(d !== undefined && d.pid === "p2", "Lv2: 自分のネクサスを壊しても、相手が手札1枚を選んで破棄する（選ぶのは相手）")
    assert(r.s.players.p2.hand.length === 1 && r.s.players.p2.trashCards.length === 1, "相手の手札が1枚減る")
    assert(r.s.players.p2.hand[0] === "BS01-001" && r.s.players.p2.trashCards[0] === "BS01-002", "相手が選んだ1枚（添字1）が破棄される")
}
{
    const r = oswald("os-lv2-opp", 6, false)
    assert(sameSet(nexIds(r.s, "p2"), [r.opn[0]!.instanceId]), "Lv2: 相手のネクサス（選んだ2つ目）が壊れる")
    assert(r.s.players.p2.hand.length === 1, "Lv2: 相手のネクサスを壊しても相手が手札を1枚破棄する")
}
{
    const r = oswald("os-lv2-none", 6, false, 0, 0)
    assert(r.s.players.p2.hand.length === 2 && r.s.pendingChoice === null, "Lv2: 壊すネクサスが無ければ手札は破棄されない")
}

console.log("=== BS02-088 クロスファイア：お互いが自分のネクサスを選ぶ ===")
{
    const s = game("bs02-088")
    s.players.p1.hand = ["BS02-088"]
    const a = [nexus(s, "p1", NX[0]!), nexus(s, "p1", NX[1]!)]
    const b = [nexus(s, "p2", NX[0]!), nexus(s, "p2", NX[1]!)]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使用")
    const seen = drive(s, [a[1]!.instanceId, b[1]!.instanceId])
    const mine = seen.find((x) => x.candidates.includes(a[0]!.instanceId))
    const theirs = seen.find((x) => x.candidates.includes(b[0]!.instanceId))
    assert(mine !== undefined && mine.pid === "p1" && sameSet(mine.candidates, a.map((x) => x.instanceId)), "p1は自分のネクサスだけを候補に選ぶ")
    assert(theirs !== undefined && theirs.pid === "p2" && sameSet(theirs.candidates, b.map((x) => x.instanceId)), "p2（持ち主）が自分のネクサスだけを候補に選ぶ")
    assert(sameSet(nexIds(s, "p1"), [a[0]!.instanceId]) && sameSet(nexIds(s, "p2"), [b[0]!.instanceId]), "それぞれ選んだ1つが壊れる")
}
{
    const s = game("bs02-088b")
    s.players.p1.hand = ["BS02-088"]
    nexus(s, "p1", NX[0]!)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) !== null, "相手にネクサスが無ければ使用できない")
    const t = game("bs02-088c")
    t.players.p1.hand = ["BS02-088"]
    nexus(t, "p2", NX[0]!)
    assert(act(t, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) !== null, "自分にネクサスが無ければ使用できない")
}

console.log("=== BS18-062 最も高き山頂 Lv2：BP比べで相手のスピリットだけ破壊したとき、相手のネクサス1つ ===")
function summit(seed: string, nexCores: number, myCores: number) {
    const s = game(seed)
    const hill = nexus(s, "p1", "BS18-062", nexCores)
    const mine = nexus(s, "p1", NX[2]!)
    const atk = spirit(s, "p1", VANILLA, myCores)
    const blk = spirit(s, "p2", VANILLA, 1)
    const n0 = nexus(s, "p2", NX[0]!), n1 = nexus(s, "p2", NX[1]!)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: atk.instanceId })
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p2", { type: "block", instanceId: blk.instanceId })
    const seen: Seen[] = []
    for (let i = 0; i < 12 && (s.pendingChoice || (s.isFlashTiming && s.battle)); i++) {
        if (s.pendingChoice) seen.push(...drive(s, [n1.instanceId]))
        else act(s, s.priorityPlayer, { type: "pass" })
    }
    return { s, seen, hill, mine, n0, n1, atk, blk }
}
{
    const r = summit("summit-win", 2, 3)
    assert(!r.s.players.p2.field.spirits.includes(r.blk) && r.s.players.p1.field.spirits.includes(r.atk), "相手のスピリットだけが破壊された")
    const nx = r.seen.find((x) => x.candidates.includes(r.n0.instanceId))
    assert(nx !== undefined && nx.pid === "p1", "Lv2: 相手のネクサスを選ぶのは使用者")
    assert(nx !== undefined && sameSet(nx.candidates, [r.n0.instanceId, r.n1.instanceId]), "候補は相手のネクサスだけ")
    assert(sameSet(nexIds(r.s, "p2"), [r.n0.instanceId]) && nexIds(r.s, "p1").length === 2, "選んだ相手のネクサスだけが壊れる")
}
{
    const r = summit("summit-tie", 2, 1)
    assert(r.s.players.p2.field.spirits.length === 0 && r.s.players.p1.field.spirits.length === 0, "相打ち（両方破壊）")
    assert(nexIds(r.s, "p2").length === 2, "相手のスピリットだけではないので、ネクサスは壊れない")
}
{
    const r = summit("summit-lv1", 1, 3)
    assert(r.s.players.p2.field.spirits.length === 0, "相手のスピリットだけが破壊された")
    assert(nexIds(r.s, "p2").length === 2, "Lv1では発揮しない")
}

console.log("すべてのチェックに合格しました 🎉（part669）")
