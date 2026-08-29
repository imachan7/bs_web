// smoke パート269（BS11 赤16枚。2026-08-29）
//
// 新設・拡張した機構:
//   - destroy.drawPerDestroyed（server/src/logic/actions/destroy.ts）：**実際に破壊できた**1体につき1枚ドロー。
//     数え方は destroyAll と同じバッチ経路（BS11-006 獅龍皇子レオグルス）
//   - triggered.condition { bothFieldsHaveSpiritMinBp }（triggers.ts）：**お互いの**フィールドに
//     指定BP以上がそれぞれいるときだけ発火（BS11-008 爆竜ドラゴニックベアード）
//   - revealAndSummonAllByFamily.countFromSelfLevel / maxCost（handDeck.ts）（BS11-007 輝龍皇ヘリオスドラゴン）
//   - onBattleEnd に battleRole を渡すようにした（GameEngine.ts）。
//     『このスピリットの**アタック時**』…バトル終了時、をブロック時と区別するため
//   - action:"destroyOneAmong"（destroy.ts）：スピリット/ブレイヴ/ネクサスから1つ破壊。
//     **合体中のブレイヴも単独で選べる**（2026-08-29 ユーザー確認。BS11-X01）
//   - kind:"trashSummonOnOwnSummon"（type.ts）＋ GameState.pendingTrashSummons：
//     トラッシュのカードを条件付き無償召喚（BS11-004 プロミネンスワイバーン）
//   - destroyNexus.chosenColor：「色1色を指定する」（BS11-073 バスターハンマー）
//   - battleWon.winnerCombinedOnly：勝ったのが合体スピリットのときだけ（BS11-062 オールトの竜巣Lv2）
//   - action:"disableOpponentArmorThisTurn"（grant.ts）：相手の【装甲】を落とす（BS11-049）
//
// ⚠️ cardId はハードコードで信用せず、カードデータをロードして名前・型・効果文を機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, getCard, refreshLevelAsOverrides, resolveAction, runTurnStart } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { attachBrave, fireBattleWonTriggers, fireTrigger } from "../../server/src/logic/EffectModules"
import { matchesBraveCondition } from "../../shared/rules"

function base(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "red", p2: "blue" })
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
        ["BS11-001", "ボルガメス", "spirit"],
        ["BS11-004", "プロミネンスワイバーン", "spirit"],
        ["BS11-006", "獅龍皇子レオグルス", "spirit"],
        ["BS11-007", "輝龍皇ヘリオスドラゴン", "spirit"],
        ["BS11-008", "爆竜ドラゴニックベアード", "spirit"],
        ["BS11-049", "ジャンビ・オレピス", "brave"],
        ["BS11-050", "激爪竜パワード・タスカー", "brave"],
        ["BS11-061", "星の祭壇", "nexus"],
        ["BS11-062", "オールトの竜巣", "nexus"],
        ["BS11-073", "バスターハンマー", "magic"],
        ["BS11-074", "ソーラーブレイカー", "magic"],
        ["BS11-X01", "太陽神龍ライジング・アポロドラゴン", "spirit"],
        ["BS11-X07", "天地神龍ガイ・アスラ", "spirit"],
    ]
    for (const [id, name, type] of expect) {
        assert(getCard(id).name === name && getCard(id).type === type, `${id}は${name}（${type}）`)
    }
    assert(getCard("BS11-005").effect === "", "BS11-005 頭竜人パキケファロンは効果を持たない（バニラ）")
}

// 実データから「Lv1 BPが n 以上／以下」のスピリットを探す（cardIdをハードコードしない）
function spiritWithLv1Bp(pred: (bp: number) => boolean, exclude: string[] = []): string {
    const c = ALL_CARDS.find(
        (x) => x.type === "spirit" && x.levels.length > 0 && pred(x.levels[0]!.bp) && !exclude.includes(x.cardId),
    )
    assert(c !== undefined, `テスト前提：Lv1 BPが条件を満たすスピリットがある`)
    return c!.cardId
}

console.log("=== BS11-006 獅龍皇子レオグルス：破壊できたときだけドローする ===")
{
    const s = base("006-draw", false)
    const weak = spiritWithLv1Bp((bp) => bp <= 5000)
    s.players.p2.field.spirits.push(createInstance(weak, s.turn, getCard(weak).levels[0]!.cores))
    const before = s.players.p1.hand.length
    const src = createInstance("BS11-006", s.turn, getCard("BS11-006").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onSummon")
    assert(s.players.p2.field.spirits.length === 0, "BP5000以下の相手が破壊される")
    assert(s.players.p1.hand.length === before + 1, "破壊できたので1枚ドローする")
}

console.log("=== BS11-006：対象がいなければドローもしない（ドローだけ先走らない） ===")
{
    const s = base("006-nodraw", false)
    const tough = spiritWithLv1Bp((bp) => bp > 5000)
    s.players.p2.field.spirits.push(createInstance(tough, s.turn, getCard(tough).levels[0]!.cores))
    const before = s.players.p1.hand.length
    const src = createInstance("BS11-006", s.turn, getCard("BS11-006").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onSummon")
    assert(s.players.p2.field.spirits.length === 1, "BP5000より上は破壊されない")
    assert(s.players.p1.hand.length === before, "破壊できなければドローしない")
}

console.log("=== BS11-008 爆竜ドラゴニックベアード：お互いにBP10000以上がいるときだけ発揮する ===")
{
    const big = spiritWithLv1Bp((bp) => bp >= 8000)
    const bigCard = getCard(big)
    // 片側だけ：発揮しない
    const s1 = base("008-oneside", false)
    const mine1 = createInstance(big, s1.turn, bigCard.levels[0]!.cores)
    mine1.tempBpBuff = 10000 // 実効BPを確実に10000以上へ
    s1.players.p1.field.spirits.push(mine1)
    const src1 = createInstance("BS11-008", s1.turn, getCard("BS11-008").levels[0]!.cores)
    s1.players.p1.field.spirits.push(src1)
    refreshLevelAsOverrides(s1)
    assert(effectiveBp(s1, "p1", mine1) >= 10000, "前提：自分側にBP10000以上がいる")
    fireTrigger(s1, "p1", src1, "onSummon")
    assert(s1.players.p1.field.spirits.some((sp) => sp.instanceId === mine1.instanceId), "相手側にいなければ自分のBP10000以上も破壊されない")

    // 両側：両方破壊される
    const s2 = base("008-bothsides", false)
    const mine2 = createInstance(big, s2.turn, bigCard.levels[0]!.cores)
    mine2.tempBpBuff = 10000
    const theirs = createInstance(big, s2.turn, bigCard.levels[0]!.cores)
    theirs.tempBpBuff = 10000
    s2.players.p1.field.spirits.push(mine2)
    s2.players.p2.field.spirits.push(theirs)
    const src2 = createInstance("BS11-008", s2.turn, getCard("BS11-008").levels[0]!.cores)
    s2.players.p1.field.spirits.push(src2)
    refreshLevelAsOverrides(s2)
    fireTrigger(s2, "p1", src2, "onSummon")
    assert(!s2.players.p1.field.spirits.some((sp) => sp.instanceId === mine2.instanceId), "自分のBP10000以上も破壊される")
    assert(!s2.players.p2.field.spirits.some((sp) => sp.instanceId === theirs.instanceId), "相手のBP10000以上も破壊される")
    assert(s2.players.p1.field.spirits.some((sp) => sp.instanceId === src2.instanceId), "BP10000未満の発生源自身は残る")
}

// 系統「星竜」でコストが低い／高いスピリットを実データから探す
const seiryu = ALL_CARDS.filter((c) => c.type === "spirit" && c.family.includes("星竜"))
assert(seiryu.length >= 2, "テスト前提：系統「星竜」のスピリットが2枚以上ある")
const seiryuCheap = seiryu.find((c) => c.cost <= 7)
const seiryuExpensive = seiryu.find((c) => c.cost > 7)
assert(seiryuCheap !== undefined, "テスト前提：コスト7以下の星竜がある")
assert(seiryuExpensive !== undefined, "テスト前提：コスト8以上の星竜がある（maxCost の境界検査に要る）")

console.log("=== BS11-007 輝龍皇ヘリオスドラゴン：Lvと同じ枚数だけ公開し、コスト7以下の星竜を召喚する ===")
{
    const s = base("007-reveal", false)
    const src = createInstance("BS11-007", s.turn, getCard("BS11-007").levels[1]!.cores) // Lv2
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    s.players.p1.deck = [seiryuCheap!.cardId, seiryuExpensive!.cardId, seiryuCheap!.cardId, ...s.players.p1.deck]
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", src, "onBattleEnd", "attacker")
    assert(s.players.p1.deck.length === deckBefore - 2, "Lv2なので2枚だけ公開する（Lvと同じ枚数）")
    assert(
        s.players.p1.field.spirits.filter((sp) => sp.cardId === seiryuCheap!.cardId).length === 1,
        "コスト7以下の星竜は召喚される",
    )
    assert(
        !s.players.p1.field.spirits.some((sp) => sp.cardId === seiryuExpensive!.cardId),
        "コスト8以上の星竜は召喚されない（maxCost の境界）",
    )
    assert(s.players.p1.trashCards.includes(seiryuExpensive!.cardId), "召喚できなかったカードはトラッシュへ")
}

console.log("=== BS11-007：ブロックしたバトルの終了では発揮しない（『アタック時』の絞り込み） ===")
{
    const s = base("007-blocker", false)
    const src = createInstance("BS11-007", s.turn, getCard("BS11-007").levels[1]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    s.players.p1.deck = [seiryuCheap!.cardId, seiryuCheap!.cardId, ...s.players.p1.deck]
    const deckBefore = s.players.p1.deck.length
    fireTrigger(s, "p1", src, "onBattleEnd", "blocker")
    assert(s.players.p1.deck.length === deckBefore, "ブロック側の役割では1枚も公開しない")
}

// 合体条件を持つブレイヴと、それを満たすホストを実データから探す
const braveCard = ALL_CARDS.find((c) => {
    if (c.type !== "brave") return false
    const cond = c.braveCondition
    const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
    return terms.length > 0 && c.levels.length > 0
})
assert(braveCard !== undefined, "テスト前提：合体条件を持つブレイヴがある")
function findHost(braveId: string): string {
    for (const c of ALL_CARDS) {
        if (c.type !== "spirit" || c.levels.length === 0) continue
        const probe = createInstance(c.cardId, 3, c.levels[0]!.cores)
        const s = base("host-probe", false)
        s.players.p1.field.spirits = [probe]
        refreshLevelAsOverrides(s)
        if (matchesBraveCondition(s, "p1", probe, braveId)) return c.cardId
    }
    throw new Error("合体条件を満たすホストが見つからない")
}
const HOST = findHost(braveCard!.cardId)

console.log("=== BS11-X01：合体中のブレイヴを単独で破壊できる（ホストは場に残る） ===")
{
    const s = base("x01-brave", false)
    const host = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p2.field.spirits.push(host)
    const brave = createInstance(braveCard!.cardId, s.turn, 0)
    attachBrave(s, "p2", host, brave)
    refreshLevelAsOverrides(s)
    const src = createInstance("BS11-X01", s.turn, getCard("BS11-X01").levels[2]!.cores)
    s.players.p1.field.spirits.push(src)

    // 非対話の自動選択は types の順（スピリット→ブレイヴ→ネクサス）なので、ここでは "brave" だけを指定して
    // 「合体中のブレイヴが対象になる」ことを直接見る
    resolveAction(s, "p1", src, { type: "destroyOneAmong", types: ["brave"], count: 1 })
    assert(!s.players.p2.field.combinedBraves.some((b) => b.instanceId === brave.instanceId), "合体中のブレイヴが破壊される")
    assert(s.players.p2.trashCards.includes(braveCard!.cardId), "破壊されたブレイヴはトラッシュへ")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは場に残る")
    assert(host.braveRefs === undefined, "ホストの参照は外れる")
    assert(host.cores === getCard(HOST).levels[0]!.cores, "破壊なのでコアは動かない（分離とは違う）")
}

console.log("=== BS11-X01：ネクサスも同じ効果で破壊できる ===")
{
    const s = base("x01-nexus", false)
    const nexusCard = ALL_CARDS.find((c) => c.type === "nexus")!
    const nx = createInstance(nexusCard.cardId, s.turn, nexusCard.levels[0]!.cores)
    s.players.p2.field.nexuses.push(nx)
    const src = createInstance("BS11-X01", s.turn, getCard("BS11-X01").levels[2]!.cores)
    s.players.p1.field.spirits.push(src)
    resolveAction(s, "p1", src, { type: "destroyOneAmong", types: ["spirit", "brave", "nexus"], count: 1 })
    assert(s.players.p2.field.nexuses.length === 0, "他に対象がなければネクサスが破壊される")
}

console.log("=== BS11-004 プロミネンスワイバーン：「太陽」を含む自分のスピリット召喚時、トラッシュから無償召喚できる ===")
{
    const sunCard = ALL_CARDS.find((c) => c.type === "spirit" && c.name.includes("太陽"))
    assert(sunCard !== undefined, "テスト前提：カード名に「太陽」を含むスピリットがある")
    const s = base("004-trash", true)
    s.players.p1.trashCards.push("BS11-004")
    s.players.p1.hand = [sunCard!.cardId]
    s.players.p1.reserve = 20
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "「太陽」入りのスピリットを召喚できる")
    assert(s.pendingChoice?.trashSummonConfirm !== undefined, "トラッシュからの無償召喚の確認が出る")
    assert(s.pendingChoice?.pid === "p1", "聞くのはトラッシュの持ち主")
    const reserveBefore = s.players.p1.reserve
    assert(act(s, "p1", { type: "resolveChoice", option: "召喚する" }) === null, "「召喚する」を選べる")
    assert(s.players.p1.field.spirits.some((sp) => sp.cardId === "BS11-004"), "トラッシュから場に出る")
    assert(!s.players.p1.trashCards.includes("BS11-004"), "トラッシュからは消える")
    assert(
        s.players.p1.reserve === reserveBefore - getCard("BS11-004").levels[0]!.cores,
        "コストは払わないが維持コアはリザーブから置く",
    )
}

console.log("=== BS11-004：名前が合わない召喚では確認が出ない ===")
{
    const plain = ALL_CARDS.find((c) => c.type === "spirit" && !c.name.includes("太陽") && c.cost <= 3)!
    const s = base("004-nomatch", true)
    s.players.p1.trashCards.push("BS11-004")
    s.players.p1.hand = [plain.cardId]
    assert(act(s, "p1", { type: "summon", handIndex: 0 }) === null, "別のスピリットを召喚できる")
    assert(s.pendingChoice?.trashSummonConfirm === undefined, "名前が合わなければ確認は出ない")
    assert(s.players.p1.trashCards.includes("BS11-004"), "トラッシュに残ったまま")
}

console.log("=== BS11-073 バスターハンマー：指定した色のネクサスだけを破壊し、その数だけドローする ===")
{
    const redNexus = ALL_CARDS.find((c) => c.type === "nexus" && c.colors.length === 1 && c.colors[0] === "red")
    const blueNexus = ALL_CARDS.find((c) => c.type === "nexus" && c.colors.length === 1 && c.colors[0] === "blue")
    assert(redNexus !== undefined && blueNexus !== undefined, "テスト前提：赤・青の単色ネクサスがある")
    const s = base("073-color", false)
    s.players.p2.field.nexuses.push(createInstance(redNexus!.cardId, s.turn, redNexus!.levels[0]!.cores))
    s.players.p2.field.nexuses.push(createInstance(redNexus!.cardId, s.turn, redNexus!.levels[0]!.cores))
    s.players.p2.field.nexuses.push(createInstance(blueNexus!.cardId, s.turn, blueNexus!.levels[0]!.cores))
    const before = s.players.p1.hand.length
    const src = createInstance("BS11-073", s.turn, 0)
    // 非対話は「破壊できる数が最も多い色」＝赤に倒れる
    resolveAction(s, "p1", src, { type: "destroyNexus", count: 0, all: true, side: "both", chosenColor: true, drawPerDestroyed: 1 })
    assert(s.players.p2.field.nexuses.length === 1, "指定色（赤）のネクサスだけが破壊される")
    assert(s.players.p2.field.nexuses[0]!.cardId === blueNexus!.cardId, "指定していない色は残る")
    assert(s.players.p1.hand.length === before + 2, "破壊した数（2つ）だけドローする")
}

console.log("=== BS11-062 オールトの竜巣Lv2：勝ったのが合体スピリットのときだけ回収する ===")
{
    const spiritCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0)!
    // 合体していない勝者：発火しない
    const s1 = base("062-notcombined", false)
    s1.players.p1.field.nexuses.push(createInstance("BS11-062", s1.turn, getCard("BS11-062").levels[1]!.cores))
    const winner1 = createInstance(spiritCard.cardId, s1.turn, spiritCard.levels[0]!.cores)
    s1.players.p1.field.spirits.push(winner1)
    s1.players.p1.trashCards.push(spiritCard.cardId)
    refreshLevelAsOverrides(s1)
    const hand1 = s1.players.p1.hand.length
    fireBattleWonTriggers(s1, "p1", winner1, "attacker")
    assert(s1.players.p1.hand.length === hand1, "合体していない勝者では発火しない")

    // 合体している勝者：発火する
    const s2 = base("062-combined", false)
    s2.players.p1.field.nexuses.push(createInstance("BS11-062", s2.turn, getCard("BS11-062").levels[1]!.cores))
    const host = createInstance(HOST, s2.turn, getCard(HOST).levels[0]!.cores)
    s2.players.p1.field.spirits.push(host)
    attachBrave(s2, "p1", host, createInstance(braveCard!.cardId, s2.turn, 0))
    s2.players.p1.trashCards.push(spiritCard.cardId)
    refreshLevelAsOverrides(s2)
    const hand2 = s2.players.p1.hand.length
    fireBattleWonTriggers(s2, "p1", host, "attacker")
    assert(s2.players.p1.hand.length === hand2 + 1, "合体スピリットが勝てばトラッシュから1枚手札に戻る")
}

console.log("=== BS11-050 激爪竜パワード・タスカー：ブロックされたとき、コア3個以下の相手1体を破壊する ===")
{
    const spiritCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0 && c.levels[0]!.cores <= 3)!
    const s = base("050-blocked", false)
    const host = createInstance(HOST, s.turn, getCard(HOST).levels[0]!.cores)
    s.players.p1.field.spirits.push(host)
    // BS11-050 を合体させる（合体条件はコスト5以上なので、ホストは条件を満たさなくても
    // ここでは attachBrave で直接くっつける＝誘発の絞り込みだけを見る）
    const brave = createInstance("BS11-050", s.turn, 0)
    attachBrave(s, "p1", host, brave)
    const few = createInstance(spiritCard.cardId, s.turn, 3)
    const many = createInstance(spiritCard.cardId, s.turn, 4)
    s.players.p2.field.spirits.push(many, few)
    refreshLevelAsOverrides(s)

    fireTrigger(s, "p1", host, "onBlocked")
    assert(!s.players.p2.field.spirits.some((sp) => sp.instanceId === few.instanceId), "コア3個（境界ちょうど）は破壊される")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === many.instanceId), "コア4個は破壊されない")
}

console.log("=== BS11-050：合体していなければ発揮しない（【合体時】のゲート） ===")
{
    const spiritCard = ALL_CARDS.find((c) => c.type === "spirit" && c.levels.length > 0 && c.levels[0]!.cores <= 3)!
    const s = base("050-notcombined", false)
    const lone = createInstance("BS11-050", s.turn, getCard("BS11-050").levels[0]!.cores)
    s.players.p1.field.spirits.push(lone)
    const target = createInstance(spiritCard.cardId, s.turn, 1)
    s.players.p2.field.spirits.push(target)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", lone, "onBlocked")
    assert(s.players.p2.field.spirits.some((sp) => sp.instanceId === target.instanceId), "スピリット状態では発揮しない")
}

console.log("=== BS11-001 ボルガメス：破壊時にBP4000以下を破壊する（境界） ===")
{
    const s = base("001-destroy", false)
    const edge = spiritWithLv1Bp((bp) => bp === 4000)
    const over = spiritWithLv1Bp((bp) => bp > 4000)
    s.players.p2.field.spirits.push(createInstance(over, s.turn, getCard(over).levels[0]!.cores))
    const src = createInstance("BS11-001", s.turn, getCard("BS11-001").levels[0]!.cores)
    s.players.p1.field.spirits.push(src)
    refreshLevelAsOverrides(s)
    fireTrigger(s, "p1", src, "onDestroy")
    assert(s.players.p2.field.spirits.length === 1, "BP4000より上は破壊されない")

    const s2 = base("001-destroy-edge", false)
    s2.players.p2.field.spirits.push(createInstance(edge, s2.turn, getCard(edge).levels[0]!.cores))
    const src2 = createInstance("BS11-001", s2.turn, getCard("BS11-001").levels[0]!.cores)
    s2.players.p1.field.spirits.push(src2)
    refreshLevelAsOverrides(s2)
    fireTrigger(s2, "p1", src2, "onDestroy")
    assert(s2.players.p2.field.spirits.length === 0, "BP4000ちょうどは破壊される")
}

void declareBlock
