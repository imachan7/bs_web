// 効果まわりの2つの巨大な型は `types/` に切り出してある（2026-09-12）。
// ここから re-export しているので、利用側の import 文は変更不要。
export * from "./types/effectAction"
export * from "./types/effectDef"
// re-export は利用側に届くが、このファイル自身のスコープには入らないので明示的に読む
import type { EffectAction } from "./types/effectAction"
import type { EffectDef } from "./types/effectDef"

// プレイヤーIDやステップ名を厳格に定義（タイポを防ぎます）
// サーバー・クライアント両方から参照する共有型定義
export type PlayerId = "p1" | "p2"
export type Phase =
    | "start"
    | "core"
    | "draw"
    | "refresh"
    | "main"
    | "attack"
    | "end"

export type Color = "red" | "purple" | "green" | "white" | "yellow" | "blue"
// ブレイヴは「カードタイプ」。単体で場に出すとスピリットとして扱われ、
// 合体すると合体元と合わせて**1体のスピリット**になる（docs/design/BRAVE.md §1.1）
export type CardType = "spirit" | "nexus" | "magic" | "brave"

// **効果の発生源の種別は CardType をそのまま流す**（sourceType / srcType）。
// ⚠️ ブレイヴを "spirit" に丸めないこと（2026-08-25 ユーザー確認。docs/design/BRAVE.md §12）。
// 【装甲：色】の効果文は「相手の**スピリット/ネクサス/マジック**の効果を受けない」でブレイヴを列挙していないため、
// **ブレイヴ自身の効果（単体で場に出たブレイヴの召喚時など）は装甲では防げない**（防げるのは【重装甲】だけ）。
// 丸めると装甲が過剰に効く。一方、合体中にブレイヴがホストへ付与している効果の発生源は
// **合体スピリット＝スピリット**なので、そちらは装甲で防げる

// デッキの指定方法: DECK_RECIPES の色キー（"red" 等）またはカスタムデッキのカードリスト（cardId -> 枚数）
export type DeckSpec = string | Record<string, number>

// スピリット/ネクサスのレベル定義（ネクサスは bp: 0）
export interface LevelDef {
    level: number
    cores: number
    bp: number
}

// ブレイヴの合体条件（docs/design/BRAVE.md §2.2）。読点区切りの複数条件は配列＝OR。
// TargetFilter と軸が似ているが「対象は合体先スピリット1体」で意味が違うため共用しない
export interface BraveConditionTerm {
    family?: string // 系統
    minCost?: number // コスト◯以上（BS10 の18枚中12枚）
    cardName?: string // カード名指定
    vanilla?: true // **効果の記述を持たない**（BS10 の18枚中6枚。判定は instIsVanilla＝継続付与の「バニラとしても扱う」も見る）
}
export type BraveCondition = BraveConditionTerm | BraveConditionTerm[]

// コスト支払い時に使うコアの割り当て（自分のスピリット上またはネクサス上のコア）
export interface PaySource {
    instanceId: string
    count: number
}

// ---- 効果データ層（data.md 5.2） ----

// 系統フィルタ：単一文字列 or 配列（配列＝いずれかの系統を持てばよいOR条件）。
// bpBuffAll/bpBuff.familyFilter が使う。判定は EffectModules.matchesFamilyFilter に集約する
// （BS04エンジン拡張バッチ1。aura.familyFilter・AuraCounter{ownFamily}・keywordGrant.familyFilter は
// public/src/renderer.ts に同型の client-side ミラーがあり、そちらの型も連動改修が要るため今回は見送り。
// 対象カード（BS04-029/097）はbpBuffAll/bpBuffのみで表現できるため実害なし）
export type FamilyFilter = string | string[]

// ---- 対象選択の絞り込み軸（TargetFilter） ----
//
// 従来は destroy.maxBp / exhaust.levelFilter / refreshOne.colorFilter … のように、
// **同じ軸がアクションごとに個別フィールドとして後付けされていた**
// （BS01〜BS04 で計28個。全アクションフィールド117個の23%）。
// 新しいアクションはこの型を `filter` に持たせるだけでよく、エンジン改修なしで軸を組み合わせられる。
//
// 既存アクションの個別フィールドは normalizeFilter() がこの型へ畳み込むため **データ移行は不要**
// （cards.json は無変更のまま。個別フィールドの削除は第2段階の別タスク）。
export interface TargetFilter {
    maxBp?: number | "selfBp" // 実効BPがこれ以下。"selfBp"=発生源の実効BP以下（BS04七龍帝の玉座Lv2）
    minBp?: number | "selfBp" // 実効BPがこれ以上。"selfBp"=発生源の実効BP以上（BS05火龍王ボルケノス：BP7000以上）
    exactBp?: "selfBp" // 発生源と実効BPが同じものだけ（BS01プテラトマホーク）
    color?: Color // この色を持つ（多色カードはOR判定。instHasColor/cardHasColor 経由）
    colorExclude?: Color // この色を持つものを除外
    family?: FamilyFilter // 系統（配列＝いずれかでOR。付与系統も考慮）
    familyAll?: string[] // 指定した系統すべてを持つ（AND。familyのOR配列とは別軸。BS13-061戴冠する活火山Lv2：系統「地竜」と系統「竜人」両方）
    cost?: { max?: number; min?: number }
    level?: number[] // currentLevel がこれに含まれる
    minLevel?: number // currentLevel がこれ以上（levelの完全一致とは別軸。BS13-023マウンテン・セイカイLv1-3：「Lv2以上の自分のスピリットすべて」）
    keyword?: Keyword // 指定キーワード持ち（一時付与・継続付与も考慮）
    vanilla?: true // 効果テキストを持たないカードのみ
    minSymbols?: number // シンボル数がこれ以上
    symbolCount?: number // シンボル数が**これと完全一致**（minSymbols＝以上とは別軸。「シンボル1つを持つ相手のスピリット」「シンボル2つを持つ相手の合体スピリット」。instanceSymbolCountで判定＝合体しているブレイヴのシンボルも数える。BS12初出）
    excludeSelf?: boolean // 発生源自身を対象から外す
    cores?: number // 実際に置かれているコア数がこれと一致する（BS05ドラグノ爆弾兵：コア1個）
    maxCores?: number // 実際に置かれているコア数がこれ以下（cores＝完全一致とは別軸。BS03水龍王リヴァイア：コアが3個以下）
    uncombined?: true // **合体していない**スピリットだけ（instIsCombined が false。BS11-X04 宝瓶神機アクア・エリシオン＝リフレッシュステップで1体しか回復できない対象）
    rested?: true // 疲労状態（isRested）のものだけ（BS05吸血女王カーミラ：範囲破壊の疲労限定）
    refreshed?: true // 回復状態（!isRested）のものだけ（restedの逆。BS12-039導化姫トリックスターLv2＝「回復状態の相手のスピリット」）
    nameContains?: string | string[] // カード名にこの文字列を含むものだけ（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）。配列＝いずれかの文字列を含めばよい（OR。BS08ダークパワー：「ダーク」/「ブラック」）
    sameColorAsBattleLoser?: true // 直前のバトルで破壊された側と同じ色（normalizeFilter が state.lastBattleDestroyedColors を color 軸へ解決する。記録が無ければ対象なし。BS04獣使いドヴェルグ）
    sameFamilyAsBattleLoser?: true // 直前のバトルで破壊された側と同じ系統（normalizeFilter が state.lastBattleDestroyedFamilies を family 軸へ解決する。記録が無ければ対象なし。BS04ニーベルングリング）
    sameBpAsBattleLoser?: true // 直前のバトルで破壊された側と同じ実効BP（normalizeFilter が state.lastBattleDestroyedBp を exactBp 軸へ解決する。記録が無ければ対象なし。BS03熾烈極める最前線Lv2）
    lowerBpThanBattleLoser?: true // 直前のバトルで破壊された側より実効BPが低い（normalizeFilter が state.lastBattleDestroyedBp-1 を maxBp 軸へ解決する＝厳密な未満。記録が無ければ対象なし。BS10-X04月光龍ストライク・ジークヴルム Lv2：「そのスピリットよりBPの低い」）
    sameCostAsSelf?: true // self（＝この効果を解決するときの基準インスタンス。fieldEvent ではイベント対象＝召喚されたスピリット等）と同じコスト。normalizeFilter が cost 軸へ解決する。self がいなければ対象なし（BS09-060緑翼の大樹＝「そのスピリットと同じコストの相手」）
    maxCostAsSelf?: true // self と同じかそれ以下のコスト（sameCostAsSelfの以下版）。normalizeFilter が cost 軸（max）へ解決する。self がいなければ対象なし（BS10-X06天蠍神騎スコル・スピア＝「このスピリットのコスト以下の相手」）
    maxLv1BpOfSelf?: true // self（sameCostAsSelfと同じ意味＝fieldEventではイベント対象。召喚されたスピリット等）の**カードのLv1BP**（実効BPでなく印刷値。levels配列のlevel:1のbp）以下。normalizeFilter が maxBp 軸へ解決する。self がいなければ対象なし（BS10-080炎の結晶石Lv2＝「そのスピリットのLv1BP以下の相手のスピリット」）
    sameCostAsEventTarget?: true // **イベント対象**（ctx.targetInstanceId）と同じコスト（normalizeFilter が cost 軸へ解決する。対象が見つからなければ対象なし）。
    // 誘発ごとに「イベント対象」が何かは変わる: onBlocked なら**ブロッカー**（BS06計画された場外乱闘Lv2）、
    // onBlock なら**アタックしている相手**（SD02-002 ミザール）。かつて sameCostAsBlocker という名前だったが、
    // ブロッカー限定だと読める名前で実体と食い違っていたため 2026-08-16 に改名した
    unblockableOnly?: true // 「ブロックされない」効果を持つものだけ（継続的な制約 unblockableBy ／ターン限定の印 unblockableOnceThisTurn のどちらでもよい。BS09-049炎蜥蜴クトゥグマLv3）
    keywords?: Keyword[] // 指定したキーワードの**いずれか**を持つもの（keyword の複数版。OR。BS09-068ランドマイン＝覚醒/呪撃/神速/光芒/粉砕）
    keywordExclude?: Keyword // 指定キーワードを**持たない**もの（一時付与・継続付与も考慮。keyword の否定。BS07剣王獣ビャク・ガロウLv2＝【転召】を持たない相手）
    attackingOnly?: true // 現在のバトルのアタッカー（board.battle.attackerInstanceId）だけ。バトルが無ければ対象なし（「アタックしている自分のスピリット」。BS07桜の妖精オウカ）
    hasTrigger?: TriggerEvent // 指定トリガーの誘発効果を現在のレベルで静的に持つものだけ（instHasTriggerEffectで判定。継続付与は見ない。BS08プテラディア捕獲部隊＝『召喚時』効果持ち）
    // ---- ブレイヴ（BS10。docs/design/BRAVE.md）----
    combined?: boolean // true=**合体スピリット**（ブレイヴが合体している）だけ／false=**合体していない**スピリットだけ。
    // 判定は shared/rules.ts の instIsCombined（braveRefs を持つホスト ‖ 合体中のブレイヴ自身）。
    // BS10 に20枚以上ある（「相手の合体スピリット1体を破壊」／「合体していない相手のスピリット1体を手札に戻す」）
    braveInSpiritState?: true // **スピリット状態のブレイヴ**だけ（＝カード種別がブレイヴで、合体せず field.spirits にいる個体）。
    // BS10-083 魔星輝く古戦場Lv2／BS10-086 巨星望む大樹／BS10-X06 天蠍神騎スコル・スピア
}

// normalizeFilter() が self 相対のBP指定（"selfBp"）を数値へ解決した後の形。
// matchesTarget はこちらだけを見るため、インスタンス単位の純粋な述語でいられる
export interface ResolvedTargetFilter extends Omit<TargetFilter, "maxBp" | "minBp" | "exactBp"> {
    maxBp?: number
    minBp?: number
    exactBp?: number
}

// 効果の実行内容。EffectModules のアクションハンドラと 1:1 で対応する。
// 新しい効果を足すときは「ここに型を追加」→「ハンドラを追加」の2手で完結する。
export type EffectCounter =
    | "readyEnemies" // 相手フィールドの回復状態スピリット数
    | "exhaustedEnemies" // 相手フィールドの疲労状態スピリット数
    | "opponentHand" // 相手の手札枚数
    | "ownOtherSpirits" // self以外の自分フィールドのスピリット数
    | "ownReserve" // 自分のリザーブのコア数
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
    | "selfCores" // このスピリット（self）自身の上に置かれているコア数（selfがnullなら0。BS13-020ブッシュベイベ：「このスピリット上のコア1個につき」）
    | "selfSymbols" // このスピリット（self）自身が持つシンボル数（instanceSymbolCount。selfがnullなら0。BS05碧緑の竜使いグリューン：「このスピリットのシンボルと同じ数」）
    | "targetSameFamilyOwn" // 対象スピリットと系統を1つ以上共有する自分のスピリットの数（**対象自身も数える**。
    // 効果文が「このスピリット以外の」と書いていないため。SD02-015 フレンドリーパワー）。
    // targetSymbols と同じく bpBuffPer ハンドラが対象選択後に個別計算するので、countEffectCounter には来ない
    | "targetSymbols" // **対象スピリット自身**（bpBuffPerが解決するtargetInstanceId等）が持つシンボル数。selfSymbolsと異なりself（発生源）ではなく対象基準。マジックはself=nullのためselfSymbolsが使えない場合に使う（bpBuffPerハンドラが対象選択後に個別計算する。BS06サベージパワー）
    | "lastFunsaiTotal" // 直前の【粉砕】で破棄した総枚数（GameState.lastFunsai。次のアタック宣言でリセット。BS03巨人王ランドルフ）
    | "lastFunsaiSpirits" // 直前の【粉砕】で破棄したカードのうちスピリットカードの枚数（GameState.lastFunsai。BS04二刀流のアムブローズ）
    | "ownCombinedSpirits" // 自分のフィールドの合体スピリット数（braveRefsを持つホストの数。instIsCombinedで判定。BS10-029木星神龍ノブナガード・ゼウシスLv2-3＝「自分の合体スピリット1体につき」）
    | "ownBraveSpirits" // 自分のフィールドで**スピリット状態のブレイヴ**数（card.type==="brave"かつfield.spiritsにいる個体。合体中はfield.combinedBravesなので対象外。BS12-004ドラゴン・フェゼント：「自分のスピリット状態のブレイヴ1体につき」）
    | "ownLife" // 自分のライフのコア数（player.life）。BS13-061戴冠する活火山Lv2：「自分のライフのコア1個につき」
    | "selfBraveCount" // このスピリット（self）に合体しているブレイヴの数（self.braveRefs?.length。BS13-X01光龍騎神サジット・アポロドラゴン【合体中】Lv3：「このスピリットのブレイヴ1つにつき」）
    | "battlingOpponentCombinedSymbols" // 器YC：selfが参加している現在のバトルの相手側（state.battle.attacker/blockerInstanceId）が**合体スピリットのときだけ**そのシンボル数（instanceSymbolCount）、合体していない相手や非バトル中は0（BS12-036星犬ポメラン：「バトルしている相手の合体スピリットのシンボル1つにつき」）
    | "battlingOpponentSymbols" // battlingOpponentCombinedSymbolsの合体限定を外した版：selfが参加している現在のバトルの相手側のシンボル数（instanceSymbolCount）。合体していなくても数える。非バトル中は0（BS13-056ホーク・ブレイカー【合体時】：「バトルしている相手のスピリットのシンボル1つにつき」）
    | { ownFamily: string | string[] } // 配列＝いずれかの系統でOR（BS10-X02双魚賊神ピスケガレオン：「光導」/「星魂」）
    | { ownNameIncludes: string }
    | { anyNameIncludes: string } // 両陣営のフィールドでカード名にこの文字列を含むスピリット数（ownNameIncludesの両陣営版。BS06アルカナナイト・ヘクス：修飾なしの「スピリット」）
    | { ownColor: Color } // 自分のフィールドの指定色スピリット数
    | { ownColorSymbols: Color } // 自分のフィールドの指定色シンボルの合計数（BS04機動要塞キャッスル・ゴレム＝青シンボル）。**スピリットとネクサスの両方**を数える（2026-08-20 修正。以前はスピリットだけを見ていた）。数え方は shared/rules.countSymbols に一本化してあり、symbolFix による固定・バウンス待機の除外・「◯色としても扱う」で得た色も見る
    | { ownKeyword: Keyword } // 自分のフィールドで指定キーワードを持つスピリット数（静的・一時付与・継続付与すべて考慮。spiritHasKeywordで判定。BS05双剣虎ジェン・フー：【神速】持ち1体につき）
    | { ownNexusColor: Color } // 自分のフィールドの指定色ネクサス数（BS03武器コレクターのゴドフリー：青のネクサス1つにつき）
    | { ownNexusNameIncludes: string } // 自分のフィールドで、カード名に指定文字列を含むネクサス数（同名重複もそのまま数える。ownNexusNameKindsAtLeastの「種類数」とは別軸。BS13-045巨人船長イアソンLv2：「カード名に「古代戦艦」と入っている自分のネクサス1つにつき」）
    | { enemyCost: { max?: number; min?: number } } // 持ち主から見た相手フィールドの、コスト条件を満たすスピリット数（instMatchesCostFilterで判定＝付与コストも見る。BS07バジリザード：コスト3以下の相手1体につき）

// 誘発イベント（data.md 5.1 のイベント層）。
// ルール追加時はまず既存イベントで表現できるか検討する。
export type TriggerEvent =
    | "onSummon" // 召喚時
    | "onAttack" // アタック時
    | "onDestroy" // 破壊時
    | "onBattleWin" // BPを比べ相手のスピリットだけを破壊したとき（勝利時）。『バトル時』という表記のカードでも、効果文に『BPを比べ〜破壊したとき』が付いているものはこちら
    | "onBattleStart" // バトルが成立した時点（アタック宣言時またはブロック宣言時）で発火。勝敗を問わない「このスピリットのバトル時」はこちら
    | "onBattleLose" // BP比較で相手のスピリットに破壊されたとき（敗北時）。相打ちでは発火しない
    | "onBlock" // ブロック時
    | "onBlocked" // アタック中の自分スピリットが相手のブロック宣言を受けたとき（self=アタッカー）
    | "onBattleEnd" // バトル終了時（GameEngine.resolveBattleの最後。バトル参加者のうちまだ生存している個体に発火。コリスタル）
    | "onLifeDealt" // このスピリットのアタックによって相手のライフを減らしたとき（アタッカー側で発火。老賢樹トレントン）
    | "onRefreshed" // このスピリットが回復したとき（疲労状態から回復状態になった瞬間。リフレッシュステップ・効果による回復のいずれからも発火。BS07神凰兵フェニックス・ゴレム）
    | "onTenshoTarget" // このスピリットが【転召】の対象（生贄）になったとき（dumpAllCoresTenshoの唯一の解決点から発火。tenshoCoreSubstituteで疲労を選んだ場合も含め必ず発火する。BS08天使オリフィア）

// フィールドイベント誘発（data.md 5.1 のイベント層の追加分）。
// TriggerEvent は「効果の発生源となったスピリット自身に起きたこと」を起点とするが、
// fieldEvent は「フィールド上の他のスピリットに起きたこと」に対してネクサス等が反応する場合に使う
// （相手によってライフが減った／自分のスピリットが破壊された、など）。
export type FieldEvent =
    | "ownSeimeiLifeCharged" // 持ち主の【聖命】の効果でライフにコアが置かれたとき（lifeCharge の from:"void" が、【聖命】持ちの発生源から解決されたときだけ発火。BS09-064天駆ける方舟）
    | "ownLifeDamaged" // 相手によって自分のライフが減らされたとき
    | "ownSpiritDestroyed" // 自分のスピリットが破壊されたとき
    | "anySpiritAttacked" // 両陣営どちらかのスピリットがアタックを宣言したとき（self はアタックしたスピリット。魔帝の墓標Lv2）
    | "opponentDrew" // 持ち主から見て相手がデッキからカードをドローしたとき（GameState.draw から発火。シダフクロウ）
    | "opponentDrewByEffect" // 持ち主から見て相手が**効果で**（ドローステップ以外で）ドローしたとき（GameState.draw の fromDrawStep が false のときだけ発火。#26：ドローステップの枚数+2は該当しない。BS13-067光導く巨塔Lv2）
    | "anyNexusDestroyed" // 自分か相手を問わず、フィールドのネクサスが破壊されたとき発火（バウンス returnNexusToHand は対象外）
    | "ownBofuExhausted" // 自分のスピリットの【暴風】の効果で相手のスピリットが疲労したとき、その**【暴風】の持ち主**のフィールドから発火する（疲労1体につき1回）。exhaustSpirit が cause から発火させる（BS06ミストラルコア）
    | "ownHyohekiUsed" // 【氷壁】を発揮して自身を疲労させた時点で発火する（無効化が実際に成功したかは問わない。2026-09-07 ユーザー確認）。triggers.payMagicNegateが発火させる。eventTargetIsSelf:trueと組み合わせて発生源自身限定にする（BS12-032蹴激皇ヴィーザルLv2-3）
    | "ownNexusDestroyed" // 自分のネクサスが破壊されたとき、持ち主側のフィールドから発火（バウンス returnNexusToHand は対象外。シャークハンマー）
    | "ownMagicUsed" // 自分がマジックの効果を使用したとき（resolveMagicの効果実行後に発火。緑芽吹く原野）
    | "ownSpiritBlocked" // 自分のスピリットが相手のブロック宣言を受けたとき、持ち主のフィールド発生源から発火（targetInstanceId=ブロッカー。花の子リップ）
    | "ownSpiritDeclaredBlock" // 自分のスピリットがブロックしたとき、持ち主のフィールド発生源から発火（self=ブロックしたスピリット自身。GameEngine.finishBlockDeclarationから発火。BS10-088天貫く塔の城）
    | "ownFunsaiMilled" // 自分のスピリットの【粉砕】が相手のデッキをトラッシュへ送ったとき（発火は粉砕解決ごとに1回。repeatPerCount指定時は実破棄枚数ぶんアクションを繰り返す）
    | "opponentHandAdded" // 持ち主から見て相手の手札にカードが加えられたとき（notifyHandGainedから発火。犬人マードック／英雄の喪失）
    | "ownSpiritCoresRemovedByOpponent" // 自分のスピリット上のコアが相手の効果でリザーブ/トラッシュへ置かれたとき（eventCount=影響を受けた自分のスピリット数。極光の大地）
    | "ownSpiritSummoned" // 自分のフィールドにスピリットが召喚されたとき（doSummonの召喚時効果・転召の解決後に発火）。**self には召喚されたスピリットが渡る**（selfOverride）ため、maxBpFromSelf で「召喚されたスピリットのBP以下」を表現できる（BS04七龍帝の玉座Lv2／鋼葉の樹林Lv2）
    | "opponentDeckMilled" // 相手のデッキがトラッシュへ送られたとき（millDeckから発火。eventCount=実破棄枚数。minEventCountで「一度に◯枚以上」を表現。BS04アリゲイド）
    | "ownNexusDeployed" // 自分のフィールドにネクサスが配置されたとき（通常の配置・効果による配置・復活のいずれからも発火。BS04栄光の表彰台）
    | "opponentMagicUsed" // 相手がマジックの効果を使用したとき（resolveMagicから発火。eventInfoにcost/timingを載せ、magicCostEquals・magicTimingで絞る。BS04氷の女神フリッグ）
    | "anySpiritReturnedToHand" // 両陣営どちらかのスピリットがフィールドから手札に戻ったとき、**両者の**フィールド発生源から発火する（`subjectSide` で主体の陣営を絞る。anySpiritAttacked と同じ形）。ownSpiritReturnedToHand が持ち主側にしか発火しないため、「**相手の**スピリットが手札に戻ったとき」を書くにはこちらが要る（BS12-040 天王神龍スレイ・カエルス【合体時】）
    | "ownSpiritReturnedToHand" // 自分のスピリットがフィールドから手札に戻ったとき、持ち主のフィールド発生源から発火（returnSpiritToHand から。破壊は含まない。**self には戻ったスピリットが渡る**。BS01リターンドロー）
    | "ownSpiritExhausted" // 自分のスピリットが疲労したとき、持ち主のフィールド発生源から発火（**self には疲労したスピリットが渡る**。BS02生み出される尖兵Lv2／BS02スクルディア）
    | "anySpiritExhausted" // 両陣営どちらかのスピリットが疲労したとき、両者のフィールド発生源から発火（**self には疲労したスピリットが渡る**。BS05藍紫の虚空Lv1）
    | "ownSpiritDealtLife" // 自分のスピリットのアタックによって相手のライフを減らしたとき、持ち主のフィールド発生源から発火（**self にはライフを減らしたスピリットが渡る**。onLifeDealtの直後。BS06-X22魔界七将ベルゼビート）
    | "opponentCorePlaced" // 持ち主から見て相手のフィールド（スピリット/ネクサス上）かリザーブに、**効果によって**コアが置かれたとき。
    // eventCount=置かれたコアの個数。resolveAction が効果1つの前後でコアの居場所を突き合わせ、
    // **増えた側だけ**を合計して発火する（出所は問わない＝リザーブからスピリットへ移したものも1個と数える）。
    // 通常のコアステップ・コスト支払いのような効果によらない動きでは発火しない。
    // sourceColorFilter と組み合わせて使う（SD01-029 蠢く地下墓地Lv1）。docs/design/EFFECT_SOURCE_CONTEXT.md
    | "ownTensho" // 自分の【転召】が解決したとき（dumpAllCoresTenshoが唯一の解決点から発火。eventInfo.families=犠牲になったスピリットのカード静的な系統。BS08関将龍皇ドラグロン：系統「竜人」を持つスピリットで【転召】したとき）
    | "anySpiritCombined" // どちらかのスピリットにブレイヴが合体したとき（合体の唯一の入口 attachBrave から両フィールドへ発火）。**self には合体スピリット（ホスト）が渡る**（selfOverride）。subjectSide で自分/相手を絞る（BS11-064 闇の聖剣Lv2＝「相手のスピリットが合体したとき、その合体スピリットは疲労する」）
    | "ownCombinedSpiritBattleEnded" // 自分の合体スピリットがバトルし、バトル終了時にまだ生存しているとき、ネクサス等の発生源から発火（GameEngineのonBattleEnd誘発と同じ地点。selfには生存している合体スピリット自身が渡る。BS10-086巨星望む大樹Lv2）
    | "anyBraveSummoned" // **両陣営**どちらかのブレイヴが召喚されたとき（スピリット状態・合体を問わない）。発生源の持ち主から見て自分/相手いずれの召喚でも発火するため、エントリには必ずselfMode:"source"を付けて発生源自身を主体にする（BS12-061剣の誕生地Lv2）
    | "ownSpiritRefreshed" // 自分のスピリットが回復したとき、持ち主のフィールド発生源から発火（refreshSpiritの唯一の入口から。**self には回復したスピリットが渡る**）。excludeSelfAsEventTargetと組み合わせて「[カード名]以外の」を表現する（BS13-024武神獣ディアル・ユキムラLv2）
// ※ 疲労イベントは EffectModules.exhaustSpirit（疲労の唯一の入口）から発火する。アタック宣言・ブロック宣言・
//    効果による疲労のいずれも通る。すでに疲労している個体を疲労させ直しても発火しない

// キーワード効果。今後同名キーワードを持つカードが多数追加されるため、
// カードデータには名前だけを持たせ、挙動は EffectModules のレジストリで解決する。
export type Keyword =
    | "soku" // 神速：手札からフラッシュタイミングで召喚できる
    | "awaken" // 覚醒：フラッシュタイミングで自分のスピリットのコアを集められる
    | "superAwaken" // 超覚醒：【覚醒】＋**コアを置いたとき、このスピリットは回復する**（BS10-X01 幻羅星龍ガイ・アスラ）。
    // ⚠️ **【覚醒】とは別枠のキーワードにする**（2026-08-25 ユーザー確認）。将来「【超覚醒】を持つ〜」を
    // 参照する効果が出うるため。ただし「【覚醒】を持つ〜」の参照には**【超覚醒】も引っかかる**
    // （shared/rules.ts の KEYWORD_INCLUDES）
    | "clash" // 激突（将来弾用に予約）
    | "armor" // 装甲（将来弾用に予約）
    | "heavyArmor" // 重装甲：指定色の相手の**スピリット/ブレイヴ/ネクサス/マジック**の効果を受けない（BS12初出）。
    // ⚠️ 【装甲】の上位だが**別枠**（KEYWORD_INCLUDES に足さない。2026-09-03 ユーザー確認）。
    // 「【装甲】を持つ自分のスピリットすべて」（BS12-067 Lv2）に重装甲持ちは含まれない
    // （BS12-068 が「【装甲】/【重装甲】」と両方を併記しているのが根拠）。
    // 装甲との差は**ブレイヴの効果も防ぐ**ことだけ（shared/rules.ts の boardResistanceAgainst）
    | "jugeki" // 呪撃：アタック時、ブロックした相手スピリット1体をバトル終了時に破壊
    | "funsai" // 粉砕：アタック時、相手のデッキを上からこのスピリットのLvと同じ枚数破棄する
    | "kobo" // 光芒：アタック時、バトル終了時に自分がこのバトルで使用したマジックカードすべてを手札に戻す
    | "tensho" // 転召：召喚コスト支払い後、指定コスト以上の自分のスピリット1体の上のコアすべてを指定場所（トラッシュ/ボイド）に置く
    | "bofu" // 暴風：ブロックされたとき、**相手が**相手自身のスピリットを指定数だけ疲労させる（BS06初出）
    | "seimei" // 聖命：このスピリットのアタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く（BS07初出）
    | "kyoshu" // 強襲：アタック時、ターン中に指定数まで、自分のネクサス1つを疲労させることで自身を回復できる（BS07初出）
    | "hyoheki" // 氷壁：相手が指定色のマジックの効果を使用したとき、このスピリットを疲労させることでその効果を無効にする（BS08初出）
    | "fushi" // 不死：トラッシュにあるこのスピリットカードは、指定コストの自分のスピリットが破壊されたとき、
    // **通常のコストを支払って**召喚できる（BS09初出）。引き金のコストは keyword エントリの triggerCosts が持つ。
    // 発揮は『お互いのアタックステップ』限定で、破壊処理（＞６）のその場で確認する。
    // ⚠️「フィールドに残る」と同時発揮なので、ターンプレイヤーが決める解決順が結果を変える
    //   （残るを先に解決すると破壊されなかったことになり発動できない）。docs/design/BS09_PLAN.md §3
// ※ 暴風と同じく、seimei / kyoshu / hyoheki も**キーワードエントリ自体は宣言**で、挙動は対になる
//    エントリが持つ（seimei/kyoshu は triggered の onLifeDealt / onAttack、
//    hyoheki は kind:"magicNegate"（cost:{exhaustSelf:true}＋colors＋turn:"opponent"））。宣言があることで
//    「【聖命】を持つ自分のスピリットすべて」のようなキーワード指定の絞り込みが効く
// ⚠️ **上のコメントに書いた挙動が、そのままエンジンに実装されているとは限らない。** kobo / funsai / jugeki 等は
//    エンジンが keyword エントリを直接読んで動く（例: EffectModules.ts が e.keyword === "kobo" を見る）が、
//    宣言だけの4つ（bofu / seimei / kyoshu / hyoheki）は**対になるエントリを書かないと何も起きない**。
//    キーワード持ちを実装するときは、まず `grep -rn '"<キーワード>"' server/src/logic` でエンジン側の実装を確認し、
//    無ければ既存の同キーワード持ちカードのデータを1枚見て、その2件セットの書式を踏襲すること
//    （2026-08-27、BS10-047 で「【聖命】は宣言1件でよい」と誤って指示した。既存9枚は例外なく onLifeDealt を持っていた）

// 常時BP修正（オーラ）のカウンタ。発生源の持ち主基準で数える。
export type AuraCounter =
    | "ownReserve" // 自分のリザーブのコア数
    | "ownNexuses" // 自分のネクサス数
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "targetArmorColors" // **対象自身**（発生源ではない）が持つ【装甲】の指定色数。静的・一時付与・継続付与を合算・重複除く（BS05アイシクルアサルト）
    | "targetReductionSymbols" // **対象自身**の軽減シンボルの数（カード静的な reduction の個数。SD01-038 エメラルドブースト＝軽減シンボル1つにつきBP+1000）
    | { ownFamily: string } // 自分フィールドの指定系統を持つスピリット数（発生源自身も含む）
    | { ownNameIncludes: string } // 自分フィールドでカード名にこの文字列を含むスピリット数（発生源自身も含む。アルカナプリンス・オベロ）
    | { ownCost: number } // 自分フィールドの指定コストのスピリット数（発生源自身も含む。instHasCostで判定＝付与コストも考慮。BS06細剣の猫騎士ケット・シー）
    | "ownHand" // 自分の手札枚数（BS10-049妖精神官アンドロメダ：「自分の手札1枚につき、このスピリットをBP+1000する」）

// 常時BP修正（オーラ）の発動条件。満たすときのみ amount を適用する。
export type AuraCondition =
    | { hasOwnColor: Color } // 自分フィールドに指定色のスピリットまたはネクサスがある
    | { hasOwnColorSpirit: Color } // 自分フィールドに指定色のスピリットがいる
    | { hasOwnFamily: FamilyFilter } // 自分フィールドに指定系統のスピリットがいる（自身を含んでよい。配列＝いずれかの系統でOR。BS05黄道の虚空）
    | "ownReserveNotEmpty" // 自分のリザーブが1個以上
    | { ownHasKeyword: Keyword } // 自分フィールドに指定キーワードを持つスピリットがいる（spiritHasKeywordで判定、付与キーワードも考慮。ブロントライデント）
    | { ownLifeAtMost: number } // 自分のライフ（コア数）がこの値以下（BS06鉄拳のカクタスガルー：ライフ3以下の間BP+3000）
    | { opponentHandAtLeast: number } // 相手の手札枚数がこれ以上（PlayerView.handCountと同じ「非公開だが枚数だけは見える」情報。BoardPlayer.handCountがあればそれを、無ければhand.length（サーバー内部は常に実配列）を使う。BS08ブラックウガルルムLv2：相手の手札5枚以上

// 常時BP修正の定義
export interface AuraDef {
    type: "bp"
    target: "self" | "ownAll" // 発生源自身のみ / 発生源の持ち主のスピリットすべて
    colorFilter?: Color // ownAll 用: この色のスピリットのみ
    battlingOnly?: boolean // バトル中（アタッカーまたはブロッカー）のスピリットのみ。**target:"self" でも効く**（phaseTurn と同じく target を問わない。2026-08-16 修正）
    amount?: number // 固定量（condition と併用可）
    amountPer?: number // counter × amountPer の可変量
    counter?: AuraCounter
    condition?: AuraCondition // 満たすときのみ amount を適用
    summonedThisTurnOnly?: boolean // ownAll 用: 対象の summonedTurn === state.turn のスピリットのみ（このターン召喚されたスピリットに限定）
    keywordFilter?: Keyword // ownAll 用: 指定キーワード（静的付与・一時付与・keywordGrant すべて含む）を持つスピリットのみ（暴双龍ディラノス）
    keywordsFilter?: Keyword[] // ownAll 用: 指定キーワードの**いずれか**を持つスピリットのみ（keywordFilter の OR 版。1体が両方を持っていても加算は1回。BS11-081 ライトニングデリバリー＝【光芒】/【聖命】）
    phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // target問わず適用: 指定ステップかつ指定turn条件（own=発生源の持ち主がturnPlayer、opponent=持ち主が非turnPlayer、both=常に）のときのみ有効（アルマ・ジール／エメラルドに輝く鍾乳洞／アルカナプリンス・オベロ）
    minCores?: number // ownAll 用: 対象スピリットのコア数がこれ以上のときのみ有効（エメラルドに輝く鍾乳洞）
    coresExact?: number // ownAll 用: 対象スピリットのコア数がちょうどこの数のときのみ有効（BS03竜騎将ディライダロス：コア1個だけ）
    costFilter?: number // ownAll 用: 対象スピリットのコストがこれと一致するときのみ有効（太古の断層）
    costMinFilter?: number // ownAll 用: 対象スピリットのコストがこれ以上のときのみ有効（costFilter＝完全一致とは別軸。BS07造兵工房Lv2：コスト3以上）
    familyFilter?: FamilyFilter // ownAll 用: 指定系統（静的付与・familyGrant による付与を含む。matchesFamilyFilter で判定）を持つスピリットのみ。配列＝いずれかの系統でOR（ポム／BS04翼持つ者の空域）
    nameIncludesFilter?: string // ownAll 用: カード名にこの文字列を含むスピリットのみ（BS03アルカナビースト・ペイラ：カード名に「アルカナ」）
    vanillaFilter?: true // ownAll 用: カードに効果の記述を持たない（バニラ）スピリットのみ（無法者の荒野）
    lentOnly?: boolean // 仮想発生源（PlayerState.turnVirtualInstances。マジックが lendSelfThisTurn で貸した場合）からのみ有効。実在するスピリット/ネクサスからは適用しない＝恒久化を防ぐ（TURN_EFFECT_SOURCES.md。パワーオーラ等）
    attackingOnly?: boolean // ownAll 用: バトル中のアタッカーのみ（board.battle.attackerInstanceId と一致。battlingOnly と異なりブロッカーは含まない。オフェンシブオーラ／フォレストオーラ）
    blockingOnly?: boolean // ownAll 用: バトル中のブロッカーのみ（board.battle.blockerInstanceId と一致。attackingOnly の対。BS06希望の大灯台Lv2／アバランチオーラ）
    minSymbols?: number // ownAll 用: 対象スピリットのシンボル数（instanceSymbolCount）がこれ以上のときのみ有効（一角竜ヴォルスング）
    reductionColorsAtLeast?: number // ownAll 用: 対象スピリットの**軽減シンボルの色数**（重複除く。カード静的な reduction を見る）がこれ以上のときのみ有効（BS09-003角竜人ドラケンLv2＝2色以上）
    turn?: "own" | "opponent" | "both" // target問わず適用: フェーズを問わず指定turn条件の間だけ有効（phaseTurnのphase必須版とは別軸。『自分のターン』のようにステップ不問の継続効果用。BS10-079そびえる机山群Lv1）
    combinedFilter?: true // ownAll 用: 対象スピリットが合体スピリット（instIsCombinedがtrue）のときのみ有効（BS10-097ブレイヴオーラ：合体スピリットへの追加BP）
    braveOnly?: true // ownAll 用: 対象がブレイヴカード（card.type==="brave"）のときのみ有効。合体中のブレイヴはfield.spiritsに実体を置かない（BRAVE.md §2.4）ため、
    // ownAllの走査に来た時点で自動的に「スピリット状態のブレイヴ」を意味する（BS10-086巨星望む大樹Lv1：自分のスピリット状態のブレイヴすべて）
}

// クライアント演出用のゲームイベント（アクション単位の一時データ）。
// GameEngine.handleAction の冒頭で state.events をクリアし、1アクションで発生した分だけを
// クライアントへ配信する。seq は state.eventSeq の通し番号（クリアしてもリセットしない）で、
// クライアントは前回処理済みの seq より大きいものだけをアニメーション再生する。
export type GameEvent =
    | { seq: number; type: "summon"; pid: PlayerId; cardName: string } // 召喚（神速召喚含む）
    | { seq: number; type: "destroy"; pid: PlayerId; cardName: string } // 破壊・消滅（cause問わず）
    | { seq: number; type: "draw"; pid: PlayerId; count: number } // ドロー
    | { seq: number; type: "lifeDamage"; pid: PlayerId; amount: number } // ライフのコアが減った（このpidが被弾した側）
    | { seq: number; type: "magic"; pid: PlayerId; cardName: string } // マジック使用
    // 破壊以外でフィールドを離れたとき（バウンス／デッキ戻し）。破壊と同じくクライアントが通知を出す（UI担当依頼 2026-08-10）。
    // pid は**カードの持ち主**（＝戻された側）。sourceName は戻した効果の発生源カード名（分かる場合のみ）
    | { seq: number; type: "returnToHand"; pid: PlayerId; cardName: string; sourceName?: string } // フィールドから手札へ戻った（スピリット／ネクサス）
    | { seq: number; type: "returnToDeck"; pid: PlayerId; cardName: string; position: "top" | "bottom"; sourceName?: string } // フィールドからデッキへ戻った

// ブロック可否などの制約定義（RuleValidator が参照する宣言的ルール）
// **エンドステップを数える封印**（BS10-108 ルナティックシール）。
// 「『自分のエンドステップ』を3回行うまで、お互い、アタックステップは行えず、デッキは破棄されず、
// ボイド/リザーブからライフにコアを置けない」。
//
// カードは「ボイドからコア3個をデッキの横に置き、『自分のエンドステップ』に1個ずつボイドに置く」と書くが、
// **置かれたコアは以後どこからも参照されない**ため、実体のコアではなく**カウンターとして持つ**
// （2026-08-25 ユーザー確認）。remaining がそのままデッキの横のコア数で、画面にもこれを出す。
export interface EndStepLock {
    pid: PlayerId // 発揮した側。**このプレイヤーのエンドステップ**で remaining が1減る
    remaining: number // 残り回数（＝デッキの横のコア数）。0 になったら解ける
    cardId: string // 表示用。どのカードによる封印か
    locks: ("attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve" | "summonTrigger")[] // 何を止めるか。**両陣営に効く**
}

export type ConstraintDef =
    | { type: "cantBlock" } // このスピリットはブロックできない
    | { type: "canBlockUnblockable" } // このスピリットは、「ブロックされない」効果を持つ相手のスピリットもブロックできる（継続的な制約・ターン限定の印の**どちらも**乗り越える。2026-08-14 ユーザー確認。BS09-049炎蜥蜴クトゥグマ）
    | { type: "cantBlockLowerBp" } // 自分より実効BPが低いアタッカーをブロックできない
    | { type: "unblockableBy"; levelAtMostAttacker?: true; colorFromChosen?: true; colorFilter?: Color; keywordFilter?: Keyword; keywordFilterAbsent?: Keyword; maxCores?: number; maxCost?: number; maxBp?: number; levelFilter?: number[]; costNot?: number; costAtMostAttacker?: true; nonVanilla?: true; requireOwnFieldColorNexus?: Color; requireOwnCostCountAtLeast?: { cost: number; count: number } } // maxBp指定時はブロッカーの実効BPがこれ以下ならブロックされない（BS07鋼翼魚オルカノンLv2＝BP4000以下）。maxCost指定時はブロッカーのコストがこれ以下ならブロックされない（costNot＝完全一致の否定とは別軸。instMatchesCostFilterで判定＝付与コストも見る。BS07聖なる命の泉Lv2）// nonVanilla指定時は「カードに効果の記述を持つ」スピリットにブロックされない（isVanillaCardの否定。BS05幻獣王リーンLv3）／requireOwnCostCountAtLeast指定時は、持ち主のフィールドに指定コストのスピリットがcount体以上いる間だけ有効（activeConstraintsが判定して外す。BS05幻獣王リーンLv3＝コスト2が3体以上） // requireOwnFieldColorNexus指定時は、持ち主のフィールドに指定色のネクサスがある間だけ有効（BS03鷹人ホークアイLv2＝紫のネクサス） // このスピリットのアタックは、指定色／指定キーワード持ち／コア数がmaxCores以下／currentLevelがlevelFilterに含まれる／コストがcostNot以外のスピリットにブロックされない。costAtMostAttacker指定時はブロッカーのコストがこのアタッカーのコスト以下ならブロックされない（BS05ポテンシャルパワー：バニラのアタックは同コスト以下にブロックされない）。keywordFilterAbsent指定時はこのキーワードを持た**ない**スピリットにブロックされない（keywordFilterの否定版。BS08光帝竜騎アルカナジョーカーLv3＝【転召】を持たない相手）
    | { type: "blockRequiresCount"; count: number } // このスピリットのアタックは、相手がスピリットをcount体そろえてブロック宣言しないとブロックできない（BS10-X03巨蟹武神キャンサード＝2体）。
    // 効果文は「スピリット2体か、**アルティメット1体**でないとブロックできない」だが、アルティメットは未実装のため2体ブロックだけを見る。
    // count体そろえられないときはブロックそのものができない。宣言は BattleState.pendingBlockerIds に貯まり、
    // そろった時点で**アタック側**がどれとバトルするかを選ぶ（PendingChoice.blockBattlePick。「どれか1体とだけバトルする」）
    | { type: "mustAttack" } // このスピリットはアタックできるとき、必ずアタックしなければならない
    | { type: "protectOwnLifeByBpUpToSelf" } // ブロックされなかったアタッカーの実効BPが**この発生源自身の実効BP以下**のとき、そのアタックでは発生源の持ち主のライフは減らされない（片側のみ。ライフダメージ直前に activeConstraints から発生源ごとのBPを引き直して比較する。BS08空帝竜騎プラチナム）
    | { type: "untargetableByOpponent" } // このスピリットは相手のスピリット/マジックの効果の対象にならない（クイーン・ワルキューレ。範囲効果には無力）
    | { type: "immuneToOpponentSummonEffects" } // このスピリットは、相手のスピリットの『このスピリットの召喚時』効果を受けない（isEffectBlockedがGameState.resolvingSummonTriggerPidを見て判定する。BS05リトルナイト・ランスロットLv3）
    | { type: "immuneToOpponentEffects"; against?: "spirit" | "brave"; whileOwnNexusCount?: number } // このスピリットは、相手のスピリット/マジックの効果を受けない（untargetableByOpponentと異なり範囲効果にも有効。ネクサスの効果・自分の効果は通る。BS04ワルキューレ・ヒルド）。against:"spirit"指定時は相手の**スピリットの**効果のみ（マジックは通る。BS10-091シャボンの湖畔Lv2＝「相手のスピリットの効果を受けない」）。whileOwnNexusCount指定時は「持ち主のフィールドのネクサス数がちょうどこの数の間」だけ有効（BS11-027 海戦機ニヨルド）。against:"brave"指定時は相手の**ブレイヴの**効果のみ（BS11-055 ジャノメ・シールダーの【合体時】＝「相手のブレイヴの効果を受けない」。合体中のブレイヴが発生源のとき srcType は "brave" になる）
    | { type: "canDirectAttack"; targetFilter: "rested" | "singleCore" | "recovered" | "any"; targetMinBp?: number; targetMinCost?: number; targetCombinedOnly?: true; targetHighestBp?: true } // targetCombinedOnly指定時は相手の**合体スピリット**しか指定できない（instIsCombinedで判定。BS11-X02 滅神星龍ダークヴルム・ノヴァ）。// targetMinCost指定時は相手スピリットのコストがこれ以上のもののみ指定できる（instMatchesCostFilterで判定＝道化師クランの付与コストも見る。BS05天焦がす大聖火Lv2：コスト5以上） // 相手スピリット1体を指定してアタックできる（targetFilter: rested=疲労状態のみ、singleCore=コア1個のみ、recovered=回復状態のみ、any=状態条件なし。イリュージョナ／牛霊スモゥグ／オルカリア）。targetMinBp指定時は相手スピリットの実効BPがこれ以上のものだけ指定できる（BS05シンクロニシティ：BP4000以上。BP条件だけで絞りたい場合はtargetFilter:"any"と組み合わせる）
    | { type: "cantCombine" } // このスピリットにはブレイヴを合体できない（BS11-X02 滅神星龍ダークヴルム・ノヴァ＝「このスピリットは合体できない」）。判定は shared/summon.ts の braveCombineCandidates（合体先の候補から外す）
    | { type: "combineLimit"; limit: number } // このスピリットに合体できるブレイヴの上限数（既定1）。判定はshared/summon.tsのcombineLimitFor（braveCombineCandidates／RuleValidatorのダイレクトブレイヴ判定が共通で読む。器P。BS13-X01光龍騎神サジット・アポロドラゴン：「ブレイヴ2つまでと合体できる」）
    | { type: "ignoreBraveCondition" } // 器BI：このスピリットには、合体条件を満たさないブレイヴも合体できる（matchesBraveConditionが最初に見る。BS13-X05麒麟星獣リーン：「合体条件を無視して合体できる」）
    | { type: "cantSeparate" } // この合体スピリットは分離できない（BS13-005強暴竜ディラノ・レックス：【超覚醒】を持つ自分の合体スピリットすべて）。判定はactiveConstraintsを見る3入口（メインステップの任意分離 validateDetachBrave／効果による自分の分離 detachBraveByEffect／相手の効果による分離 detachBraveByOwnerChoice）すべてで共有する
    | { type: "cantAttack"; unlessOpponentHasColorSpirit?: Color; whileOwnNexusCount?: number } // このスピリットはアタックできない（カイザレオン大帝Lv1）。whileOwnNexusCount指定時は「持ち主のフィールドのネクサス数がちょうどこの数の間」だけ有効（BS11-027 海戦機ニヨルド＝ネクサスが1つだけある間）。unlessOpponentHasColorSpirit 指定時は「持ち主から見た相手のフィールドに指定色のスピリットがいない間」だけ有効（activeConstraints が判定して外す。BS04鎧装獣ヘイズ・ルーン＝赤）
    | { type: "lifeDamageToVoid" } // このスピリットがアタッカーとしてライフダメージを与えるとき、相手のライフから取り除かれるコアはリザーブでなくボイドへ（スライミーLv3）
    | { type: "noRestWhenBlockingColor"; color: Color } // このスピリットが指定色のスピリットをブロックしたとき疲労しない（巨神機トール）
    | { type: "noRestWhenBlockingCost"; maxCost?: number; sameCost?: true } // このスピリットが、コストmaxCost以下（sameCost指定時は自身と同じコスト）の相手のスピリットをブロックしたとき疲労しない（noRestWhenBlockingColor の兄弟。BS07シルバー・ゴレム／造兵工房）
    | { type: "noRestWhenBlockingWithoutKeyword"; keyword: Keyword; oncePerTurn?: true } // このスピリットが、指定キーワードを**持たない**相手のスピリットをブロックしたとき疲労しない（noRestWhenBlockingColor/Cost の兄弟。BS07ブリシンガメンの首飾りLv2＝【転召】を持たない相手）。
    // oncePerTurn 指定時は「ターンに1回」に制限する（消費した**発生源**を PlayerState.noRestWhenBlockingUsedThisTurn に記録。ネクサス1枚につき1回なので、同名を2枚置けば2回使える。2026-08-24）
    | { type: "noRefresh" } // このスピリットはリフレッシュステップで回復しない（スクルディア）
    | { type: "coresCantBeRemoved" } // **お互い、このスピリットのコアを取り除けない**（BS10-X01 幻羅星龍ガイ・アスラ）。
    // 2026-08-25 ユーザー確認で「文字どおり。効果でもプレイヤーによる操作でも取り除けない」。
    // ⚠️ **自分の効果・自分の操作も止める**ので、`boardResistanceAgainst` の「ここから下は相手の効果限定」
    // より**前**で判定する（battlingEffectImmune と同じ位置）。
    // プレイヤー操作は3入口で止める：コアの手動移動（moveCore）・コストの支払い元（validatePaySources）・
    // 【覚醒】の移動元（validateAwaken）
    | { type: "tenshoCoreSubstitute"; mode?: "rest" | "returnToHand"; familyFilter?: FamilyFilter; costFilter?: number } // このスピリットが【転召】の対象になったとき、疲労していなければ、疲労することでコアすべてを指定場所に置いたものとして扱う（実際にはコアを失わない代替。dumpAllCoresTenshoが判定する。BS05の竜使い6枚）。familyFilter/costFilter指定時は対象スピリットの絞り込み用（自分自身ではなく**他の発生源から宣言**される想定＝BS12-061剣の誕生地。この場合、疲労するのは対象スピリットではなく**宣言した発生源自身**。activeConstraintsWithSourceが familyFilter/costFilter 一致で他の発生源から合流させる）
    // mode:"returnToHand" 指定時は、疲労の代わりに**このスピリットを手札に戻す**ことで同じ扱いにする
    // （SD02-009 獣将軍クジャルタ）。手札に戻る＝通常のバウンスなので**上のコアはリザーブへ行く**
    // （「指定場所に置いたものとして扱う」は【転召】の条件を満たすための扱いで、実際に置くわけではない。
    //  2026-08-16 ユーザー確認）。疲労版と違い、既に疲労していても使える。「疲労させることで」は**任意**なので、interactiveTargets時は「疲労する／コアを置く」の選択を出す（自動時は疲労を選ぶ決定的簡略化）
    // levelAtMostAttacker：ブロッカーのcurrentLevelがアタッカーのcurrentLevel以下ならブロックできない
    // （costAtMostAttacker の Lv 版。SD02-012 天の城門Lv2＝「同じLv以下の相手のスピリットからブロックされない」）
    | { type: "canBlockWhileRested"; targetMaxCost?: number; targetKeywordExclude?: Keyword; targetMaxBp?: number; targetCombinedOnly?: true } // このスピリットは疲労状態でもブロックできる（shared/block.canBlockが判定）。targetMaxCost指定時はアタッカーのコストがこれ以下のときのみ（BS06計画された場外乱闘Lv1-2：コスト1以下）。targetKeywordExclude指定時はアタッカーがそのキーワードを持たないときのみ（spiritHasKeyword判定＝一時付与も見る。BS08一角魚モノケロック：【転召】を持たない相手のスピリット）。
    // 器AL：targetMaxBp指定時はアタッカーの実効BPがこれ以下のときのみ（BS13-029剣馬グラニムLv1-3＝BP6000以下）。targetCombinedOnly指定時はアタッカーが合体スピリット（instIsCombined）のときのみ（BS13-029Lv2-3）

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "singleCoreCantAttack" } // コア1個しか置いていないスピリットは、アタックができない（ブロックは可能。singleCoreCantActのアタック限定版。両陣営。BS08赤き砂の座）
    | { type: "opponentCantAttackByCost"; costs: number[] } // **発生源の持ち主から見た相手**のスピリットのうち、コストが配列のいずれかと完全一致するものはアタックできない（ブロックは可能。片側限定＝costCantActの「両陣営・アタックもブロックも不可」とは別枠。BS12-X05戦神乙女ヴィエルジェ：コスト2/3/5/7/11）
    | { type: "cantAttackByCost"; costs: number[] } // 器AW：opponentCantAttackByCostの**両陣営版**。コストが配列のいずれかと完全一致するスピリットは、持ち主を問わずアタックできない（ブロックは可能。BS13-035オリンピアの天使オク：コスト0/1/4）
    | { type: "noLifeDamageByCost"; maxCost?: number; costs?: number[]; keywordExclude?: Keyword; maxBp?: number; symbolCount?: number; combinedOnly?: true; ownOnly?: true; attackerLevel?: number } // symbolCount+combinedOnly指定時は「シンボル数がsymbolCountちょうど、かつ合体スピリット」のアタックでのみ保護する（両条件を優先し、maxCost等とは併用しない。BS12-020一番槍のシベルザ：「シンボル2つを持つ合体スピリットのアタックでは」） // maxBp指定時は実効BPがこれ以下のスピリットのアタックで判定する（コストでなくBPで縛る形。BS09-031守護巨獣ガラパーゾ＝BP3000以下）。// コストがmaxCost以下のスピリットのアタックでは、お互いのライフは減らされない（両陣営。BS07の「勇傑」各色に共通）。costs指定時はmaxCostの代わりに**コスト完全一致**（配列＝いずれかに一致。instAllCostsのいずれかが含まれればよい。BS08守護機獣スノパルド：コスト3/4）。keywordExclude指定時は、アタッカーがそのキーワードを持つときは保護しない（spiritHasKeyword判定。同カード：【転召】を持たない） symbolCount指定時（combinedOnlyなし）はシンボル数がちょうど一致するアタックのみ保護。ownOnly指定時は**発生源の持ち主だけ**を守る（両陣営でなく片側。BS12-069定規山脈Lv2：「シンボル2つを持つ相手のスピリットのアタックでは、自分のライフは減らない」） attackerLevel指定時はmaxCostと**両方満たすとき**だけ保護する（AND。器BA。BS13-070星宿の障壁：コスト3以下かつLv1のアタック）
    | { type: "opponentNexusesUnexhaustable"; phase?: Phase } // 発生源の持ち主から見た**相手**のネクサスは疲労させられない（【強襲】の疲労元や、ネクサスを疲労させる支払いを止める）。phase指定時はそのステップ中のみ（BS09-063花の宮殿Lv2＝『お互いのアタックステップ』）
    | { type: "cantReduceOpponentLifeWhileSelfRefreshed" } // **発生源が回復状態の間、発生源の持ち主は相手のライフを減らせない**（片側のみ。Lv3で自分を回復させる効果の見返りの制約。BS11-X06 天秤造神リブラ・ゴレムLv3。2026-09-02 ユーザー確認で「文面どおり」）
    | { type: "noDrawInMain" } // 両陣営とも、**メインステップの間はドローできない**（BS11-065 満天の牧草地Lv1-2＝「お互い、ドローできず、手札を破棄できない」のドロー側。
    | { type: "noHandDiscardInMain" } // 両陣営とも、**メインステップの間は手札を破棄できない**（BS11-065 満天の牧草地Lv1-2の破棄側。判定は shared/rules.ts の canDiscardHand に寄せる。コストとしての破棄も止まる＝COST_MODEL.md §1）
    | { type: "noRefreshByNexusOrMagic" } // 両陣営のスピリットは、ネクサス/マジックの効果では回復しない（スピリットの効果とリフレッシュステップは通る。BS09-047鮫人サンゴジョー）
    | { type: "refreshOnlyOneUncombined" } // 両陣営とも、リフレッシュステップで**合体していないスピリットは1体しか回復できない**（どれを回復させるかはそのステップのプレイヤーが選ぶ。BS11-X04 宝瓶神機アクア・エリシオン）
    | { type: "nexusesCantRefresh" } // 両陣営とも、リフレッシュステップでネクサスすべては回復しない（BS11-X04 同上）
    | { type: "opponentCombinedCantRefresh" } // 発生源の持ち主から見た**相手**の合体スピリットすべては、リフレッシュステップで回復しない（片側のみ。BS11-X04【合体中】Lv3）
    | { type: "opponentCantSpiritStateBrave" } // 発生源の持ち主から見た**相手**は、ブレイヴをスピリット状態にできない（片側のみ。BS11-X02 滅神星龍ダークヴルム・ノヴァLv3）。止めるのは3経路：メインステップの任意分離／場を離れるときの「残す」／ブレイヴ単体（合体先なし）の召喚
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）
    | { type: "ownLifeFloor"; floor: number } // **発生源の持ち主だけ**のライフはfloorを下回らない（globalConstraintの他の型と違い片側のみ。既存turnConstraints.lifeFloorForPidの「このターンの間」版に対する常在・条件式版。condition:{ownFamilyCountAtLeast}と組み合わせて使う。BS12-070天の階Lv2＝「自分のフィールドに系統：「天霊」を持つスピリットが5体以上いる間、自分のライフは0にならない」floor:1）
    | { type: "ownLifeImmuneToSpiritEffects" } // **発生源の持ち主だけ**：相手のスピリットの効果（lifeCrush系。バトルの攻撃ダメージは含まない＝negateLifeDamageFromTargetが別途カバー）ではライフが減らない（ownLifeFloorと同じ片側パターン。shared/rules.ownLifeImmuneToOpponentSpiritEffectsが判定。BS13-027ムーンショウウオLv2：「相手のスピリットの効果では、自分のライフは減らされない」）
    | { type: "attackOncePerTurnBySymbolCount"; symbolCount: number } // 両陣営とも、シンボル数がちょうどsymbolCountのスピリットはターンに1回しかアタックできない（CardInstance.attackedThisTurnで判定。RuleValidator.validateAttackが見る。BS13-068遥かなる衛星砲：「シンボル2つを持つスピリットはターンに1回しかアタックできない」）
    | { type: "ownNexusIndestructible"; colors?: Color[]; sourceColors?: Color[]; sourceTypes?: CardType[] } // colors指定時は、そのいずれかの色を持つネクサスだけを守る（BS09-062ノルンの泉Lv2＝白/黄）。// 発生源の持ち主のネクサスすべては、相手の効果によって破壊されない。
    // sourceColors / sourceTypes 指定時は、**破壊しようとしている効果の発生源**をさらに絞る（SD01-032 機械神の加護＝「相手の赤のスピリット/マジックの効果では」）。
    // どちらかを指定した場合は DestroyContext が要り、発生源が不明なときは**守らない**側に倒す（colors と同じ方針）。
    // 「相手の」を明示している効果なので、指定時は sourcePid が持ち主と異なることも求める
      // （hasGlobalConstraintの両陣営走査とは異なり、destroyNexusが破壊対象ネクサスの持ち主のフィールドのみを判定する。サファイアの城壁）
    | { type: "maxSpiritsOnField"; max: number } // 両陣営とも、フィールドのスピリットがmax体以上のときは召喚できない（メインステップの通常召喚のみ。BS04旋風渦巻く渓谷＝5体以上召喚できない＝max4）
    | { type: "levelCantAct"; levels: number[] } // currentLevel がこのリストに含まれるスピリットは、アタックとブロックができない（両陣営。costCantAct のレベル版。BS07腐りゆく湖沼Lv2＝Lv1）
    | { type: "costCantAct"; maxCost?: number; costs?: number[] } // コストがmaxCost以下のスピリットは、アタックとブロックができない（両陣営。shared/rules.tsの専用判定costCantActが参照。BS05白夜の虚空Lv1=maxCost1、青嵐の虚空Lv1=maxCost2）。costs指定時はmaxCostの代わりにこのリストと完全一致するコストのみ対象（BS02グレートウォール：コスト6と8）
    | { type: "millCap"; maxCount: number; perTurn?: boolean; mutual?: true } // 発生源の持ち主のデッキは、相手の効果によるミル（mill/millPer/粉砕/voidCoresAndMillByCost等）でmaxCount枚を超えて破棄されない
      // （ownNexusIndestructibleと同様に発生源の持ち主のみに効く。EffectModules.millCapForがeffectSources経由で判定＝lendSelfThisTurnで貸与可。
      // perTurn省略時=1回のミルにつきmaxCount枚まで（BS05エターナルシールド：5枚まで＝6枚以上破棄されない）。
      // perTurn:true=ターン累計でmaxCount枚まで（GameState.millCountThisTurnで加算管理。BS04侵されざる聖域Lv2：ターンに5枚まで）
      // 器AM：mutual指定時は「相手の効果によるミルだけ」というこの型の既定を外れ、**お互いのデッキを、
      // 発生源の持ち主自身の効果によるミルも含めて**maxCount枚（perTurn前提）まで守る（GameState.millCountThisTurnMutualで加算管理。
      // EffectModules.mutualMillCapRemainingForが両陣営のeffectSourcesを見て判定。BS13-026キグナ・スワンMk-II：「お互いのデッキは〜ターンに3枚までしか破棄されない」）
    | { type: "restedNexusEffectsDisabled" } // **疲労状態のネクサスすべての効果は発揮されない**（両陣営。BS10-074 きぐるみクマッター）。
    // nexusEffectsDisabled（相手のネクサスを丸ごと止める）の疲労限定版。effectSources が疲労したネクサスを外す
    | { type: "battlingCoresProtected" } // 現在バトルをしている両陣営のスピリット上のコアは、効果（コア除去アクション）によって取り除かれない
    | { type: "battlingEffectImmune" } // 現在バトルをしている両陣営のスピリットは、お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る。EffectModules.isEffectBlocked が破壊・コア除去・疲労・バウンス等のガードから参照。BS05茨の決戦地Lv2）
    | { type: "coresToOpponentReserveGoToTrash" } // 発生源の持ち主から見た**相手**のリザーブへ、スピリット/ブレイヴ/マジックの効果で置かれるコアはその相手のトラッシュへ振り替えられる（両陣営の発生源が効く＝主語なし。ネクサスの効果・ルール処理（バトル敗北・場を離れるとき等）は対象外＝効果によるコア移動だけ。removeCores〈removal.ts〉の共通フックで判定。coreSqueezeAll等の直接操作系はこの経路を通らないため対象外＝簡略化。BS12-X02魔羯邪神シュタイン・ボルグLv2-3）
      // （removeCores/removeCoresToTrash/removeCoresToVoidの共通フックで判定。coreSqueezeAll/One・coreDrainAllOthers・coreToVoidOwnなど
      // 直接コアを操作する一部アクションはこの経路を通らないため対象外＝簡略化。BS05茨の決戦地Lv1-2）
    | { type: "noTrashRecovery" } // お互い、トラッシュからカードを手札に戻せない（recoverSpiritFromTrash / recoverMagicFromTrash / recoverAllMagicFromTrashByColorChoice の各ハンドラ冒頭で判定。BS06鎖縛の武舞台Lv1-2）
    | { type: "noOpponentTriggerByColor"; color: Color; triggers: TriggerEvent[] } // 発生源の持ち主から見た**相手**の、指定色のスピリットの、指定した『〇〇時』効果は発揮されない
    // （noSummonTriggerByCost と違い両陣営ではなく片側だけ。SD01-031 朝焼け岬Lv2＝相手の紫の『召喚時』と『破壊時』）。
    // ⚠️ 封じられるのは『』でカテゴライズされた効果＝`kind:"triggered"` だけで、
    // ネクサス等の**常在効果**による「破壊されたときフィールドに残る」（`kind:"reviveOnDestroy"`）は封じられない
    // （2026-08-16 ユーザー確認。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）。
    // fireTrigger の入口で判定するため、この2つが自然に分かれる
    | { type: "opponentMagicCostIncrease"; amount: number } // 発生源の持ち主の**相手**は、マジックの効果を使用するとき amount コスト余分に支払う（BS10-077 ギョクリューン）。
    // opponentSummonCostIncrease のマジック版。shared/cost.ts の effectiveCost が読む
    | { type: "opponentSummonCostIncrease"; amount: number; maxCost?: number; keywordExclude?: Keyword } // 発生源の持ち主の**相手**は、
    // 条件を満たすスピリットカードを召喚するときコストを amount だけ余分に支払う
    // （maxCost=カード記載コストがこれ以下のもの限定／keywordExclude=そのキーワードを持たないもの限定）。
    // SD02-013 転召の祭壇Lv1-2＝「【転召】を持たないコスト3以下のスピリットカードを召喚するとき、1コスト余分に」
    | { type: "noSummonTriggerByCost"; maxCost?: number } // お互い、コストがmaxCost以下のスピリットの『このスピリットの召喚時』効果は発揮されない（召喚時トリガーの発火直前に判定して落とす。BS08共鳴する音叉の塔：コスト4以下）。**maxCost省略時はコストを問わずすべて**（BS11-072 未完成の古代戦艦：船尾Lv2＝「『このスピリットの召喚時』効果と『このブレイヴの召喚時』効果は発揮されない」）。エントリの phase / turn を書けばその区間だけ有効になる
    | { type: "noVoidToLife" } // お互い、ボイドからライフにコアを置けない（lifeCharge の from:"void" を落とす。【聖命】も止まる。BS11-072 未完成の古代戦艦：船尾Lv1-2）
    | { type: "noReductionBySummonCost"; maxCost: number } // お互い、コストがmaxCost以下のスピリットカードを召喚するとき、軽減シンボルによるコスト軽減ができない（**カード静的なコスト**で判定＝軽減前の値。使用コスト計算の共通経路で軽減分を0にする。BS08超時空重力炉：コスト3以下）
    | { type: "coreFloorByCost"; ownOnly?: true; colorFilter?: Color } // ownOnly指定時は発生源の持ち主のスピリットだけを守る（BS09-059翡翠の社Lv2）。colorFilter指定時はこの色を持つスピリットだけを守る（BS12-065大樹茂る天守閣：「自分の緑のスピリットすべて」）。// **「Lv1コスト」＝Lv1に必要なコア数**（レベル表の表記。2026-08-14 ユーザー確認。以前は召喚コストとして実装していた）。// 両陣営のスピリット上のコアは、効果によってそのカードのコスト（Lv1コスト）を下回るまで取り除けない（removeCores/removeCoresToTrash/removeCoresToVoidの共通処理で判定。**コアの動かし方を問わず効く**＝移動（moveCoresLeavingOne）と入れ替え（swapOpponentCores）も下限を割れない。入れ替えは同時の1つの動きなので、割るときは入れ替え自体を行わない。2026-08-24 ユーザー確認。BS08聖なる柱状彫刻）
    | { type: "coresCantBeRemovedByOpponent"; nameContains: string } // 発生源の持ち主の、カード名にnameContainsを含む自分のスピリット上のコアは、相手のスピリット/ブレイヴ/マジックの効果では取り除けない（coresCantBeRemovedと違い片側限定＝相手の効果だけを止める。判定はboardResistanceAgainstのcoreRemove経路。BS12-022太陽武者ゲンジ・ボルタ：カード名に「太陽」）
    | { type: "coresCantBeRemovedAll"; side: "opponent" | "both"; exceptOwnerEffects?: true } // 器AC：coresCantBeRemoved（自身のコアだけ）を広げたフィールド全体版。side:"opponent"＝発生源から見た相手のスピリットのコアだけ、side:"both"＝両陣営すべて。exceptOwnerEffects指定時は持ち主自身の効果・操作（自分のコストの支払いも含む）は例外で通す（BS13-065八分儀の祠Lv2：相手のスピリットすべて・相手の効果以外）。未指定時は持ち主自身も含めて完全に止める（BS13-X03白羊樹神セフィロ・アリエスLv3：両陣営すべて・自分のコストも払えない）。「【転召】以外」の例外はdumpAllCoresTenshoがこのチェックを経由しないため自動的に満たされる（コード対応不要）。globalConstraintのphase/turnフィールドで区間を絞れる（065Lv2＝phase:"main" turn:"opponent"）
    | { type: "summonExhausted"; cardTypes: CardType[]; familyExclude?: FamilyFilter; costFilter?: { max?: number; min?: number } } // 器AB：お互い、条件を満たすカードを召喚するとき、疲労状態で召喚する（BS13-065八分儀の祠Lv1-2：cardTypes["spirit"]・familyExclude["遊精","星魂"]・costFilter.max:3／BS13-X03白羊樹神セフィロ・アリエスLv1-3：cardTypes["spirit","brave"]・familyExclude"遊精"）。ダイレクトブレイヴでは合体先のスピリットが疲労する（BS13_PLAN.md §1 #14）。「疲労する」であって「疲労状態になる」ではないため、ownSpiritExhaustedは発火しない＝【装甲】等の耐性でも防げない（同 #24）。globalConstraintのphaseフィールドで「メインステップ」に絞る（両カードとも見出しが『お互いのメインステップ』のため、神速による召喚は対象外になる）
    | { type: "handImmuneForPid" } // 発生源の持ち主の**手札**は、相手のスピリット/ブレイヴ/マジックの効果を受けない（ネクサスの効果は防がない＝効果文の列挙にネクサスが無いため意図的。EffectModules.handImmuneForが判定し、discardOpponent等の手札を対象に取る処理の冒頭で弾く。BS12-067月光集める塔Lv1）
    | { type: "noDeckMillByOpponent"; whileSourceDeployedTurnOnly?: true } // 相手の効果では、**この発生源の持ち主**のデッキは破棄されない（millDeck の冒頭で判定。他の globalConstraint と違い両陣営ではなく持ち主だけを守る＝millCap と同じ向き）。whileSourceDeployedTurnOnly指定時は、発生源が このターンに場へ出た（summonedTurn === state.turn）ときのみ有効（BS08鳳翼の聖剣「このネクサスが配置されたターンの間」）。自分自身の効果・コスト支払いによる破棄は止めない（millCap と同じ範囲）
    | { type: "noDrawOutsideDrawStep" } // お互い、ドローステップ以外でドローできない（GameState.drawの共通経路冒頭で判定。ドローステップ自身はfromDrawStep引数で除外する。BS08豚人チョウハッカイ）
    | { type: "summonLimitByCostForOpponent"; maxCost: number; limit: number } // 発生源の持ち主から見た**相手**は、コストがmaxCost以下のスピリットをターンにlimit体までしか召喚できない（RuleValidator.validateSummonが、相手フィールドのCardInstance.summonedTurnで自分のこのターンの該当召喚数を数えて判定。神速召喚も対象。BS08夢想法師サンゾール：コスト4以下は1体まで）
    | { type: "summonLimitByEffectForOpponent"; limit: number } // summonLimitByCostForOpponentの兄弟：コストでなく**効果の記述を持つ**（isVanillaCardがfalse）スピリットカードでターンにlimit体までしか召喚できない（BS12-071未完成の古代戦艦：帆Lv2＝1枚まで）
    | { type: "voidCoreBlockedOutsideCoreStep" } // お互い、コアステップ以外でボイドからフィールド/リザーブにコアを置けない（ライフ・トラッシュへは対象外。BS10-056蒼天大聖モンゴクウ）。
    // ボイドから直接置く各アクションが冒頭でEffectModules.voidCorePlacementBlockedを呼ぶ（コアステップ自身の`player.reserve += 1`はガート不要＝コアステップ内なので通る）
    | { type: "noSummonByEffect" } // お互い、スピリット/ブレイヴ/ネクサス/マジックの効果でスピリット/ブレイヴを召喚できない（通常のdoSummon経由の召喚は対象外。フィールド全体・主語なし。BS12-072海賊王の秘宝島Lv1）。
    // エントリの phase を書けばその区間だけ有効（BS12-072＝『お互いのメインステップ』）。summonByEffectBlockedが判定し、
    // summonFreeFromHandIndex/summonFreeFromTrashIndex/summonRevealedFree（EffectModules.tsの効果による召喚の共通経路）の冒頭で弾く
    | { type: "attackRequiresCoreToll"; maxCost: number } // 器BM：両陣営とも、コストがmaxCost以下のスピリットがアタックするとき、持ち主のリザーブのコア1個を持ち主のトラッシュに置かなければアタックできない（リザーブが空ならそもそもアタック不可＝validateAttackが弾く。払えるかぎり自動で払う＝GameEngine.doAttackが宣言成立時に自動でリザーブ→トラッシュへ移す。「断ればアタックしない」はクライアント側で表現する（public/src/main.ts の confirmExtraCost が send() 直前に確認をはさむ）。2026-09-10ユーザー確認。BS13-043鳥人イカロッシュ）
    | { type: "opponentCantReturnFromTrashToHand" } // 器BO：発生源の持ち主から見た**相手**は、トラッシュからカードを手札に戻せない（noTrashRecovery〈両陣営〉の片側版。cantSpiritStateBraveと同じ「相手側だけを見る」パターン。トラッシュ→手札の経路（recoverSpiritFromTrash/recoverMagicFromTrash/recoverAllMagicFromTrashByColorChoice/器AOの各ハンドラ冒頭）が共通ヘルパーで一括して弾く。BS13-044吟遊詩人のオルフェLv2）
    | { type: "cantAttackIfFewOwnSpirits"; atMost: number } // 器BV：両陣営それぞれ独立に判定する：アタックしようとしているスピリットの持ち主のフィールドのスピリット数がatMost体以下のときはアタックできない（自分が3体以下なら自分だけアタック不可、相手が3体以下でも自分には効かない＝attackerPid基準の独立判定。1エントリで両陣営を見る。BS13-071巨人港）

// 破壊の発生源コンテキスト（省略可）。復活系効果（reviveOnDestroy）が参照する。
export interface DestroyContext {
    sourcePid?: PlayerId // 破壊を引き起こした効果の持ち主（相手の効果による破壊か判定する）
    sourceType?: CardType
    sourceColors?: Color[] // 破壊を引き起こした効果の発生源の色（「相手の**赤の**スピリット/マジックの効果では破壊されない」の判定用。SD01-032 機械神の加護）
    sourceInstanceId?: string // 破壊を引き起こした効果の発生源インスタンスID。
    // fieldEvent.byOpponentSpiritEffectOnly が「その効果を発揮したスピリット」を対象にするために使う（BS10-012アントイーター/BS10-014闇騎士マリス）
    battle?: { attackerColors: Color[]; attackerLevel?: number; attackerBp?: number } // バトルによる破壊のときの「破壊した側（勝者）」の色・レベル・実効BP（装甲・reviveOnDestroy判定用。呼び出し側の命名は歴史的にattacker*だが、実際は勝者側の値を渡す）
}

// 効果定義（kind による判別ユニオン）。
// levels は発動するレベルの配列（null = レベル不問）。
export interface CardData {
    cardId: string
    name: string
    type: CardType
    colors: Color[] // カードの色（単色なら要素1。多色は表記順。BS05-X19 聖皇ジークフリーデン＝["red","white"]）
    cost: number
    reduction: Color[] // 軽減シンボル（色の配列。長さ=軽減数。多色カードは混色になる）
    family: string[] // 系統（日本語のまま）
    levels: LevelDef[] // magic は空配列
    symbol: Color[] // magic は空配列
    flash: boolean // magic のみ: フラッシュタイミングで使用可能か
    rarity: string // C/U/R/M/X など（表示用）
    limited: boolean // 禁止カードか
    limitCount?: number // 制限カード（同名の最大投入数。3枚未満に制限する場合のみ指定。省略時は通常の3枚まで）
    effect: string // 表示用テキスト（原文）
    effects: EffectDef[] // 構造化された効果（未対応の効果は含まれない）
    // ---- type === "brave" のときだけ持つ（docs/design/BRAVE.md §2.2）----
    braveLevels?: LevelDef[] // 合体状態のレベル表。bp は「合体時BP+」の加算値、cores は**合体スピリット上の**コア数で判定する。
    // Lv1 の cores は 0（合体中のブレイヴはコアを持たないため。これで currentLevel が Lv0 に落ちない）
    braveCondition?: BraveCondition // 合体条件（満たすスピリットにのみ合体できる）
}

// 盤面インスタンス（可変）。data.md 6.2 に対応
export interface CardInstance {
    instanceId: string
    cardId: string
    cores: number
    isRested: boolean
    summonedTurn: number
    tempBpBuff: number // ターン終了時まで有効なBP増減
    battleBpBuff?: number // このバトルの間だけ有効なBP増減（bpBuff の scope:"battle"）。clearBattle でリセットする。
    battleBpFixed?: number // このバトルの間、実効BPそのものをこの値に固定する（既存battleBpAsLevelの「BP比較のときだけ」より広く、対象条件のBP比較にも効く。effectiveBpが最優先で読み、加算ではなく上書き。clearBattleでリセットする。BS12-037/058＝「Lv1/Lv2/Lv3BPを2000として扱う」）
    colorlessThisBattle?: true // このバトルの間、色とシンボルを無いものとして扱う（instColors/instHasColorが空を返し、countSymbolsがこの個体を軽減の数から丸ごと飛ばす。clearBattleでリセットする。BS13-011/015/052：「このスピリットの色を無いものとして扱う」＝色とシンボルの両方が無色になる。2018年ルールマニュアルVer.9.0改定。docs/design/BS13_PLAN.md §1 #10・#11）
    bpAsContinuous?: number // 継続的な「BPを◯として扱う」上書き（kind:"bpAs"。levelAsのBP版。EffectModules.refreshLevelAsOverridesが毎回再計算する。器Q。BS13-X011）
    battleSymbolsAdded?: Color[] // このバトルの間だけ追加されるシンボル（bpBuff.thenAddSymbolThisBattleが積む。symbolsAddedContinuousの「このバトルの間」版。clearBattleでリセット。BS13-062光り輝く大銀河Lv2）
    borrowedAttackEffectOnce?: true // borrowCombinedAttackEffectの再帰ガード（内部専用。cards.jsonには書かない）。
    // 「自身を選べば同じ効果がそのアタックで2回発揮される」（2026-09-08ユーザー確認）を文字どおり2回で
    // 止めるための印。自身を選んで発揮する間だけ立て、次に同じ効果を借りようとしたときは自身を候補から外す
    // （無限再帰の防止。BS13-049イリテバン）
    destroyAsMaxLevel?: true // 破壊処理中、このスピリットのLvを一時的に「そのカードのレベル表の最大Lv」として扱う（levelOf/currentLevelが読む）。destroyAsMaxLevelGrant（器N）によるコア0破壊のときだけdestroySpiritが立てる。すぐトラッシュへ移るインスタンスなので後始末は不要
    // 効果テキストが「このバトルの間、BP+」と明示しているものだけがこちら（BS07ニードルショット）。無記述のBP+はターン終了時まで＝tempBpBuff
    skipNextRefresh?: true // 次に自分のリフレッシュステップが来たとき、この個体は回復しない（そこで消費する。BS11-055 ジャノメ・シールダー＝「指定したスピリットは、次の『相手のリフレッシュステップ』で回復できない」）
    noRefreshUntilOwnEndSteps?: number // 値が1以上の間、この個体はリフレッシュステップ・効果のいずれでも回復しない（refreshSpiritの唯一の入口で判定）。持ち主のエンドステップごとに1減らし、0になったら通常どおり回復する（BS12-078カシオペアシール：「『自分のエンドステップ』を5回行うまで、そのスピリットは回復できない」）
    cantAttackThisTurn: boolean // このターンの間アタック不可（refreshAllOwn で回復した個体などに付与）
    immuneToOpponentThisTurn: boolean // このターンの間、相手のカード効果を受けない（フェザーバリア）
    blockConstraintNegatedThisTurn: boolean // このターンの間、自身の cantBlock/cantBlockLowerBp を無効化（バーストファイア）
    unblockableOnceThisTurn?: boolean // 「ターンに1回、相手のスピリットにブロックされない」印。canBlock が参照し、次のバトル終了時（clearBattle）に消える。ターン終了でもリセットする（BS04強者統べる大地Lv2）
    countAsThisTurn?: { pid: PlayerId; count: number; sourceTypes?: CardType[] } // このターンの間、pid の効果が「スピリットの数を数える」ときこの個体を count 体分として数える（ターン終了でリセット。BS05スリーカード）。sourceTypes は数える側の発生源種別の限定（印を付けた action からそのまま写す）
    activatedUsedTurn?: Record<string, number> // kind:"activated" の oncePerTurn 用。effectId -> 最後に発動したターン番号（state.turn と一致する間は再発動できない。BS08帝竜騎サイクル）
    magicNegateUsedTurn?: number // kind:"magicNegate" の oncePerTurn 用。この個体が最後にマジックを無効にしたターン番号（state.turn と一致する間は再使用できない。BS02鏡の回廊Lv2）
    reviveOnDestroyUsedTurn?: number // kind:"reviveOnDestroy" の oncePerTurn 用。この発生源が最後に復活を成立させたターン番号（magicNegateUsedTurnと同型。BS06暴かれた墓石Lv2）
    attackedThisTurn?: boolean // このターンに既にアタックを宣言したか（GameEngineがアタック宣言時に立て、ターン終了でリセット）。globalConstraint "attackOncePerTurnBySymbolCount" だけが見る（BS13-068遥かなる衛星砲）
    magicFreeUseTurn?: number // BS11-X05 魔導双神ジェミナイズ Lv2-3用。magicFreeUseCount が最後に更新されたターン番号（一致しない間はcount実質0扱い＝ターンをまたいだ暗黙のリセット。magicNegateUsedTurnと同じ形）
    magicFreeUseCount?: number // 同上：magicFreeUseTurn === state.turn の間だけ有効な、そのターンに実際に無償使用した回数（「ターンに2回しか使えない」の実測カウント。confirmで断った・候補が無かった場合は増えない）
    triggeredUsedTurn?: Record<string, number> // kind:"triggered" の oncePerTurn 用。effectId -> 最後に発揮したターン番号（stepUsedTurnと同型。BS11-032 天王神獣スレイ・ウラノス）
    stepUsedTurn?: Record<string, number> // kind:"step" の oncePerTurn 用。effectId -> 最後に発揮したターン番号（activatedUsedTurnと同型。BS10-008 火星神龍アレス・ドラグーン）
    tempKeywords: { keyword: Keyword; colors?: Color[] }[] // このターンの間だけ付与されたキーワード（ターン終了でリセット。スピリットリンク／インビンシブルシールド）
    tempAlsoCosts: number[] // このターンの間、実コストに加えてこれらのコストとしても扱われる（ターン終了でリセット。道化師クラン）
    costDeltaContinuous?: number // 継続的なコストの増減（kind:"costDelta"。EffectModules.refreshLevelAsOverridesが毎回再計算し、shared/rules.instCostDelta が読む。BS11-017 ムシャツバメ）
    refreshOnBlockedByColorThisTurn?: Color // このターンの間、この色のスピリットにブロックされたら回復する（BS11-054 武槍鳥スピニード・ハヤト。ターン終了でリセット）
    blockRequiresMagicDiscardGrantedTurn?: number // 器BU：召喚時に付与された「このターンの間、このスピリットがアタックしたとき、相手はマジック1枚を破棄しなければブロックできない」の有効ターン番号（state.turnと一致する間だけ有効。GameEngine.doAttackがこのスピリット自身のアタックのたびに見る。BS13-047深海大帝ノーグ・デンス）
    tempCostDelta?: number // このターンの間のコストの増減（ターン終了でリセット。shared/rules.ts の instCostDelta が読む。BS08グロウアップ「コスト+3」）。
    // **tempAlsoCosts とは別物**：あちらは「そのコストとしても扱う」（元のコストも残る）、こちらは増減（元のコストは残らない）
    tempColors: Color[] // このターンの間だけ付与された色（master色に加えて持つ。ターン終了でリセット。アディショナルカラー）
    // **破壊待機状態**（docs/design/TIMING_CHART.md §1.5）。破壊が決まってから、
    // 破壊時の誘発を解決し終えてトラッシュに置かれるまでの間だけ立つ。
    // この間もカードはフィールドに存在し、コアも乗ったままで、**カードの効果の対象に取れる**
    // （数・シンボル・【転召】の生贄にも数える）。
    // 一方で**疲労／回復はできず、ここからさらに破壊されることもない**
    pendingDestruction?: true
    // **バウンス待機状態**（バトスピ Wiki「バウンスについて」。2020年5月のルール改定）。
    // 手札／デッキへ戻す効果を解決してから、実際にその場所へ移るまでの間だけ立つ。
    // この間もカードはフィールドに留まるが、**破壊待機状態とは扱いが違う**:
    //   - シンボルを**軽減に使えない**（破壊待機は使える）
    //   - 「手札／デッキに戻ることに関する効果」以外は**発揮できず、その対象にもならない**
    //   - 発揮できるのは「フィールドを離れるとき」「手札／デッキに戻るとき」だけ
    // これらの誘発は**バウンス効果の解決が終わってから**まとめて発揮する（割り込ませない）
    pendingBounce?: { to: "hand" | "deckTop" | "deckBottom" }
    coresAtDestruction?: number // 破壊直前に置かれていたコア数（destroySpiritが記録。漆黒鳥ヤタグロス）
    // 破壊待機状態の間だけ持つ、その破壊のコンテキストと確認の出し方（destroySpiritが記録し、
    // commitPendingDestruction が「フィールドに残る」の判定に使う。cards.jsonには書かない内部専用）。
    // 「フィールドに残る」は破壊待機からトラッシュへ置かれる**代わり**に働くので、
    // 判定はトラッシュ行きの確定地点まで持ち越す必要がある（TIMING_CHART.md「『フィールドに残る／戻る』と『破壊時』」）
    pendingDestroyContext?: DestroyContext
    pendingDestroyAllowSuspend?: true
    skipReviveOnCommit?: true // 消滅（維持コア割れ）・skipRevive 指定の破壊では「フィールドに残る」を見ない印
    cantBlockThisBattle?: true // このバトルの間ブロックできない（markCantBlockThisBattle。clearBattle で消える。BS09-042妖精騎士ピーター）
    unblockableMinBpThisBattle?: number // このバトルの間、実効BPがこの値以上のスピリットからブロックされない（action:"unblockableAboveBpThisBattle"。clearBattle で消える。BS13-032光速の騎士ヘルモード【合体時】Lv3：「BP6000以上の相手のスピリットからブロックされない」）
    unblockableLevelsThisBattle?: number[] // このバトルの間、currentLevelがこの配列に含まれるスピリットからブロックされない（action:"unblockableByLevelThisBattle"。clearBattle で消える。BS13-058シユウ）
    cantBlockThisTurn?: true // このターンの間ブロックできない（markCantBlockThisTurn。PhaseManagerのターン終了処理で消える。BS12-038オリンピアの天使ファレグ）
    levelCostBonusContinuous?: number // 継続的な「Lvコストを+Nする」。各レベルに必要なコア数がこの数だけ増える（維持コア＝Lv1のコストも上がるので、下回った個体は消滅する）。EffectModules.refreshLevelAsOverridesが毎回再計算し、shared/rules.instLevels が反映する（BS09-017蛇凰神バァラルLv2-3。2026-08-14 ユーザー確認）
    levelAsContinuous?: number // 継続的な「Lv◯として扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（ナイフ投げのジャグリーン／トパーズの流星）
    levelOverrideThisTurn?: number // このターンの間のレベル上書き（ターン終了処理でリセット。皇帝アンプルール）
    lifeDamageNegatedFor?: PlayerId // このスピリットのアタックでは、ここに入っているプレイヤーのライフはこのターン減らない（ターン終了処理でリセット。BS04ミストカーテン）
    coresLinkedTo?: string // このネクサスのコア数を、リンク元スピリット（instanceId）のコア数と同じものとして扱う
    // （クロスシザース。本来は再指定まで永続だが、このターンの間だけの簡略化。ターン終了でリセット）
    coresOverride?: number // coresLinkedTo設定時、EffectModules.refreshLevelAsOverridesがリンク元スピリットの
    // 現在コア数から毎回同期する。currentLevelはこの値をcoresの代わりに使う（ターン終了でリセット）
    namesAsContinuous?: string[] // 継続的な「カード名に〜が入っているものとして扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（BS02アルカナプリンス・オベロ／BS03アルカナプリンセス・アン）
    colorsAsContinuous?: Color[] // 継続的な「〜の色としても扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（百面相のフラットフェイス／妖精ティングリー）
    symbolsForSummonReduction?: Color[] // 「スピリット召喚の軽減計算のあいだだけ」置き換わるシンボル（kind:"symbolFix" の summonReductionOnly。countSymbols が forSummon のときだけ読む。BS11-039 天使ティアエル）
    symbolsOverrideContinuous?: Color[] // 継続的な「シンボルを◯個に固定する」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（kind:"symbolFix"）。instanceSymbolCount / countSymbols が、カード静的なsymbolの代わりにこちらを見る（BS08海底に眠りし古代都市）
    symbolsAddedContinuous?: Color[] // 継続的な「シンボルを追加する」（kind:"symbolAddGrant"。BS12初出）。symbolsOverrideContinuousと異なり**加算**で、固定値が有る個体でも固定値+追加分になる。instanceSymbolCount / countSymbols の両方がこの配列の長さぶんを加算する
    extraSymbolsPermanent?: Color[] // 永続的に蓄積する「シンボルを追加する」（kind:"addSymbolPermanent"。BS13初出）。symbolsAddedContinuousと違い継続付与の再計算では消えず、トリガーのたびに加算されたまま残る。instanceSymbolCount / countSymbols の両方がこの配列の長さぶんを加算する（BS13-003カメレオプス）
    alsoCostsWhenDestroyed?: number[] // 「破壊されたとき、このコストとしても扱う」値（kind:"alsoCostGrant" の whenDestroyedOnly。【不死】の引き金コスト判定だけが読む。BS11-064 闇の聖剣Lv1）
    alsoCostsContinuous?: number[] // 継続付与された「このコストとしても扱う」値（kind:"alsoCostGrant"。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、instHasCost / instMatchesCostFilter が参照する。道化師クラン）
    lentChoiceFamily?: string // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ系統。仮想発生源にのみ載り、kind:"familyGrant" の familyFromChoice が読む（音鳥クルーク）
    lentChoiceInstanceId?: string // 貸与（targetChoiceLendThisTurn）の際にプレイヤーが選んだ対象インスタンスID（陣営を問わない）。仮想発生源にのみ載り、kind:"vanillaAsGrant"/"spiritEffectsDisabledGrant" のtarget:"chosenInstance"が読む（BS12-081メロディアスハープ）
    levelAsEffectsOnly?: true // levelAsContinuous による置き換えが**効果の発揮判定にだけ効く**目印（kind:"levelAs" の effectsOnly）。
    // 立っていると shared/rules.ts の displayLevel（表示・他カードから見えるレベル）はこの置き換えを無視する。
    // BS03ウッド・ゴレム「相手のネクサスすべてのLv2効果は発揮されない」＝Lv1にするわけではない
    lentChoiceColor?: Color // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ色。仮想発生源にのみ載り、kind:"levelAs" の target:"allSpiritsByChosenColor" が読む（BS02-111スピリットイリュージョン）
    lentBuffTargetId?: string // 同じマジックの**直前の効果でBP増加した相手**のinstanceId。仮想発生源にのみ載り、
    // kind:"battleWon" の winnerIsLentBuffTarget が読む。効果文が「**そのスピリットが**、BPを比べ〜したとき」と
    // 前の文を指しているカード用（BS07ニードルショット）。GameState.lastBpBuffTargetId 経由で受け取る
    lentKeepPid?: PlayerId // 封印された魔導書Lv1（bothSidesTargetRedirect）が「対象を片側のみに変更する」を選んだときの**残る側**。
    // 仮想発生源にのみ載り、lentChoiceColor と同じく kind:"levelAs" の target:"allSpiritsByChosenColor" が読む。
    // **貸与した時点の答えをターン中ずっと保持する**（継続効果なので、マジックの解決が終わった後も絞り込みが効く。
    // 2026-08-16 ユーザー確認。BS02-111スピリットイリュージョン）
    kyoshuUsed?: { turn: number; count: number } // 【強襲】をこのターン何回使ったか（turnがstate.turnと一致する間だけ有効。BS07）
    tempExtraSymbols?: number // このターンの間の追加シンボル数（ターン終了でリセット。ダブルハート）
    blockTriggersAsAttackThisTurn?: boolean // このターンの間、『このスピリットのブロック時』効果を『アタック時』に発揮する
    // （ブロック時には発揮しない。ターン終了でリセット。fireTriggerが参照。GameState の同名フラグは両陣営全体版で、こちらは個体単位。BS07マクラーンスラッシュ）
    attackTriggersAsBlockThisTurn?: boolean // このターンの間、『このスピリットのアタック時』効果を『ブロック時』に発揮する（アタック時には発揮しない。ターン終了でリセット。fireTriggerが参照。BS05ブレイブチャージ）
    heavyArmorColorsGranted?: Color[] // 【重装甲】の対象色のうち、**毎回算出が要るもの**（合体中のブレイヴが持つ静的【重装甲】のホストへの反映と、colorsFrom:"selfColors"＝【重装甲：可変】）。
    // armorColorsGranted と同じくEffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、hasHeavyArmorAgainstが参照する。
    // ⚠️ 静的な【重装甲：紫】等はカードのeffectsから直接読むのでここには入らない
    armorColorsGranted?: Color[] // 継続付与された装甲の対象色（kind:"keywordGrant"のkeyword:"armor"。
    // EffectModules.refreshLevelAsOverridesが毎回全消去→再構築する。hasArmorAgainstが参照する（BS05白夜の虚空Lv2）
    braveImmuneAll?: true // kind:"braveImmuneGrant"のscope:"all"分。相手のブレイヴの効果を色不問で受けない。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、shared/rules.hasBraveImmuneAgainstが参照する（BS12-028セイルフィッシュLv2）
    braveImmuneMatchArmorColors?: true // kind:"braveImmuneGrant"のscope:"matchArmorColors"分。自身が持つ【装甲】の色と一致する相手のブレイヴの効果だけ受けない（BS12-067月光集める塔Lv2）
    grantedMagicNegate?: Extract<EffectDef, { kind: "magicNegate" }>[] // kind:"effectEntryGrant"で継続付与されたmagicNegateエントリ。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、triggers.findMagicNegateSourceがcard自身のeffectsと合わせて走査する（BS12-068光の聖剣Lv1）
    tempSymbolLoss?: Color[] // このターンの間、指定色のシンボルを1つ失う（この個体がその色のシンボルを持たなければ無変化。ターン終了でリセット。shared/rules.countSymbols/instanceSymbolCountが読む。BS12-080バキュームシンボル）
    returnToDeckBottomAtEndStep?: boolean // このスピリットはエンドステップに持ち主のデッキの下へ戻る
    // （action:"revealAndSummonKeyword" が立てる。PhaseManager.endTurn がステップ誘発の直後に処理する。BS05トランスマイグレーション）
    treatedAsVanillaContinuous?: boolean // 継続付与された「カードに効果の記述を持たないスピリットとしても扱う」（kind:"vanillaAsGrant"）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築し、instIsVanilla が参照する（BS04スイッチヒッター）
    effectsDisabledContinuous?: boolean // このスピリットが持つ効果すべてを発揮させない（kind:"spiritEffectsDisabledGrant"）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築し、shared/rules の effectSources・activeConstraints・
    // spiritHasKeyword と EffectModules.fireTrigger が参照する（BS07ルナースラッシュ）
    tempGrantedTriggers?: { trigger: TriggerEvent; action: EffectAction; battleRole?: "attacker" | "blocker" }[]
    // このターンの間だけ、対象1体に直接付与された誘発効果（action:"grantEffectToTargetThisTurn"。ターン終了でリセット。
    // fireTrigger が card.effects と同様に走査する。BS08メテオストーム＝「ヴルム」入りの自分のスピリット1体に付与）
    asSpiritThisTurn?: { cost: number; family: string[]; levels: LevelDef[] }
    // このターンの間だけ「スピリットとして扱われている」ネクサスに載る上書き（action:"treatOwnNexusesAsSpiritsThisTurn"。BS03ゴーレムクラフト）。
    // **付くのは field.nexuses から field.spirits へ移されたネクサスのインスタンスだけ**で、ターン終了時に元へ戻す目印も兼ねる。
    // スピリットの器（アタック・ブロック・BP比較・体数カウント・対象選択）は field.spirits に入れるだけで全部手に入るので、
    // ここが担うのは「カードの静的な値では出せないぶん」だけ:
    //   - currentLevel / instMinLevelCores が master.levels の代わりに levels を見る（ネクサスのLv1コアは全カード0のため、
    //     これが無いとコア0になっても消滅しない）
    //   - instHasCost / instAllCosts が cost を、spiritHasFamily が family を追加で見る
    //   - instEffectsSuppressed が true を返す（＝「ネクサスとしての効果を失い」。effectSources・activeConstraints・
    //     spiritHasKeyword・fireTrigger の4か所が発揮を止める）／instIsVanilla も true（＝「効果の記述なし」）
    // シンボルは上書きしない（効果文が触れていないため、ネクサス本来のシンボルのまま）
    asSpiritAttackStepScoped?: true // 器BJ：上のasSpiritThisTurnの上書きが**アタックステップの間だけ**戻される対象であることを示す目印
    // （kind:"nexusAsSpiritDuringAttackStep"。BS13-048古代戦艦アルゴ・ゴレムLv2）。中身はasSpiritThisTurnと同型の
    // 上書きをそのまま流用する（instBaseCost/instFamilies/instLevels/instEffectsSuppressed/instIsVanillaは
    // asSpiritThisTurnの有無だけを見るのでそのまま効く）。戻すタイミングだけがこのフラグの有無で分岐する:
    // PhaseManager.applyAttackStepNexusAsSpirit/revertAttackStepNexusAsSpiritがアタックステップの開始/終了で
    // これが付いた個体だけを移す・戻す（付いていないasSpiritThisTurn＝通常のターン限定はPhaseManager.endTurnの
    // 既存ループがターン終了時に戻す。両方が同時に立つことはない＝変換時にasSpiritThisTurn未設定のネクサスだけを対象にする）
    braveStatsAsContinuous?: { cost: number; family: string[]; braveLevels: LevelDef[] }
    // 継続的な「スピリット状態のブレイヴのステータスを◯として扱う」上書き（kind:"braveStatsAs"）。
    // asSpiritThisTurn と同型（cost/family/レベル表を差し替える）だが**別のフィールド**にしてある:
    // instEffectsSuppressed は asSpiritThisTurn !== undefined を「効果無効」の判定に使っており、
    // asSpiritThisTurn を流用すると「そのブレイヴが元から持つ効果は残す」という確定事項
    // （BRAVE.md §12.7）に反してしまう。**instEffectsSuppressed には足さないこと**。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築する。
    // shared/rules.ts の instBaseCost / instFamilies / instLevels が asSpiritThisTurn より先にこちらを見る
    noRefreshTargetInstanceId?: string // このスピリットが「回復できない」と指定した**相手**スピリットのinstanceId（action:"markNoRefreshTarget"）。
    // このスピリット自身が疲労状態でフィールドにいる間だけ効く（EffectModules.isRefreshBlockedByMark が判定。スクルディア）。
    // 疲労し直すたびに上書きされる。指定先が場を離れても残るが、instanceId が一致しなくなるだけで無害
    braveCombined?: true
    // **合体中のブレイヴ側**に載る目印（docs/design/BRAVE.md §4）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築し、あわせて coresOverride に
    // **ホストのコア数**を写す。この2つで shared/rules の instLevels が合体状態のレベル表
    // （CardData.braveLevels）を返し、currentLevel がホストのコア数で正しいレベルを出す。
    // ⚠️ ここを素の levels のままにすると、合体中のブレイヴはコア0なので **Lv0 になり、
    // 【合体中】効果が無言で発火しない**（TURN_EFFECT_SOURCES.md §3.3 と同型の事故）
    braveComposite?: { cost: number; colors: Color[]; symbols: Color[] }
    // **合体しているブレイヴがホストへ足すぶん**（docs/design/BRAVE.md §3）。
    // EffectModules.refreshLevelAsOverrides が毎回全消去→再構築する（他の継続上書きと同じ扱い）。
    // ここに入るのは**レベルに依らない値だけ**：コスト・色・シンボル。
    // 「合体時BP+」はホストのコア数で変わる（合体状態のレベル表を引く）ので**ここには入れない**。
    // BP は shared/rules.ts の effectiveBp が board から実体を引いてその場で足す
    braveRefs?: { slot: "left" | "right" | "single"; instanceId: string }[]
    // **合体しているブレイヴへの参照**（ホスト側に載る。docs/design/BRAVE.md §2.3）。実体は field.combinedBraves にあり、
    // ここは instanceId で指すだけ。通常のブレイヴは slot:"single" の1本。異魔神ブレイヴ（1枚がスピリット2体に合体）は
    // **実体1つ・参照2本**になるので、入れ子（host.braves）にせず参照方式にしてある（§11.2）
}

// プレイヤーの状態
export interface PlayerState {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    // 「デッキの横に置く」コア（BS12-078 カシオペアシール）。個々のコアを区別しないので個数だけ持つ。
    // **どのゾーンにも属さない**ので、コストの支払い・コア移動・効果の対象から自然に見えない
    // （「このコアは、この効果以外に使用することはできない」）。持ち主のエンドステップに1個ずつボイドへ戻す。
    // ボイドは残量を持たない無限の供給源として実装しているため、置くときも戻すときもボイド側の増減は無い
    deckSideCores: number
    deck: string[] // cardId の配列（先頭がデッキトップ）
    hand: string[]
    trashCards: string[]
    tegamoto: string[] // 公開ゾーン「手元」（cardId配列）。マジックブックの手元配置・ミカファールLv2の無償使用対象・エクリアの破壊効果が参照する。公開ゾーンのためviewForは両者分をそのまま配信する
    // 手元のカードのうち「手札にあるときと同様に使用できる」ものの cardId 多重集合
    // （BS06混迷する魔法実験場Lv2 が相手の効果によるデッキ破棄から手元へ置いたぶん）。
    // **tegamoto の並びとは独立に持つ**：同じ cardId ならどれを使っても同じなので、
    // 並び替えやインデックスのズレに強い。使用・破棄のたびに1件ずつ取り除く。
    // マジックブックが置いたカードはここに入らない（あちらはミカファールLv2の無償化がないと使えない）
    tegamotoPlayable: string[]
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
        combinedBraves: CardInstance[] // 合体中のブレイヴの実体置き場（docs/design/BRAVE.md §2.3・§2.4）。
        // **フィールド走査の対象に入れない**（spirits に置くと合体スピリットが2体に数えられ、
        // シンボルの二重計上・destroyAll の二重ヒット・コア0での維持コア割れ消滅が起きる）
    }
    tempHandKeywordGrants?: { cardId: string; keyword: Keyword }[] // 手札のカードに一時付与されたキーワード（grantKeywordToHandCard。ターン終了でリセット。ビートプリースト）
    turnVirtualInstances: CardInstance[] // このターンの間だけ「フィールドにあるもの」として扱う仮想の効果発生源（マジックが貸した継続効果。lendSelfThisTurn）。
    // ターン終了でリセット（PhaseManager.endTurn）。フィールドには実在しないため、シンボル集計（countSymbols / ownFieldSymbolColors）の対象にはならない（TURN_EFFECT_SOURCES.md §1・§2.1）
    peekedOpponentCardIds?: string[] // 「相手の手札1枚の内容を見る」（costDiscardNamedThenPeek）で見たカードの cardId。
    // **持ち主の PlayerView にだけ返す**（相手には見せない）。同じカードを二重に見た場合も素直に積む。
    // 見たあとにそのカードが手札から離れても消さない簡略化（何を見たかの記録として残す。BS09-039探偵ペンタン）
    noRestWhenBlockingUsedThisTurn?: string[] // 「ターンに1回、ブロックしても疲労しない」（constraint の oncePerTurn）を、このターン使った**発生源の instanceId**。ネクサス1枚につき1回なので、同名を2枚置けば2回使える。ターン終了でリセット（BS07ブリシンガメンの首飾りLv2）
    // ⚠️ **廃止予定・もう読まれない**（2026-08-17）。効果ごとに聞く形（askPayToNegateIfNeeded →
    // payNegateDecide → payNegateDecision）へ移したため、この方針は判定に使われない。
    // クライアントがまだトグルを送ってくるので受け皿だけ残してある。
    // UI からトグルが消えたら、この項目と GameAction "setPayToNegate" を一緒に削除すること
    payToNegate?: boolean // 「自分の手札1枚を破棄することで、その効果を受けない」（BS08竜騎集う円卓Lv2）を払うかどうかの方針。
    // **未指定は true（払う）＝従来どおり**。耐性の判定は装甲と同じ同期の述語なので、その場で選択を挟めない。
    // 代わりにこの方針をプレイヤーがあらかじめ切り替えておき（GameAction "setPayToNegate"）、判定はそれを読むだけにする

    battleVirtualInstances: CardInstance[] // 上の「このバトルの間」版（lendSelfThisBattle）。effectSources が turnVirtualInstances と一緒に返すので、
    // 効果エントリ側（lentOnly / levels:null）の書き方は同じ。違いは寿命だけで、こちらは clearBattle でリセットされる（同じターンの2回目のバトルには効かない）
    magicOncePerTurnUsed?: Record<string, number> // oncePerTurn 指定のマジックを最後に発揮したターン番号（cardId -> GameState.turn）
    trashCoreReturnCapNext?: number // 指定時、**次の1回のリフレッシュステップ**でトラッシュのコアをリザーブへ戻す数をこの値までに制限する（超過分はトラッシュに残る）。消費後にフィールドが削除する（BS12-047海王神龍トライ・メルクリウス「次の『相手のリフレッシュステップ』で、相手のトラッシュのコアを3個しか相手のリザーブに戻せない」）
}

// バトル（アタック〜解決まで）の状態
export interface BattleState {
    attackerInstanceId: string
    blockerInstanceId: string | null // **実際にバトルするブロッカー**。複数体ブロック（blockRequiresCount）でも1体しか入らない
    pendingBlockerIds?: string[] // 複数体ブロックで、必要数がそろうまで宣言を貯める場所（そろったら空にする）
    extraBlockerIds?: string[] // 複数体ブロックで宣言はしたが**バトルはしない**ブロッカー。
    // 効果文が「どれか1体とだけバトルする」なので、BP比較・破壊・バトル終了の処理は blockerInstanceId だけを見る
    // （既存の処理に手を入れずに済ませるための形。BS10-X03巨蟹武神キャンサード）
    blockCostReserveToTrash?: { pid: PlayerId; count: number } // このバトルで、この pid はリザーブのコアをこの数だけトラッシュに置かなければブロックできない（払えないならブロック自体ができない。BS11-037 ヒポグリフィーLv2-3）。バトル終了で消える
    blockCostDiscardMagic?: { pid: PlayerId } // 器BU：このバトルで、この pid は手札のマジックカード1枚を破棄しなければブロックできない（手札にマジックが無ければブロック自体ができない。破棄は自動選択＝最初に見つかったマジック1枚。バトル終了で消える。BS13-047深海大帝ノーグ・デンス召喚時）
    handColorBannedFor?: { pid: PlayerId; color: Color } // このバトルの間、この pid は指定色の手札のカードを使えない（BS11-060 雷神砲カノン・アームズ＝破棄したカードと同じ色）。バトル終了（clearBattle）で消える
    flashLockedPlayer: PlayerId | null // このバトルの間フラッシュで手札のカードを使用できないプレイヤー（lockFlash 用）
    directed: boolean // 指定アタックか（canDirectAttack。通常アタックは false）
    directedTargetInstanceId?: string // 指定アタックで指定された相手スピリット。**アタック宣言の時点ではまだブロックは確定しない**（アタック時効果と【バースト】をすべて解決した後に確定する。2026-09-06 ユーザー確認）。GameEngine.doPass がフラッシュ①を閉じる時点で finishBlockDeclaration へ渡し、正規のブロック宣言として成立させる（疲労状態でも成立する＝『ブロック時』効果は発揮する）。指定先が場を離れた／耐性を得た／アタッカーが効果を失った場合は何もせず、通常のアタックに戻る
    compareByLevel?: boolean // trueの場合、バトル解決時にBPの代わりにcurrentLevelを比較する（エンジェルボイス）
    compareByCores?: boolean // trueの場合、バトル解決時にBPの代わりに置かれているコアの数を比較する（BS06イマジンフィールド）
    compareByCost?: boolean // trueの場合、バトル解決時にBPの代わりにカードのコスト（getCard(inst.cardId).cost）を比較する（BS10-110ノックアウト）
    skipBpCompare?: true // 器AV：バトル解決時にBP比較（とその結果の破壊）自体を飛ばす。outcomeが"none"になり、勝敗判定・onBattleWin/onBattleLose・fireBattleWonTriggersは発火しない。【呪撃】・endBattleDestroy等のBP比較に依らない処理はそのまま動く（BS13-082ペガサスフラップ）
    usedMagicCardIds?: { p1: string[]; p2: string[] } // このバトル中に使用されたマジックのcardId（光芒用）
    treatAsUnblockedIfLevelAtLeastBlocker?: true // アタッカーのLvがブロッカーのLv以上なら、BPを比べずに「ブロックされなかった」ものとして扱う
    // （挙動は treatAsUnblockedIfBlockerLevel1 と同じ。判定だけが違う。SD02-016 ウィングブーツ）
    treatAsUnblockedIfBlockerLevel1?: true // ブロッカーがLv1なら、BPを比べずに「ブロックされなかった」ものとして扱う（ライフに通り、どちらも破壊されない。ブロッカーは疲労したまま残る。BS09-044妖精の姫巫女ハマ・ドリュアス。BS09_PLAN.md §4）
    blockerCoresProtected?: true // このバトルの間、ブロッカー上のコアは効果で取り除けない（protectBlockerCoresThisBattle。BS09-027密林の勇者皇ヴォルザLv2-3）
    opponentDestroyedCoresToVoidPid?: PlayerId // action:"battleOpponentDestroyedCoresToVoid" が立てるフラグ。この値と一致する持ち主のスピリットがこのバトル中に破壊されたとき、commitPendingDestructionがコアをリザーブでなくボイドへ送る（BS10-X01幻羅星龍ガイ・アスラLv4：「このバトルの間、破壊された相手のスピリットのコアすべてはボイドに置かれる」）
    // oncePerBattle 指定の magicFreeGrant / magicRepeatGrant を、このバトルで既に使い切った発生源のinstanceId
    // （BS07大天使イスフィール＝無償で使えるのは「1枚」だけ）。**無償化と再発揮で別リストに分ける**のは
    // 消費点が違うため: 無償化は resolveMagic の冒頭（コスト判定はその手前で済んでいる）、
    // 再発揮は resolveMagicEffects が repeat を確定させる時点。1つのリストにすると、
    // 1枚目の無償化を記録した時点で同じ1枚目の再発揮まで消えてしまう
    oncePerBattleMagicFreeUsed?: string[]
    oncePerBattleMagicRepeatUsed?: string[]
    // 「バトル終了後に破壊する」の予約（action:"destroyBlockerAfterBattle"）。
    // ＞７（【呪撃】の直後）に、まだ場にいる対象を通常の destroy 経路で破壊する。
    // 発生源が場を離れていても予約は消えない（発揮はコストを払った時点で成立している）ため、
    // 装甲・効果耐性の判定に要る色と種別を予約時の値で持ち回る（BS01-104 千本槍の古戦場Lv2）
    endBattleDestroy?: {
        targetInstanceId: string
        sourceInstanceId: string
        sourcePid: PlayerId
        sourceColors: Color[]
    }[]
}

// 効果解決中のプレイヤー選択（v1は対象選択のみ）。resolveAction が候補2件以上のときに
// requestChoice 経由でセットし、GameAction "resolveChoice" で消費される。
// queue は、選択待ち中に中断された「同一トリガー内の残りエントリ」を直列化したもの
// （fireTrigger / resolveMagic のエントリループが積む。selfInstanceId から self を復元して再開する）。
export interface PendingChoice {
    pid: PlayerId // 選択するプレイヤー
    kind: "target" | "option" | "card" // target=フィールド上のインスタンスから選択／option=固定の選択肢ラベルから選択／card=自分の手札かトラッシュのカードから選択
    prompt: string // クライアント表示用の説明文（日本語）
    candidates: string[] // kind:"target" のとき使用する候補instanceId（kind:"option"/"card"のときは空配列）
    options?: string[] // kind:"option" のとき選択肢ラベル一覧（表示ラベル＝そのまま値として使う）
    cardZone?: "hand" | "trash" | "reveal" // kind:"card" のとき必須：どのゾーンから選ぶか（reveal=GameState.revealedCards の公開ゾーン）
    cardOwner?: PlayerId // kind:"card" のとき必須：ゾーンの持ち主（今回は常に pid 自身のゾーン＝pidと同値）
    cardIndices?: number[] // kind:"card" のとき必須：cardZone配列内の選択可能インデックス
    // （cardZone:"reveal" のときは GameState.revealedCards.cardIds のインデックス）
    optional: boolean // true ならスキップ（選ばない）可
    selectedIds?: string[] // kind:"target" のトグル選択で「いま選ばれている」候補（クライアントが選択済みとして描く）。
    // 候補（candidates）には選択済みのものも入れておき、もう一度クリックすると選択が外れる。
    // 相手視点ではマスクする（maskPendingChoiceForOpponent）
    skipLabel?: string // 「選ばない」ボタンの文言の差し替え。トグル選択の「これで破壊する」のように、
    // スキップが**中止ではなく確定**を意味するときに使う（未指定なら「選ばない」）
    stepper?: true // kind:"option" 限定：選択肢を**ボタンの列ではなく −／＋ の増減表示**で選ばせる
    // （options は "0"〜"N" のような数値ラベルの昇順で渡す）。個数を決めるだけで「どれを選ぶか」に
    // 意味が無く、候補数が多くなりうるものに使う（BS10-103グロウイングソード＝トラッシュに置くコアの数）。
    // 送られてくる値は従来どおり options のラベルそのものなので、サーバー側の解決は kind:"option" のまま
    resolveOnSkip?: true // kind:"card" / kind:"target"：スキップされたときも action を（選択なしで）解決する。
    // 「手札を好きなだけ破棄する」のように、**選び終わってから後処理がある**効果で使う。
    // 既定（未指定）はスキップ＝何もせず終了（従来どおり。BS08堕天使ミカファール）
    confirm?: true // 「〜できる」効果の発動確認（kind:"option" 限定）。選択肢は1つだけで、
    // **選んだラベルを chosenOption として action に渡さない**（渡すと選択肢を解釈するアクションが誤動作する）。
    // スキップ＝発動しない。EffectDef.triggered.optional が true のときに fireTrigger が立てる
    magicNegate?: {
        // マジックの無効化（kind:"magicNegate"）の確認待ち。**これが立っているときは action を解決しない**。
        // 「無効にする」を選べばコストを払ってマジックの効果を捨て、選ばなければ中断していた解決を続ける
        // （doResolveChoice が resolveMagicEffects を呼び直す）。BS02鏡の回廊Lv2／今後の【氷壁】
        casterPid: PlayerId // マジックの使用者
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 無効化する側の発生源（コストの支払い元）
        paidCost: boolean // 使用者が「コストを支払って」使用したか（BS11-X05 魔導双神ジェミナイズ用。中断をまたいで持ち回す）
    }
    handFreeSummon?: {
        // 手札のカード自身による無償召喚（kind:"freeSummonFromHandOnLifeDamaged"）の確認待ち。
        // **action は解決しない**。選べば手札のそのカードをコストを支払わず召喚する
        pid: PlayerId
        cardId: string
    }
    trashFreeSummon?: {
        // 手札から破棄されてトラッシュに置かれたカード自身による無償召喚
        // （kind:"freeSummonFromHandOnDiscardedByOpponent"）の確認待ち。**action は解決しない**。
        // 選べばトラッシュのそのカードをコストを支払わず召喚する（BS09-025忍者サルトベ）
        pid: PlayerId
        cardId: string
        trashIndex: number
    }
    reviveConfirm?: {
        // 「破壊される代わりに復活できる」の確認待ち。magicNegate と同じく **action は解決しない**。
        // 選べばコストを払って復活が確定し、選ばなければその場で破壊する
        pid: PlayerId
        instanceId: string
        effectId: string
        sourceInstanceId: string
        context?: DestroyContext
    }
    braveKeep?: {
        // 合体スピリットが場を離れたとき、「ブレイヴをスピリット状態で残しますか？」の確認待ち
        // （docs/design/BRAVE.md §6.3）。**action は解決しない**。
        // 選べば need 個のコアを置いて field.spirits へ戻し、選ばなければトラッシュへ置く。
        // 確認中のブレイヴは GameState.pendingBraveKeeps に「コアを乗せずに分けて置いた」状態でいる
        // （場のどのゾーンにも属さないので、クライアントへはこの cardId で見せる）
        pid: PlayerId
        instanceId: string
        cardId: string
        need: number // スピリット状態の Lv1 維持コスト（braveKeepCores）
    }
    blockBattlePick?: {
        // 複数体ブロック（blockRequiresCount）で宣言がそろったあと、**アタック側**が
        // どのブロッカーとバトルするかを選ぶ待ち。**action は解決しない**。
        // 選ばれなかったブロッカーは BattleState.extraBlockerIds に入り、バトルには参加しない
        blockerPid: PlayerId
    }
    fushiSummon?: {
        // 【不死】：トラッシュにあるこのカードを、コストを支払って召喚するかの確認待ち。
        // reviveConfirm と同じく **action は解決しない**（BS09。docs/design/BS09_PLAN.md §3）
        pid: PlayerId
        cardId: string
        trashIndex: number // 同名カードが複数あるときにどれを出したかを固定する
    }
    spiritMillFreeSummon?: {
        // 器AR：BS13-034ミノガメン「相手のデッキ破棄効果で破棄されたこのカードは、コストを支払わずに
        // 召喚できる」の確認待ち。fushiSummonと同じく**action は解決しない**
        pid: PlayerId
        cardId: string
        trashIndex: number // resolveMilledFromDeck が splice する前のトラッシュ内位置
    }
    triggerOrder?: {
        // 同時に発揮する**誘発**のうち「どれから解決するか」の選択待ち。destroyOrder と同じく
        // **action は解決しない**。選ぶのは常にターンプレイヤーで、選ばれた番号は
        // GameState.triggerOrderPick に記録され、誘発バッチ（ResumeFrame の triggerBatch）が
        // その1件を取り出して解決し、残りが2件以上ならまた聞く。
        // 同時発揮の一般則（docs/design/TIMING_CHART.md §0-3）の実装
        count: number // 候補の件数（PendingChoice.options と同順）
    }
    destroyOrder?: {
        // 同時に破壊される複数体のうち「**どの体から破壊処理をするか**」の選択待ち。
        // reviveConfirm と同じく **action は解決しない**。選ぶのは常にターンプレイヤーで、
        // 選ばれた個体は GameState.destroyOrderPick に記録され、破壊バッチが残りの先頭へ入れ替える。
        // 同時発揮の一般則（docs/design/TIMING_CHART.md §0-3）の実装
        instanceIds: string[] // 候補の instanceId（PendingChoice.options と同順）
    }
    deckMillNegate?: {
        // 「デッキの破棄を、コストを払って無効にできる」の確認待ち。reviveConfirm と同じく **action は解決しない**。
        // 選べばコストを払って破棄が無効になり、選ばなければ見送っていた破棄をここで行う
        pid: PlayerId
        sourceInstanceId: string
        effectId: string
        count: number
        actorPid: PlayerId
        sourceType?: CardType
    }
    magicRedirect?: {
        // 対象の絞り込み（kind:"magicTargetRedirect"）の確認待ち。magicNegate と同じく **action は解決しない**。
        // 選べば GameState.magicRedirectDecision に承認を記録してからマジックの解決へ進み、
        // 選ばなければ拒否を記録して同じく解決へ進む（どちらも doResolveChoice が resolveMagicEffects を呼ぶ）
        casterPid: PlayerId
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 絞り込み先＝確認を出す側の発生源
        paidCost: boolean // magicNegate と同じ（BS11-X05 用）
    }
    magicSideChoice?: {
        // 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の対象変更の確認待ち。
        // magicRedirect と同じく **action は解決しない**（答えを GameState.magicSideDecision に
        // 記録してからマジックの解決へ進む）。選ぶのは**魔導書の持ち主**で、マジックの使用者とは限らない
        casterPid: PlayerId
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 魔導書＝確認を出す側の発生源
        ownerPid: PlayerId // 魔導書の持ち主（＝選ぶ人）
        paidCost: boolean // magicNegate と同じ（BS11-X05 用）
    }
    magicRepeat?: {
        // 「マジックの効果発揮後、同じ効果をもう1度だけ発揮できる」（kind:"magicRepeatGrant"）の確認待ち。
        // **action は解決しない**（選べば2周目を走らせ、選ばなければマジック使用時の誘発へ進む）。
        // 1周目が解決しきってから聞く（『効果発揮後』なので順序が決まっている）
        casterPid: PlayerId
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 再発揮を与えている発生源
        paidCost: boolean // magicNegate と同じ（BS11-X05 用）
    }
    magicFreeChoice?: {
        // 「マジックをコストを支払わずに使用できる」（kind:"magicFreeGrant"）の使用時確認。
        // **action は解決しない**（答えを持って doCastMagic をやり直す）。
        // 無償化の枠が1枚きりのカード（大天使イスフィール）で枠を温存できるようにするため、
        // 無償で使えるときも「あえてコストを払う」を選べる（2026-08-15 ユーザー確認）
        handIndex: number
        targetInstanceId?: string
        paySources?: PaySource[]
        fromTegamoto?: boolean
    }
    revertActivated?: {
        // 起動能力（kind:"activated"）から出た選択を**やめた**ときに、「ターンに1回」の消費を
        // 巻き戻す先。起動ボタンを押してから対象を見てやめられるようにするためのもので、
        // やめた場合は「そもそも効果を発揮しなかった」扱いにして同じターンにもう一度起動できる
        // （2026-08-21 ユーザー確定。対象は timing:"main" の起動能力のみ＝BS08帝竜騎サイクル）。
        // doActivateAbility が resolveAction 後に立て、doResolveChoice がスキップ時に消す
        instanceId: string
        effectId: string
    }
    action: EffectAction // 選択後に resolveAction する本体
    actorPid?: PlayerId // action を「誰の効果として」解決するか。省略時は pid（選択者自身）。
    // **選択者と実行者が別**のケースで使う（BS02-012 ケンドラゴス：相手に色を選ばせて、破壊は発生源の持ち主の効果として行う）
    selfInstanceId: string | null // 発生源スピリット（self の復元用）
    // 中断された残りの処理は **GameState.resumeStack** が持つ（pendingChoice からは独立）。
    // かつてここに queue: EffectAction[] を持っていたが、EffectAction の列しか運べず、
    // 破壊ループの奥などからは中断できなかった。docs/design/RESUME_STACK.md §1
}

// 中断した処理の再開情報（GameState.resumeStack の要素）。
// **pendingChoice から独立している**のが要点：選択待ちの内側に継続を持つと、
// 選択待ちを立てられない深い場所では継続も保存できない。docs/design/RESUME_STACK.md §2
export type ResumeFrame =
    | {
          kind: "action" // 効果アクションを1つ解決し直す
          selfInstanceId: string | null // 発生源（self の復元用）
          action: EffectAction
          actorPid?: PlayerId // 省略時は再開を駆動している側の pid として解決する
          // ここから下は fieldEvent 誘発の残りを積むときに使う（2026-08-17）。
          // fieldEvent は「self＝イベント対象／発生源＝エントリを持つカード」がずれることがあり、
          // 発生源の色・種別を渡さないと装甲やマジック効果耐性の判定が self 側から導出されて誤る
          // 「〜できる」（optional）の誘発の残りを積むときに入れる。再開時は**発動確認から始める**。
          // 入れないと2枚目以降が確認なしで自動発動してしまう（同名ネクサスを並べたときに出る）
          confirmPrompt?: string
          // 解決の直前に出すログ（ステップ誘発の「〜の効果が発動した」を再開経路でも残すため）
          logText?: string
          // この instanceId が**破壊待機状態でなければ何もしない**（docs/design/TIMING_CHART.md）。
          // 破壊で誘発した効果を1列に並べたとき、途中で「フィールドに残る／戻る」が解決すると
          // その破壊は無かったことになり、列の残りは空振りする。
          // ⚠️ 再開スタックからフレームを**消さない**のが要点。resolveInOrder の「残りは必ず積む」保証は
          // 積み忘れで実バグ4件を出して作られたものなので穴を開けず、消化時に無効化する
          requiresPendingDestructionOf?: string
          targetInstanceId?: string // 効果の対象（イベント対象を引き継ぐ）
          sourceColors?: Color[] // 発生源の色（self とずれるとき）
          sourceType?: CardType // 発生源の種別（同上）
      }
    | {
          // 列を**使い切ったあと**に実行するフレーム（省略可）。破壊で誘発した効果の列では
          // 「破壊の確定（トラッシュ行き）」をここに入れる。バッチは解決のたびに自分を積み直すので、
          // 外側から固定位置に積むと追い越されてしまう（docs/design/RESUME_STACK.md §3）
          after?: ResumeFrame
          kind: "triggerBatch" // 同時に発揮する誘発の束。1グループずつ解決し、2グループ以上残っていれば
          // そのたびにターンプレイヤーへ解決順を聞く（docs/design/TIMING_CHART.md §0-3）
          askPid: PlayerId // 解決順を決める側（＝ターンプレイヤー）
          // **グループは「カード単位」**。同じカードの複数エントリは「ドロー後、〜する」のように
          // テキストで順序が決まっているので、まとめて1つの選択肢として扱い、中は元の順で解決する
          groups: { label: string; frames: ResumeFrame[] }[]
      }
    | {
          // 【転召】の対象選択で中断した召喚の続き。
          // 手順（docs/design/RESUME_STACK.md §6）は
          // 「コストを支払う → 転召 → 維持コアを置く → 召喚完了 → 召喚時効果」なので、
          // 転召が選択待ちになった時点で**スピリットはまだ場に出ていない**。
          // 選択が解決したらここで場に出し、召喚時効果へ進む（2026-08-20）
          kind: "placeSummon"
          pid: PlayerId
          inst: CardInstance // まだ場に出していないインスタンス（維持コアは載っている）
          reserveDelta: number // 場に出すときリザーブから引く数（フィールドのコアで賄えた分を差し引いた残り）
          logText: string // 「〜を召喚した」のログ（場に出た時点で出す）
          cardName: string // クライアント演出用イベントに載せる名前
          braveTargetInstanceId?: string // ダイレクトブレイヴのとき、合体先スピリットの instanceId（BRAVE.md §5.2）
      }
    | {
          kind: "turnStart" // ターン開始処理（start→core→draw前→ドロー→refresh→main）の続き。
          // ステップ誘発が選択待ちを立てたときに、次のステップ番号を積む
          step: number
      }
    | {
          // 複数体をまとめて破壊する処理の続き。1体ごとに「破壊される代わりに復活**できる**」の
          // 確認で中断しうるので、**どこまで進んだか（index）と実際に破壊できた数（destroyed）**を持ち回る。
          // 数を持ち回るのは「この効果で破壊したスピリット1体につき」を中断をまたいで正しく数えるため
          // （docs/design/RESUME_STACK.md §7 ①）
          kind: "destroyBatch"
          ownerPid: PlayerId // after を解決する側（効果の持ち主）
          // context を対象ごとに変えられる（省略時はバッチ共通の context）。
          // バトルの相打ちは「ブロッカーを破壊したのはアタッカー／アタッカーを破壊したのはブロッカー」と
          // 破壊元が対象ごとに違うため、1つの同時破壊の中で使い分ける必要がある
          targets: { pid: PlayerId; instanceId: string; context?: DestroyContext }[]
          index: number
          destroyed: number
          context?: DestroyContext
          after?: {
              // 全体を破壊し終えたあとの処理（破壊できた数を使うもの）
              drawPerDestroyed?: true
              voidCoreToSelfPerDestroyed?: true
              selfInstanceId?: string // voidCoreToSelfPerDestroyed の置き先
          }
      }
    | {
          // 破壊待機状態の続き（＞６）。破壊時の誘発が中断したときに、
          // **カードを破壊待機状態のまま**残して、残りの処理を後へ送るために積む。
          // step:1＝フィールドイベント誘発から／step:2＝破壊の確定（トラッシュ行き）だけ。
          // docs/design/TIMING_CHART.md §1.5
          kind: "destroyCommit"
          pid: PlayerId
          instanceId: string
          step: number
          byBattle: boolean // 誘発の絞り込み（byBattleOnly）用。破壊時の DestroyContext から取る
          wasAttacker: boolean // 同上（attackerOnly）。バトルが終わると判定できないので破壊時に控える
          bySpiritEffect: boolean // 同上（byOpponentSpiritEffectOnly）。相手のスピリットの効果による破壊だったか
          byOpponentEffect: boolean // 同上（byOpponentEffectOnly）。相手によって破壊された（効果 or バトル敗北）か。BS12-005星角獣ユニゴーント
          sourceInstanceId?: string // 同上。その効果を発揮したスピリットのインスタンスID（DestroyContext.sourceInstanceId）
      }
    | {
          // バウンス待機状態の続き。**移動はすでに済んでいて、残りの誘発だけ**を後へ送る。
          // 戻ったカードはもうフィールドに無いので、誘発に渡すインスタンスをそのまま持ち回る
          kind: "bounceFlush"
          moved: { pid: PlayerId; inst: CardInstance; to: "hand" | "deckTop" | "deckBottom" }[]
          index: number
      }
    | {
          // ネクサスの破壊処理（＞６）の続き。誘発が中断したときに、
          // **ネクサスを破壊待機状態のまま**残して残りを後へ送る。docs/design/TIMING_CHART.md §1.5
          kind: "destroyNexusCommit"
          pid: PlayerId
          instanceId: string
          step: number
          byOpponentEffect: boolean // 「相手の効果で破壊されたとき」限定エントリの判定材料
      }
    | {
          // バトル解決（＞５のBP比較が終わった後 〜 ＞７のバトル終了宣言）の続き。
          // 破壊処理・各誘発・【呪撃】・【光芒】のどこでも選択待ちが立ちうるので、
          // **1ステップ＝中断しうる呼び出し1つ**に割って step で再入する。
          // docs/design/TIMING_CHART.md（＞５〜＞７）／RESUME_STACK.md §7
          kind: "battleResolve"
          step: number // 次に実行するステップ番号（BATTLE_STEPS の並び）
          attackerPid: PlayerId
          attackerInstanceId: string
          blockerInstanceId: string
          outcome: "attackerWins" | "blockerWins" | "mutual" | "none" // ＞５のBP比較の結果（＞６以降で覆らない）。none＝器AV（BS13-082）でBP比較自体を飛ばした
          attackerColors: Color[]
          blockerColors: Color[]
          attackerLevel: number
          blockerLevel: number
          attackerBp: number
          blockerBp: number
          // 破壊された個体は場から消えるが、『相手のスピリットに破壊されたとき』（onBattleLose）や
          // ログのカード名は破壊後にも参照する。中断をまたぐと元の参照が失われるので、
          // ＞６に入る直前の写しを持ち回る（coresAtDestruction は destroySpirit と同じく破壊直前のコア数）
          attackerSnapshot: CardInstance
          blockerSnapshot: CardInstance
      }

// ゲーム全体の状態（サーバーで一元管理）
export interface GameState {
    gameId: string
    turn: number // 通算ターン数（p1→1, p2→2, ...）
    turnPlayer: PlayerId
    phase: Phase
    priorityPlayer: PlayerId
    isFlashTiming: boolean
    flashCount: number
    battle: BattleState | null
    players: Record<PlayerId, PlayerState>
    log: string[]
    winner: PlayerId | null
    endAttackStepAfterBattle: boolean // 今のバトルが終了したときアタックステップを強制終了するか（サイレントウォール用）
    extraAttackStepPending?: true // **アタックステップとエンドステップをもう1回ずつ行う**（BS10-008 火星神龍アレス・ドラグーン）。
    // PhaseManager.endTurn が「エンドステップの誘発を解決した直後・一時状態のリセット群の前」でこれを見て、
    // ターンプレイヤーを交代せずアタックステップへ戻す。**一度使ったら消す**（同じターンに何度も戻らないため）。
    // ⚠️ この位置より後ろでリセットするとターン終了時の一時状態（tempBpBuff 等）が消えてしまうので、
    // 分岐はリセット群より前でなければならない
    turnConstraints: TurnConstraintDef[] // このターンの間だけ有効な全体制約（ターン終了でリセット。ヘビィゲート）
    endStepLocks: EndStepLock[] // エンドステップを数える封印（BS10-108 ルナティックシール）。**ターン終了でリセットしない**
    triggerSuppressionThisTurn: { pid: PlayerId; trigger: TriggerEvent }[] // このターンの間、pid のスピリットの指定トリガーを発揮させない（ターン終了でリセット。ユーサネイジア）
    attacksThisTurn: number // このターンに宣言されたアタックの回数（doAttackで加算・ターン終了でリセット）。「ターンの最初のアタック」判定に使う（BS04ダックル／燃えさかる戦場Lv2）
    lastAttackerCombinedPid?: PlayerId // 直前のアタック宣言が合体スピリットによるものだったとき、そのアタッカーの持ち主（doAttackが宣言のたびに更新。それ以外はundefined）
    prevAttackerCombinedPid?: PlayerId // 「1つ前」の lastAttackerCombinedPid（doAttackが次の宣言の直前にスライドさせる）。ターン開始でどちらもリセット（「次にアタックした」はターンをまたがない。BS10-047赤ずきん妖精ルージュLv3）
    ignoreUnblockableThisTurn: PlayerId[] // このターンの間、ここに含まれるプレイヤーのスピリットは「ブロックされない」効果を無視してブロックできる（ターン終了でリセット。BS04レッドウォール）
    blockTriggersAsAttackThisTurn: boolean // このターンの間、両陣営スピリットすべての『ブロック時』効果を『アタック時』に発揮させる（ターン終了でリセット。fireTriggerが参照。BS01アタックシフト）
    lastDestroyedNexus: { pid: PlayerId; cardId: string } | null // 直近に破壊されたネクサス（destroyNexusが誘発の直前に記録）。reviveLastDestroyedNexus が参照する（BS04戦闘獣ジャッカー）
    lastBattleDestroyedCores: number // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（次のバトル解決の冒頭でリセット。魔界七将デストロード）
    lastBattleDestroyedLevel: number // 直前のバトル解決でBP比較により破壊されたブロッカーのcurrentLevel（次のバトル解決の冒頭でリセット。0=まだ発生していない。魔界伯爵ヴィール）
    lastBattleDestroyedInstanceId?: string // 直前のバトル解決でBP比較により破壊された側の instanceId
    // （action:"battleLoserCoresToVoid" が読む。破壊待機中＝コアがまだ乗っている間に呼ぶ前提。BS10-065 ヘッジボルグ）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 「デッキを上からN枚オープンする」の公開ゾーン（両者に見える一時領域）。
    // deckReveal が積み、手札に加える／デッキの下に戻す処理が終わったら消す。cardZone:"reveal" の選択元になる
    magicRedirectTo?: { pid: PlayerId; instanceId: string } // 解決中のマジックの対象が1体へ絞り込まれている間だけ立つ（kind:"magicTargetRedirect"。この pid のスピリットのうち instanceId 以外は、そのマジックの効果を受けない）。resolveMagic が解決の前後で設定・解除する
    // 「そのマジックの効果の対象を、このスピリットのみに**できる**」の任意性（BS04サンク／BS05スノーホワイト）。
    // 対話モードでは resolveMagic が守る側に1回だけ確認し、その答えをこのマジックの解決中ずっと使う
    // （アクションごとに聞き直さない）。**非対話（テスト・自動解決）ではセットされず、従来どおり自動で絞り込む**
    magicRedirectDecision?: { sourceInstanceId: string; approved: boolean }
    // 「手札1枚を破棄することで、その効果を受けない」（BS08竜騎集う円卓Lv2）の答え。
    // **1回の対象化につき1つ**だけ立ち、resume を解決し終えたら消える。
    // 手札の破棄は聞いた時点で済ませてあるので、resistanceAgainst 側はこの値を読むだけでよい。
    // **非対話（テスト・自動解決）ではセットされず、従来どおり払える限り自動で払う**
    payNegateDecision?: { targetInstanceId: string; paid: boolean }
    // 封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の「対象を相手のみ／自分のみに変更できる」の答え。
    // **keepPid が対象として残る側**（null＝変更しない＝両陣営のまま）。魔導書の持ち主とマジックの使用者は
    // 別人でありうる（『自分のターン』中に相手がフラッシュで使った場合）ので、
    // 「持ち主から見た自分／相手」ではなく残す側の PlayerId をそのまま持つ。
    // 対話モードでは resolveMagic が魔導書の持ち主に1回だけ確認し、そのマジックの解決中ずっと使う。
    // **非対話（テスト・自動解決）ではセットされず、従来どおり持ち主に有利な側へ自動で固定する**
    magicSideDecision?: { sourceInstanceId: string; keepPid: PlayerId | null }
    // 「無償で使えるが、あえてコストを払って使う」を選んだ直後だけ立つ（doCastMagic が立て、
    // resolveMagic が読んですぐ消す）。**oncePerBattle の無償化の枠を消費させない**ために使う
    // （払って使ったのだから、1枚きりの枠は残る。BS07大天使イスフィール）
    magicFreeDeclined?: boolean
    // 直前に bpBuff が BP を増加させた対象の instanceId。効果文が「〜をBP+2000する。**そのスピリットが**〜」と
    // 前の文を指しているカードで、後ろの文を対象1体に限定するために使う（BS07ニードルショット）。
    // 直後の lendSelfThisBattle が仮想発生源の lentBuffTargetId へ写して、そこから battleWon が読む
    lastBpBuffTargetId?: string
    // いま解決中の効果の発生源（resolveAction が handler を呼ぶ間だけ立ち、抜けるときに元へ戻す）。
    // 「**相手の〈色〉のスピリット/ネクサス/マジックの効果で**〜されたとき」を判定するために使う
    // （fieldEvent.sourceColorFilter）。ドローステップのドローやコアステップのコア置きのような
    // **効果によらない**動きでは undefined のままなので、それだけで「効果によるものか」を区別できる。
    // 詳細は docs/design/EFFECT_SOURCE_CONTEXT.md
    currentEffectSource?: { pid: PlayerId; type?: CardType; colors?: Color[] }
    lastBattleDestroyedColors: Color[] // 直前のバトルで「BPを比べ相手のスピリットだけを破壊した」ときの**破壊された側**の色（次のバトル解決の冒頭でリセット。TargetFilter.sameColorAsBattleLoser が参照。BS04獣使いドヴェルグ）
    lastBattleDestroyedFamilies: string[] // 同上の系統（TargetFilter.sameFamilyAsBattleLoser が参照。BS04ニーベルングリング）
    resolvingSummonTriggerPid?: PlayerId // スピリットの『このスピリットの召喚時』効果を解決している間だけ立つ、その発生源の持ち主
    // （fireSummonTrigger が設定し、選択待ちで中断した場合は残して handleAction の事後フックがクリアする。
    // ConstraintDef.immuneToOpponentSummonEffects を isEffectBlocked が判定するために使う。BS05リトルナイト・ランスロットLv3）
    lastBattleDestroyedBp: number // 同上の実効BP（破壊直前に測る。0=まだ発生していない。TargetFilter.sameBpAsBattleLoser が参照。BS03熾烈極める最前線Lv2）
    // このバトル中に自分の【暴風】で疲労させた相手のスピリット（BS06颶風高原Lv2 が「【暴風】で疲労した
    // 相手のスピリットすべて」を参照する）。バトルごとの記録なので clearBattle でクリアする
    bofuExhaustedThisBattle: { pid: PlayerId; instanceId: string }[]
    lastBattleDestroyedCost: number // 同上のコスト（破壊直前のカード記載コスト。0=まだ発生していない。action:"millPerLoserCost" が参照。BS06名誉ある御前試合）
    pendingChoice: PendingChoice | null // 効果解決中のプレイヤー選択（非null中は resolveChoice 以外のアクションを拒否する）
    // 直前の「破壊される代わりに復活できる」の確認で、**結局その個体が破壊されたか**。
    // 破壊バッチ（destroyBatch フレーム）が中断から再開したときに、中断の原因になった1体を
    // 「破壊できた数」に算入するかの判定に使う（断って破壊された＝算入する。RESUME_STACK.md §7 ①）。
    // 承認して場に残った／手札へ戻った場合は false。読み取ったら消す
    lastReviveDestroyed?: boolean
    // 直前の「どの体から破壊処理をするか」（PendingChoice.destroyOrder）でターンプレイヤーが選んだ instanceId。
    // 破壊バッチ（destroySpiritsFrom）が再開時に読み取り、その個体を残りの先頭へ入れ替えて消す。
    // 同時発揮の一般則（docs/design/TIMING_CHART.md §0-3）
    destroyOrderPick?: string
    // 直前の「どの誘発から解決するか」（PendingChoice.triggerOrder）でターンプレイヤーが選んだ番号。
    // 誘発バッチ（ResumeFrame の triggerBatch）が再開時に読み取り、読んだら消す
    triggerOrderPick?: number
    // ターンプレイヤーが選んだ側。destroySpiritsFrom が読み取って解決順を組み立て、読んだら消す
    // 召喚の途中で、**まだ場に出していない**スピリットの instanceId（2026-08-20）。
    // 【転召】は「召喚コスト支払い後・維持コアを置く前」に解決するため、その間だけ立つ。
    // これが立っている間は『転召したとき』の誘発を保留する（下の pendingTenshoEvent）
    summoningFromHand?: true // いま解決中の召喚が**手札からの召喚**か（通常召喚・効果による手札からの召喚のどちらも）。fireSummonSequence が読んで「手札から召喚されたとき」（fieldEvent.fromHandOnly。BS11-X05 魔導双神ジェミナイズ）に渡し、そこで消す
    summoningBySoku?: true // いま解決中の召喚が【神速】によるものか（フラッシュタイミングの手札からの召喚）。fireSummonSequence が読んで「【神速】の効果で召喚されたとき」（fieldEvent.sokuSummonOnly。BS11-065 満天の牧草地Lv2）に渡し、そこで消す
    summoningInstanceId?: string
    // 保留した『転召したとき』（fieldEvent "ownTensho"）。召喚されたスピリットが場に出た時点で発火する。
    // 保留しないと、召喚されたカード自身が持つこの誘発（BS08-009関将龍皇ドラグロン等6枚。
    // 効果文では『召喚時』ブロックの一部）を拾えない
    pendingTenshoEvent?: { pid: PlayerId; families: string[]; names: string[] }
    // 合体スピリットが場を離れて、**コアを乗せずに分けて置いてある**ブレイヴ（BRAVE.md §6.3.1）。
    // 場のどのゾーンにも属さない一時的な置き場で、flushBraveKeeps が1体ずつ決着させる
    // （残す＝コアを置いて field.spirits へ／残さない＝トラッシュへ）。
    // **答えが返るまでエントリを消さない**ので、確認が別の中断に上書きされても保険の flush で拾い直せる
    pendingBraveKeeps?: { pid: PlayerId; brave: CardInstance; wasAttacker: boolean; wasBlocker: boolean }[]
    resumeStack: ResumeFrame[] // 中断した処理の再開情報。先頭から順に消化する（docs/design/RESUME_STACK.md）
    resumeInsertAt: number // 「今回の中断で積まれた領域の末尾」を指す挿入位置。
    // 中断が始まるたび（pendingChoice を立てるたび）に 0 へ戻す。
    // **単純な push / unshift ではどちらも解決順が壊れる**：1回の中断では内側の層から外側の層へ順に
    // フレームが積まれ、正しい順は「内側 → 外側 → それ以前の中断の古いフレーム」。RESUME_STACK.md §3
    // 「破壊される代わりに復活**できる**」（reviveOnDestroy.optional）の確認待ち行列。
    // 破壊処理の途中では中断できない（destroySpirit の呼び出しはループの中にあり、
    // pendingChoice の queue は EffectAction の列しか運べない）ため、いったん破壊を見送って
    // ここへ積み、handleAction の末尾＝安全な地点で1件ずつ確認する
    pendingReviveConfirms?: {
        pid: PlayerId
        instanceId: string
        effectId: string // 適用する reviveOnDestroy エントリのid（承認時にコスト・復活先を再解決する）
        sourceInstanceId: string // 発生源（oncePerTurn の記録先。scope:"self" なら対象自身）
        context?: DestroyContext // 断ったときに破壊し直すための文脈
    }[]
    activationFizzled?: true // 起動能力（kind:"activated"）の効果が、対象がいないなどで**何も起こさずに終わった**ことを示す一時フラグ。
    // 起動能力から使うアクション（いまは summonFromHandFree の cancelable 経路）が立て、doActivateAbility が
    // 「ターンに1回」の消費を巻き戻してから消す。立てっぱなしにしないよう、doActivateAbility が発動のたびに落とす
    drawStepSkipped: boolean // このターンのドローステップのドローを、効果のコストとして放棄したか（BS07常闇の聖堂Lv2「ドローしないことで」）。ドローの前に発火する step.beforeStepAction の効果が立て、ドロー区間がこれを見て引かずに進む。ターン開始処理の先頭で false に戻す
    coreStepSkipped: boolean // このターンのコアステップの「ボイドからリザーブへコアを置く」を、効果のコストとして放棄したか（BS10-087戦場に息づく命「ボイドからコアを自分のリザーブに置かないことで」）。drawStepSkipped と同型で、コア置きの前に発火する step.beforeStepAction の効果が立てる
    interactiveTargets: boolean // trueなら誘発効果の対象選択候補2件以上でpendingChoiceを要求する（既定false。実対戦では server/src/index.ts が true に設定。smokeは既定のfalseのまま自動選択を使う）
    events: GameEvent[] // クライアント演出用の一時イベント列（handleAction冒頭でクリア）
    eventSeq: number // GameEvent.seq の通し番号（クリアしてもリセットしない）
    magicUsedThisTurn: Record<PlayerId, number> // このターンに各プレイヤーがマジックを使用した回数（ターン終了でリセット。magicRestriction:"oncePerTurnAll"用。作戦参謀フォクシン）
    millCountThisTurn: Record<PlayerId, number> // このターンに各プレイヤーが相手の効果でデッキを破棄された累計枚数（ターン終了でリセット。globalConstraint "millCap" の perTurn用。BS04侵されざる聖域Lv2。隠匿情報を含まないがGameViewには含めない＝サーバー内部のみで判定に使う）
    millCountThisTurnMutual: Record<PlayerId, number> // 器AM：このターンに各プレイヤーが**誰の効果であっても**デッキを破棄された累計枚数（ターン終了でリセット。globalConstraint "millCap" の mutual用。millCountThisTurnとは別集計＝相手効果限定の既存カードを巻き込まない。BS13-026キグナ・スワンMk-II）
    battleAttackerRef?: CardInstance // 今のバトルのアタッカーの**実体参照**（GameViewには含めない＝サーバー内部のみ）。
    // アタッカーが場を離れてバトルが終わるとき、＞７の【光芒】判定に cardId とコア数が要るため保持する。
    // 場から取り除かれた後でもオブジェクト参照からは読み取れる（resolveBattle が attacker を
    // ローカル変数で持ち回っているのと同じ考え方）。clearBattle で消す
    lastFunsai?: { total: number; spirits: number; nexuses: number; magics: number } // 直前の【粉砕】で破棄した内容（resolveFunsaiが記録）。アタック宣言のたびにクリアする（doAttack冒頭）。EffectCounter "lastFunsaiTotal"/"lastFunsaiSpirits"とtriggered.condition {lastFunsaiHasNexus}が参照する（BS03巨人王ランドルフ／BS04二刀流のアムブローズ／BS04伝説巨人ジュード）
    lastMagicCast?: { pid: PlayerId; cardId: string; timing: "main" | "flash"; targetInstanceId?: string } // 直前にプレイヤー自身が手札/手元から使用したマジック（doCastMagic・castMagicFromTrashByColorが記録。action:"magicMirrorRepeat"が参照する。**フラッシュタイミングが閉じた時点**でクリアされ、それより前の使用は対象にならない＝フラッシュ①で使われたマジックをフラッシュ②で写すことはできない。バトル終了時（clearBattle）にもクリアする。BS08マジックミラー）
}

// このターンの間だけ有効な全体制約の定義（GameState.turnConstraints が参照する宣言的ルール）
export type TurnConstraintDef =
    | { type: "cantActByCost"; maxCost?: number; costs?: number[]; blockOnly?: true; pid?: PlayerId; nonVanillaOnly?: true } // コストがmaxCost以下（costs指定時はそのいずれかと一致）のスピリットはすべてアタック/ブロック不可（ヘビィゲート）。blockOnly指定時はブロックだけを止める（BS11-057 バタホルン＝コスト4/6/8の相手はブロックできない）。**maxCost省略時はコストを問わない**。pid指定時はそのプレイヤーのスピリットだけ、nonVanillaOnly指定時は効果の記述を持つスピリットだけに効く（BS11-082 ウィッグバインド＝「効果の記述を持つ相手のスピリットすべて」）
    | { type: "cantUseHandCardsForPid"; pid: PlayerId; allowedColor?: Color; bannedColors?: Color[] } // このターンの間、この pid は手札のカードを使えない（召喚・配置・マジック使用のすべて）。allowedColor指定時はその色だけ使える（BS11-082＝「黄以外の手札のカードを使えない」）、bannedColors指定時はその色だけ使えない（BS11-060 雷神砲カノン・アームズ）
    | { type: "noLifeDamageByCostForPid"; maxCost?: number; pid: PlayerId; symbolCount?: number; combinedOnly?: true } // コストがmaxCost以下のスピリットのアタックでは、この pid のライフだけが減らされない（action:"protectLifeByCostThisTurn" が積む。BS07秘密の花園Lv2）。symbolCount+combinedOnly指定時はmaxCostの代わりに「シンボル数がsymbolCountちょうど、かつ合体スピリット」のアタックでのみ保護する（globalConstraint:"noLifeDamageByCost"のsymbolCount+combinedOnlyの片側版。BS12-043大地の狩人コンドラッドLv1：「シンボル2つを持つ合体スピリットのアタックでは、自分のライフは減らない」）
    | { type: "mustAttackByCost"; pid: PlayerId; maxCost: number } // このターンの間、pidのコストがmaxCost以下のスピリットは可能ならば必ずアタックする（action:"forceAttackThisTurn"のmaxCost版が積む。BS08アンブッシュブロッカー）
    | { type: "mustAttackByInstance"; pid: PlayerId; instanceId: string } // このターンの間、pidの指定インスタンスは可能ならば必ずアタックする（action:"forceAttackThisTurn"のcount版が積む。BS08獣機合神セイ・ドリガン）
    | { type: "armorDisabledForPid"; pid: PlayerId } // このターンの間、この pid のスピリットの【装甲】は一切働かない
    // （すでに持っている分も、このターンに新たに付与された分も。**判定の入口で一括して落とす**
    //  ＝「【装甲】をないものとして扱い、新たに得ることもない」。2026-08-16 ユーザー判断。SD01-040 アーマーパージ）
    | { type: "lifeDamageMaxForPid"; max: number; pid: PlayerId } // このターンの間、この pid のライフは1回のアタックで max 個までしか減らない（0 なら減らない）。
    // **「減るか／減らないか」ではなく上限を値で持つ**のが要点（2026-08-16 ユーザー提案）。
    // ライフダメージはブロックされなかったアタックでのみ発生するので、
    // 効果文の「ブロックされなかった相手のスピリットのアタックでは」は自動的に満たされる（SD01-039 ブリザードウォール）
    | { type: "unblockableByLevelThisTurn"; pid: PlayerId; levels: number[] } // このターンの間、pid のスピリットすべては、currentLevel が levels に含まれる相手のスピリットからブロックされない（action:"grantUnblockableByLevelThisTurn" が積む。BS10-073 エンジェドール）
    | { type: "braveHostUnblockableThisTurn"; pid: PlayerId; braveInstanceId: string } // このターンの間、braveInstanceId のブレイヴが**いま合体しているホスト**はブロックされない（毎回いまのホストをbravesOf経由で引き直す。分離したら誰にも乗らない。2026-09-07 ユーザー確認。action:"grantHostUnblockableThisTurn" が積む。BS12-055ゲッコ・グライダー）
    | { type: "blockTriggersAsAttackForPid"; pid: PlayerId } // このターンの間、pid のスピリットすべての『ブロック時』効果を『アタック時』に発揮させる（action:"blockTriggersAsAttackOwnThisTurn" が積む。BS10-072 セイバーシャーク）
    | { type: "canBlockWhileRestedThisTurn"; pid: PlayerId; familyFilter?: FamilyFilter } // このターンの間、pidのfamilyFilter一致スピリット（省略時は全て）は疲労状態でもブロックできる（action:"grantCanBlockWhileRestedThisTurn"が積む。constraint:"canBlockWhileRested"のターン付与版。BS08インフィニティシールド）
    | { type: "lifeFloorForPid"; pid: PlayerId; floor: number; byAttackMinCost?: number; byEffectSourceTypes?: CardType[] } // このターンの間、この pid のライフは floor を下回らない（「自分のライフは0にならない」＝floor:1）。byAttackMinCost指定時は**その値以上のコストのスピリットのアタック**でだけ効き、byEffectSourceTypes指定時は**その種別の効果による減少**でだけ効く（どちらも指定すればOR。BS11-080 デルタバリア＝「相手のスピリット/マジックの効果と、コスト4以上の相手のスピリットのアタックでは、自分のライフは0にならない」）
    | { type: "lifeImmuneForPid"; pid: PlayerId } // このターンの間、この pid のライフはあらゆる原因（アタック・lifeCrushアクション）で減らない。lifeDamageMaxForPid（max:0でアタックのみ止める）と違い、lifeCrushアクションの実行自体もこの pid に対しては不発にする全面ロック（action:"lifeImmuneThisTurn"が積む。BS10-093時刻む花時計）
    | { type: "bounceToDeckTopForPid"; pid: PlayerId } // このターンの間、この pid（発生源の持ち主＝効果を発揮した側）が returnToHand で戻すスピリットは、持ち主の手札の代わりにデッキの上へ（action:"bounceToDeckTopThisTurn"が積む。removal.ts の markBounce が currentEffectSource.pid を見て振り替える。BS13-079ヴァニシングデイ）
    | { type: "handReductionColorAsForPid"; pid: PlayerId; color: Color; cardType: CardType } // このターンの間、この pid の**手札**にある cardType のカードすべての軽減シンボル（printed reduction）を color 一色として扱う（effectiveCostがcardData.reductionの代わりに読む。手札のカードなので判定時に都度算出＝書き込まない。action:"handReductionColorAsThisTurn"が積む。BS12-042ヒノキ・ゴレムLv1「自分の手札にあるネクサスカードすべての軽減シンボルすべてを[青]として扱う」）
    | { type: "nexusEffectsDisabledForPid"; pid: PlayerId } // 器BC：このターンの間、この pid（＝相手側）のネクサスすべての効果は発揮されない（action:"opponentNexusEffectsDisabledThisTurn"が積む。nexusEffectsDisabledFor が読む。BS13-039神獣バーロン）
    | { type: "noDeckMillForPidThisTurn"; pid: PlayerId } // 器AR：このターンの間、この pid のデッキは**相手の効果では**破棄されない（globalConstraint "noDeckMillByOpponent" のターン限定版。isDeckMillBlockedが読む。BS13-034ミノガメン：デッキ破棄効果で破棄され無償召喚したときだけ付く）

// ---- クライアントへ送る公開ビュー（相手の手札・デッキ内容は隠す） ----

export interface PlayerView {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    deckSideCores: number // デッキの横に置かれたコア（BS12-078）。公開情報なので両者分を配信する
    deckCount: number
    hand: string[] | null // 自分のみ。相手は null
    handCount: number
    trashCards: string[]
    tegamoto: string[] // 公開ゾーンのため自分/相手とも常に配信する
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
        combinedBraves: CardInstance[] // 公開情報のため自分/相手とも常に配信する（合体表示に要る）
    }
    tempHandKeywordGrants?: { cardId: string; keyword: Keyword }[] // 自分のみ。相手は常に省略（手札内容に紐づくため）
    payToNegate?: boolean // 自分のみ。「手札を破棄して効果を受けない」を払う方針か（UIのトグル表示用。未指定は true 扱い）
    peekedOpponentCardIds?: string[] // 自分のみ。相手の手札で内容を見たカード（BS09-039探偵ペンタン）。相手には常に省略する
    turnVirtualInstances: CardInstance[] // 公開情報のため自分/相手とも常に配信する（TURN_EFFECT_SOURCES.md §2.1）
    battleVirtualInstances: CardInstance[] // 同上（lendSelfThisBattle で貸した「このバトルの間」の発生源）
}

export interface GameView {
    gameId: string
    turn: number
    turnPlayer: PlayerId
    phase: Phase
    priorityPlayer: PlayerId
    isFlashTiming: boolean
    battle: BattleState | null
    players: Record<PlayerId, PlayerView>
    log: string[]
    winner: PlayerId | null
    you: PlayerId
    turnConstraints: TurnConstraintDef[]
    endStepLocks: EndStepLock[] // 公開情報。両者に配信する（画面にカウンターとして出す）
    magicUsedThisTurn: Record<PlayerId, number> // このターンの各プレイヤーのマジック使用回数（隠匿情報なし。クライアントのmagicRestriction判定に必要＝作戦参謀フォクシン）
    ignoreUnblockableThisTurn: PlayerId[] // このターン「ブロックされない」効果を無視できるプレイヤー（隠匿情報なし。クライアントのブロック可否表示に必要＝レッドウォール）
    pendingChoice: PendingChoice | null // 相手視点では candidates を空配列・prompt をマスクして配信（viewFor）
    events: GameEvent[] // クライアント演出用の一時イベント列（隠匿情報なし。viewForがそのまま渡す）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 公開ゾーン（オープンされたカードは両者に見えるためマスクしない）
}

// ---- クライアント → サーバーのアクション ----

export type GameAction =
    | { type: "summon"; handIndex: number; level?: number; paySources?: PaySource[]; substituteInstanceId?: string; discardHandIndices?: number[]; braveTargetInstanceId?: string; altSummonNexusInstanceIds?: string[] } // braveTargetInstanceId指定時は**ダイレクトブレイヴ**＝そのスピリットに合体した状態でブレイヴを召喚する（維持コアを置かない。docs/design/BRAVE.md §5）。省略時、ブレイヴは単体のスピリットとして召喚される // discardHandIndices指定時は、その手札を破棄して**1枚につきコスト1**を支払う（BS08ビクティム）。省略時は従来どおり「コアで足りない分を自動で手札破棄に回す」（非対話・旧クライアント互換） // 召喚（神速持ちはフラッシュ時も可）。level指定時はそのレベルに必要なコア数をリザーブから置いて召喚する（省略時はLv1）。substituteInstanceId指定時は kind:"battleSwapSummon" の召喚＝バトル中の自分のスピリット1体を手札に戻し（追加コスト）、その代わりに疲労状態で召喚してバトルを引き継ぐ（召喚コストは通常どおり必要。発動可否は shared/rules.ts の canBattleSwapSummon で判定できる。BS07ブラックカラカロッサム） // altSummonNexusInstanceIds指定時は kind:"altSummonFromHand" の代替召喚＝指定したネクサス（自分の色一致・cost.countぶん）を自分のデッキの下に戻すことを支払いとし、召喚コストは支払わない（維持コアはリザーブから通常どおり置く。発動可否は shared/rules.ts の canAltSummonFromHand で判定できる。BS10-058水星神龍メルクリウス・サーペント）
    | { type: "setNexus"; handIndex: number; level?: number; paySources?: PaySource[]; millPay?: number } // millPayは配置コストの支払い方法の選択（BS04栄光の表彰台）。0＝コアで払う／実効コストと同じ値＝その枚数だけデッキを上から破棄して払う。**中間の枚数は不可**（併用できない）。省略時は「コアで足りるならコア、足りなければ全額デッキ破棄」 // 配置。level指定時はそのレベルに必要なコア数をリザーブから置いて配置する（省略時はLv1）
    | { type: "castMagic"; handIndex: number; targetInstanceId?: string; paySources?: PaySource[]; fromTegamoto?: boolean } // fromTegamoto指定時はhandIndexが手元(tegamoto)のインデックスを指す（手元からの無償使用。ミカファールLv2）
    | { type: "moveCore"; instanceId: string; direction: "add" | "remove"; confirmDeplete?: true } // confirmDeplete指定時は、維持コア（Lv1）を下回るコアの取り除きを許可し、そのスピリットを消滅させる（コアを他へ回すために自分のスピリットをあえて退かせる操作。クライアントが確認を取ってから送る。2026-08-23 ユーザー要望）
    | {
          type: "awaken" // 覚醒：fromInstanceId のコアを instanceId へ移す
          instanceId: string
          fromInstanceId: string
          count: number
      }
    | { type: "combineBrave"; braveInstanceId: string; hostInstanceId: string } // メインステップの任意合体（docs/design/BRAVE.md §6.4）。スピリット状態のブレイヴを自分のスピリット1体へ合体させる。ブレイヴが載せていたコアは**リザーブへ戻す**（§1.1 の出典とは異なる。分離でリザーブから払うことと対称にするための決定）。合体先の候補は shared/summon.ts の braveCombineCandidates を通す（サーバーとUIで判定を共有する。§5.0）
    | { type: "detachBrave"; braveInstanceId: string; paySources?: PaySource[] } // メインステップの任意分離（§6.4）。⚠️ **Effect の "detachBrave"（効果による分離。コア不要）とは別物**。こちらは braveKeepCores（スピリット状態のLv1維持コスト）以上のコアを置く必要がある。paySources 省略時はリザーブから自動で払い、リザーブが足りなければ拒否する（クライアントは支払いUIへ入って paySources を付けて再送する）
    | { type: "attack"; instanceId: string; targetSpiritInstanceId?: string } // targetSpiritInstanceId 指定時は指定アタック（canDirectAttack 持ちのみ）
    | { type: "block"; instanceId: string }
    | { type: "activateAbility"; instanceId: string; effectId: string } // 起動能力の発動（kind:"activated"、コストを払って任意発動する能力）
    | { type: "resolveChoice"; instanceId?: string; option?: string; cardIndex?: number; paySources?: PaySource[] } // pendingChoice への応答（kind:"target"はinstanceId、kind:"option"はoption、kind:"card"はcardIndex。すべて省略＝スキップ。optionalのときのみ許可）。// paySources指定時は、選んだカードの召喚コストをフィールドのコアからも支払う（「コストを支払って召喚できる」起動効果＝summonFromHandFreeのpayCost。通常の召喚と同じ支払いUIから送られる。2026-08-23）
    | { type: "setPayToNegate"; enabled: boolean } // ⚠️ **廃止予定・効果は無い**（2026-08-17。効果ごとに聞く形へ移した）。UI からトグルが消えたら PlayerState.payToNegate ごと削除する。// 「手札を破棄して効果を受けない」（BS08竜騎集う円卓Lv2）を払うかどうかの方針を切り替える。
    // 効果の判定自体は装甲と同じ同期の述語なので、**その場で聞くのではなく、あらかじめ盤面の状態にしておく**（PlayerState.payToNegate）。
    // 手順の外側の操作なので、自分のターンでなくても選択待ち中でも受け付ける。既定は true（従来どおり払って防ぐ）
    | { type: "takeLife" }
    | { type: "pass" } // フラッシュの優先権を相手に渡す
    | { type: "nextPhase" } // main → attack
    | { type: "endTurn" }
    | { type: "surrender" } // 降参：相手の勝利としてただちに終了する。手順の外側の操作なので、
    // 自分のターンでなくても、フラッシュ中でも、対象の選択待ち中でも受け付ける
