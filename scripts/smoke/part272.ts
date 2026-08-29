// smoke パート272（BS11 白15枚。2026-08-29）
//
// 新設・拡張した機構:
//   - immuneToOpponentEffects の against:"all" / "brave" と condition { ownNexusExactly }（027 / 055）
//     ⚠️ 従来 srcType が spirit/magic 以外なら**早期 return していた**ので、"all" を足すときに外した
//   - action:"markCantAttackThisTurn"（030＝相手の合体スピリット1体をこのターンアタック不可に）
//   - action:"returnOneAmong"（056）。destroyOneAmong の兄弟で**合体中のブレイヴも単独で選べる**
//   - activated.cost { selfCoresToTrash }（067 Lv2＝このネクサスのコア3個）
//   - returnToHand の oncePerTurn / thenRefreshOwnIfMaxCost（032）
//   - refreshAllOwn.exemptCombined（079）
//   - action:"lifeFloorOneThisTurn" ＋ turnConstraint "lifeFloorOneForPid"（080＝ライフは0にならない）
//   - globalConstraint "nonCombinedRefreshLimit" / "nexusesCantRefresh"、
//     constraint "opponentCombinedCantRefresh"（X04＝リフレッシュステップの制約）
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・効果文を機械検証してから使う。
import { act, assert, createGame, createInstance, effectiveBp, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, fireTrigger } from "../../server/src/logic/EffectModules"
import { hasFullEffectImmunity, instBaseCost, lifeDamageLimit, matchesBraveCondition } from "../../shared/rules"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "white", p2: "red" })
    runTurnStart(s)
    s.interactiveTargets = interactive
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.players.p1.field.spirits = []
    s.players.p2.field.spirits = []
    s.players.p1.field.nexuses = []
    s.players.p2.field.nexuses = []
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    const expect: [string, string, string][] = [
        ["BS11-025", "カルガモード", "spirit"],
        ["BS11-026", "サウザンニードル", "spirit"],
        ["BS11-027", "海戦機ニヨルド", "spirit"],
        ["BS11-028", "鳥人機フレスヴェルガー", "spirit"],
        ["BS11-030", "ドルフィング", "spirit"],
        ["BS11-031", "ワルキューレ・ミスト", "spirit"],
        ["BS11-032", "天王神獣スレイ・ウラノス", "spirit"],
        ["BS11-055", "ジャノメ・シールダー", "brave"],
        ["BS11-056", "極星剣機ポーラ・キャリバー", "brave"],
        ["BS11-067", "白き楯の長城", "nexus"],
        ["BS11-068", "清浄なる天の川", "nexus"],
        ["BS11-079", "リブートコード", "magic"],
        ["BS11-080", "デルタバリア", "magic"],
        ["BS11-X04", "宝瓶神機アクア・エリシオン", "spirit"],
    ]
    for (const [id, name, type] of expect) {
        assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    }
    assert(getCard("BS11-029").effect === "", "BS11-029 ストリームオッターは効果を持たない（バニラ）")
}

console.log("=== BS11-027：ネクサスが1つだけある間は、あらゆる効果を受けない（ネクサス・ブレイヴも含む） ===")
{
    const nexusCard = ALL_CARDS.find((c) => c.type === "nexus")!
    const s = base("027-immune", false)
    const inst = createInstance("BS11-027", s.turn, getCard("BS11-027").levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)

    // ネクサスが0つ：条件を満たさないので受ける
    assert(!hasFullEffectImmunity(s, "p1", inst, "spirit"), "ネクサスが0つなら効果を受ける")

    // ネクサスがちょうど1つ：スピリット/マジックだけでなくネクサス・ブレイヴの効果も受けない
    s.players.p1.field.nexuses.push(createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores))
    refreshLevelAsOverrides(s)
    assert(hasFullEffectImmunity(s, "p1", inst, "spirit"), "スピリットの効果を受けない")
    assert(hasFullEffectImmunity(s, "p1", inst, "magic"), "マジックの効果を受けない")
    assert(hasFullEffectImmunity(s, "p1", inst, "nexus"), "ネクサスの効果も受けない（against は all）")
    assert(hasFullEffectImmunity(s, "p1", inst, "brave"), "ブレイヴの効果も受けない（against は all）")

    // ネクサスが2つ：条件が外れる
    s.players.p1.field.nexuses.push(createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores))
    refreshLevelAsOverrides(s)
    assert(!hasFullEffectImmunity(s, "p1", inst, "spirit"), "ネクサスが2つになると効果を受ける（ちょうど1つの条件）")
}

console.log("=== BS11-031：相手のスピリット/マジックの効果は受けないが、ネクサスの効果は受ける ===")
{
    const s = base("031-immune", false)
    const inst = createInstance("BS11-031", s.turn, getCard("BS11-031").levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    refreshLevelAsOverrides(s)
    assert(hasFullEffectImmunity(s, "p1", inst, "spirit"), "スピリットの効果を受けない")
    assert(hasFullEffectImmunity(s, "p1", inst, "magic"), "マジックの効果を受けない")
    assert(!hasFullEffectImmunity(s, "p1", inst, "nexus"), "ネクサスの効果は受ける（against 省略時の既定）")
}

// 合体条件を持つブレイヴと、それを満たすホスト
const braveCard = ALL_CARDS.find((c) => {
    if (c.type !== "brave") return false
    const cond = c.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0 && c.levels.length > 0
})!
function findHost(): string {
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveCard.cardId)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const HOST = findHost()
function putCombined(s: GameState, pid: PlayerId): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const host = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores + getCard(braveCard.cardId).levels[0]!.cores)
    s.players[pid].field.spirits.push(host)
    const brave = createInstance(braveCard.cardId, s.turn, 0)
    attachBrave(s, pid, host, brave)
    refreshLevelAsOverrides(s)
    return { host, brave }
}

console.log("=== BS11-030：相手の合体スピリットだけをこのターンアタック不可にする ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const s = base("030-cantattack", false)
    const combo = putCombined(s, "p2")
    const lone = createInstance(plain.cardId, s.turn, plain.levels[0]!.cores)
    s.players.p2.field.spirits.push(lone)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-030", s.turn, getCard("BS11-030").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    resolveAction(s, "p1", src, { type: "markCantAttackThisTurn", combinedOnly: true })
    assert(combo.host.cantAttackThisTurn === true, "相手の合体スピリットはアタックできなくなる")
    assert(lone.cantAttackThisTurn !== true, "合体していないスピリットは対象外（combinedOnly）")
}

console.log("=== BS11-056：合体中のブレイヴを単独で手札に戻せる（ホストは残る） ===")
{
    const s = base("056-return", false)
    const combo = putCombined(s, "p2")
    const src = createInstance("BS11-056", s.turn, 0)
    s.players.p1.field.spirits.push(src)
    resolveAction(s, "p1", src, { type: "returnOneAmong", types: ["brave"], count: 1 })
    assert(!s.players.p2.field.combinedBraves.some((b) => b.instanceId === combo.brave.instanceId), "合体中のブレイヴが場から消える")
    assert(s.players.p2.hand.includes(braveCard.cardId), "持ち主の手札に戻る")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === combo.host.instanceId), "ホストは場に残る")
    assert(combo.host.braveRefs === undefined, "ホストの参照は外れる")
}

console.log("=== BS11-032：コスト4以下を戻したときだけ、系統一致の自分1体を回復させる ===")
{
    const cheap = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 4 && c.levels.length > 0)!
    const pricey = ALL_CARDS.find((c) => c.type === "spirit" && c.cost >= 5 && c.levels.length > 0)!
    const family = ALL_CARDS.find(
        (c) => c.type === "spirit" && (c.family.includes("光導") || c.family.includes("神星")) && c.levels.length > 0,
    )
    assert(family !== undefined, "テスト前提：系統「光導」/「神星」のスピリットがある")

    for (const [label, target, expectRefresh] of [
        ["コスト4以下", cheap, true],
        ["コスト5以上", pricey, false],
    ] as [string, typeof cheap, boolean][]) {
        const s = base(`032-${label}`, false)
        const src = createInstance("BS11-032", s.turn, getCard("BS11-032").levels[1]!.cores)
        s.players.p1.field.spirits.push(src)
        const ally = createInstance(family!.cardId, s.turn, family!.levels[0]!.cores)
        ally.isRested = true
        s.players.p1.field.spirits.push(ally)
        s.players.p2.field.spirits.push(createInstance(target.cardId, s.turn, target.levels[0]!.cores))
        refreshLevelAsOverrides(s)
        fireTrigger(s, "p1", src, "onAttack")
        assert(s.players.p2.field.spirits.length === 0, `${label}のスピリットは手札に戻る`)
        assert(ally.isRested === !expectRefresh, `${label}のとき、味方の回復は ${String(expectRefresh)}`)
    }
}

console.log("=== BS11-032：この効果はターンに1回しか使えない ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const s = base("032-once", false)
    const src = createInstance("BS11-032", s.turn, getCard("BS11-032").levels[1]!.cores)
    s.players.p1.field.spirits.push(src)
    s.players.p2.field.spirits.push(createInstance(plain.cardId, s.turn, plain.levels[0]!.cores))
    s.players.p2.field.spirits.push(createInstance(plain.cardId, s.turn, plain.levels[0]!.cores))
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onAttack")
    assert(s.players.p2.field.spirits.length === 1, "1回目は戻せる")
    fireTrigger(s, "p1", src, "onAttack")
    assert(s.players.p2.field.spirits.length === 1, "2回目は使えない（ターンに1回）")
}

console.log("=== BS11-080：ライフは0にならない（1で止まる） ===")
{
    const bigCost = ALL_CARDS.find((c) => c.type === "spirit" && c.cost >= 4 && c.levels.length > 0)!
    const smallCost = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 3 && c.levels.length > 0)!
    const s = base("080-lifefloor", false)
    const src = createInstance("BS11-080", s.turn, 0)
    resolveAction(s, "p1", src, { type: "lifeFloorOneThisTurn", attackMinCost: 4 })

    s.players.p1.life = 1
    const big = createInstance(bigCost.cardId, s.turn, bigCost.levels[0]!.cores)
    assert(instBaseCost(big) >= 4, "前提：コスト4以上のアタッカー")
    assert(lifeDamageLimit(s, "p1", big).max === 0, "ライフ1のときコスト4以上のアタックでは減らない（0にならない）")

    s.players.p1.life = 3
    assert(lifeDamageLimit(s, "p1", big).max === 2, "ライフ3なら2までしか減らない（1が残る）")

    const small = createInstance(smallCost.cardId, s.turn, smallCost.levels[0]!.cores)
    if (instBaseCost(small) < 4) {
        assert(lifeDamageLimit(s, "p1", small).max === Infinity, "コスト3以下のアタックには効かない（attackMinCost の境界）")
    }
}

console.log("=== BS11-X04：リフレッシュステップで、合体していないスピリットは1体しか回復しない／ネクサスは回復しない ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const nexusCard = ALL_CARDS.find((c) => c.type === "nexus")!
    const s = base("x04-refresh", false)
    s.players.p1.field.spirits.push(createInstance("BS11-X04", s.turn, getCard("BS11-X04").levels[0]!.cores))
    // 合体していないスピリット3体を疲労させる
    const lones = [0, 1, 2].map(() => {
        const i = createInstance(plain.cardId, s.turn, plain.levels[0]!.cores)
        i.isRested = true as boolean
        s.players.p1.field.spirits.push(i)
        return i
    })
    const nx = createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores)
    nx.isRested = true as boolean
    s.players.p1.field.nexuses.push(nx)
    // 合体スピリットは制限の対象外
    const combo = putCombined(s, "p1")
    combo.host.isRested = true as boolean
    refreshLevelAsOverrides(s)

    runTurnStart(s)
    assert(lones.filter((i) => !i.isRested).length === 1, "合体していないスピリットは1体しか回復しない")
    assert(nx.isRested === true, "ネクサスは回復しない")
    assert(combo.host.isRested === false, "合体スピリットは制限を受けず回復する")
}

console.log("=== BS11-X04 が無ければ、全部回復する（制限の効き目を裏から見る） ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const nexusCard = ALL_CARDS.find((c) => c.type === "nexus")!
    const s = base("x04-none", false)
    const lones = [0, 1, 2].map(() => {
        const i = createInstance(plain.cardId, s.turn, plain.levels[0]!.cores)
        i.isRested = true as boolean
        s.players.p1.field.spirits.push(i)
        return i
    })
    const nx = createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores)
    nx.isRested = true as boolean
    s.players.p1.field.nexuses.push(nx)
    refreshLevelAsOverrides(s)
    runTurnStart(s)
    assert(lones.every((i) => !i.isRested), "制限が無ければ全部回復する")
    assert(nx.isRested === false, "ネクサスも回復する")
}

console.log("=== BS11-079：回復させるが、合体スピリット以外はこのターンアタックできない ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const s = base("079-reboot", false)
    const lone = createInstance(plain.cardId, s.turn, plain.levels[0]!.cores)
    lone.isRested = true as boolean
    s.players.p1.field.spirits.push(lone)
    const combo = putCombined(s, "p1")
    combo.host.isRested = true as boolean
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-079", s.turn, 0)
    resolveAction(s, "p1", src, { type: "refreshAllOwn", exemptCombined: true })
    assert(lone.isRested === false && combo.host.isRested === false, "どちらも回復する")
    assert(lone.cantAttackThisTurn === true, "合体していないスピリットはアタックできない")
    assert(combo.host.cantAttackThisTurn !== true, "合体スピリットはアタックできる（exemptCombined）")
}

void act
void effectiveBp
