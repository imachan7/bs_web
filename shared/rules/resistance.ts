// 効果耐性（装甲・効果を受けない・対象にならない）の一本化（shared/rules.ts から分割。判定の規約は shared/rules.ts 冒頭）

import type {
    CardInstance,
    CardType,
    Color,
    PlayerId,
} from "../../server/src/type"
import type { Board } from "../board"
import { card } from "../cardDb"
import { coresCantBeRemoved, coresCantBeRemovedByOpponent } from "./activation"
import { hasArmorAgainst, hasBounceImmunity, hasBraveImmuneAgainst, hasFullEffectImmunity, hasGlobalConstraint, hasHeavyArmorAgainst, hasMagicImmunity, timedPlayerRules } from "./constraints"
import { spiritHasFamily } from "./keywordState"
import { KEYWORDS, currentLevel, effectActiveAtLevel } from "./level"

// ---- 効果耐性の一本化（2026-08-10） ----
//
// 【この節が唯一の判定表】耐性は6つの述語（hasArmorAgainst / hasMagicImmunity /
// hasFullEffectImmunity / isUntargetableByOpponent / hasBounceImmunity / isExhaustImmune）に
// 分かれていて、**呼び出し側が「どれを見るべきか」を毎回自分で判断していた**。
// 約70か所あり、書き忘れても型は通り smoke も落ちない
// （2026-08-10 に直した「範囲コア奪取が装甲を素通り」がまさにこれ。10ハンドラで漏れていた）。
//
// **新しく「相手のスピリットに何かをする」処理を書くときは、個別の述語を並べずにここを1回呼ぶこと。**
// サーバー側はさらに一時的な解決状態（対象の絞り込み・召喚時効果免疫）も見る必要があるので、
// EffectModules.resistanceAgainst を呼ぶ（内部でこれを呼んでいる）。
// クライアントの対象ハイライトは、状態を持たないこちらを直接呼んでよい。

// 耐性の分類。**分岐用ではなくログ・UI表示用**（呼び出し側は「防がれたかどうか」だけ見ればよい）
export type ResistanceCategory =
    | "armor" // 【装甲：色】＝発生源の色で決まる（keyword:"armor"）
    | "braveImmune" // 相手のブレイヴの効果を受けない（kind:"braveImmuneGrant"。装甲/重装甲とは別枠の第3の耐性軸。BS12初出）
    | "fullImmune" // 相手の効果を受けない（constraint:"immuneToOpponentEffects"／このターンの間の immuneToOpponentThisTurn）
    | "magicImmune" // 相手のマジックの効果を受けない（immunityGrant against:"magic"）
    | "bounceImmune" // 相手の効果で手札・デッキに戻らない（immunityGrant against:"bounce"）
    | "exhaustImmune" // 相手の効果で疲労しない（exhaustImmunityGrant）
    | "coresLocked" // このスピリットのコアは取り除けない（constraint:"coresCantBeRemoved"）。**お互いに効く**
    | "untargetable" // 相手の効果の**対象にならない**（constraint:"untargetableByOpponent"）。範囲効果は防がない
    | "battlingImmune" // バトル中は効果を受けない（globalConstraint:"battlingEffectImmune"）
    | "paidNegate" // コストを払って効果を受けなかった（kind:"targetNegateByHandDiscard"。サーバー側で判定）
    | "summonEffectImmune" // 相手のスピリットの『召喚時』効果を受けない（サーバー側で判定）
    | "magicRedirect" // 対象の絞り込みで、この個体が対象から外れた（耐性ではないが同じ入口で弾く。サーバー側で判定）

export interface Resistance {
    category: ResistanceCategory
    label: string // 日本語のログ用ラベル（「【装甲：赤】」など）
}

// 「何をしようとしているか」。耐性ごとに効く操作が違うので、**この2軸は必ず渡す**
export interface EffectAttempt {
    // 操作の種類。bounce（手札・デッキへ戻す）と exhaust（疲労）だけが専用の耐性を持つ。
    // それ以外は "destroy" / "coreRemove" / "other" のどれでも判定は同じだが、ログのために区別しておく
    op: "destroy" | "bounce" | "exhaust" | "coreRemove" | "other"
    // 対象指定（1体を選ぶ）か範囲（条件に合うものすべて）か。
    // **「相手の効果の対象にならない」は範囲効果を防がない**ので、ここを間違えると挙動が変わる
    scope: "targeted" | "area"
    actorPid: PlayerId // この効果を行っている側。targetOwnerPid と同じなら「自分の効果」＝相手限定の耐性は効かない
    sourceType?: CardType
    sourceColors?: Color[] // 装甲の判定に必要。**渡さないと装甲を判定できない**（不明時は防がない側に倒す）
    // 「候補を数えているだけで、まだ適用しない」問い合わせ。**候補列挙（pickEnemy* / pickAnySide*）だけが立てる。**
    //
    // コストを払って防ぐ耐性（kind:"targetNegateByHandDiscard"。BS08竜騎集う円卓Lv2）のためにある。
    // ああいう耐性は「対象にはなる → そのあと受けない」が正しい順序なので、候補列挙の段階では
    // **防がない**と答えて候補に残し、実際に適用する1点でだけコストを払って防ぐ。
    // 候補列挙で払ってしまうと、候補を数えただけで手札が溶ける。
    //
    // **既定（未指定）が「適用する」側**なのは意図的:
    // 立て忘れると「払いすぎる」＝テストで見える失敗になる。
    // 逆向き（既定が probing）だと、立て忘れが「耐性が無言で効かない」になり検出できない
    probing?: true
}

// 盤面だけで決まる耐性を判定する。防がれるなら理由を、通るなら null を返す。
// 一時的な解決状態（対象の絞り込み・召喚時効果免疫）はここでは見ない＝サーバー側の
// EffectModules.resistanceAgainst が上乗せする
export function boardResistanceAgainst(
    board: Board,
    targetOwnerPid: PlayerId,
    target: CardInstance,
    attempt: EffectAttempt,
): Resistance | null {
    // このターンの間、相手のカード効果を受けない（フェザーバリア）。**範囲効果も防ぐ**ので scope を問わない
    if (target.immuneToOpponentThisTurn && attempt.actorPid !== targetOwnerPid) {
        return { category: "fullImmune", label: "相手の効果を受けない状態" }
    }
    // バトル中の効果免疫だけは**自分の効果も止める**（既存の isEffectBlocked と同じ範囲を保つ）
    if (
        (attempt.sourceType === "spirit" || attempt.sourceType === "magic") &&
        isInBattle(board, target) &&
        hasGlobalConstraint(board, "battlingEffectImmune")
    ) {
        return { category: "battlingImmune", label: "バトル中の効果免疫" }
    }
    // 「お互い、このスピリットのコアを取り除けない」（BS10-X01 幻羅星龍ガイ・アスラ）。
    // **自分の効果も止める**ので、下の「相手の効果」限定より前で判定する
    if (attempt.op === "coreRemove" && coresCantBeRemoved(board, targetOwnerPid, target, attempt.actorPid)) {
        return { category: "coresLocked", label: "コアを取り除けない" }
    }
    // ここから下はすべて「相手の効果」限定
    if (attempt.actorPid === targetOwnerPid) return null
    // 「相手のスピリット/ブレイヴ/マジックの効果で、カード名に◯◯と入っている自分のスピリット上の
    // コアは取り除くことができない」（BS12-022太陽武者ゲンジ・ボルタ）。coresCantBeRemovedと違い片側限定
    if (
        attempt.op === "coreRemove" &&
        coresCantBeRemovedByOpponent(board, targetOwnerPid, target, attempt.sourceType)
    ) {
        return { category: "coresLocked", label: "コアを取り除けない（相手の効果）" }
    }

    // 【装甲】。ただしこのターン「装甲を無いものとして扱う」効果を受けていれば働かない
    //（すでに持っている分も、このターンに付与された分もまとめて落とす。SD01-040 アーマーパージ）
    const armorDisabled = timedPlayerRules(board, targetOwnerPid).some((c) => c.type === "armorDisabledForPid")
    // ⚠️ **ブレイヴの効果は【装甲】では防げない**（2026-08-25 ユーザー確認。docs/design/BRAVE.md §12）。
    // 【装甲：色】の効果文は「指定された色の相手の**スピリット/ネクサス/マジック**の効果を受けない」で、
    // ブレイヴを列挙していない。これを防ぐのは【重装甲】（ブレイヴ登場後のキーワード。プールに入ったら実装する）。
    // なお**合体中**にブレイヴがホストへ付与している効果は、発生源が合体スピリット＝"spirit" で来るのでここで防がれる
    // 【重装甲】は装甲より先に見る。**sourceType を問わない**＝ブレイヴの効果も防ぐのが装甲との差。
    // ⚠️ armorDisabled（アーマーパージ＝「【装甲】を無いものとして扱う」）では**消えない**。
    // 重装甲は装甲と別枠と確定したため（BS12_PLAN.md §1 の1）、「装甲」を名指しする効果は届かない
    // 第3の耐性軸：相手のブレイヴの効果を受けない（kind:"braveImmuneGrant"。BS12初出）。
    // 重装甲と同じく sourceType を問わず判定するが、実際に防ぐのは attempt.sourceType==="brave" のときだけ
    if (attempt.sourceType === "brave" && hasBraveImmuneAgainst(target, attempt.sourceColors)) {
        return { category: "braveImmune", label: "相手のブレイヴの効果を受けない状態" }
    }
    if (hasHeavyArmorAgainst(target, attempt.sourceColors)) {
        return { category: "armor", label: `【${KEYWORDS.heavyArmor.label}】` }
    }
    if (!armorDisabled && attempt.sourceType !== "brave" && hasArmorAgainst(board, target, attempt.sourceColors)) {
        return { category: "armor", label: `【${KEYWORDS.armor.label}】` }
    }
    if (hasFullEffectImmunity(board, targetOwnerPid, target, attempt.sourceType)) {
        return { category: "fullImmune", label: "相手の効果を受けない" }
    }
    if (attempt.sourceType === "magic" && hasMagicImmunity(board, targetOwnerPid, target)) {
        return { category: "magicImmune", label: "相手のマジックの効果を受けない" }
    }
    if (attempt.op === "bounce" && hasBounceImmunity(board, targetOwnerPid, target)) {
        return { category: "bounceImmune", label: "相手の効果で手札に戻らない" }
    }
    if (attempt.op === "exhaust" && isExhaustImmuneOnBoard(board, targetOwnerPid, target)) {
        return { category: "exhaustImmune", label: "相手の効果で疲労しない" }
    }
    // 「対象にならない」は**対象指定の効果だけ**を防ぐ（範囲効果はすり抜ける）
    if (attempt.scope === "targeted" && hasUntargetableConstraint(target)) {
        return { category: "untargetable", label: "相手の効果の対象にならない" }
    }
    return null
}

// constraint:"untargetableByOpponent" だけを見る（immuneToOpponentThisTurn は上で別扱いにしたので含めない）。
// 既存の isUntargetableByOpponent は両方を見る合成なので、そちらはクライアントの既存呼び出しのために残してある
export function hasUntargetableConstraint(inst: CardInstance): boolean {
    const level = currentLevel(inst).level
    return card(inst.cardId).effects.some(
        (e) =>
            e.kind === "constraint" &&
            e.constraint.type === "untargetableByOpponent" &&
            effectActiveAtLevel(e.levels, level),
    )
}

// 現在のバトルに参加しているか（サーバーの isInCurrentBattle と同じ判定。Board だけで決まる）
export function isInBattle(board: Board, inst: CardInstance): boolean {
    const battle = board.battle
    if (!battle) return false
    return battle.attackerInstanceId === inst.instanceId || battle.blockerInstanceId === inst.instanceId
}

// 【疲労しない】（kind:"exhaustImmunityGrant"。トランプの王国）。
// サーバーの isExhaustImmune と同じ判定を Board で行う（あちらはこの関数へ委譲している）
export function isExhaustImmuneOnBoard(board: Board, targetOwnerPid: PlayerId, inst: CardInstance): boolean {
    const player = board.players[targetOwnerPid]
    for (const source of [...player.field.spirits, ...player.field.nexuses]) {
        const sourceLevel = currentLevel(source).level
        for (const effect of card(source.cardId).effects) {
            if (effect.kind !== "exhaustImmunityGrant") continue
            if (!effectActiveAtLevel(effect.levels, sourceLevel)) continue
            // scope:"self"指定時は発生源自身だけが対象（BS12-012戦車皇ディルガン）。familyFilterは無視する
            if (effect.scope === "self") {
                if (source.instanceId !== inst.instanceId) continue
            } else if (effect.familyFilter !== undefined) {
                if (!spiritHasFamily(board, targetOwnerPid, inst, effect.familyFilter)) continue
            } else {
                continue // familyFilter・scopeのどちらも無いデータは対象なしに倒す（書き漏れの検出用）
            }
            if (effect.phaseTurn) {
                if (board.phase !== effect.phaseTurn.phase) continue
                if (effect.phaseTurn.turn === "own" && targetOwnerPid !== board.turnPlayer) continue
                if (effect.phaseTurn.turn === "opponent" && targetOwnerPid === board.turnPlayer) continue
            }
            return true
        }
    }
    return false
}
