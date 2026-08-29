// smoke パート273（BS11 黄15枚。2026-08-29）
//
// 新設・拡張した機構:
//   - triggered.condition { byOpponentSpiritEffect }（034）。判定は GameState.currentEffectSource
//     （docs/design/EFFECT_SOURCE_CONTEXT.md）。バトルによる破壊では立たないので自然に外れる
//   - detachBrave の all / minSymbols（034＝「シンボル2つ以上の相手の合体スピリットすべて」）
//   - constraint:"blockRequiresCorePayment"（037＝「リザーブのコア1個を置かなければブロックできない」）。
//     払えるかは shared/block.ts が見て、支払いはブロック宣言時に GameEngine が行う
//   - action:"millUntilCostThenSummonFree"（038）
//   - symbolFix の target:"self"（039＝「このスピリットのシンボルを黄3つにする」）
//   - action:"banBlockByCostsThisTurn" ＋ CardInstance.cantBlockThisTurn（057）
//   - action:"revealTopThenFreeUseOrHand"（058 / X05）
//   - ownNexusIndestructible.requireAllOwnNexusesColor（069）
//   - action:"opponentHandLockExceptColorThisTurn" ＋ handLockExceptColorForPid（082）
//   - constraintGrant の target:"opponentAll" と nonVanillaFilter（082）
//     ⚠️ constraintGrant は**自分側の発生源しか見ていなかった**ので、相手側も走査するようにした
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・効果文を機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState } from "./helpers"
import type { Color } from "../../server/src/type"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, fireTrigger } from "../../server/src/logic/EffectModules"
import { destroySpirit } from "../../server/src/logic/removal"
import { activeConstraints, instColors, instanceSymbolCount, matchesBraveCondition } from "../../shared/rules"
import { canBlock } from "../../shared/block"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
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
        ["BS11-033", "ニジノコ", "spirit"],
        ["BS11-034", "星馬コルット", "spirit"],
        ["BS11-036", "冥土の魔女ヘレン", "spirit"],
        ["BS11-037", "ヒポグリフィー", "spirit"],
        ["BS11-038", "天星馬ペガシーダ", "spirit"],
        ["BS11-039", "天使ティアエル", "spirit"],
        ["BS11-040", "神獣ヒキュー", "spirit"],
        ["BS11-057", "バタホルン", "brave"],
        ["BS11-058", "神弓鳥ペリュトーン", "brave"],
        ["BS11-069", "黄金の鐘楼", "nexus"],
        ["BS11-070", "彷徨う無重力島", "nexus"],
        ["BS11-081", "ライトニングデリバリー", "magic"],
        ["BS11-082", "ウィッグバインド", "magic"],
        ["BS11-X05", "魔導双神ジェミナイズ", "spirit"],
    ]
    for (const [id, name, type] of expect) {
        assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    }
    assert(getCard("BS11-035").effect === "", "BS11-035 物作りの妖精レプラは効果を持たない（バニラ）")
}

console.log("=== BS11-033：レベルごとに扱われる色が変わる ===")
{
    const s = base("033-colorAs", false)
    const card = getCard("BS11-033")
    for (const [levelIndex, color] of [[0, "red"], [1, "purple"], [2, "white"]] as [number, Color][]) {
        const inst = createInstance("BS11-033", s.turn, card.levels[levelIndex]!.cores)
        s.players.p1.field.spirits = [inst]
        refreshLevelAsOverrides(s)
        assert(instColors(inst).includes(color), `Lv${levelIndex + 1}では${color}としても扱われる`)
        assert(instColors(inst).includes("yellow"), "元の黄も残る（「としても扱う」）")
    }
}

// 「シンボルN個ちょうどのホスト」と、それに合体できるブレイヴの組を実データから探す。
// ⚠️ ブレイヴを先に固定するとシンボル2個のホストが見つからない（合体条件で弾かれる）ので、
//    **組で探す**（2026-08-29 に実際に踏んだ）
function findPair(symbols: number): { host: string; brave: string } {
    const braves = ALL_CARDS.filter((c) => {
        if (c.type !== "brave") return false
        const cond = c.braveCondition
        const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
        return terms.length > 0 && c.levels.length > 0
    })
    for (const h of ALL_CARDS) {
        if (h.type !== "spirit" || h.levels.length === 0) continue
        if (h.symbol.length !== symbols) continue
        const probe = createInstance(h.cardId, 3, h.levels[0]!.cores)
        const s = base("pair-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        for (const b of braves) {
            if (matchesBraveCondition(s, "p1", probe, b.cardId)) return { host: h.cardId, brave: b.cardId }
        }
    }
    throw new Error(`シンボル${symbols}個で合体できる組が見つからない`)
}
const PAIR1 = findPair(1)
const PAIR2 = findPair(2)
const braveCard = getCard(PAIR1.brave)
const HOST1 = PAIR1.host
const HOST2 = PAIR2.host

console.log("=== BS11-034：相手のスピリットの効果で破壊されたとき、シンボル2つ以上の合体スピリットすべてを分離 ===")
{
    const s = base("034-detach-all", false)
    // 相手にシンボル2つの合体スピリットと、シンボル1つの合体スピリットを1体ずつ
    const big = createInstance(HOST2, s.turn, getCard(HOST2).levels[0]!.cores + getCard(PAIR2.brave).levels[0]!.cores)
    s.players.p2.field.spirits.push(big)
    const bigBrave = createInstance(PAIR2.brave, s.turn, 0)
    attachBrave(s, "p2", big, bigBrave)
    const small = createInstance(HOST1, s.turn, getCard(HOST1).levels[0]!.cores + getCard(braveCard.cardId).levels[0]!.cores)
    s.players.p2.field.spirits.push(small)
    const smallBrave = createInstance(braveCard.cardId, s.turn, 0)
    attachBrave(s, "p2", small, smallBrave)
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(big) >= 2, "前提：片方はシンボル2つ以上")
    assert(instanceSymbolCount(small) === 1, "前提：もう片方はシンボル1つ")

    const victim = createInstance("BS11-034", s.turn, getCard("BS11-034").levels[0]!.cores)
    s.players.p1.field.spirits.push(victim)
    refreshLevelAsOverrides(s)
    // 相手の**スピリットの効果**で破壊する（currentEffectSource が立つ経路）
    const attacker = createInstance(HOST1, s.turn, getCard(HOST1).levels[0]!.cores)
    s.players.p2.field.spirits.push(attacker)
    resolveAction(s, "p2", attacker, { type: "destroy", count: 1, filter: { maxBp: 99999 } })

    assert(big.braveRefs === undefined, "シンボル2つ以上の合体スピリットは分離する")
    assert((small.braveRefs ?? []).length === 1, "シンボル1つの合体スピリットは分離しない（minSymbols）")
}

console.log("=== BS11-034：バトルで破壊されたときは発揮しない（「効果で」の絞り込み） ===")
{
    const s = base("034-not-by-effect", false)
    const combo = createInstance(HOST2, s.turn, getCard(HOST2).levels[0]!.cores + getCard(PAIR2.brave).levels[0]!.cores)
    s.players.p2.field.spirits.push(combo)
    attachBrave(s, "p2", combo, createInstance(PAIR2.brave, s.turn, 0))
    const victim = createInstance("BS11-034", s.turn, getCard("BS11-034").levels[0]!.cores)
    s.players.p1.field.spirits.push(victim)
    refreshLevelAsOverrides(s)
    // 効果ではなく直接破壊する（currentEffectSource が立たない）
    destroySpirit(s, "p1", victim.instanceId, "destroy")
    assert((combo.braveRefs ?? []).length === 1, "効果によらない破壊では分離しない")
}

console.log("=== BS11-037：リザーブのコアを払えなければブロックできない／払えれば払って通る ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    const s = base("037-blocktax", false)
    const attacker = createInstance("BS11-037", s.turn, getCard("BS11-037").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(attacker)
    const blocker = createInstance(plain.cardId, s.turn, plain.levels[0]!.cores)
    s.players.p2.field.spirits.push(blocker)
    refreshLevelAsOverrides(s)
    assert(
        activeConstraints(s, "p1", attacker).some((c) => c.type === "blockRequiresCorePayment"),
        "Lv2でブロック税の制約を持つ",
    )
    s.players.p2.reserve = 0
    assert(canBlock(s, "p2", blocker, "p1", attacker) !== null, "リザーブが0だとブロックできない")
    s.players.p2.reserve = 1
    assert(canBlock(s, "p2", blocker, "p1", attacker) === null, "リザーブが1あればブロックできる")
}

console.log("=== BS11-038：コスト6/7が出るまで破棄して、その1枚を無償召喚する ===")
{
    const hit = ALL_CARDS.find((c) => c.type === "spirit" && (c.cost === 6 || c.cost === 7) && c.levels.length > 0)!
    const miss = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 2 && c.levels.length > 0)!
    const s = base("038-mill", false)
    const src = createInstance("BS11-038", s.turn, getCard("BS11-038").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    s.players.p1.deck = [miss.cardId, miss.cardId, hit.cardId, ...s.players.p1.deck]
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onDestroy")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === hit.cardId), "条件に合うスピリットが召喚される")
    assert(s.players.p1.trashCards.filter((id) => id === miss.cardId).length === 2, "手前の2枚はトラッシュへ")
    assert(!s.players.p1.trashCards.includes(hit.cardId), "召喚したカードはトラッシュに残らない")
}

console.log("=== BS11-038：上限6枚まで（見つからなければ召喚しない） ===")
{
    const miss = ALL_CARDS.find((c) => c.type === "spirit" && c.cost <= 2 && c.levels.length > 0)!
    const s = base("038-limit", false)
    const src = createInstance("BS11-038", s.turn, getCard("BS11-038").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    s.players.p1.deck = new Array(10).fill(miss.cardId)
    const before = s.players.p1.deck.length
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onDestroy")
    assert(s.players.p1.deck.length === before - 6, "上限6枚までしか破棄しない")
    assert(!s.players.p1.field.spirits.some((sp) => sp.cardId === miss.cardId), "条件に合わないので召喚もしない")
}

console.log("=== BS11-039：自分のメインステップだけ、自身のシンボルが3つになる ===")
{
    const s = base("039-symbol", false)
    const inst = createInstance("BS11-039", s.turn, getCard("BS11-039").levels[0]!.cores)
    s.players.p1.field.spirits.push(inst)
    const other = createInstance("BS11-039", s.turn, getCard("BS11-039").levels[0]!.cores)
    s.players.p1.field.spirits.push(other)

    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(inst) === getCard("BS11-039").symbol.length, "アタックステップでは元のシンボル数")

    s.phase = "main"
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(instanceSymbolCount(inst) === 3, "自分のメインステップではシンボル3つ")
    assert(instanceSymbolCount(other) === 3, "同名の別個体も、それぞれ自分自身に効く")
}

console.log("=== BS11-057：コスト4/6/8の相手だけがブロックできなくなる ===")
{
    const c4 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 4 && c.levels.length > 0)!
    const c5 = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 5 && c.levels.length > 0)!
    const s = base("057-banblock", false)
    const a = createInstance(c4.cardId, s.turn, c4.levels[0]!.cores)
    const b = createInstance(c5.cardId, s.turn, c5.levels[0]!.cores)
    s.players.p2.field.spirits.push(a, b)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-057", s.turn, 0)
    resolveAction(s, "p1", src, { type: "banBlockByCostsThisTurn", costs: [4, 6, 8] })
    assert(a.cantBlockThisTurn === true, "コスト4はブロックできない")
    assert(b.cantBlockThisTurn !== true, "コスト5は対象外（完全一致）")
}

console.log("=== BS11-069：自分のネクサスがすべて黄のときだけ破壊されない ===")
{
    const yellowNexus = ALL_CARDS.find((c) => c.type === "nexus" && c.colors.length === 1 && c.colors[0] === "yellow")
    const otherNexus = ALL_CARDS.find((c) => c.type === "nexus" && !c.colors.includes("yellow"))
    assert(yellowNexus !== undefined && otherNexus !== undefined, "テスト前提：黄のネクサスと黄以外のネクサスがある")
    const s = base("069-indestructible", false)
    s.turnPlayer = "p2" // 『相手のターン』
    s.players.p1.field.nexuses.push(createInstance("BS11-069", s.turn, getCard("BS11-069").levels[0]!.cores))
    s.players.p1.field.nexuses.push(createInstance(yellowNexus!.cardId, s.turn, yellowNexus!.levels[0]!.cores))
    refreshLevelAsOverrides(s)
    const before = s.players.p1.field.nexuses.length
    const src = createInstance(otherNexus!.cardId, s.turn, 0)
    resolveAction(s, "p2", src, { type: "destroyNexus", count: 1 })
    assert(s.players.p1.field.nexuses.length === before, "すべて黄なら破壊されない")

    // 黄以外を1つ混ぜると守られない
    s.players.p1.field.nexuses.push(createInstance(otherNexus!.cardId, s.turn, otherNexus!.levels[0]!.cores))
    refreshLevelAsOverrides(s)
    const before2 = s.players.p1.field.nexuses.length
    resolveAction(s, "p2", src, { type: "destroyNexus", count: 1 })
    assert(s.players.p1.field.nexuses.length === before2 - 1, "黄以外が混ざると守られない")
}

console.log("=== BS11-082：効果を持つ相手のスピリットだけがアタック・ブロックできなくなる ===")
{
    const withEffect = ALL_CARDS.find((c) => c.type === "spirit" && c.effect !== "" && c.levels.length > 0)!
    const vanilla = ALL_CARDS.find((c) => c.type === "spirit" && c.effect === "" && c.levels.length > 0)!
    const s = base("082-lock", false)
    const a = createInstance(withEffect.cardId, s.turn, withEffect.levels[0]!.cores)
    const v = createInstance(vanilla.cardId, s.turn, vanilla.levels[0]!.cores)
    s.players.p2.field.spirits.push(a, v)
    // マジックの貸与（lendSelfThisTurn）で仮想発生源を立てる
    s.players.p1.hand = ["BS11-082"]
    s.players.p1.reserve = 20
    s.phase = "main"
    s.turnPlayer = "p1"
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "castMagic", handIndex: 0 }) === null, "ウィッグバインドを使用できる")

    assert(
        activeConstraints(s, "p2", a).some((c) => c.type === "cantAttack"),
        "効果を持つ相手のスピリットはアタックできない",
    )
    assert(
        activeConstraints(s, "p2", a).some((c) => c.type === "cantBlock"),
        "効果を持つ相手のスピリットはブロックできない",
    )
    assert(
        !activeConstraints(s, "p2", v).some((c) => c.type === "cantAttack"),
        "バニラは対象外（nonVanillaFilter）",
    )
    assert(
        !activeConstraints(s, "p1", s.players.p1.field.spirits[0] ?? a).some((c) => c.type === "cantAttack"),
        "自分のスピリットには効かない（target: opponentAll）",
    )
}

console.log("=== BS11-082：相手は黄以外の手札のカードを使えない ===")
{
    const nonYellow = ALL_CARDS.find((c) => c.type === "spirit" && !c.colors.includes("yellow") && c.cost <= 2)!
    const yellowCard = ALL_CARDS.find((c) => c.type === "spirit" && c.colors.includes("yellow") && c.cost <= 2)
    assert(yellowCard !== undefined, "テスト前提：コスト2以下の黄のスピリットがある")
    const s = base("082-handlock", false)
    const src = createInstance("BS11-082", s.turn, 0)
    resolveAction(s, "p1", src, { type: "opponentHandLockExceptColorThisTurn", color: "yellow" })

    s.turnPlayer = "p2"
    s.phase = "main"
    s.players.p2.hand = [nonYellow.cardId, yellowCard!.cardId]
    s.players.p2.reserve = 20
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) !== null, "黄以外の手札は使えない")
    assert(act(s, "p2", { type: "summon", handIndex: 1 }) === null, "黄の手札は使える")
}

