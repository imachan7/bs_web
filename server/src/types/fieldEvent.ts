// フィールドイベントの種類 FieldEvent（kind:"fieldEvent" の event。「〜されたとき」の引き金）

// フィールドイベント誘発（data.md 5.1 のイベント層の追加分）。
// TriggerEvent は「効果の発生源となったスピリット自身に起きたこと」を起点とするが、
// fieldEvent は「フィールド上の他のスピリットに起きたこと」に対してネクサス等が反応する場合に使う
// （相手によってライフが減った／自分のスピリットが破壊された、など）。
export type FieldEvent =
    | "ownSeimeiLifeCharged" // 持ち主の【聖命】の効果でライフにコアが置かれたとき（placeCores の void→life が、【聖命】持ちの発生源から解決されたときだけ発火。BS09-064天駆ける方舟）
    | "ownLifeDamaged" // 相手によって自分のライフが減らされたとき
    | "ownLifeLost" // 原因を問わず自分のライフが減ったとき。「相手によって」の限定は ownLifeDamaged
    | "opponentLifeDamaged" // 相手のライフが減ったとき（原因を問わない）
    | "ownSpiritDestroyed" // 自分のスピリットが破壊されたとき
    | "opponentSpiritDestroyed" // **相手の**スピリットが破壊されたとき、持ち主から見た相手側のフィールドから発火（手段を問わない＝バトル・効果のどちらでも。BS04-X14 魔界七将パンデミウムLv1-3：『お互いのアタックステップ』「相手のスピリットを破壊したとき」。2026-09-12 ユーザー確認）
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
    | "anySpiritDeclaredBlock" // 両陣営どちらかのスピリットがブロックを宣言したとき（self=ブロックしたスピリット。BS14-083氷結した瀑布：バトル参加者のBPで判定するため、アタッカー側の anySpiritAttacked と対になる）
    | "ownFunsaiMilled" // 自分のスピリットの【粉砕】が相手のデッキをトラッシュへ送ったとき（発火は粉砕解決ごとに1回。repeatPerCount指定時は実破棄枚数ぶんアクションを繰り返す）
    | "opponentHandAdded" // 持ち主から見て相手の手札にカードが加えられたとき（notifyHandGainedから発火。犬人マードック／英雄の喪失）
    | "ownSpiritCoresRemovedByOpponent" // 自分のスピリット上のコアが相手の効果でリザーブ/トラッシュへ置かれたとき（eventCount=影響を受けた自分のスピリット数。極光の大地）
    | "ownSpiritSummoned" // 自分のフィールドにスピリットが召喚されたとき（doSummonの召喚時効果・転召の解決後に発火）。**self には召喚されたスピリットが渡る**（selfOverride）ため、maxBpFromSelf で「召喚されたスピリットのBP以下」を表現できる（BS04七龍帝の玉座Lv2／鋼葉の樹林Lv2）
    | "anySpiritSummoned" // 両陣営どちらかのスピリットが召喚されたとき、両者のフィールド発生源から発火（ownSpiritSummoned と同じ地点・同じ eventInfo。self には召喚されたスピリットが渡る。subjectSide で召喚された側を絞る）
    | "opponentDeckMilled" // 相手のデッキがトラッシュへ送られたとき（millDeckから発火。eventCount=実破棄枚数。minEventCountで「一度に◯枚以上」を表現。BS04アリゲイド）
    | "ownChimeiMilled" // 自分のスピリットの【地鳴】が相手のデッキをトラッシュへ送ったとき（mill ハンドラが発火。**self には【地鳴】の持ち主のスピリットが渡る**ので excludeSelfSubject で「このスピリット以外の」を表す。condition {lastMilledHasEx} で「EXシンボルを持つカードを破棄した」）
    | "ownDeckMilled" // 自分のデッキが破棄されたとき（eventCount＝破棄枚数）
    | "ownNexusDeployed" // 自分のフィールドにネクサスが配置されたとき（通常の配置・効果による配置・復活のいずれからも発火。BS04栄光の表彰台）
    | "opponentMagicUsed" // 相手がマジックの効果を使用したとき（resolveMagicから発火。eventInfoにcost/timingを載せ、magicCostEquals・magicTimingで絞る。BS04氷の女神フリッグ）
    | "anySpiritReturnedToHand" // 両陣営どちらかのスピリットがフィールドから手札に戻ったとき、**両者の**フィールド発生源から発火する（`subjectSide` で主体の陣営を絞る。anySpiritAttacked と同じ形）。ownSpiritReturnedToHand が持ち主側にしか発火しないため、「**相手の**スピリットが手札に戻ったとき」を書くにはこちらが要る（BS12-040 天王神龍スレイ・カエルス【合体時】）
    | "ownSpiritReturnedToHand" // 自分のスピリットがフィールドから手札に戻ったとき、持ち主のフィールド発生源から発火（returnSpiritToHand から。破壊は含まない。**self には戻ったスピリットが渡る**。BS01リターンドロー）
    | "ownSpiritExhausted" // 自分のスピリットが疲労したとき、持ち主のフィールド発生源から発火（**self には疲労したスピリットが渡る**。BS02生み出される尖兵Lv2／BS02スクルディア）
    | "ownNexusExhausted" // 自分のネクサスが疲労したとき、持ち主のフィールド発生源から発火（**self には疲労したネクサスが渡る**。exhaustNexus と exhaustSpirit（ネクサスの【起動】コスト等）から。26RBS01-108）
    | "anySpiritExhausted" // 両陣営どちらかのスピリットが疲労したとき、両者のフィールド発生源から発火（**self には疲労したスピリットが渡る**。BS05藍紫の虚空Lv1）
    | "ownSpiritBattleWon" // 自分のスピリットがBP比べで相手のスピリットだけを破壊したとき、持ち主のフィールド発生源から発火（**self には勝ったスピリットが渡る**。バトル解決の終盤に発火し、順序は『バトル終了時』より後に簡略化。26RDB01-048）
    | "ownSpiritBattleEnded" // 自分のスピリットがバトルし、バトル終了時にまだ生存しているとき、持ち主のフィールド発生源から発火（**self には生存しているバトル参加者が渡る**。onBattleEnd と同じ地点。破壊されて場にいない参加者には発火しない簡略化。26RBS03-005）
    | "ownSpiritBpReached" // 自分のスピリットの実効BPが増減の結果ある値に届いたとき（前回の観測値 < bpReachedAt <= 今回の値）。handleAction の事後処理（GameState.bpSeen との差分）から発火し、**self には届いたスピリットが渡る**。26RBS01-055/X10/X11
    | "ownSpiritBpUpByFlash" // 自分のスピリットのBPが、自分のフラッシュ効果の「BPを+する」で増加したとき（recordBp から発火。GameState.flashEffect で判定。**self には増えたスピリットが渡る**）。26RCB01-057
    | "ownSpiritReducedLife" // 自分のスピリットが相手のライフを減らしたとき（アタックでも、そのスピリットの効果でも）。**self にはライフを減らしたスピリットが渡る**（26RBS02-X01「スピリットが相手のライフを減らした時」）
    | "ownSpiritDealtLife" // 自分のスピリットのアタックによって相手のライフを減らしたとき、持ち主のフィールド発生源から発火（**self にはライフを減らしたスピリットが渡る**。onLifeDealtの直後。BS06-X22魔界七将ベルゼビート）
    | "opponentLifeCoreFromVoid" // 持ち主から見て相手のライフに、ボイドからコアが置かれたとき（原因は問わない）。eventCount＝置かれた個数。repeatPerCount で個数ぶん繰り返せる
    | "opponentCorePlaced" // 持ち主から見て相手のフィールド（スピリット/ネクサス上）かリザーブに、**効果によって**コアが置かれたとき。
    // eventCount=置かれたコアの個数。resolveAction が効果1つの前後でコアの居場所を突き合わせ、
    // **増えた側だけ**を合計して発火する（出所は問わない＝リザーブからスピリットへ移したものも1個と数える）。
    // 通常のコアステップ・コスト支払いのような効果によらない動きでは発火しない。
    // sourceColorFilter と組み合わせて使う（SD01-029 蠢く地下墓地Lv1）。docs/design/EFFECT_SOURCE_CONTEXT.md
    | "coresGainedFromVoid" // 効果によってボイドからコアが増えたとき（リザーブ・スピリット・ネクサス・ライフのどこに置かれても数える。コアステップ・ルールによるものは含めない）。効果1回の解決ごとに増えた側ごとに1回、eventCount＝増えた個数。subjectSide はコアが増えた側。opponentEffectSourceTypes＝相手の効果の発生源の種別。GameState.lastCoresGained に置き場所を残す（2026-10-23 ユーザー確認）
    | "lifeCorePlaced" // どちらかのライフにコアが置かれたとき（出所・原因を問わない）。効果1回の解決ごとに増えた側ごとに1回、eventCount＝置かれた個数。subjectSide はライフが増えた側
    | "ownTensho" // 自分の【転召】が解決したとき（dumpAllCoresTenshoが唯一の解決点から発火。eventInfo.families=犠牲になったスピリットのカード静的な系統。BS08関将龍皇ドラグロン：系統「竜人」を持つスピリットで【転召】したとき）
    | "anySpiritCombined" // どちらかのスピリットにブレイヴが合体したとき（合体の唯一の入口 attachBrave から両フィールドへ発火）。**self には合体スピリット（ホスト）が渡る**（selfOverride）。subjectSide で自分/相手を絞る（BS11-064 闇の聖剣Lv2＝「相手のスピリットが合体したとき、その合体スピリットは疲労する」）
    | "ownCombinedSpiritBattleEnded" // 自分の合体スピリットがバトルし、バトル終了時にまだ生存しているとき、ネクサス等の発生源から発火（GameEngineのonBattleEnd誘発と同じ地点。selfには生存している合体スピリット自身が渡る。BS10-086巨星望む大樹Lv2）
    | "anyBraveSummoned" // **両陣営**どちらかのブレイヴが召喚されたとき（スピリット状態・合体を問わない）。発生源の持ち主から見て自分/相手いずれの召喚でも発火するため、エントリには必ずselfMode:"source"を付けて発生源自身を主体にする（BS12-061剣の誕生地Lv2）
    | "ownSpiritRefreshed" // 自分のスピリットが回復したとき、持ち主のフィールド発生源から発火（refreshSpiritの唯一の入口から。**self には回復したスピリットが渡る**）。excludeSelfAsEventTargetと組み合わせて「[カード名]以外の」を表現する（BS13-024武神獣ディアル・ユキムラLv2）
    | "anySpiritRefreshed" // 両陣営どちらかのスピリットが回復したとき、**両者の**フィールド発生源から発火する（anySpiritAttackedと同じ形。subjectSideで主体の陣営を絞る。selfには回復したスピリットが渡る。eventInfo.refreshSourceTypeで回復元の効果種別が分かる＝refreshSourceTypeFilterの判定に使う。BS14-085賛美するパイプオルガンLv2：「スピリット/マジックの効果で回復した〜すべてを破壊する」）
    | "opponentSummonEffectResolved" // 相手の『このスピリット/ブレイヴの召喚時』効果が**実際に解決された**後（単なる召喚では発火しない。kind:"triggered" trigger:"onSummon" が現在のレベルで有効な状態で1件でもあるときに発火する簡略化。任意発動の未発動・条件不一致まではここでは見分けない。BURST.md）
    | "ownBurstSet" // 自分がバーストをセットしたとき（効果によるセットも含む。setBurst / setBurstFromHand の両方から発火）
    | "opponentBurstSet" // 相手がバーストをセットしたとき
    | "ownBurstActivated" // 自分のバーストの解決がすべて終わった後。eventInfo.burstCost に発動したカードのコストを載せる
    | "ownKeywordActivated"
