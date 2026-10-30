// smoke パート699（待機状態の統一。docs/design/PENDING_STATE.md §1 の改訂文と効果文だけを根拠にした期待値）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, answerPayConfirm, giveBp } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・バニラ）
const COFFIN = "BS01-131" // ダークコフィン（紫メイン：疲労状態のスピリット1体を破壊）
const ANT = "BS02-030" // 兵隊アントマン（Lv2 破壊時：手札の系統「怪虫」をコストを支払い召喚できる）
const BODYGUARD = "BS05-024" // 用心棒アントマン（緑・コスト4・軽減緑3・怪虫）
const CARBUNCLE = "BS02-071" // 宝石の獣カーバルク（想獣。破壊時：想獣1体につきボイドからコア1個をリザーブへ／Lv2以上：想獣1体につき1枚ドロー）
const HIPPO = "BS07-037" // ヒッポカンプー（想獣・コスト1・バニラ）
const GASTON = "BS12-003" // 鎧竜人ガストン（地竜。Lv1･2 破壊時：このスピリットのBP以下の相手のスピリット/ブレイヴを破壊）
const TORY = "BS01-012" // トライソードン（地竜・Lv2 BP7000）
const ANKI = "BS08-003" // ダークアンキラーザウルス（Lv2以上 相手のターン：ドローステップ以外で相手がドローしたとき、BP4000以下の相手のスピリット1体を破壊）
const DANSOU = "BS02-076" // 太古の断層（Lv2：相手のスピリットを破壊したとき、破壊したスピリット1体につき1枚ドロー）
const RIBBON = "BS01-146" // ドリームリボン（白フラッシュ：相手のスピリット1体を手札に戻す）
const VOLCANO = "BS06-074" // 紅玉の火山弾（Lv1･2：地竜の自分のスピリットが破壊されたとき、または手札に戻ったとき、BP3000以下の相手のスピリット1体を破壊）
const FLAME = "BS01-121" // フレイムダンス（フラッシュ：BP4000以下のスピリット1体を破壊）

console.log("=== 前提: カードの機械確認 ===")
const names: [string, string][] = [[ANT, "兵隊アントマン"], [BODYGUARD, "用心棒アントマン"], [CARBUNCLE, "宝石の獣カーバルク"], [HIPPO, "ヒッポカンプー"], [GASTON, "鎧竜人ガストン"], [TORY, "トライソードン"], [ANKI, "ダークアンキラーザウルス"], [DANSOU, "太古の断層"], [FLAME, "フレイムダンス"], [RIBBON, "ドリームリボン"], [VOLCANO, "紅玉の火山弾"], [COFFIN, "ダークコフィン"]]
for (const [id, n] of names) assert(getCard(id).name === n, `${id}は${n}`)

function game(seed: string, turnPlayer: PlayerId, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = "main"
    s.interactiveTargets = false
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

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, kind: "spirits" | "nexuses" = "spirits") {
    const inst = createInstance(cardId, s.turn - 1, cores)
    s.players[pid].field[kind].push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function settle(s: GameState, pid: PlayerId): void {
    for (let i = 0; i < 8 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const opts: string[] = pc.options ?? []
        const err = act(s, pc.pid ?? pid, opts.length ? { type: "resolveChoice", option: opts.includes("発動する") ? "発動する" : opts[0] } : { type: "pass" } as any)
        if (err) break
    }
}


// コフィンで疲労状態の対象を破壊し、誘発効果を最後まで解決する
function destroyByCoffin(s: GameState, targetId: string): void {
    const e = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: targetId })
    assert(e === null, `コフィンで破壊できる（${e}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
}

console.log("=== R1 破壊: 待機状態のアントマンのシンボルで用心棒アントマンの召喚コストを軽減できる ===")
{
    const s = game("r1d", "p2", [BODYGUARD], [COFFIN])
    const ant = put(s, "p1", ANT, 2)
    ant.isRested = true
    s.players.p1.reserve = 4 // コスト4をシンボル軽減1で3にして、残り1個を召喚したスピリットに置く
    destroyByCoffin(s, ant.instanceId)
    assert(s.players.p1.field.spirits.some(x => x.cardId === BODYGUARD), "R1 破壊: 軽減を使って用心棒アントマンを召喚できた")
}

console.log("=== R2 破壊: 待機状態のカーバルク自身も想獣の体数に数える ===")
for (const withHippo of [false, true]) {
    const s = game(`r2d-${withHippo}`, "p2", [], [COFFIN])
    const c = put(s, "p1", CARBUNCLE, 3) // Lv2
    c.isRested = true
    if (withHippo) put(s, "p1", HIPPO, 1)
    s.players.p1.reserve = 5
    s.players.p1.deck = Array.from({ length: 40 }, () => VAN)
    destroyByCoffin(s, c.instanceId)
    const n = withHippo ? 2 : 1
    assert(s.players.p1.hand.length === n, `R2 破壊${withHippo ? "（対照: 生きている想獣が他に1体）" : ""}: 想獣${n}体ぶんドロー（手札${s.players.p1.hand.length}）`)
    assert(s.players.p1.reserve === 5 + 3 + n, `R2 破壊${withHippo ? "（対照）" : ""}: ボイドから${n}個+自身のコア3個がリザーブへ（${s.players.p1.reserve}）`)
}

console.log("=== R3 破壊: 待機前から受けているBP+を、待機状態でも受けたままBPを参照する ===")
for (const buff of [true, false]) {
    const s = game(`r3d-${buff}`, "p2", [], [COFFIN])
    const g = put(s, "p1", GASTON, 3) // Lv2 BP5000
    g.isRested = true
    if (buff) giveBp(s, g, 3000) // BP8000
    const tori = put(s, "p2", TORY, 4) // Lv2 BP7000
    destroyByCoffin(s, g.instanceId)
    const dead = !s.players.p2.field.spirits.some(x => x.instanceId === tori.instanceId)
    assert(dead === buff, buff ? "R3 破壊: BP8000のまま待機状態になり、BP7000の相手のスピリットを破壊できる" : "R3 破壊（対照）: BP5000ではBP7000の相手のスピリットを破壊できない")
}

console.log("=== R6 破壊: 待機状態のアンキラーザウルスは「相手がドローしたとき」を発揮しない ===")
// p2 の TORY(BP7000)がアタック。pending＝アンキラー(BP4000)がブロックして BP 比べで破壊される／対照＝別のバニラがブロックする
for (const pending of [true, false]) {
    const s = game(`r6d-${pending}`, "p2")
    put(s, "p2", DANSOU, 3, "nexuses")
    const anki = put(s, "p1", ANKI, 2)
    const other = put(s, "p1", VAN, 1)
    const weak = put(s, "p2", VAN, 1) // アンキラーが発揮すれば破壊される BP1000
    s.phase = "attack"
    const atk = put(s, "p2", TORY, 4)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "R6: p2 がアタック")
    let be: string | null = null
    for (let i = 0; i < 4; i++) {
        be = act(s, "p1", { type: "block", instanceId: (pending ? anki : other).instanceId })
        if (be === null || !be.includes("フラッシュ")) break
        act(s, s.priorityPlayer, { type: "pass" } as any)
    }
    assert(be === null, `R6: ブロック宣言（${be}）`)
    for (let i = 0; i < 12; i++) { settle(s, "p1"); if (act(s, s.priorityPlayer, { type: "pass" } as any)) break }
    settle(s, "p1")
    assert(s.players.p2.hand.length >= 1, `R6: 太古の断層でp2がドローした（手札${s.players.p2.hand.length}）`)
    const weakAlive = s.players.p2.field.spirits.some(x => x.instanceId === weak.instanceId)
    assert(weakAlive === pending, pending ? "R6 破壊: 待機状態のアンキラーザウルスは発揮しないので、p2のBP1000のスピリットは生き残る" : "R6 破壊（対照）: 場にいるアンキラーザウルスが発揮してp2のBP1000のスピリットを破壊する")
}

console.log("=== 観測 戻す: 待機状態（手札に戻る）の地竜に対しても、紅玉の火山弾の「手札に戻ったとき」が誘発する ===")
for (const how of ["戻す"]) {
    const s = game(`bounce-${how}`, "p2", [], [RIBBON])
    put(s, "p1", VOLCANO, 2, "nexuses")
    const mine = put(s, "p1", VAN, 1) // 地竜
    const weak = put(s, "p2", VAN, 1) // BP1000
    s.phase = "attack"
    const atk = put(s, "p2", TORY, 4)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "戻す: p2 がアタック")
    s.isFlashTiming = true
    s.priorityPlayer = "p2"
    const e = act(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId })
    assert(e === null, `${how}: フラッシュで対象を取る（${e}）`)
    answerPayConfirm(s, "p1")
    settle(s, "p1")
    const weakAlive = s.players.p2.field.spirits.some(x => x.instanceId === weak.instanceId)
    assert(!weakAlive, `${how}: 火山弾が誘発し、p2のBP1000のスピリットが破壊される`)
    if (how === "戻す") assert(s.players.p1.hand.includes(VAN), "戻す: 地竜は手札に戻る")
}

console.log("すべてのチェックに合格しました 🎉（part699）")
