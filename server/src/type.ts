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
    maxCores?: number // 実際に置かれているコア数がこれ以下（cores＝完全一致とは別軸。BS03水龍王リヴァイア：コアが3個以下）
    rested?: true // 疲労状態（isRested）のものだけ（BS05吸血女王カーミラ：範囲破壊の疲労限定）
    nameContains?: string | string[] // カード名にこの文字列を含むものだけ（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）。配列＝いずれかの文字列を含めばよい（OR。BS08ダークパワー：「ダーク」/「ブラック」）
    sameColorAsBattleLoser?: true // 直前のバトルで破壊された側と同じ色（normalizeFilter が state.lastBattleDestroyedColors を color 軸へ解決する。記録が無ければ対象なし。BS04獣使いドヴェルグ）
    sameFamilyAsBattleLoser?: true // 直前のバトルで破壊された側と同じ系統（normalizeFilter が state.lastBattleDestroyedFamilies を family 軸へ解決する。記録が無ければ対象なし。BS04ニーベルングリング）
    sameBpAsBattleLoser?: true // 直前のバトルで破壊された側と同じ実効BP（normalizeFilter が state.lastBattleDestroyedBp を exactBp 軸へ解決する。記録が無ければ対象なし。BS03熾烈極める最前線Lv2）
    sameCostAsBlocker?: true // イベント対象として渡ってきたブロッカー（ctx.targetInstanceId）と同じコスト（normalizeFilter が cost 軸へ解決する。ブロッカーが見つからなければ対象なし。BS06計画された場外乱闘Lv2）
    keywordExclude?: Keyword // 指定キーワードを**持たない**もの（一時付与・継続付与も考慮。keyword の否定。BS07剣王獣ビャク・ガロウLv2＝【転召】を持たない相手）
    attackingOnly?: true // 現在のバトルのアタッカー（board.battle.attackerInstanceId）だけ。バトルが無ければ対象なし（「アタックしている自分のスピリット」。BS07桜の妖精オウカ）
    hasTrigger?: TriggerEvent // 指定トリガーの誘発効果を現在のレベルで静的に持つものだけ（instHasTriggerEffectで判定。継続付与は見ない。BS08プテラディア捕獲部隊＝『召喚時』効果持ち）
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
    | { type: "draw"; count: number; side?: "own" | "both" } // 自分がデッキから引く（side:"both"指定時は自分→相手の順で両者が引く。省略時=own＝従来どおり自分のみ。BS03巨猫ブリンクス：お互いドロー）
    | { type: "destroy"; filter?: TargetFilter; count: number; countPerOpponentTrashMagicColors?: boolean; anySide?: true; excludeTarget?: true } // 相手スピリットを破壊（絞り込みは filter。省略=BP不問、selfがnullで self 相対BP指定ならno-op）。countPerOpponentTrashMagicColors指定時はcountを無視し、相手のトラッシュにあるマジックカードの色の種類数（重複除く）を対象数として使う（BS05超獣王ベヒードス）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり実効BP最大を自動選択＝同値は相手側優先。BS01ランスラプトル等：修飾なしの「スピリット」）。excludeTarget指定時はtargetInstanceIdを「破壊する対象」ではなく「**除外する**対象」として扱う（誘発が渡すイベント対象を避ける。exhaust.excludeTargetと同型。BS06計画された場外乱闘Lv2：ブロックしたスピリット以外を破壊）
    | { type: "destroyOwnByFamilyThenWipeEnemy"; family: FamilyFilter } // 指定系統を持つ自分のスピリットすべてを破壊してから、相手のスピリットすべてを破壊する（BS04ストレートフラッシュ）
    | { type: "destroyDuplicateNames" } // 相手のフィールドに同じカード名のスピリットが2体以上いるとき、カード名1つにつき1体だけ残して残りを破壊する（残すのはフィールドの先頭側＝決定的簡略化。BS02マインドフレア）
    | { type: "destroyAll"; filter?: TargetFilter; anySide?: boolean; drawPerDestroyed?: true; voidCoreToSelfPerDestroyed?: true } // filter に一致する相手スピリットを全破壊。anySide指定時は両陣営が対象（filter.colorExclude で色除外＝BS04魔龍帝ジークフリードLv3：赤以外のBP4000以下すべて。filter.rested と cost.max の組み合わせで「疲労状態のコストX以下すべて」＝BS05吸血女王カーミラ）。drawPerDestroyed指定時は実際に破壊できた数ぶん自分がドローする（BS08ドラゴンスクランブル）。voidCoreToSelfPerDestroyed指定時は実際に破壊できた数ぶん、ボイドからコアをself上に置く（selfがnullならno-op。X003D極帝龍騎ジーク・クリムゾン）
    | { type: "selfBuff"; amount: number } // このスピリット自身をBP+（ターン終了時まで）
    | { type: "destroyNexus"; count: number; drawPerDestroyed?: number; discardOpponentPerDestroyed?: number; all?: boolean; side?: "opponent" | "both"; levelFilter?: number[] } // discardOpponentPerDestroyed指定時は、実際に破壊できたネクサス1つにつき相手の手札をその数だけ破棄させる（BS05鉄槌のオズワルドLv2） // 相手のネクサスを破壊（drawPerDestroyed指定時は実際に破壊できた数×ドロー）。all指定時はcountを無視し相手のネクサスすべてを破壊する（BS04風龍王フージャオス）。side指定時は破壊対象の陣営を切り替える（省略時はopponent＝従来どおり。BS01バスターファランクス＝both）。levelFilter指定時はcurrentLevelがこれに含まれるネクサスのみ対象（BS03バスターランス＝Lv1のみ）
    | { type: "returnSelfToHand" } // このスピリットを持ち主の手札に戻す
    | { type: "coreRemove"; count: number; dest?: "void"; anySide?: true; countCounter?: EffectCounter; leaveAtLeast?: number; filter?: TargetFilter } // leaveAtLeast指定時は、対象のコアがこの数を下回らないところまでしか取り除かない（BS04王蛇の住処Lv2「この効果で相手のスピリット上のコアを0個にはできない」） // 対象スピリットのコアを持ち主のリザーブへ置く（dest:"void"指定時はリザーブでなくボイドへ＝消滅。BS04ヴェノムショット）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり実効BP最大を自動選択＝同値は相手側優先。BS01ポイズンシュート：修飾なしの「スピリット」）。countCounter指定時はcountを無視しEffectCounterの値を除去枚数として使う（0ならログのみ。BS03巨人王ランドルフ：【粉砕】で破棄した枚数ぶん）。filter指定時は対象自動選択・明示ターゲットの両方にTargetFilterの絞り込みを適用する（BS08倒逆ピラミッド群：BP5000以下）
    | { type: "bpBuff"; filter?: TargetFilter; amount: number; amountFromSelfBp?: true } // 対象スピリット1体をBP+（ターン終了時まで）。filter.minSymbols 指定時、対象（targetInstanceId明示・自動選択とも）はシンボル数がこれ以上のスピリットのみ有効（ライトニングバリスタ等）。amountFromSelfBp指定時はamountを無視し、**発生源自身の実効BP**を加算量として使う（selfがnullならno-op。BS08機人フィアラル：BP+(このスピリットのBP)）
    | { type: "exhaust"; filter?: TargetFilter; count: number; anySide?: true; excludeTarget?: true; chooserIsTarget?: true; countFromBofu?: true } // 相手スピリットを疲労させる（絞り込みは filter。自動選択・明示ターゲット選択の両方に適用）。excludeTarget指定時はtargetInstanceIdを「疲労させる対象」ではなく「**除外する**対象」として扱う（誘発が渡すイベント対象を避ける。BS01甲精ディース：ブロックするスピリット以外を疲労させる） // chooserIsTarget指定時は、**疲労させられる側（相手）が対象を選ぶ**（実行は発生源の持ち主の効果として解決する。PendingChoice.actorPid。【暴風】＝「相手は、相手のスピリットを指定された体数疲労させる」） // countFromBofu指定時はcountを無視し、selfが持つ【暴風】の**実効**指定数（静的keywordのcount＋bofuCountBonusの加算。bofuCountFor）を使う。【暴風】の挙動を担うonBlockedエントリはカード側に固定値のcountを持つため、指定数を増やす継続効果（BS08ゲラン准将Lv2）を届けるにはここで解決し直す必要がある
    | { type: "destroyExhausted"; filter?: TargetFilter; count: number; anySide?: boolean; all?: true } // all指定時は範囲効果として条件を満たす疲労スピリットを**すべて**破壊する（対象選択を挟まない。countは無視。anySideと併用で両陣営。BS05ソウルクラッシュ） // 疲労状態の相手スピリットを破壊（anySide指定時は両陣営の疲労スピリットから実効BP最大の1体を自動選択して破壊。filter.cost で コスト条件＝BS04ヘルウィッチ）
    | { type: "drawPer"; counter: EffectCounter } // カウント値ぶん自分がドロー（0ならログのみ）
    | { type: "bpBuffPer"; counter: EffectCounter; amountPer: number; keywordFilter?: Keyword } // 対象スピリット1体を「カウント値×amountPer」だけBP+（0ならログのみ）。keywordFilter指定時は、そのキーワードを持つ自分のスピリットのみ対象（静的・一時付与・継続付与を考慮。BS07ネクサスアタック＝【強襲】持ち）
    | { type: "discardHandAll" } // 自分の手札をすべてトラッシュへ
    | { type: "bpBuffAll"; filter?: TargetFilter; amount: number } // 自分のフィールドのスピリットすべてをBP+（ターン終了時まで。filter.family 指定時は指定系統持ちのみ。配列＝いずれかの系統でOR）
    | { type: "returnToHand"; count: number; maxBpFromSelf?: boolean; countPerOpponentNexus?: boolean; anySide?: true; filter?: TargetFilter; costReserveToTrash?: number } // costReserveToTrash指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからトラッシュへ送ってから実行する（lifeCrush.costReserveToVoid と同じ方針。「〜することで」は任意コストなのでカード側で optional:true を立てる。BS07剣王獣ビャク・ガロウLv2）。// 対象スピリットを持ち主の手札に戻す（破壊ではないためonDestroyは誘発しない）。maxBpFromSelf=selfの実効BP以下の相手のみ（BS04鋼葉の樹林Lv2）。countPerOpponentNexus指定時はcountを無視し、相手のネクサス数を対象数として使う（BS05幻獣王リーン）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり実効BP最大を自動選択＝同値は相手側優先。BS01ヘル・ブリンディ等：修飾なしの「スピリット」）。filter指定時は対象自動選択・明示ターゲット（誘発が渡すtargetInstanceId）の両方に絞り込みを適用する（BS06レインディア＝ブロックしたスピリットが系統「空牙」のときのみ）
    | { type: "opponentHandToDeckTop"; count: number } // 相手は手札からcount枚を選んで自分のデッキの一番上に戻す（interactiveTargetsでは相手本人に選ばせる。自動時は手札末尾＝決定的簡略化。BS07魔札の占い師ディーシャLv2）
    | { type: "returnToDeckTop"; anySide?: true; count?: number } // count指定時はその体数ぶん繰り返す（順番は選べず、実効BP最大から。BS07ブリシンガメンの首飾り＝3体）。// 対象スピリットを持ち主のデッキの一番上に戻す。anySide指定時は自分/相手どちらのスピリットも対象にできる（destroy/returnToHandのanySideと同じ非対称ルール。BS01ドリームチェスト：修飾なしの「スピリット」）
    | { type: "coreCharge"; count: number } // 自分のリザーブから対象の自分スピリットへコアを最大count個置く
    | { type: "selfCoreToOwnLife"; count: number } // このスピリット（self）の上のコアをcount個、自分のライフに置く（selfがnull／コアが足りなければ可能な分だけ。維持コア割れは消滅処理を通す。BS07ライフセービング）
    | { type: "lifeCharge"; count: number; from?: "reserve" | "void" } // 自分のリザーブ（既定）から自分のライフへコアをcount個置く（不足なら可能な分だけ）。from:"void"指定時はボイドから置く＝リザーブを消費せず必ずcount個置ける（【聖命】。BS07）
    | { type: "refreshSelfByExhaustNexus" } // 自分の回復状態のネクサス1つを疲労させることで、このスピリットを回復する（【強襲】。ターン中の上限回数は self が持つ kind:"keyword" keyword:"kyoshu" の count から読む。疲労できるネクサスが無い／上限に達している／自身が回復状態なら不発）
    | { type: "coreGain"; count: number } // ボイドから自分のリザーブへコアをcount個追加
    | { type: "refreshAllOwn"; exemptFamily?: FamilyFilter } // 自分の疲労スピリットをすべて回復。回復した個体はこのターン中アタック不可。exemptFamily指定時は指定系統（配列＝OR。matchesFamilyFilterで判定）を持つ個体には cantAttackThisTurn を付与しない（BS06キャバルリー＝系統「戦騎」を持たないスピリットのみアタック不可）
    | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
    | { type: "swapBattler" } // バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える（テレポートチェンジ。バトル外・使用者がバトル非参加・疲労スピリット不在はno-op）
    | { type: "exhaustAllByColor"; side?: "opponent" } // 相手フィールドで最多の色を自動選択し（「色をひとつ選び」の決定的簡略化）、その色を持つ両陣営のスピリットを疲労させる。side:"opponent"指定時は相手のスピリットのみ（BS07大風車の丘）
    | { type: "exhaustAll"; side: "opponent" | "both"; minBp?: number; maxBp?: number; filter?: TargetFilter } // 指定側（相手/両陣営）のスピリットをBP範囲（minBp以上/maxBp以下）で疲労させる。装甲・疲労免疫は相手側のみ尊重（BS04グラウンドハウリング）。filter指定時はcores/excludeSelfのみ追加で判定する（他の軸は未対応。BS05双剣虎ジェン・フー：コア1個のみ・自分自身を除く）
    | { type: "returnAllToHand"; side: "opponent" | "both"; costFilter?: { max?: number; min?: number }; filter?: TargetFilter } // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（バウンス＝onDestroy不発火。装甲/免疫は相手側のみ尊重。BS04ドリームハンド）。filter指定時はさらにTargetFilterの軸で絞り込む（既存costFilterは残す。BS06鎧神機ヴァルハランスLv3＝BP4000以下）
    | { type: "refreshByFamily"; familyFilter: FamilyFilter; count: number } // 自分の疲労スピリットのうちfamilyFilter一致（配列=OR）をcount体まで回復（実効BP最大から。cantAttackThisTurnは付与しない。BS04ハイエーテル）
    | { type: "trashCoresToKeywordSpirit"; keyword: Keyword } // 自分のトラッシュのコアすべてを、指定キーワードを持つ自分のスピリット1体へ置く（候補複数かつinteractiveならpendingChoice、そうでなければ実効BP最大へ。BS04グレートリンク）
    | { type: "lockFlash"; attackerFamilyFilter?: FamilyFilter } // バトル中のみ有効：このバトルの間、相手はフラッシュで手札のカードを使用できなくする。attackerFamilyFilter指定時は、アタックしているのがこの系統（配列＝OR）の自分のスピリットのときだけ効く（BS07ウィリアンスラッシュ）
    | { type: "returnNexusToHand"; count: number; anySide?: true; voidCoreToOwnTrashIfOpponent?: number; all?: true; side?: "opponent" | "both" } // 相手のネクサスを持ち主の手札に戻す（破壊ではない）。anySide指定時は自分/相手どちらのネクサスも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり相手の先頭ネクサスを自動選択。BS03メビウスリング）。voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが相手のものだったときのみボイドからその数のコアを自分のトラッシュへ置く。all指定時はcountを無視し、side（省略時はopponent）が指すすべてのネクサスを戻す。side:"both"は両陣営すべて（BS06ホワイトホール：ネクサスすべて）
    | { type: "reclaimTrashCores" } // 自分のtrashCoresをすべてリザーブへ（0ならログのみ）
    | { type: "refreshSelf"; costReserveToVoid?: number; costSelfCoresToVoid?: number } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから回復する（lifeCrush.costReserveToVoidと同じ方針。「〜することで」は任意コストなのでカード側でoptional:trueを立てる。BS06-X23天帝ホウオウガ：本来は「[ソウルコア]以外のコア」限定だが、コアの種類を区別する器が無いためリザーブの任意のコア1個で代用）。costSelfCoresToVoid指定時は、リザーブでなく**このスピリット自身**の上のコアから支払う（自身のコアが不足／支払うとLv1コア数を下回るなら不発。BS08ブラックタウロス大王：このスピリット上のコア2個をボイドに置くことで回復する）
    | { type: "exhaustSelf" } // このスピリット自身を疲労させる（selfがnull/既に疲労状態ならno-op。exhaustSpirit経由なのでownSpiritExhausted等が正しく発火する。BS06雪ん子イエティ／天使長ファニム）
    | { type: "lifeCrush"; count: number; costReserveToVoid?: number; countCounter?: EffectCounter; dest?: "trash" } // 相手のライフのコアcount個を相手のリザーブへ（dest:"trash"指定時は相手のトラッシュへ。リザーブと違い再利用されないので相手のリソースがそのぶん減る。BS08機神獣インフェニット・ヴォルスLv3）（ライフ0以下で勝敗決定）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから実行する（「〜することで」は任意コストなので、カード側で optional:true を立てて発動確認を出すこと。BS04カイザーアトラス皇帝）。countCounter指定時はcountを無視しEffectCounterの値を個数として使う（0ならログのみ。BS08メテオストーム：このスピリットのシンボルと同じ数）
    | { type: "voidCoreToSelf"; count: number } // ボイドからコアcount個をこのスピリット上に置く（selfがnullならno-op）
    | { type: "voidCoreToSelfPer"; counter: EffectCounter } // カウント値ぶんボイドからこのスピリット上にコアを置く（0ならno-op）
    | { type: "voidCoreToSelfPerBofuCount" } // このスピリット（self）自身が持つ【暴風】の指定数（keywordエントリのcount。省略時1）ぶん、ボイドからこのスピリット上にコアを置く（selfがnull/【暴風】を持たないならno-op。BS06颶風高原：召喚されたスピリットに乗せる）
    | { type: "discardOpponent"; count: number; forcedTargetPid?: PlayerId; cardTypeFilter?: CardType } // 相手の手札からcount枚を破棄（手札末尾から。手札が足りなければある分だけ）。interactiveTargets時は選択式（選択者は破棄される相手本人）。forcedTargetPidは選択式再突入時のみ内部で設定する対象プレイヤー（cards.jsonには書かない。選択者=破棄される側のためresolveActionのowner引数がopponentOf(owner)で逆算できなくなるのを避ける）。cardTypeFilter指定時はこのカード種別のみが対象（該当が無ければ不発。BS08関将龍皇ドラグロン：相手の手札を見てスピリットカード1枚を破棄）
    | { type: "refreshOne"; filter?: TargetFilter; all?: boolean } // 自分の疲労スピリット1体を回復（絞り込みは filter。family は spiritHasFamily 判定＝付与系統も考慮。候補から実効BP最大を自動選択、いなければno-op）。all指定時は該当候補すべてを回復し cantAttackThisTurn は付与しない（決闘台地Lv2／鋼に覆われた高空／ベル・ダンディア）。filter.excludeSelf 指定時は候補からself自身を除外する（BS04風龍王フージャオス：自身も系統「翼竜」だが対象外）
    | { type: "coreRemoveSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のリザーブへ（selfがnullならno-op）
    | { type: "selfBuffPer"; counter: EffectCounter; amountPer: number } // このスピリット自身を「カウント値×amountPer」だけBP+（ターン終了時まで。selfがnull/カウント0はno-op）
    | { type: "voidCoreToOther"; count: number } // ボイドからコアcount個を、self以外の自分のスピリットのうち実効BP最大の1体に置く（候補がいなければno-op）
    | { type: "fireOwnDestroyTriggers" } // 発生源の持ち主のスピリットすべての『このスピリットの破壊時』効果を、**破壊させずに**発揮させる（フィールドから取り除かない。発揮順はフィールドの並び順。BS07女教皇リル・サキュバス）
    | { type: "coreSqueezeAll" } // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ（1個未満で維持コア割れになる場合は消滅処理を適用）
    | { type: "endAttackStepAfterBattle" } // バトル中のみ：このバトルが終了したときアタックステップを終了するフラグを立てる（バトル外はno-op）
    | { type: "coreToTrashSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のトラッシュへ（維持コア割れの消滅処理を含む。selfがnullならno-op）
    | { type: "recoverSpiritFromTrash"; count: number; familyFilter?: FamilyFilter; all?: true; thenDestroyIfFamily?: { family: FamilyFilter; maxBp: number }; costDestroyOwnKeyword?: Keyword; keywordFilter?: Keyword; nameIncludes?: string } // nameIncludes指定時はカード名にこの文字列を含むカードのみ対象（カード静的な名前で判定＝トラッシュのカードが対象のため。BS08アルカナクィーン・パラス＝「アルカナ」）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象（hasKeywordで判定＝トラッシュのカードが対象のため。BS08ターンインフェルノ＝【転召】持ち）。// costDestroyOwnKeyword指定時は、そのキーワードを持つ自分のスピリット1体（実効BP最小＝犠牲を最小化する簡略化）を破壊することがコストで、該当がなければ不発（BS07ブリュナグオン＝【呪撃】持ち）。// thenDestroyIfFamily指定時は、手札に戻したカードがその系統（配列＝OR。カード静的なfamilyで判定）を持つときだけ、続けてmaxBp以下の相手スピリット1体を破壊する（BS07ドラグロン占術師＝「勇傑」のときBP3000以下を破壊）。// 自分のトラッシュにあるスピリットカードをcount枚、手札に戻す（末尾＝新しい方から自動選択。本来は選択の簡略化。該当なしはno-op）。familyFilter指定時はその系統を持つカードのみ（配列＝OR。カード静的な family で判定。BS04鋼葉の樹林）。all指定時はcountを無視し、familyFilter該当カードすべてを手札に戻す（BS03ネクロマンシー）
    | { type: "coreSqueezeOne"; count: number; anySide?: true } // 相手フィールドの実効BP最大のスピリットをcount体選び、それぞれコアを1個だけ残して超過分を持ち主のリザーブへ（coreSqueezeAllの単体版。対象なしはno-op）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり相手BP最大を自動選択。BS03ウィークネス）
    | { type: "coreToVoidOwn"; count: number } // 自分のコアcount個をボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ自分フィールドのスピリット（実効BP最小）から取る。維持コア割れは消滅処理
    | { type: "bothSidesCoreToTrash"; count: number } // 両プレイヤーが各自のフィールドのスピリットから、コアの多い個体から順に合計count個を各持ち主のトラッシュへ（1体で足りなければ次にコアが多い個体へ繰り越す。維持コア割れは消滅処理。片側のみ対象がいてもその側は処理する。BS01メタルディー・バグ＝count1、BS02マインドコントロール＝count4）
    | { type: "countAsMultipleThisTurn"; count: number; anySide?: true } // 対象スピリット1体に「このターンの間、使用者の効果では count 体分として数える」印を付ける（CardInstance.countAsThisTurn）。anySide指定時は自分/相手どちらのスピリットも対象にできる（BS05スリーカード＝3体分）
    | { type: "noop" } // 何もしない。pendingChoice が「アクションの解決」以外の用途（マジック無効化の確認。PendingChoice.magicNegate）で立つときのプレースホルダ。カードデータには書かない
    | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
    | { type: "discardBothHands"; count: number } // お互いが手札からcount枚を破棄する（自分→相手の順。破棄するカードは手札の末尾から＝各自が選ぶ処理の決定的簡略化。手札が足りなければある分だけ。BS04魔界七将パンデミウムLv3）
    | { type: "markUnblockableThisTurn"; minBp: number; target?: "self" } // target:"self"指定時は発生源自身に印を付ける（BP最大の自動選択をしない。『このスピリットの召喚時：このターンの間、このスピリットはブロックされない』。BS07天使長トロン）// 実効BPがminBp以上の自分のスピリット1体（BP最大＝指定の決定的簡略化）に「このターン1回だけブロックされない」印を付ける（CardInstance.unblockableOnceThisTurn。印は次のバトルの終了時に消える。BS04強者統べる大地Lv2）
    | { type: "discardHandNexusToVoidCoreSelf"; count: number } // 自分の手札のネクサスカード1枚を破棄することで、ボイドからコアcount個をこのスピリット上に置く。手札にネクサスが無ければ不発（BS04機織のハーフェレシテLv1）
    | { type: "discardHandNexusesThenDraw" } // 自分の手札にあるネクサスカードをすべて破棄し、破棄した枚数ぶんデッキから引く（「好きなだけ」を全部破棄に決定的簡略化。BS03ネクサスレジスター）
    | { type: "discardSelfChoose"; count: number } // 自分の手札からcount枚を破棄する。interactiveTargets時は1枚ずつ選ばせ、非interactive時は末尾から機械的に破棄（BS01ストームドロー）
    | { type: "drawThenDiscard"; drawCount: number; discardCount: number } // デッキからdrawCount枚引いたあと、手札からdiscardCount枚を破棄する（BS01ストームドロー）
    | { type: "coreDrainAllOthers" } // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ（両陣営）。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）
    | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する（フェザーバリア）
    | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する（バーストファイア）
    | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない。妖機妃ソール）
    | { type: "deckReveal"; count?: number; pickType?: CardType; countPer?: { ownColorTotal: Color } | { ownNexuses: true }; pickAllOfType?: "magic"; nameIncludes?: string; familyFilter?: FamilyFilter; discardNonMatching?: boolean; returnToTop?: true } // 自分のデッキ上からcount枚（countPer指定時は自分の指定色スピリット/ネクサス合計数、またはownNexuses=自分のネクサス数。countと排他）を公開し、pickTypeに一致する最初の1枚（省略時は先頭。pickAllOfType指定時は一致するすべて。nameIncludes指定時はカード名にこの文字列を含むもの、familyFilter指定時はカード静的な系統がこれを含むもののみ＝手札に加わらない候補は付与系統を考慮しない）を手札に加える。残りは元の順でデッキの下に戻す（discardNonMatching指定時はトラッシュへ破棄する。returnToTop指定時はデッキの上に戻す＝BS06曲刀竜パラサウル。スワロウアイヴィー／大天使ミカファール／BS05天焦がす大聖火／countPer.ownNexuses＝BS08古将ドグウ・ゴレム）
    | { type: "coreGainPer"; counter: EffectCounter } // カウント値ぶんボイドから自分のリザーブへコアを追加（0ならログのみ。宝石の獣カーバルク）
    | { type: "refreshAllByCost"; cost: number } // 両陣営のコストが一致するスピリットすべてを回復させる（refreshAllOwnと異なりcantAttackThisTurnは付与しない。ローヤルポーション）
    | { type: "destroyOwnByCost"; maxCost: number; gainCoresEqualCost?: boolean; thenDestroyEnemyByCostBudget?: true } // 自分のフィールドからself以外でコスト<=maxCostのうちコスト最大の1体を破壊する（プレイヤー選択の簡略化＝決定的選択）。gainCoresEqualCost指定時は破壊したスピリットのコストと同数のコアをボイドから自分のリザーブへ（天使長プリンシパール）。thenDestroyEnemyByCostBudget指定時は、破壊した自分のスピリットのコストを予算として destroyByCostBudget と同じ貪欲選択で相手のスピリットを破壊する（BS07アームズインパクト）
    | { type: "grantKeyword"; keyword: Keyword; colors?: Color[] } // 自分のスピリット1体に、このターンの間キーワードを付与する（targetInstanceId優先、フォールバックはバトル中の自分スピリット→自分フィールド先頭。スピリットリンク／インビンシブルシールド）
    | { type: "exhaustAllByLevel"; level: number | "lastBattleDestroyed" } // 両陣営のcurrentLevelが一致するスピリットをすべて疲労させる（疲労済みはno-op）。"lastBattleDestroyed"指定時はstate.lastBattleDestroyedLevelを使用（0なら不発。魔界伯爵ヴィール）
    | { type: "destroyAllExceptChosenColors"; chosenOwn?: Color; chosenOpp?: Color; awaiting?: "own" | "opponent" } // 「お互い、自分のフィールドに出ているスピリットの色を1色指定する。指定されなかった色のスピリットすべてを破壊する」（地龍王ケンドラゴス）。
    // interactiveTargets では**両プレイヤーが順に**色を選ぶ。選択の進捗は chosenOwn / chosenOpp / awaiting に持たせて再入する
    // （相手に選ばせる段は PendingChoice.actorPid で「選択者＝相手・実行者＝発生源の持ち主」にする）。
    // 非対話時は従来どおり、お互い自分フィールドで最多の色を自動指定する
    | { type: "destroySelf" } // このスピリット（self）を破壊する（onDestroy誘発あり。selfがnull/不在ならno-op。コリスタル）
    | { type: "mutualDestroyChoice"; chosenOwn?: string; chosenOpp?: string; awaiting?: "own" | "opponent" } // 「お互い、フィールドのスピリット1体を選び、破壊する」（BS05吸血女王カーミラLv3）。destroyAllExceptChosenColorsと同じ二段階choiceパターン：発生源の持ち主（own）→相手（opponent）の順に、フィールド（両陣営どちらでも可）から1体を指定させ、選ばれた2体（重複可）をそれぞれ破壊する。進捗はchosenOwn/chosenOpp/awaitingに持たせて再入する。非対話時は各プレイヤーが相手フィールドの実効BP最大を自動選択（プレイヤー選択の決定的簡略化。pickEnemyByBpと同じ考え方）
    | { type: "refireSummonEffect" } // 対象の自分スピリット1体（targetInstanceId優先、フォールバックは自分フィールド先頭）のonSummon効果を再発揮する（タイムリープ）
    | { type: "recoverMagicFromTrash" } // 自分のトラッシュにあるマジックカード1枚（末尾＝新しい方）を手札に戻す（トリックスター）
    | { type: "castMagicFromTrashByColor"; colorFilter?: Color } // 自分のトラッシュにある指定色（省略時は色不問）のマジックカード1枚を、手札にあるときと同様にコストを支払って使用する（interactiveTargets時はcard choiceで選択、自動時はコストが払える中で最もコストが高いものを自動選択。該当・支払い可能なカードがなければ不発）。この効果ではフィールドのコアは使えずリザーブのみで支払う簡略化。発動タイミングはこの効果自体の発火位置で決まる（バトル中ならflash、それ以外はメイン優先。BS08堕天使ミカファール）
    | { type: "magicMirrorRepeat" } // このフラッシュタイミングで相手が直前に使用したマジックカードの効果を、自分が使用したものとして解決し直す（対象・コストは無償の再現。GameState.lastMagicCastを参照し、相手の使用でなければ不発。[マジックミラー]自身は対象にできない＝連鎖ミラー防止。BS08マジックミラー）
    | { type: "trashCoresToSpirit"; count?: number } // 自分のトラッシュのコアを対象スピリットへ置く（count省略=全部、不足時は可能な分。対象はtargetInstanceId優先、フォールバックはself→自分フィールド先頭）
    | { type: "grantKeywordAll"; keyword: Keyword; colors?: Color[]; costFilter?: number; vanillaFilter?: true } // 自分のスピリット全員（costFilter指定時はコスト一致のみ、vanillaFilter指定時は効果の記述を持たないスピリットのみ）に、このターンの間キーワードを付与する（リフレクションアーマー／BS05サーキュラーソー・アーム）
    | { type: "banActByCostThisTurn"; maxCost: number } // このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可にする（ヘビィゲート）
    | { type: "deployNexus"; from: "hand" | "trash"; colors: Color[]; all?: boolean } // 手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに自分のフィールドに配置する（該当なしはno-op。スコルピード／白虎ハック／黒虎クロン）。all指定時は該当するネクサスカードをすべて配置する
    | { type: "sacrificeNexusThenWipeEnemyNexusCores" } // 自分のネクサス1つ（コア数最小、同数は配列先頭）を破壊し、相手の全ネクサス上のコアを相手のトラッシュへ置く（自分のネクサスが無い/破壊耐性で不発なら何もしない。プレイヤー選択の簡略化。サクリファイス）
    | { type: "levelOverrideOpponentNexuses"; level: number; costReserveToVoid?: number } // 相手の全ネクサスの levelOverrideThisTurn を level に設定（このターンの間）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから適用する（「できる」の任意発動は自動発動で簡略化。皇帝アンプルール）
    | { type: "summonFromHandFree"; colorFilter?: Color; sameFamilyAsSelf?: boolean; familyFilter?: FamilyFilter; costFilter?: number | { max?: number; min?: number }; nameIncludes?: string; maxCostFromOwnTrashCores?: true; costDestroyOwnFamily?: FamilyFilter; costDestroyOwnNexus?: true; count?: number; keywordFilter?: Keyword; skipTensho?: true } // maxCostFromOwnTrashCores指定時は「自分のトラッシュにあるコアの数以下のコスト」が上限になる（BS02ディバインウィンド）。costDestroyOwnFamily指定時は指定系統の自分のスピリット1体（コスト最小、同コストはフィールド先頭）を破壊することがコストで、破壊できなければ不発（BS02キャストオフ）。costDestroyOwnNexus指定時は自分のネクサス1つ（コア最少、同数はフィールド先頭）を破壊することがコストで、破壊できるネクサスがなければ不発（BS06リクラメーション）。// 自分の手札にあるスピリットカードのうち条件（colorFilter一致／sameFamilyAsSelf=selfと系統1つ以上共通／familyFilter=指定系統一致。配列＝OR）を満たすコスト最大の1枚（同コストは手札の先頭側）を、コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットの onSummon 効果は発揮されない（老賢樹トレントン／竜戦車アースガルド。familyFilterはBS05火龍王ボルケノス＝系統「竜人」限定で、selfの系統全部とはOR判定にしたくない場合に使う）。costFilter指定時はコストが完全一致するもののみ（BS05シーサーズ＝コスト2）。nameIncludes指定時はカード名にこの文字列を含むもののみ（BS05ペンタン帝国）。count指定時は「count枚まで」の複数体召喚（プレイヤー選択の決定的簡略化：コスト最大から貪欲に選び、維持コアがリザーブから払えなくなった時点で打ち切り。この場合interactiveTargetsでも選択式にせず自動選択のみ。BS06アルカナキング・カール＝4枚まで）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象（hasKeywordで判定。summonFromTrashFreeと同型）。skipTensho指定時は召喚後の【転召】解決そのものをスキップする（既定は「コストを支払わない召喚でも転召は必ず行う」だが、この効果は転召を発揮したものとして扱う旨の記載があるため例外。BS08雷帝竜騎レイブリッツ：手札の【転召】持ちを【転召】させずに召喚できる）
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
    | { type: "battleCompareByCores" } // 現在のバトル（state.battle）にフラグを立て、解決時にBPの代わりにコアの数を比較させる（コア数が少ない方が破壊。同数ならお互い破壊＝battleCompareByLevelと同じ分岐に乗る。バトル外は不発。BS06イマジンフィールド）
    | { type: "revealDiscardRest" } // 公開ゾーン（GameState.revealedCards）に残っているカードをすべて持ち主のトラッシュへ置く（cards.jsonには書かない。revealAndSummonKeyword が選択待ちの queue に積み、**選んでもスキップしても**必ず後始末が走るようにする。BS05トランスマイグレーション）
    | { type: "revealReturnToDeck" } // 公開ゾーン（GameState.revealedCards）の残りをデッキの下へ戻す。interactiveTargets 時は戻す順番を1枚ずつ選ばせる（スキップで残りを現在の順のまま戻す）。BS01-067 スワロウアイヴィー／BS03-142 サルベージ
    | { type: "grantColorThisTurn"; color: Color } // 自分のスピリット1体（targetInstanceId優先、なければバトル中→フィールド先頭）を、このターンの間その色としても扱う（tempColors。色を選ばせるgrantColorChoiceの固定色版。BS07メテオフォール＝青）
    | { type: "grantColorChoice" } // 対象選択→色選択の2段階choiceを経て、選ばれた対象のtempColorsに選ばれた色を追加する（フラッシュ：スピリット1体にもう1色与える。アディショナルカラー）
    | { type: "grantFamilyChoiceAll"; targetFamily: string } // targetFamily持ちが自分のフィールドにも手札にも1枚もなければ不発。あれば全系統からのoption choiceを経て、選ばれた系統を CardInstance.lentChoiceFamily に載せた仮想発生源を積む（＝lendSelfThisTurn と同じ貸与。以後は kind:"familyGrant" の familyFromChoice エントリが継続付与する。音鳥クルーク）
    | { type: "linkNexusCoresChoice" } // 自分のネクサス1つを指定するtarget choice（optional=スキップ可）。指定されたネクサスのcoresLinkedToにselfのinstanceIdを設定する（selfがnullなら不発。クロスシザース）
    | { type: "mill"; count: number; side?: "own" } // 相手（side:"own"指定時は自分）のデッキを上からcount枚トラッシュへ送る（【粉砕】。不足時は可能な分だけ）
    | { type: "millPer"; counter: EffectCounter; side?: "own"; multiplier?: number; cap?: number } // カウント値（×multiplier、cap指定時は上限）ぶん相手（side:"own"指定時は自分）のデッキをトラッシュへ送る（0ならログのみ。BS04機動要塞キャッスル・ゴレム）
    | { type: "levelMaxAllOwnThisTurn" } // 自分のスピリットすべての levelOverrideThisTurn を各カードの最高Lvに設定する（このターンの間。ターン終了でリセット。BS04幻影士のミラージ）
    | { type: "suppressTriggerThisTurn"; trigger: TriggerEvent } // このターンの間、相手のスピリットの指定トリガーを発揮させない（GameState.triggerSuppressionThisTurn。BS04ユーサネイジア＝破壊時）
    | { type: "destroyAllNexusesWithCores" } // コアが1個以上置かれている両陣営のネクサスをすべて破壊する（nexusIndestructible等の破壊耐性はdestroyNexus内で尊重。フレイム・エルク）
    | { type: "voidCoreToAllOwnByFamily"; families: string[]; count: number } // ボイドからコアcount個ずつを、指定系統のいずれかを持つ自分のスピリットすべての上に置く（太陽花ゾンネ・ブルム）
    | { type: "voidCoreToTarget"; count: number; familyFilter?: FamilyFilter } // familyFilter指定時は、その系統（配列＝OR。matchesFamilyFilterで判定）を持つ自分のスピリットだけが対象（BS07デルファングス＝虚神/神将）。// ボイドからコアcount個を対象の自分スピリットの上に置く（targetInstanceId優先、未指定時は自分の実効BP最大。ポーションベリー）
    | { type: "refreshByFamilyAuto"; count: number } // 疲労中の自分スピリットの最多系統を自動指定し、その系統の疲労スピリットを最大count体回復させる（プレイヤー選択の決定的簡略化。cantAttackThisTurnは付与しない。フロックリカバリー）
    | { type: "selfBuffByHandDiscard"; discardCardType: "spirit" | "nexus" | "magic"; amount: number } // 手札の指定種別カード1枚を破棄することで、このスピリット自身をBP+amountできる（任意コスト。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）で破棄カードを選ぶ、自動時は手札末尾の該当カードを破棄して発動。該当カードなしはno-op。城壊しのデニス／島持ちのフランシス）
    | { type: "grantKeywordToHandCard"; keyword: Keyword; familyFilter?: FamilyFilter; cardType?: "spirit" | "nexus" | "magic"; all?: true } // 手札の条件一致（cardType/familyFilter。配列＝いずれかの系統でOR）カード1枚に、このターンの間キーワードを付与する（PlayerState.tempHandKeywordGrants。interactiveTargets時はcard choiceで選択、自動時は手札末尾の該当カード。該当なしはno-op。付与はcardId単位＝同名重複カードにも効く簡略化。ビートプリースト）。all指定時は選択を挟まず、条件一致する手札カード**すべて**に付与する（BS08ライトニングスピード：「殻虫」/「殻人」持ちすべてに【神速】）
    | { type: "coreTradeToOpponentTrash" } // 自分のリザーブのコアをX個自分のトラッシュへ置き、同数だけ相手のリザーブのコアを相手のトラッシュへ置く（Xの上限はmin(自分のリザーブ,相手のリザーブ)。interactiveTargets時はkind:"option"のoption choice（「1個」〜「上限個」、optional=スキップ可＝0個）、自動時は上限個。ポイズンミスト）
    | { type: "voidCoreToOwnNexuses"; colorFilter?: Color; count: number; single?: boolean } // ボイドからコアcount個ずつを、指定色（省略時は色不問）の自分のネクサスすべての上に置く（該当ネクサス0はログのみ。ボルカノ・ゴレム）。single指定時は1つだけ（interactive時はpendingChoice、そうでなければコアが最も少ないネクサス。BS04薬師ギルママール）
    | { type: "blockTriggersAsAttackTargetThisTurn" } // 対象の自分のスピリット1体（targetInstanceId優先。未指定時は『ブロック時』効果を持つ自分のスピリットのうち実効BP最大）の『このスピリットのブロック時』効果を、このターンの間『このスピリットのアタック時』に発揮させる（ブロック時には発揮しなくなる＝移し替え。CardInstance.blockTriggersAsAttackThisTurn。BS07マクラーンスラッシュ）
    | { type: "attackTriggersAsBlockThisTurn" } // 対象の自分スピリット1体の『このスピリットのアタック時』効果を、このターンの間『このスピリットのブロック時』に発揮させる（アタック時には発揮されなくなる＝移し替え。targetInstanceId優先、未指定時は自分の実効BP最大。BS05ブレイブチャージ）
    | { type: "addSymbolThisTurn"; anySide?: true } // 対象の自分スピリットの tempExtraSymbols をこのターンの間+1する（targetInstanceId優先、未指定時は自分の実効BP最大。「自分か相手」は自分側のみの簡略化。ダブルハート）
    | { type: "levelUpThisTurn"; anySide?: true } // 対象の自分スピリットの levelOverrideThisTurn を currentLevel+1（カードの最大Lvでキャップ）に設定する（targetInstanceId優先、未指定時は自分の実効BP最大。「自分か相手」は自分側のみの簡略化。ビルドアップ）
    | { type: "discardOpponentDownTo"; limit: number } // 相手の手札がlimit枚を超えている場合、limit枚になるまで破棄する（既存discardOpponentへcount=手札枚数-limitを計算して委譲。0以下は不発。奇術師オリバー）
    | { type: "bpBuffByExhaustOwn" } // 回復状態の自分スピリット1体を疲労させ、このターンの間、自分のスピリット1体をその実効BP分バフする（interactiveTargets時は疲労元→バフ先の2段choice、自動時は実効BP最大の回復スピリットを疲労させバトル中の自分スピリット（いなければフィールド先頭）をバフ。回復スピリットがいなければ不発。ユナイテッドパワー）
    | { type: "exhaustOpponentToMatch" } // 自分の疲労スピリット数と同数になるまで相手のスピリットを疲労させる（差分=自分の疲労数-相手の疲労数。0以下は不発。既存exhaustの単体処理へcountを渡して委譲し、armor/免疫/interactive choiceを自然に通す。セイムタイアード）
    | { type: "tenshoCoreDump"; dest: "trash" | "void" } // 【転召】のpendingChoice再開専用（cards.jsonには書かない）。targetInstanceIdで指定された自分のスピリットの上のコアすべてをdestへ（trash=持ち主のトラッシュ、void=消滅）。維持コア割れは既存の消滅処理（destroySpirit "deplete"）に委ねる
    | { type: "markNoRefreshTarget" } // 相手の疲労状態のスピリット1体を「回復できない」と指定する（発生源＝self に CardInstance.noRefreshTargetInstanceId として記録し、**self が疲労状態で持ち主のフィールドにいる間**だけ効く。PhaseManager のリフレッシュステップが isRefreshBlockedByMark で参照）。対象は実効BP最大の1体を自動選択する決定的簡略化（アタック宣言中に発火しうるため、ここで pendingChoice を立てない。BS02スクルディア）
    | { type: "tenshoSubstituteChoice"; dest: "trash" | "void" } // 【転召】置換（constraint "tenshoCoreSubstitute"）の任意発動の再開専用（cards.jsonには書かない）。self に渡された自分のスピリットについて、chosenOption が「疲労する」なら疲労してコアを維持し、それ以外なら通常どおり上のコアすべてをdestへ置く
    | { type: "revealAndSummonKeyword"; count: number; keyword: Keyword; returnToDeckBottomAtEndStep?: true } // 自分のデッキ上からcount枚を公開し、その中の**指定キーワードを静的に持つスピリットカード**1枚をコストを支払わず召喚する（維持コアはリザーブから。足りなければ不発）。召喚時効果は通常どおり発揮する（効果文に「発揮されない」の記載が無いため）。**【転召】は解決しない**（効果文の「【転召】を発揮したものとして」＝転召を済ませたものとして扱う。コアも失わず、犠牲になるスピリットも出ない。通常の効果による召喚では転召を必ず行う＝公式Q&A 2024-10-31 ので、この一文を持つカードだけが例外）。残った公開カードはすべてトラッシュへ破棄する。「〜できる」なので interactiveTargets 時は候補1枚でも選択（スキップ可）を出し、自動時はコスト最大の1枚を選ぶ決定的簡略化。returnToDeckBottomAtEndStep指定時は召喚した個体に CardInstance.returnToDeckBottomAtEndStep を立て、エンドステップで持ち主のデッキの下へ戻す（BS05トランスマイグレーション）
    | { type: "handMagicToTegamotoDraw" } // 自分の手札にあるマジックカードを好きなだけ手元（PlayerState.tegamoto）に置き、置いた枚数ぶんデッキから引く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行（選ぶたび1枚移動+1ドローし、手札にマジックカードが残っていれば再度choiceを発行。スキップで終了）。自動時は該当カードすべてを一括移動して同数ドロー（決定的簡略化）。マジックブック
    | { type: "revealHandMagicToTegamotoDraw" } // handMagicToTegamotoDrawの単発版：自分の手札にあるマジックカード1枚をオープンして手元に置き、1枚ドローする。手札にマジックカードが無ければ不発。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1回だけ発行。自動時は手札末尾（新しい方）の該当カード（決定的簡略化）。「〜することで」は任意コストのため、カード側でoptional:trueと併用する（BS06占いペンタン）
    | { type: "discardOpponentTegamotoDestroyPer" } // 相手の手元（tegamoto）にあるカードすべてを相手のトラッシュへ破棄し、その枚数を既存のdestroyアクション（count=枚数、maxBpなし=BP不問）へ委譲して相手スピリットを破壊する（interactive時の連続対象選択・装甲/免疫判定はdestroy側の経路をそのまま再利用）。相手の手元が0枚ならno-op。透明人間エクリア
    | { type: "coreToTrashAllByCost"; maxCost: number } // 相手のコストmaxCost以下のスピリットすべての上から、コア1個ずつを相手のトラッシュへ置く（範囲効果。装甲・マジック効果耐性・immuneToOpponentThisTurnは対象から除外。BS04風龍王フージャオス）
    | { type: "coreRemovePerHandDiscard" } // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき相手のスピリット1体（実効BP最大を自動選択、同一解決内で既に選んだ個体は除外して異なる個体へ広げる）のコアを1個、相手のトラッシュへ置く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行し、選ぶたび即座にコア除去を実行する（対象選択自体は毎回自動）。自動時は手札をすべて破棄し、破棄枚数ぶん一括でコア除去する（決定的簡略化）。王蛇ケツァルカトル／ダンスマカブル
    | { type: "drawPerHandDiscard" } // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき自分がデッキから1枚ドローする。coreRemovePerHandDiscardの「破棄1枚につき〜」をドローに差し替えた版で、interactive時のcard choiceループ・自動時の一括破棄も同型（BS08堕天使ミカファール）
    | { type: "bpBuffAllByArmorColors"; amountPer: number } // 自分の【装甲】を持つスピリットすべてを、それぞれが持つ装甲の指定色数×amountPerだけBP+（ターン終了時まで。静的keyword＋一時付与tempKeywordsの装甲colorsを合算して色数を数える。BS05アイシクルアサルト）
    | { type: "bpBuffAllByBofuCount"; amountPer: number } // 自分のスピリットすべてを、それぞれが持つ【暴風】の実効指定数（静的keywordのcount。bofuCountBonusの加算を含む）×amountPerだけBP+（ターン終了時まで。【暴風】を持たない個体は対象外。bpBuffAllByArmorColorsの暴風版。BS08スナイピングブラスト）
    | { type: "bpBuffAllPer"; counter: EffectCounter; amountPer: number; filter?: TargetFilter } // カウント値×amountPerを、filter一致（省略時は絞り込みなし）の自分のスピリットすべてにBP+（ターン終了時まで。0ならログのみ。bpBuffPerの単体対象を「全体」に広げた版。BS08ダークパワー：filter.nameContains＝「ダーク」/「ブラック」・counter"ownExhausted"）
    | { type: "voidCoresAndMillByCost"; familyFilter: FamilyFilter } // familyFilter一致（配列＝OR）の自分のスピリット1体（interactiveTargets時はpendingChoice、自動時はコスト最大を選ぶ＝mill枚数を最大化する決定的簡略化）のコアすべてをボイドに置き、そのスピリットのコストと同じ枚数だけ相手のデッキを上からトラッシュへ送る（該当スピリットがいなければ不発。BS05マジックスパナ）
    | { type: "lendSelfThisTurn" } // このマジック自身を、このターンの間だけ自分の仮想発生源（PlayerState.turnVirtualInstances）として場に置いたものとして扱う。
    // 同じカードの他の効果エントリ（levels:null必須）が effectSources() 経由で継続効果として一斉に有効になる（TURN_EFFECT_SOURCES.md §3。BS05リアニメイト）
    | { type: "coreRemoveMulti"; targets: number; count: number; dest?: "trash" | "void"; costFilter?: { max?: number; min?: number }; allTargets?: true; keywordExclude?: Keyword } // keywordExclude指定時は、指定キーワードを**持たない**相手のスピリットのみが対象（静的・一時付与・継続付与を考慮。BS08闇帝竜騎サブナ・ルーク＝【転召】を持たない相手すべて）。// allTargets指定時は targets を無視し、条件を満たす相手スピリット**すべて**が対象（範囲効果なので対象選択を挟まない。BS07腐りゆく湖沼）。// 相手スピリットtargets体（costFilter一致・実効BP上位から自動選択で重複なく選ぶ。プレイヤー選択の簡略化。interactiveTargets時は1体ずつ選択→queueで残数を繰り越す）それぞれのコアをcount個ずつ、dest指定先へ（省略時はリザーブ、trash=持ち主のトラッシュ、void=消滅）。装甲/マジック効果耐性は対象ごとに判定して除外（BS05ガストラス：コスト1以下2体からコア2個ずつをトラッシュへ）
    | { type: "summonFromTrashFree"; costFilter?: { max?: number; min?: number }; colorFilter?: Color; keywordFilter?: Keyword; costBudget?: number; familyFilter?: FamilyFilter; nameIncludes?: string } // nameIncludes指定時はカード名にこの文字列を含むもののみ（カード静的な名前で判定＝トラッシュのカードが対象のため。BS08アンドレアルファス＝「勇者」）。// familyFilter指定時はその系統（配列＝OR。カード静的なfamilyで判定＝トラッシュのカードが対象のため）を持つカードのみ（BS07常闇の聖堂＝「夜族」）。// 自分のトラッシュにあるcolorFilter色（省略時は色不問）・costFilter範囲のスピリットカード1枚（コスト最大、同コストは末尾＝新しい方から自動選択。プレイヤー選択の簡略化）を、コストを支払わずに召喚する。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットのonSummon効果は発揮されない（BS05妖狐キュービック：コスト5/6/7の紫）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象（hasKeywordで判定）。costBudget指定時はcostFilterを省略でき、コスト合計がbudget以下になる範囲で複数枚を召喚する（コスト最大から貪欲に選ぶ決定的簡略化。維持コアがリザーブから払えなくなった時点で打ち切り。BS06-X22魔界七将ベルゼビート：【呪撃】持ちをコスト合計13まで）
    | { type: "nexusCoresToTrash"; side: "opponent" | "both" } // 指定側（相手/両陣営）のネクサスすべての上に置いてあるコアすべてを、各持ち主のトラッシュへ置く。ネクサスはコア0になっても消滅しない（BS03フォールダウン＝both）
    | { type: "drawUpTo"; size: number } // 自分の手札がsize枚になるまでデッキから引く（既にsize枚以上ならno-op。デッキ切れ判定はdrawへ委譲。BS03フォースドロー）
    | { type: "trashSpiritsToDeckBottom"; count: number } // 自分のトラッシュにあるスピリットカードを末尾（新しい方）から最大count枚、その順で自分のデッキの下に戻す（プレイヤー選択・順序指定の決定的簡略化。count枚未満しかなければ可能な分だけ。BS04トリックプランク）
    | { type: "voidCoresToNexusLevel"; level: number } // 自分のネクサス1つがlevelになるように、不足分のコアをボイドから置く（対象決定はvoidCoreToOwnNexusesのsingle分岐と同じ優先順＝targetInstanceId→interactiveTargets時はrequestChoice→自動時はコア数最少。既にそのレベル以上、またはそのレベルを持たないネクサスはno-op。BS04フルアッド＝Lv2）
    | { type: "opponentNexusOrReserveCoreToTrash"; count: number } // 相手のネクサス（コア数最多のものを自動選択）にコアがあればそこから、無ければ相手のリザーブから、count個を相手のトラッシュへ（どちらもコアがなければno-op。ネクサスのコアが減ってレベルが下がっても消滅はしない。BS02エナジードレイン）
    | { type: "opponentCoresToVoidByTotal"; tiers: { minTotal: number; count: number }[] } // 相手のフィールド（スピリット+ネクサス）+トラッシュ+リザーブのコア合計を数え、条件を満たす中で最大の minTotal の段に応じた個数をボイドへ置く。取り除く順はリザーブ→トラッシュ→フィールド（コアの多い個体から）の決定的簡略化（BS02ブラッディレイン）
    | { type: "moveCoresLeavingOne"; anySide?: true; selfTarget?: true; allowNexusDest?: true } // 対象スピリット上のコアを1個だけ残し、それ以外を同じフィールドの別のスピリット（フィールドの先頭側＝決定的簡略化）へ移す。移動先がいなければ不発（BS01チェンジングコア）。selfTarget指定時は対象を発生源自身に固定し、allowNexusDest指定時は移し先のスピリットがいなければ自分のネクサス（先頭側）へ移す（BS01要塞龍ギガLv2＝「このスピリット上のコアを他のスピリットかネクサスに」）
    | { type: "swapOpponentCores" } // 相手のスピリット2体（実効BP上位2体＝プレイヤー指定の決定的簡略化）の上のコアをすべて入れ替える。相手のスピリットが2体未満、またはコア数が同じなら不発。入れ替えの結果、維持コア（Lv1）を下回った側は消滅する（BS04天使スローンLv2-3）
    | { type: "costOwnAllCoresThenEnemyCoresToReserve"; minBp: number; count: number } // 実効BPがminBp以上の自分のスピリット1体（BP最大）の上のコアすべてをボイドへ置くことをコストに、相手のスピリット上のコアを合計count個（コアの多い個体から）相手のリザーブへ置く。コストを払えなければ不発（BS02セブンスクリムゾン）
    | { type: "returnBothSidesToDeckBottom"; count: number } // 自分のスピリットcount体（コスト最小から）をデッキの下へ戻すことで、相手のスピリットcount体（実効BP上位から）もデッキの下へ戻す。自分がcount体戻せなければ不発（BS04グラシアルブレス）
    | { type: "sacrificeOwnNexusesThenEnemyDestroysOwn" } // 自分のネクサスをすべて破壊し（「好きなだけ」の決定的簡略化）、破壊できた数だけ相手が相手自身のスピリットを破壊する（BS04タイダルタイド）
    | { type: "bothSidesCoreToVoid"; count: number } // 両プレイヤーが各自のスピリット+ネクサスから、コアの多い個体から順に合計count個をボイドへ置く（1体で足りなければ次にコアが多い個体へ繰り越す。維持コア割れの消滅処理はスピリットのみ＝ネクサスは消滅しない。BS04インフェルノアイズ）
    | { type: "blockTriggersAsAttackAllThisTurn" } // このターンの間、両陣営のスピリットすべての『このスピリットのブロック時』効果を『このスピリットのアタック時』に発揮させる（ブロック時には発揮されなくなる＝移し替え。attackTriggersAsBlockThisTurnの逆方向・全体版。GameState.blockTriggersAsAttackThisTurnをfireTriggerが参照。BS01アタックシフト）
    | { type: "voidCoreToOwnTrash"; count: number } // ボイドからコアcount個を直接、持ち主のトラッシュに置く（returnNexusToHandのvoidCoreToOwnTrashIfOpponentと同じ処理をEffectModules.voidCoreToOwnTrashへ共通化。BS03ブリッツ＝【粉砕】持ちのアタック時にeffectGrantで継続付与）
    | { type: "alsoCostBuff"; amount: number } // 自分のスピリット1体（targetInstanceId優先、フォールバックはpickOwnKeywordTargetと同じ＝バトル中の自分スピリット→自分フィールド先頭）を、このターンの間「実コスト+amount」の値もコストとして扱う（CardInstance.tempAlsoCosts、ターン終了でリセット。instAllCostsが読む。元のコストも残るため、コスト以下を参照する効果は引き続き元のコストでも反応する簡略化。BS08グロウアップ）
    | { type: "colorChoiceLendThisTurn"; sourceCardId?: string } // 全色からの1色choiceを経て、選ばれた色を仮想発生源のlentChoiceColorに載せてこのターンの間貸し出す（kind:"levelAs" target:"allSpiritsByChosenColor"のlentOnlyエントリが読む。familyGrantのfamilyFromChoiceと同形。マジックのselfは常にnullで選択再開時にresolveActionのsourceCardId引数が失われるため、sourceCardIdをaction自身に載せて2段階目へ引き継ぐ内部専用フィールド（cards.jsonには{"type":"colorChoiceLendThisTurn"}のみを書く）。BS02-111スピリットイリュージョン）
    | { type: "refreshAllByKeyword"; keyword: Keyword; side?: "own"; keywordCount?: number } // keywordCount指定時は、そのキーワードエントリの count が一致するものだけを対象にする（【暴風：1】と【暴風：2】を区別する。静的なkeywordエントリのみ見るため、付与された暴風は対象外＝簡略化。BS07突風侯爵コカトリーフLv2）。// 指定キーワードを持つスピリットすべて（修飾なし＝両陣営が対象）を回復させる。refreshAllByCostと同様cantAttackThisTurnは付与しない（BS03-X09蛮騎士ハーキュリー：【神速】持ちすべて）。side:"own"指定時は自分のスピリットのみ（BS06名誉ある御前試合Lv2＝「自分のスピリットすべて」）
    | { type: "millPerLoserCost" } // 直前のバトルで「BPを比べ相手のスピリットだけを破壊した」ときの、破壊された側のコストと同じ枚数だけ相手のデッキを上から破棄する（GameState.lastBattleDestroyedCost。記録が0＝まだ発生していないならログのみ。BS06名誉ある御前試合）
    | { type: "recoverAllMagicFromTrashByColorChoice"; colors: Color[] } // colors候補から1色を指定し（interactiveTargets時はトラッシュに該当マジックがある色からrequestChoiceで選択。候補1色以下・非対話時は該当枚数最多の色を自動選択＝同数はcolors配列の先頭）、自分のトラッシュにある指定色のマジックカードすべてを手札に戻す（BS03-X11大天使ヴァリエル：緑/黄から1色）
    | {
          type: "summonRepeatFromHand"
          mode: "free" | "paid" // free=summonFromHandFreeと同じくコストを支払わず維持コアのみリザーブから払う（extraReserveCostPerSummon指定時は1体ごとにさらにリザーブのコアをその数だけ自分のトラッシュへ）。paid=effectiveCostで通常のコストを計算し、維持コア+コストをリザーブから支払う（コスト分はtrashCoresへ。field由来の支払いは非対応）
          familyFilter?: FamilyFilter
          costFilter?: { max?: number; min?: number }
          extraReserveCostPerSummon?: number
      } // 自分の手札にある条件（familyFilter・costFilterはカード静的判定）を満たすスピリットカードを、リザーブが続く限り好きなだけ召喚する（プレイヤー選択の決定的簡略化：1体あたりの必要リザーブが小さいものから貪欲に選び、召喚数を最大化する）。いずれもこの効果で召喚されたスピリットのonSummon効果は発揮されない（BS04-057天使長セラフィー＝mode:"free"／BS02-030兵隊アントマン＝mode:"paid"）
    | { type: "destroyThenMillByCost"; filter?: TargetFilter } // 相手のスピリット1体（filterで絞り込み。非対話時は実効BP最大を自動選択）を破壊し、破壊したスピリットのコストと同じ枚数だけ相手のデッキを上から破棄する（BS07巨人大帝アレクサンダー）
    | { type: "destroyByBpBudget"; budget?: number; budgetFromSelfBp?: true } // 相手スピリットを、**実効BP合計**がbudgetを超えない範囲で好きなだけ破壊する（destroyByCostBudgetのBP版。選び方も同じ貪欲＝残り予算内でBP最大から。BS07剣龍皇エクス・キャリバス：BP合計6000まで）。budgetFromSelfBp指定時はbudgetを無視し、selfの実効BPを予算にする（BS08太陽石の神殿：破壊したスピリット＝勝利したアタッカーのBPまで）
    | { type: "destroyPer"; counter: EffectCounter; filter?: TargetFilter } // カウント値の体数ぶん、相手スピリットを1体ずつ実効BP最大から繰り返し破壊する（filterで絞り込み。0ならログのみ。BS08魔帝龍騎ダーク・クリムゾン＝系統「龍帝」を持つ自分のスピリット1体につき）
    | { type: "destroyDownToOwnCount" } // 相手のスピリットを、その数が自分のフィールドのスピリット数と同じになるまで実効BP最大から破壊する（相手のほうが少ない/同数なら不発。BS08ジャッジメントフレア）
    | { type: "destroyByCostBudget"; budget: number } // 相手スピリットを、コスト合計がbudgetを超えない範囲で好きなだけ破壊する（プレイヤー選択の決定的簡略化：残り予算内でコスト最大のものから貪欲に選ぶ。同コストは実効BP最大を優先）。BS05-X19聖皇ジークフリーデン：[龍皇ジークフリード]/[要塞皇オーディーン]で【転召】したときの上限8への切替は、転召対象の記録が必要になるため簡略化しbudget=5固定とする
    | { type: "selfBuffByExhaustFamily"; familyFilter: FamilyFilter } // familyFilter一致・self以外・回復状態の自分のスピリット1体（実効BP最大を自動選択＝バフ量を最大化する簡略化）を疲労させ、このスピリット自身をその実効BP分だけBP+する（ターン終了時まで。「〜することで」の任意コストは自動発動で簡略化。該当なしはno-op。BS02-X07巨神機トール）
    | { type: "refreshSelfByDestroyFamily"; familyFilter: FamilyFilter } // familyFilter一致・self以外の自分のスピリット1体（実効BP最小を自動選択＝犠牲を最小化する簡略化）を破壊し、このスピリット自身を回復させる（「〜することで」の任意コストは自動発動で簡略化。該当なしはno-op。BS02-X07巨神機トール）
    | { type: "refreshSelfByReturnToDeckTopName"; nameIncludes: string } // nameIncludes一致・self以外の自分のスピリット1体（実効BP最小を自動選択＝犠牲を最小化する簡略化）をデッキの一番上に戻し、このスピリット自身を回復させる（refreshSelfByDestroyFamilyの「破壊」を「デッキの上に戻す」に差し替えた版。「〜することで」の任意コストは自動発動で簡略化。該当なしはno-op。BS08勇者フェニックスペンタン）
    | { type: "protectLifeByCostThisTurn"; maxCost: number; costExhaustFamily?: FamilyFilter } // このターンの間、コストがmaxCost以下のスピリットのアタックでは**発生源の持ち主のライフだけ**が減らされない（GameState.turnConstraints に片側限定の制約を積む。両陣営に効く globalConstraint:"noLifeDamageByCost" の片側版）。costExhaustFamily指定時は、持ち主のフィールドの指定系統（配列＝OR）の回復状態スピリット1体（実効BP最小＝犠牲を最小化する簡略化）を疲労させることがコストで、該当がなければ不発（BS07秘密の花園Lv2＝「楽族」）
    | { type: "forceAttackThisTurn"; side: "opponent"; maxCost?: number; count?: number } // このターンの間、相手のスピリットに「可能ならば必ずアタックする」を課す（GameState.turnConstraints に mustAttack を積む）。maxCost指定時はコストがこれ以下のものすべて（BS08アンブッシュブロッカー：コスト3以下）。count指定時は体数を絞って指定する（targetInstanceId優先、interactiveTargets時はpendingChoice、自動時は実効BP最大。BS08獣機合神セイ・ドリガン：相手のスピリット1体を指定）。**簡略化**：原文の「このステップの最初に」という順序指定は持たず、そのターン中アタックが強制されるだけ
    | { type: "grantCanBlockWhileRestedThisTurn"; familyFilter?: FamilyFilter } // このターンの間、自分のスピリット（familyFilter指定時はその系統＝配列OR）すべてに「疲労状態でもブロックできる」を与える（GameState.turnConstraints。constraint:"canBlockWhileRested"のターン付与版。BS08インフィニティシールド：機獣/武装）
    | { type: "coreDrainToLowerLevel" } // 相手のスピリット1体（targetInstanceId優先、非対話時は実効BP最大）の上のコアを、1つ下のLvに必要なコア数と同じになるまで相手のトラッシュへ置く。Lv1のスピリット（1つ下のLvが無い）は対象にしても何も起きない。装甲・マジック効果耐性はcoreRemoveと同じ経路で尊重する（BS06-096レベルドレイン）
    | { type: "grantEffectToTargetThisTurn"; trigger: TriggerEvent; action: EffectAction; battleRole?: "attacker" | "blocker"; filter?: TargetFilter } // 自分のスピリット1体（targetInstanceId優先。フォールバックはfilter一致の中から実効BP最大。interactiveTargets時は複数候補ならrequestChoice）に、このターンの間だけ指定の誘発効果を直接付与する（CardInstance.tempGrantedTriggers、ターン終了でリセット。fireTriggerが静的effectsと同様に走査する。effectGrantと違い対象は1体・仮想発生源を要しない。BS08メテオストーム＝カード名に「ヴルム」と入っている自分のスピリット1体に『このスピリットのアタック時』効果を付与）
    | { type: "revealAndSummonAllByFamily"; count: number; familyFilter: FamilyFilter } // 自分のデッキ上からcount枚を公開し、その中の指定系統（配列＝OR）を持つスピリットカード**すべて**を、コストを支払わず、【転召】させずに召喚する（維持コアが足りない分は召喚できずトラッシュへ。revealAndSummonKeywordと異なり任意選択を挟まない範囲効果）。この効果で召喚されたスピリットの『召喚時』効果は発揮されない（revealAndSummonKeywordは発揮する点と対照的）。系統不一致・召喚できなかったカードはすべてトラッシュへ破棄する（BS08魔帝龍騎ダーク・クリムゾン：上7枚から系統「龍帝」/「竜騎」すべて）
    | { type: "millUntilFamilyToHand"; family: FamilyFilter; maxCount: number } // 自分のデッキを上からmaxCount枚を上限に、指定系統（配列＝OR。カード静的なfamilyで判定）を持つスピリットカードが出るまでトラッシュへ破棄し、出ればそのカード1枚を手札に戻す（出ないまま上限/デッキ切れに達したら手札には戻らない。BS08冥将アマイモン）
    | { type: "costOwnSpiritCoresToTrashThenOpponent"; count: number } // 自分のフィールドのスピリット上のコア合計がcount未満なら不発（ログのみ）。足りれば、自分のスピリットからコアの多い個体順に合計count個を自分のトラッシュへ置き（bothSidesCoreToTrashと同じ選び方）、続けて同じ処理を相手のスピリットに対しても行う（相手は必ず支払う。維持コア割れは消滅処理。BS08マインドブレイク：5個）

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
    | "ownRestedNexuses" // 自分の疲労状態のネクサス数（【強襲】がネクサスを疲労させるため。BS07ネクサスアタック）
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "allExhausted" // 両陣営の疲労スピリット数の合計（ownExhausted + exhaustedEnemies。BS05大甲帝デスタウロス）
    | "selfCoresAtDestruction" // 破壊時点でこのスピリット上に置かれていたコア数（destroySpiritが破壊直前に記録。漆黒鳥ヤタグロス）
    | "lastBattleDestroyedCores" // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（GameEngine.resolveBattleが記録、次のバトル解決の冒頭でリセット。魔界七将デストロード）
    | "opponentTrashCores" // 相手のトラッシュに置かれているコア数（PlayerState.trashCores。BS04吸血鬼ダンピール）
    | "selfSymbols" // このスピリット（self）自身が持つシンボル数（instanceSymbolCount。selfがnullなら0。BS05碧緑の竜使いグリューン：「このスピリットのシンボルと同じ数」）
    | "targetSymbols" // **対象スピリット自身**（bpBuffPerが解決するtargetInstanceId等）が持つシンボル数。selfSymbolsと異なりself（発生源）ではなく対象基準。マジックはself=nullのためselfSymbolsが使えない場合に使う（bpBuffPerハンドラが対象選択後に個別計算する。BS06サベージパワー）
    | "lastFunsaiTotal" // 直前の【粉砕】で破棄した総枚数（GameState.lastFunsai。次のアタック宣言でリセット。BS03巨人王ランドルフ）
    | "lastFunsaiSpirits" // 直前の【粉砕】で破棄したカードのうちスピリットカードの枚数（GameState.lastFunsai。BS04二刀流のアムブローズ）
    | { ownFamily: string }
    | { ownNameIncludes: string }
    | { anyNameIncludes: string } // 両陣営のフィールドでカード名にこの文字列を含むスピリット数（ownNameIncludesの両陣営版。BS06アルカナナイト・ヘクス：修飾なしの「スピリット」）
    | { ownColor: Color } // 自分のフィールドの指定色スピリット数
    | { ownColorSymbols: Color } // 自分のフィールドのスピリットが持つ指定色シンボルの合計数（BS04機動要塞キャッスル・ゴレム＝青シンボル）
    | { ownKeyword: Keyword } // 自分のフィールドで指定キーワードを持つスピリット数（静的・一時付与・継続付与すべて考慮。spiritHasKeywordで判定。BS05双剣虎ジェン・フー：【神速】持ち1体につき）
    | { ownNexusColor: Color } // 自分のフィールドの指定色ネクサス数（BS03武器コレクターのゴドフリー：青のネクサス1つにつき）
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
    | "ownNexusDeployed" // 自分のフィールドにネクサスが配置されたとき（通常の配置・効果による配置・復活のいずれからも発火。BS04栄光の表彰台）
    | "opponentMagicUsed" // 相手がマジックの効果を使用したとき（resolveMagicから発火。eventInfoにcost/timingを載せ、magicCostEquals・magicTimingで絞る。BS04氷の女神フリッグ）
    | "ownSpiritReturnedToHand" // 自分のスピリットがフィールドから手札に戻ったとき、持ち主のフィールド発生源から発火（returnSpiritToHand から。破壊は含まない。**self には戻ったスピリットが渡る**。BS01リターンドロー）
    | "ownSpiritExhausted" // 自分のスピリットが疲労したとき、持ち主のフィールド発生源から発火（**self には疲労したスピリットが渡る**。BS02生み出される尖兵Lv2／BS02スクルディア）
    | "anySpiritExhausted" // 両陣営どちらかのスピリットが疲労したとき、両者のフィールド発生源から発火（**self には疲労したスピリットが渡る**。BS05藍紫の虚空Lv1）
    | "ownSpiritDealtLife" // 自分のスピリットのアタックによって相手のライフを減らしたとき、持ち主のフィールド発生源から発火（**self にはライフを減らしたスピリットが渡る**。onLifeDealtの直後。BS06-X22魔界七将ベルゼビート）
    | "ownTensho" // 自分の【転召】が解決したとき（dumpAllCoresTenshoが唯一の解決点から発火。eventInfo.families=犠牲になったスピリットのカード静的な系統。BS08関将龍皇ドラグロン：系統「竜人」を持つスピリットで【転召】したとき）
// ※ 疲労イベントは EffectModules.exhaustSpirit（疲労の唯一の入口）から発火する。アタック宣言・ブロック宣言・
//    効果による疲労のいずれも通る。すでに疲労している個体を疲労させ直しても発火しない

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
    | "bofu" // 暴風：ブロックされたとき、**相手が**相手自身のスピリットを指定数だけ疲労させる（BS06初出）
    | "seimei" // 聖命：このスピリットのアタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く（BS07初出）
    | "kyoshu" // 強襲：アタック時、ターン中に指定数まで、自分のネクサス1つを疲労させることで自身を回復できる（BS07初出）
    | "hyoheki" // 氷壁：相手が指定色のマジックの効果を使用したとき、このスピリットを疲労させることでその効果を無効にする（BS08初出）
// ※ 暴風と同じく、seimei / kyoshu / hyoheki も**キーワードエントリ自体は宣言**で、挙動は対になる
//    エントリが持つ（seimei/kyoshu は triggered の onLifeDealt / onAttack、
//    hyoheki は kind:"magicNegate"（cost:{exhaustSelf:true}＋colors＋turn:"opponent"））。宣言があることで
//    「【聖命】を持つ自分のスピリットすべて」のようなキーワード指定の絞り込みが効く

// 常時BP修正（オーラ）のカウンタ。発生源の持ち主基準で数える。
export type AuraCounter =
    | "ownReserve" // 自分のリザーブのコア数
    | "ownNexuses" // 自分のネクサス数
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "targetArmorColors" // **対象自身**（発生源ではない）が持つ【装甲】の指定色数。静的・一時付与・継続付与を合算・重複除く（BS05アイシクルアサルト）
    | { ownFamily: string } // 自分フィールドの指定系統を持つスピリット数（発生源自身も含む）
    | { ownNameIncludes: string } // 自分フィールドでカード名にこの文字列を含むスピリット数（発生源自身も含む。アルカナプリンス・オベロ）
    | { ownCost: number } // 自分フィールドの指定コストのスピリット数（発生源自身も含む。instHasCostで判定＝付与コストも考慮。BS06細剣の猫騎士ケット・シー）

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
    battlingOnly?: boolean // バトル中（アタッカーまたはブロッカー）のスピリットのみ
    amount?: number // 固定量（condition と併用可）
    amountPer?: number // counter × amountPer の可変量
    counter?: AuraCounter
    condition?: AuraCondition // 満たすときのみ amount を適用
    summonedThisTurnOnly?: boolean // ownAll 用: 対象の summonedTurn === state.turn のスピリットのみ（このターン召喚されたスピリットに限定）
    keywordFilter?: Keyword // ownAll 用: 指定キーワード（静的付与・一時付与・keywordGrant すべて含む）を持つスピリットのみ（暴双龍ディラノス）
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
    | { type: "unblockableBy"; colorFilter?: Color; keywordFilter?: Keyword; keywordFilterAbsent?: Keyword; maxCores?: number; maxCost?: number; maxBp?: number; levelFilter?: number[]; costNot?: number; costAtMostAttacker?: true; nonVanilla?: true; requireOwnFieldColorNexus?: Color; requireOwnCostCountAtLeast?: { cost: number; count: number } } // maxBp指定時はブロッカーの実効BPがこれ以下ならブロックされない（BS07鋼翼魚オルカノンLv2＝BP4000以下）。maxCost指定時はブロッカーのコストがこれ以下ならブロックされない（costNot＝完全一致の否定とは別軸。instMatchesCostFilterで判定＝付与コストも見る。BS07聖なる命の泉Lv2）// nonVanilla指定時は「カードに効果の記述を持つ」スピリットにブロックされない（isVanillaCardの否定。BS05幻獣王リーンLv3）／requireOwnCostCountAtLeast指定時は、持ち主のフィールドに指定コストのスピリットがcount体以上いる間だけ有効（activeConstraintsが判定して外す。BS05幻獣王リーンLv3＝コスト2が3体以上） // requireOwnFieldColorNexus指定時は、持ち主のフィールドに指定色のネクサスがある間だけ有効（BS03鷹人ホークアイLv2＝紫のネクサス） // このスピリットのアタックは、指定色／指定キーワード持ち／コア数がmaxCores以下／currentLevelがlevelFilterに含まれる／コストがcostNot以外のスピリットにブロックされない。costAtMostAttacker指定時はブロッカーのコストがこのアタッカーのコスト以下ならブロックされない（BS05ポテンシャルパワー：バニラのアタックは同コスト以下にブロックされない）。keywordFilterAbsent指定時はこのキーワードを持た**ない**スピリットにブロックされない（keywordFilterの否定版。BS08光帝竜騎アルカナジョーカーLv3＝【転召】を持たない相手）
    | { type: "mustAttack" } // このスピリットはアタックできるとき、必ずアタックしなければならない
    | { type: "protectOwnLifeByBpUpToSelf" } // ブロックされなかったアタッカーの実効BPが**この発生源自身の実効BP以下**のとき、そのアタックでは発生源の持ち主のライフは減らされない（片側のみ。ライフダメージ直前に activeConstraints から発生源ごとのBPを引き直して比較する。BS08空帝竜騎プラチナム）
    | { type: "untargetableByOpponent" } // このスピリットは相手のスピリット/マジックの効果の対象にならない（クイーン・ワルキューレ。範囲効果には無力）
    | { type: "immuneToOpponentSummonEffects" } // このスピリットは、相手のスピリットの『このスピリットの召喚時』効果を受けない（isEffectBlockedがGameState.resolvingSummonTriggerPidを見て判定する。BS05リトルナイト・ランスロットLv3）
    | { type: "immuneToOpponentEffects" } // このスピリットは、相手のスピリット/マジックの効果を受けない（untargetableByOpponentと異なり範囲効果にも有効。ネクサスの効果・自分の効果は通る。BS04ワルキューレ・ヒルド）
    | { type: "canDirectAttack"; targetFilter: "rested" | "singleCore" | "recovered" | "any"; targetMinBp?: number; targetMinCost?: number } // targetMinCost指定時は相手スピリットのコストがこれ以上のもののみ指定できる（instMatchesCostFilterで判定＝道化師クランの付与コストも見る。BS05天焦がす大聖火Lv2：コスト5以上） // 相手スピリット1体を指定してアタックできる（targetFilter: rested=疲労状態のみ、singleCore=コア1個のみ、recovered=回復状態のみ、any=状態条件なし。イリュージョナ／牛霊スモゥグ／オルカリア）。targetMinBp指定時は相手スピリットの実効BPがこれ以上のものだけ指定できる（BS05シンクロニシティ：BP4000以上。BP条件だけで絞りたい場合はtargetFilter:"any"と組み合わせる）
    | { type: "cantAttack"; unlessOpponentHasColorSpirit?: Color } // このスピリットはアタックできない（カイザレオン大帝Lv1）。unlessOpponentHasColorSpirit 指定時は「持ち主から見た相手のフィールドに指定色のスピリットがいない間」だけ有効（activeConstraints が判定して外す。BS04鎧装獣ヘイズ・ルーン＝赤）
    | { type: "lifeDamageToVoid" } // このスピリットがアタッカーとしてライフダメージを与えるとき、相手のライフから取り除かれるコアはリザーブでなくボイドへ（スライミーLv3）
    | { type: "noRestWhenBlockingColor"; color: Color } // このスピリットが指定色のスピリットをブロックしたとき疲労しない（巨神機トール）
    | { type: "noRestWhenBlockingCost"; maxCost?: number; sameCost?: true } // このスピリットが、コストmaxCost以下（sameCost指定時は自身と同じコスト）の相手のスピリットをブロックしたとき疲労しない（noRestWhenBlockingColor の兄弟。BS07シルバー・ゴレム／造兵工房）
    | { type: "noRestWhenBlockingWithoutKeyword"; keyword: Keyword } // このスピリットが、指定キーワードを**持たない**相手のスピリットをブロックしたとき疲労しない（noRestWhenBlockingColor/Cost の兄弟。BS07ブリシンガメンの首飾りLv2＝【転召】を持たない相手）
    | { type: "noRefresh" } // このスピリットはリフレッシュステップで回復しない（スクルディア）
    | { type: "tenshoCoreSubstitute" } // このスピリットが【転召】の対象になったとき、疲労していなければ、疲労することでコアすべてを指定場所に置いたものとして扱う（実際にはコアを失わない代替。dumpAllCoresTenshoが判定する。BS05の竜使い6枚）。「疲労させることで」は**任意**なので、interactiveTargets時は「疲労する／コアを置く」の選択を出す（自動時は疲労を選ぶ決定的簡略化）
    | { type: "canBlockWhileRested"; targetMaxCost?: number; targetKeywordExclude?: Keyword } // このスピリットは疲労状態でもブロックできる（shared/block.canBlockが判定）。targetMaxCost指定時はアタッカーのコストがこれ以下のときのみ（BS06計画された場外乱闘Lv1-2：コスト1以下）。targetKeywordExclude指定時はアタッカーがそのキーワードを持たないときのみ（spiritHasKeyword判定＝一時付与も見る。BS08一角魚モノケロック：【転召】を持たない相手のスピリット）

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "singleCoreCantAttack" } // コア1個しか置いていないスピリットは、アタックができない（ブロックは可能。singleCoreCantActのアタック限定版。両陣営。BS08赤き砂の座）
    | { type: "noLifeDamageByCost"; maxCost?: number; costs?: number[]; keywordExclude?: Keyword } // コストがmaxCost以下のスピリットのアタックでは、お互いのライフは減らされない（両陣営。BS07の「勇傑」各色に共通）。costs指定時はmaxCostの代わりに**コスト完全一致**（配列＝いずれかに一致。instAllCostsのいずれかが含まれればよい。BS08守護機獣スノパルド：コスト3/4）。keywordExclude指定時は、アタッカーがそのキーワードを持つときは保護しない（spiritHasKeyword判定。同カード：【転召】を持たない）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）
    | { type: "ownNexusIndestructible" } // 発生源の持ち主のネクサスすべては、相手の効果によって破壊されない
      // （hasGlobalConstraintの両陣営走査とは異なり、destroyNexusが破壊対象ネクサスの持ち主のフィールドのみを判定する。サファイアの城壁）
    | { type: "maxSpiritsOnField"; max: number } // 両陣営とも、フィールドのスピリットがmax体以上のときは召喚できない（メインステップの通常召喚のみ。BS04旋風渦巻く渓谷＝5体以上召喚できない＝max4）
    | { type: "levelCantAct"; levels: number[] } // currentLevel がこのリストに含まれるスピリットは、アタックとブロックができない（両陣営。costCantAct のレベル版。BS07腐りゆく湖沼Lv2＝Lv1）
    | { type: "costCantAct"; maxCost?: number; costs?: number[] } // コストがmaxCost以下のスピリットは、アタックとブロックができない（両陣営。shared/rules.tsの専用判定costCantActが参照。BS05白夜の虚空Lv1=maxCost1、青嵐の虚空Lv1=maxCost2）。costs指定時はmaxCostの代わりにこのリストと完全一致するコストのみ対象（BS02グレートウォール：コスト6と8）
    | { type: "millCap"; maxCount: number; perTurn?: boolean } // 発生源の持ち主のデッキは、相手の効果によるミル（mill/millPer/粉砕/voidCoresAndMillByCost等）でmaxCount枚を超えて破棄されない
      // （ownNexusIndestructibleと同様に発生源の持ち主のみに効く。EffectModules.millCapForがeffectSources経由で判定＝lendSelfThisTurnで貸与可。
      // perTurn省略時=1回のミルにつきmaxCount枚まで（BS05エターナルシールド：5枚まで＝6枚以上破棄されない）。
      // perTurn:true=ターン累計でmaxCount枚まで（GameState.millCountThisTurnで加算管理。BS04侵されざる聖域Lv2：ターンに5枚まで）
    | { type: "battlingCoresProtected" } // 現在バトルをしている両陣営のスピリット上のコアは、効果（コア除去アクション）によって取り除かれない
    | { type: "battlingEffectImmune" } // 現在バトルをしている両陣営のスピリットは、お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る。EffectModules.isEffectBlocked が破壊・コア除去・疲労・バウンス等のガードから参照。BS05茨の決戦地Lv2）
      // （removeCores/removeCoresToTrash/removeCoresToVoidの共通フックで判定。coreSqueezeAll/One・coreDrainAllOthers・coreToVoidOwnなど
      // 直接コアを操作する一部アクションはこの経路を通らないため対象外＝簡略化。BS05茨の決戦地Lv1-2）
    | { type: "noTrashRecovery" } // お互い、トラッシュからカードを手札に戻せない（recoverSpiritFromTrash / recoverMagicFromTrash / recoverAllMagicFromTrashByColorChoice の各ハンドラ冒頭で判定。BS06鎖縛の武舞台Lv1-2）
    | { type: "noSummonTriggerByCost"; maxCost: number } // お互い、コストがmaxCost以下のスピリットの『このスピリットの召喚時』効果は発揮されない（召喚時トリガーの発火直前に判定して落とす。BS08共鳴する音叉の塔：コスト4以下）
    | { type: "noReductionBySummonCost"; maxCost: number } // お互い、コストがmaxCost以下のスピリットカードを召喚するとき、軽減シンボルによるコスト軽減ができない（**カード静的なコスト**で判定＝軽減前の値。使用コスト計算の共通経路で軽減分を0にする。BS08超時空重力炉：コスト3以下）
    | { type: "coreFloorByCost" } // 両陣営のスピリット上のコアは、効果によってそのカードのコスト（Lv1コスト）を下回るまで取り除けない（removeCores/removeCoresToTrash/removeCoresToVoidの共通処理で判定。**簡略化**：coreSqueezeAll/One・bothSidesCoreToTrash/Void・moveCoresLeavingOne・swapOpponentCores等、コアを直接操作する範囲効果はこの下限を尊重しない。BS08聖なる柱状彫刻）
    | { type: "noDrawOutsideDrawStep" } // お互い、ドローステップ以外でドローできない（GameState.drawの共通経路冒頭で判定。ドローステップ自身はfromDrawStep引数で除外する。BS08豚人チョウハッカイ）
    | { type: "summonLimitByCostForOpponent"; maxCost: number; limit: number } // 発生源の持ち主から見た**相手**は、コストがmaxCost以下のスピリットをターンにlimit体までしか召喚できない（RuleValidator.validateSummonが、相手フィールドのCardInstance.summonedTurnで自分のこのターンの該当召喚数を数えて判定。神速召喚も対象。BS08夢想法師サンゾール：コスト4以下は1体まで）

// 破壊の発生源コンテキスト（省略可）。復活系効果（reviveOnDestroy）が参照する。
export interface DestroyContext {
    sourcePid?: PlayerId // 破壊を引き起こした効果の持ち主（相手の効果による破壊か判定する）
    sourceType?: "spirit" | "nexus" | "magic"
    battle?: { attackerColors: Color[]; attackerLevel?: number; attackerBp?: number } // バトルによる破壊のときの「破壊した側（勝者）」の色・レベル・実効BP（装甲・reviveOnDestroy判定用。呼び出し側の命名は歴史的にattacker*だが、実際は勝者側の値を渡す）
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
          colorsFrom?: "opponentFieldSymbols" // 装甲用: colorsの代わりに、持ち主から見た相手フィールドのシンボル色を毎回算出して使う（【装甲：∞】。EffectModules.refreshLevelAsOverridesがarmorColorsGrantedへ都度再構築する。BS06鎧神機ヴァルハランス）
          count?: number // 暴風用: 指定数（【暴風：2】＝2体）。表示と、同じカードの誘発エントリの体数を読み合わせるために持つ
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
          battleRole?: "attacker" | "blocker" // onBattleWin 専用：勝利したときの自分の役割がこれと一致する場合のみ発火（省略時は従来通り常に発火）
          condition?:
              | { opponentNexusColorsAtLeast: number } // 指定時、持ち主から見て相手フィールドのネクサスの色数（重複除く）がこれ以上のときのみ発火（溶海竜プレシオスLv3）
              | { ownFieldHasColorSpirit: Color } // 発生源の持ち主のフィールドに指定色のスピリットがいるときのみ発火（tempColors考慮＝instHasColor。オチョゴ／ジェルフィ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（天使キュリオ）
              | { targetSameLevelAsSelf: true } // fireTriggerのtargetInstanceIdのスピリットのLvがselfのLvと同じときのみ発火（onBlocked用。剣竜ステゴラーサウルス）
              | { ownFieldHasKeyword: Keyword } // 発生源の持ち主のフィールドに指定キーワード持ちのスピリットがいるときのみ発火（一時/継続付与も考慮＝spiritHasKeyword。BS04クナノミ＝覚醒）
              | { firstAttackOfTurn: true } // そのターンの最初のアタックのときのみ発火（GameState.attacksThisTurn === 1。BS04ダックル）
              | { lastFunsaiHasNexus: true } // 直前の【粉砕】で破棄したカードの中にネクサスカードがあったときのみ発火（GameState.lastFunsai。BS04伝説巨人ジュード）
              | { lastFunsaiHasSpirit: true } // 直前の【粉砕】で破棄したカードの中にスピリットカードがあったときのみ発火（GameState.lastFunsai。BS06爆砕巨人ダグラスLv2-3）
              | { targetMinBp: number } // fireTriggerのtargetInstanceIdのスピリットの実効BPがこれ以上のときのみ発火（onBlock用。BS06鍵鎚のヴァルグリンドLv2＝BP4000以上をブロックしたとき）
              | { targetHasColor: Color } // fireTriggerのtargetInstanceIdのスピリットがこの色を持つときのみ発火（instHasColorで判定。onBlocked用。BS06鉄蠍竜スコルド・ゴランLv3＝白にブロックされたとき）
              | { targetMaxCost: number } // fireTriggerのtargetInstanceIdのスピリットのコストがこれ以下のときのみ発火（instMatchesCostFilterで判定。onBlocked用。BS06激神皇カタストロフドラゴンLv3＝コスト5以下にブロックされたとき）
              | { targetNotMaxLevel: true } // fireTriggerのtargetInstanceIdのスピリットのcurrentLevelが、そのカードが持つ最高Lv未満のときのみ発火（onBlocked用。BS07神帝獣スフィン・クロスLv3＝最高Lvではない相手にブロックされたとき）
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 発生源の持ち主のフィールドに、カード名にいずれかの文字列を含むスピリットが合計count体以上いるときのみ発火（cardNameContainsで判定。step.conditionの同名軸と同じ形。BS07マカロニペンタン＝[皇帝アンプルール]/[女帝ペンプレス]）
              | { battleLoserMaxCost: number } // onBattleWin 専用：直前のバトルで破壊した相手のコストがこれ以下のときのみ発火（GameState.lastBattleDestroyedCost。resolveBattle が onBattleWin の発火前に記録する。BS07天刃の勇者ヴォルザLv2＝コスト3以下だけを破壊したとき）
              | { opponentHandAtLeast: number } // 発生源の持ち主から見た相手の手札枚数がこれ以上のときのみ発火（サーバー内部のstate.players[opp].hand.lengthで判定。BS08ボクルガー：相手の手札6枚以上）
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
              | { bothFieldsHaveNexus: true } // お互いのフィールドにネクサスが1つ以上あるときのみ実行（BS02クロスファイア）
              | { ownSpiritIsBlocking: true } // 自分のスピリットが現在のバトルでブロッカーになっているときのみ実行（BS07アームズインパクト）
              | { ownSpiritCountAtLeast: number } // 自分のフィールドのスピリット数がこれ以上のときのみ実行（BS08ジャッジメントフレア＝2体以上）
              | { ownFieldHasAllNames: string[] } // 自分のフィールドのスピリットに、指定したカード名すべてが1体ずつ揃っているときのみ実行（カード名の完全一致。cardIdではなく名前で判定＝実データのID変動に影響されない。BS08ロイヤルストレートフラッシュ）
      }
    | {
          id: string
          kind: "step"
          step: Phase // 発火するステップ
          turn: "own" | "opponent" | "both" // own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時、both=常に
          timing?: "end" // 指定時は「そのステップの終了時」に発火する（省略時＝ステップ開始時＝従来どおり）。いまは attack のみ発火点があり、PhaseManager.endTurn がエンドステップへ移る直前に呼ぶ（BS02紫水晶の森Lv2＝「ステップ終了時」）
          levels: number[] | null
          action: EffectAction
          optional?: true // 「〜できる」= 任意。triggered.optional と同じく、interactiveTargets では発動確認を出す（BS02皇帝アンプルール：リザーブのコアを払う任意コスト）
          condition?:
              | "handNotGreaterThanOpponent" // 持ち主の手札枚数が相手以下（主無き古城Lv2）
              | "selfWasRefreshedThisStep" // 発生源自身がこのリフレッシュステップで回復した場合のみ（PhaseManagerが渡すrefreshedInstanceIdsで判定。魔界侯爵コキュートス）
              | { ownSymbolColorAtLeast: { color: Color; count: number }; noAttacksThisTurn?: true } // 発生源の持ち主のフィールド（スピリット+ネクサス）が持つ指定色のシンボル数がcount以上。noAttacksThisTurn指定時は、さらにこのターンまだ1度もアタックが行われていないときのみ（BS04ハートレス・ティンLv2＝白シンボル3つ以上かつ相手が1回もアタックしてこなかったとき）
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（道化師クラン）
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上（BS04王蛇の住処＝妖蛇/無魔）
              | { ownHandAtLeast: number } // 発生源の持ち主の手札がこの枚数以上（BS04水蛇シーサーペンタ＝Lvごとに10/8/6枚以上）
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 発生源の持ち主のフィールドに、カード名にいずれかの文字列を含むスピリットが合計count体以上（BS04郵便ペンタン＝ペンタン/アンプルール）
              | { ownRefreshedSpiritsAtLeast: number } // 発生源の持ち主のフィールドに回復状態（isRested:false）のスピリットがこの体数以上（BS02紫水晶の森Lv2＝3体以上）
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
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（own=『自分のターン』。BS06細剣の猫騎士ケット・シー）
          protectFamily?: FamilyFilter // 指定時、「発生源自身が対象」ではなく「持ち主のこの系統（配列＝OR）のスピリットが対象に含まれる」ときに絞り込む。絞り込み先は発生源自身（BS05プリンセス・スノーホワイト＝自分の白の「氷姫」を守り、対象を自分に付け替える）
          protectColor?: Color // protectFamily と併用：守る対象をこの色を持つスピリットに限る（スノーホワイト＝白）
          protectCost?: number // protectFamilyと同型：守る対象を「持ち主のこのコストのスピリット」に限る。絞り込み先は発生源自身（BS06細剣の猫騎士ケット・シー＝コスト2）
      }
    | {
          id: string
          kind: "jugekiCoreToVoid" // 発生源が場にありレベル有効の間、持ち主のスピリットの【呪撃】で破壊される相手スピリット上のコアをcount個ボイドへ置く（破壊の直前に取り除くので、その分は持ち主のリザーブに戻らない）。GameEngine の呪撃解決が applyJugekiCoreToVoid 経由で参照する（BS04魔影街Lv1）
          levels: number[] | null
          count: number
      }
    | {
          id: string
          kind: "countAsMultiple" // 発生源が場にありレベル有効の間、**持ち主の効果**が「スピリットの数を数える」とき、この個体を count 体分として数える。判定は shared/rules.spiritCountWeight（BS05シーサーズLv2＝2体分）
          levels: number[] | null
          count: number
      }
    | {
          id: string
          kind: "nexusCostMillPay" // 発生源が場にありレベル有効の間、持ち主は**ネクサスの配置コスト**を「コスト1につき自分のデッキを上から1枚破棄」で支払える（ネクサスの上に置くコアはこの方法では払えない）。判定は shared/cost.nexusMillPayCapacity。どこまでデッキ破棄で払うかは選べず、**コアで足りない分だけ**自動的にデッキ破棄に回す簡略化（BS04栄光の表彰台Lv1）
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "magicNegate" // 発生源が場にありレベル有効の間、**相手が使用したマジックの効果を無効にする**（効果は1つも解決されない。カード自体は通常どおり使用扱いでトラッシュへ行き、「マジックの効果を使用したとき」の誘発は発揮される）。EffectModules.findMagicNegateSource が resolveMagic の冒頭で判定し、実対戦では防御側に確認を出す（interactiveTargets でないときは自動で無効化する）。BS02鏡の回廊Lv2／今後の【氷壁】
          levels: number[] | null
          cost: { selfCoresToVoid: number } | { exhaustSelf: true } // 無効化に必要な支払い。selfCoresToVoid=発生源上のコアをN個ボイドへ（鏡の回廊Lv2＝2個）／exhaustSelf=発生源のスピリットを疲労させる（回復状態でなければ使えない。【氷壁】）
          colors?: Color[] // 指定時、そのいずれかの色を持つマジックだけを無効にできる（【氷壁：赤】＝赤のマジックのみ）
          phase?: Phase // 指定時はこのステップ中のみ有効（鏡の回廊Lv2＝『お互いのアタックステップ』）
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ／opponent=でないときのみ（【氷壁】＝『相手のターン』）
          oncePerTurn?: true // 発生源1つにつきターン1回だけ（CardInstance.magicNegateUsedTurn で管理。鏡の回廊Lv2）
      }
    | {
          id: string
          kind: "bothSidesTargetRedirect" // 発生源が場にありレベル有効の間、「お互いを対象とする**マジック**の効果」の対象を片側だけに変更する。本来は「相手のみ」「自分のみ」を選べるが、選択を挟む仕組みが無いため**発生源の持ち主に有利な側に固定**する（不利益な効果は持ち主を外し、ドロー等の利得は相手を外す）。EffectModules.bothSidesPids が両陣営対象のアクションから呼ばれる（BS02封印された魔導書Lv1）
          levels: number[] | null
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ有効（『自分のターン』）
      }
    | {
          id: string
          kind: "familySuppression" // 発生源が場にありレベル有効の間、条件に合うスピリットは系統をないものとして扱う（新たに得ることもない）。shared/rules.spiritHasFamily が最初に判定するので、matchesFamilyFilter 経由の判定もすべて false になる（BS03暗礁海域Lv1）
          levels: number[] | null
          target: "anyAll" // 両陣営のスピリットすべて（『すべては』）
          maxCores?: number // 指定時、置かれているコアがこの数以下のスピリットのみ対象（暗礁海域＝2個以下）
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ有効（『自分のターン』）
      }
    | {
          id: string
          kind: "battleSwapSummon" // **手札にあるこのスピリットカード**を、フラッシュ中のバトルで
          // 「バトルしている自分の substituteName 一致スピリット1体を手札に戻す」ことを**追加コスト**として
          // 疲労状態で召喚し、そのスピリットの代わりにバトルを引き継ぐ。
          // 効果文に「コストを支払わずに」が無いので**召喚コストは通常どおり支払う**。
          // GameAction summon の substituteInstanceId を指定した経路で使う
          // （RuleValidator.validateSummon と GameEngine.doSummon が判定・実行する。BS07ブラックカラカロッサム）
          levels: number[] | null // 手札のカードが対象なので実質レベル不問だが、効果文の見出しに合わせて持つ
          substituteName: string // 手札に戻す対象のカード名。効果文の[カード名]表記は**完全一致**なので
          // 部分一致にしない（"カラカロッサム" を部分一致にすると[ブラックカラカロッサム]自身も対象になってしまう）
      }
    | {
          id: string
          kind: "handKeywordGrant" // 発生源が場にありレベル有効の間、持ち主の**手札**にある条件一致のカードにキーワードを与える。tempHandKeywordGrants（ターン限定の一時付与）と違い、手札には書き込まず判定時に場の発生源を見る。shared/rules.hasHandKeywordGrant が RuleValidator とクライアント表示の双方から呼ばれる（BS02緑芽吹く原野Lv2＝手札の「怪虫」に【神速】）
          levels: number[] | null
          keyword: Keyword
          familyFilter?: string // 指定時はカード静的な系統にこれを含むカードのみ
          cardType?: CardType // 指定時はこの種別のカードのみ（省略時はスピリット）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "battleBpAsLevel" // 発生源が場にありレベル有効の間、持ち主のfromLevelのスピリットは、**バトルのBP比較のときだけ** useLevel のBPを使う（GameEngine.resolveBattle が battleBp 経由で参照。効果の対象条件やオーラのBP判定には影響しない）。BS03果て無き地平線Lv1＝Lv1スピリットがLv2BPを使う
          levels: number[] | null
          fromLevel: number
          useLevel: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          keywordFilter?: Keyword // 指定時はこのキーワードを持つスピリットのみ対象（spiritHasKeywordで判定。BS06神葉樹の森Lv2＝【神速】持ちのLv1のみ）
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
          winnerMinCores?: number // 勝利したスピリットに置かれているコアがこの数以上のときのみ発火（BS02エメラルドに輝く鍾乳洞Lv2＝コア3個以上）
          winnerFamilyFilter?: FamilyFilter // 勝利したスピリットが指定系統を持つときのみ発火（配列＝OR。matchesFamilyFilterで判定。BS04ドラゴンズラッシュ：翼竜/竜人/古竜）
          winnerKeywordFilter?: Keyword // 勝利したスピリットがこのキーワードを持つときのみ発火（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定。BS03熾烈極める最前線Lv2＝覚醒持ち）
          selfOnly?: true // 発生源自身が勝利したときのみ発火（『このスピリットのバトル時』。同名の別個体では発火しない。BS01要塞龍ギガLv2）
          firstAttackOfTurn?: true // そのターンの最初のアタックで勝利したときのみ発火（GameState.attacksThisTurn === 1。triggered.condition／fieldEvent.conditionの同名軸と同じ判定。BS08太陽石の神殿）
          optional?: true // 「〜できる」＝任意。interactiveTargets では発動確認を出す（step/triggered の optional と同じ扱い。BS01要塞龍ギガLv2）
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
          excludePhase?: Phase // 指定時はこのステップでは発火しない（phaseと排他。BS08ダークアンキラーザウルス＝「ドローステップ以外で相手がドローしたとき」）
          turn?: "own" | "opponent" // 指定時はこの陣営条件でのみ発火（own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時。省略時はどちらでも発火）
          colorFilter?: Color // event: "ownSpiritDestroyed" | "ownSpiritBlocked" | "anySpiritAttacked" 限定：対象スピリットの色がこれと一致するときのみ発火
          // （祝福されし大聖堂／花の子リップ／BS05天焦がす大聖火。anySpiritAttackedはeventColors=instColors(アタックしたスピリット)で判定）
          selfMode?: "source" // 指定時、resolveActionのselfにイベント対象（アタックしたスピリット等）でなく発生源インスタンス自身を渡す（battleWonのselfModeと同じ。BS04鎧装獣ヘイズ・ルーン＝自身が回復する）
          vanillaOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがカードに効果の記述を持たない（バニラ）ときのみ発火（運命分かつ岐路）
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火（運命分かつ岐路）
          byOpponentEffectOnly?: true // event: "ownNexusDestroyed" 限定：**相手の**スピリット/ネクサス/マジックの効果で破壊されたときのみ発火（BS07の各色ネクサス6枚）。
          // destroyNexus に渡された DestroyContext で判定する（sourceType があり＝効果による破壊、かつ sourcePid が持ち主と異なる）。
          // 発生源不明（context 省略＝テストや将来の経路）のときは**発火しない**側に倒す：
          // 「相手の効果で」という限定を、文脈が分からないときに緩める方が誤りが大きいため
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上のときのみ発火（花の子リップ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（instHasColor判定。修理屋バラン・バラン）
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上のときのみ発火（BS04魔力満ちる泉＝四道3体以上）
              | "selfIsAttacking" // 発生源自身が現在のバトル（state.battle）のアタッカーであるときのみ発火（キノコノコ）
              | { firstAttackOfTurn: true } // event: "anySpiritAttacked" 限定：そのターンの最初のアタックのときのみ発火（GameState.attacksThisTurn === 1。triggered.conditionの同名軸と同じ判定。BS06神鳴る霊峰Lv2）
              | { targetMaxBp: number } // event: "ownLifeDamaged" 限定：ライフを減らしたスピリット（targetInstanceId＝アタッカー）の実効BPがこれ以下のときのみ発火（BS08竜騎集う円卓：BP5000以下のアタックで自分のライフが減らされたとき）
              | { targetKeywordExclude: Keyword } // event: "ownLifeDamaged" 限定：ライフを減らしたスピリットがそのキーワードを持つときは発火しない（spiritHasKeyword判定＝一時付与も見る。BS08デストラクションバリア：【転召】を持たない相手のスピリットのアタック）
          repeatPerCount?: boolean // event: "ownFunsaiMilled" | "opponentHandAdded" 用：実カウント数ぶんアクションを繰り返す（省略時/falseは1回のみ。修理屋バラン・バラン／犬人マードック）
          countMode?: "cores" // event: "ownSpiritCoresRemovedByOpponent" 限定：repeatPerCountの繰り返し回数を「影響を受けたスピリット数」でなく「取り除かれたコア数」にする（省略時は従来どおりスピリット数。既存の極光の大地はこの指定が無いため挙動は変わらない。BS06希望の大灯台Lv1）
          minEventCount?: number // eventCount がこの値以上のときのみ発火（「一度に◯枚以上破棄したとき」。BS04アリゲイド＝5枚以上）
          magicCostEquals?: number // event: "opponentMagicUsed" 限定：使用されたマジックのコストがこれと一致するときのみ発火（BS04氷の女神フリッグ）
          magicTiming?: "main" | "flash" // event: "opponentMagicUsed" 限定：使用タイミングが一致するときのみ発火
          familyFilter?: FamilyFilter // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "ownSpiritExhausted" | "anySpiritExhausted" 限定：破壊/召喚/疲労したスピリットの系統がこれを含むときのみ発火（配列＝いずれかの系統でOR。英雄の喪失／BS04七龍帝の玉座・鋼葉の樹林）
          // ※ 破壊/召喚は eventInfo.families（**カード静的な系統**）で判定する。疲労イベントは families を渡さないため、
          //    selfOverride のインスタンスに対して matchesFamilyFilter で**継続付与された系統も含めて**判定する
          //    （BS02生み出される尖兵：自身のLv1が与える「武装」を Lv2 が見る）
          keywordFilter?: Keyword // event: "ownSpiritSummoned" 限定：召喚されたスピリットがこのキーワードエントリを静的に持つときのみ発火（hasKeywordで判定。BS05最古龍の顎：転召持ちが召喚されたとき）。
          // event: "anySpiritAttacked" | "ownSpiritDealtLife" 限定：イベント対象（selfOverride）が該当キーワードを持つときのみ発火（静的・一時付与・継続付与すべて考慮。spiritHasKeywordで判定。BS06冥騎士アンドラー／冥府の深淵／ベルゼビート＝【呪撃】）
          costFilter?: { max?: number; min?: number } // event: "ownSpiritDestroyed" | "anySpiritAttacked" | "ownSpiritExhausted" | "anySpiritExhausted" 限定：破壊/消滅したスピリット、アタックしたスピリット、疲労したスピリットのコストがmax以下/min以上のときのみ発火（BS05天使クレイオ：コスト2／BS04鎧装獣ヘイズ・ルーン：コスト1以下／BS05藍紫の虚空：コスト1以下）
          maxBp?: number // event: "anySpiritAttacked" 限定：アタックしたスピリット（selfOverride）の実効BPがこれ以下のときのみ発火（BS08ダークスカルデーモン：BP6000以下）
          eventTargetIsSelf?: true // event: "ownSpiritExhausted" | "anySpiritExhausted" 限定：イベント対象が発生源自身のときのみ発火（「**このスピリット**が疲労したとき」。BS02スクルディア）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。**この場合 levels は必ず null にする**（仮想発生源は Lv0 のため。BS05ソウルクラッシュ）
          nameIncludes?: string[] // イベント対象のカード名がいずれかの文字列を含むときのみ発火。event: "ownTensho" 限定では eventInfo.names（【転召】の犠牲になったスピリットのカード名）で判定し、それ以外はselfOverrideのインスタンス（cardNameContainsで判定＝「〜として扱う」付与名も見る）。BS05ペンタン帝国Lv2：「ペンタン」/「アンプルール」／BS08魔界七将アスモディオス：[魔界七将デストロード]/[魔界七将ベルゼビート]で【転召】したとき
          targetSameLevelAsSelf?: true // targetInstanceId のスピリットのLvが、イベント対象（selfOverride）のLvと同じときのみ発火（BS05ペンタン帝国Lv2：同じLvの相手にブロックされたとき）
          ownOnly?: true // event: "anySpiritAttacked" 限定：発生源の持ち主のスピリットがアタックしたときのみ発火（selfOverride.pid === 発生源の持ち主。BS06冥騎士アンドラー／冥府の深淵）
          excludeSelfAsEventTarget?: true // イベント対象（selfOverride）が発生源自身（inst）のときは発火しない（「[カード名]以外の」の除外。BS06鉄拳のカクタスガルー：自分自身がライフを減らしても回復しない）
          optional?: true // 「〜できる」＝任意。interactiveTargets では発動確認を出す（triggered/step/battleWonのoptionalと同じ扱い。BS08聖なる柱状彫刻Lv2：自分のライフが減らされたとき、〜召喚できる）
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
          blockerMaxBp?: number // 指定時は実効BPがこれ以下の合法ブロッカーがいるときのみ強制ブロックする（BS05ワーニングアタック：BP3000以下）
          firstAttackOnly?: boolean // trueならそのターンの最初のアタックのみ（燃えさかる戦場Lv2）
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのとき（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "summonedExhaustGrant" // 発生源が場にありレベル有効の間、発生源の持ち主から見た**相手**のスピリットは、召喚されたとき疲労する。判定・発火はGameEngine.doSummonの召喚時効果解決の後（BS06天使長ファニム）
          levels: number[] | null
          condition?: { selfRested: true } // 指定時、発生源自身が疲労状態のときのみ有効（ファニムLv2-3＝「このスピリットが疲労状態の間」）
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
          nameContains?: string // 対象カードのカード名にこの文字列を含むもののみ（手札のカードが対象なので静的な名前だけを見る。BS07女帝ペンプレスLv2-3＝「ペンタン」）
          cardTypeFilter?: CardType // 対象カードの種別（BS07女帝ペンプレスLv2-3＝スピリットカードのみ。加算側の cardType と同義だが、両枝を混同させないため別名にしてある）
      }
    | {
          id: string
          kind: "activated"
          timing: "flashBattle" | "flash" // 発動可能タイミング。flashBattle＝フラッシュ中のバトルのみ／flash＝フラッシュで使えるタイミング全般（バトル外も含む。BS08機人フィアラル）
          levels: number[] | null
          // 発動コスト。reserveToTrash=リザーブからトラッシュへ置くコア数／
          // exhaustSelf=このスピリット自身を疲労させる（既に疲労していれば発動不可。BS07桜の妖精オウカ）
          cost: { reserveToTrash: number } | { exhaustSelf: true }
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
          kind: "tenshoSelfCostBonus" // 持ち主が【転召】を持つスピリットカードを召喚するとき、**このスピリット自身**のコストを+amount として扱う。
          // 【転召】は「コストN以上の自分のスピリット1体」を生贄に要求するため、これがあると本来コストの足りない自身も生贄に選べる。
          // 効くのは転召の生贄判定（dumpAllCoresTensho の候補列挙）だけで、召喚コストや instAllCosts 一般には影響しない（局所的な簡略化）。BS08冥機グングニル
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "coreReturnBonus" // 発生源が場にありレベル有効の間、**お互いの**スピリットから効果でリザーブへ置かれるコアの数を+amountする
          // （coreBonus の逆向き。removeCores＝リザーブ行きの経路だけが見る。トラッシュ／ボイド行きには効かない。BS02チャウーLv2）
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
          colorFilter?: Color // scope:"ownAll" 用：この色を持つスピリットのみ対象（instHasColorで判定。BS06夢中漂う桃幻郷Lv2＝黄）
          keywordFilter?: Keyword // scope:"ownAll" 用：このキーワードエントリを静的に持つカードのみ対象（vanillaFilterと同列。tempKeywords等の一時付与は見ない。果て無き地平線）
          minBp?: number // scope:"ownAll" 用：対象スピリットの実効BPがこれ以上のときのみ（BS04強者統べる大地＝BP6000以上）
          familyFilter?: FamilyFilter // scope:"ownAll" 用：指定系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ対象（BS05氷の魔女ヘル）。発生源自身は呼び出し側のループが除外済み（「[カード名]以外」の簡略化）
          minFamilies?: number // scope:"ownAll" 用：対象スピリットのカード静的な family 配列の要素数がこれ以上のときのみ対象（BS03エスケープルート：系統2つ以上）
          requireOwnFieldHasName?: string // 持ち主のフィールド（スピリット）にこのカード名を持つ個体が1体以上いるときのみ有効（BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
          when: {
              byOpponentEffect?: boolean // 相手の効果による破壊のみ（context.sourcePidが相手のとき）
              byBattleVsArmorColor?: boolean // 装甲で指定した色の相手とのBP比較による破壊のみ
              byBattle?: boolean // BP比較による破壊のみ（context.battleがあるとき）
              byBattleKillerLevel?: number // BP比較による破壊で、破壊した側（勝者）のcurrentLevel（context.battle.attackerLevel）がこの値のときのみ
              byBattleKillerMaxBp?: number // BP比較による破壊で、破壊した側（勝者）の実効BP（context.battle.attackerBp）がこの値以下のときのみ（BS08勝者のグリーンフィールドLv2＝BP7000以下）
          }
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 発動できるステップ条件（発生源の持ち主基準。"both"=どちらのターンでも）
          revived: { rested: boolean } | { toHand: true } // 戻るときの状態（false=回復状態、true=疲労状態）／toHand=場に留まらず持ち主の手札に戻る（コアはリザーブへ、カードは手札へ。トラッシュは経由しない）
          cost?: {
              keepOneCoreRestToTrash?: boolean // 自身のコアを1個だけ残し、残りを持ち主のトラッシュへ
              oneCoreToVoid?: boolean // 対象のコア1個をボイドへ（コア1個の個体は支払い不可＝不発）
              reserveOneToTrash?: boolean // 持ち主のリザーブのコア1個を持ち主のトラッシュへ（リザーブ0なら支払い不可＝不発。果て無き地平線）
              fieldOrReserveOneToTrash?: boolean // 持ち主のリザーブのコア1個（無ければ自分のフィールド＝スピリット/ネクサス、発生源自身を除く、からコア1個）を持ち主のトラッシュへ（どちらも無ければ支払い不可＝不発。BS04宝石虫スカラベール）
              handDiscardOne?: boolean // 持ち主の手札1枚（末尾＝決定的簡略化）をトラッシュへ。手札0枚なら支払い不可＝不発（BS06暴かれた墓石Lv2）
              millSelfOneMatching?: { color: Color; cardType: CardType } // 自分のデッキを上から1枚破棄し、そのカードが指定の色・種別に一致したときだけ成立（一致しなければ支払い不可＝不発。デッキが空でも不発。BS07冥勇士デスカラビア＝紫のスピリットカード）
              exhaustOwnFamilyOne?: FamilyFilter // 持ち主のフィールドの、この系統（配列＝OR）を持つ回復状態のスピリット1体（実効BP最小＝犠牲を最小化する簡略化。破壊される個体自身は除く）を疲労させる。該当なしなら支払い不可＝不発（BS07パオ・ペイール＝「想獣」）
              ownLifeOneToVoid?: boolean // 持ち主のライフのコア1個をボイドへ（リザーブへは戻らない）。ライフ0枚なら支払い不可＝不発。支払った結果ライフが0になった場合はそのまま勝敗が決まる（BS08太陽石の神殿）
          }
          fireDestroyTriggerFirst?: true // 指定時、場に留める前に『このスピリットの破壊時』効果を先に発揮させる
          // （既定は復活が成立すると破壊時効果は発揮されない。「破壊時効果を発揮した自分のスピリットは手札に戻る」の忠実化。BS07ブラックリチュアル）
          oncePerTurn?: boolean // 発生源1つにつきターン1回だけ（CardInstance.reviveOnDestroyUsedTurnで管理。同じ考え方はkind:"magicNegate"のoncePerTurnと同型。BS06暴かれた墓石Lv2）
          condition?: { opponentFieldSymbolColorsAtMost: number } // 発生源の持ち主から見た相手フィールドのシンボル色数（重複除く）がこの値以下のときのみ有効（shared/cost.ownFieldSymbolColorsで判定。BS06夢中漂う桃幻郷Lv2＝1色以下）
      }
    | {
          id: string
          kind: "keywordGrant" // 発生源が場にありレベル有効の間、持ち主の familyFilter 一致スピリットすべてにキーワードを継続付与する（暴双龍ディラノス）
          levels: number[] | null
          keyword: Keyword
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ（BS06冥府の深淵：冥主/無魔）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。familyFilterとはAND条件。BS03バッチ）
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定）を持つスピリットのみ（BS05黄道の虚空Lv2：転召持ちに光芒を付与）
          colors?: Color[] // keyword:"armor"用：付与する装甲の対象色。EffectModules.refreshLevelAsOverridesがCardInstance.armorColorsGrantedへ毎回再計算して反映し、
          // hasArmorAgainstがそれを見る（既存のtempKeywords装甲colorsと同じ判定経路。BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白を付与）
          costFilter?: { max?: number; min?: number } // 指定時は対象スピリットのコストがmax以下/min以上のみ（matchesCostFilterで判定。BS04侵されざる聖域：コスト8以上）
          phase?: Phase // 指定時はこのステップの間のみ有効（turnPlayerを問わない＝『お互いの〜ステップ』）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『自分のアタックステップ』を表す（BS07龍星皇メテオヴルムLv2-3）
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ（aura.vanillaFilterと同型。BS05サーキュラーソー・アーム）
          count?: number // keyword:"kyoshu"/"bofu" 等、数値を伴うキーワード用の指定数（省略時1）。EffectModules.continuousKeywordGrantCountが読み、
          // refreshSelfByExhaustNexusHandler が静的keywordのcountとのmax値をターン上限にする（BS08キマイラアサルト：付与する【強襲】はcount:1）
      }
    | {
          id: string
          kind: "familyGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに系統を継続付与する（ポム／生み出される尖兵）
          levels: number[] | null
          target: "ownAll"
          family?: string // 付与する系統（familyFromChoice 指定時は不要）
          familyFromChoice?: true // family の代わりに、発生源インスタンスの lentChoiceFamily（貸与時にプレイヤーが選んだ系統）を付与する（音鳥クルーク）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ（**カード静的な family のみで判定する**＝付与系統は見ない。付与された系統を見ると spiritHasFamily が自己再帰する。音鳥クルーク＝歌鳥／BS06無限なる軌道母艦＝機人/動器）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（音鳥クルーク）
          colorFilter?: Color // 指定時は対象スピリットの色がこれと一致するときのみ
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『自分のアタックステップ』を表す（BS07重刀竜ブレイガザウラーLv2-3）
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
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS07リボーンフレイム）
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』。BS06賢獣アイベリックス＝アタックステップ）
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
          against: "magic" | "bounce" // magic=相手のマジックの効果を受けない（ポークン等）／bounce=相手の効果によるバウンス（returnToHand/returnAllToHand）を受けない。自分自身の効果によるバウンスは対象外（BS06恐竜姫ジュラ）
          condition?: { ownCostCountAtLeast: { cost: number; count: number } } // 発生源の持ち主のフィールドに指定コストのスピリットがcount体以上のときのみ有効（BS05リトルナイト・ランスロット：コスト2が3体以上）
      }
    | {
          id: string
          kind: "levelAs" // 継続的な「Lv◯として扱う」置換（EffectModules.refreshLevelAsOverridesが毎回再計算する。ナイフ投げのジャグリーン／トパーズの流星）
          levels: null
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsByKeyword" | "ownSpiritsByFamily" | "ownSpiritsVanilla" | "opponentSpiritsAll" | "allSpiritsByChosenColor" // ownSpiritsByKeyword=keywordFilterのキーワードエントリを静的に持つ持ち主のスピリットすべて（レベル不問。斬竜刀のガイ／崩壊する戦線）／ownSpiritsByFamily=familyFilterの系統（配列＝OR。matchesFamilyFilterで判定）を持つ持ち主のスピリットすべて（BS06マッスルチャージ：闘神）／ownSpiritsVanilla=カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）／opponentNexusesAll=発生源の持ち主の相手の全ネクサス（ウッド・ゴレム）／opponentSpiritsAll=発生源の持ち主の相手の全スピリット（BS03フォーカード／BS04ジャッジメントライツ）／allSpiritsByChosenColor=両陣営の、貸与時に選ばれた色（CardInstance.lentChoiceColor）を持つスピリットすべて（BS02-111スピリットイリュージョン）
          treatAs: number | "max" | "coresScaled" // 扱うレベル。"max"=対象カード自身が持つ最高Lv（card.levelsのlevel最大値。対象ごとに算出）／"coresScaled"=対象のコア数で換算（1個→Lv1、2個→Lv2、3個以上→"max"と同じ。サファイアの城壁）
          keywordFilter?: Keyword // target: "ownSpiritsByKeyword" 用
          familyFilter?: FamilyFilter // target: "ownSpiritsByFamily" 用（BS06マッスルチャージ：闘神）
          summonedThisTurnOnly?: true // target: "ownSpiritsVanilla" 用：対象の summonedTurn が現在のターンのときのみ（「召喚されたターンの間」。BS04心臓破りの巨大坂Lv2）
          phase?: Phase // 指定時、state.phaseが一致するときのみ有効
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（BS06マンティゴア：opponent＝『相手のアタックステップ』）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS03フォーカード／BS04ジャッジメントライツ／BS02-111）
          condition?:
              | { maxOwnSpirits: number } // 自分のフィールドのスピリット数がこの値以下の間有効（発生源自身を含む）
              | { anyFieldHasColorSpirit: Color } // 自分か相手のどちらかのフィールドに指定色のスピリットがいる間有効（斬竜刀のガイ）
              | { ownFieldHasFamily: string } // 発生源の持ち主のフィールドに指定系統を持つスピリットがいる間有効（BS04鼠人チューリヒ＝戦獣）
              | { ownSpiritCountBelowOpponent: true } // 発生源の持ち主のフィールドのスピリット数が相手より少ない間有効（BS08ダークチュンポポLv2）
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
          kind: "symbolFix" // 発生源が場にありレベル有効の間、持ち主の対象スピリット（familyFilter一致）のシンボルを、
          // そのスピリットが元々持つシンボルの1色目でcount個に固定する（複数色シンボルは先頭の色を採用する簡略化）。
          // 継続（EffectModules.refreshLevelAsOverridesが毎回再計算しCardInstance.symbolsOverrideContinuousへ反映）。
          // instanceSymbolCount / countSymbols の両方がこれを見るため、軽減計算（コスト）にも効く。BS08海底に眠りし古代都市
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter
          count: number
      }
    | {
          id: string
          kind: "magicBuffBonus" // マジックによるBPバフに追加でBP+する（対象・アタックステップ限定。騎獣スレイプホース）
          levels: number[] | null
          target: "self" | "ownOthers" | "ownAll" // self=発生源自身が対象になったとき / ownOthers=発生源以外の持ち主の緑スピリットが対象になったとき / ownAll=対象になった持ち主のスピリットすべて（色不問。BS06混迷する魔法実験場）
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
          granted: {
              trigger: TriggerEvent
              action: EffectAction
              // 付与された誘発の発火条件。fireTrigger が渡す targetInstanceId（onBlock ならアタッカー、
              // onBlocked ならブロッカー）を見る。triggered.condition の同名軸と同じ判定
              condition?: { targetMaxCost: number } // BS07ライフセービング＝相手のコスト3以下をブロックしたとき
          } // 付与される誘発効果（levelsは常に有効扱い）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS03ブリッツ）
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
          kind: "nameAsGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットを「カード名に指定文字列が入っているもの」として扱う（BS02アルカナプリンス・オベロLv2＝コスト2の自分のスピリットはすべて「アルカナ」入り扱い）
          levels: number[] | null
          target: "ownAll"
          nameIncludes: string // 扱わせるカード名の部分文字列
          costFilter?: number // 対象のコストがこれと一致するスピリットのみ（instMatchesCostFilterで判定＝付与コストも考慮）
          colorFilter?: Color // 対象がこの色を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効（BS03パペットストリング）
      }
    | {
          id: string
          kind: "vanillaAsGrant" // 発生源が場にありレベル有効の間、対象スピリットを「カードに効果の記述を持たないスピリット（バニラ）としても扱う」
          // （instIsVanilla が CardInstance.treatedAsVanillaContinuous を見る。BS04スイッチヒッターLv—＝系統「造兵」）
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ
          colorFilter?: Color // 指定時は対象がこの色を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "spiritEffectsDisabledGrant" // 発生源が場にありレベル有効の間、対象スピリットが**持つ効果すべてを発揮させない**
          // （CardInstance.effectsDisabledContinuous。refreshLevelAsOverrides が毎回再構築し、
          //  shared/rules の effectSources・activeConstraints・spiritHasKeyword と EffectModules.fireTrigger の
          //  4か所が読む＝オーラ／制約／キーワード／誘発のいずれも止まる。BS07ルナースラッシュ）。
          // vanillaAsGrant は「バニラとして**扱う**」＝対象判定用の述語を変えるだけで発揮は止めないので、別物として持つ
          levels: number[] | null
          target: "ownAll" | "opponentAll" // ownAll=発生源の持ち主のスピリットすべて／opponentAll=持ち主から見た相手のスピリットすべて（BS07ルナースラッシュ）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ
          keywordExclude?: Keyword // 指定時はこのキーワードを**静的に持たない**スピリットのみ（BS07ルナースラッシュ＝【転召】を持たない相手）。
          // 一時付与・継続付与を見ないのは、spiritHasKeyword が effectsDisabledContinuous を見るため自己参照になるから
          blockingOnly?: true // 指定時は現在のバトルのブロッカー（board.battle.blockerInstanceId）のみ（BS07ルナースラッシュ＝自分のスピリットをブロックした相手）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "nexusEffectsDisabled" // 発生源が場にありレベル有効の間、**相手の**ネクサスすべての効果を発揮させない
          // （shared/rules.effectSources が対象プレイヤーのネクサスを発生源の一覧から丸ごと外す。BS05ネクサスブロケイド）
          levels: number[] | null
          target: "opponentAll"
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "destroyedCoresToTrash" // 発生源が場にありレベル有効の間、スピリットが破壊/消滅したとき、その上のコアを持ち主のリザーブでなくトラッシュへ置く（BS01古龍の縄張りLv1）
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "exhaustOnManualCoreAdd" // 持ち主から見て相手がスピリット/ネクサス/マジックの効果以外（moveCore/awaken）でスピリットのコアを
          // 増やしたとき、そのスピリットを疲労させる（持ち主の相手のメインステップ限定。夢魔の寝所）
          levels: number[] | null
          trigger?: "manual" | "effect" // 省略時="manual"（従来通り。moveCore/awakenのみ、持ち主の相手のメインステップ限定）。
          // "effect"指定時はスピリット/ネクサス/マジックの効果によるコア増加時に判定し、フェーズ不問（BS05アブソーブシンボル。lendSelfThisTurnで貸与）
          onRemove?: boolean // trueならコア減少時にも同様に疲労させる（アブソーブシンボルは増加・減少どちら／BS01ルビーの太陽Lv2も「置く、または取り除く」）
          colorFilter?: Color // 指定時、対象スピリットがこの色を持つときのみ疲労させる（BS01ルビーの太陽Lv2＝白のスピリット）
          scope?: "opponent" | "any" // 省略時="opponent"（従来通り、発生源の持ち主から見た相手のスピリットのみ）。"any"指定時は自分のスピリットも対象（BS01ルビーの太陽Lv2＝「白のスピリット」に陣営の指定が無い）
          anyPhase?: true // 指定時、trigger:"manual" でもメインステップ限定を外す（BS01ルビーの太陽Lv2＝ステップの指定が無い）
      }
    | {
          id: string
          kind: "constraintGrant" // 発生源が場にありレベル有効の間、持ち主フィールドの対象（ownAll、minLevel条件）に
          // 制約を継続付与する（夢魔の寝所Lv2：自分のLv3スピリットに指定アタックを許す）
          levels: number[] | null
          target: "ownAll"
          minLevel?: number // 対象のcurrentLevelがこれ以上のときのみ付与
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ（BS06計画された場外乱闘：闘神）
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定）を持つスピリットのみ（BS05シンクロニシティ：覚醒持ちに指定アタックを付与）
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ（reviveOnDestroy.vanillaFilterと同型。BS05ポテンシャルパワー）
          minSymbols?: number // 指定時はシンボル数がこれ以上のスピリットのみ（instanceSymbolCountで判定＝ダブルハートの追加シンボルも見る。BS05最古龍の顎Lv2：シンボル2つ以上）
          nameIncludes?: string[] // 指定時はカード名にいずれかの文字列を含むスピリットのみ（cardNameContainsで判定＝「〜として扱う」付与名も見る。BS05天焦がす大聖火Lv2：「巨人」）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は発生源の持ち主基準でこのステップ・turn条件のときのみ有効
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "funsaiBonus" // 持ち主のスピリットの【粉砕】の破棄枚数を+amountする（崩壊する戦線Lv1-2）
          levels: number[] | null
          amount?: number // 固定加算値（従来通り。amountPerSymbolColor指定時は無視される）
          amountPerSymbolColor?: Color // 指定時はamountの代わりに、持ち主のフィールド（スピリット+ネクサス）が持つこの色のシンボル総数（countSymbols）を加算する（毎回動的に再計算。BS08神造巨兵オリハルコン・ゴレム：自分の青のシンボル1つにつき+1枚）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS06デモリッシュ）
      }
    | {
          id: string
          kind: "millCapBonus" // 持ち主のスピリットの効果によるデッキ破棄枚数の上限（millPer.cap／【粉砕】の破棄枚数そのものではなく「◯枚まで」の上限値）を+amountする（BS06マキシマムブレイク）
          levels: number[] | null
          amount: number
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS06マキシマムブレイク：メインでlendSelfThisTurnして貸す）
      }
    | {
          id: string
          kind: "bofuCountBonus" // 発生源が場にありレベル有効の間、持ち主のスピリットが持つ【暴風】の指定数（静的keywordのcount）に+amountする。
          // 暴風を持たない（base=0）スピリットには加算しない。funsaiBonusの暴風版（GameEngine.bofuCountFor/EffectModules.bofuCountBonusForが集計）。BS08ゲラン准将Lv2
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
          kind: "flashLockWhileAttackingFamily" // 発生源が場にある間、その持ち主の familyFilter 一致スピリットがアタックしている間だけ、相手はフラッシュで手札のカードを使用できない（既存の action "lockFlash" が「このバトルの間」なのに対し、こちらは発生源が居る間ずっと効く継続効果。マジックは lendSelfThisTurn で1ターン貸す。BS07ウィリアンスラッシュ）
          levels: number[] | null
          familyFilter: FamilyFilter
      }
    | {
          id: string
          kind: "bofuOnBlock" // 発生源が場にありレベル有効の間、持ち主のスピリットの【暴風】を
          // 『このスピリットのアタック時（ブロックされたとき）』ではなく『このスピリットのブロック時』に発揮させる
          // （kyoshuOnBlock と同型。GameEngine のブロック解決が hasBofuOnBlock で判定する。BS07大風車の丘Lv2）
          levels: number[] | null
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（『相手のアタックステップ』＝opponent）
      }
    | {
          id: string
          kind: "bofuChooserSelf" // 発生源が場にありレベル有効の間、持ち主のスピリットの【暴風】で
          // 疲労させる相手のスピリットを**持ち主自身が選ぶ**（既定は疲労させられる側が選ぶ＝chooserIsTarget）。
          // exhaust ハンドラが hasBofuChooserSelf を見て chooserIsTarget を無効化する（BS07ワールウィンド）
          levels: number[] | null
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "kyoshuOnBlock" // 持ち主のスピリットの【強襲】を『このスピリットのブロック時』にも発揮させる（funsaiOnBlock の兄弟。BS07蹴撃の戦場跡Lv2）
          levels: number[] | null
          phase?: Phase // 指定時はこのステップでのみ有効（蹴撃の戦場跡Lv2＝相手のアタックステップ）
      }
    | {
          id: string
          kind: "koboOnBlock" // 持ち主のスピリットの【光芒】を『このスピリットのブロック時』にも発揮させる
          // （funsaiOnBlock の光芒版。「**にも**」なのでアタック時の発揮はそのまま残る。BS03星降る巡礼地Lv2）
          levels: number[] | null
      }
    | {
          id: string
          kind: "blockTriggersAsAttackGrant" // 発生源が場にありレベル有効の間、対象スピリットの
          // 『このスピリットのブロック時』効果を『このスピリットのアタック時』に発揮させる
          // （**ブロック時には発揮しなくなる＝移し替え**。attackTriggersAsBlockGrant の逆向き。
          // fireTrigger が hasBlockTriggersAsAttack 経由で参照する。BS07大械獣ギガ・テリウムLv1-2）
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // **発生源の持ち主**基準でこのステップ・turn条件のときのみ有効
      }
    | {
          id: string
          kind: "lifeDamageMillGuard" // 発生源が場にありレベル有効の間、持ち主のライフが相手のアタックで減るとき、
          // 持ち主のデッキを上から1枚破棄し、そのカードが match（色・種別）に一致していればライフが減らない。
          // 「〜できる」は自動適用の簡略化（GameEngine のライフダメージ処理が判定する。BS07六花の司書長サーガ）
          levels: number[] | null
          match: { color: Color; cardType: CardType } // 破棄したカードがこれに一致したときだけライフを守る
          keepToHandIfType?: CardType // 指定時、破棄したカードがこの種別なら（守れたかに関わらず）トラッシュではなく手札に加える（サーガLv2-3）
      }
    | {
          id: string
          kind: "attackTriggersAsBlockGrant" // 発生源が場にありレベル有効の間、対象スピリットの
          // 『このスピリットのアタック時』効果を『このスピリットのブロック時』に発揮させる
          // （**アタック時には発揮しなくなる＝移し替え**。CardInstance.attackTriggersAsBlockThisTurn の継続版。
          // fireTrigger が hasAttackTriggersAsBlock 経由で参照する。BS04ドラグノ近衛兵Lv1-2）
          levels: number[] | null
          target: "anyAll" | "ownAll" // anyAll=両陣営のスピリット（効果文が修飾なしの「スピリット」の場合。ドラグノ近衛兵）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ
          keywordFilter?: Keyword // 指定時はこのキーワード（spiritHasKeywordで判定）を持つスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // **発生源の持ち主**基準でこのステップ・turn条件のときのみ有効
      }
    | {
          id: string
          kind: "magicRestriction" // フィールドの発生源からマジックの使用に制約をかける
          levels: number[] | null
          restriction:
              | "oncePerTurnAll" // お互い、ターンに1回しかマジックの効果を使用できない（作戦参謀フォクシン）
              | "noReductionOpponent" // 発生源の持ち主の相手は、マジック使用時に軽減シンボルによるコスト軽減ができない（イワトビペンタン）
              | "colorLockOpponent" // 発生源の持ち主の相手は、自分（=使用者）のフィールドのシンボルと同じ色を含まないマジックカードを使用できない（力奪う凱旋門）
              | "reserveOnlyOpponent" // 発生源の持ち主の相手は、マジックのコストをすべてリザーブから支払わなければならない（フィールドのコアを支払い元にできない。BS02螺旋の塔Lv2）
              | "noFreeCastOpponent" // 発生源の持ち主の相手は、マジックの無償化（kind:"magicFreeGrant"）を適用できない（力奪う凱旋門Lv2）
              | "costLimitAll" // お互い、maxCost以下のコストのマジックの効果を使用できない（BS05青嵐の虚空Lv2。判定は shared/cost.hasMagicCostLock）
              | "noFlashAll" // お互い、マジックカードのフラッシュ効果を使用できない（BS06軍師ショウジョウジ）
              | "noFlashOpponent" // 発生源の持ち主の相手は、マジックカードのフラッシュ効果を使用できない（BS06鎖縛の武舞台Lv2）
          maxCost?: number // restriction:"costLimitAll" 専用：カード記載のコスト（軽減前）がこの値以下のマジックを使用できなくする
          requireOwnKeyword?: Keyword // 指定時、発生源の持ち主のフィールドにこのキーワードを持つスピリットがいる間のみ有効（BS05青嵐の虚空Lv2＝【転召】）
          phase?: Phase // 指定時はこのステップ中のみ有効（BS05青嵐の虚空Lv2＝『お互いのアタックステップ』）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "magicFreeGrant" // 発生源の持ち主は、指定色のマジックカードをコストを支払わずに使用できる（「できる」は自動適用で簡略化。薔薇人バロッサ）
          levels: number[] | null
          colorFilter?: Color // scope省略時にこの色のマジックのみ無償化（scope指定時は色不問なので省略する）
          scope?: "allMagicHandAndTegamoto" // 色を問わず、持ち主の手札/手元(tegamoto)のマジックカードすべてを無償化（大天使ミカファールLv2。手札からの使用にも適用される＝effectiveCostはfromTegamoto不問で判定）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          condition?: "selfInBattle" // 指定時、発生源自身が現在のバトルの当事者（アタッカー/ブロッカー）であるときのみ有効（『このスピリットのバトル時』。BS07大天使イスフィール）
          oncePerBattle?: true // 指定時、この発生源が無償化できるのは1バトルにつきマジック1枚だけ（BattleState.oncePerBattleMagicFreeUsed で消費を記録。BS07大天使イスフィール＝「マジックカード1枚を」。省略時は枚数無制限＝BS02ミカファール/BS03バロッサの「すべて」）
      }
    | {
          id: string
          kind: "magicRepeatGrant" // 発生源が場にありレベル有効の間、持ち主が使用したマジックの効果を、解決後にもう1度だけ発揮する
          // （resolveMagicEffects が効果の並びを2周する。2周目の途中で選択待ちになった場合はそこで打ち切る。BS07大天使イスフィール）
          levels: number[] | null
          condition?: "selfInBattle" // magicFreeGrant と同じ（『このスピリットのバトル時』）
          oncePerBattle?: true // 指定時、この発生源が再発揮させるのは1バトルにつきマジック1枚だけ（BattleState.oncePerBattleMagicRepeatUsed で消費を記録。BS07大天使イスフィール＝「1枚を…もう1度だけ」）
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
    unblockableOnceThisTurn?: boolean // 「ターンに1回、相手のスピリットにブロックされない」印。canBlock が参照し、次のバトル終了時（clearBattle）に消える。ターン終了でもリセットする（BS04強者統べる大地Lv2）
    countAsThisTurn?: { pid: PlayerId; count: number } // このターンの間、pid の効果が「スピリットの数を数える」ときこの個体を count 体分として数える（ターン終了でリセット。BS05スリーカード）
    magicNegateUsedTurn?: number // kind:"magicNegate" の oncePerTurn 用。この個体が最後にマジックを無効にしたターン番号（state.turn と一致する間は再使用できない。BS02鏡の回廊Lv2）
    reviveOnDestroyUsedTurn?: number // kind:"reviveOnDestroy" の oncePerTurn 用。この発生源が最後に復活を成立させたターン番号（magicNegateUsedTurnと同型。BS06暴かれた墓石Lv2）
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
    namesAsContinuous?: string[] // 継続的な「カード名に〜が入っているものとして扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（BS02アルカナプリンス・オベロ／BS03アルカナプリンセス・アン）
    colorsAsContinuous?: Color[] // 継続的な「〜の色としても扱う」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（百面相のフラットフェイス／妖精ティングリー）
    symbolsOverrideContinuous?: Color[] // 継続的な「シンボルを◯個に固定する」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（kind:"symbolFix"）。instanceSymbolCount / countSymbols が、カード静的なsymbolの代わりにこちらを見る（BS08海底に眠りし古代都市）
    alsoCostsContinuous?: number[] // 継続付与された「このコストとしても扱う」値（kind:"alsoCostGrant"。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、instHasCost / instMatchesCostFilter が参照する。道化師クラン）
    lentChoiceFamily?: string // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ系統。仮想発生源にのみ載り、kind:"familyGrant" の familyFromChoice が読む（音鳥クルーク）
    lentChoiceColor?: Color // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ色。仮想発生源にのみ載り、kind:"levelAs" の target:"allSpiritsByChosenColor" が読む（BS02-111スピリットイリュージョン）
    kyoshuUsed?: { turn: number; count: number } // 【強襲】をこのターン何回使ったか（turnがstate.turnと一致する間だけ有効。BS07）
    tempExtraSymbols?: number // このターンの間の追加シンボル数（ターン終了でリセット。ダブルハート）
    blockTriggersAsAttackThisTurn?: boolean // このターンの間、『このスピリットのブロック時』効果を『アタック時』に発揮する
    // （ブロック時には発揮しない。ターン終了でリセット。fireTriggerが参照。GameState の同名フラグは両陣営全体版で、こちらは個体単位。BS07マクラーンスラッシュ）
    attackTriggersAsBlockThisTurn?: boolean // このターンの間、『このスピリットのアタック時』効果を『ブロック時』に発揮する（アタック時には発揮しない。ターン終了でリセット。fireTriggerが参照。BS05ブレイブチャージ）
    armorColorsGranted?: Color[] // 継続付与された装甲の対象色（kind:"keywordGrant"のkeyword:"armor"。
    // EffectModules.refreshLevelAsOverridesが毎回全消去→再構築する。hasArmorAgainstが参照する（BS05白夜の虚空Lv2）
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
    noRefreshTargetInstanceId?: string // このスピリットが「回復できない」と指定した**相手**スピリットのinstanceId（action:"markNoRefreshTarget"）。
    // このスピリット自身が疲労状態でフィールドにいる間だけ効く（EffectModules.isRefreshBlockedByMark が判定。スクルディア）。
    // 疲労し直すたびに上書きされる。指定先が場を離れても残るが、instanceId が一致しなくなるだけで無害
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
    compareByCores?: boolean // trueの場合、バトル解決時にBPの代わりに置かれているコアの数を比較する（BS06イマジンフィールド）
    usedMagicCardIds?: { p1: string[]; p2: string[] } // このバトル中に使用されたマジックのcardId（光芒用）
    // oncePerBattle 指定の magicFreeGrant / magicRepeatGrant を、このバトルで既に使い切った発生源のinstanceId
    // （BS07大天使イスフィール＝無償で使えるのは「1枚」だけ）。**無償化と再発揮で別リストに分ける**のは
    // 消費点が違うため: 無償化は resolveMagic の冒頭（コスト判定はその手前で済んでいる）、
    // 再発揮は resolveMagicEffects が repeat を確定させる時点。1つのリストにすると、
    // 1枚目の無償化を記録した時点で同じ1枚目の再発揮まで消えてしまう
    oncePerBattleMagicFreeUsed?: string[]
    oncePerBattleMagicRepeatUsed?: string[]
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
    magicNegate?: {
        // マジックの無効化（kind:"magicNegate"）の確認待ち。**これが立っているときは action を解決しない**。
        // 「無効にする」を選べばコストを払ってマジックの効果を捨て、選ばなければ中断していた解決を続ける
        // （doResolveChoice が resolveMagicEffects を呼び直す）。BS02鏡の回廊Lv2／今後の【氷壁】
        casterPid: PlayerId // マジックの使用者
        cardId: string
        timing: "main" | "flash"
        targetInstanceId: string | undefined
        sourceInstanceId: string // 無効化する側の発生源（コストの支払い元）
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
    }
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
    blockTriggersAsAttackThisTurn: boolean // このターンの間、両陣営スピリットすべての『ブロック時』効果を『アタック時』に発揮させる（ターン終了でリセット。fireTriggerが参照。BS01アタックシフト）
    lastDestroyedNexus: { pid: PlayerId; cardId: string } | null // 直近に破壊されたネクサス（destroyNexusが誘発の直前に記録）。reviveLastDestroyedNexus が参照する（BS04戦闘獣ジャッカー）
    lastBattleDestroyedCores: number // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（次のバトル解決の冒頭でリセット。魔界七将デストロード）
    lastBattleDestroyedLevel: number // 直前のバトル解決でBP比較により破壊されたブロッカーのcurrentLevel（次のバトル解決の冒頭でリセット。0=まだ発生していない。魔界伯爵ヴィール）
    revealedCards?: { pid: PlayerId; cardIds: string[] } // 「デッキを上からN枚オープンする」の公開ゾーン（両者に見える一時領域）。
    // deckReveal が積み、手札に加える／デッキの下に戻す処理が終わったら消す。cardZone:"reveal" の選択元になる
    magicRedirectTo?: { pid: PlayerId; instanceId: string } // 解決中のマジックの対象が1体へ絞り込まれている間だけ立つ（kind:"magicTargetRedirect"。この pid のスピリットのうち instanceId 以外は、そのマジックの効果を受けない）。resolveMagic が解決の前後で設定・解除する
    // 「そのマジックの効果の対象を、このスピリットのみに**できる**」の任意性（BS04サンク／BS05スノーホワイト）。
    // 対話モードでは resolveMagic が守る側に1回だけ確認し、その答えをこのマジックの解決中ずっと使う
    // （アクションごとに聞き直さない）。**非対話（テスト・自動解決）ではセットされず、従来どおり自動で絞り込む**
    magicRedirectDecision?: { sourceInstanceId: string; approved: boolean }
    lastBattleDestroyedColors: Color[] // 直前のバトルで「BPを比べ相手のスピリットだけを破壊した」ときの**破壊された側**の色（次のバトル解決の冒頭でリセット。TargetFilter.sameColorAsBattleLoser が参照。BS04獣使いドヴェルグ）
    lastBattleDestroyedFamilies: string[] // 同上の系統（TargetFilter.sameFamilyAsBattleLoser が参照。BS04ニーベルングリング）
    resolvingSummonTriggerPid?: PlayerId // スピリットの『このスピリットの召喚時』効果を解決している間だけ立つ、その発生源の持ち主
    // （fireSummonTrigger が設定し、選択待ちで中断した場合は残して handleAction の事後フックがクリアする。
    // ConstraintDef.immuneToOpponentSummonEffects を isEffectBlocked が判定するために使う。BS05リトルナイト・ランスロットLv3）
    lastBattleDestroyedBp: number // 同上の実効BP（破壊直前に測る。0=まだ発生していない。TargetFilter.sameBpAsBattleLoser が参照。BS03熾烈極める最前線Lv2）
    lastBattleDestroyedCost: number // 同上のコスト（破壊直前のカード記載コスト。0=まだ発生していない。action:"millPerLoserCost" が参照。BS06名誉ある御前試合）
    pendingChoice: PendingChoice | null // 効果解決中のプレイヤー選択（非null中は resolveChoice 以外のアクションを拒否する）
    turnStartResumeStep: number | null // ターン開始処理（start→core→draw→refresh→main）がステップ誘発のpendingChoiceで中断したときの再開ステップ番号。null=中断なし。選択解決後に resumeTurnStart が続きから再開する（百識の谷Lv1のドローステップ破棄選択など）
    interactiveTargets: boolean // trueなら誘発効果の対象選択候補2件以上でpendingChoiceを要求する（既定false。実対戦では server/src/index.ts が true に設定。smokeは既定のfalseのまま自動選択を使う）
    events: GameEvent[] // クライアント演出用の一時イベント列（handleAction冒頭でクリア）
    eventSeq: number // GameEvent.seq の通し番号（クリアしてもリセットしない）
    magicUsedThisTurn: Record<PlayerId, number> // このターンに各プレイヤーがマジックを使用した回数（ターン終了でリセット。magicRestriction:"oncePerTurnAll"用。作戦参謀フォクシン）
    millCountThisTurn: Record<PlayerId, number> // このターンに各プレイヤーが相手の効果でデッキを破棄された累計枚数（ターン終了でリセット。globalConstraint "millCap" の perTurn用。BS04侵されざる聖域Lv2。隠匿情報を含まないがGameViewには含めない＝サーバー内部のみで判定に使う）
    lastFunsai?: { total: number; spirits: number; nexuses: number; magics: number } // 直前の【粉砕】で破棄した内容（resolveFunsaiが記録）。アタック宣言のたびにクリアする（doAttack冒頭）。EffectCounter "lastFunsaiTotal"/"lastFunsaiSpirits"とtriggered.condition {lastFunsaiHasNexus}が参照する（BS03巨人王ランドルフ／BS04二刀流のアムブローズ／BS04伝説巨人ジュード）
    lastMagicCast?: { pid: PlayerId; cardId: string; timing: "main" | "flash"; targetInstanceId?: string } // 直前にプレイヤー自身が手札/手元から使用したマジック（doCastMagic・castMagicFromTrashByColorが記録。action:"magicMirrorRepeat"が参照する。バトル終了時（clearBattle）にクリアされ、それより前の使用は対象にならない。BS08マジックミラー）
}

// このターンの間だけ有効な全体制約の定義（GameState.turnConstraints が参照する宣言的ルール）
export type TurnConstraintDef =
    | { type: "cantActByCost"; maxCost: number } // コストがmaxCost以下のスピリットはすべてアタック/ブロック不可（ヘビィゲート）
    | { type: "noLifeDamageByCostForPid"; maxCost: number; pid: PlayerId } // コストがmaxCost以下のスピリットのアタックでは、この pid のライフだけが減らされない（action:"protectLifeByCostThisTurn" が積む。BS07秘密の花園Lv2）
    | { type: "mustAttackByCost"; pid: PlayerId; maxCost: number } // このターンの間、pidのコストがmaxCost以下のスピリットは可能ならば必ずアタックする（action:"forceAttackThisTurn"のmaxCost版が積む。BS08アンブッシュブロッカー）
    | { type: "mustAttackByInstance"; pid: PlayerId; instanceId: string } // このターンの間、pidの指定インスタンスは可能ならば必ずアタックする（action:"forceAttackThisTurn"のcount版が積む。BS08獣機合神セイ・ドリガン）
    | { type: "canBlockWhileRestedThisTurn"; pid: PlayerId; familyFilter?: FamilyFilter } // このターンの間、pidのfamilyFilter一致スピリット（省略時は全て）は疲労状態でもブロックできる（action:"grantCanBlockWhileRestedThisTurn"が積む。constraint:"canBlockWhileRested"のターン付与版。BS08インフィニティシールド）

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
    | { type: "summon"; handIndex: number; level?: number; paySources?: PaySource[]; substituteInstanceId?: string } // 召喚（神速持ちはフラッシュ時も可）。level指定時はそのレベルに必要なコア数をリザーブから置いて召喚する（省略時はLv1）。substituteInstanceId指定時は kind:"battleSwapSummon" の召喚＝バトル中の自分のスピリット1体を手札に戻し（追加コスト）、その代わりに疲労状態で召喚してバトルを引き継ぐ（召喚コストは通常どおり必要。発動可否は shared/rules.ts の canBattleSwapSummon で判定できる。BS07ブラックカラカロッサム）
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
    | { type: "surrender" } // 降参：相手の勝利としてただちに終了する。手順の外側の操作なので、
    // 自分のターンでなくても、フラッシュ中でも、対象の選択待ち中でも受け付ける
