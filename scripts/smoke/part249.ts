// smoke パート249（BS10-X03 巨蟹武神キャンサード＝複数体ブロック。2026-08-27）
//
// 新設した機構:
//   - ConstraintDef.blockRequiresCount（「相手はブロックするならスピリット2体でないとブロックできない」）
//   - BattleState.pendingBlockerIds（必要数がそろうまで宣言を貯める）／extraBlockerIds（宣言はしたが
//     バトルはしない側）。「どれか1体とだけバトルする」ので blockerInstanceId は1体のまま＝
//     BP比較・破壊・バトル終了の処理はいっさい変えていない
//   - PendingChoice.blockBattlePick（**アタック側**がどのブロッカーとバトルするかを選ぶ。
//     効果文に「相手は」が無く主語がアタッカー側のため。2026-08-27 ユーザー確認）
//   - triggered.condition.ownFieldHasCombinedSpirit
// ※ 効果文は「スピリット2体か、**アルティメット1体**でないとブロックできない」だが、
//   アルティメットは未実装なので2体ブロックだけを見る。
// ⚠️ cardId はハードコードせず、名前と型をカードデータで機械検証してから使う。
import { act, assert, createGame, createInstance, declareBlock, effectiveBp, refreshLevelAsOverrides, runTurnStart, takeLifeAndResolve } from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { ALL_CARDS } from "../../server/src/logic/GameState"
import { blockRequiredCount } from "../../shared/block"
import { currentLevel, instIsCombined } from "../../shared/rules"

const byName = (n: string) => {
    const c = ALL_CARDS.find((x) => x.name === n)
    assert(c !== undefined, `テスト前提: ${n} がカードデータにいる`)
    return c!
}

const currentLevelOf = (_s: GameState, inst: Parameters<typeof currentLevel>[0]) => currentLevel(inst).level

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

function game(seed: string, interactive: boolean): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "green", p2: "red" })
    s.interactiveTargets = interactive
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    return s
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
const cancerd = byName("巨蟹武神キャンサード")
const blockerCard = byName("ムシャゼミ") // ブロッカー役（効果を持たないスピリット）
{
    assert(cancerd.type === "spirit" && cancerd.cost === 6, "巨蟹武神キャンサードはコスト6のスピリット")
    assert(cancerd.family.includes("光導"), "系統「光導」を持つ（自分自身も制約の対象になる）")
    assert(cancerd.levels[1]!.level === 2, "Lv2を持つ")
}

console.log("=== §A 自分のアタックステップでは、光導のアタッカーは2体そろえないとブロックできない ===")
{
    const s = game("bs10-x03-a", false)
    const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    const b1 = put(s, "p2", blockerCard.cardId, blockerCard.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    assert(act(s, "p1", { type: "nextPhase" }) === null, "アタックステップへ移行")
    assert(blockRequiredCount(s, "p1", attacker) === 2, "必要なブロッカーは2体")
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "キャンサードでアタック")
    // 相手のブロッカーが1体しかいないのでブロックできない
    const err = declareBlock(s, "p2", b1.instanceId)
    assert(err === "ブロックするにはスピリット2体が必要です", `1体しかいなければブロックできない（${String(err)}）`)
    assert(s.battle?.blockerInstanceId === null, "ブロッカーは決まっていない")
}

console.log("=== §B 2体そろえばブロックできる。非対話ではBPの低い方とバトルする ===")
{
    const s = game("bs10-x03-b", false)
    const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    const weak = put(s, "p2", blockerCard.cardId, blockerCard.levels[0]!.cores)
    // 効果を持たない（＝ブロック制約を持ちようがない）スピリットの中から、BPの高いものを選ぶ
    const strongCard = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.effect === "" && c.levels.length > 0 && (c.levels[0]!.bp ?? 0) > (blockerCard.levels[0]!.bp ?? 0),
    )!
    assert(strongCard !== undefined, "テスト前提: ムシャゼミよりBPの高いバニラのスピリットがいる")
    const strong = put(s, "p2", strongCard.cardId, strongCard.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })

    const e1 = declareBlock(s, "p2", strong.instanceId)
    assert(e1 === null, `1体目のブロック宣言は通る（${String(e1)}）`)
    assert(s.battle?.blockerInstanceId === null, "1体目だけではまだブロックが成立しない")
    assert((s.battle?.pendingBlockerIds ?? []).length === 1, "宣言が1件貯まっている")
    const e2 = act(s, "p2", { type: "block", instanceId: weak.instanceId })
    assert(e2 === null, `2体目のブロック宣言でブロックが成立する（${String(e2)}）`)
    assert((s.battle?.pendingBlockerIds ?? []).length === 0, "貯めていた宣言は空になる")
    assert(effectiveBp(s, "p2", weak) < effectiveBp(s, "p2", strong), "テスト前提: weak の方がBPが低い")
    assert(s.battle?.blockerInstanceId === weak.instanceId, "非対話ではBPの低い方とバトルする")
    assert((s.battle?.extraBlockerIds ?? []).includes(strong.instanceId), "もう1体はバトルしない側に入る")
}

console.log("=== §C 同じスピリットを二度は宣言できない ===")
{
    const s = game("bs10-x03-c", false)
    const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    const b1 = put(s, "p2", blockerCard.cardId, blockerCard.levels[0]!.cores)
    put(s, "p2", blockerCard.cardId, blockerCard.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    assert(declareBlock(s, "p2", b1.instanceId) === null, "1体目のブロック宣言")
    assert(act(s, "p2", { type: "block", instanceId: b1.instanceId }) !== null, "同じ個体は二度選べない")
    // 1体目を宣言したあとに撤回してライフで受けることはできない（ブロック宣言は1回きりの決定）
    assert(act(s, "p2", { type: "takeLife" }) !== null, "宣言の途中でライフ受けに切り替えられない")
}

console.log("=== §D 対話：2体そろうと、アタック側がバトル相手を選ぶ ===")
{
    const s = game("bs10-x03-d", true)
    const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    const b1 = put(s, "p2", blockerCard.cardId, blockerCard.levels[0]!.cores)
    const b2 = put(s, "p2", blockerCard.cardId, blockerCard.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    act(s, "p1", { type: "nextPhase" })
    act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
    declareBlock(s, "p2", b1.instanceId)
    act(s, "p2", { type: "block", instanceId: b2.instanceId })

    assert(s.pendingChoice?.pid === "p1", "選ぶのはアタック側（キャンサードの持ち主）")
    assert(s.pendingChoice?.kind === "target", "対象選択で選ばせる")
    assert(!s.pendingChoice!.optional, "選ばずに済ませることはできない")
    assert((s.pendingChoice!.candidates ?? []).length === 2, "候補は宣言した2体")
    assert(act(s, "p1", { type: "resolveChoice", instanceId: b2.instanceId }) === null, "b2 とバトルすることを選ぶ")
    assert(s.battle?.blockerInstanceId === b2.instanceId, "選んだ側がバトルする")
    assert((s.battle?.extraBlockerIds ?? []) .includes(b1.instanceId), "選ばれなかった側はバトルしない")
}

console.log("=== §E 制約は『自分のアタックステップ』限定（相手のターンには効かない） ===")
{
    const s = game("bs10-x03-e", false)
    const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    s.phase = "main"
    assert(blockRequiredCount(s, "p1", attacker) === 1, "メインステップでは制約が効かない")
    s.phase = "attack"
    s.turnPlayer = "p2"
    assert(blockRequiredCount(s, "p1", attacker) === 1, "相手のアタックステップでは制約が効かない")
    s.turnPlayer = "p1"
    assert(blockRequiredCount(s, "p1", attacker) === 2, "自分のアタックステップでのみ2体必要")
}

console.log("=== §F 系統「光導」/「星魂」を持たない自分のスピリットには制約が付かない ===")
{
    const s = game("bs10-x03-f", false)
    put(s, "p1", cancerd.cardId, cancerd.levels[0]!.cores)
    const other = ALL_CARDS.find(
        (c) => c.type === "spirit" && c.levels.length > 0 && !c.family.includes("光導") && !c.family.includes("星魂"),
    )!
    const otherInst = put(s, "p1", other.cardId, other.levels[0]!.cores)
    refreshLevelAsOverrides(s)
    s.phase = "attack"
    assert(blockRequiredCount(s, "p1", otherInst) === 1, `${other.name} は光導/星魂でないので通常どおり1体でブロックされる`)
}

console.log("=== §G Lv2：自分の合体スピリットがいる間、ライフを減らしたら相手のライフのコアを1個リザーブへ ===")
{
    const host = byName("ヘラジグサ")
    const brave = ALL_CARDS.find((c) => {
        if (c.type !== "brave") return false
        const cond = c.braveCondition
        const terms = cond === undefined ? [] : Array.isArray(cond) ? cond : [cond]
        const t = terms[0]
        if (t === undefined) return true
        if (t.vanilla === true) return host.effect === ""
        return host.cost >= (t.minCost ?? 0)
    })
    assert(brave !== undefined, "テスト前提: 合体できるブレイヴが1枚は存在する")

    // 合体スピリットがいない場合：ライフは減るだけ
    {
        const s = game("bs10-x03-g1", false)
        const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[1]!.cores)
        refreshLevelAsOverrides(s)
        assert(currentLevelOf(s, attacker) === 2, "キャンサードはLv2")
        act(s, "p1", { type: "nextPhase" })
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
        const lifeBefore = s.players.p2.life
        const reserveBefore = s.players.p2.reserve
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === lifeBefore - 1, "ライフが1減る")
        assert(s.players.p2.reserve === reserveBefore + 1, "減ったライフのコアがリザーブへ行くだけ（追加のコアは動かない）")
    }

    // 合体スピリットがいる場合：さらにライフのコア1個がリザーブへ
    {
        const s = game("bs10-x03-g2", false)
        const attacker = put(s, "p1", cancerd.cardId, cancerd.levels[1]!.cores)
        const hostInst = put(s, "p1", host.cardId, host.levels[0]!.cores)
        refreshLevelAsOverrides(s)
        s.players.p1.hand = [brave!.cardId]
        act(s, "p1", { type: "summon", handIndex: 0, braveTargetInstanceId: hostInst.instanceId })
        assert(instIsCombined(hostInst), "合体スピリットがいる")
        act(s, "p1", { type: "nextPhase" })
        act(s, "p1", { type: "attack", instanceId: attacker.instanceId })
        const lifeBefore = s.players.p2.life
        const reserveBefore = s.players.p2.reserve
        assert(takeLifeAndResolve(s, "p2") === null, "ライフで受ける")
        assert(s.players.p2.life === lifeBefore - 2, `ライフが2減る（アタック1 + 効果1。実際: -${String(lifeBefore - s.players.p2.life)}）`)
        assert(s.players.p2.reserve === reserveBefore + 2, "どちらのコアも相手のリザーブへ行く")
    }
}
