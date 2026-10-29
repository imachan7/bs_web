// smoke パート674（BP を上げる節・色を無いものとして扱う節の場面テスト。bpBuff・無色化を timedEffect へ統一する前後で挙動を固定する）
// 期待値は効果文だけから書いた。効果文に期間が書かれていない節（BS13-011・BS13-052・BS13-060 のBP）は期間を断定しない
import { assert, createGame, createInstance, effectiveBp, endTurn, getCard, handleAction, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameAction, GameState, PlayerId } from "./helpers"
import { instColors } from "../../shared/rules/level"
import { instanceSymbolColors } from "../../shared/rules/symbols"


const GOLADON = "BS01-001" // ゴラドン（赤・1コアBP1000）
const ROKU = "BS01-002" // ロクケラトプス（赤・1コアBP1000／2コアBP3000）
const AIBERN = "BS01-005" // アイバーン（赤・1コアBP2000）
const SHOCK = "BS01-054" // ショックイーター（緑・1コアBP3000）
const HARDES = "BS01-031" // デス・ハーデス（紫・1コアBP4000）
const GATLING = "BS01-084" // ガトリングスタンド（白・武装・1コアBP3000）
const HERC = "BS01-058" // ヘラクレス・ジオ（緑・5コアBP8000）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・1コアBP3000）
const KOUDOU = "BS10-X02" // 双魚賊神ピスケガレオン（紫・光導・1コアBP5000）
const SHINSEI = "BS10-008" // 火星神龍アレス・ドラグーン（赤・神星）

console.log("=== 前提: カードの機械確認 ===")
{
    const expect: [string, string][] = [
        ["BS03-131", "ユナイテッドパワー"], ["BS10-103", "グロウイングソード"], ["BS08-030", "機人フィアラル"], ["SD06-005", "ツインブレード・ドラゴン"],
        ["BS13-062", "光り輝く大銀河"], ["BS13-060", "トレス・ベルーガ"], ["BS14-X03", "風の覇王ドルクス・ウシワカ"], ["BS13-011", "暗殺者ドラゴナーガ"],
        ["BS13-015", "冥総裁ハーゲン"], ["BS13-052", "イビルグライダー"], ["BS15-064", "冥府へ続く魔門"], [GOLADON, "ゴラドン"], [ROKU, "ロクケラトプス"],
        [AIBERN, "アイバーン"], [SHOCK, "ショックイーター"], [HARDES, "デス・ハーデス"], [GATLING, "ガトリングスタンド"], [HERC, "ヘラクレス・ジオ"],
        [METAL, "メタルバーン"], [KOUDOU, "双魚賊神ピスケガレオン"], [SHINSEI, "火星神龍アレス・ドラグーン"],
    ]
    for (const [id, name] of expect) assert(getCard(id).name === name, `${id} は ${name}`)
    assert(getCard(KOUDOU).family?.includes("光導") === true && getCard(SHINSEI).family?.includes("神星") === true, "光導・神星の系統")
    assert(getCard(GATLING).family?.includes("武装") === true, "ガトリングスタンドは武装")
}

function game(seed: string, opts: { phase?: "main" | "attack"; turn?: PlayerId } = {}): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = opts.turn ?? "p1"
    s.priorityPlayer = s.turnPlayer
    s.phase = opts.phase ?? "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.life = 5
        p.reserve = 10
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => ROKU)
        p.field.spirits = []
        p.field.nexuses = []
        p.burst = null
        p.burstSet = false
    }
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false) {
    const inst = createInstance(cardId, 2, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, 2, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

const bp = (s: GameState, pid: PlayerId, inst: ReturnType<typeof put>) => effectiveBp(s, pid, inst)
const trashCores = (s: GameState, pid: PlayerId) => s.players[pid].trashCores

type Answer = { target?: string; option?: string; card?: number }
// 選択待ちに順に答える。target を指定したのに候補に無ければ失敗にして先頭を選ぶ。一致する選択肢が無い任意の確認は飛ばす
function drive(s: GameState, answers: Answer[] = [], tag = ""): string[] {
    const seen: string[] = []
    for (let i = 0; i < 12 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as any
        const want = answers.shift() ?? {}
        seen.push(`${pc.kind}:${pc.prompt}`)
        let action: GameAction = { type: "resolveChoice" }
        if (pc.kind === "target") {
            if (want.target !== undefined && !pc.candidates.includes(want.target)) assert(false, `${tag} 候補に ${want.target} が無い（${pc.candidates.join(",")}）`)
            action = { type: "resolveChoice", instanceId: want.target ?? pc.candidates[0] }
        } else if (pc.kind === "option") action = { type: "resolveChoice", option: want.option ?? pc.options?.[0] }
        else if (want.card !== undefined) action = { type: "resolveChoice", cardIndex: want.card }
        const err = handleAction(s, pc.pid, action)
        if (err) {
            assert(false, `${tag} 選択に答えられない: ${err}（${pc.prompt}）`)
            break
        }
    }
    if (process.env.DEBUG) console.log("   選択:", seen.join(" → "))
    return seen
}

function closeFlash(s: GameState): void {
    for (let i = 0; i < 8 && s.isFlashTiming && s.battle; i++) if (handleAction(s, s.priorityPlayer, { type: "pass" })) break
}

// アタックを宣言し、誘発の選択に答え、フラッシュ（効果の使用はここで）を返す。呼び出し側が closeFlash と takeLife で続ける
function declareAttack(s: GameState, pid: PlayerId, instanceId: string, answers: Answer[] = [], tag = ""): string | null {
    const err = handleAction(s, pid, { type: "attack", instanceId })
    if (err === null) drive(s, answers, tag)
    return err
}

function finishUnblocked(s: GameState, defender: PlayerId): void {
    closeFlash(s)
    if (s.pendingChoice) drive(s)
    handleAction(s, defender, { type: "takeLife" })
    drive(s)
}

console.log("=== BS03-131 ユナイテッドパワー：疲労させる自分のスピリットがいなければ使用できない ===")
{
    const s = game("uni3")
    put(s, "p1", AIBERN, 1, true)
    put(s, "p2", ROKU, 2)
    s.players.p1.hand = ["BS03-131"]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "疲労させる自分のスピリットがいなければ使用できない")
    assert(s.players.p1.hand.length === 1, "手札に残る")
}

console.log("=== BS08-030 機人フィアラル：自分自身も武装なので、ほかに武装がいなくても起動して自分を選べる（2026-10-29 ユーザー確認） ===")
{
    const s = game("fial-self")
    const f = put(s, "p1", "BS08-030", 2)
    put(s, "p1", ROKU, 2)
    put(s, "p2", GATLING, 1)
    const before = bp(s, "p1", f)
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: f.instanceId, effectId: "BS08-030-e2" }) === null, "起動できる")
    drive(s, [{ target: f.instanceId }], "fial-self")
    assert(f.isRested, "コストとして自分が疲労する")
    assert(bp(s, "p1", f) === before * 2, "自分自身に BP+(このスピリットのBP) が乗る")
}

console.log("=== SD06-005 ツインブレード・ドラゴン：バーストがなければ起動できない ===")
function myFlash(s: GameState, pid: PlayerId): void {
    for (let i = 0; i < 4 && s.priorityPlayer !== pid && s.isFlashTiming; i++) handleAction(s, s.priorityPlayer, { type: "pass" })
}
function twinGame(seed: string, cores: number, burst: boolean) {
    const s = game(seed, { phase: "attack" })
    const t = put(s, "p1", "SD06-005", cores)
    const atk = put(s, "p1", GOLADON, 1)
    const c = put(s, "p1", AIBERN, 1)
    if (burst) {
        s.players.p1.burst = "BS03-131"
        s.players.p1.burstSet = true
    }
    declareAttack(s, "p1", atk.instanceId, [], seed)
    myFlash(s, "p1")
    return { s, t, atk, c }
}
{
    const none = twinGame("twin3", 2, false)
    assert(handleAction(none.s, "p1", { type: "activateAbility", instanceId: none.t.instanceId, effectId: "SD06-005-e3" }) !== null, "バーストがなければ起動できない")
}

console.log("すべてのチェックに合格しました 🎉（part675）")
