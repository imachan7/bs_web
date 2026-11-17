// smoke パート984（【連鎖】の部分を印で見分ける。SD17-X01 の緑の【連鎖】が「【連鎖】が発揮したとき」を起こす／
// SD11-X02 の「【連鎖】は条件を無視して発揮する」が keyword:"rensa" の常在・付与エントリの条件にも効く）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { countSymbols } from "../../shared/rules/symbols"
import { activeConstraints } from "../../shared/rules"

const SD17 = "SD17-X01" // 闇龍ダーク・ティラノザウラー（赤・コスト6・地竜。BS1000。緑の【連鎖】の部分=battleWon e2）
const FORT = "BS23-027" // 要塞蟲フォートコーカサス（緑白。Lv2 e3：緑の【連鎖】が発揮したとき、アタック中のスピリットの効果で戻す）
const SWORD = "SD11-X02" // 白夜の宝剣ミッドナイト・サン（白・ブレイヴ。【合体時】【連鎖】の条件を無視）
const WYBORN = "BS20-016" // ワイボーン（紫・コスト5。e2【連鎖】：赤シンボルがあるとき直接アタック）
const PERU = "BS19-055" // ペルーディア（黄。Lv2～ e4：白シンボルがあるとき【生命】持ちに【連鎖】の制約を付与）
const MAZE = "BS19-066" // メイズ・ハイドラ（青。e3：赤シンボルがあるとき青シンボル+2）
const VAN = "BS01-002" // ロクケラトプス（赤・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    for (const [id, name, type] of ([[SD17, "闇龍ダーク・ティラノザウラー", "spirit"], [FORT, "要塞蟲フォートコーカサス", "spirit"], [SWORD, "白夜の宝剣ミッドナイト・サン", "brave"], [WYBORN, "ワイボーン", "spirit"], [VAN, "ロクケラトプス", "spirit"]] as [string, string, string][]))
        assert(getCard(id).name === name && getCard(id).type === type, `${id} は ${name}`)
}

function build(seed: string, mine: { card: string; cores: number }[], opp: { card: string; cores: number }[]) {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = true
    for (const [pid, list] of [["p1", mine], ["p2", opp]] as [PlayerId, typeof mine][]) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.nexuses = []
        p.field.combinedBraves = []
        p.burst = null
        p.burstSet = false
        p.soulCore = null
        p.field.spirits = list.map((x) => createInstance(x.card, s.turn - 1, x.cores))
    }
    refreshLevelAsOverrides(s)
    return s
}

function drive(s: GameState): string[] {
    const trace: string[] = []
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        trace.push(`${pc.pid}:${pc.kind}:${pc.prompt}`)
        let a: GameAction
        if (pc.kind === "target") a = { type: "resolveChoice", instanceId: pc.candidates[0]! }
        else if (pc.kind === "card") a = { type: "resolveChoice", cardIndex: pc.cardIndices?.[0] ?? 0 }
        else a = { type: "resolveChoice", option: pc.options?.[0] ?? "" }
        const err = act(s, pc.pid, a)
        assert(err === null, `選択が通る（${trace.join(" / ")}）${err ?? ""}`)
        if (err) break
    }
    return trace
}

// SD17 が攻撃し、相手の弱いスピリット2体のうち1体が攻撃時の破壊を免れてブロックし、バトルで破壊される。相手にはブロックしない大きいスピリットが1体
function attack(seed: string, withFort: boolean) {
    const s = build(seed, [{ card: SD17, cores: 1 }, ...(withFort ? [{ card: FORT, cores: 3 }] : [])],
        [{ card: VAN, cores: 1 }, { card: VAN, cores: 1 }, { card: "BS01-005", cores: 1 }])
    const atk = s.players.p1.field.spirits[0]!
    const err = act(s, "p1", { type: "attack", instanceId: atk.instanceId })
    assert(err === null, `アタックできる（${err ?? ""}）`)
    return { s, atk }
}

// 攻撃宣言からバトル解決まで進める
function fight(s: GameState): void {
    drive(s)
    const blocker = s.players.p2.field.spirits.find((x) => x.cardId === VAN)!
    for (const [pid, a] of [["p2", { type: "pass" }], ["p1", { type: "pass" }], ["p2", { type: "block", instanceId: blocker.instanceId }], ["p2", { type: "pass" }], ["p1", { type: "pass" }]] as [PlayerId, GameAction][]) {
        const err = act(s, pid, a)
        assert(err === null, `${a.type} が通る（${err ?? ""}）`)
    }
    drive(s)
}

console.log("=== 1. SD17-X01: 緑シンボルがあれば【連鎖】の部分が効き、要塞蟲フォートコーカサスの緑の【連鎖】誘発が発揮される ===")
{
    const { s } = attack("rensa-1", true)
    fight(s)
    assert(s.players.p2.field.spirits.every((x) => x.cardId !== VAN), "ブロックした相手は破壊された（バトルを相手のスピリットだけが破壊された形で終えた）")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === SD17), "SD17-X01 は残っている")
    assert(s.players.p2.life === 4, `【連鎖】の部分でライフを1つ砕いた（${s.players.p2.life}）`)
    assert(s.players.p2.hand.length === 1 && s.players.p2.field.spirits.length === 0, `緑の【連鎖】が発揮したので BS23-027 が相手のスピリット1体を手札に戻した（手札 ${s.players.p2.hand.length}・場 ${s.players.p2.field.spirits.length}）`)
}

console.log("=== 2. SD17-X01: 緑シンボルが無ければ【連鎖】の部分も誘発も起きない ===")
{
    const { s } = attack("rensa-2", false)
    fight(s)
    assert(s.players.p2.field.spirits.every((x) => x.cardId !== VAN), "ブロックした相手は破壊された")
    assert(s.players.p2.life === 5, `ライフは砕かれない（${s.players.p2.life}）`)
    assert(s.players.p2.hand.length === 0 && s.players.p2.field.spirits.length === 1, "手札に戻る相手もいない")
}

console.log("=== 3. SD11-X02 合体中: keyword:rensa の constraint はシンボル条件を満たさなくても効く ===")
{
    const s = build("rensa-3", [{ card: WYBORN, cores: 1 }], [])
    const host = s.players.p1.field.spirits[0]!
    const direct = () => activeConstraints(s, "p1", host).some((c) => c.type === "canDirectAttack")
    assert(!direct(), "赤シンボルが無く合体もしていないので直接アタックできない")
    const brave = createInstance(SWORD, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    assert(direct(), "SD11-X02 と合体中は条件を無視して直接アタックできる")
    host.braveRefs = []
    s.players.p1.field.combinedBraves = []
    refreshLevelAsOverrides(s)
    assert(!direct(), "合体を解くと効かなくなる")
    s.players.p1.field.spirits.push(createInstance(VAN, s.turn, 1))
    assert(direct(), "対照: 赤シンボルがあれば合体なしでも直接アタックできる")
}

// SD11-X02 を合体させる／外す（合体の条件判定は通さず状態を直接組む）
function combine(s: GameState, host: ReturnType<typeof createInstance>, on: boolean): void {
    if (on) {
        const brave = createInstance(SWORD, s.turn, 0)
        s.players.p1.field.combinedBraves.push(brave)
        host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    } else {
        host.braveRefs = []
        s.players.p1.field.combinedBraves = []
    }
    refreshLevelAsOverrides(s)
}

console.log("=== 4. SD11-X02 合体中: keyword:rensa の constraintGrant（ペルーディア）も条件を無視して付与する ===")
{
    const s = build("rensa-4", [{ card: PERU, cores: 2 }], [])
    const host = s.players.p1.field.spirits[0]!
    const granted = () => activeConstraints(s, "p1", host).some((c) => c.type === "unblockableBy")
    assert(!granted(), "白シンボルが無く合体もしていないので付与されない")
    combine(s, host, true)
    host.symbolsOverrideContinuous = ["yellow"] // 合体したブレイヴの白シンボルを数えさせない（条件の白シンボルを本当に満たさない状態にする）
    assert(countSymbols(s.players.p1, ["white"]) === 0, "前提: 白シンボルは0")
    assert(granted(), "合体中は条件を無視して付与される")
    combine(s, host, false)
    assert(!granted(), "合体を解くと付与されない")
}

console.log("=== 5. SD11-X02 合体中: keyword:rensa の symbolAddGrant（メイズ・ハイドラ）も条件を無視して青シンボルを足す ===")
{
    const s = build("rensa-5", [{ card: MAZE, cores: 1 }], [])
    const host = s.players.p1.field.spirits[0]!
    const added = () => (host.symbolsAddedContinuous ?? []).length
    assert(added() === 0, "赤シンボルが無く合体もしていないので足されない")
    combine(s, host, true)
    assert(added() === 2, `合体中は条件を無視して青シンボルが2つ足される（${added()}）`)
    combine(s, host, false)
    assert(added() === 0, "合体を解くと足されない")
}

console.log("すべてのチェックに合格しました 🎉（part984）")
