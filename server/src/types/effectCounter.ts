// 効果の量に使う数え方 EffectCounter（「〜1体につき」「〜の数」）
import type { CardPick } from "./effectAction";
import { TargetFilter } from "./targetFilter";
import { Color, Keyword } from "../type";

// 効果の実行内容。EffectModules のアクションハンドラと 1:1 で対応する。
// 新しい効果を足すときは「ここに型を追加」→「ハンドラを追加」の2手で完結する。
export type EffectCounter =
    | "readyEnemies" // 相手フィールドの回復状態スピリット数
    | "ownAttacksThisTurn" // 自分のターンならこのターンのアタック回数（state.attacksThisTurn）、相手のターンなら0
    | "exhaustedEnemies" // 相手フィールドの疲労状態スピリット数
    | "opponentHand" // 相手の手札枚数
    | "ownHand" // 自分の手札枚数（IfCond count「自分の手札が4枚以下なら」。26RBS01-107 ほか）
    | "lastDestroyedChimei" // 直前に破壊したカードの【地鳴】で指定された枚数（効果で増えたぶん込み。26RBS01-125）
    | "opponentCoresTotal" // 相手のフィールド・リザーブ・トラッシュのコアの合計（ownCoresTotal の相手版）
    | { div: [EffectCounter, number] } // 1つ目 ÷ 2つ目（切り捨て）。「◯2体につき1体」（26RDB01-052）
    | { plus: [EffectCounter, number | EffectCounter] } // 1つ目 + 定数（または2つ目のカウンタ。BS17-075 の総コア＋ライフ）。「置くコアを+1個する」のように基本量に数えた量を足す形（count=1 と組む。26RBS01-028）
    | { minus: [EffectCounter, EffectCounter] } // 1つ目 − 2つ目（負なら0）。「〜と同じ数になるように」
    | "bothNexusColors" // お互いのフィールドのネクサスの色の種類数（重複を除く）
    | "ownOtherSpirits" // self以外の自分フィールドのスピリット数
    | "ownReserve" // 自分のリザーブのコア数
    | "keishoExcludedCount" // 直近の召喚の《継召》で除外した枚数（26系「この継召でN枚以上除外していたなら」。召喚時効果の解決中に読む前提）
    | "opponentReserve" // 相手のリザーブのコア数
    | "selfBp" // このスピリット（self）自身の実効BP（selfがnullなら0。26RBS02-012「このスピリットのBP10000につき」は div と組む）
    | { keishoExcludedFamily: string[] } // 直近の《継召》で除外したカードのうち、系統のどれかが配列に含まれる枚数（カードデータの静的な系統で判定。26RBS03-X01「系統：「紅雲」/「煉翼」を持つカードのEXシンボル1つにつき」。EXシンボル持ちはシンボル1つなので枚数＝EXシンボル数）
    | "ownNexuses" // 自分のネクサス数
    | "restedEnemyNexuses" // 持ち主から見た相手フィールドの疲労状態のネクサス数（BS09-080エグゾーストネクサス）
    | "ownRestedNexuses" // 自分の疲労状態のネクサス数（【強襲】がネクサスを疲労させるため。BS07ネクサスアタック）
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "allExhausted" // 両陣営の疲労スピリット数の合計（ownExhausted + exhaustedEnemies。BS05大甲帝デスタウロス）
    | "selfCoresAtDestruction" // 破壊時点でこのスピリット上に置かれていたコア数（destroySpiritが破壊直前に記録。漆黒鳥ヤタグロス）
    | "lastBattleDestroyedCores" // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（GameEngine.resolveBattleが記録、次のバトル解決の冒頭でリセット。魔界七将デストロード）
    | "opponentTrashCores" // 相手のトラッシュに置かれているコア数（PlayerState.trashCores。BS04吸血鬼ダンピール）
    | "selfLevel" // このスピリット（self）自身の現在のLv（selfがnullなら0。BS09-018暗空の勇者皇ザンバ：「このスピリットのLvと同じ個数」）
    | "ownCoresTotal" // 自分のフィールド（合体中ブレイヴを含む）・リザーブ・トラッシュのコアの合計
    | "lastCost" // 直前に動いたカードの印刷コストの合計
    | "lastTargetCount" // 直前に記録した個体（recordTargets）の数。exhaustOwnNexuses が実際に疲労させたネクサスの数（26RBS02-073）
    | "lastMoved" // 直前に動いたカードの枚数（logic/record.ts）
    | "lastNexusCost" // 直前に破壊した自分のネクサスの印刷コスト（26RSD06-013「破壊したネクサスのコスト1につき」。lastCost は続く破壊で lastMoved が書き換わるので別に持つ）
    | "lastDrawn" // 直前のドローで引いた枚数（logic/record.ts。26RBS02-X17「ドローしたカード1枚につき」）
    | "lastCores" // 直前の removeCores が取り除いたコアの数（logic/record.ts）
    | "lastBp" // 直前に疲労させた個体の実効BP（logic/record.ts）
    | "burstEventCost" // BS15共通器：GameState.burstEventCost（バースト発動時のeventInfo.costs先頭値）。未設定なら0（BS15-084爆砕轟神掌／BS15-X06鉄の覇王サイゴード・ゴレム）
    | "selfCores" // このスピリット（self）自身の上に置かれているコア数（selfがnullなら0。BS13-020ブッシュベイベ：「このスピリット上のコア1個につき」）
    | "selfSymbols" // このスピリット（self）自身が持つシンボル数（instanceSymbolCount。selfがnullなら0。BS05碧緑の竜使いグリューン：「このスピリットのシンボルと同じ数」）
    | "targetSameFamilyOwn" // 対象スピリットと系統を1つ以上共有する自分のスピリットの数（**対象自身も数える**。
    // 効果文が「このスピリット以外の」と書いていないため。SD02-015 フレンドリーパワー）。
    // targetSymbols と同じく、対象を選んだ後に logic/counted.ts が数える（countEffectCounter には来ない）
    | "targetSymbols" // **対象スピリット自身**（timedEffect の bp が解決するtargetInstanceId等）が持つシンボル数。selfSymbolsと異なりself（発生源）ではなく対象基準。マジックはself=nullのためselfSymbolsが使えない場合に使う（対象を選んだ後に logic/counted.ts が数える。BS06サベージパワー）
    | "targetBofuCount" // 対象自身が持つ【暴風】の指定数（bofuCountFor）
    | "lastFunsaiTotal" // 直前の【粉砕】で破棄した総枚数（GameState.lastFunsai。次のアタック宣言でリセット。BS03巨人王ランドルフ）
    | "lastFunsaiSpirits" // 直前の【粉砕】で破棄したカードのうちスピリットカードの枚数（GameState.lastFunsai。BS04二刀流のアムブローズ）
    | "ownCombinedSpirits" // 自分のフィールドの合体スピリット数（braveRefsを持つホストの数。instIsCombinedで判定。BS10-029木星神龍ノブナガード・ゼウシスLv2-3＝「自分の合体スピリット1体につき」）
    | "ownBraveSpirits" // 自分のフィールドで**スピリット状態のブレイヴ**数（card.type==="brave"かつfield.spiritsにいる個体。合体中はfield.combinedBravesなので対象外。BS12-004ドラゴン・フェゼント：「自分のスピリット状態のブレイヴ1体につき」）
    | "ownLife" // 自分のライフのコア数（player.life）。BS13-061戴冠する活火山Lv2：「自分のライフのコア1個につき」
    | "opponentLife" // 相手のライフのコア数（発生源の持ち主から見て）
    | "selfBraveCount" // このスピリット（self）に合体しているブレイヴの数（self.braveRefs?.length。BS13-X01光龍騎神サジット・アポロドラゴン【合体中】Lv3：「このスピリットのブレイヴ1つにつき」）
    | "battlingOpponentCombinedSymbols" // 器YC：selfが参加している現在のバトルの相手側（state.battle.attacker/blockerInstanceId）が**合体スピリットのときだけ**そのシンボル数（instanceSymbolCount）、合体していない相手や非バトル中は0（BS12-036星犬ポメラン：「バトルしている相手の合体スピリットのシンボル1つにつき」）
    | "battlingOpponentSymbols" // battlingOpponentCombinedSymbolsの合体限定を外した版：selfが参加している現在のバトルの相手側のシンボル数（instanceSymbolCount）。合体していなくても数える。非バトル中は0（BS13-056ホーク・ブレイカー【合体時】：「バトルしている相手のスピリットのシンボル1つにつき」）
    | { opponentSpirits: TargetFilter } // 絞り込みに合う相手のスピリットの数
    | { ownTrashCards: CardPick } // 自分のトラッシュで pick に合うカードの枚数（26系「自分のトラッシュに系統：「瞳剣」を持つマジックカードが2枚以上あるなら」）
    | { ownFieldCards: TargetFilter } // 絞り込みに合う自分のスピリットとネクサスの数
    | { ownSpirits: TargetFilter } // 絞り込みに合う自分のスピリットの数（declare の then の中なら declared を書ける）
    | { ownFamily: string | string[] } // 配列＝いずれかの系統でOR（BS10-X02双魚賊神ピスケガレオン：「光導」/「星魂」）
    | { ownNameIncludes: string }
    | { anyNameIncludes: string } // 両陣営のフィールドでカード名にこの文字列を含むスピリット数（ownNameIncludesの両陣営版。BS06アルカナナイト・ヘクス：修飾なしの「スピリット」）
    | { ownColor: Color } // 自分のフィールドの指定色スピリット数
    | { ownColorSymbols: Color } // 自分のフィールドの指定色シンボルの合計数（BS04機動要塞キャッスル・ゴレム＝青シンボル）。**スピリットとネクサスの両方**を数える（2026-08-20 修正。以前はスピリットだけを見ていた）。数え方は shared/rules.countSymbols に一本化してあり、symbolFix による固定・バウンス待機の除外・「◯色としても扱う」で得た色も見る
    | { ownKeyword: Keyword | Keyword[] } // 自分のフィールドで指定キーワードを持つスピリット数（静的・一時付与・継続付与すべて考慮。spiritHasKeywordで判定。BS05双剣虎ジェン・フー：【神速】持ち1体につき）
    | { ownNexusColor: Color } // 自分のフィールドの指定色ネクサス数（BS03武器コレクターのゴドフリー：青のネクサス1つにつき）
    | { ownNexusNameIncludes: string } // 自分のフィールドで、カード名に指定文字列を含むネクサス数（同名重複もそのまま数える。ownNexusNameKindsAtLeastの「種類数」とは別軸。BS13-045巨人船長イアソンLv2：「カード名に「古代戦艦」と入っている自分のネクサス1つにつき」）
    | { enemyCost: { max?: number; min?: number } } // 持ち主から見た相手フィールドの、コスト条件を満たすスピリット数（instMatchesCostFilterで判定＝付与コストも見る。BS07バジリザード：コスト3以下の相手1体につき）
    | "opponentFieldColors" // 持ち主から見た相手フィールド（スピリット+ネクサス）の色の種類数（重複除く。多色は複数色、合体中ブレイヴの色も数える。shared/rules.opponentFieldColorCount。BS15共通器）
    | "opponentFieldSpiritColors" // opponentFieldColorsのスピリット限定版（ネクサスを含めない。BS15共通器）
    | "lastBattleDestroyedBp" // 直前のバトルで破壊されたスピリットの破壊直前の実効BP（記録が無ければ0）
    | "lastBattleDestroyedCost" // 直前のバトルで破壊されたスピリットのコスト
    | "lastBattleBlockerTrashCost" // このバトルでブロックした相手のスピリット（スピリットカードのみ）のうち、
    // バトル終了時点で防御側のトラッシュにあるカードの印刷コストの合計（26系【地鳴】の減算用。
    // resolveBattle が onBattleEnd 発火の直前に記録し、次のバトル解決の冒頭でリセット。
    // トラッシュ内の同名カードは区別しない簡略化）
    | { const: number } // 定数（減算算術の被減数に使う。【地鳴：N】のN）
    | "selfBofuCount"
