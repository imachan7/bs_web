// smoke パート803（BS21 バッチ後の規則：【自分のライフ減少後】は原因を問わず1回だけ聞く／BS21-082 の「この効果で自分はバーストを発動できない」はその減少だけ止める／
// 「相手によって」の誘発は自分の効果では起きない／バースト禁止（072 Lv2）があれば聞かない。docs/design/BURST.md §2、2026-11-06 ユーザー確認）
import { act, assert, createGame, createInstance, fireStepTriggers, getCard, placeBurst, refreshLevelAsOverrides, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const X01 = "BS18-X01" // 超覇王ロード・ドラゴン・セイバー（Lv2・3コアで、アタック時にライフのコア1個を自分に置く任意の支払い）
const DARK = "BS16-008" // ダークナイト・ドラゴン（召喚時：ライフのコア1個をボイドに置くことで BP6000以下を破壊）
const CORAL = "BS21-072" // 珊瑚の樹海（Lv2：ステップ開始時にライフ1個を払うとお互いバースト不可）
const DREAM = "BS21-082" // ライフドリーム
const FRUIT = "BS01-107" // 命の果実（相手によって自分のライフが減らされたとき、ドロー）
const HYOGAN = "SD06-016" // 絶甲氷盾（バースト：自分のライフ減少後）
const RIO = "BS17-040" // 呪術士リオ（黄・効果なし）
const VAN = "BS01-002" // ロクケラトプス（赤・効果なし）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(X01).name === "超覇王ロード・ドラゴン・セイバー" && getCard(X01).type === "spirit" && getCard(X01).effect.includes("ライフのコア1個をこのスピリットに置くことで"), "X01は超覇王ロード・ドラゴン・セイバー")
    assert(getCard(DARK).name === "ダークナイト・ドラゴン" && getCard(DARK).cost === 6 && getCard(DARK).effect.includes("自分のライフのコア1個をボイドに置くことで"), "DARKはダークナイト・ドラゴン")
    assert(getCard(CORAL).name === "珊瑚の樹海" && getCard(CORAL).type === "nexus", "CORALは珊瑚の樹海")
    assert(getCard(DREAM).name === "ライフドリーム" && getCard(DREAM).type === "magic" && getCard(DREAM).effect.includes("この効果で自分はバーストを発動できない"), "DREAMはライフドリーム")
    assert(getCard(FRUIT).name === "命の果実" && getCard(FRUIT).effect.includes("相手によって自分のライフが減らされたとき"), "FRUITは命の果実")
    assert(getCard(HYOGAN).name === "絶甲氷盾" && getCard(HYOGAN).effect.includes("ライフ減少後"), "HYOGANは絶甲氷盾")
    assert(getCard(RIO).name === "呪術士リオ" && getCard(RIO).colors[0] === "yellow", "RIOは呪術士リオ（黄）")
    assert(getCard(VAN).name === "ロクケラトプス", "VANはロクケラトプス")
}

function game(seed: string, phase: "main" | "attack" = "attack"): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "green" })
    s.turn = 3
    s.turnPlayer = "p1"
    s.priorityPlayer = "p1"
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

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 1): void {
    s.players[pid].field.nexuses.push(createInstance(cardId, s.turn, cores))
    refreshLevelAsOverrides(s)
}

// 保留中の選択を片づけ、バースト発動の確認が出た回数を返す（バーストは断る。ほかの確認は受ける）
function drain(s: GameState): number {
    let asks = 0
    for (let i = 0; i < 30 && s.pendingChoice; i++) {
        const pc = s.pendingChoice as { pid?: PlayerId; kind: string; options?: string[]; candidates?: string[]; burstActivate?: unknown }
        const who = pc.pid ?? "p1"
        let err: string | null
        if (pc.burstActivate !== undefined) {
            asks++
            err = act(s, who, { type: "resolveChoice" })
        } else if (pc.kind === "option") {
            const o = pc.options ?? []
            err = act(s, who, { type: "resolveChoice", option: o.find((x) => ["発動する", "置く", "支払う"].some((p) => x.includes(p))) ?? o[0] ?? "" })
        } else if (pc.kind === "target") {
            err = pc.candidates?.[0] !== undefined ? act(s, who, { type: "resolveChoice", instanceId: pc.candidates[0] }) : act(s, who, { type: "resolveChoice" })
        } else err = act(s, who, { type: "resolveChoice" })
        if (err) break
    }
    return asks
}

console.log("=== A: 自分の効果（X01 のアタック時の支払い）で自分のライフが減ると、自分のバーストを聞かれる（規則1） ===")
{
    const s = game("a")
    const x = put(s, "p1", X01, 3) // Lv2
    placeBurst(s, "p1", HYOGAN)
    assert(act(s, "p1", { type: "attack", instanceId: x.instanceId }) === null, "X01でアタックできる")
    const asks = drain(s)
    assert(s.players.p1.life === 4, "ライフのコア1個を自分に置いて、自分のライフは5→4")
    assert(asks === 1, `自分の効果で減っても【自分のライフ減少後】は聞かれる（実際 ${asks} 回）`)
}

console.log("=== A2: 自分のコスト（DARK の召喚時の支払い）でも聞かれる（規則1） ===")
{
    const s = game("a2", "main")
    put(s, "p2", VAN, 1) // 破壊対象（対象がいないと支払えない）
    placeBurst(s, "p1", HYOGAN)
    s.players.p1.hand = [DARK]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "DARKを召喚できる")
    const asks = drain(s)
    assert(s.players.p1.life === 4, "ライフのコア1個をボイドに置いて、自分のライフは5→4")
    assert(asks === 1, `自分のコスト支払いで減っても聞かれる（実際 ${asks} 回）`)
}

console.log("=== B: 相手のアタックをライフで受けても聞かれるのは1回だけ（規則2）。境目：相手のアタックは従来どおり聞かれる ===")
{
    const s = game("b")
    const van = put(s, "p1", VAN, 1)
    placeBurst(s, "p2", HYOGAN)
    assert(act(s, "p1", { type: "attack", instanceId: van.instanceId }) === null, "ロクケラトプスでアタックできる")
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    const asks = drain(s) // 1回目は断る。同じ減少で2回目が出ないこと
    assert(s.players.p2.life === 4, "相手のライフは5→4")
    assert(asks === 1, `1回のライフ減少で聞かれるのは1回だけ（実際 ${asks} 回）`)
}

console.log("=== C: ライフドリームの付与効果でライフが減ってもその減少では聞かれない（規則3）。境目：別の原因（自分のコスト）では聞かれる ===")
{
    const s = game("c", "main")
    const rio = put(s, "p1", RIO, 1)
    put(s, "p2", VAN, 1) // DARKの破壊対象
    placeBurst(s, "p1", HYOGAN)
    s.players.p1.hand = [DREAM, DARK]
    assert(act(s, "p1", { type: "castMagic", handIndex: 0, timing: "main" }) === null, "ライフドリームをメインで使用できる")
    assert(drain(s) === 0, "マジックを使っただけでは聞かれない")
    assert(act(s, "p1", { type: "summon", handIndex: s.players.p1.hand.indexOf(DARK) }) === null, "DARKを召喚できる")
    assert(drain(s) === 1 && s.players.p1.life === 4, "同じターンでも、DARKの支払いで減ったときは聞かれる")
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: rio.instanceId }) === null, "呪術士リオでアタックできる")
    const asks = drain(s)
    assert(s.players.p1.life === 3, "付与された効果でライフのコア1個を置き、自分のライフは4→3")
    assert(asks === 0, `「この効果で自分はバーストを発動できない」ので、そのライフ減少では聞かれない（実際 ${asks} 回）`)
}

console.log("=== D: 「相手によって」の誘発（命の果実）は自分の効果で減ったときには起きない（規則4）。境目：相手のアタックでは起きる ===")
{
    const s = game("d", "main")
    putNexus(s, "p1", FRUIT, 0) // Lv1
    put(s, "p2", VAN, 1) // 破壊対象（対象がいないと支払えない）
    placeBurst(s, "p1", HYOGAN)
    s.players.p1.hand = [DARK]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "DARKを召喚できる")
    const asks = drain(s)
    assert(s.players.p1.life === 4, "自分のライフは5→4")
    assert(s.players.p1.hand.length === 0 && s.players.p1.deck.length === 40, "命の果実のドローは起きない（手札0・デッキ40のまま）")
    assert(asks === 1, `バーストは聞かれる（実際 ${asks} 回）`)
}
{
    const s = game("d2")
    s.turnPlayer = "p2"
    s.priorityPlayer = "p2"
    putNexus(s, "p1", FRUIT, 0)
    const van = put(s, "p2", VAN, 1)
    assert(act(s, "p2", { type: "attack", instanceId: van.instanceId }) === null, "相手がアタックできる")
    assert(takeLifeAndResolve(s, "p1") === null, "ライフで受ける")
    drain(s)
    assert(s.players.p1.life === 4 && s.players.p1.hand.length === 1, "相手のアタックでは命の果実が発動してドロー（手札1）")
}

console.log("=== E: 珊瑚の樹海 Lv2 でバースト禁止にしたターンは、自分の効果でライフが減っても聞かれない（規則5）。境目：払わなければ聞かれる ===")
{
    const s = game("e")
    putNexus(s, "p1", CORAL, 2) // Lv2
    const x = put(s, "p1", X01, 3)
    fireStepTriggers(s, "attack")
    drain(s) // ライフ1個をリザーブへ（バーストはまだ置いていない）
    assert(s.players.p1.life === 4, "珊瑚の樹海の支払いで自分のライフは5→4")
    placeBurst(s, "p1", HYOGAN)
    assert(act(s, "p1", { type: "attack", instanceId: x.instanceId }) === null, "X01でアタックできる")
    const asks = drain(s)
    assert(s.players.p1.life === 3, "X01の支払いで自分のライフは4→3")
    assert(asks === 0, `このターンお互いバースト不可なので聞かれない（実際 ${asks} 回）`)
}
{
    const s = game("e2")
    putNexus(s, "p1", CORAL, 2)
    const x = put(s, "p1", X01, 3)
    fireStepTriggers(s, "attack")
    assert(s.pendingChoice !== null, "珊瑚の樹海の支払い確認が出る")
    act(s, "p1", { type: "resolveChoice" }) // 払わない
    drain(s)
    assert(s.players.p1.life === 5, "払わなければライフは5のまま")
    placeBurst(s, "p1", HYOGAN)
    assert(act(s, "p1", { type: "attack", instanceId: x.instanceId }) === null, "X01でアタックできる")
    assert(drain(s) === 1, "禁止していないので聞かれる")
}

console.log("すべてのチェックに合格しました 🎉（part803）")
