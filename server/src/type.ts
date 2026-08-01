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
    cost?: { max?: number; min?: number }
    level?: number[] // currentLevel がこれに含まれる
    keyword?: Keyword // 指定キーワード持ち（一時付与・継続付与も考慮）
    vanilla?: true // 効果テキストを持たないカードのみ
    minSymbols?: number // シンボル数がこれ以上
    excludeSelf?: boolean // 発生源自身を対象から外す
    cores?: number // 実際に置かれているコア数がこれと一致する（BS05ドラグノ爆弾兵：コア1個）
    rested?: true // 疲労状態（isRested）のものだけ（BS05吸血女王カーミラ：範囲破壊の疲労限定）
    nameContains?: string // カード名にこの文字列を含むものだけ（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）
    sameColorAsBattleLoser?: true // 直前のバトルで破壊された側と同じ色（normalizeFilter が state.lastBattleDestroyedColors を color 軸へ解決する。記録が無ければ対象なし。BS04獣使いドヴェルグ）
    sameFamilyAsBattleLoser?: true // 直前のバトルで破壊された側と同じ系統（normalizeFilter が state.lastBattleDestroyedFamilies を family 軸へ解決する。記録が無ければ対象なし。BS04ニーベルングリング）
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
export type EffectAction =
    | { type: "draw"; count: number } // 自分がデッキから引く
    | { type: "destroy"; filter?: TargetFilter; count: number; countPerOpponentTrashMagicColors?: boolean } // 相手スピリットを破壊（絞り込みは filter。省略=BP不問、selfがnullで self 相対BP指定ならno-op）。countPerOpponentTrashMagicColors指定時はcountを無視し、相手のトラッシュにあるマジックカードの色の種類数（重複除く）を対象数として使う（BS05超獣王ベヒードス）
    | { type: "destroyAll"; filter?: TargetFilter; anySide?: boolean } // filter に一致する相手スピリットを全破壊。anySide指定時は両陣営が対象（filter.colorExclude で色除外＝BS04魔龍帝ジークフリードLv3：赤以外のBP4000以下すべて。filter.rested と cost.max の組み合わせで「疲労状態のコストX以下すべて」＝BS05吸血女王カーミラ）
    | { type: "selfBuff"; amount: number } // このスピリット自身をBP+（ターン終了時まで）
    | { type: "destroyNexus"; count: number; drawPerDestroyed?: number; all?: boolean; side?: "opponent" | "both"; levelFilter?: number[] } // 相手のネクサスを破壊（drawPerDestroyed指定時は実際に破壊できた数×ドロー）。all指定時はcountを無視し相手のネクサスすべてを破壊する（BS04風龍王フージャオス）。side指定時は破壊対象の陣営を切り替える（省略時はopponent＝従来どおり。BS01バスターファランクス＝both）。levelFilter指定時はcurrentLevelがこれに含まれるネクサスのみ対象（BS03バスターランス＝Lv1のみ）
    | { type: "returnSelfToHand" } // このスピリットを持ち主の手札に戻す
    | { type: "coreRemove"; count: number; dest?: "void" } // 対象スピリットのコアを持ち主のリザーブへ置く（dest:"void"指定時はリザーブでなくボイドへ＝消滅。BS04ヴェノムショット）
    | { type: "bpBuff"; filter?: TargetFilter; amount: number } // 対象スピリット1体をBP+（ターン終了時まで）。filter.minSymbols 指定時、対象（targetInstanceId明示・自動選択とも）はシンボル数がこれ以上のスピリットのみ有効（ライトニングバリスタ等）
    | { type: "exhaust"; filter?: TargetFilter; count: number; anySide?: true } // 相手スピリットを疲労させる（絞り込みは filter。自動選択・明示ターゲット選択の両方に適用）
    | { type: "destroyExhausted"; filter?: TargetFilter; count: number; anySide?: boolean } // 疲労状態の相手スピリットを破壊（anySide指定時は両陣営の疲労スピリットから実効BP最大の1体を自動選択して破壊。filter.cost で コスト条件＝BS04ヘルウィッチ）
    | { type: "drawPer"; counter: EffectCounter } // カウント値ぶん自分がドロー（0ならログのみ）
    | { type: "bpBuffPer"; counter: EffectCounter; amountPer: number } // 対象スピリット1体を「カウント値×amountPer」だけBP+（0ならログのみ）
    | { type: "discardHandAll" } // 自分の手札をすべてトラッシュへ
    | { type: "bpBuffAll"; filter?: TargetFilter; amount: number } // 自分のフィールドのスピリットすべてをBP+（ターン終了時まで。filter.family 指定時は指定系統持ちのみ。配列＝いずれかの系統でOR）
    | { type: "returnToHand"; count: number; maxBpFromSelf?: boolean; countPerOpponentNexus?: boolean } // 対象スピリットを持ち主の手札に戻す（破壊ではないためonDestroyは誘発しない）。maxBpFromSelf=selfの実効BP以下の相手のみ（BS04鋼葉の樹林Lv2）。countPerOpponentNexus指定時はcountを無視し、相手のネクサス数を対象数として使う（BS05幻獣王リーン）
    | { type: "returnToDeckTop" } // 対象スピリットを持ち主のデッキの一番上に戻す
    | { type: "coreCharge"; count: number } // 自分のリザーブから対象の自分スピリットへコアを最大count個置く
    | { type: "lifeCharge"; count: number } // 自分のリザーブから自分のライフへコアをcount個置く（不足なら可能な分だけ）
    | { type: "coreGain"; count: number } // ボイドから自分のリザーブへコアをcount個追加
    | { type: "refreshAllOwn" } // 自分の疲労スピリットをすべて回復。回復した個体はこのターン中アタック不可
    | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
    | { type: "swapBattler" } // バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える（テレポートチェンジ。バトル外・使用者がバトル非参加・疲労スピリット不在はno-op）
    | { type: "exhaustAllByColor" } // 相手フィールドで最多の色を自動選択し、その色を持つ両陣営のスピリットを疲労させる
    | { type: "exhaustAll"; side: "opponent" | "both"; minBp?: number; maxBp?: number; filter?: TargetFilter } // 指定側（相手/両陣営）のスピリットをBP範囲（minBp以上/maxBp以下）で疲労させる。装甲・疲労免疫は相手側のみ尊重（BS04グラウンドハウリング）。filter指定時はcores/excludeSelfのみ追加で判定する（他の軸は未対応。BS05双剣虎ジェン・フー：コア1個のみ・自分自身を除く）
    | { type: "returnAllToHand"; side: "opponent" | "both"; costFilter?: { max?: number; min?: number } } // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（バウンス＝onDestroy不発火。装甲/免疫は相手側のみ尊重。BS04ドリームハンド）
    | { type: "refreshByFamily"; familyFilter: FamilyFilter; count: number } // 自分の疲労スピリットのうちfamilyFilter一致（配列=OR）をcount体まで回復（実効BP最大から。cantAttackThisTurnは付与しない。BS04ハイエーテル）
    | { type: "trashCoresToKeywordSpirit"; keyword: Keyword } // 自分のトラッシュのコアすべてを、指定キーワードを持つ自分のスピリット1体へ置く（候補複数かつinteractiveならpendingChoice、そうでなければ実効BP最大へ。BS04グレートリンク）
    | { type: "lockFlash" } // バトル中のみ有効：このバトルの間、相手はフラッシュで手札のカードを使用できなくする
    | { type: "returnNexusToHand"; count: number; anySide?: true; voidCoreToOwnTrashIfOpponent?: number } // 相手のネクサスを持ち主の手札に戻す（破壊ではない）。anySide指定時は自分/相手どちらのネクサスも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり相手の先頭ネクサスを自動選択。BS03メビウスリング）。voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが相手のものだったときのみボイドからその数のコアを自分のトラッシュへ置く
    | { type: "reclaimTrashCores" } // 自分のtrashCoresをすべてリザーブへ（0ならログのみ）
    | { type: "refreshSelf" } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）
    | { type: "lifeCrush"; count: number } // 相手のライフのコアcount個を相手のリザーブへ（ライフ0以下で勝敗決定）
    | { type: "voidCoreToSelf"; count: number } // ボイドからコアcount個をこのスピリット上に置く（selfがnullならno-op）
    | { type: "voidCoreToSelfPer"; counter: EffectCounter } // カウント値ぶんボイドからこのスピリット上にコアを置く（0ならno-op）
    | { type: "discardOpponent"; count: number; forcedTargetPid?: PlayerId } // 相手の手札からcount枚を破棄（手札末尾から。手札が足りなければある分だけ）。interactiveTargets時は選択式（選択者は破棄される相手本人）。forcedTargetPidは選択式再突入時のみ内部で設定する対象プレイヤー（cards.jsonには書かない。選択者=破棄される側のためresolveActionのowner引数がopponentOf(owner)で逆算できなくなるのを避ける）
    | { type: "refreshOne"; filter?: TargetFilter; all?: boolean } // 自分の疲労スピリット1体を回復（絞り込みは filter。family は spiritHasFamily 判定＝付与系統も考慮。候補から実効BP最大を自動選択、いなければno-op）。all指定時は該当候補すべてを回復し cantAttackThisTurn は付与しない（決闘台地Lv2／鋼に覆われた高空／ベル・ダンディア）。filter.excludeSelf 指定時は候補からself自身を除外する（BS04風龍王フージャオス：自身も系統「翼竜」だが対象外）
    | { type: "coreRemoveSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のリザーブへ（selfがnullならno-op）
    | { type: "selfBuffPer"; counter: EffectCounter; amountPer: number } // このスピリット自身を「カウント値×amountPer」だけBP+（ターン終了時まで。selfがnull/カウント0はno-op）
    | { type: "voidCoreToOther"; count: number } // ボイドからコアcount個を、self以外の自分のスピリットのうち実効BP最大の1体に置く（候補がいなければno-op）
    | { type: "coreSqueezeAll" } // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ（1個未満で維持コア割れになる場合は消滅処理を適用）
    | { type: "endAttackStepAfterBattle" } // バトル中のみ：このバトルが終了したときアタックステップを終了するフラグを立てる（バトル外はno-op）
    | { type: "coreToTrashSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のトラッシュへ（維持コア割れの消滅処理を含む。selfがnullならno-op）
    | { type: "recoverSpiritFromTrash"; count: number; familyFilter?: FamilyFilter; all?: true } // 自分のトラッシュにあるスピリットカードをcount枚、手札に戻す（末尾＝新しい方から自動選択。本来は選択の簡略化。該当なしはno-op）。familyFilter指定時はその系統を持つカードのみ（配列＝OR。カード静的な family で判定。BS04鋼葉の樹林）。all指定時はcountを無視し、familyFilter該当カードすべてを手札に戻す（BS03ネクロマンシー）
    | { type: "coreSqueezeOne"; count: number; anySide?: true } // 相手フィールドの実効BP最大のスピリットをcount体選び、それぞれコアを1個だけ残して超過分を持ち主のリザーブへ（coreSqueezeAllの単体版。対象なしはno-op）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり相手BP最大を自動選択。BS03ウィークネス）
    | { type: "coreToVoidOwn"; count: number } // 自分のコアcount個をボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ自分フィールドのスピリット（実効BP最小）から取る。維持コア割れは消滅処理
    | { type: "bothSidesCoreToTrash"; count: number } // 両プレイヤーが各自のフィールドのスピリットから、コアの多い個体から順に合計count個を各持ち主のトラッシュへ（1体で足りなければ次にコアが多い個体へ繰り越す。維持コア割れは消滅処理。片側のみ対象がいてもその側は処理する。BS01メタルディー・バグ＝count1、BS02マインドコントロール＝count4）
    | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
    | { type: "coreDrainAllOthers" } // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ（両陣営）。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）
    | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する（フェザーバリア）
    | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する（バーストファイア）
    | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない。妖機妃ソール）
    | { type: "deckReveal"; count?: number; pickType?: CardType; countPer?: { ownColorTotal: Color }; pickAllOfType?: "magic"; nameIncludes?: string; discardNonMatching?: boolean } // 自分のデッキ上からcount枚（countPer指定時は自分の指定色スピリット/ネクサス合計数。countと排他）を公開し、pickTypeに一致する最初の1枚（省略時は先頭。pickAllOfType指定時は一致するすべて。nameIncludes指定時はカード名にこの文字列を含むもののみ）を手札に加える。残りは元の順でデッキの下に戻す（discardNonMatching指定時はトラッシュへ破棄する。スワロウアイヴィー／大天使ミカファール／BS05天焦がす大聖火）
    | { type: "coreGainPer"; counter: EffectCounter } // カウント値ぶんボイドから自分のリザーブへコアを追加（0ならログのみ。宝石の獣カーバルク）
    | { type: "refreshAllByCost"; cost: number } // 両陣営のコストが一致するスピリットすべてを回復させる（refreshAllOwnと異なりcantAttackThisTurnは付与しない。ローヤルポーション）
    | { type: "destroyOwnByCost"; maxCost: number; gainCoresEqualCost?: boolean } // 自分のフィールドからself以外でコスト<=maxCostのうちコスト最大の1体を破壊する（プレイヤー選択の簡略化＝決定的選択）。gainCoresEqualCost指定時は破壊したスピリットのコストと同数のコアをボイドから自分のリザーブへ（天使長プリンシパール）
    | { type: "grantKeyword"; keyword: Keyword; colors?: Color[] } // 自分のスピリット1体に、このターンの間キーワードを付与する（targetInstanceId優先、フォールバックはバトル中の自分スピリット→自分フィールド先頭。スピリットリンク／インビンシブルシールド）
    | { type: "exhaustAllByLevel"; level: number | "lastBattleDestroyed" } // 両陣営のcurrentLevelが一致するスピリットをすべて疲労させる（疲労済みはno-op）。"lastBattleDestroyed"指定時はstate.lastBattleDestroyedLevelを使用（0なら不発。魔界伯爵ヴィール）
    | { type: "destroyAllExceptChosenColors"; chosenOwn?: Color; chosenOpp?: Color; awaiting?: "own" | "opponent" } // 「お互い、自分のフィールドに出ているスピリットの色を1色指定する。指定されなかった色のスピリットすべてを破壊する」（地龍王ケンドラゴス）。
    // interactiveTargets では**両プレイヤーが順に**色を選ぶ。選択の進捗は chosenOwn / chosenOpp / awaiting に持たせて再入する
    // （相手に選ばせる段は PendingChoice.actorPid で「選択者＝相手・実行者＝発生源の持ち主」にする）。
    // 非対話時は従来どおり、お互い自分フィールドで最多の色を自動指定する
    | { type: "destroySelf" } // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
    | { type: "refireSummonEffect" } // 対象の自分スピリット1体（targetInstanceId優先、フォールバックは自分フィールド先頭）のonSummon効果を再発揮する（タイムリープ）
    | { type: "recoverMagicFromTrash" } // 自分のトラッシュにあるマジックカード1枚（末尾＝新しい方）を手札に戻す（トリックスター）
    | { type: "trashCoresToSpirit"; count?: number } // 自分のトラッシュのコアを対象スピリットへ置く（count省略=全部、不足時は可能な分。対象はtargetInstanceId優先、フォールバックはself→自分フィールド先頭）
    | { type: "grantKeywordAll"; keyword: Keyword; colors?: Color[]; costFilter?: number; vanillaFilter?: true } // 自分のスピリット全員（costFilter指定時はコスト一致のみ、vanillaFilter指定時は効果の記述を持たないスピリットのみ）に、このターンの間キーワードを付与する（リフレクションアーマー／BS05サーキュラーソー・アーム）
    | { type: "banActByCostThisTurn"; maxCost: number } // このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可にする（ヘビィゲート）
    | { type: "deployNexus"; from: "hand" | "trash"; colors: Color[]; all?: boolean } // 手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに自分のフィールドに配置する（該当なしはno-op。スコルピード／白虎ハック／黒虎クロン）。all指定時は該当するネクサスカードをすべて配置する
    | { type: "sacrificeNexusThenWipeEnemyNexusCores" } // 自分のネクサス1つ（コア数最小、同数は配列先頭）を破壊し、相手の全ネクサス上のコアを相手のトラッシュへ置く（自分のネクサスが無い/破壊耐性で不発なら何もしない。プレイヤー選択の簡略化。サクリファイス）
    | { type: "levelOverrideOpponentNexuses"; level: number; costReserveToVoid?: number } // 相手の全ネクサスの levelOverrideThisTurn を level に設定（このターンの間）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから適用する（「できる」の任意発動は自動発動で簡略化。皇帝アンプルール）
    | { type: "summonFromHandFree"; colorFilter?: Color; sameFamilyAsSelf?: boolean; familyFilter?: FamilyFilter; costFilter?: number; nameIncludes?: string } // 自分の手札にあるスピリットカードのうち条件（colorFilter一致／sameFamilyAsSelf=selfと系統1つ以上共通／familyFilter=指定系統一致。配列＝OR）を満たすコスト最大の1枚（同コストは手札の先頭側）を、コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットの onSummon 効果は発揮されない（老賢樹トレントン／竜戦車アースガルド。familyFilterはBS05火龍王ボルケノス＝系統「竜人」限定で、selfの系統全部とはOR判定にしたくない場合に使う）。costFilter指定時はコストが完全一致するもののみ（BS05シーサーズ＝コスト2）。nameIncludes指定時はカード名にこの文字列を含むもののみ（BS05ペンタン帝国）
    | { type: "destroyAllNexusesExceptChosenColors"; minTotalColors: number } // 両者フィールドのネクサスの色数合計（重複除く）がminTotalColors未満なら不発（ログのみ）。成立時はお互い自分フィールドで最多のネクサス色を1色自動指定し（同数はColor定義順の先頭、ネクサス0の側は指定なし）、どちらの指定色でもないネクサスをすべて破壊する（destroyAllExceptChosenColorsのネクサス版。色選択の決定的簡略化。溶海竜プレシオス）
    | { type: "destructionCoresToOwnSpirit" } // 破壊時：selfが破壊直前に置いていたコア数（coresAtDestruction）ぶんを、持ち主のリザーブから自分の実効BP最大のスピリットへ移す（destroySpiritがリザーブへ移した分の付け替え。対象がいなければリザーブに残る。対象選択の決定的簡略化。盾精ラングリーズ）
    | { type: "levelOverrideTarget"; level: number; colorFilter?: Color; requireLevelExists?: boolean } // 対象（targetInstanceId）のlevelOverrideThisTurnをlevelに設定する（このターンの間。花の子リップ）。colorFilter/requireLevelExists指定時は、対象が指定色でない／そのレベルをカードに持たない場合は不発（BS04マッシブアップ＝Lv3を持つ青のスピリット）
    | { type: "ignoreUnblockableThisTurn" } // このターンの間、自分のスピリットは「ブロックされない」効果を無視してブロックできる（GameState.ignoreUnblockableThisTurn。BS04レッドウォール）
    | { type: "opponentCoresToTrash"; count: number } // 相手のリザーブ→相手スピリット上の順にコアcount個を相手のトラッシュへ置く（BS04氷の女神フリッグ）
    | { type: "voidCoreToOwnByKeyword"; keyword: Keyword; count: number } // ボイドからコアcount個ずつを、指定キーワードを持つ自分のスピリットすべての上に置く（BS04甲殻戦士ロングホーン＝神速）
    | { type: "reviveLastDestroyedNexus"; coreCost?: number } // self上のコアをコストぶん自分のトラッシュに置くことで、直近に破壊された自分のネクサス（GameState.lastDestroyedNexus）をトラッシュから自分のフィールドへ戻す（coreCost省略時はself上のコアすべて＝BS04戦闘獣ジャッカー。指定時はその数だけ支払う。コア不足なら不発。BS05ブロンズ・ゴレム＝1個）
    | { type: "negateLifeDamageFromTarget" } // 対象（targetInstanceId＝相手スピリット1体）のアタックでは、このターン自分のライフが減らない（CardInstance.lifeDamageNegatedFor。BS04ミストカーテン）
    | { type: "coreToOpponentTrashChoice"; count: number; includeReserve?: true } // 相手のスピリット1体かネクサス1つを選び、コアcount個を相手のトラッシュへ置く（targetInstanceId省略時は候補を集めてpendingChoiceを要求し、指定時はその対象へ実行する。スピリットは維持コア割れで消滅、ネクサスは消滅させない。魔界侯爵コキュートス）
    | { type: "battleCompareByLevel" } // 現在のバトル（state.battle）にフラグを立て、解決時にBPの代わりにLvを比較させる（バトル外は不発。エンジェルボイス）
    | { type: "revealReturnToDeck" } // 公開ゾーン（GameState.revealedCards）の残りをデッキの下へ戻す。interactiveTargets 時は戻す順番を1枚ずつ選ばせる（スキップで残りを現在の順のまま戻す）。BS01-067 スワロウアイヴィー／BS03-142 サルベージ
    | { type: "grantColorChoice" } // 対象選択→色選択の2段階choiceを経て、選ばれた対象のtempColorsに選ばれた色を追加する（フラッシュ：スピリット1体にもう1色与える。アディショナルカラー）
    | { type: "grantFamilyChoiceAll"; targetFamily: string } // targetFamily持ちが自分のフィールドにも手札にも1枚もなければ不発。あれば全系統からのoption choiceを経て、選ばれた系統を CardInstance.lentChoiceFamily に載せた仮想発生源を積む（＝lendSelfThisTurn と同じ貸与。以後は kind:"familyGrant" の familyFromChoice エントリが継続付与する。音鳥クルーク）
    | { type: "linkNexusCoresChoice" } // 自分のネクサス1つを指定するtarget choice（optional=スキップ可）。指定されたネクサスのcoresLinkedToにselfのinstanceIdを設定する（selfがnullなら不発。クロスシザース）
    | { type: "mill"; count: number; side?: "own" } // 相手（side:"own"指定時は自分）のデッキを上からcount枚トラッシュへ送る（【粉砕】。不足時は可能な分だけ）
    | { type: "millPer"; counter: EffectCounter; side?: "own"; multiplier?: number; cap?: number } // カウント値（×multiplier、cap指定時は上限）ぶん相手（side:"own"指定時は自分）のデッキをトラッシュへ送る（0ならログのみ。BS04機動要塞キャッスル・ゴレム）
    | { type: "levelMaxAllOwnThisTurn" } // 自分のスピリットすべての levelOverrideThisTurn を各カードの最高Lvに設定する（このターンの間。ターン終了でリセット。BS04幻影士のミラージ）
    | { type: "suppressTriggerThisTurn"; trigger: TriggerEvent } // このターンの間、相手のスピリットの指定トリガーを発揮させない（GameState.triggerSuppressionThisTurn。BS04ユーサネイジア＝破壊時）
    | { type: "destroyAllNexusesWithCores" } // コアが1個以上置かれている両陣営のネクサスをすべて破壊する（nexusIndestructible等の破壊耐性はdestroyNexus内で尊重。フレイム・エルク）
    | { type: "voidCoreToAllOwnByFamily"; families: string[]; count: number } // ボイドからコアcount個ずつを、指定系統のいずれかを持つ自分のスピリットすべての上に置く（太陽花ゾンネ・ブルム）
    | { type: "voidCoreToTarget"; count: number } // ボイドからコアcount個を対象の自分スピリットの上に置く（targetInstanceId優先、未指定時は自分の実効BP最大。ポーションベリー）
    | { type: "refreshByFamilyAuto"; count: number } // 疲労中の自分スピリットの最多系統を自動指定し、その系統の疲労スピリットを最大count体回復させる（プレイヤー選択の決定的簡略化。cantAttackThisTurnは付与しない。フロックリカバリー）
    | { type: "selfBuffByHandDiscard"; discardCardType: "spirit" | "nexus" | "magic"; amount: number } // 手札の指定種別カード1枚を破棄することで、このスピリット自身をBP+amountできる（任意コスト。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）で破棄カードを選ぶ、自動時は手札末尾の該当カードを破棄して発動。該当カードなしはno-op。城壊しのデニス／島持ちのフランシス）
    | { type: "grantKeywordToHandCard"; keyword: Keyword; familyFilter?: string; cardType?: "spirit" | "nexus" | "magic" } // 手札の条件一致（cardType/familyFilter）カード1枚に、このターンの間キーワードを付与する（PlayerState.tempHandKeywordGrants。interactiveTargets時はcard choiceで選択、自動時は手札末尾の該当カード。該当なしはno-op。付与はcardId単位＝同名重複カードにも効く簡略化。ビートプリースト）
    | { type: "coreTradeToOpponentTrash" } // 自分のリザーブのコアをX個自分のトラッシュへ置き、同数だけ相手のリザーブのコアを相手のトラッシュへ置く（Xの上限はmin(自分のリザーブ,相手のリザーブ)。interactiveTargets時はkind:"option"のoption choice（「1個」〜「上限個」、optional=スキップ可＝0個）、自動時は上限個。ポイズンミスト）
    | { type: "voidCoreToOwnNexuses"; colorFilter?: Color; count: number; single?: boolean } // ボイドからコアcount個ずつを、指定色（省略時は色不問）の自分のネクサスすべての上に置く（該当ネクサス0はログのみ。ボルカノ・ゴレム）。single指定時は1つだけ（interactive時はpendingChoice、そうでなければコアが最も少ないネクサス。BS04薬師ギルママール）
    | { type: "attackTriggersAsBlockThisTurn" } // 対象の自分スピリット1体の『このスピリットのアタック時』効果を、このターンの間『このスピリットのブロック時』に発揮させる（アタック時には発揮されなくなる＝移し替え。targetInstanceId優先、未指定時は自分の実効BP最大。BS05ブレイブチャージ）
    | { type: "addSymbolThisTurn"; anySide?: true } // 対象の自分スピリットの tempExtraSymbols をこのターンの間+1する（targetInstanceId優先、未指定時は自分の実効BP最大。「自分か相手」は自分側のみの簡略化。ダブルハート）
    | { type: "levelUpThisTurn"; anySide?: true } // 対象の自分スピリットの levelOverrideThisTurn を currentLevel+1（カードの最大Lvでキャップ）に設定する（targetInstanceId優先、未指定時は自分の実効BP最大。「自分か相手」は自分側のみの簡略化。ビルドアップ）
    | { type: "discardOpponentDownTo"; limit: number } // 相手の手札がlimit枚を超えている場合、limit枚になるまで破棄する（既存discardOpponentへcount=手札枚数-limitを計算して委譲。0以下は不発。奇術師オリバー）
    | { type: "bpBuffByExhaustOwn" } // 回復状態の自分スピリット1体を疲労させ、このターンの間、自分のスピリット1体をその実効BP分バフする（interactiveTargets時は疲労元→バフ先の2段choice、自動時は実効BP最大の回復スピリットを疲労させバトル中の自分スピリット（いなければフィールド先頭）をバフ。回復スピリットがいなければ不発。ユナイテッドパワー）
    | { type: "exhaustOpponentToMatch" } // 自分の疲労スピリット数と同数になるまで相手のスピリットを疲労させる（差分=自分の疲労数-相手の疲労数。0以下は不発。既存exhaustの単体処理へcountを渡して委譲し、armor/免疫/interactive choiceを自然に通す。セイムタイアード）
    | { type: "tenshoCoreDump"; dest: "trash" | "void" } // 【転召】のpendingChoice再開専用（cards.jsonには書かない）。targetInstanceIdで指定された自分のスピリットの上のコアすべてをdestへ（trash=持ち主のトラッシュ、void=消滅）。維持コア割れは既存の消滅処理（destroySpirit "deplete"）に委ねる
    | { type: "handMagicToTegamotoDraw" } // 自分の手札にあるマジックカードを好きなだけ手元（PlayerState.tegamoto）に置き、置いた枚数ぶんデッキから引く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行（選ぶたび1枚移動+1ドローし、手札にマジックカードが残っていれば再度choiceを発行。スキップで終了）。自動時は該当カードすべてを一括移動して同数ドロー（決定的簡略化）。マジックブック
    | { type: "discardOpponentTegamotoDestroyPer" } // 相手の手元（tegamoto）にあるカードすべてを相手のトラッシュへ破棄し、その枚数を既存のdestroyアクション（count=枚数、maxBpなし=BP不問）へ委譲して相手スピリットを破壊する（interactive時の連続対象選択・装甲/免疫判定はdestroy側の経路をそのまま再利用）。相手の手元が0枚ならno-op。透明人間エクリア
    | { type: "coreToTrashAllByCost"; maxCost: number } // 相手のコストmaxCost以下のスピリットすべての上から、コア1個ずつを相手のトラッシュへ置く（範囲効果。装甲・マジック効果耐性・immuneToOpponentThisTurnは対象から除外。BS04風龍王フージャオス）
    | { type: "coreRemovePerHandDiscard" } // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき相手のスピリット1体（実効BP最大を自動選択、同一解決内で既に選んだ個体は除外して異なる個体へ広げる）のコアを1個、相手のトラッシュへ置く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行し、選ぶたび即座にコア除去を実行する（対象選択自体は毎回自動）。自動時は手札をすべて破棄し、破棄枚数ぶん一括でコア除去する（決定的簡略化）。王蛇ケツァルカトル／ダンスマカブル
    | { type: "bpBuffAllByArmorColors"; amountPer: number } // 自分の【装甲】を持つスピリットすべてを、それぞれが持つ装甲の指定色数×amountPerだけBP+（ターン終了時まで。静的keyword＋一時付与tempKeywordsの装甲colorsを合算して色数を数える。BS05アイシクルアサルト）
    | { type: "voidCoresAndMillByCost"; familyFilter: FamilyFilter } // familyFilter一致（配列＝OR）の自分のスピリット1体（interactiveTargets時はpendingChoice、自動時はコスト最大を選ぶ＝mill枚数を最大化する決定的簡略化）のコアすべてをボイドに置き、そのスピリットのコストと同じ枚数だけ相手のデッキを上からトラッシュへ送る（該当スピリットがいなければ不発。BS05マジックスパナ）
    | { type: "lendSelfThisTurn" } // このマジック自身を、このターンの間だけ自分の仮想発生源（PlayerState.turnVirtualInstances）として場に置いたものとして扱う。
    // 同じカードの他の効果エントリ（levels:null必須）が effectSources() 経由で継続効果として一斉に有効になる（TURN_EFFECT_SOURCES.md §3。BS05リアニメイト）
    | { type: "coreRemoveMulti"; targets: number; count: number; dest?: "trash" | "void"; costFilter?: { max?: number; min?: number } } // 相手スピリットtargets体（costFilter一致・実効BP上位から自動選択で重複なく選ぶ。プレイヤー選択の簡略化。interactiveTargets時は1体ずつ選択→queueで残数を繰り越す）それぞれのコアをcount個ずつ、dest指定先へ（省略時はリザーブ、trash=持ち主のトラッシュ、void=消滅）。装甲/マジック効果耐性は対象ごとに判定して除外（BS05ガストラス：コスト1以下2体からコア2個ずつをトラッシュへ）
    | { type: "summonFromTrashFree"; costFilter: { max?: number; min?: number }; colorFilter?: Color } // 自分のトラッシュにあるcolorFilter色（省略時は色不問）・costFilter範囲のスピリットカード1枚（コスト最大、同コストは末尾＝新しい方から自動選択。プレイヤー選択の簡略化）を、コストを支払わずに召喚する。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットのonSummon効果は発揮されない（BS05妖狐キュービック：コスト5/6/7の紫）
    | { type: "nexusCoresToTrash"; side: "opponent" | "both" } // 指定側（相手/両陣営）のネクサスすべての上に置いてあるコアすべてを、各持ち主のトラッシュへ置く。ネクサスはコア0になっても消滅しない（BS03フォールダウン＝both）
    | { type: "drawUpTo"; size: number } // 自分の手札がsize枚になるまでデッキから引く（既にsize枚以上ならno-op。デッキ切れ判定はdrawへ委譲。BS03フォースドロー）
    | { type: "trashSpiritsToDeckBottom"; count: number } // 自分のトラッシュにあるスピリットカードを末尾（新しい方）から最大count枚、その順で自分のデッキの下に戻す（プレイヤー選択・順序指定の決定的簡略化。count枚未満しかなければ可能な分だけ。BS04トリックプランク）
    | { type: "voidCoresToNexusLevel"; level: number } // 自分のネクサス1つがlevelになるように、不足分のコアをボイドから置く（対象決定はvoidCoreToOwnNexusesのsingle分岐と同じ優先順＝targetInstanceId→interactiveTargets時はrequestChoice→自動時はコア数最少。既にそのレベル以上、またはそのレベルを持たないネクサスはno-op。BS04フルアッド＝Lv2）
    | { type: "opponentNexusOrReserveCoreToTrash"; count: number } // 相手のネクサス（コア数最多のものを自動選択）にコアがあればそこから、無ければ相手のリザーブから、count個を相手のトラッシュへ（どちらもコアがなければno-op。ネクサスのコアが減ってレベルが下がっても消滅はしない。BS02エナジードレイン）
    | { type: "bothSidesCoreToVoid"; count: number } // 両プレイヤーが各自のスピリット+ネクサスから、コアの多い個体から順に合計count個をボイドへ置く（1体で足りなければ次にコアが多い個体へ繰り越す。維持コア割れの消滅処理はスピリットのみ＝ネクサスは消滅しない。BS04インフェルノアイズ）

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
    | "allExhausted" // 両陣営の疲労スピリット数の合計（ownExhausted + exhaustedEnemies。BS05大甲帝デスタウロス）
    | "selfCoresAtDestruction" // 破壊時点でこのスピリット上に置かれていたコア数（destroySpiritが破壊直前に記録。漆黒鳥ヤタグロス）
    | "lastBattleDestroyedCores" // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（GameEngine.resolveBattleが記録、次のバトル解決の冒頭でリセット。魔界七将デストロード）
    | "opponentTrashCores" // 相手のトラッシュに置かれているコア数（PlayerState.trashCores。BS04吸血鬼ダンピール）
    | "selfSymbols" // このスピリット（self）自身が持つシンボル数（instanceSymbolCount。selfがnullなら0。BS05碧緑の竜使いグリューン：「このスピリットのシンボルと同じ数」）
    | { ownFamily: string }
    | { ownNameIncludes: string }
    | { ownColor: Color } // 自分のフィールドの指定色スピリット数
    | { ownColorSymbols: Color } // 自分のフィールドのスピリットが持つ指定色シンボルの合計数（BS04機動要塞キャッスル・ゴレム＝青シンボル）
    | { ownKeyword: Keyword } // 自分のフィールドで指定キーワードを持つスピリット数（静的・一時付与・継続付与すべて考慮。spiritHasKeywordで判定。BS05双剣虎ジェン・フー：【神速】持ち1体につき）

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
    | "ownSpiritSummoned" // 自分のフィールドにスピリットが召喚されたとき（doSummonの召喚時効果・転召の解決後に発火）。**self には召喚されたスピリットが渡る**（selfOverride）ため、maxBpFromSelf で「召喚されたスピリットのBP以下」を表現できる（BS04七龍帝の玉座Lv2／鋼葉の樹林Lv2）
    | "opponentDeckMilled" // 相手のデッキがトラッシュへ送られたとき（millDeckから発火。eventCount=実破棄枚数。minEventCountで「一度に◯枚以上」を表現。BS04アリゲイド）
    | "opponentMagicUsed" // 相手がマジックの効果を使用したとき（resolveMagicから発火。eventInfoにcost/timingを載せ、magicCostEquals・magicTimingで絞る。BS04氷の女神フリッグ）

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
    | "targetArmorColors" // **対象自身**（発生源ではない）が持つ【装甲】の指定色数。静的・一時付与・継続付与を合算・重複除く（BS05アイシクルアサルト）
    | { ownFamily: string } // 自分フィールドの指定系統を持つスピリット数（発生源自身も含む）
    | { ownNameIncludes: string } // 自分フィールドでカード名にこの文字列を含むスピリット数（発生源自身も含む。アルカナプリンス・オベロ）

// 常時BP修正（オーラ）の発動条件。満たすときのみ amount を適用する。
export type AuraCondition =
    | { hasOwnColor: Color } // 自分フィールドに指定色のスピリットまたはネクサスがある
    | { hasOwnColorSpirit: Color } // 自分フィールドに指定色のスピリットがいる
    | { hasOwnFamily: FamilyFilter } // 自分フィールドに指定系統のスピリットがいる（自身を含んでよい。配列＝いずれかの系統でOR。BS05黄道の虚空）
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
    familyFilter?: FamilyFilter // ownAll 用: 指定系統（静的付与・familyGrant による付与を含む。matchesFamilyFilter で判定）を持つスピリットのみ。配列＝いずれかの系統でOR（ポム／BS04翼持つ者の空域）
    vanillaFilter?: true // ownAll 用: カードに効果の記述を持たない（バニラ）スピリットのみ（無法者の荒野）
    lentOnly?: boolean // 仮想発生源（PlayerState.turnVirtualInstances。マジックが lendSelfThisTurn で貸した場合）からのみ有効。実在するスピリット/ネクサスからは適用しない＝恒久化を防ぐ（TURN_EFFECT_SOURCES.md。パワーオーラ等）
    attackingOnly?: boolean // ownAll 用: バトル中のアタッカーのみ（board.battle.attackerInstanceId と一致。battlingOnly と異なりブロッカーは含まない。オフェンシブオーラ／フォレストオーラ）
    minSymbols?: number // ownAll 用: 対象スピリットのシンボル数（instanceSymbolCount）がこれ以上のときのみ有効（一角竜ヴォルスング）
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
    | { type: "cantAttack"; unlessOpponentHasColorSpirit?: Color } // このスピリットはアタックできない（カイザレオン大帝Lv1）。unlessOpponentHasColorSpirit 指定時は「持ち主から見た相手のフィールドに指定色のスピリットがいない間」だけ有効（activeConstraints が判定して外す。BS04鎧装獣ヘイズ・ルーン＝赤）
    | { type: "lifeDamageToVoid" } // このスピリットがアタッカーとしてライフダメージを与えるとき、相手のライフから取り除かれるコアはリザーブでなくボイドへ（スライミーLv3）
    | { type: "noRestWhenBlockingColor"; color: Color } // このスピリットが指定色のスピリットをブロックしたとき疲労しない（巨神機トール）
    | { type: "noRefresh" } // このスピリットはリフレッシュステップで回復しない（スクルディア）
    | { type: "tenshoCoreSubstitute" } // このスピリットが【転召】の対象になったとき、疲労していなければ、疲労することでコアすべてを指定場所に置いたものとして扱う（実際にはコアを失わない代替。dumpAllCoresTenshoが判定する。BS05白亜の竜使いアルブス）

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）
    | { type: "ownNexusIndestructible" } // 発生源の持ち主のネクサスすべては、相手の効果によって破壊されない
      // （hasGlobalConstraintの両陣営走査とは異なり、destroyNexusが破壊対象ネクサスの持ち主のフィールドのみを判定する。サファイアの城壁）
    | { type: "maxSpiritsOnField"; max: number } // 両陣営とも、フィールドのスピリットがmax体以上のときは召喚できない（メインステップの通常召喚のみ。BS04旋風渦巻く渓谷＝5体以上召喚できない＝max4）
    | { type: "costCantAct"; maxCost: number } // コストがmaxCost以下のスピリットは、アタックとブロックができない（両陣営。shared/rules.tsの専用判定costCantActが参照。BS05白夜の虚空Lv1=maxCost1、青嵐の虚空Lv1=maxCost2）
    | { type: "millCap"; maxCount: number; perTurn?: boolean } // 発生源の持ち主のデッキは、相手の効果によるミル（mill/millPer/粉砕/voidCoresAndMillByCost等）でmaxCount枚を超えて破棄されない
      // （ownNexusIndestructibleと同様に発生源の持ち主のみに効く。EffectModules.millCapForがeffectSources経由で判定＝lendSelfThisTurnで貸与可。
      // perTurn省略時=1回のミルにつきmaxCount枚まで（BS05エターナルシールド：5枚まで＝6枚以上破棄されない）。
      // perTurn:true=ターン累計でmaxCount枚まで（GameState.millCountThisTurnで加算管理。BS04侵されざる聖域Lv2：ターンに5枚まで）
    | { type: "battlingCoresProtected" } // 現在バトルをしている両陣営のスピリット上のコアは、効果（コア除去アクション）によって取り除かれない
    | { type: "battlingEffectImmune" } // 現在バトルをしている両陣営のスピリットは、お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る。EffectModules.isEffectBlocked が破壊・コア除去・疲労・バウンス等のガードから参照。BS05茨の決戦地Lv2）
      // （removeCores/removeCoresToTrash/removeCoresToVoidの共通フックで判定。coreSqueezeAll/One・coreDrainAllOthers・coreToVoidOwnなど
      // 直接コアを操作する一部アクションはこの経路を通らないため対象外＝簡略化。BS05茨の決戦地Lv1-2）

// 破壊の発生源コンテキスト（省略可）。復活系効果（reviveOnDestroy）が参照する。
export interface DestroyContext {
    sourcePid?: PlayerId // 破壊を引き起こした効果の持ち主（相手の効果による破壊か判定する）
    sourceType?: "spirit" | "nexus" | "magic"
    battle?: { attackerColors: Color[]; attackerLevel?: number } // バトルによる破壊のときの「破壊した側（勝者）」の色・レベル（装甲・reviveOnDestroy判定用。呼び出し側の命名は歴史的にattacker*だが、実際は勝者側の値を渡す）
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
          optional: boolean // 「〜できる」= 任意。interactiveTargets（実対戦）では発動確認の
          // pendingChoice（kind:"option" / confirm:true）を出し、選ばなければ発動しない。
          // interactiveTargets=false（テスト）では従来どおり常に発動する
          battleRole?: "attacker" | "blocker" // onBattle 専用：勝利したときの自分の役割がこれと一致する場合のみ発火（省略時は従来通り常に発火）
          condition?:
              | { opponentNexusColorsAtLeast: number } // 指定時、持ち主から見て相手フィールドのネクサスの色数（重複除く）がこれ以上のときのみ発火（溶海竜プレシオスLv3）
              | { ownFieldHasColorSpirit: Color } // 発生源の持ち主のフィールドに指定色のスピリットがいるときのみ発火（tempColors考慮＝instHasColor。オチョゴ／ジェルフィ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（天使キュリオ）
              | { targetSameLevelAsSelf: true } // fireTriggerのtargetInstanceIdのスピリットのLvがselfのLvと同じときのみ発火（onBlocked用。剣竜ステゴラーサウルス）
              | { ownFieldHasKeyword: Keyword } // 発生源の持ち主のフィールドに指定キーワード持ちのスピリットがいるときのみ発火（一時/継続付与も考慮＝spiritHasKeyword。BS04クナノミ＝覚醒）
              | { firstAttackOfTurn: true } // そのターンの最初のアタックのときのみ発火（GameState.attacksThisTurn === 1。BS04ダックル）
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
              | { ownFieldSymbolColorsAtLeast: number } // 自分のフィールド（スピリット+ネクサス）が持つシンボルの色の種類数（重複除く）がこれ以上のときのみ実行（BS05ブランチロック）
      }
    | {
          id: string
          kind: "step"
          step: Phase // 発火するステップ
          turn: "own" | "opponent" | "both" // own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時、both=常に
          levels: number[] | null
          action: EffectAction
          optional?: true // 「〜できる」= 任意。triggered.optional と同じく、interactiveTargets では発動確認を出す（BS02皇帝アンプルール：リザーブのコアを払う任意コスト）
          condition?:
              | "handNotGreaterThanOpponent" // 持ち主の手札枚数が相手以下（主無き古城Lv2）
              | "selfWasRefreshedThisStep" // 発生源自身がこのリフレッシュステップで回復した場合のみ（PhaseManagerが渡すrefreshedInstanceIdsで判定。魔界侯爵コキュートス）
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（道化師クラン）
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上（BS04王蛇の住処＝妖蛇/無魔）
              | { ownHandAtLeast: number } // 発生源の持ち主の手札がこの枚数以上（BS04水蛇シーサーペンタ＝Lvごとに10/8/6枚以上）
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 発生源の持ち主のフィールドに、カード名にいずれかの文字列を含むスピリットが合計count体以上（BS04郵便ペンタン＝ペンタン/アンプルール）
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
          kind: "sokuPaySourceGrant" // 発生源が場にありレベル有効の間、持ち主の【神速】召喚で、コストをフィールドのコアからも支払えるようにする（基礎ルールでは神速召喚の支払いはリザーブのみ）。shared/rules.sokuPayableInstanceIds が集計し、RuleValidator.validateSummon とクライアントの支払いUIが共用する
          levels: number[] | null
          scope: "anyField" | "self" // anyField=持ち主のフィールドのスピリット/ネクサスすべて（BS04旋風渦巻く渓谷Lv2＝取得元の制限が無くなる）／self=発生源自身の上のみ（BS04甲殻戦士ロングホーンLv2-3＝ロングホーン上か自分のリザーブから）
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" // 指定時、発生源の持ち主がturnPlayerのときのみ有効（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "magicTargetRedirect" // 発生源が場にありレベル有効の間、**相手が使用したマジック**が発生源を対象に含むとき、そのマジックの効果の対象を発生源のみにする（＝持ち主の他のスピリットは、そのマジックの効果を受けない）。EffectModules.resolveMagic が GameState.magicRedirectTo を立て、isEffectBlocked が参照する（BS04アルカナソルジャー・サンクLv2）
          levels: number[] | null
          turn?: "opponent" // 指定時、発生源の持ち主がturnPlayerでないときのみ有効（『相手のターン』）
      }
    | {
          id: string
          kind: "constraintSuppression" // 発生源が場にありレベル有効の間、**持ち主の**対象スピリットが持つ指定タイプの制約を発揮させない（shared/rules.activeConstraints が合成結果から除外する。BS04獣使いドヴェルグ＝「鎧装獣」の「アタックできない」）
          levels: number[] | null
          target: "ownAll"
          constraintType: ConstraintDef["type"] // 発揮させない制約のタイプ
          nameContains?: string // 指定時はカード名にこの文字列を含むスピリットのみ
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ
      }
    | {
          id: string
          kind: "battleWon"
          role: "attacker" | "blocker" | "any" // 持ち主のスピリットがこの役割で勝利したとき（ネクサスのバトル結果誘発）。any=どちらの役割でも
          levels: number[] | null
          action: EffectAction
          turn?: "own" // 指定時、発生源の持ち主がturnPlayerのときのみ発火（深緑の樹海）
          vanillaWinnerOnly?: true // 勝利したスピリットがカードに効果の記述を持たない（バニラ）ときのみ発火（運命分かつ岐路／深緑の樹海）
          winnerNameContains?: string // 勝利したスピリットのカード名がこの文字列を含むときのみ発火（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS04ニーベルングリング）
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
          colorFilter?: Color // event: "ownSpiritDestroyed" | "ownSpiritBlocked" | "anySpiritAttacked" 限定：対象スピリットの色がこれと一致するときのみ発火
          // （祝福されし大聖堂／花の子リップ／BS05天焦がす大聖火。anySpiritAttackedはeventColors=instColors(アタックしたスピリット)で判定）
          selfMode?: "source" // 指定時、resolveActionのselfにイベント対象（アタックしたスピリット等）でなく発生源インスタンス自身を渡す（battleWonのselfModeと同じ。BS04鎧装獣ヘイズ・ルーン＝自身が回復する）
          vanillaOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがカードに効果の記述を持たない（バニラ）ときのみ発火（運命分かつ岐路）
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火（運命分かつ岐路）
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上のときのみ発火（花の子リップ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（instHasColor判定。修理屋バラン・バラン）
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上のときのみ発火（BS04魔力満ちる泉＝四道3体以上）
              | "selfIsAttacking" // 発生源自身が現在のバトル（state.battle）のアタッカーであるときのみ発火（キノコノコ）
          repeatPerCount?: boolean // event: "ownFunsaiMilled" | "opponentHandAdded" 用：実カウント数ぶんアクションを繰り返す（省略時/falseは1回のみ。修理屋バラン・バラン／犬人マードック）
          minEventCount?: number // eventCount がこの値以上のときのみ発火（「一度に◯枚以上破棄したとき」。BS04アリゲイド＝5枚以上）
          magicCostEquals?: number // event: "opponentMagicUsed" 限定：使用されたマジックのコストがこれと一致するときのみ発火（BS04氷の女神フリッグ）
          magicTiming?: "main" | "flash" // event: "opponentMagicUsed" 限定：使用タイミングが一致するときのみ発火
          familyFilter?: FamilyFilter // event: "ownSpiritDestroyed" | "ownSpiritSummoned" 限定：破壊/召喚されたスピリットの系統がこれを含むときのみ発火（配列＝いずれかの系統でOR。英雄の喪失／BS04七龍帝の玉座・鋼葉の樹林）
          keywordFilter?: Keyword // event: "ownSpiritSummoned" 限定：召喚されたスピリットがこのキーワードエントリを静的に持つときのみ発火（hasKeywordで判定。BS05最古龍の顎：転召持ちが召喚されたとき）
          costFilter?: { max?: number; min?: number } // event: "ownSpiritDestroyed" | "anySpiritAttacked" 限定：破壊/消滅したスピリット、またはアタックしたスピリットのコストがmax以下/min以上のときのみ発火（BS05天使クレイオ：コスト2／BS04鎧装獣ヘイズ・ルーン：コスト1以下）
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          constraint: GlobalConstraintDef // フィールド発生源から全スピリット／全ネクサスに効く制約（発生源の持ち主を問わない。ただしownNexusIndestructibleは発生源の持ち主自身のみに効く）
          condition?: { ownVanillaSpiritsAtLeast: number } // constraint: "ownNexusIndestructible" 用：発生源の持ち主のバニラスピリット数がこれ以上のときのみ有効（サファイアの城壁）
          phase?: Phase // constraint: "battlingCoresProtected" 用：指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" | "both" // constraint: "battlingCoresProtected" 用：own=発生源の持ち主がturnPlayerのとき（『自分のアタックステップ』。BS05茨の決戦地）
      }
    | {
          id: string
          kind: "mustBlockGrant" // 発生源が場にありレベル有効の間、発生源の持ち主のスピリットのアタックに対し、相手は可能ならば必ずブロックしなければならない（RuleValidator.validateTakeLifeが参照。燃えさかる戦場Lv2／BS04翼持つ者の空域Lv2）
          levels: number[] | null
          familyFilter?: FamilyFilter // 指定時はその系統（配列＝OR）を持つアタッカーのアタックのみ強制ブロック
          firstAttackOnly?: boolean // trueならそのターンの最初のアタックのみ（燃えさかる戦場Lv2）
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのとき（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "awakenFromReserve" // 発生源が場にありレベル有効の間、持ち主のスピリットすべての【覚醒】は「自分のスピリット上」に加えて**自分のリザーブ**からもコアを置けるようになる（BS05合成恐竜ディノゾールLv2の効果差し替え。GameAction awaken の fromInstanceId に AWAKEN_FROM_RESERVE を渡す）
          levels: number[] | null
          target: "ownAll"
      }
    | {
          id: string
          kind: "bpBuffSuppression" // 発生源が場にありレベル有効の間、**発生源の持ち主から見た相手**のスピリット/ネクサス/マジックによる「BPを+する」効果（BP増加アクション・BP増加オーラ・magicBuffBonus）を発揮させない（BS04古代闘技場Lv1）。BPを-する効果は対象外
          levels: number[] | null
          phase?: Phase // 指定時はこのステップの間のみ有効
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "triggerSuppression" // 発生源が場にありレベル有効の間、**発生源の持ち主から見た相手**のスピリットの指定トリガーを発揮させない（BS04古代闘技場Lv2＝召喚時）
          levels: number[] | null
          trigger: TriggerEvent
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのとき、opponent=持ち主が非turnPlayerのとき（『相手のメインステップ』＝opponent）
      }
    | {
          id: string
          kind: "costMod" // 加算：軽減後コストに amount を足す（ルビーの太陽：白のカード全体+1）
          levels: number[] | null
          mode?: undefined // 置換は下の mode:"set" 側の枝。ここで set を書けないようにして両者を排他にする
          amount: number // 軽減後コストに加算する量
          colorFilter?: Color // 対象カードの色（省略時は色不問。発生源・対象カードの持ち主は問わない＝両陣営に効く）
          cardType?: CardType // 対象カードの種別（省略時は種別不問。螺旋の塔：マジック限定）
          side?: "opponent" // 指定時は「発生源の持ち主から見て相手」のカードのみに適用
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 発生源の持ち主基準のステップ・turn条件（螺旋の塔）
          condition?: { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統がcount体以上（BS04魔力満ちる泉）
      }
    | {
          id: string
          // 置換：使用コストを setTo にする（BS05パントマイスター＝手札の系統「氷姫」を5に／
          // ゴッドスピード＝手札の【神速】コスト6以上を4に）。effectiveCost は「置換 → costMod加算」の順で
          // 適用し、置換が効くときは軽減シンボルを一切適用しない（原文「コストを◯にする」の値をそのまま使う）。
          // **加算側のフィールド（colorFilter / cardType / side / phaseTurn / condition）はここには書けない**。
          // costSetOverride が読まないため、書けてしまうと絞り込みが無言で無視される（型で塞いである）。
          // また costSetOverride は effectSources(board, usingPid)＝自分の発生源しか見ないため、
          // 「相手のカードのコストを◯にする」は構造上表現できない（必要になったら side をこの枝に足す）
          kind: "costMod"
          levels: number[] | null
          mode: "set"
          setTo: number // 置換後のコスト値（旧 amount。2026-07-26 改名。「+5」と読み違えないため）
          familyFilter?: FamilyFilter // 対象カードが持つ系統（カード静的 family のみ。配列＝OR。パントマイスター＝氷姫）
          keywordFilter?: Keyword // 対象カードが静的に持つキーワード（hasKeyword で判定。ゴッドスピード＝神速）
          costFilter?: { max?: number; min?: number } // 対象カードの元コストの範囲（ゴッドスピード：6以上）
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
          minBp?: number // scope:"ownAll" 用：対象スピリットの実効BPがこれ以上のときのみ（BS04強者統べる大地＝BP6000以上）
          familyFilter?: FamilyFilter // scope:"ownAll" 用：指定系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ対象（BS05氷の魔女ヘル）。発生源自身は呼び出し側のループが除外済み（「[カード名]以外」の簡略化）
          requireOwnFieldHasName?: string // 持ち主のフィールド（スピリット）にこのカード名を持つ個体が1体以上いるときのみ有効（BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
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
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定）を持つスピリットのみ（BS05黄道の虚空Lv2：転召持ちに光芒を付与）
          colors?: Color[] // keyword:"armor"用：付与する装甲の対象色。EffectModules.refreshLevelAsOverridesがCardInstance.armorColorsGrantedへ毎回再計算して反映し、
          // hasArmorAgainstがそれを見る（既存のtempKeywords装甲colorsと同じ判定経路。BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白を付与）
          costFilter?: { max?: number; min?: number } // 指定時は対象スピリットのコストがmax以下/min以上のみ（matchesCostFilterで判定。BS04侵されざる聖域：コスト8以上）
          phase?: Phase // 指定時はこのステップの間のみ有効（turnPlayerを問わない＝『お互いの〜ステップ』）
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ（aura.vanillaFilterと同型。BS05サーキュラーソー・アーム）
      }
    | {
          id: string
          kind: "familyGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに系統を継続付与する（ポム／生み出される尖兵）
          levels: number[] | null
          target: "ownAll"
          family?: string // 付与する系統（familyFromChoice 指定時は不要）
          familyFromChoice?: true // family の代わりに、発生源インスタンスの lentChoiceFamily（貸与時にプレイヤーが選んだ系統）を付与する（音鳥クルーク）
          familyFilter?: string // 指定時はこの系統を持つスピリットのみ（**カード静的な family のみで判定する**＝付与系統は見ない。付与された系統を見ると spiritHasFamily が自己再帰する。音鳥クルーク＝歌鳥）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（音鳥クルーク）
          colorFilter?: Color // 指定時は対象スピリットの色がこれと一致するときのみ
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』）
          condition?: { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上
      }
    | {
          id: string
          kind: "alsoCostGrant" // 発生源が場にありレベル有効の間、持ち主のスピリットすべてを「コストNのスピリットとしても扱う」（継続。EffectModules.refreshLevelAsOverrides が CardInstance.alsoCostsContinuous へ毎回再計算し、instHasCost / instMatchesCostFilter がそれを見る。道化師クラン）
          levels: number[] | null
          target: "ownAll"
          cost: number // 「このコストとしても扱う」値
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（道化師クラン）
      }
    | {
          id: string
          kind: "reductionGrant" // 発生源が場にありレベル有効の間、条件成立時に対象カード種別/色の使用コストへ軽減シンボルを付与する（ペンタン／天使バーチュ）
          levels: number[] | null
          cardType?: CardType // 対象カード種別（省略時は種別不問）
          cardColor?: Color // 対象カードの色（省略時は色不問）
          keywordFilter?: Keyword // 対象手札カードがこのキーワードエントリを静的に持つ場合のみ付与（hasKeyword判定。フルミンゴ）
          familyFilter?: FamilyFilter // 対象カードが持つ系統（カード静的な family のみ＝手札のカードが対象のため付与系統は考慮しない）。配列＝いずれかの系統でOR（BS04七龍帝の玉座＝古竜/龍帝）
          symbols: Color[] // 与える軽減シンボル
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（ペンタン）
              | { ownColorSpiritsAtLeast: { color: Color; count: number } } // 発生源の持ち主の指定色スピリットがcount体以上（ネクサスは数えない。BS04黒の妖精ティ・ターニャ）
      }
    | {
          id: string
          kind: "immunityGrant" // 発生源の持ち主の familyFilter 一致スピリットすべては、相手のマジックの効果を受けない（ポークン）
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝いずれかの系統でOR。matchesFamilyFilterで判定）を持つスピリットのみ（BS05白亜の竜使いアルブスLv2-3：龍帝/虚神）
          includeSelf?: boolean // 指定時は familyFilter に関わらず発生源自身も対象に含む（BS05白亜の竜使いアルブス：自身は竜騎/機人で対象系統を持たないが対象に含む）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。BS05リトルナイト・ランスロット：黄）
          against: "magic"
          condition?: { ownCostCountAtLeast: { cost: number; count: number } } // 発生源の持ち主のフィールドに指定コストのスピリットがcount体以上のときのみ有効（BS05リトルナイト・ランスロット：コスト2が3体以上）
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
              | { ownFieldHasFamily: string } // 発生源の持ち主のフィールドに指定系統を持つスピリットがいる間有効（BS04鼠人チューリヒ＝戦獣）
          sourceMinLevel?: number // 発生源の素のレベル（コア数基準。上書き無視）がこれ以上のときのみ有効
          sourceLevels?: number[] // 発生源の素のレベル（コア数基準。上書き無視）がこの配列に完全一致で含まれるときのみ有効（sourceMinLevelの完全一致版。ウッド・ゴレム）
      }
    | {
          id: string
          kind: "colorAs" // 発生源自身（target:"ownAll" 指定時は持ち主のスピリットすべて）が指定色のスピリットとしても扱われる（継続。EffectModules.refreshLevelAsOverridesが毎回再計算する。levelsで発動レベルを指定＝百面相のフラットフェイス）
          levels: number[] | null
          colors: Color[]
          target?: "self" | "ownAll" // 省略時は "self"。"ownAll"＝発生源の持ち主のスピリットすべて（妖精ティングリー）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（妖精ティングリー）
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
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ（matchesFamilyFilterで判定。BS05紫煙の竜使いヴァイオレット：龍帝/虚神）
          keywordFilter?: Keyword // 指定時はこのキーワードエントリを静的に持つスピリットのみ（hasKeywordで判定。BS05藍紫の虚空：転召持ちにアタック時効果を付与）
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
          trigger?: "manual" | "effect" // 省略時="manual"（従来通り。moveCore/awakenのみ、持ち主の相手のメインステップ限定）。
          // "effect"指定時はスピリット/ネクサス/マジックの効果によるコア増加時に判定し、フェーズ不問（BS05アブソーブシンボル。lendSelfThisTurnで貸与）
          onRemove?: boolean // trigger:"effect"用：trueなら効果によるコア減少時にも同様に疲労させる（アブソーブシンボルは増加・減少どちら）
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
    coresAtDestruction?: number // 破壊直前に置かれていたコア数（destroySpiritが記録。漆黒鳥ヤタグロス）
    levelAsContinuous?: number // 継続的な「Lv◯として扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（ナイフ投げのジャグリーン／トパーズの流星）
    levelOverrideThisTurn?: number // このターンの間のレベル上書き（ターン終了処理でリセット。皇帝アンプルール）
    lifeDamageNegatedFor?: PlayerId // このスピリットのアタックでは、ここに入っているプレイヤーのライフはこのターン減らない（ターン終了処理でリセット。BS04ミストカーテン）
    coresLinkedTo?: string // このネクサスのコア数を、リンク元スピリット（instanceId）のコア数と同じものとして扱う
    // （クロスシザース。本来は再指定まで永続だが、このターンの間だけの簡略化。ターン終了でリセット）
    coresOverride?: number // coresLinkedTo設定時、EffectModules.refreshLevelAsOverridesがリンク元スピリットの
    // 現在コア数から毎回同期する。currentLevelはこの値をcoresの代わりに使う（ターン終了でリセット）
    colorsAsContinuous?: Color[] // 継続的な「〜の色としても扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（百面相のフラットフェイス／妖精ティングリー）
    alsoCostsContinuous?: number[] // 継続付与された「このコストとしても扱う」値（kind:"alsoCostGrant"。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、instHasCost / instMatchesCostFilter が参照する。道化師クラン）
    lentChoiceFamily?: string // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ系統。仮想発生源にのみ載り、kind:"familyGrant" の familyFromChoice が読む（音鳥クルーク）
    tempExtraSymbols?: number // このターンの間の追加シンボル数（ターン終了でリセット。ダブルハート）
    attackTriggersAsBlockThisTurn?: boolean // このターンの間、『このスピリットのアタック時』効果を『ブロック時』に発揮する（アタック時には発揮しない。ターン終了でリセット。fireTriggerが参照。BS05ブレイブチャージ）
    armorColorsGranted?: Color[] // 継続付与された装甲の対象色（kind:"keywordGrant"のkeyword:"armor"。
    // EffectModules.refreshLevelAsOverridesが毎回全消去→再構築する。hasArmorAgainstが参照する（BS05白夜の虚空Lv2）
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
    turnVirtualInstances: CardInstance[] // このターンの間だけ「フィールドにあるもの」として扱う仮想の効果発生源（マジックが貸した継続効果。lendSelfThisTurn）。
    // ターン終了でリセット（PhaseManager.endTurn）。フィールドには実在しないため、シンボル集計（countSymbols / ownFieldSymbolColors）の対象にはならない（TURN_EFFECT_SOURCES.md §1・§2.1）
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
    cardZone?: "hand" | "trash" | "reveal" // kind:"card" のとき必須：どのゾーンから選ぶか（reveal=GameState.revealedCards の公開ゾーン）
    cardOwner?: PlayerId // kind:"card" のとき必須：ゾーンの持ち主（今回は常に pid 自身のゾーン＝pidと同値）
    cardIndices?: number[] // kind:"card" のとき必須：cardZone配列内の選択可能インデックス
    // （cardZone:"reveal" のときは GameState.revealedCards.cardIds のインデックス）
    optional: boolean // true ならスキップ（選ばない）可
    confirm?: true // 「〜できる」効果の発動確認（kind:"option" 限定）。選択肢は1つだけで、
    // **選んだラベルを chosenOption として action に渡さない**（渡すと選択肢を解釈するアクションが誤動作する）。
    // スキップ＝発動しない。EffectDef.triggered.optional が true のときに fireTrigger が立てる
    action: EffectAction // 選択後に resolveAction する本体
    actorPid?: PlayerId // action を「誰の効果として」解決するか。省略時は pid（選択者自身）。
    // **選択者と実行者が別**のケースで使う（BS02-012 ケンドラゴス：相手に色を選ばせて、破壊は発生源の持ち主の効果として行う）
    selfInstanceId: string | null // 発生源スピリット（self の復元用）
    queue: { selfInstanceId: string | null; action: EffectAction; actorPid?: PlayerId }[] // 中断された残りアクション
    // （actorPid 省略時は選択者 pid として解決する）
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
    triggerSuppressionThisTurn: { pid: PlayerId; trigger: TriggerEvent }[] // このターンの間、pid のスピリットの指定トリガーを発揮させない（ターン終了でリセット。ユーサネイジア）
    attacksThisTurn: number // このターンに宣言されたアタックの回数（doAttackで加算・ターン終了でリセット）。「ターンの最初のアタック」判定に使う（BS04ダックル／燃えさかる戦場Lv2）
    ignoreUnblockableThisTurn: PlayerId[] // このターンの間、ここに含まれるプレイヤーのスピリットは「ブロックされない」効果を無視してブロックできる（ターン終了でリセット。BS04レッドウォール）
    lastDestroyedNexus: { pid: PlayerId; cardId: string } | null // 直近に破壊されたネクサス（destroyNexusが誘発の直前に記録）。reviveLastDestroyedNexus が参照する（BS04戦闘獣ジャッカー）
    lastBattleDestroyedCores: number // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（次のバトル解決の冒頭でリセット。魔界七将デストロード）
    lastBattleDestroyedLevel: number // 直前のバトル解決でBP比較により破壊されたブロッカーのcurrentLevel（次のバトル解決の冒頭でリセット。0=まだ発生していない。魔界伯爵ヴィール）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 「デッキを上からN枚オープンする」の公開ゾーン（両者に見える一時領域）。
    // deckReveal が積み、手札に加える／デッキの下に戻す処理が終わったら消す。cardZone:"reveal" の選択元になる
    magicRedirectTo?: { pid: PlayerId; instanceId: string } // 解決中のマジックの対象が1体へ絞り込まれている間だけ立つ（kind:"magicTargetRedirect"。この pid のスピリットのうち instanceId 以外は、そのマジックの効果を受けない）。resolveMagic が解決の前後で設定・解除する
    lastBattleDestroyedColors: Color[] // 直前のバトルで「BPを比べ相手のスピリットだけを破壊した」ときの**破壊された側**の色（次のバトル解決の冒頭でリセット。TargetFilter.sameColorAsBattleLoser が参照。BS04獣使いドヴェルグ）
    lastBattleDestroyedFamilies: string[] // 同上の系統（TargetFilter.sameFamilyAsBattleLoser が参照。BS04ニーベルングリング）
    pendingChoice: PendingChoice | null // 効果解決中のプレイヤー選択（非null中は resolveChoice 以外のアクションを拒否する）
    turnStartResumeStep: number | null // ターン開始処理（start→core→draw→refresh→main）がステップ誘発のpendingChoiceで中断したときの再開ステップ番号。null=中断なし。選択解決後に resumeTurnStart が続きから再開する（百識の谷Lv1のドローステップ破棄選択など）
    interactiveTargets: boolean // trueなら誘発効果の対象選択候補2件以上でpendingChoiceを要求する（既定false。実対戦では server/src/index.ts が true に設定。smokeは既定のfalseのまま自動選択を使う）
    events: GameEvent[] // クライアント演出用の一時イベント列（handleAction冒頭でクリア）
    eventSeq: number // GameEvent.seq の通し番号（クリアしてもリセットしない）
    magicUsedThisTurn: Record<PlayerId, number> // このターンに各プレイヤーがマジックを使用した回数（ターン終了でリセット。magicRestriction:"oncePerTurnAll"用。作戦参謀フォクシン）
    millCountThisTurn: Record<PlayerId, number> // このターンに各プレイヤーが相手の効果でデッキを破棄された累計枚数（ターン終了でリセット。globalConstraint "millCap" の perTurn用。BS04侵されざる聖域Lv2。隠匿情報を含まないがGameViewには含めない＝サーバー内部のみで判定に使う）
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
    turnVirtualInstances: CardInstance[] // 公開情報のため自分/相手とも常に配信する（TURN_EFFECT_SOURCES.md §2.1）
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
    magicUsedThisTurn: Record<PlayerId, number> // このターンの各プレイヤーのマジック使用回数（隠匿情報なし。クライアントのmagicRestriction判定に必要＝作戦参謀フォクシン）
    ignoreUnblockableThisTurn: PlayerId[] // このターン「ブロックされない」効果を無視できるプレイヤー（隠匿情報なし。クライアントのブロック可否表示に必要＝レッドウォール）
    pendingChoice: PendingChoice | null // 相手視点では candidates を空配列・prompt をマスクして配信（viewFor）
    events: GameEvent[] // クライアント演出用の一時イベント列（隠匿情報なし。viewForがそのまま渡す）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 公開ゾーン（オープンされたカードは両者に見えるためマスクしない）
}

// ---- クライアント → サーバーのアクション ----

export type GameAction =
    | { type: "summon"; handIndex: number; level?: number; paySources?: PaySource[] } // 召喚（神速持ちはフラッシュ時も可）。level指定時はそのレベルに必要なコア数をリザーブから置いて召喚する（省略時はLv1）
    | { type: "setNexus"; handIndex: number; level?: number; paySources?: PaySource[] } // 配置。level指定時はそのレベルに必要なコア数をリザーブから置いて配置する（省略時はLv1）
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
