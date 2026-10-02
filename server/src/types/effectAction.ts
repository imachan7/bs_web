// カード効果のアクション（効果が実際に何をするか）。
// `type.ts` の肥大化（丸読みで約16万トークン）を避けるため 2026-09-12 に切り出した。
// import 側は従来どおり `type.ts` から読めばよい（`type.ts` が re-export している）。

import type {
 AuraCounter,
 BattleState,
 CardInstance,
 CardType,
 Color,
 EffectCounter,
 EndStepLock,
 FamilyFilter,
 FieldEvent,
 GameAction,
 GameState,
 Keyword,
 LevelDef,
 PendingChoice,
 PlayerId,
 PlayerState,
 PlayerView,
 TargetFilter,
 TimedContent,
 TriggerEvent,
} from "../type"

// カードデータ1枚に対する条件（reveal の pick・if の cond.last）
// burstEvent＝そのカードのバースト条件（kind:"burst" の event）
export type CardPick = { declared?: "match"; cardType?: CardType | CardType[]; family?: FamilyFilter; color?: Color; keyword?: Keyword; nameIncludes?: string; cost?: number | { min?: number; max?: number }; hasBurst?: true; burstEvent?: FieldEvent }

// last＝GameState.lastMoved に pick を満たすカードが1枚以上。count＝既存カウンタとの比較
// event＝誘発のきっかけ（destroyedColor＝このバースト発動時に破壊されたスピリットの色。targetBpAtLeast＝きっかけの個体の実効BP）
export type IfCond = { last: CardPick } | { count: EffectCounter; atLeast?: number; atMost?: number } | { event: { destroyedColor: Color } | { targetBpAtLeast: number } }

export type EffectAction =
 | { type: "draw"; count: number; side?: "own" | "both"; costSkipCoreStep?: true; countCounter?: EffectCounter; countMax?: number; costSacrificeChosen?: true } // countCounter指定時はEffectCounterの値を枚数として使う（0ならログのみ）。countMaxはmill.countMaxと同義（BS16-040）。自分がデッキから引く（side:"both"は自分→相手の順で両者。省略時は自分のみ）。costSkipCoreStep指定時は「ボイドからコアを置かないことで」がコスト＝そのコアステップの処理を支払いに使う（GameState.coreStepSkipped）
 | { type: "destroy"; filter?: TargetFilter; count: number | "any"; suppressOnDestroy?: true; chosenIds?: string[]; choosing?: true; all?: true; voidCoreToSelfPerDestroyed?: true; countCounter?: EffectCounter; countPerOpponentTrashMagicColors?: boolean; anySide?: true; side?: "own"; excludeTarget?: true; chooserIsTarget?: true; drawPerDestroyed?: true; thenDrawFixed?: number; lowestCost?: true; costSacrificeChosen?: true } // side:"own"指定時は自分側のスピリットが対象（選ぶのは持ち主。pay { cost: destroy{side:"own"} } の器）。thenDrawFixed指定時は破壊処理後（「その後」＝0体でも発火）に固定枚数ドローする。countCounter指定時はEffectCounterの値を破壊数として使う（0ならログのみ）。lowestCost指定時は自動選択の基準をBP最大でなくコスト最小にする（同コストはBP最大）。drawPerDestroyed指定時は実際に破壊できた1体につき1枚ドローする（「残る」で残った個体は数えない）。chooserIsTarget指定時は破壊される側（相手）が対象を選ぶ（実行は発生源の持ち主の効果として解決）。相手スピリットを破壊（filterで絞り込み。省略時はBP不問）。countPerOpponentTrashMagicColors指定時は相手のトラッシュのマジックカードの色種類数（重複除く）を対象数にする。anySide指定時は自分/相手どちらも対象にできる（自動選択は実効BP最大。同値は相手側優先）。excludeTarget指定時はtargetInstanceIdを除外対象として扱う（誘発が渡す対象を避ける）

 | { type: "destroyDuplicateNames"; choosing?: true; keptIds?: string[] } // 相手のフィールドに同じカード名のスピリットが2体以上いるとき、カード名1つにつき1体だけ残して残りを破壊する。**どれを残すかは持ち主が選ぶ**（効果文「カード名1つにつきスピリット1体ずつを残し」に主語が無いので発生源の持ち主。2026-08-24。自動選択はフィールドの先頭側）。choosing / keptIds は重複するカード名を1つずつ聞くための内部フィールド
 | { type: "summonBurstCardFree"; payCost?: true; thenBuffSelf?: number } // payCost指定時は通常の召喚コストも支払う（支払いはリザーブのみ。effectiveCostで軽減後コストを算出する）。バースト専用：発動中のバーストのカード自身をコストを支払わずに召喚する（スピリット/ネクサスのみ）。維持コアはリザーブから置き、不足なら不発。召喚できたらバーストエリアは空になる






 | { type: "setBurstFromHand" } // バースト専用：自分の手札にあるバースト効果（kind:"burst"）を持つカード1枚をセットする。setBurst（GameAction）と異なり**ターン1回制限を受けない**。候補2体以上ならinteractiveTargetsでkind:"card"の選択、自動選択はコスト最大の1枚（決定的簡略化）
 | { type: "destroyNexus"; count: number | "any"; chosenIds?: string[]; choosing?: true; drawPerDestroyed?: number; discardOpponentPerDestroyed?: number; all?: boolean; side?: "opponent" | "both" | "own"; levelFilter?: number[]; filter?: TargetFilter; costSacrificeChosen?: true; chooserIsTarget?: true; upTo?: true } // side:"own"指定時は自分側のネクサスだけが対象（pay { cost: destroyNexus{side:"own"} } の器）。upTo指定時のcountは上限（0〜countの好きな数。対話時は1つ選ぶたびに残りの数で聞き直し、選ばずに終えたら以降も破壊しない）

 // chooserIsTarget指定時（count:1・side省略時のみ対応）は破壊される側（相手）が対象を選ぶ（解決は発生源の持ち主の効果＝PendingChoice.actorPid）。colorFilter指定時はその色を持つネクサスのみ対象（多色はOR）。chooseColor指定時は使用者が先に色1色を指定し、その色をcolorFilterへ載せて解決し直す（自動選択は破壊できる数が最大になる色。同数はred/purple/green/white/yellow/blueの順）。discardOpponentPerDestroyed指定時は実際に破壊できたネクサス1つにつき相手の手札をその数だけ破棄させる
 | { type: "returnSelfToHand" } // このスピリットを持ち主の手札に戻す
 | { type: "returnSelfToDeckTop" } // このスピリットを持ち主のデッキの一番上に戻す（returnSelfToHandのデッキトップ版。069：破壊された「その個体」を名指しで戻す）
 | { type: "colorlessSelfThisBattle" }
 // 発揮した個体自身（self）を、このバトルの間だけ色とシンボルを無いものとして扱う（CardInstance.colorlessThisBattle。clearBattleでリセット）
 | { type: "coreRemove"; count: number; dest?: "void" | "trash"; anySide?: true; side?: "own"; spread?: true; chooserIsTarget?: true; spreadRemaining?: number; countCounter?: EffectCounter; leaveAtLeast?: number; filter?: TargetFilter; drawIfEmptied?: true; all?: true } // side:"own"指定時は自分側のスピリットが対象。spread指定時はcount個を複数のスピリットから1個ずつ選んで取り除く（2026-09-24ユーザー確認：「コアN個を置く」は合計N個を1個ずつ選ぶ。自動選択はコアの多い個体から）。chooserIsTarget指定時は対象側の持ち主が選ぶ（解決は発生源の持ち主の効果のまま）
 // drawIfEmptied指定時は**この効果で**対象のコアが0個になったとき自分が1枚ドローする。leaveAtLeast指定時は対象のコアがこの数を下回らないところまでしか取り除かない。対象スピリットのコアを持ち主のリザーブへ置く（dest:"void"はボイドへ＝消滅、dest:"trash"は持ち主のトラッシュへ）。anySide指定時は自分/相手どちらも対象にできる（自動選択は実効BP最大。同値は相手側優先）。countCounter指定時はEffectCounterの値を除去枚数として使う（0ならログのみ）。all指定時はcountを無視し対象上のコアすべてを取り除く
 | { type: "bpBuff"; filter?: TargetFilter; amount: number; amountCounter?: EffectCounter; amountFromSelfBp?: true; scope?: "battle"; anySide?: true; extraPerCoreToTrash?: number; boostTargetInstanceId?: string; thenAddSymbolThisBattle?: { color: Color; count: number }; costMillSelfCount?: number; thenRefreshIfMilledFamily?: FamilyFilter } // costMillSelfCount指定時は自分のデッキを上からこの枚数だけ無条件に破棄することがコスト（あるだけ処理してコストも払う。デッキが尽きていても0枚破棄で成立）。thenRefreshIfMilledFamily指定時は、その破棄で指定系統（配列＝OR）を持つスピリットカードが1枚以上トラッシュに置かれたときだけ続けて発生源自身を回復させる
 // 対象スピリット1体をBP+（既定はターン終了時まで。scope:"battle"指定時はそのバトルの終了まで）。filter.minSymbols指定時はシンボル数がこれ以上のスピリットのみ有効。filter.combined指定時は合体スピリットのみ有効。amountFromSelfBp指定時はamountの代わりに発生源自身の実効BPを加算量として使う（selfがnullならno-op）。anySide指定時は自分/相手どちらも対象にできる（interactiveTargets時は両陣営から選ばせ、自動選択は自分の場から）。extraPerCoreToTrash指定時はamount適用後、コアを自分のトラッシュに好きなだけ置くことで置いた1個につき追加でBP+を続けて解決する（コアはリザーブ優先で取る。自動選択は0個＝追加なし）。boostTargetInstanceIdは内部専用（どのスピリットをBP+したか、選択の再入をまたいで持ち回る）。thenAddSymbolThisBattle指定時はamount適用後の対象へこのバトルの間だけ指定色のシンボルをcount個追加する
 | { type: "exhaust"; filter?: TargetFilter; count: number; all?: true; anySide?: true; excludeTarget?: true; chooserIsTarget?: true; countFromBofu?: true; bofuSourcePid?: PlayerId; countCounter?: EffectCounter; noRefreshUntilOwnEndSteps?: number; side?: "own"; autoPickMaxBp?: true; target?: "self"; upTo?: true; nexus?: "only" | "also"; nexusOnly?: true; excludeIds?: string[] } // excludeIds は内部用（カードデータには書かない）。count 体を1体ずつ選ぶとき、選んだ個体を除いて残りを選び直す印。耐性で受けなかった個体は回復状態のままなので、疲労済みの除外では足りない。既定は相手のスピリット。bofuSourcePid は内部専用（【暴風】の持ち主。chooserIsTarget で再入すると owner が相手側に入れ替わるため持ち回る）。countFromBofu は bofuCountBonus を含む実効指定数。noRefreshUntilOwnEndSteps は anySide／countCounter の経路では付かない簡略化。side own の自動選択は実効BP最小、target self はネクサスでもよい。upTo指定時のcountは上限（0〜countの好きな数。対話時は1つ選ぶたびに残りの数で聞き直し、選ばずに終えたら以降も疲労させない） nexus:"only" は相手のネクサスだけが対象（スピリットは含めない）、"also" は相手のスピリット/ネクサスを合わせた候補から count 個（対話時は使用者が1つずつ選ぶ、非対話は実効BP最大のスピリット優先→残り枠を場の並び順のネクサスへ）
 | { type: "discardHandAll"; thenDrawOpponentHand?: true } // 自分の手札をすべてトラッシュへ。thenDrawOpponentHand指定時は、破棄を完全に解決した後（手札0枚で破棄が起きなかった場合は発揮しない）、自分は相手の手札枚数ぶんデッキから引く
 | { type: "returnToHand"; count: number; all?: true; maxBpFromSelf?: boolean; countPerOpponentNexus?: boolean; anySide?: true; side?: "own"; filter?: TargetFilter; costSacrificeChosen?: true; target?: "self" | "selfBrave"; costBudget?: EffectCounter; budgetLeft?: number } // target＝自分自身（self）／自分に合体中のブレイヴ（selfBrave）を手札に戻すコスト用。自分のコストなので耐性は見ない。costBudget＝好きなだけ・コストの合計がカウンタの値まで（count は使わない。budgetLeft は内部用）。side:"own"指定時は自分側のスピリットが対象。対象スピリットを持ち主の手札に戻す（破壊ではないためonDestroyは誘発しない）。maxBpFromSelf指定時はselfの実効BP以下の相手のみ。countPerOpponentNexus指定時は相手のネクサス数を対象数にする。anySide指定時は自分/相手どちらも対象にできる（自動選択は実効BP最大。同値は相手側優先）。filter指定時は対象自動選択・明示ターゲット両方に絞り込みを適用する
 // picked は選択の再開用（選び終わるまでゾーンから抜かない）。chooserIsTarget＝戻すカードの持ち主が選ぶ（「相手は手札1枚を選んで」）
 | { type: "toDeck"; from: "hand" | "trash"; side?: "opponent"; position: "top" | "bottom"; count: number; pick?: CardPick; chooserIsTarget?: true; picked?: number[]; upTo?: true; fromEvent?: true } // upTo：countは上限。0〜count枚の好きな数を選べる（2026-09-28ユーザー決定）。fromEvent：from:"trash"限定、GameState.lastDeckMillに記録された直近の破棄ぶんだけを候補にする（BS16-039）
 | { type: "toHand"; from: "trash"; count: number | "all"; pick?: CardPick; picked?: number[] } // 自分のトラッシュのカードを手札に加える。picked は選択の再開用
 | { type: "returnToDeckTop"; anySide?: true; side?: "own"; count?: number; chooserIsTarget?: true; filter?: TargetFilter; all?: true; orderedIds?: string[]; excludeIds?: string[] } // excludeIds は内部用（カードデータには書かない）。count 体を1体ずつ選ぶ連鎖で、選んだ個体を除く印（耐性で受けなかった個体は場に残るため）。side:"own"指定時は自分側のスピリットが対象。filter指定時は対象の絞り込みに使う。count指定時はその体数ぶん繰り返す（1体ずつ選ぶので最後に選んだものがデッキの一番上＝「好きな順番で戻す」を表現。中断時は残り体数を再開スタックへ積む）。chooserIsTarget指定時は戻される側（相手）が対象を選ぶ（解決は発生源の持ち主の効果として行う）。対象スピリットを持ち主のデッキの一番上に戻す。anySide指定時は自分/相手どちらも対象にできる。all指定時はfilterの候補すべてを対象にし、選んだ順に戻す（count/anySide/sideは無視。returnToDeckBottomのall版と同じ形。orderedIdsは内部専用＝選んだ順を再入で持ち回る）
 | { type: "returnToDeckBottom"; anySide?: true; side?: "own"; count?: number; chooserIsTarget?: true; filter?: TargetFilter; all?: true; orderedIds?: string[]; excludeIds?: string[] } // 対象スピリットを持ち主のデッキの一番下に戻す。軸の意味は returnToDeckTop と同じ（1体ずつ選ぶので「好きな順番で」を表す）。all指定時はfilterの候補すべてを対象にし、選んだ順に戻す（count/anySide/sideは無視。旧returnBofuExhaustedToDeckBottomの器。orderedIdsは内部専用＝選んだ順を再入で持ち回る）
 | { type: "setTargetBpAsThisBattle"; levels: number[]; amount: number } // targetInstanceId の1体に、このバトルの間「Lv◯BPを amount として扱う」（setOpponentBpAsThisBattle の、対象がイベントから渡る版）

 | { type: "placeCores"; from: "void" | "reserve" | "trash" | "self" | "field"; to: "reserve" | "trash" | "life" | "spirit" | "nexus" | "deckSide"; target?: "self" | "one" | "all"; targets?: number; filter?: TargetFilter; count: number | "all"; countCounter?: EffectCounter; upTo?: true; fillTo?: number; upToLevel?: number; orReserve?: true; excludeIds?: string[]; upToTargetId?: string } // コアを「置く」器（R5）。意味は HANDOFF.md §1 のスキーマ確定メモ。excludeIds は複数体を1体ずつ選ばせるときの再開用（カードデータには書かない）。fillTo＝この数になるまで不足分だけ置く。upTo＝count は上限で0〜count の好きな数（2026-09-28 ユーザー決定）。upToTargetIdは後者が個数選択で中断・再開するときの対象保持用（内部専用。カードデータには書かない）
 | { type: "removeCores"; side?: "opponent" | "own" | "any" | "both"; from?: ("spirit" | "nexus" | "reserve" | "trash" | "life")[]; to?: "reserve" | "trash" | "void"; target?: "one" | "spread" | "all" | "self" | "event"; targets?: number; filter?: TargetFilter; count: number | "all" | "toLowerLevel" | "any"; anyMax?: number; countCounter?: EffectCounter; targetsCounter?: EffectCounter; leaveAtLeast?: number; downTo?: number | "equalize"; chooser?: "owner"; spreadRemaining?: number; excludeIds?: string[]; sideIndex?: number } // コアを「取り除く」器（R5）。意味は docs/design/CORE_UNIFY_REMOVE.md §3。spreadRemaining/excludeIds/sideIndex/anyMax は内部用（カードデータには書かない）。count:"any"＝好きなだけ（数を選び、取り除いたコア数を lastCores に書く）
 | { type: "refreshAllOwn"; exemptFamily?: FamilyFilter; exemptKeyword?: Keyword; exemptCombined?: true } // exemptCombined指定時は合体スピリットには cantAttackThisTurn を付与しない。exemptKeyword指定時はそのキーワードを持つ個体には付与しない。自分の疲労スピリットをすべて回復。回復した個体はこのターン中アタック不可。exemptFamily指定時は指定系統（配列＝OR）を持つ個体には付与しない
 | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
 | { type: "swapBattler" } // バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える（テレポートチェンジ。バトル外・使用者がバトル非参加・疲労スピリット不在はno-op）
 | { type: "returnNexusToHand"; count: number; anySide?: true; voidCoreToOwnTrashIfOpponent?: number; all?: true; side?: "opponent" | "both"; dest?: "deckTop" } // 相手のネクサスを持ち主の手札に戻す（破壊ではない）。anySide指定時は自分/相手どちらのネクサスも対象にできる（自動選択は相手の先頭ネクサス）。voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが相手のものだったときのみボイドからその数のコアを自分のトラッシュへ置く。all指定時はcountを無視しside（省略時はopponent）が指すすべてのネクサスを戻す
 // dest:"deckTop"指定時は「手札に戻す」の代わりに持ち主のデッキの上に戻す（returnNexusToDeckTop）
 | { type: "refreshSelf" } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）
 | { type: "exhaustSelf" } // このスピリット自身を疲労させる（selfがnull/既に疲労状態ならno-op。exhaustSpirit経由なのでownSpiritExhausted等が正しく発火する）
 | { type: "lifeCrush"; count: number; countCounter?: EffectCounter; dest?: "trash" | "void"; neverZero?: true } // 相手のライフのコアcount個を相手のリザーブへ（dest:"trash"指定時は相手のトラッシュへ＝リザーブと違い再利用されないぶん相手のリソースが減る。dest:"void"指定時はボイドへ＝ゲームから完全に取り除く）（ライフ0以下で勝敗決定）。countCounter指定時はEffectCounterの値を個数として使う（0ならログのみ）。neverZero指定時は**この効果によっては**相手のライフを0にしない（下限1。このアクション自身だけの下限）
 | { type: "discardOpponentBurst" } // 相手のバースト（player.burst）1つを破棄する（セットしていなければno-op）
 | { type: "discardBurst"; side?: "own" | "opponent" } // discardOpponentBurstの汎用版（pay の cost 側専用。R5）。sideのバースト1つを破棄する（既定opponent。セットしていなければno-op）
 | { type: "discardOpponent"; count: number; downTo?: number; forcedTargetPid?: PlayerId; cardTypeFilter?: CardType; random?: boolean; chooserIsSource?: boolean; revealAllHandIfNone?: true; countAttackerSymbols?: true } // countAttackerSymbols指定時はcountを無視し、ctx.targetInstanceIdが指すスピリット（fieldEvent event:"ownLifeDamaged"が渡すアタッカー）のシンボル数（instanceSymbolCount）を破棄枚数として使う。対象が見つからなければ0
 // revealAllHandIfNone指定時は破棄できる対象が無かったとき（cardTypeFilter該当なし・手札0枚）、代わりに相手の手札すべてを一瞬公開する（その場で見せて終わり＝以後は見えない。ゲーム状態は変えずログにだけ出す簡略化）。random指定時は**誰も選ばない**（手札からランダムにcount枚）。効果文が「内容を見ないで破棄する」の形＝どちらも中身を見ないのでランダムが正しい（2026-08-17ユーザー確認。CHOOSER_RULES.md §1.6）。相手の手札からcount枚を破棄（末尾から。足りなければある分だけ）。forcedTargetPidは選択式再突入時のみ内部で設定する対象プレイヤー（選択者=破棄される側のためownerが逆算できなくなるのを避ける）。cardTypeFilter指定時はこのカード種別のみが対象（該当が無ければ不発）。chooserIsSource指定時は発生源の持ち主が選ぶ（効果文が「自分は相手の手札すべてを見て〜1枚を破棄する」の形）。自動選択はコスト最大の該当カード（決定的簡略化）。CHOOSER_RULES.md §1.6
 | { type: "randomOpponentHandMagicDiscard" } // 相手の手札から1枚を**内容を見ないで（＝ランダムに）選ぶ**。選んだカードを見て、マジックカードならトラッシュへ破棄し、それ以外のカードならそのまま手札に残す（誰も選ばないので決定的簡略化はしない。SEMANTICS_AUDIT.md §3.14）。相手の手札が0枚なら不発
 | { type: "refreshOne"; filter?: TargetFilter; all?: boolean; anySide?: true; count?: number; chosenByPlayer?: true; eventTargetOnly?: true; thenLevelUpThisTurn?: true; upTo?: true } // thenLevelUpThisTurn指定時は実際に回復させた対象へ続けてlevelUpThisTurnと同じ処理（このターンの間Lvを1つ上のものとして扱う）を適用する。eventTargetOnly指定時は誘発が渡すtargetInstanceId（イベント対象）だけを回復対象にする（選択・自動選択をしない）。chosenByPlayerは内部フラグ（選択の解決として再入したことを示す。これが無いtargetInstanceIdは誘発が渡すイベント対象であって回復対象ではない）。**どれを回復させるかはinteractiveTargetsならプレイヤーが選ぶ**（2026-08-23。候補1体なら聞かない）。count指定時はその体数まで回復する（実効BP最大から順に。cantAttackThisTurnは付与しない）。自分の疲労スピリット1体を回復（filterで絞り込み。familyはspiritHasFamily判定＝付与系統も考慮）。all指定時は該当候補すべてを回復しcantAttackThisTurnは付与しない。filter.excludeSelf指定時は候補からself自身を除外する。upTo指定時のcountは上限（0〜countの好きな数。対話時は1つ選ぶたびに残りの数で聞き直し、選ばずに終えたら以降も回復させない）
 | { type: "protectBlockerCoresThisBattle" } // このバトルの間、**このスピリットをブロックしているスピリット上のコアは効果で取り除けない**ようにする（GameState.battle.blockerCoresProtected を立てる。バトル終了で自然に消える）
 | { type: "endAttackStepAfterBattle"; excludeCombined?: true } // バトル中のみ：このバトルが終了したときアタックステップを終了するフラグを立てる（バトル外はno-op。サイレントウォール／）。excludeCombined指定時は、現在のバトルのアタッカー/ブロッカーのいずれかが合体スピリットなら不発にする
 | { type: "destroyBlockerAfterBattle" } // 現在のバトルのブロッカーを**バトル終了後**（＞７。【呪撃】と同じ位置）に破壊する予約を立てる（BattleState.endBattleDestroy）。
 // self は発生源自身（fieldEvent 側で selfMode:"source" を指定する）。コアが足りない／バトルがない／ブロッカーがいないときは不発（ログのみ）。
 // **支払いでレベルが下がっても予約は残る**（発揮はコストを払った時点で成立している。2026-08-16 ユーザー確認）。
 // 破壊そのものは通常の destroy 経路で解決するので、装甲・効果耐性は**バトル終了後のその時点**で判定される
 | { type: "recoverSpiritFromTrash"; costSacrificeChosen?: true; count: number; countCounter?: EffectCounter; familyFilter?: FamilyFilter; all?: true; costBudget?: number; thenDestroyIfFamily?: { family: FamilyFilter; maxBp: number }; keywordFilter?: Keyword; keywordFilterAny?: Keyword[]; colorFilter?: Color; nameIncludes?: string; costSkipDraw?: true; includeBraves?: true; anyCardType?: true; vanillaFilter?: true; bravesOnly?: true; costFilter?: { max?: number; min?: number }; costAtMostOrHasBurst?: number; bravesAnyOrSpiritColorFilter?: Color; excludeBurst?: true } // costFilter指定時はカードのコストがこの範囲のものだけ。costAtMostOrHasBurst指定時は「コストがこの値以下」または「kind:"burst"エントリを持つ」のOR判定。bravesAnyOrSpiritColorFilter指定時は「ブレイヴカード（色問わず）」または「この色を持つスピリットカード」のOR判定。excludeBurst指定時はkind:"burst"エントリを持つカードを除外する




 // costBudget指定時はcountを無視し、コスト合計がbudget以下になる範囲で好きなだけの貪欲選択（コスト最大から順に選ぶ決定的簡略化）で複数枚を手札に戻す。countCounter指定時はEffectCounterの値を戻す枚数として使う（0ならログのみ）。anyCardType指定時はスピリット/ブレイヴに限らずカード種別を問わず対象にする。vanillaFilter指定時は効果の記述を持たないカードのみ対象（isVanillaCardで判定）。bravesOnly指定時はスピリットカードでなくブレイヴカードだけが対象になる（includeBravesの「両方」とは別軸）。colorFilter指定時はこの色を持つスピリットカードのみ対象（カード静的なcolorsで判定）。includeBraves指定時は対象にブレイヴカードも含める。costSkipDraw指定時は「ドローしないことで」＝そのドローステップのドローを支払いに使う（実際に手札へ戻せたときだけGameState.drawStepSkippedを立てる）。nameIncludes指定時はカード名にこの文字列を含むカードのみ対象。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象。keywordFilterAny指定時はいずれかのキーワードを持てば対象（OR）。thenDestroyIfFamily指定時は、手札に戻したカードがその系統（配列＝OR）を持つときだけ続けてmaxBp以下の相手スピリット1体を破壊する。自分のトラッシュにあるスピリットカードをcount枚、手札に戻す（末尾＝新しい方から自動選択。本来は選択の簡略化。該当なしはno-op）。familyFilter指定時はその系統を持つカードのみ（配列＝OR）。all指定時はcountを無視しfamilyFilter該当カードすべてを手札に戻す
 | { type: "countAsMultipleThisTurn"; count: number; anySide?: true; sourceTypes?: CardType[] } // 対象スピリット1体に「このターンの間、使用者の効果ではcount体分として数える」印を付ける（CardInstance.countAsThisTurn）。anySide指定時は自分/相手どちらのスピリットも対象にできる。sourceTypes指定時は数える側の効果の発生源種別をこれに限る
 | { type: "noop" } // 何もしない。pendingChoice が「アクションの解決」以外の用途（マジック無効化の確認。PendingChoice.magicNegate）で立つときのプレースホルダ。カードデータには書かない
 | { type: "peekOpponentHand" } // 相手の手札1枚を**内容を見ないで選び**（ランダム。SEMANTICS_AUDIT.md §3.14）、その内容だけを見る（盤面は変わらない）。見たカードは PlayerState.peekedOpponentCardIds に積み、持ち主の PlayerView にだけ返す。相手の手札が0枚なら不発
 | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
 | { type: "discardBothHands"; count: number; countCounter?: EffectCounter; all?: true } // お互いが手札からcount枚を破棄する（自分→相手の順。**破棄するカードは各自が自分で選ぶ**＝1人ぶんを discardSelfChoose に委譲し、相手側は actorPid で相手の効果として解決する。自動選択は従来どおり手札の末尾から。手札が足りなければある分だけ）
 // all指定時はcountを無視し、各自の手札すべて（枚数は各自バラバラ）を破棄する（returnNexusToHandのallと同じ意味論。count自体は0を置く）
 // countCounter指定時はcountを無視し、EffectCounterの値を破棄枚数として使う（0ならログのみ）
 | { type: "treatAsUnblocked"; when?: "blockerLevel1" | "levelAtLeastBlocker" } // このバトルの解決で、when を満たせば BP を比べずブロックされなかったものとして扱う（when を省くと無条件）
 // 継続効果を期間つきで置く（ACTION_VOCABULARY §3）。対象は相手のスピリット、選ぶのは発生源の持ち主。
 // 内容をすべて既に持つ個体は候補にしない。all:true は個体を選ばず「条件に合うものすべて」をルールとして置く
 // （解決後に場に出たスピリットにも効く。いまは期間 turn だけ）。side と内容 bp は all のときだけ
 // target:"self" は「このスピリット自身をBP+」（旧 selfBuff 相当）：対象は常に発生源自身で、filter/side/count/targetInstanceIdは見ない
 | { type: "timedEffect"; content: TimedContent[]; duration: "turn" | "battle" | "nextRefresh"; count?: number | "any"; choosing?: true; chosenIds?: string[]; countCounter?: EffectCounter; filter?: TargetFilter; all?: true; side?: "own" | "both"; target?: "self" }
 | { type: "markUnblockableByIceWallColorThisTurn" } // 【氷壁】を持つ自分のスピリット1体を指定し、このターンの間、そのスピリットが持つ【氷壁】の色（iceWallColorsOfで判定）と同じ色の相手のスピリットからブロックされないようにする（期間つき効果の一覧に指定時点の色で記録する。このターン中に【氷壁】が無効化されても保持＝Q25026〜Q25028）。複数なら選ぶ
 | { type: "discardSelfChoose"; count: number | "any"; downTo?: number; cardType?: CardType | CardType[]; family?: FamilyFilter; keyword?: Keyword | Keyword[]; cardName?: string; colorFilter?: Color; discarded?: string[]; awaitingSkip?: true; anyMax?: number } // 自分の手札からcount枚を破棄する。interactiveTargets時は1枚ずつ選ばせ、非interactive時は末尾から機械的に破棄。cardType/keyword指定時はそのカードだけを対象にする（両方指定時はAND、配列指定時は配列内OR。costDiscardHandKeywordThenDrawと同じ意味）。cardName指定時はそのカード名だけが対象。colorFilter指定時はその色を持つカードのみ対象（多色はOR）。count:"any"＝好きなだけ（破棄し終えたら lastMoved に書く。discarded／awaitingSkip は再開用）
 | { type: "pay"; cost: EffectAction; then: EffectAction; confirmed?: true; onceRevert?: { instanceId: string; effectId: string }; eventTargetId?: string; limitByKeyword?: "kyoshu" } // 「〜することで〜する」の汎用の器（COST_MODEL.md §1）。cost・thenとも書いてある数どおりに解決できるときだけ発揮する（片方でも欠けたら何もしない）。対応type一覧・判定はactions/pay.tsのPAYABLE_TYPES
 // 手札がdiscardCount枚未満なら不発（部分的な破棄はしない。ログのみ）。破棄するカードはCOST_MODEL.md §2どおりinteractiveTargets時は1枚ずつ持ち主が選び、自動選択は手札末尾から機械的に選ぶ（discardSelfChooseと同じ選び方）。
 // discardCountは選択の再入をまたいで「残り破棄枚数」を持ち回る内部利用も兼ねる（1枚選ぶたびに-1して再入し、0になった時点でdrawCount枚ドローする）土星神龍クロノ・ボロス
 | { type: "coreDrainAllOthers"; rewardDraw?: true } // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ（両陣営）。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）。
 // rewardDraw指定時は、コアをselfへ置く代わりに消滅した数ぶん自分がドローする
 | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する（フェザーバリア）
 | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する（バーストファイア）
 | { type: "endStepLock"; turns: number; locks: ("attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve" | "summonTrigger")[] } // 発揮した側のエンドステップを turns 回数えるまで、両陣営に locks の制限をかける（GameState.endStepLocks）。summonTrigger＝お互いの『このスピリットの召喚時』効果が発揮されない（noSummonTriggerByCostが読む）
 | { type: "atTurnEnd"; action: EffectAction } // このターン終了時に action を解決する（記録はGameState.turnEndActions）。発生源が場を離れていても解決する（公式Q&A Q22394〜Q22396）
 | { type: "burstMagicFreeOrThenPay"; cardId: string; payTiming?: "main" | "flash"; payCost?: number } // burstMagicFreeEffect（BS16-070）の選択肢の解決専用。keywords/burst.tsのtryBurstMagicFreeOrThenPayが積み、actions/control.tsのハンドラがchosenOptionの文言で分岐する
 | { type: "negateContinuousMagicByName"; nameIncludes: string } // 相手側（endStepLock.pid===opp）が発揮中のendStepLockのうち、発生源カード名（EndStepLock.cardId）にこの文字列を含むものだけを解除する。トラッシュ・手札のカードには何もしない
 | { type: "lifeCoresBySymbolDiff" } // onBlocked（self=アタッカー、targetInstanceId=ブロッカー）で解決する。instanceSymbolCount(アタッカー)-instanceSymbolCount(ブロッカー)が正のとき、その数ぶん相手のライフのコアを相手のリザーブへ置く（0以下は何もしない。内部でlifeCrushへ委譲）金牛龍神ドラゴニック・タウラスLv2/3
 | { type: "battleLoserCoresToVoid" } // 直前のバトルで破壊された相手のスピリット上のコアすべてを、リザーブでなく**ボイド**へ送る。破壊待機中（コアが乗ったまま）に呼ぶ前提
 | { type: "extraAttackStep" } // アタックステップとエンドステップを順番にもう1回ずつ行う（GameState.extraAttackStepPending を立てる）。既に立っていれば何もしない
 | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない。妖機妃ソール）
 | { type: "destroyOwnByCost"; maxCost: number; gainCoresEqualCost?: boolean; thenDestroyEnemyByCostBudget?: true } // 自分のフィールドからself以外でコスト<=maxCostのうちコスト最大の1体を破壊する（決定的選択）。gainCoresEqualCost指定時は破壊したスピリットのコストと同数のコアをボイドから自分のリザーブへ。thenDestroyEnemyByCostBudget指定時は、破壊した自分のスピリットのコストを予算としてdestroyByCostBudgetと同じ貪欲選択で相手のスピリットを破壊する
 // interactiveTargets では**両プレイヤーが順に**色を選ぶ。選択の進捗は chosenOwn / chosenOpp / awaiting に持たせて再入する
 // （相手に選ばせる段は PendingChoice.actorPid で「選択者＝相手・実行者＝発生源の持ち主」にする）。
 // 自動選択は従来どおり、お互い自分フィールドで最多の色を自動指定する
 | { type: "resolveOwnDestroyTriggers"; instanceId: string; byOpponent?: true } // **内部専用**。破壊されたカード自身の『破壊時』効果を発揮する。破壊で誘発した効果を1列に並べて順番を選ばせるとき、「自身の破壊時ぜんぶ」を1グループとして列に入れるために使う（docs/design/TIMING_CHART.md）
 | { type: "applyReviveOnDestroy"; instanceId: string; effectId: string } 
 | { type: "resolveFushiSummon"; pid: PlayerId; cardId: string } // **内部専用**。破壊で誘発した効果の列に並ぶ【不死】1枚分。解決時にトラッシュからカードIDで引き直すので、先に別の【不死】が召喚されて位置がずれていても正しく動く // **内部専用**。指定した reviveOnDestroy エントリを適用する（「フィールドに残る／戻る」）。上と同じ列に1グループとして入る
 | { type: "destroySelf" } // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
 | { type: "mutualDestroyChoice"; chosenOwn?: string; chosenOpp?: string; awaiting?: "own" | "opponent"; keywordExclude?: Keyword } // keywordExclude指定時はそのキーワードを持たないスピリットだけが候補（一時付与・継続付与も見る）。「お互い、フィールドのスピリット1体を選び、破壊する」。destroyAllExceptChosenColorsと同じ二段階choiceパターン：発生源の持ち主（own）→相手（opponent）の順に、フィールド（両陣営どちらでも可）から1体を指定させ、選ばれた2体（重複可）をそれぞれ破壊する。進捗はchosenOwn/chosenOpp/awaitingに持たせて再入する。自動選択は各プレイヤーが相手フィールドの実効BP最大（決定的簡略化）
 | { type: "mutualKeepChoice"; chosenOwn?: string; chosenOpp?: string; awaiting?: "own" | "opponent" } // mutualDestroyChoiceの否定版：二段階choiceパターンは同じだが、各自は**自分の**フィールドから1体を指定する（mutualDestroyChoiceは相手フィールドも選べるのに対しこちらは自陣のみ）。破壊待機中の発生源自身（self）は指定候補に含めない。指定された2体を除く両陣営のスピリットすべてを破壊する。自動選択は各自が自分のフィールドの実効BP最大（決定的簡略化）
 | { type: "summonSequence"; byFushi?: true } // byFushi指定時は【不死】による召喚として「自分のスピリットが召喚されたとき」を発火する（fieldEvent.fushiSummonOnlyの判定に使う）。召喚が済んだ後の処理（召喚時効果→「召喚されたとき」誘発→天使長ファニムの疲労付与）をselfに対して行う。**内部専用**：【転召】の対象選択で中断したときに、GameEngineがpendingChoice.queueへ積んで選択の解決後に合流させるためだけに使う
 | { type: "recoverMagicFromTrash"; colors?: Color[]; anyCardType?: true; hasBurst?: true; onlyBurstDestroyedCard?: true } // onlyBurstDestroyedCard指定時は、**そのバースト発動のきっかけになった破壊で落ちたカード**だけが対象（burst.destroyedAsTargetがtargetInstanceIdの枠に入れたcardIdと一致するもの）。colors指定時は、そのいずれかの色を持つマジックカードだけを対象にする（カード静的なcolorsで判定）。anyCardType指定時はマジック限定を外し、カード種別を問わず対象にする。hasBurst指定時はkind:"burst"エントリを持つカードだけが対象。自分のトラッシュにあるマジックカード1枚（末尾＝新しい方）を手札に戻す
 | { type: "castMagicFromTrashByColor"; colorFilter?: Color } // 自分のトラッシュにある指定色（省略時は色不問）のマジックカード1枚を、手札にあるときと同様にコストを支払って使用する（自動時はコストが払える中で最もコストが高いものを自動選択。該当・支払い可能なカードがなければ不発）。この効果ではフィールドのコアは使えずリザーブのみで支払う簡略化。発動タイミングはこの効果自体の発火位置で決まる（バトル中ならflash、それ以外はメイン優先）
 | { type: "magicMirrorRepeat" } // このフラッシュタイミングで相手が直前に使用したマジックカードの効果を、自分が使用したものとして解決し直す（対象・コストは無償の再現。GameState.lastMagicCastを参照し、相手の使用でなければ不発。[マジックミラー]自身は対象にできない＝連鎖ミラー防止）
 | { type: "magicFreeUseFromHandOrTegamoto"; colorFilter?: Color; handOnly?: true } // 自分の手札/手元(tegamoto。要tegamotoPlayable)にあるマジックカード1枚を選び、コストを支払わずに使用する（任意。候補0なら不発）。自動選択は手札→手元の順でコスト最大（決定的簡略化）。resolveMagicへpaidCost=falseを渡すため、この使用からownMagicUsedのpaidCostOnlyは連鎖しない。カード側でoptional:trueと併用する。colorFilter指定時はこの色を持つマジックカードのみ候補にする。handOnly指定時は手元(tegamoto)を候補から外し、手札のみにする
 | { type: "deployNexusFromTrashByFieldCores"; colors: Color[] } // 自分のトラッシュにある指定色いずれかのネクサスカード1枚を、**自分のフィールドのコアだけ**を使ってコストを支払い配置する（リザーブは使わない。2026-08-14 ユーザー確認）。フィールドのコアが足りなければ不発。取るのはネクサス上→コアの多いスピリットの順（維持コアを割る個体からは取らない決定的簡略化）
 | { type: "deployNexus"; from: "hand" | "trash"; colors?: Color[]; all?: boolean; nameContains?: string; optional?: boolean } // nameContains指定時はカード名にこの文字列を含むネクサスカードのみ対象（colorsと併用可＝両方指定時はAND）。colors省略時は色を問わない。手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに自分のフィールドに配置する（該当なしはno-op）。all指定時は該当するネクサスカードをすべて配置する。optional: 印刷テキストが「配置できる」の札に付ける。候補が1枚でも「配置しない」を選べる
 | { type: "levelOverrideOpponentNexuses"; level: number } // 相手の全ネクサスの timedLevel を level に設定（このターンの間）
 | { type: "treatOwnNexusesAsSpiritsThisTurn"; minCores?: number; cost: number; family: string[]; levels: LevelDef[] } // 自分のネクサス（minCores個以上のコアが置かれているもの。省略時1）を、このターンの間スピリットとして扱う。field.nexusesからfield.spiritsへ**同じインスタンスのまま**移し、CardInstance.asSpiritThisTurnにcost/family/levelsの上書きを載せる。ターン終了時にPhaseManager.endTurnが生き残りをfield.nexusesへ戻す（破壊された個体は既に場を離れているので戻らず、ネクサスカードがトラッシュに残る）
 | { type: "destroyBrave"; allHosts?: true } // 相手の合体スピリットの**ブレイヴだけ**を破壊する（ホストは無傷で場に残る。BRAVE.md §6.5）。allHosts指定時は相手の合体スピリット**すべて**から1つずつ破壊する。省略時は1体ぶんで、複数なら選ぶ）
 | { type: "combineOwnBrave"; chosenBraveInstanceId?: string; hostSelf?: true; thenFireWhileCombinedTrigger?: TriggerEvent } // 自分の**スピリット状態のブレイヴ**1体を、自分のスピリット1体に合体させる。メインステップの任意合体（GameAction "combineBrave"）とは別に、効果から合体させる入口。合体先の候補はshared/summon.tsのbraveCombineCandidates（合体条件を満たす・まだブレイヴが付いていないスピリット）。自動選択は先頭。chosenBraveInstanceIdは内部専用（ブレイヴを選んだ後、合体先の選択で中断から再開するために持ち回る）。hostSelf指定時は合体先を**発生源自身に固定**する（host選択をスキップし、発生源に合体できるスピリット状態のブレイヴだけをtargetInstanceIdで選ばせる）。thenFireWhileCombinedTrigger指定時は、**合体が実際に成立したときだけ**、新たに合体したブレイヴが持つ「trigger一致・whileCombined:true」の誘発効果を発揮させる（合体しなかった／できなかったときは発揮しない。2026-09-07ユーザー確認。BRAVE.md §12.3〜12.4。ホスト自身の同条件エントリはfireTriggerの通常ループが順序どおり拾うので、ここで拾うのはブレイヴが持ち込む分だけ）
 | { type: "refreshSelfBraveThenCombine" } // 【神速】を持つ自分のスピリットが召喚されたとき、バトルしていないスピリット状態のこのブレイヴ（self）を回復させ、その召喚されたスピリット（targetInstanceId＝fieldEventのイベント対象）に合体できる。**回復と合体はセット**＝selfが既に合体済み・バトル中・合体条件を満たさないなら回復もしない
 | { type: "borrowCombinedAttackEffect" } // 自分のスピリット状態のブレイヴ／自分の合体スピリットのブレイヴ（発生源自身を含む）が持つ『このスピリットの合体アタック時』（kind:"triggered" trigger:"onAttack" whileCombined:true）効果を1つ選び、発生源自身（self＝合体スピリット。BRAVE.md §12「このスピリット」＝発揮する側）の効果として発揮する。レベル判定もself基準。候補が複数なら選ばせる（同じ個体に複数エントリがある場合は先頭を採用する簡略化。自動選択は先頭）
 | { type: "requireCoreToBlockThisBattle"; count: number } // このバトルの間、相手はリザーブのコアを count 個トラッシュに置かなければブロックできない（払えないならブロックできない）
 | { type: "removeOneOfAnyType"; mode: "destroy" | "toHand" | "toDeckBottom"; types?: ("spirit" | "brave" | "nexus")[]; maxBpFromSelf?: true; count?: number; countCounter?: EffectCounter } // mode:"toDeckBottom"＝デッキの一番下に戻す（destroy/toHandの兄弟。returnSpiritToDeckBottom/returnNexusToDeckBottom/returnCombinedBraveToDeckBottomへ振り分ける）。count/countCounter指定時は「◯につき」の複数回（countCounter優先。0ならログのみ。候補が尽きたぶんは不発＝「あるだけ処理」と同じ数え方）。候補が複数ならinteractiveTargetsで1体ずつ選ばせ、残り回数はresumeフレームへ積む。自動選択（スピリット→合体中のブレイヴ→ネクサスの順に先頭）をresolvedCount回繰り返す。相手の**スピリット/ブレイヴ/ネクサスのどれか1つ**を破壊する（mode:"destroy"）／手札に戻す（mode:"toHand"）。「ブレイヴ」は**合体中もスピリット状態も含む**（2026-09-02ユーザー確認）。合体中のブレイヴを選んだときはホストを残してそれだけが場を離れる（destroyCombinedBrave / returnCombinedBraveToHand）。types指定時は候補をこの種別（配列＝OR）だけに絞る（省略時は3種すべて）。maxBpFromSelf指定時はself（発生源）の実効BP以下の候補のみ（ネクサスは対象外になる）
 | { type: "detachOpponentBrave"; allHosts?: true; minSymbols?: number; battlingOnly?: true } // 相手の合体スピリットを**分離させる**。⚠️ 効果による自分の分離（"detachBrave"。コア不要）とは**別の手順**で、「分離するときのコアの移動は相手が行う」＝ブレイヴの持ち主に「残すか・どのコアを置くか」を聞く（場を離れるときと同じpendingBraveKeepsに乗る。BRAVE.md §12.5.1）。allHosts指定時は条件を満たす相手の合体スピリットすべてを分離させる。minSymbols指定時はシンボル数がこれ以上のホストのみ対象。省略時は1体ぶんで、候補が複数なら効果の使用者が選ぶ（自動選択は先頭）。battlingOnly指定時は現在成立しているバトルに参加している相手側の合体スピリットだけを候補にする
 | { type: "detachBrave"; combineToChosenSpirit?: true; thenRefreshHost?: true; detachedBraveInstanceId?: string } // 効果によるブレイヴの分離（BRAVE.md §12.5：コアは要らない。「場を離れるときに残す」＝detachBravesOnLeaveとは別の手順）。分離元ホストはctx.targetInstanceIdが指定されていればそれ、無ければ「自分の合体スピリット1体」から選ぶ（候補が複数なら選ばせ、自動選択は先頭）。分離したブレイヴはホストの疲労状態を引き継ぐ。combineToChosenSpirit指定時は分離後「自分のスピリット1体に合体できる」（任意。候補はbraveCombineCandidatesで判定、自動選択は合体させず終える＝bravesOnly自動フォールバックと同じ簡略化）。thenRefreshHost指定時は分離した直後にホストを回復させる（分離元ホスト1体だけ。分離して出てきたブレイヴは回復しない）。detachedBraveInstanceIdは内部専用（combineToChosenSpiritの合体先選択が中断から再開するときの分離済みブレイヴのinstanceId保持）
 | { type: "summonFromHandFree"; costSacrificeChosen?: true; colorFilter?: Color | Color[]; sameFamilyAsSelf?: boolean; familyFilter?: FamilyFilter; costFilter?: number | { max?: number; min?: number }; nameIncludes?: string; maxCostFromOwnTrashCores?: true; count?: number; keywordFilter?: Keyword; skipTensho?: true; payCost?: true; skipOnSummon?: true; cancelable?: true; bravesOnly?: true; combineToSelf?: true; costDestroyOwnSpiritSameCost?: true; combineHandIndex?: number; repeatWhileChosen?: true; thenDraw?: number; spiritStateOnly?: true; combineNameIncludes?: string; thenRefreshCombinedHost?: true; upTo?: true; alsoFrom?: "trash"; nameExcludes?: string; pendingZone?: "hand" | "trash"; countCounter?: EffectCounter; chooseEach?: true } // countCounter指定時はcount×カウンタの枚数を1体ずつ召喚する（対話中は持ち主が1枚ずつ必ず選ぶ。非対話はコスト最大から）。chooseEachは内部専用（countCounterを解いた後の持ち回り）。alsoFrom:"trash"指定時は手札とトラッシュの合計でcount枚まで（upToと組み合わせる。X05）。pendingZoneは内部専用（1枚選ぶ直前のゾーンの持ち回り）。nameExcludes指定時はカード名にこの文字列を含むものを除く。spiritStateOnly指定時（bravesOnlyと併用）は合体先を選ばせず、必ず**スピリット状態のまま**召喚する（combineToSelfの逆）。repeatWhileChosen指定時は「好きなだけ」召喚する（BRAVE.md §12.6：1枚ずつ合体先を選ばせて繰り返す。自動選択はコスト最大から貪欲に候補が尽きるまですべて召喚しスピリット状態のまま出す簡略化）。thenDraw指定時は実際に召喚できたときだけ指定枚数ドローする（不発時は引かない）。combineToSelf指定時（bravesOnlyと併用）は合体先を選ばせず、**発生源自身に直接合体するように**召喚する（合体条件を満たさないときはスピリット状態で出す）。bravesOnly指定時は召喚候補がブレイヴカードだけになる。この召喚は常に合体先（ダイレクトブレイヴ／スピリット状態）を選ばせる（スキップ＝単体召喚。候補はbraveCombineCandidatesをそのまま使う）。costDestroyOwnSpiritSameCost指定時は自分のスピリット1体を破壊することがコストで、**破壊したスピリットと同じコストのブレイヴカードだけ**が召喚候補になる（組み合わせが成立しなければ発動しない＝破壊も起きない。破壊するスピリットは複数なら選ぶ）。解決後は破壊したコストをcostFilterに積んで再入する。combineHandIndexは内部専用（bravesOnly召喚が合体先選択の中断から再開するときの手札インデックス保持）。combineNameIncludes指定時は合体先の候補をカード名の部分一致でさらに絞る（候補が無ければ発動しない。自動選択は先頭）。thenRefreshCombinedHost指定時は実際に合体できたときだけ合体先のスピリットを回復させる。cancelable指定時は、候補が1枚でも必ず選択を出し、やめられる（「起動能力から使う効果を、対象を見てからやめられるようにする」ため。やめた場合は起動能力の「ターンに1回」も消費しない＝doActivateAbilityがPendingChoice.revertActivatedで巻き戻す）。payCost指定時は**通常の召喚コストを支払う**（effectiveCostで軽減後コストを算出し、維持コア＋コストをリザーブから支払う。払えなければ不発）。アクション名のFreeは既定の挙動を指すもので、payCostはその例外。skipOnSummon指定時は召喚時効果と「召喚されたとき」の誘発を発揮させない（効果文に明記があるカードだけ。既定では発揮する＝2026-08-17修正）。maxCostFromOwnTrashCores指定時は「自分のトラッシュにあるコアの数以下のコスト」が上限になる。配列指定時はいずれかの色を持てばよいOR判定。自分の手札にあるスピリットカードのうち条件（colorFilter一致／sameFamilyAsSelf=selfと系統1つ以上共通／familyFilter=指定系統一致。配列＝OR）を満たすコスト最大の1枚（同コストは手札の先頭側）を、コストを支払わずに召喚する（決定的簡略化）。維持コアはリザーブから置き、不足なら不発。この効果で召喚されたスピリットのonSummon効果は発揮されない。costFilter指定時はコストが完全一致するもののみ。nameIncludes指定時はカード名にこの文字列を含むもののみ。count指定時は「count枚まで」の複数体召喚（コスト最大から貪欲に選び、維持コアがリザーブから払えなくなった時点で打ち切り。この場合は自動選択のみ）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象。skipTensho指定時は召喚後の【転召】解決そのものをスキップする（既定は「コストを支払わない召喚でも転召は必ず行う」だが、この効果は転召を発揮したものとして扱う旨の記載があるため例外）
 | { type: "destructionCoresToOwnSpirit" } // 破壊時：selfが破壊直前に置いていたコア数（coresAtDestruction）ぶんを、持ち主のリザーブから自分の実効BP最大のスピリットへ移す（destroySpiritがリザーブへ移した分の付け替え。対象がいなければリザーブに残る。対象選択の決定的簡略化。盾精ラングリーズ）
 // targetInstanceIdが見つからなければ不発（ログのみ）アントイーター/闇騎士マリス
 | { type: "reviveLastDestroyedNexus"; coreCost?: number; costFrom?: "ownFieldOrReserve" } // costFrom:"ownFieldOrReserve"指定時は、コストをself上ではなく**自分のフィールド/リザーブ**のコアから払う（リザーブ優先）。self上のコアをコストぶん自分のトラッシュに置くことで、直近に破壊された自分のネクサス（GameState.lastDestroyedNexus）をトラッシュから自分のフィールドへ戻す（coreCost省略時はself上のコアすべて。指定時はその数だけ支払う。コア不足なら不発）
 | { type: "negateLifeDamageFromTarget" } // 対象（targetInstanceId＝相手スピリット1体）のアタックでは、このターン自分のライフが減らない（CardInstance.lifeDamageNegatedFor）。対話中は対象を持ち主が選び、非対話はBP最大の相手を自動で選ぶ
 | { type: "returnToHandEachHeavyArmorColor"; remainingColors?: Color[] } // selfが**その時点で実際に持つ【重装甲】の色**（静的keyword＋heavyArmorColorsGranted。hasHeavyArmorAgainstと同じ元データ）ごとに、
 // その色を持つ相手のスピリット1体ずつを手札に戻す（色が無ければ何もしない。多色1体で複数の色枠を埋めない＝色ごとに独立した対象選択）。
 // remainingColorsは選択待ちで中断したときの**残り色の再開用内部専用**。destroyOnePerCost.costsの再開と同型）
 // 1個ぶんの実処理は coreRemove count:1 に委譲する（装甲・効果耐性・維持コア割れの消滅・leaveAtLeast の判定を1箇所に保つため）。
 // dest:"void" 指定時はリザーブでなくボイドへ。leaveAtLeast 指定時は、どの1体もその数を下回るところまでは取れない
 // （ 冥剣士ベリト「この効果で相手のスピリット上のコアを0個にはできない」＝leaveAtLeast:1。
 // この制限は**その『』ブロックの中だけ**に効く。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）。
 // chooserIsTarget 指定時は、**コアを取られる側（相手）が対象を選ぶ**（「**相手は**、相手のスピリット上のコア3個を〜置く」。
 // 解決は発生源の持ち主の効果として行う＝PendingChoice.actorPid。exhaust.chooserIsTarget と同型。docs/design/CHOOSER_RULES.md）

 // コストごとに独立して選ぶ（同じ個体は二度選べない＝コストが一致する個体は1体につき1回）。
 // 対象がいないコストは飛ばす。interactiveTargets 時はコストごとに選択を出し、非対話では実効BP最大を自動選択
 // 。系統は付与も考慮する（spiritHasFamily）。
 // **発生源自身も数える**（効果文が「このスピリット以外の」と書いていない）。
 // interactiveTargets 時は kind:"option" で系統を選ばせ、非対話では**引ける枚数が多い方**を選ぶ決定的簡略化
 | { type: "sequence"; actions: EffectAction[] } // 効果文の「Aする。その後、Bする。」（CONJUNCTION.md）。actionsを常に順番どおり全部解決する（chooseActionModeの「選ばせない」全実行版）。Aが不完全にしか解決できなくてもBは解決する（例：疲労させる対象がいなくてもその後の回復は行う）。選択で中断したら残りはresolveInOrderが再開スタックへ積む
 | { type: "simultaneous"; actions: EffectAction[]; choosing?: true; chosenIds?: string[] } // 「Aして、B」＝同時（CONJUNCTION.md）。対象をすべて集めて1回で破壊待機に入れる。書けるのは destroy{all}・destroySelf・destroy{side:"own", count:数}。choosing／chosenIds は選択の途中経過（カードには書かない）
 | { type: "chooseActionMode"; modes: { label: string; actions: EffectAction[] }[] } // 効果文の「〜する。**または**、〜する」。使用者が modes からどれか1つを選び、その actions を順に解決する
 // 。
 // 選択肢は**常に全部出す**：破壊は「〜することで」ではないので、対象が足りなくても発揮でき、いる分だけ破壊する
 // （2026-08-16 ユーザー確認。docs/design/COST_MODEL.md の「コストではない」側）。
 // interactiveTargets が無い（テスト・自動解決）ときは modes の先頭を選ぶ決定的簡略化
 | { type: "battleOpponentDestroyedCoresTo"; to: "void" | "trash" } // このバトルの間、破壊された相手のスピリットのコアすべてをリザーブではなく to に置く（void＝ゲームから取り除く）
 | { type: "revealDiscardRest" } // 公開ゾーン（GameState.revealedCards）に残っているカードをすべて持ち主のトラッシュへ置く。revealAndSummonKeyword が選択待ちの queue に積み、**選んでもスキップしても**必ず後始末が走るようにする）
 | { type: "revealReturnToDeck"; toTop?: true; placed?: number } // 公開ゾーン（GameState.revealedCards）の残りをデッキの下へ戻す。**戻す順番は1枚ずつ選ばせる**（スキップで残りを現在の順のまま戻す）。toTop指定時はデッキの**上**へ戻す（先に選んだカードが上＝次に引くカード）
 // pickCountが数値（2以上）のとき「N枚まで」＝1枚ずつ選び、途中でやめられる（BS16-044）。非対話時は
 // matchesPickに合うものを前からN枚まで自動で選ぶ
 | { type: "reveal"; from?: "ownDeck" | "opponentDeck" | "hand" | "burst"; count?: number; countPer?: { ownColorTotal: Color } | { ownNexuses: true } | { ownSymbols: Color }; countFromSelfLevel?: true; pick?: CardPick; pickCount?: 1 | "all" | 0 | number; optional?: true; dest?: "hand" | "summon" | "cast" | "placeNexus" | "tegamoto" | "deckBottom" | "activateBurst"; orHand?: true; tensho?: "asIfDone" | "none"; noSummonEffects?: true; rest?: "trash" | "deckTop" | "deckBottom" | "hand"; returnToDeckBottomAtEndStep?: true } // オープン統合の器（docs/design/REVEAL_UNIFY.md §4）。from省略時はownDeck、pickCount省略時は1、dest省略時はhand、rest省略時はdeckBottom。選ぶのは常に効果の使用者
 | { type: "revealApplyOne"; cardId: string; srcPid: PlayerId; dest?: "hand" | "summon" | "cast" | "placeNexus" | "tegamoto" | "deckBottom" | "activateBurst"; tensho?: "asIfDone" | "none"; noSummonEffects?: true; orHand?: true; returnToDeckBottomAtEndStep?: true } // 内部専用：revealで選ばれた1枚（すでに元のゾーンから取り除き済み）を dest へ送る。中断（【転召】の対象選択）から再開する経路もここを通る
 | { type: "revealRest"; destPid: PlayerId; rest?: "trash" | "deckTop" | "deckBottom" | "hand"; pool?: string[]; placed?: number } // 内部専用：revealで選ばれなかった残り（GameState.revealedCards、またはpool）をrest先へ送る。デッキへ戻すときは1枚ずつ順番を選ばせる（destPidが持ち主。相手のデッキでも選ぶのはctx.owner）
 | { type: "revealFinishSummon"; noSummonEffects?: true } // 内部専用：revealApplyOneのdest:summon（tensho既定）で【転召】の対象選択から中断したときの続き。selfが召喚済みのインスタンス
 | { type: "grantFamilyChoiceAll"; targetFamily: string } // targetFamily持ちが自分のフィールドにも手札にも1枚もなければ不発。あれば全系統からのoption choiceを経て、選ばれた系統をCardInstance.lentChoiceFamilyに載せた仮想発生源を積む（＝lendSelfThisTurnと同じ貸与。以後はkind:"familyGrant"のfamilyFromChoiceエントリが継続付与する）
 | { type: "linkNexusCoresChoice" } // 自分のネクサス1つを指定するtarget choice（optional=スキップ可）。指定されたネクサスのcoresLinkedToにselfのinstanceIdを設定する（selfがnullなら不発。クロスシザース）
 // what の値を1つ指定し、then の中の declared を実際の値に置き換えて解決する（DECLARE_UNIFY）。from＝選ぶ人の場の spirits／nexuses から候補を取る。picked は再開用
 | { type: "fireEffect"; trigger: "onSummon" | "onDestroy"; all?: true; filter?: TargetFilter; oneEffect?: true; chosenId?: string; instanceIds?: string[] } // chosenId・instanceIds は再開用
 | { type: "declare"; what: "color" | "family" | "cost"; options?: (string | number)[]; from?: "spirits" | "nexuses"; chooser?: "opponent" | "each"; autoFrom?: { ownTrash: CardPick }; then: EffectAction; picked?: Partial<Record<PlayerId, string | number>> }
 | { type: "if"; cond: IfCond; then: EffectAction; else?: EffectAction } // 「〜とき／〜なら」（docs/design/IF_UNIFY.md §5）
 | { type: "mill"; count: number; side?: "own"; countCounter?: EffectCounter; countMax?: number; until?: CardPick } // 相手（side:"own"指定時は自分）のデッキを上からcount枚トラッシュへ送る（【粉砕】。不足時は可能な分だけ）
 | { type: "takeLast"; pick: CardPick; to: "hand" | "summon"; skipOnSummon?: true } // 直前に動いたカード（record.ts）のうち pick に合う最後の1枚を、まだトラッシュにあれば to へ（「その後、トラッシュにあるそのカード」）
 | { type: "grantKeywordToHandCard"; keyword: Keyword; familyFilter?: FamilyFilter; cardType?: "spirit" | "nexus" | "magic"; all?: true } // 手札の条件一致（cardType/familyFilter。配列＝いずれかの系統でOR）カード1枚に、このターンの間キーワードを付与する（PlayerState.tempHandKeywordGrants。自動選択は手札末尾の該当カード。該当なしはno-op。付与はcardId単位＝同名重複カードにも効く簡略化）。all指定時は選択を挟まず、条件一致する手札カード**すべて**に付与する
 | { type: "addSymbolPermanent"; count: number; color: Color } // 発生源自身（self）に、指定色のシンボルをcount個**永続的に**追加する（symbolAddGrantと違い、条件で消える継続付与ではなく蓄積するトリガー式。CardInstance.extraSymbolsPermanentへ加算）
 | { type: "tenshoResume"; dest: "trash" | "void"; stage: "afterTargetTrigger" | "afterEvent"; skipSubstitute?: true } // 【転召】の途中で**誘発が選択待ちを立てた**ときの再開専用（内部専用）。selfに転召の対象スピリットが渡る。転召の手順は「コアを外す＋対象スピリットの効果発揮 → 対象の消滅 → 召喚時効果」で、**消滅は効果の発揮が解決しきってから**でなければならない（2026-08-13ユーザー確認）。stage:"afterTargetTrigger"＝『転召の対象になったとき』の誘発の後（置換の判断から再開）、stage:"afterEvent"＝『転召が解決したとき』の誘発の後（コア処理と消滅だけ）
 | { type: "tenshoCoreDump"; dest: "trash" | "void" } // 【転召】のpendingChoice再開専用。targetInstanceIdで指定された自分のスピリットの上のコアすべてをdestへ（trash=持ち主のトラッシュ、void=消滅）。維持コア割れは既存の消滅処理（destroySpirit "deplete"）に委ねる
 | { type: "markNoRefreshTarget" } // 相手の疲労状態のスピリット1体を「回復できない」と指定する（発生源＝selfにCardInstance.noRefreshTargetInstanceIdとして記録し、**selfが疲労状態で持ち主のフィールドにいる間**だけ効く。PhaseManagerのリフレッシュステップがisRefreshBlockedByMarkで参照）。対象は実効BP最大の1体を自動選択する決定的簡略化（アタック宣言中に発火しうるため、ここでpendingChoiceを立てない）
 | { type: "payNegateDecide"; targetInstanceId: string; discardCount: number; sourceName: string; resume: EffectAction } // 「自分の手札1枚を破棄することで、その効果を受けない」の**確認専用**（内部専用）。守る側に「破棄する手札を選ぶ／スキップして効果を受ける」を聞き、答えをGameState.payNegateDecisionに置いてからresume（元のアクション）を解決し直す。スキップでもresumeを解決するのでrequestCardChoiceのresolveOnSkipを立てる
 | { type: "tenshoSubstituteChoice"; dest: "trash" | "void"; exhaustInstanceId?: string } // 【転召】置換（constraint "tenshoCoreSubstitute"）の任意発動の再開専用（内部専用）。selfに渡された自分のスピリットについて、chosenOptionが「疲労する」なら疲労してコアを維持し、それ以外なら通常どおり上のコアすべてをdestへ置く。exhaustInstanceId指定時は**selfでなくこのインスタンス**（宣言した発生源＝ネクサス）を疲労させる
 | { type: "toTegamoto"; count: number | "any"; upTo?: number; pick?: CardPick; placed?: string[]; awaitingSkip?: true; anyMax?: number } // 自分の手札を手元（PlayerState.tegamoto）に置く。count:"any"＝好きなだけ（0枚も可）。置き終えたら lastMoved に書く。placed／awaitingSkip／anyMax は内部用（anyMax は pay が後半を解決しきれる数として渡す上限）
 // **置くのを全部済ませてからまとめてドローする**。1枚ごとにドローすると、引いたマジックカードをそのまま次に置けてデッキが尽きるまで回せてしまう（drawPerHandDiscard と同じ不具合。2026-08-10 修正）。
 // interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行し、スキップ（またはmax到達、または手札のマジックが尽きた時点）でドローする。自動時は該当カードをmax枚まで（未指定なら全部）一括移動して同数ドロー（決定的簡略化）。
 // placedSoFar / awaitingSkip は解決の途中経過を持ち回る内部フィールドで、cards.json には書かない
 | { type: "discardOpponentTegamoto" } // 相手の手元をすべてトラッシュへ。破棄したカードを GameState.lastMoved に書く（IF_UNIFY.md §5）
 // **破棄をすべて済ませてからまとめてドローする**。1枚破棄するたびにドローすると、引いたカードをまた破棄できてデッキが尽きるまで回せてしまう（2026-08-10 に実対戦で発覚）。
 // discardedSoFar / awaitingSkip は解決の途中経過を持ち回るための内部フィールドで、cards.json には書かない（awaitingSkip は「スキップされて戻ってきた＝破棄終了」の目印）
 | { type: "lendSelfThisTurn" } // このマジック自身を、このターンの間だけ自分の仮想発生源（PlayerState.turnVirtualInstances）として場に置いたものとして扱う。
 | { type: "targetChoiceLendThisTurn" } // 「スピリット1体は」（どちらの陣営でもよい）を選び、このターンの間その1体だけへ効果を貸す。colorChoiceLendThisTurnの対象インスタンス版（sourceCardId経由でlendSelfThisTurnと同じ仮想発生源を積み、CardInstance.lentChoiceInstanceIdに選んだインスタンスIDを載せる）メロディアスハープ
 // 同じカードの他の効果エントリ（levels:null必須）が effectSources() 経由で継続効果として一斉に有効になる（TURN_EFFECT_SOURCES.md §3）
 // **1つのアクションにまとめてあるのが要点**：疲労（コスト）と貸与（効果）を別々の optional エントリに分けると、確認が2回に割れて「疲労だけして効果が出ない」が起きる（実際に起きていた。2026-08-10 修正）。
 // 既に疲労している場合は支払えないので不発（ログのみ）
 | { type: "lendSelfThisBattle" } // lendSelfThisTurn の「このバトルの間」版。積む先が PlayerState.battleVirtualInstances になるだけで、貸与の仕組みは同一（effectSources が両方を混ぜる／instanceIdの "virtual-" 接頭辞も共通）。
 // clearBattle でリセットされるため、同じターンの2回目のバトルには持ち越さない。効果テキストが「このバトルの間」のマジックはこちらを使うこと
 | { type: "summonFreeFromTrashIndexInternal"; trashIndex: number } // **内部専用**：トラッシュの指定位置のカードを、コストを支払わずに召喚する。kind:"trashSummonOnNameSummoned" の確認（「召喚しますか？」）に答えたときの解決に使う
 | { type: "summonFromTrashFree"; costFilter?: { max?: number; min?: number }; colorFilter?: Color; keywordFilter?: Keyword; costBudget?: number; familyFilter?: FamilyFilter; nameIncludes?: string; payCost?: true; whileCombinedFilter?: true; count?: number; countCounter?: EffectCounter; skipOnSummon?: true; onlyBurstDestroyedCard?: true; destroyAtBattleEnd?: true; upTo?: true } // countCounter指定時はcountを無視しEffectCounterの値を召喚できる最大枚数として使う（0なら不発）。onlyBurstDestroyedCard指定時は、そのバースト発動のきっかけになった破壊で落ちたカードだけが対象（recoverMagicFromTrashの同名軸と同型）。destroyAtBattleEnd指定時は、召喚できた個体にCardInstance.destroyAtBattleEndを立てる（バトル参加者としてonBattleEndまで生き残ったら破壊される）
 // count指定時はcostBudgetの代わりに**枚数指定**で複数枚を召喚する（costFilterはcostBudget指定時と違い有効に効く。コスト最大から貪欲に選ぶ決定的簡略化、count枚に満たなければ可能な分だけ）
 // skipOnSummon指定時は召喚時効果を発揮させない
 // whileCombinedFilter指定時は【合体時】効果（`effects`のいずれかがwhileCombined:trueを持つ）を持つスピリットカードのみ対象（カード静的に判定）。payCost指定時は**通常の召喚コストを支払う**（支払い元はリザーブ＋フィールドのコア＝paySources。払えないカードは候補にも出さない。summonFromHandFree.payCostと同型）。nameIncludes指定時はカード名にこの文字列を含むもののみ。familyFilter指定時はその系統（配列＝OR）を持つカードのみ。自分のトラッシュにあるcolorFilter色（省略時は色不問）・costFilter範囲のスピリットカード1枚（コスト最大、同コストは末尾＝新しい方から自動選択。決定的簡略化）を、コストを支払わずに召喚する。維持コアはリザーブから置き、不足なら不発。この効果で召喚されたスピリットのonSummon効果は発揮されない。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象。costBudget指定時はcostFilterを省略でき、コスト合計がbudget以下になる範囲で複数枚を召喚する（コスト最大から貪欲に選ぶ決定的簡略化。維持コアがリザーブから払えなくなった時点で打ち切り）
 | { type: "nexusCoresToTrash"; side: "opponent" | "both" } // 指定側（相手/両陣営）のネクサスすべての上に置いてあるコアすべてを、各持ち主のトラッシュへ置く。ネクサスはコア0になっても消滅しない
 | { type: "drawUpTo"; size: number } // 自分の手札がsize枚になるまでデッキから引く（既にsize枚以上ならno-op。デッキ切れ判定はdrawへ委譲）
 | { type: "moveCoresLeavingOne"; anySide?: true; selfTarget?: true; allowNexusDest?: true } // 対象スピリット上のコアを1個だけ残し、それ以外を同じフィールドの別のスピリット（フィールドの先頭側＝決定的簡略化）へ移す。移動先がいなければ不発。selfTarget指定時は対象を発生源自身に固定し、allowNexusDest指定時は移し先のスピリットがいなければ自分のネクサス（先頭側）へ移す
 | { type: "swapOpponentCores"; choosing?: true; firstChosen?: string } // 効果文が「相手のスピリット2体を**指定する**」なので、実対戦では2体とも持ち主が選ぶ（2026-08-24。自動選択は実効BP上位2体）。choosing/firstChosenは選択の進み具合を持ち回る内部専用（choosingが無いtargetInstanceIdは誘発が渡すイベント対象なので取り違えない）。相手のスピリット2体の上のコアをすべて入れ替える。相手のスピリットが2体未満、またはコア数が同じなら不発。入れ替えの結果、維持コア（Lv1）を下回った側は消滅する
 | {
 type: "summonRepeatFromHand"
 mode: "free" | "paid" // free=summonFromHandFreeと同じくコストを支払わず維持コアのみリザーブから払う（extraReserveCostPerSummon指定時は1体ごとにさらにリザーブのコアをその数だけ自分のトラッシュへ）。paid=effectiveCostで通常のコストを計算し、維持コア+コストをリザーブから支払う（コスト分はtrashCoresへ。field由来の支払いは非対応）
 familyFilter?: FamilyFilter
 costFilter?: { max?: number; min?: number }
 extraReserveCostPerSummon?: number
 } // 自分の手札にある条件（familyFilter・costFilterはカード静的判定）を満たすスピリットカードを、リザーブが続く限り好きなだけ召喚する（1体あたりの必要リザーブが小さいものから貪欲に選び、召喚数を最大化する決定的簡略化）。いずれもこの効果で召喚されたスピリットのonSummon効果は発揮されない
 | { type: "destroyByBpBudget"; budget?: number; budgetFromSelfBp?: true; budgetFromFamilyBpSum?: FamilyFilter; choosing?: true; chosenIds?: string[] }
 // 相手スピリットを、**実効BP合計**がbudgetを超えない範囲で好きなだけ破壊する。budgetFromSelfBp指定時はbudgetを無視し、selfの実効BPを予算にする。budgetFromFamilyBpSum指定時はbudgetを無視し、指定系統（配列＝OR）を持つ**自分の**スピリットの実効BP合計を予算にする。choosing/chosenIdsはトグル選択の途中経過を持ち回る内部専用（destroyByCostBudgetと同じ仕組み＝budgetToggleDestroy）
 | { type: "destroyByCostBudget"; budget: number; budgetCounter?: EffectCounter; choosing?: true; chosenIds?: string[] } // 相手スピリットを、コスト合計がbudgetを超えない範囲で好きなだけ破壊する。実対戦では**トグル式で選ばせる**（クリックで選択／もう一度クリックで解除。合計はpromptに出し、「これで破壊する」で確定。2026-08-24ユーザー確定）。choosing/chosenIdsはその途中経過を持ち回る内部専用。自動選択は残り予算内でコスト最大から貪欲に選ぶ（同コストは実効BP最大）聖皇ジークフリーデンの上限8への切替は転召対象の記録が必要になるため簡略化しbudget=5固定とする。budgetCounter指定時は実際の予算をbudget×counter値で算出する（083：EffectCounter"burstEventCost"）
 | { type: "forceEndMainStep"; who?: "opponent" | "turnPlayer" } // 発生源の持ち主から見た相手がいま自分のメインステップにいるなら、強制的にアタックステップへ進める（PhaseManager.toAttackPhase。ターンを飛ばすのではなく召喚・ネクサス配置ができなくなるだけ）。発動条件（何によって）はこれを使う各fieldEvent/triggered側で持たせる（黄・青バッチが別条件で再利用する想定）。相手がメインステップにいなければ何もしない。who省略時は従来どおり"opponent"（発生源の持ち主から見た相手のメインステップだけを狙う）。who:"turnPlayer"指定時は、いま誰のターンかを問わずメインステップにいれば強制終了する（自分がマジックを使っても自分のメインステップが終わる）
 | { type: "grantHostUnblockableThisTurn" } // このターンの間、**このブレイヴ（self）がいま合体しているホスト**はブロックされない（期間つき効果の一覧に target.kind:"braveHost" で記録し、読むたびにホストを引き直す。self＝ブレイヴ自身が必須）
 | { type: "skipBpCompare" } // バトル解決時まで進め、BP の比較（とその結果の破壊）だけを飛ばす（TIMING_CHART §1.12）。ただちに終わらせるのは endBattle
 | { type: "millUntilMagicCastFree"; maxCount?: number; discardCardType: "spirit" | "nexus" | "magic" } // 手札の指定種別カード1枚を破棄することで（任意コスト。自動選択は手札末尾の該当カードを破棄。該当カードなしはno-op＝不発）、自分のデッキを上から、マジックカードが出るまでトラッシュへ破棄し、出たらそのマジックカードのフラッシュ効果を、コストを支払わずに即時に発揮する（出ないままデッキ切れなら何も起きない）。maxCountは**省略時は上限なし**（デッキが尽きるまで。デッキ枚数は下限40枚のみで上限が無いため、固定値を書くと原文に無い天井になる）
 | { type: "opponentLifeToReserve"; count: number } // お互いのフィールド（スピリット+ネクサス）+リザーブ+トラッシュのコア合計を比べ、多かった方の持ち主が、少ない方と同じ合計になるまでボイドへ置く（同数なら不発）。取り先はその持ち主が選ぶ（coresDownToLimitへ、多かった方をsides、少なかった方の合計をlimitとして委譲。CHOOSER_RULES.md）

// selfBuff / bpBuff / voidCoreToSelf / draw / coreGain 共通のカウンタ定義。
// { ownFamily: string } は自分のフィールドの指定系統スピリット数、{ ownNameIncludes: string } は
// 自分のフィールドでカード名にこの文字列を含むスピリット数（いずれも onDestroy 等では発火時点で
// selfはすでにフィールドから除去されているため、self自身はカウントに含まれない）
