// 継続効果が発揮される条件 AuraCondition
import { TargetFilter } from "./targetFilter";
import { Keyword } from "./keyword";
import { Color, FamilyFilter, ResolvedTargetFilter } from "../type";

// 常時BP修正（オーラ）の発動条件。満たすときのみ amount を適用する。
export type AuraCondition =
    | { hasOwnColor: Color } // 自分フィールドに指定色のスピリットまたはネクサスがある
    | { hasOwnColorSpirit: Color } // 自分フィールドに指定色のスピリットがいる
    | { hasOwnFamily: FamilyFilter } // 自分フィールドに指定系統のスピリットがいる（自身を含んでよい。配列＝いずれかの系統でOR。BS05黄道の虚空）
    | { ownAttacksAtLeast: number } // 自分のターン中で、このターンのアタック回数（宣言済みの今のアタックを含む）がN回以上（26RBS02-057「ターンのN回目以降のアタックなら」）
    | "ownSoulCoreInTrash" // 自分のトラッシュに[ソウルコア]がある間（26RSD09-X01）
    | "ownReserveNotEmpty" // 自分のリザーブが1個以上
    | { selfBpAtMost: number } // 発生源自身の実効BPがこの値以下の間（kind:"constraint" の condition だけが発生源を渡す。26RBS02-001「このスピリットがBP3000以下なら、アタック/ブロックできない」）
    | { selfRested: boolean } // 発生源自身が疲労状態(true)／回復状態(false)の間（auraAmount だけが発生源を渡す。それ以外の呼び出しでは不成立。26RBS03-035）
    | "opponentAttackerRefreshed" // アタックしている相手のスピリットが回復状態（疲労していない）のとき（バトル中のアタッカーが相手側の場合のみ。26RBS03-043）
    | { ownHasKeyword: Keyword } // 自分フィールドに指定キーワードを持つスピリットがいる（spiritHasKeywordで判定、付与キーワードも考慮。ブロントライデント）
    | { ownLifeAtMost: number } // 自分のライフ（コア数）がこの値以下（BS06鉄拳のカクタスガルー：ライフ3以下の間BP+3000）
    | { opponentHandAtLeast: number } // 相手の手札枚数がこれ以上（PlayerView.handCountと同じ「非公開だが枚数だけは見える」情報。BoardPlayer.handCountがあればそれを、無ければhand.length（サーバー内部は常に実配列）を使う。BS08ブラックウガルルムLv2：相手の手札5枚以上
    | "hasOwnBurstSet" // 自分がバーストエリアにカードをセットしている間（docs/design/BURST.md）
    | { ownTrashOnlyColor: Color } // 自分のトラッシュにあるカードがこの色のカードだけの間（トラッシュ0枚なら該当色以外のカードが無いので成立＝空虚な真。BS14-003スカートゥース：「自分のトラッシュにあるカードが赤のカードだけの間」）
    | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 持ち主から見た相手フィールドの色の種類数がこれ以上（shared/rules.opponentFieldColorCount。BS15共通器）
    | { ownFieldOnlyColor: Color; spiritsOnly?: true } // 自分フィールドのスピリット/ネクサスがすべてこの色1色だけの間（多色混在・0枚は不成立。shared/rules.ownFieldOnlyColor。BS15共通器）
    | { opponentBurstSet: boolean } // 発生源の持ち主から見た**相手**がバーストをセットしている間（false指定時はセットしていない間）だけ有効（triggered.conditionの同名軸と同じ判定。BS15共通器：kind:"constraint"のcondition用。BS15-060バンディット・アームズ【合体時】：「相手がバーストをセットしている間」）
    | { maxOwnSpirits: number } // 自分のスピリット（発生源を含む）がこの数以下の間
    | { battleOpponentMatches: ResolvedTargetFilter } // 現在のバトルで、持ち主から見た相手側の当事者が絞り込みに合う間（triggered.condition の同名軸は発生源のバトル相手で引く）
    | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } // 自分フィールドに指定チーム（CardData.team）所属のスピリットがcount体以上いる間。restedOnly指定時は疲労状態の個体だけを数える（26系ジェーン・ボゥ：「疲労状態の【レッドステラ】を持つ自分のスピリットが2体以上いるなら」）
    | { ownAllHaveTeam: string } // 自分のフィールドのスピリット/ネクサスが1体以上あり、そのすべてが指定チーム（CardData.team）に所属する間（26系「自分のスピリット/ネクサスすべてが【X】を持つなら」。0体では不成立。条件系のownAllHaveTeamと同じ判定）
    | { ownAllHaveFamily: string }
    | { ownAllSpiritsHaveFamily: string; costIn?: number[] } // 自分のスピリットすべて（ネクサスは見ない。1体以上必要）が系統を持ち、costIn指定時はコストもそのどれかである間（26RBS03-055/060「すべてがコスト2/4/6/8で系統：「黄玉」を持つなら」。IfCond.ownAllSpiritsHaveFamily と同じ判定）
    | { ownSpiritMatches: TargetFilter } // 自分のスピリットのうち絞り込みに合うものが1体以上いる間（発生源自身も数える。excludeSelf は効かない。26RBS03-062「効果の記述を持たない自分の青のスピリットがいるなら」）
    | { ownColorSymbolsAtLeast: { color: Color; count: number } } // 自分のフィールドの指定色シンボルの合計がcount個以上（スピリット/ネクサス両方。countSymbols と同じ数え方。26RSD04-002「自分の白シンボルが3つ以上あるなら」）
    | { ownTrashAllColor: Color } // 自分のトラッシュのカードすべてがこの色を持つ間（多色は色のどれかが一致すれば可。**0枚は不成立**＝ownTrashOnlyColor と逆。26RBS02-X06「トラッシュのカードすべてが紫なら」）
    | { ownEffectVanishedOpponentSpirit: true } // このターンに自分の効果で相手のスピリットが消滅（破壊ではない。コア0で場を離れた）していた間（oppSpiritRemovedByEffectThisTurn の "vanish"。26RSD02-X02）
    | { ownNexusAtLeast: number } // 自分のネクサスがN個以上ある間（26RBS01-080「自分のネクサスがあるなら」）
    | { ownNexusColorAtLeast: { color: Color; count: number } }
