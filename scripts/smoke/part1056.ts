// smoke パート1056（BS22-X02 冥府三巨頭ザンデ・ミリオンのブロックのコスト：無魔のアタッカーをブロックするには、ブロックするスピリット以外の自分のスピリットを発生源（ザンデ）ごとに1体ずつ破壊する。2体いれば2体破壊。2026-11-24 ユーザー確認）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ZANDE = "BS22-X02" // 冥府三巨頭ザンデ・ミリオン（紫・コスト8・無魔）
const HONEDEER = "BS16-010" // 骨鹿（紫・コスト1・無魔）。無魔のアタッカー
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）。ブロッカー
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3）。破壊される候補

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ZANDE).name === "冥府三巨頭ザンデ・ミリオン" && getCard(ZANDE).family.includes("無魔"), "ZANDEはザンデ・ミリオン（無魔）")
    assert(getCard(HONEDEER).name === "骨鹿" && getCard(HONEDEER).family.includes("無魔"), "HONEDEERは骨鹿（無魔）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).colors[0] === "red" && getCard(VAN).effect === "", "VANはロクケラトプス（赤・効果なし）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).colors[0] === "purple" && getCard(GRIP).cost === 3, "GRIPはグリプ・ハンズ（紫・コスト3）")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
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

const onField = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)

// 対話時の選択待ちは止めたまま返す。非対話では settle の先頭候補で進む
function settle(s: GameState): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.kind === "target" && pc.candidates?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// ザンデ zandeCount 体（p1）が、無魔の骨鹿でアタックする。p2 は B（VAN）と候補 GRIP を candidateCount 体持つ
function setup(seed: string, zandeCount: number, interactive: boolean, candidateCount: number) {
    const s = game(seed, interactive)
    const zandes = Array.from({ length: zandeCount }, () => put(s, "p1", ZANDE, 3))
    const attacker = put(s, "p1", HONEDEER, 1)
    const blocker = put(s, "p2", VAN, 1)
    const cands = Array.from({ length: candidateCount }, () => put(s, "p2", GRIP, 1))
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${seed}：アタックできる`)
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, `${seed}：防御側のパス`)
    assert(act(s, "p1", { type: "pass" }) === null, `${seed}：アタック側のパス`)
    return { s, zandes, attacker, blocker, cands }
}

console.log("=== 1. ザンデ2体・非対話：ブロックは成立し、候補3体のうち2体だけ破壊される ===")
{
    const { s, blocker, cands } = setup("z2-auto", 2, false, 3)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックを宣言できる")
    settle(s)
    assert(s.battle?.blockerInstanceId === blocker.instanceId, "Bがブロックしている")
    const gone = cands.filter((c) => !onField(s, "p2", c)).length
    assert(gone === 2, `候補のうちちょうど2体が破壊される（実際 ${gone}）`)
    assert(onField(s, "p2", blocker), "ブロックしたBは破壊されない")
}

console.log("=== 2. ザンデ2体・対話：1回目の選択（C1〜C3）→ C1 → 2回目（C2・C3）→ C2 → ブロック成立、C3 は残る ===")
{
    const { s, blocker, cands } = setup("z2-interactive", 2, true, 3)
    const [c1, c2, c3] = cands
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックを宣言できる")
    const pc1 = s.pendingChoice as { pid?: PlayerId; kind: string; candidates?: string[] } | null
    assert(pc1 !== null && pc1.kind === "target", "1回目の選択待ちが出る")
    assert(pc1 !== null && (pc1.candidates ?? []).length === 3 && !(pc1.candidates ?? []).includes(blocker.instanceId), "1回目の候補はC1・C2・C3（Bは含まない）")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: c1!.instanceId }) === null, "C1を選べる")
    assert(!onField(s, "p2", c1!), "C1が破壊される")
    const pc2 = s.pendingChoice as { kind: string; candidates?: string[] } | null
    assert(pc2 !== null && pc2.kind === "target", "2回目の選択待ちが出る")
    assert(pc2 !== null && (pc2.candidates ?? []).length === 2 && !(pc2.candidates ?? []).includes(c1!.instanceId), "2回目の候補はC2・C3（C1は含まない）")
    assert(act(s, "p2", { type: "resolveChoice", instanceId: c2!.instanceId }) === null, "C2を選べる")
    assert(!onField(s, "p2", c2!), "C2が破壊される")
    assert(s.pendingChoice === null, "選択待ちはもう無い")
    assert(s.battle?.blockerInstanceId === blocker.instanceId, "ブロックが成立している")
    assert(onField(s, "p2", c3!), "C3は残る")
}

console.log("=== 3. ザンデ2体・候補が1体しかない：ブロックは拒否され、C1は破壊されない ===")
{
    const { s, blocker, cands } = setup("z2-short", 2, false, 1)
    const err = declareBlock(s, "p2", blocker.instanceId)
    assert(err !== null, "ブロックの操作がエラーを返す")
    assert(onField(s, "p2", cands[0]!), "C1は破壊されない")
    assert(s.battle?.blockerInstanceId !== blocker.instanceId, "ブロックは成立していない")
}

console.log("=== 4. ザンデ1体・候補2体：破壊は1体だけ ===")
{
    const { s, blocker, cands } = setup("z1-auto", 1, false, 2)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "ブロックを宣言できる")
    settle(s)
    assert(s.battle?.blockerInstanceId === blocker.instanceId, "Bがブロックしている")
    const alive = cands.filter((c) => onField(s, "p2", c)).length
    assert(alive === 1, `候補のうち1体だけが残る（実際 ${alive}）`)
}

console.log("すべてのチェックに合格しました 🎉（part1056）")
