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

console.log("=== BS03-131 ユナイテッドパワー（フラッシュ・疲労させたスピリットのBPぶん+） ===")
{
    const s = game("uni1")
    const a = put(s, "p1", AIBERN) // BP2000
    const b = put(s, "p1", GOLADON) // BP1000
    const z = put(s, "p2", ROKU, 2) // BP3000
    s.players.p1.hand = ["BS03-131"]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "ユナイテッドパワーを使用できる")
    drive(s, [{ target: a.instanceId }, { target: z.instanceId }], "uni1")
    assert(a.isRested && !b.isRested, "疲労させたのは選んだ自分のスピリットだけ")
    assert(bp(s, "p2", z) === 5000, "相手のスピリットでも+2000（疲労させたスピリットのBP）")
    assert(bp(s, "p1", a) === 2000 && bp(s, "p1", b) === 1000, "自分のスピリットのBPは変わらない")
    endTurn(s)
    assert(bp(s, "p2", z) === 3000, "ターンが終わると戻る")
}
{
    const s = game("uni2")
    const a = put(s, "p1", AIBERN)
    const b = put(s, "p1", GOLADON)
    s.players.p1.hand = ["BS03-131"]
    handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    drive(s, [{ target: b.instanceId }, { target: a.instanceId }], "uni2")
    assert(b.isRested && bp(s, "p1", a) === 3000, "疲労させたGOLADON(1000)のBPぶん、自分のアイバーンが+1000")
    const later = put(s, "p1", GOLADON)
    assert(bp(s, "p1", later) === 1000, "あとから出たスピリットには効かない（対象は1体）")
}
{
    const s = game("uni3")
    put(s, "p1", AIBERN, 1, true)
    put(s, "p2", ROKU, 2)
    s.players.p1.hand = ["BS03-131"]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "疲労させる自分のスピリットがいなければ使用できない")
    assert(s.players.p1.hand.length === 1, "手札に残る")
}

console.log("=== BS10-103 グロウイングソード（+3000 と、置いたコア1個につき同じスピリットを+1000） ===")
{
    const s = game("sword1")
    const a = put(s, "p1", AIBERN, 2)
    const b = put(s, "p1", GOLADON, 1)
    const z = put(s, "p2", ROKU, 2)
    s.players.p1.hand = ["BS10-103"]
    const t0 = trashCores(s, "p1")
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) === null, "グロウイングソードを使用できる")
    drive(s, [{ target: b.instanceId }, { option: "3" }], "sword1")
    assert(bp(s, "p1", b) === 1000 + 3000 + 3000, "選んだスピリットが+3000と、置いた3個ぶん+3000")
    assert(bp(s, "p1", a) === 2000 && bp(s, "p2", z) === 3000, "別のスピリットには乗らない")
    assert(trashCores(s, "p1") - t0 === 6, "マジックのコスト3と、置いた3個がトラッシュのコアへ")
    endTurn(s)
    assert(bp(s, "p1", b) === 1000, "ターンが終わると戻る")
}
{
    const s = game("sword2")
    const b = put(s, "p1", GOLADON, 1)
    s.players.p1.hand = ["BS10-103"]
    handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    drive(s, [{ option: "0" }], "sword2")
    assert(bp(s, "p1", b) === 1000 + 3000, "0個なら+3000だけ")
}
{
    const s = game("sword3")
    s.players.p1.reserve = 4 // コスト3を払うとリザーブは1個。置けるのはリザーブ1個＋スピリットの2個の計3個まで
    const b = put(s, "p1", GOLADON, 2)
    s.players.p1.hand = ["BS10-103"]
    handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" })
    const pc = s.pendingChoice as any
    assert(pc !== null && pc.kind === "option" && (pc.options as string[]).includes("3") && !(pc.options as string[]).includes("4"), "置けるコアの数（3）までしか選べない")
    drive(s, [{ option: "1" }], "sword3")
    assert(bp(s, "p1", b) === 1000 + 3000 + 1000, "1個置けば+1000")
}
{
    const s = game("sword4")
    put(s, "p2", ROKU, 2)
    s.players.p1.hand = ["BS10-103"]
    assert(handleAction(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash" }) !== null, "自分のスピリットがいなければ使用できない（不発のマジックは使えない）")
}

console.log("=== BS08-030 機人フィアラル（疲労してBP+自分のBP。武装1体） ===")
for (const [cores, own] of [[2, 4000], [4, 5000]] as const) {
    const s = game(`fial${cores}`)
    const f = put(s, "p1", "BS08-030", cores)
    const g = put(s, "p1", GATLING, 1) // 武装 BP3000
    const r = put(s, "p1", ROKU, 2) // 武装ではない
    const z = put(s, "p2", GATLING, 1) // 相手の武装
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: f.instanceId, effectId: "BS08-030-e2" }) === null, `Lv${cores === 2 ? 2 : 3}で起動できる`)
    const pc = s.pendingChoice as any
    if (pc) {
        assert(pc.candidates.includes(g.instanceId) && !pc.candidates.includes(r.instanceId) && !pc.candidates.includes(z.instanceId), "選べるのは系統「武装」の自分のスピリットだけ")
        drive(s, [{ target: g.instanceId }], `fial${cores}`)
    }
    assert(f.isRested, "自分は疲労する（コスト）")
    assert(bp(s, "p1", g) === 3000 + own, `武装のスピリットが自分のBP(${own})ぶん+`)
    assert(bp(s, "p1", r) === 3000 && bp(s, "p2", z) === 3000, "ほかのスピリットは変わらない")
    endTurn(s)
    assert(bp(s, "p1", g) === 3000, "ターンが終わると戻る")
}
{
    const s = game("fial-rested")
    const f = put(s, "p1", "BS08-030", 2, true)
    put(s, "p1", GATLING, 1)
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: f.instanceId, effectId: "BS08-030-e2" }) !== null, "すでに疲労していれば起動できない")
}
{
    // 自分自身も武装なので、ほかに武装がいなくても起動して自分を選べる（2026-10-29 ユーザー確認）
    const s = game("fial-self")
    const f = put(s, "p1", "BS08-030", 2)
    put(s, "p1", ROKU, 2)
    put(s, "p2", GATLING, 1)
    const before = bp(s, "p1", f)
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: f.instanceId, effectId: "BS08-030-e2" }) === null, "起動できる")
    drive(s, [{ target: f.instanceId }], "fial-self")
    assert(f.isRested && bp(s, "p1", f) === before * 2, "自分が疲労し、自分自身に BP+(このスピリットのBP) が乗る")
}

console.log("=== SD06-005 ツインブレード・ドラゴン（Lv2 フラッシュ・バーストを破棄してBP+5000） ===")
// 自分のアタックステップのフラッシュは、アタック宣言後（バトル中）の優先権で確かめる。アタッカーは別のスピリットにして、アタック時の効果を持ち込まない
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
    const { s, t, atk, c } = twinGame("twin1", 2, true)
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: t.instanceId, effectId: "SD06-005-e3" }) === null, "Lv2で自分のアタックステップに起動できる")
    drive(s, [{ target: c.instanceId }], "twin1")
    assert(s.players.p1.burst === null && s.players.p1.trashCards.includes("BS03-131"), "バーストが破棄されてトラッシュへ")
    assert(bp(s, "p1", c) === 2000 + 5000, "選んだ自分のスピリットが+5000")
    assert(bp(s, "p1", atk) === 1000 && bp(s, "p1", t) === 6000, "ほかのスピリットは変わらない")
    finishUnblocked(s, "p2")
    assert(bp(s, "p1", c) === 7000, "このターンの間は続く（バトルが終わっても戻らない）")
    endTurn(s)
    assert(bp(s, "p1", c) === 2000, "ターンが終わると戻る")
}
{
    const { s, t } = twinGame("twin2", 1, true)
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: t.instanceId, effectId: "SD06-005-e3" }) !== null, "Lv1では起動できない")
    const none = twinGame("twin3", 2, false)
    assert(handleAction(none.s, "p1", { type: "activateAbility", instanceId: none.t.instanceId, effectId: "SD06-005-e3" }) !== null, "バーストがなければ起動できない")
    const main = game("twin4", { phase: "main" })
    const t3 = put(main, "p1", "SD06-005", 2)
    main.players.p1.burst = "BS03-131"
    main.players.p1.burstSet = true
    assert(handleAction(main, "p1", { type: "activateAbility", instanceId: t3.instanceId, effectId: "SD06-005-e3" }) !== null, "メインステップでは起動できない")
    const opp = game("twin5", { phase: "attack", turn: "p2" })
    const t4 = put(opp, "p1", "SD06-005", 2)
    opp.players.p1.burst = "BS03-131"
    opp.players.p1.burstSet = true
    const atk = put(opp, "p2", GOLADON, 1)
    declareAttack(opp, "p2", atk.instanceId, [], "twin5")
    myFlash(opp, "p1")
    assert(handleAction(opp, "p1", { type: "activateAbility", instanceId: t4.instanceId, effectId: "SD06-005-e3" }) !== null, "相手のアタックステップでは起動できない")
}

console.log("=== BS13-062 光り輝く大銀河（Lv2 フラッシュ・このバトルの間+6000と赤のシンボル） ===")
{
    const s = game("galaxy1", { phase: "attack" })
    putNexus(s, "p1", "BS13-062", 2)
    const nex = s.players.p1.field.nexuses[0]!
    const a = put(s, "p1", SHOCK, 1) // 緑のシンボル1つ
    const b = put(s, "p1", GOLADON, 1)
    s.players.p1.hand = [KOUDOU, ROKU]
    assert(declareAttack(s, "p1", a.instanceId, [], "galaxy1") === null, "アタックできる")
    myFlash(s, "p1")
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: nex.instanceId, effectId: "BS13-062-e2" }) === null, "Lv2でバトル中に起動できる")
    const pc = s.pendingChoice as any
    if (pc?.kind === "target") assert(pc.candidates.includes(a.instanceId), "自分のスピリットを選べる")
    const idx = s.players.p1.hand.indexOf(KOUDOU)
    drive(s, [{ card: idx }, { target: a.instanceId }, { target: a.instanceId }], "galaxy1")
    assert(!s.players.p1.hand.includes(KOUDOU) && s.players.p1.trashCards.includes(KOUDOU), "光導のスピリットカードを破棄した")
    assert(bp(s, "p1", a) === 9000 && bp(s, "p1", b) === 1000, "選んだスピリットだけ+6000")
    assert(instanceSymbolColors(a).length === 2 && instanceSymbolColors(a).includes("red") && instanceSymbolColors(a).includes("green"), "赤のシンボルが1つ増える（緑+赤）")
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: nex.instanceId, effectId: "BS13-062-e2" }) !== null, "ターンに1回しか使えない")
    finishUnblocked(s, "p2")
    assert(bp(s, "p1", a) === 3000 && instanceSymbolColors(a).length === 1, "バトルが終わると戻る")
}
{
    const s = game("galaxy2", { phase: "attack" })
    const nex = putNexus(s, "p1", "BS13-062", 2)
    const a = put(s, "p1", SHOCK, 1)
    s.players.p1.hand = [ROKU, SHINSEI]
    declareAttack(s, "p1", a.instanceId)
    myFlash(s, "p1")
    const idx = s.players.p1.hand.indexOf(SHINSEI)
    assert(handleAction(s, "p1", { type: "activateAbility", instanceId: nex.instanceId, effectId: "BS13-062-e2" }) === null, "神星のスピリットカードでも払える")
    drive(s, [{ card: idx }], "galaxy2")
    assert(s.players.p1.trashCards.includes(SHINSEI) && bp(s, "p1", a) === 9000, "神星を破棄して+6000")
}
{
    const lv1 = game("galaxy3", { phase: "attack" })
    const n1 = putNexus(lv1, "p1", "BS13-062", 0)
    const a1 = put(lv1, "p1", SHOCK, 1)
    lv1.players.p1.hand = [KOUDOU]
    declareAttack(lv1, "p1", a1.instanceId)
    myFlash(lv1, "p1")
    assert(handleAction(lv1, "p1", { type: "activateAbility", instanceId: n1.instanceId, effectId: "BS13-062-e2" }) !== null, "Lv1では使えない")
    const none = game("galaxy4", { phase: "attack" })
    const n2 = putNexus(none, "p1", "BS13-062", 2)
    const a2 = put(none, "p1", SHOCK, 1)
    none.players.p1.hand = [ROKU]
    declareAttack(none, "p1", a2.instanceId)
    myFlash(none, "p1")
    assert(handleAction(none, "p1", { type: "activateAbility", instanceId: n2.instanceId, effectId: "BS13-062-e2" }) !== null, "手札に光導/神星のスピリットがなければ使えない")
}

console.log("=== BS13-060 トレス・ベルーガ（合体アタック時・6枚破棄でBP+6000、光導が置かれたら回復） ===")
function braveAttack(seed: string, deck: string[]): { s: GameState; host: ReturnType<typeof put> } {
    const s = game(seed)
    const host = put(s, "p1", KOUDOU, 1)
    const brave = put(s, "p1", "BS13-060", 1)
    s.players.p1.deck = deck
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, `${seed} 合体できる`)
    s.phase = "attack"
    return { s, host }
}
{
    const deck = Array.from({ length: 40 }, () => ROKU)
    deck[2] = KOUDOU
    deck[37] = KOUDOU
    const { s, host } = braveAttack("beluga1", deck)
    const base = bp(s, "p1", host)
    assert(declareAttack(s, "p1", host.instanceId, [], "beluga1") === null, "合体アタックできる")
    assert(s.players.p1.deck.length === 34, "デッキを上から6枚破棄")
    assert(bp(s, "p1", host) === base + 6000, "BP+6000")
    assert(host.isRested === false, "光導のスピリットカードが置かれたので回復する")
}
{
    const { s, host } = braveAttack("beluga2", Array.from({ length: 40 }, () => ROKU))
    const base = bp(s, "p1", host)
    declareAttack(s, "p1", host.instanceId, [], "beluga2")
    assert(s.players.p1.deck.length === 34 && bp(s, "p1", host) === base + 6000, "光導が無くても6枚破棄してBP+6000")
    assert(host.isRested === true, "光導のスピリットカードが置かれなかったので回復しない")
}
{
    const { s, host } = braveAttack("beluga3", Array.from({ length: 5 }, () => KOUDOU))
    const base = bp(s, "p1", host)
    declareAttack(s, "p1", host.instanceId, [], "beluga3")
    assert(s.players.p1.deck.length === 5 && bp(s, "p1", host) === base, "デッキが5枚しかなければ6枚破棄できないので発揮しない（破棄もBPも回復も無い）")
    assert(host.isRested === true, "回復もしない")
}

console.log("=== BS14-X03 風の覇王ドルクス・ウシワカ（バトル時・バトル終了時に手札へ戻してBP+3000） ===")
{
    const s = game("ushi1", { phase: "attack" })
    const u = put(s, "p1", "BS14-X03", 1)
    const ally = put(s, "p1", GOLADON, 1)
    declareAttack(s, "p1", u.instanceId, [], "ushi1")
    finishUnblocked(s, "p2")
    assert(s.players.p1.hand.includes("BS14-X03") && !s.players.p1.field.spirits.includes(u), "バトル終了時に手札へ戻る")
    assert(bp(s, "p1", ally) === 1000 + 3000, "自分のスピリット1体がこのターンの間+3000")
    endTurn(s)
    assert(bp(s, "p1", ally) === 1000, "ターンが終わると戻る")
}
{
    const s = game("ushi2", { phase: "attack" })
    const u = put(s, "p1", "BS14-X03", 1)
    declareAttack(s, "p1", u.instanceId, [], "ushi2")
    finishUnblocked(s, "p2")
    assert(s.players.p1.field.spirits.includes(u) && !s.players.p1.hand.includes("BS14-X03"), "BPを上げる自分のスピリットが他にいなければ、手札に戻す効果も発揮しない（ことで：両方解決できるときだけ）")
}
{
    const s = game("ushi3", { phase: "attack" })
    const u = put(s, "p1", "BS14-X03", 1)
    const ally = put(s, "p1", GOLADON, 1)
    const blocker = put(s, "p2", HERC, 5) // BP8000
    declareAttack(s, "p1", u.instanceId, [], "ushi3")
    closeFlash(s)
    assert(handleAction(s, "p2", { type: "block", instanceId: blocker.instanceId }) === null, "ブロックできる")
    drive(s)
    closeFlash(s)
    drive(s)
    assert(!s.players.p1.field.spirits.includes(u) && !s.players.p1.hand.includes("BS14-X03"), "破壊されたので手札には戻らない")
    assert(bp(s, "p1", ally) === 1000, "手札に戻せなかったのでBPも上がらない")
}
{
    const s = game("ushi4", { phase: "attack", turn: "p2" })
    const u = put(s, "p1", "BS14-X03", 3) // BP9000
    const ally = put(s, "p1", GOLADON, 1)
    const atk = put(s, "p2", ROKU, 2)
    declareAttack(s, "p2", atk.instanceId, [], "ushi4")
    closeFlash(s)
    assert(handleAction(s, "p1", { type: "block", instanceId: u.instanceId }) === null, "ブロックできる")
    drive(s)
    closeFlash(s)
    drive(s)
    assert(s.players.p1.hand.includes("BS14-X03"), "ブロック時にも同じ効果が使える：バトル終了時に手札へ戻る")
    assert(bp(s, "p1", ally) === 1000 + 3000, "自分のスピリットが+3000")
}

console.log("=== BS13-011 暗殺者ドラゴナーガ（Lv2 アタック時に色を無いものとして扱う） ===")
{
    const s = game("assa1", { phase: "attack" })
    const a = put(s, "p1", "BS13-011", 3) // Lv2
    assert(instColors(a).includes("purple"), "アタック前は紫")
    declareAttack(s, "p1", a.instanceId, [], "assa1")
    assert(instColors(a).length === 0, "アタック時に色が無くなる（Lv2）")
}
{
    const s = game("assa2", { phase: "attack" })
    const a = put(s, "p1", "BS13-011", 1) // Lv1
    declareAttack(s, "p1", a.instanceId, [], "assa2")
    assert(instColors(a).includes("purple"), "Lv1では色が残る")
}

console.log("=== BS13-015 冥総裁ハーゲン（Lv2・アタックしている呪撃/不死持ちの色を無いものとして扱う） ===")
for (const [cores, colorless] of [[4, true], [1, false]] as const) {
    const s = game(`hagen${cores}`, { phase: "attack" })
    put(s, "p1", "BS13-015", cores)
    const jugeki = put(s, "p1", "BS13-011", 1)
    const plain = put(s, "p1", ROKU, 2)
    assert(instColors(jugeki).includes("purple"), "アタック前は色がある")
    declareAttack(s, "p1", jugeki.instanceId, [], `hagen${cores}`)
    assert((instColors(jugeki).length === 0) === colorless, colorless ? "Lv2で呪撃持ちがアタックすると無色" : "Lv1では色が残る")
    assert(instColors(plain).includes("red"), "アタックしていないスピリットは色が残る")
    finishUnblocked(s, "p2")
    assert(instColors(jugeki).includes("purple"), "アタックが終われば色が戻る")
}
{
    const s = game("hagen-plain", { phase: "attack" })
    put(s, "p1", "BS13-015", 4)
    const plain = put(s, "p1", ROKU, 2)
    declareAttack(s, "p1", plain.instanceId, [], "hagen-plain")
    assert(instColors(plain).includes("red"), "呪撃/不死を持たないスピリットがアタックしても色は残る")
}

console.log("=== BS13-052 イビルグライダー（合体アタック時に色を無いものとして扱う） ===")
{
    const s = game("evil1")
    const host = put(s, "p1", METAL, 1) // コスト3
    const brave = put(s, "p1", "BS13-052", 1)
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null, "コスト3以上のスピリットに合体できる")
    assert(instColors(host).length > 0, "合体しただけでは色がある")
    s.phase = "attack"
    declareAttack(s, "p1", host.instanceId, [], "evil1")
    assert(instColors(host).length === 0, "合体アタック時に、合体スピリットの色が無くなる")
}

console.log("=== BS15-064 冥府へ続く魔門（紫のスピリットがアタックしたとき手札1枚を破棄で、そのバトルの間無色） ===")
{
    const s = game("gate1", { phase: "attack" })
    putNexus(s, "p1", "BS15-064", 1)
    const a = put(s, "p1", HARDES, 1)
    s.players.p1.hand = [GOLADON]
    declareAttack(s, "p1", a.instanceId, [{ option: "発動する" }], "gate1")
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.includes(GOLADON), "手札1枚を破棄した")
    assert(instColors(a).length === 0, "アタックした紫のスピリットが無色になる")
    finishUnblocked(s, "p2")
    assert(instColors(a).includes("purple"), "バトルが終わると色が戻る")
}
{
    const s = game("gate2", { phase: "attack" })
    putNexus(s, "p1", "BS15-064", 1)
    const a = put(s, "p1", ROKU, 2) // 赤
    s.players.p1.hand = [GOLADON]
    declareAttack(s, "p1", a.instanceId, [], "gate2")
    assert(s.players.p1.hand.length === 1 && instColors(a).includes("red"), "紫でないスピリットがアタックしても何も起きない")
}
{
    const s = game("gate3", { phase: "attack" })
    putNexus(s, "p1", "BS15-064", 1)
    const a = put(s, "p1", HARDES, 1)
    declareAttack(s, "p1", a.instanceId, [], "gate3")
    assert(instColors(a).includes("purple"), "手札が無ければ破棄できないので無色にならない")
}
{
    const s = game("gate4", { phase: "attack", turn: "p2" })
    putNexus(s, "p1", "BS15-064", 1)
    const a = put(s, "p2", HARDES, 1)
    s.players.p1.hand = [GOLADON]
    s.players.p2.hand = [GOLADON]
    declareAttack(s, "p2", a.instanceId, [], "gate4")
    assert(instColors(a).includes("purple") && s.players.p1.hand.length === 1 && s.players.p2.hand.length === 1, "相手のスピリットのアタックには効かない（自分の紫のスピリットのみ）")
}

console.log("すべてのチェックに合格しました 🎉（part674）")
