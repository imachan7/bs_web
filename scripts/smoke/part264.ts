// smoke パート264（BS10-X06天蠍神騎スコル・スピア。2026-08-29）
//
// 新設した機構:
//   - CardInstance.braveStatsAsContinuous（server/src/type.ts）：継続的な「スピリット状態のブレイヴの
//     コスト・系統・レベル表（BP）を◯として扱う」上書き。effectsDisabledContinuousは立てず、
//     そのブレイヴが元から持つ効果は残す（BRAVE.md §12.7）
//   - kind "braveStatsAs"（server/src/logic/EffectModules.ts refreshLevelAsOverrides）：
//     対象は field.spirits にいる card.type==="brave" の個体のみ（合体中は field.combinedBraves にいるため対象外）。
//     シンボルは既存の symbolsOverrideContinuous を流用（symbolFixと同じ「元のシンボル1色目でcount個に固定」）
//   - TargetFilter.maxCostAsSelf（server/src/type.ts・server/src/logic/actions/filter.ts）：
//     sameCostAsSelfの「以下」版。cost:{max: selfのコスト}へ解決する
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・コストを機械検証してから使う。
import { assert, createGame, createInstance, getCard, refreshLevelAsOverrides, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, fireTrigger } from "../../server/src/logic/EffectModules"
import { instBaseCost, instFamilies, instLevels, instanceSymbolCount } from "../../shared/rules"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = false
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const x06 = getCard("BS10-X06")
    assert(x06.name === "天蠍神騎スコル・スピア" && x06.type === "spirit" && x06.cost === 5, "BS10-X06は天蠍神騎スコル・スピア（スピリット・コスト5）")
    const brave = getCard("BS10-061")
    assert(
        brave.name === "剣鎧竜バスター・ドラゴン" && brave.type === "brave" && brave.cost === 3 && brave.family[0] === "機竜" && brave.symbol.length === 0 && brave.levels[0]!.bp === 2000,
        "BS10-061は剣鎧竜バスター・ドラゴン（ブレイヴ・コスト3/系統「機竜」/シンボル0個/Lv1 BP2000＝上書き後の値5/光導・異合/1個/7000とはすべて別）",
    )
    const cheap = getCard("BS01-001")
    assert(cheap.name === "ゴラドン" && cheap.type === "spirit" && cheap.cost === 0 && cheap.effects.length === 0, "BS01-001はゴラドン（コスト0・効果なし）")
    const expensive = getCard("BS02-023")
    assert(expensive.name === "双蛇ヒュドラム" && expensive.type === "spirit" && expensive.cost === 6 && expensive.effects.length === 0, "BS02-023は双蛇ヒュドラム（コスト6・効果なし）")
}

console.log("=== braveStatsAs：スピリット状態のブレイヴの能力値上書き（元の値とは異なる値で検査） ===")
{
    const s = base("bravestats-basic")
    const x06 = createInstance("BS10-X06", s.turn, 4) // Lv2（cores4）
    s.players.p1.field.spirits.push(x06)
    const brave = createInstance("BS10-061", s.turn, 1) // スピリット状態のブレイヴは常にLv1（cores1）
    s.players.p1.field.spirits.push(brave)
    refreshLevelAsOverrides(s)

    assert(instBaseCost(brave) === 5, "上書きでコストが5になる（元は3）")
    assert(JSON.stringify(instFamilies(brave)) === JSON.stringify(["光導", "異合"]), "上書きで系統が「光導」「異合」になる（元は「機竜」）")
    const lv = instLevels(brave)
    assert(lv.length === 1 && lv[0]!.level === 1 && lv[0]!.bp === 7000, "上書きでLv1 BPが7000になる（元は2000）")
    assert(instanceSymbolCount(brave) === 1, "上書きでシンボルが1個になる（元は0個）")
}

console.log("=== braveStatsAs：上書きされたブレイヴが元から持つ効果はそのまま発揮される ===")
{
    const s = base("bravestats-effect-persist")
    const x06 = createInstance("BS10-X06", s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(x06)
    const brave = createInstance("BS10-061", s.turn, 1)
    s.players.p1.field.spirits.push(brave)
    refreshLevelAsOverrides(s)
    assert(x06.tempBpBuff === 0, "前提：発火前はBP増加なし")

    // BS10-061自身の『召喚時』効果（bpBuffAll amount:2000。自分のスピリットすべて）を発火させる。
    // braveStatsAsContinuous が誤って effectsDisabledContinuous 相当を立てていれば、これは発火しない
    fireTrigger(s, "p1", brave, "onSummon")
    assert(x06.tempBpBuff === 2000, "上書きされていても、ブレイヴ自身の『召喚時』効果（BP+2000オールバフ）は発揮される")
}

console.log("=== braveStatsAs：合体中のブレイヴには及ばない ===")
{
    const s = base("bravestats-combined-excluded")
    const x06 = createInstance("BS10-X06", s.turn, 4) // Lv2
    s.players.p1.field.spirits.push(x06)
    const hostCard = ALL_CARDS.find((c) => c.type === "spirit" && c.cardId !== "BS10-X06")!
    const host = createInstance(hostCard.cardId, s.turn, hostCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance("BS10-061", s.turn, 0) // 合体中はコア0（BRAVE.md §2.4）
    attachBrave(s, "p1", host, brave) // 内部でrefreshLevelAsOverridesも呼ばれる
    refreshLevelAsOverrides(s)

    assert(
        s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId),
        "前提：ブレイヴは合体してfield.combinedBravesにいる",
    )
    assert(brave.braveStatsAsContinuous === undefined, "合体中のブレイヴには braveStatsAsContinuous が付かない")
    assert(JSON.stringify(instFamilies(brave)) === JSON.stringify(["機竜"]), "合体中のブレイヴの系統は上書きされない（元の「機竜」のまま）")
}

console.log("=== effectGrant：『このスピリットのアタック時』コスト以下・合体していない相手を破壊する（Lv2以上） ===")
{
    const s = base("granted-attack")
    const x06 = createInstance("BS10-X06", s.turn, 4) // Lv2（effectGrantはLv2･Lv3で有効）
    s.players.p1.field.spirits.push(x06)
    refreshLevelAsOverrides(s)

    // 相手フィールド: ①コスト以下・合体していない（破壊される想定） ②コストが自分より大きい（破壊されない想定）
    // ③コスト以下だが合体中のホスト（破壊されない想定）
    const validTarget = createInstance("BS01-001", s.turn, getCard("BS01-001").levels[0]!.cores) // コスト0
    const tooExpensive = createInstance("BS02-023", s.turn, getCard("BS02-023").levels[0]!.cores) // コスト6 > X06のコスト5
    const combinedHostCard = ALL_CARDS.find((c) => c.type === "spirit" && c.cardId !== "BS10-X06" && c.cardId !== "BS01-001" && c.cardId !== "BS02-023")!
    const combinedHost = createInstance(combinedHostCard.cardId, s.turn, combinedHostCard.levels[0]!.cores)
    s.players.p2.field.spirits.push(validTarget, tooExpensive, combinedHost)
    const combinedBrave = createInstance("BS10-061", s.turn, 0)
    attachBrave(s, "p2", combinedHost, combinedBrave)
    refreshLevelAsOverrides(s)

    fireTrigger(s, "p1", x06, "onAttack")

    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === validTarget.instanceId), "コスト以下・合体していない相手は破壊される")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === tooExpensive.instanceId), "コストが自分より大きい相手は破壊されない（maxCostAsSelfが効いている）")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === combinedHost.instanceId), "合体しているスピリットは破壊されない（combined:falseが効いている）")
}
