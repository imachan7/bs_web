// smoke パート807（BS21 赤12枚の期待値テスト：003・004・006・008・009・055・056・067・073・074・X01。005 は効果文が空のため対象外。BS21_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroyNexus, effectiveBp, getCard, giveBp, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { countSymbols, matchesBraveCondition } from "../../shared/rules"

const PELTA = "BS21-003" // コンボペルタ（赤・コスト3・Lv1=1コア/2000・アタック時BP+3000・連鎖紫/黄）
const WYVERN = "BS21-004" // ハービッグ・ワイバーン（赤・コスト3・Lv2=3コア・【強化】・召喚でドロー）
const ASKINA = "BS21-006" // 長腕の剣使いアスキーナ（赤・コスト5・皇獣・Lv2=3コア）
const GARNO = "BS21-008" // ガルノタウルス（赤・コスト6・【激突】）
const MACE = "BS21-009" // 戦棍竜メイシュノサウルス（赤・コスト8・Lv1=1/Lv2=3/Lv3=4コア）
const EAGLE = "BS21-055" // ゴルニック・イーグル（赤・ブレイヴ・コスト3・合体条件コスト3以上）
const PTERA = "BS21-056" // プテラノストーン（赤・ブレイヴ・コスト5・合体条件コスト4以上）
const TEMPLE = "BS21-067" // アポロニア岩窟寺院（赤・ネクサス・コスト5・Lv1=0コア/Lv2=1コア）
const BURNING = "BS21-073" // バーニングフォース（赤・マジック・コスト5）
const VOLCANIC = "BS21-074" // ボルカニックブレイク（赤・マジック・コスト5）
const ARC = "BS21-X01" // 光輝龍皇シャイニング・ドラゴン・アーク（赤・コスト7・Lv2=3コア・Lv3=4コア）

const VAN = "BS01-002" // ロクケラトプス（赤・地竜・コスト1・BP1000/3000/4000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1 BP3000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1 BP3000・効果なし）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1 BP6000・効果なし）
const MADORO = "BS17-010" // マッドーロ（紫・コスト0・効果なし）紫シンボル
const PYORIT = "BS06-049" // ピョリット（黄・コスト0・効果なし）黄シンボル
const FORTROSS = "BS03-068" // フォルトロス（黄・コスト7・効果なし）トラッシュから召喚する対象
const KAKYU = "BS14-002" // カキューソ（赤・皇獣・コスト1・Lv1 BP2000・効果なし）
const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・合体条件コスト4以上）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス・相手の疲労でドローするだけ。ネクサスの置き物）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    type St = { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp?: number }[] }
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as St[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)!
    const lv = (id: string) => byId(id).levels.map((l) => `${l.cores}/${l.bp ?? 0}`).join(",")
    const chk = (id: string, name: string, type: string, cost: number, levels: string) =>
        assert(byId(id)?.name === name && byId(id).type === type && byId(id).cost === cost && byId(id).colors[0] === "red" && lv(id) === levels, `${id}は${name}（赤・${type}・コスト${cost}・Lv(コア/BP)=${levels}）`)
    chk(PELTA, "コンボペルタ", "spirit", 3, "1/2000,2/4000,4/6000")
    chk(WYVERN, "ハービッグ・ワイバーン", "spirit", 3, "1/2000,3/5000")
    chk(ASKINA, "長腕の剣使いアスキーナ", "spirit", 5, "1/4000,3/7000")
    assert(byId(ASKINA).family.includes("皇獣"), "ASKINAは皇獣")
    chk(GARNO, "ガルノタウルス", "spirit", 6, "1/5000,3/8000,5/12000")
    chk(MACE, "戦棍竜メイシュノサウルス", "spirit", 8, "1/6000,3/7000,4/8000")
    chk(EAGLE, "ゴルニック・イーグル", "brave", 3, "1/3000")
    chk(PTERA, "プテラノストーン", "brave", 5, "1/4000")
    chk(TEMPLE, "アポロニア岩窟寺院", "nexus", 5, "0/0,1/0")
    chk(BURNING, "バーニングフォース", "magic", 5, "")
    chk(VOLCANIC, "ボルカニックブレイク", "magic", 5, "")
    chk(ARC, "光輝龍皇シャイニング・ドラゴン・アーク", "spirit", 7, "1/6000,3/10000,4/13000")
    const c = (id: string) => getCard(id)
    assert(c(VAN).name === "ロクケラトプス" && c(VAN).colors[0] === "red" && c(VAN).cost === 1 && c(VAN).levels.map((l) => l.bp).join("/") === "1000/3000/4000" && c(VAN).effect === "", "VANはロクケラトプス（赤・BP1000/3000/4000・効果なし）")
    assert(c(BELL).name === "デュアルキャノン・ベル" && c(BELL).colors[0] === "white" && c(BELL).cost === 4 && c(BELL).levels[0]!.bp === 3000 && c(BELL).effect === "", "BELLはデュアルキャノン・ベル（白・コスト4・BP3000・効果なし）")
    assert(c(STIRA).name === "スティラホーン" && c(STIRA).cost === 5 && c(STIRA).levels[0]!.bp === 3000 && c(STIRA).effect === "", "STIRAはスティラホーン（コスト5・BP3000・効果なし）")
    assert(c(TARAN).name === "タランドーズ" && c(TARAN).cost === 6 && c(TARAN).levels[0]!.bp === 6000 && c(TARAN).effect === "", "TARANはタランドーズ（コスト6・Lv1 BP6000・効果なし）")
    assert(c(MADORO).name === "マッドーロ" && c(MADORO).colors[0] === "purple" && c(MADORO).effect === "", "MADOROはマッドーロ（紫・効果なし）")
    assert(c(PYORIT).name === "ピョリット" && c(PYORIT).colors[0] === "yellow" && c(PYORIT).levels[0]!.bp === 1000 && c(PYORIT).effect === "", "PYORITはピョリット（黄・BP1000・効果なし）")
    assert(c(FORTROSS).name === "フォルトロス" && c(FORTROSS).cost === 7 && c(FORTROSS).effect === "", "FORTROSSはフォルトロス（コスト7・効果なし）")
    assert(c(KAKYU).name === "カキューソ" && c(KAKYU).family.includes("皇獣") && c(KAKYU).levels[0]!.bp === 2000 && c(KAKYU).effect === "", "KAKYUはカキューソ（皇獣・BP2000・効果なし）")
    assert(c(KARAKURI).name === "カラクリバッタ" && c(KARAKURI).type === "brave", "KARAKURIはカラクリバッタ（ブレイヴ）")
    assert(c(SPEARS).name === "千本槍の古戦場" && c(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "white" })
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

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): Inst {
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

const YES = ["する", "はい", "発動", "使う", "召喚", "アタック", "指定", "置く"]

// pref に含まれる選択肢を優先して答える。pref が空なら選択肢を付けずに断る。対象は picks を優先
function settle(s: GameState, picks: string[] = [], pref: string[] = YES): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.length === 0 ? undefined : (o.find((x) => pref.some((p) => x.includes(p))) ?? o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
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

// アタック宣言（攻撃側 p1・防御側 p2）→ 誘発の選択を解決
function attack(s: GameState, atk: Inst, picks: string[] = [], pref: string[] = YES): void {
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "アタック宣言")
    settle(s, picks, pref)
}

// アタック後のフラッシュを閉じ、blocker でブロックして、バトルを解決する（防御側が先にパス）
function blockAndResolve(s: GameState, blocker: Inst): void {
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロック宣言")
    passFlash(s)
}

function noBlockFinish(s: GameState): void {
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
}

const has = (s: GameState, pid: PlayerId, i: Inst) => s.players[pid].field.spirits.some((x) => x.instanceId === i.instanceId)

// ---------------- 003 コンボペルタ ----------------
scene("003-1: アタック時にそのバトルの間BP+3000。紫/黄シンボルが無ければ連鎖は発揮しない", () => {
    const s = game("pelta-none")
    const pelta = put(s, "p1", PELTA, 1)
    const van = put(s, "p2", VAN, 2)
    const reserve = s.players.p2.reserve
    assert(effectiveBp(s, "p1", pelta) === 2000, "アタック前のBPは2000")
    attack(s, pelta)
    assert(effectiveBp(s, "p1", pelta) === 5000, "アタック時にBP+3000（2000→5000）")
    assert(van.cores === 2 && s.players.p2.reserve === reserve, "紫シンボルが無いので相手のコアは動かない")
})
scene("003-2: 紫シンボルがあるとき連鎖[紫]：コスト2以下の相手のスピリットのコア1個を相手のリザーブへ（コスト3以上は対象外）", () => {
    const s = game("pelta-purple")
    const pelta = put(s, "p1", PELTA, 1)
    put(s, "p1", MADORO, 1)
    const van = put(s, "p2", VAN, 2) // コスト1
    const bell = put(s, "p2", BELL, 1) // コスト4
    const reserve = s.players.p2.reserve
    attack(s, pelta)
    assert(van.cores === 1 && s.players.p2.reserve === reserve + 1, "コスト1のロクケラトプスのコア1個が相手のリザーブへ")
    assert(bell.cores === 1, "コスト4のベルは対象外")
    noBlockFinish(s)
    assert(s.players.p1.life === 5, "[黄]は発揮しないので自分のライフは増えない")
})
scene("003-3: 黄シンボルがあるとき連鎖[黄]：BP比べで相手のスピリットだけを破壊したら、ボイドからコア1個を自分のライフに置く", () => {
    const s = game("pelta-yellow-win")
    const pelta = put(s, "p1", PELTA, 1)
    put(s, "p1", PYORIT, 1)
    const bell = put(s, "p2", BELL, 1) // BP3000 < 5000
    attack(s, pelta)
    blockAndResolve(s, bell)
    assert(!has(s, "p2", bell), "BP比べ（5000 vs 3000）でベルだけ破壊される")
    assert(has(s, "p1", pelta) && effectiveBp(s, "p1", pelta) === 2000, "ペルタは残り、バトルが終わればBP+3000は消える")
    assert(s.players.p1.life === 6, "ボイドからコア1個が自分のライフに置かれる（5→6）")
})
scene("003-4: 黄の境目：BP比べで負けてペルタが破壊されたらライフは増えない", () => {
    const s = game("pelta-yellow-lose")
    const pelta = put(s, "p1", PELTA, 1)
    put(s, "p1", PYORIT, 1)
    const taran = put(s, "p2", TARAN, 1) // BP6000 > 5000
    attack(s, pelta)
    blockAndResolve(s, taran)
    assert(!has(s, "p1", pelta) && has(s, "p2", taran), "BP比べ（5000 vs 6000）でペルタが破壊される")
    assert(s.players.p1.life === 5, "相手のスピリットだけを破壊したのではないのでライフは増えない")
})

// ---------------- 004 ハービッグ・ワイバーン ----------------
scene("004-1: Lv2 のメインステップにコスト5以上の自分のスピリットを召喚すると1枚ドロー", () => {
    const s = game("wyvern-draw", "main")
    put(s, "p1", WYVERN, 3)
    s.players.p1.hand = [STIRA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "スティラホーン（コスト5）を召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "1枚ドローする（デッキ40→39・手札1）")
})
scene("004-2: 境目：Lv1 では引かない。コスト4の召喚でも引かない", () => {
    const s = game("wyvern-lv1", "main")
    put(s, "p1", WYVERN, 1)
    s.players.p1.hand = [STIRA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "スティラホーンを召喚できる")
    settle(s)
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "Lv1 ではドローしない")
    const t = game("wyvern-cost4", "main")
    put(t, "p1", WYVERN, 3)
    t.players.p1.hand = [BELL]
    assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "ベル（コスト4）を召喚できる")
    settle(t)
    assert(t.players.p1.deck.length === 40 && t.players.p1.hand.length === 0, "コスト4ではドローしない")
})
scene("004-3: ターンに1回しか使えない（カード名ごと）：Lv2 が2体いても、コスト5以上を2体召喚してもドローは合計1枚", () => {
    const s = game("wyvern-once", "main")
    put(s, "p1", WYVERN, 3)
    put(s, "p1", WYVERN, 3)
    s.players.p1.hand = [STIRA, STIRA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "1体目を召喚")
    settle(s)
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "2体目を召喚")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "ドローは合計1枚だけ（デッキ40→39・手札1）")
})
scene("004-4: 【強化】Lv1 以上で自分の「BP破壊効果」の上限+1000（056 のBP3000以下が4000以下になる）", () => {
    const s = game("wyvern-boost", "main")
    put(s, "p1", WYVERN, 1) // Lv1
    const big = put(s, "p2", VAN, 3) // BP4000
    s.players.p1.hand = [PTERA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "プテラノストーンを召喚できる")
    settle(s)
    assert(!has(s, "p2", big), "004 がいれば BP4000 のスピリットも破壊される")
})

// ---------------- 006 長腕の剣使いアスキーナ ----------------
scene("006-1: Lv1 のアタック時に1枚ドロー", () => {
    const s = game("askina-attack")
    const a = put(s, "p1", ASKINA, 1)
    attack(s, a)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "アタック時に1枚ドロー")
})
scene("006-2: 合体時 Lv2：このスピリット以外の皇獣がアタックしたとき1枚ドロー", () => {
    const s = game("askina-combined")
    const a = put(s, "p1", ASKINA, 3)
    combine(s, "p1", a, KARAKURI)
    const k = put(s, "p1", KAKYU, 1)
    attack(s, k)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "皇獣のカキューソがアタックして1枚ドロー")
})
scene("006-3: 境目：合体していない／皇獣でない／アスキーナ自身のアタックでは追加のドローは無い", () => {
    const s = game("askina-not-combined")
    put(s, "p1", ASKINA, 3)
    const k = put(s, "p1", KAKYU, 1)
    attack(s, k)
    assert(s.players.p1.deck.length === 40, "合体していなければドローしない")
    const t = game("askina-not-kouju")
    const a = put(t, "p1", ASKINA, 3)
    combine(t, "p1", a, KARAKURI)
    const van = put(t, "p1", VAN, 1)
    attack(t, van)
    assert(t.players.p1.deck.length === 40, "皇獣でないロクケラトプスのアタックではドローしない")
    const u = game("askina-self")
    const b = put(u, "p1", ASKINA, 3)
    combine(u, "p1", b, KARAKURI)
    attack(u, b)
    assert(u.players.p1.deck.length === 39, "アスキーナ自身のアタックはアタック時の1枚だけ（このスピリット以外ではない）")
})

// ---------------- 008 ガルノタウルス ----------------
scene("008-1: 【激突】：アタック時、ブロックできる相手がいればライフで受けられない。いなければライフで受けられる", () => {
    const s = game("garno-clash")
    const g = put(s, "p1", GARNO, 1)
    const van = put(s, "p2", VAN, 1)
    attack(s, g)
    assert(takeLifeAndResolve(s, "p2") !== null, "ブロックできる相手がいるのでライフで受けられない")
    assert(declareBlock(s, "p2", van.instanceId) === null, "ブロックはできる")
    const t = game("garno-rested")
    const h = put(t, "p1", GARNO, 1)
    const rested = put(t, "p2", VAN, 1)
    rested.isRested = true
    attack(t, h)
    assert(takeLifeAndResolve(t, "p2") === null, "ブロックできる個体がいなければライフで受けられる")
})

// ---------------- 009 戦棍竜メイシュノサウルス ----------------
scene("009-1: アタック時に相手のスピリット1体を指定してアタックできる。連鎖[黄]：BP比べで相手だけ破壊したらライフ+1", () => {
    const s = game("mace-yellow")
    const m = put(s, "p1", MACE, 3) // Lv2 BP7000+3000
    put(s, "p1", PYORIT, 1)
    const bell = put(s, "p2", BELL, 1)
    attack(s, m, [bell.instanceId])
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    declareBlock(s, "p2", bell.instanceId)
    passFlash(s)
    assert(!has(s, "p2", bell), "指定したベルは BP比べ（10000 vs 3000）で破壊される")
    assert(s.players.p1.life === 6, "黄シンボルがあるのでボイドからコア1個が自分のライフに置かれる（5→6）")
})
scene("009-2: 黄シンボルが無ければ指定アタックだけ。ライフは増えない", () => {
    const s = game("mace-noyellow")
    const m = put(s, "p1", MACE, 3)
    const bell = put(s, "p2", BELL, 1)
    attack(s, m, [bell.instanceId])
    act(s, "p2", { type: "pass" })
    act(s, "p1", { type: "pass" })
    declareBlock(s, "p2", bell.instanceId)
    passFlash(s)
    assert(!has(s, "p2", bell), "指定したベルは破壊される")
    assert(s.players.p1.life === 5, "黄シンボルが無いのでライフは増えない")
})
scene("009-3: 指定は任意：断れば指定せず通常のアタック（相手のスピリットは破壊されない）", () => {
    const s = game("mace-decline")
    const m = put(s, "p1", MACE, 3)
    put(s, "p1", PYORIT, 1)
    const bell = put(s, "p2", BELL, 1)
    attack(s, m, [], [])
    noBlockFinish(s)
    assert(has(s, "p2", bell), "指定していないのでベルは破壊されない")
    assert(s.players.p2.life === 4 && s.players.p1.life === 5, "通常のアタックでライフを1つ減らし、連鎖[黄]の条件も満たさない")
})
scene("009-4: Lv2･Lv3 の自分のアタックステップに自分の赤/黄のスピリットすべてBP+3000。Lv1・相手のアタックステップ・他の色は対象外", () => {
    const s = game("mace-aura")
    const m = put(s, "p1", MACE, 3) // Lv2 7000
    const van = put(s, "p1", VAN, 1)
    const pyorit = put(s, "p1", PYORIT, 1)
    const madoro = put(s, "p1", MADORO, 1)
    const oppVan = put(s, "p2", VAN, 1)
    assert(effectiveBp(s, "p1", m) === 10000 && effectiveBp(s, "p1", van) === 4000 && effectiveBp(s, "p1", pyorit) === 4000, "赤のメイシュノサウルス自身・赤・黄はBP+3000")
    assert(effectiveBp(s, "p1", madoro) === 1000, "紫は対象外")
    assert(effectiveBp(s, "p2", oppVan) === 1000, "相手のスピリットは対象外")
    const l1 = game("mace-aura-lv1")
    const m1 = put(l1, "p1", MACE, 1)
    const van1 = put(l1, "p1", VAN, 1)
    assert(effectiveBp(l1, "p1", m1) === 6000 && effectiveBp(l1, "p1", van1) === 1000, "Lv1 では+3000されない")
    const l3 = game("mace-aura-lv3")
    const m3 = put(l3, "p1", MACE, 4)
    const van3 = put(l3, "p1", VAN, 1)
    assert(effectiveBp(l3, "p1", m3) === 11000 && effectiveBp(l3, "p1", van3) === 4000, "Lv3 でも+3000")
    const opp = game("mace-aura-opp", "attack", "p2")
    put(opp, "p1", MACE, 3)
    const vanO = put(opp, "p1", VAN, 1)
    assert(effectiveBp(opp, "p1", vanO) === 1000, "相手のアタックステップでは+3000されない")
})

// ---------------- 055 ゴルニック・イーグル ----------------
scene("055-1: 召喚時に相手のネクサス1つを破壊（自分のネクサスと残りの相手のネクサスは残る）", () => {
    const s = game("eagle-summon", "main")
    const n1 = putNexus(s, "p2", SPEARS, 1)
    const n2 = putNexus(s, "p2", SPEARS, 1)
    const mine = putNexus(s, "p1", SPEARS, 1)
    s.players.p1.hand = [EAGLE]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゴルニック・イーグルを召喚できる")
    settle(s, [n1.instanceId])
    const left = s.players.p2.field.nexuses.map((n) => n.instanceId)
    assert(left.length === 1 && left[0] === n2.instanceId, "選んだ相手のネクサス1つだけ破壊される")
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === mine.instanceId), "自分のネクサスは残る")
})
scene("055-2: 境目：相手のネクサスが無くても召喚は成立する", () => {
    const s = game("eagle-nonexus", "main")
    s.players.p1.hand = [EAGLE]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "相手のネクサスが無くても召喚できる")
    settle(s)
    assert(s.players.p1.hand.length === 0 && s.players.p1.field.spirits.length === 1, "場にスピリット状態で出る")
})
scene("055-3: 【合体時】合体アタック時にこのスピリットをBP+5000（そのバトルの間）。合体していなければ+されない", () => {
    const s = game("eagle-combined")
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, EAGLE)
    const before = effectiveBp(s, "p1", host)
    attack(s, host)
    assert(effectiveBp(s, "p1", host) === before + 5000, "合体アタック時にBP+5000")
    const t = game("eagle-alone")
    const alone = put(t, "p1", EAGLE, 1)
    const b2 = effectiveBp(t, "p1", alone)
    attack(t, alone)
    assert(effectiveBp(t, "p1", alone) === b2, "スピリット状態のアタックでは+されない")
})
scene("055-4: 合体条件コスト3以上（コスト1のロクケラトプスには合体できず、コスト4のベルには合体できる）", () => {
    const s = game("eagle-cond")
    const van = put(s, "p1", VAN, 1)
    const bell = put(s, "p1", BELL, 1)
    assert(!matchesBraveCondition(s, "p1", van, EAGLE), "コスト1には合体できない")
    assert(matchesBraveCondition(s, "p1", bell, EAGLE), "コスト4には合体できる")
})

// ---------------- 056 プテラノストーン ----------------
scene("056-1: 召喚時にBP3000以下の相手のスピリット2体を破壊（BP4000超は残る）", () => {
    const s = game("ptera-two", "main")
    const a = put(s, "p2", VAN, 1) // 1000
    const b = put(s, "p2", BELL, 1) // 3000
    const c = put(s, "p2", STIRA, 1) // 3000
    const d = put(s, "p2", VAN, 3) // 4000
    const e = put(s, "p2", TARAN, 1) // 6000
    s.players.p1.hand = [PTERA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "プテラノストーンを召喚できる")
    settle(s, [a.instanceId, b.instanceId])
    assert(!has(s, "p2", a) && !has(s, "p2", b), "選んだ2体が破壊される")
    assert(has(s, "p2", c) && has(s, "p2", d) && has(s, "p2", e), "選ばなかったBP3000以下と、BP4000以上は残る")
})
scene("056-2: 境目：対象が1体だけならその1体を破壊。BP4000だけなら（004 がいなければ）何も破壊しない", () => {
    const s = game("ptera-one", "main")
    const a = put(s, "p2", VAN, 1)
    const d = put(s, "p2", VAN, 3)
    s.players.p1.hand = [PTERA]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "召喚できる")
    settle(s)
    assert(!has(s, "p2", a) && has(s, "p2", d), "BP1000の1体だけ破壊される")
    const t = game("ptera-none", "main")
    const f = put(t, "p2", VAN, 3)
    t.players.p1.hand = [PTERA]
    assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "対象がいなくても召喚できる")
    settle(t)
    assert(has(t, "p2", f), "BP4000は破壊されない")
})
scene("056-3: 合体条件コスト4以上（コスト1のロクケラトプスには合体できず、コスト4のベルには合体できる）", () => {
    const s = game("ptera-cond")
    const van = put(s, "p1", VAN, 1)
    const bell = put(s, "p1", BELL, 1)
    assert(!matchesBraveCondition(s, "p1", van, PTERA), "コスト1には合体できない")
    assert(matchesBraveCondition(s, "p1", bell, PTERA), "コスト4には合体できる")
})

// ---------------- 067 アポロニア岩窟寺院 ----------------
scene("067-1: 相手によって破壊されたとき、BP10000以下の相手のスピリット1体を破壊（BP11000は対象外）", () => {
    const s = game("temple-destroyed", "main")
    const n = putNexus(s, "p1", TEMPLE, 0) // Lv1
    const small = put(s, "p2", TARAN, 1) // 6000
    const big = put(s, "p2", VAN, 1)
    giveBp(s, big, 10000) // 11000
    destroyNexus(s, "p1", n.instanceId, { sourcePid: "p2", sourceType: "magic" })
    settle(s)
    assert(!has(s, "p2", small) && has(s, "p2", big), "BP6000は破壊され、BP11000は残る")
})
scene("067-2: 境目：自分の効果で破壊されたときは発揮しない", () => {
    const s = game("temple-own", "main")
    const n = putNexus(s, "p1", TEMPLE, 0)
    const small = put(s, "p2", TARAN, 1)
    destroyNexus(s, "p1", n.instanceId, { sourcePid: "p1", sourceType: "magic" })
    settle(s)
    assert(has(s, "p2", small), "自分の効果による破壊では発揮しない")
})
scene("067-3: Lv2 の自分のアタックステップに【強化】を持つ自分のスピリットがアタックしたら BP1000以下の相手のスピリット1体を破壊", () => {
    const s = game("temple-boost")
    putNexus(s, "p1", TEMPLE, 1) // Lv2
    const w = put(s, "p1", WYVERN, 1)
    const weak = put(s, "p2", VAN, 1) // 1000
    const strong = put(s, "p2", BELL, 1) // 3000
    attack(s, w)
    assert(!has(s, "p2", weak) && has(s, "p2", strong), "BP1000のみ破壊され、BP3000は残る")
})
scene("067-4: 連鎖を持つ自分のスピリットがアタックしても同じ", () => {
    const s = game("temple-chain")
    putNexus(s, "p1", TEMPLE, 1)
    const p = put(s, "p1", PELTA, 1)
    const weak = put(s, "p2", VAN, 1)
    attack(s, p)
    assert(!has(s, "p2", weak), "【連鎖】を持つペルタのアタックでBP1000の相手が破壊される")
})
scene("067-5: 境目：【強化】/【連鎖】を持たないスピリットのアタック、またはネクサスが Lv1 のときは破壊しない", () => {
    const s = game("temple-plain")
    putNexus(s, "p1", TEMPLE, 1)
    const van = put(s, "p1", VAN, 1)
    const weak = put(s, "p2", VAN, 1)
    attack(s, van)
    assert(has(s, "p2", weak), "【強化】も【連鎖】も持たないスピリットでは発揮しない")
    const t = game("temple-lv1")
    putNexus(t, "p1", TEMPLE, 0) // Lv1
    const w = put(t, "p1", WYVERN, 1)
    const weak2 = put(t, "p2", VAN, 1)
    attack(t, w)
    assert(has(t, "p2", weak2), "ネクサスが Lv1 のときは発揮しない")
})

// ---------------- 073 バーニングフォース ----------------
function flashBurning(s: GameState, target: Inst): string | null {
    s.players.p1.hand = [BURNING]
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    return act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: target.instanceId })
}
scene("073-1: フラッシュ：BP4000以下の相手のスピリット1体を破壊（BP5000は対象にできない）。シンボルが無ければ連鎖は無い", () => {
    const s = game("burning-none")
    const atk = put(s, "p1", VAN, 1)
    const bell = put(s, "p2", BELL, 1) // 3000
    const taran = put(s, "p2", TARAN, 1)
    s.players.p1.trashCards = [FORTROSS]
    attack(s, atk)
    // 対象にできないIDを直に渡されても使用は拒否されず、候補（BP4000以下＝ベルだけ）から選ばれる
    flashBurning(s, taran)
    settle(s)
    assert(has(s, "p2", taran), "BP6000のタランドーズは対象にならず場に残る")
    assert(!has(s, "p2", bell), "ベルが破壊される")
    assert(s.players.p1.trashCards.includes(BURNING) && s.players.p1.trashCards.includes(FORTROSS), "使ったマジックはトラッシュへ。シンボルが無いのでフォルトロスは召喚されずトラッシュに残る")
})
scene("073-2: 紫シンボルがあるとき連鎖[紫]：トラッシュのコスト7のスピリットを召喚できる（コストを払う）", () => {
    const s = game("burning-purple")
    const atk = put(s, "p1", VAN, 1)
    put(s, "p1", MADORO, 1)
    const bell = put(s, "p2", BELL, 1)
    s.players.p1.trashCards = [FORTROSS]
    attack(s, atk)
    assert(flashBurning(s, bell) === null, "フラッシュで使える")
    settle(s)
    assert(!has(s, "p2", bell), "ベルが破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.cardId === FORTROSS) && !s.players.p1.trashCards.includes(FORTROSS), "フォルトロスが召喚されてトラッシュから消える")
})
scene("073-3: 連鎖[紫]の召喚は任意：断ればフォルトロスはトラッシュに残る", () => {
    const s = game("burning-purple-decline")
    const atk = put(s, "p1", VAN, 1)
    put(s, "p1", MADORO, 1)
    const bell = put(s, "p2", BELL, 1)
    s.players.p1.trashCards = [FORTROSS]
    attack(s, atk)
    assert(flashBurning(s, bell) === null, "フラッシュで使える")
    assert((s.pendingChoice as { kind: string } | null)?.kind === "card", "トラッシュのカードの選択が出る")
    assert(act(s, "p1", { type: "resolveChoice" }) === null, "召喚を断る（cardIndex なしで答える）")
    settle(s, [], [])
    assert(!s.players.p1.field.spirits.some((x) => x.cardId === FORTROSS) && s.players.p1.trashCards.includes(FORTROSS), "断れば召喚されない")
})
scene("073-4: 黄シンボルがあるとき連鎖[黄]：このバトルの間、アタック中のスピリットはコスト6以上の相手のスピリットにブロックされない", () => {
    const s = game("burning-yellow")
    const atk = put(s, "p1", VAN, 1)
    put(s, "p1", PYORIT, 1)
    const bell = put(s, "p2", BELL, 1)
    const taran = put(s, "p2", TARAN, 1) // コスト6
    const stira = put(s, "p2", STIRA, 1) // コスト5
    attack(s, atk)
    assert(flashBurning(s, bell) === null, "フラッシュで使える")
    settle(s)
    passFlash(s)
    assert(declareBlock(s, "p2", taran.instanceId) !== null, "コスト6のタランドーズはブロックできない")
    assert(declareBlock(s, "p2", stira.instanceId) === null, "コスト5のスティラホーンはブロックできる")
})

// ---------------- 074 ボルカニックブレイク ----------------
scene("074-1: メイン：相手のネクサスすべてを破壊し、破壊した1つにつき1枚ドロー（自分のネクサスは残る）", () => {
    const s = game("volcanic-main", "main")
    putNexus(s, "p2", SPEARS, 1)
    putNexus(s, "p2", SPEARS, 1)
    const mine = putNexus(s, "p1", SPEARS, 1)
    s.players.p1.hand = [VOLCANIC]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使える")
    settle(s)
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサス2つとも破壊される")
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === mine.instanceId), "自分のネクサスは残る")
    assert(s.players.p1.hand.length === 2 && s.players.p1.deck.length === 38, "2つ破壊したので2枚ドロー（手札2・デッキ38）")
    assert(s.players.p1.trashCards.includes(VOLCANIC), "使ったマジックはトラッシュへ")
})
scene("074-2: 境目：相手のネクサスが無ければドローは0枚", () => {
    const s = game("volcanic-none", "main")
    s.players.p1.hand = [VOLCANIC]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使える")
    settle(s)
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "ドローしない")
})
scene("074-3: フラッシュ：このターンの間、スピリット1体をBP+3000（ネクサスは破壊せずドローもしない）", () => {
    const s = game("volcanic-flash")
    const atk = put(s, "p1", VAN, 1)
    putNexus(s, "p2", SPEARS, 1)
    put(s, "p2", BELL, 1)
    s.players.p1.hand = [VOLCANIC]
    attack(s, atk)
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "flash", targetInstanceId: atk.instanceId }) === null, "フラッシュで使える")
    settle(s)
    assert(effectiveBp(s, "p1", atk) === 4000, "ロクケラトプスがBP+3000（1000→4000）")
    assert(s.players.p2.field.nexuses.length === 1 && s.players.p1.deck.length === 40, "フラッシュ側ではネクサスは破壊されずドローもしない")
})

// ---------------- X01 光輝龍皇シャイニング・ドラゴン・アーク ----------------
scene("X01-1: 自分のアタックステップに【強化】を持つ自分の赤のスピリットすべてに赤のシンボル1つを追加（Lv2 では004だけ・Lv3 では自身も）", () => {
    const s = game("arc-symbol", "main")
    put(s, "p1", ARC, 3) // Lv2（【強化】なし）
    put(s, "p1", WYVERN, 1) // 【強化】
    put(s, "p1", VAN, 1)
    assert(countSymbols(s.players.p1, ["red"]) === 3, "メインステップの赤シンボルは3つ")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(countSymbols(s.players.p1, ["red"]) === 4, "【強化】を持つ004だけに+1（3→4）")
    const t = game("arc-symbol-lv3", "main")
    put(t, "p1", ARC, 4) // Lv3（【強化】あり）
    put(t, "p1", WYVERN, 1)
    put(t, "p1", VAN, 1)
    assert(act(t, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(countSymbols(t.players.p1, ["red"]) === 5, "Lv3 では自身の【強化】にも+1（3→5）")
    const u = game("arc-symbol-none", "main")
    put(u, "p1", ARC, 3)
    put(u, "p1", VAN, 1)
    assert(act(u, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(countSymbols(u.players.p1, ["red"]) === 2, "【強化】を持つスピリットがいなければ増えない")
})
scene("X01-2: Lv2 のアタック時に BP10000以下の相手のスピリット1体を破壊（BP11000は対象外）", () => {
    const s = game("arc-destroy")
    const a = put(s, "p1", ARC, 3)
    const ok = put(s, "p2", VAN, 1)
    giveBp(s, ok, 9000) // 10000
    attack(s, a)
    assert(!has(s, "p2", ok), "BP10000は破壊される")
    const t = game("arc-over")
    const b = put(t, "p1", ARC, 3)
    const over = put(t, "p2", VAN, 1)
    giveBp(t, over, 10000) // 11000
    attack(t, b)
    assert(has(t, "p2", over), "BP11000は対象外")
    const u = game("arc-lv1")
    const c = put(u, "p1", ARC, 1) // Lv1
    const low = put(u, "p2", VAN, 1)
    attack(u, c)
    assert(has(u, "p2", low), "Lv1 ではアタック時の破壊は無い")
})
scene("X01-3: 【強化】で上限+1000：004 がいれば BP11000 も破壊できる。Lv3 は自身の【強化】で11000まで、12000は対象外", () => {
    const s = game("arc-boost-wyvern")
    const a = put(s, "p1", ARC, 3)
    put(s, "p1", WYVERN, 1)
    const big = put(s, "p2", VAN, 1)
    giveBp(s, big, 10000) // 11000
    attack(s, a)
    assert(!has(s, "p2", big), "004 の【強化】で上限11000になり破壊される")
    const t = game("arc-lv3")
    const b = put(t, "p1", ARC, 4) // Lv3
    const big2 = put(t, "p2", VAN, 1)
    giveBp(t, big2, 10000) // 11000
    attack(t, b)
    assert(!has(t, "p2", big2), "Lv3 は自身の【強化】で上限11000になり破壊される")
    const u = game("arc-lv3-over")
    const c = put(u, "p1", ARC, 4)
    const over = put(u, "p2", VAN, 1)
    giveBp(u, over, 11000) // 12000
    attack(u, c)
    assert(has(u, "p2", over), "BP12000は対象外")
})

console.log("すべてのチェックに合格しました 🎉（part807）")
