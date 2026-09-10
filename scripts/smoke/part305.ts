// smoke パート305（BS13 黄バッチ16枚。docs/design/BS13_PLAN.md §11）
// 新しく足した器 AR（破壊待機からの復帰・一般形）・AT（ブレイヴだけ残す）・AV（BP比較を飛ばす）・
// AW（両陣営のコストアタック不可）・BA（Lv条件つきライフ保護）・BC（相手ネクサス無効・ターン限定）・
// BF（このバトルの間ブロックされない・Lv版）・BH（自分の系統すべてを与える）・BI（合体条件を無視）・
// BJ（手札にある自分自身への軽減付与）・AZ（ネクサス配置の軽減禁止）・AY（コストとしても扱う・合体限定）を
// 1つずつ固定する。特に #27（BS13-034：破棄の瞬間だけ召喚でき、召喚しなければデッキ破棄防止も付かない）と
// #28（BS13-082：BPを比べず終了させても、ブロックされなかったアタックのライフ減少は通常どおり）を明示的に確認する
import {
    act,
    assert,
    createGame,
    createInstance,
    effectSources,
    getCard,
    instHasCost,
    refreshLevelAsOverrides,
    declareBlock,
    resolveAction,
    runTurnStart,
    takeLifeAndResolve,
} from "./helpers"
import type { GameState } from "./helpers"
import { destroySpiritsFrom } from "../../server/src/logic/removal"
import { millDeck } from "../../server/src/logic/EffectModules"
import { reductionGrantSymbols } from "../../shared/cost"
import { hasMagicRestriction } from "../../shared/cost"
import { lifeDamageLimit, matchesBraveCondition, spiritHasFamily } from "../../shared/rules"
import { canBlock } from "../../shared/block"

function game(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "purple" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = true
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS13-034").name === "ミノガメン" && getCard("BS13-034").type === "spirit", "BS13-034はミノガメン")
    assert(getCard("BS13-036").name === "星鳥クージャ", "BS13-036は星鳥クージャ")
    assert(getCard("BS13-039").name === "神獣バーロン" && getCard("BS13-039").family.includes("戯狩"), "BS13-039は神獣バーロン（戯狩）")
    assert(getCard("BS13-057").name === "ポッポール" && getCard("BS13-057").type === "brave", "BS13-057はポッポール（ブレイヴ）")
    assert(getCard("BS13-058").name === "シユウ" && getCard("BS13-058").type === "brave", "BS13-058はシユウ（ブレイヴ）")
    assert(getCard("BS13-069").name === "星空のコンサートホール" && getCard("BS13-069").type === "nexus", "BS13-069は星空のコンサートホール")
    assert(getCard("BS13-070").name === "星宿の障壁" && getCard("BS13-070").type === "nexus", "BS13-070は星宿の障壁")
    assert(getCard("BS13-082").name === "ペガサスフラップ" && getCard("BS13-082").type === "magic", "BS13-082はペガサスフラップ")
    assert(getCard("BS13-X05").name === "麒麟星獣リーン" && getCard("BS13-X05").family.includes("戯狩"), "BS13-X05は麒麟星獣リーン")
}

console.log("=== 器AR：BS13-036（自分の黄が破壊されたとき、ライフのコア1個をリザーブに置くことで疲労状態で残る） ===")
{
    const s = game("ar-036-revive")
    const kuja = createInstance("BS13-036", s.turn, 1) // Lv1
    const target = createInstance("BS13-034", s.turn, 1) // 黄・Lv1
    s.players.p1.field.spirits.push(kuja, target)
    refreshLevelAsOverrides(s)
    const lifeBefore = s.players.p1.life
    const reserveBefore = s.players.p1.reserve
    destroySpiritsFrom(s, [{ pid: "p1", instanceId: target.instanceId }], 0, 0)
    assert(s.pendingChoice?.reviveConfirm !== undefined, "「破壊される代わりに残る」の確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "残すことを選ぶ")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === target.instanceId),
        "破壊されず疲労状態でフィールドに残る",
    )
    assert(target.isRested === true, "疲労状態")
    assert(s.players.p1.life === lifeBefore - 1, "コストとしてライフのコア1個を払った")
    assert(s.players.p1.reserve === reserveBefore + 1, "払ったコアは自分のリザーブへ")
    assert(!s.players.p1.trashCards.includes("BS13-034"), "トラッシュには置かれない")
}

console.log("=== 器AT：BS13-057（合体スピリットの破壊時、ブレイヴを回復状態で無償フィールドに残し、スピリットは手札へ） ===")
{
    const s = game("at-057-brave-keep")
    const host = createInstance("BS13-038", s.turn, 1) // コスト5（合体条件コスト4以上を満たす）
    const brave = createInstance("BS13-057", s.turn, 3) // 現在のコアを保つことを確認するため3を入れる
    brave.braveCombined = true
    brave.isRested = true // 合体前の状態を残しても、復帰後は「回復状態」を強制されることを確認する
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(brave)
    refreshLevelAsOverrides(s)
    destroySpiritsFrom(s, [{ pid: "p1", instanceId: host.instanceId }], 0, 0)
    assert(s.pendingChoice === null, "「〜できる」ではない（確認を出さず確定する）")
    assert(!s.players.p1.field.spirits.some((sp) => sp.instanceId === host.instanceId), "ホストは場から離れる")
    assert(s.players.p1.hand.includes("BS13-038"), "ホスト（スピリット）は手札に戻る")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === brave.instanceId),
        "ブレイヴは無償でフィールドに残る（コアの支払い確認が出ない）",
    )
    assert(brave.isRested !== true, "回復状態で残る")
    assert(brave.cores === 3, "コアは現状のまま（Lv1維持コアへリセットされない）")
    assert(
        !s.players.p1.field.combinedBraves.some((b) => b.instanceId === brave.instanceId),
        "合体中ブレイヴの一覧からは外れ、スピリット状態になる",
    )
}

console.log("=== §1 #27：BS13-034（相手のデッキ破棄効果で破棄された瞬間だけ無償召喚できる。召喚したときだけデッキ破棄防止が付く） ===")
{
    console.log("--- 召喚する：デッキ破棄防止が付く ---")
    const s = game("034-summon-yes")
    s.players.p1.deck.unshift("BS13-034")
    millDeck(s, "p1", 1, "p2") // 相手の効果によるミル（actorPid !== pid）
    assert(s.pendingChoice?.spiritMillFreeSummon?.cardId === "BS13-034", "無償召喚の確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "召喚する" }) === null, "召喚することを選ぶ")
    assert(
        s.players.p1.field.spirits.some((sp) => sp.cardId === "BS13-034"),
        "コストを支払わず召喚された",
    )
    // 召喚時効果（デッキ上オープン）が手札を増やすことがあるため、手札枚数の厳密な比較はしない
    const milledAfter = millDeck(s, "p1", 3, "p2") // 相手の効果でもう一度破棄しようとする
    assert(milledAfter === 0, "このターンの間、自分のデッキは相手の効果で破棄されない")

    console.log("--- 召喚しない：デッキ破棄防止は付かず、あとから召喚もできない ---")
    const s2 = game("034-summon-no")
    s2.players.p1.deck.unshift("BS13-034")
    millDeck(s2, "p1", 1, "p2")
    assert(act(s2, "p1", { type: "resolveChoice" }) === null, "召喚しないことを選ぶ")
    assert(s2.players.p1.trashCards.includes("BS13-034"), "召喚しなければトラッシュに残ったまま")
    assert(
        !s2.players.p1.field.spirits.some((sp) => sp.cardId === "BS13-034"),
        "召喚されていない",
    )
    const milledAfter2 = millDeck(s2, "p1", 3, "p2")
    assert(milledAfter2 === 3, "召喚しなかったので、デッキ破棄防止は付かない（通常どおり破棄される）")
}

console.log("=== BS13-034 召喚時：デッキ上1枚オープンし、コスト2のスピリットなら手札、それ以外はデッキの上に戻す ===")
{
    const s = game("034-onsummon-reveal")
    s.players.p1.deck.unshift(getCard("BS13-034").cardId) // コスト2のスピリットカード自身を先頭に積む
    const minogamen = createInstance("BS13-034", s.turn, 1)
    s.players.p1.field.spirits.push(minogamen)
    const before = s.players.p1.hand.length
    resolveAction(s, "p1", minogamen, { type: "deckReveal", count: 1, pickType: "spirit", costFilter: 2, returnToTop: true })
    assert(s.players.p1.hand.length === before + 1, "コスト2のスピリットカードは手札に加わる")
    assert(s.players.p1.hand.includes("BS13-034"), "手札に加わったのはオープンした本人")
}

console.log("=== §1 #28：BS13-082（BPを比べず終了させても、ブロックされなかったアタックのライフ減少は通常どおり） ===")
{
    console.log("--- ブロックされなかったアタック：ライフは通常どおり減る ---")
    const s = game("082-unblocked-life")
    s.players.p2.field.spirits = []
    const attacker = createInstance("BS13-034", s.turn, 1)
    s.players.p1.field.spirits.push(attacker)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "アタック宣言")
    resolveAction(s, "p1", null, { type: "skipBpCompareThenRefreshOne" }) // フラッシュでBS13-082を使う想定
    assert(s.battle?.skipBpCompare === true, "このバトルはBP比較を飛ばす印が付く")
    const lifeBefore = s.players.p2.life
    assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
    assert(s.players.p2.life < lifeBefore, "ブロックされなかったアタックのライフ減少はそのまま起きる")

    console.log("--- ブロックされたアタック：BP比較を飛ばすのでどちらも破壊されない ---")
    const s2 = game("082-blocked-no-destroy")
    const weakAttacker = createInstance("BS13-034", s2.turn, 1) // BP1000
    const strongBlocker = createInstance("BS13-040", s2.turn, 1) // BP4000（本来ならアタッカーが破壊される）
    s2.players.p1.field.spirits.push(weakAttacker)
    s2.players.p2.field.spirits.push(strongBlocker)
    refreshLevelAsOverrides(s2)
    assert(act(s2, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    assert(act(s2, "p1", { type: "attack", instanceId: weakAttacker.instanceId }) === null, "アタック宣言")
    assert(declareBlock(s2, "p2", strongBlocker.instanceId) === null, "ブロック宣言")
    resolveAction(s2, "p1", null, { type: "skipBpCompareThenRefreshOne" })
    assert(s2.battle?.skipBpCompare === true, "BP比較を飛ばす印が付く")
    while (s2.isFlashTiming && s2.battle) {
        assert(act(s2, s2.priorityPlayer, { type: "pass" }) === null, "パスして解決へ進める")
    }
    assert(s2.battle === null, "バトルは終了する")
    assert(
        s2.players.p1.field.spirits.some((sp) => sp.instanceId === weakAttacker.instanceId),
        "アタッカーは破壊されない（BP比較自体が起きていない）",
    )
    assert(
        s2.players.p2.field.spirits.some((sp) => sp.instanceId === strongBlocker.instanceId),
        "ブロッカーも破壊されない",
    )
}

console.log("=== 器AW：BS13-035（コスト0/1/4のスピリットすべては、持ち主を問わずアタックできない） ===")
{
    const s = game("aw-035-cant-attack")
    const oku = createInstance("BS13-035", s.turn, 1) // コスト3・Lv1
    s.players.p1.field.spirits.push(oku)
    const zeroCostP1 = createInstance("BS13-033", s.turn, 1) // ノックンモール：コスト1
    s.players.p1.field.spirits.push(zeroCostP1)
    refreshLevelAsOverrides(s)
    zeroCostP1.isRested = false
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ")
    const err1 = act(s, "p1", { type: "attack", instanceId: zeroCostP1.instanceId })
    assert(err1 !== null, "自分側のコスト1もアタックできない（両陣営に効く）")
    assert(err1?.includes("コスト") === true, "理由はコストによるもの")
}

console.log("=== 器BF：BS13-058【合体時】（このバトルの間、Lv1/Lv2の相手のスピリットからブロックされない） ===")
{
    const s = game("bf-058-unblockable")
    const host = createInstance("BS13-039", s.turn, 1) // コスト6（合体条件コスト4以上）
    const brave = createInstance("BS13-058", s.turn, 5)
    brave.braveCombined = true
    host.braveRefs = [{ slot: "single", instanceId: brave.instanceId }]
    s.players.p1.field.spirits.push(host)
    s.players.p1.field.combinedBraves.push(brave)
    for (let i = 0; i < 6; i++) s.players.p1.deck.push("BS13-033")
    refreshLevelAsOverrides(s)
    const deckBefore = s.players.p1.deck.length
    const lifeBefore = s.players.p1.life
    resolveAction(s, "p1", host, {
        type: "lifeCharge",
        from: "void",
        count: 1,
        costMillSelfCount: 5,
        thenUnblockableByLevelThisBattle: [1, 2],
    })
    assert(s.players.p1.deck.length === deckBefore - 5, "デッキ上5枚を破棄した")
    assert(s.players.p1.life === lifeBefore + 1, "ボイドからライフにコア1個")
    assert(host.unblockableLevelsThisBattle?.join(",") === "1,2", "このバトルの間Lv1/2からブロックされない印が付く")
    const lv1Blocker = createInstance("BS13-034", s.turn, 1) // Lv1
    const lv2Blocker = createInstance("BS13-036", s.turn, 2) // Lv2
    s.players.p2.field.spirits.push(lv1Blocker, lv2Blocker)
    refreshLevelAsOverrides(s)
    assert(canBlock(s, "p2", lv1Blocker, "p1", host) !== null, "Lv1の相手はブロックできない")
    assert(canBlock(s, "p2", lv2Blocker, "p1", host) !== null, "Lv2の相手もブロックできない")
}

console.log("=== 器BA：BS13-070（コスト3以下のLv1のスピリットのアタックでは、お互いのライフは減らされない。Lv2は対象外） ===")
{
    const s = game("ba-070-lifeguard")
    const barrier = createInstance("BS13-070", s.turn, 0) // Lv1
    s.players.p2.field.nexuses.push(barrier)
    const attackerLv1 = createInstance("BS13-034", s.turn, 1) // コスト2・Lv1
    s.players.p1.field.spirits.push(attackerLv1)
    refreshLevelAsOverrides(s)
    assert(lifeDamageLimit(s, "p2", attackerLv1).max === 0, "コスト3以下・Lv1のアタックはライフを減らせない")
    const attackerLv2 = createInstance("BS13-034", s.turn, 2) // 同カードでLv2まで上げる
    s.players.p1.field.spirits.push(attackerLv2)
    refreshLevelAsOverrides(s)
    assert(lifeDamageLimit(s, "p2", attackerLv2).max !== 0, "同じコストでもLv2なら対象外（AND条件）")
}

console.log("=== 器BC：BS13-039 召喚時（このターンの間、相手のネクサスすべての効果は発揮されない） ===")
{
    const s = game("bc-039-nexus-disable")
    const oppNexus = createInstance("BS13-070", s.turn, 0)
    s.players.p2.field.nexuses.push(oppNexus)
    assert(
        effectSources(s, "p2").some((i) => i.instanceId === oppNexus.instanceId),
        "前提：通常は発生源に含まれる",
    )
    resolveAction(s, "p1", null, { type: "opponentNexusEffectsDisabledThisTurn" })
    assert(
        !effectSources(s, "p2").some((i) => i.instanceId === oppNexus.instanceId),
        "このターンの間、相手（p2）のネクサスは発生源から外れる",
    )
}

console.log("=== 器BJ：BS13-039（系統「戯狩」を持つ自分のスピリット1体につき、手札にあるこのスピリットカードに軽減シンボル[黄]を与える） ===")
{
    const s = game("bj-039-self-reduction")
    const cardData = getCard("BS13-039")
    assert(reductionGrantSymbols(s, "p1", cardData).extra.length === 0, "戯狩が0体なら追加シンボルも0")
    const kigari1 = createInstance("BS13-036", s.turn, 1) // 系統「戯狩」/「星魂」
    s.players.p1.field.spirits.push(kigari1)
    assert(reductionGrantSymbols(s, "p1", cardData).extra.length === 1, "戯狩1体につき軽減シンボル1つ")
    const kigari2 = createInstance("BS13-039", s.turn, 1) // 自分自身も系統「戯狩」を持つので数に入る
    s.players.p1.field.spirits.push(kigari2)
    assert(reductionGrantSymbols(s, "p1", cardData).extra.length === 2, "戯狩2体で軽減シンボル2つ")
}

console.log("=== 器AZ：BS13-069 Lv1-2（相手がネクサスを配置するとき、軽減シンボルによるコストの軽減はできない） ===")
{
    const s = game("az-069-nexus-noreduction")
    const hall = createInstance("BS13-069", s.turn, 0) // Lv1
    s.players.p1.field.spirits.push(hall)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "endTurn" }) // p2のターン（相手のメインステップ）へ
    assert(s.turnPlayer === "p2" && s.phase === "main", "前提：p2のメインステップにいる")
    assert(hasMagicRestriction(s, "p2", "noReductionOpponentNexus") === true, "発生源の持ち主(p1)の相手(p2)は軽減できない")
    assert(hasMagicRestriction(s, "p1", "noReductionOpponentNexus") === false, "発生源の持ち主自身(p1)は制限を受けない")
}

console.log("=== 器AY：BS13-069 Lv2（自分の合体スピリットすべてはコスト2としても扱う） ===")
{
    const s = game("ay-069-alsocost")
    const hall = createInstance("BS13-069", s.turn, 1) // Lv2
    s.players.p1.field.spirits.push(hall)
    const combined = createInstance("BS13-040", s.turn, 1) // コスト7
    combined.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化（instIsCombined）
    const uncombined = createInstance("BS13-040", s.turn, 1)
    s.players.p1.field.spirits.push(combined, uncombined)
    refreshLevelAsOverrides(s)
    assert(instHasCost(combined, 2) === true, "合体スピリットはコスト2としても扱う")
    assert(instHasCost(uncombined, 2) === false, "合体していないスピリットは対象外")
}

console.log("=== 器BI：BS13-X05（合体条件を無視して合体できる） ===")
{
    const s = game("bi-x05-ignorecondition")
    const x05 = createInstance("BS13-X05", s.turn, 1) // コスト2（合体条件を満たさないホスト）
    s.players.p1.field.spirits.push(x05)
    assert(
        matchesBraveCondition(s, "p1", x05, "BS13-057") === true,
        "コスト4以上の合体条件を満たさなくても合体できる",
    )
    const plain = createInstance("BS13-034", s.turn, 1) // コスト2・合体条件を無視する効果を持たない
    s.players.p1.field.spirits.push(plain)
    assert(
        matchesBraveCondition(s, "p1", plain, "BS13-057") === false,
        "比較対象：この効果を持たないスピリットは合体条件どおり合体できない",
    )
}

console.log("=== 器AR：BS13-X05 Lv2-3（同じ系統のスピリット1体を疲労させることで、回復状態で残る） ===")
{
    const s = game("ar-x05-samefamily")
    const x05 = createInstance("BS13-X05", s.turn, 2) // Lv2
    const sameFamily = createInstance("BS13-036", s.turn, 1) // 系統「戯狩」/「星魂」を共有
    s.players.p1.field.spirits.push(x05, sameFamily)
    refreshLevelAsOverrides(s)
    destroySpiritsFrom(s, [{ pid: "p1", instanceId: x05.instanceId }], 0, 0)
    // BS13-036自身も「自分の黄が破壊されたとき」の復活効果を持つため、X05（黄）の破壊では2件同時に
    // 誘発する。ターンプレイヤーがまずX05自身の効果から解決する（同時発揮の一般則。TIMING_CHART.md §0-3）
    assert(s.pendingChoice?.triggerOrder !== undefined, "2件同時に誘発するので解決順を聞かれる")
    const x05Option = (s.pendingChoice!.options ?? []).find((o) => o.includes("麒麟星獣リーン"))!
    assert(act(s, "p1", { type: "resolveChoice", option: x05Option }) === null, "X05自身の効果から解決する")
    assert(s.pendingChoice?.reviveConfirm !== undefined, "「〜できる」の確認が出る")
    assert(act(s, "p1", { type: "resolveChoice", option: "復活させる" }) === null, "残すことを選ぶ")
    // 残った星鳥クージャ側の復活確認は不要（X05は黄だが、コストの都合で発揮するかは対戦者次第）。
    // 後続の確認が出ていたら「復活させない」で片付ける
    if (s.pendingChoice?.reviveConfirm !== undefined) {
        assert(act(s, "p1", { type: "resolveChoice" }) === null, "もう一方の復活は使わない")
    }
    assert(
        s.players.p1.field.spirits.some((sp) => sp.instanceId === x05.instanceId),
        "破壊されず回復状態でフィールドに残る",
    )
    assert(x05.isRested === false, "回復状態")
    assert(sameFamily.isRested === true, "コストとして同じ系統のスピリットが疲労した")
}

console.log("=== 器BH：BS13-X05【合体時】Lv3（自分のスピリットすべてが持つ系統すべてを与える） ===")
{
    const s = game("bh-x05-familygrant")
    const x05 = createInstance("BS13-X05", s.turn, 4) // Lv3
    x05.braveRefs = [{ slot: "single", instanceId: "dummy-brave" }] // 合体スピリット扱いにする簡略化（instIsCombined）
    const other = createInstance("BS13-038", s.turn, 1) // 系統「導魔」
    s.players.p1.field.spirits.push(x05, other)
    refreshLevelAsOverrides(s)
    assert(spiritHasFamily(s, "p1", x05, "導魔") === true, "自分のフィールドの他のスピリットが持つ系統も得る")
    assert(spiritHasFamily(s, "p1", x05, "皇獣") === false, "自分のフィールドに存在しない系統は得ない")
}

console.log("すべてのチェックに合格しました 🎉（part305）")
