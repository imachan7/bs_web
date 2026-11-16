// smoke パート962（「相手のスピリットのコアN個を置く」で「1体の」と書いていない効果は spread で複数体から取る）
//
// 対象：BS10-020 大水蛇ハイドロゲン（星魂の数ぶん）／BS23-X08 ライトニング・シオン（召喚時・強化の+1）
//       BS19-102 パープルヘイズ（「1体の」なので従来どおり1体から）
// spread の各候補からは1個ずつ選ぶ。選択は interactiveTargets で止めて resolveChoice で答える。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const HYDROGEN = "BS10-020" // 大水蛇ハイドロゲン（紫・スピリット・星魂）
const SION = "BS23-X08" // 紫電の霊剣ライトニング・シオン（紫・ブレイヴ）
const ALDEUS = "BS23-X02" // 白蛇帝アルデウス・ヴァイパー（紫・Lv3で【強化】）
const HAZE = "BS19-102" // パープルヘイズ（紫・マジック）
const SEI = "BS10-006" // ヤシウム（星魂を持つ赤スピリット。ハイドロゲンと合わせて星魂2体にする）
const OPP_A = "BS01-054" // ショックイーター（相手側の候補）
const OPP_B = "BS01-050" // ビートビートル（相手側の候補）

assert(getCard(HYDROGEN).name === "大水蛇ハイドロゲン" && getCard(HYDROGEN).type === "spirit", "HYDROGENは大水蛇ハイドロゲン")
assert(getCard(SION).name === "紫電の霊剣ライトニング・シオン" && getCard(SION).type === "brave", "SIONはブレイヴ")
assert(getCard(ALDEUS).name === "白蛇帝アルデウス・ヴァイパー" && getCard(ALDEUS).type === "spirit", "ALDEUSは白蛇帝")
assert(getCard(HAZE).name === "パープルヘイズ" && getCard(HAZE).type === "magic", "HAZEはマジック")
assert(getCard(SEI).name === "ヤシウム" && getCard(SEI).family?.includes("星魂") === true, "SEIは星魂を持つ")

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "green" })
    runTurnStart(s)
    s.interactiveTargets = true
    s.turn = 3
    s.turnPlayer = "p1"
    s.phase = "main"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 0
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 選択待ちに答える。order の順に候補を選び、同じ候補は1回だけ選ぶ（残りは先頭の候補）
function answer(s: GameState, order: string[]): string[] {
    const picked: string[] = []
    for (let i = 0; i < 8 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "target") {
            const cands = pc.candidates
            const pick = order.find((id) => cands.includes(id) && !picked.includes(id)) ?? cands[0]!
            picked.push(pick)
            assert(act(s, pc.pid, { type: "resolveChoice", instanceId: pick }) === null, "候補を選ぶ")
        } else if (pc.kind === "option") {
            act(s, pc.pid, { type: "resolveChoice", option: pc.options![0]! })
        } else if (pc.kind === "card") {
            act(s, pc.pid, { type: "resolveChoice", cardIndex: pc.cardIndices![0]! })
        }
    }
    assert(s.pendingChoice === null, "選択は残っていない")
    return picked
}

console.log("=== A：大水蛇ハイドロゲン（星魂の数ぶん）。相手のスピリット2体から1個ずつ ===")
{
    const s = game("p962-A")
    const h = put(s, "p1", HYDROGEN, 1)
    put(s, "p1", SEI, 1)
    const a = put(s, "p2", OPP_A, 2)
    const b = put(s, "p2", OPP_B, 2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: h.instanceId }) === null, "ハイドロゲンでアタック")
    const picked = answer(s, [a.instanceId, b.instanceId])
    assert(picked.length === 2, "星魂2体ぶん、2回選ぶ")
    assert(a.cores === 1 && b.cores === 1, "相手の2体がそれぞれ1コアになる")
    assert(s.players.p2.reserve === 2, "取り除いた2個は相手のリザーブへ")
}

console.log("=== C：Aの盤面に【強化】持ちを足すと、合計は星魂の数＋1（掛け算にならない） ===")
{
    const s = game("p962-C")
    const h = put(s, "p1", HYDROGEN, 1)
    put(s, "p1", SEI, 1)
    put(s, "p1", ALDEUS, 5) // Lv3で【強化】
    const a = put(s, "p2", OPP_A, 2)
    const b = put(s, "p2", OPP_B, 2)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: h.instanceId }) === null, "ハイドロゲンでアタック")
    const picked = answer(s, [a.instanceId, b.instanceId])
    assert(picked.length === 3, "星魂2＋強化1で3回選ぶ")
    assert(a.cores + b.cores === 1, "相手の4コアから合計3個を取り、残りは1個")
    assert(s.players.p2.reserve === 3, "取り除いた3個は相手のリザーブへ")
}

console.log("=== B：ライトニング・シオンの召喚時。【強化】の+1は合計に1回だけ ===")
{
    const s = game("p962-B")
    const host = put(s, "p1", ALDEUS, 5)
    const a = put(s, "p2", OPP_A, 2)
    const b = put(s, "p2", OPP_B, 2)
    s.players.p1.hand = [SION]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "ライトニング・シオンを召喚できる")
    answer(s, [host.instanceId, a.instanceId, b.instanceId])
    assert(a.cores === 1 && b.cores === 1, "基本1個＋強化1個＝合計2個を相手の2体から1個ずつ")
    assert(s.players.p2.reserve === 2, "取り除いた2個は相手のリザーブへ")
}

console.log("=== D：「1体の」と書いてあるパープルヘイズは従来どおり1体から。【強化】があれば同じ1体から2個 ===")
{
    const s = game("p962-D")
    put(s, "p1", ALDEUS, 5)
    const a = put(s, "p2", OPP_A, 3)
    const b = put(s, "p2", OPP_B, 2)
    s.players.p1.hand = [HAZE]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "パープルヘイズを使用")
    answer(s, [a.instanceId, b.instanceId])
    assert(a.cores === 1, "選んだ1体から2個（基本1＋強化1）取られる")
    assert(b.cores === 2, "もう1体は無傷")
    assert(s.players.p2.reserve === 2, "取り除いた2個は相手のリザーブへ")
}

console.log("すべてのチェックに合格しました 🎉（part962）")
