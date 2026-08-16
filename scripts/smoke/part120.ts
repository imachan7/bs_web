// smoke パート120（§5-B：封印された魔導書 Lv1）
//
// 新設した機構:
//   - kind:"bothSidesTargetRedirect" ＋ EffectModules.bothSidesPids
//     「お互いを対象とするマジックの効果」の対象を片側だけに変更する。両陣営を対象にするアクション
//     （destroyNexus side:"both" / bothSidesCoreToTrash / bothSidesCoreToVoid / exhaustAll side:"both" /
//      returnAllToHand side:"both" / nexusCoresToTrash side:"both" / draw side:"both" / discardBothHands）
//     が、ハードコードの ["p1","p2"] の代わりに bothSidesPids を呼ぶ。
//     本来は「相手のみ」「自分のみ」を選べるが、選択を挟む仕組みが無いため
//     発生源の持ち主に有利な側に固定する（card-notes に記載）
// 実装したカード:
//   - BS02-087 封印された魔導書 Lv1（お互いを対象としたマジックの効果の対象を片側のみに変更）
import { assert, createGame, createInstance, currentLevel, getCard, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { bothSidesPids, resolveMagic } from "../../server/src/logic/EffectModules"

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function putNexus(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.nexuses.push(inst)
    return inst
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS02-087").name === "封印された魔導書" && getCard("BS02-087").type === "nexus", "BS02-087 は封印された魔導書（ネクサス）")
    assert(getCard("BS02-093").name === "マインドコントロール" && getCard("BS02-093").type === "magic", "BS02-093 はマインドコントロール（マジック）")
    assert(getCard("BS01-031").name === "デス・ハーデス", "BS01-031 はデス・ハーデス")
}

console.log("=== BS02-087 封印された魔導書 Lv1：お互いを対象とするマジックの対象が片側のみになる ===")
{
    // 対照：魔導書なし。マインドコントロール（メイン）で両者のスピリットからコア4個ずつがトラッシュへ
    const base = createGame("t120-book-base", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(base)
    base.turnPlayer = "p1"
    const baseOwn = put(base, "p1", "BS01-031", 4)
    const baseOpp = put(base, "p2", "BS01-031", 4)
    resolveMagic(base, "p2", "BS02-093", "main")
    assert(baseOwn.cores === 0 || !base.players.p1.field.spirits.some((x) => x.instanceId === baseOwn.instanceId), "魔導書なしならp1側もコアを失う")
    assert(baseOpp.cores === 0 || !base.players.p2.field.spirits.some((x) => x.instanceId === baseOpp.instanceId), "魔導書なしならp2側もコアを失う")

    // 魔導書あり：発生源の持ち主（p1）が対象から外れる
    const s = createGame("t120-book-1", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    s.turnPlayer = "p1" // 『自分のターン』
    const book = putNexus(s, "p1", "BS02-087", 0) // Lv1
    assert(currentLevel(book).level === 1, `封印された魔導書は0コアでLv1（実際: ${String(currentLevel(book).level)}）`)
    const own = put(s, "p1", "BS01-031", 4)
    const opp = put(s, "p2", "BS01-031", 4)

    resolveMagic(s, "p2", "BS02-093", "main")
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === own.instanceId) && own.cores === 4,
        `p1のスピリットは対象から外れてコアを失わない（実際: ${String(own.cores)}個）`,
    )
    assert(
        !s.players.p2.field.spirits.some((x) => x.instanceId === opp.instanceId) || opp.cores === 0,
        `p2のスピリットはコアを失う（実際: ${String(opp.cores)}個）`,
    )
}

console.log("=== BS02-087 封印された魔導書：相手のターンでは働かない ===")
{
    const s = createGame("t120-book-2", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS02-087", 0)
    const own = put(s, "p1", "BS01-031", 4)
    put(s, "p2", "BS01-031", 4)
    s.turnPlayer = "p2" // 発生源の持ち主のターンではない

    resolveMagic(s, "p2", "BS02-093", "main")
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === own.instanceId) || own.cores === 0,
        `相手のターンでは対象から外れない（実際: ${String(own.cores)}個）`,
    )
}

console.log("=== BS02-087 封印された魔導書：スピリットの効果には働かない（『マジックの効果』限定） ===")
{
    const s = createGame("t120-book-3", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "blue" })
    runTurnStart(s)
    putNexus(s, "p1", "BS02-087", 0)
    s.turnPlayer = "p1"
    // 巨猫ブリンクス（スピリット）の『アタック時』：お互いドロー。マジックではないので対象は両陣営のまま
    assert(bothSidesPids(s, "spirit").length === 2, "スピリット発生源なら両陣営が対象のまま")
    assert(bothSidesPids(s, undefined).length === 2, "発生源種別が無いときも両陣営のまま")
}

console.log("=== BS02-087 封印された魔導書：外す側は効果の得失で決まる ===")
{
    const s = createGame("t120-book-4", { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    putNexus(s, "p1", "BS02-087", 0)
    s.turnPlayer = "p1"

    const bad = bothSidesPids(s, "magic")
    assert(bad.length === 1 && bad[0] === "p2", `不利益な効果は持ち主(p1)を外す（実際: ${bad.join(",")}）`)
    const good = bothSidesPids(s, "magic", true)
    assert(good.length === 1 && good[0] === "p1", `ドロー等の利得は相手(p2)を外す（実際: ${good.join(",")}）`)
}
