// 召喚時の誘発の並び（fireSummonSequence）と、効果による手札・トラッシュからの無償召喚
import { hasSummonedExhaustGrant, payCost } from "./EffectModules"
import { refreshLevelAsOverrides } from "./state/continuous"
import type { CardInstance, EffectAction, GameState, PaySource, PlayerId } from "../type"
import { createInstance, getCard, log, minLevelCores, opponentOf, pushResumeFrames, suspend } from "./GameState"
import { attachBrave } from "./brave"
import { fireFieldEventTriggers, fireSummonTrigger } from "./triggers"
import { effectiveCost } from "../../../shared/cost"
import { cardHasColor, hasKeyword, instColors, instIsVanilla, isOnFieldAnyZone, isTrashCardProtected, matchesCostFilter, summonByEffectBlocked, trashCardNameMatches } from "../../../shared/rules"
import { resolveTensho } from "./keywords/tensho"
import { exhaustSpirit } from "./state/exhaust"

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
        const card = getCard(cardId)
        const hit = card.effects.find(
            (e) => e.kind === "trashSummonOnNameSummoned" && summonedName.includes(e.nameIncludes),
        )
        if (!hit) continue
        // 維持コアを払えないなら確認自体を出さない（【不死】と同じ方針）
        if (player.reserve < minLevelCores(card)) continue
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

export function fireSummonSequence(state: GameState, pid: PlayerId, inst: CardInstance, byFushi = false): void {
    if (state.winner) return
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
    fireSummonTrigger(state, pid, inst, byFushi)
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
        fireFieldEventTriggers(state, pid, "ownSpiritSummoned", { pid, inst }, instColors(inst), undefined, undefined, {
            families: getCard(inst.cardId).family,
            // costFilter用：**カード静的なコスト（本来のコスト）**。軽減後の支払いコストではない（BS13-003カメレオプス）
            costs: [getCard(inst.cardId).cost],
            byFushi,
            // 【神速】による召喚か（doSummon が立てる。BS11-065 満天の牧草地Lv2）
            bySoku: state.summoningBySoku === true,
            // 手札からの召喚か（doSummon / summonFreeFromHandIndex が立てる。BS11-X05 魔導双神ジェミナイズ）
            fromHand: state.summoningFromHand === true,
            // 召喚されたスピリットがバニラ（効果の記述を持たない）かどうか（BS10-080炎の結晶石Lv2）
            vanilla: instIsVanilla(inst),
            // 器AG：summonedSpiritAsTarget指定時に、召喚されたスピリット自身をactionTargetIdとして渡す
            // （selfMode:"source"と組み合わせ、self=発生源自身・target=召喚されたスピリットを両立させる。BS13-053モクバオー）
            sourceInstanceId: inst.instanceId,
        })
    }
    // 「anyBraveSummoned」（BS12-061剣の誕生地）：**両陣営**どちらかのブレイヴが召喚されたとき。
    // ownSpiritSummonedと違い、field.spirits（スピリット状態）だけでなくfield.combinedBraves
    // （ダイレクトブレイヴ）に入った場合も対象にするため isOnFieldAnyZone で判定する
    if (!state.winner && isOnFieldAnyZone(player, inst.instanceId) && getCard(inst.cardId).type === "brave") {
        fireFieldEventTriggers(state, pid, "anyBraveSummoned", { pid, inst })
        if (!state.winner) fireFieldEventTriggers(state, opponentOf(pid), "anyBraveSummoned", { pid, inst })
    }
    delete state.summoningBySoku
    delete state.summoningFromHand
    // トラッシュにあるカードの「〜が召喚されたとき、コストを支払わずに召喚できる」
    // （kind:"trashSummonOnNameSummoned"。BS11-004 プロミネンスワイバーン）
    if (!state.winner && stillOnField()) tryTrashSummonOnNameSummoned(state, pid, inst)
    // 天使長ファニム：召喚した側（pid）から見た相手が summonedExhaustGrant を持つ間、
    // 召喚されたこのスピリットは疲労する
    if (!state.winner && stillOnField() && hasSummonedExhaustGrant(state, opponentOf(pid))) {
        exhaustSpirit(state, pid, inst, undefined, opponentOf(pid), "spirit")
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
        skipOnSummon?: true
        paySources?: PaySource[]
        // 指定時は**ダイレクトブレイヴ**（doSummonのbraveTargetInstanceIdと同じ結果になるようにする。
        // 維持コアを置かない・field.combinedBravesへ入れる・host.braveRefsで参照する。BS10-096最後の優勝旗）
        braveTargetInstanceId?: string
    },
): void {
    const player = state.players[owner]
    // BS12-072海賊王の秘宝島Lv1：効果による召喚が両陣営で禁じられている間は発動しない
    if (summonByEffectBlocked(state)) {
        log(state, `${sourceName}：効果による召喚が禁じられているため発動しなかった。`)
        return
    }
    const cardId = player.hand[handIndex]
    if (cardId === undefined) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const card = getCard(cardId)
    // ダイレクトブレイヴは**維持コアを置かない**（合体状態のLv1が0コア。doSummonと同じ規則）
    const maintain = opts?.braveTargetInstanceId !== undefined ? 0 : minLevelCores(card)
    // payCost 指定時は**通常の召喚コストも**支払う（効果文に「コストを支払わずに」が無いカード。
    // BS08帝竜騎サイクル）。支払い元はリザーブに加えて**フィールドのコア**も使える
    // （paySources。通常の召喚と同じ。2026-08-23 まではリザーブのみの簡略化で、
    // 盤面のコアでなら払えるカードが候補にすら出なかった＝利用者報告）
    const cost = opts?.payCost ? effectiveCost(state, owner, card) : 0
    const fromField = (opts?.paySources ?? []).reduce((sum, s) => sum + s.count, 0)
    if (player.reserve + fromField < maintain + cost) {
        log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
        return
    }
    player.hand.splice(handIndex, 1)
    // フィールドのコアはコスト優先で充当し、余りを置くコアへ回す（payCost が面倒を見る。
    // 支払い元が維持コア割れしたらそこで消滅する）
    const placedFromField = payCost(state, owner, cost, opts?.paySources, maintain)
    player.reserve -= maintain - placedFromField
    state.summoningFromHand = true // 効果による手札からの召喚（fieldEvent.fromHandOnly。BS11-X05）
    const inst = createInstance(cardId, state.turn, maintain)
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
            (opts?.payCost ? `コスト${cost}を支払って召喚した。` : "コストを支払わずに召喚した。") +
            (skipTensho ? "（【転召】させずに召喚した）" : ""),
    )
    // 【転召】は**コストを支払わない召喚でも必ず行う**（公式Q&A 2024-10-31：BS02ディバインウィンドで
    // 転召持ちを召喚しても転召は無視できない）。
    // skipTensho指定時のみ例外（BS08雷帝竜騎レイブリッツ／X002極龍帝ジーク・ソル・フリード：
    // 「【転召】させずに召喚できる」の明記あり）
    if (!state.winner && !skipTensho) resolveTensho(state, owner, inst)
    // ⚠️ **これも「召喚」なので、召喚時効果と「召喚されたとき」の誘発が発揮される**（2026-08-17 修正）。
    // 以前はどちらも呼ばず「召喚時効果は発揮されない」とログに出していたが、
    // 対象26枚のどのカードにも効果文にその制限は書かれていない
    // （実プレイで X002 極龍帝ジーク・ソル・フリードの召喚時効果から出したスピリットの
    //  召喚時効果が出ないと報告されて発覚）。転召の対象選択で中断したら、doSummon と同じく
    // summonSequence として積み直して選択の解決後に合流する
    // skipOnSummon 指定時は召喚時効果も「召喚されたとき」の誘発も発揮させない。
    // 効果文に「ただし、『このスピリットの召喚時』効果は発揮されない」と明記があるカードだけ
    // （BS08帝竜騎サイクル6枚）。既定では発揮する（2026-08-17 修正）
    if (opts?.skipOnSummon) {
        log(state, `${sourceName}：『召喚時』効果は発揮されない。`)
        return
    }
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
    opts?: { payCost?: true; paySources?: PaySource[]; skipOnSummon?: true; destroyAtBattleEnd?: true },
): void {
    const player = state.players[owner]
    // BS12-072海賊王の秘宝島Lv1：効果による召喚が両陣営で禁じられている間は発動しない
    if (summonByEffectBlocked(state)) {
        log(state, `${sourceName}：効果による召喚が禁じられているため発動しなかった。`)
        return
    }
    const cardId = player.trashCards[trashIndex]
    if (cardId === undefined) {
        log(state, `${sourceName}：対象がいなかった。`)
        return
    }
    const card = getCard(cardId)
    const maintain = minLevelCores(card)
    // payCost 指定時は**通常の召喚コストも**支払う（効果文に「コストを支払わずに」が無いカード。
    // BS07常闇の聖堂＝「自分のフィールドのコアをコストとして使うことで〜召喚できる」）。
    // 支払い元はリザーブに加えて**フィールドのコア**も使える（paySources。手札版と同じ）
    const cost = opts?.payCost ? effectiveCost(state, owner, card) : 0
    const fromField = (opts?.paySources ?? []).reduce((sum, s) => sum + s.count, 0)
    if (player.reserve + fromField < maintain + cost) {
        log(state, `${sourceName}：コアが足りず${card.name}を召喚できなかった。`)
        return
    }
    player.trashCards.splice(trashIndex, 1)
    // フィールドのコアはコスト優先で充当し、余りを置くコアへ回す（payCost が面倒を見る）
    const placedFromField = payCost(state, owner, cost, opts?.paySources, maintain)
    player.reserve -= maintain - placedFromField
    const inst = createInstance(cardId, state.turn, maintain)
    player.field.spirits.push(inst)
    // 器BS16：destroyAtBattleEnd（BS16-075スケープゴート）
    if (opts?.destroyAtBattleEnd) inst.destroyAtBattleEnd = true
    log(
        state,
        `${player.name}は${sourceName}の効果で、トラッシュから${card.name}を` +
            (opts?.payCost ? `コスト${cost}を支払って召喚した。` : "コストを支払わずに召喚した。"),
    )
    // 【転召】は**コストを支払わない召喚でも必ず行う**（公式Q&A 2024-10-31：BS02ディバインウィンドで
    // 転召持ちを召喚しても転召は無視できない）
    if (!state.winner) resolveTensho(state, owner, inst)
    // skipOnSummon 指定時は召喚時効果を発揮させない（効果文に明記があるカードだけ。BS11-038 天星馬ペガシーダ）
    if (opts?.skipOnSummon) {
        log(state, `${sourceName}：『召喚時』効果は発揮されない。`)
        return
    }
    // 手札版と同じく、これも「召喚」なので召喚時効果と「召喚されたとき」の誘発が発揮される（2026-08-17 修正）
    if (state.pendingChoice) {
        pushResumeFrames(state, [{ kind: "action", selfInstanceId: inst.instanceId, action: { type: "summonSequence" } }])
    } else {
        fireSummonSequence(state, owner, inst)
    }
}

// summonFromHandFree の候補判定（色・系統・コスト等の絞り込み＋payCost指定時の支払い可否）。
// pay の checker（pay.ts）とこのハンドラで共有する（候補のずれ防止）
export function summonFromHandFreeCandidateMatches(
    state: GameState,
    owner: PlayerId,
    self: CardInstance | null,
    action: Extract<EffectAction, { type: "summonFromHandFree" }>,
    candidateId: string,
): boolean {
    const player = state.players[owner]
    const selfFamily = action.sameFamilyAsSelf && self ? getCard(self.cardId).family : null
    const candidate = getCard(candidateId)
    // bravesOnly指定時はスピリットカードでなく**ブレイヴカードだけ**が対象
    // （recoverSpiritFromTrash.bravesOnlyと同義。BS10-096最後の優勝旗）
    if (action.bravesOnly ? candidate.type !== "brave" : candidate.type !== "spirit") return false
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
        if (typeof action.costFilter === "number") {
            if (candidate.cost !== action.costFilter) return false
        } else if (!matchesCostFilter(candidate.cost, action.costFilter)) {
            return false
        }
    }
    // nameIncludes：カード名にこの文字列を含むもののみ（BS05ペンタン帝国）
    if (action.nameIncludes !== undefined && !candidate.name.includes(action.nameIncludes)) return false
    // maxCostFromOwnTrashCores：コスト上限が「自分のトラッシュにあるコアの数」（BS02ディバインウィンド）
    if (action.maxCostFromOwnTrashCores && candidate.cost > player.trashCores) return false
    // keywordFilter：このキーワードエントリを静的に持つカードのみ（summonFromTrashFreeと同型。BS08雷帝竜騎レイブリッツ＝転召持ち）
    if (action.keywordFilter !== undefined && !hasKeyword(candidateId, action.keywordFilter)) return false
    // payCost：通常の召喚コストを支払う効果では、払えないカードは最初から候補にしない
    // （選ばせてから「払えなかった」で不発にすると、ターンに1回の権利だけ失う）。
    // **リザーブだけでなくフィールドのコアも支払いに使える**（通常の召喚と同じ。paySources）。
    // 2026-08-23 まではリザーブだけで判定しており、盤面のコアでなら払えるカードが
    // 候補にすら出なかった（利用者報告。BS08空帝竜騎プラチナム等の帝竜騎サイクル6枚）
    if (action.payCost) {
        const fieldCores = [...player.field.spirits, ...player.field.nexuses].reduce(
            (sum, i) => sum + i.cores,
            0,
        )
        if (player.reserve + fieldCores < minLevelCores(candidate) + effectiveCost(state, owner, candidate)) {
            return false
        }
    }
    return true
}

// summonFromTrashFree の候補判定。summonFromHandFreeCandidateMatches のトラッシュ版。
// pay の checker（pay.ts）とこのハンドラで共有する
export function summonFromTrashFreeCandidateMatches(
    state: GameState,
    owner: PlayerId,
    action: Extract<EffectAction, { type: "summonFromTrashFree" }>,
    candidateId: string,
    targetInstanceId?: string,
): boolean {
    const player = state.players[owner]
    const candidate = getCard(candidateId)
    if (candidate.type !== "spirit") return false
    if (action.colorFilter !== undefined) {
        const wantedColors = Array.isArray(action.colorFilter) ? action.colorFilter : [action.colorFilter]
        if (!wantedColors.some((c) => cardHasColor(candidate, c))) return false
    }
    if (action.keywordFilter !== undefined && !hasKeyword(candidateId, action.keywordFilter)) return false
    // familyFilter（BS07常闇の聖堂＝「夜族」）：トラッシュのカードが対象なので
    // カード静的な family で判定する（配列＝OR）
    if (action.familyFilter !== undefined) {
        const wanted = Array.isArray(action.familyFilter) ? action.familyFilter : [action.familyFilter]
        if (!wanted.some((f) => candidate.family.includes(f))) return false
    }
    // nameIncludes（BS08アンドレアルファス＝「勇者」）：トラッシュのカードが対象なので
    // カード静的な名前（trashNameAsによる別名も一致する）で判定する
    if (action.nameIncludes !== undefined && !trashCardNameMatches(candidateId, action.nameIncludes)) return false
    // whileCombinedFilter（BS10-084虚実の口Lv2＝「【合体時】効果を持つスピリットカード」）：
    // トラッシュのカードが対象なので、カード静的な effects に whileCombined:true のエントリがあるかで判定する
    if (action.whileCombinedFilter === true && !candidate.effects.some((e) => "whileCombined" in e && e.whileCombined === true)) {
        return false
    }
    if (action.costBudget === undefined && !matchesCostFilter(candidate.cost, action.costFilter)) return false
    if (isTrashCardProtected(candidateId)) return false
    // onlyBurstDestroyedCard（BS15-073五輪転生炎）：そのバースト発動のきっかけになった破壊で
    // 落ちたカードだけが対象（burst.destroyedAsTargetがtargetInstanceIdの枠に入れたcardIdと一致）
    if (action.onlyBurstDestroyedCard && candidateId !== targetInstanceId) return false
    // payCost：通常の召喚コストを支払う効果では、払えないカードは最初から候補にしない
    // （手札版と同じ理由・同じ判定。リザーブだけでなくフィールドのコアも支払いに使える）
    if (action.payCost) {
        const fieldCores = [...player.field.spirits, ...player.field.nexuses].reduce(
            (sum, i) => sum + i.cores,
            0,
        )
        if (player.reserve + fieldCores < minLevelCores(candidate) + effectiveCost(state, owner, candidate)) {
            return false
        }
    }
    return true
}
