// smoke パート828（BS22 黄の残り：039〜044・063・064・082・X13-05・X13-09。BS22_PLAN §1・§2 の確定読み。BS19_PLAN §2 の連鎖・強化。カードは staging にしか無いので実装前は落ちる）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, endTurn, getCard, giveBp, handleAction, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const TOUTETSU = "BS22-039" // 凶獣トウテツ（黄・コスト3・想獣・Lv1/2 コア1/3）
const ZURA = "BS22-040" // 宝の番人ズラトロック（黄・コスト3・想獣・Lv1/2/3 コア1/3/4）
const ALMI = "BS22-041" // アルミラージ（黄・コスト4・想獣・Lv1/2/3 コア1/2/3 BP3000/4000/6000）
const HARPY = "BS22-042" // ハーピーガール（黄・コスト4・想獣・Lv1/2/3 コア1/2/3）
const ETOILE = "BS22-043" // 聖天使エトワール（黄・コスト5・天霊・Lv1/2/3 コア1/2/3）
const KIRIEL = "BS22-044" // 天剣使キリエル（黄・コスト8・剣使/天霊・Lv1/2/3 コア1/2/3）
const PENTAN = "BS22-063" // ペンタンブレイヴ（黄・ブレイヴ・コスト4）
const SWEETS = "BS22-064" // スイーツファイター（黄・ブレイヴ・コスト4）
const LIFEREV = "BS22-082" // ライフレボリューション（黄・マジック・コスト5・フラッシュ）
const MIKA = "X13-05" // 星天使ミカリーン（黄・コスト4・天霊/想獣・Lv1/2/3 コア1/2/3）
const TRICK = "X13-09" // 渚のトリックスター（黄・コスト6・道化/導魔・Lv1/2 コア1/3）

const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・Lv1BP1000・効果なし）
const METAL = "BS01-008" // メタルバーン（赤・コスト3・Lv1BP3000・効果なし）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・Lv1BP3000・効果なし）
const STIRA = "SD01-007" // スティラホーン（赤・コスト5・Lv1/2/3 BP3000/5000/8000 コア1/3/4・効果なし）
const VALK = "BS01-097" // 飛龍ヴァルキュリウス（白・コスト8・ブロック時だけの効果）
const LAMP = "BS03-060" // ランプキン（黄・コスト4・小玩・Lv1BP3000・効果なし）
const PONY = "BS03-063" // ポニサス（黄・コスト5・想獣・Lv1/2 BP4000/6000 コア1/3・効果なし）
const FORT = "BS03-068" // フォルトロス（黄・コスト7・想獣・Lv1BP5000 コア1/3/5・効果なし）
const AIRAY = "BS14-050" // エアレイ（黄・コスト3・想獣・効果なし）
const VANILLAP = "BS20-040" // バニラップ（黄・コスト3・想獣・効果なし）
const TENSHI = "BS10-048" // 天使パワー（黄・コスト5・天霊・Lv1/2/3 BP3000/6000/8000 コア1/2/4・効果なし）
const SKULL = "BS20-058" // スカルプレイン（紫・ブレイヴ・コスト5・合体条件コスト5以上）
const KARAKURI = "BS20-060" // カラクリバッタ（緑・ブレイヴ・合体条件コスト4以上）
const QUICK = "BS20-005" // クイックサンド・ドラゴン（赤・コスト4・召喚時BP4000以下の相手のスピリット1体を破壊）
const RIBBON = "BS01-146" // ドリームリボン（白・マジック・フラッシュ）

type Inst = ReturnType<typeof createInstance>

console.log("=== 前提: カードの機械確認（BS22・X13 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS22.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[] }[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)
    const expect: [string, string, string, number][] = [
        [TOUTETSU, "凶獣トウテツ", "spirit", 3], [ZURA, "宝の番人ズラトロック", "spirit", 3], [ALMI, "アルミラージ", "spirit", 4],
        [HARPY, "ハーピーガール", "spirit", 4], [ETOILE, "聖天使エトワール", "spirit", 5], [KIRIEL, "天剣使キリエル", "spirit", 8],
        [PENTAN, "ペンタンブレイヴ", "brave", 4], [SWEETS, "スイーツファイター", "brave", 4], [LIFEREV, "ライフレボリューション", "magic", 5],
        [MIKA, "星天使ミカリーン", "spirit", 4], [TRICK, "渚のトリックスター", "spirit", 6],
    ]
    for (const [id, name, type, cost] of expect) {
        const c = byId(id)
        assert(c?.name === name && c.type === type && c.cost === cost && c.colors.includes("yellow"), `${id} は ${name}（黄・${type}・コスト${cost}）`)
    }
    assert(byId(TOUTETSU)!.family.includes("想獣") && byId(ETOILE)!.family.includes("天霊") && byId(KIRIEL)!.family.includes("天霊"), "トウテツは想獣・エトワールとキリエルは天霊")
    const exist: [string, string, number, string][] = [
        [VAN, "ロクケラトプス", 1, "red"], [METAL, "メタルバーン", 3, "red"], [BELL, "デュアルキャノン・ベル", 4, "white"], [STIRA, "スティラホーン", 5, "red"],
        [VALK, "飛龍ヴァルキュリウス", 8, "white"], [LAMP, "ランプキン", 4, "yellow"], [PONY, "ポニサス", 5, "yellow"], [FORT, "フォルトロス", 7, "yellow"],
        [AIRAY, "エアレイ", 3, "yellow"], [VANILLAP, "バニラップ", 3, "yellow"], [TENSHI, "天使パワー", 5, "yellow"], [QUICK, "クイックサンド・ドラゴン", 4, "red"],
    ]
    for (const [id, name, cost, color] of exist) assert(getCard(id).name === name && getCard(id).cost === cost && getCard(id).colors[0] === color, `${id} は ${name}（${color}・コスト${cost}）`)
    assert(getCard(PONY).family.includes("想獣") && getCard(AIRAY).family.includes("想獣") && getCard(VANILLAP).family.includes("想獣") && getCard(TENSHI).family.includes("天霊"), "ポニサス・エアレイ・バニラップは想獣、天使パワーは天霊")
    assert(getCard(SKULL).type === "brave" && getCard(SKULL).effect.includes("合体条件：コスト5以上"), "スカルプレインは合体条件コスト5以上のブレイヴ")
    assert(getCard(KARAKURI).type === "brave" && getCard(KARAKURI).effect.includes("合体条件：コスト4以上"), "カラクリバッタは合体条件コスト4以上のブレイヴ")
    assert(getCard(RIBBON).name === "ドリームリボン" && getCard(RIBBON).type === "magic", "ドリームリボンはマジック")
}

function game(seed: string, turnPlayer: PlayerId = "p1", phase: "main" | "attack" = "main"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
    s.phase = phase
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

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): Inst {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: Inst, braveCardId: string): Inst {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

const onField = (s: GameState, pid: PlayerId, i: Inst): boolean => s.players[pid].field.spirits.some((x) => x.instanceId === i.instanceId)

// accept=false のときは確認に選択肢を付けずに答える。target は picks にあるものを選び、無ければ選ばずに確定する
function settle(s: GameState, picks: string[] = [], accept = true): void {
    const used = new Set<string>()
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            err = accept ? act(s, who, { type: "resolveChoice", option: o[0] ?? "" }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => !used.has(x) && (pc.candidates ?? []).includes(x))
            if (next !== undefined) used.add(next)
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// バトルの最後まで両者パスで進める
function finishBattle(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming; i++) {
        if (act(s, s.priorityPlayer, { type: "pass" }) !== null) break
        settle(s)
    }
}

function summon(s: GameState, pid: PlayerId, hand: string[], picks: string[] = [], accept = true): void {
    s.players[pid].hand = hand
    assert(act(s, pid, { type: "summon", handIndex: 0 }) === null, `${hand[0]} を召喚できる`)
    settle(s, picks, accept)
}

function destroyByOpp(s: GameState, victim: Inst): void {
    destroySpirit(s, "p1", victim.instanceId, "destroy", { sourcePid: "p2", sourceType: "magic" })
}

console.log("=== 039 Lv1･Lv2『このスピリットの破壊時』：想獣の自分のスピリット2体を回復（3体いても2体まで・想獣でないものは回復しない） ===")
{
    const s = game("tou-refresh")
    const tou = put(s, "p1", TOUTETSU, 1)
    const pony = put(s, "p1", PONY, 1)
    const airay = put(s, "p1", AIRAY, 1)
    const vanp = put(s, "p1", VANILLAP, 1)
    const van = put(s, "p1", VAN, 1) // 想獣でない
    for (const x of [pony, airay, vanp, van]) x.isRested = true
    destroyByOpp(s, tou)
    settle(s, [pony.instanceId, airay.instanceId, vanp.instanceId])
    assert(!onField(s, "p1", tou), "トウテツは破壊される")
    assert([pony, airay, vanp].filter((x) => !x.isRested).length === 2, "想獣の疲労スピリット3体のうち2体だけ回復する")
    assert(van.isRested, "想獣でないロクケラトプスは回復しない")
}
{
    const s = game("tou-chain")
    const tou = put(s, "p1", TOUTETSU, 1)
    put(s, "p1", VAN, 1) // 赤シンボル
    const stira = put(s, "p2", STIRA, 1) // BP3000
    const pony2 = put(s, "p2", PONY, 3) // Lv2 BP6000
    destroyByOpp(s, tou)
    settle(s, [stira.instanceId, pony2.instanceId])
    assert(!onField(s, "p2", stira), "連鎖[赤]：BP4000以下のスティラホーンが破壊される")
    assert(onField(s, "p2", pony2), "BP4000を超えるポニサス（BP6000）は破壊されない")
}
{
    const s = game("tou-nochain")
    const tou = put(s, "p1", TOUTETSU, 1)
    put(s, "p1", PONY, 1) // 黄のみ・赤シンボルなし
    const stira = put(s, "p2", STIRA, 1)
    destroyByOpp(s, tou)
    settle(s, [stira.instanceId])
    assert(onField(s, "p2", stira), "赤シンボルが無ければ連鎖は発揮しない")
}

console.log("=== 040 Lv1〜『相手のアタックステップ』：コスト3/4の相手のスピリットはアタックできない／Lv2〜：コスト7/8もできない ===")
{
    const s = game("zura-lv1", "p2", "attack")
    put(s, "p1", ZURA, 1) // Lv1
    const c3 = put(s, "p2", METAL, 1)
    const c4 = put(s, "p2", BELL, 1)
    const c5 = put(s, "p2", STIRA, 1)
    const c7 = put(s, "p2", FORT, 1)
    const c8 = put(s, "p2", VALK, 1)
    assert(act(s, "p2", { type: "attack", instanceId: c3.instanceId }) !== null, "Lv1：コスト3はアタックできない")
    assert(act(s, "p2", { type: "attack", instanceId: c4.instanceId }) !== null, "Lv1：コスト4はアタックできない")
    assert(act(s, "p2", { type: "attack", instanceId: c7.instanceId }) === null, "Lv1：コスト7はアタックできる")
    takeLifeAndResolve(s, "p1")
    assert(act(s, "p2", { type: "attack", instanceId: c8.instanceId }) === null, "Lv1：コスト8はアタックできる")
    takeLifeAndResolve(s, "p1")
    assert(act(s, "p2", { type: "attack", instanceId: c5.instanceId }) === null, "Lv1：コスト5はアタックできる")
}
{
    const s = game("zura-lv2", "p2", "attack")
    put(s, "p1", ZURA, 3) // Lv2
    const c3 = put(s, "p2", METAL, 1)
    const c5 = put(s, "p2", STIRA, 1)
    const c7 = put(s, "p2", FORT, 1)
    const c8 = put(s, "p2", VALK, 1)
    assert(act(s, "p2", { type: "attack", instanceId: c3.instanceId }) !== null, "Lv2：コスト3はアタックできない")
    assert(act(s, "p2", { type: "attack", instanceId: c7.instanceId }) !== null, "Lv2：コスト7はアタックできない")
    assert(act(s, "p2", { type: "attack", instanceId: c8.instanceId }) !== null, "Lv2：コスト8はアタックできない")
    assert(act(s, "p2", { type: "attack", instanceId: c5.instanceId }) === null, "Lv2：コスト5はアタックできる")
}
{
    const s = game("zura-own", "p2", "attack")
    put(s, "p2", ZURA, 3)
    const c3 = put(s, "p2", METAL, 1)
    assert(act(s, "p2", { type: "attack", instanceId: c3.instanceId }) === null, "持ち主自身のアタックステップでは自分のコスト3はアタックできる")
}

console.log("=== 041 Lv1〜【聖命】『アタック時』：アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く ===")
{
    const s = game("almi-life", "p1", "attack")
    const almi = put(s, "p1", ALMI, 1)
    assert(act(s, "p1", { type: "attack", instanceId: almi.instanceId }) === null, "アルミラージでアタック")
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(s.players.p2.life === 4 && s.players.p1.life === 6, "相手のライフが4に減り、自分のライフが6に増える")
}
{
    const s = game("almi-blocked", "p1", "attack")
    const almi = put(s, "p1", ALMI, 1)
    const blocker = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: almi.instanceId }) === null, "アルミラージでアタック")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックする")
    finishBattle(s)
    assert(s.players.p2.life === 5 && s.players.p1.life === 5, "相手のライフを減らせなければ自分のライフは増えない")
}

console.log("=== 041 Lv2〜：【聖命】を持つ自分のスピリットすべては、相手の効果で破壊されたとき疲労状態で残る ===")
{
    const s = game("almi-stay", "p2", "main")
    const almi = put(s, "p1", ALMI, 2) // Lv2
    summon(s, "p2", [QUICK], [almi.instanceId])
    assert(onField(s, "p1", almi) && almi.isRested, "Lv2：アルミラージは相手の効果で破壊されても疲労状態で残る")
}
{
    const s = game("almi-lv1", "p2", "main")
    const almi = put(s, "p1", ALMI, 1) // Lv1
    summon(s, "p2", [QUICK], [almi.instanceId])
    assert(!onField(s, "p1", almi), "Lv1：この効果は無いので破壊される")
}
{
    const s = game("almi-other", "p2", "main")
    put(s, "p1", ALMI, 2)
    const van = put(s, "p1", VAN, 1) // 【聖命】を持たない
    summon(s, "p2", [QUICK], [van.instanceId])
    assert(!onField(s, "p1", van), "【聖命】を持たないスピリットは破壊される")
}
{
    const s = game("almi-own-effect", "p1", "main")
    const almi = put(s, "p1", ALMI, 2)
    destroySpirit(s, "p1", almi.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s)
    assert(!onField(s, "p1", almi), "自分の効果による破壊では疲労状態で残らない")
}

console.log("=== 042 Lv1〜【聖命】：アタックで相手のライフを減らしたらコア1個をライフへ ===")
{
    const s = game("harpy-life", "p1", "attack")
    const h = put(s, "p1", HARPY, 1)
    assert(act(s, "p1", { type: "attack", instanceId: h.instanceId }) === null, "ハーピーガールでアタック")
    takeLifeAndResolve(s, "p2")
    settle(s)
    assert(s.players.p2.life === 4 && s.players.p1.life === 6, "自分のライフが6に増える")
}

console.log("=== 042 Lv2〜『アタック時』：Lv2/Lv3の相手のスピリットからブロックされない（Lv1は可）＋連鎖[赤]：BP3000以下の相手のスピリット1体を破壊 ===")
{
    const s = game("harpy-lv2", "p1", "attack")
    const h = put(s, "p1", HARPY, 2) // Lv2
    put(s, "p1", VAN, 1) // 赤シンボル
    const metal = put(s, "p2", METAL, 1) // BP3000（連鎖の対象）
    const lv1 = put(s, "p2", BELL, 1) // Lv1 BP3000
    const lv2 = put(s, "p2", STIRA, 3) // Lv2 BP5000
    assert(act(s, "p1", { type: "attack", instanceId: h.instanceId }) === null, "ハーピーガール Lv2 でアタック")
    settle(s, [metal.instanceId])
    assert(!onField(s, "p2", metal) && onField(s, "p2", lv2), "連鎖[赤]：BP3000以下のメタルバーンが破壊され、BP5000のスティラホーンは残る")
    assert(declareBlock(s, "p2", lv2.instanceId) !== null, "Lv2 のスピリットはブロックできない")
    assert(declareBlock(s, "p2", lv1.instanceId) === null, "Lv1 のスピリットはブロックできる")
}
{
    const s = game("harpy-nochain", "p1", "attack")
    const h = put(s, "p1", HARPY, 2)
    const metal = put(s, "p2", METAL, 1)
    assert(act(s, "p1", { type: "attack", instanceId: h.instanceId }) === null, "ハーピーガール Lv2 でアタック")
    settle(s, [metal.instanceId])
    assert(onField(s, "p2", metal), "赤シンボルが無ければ連鎖で破壊しない")
}
{
    const s = game("harpy-lv1", "p1", "attack")
    const h = put(s, "p1", HARPY, 1) // Lv1
    const lv2 = put(s, "p2", STIRA, 3)
    assert(act(s, "p1", { type: "attack", instanceId: h.instanceId }) === null, "ハーピーガール Lv1 でアタック")
    assert(declareBlock(s, "p2", lv2.instanceId) === null, "Lv1 のハーピーガールは Lv2 のスピリットからブロックされる")
}

console.log("=== 043 Lv1〜『相手のアタックステップ』：自分の黄のスピリットが回復状態の相手のスピリットをブロックしたとき、そのスピリットを破壊する ===")
{
    const s = game("etoile-block", "p2", "attack")
    put(s, "p1", ETOILE, 1)
    const pony = put(s, "p1", PONY, 1) // 黄・BP4000
    const atk = put(s, "p2", STIRA, 4) // Lv3 BP8000
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
    atk.isRested = false // アタックしても回復状態の個体（効果で回復した場面）
    assert(declareBlock(s, "p1", pony.instanceId) === null, "黄のポニサスでブロック")
    finishBattle(s)
    assert(!onField(s, "p2", atk), "回復状態のアタッカーはブロックされた時点で破壊される")
    assert(onField(s, "p1", pony), "BP8000と戦わずに済むのでポニサスは残る")
}
{
    const s = game("etoile-nonyellow", "p2", "attack")
    put(s, "p1", ETOILE, 1)
    const bell = put(s, "p1", BELL, 1) // 白
    const atk = put(s, "p2", STIRA, 4)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
    atk.isRested = false
    assert(declareBlock(s, "p1", bell.instanceId) === null, "白のベルでブロック")
    finishBattle(s)
    assert(onField(s, "p2", atk) && !onField(s, "p1", bell), "黄でないスピリットのブロックでは破壊されず、通常のBP比べになる")
}
{
    const s = game("etoile-rested", "p2", "attack")
    put(s, "p1", ETOILE, 1)
    const pony = put(s, "p1", PONY, 1)
    const atk = put(s, "p2", STIRA, 4)
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "アタック")
    assert(atk.isRested, "通常のアタッカーは疲労状態")
    assert(declareBlock(s, "p1", pony.instanceId) === null, "黄のポニサスでブロック")
    finishBattle(s)
    assert(onField(s, "p2", atk) && !onField(s, "p1", pony), "疲労状態のアタッカーは破壊されず、通常のBP比べでポニサスが負ける")
}

console.log("=== 043 Lv2〜『アタック時』：このターンの間、相手のスピリット1体をBP-3000 ===")
{
    const s = game("etoile-bp", "p1", "attack")
    const e = put(s, "p1", ETOILE, 2) // Lv2
    const pony = put(s, "p2", PONY, 3) // Lv2 BP6000
    assert(act(s, "p1", { type: "attack", instanceId: e.instanceId }) === null, "エトワール Lv2 でアタック")
    settle(s, [pony.instanceId])
    assert(effectiveBp(s, "p2", pony) === 3000, "選んだポニサスはBP-3000（6000→3000）")
}
{
    const s = game("etoile-bp-lv1", "p1", "attack")
    const e = put(s, "p1", ETOILE, 1) // Lv1
    const pony = put(s, "p2", PONY, 3)
    assert(act(s, "p1", { type: "attack", instanceId: e.instanceId }) === null, "エトワール Lv1 でアタック")
    settle(s, [pony.instanceId])
    assert(effectiveBp(s, "p2", pony) === 6000, "Lv1 にはアタック時のBP-3000が無い")
}

console.log("=== 044 【合体時】Lv2〜『バトル時』（ブロック側）：合体キリエルがブロックして相手を破壊したら1枚ドロー ===")
function kirielBlock(seed: string, atkCores: number): { s: GameState; atk: Inst } {
    const s = game(seed, "p2", "attack")
    const kiriel = put(s, "p1", KIRIEL, 2)
    combine(s, "p1", kiriel, KARAKURI)
    const atk = put(s, "p2", STIRA, atkCores)
    if (atkCores === 4) giveBp(s, atk, 20000) // 確実に負けるBP
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    assert(declareBlock(s, "p1", kiriel.instanceId) === null, "合体キリエルでブロック")
    finishBattle(s)
    settle(s)
    return { s, atk }
}
{
    const { s, atk } = kirielBlock("kiriel-block-draw", 1) // 相手 Lv1・BP3000 を破壊できる（BP9000？Lv2 BP7000 で勝つ）
    assert(!onField(s, "p2", atk) && s.players.p1.hand.length === 1, "ブロックして相手を破壊したので1枚ドロー")
}
{
    const { s, atk } = kirielBlock("kiriel-block-lose", 4) // 相手 Lv3 BP8000 に負ける
    assert(onField(s, "p2", atk) && s.players.p1.hand.length === 0, "相手を破壊できなければドローしない")
}
{
    const s = game("kiriel-effect-destroy", "p1", "main")
    const kiriel = put(s, "p1", KIRIEL, 2)
    combine(s, "p1", kiriel, KARAKURI)
    const v = put(s, "p2", VAN, 1)
    destroySpirit(s, "p2", v.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s)
    assert(!onField(s, "p2", v) && s.players.p1.hand.length === 0, "バトル外の効果による破壊ではドローしない")
}

console.log("=== 044 Lv1〜『自分のアタックステップ』：天霊のスピリットはBPのかわりにLvを比べ、低いほうが破壊される／同じなら両方破壊 ===")
{
    const s = game("kiriel-equal", "p1", "attack")
    put(s, "p1", KIRIEL, 1)
    const atk = put(s, "p1", TENSHI, 1) // 天霊 Lv1 BP3000
    const blk = put(s, "p2", VAN, 1) // Lv1 BP1000
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "天使パワーでアタック")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "ロクケラトプスでブロック")
    finishBattle(s)
    assert(!onField(s, "p1", atk) && !onField(s, "p2", blk), "Lvが同じなら（BPが違っても）お互いに破壊される")
}
{
    const s = game("kiriel-higher-lv", "p1", "attack")
    put(s, "p1", KIRIEL, 1)
    const atk = put(s, "p1", TENSHI, 2) // Lv2 BP6000
    const blk = put(s, "p2", VAN, 1) // Lv1
    giveBp(s, blk, 9000) // BP10000
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "天使パワー Lv2 でアタック")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "Lv1（BP10000）でブロック")
    finishBattle(s)
    assert(onField(s, "p1", atk) && !onField(s, "p2", blk), "BPが低くてもLvが高い天使パワーが勝ち、Lvの低いブロッカーだけ破壊される")
}
{
    const s = game("kiriel-nonreiryo", "p1", "attack")
    put(s, "p1", KIRIEL, 1)
    const atk = put(s, "p1", METAL, 1) // 天霊でない Lv1 BP3000
    const blk = put(s, "p2", VAN, 1)
    giveBp(s, blk, 9000)
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "メタルバーンでアタック")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "ブロック")
    finishBattle(s)
    assert(!onField(s, "p1", atk) && onField(s, "p2", blk), "天霊でないスピリットは通常のBP比べ（Lvが同じでも相打ちにならない）")
}
{
    const s = game("kiriel-opp-step", "p2", "attack")
    put(s, "p1", KIRIEL, 1)
    const tenshi = put(s, "p1", TENSHI, 1) // BP3000
    const atk = put(s, "p2", VAN, 1) // BP1000
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    assert(declareBlock(s, "p1", tenshi.instanceId) === null, "天使パワーでブロック")
    finishBattle(s)
    assert(onField(s, "p1", tenshi) && !onField(s, "p2", atk), "自分のアタックステップではないので通常のBP比べ（天使パワーは残る）")
}

console.log("=== 044 Lv2〜【強化】：自分の「BP-効果」を-1000する（エトワールのBP-3000が-4000に） ===")
for (const kLv of [2, 1]) {
    const s = game(`kiriel-kyoka-${kLv}`, "p1", "attack")
    put(s, "p1", KIRIEL, kLv) // コア数 = Lv（1/2）
    const e = put(s, "p1", ETOILE, 2)
    const pony = put(s, "p2", PONY, 3) // BP6000
    assert(act(s, "p1", { type: "attack", instanceId: e.instanceId }) === null, "エトワール Lv2 でアタック")
    settle(s, [pony.instanceId])
    assert(effectiveBp(s, "p2", pony) === (kLv === 2 ? 2000 : 3000), kLv === 2 ? "キリエル Lv2：BP-4000（6000→2000）" : "キリエル Lv1：【強化】が無くBP-3000（6000→3000）")
}

console.log("=== 044 【合体時】Lv2〜『バトル時』：相手のスピリットを破壊したとき、1枚ドロー ===")
function kirielBattle(seed: string, kCores: number, withBrave: boolean, blkCores: number): { s: GameState; kiriel: Inst; blk: Inst } {
    const s = game(seed, "p1", "attack")
    const kiriel = put(s, "p1", KIRIEL, kCores)
    if (withBrave) combine(s, "p1", kiriel, KARAKURI)
    const blk = put(s, "p2", STIRA, blkCores)
    assert(act(s, "p1", { type: "attack", instanceId: kiriel.instanceId }) === null, "キリエルでアタック")
    assert(declareBlock(s, "p2", blk.instanceId) === null, "スティラホーンでブロック")
    finishBattle(s)
    settle(s)
    return { s, kiriel, blk }
}
{
    const { s, blk } = kirielBattle("kiriel-draw", 2, true, 1) // キリエル Lv2 合体 vs Lv1：Lv比べで勝つ
    assert(!onField(s, "p2", blk), "Lvが高いキリエルが相手を破壊する")
    assert(s.players.p1.hand.length === 1, "相手のスピリットを破壊したので1枚ドロー")
}
{
    const { s } = kirielBattle("kiriel-draw-tie", 2, true, 3) // Lv2 同士の相打ち
    assert(s.players.p2.field.spirits.length === 0 && s.players.p1.hand.length === 1, "相打ちで相手を破壊しても1枚ドロー")
}
{
    const { s, kiriel } = kirielBattle("kiriel-nodraw-lose", 2, true, 4) // 相手が Lv3 で負ける
    assert(!onField(s, "p1", kiriel) && s.players.p1.hand.length === 0, "相手を破壊できなければドローしない")
}
{
    const { s, blk } = kirielBattle("kiriel-nodraw-alone", 2, false, 1) // 合体していない
    assert(!onField(s, "p2", blk) && s.players.p1.hand.length === 0, "合体していなければドローしない")
}
{
    const { s, blk } = kirielBattle("kiriel-nodraw-lv1", 1, true, 1) // Lv1（相打ち）
    assert(!onField(s, "p2", blk) && s.players.p1.hand.length === 0, "Lv1 では合体していてもドローしない")
}

console.log("=== 063 【合体時】相手に破壊されたとき、自分の黄のスピリット1体を疲労させることで、このスピリットは疲労状態で残る ===")
{
    const s = game("pentan-accept")
    const host = put(s, "p1", PONY, 1)
    combine(s, "p1", host, PENTAN)
    const lamp = put(s, "p1", LAMP, 1)
    destroyByOpp(s, host)
    settle(s, [lamp.instanceId])
    assert(onField(s, "p1", host) && host.isRested, "ポニサスは疲労状態で場に残る")
    assert(lamp.isRested, "コストとして黄のランプキンが疲労する")
}
{
    const s = game("pentan-decline")
    const host = put(s, "p1", PONY, 1)
    combine(s, "p1", host, PENTAN)
    const lamp = put(s, "p1", LAMP, 1)
    destroyByOpp(s, host)
    settle(s, [lamp.instanceId], false)
    assert(!onField(s, "p1", host), "断れば破壊される")
    assert(!lamp.isRested, "断ればランプキンは疲労しない")
}
{
    const s = game("pentan-own")
    const host = put(s, "p1", PONY, 1)
    combine(s, "p1", host, PENTAN)
    const lamp = put(s, "p1", LAMP, 1)
    destroySpirit(s, "p1", host.instanceId, "destroy", { sourcePid: "p1", sourceType: "magic" })
    settle(s, [lamp.instanceId])
    assert(!onField(s, "p1", host) && !lamp.isRested, "自分の効果による破壊では残らない")
}

console.log("=== 064 Lv1『このブレイヴの召喚時』：このターンの間、相手のスピリット1体をBP-4000（ターン終了で戻る） ===")
{
    const s = game("sweets")
    const pony = put(s, "p2", PONY, 3) // BP6000
    summon(s, "p1", [SWEETS], [pony.instanceId])
    assert(effectiveBp(s, "p2", pony) === 2000, "ポニサスはBP-4000（6000→2000）")
    endTurn(s)
    assert(effectiveBp(s, "p2", pony) === 6000, "ターンが終わるとBPが戻る")
}

console.log("=== 082 メイン：ボイドからコア1個をライフに置く＋連鎖[赤]：BP合計5000まで相手のスピリットを好きなだけ破壊 ===")
{
    const s = game("liferev-main")
    put(s, "p1", VAN, 1) // 赤シンボル
    const stira = put(s, "p2", STIRA, 1) // 3000
    const van2 = put(s, "p2", VAN, 1) // 1000
    const bell = put(s, "p2", BELL, 1) // 3000
    s.players.p1.hand = [LIFEREV]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ライフレボリューションをメインで使用できる")
    settle(s, [stira.instanceId, van2.instanceId, bell.instanceId])
    assert(s.players.p1.life === 6, "ライフが6に増える")
    assert(!onField(s, "p2", stira) && !onField(s, "p2", van2), "合計4000のスティラホーンとロクケラトプスが破壊される")
    assert(onField(s, "p2", bell), "さらにベルを破壊すると合計5000を超えるので残る")
}
{
    const s = game("liferev-big")
    put(s, "p1", VAN, 1)
    const pony = put(s, "p2", PONY, 3) // 6000
    s.players.p1.hand = [LIFEREV]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使用")
    settle(s, [pony.instanceId])
    assert(s.players.p1.life === 6 && onField(s, "p2", pony), "BP5000を超える1体は破壊できない（ライフは増える）")
}
{
    const s = game("liferev-nochain")
    put(s, "p1", PONY, 1) // 赤シンボルなし
    const stira = put(s, "p2", STIRA, 1)
    s.players.p1.hand = [LIFEREV]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "メインで使用")
    settle(s, [stira.instanceId])
    assert(s.players.p1.life === 6 && onField(s, "p2", stira), "赤シンボルが無ければ連鎖で破壊しない（ライフは増える）")
}
{
    const s = game("liferev-once")
    put(s, "p1", VAN, 1)
    const stira = put(s, "p2", STIRA, 1)
    const van2 = put(s, "p2", VAN, 1)
    const bell = put(s, "p2", BELL, 1)
    const metal = put(s, "p2", METAL, 1)
    s.players.p1.hand = [LIFEREV, LIFEREV]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "1枚目を使用")
    settle(s, [stira.instanceId, van2.instanceId])
    const r = act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" })
    if (r === null) settle(s, [bell.instanceId, metal.instanceId])
    assert(s.players.p1.life === 6, "ターンに1回：2枚目ではライフが増えない")
    assert(onField(s, "p2", bell) && onField(s, "p2", metal), "2枚目では連鎖の破壊も起きない")
}

console.log("=== 082 フラッシュ：このターンの間、スピリット1体をBP+3000（自分・相手どちらでも／ライフは増えず破壊もしない） ===")
for (const target of ["own", "opp"] as const) {
    const s = game(`liferev-flash-${target}`, "p2", "attack")
    const mine = put(s, "p1", PONY, 1) // BP4000
    put(s, "p1", VAN, 1)
    const bell = put(s, "p2", BELL, 1)
    const atk = put(s, "p2", METAL, 1) // BP3000
    s.players.p1.hand = [LIFEREV]
    assert(act(s, "p2", { type: "attack", instanceId: atk.instanceId }) === null, "相手がアタック")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ライフレボリューションをフラッシュで使用できる")
    settle(s, [target === "own" ? mine.instanceId : atk.instanceId])
    if (target === "own") assert(effectiveBp(s, "p1", mine) === 7000, "選んだ自分のポニサスがBP+3000（4000→7000）")
    else assert(effectiveBp(s, "p2", atk) === 6000, "選んだ相手のメタルバーンがBP+3000（3000→6000）")
    assert(s.players.p1.life === 5 && onField(s, "p2", bell), "フラッシュ側にはライフ増加も連鎖の破壊も無い")
}

console.log("=== X13-05 Lv1〜『召喚時』：このターンの間、相手のスピリット1体をBP-3000 ===")
{
    const s = game("mika-summon")
    const pony = put(s, "p2", PONY, 3) // BP6000
    const stira = put(s, "p2", STIRA, 1)
    summon(s, "p1", [MIKA], [pony.instanceId])
    assert(effectiveBp(s, "p2", pony) === 3000 && effectiveBp(s, "p2", stira) === 3000, "選んだポニサスだけBP-3000（6000→3000）。選ばないスティラホーンは3000のまま")
}

console.log("=== X13-05 Lv1〜：合体条件を無視して合体できる（ほかのスピリットは条件を満たさなければ合体できない） ===")
{
    const s = game("mika-combine")
    const mika = put(s, "p1", MIKA, 1) // コスト4
    const lamp = put(s, "p1", LAMP, 1) // コスト4・天霊/想獣でない
    const braveA = createInstance(SKULL, s.turn, 0) // 合体条件コスト5以上
    const braveB = createInstance(SKULL, s.turn, 0)
    s.players.p1.field.spirits.push(braveA, braveB)
    refreshLevelAsOverrides(s)
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: braveA.instanceId, hostInstanceId: lamp.instanceId }) !== null, "コスト4のランプキンは条件（コスト5以上）を満たさず合体できない")
    assert(handleAction(s, "p1", { type: "combineBrave", braveInstanceId: braveB.instanceId, hostInstanceId: mika.instanceId }) === null, "ミカリーンは条件を無視して合体できる")
}

console.log("=== X13-05 Lv3『アタック時』：山札の上3枚を見て、その中のマジック1枚を手札に加え、残りは好きな順で山札の上に戻す ===")
function mikaAttack(seed: string, cores: number, top: string[]): GameState {
    const s = game(seed, "p1", "attack")
    s.players.p1.deck = [...top, ...Array.from({ length: 37 }, () => VAN)]
    const mika = put(s, "p1", MIKA, cores)
    assert(act(s, "p1", { type: "attack", instanceId: mika.instanceId }) === null, "ミカリーンでアタック")
    settle(s)
    return s
}
{
    const s = mikaAttack("mika-lv3", 3, [VAN, RIBBON, METAL])
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === RIBBON, "上3枚のマジック（ドリームリボン）が手札に加わる")
    assert(s.players.p1.deck.length === 39 && s.players.p1.deck.slice(0, 2).sort().join() === [VAN, METAL].sort().join(), "残りの2枚は山札の上に戻る")
}
{
    const s = mikaAttack("mika-two-magic", 3, [RIBBON, VAN, RIBBON])
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === RIBBON, "マジックが2枚あっても手札に加えるのは1枚")
    assert(s.players.p1.deck.length === 39 && s.players.p1.deck.filter((c, i) => i < 2 && c === RIBBON).length === 1, "もう1枚のマジックは山札の上に戻る")
}
{
    const s = mikaAttack("mika-nomagic", 3, [VAN, METAL, BELL])
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "マジックが無ければ手札は増えず、3枚とも山札に戻る")
}
{
    const s = mikaAttack("mika-lv2", 2, [VAN, RIBBON, METAL])
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck[1] === RIBBON, "Lv2 にはアタック時の効果が無い")
}

console.log("=== X13-09 Lv1･Lv2『召喚時』：自分のトラッシュにあるマジックカード1枚を手札に戻す ===")
{
    const s = game("trick-magic")
    s.players.p1.trashCards = [VAN, RIBBON, METAL]
    summon(s, "p1", [TRICK])
    assert(s.players.p1.hand.length === 1 && s.players.p1.hand[0] === RIBBON, "トラッシュのマジックが手札に戻る")
    assert(s.players.p1.trashCards.length === 2 && !s.players.p1.trashCards.includes(RIBBON), "トラッシュからはマジックが無くなる")
}
{
    const s = game("trick-two")
    s.players.p1.trashCards = [RIBBON, RIBBON, VAN]
    summon(s, "p1", [TRICK])
    assert(s.players.p1.hand.length === 1 && s.players.p1.trashCards.filter((c) => c === RIBBON).length === 1, "マジックが2枚あっても戻すのは1枚")
}
{
    const s = game("trick-nomagic")
    s.players.p1.trashCards = [VAN, METAL]
    summon(s, "p1", [TRICK])
    assert(s.players.p1.hand.length === 0 && s.players.p1.trashCards.length === 2, "マジックが無ければ何も戻らない")
}
{
    const s = game("trick-opp")
    s.players.p2.trashCards = [RIBBON]
    s.players.p1.trashCards = []
    summon(s, "p1", [TRICK])
    assert(s.players.p1.hand.length === 0 && s.players.p2.trashCards.length === 1, "相手のトラッシュのマジックは戻せない")
}

console.log("すべてのチェックに合格しました 🎉（part828）")
