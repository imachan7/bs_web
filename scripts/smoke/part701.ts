// smoke パート701（「自分のスピリットすべてを回復させる」系9枚：回復した個体だけにアタック不可が掛かる／掛からない）
import { act, takeLifeAndResolve, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, answerPayConfirm } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1）
const SENKI = "BS01-013" // タウロスナイト（系統：戦騎）
const TENSHO = "SD02-004" // 神獣ハクタク（【転召】持ち）
const BRAVE = "BS10-061" // 剣鎧竜バスター・ドラゴン（ブレイヴ。合体スピリット用）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, n] of [[VAN, "ロクケラトプス"], [SENKI, "タウロスナイト"], [TENSHO, "神獣ハクタク"], [BRAVE, "剣鎧竜バスター・ドラゴン"],
    ["BS01-106", "隠されたる賢者の樹"], ["BS01-142", "ピュアエリクサー"], ["BS06-081", "賢者の樹の実"], ["BS06-103", "キャバルリー"], ["BS09-076", "エマージェンシー"],
    ["BS11-079", "リブートコード"], ["BS14-105", "氷河零刀斬"], ["BS16-068", "イ・ケダヤンの階段山脈"], ["BS17-065", "獣の楽園"]] as const)
    assert(getCard(id).name === n, `${id}は${n}`)
assert(getCard(SENKI).family.includes("戦騎"), "タウロスナイトは系統戦騎")

function game(seed: string, hand: string[]): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 10
        p.burst = null
        p.hand = pid === "p1" ? [...hand] : []
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, cardId: string, tired: boolean, cores = 2) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = tired
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function settle(s: GameState, pid: PlayerId): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const o: string[] = pc.options ?? []
        const err = act(s, pc.pid ?? pid, pc.kind === "option" ? { type: "resolveChoice", option: o.includes("発動する") ? "発動する" : o[0] ?? "" } : { type: "resolveChoice" })
        if (err) break
    }
}

function cast(s: GameState, id: string): void {
    const handIndex = s.players.p1.hand.indexOf(id)
    const err = act(s, "p1", { type: "castMagic", handIndex, timing: "flash" })
    assert(err === null, `${id}をフラッシュで使える（${err}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
}

function canAttack(s: GameState, inst: { instanceId: string }): boolean {
    s.phase = "attack"
    const err = act(s, "p1", { type: "attack", instanceId: inst.instanceId })
    settle(s, "p1")
    // バトルが終わるまで優先権を渡し続ける（相手はブロッカーなし）
    if (!err) {
        takeLifeAndResolve(s, "p2")
        settle(s, "p2")
    }
    return err === null
}

// 5枚のアタック不可マジック：[カード, 除外に当たる個体, 備考]
const MAGICS: [string, "none" | "senki" | "tensho" | "combined" | "all-refreshed"][] = [
    ["BS01-142", "none"], ["BS06-103", "senki"], ["BS09-076", "tensho"], ["BS11-079", "combined"], ["BS14-105", "none"],
]
for (const [magic, exempt] of MAGICS) {
    console.log(`=== ${magic}（除外: ${exempt}）===`)
    const s = game(`m-${magic}`, [magic, VAN])
    const tiredNormal = put(s, VAN, true)
    const already = put(s, VAN, false)
    const tiredSenki = put(s, SENKI, true, 4)
    const tiredTensho = put(s, TENSHO, true, 4)
    const host = put(s, VAN, true)
    const braveInst = createInstance(BRAVE, s.turn - 1, 1)
    s.players.p1.hand.push(BRAVE)
    const e = act(s, "p1", { type: "summon", handIndex: s.players.p1.hand.indexOf(BRAVE), braveTargetInstanceId: host.instanceId })
    assert(e === null, `合体スピリットを用意できる（${e}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    void braveInst
    host.isRested = true
    cast(s, magic)
    assert(!tiredNormal.isRested && !tiredSenki.isRested && !tiredTensho.isRested && !host.isRested, `${magic}: 疲労状態の個体はすべて回復する`)
    act(s, "p1", { type: "summon", handIndex: s.players.p1.hand.indexOf(VAN) })
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    const fresh = s.players.p1.field.spirits[s.players.p1.field.spirits.length - 1]!
    assert(fresh.cardId === VAN && fresh.summonedTurn === s.turn, "効果の後に召喚したスピリットがいる")
    s.phase = "attack"
    const ok = (x: { instanceId: string }, want: boolean, label: string) => assert(canAttack(s, x) === want, `${magic}: ${label}は${want ? "アタックできる" : "アタックできない"}`)
    ok(tiredNormal, false, "回復した通常スピリット")
    ok(already, true, "もともと回復状態だったスピリット")
    ok(tiredSenki, exempt === "senki", "回復した戦騎")
    ok(tiredTensho, exempt === "tensho", "回復した転召持ち")
    ok(host, exempt === "combined", "回復した合体スピリット")
    ok(fresh, true, "効果の後に召喚したスピリット")
}

console.log("=== 回復だけの4枚（アタック不可の記述なし）===")
{
    const s = game("nx-1", [])
    const a = put(s, VAN, true)
    const b = put(s, SENKI, true, 4)
    const nx = createInstance("BS01-106", s.turn - 1, 5)
    s.players.p1.field.nexuses.push(nx)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "endTurn" })
    settle(s, "p1")
    assert(!a.isRested && !b.isRested, "BS01-106: Lv2の自分のエンドステップに自分のスピリットすべてが回復する")
}
for (const id of ["BS06-081", "BS17-065"]) {
    const s = game(`nx-${id}`, [])
    const a = put(s, VAN, true)
    const nx = createInstance(id, s.turn - 1, 5)
    s.players.p1.field.nexuses.push(nx)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "endTurn" })
    settle(s, "p1")
    assert(!a.isRested, `${id}: Lv2の自分のエンドステップにスピリットが回復する`)
}
{
    const s = game("nx-16068", ["BS16-068"])
    const a = put(s, VAN, true)
    const err = act(s, "p1", { type: "setNexus", handIndex: 0 })
    assert(err === null, `BS16-068を手札から配置できる（${err}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    assert(a.isRested, "BS16-068: 配置した時点ではまだ回復しない（このターン終了時）")
    act(s, "p1", { type: "endTurn" })
    settle(s, "p1")
    assert(!a.isRested, "BS16-068: このターン終了時に自分のスピリットすべてが回復する")
}

console.log("すべてのチェックに合格しました 🎉（part701）")
