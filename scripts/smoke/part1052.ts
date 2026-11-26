// smoke パート1052（#682：ブロックのコストの破壊を起こした効果の発生源。BS22-X02 ザンデ・ミリオンのブロックのコストで破壊されたとき、SD13-002 ボーン・キャットが「その効果を発揮したスピリット」＝ザンデのコアを除く。アタックしたのがザンデ以外の無魔でも同じ）
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const ZANDE = "BS22-X02" // 冥府三巨頭ザンデ・ミリオン（紫・コスト8・無魔・Lvコア1/3/6）
const CAT = "SD13-002" // ボーン・キャット（紫・コスト2）
const GRIP = "BS01-030" // グリプ・ハンズ（紫・コスト3）
const VICTO = "BS19-018" // ヴィクトローラー（紫・コスト4）
const HONEDEER = "BS16-010" // 骨鹿（紫・コスト1・無魔）
const VAN = "BS01-002" // ロクケラトプス（赤・コスト1・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(ZANDE).name === "冥府三巨頭ザンデ・ミリオン" && getCard(ZANDE).family.includes("無魔"), "ZANDEはザンデ・ミリオン（無魔）")
    assert(getCard(CAT).name === "ボーン・キャット" && getCard(CAT).colors[0] === "purple" && getCard(CAT).cost === 2, "CATはボーン・キャット（紫・コスト2）")
    assert(getCard(GRIP).name === "グリプ・ハンズ" && getCard(GRIP).colors[0] === "purple" && getCard(GRIP).cost === 3, "GRIPはグリプ・ハンズ（紫・コスト3）")
    assert(getCard(VICTO).name === "ヴィクトローラー" && getCard(VICTO).colors[0] === "purple" && getCard(VICTO).cost === 4, "VICTOはヴィクトローラー（紫・コスト4）")
    assert(getCard(HONEDEER).name === "骨鹿" && getCard(HONEDEER).family.includes("無魔"), "HONEDEERは骨鹿（無魔）")
    assert(getCard(VAN).name === "ロクケラトプス" && getCard(VAN).colors[0] === "red" && getCard(VAN).effect === "", "VANはロクケラトプス（赤・効果なし）")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "purple" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
    s.phase = "attack"
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

const onField = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.some((x) => x.instanceId === inst.instanceId)
const coresOf = (s: GameState, pid: PlayerId, inst: { instanceId: string }) => s.players[pid].field.spirits.find((x) => x.instanceId === inst.instanceId)?.cores ?? 0

// 対象は picks を優先。確認は「発動する」
function settle(s: GameState, picks: string[] = []): void {
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[] }
        const who = pc.pid ?? "p1"
        const hit = picks.find((x) => (pc.candidates ?? []).includes(x))
        let err: string | null
        if (pc.kind === "target" && hit !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: hit })
        else if (pc.kind === "option") err = act(s, who, { type: "resolveChoice", option: pc.options?.[0] ?? "" })
        else if (pc.kind === "target" && pc.candidates?.[0] !== undefined) err = act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] })
        else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
}

// attackerCard でアタック → p2 は blocker でブロックし、コストとして victimCard を破壊する
function scene(seed: string, attackerCard: string | null, victimCard: string) {
    const s = game(seed)
    const zande = put(s, "p1", ZANDE, 3)
    const attacker = attackerCard === null ? zande : put(s, "p1", attackerCard, 1)
    const cat = put(s, "p2", CAT, 1)
    const blocker = put(s, "p2", VAN, 1)
    const victim = put(s, "p2", victimCard, 1)
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, `${seed}：アタックできる`)
    settle(s)
    assert(act(s, "p2", { type: "pass" }) === null, `${seed}：防御側のパス`)
    assert(act(s, "p1", { type: "pass" }) === null, `${seed}：アタック側のパス`)
    assert(declareBlock(s, "p2", blocker.instanceId) === null, `${seed}：コストを払ってブロックできる`)
    settle(s, [victim.instanceId])
    assert(!onField(s, "p2", victim), `${seed}：コストとして選んだスピリットが破壊される`)
    return { s, zande, attacker, cat }
}

console.log("=== 1. ザンデのアタック：コストで紫・コスト3のグリプが破壊 → ボーン・キャットがザンデのコアすべてを相手のトラッシュへ ===")
{
    const { s, zande } = scene("cat-zande", null, GRIP)
    assert(!onField(s, "p1", zande), "ザンデはコアがすべて除かれて消滅する")
    assert(s.players.p1.trashCores === 3, `ザンデのコア3個がアキラのトラッシュに置かれる（実際 ${s.players.p1.trashCores}）`)
    assert(!s.log.some((l) => l.includes("対象が見つからなかった")), "ボーン・キャットは空振りしない")
}

console.log("=== 2. 骨鹿のアタック：コストを課したのはザンデの効果なので、コアを除くのは骨鹿でなくザンデ ===")
{
    const { s, zande, attacker } = scene("cat-honedeer", HONEDEER, GRIP)
    assert(!onField(s, "p1", zande) && s.players.p1.trashCores === 3, `ザンデのコア3個がトラッシュへ（実際 ${s.players.p1.trashCores}）`)
    assert(coresOf(s, "p1", attacker) === 1, "アタックした骨鹿のコアは残る")
}

console.log("=== 3. 発揮しない：コストで破壊したのが赤のスピリット ===")
{
    const { s, zande } = scene("cat-red", null, VAN)
    assert(coresOf(s, "p1", zande) === 3 && s.players.p1.trashCores === 0, "紫でないので、ザンデのコアは残る")
}

console.log("=== 4. 発揮しない：コストで破壊したのがコスト4の紫のスピリット ===")
{
    const { s, zande } = scene("cat-cost4", null, VICTO)
    assert(coresOf(s, "p1", zande) === 3 && s.players.p1.trashCores === 0, "コスト3以下でないので、ザンデのコアは残る")
}

console.log("すべてのチェックに合格しました 🎉（part1052）")
