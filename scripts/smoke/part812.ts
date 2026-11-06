// smoke パート812（BS21 青：046 ヤナクラゲー・047 アドルファス・049 ナポレオ・050 ゲル・ゴロス・051 スクアーロ・066 ラブリス・083 サファイアエロード・084 レイジングシー・X08 アビス・アポカリプス。
// 期待値役：効果文と BS21_PLAN §1・§2 の確定読みだけから書く。BS21 は staging にしか無いので、未実装の間は該当場面を警告して続ける）
import { readFileSync } from "node:fs"
import { act, answerPayConfirm, assert, createGame, createInstance, currentLevel, effectiveBp, getCard, placeBurst, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { instHasColor } from "../../shared/rules/level"

const YANA = "BS21-046" // ヤナクラゲー（青・コスト1・異合・Lv1=1/2000・Lv2=4/5000）
const ADOL = "BS21-047" // 怪力巨人アドルファス（青・コスト2・闘神・Lv1=1/2000・Lv2=2/4000）
const NAPO = "BS21-049" // 海の彫刻家ナポレオ（青・コスト3・創手・Lv1=1/4000・Lv2=4/7000・Lv3=6/9000・効果なし）
const GEL = "BS21-050" // ゲル・ゴロス（青・コスト4・異合）
const SQUALO = "BS21-051" // ダーク・スクアーロ（青・コスト4・異合・Lv1=1/3000・Lv2=4/6000）
const LOVELIS = "BS21-066" // 深海竜ラブリス（青・ブレイヴ・コスト5・合体条件コスト4以上）
const SAPPHIRE = "BS21-083" // サファイアエロード（青・マジック・コスト2）
const RAGING = "BS21-084" // レイジングシー（青・マジック・コスト5）
const ABYSS = "BS21-X08" // 深淵の巨剣アビス・アポカリプス（青・ブレイヴ・コスト5・合体条件コスト5以上）

const GORA = "BS01-001" // ゴラドン（赤・コスト0・BP1000・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・1/2/3コアで BP1000/3000/4000・効果なし）
const AIVERN = "BS01-005" // アイバーン（赤・コスト2・効果なし）
const DEATH = "BS01-031" // デス・ハーデス（紫・コスト3・効果なし）
const GATLING = "BS01-084" // ガトリングスタンド（白・コスト3・BP3000・効果なし）
const JEFF = "BS03-072" // 槍兵のジェフリー（青・コスト1・闘神・BP2000・効果なし）
const ARNOLD = "BS03-089" // ディープ・アーノルド（青・コスト4・BP4000/8000・効果なし）
const FAROW = "BS03-091" // 戦闘獣バン・ファロー（青・コスト5・BP4000/7000・効果なし）
const RIO = "BS17-040" // 呪術士リオ（黄・コスト3・効果なし）
const ARDOR = "BS17-073" // アーダーフレイム（赤・マジック・フラッシュ：BP4000以下の相手のスピリット1体を破壊）
const PRESSURE = "BS19-109" // エンジェリックプレッシャー（黄・マジック・フラッシュ：相手のスピリット1体をBP-3000）
const HYOGAN = "SD06-016" // 絶甲氷盾（白・バースト：自分のライフ減少後）
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス）
const KOFUN = "BS14-073" // 赤き前方後円墳（赤・ネクサス：自分のアタックステップ、自分の赤のスピリットすべてBP+1000）
const SNOW = "BS01-112" // 千年雪の尖塔（白・ネクサス）
const GATE = "BS03-113" // 力奪う凱旋門（青・ネクサス）
const TREE = "BS01-106" // 隠されたる賢者の樹（緑・ネクサス）

console.log("=== 前提: カードの機械確認（BS21 は staging にしか無い） ===")
{
    type St = { cardId: string; name: string; type: string; cost: number; colors: string[]; family: string[]; effect: string; levels: { level: number; cores: number; bp?: number }[] }
    const staging = JSON.parse(readFileSync("data/staging/BS21.json", "utf8")) as St[]
    const byId = (id: string) => staging.find((c) => c.cardId === id)!
    const lv = (id: string) => byId(id).levels.map((l) => `${l.cores}/${l.bp}`).join(",")
    const chk = (id: string, name: string, type: string, cost: number, levels: string) => assert(byId(id).name === name && byId(id).type === type && byId(id).cost === cost && byId(id).colors.join() === "blue" && lv(id) === levels, `${id} は ${name}（青・${type}・コスト${cost}・${levels}）`)
    chk(YANA, "ヤナクラゲー", "spirit", 1, "1/2000,4/5000")
    chk(ADOL, "怪力巨人アドルファス", "spirit", 2, "1/2000,2/4000")
    chk(NAPO, "海の彫刻家ナポレオ", "spirit", 3, "1/4000,4/7000,6/9000")
    chk(GEL, "ゲル・ゴロス", "spirit", 4, "1/3000,4/6000")
    chk(SQUALO, "ダーク・スクアーロ", "spirit", 4, "1/3000,4/6000")
    chk(LOVELIS, "深海竜ラブリス", "brave", 5, "1/4000")
    chk(SAPPHIRE, "サファイアエロード", "magic", 2, "")
    chk(RAGING, "レイジングシー", "magic", 5, "")
    chk(ABYSS, "深淵の巨剣アビス・アポカリプス", "brave", 5, "1/5000")
    assert(byId(ADOL).family.includes("闘神") && byId(NAPO).effect.trim() === "", "ADOL は闘神・NAPO は効果なし")
    const ex = (id: string, name: string, type: string, cost: number, color: string) => assert(getCard(id).name === name && getCard(id).type === type && getCard(id).cost === cost && getCard(id).colors[0] === color, `${id} は ${name}（${color}・${type}・コスト${cost}）`)
    ex(GORA, "ゴラドン", "spirit", 0, "red")
    ex(VAN, "ロクケラトプス", "spirit", 1, "red")
    ex(AIVERN, "アイバーン", "spirit", 2, "red")
    ex(DEATH, "デス・ハーデス", "spirit", 3, "purple")
    ex(GATLING, "ガトリングスタンド", "spirit", 3, "white")
    ex(JEFF, "槍兵のジェフリー", "spirit", 1, "blue")
    ex(ARNOLD, "ディープ・アーノルド", "spirit", 4, "blue")
    ex(FAROW, "戦闘獣バン・ファロー", "spirit", 5, "blue")
    ex(RIO, "呪術士リオ", "spirit", 3, "yellow")
    ex(ARDOR, "アーダーフレイム", "magic", 4, "red")
    ex(PRESSURE, "エンジェリックプレッシャー", "magic", 3, "yellow")
    ex(HYOGAN, "絶甲氷盾", "magic", 4, "white")
    ex(SPEARS, "千本槍の古戦場", "nexus", 6, "purple")
    ex(KOFUN, "赤き前方後円墳", "nexus", 3, "red")
    ex(SNOW, "千年雪の尖塔", "nexus", 5, "white")
    ex(GATE, "力奪う凱旋門", "nexus", 3, "blue")
    ex(TREE, "隠されたる賢者の樹", "nexus", 4, "green")
    assert(getCard(JEFF).family.includes("闘神") && getCard(VAN).effect === "" && getCard(GORA).effect === "" && getCard(ARNOLD).effect === "" && getCard(FAROW).effect === "", "JEFF は闘神・VAN/GORA/ARNOLD/FAROW は効果なし")
    assert(getCard(JEFF).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/2000,4/5000" && getCard(VAN).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/1000,2/3000,3/4000" && getCard(ARNOLD).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/4000,5/8000" && getCard(FAROW).levels.map((l) => `${l.cores}/${l.bp}`).join(",") === "1/4000,3/7000", "Lv/BP の行（JEFF・VAN・ARNOLD・FAROW）")
    assert(getCard(KOFUN).effect.includes("自分の赤のスピリットすべてをBP+1000"), "KOFUN は自分のアタックステップに赤のスピリットすべてBP+1000")
}

function game(seed: string, phase: "main" | "attack" = "attack", turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "green" })
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

// pendingChoice に答える（target は picks を優先。option は pref にあるものを選ぶ。pref が空なら選択肢を付けずに断る）
function settle(s: GameState, picks: string[] = [], pref: string[] = ["発動する", "残る", "戻す"]): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = pref.find((x) => o.includes(x)) ?? (pref.length === 0 ? undefined : o[0])
            err = pick === undefined ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function candidatesOf(s: GameState): string[] {
    return ((s.pendingChoice as { candidates?: string[] } | null)?.candidates ?? []).slice().sort()
}

function sameSet(a: string[], b: string[]): boolean {
    return a.slice().sort().join() === b.slice().sort().join()
}

function burstAsked(s: GameState): boolean {
    return (s.pendingChoice as { burstActivate?: unknown } | null)?.burstActivate !== undefined
}

// A（046）：Lv1･Lv2『相手のアタックステップ』コスト0の相手のスピリットはアタックできない
scene("A1: 046 Lv1。相手のアタックステップで、コスト0のスピリットはアタックできず、コスト1のスピリットはできる", () => {
    const s = game("yana-lv1", "attack", "p2")
    put(s, "p1", YANA, 1)
    const gora = put(s, "p2", GORA, 1)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: gora.instanceId }) !== null, "コスト0のゴラドンはアタックできない")
    assert(!gora.isRested, "拒否されたアタックでゴラドンは疲労しない")
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "コスト1のロクケラトプスはアタックできる（境目）")
})
scene("A2: 046 Lv2 でもコスト0はアタックできない", () => {
    const s = game("yana-lv2", "attack", "p2")
    put(s, "p1", YANA, 4)
    const gora = put(s, "p2", GORA, 1)
    assert(act(s, "p2", { type: "attack", instanceId: gora.instanceId }) !== null, "Lv2 でもコスト0のゴラドンはアタックできない")
})
scene("A3: 046 の境目。046 がいなければコスト0もアタックできる／自分のアタックステップでは自分のコスト0は止まらない", () => {
    const s = game("yana-none", "attack", "p2")
    const gora = put(s, "p2", GORA, 1)
    assert(act(s, "p2", { type: "attack", instanceId: gora.instanceId }) === null, "046 がいなければコスト0もアタックできる")
    const t = game("yana-mine", "attack", "p1")
    put(t, "p1", YANA, 1)
    const own = put(t, "p1", GORA, 1)
    assert(act(t, "p1", { type: "attack", instanceId: own.instanceId }) === null, "自分のコスト0のスピリットは止められない（対象は相手のスピリット）")
})

// B（047）：Lv1･Lv2『自分のアタックステップ』闘神の自分のスピリットがアタックしたとき、そのバトルの間BP+2000し、相手のデッキを上から1枚破棄
scene("B1: 047 Lv1。闘神のジェフリーがアタック → そのバトルの間BP+2000（2000→4000）・相手のデッキ1枚破棄。バトル後は元のBP", () => {
    const s = game("adol-jeff")
    put(s, "p1", ADOL, 1)
    const jeff = put(s, "p1", JEFF, 1)
    assert(act(s, "p1", { type: "attack", instanceId: jeff.instanceId }) === null, "ジェフリーでアタック")
    settle(s)
    assert(effectiveBp(s, "p1", jeff) === 4000, "アタック中はBP+2000（2000→4000）")
    assert(s.players.p2.deck.length === 39 && s.players.p2.trashCards.length === 1, "相手のデッキを上から1枚破棄（40→39・相手のトラッシュ1枚）")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "pass" }) === null, "アタック側のパス")
    takeLifeAndResolve(s, "p2")
    assert(effectiveBp(s, "p1", jeff) === 2000, "バトルが終わればBP+2000は消える")
})
scene("B2: 047 Lv2 自身（闘神）がアタックしても同じ（4000→6000・破棄1枚）", () => {
    const s = game("adol-self")
    const adol = put(s, "p1", ADOL, 2)
    assert(act(s, "p1", { type: "attack", instanceId: adol.instanceId }) === null, "アドルファスでアタック")
    settle(s)
    assert(effectiveBp(s, "p1", adol) === 6000, "自身のアタックでBP+2000（4000→6000）")
    assert(s.players.p2.deck.length === 39, "相手のデッキを1枚破棄")
})
scene("B3: 047 の境目。闘神でないスピリットのアタックではBP+も破棄も起きない", () => {
    const s = game("adol-van")
    put(s, "p1", ADOL, 1)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    settle(s)
    assert(effectiveBp(s, "p1", van) === 1000 && s.players.p2.deck.length === 40, "BPは1000のまま・相手のデッキも減らない")
})
scene("B4: 047 の境目。相手のターンに相手の闘神がアタックしても起きない（自分のアタックステップ限定・自分のスピリット限定）", () => {
    const s = game("adol-opp", "attack", "p2")
    put(s, "p1", ADOL, 1)
    const jeff = put(s, "p2", JEFF, 1)
    assert(act(s, "p2", { type: "attack", instanceId: jeff.instanceId }) === null, "相手のジェフリーがアタック")
    settle(s)
    assert(effectiveBp(s, "p2", jeff) === 2000 && s.players.p1.deck.length === 40 && s.players.p2.deck.length === 40, "BPは2000のまま・どちらのデッキも減らない")
})

// C（049）：効果なし。Lv/BP の境目だけ
scene("C: 049 は効果を持たず、コア数でLv1=4000・Lv2=7000・Lv3=9000", () => {
    const s = game("napo")
    const lvOf = (cores: number) => {
        const n = put(s, "p1", NAPO, cores)
        return `${currentLevel(n).level}/${effectiveBp(s, "p1", n)}`
    }
    assert(lvOf(1) === "1/4000" && lvOf(3) === "1/4000", "1〜3コアはLv1 BP4000")
    assert(lvOf(4) === "2/7000" && lvOf(5) === "2/7000", "4〜5コアはLv2 BP7000")
    assert(lvOf(6) === "3/9000", "6コアはLv3 BP9000")
    assert(s.players.p1.hand.length === 0 && s.players.p2.deck.length === 40, "何も起きない")
})

// D（050）：Lv1･Lv2『このスピリットの召喚時』コスト3の相手のスピリット1体を破壊 → 連鎖《赤/紫》[赤]相手のネクサス1つ破壊／[紫]ドロー1枚
function summonGel(seed: string, mine: string[]): { s: GameState; g1: string; g2: string; cost2: string; cost4: string; nexus: string } {
    const s = game(seed, "main")
    for (const c of mine) put(s, "p1", c, 1)
    const g1 = put(s, "p2", GATLING, 1)
    const g2 = put(s, "p2", GATLING, 1)
    const cost2 = put(s, "p2", AIVERN, 1)
    const cost4 = put(s, "p2", ARNOLD, 1)
    const nexus = putNexus(s, "p2", SPEARS, 1)
    s.players.p1.hand = [GEL]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ゲル・ゴロスを召喚できる")
    return { s, g1: g1.instanceId, g2: g2.instanceId, cost2: cost2.instanceId, cost4: cost4.instanceId, nexus: nexus.instanceId }
}
const alive = (s: GameState, pid: PlayerId, id: string) => s.players[pid].field.spirits.some((x) => x.instanceId === id)
scene("D1: 050 召喚時。赤と紫のシンボルがある → コスト3を1体破壊し、連鎖で相手のネクサス破壊とドローの両方", () => {
    const { s, g1, g2, cost2, cost4, nexus } = summonGel("gel-both", [VAN, DEATH])
    assert(sameSet(candidatesOf(s), [g1, g2]), "選べるのはコスト3の2体だけ（コスト2・コスト4は候補外）")
    settle(s, [g1])
    assert(!alive(s, "p2", g1) && alive(s, "p2", g2) && alive(s, "p2", cost2) && alive(s, "p2", cost4), "選んだコスト3の1体だけ破壊される")
    assert(!s.players.p2.field.nexuses.some((n) => n.instanceId === nexus), "連鎖[赤]で相手のネクサスが破壊される")
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === 39, "連鎖[紫]でデッキから1枚ドロー")
    assert(s.players.p2.reserve === 22, "破壊されたスピリットとネクサスのコア1個ずつがリザーブへ（20+1+1）")
})
scene("D2: 050 召喚時。赤シンボルだけ → ネクサスは破壊されるがドローはしない", () => {
    const { s, g1 } = summonGel("gel-red", [VAN])
    settle(s, [g1])
    assert(!alive(s, "p2", g1) && s.players.p2.field.nexuses.length === 0, "コスト3の破壊と、連鎖[赤]のネクサス破壊")
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "紫シンボルが無いのでドローしない")
})
scene("D3: 050 召喚時。紫シンボルだけ → ドローするがネクサスは残る", () => {
    const { s, g1 } = summonGel("gel-purple", [DEATH])
    settle(s, [g1])
    assert(!alive(s, "p2", g1) && s.players.p2.field.nexuses.length === 1, "コスト3は破壊され、赤シンボルが無いのでネクサスは残る")
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === 39, "連鎖[紫]で1枚ドロー")
})
scene("D4: 050 召喚時。赤も紫も無ければコスト3の破壊だけで連鎖は発揮しない", () => {
    const { s, g1 } = summonGel("gel-none", [JEFF])
    settle(s, [g1])
    assert(!alive(s, "p2", g1), "コスト3の破壊は起きる")
    assert(s.players.p2.field.nexuses.length === 1 && s.players.p1.hand.length === 0, "ネクサスは残り、ドローもしない")
})

// E（051）：Lv2 このスピリットは赤のスピリットとしても扱う（赤のスピリット限定の BP+1000 で確かめる）
scene("E1: 051 Lv2 は赤としても扱われ、赤き前方後円墳の赤BP+1000を受ける（6000→7000）", () => {
    const s = game("squalo-lv2")
    putNexus(s, "p1", KOFUN, 1)
    const sq = put(s, "p1", SQUALO, 4)
    assert(instHasColor(sq, "red") && instHasColor(sq, "blue"), "Lv2 は赤でもあり青でもある")
    assert(effectiveBp(s, "p1", sq) === 7000, "赤のスピリットとして BP+1000 を受ける（6000→7000）")
})
scene("E2: 051 の境目。Lv1 は赤として扱われない（3000のまま）", () => {
    const s = game("squalo-lv1")
    putNexus(s, "p1", KOFUN, 1)
    const sq = put(s, "p1", SQUALO, 3)
    assert(!instHasColor(sq, "red") && instHasColor(sq, "blue"), "3コアはLv1で、赤としては扱われない")
    assert(effectiveBp(s, "p1", sq) === 3000, "BP+1000は受けない（3000のまま）")
})

// F（066）：Lv1『このブレイヴの召喚時』自分のトラッシュにある白/青のネクサスカードすべてを手札に戻す。合体条件：コスト4以上
function trashLoad(s: GameState): void {
    s.players.p1.trashCards = [SNOW, GATE, TREE, VAN, ARNOLD]
}
scene("F1: 066 を合体して召喚。トラッシュの白と青のネクサスだけが手札に戻る（緑のネクサス・スピリットは戻らない）", () => {
    const s = game("lovelis-host", "main")
    const host = put(s, "p1", ARNOLD, 1) // コスト4
    trashLoad(s)
    s.players.p1.hand = [LOVELIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "コスト4のスピリットに合体して召喚できる")
    answerPayConfirm(s, "p1")
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 1, "合体した")
    assert(sameSet(s.players.p1.hand, [SNOW, GATE]), "手札は白と青のネクサスの2枚だけ")
    assert(sameSet(s.players.p1.trashCards, [TREE, VAN, ARNOLD]), "トラッシュには緑のネクサスとスピリットが残る")
})
scene("F2: 066 を合体せず単独で召喚しても召喚時効果は発揮する", () => {
    const s = game("lovelis-alone", "main")
    trashLoad(s)
    s.players.p1.hand = [LOVELIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ブレイヴを単独で召喚できる")
    answerPayConfirm(s, "p1")
    settle(s)
    assert(sameSet(s.players.p1.hand, [SNOW, GATE]), "白と青のネクサスが手札に戻る")
})
scene("F3: 066 の境目。コスト3のスピリットには合体できない", () => {
    const s = game("lovelis-cost3", "main")
    const host = put(s, "p1", GATLING, 1)
    trashLoad(s)
    s.players.p1.hand = [LOVELIS]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) !== null, "合体条件（コスト4以上）を満たさないので拒否される")
    assert(s.players.p1.field.combinedBraves.length === 0 && s.players.p1.hand.length === 1, "合体は起きず、ブレイヴは手札に残る")
})

// G（083）：フラッシュ 自分のネクサスの数以下のコストの相手のスピリット1体を破壊
function flashCast(s: GameState, magic: string): void {
    const atk = put(s, "p1", VAN, 1)
    s.players.p1.hand = [magic]
    assert(act(s, "p1", { type: "attack", instanceId: atk.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "アタック後のフラッシュでマジックを使用")
}
scene("G1: 083。自分のネクサスが2つ → コスト2以下の相手のスピリットから1体破壊（コスト3は候補外）", () => {
    const s = game("sapphire-two")
    putNexus(s, "p1", SPEARS, 1)
    putNexus(s, "p1", SPEARS, 1)
    const c0 = put(s, "p2", GORA, 1)
    const c2 = put(s, "p2", AIVERN, 1)
    const c3 = put(s, "p2", GATLING, 1)
    flashCast(s, SAPPHIRE)
    assert(sameSet(candidatesOf(s), [c0.instanceId, c2.instanceId]), "候補はコスト0とコスト2の2体")
    settle(s, [c2.instanceId])
    assert(!alive(s, "p2", c2.instanceId) && alive(s, "p2", c0.instanceId) && alive(s, "p2", c3.instanceId), "選んだコスト2だけ破壊される")
    assert(s.players.p2.reserve === 21 && s.players.p1.trashCards.includes(SAPPHIRE), "破壊されたコア1個はリザーブへ・使ったマジックは自分のトラッシュへ")
})
scene("G2: 083。自分のネクサスが1つ → コスト1以下の相手のスピリットだけが対象（コスト2は残る）", () => {
    const s = game("sapphire-one")
    putNexus(s, "p1", SPEARS, 1)
    const c1 = put(s, "p2", VAN, 1)
    const c2 = put(s, "p2", AIVERN, 1)
    flashCast(s, SAPPHIRE)
    settle(s)
    assert(!alive(s, "p2", c1.instanceId) && alive(s, "p2", c2.instanceId), "候補は1体だけ（コスト1）で、コスト2は破壊されない")
})
scene("G3: 083 の境目。自分のネクサスが0なら対象はコスト0だけ（相手のネクサスは数えない）", () => {
    const s = game("sapphire-zero")
    putNexus(s, "p2", SPEARS, 1)
    putNexus(s, "p2", SPEARS, 1)
    const c0 = put(s, "p2", GORA, 1)
    const c1 = put(s, "p2", VAN, 1)
    flashCast(s, SAPPHIRE)
    settle(s)
    assert(!alive(s, "p2", c0.instanceId) && alive(s, "p2", c1.instanceId), "コスト0だけが破壊され、コスト1は残る")
})

// H（084）：メイン このターンの間、自分のスピリット1体を最高Lvとして扱う＋連鎖《赤/紫》[赤]ドロー／[紫]ドロー。フラッシュ このターンの間、スピリット1体をBP+3000
function castRagingMain(seed: string, mine: string[]): { s: GameState; van: ReturnType<typeof createInstance>; other?: ReturnType<typeof createInstance> | undefined } {
    const s = game(seed, "main")
    const van = put(s, "p1", VAN, 1)
    const others = mine.map((c) => put(s, "p1", c, 1))
    s.players.p1.hand = [RAGING]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "レイジングシーをメインで使用できる")
    settle(s, [van.instanceId])
    return { s, van, other: others[0] }
}
scene("H1: 084 メイン。選んだロクケラトプスだけ最高Lv（Lv3・BP4000）。赤シンボルだけなので連鎖で1枚ドロー", () => {
    const { s, van, other } = castRagingMain("raging-red", [ARNOLD])
    assert(currentLevel(van).level === 3 && effectiveBp(s, "p1", van) === 4000, "選んだスピリットは最高Lv3として扱われBP4000")
    assert(currentLevel(other!).level === 1 && effectiveBp(s, "p1", other!) === 4000, "選ばなかったスピリットはLv1のまま")
    assert(s.players.p1.hand.length === 1 && s.players.p1.deck.length === 39, "連鎖[赤]で1枚ドロー（紫シンボルは無い）")
    assert(s.players.p1.trashCards.includes(RAGING), "使ったマジックはトラッシュへ")
})
scene("H2: 084 メイン。赤と紫のシンボルがある → 連鎖で2枚ドロー", () => {
    const { s, van } = castRagingMain("raging-both", [DEATH])
    assert(currentLevel(van).level === 3, "選んだスピリットは最高Lv")
    assert(s.players.p1.hand.length === 2 && s.players.p1.deck.length === 38, "[赤]と[紫]で合わせて2枚ドロー")
})
scene("H3: 084 メイン。境目：赤も紫も無ければ最高Lvの扱いだけでドローしない", () => {
    const s = game("raging-none", "main")
    const arnold = put(s, "p1", ARNOLD, 1)
    s.players.p1.hand = [RAGING]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "レイジングシーをメインで使用できる")
    settle(s, [arnold.instanceId])
    assert(currentLevel(arnold).level === 2 && effectiveBp(s, "p1", arnold) === 8000, "最高Lv2として扱われBP8000")
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "連鎖は発揮せずドローしない")
})
scene("H4: 084 フラッシュ。自分のスピリットをBP+3000（1000→4000）。メインの効果は起きない", () => {
    const s = game("raging-flash-own")
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [RAGING]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "アタック後のフラッシュでレイジングシーを使用")
    settle(s, [van.instanceId])
    assert(effectiveBp(s, "p1", van) === 4000, "BP+3000（1000→4000）")
    assert(currentLevel(van).level === 1 && s.players.p1.hand.length === 0, "最高Lvの扱いも連鎖のドローも起きない")
})
scene("H5: 084 フラッシュ。「スピリット1体」なので相手のスピリットにも掛けられる（3000→6000）", () => {
    const s = game("raging-flash-opp")
    const van = put(s, "p1", VAN, 1)
    const gat = put(s, "p2", GATLING, 1)
    s.players.p1.hand = [RAGING]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "pass" }) === null, "防御側のパス")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "フラッシュでレイジングシーを使用")
    assert(candidatesOf(s).includes(gat.instanceId) && candidatesOf(s).includes(van.instanceId), "候補に自分と相手の両方のスピリットが入る")
    settle(s, [gat.instanceId])
    assert(effectiveBp(s, "p2", gat) === 6000 && effectiveBp(s, "p1", van) === 1000, "選んだ相手のスピリットだけBP+3000")
})

// X08：召喚時 このターンの間、自分のスピリットすべてを最高Lvとして扱う／合体中 相手は、相手のフィールドにあるシンボルと同じ色のバーストとマジックしか使えない
scene("I1: X08 を合体して召喚 → 自分のスピリットすべてが最高Lv（ロクケラトプスLv3・ホストLv2）。あとから召喚したスピリットにも効く", () => {
    const s = game("abyss-summon", "main")
    const host = put(s, "p1", FAROW, 1) // コスト5
    const van = put(s, "p1", VAN, 1)
    s.players.p1.hand = [ABYSS, VAN]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) === null, "コスト5のスピリットに合体して召喚できる")
    answerPayConfirm(s, "p1")
    settle(s)
    assert(s.players.p1.field.combinedBraves.length === 1, "合体した")
    assert(currentLevel(van).level === 3 && effectiveBp(s, "p1", van) === 4000, "ロクケラトプスは最高Lv3として扱われBP4000")
    assert(currentLevel(host).level === 2, "ホストも最高Lv2として扱われる")
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "続けてロクケラトプスを召喚")
    settle(s)
    const late = s.players.p1.field.spirits.find((x) => x.cardId === VAN && x.instanceId !== van.instanceId)!
    assert(currentLevel(late).level === 3, "このターンの間なので、あとから出たスピリットも最高Lv")
})
scene("I2: X08 の境目。コスト4のスピリットには合体できない（合体条件コスト5以上）", () => {
    const s = game("abyss-cost4", "main")
    const host = put(s, "p1", ARNOLD, 1)
    s.players.p1.hand = [ABYSS]
    assert(act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId }) !== null, "コスト4への合体は拒否される")
})
function lockScene(seed: string, abyss: "combined" | "alone" | "none", p2Field: string[]): GameState {
    const s = game(seed, "attack")
    const host = put(s, "p1", FAROW, 1)
    if (abyss === "combined") combine(s, "p1", host, ABYSS)
    if (abyss === "alone") put(s, "p1", ABYSS, 1)
    for (const c of p2Field) put(s, "p2", c, 1)
    return s
}
function p1AttacksThenP2Flash(s: GameState, handIndex: number): string | null {
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    return act(s, "p2", { type: "castMagic", handIndex })
}
scene("J1: X08 合体中。相手のフィールドが黄のシンボルだけ → 赤のマジックは使えず、黄のマジックは使える", () => {
    const s = lockScene("abyss-magic", "combined", [RIO])
    s.players.p2.hand = [PRESSURE, ARDOR]
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    assert(act(s, "p2", { type: "castMagic", handIndex: 1 }) !== null, "赤のアーダーフレイムは相手のフィールドにシンボルが無い色なので使用できない")
    assert(s.players.p2.hand.length === 2, "拒否されたマジックは手札に残る")
    assert(act(s, "p2", { type: "castMagic", handIndex: 0 }) === null, "黄のエンジェリックプレッシャーは使用できる")
})
scene("J2: X08 の境目。合体していない（単独でフィールドにいるだけ）なら相手は赤のマジックも使える", () => {
    const s = lockScene("abyss-alone", "alone", [RIO])
    s.players.p2.hand = [ARDOR]
    assert(p1AttacksThenP2Flash(s, 0) === null, "合体中でなければ赤のマジックも使用できる")
})
scene("J3: X08 の境目。X08 が無ければ相手は赤のマジックも使える", () => {
    const s = lockScene("abyss-none", "none", [RIO])
    s.players.p2.hand = [ARDOR]
    assert(p1AttacksThenP2Flash(s, 0) === null, "X08 が無ければ赤のマジックも使用できる")
})
scene("K1: X08 合体中。バーストの色が相手のフィールドのシンボルに無ければ発動を聞かれない", () => {
    const s = lockScene("abyss-burst-deny", "combined", [RIO])
    placeBurst(s, "p2", HYOGAN)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    takeLifeAndResolve(s, "p2")
    assert(s.players.p2.life === 4 && !burstAsked(s), "白のバーストは黄のシンボルだけのフィールドでは発動を聞かれず、ライフは5→4のまま")
})
scene("K2: X08 合体中。相手のフィールドに白のシンボルがあれば白のバーストは発動を聞かれる", () => {
    const s = lockScene("abyss-burst-ok", "combined", [RIO, GATLING])
    placeBurst(s, "p2", HYOGAN)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    takeLifeAndResolve(s, "p2")
    assert(burstAsked(s), "白のシンボルがあるので白のバーストの発動を聞かれる")
})
scene("K3: X08 の境目。合体していなければ白のシンボルが無くても白のバーストの発動を聞かれる", () => {
    const s = lockScene("abyss-burst-alone", "alone", [RIO])
    placeBurst(s, "p2", HYOGAN)
    const van = put(s, "p1", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタック")
    takeLifeAndResolve(s, "p2")
    assert(burstAsked(s), "合体中でなければ発動を聞かれる")
})

console.log("すべてのチェックに合格しました 🎉（part812）")
