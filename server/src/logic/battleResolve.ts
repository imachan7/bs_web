// ブロック成立後のバトル解決（BP比較・破壊・ライフ減少）と、中断されたバトル解決の再開
import type { DestroyContext, GameState, PlayerId, ResumeFrame } from "../type"
import { clearBattle, currentLevel, findSpirit, getCard, log, opponentOf, pushResumeFrames } from "./GameState"
import { destroyTargetsBatch } from "./removal"
import type { EffectAttempt } from "../../../shared/rules"
import { timedBattleContents, boardResistanceAgainst, instEffectsSuppressed, instIsCombined, lifeDamageLimit } from "../../../shared/rules"
import {
    activeConstraints,
    destroySpirit,
    effectActiveAtLevel,
    emitEvent,
    applyJugekiCoreToVoid,
    tryHandFreeSummonOnLifeDamaged,
    battleBp,
    bofuCountFor,
    fireBattleWonTriggers,
    fireFieldEventTriggers,
    fireTrigger,
    hasArmorAgainst,
    resistanceAgainst,
    findSpiritAny,
    hasJugekiOnBlockReplace,
    hasBofuOnBlock,
    hasKoboOnBlock,
    hasLifeDamageNegate,
    tryLifeDamageMillGuard,
    tryOwnLifeFloorByCost,
    instanceSymbolCount,
    instColors,
    resolveAction,
    resolveKoboOnBattleEnd,
} from "./EffectModules"
import { finishBlockDeclaration } from "./GameEngine"

// ライフで受けることを宣言した場でライフダメージを解決する（doTakeLifeから直接呼ばれる）。
// フラッシュ①中に盤面が変わりうるため（アタッカー破壊・BP変化・ライフダメージ無効の付与等）、
// 解決時点の状態を読む
export function resolveLifeDamage(state: GameState): void {
    if (!state.battle) return
    const attackerPid = state.turnPlayer
    const defenderPid = opponentOf(attackerPid)
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )
    const defender = state.players[defenderPid]

    // フラッシュ中にアタッカーが破壊された等で場を離れていたら、ライフダメージなしでバトル終了
    if (!attacker) {
        log(state, "アタッカーが場を離れたため、ライフダメージは発生しなかった。")
        clearBattle(state)
        return
    }

    // ライフが減る量の上限を**1回で求める**（shared/rules.lifeDamageLimit）。
    // 「減るか／減らないか」だった5つの門番（ダメージ打ち消し・コスト条件2種・BP条件・ターン上限）を
    // ここに集約してある。0 なら従来どおり「受けなかった」扱い（2026-08-16 ユーザー提案）
    const limit = lifeDamageLimit(state, defenderPid, attacker)
    // hasLifeDamageNegate だけは GameState 依存でまだ shared に移せていないので個別に見る
    if (limit.max === 0 || hasLifeDamageNegate(state, defenderPid, attackerPid, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }

    // BS07六花の司書長サーガ：ライフが減る直前にデッキを1枚破棄し、条件に合えばライフが減らない
    if (tryLifeDamageMillGuard(state, defenderPid, attacker)) {
        log(
            state,
            `${defender.name}は${getCard(attacker.cardId).name}のアタックによるライフダメージを受けなかった（効果）。`,
        )
        resolveKoboOnBattleEnd(state, attackerPid, attacker)
        clearBattle(state)
        return
    }

    // ダメージ = アタックスピリットのシンボル数（instanceSymbolCount。tempExtraSymbols＝ダブルハート等も加味）。
    // ライフのコアは通常リザーブへ、ただしアタッカーが lifeDamageToVoid をレベル有効で持つ場合はボイドへ（スライミーLv3）
    // ダメージはアタッカーのシンボル数。**上限があればそこで切り下げる**
    //（ブリザードウォール＝1しか減らない）。ライフの残りも超えられない
    const damage = Math.min(instanceSymbolCount(attacker), limit.max)
    const dealt = Math.min(damage, defender.life)
    attacker.lifeDealtThisTurn = (attacker.lifeDealtThisTurn ?? 0) + dealt
    const toVoid = activeConstraints(state, attackerPid, attacker).some((c) => c.type === "lifeDamageToVoid")
    defender.life -= dealt
    if (toVoid) {
        log(
            state,
            `${defender.name}はライフで受けた。ライフ-${dealt}（残り${defender.life}）。コアはボイドへ消えた。`,
        )
    } else {
        defender.reserve += dealt
        log(
            state,
            `${defender.name}はライフで受けた。ライフ-${dealt}（残り${defender.life}）`,
        )
    }
    if (dealt > 0) emitEvent(state, { type: "lifeDamage", pid: defenderPid, amount: dealt })
    // event:"ownLifeDamaged"のバースト用の器（080）：このバトルでライフを減らしたスピリットを記録する
    if (dealt > 0 && state.battle) (state.battle.lifeDamagers ??= []).push(attacker.instanceId)

    if (defender.life <= 0) {
        // BS14-084永久凍土の王都：ライフが0になる瞬間、任意コスト（このネクサスをトラッシュに置く）で0を回避できる
        if (tryOwnLifeFloorByCost(state, defenderPid)) {
            fireFieldEventTriggers(state, defenderPid, "ownLifeDamaged", undefined, undefined, attacker.instanceId)
            tryHandFreeSummonOnLifeDamaged(state, defenderPid)
        } else {
            state.winner = attackerPid
            log(state, `${state.players[attackerPid].name}の勝利！`)
        }
    } else if (dealt > 0) {
        // フィールドイベント誘発「相手によって自分のライフが減らされたとき」（命の果実）。
        // ライフ0で敗北が決まった場合は発火しない。targetInstanceIdにアタッカーを渡す
        // （BS08竜騎集う円卓：BP5000以下のアタックによって減らされたとき、そのスピリットを破壊する）
        fireFieldEventTriggers(state, defenderPid, "ownLifeDamaged", undefined, undefined, attacker.instanceId)
        // 手札のカード自身が持つ「ライフが減ったとき無償召喚できる」（BS08猫娘アニー）。
        // 場・トラッシュではなく**手札**が発生源なので、フィールド誘発の走査では拾えない
        tryHandFreeSummonOnLifeDamaged(state, defenderPid)
    }
    // トリガー誘発「このスピリットのアタックによって相手のライフを減らしたとき」（老賢樹トレントン）。
    // アタッカー側で発火。勝敗が決まっていても発火して問題ない（コア獲得のみのため）
    if (dealt > 0) {
        fireTrigger(state, attackerPid, attacker, "onLifeDealt")
        // フィールドイベント誘発「自分のスピリットのアタックによって相手のライフを減らしたとき」
        // （BS06-X22魔界七将ベルゼビート）。selfにはライフを減らしたスピリット（アタッカー）を渡す
        if (!state.winner) {
            fireFieldEventTriggers(
                state,
                attackerPid,
                "ownSpiritDealtLife",
                { pid: attackerPid, inst: attacker },
                instColors(attacker),
            )
        }
    }

    resolveKoboOnBattleEnd(state, attackerPid, attacker)
    clearBattle(state)
}

// 指定アタック（canDirectAttack）で指定された相手スピリットを、正規のブロック宣言として
// 自動的に成立させる。validateBlock/doBlock を経由しないため**疲労状態でもブロックさせられる**
// （2026-09-06 ユーザー確認：指定された側は疲労のままブロック宣言する）。
// 指定先が場を離れた／耐性を得た／アタッカーが効果を失った場合は何もしない＝**通常のアタックに戻る**
// （このあと防御側の block/takeLife 待ちに落ちる。アタック宣言後のフラッシュタイミングは消さない）
export function resolveDirectedBlock(state: GameState): void {
    if (!state.battle) return
    const id = state.battle.directedTargetInstanceId
    delete state.battle.directedTargetInstanceId
    const defenderPid = opponentOf(state.turnPlayer)
    const attacker = findSpirit(state.players[state.turnPlayer], state.battle.attackerInstanceId)
    const target = id !== undefined ? findSpirit(state.players[defenderPid], id) : undefined
    // アタッカーが場を離れた／指定アタックの効果そのものを失った場合も通常のアタックに戻る
    // （2026-09-04 ユーザー確認。BS12-008 は Lv1-3 すべてで発揮するのでレベル低下は見なくてよい）
    const resisted =
        target && attacker
            ? boardResistanceAgainst(state, defenderPid, target, {
                  actorPid: state.turnPlayer,
                  op: "other",
                  scope: "targeted",
                  sourceType: "spirit",
                  sourceColors: instColors(attacker),
              })
            : null
    if (target && attacker && !instEffectsSuppressed(attacker) && !resisted) {
        finishBlockDeclaration(state, defenderPid, id!)
    }
    // アタッカーの『このスピリットのバトル時』は、指定アタックでは**ブロックが確定したこの時点**で
    // 発揮する（アタック宣言の時点ではまだ相手が決まっていないため。BS11-X02 滅神星龍ダークヴルム・ノヴァの
    // 「相手の合体スピリットとバトルしたとき」がブロッカーを見る）。通常のアタックでは doAttack の中で
    // 発揮するので、二重には発揮しない
    if (!state.winner && state.battle && attacker) {
        fireTrigger(state, state.turnPlayer, attacker, "onBattleStart")
    }
}

// ブロック成立後のバトル解決：BP比較で敗者を破壊（同値は相打ち）
export function resolveBattle(state: GameState): void {
    if (!state.battle) return
    const attackerPid = state.turnPlayer
    const defenderPid = opponentOf(attackerPid)
    const attacker = findSpirit(
        state.players[attackerPid],
        state.battle.attackerInstanceId,
    )
    const blocker = state.battle.blockerInstanceId
        ? findSpirit(state.players[defenderPid], state.battle.blockerInstanceId)
        : undefined

    if (!attacker || !blocker) {
        clearBattle(state)
        return
    }

    // 直前のバトル解決の記録をリセット（魔界七将デストロード：coreGain countCounter "lastBattleDestroyedCores"）
    state.lastBattleDestroyedCores = 0
    // 直前のバトル解決の記録をリセット（魔界伯爵ヴィール：exhaust の filter.sameLevelAsBattleLoser）
    state.lastBattleDestroyedLevel = 0
    // 「BPを比べ相手のスピリットだけを破壊した」ときの破壊された側の色・系統
    // （TargetFilter.sameColorAsBattleLoser / sameFamilyAsBattleLoser。ドヴェルグ／ニーベルングリング）
    state.lastBattleDestroyedColors = []
    delete state.lastBattleDestroyedInstanceId
    state.lastBattleDestroyedFamilies = []
    state.lastBattleDestroyedBp = 0
    state.lastBattleDestroyedCost = 0

    // ブロッカーの疲労（と「ブロックしても疲労しない」の判定）はブロック宣言時に済んでいる（exhaustDeclaredBlocker）
    const attackerColors = instColors(attacker)
    // 【暴風】を『このスピリットのブロック時』へ差し替える継続付与（BS07大風車の丘Lv2）。
    // 本来は「アタックしてブロックされたとき」だが、これがある間はブロックした側が発揮する。
    // 疲労させられるのはアタッカー側で、既に疲労しているアタッカー自身は除く（excludeTarget）
    if (hasBofuOnBlock(state, defenderPid)) {
        const count = bofuCountFor(state, defenderPid, blocker)
        if (count > 0) {
            resolveAction(
                state,
                defenderPid,
                blocker,
                { type: "exhaust", count, chooserIsTarget: true, excludeTarget: true },
                attacker.instanceId,
            )
        }
    }
    // 疲労誘発でアタッカー／ブロッカーが消滅したらバトルは成立しない（BS05藍紫の虚空Lv1のような
    // 「疲労したときコアを置く」効果は、ブロックの疲労でも発火してその場で消滅させうる）
    if (state.winner) return
    if (
        !findSpirit(state.players[attackerPid], attacker.instanceId) ||
        !findSpirit(state.players[defenderPid], blocker.instanceId)
    ) {
        clearBattle(state)
        return
    }
    // BS09-044妖精の姫巫女ハマ・ドリュアス：ブロッカーがLv1なら、**BPを比べずに**
    // 「ブロックされなかった」ものとして扱う（＝ライフに通る。どちらも破壊されず、
    // ブロッカーは疲労したまま場に残る。BS09_PLAN.md §4。2026-08-14 ユーザー確認）
    if (state.battle.treatAsUnblockedIfBlockerLevel1 && currentLevel(blocker).level === 1) {
        log(
            state,
            `${getCard(blocker.cardId).name}はLv1のため、BPを比べずブロックされなかったものとして扱う。`,
        )
        resolveLifeDamage(state)
        return
    }
    // SD02-016 ウィングブーツ：アタッカーのLvがブロッカーのLv以上なら同じ扱い（判定だけが違う一般化版）
    if (
        state.battle.treatAsUnblockedIfLevelAtLeastBlocker &&
        currentLevel(attacker).level >= currentLevel(blocker).level
    ) {
        log(
            state,
            `${getCard(attacker.cardId).name}は${getCard(blocker.cardId).name}と同じLv以上のため、BPを比べずブロックされなかったものとして扱う。`,
        )
        resolveLifeDamage(state)
        return
    }
    // BS15-045虚獣帝スフィン・クロス：action:"unblockedByVoidSelfCore" がonBlocked時に立てる印
    if (state.battle.treatAsUnblockedByCost) {
        log(state, `${getCard(attacker.cardId).name}：BPを比べずブロックされなかったものとして扱う。`)
        resolveLifeDamage(state)
        return
    }
    // 果て無き地平線Lv1：バトルのBP比較のときだけ、Lv1スピリットがLv2BPを使う（battleBp が差分を足す）
    const attackerBp = battleBp(state, attackerPid, attacker)
    const blockerBp = battleBp(state, defenderPid, blocker)
    // バトルによる破壊コンテキストに載せる「破壊した側（勝者）」のレベル（子供部屋 午前0時の
    // byBattleKillerLevel判定用）。命名はattackerColorと同じく歴史的なもので、実際は勝者側の値
    const attackerLevel = currentLevel(attacker).level
    const blockerLevel = currentLevel(blocker).level

    log(
        state,
        `${getCard(blocker.cardId).name}（BP${blockerBp}）が${getCard(attacker.cardId).name}（BP${attackerBp}）をブロック！`,
    )

    // エンジェルボイス：バトル解決時、BPの代わりにLvを比較する（Lvが低い方が破壊される。同Lvは相打ち）
    const battleContents = timedBattleContents(state)
    const compareBy = (by: "level" | "cores" | "cost") => battleContents.some((c) => c.type === "compareBy" && c.by === by)
    const compareByLevel = compareBy("level")
    if (compareByLevel) {
        log(state, "バトル解決：BPの代わりにLvを比較する。")
    }
    // イマジンフィールド：バトル解決時、BPの代わりにコアの数を比較する（コアが少ない方が破壊される。同数は相打ち）
    const compareByCores = compareBy("cores")
    if (compareByCores) {
        log(state, "バトル解決：BPの代わりにコアの数を比較する。")
    }
    // ノックアウト：バトル解決時、BPの代わりにコストを比較する（コストが低い方が破壊される。同コストは相打ち）
    const compareByCost = compareBy("cost")
    if (compareByCost) {
        log(state, "バトル解決：BPの代わりにコストを比較する。")
    }
    const attackerValue = compareByLevel
        ? currentLevel(attacker).level
        : compareByCores
          ? attacker.cores
          : compareByCost
            ? getCard(attacker.cardId).cost
            : attackerBp
    const blockerValue = compareByLevel
        ? currentLevel(blocker).level
        : compareByCores
          ? blocker.cores
          : compareByCost
            ? getCard(blocker.cardId).cost
            : blockerBp

    // ＞５：BP比較で勝敗（＝どちらが破壊されるか）が確定する。
    // 以後の＞６（破壊処理）で「フィールドに残る」が使われても、この判定は覆らない
    // （docs/design/TIMING_CHART.md §2。『BPを比べ相手のスピリットだけを破壊したとき』は
    // 敗者が生き残っても発揮する）
    // 器AV：BS13-082ペガサスフラップ「BPを比べずにバトルを終了させる」。BP比較自体を飛ばし、
    // どちらも破壊されない（勝敗が付かない＝onBattleWin/onBattleLose/fireBattleWonTriggersも発火しない）
    const rawOutcome: BattleOutcome = state.battle.skipBpCompare
        ? "none"
        : attackerValue > blockerValue
            ? "attackerWins"
            : attackerValue < blockerValue
              ? "blockerWins"
              : "mutual"
    // invertBattleWinner（P070カオティック・リクゴー）＝勝敗を反転し、値が高い方を破壊する
    // （同値の相打ちはそのまま。BPそのものではなくcompareBy*の代替比較にも同じく効く）
    const outcome: BattleOutcome =
        battleContents.some((c) => c.type === "invertBattleWinner") && (rawOutcome === "attackerWins" || rawOutcome === "blockerWins")
            ? rawOutcome === "attackerWins"
                ? "blockerWins"
                : "attackerWins"
            : rawOutcome
    if (state.battle.skipBpCompare) {
        log(state, "バトル解決：BPを比べずにバトルを終了させる。")
    }
    if (outcome === "attackerWins") {
        // BPを比べ相手のスピリットだけを破壊：破壊直前のブロッカーのコア数・Lvを記録（魔界七将デストロードLv2／魔界伯爵ヴィールLv3）
        state.lastBattleDestroyedCores = blocker.cores
        state.lastBattleDestroyedInstanceId = blocker.instanceId
        state.lastBattleDestroyedLevel = blockerLevel
        state.lastBattleDestroyedColors = instColors(blocker)
        state.lastBattleDestroyedFamilies = [...getCard(blocker.cardId).family]
        // 破壊直前の実効BP（TargetFilter.sameBpAsBattleLoser。BS03熾烈極める最前線Lv2）
        state.lastBattleDestroyedBp = blockerBp
        // 破壊直前のコスト（mill の countCounter:"lastBattleDestroyedCost" が読む。BS06名誉ある御前試合）
        state.lastBattleDestroyedCost = getCard(blocker.cardId).cost
    } else if (outcome === "blockerWins") {
        // 破壊直前のアタッカーのコア数も同様に記録する（BS10ヘッジボルグ：role制限なしでattacker/blocker両方から発火する）
        state.lastBattleDestroyedCores = attacker.cores
        state.lastBattleDestroyedInstanceId = attacker.instanceId
        state.lastBattleDestroyedColors = instColors(attacker)
        state.lastBattleDestroyedFamilies = [...getCard(attacker.cardId).family]
        state.lastBattleDestroyedBp = attackerBp
        state.lastBattleDestroyedCost = getCard(attacker.cardId).cost
    }

    driveBattleResolution(state, {
        kind: "battleResolve",
        step: 1,
        attackerPid,
        attackerInstanceId: attacker.instanceId,
        blockerInstanceId: blocker.instanceId,
        outcome,
        attackerColors,
        blockerColors: instColors(blocker),
        attackerLevel,
        blockerLevel,
        attackerBp,
        blockerBp,
        // ＞６に入る直前の写し。破壊されると場から消えるが、『相手のスピリットに破壊されたとき』や
        // ログのカード名は破壊後にも参照する（destroySpirit と同じく、コア数は破壊直前の値）
        attackerSnapshot: { ...attacker, coresAtDestruction: attacker.cores },
        blockerSnapshot: { ...blocker, coresAtDestruction: blocker.cores },
    })
}

type BattleOutcome = "attackerWins" | "blockerWins" | "mutual" | "none"
type BattleResolveFrame = Extract<ResumeFrame, { kind: "battleResolve" }>

// バトル解決の最終ステップ番号（runBattleStep の switch と対応）
const BATTLE_LAST_STEP = 12

// ＞６（破壊処理）〜＞７（バトル終了宣言）を1ステップずつ進める。
// **1ステップ＝中断しうる呼び出し1つ**にしてあるので、選択待ちが立ったら
// 次のステップ番号を battleResolve フレームに載せて抜ければよい
// （続きは drainResumeStack が resumeBattleResolution 経由で回す）。
// docs/design/TIMING_CHART.md ／ docs/design/RESUME_STACK.md §7
function driveBattleResolution(state: GameState, frame: BattleResolveFrame): void {
    for (let step = frame.step; step <= BATTLE_LAST_STEP; step++) {
        runBattleStep(state, frame, step)
        if (state.pendingChoice) {
            pushResumeFrames(state, [{ ...frame, step: step + 1 }])
            return
        }
    }
}

// 中断されていたバトル解決の続き（drainResumeStack から呼ぶ）
export function resumeBattleResolution(state: GameState, frame: BattleResolveFrame): void {
    driveBattleResolution(state, frame)
}

// 【呪撃】をそのレベルで静的に持つか（一時付与は見ない）
function staticJugeki(cardId: string, level: number): boolean {
    return getCard(cardId).effects.some(
        (e) => e.kind === "keyword" && e.keyword === "jugeki" && effectActiveAtLevel(e.levels, level),
    )
}

// バトル解決の1ステップ。**中断（pendingChoice）は呼び出し元 driveBattleResolution が見る**ので、
// ここでは元の解決順にある `!state.winner` ガードだけを保つ
function runBattleStep(state: GameState, f: BattleResolveFrame, step: number): void {
    const attackerPid = f.attackerPid
    const defenderPid = opponentOf(attackerPid)
    // 破壊された個体は場から消えるので、生存していれば実体を、していなければ写しを使う
    const attacker =
        findSpirit(state.players[attackerPid], f.attackerInstanceId) ?? f.attackerSnapshot
    const blocker = findSpirit(state.players[defenderPid], f.blockerInstanceId) ?? f.blockerSnapshot
    const attackerContext: DestroyContext = {
        sourcePid: attackerPid,
        sourceType: "spirit",
        battle: {
            attackerColors: f.attackerColors,
            attackerLevel: f.attackerLevel,
            attackerBp: f.attackerBp,
        },
    }
    const blockerContext: DestroyContext = {
        sourcePid: defenderPid,
        sourceType: "spirit",
        battle: {
            attackerColors: f.blockerColors,
            attackerLevel: f.blockerLevel,
            attackerBp: f.blockerBp,
        },
    }

    switch (step) {
        // ＞６：破壊処理。相打ちは**同時破壊**なので1つのバッチにまとめる
        // （復活の確認が2体に出るなら、バッチがターンプレイヤーに順番を聞く。TIMING_CHART.md §0-3）。
        // 破壊元は対象ごとに違う（ブロッカーを破壊したのはアタッカー、その逆も同様）ため context も対象ごとに渡す
        case 1: {
            if (f.outcome === "none") return
            if (f.outcome === "attackerWins") {
                destroyTargetsBatch(state, attackerPid, [
                    { pid: defenderPid, instanceId: f.blockerInstanceId, context: attackerContext },
                ])
            } else if (f.outcome === "blockerWins") {
                destroyTargetsBatch(state, defenderPid, [
                    { pid: attackerPid, instanceId: f.attackerInstanceId, context: blockerContext },
                ])
            } else {
                destroyTargetsBatch(state, attackerPid, [
                    { pid: defenderPid, instanceId: f.blockerInstanceId, context: attackerContext },
                    { pid: attackerPid, instanceId: f.attackerInstanceId, context: blockerContext },
                ])
            }
            return
        }
        // 『このスピリットのバトル時』相手のスピリットに破壊されたとき（敗北側）。
        // destroySpirit（＝onDestroy誘発）の後に発火し、相打ちでは発火しない
        case 2: {
            if (state.winner) return
            if (f.outcome === "attackerWins") fireTrigger(state, defenderPid, blocker, "onBattleLose")
            else if (f.outcome === "blockerWins") fireTrigger(state, attackerPid, attacker, "onBattleLose")
            return
        }
        // 勝利側の『このスピリットのバトル時』（相打ちでは発火しない）
        case 3: {
            if (state.winner) return
            if (f.outcome === "attackerWins") {
                fireTrigger(state, attackerPid, attacker, "onBattleWin", "attacker")
            } else if (f.outcome === "blockerWins") {
                fireTrigger(state, defenderPid, blocker, "onBattleWin", "blocker")
            }
            return
        }
        // 勝利側フィールドのネクサス等による『BPを比べ相手のスピリットだけを破壊したとき』
        case 4: {
            if (state.winner) return
            if (f.outcome === "attackerWins") {
                fireBattleWonTriggers(state, attackerPid, attacker, "attacker")
            } else if (f.outcome === "blockerWins") {
                fireBattleWonTriggers(state, defenderPid, blocker, "blocker")
            }
            return
        }
        // ＞７：【呪撃】。アタッカーが現レベルで持つなら、ブロッカーが（BP比較の結果に関わらず）
        // まだフィールドにいる場合にバトル終了時に破壊する。ブロッカー側の呪撃は発動しない。
        // アタッカー自身がBP比較で破壊されていても発動する。
        // ＞６で「フィールドに残る」を使って生き残った個体もここでは対象になる（TIMING_CHART.md §2）
        case 5: {
            // BS06カウンターカース：【呪撃】の発揮タイミングを『ブロック時』へ**差し替える**。
            // 差し替えが効いている側はアタック時に発揮しなくなり、代わりにブロック時に発揮する
            const attackerJugekiReplaced = hasJugekiOnBlockReplace(state, attackerPid)
            if (!staticJugeki(attacker.cardId, f.attackerLevel) || attackerJugekiReplaced) return
            const stillOnField = findSpirit(state.players[defenderPid], f.blockerInstanceId)
            if (!stillOnField) return
            if (hasArmorAgainst(state, stillOnField, f.attackerColors)) {
                log(state, `${getCard(blocker.cardId).name}は装甲によって【呪撃】を防いだ。`)
                return
            }
            log(
                state,
                `${getCard(attacker.cardId).name}の【呪撃】：${getCard(blocker.cardId).name}を破壊した。`,
            )
            // 魔影街Lv1：破壊の直前に、そのスピリット上のコアをボイドへ（リザーブに戻らなくなる）
            applyJugekiCoreToVoid(state, attackerPid, defenderPid, stillOnField)
            destroyTargetsBatch(state, attackerPid, [
                {
                    pid: defenderPid,
                    instanceId: f.blockerInstanceId,
                    context: {
                        sourcePid: attackerPid,
                        sourceType: "spirit",
                        battle: { attackerColors: f.attackerColors, attackerLevel: f.attackerLevel },
                    },
                },
            ])
            return
        }
        // BS06カウンターカース：差し替えが効いている側では、**ブロッカー**の【呪撃】が
        // バトルした相手（＝アタッカー）をバトル終了時に破壊する
        case 6: {
            if (!hasJugekiOnBlockReplace(state, defenderPid)) return
            if (!staticJugeki(blocker.cardId, f.blockerLevel)) return
            const attackerStill = findSpirit(state.players[attackerPid], f.attackerInstanceId)
            if (!attackerStill) return
            if (hasArmorAgainst(state, attackerStill, f.blockerColors)) {
                log(state, `${getCard(attacker.cardId).name}は装甲によって【呪撃】を防いだ。`)
                return
            }
            log(
                state,
                `${getCard(blocker.cardId).name}の【呪撃】（ブロック時）：${getCard(attacker.cardId).name}を破壊した。`,
            )
            applyJugekiCoreToVoid(state, defenderPid, attackerPid, attackerStill)
            destroyTargetsBatch(state, defenderPid, [
                {
                    pid: attackerPid,
                    instanceId: f.attackerInstanceId,
                    context: {
                        sourcePid: defenderPid,
                        sourceType: "spirit",
                        battle: { attackerColors: f.blockerColors, attackerLevel: f.blockerLevel },
                    },
                },
            ])
            return
        }
        // ＞７：「バトル終了後に破壊する」の予約（BattleState.endBattleDestroy）。
        // 【呪撃】と同じ＞７に置く（2026-08-16 ユーザー確認。BS01-104 千本槍の古戦場Lv2）。
        // 破壊は destroyTargetsBatch へまとめて渡す（1体ずつ復活の確認で中断しうるが、
        // バッチ自身が再開フレームを持つので途中の予約が落ちない）。
        // 発生源が既に場を離れていても予約は消えない（発揮はコストを払った時点で成立している）ので、
        // 装甲・効果耐性の判定には予約時に控えた色と種別を使う
        case 7: {
            const reservations = state.battle?.endBattleDestroy ?? []
            if (reservations.length === 0) return
            // 予約は一度きり。ここで消してから解決する（同じステップに戻ってきても二重に破壊しない）
            if (state.battle) delete state.battle.endBattleDestroy
            const batch: { pid: PlayerId; instanceId: string; context?: DestroyContext }[] = []
            for (const entry of reservations) {
                const found = findSpiritAny(state, entry.targetInstanceId)
                if (!found) continue
                const attempt: EffectAttempt = {
                    op: "destroy",
                    scope: "targeted",
                    actorPid: entry.sourcePid,
                    sourceType: "nexus",
                    sourceColors: entry.sourceColors,
                }
                const resisted = resistanceAgainst(state, found.pid, found.inst, attempt)
                if (resisted) {
                    log(
                        state,
                        `${getCard(found.inst.cardId).name}はバトル終了後の破壊を受けなかった（${resisted.label}）。`,
                    )
                    continue
                }
                batch.push({
                    pid: found.pid,
                    instanceId: found.inst.instanceId,
                    context: {
                        sourcePid: entry.sourcePid,
                        sourceType: "nexus",
                        sourceColors: entry.sourceColors,
                    },
                })
            }
            if (batch.length > 0) destroyTargetsBatch(state, attackerPid, batch)
            return
        }
        // onBattleEnd 誘発：バトル参加者（アタッカー・ブロッカー）のうち、まだフィールドに
        // 生存している個体それぞれに発火する（コリスタル：ブロックされても生き残れば自壊する）
        case 8: {
            const survivingAttacker = findSpirit(state.players[attackerPid], f.attackerInstanceId)
            if (survivingAttacker) {
                fireTrigger(state, attackerPid, survivingAttacker, "onBattleEnd", "attacker", f.blockerInstanceId)
                // fieldEvent "ownCombinedSpiritBattleEnded"：ネクサス等から見る誘発なので、
                // バトル参加者にしか発火しないonBattleEndとは別に呼ぶ必要がある（BS10-086巨星望む大樹Lv2）
                if (instIsCombined(survivingAttacker)) {
                    fireFieldEventTriggers(
                        state,
                        attackerPid,
                        "ownCombinedSpiritBattleEnded",
                        { pid: attackerPid, inst: survivingAttacker },
                        instColors(survivingAttacker),
                        survivingAttacker.instanceId,
                    )
                }
                // 器BS16：destroyAtBattleEnd（BS16-075スケープゴート）
                if (!state.winner && survivingAttacker.destroyAtBattleEnd && findSpirit(state.players[attackerPid], survivingAttacker.instanceId)) {
                    destroySpirit(state, attackerPid, survivingAttacker.instanceId)
                }
            }
            return
        }
        case 9: {
            if (state.winner) return
            const survivingBlocker = findSpirit(state.players[defenderPid], f.blockerInstanceId)
            if (survivingBlocker) {
                fireTrigger(state, defenderPid, survivingBlocker, "onBattleEnd", "blocker", f.attackerInstanceId)
                if (instIsCombined(survivingBlocker)) {
                    fireFieldEventTriggers(
                        state,
                        defenderPid,
                        "ownCombinedSpiritBattleEnded",
                        { pid: defenderPid, inst: survivingBlocker },
                        instColors(survivingBlocker),
                        survivingBlocker.instanceId,
                    )
                }
                // 器BS16：destroyAtBattleEnd（BS16-075スケープゴート）
                if (!state.winner && survivingBlocker.destroyAtBattleEnd && findSpirit(state.players[defenderPid], survivingBlocker.instanceId)) {
                    destroySpirit(state, defenderPid, survivingBlocker.instanceId)
                }
            }
            return
        }
        case 10: {
            resolveKoboOnBattleEnd(state, attackerPid, attacker)
            return
        }
        // 星降る巡礼地Lv2：自分のスピリットの【光芒】は『ブロック時』にも発揮される。
        // ブロッカー側の使用マジックを、ブロッカーの持ち主基準でもう一度解決する
        case 11: {
            if (hasKoboOnBlock(state, defenderPid)) {
                resolveKoboOnBattleEnd(state, defenderPid, blocker)
            }
            return
        }
        case 12: {
            clearBattle(state)
            return
        }
    }
}
