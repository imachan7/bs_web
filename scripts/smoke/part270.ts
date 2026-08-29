// smoke パート270（BS11 紫15枚。2026-08-29）
//
// 新設・拡張した機構:
//   - constraint:"cantCombine"（shared/summon.ts の braveCombineCandidates が候補から外す。X02）
//   - constraint:"opponentCantMakeBraveSpiritState"（X02 Lv3）。2026-08-29 ユーザー確認で
//     **ブレイヴがスピリット状態になる3経路すべて**を禁じる（単体召喚／ホスト退場時に残す／効果による分離）。
//     共通述語は shared/rules.ts の cantMakeBraveSpiritState
//   - canDirectAttack.targetFilter:"combined"（相手の合体スピリットだけ指定できる。X02）
//   - triggered.condition { targetCombined }（「相手の合体スピリットとバトルしたとき」。X02）
//   - detachBrave.side:"opponent"（相手の合体スピリットを分離させる。015）
//   - destroyOneAmong の combinedOnly / eachCombined（014 / 016）
//   - reductionGrant.zone:"trash" ＋ effectiveCost の zone 引数（013）
//   - kind:"destroyedCostAs"（【不死】の引き金コストを広げる。064 Lv1）
//   - kind:"opponentCombineExhaust"（相手が合体したとき疲労。064 Lv2）
//   - action:"costDiscardHandTypeThenCoreRemove"（075）
//   - action:"costDestroyOwnThenOpponentDestroysToCost"（076）
//   - recoverSpiritFromTrash.maxCost（051）
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・効果文を機械検証してから使う。
import { act, assert, createGame, createInstance, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, detachBraveByEffect, detachBravesOnLeave, fireTrigger } from "../../server/src/logic/EffectModules"
import { braveCombineCandidates } from "../../shared/summon"
import { cantMakeBraveSpiritState, matchesBraveCondition } from "../../shared/rules"
import { effectiveCost } from "../../shared/cost"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "purple", p2: "red" })
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
        ["BS11-011", "フライスカル", "spirit"],
        ["BS11-013", "グラシャハウンド", "spirit"],
        ["BS11-014", "切り裂き姫アゼイリア", "spirit"],
        ["BS11-015", "冥王神獣インフェルド・ハデス", "spirit"],
        ["BS11-016", "邪眼皇ゼナス", "spirit"],
        ["BS11-051", "イビル・フィッシャー", "brave"],
        ["BS11-052", "魔銃ヴェスパー", "brave"],
        ["BS11-063", "終末描かれしキャンバス", "nexus"],
        ["BS11-064", "闇の聖剣", "nexus"],
        ["BS11-075", "トーテンタンツ", "magic"],
        ["BS11-076", "シェアリングペイン", "magic"],
        ["BS11-X02", "滅神星龍ダークヴルム・ノヴァ", "spirit"],
    ]
    for (const [id, name, type] of expect) {
        assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    }
    assert(getCard("BS11-012").effect === "", "BS11-012 冥鎧士ゼパルは効果を持たない（バニラ）")
}

// 合体条件を持つブレイヴと、それを満たすホストを実データから探す
const braveCard = ALL_CARDS.find((c) => {
    if (c.type !== "brave") return false
    const cond = c.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0 && c.levels.length > 0
})
assert(braveCard !== undefined, "テスト前提：合体条件を持つブレイヴがある")
const BRAVE = braveCard!.cardId
function findHost(): string {
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, BRAVE)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const HOST = findHost()

// pid のフィールドに合体スピリットを1体作る
function putCombined(s: GameState, pid: PlayerId, hostCores?: number): { host: ReturnType<typeof createInstance>; brave: ReturnType<typeof createInstance> } {
    const host = createInstance(HOST, s.turn, hostCores ?? getCard(HOST).levels[0]!.cores + getCard(BRAVE).levels[0]!.cores)
    s.players[pid].field.spirits.push(host)
    const brave = createInstance(BRAVE, s.turn, 0)
    attachBrave(s, pid, host, brave)
    refreshLevelAsOverrides(s)
    return { host, brave }
}

console.log("=== BS11-X02：このスピリットは合体できない（合体先の候補から外れる） ===")
{
    const s = base("x02-cantcombine", false)
    const nova = createInstance("BS11-X02", s.turn, getCard("BS11-X02").levels[0]!.cores)
    s.players.p1.field.spirits.push(nova)
    refreshLevelAsOverrides(s)
    // ⚠️ **合体条件をノヴァが満たすブレイヴ**を選ぶ。満たさないブレイヴだと「条件不一致で候補外」に
    //    なってしまい、cantCombine を外しても結果が変わらない＝検査にならない（2026-08-29 に実際に踏んだ）
    const braveForNova = ALL_CARDS.find((c) => {
        if (c.type !== "brave") return false
        const cond = c.braveCondition
        const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
        if (terms.length === 0) return false
        // cantCombine を無視した素の合体条件だけで判定する
        return matchesBraveCondition(s, "p1", nova, c.cardId)
    })
    assert(braveForNova !== undefined, "テスト前提：ノヴァが合体条件を満たすブレイヴがある")
    const other = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(other)
    refreshLevelAsOverrides(s)
    assert(matchesBraveCondition(s, "p1", nova, braveForNova!.cardId), "前提：合体条件そのものは満たしている")
    const cands = braveCombineCandidates(s, "p1", braveForNova!.cardId)
    assert(!cands.includes(nova.instanceId), "条件は満たすのに、ダークヴルム・ノヴァは合体先の候補に出ない")

    const candsForHost = braveCombineCandidates(s, "p1", BRAVE)
    assert(candsForHost.includes(other.instanceId), "他のスピリットは候補に出る（前提が成立している）")
}

console.log("=== BS11-X02 Lv3：相手はブレイヴをスピリット状態にできない（3経路すべて） ===")
{
    const s = base("x02-nospirit-state", false)
    const nova = createInstance("BS11-X02", s.turn, getCard("BS11-X02").levels[2]!.cores) // Lv3
    s.players.p1.field.spirits.push(nova)
    refreshLevelAsOverrides(s)
    assert(cantMakeBraveSpiritState(s, "p2"), "相手（p2）はブレイヴをスピリット状態にできない")
    assert(!cantMakeBraveSpiritState(s, "p1"), "自分（p1）は制限を受けない")

    // (a) 単体召喚できない
    s.players.p2.hand = [BRAVE]
    s.phase = "main"
    s.turnPlayer = "p2"
    assert(act(s, "p2", { type: "summon", handIndex: 0 }) !== null, "(a) ブレイヴを単体で召喚できない")

    // (c) 効果による分離ができない
    const combo = putCombined(s, "p2")
    detachBraveByEffect(s, "p2", combo.host, combo.brave)
    assert(
        s.players.p2.field.combinedBraves.some((b) => b.instanceId === combo.brave.instanceId),
        "(c) 効果で分離できない（合体したまま）",
    )

    // (b) ホストが場を離れても残せない
    detachBravesOnLeave(s, "p2", combo.host)
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === combo.brave.instanceId), "(b) ホスト退場時も残せない")
    assert(s.players.p2.trashCards.includes(BRAVE), "残せなかったブレイヴはトラッシュへ")
}

console.log("=== BS11-X02 Lv3が無ければ、3経路とも従来どおり通る（制限の効き目を裏から見る） ===")
{
    const s = base("x02-lv1-nolimit", false)
    const nova = createInstance("BS11-X02", s.turn, getCard("BS11-X02").levels[0]!.cores) // Lv1
    s.players.p1.field.spirits.push(nova)
    refreshLevelAsOverrides(s)
    assert(!cantMakeBraveSpiritState(s, "p2"), "Lv1では制限がかからない")
    const combo = putCombined(s, "p2")
    detachBraveByEffect(s, "p2", combo.host, combo.brave)
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === combo.brave.instanceId), "分離できる")
}

console.log("=== BS11-015：相手の合体スピリットを分離させる（side:\"opponent\"） ===")
{
    const s = base("015-detach-opp", false)
    const combo = putCombined(s, "p2")
    const src = createInstance("BS11-015", s.turn, getCard("BS11-015").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onAttack")
    assert(combo.host.braveRefs === undefined, "相手のホストからブレイヴが外れる")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === combo.brave.instanceId),
        "分離したブレイヴは相手のフィールドにスピリット状態で出る",
    )
    assert(combo.brave.cores === getCard(BRAVE).levels[0]!.cores, "コアは相手の合体スピリットから分け直される")
}

console.log("=== BS11-014：合体中のブレイヴだけを破壊する（スピリット状態のブレイヴは対象外） ===")
{
    const s = base("014-combinedonly", false)
    const combo = putCombined(s, "p2")
    // スピリット状態のブレイヴも置いておく（combinedOnly なので選ばれてはいけない）
    const lone = createInstance(BRAVE, s.turn, getCard(BRAVE).levels[0]!.cores)
    s.players.p2.field.spirits.push(lone)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-014", s.turn, getCard("BS11-014").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(src)
    fireTrigger(s, "p1", src, "onDestroy")
    assert(!s.players.p2.field.combinedBraves.some((b) => b.instanceId === combo.brave.instanceId), "合体中のブレイヴが破壊される")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === lone.instanceId), "スピリット状態のブレイヴは残る（combinedOnly）")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === combo.host.instanceId), "ホストは場に残る")
}

console.log("=== BS11-016：相手の合体スピリットすべてから1つずつ破壊する ===")
{
    const s = base("016-each", false)
    const c1 = putCombined(s, "p2")
    const c2 = putCombined(s, "p2")
    const src = createInstance("BS11-016", s.turn, getCard("BS11-016").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onSummon")
    assert(c1.host.braveRefs === undefined && c2.host.braveRefs === undefined, "2体とも合体が外れる")
    assert(s.players.p2.field.combinedBraves.length === 0, "合体中のブレイヴは残らない")
    assert(
        s.players.p2.field.spirits.some((sp) => sp.instanceId === c1.host.instanceId) &&
            s.players.p2.field.spirits.some((sp) => sp.instanceId === c2.host.instanceId),
        "ホストはどちらも場に残る",
    )
}

console.log("=== BS11-013：トラッシュの【不死】持ちにだけ軽減シンボルを与える（手札には効かない） ===")
{
    const fushiCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.effects.some((e) => e.kind === "keyword" && e.keyword === "fushi") && c.cost >= 2,
    )
    assert(fushiCard !== undefined, "テスト前提：【不死】を持つコスト2以上のスピリットがある")
    const s = base("013-reduction", false)
    const src = createInstance("BS11-013", s.turn, getCard("BS11-013").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    // ⚠️ 軽減は**フィールドの同色シンボル数で頭打ち**になる。対象カード自身が持つ紫の軽減シンボル数より
    //    多くの紫シンボルを場に出しておかないと、1つ足しても結果が変わらない（前提が成立しない）
    const purpleSymbols = fushiCard!.reduction.filter((c) => c === "purple").length
    const purpleSpirit = ALL_CARDS.find((c) => c.type === "spirit" && c.symbol.length === 1 && c.symbol[0] === "purple")!
    for (let i = 0; i < purpleSymbols + 1; i++) {
        s.players.p1.field.spirits.push(createInstance(purpleSpirit.cardId, s.turn, purpleSpirit.levels[0]!.cores))
    }
    refreshLevelAsOverrides(s)
    const inHand = effectiveCost(s, "p1", fushiCard!, false, "hand")
    const inTrash = effectiveCost(s, "p1", fushiCard!, false, "trash")
    assert(inTrash === Math.max(0, inHand - 1), "トラッシュのカードは軽減シンボル1つぶん安くなる")
    assert(inHand === effectiveCost(s, "p1", fushiCard!), "手札のカードには効かない（zone の絞り込み。省略時は hand）")
}

console.log("=== BS11-064 Lv1：破壊されたスピリットをコスト3/4としても扱う（【不死】の引き金が広がる） ===")
{
    const fushi3 = ALL_CARDS.find(
        (c) =>
            c.type === "spirit" &&
            c.effects.some((e) => e.kind === "keyword" && e.keyword === "fushi" && (e.triggerCosts ?? []).includes(3)),
    )
    assert(fushi3 !== undefined, "テスト前提：【不死：コスト3】を含むスピリットがある")
    // コスト3でない自分のスピリットが破壊されても、闇の聖剣があれば引き金になる
    const other = ALL_CARDS.find((c) => c.type === "spirit" && c.cost !== 3 && c.cost !== 4 && c.levels.length > 0)!
    const s = base("064-costas", false)
    s.phase = "attack"
    s.players.p1.trashCards.push(fushi3!.cardId)
    const victim = createInstance(other.cardId, s.turn, other.levels[0]!.cores)
    s.players.p1.field.spirits.push(victim)
    refreshLevelAsOverrides(s)

    // 聖剣なし：引き金にならない
    assert(fushiCandidatesCount(s, "p1", other.cost) === 0, "闇の聖剣が無ければ引き金にならない")
    // 聖剣あり（Lv1）：コスト3としても扱われるので引き金になる
    s.players.p1.field.nexuses.push(createInstance("BS11-064", s.turn, getCard("BS11-064").levels[0]!.cores))
    refreshLevelAsOverrides(s)
    assert(fushiCandidatesCount(s, "p1", other.cost) === 1, "闇の聖剣があればコスト3としても扱われ、引き金になる")
}

console.log("=== BS11-064 Lv2：相手のスピリットが合体したとき疲労する ===")
{
    const s = base("064-combineexhaust", false)
    s.players.p1.field.nexuses.push(createInstance("BS11-064", s.turn, getCard("BS11-064").levels[1]!.cores)) // Lv2
    refreshLevelAsOverrides(s)
    const combo = putCombined(s, "p2")
    assert(combo.host.isRested === true, "相手の合体スピリットは疲労する")

    // 自分側の合体は疲労しない（「相手のスピリットが」の絞り込み）
    const mine = putCombined(s, "p1")
    assert(mine.host.isRested === false, "自分の合体スピリットは疲労しない")
}

console.log("=== BS11-075 トーテンタンツ：手札のスピリット/ブレイヴが無ければ不発（COST_MODEL §1） ===")
{
    const magicCard = ALL_CARDS.find((c) => c.type === "magic")!
    const s = base("075-nocost", false)
    s.players.p1.hand = [magicCard.cardId] // マジックしかない
    const target = createInstance(HOST, s.turn, 3)
    s.players.p2.field.spirits.push(target)
    const src = createInstance("BS11-075", s.turn, 0)
    resolveAction(s, "p1", src, { type: "costDiscardHandTypeThenCoreRemove", cardTypes: ["spirit", "brave"], count: 2 })
    assert(target.cores === 3, "コストを払えなければコアは減らない（不発）")
    assert(s.players.p1.hand.length === 1, "手札も減らない")
}

console.log("=== BS11-075：スピリットカードを破棄してコア2個を取り除く ===")
{
    const s = base("075-pay", false)
    s.players.p1.hand = [HOST]
    const target = createInstance(HOST, s.turn, 3)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-075", s.turn, 0)
    resolveAction(s, "p1", src, { type: "costDiscardHandTypeThenCoreRemove", cardTypes: ["spirit", "brave"], count: 2 })
    assert(s.players.p1.hand.length === 0, "手札のスピリットカードが破棄される")
    assert(s.players.p1.trashCards.includes(HOST), "破棄したカードはトラッシュへ")
    assert(target.cores === 1, "相手のスピリットのコアが2個減る")
}

console.log("=== BS11-076 シェアリングペイン：破壊したコスト以上になるまで相手が破壊する ===")
{
    const cheap = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 1 && c.levels.length > 0)
    const mid = ALL_CARDS.find((c) => c.type === "spirit" && c.cost >= 3 && c.cost <= 4 && c.levels.length > 0)
    assert(cheap !== undefined && mid !== undefined, "テスト前提：コスト1とコスト3〜4のスピリットがある")
    const s = base("076-share", false)
    const sacrifice = createInstance(mid!.cardId, s.turn, mid!.levels[0]!.cores)
    s.players.p1.field.spirits.push(sacrifice)
    // 相手にはコスト1を3体（合計3以上になるまで破壊される）
    for (let i = 0; i < 3; i++) {
        s.players.p2.field.spirits.push(createInstance(cheap!.cardId, s.turn, cheap!.levels[0]!.cores))
    }
    refreshLevelAsOverrides(s)
    const need = effectiveCost(s, "p1", mid!)
    const src = createInstance("BS11-076", s.turn, 0)
    resolveAction(s, "p1", src, { type: "costDestroyOwnThenOpponentDestroysToCost" })

    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === sacrifice.instanceId), "コストとして自分の1体が破壊される")
    const destroyed = 3 - s.players.p2.field.spirits.length
    assert(destroyed >= 1, "相手のスピリットが破壊される")
    assert(destroyed * effectiveCost(s, "p2", cheap!) >= need, `破壊されたコスト合計が${need}以上になる`)
}

console.log("=== BS11-051：トラッシュから戻せるのはコスト6以下だけ（maxCost の境界） ===")
{
    const cheap = ALL_CARDS.find((c) => c.type === "spirit" && c.cost === 6)
    const pricey = ALL_CARDS.find((c) => c.type === "spirit" && c.cost >= 7)
    assert(cheap !== undefined && pricey !== undefined, "テスト前提：コスト6とコスト7以上のスピリットがある")
    const s = base("051-maxcost", false)
    s.players.p1.trashCards.push(pricey!.cardId, cheap!.cardId)
    const src = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    resolveAction(s, "p1", src, { type: "recoverSpiritFromTrash", count: 1, maxCost: 6 })
    assert(s.players.p1.hand.includes(cheap!.cardId), "コスト6（境界ちょうど）は手札に戻る")
    assert(s.players.p1.trashCards.includes(pricey!.cardId), "コスト7以上はトラッシュに残る")
}

// 【不死】の候補数を数えるヘルパー（removal.ts の内部関数を使わずに済ませる）
import { fushiCandidates } from "../../server/src/logic/removal"
function fushiCandidatesCount(s: GameState, pid: PlayerId, destroyedCost: number): number {
    return fushiCandidates(s, pid, destroyedCost).length
}
