// smoke パート970（BS19-X07 黒蟲の妖刀ウスバカゲロウのフラッシュ神速。クライアントの神速召喚候補と、
// サーバーが受理する形（スピリット状態／合体）・神速の支払い元の判定を確かめる）
import {
    assert,
    act,
    createGame,
    createInstance,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { bravesOf, sokuPayableInstanceIds } from "../../shared/rules"

const USUBA = "BS19-X07" // 黒蟲の妖刀ウスバカゲロウ（緑ブレイヴ・【神速】・コスト5）
const DUALDO = "BS10-007" // デュアルド（赤・バニラ・コスト5。ウスバカゲロウの合体先として既存テストで使用）
const VANILLA = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ）
const CHIGIRI = "BS16-065" // 誓いの桃園（緑ネクサス。Lv1で神速召喚の支払い元を広げる）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(USUBA).name === "黒蟲の妖刀ウスバカゲロウ" && getCard(USUBA).type === "brave", "USUBAはブレイヴ")
    assert(getCard(USUBA).effects.some((e) => e.kind === "keyword" && e.keyword === "soku"), "USUBAは【神速】を静的に持つ")
    assert(getCard(DUALDO).name === "デュアルド" && getCard(DUALDO).type === "spirit", "DUALDOはスピリット")
    assert(getCard(VANILLA).name === "ロクケラトプス" && getCard(VANILLA).type === "spirit", "VANILLAはスピリット")
    assert(getCard(CHIGIRI).name === "誓いの桃園" && getCard(CHIGIRI).type === "nexus", "CHIGIRIはネクサス")
}

// アタックステップのフラッシュで、自分が優先権を持つ状態
function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = false
    runTurnStart(s)
    s.turn = 3
    s.phase = "attack"
    s.isFlashTiming = true
    s.priorityPlayer = "p1"
    s.players.p1.reserve = 10
    s.players.p2.reserve = 10
    s.players.p1.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p2.deck = Array.from({ length: 40 }, () => VANILLA)
    s.players.p1.hand = [USUBA]
    return s
}

function put(s: GameState, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. (a) スピリット状態で神速召喚（リザーブから支払う） ===")
{
    const s = game("case1a")
    const err = act(s, "p1", { type: "summon", handIndex: 0 })
    assert(err === null, `フラッシュでスピリット状態のウスバカゲロウを神速召喚できる（実際: ${String(err)}）`)
    assert(s.players.p1.hand.length === 0, "手札から消える")
    assert(s.players.p1.field.spirits.some((i) => i.cardId === USUBA), "スピリットとして場に出る")
    assert(s.players.p1.reserve === 4, `コスト5＋維持コア1をリザーブから払う（実際のリザーブ: ${s.players.p1.reserve}）`)
}

console.log("=== 2. (b) 自分のスピリットに合体させて神速召喚（ダイレクトブレイヴ） ===")
{
    const s = game("case2b")
    const host = put(s, DUALDO, 1)
    const err = act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: host.instanceId })
    assert(err === null, `フラッシュで合体させて神速召喚できる（実際: ${String(err)}）`)
    assert(s.players.p1.hand.length === 0, "手札から消える")
    assert(bravesOf(s.players.p1, host).some((b) => b.cardId === USUBA), "デュアルドに合体している")
    assert(s.players.p1.reserve === 5, `コスト5のみ払う（維持コアは要らない。実際のリザーブ: ${s.players.p1.reserve}）`)
}

console.log("=== 3. (c) 神速の支払いはリザーブだけ（フィールドのコアは払えない） ===")
{
    const s = game("case3c")
    s.players.p1.reserve = 0
    const host = put(s, VANILLA, 6)
    const err = act(s, "p1", {
        type: "summon",
        handIndex: 0,
        paySources: [{ instanceId: host.instanceId, count: 5 }],
    })
    assert(err !== null && err.includes("【神速】"), `フィールドのコアでは神速召喚の支払いにできない（実際: ${String(err)}）`)
    assert(host.cores === 6, "フィールドのコアは減らない")
    assert(s.players.p1.hand.length === 1, "手札は残る")
}

console.log("=== 4. 支払い元の共有判定（クライアントのコア置き場の上限が使う述語） ===")
{
    const s = game("case4")
    const host = put(s, VANILLA, 3)
    assert(!sokuPayableInstanceIds(s, "p1").has(host.instanceId), "神速の支払い元の既定はリザーブのみ（フィールドのスピリットは含まれない）")
    const nexus = createInstance(CHIGIRI, s.turn, 0)
    s.players.p1.field.nexuses.push(nexus)
    refreshLevelAsOverrides(s)
    assert(sokuPayableInstanceIds(s, "p1").has(host.instanceId), "誓いの桃園Lv1があればフィールドのスピリットも支払い元になる（対照）")
}

console.log("すべてのチェックに合格しました 🎉（part970）")
