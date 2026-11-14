// 対象選択の絞り込み軸 TargetFilter（どのアクションの filter にも書ける共通の軸）
import { Color, FamilyFilter, EffectCounter, TriggerEvent, Keyword } from "../type"

// ---- 対象選択の絞り込み軸（TargetFilter） ----
//
// 従来は destroy.maxBp / exhaust.levelFilter / refresh.colorFilter … のように、
// **同じ軸がアクションごとに個別フィールドとして後付けされていた**
// （BS01〜BS04 で計28個。全アクションフィールド117個の23%）。
// 新しいアクションはこの型を `filter` に持たせるだけでよく、エンジン改修なしで軸を組み合わせられる。
//
// 既存アクションの個別フィールドは normalizeFilter() がこの型へ畳み込むため **データ移行は不要**
// （cards.json は無変更のまま。個別フィールドの削除は第2段階の別タスク）。
export interface TargetFilter {
    maxBp?: number | "selfBp" | "subjectBp" // 実効BPがこれ以下。"selfBp"=発生源の実効BP以下（BS04七龍帝の玉座Lv2）。"subjectBp"=イベント主体の実効BP以下（fieldEvent の action の filter 専用。BS20-X03鳥武神シシグイ＝「アタックしたスピリットのBP以下の相手」）
    minBp?: number | "selfBp" // 実効BPがこれ以上。"selfBp"=発生源の実効BP以上（BS05火龍王ボルケノス：BP7000以上）
    orMinBp?: number // maxBp と併用：実効BPが maxBp 以下、または orMinBp 以上（26RBS02-045「5000以下か8000以上」）
    exactBp?: "selfBp" // 発生源と実効BPが同じものだけ（BS01プテラトマホーク）
    color?: Color | Color[] // この色を持つ（多色カードはOR判定。instHasColor/cardHasColor 経由）。配列＝いずれかの色を持てばよい（OR）
    colorExclude?: Color // この色を持つものを除外
    colorNotIn?: Color[] // 並べた色以外の色を1つでも持つ（「指定されなかった色のスピリット」）
    declared?: "match" | "except" // declare の then の中だけで書く。解決前に color／family／cost／colorNotIn へ置き換わる（DECLARE_UNIFY §1）
    family?: FamilyFilter // 系統（配列＝いずれかでOR。付与系統も考慮）
    familyExclude?: FamilyFilter // 並べた系統をどれも持たない（付与系統も見る）
    familyAll?: string[] // 指定した系統すべてを持つ（AND。familyのOR配列とは別軸。BS13-061戴冠する活火山Lv2：系統「地竜」と系統「竜人」両方）
    exSymbol?: Color // この色のEXシンボルを持つ（CardData.symbolEx かつ symbol にこの色。26系「黄のEXシンボルを持つ」）
    team?: string // このチームに所属するカードだけ（26系【チーム：X】。カード静的な team 配列を見る。「【レッドステラ】を持つ」参照はこの軸）
    cost?: { max?: number; min?: number; in?: number[]; notIn?: number[] } // in＝いずれかのコストと一致。notIn＝付与コスト込みでどのコストも一致しない
    level?: number[] // currentLevel がこれに含まれる
    minLevel?: number // currentLevel がこれ以上（levelの完全一致とは別軸。BS13-023マウンテン・セイカイLv1-3：「Lv2以上の自分のスピリットすべて」）
    keyword?: Keyword | Keyword[] // 配列はOR。 指定キーワード持ち（一時付与・継続付与も考慮）
    vanilla?: boolean // true＝効果の記述を持たない／false＝持つ
    minSymbols?: number // シンボル数がこれ以上
    symbolCount?: number // シンボル数が**これと完全一致**（minSymbols＝以上とは別軸。「シンボル1つを持つ相手のスピリット」「シンボル2つを持つ相手の合体スピリット」。instanceSymbolCountで判定＝合体しているブレイヴのシンボルも数える。BS12初出）
    excludeSelf?: boolean // 発生源自身を対象から外す
    soulCore?: "present" | "absent" // [ソウルコア]が載っている/載っていない（26系。「[ソウルコア]が置かれている相手のスピリット」等。ソウルコアもコアとして数えるため、有効コア数の軸とは独立）
    shinkaiho?: boolean // 真界放状態/真界放していない（26系《真界放》。true=《真界放》のLv（常にLv2）に現在いる個体、false=いない個体。《真界放》マーカー自体が無いカードは常にfalse側。instInShinkaihoStateで判定。コアの内訳は問わない 2026-10-07 ユーザー裁定）
    summonedBy?: string // 召喚経路が一致するものだけ（26系「【Fチェンジ】で召喚されているか」等。CardInstance.summonedByと突合）
    summonedThisTurn?: true // このターンに召喚された個体だけ（summonedTurn === 現在のターン。26RBS02-077）
    cores?: number // 実際に置かれているコア数がこれと一致する（BS05ドラグノ爆弾兵：コア1個）
    minCores?: number // 実際に置かれているコア数がこれ以上
    originallyNexus?: true // カードデータの種別がネクサスの個体だけ（いまスピリットとして扱われているネクサス。26RBS02-X18「本来はネクサスの自分のスピリット」）
    maxCores?: number // 実際に置かれているコア数がこれ以下（cores＝完全一致とは別軸。BS03水龍王リヴァイア：コアが3個以下）
    uncombined?: true // **合体していない**スピリットだけ（instIsCombined が false。BS11-X04 宝瓶神機アクア・エリシオン＝リフレッシュステップで1体しか回復できない対象）
    notHeavyRested?: true // 重疲労状態ではない
    notAttacking?: true // 現在のバトルのアタッカーではない
    notBlocking?: true // 現在のバトルのブロッカーではない（バトル外では全員が該当）
    blocking?: true // 現在のバトルのブロッカー（board.battle.blockerInstanceId と一致）
    notInBattle?: true // 現在のバトルのアタッカーでもブロッカーでもない（inBattle の否定。バトル外では全員が該当）
    inBattle?: true // 現在のバトルのアタッカーかブロッカー（26RBS02-019「アタック/ブロックしている相手のスピリット」）
    rested?: true // 疲労状態（isRested）のものだけ（BS05吸血女王カーミラ：範囲破壊の疲労限定）
    refreshed?: true // 回復状態（!isRested）のものだけ（restedの逆。BS12-039導化姫トリックスターLv2＝「回復状態の相手のスピリット」）
    nameIs?: string // カード名の完全一致（「〜として扱う」名も一致。declare what:"name" が declared:"match" から置き換える）
    nameContains?: string | string[] // カード名にこの文字列を含むものだけ（BS04獣使いドヴェルグ＝「鎧装獣」／ニーベルングリング＝「ジーク」）。配列＝いずれかの文字列を含めばよい（OR。BS08ダークパワー：「ダーク」/「ブラック」）
    nameExcludes?: string[] // カード名がこのいずれかに完全一致するものを除く（「[カード名]以外の」）。nameIs の否定で、部分一致の nameContains とは違い完全一致
    sameColorAsBattleLoser?: true // 直前のバトルで破壊された側と同じ色（normalizeFilter が state.lastBattleDestroyedColors を color 軸へ解決する。記録が無ければ対象なし。BS04獣使いドヴェルグ）
    keywordCount?: number // keyword（単数のときだけ）と併用。カードに静的に書かれた指定数が一致するもの（【暴風：1】限定。付与された暴風は対象外）
    sameLevelAsSource?: true // 効果の発生源（ctx.self）のスピリットと同じLv（normalizeFilter が level 軸へ解決する。発生源が場にいなければ対象なし）
    sameLevelAsBattleLoser?: true // 直前のバトルで破壊された側と同じLv（normalizeFilter が state.lastBattleDestroyedLevel を level 軸へ解決する。記録が無ければ対象なし）
    excludeBattleLoser?: true // 直前のバトルで破壊したスピリット自身を外す（効果文の「破壊したスピリット以外の」。勝敗の誘発は敗者の破壊待機の列で解決するので、敗者はまだ場にいる。normalizeFilter が excludeInstanceId へ解決する。BS18-X04）
    onlyBattleLoser?: true // 直前のバトルで破壊したスピリット自身だけ（効果文の「破壊したスピリット1体を」。まだ破壊待機で場にいる。normalizeFilter が onlyInstanceId へ解決する。記録が無ければ対象なし。BS17-034）
    excludeInstanceId?: string // 解決後の軸（カードデータには書かない）
    onlyInstanceId?: string // 同上
    sameFamilyAsBattleLoser?: true // 直前のバトルで破壊された側と同じ系統（normalizeFilter が state.lastBattleDestroyedFamilies を family 軸へ解決する。記録が無ければ対象なし。BS04ニーベルングリング）
    sameFamilyAsDestroyed?: true // 直近に破壊された相手のスピリットと同じ系統（state.lastOpponentSpiritDestroyedFamilies。記録が無ければ対象なし）
    sameBpAsBattleLoser?: true // 直前のバトルで破壊された側と同じ実効BP（normalizeFilter が state.lastBattleDestroyedBp を exactBp 軸へ解決する。記録が無ければ対象なし。BS03熾烈極める最前線Lv2）
    lowerBpThanBattleLoser?: true // 直前のバトルで破壊された側より実効BPが低い（normalizeFilter が state.lastBattleDestroyedBp-1 を maxBp 軸へ解決する＝厳密な未満。記録が無ければ対象なし。BS10-X04月光龍ストライク・ジークヴルム Lv2：「そのスピリットよりBPの低い」）
    costSameAsOwn?: FamilyFilter // この系統を持つ自分のスピリット（発生源も含む）のいずれかと同じコスト（normalizeFilter が cost.in に畳む）
    sameCostAsSelf?: true // self（＝この効果を解決するときの基準インスタンス。fieldEvent ではイベント対象＝召喚されたスピリット等）と同じコスト。normalizeFilter が cost 軸へ解決する。self がいなければ対象なし（BS09-060緑翼の大樹＝「そのスピリットと同じコストの相手」）
    maxLevelAsSelf?: true // Lv が self 以下。matchesTarget は selfInstanceId の個体を盤面から探して比べる（見つからなければ対象なし）
    maxCostLastMagic?: true // 直前に使ったマジック（GameState.lastMagicUsed）の**印刷コスト（軽減前）**以下。記録が無ければ対象なし（P033・P076。2026-10-31 ユーザー確認）
    maxCostAsSelf?: true // self と同じかそれ以下のコスト（sameCostAsSelfの以下版）。normalizeFilter が cost 軸（max）へ解決する。self がいなければ対象なし（BS10-X06天蠍神騎スコル・スピア＝「このスピリットのコスト以下の相手」）
    lowerCostThanSelf?: true // self のコストより低い（同じコストは含まない。maxCostAsSelf の未満版）。normalizeFilter が cost 軸（max）へ解決する。self がいなければ対象なし（BS20-061近衛機メッセンジャー【合体時】＝「このスピリットよりコストの低い自分のスピリット」。self が合体スピリットなら instAllCosts でブレイヴ込みのコストになる）
    sameIceWallColorAs?: true // self（＝この効果を解決するときの基準インスタンス。fieldEvent ではイベント対象＝アタックしたスピリット等）が持つ【氷壁】の色（iceWallColorsOfで判定。複数色ならOR）のいずれかを持つもの。normalizeFilter が colorAny 軸へ解決する。self がいない／【氷壁】の色を持たなければ対象なし（BS16-036氷聖女ジャンヌダルク【合体時】：「そのスピリットが持つ【氷壁】と同じ色の相手のスピリット」）
    maxLv1BpOfSelf?: true // self（sameCostAsSelfと同じ意味＝fieldEventではイベント対象。召喚されたスピリット等）の**カードのLv1BP**（実効BPでなく印刷値。levels配列のlevel:1のbp）以下。normalizeFilter が maxBp 軸へ解決する。self がいなければ対象なし（BS10-080炎の結晶石Lv2＝「そのスピリットのLv1BP以下の相手のスピリット」）
    sameCostAsLast?: true // 直前に動いたカード（logic/record.ts）の先頭と同じコスト。記録が空なら対象なし
    maxCostAsLast?: true // 直前に動いたカードの先頭のコスト以下（sameCostAsLast の以下版）。記録が空なら対象なし
    maxCostAsEventTarget?: true // イベント対象のコスト以下（sameCostAsEventTarget の以下版）
    sameCostAsEventTarget?: true // **イベント対象**（ctx.targetInstanceId）と同じコスト（normalizeFilter が cost 軸へ解決する。対象が見つからなければ対象なし）。
    // イベント対象は誘発ごとに違う（onBlocked＝ブロッカー、onBlock＝アタックしている相手）
    unblockableOnly?: true // 「ブロックされない」効果を持つものだけ（継続的な制約 unblockableBy ／期間つき効果の unblockable のどちらでもよい。BS09-049炎蜥蜴クトゥグマLv3）
    hasUnblockableEffectOrActive?: true // BS15共通器：カード自身の効果文に「ブロックされない」（kind:"constraint" constraint:"unblockableBy"）を持てば**条件の成否を問わず**対象。加えて、unblockableOnlyと同じく他の効果で**今まさに**ブロックされなくなっているスピリットも対象（両方のOR。BS15-051虚海獣エメヒドラルLv2：「『ブロックされない』効果を持つ相手のスピリット1体」＝2026-09-18ユーザー確認G）
    keywords?: Keyword[] // 指定したキーワードの**いずれか**を持つもの（keyword の複数版。OR。BS09-068ランドマイン＝覚醒/呪撃/神速/光芒/粉砕）
    keywordExclude?: Keyword // 指定キーワードを**持たない**もの（一時付与・継続付与も考慮。keyword の否定。BS07剣王獣ビャク・ガロウLv2＝【転召】を持たない相手）
    attackingOnly?: true // 現在のバトルのアタッカー（board.battle.attackerInstanceId）だけ。バトルが無ければ対象なし（「アタックしている自分のスピリット」。BS07桜の妖精オウカ）
    bunshin?: true // 分身スピリット（bunshinOf を持つ個体）だけ。BS22
    hasTrigger?: TriggerEvent // 指定トリガーの誘発効果を現在のレベルで静的に持つものだけ（instHasTriggerEffectで判定。継続付与は見ない。BS08プテラディア捕獲部隊＝『召喚時』効果持ち）
    // ---- ブレイヴ（BS10。docs/design/BRAVE.md）----
    combined?: boolean // true=**合体スピリット**（ブレイヴが合体している）だけ／false=**合体していない**スピリットだけ。
    // 判定は shared/rules.ts の instIsCombined（braveRefs を持つホスト ‖ 合体中のブレイヴ自身）。
    // BS10 に20枚以上ある（「相手の合体スピリット1体を破壊」／「合体していない相手のスピリット1体を手札に戻す」）
    braveFamily?: FamilyFilter // この系統を持つブレイヴと合体しているスピリットだけ（ホスト自身の系統ではなく、合体しているブレイヴのカード側を見る。配列＝いずれか）
    braveInSpiritState?: true // **スピリット状態のブレイヴ**だけ（＝カード種別がブレイヴで、合体せず field.spirits にいる個体）。
    // BS10-083 魔星輝く古戦場Lv2／BS10-086 巨星望む大樹／BS10-X06 天蠍神騎スコル・スピア
    hasBurst?: boolean // カードの effects に kind:"burst" を持つものだけ（docs/design/BURST.md）。false指定時は**持たない**ものだけ（BS15-034ミブロック・ジーナス：「バースト効果を持たない相手のスピリット」）
    bofuExhausted?: "any" | "self" // このバトル中に【暴風】で疲労した相手のスピリット（GameState.bofuExhaustedThisBattle）。"self"は発生源（self）の【暴風】で疲労したものに限る
    damagedOwnLife?: true // このバトル中に発生源の持ち主のライフを減らした相手のスピリット（このバトル中の全員と、バースト発動時の1体の和集合）
    lastBpBuffTarget?: true // 直前のBP増加対象1体
    maxBpPerOwn?: { per: TargetFilter; amount: number } // maxBp と併用。per に合う自分のスピリット（発生源自身も含む）1体につき maxBp に amount を足す（normalizeFilter が解決。26RBS02-X12「ブロック時効果を持つ自分のスピリット1体につき、指定するBPを+1000する」）
    maxBpPer?: { counter: EffectCounter; amount: number } // maxBp と併用。counter の数×amount を maxBp に足す（normalizeFilter が解決。26RBS03-X01「この継召で除外した〜EXシンボル1つにつき、指定するBPを+2000する」）
    maxCostPer?: { counter: EffectCounter; amount: number } // cost.max と併用。counter の数×amount を cost.max に足す（normalizeFilter が解決。26RSD06-013「破壊したネクサスのコスト1につき、指定するコストを+1する」＝lastNexusCost）
    maxCostPerOwn?: { per: TargetFilter; amount: number; includeNexus?: true } // cost.max と併用。per に合う自分のスピリット（includeNexus 指定時はネクサスも。発生源自身も含む）1つにつき cost.max に amount を足す（26RCB01-071「自分のスピリット/ネクサス1つにつき、指定するコストを+1する」）
    sameCostAsLastTarget?: true // 直前に指定した自分のスピリット（lastTargetsOf の先頭）と同じ印刷コスト。normalizeFilter が cost 軸へ解決する（P058）
    maxLv1BpOfLastTarget?: true // 直前の対象（自分のスピリット1体）のカードのLv1BP（印刷値。効果による増減は含めない）以下。normalizeFilter が maxBp 軸へ解決する（26RCB01-066）
    lastTarget?: true // 直前の対象（recordTargets の記録。placeCores で置き先にした個体など）
    eventTargets?: true // その誘発のまとまりの体（「BP0になったスピリットすべて」）。発火元が渡した一覧へ fieldEventTriggers.bindEventTargets が instanceIn として置き換える
    instanceIn?: string[] // 内部用：対象をこの個体に限る（bindEventTargets が書く。カードデータには書かない）
    highestBp?: true // 候補の中で実効BPが最も高いものだけ（同値が複数なら対象選択で使い側が選ぶ。destroy の相手側プールで解決）
    highestLevel?: true // 候補の中で現在Lvが最も高いものだけ（同Lvが複数なら対象選択で使い側が選ぶ。exhaust の相手側プールで解決）
}
