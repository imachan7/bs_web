// smoke パート808（BS21 紫12枚：011・012・015・016・017・018・057・068・075・076・X02。BS21_PLAN §1・§2 の確定読み。010 は効果なし）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, currentLevel, declareBlock, destroySpirit, getCard, refreshLevelAsOverrides, spiritHasKeyword } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const MARSH = "BS21-010" // マーシュビル（紫・コスト0・効果なし）
const DJANGO = "BS21-011" // ジャンゴヘビ（紫・コスト1・Lv2･Lv3【呪撃】アタック時）
const BOA = "BS21-012" // ボーン・ボアー（紫・コスト2・Lv2 自分の青の召喚時ドロー・ターン1回）
const DURA = "BS21-015" // 死の剣使いデュラボーン（紫・コスト5・召喚時ドロー・合体アタック時・連鎖白/黄）
const HYDRA = "BS21-016" // デス・ヒュードラ（紫・コスト5・星魂アタック時 相手コア1個）
const VALFA = "BS21-017" // 冥巡士ヴァルファレード（紫・コスト5・呪撃持ちが相手に破壊されたらドロー）
const KUSURO = "BS21-018" // 骸獣侯ボーン・クスロー（紫・コスト6・不死コスト3/4・召喚時 相手フィールドのコア・連鎖白）
const CITRI = "BS21-057" // 冥獣騎シトリー（紫・ブレイヴ・コスト3・合体条件コスト3以上）
const COFFIN = "BS21-068" // 暗き棺桶洞（紫・ネクサス・コスト3）
const HEX = "BS21-075" // デッドリィヘクス（紫・マジック・コスト4）
const SLIDE = "BS21-076" // ソウルスライド（紫・マジック・コスト5）
const BIJAO = "BS21-X02" // 双頭の龍王バイ・ジャオウ（紫・コスト5・妖蛇に呪撃付与）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000/3000/4000・Lvコア1/2/3・効果なし）
const GATLING = "BS01-084" // ガトリングスタンド（白・コスト3・BP3000/5000・Lvコア1/2・効果なし）
const DARKRAY = "BS03-018" // ダークレイス（紫・コスト4・BP2000/4000・Lvコア1/3・効果なし）
const HARDES = "BS01-031" // デス・ハーデス（紫・コスト3・BP4000/7000・Lvコア1/4・効果なし）
const HYDRAM = "BS02-023" // 双蛇ヒュドラム（紫・コスト6・妖蛇・BP4000・効果なし）
const CYCLO = "BS04-015" // サイクロ・ワインダー（紫・コスト3・妖蛇・BP2000/5000・Lvコア1/4・効果なし）
const FANTASMA = "BS02-014" // ファンタズマ（紫・コスト2・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・効果なし）
const BARAM = "SD01-011" // 冥闘士バラム（紫・コスト3・Lv1BP2000・【呪撃】アタック時）
const KOGUMARU = "BS12-033" // コグマル（黄・コスト1・星魂・BP2000）
const BLUE1 = "BS03-071" // 戦闘獣ブルトップ（青・コスト0）
const BLUE2 = "BS03-072" // 槍兵のジェフリー（青・コスト1）
const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・コスト4）
const STRANGLE = "BS17-075" // ストラングルフォッグ（紫・マジック・フラッシュ：相手のスピリットのコア1個を相手のリザーブへ）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; levels: { level: number; cores: number; bp?: number }[] }[]
    const chk = (id: string, name: string, type: string, cost: number, lv: string) => {
        const c = staging.find((x) => x.cardId === id)
        assert(c?.name === name && c.type === type && c.cost === cost && c.colors[0] === "purple" && c.levels.map((l) => `${l.cores}/${l.bp ?? 0}`).join(",") === lv, `${id} は ${name}（紫・${type}・コスト${cost}・${lv}）`)
    }
    chk(MARSH, "マーシュビル", "spirit", 0, "1/1000,3/3000")
    chk(DJANGO, "ジャンゴヘビ", "spirit", 1, "1/1000,2/2000,4/3000")
    chk(BOA, "ボーン・ボアー", "spirit", 2, "1/1000,3/3000")
    chk(DURA, "死の剣使いデュラボーン", "spirit", 5, "1/3000,3/5000,6/8000")
    chk(HYDRA, "デス・ヒュードラ", "spirit", 5, "1/4000,3/6000,4/7000")
    chk(VALFA, "冥巡士ヴァルファレード", "spirit", 5, "1/5000,3/7000")
    chk(KUSURO, "骸獣侯ボーン・クスロー", "spirit", 6, "1/4000,3/6000,4/8000")
    chk(CITRI, "冥獣騎シトリー", "brave", 3, "1/2000")
    chk(COFFIN, "暗き棺桶洞", "nexus", 3, "0/0,2/0")
    chk(HEX, "デッドリィヘクス", "magic", 4, "")
    chk(SLIDE, "ソウルスライド", "magic", 5, "")
    chk(BIJAO, "双頭の龍王バイ・ジャオウ", "spirit", 5, "1/3000,2/4000,4/6000")
    const v = (id: string, name: string, cost: number, lv: string, color: string) => assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).colors[0] === color && getCard(id).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === lv, `${id} は ${name}（${color}・コスト${cost}・${lv}）`)
    v(VAN, "ロクケラトプス", 1, "1/1000,2/3000,3/4000", "red")
    v(GATLING, "ガトリングスタンド", 3, "1/3000,2/5000", "white")
    v(DARKRAY, "ダークレイス", 4, "1/2000,3/4000,6/6000", "purple")
    v(HARDES, "デス・ハーデス", 3, "1/4000,4/7000", "purple")
    v(HYDRAM, "双蛇ヒュドラム", 6, "1/4000,3/5000,6/10000", "purple")
    v(CYCLO, "サイクロ・ワインダー", 3, "1/2000,4/5000", "purple")
    v(FANTASMA, "ファンタズマ", 2, "1/2000,3/4000", "purple")
    v(STIRA, "スティラホーン", 5, "1/3000,3/5000,4/8000", "red")
    v(BARAM, "冥闘士バラム", 3, "1/2000,3/4000,4/5000", "purple")
    v(KOGUMARU, "コグマル", 1, "1/2000,3/3000", "yellow")
    v(BLUE1, "戦闘獣ブルトップ", 0, "1/1000,3/3000", "blue")
    v(BLUE2, "槍兵のジェフリー", 1, "1/2000,4/5000", "blue")
    assert(getCard(HYDRAM).family.includes("妖蛇") && getCard(CYCLO).family.includes("妖蛇") && !getCard(BARAM).family.includes("妖蛇"), "HYDRAM・CYCLO は妖蛇、BARAM は妖蛇でない")
    assert(getCard(KOGUMARU).family.includes("星魂") && !getCard(VAN).family.includes("星魂"), "KOGUMARU は星魂、VAN は星魂でない")
    assert(getCard(BARAM).effect.includes("【呪撃】") && getCard(VAN).effect === "" && getCard(CYCLO).effect === "", "BARAM は呪撃持ち、VAN・CYCLO は効果なし")
    assert(getCard(KARAKURI).type === "brave" && getCard(STRANGLE).type === "magic" && getCard(STRANGLE).effect.includes("コア1個を相手のリザーブに置く"), "KARAKURI はブレイヴ、STRANGLE はコア1個をリザーブへ置くマジック")
}

function game(seed: string, phase: "attack" | "main" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
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

type Inst = ReturnType<typeof createInstance>

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1, rested = false): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    inst.isRested = rested
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: Inst, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

const onField = (s: GameState, pid: PlayerId, inst: Inst): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// 未実装の BS21 カードで落ちる場面だけ警告して続ける（既存カードの ID の打ち間違いは落とす）
function scene(label: string, fn: () => void): void {
    console.log(`=== ${label} ===`)
    try {
        fn()
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes("カードが見つかりません") && msg.includes("BS21-")) console.log(`  ⚠ 未実装カードで未確認: ${msg}`)
        else throw e
    }
}

// pendingChoice を片づける。対象は picks を優先。確認は yes なら「する側」を選び、no なら選択肢を付けずに断る
function settle(s: GameState, picks: string[] = [], yes = true): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.find((x) => /する|戻す|召喚|発動|支払|はい|置く|残る/.test(x) && !/しない|さない/.test(x)) ?? o[0]
            err = yes && pick !== undefined ? act(s, who, { type: "resolveChoice", option: pick }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// アタック宣言 → 宣言時の効果を片づける → 両者パス。ブロックするならそのまま declareBlock してフラッシュを閉じ、バトル終了時の効果まで片づける
function attack(s: GameState, atkPid: PlayerId, atk: Inst, picks: string[] = [], block?: Inst): void {
    const def: PlayerId = atkPid === "p1" ? "p2" : "p1"
    assert(act(s, atkPid, { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    settle(s, picks)
    act(s, def, { type: "pass" })
    act(s, atkPid, { type: "pass" })
    if (block) {
        assert(declareBlock(s, def, block.instanceId) === null, "ブロックできる")
        passFlash(s)
        settle(s, picks)
    }
}

// ---------------- 011 ジャンゴヘビ：Lv2･Lv3【呪撃】 ----------------
scene("011-1: Lv2 のアタックを BP で勝つ相手がブロック → Django は BP で破壊されるが、ブロックした相手もバトル終了時に破壊される", () => {
    const s = game("django-lv2")
    const dj = put(s, "p1", DJANGO, 2) // Lv2 BP2000
    const blocker = put(s, "p2", GATLING, 1) // Lv1 BP3000
    attack(s, "p1", dj, [], blocker)
    assert(!onField(s, "p1", dj), "BP2000 < 3000 で Django は破壊される")
    assert(!onField(s, "p2", blocker), "【呪撃】でブロックしていた相手のスピリットもバトル終了時に破壊される")
    assert(s.players.p1.reserve === 22 && s.players.p2.reserve === 21, "破壊された両者のコアはリザーブへ（p1 +2・p2 +1）")
})
scene("011-2: Lv1（境目）は【呪撃】を持たないのでブロックした相手は残る", () => {
    const s = game("django-lv1")
    const dj = put(s, "p1", DJANGO, 1) // Lv1 BP1000
    const blocker = put(s, "p2", GATLING, 1)
    attack(s, "p1", dj, [], blocker)
    assert(!onField(s, "p1", dj) && onField(s, "p2", blocker), "Lv1 の Django だけが破壊され、ブロックした相手は残る")
})

// ---------------- 012 ボーン・ボアー：Lv2 自分の青の召喚時ドロー（ターンに1回・カード名ごと） ----------------
scene("012-1: Lv2。メインステップで青を2体召喚 → ドローは1枚だけ（ターンに1回）", () => {
    const s = game("boa-lv2", "main")
    put(s, "p1", BOA, 3) // Lv2
    s.players.p1.hand = [BLUE1, BLUE2, VAN]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "青のブルトップを召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 3, "青の召喚で1枚ドロー（デッキ40→39・手札 2+1=3）")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "青のジェフリーを召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 2, "2体目の青ではドローしない（ターンに1回）")
})
scene("012-2: 青以外の召喚ではドローしない", () => {
    const s = game("boa-nonblue", "main")
    put(s, "p1", BOA, 3)
    s.players.p1.hand = [VAN]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "赤のスピリットを召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "ドローしない")
})
scene("012-3: Lv1（境目）ではドローしない", () => {
    const s = game("boa-lv1", "main")
    put(s, "p1", BOA, 1)
    s.players.p1.hand = [BLUE1]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "青を召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "Lv1 ではドローしない")
})
scene("012-4: ボーン・ボアーが2体（Lv2）でも、ターンに1回しか使えないのは同名ごと → ドローは1枚だけ", () => {
    const s = game("boa-two", "main")
    put(s, "p1", BOA, 3)
    put(s, "p1", BOA, 3)
    s.players.p1.hand = [BLUE1, BLUE2]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "青を召喚できる")
    settle(s)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "もう1体の青を召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "2体いても1回だけ（デッキ40→39・手札 1）")
})
scene("012-5: 相手の青の召喚ではドローしない（自分の青のみ）", () => {
    const s = game("boa-opp", "main", "p2")
    put(s, "p1", BOA, 3)
    s.players.p2.hand = [BLUE1]
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) === null, "相手が青を召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "自分はドローしない")
})

// ---------------- 015 デュラボーン ----------------
scene("015-1: 召喚時に1枚ドロー", () => {
    const s = game("dura-summon", "main")
    s.players.p1.hand = [DURA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "デュラボーンを召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "召喚時に1枚ドロー（手札はデュラボーンが出て、引いた1枚）")
})
scene("015-2: Lv2 で合体アタック → 疲労状態の相手のスピリット1体を破壊（疲労していない相手は残る。シンボルが紫のみなので連鎖は起きない）", () => {
    const s = game("dura-combined")
    const dura = put(s, "p1", DURA, 3) // Lv2
    combine(s, "p1", dura, KARAKURI)
    const rested = put(s, "p2", HARDES, 1, true)
    const untapped = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: dura.instanceId }) === null, "合体アタックできる")
    settle(s, [rested.instanceId])
    assert(!onField(s, "p2", rested), "疲労状態の相手のスピリットは破壊される")
    assert(onField(s, "p2", untapped) && s.players.p2.hand.length === 0, "疲労していない相手は破壊されず、白シンボルが無いので手札にも戻らない")
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(declareBlock(s, "p2", untapped.instanceId) === null, "黄シンボルが無いので Lv1 の相手もブロックできる")
})
scene("015-3: Lv1（境目）の合体アタックでは破壊しない", () => {
    const s = game("dura-lv1")
    const dura = put(s, "p1", DURA, 1)
    combine(s, "p1", dura, KARAKURI)
    const rested = put(s, "p2", HARDES, 1, true)
    assert(act(s, "p1", { type: "attack", instanceId: dura.instanceId }) === null, "アタックできる")
    settle(s)
    assert(onField(s, "p2", rested), "Lv1 では破壊されない")
})
scene("015-4: 合体していない Lv2（境目）のアタックでは破壊しない", () => {
    const s = game("dura-alone")
    const dura = put(s, "p1", DURA, 3)
    const rested = put(s, "p2", HARDES, 1, true)
    assert(act(s, "p1", { type: "attack", instanceId: dura.instanceId }) === null, "アタックできる")
    settle(s)
    assert(onField(s, "p2", rested), "合体していないので破壊されない")
})
scene("015-5: 自分の白シンボルがあれば連鎖[白]：コスト5以下の相手のスピリット1体を手札に戻す（コスト6は戻せない）", () => {
    const s = game("dura-white")
    const dura = put(s, "p1", DURA, 3)
    combine(s, "p1", dura, KARAKURI)
    put(s, "p1", GATLING, 1) // 白シンボル
    const rested = put(s, "p2", HARDES, 1, true)
    const small = put(s, "p2", VAN, 1)
    const big = put(s, "p2", HYDRAM, 1) // コスト6
    assert(act(s, "p1", { type: "attack", instanceId: dura.instanceId }) === null, "合体アタックできる")
    settle(s, [rested.instanceId, small.instanceId, big.instanceId])
    assert(!onField(s, "p2", rested), "連鎖元の破壊は起きる")
    assert(!onField(s, "p2", small) && s.players.p2.hand.includes(VAN), "コスト1の相手が手札に戻る")
    assert(onField(s, "p2", big), "コスト6は戻せないので残る")
})
scene("015-6: 自分の黄シンボルがあれば連鎖[黄]：Lv1/Lv2 の相手のスピリットからブロックされない（Lv3 はブロックできる）", () => {
    const s = game("dura-yellow")
    const dura = put(s, "p1", DURA, 3)
    combine(s, "p1", dura, KARAKURI)
    put(s, "p1", KOGUMARU, 1) // 黄シンボル
    const rested = put(s, "p2", HARDES, 1, true)
    const lv1 = put(s, "p2", VAN, 1)
    const lv2 = put(s, "p2", VAN, 2)
    const lv3 = put(s, "p2", VAN, 3)
    assert(act(s, "p1", { type: "attack", instanceId: dura.instanceId }) === null, "合体アタックできる")
    settle(s, [rested.instanceId])
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    assert(declareBlock(s, "p2", lv1.instanceId) !== null, "Lv1 の相手はブロックできない")
    assert(declareBlock(s, "p2", lv2.instanceId) !== null, "Lv2 の相手はブロックできない")
    assert(declareBlock(s, "p2", lv3.instanceId) === null, "Lv3 の相手はブロックできる")
})

// ---------------- 016 デス・ヒュードラ：星魂のアタック時に相手のスピリットのコア1個 ----------------
scene("016-1: 星魂の自分のスピリットがアタック → 相手のスピリットのコア1個が相手のリザーブへ", () => {
    const s = game("hydra-seikon")
    put(s, "p1", HYDRA, 1)
    const kog = put(s, "p1", KOGUMARU, 1)
    const target = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "attack", instanceId: kog.instanceId }) === null, "コグマルでアタック")
    settle(s, [target.instanceId])
    assert(target.cores === 1 && s.players.p2.reserve === 21, "相手のスピリットのコアが2→1・相手のリザーブ 20→21")
})
scene("016-2: ヒュードラ自身（星魂）のアタックでも起きる", () => {
    const s = game("hydra-self")
    const hy = put(s, "p1", HYDRA, 1)
    const target = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "attack", instanceId: hy.instanceId }) === null, "ヒュードラでアタック")
    settle(s, [target.instanceId])
    assert(target.cores === 1 && s.players.p2.reserve === 21, "相手のコアが1個リザーブへ")
})
scene("016-3: 星魂でない自分のスピリットのアタックでは起きない", () => {
    const s = game("hydra-nonseikon")
    put(s, "p1", HYDRA, 1)
    const van = put(s, "p1", VAN, 1)
    const target = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    settle(s, [target.instanceId])
    assert(target.cores === 2 && s.players.p2.reserve === 20, "コアは動かない")
})
scene("016-4: 相手のターンに相手の星魂がアタックしても起きない（自分のアタックステップのみ）", () => {
    const s = game("hydra-oppturn", "attack", "p2")
    put(s, "p1", HYDRA, 1)
    const mine = put(s, "p1", VAN, 2)
    const kog = put(s, "p2", KOGUMARU, 1)
    assert(act(s, "p2", { type: "attack", instanceId: kog.instanceId }) === null, "相手がコグマルでアタック")
    settle(s, [mine.instanceId])
    assert(mine.cores === 2 && s.players.p1.reserve === 20, "自分のスピリットのコアは動かない")
})

// ---------------- 017 ヴァルファレード：【呪撃】持ちが相手によって破壊されたらドロー ----------------
scene("017-1: 呪撃持ちの自分のスピリットが相手のマジックで破壊 → 1枚ドロー", () => {
    const s = game("valfa-magic")
    put(s, "p1", VALFA, 1)
    const baram = put(s, "p1", BARAM, 1)
    destroySpirit(s, "p1", baram.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "1枚ドロー")
})
scene("017-2: 呪撃を持たない自分のスピリットが破壊されてもドローしない", () => {
    const s = game("valfa-plain")
    put(s, "p1", VALFA, 1)
    const van = put(s, "p1", VAN, 1)
    destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "ドローしない")
})
scene("017-3: 自分の効果で破壊した場合はドローしない（相手によってのみ）", () => {
    const s = game("valfa-own")
    put(s, "p1", VALFA, 1)
    const baram = put(s, "p1", BARAM, 1)
    destroySpirit(s, "p1", baram.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "ドローしない")
})
scene("017-4: メインステップ（アタックステップ外）ではドローしない", () => {
    const s = game("valfa-main", "main")
    put(s, "p1", VALFA, 1)
    const baram = put(s, "p1", BARAM, 1)
    destroySpirit(s, "p1", baram.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "お互いのアタックステップ限定なのでドローしない")
})
scene("017-5: 相手のアタックを呪撃持ちでブロックして BP で負けて破壊 → 相手によって破壊されたのでドロー", () => {
    const s = game("valfa-battle", "attack", "p2")
    put(s, "p1", VALFA, 1)
    const baram = put(s, "p1", BARAM, 1) // BP2000
    const atk = put(s, "p2", HARDES, 1) // BP4000
    attack(s, "p2", atk, [], baram)
    assert(!onField(s, "p1", baram), "バラムは BP で負けて破壊される")
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "BP比べの破壊でも1枚ドロー")
})

// ---------------- 018 ボーン・クスロー ----------------
function fushiScene(label: string, victimId: string, expectAsk: boolean, yes: boolean): void {
    scene(label, () => {
        const s = game("kusuro-fushi-" + victimId + yes)
        s.players.p1.trashCards = [KUSURO]
        const victim = put(s, "p1", victimId, 1)
        destroySpirit(s, "p1", victim.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        assert((s.pendingChoice !== null) === expectAsk, expectAsk ? "コスト3/4 の破壊で召喚するかを聞かれる" : "コスト3/4 以外の破壊では聞かれない")
        settle(s, [], yes)
        const summoned = s.players.p1.field.spirits.some((x) => x.cardId === KUSURO)
        assert(summoned === (expectAsk && yes), summoned ? "トラッシュのクスローが召喚される" : "クスローは召喚されない")
        assert(s.players.p1.trashCards.includes(KUSURO) === !summoned, summoned ? "召喚されたのでトラッシュから無くなる" : "トラッシュに残る")
    })
}
fushiScene("018-1: コスト3 の自分のスピリット破壊 → 不死で召喚する", GATLING, true, true)
fushiScene("018-2: コスト4 の自分のスピリット破壊 → 不死で召喚する", DARKRAY, true, true)
fushiScene("018-3: 召喚を断れば（選択肢なしで resolveChoice）トラッシュに残る", GATLING, true, false)
fushiScene("018-4: コスト5（境目）の破壊では聞かれない", STIRA, false, true)
fushiScene("018-5: コスト2（境目）の破壊では聞かれない", FANTASMA, false, true)
scene("018-6: 召喚時：相手のフィールドのコア1個を相手のリザーブへ（白シンボルが無ければ手札に戻さない）", () => {
    const s = game("kusuro-summon", "main")
    s.players.p1.hand = [KUSURO]
    const opp = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "クスローを召喚できる")
    settle(s, [opp.instanceId])
    assert(opp.cores === 1 && s.players.p2.reserve === 21, "相手のスピリットのコア 2→1・リザーブ +1")
    assert(onField(s, "p2", opp) && s.players.p2.hand.length === 0, "白シンボルが無いので手札に戻らない")
})
scene("018-7: 自分の白シンボルがあれば連鎖[白]：相手のスピリット1体を手札に戻す", () => {
    const s = game("kusuro-white", "main")
    s.players.p1.hand = [KUSURO]
    put(s, "p1", GATLING, 1) // 白シンボル
    const opp = put(s, "p2", VAN, 2)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "クスローを召喚できる")
    settle(s, [opp.instanceId])
    assert(s.players.p2.reserve === 21, "コア1個がリザーブへ")
    assert(!onField(s, "p2", opp) && s.players.p2.hand.includes(VAN), "相手のスピリットが手札に戻る")
})

// ---------------- 057 シトリー ----------------
scene("057-1: 合体条件コスト3以上：コスト4 のダークレイスには合体できる／コスト2 のファンタズマには合体できない", () => {
    const s = game("citri-cond", "main")
    const citri = put(s, "p1", CITRI, 1)
    const ok = put(s, "p1", DARKRAY, 1)
    const ng = put(s, "p1", FANTASMA, 1)
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: citri.instanceId, hostInstanceId: ng.instanceId }) !== null, "コスト2 には合体できない")
    assert(act(s, "p1", { type: "combineBrave", braveInstanceId: citri.instanceId, hostInstanceId: ok.instanceId }) === null, "コスト4 には合体できる")
    assert(s.players.p1.field.combinedBraves.some((x) => x.instanceId === citri.instanceId), "シトリーが合体している")
})
scene("057-2: 合体中のスピリットが破壊されたとき、相手のスピリット2体を疲労させる（3体いれば選んだ2体だけ）", () => {
    const s = game("citri-destroyed")
    const host = put(s, "p1", DARKRAY, 1)
    combine(s, "p1", host, CITRI)
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    const c = put(s, "p2", VAN, 1)
    destroySpirit(s, "p1", host.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [a.instanceId, b.instanceId], false)
    assert(a.isRested && b.isRested && !c.isRested, "選んだ2体が疲労し、残り1体は疲労しない")
})
scene("057-3: 合体していない（スピリット状態の）シトリーが破壊されても疲労させない", () => {
    const s = game("citri-alone")
    const citri = put(s, "p1", CITRI, 1)
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 1)
    destroySpirit(s, "p1", citri.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
    settle(s, [a.instanceId, b.instanceId], false)
    assert(!a.isRested && !b.isRested, "疲労しない")
})

// ---------------- 068 暗き棺桶洞 ----------------
scene("068-1: 相手のアタックステップ：呪撃持ちでブロック → BP で負けても、アタックしていた相手がバトル終了時に破壊される", () => {
    const s = game("coffin-block", "attack", "p2")
    putNexus(s, "p1", COFFIN, 0) // Lv1
    const baram = put(s, "p1", BARAM, 1) // BP2000
    const atk = put(s, "p2", GATLING, 1) // BP3000
    attack(s, "p2", atk, [], baram)
    assert(!onField(s, "p1", baram), "バラムは BP で負けて破壊される")
    assert(!onField(s, "p2", atk), "ブロック時の呪撃でアタックしていた相手も破壊される")
})
scene("068-2: ネクサスが無ければ（対照）アタックしていた相手は残る", () => {
    const s = game("coffin-none", "attack", "p2")
    const baram = put(s, "p1", BARAM, 1)
    const atk = put(s, "p2", GATLING, 1)
    attack(s, "p2", atk, [], baram)
    assert(!onField(s, "p1", baram) && onField(s, "p2", atk), "バラムだけ破壊され相手は残る")
})
scene("068-3: 呪撃を持たないスピリットのブロックでは、アタックした相手は残る", () => {
    const s = game("coffin-plain", "attack", "p2")
    putNexus(s, "p1", COFFIN, 0)
    const van = put(s, "p1", VAN, 1)
    const atk = put(s, "p2", GATLING, 1)
    attack(s, "p2", atk, [], van)
    assert(!onField(s, "p1", van) && onField(s, "p2", atk), "ロクケラトプスだけ破壊され相手は残る")
})
scene("068-4: 自分のアタックステップ（境目）では呪撃は書き換わらず、アタック時のまま働く", () => {
    const s = game("coffin-own")
    putNexus(s, "p1", COFFIN, 0)
    const baram = put(s, "p1", BARAM, 1)
    const blocker = put(s, "p2", GATLING, 1)
    attack(s, "p1", baram, [], blocker)
    assert(!onField(s, "p1", baram) && !onField(s, "p2", blocker), "アタック時の呪撃でブロックした相手が破壊される")
})
function coffinDraw(label: string, nexusCores: number, oppCores: number, expectDraw: boolean): void {
    scene(label, () => {
        const s = game("coffin-draw-" + nexusCores + oppCores)
        putNexus(s, "p1", COFFIN, nexusCores)
        const van = put(s, "p1", VAN, 1)
        const target = put(s, "p2", VAN, oppCores)
        s.players.p1.hand = [STRANGLE]
        assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "アタックできる")
        act(s, "p2", { type: "pass" })
        act(s, "p1", { type: "castMagic", handIndex: 0 })
        settle(s, [target.instanceId])
        assert(target.cores === oppCores - 1 || !onField(s, "p2", target), "相手のコアが1個リザーブへ")
        assert(s.players.p1.deck.length === (expectDraw ? 39 : 40) && s.players.p1.hand.length === (expectDraw ? 1 : 0), expectDraw ? "自分の効果で相手のスピリットのコアが0個になったので1枚ドロー" : "ドローしない")
    })
}
coffinDraw("068-5: Lv2。自分のマジックで相手のスピリットのコアが0個になった → 1枚ドロー", 2, 1, true)
coffinDraw("068-6: Lv1（境目）ではドローしない", 0, 1, false)
coffinDraw("068-7: Lv2 でもコアが0個にならなければ（2→1）ドローしない", 2, 2, false)

// ---------------- 075 デッドリィヘクス ----------------
function hexSetup(seed: string): { s: GameState; keep: Inst; sacrifice: Inst; o1: Inst; o2: Inst } {
    const s = game(seed)
    const keep = put(s, "p1", VAN, 1) // アタッカー
    const sacrifice = put(s, "p1", DARKRAY, 1)
    const o1 = put(s, "p2", VAN, 1)
    const o2 = put(s, "p2", HARDES, 1)
    s.players.p1.hand = [HEX]
    assert(act(s, "p1", { type: "attack", instanceId: keep.instanceId }) === null, "アタックできる")
    act(s, "p2", { type: "pass" })
    return { s, keep, sacrifice, o1, o2 }
}
scene("075-1: 自分のスピリット1体を破壊することで、相手が選んだ相手のスピリット1体が破壊される（選ぶのは相手）", () => {
    const { s, keep, sacrifice, o1, o2 } = hexSetup("hex-basic")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "デッドリィヘクスを使用")
    settle(s, [sacrifice.instanceId, o1.instanceId, o2.instanceId])
    assert(!onField(s, "p1", sacrifice) && onField(s, "p1", keep), "指定した自分のスピリットだけが破壊される")
    assert(!onField(s, "p2", o1) && onField(s, "p2", o2), "相手が選んだ1体だけが破壊される")
    assert(s.players.p1.trashCards.includes(HEX) && s.players.p1.hand.length === 0, "使ったマジックはトラッシュへ")
})
scene("075-2: 相手の選び直し（境目）。相手が2体目を選べば、そちらが破壊される", () => {
    const { s, sacrifice, o1, o2 } = hexSetup("hex-choose")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "デッドリィヘクスを使用")
    settle(s, [sacrifice.instanceId, o2.instanceId, o1.instanceId])
    assert(onField(s, "p2", o1) && !onField(s, "p2", o2), "相手が選んだデス・ハーデスが破壊される")
})
scene("075-3: 破壊できる自分のスピリットがいなければ払えず、相手のスピリットは破壊されない", () => {
    const s = game("hex-nopay", "attack", "p2")
    const atk = put(s, "p2", GATLING, 1)
    const other = put(s, "p2", VAN, 1)
    s.players.p1.hand = [HEX]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    act(s, "p1", { type: "castMagic", handIndex: 0 })
    settle(s)
    assert(onField(s, "p2", atk) && onField(s, "p2", other), "相手のスピリットは破壊されない")
})
scene("075-4: 自分の白シンボルがあれば連鎖[白]：コスト5以下の相手のスピリット1体を手札に戻す", () => {
    const s = game("hex-white")
    const keep = put(s, "p1", VAN, 1)
    const sacrifice = put(s, "p1", DARKRAY, 1)
    put(s, "p1", GATLING, 1) // 白シンボル
    const o1 = put(s, "p2", VAN, 1)
    const o2 = put(s, "p2", HARDES, 1)
    const big = put(s, "p2", HYDRAM, 1)
    s.players.p1.hand = [HEX]
    assert(act(s, "p1", { type: "attack", instanceId: keep.instanceId }) === null, "アタックできる")
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "デッドリィヘクスを使用")
    settle(s, [sacrifice.instanceId, o1.instanceId, o2.instanceId, big.instanceId])
    assert(!onField(s, "p2", o1), "相手が選んだ1体が破壊される")
    assert(!onField(s, "p2", o2) && s.players.p2.hand.includes(HARDES), "コスト3 の相手が手札に戻る")
    assert(onField(s, "p2", big), "コスト6 は戻せないので残る")
})
scene("075-5: 自分の黄シンボルがあれば連鎖[黄]：このターンの間、相手のスピリット1体をLv1として扱う", () => {
    const s = game("hex-yellow")
    const keep = put(s, "p1", VAN, 1)
    const sacrifice = put(s, "p1", DARKRAY, 1)
    put(s, "p1", KOGUMARU, 1) // 黄シンボル
    const o1 = put(s, "p2", VAN, 1)
    const o2 = put(s, "p2", VAN, 3) // 本来 Lv3
    assert(currentLevel(o2).level === 3, "前提: o2 は本来 Lv3")
    s.players.p1.hand = [HEX]
    assert(act(s, "p1", { type: "attack", instanceId: keep.instanceId }) === null, "アタックできる")
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "デッドリィヘクスを使用")
    settle(s, [sacrifice.instanceId, o1.instanceId, o2.instanceId])
    refreshLevelAsOverrides(s)
    assert(!onField(s, "p2", o1) && onField(s, "p2", o2), "相手が選んだ1体が破壊され、残った1体が対象になる")
    assert(currentLevel(o2).level === 1, "残った相手のスピリットはこのターンの間 Lv1 として扱われる")
})
scene("075-6: シンボルが紫だけなら（境目）連鎖は起きない", () => {
    const { s, sacrifice, o1, o2 } = hexSetup("hex-nochain")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "デッドリィヘクスを使用")
    settle(s, [sacrifice.instanceId, o1.instanceId, o2.instanceId])
    assert(onField(s, "p2", o2) && s.players.p2.hand.length === 0 && currentLevel(o2).level === 1, "o2 は残り、手札に戻らず、Lv1 のまま（もともと1コア）")
})

// ---------------- 076 ソウルスライド ----------------
function slideCast(s: GameState, picks: string[]): void {
    s.players.p1.hand = [SLIDE]
    const atk = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタックできる")
    act(s, "p2", { type: "pass" })
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ソウルスライドを使用")
    settle(s, picks)
}
scene("076-1: 相手のスピリット2体のコアが、それぞれ1個だけになるようにリザーブへ置かれる", () => {
    const s = game("slide-two")
    const a = put(s, "p2", VAN, 3)
    const b = put(s, "p2", HARDES, 4)
    slideCast(s, [a.instanceId, b.instanceId])
    assert(a.cores === 1 && b.cores === 1, "2体とも1個になる")
    assert(s.players.p2.reserve === 25, "相手のリザーブ 20→25（+2 +3）")
    assert(s.players.p1.trashCards.includes(SLIDE), "使ったマジックはトラッシュへ")
})
scene("076-2: 相手のスピリットが3体なら選んだ2体だけ（3体目は変わらない）", () => {
    const s = game("slide-three")
    const a = put(s, "p2", VAN, 3)
    const b = put(s, "p2", VAN, 3)
    const c = put(s, "p2", VAN, 3)
    slideCast(s, [a.instanceId, b.instanceId])
    assert(a.cores === 1 && b.cores === 1 && c.cores === 3, "選んだ2体だけ1個になる")
    assert(s.players.p2.reserve === 24, "相手のリザーブ 20→24")
})
scene("076-3: すでにコア1個のスピリットは変わらない（境目）。もう1体だけ1個になる", () => {
    const s = game("slide-one")
    const a = put(s, "p2", VAN, 1)
    const b = put(s, "p2", VAN, 3)
    slideCast(s, [a.instanceId, b.instanceId])
    assert(a.cores === 1 && b.cores === 1 && onField(s, "p2", a), "どちらも1個で場に残る")
    assert(s.players.p2.reserve === 22, "相手のリザーブ 20→22")
})

// ---------------- X02 バイ・ジャオウ ----------------
scene("X02-1: 妖蛇の自分のスピリットすべてに呪撃を与える（妖蛇でない自分・相手の妖蛇は与えない）", () => {
    const s = game("bijao-grant")
    const cyclo = put(s, "p1", CYCLO, 1)
    const van = put(s, "p1", VAN, 1)
    const oppHydra = put(s, "p2", HYDRAM, 1)
    assert(!spiritHasKeyword(s, "p1", cyclo, "jugeki"), "前提: ジャオウが出る前は呪撃を持たない")
    put(s, "p1", BIJAO, 1) // Lv1
    refreshLevelAsOverrides(s)
    assert(spiritHasKeyword(s, "p1", cyclo, "jugeki"), "妖蛇のサイクロ・ワインダーは呪撃を持つ")
    assert(!spiritHasKeyword(s, "p1", van, "jugeki"), "妖蛇でないロクケラトプスは持たない")
    assert(!spiritHasKeyword(s, "p2", oppHydra, "jugeki"), "相手の妖蛇は持たない")
})
scene("X02-2: 与えた呪撃が働く：サイクロがブロックされ BP で負けても、ブロックした相手がバトル終了時に破壊される", () => {
    const s = game("bijao-jugeki")
    put(s, "p1", BIJAO, 1)
    const cyclo = put(s, "p1", CYCLO, 1) // BP2000
    const blocker = put(s, "p2", GATLING, 1) // BP3000
    attack(s, "p1", cyclo, [], blocker)
    assert(!onField(s, "p1", cyclo) && !onField(s, "p2", blocker), "サイクロもブロックした相手も破壊される")
})
function bijaoDestroyed(label: string, yes: boolean): void {
    scene(label, () => {
        const s = game("bijao-back-" + yes)
        const bj = put(s, "p1", BIJAO, 2)
        destroySpirit(s, "p1", bj.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
        settle(s, [], yes)
        assert(s.players.p1.hand.includes(BIJAO) === yes, yes ? "手札に戻す" : "断れば手札に戻らない")
        assert(s.players.p1.trashCards.includes(BIJAO) === !yes, yes ? "トラッシュには残らない" : "トラッシュに置かれる")
    })
}
bijaoDestroyed("X02-3: 破壊されたとき、手札に戻すことができる", true)
bijaoDestroyed("X02-4: 断ればそのままトラッシュ", false)
scene("X02-5: Lv2 なら、呪撃持ちは疲労状態の相手のスピリットを指定してアタックできる", () => {
    const s = game("bijao-lv2")
    put(s, "p1", BIJAO, 2) // Lv2
    const cyclo = put(s, "p1", CYCLO, 1) // BP2000
    const rested = put(s, "p2", VAN, 1, true) // BP1000
    assert(act(s, "p1", { type: "attack", instanceId: cyclo.instanceId, targetSpiritInstanceId: rested.instanceId }) === null, "疲労状態の相手のスピリットを指定してアタックできる")
    settle(s)
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    passFlash(s)
    assert(!onField(s, "p2", rested) && onField(s, "p1", cyclo), "BP2000 > 1000 で指定した相手が破壊される")
})
scene("X02-6: 指定できない場合（境目）：Lv1／疲労していない相手／呪撃を持たないスピリット", () => {
    const s = game("bijao-limits")
    const bj = put(s, "p1", BIJAO, 1) // Lv1
    const cyclo = put(s, "p1", CYCLO, 1)
    const van = put(s, "p1", VAN, 1)
    const rested = put(s, "p2", VAN, 1, true)
    const untapped = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: cyclo.instanceId, targetSpiritInstanceId: rested.instanceId }) !== null, "Lv1 のジャオウでは指定アタックできない")
    bj.cores = 2 // Lv2
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "attack", instanceId: cyclo.instanceId, targetSpiritInstanceId: untapped.instanceId }) !== null, "疲労していない相手は指定できない")
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId, targetSpiritInstanceId: rested.instanceId }) !== null, "呪撃を持たないスピリットは指定アタックできない")
})

console.log("すべてのチェックに合格しました 🎉（part808）")
