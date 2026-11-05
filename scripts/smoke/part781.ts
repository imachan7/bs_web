// smoke パート781（マジックの使用中ゾーン：解決し終えてからトラッシュに置く。BS03-140・BS19-102・BS10-046・BS11-058）
import {
    act,
    answerPayConfirm,
    assert,
    createGame,
    createInstance,
    effectiveCost,
    getCard,
    handleAction,
    refreshLevelAsOverrides,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const SHINE = "BS03-140" // シャイニングマジック（黄・マジック・コスト8・メイン：トラッシュのマジック1枚を手札に戻す）
const HAZ = "BS19-102" // パープルヘイズ（紫・マジック・コスト6・フラッシュ：コア移動＋0個なら手札に戻る）
const PERY = "BS11-058" // 神弓鳥ペリュトーン（黄・ブレイヴ・コスト5）
const RYUSEN = "BS10-046" // 龍仙公主（黄・スピリット・コスト5・Lv2コア3）
const ELIXIR = "BS01-142" // ピュアエリクサー（白・マジック）
const DREAM = "BS13-081" // ドリームシール（黄・マジック・コスト3）
const BOLT = "BS11-081" // ライトニングデリバリー（黄・マジック・コスト3・フラッシュ：ドロー1・対象を取らない）
const CYCLONE = "BS03-120" // フレイムサイクロン（赤・マジック・フラッシュ：BP5000以下破壊）
const MIRROR = "BS02-083" // 鏡の回廊（白・ネクサス・Lv2で相手マジックを無効化）
const HOST = "BS02-023" // 双蛇ヒュドラム（赤・スピリット・コスト6・合体条件を満たす）
const GORADON = "BS01-001" // ゴラドン（赤・コスト0・Lv1BP1000）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(SHINE).name === "シャイニングマジック" && getCard(SHINE).type === "magic" && getCard(SHINE).colors[0] === "yellow" && getCard(SHINE).cost === 8, "SHINEはシャイニングマジック（黄・マジック・コスト8）")
    assert(getCard(HAZ).name === "パープルヘイズ" && getCard(HAZ).type === "magic" && getCard(HAZ).colors[0] === "purple" && getCard(HAZ).cost === 6, "HAZはパープルヘイズ（紫・マジック・コスト6）")
    assert(getCard(PERY).name === "神弓鳥ペリュトーン" && getCard(PERY).type === "brave" && getCard(PERY).colors[0] === "yellow" && getCard(PERY).cost === 5, "PERYは神弓鳥ペリュトーン（黄・ブレイヴ・コスト5）")
    assert(getCard(RYUSEN).name === "龍仙公主" && getCard(RYUSEN).type === "spirit" && getCard(RYUSEN).colors[0] === "yellow" && getCard(RYUSEN).levels[1]!.cores === 3, "RYUSENは龍仙公主（黄・スピリット・Lv2コア3）")
    assert(getCard(ELIXIR).name === "ピュアエリクサー" && getCard(ELIXIR).type === "magic" && getCard(ELIXIR).colors[0] === "white", "ELIXIRはピュアエリクサー（白・マジック）")
    assert(getCard(DREAM).name === "ドリームシール" && getCard(DREAM).type === "magic" && getCard(DREAM).colors[0] === "yellow" && getCard(DREAM).cost === 3, "DREAMはドリームシール（黄・マジック・コスト3）")
    assert(getCard(BOLT).name === "ライトニングデリバリー" && getCard(BOLT).type === "magic" && getCard(BOLT).colors[0] === "yellow" && getCard(BOLT).cost === 3, "BOLTはライトニングデリバリー（黄・マジック・コスト3）")
    assert(getCard(CYCLONE).name === "フレイムサイクロン" && getCard(CYCLONE).type === "magic" && getCard(CYCLONE).colors[0] === "red", "CYCLONEはフレイムサイクロン（赤・マジック）")
    assert(getCard(MIRROR).name === "鏡の回廊" && getCard(MIRROR).type === "nexus", "MIRRORは鏡の回廊（ネクサス）")
    assert(getCard(HOST).name === "双蛇ヒュドラム" && getCard(HOST).type === "spirit" && getCard(HOST).cost === 6, "HOSTは双蛇ヒュドラム（コスト6）")
    assert(getCard(GORADON).name === "ゴラドン" && getCard(GORADON).levels[0]!.bp === 1000, "GORADONはゴラドン（Lv1BP1000）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).levels[0]!.bp === 1000, "VANILLAはロクケラトプス（Lv1BP1000）")
}

function game(seed: string, p1color: "red" | "purple" | "green" | "yellow" | "white" | "blue", p1hand: string[], p2hand: string[] = []): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: p1color, p2: "red" })
    s.interactiveTargets = true
    runTurnStart(s)
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

function totalCards(s: GameState, pid: PlayerId): number {
    const p = s.players[pid]
    return p.deck.length + p.hand.length + p.trashCards.length + p.field.spirits.length + p.field.nexuses.length + p.field.combinedBraves.length
}

interface Pick {
    option?: (prompt: string, options: string[]) => string | undefined
    target?: (prompt: string, candidates: string[]) => string | undefined
    cardIndex?: (prompt: string, indices: number[]) => number | undefined
}

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
        } else {
            res["cardIndex"] = pick.cardIndex?.(pc.prompt, pc.cardIndices ?? []) ?? pc.cardIndices?.[0]
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

function castFlash(s: GameState, pid: PlayerId, action: Parameters<typeof act>[2], msg: string, pick: Pick = {}): void {
    for (let i = 0; i < 4 && s.isFlashTiming && s.priorityPlayer !== pid; i++) act(s, s.priorityPlayer, { type: "pass" })
    const err = act(s, pid, action)
    assert(err === null, `${msg}（${err}）`)
    answerPayConfirm(s, pid)
    pump(s, pick)
}

console.log("=== A. 規則1・2: トラッシュが空のときシャイニングマジックを使うと、自分は回収できず解決後にトラッシュにある ===")
{
    const s = game("a-empty-trash", "yellow", [SHINE])
    const before = totalCards(s, "p1")
    cast(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }, "シャイニングマジックをメインで使用（トラッシュは空）")
    assert(s.players.p1.hand.length === 0, "A: 手札は空（何も回収されない）")
    assert(s.players.p1.trashCards.filter((c) => c === SHINE).length === 1, "A: シャイニングマジックは解決後にトラッシュにある")
    assert(totalCards(s, "p1") === before, "A: カードの総数は変わらない")
}

console.log("=== B. 規則2: トラッシュにほかのマジックがあればそれが手札に戻り、シャイニングマジック自身はトラッシュに行く ===")
{
    const s = game("b-other-magic", "yellow", [SHINE])
    s.players.p1.trashCards = [ELIXIR]
    const before = totalCards(s, "p1")
    cast(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }, "シャイニングマジックをメインで使用（トラッシュにピュアエリクサー1枚）")
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === ELIXIR, "B: トラッシュのピュアエリクサーが手札に戻る")
    assert(!s.players.p1.hand.includes(SHINE), "B: シャイニングマジックは手札に無い")
    assert(s.players.p1.trashCards.filter((c) => c === SHINE).length === 1 && !s.players.p1.trashCards.includes(ELIXIR), "B: シャイニングマジックだけがトラッシュにある")
    assert(totalCards(s, "p1") === before, "B: カードの総数は変わらない")
}

console.log("=== C. 規則3: 対象選択の待ちの間、使っているマジックは手札にもトラッシュにも無い ===")
{
    // シャイニングマジックのトラッシュ回収は候補2枚でも自動選択で待ちが立たないため、
    // 対象選択（相手スピリット2体）で待ちが立つパープルヘイズで規則3を確かめる
    const s = game("c-pending", "purple", [HAZ])
    const mine = put(s, "p1", VANILLA, 1)
    put(s, "p2", VANILLA, 2)
    put(s, "p2", VANILLA, 2)
    const before = totalCards(s, "p1")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "C: アタック宣言")
    for (let i = 0; i < 4 && s.isFlashTiming && s.priorityPlayer !== "p1"; i++) act(s, s.priorityPlayer, { type: "pass" })
    const err = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    assert(err === null, `C: パープルヘイズをフラッシュで使用（${err}）`)
    answerPayConfirm(s, "p1")
    assert(s.pendingChoice !== null, "C: 相手スピリット2体の対象選択の待ちが立つ")
    assert(!s.players.p1.hand.includes(HAZ), "C: 選択待ちの間、パープルヘイズは手札に無い")
    assert(!s.players.p1.trashCards.includes(HAZ), "C: 選択待ちの間、パープルヘイズはトラッシュにも無い")
    assert(totalCards(s, "p1") === before - 1, "C: 使用中の1枚はどこにも数えられていない")
    pump(s, {})
    assert(s.players.p1.trashCards.filter((c) => c === HAZ).length === 1, "C: 答えて解決し終えるとパープルヘイズはトラッシュにある")
    assert(totalCards(s, "p1") === before, "C: カードの総数は変わらない")
    assert(takeLifeAndResolve(s, "p2") === null, "C: ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== D. 規則5: パープルヘイズでコア1個のスピリットのコアを0にすると手札に戻る／コア2個ならトラッシュ ===")
{
    const s = game("d-haz-1core", "purple", [HAZ])
    const mine = put(s, "p1", VANILLA, 1)
    const foe = put(s, "p2", VANILLA, 1)
    const before1 = totalCards(s, "p1")
    const before2 = totalCards(s, "p2")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "D1: アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId }, "D1: パープルヘイズをフラッシュで使用（相手はコア1個）")
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId), "D1: コアが0個になった相手スピリットは場を離れる")
    assert(s.players.p2.reserve === 21, "D1: 相手のリザーブはコア1個増える")
    assert(s.players.p1.hand.filter((c) => c === HAZ).length === 1, "D1: パープルヘイズは手札に戻る")
    assert(!s.players.p1.trashCards.includes(HAZ), "D1: パープルヘイズはトラッシュに無い")
    assert(totalCards(s, "p1") === before1 && totalCards(s, "p2") === before2, "D1: カードの総数は変わらない（場を離れたスピリットはトラッシュへ）")
    assert(takeLifeAndResolve(s, "p2") === null, "D1: ライフで受けてバトルを終える")
    pump(s, {})
}
{
    const s = game("d-haz-2core", "purple", [HAZ])
    const mine = put(s, "p1", VANILLA, 1)
    const foe = put(s, "p2", VANILLA, 2)
    const before = totalCards(s, "p1")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "D2: アタック宣言")
    castFlash(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: foe.instanceId }, "D2: パープルヘイズをフラッシュで使用（相手はコア2個）")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === foe.instanceId) && foe.cores === 1, "D2: 相手スピリットはコア1個になって場に残る")
    assert(!s.players.p1.hand.includes(HAZ), "D2: パープルヘイズは手札に戻らない")
    assert(s.players.p1.trashCards.filter((c) => c === HAZ).length === 1, "D2: パープルヘイズはトラッシュにある")
    assert(totalCards(s, "p1") === before, "D2: カードの総数は変わらない")
    assert(takeLifeAndResolve(s, "p2") === null, "D2: ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== E. 規則4: 龍仙公主Lv2のアタック時、トラッシュの黄マジックを使うと解決後にトラッシュにある（1枚のまま） ===")
{
    const s = game("e-ryusen", "yellow", [])
    const ryusen = put(s, "p1", RYUSEN, 3) // Lv2
    s.players.p1.trashCards = [BOLT]
    const before = totalCards(s, "p1")
    const cost = effectiveCost(s, "p1", getCard(BOLT))
    const reserveBefore = s.players.p1.reserve
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: ryusen.instanceId }) === null, "E: 龍仙公主（Lv2）でアタック")
    pump(s, {})
    assert(s.players.p1.trashCards.filter((c) => c === BOLT).length === 1, "E: 使った黄マジックはトラッシュに1枚だけ（増えも減りもしない）")
    assert(!s.players.p1.hand.includes(BOLT), "E: 使った黄マジックは手札に無い")
    assert(s.players.p1.deck.length === 39, "E: フラッシュのドロー1でデッキは1枚減る")
    assert(s.players.p1.reserve === reserveBefore - cost, `E: 使用コスト（${cost}）をリザーブから支払った`)
    assert(totalCards(s, "p1") === before, "E: カードの総数は変わらない")
    assert(takeLifeAndResolve(s, "p2") === null, "E: ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== F. 規則4: ペリュトーン合体アタックでデッキ上の黄マジックを使うと、解決後にトラッシュにある ===")
{
    const s = game("f-pery", "red", [])
    s.players.p1.deck[0] = BOLT
    const host = createInstance(HOST, s.turn, 1)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance(PERY, s.turn, 0)
    s.players.p1.field.combinedBraves.push(brave)
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    const before = totalCards(s, "p1")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: host.instanceId }) === null, "F: 合体スピリットでアタック")
    pump(s, {})
    assert(s.players.p1.trashCards.filter((c) => c === BOLT).length === 1, "F: 使った黄マジックはトラッシュにある")
    assert(!s.players.p1.hand.includes(BOLT) && !s.players.p1.deck.includes(BOLT), "F: 使った黄マジックは手札にもデッキにも無い")
    assert(s.players.p1.deck.length === 38, "F: デッキはオープン1枚＋フラッシュのドロー1枚で2枚減る")
    assert(totalCards(s, "p1") === before, "F: カードの総数は変わらない")
    assert(takeLifeAndResolve(s, "p2") === null, "F: ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("=== G. 規則6: 鏡の回廊で無効にされたマジックもトラッシュに置かれる ===")
{
    const s = game("g-negate", "red", [])
    const mirror = createInstance(MIRROR, s.turn, 3) // Lv2
    s.players.p1.field.nexuses.push(mirror)
    const victim = put(s, "p1", GORADON, 1)
    const mine = put(s, "p1", VANILLA, 1)
    s.players.p2.hand = [CYCLONE]
    const before2 = totalCards(s, "p2")
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: mine.instanceId }) === null, "G: アタック宣言")
    castFlash(s, "p2", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: victim.instanceId }, "G: 相手がフレイムサイクロンをフラッシュで使用", { option: (p, o) => (p.includes("無効") ? (o.find((x) => x === "無効にする") ?? o[0]) : o[0]) })
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === victim.instanceId), "G: マジックの効果は無効になり、ゴラドンは破壊されない")
    assert(s.players.p2.trashCards.filter((c) => c === CYCLONE).length === 1, "G: 無効にされたマジックはトラッシュにある")
    assert(!s.players.p2.hand.includes(CYCLONE), "G: 無効にされたマジックは手札に無い")
    assert(totalCards(s, "p2") === before2, "G: カードの総数は変わらない")
    assert(takeLifeAndResolve(s, "p2") === null, "G: ライフで受けてバトルを終える")
    pump(s, {})
}

console.log("すべてのチェックに合格しました 🎉（part781）")
