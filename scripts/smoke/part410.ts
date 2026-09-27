// smoke パート410（declare：「〜を指定する。指定した〜」の器。DECLARE_UNIFY.md）
import { act, assert, createGame, createInstance, getCard, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { CardInstance, EffectAction, PlayerId } from "../../server/src/type"
import { findStrayDeclared } from "../validate-cards"

const RED = "BS01-001" // ゴラドン（赤・コスト0・爬獣）
const PURPLE = "BS01-031" // デス・ハーデス（紫・コスト3・呪鬼）
const GREEN = "BS01-050" // ビートビートル（緑・コスト0・殻虫）
const RED_PURPLE = "BS09-018" // 暗空の勇者皇ザンバ（紫赤）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).colors.join() === "red" && getCard(RED).cost === 0 && getCard(RED).family.includes("爬獣"), "RED")
    assert(getCard(PURPLE).colors.join() === "purple" && getCard(PURPLE).cost === 3 && getCard(PURPLE).family.includes("呪鬼"), "PURPLE")
    assert(getCard(GREEN).colors.join() === "green" && getCard(GREEN).cost === 0, "GREEN")
    assert([...getCard(RED_PURPLE).colors].sort().join() === "purple,red", "RED_PURPLE")
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    return s
}
function put(s: GameState, pid: PlayerId, cardId: string): CardInstance {
    const inst = createInstance(cardId, s.turn, 1)
    s.players[pid].field.spirits.push(inst)
    return inst
}
const alive = (s: GameState, inst: CardInstance): boolean =>
    [...s.players.p1.field.spirits, ...s.players.p2.field.spirits].some((x) => x.instanceId === inst.instanceId)

const exhaustDeclaredColor: EffectAction = {
    type: "declare",
    what: "color",
    then: { type: "exhaust", count: 0, all: true, anySide: true, filter: { declared: "match" } },
}

console.log("=== 1. 色を6色から指定（対話）：指定した色のスピリットすべてを疲労 ===")
{
    const s = game("color", true)
    const a = put(s, "p1", RED)
    const b = put(s, "p2", RED)
    const c = put(s, "p2", PURPLE)
    resolveAction(s, "p1", null, exhaustDeclaredColor)
    assert(s.pendingChoice?.pid === "p1" && s.pendingChoice.options?.length === 6, "使用者が6色から選ぶ")
    act(s, "p1", { type: "resolveChoice", option: "赤" })
    assert(a.isRested && b.isRested && !c.isRested, "赤だけが両陣営とも疲労")
}

console.log("=== 2. 非対話：色・コストは相手の場で最多の値を自動で指定 ===")
{
    const s = game("auto", false)
    put(s, "p2", RED)
    const p1 = put(s, "p2", PURPLE)
    const p2 = put(s, "p2", PURPLE)
    resolveAction(s, "p1", null, exhaustDeclaredColor)
    assert(p1.isRested && p2.isRested, "相手の場で最多の紫")
    const t = game("cost", false)
    const zero = put(t, "p2", RED)
    const three = put(t, "p2", PURPLE)
    put(t, "p2", GREEN)
    resolveAction(t, "p1", null, {
        type: "declare",
        what: "cost",
        options: [0, 1, 2, 3, 4],
        then: { type: "destroy", count: 0, all: true, filter: { declared: "match" } },
    })
    assert(!alive(t, zero) && alive(t, three), "コスト0（2体）を指定してコスト0だけ破壊")
}

console.log("=== 3. 相手が自分のスピリットの色から指定し、指定されなかった色を1つでも持つものを破壊 ===")
{
    const s = game("except", true)
    const red = put(s, "p2", RED)
    const rp = put(s, "p2", RED_PURPLE)
    const purple = put(s, "p2", PURPLE)
    resolveAction(s, "p1", null, {
        type: "declare",
        what: "color",
        from: "spirits",
        chooser: "opponent",
        then: { type: "destroy", count: 0, all: true, filter: { declared: "except" } },
    })
    assert(s.pendingChoice?.pid === "p2" && s.pendingChoice.options?.join() === "赤,紫", "相手が自分の場の色から選ぶ")
    act(s, "p2", { type: "resolveChoice", option: "赤" })
    assert(alive(s, red) && !alive(s, rp) && !alive(s, purple), "紫を持つもの（紫赤も）が破壊される")
}

console.log("=== 4. お互いが指定：どちらかが指定した色だけの個体は残る ===")
{
    const s = game("each", true)
    const r1 = put(s, "p1", RED)
    const g1 = put(s, "p1", GREEN)
    const p2 = put(s, "p2", PURPLE)
    const g2 = put(s, "p2", GREEN)
    resolveAction(s, "p1", null, {
        type: "declare",
        what: "color",
        from: "spirits",
        chooser: "each",
        then: { type: "destroy", count: 0, all: true, anySide: true, filter: { declared: "except" } },
    })
    assert(s.pendingChoice?.pid === "p1", "先に使用者")
    act(s, "p1", { type: "resolveChoice", option: "赤" })
    assert(s.pendingChoice?.pid === "p2", "次に相手")
    act(s, "p2", { type: "resolveChoice", option: "紫" })
    assert(alive(s, r1) && alive(s, p2) && !alive(s, g1) && !alive(s, g2), "赤と紫は残り、緑は両陣営とも破壊")
}

console.log("=== 5. 系統を自分の場から指定し、sequence の中でも置き換わる ===")
{
    const s = game("family", false)
    const a = put(s, "p1", PURPLE)
    const b = put(s, "p1", PURPLE)
    const c = put(s, "p1", RED)
    for (const x of [a, b, c]) x.isRested = true
    resolveAction(s, "p1", null, {
        type: "declare",
        what: "family",
        from: "spirits",
        then: { type: "sequence", actions: [{ type: "refreshOne", count: 3, filter: { declared: "match" } }] },
    })
    assert(!a.isRested && !b.isRested && c.isRested, "最多の呪鬼を指定し、呪鬼だけ回復")
}

console.log("=== 6. 指定できる値が無ければ何もしない ===")
{
    const s = game("empty", false)
    const mine = put(s, "p1", RED)
    const n = s.log.length
    resolveAction(s, "p1", null, {
        type: "declare",
        what: "color",
        from: "spirits",
        chooser: "opponent",
        then: { type: "destroy", count: 0, all: true, anySide: true, filter: { declared: "except" } },
    })
    assert(alive(s, mine) && s.log.slice(n).some((l) => l.includes("指定できるものがなかった")), "相手の場にスピリットがいないので不発")
}

console.log("=== 7. validate：declare の外の declared を落とす ===")
{
    const bad = [{ cardId: "X", effects: [{ kind: "magic", action: { type: "destroy", count: 1, filter: { declared: "match" } } }] }]
    const good = [{ cardId: "Y", effects: [{ kind: "magic", action: exhaustDeclaredColor }] }]
    assert(findStrayDeclared(bad as never).length === 1, "外に書いたら1件")
    assert(findStrayDeclared(good as never).length === 0, "then の中なら0件")
}

console.log("すべてのチェックに合格しました 🎉（part410）")
