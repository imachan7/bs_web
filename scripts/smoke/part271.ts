// smoke パート271（BS11 緑15枚。2026-08-29）
//
// 新設・拡張した機構:
//   - kind:"selfCostMod" ＋ CardInstance.costDeltaContinuous（017）：**継続の自己コスト増減**。
//     refreshLevelAsOverrides が毎回組み直し、instCostDelta が読む（条件が外れた瞬間に消える）
//   - reductionGrant を cardType 省略で使う（018＝スピリットカードとブレイヴカードの両方）
//   - voidCoreToOther.familyFilter（019）
//   - summonFromHandFree.combineToSelf（020＝「このスピリットに直接合体するように召喚」）
//   - fieldEvent.sokuSummonOnly ＋ 召喚経路の bySoku（065 Lv2）
//   - globalConstraint "noDrawAndNoHandDiscard"（065 Lv1）。ドローは draw() が単一の入口で止め、
//     手札破棄は**入口が30箇所以上に散っている**ため resolveAction（アクションの唯一の合流点）で止める
//   - ⚠️ あわせて hasGlobalConstraint が phase / turn を見るようにした（型にはあったが未判定だった）
//   - reviveOnDestroy.cost.sourceCoresToTrash（066 Lv2＝「このネクサス上のコア3個」）
//   - reviveLastDestroyedNexus.colorFilter（066 Lv1＝「自分の**緑の**ネクサス」）
//   - returnToHand.ownSide（077＝「自分のスピリット1体を手札に戻す」）
//   - action:"combineOwnBrave" ＋ ブロック宣言後のフラッシュ禁止（078）
//   - action:"refreshWhenBlockedByChosenColorThisTurn"（054）
//   - costMod mode:"set" の condition { ownLifeAtMost }（X03）
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・効果文を機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, fireFieldEventTriggers, fireTrigger, resolveAction as engineResolveAction } from "../../server/src/logic/EffectModules"
import { instBaseCost, matchesBraveCondition } from "../../shared/rules"
import { effectiveCost } from "../../shared/cost"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
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
        ["BS11-017", "ムシャツバメ", "spirit"],
        ["BS11-018", "ヤクヤナギ", "spirit"],
        ["BS11-019", "ダンデラビット", "spirit"],
        ["BS11-020", "陰陽ヤマセミ", "spirit"],
        ["BS11-023", "トーテムオウル", "spirit"],
        ["BS11-024", "武神鳥バーディ・ケンシン", "spirit"],
        ["BS11-053", "カーミュラ1", "brave"],
        ["BS11-054", "武槍鳥スピニード・ハヤト", "brave"],
        ["BS11-065", "満天の牧草地", "nexus"],
        ["BS11-066", "発見されし世界樹", "nexus"],
        ["BS11-077", "スタークレイドル", "magic"],
        ["BS11-078", "ブレイヴフラッシュ", "magic"],
        ["BS11-X03", "星騎士ハーキュリーΩ", "spirit"],
    ]
    for (const [id, name, type] of expect) {
        assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    }
    assert(getCard("BS11-022").effect === "", "BS11-022 ウルビーは効果を持たない（バニラ）")
}

console.log("=== BS11-017：Lv2以上の自分のアタックステップだけコスト+3される（継続。条件が外れると戻る） ===")
{
    const s = base("017-costmod", false)
    const inst = createInstance("BS11-017", s.turn, getCard("BS11-017").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(inst)
    const baseCost = getCard("BS11-017").cost

    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(instBaseCost(inst) === baseCost, "メインステップでは元のコストのまま")

    s.phase = "attack"
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(instBaseCost(inst) === baseCost + 3, "自分のアタックステップではコスト+3")

    s.turnPlayer = "p2"
    refreshLevelAsOverrides(s)
    assert(instBaseCost(inst) === baseCost, "相手のターンでは元に戻る（継続効果なので条件が外れた瞬間に消える）")

    // Lv1では効かない
    const lv1 = createInstance("BS11-017", s.turn, getCard("BS11-017").levels[0]!.cores)
    s.players.p1.field.spirits.push(lv1)
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(instBaseCost(lv1) === baseCost, "Lv1では効かない（levels の絞り込み）")
}

console.log("=== BS11-018：手札の【神速】持ちに軽減シンボル2つ（自分のアタックステップ限定） ===")
{
    const sokuCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "soku") && c.cost >= 3,
    )
    assert(sokuCard !== undefined, "テスト前提：【神速】を持つコスト3以上のスピリットがある")
    const s = base("018-reduction", false)
    s.players.p1.field.spirits.push(createInstance("BS11-018", s.turn, getCard("BS11-018").levels[0]!.cores))
    // 軽減はフィールドの同色シンボル数で頭打ちになるので、緑シンボルを十分に並べる
    const greenSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.symbol.length === 1 && c.symbol[0] === "green")!
    for (let i = 0; i < 6; i++) {
        s.players.p1.field.spirits.push(createInstance(greenSpirit.cardId, s.turn, greenSpirit.levels[0]!.cores))
    }
    s.phase = "main"
    refreshLevelAsOverrides(s)
    const inMain = effectiveCost(s, "p1", sokuCard!)
    s.phase = "attack"
    refreshLevelAsOverrides(s)
    const inAttack = effectiveCost(s, "p1", sokuCard!)
    assert(inAttack < inMain, "アタックステップでは軽減が乗って安くなる")
    assert(inMain - inAttack === 2, "軽減シンボル2つぶん安くなる")
}

console.log("=== BS11-023：相手がドローするとこのスピリットは回復する ===")
{
    const s = base("023-refresh", false)
    const owl = createInstance("BS11-023", s.turn, getCard("BS11-023").levels[0]!.cores)
    owl.isRested = true as boolean
    s.players.p1.field.spirits.push(owl)
    refreshLevelAsOverrides(s)
    fireFieldEventTriggers(s, "p1", "opponentDrew")
    assert(owl.isRested === false, "相手のドローで回復する")
}

console.log("=== BS11-024 Lv2：【神速】を持つ自分のスピリット2体だけを回復させる ===")
{
    const sokuCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "soku"),
    )!
    const plain = ALL_CARDS.find(
        (c) => c.type === "spirit" && !c.effects.some((e) => e.kind === "keyword" && e.keyword === "soku") && c.levels.length > 0,
    )!
    const s = base("024-refresh", false)
    const src = createInstance("BS11-024", s.turn, getCard("BS11-024").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(src)
    const sokus = [0, 1, 2].map(() => {
        const i = createInstance(sokuCard.cardId, s.turn, sokuCard.levels[0]!.cores)
        i.isRested = true
        s.players.p1.field.spirits.push(i)
        return i
    })
    const other = createInstance(plain.cardId, s.turn, plain.levels[0]!.cores)
    other.isRested = true
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)

    fireTrigger(s, "p1", src, "onAttack")
    assert(sokus.filter((i) => !i.isRested).length === 2, "【神速】持ちは2体だけ回復する（countの上限）")
    assert(other.isRested === true, "【神速】を持たないスピリットは回復しない")
}

console.log("=== BS11-065 Lv1：お互いのメインステップはドローも手札破棄もできない ===")
{
    const s = base("065-nodraw", false)
    s.players.p1.field.nexuses.push(createInstance("BS11-065", s.turn, getCard("BS11-065").levels[0]!.cores))
    refreshLevelAsOverrides(s)
    s.phase = "main"
    const handBefore = s.players.p1.hand.length
    const oppHandBefore = s.players.p2.hand.length
    const src = createInstance("BS11-065", s.turn, 0)
    engineResolveAction(s, "p1", src, { type: "draw", count: 2 })
    assert(s.players.p1.hand.length === handBefore, "メインステップではドローできない")
    engineResolveAction(s, "p1", src, { type: "discardOpponent", count: 1 })
    assert(s.players.p2.hand.length === oppHandBefore, "メインステップでは手札を破棄させられない")

    // アタックステップなら通る（phase の絞り込みが効いている）
    s.phase = "attack"
    engineResolveAction(s, "p1", src, { type: "draw", count: 1 })
    assert(s.players.p1.hand.length === handBefore + 1, "アタックステップならドローできる")
}

console.log("=== BS11-066 Lv2：コア3個を払って、破壊された自分のスピリットを疲労状態で戻す ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    // ⚠️ このカードは Lv2 の維持コアが3個で、コストも3個。つまり「Lv2 なのに払えない」状態は作れない。
    //    ここで見るのは「Lv1（＝コア不足）ではそもそも Lv2 の効果が働かない」こと
    const s1 = base("066-nocost", false)
    const nx1 = createInstance("BS11-066", s1.turn, 2) // Lv2 には足りない＝Lv1
    s1.players.p1.field.nexuses.push(nx1)
    const victim1 = createInstance(plain.cardId, s1.turn, plain.levels[0]!.cores)
    s1.players.p1.field.spirits.push(victim1)
    refreshLevelAsOverrides(s1)
    engineResolveAction(s1, "p2", null, { type: "destroy", count: 1 })
    assert(!s1.players.p1.field.spirits.some((sp) => sp.instanceId === victim1.instanceId), "Lv1では戻らない")
    assert(nx1.cores === 2, "働かないのでコアも払われない")

    // コアが足りる：疲労状態で戻る
    const s2 = base("066-revive", false)
    const nx2 = createInstance("BS11-066", s2.turn, 5)
    s2.players.p1.field.nexuses.push(nx2)
    const victim2 = createInstance(plain.cardId, s2.turn, plain.levels[0]!.cores)
    s2.players.p1.field.spirits.push(victim2)
    refreshLevelAsOverrides(s2)
    const coresBefore = nx2.cores
    engineResolveAction(s2, "p2", null, { type: "destroy", count: 1 })
    assert(s2.players.p1.field.spirits.some((sp) => sp.instanceId === victim2.instanceId), "コアを払ってフィールドに残る")
    assert(victim2.isRested === true, "疲労状態で戻る")
    assert(nx2.cores === coresBefore - 3, "ネクサス上のコアがちょうど3個減る（コストが実際に払われる）")
    assert(s2.players.p1.trashCores >= 3, "払ったコアはトラッシュへ")

    // コア3個ちょうど（境界）：払えて、払った結果0個になる
    const s3 = base("066-exact", false)
    const nx3 = createInstance("BS11-066", s3.turn, 3)
    s3.players.p1.field.nexuses.push(nx3)
    const victim3 = createInstance(plain.cardId, s3.turn, plain.levels[0]!.cores)
    s3.players.p1.field.spirits.push(victim3)
    refreshLevelAsOverrides(s3)
    engineResolveAction(s3, "p2", null, { type: "destroy", count: 1 })
    assert(s3.players.p1.field.spirits.some((sp) => sp.instanceId === victim3.instanceId), "コア3個ちょうどでも払えて戻る")
    assert(nx3.cores === 0, "払った結果コアは0個になる")
}

console.log("=== BS11-077：自分の【神速】持ちだけを手札に戻す（相手は対象外） ===")
{
    const sokuCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "soku"),
    )!
    const s = base("077-bounce", false)
    const mine = createInstance(sokuCard.cardId, s.turn, sokuCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(mine)
    const theirs = createInstance(sokuCard.cardId, s.turn, sokuCard.levels[0]!.cores)
    s.players.p2.field.spirits.push(theirs)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-077", s.turn, 0)
    resolveAction(s, "p1", src, { type: "returnToHand", count: 1, ownSide: true, filter: { keyword: "soku" } })
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === mine.instanceId), "自分の【神速】持ちが手札に戻る")
    assert(s.players.p1.hand.includes(sokuCard.cardId), "手札に加わる")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === theirs.instanceId), "相手のスピリットは戻らない（ownSide）")
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

console.log("=== BS11-078：スピリット状態のブレイヴを自分のスピリットに合体させる ===")
{
    const s = base("078-combine", false)
    const host = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(host)
    const brave = createInstance(braveCard.cardId, s.turn, braveCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(brave)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-078", s.turn, 0)
    resolveAction(s, "p1", src, { type: "combineOwnBrave", flashAfterBlockForbidden: true })
    assert((host.braveRefs ?? []).some((r) => r.instanceId === brave.instanceId), "ブレイヴがホストに合体する")
    assert(s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "combinedBraves へ移る")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "field.spirits からは抜ける")
}

console.log("=== BS11-078：合体先が無ければ不発（合体条件を満たすスピリットがいない） ===")
{
    const s = base("078-nohost", false)
    const brave = createInstance(braveCard.cardId, s.turn, braveCard.levels[0]!.cores)
    s.players.p1.field.spirits.push(brave)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-078", s.turn, 0)
    resolveAction(s, "p1", src, { type: "combineOwnBrave", flashAfterBlockForbidden: true })
    assert(s.players.p1.field.combinedBraves.length === 0, "合体は起きない")
    assert(s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId), "ブレイヴはそのまま残る")
}

console.log("=== BS11-054：指定した色のスピリットにブロックされたとき回復する ===")
{
    const redSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "red")!
    const blueSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.length === 1 && c.colors[0] === "blue")
    assert(blueSpirit !== undefined, "テスト前提：青の単色スピリットがある")
    const s = base("054-refresh-on-block", false)
    const attacker = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(attacker)
    // 相手のフィールドは赤だけ → 非対話の自動指定は赤に倒れる
    s.players.p2.field.spirits.push(createInstance(redSpirit.cardId, s.turn, redSpirit.levels[0]!.cores))
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", attacker, { type: "refreshWhenBlockedByChosenColorThisTurn" })
    assert(attacker.refreshWhenBlockedByColorThisTurn === "red", "相手に最も多い色（赤）が指定される")
}

console.log("=== BS11-X03：ライフが3以下のときだけ手札のコストが4になる ===")
{
    const s = base("x03-cost", false)
    const card = getCard("BS11-X03")
    s.players.p1.life = 4
    assert(effectiveCost(s, "p1", card) !== 4 || card.cost === 4, "ライフ4では置換されない（元のコストのまま）")
    const at4 = effectiveCost(s, "p1", card)
    s.players.p1.life = 3
    assert(effectiveCost(s, "p1", card) === 4, "ライフ3（境界ちょうど）でコスト4になる")
    assert(at4 !== 4, `前提：置換前のコストは4ではない（実際は${at4}）`)
}

void declareBlock
