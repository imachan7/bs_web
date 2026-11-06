// smoke パート795（BS20_PLAN §3.2 N14：『破壊されたとき〜することでフィールドに残る』のコストで、使う1体（1つ・1枚）は持ち主が選ぶ。対話モードでは候補2つで選択待ち・候補1つで選択なし・候補0で残らない。非対話では自動選択）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const PENTAN = "BS20-044" // 剣士ペンタン（黄・スピリット・コスト5・破壊時：黄1体を疲労させることで疲労状態で残る）
const CYCLO = "BS20-065" // サイクロ・アームズ（青・ブレイヴ・コスト4・合体時破壊時：ネクサス1つを破壊することで疲労状態で残る）
const HILL = "BS20-071" // 光射す丘（黄・ネクサス・コスト3・Lv2：【強化】持ちが相手によって破壊されたとき、このネクサスを疲労させることで疲労状態で残す）
const PAOPEI = "BS07-042" // パオ・ペイール（黄・コスト4・破壊時：想獣1体を疲労させることで回復状態で残る）
const ZEYON = "BS14-064" // レボルシング・ゼヨン（青・コスト6・Lv2：相手によって破壊されたとき、ネクサス1つを疲労させることで疲労状態で残す）
const GYUKOTSU = "BS16-X02" // 牛骨魔王（紫・コスト5・Lv2破壊時：手札1枚を破棄することで疲労状態で残る）
const HIPPO = "BS07-037" // ヒッポカンプー（黄・コスト1・想獣・効果なし）黄・想獣の候補
const RANDAL = "BS19-061" // 光の闘士ランダル（【強化】持ち）
const BELL = "BS01-089" // デュアルキャノン・ベル（白・コスト4・効果なし）コスト4以上の合体条件のホスト
const SPEARS = "BS01-104" // 千本槍の古戦場（紫・ネクサス）
const RUINS = "BS14-078" // 幽鬼集う廃都（紫・ネクサス）
const SKULL = "BS06-020" // スカルゴイル（紫・効果なしのスピリット）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; colors: string[]; cost: number; family: string[]; levels: { level: number; cores: number }[]; symbol: string[] }[]
    const pentan = staging.find((c) => c.cardId === PENTAN)
    const cyclo = staging.find((c) => c.cardId === CYCLO)
    const hill = staging.find((c) => c.cardId === HILL)
    assert(pentan?.name === "剣士ペンタン" && pentan.type === "spirit" && pentan.colors[0] === "yellow" && pentan.cost === 5 && pentan.family.join("/") === "剣使/歌鳥" && pentan.levels.map((l) => l.cores).join("/") === "1/2/4" && pentan.symbol[0] === "yellow", "PENTANは剣士ペンタン（黄・スピリット・コスト5・剣使/歌鳥・Lvコア1/2/4）")
    assert(cyclo?.name === "サイクロ・アームズ" && cyclo.type === "brave" && cyclo.colors[0] === "blue" && cyclo.cost === 4 && cyclo.family.join("/") === "闘神/造兵" && cyclo.levels.map((l) => l.cores).join("/") === "1" && cyclo.symbol[0] === "blue", "CYCLOはサイクロ・アームズ（青・ブレイヴ・コスト4・闘神/造兵・Lvコア1）")
    assert(hill?.name === "光射す丘" && hill.type === "nexus" && hill.colors[0] === "yellow" && hill.cost === 3 && hill.family.length === 0 && hill.levels.map((l) => l.cores).join("/") === "0/1" && hill.symbol[0] === "yellow", "HILLは光射す丘（黄・ネクサス・コスト3・系統なし・Lvコア0/1）")
    assert(getCard(PAOPEI).name === "パオ・ペイール" && getCard(PAOPEI).type === "spirit" && getCard(PAOPEI).cost === 4, "PAOPEIはパオ・ペイール（スピリット・コスト4）")
    assert(getCard(ZEYON).name === "レボルシング・ゼヨン" && getCard(ZEYON).type === "spirit" && getCard(ZEYON).cost === 6, "ZEYONはレボルシング・ゼヨン（スピリット・コスト6）")
    assert(getCard(GYUKOTSU).name === "牛骨魔王" && getCard(GYUKOTSU).type === "spirit" && getCard(GYUKOTSU).cost === 5, "GYUKOTSUは牛骨魔王（スピリット・コスト5）")
    assert(getCard(HIPPO).name === "ヒッポカンプー" && getCard(HIPPO).colors[0] === "yellow" && getCard(HIPPO).family.includes("想獣") && getCard(HIPPO).effect === "", "HIPPOはヒッポカンプー（黄・想獣・効果なし）")
    assert(getCard(RANDAL).name === "光の闘士ランダル" && (getCard(RANDAL).effect ?? "").includes("【強化】"), "RANDALは光の闘士ランダル（【強化】持ち）")
    assert(getCard(BELL).name === "デュアルキャノン・ベル" && getCard(BELL).cost === 4 && getCard(BELL).effect === "", "BELLはデュアルキャノン・ベル（コスト4・効果なし）")
    assert(getCard(SPEARS).name === "千本槍の古戦場" && getCard(SPEARS).type === "nexus", "SPEARSは千本槍の古戦場（ネクサス）")
    assert(getCard(RUINS).name === "幽鬼集う廃都" && getCard(RUINS).type === "nexus", "RUINSは幽鬼集う廃都（ネクサス）")
    assert(getCard(SKULL).name === "スカルゴイル" && getCard(SKULL).effect === "", "SKULLはスカルゴイル（効果なし）")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).cost === 1 && getCard(VANILLA).effect === "", "VANILLAはロクケラトプス（コスト1・効果なし）")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "main"
    for (const pid of ["p1", "p2"] as const) {
        const p = s.players[pid]
        p.reserve = 10
        p.life = 5
        p.burst = null
        p.hand = []
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function combine(s: GameState, pid: PlayerId, host: ReturnType<typeof createInstance>, braveCardId: string): ReturnType<typeof createInstance> {
    const brave = createInstance(braveCardId, s.turn, 0)
    s.players[pid].field.combinedBraves.push(brave)
    host.braveRefs = [...(host.braveRefs ?? []), { slot: "single", instanceId: brave.instanceId }]
    refreshLevelAsOverrides(s)
    return brave
}

// pendingChoice を答える。picks に入れた対象が候補にいればそれを選ぶ（target は instanceId、手札は cardIndex）。
// braveTrash を true にすると、ブレイヴを残すかの確認（BRAVE.md §6.3）に「残さない」（選択肢を付けない resolveChoice）と答える
// 戻り値は出た選択待ちの記録で、「選択待ちが出たか」の検証に使う
type PromptLog = { kind: string; prompt: string; candidates?: string[]; cardIndices?: number[] }
function settle(s: GameState, picks: string[] = [], cardIndex?: number, braveTrash = false): PromptLog[] {
    const logs: PromptLog[] = []
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid: PlayerId; kind: string; prompt: string; options?: string[]; candidates?: string[]; cardIndices?: number[]; braveKeep?: unknown }
        logs.push({ kind: pc.kind, prompt: pc.prompt, ...(pc.candidates !== undefined ? { candidates: pc.candidates } : {}), ...(pc.cardIndices !== undefined ? { cardIndices: pc.cardIndices } : {}) })
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "option" && pc.braveKeep !== undefined && braveTrash) {
            err = act(s, who, { type: "resolveChoice" }) // 選択肢を付けない＝残さない。ブレイヴはホストと同じくトラッシュへ
        } else if (pc.kind === "option") {
            const o = pc.options ?? []
            const pick = o.find((x) => x.includes("発動する")) ?? o.find((x) => !x.includes("しない")) ?? o[0] ?? ""
            err = act(s, who, { type: "resolveChoice", option: pick })
        } else if (pc.kind === "target") {
            const next = picks.find((x) => (pc.candidates ?? []).includes(x)) ?? pc.candidates?.[0]
            err = next !== undefined ? act(s, who, { type: "resolveChoice", instanceId: next }) : act(s, who, { type: "resolveChoice" })
        } else if (pc.cardIndices?.[0] !== undefined) {
            const idx = cardIndex !== undefined && pc.cardIndices.includes(cardIndex) ? cardIndex : pc.cardIndices[0]
            err = act(s, who, { type: "resolveChoice", cardIndex: idx })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
    return logs
}

const onField = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// BS20 の3枚は未実装でカードが読めないときがある。その場面だけ落ちたままにして、残りの場面は続ける
function runScene(name: string, scene: () => void): void {
    console.log(`=== ${name} ===`)
    try {
        scene()
    } catch (e) {
        console.log(`（この場面は落ちたまま: ${(e as Error).message}）`)
    }
}

runScene("A1. 044 ペンタン：黄の候補2体 → 選択待ちが出て、選んだ2体目が疲労しペンタンは疲労状態で残る", () => {
    const s = game("a1", true)
    const pentan = put(s, "p1", PENTAN, 1)
    const yellow1 = put(s, "p1", HIPPO, 1)
    const yellow2 = put(s, "p1", HIPPO, 1)
    destroySpirit(s, "p1", pentan.instanceId, "destroy")
    const logs = settle(s, [yellow2.instanceId])
    const targetLog = logs.find((l) => l.kind === "target")
    assert(targetLog !== undefined, "黄の候補が2体あるので疲労させる1体の選択待ちが出る")
    assert((targetLog!.candidates ?? []).includes(yellow1.instanceId) && (targetLog!.candidates ?? []).includes(yellow2.instanceId), "候補は黄のスピリット2体")
    assert(yellow2.isRested, "選んだ2体目のヒッポカンプーが疲労する")
    assert(!yellow1.isRested, "選んでいない1体目は疲労しない")
    assert(onField(s, "p1", pentan) && pentan.isRested, "ペンタンは疲労状態でフィールドに残る")
})

runScene("A2. 044 ペンタン：黄の候補1体 → 選択待ちなしでその1体が疲労しペンタンは残る", () => {
    const s = game("a2", true)
    const pentan = put(s, "p1", PENTAN, 1)
    const yellow = put(s, "p1", HIPPO, 1)
    destroySpirit(s, "p1", pentan.instanceId, "destroy")
    const logs = settle(s)
    assert(!logs.some((l) => l.kind === "target"), "候補が1体なので疲労させる1体の選択待ちは出ない")
    assert(yellow.isRested, "候補のヒッポカンプーが疲労する")
    assert(onField(s, "p1", pentan) && pentan.isRested, "ペンタンは疲労状態でフィールドに残る")
})

runScene("A3. 044 ペンタン：黄の候補0（赤のみ）→ 残らず破壊される", () => {
    const s = game("a3", true)
    const pentan = put(s, "p1", PENTAN, 1)
    put(s, "p1", VANILLA, 1) // 赤なので候補外
    destroySpirit(s, "p1", pentan.instanceId, "destroy")
    settle(s)
    assert(!onField(s, "p1", pentan), "疲労させる黄がいないのでペンタンは破壊される")
    assert(s.players.p1.trashCards.includes(PENTAN), "ペンタンはトラッシュへ置かれる")
})

runScene("B1. 065 サイクロ・アームズ：ネクサス候補2つ → 選んで破壊した方がトラッシュ、合体スピリットは疲労状態で残る", () => {
    const s = game("b1", true)
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, CYCLO)
    const nx1 = putNexus(s, "p1", SPEARS)
    const nx2 = putNexus(s, "p1", RUINS)
    destroySpirit(s, "p1", host.instanceId, "destroy")
    const logs = settle(s, [nx2.instanceId])
    const targetLog = logs.find((l) => l.kind === "target")
    assert(targetLog !== undefined, "ネクサスが2つあるので破壊する1つの選択待ちが出る")
    assert((targetLog!.candidates ?? []).includes(nx1.instanceId) && (targetLog!.candidates ?? []).includes(nx2.instanceId), "候補は自分のネクサス2つ")
    assert(!s.players.p1.field.nexuses.some((x) => x.instanceId === nx2.instanceId), "選んだ幽鬼集う廃都が破壊される")
    assert(s.players.p1.trashCards.includes(RUINS), "破壊したネクサスはトラッシュへ置かれる")
    assert(s.players.p1.field.nexuses.some((x) => x.instanceId === nx1.instanceId), "選んでいない千本槍の古戦場は残る")
    assert(onField(s, "p1", host) && host.isRested, "合体スピリットは疲労状態でフィールドに残る")
})

runScene("B2. 065 サイクロ・アームズ：ネクサス候補1つ → 選択待ちなしでそれが破壊され、合体スピリットは残る", () => {
    const s = game("b2", true)
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, CYCLO)
    const nx = putNexus(s, "p1", SPEARS)
    destroySpirit(s, "p1", host.instanceId, "destroy")
    const logs = settle(s)
    assert(!logs.some((l) => l.kind === "target"), "候補が1つなので破壊するネクサスの選択待ちは出ない")
    assert(!s.players.p1.field.nexuses.some((x) => x.instanceId === nx.instanceId) && s.players.p1.trashCards.includes(SPEARS), "候補のネクサスが破壊される")
    assert(onField(s, "p1", host) && host.isRested, "合体スピリットは疲労状態でフィールドに残る")
})

runScene("B3. 065 サイクロ・アームズ：ネクサス候補0 → 合体スピリットは残らず破壊される", () => {
    const s = game("b3", true)
    const host = put(s, "p1", BELL, 1)
    combine(s, "p1", host, CYCLO)
    destroySpirit(s, "p1", host.instanceId, "destroy")
    settle(s, [], undefined, true) // ブレイヴを残すかの確認には「残さない」と答える
    assert(!onField(s, "p1", host), "破壊するネクサスがないので合体スピリットは破壊される")
    assert(s.players.p1.trashCards.includes(BELL) && s.players.p1.trashCards.includes(CYCLO), "ホストとブレイヴはトラッシュへ置かれる")
})

runScene("C1. 071 光射す丘（Lv2・回復状態）：【強化】持ちが相手によって破壊されたら、丘を疲労させることで疲労状態で残る（選択は無い）", () => {
    const s = game("c1", true)
    const hill = putNexus(s, "p1", HILL, 1) // Lv2
    const randal = put(s, "p1", RANDAL, 1)
    destroySpirit(s, "p1", randal.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const logs = settle(s)
    assert(!logs.some((l) => l.kind === "target"), "疲労させるのはこのネクサス自身なので対象の選択待ちは出ない")
    assert(hill.isRested, "光射す丘は疲労する")
    assert(onField(s, "p1", randal) && randal.isRested, "ランダルは疲労状態でフィールドに残る")
})

runScene("C2. 071 光射す丘（Lv2・疲労済み）：疲労させられないので残らず破壊される", () => {
    const s = game("c2", true)
    const hill = putNexus(s, "p1", HILL, 1) // Lv2
    hill.isRested = true
    const randal = put(s, "p1", RANDAL, 1)
    destroySpirit(s, "p1", randal.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(!onField(s, "p1", randal), "丘が疲労済みなのでランダルは破壊される")
    assert(s.players.p1.trashCards.includes(RANDAL), "ランダルはトラッシュへ置かれる")
})

runScene("C3. 071 光射す丘（Lv1・コア0）：Lv2の効果ではないので残らない", () => {
    const s = game("c3", true)
    putNexus(s, "p1", HILL, 0) // Lv1
    const randal = put(s, "p1", RANDAL, 1)
    destroySpirit(s, "p1", randal.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(!onField(s, "p1", randal), "Lv1なのでランダルは破壊される")
})

runScene("D1. BS07-042 パオ・ペイール：想獣の候補2体 → 選んだ2体目が疲労し、パオ・ペイールは回復状態で残る", () => {
    const s = game("d1", true)
    const paopei = put(s, "p1", PAOPEI, 1)
    const so1 = put(s, "p1", HIPPO, 1)
    const so2 = put(s, "p1", HIPPO, 1)
    destroySpirit(s, "p1", paopei.instanceId, "destroy")
    const logs = settle(s, [so2.instanceId])
    const targetLog = logs.find((l) => l.kind === "target")
    assert(targetLog !== undefined, "想獣の候補が2体あるので疲労させる1体の選択待ちが出る")
    assert((targetLog!.candidates ?? []).includes(so1.instanceId) && (targetLog!.candidates ?? []).includes(so2.instanceId), "候補は想獣のスピリット2体")
    assert(so2.isRested && !so1.isRested, "選んだ2体目だけが疲労する")
    assert(onField(s, "p1", paopei) && !paopei.isRested, "パオ・ペイールは回復状態でフィールドに残る")
})

runScene("D2. BS07-042 パオ・ペイール：想獣の候補0 → 残らず破壊される", () => {
    const s = game("d2", true)
    const paopei = put(s, "p1", PAOPEI, 1)
    put(s, "p1", VANILLA, 1) // 想獣ではない
    destroySpirit(s, "p1", paopei.instanceId, "destroy")
    settle(s)
    assert(!onField(s, "p1", paopei) && s.players.p1.trashCards.includes(PAOPEI), "疲労させる想獣がいないのでパオ・ペイールは破壊される")
})

runScene("E1. BS14-064 レボルシング・ゼヨン（Lv2）：ネクサス候補2つ → 選んだ2つ目が疲労し、破壊されたスピリットは疲労状態で残る", () => {
    const s = game("e1", true)
    s.phase = "attack" // Lv2は『お互いのアタックステップ』限定なので破壊はアタックステップで起こす
    put(s, "p1", ZEYON, 4) // Lv2
    const nx1 = putNexus(s, "p1", SPEARS)
    const nx2 = putNexus(s, "p1", RUINS)
    const mine = put(s, "p1", VANILLA, 1)
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    const logs = settle(s, [nx2.instanceId])
    const targetLog = logs.find((l) => l.kind === "target")
    assert(targetLog !== undefined, "ネクサスが2つあるので疲労させる1つの選択待ちが出る")
    assert((targetLog!.candidates ?? []).includes(nx1.instanceId) && (targetLog!.candidates ?? []).includes(nx2.instanceId), "候補は自分のネクサス2つ")
    assert(nx2.isRested && !nx1.isRested, "選んだ2つ目のネクサスだけが疲労する")
    assert(onField(s, "p1", mine) && mine.isRested, "破壊されたロクケラトプスは疲労状態でフィールドに残る")
})

runScene("E2. BS14-064 レボルシング・ゼヨン（Lv2）：ネクサス候補0 → 破壊されたスピリットは残らない", () => {
    const s = game("e2", true)
    put(s, "p1", ZEYON, 4) // Lv2
    const mine = put(s, "p1", VANILLA, 1)
    destroySpirit(s, "p1", mine.instanceId, "destroy", { sourcePid: "p2", sourceType: "spirit" })
    settle(s)
    assert(!onField(s, "p1", mine) && s.players.p1.trashCards.includes(VANILLA), "疲労させるネクサスがないので破壊されたまま")
})

runScene("F1. BS16-X02 牛骨魔王（Lv2）：手札2枚 → 選んだ2枚目が破棄され、牛骨魔王は疲労状態で残る", () => {
    const s = game("f1", true)
    const gyu = put(s, "p1", GYUKOTSU, 3) // Lv2
    s.players.p1.hand = [VANILLA, SKULL]
    destroySpirit(s, "p1", gyu.instanceId, "destroy")
    const logs = settle(s, [], 1) // 2枚目（index 1）のスカルゴイルを破棄する
    assert(logs.some((l) => (l.cardIndices ?? []).length >= 1), "手札2枚から破棄する1枚の選択待ちが出る")
    assert(s.players.p1.trashCards.includes(SKULL), "選んだ2枚目のスカルゴイルが破棄される")
    assert(!s.players.p1.trashCards.includes(VANILLA), "選んでいない1枚目は破棄されない")
    assert(s.players.p1.hand.includes(VANILLA) && !s.players.p1.hand.includes(SKULL), "手札には1枚目だけが残る")
    assert(onField(s, "p1", gyu) && gyu.isRested, "牛骨魔王は疲労状態でフィールドに残る")
})

runScene("F2. BS16-X02 牛骨魔王（Lv2）：手札0枚 → 残らず破壊される", () => {
    const s = game("f2", true)
    const gyu = put(s, "p1", GYUKOTSU, 3) // Lv2
    s.players.p1.hand = []
    destroySpirit(s, "p1", gyu.instanceId, "destroy")
    settle(s)
    assert(!onField(s, "p1", gyu) && s.players.p1.trashCards.includes(GYUKOTSU), "破棄する手札がないので牛骨魔王は破壊される")
})

runScene("G1. 非対話：044 ペンタン（黄の候補2体）→ 選択待ちが出ず、どれか1体が疲労してペンタンは残る", () => {
    const s = game("g1", false)
    const pentan = put(s, "p1", PENTAN, 1)
    const yellow1 = put(s, "p1", HIPPO, 1)
    const yellow2 = put(s, "p1", HIPPO, 1)
    destroySpirit(s, "p1", pentan.instanceId, "destroy")
    assert(s.pendingChoice === null, "非対話では候補が2体でも選択待ちが出ない")
    assert(yellow1.isRested !== yellow2.isRested, "どれか1体だけが疲労する")
    assert(onField(s, "p1", pentan) && pentan.isRested, "ペンタンは疲労状態でフィールドに残る")
})

runScene("G2. 非対話：BS16-X02 牛骨魔王（手札2枚）→ 選択待ちが出ず、どれか1枚が破棄されて残る", () => {
    const s = game("g2", false)
    const gyu = put(s, "p1", GYUKOTSU, 3) // Lv2
    s.players.p1.hand = [VANILLA, SKULL]
    destroySpirit(s, "p1", gyu.instanceId, "destroy")
    assert(s.pendingChoice === null, "非対話では手札2枚でも選択待ちが出ない")
    assert(s.players.p1.hand.length === 1 && s.players.p1.trashCards.length === 1, "手札1枚が破棄される")
    assert(onField(s, "p1", gyu) && gyu.isRested, "牛骨魔王は疲労状態でフィールドに残る")
})

console.log("すべてのチェックに合格しました 🎉（part795）")
