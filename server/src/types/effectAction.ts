// カード効果のアクション（効果が実際に何をするか）。
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

export type CardPick = { declared?: "match"; cardType?: CardType | CardType[]; family?: FamilyFilter; familyAll?: string[]; color?: Color | Color[]; anyOf?: CardPick[]; noBurst?: true; hasWhileCombined?: true; name?: string; keyword?: Keyword; nameIncludes?: string; team?: string; cost?: number | { min?: number; max?: number }; hasBurst?: true; burstEvent?: FieldEvent; differentNameFromSelf?: true; nameExcludes?: string; vanilla?: true; keisho?: true; costIn?: number[]; hasEx?: true; hasTrigger?: TriggerEvent; atLeastTaxedCost?: true } // atLeastTaxedCost＝税（effectTax）を課されたカードの印刷コスト以上（effectTax.ts が cost に置き換えてから解決するので matchesPick は読まない）。color の配列＝どれかの色。anyOf＝ほかの軸とは AND。costIn は symbolWhenSummoning の pick だけが読む。differentNameFromSelf・keisho は reveal のみ対応。hasTrigger＝レベル不問（reveal 等のデッキ・手札のカード用）

// last＝GameState.lastMoved に pick を満たすカードが1枚以上
// event＝誘発のきっかけ（destroyedColor＝このバースト発動時に破壊されたスピリットの色。targetBpAtLeast＝きっかけの個体の実効BP）
// ownAllHaveTeam＝0体では不成立の簡略化（1体以上必要）
// ownTeamAtLeast＝restedOnly指定時は疲労状態の個体だけ数える
// soulCoreInReserve＝自分のリザーブに[ソウルコア]がある
// ownKeishoExcludedTeamAtLeast＝直近の《継召》で除外したカードのうち指定チーム所属がcount枚以上
// ownAttackStepNow＝いま自分のアタックステップ（state.turnPlayer===効果の持ち主）。「アタックステップに置いたなら」の簡略化＝起動時点で判定
// magicUsedVia＝いま解決中のマジックの使用経路が一致（state.magicUsedVia）
// firstBattleOfTurn＝state.attacksThisTurn === 1 で判定。アタック回数は誘発より前に加算されるので onAttack 時に ===1 なら最初。onBlock は必ずバトル内なので同じ式でよい
// selfSummonedBy＝CardInstance.summonedBy が一致。「かわりに」は if/else で書く
// ownAllSpiritsHaveFamily.costIn＝すべてが、そのコストのどれかでもあること
// ownMagicUsedThisTurn＝このターンに自分が pick に合うマジックカードを使用していた
// opponentLifeNotLostThisTurn＝このターンに相手のライフが減っていない（state.lifeLostThisTurn）
// lastBuffed＝直前の bpBuff の対象（state.lastBpBuffTargetId）がいまもフィールドにいて filter に合う
export type IfCond = { last: CardPick } | { lastAll: CardPick } | { opponentAttackStepNow: true } | { opponentMainStepNow: true } | { count: EffectCounter; atLeast?: number; atMost?: number } | { event: { destroyedColor: Color } | { targetBpAtLeast: number } } | { ownAllHaveTeam: string } | { ownAllHaveFamily: string } | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } | { soulCoreInReserve: true } | { ownKeishoExcludedTeamAtLeast: { team: string; count: number } } | { ownAttackStepNow: true } | { magicUsedVia: string } | { firstBattleOfTurn: true } | { selfSummonedBy: string } | { lastBuffed: TargetFilter } | { ownMagicUsedThisTurn: CardPick } | { ownLifeLostThisTurn: true } | { opponentLifeNotLostThisTurn: true } | { keishoUsedForSummon: true } | { selfBpAtLeast: number } | { summonPaidWithSoulCore: true } | { soulCoreInTrash: true } | { ownAllSpiritsHaveFamily: string; costIn?: number[] } | { ownSpiritDestroyedThisTurn: true } | { ownAllNexusesHaveFamily: string } | { selfBlocked: true } | { opponentTurn: true } | { ownEffectDestroyedOwnSpirit: { color: Color } } | { ownEffectRemovedOpponentSpirit: { kinds: ("destroy" | "vanish")[]; spiritMagicOnly?: true } } | { selfRested: boolean } | { blockedAttacker: TargetFilter } | { ownEffectDestroyedOwnOnDestroySpirit: true } | { ownBurstSet: boolean }

export type EffectAction =
 | { type: "draw"; count: number; side?: "own" | "both"; costSkipCoreStep?: true; countCounter?: EffectCounter; countMax?: number; costSacrificeChosen?: true } // 自分がデッキから引く。countMaxはmill.countMaxと同義。side:"both"は自分→相手の順の両者、省略時は自分のみ。costSkipCoreStep＝そのコアステップの処理を支払いに使う（GameState.coreStepSkipped）
 | { type: "destroy"; filter?: TargetFilter; count: number | "any"; suppressOnDestroy?: true; chosenIds?: string[]; choosing?: true; all?: true; voidCoreToSelfPerDestroyed?: true; countCounter?: EffectCounter; countPerOpponentTrashMagicColors?: boolean; anySide?: true; side?: "own"; excludeTarget?: true; chooserIsTarget?: true; drawPerDestroyed?: true; thenDrawFixed?: number; lowestCost?: true; costSacrificeChosen?: true; upTo?: true } // 相手スピリットを破壊（既定。side:"own"は自分側で、選ぶのは持ち主＝pay { cost: destroy{side:"own"} } の器）。upTo＝0〜count の好きな数（非対話は count 体まで破壊）。thenDrawFixed は破壊処理後に発火（「その後」＝0体でも）。lowestCost は自動選択の基準をコスト最小にする（同コストはBP最大）。drawPerDestroyed は「残る」で残った個体を数えない。chooserIsTarget は破壊される側（相手）が選ぶ（実行は発生源の持ち主の効果）。filter省略時はBP不問。anySide の自動選択は実効BP最大（同値は相手側優先）。excludeTarget は誘発が渡す targetInstanceId を避ける

 | { type: "destroyDuplicateNames"; choosing?: true; keptIds?: string[] } // カード名1つにつき1体だけ残して残りを破壊する。**どれを残すかは持ち主が選ぶ**（効果文に主語が無いので発生源の持ち主。2026-08-24）。choosing / keptIds は内部フィールド
 | { type: "summonBurstCardFree"; payCost?: true; thenBuffSelf?: number; surchargePrepaid?: true } // payCost＝通常の召喚コストも支払う（リザーブのみ）。バースト専用：発動中のバーストのカード自身を召喚する（スピリット/ネクサスのみ）。維持コア不足なら不発






 | { type: "setBurstFromHand"; ask?: true } // ask＝「〜できる」を式の中で確認する（候補が1枚でも選択を出し、スキップ可）。外側に optional の確認が無い sequence の中で使う。 バースト専用：自分の手札のバースト効果持ち1枚をセットする。setBurst（GameAction）と違い**ターン1回制限を受けない**。自動選択はコスト最大の1枚（決定的簡略化）
 | { type: "destroyNexus"; count: number | "any"; chosenIds?: string[]; choosing?: true; drawPerDestroyed?: number; discardOpponentPerDestroyed?: number; all?: boolean; side?: "opponent" | "both" | "own" | "either"; levelFilter?: number[]; filter?: TargetFilter; costSacrificeChosen?: true; chooserIsTarget?: true; upTo?: true; awaiting?: true } // either＝自分か相手のネクサスを持ち主が選んで破壊（count は1だけ。非対話は相手側優先）。awaiting は内部用。side:"own"は pay { cost: destroyNexus{side:"own"} } の器。upTo の count は上限で、選ばずに終えたら以降も破壊しない

 // chooserIsTarget（count:1・side省略時のみ対応）は破壊される側が対象を選ぶ（解決は発生源の持ち主の効果＝PendingChoice.actorPid）。chooseColor＝使用者が先に色を指定して colorFilter へ載せ解決し直す（自動選択は破壊できる数が最大の色。同数はred/purple/green/white/yellow/blueの順）。colorFilter の多色はOR
 | { type: "returnSelfToHand"; optional?: true; confirmed?: true } // optional＝「戻せる」（confirmed は確認済みの再入印で内部用）
 | { type: "returnSelfToDeckTop" } // 破壊された「その個体」を名指しで戻す
 | { type: "colorlessSelfThisBattle" }
 // このバトルの間だけ、色とシンボルを無いものとして扱う（clearBattleでリセット）
 | { type: "spawnToken"; token: string; count: number; upTo?: true } // 召喚ではない（actions/token.ts）。upTo＝「N体まで」
 | { type: "soulCoreToTrash" } // リザーブ・場の個体のどこにあっても。無いときは不発。pay の cost に書ける
 | { type: "placeSoulCore"; from?: "reserve" | "trash"; target?: "self" | "one"; filter?: TargetFilter } // from省略時はトラッシュ。target:"self"＝効果発生源自身、省略時はfilterに合う自分の個体1体。置いた個体にはコア増加の誘発が効く
 | { type: "coreRemove"; count: number; dest?: "void" | "trash"; anySide?: true; side?: "own"; spread?: true; chooserIsTarget?: true; spreadRemaining?: number; countCounter?: EffectCounter; leaveAtLeast?: number; filter?: TargetFilter; drawIfEmptied?: true; all?: true; soulChoiceTarget?: string; excludeSoulCore?: true; distinct?: true; spreadChosen?: string[]; spreadDrew?: true } // excludeSoulCore＝§1.3の持ち主への質問を出さず通常コアだけを移す。distinct＝spread で同じスピリットを2度選ばない。spread と drawIfEmptied の併用は「どれかのコアが0になったら1回だけドロー」。spreadChosen・spreadDrew・soulChoiceTarget は内部用。spread＝count個を1個ずつ別々のスピリットから選んで取り除く（2026-09-24ユーザー確認：「コアN個を置く」は合計N個を1個ずつ選ぶ。自動選択はコアの多い個体から）。chooserIsTarget＝対象側の持ち主が選ぶ（解決は発生源の持ち主の効果のまま）
 // 対象スピリットのコアを持ち主のリザーブへ。drawIfEmptied＝**この効果で**対象のコアが0個になったときだけ自分がドロー。leaveAtLeast＝この数を下回らないところまでしか取り除かない。dest:"void"はボイド（消滅）、"trash"は持ち主のトラッシュ。anySide の自動選択は実効BP最大（同値は相手側優先）。all＝countを無視
 | { type: "bpBuff"; target?: "self"; filter?: TargetFilter; amount: number; amountIfTarget?: { filter: TargetFilter; amount: number }; /* 選ばれた対象がfilterに合うときの量（amountの代わり）。単体指定の経路のみ */ amountCounter?: EffectCounter; amountFromSelfBp?: true; scope?: "battle"; anySide?: true; extraPerCoreToTrash?: number; boostTargetInstanceId?: string; thenAddSymbolThisBattle?: { color: Color; count: number }; costMillSelfCount?: number; thenRefreshIfMilledFamily?: FamilyFilter } // costMillSelfCount＝デッキを上からこの枚数、無条件に破棄することがコスト（あるだけ処理してコストも払う。デッキが尽きていても0枚破棄で成立）。thenRefreshIfMilledFamily＝その破棄で指定系統（配列＝OR）のスピリットカードが1枚以上トラッシュに置かれたときだけ発生源自身を回復
 // 既定はターン終了時まで。amountFromSelfBp＝amountの代わりに発生源自身の実効BP（selfがnullならno-op）。anySide の自動選択は自分の場から。extraPerCoreToTrash＝amount適用後、コアを自分のトラッシュに好きなだけ置いて1個につき追加でBP+（コアはリザーブ優先。自動選択は0個）。boostTargetInstanceId は内部専用。thenAddSymbolThisBattle＝amount適用後の対象へこのバトルの間だけ指定色のシンボルをcount個追加
 | { type: "exhaust"; filter?: TargetFilter; count: number | "any"; all?: true; anySide?: true; excludeTarget?: true; chooserIsTarget?: true; countFromBofu?: true; bofuSourcePid?: PlayerId; countCounter?: EffectCounter; noRefreshUntilOwnEndSteps?: number; side?: "own"; autoPickMaxBp?: true; target?: "self"; upTo?: true; nexus?: "only" | "also"; nexusOnly?: true; excludeIds?: string[]; untilRefreshedCount?: number } // excludeIds は内部用。耐性で受けなかった個体は回復状態のままなので、疲労済みの除外では足りない。既定は相手のスピリット。bofuSourcePid は内部専用（chooserIsTarget で再入すると owner が入れ替わるため持ち回る）。noRefreshUntilOwnEndSteps は anySide／countCounter の経路では付かない簡略化。side own の自動選択は実効BP最小。nexus:"only"＝相手のネクサスだけ、"also"＝相手のスピリット/ネクサス合わせた候補から count 個（非対話は実効BP最大のスピリット優先→残り枠をネクサスへ）。untilRefreshedCount＝回復状態のスピリットがこの数になるまで疲労させる（count は使わない）。upTo の count は上限で、選ばずに終えたら以降も疲労させない
 | { type: "openAwakenMode" } // 【Re覚醒】覚醒モードを開く印。サーバー側は no-op で、覚醒そのものはクライアントが GameAction "awaken" を送る（2026-10-08ユーザー確認）
 | { type: "bpMinus"; amount: number; all?: true; count?: number; excludeIds?: string[]; filter?: TargetFilter; scope?: "battle"; per?: { counter: EffectCounter; amount: number }; chosenByPlayer?: true } // all＝相手のスピリットすべて（「それら」として全員を控える）。per＝「◯1体につき、このBP-を-N する」の加算。対象は state.lastBpBuffTargetId に控える（「その後、それがBP0なら破壊する」は destroy の filter { lastBpBuffTarget, maxBp: 0 }）。chosenByPlayer は内部用
 | { type: "bpBuffAll"; familyFilter?: FamilyFilter; teamFilter?: string; amount: number } // familyFilter省略時は系統を問わない。配列＝OR
 | { type: "discardHandAll"; thenDrawOpponentHand?: true } // 自分の手札をすべてトラッシュへ。thenDrawOpponentHand＝破棄を完全に解決した後（手札0枚で破棄が起きなかった場合は発揮しない）、相手の手札枚数ぶん引く
 | { type: "returnToHand"; count: number; countCounter?: EffectCounter; all?: true; maxBpFromSelf?: boolean; countPerOpponentNexus?: boolean; anySide?: true; side?: "own"; filter?: TargetFilter; costSacrificeChosen?: true; target?: "self" | "selfBrave"; costBudget?: EffectCounter; budgetLeft?: number; nexus?: "only" | "also" } // 対象を持ち主の手札に戻す。target self/selfBrave はコスト用で、自分のコストなので耐性は見ない。costBudget＝好きなだけ・コストの合計がカウンタの値まで（count は使わない。budgetLeft は内部用）。side:"own"は自分側。戻すのは破壊ではないので onDestroy は誘発しない。maxBpFromSelf＝selfの実効BP以下の相手のみ。anySide の自動選択は実効BP最大（同値は相手側優先）。nexus は exhaust.nexus と同じ意味
 // picked は選択の再開用（選び終わるまでゾーンから抜かない）。chooserIsTarget＝戻すカードの持ち主が選ぶ
 | { type: "returnToBurst"; side?: "own"; count?: number; filter?: TargetFilter } // バウンスと同じ場の離れ方でバーストエリアにセット（乗っていたコアはリザーブへ）。バーストが既にセット済みなら不発。count は1のみ
 | { type: "returnToDeckTop"; anySide?: true; side?: "own"; count?: number; chooserIsTarget?: true; filter?: TargetFilter; all?: true; orderedIds?: string[]; excludeIds?: string[] } // 対象を持ち主のデッキの一番上に戻す。excludeIds は内部用。count 体を1体ずつ選ぶ連鎖で、選んだ個体を除く印（耐性で受けなかった個体は場に残るため）。side:"own"は自分側。count指定時は1体ずつ選ぶので最後に選んだものが一番上＝「好きな順番で戻す」を表現（中断時は残り体数を再開スタックへ）。chooserIsTarget＝戻される側（相手）が選ぶ（解決は発生源の持ち主の効果）。all＝filterの候補すべてを選んだ順に戻す（count/anySide/sideは無視。orderedIdsは内部専用）
 | { type: "returnToDeckBottom"; target?: "self"; anySide?: true; side?: "own"; count?: number; chooserIsTarget?: true; filter?: TargetFilter; all?: true; orderedIds?: string[]; excludeIds?: string[] } // 対象を持ち主のデッキの一番下に戻す。target:"self"＝コスト用（耐性は見ない）。軸の意味は returnToDeckTop と同じ（「好きな順番で」）。all＝候補すべてを選んだ順に戻す（count/anySide/sideは無視。orderedIdsは内部専用）
 | { type: "setTargetBpAsThisBattle"; levels: number[]; amount: number } // setOpponentBpAsThisBattle の、対象がイベントから渡る版

 | { type: "placeCores"; from: "void" | "reserve" | "trash" | "self" | "field"; to: "reserve" | "trash" | "life" | "spirit" | "nexus" | "deckSide"; target?: "self" | "one" | "all"; anyField?: true; targets?: number; targetsCounter?: EffectCounter; filter?: TargetFilter; count: number | "all"; countCounter?: EffectCounter; upTo?: true; fillTo?: number; upToLevel?: number; orReserve?: true; excludeIds?: string[]; upToTargetId?: string; spread?: true; spreadRemaining?: number; spreadChosen?: string[] } // anyField＝置き先を自分のスピリットとネクサスの両方から選ぶ（同じ個体は2回選ばない）。spread＝count個を別々の置き先に1個ずつ振り分ける。fillTo＝この数になるまで不足分だけ置く。upTo＝count は上限で0〜count の好きな数（2026-09-28 ユーザー決定）。spreadRemaining／spreadChosen／excludeIds／upToTargetId は内部用
 | { type: "removeCores"; side?: "opponent" | "own" | "any" | "both"; from?: ("spirit" | "nexus" | "reserve" | "trash" | "life")[]; to?: "reserve" | "trash" | "void" | "life"; target?: "one" | "spread" | "all" | "self" | "event"; targets?: number; filter?: TargetFilter; count: number | "all" | "toLowerLevel" | "any"; anyMax?: number; countCounter?: EffectCounter; targetsCounter?: EffectCounter; leaveAtLeast?: number; downTo?: number | "equalize"; chooser?: "owner"; spreadRemaining?: number; excludeIds?: string[]; sideIndex?: number } // コアを「取り除く」器（docs/design/CORE_UNIFY_REMOVE.md §3）。spreadRemaining/excludeIds/sideIndex/anyMax は内部用。count:"any"＝好きなだけ（取り除いた数を lastCores に書く）。to:"life"＝持ち主のライフへ置く。既定は[ソウルコア]を含めない
 | { type: "refreshAllOwn"; exemptFamily?: FamilyFilter; exemptKeyword?: Keyword; exemptCombined?: true } // exemptCombined／exemptKeyword／exemptFamily（配列＝OR）に当たる個体にはアタック不可を付与しない
 | { type: "funsaiOnBlock" } // 内部専用：ブロック宣言時の同時発揮の列に並べる【粉砕】（blockDeclared.ts）。カードデータには書かない
 | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
 | { type: "swapBattler" } // バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える（テレポートチェンジ。バトル外・使用者がバトル非参加・疲労スピリット不在はno-op）
 | { type: "returnOwnNexusToDeckBottom"; filter?: TargetFilter } // 自分のネクサス1つ（filter に合うもの）を持ち主のデッキの下に戻す（破壊ではない。コスト用。選ぶのは持ち主）
 | { type: "returnNexusToHand"; count: number; anySide?: true; voidCoreToOwnTrashIfOpponent?: number; all?: true; side?: "opponent" | "both"; dest?: "deckTop" } // 相手のネクサスを持ち主の手札に戻す。anySide の自動選択は相手の先頭ネクサス。voidCoreToOwnTrashIfOpponent＝戻したネクサスが相手のものだったときのみボイドからその数のコアを自分のトラッシュへ。all＝countを無視しside（省略時はopponent）が指すすべてのネクサス
 // dest:"deckTop"指定時は「手札に戻す」の代わりに持ち主のデッキの上に戻す（returnNexusToDeckTop）
 | { type: "refreshSelf" } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）
 | { type: "exhaustSelf" } // このスピリット自身を疲労させる（selfがnull/既に疲労状態ならno-op。exhaustSpirit経由なのでownSpiritExhausted等が正しく発火する）
 | { type: "lifeCrush"; count: number; countCounter?: EffectCounter; countMax?: number; dest?: "trash" | "void"; neverZero?: true } // 相手のライフのコアcount個を相手のリザーブへ。dest:"trash"は相手のトラッシュ（再利用されないぶんリソースが減る）、"void"はゲームから取り除く。neverZero＝**この効果によっては**相手のライフを0にしない（下限1。このアクション自身だけの下限）。ライフ0以下で勝敗決定
 | { type: "discardOpponentBurst" } // 相手のバースト（player.burst）1つを破棄する（セットしていなければno-op）
 | { type: "discardBurst"; side?: "own" | "opponent" } // discardOpponentBurstの汎用版（pay の cost 側専用）。既定opponent
 | { type: "discardOpponent"; count: number; downTo?: number; forcedTargetPid?: PlayerId; cardTypeFilter?: CardType; random?: boolean; chooserIsSource?: boolean; revealAllHandIfNone?: true; countAttackerSymbols?: true } // countAttackerSymbols＝countを無視し、ctx.targetInstanceId のスピリットのシンボル数を破棄枚数にする（ownLifeDamaged のアタッカー）。対象が見つからなければ0
 // 相手の手札からcount枚を破棄（末尾から。足りなければある分だけ）。revealAllHandIfNone＝破棄できる対象が無かったとき相手の手札すべてを一瞬公開（ゲーム状態は変えずログにだけ出す簡略化）。random＝**誰も選ばない**（効果文が「内容を見ないで破棄する」の形なのでランダムが正しい。2026-08-17ユーザー確認。CHOOSER_RULES.md §1.6）。forcedTargetPid は内部設定（選択者=破棄される側で owner が逆算できなくなるのを避ける）。cardTypeFilter＝該当が無ければ不発。chooserIsSource＝発生源の持ち主が選ぶ（「相手の手札すべてを見て〜1枚を破棄する」）。自動選択はコスト最大の該当カード（決定的簡略化）
 | { type: "randomOpponentHandMagicDiscard" } // 内容を見ないで（＝ランダムに）選び、マジックカードならトラッシュへ、それ以外は手札に残す（誰も選ばないので決定的簡略化はしない。SEMANTICS_AUDIT.md §3.14）。手札0枚なら不発
 | { type: "heavyExhaust"; filter?: TargetFilter; count?: number; countCounter?: EffectCounter; upTo?: true; escalate?: true; chooserIsTarget?: true; chosenByPlayer?: true } // 相手のスピリットを重疲労させる。chooserIsTarget＝相手が自分のスピリットから選ぶ（非対話は実効BP最小）。既に重疲労の個体は候補外。escalate＝回復状態なら疲労、疲労状態なら重疲労。count 既定1・upTo＝0〜count。chosenByPlayer は内部フラグ
| { type: "refreshOwnNexus"; upTo?: true; chosenByPlayer?: true } // 自分の疲労状態のネクサス1つを回復させる。upTo＝指定そのものが任意（対話時は選ばずに終えられる）。chosenByPlayer は内部フラグ
| { type: "refreshOne"; countCounter?: EffectCounter; filter?: TargetFilter; all?: boolean; anySide?: true; count?: number; chosenByPlayer?: true; eventTargetOnly?: true; thenLevelUpThisTurn?: true; thenCantAttackThisTurn?: true; upTo?: true } // 自分の疲労スピリット1体を回復（family は spiritHasFamily 判定＝付与系統も考慮）。eventTargetOnly＝誘発が渡す targetInstanceId だけを回復対象にする（選択しない）。chosenByPlayer は内部フラグ（これが無い targetInstanceId は誘発が渡すイベント対象であって回復対象ではない）。**interactiveTargets ならプレイヤーが選ぶ**（2026-08-23。候補1体なら聞かない）。count＝その体数まで回復（実効BP最大から順。cantAttackThisTurn は付与しない）。all も cantAttackThisTurn を付与しない。upTo の count は上限で、選ばずに終えたら以降も回復させない。thenCantAttackThisTurn＝回復させたそのスピリットはこのターンアタックできない。thenLevelUpThisTurn＝実際に回復させた対象へ levelUpThisTurn と同じ処理を続ける
 | { type: "protectBlockerCoresThisBattle" } // このスピリットをブロックしているスピリット上のコアは効果で取り除けない（バトル終了で消える）
 | { type: "endAttackStepAfterBattle"; excludeCombined?: true } // バトル外はno-op。excludeCombined＝現在のバトルのアタッカー/ブロッカーのいずれかが合体スピリットなら不発
 | { type: "destroyBlockerAfterBattle" } // 現在のバトルのブロッカーを**バトル終了後**（＞７。【呪撃】と同じ位置）に破壊する予約を立てる（BattleState.endBattleDestroy）。
 // self は発生源自身（fieldEvent 側で selfMode:"source" を指定する）。コアが足りない／バトルがない／ブロッカーがいないときは不発（ログのみ）。
 // **支払いでレベルが下がっても予約は残る**（発揮はコストを払った時点で成立している。2026-08-16 ユーザー確認）。
 // 破壊そのものは通常の destroy 経路で解決するので、装甲・効果耐性は**バトル終了後のその時点**で判定される




 // 自分のトラッシュのスピリットカードを手札に戻す。costBudget＝countを無視し、コスト合計がbudget以下で好きなだけ（コスト最大から貪欲に選ぶ決定的簡略化）。anyCardType＝カード種別を問わない。vanillaFilter＝効果の記述を持たないカードのみ（isVanillaCard）。bravesOnly＝ブレイヴカードだけ（includeBravesの「両方」とは別軸）。colorFilter は静的なcolorsで判定。costSkipDraw＝そのドローステップのドローを支払いに使う（実際に戻せたときだけ GameState.drawStepSkipped を立てる）。keywordFilter は静的に持つエントリで判定、keywordFilterAny は OR。thenDestroyIfFamily＝戻したカードがその系統（配列＝OR）を持つときだけ続けて maxBp以下の相手スピリット1体を破壊。自動選択は末尾＝新しい方から（本来は選択の簡略化）。all＝countを無視しfamilyFilter該当カードすべて
 | { type: "countAsMultipleThisTurn"; count: number; anySide?: true; sourceTypes?: CardType[] } // 対象スピリット1体に「このターンの間、使用者の効果ではcount体分として数える」印を付ける（CardInstance.countAsThisTurn）。sourceTypes＝数える側の効果の発生源種別をこれに限る
 | { type: "noop" } // 何もしない。magicNegate の確認など、アクション解決以外の pendingChoice のプレースホルダ。カードデータには書かない
 | { type: "peekOpponentBurst" } // 効果の持ち主だけが見る（盤面は変わらない）。PlayerState.peekedOpponentBurstCardId に控える。バーストが無ければ不発
 | { type: "peekOpponentHand" } // 相手の手札1枚を**内容を見ないで選び**（ランダム。SEMANTICS_AUDIT.md §3.14）、その内容だけを見る。PlayerState.peekedOpponentCardIds に積み、持ち主の PlayerView にだけ返す
 | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
 | { type: "discardBothHands"; count: number; countCounter?: EffectCounter; all?: true } // お互いが手札からcount枚を破棄する（自分→相手の順）。**破棄するカードは各自が自分で選ぶ**（相手側は actorPid で相手の効果として解決）。自動選択は手札の末尾から
 // all＝countを無視し、各自の手札すべて（枚数は各自バラバラ。count自体は0を置く）
 // countCounter指定時はcountを無視し、EffectCounterの値を破棄枚数として使う（0ならログのみ）
 | { type: "treatAsUnblocked"; when?: "blockerLevel1" | "levelAtLeastBlocker" } // このバトルの解決で、when を満たせば BP を比べずブロックされなかったものとして扱う（when を省くと無条件）
 // 継続効果を期間つきで置く（ACTION_VOCABULARY §3）。対象は相手のスピリット、選ぶのは発生源の持ち主。
 // 内容をすべて既に持つ個体は候補にしない。all:true は個体を選ばず「条件に合うものすべて」をルールとして置く
 // （解決後に場に出たスピリットにも効く。いまは期間 turn だけ）。side と内容 bp は all のときだけ
 // target:"self" は「このスピリット自身をBP+」（旧 selfBuff 相当）：対象は常に発生源自身で、filter/side/count/targetInstanceIdは見ない
 | { type: "timedEffect"; content: TimedContent[]; duration: "turn" | "battle" | "nextRefresh" | "step" | "firstAttack" | "beforeBlock"; colorOptional?: true; count?: number | "any"; choosing?: true; chosenIds?: string[]; countCounter?: EffectCounter; filter?: TargetFilter; all?: true; side?: "own" | "both"; target?: "self" }
 | { type: "markUnblockableByIceWallColorThisTurn" } // 【氷壁】を持つ自分のスピリット1体を指定し、このターンの間、その【氷壁】の色と同じ色の相手のスピリットからブロックされない（指定時点の色で記録。このターン中に【氷壁】が無効化されても保持＝Q25026〜Q25028）
 | { type: "pay"; cost: EffectAction; then: EffectAction; confirmed?: true; tax?: { source: string; target: string; phrase: string; verb: string }; costOnly?: true; onceRevert?: { instanceId: string; effectId: string }; eventTargetId?: string; limitByKeyword?: "kyoshu" } // costOnly＝then が空振りでもコストは払うので then は成立判定しない。「〜することで〜する」の汎用の器（COST_MODEL.md §1）：cost・thenとも書いてある数どおりに解決できるときだけ発揮する。対応typeは actions/pay.ts の PAYABLE_TYPES
 // 手札がdiscardCount枚未満なら不発（部分的な破棄はしない）。破棄は COST_MODEL.md §2どおり interactiveTargets 時は持ち主が1枚ずつ選び、自動選択は手札末尾
 // discardCountは選択の再入をまたいで「残り破棄枚数」を持ち回る（0になった時点でdrawCount枚ドロー）
 | { type: "coreDrainAllOthers"; rewardDraw?: true } // 両陣営。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）
 // rewardDraw指定時は、コアをselfへ置く代わりに消滅した数ぶん自分がドローする
 | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する
 | { type: "grantKeywordThisTurn"; keyword: Keyword; filter?: TargetFilter } // 候補0体なら不発、対話時2体以上は選択
 | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する
 | { type: "endStepLock"; turns: number; locks: ("attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve" | "summonTrigger")[] } // summonTrigger＝お互いの『このスピリットの召喚時』効果が発揮されない（noSummonTriggerByCostが読む）。turns 回数えるまで両陣営にかける（GameState.endStepLocks）
 | { type: "atTurnEnd"; action: EffectAction } // このターン終了時に action を解決する（記録はGameState.turnEndActions）。発生源が場を離れていても解決する（公式Q&A Q22394〜Q22396）
 | { type: "burstMagicFreeOrThenPay"; cardId: string; payTiming?: "main" | "flash"; payCost?: number } // burstMagicFreeEffect（BS16-070）の選択肢の解決専用。keywords/burst.tsのtryBurstMagicFreeOrThenPayが積み、actions/control.tsのハンドラがchosenOptionの文言で分岐する
 | { type: "negateContinuousMagicByName"; nameIncludes: string } // 相手側が発揮中のendStepLockのうち、発生源カード名にこの文字列を含むものだけを解除する。トラッシュ・手札のカードには何もしない
 | { type: "lifeCoresBySymbolDiff" } // onBlocked（self=アタッカー、targetInstanceId=ブロッカー）で解決。シンボル数の差が正のとき、その数ぶん相手のライフのコアを相手のリザーブへ（内部でlifeCrushへ委譲）
 | { type: "battleLoserCoresToVoid" } // 直前のバトルで破壊された相手のスピリット上のコアすべてを、リザーブでなく**ボイド**へ送る。破壊待機中（コアが乗ったまま）に呼ぶ前提
 | { type: "extraAttackStep" } // アタックステップとエンドステップを順番にもう1回ずつ行う（GameState.extraAttackStepPending を立てる）。既に立っていれば何もしない
 | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない）
 | { type: "destroyOwnByCost"; maxCost: number; gainCoresEqualCost?: boolean; thenDestroyEnemyByCostBudget?: true } // 自分のフィールドの self以外でコスト<=maxCostのうちコスト最大の1体（決定的選択）を破壊。gainCoresEqualCost＝破壊したスピリットと同コストのコアをボイドから自分のリザーブへ。thenDestroyEnemyByCostBudget＝そのコストを予算に destroyByCostBudget と同じ貪欲選択で相手のスピリットを破壊
 // interactiveTargets では**両プレイヤーが順に**色を選ぶ。選択の進捗は chosenOwn / chosenOpp / awaiting に持たせて再入する
 // （相手に選ばせる段は PendingChoice.actorPid で「選択者＝相手・実行者＝発生源の持ち主」にする）。
 // 自動選択は従来どおり、お互い自分フィールドで最多の色を自動指定する
 | { type: "resolveOwnDestroyTriggers"; instanceId: string; byOpponent?: true } // **内部専用**。破壊された自身の『破壊時』効果を発揮する。破壊で誘発した効果の列に「自身の破壊時ぜんぶ」を1グループとして入れるために使う（TIMING_CHART.md）
 | { type: "applyReviveOnDestroy"; instanceId: string; effectId: string } 
 | { type: "resolveFushiSummon"; pid: PlayerId; cardId: string } // **内部専用**。破壊で誘発した効果の列に並ぶ【不死】1枚分。解決時にトラッシュからカードIDで引き直すので、位置がずれても動く // **内部専用**。指定した reviveOnDestroy エントリを適用する。上と同じ列に1グループとして入る
 | { type: "destroySelf" } // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op）
 | { type: "mutualDestroyChoice"; chosenOwn?: string; chosenOpp?: string; awaiting?: "own" | "opponent"; keywordExclude?: Keyword } // keywordExclude＝そのキーワードを持たないスピリットだけが候補（一時付与・継続付与も見る）。destroyAllExceptChosenColorsと同じ二段階choice：発生源の持ち主→相手の順にフィールド（両陣営どちらでも可）から1体を指定し、2体（重複可）をそれぞれ破壊する。進捗はchosenOwn/chosenOpp/awaiting。自動選択は各プレイヤーが相手フィールドの実効BP最大（決定的簡略化）
 | { type: "mutualKeepChoice"; chosenOwn?: string; chosenOpp?: string; awaiting?: "own" | "opponent" } // mutualDestroyChoiceの否定版：各自は**自分の**フィールドから1体を指定し、その2体を除く両陣営のスピリットすべてを破壊する。破壊待機中のself自身は候補に含めない。自動選択は各自の実効BP最大（決定的簡略化）
 | { type: "summonSequence"; byFushi?: true } // byFushi＝【不死】による召喚として「自分のスピリットが召喚されたとき」を発火する（fieldEvent.fushiSummonOnlyの判定に使う）。**内部専用**：【転召】の対象選択で中断したとき、GameEngineがpendingChoice.queueへ積んで選択の解決後に合流させる
 | { type: "magicMirrorRepeat" } // 相手が直前に使用したマジックの効果を自分が使用したものとして解決し直す（対象・コストは無償の再現。GameState.lastMagicCast。相手の使用でなければ不発。[マジックミラー]自身は対象にできない＝連鎖ミラー防止）
 | { type: "magicFreeUseFromHandOrTegamoto"; colorFilter?: Color; familyFilter?: FamilyFilter; handOnly?: true } // 手札/手元(tegamoto。要tegamotoPlayable)のマジック1枚をコストを支払わずに使用（任意。候補0なら不発）。自動選択は手札→手元の順でコスト最大（決定的簡略化）。paidCost=false で解決するので ownMagicUsed の paidCostOnly は連鎖しない。カード側で optional:true と併用する。handOnly＝手元を候補から外す。familyFilter の配列＝OR
 | { type: "deployNexus"; from: "hand" | "trash"; colors?: Color[]; all?: boolean; nameContains?: string; optional?: boolean } // 手札またはトラッシュから、指定色のネクサスカード1枚をコストを支払わず自分のフィールドに配置。nameContains と colors は AND。colors省略時は色を問わない。該当なしはno-op。all＝該当するネクサスカードをすべて配置。optional＝印刷テキストが「配置できる」の札に付ける（候補が1枚でも「配置しない」を選べる）
 | { type: "levelOverrideOpponentNexuses"; level: number } // 相手の全ネクサスの timedLevel を level に設定（このターンの間）
 | { type: "levelAsSelfThisBattle"; level: number } // 発生源個体（self）をこのバトルの間 level として扱う（timedLevel への書き込み。BPもそのレベルの表になる。26系【レベルアップ】）
 | { type: "returnLastUsedMagicToHand" } // 直前に自分が使用したマジック（GameState.lastMagicUsed）がトラッシュにあれば手札に戻す。ownMagicUsed の中で使う＝効果発揮後に戻る（タイミングはバトル終了時ではない。2026-10-11 ユーザー確認）
 | { type: "exhaustOwnNexuses"; started?: true } // 自分の回復状態のネクサスを好きなだけ（0個も可）疲労させる。実際に疲労させた数を recordTargets に残す（counter lastTargetCount で数える）。疲労状態のネクサスは候補に出さない。started は内部専用（選び直しの再入で記録を消さない印）
 | { type: "nexusAsSpiritThisStep"; target?: "self"; filter?: TargetFilter; upTo?: true; placeCores?: true; until?: "battle"; levels: LevelDef[]; chosenId?: string } // ネクサス1つ（target:"self"＝自身、省略時は filter に合う1つ）を、このステップの終わりまでスピリットとして扱う（ネクサスの効果は発揮されない）。cost・系統はネクサスカードのまま、Lv表は levels。placeCores＝先に自分のリザーブのコア1個以上をそれに置く（数は使う人が選ぶ。非対話は1個。「フィールドから」は未対応）。同じインスタンスのまま field.nexuses→field.spirits へ移し、ステップの終わりに PhaseManager.endStepScoped が戻す（コア・疲労はそのまま）。upTo＝選ばずに終えられる（対話時は候補が1つでも聞く）。until:"battle"＝戻すのがバトルの終わり（バトル外ならステップの終わり）。chosenId は内部専用
 | { type: "treatOwnNexusesAsSpiritsThisTurn"; minCores?: number; cost: number; family: string[]; levels: LevelDef[] } // minCores個以上のコアが置かれた自分のネクサス（省略時1）を、このターンの間スピリットとして扱う。field.nexusesからfield.spiritsへ**同じインスタンスのまま**移し、asSpiritThisTurn で cost/family/levels を上書き。ターン終了時に PhaseManager.endTurn が生き残りを戻す（破壊された個体はトラッシュに残る）
 | { type: "destroyBrave"; allHosts?: true } // ホストは無傷で場に残る（BRAVE.md §6.5）。allHosts＝相手の合体スピリットすべてから1つずつ。省略時は1体ぶんで、複数なら選ぶ
 | { type: "combineOwnBrave"; chosenBraveInstanceId?: string; hostSelf?: true; thenFireWhileCombinedTrigger?: TriggerEvent } // 効果から合体させる入口（メインステップの任意合体 GameAction "combineBrave" とは別）。合体先の候補は shared/summon.ts の braveCombineCandidates。自動選択は先頭。chosenBraveInstanceId は内部専用。hostSelf＝合体先を**発生源自身に固定**（host選択をスキップ）。thenFireWhileCombinedTrigger＝**合体が実際に成立したときだけ**、新たに合体したブレイヴの「trigger一致・whileCombined:true」の誘発を発揮（2026-09-07ユーザー確認。BRAVE.md §12.3〜12.4。ホスト自身の同条件エントリは fireTrigger の通常ループが拾うので、ここで拾うのはブレイヴが持ち込む分だけ）
 | { type: "refreshSelfBraveThenCombine" } // targetInstanceId＝fieldEventのイベント対象。**回復と合体はセット**＝selfが既に合体済み・バトル中・合体条件を満たさないなら回復もしない
 | { type: "borrowCombinedAttackEffect"; confirmed?: true } // 合体スピリットのブレイヴ（発生源自身を含む）が持つ『合体アタック時』（onAttack whileCombined:true）効果を1つ選び、発生源自身（self＝合体スピリット。BRAVE.md §12）の効果として発揮する。レベル判定もself基準。同じ個体に複数エントリがある場合は先頭を採用する簡略化
 | { type: "requireCoreToBlockThisBattle"; count: number } // このバトルの間、相手はリザーブのコアを count 個トラッシュに置かなければブロックできない（払えないならブロックできない）
 | { type: "removeOneOfAnyType"; mode: "destroy" | "toHand" | "toDeckBottom"; types?: ("spirit" | "brave" | "nexus")[]; maxBpFromSelf?: true; count?: number; countCounter?: EffectCounter } // mode:"toDeckBottom"＝destroy/toHandの兄弟（スピリット/ブレイヴ/ネクサスで振り分け）。count/countCounter＝「◯につき」の複数回（countCounter優先。0ならログのみ。候補が尽きたぶんは不発）。複数ならinteractiveTargetsで1体ずつ選び、残り回数はresumeフレームへ。相手の**スピリット/ブレイヴ/ネクサスのどれか1つ**が対象。「ブレイヴ」は**合体中もスピリット状態も含む**（2026-09-02ユーザー確認）。合体中のブレイヴを選んだときはホストを残してそれだけが場を離れる。types＝候補をこの種別（配列＝OR）に絞る（省略時は3種すべて）。maxBpFromSelf＝self以下のみ（ネクサスは対象外）。自動選択はスピリット→合体中のブレイヴ→ネクサスの順に先頭
 | { type: "detachOpponentBrave"; allHosts?: true; minSymbols?: number; battlingOnly?: true } // 相手の合体スピリットを**分離させる**。⚠️ 効果による自分の分離（"detachBrave"。コア不要）とは**別の手順**で、「分離するときのコアの移動は相手が行う」＝ブレイヴの持ち主に「残すか・どのコアを置くか」を聞く（場を離れるときと同じ pendingBraveKeeps。BRAVE.md §12.5.1）。allHosts＝条件を満たす相手の合体スピリットすべて。省略時は1体ぶんで、複数なら効果の使用者が選ぶ（自動選択は先頭）。battlingOnly＝現在のバトルに参加している相手側のみ
 | { type: "detachBrave"; combineToChosenSpirit?: true; thenRefreshHost?: true; detachedBraveInstanceId?: string } // 効果によるブレイヴの分離（BRAVE.md §12.5：コアは要らない。detachBravesOnLeave とは別の手順）。分離元ホストは ctx.targetInstanceId、無ければ自分の合体スピリット1体から選ぶ（自動選択は先頭）。分離したブレイヴはホストの疲労状態を引き継ぐ。combineToChosenSpirit＝分離後に自分のスピリット1体へ合体できる（任意。自動選択は合体させず終える＝bravesOnly自動フォールバックと同じ簡略化）。thenRefreshHost＝分離した直後にホストだけ回復（ブレイヴは回復しない）。detachedBraveInstanceId は内部専用
 | { type: "summonFromHandFree"; symbolCount?: number; costSacrificeChosen?: true; colorFilter?: Color | Color[]; sameFamilyAsSelf?: boolean; familyFilter?: FamilyFilter; costFilter?: number | { max?: number; min?: number; in?: number[] }; nameIncludes?: string; maxCostFromOwnTrashCores?: true; count?: number; keywordFilter?: Keyword; skipTensho?: true; payCost?: true; skipOnSummon?: true; cancelable?: true; bravesOnly?: true; combineToSelf?: true; costDestroyOwnSpiritSameCost?: true; combineHandIndex?: number; repeatWhileChosen?: true; thenDraw?: number; spiritStateOnly?: true; combineNameIncludes?: string; thenRefreshCombinedHost?: true; upTo?: true; alsoFrom?: "trash"; nameExcludes?: string; nameExcludesSelf?: true; requireCandidate?: true; summonedBy?: string; pendingZone?: "hand" | "trash"; countCounter?: EffectCounter; chooseEach?: true } // countCounter＝count×カウンタの枚数を1体ずつ召喚（対話中は持ち主が1枚ずつ必ず選ぶ。非対話はコスト最大から）。chooseEach・pendingZone・combineHandIndex は内部専用。alsoFrom:"trash"＝手札とトラッシュの合計でcount枚まで（upToと組み合わせる）。nameExcludesSelf＝発生源自身と同じカード名を除く（発生源が不在なら無視）。summonedBy＝CardInstance.summonedBy に記録する経路（未指定は"freeEffect"。【Fチェンジ】は"fchange"）。requireCandidate＝手札に候補が1枚もなければ起動自体を拒否（RuleValidator.validateActivateAbility が summonFromHandFreeCandidateMatches で事前判定。2026-10-08 blindテスト指摘で簡略化から変更）。spiritStateOnly（bravesOnly併用）＝合体先を選ばせず**スピリット状態のまま**召喚（combineToSelfの逆）。repeatWhileChosen＝「好きなだけ」召喚（BRAVE.md §12.6。自動選択はコスト最大から貪欲に候補が尽きるまですべてスピリット状態で出す簡略化）。thenDraw＝実際に召喚できたときだけドロー。combineToSelf（bravesOnly併用）＝**発生源自身に直接合体**する（条件を満たさないときはスピリット状態）。bravesOnly＝候補がブレイヴカードだけで、常に合体先（ダイレクトブレイヴ／スピリット状態）を選ばせる（スキップ＝単体召喚）。costDestroyOwnSpiritSameCost＝自分のスピリット1体の破壊がコストで、**破壊したスピリットと同じコストのブレイヴカードだけ**が候補（成立しなければ発動しない＝破壊も起きない。解決後は破壊したコストをcostFilterに積んで再入）。combineNameIncludes＝合体先をカード名の部分一致で絞る（候補が無ければ発動しない）。thenRefreshCombinedHost＝実際に合体できたときだけ合体先を回復。cancelable＝候補が1枚でも必ず選択を出し、やめられる（やめた場合は起動能力の「ターンに1回」も消費しない＝doActivateAbility が PendingChoice.revertActivated で巻き戻す）。payCost＝**通常の召喚コストを支払う**（払えなければ不発）。アクション名のFreeは既定の挙動で、payCostはその例外。skipOnSummon＝召喚時効果と「召喚されたとき」の誘発を発揮させない（効果文に明記があるカードだけ。既定では発揮する＝2026-08-17修正）。maxCostFromOwnTrashCores＝「自分のトラッシュにあるコアの数以下のコスト」が上限。色の配列＝OR。自動選択は条件を満たすコスト最大の1枚（同コストは手札の先頭側。決定的簡略化）。維持コアはリザーブから置き、不足なら不発。sameFamilyAsSelf＝発生源と系統を1つ以上共通。costFilter は完全一致（{in}はいずれかのコストと一致）。count＝「count枚まで」の複数体召喚（コスト最大から貪欲に選び、維持コアが払えなくなった時点で打ち切り。自動選択のみ）。skipTensho＝召喚後の【転召】解決をスキップ（既定はコストを払わない召喚でも転召は必ず行うが、この効果は転召を発揮したものとして扱う旨の記載があるため例外）
 | { type: "destructionCoresToOwnSpirit" } // 破壊時：selfが破壊直前に置いていたコア数（coresAtDestruction）ぶんを、リザーブから自分の実効BP最大のスピリットへ移す（destroySpiritがリザーブへ移した分の付け替え。対象がいなければリザーブに残る。決定的簡略化）
 // targetInstanceIdが見つからなければ不発（ログのみ）
 | { type: "reviveLastDestroyedNexus"; coreCost?: number; costFrom?: "ownFieldOrReserve" } // costFrom:"ownFieldOrReserve"＝コストをself上ではなく自分のフィールド/リザーブのコアから払う（リザーブ優先）。coreCost省略時はself上のコアすべて。コア不足なら不発。GameState.lastDestroyedNexus をトラッシュから戻す
 | { type: "negateLifeDamageFromTarget"; cap?: number; filter?: TargetFilter } // cap 指定時は「減らない」ではなく「このターン、それから合計capしか減らされない」（lifeCap。filter で相手のスピリットを絞る）。対象のアタックでは、このターン自分のライフが減らない（CardInstance.lifeDamageNegatedFor）。対話中は対象を持ち主が選び、非対話はBP最大の相手
 | { type: "returnToHandEachHeavyArmorColor"; remainingColors?: Color[] } // selfが**その時点で実際に持つ【重装甲】の色**（静的keyword＋heavyArmorColorsGranted。hasHeavyArmorAgainstと同じ元データ）ごとに、
 // その色を持つ相手のスピリット1体ずつを手札に戻す（色が無ければ何もしない。多色1体で複数の色枠を埋めない＝色ごとに独立した対象選択）。
 // remainingColorsは選択待ちで中断したときの**残り色の再開用内部専用**。destroyOnePerCost.costsの再開と同型）
 // 1個ぶんの実処理は coreRemove count:1 に委譲する（装甲・効果耐性・維持コア割れの消滅・leaveAtLeast の判定を1箇所に保つため）。
 // dest:"void" 指定時はリザーブでなくボイドへ。leaveAtLeast 指定時は、どの1体もその数を下回るところまでは取れない
 // （「この効果で〜コアを0個にはできない」＝leaveAtLeast:1。
 // この制限は**その『』ブロックの中だけ**に効く。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）。
 // chooserIsTarget 指定時は、**コアを取られる側（相手）が対象を選ぶ**（「**相手は**、相手のスピリット上のコア3個を〜置く」。
 // 解決は発生源の持ち主の効果として行う＝PendingChoice.actorPid。exhaust.chooserIsTarget と同型。docs/design/CHOOSER_RULES.md）

 // コストごとに独立して選ぶ（同じ個体は二度選べない＝コストが一致する個体は1体につき1回）。
 // 対象がいないコストは飛ばす。interactiveTargets 時はコストごとに選択を出し、非対話では実効BP最大を自動選択
 // 。系統は付与も考慮する（spiritHasFamily）。
 // **発生源自身も数える**（効果文が「このスピリット以外の」と書いていない）。
 // interactiveTargets 時は kind:"option" で系統を選ばせ、非対話では**引ける枚数が多い方**を選ぶ決定的簡略化
 | { type: "sequence"; actions: EffectAction[]; keepScope?: true } // keepScope＝記録の枠を新しく作らない（外の「〜したなら」が中の記録を読む）。効果文の「Aする。その後、Bする。」（CONJUNCTION.md）：actionsを常に順番どおり全部解決する。Aが不完全にしか解決できなくてもBは解決する（例：疲労させる対象がいなくてもその後の回復は行う）。選択で中断したら残りは resolveInOrder が再開スタックへ積む
 | { type: "simultaneous"; actions: EffectAction[]; choosing?: true; chosenIds?: string[] } // 「Aして、B」＝同時（CONJUNCTION.md）。対象をすべて集めて1回で破壊待機に入れる。書けるのは destroy{all}・destroySelf・destroy{side:"own", count:数}。choosing／chosenIds は内部用
 | { type: "chooseActionMode"; modes: { label: string; actions: EffectAction[] }[] } // 効果文の「〜する。**または**、〜する」。使用者が modes からどれか1つを選び、その actions を順に解決する
 // 選択肢は**常に全部出す**：破壊は「〜することで」ではないので、対象が足りなくても発揮でき、いる分だけ破壊する
 // （2026-08-16 ユーザー確認。docs/design/COST_MODEL.md の「コストではない」側）。
 // interactiveTargets が無い（テスト・自動解決）ときは modes の先頭を選ぶ決定的簡略化
 | { type: "battleOpponentDestroyedCoresTo"; to: "void" | "trash" } // このバトルの間、破壊された相手のスピリットのコアすべてをリザーブではなく to に置く（void＝ゲームから取り除く）
 | { type: "revealDiscardRest" } // 公開ゾーンに残っているカードをすべて持ち主のトラッシュへ。revealAndSummonKeyword が queue に積み、**選んでもスキップしても**必ず後始末が走るようにする
 | { type: "revealReturnToDeck"; toTop?: true; placed?: number } // 公開ゾーンの残りをデッキの下へ戻す。**戻す順番は1枚ずつ選ばせる**（スキップで現在の順のまま）。toTop＝デッキの**上**へ（先に選んだカードが上＝次に引くカード）
 // pickCountが数値（2以上）のとき「N枚まで」＝1枚ずつ選び、途中でやめられる（BS16-044）。非対話時は
 // matchesPickに合うものを前からN枚まで自動で選ぶ
 | { type: "moveCards"; from: "trash" | "hand" | "revealed"; side?: "opponent"; chooserIsTarget?: true; pick?: CardPick; count: number | "all"; upTo?: true; exact?: true; countCounter?: EffectCounter; costBudget?: number; onlyEventCard?: true; onlyLastBattleDestroyed?: true; dest: "hand" | "deckTop" | "deckBottom" | "deckTopOrBottom" | "summon" | "placeNexus" | "cast" | "summonOrPlace" | "tegamoto" | "activateBurst" | "trash" | "exMark"; exColor?: Color; downTo?: number; optional?: true; tensho?: "asIfDone" | "none"; noSummonEffects?: true; orHand?: true; returnToDeckBottomAtEndStep?: true; pay?: "cost" | "fieldCoresOnly"; skipOnSummon?: true; skipTensho?: true; summonedBy?: string; requireCandidate?: true; lastMovedOnly?: true; fromEvent?: true; revealed?: true; destroyAtBattleEnd?: true; picked?: number[]; done?: string[]; asked?: true } // カードを選んで動かす統合の器。picked・done・asked は内部用。countCounter＝count×カウンタの値を枚数に。costBudget＝「コスト合計N以下」（大きい順に自動で選ぶ簡略化）。onlyEventCard＝きっかけの破壊で落ちたカードだけ（burst.destroyedAsTarget が targetInstanceId の枠に入れた cardId）。chooserIsTarget＝ゾーンの持ち主が選ぶ（「相手は、相手の手札1枚を〜」）。lastMovedOnly＝直前の動作で動いたカードだけ（同じ cardId は区別しない簡略化）。fromEvent＝from:"trash"限定、その回に破棄されたカード（state.lastDeckMill）だけ。dest の summon/placeNexus/cast は1枚ずつ送ってから残りを選び直す。exact＝upTo と併用し、ちょうど count 枚か0枚（途中でやめたり候補が足りないときは1枚も動かさない）。pay 省略時はコストを支払わない。pay:"cost"＝通常のコスト（リザーブとフィールドのコア）、"fieldCoresOnly"＝フィールドのコアだけ（placeNexus）。summonedBy＝召喚経路の記録（【Fチェンジ】は "fchange"、【操霊】は "soryo"＝selfSummonCost.viaSoryo もこれで判じる）。requireCandidate＝候補が1枚も無ければ起動そのものを断る（RuleValidator）。downTo＝from:"hand" で手札がこの枚数になるまで（count を解いた時点の手札で決める）。手札から dest:"trash" は「破棄する」（手札を破棄できない効果があれば何もしない）。「好きなだけ破棄する」は count:"all"＋upTo。from:"revealed"＝pick を書かず count:"all" で dest がデッキ/トラッシュ/手札なら「残り」（deckTopOrBottom＝上か下かを1回選ぶ。デッキへは戻す順番を選ばせる）、それ以外は選んだカードを1枚ずつ revealApplyOne へ送る。count:1 の自動選択はコスト最大、2以上は前から。lastMoved は書かない：オープンの記録を「オープンしたカードが〜なら」が読むため
 | { type: "skipDrawStep" } // このドローステップのドローを行わない（「ドローしないことで」の支払い。step.beforeDraw から呼ぶ）
 | { type: "designate"; side?: "own" | "opponent"; filter?: TargetFilter; count?: number; upTo?: true; add?: true; chosen?: string[]; awaiting?: true } // 選んだ個体を直前の対象（recordTargets）に書き、後ろの効果は filter.lastTarget で使う。相手側は装甲などの「指定されない」を通す。add＝直前の指定を消さずに足す。chosen／awaiting は内部用
 | { type: "revealOpen"; from?: "ownDeck" | "opponentDeck" | "burst"; count?: number; countCounter?: EffectCounter; countPer?: { ownColorTotal: Color } | { ownNexuses: true } | { ownSymbols: Color } | { keishoExcluded: true }; countFromSelfLevel?: true; destroySelfIf?: CardPick } // デッキの上からオープンするだけ（バーストならバーストをオープン）。公開ゾーン（GameState.revealedCards）に置き、lastMoved に書く。選ぶ・残りを送るのは moveCards from:"revealed"
 | { type: "revealApplyOne"; cardId: string; srcPid: PlayerId; dest?: "hand" | "summon" | "summonOrPlace" | "cast" | "placeNexus" | "tegamoto" | "deckBottom" | "activateBurst" | "trash"; tensho?: "asIfDone" | "none"; noSummonEffects?: true; orHand?: true; returnToDeckBottomAtEndStep?: true; destroyAtBattleEnd?: true; pay?: "cost"; surchargePrepaid?: true } // surchargePrepaid＝召喚の余分の支払いを払い済み（内部用）。pay:"cost"＝dest:"summon" で通常の召喚コストも支払う（リザーブだけ）。内部専用：revealで選ばれた1枚（元のゾーンから取り除き済み）を dest へ送る。【転召】の対象選択から再開する経路もここを通る
 | { type: "revealRest"; destPid: PlayerId; rest?: "trash" | "deckTop" | "deckBottom" | "deckTopOrBottom" | "hand"; pool?: string[]; placed?: number } // 内部専用：revealで選ばれなかった残りをrest先へ送る。デッキへ戻すときは1枚ずつ順番を選ばせる（destPidが持ち主。相手のデッキでも選ぶのはctx.owner）
 | { type: "summonBatchFlush" } // 内部専用：オープンから複数体を同時に召喚し終えたあと、後回しにした召喚時効果をまとめて発揮する（summon.ts flushSummonBatch）
 | { type: "revealFinishSummon"; noSummonEffects?: true } // 内部専用：revealApplyOneのdest:summon（tensho既定）で【転召】の対象選択から中断したときの続き。selfが召喚済みのインスタンス
 | { type: "grantFamilyChoiceAll"; targetFamily: string } // targetFamily持ちが自分のフィールドにも手札にも1枚もなければ不発。あれば全系統から選び、CardInstance.lentChoiceFamily に載せた仮想発生源を積む（lendSelfThisTurnと同じ貸与。以後は familyGrant の familyFromChoice エントリが継続付与する）
 | { type: "linkNexusCoresChoice" } // 自分のネクサス1つの指定は必須。そのネクサスの coresLinkedTo に self の instanceId を設定する（selfがnullなら不発）
 // what の値を1つ指定し、then の中の declared を実際の値に置き換えて解決する（DECLARE_UNIFY）。picked は再開用
 | { type: "fireSoryoSelf" } // このスピリット自身の【操霊】（keyword:"soryo" の召喚時効果）の中身をそのまま発揮する（26RBS02-023。レベルが合うものだけ）
 | { type: "fireEffect"; trigger: "onSummon" | "onDestroy" | "onBlock"; all?: true; filter?: TargetFilter; oneEffect?: true; soryoOnly?: true; chosenId?: string; instanceIds?: string[] } // chosenId・instanceIds は再開用
 | { type: "declare"; what: "color" | "family" | "cost" | "level" | "name"; options?: (string | number)[]; from?: "spirits" | "nexuses"; fromSide?: "opponent"; minSameName?: number; chooser?: "opponent" | "each"; autoFrom?: { ownTrash: CardPick }; then: EffectAction; picked?: Partial<Record<PlayerId, string | number>> }
 | { type: "if"; cond: IfCond; then: EffectAction; else?: EffectAction } // 「〜とき／〜なら」（docs/design/IF_UNIFY.md §5）
 | { type: "mill"; count: number; side?: "own"; countCounter?: EffectCounter; countMax?: number; until?: CardPick; chimei?: true } // 相手（side:"own"指定時は自分）のデッキを上からcount枚トラッシュへ送る（【粉砕】）。chimei＝【地鳴】の破棄（【地鳴】の枚数+N が乗り、「【地鳴】で破棄した時」が起きる）。不足時は可能な分だけ
 | { type: "takeLast"; pick: CardPick; to: "hand" | "summon"; skipOnSummon?: true } // 直前に動いたカード（record.ts）のうち pick に合う最後の1枚を、まだトラッシュにあれば to へ（「その後、トラッシュにあるそのカード」）
 | { type: "grantKeywordToHandCard"; keyword: Keyword; familyFilter?: FamilyFilter; cardType?: "spirit" | "nexus" | "magic"; all?: true } // 自分の手札の条件一致カード1枚に、このターンの間キーワードを付与（PlayerState.tempHandKeywordGrants。自動選択は手札末尾。付与はcardId単位＝同名重複カードにも効く簡略化）。all＝選択を挟まず条件一致する手札カードすべて
 | { type: "addSymbolPermanent"; count: number; color: Color } // 発生源自身（self）に、指定色のシンボルをcount個**永続的に**追加（symbolAddGrantと違い、条件で消えず蓄積する）。CardInstance.extraSymbolsPermanent
 | { type: "tenshoResume"; dest: "trash" | "void"; stage: "afterTargetTrigger" | "afterEvent"; skipSubstitute?: true } // 【転召】の途中で**誘発が選択待ちを立てた**ときの再開専用（内部専用）。手順は「コアを外す＋対象スピリットの効果発揮 → 対象の消滅 → 召喚時効果」で、**消滅は効果の発揮が解決しきってから**（2026-08-13ユーザー確認）。stage:"afterTargetTrigger"＝『転召の対象になったとき』の誘発の後（置換の判断から再開）、"afterEvent"＝『転召が解決したとき』の誘発の後（コア処理と消滅だけ）
 | { type: "tenshoCoreDump"; dest: "trash" | "void" } // 【転召】のpendingChoice再開専用。維持コア割れは既存の消滅処理（destroySpirit "deplete"）に委ねる
 | { type: "markNoRefreshTarget" } // 相手の疲労状態のスピリット1体を「回復できない」と指定する。発生源＝selfに noRefreshTargetInstanceId として記録し、**selfが疲労状態で持ち主のフィールドにいる間**だけ効く（PhaseManagerのリフレッシュステップがisRefreshBlockedByMarkで参照）。対象は実効BP最大の1体を自動選択する決定的簡略化（アタック宣言中に発火しうるため pendingChoice を立てない）
 | { type: "payNegateDecide"; targetInstanceId: string; discardCount: number; sourceName: string; resume: EffectAction } // 「自分の手札1枚を破棄することで、その効果を受けない」の**確認専用**（内部専用）。答えを GameState.payNegateDecision に置いてから resume を解決し直す。スキップでも resume を解決するので requestCardChoice の resolveOnSkip を立てる
 | { type: "tenshoSubstituteChoice"; dest: "trash" | "void"; exhaustInstanceId?: string } // 【転召】置換（constraint "tenshoCoreSubstitute"）の任意発動の再開専用（内部専用）。chosenOption が「疲労する」なら疲労してコアを維持、それ以外は通常どおりコアをdestへ。exhaustInstanceId＝**selfでなくこのインスタンス**（宣言した発生源＝ネクサス）を疲労させる
 | { type: "toTegamoto"; count: number | "any"; upTo?: number; pick?: CardPick; placed?: string[]; awaitingSkip?: true; anyMax?: number } // count:"any"＝好きなだけ（0枚も可）。lastMoved に書く。placed／awaitingSkip／anyMax は内部用（anyMax は pay が後半を解決しきれる数として渡す上限）
 // **置くのを全部済ませてからまとめてドローする**。1枚ごとにドローすると、引いたマジックカードをそのまま次に置けてデッキが尽きるまで回せてしまう（drawPerHandDiscard と同じ不具合。2026-08-10 修正）。
 // interactiveTargets時はcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し、スキップ・max到達・手札のマジックが尽きた時点でドロー。自動時は該当カードをmax枚まで（未指定なら全部）一括移動して同数ドロー（決定的簡略化）
 // placedSoFar / awaitingSkip は解決の途中経過を持ち回る内部フィールドで、cards.json には書かない
 | { type: "discardOpponentTegamoto" } // 相手の手元をすべてトラッシュへ。破棄したカードを GameState.lastMoved に書く（IF_UNIFY.md §5）
 // **破棄をすべて済ませてからまとめてドローする**。1枚破棄するたびにドローすると、引いたカードをまた破棄できてデッキが尽きるまで回せてしまう（2026-08-10 に実対戦で発覚）。
 // discardedSoFar / awaitingSkip は内部フィールド（awaitingSkip は「スキップされて戻ってきた＝破棄終了」の目印）
 | { type: "lendSelfThisTurn" } // このマジック自身を、このターンの間だけ自分の仮想発生源（PlayerState.turnVirtualInstances）として場に置いたものとして扱う。
 | { type: "targetChoiceLendThisTurn" } // 「スピリット1体は」（どちらの陣営でもよい）を選び、このターンの間その1体だけへ効果を貸す。colorChoiceLendThisTurnの対象インスタンス版（CardInstance.lentChoiceInstanceId）
 // 同じカードの他の効果エントリ（levels:null必須）が effectSources() 経由で継続効果として一斉に有効になる（TURN_EFFECT_SOURCES.md §3）
 // **1つのアクションにまとめてあるのが要点**：疲労（コスト）と貸与（効果）を別エントリに分けると確認が2回に割れて「疲労だけして効果が出ない」が起きる（2026-08-10 修正）
 // 既に疲労している場合は支払えないので不発（ログのみ）
 | { type: "lendSelfThisBattle" } // 積む先が PlayerState.battleVirtualInstances になるだけで、貸与の仕組みは同一
 // clearBattle でリセットされるため、同じターンの2回目のバトルには持ち越さない。効果テキストが「このバトルの間」のマジックはこちらを使うこと
 | { type: "trashReturnToHandInternal"; cardId: string; onceEffectId?: string; ask?: true } // **内部専用**：トラッシュの自分のカードを手札に戻す。ask＝持ち主に「戻しますか？」を聞く（非対話なら戻す）。trashReturnOnOwnSpiritDestroyed／trashReturnOnOwnHeavyExhaust の「手札に戻せる」（任意。2026-10-11 ユーザー確認）。onceEffectId＝同名ターン1回の枠（戻したときに取る）
 | { type: "summonFreeFromTrashIndexInternal"; trashIndex: number } // **内部専用**：トラッシュの指定位置のカードを、コストを支払わずに召喚する。trashSummonOnNameSummoned の確認に答えたときの解決に使う
 | { type: "resshinsokuFinishInternal"; handIndex: number; cardId: string; selfCores: number } // 【烈神速】の割り振りの後、余分の支払い待ちから召喚を再開する内部専用
 | { type: "trashSummonPaidInternal"; via: "fushi" | "fushiFree" | "mill"; cardId: string; trashIndex: number; freeNexusInstanceId?: string } // 【不死】（fushiFree＝魔門で無償）・ミノガメンの支払い待ち（effectCostPay）から、払い済みとして召喚を再開する内部専用
 | { type: "summonFreeIndexInternal"; zone: "hand" | "trash"; index: number; skipTensho?: true; skipOnSummon?: true; summonedBy?: string; destroyAtBattleEnd?: true; braveTargetInstanceId?: string } // **内部専用**：召喚の余分の支払い待ちを挟んだ無償召喚の続き（summonSurcharge.ts）。払い済みとして手札／トラッシュの指定位置を召喚する
 // count＝costBudgetの代わりに**枚数指定**（costFilterはcostBudget指定時と違い有効に効く。コスト最大から貪欲に選ぶ決定的簡略化、足りなければ可能な分だけ）
 // skipOnSummon指定時は召喚時効果を発揮させない
 // 自分のトラッシュのスピリットカード1枚をコストを支払わずに召喚（コスト最大、同コストは末尾＝新しい方から自動選択。決定的簡略化）。whileCombinedFilter＝【合体時】効果を持つカードのみ（静的に判定）。payCost＝**通常の召喚コストを支払う**（支払い元はリザーブ＋フィールドのコア＝paySources。払えないカードは候補にも出さない）。colorFilter省略時は色不問。維持コアはリザーブから置き、不足なら不発。この効果で召喚されたスピリットのonSummon効果は発揮されない。costBudget＝costFilterを省略でき、コスト合計がbudget以下で複数枚を召喚（コスト最大から貪欲、維持コアが払えなくなった時点で打ち切り）
 | { type: "nexusCoresToTrash"; side: "opponent" | "both" } // 指定側（相手/両陣営）のネクサスすべての上に置いてあるコアすべてを、各持ち主のトラッシュへ置く。ネクサスはコア0になっても消滅しない
 | { type: "drawUpTo"; size: number } // 自分の手札がsize枚になるまでデッキから引く（既にsize枚以上ならno-op。デッキ切れ判定はdrawへ委譲）
 | { type: "moveCoresLeavingOne"; anySide?: true; selfTarget?: true; allowNexusDest?: true } // 対象スピリット上のコアを1個だけ残し、それ以外を同じフィールドの別のスピリット（先頭側＝決定的簡略化）へ移す。移動先がいなければ不発。allowNexusDest＝スピリットがいなければ自分のネクサス（先頭側）へ
 | { type: "swapOpponentCores"; choosing?: true; firstChosen?: string } // 相手のスピリット2体の上のコアをすべて入れ替える。効果文が「相手のスピリット2体を**指定する**」なので、実対戦では2体とも持ち主が選ぶ（2026-08-24。自動選択は実効BP上位2体）。choosing/firstChosen は内部専用（choosing が無い targetInstanceId は誘発が渡すイベント対象なので取り違えない）。スピリットが2体未満、またはコア数が同じなら不発。入れ替えの結果、維持コア（Lv1）を下回った側は消滅する
 | {
 type: "summonRepeatFromHand"
 mode: "free" | "paid" // free＝summonFromHandFreeと同じくコストを支払わず維持コアのみリザーブから払う（extraReserveCostPerSummon＝1体ごとにさらにリザーブのコアをその数だけ自分のトラッシュへ）。paid＝effectiveCostで通常のコストを計算し、手札をまとめて選び（対話時）、合計コスト＋召喚の余分1回を1回で払って一括召喚（summonRepeat.ts）
 familyFilter?: FamilyFilter
 costFilter?: { max?: number; min?: number }
 extraReserveCostPerSummon?: number
 // choosing/chosenIdx/prepaid は paid の選択の途中経過を持ち回る内部専用。prepaid＝合計コストを支払い待ちで払い済み
 choosing?: true
 chosenIdx?: number[]
 prepaid?: true
 // 【転召】の対象は決定のあと・支払いの前に選ぶ（2026-10-15 ユーザー確認）。confirmed＝決定済み、tenshoPicks＝chosenIdx と同じ並びの対象（null＝転召なし・対象なし）、tenshoRest＝召喚後に残っている転召
 confirmed?: true
 tenshoPicks?: (string | null)[]
 tenshoRest?: { name: string; targetId: string; dest: "trash" | "void" }[]
 } // 自分の手札のスピリットカードを、リザーブが続く限り好きなだけ召喚（1体あたりの必要リザーブが小さいものから貪欲に選び、召喚数を最大化する決定的簡略化）。この効果で召喚されたスピリットのonSummon効果は発揮されない
 | { type: "destroyByBpBudget"; budget?: number; maxCount?: number; budgetFromSelfBp?: true; budgetFromFamilyBpSum?: FamilyFilter; choosing?: true; chosenIds?: string[] }
 // 相手スピリットを、**実効BP合計**がbudgetを超えない範囲で好きなだけ破壊。budgetFromSelfBp＝selfの実効BPを予算に。budgetFromFamilyBpSum＝指定系統（配列＝OR）を持つ**自分の**スピリットの実効BP合計を予算に（どちらもbudgetを無視）。choosing/chosenIdsは内部専用（budgetToggleDestroy）
 | { type: "destroyByCostBudget"; budget: number; budgetCounter?: EffectCounter; choosing?: true; chosenIds?: string[] } // 相手スピリットを、コスト合計がbudgetを超えない範囲で好きなだけ破壊。実対戦では**トグル式で選ばせる**（クリックで選択／再クリックで解除、合計はpromptに出し「これで破壊する」で確定。2026-08-24ユーザー確定）。choosing/chosenIdsは内部専用。自動選択は残り予算内でコスト最大から貪欲（同コストは実効BP最大）。budgetCounter＝実際の予算をbudget×counter値で算出。転召で上限が変わるカードは、対象の記録が必要になるため簡略化してbudget=5固定
 | { type: "forceEndMainStep"; who?: "opponent" | "turnPlayer" } // 相手がいま自分のメインステップなら、強制的にアタックステップへ進める（PhaseManager.toAttackPhase。ターンを飛ばすのではなく召喚・ネクサス配置ができなくなるだけ）。発動条件はこれを使う側の fieldEvent/triggered が持つ。who省略時は"opponent"（発生源の持ち主から見た相手のメインステップだけ）。"turnPlayer"＝誰のターンかを問わずメインステップにいれば強制終了（自分がマジックを使っても自分のメインステップが終わる）
 | { type: "grantHostUnblockableThisTurn" } // このターンの間、**このブレイヴ（self）がいま合体しているホスト**はブロックされない（target.kind:"braveHost" で記録し、読むたびにホストを引き直す。self＝ブレイヴ自身が必須）
 | { type: "skipBpCompare" } // バトル解決時まで進め、BP の比較（とその結果の破壊）だけを飛ばす（TIMING_CHART §1.12）。ただちに終わらせるのは endBattle
 | { type: "millUntilMagicCastFree"; maxCount?: number; discardCardType: "spirit" | "nexus" | "magic" } // 自分の手札の指定種別カード1枚を破棄して（任意コスト。該当なしはno-op）、自分のデッキを上からマジックカードが出るまで破棄し、出たらそのフラッシュ効果をコストを支払わずに発揮する（出ないままデッキ切れなら何も起きない）。maxCountは**省略時は上限なし**（デッキ枚数に上限が無いため、固定値を書くと原文に無い天井になる）
 | { type: "opponentLifeToReserve"; count: number } // お互いのフィールド+リザーブ+トラッシュのコア合計を比べ、多かった方の持ち主が、少ない方と同じ合計になるまでボイドへ置く（同数なら不発）。取り先は多かった方が選ぶ（coresDownToLimit へ委譲。CHOOSER_RULES.md）

// selfBuff / bpBuff / voidCoreToSelf / draw / coreGain 共通のカウンタ定義。
// { ownFamily: string } は自分のフィールドの指定系統スピリット数、{ ownNameIncludes: string } は
// 自分のフィールドでカード名にこの文字列を含むスピリット数（いずれも onDestroy 等では発火時点で
// selfはすでにフィールドから除去されているため、self自身はカウントに含まれない）
