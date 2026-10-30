// smoke パート700（「BP／コストの合計が○○まで、相手のスピリットを好きなだけ破壊する」型の効果文どおりの場面。予算つき破壊の型統一の前の固定）
import { act, takeLifeAndResolve, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000/Lv2 3000）
const AIB = "BS01-005" // アイバーン（赤・コスト2・Lv1 BP2000）
const MET = "BS01-008" // メタルバーン（赤・コスト3・Lv1 BP3000）
const HAR = "BS01-031" // デス・ハーデス（紫・コスト3・Lv1 BP4000）
const HER = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・Lv1 BP4000）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, n] of [[VAN, "ロクケラトプス"], [AIB, "アイバーン"], [MET, "メタルバーン"], [HAR, "デス・ハーデス"], [HER, "ヘラクレス・ジオ"],
    ["BS05-X19", "聖皇ジークフリーデン"], ["BS07-009", "剣龍皇エクス・キャリバス"], ["BS07-084", "アームズインパクト"], ["BS08-052", "海帝竜騎ヴァン・ソロミュー"],
    ["BS08-056", "太陽石の神殿"], ["BS09-X35", "超神星龍ジークヴルム・ノヴァ"], ["BS10-061", "剣鎧竜バスター・ドラゴン"], ["BS13-008", "恐竜王メガロ・ザウル"],
    ["X014", "超星覇龍ヤマトヴルム・ノヴァ"], ["BS16-083", "クラッシュ・ザ・バビロン"], ["BS17-055", "ヤサカニ・ウィング"], ["BS18-074", "救世神撃覇"]] as const)
    assert(getCard(id).name === n, `${id}は${n}`)

function game(seed: string, turnPlayer: PlayerId, interactive: boolean, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = interactive
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 3
        p.burst = null
        p.hand = [...(pid === "p1" ? p1Hand : p2Hand)]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// picks に挙げた instanceId を先頭から1体ずつ選び、尽きたら「選ばない／確定」で終える。選択待ちごとの候補を seen に残す
function settle(s: GameState, pid: PlayerId, picks: string[] = [], seen: string[][] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const who = pc.pid ?? pid
        let err: string | null
        if (pc.kind === "option") {
            const o: string[] = pc.options ?? []
            err = act(s, who, { type: "resolveChoice", option: o.includes("発動する") ? "発動する" : o[0] ?? "" })
        } else if (pc.kind === "target") {
            seen.push([...pc.candidates])
            const k = picks.findIndex(x => pc.candidates.includes(x))
            const next = k >= 0 ? picks.splice(k, 1)[0] : undefined
            err = act(s, who, next ? { type: "resolveChoice", instanceId: next } : { type: "resolveChoice" })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

const alive = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some(x => x.instanceId === id)

function summon(s: GameState, pid: PlayerId, picks: string[] = [], seen: string[][] = []): void {
    const err = act(s, pid, { type: "summon", handIndex: 0 })
    assert(err === null, `召喚できる（${err}）`)
    answerPayConfirm(s, pid)
    settle(s, pid, picks, seen)
}

// 予算 b の自動破壊：壊れた合計が b 以下で、残った相手のどれを足しても b を超える
function checkBudget(s: GameState, label: string, foes: { inst: ReturnType<typeof put>; v: number }[], b: number): void {
    const sum = foes.filter(f => !alive(s, "p2", f.inst.instanceId)).reduce((a, f) => a + f.v, 0)
    assert(sum <= b, `${label}: 破壊した合計${sum}が予算${b}以下`)
    for (const f of foes.filter(f => alive(s, "p2", f.inst.instanceId)))
        assert(sum + f.v > b, `${label}: 残った${f.v}を足すと予算${b}を超える（合計${sum}）`)
}


type Foe = { inst: ReturnType<typeof put>; bp: number; cost: number }
function foes(s: GameState, ids: [string, number, number][] = [[HAR, 4000, 3], [AIB, 2000, 2], [VAN, 1000, 1], [MET, 3000, 3]]): Foe[] {
    return ids.map(([id, bp, cost]) => ({ inst: put(s, "p2", id, 1), bp, cost }))
}
const dead = (s: GameState, f: Foe) => !alive(s, "p2", f.inst.instanceId)
const deadSet = (s: GameState, fs: Foe[]) => fs.filter(f => dead(s, f)).map(f => f.inst.cardId + ":" + f.bp).sort().join(",")

function attackWith(s: GameState, pid: PlayerId, inst: { instanceId: string }, picks: string[] = [], seen: string[][] = []): void {
    s.phase = "attack"
    const err = act(s, pid, { type: "attack", instanceId: inst.instanceId })
    assert(err === null, `アタックできる（${err}）`)
    settle(s, pid, picks, seen)
}

console.log("=== A. BS07-009 エクス・キャリバス（召喚時：BP合計6000まで）===")
{
    const s = game("a-auto", "p1", false, ["BS07-009"])
    const own = put(s, "p1", MET, 3)
    const fs = foes(s)
    summon(s, "p1", [own.instanceId])
    assert(!alive(s, "p1", own.instanceId), "A: 転召の元は場を離れる")
    checkBudget(s, "A自動", fs.map(f => ({ inst: f.inst, v: f.bp })), 6000)
    assert(fs.some(dead.bind(null, s)), "A自動: 1体以上は破壊される")
}
{
    const s = game("a-int", "p1", true, ["BS07-009"])
    const own = put(s, "p1", MET, 3)
    const bystander = put(s, "p1", VAN, 1)
    const fs = foes(s)
    const seen: string[][] = []
    summon(s, "p1", [own.instanceId, fs[0]!.inst.instanceId, fs[1]!.inst.instanceId], seen)
    assert(seen.length >= 1 && seen[0]!.length === 4 && !seen[0]!.includes(bystander.instanceId), "A対話: 最初の候補は相手の4体だけ（自分のスピリットは選べない）")
    assert(seen.length >= 2 && !seen[1]!.includes(fs[3]!.inst.instanceId), "A対話: 4000を選んだ後、BP3000は予算を超えるので選べない")
    assert(seen.length >= 2 && seen[1]!.includes(fs[1]!.inst.instanceId) && seen[1]!.includes(fs[2]!.inst.instanceId), "A対話: 4000の後、2000と1000は選べる")
    assert(deadSet(s, fs) === `${AIB}:2000,${HAR}:4000`, `A対話: 選んだ4000と2000が破壊される（${deadSet(s, fs)}）`)
    assert(alive(s, "p1", bystander.instanceId), "A対話: 自分のスピリットは無事")
}
{
    const s = game("a-zero", "p1", true, ["BS07-009"])
    const own = put(s, "p1", MET, 3)
    const fs = foes(s)
    summon(s, "p1", [own.instanceId])
    assert(deadSet(s, fs) === "", "A対話: 0体で確定すると何も破壊されない")
}

console.log("=== B. BS05-X19 ジークフリーデン（召喚時：コスト合計5まで）===")
{
    const s = game("b-auto", "p1", false, ["BS05-X19"])
    const own = put(s, "p1", "BS13-008", 3)
    const fs = foes(s)
    summon(s, "p1", [own.instanceId])
    checkBudget(s, "B自動", fs.map(f => ({ inst: f.inst, v: f.cost })), 5)
    assert(fs.some(dead.bind(null, s)), "B自動: 1体以上は破壊される")
}
{
    const s = game("b-int", "p1", true, ["BS05-X19"])
    const own = put(s, "p1", "BS13-008", 3)
    const fs = foes(s, [[HAR, 4000, 3], [AIB, 2000, 2], [VAN, 1000, 1], [MET, 3000, 3]])
    const seen: string[][] = []
    summon(s, "p1", [own.instanceId, fs[0]!.inst.instanceId, fs[1]!.inst.instanceId], seen)
    assert(seen.length >= 2 && !seen[1]!.includes(fs[3]!.inst.instanceId), "B対話: コスト3を選んだ後、コスト3は予算5を超えるので選べない")
    assert(deadSet(s, fs) === `${AIB}:2000,${HAR}:4000`, `B対話: コスト3+2が破壊される（${deadSet(s, fs)}）`)
}

console.log("=== C. BS09-X35 ジークヴルム・ノヴァ（Lv2アタック時：BP合計10000まで）===")
{
    const s = game("c-auto", "p1", false)
    const me = put(s, "p1", "BS09-X35", 3)
    const fs = foes(s, [[HAR, 4000, 3], [HER, 4000, 3], [MET, 3000, 3], [AIB, 2000, 2], [VAN, 1000, 1]])
    attackWith(s, "p1", me)
    checkBudget(s, "C自動", fs.map(f => ({ inst: f.inst, v: f.bp })), 10000)
    assert(fs.some(dead.bind(null, s)), "C自動: 1体以上は破壊される")
}
{
    const s = game("c-int", "p1", true)
    const me = put(s, "p1", "BS09-X35", 3)
    const fs = foes(s, [[HAR, 4000, 3], [HER, 4000, 3], [MET, 3000, 3], [AIB, 2000, 2], [VAN, 1000, 1]])
    const seen: string[][] = []
    attackWith(s, "p1", me, [fs[0]!.inst.instanceId, fs[1]!.inst.instanceId, fs[3]!.inst.instanceId], seen)
    assert(seen.length >= 3 && !seen[2]!.includes(fs[2]!.inst.instanceId), "C対話: 4000+4000の後、3000は選べない（残り予算2000）")
    assert(seen.length >= 3 && seen[2]!.includes(fs[3]!.inst.instanceId) && seen[2]!.includes(fs[4]!.inst.instanceId), "C対話: 4000+4000の後、2000と1000は選べる")
    assert(deadSet(s, fs).includes(`${HAR}:4000`) && deadSet(s, fs).includes(`${HER}:4000`) && deadSet(s, fs).includes(`${AIB}:2000`), `C対話: 選んだ3体が破壊される（${deadSet(s, fs)}）`)
}


const FIVE: [string, number, number][] = [[HAR, 4000, 3], [HER, 4000, 3], [MET, 3000, 3], [AIB, 2000, 2], [VAN, 1000, 1]]

console.log("=== D. BS13-008 メガロ・ザウル（召喚時：BP合計(系統「竜人」を持つ自分のスピリットのBP合計)まで）===")
{
    const s = game("d-auto", "p1", false, ["BS13-008"])
    const ryu = put(s, "p1", "BS16-004", 1) // アシガリュー（竜人・Lv1 BP3000・効果なし）
    const other = put(s, "p1", MET, 1) // 竜人ではない自分のスピリットはBP合計に入らない
    const fs = foes(s, FIVE)
    summon(s, "p1")
    const mega = s.players.p1.field.spirits.find(x => x.cardId === "BS13-008")!
    const budget = effectiveBp(s as any, "p1", mega) + effectiveBp(s as any, "p1", ryu)
    assert(effectiveBp(s as any, "p1", ryu) === 3000 && effectiveBp(s as any, "p1", other) === 3000, "D: アシガリューもメタルバーンもBP3000")
    checkBudget(s, "D自動", fs.map(f => ({ inst: f.inst, v: f.bp })), budget)
    assert(fs.some(dead.bind(null, s)), "D自動: 1体以上は破壊される")
}
{
    const s = game("d-nobody", "p1", false, ["BS13-008"])
    const fs = foes(s, FIVE)
    summon(s, "p1")
    const mega = s.players.p1.field.spirits.find(x => x.cardId === "BS13-008")!
    checkBudget(s, "D自分だけ", fs.map(f => ({ inst: f.inst, v: f.bp })), effectiveBp(s as any, "p1", mega))
}

console.log("=== E. X014 ヤマトヴルム・ノヴァ（Lv3アタック時：バーストを破棄することで BP合計10000まで）===")
{
    const s = game("e-auto", "p1", false)
    const me = put(s, "p1", "X014", 5)
    s.players.p1.burst = "BS01-122"
    const fs = foes(s, FIVE)
    attackWith(s, "p1", me)
    checkBudget(s, "E自動", fs.map(f => ({ inst: f.inst, v: f.bp })), 10000)
    assert(fs.some(dead.bind(null, s)), "E自動: 1体以上は破壊される")
    assert(s.players.p1.burst === null, "E自動: バーストが破棄される")
}
{
    const s = game("e-noburst", "p1", false)
    const me = put(s, "p1", "X014", 5)
    const fs = foes(s, FIVE)
    attackWith(s, "p1", me)
    assert(deadSet(s, fs) === "", "E: バーストが無ければ破棄できず、何も破壊されない")
}

console.log("=== F. BS10-061 バスター・ドラゴン（合体アタック時：BP合計3000まで）===")
{
    const s = game("f-auto", "p1", false, ["BS10-061"])
    const host = put(s, "p1", VAN, 1)
    const fs = foes(s)
    const err = act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    assert(err === null, `F: バスター・ドラゴンを合体召喚（${err}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    assert(s.players.p1.field.combinedBraves.length >= 1 || s.players.p1.field.spirits.some(x => x.cardId === "BS10-061"), "F: ブレイヴが場にある")
    attackWith(s, "p1", host)
    checkBudget(s, "F自動", fs.map(f => ({ inst: f.inst, v: f.bp })), 3000)
    assert(fs.some(dead.bind(null, s)), "F自動: 1体以上は破壊される")
}

console.log("=== G. BS17-055 ヤサカニ・ウィング（召喚時：BP合計4000まで／ジーク・スサノ・フリードがいれば7000まで）===")
for (const [susano, budget] of [[false, 4000], [true, 7000]] as const) {
    const s = game(`g-${susano}`, "p1", false, ["BS17-055"])
    if (susano) put(s, "p1", "BS17-X01", 1)
    const fs = foes(s, FIVE)
    summon(s, "p1")
    checkBudget(s, `G自動(${budget})`, fs.map(f => ({ inst: f.inst, v: f.bp })), budget)
    assert(fs.some(dead.bind(null, s)), `G自動(${budget}): 1体以上は破壊される`)
}


// 相手のブロック宣言のあと、バトルが片付くまで優先権をパスし続ける（選択待ちは settle で答える）
function blockAndFinish(s: GameState, blocker: { instanceId: string } | null, picks: string[] = [], seen: string[][] = []): void {
    if (blocker) assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックを宣言できる")
    for (let i = 0; i < 12; i++) {
        if (s.pendingChoice) settle(s, "p1", picks, seen)
        else if (act(s, s.priorityPlayer, { type: "pass" } as any) !== null) break
    }
}

console.log("=== I. BS08-056 太陽石の神殿（【激突】のスピリットが最初のアタックで相手のスピリットだけを破壊 → BP合計(破壊したスピリットのBP)まで）===")
function arena(seed: string, interactive: boolean) {
    const s = game(seed, "p1", interactive)
    s.players.p1.field.nexuses.push(createInstance("BS08-056", 2, 0))
    const me = put(s, "p1", "BS07-009", 3) // Lv2 BP8000【激突】
    const har = { inst: put(s, "p2", HAR, 1), bp: 4000, cost: 3 }
    const rest = foes(s, [[AIB, 2000, 2], [VAN, 1000, 1], [MET, 3000, 3]])
    for (const f of rest) f.inst.isRested = true // ブロックできるのはデス・ハーデスだけ
    return { s, me, har, rest }
}
{
    const { s, me, har, rest } = arena("i-auto", false)
    attackWith(s, "p1", me)
    blockAndFinish(s, har.inst)
    assert(dead(s, har), "I自動: ブロックしたBP4000のスピリットはBP比べで破壊される")
    checkBudget(s, "I自動", rest.map(f => ({ inst: f.inst, v: f.bp })), 4000)
    assert(rest.some(dead.bind(null, s)), "I自動: 1体以上は追加で破壊される")
}
{
    const { s, me, har, rest } = arena("i-int", true)
    const seen: string[][] = []
    attackWith(s, "p1", me, [rest[2]!.inst.instanceId, rest[1]!.inst.instanceId], seen)
    blockAndFinish(s, har.inst, [rest[2]!.inst.instanceId, rest[1]!.inst.instanceId], seen)
    assert(seen.length >= 2 && !seen[1]!.includes(rest[0]!.inst.instanceId) && seen[1]!.includes(rest[1]!.inst.instanceId), "I対話: BP3000を選ぶと、残り予算1000なので2000は選べず1000は選べる")
    assert(deadSet(s, rest) === `${VAN}:1000,${MET}:3000`, `I対話: 選んだ3000と1000が破壊される（${deadSet(s, rest)}）`)
}
{
    const { s, me, har, rest } = arena("i-nofirst", false)
    s.players.p1.field.spirits.push(createInstance(VAN, 2, 1)) // 自分のターンの最初のアタックだけが対象
    const first = s.players.p1.field.spirits[s.players.p1.field.spirits.length - 1]!
    attackWith(s, "p1", first)
    blockAndFinish(s, null)
    void me; void har
    assert(rest.every(f => !dead(s, f)), "I: 激突を持たないスピリットのアタックでは発動しない")
}
{
    const { s, me, har, rest } = arena("i-over", true)
    attackWith(s, "p1", me)
    blockAndFinish(s, har.inst, [rest[2]!.inst.instanceId, rest[0]!.inst.instanceId])
    assert(!dead(s, rest[0]!), "I対話: 3000を選んだ後に2000を選んでも、予算4000を超えるので破壊されない")
}

console.log("=== H. BS08-052 ヴァン・ソロミュー（系統「龍帝」がアタックしたとき：コスト合計4まで）===")
for (const [attackerId, expectKill] of [["BS08-X29", true], [VAN, false]] as const) {
    const s = game(`h-${attackerId}`, "p1", false)
    put(s, "p1", "BS08-052", 1)
    // ダーク・クリムゾンは Lv2･Lv3 に自身のアタック時の破壊効果を持つので、Lv1 でアタックさせる
    const me = put(s, "p1", attackerId, 1)
    const fs = foes(s, FIVE)
    for (const f of fs) f.inst.isRested = true // ブロックされない
    attackWith(s, "p1", me)
    blockAndFinish(s, null)
    if (expectKill) {
        checkBudget(s, "H自動", fs.map(f => ({ inst: f.inst, v: f.cost })), 4)
        assert(fs.some(dead.bind(null, s)), "H自動: 1体以上は破壊される")
    } else assert(deadSet(s, fs) === "", "H: 龍帝でないスピリットのアタックでは発動しない")
}
{
    const s = game("h-int", "p1", true)
    put(s, "p1", "BS08-052", 1)
    const me = put(s, "p1", "BS08-X29", 3)
    const fs = foes(s, FIVE)
    for (const f of fs) f.inst.isRested = true
    const seen: string[][] = []
    attackWith(s, "p1", me, [fs[0]!.inst.instanceId, fs[4]!.inst.instanceId], seen)
    blockAndFinish(s, null, [fs[0]!.inst.instanceId, fs[4]!.inst.instanceId], seen)
    assert(seen.length >= 2 && !seen[1]!.includes(fs[1]!.inst.instanceId) && seen[1]!.includes(fs[4]!.inst.instanceId), "H対話: コスト3を選ぶと、残り1なのでコスト3は選べずコスト1は選べる")
    assert(deadSet(s, fs) === `${VAN}:1000,${HAR}:4000`, `H対話: コスト3とコスト1が破壊される（${deadSet(s, fs)}）`)
}

console.log("=== J. BS07-084 アームズインパクト（ブロック中：自分のコスト4以下1体を破壊し、そのコストと同じ合計コストまで）===")
function jArena(seed: string, interactive: boolean) {
    const s = game(seed, "p2", interactive, ["BS07-084"], [])
    const fs = foes(s, FIVE)
    const blocker = put(s, "p1", MET, 1) // コスト3
    const bystander = put(s, "p1", VAN, 1) // コスト1
    return { s, fs, blocker, bystander, attacker: fs[4]! }
}
function jRun(s: GameState, fs: Foe[], blocker: { instanceId: string }, attacker: Foe, picks: string[], seen: string[][]): void {
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: attacker.inst.instanceId }) === null, "J: 相手がアタックする")
    settle(s, "p2")
    assert(declareBlock(s, "p1", blocker.instanceId) === null, "J: ブロックする")
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" } as any)
    assert(err === null, `J: アームズインパクトを使える（${err}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1", picks, seen)
}
{
    const { s, fs, blocker, bystander, attacker } = jArena("j-auto", false)
    jRun(s, fs, blocker, attacker, [], [])
    const own = alive(s, "p1", blocker.instanceId) ? "bystander" : "blocker"
    assert(own === "blocker" || !alive(s, "p1", bystander.instanceId), "J自動: 自分のスピリット1体が破壊される")
    const destroyedOwnCost = alive(s, "p1", blocker.instanceId) ? 1 : 3
    checkBudget(s, "J自動", fs.map(f => ({ inst: f.inst, v: f.cost })), destroyedOwnCost)
    assert(alive(s, "p1", blocker.instanceId) !== alive(s, "p1", bystander.instanceId), "J自動: 自分のスピリットはちょうど1体だけ破壊される")
}
for (const [pickOwn, budget] of [["blocker", 3], ["bystander", 1]] as const) {
    const { s, fs, blocker, bystander, attacker } = jArena(`j-int-${pickOwn}`, true)
    const seen: string[][] = []
    const ownId = pickOwn === "blocker" ? blocker.instanceId : bystander.instanceId
    jRun(s, fs, blocker, attacker, [ownId, fs[3]!.inst.instanceId, fs[4]!.inst.instanceId, fs[0]!.inst.instanceId], seen)
    assert(!alive(s, "p1", ownId), `J対話(${pickOwn}): 選んだ自分のスピリットが破壊される`)
    assert(alive(s, "p1", pickOwn === "blocker" ? bystander.instanceId : blocker.instanceId), `J対話(${pickOwn}): もう片方の自分のスピリットは無事`)
    const killed = fs.filter(dead.bind(null, s))
    assert(killed.reduce((a, f) => a + f.cost, 0) <= budget, `J対話(${pickOwn}): 破壊した相手のコスト合計が${budget}以下`)
    if (budget === 1) assert(deadSet(s, fs) === `${VAN}:1000` || deadSet(s, fs) === "", `J対話(bystander): コスト1の枠にはコスト1の1体までしか入らない（${deadSet(s, fs)}）`)
    else assert(deadSet(s, fs) === `${VAN}:1000,${AIB}:2000`, `J対話(blocker): 選んだコスト2+1が破壊される（${deadSet(s, fs)}）`)
}

// 破壊された自分のスピリットが2体以上でコストが違えば、発動者が1体を選ぶ（合計ではない。非対話は最大値。BURST.md・BS16 PLAN §2.1 #5）
console.log("=== K. BS16-083 クラッシュ・ザ・バビロン（バースト：相手による自分のスピリット破壊後 → 破壊された自分のスピリット1体のコストまで）===")
const VANDA = "BS10-010" // 覇竜ヴァンダライザー（召喚時：BP3000以下の相手のスピリットすべてを破壊）
for (const [ownIds, budget] of [[[MET], 3], [[MET, VAN], 3]] as const) {
    for (const interactive of [false, true]) {
        const s = game(`k-${budget}-${interactive}`, "p2", interactive, [], [VANDA])
        s.players.p1.burst = "BS16-083"
        for (const id of ownIds) put(s, "p1", id, 1)
        const fs = foes(s, FIVE)
        const seen: string[][] = []
        const picks = interactive ? [fs[0]!.inst.instanceId, fs[4]!.inst.instanceId] : []
        assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "K: ヴァンダライザーを召喚")
        settle(s, "p2", picks, seen)
        assert(ownIds.every(id => !s.players.p1.field.spirits.some(x => x.cardId === id)), `K(${budget},${interactive}): 自分のスピリットはヴァンダライザーに破壊される`)
        assert(s.players.p1.burst === null, `K(${budget},${interactive}): バーストが発動して場から消える`)
        if (!interactive) {
            checkBudget(s, `K自動(${budget})`, fs.map(f => ({ inst: f.inst, v: f.cost })), budget)
            assert(fs.some(dead.bind(null, s)), `K自動(${budget}): 1体以上は破壊される`)
        } else if (budget === 3) {
            assert(seen.length >= 2 && !seen[1]!.includes(fs[1]!.inst.instanceId), "K対話: コスト3を選ぶと、残り0なので他は選べない")
            assert(deadSet(s, fs) === `${HAR}:4000`, `K対話: 選んだコスト3だけが破壊される（${deadSet(s, fs)}）`)
        }
    }
}

console.log("=== L. BS18-074 救世神撃覇（バースト：自分のライフ減少後 → BP合計6000まで）===")
for (const interactive of [false, true]) {
    const s = game(`l-${interactive}`, "p2", interactive)
    s.players.p1.burst = "BS18-074"
    const fs = foes(s, FIVE)
    const seen: string[][] = []
    s.phase = "attack"
    assert(act(s, "p2", { type: "attack", instanceId: fs[4]!.inst.instanceId }) === null, "L: 相手がアタックする")
    settle(s, "p2")
    assert(takeLifeAndResolve(s, "p1") === null, "L: ライフで受ける")
    settle(s, "p1", interactive ? [fs[0]!.inst.instanceId, fs[3]!.inst.instanceId] : [], seen)
    assert(s.players.p1.burst === null, `L(${interactive}): バーストが発動して場から消える`)
    if (!interactive) {
        checkBudget(s, "L自動", fs.map(f => ({ inst: f.inst, v: f.bp })), 6000)
        assert(fs.some(dead.bind(null, s)), "L自動: 1体以上は破壊される")
    } else {
        assert(seen.length >= 2 && !seen[1]!.includes(fs[1]!.inst.instanceId) && !seen[1]!.includes(fs[2]!.inst.instanceId), "L対話: 4000を選ぶと、BP4000とBP3000は選べない（残り2000）")
        assert(deadSet(s, fs) === `${AIB}:2000,${HAR}:4000`, `L対話: 選んだ4000と2000が破壊される（${deadSet(s, fs)}）`)
    }
}

console.log("すべてのチェックに合格しました 🎉（part700）")
