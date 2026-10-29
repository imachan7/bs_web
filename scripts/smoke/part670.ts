// smoke パート670（破壊の統一の回帰：選択者・続きの節・「すべて」の範囲。効果文だけから書いた期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1。Lv1 BP1000／Lv3 BP4000）
const NX = ["BS01-098", "BS01-099", "BS01-100"] // ネクサス（赤）。「ただの的」として使う
const PURPLE_NX = "BS01-102" // 主無き古城（紫）
const GREEN_NX = "BS02-080" // エメラルドに輝く鍾乳洞（緑）
const COST2 = "BS01-005" // アイバーン（赤・コスト2）
const COST4 = "BS05-005" // ワイアーム（赤・コスト4）

console.log("=== 前提: カードの機械確認 ===")
{
    const names: Record<string, string> = {
        "BS02-075": "天使長プリンシパール", "BS02-099": "ライフチェイン", "BS07-084": "アームズインパクト", "BS02-050": "コリスタル",
        "BS13-004": "フォボス・ドラグーン", "BS14-085": "賛美するパイプオルガン", "BS11-073": "バスターハンマー", "BS03-119": "バスターランス",
        "BS06-091": "バスタージャベリン", "BS01-120": "バスターファランクス", "BS01-005": "アイバーン", "BS05-005": "ワイアーム",
        "BS10-008": "火星神龍アレス・ドラグーン", "BS02-102": "ホワイトポーション", "BS01-102": "主無き古城", "BS02-080": "エメラルドに輝く鍾乳洞",
        [VANILLA]: "ロクケラトプス", "BS01-098": "燃えさかる戦場", "BS01-099": "百識の谷", "BS01-100": "ルビーの太陽",
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

const handN = (s: GameState, pid: PlayerId) => s.players[pid].hand.length
const gone = (s: GameState, pid: PlayerId, id: string) => !spIds(s, pid).includes(id)

console.log("=== BS02-075 天使長プリンシパール：コスト4以下の自分のスピリットを自分が選んで破壊／コアは破壊したスピリットのコスト ===")
function principal(seed: string, pickCost4: boolean) {
    const s = game(seed)
    const c2 = spirit(s, "p1", COST2), c4 = spirit(s, "p1", COST4)
    const theirs = spirit(s, "p2", COST2)
    s.players.p1.hand = ["BS02-075"]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "プリンシパールを召喚")
    const seen = drive(s, [(pickCost4 ? c4 : c2).instanceId])
    return { s, seen, c2, c4, theirs }
}
{
    const a = principal("pr-4", true), b = principal("pr-2", false)
    const pc = a.seen.find((x) => x.candidates.includes(a.c2.instanceId))
    assert(pc !== undefined && pc.pid === "p1", "候補が2体なので、召喚した本人に選択待ちが立つ")
    assert(pc !== undefined && sameSet(pc.candidates, [a.c2.instanceId, a.c4.instanceId]), "候補は自分のコスト4以下のスピリット2体だけ（相手のスピリットや自身は入らない）")
    assert(gone(a.s, "p1", a.c4.instanceId) && !gone(a.s, "p1", a.c2.instanceId), "選んだコスト4が壊れ、コスト2は残る")
    assert(gone(b.s, "p1", b.c2.instanceId) && !gone(b.s, "p1", b.c4.instanceId), "選んだコスト2が壊れ、コスト4は残る")
    assert(a.s.players.p1.reserve - b.s.players.p1.reserve === 2, "リザーブに置かれるコアは、破壊したスピリットのコストぶん（4と2で差が2）")
    assert(!gone(a.s, "p2", a.theirs.instanceId), "相手のスピリットは壊れない")
}

console.log("=== BS02-099 ライフチェイン：自分のスピリット1体を自分が選んで破壊／コスト1につきコア1個 ===")
function lifeChain(seed: string, pickCost4: boolean) {
    const s = game(seed)
    const c2 = spirit(s, "p1", COST2), c4 = spirit(s, "p1", COST4)
    const theirs = spirit(s, "p2", COST2)
    s.players.p1.hand = ["BS02-099"]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "ライフチェインを使用")
    const seen = drive(s, [(pickCost4 ? c4 : c2).instanceId])
    return { s, seen, c2, c4, theirs }
}
{
    const a = lifeChain("lc-4", true), b = lifeChain("lc-2", false)
    const pc = a.seen.find((x) => x.candidates.includes(a.c2.instanceId))
    assert(pc !== undefined && pc.pid === "p1" && sameSet(pc.candidates, [a.c2.instanceId, a.c4.instanceId]), "自分のスピリット2体が候補で、使用者が選ぶ")
    assert(gone(a.s, "p1", a.c4.instanceId) && !gone(a.s, "p1", a.c2.instanceId), "選んだコスト4が壊れる")
    assert(a.s.players.p1.reserve - b.s.players.p1.reserve === 2, "置かれるコアは選んだスピリットのコスト（4と2で差が2）")
    assert(!gone(a.s, "p2", a.theirs.instanceId), "相手のスピリットは壊れない")
}

console.log("=== BS07-084 アームズインパクト：自分のコスト4以下1体を破壊し、そのコストと同じ合計コストまで相手のスピリットを破壊 ===")
function armsImpact(seed: string, pickCost4: boolean) {
    const s = game(seed)
    s.turnPlayer = "p2"; s.priorityPlayer = "p2"; s.phase = "main"
    const blocker = spirit(s, "p1", VANILLA)
    const c2 = spirit(s, "p1", COST2), c4 = spirit(s, "p1", COST4)
    const atk = spirit(s, "p2", VANILLA)
    const extra = [spirit(s, "p2", VANILLA), spirit(s, "p2", VANILLA)]
    s.players.p1.hand = ["BS07-084"]
    act(s, "p2", { type: "nextPhase" })
    act(s, "p2", { type: "attack", instanceId: atk.instanceId })
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p1", { type: "block", instanceId: blocker.instanceId })
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    const seen = drive(s, [(pickCost4 ? c4 : c2).instanceId, ...extra.map((x) => x.instanceId), atk.instanceId])
    return { s, seen, err, blocker, c2, c4, atk, extra }
}
{
    const a = armsImpact("ai-4", true), b = armsImpact("ai-2", false)
    assert(a.err === null, "自分のスピリットが相手のスピリットをブロックしているとき使用できる")
    const pc = a.seen.find((x) => x.candidates.includes(a.c2.instanceId))
    assert(pc !== undefined && pc.pid === "p1", "自分のスピリットを選ぶのは使用者")
    assert(gone(a.s, "p1", a.c4.instanceId) && !gone(a.s, "p1", a.c2.instanceId), "選んだコスト4が壊れる")
    assert(gone(b.s, "p1", b.c2.instanceId) && !gone(b.s, "p1", b.c4.instanceId), "選んだコスト2が壊れる")
    const killedB = [b.atk, ...b.extra].filter((x) => gone(b.s, "p2", x.instanceId)).length
    assert(killedB <= 2, "コスト2を壊したなら、相手のコスト1スピリットは合計コスト2＝2体までしか壊せない")
    const killedA = [a.atk, ...a.extra].filter((x) => gone(a.s, "p2", x.instanceId)).length
    assert(killedA <= 3 && killedA >= killedB, "コスト4を壊したときの予算は4（相手のコスト1スピリット3体を壊せる）")
}
{
    const s = game("ai-noblock")
    s.turnPlayer = "p2"; s.priorityPlayer = "p2"; s.phase = "main"
    spirit(s, "p1", COST2)
    const atk = spirit(s, "p2", VANILLA)
    s.players.p1.hand = ["BS07-084"]
    act(s, "p2", { type: "nextPhase" })
    act(s, "p2", { type: "attack", instanceId: atk.instanceId })
    // 条件を満たさず不発になるマジックは使用できない（2026-10-29 ユーザー指摘）
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "ブロックしていないときは使用できない")
}

console.log("=== BS02-050 コリスタル：バトル時、バトル終了時に自身が破壊される ===")
function crystal(seed: string, block: boolean) {
    const s = game(seed)
    const me = spirit(s, "p1", "BS02-050", 1)
    const blk = spirit(s, "p2", VANILLA)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: me.instanceId })
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    if (block) {
        act(s, "p2", { type: "block", instanceId: blk.instanceId })
        for (let i = 0; i < 6 && (s.pendingChoice || (s.isFlashTiming && s.battle)); i++) {
            if (s.pendingChoice) drive(s, [])
            else act(s, s.priorityPlayer, { type: "pass" })
        }
    } else {
        act(s, "p2", { type: "takeLife" })
        drive(s, [])
    }
    return { s, me, blk }
}
{
    const r = crystal("co-block", true)
    assert(gone(r.s, "p2", r.blk.instanceId), "BP3000が相手のBP1000に勝って相手が破壊される")
    assert(gone(r.s, "p1", r.me.instanceId), "バトルに勝っても、バトル終了時にコリスタル自身が破壊される")
    const q = crystal("co-noblock", false)
    // 『バトル時』＝アタック時とブロック時。ブロックされずライフへアタックしてもバトル時に当たる
    assert(gone(q.s, "p1", q.me.instanceId), "ブロックされなくてもアタックしたので、バトル終了時に破壊される")
}

console.log("=== BS13-004 フォボス・ドラグーン Lv3：バトル終了時、自身とコスト3以上の自分のスピリット1体を破壊することで、神星を召喚 ===")
function phobos(seed: string, withGod: boolean, withCost3: boolean) {
    const s = game(seed)
    const ph = spirit(s, "p1", "BS13-004", 4)
    const keep2 = spirit(s, "p1", COST2)
    const c3 = withCost3 ? [spirit(s, "p1", "BS01-008"), spirit(s, "p1", COST4)] : []
    const blk = spirit(s, "p2", VANILLA)
    s.players.p1.hand = withGod ? ["BS10-008"] : []
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: ph.instanceId })
    while (s.isFlashTiming && s.battle) act(s, s.priorityPlayer, { type: "pass" })
    act(s, "p2", { type: "block", instanceId: blk.instanceId })
    const seen: Seen[] = []
    for (let i = 0; i < 10 && (s.pendingChoice || (s.isFlashTiming && s.battle)); i++) {
        if (s.pendingChoice) seen.push(...drive(s, [c3[1]?.instanceId ?? ""]))
        else act(s, s.priorityPlayer, { type: "pass" })
    }
    return { s, seen, ph, keep2, c3, blk }
}
{
    const r = phobos("ph-ok", true, true)
    const pc = r.seen.find((x) => x.candidates.includes(r.c3[0]!.instanceId))
    assert(pc !== undefined && pc.pid === "p1" && sameSet(pc.candidates, [r.c3[0]!.instanceId, r.c3[1]!.instanceId]), "コスト3以上の自分のスピリット（自身を除く2体）から、自分が選ぶ")
    assert(gone(r.s, "p1", r.ph.instanceId) && gone(r.s, "p1", r.c3[1]!.instanceId), "自身と選んだコスト3以上のスピリットが破壊される")
    assert(!gone(r.s, "p1", r.c3[0]!.instanceId) && !gone(r.s, "p1", r.keep2.instanceId), "選ばなかったコスト3と、コスト2のスピリットは残る")
    assert(r.s.players.p1.field.spirits.some((x) => x.cardId === "BS10-008") && handN(r.s, "p1") === 0, "手札の神星スピリットが召喚される")
    const n = phobos("ph-nogod", false, true)
    assert(!gone(n.s, "p1", n.ph.instanceId) && n.c3.every((x) => !gone(n.s, "p1", x.instanceId)), "召喚できる神星が手札に無ければ、コストの破壊は行われない")
    const m = phobos("ph-no3", true, false)
    assert(!gone(m.s, "p1", m.ph.instanceId) && handN(m.s, "p1") === 1, "コスト3以上の他のスピリットがいなければ、破壊も召喚もされない")
}

console.log("=== BS14-085 賛美するパイプオルガン Lv2：相手のターンに効果で回復した赤/緑/白/青のスピリットすべてを破壊 ===")
function organ(seed: string, cores: number, target: string) {
    const s = game(seed)
    s.turnPlayer = "p2"; s.priorityPlayer = "p2"; s.phase = "main"
    nexus(s, "p1", "BS14-085", cores)
    const t = spirit(s, "p2", target)
    t.isRested = true
    const other = spirit(s, "p2", "BS01-001")
    s.players.p2.hand = ["BS02-102"]
    s.players.p2.reserve = 10
    const err = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: t.instanceId })
    drive(s, [t.instanceId])
    return { s, t, other, err }
}
{
    const a = organ("po-red", 2, VANILLA)
    assert(a.err === null, "相手がホワイトポーションを使用")
    assert(gone(a.s, "p2", a.t.instanceId), "Lv2: 効果で回復した赤のスピリットが破壊される")
    const b = organ("po-yellow", 2, "BS02-050")
    assert(!gone(b.s, "p2", b.t.instanceId), "Lv2: 回復したのが黄のスピリットなら破壊されない")
    const c = organ("po-lv1", 1, VANILLA)
    assert(!gone(c.s, "p2", c.t.instanceId), "Lv1では破壊されない")
}

console.log("=== BS11-073 バスターハンマー：指定した色のネクサスすべて／破壊した数だけドロー ===")
function hammer(seed: string, color: string) {
    const s = game(seed)
    s.players.p1.hand = ["BS11-073"]
    const mineR = nexus(s, "p1", NX[0]!), mineG = nexus(s, "p1", GREEN_NX)
    const oppR = [nexus(s, "p2", NX[1]!), nexus(s, "p2", NX[2]!)], oppP = nexus(s, "p2", PURPLE_NX)
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    const seen = drive(s, [], { mode: color })
    return { s, seen, err, mineR, mineG, oppR, oppP }
}
{
    const r = hammer("bh-red", "赤")
    assert(r.err === null, "バスターハンマーを使用")
    assert(sameSet(nexIds(r.s, "p1"), [r.mineG.instanceId]), "自分の赤ネクサスは壊れ、緑は残る")
    assert(sameSet(nexIds(r.s, "p2"), [r.oppP.instanceId]), "相手の赤ネクサス2つは壊れ、紫は残る")
    assert(handN(r.s, "p1") === 3, "壊したネクサス3つ（自分1＋相手2）につき1枚、3枚ドローする")
    const g = hammer("bh-green", "緑")
    assert(nexIds(g.s, "p1").length === 1 && nexIds(g.s, "p2").length === 3 && handN(g.s, "p1") === 1, "緑を指定すると緑の1つだけ壊れて1枚ドロー")
    const y = hammer("bh-yellow", "黄")
    assert(nexIds(y.s, "p1").length === 2 && nexIds(y.s, "p2").length === 3 && handN(y.s, "p1") === 0, "該当が無ければ何も壊れずドローも0")
}

console.log("=== BS03-119 バスターランス：Lv1のネクサスすべて（お互い） ===")
{
    const s = game("bl")
    s.players.p1.hand = ["BS03-119"]
    const l1 = nexus(s, "p1", NX[0]!, 1), l2 = nexus(s, "p1", NX[1]!, 3)
    const o1 = nexus(s, "p2", NX[0]!, 1), o2 = nexus(s, "p2", NX[2]!, 2)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使用")
    drive(s, [])
    assert(sameSet(nexIds(s, "p1"), [l2.instanceId]) && sameSet(nexIds(s, "p2"), [o2.instanceId]), "お互いのLv1だけが壊れ、Lv2は残る")
    assert(!nexIds(s, "p1").includes(l1.instanceId) && !nexIds(s, "p2").includes(o1.instanceId), "Lv1の2つは場にない")
}

console.log("=== BS06-091 バスタージャベリン：ネクサス1つ。相手のネクサスを破壊したときだけドロー ===")
function javelin(seed: string, pickOpp: boolean, oppHas = true) {
    const s = game(seed)
    s.players.p1.hand = ["BS06-091"]
    const mine = nexus(s, "p1", NX[0]!)
    const opp = oppHas ? [nexus(s, "p2", NX[1]!)] : []
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    const seen = drive(s, [(pickOpp ? opp[0] : mine)?.instanceId ?? ""])
    return { s, seen, err, mine, opp }
}
{
    const a = javelin("jv-opp", true)
    assert(a.err === null, "メインで使用")
    const pc = a.seen.find((x) => x.candidates.includes(a.mine.instanceId))
    assert(pc !== undefined && pc.pid === "p1" && sameSet(pc.candidates, [a.mine.instanceId, a.opp[0]!.instanceId]), "自分のネクサスも相手のネクサスも候補で、使用者が選ぶ")
    assert(nexIds(a.s, "p2").length === 0 && nexIds(a.s, "p1").length === 1 && handN(a.s, "p1") === 1, "相手のネクサスを選ぶと壊れて1枚ドロー")
    const b = javelin("jv-mine", false)
    assert(nexIds(b.s, "p1").length === 0 && nexIds(b.s, "p2").length === 1, "自分のネクサスを選ぶと自分のが壊れる")
    assert(handN(b.s, "p1") === 0, "自分のネクサスを壊したときはドローしない")
    const c = javelin("jv-onlymine", false, false)
    assert(nexIds(c.s, "p1").length === 0 && handN(c.s, "p1") === 0, "相手にネクサスがなければ自分のが壊れ、ドローしない")
}

console.log("=== BS01-120 バスターファランクス：ネクサスすべて（お互い） ===")
{
    const s = game("bf")
    s.players.p1.hand = ["BS01-120"]
    nexus(s, "p1", NX[0]!, 1); nexus(s, "p1", NX[1]!, 3)
    nexus(s, "p2", NX[2]!, 2); nexus(s, "p2", PURPLE_NX)
    const sp = spirit(s, "p2", VANILLA)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使用")
    drive(s, [])
    assert(nexIds(s, "p1").length === 0 && nexIds(s, "p2").length === 0, "お互いのネクサスがすべて壊れる")
    assert(!gone(s, "p2", sp.instanceId), "スピリットは壊れない")
}

console.log("すべてのチェックに合格しました 🎉（part670）")
