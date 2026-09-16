// smoke パート325（S4：見出しのステップ/ターン限定が実装に無かった9カード・9エントリに
// 「限定の外では効かない／限定の中では効く」テストを足す）
// 対象: BS11-018（reductionGrant）/ BS13-036（reviveOnDestroy + fieldEvent×2）/
//       BS13-X02（reviveOnDestroy）/ BS14-031（aura）/ BS14-041（blockTriggersAsAttackGrant）/
//       BS14-061（levelAs）/ BS14-062（aura）
//       BS09-063（reviveOnDestroy。見出しが『相手のターン』だけなので phase 不問へ広げた）
// ※ BS08-057 の tenshoSelfCostBonus は見出しが『自分のメインステップ』で、
//   【転召】召喚はメインステップにしか起きないため限定は不要（S4_VERIFIED に登録済み）
import {
    act,
    assert,
    createGame,
    createInstance,
    currentLevel,
    declareBlock,
    destroySpirit,
    effectiveBp,
    getCard,
    refreshLevelAsOverrides,
    runTurnStart,
} from "./helpers"
import type { GameState, PlayerId } from "./helpers"
import { reductionGrantSymbols } from "../../shared/cost"
import { fireTrigger } from "../../server/src/logic/triggers"

function base(seed: string): GameState {
    const s = createGame(seed, { p1: "アキラ", p2: "ユウキ" }, { p1: "yellow", p2: "red" })
    runTurnStart(s)
    s.players.p1.reserve = 20
    s.players.p2.reserve = 20
    s.interactiveTargets = false
    return s
}

function put(s: GameState, pid: PlayerId, cardId: string, cores: number) {
    const inst = createInstance(cardId, s.turn, cores)
    s.players[pid].field.spirits.push(inst)
    return inst
}

// フラッシュタイミングを両者パスで閉じ、バトルを解決まで進める（scripts/smoke/part180.ts と同型）
function closeFlash(s: GameState): void {
    while (s.isFlashTiming && s.battle && !s.pendingChoice && !s.winner) {
        if (act(s, s.priorityPlayer, { type: "pass" })) return
    }
}

console.log("=== カードデータの機械確認（cardIdのズレ検出） ===")
{
    assert(getCard("BS11-018").name === "ヤクヤナギ", "BS11-018 はヤクヤナギ")
    assert(getCard("BS01-053").name === "リーヴォルフ", "BS01-053 はリーヴォルフ（緑・神速持ち）")
    assert(getCard("BS13-036").name === "星鳥クージャ", "BS13-036 は星鳥クージャ")
    assert(getCard("BS02-049").name === "ピヨン", "BS02-049 はピヨン（黄バニラ）")
    assert(getCard("BS13-X02").name === "蛇皇神帝アスクレピオーズ", "BS13-X02 は蛇皇神帝アスクレピオーズ")
    assert(getCard("BS13-011").name === "暗殺者ドラゴナーガ", "BS13-011 は暗殺者ドラゴナーガ（妖蛇）")
    assert(getCard("BS14-031").name === "ムシャ・エイプウィップ", "BS14-031 はムシャ・エイプウィップ")
    assert(getCard("BS14-041").name === "バスター・フェンリルキャノン", "BS14-041 はバスター・フェンリルキャノン")
    assert(getCard("BS14-037").name === "エゾノ・アウル", "BS14-037 はエゾノ・アウル（機獣・ブロック時）")
    assert(getCard("BS14-061").name === "ヤギュード・ジューベイ", "BS14-061 はヤギュード・ジューベイ")
    assert(getCard("BS14-010").name === "皇牙獣キンタローグ・ベアー", "BS14-010 は皇牙獣キンタローグ・ベアー（覇皇）")
    assert(getCard("BS14-062").name === "ロック・ゴレム・カスタム", "BS14-062 はロック・ゴレム・カスタム")
}

console.log("=== BS11-018 ヤクヤナギ：『お互いのアタックステップ』限定（reductionGrant） ===")
{
    const s = base("p325-yakuyanagi")
    put(s, "p1", "BS11-018", 3) // Lv2
    refreshLevelAsOverrides(s)

    s.phase = "main"
    const outside = reductionGrantSymbols(s, "p1", getCard("BS01-053"))
    assert(outside.extra.length === 0, "アタックステップ外では軽減シンボルが付与されない")

    s.phase = "attack"
    const inside = reductionGrantSymbols(s, "p1", getCard("BS01-053"))
    assert(
        inside.extra.length === 2 && inside.extra.every((c) => c === "green"),
        "アタックステップ中は[緑][緑]が付与される",
    )
}

console.log("=== BS13-036 星鳥クージャ：『お互いのアタックステップ』限定（reviveOnDestroy/fieldEvent） ===")
{
    const s = base("p325-kuja")
    s.players.p1.life = 2
    put(s, "p1", "BS13-036", 3) // Lv3：3エントリすべて有効
    const outsideTarget = put(s, "p1", "BS02-049", 1)
    refreshLevelAsOverrides(s)

    s.phase = "main"
    const handBefore = s.players.p1.hand.length
    const reserveBefore = s.players.p1.reserve
    const lifeBefore = s.players.p1.life
    const coresOnTarget = outsideTarget.cores
    destroySpirit(s, "p1", outsideTarget.instanceId)
    assert(
        !s.players.p1.field.spirits.some((x) => x.instanceId === outsideTarget.instanceId),
        "メインステップでは復活せずトラッシュへ行く",
    )
    assert(s.players.p1.hand.length === handBefore, "メインステップではドローが発揮されない")
    assert(s.players.p1.life === lifeBefore, "メインステップでは復活コスト（ライフ→リザーブ）が発生しない")
    // 破壊されたスピリット自身のコアは通常どおりリザーブへ戻る（BS13-036の効果とは無関係の基本ルール）。
    // ボイド→リザーブ（e3）が発揮されていれば、この基本分を超えて増える
    assert(
        s.players.p1.reserve === reserveBefore + coresOnTarget,
        "メインステップではボイド→リザーブ（e3）が発揮されない（増分は破壊されたコアの分だけ）",
    )

    const s2 = base("p325-kuja-inside")
    s2.players.p1.life = 2
    put(s2, "p1", "BS13-036", 3)
    const insideTarget = put(s2, "p1", "BS02-049", 1)
    refreshLevelAsOverrides(s2)
    s2.turnPlayer = "p2" // 相手のターン（turn:"both"が効くかの確認）
    s2.phase = "attack"
    const handBefore2 = s2.players.p1.hand.length
    const reserveBefore2 = s2.players.p1.reserve
    const lifeBefore2 = s2.players.p1.life
    destroySpirit(s2, "p1", insideTarget.instanceId)
    assert(
        s2.players.p1.field.spirits.some((x) => x.instanceId === insideTarget.instanceId && x.isRested === true),
        "お互いのアタックステップ中（相手のターンでも）は疲労状態で場に残る",
    )
    assert(s2.players.p1.hand.length === handBefore2 + 1, "お互いのアタックステップ中はドローが発揮される")
    assert(s2.players.p1.life === lifeBefore2 - 1, "お互いのアタックステップ中は復活コスト（ライフ1個→リザーブ）が発生する")
    // 復活したので破壊によるコア返還は起きない。増分は「ライフ→リザーブ（復活コスト）1個」＋「ボイド→リザーブ（e3）1個」＝2
    assert(
        s2.players.p1.reserve === reserveBefore2 + 2,
        "お互いのアタックステップ中はボイド→リザーブ（e3）が発揮される",
    )
}

console.log("=== BS13-X02 蛇皇神帝アスクレピオーズ：『自分のアタックステップ』限定（reviveOnDestroy） ===")
{
    // ownAllの発生源とその対象は同一インスタンスでは成立しない（removal.tsの source.instanceId === inst.instanceId 除外）ので、
    // X02自身は場に残したまま、系統「妖蛇」を持つ別のスピリット（BS13-011暗殺者ドラゴナーガ）を対象に使う
    // own：自分のターンのアタックで敗れたら回復状態で残る
    const s = base("p325-asklepios-own")
    put(s, "p1", "BS13-X02", 4) // Lv2（ownAll発生源）
    const attacker = put(s, "p1", "BS13-011", 1) // 妖蛇・Lv1
    const blocker = put(s, "p2", "BS01-050", 1)
    blocker.tempBpBuff = 30000 // 確実に勝たせる
    s.turnPlayer = "p1"
    s.phase = "attack"
    assert(act(s, "p1", { type: "attack", instanceId: attacker.instanceId }) === null, "p1がアタック宣言")
    assert(declareBlock(s, "p2", blocker.instanceId) === null, "p2がブロック宣言")
    closeFlash(s)
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === attacker.instanceId && x.isRested === false),
        "自分のアタックステップでバトルに敗れても回復状態で場に残る",
    )

    // opponent：相手のターン（＝このスピリットがブロッカー側）で敗れたら復活しない
    const s2 = base("p325-asklepios-opp")
    put(s2, "p1", "BS13-X02", 4) // Lv2（ownAll発生源）
    const defender = put(s2, "p1", "BS13-011", 1) // 妖蛇・Lv1
    const oppAttacker = put(s2, "p2", "BS01-050", 1)
    oppAttacker.tempBpBuff = 30000
    s2.turnPlayer = "p2"
    s2.phase = "attack"
    assert(act(s2, "p2", { type: "attack", instanceId: oppAttacker.instanceId }) === null, "p2がアタック宣言")
    assert(declareBlock(s2, "p1", defender.instanceId) === null, "p1がブロック宣言")
    closeFlash(s2)
    assert(
        !s2.players.p1.field.spirits.some((x) => x.instanceId === defender.instanceId),
        "相手のアタックステップ（自分のターンでない）では復活せずトラッシュへ行く",
    )
}

console.log("=== BS14-031 ムシャ・エイプウィップ：『自分のアタックステップ』限定（aura） ===")
{
    const s = base("p325-apewhip")
    const self = put(s, "p1", "BS14-031", 3) // Lv2
    s.players.p1.reserve = 2
    s.players.p1.burstSet = true
    refreshLevelAsOverrides(s)
    const baseBp = getCard("BS14-031").levels[1]!.bp

    s.turnPlayer = "p1"
    s.phase = "main"
    assert(effectiveBp(s, "p1", self) === baseBp, "メインステップではBPバフが効かない")

    s.phase = "attack"
    s.turnPlayer = "p2"
    assert(effectiveBp(s, "p1", self) === baseBp, "相手のアタックステップでは効かない（own限定）")

    s.turnPlayer = "p1"
    assert(effectiveBp(s, "p1", self) === baseBp + 2000, "自分のアタックステップではリザーブ2個分BP+2000")
}

console.log("=== BS14-041 バスター・フェンリルキャノン：『自分のアタックステップ』限定（blockTriggersAsAttackGrant） ===")
{
    const s = base("p325-fenrilcannon")
    put(s, "p1", "BS14-041", 2) // Lv2
    const target = put(s, "p1", "BS14-037", 1) // 機獣・『ブロック時』でボイド→自身にコア1個（バースト条件）
    s.players.p1.burstSet = true
    refreshLevelAsOverrides(s)

    s.turnPlayer = "p1"
    s.phase = "main"
    const coresBeforeOutside = target.cores
    fireTrigger(s, "p1", target, "onAttack", "attacker")
    assert(target.cores === coresBeforeOutside, "メインステップでは『ブロック時』効果がアタック時に移らない")

    s.phase = "attack"
    const coresBeforeInside = target.cores
    fireTrigger(s, "p1", target, "onAttack", "attacker")
    assert(target.cores === coresBeforeInside + 1, "自分のアタックステップでは『ブロック時』効果がアタック時に発揮される")
}

console.log("=== BS14-061 ヤギュード・ジューベイ：『自分のアタックステップ』限定（levelAs） ===")
{
    const s = base("p325-yagyude")
    put(s, "p1", "BS14-061", 4) // Lv2（sourceLevels:[2]の条件）
    const target = put(s, "p1", "BS14-010", 1) // 覇皇・Lv1
    s.turnPlayer = "p1"

    s.phase = "main"
    refreshLevelAsOverrides(s)
    assert(currentLevel(target).level === 1, "メインステップでは最高Lvとして扱われない")

    s.phase = "attack"
    refreshLevelAsOverrides(s)
    assert(currentLevel(target).level === 3, "自分のアタックステップでは最高Lv（3）として扱われる")
}

console.log("=== BS14-062 ロック・ゴレム・カスタム：『自分のアタックステップ』限定（aura） ===")
{
    const s = base("p325-rockgolem")
    const self = put(s, "p1", "BS14-062", 2) // Lv2・【粉砕】持ち
    s.players.p1.burstSet = true
    refreshLevelAsOverrides(s)
    const baseBp = getCard("BS14-062").levels[1]!.bp

    s.turnPlayer = "p1"
    s.phase = "main"
    assert(effectiveBp(s, "p1", self) === baseBp, "メインステップではBPバフが効かない")

    s.phase = "attack"
    assert(effectiveBp(s, "p1", self) === baseBp + 2000, "自分のアタックステップでは【粉砕】持ちにBP+2000")
}

console.log("=== BS09-063 花の宮殿：『相手のターン』はステップを問わない（reviveOnDestroy） ===")
{
    // 見出しは『相手のターン』だけなので、相手のメインステップで破壊されても復活する
    // （以前は phaseTurn が attack 固定で、アタックステップ以外では復活しなかった）
    const s = base("p325-hananokyuden")
    s.players.p1.field.nexuses.push(createInstance("BS09-063", s.turn, 2)) // Lv2
    const gakuzoku = put(s, "p1", "BS09-037", 2) // 系統：「楽族」
    assert(getCard("BS09-037").family.includes("楽族"), "BS09-037 プーカは系統：「楽族」を持つ")
    refreshLevelAsOverrides(s)
    s.turnPlayer = "p2" // 相手のターン
    s.phase = "main"
    destroySpirit(s, "p1", gakuzoku.instanceId)
    assert(
        s.players.p1.field.spirits.some((x) => x.instanceId === gakuzoku.instanceId && x.isRested === true),
        "相手のメインステップでも疲労状態で場に戻る",
    )

    const s2 = base("p325-hananokyuden-own")
    s2.players.p1.field.nexuses.push(createInstance("BS09-063", s2.turn, 2))
    const own = put(s2, "p1", "BS09-037", 2)
    refreshLevelAsOverrides(s2)
    s2.turnPlayer = "p1" // 自分のターン＝対象外
    s2.phase = "attack"
    destroySpirit(s2, "p1", own.instanceId)
    assert(
        !s2.players.p1.field.spirits.some((x) => x.instanceId === own.instanceId),
        "自分のターンでは復活しない（turn:\"opponent\" 限定は残る）",
    )
}

console.log("すべてのチェックに合格しました 🎉（part325）")
