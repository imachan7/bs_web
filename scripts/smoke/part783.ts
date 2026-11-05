// smoke パート783（BS20-X01 滅龍帝ジエンド・ドラゴニス・BS01-101 古龍の縄張り：破壊された自分のスピリットのコアの行き先を持ち主が選ぶ／縄張りとX01の競合はターンプレイヤーが選ぶ／非対話では先に出たX01へ。docs/design/BS20_PLAN.md §3.2 N4）
import { readFileSync } from "node:fs"
import { act, assert, createGame, createInstance, destroySpirit, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X01 = "BS20-X01" // 滅龍帝ジエンド・ドラゴニス（赤・コスト9・Lv1=1・Lv2=3・Lv3=5・Lv4=8）
const NAWABARI = "BS01-101" // 古龍の縄張り（赤・コスト6・ネクサス）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認（BS20 は staging にしか無い） ===")
{
    const staging = JSON.parse(readFileSync("data/staging/BS20.json", "utf8")) as { cardId: string; name: string; type: string; cost: number; levels: { level: number; cores: number }[] }[]
    const x01 = staging.find((c) => c.cardId === X01)
    assert(x01?.name === "滅龍帝ジエンド・ドラゴニス" && x01.type === "spirit" && x01.cost === 9, "X01は滅龍帝ジエンド・ドラゴニス（スピリット・コスト9）")
    assert(x01?.levels.map((l) => l.cores).join("/") === "1/3/5/8", "X01のLvコアは1/3/5/8")
    const nawabari = getCard(NAWABARI)
    assert(nawabari.name === "古龍の縄張り" && nawabari.type === "nexus" && nawabari.cost === 6, "NAWABARIは古龍の縄張り（ネクサス・コスト6）")
    assert((nawabari.effect ?? "").includes("リザーブではなくトラッシュに置かれる"), "NAWABARIは破壊されたスピリットのコアをトラッシュへ置く")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).cost === 1, "VANはロクケラトプス（コスト1のバニラ）")
}

function game(seed: string, interactive: boolean, turnPlayer: PlayerId = "p1"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "red" })
    s.turn = 3
    s.turnPlayer = turnPlayer
    s.priorityPlayer = turnPlayer
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

function putNexus(s: GameState, pid: PlayerId, cardId: string): ReturnType<typeof createInstance> {
    const inst = createInstance(cardId, s.turn, 0)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// pendingChoice を1つだけ答える（option は wantedOption、target は wantedTarget）
function answer(s: GameState, who: PlayerId, wantedOption?: string, wantedTarget?: string): void {
    const pc = s.pendingChoice as { kind: string; options?: string[]; candidates?: string[] } | null
    assert(pc !== null, "選択待ち（pendingChoice）が出る")
    let err: string | null
    if (pc!.kind === "option") {
        const pick = wantedOption && (pc!.options ?? []).includes(wantedOption) ? wantedOption : pc!.options?.[0] ?? ""
        err = act(s, who, { type: "resolveChoice", option: pick })
    } else {
        const cands = pc!.candidates ?? []
        const pick = wantedTarget && cands.includes(wantedTarget) ? wantedTarget : cands[0]
        err = pick !== undefined ? act(s, who, { type: "resolveChoice", instanceId: pick }) : act(s, who, { type: "resolveChoice" })
    }
    assert(err === null, `選択に答えられる（${err ?? ""}）`)
}

console.log("=== A. X01が2体：破壊された自分のスピリットのコアの行き先は持ち主が選ぶ。2体目を選ぶと2体目のコアだけ増える ===")
{
    const s = game("a", true)
    const x01a = put(s, "p1", X01, 1) // 先に出た方
    const x01b = put(s, "p1", X01, 1) // 2体目
    const ally = put(s, "p1", VAN, 3)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", ally.instanceId, "destroy")
    const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; coreDestination?: { destOptions: string[] } } | null
    assert(pc?.pid === "p1" && pc?.kind === "option", "行き先の選択は持ち主（p1）に聞かれる")
    const dests = pc?.coreDestination?.destOptions ?? []
    assert(dests.length === 2 && dests.includes(x01a.instanceId) && dests.includes(x01b.instanceId), "選択肢は2体のX01")
    // 2体目を選ぶ。ラベルは同名だが、options[i] は destOptions[i] に対応するので
    // 2体目の instanceId の位置で選べる
    answer(s, "p1", pc!.options![dests.indexOf(x01b.instanceId)], undefined)
    assert(x01b.cores === 4, "2体目のX01を選んだのでコア3個が2体目に置かれる（1→4）")
    assert(x01a.cores === 1, "1体目のX01のコアは変わらない")
    assert(s.players.p1.reserve === reserve, "リザーブは増えない")
}

console.log("=== B. 古龍の縄張り（相手の場・相手のターン）とX01の競合：ターンプレイヤーが行き先を選ぶ。トラッシュへ／X01へ ===")
{
    const s = game("b1", true, "p2")
    putNexus(s, "p2", NAWABARI) // 縄張りの持ち主はp2、p2のターン
    const x01 = put(s, "p1", X01, 1)
    const ally = put(s, "p1", VAN, 3)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", ally.instanceId, "destroy")
    const pc = s.pendingChoice as { pid: PlayerId; kind: string; options?: string[]; candidates?: string[] } | null
    assert(pc?.pid === "p2", "行き先の選択はターンプレイヤー（p2）に聞かれる")
    answer(s, "p2", "トラッシュ", undefined)
    assert(s.players.p1.trashCores === 3, "トラッシュを選んだのでp1のトラッシュのコアは+3")
    assert(x01.cores === 1 && s.players.p1.reserve === reserve, "X01のコアもリザーブも増えない")
}
{
    const s = game("b2", true, "p2")
    putNexus(s, "p2", NAWABARI)
    const x01 = put(s, "p1", X01, 1)
    const ally = put(s, "p1", VAN, 3)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", ally.instanceId, "destroy")
    answer(s, "p2", getCard(X01).name, undefined)
    assert(x01.cores === 4, "X01を選んだのでX01のコアは+3（1→4）")
    assert(s.players.p1.trashCores === 0 && s.players.p1.reserve === reserve, "トラッシュもリザーブも増えない")
}

console.log("=== C. 非対話では選択は出ず、先に場に出たX01へ置かれる ===")
{
    const s = game("c", false)
    const x01a = put(s, "p1", X01, 1) // 先に出た方
    const x01b = put(s, "p1", X01, 1)
    const ally = put(s, "p1", VAN, 3)
    const reserve = s.players.p1.reserve
    destroySpirit(s, "p1", ally.instanceId, "destroy")
    assert(s.pendingChoice === null, "非対話では選択待ちは出ない")
    assert(x01a.cores === 4, "先に場に出たX01にコア3個が置かれる（1→4）")
    assert(x01b.cores === 1, "2体目のX01のコアは変わらない")
    assert(s.players.p1.reserve === reserve, "リザーブは増えない")
}

console.log("すべてのチェックに合格しました 🎉（part783）")
