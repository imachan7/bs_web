// 覚醒・起動能力・指定アタック・維持コア・フラッシュのロック・代替召喚（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    CardData,
    CardInstance,
    CardType,
    Color,
    LevelDef,
    PlayerId,
} from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { activeConstraints, timedFlashLocked, timedKeywords } from "./constraints"
import { hasContinuousKeywordGrant, matchesFamilyFilter, spiritHasKeyword } from "./keywordState"
import { bravesOf, cardHasColor, currentLevel, effectActiveAtLevel, effectActiveOn, effectSources, hasKeyword, instHasColor, keywordMatches } from "./level"

// ---- 覚醒・起動能力・指定アタック（UIハイライトとサーバー検証で共有する判定） ----

// 【覚醒】を現在レベルで持っているか。
// 静的キーワードは **effects の levels を尊重する**（「Lv2・Lv3【覚醒】」を Lv1 で使えないようにする）。
// 一時付与（スピリットリンク）・継続付与（ディラノス）はレベル指定を持たないためそのまま有効。
// なお spiritHasKeyword の静的分岐はレベルを見ないため、レベルを尊重したい呼び出しはこちらを使う
// 【神速】召喚のコスト支払いに使える、持ち主のフィールドのインスタンス集合。
//
// **基礎ルール: 神速召喚の支払いはリザーブからのみ**（通常召喚と違い、フィールドのコアは使えない）。
// kind:"sokuPaySourceGrant" が有効な発生源があるぶんだけ、フィールドからの支払いが許可される
// （BS04旋風渦巻く渓谷Lv2＝自分のフィールドすべて／BS04甲殻戦士ロングホーンLv2-3＝ロングホーン上のみ）。
// サーバー validateSummon とクライアントの支払いUIが共用する
export function sokuPayableInstanceIds(board: Board, pid: PlayerId): Set<string> {
    const allowed = new Set<string>()
    for (const source of effectSources(board, pid)) {
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "sokuPaySourceGrant") continue
            if (!effectActiveAtLevel(effect.levels, currentLevel(source).level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            if (effect.turn === "own" && pid !== board.turnPlayer) continue
            if (effect.scope === "self") {
                allowed.add(source.instanceId)
                continue
            }
            const player = board.players[pid]
            for (const inst of [...player.field.spirits, ...player.field.nexuses]) {
                allowed.add(inst.instanceId)
            }
        }
    }
    return allowed
}

// kind:"shinsokuPayAssist"（BS16-021ノウゼンサーバル）を持つ、pidの自分フィールドの回復状態スピリット。
// 【神速】召喚時、疲労させることで召喚コストのうち effect.cost 分を支払ったものとして扱える（任意）。
// サーバー validateSummon/doSummon とクライアントの支払いUIが共用する
export function shinsokuAssistCandidates(board: Board, pid: PlayerId): { instanceId: string; discount: number }[] {
    const result: { instanceId: string; discount: number }[] = []
    const player = board.players[pid]
    for (const inst of player.field.spirits) {
        if (inst.isRested) continue
        const level = currentLevel(inst).level
        for (const effect of card(inst.cardId).effects) {
            if (effect.kind !== "shinsokuPayAssist") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phase !== undefined && board.phase !== effect.phase) continue
            result.push({ instanceId: inst.instanceId, discount: effect.cost })
            break
        }
    }
    return result
}

// kind:"burstSetCost"（BS16-067氷聖女の塔Lv2）が課す、pidがバーストをセットするために必要な
// 「自分のリザーブのコアをトラッシュへ置く」個数の合計。発生源はpidの**相手**フィールドにある。
// サーバー validateSetBurst とクライアントの canSetBurst 表示が共用する
export function burstSetCoresRequired(board: Board, pid: PlayerId): number {
    const opp = pid === "p1" ? "p2" : "p1"
    let total = 0
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "burstSetCost") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (effect.phaseTurn) {
                if (board.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && opp !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && opp === board.turnPlayer) continue
            }
            total += effect.reserveToTrash
        }
    }
    return total
}

// pendingChoice の候補に混ぜると「相手のリザーブ」を意味する番兵。
// 通常の instanceId とは衝突しない固定文字列（BS03-075 犬人マードック：
// 「相手のフィールド/リザーブから」コアをトラッシュへ置く）
export const OPPONENT_RESERVE_TARGET = "opponent-reserve"

// GameAction awaken の fromInstanceId に渡すと「自分のリザーブから」の意味になる番兵。
// 通常の instanceId とは衝突しない固定文字列（BS05合成恐竜ディノゾールLv2）
export const AWAKEN_FROM_RESERVE = "reserve"

// 【覚醒】のコア移動元に自分のリザーブを使えるか（kind:"awakenFromReserve" が有効な発生源が
// 持ち主のフィールドにあるか。ディノゾールLv2が自分のスピリットすべての【覚醒】を書き換える）。
// サーバー validateAwaken とクライアントの覚醒UIが共用する
export function canAwakenFromReserve(board: Board, ownerPid: PlayerId, inst?: CardInstance): boolean {
    for (const source of effectSources(board, ownerPid)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "awakenFromReserve") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            // superAwakenOnly（BS13-002鎧竜人アンキロングLv2）：【超覚醒】持ちにだけ有効。
            // 対象インスタンス未指定（inst省略）のときは広く判定する既存の呼び出し元向けの後方互換
            if (effect.superAwakenOnly && (!inst || !hasSuperAwaken(board, ownerPid, inst))) continue
            return true
        }
    }
    return false
}

// この個体が【超覚醒】を持つか（＝コアを置いたあと回復するか）。
// 【覚醒】との違いはこの1点だけなので、判定もここに閉じる
export function hasSuperAwaken(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    return spiritHasKeyword(board, ownerPid, inst, "superAwaken")
}

// このスピリットのコアを取り除けないか（constraint:"coresCantBeRemoved"）。
// **効果でもプレイヤーの操作でも取り除けない**ので、耐性の判定表と、
// コアが動くプレイヤー操作の入口（moveCore / 支払い元 / 【覚醒】の移動元）から呼ぶ
// エンドステップを数える封印（BS10-108 ルナティックシール）が、いま指定の制限をかけているか。
// **両陣営に効く**（誰が発揮したかを問わない）。クライアントもこれを読んでボタンを落とす
export function isEndStepLocked(
    board: Board,
    lock: "attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve" | "summonTrigger",
): boolean {
    return board.endStepLocks.some((l) => l.remaining > 0 && l.locks.includes(lock))
}

export function coresCantBeRemoved(
    board: Board,
    ownerPid: PlayerId,
    inst: CardInstance,
    // このコア除去を行っている側。省略時は「持ち主自身の操作」（支払い元・moveCore・【覚醒】の移動元）を意味する
    // （globalConstraint "coresCantBeRemovedAll" の exceptOwnerEffects が使う）
    actorPid?: PlayerId,
): boolean {
    if (activeConstraints(board, ownerPid, inst).some((c) => c.type === "coresCantBeRemoved")) return true
    return globalCoresCantBeRemoved(board, ownerPid, actorPid ?? ownerPid)
}

// globalConstraint "coresCantBeRemovedAll"（BS13緑バッチ 器AC。既存のcoresCantBeRemovedは自身のコアだけを
// 対象にする個体制約だが、こちらは**フィールド全体**（相手すべて／両陣営すべて）に効く）:
//   side:"opponent" ＝発生源から見た相手のスピリットのコアだけを対象にする（BS13-065八分儀の祠Lv2）
//   side:"both"     ＝両陣営のスピリットのコアを対象にする（BS13-X03白羊樹神セフィロ・アリエスLv3）
//   exceptOwnerEffects ＝持ち主自身の効果・操作は例外で通す（相手の効果だけを止める。065Lv2）
// 【転召】でコアがすべて外れる経路（dumpAllCoresTensho）はこのチェックを経由しないため、
// 「【転召】以外」の例外は自然に満たされる（コード上の追加対応は不要）
function globalCoresCantBeRemoved(board: Board, targetOwnerPid: PlayerId, actorPid: PlayerId): boolean {
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, sourcePid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "coresCantBeRemovedAll") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (effect.turn === "own" && sourcePid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && sourcePid === board.turnPlayer) continue
                const { side, exceptOwnerEffects } = effect.constraint
                if (side === "opponent" && targetOwnerPid === sourcePid) continue
                if (exceptOwnerEffects && actorPid === targetOwnerPid) continue
                return true
            }
        }
    }
    return false
}

// globalConstraint "summonExhausted"（BS13緑バッチ 器AB）：お互い、条件を満たすカードを召喚するとき、
// 疲労状態で召喚する（BS13-065八分儀の祠Lv1-2／BS13-X03白羊樹神セフィロ・アリエスLv1-3）。
// **ダイレクトブレイヴでは合体先のスピリットが疲労する**（BS13_PLAN.md §1 #14。attachBraveの疲労合成が
// host.isRested||brave.isRestedで拾うため、召喚するインスタンス自身をここで疲労させれば自然に伝播する）。
// 「疲労する」であって「疲労状態になる」ではないため、この強制は ownSpiritExhausted を発火させない
// （呼び出し側がexhaustSpiritを経由せず直接isRestedを立てる。BS13_PLAN.md §1 #24）
export function summonExhausted(
    board: Board,
    summonedCard: { type: CardType; family: string[]; cost: number },
): boolean {
    for (const sourcePid of ["p1", "p2"] as PlayerId[]) {
        for (const inst of effectSources(board, sourcePid)) {
            const level = currentLevel(inst).level
            for (const effect of card(inst.cardId).effects) {
                if (effect.kind !== "globalConstraint") continue
                if (effect.constraint.type !== "summonExhausted") continue
                if (!effectActiveAtLevel(effect.levels, level)) continue
                if (effect.phase !== undefined && board.phase !== effect.phase) continue
                if (effect.turn === "own" && sourcePid !== board.turnPlayer) continue
                if (effect.turn === "opponent" && sourcePid === board.turnPlayer) continue
                const { cardTypes, familyExclude, costFilter } = effect.constraint
                if (!cardTypes.includes(summonedCard.type)) continue
                if (familyExclude && summonedCard.family.some((f) => (Array.isArray(familyExclude) ? familyExclude.includes(f) : f === familyExclude))) continue
                if (costFilter?.max !== undefined && summonedCard.cost > costFilter.max) continue
                if (costFilter?.min !== undefined && summonedCard.cost < costFilter.min) continue
                return true
            }
        }
    }
    return false
}

// globalConstraint "coresCantBeRemovedByOpponent"（BS12-022太陽武者ゲンジ・ボルタ）：
// 発生源の持ち主の、カード名にnameContainsを含むスピリット上のコアは、
// **相手の**スピリット/ブレイヴ/マジックの効果では取り除けない（coresCantBeRemovedと違い片側限定）。
// sourceType（コア除去を引き起こした効果の種別）がspirit/brave/magicのいずれでもなければ判定するまでもなくfalse
// （ネクサスの効果・undefined＝ルール処理は対象外。coresToOpponentReserveGoToTrashと同じ形）
export function coresCantBeRemovedByOpponent(
    board: Board,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    sourceType: CardType | undefined,
): boolean {
    if (sourceType !== "spirit" && sourceType !== "brave" && sourceType !== "magic") return false
    for (const inst of effectSources(board, targetOwnerPid)) {
        const level = currentLevel(inst).level
        for (const effect of card(inst.cardId).effects) {
            if (effect.kind !== "globalConstraint") continue
            if (effect.constraint.type !== "coresCantBeRemovedByOpponent") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (!card(target.cardId).name.includes(effect.constraint.nameContains)) continue
            return true
        }
    }
    return false
}

export function canAwaken(board: Board, ownerPid: PlayerId, inst: CardInstance): boolean {
    const level = currentLevel(inst).level
    // 【超覚醒】は【覚醒】を含む（KEYWORD_INCLUDES）。コアを集める操作自体は同じで、
    // 違うのは「置いたとき回復する」の1点だけ（GameEngine.doAwaken が見る）
    const staticAwaken = card(inst.cardId).effects.some(
        (e) => e.kind === "keyword" && keywordMatches(e.keyword, "awaken") && effectActiveOn(inst, e, level),
    )
    if (staticAwaken) return true
    return timedKeywords(board, inst).some((k) => keywordMatches(k.keyword, "awaken"))
        || hasContinuousKeywordGrant(board, ownerPid, inst, "awaken")
}

// 起動能力（kind: "activated"）が今このスピリットで発動可能なら {effectId, costLabel} を返す。
// タイミング・（condition が要求するなら）self がバトル当事者・「ターンに1回」の残り・コスト支払い可能を
// すべて満たす必要がある。
// バトル当事者であることは condition:"selfInBattle" のときだけの条件で、
// 発動タイミングがバトル中（timing:"flashBattle"）であること自体とは別（BS07桜の妖精オウカは
// バトルに参加していなくてもアタック中の味方をBP+できる）。
//
// ⚠️ **RuleValidator.validateActivateAbility と同じ条件をここで判定する**。
// UIのボタン表示はこちら、サーバーの受理はあちらなので、片方だけ直すと
// 「ボタンが出るのにサーバーが弾く」ズレが出る（過去に実際に起きている）
export function activatableAbility(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): { effectId: string; costLabel: string; instanceId?: string } | null {
    // 【合体時】の起動能力は**合体しているブレイヴ**が持つ（BS12-050 突機竜アーケランサー）。
    // バッジはホスト（合体スピリット）に出すので、ホストを見にきたらブレイヴのぶんも探し、
    // 起動対象としてブレイヴの instanceId を返す
    for (const brave of bravesOf(board.players[pid], inst)) {
        const found = activatableAbilityOf(board, pid, brave, inst, true)
        if (found) return { ...found, instanceId: brave.instanceId }
    }
    return activatableAbilityOf(board, pid, inst, inst, false)
}

// activatableAbility の実体。source＝効果を持つカード、host＝レベル/バトル判定に使うカード
// （合体中のブレイヴは、レベルもバトル参加もホストのものを見る）
function activatableAbilityOf(
    board: Board,
    pid: PlayerId,
    source: CardInstance,
    host: CardInstance,
    whileCombinedOnly: boolean,
): { effectId: string; costLabel: string } | null {
    // バトル中のフラッシュ窓（優先権が要る）と、自分のメインステップ（バトル外）の2つがありうる
    const inBattleFlash = board.battle !== null && board.isFlashTiming && board.priorityPlayer === pid
    const inOwnMain = board.battle === null && board.turnPlayer === pid && board.phase === "main"
    if (!inBattleFlash && !inOwnMain) return null
    const inBattle =
        board.battle !== null &&
        (board.battle.attackerInstanceId === host.instanceId ||
            board.battle.blockerInstanceId === host.instanceId)
    const level = currentLevel(host).level
    for (const e of card(source.cardId).effects) {
        if (e.kind !== "activated") continue
        // 【合体時】の起動能力は合体しているブレイヴからのみ、それ以外はホスト自身からのみ拾う
        if ((e.whileCombined === true) !== whileCombinedOnly) continue
        if (!effectActiveAtLevel(e.levels, level)) continue
        // 発動可能タイミング（validateActivateAbility と同じ切り分け）
        if (e.timing === "flashBattle" && !inBattleFlash) continue
        if (e.timing === "flash" && !inBattleFlash && !inOwnMain) continue
        if (e.timing === "main" && !inOwnMain) continue
        // ステップ・手番の明示（『自分のアタックステップ』等）。timing だけでは絞れないぶん。
        // **サーバーの validateActivateAbility にはこの判定があり、ここには無かった**ため、
        // 相手のアタックステップや自分のメインステップでもボタンが出て、押すとサーバーに
        // 拒否される状態だった（2026-09-13。SD06-005 ツインブレード・ドラゴンで発覚）
        if (e.phaseTurn) {
            if (board.phase !== e.phaseTurn.phase) continue
            const turnOk =
                e.phaseTurn.turn === "both" ||
                (e.phaseTurn.turn === "own") === (board.turnPlayer === pid)
            if (!turnOk) continue
        }
        if (e.condition === "selfInBattle" && !inBattle) continue
        // 「ターンに1回」：発生源1体につきターン1回
        if (e.oncePerTurn && source.activatedUsedTurn?.[e.id] === board.turn) continue
        // コスト省略時は追加コストなし（BS08帝竜騎サイクル）
        if (e.cost === undefined) return { effectId: e.id, costLabel: "効果を発動" }
        if ("exhaustSelf" in e.cost) {
            if (host.isRested) continue
            return { effectId: e.id, costLabel: "このスピリットを疲労させて効果を発動" }
        }
        if ("selfCoresToTrash" in e.cost) {
            // 発生源自身の上のコアを払う（BS11-067 白き楯の長城Lv2）
            if (host.cores < e.cost.selfCoresToTrash) continue
            return { effectId: e.id, costLabel: `このカードの上のコア${e.cost.selfCoresToTrash}個を払って効果を発動` }
        }
        if ("discardHandFamily" in e.cost) {
            // 手札に指定系統のスピリットカードが無ければ発動できない（BS13-062光り輝く大銀河Lv2）
            const wanted = Array.isArray(e.cost.discardHandFamily) ? e.cost.discardHandFamily : [e.cost.discardHandFamily]
            const hasCard = (board.players[pid].hand ?? []).some(
                (cardId) => card(cardId).type === "spirit" && wanted.some((f) => card(cardId).family.includes(f)),
            )
            if (!hasCard) continue
            return { effectId: e.id, costLabel: "手札のカードを破棄して効果を発動" }
        }
        if ("exhaustOwnFamilyOne" in e.cost) {
            // 指定系統の回復状態スピリットが自分のフィールドに無ければ発動できない（BS14-051アルカナビーストクィーンLv2-3）
            const family = e.cost.exhaustOwnFamilyOne
            const hasCandidate = board.players[pid].field.spirits.some(
                (s) => !s.isRested && matchesFamilyFilter(board, pid, s, family),
            )
            if (!hasCandidate) continue
            return { effectId: e.id, costLabel: "スピリットを疲労させて効果を発動" }
        }
        if ("discardHandOne" in e.cost) {
            // BS15-003ファイアファンサウル：手札1枚を破棄し、このスピリットを疲労させることで
            if (host.isRested) continue
            if ((board.players[pid].hand ?? []).length < 1) continue
            return { effectId: e.id, costLabel: "手札を破棄しこのスピリットを疲労させて効果を発動" }
        }
        if ("discardHandKeyword" in e.cost) {
            // BS15-017エンプレス・ヨウクィーン：指定キーワード持ちのスピリットカードが手札に無ければ発動できない
            const keyword = e.cost.discardHandKeyword
            const hasCard = (board.players[pid].hand ?? []).some(
                (cardId) => card(cardId).type === "spirit" && hasKeyword(cardId, keyword),
            )
            if (!hasCard) continue
            return { effectId: e.id, costLabel: "手札のカードを破棄して効果を発動" }
        }
        if ("discardHandColor" in e.cost) {
            // 器BS16：手札に指定色のカードが無ければ発動できない（BS16-005）
            const color = e.cost.discardHandColor
            const hasCard = (board.players[pid].hand ?? []).some((cardId) => cardHasColor(card(cardId), color))
            if (!hasCard) continue
            return { effectId: e.id, costLabel: "手札のカードを破棄して効果を発動" }
        }
        if (!("reserveToTrash" in e.cost)) continue
        if (board.players[pid].reserve < e.cost.reserveToTrash) continue
        return { effectId: e.id, costLabel: `コア${e.cost.reserveToTrash}個を払って効果を発動` }
    }
    return null
}

// 指定アタック（canDirectAttack）の対象条件（targetFilter状態条件＋targetMinBpのBP条件）
export interface DirectAttackFilter {
    targetFilter: "rested" | "singleCore" | "recovered" | "any"
    targetCombinedOnly?: true // 指定時は相手の合体スピリットしか指定できない（BS11-X02 滅神星龍ダークヴルム・ノヴァ）
    targetHighestBp?: true // 指定時は相手のフィールドで**実効BPが最大**のスピリットしか指定できない（同値が複数なら全部が候補。BS12-008 グランド・ドラグキャッスル）
    targetMinBp?: number // 指定時は相手スピリットの実効BPがこれ以上のもののみ指定できる（BS05シンクロニシティ：BP4000以上）
    targetMinCost?: number // 指定時は相手スピリットのコストがこれ以上のもののみ指定できる（BS05天焦がす大聖火Lv2：コスト5以上）
}

// 指定アタック（canDirectAttack）を現在レベルで持っていれば、その対象条件を返す
export function directAttackFilter(
    board: Board,
    pid: PlayerId,
    inst: CardInstance,
): DirectAttackFilter | null {
    const constraint = activeConstraints(board, pid, inst).find((c) => c.type === "canDirectAttack")
    if (!constraint || constraint.type !== "canDirectAttack") return null
    const filter: DirectAttackFilter = { targetFilter: constraint.targetFilter }
    if (constraint.targetMinBp !== undefined) filter.targetMinBp = constraint.targetMinBp
    if (constraint.targetMinCost !== undefined) filter.targetMinCost = constraint.targetMinCost
    if (constraint.targetCombinedOnly) filter.targetCombinedOnly = true
    if (constraint.targetHighestBp) filter.targetHighestBp = true
    return filter
}

// ---- 維持コア ----

// 維持コア数＝そのカードが持つ**最小レベル**の必要コア数。
// これを下回るとスピリットは消滅する（ネクサスはレベルが下がるだけ）。
// 現行カードはすべて Lv1 を持つため値は Lv1 のコア数と一致するが、Lv3 から始まるカード
// （アルティメット。ULTIMATE.md §4）では Lv1 が存在しないため、最小レベルを見る必要がある。
// 旧名 lv1Cores（2026-07-26 改名。挙動は不変）。
// サーバー側は server/src/logic/GameState.ts の re-export 経由で使う
export function minLevelCores(cardData: CardData): number {
    return minLevelCoresOf(cardData.levels)
}

// レベル表から最小レベルの必要コア数を求める素の計算（minLevelCores / instMinLevelCores の共通実体）
export function minLevelCoresOf(levels: LevelDef[]): number {
    const min = levels.reduce<{ level: number; cores: number } | null>(
        (best, l) => (best === null || l.level < best.level ? l : best),
        null,
    )
    return min ? min.cores : 0
}

// ---- フラッシュのロック ----

// pid がいま「フラッシュで手札のカードを使えない」状態か。
// ① 期間つき効果の battleLock（このバトルの間）
// ② 相手の継続効果 kind:"flashLockWhileAttackingFamily"（BS07ウィリアンスラッシュ）：
//    相手の指定系統スピリットがアタックしている間だけ効く
export function isFlashLockedFor(board: Board, pid: PlayerId): boolean {
    if (timedFlashLocked(board, pid)) return true
    const attackerId = board.battle?.attackerInstanceId
    if (attackerId === undefined) return false
    const opp: PlayerId = pid === "p1" ? "p2" : "p1"
    const attacker = board.players[opp].field.spirits.find((s) => s.instanceId === attackerId)
    if (!attacker) return false
    for (const source of effectSources(board, opp)) {
        const level = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "flashLockWhileAttackingFamily") continue
            if (!effectActiveAtLevel(effect.levels, level)) continue
            if (matchesFamilyFilter(board, opp, attacker, effect.familyFilter)) return true
        }
    }
    return false
}

// ---- 代替召喚ルート（kind:"altSummonFromHand"。BS10-058水星神龍メルクリウス・サーペント） ----

export interface AltSummonFromHandOption {
    effectId: string
    color: Color
    count: number
    candidateNexusIds: string[] // 支払いに使える自分のネクサス（cost.returnOwnNexusToDeckBottom.color 一致）のinstanceId
}

// 判定の本体。**サーバー（RuleValidator.validateSummon）とクライアントUIの唯一の判定元**
// （battleSwapSummonCheck と同じ形）。戻り値は失敗理由（string）か成功時のオプション。
// 支払い元（altSummonNexusInstanceIds）の枚数・重複チェックはサーバー専用の検証が持つため、
// ここでは「この召喚方法を選べるか」と「候補ネクサス一覧」までを返す
export function altSummonFromHandCheck(
    board: Board,
    pid: PlayerId,
    handIndex: number,
): AltSummonFromHandOption | string {
    const cardId = board.players[pid].hand?.[handIndex]
    if (cardId === undefined) return "手札にカードがありません"
    const cardData = card(cardId)
    if (cardData.type !== "spirit") return "スピリットカードではありません"
    const alt = cardData.effects.find((e) => e.kind === "altSummonFromHand")
    if (!alt || alt.kind !== "altSummonFromHand") return "このカードはこの召喚方法を使えません"
    // timing:"main"＝自分のメインステップ中の任意のタイミング（バトル中は不可）
    if (board.turnPlayer !== pid || board.phase !== "main" || board.battle) {
        return "自分のメインステップではありません"
    }
    const { color, count } = alt.cost.returnOwnNexusToDeckBottom
    const candidates = board.players[pid].field.nexuses.filter((n) => instHasColor(n, color))
    if (candidates.length < count) return "コストにできる自分のネクサスが足りません"
    return {
        effectId: alt.id,
        color,
        count,
        candidateNexusIds: candidates.map((n) => n.instanceId),
    }
}

// UI向け：手札の handIndex 枚目がいま代替召喚できるなら候補ネクサスを返す（できなければ ok:false）
export function canAltSummonFromHand(
    board: Board,
    pid: PlayerId,
    handIndex: number,
): { ok: boolean; candidateNexusIds: string[] } {
    const result = altSummonFromHandCheck(board, pid, handIndex)
    return typeof result === "string" ? { ok: false, candidateNexusIds: [] } : { ok: true, candidateNexusIds: result.candidateNexusIds }
}
