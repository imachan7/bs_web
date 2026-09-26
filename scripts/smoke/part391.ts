// smoke パート391（コアを「置く」器 placeCores：from5種・to6種・target各種・upTo/upToLevel/orReserve・BS10-056ガード）
import {
    act,
    assert,
    createGame,
    createInstance,
    getCard,
    resolveAction,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"

const RED = "BS01-002" // ロクケラトプス（赤・コスト1・バニラ・Lv1BP1000）
const GREEN = "BS01-051" // フライングミラージュ（緑・コスト1・バニラ・Lv1BP2000）
const WHITE = "BS01-074" // バーサーカー・ガン（白・コスト1・バニラ・Lv1BP1000）
const NEXUS = "BS13-063" // 血塗られた魔具（紫ネクサス・コスト3・Lv2はコア2個）
const GUARD = "BS10-056" // 蒼天大聖モンゴクウ（コアステップ以外はボイドからフィールド/リザーブへ置けない）

console.log("=== 前提: カードの機械確認 ===")
{
    assert(getCard(RED).name === "ロクケラトプス" && getCard(RED).colors.includes("red"), "REDは赤")
    assert(getCard(GREEN).name === "フライングミラージュ" && getCard(GREEN).colors.includes("green"), "GREENは緑")
    assert(getCard(WHITE).name === "バーサーカー・ガン" && getCard(WHITE).colors.includes("white"), "WHITEは白")
    assert(getCard(NEXUS).name === "血塗られた魔具" && getCard(NEXUS).type === "nexus", "NEXUSはネクサス")
    assert(getCard(GUARD).name === "蒼天大聖モンゴクウ" && getCard(GUARD).type === "spirit", "GUARDはモンゴクウ")
}

function game(seed: string, interactive = false): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "purple" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.turn = 3
    s.phase = "core"
    s.players.p1.reserve = 0
    s.players.p2.reserve = 0
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores = 1) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores = 0) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    refreshLevelAsOverrides(s)
    return inst
}

console.log("=== 1. from×to の基本経路（自動選択・非対話） ===")
{
    const s = game("basic")
    const p1 = s.players.p1
    // void → reserve
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "reserve", count: 2 })
    assert(p1.reserve === 2, "void→reserveで2個増える")
    // reserve → trash
    resolveAction(s, "p1", null, { type: "placeCores", from: "reserve", to: "trash", count: 2 })
    assert(p1.reserve === 0 && p1.trashCores === 2, "reserve→trashで移動する")
    // trash → life
    const lifeBefore = p1.life
    resolveAction(s, "p1", null, { type: "placeCores", from: "trash", to: "life", count: 2 })
    assert(p1.trashCores === 0 && p1.life === lifeBefore + 2, "trash→lifeでtrashが0になりlifeが増える")
    // void → deckSide
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "deckSide", count: 3 })
    assert(p1.deckSideCores === 3, "void→deckSideで3個置かれる")
    // self → reserve
    const sp = put(s, "p1", RED, 5)
    resolveAction(s, "p1", sp, { type: "placeCores", from: "self", to: "reserve", count: 2 })
    assert(sp.cores === 3 && p1.reserve === 2, "self→reserveでself.coresが減りreserveが増える")
}

console.log("=== 2. field（ネクサス優先→スピリット実効BP最小）→ trash ===")
{
    const s = game("field-source")
    const p1 = s.players.p1
    const nexus = putNexus(s, "p1", NEXUS, 2)
    // cores5は両者とも最大Lvで頭打ち（RED=Lv3 BP4000／GREEN=Lv2 BP3000）にして、
    // 維持コア割れ（destroySpirit）を起こさずに実効BP最小側だけが削れることを確かめる
    const strong = put(s, "p1", RED, 5) // Lv3 BP4000
    const weak = put(s, "p1", GREEN, 5) // Lv2 BP3000
    resolveAction(s, "p1", null, { type: "placeCores", from: "field", to: "trash", count: 3 })
    assert(nexus.cores === 0 && p1.trashCores === 3, "まずネクサスのコア2個が優先して取られる")
    assert(weak.cores === 4 && strong.cores === 5, "残り1個は実効BP最小のスピリットから取られる")
    resolveAction(s, "p1", null, { type: "placeCores", from: "field", to: "trash", count: 1 })
    assert(weak.cores === 3 && strong.cores === 5, "続けても実効BP最小側から取られ続ける")
}

console.log("=== 3. target:one 候補2体、対話ONなら選択待ち・選んだ個体に置かれる ===")
{
    const s = game("choose-on", true)
    const a = put(s, "p1", RED, 1)
    const b = put(s, "p1", GREEN, 1)
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "spirit", target: "one", count: 2 })
    assert(s.pendingChoice !== null && s.pendingChoice?.kind === "target", "候補2体なら選択待ちが立つ")
    const candidates = s.pendingChoice!.candidates
    assert(candidates.length === 2, "候補は2体")
    const chosenId = candidates.includes(a.instanceId) ? a.instanceId : b.instanceId
    assert(act(s, "p1", { type: "resolveChoice", instanceId: chosenId }) === null, "対象を選ぶ")
    const chosen = chosenId === a.instanceId ? a : b
    const other = chosenId === a.instanceId ? b : a
    assert(chosen.cores === 3 && other.cores === 1, "選んだ個体にだけ置かれる")
}

console.log("=== 4. target:one 候補2体、対話OFFなら実効BP最大へ自動で置かれる ===")
{
    const s = game("choose-off", false)
    const weak = put(s, "p1", RED, 1) // BP1000
    const strong = put(s, "p1", GREEN, 1) // BP2000
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "spirit", target: "one", count: 2 })
    assert(strong.cores === 3 && weak.cores === 1, "非対話では実効BP最大に自動で置かれる")
}

console.log("=== 5. target:all + filter（色）で該当スピリットすべてに置く ===")
{
    const s = game("all-filter")
    const red1 = put(s, "p1", RED, 1)
    const red2 = put(s, "p1", RED, 1)
    const green = put(s, "p1", GREEN, 1)
    resolveAction(s, "p1", null, {
        type: "placeCores",
        from: "void",
        to: "spirit",
        target: "all",
        filter: { color: "red" },
        count: 2,
    })
    assert(red1.cores === 3 && red2.cores === 3, "赤のスピリット2体はどちらも増える")
    assert(green.cores === 1, "緑のスピリットは対象外のまま")
}

console.log("=== 6. count:'all'（トラッシュのコアを全部リザーブへ） ===")
{
    const s = game("count-all")
    const p1 = s.players.p1
    p1.trashCores = 5
    resolveAction(s, "p1", null, { type: "placeCores", from: "trash", to: "reserve", count: "all" })
    assert(p1.trashCores === 0 && p1.reserve === 5, "トラッシュのコアが全部リザーブへ移る")
}

console.log("=== 7. countCounter（自分のネクサス数×2をvoid→reserveへ） ===")
{
    const s = game("counter")
    const p1 = s.players.p1
    putNexus(s, "p1", NEXUS, 0)
    putNexus(s, "p1", NEXUS, 0)
    resolveAction(s, "p1", null, {
        type: "placeCores",
        from: "void",
        to: "reserve",
        count: 2,
        countCounter: "ownNexuses",
    })
    assert(p1.reserve === 4, "自分のネクサス数2枚×2個=4個リザーブに置かれる")
}

console.log("=== 8. upTo（ライフが5になるように不足分だけ置く） ===")
{
    const s = game("upto-life")
    const p1 = s.players.p1
    p1.life = 3
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "life", upTo: 5, count: 0 })
    assert(p1.life === 5, "不足分の2個だけ置かれてライフ5になる")
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "life", upTo: 5, count: 0 })
    assert(p1.life === 5, "すでに5以上なら置かれない")
}

console.log("=== 9. upToLevel（ネクサスがLv2になるまで不足分を置く） ===")
{
    const s = game("upto-level")
    const nexus = putNexus(s, "p1", NEXUS, 0) // Lv1（Lv2に必要なコアは2個）
    resolveAction(s, "p1", nexus, {
        type: "placeCores",
        from: "void",
        to: "nexus",
        target: "self",
        upToLevel: 2,
        count: 0,
    })
    assert(nexus.cores === 2, "selfをネクサス自身にすればLv2に必要な2個が置かれる")
    resolveAction(s, "p1", nexus, {
        type: "placeCores",
        from: "void",
        to: "nexus",
        target: "self",
        upToLevel: 2,
        count: 0,
    })
    assert(nexus.cores === 2, "すでにLv2以上なら置かれない")
}

console.log("=== 10. orReserve（対話ONで選択、対話OFFはtoがspiritなのでリザーブへ） ===")
{
    const s = game("or-reserve-off", false)
    const p1 = s.players.p1
    const sp = put(s, "p1", RED, 1)
    resolveAction(s, "p1", sp, { type: "placeCores", from: "void", to: "spirit", target: "self", count: 2, orReserve: true })
    assert(p1.reserve === 2 && sp.cores === 1, "非対話でtoがspiritのときはリザーブへ倒れる")

    const s2 = game("or-reserve-on", true)
    const sp2 = put(s2, "p1", RED, 1)
    resolveAction(s2, "p1", sp2, { type: "placeCores", from: "void", to: "spirit", target: "self", count: 2, orReserve: true })
    assert(s2.pendingChoice !== null && s2.pendingChoice?.kind === "option", "対話ONでは選択肢が立つ")
    assert(act(s2, "p1", { type: "resolveChoice", option: "対象の上に置く" }) === null, "「対象の上に置く」を選ぶ")
    assert(sp2.cores === 3, "「対象の上に置く」を選べば通常どおりスピリット上に置かれる")
}

console.log("=== 11. orReserve（to:life、非対話の既定はライフ側） ===")
{
    const s = game("or-reserve-life")
    const p1 = s.players.p1
    const before = p1.life
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "life", count: 2, orReserve: true })
    assert(p1.life === before + 2 && p1.reserve === 0, "非対話・to:lifeではライフに置かれる")
}

console.log("=== 12. BS10-056ガード：コアステップ以外はボイドからspirit/nexus/reserveへ置けない（trashは通る） ===")
{
    const s = game("guard")
    const p1 = s.players.p1
    put(s, "p1", GUARD, 1)
    s.phase = "main"
    const reserveBefore = p1.reserve
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "reserve", count: 2 })
    assert(p1.reserve === reserveBefore, "main フェイズではボイド→リザーブが止まる")
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "trash", count: 2 })
    assert(p1.trashCores === 2, "トラッシュ行きはガードの対象外なので通る")
    s.phase = "core"
    resolveAction(s, "p1", null, { type: "placeCores", from: "void", to: "reserve", count: 2 })
    assert(p1.reserve === reserveBefore + 2, "コアステップなら通る")
}

console.log("すべてのチェックに合格しました 🎉（part391）")
