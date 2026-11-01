// smoke パート724（P044 星鎧龍ジーク・ブレイヴ：【合体時】「このスピリットはカード名に『ジークヴルム』が
// 入っているものとして扱う」＝nameAsGrant の whileCombined。合体中はホスト（合体スピリット）に付与、
// スピリット状態では付与しない）
import {
    act,
    assert,
    bpBuffOf,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import type { CardInstance } from "../../server/src/type"

const P044 = "P044" // 星鎧龍ジーク・ブレイヴ（赤・ブレイヴ・コスト4・合体条件：コスト4以上）
const HOST = "BS14-008" // ペンタケラトップ（赤・コスト5・合体条件を満たし名前に「ジークヴルム」を含まない）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(P044).name === "星鎧龍ジーク・ブレイヴ" && getCard(P044).type === "brave", "P044は星鎧龍ジーク・ブレイヴ（ブレイヴ）")
    const cond = getCard(P044).braveCondition
    const terms: { minCost?: number }[] = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    assert(
        terms.some((t) => t.minCost === 4) && getCard(P044).effect.includes("ジークヴルム"),
        "P044は合体条件：コスト4以上で【合体時】に「ジークヴルム」扱いを持つ",
    )
    assert(getCard(HOST).cost >= 4 && !getCard(HOST).name.includes("ジークヴルム"), "HOSTはコスト4以上で名前に「ジークヴルム」を含まない")
    assert(getCard(VANILLA).name === "ロクケラトプス" && !getCard(VANILLA).name.includes("ジークヴルム"), "VANILLAは名前に「ジークヴルム」を含まない")
}

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    runTurnStart(s)
    s.turn = 3
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1): CardInstance {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

// 観測方法：「自分のフィールドでカード名に『ジークヴルム』が入っているスピリット1体につきBP+1000」の
// 効果（amountCounter ownNameIncludes は nameAsGrant の継続付与 namesAsContinuous を読む）を
// 第三者のスピリットに解決し、何体ぶん乗ったかで扱いを確かめる
function siegWurmOwnCount(s: GameState, probe: CardInstance): number {
    resolveAction(s, "p1", probe, {
        type: "timedEffect",
        content: [{ type: "bp", amount: 1000, amountCounter: { ownNameIncludes: "ジークヴルム" } }],
        duration: "turn",
        target: "self",
    })
    return bpBuffOf(s, probe) / 1000
}

console.log("=== 1. 合体中：ホスト（合体スピリット）はカード名に「ジークヴルム」が入っているものとして扱う ===")
{
    const s = game("t724-combined")
    const host = put(s, "p1", HOST, 1)
    const brave = put(s, "p1", P044, 1)
    assert(
        act(s, "p1", { type: "combineBrave", braveInstanceId: brave.instanceId, hostInstanceId: host.instanceId }) === null,
        "ペンタケラトップに星鎧龍ジーク・ブレイヴを合体させる",
    )
    refreshLevelAsOverrides(s) // nameAsGrant等の継続付与（CardInstance.namesAsContinuous）を反映
    const probe = put(s, "p1", VANILLA, 1)
    assert(
        siegWurmOwnCount(s, probe) === 1,
        "合体中はホストが「ジークヴルム」入り1体として数えられる（ブレイヴ単体の名前は数えない）",
    )
}

console.log("=== 2. 合体していない：ホストにもブレイヴにも名前は入っていない扱い（【合体時】効果は発揮しない） ===")
{
    const s = game("t724-alone")
    put(s, "p1", HOST, 1)
    put(s, "p1", P044, 1) // スピリット状態のブレイヴ（合体させていない）
    refreshLevelAsOverrides(s)
    const probe = put(s, "p1", VANILLA, 1)
    assert(siegWurmOwnCount(s, probe) === 0, "合体していなければ「ジークヴルム」入りは0体")
}

console.log("すべてのチェックに合格しました 🎉（part724）")
