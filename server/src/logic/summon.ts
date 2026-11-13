// 召喚時の誘発の並び（fireSummonSequence）と、効果による手札・トラッシュからの無償召喚
import { takeFromTrash } from "./zones/trash"
import { trashCardEffectsDisabled, zoneSpiritEffectsDisabled } from "../../../shared/rules"
import { braveCombinableWithHost } from "../../../shared/summon"
import { noteCoverage } from "../../../shared/coverage"
import { countEffectCounter, getAllFamilies, hasSummonedExhaustGrant, payCost, spiritHasFamily } from "./EffectModules"
import { summonVoidToll } from "../../../shared/rules/summonToll"
import { refreshLevelAsOverrides } from "./state/continuous"
import type { CardData, CardInstance, EffectAction, GameState, PaySource, PlayerId } from "../type"
import { createInstance, findInstanceAnywhere, getCard, log, minLevelCores, opponentOf, pushResumeFrames, resolveInOrder, suspend } from "./GameState"
import { attachBrave } from "./brave"
import { summonDenial } from "./summonGate"
import { fireSummonTrigger } from "./triggers"
import { fireEventBursts } from "./EffectModules"
import type { CollectedTrigger } from "./blockDeclared"
import type { EventBurstCheck, ResumeFrame, SummonTail } from "../type"
import { entryActive } from "../../../shared/rules/effectStop"
import { bravesOf, currentLevel } from "../../../shared/rules"
import { fireFieldEventTriggers } from "./fieldEventTriggers"
import { effectiveCost } from "../../../shared/cost"
import { cardHasColor, handSummonCostPayable, hasKeyword, instColors, instIsVanilla, isOnFieldAnyZone, matchesCostFilter } from "../../../shared/rules"
import { resolveTensho } from "./keywords/tensho"
import { exhaustSpirit } from "./state/exhaust"
import { askSurchargePay, canPayFreeSummonSurcharge, payFreeSummonSurchargeKeeping, payVoidToll, surchargeOwed } from "./summonSurcharge"
import { askSummonCores, summonCoreOptions, summonPayPlan } from "./summonCores"

// 召喚が済んだ後にまとめて走る処理：『このスピリットの召喚時』効果 →「自分のスピリットが
// 召喚されたとき」のフィールド誘発 → 天使長ファニムの疲労付与、の順。
//
// **【転召】より後に呼ぶこと**（2026-08-13 修正）。以前は召喚時効果が転召より先に発揮されていた。
// 正しい順序は「召喚できるかの判定 → 転召の対象選択 → 対象の消滅 → 召喚 → 召喚時効果」。
// 転召の対象選択で中断した場合は、GameEngine が action:"summonSequence" として
// pendingChoice.queue に積み直すので、選択の解決後にここへ合流する
// トラッシュにあるカード自身の効果（kind:"trashSummonOnNameSummoned"）。
// いま召喚されたスピリットのカード名が nameIncludes を含むとき、そのカードを
// コストを支払わずに召喚できる（任意）。【不死】と同じく**トラッシュが発生源**なので、
// effectSources では拾えず、ここで持ち主のトラッシュを直接走査する（BS11-004 プロミネンスワイバーン）
function tryTrashSummonOnNameSummoned(state: GameState, pid: PlayerId, summoned: CardInstance): void {
    const player = state.players[pid]
    const summonedName = getCard(summoned.cardId).name
    for (let i = 0; i < player.trashCards.length; i++) {
        const cardId = player.trashCards[i]
        if (cardId === undefined) continue
        if (trashCardEffectsDisabled(state, cardId)) continue
        const card = getCard(cardId)
        const hit = card.effects.find(
            (e) => e.kind === "trashSummonOnNameSummoned" && summonedName.includes(e.nameIncludes),
        )
        if (!hit) continue
        noteCoverage(hit, "trashSummonOnNameSummoned")
        // 維持コアを払えないなら確認自体を出さない（【不死】と同じ方針）
        if (!canPayFreeSummonSurcharge(state, pid, card, minLevelCores(card))) continue
        if (state.interactiveTargets) {
            suspend(state, {
                pid,
                kind: "option",
                prompt: `トラッシュの${card.name}を、コストを支払わずに召喚しますか？`,
                candidates: [],
                options: ["召喚する"],
                optional: true,
                confirm: true,
                action: { type: "summonFreeFromTrashIndexInternal", trashIndex: i },
                selfInstanceId: null,
            })
            return
        }
        summonFreeFromTrashIndex(state, pid, card.name, i)
        return
    }
}

// トラッシュにあるカード自身の効果（kind:"trashReturnOnNameSummoned"）。条件を満たすカードはすべて手札に戻る
function returnTrashOnNameSummoned(state: GameState, pid: PlayerId, summoned: CardInstance): void {
    const player = state.players[pid]
    const summonedCard = getCard(summoned.cardId)
    if (summonedCard.type !== "spirit") return
    for (let i = player.trashCards.length - 1; i >= 0; i--) {
        const cardId = player.trashCards[i]
        if (cardId === undefined || trashCardEffectsDisabled(state, cardId)) continue
        const card = getCard(cardId)
        const hit = card.effects.find((e) => e.kind === "trashReturnOnNameSummoned" && summonedCard.name.includes(e.nameIncludes))
        if (!hit) continue
        noteCoverage(hit, "trashReturnOnNameSummoned")
        if (takeFromTrash(state, pid, i, "effect") === null) continue
        player.hand.push(cardId)
        log(state, `トラッシュの${card.name}は手札に戻った。`)
    }
}

// 効果で複数体を同時に召喚するあいだは、召喚時効果を後回しにする（RESUME_STACK §6.2）
export function startSummonBatch(state: GameState): void {
    if (state.summonBatch === undefined) state.summonBatch = []
}

// 全員を場に出し終えたら、それぞれの召喚時効果をターンプレイヤーが選んだ順に発揮する
export function flushSummonBatch(state: GameState, pid: PlayerId): void {
    const ids = state.summonBatch
    delete state.summonBatch
    if (!ids || ids.length === 0) return
    const cardIdOf = (id: string): string => findInstanceAnywhere(state, id)?.cardId ?? id
    resolveInOrder(state, ids, {
        skip: (id) => !isOnFieldAnyZone(state.players[pid], id),
        resolve: (id) => {
            const inst = findInstanceAnywhere(state, id)
            if (inst) fireSummonSequence(state, pid, inst)
        },
        frame: (id) => ({ kind: "action", selfInstanceId: id, actorPid: pid, action: { type: "summonSequence" } }),
        askOrder: { pid: state.turnPlayer, label: (id) => getCard(cardIdOf(id)).name, key: cardIdOf },
    })
}

export function fireSummonSequence(state: GameState, pid: PlayerId, inst: CardInstance, byFushi = false): void {
    if (state.winner) return
    if (state.summonBatch) {
        state.summonBatch.push(inst.instanceId)
        return
    }
    // **召喚時効果を解決する前に継続効果を組み直す**（2026-08-20 修正）。
    // refreshLevelAsOverrides は handleAction の事後フックでしか走らないため、
    // 召喚直後は「場に出たばかりの個体が自分に掛けている継続効果」がまだ反映されていない。
    // BS09-023要塞蟲ラルバをLv2で召喚すると『召喚時』「自分の白のスピリット2体」に
    // **自分自身が数えられない**（Lv2 の colorAs で白としても扱われるはずが未反映）。
    // ここに置けば doSummon・入れ替え召喚・効果による召喚の全経路が一度に揃う（この関数が唯一の合流点）。
    // refreshLevelAsOverrides は冒頭で継続分を delete して組み直す冪等な関数なので、重ねて呼んでも安全
    refreshLevelAsOverrides(state)
    const player = state.players[pid]
    // 転召でコアが尽きて消滅していれば、もう何もしない。
    // ⚠️ **ダイレクトブレイヴは field.combinedBraves に入る**ので、spirits だけを見ると
    // ここで打ち切られて『このブレイヴの召喚時』効果が丸ごと発火しない（2026-08-25 に実際に踏んだ）
    if (!isOnFieldAnyZone(player, inst.instanceId)) return
    // 召喚時と「召喚されたとき」は同時発揮の1つの列（TIMING_CHART §0-3。2026-11-05 ユーザー確認）。非対話では召喚時が先。
    // 召喚時の効果を書いていないカード（付与された召喚時だけを持つ場合も含む）は列に入れずに先に呼ぶ。入れると、誘発しない1件のせいで解決順を聞いてしまう
    const items: CollectedTrigger[] = []
    const level = currentLevel(inst).level
    const hasOwnSummonTrigger = inst.noOnSummon !== true && [inst, ...bravesOf(player, inst)].some((src) =>
        getCard(src.cardId).effects.some((e) => e.kind === "triggered" && e.trigger === "onSummon" && entryActive(state, pid, src, e, level)),
    )
    if (hasOwnSummonTrigger) {
        items.push({
            key: `${pid}:${inst.cardId}`,
            label: `${player.name}の${getCard(inst.cardId).name}`,
            frame: { kind: "action", selfInstanceId: inst.instanceId, actorPid: pid, action: { type: "summonSequence", triggerOnly: true, ...(byFushi ? { byFushi: true } : {}) } },
            run: () => fireSummonTrigger(state, pid, inst, byFushi),
        })
    } else if (inst.noOnSummon !== true) fireSummonTrigger(state, pid, inst, byFushi)
    const checks: EventBurstCheck[] = []
    // ⚠️ こちらは **spirits だけ**でよい：下で発火させる fieldEvent は
    // 「自分の**スピリット**が召喚されたとき」（BS08海底に眠りし古代都市など）なので、
    // 合体した状態で出たブレイヴは対象にならない（合体スピリットは既に場にいたものが状態を変えただけ）。
    // 単体でスピリットとして召喚されたブレイヴは field.spirits に入るので、そちらは対象になる
    const stillOnField = (): boolean => player.field.spirits.some((s) => s.instanceId === inst.instanceId)
    if (!state.winner && stillOnField()) {
        // 【不死】による召喚も「召喚」なのでこのイベントを起こす。byFushi は
        // 「【不死】の効果で召喚されたとき」（BS09-013ミミズクロ）を絞り込むためだけに渡す
        // eventColors に召喚されたスピリットの色を渡す（fieldEvent.colorFilter が
        // 「自分の**青の**スピリットが召喚されたとき」を絞れるようにする。BS09-002フタバニア）
        const summonedInfo = {
            families: getAllFamilies().filter((f) => spiritHasFamily(state, pid, inst, f)),
            // costFilter用：**カード静的なコスト（本来のコスト）**。軽減後の支払いコストではない（BS13-003カメレオプス）
            costs: [getCard(inst.cardId).cost],
            byFushi,
            // 【神速】による召喚か（doSummon が立てる。BS11-065 満天の牧草地Lv2）
            bySoku: state.summoningBySoku === true,
            // 《継召》での召喚か。keishoExcludedCardIds は手札からの通常召喚のたびに上書きされるので、手札からの召喚に限って読む
            byKeisho: state.summoningFromHand === true && (state.keishoExcludedCardIds?.length ?? 0) > 0,
            // 手札からの召喚か（doSummon / summonFreeFromHandIndex が立てる。BS11-X05 魔導双神ジェミナイズ）
            fromHand: state.summoningFromHand === true,
            paidCost: state.summoningPaid === true,
            // 召喚されたスピリットがバニラ（効果の記述を持たない）かどうか（BS10-080炎の結晶石Lv2）
            vanilla: instIsVanilla(inst),
            // 器AG：summonedSpiritAsTarget指定時に、召喚されたスピリット自身をactionTargetIdとして渡す
            // （selfMode:"source"と組み合わせ、self=発生源自身・target=召喚されたスピリットを両立させる。BS13-053モクバオー）
            sourceInstanceId: inst.instanceId,
        }
        // anySpiritSummoned は両陣営から見える版。subjectSide で主体の陣営を絞る（BS18-064）
        const events = [
            { pid, event: "ownSpiritSummoned" as const },
            { pid, event: "anySpiritSummoned" as const },
            { pid: opponentOf(pid), event: "anySpiritSummoned" as const },
        ]
        const colors = instColors(inst)
        for (const ev of events) {
            fireFieldEventTriggers(state, ev.pid, ev.event, { pid, inst }, colors, undefined, undefined, summonedInfo, undefined, undefined, undefined, undefined, items)
            checks.push({ pid: ev.pid, event: ev.event, subject: { pid, cardId: inst.cardId }, colors, info: summonedInfo })
        }
    }
    resolveInOrder(state, items, {
        skip: (i) => i.skip?.() === true,
        resolve: (i) => i.run(),
        frame: (i) => i.frame,
        askOrder: { pid: state.turnPlayer, label: (i) => i.label, key: (i) => i.key },
    })
    const tail: SummonTail = { stage: 0, paidCost: state.summoningPaid === true }
    delete state.summoningBySoku
    delete state.summoningFromHand
    delete state.summoningPaid
    if (state.winner) return
    const tailFrame = (t: SummonTail): ResumeFrame => ({ kind: "action", selfInstanceId: inst.instanceId, actorPid: pid, action: { type: "summonSequence", tail: t } })
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "eventBursts", checks }, tailFrame(tail)])
        return
    }
    fireEventBursts(state, checks)
    if (state.pendingChoice) {
        pushResumeFrames(state, [tailFrame(tail)])
        return
    }
    finishSummonSequence(state, pid, inst, tail)
}

// 召喚の後半。段ごとに進め、選択待ちが立ったら続きの段を積んで止まる（以前は止まらずに走り、選択の上書き・順序の逆転が起きた。#437 F5）
export function finishSummonSequence(state: GameState, pid: PlayerId, inst: CardInstance, tail: SummonTail): void {
    const player = state.players[pid]
    const stillOnField = (): boolean => player.field.spirits.some((s) => s.instanceId === inst.instanceId)
    const stages: (() => void)[] = [
        // 「anyBraveSummoned」（BS12-061剣の誕生地）：**両陣営**どちらかのブレイヴが召喚されたとき。
        // ownSpiritSummonedと違い、field.spirits（スピリット状態）だけでなくfield.combinedBraves
        // （ダイレクトブレイヴ）に入った場合も対象にするため isOnFieldAnyZone で判定する
        () => {
            if (!isOnFieldAnyZone(player, inst.instanceId) || getCard(inst.cardId).type !== "brave") return
            fireFieldEventTriggers(state, pid, "anyBraveSummoned", { pid, inst }, undefined, undefined, undefined, { paidCost: tail.paidCost })
        },
        () => {
            if (!isOnFieldAnyZone(player, inst.instanceId) || getCard(inst.cardId).type !== "brave") return
            fireFieldEventTriggers(state, opponentOf(pid), "anyBraveSummoned", { pid, inst }, undefined, undefined, undefined, { paidCost: tail.paidCost })
        },
        // トラッシュにあるカードの「〜が召喚されたとき、コストを支払わずに召喚できる」
        // （kind:"trashSummonOnNameSummoned"。BS11-004 プロミネンスワイバーン）
        () => {
            if (stillOnField()) tryTrashSummonOnNameSummoned(state, pid, inst)
        },
        () => returnTrashOnNameSummoned(state, pid, inst),
        // 天使長ファニム：召喚した側（pid）から見た相手が summonedExhaustGrant を持つ間、
        // 召喚されたこのスピリットは疲労する
        () => {
            if (stillOnField() && hasSummonedExhaustGrant(state, opponentOf(pid), inst)) exhaustSpirit(state, pid, inst, undefined, opponentOf(pid), "spirit")
        },
    ]
    for (let i = tail.stage; i < stages.length; i++) {
        if (state.winner) return
        stages[i]!()
        if (state.pendingChoice && i + 1 < stages.length) {
            pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, actorPid: pid, action: { type: "summonSequence", tail: { ...tail, stage: i + 1 } } }])
            return
        }
    }
}

export function summonFreeFromHandIndex(
    state: GameState,
    owner: PlayerId,
    sourceName: string,
    handIndex: number,
    skipTensho?: true,
    opts?: {
        payCost?: true
        paidAsIf?: number // payCost 併用：通常のコストのうち支払ったものとして扱う量（BS22-073）
        skipOnSummon?: true
        destroyAtBattleEnd?: true
        paySources?: PaySource[]
        surchargeBatch?: true // 複数体を同時に召喚する効果の1体（余分は1回だけ。summonSurcharge.ts）
        // 召喚経路の記録（CardInstance.summonedBy）。
        // summon{from:"hand"}アクションからは action.summonedBy ?? "freeEffect" が渡る（26系【Fチェンジ】は"fchange"）
        summonedBy?: string
        // 指定時は**ダイレクトブレイヴ**（doSummonのbraveTargetInstanceIdと同じ結果になるようにする。
        // 維持コアを置かない・field.combinedBravesへ入れる・host.braveRefsで参照する。BS10-096最後の優勝旗）
        braveTargetInstanceId?: string
        placeCores?: number // 置くコアの選択待ちで選ばれた数（summonCores.ts）
        costPaid?: true // payCost のコストは置くコアの待ちで払い済み
        reserveOnly?: true // payCost のコストと置くコアをリザーブだけで払う（BS12-075）
    },
): void {
    const player = state.players[owner]
    const cardId = player.hand[handIndex]
    if (cardId === undefined) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const denial = summonDenial(state, { pid: owner, cardId, from: "hand", cause: "effect", braveTargetInstanceId: opts?.braveTargetInstanceId })
    if (denial) {
        log(state, `${sourceName}：${denial}：${getCard(cardId).name}を召喚できなかった。`)
        return
    }
    const card = getCard(cardId)
    // ダイレクトブレイヴは**維持コアを置かない**（合体状態のLv1が0コア。doSummonと同じ規則）
    const maintain = opts?.braveTargetInstanceId !== undefined ? 0 : opts?.placeCores ?? minLevelCores(card)
    // payCost 指定時は**通常の召喚コストも**支払う（効果文に「コストを支払わずに」が無いカード。
    // BS08帝竜騎サイクル）。支払い元はリザーブに加えて**フィールドのコア**も使える
    // （paySources。通常の召喚と同じ。2026-08-23 まではリザーブのみの簡略化で、
    // 盤面のコアでなら払えるカードが候補にすら出なかった＝利用者報告）
    const fullCost = opts?.payCost ? Math.max(0, effectiveCost(state, owner, card) - (opts.paidAsIf ?? 0)) : 0
    const cost = opts?.costPaid ? 0 : fullCost
    const askCores = opts?.payCost === true && !opts.costPaid && opts.placeCores === undefined && opts.paySources === undefined && opts.braveTargetInstanceId === undefined && state.interactiveTargets
    const fromField = (opts?.paySources ?? []).reduce((sum, s) => sum + s.count, 0)
    // ボイドの通行料はリザーブからだけ払う（BS22-012）。払える見込みは通行料を引いたリザーブで見る
    const voidToll = opts?.payCost ? summonVoidToll(state, card) : 0 // 無償の経路は canPay…/payFree… が通行料も扱う
    let short = voidToll > player.reserve
    if (!short) {
        player.reserve -= voidToll
        short = askCores ? summonCoreOptions(state, owner, card, cost, opts?.reserveOnly === true).length === 0 : !summonPayable(state, owner, card, cost, maintain, 0, fromField, opts)
        player.reserve += voidToll
    }
    if (short) {
        log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
        return
    }
    // 余分の支払い元を選ばせる待ち。払ったあと同じ召喚を再開する（呼び出し側からは「召喚されなかった」ように見えるが、待ちが立っている）
    const resume = {
        type: "summonFreeIndexInternal" as const,
        zone: "hand" as const,
        index: handIndex,
        ...(skipTensho ? { skipTensho } : {}),
        ...(opts?.skipOnSummon ? { skipOnSummon: true as const } : {}),
        ...(opts?.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
        ...(opts?.summonedBy !== undefined ? { summonedBy: opts.summonedBy } : {}),
        ...(opts?.braveTargetInstanceId !== undefined ? { braveTargetInstanceId: opts.braveTargetInstanceId } : {}),
        ...(opts?.payCost ? { payCost: true as const, costPaid: true as const } : {}),
    }
    if (askCores && askSummonCores(state, owner, card, cost, resume, false, opts?.reserveOnly === true)) return
    if (!opts?.payCost && opts?.placeCores === undefined && opts?.braveTargetInstanceId === undefined && voidToll === 0) {
        const owed = surchargeOwed(state, owner, card, opts?.surchargeBatch === true)
        if (askSummonCores(state, owner, card, owed, resume, owed > 0)) return
    }
    if (!opts?.payCost && askSurchargePay(state, owner, card, opts?.surchargeBatch === true, maintain, resume)) return
    player.hand.splice(handIndex, 1)
    if (voidToll > 0) payVoidToll(state, owner, card)
    // フィールドのコアはコスト優先で充当し、余りを置くコアへ回す（payCost が面倒を見る。
    // 支払い元が維持コア割れしたらそこで消滅する）。無償のときは余分をここで払う
    const placedFromField = opts?.payCost ? payCost(state, owner, cost, opts.paySources ?? summonPayPlan(state, owner, cost + maintain, opts.reserveOnly === true)?.paySources, maintain) : payFreeSummonSurchargeKeeping(state, owner, card, opts?.surchargeBatch === true, maintain) ?? 0
    player.reserve -= maintain - placedFromField
    state.summoningFromHand = true // 効果による手札からの召喚（fieldEvent.fromHandOnly。BS11-X05）
    if (opts?.payCost) state.summoningPaid = true
    const inst = createInstance(cardId, state.turn, maintain, opts?.summonedBy)
    if (opts?.skipOnSummon) inst.noOnSummon = true
    if (opts?.destroyAtBattleEnd) inst.destroyAtBattleEnd = true
    // ダイレクトブレイヴ：field.spiritsではなくfield.combinedBravesへ入れ、ホストがbraveRefsで参照する
    // （placeSummonedSpiritの合体分岐と同じ処理。二重に書かずここへ寄せる）
    const braveHost =
        opts?.braveTargetInstanceId === undefined
            ? undefined
            : player.field.spirits.find((sp) => sp.instanceId === opts.braveTargetInstanceId)
    if (braveHost !== undefined) {
        attachBrave(state, owner, braveHost, inst)
    } else {
        player.field.spirits.push(inst)
    }
    const braveNote =
        braveHost !== undefined ? `${getCard(braveHost.cardId).name}に合体させて` : ""
    log(
        state,
        `${player.name}は${sourceName}の効果で、${braveNote}${card.name}を` +
            (opts?.payCost ? `コスト${fullCost}を支払って召喚した。` : "コストを支払わずに召喚した。") +
            (skipTensho ? "（【転召】させずに召喚した）" : ""),
    )
    // 【転召】は**コストを支払わない召喚でも必ず行う**（公式Q&A 2024-10-31：BS02ディバインウィンドで
    // 転召持ちを召喚しても転召は無視できない）。
    // skipTensho指定時のみ例外（BS08雷帝竜騎レイブリッツ／X002極龍帝ジーク・ソル・フリード：
    // 「【転召】させずに召喚できる」の明記あり）
    if (!state.winner && !skipTensho) resolveTensho(state, owner, inst, false, true)
    // ⚠️ **これも「召喚」なので、召喚時効果と「召喚されたとき」の誘発が発揮される**（2026-08-17 修正）。
    // 以前はどちらも呼ばず「召喚時効果は発揮されない」とログに出していたが、
    // 対象26枚のどのカードにも効果文にその制限は書かれていない
    // （実プレイで X002 極龍帝ジーク・ソル・フリードの召喚時効果から出したスピリットの
    //  召喚時効果が出ないと報告されて発覚）。転召の対象選択で中断したら、doSummon と同じく
    // summonSequence として積み直して選択の解決後に合流する
    // skipOnSummon は召喚されたスピリット自身の召喚時効果だけを止める（inst.noOnSummon を fireSummonSequence が読む）。
    // ほかのカードの「召喚されたとき」・トラッシュからの戻りは通常どおり出す（2026-11-08 ユーザー確認。旧：2026-08-17 は全部止めていた）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } }])
    } else {
        fireSummonSequence(state, owner, inst)
    }
}

// summonFromTrashFree 共通の召喚実行部：summonFreeFromHandIndexのトラッシュ版。
// 指定したトラッシュインデックスのスピリットを、維持コアのみリザーブから払ってフィールドへ配置する
// （onSummon効果は発揮させない）。プレイヤー選択（chosenCardIndex）・自動選択（コスト最大）どちらの経路からも呼ぶ
export function summonFreeFromTrashIndex(
    state: GameState,
    owner: PlayerId,
    sourceName: string,
    trashIndex: number,
    opts?: { payCost?: true; paySources?: PaySource[]; skipOnSummon?: true; destroyAtBattleEnd?: true; summonedBy?: string; surchargeBatch?: true; placeCores?: number; costPaid?: true; reserveOnly?: true },
): void {
    const player = state.players[owner]
    const cardId = player.trashCards[trashIndex]
    if (cardId === undefined) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const denial = summonDenial(state, { pid: owner, cardId, from: "trash", cause: "effect" })
    if (denial) {
        log(state, `${sourceName}：${denial}：${getCard(cardId).name}を召喚できなかった。`)
        return
    }
    const card = getCard(cardId)
    const maintain = opts?.placeCores ?? minLevelCores(card)
    // payCost 指定時は**通常の召喚コストも**支払う（効果文に「コストを支払わずに」が無いカード。
    // BS07常闇の聖堂＝「自分のフィールドのコアをコストとして使うことで〜召喚できる」）。
    // 支払い元はリザーブに加えて**フィールドのコア**も使える（paySources。手札版と同じ）
    const fullCost = opts?.payCost ? effectiveCost(state, owner, card, false, [], opts.summonedBy === "soryo", false) : 0
    const cost = opts?.costPaid ? 0 : fullCost
    const askCores = opts?.payCost === true && !opts.costPaid && opts.placeCores === undefined && opts.paySources === undefined && state.interactiveTargets
    const fromField = (opts?.paySources ?? []).reduce((sum, s) => sum + s.count, 0)
    const voidToll = opts?.payCost ? summonVoidToll(state, card) : 0
    if (askCores ? summonCoreOptions(state, owner, card, cost, opts?.reserveOnly === true).length === 0 : !summonPayable(state, owner, card, cost, maintain, voidToll, fromField, opts)) {
        log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
        return
    }
    const resume = {
        type: "summonFreeIndexInternal" as const,
        zone: "trash" as const,
        index: trashIndex,
        ...(opts?.skipOnSummon ? { skipOnSummon: true as const } : {}),
        ...(opts?.summonedBy !== undefined ? { summonedBy: opts.summonedBy } : {}),
        ...(opts?.destroyAtBattleEnd ? { destroyAtBattleEnd: true as const } : {}),
        ...(opts?.payCost ? { payCost: true as const, costPaid: true as const } : {}),
    }
    if (askCores && askSummonCores(state, owner, card, cost, resume, false, opts?.reserveOnly === true)) return
    if (!opts?.payCost && opts?.placeCores === undefined && voidToll === 0) {
        const owed = surchargeOwed(state, owner, card, opts?.surchargeBatch === true)
        if (askSummonCores(state, owner, card, owed, resume, owed > 0)) return
    }
    if (!opts?.payCost && askSurchargePay(state, owner, card, opts?.surchargeBatch === true, maintain, resume)) return
    if (takeFromTrash(state, owner, trashIndex, "effect") === null) return
    if (voidToll > 0) payVoidToll(state, owner, card)
    // フィールドのコアはコスト優先で充当し、余りを置くコアへ回す（payCost が面倒を見る）。無償のときは余分をここで払う
    const placedFromField = opts?.payCost ? payCost(state, owner, cost, opts.paySources ?? summonPayPlan(state, owner, cost + maintain, opts.reserveOnly === true)?.paySources, maintain) : payFreeSummonSurchargeKeeping(state, owner, card, opts?.surchargeBatch === true, maintain) ?? 0
    player.reserve -= maintain - placedFromField
    if (opts?.payCost) state.summoningPaid = true
    const inst = createInstance(cardId, state.turn, maintain, opts?.summonedBy)
    if (opts?.skipOnSummon) inst.noOnSummon = true
    player.field.spirits.push(inst)
    // 器BS16：destroyAtBattleEnd（BS16-075スケープゴート）
    if (opts?.destroyAtBattleEnd) inst.destroyAtBattleEnd = true
    log(
        state,
        `${player.name}は${sourceName}の効果で、トラッシュから${card.name}を` +
            (opts?.payCost ? `コスト${fullCost}を支払って召喚した。` : "コストを支払わずに召喚した。"),
    )
    // 【転召】は**コストを支払わない召喚でも必ず行う**（公式Q&A 2024-10-31：BS02ディバインウィンドで
    // 転召持ちを召喚しても転召は無視できない）
    if (!state.winner) resolveTensho(state, owner, inst, false, true)
    // 手札版と同じく、これも「召喚」なので召喚時効果と「召喚されたとき」の誘発が発揮される（2026-08-17 修正）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } }])
    } else {
        fireSummonSequence(state, owner, inst)
    }
}

// summon{from:"hand"} の候補判定（色・系統・コスト等の絞り込み＋payCost指定時の支払い可否）。
// pay の checker（pay.ts）とこのハンドラで共有する（候補のずれ防止）
// 26系X06「手札のこのカードは、自分が【Fチェンジ】を発揮する時、自分か相手のライフがN以下なら、コストMにできる」
export function fchangeCostAs(state: GameState, owner: PlayerId, cardId: string): number | undefined {
    for (const e of getCard(cardId).effects) {
        if (e.kind !== "fchangeCostAs") continue
        const opp = owner === "p1" ? "p2" : "p1"
        if (Math.min(state.players[owner].life, state.players[opp].life) <= e.anyLifeAtMost) return e.cost
    }
    return undefined
}

export function summonFromHandFreeCandidateMatches(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: Extract<EffectAction, { type: "summon", from: "hand" }>,
    candidateId: string,
    zone: "hand" | "trash" = "hand",
): boolean {
    const player = state.players[owner]
    const selfFamily = action.sameFamilyAsSelf && self ? getCard(self.cardId).family : null
    const candidate = getCard(candidateId)
    if (summonDenial(state, { pid: owner, cardId: candidateId, from: zone, cause: "effect", mayCombine: true })) return false
    // bravesOnly指定時はスピリットカードでなく**ブレイヴカードだけ**が対象
    // （recoverSpiritFromTrash.bravesOnlyと同義。BS10-096最後の優勝旗）
    if (action.bravesOnly ? candidate.type !== "brave" : candidate.type !== "spirit") return false
    if (action.combinableWithSelf && (!self || !braveCombinableWithHost(state, owner, self, candidateId))) return false
    if (action.colorFilter !== undefined) {
        const wantedColors = Array.isArray(action.colorFilter) ? action.colorFilter : [action.colorFilter]
        if (!wantedColors.some((c) => cardHasColor(candidate, c))) return false
    }
    if (action.sameFamilyAsSelf) {
        if (!selfFamily) return false
        if (!candidate.family.some((f) => selfFamily.includes(f))) return false
    }
    // familyFilter（配列＝OR）：selfの系統全部とのOR判定にしたくない場合の直接指定
    // （BS05火龍王ボルケノス：系統「竜人」限定。カード静的な family のみ＝手札カード判定のため）
    if (action.familyFilter !== undefined) {
        const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
        if (!wanted.some((f) => candidate.family.includes(f))) return false
    }
    // costFilter：数値指定時はコストが完全一致するもののみ（BS05シーサーズ：コスト2）。
    // {max,min}指定時は範囲一致（BS06リクラメーション：コスト4以下）
    if (action.costFilter !== undefined) {
        const costFilter = action.costFilter
        const ok = (cost: number): boolean => (typeof costFilter === "number" ? cost === costFilter : matchesCostFilter(cost, costFilter))
        // 26系X06「手札のこのカードは、自分が【Fチェンジ】を発揮する時、自分か相手のライフがN以下なら、コストMにできる」
        const asCost = action.summonedBy === "fchange" ? fchangeCostAs(state, owner, candidateId) : undefined
        if (!ok(candidate.cost) && (asCost === undefined || !ok(asCost))) return false
    }
    // symbolCount：手札のカードの印刷シンボル数がちょうど一致するもののみ
    if (action.symbolCount !== undefined && candidate.symbol.length !== action.symbolCount) return false
    // nameIncludes：カード名にこの文字列を含むもののみ（BS05ペンタン帝国）
    if (action.nameIncludes !== undefined && !candidate.name.includes(action.nameIncludes)) return false
    if (action.nameExcludes !== undefined && candidate.name.includes(action.nameExcludes)) return false
    // nameExcludesSelf（26系【Fチェンジ】の「異なるカード名」）：発生源自身のカード名を含む＝同じカード名のものを候補から外す
    if (action.nameExcludesSelf === true && self && candidate.name.includes(getCard(self.cardId).name)) return false
    // maxCostFromOwnTrashCores：コスト上限が「自分のトラッシュにあるコアの数」（BS02ディバインウィンド）
    if (action.maxCostFromOwnTrashCores && candidate.cost > player.trashCores) return false
    // keywordFilter：このキーワードエントリを静的に持つカードのみ（summonFromTrashFreeと同型。BS08雷帝竜騎レイブリッツ＝転召持ち）
    if (action.keywordFilter !== undefined && !hasKeyword(candidateId, action.keywordFilter)) return false
    // payCost：通常の召喚コストを支払う効果では、払えないカードは最初から候補にしない
    // （選ばせてから「払えなかった」で不発にすると、ターンに1回の権利だけ失う）。
    // **リザーブだけでなくフィールドのコアも支払いに使える**（通常の召喚と同じ。paySources）。
    // 2026-08-23 まではリザーブだけで判定しており、盤面のコアでなら払えるカードが
    // 候補にすら出なかった（利用者報告。BS08空帝竜騎プラチナム等の帝竜騎サイクル6枚）
    if (action.payCost && !handSummonCostPayable(state, owner, candidate, action.costPaidAsIfCounter === undefined ? 0 : countEffectCounter(state, owner, self, action.costPaidAsIfCounter))) return false
    return true
}


// 効果による召喚を、置くコアの数を聞かずに払えるか（支払い元の指定があればそれで、無ければ summonPayPlan のおまかせで）。
// toll は呼び出し時点でまだリザーブに残っているボイドの通行料
function summonPayable(state: GameState, owner: PlayerId, card: CardData, cost: number, maintain: number, toll: number, fromField: number, opts?: { payCost?: true; paySources?: PaySource[]; surchargeBatch?: true; reserveOnly?: true }): boolean {
    if (!opts?.payCost) return canPayFreeSummonSurcharge(state, owner, card, maintain, opts?.surchargeBatch === true)
    if (opts.paySources !== undefined) return state.players[owner].reserve - toll + fromField >= maintain + cost
    return summonPayPlan(state, owner, cost + maintain + toll, opts.reserveOnly === true) !== null
}
