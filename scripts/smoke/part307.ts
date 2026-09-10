// smoke パート307（BS13 青バッチ残り9枚。docs/design/BS13_PLAN.md §12）
// 新しく足した器 BJ（ネクサスをアタックステップの間だけスピリットとして扱う）・
// BL（アタックステップの強制終了・コスト条件つき）・BQ（ネクサスの「種類数」を数える）・
// BR（召喚時効果の借用）を1つずつ固定する。
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    endTurn,
    getCard,
    instHasCost,
    minLevelCores,
    refreshLevelAsOverrides,
    resolveAction,
    runTurnStart,
} from "./helpers"
import type { GameState } from "./helpers"
import { toAttackPhase } from "../../server/src/logic/PhaseManager"
import { fireTrigger, fireFieldEventTriggers } from "../../server/src/logic/EffectModules"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "blue", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS13-045").name === "巨人船長イアソン" && getCard("BS13-045").type === "spirit", "BS13-045は巨人船長イアソン")
    assert(getCard("BS13-048").name === "古代戦艦アルゴ・ゴレム", "BS13-048は古代戦艦アルゴ・ゴレム")
    assert(getCard("BS13-059").name === "フォビッド・バルチャー" && getCard("BS13-059").type === "brave", "BS13-059はフォビッド・バルチャー")
    assert(getCard("BS13-060").name === "トレス・ベルーガ" && getCard("BS13-060").type === "brave", "BS13-060はトレス・ベルーガ")
    assert(getCard("BS13-072").name === "未完成の古代戦艦：羅針盤" && getCard("BS13-072").type === "nexus", "BS13-072は未完成の古代戦艦：羅針盤")
    assert(getCard("BS13-083").name === "ギャラクシーエターナルレクイエム" && getCard("BS13-083").type === "magic", "BS13-083はギャラクシーエターナルレクイエム")
    assert(getCard("BS13-084").name === "アルゴアタック" && getCard("BS13-084").type === "magic", "BS13-084はアルゴアタック")
    assert(getCard("BS13-X06").name === "巨人勇者ペルセウス", "BS13-X06は巨人勇者ペルセウス")
    assert(getCard("X005S").name === "北斗七星龍ジーク・アポロドラゴン" && getCard("X005S").colors.includes("blue"), "X005Sは北斗七星龍ジーク・アポロドラゴン（青）")
    assert(JSON.stringify(getCard("X005S").effects) !== JSON.stringify(getCard("X005A").effects), "X005SとX005AはID接頭辞が別（内容は同型）")
}

console.log("=== BS13-045：召喚時、自分のネクサス1つを破壊することで相手のネクサス1つを破壊する（COST_MODEL §1） ===")
{
    const s = game("045-cost-ok")
    const iason = createInstance("BS13-045", s.turn, 1)
    s.players.p1.field.spirits.push(iason)
    const ownNex = createInstance("BS10-094", s.turn, minLevelCores(getCard("BS10-094")))
    const oppNex = createInstance("BS11-072", s.turn, minLevelCores(getCard("BS11-072")))
    s.players.p1.field.nexuses.push(ownNex)
    s.players.p2.field.nexuses.push(oppNex)
    resolveAction(s, "p1", iason, { type: "destroyNexus", count: 1, costDestroyOwnNexus: true })
    assert(s.players.p1.field.nexuses.length === 0, "自分のネクサスが破壊された（コスト）")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスが破壊された")
}
{
    const s = game("045-cost-nopay")
    const iason = createInstance("BS13-045", s.turn, 1)
    s.players.p1.field.spirits.push(iason)
    const oppNex = createInstance("BS11-072", s.turn, minLevelCores(getCard("BS11-072")))
    s.players.p2.field.nexuses.push(oppNex)
    resolveAction(s, "p1", iason, { type: "destroyNexus", count: 1, costDestroyOwnNexus: true })
    assert(s.players.p2.field.nexuses.length === 1, "自分のネクサスが無いため発揮できなかった（COST_MODEL §1）")
}

console.log("=== BS13-045 Lv2：「闘神」を持つ自分のスピリットがバトルしたとき、「古代戦艦」ネクサス1つにつき相手のデッキを2枚破棄（上限8） ===")
{
    const s = game("045-mill")
    s.phase = "attack"
    const iason = createInstance("BS13-045", s.turn, 4) // Lv2（BS13-045のLv2は維持コア4個）
    s.players.p1.field.spirits.push(iason)
    const nex1 = createInstance("BS10-094", s.turn, minLevelCores(getCard("BS10-094")))
    const nex2 = createInstance("BS11-072", s.turn, minLevelCores(getCard("BS11-072")))
    s.players.p1.field.nexuses.push(nex1, nex2)
    refreshLevelAsOverrides(s)
    const attacker = createInstance("BS13-X06", s.turn, minLevelCores(getCard("BS13-X06"))) // 系統「闘神」
    s.players.p1.field.spirits.push(attacker)
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p1", inst: attacker }, [], undefined, undefined, {})
    assert(s.players.p2.trashCards.length === 4, "ネクサス2つ×2枚＝4枚破棄された")
}

console.log("=== 器BQ：BS13-048「古代戦艦」ネクサスが4種類あるときだけ召喚時効果が発揮される ===")
{
    const s = game("bq-048-fail")
    const argo = createInstance("BS13-048", s.turn, 1)
    s.players.p1.field.spirits.push(argo)
    s.players.p1.field.nexuses.push(
        createInstance("BS10-094", s.turn, minLevelCores(getCard("BS10-094"))),
        createInstance("BS11-072", s.turn, minLevelCores(getCard("BS11-072"))),
        createInstance("BS12-071", s.turn, minLevelCores(getCard("BS12-071"))),
    )
    const oppSp = createInstance("BS02-039", s.turn, 1)
    s.players.p2.field.spirits.push(oppSp)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", argo, "onSummon")
    assert(s.players.p2.field.spirits.length === 1, "3種類では条件を満たさず相手は無事")
}
{
    const s = game("bq-048-ok")
    const argo = createInstance("BS13-048", s.turn, 1)
    s.players.p1.field.spirits.push(argo)
    s.players.p1.field.nexuses.push(
        createInstance("BS10-094", s.turn, minLevelCores(getCard("BS10-094"))),
        createInstance("BS11-072", s.turn, minLevelCores(getCard("BS11-072"))),
        createInstance("BS12-071", s.turn, minLevelCores(getCard("BS12-071"))),
        createInstance("BS13-072", s.turn, minLevelCores(getCard("BS13-072"))),
    )
    const oppSp = createInstance("BS02-039", s.turn, 1)
    const oppNex = createInstance("BS10-094", s.turn, minLevelCores(getCard("BS10-094")))
    s.players.p2.field.spirits.push(oppSp)
    s.players.p2.field.nexuses.push(oppNex)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", argo, "onSummon")
    assert(s.players.p2.field.spirits.length === 0, "4種類そろい、相手のスピリットがすべて破壊された")
    assert(s.players.p2.field.nexuses.length === 0, "相手のネクサスもすべて破壊された")
}

console.log("=== 器BJ：BS13-048Lv2「古代戦艦」ネクサスをアタックステップの間だけスピリットとして扱う ===")
{
    const s = game("bj-048")
    const argo = createInstance("BS13-048", s.turn, 5) // Lv2
    s.players.p1.field.spirits.push(argo)
    const nex = createInstance("BS10-094", s.turn, 1) // コア1個・「古代戦艦」を含む
    const unrelated = createInstance("BS13-069", s.turn, 0) // 「古代戦艦」を含まないネクサス
    s.players.p1.field.nexuses.push(nex, unrelated)
    refreshLevelAsOverrides(s)
    s.phase = "main"
    toAttackPhase(s)
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === nex.instanceId), "アタックステップ開始でネクサスがスピリット化した")
    assert(!s.players.p1.field.nexuses.some((n) => n.instanceId === nex.instanceId), "ネクサス欄からは居なくなった")
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === unrelated.instanceId), "「古代戦艦」を含まないネクサスは変換されない")
    const asSpirit = s.players.p1.field.spirits.find((sp) => sp.instanceId === nex.instanceId)!
    assert(instHasCost(asSpirit, 6), "コスト6のスピリットとして扱われる")
    assert(currentLevel(asSpirit).level === 1 && !asSpirit.isRested, "Lv1・回復状態でアタックできる状態")
    assert(act(s, "p1", { type: "attack", instanceId: asSpirit.instanceId }) === null, "スピリット化したネクサスはアタックできる")
    s.phase = "attack" // ライフ処理で自動的にエンドステップへ流れることがあるため明示的に固定する
    endTurn(s)
    assert(s.players.p1.field.nexuses.some((n) => n.instanceId === nex.instanceId), "アタックステップ終了でネクサスに戻った")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === nex.instanceId), "スピリット欄からは居なくなった")
}

console.log("=== 器BL：BS13-059【合体時】コスト4以下のアタックでアタックステップ終了フラグが立つ（主語なし＝両陣営） ===")
{
    const s = game("bl-059")
    s.phase = "attack"
    const host = createInstance("BS13-034", s.turn, 1)
    const brave = createInstance("BS13-059", s.turn, 0)
    brave.braveCombined = true
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(brave)
    refreshLevelAsOverrides(s)
    const attacker = createInstance("BS02-039", s.turn, 1) // コスト2（4以下）。相手側のアタックでも発火することを見る
    s.players.p2.field.spirits.push(attacker)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: attacker }, [], undefined, undefined, { costs: [2] })
    assert(s.endAttackStepAfterBattle === true, "コスト4以下のアタックでフラグが立つ")
}
{
    const s = game("bl-059-highcost")
    s.phase = "attack"
    const host = createInstance("BS13-034", s.turn, 1)
    const brave = createInstance("BS13-059", s.turn, 0)
    brave.braveCombined = true
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(brave)
    refreshLevelAsOverrides(s)
    const attacker = createInstance("BS13-048", s.turn, 1) // コスト10（4超）
    s.players.p2.field.spirits.push(attacker)
    s.battle = { attackerInstanceId: attacker.instanceId, blockerInstanceId: null, flashLockedPlayer: null, directed: false }
    fireFieldEventTriggers(s, "p1", "anySpiritAttacked", { pid: "p2", inst: attacker }, [], undefined, undefined, { costs: [10] })
    assert(s.endAttackStepAfterBattle !== true, "コスト4超のアタックではフラグが立たない")
}

console.log("=== 器BR：BS13-084アルゴアタック（トラッシュの「古代戦艦」配置→条件成立時のみアルゴ・ゴレムの召喚時効果を借用） ===")
{
    const s = game("br-084")
    const argo = createInstance("BS13-048", s.turn, 1)
    s.players.p1.field.spirits.push(argo)
    s.players.p1.trashCards.push("BS10-094", "BS11-072", "BS12-071")
    const oppSp = createInstance("BS02-039", s.turn, 1)
    s.players.p2.field.spirits.push(oppSp)
    resolveAction(s, "p1", null, { type: "deployNexus", from: "trash", nameContains: "古代戦艦", all: true }, undefined, undefined, "magic", undefined, undefined, "BS13-084")
    assert(s.players.p1.field.nexuses.length === 3, "トラッシュの「古代戦艦」ネクサス3枚が配置された")
    resolveAction(s, "p1", null, { type: "borrowSummonEffect", nameIncludes: "古代戦艦アルゴ・ゴレム" }, undefined, undefined, "magic", undefined, undefined, "BS13-084")
    assert(s.players.p2.field.spirits.length === 1, "ネクサスが3種類のため召喚時効果は発揮されなかった")
    s.players.p1.field.nexuses.push(createInstance("BS13-072", s.turn, minLevelCores(getCard("BS13-072"))))
    resolveAction(s, "p1", null, { type: "borrowSummonEffect", nameIncludes: "古代戦艦アルゴ・ゴレム" }, undefined, undefined, "magic", undefined, undefined, "BS13-084")
    assert(s.players.p2.field.spirits.length === 0, "4種類そろい、借用した召喚時効果で相手のスピリットが破壊された")
}
{
    const s = game("br-084-none")
    resolveAction(s, "p1", null, { type: "borrowSummonEffect", nameIncludes: "古代戦艦アルゴ・ゴレム" }, undefined, undefined, "magic", undefined, undefined, "BS13-084")
    assert(true, "候補が無くても例外を投げない")
}

console.log("=== BS13-060トレス・ベルーガ【合体時】：デッキ上6枚破棄でBP+6000、光導が混ざれば回復 ===")
{
    const s = game("060-bpbuff")
    const host = createInstance("BS13-034", s.turn, 1)
    host.isRested = true
    const brave = createInstance("BS13-060", s.turn, 0)
    brave.braveCombined = true
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(brave)
    refreshLevelAsOverrides(s)
    s.players.p1.deck.unshift("BS13-X01", "BS02-039", "BS02-039", "BS02-039", "BS02-039", "BS02-039") // 光導1枚＋他5枚
    const trashBefore = s.players.p1.trashCards.length
    resolveAction(s, "p1", host, { type: "bpBuff", amount: 6000, costMillSelfCount: 6, thenRefreshIfMilledFamily: "光導" })
    assert(s.players.p1.trashCards.length === trashBefore + 6, "デッキ上6枚が破棄された")
    assert(host.tempBpBuff === 6000, "BP+6000（ターン終了時まで）")
    assert(!host.isRested, "光導スピリットが混ざっていたので回復した")
}
{
    const s = game("060-norefresh")
    const host = createInstance("BS13-034", s.turn, 1)
    host.isRested = true
    const brave = createInstance("BS13-060", s.turn, 0)
    brave.braveCombined = true
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(brave)
    refreshLevelAsOverrides(s)
    s.players.p1.deck.unshift("BS02-039", "BS02-039", "BS02-039", "BS02-039", "BS02-039", "BS02-039") // 光導なし
    resolveAction(s, "p1", host, { type: "bpBuff", amount: 6000, costMillSelfCount: 6, thenRefreshIfMilledFamily: "光導" })
    assert(host.tempBpBuff === 6000, "BP+6000は付く")
    assert(host.isRested, "光導が混ざっていないので回復しない")
}

console.log("=== BS13-072：Lv1-2 相手はトラッシュから手札に戻せない／Lv2「古代戦艦」ネクサスをLv2として扱う ===")
{
    const s = game("072-basic")
    const nex = createInstance("BS13-072", s.turn, 2) // Lv2
    const other = createInstance("BS10-094", s.turn, 1) // 「古代戦艦」を含む・Lv1のまま置く
    const unrelated = createInstance("BS13-069", s.turn, 0) // 「古代戦艦」を含まない
    s.players.p1.field.nexuses.push(nex, other, unrelated)
    refreshLevelAsOverrides(s)
    assert(currentLevel(other).level === 2, "「古代戦艦」ネクサスはLv2として扱われる")
    assert(currentLevel(unrelated).level === 1, "「古代戦艦」を含まないネクサスは対象外")
    s.players.p2.trashCards.push("BS02-039")
    resolveAction(s, "p2", null, { type: "recoverSpiritFromTrash", count: 1 })
    assert(s.players.p2.trashCards.includes("BS02-039"), "相手はトラッシュから手札に戻せない（器BO）")
}

console.log("=== BS13-083：フラッシュ。このターンの間、自分のスピリットすべてをそのスピリットの最高Lvとして扱う ===")
{
    const s = game("083-maxlv")
    const sp = createInstance("BS13-045", s.turn, 1) // Lv1のコア数で配置（最高Lvは2）
    s.players.p1.field.spirits.push(sp)
    refreshLevelAsOverrides(s)
    assert(currentLevel(sp).level === 1, "配置直後はLv1")
    resolveAction(s, "p1", null, { type: "lendSelfThisTurn" }, undefined, undefined, "magic", undefined, undefined, "BS13-083")
    refreshLevelAsOverrides(s)
    assert(currentLevel(sp).level === 2, "貸与後は最高Lv(2)として扱われる")
}

console.log("=== BS13-X06巨人勇者ペルセウス：自分のネクサス1つにつき、相手のブレイヴ（スピリット状態／合体中）を破壊 ===")
{
    const s = game("x06-onsummon")
    const perseus = createInstance("BS13-X06", s.turn, 1)
    s.players.p1.field.spirits.push(perseus)
    s.players.p1.field.nexuses.push(createInstance("BS10-094", s.turn, 1), createInstance("BS11-072", s.turn, 1))
    const spiritStateBrave = createInstance("BS13-057", s.turn, minLevelCores(getCard("BS13-057"))) // スピリット状態のブレイヴ
    s.players.p2.field.spirits.push(spiritStateBrave)
    const combHost = createInstance("BS13-038", s.turn, 1)
    const combBrave = createInstance("BS13-058", s.turn, 0)
    combBrave.braveCombined = true
    combHost.braveRefs = [{ slot: "single", instanceId: combBrave.instanceId }]
    s.players.p2.field.spirits.push(combHost)
    s.players.p2.field.combinedBraves.push(combBrave)
    refreshLevelAsOverrides(s)
    s.interactiveTargets = false // 候補2つ（スピリット状態／合体中）を自動選択で両方処理させる
    fireTrigger(s, "p1", perseus, "onSummon")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === spiritStateBrave.instanceId), "スピリット状態のブレイヴが破壊された")
    assert(s.players.p2.field.combinedBraves.length === 0, "合体中のブレイヴも破壊された")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === combHost.instanceId), "ホストは無傷で残る（ブレイヴだけが破壊される）")
}

console.log("=== BS13-X06：アタック時コスト4以下を破壊／【合体時】Lv2【強襲：3】 ===")
{
    const s = game("x06-attack")
    const perseus = createInstance("BS13-X06", s.turn, 1)
    s.players.p1.field.spirits.push(perseus)
    const weak = createInstance("BS02-039", s.turn, 1) // コスト2
    s.players.p2.field.spirits.push(weak)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", perseus, "onAttack")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === weak.instanceId), "コスト4以下の相手が破壊された")

    const card = getCard("BS13-X06")
    const kyoshu = card.effects.find((e) => e.kind === "keyword" && e.keyword === "kyoshu")
    assert(kyoshu !== undefined && kyoshu.kind === "keyword" && kyoshu.count === 3 && kyoshu.whileCombined === true && JSON.stringify(kyoshu.levels) === JSON.stringify([2]), "【合体時】Lv2【強襲：3】が正しく宣言されている")
    const kyoshuTrigger = card.effects.find((e) => e.kind === "triggered" && e.trigger === "onAttack" && e.whileCombined === true)
    assert(kyoshuTrigger !== undefined, "強襲の相方（refreshSelfByExhaustNexus）が対になっている")
}

console.log("すべてのチェックに合格しました 🎉（part307）")
