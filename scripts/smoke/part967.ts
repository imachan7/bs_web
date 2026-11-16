// smoke パート967（#579：対話モードで誘発を列に並べたあと、発生源の色が変わっていたら、解決時点の色で装甲を判定する。
// 発生源の色は集めた時点ではなく、解決する時点の個体の色で判定する）
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"

const HYDRA = "BS21-016" // デス・ヒュードラ（紫・星魂。自分の星魂スピリットがアタックしたとき、相手のスピリットのコア1個）
const GATE = "BS15-064" // 冥府へ続く魔門（紫ネクサス。紫のスピリットがアタックしたとき、手札1枚を破棄することで、バトルの間、無色扱い）
const MATAMATA = "BS22-030" // 透輝亀マタマタ（白・【重装甲：紫】。相手の紫の効果を受けない）
const VANILLA = "BS01-002" // ロクケラトプス（手札1枚・山札用）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(HYDRA).name === "デス・ヒュードラ" && getCard(HYDRA).type === "spirit", "HYDRAはデス・ヒュードラ")
    assert(getCard(HYDRA).family?.includes("星魂") === true, "HYDRAは星魂を持つ")
    assert(getCard(GATE).name === "冥府へ続く魔門" && getCard(GATE).type === "nexus", "GATEは冥府へ続く魔門")
    assert(getCard(MATAMATA).name === "透輝亀マタマタ", "MATAMATAは透輝亀マタマタ")
}

function setup(seed: string): { s: GameState; hydra: ReturnType<typeof createInstance>; mata: ReturnType<typeof createInstance> } {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "white" })
    s.interactiveTargets = true
    runTurnStart(s)
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    const hydra = createInstance(HYDRA, s.turn, 3)
    const gate = createInstance(GATE, s.turn, 1)
    const mata = createInstance(MATAMATA, s.turn, 2)
    s.players.p1.field.spirits.push(hydra)
    s.players.p1.field.nexuses.push(gate)
    s.players.p2.field.spirits.push(mata)
    s.players.p1.hand = [VANILLA]
    s.players.p2.hand = []
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: hydra.instanceId }) === null, "デス・ヒュードラでアタック")
    return { s, hydra, mata }
}

// 残りの確認（発揮の確認・破棄する手札・コアを取る相手）に答える。対象は指定の個体
function answerPending(s: GameState, pid: "p1" | "p2", targetId: string): void {
    for (let i = 0; i < 6 && s.pendingChoice; i++) {
        const pc = s.pendingChoice
        if (pc.kind === "target") assert(act(s, pid, { type: "resolveChoice", instanceId: targetId }) === null, "対象を選ぶ")
        else if (pc.kind === "card") assert(act(s, pid, { type: "resolveChoice", option: pc.options?.[0] ?? "" }) === null, "破棄する手札を選ぶ")
        else if (pc.kind === "option" && (pc.options ?? []).includes("発動する")) assert(act(s, pid, { type: "resolveChoice", option: "発動する" }) === null, "発揮する")
        else break
    }
}

function pickOption(s: GameState, name: string): string {
    const opt = (s.pendingChoice?.options ?? []).find((o) => o.includes(name))
    assert(opt !== undefined, `「${name}」が解決順の候補に出る`)
    return opt!
}

console.log("=== A. 魔門を先に解決（手札を破棄して無色に）→ デス・ヒュードラのコア除去は無色の発生源として通る ===")
{
    const { s, mata } = setup("579-a")
    const pc = s.pendingChoice
    assert(pc?.triggerOrder !== undefined, "同時発揮の解決順の選択が立つ")
    assert(act(s, "p1", { type: "resolveChoice", option: pickOption(s, "冥府へ続く魔門") }) === null, "先に魔門を選ぶ")
    answerPending(s, "p1", mata.instanceId)
    assert(s.players.p1.hand.length === 0, "魔門のコストで手札1枚を破棄した")
    assert(mata.cores === 1, `マタマタのコアが2→1（${mata.cores}）`)
}

console.log("=== B. 対照：デス・ヒュードラのコア除去を先に解決 → 紫の効果なので阻まれ、マタマタは2のまま ===")
{
    const { s, mata } = setup("579-b")
    assert(act(s, "p1", { type: "resolveChoice", option: pickOption(s, "デス・ヒュードラ") }) === null, "先にデス・ヒュードラを選ぶ")
    answerPending(s, "p1", mata.instanceId)
    assert(mata.cores === 2, `マタマタのコアは2のまま（${mata.cores}）`)
}

console.log("すべてのチェックに合格しました 🎉（part967）")
