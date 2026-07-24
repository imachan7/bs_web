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
export type CardType = "spirit" | "nexus" | "magic"

// デッキの指定方法: DECK_RECIPES の色キー（"red" 等）またはカスタムデッキのカードリスト（cardId -> 枚数）
export type DeckSpec = string | Record<string, number>

// スピリット/ネクサスのレベル定義（ネクサスは bp: 0）
export interface LevelDef {
    level: number
    cores: number
    bp: number
}

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

// 効果の実行内容。EffectModules のアクションハンドラと 1:1 で対応する。
// 新しい効果を足すときは「ここに型を追加」→「ハンドラを追加」の2手で完結する。
export type EffectAction =
    | { type: "draw"; count: number } // 自分がデッキから引く
    | { type: "destroy"; maxBp?: number; count: number; keywordFilter?: Keyword; bpEqualsSelf?: boolean; costFilter?: { max?: number; min?: number } } // 相手スピリットを破壊（maxBp 省略=BP不問、keywordFilter=指定キーワード持ちのみ、bpEqualsSelf=selfと実効BPが同じ相手のみ。selfがnullならno-op。costFilter指定時は対象スピリットのコストがmax以下/min以上のみ。BS04風龍王フージャオス）
    | { type: "destroyAll"; maxBp: number; anySide?: boolean; colorExclude?: Color } // BP以下の相手スピリットを全破壊。anySide指定時は両陣営が対象、colorExclude指定時はその色のスピリットを除外する（BS04魔龍帝ジークフリードLv3：赤以外のBP4000以下すべて）
    | { type: "selfBuff"; amount: number } // このスピリット自身をBP+（ターン終了時まで）
    | { type: "destroyNexus"; count: number; drawPerDestroyed?: number; all?: boolean } // 相手のネクサスを破壊（drawPerDestroyed指定時は実際に破壊できた数×ドロー）。all指定時はcountを無視し相手のネクサスすべてを破壊する（BS04風龍王フージャオス）
    | { type: "returnSelfToHand" } // このスピリットを持ち主の手札に戻す
    | { type: "coreRemove"; count: number; dest?: "void" } // 対象スピリットのコアを持ち主のリザーブへ置く（dest:"void"指定時はリザーブでなくボイドへ＝消滅。BS04ヴェノムショット）
    | { type: "bpBuff"; amount: number; attackingAll?: boolean; familyFilter?: FamilyFilter; minSymbols?: number } // 対象スピリット1体をBP+（ターン終了時まで）。attackingAll:true なら対象選択せず「アタックしている自分のスピリットすべて」をBP+（現エンジンは同時アタック1体のためアタッカーへ適用。オフェンシブオーラ BS01-116。familyFilter指定時は該当系統持ちのみ＝フォレストオーラ）。minSymbols指定時、対象（targetInstanceId明示・自動選択とも）はシンボル数がこれ以上のスピリットのみ有効（ライトニングバリスタ等）
    | { type: "exhaust"; count: number; levelFilter?: number[]; costFilter?: { max?: number; min?: number } } // 相手スピリットを疲労させる（levelFilter指定時はcurrentLevelが含まれるスピリットのみ対象。costFilter指定時は対象スピリットのコストがmax以下/min以上のみ。自動選択・明示ターゲット選択の両方に適用）
    | { type: "destroyExhausted"; count: number; anySide?: boolean; costFilter?: { max?: number; min?: number } } // 疲労状態の相手スピリットを破壊（anySide指定時は両陣営の疲労スピリットから実効BP最大の1体を自動選択して破壊。costFilter指定時は対象スピリットのコストがmax以下/min以上のみ。BS04ヘルウィッチ）
    | { type: "drawPer"; counter: EffectCounter } // カウント値ぶん自分がドロー（0ならログのみ）
    | { type: "bpBuffPer"; counter: EffectCounter; amountPer: number } // 対象スピリット1体を「カウント値×amountPer」だけBP+（0ならログのみ）
    | { type: "discardHandAll" } // 自分の手札をすべてトラッシュへ
    | { type: "bpBuffAll"; amount: number; familyFilter?: FamilyFilter } // 自分のフィールドのスピリットすべてをBP+（ターン終了時まで。familyFilter指定時は指定系統持ちのみ。配列＝いずれかの系統でOR）
    | { type: "returnToHand"; count: number } // 対象スピリットを持ち主の手札に戻す（破壊ではないためonDestroyは誘発しない）
    | { type: "returnToDeckTop" } // 対象スピリットを持ち主のデッキの一番上に戻す
    | { type: "coreCharge"; count: number } // 自分のリザーブから対象の自分スピリットへコアを最大count個置く
    | { type: "lifeCharge"; count: number } // 自分のリザーブから自分のライフへコアをcount個置く（不足なら可能な分だけ）
    | { type: "coreGain"; count: number } // ボイドから自分のリザーブへコアをcount個追加
    | { type: "refreshAllOwn" } // 自分の疲労スピリットをすべて回復。回復した個体はこのターン中アタック不可
    | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
    | { type: "swapBattler" } // バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える（テレポートチェンジ。バトル外・使用者がバトル非参加・疲労スピリット不在はno-op）
    | { type: "exhaustAllByColor" } // 相手フィールドで最多の色を自動選択し、その色を持つ両陣営のスピリットを疲労させる
    | { type: "exhaustAll"; side: "opponent" | "both"; minBp?: number; maxBp?: number } // 指定側（相手/両陣営）のスピリットをBP範囲（minBp以上/maxBp以下）で疲労させる。装甲・疲労免疫は相手側のみ尊重（BS04グラウンドハウリング）
    | { type: "returnAllToHand"; side: "opponent" | "both"; costFilter?: { max?: number; min?: number } } // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（バウンス＝onDestroy不発火。装甲/免疫は相手側のみ尊重。BS04ドリームハンド）
    | { type: "refreshByFamily"; familyFilter: FamilyFilter; count: number } // 自分の疲労スピリットのうちfamilyFilter一致（配列=OR）をcount体まで回復（実効BP最大から。cantAttackThisTurnは付与しない。BS04ハイエーテル）
    | { type: "trashCoresToKeywordSpirit"; keyword: Keyword } // 自分のトラッシュのコアすべてを、指定キーワードを持つ自分のスピリット1体へ置く（候補複数かつinteractiveならpendingChoice、そうでなければ実効BP最大へ。BS04グレートリンク）
    | { type: "lockFlash" } // バトル中のみ有効：このバトルの間、相手はフラッシュで手札のカードを使用できなくする
    | { type: "returnNexusToHand"; count: number } // 相手のネクサスを持ち主の手札に戻す（破壊ではない）
    | { type: "reclaimTrashCores" } // 自分のtrashCoresをすべてリザーブへ（0ならログのみ）
    | { type: "refreshSelf" } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）
    | { type: "lifeCrush"; count: number } // 相手のライフのコアcount個を相手のリザーブへ（ライフ0以下で勝敗決定）
    | { type: "voidCoreToSelf"; count: number } // ボイドからコアcount個をこのスピリット上に置く（selfがnullならno-op）
    | { type: "voidCoreToSelfPer"; counter: EffectCounter } // カウント値ぶんボイドからこのスピリット上にコアを置く（0ならno-op）
    | { type: "discardOpponent"; count: number; forcedTargetPid?: PlayerId } // 相手の手札からcount枚を破棄（手札末尾から。手札が足りなければある分だけ）。interactiveTargets時は選択式（選択者は破棄される相手本人）。forcedTargetPidは選択式再突入時のみ内部で設定する対象プレイヤー（cards.jsonには書かない。選択者=破棄される側のためresolveActionのowner引数がopponentOf(owner)で逆算できなくなるのを避ける）
    | { type: "refreshOne"; keywordFilter?: Keyword; colorFilter?: Color; vanillaFilter?: true; familyFilter?: string; all?: boolean; excludeSelf?: boolean } // 自分の疲労スピリット1体を回復（keywordFilter/colorFilter/vanillaFilter/familyFilter指定時はそれぞれの条件持ちのみ。familyFilterはspiritHasFamily判定＝付与系統も考慮。候補から実効BP最大を自動選択、いなければno-op）。all指定時は該当候補すべてを回復し cantAttackThisTurn は付与しない（決闘台地Lv2／鋼に覆われた高空／ベル・ダンディア）。excludeSelf指定時は候補からself自身を除外する（BS04風龍王フージャオス：自身も系統「翼竜」だが対象外）
    | { type: "coreRemoveSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のリザーブへ（selfがnullならno-op）
    | { type: "selfBuffPer"; counter: EffectCounter; amountPer: number } // このスピリット自身を「カウント値×amountPer」だけBP+（ターン終了時まで。selfがnull/カウント0はno-op）
    | { type: "voidCoreToOther"; count: number } // ボイドからコアcount個を、self以外の自分のスピリットのうち実効BP最大の1体に置く（候補がいなければno-op）
    | { type: "coreSqueezeAll" } // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ（1個未満で維持コア割れになる場合は消滅処理を適用）
    | { type: "endAttackStepAfterBattle" } // バトル中のみ：このバトルが終了したときアタックステップを終了するフラグを立てる（バトル外はno-op）
    | { type: "coreToTrashSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のトラッシュへ（維持コア割れの消滅処理を含む。selfがnullならno-op）
    | { type: "recoverSpiritFromTrash"; count: number } // 自分のトラッシュにあるスピリットカードをcount枚、手札に戻す（末尾＝新しい方から自動選択。本来は選択の簡略化。該当なしはno-op）
    | { type: "coreSqueezeOne"; count: number } // 相手フィールドの実効BP最大のスピリットをcount体選び、それぞれコアを1個だけ残して超過分を持ち主のリザーブへ（coreSqueezeAllの単体版。対象なしはno-op）
    | { type: "coreToVoidOwn"; count: number } // 自分のコアcount個をボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ自分フィールドのスピリット（実効BP最小）から取る。維持コア割れは消滅処理
    | { type: "bothSidesCoreToTrash"; count: number } // 両プレイヤーのフィールドから各自の実効BP最大スピリット1体を選び、そのコアcount個を各持ち主のトラッシュへ（維持コア割れは消滅処理。片側のみ対象がいてもその側は処理する）
    | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
    | { type: "coreDrainAllOthers" } // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ（両陣営）。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）
    | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する（フェザーバリア）
    | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する（バーストファイア）
    | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない。妖機妃ソール）
    | { type: "deckReveal"; count?: number; pickType?: CardType; countPer?: { ownColorTotal: Color }; pickAllOfType?: "magic" } // 自分のデッキ上からcount枚（countPer指定時は自分の指定色スピリット/ネクサス合計数。countと排他）を公開し、pickTypeに一致する最初の1枚（省略時は先頭。pickAllOfType指定時は一致するすべて）を手札に加える。残りは元の順でデッキの下に戻す（スワロウアイヴィー／大天使ミカファール）
    | { type: "coreGainPer"; counter: EffectCounter } // カウント値ぶんボイドから自分のリザーブへコアを追加（0ならログのみ。宝石の獣カーバルク）
    | { type: "refreshAllByCost"; cost: number } // 両陣営のコストが一致するスピリットすべてを回復させる（refreshAllOwnと異なりcantAttackThisTurnは付与しない。ローヤルポーション）
    | { type: "destroyOwnByCost"; maxCost: number; gainCoresEqualCost?: boolean } // 自分のフィールドからself以外でコスト<=maxCostのうちコスト最大の1体を破壊する（プレイヤー選択の簡略化＝決定的選択）。gainCoresEqualCost指定時は破壊したスピリットのコストと同数のコアをボイドから自分のリザーブへ（天使長プリンシパール）
    | { type: "grantKeyword"; keyword: Keyword; colors?: Color[] } // 自分のスピリット1体に、このターンの間キーワードを付与する（targetInstanceId優先、フォールバックはバトル中の自分スピリット→自分フィールド先頭。スピリットリンク／インビンシブルシールド）
    | { type: "exhaustAllByLevel"; level: number | "lastBattleDestroyed" } // 両陣営のcurrentLevelが一致するスピリットをすべて疲労させる（疲労済みはno-op）。"lastBattleDestroyed"指定時はstate.lastBattleDestroyedLevelを使用（0なら不発。魔界伯爵ヴィール）
    | { type: "destroyAllExceptChosenColors" } // お互い自分フィールドで最多のスピリット色を1色ずつ自動指定し、両陣営のどちらの指定色でもないスピリットをすべて破壊（プレイヤー選択の簡略化）
    | { type: "destroySelf" } // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
    | { type: "refireSummonEffect" } // 対象の自分スピリット1体（targetInstanceId優先、フォールバックは自分フィールド先頭）のonSummon効果を再発揮する（タイムリープ）
    | { type: "recoverMagicFromTrash" } // 自分のトラッシュにあるマジックカード1枚（末尾＝新しい方）を手札に戻す（トリックスター）
    | { type: "trashCoresToSpirit"; count?: number } // 自分のトラッシュのコアを対象スピリットへ置く（count省略=全部、不足時は可能な分。対象はtargetInstanceId優先、フォールバックはself→自分フィールド先頭）
    | { type: "grantKeywordAll"; keyword: Keyword; colors?: Color[]; costFilter?: number } // 自分のスピリット全員（costFilter指定時はコスト一致のみ）に、このターンの間キーワードを付与する（リフレクションアーマー）
    | { type: "banActByCostThisTurn"; maxCost: number } // このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可にする（ヘビィゲート）
    | { type: "deployNexus"; from: "hand" | "trash"; colors: Color[]; all?: boolean } // 手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに自分のフィールドに配置する（該当なしはno-op。スコルピード／白虎ハック／黒虎クロン）。all指定時は該当するネクサスカードをすべて配置する
    | { type: "sacrificeNexusThenWipeEnemyNexusCores" } // 自分のネクサス1つ（コア数最小、同数は配列先頭）を破壊し、相手の全ネクサス上のコアを相手のトラッシュへ置く（自分のネクサスが無い/破壊耐性で不発なら何もしない。プレイヤー選択の簡略化。サクリファイス）
    | { type: "levelOverrideOpponentNexuses"; level: number; costReserveToVoid?: number } // 相手の全ネクサスの levelOverrideThisTurn を level に設定（このターンの間）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから適用する（「できる」の任意発動は自動発動で簡略化。皇帝アンプルール）
    | { type: "summonFromHandFree"; colorFilter?: Color; sameFamilyAsSelf?: boolean } // 自分の手札にあるスピリットカードのうち条件（colorFilter一致／sameFamilyAsSelf=selfと系統1つ以上共通）を満たすコスト最大の1枚（同コストは手札の先頭側）を、コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットの onSummon 効果は発揮されない（老賢樹トレントン／竜戦車アースガルド）
    | { type: "destroyAllNexusesExceptChosenColors"; minTotalColors: number } // 両者フィールドのネクサスの色数合計（重複除く）がminTotalColors未満なら不発（ログのみ）。成立時はお互い自分フィールドで最多のネクサス色を1色自動指定し（同数はColor定義順の先頭、ネクサス0の側は指定なし）、どちらの指定色でもないネクサスをすべて破壊する（destroyAllExceptChosenColorsのネクサス版。色選択の決定的簡略化。溶海竜プレシオス）
    | { type: "destructionCoresToOwnSpirit" } // 破壊時：selfが破壊直前に置いていたコア数（coresAtDestruction）ぶんを、持ち主のリザーブから自分の実効BP最大のスピリットへ移す（destroySpiritがリザーブへ移した分の付け替え。対象がいなければリザーブに残る。対象選択の決定的簡略化。盾精ラングリーズ）
    | { type: "levelOverrideTarget"; level: number } // 対象（targetInstanceId）のlevelOverrideThisTurnをlevelに設定する（このターンの間。花の子リップ）
    | { type: "coreToOpponentTrashChoice"; count: number } // 相手のスピリット1体かネクサス1つを選び、コアcount個を相手のトラッシュへ置く（targetInstanceId省略時は候補を集めてpendingChoiceを要求し、指定時はその対象へ実行する。スピリットは維持コア割れで消滅、ネクサスは消滅させない。魔界侯爵コキュートス）
    | { type: "battleCompareByLevel" } // 現在のバトル（state.battle）にフラグを立て、解決時にBPの代わりにLvを比較させる（バトル外は不発。エンジェルボイス）
    | { type: "grantAlsoCostAll"; cost: number } // 自分のスピリットすべての tempAlsoCosts に cost を追加する（このターンの間、実コストに加えてこのコストとしても扱われる。道化師クラン）
    | { type: "grantColorChoice" } // 対象選択→色選択の2段階choiceを経て、選ばれた対象のtempColorsに選ばれた色を追加する（フラッシュ：スピリット1体にもう1色与える。アディショナルカラー）
    | { type: "grantFamilyChoiceAll"; targetFamily: string } // targetFamily持ちが自分のフィールドに1体もいなければ不発。いれば全系統からのoption choiceを経て、targetFamily持ち全員のtempFamiliesに選ばれた系統を追加する（このターンの間。音鳥クルーク）
    | { type: "linkNexusCoresChoice" } // 自分のネクサス1つを指定するtarget choice（optional=スキップ可）。指定されたネクサスのcoresLinkedToにselfのinstanceIdを設定する（selfがnullなら不発。クロスシザース）
    | { type: "mill"; count: number; side?: "own" } // 相手（side:"own"指定時は自分）のデッキを上からcount枚トラッシュへ送る（【粉砕】。不足時は可能な分だけ）
    | { type: "millPer"; counter: EffectCounter; side?: "own" } // カウント値ぶん相手（side:"own"指定時は自分）のデッキをトラッシュへ送る（0ならログのみ）
    | { type: "destroyAllNexusesWithCores" } // コアが1個以上置かれている両陣営のネクサスをすべて破壊する（nexusIndestructible等の破壊耐性はdestroyNexus内で尊重。フレイム・エルク）
    | { type: "voidCoreToAllOwnByFamily"; families: string[]; count: number } // ボイドからコアcount個ずつを、指定系統のいずれかを持つ自分のスピリットすべての上に置く（太陽花ゾンネ・ブルム）
    | { type: "voidCoreToTarget"; count: number } // ボイドからコアcount個を対象の自分スピリットの上に置く（targetInstanceId優先、未指定時は自分の実効BP最大。ポーションベリー）
    | { type: "refreshByFamilyAuto"; count: number } // 疲労中の自分スピリットの最多系統を自動指定し、その系統の疲労スピリットを最大count体回復させる（プレイヤー選択の決定的簡略化。cantAttackThisTurnは付与しない。フロックリカバリー）
    | { type: "selfBuffByHandDiscard"; discardCardType: "spirit" | "nexus" | "magic"; amount: number } // 手札の指定種別カード1枚を破棄することで、このスピリット自身をBP+amountできる（任意コスト。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）で破棄カードを選ぶ、自動時は手札末尾の該当カードを破棄して発動。該当カードなしはno-op。城壊しのデニス／島持ちのフランシス）
    | { type: "grantKeywordToHandCard"; keyword: Keyword; familyFilter?: string; cardType?: "spirit" | "nexus" | "magic" } // 手札の条件一致（cardType/familyFilter）カード1枚に、このターンの間キーワードを付与する（PlayerState.tempHandKeywordGrants。interactiveTargets時はcard choiceで選択、自動時は手札末尾の該当カード。該当なしはno-op。付与はcardId単位＝同名重複カードにも効く簡略化。ビートプリースト）
    | { type: "coreTradeToOpponentTrash" } // 自分のリザーブのコアをX個自分のトラッシュへ置き、同数だけ相手のリザーブのコアを相手のトラッシュへ置く（Xの上限はmin(自分のリザーブ,相手のリザーブ)。interactiveTargets時はkind:"option"のoption choice（「1個」〜「上限個」、optional=スキップ可＝0個）、自動時は上限個。ポイズンミスト）
    | { type: "voidCoreToOwnNexuses"; colorFilter?: Color; count: number } // ボイドからコアcount個ずつを、指定色（省略時は色不問）の自分のネクサスすべての上に置く（該当ネクサス0はログのみ。ボルカノ・ゴレム）
    | { type: "grantColorAll"; color: Color } // このターンの間、自分のスピリットすべての tempColors に color を追加する（妖精ティングリー）
    | { type: "addSymbolThisTurn" } // 対象の自分スピリットの tempExtraSymbols をこのターンの間+1する（targetInstanceId優先、未指定時は自分の実効BP最大。「自分か相手」は自分側のみの簡略化。ダブルハート）
    | { type: "levelUpThisTurn" } // 対象の自分スピリットの levelOverrideThisTurn を currentLevel+1（カードの最大Lvでキャップ）に設定する（targetInstanceId優先、未指定時は自分の実効BP最大。「自分か相手」は自分側のみの簡略化。ビルドアップ）
    | { type: "discardOpponentDownTo"; limit: number } // 相手の手札がlimit枚を超えている場合、limit枚になるまで破棄する（既存discardOpponentへcount=手札枚数-limitを計算して委譲。0以下は不発。奇術師オリバー）
    | { type: "bpBuffByExhaustOwn" } // 回復状態の自分スピリット1体を疲労させ、このターンの間、自分のスピリット1体をその実効BP分バフする（interactiveTargets時は疲労元→バフ先の2段choice、自動時は実効BP最大の回復スピリットを疲労させバトル中の自分スピリット（いなければフィールド先頭）をバフ。回復スピリットがいなければ不発。ユナイテッドパワー）
    | { type: "exhaustOpponentToMatch" } // 自分の疲労スピリット数と同数になるまで相手のスピリットを疲労させる（差分=自分の疲労数-相手の疲労数。0以下は不発。既存exhaustの単体処理へcountを渡して委譲し、armor/免疫/interactive choiceを自然に通す。セイムタイアード）
    | { type: "tenshoCoreDump"; dest: "trash" | "void" } // 【転召】のpendingChoice再開専用（cards.jsonには書かない）。targetInstanceIdで指定された自分のスピリットの上のコアすべてをdestへ（trash=持ち主のトラッシュ、void=消滅）。維持コア割れは既存の消滅処理（destroySpirit "deplete"）に委ねる
    | { type: "handMagicToTegamotoDraw" } // 自分の手札にあるマジックカードを好きなだけ手元（PlayerState.tegamoto）に置き、置いた枚数ぶんデッキから引く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行（選ぶたび1枚移動+1ドローし、手札にマジックカードが残っていれば再度choiceを発行。スキップで終了）。自動時は該当カードすべてを一括移動して同数ドロー（決定的簡略化）。マジックブック
    | { type: "discardOpponentTegamotoDestroyPer" } // 相手の手元（tegamoto）にあるカードすべてを相手のトラッシュへ破棄し、その枚数を既存のdestroyアクション（count=枚数、maxBpなし=BP不問）へ委譲して相手スピリットを破壊する（interactive時の連続対象選択・装甲/免疫判定はdestroy側の経路をそのまま再利用）。相手の手元が0枚ならno-op。透明人間エクリア
    | { type: "coreToTrashAllByCost"; maxCost: number } // 相手のコストmaxCost以下のスピリットすべての上から、コア1個ずつを相手のトラッシュへ置く（範囲効果。装甲・マジック効果耐性・immuneToOpponentThisTurnは対象から除外。BS04風龍王フージャオス）
    | { type: "coreRemovePerHandDiscard" } // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき相手のスピリット1体（実効BP最大を自動選択、同一解決内で既に選んだ個体は除外して異なる個体へ広げる）のコアを1個、相手のトラッシュへ置く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行し、選ぶたび即座にコア除去を実行する（対象選択自体は毎回自動）。自動時は手札をすべて破棄し、破棄枚数ぶん一括でコア除去する（決定的簡略化）。王蛇ケツァルカトル／ダンスマカブル

// selfBuffPer / bpBuffPer / voidCoreToSelfPer / drawPer / coreGainPer 共通のカウンタ定義（BS03バッチで統一）。
// { ownFamily: string } は自分のフィールドの指定系統スピリット数、{ ownNameIncludes: string } は
// 自分のフィールドでカード名にこの文字列を含むスピリット数（いずれも onDestroy 等では発火時点で
// selfはすでにフィールドから除去されているため、self自身はカウントに含まれない）
export type EffectCounter =
    | "readyEnemies" // 相手フィールドの回復状態スピリット数
    | "exhaustedEnemies" // 相手フィールドの疲労状態スピリット数
    | "opponentHand" // 相手の手札枚数
    | "ownOtherSpirits" // self以外の自分フィールドのスピリット数
    | "ownReserve" // 自分のリザーブのコア数
    | "ownNexuses" // 自分のネクサス数
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "selfCoresAtDestruction" // 破壊時点でこのスピリット上に置かれていたコア数（destroySpiritが破壊直前に記録。漆黒鳥ヤタグロス）
    | "lastBattleDestroyedCores" // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（GameEngine.resolveBattleが記録、次のバトル解決の冒頭でリセット。魔界七将デストロード）
    | "opponentTrashCores" // 相手のトラッシュに置かれているコア数（PlayerState.trashCores。BS04吸血鬼ダンピール）
    | { ownFamily: string }
    | { ownNameIncludes: string }
    | { ownColor: Color } // 自分のフィールドの指定色スピリット数

// 誘発イベント（data.md 5.1 のイベント層）。
// ルール追加時はまず既存イベントで表現できるか検討する。
export type TriggerEvent =
    | "onSummon" // 召喚時
    | "onAttack" // アタック時
    | "onDestroy" // 破壊時
    | "onBattle" // バトル時
    | "onBlock" // ブロック時
    | "onBlocked" // アタック中の自分スピリットが相手のブロック宣言を受けたとき（self=アタッカー）
    | "onBattleEnd" // バトル終了時（GameEngine.resolveBattleの最後。バトル参加者のうちまだ生存している個体に発火。コリスタル）
    | "onLifeDealt" // このスピリットのアタックによって相手のライフを減らしたとき（アタッカー側で発火。老賢樹トレントン）

// フィールドイベント誘発（data.md 5.1 のイベント層の追加分）。
// TriggerEvent は「効果の発生源となったスピリット自身に起きたこと」を起点とするが、
// fieldEvent は「フィールド上の他のスピリットに起きたこと」に対してネクサス等が反応する場合に使う
// （相手によってライフが減った／自分のスピリットが破壊された、など）。
export type FieldEvent =
    | "ownLifeDamaged" // 相手によって自分のライフが減らされたとき
    | "ownSpiritDestroyed" // 自分のスピリットが破壊されたとき
    | "anySpiritAttacked" // 両陣営どちらかのスピリットがアタックを宣言したとき（self はアタックしたスピリット。魔帝の墓標Lv2）
    | "opponentDrew" // 持ち主から見て相手がデッキからカードをドローしたとき（GameState.draw から発火。シダフクロウ）
    | "anyNexusDestroyed" // 自分か相手を問わず、フィールドのネクサスが破壊されたとき発火（バウンス returnNexusToHand は対象外）
    | "ownNexusDestroyed" // 自分のネクサスが破壊されたとき、持ち主側のフィールドから発火（バウンス returnNexusToHand は対象外。シャークハンマー）
    | "ownMagicUsed" // 自分がマジックの効果を使用したとき（resolveMagicの効果実行後に発火。緑芽吹く原野）
    | "ownSpiritBlocked" // 自分のスピリットが相手のブロック宣言を受けたとき、持ち主のフィールド発生源から発火（targetInstanceId=ブロッカー。花の子リップ）
    | "ownFunsaiMilled" // 自分のスピリットの【粉砕】が相手のデッキをトラッシュへ送ったとき（発火は粉砕解決ごとに1回。repeatPerCount指定時は実破棄枚数ぶんアクションを繰り返す）
    | "opponentHandAdded" // 持ち主から見て相手の手札にカードが加えられたとき（notifyHandGainedから発火。犬人マードック／英雄の喪失）
    | "ownSpiritCoresRemovedByOpponent" // 自分のスピリット上のコアが相手の効果でリザーブ/トラッシュへ置かれたとき（eventCount=影響を受けた自分のスピリット数。極光の大地）

// キーワード効果。今後同名キーワードを持つカードが多数追加されるため、
// カードデータには名前だけを持たせ、挙動は EffectModules のレジストリで解決する。
export type Keyword =
    | "soku" // 神速：手札からフラッシュタイミングで召喚できる
    | "awaken" // 覚醒：フラッシュタイミングで自分のスピリットのコアを集められる
    | "clash" // 激突（将来弾用に予約）
    | "armor" // 装甲（将来弾用に予約）
    | "jugeki" // 呪撃：アタック時、ブロックした相手スピリット1体をバトル終了時に破壊
    | "funsai" // 粉砕：アタック時、相手のデッキを上からこのスピリットのLvと同じ枚数破棄する
    | "kobo" // 光芒：アタック時、バトル終了時に自分がこのバトルで使用したマジックカードすべてを手札に戻す
    | "tensho" // 転召：召喚コスト支払い後、指定コスト以上の自分のスピリット1体の上のコアすべてを指定場所（トラッシュ/ボイド）に置く

// 常時BP修正（オーラ）のカウンタ。発生源の持ち主基準で数える。
export type AuraCounter =
    | "ownReserve" // 自分のリザーブのコア数
    | "ownNexuses" // 自分のネクサス数
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | { ownFamily: string } // 自分フィールドの指定系統を持つスピリット数（発生源自身も含む）
    | { ownNameIncludes: string } // 自分フィールドでカード名にこの文字列を含むスピリット数（発生源自身も含む。アルカナプリンス・オベロ）

// 常時BP修正（オーラ）の発動条件。満たすときのみ amount を適用する。
export type AuraCondition =
    | { hasOwnColor: Color } // 自分フィールドに指定色のスピリットまたはネクサスがある
    | { hasOwnColorSpirit: Color } // 自分フィールドに指定色のスピリットがいる
    | { hasOwnFamily: string } // 自分フィールドに指定系統のスピリットがいる（自身を含んでよい）
    | "ownReserveNotEmpty" // 自分のリザーブが1個以上
    | { ownHasKeyword: Keyword } // 自分フィールドに指定キーワードを持つスピリットがいる（spiritHasKeywordで判定、付与キーワードも考慮。ブロントライデント）

// 常時BP修正の定義
export interface AuraDef {
    type: "bp"
    target: "self" | "ownAll" // 発生源自身のみ / 発生源の持ち主のスピリットすべて
    colorFilter?: Color // ownAll 用: この色のスピリットのみ
    battlingOnly?: boolean // バトル中（アタッカーまたはブロッカー）のスピリットのみ
    amount?: number // 固定量（condition と併用可）
    amountPer?: number // counter × amountPer の可変量
    counter?: AuraCounter
    condition?: AuraCondition // 満たすときのみ amount を適用
    summonedThisTurnOnly?: boolean // ownAll 用: 対象の summonedTurn === state.turn のスピリットのみ（このターン召喚されたスピリットに限定）
    keywordFilter?: Keyword // ownAll 用: 指定キーワード（静的付与・一時付与・keywordGrant すべて含む）を持つスピリットのみ（暴双龍ディラノス）
    phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // target問わず適用: 指定ステップかつ指定turn条件（own=発生源の持ち主がturnPlayer、opponent=持ち主が非turnPlayer、both=常に）のときのみ有効（アルマ・ジール／エメラルドに輝く鍾乳洞／アルカナプリンス・オベロ）
    minCores?: number // ownAll 用: 対象スピリットのコア数がこれ以上のときのみ有効（エメラルドに輝く鍾乳洞）
    costFilter?: number // ownAll 用: 対象スピリットのコストがこれと一致するときのみ有効（太古の断層）
    familyFilter?: string // ownAll 用: 指定系統（静的付与・familyGrant による付与を含む。spiritHasFamily で判定）を持つスピリットのみ（ポム）
    vanillaFilter?: true // ownAll 用: カードに効果の記述を持たない（バニラ）スピリットのみ（無法者の荒野）
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

// ブロック可否などの制約定義（RuleValidator が参照する宣言的ルール）
export type ConstraintDef =
    | { type: "cantBlock" } // このスピリットはブロックできない
    | { type: "cantBlockLowerBp" } // 自分より実効BPが低いアタッカーをブロックできない
    | { type: "unblockableBy"; colorFilter?: Color; keywordFilter?: Keyword; maxCores?: number; levelFilter?: number[]; costNot?: number } // このスピリットのアタックは、指定色／指定キーワード持ち／コア数がmaxCores以下／currentLevelがlevelFilterに含まれる／コストがcostNot以外のスピリットにブロックされない
    | { type: "mustAttack" } // このスピリットはアタックできるとき、必ずアタックしなければならない
    | { type: "untargetableByOpponent" } // このスピリットは相手のスピリット/マジックの効果の対象にならない（クイーン・ワルキューレ。範囲効果には無力）
    | { type: "canDirectAttack"; targetFilter: "rested" | "singleCore" | "recovered" } // 相手スピリット1体を指定してアタックできる（targetFilter: rested=疲労状態のみ、singleCore=コア1個のみ、recovered=回復状態のみ。イリュージョナ／牛霊スモゥグ／オルカリア）
    | { type: "cantAttack" } // このスピリットはアタックできない（カイザレオン大帝Lv1）
    | { type: "lifeDamageToVoid" } // このスピリットがアタッカーとしてライフダメージを与えるとき、相手のライフから取り除かれるコアはリザーブでなくボイドへ（スライミーLv3）
    | { type: "noRestWhenBlockingColor"; color: Color } // このスピリットが指定色のスピリットをブロックしたとき疲労しない（巨神機トール）
    | { type: "noRefresh" } // このスピリットはリフレッシュステップで回復しない（スクルディア）

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）
    | { type: "ownNexusIndestructible" } // 発生源の持ち主のネクサスすべては、相手の効果によって破壊されない
      // （hasGlobalConstraintの両陣営走査とは異なり、destroyNexusが破壊対象ネクサスの持ち主のフィールドのみを判定する。サファイアの城壁）

// 破壊の発生源コンテキスト（省略可）。復活系効果（reviveOnDestroy）が参照する。
export interface DestroyContext {
    sourcePid?: PlayerId // 破壊を引き起こした効果の持ち主（相手の効果による破壊か判定する）
    sourceType?: "spirit" | "nexus" | "magic"
    battle?: { attackerColor: Color; attackerLevel?: number } // バトルによる破壊のときの「破壊した側（勝者）」の色・レベル（装甲・reviveOnDestroy判定用。呼び出し側の命名は歴史的にattacker*だが、実際は勝者側の値を渡す）
}

// 効果定義（kind による判別ユニオン）。
// levels は発動するレベルの配列（null = レベル不問）。
export type EffectDef =
    | {
          id: string
          kind: "keyword"
          keyword: Keyword
          levels: number[] | null
          colors?: Color[] // 装甲用: この色の相手効果を受けない
          minCost?: number // 転召用: 対象スピリットのコスト下限
          dest?: "trash" | "void" // 転召用: コアの行き先（trash=持ち主のトラッシュ、void=消滅）
      }
    | {
          id: string
          kind: "triggered"
          trigger: TriggerEvent
          levels: number[] | null
          action: EffectAction
          optional: boolean // 「〜できる」= 任意（自動処理では常に発動）
          battleRole?: "attacker" | "blocker" // onBattle 専用：勝利したときの自分の役割がこれと一致する場合のみ発火（省略時は従来通り常に発火）
          condition?:
              | { opponentNexusColorsAtLeast: number } // 指定時、持ち主から見て相手フィールドのネクサスの色数（重複除く）がこれ以上のときのみ発火（溶海竜プレシオスLv3）
              | { ownFieldHasColorSpirit: Color } // 発生源の持ち主のフィールドに指定色のスピリットがいるときのみ発火（tempColors考慮＝instHasColor。オチョゴ／ジェルフィ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（天使キュリオ）
              | { targetSameLevelAsSelf: true } // fireTriggerのtargetInstanceIdのスピリットのLvがselfのLvと同じときのみ発火（onBlocked用。剣竜ステゴラーサウルス）
              | { ownFieldHasKeyword: Keyword } // 発生源の持ち主のフィールドに指定キーワード持ちのスピリットがいるときのみ発火（一時/継続付与も考慮＝spiritHasKeyword。BS04クナノミ＝覚醒）
      }
    | {
          id: string
          kind: "magic"
          timing: "main" | "flash"
          action: EffectAction
          mainForbidden?: boolean // trueなら、このエントリがtimingとして採用されるメインステップでの使用そのものを拒否する（効果文「メインステップで使えない」の忠実化。ネイチャーフォース）
          condition?:
              | { ownFamilyCountAtLeast: { family: string; count: number } } // 指定系統を持つ自分のスピリットがcount体以上のときのみ実行（spiritHasFamilyで判定。デルタクラッシュ）
              | { ownFieldHasMinSymbolSpirit: number } // 自分のフィールドにシンボル数がこれ以上のスピリットが1体以上いるときのみ実行（instanceSymbolCountで判定。ライトニングバリスタ／インフェルノアイズ等）
      }
    | {
          id: string
          kind: "step"
          step: Phase // 発火するステップ
          turn: "own" | "opponent" | "both" // own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時、both=常に
          levels: number[] | null
          action: EffectAction
          condition?:
              | "handNotGreaterThanOpponent" // 持ち主の手札枚数が相手以下（主無き古城Lv2）
              | "selfWasRefreshedThisStep" // 発生源自身がこのリフレッシュステップで回復した場合のみ（PhaseManagerが渡すrefreshedInstanceIdsで判定。魔界侯爵コキュートス）
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（道化師クラン）
      }
    | {
          id: string
          kind: "aura"
          levels: number[] | null // オーラ発生源のレベル条件
          aura: AuraDef
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "battleWon"
          role: "attacker" | "blocker" | "any" // 持ち主のスピリットがこの役割で勝利したとき（ネクサスのバトル結果誘発）。any=どちらの役割でも
          levels: number[] | null
          action: EffectAction
          turn?: "own" // 指定時、発生源の持ち主がturnPlayerのときのみ発火（深緑の樹海）
          vanillaWinnerOnly?: true // 勝利したスピリットがカードに効果の記述を持たない（バニラ）ときのみ発火（運命分かつ岐路／深緑の樹海）
          selfMode?: "source" // 指定時、resolveActionのselfに勝利スピリットでなく発生源インスタンス（ネクサス）を渡す（深緑の樹海）
      }
    | {
          id: string
          kind: "fieldEvent"
          event: FieldEvent
          levels: number[] | null
          action: EffectAction
          phase?: Phase // 指定時はこのステップでのみ発火（例: 侵食されゆく銀世界Lv2＝相手のアタックステップ限定）
          turn?: "own" | "opponent" // 指定時はこの陣営条件でのみ発火（own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時。省略時はどちらでも発火）
          colorFilter?: Color // event: "ownSpiritDestroyed" | "ownSpiritBlocked" 限定：対象スピリットの色がこれと一致するときのみ発火（祝福されし大聖堂／花の子リップ）
          vanillaOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがカードに効果の記述を持たない（バニラ）ときのみ発火（運命分かつ岐路）
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火（運命分かつ岐路）
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上のときのみ発火（花の子リップ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（instHasColor判定。修理屋バラン・バラン）
              | "selfIsAttacking" // 発生源自身が現在のバトル（state.battle）のアタッカーであるときのみ発火（キノコノコ）
          repeatPerCount?: boolean // event: "ownFunsaiMilled" | "opponentHandAdded" 用：実カウント数ぶんアクションを繰り返す（省略時/falseは1回のみ。修理屋バラン・バラン／犬人マードック）
          familyFilter?: string // event: "ownSpiritDestroyed" 限定：破壊されたスピリットの系統がこれを含むときのみ発火（英雄の喪失）
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          constraint: GlobalConstraintDef // フィールド発生源から全スピリット／全ネクサスに効く制約（発生源の持ち主を問わない。ただしownNexusIndestructibleは発生源の持ち主自身のみに効く）
          condition?: { ownVanillaSpiritsAtLeast: number } // constraint: "ownNexusIndestructible" 用：発生源の持ち主のバニラスピリット数がこれ以上のときのみ有効（サファイアの城壁）
      }
    | {
          id: string
          kind: "costMod"
          levels: number[] | null
          colorFilter?: Color // このコスト修正が効く、使用されるカードの色（省略時は色不問。発生源の持ち主・対象カードの持ち主は問わない＝両陣営に効く）
          cardType?: CardType // 対象カードの種別（省略時は種別不問。螺旋の塔：マジック限定）
          side?: "opponent" // 指定時は「発生源の持ち主から見て相手」のカードのみに適用（省略時は両陣営に適用＝従来通り）
          amount: number // 軽減後コストに加算する量（ルビーの太陽：白のカード全体+1）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は発生源の持ち主基準でこのステップ・turn条件のときのみ有効（螺旋の塔：自分のアタックステップ）
      }
    | {
          id: string
          kind: "activated"
          timing: "flashBattle" // 発動可能タイミング（現状はフラッシュ中のバトルのみ。将来拡張用にユニオン化しておく）
          levels: number[] | null
          cost: { reserveToTrash: number } // 発動コスト（リザーブからトラッシュへ置くコア数。将来拡張しやすい形）
          condition?: "selfInBattle" // 発動条件（self が現在のバトルの当事者＝attacker/blocker）
          action: EffectAction // 発動時の効果
      }
    | {
          id: string
          kind: "coreBonus" // このスピリットに効果でコアが置かれるとき、置く数を+amount（ボイド由来）する（グラーバ）
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "coreStepBonus" // 持ち主のコアステップで得られるコアを+amountする（ベル・ダンディア）
          levels: number[] | null
          amount: number
          condition?: { ownFieldHasNames: string[] } | { ownFieldHasFamily: string } // ownFieldHasNames=指定カード名すべてが自分のフィールド（スピリット）にそろっているときのみ有効／ownFieldHasFamily=指定系統を持つスピリットが自分のフィールドにいるときのみ有効（極光の大地）
      }
    | {
          id: string
          kind: "reviveOnDestroy" // 破壊される代わりに場に留まる（チャガマル／紫水晶の森／鏡の回廊／無法者の荒野／深緑の樹海／子供部屋 午前0時）
          levels: number[] | null
          scope: "self" | "ownAll" // self=このスピリット自身が対象／ownAll=発生源の持ち主の全スピリットが対象
          vanillaFilter?: true // scope:"ownAll" 用：カードに効果の記述を持たない（バニラ）スピリットのみ対象
          keywordFilter?: Keyword // scope:"ownAll" 用：このキーワードエントリを静的に持つカードのみ対象（vanillaFilterと同列。tempKeywords等の一時付与は見ない。果て無き地平線）
          when: {
              byOpponentEffect?: boolean // 相手の効果による破壊のみ（context.sourcePidが相手のとき）
              byBattleVsArmorColor?: boolean // 装甲で指定した色の相手とのBP比較による破壊のみ
              byBattle?: boolean // BP比較による破壊のみ（context.battleがあるとき）
              byBattleKillerLevel?: number // BP比較による破壊で、破壊した側（勝者）のcurrentLevel（context.battle.attackerLevel）がこの値のときのみ
          }
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 発動できるステップ条件（発生源の持ち主基準。"both"=どちらのターンでも）
          revived: { rested: boolean } | { toHand: true } // 戻るときの状態（false=回復状態、true=疲労状態）／toHand=場に留まらず持ち主の手札に戻る（コアはリザーブへ、カードは手札へ。トラッシュは経由しない）
          cost?: {
              keepOneCoreRestToTrash?: boolean // 自身のコアを1個だけ残し、残りを持ち主のトラッシュへ
              oneCoreToVoid?: boolean // 対象のコア1個をボイドへ（コア1個の個体は支払い不可＝不発）
              reserveOneToTrash?: boolean // 持ち主のリザーブのコア1個を持ち主のトラッシュへ（リザーブ0なら支払い不可＝不発。果て無き地平線）
          }
      }
    | {
          id: string
          kind: "keywordGrant" // 発生源が場にありレベル有効の間、持ち主の familyFilter 一致スピリットすべてにキーワードを継続付与する（暴双龍ディラノス）
          levels: number[] | null
          keyword: Keyword
          target: "ownAll"
          familyFilter?: string // 指定時はこの系統を持つスピリットのみ
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。familyFilterとはAND条件。BS03バッチ）
          phase?: Phase // 指定時はこのステップの間のみ有効（turnPlayerを問わない＝『お互いの〜ステップ』）
      }
    | {
          id: string
          kind: "familyGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに系統を継続付与する（ポム／生み出される尖兵）
          levels: number[] | null
          target: "ownAll"
          family: string // 付与する系統
          colorFilter?: Color // 指定時は対象スピリットの色がこれと一致するときのみ
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』）
          condition?: { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
      }
    | {
          id: string
          kind: "reductionGrant" // 発生源が場にありレベル有効の間、条件成立時に対象カード種別/色の使用コストへ軽減シンボルを付与する（ペンタン／天使バーチュ）
          levels: number[] | null
          cardType?: CardType // 対象カード種別（省略時は種別不問）
          cardColor?: Color // 対象カードの色（省略時は色不問）
          keywordFilter?: Keyword // 対象手札カードがこのキーワードエントリを静的に持つ場合のみ付与（hasKeyword判定。フルミンゴ）
          symbols: Color[] // 与える軽減シンボル
          condition?: { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
      }
    | {
          id: string
          kind: "immunityGrant" // 発生源の持ち主の familyFilter 一致スピリットすべては、相手のマジックの効果を受けない（ポークン）
          levels: number[] | null
          target: "ownAll"
          familyFilter?: string // 指定時はこの系統を持つスピリットのみ
          against: "magic"
      }
    | {
          id: string
          kind: "levelAs" // 継続的な「Lv◯として扱う」置換（EffectModules.refreshLevelAsOverridesが毎回再計算する。ナイフ投げのジャグリーン／トパーズの流星）
          levels: null
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsByKeyword" | "ownSpiritsVanilla" // ownSpiritsByKeyword=keywordFilterのキーワードエントリを静的に持つ持ち主のスピリットすべて（レベル不問。斬竜刀のガイ／崩壊する戦線）／ownSpiritsVanilla=カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）／opponentNexusesAll=発生源の持ち主の相手の全ネクサス（ウッド・ゴレム）
          treatAs: number | "max" | "coresScaled" // 扱うレベル。"max"=対象カード自身が持つ最高Lv（card.levelsのlevel最大値。対象ごとに算出）／"coresScaled"=対象のコア数で換算（1個→Lv1、2個→Lv2、3個以上→"max"と同じ。サファイアの城壁）
          keywordFilter?: Keyword // target: "ownSpiritsByKeyword" 用
          phase?: Phase // 指定時、state.phaseが一致するときのみ有効
          turn?: "own" // 指定時、発生源の持ち主がturnPlayerのときのみ有効
          condition?:
              | { maxOwnSpirits: number } // 自分のフィールドのスピリット数がこの値以下の間有効（発生源自身を含む）
              | { anyFieldHasColorSpirit: Color } // 自分か相手のどちらかのフィールドに指定色のスピリットがいる間有効（斬竜刀のガイ）
          sourceMinLevel?: number // 発生源の素のレベル（コア数基準。上書き無視）がこれ以上のときのみ有効
          sourceLevels?: number[] // 発生源の素のレベル（コア数基準。上書き無視）がこの配列に完全一致で含まれるときのみ有効（sourceMinLevelの完全一致版。ウッド・ゴレム）
      }
    | {
          id: string
          kind: "colorAs" // 発生源自身が指定色のスピリットとしても扱われる（継続。EffectModules.refreshLevelAsOverridesが毎回再計算する。levelsで発動レベルを指定＝百面相のフラットフェイス）
          levels: number[] | null
          colors: Color[]
      }
    | {
          id: string
          kind: "magicBuffBonus" // マジックによるBPバフに追加でBP+する（対象・アタックステップ限定。騎獣スレイプホース）
          levels: number[] | null
          target: "self" | "ownOthers" // self=発生源自身が対象になったとき / ownOthers=発生源以外の持ち主の緑スピリットが対象になったとき
          colorFilter?: Color // 使用されたマジックの色（省略時は色不問）
          amountBonus: number
      }
    | {
          id: string
          kind: "effectGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに誘発効果を継続的に付与する（アルカナビースト・ケン）
          levels: number[] | null
          target: "ownAll"
          nameIncludes?: string // 対象スピリットのカード名に含まれる文字列（省略時は自分のスピリットすべてが対象。発生源自身も一致すれば対象に含む）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。nameIncludesとはAND条件。BS03バッチ）
          granted: { trigger: TriggerEvent; action: EffectAction } // 付与される誘発効果（levelsは常に有効扱い）
      }
    | {
          id: string
          kind: "drawDouble" // 持ち主フィールドにある間、自分がスピリット/マジックの効果でデッキからドローする合計枚数を2倍にする
          // （draw/drawPerアクションが対象。deckRevealと通常のドローステップは対象外。重複しない＝複数あっても2倍まで。封印された魔導書）
          levels: number[] | null
          phaseTurn: { phase: Phase; turn: "own" }
      }
    | {
          id: string
          kind: "exhaustOnManualCoreAdd" // 持ち主から見て相手がスピリット/ネクサス/マジックの効果以外（moveCore/awaken）でスピリットのコアを
          // 増やしたとき、そのスピリットを疲労させる（持ち主の相手のメインステップ限定。夢魔の寝所）
          levels: number[] | null
      }
    | {
          id: string
          kind: "constraintGrant" // 発生源が場にありレベル有効の間、持ち主フィールドの対象（ownAll、minLevel条件）に
          // 制約を継続付与する（夢魔の寝所Lv2：自分のLv3スピリットに指定アタックを許す）
          levels: number[] | null
          target: "ownAll"
          minLevel?: number // 対象のcurrentLevelがこれ以上のときのみ付与
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は発生源の持ち主基準でこのステップ・turn条件のときのみ有効
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "funsaiBonus" // 持ち主のスピリットの【粉砕】の破棄枚数を+amountする（崩壊する戦線Lv1-2）
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "funsaiOnBlock" // 持ち主のスピリットの【粉砕】を『このスピリットのブロック時』にも発揮させる（士気高き大本営Lv1-2）
          levels: number[] | null
      }
    | {
          id: string
          kind: "magicRestriction" // フィールドの発生源からマジックの使用に制約をかける
          levels: number[] | null
          restriction:
              | "oncePerTurnAll" // お互い、ターンに1回しかマジックの効果を使用できない（作戦参謀フォクシン）
              | "noReductionOpponent" // 発生源の持ち主の相手は、マジック使用時に軽減シンボルによるコスト軽減ができない（イワトビペンタン）
              | "colorLockOpponent" // 発生源の持ち主の相手は、自分（=使用者）のフィールドのシンボルと同じ色を含まないマジックカードを使用できない（力奪う凱旋門）
              | "noFreeCastOpponent" // 発生源の持ち主の相手は、マジックの無償化（kind:"magicFreeGrant"）を適用できない（力奪う凱旋門Lv2）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "magicFreeGrant" // 発生源の持ち主は、指定色のマジックカードをコストを支払わずに使用できる（「できる」は自動適用で簡略化。薔薇人バロッサ）
          levels: number[] | null
          colorFilter?: Color // scope省略時にこの色のマジックのみ無償化（scope指定時は色不問なので省略する）
          scope?: "allMagicHandAndTegamoto" // 色を問わず、持ち主の手札/手元(tegamoto)のマジックカードすべてを無償化（大天使ミカファールLv2。手札からの使用にも適用される＝effectiveCostはfromTegamoto不問で判定）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "exhaustImmunityGrant" // 発生源の持ち主のfamilyFilter一致スピリットは、相手のスピリット/ネクサス/マジックの効果で疲労しない（トランプの王国）
          levels: number[] | null
          familyFilter: string
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "lifeDamageNegate" // ブロックされなかったアタッカーの実効BPが発生源の実効BP以下のとき、発生源の持ち主のライフは減らない（硝子の女神フレイア）
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }

// カードマスターデータ（不変）。data.md 4 / 6.1 に対応
export interface CardData {
    cardId: string
    name: string
    type: CardType
    color: Color
    cost: number
    reduction: Color[] // 軽減シンボル（色の配列。長さ=軽減数）
    family: string[] // 系統（日本語のまま）
    levels: LevelDef[] // magic は空配列
    symbol: Color[] // magic は空配列
    flash: boolean // magic のみ: フラッシュタイミングで使用可能か
    rarity: string // C/U/R/M/X など（表示用）
    limited: boolean // 禁止カードか
    limitCount?: number // 制限カード（同名の最大投入数。3枚未満に制限する場合のみ指定。省略時は通常の3枚まで）
    effect: string // 表示用テキスト（原文）
    effects: EffectDef[] // 構造化された効果（未対応の効果は含まれない）
}

// 盤面インスタンス（可変）。data.md 6.2 に対応
export interface CardInstance {
    instanceId: string
    cardId: string
    cores: number
    isRested: boolean
    summonedTurn: number
    tempBpBuff: number // ターン終了時まで有効なBP増減
    cantAttackThisTurn: boolean // このターンの間アタック不可（refreshAllOwn で回復した個体などに付与）
    immuneToOpponentThisTurn: boolean // このターンの間、相手のカード効果を受けない（フェザーバリア）
    blockConstraintNegatedThisTurn: boolean // このターンの間、自身の cantBlock/cantBlockLowerBp を無効化（バーストファイア）
    tempKeywords: { keyword: Keyword; colors?: Color[] }[] // このターンの間だけ付与されたキーワード（ターン終了でリセット。スピリットリンク／インビンシブルシールド）
    tempAlsoCosts: number[] // このターンの間、実コストに加えてこれらのコストとしても扱われる（ターン終了でリセット。道化師クラン）
    tempColors: Color[] // このターンの間だけ付与された色（master色に加えて持つ。ターン終了でリセット。アディショナルカラー）
    tempFamilies: string[] // このターンの間だけ付与された系統（ターン終了でリセット。音鳥クルーク）
    coresAtDestruction?: number // 破壊直前に置かれていたコア数（destroySpiritが記録。漆黒鳥ヤタグロス）
    levelAsContinuous?: number // 継続的な「Lv◯として扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（ナイフ投げのジャグリーン／トパーズの流星）
    levelOverrideThisTurn?: number // このターンの間のレベル上書き（ターン終了処理でリセット。皇帝アンプルール）
    coresLinkedTo?: string // このネクサスのコア数を、リンク元スピリット（instanceId）のコア数と同じものとして扱う
    // （クロスシザース。本来は再指定まで永続だが、このターンの間だけの簡略化。ターン終了でリセット）
    coresOverride?: number // coresLinkedTo設定時、EffectModules.refreshLevelAsOverridesがリンク元スピリットの
    // 現在コア数から毎回同期する。currentLevelはこの値をcoresの代わりに使う（ターン終了でリセット）
    colorsAsContinuous?: Color[] // 継続的な「〜の色としても扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（百面相のフラットフェイス）
    tempExtraSymbols?: number // このターンの間の追加シンボル数（ターン終了でリセット。ダブルハート）
}

// プレイヤーの状態
export interface PlayerState {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    deck: string[] // cardId の配列（先頭がデッキトップ）
    hand: string[]
    trashCards: string[]
    tegamoto: string[] // 公開ゾーン「手元」（cardId配列）。マジックブックの手元配置・ミカファールLv2の無償使用対象・エクリアの破壊効果が参照する。公開ゾーンのためviewForは両者分をそのまま配信する
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
    }
    tempHandKeywordGrants?: { cardId: string; keyword: Keyword }[] // 手札のカードに一時付与されたキーワード（grantKeywordToHandCard。ターン終了でリセット。ビートプリースト）
}

// バトル（アタック〜解決まで）の状態
export interface BattleState {
    attackerInstanceId: string
    blockerInstanceId: string | null
    flashLockedPlayer: PlayerId | null // このバトルの間フラッシュで手札のカードを使用できないプレイヤー（lockFlash 用）
    directed: boolean // 指定アタックか（true の場合 blockerInstanceId はアタッカーが指定した相手スピリット。通常アタックは false）
    compareByLevel?: boolean // trueの場合、バトル解決時にBPの代わりにcurrentLevelを比較する（エンジェルボイス）
    usedMagicCardIds?: { p1: string[]; p2: string[] } // このバトル中に使用されたマジックのcardId（光芒用）
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
    cardZone?: "hand" | "trash" // kind:"card" のとき必須：どちらのゾーンから選ぶか
    cardOwner?: PlayerId // kind:"card" のとき必須：ゾーンの持ち主（今回は常に pid 自身のゾーン＝pidと同値）
    cardIndices?: number[] // kind:"card" のとき必須：cardZone配列内の選択可能インデックス
    optional: boolean // true ならスキップ（選ばない）可
    action: EffectAction // 選択後に resolveAction する本体
    selfInstanceId: string | null // 発生源スピリット（self の復元用）
    queue: { selfInstanceId: string | null; action: EffectAction }[] // 中断された残りアクション
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
    turnConstraints: TurnConstraintDef[] // このターンの間だけ有効な全体制約（ターン終了でリセット。ヘビィゲート）
    lastBattleDestroyedCores: number // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（次のバトル解決の冒頭でリセット。魔界七将デストロード）
    lastBattleDestroyedLevel: number // 直前のバトル解決でBP比較により破壊されたブロッカーのcurrentLevel（次のバトル解決の冒頭でリセット。0=まだ発生していない。魔界伯爵ヴィール）
    pendingChoice: PendingChoice | null // 効果解決中のプレイヤー選択（非null中は resolveChoice 以外のアクションを拒否する）
    turnStartResumeStep: number | null // ターン開始処理（start→core→draw→refresh→main）がステップ誘発のpendingChoiceで中断したときの再開ステップ番号。null=中断なし。選択解決後に resumeTurnStart が続きから再開する（百識の谷Lv1のドローステップ破棄選択など）
    interactiveTargets: boolean // trueなら誘発効果の対象選択候補2件以上でpendingChoiceを要求する（既定false。実対戦では server/src/index.ts が true に設定。smokeは既定のfalseのまま自動選択を使う）
    events: GameEvent[] // クライアント演出用の一時イベント列（handleAction冒頭でクリア）
    eventSeq: number // GameEvent.seq の通し番号（クリアしてもリセットしない）
    magicUsedThisTurn: Record<PlayerId, number> // このターンに各プレイヤーがマジックを使用した回数（ターン終了でリセット。magicRestriction:"oncePerTurnAll"用。作戦参謀フォクシン）
}

// このターンの間だけ有効な全体制約の定義（GameState.turnConstraints が参照する宣言的ルール）
export type TurnConstraintDef =
    | { type: "cantActByCost"; maxCost: number } // コストがmaxCost以下のスピリットはすべてアタック/ブロック不可（ヘビィゲート）

// ---- クライアントへ送る公開ビュー（相手の手札・デッキ内容は隠す） ----

export interface PlayerView {
    id: PlayerId
    name: string
    life: number
    reserve: number
    trashCores: number
    deckCount: number
    hand: string[] | null // 自分のみ。相手は null
    handCount: number
    trashCards: string[]
    tegamoto: string[] // 公開ゾーンのため自分/相手とも常に配信する
    field: {
        spirits: CardInstance[]
        nexuses: CardInstance[]
    }
    tempHandKeywordGrants?: { cardId: string; keyword: Keyword }[] // 自分のみ。相手は常に省略（手札内容に紐づくため）
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
    pendingChoice: PendingChoice | null // 相手視点では candidates を空配列・prompt をマスクして配信（viewFor）
    events: GameEvent[] // クライアント演出用の一時イベント列（隠匿情報なし。viewForがそのまま渡す）
}

// ---- クライアント → サーバーのアクション ----

export type GameAction =
    | { type: "summon"; handIndex: number; paySources?: PaySource[] } // 召喚（神速持ちはフラッシュ時も可）
    | { type: "setNexus"; handIndex: number; paySources?: PaySource[] }
    | { type: "castMagic"; handIndex: number; targetInstanceId?: string; paySources?: PaySource[]; fromTegamoto?: boolean } // fromTegamoto指定時はhandIndexが手元(tegamoto)のインデックスを指す（手元からの無償使用。ミカファールLv2）
    | { type: "moveCore"; instanceId: string; direction: "add" | "remove" }
    | {
          type: "awaken" // 覚醒：fromInstanceId のコアを instanceId へ移す
          instanceId: string
          fromInstanceId: string
          count: number
      }
    | { type: "attack"; instanceId: string; targetSpiritInstanceId?: string } // targetSpiritInstanceId 指定時は指定アタック（canDirectAttack 持ちのみ）
    | { type: "block"; instanceId: string }
    | { type: "activateAbility"; instanceId: string; effectId: string } // 起動能力の発動（kind:"activated"、コストを払って任意発動する能力）
    | { type: "resolveChoice"; instanceId?: string; option?: string; cardIndex?: number } // pendingChoice への応答（kind:"target"はinstanceId、kind:"option"はoption、kind:"card"はcardIndex。すべて省略＝スキップ。optionalのときのみ許可）
    | { type: "takeLife" }
    | { type: "pass" } // フラッシュの優先権を相手に渡す
    | { type: "nextPhase" } // main → attack
    | { type: "endTurn" }
