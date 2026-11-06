// smoke パート811（BS21 黄の期待値：037・039・040・042・043・044・045・063・071・081・X05。038 は効果なし。BS21_PLAN §1・§2 の確定読み）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, fireStepTriggers, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const CAMERON = "BS21-037" // カメロンパン（黄・コスト2・Lv1/Lv2 破壊時ドロー）
const LISEL = "BS21-039" // 天使リセル（黄・天霊・コスト3・Lv1/2 アタック不可と強化・Lv2 天霊BP+2000）
const GATO = "BS21-040" // ガトーブレパス（黄・コスト3・聖命）
const NARA = "BS21-042" // 十剣聖ナラシンハ（黄・コスト5・Lv1ブロックされない・合体時トラッシュ回収・連鎖緑）
const AIBE = "BS21-043" // ダーク・アイベリックス（黄・コスト5・Lv2/3 Lv1/2からブロックされない・連鎖緑）
const TOKOTSU = "BS21-044" // 凶獣トウコツ（黄・コスト6・ブロック時黄マジック回収・連鎖緑白）
const CAFF = "BS21-045" // 美の天使カフオペイア（黄・天霊/星魂・コスト6）
const PANDA = "BS21-063" // ぐるみパンダ（黄・ブレイヴ・コスト4・合体条件コスト4以上）
const YOUN = "BS21-071" // 四雲庵（黄・ネクサス・コスト3）
const SLAP = "BS21-081" // サプライズスラップ（黄・マジック・コスト3）
const BEHE = "BS21-X05" // 陸獣神ベヒモス（黄・想獣・コスト8）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・BP1000/3000/4000・効果なし）
const BEAT = "BS01-050" // ビートビートル（緑・コスト0・BP1000/2000・緑シンボル）
const MIRAGE = "BS01-051" // フライングミラージュ（緑・コスト1・BP2000/3000）
const SHOCK = "BS01-054" // ショックイーター（緑・コスト2・BP3000/4000）
const HERA = "BS01-058" // ヘラクレス・ジオ（緑・コスト3・Lv1=1/4000・Lv2=3/6000・Lv3=5/8000）
const GATLING = "BS01-084" // ガトリングスタンド（白・コスト3・白シンボル）
const POWER = "BS10-048" // 天使パワー（黄・天霊・コスト5・Lv1=1/3000）
const KOGUMARU = "BS12-033" // コグマル（黄・星魂・コスト1）
const HIPPO = "BS07-037" // ヒッポカンプー（黄・想獣・コスト1）
const PONISUS = "BS03-063" // ポニサス（黄・想獣・コスト5）
const FORTROS = "BS03-068" // フォルトロス（黄・想獣・コスト7）
const ULBY = "BS11-022" // ウルビー（緑・剣獣・コスト4・Lv1=1/5000）
const KARAKURI = "BS20-060" // カラクリバッタ（ブレイヴ・合体条件コスト4以上）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄・マジック・フラッシュ：相手のスピリット1体をBP-3000）
const ARDOR = "BS17-073" // アーダーフレイム（赤・マジック）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    type S = { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; levels: { level: number; cores: number; bp?: number }[] }
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as S[]
    const chk = (id: string, name: string, type: string, cost: number, lv: string, fam?: string) => {
        const c = staging.find((x) => x.cardId === id)
        assert(c?.name === name && c.type === type && c.cost === cost && c.colors[0] === "yellow" && c.levels.map((l) => `${l.cores}/${l.bp}`).join(",") === lv && (fam === undefined || c.family.includes(fam)), `${id}は${name}（黄・${type}・コスト${cost}・${lv}）`)
    }
    chk(CAMERON, "カメロンパン", "spirit", 2, "1/2000,3/3000")
    chk(LISEL, "天使リセル", "spirit", 3, "1/1000,3/3000", "天霊")
    chk(GATO, "ガトーブレパス", "spirit", 3, "1/1000,2/2000,3/3000")
    chk(NARA, "十剣聖ナラシンハ", "spirit", 5, "1/4000,2/5000,3/7000", "想獣")
    chk(AIBE, "ダーク・アイベリックス", "spirit", 5, "1/3000,2/4000,3/6000")
    chk(TOKOTSU, "凶獣トウコツ", "spirit", 6, "1/4000,2/5000")
    chk(CAFF, "美の天使カフオペイア", "spirit", 6, "1/5000,3/6000,4/8000", "星魂")
    chk(PANDA, "ぐるみパンダ", "brave", 4, "1/2000")
    chk(YOUN, "四雲庵", "nexus", 3, "0/0,1/0")
    chk(SLAP, "サプライズスラップ", "magic", 3, "")
    chk(BEHE, "陸獣神ベヒモス", "spirit", 8, "1/6000,3/12000,8/20000", "想獣")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).levels.map((l) => l.bp).join("/") === "1000/3000/4000" && getCard(VAN).effect === "", "VANはロクケラトプス")
    assert(getCard(BEAT).name === "ビートビートル" && getCard(BEAT).colors[0] === "green" && getCard(BEAT).effect === "", "BEATはビートビートル（緑）")
    assert(getCard(MIRAGE).name === "フライングミラージュ" && getCard(MIRAGE).levels[0]!.bp === 2000, "MIRAGEはフライングミラージュ")
    assert(getCard(SHOCK).name === "ショックイーター" && getCard(SHOCK).cost === 2 && getCard(SHOCK).type === "spirit", "SHOCKはコスト2のスピリット")
    assert(getCard(HERA).name === "ヘラクレス・ジオ" && getCard(HERA).cost === 3 && getCard(HERA).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/4000,3/6000,5/8000", "HERAはヘラクレス・ジオ（コスト3）")
    assert(getCard(GATLING).name === "ガトリングスタンド" && getCard(GATLING).colors[0] === "white", "GATLINGはガトリングスタンド（白）")
    assert(getCard(POWER).name === "天使パワー" && getCard(POWER).cost === 5 && getCard(POWER).effect === "", "POWERは天使パワー（コスト5）")
    assert(getCard(KOGUMARU).name === "コグマル" && getCard(KOGUMARU).family.includes("星魂"), "KOGUMARUはコグマル（星魂）")
    assert(getCard(HIPPO).name === "ヒッポカンプー" && getCard(HIPPO).family.includes("想獣"), "HIPPOはヒッポカンプー（想獣）")
    assert(getCard(PONISUS).name === "ポニサス" && getCard(PONISUS).cost === 5 && getCard(PONISUS).colors[0] === "yellow", "PONISUSはポニサス（黄・コスト5）")
    assert(getCard(FORTROS).name === "フォルトロス" && getCard(FORTROS).cost === 7 && getCard(FORTROS).colors[0] === "yellow", "FORTROSはフォルトロス（黄・コスト7）")
    assert(getCard(ULBY).name === "ウルビー" && getCard(ULBY).cost === 4 && getCard(ULBY).type === "spirit", "ULBYはウルビー（コスト4）")
    assert(getCard(KARAKURI).name === "カラクリバッタ" && getCard(KARAKURI).type === "brave", "KARAKURIはカラクリバッタ（ブレイヴ）")
    assert(getCard(PRESSURE).name === "エンジェリックプレッシャー" && getCard(PRESSURE).colors[0] === "yellow" && getCard(PRESSURE).type === "magic", "PRESSUREは黄のマジック")
    assert(getCard(ARDOR).name === "アーダーフレイム" && getCard(ARDOR).colors[0] === "red" && getCard(ARDOR).type === "magic", "ARDORは赤のマジック")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "green" })
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): void {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
}

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

const YES = ["発動する", "はい", "使う", "置く", "捨てる", "破棄", "戻す", "残る", "疲労", "する"]
// pref が空なら断る（選択肢を付けずに resolveChoice）
function settle(s: GameState, picks: string[] = [], pref: string[] = YES): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.some((y) => y.includes(x))) !== undefined ? o.find((y) => pref.some((x) => y.includes(x))) : pref.length === 0 ? undefined : o[0]
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            err = pref.length === 0 ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1")

// アタック宣言から、ブロック宣言ができる状態まで進める（アタック時の選択は settle で答える）
function attackToBlock(s: GameState, atk: PlayerId, id: string, picks: string[] = []): void {
    assert(act(s, atk, { type: "attack", instanceId: id }) === null, "アタックできる")
    settle(s, picks)
    act(s, other(atk), { type: "pass" })
    act(s, atk, { type: "pass" })
}

// アタック宣言からライフで受けるまで（ブロックされないとき）
function attackAndTakeLife(s: GameState, atk: PlayerId, id: string, picks: string[] = []): void {
    assert(act(s, atk, { type: "attack", instanceId: id }) === null, "アタックできる")
    settle(s, picks)
    assert(takeLifeAndResolve(s, other(atk)) === null, "ライフで受ける")
    settle(s)
}

const trashDestroy = (s: GameState, pid: PlayerId, id: string, by: PlayerId) => destroySpirit(s, pid, id, "destroy", { sourcePid: by, sourceType: "magic" })

// 037
scene("037-1: Lv1 のカメロンパンが破壊されたとき、自分は1枚ドローする（破壊されたコアはリザーブへ）", () => {
    const s = game("cam1")
    const c = put(s, "p1", CAMERON, 1)
    trashDestroy(s, "p1", c.instanceId, "p2")
    settle(s)
    assert(s.players.p1.deck.length === 39 && s.players.p1.hand.length === 1, "デッキ40→39・手札1")
    assert(s.players.p1.reserve === 21, "破壊されたコア1個はリザーブへ（20→21）")
})
scene("037-2: Lv2 でも1枚ドロー。境目：相手のカメロンパンが破壊されたときドローするのは相手だけ", () => {
    const s = game("cam2")
    const c = put(s, "p2", CAMERON, 3)
    trashDestroy(s, "p2", c.instanceId, "p1")
    settle(s)
    assert(s.players.p2.deck.length === 39 && s.players.p2.hand.length === 1, "持ち主の相手が1枚ドロー")
    assert(s.players.p1.deck.length === 40 && s.players.p1.hand.length === 0, "自分はドローしない")
})

// 039
scene("039-1: Lv1 の天使リセルは自分のアタックステップでアタックできない", () => {
    const s = game("lisel1")
    const l = put(s, "p1", LISEL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: l.instanceId }) !== null, "アタックは拒否される")
    assert(!l.isRested && s.battle == null, "疲労せずバトルも始まらない")
})
scene("039-2: Lv2 でもアタックできない", () => {
    const s = game("lisel2")
    const l = put(s, "p1", LISEL, 3)
    assert(act(s, "p1", { type: "attack", instanceId: l.instanceId }) !== null, "Lv2 でもアタックは拒否される")
})
scene("039-3: 【強化】自分のBP-効果が-1000される（-3000 が -4000）。境目：リセルが無ければ -3000、相手のリセルは自分の効果を強化しない", () => {
    const s = game("lisel3")
    put(s, "p1", LISEL, 1)
    const h = put(s, "p2", HERA, 3) // Lv2 BP6000
    s.players.p1.hand = [PRESSURE]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "エンジェリックプレッシャーを使用")
    settle(s, [h.instanceId])
    assert(effectiveBp(s, "p2", h) === 2000, "6000-3000-1000=2000")
    const t = game("lisel3b")
    const h2 = put(t, "p2", HERA, 3)
    t.players.p1.hand = [PRESSURE]
    assert(act(t, "p1", { type: "castMagic", handIndex: 0 }) === null, "リセル無しでエンジェリックプレッシャーを使用")
    settle(t, [h2.instanceId])
    assert(effectiveBp(t, "p2", h2) === 3000, "リセル無しなら 6000-3000=3000")
    const u = game("lisel3c")
    put(u, "p2", LISEL, 3) // 相手のリセル（Lv2 BP3000）
    const h3 = put(u, "p2", HERA, 3)
    u.players.p1.hand = [PRESSURE]
    assert(act(u, "p1", { type: "castMagic", handIndex: 0 }) === null, "自分がエンジェリックプレッシャーを使用")
    settle(u, [h3.instanceId])
    assert(effectiveBp(u, "p2", h3) === 3000, "相手のリセルは自分の BP-効果を強めない（6000-3000=3000）")
})
scene("039-4: Lv2『お互いのアタックステップ』天霊のスピリットすべてBP+2000。境目：Lv1・メインステップ・天霊以外", () => {
    const s = game("lisel4")
    const l = put(s, "p1", LISEL, 3) // Lv2 BP3000
    const v = put(s, "p1", VAN, 2)
    assert(effectiveBp(s, "p1", l) === 5000, "自分のアタックステップ中は天霊の自分自身が 3000→5000")
    assert(effectiveBp(s, "p1", v) === 3000, "天霊でないロクケラトプスは上がらない")
    s.phase = "main"
    assert(effectiveBp(s, "p1", l) === 3000, "メインステップでは上がらない")
    s.phase = "attack"
    s.turnPlayer = "p2"
    assert(effectiveBp(s, "p1", l) === 5000, "相手のアタックステップでも上がる（お互い）")
    const t = game("lisel4b")
    const l1 = put(t, "p1", LISEL, 1)
    assert(effectiveBp(t, "p1", l1) === 1000, "Lv1 では上がらない")
})

// 040
scene("040-1: ガトーブレパスのアタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く", () => {
    const s = game("gato1")
    const g = put(s, "p1", GATO, 1)
    attackAndTakeLife(s, "p1", g.instanceId)
    assert(s.players.p2.life === 4, "相手のライフ5→4")
    assert(s.players.p1.life === 6, "自分のライフ5→6")
})
scene("040-2: 境目：ブロックされてライフを減らさなければライフは増えない", () => {
    const s = game("gato2")
    const g = put(s, "p1", GATO, 1)
    const b = put(s, "p2", BEAT, 1)
    attackToBlock(s, "p1", g.instanceId)
    assert(declareBlock(s, "p2", b.instanceId) === null, "ビートビートルでブロック")
    passFlash(s)
    assert(s.players.p2.life === 5 && s.players.p1.life === 5, "どちらのライフも変わらない")
})

// 042
const setupNara = (seed: string, naraCores: number, withBrave: boolean, withGreen: boolean) => {
    const s = game(seed)
    const n = put(s, "p1", NARA, naraCores)
    if (withBrave) combine(s, "p1", n, KARAKURI)
    if (withGreen) put(s, "p1", BEAT, 1)
    s.players.p1.trashCards = [SHOCK, HERA]
    return { s, n }
}
scene("042-1: アタック時、Lv1 の相手のスピリットからブロックされない。境目：Lv2 の相手のスピリットはブロックできる", () => {
    const { s, n } = setupNara("nara1", 1, false, false)
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 2)
    attackToBlock(s, "p1", n.instanceId)
    assert(declareBlock(s, "p2", v1.instanceId) !== null, "Lv1 のロクケラトプスはブロックできない")
    assert(declareBlock(s, "p2", v2.instanceId) === null, "Lv2 のロクケラトプスはブロックできる")
})
scene("042-2: 合体アタック時（Lv2）、トラッシュのコスト2のスピリットカード1枚を手札に戻し、緑シンボルがあれば相手のスピリット1体を疲労させる", () => {
    const { s, n } = setupNara("nara2", 2, true, true)
    const v = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: n.instanceId }) === null, "合体アタック")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === SHOCK, "手札に戻るのはコスト2のショックイーターだけ")
    assert(s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === HERA, "コスト3のヘラクレス・ジオはトラッシュに残る")
    assert(v.isRested, "連鎖[緑]で相手のスピリットが疲労する")
})
scene("042-3: 境目：緑シンボルが無ければ疲労させないが、トラッシュの回収はする", () => {
    const { s, n } = setupNara("nara3", 2, true, false)
    const v = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: n.instanceId }) === null, "合体アタック")
    settle(s)
    assert(s.players.p1.hand[0] === SHOCK && s.players.p1.hand.length === 1, "ショックイーターは手札に戻る")
    assert(!v.isRested, "緑シンボルが無いので疲労しない")
})
scene("042-4: 境目：Lv1 の合体アタック・合体していないアタックでは回収しない", () => {
    const a = setupNara("nara4a", 1, true, true)
    put(a.s, "p2", VAN, 1)
    assert(act(a.s, "p1", { type: "attack", instanceId: a.n.instanceId }) === null, "Lv1 で合体アタック")
    settle(a.s)
    assert(a.s.players.p1.hand.length === 0, "Lv1 では手札に戻らない")
    const b = setupNara("nara4b", 2, false, true)
    const v = put(b.s, "p2", VAN, 1)
    assert(act(b.s, "p1", { type: "attack", instanceId: b.n.instanceId }) === null, "合体せずにアタック")
    settle(b.s)
    assert(b.s.players.p1.hand.length === 0 && !v.isRested, "合体していないので回収も疲労もしない")
})

// 043
scene("043-1: Lv2 のアタック時、Lv1/Lv2 の相手のスピリットからブロックされない。境目：Lv3 は可能", () => {
    const s = game("aibe1")
    const a = put(s, "p1", AIBE, 2)
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 2)
    const h = put(s, "p2", HERA, 5) // Lv3
    attackToBlock(s, "p1", a.instanceId)
    assert(declareBlock(s, "p2", v1.instanceId) !== null, "Lv1 はブロックできない")
    assert(declareBlock(s, "p2", v2.instanceId) !== null, "Lv2 はブロックできない")
    assert(declareBlock(s, "p2", h.instanceId) === null, "Lv3 はブロックできる")
})
scene("043-2: 境目：Lv1 のダーク・アイベリックスは効果が無く、Lv1 の相手もブロックできる", () => {
    const s = game("aibe2")
    const a = put(s, "p1", AIBE, 1)
    const v1 = put(s, "p2", VAN, 1)
    attackToBlock(s, "p1", a.instanceId)
    assert(declareBlock(s, "p2", v1.instanceId) === null, "Lv1 の相手がブロックできる")
})
scene("043-3: 連鎖[緑]：緑シンボルがあれば相手のスピリット1体を疲労させる。境目：無ければ疲労しない", () => {
    const s = game("aibe3")
    const a = put(s, "p1", AIBE, 2)
    put(s, "p1", BEAT, 1)
    const h = put(s, "p2", HERA, 5)
    assert(act(s, "p1", { type: "attack", instanceId: a.instanceId }) === null, "アタック")
    settle(s)
    assert(h.isRested, "緑シンボルがあるので相手のスピリットが疲労する")
    const t = game("aibe3b")
    const a2 = put(t, "p1", AIBE, 2)
    const h2 = put(t, "p2", HERA, 5)
    assert(act(t, "p1", { type: "attack", instanceId: a2.instanceId }) === null, "緑シンボル無しでアタック")
    settle(t)
    assert(!h2.isRested, "緑シンボルが無ければ疲労しない")
})

// 044
const setupToko = (seed: string, symbols: string[]) => {
    const s = game(seed, "attack", "p2")
    const t = put(s, "p1", TOKOTSU, 1)
    for (const sym of symbols) put(s, "p1", sym, 1)
    s.players.p1.trashCards = [ARDOR, PRESSURE]
    const m = put(s, "p2", MIRAGE, 1)
    return { s, t, m }
}
scene("044-1: ブロック時、トラッシュの黄のマジック1枚を手札に戻す（赤は戻さない）。シンボルが無ければ連鎖は無し", () => {
    const { s, t, m } = setupToko("toko1", [])
    attackToBlock(s, "p2", m.instanceId)
    assert(declareBlock(s, "p1", t.instanceId) === null, "凶獣トウコツでブロック")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === PRESSURE, "黄のエンジェリックプレッシャーが手札に戻る")
    assert(s.players.p1.trashCards.length === 1 && s.players.p1.trashCards[0] === ARDOR, "赤のアーダーフレイムはトラッシュに残る")
    assert(t.cores === 1 && s.players.p2.field.spirits.some((x) => x.instanceId === m.instanceId), "コアは増えず、相手のスピリットも戻らない")
})
scene("044-2: 連鎖[緑]：緑シンボルがあればボイドからコア1個をこのスピリットに置く（白は無いので手札には戻さない）", () => {
    const { s, t, m } = setupToko("toko2", [BEAT])
    attackToBlock(s, "p2", m.instanceId)
    assert(declareBlock(s, "p1", t.instanceId) === null, "凶獣トウコツでブロック")
    settle(s)
    assert(t.cores === 2, "トウコツのコア 1→2")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === m.instanceId) && s.players.p2.hand.length === 0, "白シンボルが無いので相手のスピリットは戻らない")
})
scene("044-3: 連鎖[白]：白シンボルがあればBP4000以下の相手のスピリット1体を手札に戻す。BP4000を超えるものは戻さない", () => {
    const { s, t, m } = setupToko("toko3", [GATLING])
    const big = put(s, "p2", HERA, 5) // Lv3 BP8000
    attackToBlock(s, "p2", m.instanceId)
    assert(declareBlock(s, "p1", t.instanceId) === null, "凶獣トウコツでブロック")
    settle(s)
    assert(s.players.p2.hand.length === 1 && s.players.p2.hand[0] === MIRAGE, "BP2000のフライングミラージュが相手の手札に戻る")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === big.instanceId), "BP8000のヘラクレス・ジオは戻らない")
    assert(t.cores === 1, "緑シンボルが無いのでコアは増えない")
})

// 045
scene("045-1: アタック時、このターンの間、相手のスピリット1体をBP-3000する（Lv1）", () => {
    const s = game("caf1")
    const c = put(s, "p1", CAFF, 1)
    const h = put(s, "p2", HERA, 3) // BP6000
    const v = put(s, "p2", VAN, 1) // BP1000
    assert(act(s, "p1", { type: "attack", instanceId: c.instanceId }) === null, "アタック")
    settle(s, [h.instanceId])
    assert(effectiveBp(s, "p2", h) === 3000, "選んだヘラクレス・ジオ 6000→3000")
    assert(effectiveBp(s, "p2", v) === 1000, "選ばなかったロクケラトプスは 1000 のまま")
})
scene("045-2: Lv2『自分のアタックステップ』星魂は BP0 の相手のスピリットからブロックされない（BP-3000 で BP0 になったスピリット）", () => {
    const s = game("caf2")
    const c = put(s, "p1", CAFF, 3) // Lv2
    const v = put(s, "p2", VAN, 2) // BP3000 → 0
    attackToBlock(s, "p1", c.instanceId)
    assert(effectiveBp(s, "p2", v) === 0, "BP-3000 で BP0")
    assert(declareBlock(s, "p2", v.instanceId) !== null, "BP0 のスピリットはブロックできない")
})
scene("045-3: 境目：Lv1 では BP0 でもブロックできる／Lv2 でも BP0 でなければブロックできる", () => {
    const s = game("caf3")
    const c = put(s, "p1", CAFF, 1)
    const v = put(s, "p2", VAN, 2)
    attackToBlock(s, "p1", c.instanceId)
    assert(declareBlock(s, "p2", v.instanceId) === null, "Lv1 なら BP0 でもブロックできる")
    const t = game("caf3b")
    const c2 = put(t, "p1", CAFF, 3)
    const h = put(t, "p2", HERA, 3) // 6000 → 3000
    attackToBlock(t, "p1", c2.instanceId)
    assert(declareBlock(t, "p2", h.instanceId) === null, "BP3000 の相手はブロックできる")
})

// 063
scene("063-1: 合体したぐるみパンダのスピリットが相手によって破壊されたとき、ボイドからコア1個を自分のライフに置く（ブレイヴを残す選択でも）", () => {
    const s = game("panda1")
    const host = put(s, "p1", ULBY, 3)
    combine(s, "p1", host, PANDA)
    trashDestroy(s, "p1", host.instanceId, "p2")
    settle(s)
    assert(s.players.p1.life === 6, "自分のライフ5→6")
})
scene("063-2: 境目：自分の効果で破壊されたときは置かない", () => {
    const s = game("panda2")
    const host = put(s, "p1", ULBY, 3)
    combine(s, "p1", host, PANDA)
    trashDestroy(s, "p1", host.instanceId, "p1")
    settle(s)
    assert(s.players.p1.life === 5, "ライフは5のまま")
})
scene("063-3: 境目：別のブレイヴ（カラクリバッタ）と合体したホストが相手に破壊されても置かない", () => {
    const s = game("panda3")
    const host = put(s, "p1", ULBY, 3)
    combine(s, "p1", host, KARAKURI)
    trashDestroy(s, "p1", host.instanceId, "p2")
    settle(s)
    assert(s.players.p1.life === 5, "ぐるみパンダが無ければライフは増えない")
})


// 071
const hand071 = (seed: string, hand: string[], nexuses = 1) => {
    const s = game(seed, "main")
    for (let i = 0; i < nexuses; i++) putNexus(s, "p1", YOUN, 0)
    s.players.p1.hand = hand
    return s
}
scene("071-1: Lv1 のスタートステップ、手札の「想獣」スピリット1枚を破棄することで、ボイドからコア1個をリザーブに置く", () => {
    const s = hand071("youn1", [HIPPO])
    fireStepTriggers(s, "start")
    settle(s)
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.includes(HIPPO), "ヒッポカンプーを破棄")
    assert(s.players.p1.reserve === 21, "リザーブ 20→21")
})
scene("071-2: 「星魂」のスピリットでも払える。境目：どちらでもないスピリットだけなら払えない", () => {
    const s = hand071("youn2", [KOGUMARU])
    fireStepTriggers(s, "start")
    settle(s)
    assert(s.players.p1.hand.length === 0 && s.players.p1.reserve === 21, "コグマルを破棄してリザーブ+1")
    const t = hand071("youn2b", [VAN])
    fireStepTriggers(t, "start")
    settle(t)
    assert(t.players.p1.hand.length === 1 && t.players.p1.reserve === 20, "ロクケラトプスは破棄できず、コアも増えない")
})
scene("071-3: 境目：「〜できる」ではなく「〜することで」の支払いを断れば何も起きない", () => {
    const s = hand071("youn3", [HIPPO])
    fireStepTriggers(s, "start")
    settle(s, [], [])
    assert(s.players.p1.hand.length === 1 && s.players.p1.reserve === 20, "断れば手札もコアも変わらない")
})
scene("071-4: この効果はターンに1回しか使えない（四雲庵が2つあっても1回）", () => {
    const s = hand071("youn4", [HIPPO, KOGUMARU], 2)
    fireStepTriggers(s, "start")
    settle(s)
    assert(s.players.p1.hand.length === 1 && s.players.p1.reserve === 21, "2つあっても破棄は1枚・リザーブ+1だけ")
})
scene("071-5: Lv2 のメインステップ、コスト7以上のスピリットを召喚するとき、四雲庵のシンボルは黄3つ（コスト7→4を支払う）", () => {
    const s = game("youn5", "main")
    putNexus(s, "p1", YOUN, 1) // Lv2
    s.players.p1.hand = [FORTROS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "フォルトロスを召喚")
    settle(s)
    assert(s.players.p1.trashCores === 4, "黄シンボル3つで 7-3=4 個を支払う（トラッシュのコア 0→4）")
})
scene("071-6: 境目：Lv1 ではシンボル1つのまま（7-1=6）／Lv2 でもコスト7未満は1つのまま（5-1=4）", () => {
    const s = game("youn6", "main")
    putNexus(s, "p1", YOUN, 0) // Lv1
    s.players.p1.hand = [FORTROS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "Lv1 でフォルトロスを召喚")
    settle(s)
    assert(s.players.p1.trashCores === 6, "Lv1 は 7-1=6 個を支払う")
    const t = game("youn6b", "main")
    putNexus(t, "p1", YOUN, 1)
    t.players.p1.hand = [PONISUS]
    assert(act(t, "p1", { type: "summon", handIndex: 0 }) === null, "Lv2 でポニサス（コスト5）を召喚")
    settle(t)
    assert(t.players.p1.trashCores === 4, "コスト5は 5-1=4 個を支払う（シンボル3つにならない）")
})

// 081
const slapSetup = (seed: string, symbols: string[], extra: string[] = [], flip = true) => {
    const s = game(seed, "attack", "p2")
    for (const sym of symbols) put(s, "p1", sym, 1)
    const atk = put(s, "p2", MIRAGE, 1)
    const ex = extra.map((c) => put(s, "p2", c, 1))
    s.players.p1.hand = [SLAP]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "ミラージュでアタック")
    if (flip) atk.isRested = false // アタックしている回復状態の状況を作る
    return { s, atk, ex }
}
scene("081-1: フラッシュ：アタックしている回復状態の相手のスピリット1体を破壊する", () => {
    const { s, atk } = slapSetup("slap1", [])
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "サプライズスラップを使用")
    settle(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === atk.instanceId), "アタック中のミラージュが破壊される")
    assert(s.players.p1.trashCards.includes(SLAP), "使ったマジックはトラッシュへ")
})
scene("081-2: 境目：疲労状態のアタックスピリットは破壊されない", () => {
    const { s, atk } = slapSetup("slap2", [], [], false)
    act(s, "p1", { type: "castMagic", handIndex: 0 })
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === atk.instanceId), "疲労状態のミラージュは残る")
})
scene("081-3: 連鎖[緑]：緑シンボルがあればコスト3の相手のスピリット2体を疲労させる（コスト1は疲労しない）", () => {
    const { s, ex } = slapSetup("slap3", [BEAT], [HERA, HERA, VAN])
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "サプライズスラップを使用")
    settle(s)
    assert(ex[0]!.isRested && ex[1]!.isRested, "コスト3の2体が疲労する")
    assert(!ex[2]!.isRested, "コスト1のロクケラトプスは疲労しない")
})
scene("081-4: 境目：緑シンボルが無ければコスト3の相手のスピリットは疲労しない", () => {
    const { s, ex } = slapSetup("slap4", [], [HERA, HERA])
    act(s, "p1", { type: "castMagic", handIndex: 0 })
    settle(s)
    assert(!ex[0]!.isRested && !ex[1]!.isRested, "疲労しない")
})
scene("081-5: 連鎖[白]：指定した相手のスピリットのアタックでは自分のライフは減らない。指定していないスピリットでは減る", () => {
    const { s, ex } = slapSetup("slap5", [GATLING], [VAN, VAN])
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "サプライズスラップを使用")
    settle(s, [ex[0]!.instanceId])
    passFlash(s)
    attackAndTakeLife(s, "p2", ex[0]!.instanceId)
    assert(s.players.p1.life === 5, "指定されたスピリットのアタックではライフは減らない")
    attackAndTakeLife(s, "p2", ex[1]!.instanceId)
    assert(s.players.p1.life === 4, "指定されていないスピリットのアタックでは減る")
})

// X05
scene("X05-1: 自分のアタックステップ、相手のスピリットすべてをLv1として扱う（Lv2 のヘラクレス・ジオが BP6000→4000）", () => {
    const s = game("behe1")
    put(s, "p1", BEHE, 1)
    const own = put(s, "p1", VAN, 2)
    const h = put(s, "p2", HERA, 3)
    assert(effectiveBp(s, "p2", h) === 4000, "自分のアタックステップ中は 4000")
    assert(effectiveBp(s, "p1", own) === 3000, "自分のスピリットは変わらない")
    s.phase = "main"
    assert(effectiveBp(s, "p2", h) === 6000, "メインステップでは 6000")
    s.phase = "attack"
    s.turnPlayer = "p2"
    assert(effectiveBp(s, "p2", h) === 6000, "相手のアタックステップでは 6000")
})
scene("X05-2: Lv2 のアタック時、コアが1個の相手のスピリットからブロックされない（2個ならブロックできる）", () => {
    const s = game("behe2")
    const b = put(s, "p1", BEHE, 3)
    const v1 = put(s, "p2", VAN, 1)
    const v2 = put(s, "p2", VAN, 2)
    attackToBlock(s, "p1", b.instanceId)
    assert(declareBlock(s, "p2", v1.instanceId) !== null, "コア1個はブロックできない")
    assert(declareBlock(s, "p2", v2.instanceId) === null, "コア2個はブロックできる")
})
scene("X05-3: 境目：Lv1 ではコア1個の相手もブロックできる", () => {
    const s = game("behe3")
    const b = put(s, "p1", BEHE, 1)
    const v1 = put(s, "p2", VAN, 1)
    attackToBlock(s, "p1", b.instanceId)
    assert(declareBlock(s, "p2", v1.instanceId) === null, "Lv1 ならコア1個でもブロックできる")
})
scene("X05-4: 連鎖[緑]：緑シンボルがあればコスト4以下の相手のスピリットすべてを疲労させる（コスト5は疲労しない）", () => {
    const s = game("behe4")
    const b = put(s, "p1", BEHE, 8)
    put(s, "p1", BEAT, 1)
    const h = put(s, "p2", HERA, 3) // コスト3
    const u = put(s, "p2", ULBY, 1) // コスト4
    const p = put(s, "p2", POWER, 2) // コスト5
    assert(act(s, "p1", { type: "attack", instanceId: b.instanceId }) === null, "アタック")
    settle(s)
    assert(h.isRested && u.isRested, "コスト3・コスト4の相手のスピリットが疲労する")
    assert(!p.isRested, "コスト5は疲労しない")
})
scene("X05-5: 境目：緑シンボルが無ければ疲労しない", () => {
    const s = game("behe5")
    const b = put(s, "p1", BEHE, 8)
    const h = put(s, "p2", HERA, 3)
    assert(act(s, "p1", { type: "attack", instanceId: b.instanceId }) === null, "アタック")
    settle(s)
    assert(!h.isRested, "疲労しない")
})

console.log("すべてのチェックに合格しました 🎉（part811）")
