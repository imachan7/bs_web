// smoke パート779（BS12-078・BS12-082・BS13-080・BS13-081・BS15-077 のマジック効果）
import {
    act,
    answerPayConfirm,
    assert,
    createGame,
    createInstance,
    effectiveBp,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CASS = "BS12-078" // カシオペアシール（緑・マジック・コスト5）
const SEVEN = "BS12-082" // セブンスヘヴン（黄・マジック・コスト7）
const CRESCENT = "BS13-080" // クレッセントハウリング（白・マジック・コスト4）
const DREAM = "BS13-081" // ドリームシール（黄・マジック・コスト3）
const HEAT = "BS15-077" // ヒートライド（緑・マジック・コスト3）
const SHINE = "BS03-140" // シャイニングマジック（黄・マジック・コスト8・メイン：トラッシュのマジックカード1枚を手札に戻す）
const GRETEL = "BS18-038" // グリムの天使グレーテル（黄・コスト2・天霊）
const SIEG = "BS10-X04" // 月光龍ストライク・ジークヴルム（白・コスト6・カード名に「ストライク」を含む）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・召喚時：ドロー1）
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック・コスト3）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(CASS).name === "カシオペアシール" && getCard(CASS).type === "magic" && getCard(CASS).colors[0] === "green" && getCard(CASS).cost === 5, "CASSはカシオペアシール（緑・マジック・コスト5）")
    assert(getCard(SEVEN).name === "セブンスヘヴン" && getCard(SEVEN).type === "magic" && getCard(SEVEN).colors[0] === "yellow" && getCard(SEVEN).cost === 7, "SEVENはセブンスヘヴン（黄・マジック・コスト7）")
    assert(getCard(CRESCENT).name === "クレッセントハウリング" && getCard(CRESCENT).type === "magic" && getCard(CRESCENT).colors[0] === "white" && getCard(CRESCENT).cost === 4, "CRESCENTはクレッセントハウリング（白・マジック・コスト4）")
    assert(getCard(DREAM).name === "ドリームシール" && getCard(DREAM).type === "magic" && getCard(DREAM).colors[0] === "yellow" && getCard(DREAM).cost === 3, "DREAMはドリームシール（黄・マジック・コスト3）")
    assert(getCard(HEAT).name === "ヒートライド" && getCard(HEAT).type === "magic" && getCard(HEAT).colors[0] === "green" && getCard(HEAT).cost === 3, "HEATはヒートライド（緑・マジック・コスト3）")
    assert(getCard(SHINE).name === "シャイニングマジック" && getCard(SHINE).type === "magic" && getCard(SHINE).colors[0] === "yellow" && getCard(SHINE).cost === 8, "SHINEはシャイニングマジック（黄・マジック・コスト8）")
    assert(getCard(GRETEL).name === "グリムの天使グレーテル" && getCard(GRETEL).type === "spirit" && getCard(GRETEL).family.includes("天霊") && getCard(GRETEL).cost === 2, "GRETELはグリムの天使グレーテル（黄・コスト2・天霊）")
    assert(getCard(SIEG).name === "月光龍ストライク・ジークヴルム" && getCard(SIEG).name.includes("ストライク") && getCard(SIEG).type === "spirit" && getCard(SIEG).colors[0] === "white", "SIEGは月光龍ストライク・ジークヴルム（白・カード名に「ストライク」を含む）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).type === "spirit" && getCard(GRIP).cost === 3, "GRIPはグリプ・ハンズ（紫・コスト3・召喚時ドロー1）")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic" && getCard(ELIXIR).colors[0] === "white", "ELIXIRはピュアエリクサー（白・マジック）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).levels[0]!.bp === 1000, "VANILLAはロクケラトプス（Lv1BP1000）")
}

function game(seed: string, p1color: "red" | "purple" | "green" | "yellow" | "white" | "blue", p1hand: string[], p2hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1color, p2: "red" })
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.life = 5
        p.burst = null
        p.hand = pid === "p1" ? [...p1hand] : [...p2hand]
        p.deck = Array.from({ length: 40 }, () => VANILLA)
        p.trashCards = []
        p.field.spirits = []
        p.field.nexuses = []
        p.field.combinedBraves = []
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

interface Pick {
    option?: (prompt: string, options: string[]) => string | undefined
    target?: (prompt: string, candidates: string[]) => string | undefined
    cardIndex?: (prompt: string, indices: number[]) => number | undefined
}

// pendingChoice を答え続ける。cardIndex は kind:"card" の候補（trashCards のインデックス）選択に使う
function pump(s: GameState, pick: Pick, max = 20): void {
    for (let i = 0; i < max; i++) {
        const pc = s.pendingChoice as (typeof s.pendingChoice & { kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }) | null
        if (!pc) break
        const res: Record<string, unknown> = { type: "resolveChoice" }
        if (pc.kind === "option") {
            const picked = pick.option?.(pc.prompt, pc.options ?? []) ?? pc.options?.[0]
            if (picked !== undefined) res["option"] = picked
        } else if (pc.kind === "target") {
            res["instanceId"] = pick.target?.(pc.prompt, pc.candidates ?? []) ?? pc.candidates?.[0]
        } else if (pc.kind === "card") {
            res["cardIndex"] = pick.cardIndex?.(pc.prompt, pc.cardIndices ?? []) ?? pc.cardIndices?.[0]
        } else {
            res["cardIndex"] = pc.cardIndices?.[0]
        }
        if (handleAction(s, pc.pid as PlayerId, res as never) !== null) break
    }
}

function cast(s: GameState, pid: PlayerId, action: Parameters<typeof act>[2], msg: string): void {
    const err = act(s, pid, action)
    assert(err === null, `${msg}（${err}）`)
    answerPayConfirm(s, pid)
    pump(s, {})
}

// フラッシュタイミングで優先権が pid に来るまでパスしてからマジックを使う（選択は pick で答える）
function castFlash(s: GameState, pid: PlayerId, action: Parameters<typeof act>[2], msg: string, pick: Pick = {}): void {
    for (let i = 0; i < 4 && s.isFlashTiming && s.priorityPlayer !== pid; i++) act(s, s.priorityPlayer, { type: "pass" })
    const err = act(s, pid, action)
    assert(err === null, `${msg}（${err}）`)
    answerPayConfirm(s, pid)
    pump(s, pick)
}

console.log("=== 1. BS12-078-e0／BS13-081-e0: トラッシュのカシオペアシール・ドリームシールは「トラッシュのマジックカードを手札に戻す」効果の対象にならない ===")
{
    const s = game("trash-immunity", "yellow", [SHINE])
    s.players.p1.trashCards = [CASS, DREAM, ELIXIR]
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(err === null, `シャイニングマジックをメインで使用（${err}）`)
    answerPayConfirm(s, "p1")
    pump(s, {})
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === ELIXIR, "トラッシュのピュアエリクサーだけが手札に戻る（候補が1枚なので選択は出ない）")
    assert(s.players.p1.trashCards.filter((c) => c === CASS).length === 1 && s.players.p1.trashCards.includes(DREAM), "カシオペアシールとドリームシールはトラッシュに残る（一切の効果を受けない）")
    assert(s.players.p1.trashCards.includes(SHINE), "使ったシャイニングマジックは解決後にトラッシュへ（自分自身は回収されない）")
}

console.log("=== 2. BS12-078 メイン: 相手スピリットを疲労させ、自分のエンドステップを5回行うまで回復できない ===")
{
    const s = game("cass-main", "green", [CASS])
    const foe = put(s, "p2", VANILLA, 1)
    cast(s, "p1", { type: "castMagic", handIndex: 0, timing: "main", targetInstanceId: foe.instanceId }, "カシオペアシールをメインで使用")
    assert(foe.isRested, "相手のロクケラトプスは疲労する")
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1はターンを終了")
    pump(s, {})
    assert(s.turnPlayer === "p2", "p2のターン")
    assert(foe.isRested, "エンドステップ1回目：封印中なのでp2のスピリットはスタートステップで回復しない")
}

console.log("=== 3. BS12-078 フラッシュ: このターンの間、スピリット1体をBP+3000 ===")
{
    const s = game("cass-flash", "green", [CASS])
    const mine = put(s, "p1", VANILLA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId }, "カシオペアシールをフラッシュで使用")
    assert(effectiveBp(s, "p1", mine) === 4000, "ロクケラトプスはBP1000→4000")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== 4. BS12-082-e1 メイン: 天霊7体でライフが7になる。6体では使えない ===")
{
    const s = game("seven-7", "yellow", [SEVEN])
    for (let i = 0; i < 7; i++) put(s, "p1", GRETEL, 1)
    s.players.p1.life = 3
    cast(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }, "セブンスヘヴンをメインで使用（天霊7体）")
    assert(s.players.p1.life === 7, "ライフ3は7になる（ボイドからコア4個）")
}
{
    const s = game("seven-6", "yellow", [SEVEN])
    for (let i = 0; i < 6; i++) put(s, "p1", GRETEL, 1)
    s.players.p1.life = 3
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    assert(err !== null, "天霊6体ではセブンスヘヴンのメインは使えない")
    assert(s.players.p1.life === 3, "ライフは3のまま")
}

console.log("=== 5. BS12-082-e2 フラッシュ: このターンの間、スピリット1体をBP+5000 ===")
{
    const s = game("seven-flash", "yellow", [SEVEN])
    const mine = put(s, "p1", VANILLA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId }, "セブンスヘヴンをフラッシュで使用")
    assert(effectiveBp(s, "p1", mine) === 6000, "ロクケラトプスはBP1000→6000")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== 6. BS13-080-e2 フラッシュ: 「ストライク」がいれば相手スピリット2体を手札に戻す。いなければ1体 ===")
{
    const s = game("crescent-2", "white", [CRESCENT])
    put(s, "p1", SIEG, 1)
    const foeA = put(s, "p2", VANILLA, 1)
    const foeB = put(s, "p2", VANILLA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }, "クレッセントハウリングをフラッシュで使用", { target: (_p, c) => (c.includes(foeA.instanceId) ? foeA.instanceId : c[0]) })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === foeA.instanceId) && !s.players.p2.field.spirits.some((x) => x.instanceId === foeB.instanceId), "「ストライク」がいるので相手の2体とも手札に戻る")
    assert(s.players.p2.hand.length === 2, "相手の手札は2枚になる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受けてバトルを終える")
    pump(s, {})
}
{
    const s = game("crescent-1", "white", [CRESCENT])
    put(s, "p1", VANILLA, 1)
    const foeA = put(s, "p2", VANILLA, 1)
    const foeB = put(s, "p2", VANILLA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: s.players.p1.field.spirits[0]!.instanceId }) === null, "アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }, "クレッセントハウリングをフラッシュで使用", { target: (_p, c) => (c.includes(foeA.instanceId) ? foeA.instanceId : c[0]) })
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === foeA.instanceId), "1体目は手札に戻る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === foeB.instanceId), "「ストライク」がいないので2体目は戻らない")
    assert(s.players.p2.hand.length === 1, "相手の手札は1枚だけ増える")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== 7. BS13-081 メイン: 『このスピリットの召喚時』効果は発揮されない（3回のエンドステップの間） ===")
{
    const s = game("dream-main", "yellow", [DREAM, GRIP])
    cast(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }, "ドリームシールをメインで使用")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "グリプ・ハンズを召喚")
    answerPayConfirm(s, "p1")
    pump(s, {})
    assert(s.players.p1.deck.length === 40, "『このスピリットの召喚時』ドロー1は発揮されない（デッキは減らない）")
    assert(s.players.p1.hand.length === 0, "手札は増えない")
}

console.log("=== 8. BS13-081 フラッシュ: このターンの間、スピリット1体をBP+2000 ===")
{
    const s = game("dream-flash", "yellow", [DREAM])
    const mine = put(s, "p1", VANILLA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId }, "ドリームシールをフラッシュで使用")
    assert(effectiveBp(s, "p1", mine) === 3000, "ロクケラトプスはBP1000→3000")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== 9. BS15-077-e1: トラッシュのヒートライドは自分のエンドステップに1枚だけ手札に戻る（2枚あっても1枚） ===")
{
    const s = game("heat-trash", "green", [])
    s.players.p1.trashCards = [HEAT, HEAT]
    assert(act(s, "p1", { type: "endTurn" }) === null, "p1はターンを終了（自分のエンドステップ）")
    pump(s, {})
    assert(s.players.p1.hand.filter((c) => c === HEAT).length === 1, "手札に戻るのは1枚だけ")
    assert(s.players.p1.trashCards.filter((c) => c === HEAT).length === 1, "もう1枚はトラッシュに残る")
}

console.log("=== 10. BS15-077 フラッシュ: 指定スピリットがアタックでライフを減らしたときボイドからリザーブにコア1個 ===")
{
    const s = game("heat-flash", "green", [HEAT])
    const mine = put(s, "p1", VANILLA, 1)
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: mine.instanceId }, "ヒートライドをフラッシュで使用")
    const reserveAfterPay = s.players.p1.reserve
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    pump(s, {})
    assert(s.players.p2.life === 4, "相手のライフは減っている")
    assert(s.players.p1.reserve === reserveAfterPay + 1, "ライフを減らしたのでボイドからリザーブにコア1個置かれる")
}

console.log("すべてのチェックに合格しました 🎉（part779）")
