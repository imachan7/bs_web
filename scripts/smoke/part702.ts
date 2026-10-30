// smoke パート702（アタック/ブロック中だけ効く効果の期間と対象：ベトール・スリーカード・フェザーバリア・ヒポグリフィー・ヴォルザ・タイタス）
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

console.log("=== BS09-027 ヴォルザ / BS09-X40 タイタス：ブロッカーのコアは取り除けない（そのバトルの間だけ）===")
for (const [atk, cores, protectedExp, label] of [
    ["BS09-027", 3, true, "ヴォルザLv2"], ["BS09-027", 1, false, "ヴォルザLv1（Lv2限定の効果なので働かない）"],
    ["BS09-X40", 5, true, "タイタスLv2"], ["BS09-X40", 1, false, "タイタスLv1（Lv2限定）"],
] as const) {
    const s = game(`core-${atk}-${cores}`, ["BS17-075", "BS17-075"])
    const a = put(s, "p1", atk, cores)
    const b1 = put(s, "p2", VAN, 2)
    const b2 = put(s, "p2", VAN, 2)
    const second = put(s, "p1", VAN, 1)
    assert(attackAndBlock(s, a.instanceId, b1.instanceId) === null, `${label}: ブロックできる`)
    pass(s, "p2")
    fog(s, b1)
    assert(protectedExp ? b1.cores === 2 : b1.cores === 1, `${label}: ブロッカーのコア ${protectedExp ? "は取り除けない（2個のまま）" : "は取り除ける（2→1）"}（実際${b1.cores}）`)
    if (protectedExp) {
        finishBattle(s)
        assert(!s.battle, `${label}: 1つ目のバトルが終わった`)
        assert(attackAndBlock(s, second.instanceId, b2.instanceId) === null, `${label}: 次のバトルのブロック`)
        pass(s, "p2")
        fog(s, b2)
        assert(b2.cores === 1, `${label}: 次のバトルでは取り除ける（2→1）（実際${b2.cores}）`)
    }
}

console.log("=== BS11-037 ヒポグリフィー：リザーブのコア1個をトラッシュに置かなければブロックできない（そのバトルだけ）===")
{
    const s = game("hippo-1")
    const a = put(s, "p1", "BS11-037", 3)
    const b1 = put(s, "p2", VAN, 2)
    const b2 = put(s, "p2", VAN, 2)
    const second = put(s, "p1", VAN, 1)
    s.players.p2.reserve = 5
    assert(attackAndBlock(s, a.instanceId, b1.instanceId) === null, "Lv2: コアを払ってブロックできる")
    assert(s.players.p2.reserve === 4 && s.players.p2.trashCores === 1, `Lv2: リザーブ5→4・トラッシュのコア0→1（実際${s.players.p2.reserve}/${s.players.p2.trashCores}）`)
    finishBattle(s)
    assert(!s.battle, "1つ目のバトルが終わった")
    const r0 = s.players.p2.reserve
    const t0 = s.players.p2.trashCores
    assert(attackAndBlock(s, second.instanceId, b2.instanceId) === null, "次のバトルでブロックできる")
    assert(s.players.p2.reserve === r0 && s.players.p2.trashCores === t0, `次のバトルではコアを払わない（リザーブ${r0}→${s.players.p2.reserve}・トラッシュのコア${t0}→${s.players.p2.trashCores}）`)
}
{
    const s = game("hippo-2")
    const a = put(s, "p1", "BS11-037", 1)
    const b = put(s, "p2", VAN, 2)
    s.players.p2.reserve = 5
    assert(attackAndBlock(s, a.instanceId, b.instanceId) === null, "Lv1: ブロックできる")
    assert(s.players.p2.reserve === 5, `Lv1（Lv2限定の効果なので働かない）: コアを払わない（実際${s.players.p2.reserve}）`)
}
{
    const s = game("hippo-3")
    const a = put(s, "p1", "BS11-037", 3)
    const b = put(s, "p2", VAN, 2)
    s.players.p2.reserve = 0
    assert(attackAndBlock(s, a.instanceId, b.instanceId) !== null, "Lv2・相手のリザーブにコアが無い: ブロックできない")
}
{
    const s = game("hippo-4")
    const a = put(s, "p1", VAN, 1)
    const b = put(s, "p2", VAN, 2)
    s.players.p2.reserve = 0
    assert(attackAndBlock(s, a.instanceId, b.instanceId) === null, "対照: ヒポグリフィー以外ならリザーブ0でもブロックできる")
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

console.log("=== BS01-139 フェザーバリア：ブロックしている自分のスピリットだけが相手のカードの効果を受けない ===")
{
    // ブロック後に使う：ブロッカーAは守られ、ブロックしていないBは守られない
    const s = game("feather-1", ["BS17-075", "BS17-075"], ["BS01-139"])
    const a = put(s, "p1", VAN, 1)
    const blk = put(s, "p2", VAN, 2)
    const other = put(s, "p2", VAN, 2)
    assert(attackAndBlock(s, a.instanceId, blk.instanceId) === null, "ブロックできる")
    ok(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }, "p2がフェザーバリアを使う")
    assert(fogErr(s, blk) !== null && blk.cores === 2, `ブロックしているスピリットは相手の効果を受けない（対象にできず、コア2のまま、実際${blk.cores}）`)
    assert(fogErr(s, other) === null && other.cores < 2, `ブロックしていないスピリットには付かない（コアが減る、実際${other.cores}）`)
}
{
    // ブロック前に使う：ブロックしているスピリットがいないので何も起きず、後からブロックしても守られない
    const s = game("feather-2", ["BS17-075"], ["BS01-139"])
    const a = put(s, "p1", VAN, 1)
    const blk = put(s, "p2", VAN, 2)
    ok(s, "p1", { type: "attack", instanceId: a.instanceId }, "アタック")
    ok(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash" }, "ブロック前にフェザーバリア")
    for (let i = 0; i < 4 && s.isFlashTiming && s.battle; i++) pass(s, s.priorityPlayer)
    assert(act(s, "p2", { type: "block", instanceId: blk.instanceId }) === null, "ブロックできる")
    settle(s)
    assert(fogErr(s, blk) === null && blk.cores < 2, `ブロック前に使った場合は後からブロックしたスピリットを守らない（コアが減る、実際${blk.cores}）`)
}

console.log("=== BS05-079 スリーカード：使った側のスピリット/ネクサスの効果で数えるときだけ3体分 ===")
const BASA = "BS18-004" // バサ・ラザン（赤・系統皇獣。自分の皇獣1体につきBP+1000）
assert(getCard(BASA).name === "バサ・ラザン" && getCard(BASA).family.includes("皇獣"), "BASAは皇獣のバサ・ラザン")
{
    // 使った側（p1）のスピリット効果：p1 の皇獣を数えるバサ・ラザン。Bを指定すると B が3体分
    const run = (caster: "p1" | "p2" | null) => {
        const s = game(`three-spirit-${caster}`, caster === "p1" ? ["BS05-079"] : [], caster === "p2" ? ["BS05-079"] : [])
        const a = put(s, "p1", BASA, 1)
        const b = put(s, "p1", BASA, 1)
        const x = put(s, "p2", VAN, 1)
        void x
        if (caster) {
            ok(s, "p1", { type: "attack", instanceId: a.instanceId }, "アタック")
            if (caster === "p1") pass(s, "p2")
            ok(s, caster, { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: b.instanceId }, `${caster}がスリーカードを使う`)
        } else s.phase = "attack"
        return effectiveBp(s, "p1", a)
    }
    const base = run(null)
    assert(base === 4000, `基準: 皇獣2体でBP2000+2000=4000（実際${base}）`)
    const mine = run("p1")
    assert(mine === 6000, `自分（使った側）のスピリット効果で数える: 指定した1体が3体分で2000+(1+3)×1000=6000（実際${mine}）`)
    const theirs = run("p2")
    assert(theirs === 4000, `相手が使った場合、p1の効果は3体分に数えない: 4000のまま（実際${theirs}）`)
}
{
    // 使った側のマジック効果：ダークパワー（疲労状態の自分のスピリット1体につきBP+2000）。指定した疲労スピリットは1体のまま
    const run = (three: boolean) => {
        const s = game(`three-magic-${three}`, three ? ["BS05-079", "BS08-075"] : ["BS08-075"])
        const tired = put(s, "p1", VAN, 1, true)
        const titus = put(s, "p1", "BS09-X40", 1)
        put(s, "p2", VAN, 1)
        ok(s, "p1", { type: "attack", instanceId: titus.instanceId }, "タイタスでアタック")
        pass(s, "p2")
        if (three) ok(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: tired.instanceId }, "スリーカードを疲労スピリットに")
        const idx = s.players.p1.hand.indexOf("BS08-075")
        for (let i = 0; i < 3 && (s.priorityPlayer as string) !== "p1"; i++) pass(s, s.priorityPlayer)
        ok(s, "p1", { type: "castMagic", handIndex: idx, timing: "flash" }, "ダークパワー")
        return effectiveBp(s, "p1", titus)
    }
    const base = run(false)
    assert(base === 7000 + 2000 * 2, `基準: タイタスLv1 7000＋疲労スピリット2体（疲労した個体とアタック中のタイタス）×2000（実際${base}）`)
    const withThree = run(true)
    assert(withThree === base, `マジックの効果で数えるときは3体分にならない（${base}のまま、実際${withThree}）`)
}

console.log("すべてのチェックに合格しました 🎉（part702）")
