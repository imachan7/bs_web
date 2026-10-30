// smoke パート703（ベトール：相手のアタックで誘発し、アタックしたスピリットの BP をそのバトルの間 2000 として扱う。part702 の期待値役のテストから切り出した）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, answerPayConfirm, effectiveBp } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1）

console.log("=== 前提: カードの機械確認 ===")
for (const [id, n] of [[VAN, "ロクケラトプス"], ["BS12-037", "オリンピアの天使ベトール"], ["BS05-079", "スリーカード"], ["BS01-139", "フェザーバリア"],
    ["BS11-037", "ヒポグリフィー"], ["BS09-027", "密林の勇者皇ヴォルザ"], ["BS09-X40", "凶悪巨人タイタス・ザ・ブラック"], ["BS17-075", "ストラングルフォッグ"],
    ["BS06-043", "盾機兵バルドル"], ["BS08-075", "ダークパワー"]] as const)
    assert(getCard(id).name === n, `${id}は${n}`)

// p1＝攻撃側（ターンプレイヤー）、p2＝防御側。attack フェイズ開始
function game(seed: string, p1Hand: string[] = [], p2Hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = false
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = pid === "p1" ? [...p1Hand] : [...p2Hand]
        p.deck = Array.from({ length: 40 }, () => VAN)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number, rested = false) {
    const inst = createInstance(cardId, s.turn - 1, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function settle(s: GameState): void {
    for (let i = 0; i < 20 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const o: string[] = pc.options ?? []
        const err = act(s, pc.pid, pc.kind === "option" ? { type: "resolveChoice", option: o.includes("発動する") ? "発動する" : o[0] ?? "" } : pc.kind === "target" ? { type: "resolveChoice", instanceId: pc.candidates[0] } : { type: "resolveChoice" })
        if (err) break
    }
}

function ok(s: GameState, pid: PlayerId, a: Parameters<typeof act>[2], msg: string): void {
    const err = act(s, pid, a)
    assert(err === null, `${msg}（${err}）`)
    answerPayConfirm(s, pid)
    settle(s)
}

function state(s: GameState): string {
    return `phase=${s.phase} battle=${!!s.battle} flash=${s.isFlashTiming} prio=${s.priorityPlayer} pc=${(s.pendingChoice as any)?.kind}`
}

function pass(s: GameState, who: PlayerId): void {
    const err = act(s, who, { type: "pass" })
    assert(err === null, `${who}がフラッシュをパスできる（${err}）`)
    settle(s)
}

// アタック宣言後のフラッシュを両者パスで閉じ、ブロックステップへ進める
function toBlockStep(s: GameState): void {
    for (let i = 0; i < 6 && s.isFlashTiming && s.battle; i++) pass(s, s.priorityPlayer)
}

// ブロックの宣言後、バトルが終わるまで両者がパスし続ける
function finishBattle(s: GameState): void {
    for (let i = 0; i < 10 && s.battle; i++) {
        if (act(s, s.priorityPlayer, { type: "pass" })) break
        settle(s)
    }
}

// p1 が attacker でアタックし、p2 が blocker でブロックする。ブロック宣言の結果（エラー文 or null）を返す
function attackAndBlock(s: GameState, attacker: string, blocker: string): string | null {
    ok(s, "p1", { type: "attack", instanceId: attacker }, "アタック宣言")
    toBlockStep(s)
    const err = act(s, "p2", { type: "block", instanceId: blocker })
    answerPayConfirm(s, "p2")
    settle(s)
    return err
}

// ブロック宣言の後、p2 が先にパスして p1 に優先権が来た状態で、p1 がフォッグを blk へ撃つ
function fog(s: GameState, blk: { instanceId: string }, handIndex = 0): void {
    ok(s, "p1", { type: "castMagic", handIndex, timing: "flash", targetInstanceId: blk.instanceId }, "ストラングルフォッグを撃つ")
}

// 拒否されても落とさずエラー文（成功なら null）を返す。p1 に優先権が来るまでパスで回す
function fogErr(s: GameState, blk: { instanceId: string }): string | null {
    for (let i = 0; i < 3 && s.priorityPlayer !== "p1"; i++) pass(s, s.priorityPlayer)
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: blk.instanceId })
    answerPayConfirm(s, "p1")
    settle(s)
    return err
}

console.log("=== BS12-037 ベトール：シンボル2つの相手アタッカーのBPをそのバトルの間2000として扱う ===")
// ベトールLv1（BP3000）がブロックして、アタッカーが生き残るか／破壊されるかで「2000として扱う」を見る
for (const [atk, cores, dies, label] of [
    ["BS09-027", 1, true, "シンボル2つ（ヴォルザLv1 BP5000）は2000扱いで負ける"],
    ["BS09-036", 2, true, "シンボル2つ・装甲が黄を含まない（ウルLv2 BP7000）は2000扱いで負ける"],
    [VAN, 3, false, "シンボル1つ（ロクケラトプスLv3 BP4000）は元のBPで勝つ"],
] as const) {
    const s = game(`beetle-${atk}`)
    const a = put(s, "p1", atk, cores)
    const beetle = put(s, "p2", "BS12-037", 1)
    assert(attackAndBlock(s, a.instanceId, beetle.instanceId) === null, `${label}: ベトールでブロックできる`)
    finishBattle(s)
    assert(!s.battle, `${label}: バトルが終わった`)
    const aAlive = s.players.p1.field.spirits.some((x) => x.instanceId === a.instanceId)
    const bAlive = s.players.p2.field.spirits.some((x) => x.instanceId === beetle.instanceId)
    assert(aAlive === !dies && bAlive === dies, `${label}（アタッカー生存=${aAlive}・ベトール生存=${bAlive}）`)
}
{
    // バトルの後は元のBP：1つ目のバトルでヴォルザ（回復する）が生き残った後、ベトールを場から除いて2回目のアタックをする
    const s = game("beetle-after")
    const volza = put(s, "p1", "BS09-027", 1)
    const beetle = put(s, "p2", "BS12-037", 1)
    const w1 = put(s, "p2", VAN, 1)
    const w2 = put(s, "p2", VAN, 2)
    assert(attackAndBlock(s, volza.instanceId, w1.instanceId) === null, "1回目: 弱いブロッカーでブロック")
    finishBattle(s)
    assert(!volza.isRested && s.players.p1.field.spirits.includes(volza), "1回目: ヴォルザは生き残り回復している")
    s.players.p2.field.spirits = s.players.p2.field.spirits.filter((x) => x !== beetle) // ベトールを除いて持ち越しだけを見る
    assert(attackAndBlock(s, volza.instanceId, w2.instanceId) === null, "2回目: ブロック")
    finishBattle(s)
    assert(s.players.p1.field.spirits.includes(volza) && !s.players.p2.field.spirits.includes(w2), "2回目: 元のBP5000で勝つ（2000扱いが持ち越されない）")
}

console.log("すべてのチェックに合格しました 🎉（part703）")
