// 継続効果の量に使う数え方 AuraCounter
import { TargetFilter } from "./targetFilter";
import { Keyword } from "./keyword";
import { Color } from "../type";

// 常時BP修正（オーラ）のカウンタ。発生源の持ち主基準で数える。
export type AuraCounter =
    | "ownLife" // 自分のライフのコア数
    | "ownReserve" // 自分のリザーブのコア数
    | "ownNexuses" // 自分のネクサス数
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "targetArmorColors" // **対象自身**（発生源ではない）が持つ【装甲】の指定色数。静的・一時付与・継続付与を合算・重複除く（BS05アイシクルアサルト）
    | "targetBofuCount" // 対象自身が持つ【暴風】の指定数（bofuCountFor）
    | "targetReductionSymbols" // **対象自身**の軽減シンボルの数（カード静的な reduction の個数。SD01-038 エメラルドブースト＝軽減シンボル1つにつきBP+1000）
    | { ownFamily: string | string[]; otherThanTarget?: true } // 自分フィールドの指定系統を持つスピリット数（発生源自身も含む）。otherThanTarget＝対象自身（target:"self" のオーラでは発生源）を数えない（26RBS03-003「このスピリット以外の」）。配列＝いずれかの系統でOR（EffectCounterの同名軸と同じ）
    | { ownTeam: string } // 自分フィールドの指定チーム（CardData.team）所属スピリット数（発生源自身も含む。AuraCondition.ownTeamAtLeastと同じ数え方。26系ライカ・ロンシア「【ブルービート】を持つ自分のスピリット1体につき」）
    | "ownExTrashReductionSpirits" // 自分フィールドの《継召》持ち（カードの effects に exTrashReduction がある）スピリット数（発生源自身も含む。26RBS02-003）
    | { ownNameIncludes: string } // 自分フィールドでカード名にこの文字列を含むスピリット数（発生源自身も含む。アルカナプリンス・オベロ）
    | { ownCost: number } // 自分フィールドの指定コストのスピリット数（発生源自身も含む。instHasCostで判定＝付与コストも考慮。BS06細剣の猫騎士ケット・シー）
    | "ownHand" // 自分の手札枚数（BS10-049妖精神官アンドロメダ：「自分の手札1枚につき、このスピリットをBP+1000する」）
    | "opponentHand" // 相手の手札枚数
    | "opponentSpirits" // 相手フィールドのスピリット数（BS14-080神代の森Lv1：「相手のスピリット1体につき」）
    | { ownColor: Color } // 自分フィールドの指定色スピリット数（発生源自身も含む。AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定。BS14-041バスター・フェンリルキャノン：「自分の白のスピリット1体につき」）
    | "opponentFieldColors" // AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定（shared/rules.opponentFieldColorCount。BS15共通器）
    | "opponentFieldSpiritColors" // opponentFieldColorsのスピリット限定版（BS15共通器）
    | "exhaustedEnemies" // AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定（相手フィールドの疲労状態スピリット数）
    | "targetSymbols" // AuraCounter版＝継続オーラ用。timedRuleBp の対象（第4引数targetInst）が持つシンボル数
    | "ownRestedNexuses" // AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定（自分の疲労状態のネクサス数）
    | "targetSameFamilyOwn" // AuraCounter版＝継続オーラ用。対象（targetInst）と系統を1つ以上共有する自分のスピリット数（対象自身も数える）
    | "readyEnemies" // AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定（相手フィールドの回復状態スピリット数）
    | "opponentTrashCores" // AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定（相手のトラッシュのコア数。selfBuff由来はowner基準で対象に依らない）
    | "ownBraveSpirits" // AuraCounter版＝継続オーラ用。EffectCounterの同名軸と同じ判定（自分フィールドのスピリット状態のブレイヴ数）
    | "selfCores" // AuraCounter版＝継続オーラ用。**対象自身**（targetInst）の上に置かれているコア数（timedEffect の target:"self"／aura の target:"self" でのみ使う＝targetInstは常に発生源自身）
    | "battlingOpponentSymbols" // AuraCounter版＝継続オーラ用。**対象自身**（targetInst）が参加しているバトルの相手側のシンボル数
    | "battlingOpponentCombinedSymbols" // battlingOpponentSymbolsの合体スピリット限定版
    | { anyNameIncludes: string } // 両陣営のフィールドでカード名にこの文字列を含むスピリット数（EffectCounterの同名軸と同じ判定）
    | { ownSpiritsMatching: TargetFilter } // 絞り込みに合う自分のスピリット数（発生源自身も数える。26RBS02-042「ブロック時効果を持つ自分のスピリット1体につき」）
    | { ownNexusColor: Color } // 自分フィールドの指定色ネクサス数（EffectCounterの同名軸と同じ判定）
    | { ownKeyword: Keyword } // 自分フィールドで指定キーワードを持つスピリット数（EffectCounterの同名軸と同じ判定）
    | { enemyCost: { max?: number; min?: number } }
