import type { CardInstance, CardType, PendingChoice, EffectDef, GameState, PlayerId } from "../../type"
import { createInstance, currentLevel, getCard, log, opponentOf, suspend } from "../GameState"
import { returnSpiritToDeckBottom, spiritMillFreeSummonOrConfirm } from "../removal"
import { fireFieldEventTriggers, fireNexusDeployed, resolveMagicEffects } from "../triggers"
import { effectActiveAtLevel, effectSources, hasGlobalConstraint, isEndStepLocked, timedPlayerRules } from "../../../../shared/rules"
import { exhaustSpirit } from "../state/exhaust"
import { lifeCostBlockedByFloor, recordPlayerRule, resolveAction } from "../EffectModules"

// globalConstraint "millCap"（BS05エターナルシールド）：pid自身のeffectSources（フィールド＋
// このターンの仮想発生源。lendSelfThisTurnで貸与可）を走査し、レベル有効な millCap のうち
// 最も厳しい（小さい）maxCountを返す（無ければInfinity）。ownNexusIndestructibleと同じく
// 発生源の持ち主のみに効く制約のため、両陣営を見るhasGlobalConstraintとは別の専用判定にしている
export function millCapFor(state: GameState, pid: PlayerId): number {
    let cap = Infinity
    const sources = effectSources(state, pid)
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            // mutualは器AM専用の別集計（mutualMillCapRemainingFor）へ。既存の4行アンカーは崩さない
            if (effect.kind === "globalConstraint" && effect.constraint.type === "millCap" && effect.constraint.mutual) continue
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            cap = Math.min(cap, effect.constraint.maxCount)
        }
    }
    // BS15共通器：bothSides指定のエントリは、pidの相手フィールドにあってもpid自身のデッキを守る
    // （BS15-069太陰の宮廷：「お互いのデッキは、相手の…効果では」。mutualと違い、あくまで
    // 「相手の効果によるミル」だけが対象＝呼び出し元のbyOpponentゲートは従来どおり）
    for (const source of effectSources(state, opponentOf(pid))) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap" || effect.constraint.bothSides !== true) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            cap = Math.min(cap, effect.constraint.maxCount)
        }
    }
    return cap
}

// 器AM：globalConstraint "millCap" の mutual:true 版（BS13-026キグナ・スワンMk-II）。
// 通常のmillCapFor/millCapPerTurnRemainingと違い**両陣営のeffectSourcesを走査**し（発生源がどちらの
// フィールドにあってもお互いのデッキを守るため）、**発生源の持ち主自身の効果によるミルも含めて**
// state.millCountThisTurnMutualで累計管理する。戻り値はpidのデッキがこのミルで破棄されてよい残り枚数
export function mutualMillCapRemainingFor(state: GameState, pid: PlayerId): number {
    let remaining = Infinity
    const usedSoFar = state.millCountThisTurnMutual[pid] ?? 0
    for (const scanPid of ["p1", "p2"] as PlayerId[]) {
        for (const source of effectSources(state, scanPid)) {
            const level = currentLevel(source).level
            for (const effect of getCard(source.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "millCap" || !effect.constraint.mutual) continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                remaining = Math.min(remaining, effect.constraint.maxCount - usedSoFar)
            }
        }
    }
    return Math.max(remaining, 0)
}

// globalConstraint "millCap" の perTurn:true 版（BS04侵されざる聖域Lv2）：pidのデッキが
// 相手の効果によって「このターンあと何枚まで」破棄可能かを返す（state.millCountThisTurnで累計管理。
// 無ければInfinity）。millCapForは1回のミル呼び出しあたりの上限（perTurn省略時）を返す既存の判定で、
// 両者は独立に適用する（perTurn:trueのエントリはmillCapForの対象にもなるため、1回のミルでも
// ターン上限を超える枚数は自動的に制限される）
export function millCapPerTurnRemaining(state: GameState, pid: PlayerId): number {
    let remaining = Infinity
    const usedSoFar = state.millCountThisTurn[pid] ?? 0
    const sources = effectSources(state, pid)
    for (const source of sources) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap") continue
            if (!effect.constraint.perTurn) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            remaining = Math.min(remaining, effect.constraint.maxCount - usedSoFar)
        }
    }
    // BS15共通器：millCapForのbothSidesと同じ考え方（BS15-069太陰の宮廷）
    for (const source of effectSources(state, opponentOf(pid))) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "millCap" || effect.constraint.bothSides !== true) continue
            if (!effect.constraint.perTurn) continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            remaining = Math.min(remaining, effect.constraint.maxCount - usedSoFar)
        }
    }
    return Math.max(remaining, 0)
}

// 【粉砕】: デッキ上から count 枚を持ち主のトラッシュへ送る（不足時はある分だけ）。
// デッキが0枚になっても敗北にはしない（敗北は既存どおりドロー不能時のみ、drawで判定）。
// actorPid（このミルを引き起こした実行者）を渡すと、actorPid !== pid（相手の効果による）のときのみ
// millCapFor(pid) の上限で count をクランプする（BS05エターナルシールド。自分自身のミル＝粉砕を
// 自分のデッキに向ける等では上限を適用しない。省略時は従来どおり上限なし）。
// 戻り値は実際に破棄した枚数（ownFunsaiMilledの発火判定・repeatPerCountに使う）
export function millDeck(
    state: GameState,
    pid: PlayerId,
    count: number,
    actorPid?: PlayerId,
    cause?: { sourceType?: CardType; funsai?: true },
    // skipNegate: kind:"deckMillNegate" の確認で「無効にしない」が選ばれたあとの破棄。
    // 再び確認待ちへ積んで無限に確認を出すのを防ぐ（destroySpirit の skipRevive と同型）
    options?: { skipNegate?: true },
): number {
    // 「お互い、デッキは破棄されず」（BS10-108 ルナティックシール）。**自分の効果によるものも止める**
    if (isEndStepLocked(state, "deckMill")) {
        log(state, `${state.players[pid].name}のデッキは、効果により破棄されなかった。`)
        return 0
    }
    // 「お互い、メインステップでデッキは破棄されない」（BS14-085賛美するパイプオルガン）。陣営を問わず止める
    if (state.phase === "main" && hasGlobalConstraint(state, "noDeckMillInMain")) {
        log(state, `${state.players[pid].name}のデッキは、メインステップのため破棄されなかった。`)
        return 0
    }
    // 器BS16：「このターンの間、自分のデッキは破棄されない」（**自分の効果も含め**）。
    // noDeckMillByOpponentForPid と違い byOpponent を問わず止める（BS16-002パイルドラコ）
    if (timedPlayerRules(state, pid).some((c) => c.type === "noDeckMillForPid")) {
        log(state, `${state.players[pid].name}のデッキは、このターンの間破棄されない。`)
        return 0
    }
    let effectiveCount = count
    const byOpponent = actorPid !== undefined && actorPid !== pid
    // 「自分のデッキは破棄されない」（BS06ディスコンティニュー／BS08鳳翼の聖剣）。
    // millCap と同じく**相手の効果による破棄だけ**を止める（自分のコスト支払い等は通す）
    if (byOpponent && isDeckMillBlocked(state, pid)) {
        log(state, `${state.players[pid].name}のデッキは破棄されなかった。`)
        return 0
    }
    // 「コストを払って破棄を無効に**できる**」（BS08鳳翼の聖剣Lv2）。
    // 任意コストなので、ここでは破棄を見送って確認待ちへ積むだけにする（実際の破棄は断られたときに行う）
    if (byOpponent && !options?.skipNegate && trySuspendDeckMillNegate(state, pid, count, actorPid, cause)) {
        return 0
    }
    if (byOpponent) {
        effectiveCount = Math.min(effectiveCount, millCapFor(state, pid))
        // ターン累計の上限（BS04侵されざる聖域Lv2：ターンに5枚まで）
        effectiveCount = Math.min(effectiveCount, millCapPerTurnRemaining(state, pid))
    }
    // 器AM：mutual指定のmillCapは、byOpponentを問わず（自分の効果によるミルも含めて）常に適用する
    // （BS13-026キグナ・スワンMk-II：「お互いのデッキは〜ターンに3枚までしか破棄されない」）
    effectiveCount = Math.min(effectiveCount, mutualMillCapRemainingFor(state, pid))
    const player = state.players[pid]
    const plannedCount = Math.min(effectiveCount, player.deck.length)
    const milled: string[] = []
    for (let i = 0; i < plannedCount; i++) {
        const cardId = player.deck.shift()
        if (cardId === undefined) break
        player.trashCards.push(cardId)
        milled.push(cardId)
        // 器BS16：then:"destroyMillSource"（BS16-002パイルドラコ）は**破棄された瞬間**に発揮し、
        // その回の破棄の残りを打ち切る。byOpponentのときだけ判定する（自分自身のミルでは発火しない）
        if (byOpponent) {
            const stops = getCard(cardId).effects.some(
                (e) =>
                    e.kind === "onMilledFromDeck" &&
                    e.then === "destroyMillSource" &&
                    (e.by !== "opponentSpiritEffect" || cause?.sourceType === "spirit"),
            )
            if (stops) break
        }
    }
    const actual = milled.length
    // mutual版の累計は誰が引き起こしたかを問わず加算する（既存millCountThisTurnはbyOpponent限定のまま別集計）
    if (actual > 0) {
        state.millCountThisTurnMutual[pid] = (state.millCountThisTurnMutual[pid] ?? 0) + actual
    }
    log(state, `${player.name}のデッキを上から${actual}枚トラッシュへ送った。`)
    if (actorPid !== undefined && actorPid !== pid && actual > 0) {
        state.millCountThisTurn[pid] = (state.millCountThisTurn[pid] ?? 0) + actual
    }
    // 「相手のデッキを一度に◯枚以上破棄したとき」（アリゲイド）：破棄された側の相手のフィールドから発火する。
    // eventCount には実破棄枚数を渡し、minEventCount で閾値判定する
    if (actual > 0 && !state.winner) {
        fireFieldEventTriggers(state, opponentOf(pid), "opponentDeckMilled", undefined, undefined, undefined, actual)
    }
    // 破棄されたカード自身の『デッキから破棄されたとき』（kind:"onMilledFromDeck"）。
    // 上のフィールド誘発の**後**に処理する（破棄そのものは先に確定させる）
    if (byOpponent && milled.length > 0 && !state.winner) {
        resolveMilledFromDeck(state, pid, milled, cause)
        // 破棄されたマジックを手元へ（BS06混迷する魔法実験場Lv2）。
        // カード自身の効果（onMilledFromDeck）の方が優先なので、その解決の**後**に残りを拾う
        collectMilledMagicToTegamoto(state, pid, milled)
    }
    return actual
}

// kind:"milledMagicToTegamoto"（BS06混迷する魔法実験場Lv2）：破棄されたマジックカードを
// トラッシュから手元(tegamoto)へ移し、手札同様に使用できるものとして記録する
export function collectMilledMagicToTegamoto(state: GameState, pid: PlayerId, milled: string[]): void {
    const active = effectSources(state, pid).some((source) =>
        getCard(source.cardId).effects.some(
            (e) =>
                e.kind === "milledMagicToTegamoto" &&
                effectActiveAtLevel(e.levels, currentLevel(source).level),
        ),
    )
    if (!active) return
    const player = state.players[pid]
    const moved: string[] = []
    for (const cardId of milled) {
        if (getCard(cardId).type !== "magic") continue
        const idx = player.trashCards.lastIndexOf(cardId)
        if (idx === -1) continue // onMilledFromDeck が先に取り除いたカード
        player.trashCards.splice(idx, 1)
        player.tegamoto.push(cardId)
        player.tegamotoPlayable.push(cardId)
        moved.push(getCard(cardId).name)
    }
    if (moved.length > 0) {
        log(
            state,
            `${player.name}は、破棄されたマジックカード${moved.length}枚（${moved.join("、")}）をオープンして手元に置いた。`,
        )
    }
}

// 「自分のデッキは破棄されない」（globalConstraint "noDeckMillByOpponent"）が pid に対して有効か。
// millCapFor と同じく **pid 自身のフィールド（＋このターンの仮想発生源）** だけを見る
export function isDeckMillBlocked(state: GameState, pid: PlayerId): boolean {
    // 器AR：ターン限定版（BS13-034ミノガメン。無償召喚したときだけ付く）
    if (timedPlayerRules(state, pid).some((c) => c.type === "noDeckMillByOpponentForPid")) return true
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "noDeckMillByOpponent") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // 「このネクサスが配置されたターンの間」（BS08鳳翼の聖剣）
            if (effect.constraint.whileSourceDeployedTurnOnly && source.summonedTurn !== state.turn) continue
            return true
        }
    }
    return false
}

// kind:"deckMillNegate"（BS08鳳翼の聖剣Lv2）：この破棄を無効にできる発生源を探す。
// 見つかったら [発生源, エントリ] を返す。**支払えないなら候補にしない**（確認を出しても意味がないため）
export function findDeckMillNegate(
    state: GameState,
    pid: PlayerId,
    cause?: { sourceType?: CardType; funsai?: true },
): { source: CardInstance; effect: Extract<EffectDef, { kind: "deckMillNegate" }> } | null {
    for (const source of effectSources(state, pid)) {
        const level = currentLevel(source).level
        for (const effect of getCard(source.cardId).effects) {
            if (effect.kind !== "deckMillNegate") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // 「相手の**スピリット**の効果で」。種別が渡っていない呼び出しでは、
            // onMilledFromDeck と同じく限定を緩めない側に倒して発火させない
            if (effect.by === "opponentSpiritEffect" && cause?.sourceType !== "spirit") continue
            // 見出しの『相手のターン』限定（BS15-028／030／042）。自分のターン中の破棄は無効にできない
            if (effect.turn === "opponent" && state.turnPlayer === pid) continue
            // 「【粉砕】以外の」（【粉砕】は resolveFunsai だけが cause.funsai を立てる）
            if (effect.exceptFunsai && cause?.funsai === true) continue
            if ("ownLifeToReserve" in effect.cost) {
                if (state.players[pid].life < effect.cost.ownLifeToReserve) continue
                if (lifeCostBlockedByFloor(state, pid, effect.cost.ownLifeToReserve)) continue
            } else {
                if (source.isRested) continue
            }
            return { source, effect }
        }
    }
    return null
}

// 破棄を見送って**その場で**確認を出す。出した（＝この破棄を保留した）なら true。
// 非対話（smoke）では確認を出せないので、その場で支払って無効にする（「〜できる」を常に発動する簡略化）。
//
// 以前は GameState.pendingDeckMillNegates へ積み、handleAction の末尾＝「安全な地点」で確認していた。
// 破棄の途中では中断できなかったためだが、再開スタックの導入でここから直接中断できるようになった
// （docs/design/RESUME_STACK.md §7）。millDeck の呼び出し8箇所はいずれも
// 「millDeck の後ろに処理が無い」か「返り値0でスキップされる」ので、呼び出し元の改修は要らない
export function trySuspendDeckMillNegate(
    state: GameState,
    pid: PlayerId,
    count: number,
    actorPid: PlayerId,
    cause?: { sourceType?: CardType; funsai?: true },
): boolean {
    if (count <= 0 || state.winner) return false
    // すでに別の選択待ちがあるならここでは中断できない。破棄を止めてしまうと
    // 「無効にできたのに聞かれないまま破棄されない」ことになるので、通常どおり破棄させる
    if (state.pendingChoice) return false
    const found = findDeckMillNegate(state, pid, cause)
    if (!found) return false
    // BS15共通器：thenReturnCauseToDeckBottom用。この破棄を起こした発生源インスタンスを、
    // 確認の再入をまたいで持ち回るため今のうちに控える（EFFECT_SOURCE_CONTEXT.md）
    const causingInstanceId = found.effect.thenReturnCauseToDeckBottom ? state.currentEffectSource?.instanceId : undefined
    if (!state.interactiveTargets) {
        payDeckMillNegateCost(state, pid, found.source, found.effect, causingInstanceId)
        return true
    }
    suspend(state, {
        pid,
        kind: "option",
        prompt:
            "ownLifeToReserve" in found.effect.cost
                ? `${getCard(found.source.cardId).name}：ライフのコア1個をリザーブに置いて、デッキの破棄を無効にしますか？`
                : `${getCard(found.source.cardId).name}：このスピリットを疲労させて、デッキの破棄を無効にしますか？`,
        candidates: [],
        options: ["無効にする"],
        optional: true,
        confirm: true,
        deckMillNegate: {
            pid,
            sourceInstanceId: found.source.instanceId,
            effectId: found.effect.id,
            count,
            actorPid,
            ...(cause?.sourceType ? { sourceType: cause.sourceType } : {}),
            ...(causingInstanceId !== undefined ? { causingInstanceId } : {}),
        },
        action: { type: "noop" },
        selfInstanceId: found.source.instanceId,
    })
    return true
}

// 無効化のコスト（ライフのコアN個を持ち主のリザーブへ）を支払い、無効になった旨をログに出す
export function payDeckMillNegateCost(
    state: GameState,
    pid: PlayerId,
    source: CardInstance,
    effect: Extract<EffectDef, { kind: "deckMillNegate" }>,
    causingInstanceId?: string,
): void {
    const player = state.players[pid]
    if ("ownLifeToReserve" in effect.cost) {
        const paid = effect.cost.ownLifeToReserve
        player.life -= paid
        player.reserve += paid
        log(
            state,
            `${getCard(source.cardId).name}：${player.name}はライフのコア${paid}個をリザーブに置き、デッキの破棄を無効にした。（残りライフ${player.life}）`,
        )
    } else {
        exhaustSpirit(state, pid, source)
        log(state, `${getCard(source.cardId).name}：${player.name}はこのスピリットを疲労させ、デッキの破棄を無効にした。`)
    }
    // BS15共通器：thenReturnCauseToDeckBottom（BS15-042オリンピアの天使アラトロンLv2）
    if (effect.thenReturnCauseToDeckBottom && causingInstanceId !== undefined) {
        const causePid = pid === "p1" ? "p2" : "p1"
        const cause = state.players[causePid].field.spirits.find((s) => s.instanceId === causingInstanceId)
        if (cause) {
            returnSpiritToDeckBottom(state, causePid, cause, getCard(source.cardId).name)
        } else {
            log(state, `${getCard(source.cardId).name}：破棄を起こしたスピリットは既に場にいなかった。`)
        }
    }
}

// 保留していた「デッキ破棄の無効化」の確認で、承認されたときの処理。
// 発生源が場を離れている／ライフが足りなくなっているなら無効にできないので、見送っていた破棄を行う
export function applyDeckMillNegate(
    state: GameState,
    entry: NonNullable<PendingChoice["deckMillNegate"]>,
): void {
    const source = effectSources(state, entry.pid).find((s) => s.instanceId === entry.sourceInstanceId)
    const effect = source
        ? getCard(source.cardId).effects.find(
              (e): e is Extract<EffectDef, { kind: "deckMillNegate" }> =>
                  e.kind === "deckMillNegate" && e.id === entry.effectId,
          )
        : undefined
    if (!source || !effect) {
        declineDeckMillNegate(state, entry)
        return
    }
    const canPay =
        "ownLifeToReserve" in effect.cost
            ? state.players[entry.pid].life >= effect.cost.ownLifeToReserve &&
              !lifeCostBlockedByFloor(state, entry.pid, effect.cost.ownLifeToReserve)
            : !source.isRested
    if (!canPay) {
        declineDeckMillNegate(state, entry)
        return
    }
    payDeckMillNegateCost(state, entry.pid, source, effect, entry.causingInstanceId)
}

// 同上、断られたときの処理。見送っていた破棄をここで行う（skipNegate で確認の再入を防ぐ）
export function declineDeckMillNegate(
    state: GameState,
    entry: NonNullable<PendingChoice["deckMillNegate"]>,
): void {
    millDeck(
        state,
        entry.pid,
        entry.count,
        entry.actorPid,
        entry.sourceType ? { sourceType: entry.sourceType } : undefined,
        { skipNegate: true },
    )
}

// 破棄されたカードのうち kind:"onMilledFromDeck" を持つものを解決する。
// 発火したカードは**トラッシュから取り除いてから**処理する（マジックは即時発揮、ネクサスは無償配置）
export function resolveMilledFromDeck(
    state: GameState,
    pid: PlayerId,
    milled: string[],
    cause?: { sourceType?: CardType },
): void {
    const player = state.players[pid]
    for (const cardId of milled) {
        for (const effect of getCard(cardId).effects) {
            if (effect.kind !== "onMilledFromDeck") continue
            // 「相手の**スピリット**の効果で」（BS08鳳翼の聖剣）は発生源の種別まで一致を要求する。
            // 種別が渡っていない呼び出しでは、限定を緩めない側に倒して発火させない
            if (effect.by === "opponentSpiritEffect" && cause?.sourceType !== "spirit") continue
            const idx = player.trashCards.lastIndexOf(cardId)
            if (idx === -1) continue
            // 器AR：summonThisSpiritFree（BS13-034）は「できる」＝任意なので、トラッシュに置いたまま
            // 確認（非対話は自動召喚）に回す。他の2つ（無条件）とは違いここではまだ取り除かない
            if (effect.then === "summonThisSpiritFree") {
                spiritMillFreeSummonOrConfirm(state, pid, idx)
                break
            }
            // 器BS16：destroyMillSource / voidOpponentLife はどちらも**カード自身は破棄されたまま
            // トラッシュに残る**（マジック/ネクサスのように場へ出ないため splice しない）
            if (effect.then === "destroyMillSource") {
                const causer = state.currentEffectSource
                const causerInst =
                    causer?.instanceId !== undefined
                        ? state.players[opponentOf(pid)].field.spirits.find((s) => s.instanceId === causer.instanceId)
                        : undefined
                if (causerInst) {
                    resolveAction(state, pid, null, { type: "destroy", count: 1 }, causerInst.instanceId, getCard(cardId).colors, "spirit")
                }
                if (effect.thenBlockAllDeckMillThisTurn) {
                    recordPlayerRule(state, pid, { type: "noDeckMillForPid" })
                }
                break
            }
            if (effect.then === "voidOpponentLife") {
                resolveAction(state, pid, null, { type: "lifeCrush", count: 1, dest: "void" }, undefined, getCard(cardId).colors, "spirit")
                break
            }
            player.trashCards.splice(idx, 1)
            const name = getCard(cardId).name
            if (effect.then === "deployThisNexusFree") {
                const inst = createInstance(cardId, state.turn, 0)
                player.field.nexuses.push(inst)
                log(state, `${player.name}の${name}は、デッキから破棄されたためコストを支払わずに配置された。`)
                fireNexusDeployed(state, pid, inst)
            } else {
                log(state, `${player.name}の${name}は、デッキから破棄されたためコストを支払わずに発揮された。`)
                // 破棄されたマジックは「使用」ではなく効果だけが発揮される。トラッシュへは既に入れてあるので、
                // resolveMagic を通さず効果本体だけを解決する（コスト・無効化・使用時誘発を挟まない）
                player.trashCards.push(cardId)
                resolveMagicEffects(state, pid, cardId, "flash", undefined)
            }
            break
        }
    }
}
