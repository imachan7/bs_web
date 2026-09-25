// 効果の**流れ**を決めるだけのアクション（何かを破壊したりコアを動かしたりはしない）。
// いまは「〜する。**または**、〜する」の分岐だけが入っている。
import type { ActionHandler, ActionRegistry } from "./types"
import type { EffectDef } from "../../type"
import { createInstance, draw, fieldInstanceIdsOf, getCard, log, minLevelCores, opponentOf, pushResumeFrames, resolveInOrder } from "../GameState"
import { attachBrave, recordTimed, findSpiritAny, fireNexusDeployed, fireOwnBurstActivated, fireSummonSequence, finishBurstActivation, placeBurst, requestChoice, resistanceAgainst, resolveAction, resolveTensho, tryInteractiveCardChoice } from "../EffectModules"
import { burstConditionMet } from "../triggers"
import { toAttackPhase } from "../PhaseManager"
import { effectiveCost, magicEffectiveColors } from "../../../../shared/cost"
import { braveCombineCandidates } from "../../../../shared/summon"
import { effectiveBp, iceWallColorsOf, spiritHasKeyword } from "../../../../shared/rules"
import { COLOR_LABELS } from "../../../../data/constants"

// 効果文の「AするB。または、CするD。」。使用者がモードを1つ選び、その actions を順に解決する
// （SD01-033 ヴィクトリーファイア）。
//
// 選択肢は**常に全部出す**：ここに並ぶのは「〜することで」ではない普通の効果なので、
// 対象が足りなくても発揮でき、いる分だけ解決する（2026-08-16 ユーザー確認）。
// 「成立するモードだけ出す」にすると、モードごとに成立判定を書く必要が生まれるうえ、
// 実対戦では「1体しかいないがネクサスは壊したくない」のような選び方もできなくなる。
//
// interactiveTargets が無い（テスト・自動解決）ときは modes の先頭を選ぶ決定的簡略化。
// requestChoice の kind:"option" は候補1件でも自動選択しないため、
// 非対話の分岐はここで明示的に書く必要がある
const chooseActionModeHandler: ActionHandler<"chooseActionMode"> = (ctx, action) => {
    const { state, owner, self, sourceName, srcColors, srcType, chosenOption } = ctx
        if (action.modes.length === 0) return
        const runMode = (index: number): void => {
            const mode = action.modes[index]
            if (!mode) return
            log(state, `${sourceName}：「${mode.label}」を選んだ。`)
            // 選択待ちに入ったら**残りを再開スタックへ積む**（resolveInOrder が面倒を見る）。
            // 積まずに break していたため、モードの後半が永久に失われていた
            // （ヴィクトリーファイアで「スピリット1体とネクサス1つ」を選ぶと、
            // スピリットの対象選択で中断してネクサスが壊れなかった。2026-08-17）
            resolveInOrder(state, mode.actions, {
                resolve: (a) => ctx.resolve(a, { sourceColors: srcColors, sourceType: srcType }),
                frame: (a) => ({
                    kind: "action" as const,
                    selfInstanceId: self ? self.instanceId : null,
                    action: a,
                    actorPid: owner,
                    ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
                    ...(srcType !== undefined ? { sourceType: srcType } : {}),
                }),
            })
        }
        // 選択の再入：選ばれたラベルからモードを引く
        if (chosenOption !== undefined) {
            const index = action.modes.findIndex((m) => m.label === chosenOption)
            runMode(index === -1 ? 0 : index)
            return
        }
        if (!state.interactiveTargets || action.modes.length === 1) {
            runMode(0)
            return
        }
        requestChoice(
            state,
            owner,
            `${sourceName}：どちらの効果にしますか`,
            [],
            false,
            action,
            self,
            "option",
            action.modes.map((m) => m.label),
        )
        return
}

// 効果文の「Aする。その後、Bする。」。chooseActionModeの選択部分を外し、常にactionsを順番どおり
// 全部解決する（BS14-100ストームアタック）
const sequenceHandler: ActionHandler<"sequence"> = (ctx, action) => {
    const { state, owner, self, srcColors, srcType } = ctx
        resolveInOrder(state, action.actions, {
            resolve: (a) => ctx.resolve(a, { sourceColors: srcColors, sourceType: srcType }),
            frame: (a) => ({
                kind: "action" as const,
                selfInstanceId: self ? self.instanceId : null,
                action: a,
                actorPid: owner,
                ...(srcColors !== undefined ? { sourceColors: srcColors } : {}),
                ...(srcType !== undefined ? { sourceType: srcType } : {}),
            }),
        })
        return
}

// 器AK：発生源の持ち主から見た相手がいま自分のメインステップにいるなら、強制的にアタックステップへ進める
// （PhaseManager.toAttackPhase。相手がメインステップにいなければ何もしない＝BS13-067光導く巨塔Lv2）。
// who:"turnPlayer"（BS13-046/071青バッチ）は誰のターンかを問わず、メインステップにいれば終了させる
// （「お互い、マジックの効果を使用したとき」＝自分がマジックを使っても自分のメインステップが終わる）
const forceEndMainStepHandler: ActionHandler<"forceEndMainStep"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    if (state.phase !== "main") return
    if ((action.who ?? "opponent") === "opponent") {
        const opp = opponentOf(owner)
        if (state.turnPlayer !== opp) return
        log(state, `${sourceName}：${state.players[opp].name}のメインステップを終了させた。`)
    } else {
        log(state, `${sourceName}：${state.players[state.turnPlayer].name}のメインステップを終了させた。`)
    }
    toAttackPhase(state)
}

// バースト専用（docs/design/BURST.md）：発動中のバーストのカード自身をコストを支払わずに召喚する。
// スピリット/ネクサスのみ（マジックには書かない。validate:cardsが検査する）。
// **バースト発動の確認応答は self=null で解決される**ため、対象カードは state.players[owner].burst
// から読む（burst は承認された時点でもまだ非公開のまま残っている＝この関数がここで空にする）
const summonBurstCardFreeHandler: ActionHandler<"summonBurstCardFree"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.burst
    if (cardId === null) {
        log(state, `${sourceName}：発動中のバーストが見つからなかった。`)
        return
    }
    const card = getCard(cardId)
    if (card.type === "nexus") {
        player.burst = null
        player.burstSet = false
        const inst = createInstance(cardId, state.turn, 0)
        player.field.nexuses.push(inst)
        log(state, `${player.name}はバーストとして${card.name}を配置した。`)
        fireNexusDeployed(state, owner, inst)
        return
    }
    if (card.type !== "spirit" && card.type !== "brave") {
        log(state, `${sourceName}：このカードは召喚できない。`)
        return
    }
    // BS16-058サテライド・バード：このターンの間、お互い、バースト効果でスピリットを召喚できない。
    // バーストの発動自体は止めず、召喚だけ不発にしてトラッシュへ送る（ブレイヴは対象外）
    if (card.type === "spirit" && state.turnConstraints.some((c) => c.type === "noBurstSpiritSummonThisTurn")) {
        player.burst = null
        player.burstSet = false
        player.trashCards.push(cardId)
        log(state, `${sourceName}：このターンの間バースト効果でスピリットを召喚できないため、${card.name}をトラッシュへ置いた。`)
        return
    }
    // 器BS16（P069/P070）：ブレイヴカードのバースト召喚は、合体条件を満たすホストが自分のフィールドに
    // いれば**直接合体するように**召喚する（ダイレクトブレイヴ＝維持コア0。summonFreeFromHandIndexの
    // braveTargetInstanceId経路と同じ考え方）。候補が無ければ通常どおりスピリット状態で召喚する。
    // 候補が複数あっても選択UIは設けず先頭を自動選択する（バーストは確認1回で完結させる簡略化）
    const combineHostId =
        card.type === "brave" ? braveCombineCandidates(state, owner, cardId)[0] : undefined
    const maintain = combineHostId !== undefined ? 0 : minLevelCores(card)
    // payCost（BS15-004ハンゾウ・シノビ・ドラゴン）：通常の召喚コストも支払う（効果文に「コストを支払わずに」が
    // 無いカード）。バースト確認では paySources を渡せないため、支払い元はリザーブのみ（決定的簡略化）
    const cost = action.payCost ? effectiveCost(state, owner, card) : 0
    if (player.reserve < maintain + cost) {
        log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
        return
    }
    player.burst = null
    player.burstSet = false
    player.reserve -= maintain + cost
    player.trashCores += cost
    const inst = createInstance(cardId, state.turn, maintain)
    const combineHost = combineHostId !== undefined ? findSpiritAny(state, combineHostId)?.inst : undefined
    if (combineHost !== undefined) {
        attachBrave(state, owner, combineHost, inst)
    } else {
        player.field.spirits.push(inst)
    }
    log(
        state,
        `${player.name}はバーストとして${combineHost !== undefined ? `${getCard(combineHost.cardId).name}に合体させて` : ""}${card.name}を` +
            (action.payCost ? `コスト${cost}を支払って召喚した。` : "召喚した。"),
    )
    if (!state.winner) resolveTensho(state, owner, inst)
    if (!state.winner) fireSummonSequence(state, owner, inst)
}

// バースト専用（BS14-X01龍の覇王ジーク・ヤマト・フリード）：条件（あれば）を満たすときだけ破壊を解決し、
// その後**条件の成否によらず必ず**このカード自身をコストを支払わずに召喚する（summonBurstCardFreeへ委譲）。
// 破壊が復活確認等で中断したら、召喚をresumeStackへ積んで再開後に続ける（COST_MODEL.mdの「その後」＝
// 前段の発揮の有無を問わず後段は実行する。CONJUNCTION.md「この効果発揮後」）
const burstDestroyThenSummonSelfHandler: ActionHandler<"burstDestroyThenSummonSelf"> = (ctx, action) => {
    const { state, owner } = ctx
    const conditionMet = action.condition === undefined || state.players[owner].life <= action.condition.ownLifeAtMost
    if (conditionMet) {
        ctx.resolve({ type: "destroy", count: 1, ...(action.filter ? { filter: action.filter } : {}) })
        if (state.pendingChoice) {
            pushResumeFrames(state, [
                { kind: "action", selfInstanceId: null, actorPid: owner, action: { type: "summonBurstCardFree" } },
            ])
            return
        }
    }
    ctx.resolve({ type: "summonBurstCardFree" })
}

// バースト専用（BS14-X03風の覇王ドルクス・ウシワカ）：自分のフィールド/リザーブ/トラッシュのコア合計が
// coresAtLeast以上のときだけ、このカード自身をコストを支払わずに召喚する（summonBurstCardFreeへ委譲）。
// 満たさないときは何もしない（burst.conditionと違い、この1ステップだけがゲートされる。sequenceの後段に混ぜて使う）
const summonBurstCardFreeIfCoresAtLeastHandler: ActionHandler<"summonBurstCardFreeIfCoresAtLeast"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const fieldCores =
        player.field.spirits.reduce((n, i) => n + i.cores, 0) +
        player.field.nexuses.reduce((n, i) => n + i.cores, 0) +
        player.field.combinedBraves.reduce((n, i) => n + i.cores, 0)
    const total = fieldCores + player.reserve + player.trashCores
    if (total < action.coresAtLeast) {
        log(state, `${sourceName}：コア合計が${action.coresAtLeast}個未満のため召喚しなかった。`)
        return
    }
    ctx.resolve({ type: "summonBurstCardFree" })
}

// 器BS16（BS16-018太骨望）：このバースト発動時に破壊された自分のスピリットの色にactionの色が
// 含まれるときだけ、このカード自身をコストを支払わずに召喚する（summonBurstCardFreeIfCoresAtLeastの同型）
const summonBurstCardFreeIfDestroyedColorHandler: ActionHandler<"summonBurstCardFreeIfDestroyedColor"> = (ctx, action) => {
    const { state, sourceName } = ctx
    if (!(state.burstEventColors ?? []).includes(action.color)) {
        log(state, `${sourceName}：条件を満たさなかったため召喚しなかった。`)
        return
    }
    ctx.resolve({ type: "summonBurstCardFree" })
}

// 器BS16（BS16-X01爆炎の覇王ロード・ドラゴン・バゼル）：自分のバースト1つをオープンし、
// 条件が【相手の『このスピリット/ブレイヴの召喚時』発揮後】なら強制発動、それ以外はデッキの下へ戻す
const openOwnBurstActivateIfSummonCondHandler: ActionHandler<"openOwnBurstActivateIfSummonCond"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.burst
    if (cardId === null) {
        log(state, `${sourceName}：セットしているバーストがなかった。`)
        return
    }
    const card = getCard(cardId)
    const effect = card.effects.find((e): e is Extract<EffectDef, { kind: "burst" }> => e.kind === "burst")
    log(state, `${player.name}は${sourceName}の効果でバーストの${card.name}をオープンした。`)
    if (!effect || effect.event !== "opponentSummonEffectResolved") {
        player.burst = null
        player.burstSet = false
        player.deck.push(cardId)
        log(state, `${card.name}は発動条件を満たさないため、デッキの下に戻った。`)
        return
    }
    const actionToRun = burstConditionMet(state, owner, effect.condition) ? effect.action : { type: "noop" as const }
    const before = fieldInstanceIdsOf(state, owner)
    state.resolvingBurstPid = owner
    resolveAction(state, owner, null, actionToRun, undefined, magicEffectiveColors(state, owner, card), card.type, undefined, undefined, cardId)
    delete state.resolvingBurstPid
    finishBurstActivation(state, owner, cardId, actionToRun.type, effect.thenPay, effect.returnSelfToHandAfter ? { toHand: true } : undefined)
    if (state.pendingChoice || state.winner) return
    fireOwnBurstActivated(state, owner, before, cardId)
}

// バースト専用：自分の手札にあるバースト効果（kind:"burst"）を持つカード1枚をセットする。
// setBurst（GameAction）と異なりターン1回制限を受けない
// バースト専用（BS14-064レボルシング・ゼヨン）：自分のフィールドのネクサス数がnexusAtLeast以上のときだけ、
// このカード自身をコストを支払わずに召喚する（summonBurstCardFreeIfCoresAtLeastのネクサス数版）
const summonBurstCardFreeIfOwnNexusAtLeastHandler: ActionHandler<"summonBurstCardFreeIfOwnNexusAtLeast"> = (ctx, action) => {
    const { state, owner, sourceName } = ctx
    if (state.players[owner].field.nexuses.length < action.nexusAtLeast) {
        log(state, `${sourceName}：自分のネクサスが${action.nexusAtLeast}つ未満のため召喚しなかった。`)
        return
    }
    ctx.resolve({ type: "summonBurstCardFree" })
}

// バースト専用（BS15-X01刀の覇王ムサシード・アシュライガー）：fireFieldEventTriggersが渡すイベント対象
// （event:"anySpiritAttacked"の場合はアタックしたスピリット。targetInstanceId経由）の実効BPがminBp以上のときだけ、
// このカード自身をコストを支払わずに召喚する（summonBurstCardFreeへ委譲）。召喚できたら、新しく場に出た個体を
// before/after差分で特定し、thenBuffSelf指定時はこのターンの間BP+する
const burstSummonSelfIfTargetBpAtLeastHandler: ActionHandler<"burstSummonSelfIfTargetBpAtLeast"> = (ctx, action) => {
    const { state, owner, sourceName, targetInstanceId } = ctx
    const target = targetInstanceId
        ? (findSpiritAny(state, targetInstanceId) ?? undefined)
        : undefined
    if (!target || effectiveBp(state, target.pid, target.inst) < action.minBp) {
        log(state, `${sourceName}：条件を満たさなかったため発動しなかった。`)
        return
    }
    const before = new Set(state.players[owner].field.spirits.map((s) => s.instanceId))
    ctx.resolve({ type: "summonBurstCardFree" })
    if (state.winner) return
    const newInst = state.players[owner].field.spirits.find((s) => !before.has(s.instanceId))
    if (newInst && action.thenBuffSelf) {
        newInst.tempBpBuff += action.thenBuffSelf
        log(state, `${getCard(newInst.cardId).name}はBP+${action.thenBuffSelf}（ターン終了時まで）。`)
    }
}

const setBurstFromHandHandler: ActionHandler<"setBurstFromHand"> = (ctx) => {
    const { state, owner, self, sourceName, chosenCardIndex } = ctx
    const player = state.players[owner]
    if (chosenCardIndex !== undefined) {
        const cardId = player.hand[chosenCardIndex]
        if (cardId === undefined) {
            log(state, `${sourceName}：対象がいなかった。`)
            return
        }
        player.hand.splice(chosenCardIndex, 1)
        placeBurst(state, owner, cardId)
        return
    }
    const candidates = player.hand
        .map((cardId, i) => ({ cardId, i }))
        .filter(({ cardId }) => getCard(cardId).effects.some((e) => e.kind === "burst"))
    if (candidates.length === 0) {
        log(state, `${sourceName}：セットできるバースト持ちのカードが手札になかった。`)
        return
    }
    if (
        tryInteractiveCardChoice(
            state,
            owner,
            self,
            `${sourceName}：セットするバーストを選んでください`,
            "hand",
            candidates.map((c) => c.i),
            { type: "setBurstFromHand" },
            null,
        )
    ) {
        return
    }
    // 非対話：コスト最大の1枚（決定的簡略化）
    let best = candidates[0]!
    for (const c of candidates) {
        if (getCard(c.cardId).cost > getCard(best.cardId).cost) best = c
    }
    player.hand.splice(best.i, 1)
    placeBurst(state, owner, best.cardId)
}


// BS14-053オリンピアの天使ハギト：自分のバースト1つをオープンできる。マジックカードなら手札に戻し、
// それ以外は破棄する（burstがnullなら不発。バーストの中身は非公開ゾーンなので選択の余地はない）
const revealOwnBurstThenSortByTypeHandler: ActionHandler<"revealOwnBurstThenSortByType"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const player = state.players[owner]
    const cardId = player.burst
    if (cardId === null) {
        log(state, `${sourceName}：発動中のバーストが見つからなかった。`)
        return
    }
    player.burst = null
    player.burstSet = false
    const card = getCard(cardId)
    if (card.type === "magic") {
        player.hand.push(cardId)
        log(state, `${player.name}はバーストの${card.name}をオープンし、手札に戻した。`)
    } else {
        player.trashCards.push(cardId)
        log(state, `${player.name}はバーストの${card.name}をオープンし、トラッシュへ破棄した。`)
    }
}

// BS16-X04魁の覇王ミブロック・ブレイヴァー【合体時】Lv2･Lv3：「相手の手札が増えたとき、相手のバースト1つを破棄する」。
// fieldEvent event:"opponentHandAdded"と組み合わせて使う。セットしていなければno-op
const discardOpponentBurstHandler: ActionHandler<"discardOpponentBurst"> = (ctx) => {
    const { state, owner, sourceName } = ctx
    const opp = opponentOf(owner)
    const player = state.players[opp]
    const cardId = player.burst
    if (cardId === null) {
        log(state, `${sourceName}：${player.name}はバーストをセットしていなかった。`)
        return
    }
    player.burst = null
    player.burstSet = false
    player.trashCards.push(cardId)
    log(state, `${sourceName}：${player.name}のバーストを破棄した。`)
}

// BS16-079ムーンボウクロークのメイン効果：【氷壁】を持つ自分のスピリット1体を指定し、このターンの間、
// そのスピリットが持つ【氷壁】と同じ色の相手のスピリットからブロックされないようにする。
// 色は指定した時点のiceWallColorsOfを固定値として保存する（後で【氷壁】が無効化されても保持。Q25026〜Q25028）
const markUnblockableByIceWallColorThisTurnHandler: ActionHandler<"markUnblockableByIceWallColorThisTurn"> = (ctx) => {
    const { state, owner, self, sourceName, targetInstanceId } = ctx
    const candidates = state.players[owner].field.spirits.filter((inst) => spiritHasKeyword(state, owner, inst, "hyoheki"))
    if (candidates.length === 0) {
        log(state, `${sourceName}：【氷壁】を持つ自分のスピリットがいなかった。`)
        return
    }
    if (targetInstanceId === undefined && state.interactiveTargets && candidates.length >= 2) {
        requestChoice(
            state,
            owner,
            `${sourceName}：指定するスピリットを選んでください`,
            candidates.map((s) => s.instanceId),
            false,
            { type: "markUnblockableByIceWallColorThisTurn" },
            self,
        )
        return
    }
    const chosen = targetInstanceId !== undefined ? candidates.find((s) => s.instanceId === targetInstanceId) : candidates[0]
    if (!chosen) {
        log(state, `${sourceName}：指定されたスピリットは条件を満たさなかった。`)
        return
    }
    const colors = iceWallColorsOf(state, owner, chosen)
    if (colors.length === 0) {
        log(state, `${sourceName}：${getCard(chosen.cardId).name}は【氷壁】の色を持たなかった。`)
        return
    }
    // 色は指定した時点の【氷壁】の色で固定する（あとで【氷壁】が無効になっても保つ）
    recordTimed(state, { content: [{ type: "unblockable", from: { colorAny: colors } }], target: { kind: "instance", instanceId: chosen.instanceId }, until: "turn", ownerPid: owner })
    log(
        state,
        `${sourceName}：${getCard(chosen.cardId).name}は、このターンの間${colors.map((c) => COLOR_LABELS[c]).join("/")}のスピリットにブロックされない。`,
    )
}

// BS08-055 竜騎集う円卓Lv2「系統：「龍帝」/「竜騎」を持つ自分のスピリットすべては、
// 相手のスピリットの効果の対象になるたび、自分の手札1枚を破棄することで、その効果を受けない」の**確認専用**。
//
// 耐性の判定（resistanceAgainst）は装甲と同じ**同期の述語**なので、その場では選択を挟めない。
// そこで「対象が確定してから適用するまで」の間に**先に守る側へ聞き**、答えを
// state.payNegateDecision に置いてから元のアクション（resume）を解決し直す。
// 破棄はこの時点で済ませるので、resistanceAgainst 側は答えを読むだけでよい。
//
// **スキップ＝効果を受ける**（resolveOnSkip で cardIndex なしでもここへ戻ってくる）。
const payNegateDecideHandler: ActionHandler<"payNegateDecide"> = (ctx, action) => {
    const { state, chosenCardIndex } = ctx
    const found = findSpiritAny(state, action.targetInstanceId)
    if (!found) {
        // 聞いている間に対象が場を離れた。払わせずに元の処理へ戻す（そちらが「対象がいない」を出す）
        ctx.resolve(action.resume, { targetInstanceId: action.targetInstanceId })
        return
    }
    const defender = state.players[found.pid]
    if (chosenCardIndex !== undefined && chosenCardIndex < defender.hand.length) {
        const discarded = defender.hand.splice(chosenCardIndex, 1)
        defender.trashCards.push(...discarded)
        const names = discarded.map((id) => getCard(id).name).join("、")
        log(
            state,
            `${action.sourceName}：${defender.name}は手札「${names}」を破棄し、${getCard(found.inst.cardId).name}は効果を受けなかった。`,
        )
        state.payNegateDecision = { targetInstanceId: action.targetInstanceId, paid: true }
    } else {
        state.payNegateDecision = { targetInstanceId: action.targetInstanceId, paid: false }
    }
    // **対象を明示的に渡し直す**（ctx.resolve は targetInstanceId を暗黙には引き継がない。
    // 渡さないと元のアクションが「対象指定なし」の経路に落ちて、別のスピリットを巻き込む）
    ctx.resolve(action.resume, { targetInstanceId: action.targetInstanceId })
    return
}

const handlers = {
    chooseActionMode: chooseActionModeHandler,
    sequence: sequenceHandler,
    forceEndMainStep: forceEndMainStepHandler,
    summonBurstCardFree: summonBurstCardFreeHandler,
    discardOpponentBurst: discardOpponentBurstHandler,
    markUnblockableByIceWallColorThisTurn: markUnblockableByIceWallColorThisTurnHandler,
    revealOwnBurstThenSortByType: revealOwnBurstThenSortByTypeHandler,
    burstDestroyThenSummonSelf: burstDestroyThenSummonSelfHandler,
    summonBurstCardFreeIfCoresAtLeast: summonBurstCardFreeIfCoresAtLeastHandler,
    summonBurstCardFreeIfDestroyedColor: summonBurstCardFreeIfDestroyedColorHandler,
    openOwnBurstActivateIfSummonCond: openOwnBurstActivateIfSummonCondHandler,
    summonBurstCardFreeIfOwnNexusAtLeast: summonBurstCardFreeIfOwnNexusAtLeastHandler,
    burstSummonSelfIfTargetBpAtLeast: burstSummonSelfIfTargetBpAtLeastHandler,
    setBurstFromHand: setBurstFromHandHandler,
    payNegateDecide: payNegateDecideHandler,
} satisfies Partial<ActionRegistry>

export default handlers
