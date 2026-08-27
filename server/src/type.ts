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
    lowerBpThanBattleLoser?: true // 直前のバトルで破壊された側より実効BPが低い（normalizeFilter が state.lastBattleDestroyedBp-1 を maxBp 軸へ解決する＝厳密な未満。記録が無ければ対象なし。BS10-X04月光龍ストライク・ジークヴルム Lv2：「そのスピリットよりBPの低い」）
    sameCostAsSelf?: true // self（＝この効果を解決するときの基準インスタンス。fieldEvent ではイベント対象＝召喚されたスピリット等）と同じコスト。normalizeFilter が cost 軸へ解決する。self がいなければ対象なし（BS09-060緑翼の大樹＝「そのスピリットと同じコストの相手」）
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
export type EffectAction =
    | { type: "draw"; count: number; side?: "own" | "both"; costSkipCoreStep?: true } // 自分がデッキから引く（side:"both"指定時は自分→相手の順で両者が引く。省略時=own＝従来どおり自分のみ。BS03巨猫ブリンクス：お互いドロー）。// costSkipCoreStep指定時は「ボイドからコアをリザーブに置かないことで」＝そのコアステップのコア置きを支払いに使う。GameState.coreStepSkipped を立ててから引く（step.beforeStepAction と対で使う。BS10-087戦場に息づく命）
    | { type: "destroyCostsEachOne"; costs: number[] } // 指定コスト**ごとに1体ずつ**相手のスピリットを破壊する（コスト3から1体・コスト4から1体＝計2体。片方しかいなければその1体だけ。2026-08-14 ユーザー確認。BS09-052フォレスト・ゴレム）
    | { type: "destroy"; filter?: TargetFilter; count: number; countPerOpponentTrashMagicColors?: boolean; anySide?: true; excludeTarget?: true; chooserIsTarget?: true }
    // chooserIsTarget指定時は、**破壊される側（相手）が対象を選ぶ**（実行は発生源の持ち主の効果として解決する。exhaust/returnToDeckTopのchooserIsTargetと同型。BS10-101ハングドマン＝「相手は、相手のスピリット1体を破壊する」） // 相手スピリットを破壊（絞り込みは filter。省略=BP不問、selfがnullで self 相対BP指定ならno-op）。countPerOpponentTrashMagicColors指定時はcountを無視し、相手のトラッシュにあるマジックカードの色の種類数（重複除く）を対象数として使う（BS05超獣王ベヒードス）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり実効BP最大を自動選択＝同値は相手側優先。BS01ランスラプトル等：修飾なしの「スピリット」）。excludeTarget指定時はtargetInstanceIdを「破壊する対象」ではなく「**除外する**対象」として扱う（誘発が渡すイベント対象を避ける。exhaust.excludeTargetと同型。BS06計画された場外乱闘Lv2：ブロックしたスピリット以外を破壊）
    | { type: "destroyOwnByFamilyThenWipeEnemy"; family: FamilyFilter } // 指定系統を持つ自分のスピリットすべてを破壊してから、相手のスピリットすべてを破壊する（BS04ストレートフラッシュ）
    | { type: "destroyDuplicateNames"; choosing?: true; keptIds?: string[] } // 相手のフィールドに同じカード名のスピリットが2体以上いるとき、カード名1つにつき1体だけ残して残りを破壊する（BS02マインドフレア）。**どれを残すかは持ち主が選ぶ**（効果文「カード名1つにつきスピリット1体ずつを残し」に主語が無いので発生源の持ち主。2026-08-24。非対話はフィールドの先頭側）。choosing / keptIds は重複するカード名を1つずつ聞くための内部フィールド（cards.jsonには書かない）
    | { type: "destroyAll"; filter?: TargetFilter; anySide?: boolean; drawPerDestroyed?: true; voidCoreToSelfPerDestroyed?: true } // filter に一致する相手スピリットを全破壊。anySide指定時は両陣営が対象（filter.colorExclude で色除外＝BS04魔龍帝ジークフリードLv3：赤以外のBP4000以下すべて。filter.rested と cost.max の組み合わせで「疲労状態のコストX以下すべて」＝BS05吸血女王カーミラ）。drawPerDestroyed指定時は実際に破壊できた数ぶん自分がドローする（BS08ドラゴンスクランブル）。voidCoreToSelfPerDestroyed指定時は実際に破壊できた数ぶん、ボイドからコアをself上に置く（selfがnullならno-op。X003D極帝龍騎ジーク・クリムゾン）
    | { type: "selfBuff"; amount: number } // このスピリット自身をBP+（ターン終了時まで）
    | { type: "destroyNexus"; count: number; drawPerDestroyed?: number; discardOpponentPerDestroyed?: number; all?: boolean; side?: "opponent" | "both"; levelFilter?: number[] } // discardOpponentPerDestroyed指定時は、実際に破壊できたネクサス1つにつき相手の手札をその数だけ破棄させる（BS05鉄槌のオズワルドLv2） // 相手のネクサスを破壊（drawPerDestroyed指定時は実際に破壊できた数×ドロー）。all指定時はcountを無視し相手のネクサスすべてを破壊する（BS04風龍王フージャオス）。side指定時は破壊対象の陣営を切り替える（省略時はopponent＝従来どおり。BS01バスターファランクス＝both）。levelFilter指定時はcurrentLevelがこれに含まれるネクサスのみ対象（BS03バスターランス＝Lv1のみ）
    | { type: "returnSelfToHand" } // このスピリットを持ち主の手札に戻す
    | { type: "coreRemove"; count: number; dest?: "void"; anySide?: true; countCounter?: EffectCounter; leaveAtLeast?: number; filter?: TargetFilter; drawIfEmptied?: true } // drawIfEmptied指定時は、**この効果で**対象のコアが0個になったときに自分が1枚ドローする（BS10-066 騎士王蛇ペンドラゴン） // leaveAtLeast指定時は、対象のコアがこの数を下回らないところまでしか取り除かない（BS04王蛇の住処Lv2「この効果で相手のスピリット上のコアを0個にはできない」） // 対象スピリットのコアを持ち主のリザーブへ置く（dest:"void"指定時はリザーブでなくボイドへ＝消滅。BS04ヴェノムショット）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり実効BP最大を自動選択＝同値は相手側優先。BS01ポイズンシュート：修飾なしの「スピリット」）。countCounter指定時はcountを無視しEffectCounterの値を除去枚数として使う（0ならログのみ。BS03巨人王ランドルフ：【粉砕】で破棄した枚数ぶん）。filter指定時は対象自動選択・明示ターゲットの両方にTargetFilterの絞り込みを適用する（BS08倒逆ピラミッド群：BP5000以下）
    | { type: "bpBuff"; filter?: TargetFilter; amount: number; amountFromSelfBp?: true; scope?: "battle"; anySide?: true; extraPerCoreToTrash?: number; boostTargetInstanceId?: string } // 対象スピリット1体をBP+（既定はターン終了時まで。scope:"battle" 指定時はそのバトルの終了まで＝CardInstance.battleBpBuff に積む。効果テキストが「このバトルの間」と書いているカードだけに付ける。BS07ニードルショット）。filter.minSymbols 指定時、対象（targetInstanceId明示・自動選択とも）はシンボル数がこれ以上のスピリットのみ有効（ライトニングバリスタ等）。amountFromSelfBp指定時はamountを無視し、**発生源自身の実効BP**を加算量として使う（selfがnullならno-op。BS08機人フィアラル：BP+(このスピリットのBP)）。anySide指定時は自分/相手どちらのスピリットも対象にできる（陣営を書いていない「スピリット1体をBP+」。interactiveTargets時はrequestChoiceで両陣営から選ばせ、非対話時は従来どおり自分の場から自動選択する。SD02ストロングドロー／BS01ダークコフィンのフラッシュ）。// extraPerCoreToTrash指定時は、amountを適用したあと「自分のフィールド/リザーブのコアを自分のトラッシュに好きなだけ置くことで、置いたコア1個につきその値ぶん追加でBP+」を続けて解決する（BS10-103グロウイングソード＝1個につき+1000）。interactiveTargets時は0〜（リザーブ+フィールドのコア）の**増減式の選択**（PendingChoice.stepper）を出し、非対話時は0個（追加なし）に倒す。コアはリザーブ優先で取る（payCoresFromFieldOrReserveToTrash）。// boostTargetInstanceId は選択の再入をまたいで「どのスピリットをBP+したか」を持ち回る**内部専用フィールド**（cards.jsonには書かない。これが入っているときは amount の適用は済んでいる）
    | { type: "exhaust"; filter?: TargetFilter; count: number; anySide?: true; excludeTarget?: true; chooserIsTarget?: true; countFromBofu?: true; bofuSourcePid?: PlayerId } // bofuSourcePid は【暴風】の持ち主を示す**内部専用フィールド**（cards.jsonには書かない）。countFromBofu を解決した時点で入れ、選択の再入をまたいで持ち回る。**owner では代用できない**：【暴風】は chooserIsTarget（疲労させられる側が対象を選ぶ）のため、再入後の owner は相手側に入れ替わる。exhaustSpirit が GameState.bofuExhaustedThisBattle への記録と "ownBofuExhausted" の発火に使う // 相手スピリットを疲労させる（絞り込みは filter。自動選択・明示ターゲット選択の両方に適用）。excludeTarget指定時はtargetInstanceIdを「疲労させる対象」ではなく「**除外する**対象」として扱う（誘発が渡すイベント対象を避ける。BS01甲精ディース：ブロックするスピリット以外を疲労させる） // chooserIsTarget指定時は、**疲労させられる側（相手）が対象を選ぶ**（実行は発生源の持ち主の効果として解決する。PendingChoice.actorPid。【暴風】＝「相手は、相手のスピリットを指定された体数疲労させる」） // countFromBofu指定時はcountを無視し、selfが持つ【暴風】の**実効**指定数（静的keywordのcount＋bofuCountBonusの加算。bofuCountFor）を使う。【暴風】の挙動を担うonBlockedエントリはカード側に固定値のcountを持つため、指定数を増やす継続効果（BS08ゲラン准将Lv2）を届けるにはここで解決し直す必要がある
    | { type: "drawPer"; counter: EffectCounter } // カウント値ぶん自分がドロー（0ならログのみ）
    | { type: "bpBuffPer"; counter: EffectCounter; amountPer: number; keywordFilter?: Keyword } // ⚠️ **これはマジックの単発バフ用**。スピリット/ネクサスの「〜1体につきこのスピリットをBP+1000する」は**継続効果なので kind:"aura" + AuraCounter で書く**（2026-08-27 にデータ全件を確認。aura 側17枚・bpBuffPer 側4枚がすべてこの境界で分かれており例外なし）。 // 対象スピリット1体を「カウント値×amountPer」だけBP+（0ならログのみ）。keywordFilter指定時は、そのキーワードを持つ自分のスピリットのみ対象（静的・一時付与・継続付与を考慮。BS07ネクサスアタック＝【強襲】持ち）
    | { type: "discardHandAll" } // 自分の手札をすべてトラッシュへ
    | { type: "bpBuffAll"; filter?: TargetFilter; amount: number } // 自分のフィールドのスピリットすべてをBP+（ターン終了時まで。filter.family 指定時は指定系統持ちのみ。配列＝いずれかの系統でOR）
    | { type: "returnToHand"; count: number; maxBpFromSelf?: boolean; countPerOpponentNexus?: boolean; anySide?: true; filter?: TargetFilter; costReserveToTrash?: number } // costReserveToTrash指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからトラッシュへ送ってから実行する（lifeCrush.costReserveToVoid と同じ方針。「〜することで」は任意コストなのでカード側で optional:true を立てる。BS07剣王獣ビャク・ガロウLv2）。// 対象スピリットを持ち主の手札に戻す（破壊ではないためonDestroyは誘発しない）。maxBpFromSelf=selfの実効BP以下の相手のみ（BS04鋼葉の樹林Lv2）。countPerOpponentNexus指定時はcountを無視し、相手のネクサス数を対象数として使う（BS05幻獣王リーン）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり実効BP最大を自動選択＝同値は相手側優先。BS01ヘル・ブリンディ等：修飾なしの「スピリット」）。filter指定時は対象自動選択・明示ターゲット（誘発が渡すtargetInstanceId）の両方に絞り込みを適用する（BS06レインディア＝ブロックしたスピリットが系統「空牙」のときのみ）
    | { type: "handToOwnDeckTop"; count: number } // 持ち主が自分の手札からcount枚を選んで自分のデッキの一番上に戻す（opponentHandToDeckTopの自分版。interactiveTargetsでは持ち主本人に選ばせ、自動時は手札末尾＝決定的簡略化。BS09-058魔本収められし書架Lv2）
    | { type: "opponentHandToDeckTop"; count: number } // 相手は手札からcount枚を選んで自分のデッキの一番上に戻す（interactiveTargetsでは相手本人に選ばせる。自動時は手札末尾＝決定的簡略化。BS07魔札の占い師ディーシャLv2）
    | { type: "returnBofuExhaustedToDeckBottom"; orderedIds?: string[] } // このバトル中に自分の【暴風】で疲労させた相手のスピリットすべて（GameState.bofuExhaustedThisBattle）を、持ち主のデッキの下に戻す。**戻す順番は発揮した側が1体ずつ選ぶ**（効果文「好きな順番で」。非対話時は記録順）。まだフィールドにいる個体だけが対象で、コアは持ち主のリザーブへ。BS06颶風高原Lv2 // orderedIds は選んだ順番を持ち回るための内部フィールドで、cards.json には書かない
    | { type: "returnToDeckTop"; anySide?: true; count?: number; chooserIsTarget?: true; filter?: TargetFilter } // filter指定時は対象の絞り込みに使う（BS09-X38要塞騎神オーディーンType-X＝【転召】を持たない相手3体）。// count指定時はその体数ぶん繰り返す（1体ずつ選ぶので**最後に選んだものがデッキの一番上**＝「好きな順番で戻す」を表現している。選択で中断したときは残り体数を再開スタックへ積む）。// chooserIsTarget指定時は**戻される側（相手）が対象を選ぶ**（「**相手は**、相手のスピリット3体を〜戻す」。解決は発生源の持ち主の効果として行う＝PendingChoice.actorPid。exhaust.chooserIsTarget と同型。BS07ブリシンガメンの首飾り＝3体）。// 対象スピリットを持ち主のデッキの一番上に戻す。anySide指定時は自分/相手どちらのスピリットも対象にできる（destroy/returnToHandのanySideと同じ非対称ルール。BS01ドリームチェスト：修飾なしの「スピリット」）
    | { type: "returnToDeckBottom"; filter?: TargetFilter } // 対象の相手スピリット1体を持ち主のデッキの下に戻す（returnToHandの兄弟・単体版。returnToDeckTopと違いcount/anySide/chooserIsTargetは持たない。filter指定時は対象自動選択・明示ターゲットの両方に絞り込みを適用する。BS10-042カラドリアス＝【強襲】を持つ相手のスピリット1体）
    | { type: "coreCharge"; count: number } // 自分のリザーブから対象の自分スピリットへコアを最大count個置く
    | { type: "selfCoreToOwnLife"; count: number } // このスピリット（self）の上のコアをcount個、自分のライフに置く（selfがnull／コアが足りなければ可能な分だけ。維持コア割れは消滅処理を通す。BS07ライフセービング）
    | { type: "lifeCharge"; count: number; from?: "reserve" | "void"; upTo?: number } // upTo指定時はcountを無視し、「ライフがこの数になるように」不足分だけ置く（すでにこの数以上なら何もしない。BS09-X35超神星龍ジークヴルム・ノヴァ＝ライフが5になるように）。// 自分のリザーブ（既定）から自分のライフへコアをcount個置く（不足なら可能な分だけ）。from:"void"指定時はボイドから置く＝リザーブを消費せず必ずcount個置ける（【聖命】。BS07）
    | { type: "refreshSelfByExhaustNexus" } // 自分の回復状態のネクサス1つを疲労させることで、このスピリットを回復する（【強襲】。ターン中の上限回数は self が持つ kind:"keyword" keyword:"kyoshu" の count から読む。疲労できるネクサスが無い／上限に達している／自身が回復状態なら不発）
    | { type: "coreGain"; count: number; costDestroyOwnSpirit?: { minCost?: number }; costSacrificeChosen?: true } // ボイドから自分のリザーブへコアをcount個追加。costDestroyOwnSpirit指定時は、コストがminCost以上の自分のスピリット1体を破壊することがコスト（任意コスト。COST_MODEL.md）で、破壊できる対象がいなければ不発。対象はコスト最小（同コストはフィールド先頭）を機械的に選ぶ簡略化、interactiveTargets時は候補2体以上ならプレイヤーが選ぶ（costSacrificeChosenは選択の再入用の内部フラグ。cards.jsonには書かない。BS10-105ライフチャージ）
    | { type: "refreshAllOwn"; exemptFamily?: FamilyFilter; exemptKeyword?: Keyword } // exemptKeyword指定時は、そのキーワードを持つ個体には cantAttackThisTurn を付与しない（exemptFamily のキーワード版。spiritHasKeyword で判定。BS09-076エマージェンシー＝【転召】持ちはアタックできる）。// 自分の疲労スピリットをすべて回復。回復した個体はこのターン中アタック不可。exemptFamily指定時は指定系統（配列＝OR。matchesFamilyFilterで判定）を持つ個体には cantAttackThisTurn を付与しない（BS06キャバルリー＝系統「戦騎」を持たないスピリットのみアタック不可）
    | { type: "endBattle" } // 今行っているバトルをただちに終了（BP比較・ライフダメージなし。バトル外はno-op）
    | { type: "swapBattler" } // バトルしている自分のスピリット1体を、疲労状態の自分のスピリット1体と入れ替える（テレポートチェンジ。バトル外・使用者がバトル非参加・疲労スピリット不在はno-op）
    | { type: "exhaustAllByColor"; side?: "opponent" } // 相手フィールドで最多の色を自動選択し（「色をひとつ選び」の決定的簡略化）、その色を持つ両陣営のスピリットを疲労させる。side:"opponent"指定時は相手のスピリットのみ（BS07大風車の丘）
    | { type: "exhaustAll"; side: "opponent" | "both"; minBp?: number; maxBp?: number; costFilter?: { max?: number; min?: number }; filter?: TargetFilter } // 指定側（相手/両陣営）のスピリットをBP範囲（minBp以上/maxBp以下）で疲労させる。装甲・疲労免疫は相手側のみ尊重（BS04グラウンドハウリング）。costFilter指定時は対象のコストで絞る（returnAllToHand と同じ形。道化師クランの付与コストも見る。SD01-017 重装蟲キャタバルガ＝コスト1以下）。filter指定時はcores/excludeSelfのみ追加で判定する（他の軸は未対応。BS05双剣虎ジェン・フー：コア1個のみ・自分自身を除く）
    | { type: "exhaustAllOpponentNexuses" } // 相手のネクサスすべてを疲労させる（BS10-074 きぐるみクマッター）。装甲・耐性は問わない（ネクサスへの疲労付与に耐性判定を持つカードは現状無い）
    | { type: "exhaustSpiritsAndNexusesUpTo"; count: number } // 相手のスピリット/ネクサスを合計count個まで疲労させる（決定的簡略化：スピリットを実効BP最大から優先して疲労させ、残った枠をネクサスへ場の並び順で充てる。BS10-018エル・クラーケン＝合計3つまで）
    | { type: "returnAllToHand"; side: "opponent" | "both"; costFilter?: { max?: number; min?: number }; filter?: TargetFilter } // 指定側のスピリットのうちコスト条件を満たすものすべてを各持ち主の手札へ戻す（バウンス＝onDestroy不発火。装甲/免疫は相手側のみ尊重。BS04ドリームハンド）。filter指定時はさらにTargetFilterの軸で絞り込む（既存costFilterは残す。BS06鎧神機ヴァルハランスLv3＝BP4000以下）
    | { type: "refreshByFamily"; familyFilter: FamilyFilter; count: number } // 自分の疲労スピリットのうちfamilyFilter一致（配列=OR）をcount体まで回復（実効BP最大から。cantAttackThisTurnは付与しない。BS04ハイエーテル）
    | { type: "trashCoresToKeywordSpirit"; keyword: Keyword } // 自分のトラッシュのコアすべてを、指定キーワードを持つ自分のスピリット1体へ置く（候補複数かつinteractiveならpendingChoice、そうでなければ実効BP最大へ。BS04グレートリンク）
    | { type: "lockFlash"; attackerFamilyFilter?: FamilyFilter } // バトル中のみ有効：このバトルの間、相手はフラッシュで手札のカードを使用できなくする。attackerFamilyFilter指定時は、アタックしているのがこの系統（配列＝OR）の自分のスピリットのときだけ効く（BS07ウィリアンスラッシュ）
    | { type: "returnNexusToHand"; count: number; anySide?: true; voidCoreToOwnTrashIfOpponent?: number; all?: true; side?: "opponent" | "both" } // 相手のネクサスを持ち主の手札に戻す（破壊ではない）。anySide指定時は自分/相手どちらのネクサスも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり相手の先頭ネクサスを自動選択。BS03メビウスリング）。voidCoreToOwnTrashIfOpponent指定時、戻したネクサスが相手のものだったときのみボイドからその数のコアを自分のトラッシュへ置く。all指定時はcountを無視し、side（省略時はopponent）が指すすべてのネクサスを戻す。side:"both"は両陣営すべて（BS06ホワイトホール：ネクサスすべて）
    | { type: "reclaimTrashCores" } // 自分のtrashCoresをすべてリザーブへ（0ならログのみ）
    | { type: "refreshSelf"; costReserveToVoid?: number; costSelfCoresToVoid?: number } // このスピリット自身を回復させる（selfがnull/既に回復状態ならno-op）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから回復する（lifeCrush.costReserveToVoidと同じ方針。「〜することで」は任意コストなのでカード側でoptional:trueを立てる。BS06-X23天帝ホウオウガ：効果文は「[ソウルコア]以外のコア」限定だが、**ソウルコアが未実装のいまはリザーブのコアがすべて通常コアなのでこれで正しい**。ソウルコアを入れるときに通常コア限定の支払いへ差し替えること＝docs/design/SOULCORE.md §10）。costSelfCoresToVoid指定時は、リザーブでなく**このスピリット自身**の上のコアから支払う（自身のコアが不足／支払うとLv1コア数を下回るなら不発。BS08ブラックタウロス大王：このスピリット上のコア2個をボイドに置くことで回復する）
    | { type: "exhaustSelf" } // このスピリット自身を疲労させる（selfがnull/既に疲労状態ならno-op。exhaustSpirit経由なのでownSpiritExhausted等が正しく発火する。BS06雪ん子イエティ／天使長ファニム）
    | { type: "lifeCrush"; count: number; costReserveToVoid?: number; countCounter?: EffectCounter; dest?: "trash" } // 相手のライフのコアcount個を相手のリザーブへ（dest:"trash"指定時は相手のトラッシュへ。リザーブと違い再利用されないので相手のリソースがそのぶん減る。BS08機神獣インフェニット・ヴォルスLv3）（ライフ0以下で勝敗決定）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから実行する（「〜することで」は任意コストなので、カード側で optional:true を立てて発動確認を出すこと。BS04カイザーアトラス皇帝）。countCounter指定時はcountを無視しEffectCounterの値を個数として使う（0ならログのみ。BS08メテオストーム：このスピリットのシンボルと同じ数）
    | { type: "voidCoreToSelf"; count: number } // ボイドからコアcount個をこのスピリット上に置く（selfがnullならno-op）
    | { type: "voidCoreToSelfPer"; counter: EffectCounter } // カウント値ぶんボイドからこのスピリット上にコアを置く（0ならno-op）
    | { type: "voidCoreToSelfPerBofuCount" } // このスピリット（self）自身が持つ【暴風】の指定数（keywordエントリのcount。省略時1）ぶん、ボイドからこのスピリット上にコアを置く（selfがnull/【暴風】を持たないならno-op。BS06颶風高原：召喚されたスピリットに乗せる）
    | { type: "discardOpponent"; count: number; forcedTargetPid?: PlayerId; cardTypeFilter?: CardType; random?: boolean; chooserIsSource?: boolean } // random指定時は**誰も選ばない**（手札からランダムにcount枚）。効果文が「自分は、相手の手札1枚を**内容を見ないで**破棄する」の形＝どちらも中身を見ないのでランダムが正しい（BS02-021髑髏騎士ズ・ガイン／BS03-084巨猫ブリンクス。2026-08-17ユーザー確認。CHOOSER_RULES.md §1.6）。// 相手の手札からcount枚を破棄（手札末尾から。手札が足りなければある分だけ）。interactiveTargets時は選択式（選択者は破棄される相手本人）。forcedTargetPidは選択式再突入時のみ内部で設定する対象プレイヤー（cards.jsonには書かない。選択者=破棄される側のためresolveActionのowner引数がopponentOf(owner)で逆算できなくなるのを避ける）。cardTypeFilter指定時はこのカード種別のみが対象（該当が無ければ不発。BS08関将龍皇ドラグロン：相手の手札を見てスピリットカード1枚を破棄）。chooserIsSource指定時は**発生源の持ち主が選ぶ**（効果文が「自分は相手の手札すべてを見て、その中の◯◯カード1枚を破棄する」の形）。interactiveTargets時は相手の手札を公開ゾーン（GameState.revealedCards）へ載せて cardZone:"reveal" で選ばせる（相手は自分の手札を既に知っているので情報は漏れない）。非対話時はコスト最大の該当カードを選ぶ決定的簡略化。chooserIsTarget（相手が選ぶ）の対。CHOOSER_RULES.md §1.6
    | { type: "refreshOne"; filter?: TargetFilter; all?: boolean; count?: number; chosenByPlayer?: true } // chosenByPlayer は**選択の解決として再入したこと**を示す内部フラグ（cards.jsonには書かない）。これが無い targetInstanceId は誘発が渡すイベント対象（onBlock のアタッカー等）であって回復対象ではないため、区別しないとベル・ダンディアのような誘発が不発になる。// **どれを回復させるかは interactiveTargets ならプレイヤーが選ぶ**（2026-08-23。候補1体なら聞かない。count 指定は1体ずつ count 回）。以下の自動選択は非対話（テスト）の経路。// count指定時はその体数まで回復する（実効BP最大から順に。cantAttackThisTurn は付与しない。BS09-033槍戦騎ガウト＝黄3体／BS09-X37終焉の騎神ラグナ・ロック＝コスト8以下3体）。// 自分の疲労スピリット1体を回復（絞り込みは filter。family は spiritHasFamily 判定＝付与系統も考慮。候補から実効BP最大を自動選択、いなければno-op）。all指定時は該当候補すべてを回復し cantAttackThisTurn は付与しない（決闘台地Lv2／鋼に覆われた高空／ベル・ダンディア）。filter.excludeSelf 指定時は候補からself自身を除外する（BS04風龍王フージャオス：自身も系統「翼竜」だが対象外）
    | { type: "protectBlockerCoresThisBattle" } // このバトルの間、**このスピリットをブロックしているスピリット上のコアは効果で取り除けない**ようにする（GameState.battle.blockerCoresProtected を立てる。バトル終了で自然に消える。BS09-027密林の勇者皇ヴォルザLv2-3）
    | { type: "coreRemoveSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のリザーブへ（selfがnullならno-op）
    | { type: "selfBuffPer"; counter: EffectCounter; amountPer: number } // このスピリット自身を「カウント値×amountPer」だけBP+（ターン終了時まで。selfがnull/カウント0はno-op）
    | { type: "voidCoreToOther"; count: number; colorFilter?: Color; targets?: number; excludeSelf?: true } // colorFilter指定時はその色を持つ自分のスピリットのみ対象（instHasColorで判定＝colorAs/tempColorsの付与色も見る。BS09-020ヤミヤンマ＝白）。targets指定時はその体数へcount個ずつ置く（実効BP上位から重複なく。BS09-023要塞蟲ラルバ＝白2体）。// ボイドからコアcount個を、自分のスピリットのうち実効BP最大の1体に置く（候補がいなければno-op）。// excludeSelf指定時は**発生源自身を対象から外す**（効果文に「このスピリット以外の」と明記があるものだけ。BS01-066スタッグローブ）。既定は自身も対象＝「自分の◯◯のスピリット」に自分自身が含まれる（2026-08-20 修正。アクション名の Other はスタッグローブ由来で、ヤミヤンマ／ラルバには除外の記載が無いのに引き継がれていた）
    | { type: "fireOwnDestroyTriggers" } // 発生源の持ち主のスピリットすべての『このスピリットの破壊時』効果を、**破壊させずに**発揮させる（フィールドから取り除かない。発揮順はフィールドの並び順。BS07女教皇リル・サキュバス）
    | { type: "coreSqueezeAll" } // 両プレイヤーの全スピリットについて、コアを1個だけ残し超過分をその持ち主のリザーブへ（1個未満で維持コア割れになる場合は消滅処理を適用）
    | { type: "endAttackStepAfterBattle"; excludeCombined?: true } // バトル中のみ：このバトルが終了したときアタックステップを終了するフラグを立てる（バトル外はno-op。サイレントウォール／SD02-003 天使デュナミス＝コスト2以下をブロックしたとき）。excludeCombined指定時は、現在のバトルのアタッカー/ブロッカーのいずれかが合体スピリットなら不発にする（BS10-107サイレントロック：「合体していないスピリットのバトルが終了したとき」）
    | { type: "destroyBlockerAfterBattle"; costSelfCoresToTrash: number } // 発生源（ネクサス）上のコアを costSelfCoresToTrash 個そのトラッシュへ置くことで、
    // 現在のバトルのブロッカーを**バトル終了後**（＞７。【呪撃】と同じ位置）に破壊する予約を立てる（BattleState.endBattleDestroy）。
    // self は発生源自身（fieldEvent 側で selfMode:"source" を指定する）。コアが足りない／バトルがない／ブロッカーがいないときは不発（ログのみ）。
    // **支払いでレベルが下がっても予約は残る**（発揮はコストを払った時点で成立している。2026-08-16 ユーザー確認）。
    // 破壊そのものは通常の destroy 経路で解決するので、装甲・効果耐性は**バトル終了後のその時点**で判定される（BS01-104 千本槍の古戦場Lv2）
    | { type: "coreToTrashSelf"; count: number } // このスピリット（self）のコアcount個を持ち主のトラッシュへ（維持コア割れの消滅処理を含む。selfがnullならno-op）
    | { type: "recoverSpiritFromTrash"; costSacrificeChosen?: true; count: number; familyFilter?: FamilyFilter; all?: true; thenDestroyIfFamily?: { family: FamilyFilter; maxBp: number }; costDestroyOwnKeyword?: Keyword; keywordFilter?: Keyword; colorFilter?: Color; nameIncludes?: string; costSkipDraw?: true; includeBraves?: true; vanillaFilter?: true; bravesOnly?: true }
    // vanillaFilter指定時は効果の記述を持たないカードのみ対象（isVanillaCardで判定。BS10-082六分儀天文台＝「効果の記述を持たないスピリットカード」）。
    // bravesOnly指定時はスピリットカードでなく**ブレイヴカードだけ**が対象になる（includeBravesの「両方」とは別軸。BS10-100ブレイヴセメタリー＝「ブレイヴカード」） // colorFilter指定時はこの色を持つスピリットカードのみ対象（トラッシュのカードが対象なのでカード静的なcolorsで判定。BS09-015獄獣ガシャベルスLv3＝黄）。 // includeBraves指定時は対象にブレイヴカードも含める（cardData.type==="brave"も対象。BS10-006ヤシウム：「スピリットカード/ブレイヴカード」）。// costSkipDraw指定時は「ドローしないことで」＝そのドローステップのドローを支払いに使う。実際に手札へ戻せたときだけ GameState.drawStepSkipped を立てる（step.beforeDraw と対で使う。BS07常闇の聖堂Lv2）。// nameIncludes指定時はカード名にこの文字列を含むカードのみ対象（カード静的な名前で判定＝トラッシュのカードが対象のため。BS08アルカナクィーン・パラス＝「アルカナ」）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象（hasKeywordで判定＝トラッシュのカードが対象のため。BS08ターンインフェルノ＝【転召】持ち）。// costDestroyOwnKeyword指定時は、そのキーワードを持つ自分のスピリット1体（実効BP最小＝犠牲を最小化する簡略化）を破壊することがコストで、該当がなければ不発（BS07ブリュナグオン＝【呪撃】持ち）。// thenDestroyIfFamily指定時は、手札に戻したカードがその系統（配列＝OR。カード静的なfamilyで判定）を持つときだけ、続けてmaxBp以下の相手スピリット1体を破壊する（BS07ドラグロン占術師＝「勇傑」のときBP3000以下を破壊）。// 自分のトラッシュにあるスピリットカードをcount枚、手札に戻す（末尾＝新しい方から自動選択。本来は選択の簡略化。該当なしはno-op）。familyFilter指定時はその系統を持つカードのみ（配列＝OR。カード静的な family で判定。BS04鋼葉の樹林）。all指定時はcountを無視し、familyFilter該当カードすべてを手札に戻す（BS03ネクロマンシー）
    | { type: "coreSqueezeOne"; count: number; anySide?: true; dest?: "trash" } // dest:"trash"指定時は超過分をリザーブでなく持ち主のトラッシュへ置く（BS09-012ボーギー）。// 相手フィールドの実効BP最大のスピリットをcount体選び、それぞれコアを1個だけ残して超過分を持ち主のリザーブへ（coreSqueezeAllの単体版。対象なしはno-op）。anySide指定時は自分/相手どちらのスピリットも対象にできる（targetInstanceId優先、interactiveTargets時はrequestChoiceで両陣営から選択、非対話時は既存どおり相手BP最大を自動選択。BS03ウィークネス）
    | { type: "coreToVoidOwn"; count: number } // 自分のコアcount個をボイドへ置く（消す）。trashCoresから優先的に減らし、足りなければ自分フィールドのスピリット（実効BP最小）から取る。維持コア割れは消滅処理
    | { type: "bothSidesCoreToTrash"; count: number } // 両プレイヤーが各自のフィールドのスピリットから、コアの多い個体から順に合計count個を各持ち主のトラッシュへ（1体で足りなければ次にコアが多い個体へ繰り越す。維持コア割れは消滅処理。片側のみ対象がいてもその側は処理する。BS01メタルディー・バグ＝count1、BS02マインドコントロール＝count4）
    | { type: "countAsMultipleThisTurn"; count: number; anySide?: true; sourceTypes?: CardType[] } // 対象スピリット1体に「このターンの間、使用者の効果では count 体分として数える」印を付ける（CardInstance.countAsThisTurn）。anySide指定時は自分/相手どちらのスピリットも対象にできる（BS05スリーカード＝3体分）。sourceTypes指定時は数える側の効果の発生源種別をこれに限る（スリーカード＝["spirit","nexus"]。効果文が「自分のスピリット/ネクサスの効果で数えるとき」とマジックを外しているため）
    | { type: "noop" } // 何もしない。pendingChoice が「アクションの解決」以外の用途（マジック無効化の確認。PendingChoice.magicNegate）で立つときのプレースホルダ。カードデータには書かない
    | { type: "costDiscardHandKeywordThenDraw"; keyword?: Keyword; cardType?: CardType; count: number } // cardType指定時はそのカード種別を対象にする（keyword と併用可。keyword 省略時は種別だけで絞る。BS09-066目覚める要塞城Lv2＝手札のネクサスカード）。// 自分の手札にある指定キーワード持ちのスピリットカード1枚を破棄することで、count枚ドローする。手札に該当が無ければ不発（COST_MODEL.md §1）。どれを捨てるかは interactiveTargets では持ち主が選び、自動時は先頭（決定的簡略化。BS09-055転生の谷Lv1-2＝【転召】持ちを捨ててドロー+1）
    | { type: "costDiscardNamedThenPeek"; cardName: string } // 自分の手札にある指定カード名のカード1枚を破棄することで、相手の手札1枚を**内容を見ないで選び**、その内容だけを見る（盤面は変わらない）。見たカードは PlayerState.peekedOpponentCardIds に積み、持ち主の PlayerView にだけ返す。手札に該当が無ければ不発（BS09-039探偵ペンタン＝[キャラクターロスト]）
    | { type: "discardSelfOne" } // 自分の手札の末尾1枚をトラッシュへ破棄（手札0ならno-op。本来は自分が選ぶ処理の簡略化）
    | { type: "discardBothHands"; count: number; countCounter?: EffectCounter; all?: true } // お互いが手札からcount枚を破棄する（自分→相手の順。**破棄するカードは各自が自分で選ぶ**＝1人ぶんを discardSelfChoose に委譲し、相手側は actorPid で相手の効果として解決する。非対話時は従来どおり手札の末尾から。手札が足りなければある分だけ。BS04魔界七将パンデミウムLv3）
    // all指定時はcountを無視し、各自の手札すべて（枚数は各自バラバラ）を破棄する（returnNexusToHandのallと同じ意味論。count自体は0を置く。BS10-111ハンドタイフーン）
    // countCounter指定時はcountを無視し、EffectCounterの値を破棄枚数として使う（0ならログのみ。BS10-X02双魚賊神ピスケガレオン：系統「光導」/「星魂」を持つ自分のスピリット数）
    | { type: "treatAsUnblockedIfLevelAtLeastBlocker" } // このバトルに「アタッカーのLvがブロッカーのLv以上ならBPを比べずブロックされなかった扱いにする」印を立てる
    // （BattleState.treatAsUnblockedIfLevelAtLeastBlocker。treatAsUnblockedIfBlockerLevel1 の一般化版。SD02-016 ウィングブーツ）
    | { type: "treatAsUnblockedIfBlockerLevel1" } // このバトルに「ブロッカーがLv1ならBPを比べずブロックされなかった扱いにする」印を立てる（BattleState.treatAsUnblockedIfBlockerLevel1。BS09-044ハマ・ドリュアスが effectGrant で楽族に配る）
    | { type: "markCantBlockThisBattle" } // 相手のスピリット1体を指定し、**このバトルの間**そのスピリットをブロックできなくする（CardInstance.cantBlockThisBattle。clearBattle で消える。BS09-042妖精騎士ピーターLv2-3）
    | { type: "markUnblockableThisTurn"; minBp: number; target?: "self" } // target:"self"指定時は発生源自身に印を付ける（BP最大の自動選択をしない。『このスピリットの召喚時：このターンの間、このスピリットはブロックされない』。BS07天使長トロン）// 実効BPがminBp以上の自分のスピリット1体（BP最大＝指定の決定的簡略化）に「このターン1回だけブロックされない」印を付ける（CardInstance.unblockableOnceThisTurn。印は次のバトルの終了時に消える。BS04強者統べる大地Lv2）
    | { type: "discardHandNexusToVoidCoreSelf"; count: number } // 自分の手札のネクサスカード1枚を破棄することで、ボイドからコアcount個をこのスピリット上に置く。手札にネクサスが無ければ不発（BS04機織のハーフェレシテLv1）
    | { type: "discardHandNexusesThenDraw" } // 自分の手札にあるネクサスカードをすべて破棄し、破棄した枚数ぶんデッキから引く（「好きなだけ」を全部破棄に決定的簡略化。BS03ネクサスレジスター）
    | { type: "discardSelfChoose"; count: number } // 自分の手札からcount枚を破棄する。interactiveTargets時は1枚ずつ選ばせ、非interactive時は末尾から機械的に破棄（BS01ストームドロー）
    | { type: "costDiscardHandThenDraw"; discardCount: number; drawCount: number } // 「自分の手札discardCount枚を破棄することで、自分はデッキからdrawCount枚ドローする」（COST_MODEL.md §1：コストと効果の両方が完全に解決できるときだけ発揮できる）。
    // 手札がdiscardCount枚未満なら不発（部分的な破棄はしない。ログのみ）。破棄するカードはCOST_MODEL.md §2どおりinteractiveTargets時は1枚ずつ持ち主が選び、非対話時は手札末尾から機械的に選ぶ（discardSelfChooseと同じ選び方）。
    // discardCountは選択の再入をまたいで「残り破棄枚数」を持ち回る内部利用も兼ねる（1枚選ぶたびに-1して再入し、0になった時点でdrawCount枚ドローする）。BS10-019土星神龍クロノ・ボロス
    | { type: "drawThenDiscard"; drawCount: number; discardCount: number } // デッキからdrawCount枚引いたあと、手札からdiscardCount枚を破棄する（BS01ストームドロー）
    | { type: "coreDrainAllOthers"; rewardDraw?: true } // このスピリット（self）以外のすべてのスピリット上からコアを1個ずつ持ち主のリザーブへ（両陣営）。この効果で消滅した数ぶんボイドからselfへコアを置く（selfがnullならno-op）。
    // rewardDraw指定時は、コアをselfへ置く代わりに消滅した数ぶん自分がドローする（BS10-X02双魚賊神ピスケガレオン：「消滅したスピリット1体につき、自分はデッキから1枚ドローする」）
    | { type: "grantBlockerImmunity" } // ブロックしている自分のスピリット1体に、このターンの間 immuneToOpponentThisTurn を付与する（フェザーバリア）
    | { type: "negateOwnBlockConstraint" } // 自分のスピリット1体が持つ cantBlock/cantBlockLowerBp を、このターンの間無効化する（バーストファイア）
    | { type: "endStepLock"; turns: number; locks: ("attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve")[] } // 発揮した側のエンドステップを turns 回数えるまで、両陣営に locks の制限をかける（GameState.endStepLocks。BS10-108 ルナティックシール）
    | { type: "battleLoserCoresToVoid" } // 直前のバトルで破壊された相手のスピリット上のコアすべてを、リザーブでなく**ボイド**へ送る（BS10-065 ヘッジボルグ）。破壊待機中（コアが乗ったまま）に呼ぶ前提
    | { type: "blockTriggersAsAttackOwnThisTurn" } // このターンの間、**発生源の持ち主の**スピリットすべての『このスピリットのブロック時』効果を『このスピリットのアタック時』に発揮させる（両陣営版 blockTriggersAsAttackAllThisTurn の自分限定。BS10-072 セイバーシャーク）
    | { type: "grantUnblockableByLevelThisTurn"; levels: number[] } // このターンの間、発生源の持ち主のスピリットすべては、currentLevel が levels に含まれる相手のスピリットからブロックされない（BS10-073 エンジェドール＝Lv2）
    | { type: "extraAttackStep" } // アタックステップとエンドステップを順番にもう1回ずつ行う（GameState.extraAttackStepPending を立てる。BS10-008 火星神龍アレス・ドラグーン）。既に立っていれば何もしない
    | { type: "endAttackStep"; onlyOpponentTurn?: boolean } // 今行っているアタックステップの終了フラグを立てる（onlyOpponentTurn=true時は自分のターンなら発動しない。妖機妃ソール）
    | { type: "deckReveal"; count?: number; pickType?: CardType; countPer?: { ownColorTotal: Color } | { ownNexuses: true } | { ownSymbols: Color }; pickAllOfType?: "magic"; nameIncludes?: string; familyFilter?: FamilyFilter; colorFilter?: Color; discardNonMatching?: boolean; returnToTop?: true; pickNone?: true } // pickNone指定時は手札に加えるカードを選ばず、公開してそのまま戻すだけ（returnToTop と併用すると「好きな順番でデッキの上に戻す」＝実対戦では戻す順番を1枚ずつ選ばせる。BS06-107 セカンドサイト） // 自分のデッキ上からcount枚（countPer指定時は自分の指定色スピリット/ネクサス合計数、またはownNexuses=自分のネクサス数、またはownSymbols=自分のフィールドの指定色シンボル数＝SD02-005 天使ヘルヴィム「自分の黄のシンボル1つにつき」。countと排他）を公開し、pickTypeに一致する最初の1枚（省略時は先頭。pickAllOfType指定時は一致するすべて。nameIncludes指定時はカード名にこの文字列を含むもの、familyFilter指定時はカード静的な系統がこれを含むもの、colorFilter指定時はその色を持つもののみ＝手札に加わらない候補は付与系統を考慮しない）を手札に加える。残りは元の順でデッキの下に戻す（discardNonMatching指定時はトラッシュへ破棄する。returnToTop指定時はデッキの上に戻す＝BS06曲刀竜パラサウル。スワロウアイヴィー／大天使ミカファール／BS05天焦がす大聖火／countPer.ownNexuses＝BS08古将ドグウ・ゴレム）
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
    | { type: "mutualDestroyChoice"; chosenOwn?: string; chosenOpp?: string; awaiting?: "own" | "opponent"; keywordExclude?: Keyword } // keywordExclude指定時は、そのキーワードを**持たない**スピリットだけが候補（spiritHasKeyword判定＝一時付与・継続付与も見る。BS09-016闇騎士モルドレッド＝【転召】を持たない）。// 「お互い、フィールドのスピリット1体を選び、破壊する」（BS05吸血女王カーミラLv3）。destroyAllExceptChosenColorsと同じ二段階choiceパターン：発生源の持ち主（own）→相手（opponent）の順に、フィールド（両陣営どちらでも可）から1体を指定させ、選ばれた2体（重複可）をそれぞれ破壊する。進捗はchosenOwn/chosenOpp/awaitingに持たせて再入する。非対話時は各プレイヤーが相手フィールドの実効BP最大を自動選択（プレイヤー選択の決定的簡略化。pickEnemyByBpと同じ考え方）
    | { type: "summonSequence"; byFushi?: true } // byFushi指定時は【不死】による召喚として「自分のスピリットが召喚されたとき」を発火する（fieldEvent.fushiSummonOnly の判定に使う）。// 召喚が済んだ後の処理（召喚時効果 →「自分のスピリットが召喚されたとき」誘発 → 天使長ファニムの疲労付与）を self に対して行う。**cards.jsonには書かない内部専用**：【転召】の対象選択で中断したときに、GameEngine が pendingChoice.queue へ積んで選択の解決後に合流させるためだけに使う
    | { type: "refireSummonEffect" } // 対象の自分スピリット1体（targetInstanceId優先、フォールバックは自分フィールド先頭）のonSummon効果を再発揮する（タイムリープ）
    | { type: "recoverMagicFromTrash"; colors?: Color[] } // colors指定時は、そのいずれかの色を持つマジックカードだけを対象にする（カード静的な colors で判定。BS09-039探偵ペンタン＝紫／BS09-043クロックダイル＝紫・黄）。// 自分のトラッシュにあるマジックカード1枚（末尾＝新しい方）を手札に戻す（トリックスター）
    | { type: "castMagicFromTrashByColor"; colorFilter?: Color } // 自分のトラッシュにある指定色（省略時は色不問）のマジックカード1枚を、手札にあるときと同様にコストを支払って使用する（interactiveTargets時はcard choiceで選択、自動時はコストが払える中で最もコストが高いものを自動選択。該当・支払い可能なカードがなければ不発）。この効果ではフィールドのコアは使えずリザーブのみで支払う簡略化。発動タイミングはこの効果自体の発火位置で決まる（バトル中ならflash、それ以外はメイン優先。BS08堕天使ミカファール）
    | { type: "magicMirrorRepeat" } // このフラッシュタイミングで相手が直前に使用したマジックカードの効果を、自分が使用したものとして解決し直す（対象・コストは無償の再現。GameState.lastMagicCastを参照し、相手の使用でなければ不発。[マジックミラー]自身は対象にできない＝連鎖ミラー防止。BS08マジックミラー）
    | { type: "trashCoresToSpirit"; count?: number } // 自分のトラッシュのコアを対象スピリットへ置く（count省略=全部、不足時は可能な分。対象はtargetInstanceId優先、フォールバックはself→自分フィールド先頭）
    | { type: "grantKeywordAll"; keyword: Keyword; colors?: Color[]; costFilter?: number; vanillaFilter?: true } // 自分のスピリット全員（costFilter指定時はコスト一致のみ、vanillaFilter指定時は効果の記述を持たないスピリットのみ）に、このターンの間キーワードを付与する（リフレクションアーマー／BS05サーキュラーソー・アーム）
    | { type: "banActByCostThisTurn"; maxCost: number } // このターンの間、コストがmaxCost以下のスピリットはすべてアタック/ブロック不可にする（ヘビィゲート）
    | { type: "deployNexusFromTrashByFieldCores"; colors: Color[] } // 自分のトラッシュにある指定色いずれかのネクサスカード1枚を、**自分のフィールドのコアだけ**を使ってコストを支払い配置する（リザーブは使わない。2026-08-14 ユーザー確認）。フィールドのコアが足りなければ不発。取るのはネクサス上→コアの多いスピリットの順（維持コアを割る個体からは取らない決定的簡略化。BS09-065名工集いし大工房Lv2）
    | { type: "deployNexus"; from: "hand" | "trash"; colors?: Color[]; all?: boolean } // colors省略時は**色を問わない**（SD02-006 鼬の暗殺者ウィゼーブ＝「トラッシュにあるネクサスカード1枚」）。// 手札またはトラッシュから、指定色いずれかのネクサスカード1枚をコストを支払わずに自分のフィールドに配置する（該当なしはno-op。スコルピード／白虎ハック／黒虎クロン）。all指定時は該当するネクサスカードをすべて配置する
    | { type: "sacrificeNexusThenWipeEnemyNexusCores" } // 自分のネクサス1つ（コア数最小、同数は配列先頭）を破壊し、相手の全ネクサス上のコアを相手のトラッシュへ置く（自分のネクサスが無い/破壊耐性で不発なら何もしない。プレイヤー選択の簡略化。サクリファイス）
    | { type: "levelOverrideOpponentNexuses"; level: number; costReserveToVoid?: number } // 相手の全ネクサスの levelOverrideThisTurn を level に設定（このターンの間）。costReserveToVoid指定時、自分のリザーブが足りなければ不発（ログのみ）。足りればその数のコアをリザーブからボイドへ送ってから適用する（「できる」の任意発動は自動発動で簡略化。皇帝アンプルール）
    | { type: "treatOwnNexusesAsSpiritsThisTurn"; minCores?: number; cost: number; family: string[]; levels: LevelDef[] } // 自分のネクサス（minCores個以上のコアが置かれているもの。省略時1）を、このターンの間スピリットとして扱う（BS03ゴーレムクラフト）。field.nexuses から field.spirits へ**同じインスタンスのまま**移し、CardInstance.asSpiritThisTurn に cost/family/levels の上書きを載せる。ターン終了時に PhaseManager.endTurn が生き残りを field.nexuses へ戻す（破壊された個体は既に場を離れているので戻らず、ネクサスカードがトラッシュに残る）
    | { type: "summonFromHandFree"; costSacrificeChosen?: true; colorFilter?: Color; sameFamilyAsSelf?: boolean; familyFilter?: FamilyFilter; costFilter?: number | { max?: number; min?: number }; nameIncludes?: string; maxCostFromOwnTrashCores?: true; costDestroyOwnFamily?: FamilyFilter; costDestroyOwnNexus?: true; count?: number; keywordFilter?: Keyword; skipTensho?: true; payCost?: true; skipOnSummon?: true; cancelable?: true } // cancelable指定時は、interactiveTargetsなら**候補が1枚でも必ず選択を出し、やめられる**（optional）。「起動能力から使う効果を、対象を見てからやめられるようにする」ためのもので、やめた場合は起動能力の「ターンに1回」も消費しない（doActivateAbilityがPendingChoice.revertActivatedで巻き戻す。BS08帝竜騎サイクル6枚）。// payCost指定時は**通常の召喚コストを支払う**（effectiveCostで軽減後コストを算出し、維持コア＋コストをリザーブから支払う。払えなければ不発）。アクション名の Free は既定の挙動を指すもので、payCost はその例外（BS08帝竜騎サイクル6枚＝「【転召】させずに召喚できる」だけでコスト免除の記載が無い）。// skipOnSummon指定時は召喚時効果と「召喚されたとき」の誘発を発揮させない（効果文に「ただし、『このスピリットの召喚時』効果は発揮されない」と明記があるカードだけ。既定では発揮する＝2026-08-17修正）。// maxCostFromOwnTrashCores指定時は「自分のトラッシュにあるコアの数以下のコスト」が上限になる（BS02ディバインウィンド）。costDestroyOwnFamily指定時は指定系統の自分のスピリット1体（コスト最小、同コストはフィールド先頭）を破壊することがコストで、破壊できなければ不発（BS02キャストオフ）。costDestroyOwnNexus指定時は自分のネクサス1つ（コア最少、同数はフィールド先頭）を破壊することがコストで、破壊できるネクサスがなければ不発（BS06リクラメーション）。// 自分の手札にあるスピリットカードのうち条件（colorFilter一致／sameFamilyAsSelf=selfと系統1つ以上共通／familyFilter=指定系統一致。配列＝OR）を満たすコスト最大の1枚（同コストは手札の先頭側）を、コストを支払わずに召喚する（プレイヤー選択の決定的簡略化）。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットの onSummon 効果は発揮されない（老賢樹トレントン／竜戦車アースガルド。familyFilterはBS05火龍王ボルケノス＝系統「竜人」限定で、selfの系統全部とはOR判定にしたくない場合に使う）。costFilter指定時はコストが完全一致するもののみ（BS05シーサーズ＝コスト2）。nameIncludes指定時はカード名にこの文字列を含むもののみ（BS05ペンタン帝国）。count指定時は「count枚まで」の複数体召喚（プレイヤー選択の決定的簡略化：コスト最大から貪欲に選び、維持コアがリザーブから払えなくなった時点で打ち切り。この場合interactiveTargetsでも選択式にせず自動選択のみ。BS06アルカナキング・カール＝4枚まで）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象（hasKeywordで判定。summonFromTrashFreeと同型）。skipTensho指定時は召喚後の【転召】解決そのものをスキップする（既定は「コストを支払わない召喚でも転召は必ず行う」だが、この効果は転召を発揮したものとして扱う旨の記載があるため例外。BS08雷帝竜騎レイブリッツ：手札の【転召】持ちを【転召】させずに召喚できる）
    | { type: "destroyAllNexusesExceptChosenColors"; minTotalColors: number } // 両者フィールドのネクサスの色数合計（重複除く）がminTotalColors未満なら不発（ログのみ）。成立時はお互い自分フィールドで最多のネクサス色を1色自動指定し（同数はColor定義順の先頭、ネクサス0の側は指定なし）、どちらの指定色でもないネクサスをすべて破壊する（destroyAllExceptChosenColorsのネクサス版。色選択の決定的簡略化。溶海竜プレシオス）
    | { type: "destructionCoresToOwnSpirit" } // 破壊時：selfが破壊直前に置いていたコア数（coresAtDestruction）ぶんを、持ち主のリザーブから自分の実効BP最大のスピリットへ移す（destroySpiritがリザーブへ移した分の付け替え。対象がいなければリザーブに残る。対象選択の決定的簡略化。盾精ラングリーズ）
    | { type: "levelOverrideTarget"; level: number; colorFilter?: Color; requireLevelExists?: boolean } // 対象（targetInstanceId）のlevelOverrideThisTurnをlevelに設定する（このターンの間。花の子リップ）。colorFilter/requireLevelExists指定時は、対象が指定色でない／そのレベルをカードに持たない場合は不発（BS04マッシブアップ＝Lv3を持つ青のスピリット）
    | { type: "ignoreUnblockableThisTurn" } // このターンの間、自分のスピリットは「ブロックされない」効果を無視してブロックできる（GameState.ignoreUnblockableThisTurn。BS04レッドウォール）
    | { type: "opponentCoresToTrash"; count: number; reserveAll?: true } // reserveAll指定時はcountを無視し、相手のリザーブにあるコア**すべて**をトラッシュへ置く（スピリット上のコアには触れない。BS09-017蛇凰神バァラルLv3）。// 相手のリザーブ→相手スピリット上の順にコアcount個を相手のトラッシュへ置く（BS04氷の女神フリッグ）
    | { type: "destroyerCoresToTrash" } // targetInstanceId（fieldEvent.byOpponentSpiritEffectOnly が渡す「自分を破壊した相手のスピリット」）上のコアすべてを、その持ち主のトラッシュへ置く。
    // targetInstanceIdが見つからなければ不発（ログのみ）。BS10-012アントイーター/BS10-014闇騎士マリス
    | { type: "voidCoreToOwnByKeyword"; keyword?: Keyword; count: number; combinedFilter?: true } // ボイドからコアcount個ずつを、指定キーワードを持つ自分のスピリットすべての上に置く（BS04甲殻戦士ロングホーン＝神速）。// combinedFilter指定時は合体スピリット（instIsCombinedがtrue）に絞る。keywordと併用でき、keywordを省略すれば合体スピリットすべてが対象（BS10-087戦場に息づく命Lv2）
    | { type: "reviveLastDestroyedNexus"; coreCost?: number; costFrom?: "ownFieldOrReserve" } // costFrom:"ownFieldOrReserve" 指定時は、コストを self 上ではなく**自分のフィールド/リザーブ**のコアから払う（リザーブ優先。SD02-014 魔法監視塔Lv1＝コア1個をトラッシュへ） // self上のコアをコストぶん自分のトラッシュに置くことで、直近に破壊された自分のネクサス（GameState.lastDestroyedNexus）をトラッシュから自分のフィールドへ戻す（coreCost省略時はself上のコアすべて＝BS04戦闘獣ジャッカー。指定時はその数だけ支払う。コア不足なら不発。BS05ブロンズ・ゴレム＝1個）
    | { type: "negateLifeDamageFromTarget" } // 対象（targetInstanceId＝相手スピリット1体）のアタックでは、このターン自分のライフが減らない（CardInstance.lifeDamageNegatedFor。BS04ミストカーテン）
    | { type: "coreToOpponentTrashChoice"; count: number; includeReserve?: true; spiritsOnly?: true; chooserIsTarget?: true } // 相手のスピリット1体かネクサス1つを選び、コアcount個を相手のトラッシュへ置く（targetInstanceId省略時は候補を集めてpendingChoiceを要求し、指定時はその対象へ実行する。スピリットは維持コア割れで消滅、ネクサスは消滅させない。魔界侯爵コキュートス）。// spiritsOnly指定時は候補をスピリットだけに絞る（「相手のスピリット**上の**コア1個」の効果文にはネクサスが含まれない。BS08ダークスカルデーモンLv2）。// chooserIsTarget指定時は、**コアを取られる側（相手）が対象を選ぶ**（「**相手は**、相手のスピリット上のコア1個を〜置く」。解決は発生源の持ち主の効果として行う＝PendingChoice.actorPid。returnToDeckTop.chooserIsTargetと同型）
    | { type: "coreRemoveDistributed"; count: number; dest?: "void"; leaveAtLeast?: number; chooserIsTarget?: true } // 相手のスピリットから**合計count個**のコアを、1個ずつ対象を選びながら取り除く（coreRemoveが「1体からN個」なのに対し、こちらは「N個を何体かに配分」）。
    // 1個ぶんの実処理は coreRemove count:1 に委譲する（装甲・効果耐性・維持コア割れの消滅・leaveAtLeast の判定を1箇所に保つため）。
    // dest:"void" 指定時はリザーブでなくボイドへ。leaveAtLeast 指定時は、どの1体もその数を下回るところまでは取れない
    // （SD01-013 冥剣士ベリト「この効果で相手のスピリット上のコアを0個にはできない」＝leaveAtLeast:1。
    //  この制限は**その『』ブロックの中だけ**に効く。docs/design/CONJUNCTION.md「効果ブロック（『』）の範囲」）。
    // chooserIsTarget 指定時は、**コアを取られる側（相手）が対象を選ぶ**（「**相手は**、相手のスピリット上のコア3個を〜置く」。
    // 解決は発生源の持ち主の効果として行う＝PendingChoice.actorPid。exhaust.chooserIsTarget と同型。docs/design/CHOOSER_RULES.md）
    | { type: "destroyOnePerCost"; costs: number[] } // 指定コストそれぞれについて相手のスピリット1体ずつを破壊する
    // （SD02-010 轟剣士レーヴェン＝「コスト0/1/2/3/4の相手のスピリット1体ずつ」）。
    // コストごとに独立して選ぶ（同じ個体は二度選べない＝コストが一致する個体は1体につき1回）。
    // 対象がいないコストは飛ばす。interactiveTargets 時はコストごとに選択を出し、非対話では実効BP最大を自動選択
    | { type: "drawPerChosenFamily"; families: string[] } // families から1つを選び、その系統を持つ自分のスピリット1体につき1枚引く
    // （SD02-004 神獣ハクタク＝「想獣」か「獣頭」）。系統は付与も考慮する（spiritHasFamily）。
    // **発生源自身も数える**（効果文が「このスピリット以外の」と書いていない。SD02-015 と同じ扱い）。
    // interactiveTargets 時は kind:"option" で系統を選ばせ、非対話では**引ける枚数が多い方**を選ぶ決定的簡略化
    | { type: "chooseActionMode"; modes: { label: string; actions: EffectAction[] }[] } // 効果文の「〜する。**または**、〜する」。使用者が modes からどれか1つを選び、その actions を順に解決する
    // （SD01-033 ヴィクトリーファイア＝「BP3000以下の相手2体を破壊する。または、BP3000以下の相手1体と相手のネクサス1つを破壊する」）。
    // 選択肢は**常に全部出す**：破壊は「〜することで」ではないので、対象が足りなくても発揮でき、いる分だけ破壊する
    // （2026-08-16 ユーザー確認。docs/design/COST_MODEL.md の「コストではない」側）。
    // interactiveTargets が無い（テスト・自動解決）ときは modes の先頭を選ぶ決定的簡略化
    | { type: "battleCompareByLevel" } // 現在のバトル（state.battle）にフラグを立て、解決時にBPの代わりにLvを比較させる（バトル外は不発。エンジェルボイス）
    | { type: "battleCompareByCores" } // 現在のバトル（state.battle）にフラグを立て、解決時にBPの代わりにコアの数を比較させる（コア数が少ない方が破壊。同数ならお互い破壊＝battleCompareByLevelと同じ分岐に乗る。バトル外は不発。BS06イマジンフィールド）
    | { type: "revealDiscardRest" } // 公開ゾーン（GameState.revealedCards）に残っているカードをすべて持ち主のトラッシュへ置く（cards.jsonには書かない。revealAndSummonKeyword が選択待ちの queue に積み、**選んでもスキップしても**必ず後始末が走るようにする。BS05トランスマイグレーション）
    | { type: "revealReturnToDeck"; toTop?: true; placed?: number } // 公開ゾーン（GameState.revealedCards）の残りをデッキの下へ戻す。interactiveTargets 時は戻す順番を1枚ずつ選ばせる（スキップで残りを現在の順のまま戻す）。BS01-067 スワロウアイヴィー／BS03-142 サルベージ // toTop指定時はデッキの**上**へ戻す（先に選んだカードが上＝次に引くカード。BS06-107 セカンドサイト「好きな順番でデッキの上に戻す」） // placed は toTop の選択の再入をまたいで「すでに上へ戻した枚数」を持ち回る**内部専用フィールド**（cards.jsonには書かない）
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
    | { type: "tenshoResume"; dest: "trash" | "void"; stage: "afterTargetTrigger" | "afterEvent"; skipSubstitute?: true } // 【転召】の途中で**誘発が選択待ちを立てた**ときの再開専用（cards.jsonには書かない）。self に転召の対象スピリットが渡る。// 転召の手順は「コアを外す＋対象スピリットの効果発揮 → 対象の消滅 → 召喚時効果」で、**消滅は効果の発揮が解決しきってから**でなければならない（2026-08-13 ユーザー確認）。stage:"afterTargetTrigger"＝『転召の対象になったとき』の誘発の後（置換の判断から再開）、stage:"afterEvent"＝『転召が解決したとき』の誘発の後（コア処理と消滅だけ）
    | { type: "tenshoCoreDump"; dest: "trash" | "void" } // 【転召】のpendingChoice再開専用（cards.jsonには書かない）。targetInstanceIdで指定された自分のスピリットの上のコアすべてをdestへ（trash=持ち主のトラッシュ、void=消滅）。維持コア割れは既存の消滅処理（destroySpirit "deplete"）に委ねる
    | { type: "markNoRefreshTarget" } // 相手の疲労状態のスピリット1体を「回復できない」と指定する（発生源＝self に CardInstance.noRefreshTargetInstanceId として記録し、**self が疲労状態で持ち主のフィールドにいる間**だけ効く。PhaseManager のリフレッシュステップが isRefreshBlockedByMark で参照）。対象は実効BP最大の1体を自動選択する決定的簡略化（アタック宣言中に発火しうるため、ここで pendingChoice を立てない。BS02スクルディア）
    | { type: "payNegateDecide"; targetInstanceId: string; discardCount: number; sourceName: string; resume: EffectAction } // 「自分の手札1枚を破棄することで、その効果を受けない」（BS08竜騎集う円卓Lv2）の**確認専用**（cards.jsonには書かない）。守る側に「破棄する手札を選ぶ／スキップして効果を受ける」を聞き、答えを GameState.payNegateDecision に置いてから resume（元のアクション）を解決し直す。スキップでも resume を解決するので requestCardChoice の resolveOnSkip を立てる
    | { type: "tenshoSubstituteChoice"; dest: "trash" | "void" } // 【転召】置換（constraint "tenshoCoreSubstitute"）の任意発動の再開専用（cards.jsonには書かない）。self に渡された自分のスピリットについて、chosenOption が「疲労する」なら疲労してコアを維持し、それ以外なら通常どおり上のコアすべてをdestへ置く
    | { type: "revealAndSummonKeyword"; count: number; keyword: Keyword; returnToDeckBottomAtEndStep?: true } // 自分のデッキ上からcount枚を公開し、その中の**指定キーワードを静的に持つスピリットカード**1枚をコストを支払わず召喚する（維持コアはリザーブから。足りなければ不発）。召喚時効果は通常どおり発揮する（効果文に「発揮されない」の記載が無いため）。**【転召】は解決しない**（効果文の「【転召】を発揮したものとして」＝転召を済ませたものとして扱う。コアも失わず、犠牲になるスピリットも出ない。通常の効果による召喚では転召を必ず行う＝公式Q&A 2024-10-31 ので、この一文を持つカードだけが例外）。残った公開カードはすべてトラッシュへ破棄する。「〜できる」なので interactiveTargets 時は候補1枚でも選択（スキップ可）を出し、自動時はコスト最大の1枚を選ぶ決定的簡略化。returnToDeckBottomAtEndStep指定時は召喚した個体に CardInstance.returnToDeckBottomAtEndStep を立て、エンドステップで持ち主のデッキの下へ戻す（BS05トランスマイグレーション）
    | { type: "handMagicToTegamotoDraw"; placedSoFar?: number; awaitingSkip?: true } // 自分の手札にあるマジックカードを好きなだけ手元（PlayerState.tegamoto）に置き、置いた枚数ぶんデッキから引く（マジックブック）。
    // **置くのを全部済ませてからまとめてドローする**。1枚ごとにドローすると、引いたマジックカードをそのまま次に置けてデッキが尽きるまで回せてしまう（drawPerHandDiscard と同じ不具合。2026-08-10 修正）。
    // interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行し、スキップ（または手札のマジックが尽きた時点）でドローする。自動時は該当カードすべてを一括移動して同数ドロー（決定的簡略化）。
    // placedSoFar / awaitingSkip は解決の途中経過を持ち回る内部フィールドで、cards.json には書かない
    | { type: "revealHandMagicToTegamotoDraw" } // handMagicToTegamotoDrawの単発版：自分の手札にあるマジックカード1枚をオープンして手元に置き、1枚ドローする。手札にマジックカードが無ければ不発。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1回だけ発行。自動時は手札末尾（新しい方）の該当カード（決定的簡略化）。「〜することで」は任意コストのため、カード側でoptional:trueと併用する（BS06占いペンタン）
    | { type: "discardOpponentTegamotoDestroyPer" } // 相手の手元（tegamoto）にあるカードすべてを相手のトラッシュへ破棄し、その枚数を既存のdestroyアクション（count=枚数、maxBpなし=BP不問）へ委譲して相手スピリットを破壊する（interactive時の連続対象選択・装甲/免疫判定はdestroy側の経路をそのまま再利用）。相手の手元が0枚ならno-op。透明人間エクリア
    | { type: "coreToTrashAllByCost"; maxCost: number } // 相手のコストmaxCost以下のスピリットすべての上から、コア1個ずつを相手のトラッシュへ置く（範囲効果。装甲・マジック効果耐性・immuneToOpponentThisTurnは対象から除外。BS04風龍王フージャオス）
    | { type: "coreRemovePerHandDiscard" } // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき相手のスピリット1体（実効BP最大を自動選択、同一解決内で既に選んだ個体は除外して異なる個体へ広げる）のコアを1個、相手のトラッシュへ置く。interactiveTargets時はkind:"card"のcard choice（cardZone:"hand"、optional=スキップ可）を1枚ずつ繰り返し発行し、選ぶたび即座にコア除去を実行する（対象選択自体は毎回自動）。自動時は手札をすべて破棄し、破棄枚数ぶん一括でコア除去する（決定的簡略化）。王蛇ケツァルカトル／ダンスマカブル
    | { type: "drawPerHandDiscard"; discardedSoFar?: number; awaitingSkip?: true } // 自分の手札を好きなだけ破棄し、破棄したカード1枚につき自分がデッキから1枚ドローする（BS08堕天使ミカファール）。
    // **破棄をすべて済ませてからまとめてドローする**。1枚破棄するたびにドローすると、引いたカードをまた破棄できてデッキが尽きるまで回せてしまう（2026-08-10 に実対戦で発覚）。
    // discardedSoFar / awaitingSkip は解決の途中経過を持ち回るための内部フィールドで、cards.json には書かない（awaitingSkip は「スキップされて戻ってきた＝破棄終了」の目印）
    | { type: "bpBuffAllByBofuCount"; amountPer: number } // 自分のスピリットすべてを、それぞれが持つ【暴風】の実効指定数（静的keywordのcount。bofuCountBonusの加算を含む）×amountPerだけBP+（ターン終了時まで。【暴風】を持たない個体は対象外。bpBuffAllByArmorColorsの暴風版。BS08スナイピングブラスト）
    | { type: "bpBuffAllPer"; counter: EffectCounter; amountPer: number; filter?: TargetFilter } // カウント値×amountPerを、filter一致（省略時は絞り込みなし）の自分のスピリットすべてにBP+（ターン終了時まで。0ならログのみ。bpBuffPerの単体対象を「全体」に広げた版。BS08ダークパワー：filter.nameContains＝「ダーク」/「ブラック」・counter"ownExhausted"）
    | { type: "voidCoresAndMillByCost"; familyFilter: FamilyFilter } // familyFilter一致（配列＝OR）の自分のスピリット1体（interactiveTargets時はpendingChoice、自動時はコスト最大を選ぶ＝mill枚数を最大化する決定的簡略化）のコアすべてをボイドに置き、そのスピリットのコストと同じ枚数だけ相手のデッキを上からトラッシュへ送る（該当スピリットがいなければ不発。BS05マジックスパナ）
    | { type: "lendSelfThisTurn" } // このマジック自身を、このターンの間だけ自分の仮想発生源（PlayerState.turnVirtualInstances）として場に置いたものとして扱う。
    // 同じカードの他の効果エントリ（levels:null必須）が effectSources() 経由で継続効果として一斉に有効になる（TURN_EFFECT_SOURCES.md §3。BS05リアニメイト）
    | { type: "exhaustSelfThenLendThisTurn" } // 「このスピリットを疲労させることで、このターンの間〜」（BS06ヒナペンタン）。発生源自身を疲労させてから lendSelfThisTurn と同じ貸与を行う。
    // **1つのアクションにまとめてあるのが要点**：疲労（コスト）と貸与（効果）を別々の optional エントリに分けると、確認が2回に割れて「疲労だけして効果が出ない」が起きる（実際に起きていた。2026-08-10 修正）。
    // 既に疲労している場合は支払えないので不発（ログのみ）
    | { type: "lendSelfThisBattle" } // lendSelfThisTurn の「このバトルの間」版。積む先が PlayerState.battleVirtualInstances になるだけで、貸与の仕組みは同一（effectSources が両方を混ぜる／instanceIdの "virtual-" 接頭辞も共通）。
    // clearBattle でリセットされるため、同じターンの2回目のバトルには持ち越さない。効果テキストが「このバトルの間」のマジックはこちらを使うこと（BS07ダーティフィスト／ニードルショット／ブルームフルート）
    | { type: "coreRemoveMulti"; targets: number; count: number; dest?: "trash" | "void"; costFilter?: { max?: number; min?: number }; allTargets?: true; keywordExclude?: Keyword } // keywordExclude指定時は、指定キーワードを**持たない**相手のスピリットのみが対象（静的・一時付与・継続付与を考慮。BS08闇帝竜騎サブナ・ルーク＝【転召】を持たない相手すべて）。// allTargets指定時は targets を無視し、条件を満たす相手スピリット**すべて**が対象（範囲効果なので対象選択を挟まない。BS07腐りゆく湖沼）。// 相手スピリットtargets体（costFilter一致・実効BP上位から自動選択で重複なく選ぶ。プレイヤー選択の簡略化。interactiveTargets時は1体ずつ選択→queueで残数を繰り越す）それぞれのコアをcount個ずつ、dest指定先へ（省略時はリザーブ、trash=持ち主のトラッシュ、void=消滅）。装甲/マジック効果耐性は対象ごとに判定して除外（BS05ガストラス：コスト1以下2体からコア2個ずつをトラッシュへ）
    | { type: "summonFromTrashFree"; costFilter?: { max?: number; min?: number }; colorFilter?: Color; keywordFilter?: Keyword; costBudget?: number; familyFilter?: FamilyFilter; nameIncludes?: string; payCost?: true; whileCombinedFilter?: true }
    // whileCombinedFilter指定時は【合体時】効果（`effects`のいずれかがwhileCombined:trueを持つ）を持つスピリットカードのみ対象（カード静的に判定。BS10-084虚実の口Lv2＝「【合体時】効果を持つスピリットカード」） // payCost指定時は**通常の召喚コストを支払う**（効果文に「コストを支払わずに」が無いカード。BS07常闇の聖堂＝「自分のフィールドのコアをコストとして使うことで〜召喚できる」。2026-08-24 ユーザー確認：コストは通常どおり必要で、支払い元にフィールドのコアも使える）。支払い元はリザーブ＋フィールドのコア（paySources）で、払えないカードは候補にも出さない。summonFromHandFree.payCost と同型 // nameIncludes指定時はカード名にこの文字列を含むもののみ（カード静的な名前で判定＝トラッシュのカードが対象のため。BS08アンドレアルファス＝「勇者」）。// familyFilter指定時はその系統（配列＝OR。カード静的なfamilyで判定＝トラッシュのカードが対象のため）を持つカードのみ（BS07常闇の聖堂＝「夜族」）。// 自分のトラッシュにあるcolorFilter色（省略時は色不問）・costFilter範囲のスピリットカード1枚（コスト最大、同コストは末尾＝新しい方から自動選択。プレイヤー選択の簡略化）を、コストを支払わずに召喚する。維持コアはリザーブから置き、不足なら不発（ログのみ）。この効果で召喚されたスピリットのonSummon効果は発揮されない（BS05妖狐キュービック：コスト5/6/7の紫）。keywordFilter指定時はこのキーワードエントリを静的に持つカードのみ対象（hasKeywordで判定）。costBudget指定時はcostFilterを省略でき、コスト合計がbudget以下になる範囲で複数枚を召喚する（コスト最大から貪欲に選ぶ決定的簡略化。維持コアがリザーブから払えなくなった時点で打ち切り。BS06-X22魔界七将ベルゼビート：【呪撃】持ちをコスト合計13まで）
    | { type: "nexusCoresToTrash"; side: "opponent" | "both" } // 指定側（相手/両陣営）のネクサスすべての上に置いてあるコアすべてを、各持ち主のトラッシュへ置く。ネクサスはコア0になっても消滅しない（BS03フォールダウン＝both）
    | { type: "drawUpTo"; size: number } // 自分の手札がsize枚になるまでデッキから引く（既にsize枚以上ならno-op。デッキ切れ判定はdrawへ委譲。BS03フォースドロー）
    | { type: "trashSpiritsToDeckBottom"; count: number } // 自分のトラッシュにあるスピリットカードを末尾（新しい方）から最大count枚、その順で自分のデッキの下に戻す（プレイヤー選択・順序指定の決定的簡略化。count枚未満しかなければ可能な分だけ。BS04トリックプランク）
    | { type: "voidCoresToNexusLevel"; level: number } // 自分のネクサス1つがlevelになるように、不足分のコアをボイドから置く（対象決定はvoidCoreToOwnNexusesのsingle分岐と同じ優先順＝targetInstanceId→interactiveTargets時はrequestChoice→自動時はコア数最少。既にそのレベル以上、またはそのレベルを持たないネクサスはno-op。BS04フルアッド＝Lv2）
    | { type: "opponentNexusOrReserveCoreToTrash"; count: number } // 相手のネクサス（コア数最多のものを自動選択）にコアがあればそこから、無ければ相手のリザーブから、count個を相手のトラッシュへ（どちらもコアがなければno-op。ネクサスのコアが減ってレベルが下がっても消滅はしない。BS02エナジードレイン）
    | { type: "opponentCoresToVoidByTotal"; tiers: { minTotal: number; count: number }[]; remaining?: number } // 相手のフィールド（スピリット+ネクサス）+トラッシュ+リザーブのコア合計を数え、条件を満たす中で最大の minTotal の段に応じた個数をボイドへ置く。**効果文の主語は「相手は」なので、interactiveTargets 時は取り先を1個ずつ相手に選ばせる**（kind:"option"。2026-08-17 ユーザー確認。CHOOSER_RULES.md §1.6）。remaining は選択式の再入用の内部フィールド（cards.jsonには書かない。残り個数を持ち回る）。選択者は requestChoice の chooserPid で相手に差し替えるため、解決の主体（装甲・効果耐性の判定基準）は actorPid によって発生源の持ち主のまま保たれる。非対話時は従来どおりリザーブ→トラッシュ→フィールド（コアの多い個体から）の決定的簡略化（BS02ブラッディレイン）
    | { type: "moveCoresLeavingOne"; anySide?: true; selfTarget?: true; allowNexusDest?: true } // 対象スピリット上のコアを1個だけ残し、それ以外を同じフィールドの別のスピリット（フィールドの先頭側＝決定的簡略化）へ移す。移動先がいなければ不発（BS01チェンジングコア）。selfTarget指定時は対象を発生源自身に固定し、allowNexusDest指定時は移し先のスピリットがいなければ自分のネクサス（先頭側）へ移す（BS01要塞龍ギガLv2＝「このスピリット上のコアを他のスピリットかネクサスに」）
    | { type: "swapOpponentCores"; choosing?: true; firstChosen?: string } // 効果文が「相手のスピリット2体を**指定する**」なので、interactiveTargets では2体とも持ち主が選ぶ（2026-08-24。非対話は従来どおり実効BP上位2体）。choosing / firstChosen は選択の進み具合を持ち回る内部フィールド（cards.jsonには書かない）。choosing が無い targetInstanceId は誘発が渡すイベント対象なので取り違えない。// 相手のスピリット2体の上のコアをすべて入れ替える。相手のスピリットが2体未満、またはコア数が同じなら不発。入れ替えの結果、維持コア（Lv1）を下回った側は消滅する（BS04天使スローンLv2-3）
    | { type: "costOwnAllCoresThenEnemyCoresToReserve"; minBp: number; count: number } // 実効BPがminBp以上の自分のスピリット1体（BP最大）の上のコアすべてをボイドへ置くことをコストに、相手のスピリット上のコアを合計count個（コアの多い個体から）相手のリザーブへ置く。コストを払えなければ不発（BS02セブンスクリムゾン）
    | { type: "returnBothSidesToDeckBottom"; count: number } // 自分のスピリットcount体（コスト最小から）をデッキの下へ戻すことで、相手のスピリットcount体（実効BP上位から）もデッキの下へ戻す。自分がcount体戻せなければ不発（BS04グラシアルブレス）
    | { type: "sacrificeOwnNexusesThenEnemyDestroysOwn"; remaining?: number } // 自分のネクサスをすべて破壊し（「好きなだけ」の決定的簡略化）、破壊できた数だけ相手が相手自身のスピリットを破壊する（BS04タイダルタイド）。// 効果文が「**相手は**、〜相手のスピリット1体を破壊する」なので**破壊する側（相手）が1体ずつ選ぶ**（CHOOSER_RULES.md）。// remaining は「あと何体破壊するか」を選択の再入をまたいで持ち回る**内部専用フィールド**（cards.jsonには書かない。ネクサスの破壊数は再入時に数え直せないため）
    | { type: "bothSidesCoreToVoid"; count: number } // 両プレイヤーが各自のスピリット+ネクサスから、コアの多い個体から順に合計count個をボイドへ置く（1体で足りなければ次にコアが多い個体へ繰り越す。維持コア割れの消滅処理はスピリットのみ＝ネクサスは消滅しない。BS04インフェルノアイズ）
    | { type: "blockTriggersAsAttackAllThisTurn" } // このターンの間、両陣営のスピリットすべての『このスピリットのブロック時』効果を『このスピリットのアタック時』に発揮させる（ブロック時には発揮されなくなる＝移し替え。attackTriggersAsBlockThisTurnの逆方向・全体版。GameState.blockTriggersAsAttackThisTurnをfireTriggerが参照。BS01アタックシフト）
    | { type: "voidCoreToOwnTrash"; count: number } // ボイドからコアcount個を直接、持ち主のトラッシュに置く（returnNexusToHandのvoidCoreToOwnTrashIfOpponentと同じ処理をEffectModules.voidCoreToOwnTrashへ共通化。BS03ブリッツ＝【粉砕】持ちのアタック時にeffectGrantで継続付与）
    | { type: "costBuffThisTurn"; amount: number } // 自分のスピリット1体（targetInstanceId優先、フォールバックはpickOwnKeywordTargetと同じ＝バトル中の自分スピリット→自分フィールド先頭）のコストを、このターンの間 amount だけ増減する（CardInstance.tempCostDelta、ターン終了でリセット。shared/rules.ts の instCostDelta → instBaseCost が読むので、コストを見る判定すべてに効く）。**置き換えであって追加ではない**：元のコストは残らないので「コスト3以下を破壊」は+3後のコストで判定される（BS08グロウアップ）。今後のブレイヴの合体コスト加算も instCostDelta に項を足す形で乗せること
    | { type: "colorChoiceLendThisTurn"; sourceCardId?: string } // 全色からの1色choiceを経て、選ばれた色を仮想発生源のlentChoiceColorに載せてこのターンの間貸し出す（kind:"levelAs" target:"allSpiritsByChosenColor"のlentOnlyエントリが読む。familyGrantのfamilyFromChoiceと同形。マジックのselfは常にnullで選択再開時にresolveActionのsourceCardId引数が失われるため、sourceCardIdをaction自身に載せて2段階目へ引き継ぐ内部専用フィールド（cards.jsonには{"type":"colorChoiceLendThisTurn"}のみを書く）。BS02-111スピリットイリュージョン）
    | { type: "refreshAllByKeyword"; keyword: Keyword; side?: "own"; keywordCount?: number } // keywordCount指定時は、そのキーワードエントリの count が一致するものだけを対象にする（【暴風：1】と【暴風：2】を区別する。静的なkeywordエントリのみ見るため、付与された暴風は対象外＝簡略化。BS07突風侯爵コカトリーフLv2）。// 指定キーワードを持つスピリットすべて（修飾なし＝両陣営が対象）を回復させる。refreshAllByCostと同様cantAttackThisTurnは付与しない（BS03-X09蛮騎士ハーキュリー：【神速】持ちすべて）。side:"own"指定時は自分のスピリットのみ（BS06名誉ある御前試合Lv2＝「自分のスピリットすべて」）
    | { type: "refreshAllOwnByFilter"; filter: TargetFilter } // 自分の疲労スピリットのうちfilterに一致するものすべてを回復させる（refreshAllByKeywordと同様cantAttackThisTurnは付与しない）。BS10-088天貫く塔の城Lv2：「効果の記述を持たない自分のスピリットすべて」＝filter.vanilla:true
    | { type: "millThenDestroySameCost" } // 自分のデッキを上から1枚破棄し、**そのカードと同じコスト**の相手のスピリットすべてを破壊する（デッキが0枚なら不発。BS09-084ドラゴニックハウル）
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
    | { type: "destroyByBpBudget"; budget?: number; budgetFromSelfBp?: true; choosing?: true; chosenIds?: string[] } // 相手スピリットを、**実効BP合計**がbudgetを超えない範囲で好きなだけ破壊する（BS07剣龍皇エクス・キャリバス：BP合計6000まで）。budgetFromSelfBp指定時はbudgetを無視し、selfの実効BPを予算にする（BS08太陽石の神殿：破壊したスピリット＝勝利したアタッカーのBPまで）。// choosing / chosenIds は**トグル選択の途中経過を持ち回る内部専用フィールド**（cards.jsonには書かない）。destroyByCostBudget と同じ仕組み（budgetToggleDestroy）
    | { type: "destroyPer"; counter: EffectCounter; filter?: TargetFilter } // カウント値の体数ぶん、相手スピリットを1体ずつ実効BP最大から繰り返し破壊する（filterで絞り込み。0ならログのみ。BS08魔帝龍騎ダーク・クリムゾン＝系統「龍帝」を持つ自分のスピリット1体につき）
    | { type: "destroyDownToOwnCount" } // 相手のスピリットを、その数が自分のフィールドのスピリット数と同じになるまで破壊する（相手のほうが少ない/同数なら不発。BS08ジャッジメントフレア）。// 効果文が「**相手は**、相手のスピリットを〜破壊する」なので**破壊する側（相手）が1体ずつ選ぶ**（CHOOSER_RULES.md。解決は発生源の持ち主の効果＝PendingChoice.actorPid）。非対話では相手が選ぶであろう実効BP最小から破壊する。残り体数は毎回「相手の体数−自分の体数」で数え直すので、action に持ち回る内部フィールドは要らない
    | { type: "destroyByCostBudget"; budget: number; choosing?: true; chosenIds?: string[] } // 相手スピリットを、コスト合計がbudgetを超えない範囲で好きなだけ破壊する。// 対話モードでは**トグル式で選ばせる**（クリックで選択／もう一度クリックで解除。合計は prompt に出し、「これで破壊する」で確定。2026-08-24 ユーザー確定）。choosing / chosenIds はその途中経過を持ち回る内部専用フィールドで、cards.jsonには書かない。非対話（テスト・自動解決）は残り予算内でコスト最大から貪欲に選ぶ（同コストは実効BP最大）。BS05-X19聖皇ジークフリーデン：[龍皇ジークフリード]/[要塞皇オーディーン]で【転召】したときの上限8への切替は、転召対象の記録が必要になるため簡略化しbudget=5固定とする
    | { type: "selfBuffByExhaustFamily"; familyFilter: FamilyFilter; sacrificeChosen?: true } // familyFilter一致・self以外・回復状態の自分のスピリット1体（候補2体以上なら interactiveTargets でプレイヤーが選ぶ。非対話は実効BP最大＝バフ量を最大化する簡略化）を疲労させ、このスピリット自身をその実効BP分だけBP+する（ターン終了時まで。該当なしはno-op。BS02-X07巨神機トール）。// sacrificeChosen は**疲労させるスピリットを選び終えて再入したこと**を示す内部フラグ（cards.jsonには書かない）。これが無い targetInstanceId は誘発が渡すイベント対象なので、犠牲と取り違えないためのもの。COST_MODEL.md §2
    | { type: "refreshSelfByDestroyFamily"; familyFilter: FamilyFilter; sacrificeChosen?: true } // familyFilter一致・self以外の自分のスピリット1体（候補2体以上なら interactiveTargets でプレイヤーが選ぶ。非対話は実効BP最小＝犠牲を最小化する簡略化）を破壊し、このスピリット自身を回復させる（該当なしはno-op。BS02-X07巨神機トール）。// sacrificeChosen は**破壊するスピリットを選び終えて再入したこと**を示す内部フラグ（cards.jsonには書かない）。これが無い targetInstanceId は誘発が渡すイベント対象なので、犠牲と取り違えないためのもの。COST_MODEL.md §2
    | { type: "refreshSelfByReturnToDeckTopName"; nameIncludes: string; sacrificeChosen?: true } // nameIncludes一致・self以外の自分のスピリット1体（候補2体以上なら interactiveTargets でプレイヤーが選ぶ。非対話は実効BP最小＝犠牲を最小化する簡略化）をデッキの一番上に戻し、このスピリット自身を回復させる（refreshSelfByDestroyFamilyの「破壊」を「デッキの上に戻す」に差し替えた版。該当なしはno-op。BS08勇者フェニックスペンタン）。// sacrificeChosen は**デッキの上に戻すスピリットを選び終えて再入したこと**を示す内部フラグ（cards.jsonには書かない）。これが無い targetInstanceId は誘発が渡すイベント対象なので、犠牲と取り違えないためのもの。COST_MODEL.md §2
    | { type: "disableOwnArmorThisTurn" } // このターンの間、発生源の持ち主のスピリットの【装甲】を働かなくする（SD01-040 アーマーパージ）
    | { type: "capLifeDamageThisTurn"; max: number } // このターンの間、発生源の持ち主のライフは1回のアタックで max 個までしか減らない（GameState.turnConstraints に lifeDamageMaxForPid を積む。SD01-039 ブリザードウォール＝1しか減らない）
    | { type: "lifeImmuneThisTurn" } // このターンの間、発生源の持ち主のライフはあらゆる原因（アタックによる減少・lifeCrushアクションによる効果的な減少の両方）で減らない（GameState.turnConstraints に lifeImmuneForPid を積む。capLifeDamageThisTurnと違いアタック限定ではない全面ロック。negateLifeDamageFromTarget＝対象を限る版とは別物。2026-08-27 ユーザー確認。BS10-093時刻む花時計）
    | { type: "protectLifeByCostThisTurn"; costSacrificeChosen?: true; maxCost: number; costExhaustFamily?: FamilyFilter } // このターンの間、コストがmaxCost以下のスピリットのアタックでは**発生源の持ち主のライフだけ**が減らされない（GameState.turnConstraints に片側限定の制約を積む。両陣営に効く globalConstraint:"noLifeDamageByCost" の片側版）。costExhaustFamily指定時は、持ち主のフィールドの指定系統（配列＝OR）の回復状態スピリット1体（実効BP最小＝犠牲を最小化する簡略化）を疲労させることがコストで、該当がなければ不発（BS07秘密の花園Lv2＝「楽族」）
    | { type: "forceAttackThisTurn"; side: "opponent"; maxCost?: number; count?: number; excludeCombined?: true } // このターンの間、相手のスピリットに「可能ならば必ずアタックする」を課す（GameState.turnConstraints に mustAttack を積む）。maxCost指定時はコストがこれ以下のものすべて（BS08アンブッシュブロッカー：コスト3以下）。excludeCombined指定時は候補から合体スピリットを除く（BS10-X04月光龍ストライク・ジークヴルム：合体していない相手のスピリット1体を指定する）。count指定時は体数を絞って指定する（targetInstanceId優先、interactiveTargets時はpendingChoice、自動時は実効BP最大。BS08獣機合神セイ・ドリガン：相手のスピリット1体を指定）。**簡略化**：原文の「このステップの最初に」という順序指定は持たず、そのターン中アタックが強制されるだけ
    | { type: "grantCanBlockWhileRestedThisTurn"; familyFilter?: FamilyFilter } // このターンの間、自分のスピリット（familyFilter指定時はその系統＝配列OR）すべてに「疲労状態でもブロックできる」を与える（GameState.turnConstraints。constraint:"canBlockWhileRested"のターン付与版。BS08インフィニティシールド：機獣/武装）
    | { type: "coreDrainToLowerLevel" } // 相手のスピリット1体（targetInstanceId優先、非対話時は実効BP最大）の上のコアを、1つ下のLvに必要なコア数と同じになるまで相手のトラッシュへ置く。Lv1のスピリット（1つ下のLvが無い）は対象にしても何も起きない。装甲・マジック効果耐性はcoreRemoveと同じ経路で尊重する（BS06-096レベルドレイン）
    | { type: "grantEffectToTargetThisTurn"; trigger: TriggerEvent; action: EffectAction; battleRole?: "attacker" | "blocker"; filter?: TargetFilter } // 自分のスピリット1体（targetInstanceId優先。フォールバックはfilter一致の中から実効BP最大。interactiveTargets時は複数候補ならrequestChoice）に、このターンの間だけ指定の誘発効果を直接付与する（CardInstance.tempGrantedTriggers、ターン終了でリセット。fireTriggerが静的effectsと同様に走査する。effectGrantと違い対象は1体・仮想発生源を要しない。BS08メテオストーム＝カード名に「ヴルム」と入っている自分のスピリット1体に『このスピリットのアタック時』効果を付与）
    | { type: "revealAndSummonAllByFamily"; count: number; familyFilter: FamilyFilter } // 自分のデッキ上からcount枚を公開し、その中の指定系統（配列＝OR）を持つスピリットカード**すべて**を、コストを支払わず、【転召】させずに召喚する（維持コアが足りない分は召喚できずトラッシュへ。revealAndSummonKeywordと異なり任意選択を挟まない範囲効果）。この効果で召喚されたスピリットの『召喚時』効果は発揮されない（revealAndSummonKeywordは発揮する点と対照的）。系統不一致・召喚できなかったカードはすべてトラッシュへ破棄する（BS08魔帝龍騎ダーク・クリムゾン：上7枚から系統「龍帝」/「竜騎」すべて）
    | { type: "millUntilFamilyToHand"; family: FamilyFilter; maxCount: number } // 自分のデッキを上からmaxCount枚を上限に、指定系統（配列＝OR。カード静的なfamilyで判定）を持つスピリットカードが出るまでトラッシュへ破棄し、出ればそのカード1枚を手札に戻す（出ないまま上限/デッキ切れに達したら手札には戻らない。BS08冥将アマイモン）
    | { type: "costOwnSpiritCoresToTrashThenOpponent"; count: number; phase?: "own" | "opp"; remaining?: number } // phase/remaining は選択の再入をまたいで「いまどちら側のコアを何個置くところか」を持ち回る**内部専用フィールド**（cards.jsonには書かない）。// コアを取り除くスピリットは1個ずつ選ぶ：自分側は支払う本人が選び（COST_MODEL.md §2）、相手側は効果文が「**相手は**〜置く」なので相手が選ぶ（CHOOSER_RULES.md）。非対話ではどちらもコアの多い個体から（従来どおり）。// 自分のフィールドのスピリット上のコア合計がcount未満なら不発（ログのみ）。足りれば、自分のスピリットからコアの多い個体順に合計count個を自分のトラッシュへ置き（bothSidesCoreToTrashと同じ選び方）、続けて同じ処理を相手のスピリットに対しても行う（相手は必ず支払う。維持コア割れは消滅処理。BS08マインドブレイク：5個）

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
    | "restedEnemyNexuses" // 持ち主から見た相手フィールドの疲労状態のネクサス数（BS09-080エグゾーストネクサス）
    | "ownRestedNexuses" // 自分の疲労状態のネクサス数（【強襲】がネクサスを疲労させるため。BS07ネクサスアタック）
    | "allNexuses" // 両者のネクサス数の合計
    | "ownExhausted" // 自分の疲労スピリット数
    | "allExhausted" // 両陣営の疲労スピリット数の合計（ownExhausted + exhaustedEnemies。BS05大甲帝デスタウロス）
    | "selfCoresAtDestruction" // 破壊時点でこのスピリット上に置かれていたコア数（destroySpiritが破壊直前に記録。漆黒鳥ヤタグロス）
    | "lastBattleDestroyedCores" // 直前のバトル解決でBP比較により破壊されたブロッカーが持っていたコア数（GameEngine.resolveBattleが記録、次のバトル解決の冒頭でリセット。魔界七将デストロード）
    | "opponentTrashCores" // 相手のトラッシュに置かれているコア数（PlayerState.trashCores。BS04吸血鬼ダンピール）
    | "selfLevel" // このスピリット（self）自身の現在のLv（selfがnullなら0。BS09-018暗空の勇者皇ザンバ：「このスピリットのLvと同じ個数」）
    | "selfSymbols" // このスピリット（self）自身が持つシンボル数（instanceSymbolCount。selfがnullなら0。BS05碧緑の竜使いグリューン：「このスピリットのシンボルと同じ数」）
    | "targetSameFamilyOwn" // 対象スピリットと系統を1つ以上共有する自分のスピリットの数（**対象自身も数える**。
    // 効果文が「このスピリット以外の」と書いていないため。SD02-015 フレンドリーパワー）。
    // targetSymbols と同じく bpBuffPer ハンドラが対象選択後に個別計算するので、countEffectCounter には来ない
    | "targetSymbols" // **対象スピリット自身**（bpBuffPerが解決するtargetInstanceId等）が持つシンボル数。selfSymbolsと異なりself（発生源）ではなく対象基準。マジックはself=nullのためselfSymbolsが使えない場合に使う（bpBuffPerハンドラが対象選択後に個別計算する。BS06サベージパワー）
    | "lastFunsaiTotal" // 直前の【粉砕】で破棄した総枚数（GameState.lastFunsai。次のアタック宣言でリセット。BS03巨人王ランドルフ）
    | "lastFunsaiSpirits" // 直前の【粉砕】で破棄したカードのうちスピリットカードの枚数（GameState.lastFunsai。BS04二刀流のアムブローズ）
    | { ownFamily: string | string[] } // 配列＝いずれかの系統でOR（BS10-X02双魚賊神ピスケガレオン：「光導」/「星魂」）
    | { ownNameIncludes: string }
    | { anyNameIncludes: string } // 両陣営のフィールドでカード名にこの文字列を含むスピリット数（ownNameIncludesの両陣営版。BS06アルカナナイト・ヘクス：修飾なしの「スピリット」）
    | { ownColor: Color } // 自分のフィールドの指定色スピリット数
    | { ownColorSymbols: Color } // 自分のフィールドの指定色シンボルの合計数（BS04機動要塞キャッスル・ゴレム＝青シンボル）。**スピリットとネクサスの両方**を数える（2026-08-20 修正。以前はスピリットだけを見ていた）。数え方は shared/rules.countSymbols に一本化してあり、symbolFix による固定・バウンス待機の除外・「◯色としても扱う」で得た色も見る
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
    | "ownSeimeiLifeCharged" // 持ち主の【聖命】の効果でライフにコアが置かれたとき（lifeCharge の from:"void" が、【聖命】持ちの発生源から解決されたときだけ発火。BS09-064天駆ける方舟）
    | "ownLifeDamaged" // 相手によって自分のライフが減らされたとき
    | "ownSpiritDestroyed" // 自分のスピリットが破壊されたとき
    | "anySpiritAttacked" // 両陣営どちらかのスピリットがアタックを宣言したとき（self はアタックしたスピリット。魔帝の墓標Lv2）
    | "opponentDrew" // 持ち主から見て相手がデッキからカードをドローしたとき（GameState.draw から発火。シダフクロウ）
    | "anyNexusDestroyed" // 自分か相手を問わず、フィールドのネクサスが破壊されたとき発火（バウンス returnNexusToHand は対象外）
    | "ownBofuExhausted" // 自分のスピリットの【暴風】の効果で相手のスピリットが疲労したとき、その**【暴風】の持ち主**のフィールドから発火する（疲労1体につき1回）。exhaustSpirit が cause から発火させる（BS06ミストラルコア）
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
    locks: ("attackStep" | "deckMill" | "lifeChargeFromVoidOrReserve")[] // 何を止めるか。**両陣営に効く**
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
    | { type: "immuneToOpponentEffects"; against?: "spirit" } // このスピリットは、相手のスピリット/マジックの効果を受けない（untargetableByOpponentと異なり範囲効果にも有効。ネクサスの効果・自分の効果は通る。BS04ワルキューレ・ヒルド）。against:"spirit"指定時は相手の**スピリットの**効果のみ（マジックは通る。BS10-091シャボンの湖畔Lv2＝「相手のスピリットの効果を受けない」）
    | { type: "canDirectAttack"; targetFilter: "rested" | "singleCore" | "recovered" | "any"; targetMinBp?: number; targetMinCost?: number } // targetMinCost指定時は相手スピリットのコストがこれ以上のもののみ指定できる（instMatchesCostFilterで判定＝道化師クランの付与コストも見る。BS05天焦がす大聖火Lv2：コスト5以上） // 相手スピリット1体を指定してアタックできる（targetFilter: rested=疲労状態のみ、singleCore=コア1個のみ、recovered=回復状態のみ、any=状態条件なし。イリュージョナ／牛霊スモゥグ／オルカリア）。targetMinBp指定時は相手スピリットの実効BPがこれ以上のものだけ指定できる（BS05シンクロニシティ：BP4000以上。BP条件だけで絞りたい場合はtargetFilter:"any"と組み合わせる）
    | { type: "cantAttack"; unlessOpponentHasColorSpirit?: Color } // このスピリットはアタックできない（カイザレオン大帝Lv1）。unlessOpponentHasColorSpirit 指定時は「持ち主から見た相手のフィールドに指定色のスピリットがいない間」だけ有効（activeConstraints が判定して外す。BS04鎧装獣ヘイズ・ルーン＝赤）
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
    | { type: "tenshoCoreSubstitute"; mode?: "rest" | "returnToHand" } // このスピリットが【転召】の対象になったとき、疲労していなければ、疲労することでコアすべてを指定場所に置いたものとして扱う（実際にはコアを失わない代替。dumpAllCoresTenshoが判定する。BS05の竜使い6枚）。
    // mode:"returnToHand" 指定時は、疲労の代わりに**このスピリットを手札に戻す**ことで同じ扱いにする
    // （SD02-009 獣将軍クジャルタ）。手札に戻る＝通常のバウンスなので**上のコアはリザーブへ行く**
    // （「指定場所に置いたものとして扱う」は【転召】の条件を満たすための扱いで、実際に置くわけではない。
    //  2026-08-16 ユーザー確認）。疲労版と違い、既に疲労していても使える。「疲労させることで」は**任意**なので、interactiveTargets時は「疲労する／コアを置く」の選択を出す（自動時は疲労を選ぶ決定的簡略化）
    // levelAtMostAttacker：ブロッカーのcurrentLevelがアタッカーのcurrentLevel以下ならブロックできない
    // （costAtMostAttacker の Lv 版。SD02-012 天の城門Lv2＝「同じLv以下の相手のスピリットからブロックされない」）
    | { type: "canBlockWhileRested"; targetMaxCost?: number; targetKeywordExclude?: Keyword } // このスピリットは疲労状態でもブロックできる（shared/block.canBlockが判定）。targetMaxCost指定時はアタッカーのコストがこれ以下のときのみ（BS06計画された場外乱闘Lv1-2：コスト1以下）。targetKeywordExclude指定時はアタッカーがそのキーワードを持たないときのみ（spiritHasKeyword判定＝一時付与も見る。BS08一角魚モノケロック：【転召】を持たない相手のスピリット）

// フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
// kind: "constraint" は「発生源自身」への制約だが、こちらは発生源の持ち主に関係なく
// 両陣営のスピリット／ネクサスすべてに効く（RuleValidator.hasGlobalConstraint 経由で参照）。
export type GlobalConstraintDef =
    | { type: "singleCoreCantAct" } // コア1個しか置いていないスピリットは、アタックとブロックができない（両陣営。魔帝の墓標）
    | { type: "singleCoreCantAttack" } // コア1個しか置いていないスピリットは、アタックができない（ブロックは可能。singleCoreCantActのアタック限定版。両陣営。BS08赤き砂の座）
    | { type: "noLifeDamageByCost"; maxCost?: number; costs?: number[]; keywordExclude?: Keyword; maxBp?: number } // maxBp指定時は実効BPがこれ以下のスピリットのアタックで判定する（コストでなくBPで縛る形。BS09-031守護巨獣ガラパーゾ＝BP3000以下）。// コストがmaxCost以下のスピリットのアタックでは、お互いのライフは減らされない（両陣営。BS07の「勇傑」各色に共通）。costs指定時はmaxCostの代わりに**コスト完全一致**（配列＝いずれかに一致。instAllCostsのいずれかが含まれればよい。BS08守護機獣スノパルド：コスト3/4）。keywordExclude指定時は、アタッカーがそのキーワードを持つときは保護しない（spiritHasKeyword判定。同カード：【転召】を持たない）
    | { type: "opponentNexusesUnexhaustable"; phase?: Phase } // 発生源の持ち主から見た**相手**のネクサスは疲労させられない（【強襲】の疲労元や、ネクサスを疲労させる支払いを止める）。phase指定時はそのステップ中のみ（BS09-063花の宮殿Lv2＝『お互いのアタックステップ』）
    | { type: "noRefreshByNexusOrMagic" } // 両陣営のスピリットは、ネクサス/マジックの効果では回復しない（スピリットの効果とリフレッシュステップは通る。BS09-047鮫人サンゴジョー）
    | { type: "nexusIndestructible" } // すべてのネクサスは破壊されない（両陣営。要塞皇オーディーン）
    | { type: "ownNexusIndestructible"; colors?: Color[]; sourceColors?: Color[]; sourceTypes?: CardType[] } // colors指定時は、そのいずれかの色を持つネクサスだけを守る（BS09-062ノルンの泉Lv2＝白/黄）。// 発生源の持ち主のネクサスすべては、相手の効果によって破壊されない。
    // sourceColors / sourceTypes 指定時は、**破壊しようとしている効果の発生源**をさらに絞る（SD01-032 機械神の加護＝「相手の赤のスピリット/マジックの効果では」）。
    // どちらかを指定した場合は DestroyContext が要り、発生源が不明なときは**守らない**側に倒す（colors と同じ方針）。
    // 「相手の」を明示している効果なので、指定時は sourcePid が持ち主と異なることも求める
      // （hasGlobalConstraintの両陣営走査とは異なり、destroyNexusが破壊対象ネクサスの持ち主のフィールドのみを判定する。サファイアの城壁）
    | { type: "maxSpiritsOnField"; max: number } // 両陣営とも、フィールドのスピリットがmax体以上のときは召喚できない（メインステップの通常召喚のみ。BS04旋風渦巻く渓谷＝5体以上召喚できない＝max4）
    | { type: "levelCantAct"; levels: number[] } // currentLevel がこのリストに含まれるスピリットは、アタックとブロックができない（両陣営。costCantAct のレベル版。BS07腐りゆく湖沼Lv2＝Lv1）
    | { type: "costCantAct"; maxCost?: number; costs?: number[] } // コストがmaxCost以下のスピリットは、アタックとブロックができない（両陣営。shared/rules.tsの専用判定costCantActが参照。BS05白夜の虚空Lv1=maxCost1、青嵐の虚空Lv1=maxCost2）。costs指定時はmaxCostの代わりにこのリストと完全一致するコストのみ対象（BS02グレートウォール：コスト6と8）
    | { type: "millCap"; maxCount: number; perTurn?: boolean } // 発生源の持ち主のデッキは、相手の効果によるミル（mill/millPer/粉砕/voidCoresAndMillByCost等）でmaxCount枚を超えて破棄されない
      // （ownNexusIndestructibleと同様に発生源の持ち主のみに効く。EffectModules.millCapForがeffectSources経由で判定＝lendSelfThisTurnで貸与可。
      // perTurn省略時=1回のミルにつきmaxCount枚まで（BS05エターナルシールド：5枚まで＝6枚以上破棄されない）。
      // perTurn:true=ターン累計でmaxCount枚まで（GameState.millCountThisTurnで加算管理。BS04侵されざる聖域Lv2：ターンに5枚まで）
    | { type: "restedNexusEffectsDisabled" } // **疲労状態のネクサスすべての効果は発揮されない**（両陣営。BS10-074 きぐるみクマッター）。
    // nexusEffectsDisabled（相手のネクサスを丸ごと止める）の疲労限定版。effectSources が疲労したネクサスを外す
    | { type: "battlingCoresProtected" } // 現在バトルをしている両陣営のスピリット上のコアは、効果（コア除去アクション）によって取り除かれない
    | { type: "battlingEffectImmune" } // 現在バトルをしている両陣営のスピリットは、お互いのスピリット/マジックの効果を受けない（ネクサスの効果は通る。EffectModules.isEffectBlocked が破壊・コア除去・疲労・バウンス等のガードから参照。BS05茨の決戦地Lv2）
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
    | { type: "noSummonTriggerByCost"; maxCost: number } // お互い、コストがmaxCost以下のスピリットの『このスピリットの召喚時』効果は発揮されない（召喚時トリガーの発火直前に判定して落とす。BS08共鳴する音叉の塔：コスト4以下）
    | { type: "noReductionBySummonCost"; maxCost: number } // お互い、コストがmaxCost以下のスピリットカードを召喚するとき、軽減シンボルによるコスト軽減ができない（**カード静的なコスト**で判定＝軽減前の値。使用コスト計算の共通経路で軽減分を0にする。BS08超時空重力炉：コスト3以下）
    | { type: "coreFloorByCost"; ownOnly?: true } // ownOnly指定時は発生源の持ち主のスピリットだけを守る（BS09-059翡翠の社Lv2）。// **「Lv1コスト」＝Lv1に必要なコア数**（レベル表の表記。2026-08-14 ユーザー確認。以前は召喚コストとして実装していた）。// 両陣営のスピリット上のコアは、効果によってそのカードのコスト（Lv1コスト）を下回るまで取り除けない（removeCores/removeCoresToTrash/removeCoresToVoidの共通処理で判定。**コアの動かし方を問わず効く**＝移動（moveCoresLeavingOne）と入れ替え（swapOpponentCores）も下限を割れない。入れ替えは同時の1つの動きなので、割るときは入れ替え自体を行わない。2026-08-24 ユーザー確認。BS08聖なる柱状彫刻）
    | { type: "noDeckMillByOpponent"; whileSourceDeployedTurnOnly?: true } // 相手の効果では、**この発生源の持ち主**のデッキは破棄されない（millDeck の冒頭で判定。他の globalConstraint と違い両陣営ではなく持ち主だけを守る＝millCap と同じ向き）。whileSourceDeployedTurnOnly指定時は、発生源が このターンに場へ出た（summonedTurn === state.turn）ときのみ有効（BS08鳳翼の聖剣「このネクサスが配置されたターンの間」）。自分自身の効果・コスト支払いによる破棄は止めない（millCap と同じ範囲）
    | { type: "noDrawOutsideDrawStep" } // お互い、ドローステップ以外でドローできない（GameState.drawの共通経路冒頭で判定。ドローステップ自身はfromDrawStep引数で除外する。BS08豚人チョウハッカイ）
    | { type: "summonLimitByCostForOpponent"; maxCost: number; limit: number } // 発生源の持ち主から見た**相手**は、コストがmaxCost以下のスピリットをターンにlimit体までしか召喚できない（RuleValidator.validateSummonが、相手フィールドのCardInstance.summonedTurnで自分のこのターンの該当召喚数を数えて判定。神速召喚も対象。BS08夢想法師サンゾール：コスト4以下は1体まで）

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
export type EffectDef =
    | {
          id: string
          kind: "keyword"
          keyword: Keyword
          levels: number[] | null
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
          colors?: Color[] // 装甲用: この色の相手効果を受けない
          colorsFrom?: "opponentFieldSymbols" // 装甲用: colorsの代わりに、持ち主から見た相手フィールドのシンボル色を毎回算出して使う（【装甲：∞】。EffectModules.refreshLevelAsOverridesがarmorColorsGrantedへ都度再構築する。BS06鎧神機ヴァルハランス）
          count?: number // 暴風用: 指定数（【暴風：2】＝2体）。表示と、同じカードの誘発エントリの体数を読み合わせるために持つ
          minCost?: number // 転召用: 対象スピリットのコスト下限
          dest?: "trash" | "void" // 転召用: コアの行き先（trash=持ち主のトラッシュ、void=消滅）
          triggerCosts?: number[] // 不死用: 引き金になる自分のスピリットのコスト（【不死：コスト6/7】＝[6, 7]）。
          // 省略時は「キーワードを持つ」宣言だけ（「【不死】を持つ自分のスピリットすべて」の絞り込み用）
      }
    | {
          id: string
          kind: "triggered"
          trigger: TriggerEvent
          levels: number[] | null
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
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
              | { ownFieldHasCombinedSpirit: true } // 発生源の持ち主のフィールドに合体スピリット（ブレイヴが合体しているホスト）がいるときのみ発火（instIsCombinedで判定。BS10-X03巨蟹武神キャンサードLv2＝「自分の合体スピリットがいる間」）
              | { firstAttackOfTurn: true } // そのターンの最初のアタックのときのみ発火（GameState.attacksThisTurn === 1。BS04ダックル）
              | { lastFunsaiHasNexus: true } // 直前の【粉砕】で破棄したカードの中にネクサスカードがあったときのみ発火（GameState.lastFunsai。BS04伝説巨人ジュード）
              | { lastFunsaiHasSpirit: true } // 直前の【粉砕】で破棄したカードの中にスピリットカードがあったときのみ発火（GameState.lastFunsai。BS06爆砕巨人ダグラスLv2-3）
              | { targetMinBp: number } // fireTriggerのtargetInstanceIdのスピリットの実効BPがこれ以上のときのみ発火（onBlock用。BS06鍵鎚のヴァルグリンドLv2＝BP4000以上をブロックしたとき）
              | { targetBlockedMaxBp: number } // fireTriggerのtargetInstanceIdのスピリットの実効BPがこれ以下のときのみ発火（targetMinBpの鏡。onBlock用。SD01-024 人馬機兵アトリーズLv2＝BP4000以下の相手をブロックしたとき）。
              // fieldEvent.condition 側の targetMaxBp とは別物（あちらは event:"ownLifeDamaged" のアタッカーを見る）なので名前を分けている
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
          oncePerTurn?: true // 「(この効果はターンに1回しか使えない)」。使用者ごと・cardIdごとにそのターン1回だけ発揮する。
          // 2枚目は使用自体はできる（コストは払う）が効果は発揮されない。消費の記録は PlayerState.magicOncePerTurnUsed（BS03-133 ハイエリクサー）
          condition?:
              | { ownFamilyCountAtLeast: { family: string; count: number } } // 指定系統を持つ自分のスピリットがcount体以上のときのみ実行（spiritHasFamilyで判定。デルタクラッシュ）
              | { ownFieldHasMinSymbolSpirit: number } // 自分のフィールドにシンボル数がこれ以上のスピリットが1体以上いるときのみ実行（instanceSymbolCountで判定。ライトニングバリスタ／インフェルノアイズ等）
              | { ownFieldSymbolColorsAtLeast: number } // 自分のフィールド（スピリット+ネクサス）が持つシンボルの色の種類数（重複除く）がこれ以上のときのみ実行（BS05ブランチロック）
              | { bothFieldsHaveNexus: true } // お互いのフィールドにネクサスが1つ以上あるときのみ実行（BS02クロスファイア）
              | { ownSpiritIsBlocking: true } // 自分のスピリットが現在のバトルでブロッカーになっているときのみ実行（BS07アームズインパクト）
              | { ownSpiritCountAtLeast: number } // 自分のフィールドのスピリット数がこれ以上のときのみ実行（BS08ジャッジメントフレア＝2体以上）
              | { ownFieldHasColorSpirits: Color[] } // 自分のフィールドに、指定した色のスピリットが**それぞれ**1体以上いるときのみ実行（instHasColorで判定。1体が多色で複数の色を満たしてもよい。BS09-072シャドウブレイド＝赤と紫）
              | { ownFieldHasAllNames: string[] } // 自分のフィールドのスピリットに、指定したカード名すべてが1体ずつ揃っているときのみ実行（カード名の完全一致。cardIdではなく名前で判定＝実データのID変動に影響されない。BS08ロイヤルストレートフラッシュ）
      }
    | {
          id: string
          kind: "step"
          // ⚠️ **これはステップ開始時に自動で発揮する**（timing:"end" 指定時のみ終了時）。
          // 効果文が『自分のメインステップ』でも「ステップ開始時」の指定が無いもの
          // （＝プレイヤーが任意のタイミングで使うもの）は kind:"activated" timing:"main" を使う。
          // BS04-065機織のハーフェレシテは「ステップ開始時」の明記があるのでこちらで正しい
          step: Phase // 発火するステップ
          turn: "own" | "opponent" | "both" // own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時、both=常に
          timing?: "end" // 指定時は「そのステップの終了時」に発火する（省略時＝ステップ開始時＝従来どおり）。いまは attack のみ発火点があり、PhaseManager.endTurn がエンドステップへ移る直前に呼ぶ（BS02紫水晶の森Lv2＝「ステップ終了時」）
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）。
          // fireStepTriggers が effectActiveOn 経由で判定する（BS10-008 火星神龍アレス・ドラグーン）
          oncePerTurn?: true // 「この効果はターンに1回しか使えない」。**発生源1体につき**ターン1回（同名が2体いればそれぞれ1回）。
          // 消費は CardInstance.stepUsedTurn に effectId ごとのターン番号で記録する（activatedUsedTurn と同型）。
          // BS10-008 のようにこの効果自身が追加のエンドステップを生む場合、無いと無限ループになる
          levels: number[] | null
          action: EffectAction
          optional?: true // 「〜できる」= 任意。triggered.optional と同じく、interactiveTargets では発動確認を出す（BS02皇帝アンプルール：リザーブのコアを払う任意コスト）
          beforeStepAction?: true // step:"draw" | "core" 限定：そのステップの**本体の動き**（ドロー／リザーブへのコア置き）より前に発火する。「ドローしないことで〜する」「コアを置かないことで〜する」＝本体の動き自体を支払いに使う効果のために要る（BS07常闇の聖堂Lv2／BS10-087戦場に息づく命）。指定が無い step:"draw" は従来どおりドローの後（引いたカードを破棄の対象にできる百識の谷Lv1などが依存している）。// 2026-08-27 に beforeDraw から改名。コアステップにも同じ規則が要るのに「ドローの前」という名前のままだと規則が2つに割れるため
          condition?:
              | "handNotGreaterThanOpponent" // 持ち主の手札枚数が相手以下（主無き古城Lv2）
              | "selfWasRefreshedThisStep" // 発生源自身がこのリフレッシュステップで回復した場合のみ（PhaseManagerが渡すrefreshedInstanceIdsで判定。魔界侯爵コキュートス）
              | { ownSymbolColorAtLeast: { color: Color; count: number }; noAttacksThisTurn?: true } // 発生源の持ち主のフィールド（スピリット+ネクサス）が持つ指定色のシンボル数がcount以上。noAttacksThisTurn指定時は、さらにこのターンまだ1度もアタックが行われていないときのみ（BS04ハートレス・ティンLv2＝白シンボル3つ以上かつ相手が1回もアタックしてこなかったとき）
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（道化師クラン）
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上（BS04王蛇の住処＝妖蛇/無魔）
              | { ownHandAtLeast: number } // 発生源の持ち主の手札がこの枚数以上（BS04水蛇シーサーペンタ＝Lvごとに10/8/6枚以上）
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 発生源の持ち主のフィールドに、カード名にいずれかの文字列を含むスピリットが合計count体以上（BS04郵便ペンタン＝ペンタン/アンプルール）
              | { opponentDeckNotEmpty: true } // 相手のデッキが0枚のときは発揮しない（BS09-058魔本収められし書架Lv2の但し書きをそのまま実装）
              | { ownSpiritMinCost: number } // 発生源の持ち主のフィールドに、コストがこの値以上のスピリットが1体以上いるとき（instHasCostで判定＝付与コストも見る。BS09-032飛鋼獣ゲイル・フォッカー＝コスト7以上）
              | { ownSpiritMinBp: number } // 発生源の持ち主のフィールドに、実効BPがこの値以上のスピリットが1体以上いるとき（BS09-015獄獣ガシャベルス＝BP8000以上）
              | { ownRefreshedSpiritsAtLeast: number } // 発生源の持ち主のフィールドに回復状態（isRested:false）のスピリットがこの体数以上（BS02紫水晶の森Lv2＝3体以上）
      }
    | {
          id: string
          kind: "aura"
          levels: number[] | null // オーラ発生源のレベル条件
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
          aura: AuraDef
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかった（判定は aura.lentOnly と同じ）
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
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
          phase?: Phase // 指定時、state.phase が一致するときのみ有効（『相手の**アタックステップ**』のように
          // ステップまで限定されている場合。turn だけだと相手のメインステップの効果からも守ってしまう。BS09-038スズランの妖精ティンカ）
          protectFamily?: FamilyFilter // 指定時、「発生源自身が対象」ではなく「持ち主のこの系統（配列＝OR）のスピリットが対象に含まれる」ときに絞り込む。絞り込み先は発生源自身（BS05プリンセス・スノーホワイト＝自分の白の「氷姫」を守り、対象を自分に付け替える）
          protectColor?: Color // protectFamily と併用：守る対象をこの色を持つスピリットに限る（スノーホワイト＝白）
          protectCost?: number // protectFamilyと同型：守る対象を「持ち主のこのコストのスピリット」に限る。絞り込み先は発生源自身（BS06細剣の猫騎士ケット・シー＝コスト2）
          optional?: true // 効果文が「〜にできる」＝任意。対話モードでは絞り込む前に発生源の持ち主へ確認を出す（resolveMagic が PendingChoice.magicRedirect を立てる）。
          // 未指定＝強制で、確認せず自動的に絞り込む。現行4枚（BS04-054 / BS05-040 / BS06-056 / BS09-038）はすべて「できる」なので true
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
          sourceTypes?: CardType[] // 数える側の効果の発生源種別をこれに限る（BS05シーサーズ＝["spirit","magic"]。効果文が「自分のスピリット/マジックの効果で数えるとき」とネクサスを外しているため）。省略時は種別を問わない
      }
    | {
          id: string
          kind: "nexusCostMillPay" // 発生源が場にありレベル有効の間、持ち主は**ネクサスの配置コスト**を「コスト1につき自分のデッキを上から1枚破棄」で支払える（ネクサスの上に置くコアはこの方法では払えない）。判定は shared/cost.canPayNexusCostByMill。**コア払いとの併用はできず**、配置の時点で「全額コア」か「全額デッキ破棄」かを選ぶ（GameAction.setNexus.millPay）。渡っていなければ「コアで足りるならコア、足りなければ全額デッキ破棄」を自動で選ぶ（AI・旧クライアント互換のフォールバック。RuleValidator.nexusMillPayAmount）（BS04栄光の表彰台Lv1）
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "magicNegate" // 発生源が場にありレベル有効の間、**相手が使用したマジックの効果を無効にする**（効果は1つも解決されない。カード自体は通常どおり使用扱いでトラッシュへ行き、「マジックの効果を使用したとき」の誘発は発揮される）。EffectModules.findMagicNegateSource が resolveMagic の冒頭で判定し、実対戦では防御側に確認を出す（interactiveTargets でないときは自動で無効化する）。BS02鏡の回廊Lv2／今後の【氷壁】
          levels: number[] | null
          cost: { selfCoresToVoid: number } | { exhaustSelf: true } | { none: true } // none=支払い無し（SD02-014 魔法監視塔Lv2） // 無効化に必要な支払い。selfCoresToVoid=発生源上のコアをN個ボイドへ（鏡の回廊Lv2＝2個）／exhaustSelf=発生源のスピリットを疲労させる（回復状態でなければ使えない。【氷壁】）
          colors?: Color[] // 指定時、そのいずれかの色を持つマジックだけを無効にできる（【氷壁：赤】＝赤のマジックのみ）
          phase?: Phase // 指定時はこのステップ中のみ有効（鏡の回廊Lv2＝『お互いのアタックステップ』）
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ／opponent=でないときのみ（【氷壁】＝『相手のターン』）
          afterNegate?: "selfToDeckBottom" // 無効にした**後**、発生源自身を持ち主のデッキの下へ戻す
          // （「その後」＝前後関係なので、支払いではなく結果。無効にしなければ戻らない。
          //  2026-08-16 ユーザー確認。SD02-014 魔法監視塔Lv2＝使い捨てのカウンター）
          oncePerTurn?: true // 発生源1つにつきターン1回だけ（CardInstance.magicNegateUsedTurn で管理。鏡の回廊Lv2）
      }
    | {
          id: string
          kind: "magicNegatePayByNexusGrant" // 発生源が場にありレベル有効の間、持ち主の【氷壁】（cost:{exhaustSelf}のmagicNegate）の
          // 支払いを、**自分のネクサス1つを疲労させること**で代替できるようにする（sokuPaySourceGrantと同じ「支払い元を増やす」形）。
          // 回復状態のネクサスがあれば、スピリットを疲労させずに済むほうを選ぶ（プレイヤー選択の決定的簡略化。BS09-062ノルンの泉Lv1-2）
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（ノルンの泉＝『相手のターン』）
      }
    | {
          id: string
          kind: "magicNegateTurnOverrideGrant" // 発生源が有効な間、持ち主のスピリットが持つ【氷壁】の発揮タイミングを turn へ置き換える
          // （『相手のターン』→『自分のターン』。BS09-077アイスバーグ＝このターンの間。lentOnly + levels:null で使う）
          levels: number[] | null
          turn: "own" | "opponent"
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味
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
          target: "anyAll" | "opponentAll" // anyAll=両陣営のスピリットすべて（『すべては』）／opponentAll=発生源の持ち主から見た相手のスピリットすべて（BS09-079キャラクターロスト）
          maxCores?: number // 指定時、置かれているコアがこの数以下のスピリットのみ対象（暗礁海域＝2個以下）
          turn?: "own" | "opponent" // own=発生源の持ち主がturnPlayerのときのみ有効（『自分のターン』）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS09-079キャラクターロスト）
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
          kind: "freeSummonFromHandOnLifeDamaged" // **手札にあるこのカード自身**の効果。持ち主のライフが
          // 相手によって減らされたとき、コストを支払わずに召喚できる（「できる」＝任意）。
          // 場やトラッシュではなく手札のカードが発揮する唯一の形なので、fireFieldEventTriggers ではなく
          // GameEngine の ownLifeDamaged 発火点が持ち主の手札を走査して拾う。
          // 実対戦では確認を出し（PendingChoice.handFreeSummon）、非対話では自動で召喚する。BS08猫娘アニー
          levels: null // 手札のカードにレベルは無いので常に null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 『相手のアタックステップ』等の限定
          condition?: { ownLifeAtMost: number } // 指定時、持ち主のライフがこの数以下のときだけ召喚できる（減らされた**後**のライフで判定する。BS09-035巨獣皇スミドロード＝3以下）
      }
    | {
          id: string
          kind: "freeSummonFromHandOnDiscardedByOpponent" // **手札にあるこのカード自身**の効果。
          // 相手のスピリットの効果で手札から破棄されたとき、**そのカード自身を**コストを支払わずに召喚できる
          // （トラッシュへ置かれる前に場へ出る）。freeSummonFromHandOnLifeDamaged と同じく、
          // 場でもトラッシュでもなく手札のカードが発揮する形（BS09-025忍者サルトベ）
          levels: null // 手札のカードにレベルは無いので常に null
      }
    | {
          id: string
          kind: "handKeywordGrant" // 発生源が場にありレベル有効の間、持ち主の**手札**にある条件一致のカードにキーワードを与える。tempHandKeywordGrants（ターン限定の一時付与）と違い、手札には書き込まず判定時に場の発生源を見る。shared/rules.hasHandKeywordGrant が RuleValidator とクライアント表示の双方から呼ばれる（BS02緑芽吹く原野Lv2＝手札の「怪虫」に【神速】）
          levels: number[] | null
          keyword: Keyword
          familyFilter?: string // 指定時はカード静的な系統にこれを含むカードのみ
          vanillaFilter?: true // 指定時はカードに効果の記述を持たない（バニラ）カードのみ（isVanillaCardで判定。手札のカードなので静的判定でよい。BS10-085浮遊する岩塊Lv2＝手札の効果の記述を持たないスピリットカードに【神速】）
          cardType?: CardType // 指定時はこの種別のカードのみ（省略時はスピリット）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "battleBpAsLevel" // 発生源が場にありレベル有効の間、持ち主のfromLevelのスピリットは、**バトルのBP比較のときだけ** useLevel のBPを使う（GameEngine.resolveBattle が battleBp 経由で参照。効果の対象条件やオーラのBP判定には影響しない）。BS03果て無き地平線Lv1＝Lv1スピリットがLv2BPを使う
          levels: number[] | null
          fromLevel: number
          useLevel: number
          side?: "both" // 指定時は持ち主だけでなく**両陣営**のスピリットが対象（BS09-073オンザエッジ＝「スピリットすべては」）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          keywordFilter?: Keyword // 指定時はこのキーワードを持つスピリットのみ対象（spiritHasKeywordで判定。BS06神葉樹の森Lv2＝【神速】持ちのLv1のみ）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかった
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
          winnerKeywordFilter?: Keyword | Keyword[] // 勝利したスピリットがこのキーワードを持つときのみ発火（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定。BS03熾烈極める最前線Lv2＝覚醒持ち）。
          // **配列＝OR**（SD01-027 溶岩の大瀑布「【覚醒】/【激突】を持つ自分のスピリットが…」）。
          // ⚠️ OR をエントリ2つに分けて書かないこと。両方を持つスピリット（X004 龍星神ジーク・メテオヴルム）で**二重に発火する**
          winnerIsLentBuffTarget?: true // 勝利したスピリットが、**同じマジックの直前の効果でBP増加した1体**のときのみ発火（CardInstance.lentBuffTargetId と照合）。効果文が「〜をBP+2000する。**そのスピリットが**、BPを比べ〜」と前の文を指しているカード用（BS07ニードルショット）。lentOnly とセットで使う
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
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
          action: EffectAction
          phase?: Phase // 指定時はこのステップでのみ発火（例: 侵食されゆく銀世界Lv2＝相手のアタックステップ限定）
          excludePhase?: Phase // 指定時はこのステップでは発火しない（phaseと排他。BS08ダークアンキラーザウルス＝「ドローステップ以外で相手がドローしたとき」）
          turn?: "own" | "opponent" // 指定時はこの陣営条件でのみ発火（own=このインスタンスの持ち主がturnPlayerの時、opponent=持ち主が非turnPlayerの時。省略時はどちらでも発火）
          subjectSide?: "own" | "opponent" // 指定時、**イベントの主体がどちら側か**で絞る（own=発生源の持ち主のもの、opponent=その相手のもの）。
          // turn（誰のターンか）とは別の軸。「**相手の**スピリットが疲労したとき」のように、
          // any…系のイベントで主体の陣営だけを条件にしたいときに使う（2026-08-16 ユーザー判断。SD01-028 呪われし神殿Lv2）
          colorFilter?: Color // event: "ownSpiritDestroyed" | "ownSpiritBlocked" | "anySpiritAttacked" | "ownSpiritSummoned" 限定：対象スピリットの色がこれと一致するときのみ発火（ownSpiritSummoned は BS09-002フタバニア＝「自分の青のスピリットが召喚されたとき」）
          // （祝福されし大聖堂／花の子リップ／BS05天焦がす大聖火。anySpiritAttackedはeventColors=instColors(アタックしたスピリット)で判定）
          sourceColorFilter?: Color // 指定時、そのイベントが「**相手の**この色のスピリット/ネクサス/マジックの**効果によって**
          // 起きたとき」だけ発火する（GameState.currentEffectSource で判定）。次の3つをすべて満たすことを求める:
          //   ① 効果の解決中に起きた（＝currentEffectSource がある。通常のドロー・コアステップでは発火しない）
          //   ② その効果の持ち主が発生源の持ち主ではない（＝「相手の」効果）
          //   ③ その効果の発生源がこの色を持つ（多色は1色でも含めば一致）
          // SD01-029 蠢く地下墓地Lv1（相手が緑の効果でコアを置いたとき）／SD01-031 朝焼け岬Lv1（相手が紫の効果で手札を得たとき）。
          // colorFilter が「イベント**対象**の色」を見るのに対し、こちらは「効果の**発生源**の色」を見る。詳細は docs/design/EFFECT_SOURCE_CONTEXT.md
          targetColorFilter?: Color // 指定時、fireFieldEventTriggers が渡す targetInstanceId のスピリットがこの色を持つときのみ発火（instHasColorで判定）。
          // colorFilter が「イベントの主体」の色を見るのに対し、こちらは「相手役」の色を見る
          // （event:"ownSpiritBlocked" の colorFilter は**ブロックされた自分のスピリット**の色なので、
          //  「相手の緑のスピリットがブロックしたとき」はこちらでないと書けない。SD01-029 蠢く地下墓地Lv2）
          ignoreEventTarget?: true // 指定時、resolveAction に targetInstanceId を渡さない。
          // イベント対象を**効果の対象にしない**とき用（SD01-029 蠢く地下墓地Lv2＝「相手のスピリット**1体**を疲労させる」は
          // ブロックした個体に限らないので、ブロッカーの instanceId を明示ターゲットとして渡してはいけない）
          selfMode?: "source" // 指定時、resolveActionのselfにイベント対象（アタックしたスピリット等）でなく発生源インスタンス自身を渡す（battleWonのselfModeと同じ。BS04鎧装獣ヘイズ・ルーン＝自身が回復する）
          vanillaOnly?: true // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "anySpiritAttacked" | "ownSpiritDeclaredBlock" 限定：破壊/召喚/アタック/ブロックしたスピリットがカードに効果の記述を持たない（バニラ）ときのみ発火（運命分かつ岐路／BS10-080炎の結晶石Lv2／BS10-085浮遊する岩塊／BS10-088天貫く塔の城）。// 破壊・召喚は主体が既にフィールドを離れているため呼び出し側の eventInfo.vanilla で、anySpiritAttacked / ownSpiritDeclaredBlock は主体が場に残るため selfOverride の instIsVanilla で判定する（継続付与の「バニラとしても扱う」も見る）
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火（運命分かつ岐路）
          attackerOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがそのバトルの**アタッカー**だったときのみ発火（＝ブロッカーとして破壊された場合は発火しない）。
          // 「**アタックした**自分のスピリットが破壊されるたび」の限定（BS06ベリアルドロー）。state.battle.attackerInstanceId と一致するかで判定するので byBattleOnly と併用する
          byOpponentEffectOnly?: true // event: "ownNexusDestroyed" 限定：**相手の**スピリット/ネクサス/マジックの効果で破壊されたときのみ発火（BS07の各色ネクサス6枚）。
          // destroyNexus に渡された DestroyContext で判定する（sourceType があり＝効果による破壊、かつ sourcePid が持ち主と異なる）。
          // 発生源不明（context 省略＝テストや将来の経路）のときは**発火しない**側に倒す：
          // 「相手の効果で」という限定を、文脈が分からないときに緩める方が誤りが大きいため
          byOpponentSpiritEffectOnly?: true // event: "ownSpiritDestroyed" 限定：**相手のスピリットの**効果で破壊されたときのみ発火する（DestroyContextのsourceType==="spirit"かつsourcePidが持ち主と異なるときのみ。eventInfo.bySpiritEffectで判定）。
          // 指定時、resolveActionへ渡す対象（targetInstanceId）は通常のイベント対象ではなく、**その効果を発揮したスピリット自身**（DestroyContext.sourceInstanceId）になる
          // （既存のtargetInstanceId/ignoreEventTargetの経路とは独立しているため、この軸を持たない既存カードの挙動には影響しない）。
          // BS10-012アントイーター/BS10-014闇騎士マリス＝「このスピリットが相手のスピリットの効果で破壊されたとき、その効果を発揮したスピリット上のコアすべてを相手のトラッシュに置く」
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上のときのみ発火（花の子リップ）
              | { ownFieldHasColorNexus: Color } // 発生源の持ち主のフィールドに指定色のネクサスがあるときのみ発火（instHasColor判定。修理屋バラン・バラン）
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上のときのみ発火（BS04魔力満ちる泉＝四道3体以上）
              | "selfIsAttacking" // 発生源自身が現在のバトル（state.battle）のアタッカーであるときのみ発火（キノコノコ）
              | { firstAttackOfTurn: true } // event: "anySpiritAttacked" 限定：そのターンの最初のアタックのときのみ発火（GameState.attacksThisTurn === 1。triggered.conditionの同名軸と同じ判定。BS06神鳴る霊峰Lv2）
              | { targetMaxBp: number } // event: "ownLifeDamaged" 限定：ライフを減らしたスピリット（targetInstanceId＝アタッカー）の実効BPがこれ以下のときのみ発火（BS08竜騎集う円卓：BP5000以下のアタックで自分のライフが減らされたとき）
              | { targetMaxCostOfEventTarget: number } // fireFieldEventTriggers が渡す targetInstanceId のスピリットのコストがこれ以下のときのみ発火。
              // event:"ownSpiritBlocked" では**ブロッカー**（SD02-004 神獣ハクタクLv2-3＝「相手のコスト4以下にブロックされたとき」）。
              // 上の targetMaxBp が event:"ownLifeDamaged" 限定なのと同じ形の、コスト版
              | { targetKeywordExclude: Keyword } // event: "ownLifeDamaged" 限定：ライフを減らしたスピリットがそのキーワードを持つときは発火しない（spiritHasKeyword判定＝一時付与も見る。BS08デストラクションバリア：【転召】を持たない相手のスピリットのアタック）
          repeatPerCount?: boolean // event: "ownFunsaiMilled" | "opponentHandAdded" | "opponentCorePlaced" 用：実カウント数ぶんアクションを繰り返す（省略時/falseは1回のみ。修理屋バラン・バラン／犬人マードック／SD01-029 蠢く地下墓地＝置かれたコア1個につき）
          countMode?: "cores" // event: "ownSpiritCoresRemovedByOpponent" 限定：repeatPerCountの繰り返し回数を「影響を受けたスピリット数」でなく「取り除かれたコア数」にする（省略時は従来どおりスピリット数。既存の極光の大地はこの指定が無いため挙動は変わらない。BS06希望の大灯台Lv1）
          minEventCount?: number // eventCount がこの値以上のときのみ発火（「一度に◯枚以上破棄したとき」。BS04アリゲイド＝5枚以上）
          magicCostEquals?: number // event: "opponentMagicUsed" 限定：使用されたマジックのコストがこれと一致するときのみ発火（BS04氷の女神フリッグ）
          magicTiming?: "main" | "flash" // event: "opponentMagicUsed" 限定：使用タイミングが一致するときのみ発火
          familyFilter?: FamilyFilter // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "ownSpiritExhausted" | "anySpiritExhausted" 限定：破壊/召喚/疲労したスピリットの系統がこれを含むときのみ発火（配列＝いずれかの系統でOR。英雄の喪失／BS04七龍帝の玉座・鋼葉の樹林）
          // ※ 破壊/召喚は eventInfo.families（**カード静的な系統**）で判定する。疲労イベントは families を渡さないため、
          //    selfOverride のインスタンスに対して matchesFamilyFilter で**継続付与された系統も含めて**判定する
          //    （BS02生み出される尖兵：自身のLv1が与える「武装」を Lv2 が見る）
          fushiSummonOnly?: true // event: "ownSpiritSummoned" 限定：その召喚が【不死】によるものだったときのみ発火（「【不死】の効果で召喚されたとき」。BS09-013ミミズクロ）。
          // 【不死】召喚も通常の召喚と同じくこのイベントを起こす（TIMING_CHART.md）ので、限定したいときだけ指定する
          subjectCombined?: boolean // 指定時、**イベントの主体が合体しているか**で絞る（true=合体スピリット／false=合体していない）。
          // subjectSide（どちら側か）とは別の軸。BS10-070 鎧馬アルファズル＝「合体していない相手のスピリットがアタックしたとき」
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
          kind: "milledMagicToTegamoto" // 発生源が場にありレベル有効の間、持ち主のデッキが**相手の効果で**破棄されるとき、
          // その中のマジックカードすべてをトラッシュではなく手元(tegamoto)へ置き、以後は手札同様に使用できるようにする
          // （PlayerState.tegamotoPlayable に記録するので、**このネクサスが場を離れても使用権は残る**＝「ゲーム終了時まで」）。
          // millDeck が onMilledFromDeck の解決後に処理する（カード自身の効果の方が優先）。BS06混迷する魔法実験場Lv2
          levels: number[] | null
      }
    | {
          id: string
          kind: "targetNegateByHandDiscard" // 発生源が場にありレベル有効の間、持ち主の familyFilter 一致スピリットは、
          // **相手のスピリットの効果の対象になるたび**、持ち主の手札を discardCount 枚破棄することでその効果を受けない
          // （BS08竜騎集う円卓Lv2）。
          // 判定は EffectModules.resistanceAgainst に乗っており、**コストを払うのは実際に適用する1点だけ**
          // （候補列挙は EffectAttempt.probing を立てて問い合わせるので、そこでは払わない＝対象にはなる）。
          // 「〜することで」は任意コストだが、対象化のたびに確認を出すと解決が止まるため**常に支払う簡略化**にした
          // （手札が0枚なら支払えないので受ける）。破棄するカードは手札の末尾から（プレイヤー選択の決定的簡略化）
          levels: number[] | null
          familyFilter: FamilyFilter // 守られる側の系統（配列＝いずれかでOR）
          bySourceType: "spirit" // 効果の発生源の限定（いまは「相手の**スピリット**の効果」のみ）
          discardCount: number // 1回の対象化につき破棄する手札の枚数
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" } // 『自分のアタックステップ』などの限定（own＝発生源の持ち主がturnPlayer）
      }
    | {
          id: string
          kind: "summonCostHandDiscardPay" // 発生源が場（＝このターンの仮想発生源）にある間、持ち主は**スピリットの召喚コスト**を
          // 「コスト1につき自分の手札1枚を破棄」で支払える（置くコアはこの方法では払えない）。判定は shared/cost.canPaySummonCostByHandDiscard。
          // どこまで手札破棄で払うかは選べず、**コアで足りない分だけ**自動的に回す簡略化
          // （nexusCostMillPay とまったく同じ方針。BS08ビクティム）。
          // 「スピリットカード**1枚**の召喚に」なので、実際に破棄で支払った時点で発生源を使い切る（consumeSummonHandDiscardPay）
          levels: null // 貸与専用（マジックが lendSelfThisTurn で自分を貸す）。仮想発生源は Lv0 なので null 固定
      }
    | {
          id: string
          kind: "deckMillNegate" // 発生源が場にありレベル有効の間、持ち主のデッキが破棄されるとき、コストを払ってその破棄を無効にできる
          // （BS08鳳翼の聖剣Lv2）。**任意コストなので確認を出す**：millDeck は破棄を見送って
          // GameState.pendingDeckMillNegates へ積み、handleAction の末尾＝安全な地点で確認する
          // （reviveOnDestroy.optional とまったく同じ「保留確認」の形。破棄処理の途中では中断できないため）。
          // 断られたら、そのとき改めて破棄する。非対話（smoke）では確認を出さず自動で支払う
          levels: number[] | null
          by: "opponentSpiritEffect" // 破棄の発生源の限定（今は「相手のスピリットの効果で」のみ）
          exceptFunsai?: true // 【粉砕】による破棄は対象外（BS08鳳翼の聖剣Lv2「【粉砕】以外の」）
          costOwnLifeToReserve: number // 支払うコスト：持ち主のライフのコアをこの数だけ持ち主のリザーブへ置く（ライフが足りなければ確認自体を出さない）
      }
    | {
          id: string
          kind: "onMilledFromDeck" // **このカード自身が**デッキから破棄されたときに発揮する（手札・フィールドからの破棄は対象外）。
          // millDeck が、破棄したカードのマスターデータを1枚ずつ見て発火させる。トラッシュへ入れた直後に
          // そこから取り除いて解決するため、破棄されたカードはトラッシュに残らない
          levels: null // デッキのカードにレベルは無いので常に null
          by: "opponentEffect" | "opponentSpiritEffect" // 破棄の発生源の限定。opponentSpiritEffect は「相手の**スピリット**の効果で」（BS08鳳翼の聖剣）
          then: "castThisMagicFree" | "deployThisNexusFree" // castThisMagicFree=このマジックの効果をコストを支払わず即時に発揮（BS06ディスコンティニュー）／deployThisNexusFree=このネクサスをコストを支払わず配置（BS08鳳翼の聖剣）
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          whileCombined?: true // 【合体時】＝このカードが合体しているときだけ発揮する（docs/design/BRAVE.md §12.3）。
          // BS10-074 きぐるみクマッターの「疲労状態のネクサスすべての効果は発揮されない」が使う
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
          setTo: number // 置換後のコスト値（旧 amount。2026-07-26 改名。「+5」と読み違えないため）。setToCounter 指定時は無視される
          setToCounter?: "ownLife" // 指定時は setTo でなく、その時点の値を置換後のコストにする（ownLife＝発生源の持ち主のライフ。BS09-067ビッグバンエナジー「コストを自分のライフと同じ数にする」）
          familyFilter?: FamilyFilter // 対象カードが持つ系統（カード静的 family のみ。配列＝OR。パントマイスター＝氷姫）
          keywordFilter?: Keyword // 対象カードが静的に持つキーワード（hasKeyword で判定。ゴッドスピード＝神速）
          costFilter?: { max?: number; min?: number } // 対象カードの元コストの範囲（ゴッドスピード：6以上）
          nameContains?: string // 対象カードのカード名にこの文字列を含むもののみ（手札のカードが対象なので静的な名前だけを見る。BS07女帝ペンプレスLv2-3＝「ペンタン」）
          cardTypeFilter?: CardType // 対象カードの種別（BS07女帝ペンプレスLv2-3＝スピリットカードのみ。加算側の cardType と同義だが、両枝を混同させないため別名にしてある）
      }
    | {
          id: string
          kind: "activated"
          timing: "flashBattle" | "flash" | "main" // 発動可能タイミング。flashBattle＝フラッシュ中のバトルのみ／flash＝フラッシュで使えるタイミング全般（バトル外も含む。BS08機人フィアラル）／
          // main＝**自分のメインステップ中の任意のタイミング**（バトル中は不可。フラッシュ優先権も見ない）。
          // 『自分のメインステップ』としか書かれておらず「ステップ開始時」の指定が無い効果はこちら。
          // kind:"step" step:"main" は**ステップ開始時に自動で発揮する**ので別物（BS04-065機織のハーフェレシテ＝「ステップ開始時」の明記あり）
          levels: number[] | null
          // 発動コスト。reserveToTrash=リザーブからトラッシュへ置くコア数／
          // exhaustSelf=このスピリット自身を疲労させる（既に疲労していれば発動不可。BS07桜の妖精オウカ）。
          // **省略時は追加コストなし**（BS08帝竜騎サイクル＝「ターンに1回、〜できる」だけでコストの記載が無い）
          cost?: { reserveToTrash: number } | { exhaustSelf: true }
          oncePerTurn?: true // 「ターンに1回」。**発生源のスピリット1体につき**ターン1回（同名が2体いればそれぞれ1回使える）。
          // 消費は CardInstance.activatedUsedTurn に effectId ごとのターン番号で記録する（BS08帝竜騎サイクル6枚）
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
          target?: "ownAll" // 省略時は「このカード自身」（従来＝グングニル）。"ownAll" 指定時は**発生源の持ち主のスピリットすべて**が対象になり、
          // 発生源自身（ネクサス）ではなくそのスピリットたちのコストが上がる（BS08赤き砂の座Lv2＝系統「冥主」を持つ自分のスピリットすべて）
          familyFilter?: FamilyFilter // target:"ownAll" 用。指定系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ
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
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかった
          optional?: true // 効果文が「〜できる」＝任意のとき指定する。実対戦（interactiveTargets）では
          // **破壊をいったん見送って場に残したまま**保留し、アクションが一段落した安全な地点で持ち主に確認する
          // （GameState.pendingReviveConfirms → PendingChoice.reviveConfirm）。承認でコスト支払い＋復活が確定し、
          // 断ればその場で破壊する。非対話（テスト・自動解決）では従来どおり即時に確定させる。
          // 省略時は「必ず戻る」＝任意ではない効果（BS05プリンセス・スノーホワイトLv2-3）
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
              oneCoreToTrash?: boolean // 対象のコア1個を持ち主のトラッシュへ。**コア1個の個体でも支払う**（2026-08-14 ユーザー確認）。
              // 破壊待機中はコアが乗ったままなので支払いは成立し、待機解除の後に維持コア割れで消滅する（BS09-063花の宮殿）
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
          kind: "levelCostMod" // 発生源が場にありレベル有効の間、対象スピリットすべての「Lvコスト」（各レベルに必要なコア数）を amount だけ増やす。
          // **Lv1のコストも上がる**ので、コアが足りなくなった個体は維持コア割れで消滅する（2026-08-14 ユーザー確認）。
          // CardInstance.levelCostBonusContinuous へ毎回再構築して反映し、shared/rules.instLevels が見る（BS09-017蛇凰神バァラル）
          levels: number[] | null
          target: "opponentAll" | "ownAll"
          amount: number
      }
    | {
          id: string
          kind: "keywordGrant" // 発生源が場にありレベル有効の間、持ち主の familyFilter 一致スピリットすべてにキーワードを継続付与する（暴双龍ディラノス）
          levels: number[] | null
          keyword: Keyword
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ（BS06冥府の深淵：冥主/無魔）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。familyFilterとはAND条件。BS03バッチ）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかった
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定）を持つスピリットのみ（BS05黄道の虚空Lv2：転召持ちに光芒を付与）
          colors?: Color[] // keyword:"armor"用：付与する装甲の対象色。EffectModules.refreshLevelAsOverridesがCardInstance.armorColorsGrantedへ毎回再計算して反映し、
          // hasArmorAgainstがそれを見る（既存のtempKeywords装甲colorsと同じ判定経路。BS05白夜の虚空Lv2：転召持ちに装甲：赤/紫/緑/白を付与）
          costFilter?: { max?: number; min?: number } // 指定時は対象スピリットのコストがmax以下/min以上のみ（matchesCostFilterで判定。BS04侵されざる聖域：コスト8以上）
          phase?: Phase // 指定時はこのステップの間のみ有効（turnPlayerを問わない＝『お互いの〜ステップ』）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『自分のアタックステップ』を表す（BS07龍星皇メテオヴルムLv2-3）
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ（aura.vanillaFilterと同型。BS05サーキュラーソー・アーム）
          braveInSpiritState?: true // 指定時は**スピリット状態のブレイヴ**のみ（TargetFilter.braveInSpiritStateと同型＝カード種別がブレイヴで合体していない個体。BS10-083魔星輝く古戦場Lv2）
          minBp?: number // 指定時は実効BPがこれ以上のスピリットのみ（BS09-056星創られし場所＝BP8000以上に【激突】を与える）
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
          cost?: number // 「このコストとしても扱う」値（固定値。道化師クラン）
          plus?: number // 指定時は固定値ではなく「**元のコスト+plus**としても扱う」（SD02-013 転召の祭壇Lv2＝コスト+3）。
          // 目的は【転召：コスト◯以上】の条件を満たしやすくすること（2026-08-16 ユーザー確認。docs/design/SD02_PLAN.md §1）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
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
          vanillaFilter?: true // 指定時は対象カードが効果の記述を持たない（バニラ）ときのみ付与（isVanillaCardで判定。BS10-080炎の結晶石：効果の記述を持たないスピリットカード）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS07リボーンフレイム）
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』。BS06賢獣アイベリックス＝アタックステップ）
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（ペンタン）
              | { ownColorSpiritsAtLeast: { color: Color; count: number } } // 発生源の持ち主の指定色スピリットがcount体以上（ネクサスは数えない。BS04黒の妖精ティ・ターニャ）
      }
    | {
          id: string
          kind: "immunityGrant" // 発生源の持ち主の familyFilter 一致スピリットすべては、相手のマジックの効果を受けない（ポークン）。
          // target:"self" は**発生源自身だけ**が受けない（「このスピリットは〜受けない」。SD01-005 タルタルガー）
          levels: number[] | null
          target: "ownAll" | "self"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝いずれかの系統でOR。matchesFamilyFilterで判定）を持つスピリットのみ（BS05白亜の竜使いアルブスLv2-3：龍帝/虚神）
          includeSelf?: boolean // 指定時は familyFilter に関わらず発生源自身も対象に含む（BS05白亜の竜使いアルブス：自身は竜騎/機人で対象系統を持たないが対象に含む）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。BS05リトルナイト・ランスロット：黄）
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定）を持つスピリットのみ（BS09-055転生の谷Lv2＝【転召】持ち）
          combinedFilter?: true // 指定時は合体スピリット（instIsCombinedがtrue）のみ対象（BS10-079そびえる机山群Lv2：合体スピリットすべてはバウンスされない）
          against: "magic" | "bounce" // magic=相手のマジックの効果を受けない（ポークン等）／bounce=相手の効果によるバウンス（returnToHand/returnAllToHand）を受けない。自分自身の効果によるバウンスは対象外（BS06恐竜姫ジュラ）
          condition?: { ownCostCountAtLeast: { cost: number; count: number } } // 発生源の持ち主のフィールドに指定コストのスピリットがcount体以上のときのみ有効（BS05リトルナイト・ランスロット：コスト2が3体以上）
      }
    | {
          id: string
          kind: "levelAs" // 継続的な「Lv◯として扱う」置換（EffectModules.refreshLevelAsOverridesが毎回再計算する。ナイフ投げのジャグリーン／トパーズの流星）
          levels: null
          whileCombined?: true // 【合体時】＝このカードが合体しているときだけ発揮する（docs/design/BRAVE.md §12.3）。
          // 走査は EffectModules.refreshLevelAsOverrides の levelAs 分岐で見る
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsByKeyword" | "ownSpiritsByFamily" | "ownSpiritsVanilla" | "opponentSpiritsAll" | "allSpiritsByChosenColor" | "opponentBlockersOfOwnKeyword" // ownSpiritsByKeyword=keywordFilterのキーワードエントリを静的に持つ持ち主のスピリットすべて（レベル不問。斬竜刀のガイ／崩壊する戦線）／ownSpiritsByFamily=familyFilterの系統（配列＝OR。matchesFamilyFilterで判定）を持つ持ち主のスピリットすべて（BS06マッスルチャージ：闘神）／ownSpiritsVanilla=カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）／opponentNexusesAll=発生源の持ち主の相手の全ネクサス（ウッド・ゴレム）／opponentSpiritsAll=発生源の持ち主の相手の全スピリット（BS03フォーカード／BS04ジャッジメントライツ）／allSpiritsByChosenColor=両陣営の、貸与時に選ばれた色（CardInstance.lentChoiceColor）を持つスピリットすべて（BS02-111スピリットイリュージョン）
          treatAs: number | "max" | "coresScaled" | { plus: number } // 扱うレベル。
          // 数値=そのレベル固定／"max"=対象カード自身が持つ最高Lv（card.levelsのlevel最大値。対象ごとに算出）／
          // "coresScaled"=対象のコア数で換算（1個→Lv1、2個→Lv2、3個以上→"max"と同じ。サファイアの城壁）／
          // **{ plus: N }=いまのレベルから相対的にN上げる**（BS10-094 未完成の古代戦艦：竜骨Lv2
          // 「Lvを1つ上のものとして扱う」。2026-08-25 ユーザー確認で「文字どおり」）。
          // ⚠️ 相対シフトは**そのカードが持つ最高Lvで頭打ち**にする：Lv1-Lv2 のカードが Lv2 のとき
          // 「1つ上」は Lv3 になるが、そのレベル定義が無いと levelOf が置き換えを黙って無視して
          // **効果が無言で消える**（レベル表に無い override はフォールバックされる仕様のため）
          keywordFilter?: Keyword // target: "ownSpiritsByKeyword" 用。
          // target: "opponentBlockersOfOwnKeyword" では「**このキーワードを持つ自分のスピリット**をブロックしている相手」を指す
          // （SD02-005 天使ヘルヴィムLv2-3＝【光芒】を持つ自分のスピリットをブロックしている相手すべてはLv1として扱う）
          familyFilter?: FamilyFilter // target: "ownSpiritsByFamily" 用（BS06マッスルチャージ：闘神）
          effectsOnly?: true // この置き換えを**効果の発揮判定にだけ**効かせる（CardInstance.levelAsEffectsOnly）。
          // 表示や他のカードから見えるレベル（displayLevel）はこの置き換えを無視する。
          // 効果文が「Lv◯として扱う」ではなく「**Lv◯効果は発揮されない**」と書いているカード用
          // （BS03ウッド・ゴレム：相手のネクサスすべてのLv2効果は発揮されない）
          summonedThisTurnOnly?: true // target: "ownSpiritsVanilla" 用：対象の summonedTurn が現在のターンのときのみ（「召喚されたターンの間」。BS04心臓破りの巨大坂Lv2）
          phase?: Phase // 指定時、state.phaseが一致するときのみ有効
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（BS06マンティゴア：opponent＝『相手のアタックステップ』）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS03フォーカード／BS04ジャッジメントライツ／BS02-111）
          condition?:
              | { maxOwnSpirits: number } // 自分のフィールドのスピリット数がこの値以下の間有効（発生源自身を含む）
              | { anyFieldHasColorSpirit: Color } // 自分か相手のどちらかのフィールドに指定色のスピリットがいる間有効（斬竜刀のガイ）
              | { ownFieldHasFamily: string } // 発生源の持ち主のフィールドに指定系統を持つスピリットがいる間有効（BS04鼠人チューリヒ＝戦獣）
              | { ownSpiritCountBelowOpponent: true } // 発生源の持ち主のフィールドのスピリット数が相手より少ない間有効（BS08ダークチュンポポLv2）
              | { ownFieldHasCombinedSpirit: true } // 発生源の持ち主のフィールドに合体スピリット（ブレイヴが合体しているホスト）がいる間有効（instIsCombinedで判定。BS10-002首長竜人ブラッキオ）
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
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効（own=発生源の持ち主がturnPlayer。BS09-008炎皇帝アグニフォンLv2-3＝『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "magicBuffBonus" // マジックによるBPバフに追加でBP+する（対象・アタックステップ限定。騎獣スレイプホース）
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。
          // ステップは実装側が常に state.phase === "attack" を要求しているので、『自分のアタックステップ』は turn:"own" で表す（BS02-033騎獣スレイプホースLv3）
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
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかった
          minSymbols?: number // 指定時はシンボル数がこれ以上のスピリットのみ（instanceSymbolCountで判定＝ダブルハートの追加シンボルも見る。BS05最古龍の顎Lv2：シンボル2つ以上）
          nameIncludes?: string[] // 指定時はカード名にいずれかの文字列を含むスピリットのみ（cardNameContainsで判定＝「〜として扱う」付与名も見る。BS05天焦がす大聖火Lv2：「巨人」）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は発生源の持ち主基準でこのステップ・turn条件のときのみ有効
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ有効（AuraDef.costFilterと同じ意味。instHasCostで判定＝付与コストも見る。BS10-091シャボンの湖畔Lv2：コスト2）
          turn?: "own" | "opponent" | "both" // 指定時はフェーズを問わずこのturn条件の間だけ有効（AuraDef.turnと同じ意味。phaseTurnのphase必須版とは別軸。BS10-091シャボンの湖畔Lv2＝『相手のターン』）
          combinedFilter?: true // 指定時は合体スピリット（instIsCombinedがtrue）のみ対象（AuraDef.combinedFilterと同じ意味。BS10-093時刻む花時計Lv2＝「自分の合体スピリットすべては」）
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
          kind: "jugekiOnBlockReplace" // 持ち主のスピリットの【呪撃】の発揮タイミングを『このスピリットのブロック時』へ**差し替える**
          // （funsaiOnBlock 等の「にも発揮される」＝追加とは違い、アタック時には発揮されなくなる）。
          // 差し替えが有効な側では、ブロッカーが持つ【呪撃】がバトルした相手（＝アタッカー）を
          // バトル終了時に破壊し、アタッカー側の【呪撃】は発揮しない。
          // GameEngine.resolveBattle の【呪撃】解決点が hasJugekiOnBlockReplace で参照する。BS06カウンターカース
          levels: number[] | null
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味
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
          phase?: Phase // 指定時はこのステップでのみ有効（BS09-060緑翼の大樹Lv2＝『お互いのアタックステップ』）。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかったためステップ限定が効いていなかった
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
          match: { color?: Color; cardType: CardType } // 破棄したカードがこれに一致したときだけライフを守る（color 省略時は色を問わない＝SD02-012 天の城門）
          keepToHandIfType?: CardType // 指定時、破棄したカードがこの種別なら（守れたかに関わらず）トラッシュではなく手札に加える（サーガLv2-3）
          keepToHandIfKeyword?: Keyword // 指定時、破棄したカードがこのキーワードを静的に持つなら手札に加える
          // （SD02-012 天の城門「さらに、【転召】を持っていたとき手札に加える」。keepToHandIfType との併用も可）
          attackerFilter?: { maxLevel?: number; keywordExclude?: Keyword } // 指定時、この条件を満たすアタッカーのアタックでのみ働く
          // （SD02-012 天の城門＝「【転召】を持たない相手の**Lv1**スピリットのアタックによって」）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（天の城門＝『相手のターン』）
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
              | "trashColorLockOpponent" // 発生源の持ち主の相手は、**その相手自身のトラッシュにあるマジックカード**と
              // 同じ色を含むマジックカードを使用できない（colorLockOpponent の裏返し。トラッシュが育つほど使える色が減る。
              // SD02-011 獣皇子バハムンドLv2-3）
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
    // 効果テキストが「このバトルの間、BP+」と明示しているものだけがこちら（BS07ニードルショット）。無記述のBP+はターン終了時まで＝tempBpBuff
    cantAttackThisTurn: boolean // このターンの間アタック不可（refreshAllOwn で回復した個体などに付与）
    immuneToOpponentThisTurn: boolean // このターンの間、相手のカード効果を受けない（フェザーバリア）
    blockConstraintNegatedThisTurn: boolean // このターンの間、自身の cantBlock/cantBlockLowerBp を無効化（バーストファイア）
    unblockableOnceThisTurn?: boolean // 「ターンに1回、相手のスピリットにブロックされない」印。canBlock が参照し、次のバトル終了時（clearBattle）に消える。ターン終了でもリセットする（BS04強者統べる大地Lv2）
    countAsThisTurn?: { pid: PlayerId; count: number; sourceTypes?: CardType[] } // このターンの間、pid の効果が「スピリットの数を数える」ときこの個体を count 体分として数える（ターン終了でリセット。BS05スリーカード）。sourceTypes は数える側の発生源種別の限定（印を付けた action からそのまま写す）
    activatedUsedTurn?: Record<string, number> // kind:"activated" の oncePerTurn 用。effectId -> 最後に発動したターン番号（state.turn と一致する間は再発動できない。BS08帝竜騎サイクル）
    magicNegateUsedTurn?: number // kind:"magicNegate" の oncePerTurn 用。この個体が最後にマジックを無効にしたターン番号（state.turn と一致する間は再使用できない。BS02鏡の回廊Lv2）
    reviveOnDestroyUsedTurn?: number // kind:"reviveOnDestroy" の oncePerTurn 用。この発生源が最後に復活を成立させたターン番号（magicNegateUsedTurnと同型。BS06暴かれた墓石Lv2）
    stepUsedTurn?: Record<string, number> // kind:"step" の oncePerTurn 用。effectId -> 最後に発揮したターン番号（activatedUsedTurnと同型。BS10-008 火星神龍アレス・ドラグーン）
    tempKeywords: { keyword: Keyword; colors?: Color[] }[] // このターンの間だけ付与されたキーワード（ターン終了でリセット。スピリットリンク／インビンシブルシールド）
    tempAlsoCosts: number[] // このターンの間、実コストに加えてこれらのコストとしても扱われる（ターン終了でリセット。道化師クラン）
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
    cantBlockThisBattle?: true // このバトルの間ブロックできない（markCantBlockThisBattle。clearBattle で消える。BS09-042妖精騎士ピーター）
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
    symbolsOverrideContinuous?: Color[] // 継続的な「シンボルを◯個に固定する」上書き。EffectModules.refreshLevelAsOverridesが毎回再計算する（kind:"symbolFix"）。instanceSymbolCount / countSymbols が、カード静的なsymbolの代わりにこちらを見る（BS08海底に眠りし古代都市）
    alsoCostsContinuous?: number[] // 継続付与された「このコストとしても扱う」値（kind:"alsoCostGrant"。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、instHasCost / instMatchesCostFilter が参照する。道化師クラン）
    lentChoiceFamily?: string // 貸与（lendSelfThisTurn 相当）の際にプレイヤーが選んだ系統。仮想発生源にのみ載り、kind:"familyGrant" の familyFromChoice が読む（音鳥クルーク）
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
}

// バトル（アタック〜解決まで）の状態
export interface BattleState {
    attackerInstanceId: string
    blockerInstanceId: string | null // **実際にバトルするブロッカー**。複数体ブロック（blockRequiresCount）でも1体しか入らない
    pendingBlockerIds?: string[] // 複数体ブロックで、必要数がそろうまで宣言を貯める場所（そろったら空にする）
    extraBlockerIds?: string[] // 複数体ブロックで宣言はしたが**バトルはしない**ブロッカー。
    // 効果文が「どれか1体とだけバトルする」なので、BP比較・破壊・バトル終了の処理は blockerInstanceId だけを見る
    // （既存の処理に手を入れずに済ませるための形。BS10-X03巨蟹武神キャンサード）
    flashLockedPlayer: PlayerId | null // このバトルの間フラッシュで手札のカードを使用できないプレイヤー（lockFlash 用）
    directed: boolean // 指定アタックか（true の場合 blockerInstanceId はアタッカーが指定した相手スピリット。通常アタックは false）
    compareByLevel?: boolean // trueの場合、バトル解決時にBPの代わりにcurrentLevelを比較する（エンジェルボイス）
    compareByCores?: boolean // trueの場合、バトル解決時にBPの代わりに置かれているコアの数を比較する（BS06イマジンフィールド）
    usedMagicCardIds?: { p1: string[]; p2: string[] } // このバトル中に使用されたマジックのcardId（光芒用）
    treatAsUnblockedIfLevelAtLeastBlocker?: true // アタッカーのLvがブロッカーのLv以上なら、BPを比べずに「ブロックされなかった」ものとして扱う
    // （挙動は treatAsUnblockedIfBlockerLevel1 と同じ。判定だけが違う。SD02-016 ウィングブーツ）
    treatAsUnblockedIfBlockerLevel1?: true // ブロッカーがLv1なら、BPを比べずに「ブロックされなかった」ものとして扱う（ライフに通り、どちらも破壊されない。ブロッカーは疲労したまま残る。BS09-044妖精の姫巫女ハマ・ドリュアス。BS09_PLAN.md §4）
    blockerCoresProtected?: true // このバトルの間、ブロッカー上のコアは効果で取り除けない（protectBlockerCoresThisBattle。BS09-027密林の勇者皇ヴォルザLv2-3）
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
    destroyEffectOrder?: {
        // 1体の破壊に対して**同時に発揮する効果**が2つ以上あるときの、解決順の選択待ち。
        // 今のところ「フィールドに残る（＝破壊そのもの）」と【不死】の2種類。
        // 選ばれた側を GameState.destroyEffectOrderPick に記録する（TIMING_CHART.md §0-3）
        pid: PlayerId // 破壊される個体の持ち主（表示用。選ぶのはターンプレイヤー）
        instanceId: string
        slots: ("destroy" | "fushi")[] // PendingChoice.options と同順
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
          targetInstanceId?: string // 効果の対象（イベント対象を引き継ぐ）
          sourceColors?: Color[] // 発生源の色（self とずれるとき）
          sourceType?: CardType // 発生源の種別（同上）
      }
    | {
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
          sourceInstanceId?: string // 同上。その効果を発揮したスピリットのインスタンスID（DestroyContext.sourceInstanceId）
          // 破壊の確定（トラッシュ行き）を**呼び出し元（destroyOne フレーム）が行う**印。
          // 【不死】を同じ待機の窓の中で解決するときに立つ
          deferCommit?: true
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
          // **1体の破壊に伴って同時に発揮する効果**の解決の続き。
          // 今のところ「破壊そのもの（＝『フィールドに残る』の確認を含む）」と【不死】の2種類で、
          // 順番はターンプレイヤーが決める（docs/design/TIMING_CHART.md §0-3 / BS09_PLAN.md §3）。
          // **【不死】が絡むときだけ通る道**で、絡まなければ destroySpiritsFrom は従来どおり
          // destroySpirit を直接呼ぶ（ほぼ全てのケース）
          kind: "destroyOne"
          pid: PlayerId // 破壊される個体の持ち主
          instanceId: string
          destroyedCost: number // 破壊される個体のコスト（【不死】の引き金判定に使う。破壊前に読む）
          order: ("destroy" | "fushi")[] // 確定した解決順
          step: number // 次に解決する order の位置
          fushiDone: number // 【不死】の候補を何枚ぶん確認し終えたか
          context?: DestroyContext
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
          outcome: "attackerWins" | "blockerWins" | "mutual" // ＞５のBP比較の結果（＞６以降で覆らない）
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
    // 直前の「破壊とその同時発揮の効果、どちらを先に解決するか」（PendingChoice.destroyEffectOrder）で
    // ターンプレイヤーが選んだ側。destroySpiritsFrom が読み取って解決順を組み立て、読んだら消す
    destroyEffectOrderPick?: "destroy" | "fushi"
    // 召喚の途中で、**まだ場に出していない**スピリットの instanceId（2026-08-20）。
    // 【転召】は「召喚コスト支払い後・維持コアを置く前」に解決するため、その間だけ立つ。
    // これが立っている間は『転召したとき』の誘発を保留する（下の pendingTenshoEvent）
    summoningInstanceId?: string
    // 保留した『転召したとき』（fieldEvent "ownTensho"）。召喚されたスピリットが場に出た時点で発火する。
    // 保留しないと、召喚されたカード自身が持つこの誘発（BS08-009関将龍皇ドラグロン等6枚。
    // 効果文では『召喚時』ブロックの一部）を拾えない
    pendingTenshoEvent?: { pid: PlayerId; families: string[]; names: string[] }
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
    battleAttackerRef?: CardInstance // 今のバトルのアタッカーの**実体参照**（GameViewには含めない＝サーバー内部のみ）。
    // アタッカーが場を離れてバトルが終わるとき、＞７の【光芒】判定に cardId とコア数が要るため保持する。
    // 場から取り除かれた後でもオブジェクト参照からは読み取れる（resolveBattle が attacker を
    // ローカル変数で持ち回っているのと同じ考え方）。clearBattle で消す
    lastFunsai?: { total: number; spirits: number; nexuses: number; magics: number } // 直前の【粉砕】で破棄した内容（resolveFunsaiが記録）。アタック宣言のたびにクリアする（doAttack冒頭）。EffectCounter "lastFunsaiTotal"/"lastFunsaiSpirits"とtriggered.condition {lastFunsaiHasNexus}が参照する（BS03巨人王ランドルフ／BS04二刀流のアムブローズ／BS04伝説巨人ジュード）
    lastMagicCast?: { pid: PlayerId; cardId: string; timing: "main" | "flash"; targetInstanceId?: string } // 直前にプレイヤー自身が手札/手元から使用したマジック（doCastMagic・castMagicFromTrashByColorが記録。action:"magicMirrorRepeat"が参照する。**フラッシュタイミングが閉じた時点**でクリアされ、それより前の使用は対象にならない＝フラッシュ①で使われたマジックをフラッシュ②で写すことはできない。バトル終了時（clearBattle）にもクリアする。BS08マジックミラー）
}

// このターンの間だけ有効な全体制約の定義（GameState.turnConstraints が参照する宣言的ルール）
export type TurnConstraintDef =
    | { type: "cantActByCost"; maxCost: number } // コストがmaxCost以下のスピリットはすべてアタック/ブロック不可（ヘビィゲート）
    | { type: "noLifeDamageByCostForPid"; maxCost: number; pid: PlayerId } // コストがmaxCost以下のスピリットのアタックでは、この pid のライフだけが減らされない（action:"protectLifeByCostThisTurn" が積む。BS07秘密の花園Lv2）
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
    | { type: "blockTriggersAsAttackForPid"; pid: PlayerId } // このターンの間、pid のスピリットすべての『ブロック時』効果を『アタック時』に発揮させる（action:"blockTriggersAsAttackOwnThisTurn" が積む。BS10-072 セイバーシャーク）
    | { type: "canBlockWhileRestedThisTurn"; pid: PlayerId; familyFilter?: FamilyFilter } // このターンの間、pidのfamilyFilter一致スピリット（省略時は全て）は疲労状態でもブロックできる（action:"grantCanBlockWhileRestedThisTurn"が積む。constraint:"canBlockWhileRested"のターン付与版。BS08インフィニティシールド）
    | { type: "lifeImmuneForPid"; pid: PlayerId } // このターンの間、この pid のライフはあらゆる原因（アタック・lifeCrushアクション）で減らない。lifeDamageMaxForPid（max:0でアタックのみ止める）と違い、lifeCrushアクションの実行自体もこの pid に対しては不発にする全面ロック（action:"lifeImmuneThisTurn"が積む。BS10-093時刻む花時計）

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
    | { type: "summon"; handIndex: number; level?: number; paySources?: PaySource[]; substituteInstanceId?: string; discardHandIndices?: number[]; braveTargetInstanceId?: string } // braveTargetInstanceId指定時は**ダイレクトブレイヴ**＝そのスピリットに合体した状態でブレイヴを召喚する（維持コアを置かない。docs/design/BRAVE.md §5）。省略時、ブレイヴは単体のスピリットとして召喚される // discardHandIndices指定時は、その手札を破棄して**1枚につきコスト1**を支払う（BS08ビクティム）。省略時は従来どおり「コアで足りない分を自動で手札破棄に回す」（非対話・旧クライアント互換） // 召喚（神速持ちはフラッシュ時も可）。level指定時はそのレベルに必要なコア数をリザーブから置いて召喚する（省略時はLv1）。substituteInstanceId指定時は kind:"battleSwapSummon" の召喚＝バトル中の自分のスピリット1体を手札に戻し（追加コスト）、その代わりに疲労状態で召喚してバトルを引き継ぐ（召喚コストは通常どおり必要。発動可否は shared/rules.ts の canBattleSwapSummon で判定できる。BS07ブラックカラカロッサム）
    | { type: "setNexus"; handIndex: number; level?: number; paySources?: PaySource[]; millPay?: number } // millPayは配置コストの支払い方法の選択（BS04栄光の表彰台）。0＝コアで払う／実効コストと同じ値＝その枚数だけデッキを上から破棄して払う。**中間の枚数は不可**（併用できない）。省略時は「コアで足りるならコア、足りなければ全額デッキ破棄」 // 配置。level指定時はそのレベルに必要なコア数をリザーブから置いて配置する（省略時はLv1）
    | { type: "castMagic"; handIndex: number; targetInstanceId?: string; paySources?: PaySource[]; fromTegamoto?: boolean } // fromTegamoto指定時はhandIndexが手元(tegamoto)のインデックスを指す（手元からの無償使用。ミカファールLv2）
    | { type: "moveCore"; instanceId: string; direction: "add" | "remove"; confirmDeplete?: true } // confirmDeplete指定時は、維持コア（Lv1）を下回るコアの取り除きを許可し、そのスピリットを消滅させる（コアを他へ回すために自分のスピリットをあえて退かせる操作。クライアントが確認を取ってから送る。2026-08-23 ユーザー要望）
    | {
          type: "awaken" // 覚醒：fromInstanceId のコアを instanceId へ移す
          instanceId: string
          fromInstanceId: string
          count: number
      }
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
