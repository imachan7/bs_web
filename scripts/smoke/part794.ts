// smoke パート794（BS20-047〜053・066・083・084：コスト3以下の相手効果破壊で疲労状態で残留・アタック時Lv+1・ネクサスへコア・粉砕・召喚時破壊と合体時破壊・フィールドのコアを払ってブロックされない効果持ちを破壊・連鎖・マジック2枚）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, declareBlock, destroySpirit, effectiveBp, getCard, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const JILES = "BS20-047" // 海楯の守護者ジャイルズ（青・コスト3・Lv1=1・Lv2=3）
const DRACO = "BS20-048" // タツノ・ドラコ（青・コスト3・Lv1=1・Lv2=3・Lv3=5）
const KAMOONE = "BS20-049" // カモオネ（青・コスト4・Lv1=1・Lv2=4）
const DATAS = "BS20-050" // トライデントのデータス（青・コスト4・Lv1=1・Lv2=2・Lv3=4）
const AKASHI = "BS20-051" // 波濤の剣使いアカシ（青・コスト5・Lv1=1・Lv2=3）
const SANGO = "BS20-052" // 破戒僧サンゴジョー（青・コスト5・Lv1=1・Lv2=2）
const SEAPO = "BS20-053" // 異海獣シーポリープ（青・コスト6・Lv1=1・Lv2=2・Lv3=4）
const KONOHAGANIN = "BS20-066" // コノハガニン（青・ブレイヴ・コスト4・合体条件コスト4以上）
const CALLDEEP = "BS20-083" // コールオブディープ（青・マジック・コスト3）
const FINISH = "BS20-084" // フィニッシュブロー（青・マジック・コスト4）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）
const GREEN = "BS01-050" // ビートビートル（緑・コスト0・効果なし）緑シンボル用
const BONE = "BS01-035" // ボーン・グラディエイター（紫・コスト3）「緑のスピリットからブロックされない」効果持ち
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・効果なし）合体条件コスト4以上のホスト
const HAM = "BS15-059" // スターハム（黄・ブレイヴ・コスト4・合体条件コスト4以上）
const TARAN = "BS16-025" // タランドーズ（緑・コスト6・Lv1 BP6000・効果なし）ブロッカー
const DOLPHIN = "BS06-061" // ドルフィーノ（青・コスト0・効果なし）青のアタッカー
const NEXUS = "BS01-098" // 燃えさかる戦場（赤・ネクサス・コスト3）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; levels: { level: number; cores: number; bp: number }[] }[]
    const expect: [string, string, string, number, string][] = [
        [JILES, "海楯の守護者ジャイルズ", "spirit", 3, "1/3"],
        [DRACO, "タツノ・ドラコ", "spirit", 3, "1/3/5"],
        [KAMOONE, "カモオネ", "spirit", 4, "1/4"],
        [DATAS, "トライデントのデータス", "spirit", 4, "1/2/4"],
        [AKASHI, "波濤の剣使いアカシ", "spirit", 5, "1/3"],
        [SANGO, "破戒僧サンゴジョー", "spirit", 5, "1/2"],
        [SEAPO, "異海獣シーポリープ", "spirit", 6, "1/2/4"],
        [KONOHAGANIN, "コノハガニン", "brave", 4, "1"],
        [CALLDEEP, "コールオブディープ", "magic", 3, ""],
        [FINISH, "フィニッシュブロー", "magic", 4, ""],
    ]
    for (const [id, name, type, cost, cores] of expect) {
        const c = staging.find((x) => x.cardId === id)
        assert(c?.name === name && c.type === type && c.cost === cost, `${id}は${name}（${type}・コスト${cost}）`)
        if (cores) assert(c?.levels.map((l) => l.cores).join("/") === cores, `${id}のLvコアは${cores}`)
    }
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1 && getCard(VAN).effect === "", "VANはロクケラトプス（コスト1・効果なし）")
    assert(getCard(GREEN).name === "ビートビートル" && getCard(GREEN).colors[0] === "green" && getCard(GREEN).effect === "", "GREENはビートビートル（緑・効果なし）")
    assert(getCard(BONE).name === "ボーン・グラディエイター" && (getCard(BONE).effect ?? "").includes("ブロックされない"), "BONEはブロックされない効果を持つスピリット")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).effect === "" && getCard(BELL).levels[0]!.bp === 3000 && getCard(BELL).levels[1]!.bp === 5000, "BELLはデュアルキャノン・ベル（コスト4・効果なし・Lv1 BP3000/Lv2 BP5000）")
    assert(getCard(HAM).name === "スターハム" && getCard(HAM).type === "brave" && getCard(HAM).cost === 4, "HAMはスターハム（ブレイヴ・コスト4）")
    assert(getCard(TARAN).name === "タランドーズ" && getCard(TARAN).cost === 6 && getCard(TARAN).effect === "" && getCard(TARAN).levels[0]!.bp === 6000, "TARANはタランドーズ（コスト6・効果なし・BP6000）")
    assert(getCard(DOLPHIN).name === "ドルフィーノ" && getCard(DOLPHIN).colors[0] === "blue" && getCard(DOLPHIN).effect === "", "DOLPHINはドルフィーノ（青・効果なし）")
    assert(getCard(NEXUS).name === "燃えさかる戦場" && getCard(NEXUS).type === "nexus", "NEXUSは燃えさかる戦場（ネクサス）")
}

function game(seed: string, interactive = true): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
    s.interactiveTargets = interactive
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
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

function spiritCores(s: GameState, pid: PlayerId): number {
    return s.players[pid].field.spirits.reduce((a, x) => a + x.cores, 0)
}

// pendingChoice を答える（option は pickOption で選ぶ、target は picks に入っていればそれを選ぶ）
function settle(s: GameState, picks: string[] = [], pickOption?: (options: string[]) => string | undefined): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[]; cardIndices?: number[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option") {
            const o = pc.options ?? []
            // pickOption が "" を返したら選択肢を付けずに答える（任意の確認を断る）
            const pick = (pickOption ? pickOption(o) : (o.includes("発動する") ? "発動する" : undefined)) ?? o[0] ?? ""
            err = pick === "" ? act(s, who, { type: "resolveChoice" }) : act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", cardIndex: pc.cardIndices[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

function passFlash(s: GameState): void {
    for (let i = 0; i < 16 && s.isFlashTiming && s.battle; i++) act(s, s.priorityPlayer, { type: "pass" })
}

// 未実装カードで throw しても以降の場面が走るようにする
function scene(name: string, fn: () => void): void {
    console.log(`=== ${name} ===`)
    try {
        fn()
    } catch (e) {
        console.log(`❌ ${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
}

scene("A. 047 Lv1：コスト3以下の自分のスピリットが相手の効果で破壊されたとき、疲労状態でフィールドに残る", () => {
    const s = game("a")
    put(s, "p1", JILES, 1)
    const van = put(s, "p1", VAN, 1)
    destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s) // 残ることを選ぶ
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "コスト1のスピリットはフィールドに残る")
    assert(van.isRested, "残ったスピリットは疲労状態")
    assert(van.cores === 1, "コアはそのまま")
})

scene("B. 047：コスト4以上の自分のスピリットは残らない", () => {
    const s = game("b")
    put(s, "p1", JILES, 1)
    const bell = put(s, "p1", BELL, 1) // コスト4
    destroySpirit(s, "p1", bell.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === bell.instanceId), "コスト4のスピリットは破壊される")
})

scene("C. 047：自分の効果で破壊されたときは残らない（「相手の効果」の境目）", () => {
    const s = game("c")
    put(s, "p1", JILES, 1)
    const van = put(s, "p1", VAN, 1)
    destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p1", sourceType: "spirit" })
    settle(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "自分の効果で破壊されたら残らない")
})

scene("D. 047：残ることを断れば破壊される（「〜することができる」の境目）", () => {
    const s = game("d")
    put(s, "p1", JILES, 1)
    const van = put(s, "p1", VAN, 1)
    destroySpirit(s, "p1", van.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    // 残るかの確認（「復活させる」1択の任意確認）は選択肢を付けずに答えて断る
    settle(s, [], (o) => (o.length > 1 ? o[o.length - 1] : ""))
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === van.instanceId), "断ったスピリットは破壊される")
})

scene("E. 048 Lv1：アタック中はLv2として扱う（BPはLv2の4000）。バトルが終わればLv1に戻る", () => {
    const s = game("e")
    const draco = put(s, "p1", DRACO, 1) // Lv1 BP2000
    assert(act(s, "p1", { type: "attack", instanceId: draco.instanceId }) === null, "ドラコでアタックできる")
    assert(effectiveBp(s, "p1", draco) === 4000, "アタック中はLv2として扱うのでBP4000")
    takeLifeAndResolve(s, "p2")
    assert(effectiveBp(s, "p1", draco) === 2000, "アタックが終わればLv1のBP2000に戻る")
})

scene("F. 048 Lv3：最上位LvなのでLvは変わらない（BP6000のまま）", () => {
    const s = game("f")
    const draco = put(s, "p1", DRACO, 5) // Lv3 BP6000
    assert(act(s, "p1", { type: "attack", instanceId: draco.instanceId }) === null, "Lv3のドラコでアタックできる")
    assert(effectiveBp(s, "p1", draco) === 6000, "Lv3の上はないのでBP6000のまま")
    takeLifeAndResolve(s, "p2")
})

scene("G. 049：アタック時にボイドからコア1個をネクサスへ。緑シンボルがあれば連鎖で自分のスピリットにもコア1個", () => {
    const s = game("g")
    const kamo = put(s, "p1", KAMOONE, 1)
    const nexus = putNexus(s, "p1", NEXUS, 1)
    put(s, "p1", GREEN, 1) // 緑シンボル
    const before = spiritCores(s, "p1")
    assert(act(s, "p1", { type: "attack", instanceId: kamo.instanceId }) === null, "カモオネでアタックできる")
    settle(s)
    assert(nexus.cores === 2, "ネクサスのコアは1→2")
    assert(spiritCores(s, "p1") === before + 1, "連鎖で自分のスピリットにコア1個（計+1）")
    takeLifeAndResolve(s, "p2")
})

scene("H. 049：緑シンボルが無ければ連鎖は発揮しない（ネクサスへは置かれる）", () => {
    const s = game("h")
    const kamo = put(s, "p1", KAMOONE, 1)
    const nexus = putNexus(s, "p1", NEXUS, 1)
    const before = spiritCores(s, "p1")
    assert(act(s, "p1", { type: "attack", instanceId: kamo.instanceId }) === null, "カモオネでアタックできる")
    settle(s)
    assert(nexus.cores === 2, "ネクサスのコアは1→2")
    assert(spiritCores(s, "p1") === before, "緑シンボルが無いのでスピリットのコアは増えない")
    takeLifeAndResolve(s, "p2")
})

scene("I. 049：ネクサスが無くて連鎖元が不発でも、緑シンボルがあれば連鎖は発揮する", () => {
    const s = game("i")
    const kamo = put(s, "p1", KAMOONE, 1)
    put(s, "p1", GREEN, 1)
    const before = spiritCores(s, "p1")
    assert(act(s, "p1", { type: "attack", instanceId: kamo.instanceId }) === null, "カモオネでアタックできる")
    settle(s)
    assert(spiritCores(s, "p1") === before + 1, "連鎖元が不発でも連鎖でスピリットにコア1個")
    takeLifeAndResolve(s, "p2")
})

scene("J. 050：【粉砕】アタック時に相手のデッキをLvと同じ枚数破棄（Lv1なら1枚・Lv3なら3枚）", () => {
    const s = game("j")
    const datas = put(s, "p1", DATAS, 1) // Lv1
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "データスでアタックできる")
    settle(s)
    assert(s.players.p2.deck.length === 39, "Lv1なので相手のデッキは1枚破棄（40→39）")
    takeLifeAndResolve(s, "p2")
})

scene("K. 050 Lv3：【粉砕】は3枚破棄", () => {
    const s = game("k")
    const datas = put(s, "p1", DATAS, 4) // Lv3
    assert(act(s, "p1", { type: "attack", instanceId: datas.instanceId }) === null, "Lv3のデータスでアタックできる")
    settle(s)
    assert(s.players.p2.deck.length === 37, "Lv3なので相手のデッキは3枚破棄（40→37）")
    takeLifeAndResolve(s, "p2")
})

scene("L. 051：召喚時にコスト4以下の相手のスピリット1体を破壊する", () => {
    const s = game("l")
    const van = put(s, "p2", VAN, 1) // コスト1
    const taran = put(s, "p2", TARAN, 1) // コスト6
    s.players.p1.hand = [AKASHI]
    s.phase = "main"
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "アカシを召喚できる")
    settle(s, [van.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "コスト1の相手のスピリットは破壊される")
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === taran.instanceId), "コスト6の相手のスピリットは破壊されない")
})

scene("M. 051 合体時Lv2：自分の青のスピリットがアタックしたらコスト3以下の相手のスピリット1体を破壊", () => {
    const s = game("m")
    const akashi = put(s, "p1", AKASHI, 3) // Lv2
    combine(s, "p1", akashi, HAM)
    const dolphin = put(s, "p1", DOLPHIN, 1) // 青
    const van = put(s, "p2", VAN, 1) // コスト1
    assert(act(s, "p1", { type: "attack", instanceId: dolphin.instanceId }) === null, "ドルフィーノでアタックできる")
    settle(s, [van.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "青がアタックしたのでコスト1の相手のスピリットは破壊される")
    takeLifeAndResolve(s, "p2")
})

scene("N. 051 合体時Lv2：青以外の自分のスピリットのアタックでは破壊しない", () => {
    const s = game("n")
    const akashi = put(s, "p1", AKASHI, 3) // Lv2
    combine(s, "p1", akashi, HAM)
    const van1 = put(s, "p1", VAN, 1) // 赤
    const van2 = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: van1.instanceId }) === null, "赤のスピリットでアタックできる")
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === van2.instanceId), "青以外のアタックでは相手のスピリットは破壊されない")
    takeLifeAndResolve(s, "p2")
})

scene("O. 052：フラッシュで自分のフィールドのコア1個をトラッシュに置くことで、ブロックされない効果持ちの相手のスピリット1体を破壊", () => {
    const s = game("o")
    const payer = put(s, "p1", SANGO, 2) // 支払い元のコア2個
    const van = put(s, "p1", VAN, 1)
    const bone = put(s, "p2", BONE, 1) // ブロックされない効果持ち
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    const effectId = getCard(SANGO).effects.find((e) => e.kind === "activated")!.id
    assert(act(s, "p1", { type: "activateAbility", instanceId: payer.instanceId, effectId }) === null, "防御側がパスした後で起動できる")
    settle(s, [bone.instanceId, payer.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bone.instanceId), "ブロックされない効果持ちのスピリットは破壊される")
    assert(s.players.p1.trashCores === 1, "自分のフィールドのコア1個がトラッシュへ")
    takeLifeAndResolve(s, "p2")
})

scene("P. 052：ブロックされない効果を持たない相手のスピリットは破壊されない", () => {
    const s = game("p")
    const payer = put(s, "p1", SANGO, 2)
    const van = put(s, "p1", VAN, 1)
    const taran = put(s, "p2", TARAN, 1) // 効果なし
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    const effectId = getCard(SANGO).effects.find((e) => e.kind === "activated")!.id
    act(s, "p1", { type: "activateAbility", instanceId: payer.instanceId, effectId })
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === taran.instanceId), "ブロックされない効果が無いので破壊されない")
    takeLifeAndResolve(s, "p2")
})

scene("Q. 053 Lv2：アタック時にコスト4以下の相手のスピリット1体を破壊。連鎖で相手のスピリット1体を疲労させる", () => {
    const s = game("q")
    const seapo = put(s, "p1", SEAPO, 2) // Lv2
    put(s, "p1", GREEN, 1) // 緑シンボル
    const van = put(s, "p2", VAN, 1) // コスト1
    const taran = put(s, "p2", TARAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: seapo.instanceId }) === null, "シーポリープでアタックできる")
    settle(s, [van.instanceId, taran.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "コスト1の相手のスピリットは破壊される")
    assert(taran.isRested, "連鎖で相手のスピリット1体が疲労する")
    takeLifeAndResolve(s, "p2")
})

scene("R. 053 Lv1：Lv2の効果は発揮しない", () => {
    const s = game("r")
    const seapo = put(s, "p1", SEAPO, 1) // Lv1
    put(s, "p1", GREEN, 1)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: seapo.instanceId }) === null, "Lv1のシーポリープでアタックできる")
    settle(s)
    assert(s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "Lv1なので相手のスピリットは破壊されない")
    assert(!van.isRested, "連鎖も発揮しない（連鎖元がLv2の効果）")
    takeLifeAndResolve(s, "p2")
})

scene("S. 053：緑シンボルが無ければ破壊だけ（連鎖の疲労はしない）", () => {
    const s = game("s")
    const seapo = put(s, "p1", SEAPO, 2) // Lv2
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p1", { type: "attack", instanceId: seapo.instanceId }) === null, "シーポリープでアタックできる")
    settle(s, [van.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === van.instanceId), "コスト1の相手のスピリットは破壊される")
    takeLifeAndResolve(s, "p2")
})

scene("T. 066 合体時：アタック中はLvを1つ上として扱う（ホストLv1→Lv2でBP8000）。連鎖で自分のスピリットにコア1個", () => {
    const s = game("t")
    const bell = put(s, "p1", BELL, 1) // Lv1 BP3000
    combine(s, "p1", bell, KONOHAGANIN) // ブレイヴBP3000・合計BP6000
    put(s, "p1", GREEN, 1) // 緑シンボル
    const before = spiritCores(s, "p1")
    assert(act(s, "p1", { type: "attack", instanceId: bell.instanceId }) === null, "合体スピリットでアタックできる")
    assert(effectiveBp(s, "p1", bell) === 8000, "アタック中はホストがLv2として扱われるのでBP5000+3000=8000")
    settle(s)
    assert(spiritCores(s, "p1") === before + 1, "連鎖で自分のスピリットにコア1個")
    takeLifeAndResolve(s, "p2")
    assert(effectiveBp(s, "p1", bell) === 6000, "アタックが終わればBP6000に戻る")
})

scene("U. 066：スピリット状態では合体時の効果も連鎖も発揮しない", () => {
    const s = game("u")
    const ganin = put(s, "p1", KONOHAGANIN, 1) // スピリット状態 BP3000
    put(s, "p1", GREEN, 1)
    const before = spiritCores(s, "p1")
    assert(act(s, "p1", { type: "attack", instanceId: ganin.instanceId }) === null, "スピリット状態のコノハガニンでアタックできる")
    settle(s)
    assert(effectiveBp(s, "p1", ganin) === 3000, "スピリット状態ではLv+1されない")
    assert(spiritCores(s, "p1") === before, "スピリット状態では連鎖も発揮しない")
    takeLifeAndResolve(s, "p2")
})

scene("V. 083：フラッシュでブロックされない効果持ちの相手のスピリット1体を破壊。連鎖（緑）で相手のスピリット1体を疲労させる", () => {
    const s = game("v")
    put(s, "p1", GREEN, 1) // 緑シンボル
    const van = put(s, "p1", VAN, 1)
    const bone = put(s, "p2", BONE, 1)
    const taran = put(s, "p2", TARAN, 1)
    s.players.p1.hand = [CALLDEEP]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "コールオブディープを使用できる")
    settle(s, [bone.instanceId, taran.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bone.instanceId), "ブロックされない効果持ちのスピリットは破壊される")
    assert(taran.isRested, "連鎖で相手のスピリット1体が疲労する")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
})

scene("W. 083：連鎖の「または」でコスト4以下の相手のスピリット2体を疲労させることもできる", () => {
    const s = game("w")
    put(s, "p1", GREEN, 1)
    const van = put(s, "p1", VAN, 1)
    const bone = put(s, "p2", BONE, 1) // コスト3・破壊される側
    const van2 = put(s, "p2", VAN, 1) // コスト1
    const van3 = put(s, "p2", VAN, 1) // コスト1
    s.players.p1.hand = [CALLDEEP]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "コールオブディープを使用できる")
    // 「または」は解決するときに選ぶ：2体疲労の方を選ぶ
    settle(s, [bone.instanceId, van2.instanceId, van3.instanceId], (o) => o.find((x) => x.includes("2体")) ?? o[o.length - 1])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bone.instanceId), "ブロックされない効果持ちのスピリットは破壊される")
    assert(van2.isRested && van3.isRested, "連鎖の「または」でコスト4以下の相手のスピリット2体が疲労する")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
})

scene("X. 083：緑シンボルが無ければ破壊だけ（連鎖しない）", () => {
    const s = game("x")
    const van = put(s, "p1", VAN, 1)
    const bone = put(s, "p2", BONE, 1)
    s.players.p1.hand = [CALLDEEP]
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "アタック直後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "コールオブディープを使用できる")
    settle(s, [bone.instanceId])
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === bone.instanceId), "ブロックされない効果持ちのスピリットは破壊される")
    passFlash(s)
    takeLifeAndResolve(s, "p2")
})

scene("Y. 084：フラッシュでこのバトルの間BP+3000。BPを比べ相手のスピリットだけを破壊したら相手のデッキを7枚破棄", () => {
    const s = game("y")
    const sango = put(s, "p1", SANGO, 1) // Lv1 BP5000
    const taran = put(s, "p2", TARAN, 1) // BP6000
    s.players.p1.hand = [FINISH]
    assert(act(s, "p1", { type: "attack", instanceId: sango.instanceId }) === null, "サンゴジョーでアタックできる")
    assert(declareBlock(s, "p2", taran.instanceId) === null, "タランドーズでブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック宣言後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: sango.instanceId }) === null, "フィニッシュブローを使用できる")
    settle(s)
    assert(effectiveBp(s, "p1", sango) === 8000, "このバトルの間BP+3000で8000")
    passFlash(s)
    assert(!s.players.p2.field.spirits.some((x) => x.instanceId === taran.instanceId), "BPを比べ相手のスピリットだけが破壊される")
    assert(s.players.p1.field.spirits.some((x) => x.instanceId === sango.instanceId), "サンゴジョーは残る")
    assert(s.players.p2.deck.length === 33, "相手のデッキを7枚破棄（40→33）")
})

scene("Z. 084：BP+3000しても相手のスピリットだけを破壊できなければデッキは破棄されない", () => {
    const s = game("z")
    const sango = put(s, "p1", SANGO, 1) // BP5000
    const taran = put(s, "p2", TARAN, 3) // Lv2 BP8000
    s.players.p1.hand = [FINISH]
    assert(act(s, "p1", { type: "attack", instanceId: sango.instanceId }) === null, "サンゴジョーでアタックできる")
    assert(declareBlock(s, "p2", taran.instanceId) === null, "タランドーズでブロックできる")
    assert(act(s, "p2", { type: "pass" }) === null, "ブロック宣言後のフラッシュは防御側が先にパスする")
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, targetInstanceId: sango.instanceId }) === null, "フィニッシュブローを使用できる")
    settle(s)
    passFlash(s)
    assert(!s.players.p1.field.spirits.some((x) => x.instanceId === sango.instanceId), "BP8000のブロッカーには勝てずサンゴジョーは破壊される")
    assert(s.players.p2.deck.length === 40, "相手のスピリットだけを破壊していないのでデッキは破棄されない")
})

console.log("すべてのチェックに合格しました 🎉（part794）")
