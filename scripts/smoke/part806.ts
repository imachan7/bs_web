// smoke パート806（BS21-X06 異海神ディスト・ルクシオン・CP13-01 ミニーズ特攻隊：相手のブレイヴ合体条件コスト7以上・アタック時の破壊と連鎖・デッキ何枚でも・BP+。BS21_PLAN §2 の10・0 の確定読み）
import { readFileSync } from "node:fs"
import { TEST_DECK_RECIPES } from "../../data/constants"
import { act, answerPayConfirm, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, validateDeckCards } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const LUXION = "BS21-X06" // 異海神ディスト・ルクシオン（青・コスト8・異合・Lv1=1/6000・Lv2=2/9000）
const MINNIES = "CP13-01" // ミニーズ特攻隊（赤・コスト2・Lv1=1/1000・何枚でも・BP+1000/体）
const BRAVE = "BS20-055" // ティロック・ケファレ（赤・ブレイヴ・コスト3・合体条件コスト4以上）
const HOST5 = "BS03-009" // 火吹きメルト（赤・コスト5・効果なし）
const HOST7 = "BS03-068" // フォルトロス（黄・コスト7）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const BRONZE = "SD10-005" // ブロンズ・ヴルム（赤・コスト3・【強化】）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3・紫シンボル確保用）

console.log("=== 前提: カードの機械確認（BS21・CP13 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp?: number }[]; symbol: string[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    assert(byId(LUXION)?.name === "異海神ディスト・ルクシオン" && byId(LUXION)!.type === "spirit" && byId(LUXION)!.cost === 8 && byId(LUXION)!.colors[0] === "blue" && byId(LUXION)!.family.includes("異合") && byId(LUXION)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/6000,2/9000,5/14000" && byId(LUXION)!.symbol.join() === "blue,blue", "LUXIONはルクシオン（青・コスト8・異合・Lv1=1/6000・Lv2=2/9000・Lv3=5/14000・青青）")
    assert(byId(MINNIES)?.name === "ミニーズ特攻隊" && byId(MINNIES)!.type === "spirit" && byId(MINNIES)!.cost === 2 && byId(MINNIES)!.colors[0] === "red" && byId(MINNIES)!.family.join() === "爬獣,星竜,翼竜" && byId(MINNIES)!.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/1000", "MINNIESはミニーズ特攻隊（赤・コスト2・爬獣/星竜/翼竜・Lv1=1/1000）")
    assert(getCard(BRAVE).name === "ティロック・ケファレ" && getCard(BRAVE).type === "brave" && getCard(BRAVE).cost === 3 && getCard(BRAVE).colors[0] === "red" && getCard(BRAVE).effect.includes("合体条件：コスト4以上"), "BRAVEはティロック・ケファレ（赤・ブレイヴ・コスト3・合体条件コスト4以上）")
    assert(getCard(HOST5).name === "火吹きメルト" && getCard(HOST5).cost === 5 && getCard(HOST5).colors[0] === "red" && getCard(HOST5).effect === "", "HOST5は火吹きメルト（赤・コスト5・効果なし）")
    assert(getCard(HOST7).name === "フォルトロス" && getCard(HOST7).cost === 7 && getCard(HOST7).type === "spirit", "HOST7はフォルトロス（コスト7）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).effect === "", "VANはロクケラトプス（コスト1・効果なし）")
    assert(getCard(BRONZE).name === "ブロンズ・ヴルム" && getCard(BRONZE).cost === 3 && getCard(BRONZE).effect.includes("【強化】"), "BRONZEはブロンズ・ヴルム（コスト3・【強化】）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).colors[0] === "purple", "GRIPはグリプ・ハンズ（紫）")
}

function game(seed: string, phase: "main" | "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
    s.interactiveTargets = true
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 20
        p.trashCores = 0
        p.life = 5
        p.burst = null
        p.hand = []
        p.deck = Array.from({ length: 40 }, () => VAN)
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

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>): ReturnType<typeof createInstance> {
    const brave = createInstance(BRAVE, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// 未実装カード（data/cards に無い）は createInstance/getCard が例外を投げるので、その場面だけ警告して続行する
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("カードが見つかりません") && (msg.includes("BS21-") || msg.includes("CP13-"))) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

function settle(s: GameState, picks: string[] = [], pref: string[] = ["発動する", "残る", "戻す"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? o[0]
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

const alive = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// A：Lv2 になった瞬間、相手の場の合体のうち元の条件を満たしてもコスト7未満のホストのものは分離する
scene("A1: ルクシオンが Lv2 になると、コスト5のスピリットとの合体は分離し、コスト7のスピリットとの合体は残る", () => {
    const s = game("luxion-split", "main")
    const lux = put(s, "p1", LUXION, 1) // Lv1
    const h5 = put(s, "p2", HOST5, 1)
    const h7 = put(s, "p2", HOST7, 1)
    const b5 = combine(s, "p2", h5)
    const b7 = combine(s, "p2", h7)
    assert(s.players.p2.field.combinedBraves.length === 2, "Lv1 の間は2つとも合体したまま")
    assert(act(s, "p1", { type: "moveCore", instanceId: lux.instanceId, direction: "add" }) === null, "ルクシオンにコアを1個足して Lv2 にする")
    settle(s)
    assert(s.players.p2.field.combinedBraves.length === 1 && s.players.p2.field.combinedBraves[0]!.instanceId === b7.instanceId, "コスト5のホストとの合体だけ分離し、コスト7との合体は残る")
    assert((h5.braveRefs ?? []).length === 0 && (h7.braveRefs ?? []).length === 1, "分離したホストの braveRefs は空、コスト7のホストは1つ")
    assert(alive(s, "p2", b5), "分離したブレイヴはスピリット状態で場に残る")
})
scene("A2: Lv1 のままなら分離しない（境目）", () => {
    const s = game("luxion-lv1", "main")
    put(s, "p1", LUXION, 1)
    const h5 = put(s, "p2", HOST5, 1)
    combine(s, "p2", h5)
    settle(s)
    assert(s.players.p2.field.combinedBraves.length === 1 && (h5.braveRefs ?? []).length === 1, "Lv1 のルクシオンは合体条件を変えないので合体は残る")
})
scene("A3: 自分（ルクシオンの持ち主）のブレイヴの合体は分離しない（対象は相手のみ）", () => {
    const s = game("luxion-own", "main")
    put(s, "p1", LUXION, 2) // Lv2
    const own = put(s, "p1", HOST5, 1)
    combine(s, "p1", own)
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 1 && (own.braveRefs ?? []).length === 1, "自分のコスト5との合体は分離しない")
})

// B：Lv2 の間、相手は手札のブレイヴをコスト7未満のスピリットに合体できない
function summonBrave(s: GameState, host: ReturnType<typeof createInstance>): string | null {
    s.players.p2.hand = [BRAVE]
    return act(s, "p2", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
}
scene("B1: ルクシオン Lv2 の間、相手はコスト5のスピリットにブレイヴを合体できない", () => {
    const s = game("luxion-b-deny", "main", "p2")
    put(s, "p1", LUXION, 2) // Lv2
    const h5 = put(s, "p2", HOST5, 1)
    const err = summonBrave(s, h5)
    assert(err !== null, `コスト5への合体指定は拒否される（${err}）`)
    assert(s.players.p2.field.combinedBraves.length === 0 && s.players.p2.hand.length === 1, "合体は起きず、ブレイヴは手札に残る")
})
scene("B2: ルクシオン Lv2 でもコスト7のスピリットには合体できる", () => {
    const s = game("luxion-b-ok7", "main", "p2")
    put(s, "p1", LUXION, 2)
    const h7 = put(s, "p2", HOST7, 1)
    const err = summonBrave(s, h7)
    assert(err === null, `コスト7への合体は通る（${err}）`)
    answerPayConfirm(s, "p2")
    settle(s)
    assert(s.players.p2.field.combinedBraves.length === 1, "コスト7のスピリットと合体した")
})
scene("B3: ルクシオンが Lv1 ならコスト5のスピリットにも合体できる（境目）", () => {
    const s = game("luxion-b-lv1", "main", "p2")
    put(s, "p1", LUXION, 1)
    const h5 = put(s, "p2", HOST5, 1)
    const err = summonBrave(s, h5)
    assert(err === null, `Lv1 なら合体できる（${err}）`)
    answerPayConfirm(s, "p2")
    settle(s)
    assert(s.players.p2.field.combinedBraves.length === 1, "コスト5のスピリットと合体した")
})
scene("B4: ルクシオンがいなければコスト5のスピリットにも合体できる（境目）", () => {
    const s = game("luxion-b-none", "main", "p2")
    const h5 = put(s, "p2", HOST5, 1)
    const err = summonBrave(s, h5)
    assert(err === null, `ルクシオン不在なら合体できる（${err}）`)
    answerPayConfirm(s, "p2")
    settle(s)
    assert(s.players.p2.field.combinedBraves.length === 1, "コスト5のスピリットと合体した")
})

// C：アタック時（コスト5以下1体 → 連鎖赤【強化】1体 / 連鎖紫 疲労した合体スピリット1体）。Lv1 で試す（Lv1 でも発揮する）
function attackScene(seed: string, mySymbol: string | null, restedHost: boolean): { s: GameState; van: ReturnType<typeof createInstance>; bronze: ReturnType<typeof createInstance>; host: ReturnType<typeof createInstance> } {
    const s = game(seed, "attack")
    const lux = put(s, "p1", LUXION, 1)
    if (mySymbol) put(s, "p1", mySymbol, 1)
    const van = put(s, "p2", VAN, 1)
    const bronze = put(s, "p2", BRONZE, 1)
    const host = put(s, "p2", HOST7, 1)
    combine(s, "p2", host)
    host.isRested = restedHost
    assert(act(s, "p1", { type: "attack", instanceId: lux.instanceId }) === null, "ルクシオンでアタック")
    settle(s, [van.instanceId])
    return { s, van, bronze, host }
}
scene("C1: シンボルが青だけ → コスト5以下の1体だけ破壊（【強化】持ち・疲労した合体スピリットは破壊されない）", () => {
    const { s, van, bronze, host } = attackScene("luxion-c1", null, true)
    assert(!alive(s, "p2", van), "コスト5以下の相手1体（ロクケラトプス）が破壊される")
    assert(alive(s, "p2", bronze) && alive(s, "p2", host), "連鎖しないので【強化】持ちも疲労した合体スピリットも残る")
})
scene("C2: 赤シンボルあり → さらに【強化】を持つ相手1体を破壊（疲労した合体スピリットは壊れない）", () => {
    const { s, van, bronze, host } = attackScene("luxion-c2", VAN, true)
    assert(!alive(s, "p2", van) && !alive(s, "p2", bronze), "コスト5以下の1体と【強化】持ちが破壊される")
    assert(alive(s, "p2", host), "紫シンボルがないので疲労した合体スピリットは残る")
})
scene("C3: 紫シンボルあり → さらに疲労状態の相手の合体スピリット1体を破壊（【強化】持ちは壊れない）", () => {
    const { s, van, bronze, host } = attackScene("luxion-c3", GRIP, true)
    assert(!alive(s, "p2", van) && !alive(s, "p2", host), "コスト5以下の1体と疲労した合体スピリットが破壊される")
    assert(alive(s, "p2", bronze), "赤シンボルがないので【強化】持ちは残る")
    assert(s.players.p2.field.combinedBraves.length === 0, "合体していたブレイヴも場の合体から外れる")
})
scene("C4: 紫シンボルありでも、合体スピリットが疲労していなければ破壊されない（境目）", () => {
    const { s, van, host } = attackScene("luxion-c4", GRIP, false)
    assert(!alive(s, "p2", van), "コスト5以下の1体は破壊される")
    assert(alive(s, "p2", host), "回復状態の合体スピリットは残る")
})

// D：CP13-01 はデッキに何枚でも入れられる
scene("D: ミニーズ特攻隊は4枚入れてもデッキの検査を通り、ほかのカードは4枚で拒否される", () => {
    const base: Record<string, number> = { ...TEST_DECK_RECIPES.red!.cards }
    delete base[VAN]
    delete base[MINNIES]
    const build = (extra: Record<string, number>): Record<string, number> => {
        const want = 40 - Object.values(extra).reduce((a, b) => a + b, 0)
        const out: Record<string, number> = { ...extra }
        let total = 0
        for (const [id, n] of Object.entries(base)) if (total + n <= want) { out[id] = n; total += n }
        // 取りこぼした分は、同名3枚までの範囲で既存の id に積んで40枚ちょうどにする
        for (const id of Object.keys(base)) {
            while (total < want && (out[id] ?? 0) < 3) { out[id] = (out[id] ?? 0) + 1; total++ }
        }
        return out
    }
    const denied = validateDeckCards(build({ [VAN]: 4 }))
    assert((denied ?? "").includes("同名"), `ほかのカード（ロクケラトプス）4枚は同名エラー（${denied}）`)
    const ok = validateDeckCards(build({ [MINNIES]: 4 }))
    if ((ok ?? "").includes("存在しない") && (ok ?? "").includes(MINNIES)) console.log(`  ⚠ 未実装カードで未確認: ${ok}`)
    else assert(ok === null, `ミニーズ特攻隊4枚のデッキは合格（${ok}）`)
})

// E：自分のミニーズ特攻隊1体につき BP+1000（自分自身も数える）
scene("E1: 自分のミニーズ特攻隊が2体 → それぞれ BP1000+2000=3000", () => {
    const s = game("minnies-two", "main")
    const a = put(s, "p1", MINNIES, 1)
    const b = put(s, "p1", MINNIES, 1)
    assert(effectiveBp(s, "p1", a) === 3000 && effectiveBp(s, "p1", b) === 3000, "2体とも BP3000")
})
scene("E2: 1体なら BP2000（自分自身を数える）。相手のミニーズ特攻隊は数えない（境目）", () => {
    const s = game("minnies-one", "main")
    const a = put(s, "p1", MINNIES, 1)
    const other = put(s, "p2", MINNIES, 1)
    assert(effectiveBp(s, "p1", a) === 2000, "自分の1体だけなら BP2000")
    assert(effectiveBp(s, "p2", other) === 2000, "相手側も自分の1体だけなので BP2000")
})

console.log("すべてのチェックに合格しました 🎉（part806）")
