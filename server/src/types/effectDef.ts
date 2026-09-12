// カード効果の定義（いつ・どんな条件で・何をするか）。
// `type.ts` の肥大化（丸読みで約16万トークン）を避けるため 2026-09-12 に切り出した。
// import 側は従来どおり `type.ts` から読めばよい（`type.ts` が re-export している）。

import type {
    AuraDef,
    BattleState,
    CardInstance,
    CardType,
    Color,
    ConstraintDef,
    DestroyContext,
    EffectAction,
    EffectCounter,
    FamilyFilter,
    FieldEvent,
    GameAction,
    GameState,
    GlobalConstraintDef,
    Keyword,
    LevelDef,
    PendingChoice,
    Phase,
    PlayerState,
    TargetFilter,
    TriggerEvent,
} from "../type"

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
          colorsFrom?: "opponentFieldSymbols" | "selfColors" // 装甲用: colorsの代わりに、持ち主から見た相手フィールドのシンボル色を毎回算出して使う（【装甲：∞】。EffectModules.refreshLevelAsOverridesがarmorColorsGrantedへ都度再構築する。BS06鎧神機ヴァルハランス）
          // selfColors は**重装甲用**: 発生源自身の色（instColors＝colorAs等の付与色も含む）を毎回算出して使う（【重装甲：可変】。BS12-X04 月光神龍ルナテック・ストライクヴルム。heavyArmorColorsGrantedへ都度再構築）
          count?: number // 暴風用: 指定数（【暴風：2】＝2体）。表示と、同じカードの誘発エントリの体数を読み合わせるために持つ
          minCost?: number // 転召用: 対象スピリットのコスト下限
          familyFilter?: FamilyFilter // 転召用: 対象スピリットの系統（配列＝OR。【転召：星魂/ボイド】＝系統「星魂」を持つ自分のスピリット1体。minCost とは排他で、こちらはコストを問わない。BS12初出）
          dest?: "trash" | "void" // 転召用: コアの行き先（trash=持ち主のトラッシュ、void=消滅）
          triggerCosts?: number[] // 不死用: 引き金になる自分のスピリットのコスト（【不死：コスト6/7】＝[6, 7]）。
          // 省略時は「キーワードを持つ」宣言だけ（「【不死】を持つ自分のスピリットすべて」の絞り込み用）
          triggerFamilies?: FamilyFilter // 不死用: 引き金になる自分のスピリットの系統（【不死：妖蛇】＝"妖蛇"。triggerCostsの兄弟軸で、どちらか一方が一致すれば発揮できる。BS13-014 闇騎士アグラヴェイン）
      }
    | {
          id: string
          kind: "trashImmunity" // トラッシュにある間、このカード自身が一切の効果を受けない（levels無し＝フィールドの状態・現在Lvと無関係に常時有効。isTrashCardProtected（shared/rules.ts）がgetCard(cardId).effectsを直接見て判定する。自分の効果からも守られる＝自分でトラッシュから回収することもできない。BS10-108ルナティックシール：「トラッシュにあるこのマジックカードは、一切の効果を受けない」）
      }
    | {
          id: string
          kind: "trashReturnAtEndStep" // トラッシュにある間、持ち主の『自分のエンドステップ』に自動で手札へ戻る（levels無し＝trashImmunityと同型。isTrashReturnAtEndStep（shared/rules.ts）がgetCard(cardId).effectsを直接見て判定し、PhaseManager.endTurnが持ち主のエンドステップごとに全該当カードを戻す。BS13-015冥総裁ハーゲン：「自分のトラッシュにあるこのスピリットカードは、『自分のエンドステップ』に手札に戻る。」）
          maxCount?: number // 「この効果はターンに1回しか使えない」＝このcardIdにつき1ターンに戻る枚数の上限（省略時は無制限＝該当カードすべて戻る）。同名を複数トラッシュへ落としても、戻るのはこの枚数まで（BS13-077ブリーズライド：1枚まで）
      }
    | {
          id: string
          kind: "triggered"
          trigger: TriggerEvent
          levels: number[] | null
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          combinedBraveColors?: Color[] // 【合体時】と併用：合体しているブレイヴの**いずれか1つ**がこの色のどれかを持つときだけ発揮する（多色ブレイヴは1色でも含めば該当＝instHasColor と同じ判定。2026-09-07 ユーザー確認）。X008 神星皇ストライク・アポロドラゴン＝「赤/紫/青のブレイヴとの合体時」。緑のブレイヴと赤のブレイヴを両方付ければ、色違いの2つの効果が両方成立する
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
          action: EffectAction
          optional: boolean // 「〜できる」= 任意。interactiveTargets（実対戦）では発動確認の
          // pendingChoice（kind:"option" / confirm:true）を出し、選ばなければ発動しない。
          // interactiveTargets=false（テスト）では従来どおり常に発動する
          oncePerTurn?: true // 「この効果はターンに1回しか使えない」。**発生源1体につき**ターン1回（同名が2体いればそれぞれ1回）。
          // 消費は CardInstance.triggeredUsedTurn に effectId ごとのターン番号で記録する（activatedUsedTurn / stepUsedTurn と同型。BS11-032 天王神獣スレイ・ウラノス）
          battleRole?: "attacker" | "blocker" // onBattleWin：勝利したときの自分の役割がこれと一致する場合のみ発火。onBattleEnd：GameEngineが生存アタッカー/ブロッカーそれぞれの発火点で"attacker"/"blocker"を渡すので、同じ軸で「アタッカーとして生き残ったときだけ」等を絞れる（BS13-004フォボス・ドラグーンLv3：『このスピリットのアタック時』の続きとしてのバトル終了時＝アタッカー限定）。省略時は従来通り常に発火
          turn?: "own" | "opponent" // 指定時、発生源の持ち主基準でこのturn条件のときのみ発火（own=『自分の◯◯時』が持ち主のターン限定、opponent=『相手のターン』。fieldEvent.turnと同じ意味。BS13-010スカルザードLv2：「Lv2『相手のターン』相手によってこのスピリットが破壊されたとき」）
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
              | { bothFieldsHaveMinBpSpirit: number } // **両陣営のフィールド**に、実効BPがこの値以上のスピリットがそれぞれ1体以上いるときのみ発火（BS11-008 爆竜ドラゴニックベアード＝お互いのフィールドにBP10000以上のスピリットがいるとき）
              | { battleOpponentCombined: true } // いま成立しているバトル（state.battle）の**相手側の個体**が合体スピリット（instIsCombined）のときのみ発火（onBattleStart用。アタック宣言時＝指定アタックでブロッカーが決まっている場合と、ブロック宣言時の両方で同じ判定になる。BS11-X02 滅神星龍ダークヴルム・ノヴァLv2-3＝「相手の合体スピリットとバトルしたとき」）
              | { requirePrevAttackerCombined: true } // 直前のアタック宣言が、発生源の持ち主自身の合体スピリットによるものだったときのみ発火（state.prevAttackerCombinedPid === owner で判定。ターン開始でリセット。BS10-047赤ずきん妖精ルージュLv3＝「自分の合体スピリットの次にアタックしたとき」）
              | { ownLifeAtMost: number } // 発生源の持ち主のライフがこの数以下のときのみ発火（BS12-X05戦神乙女ヴィエルジェ：「自分のライフが5以下のとき」）
              | { selfSummonedByFushi: true } // trigger:"onSummon"限定：自分自身の召喚が【不死】の効果によるものだったときのみ発火（fireTriggerのbyFushi引数で判定。BS13-014闇騎士アグラヴェイン：「【不死】の効果で召喚されたとき」）
              | { selfDestroyedByOpponent: true } // trigger:"onDestroy"限定：自分自身が相手によって破壊されたときのみ発火（fireTriggerのbyOpponent引数で判定＝相手の効果 または バトルのBP比較。reviveOnDestroy.when.byOpponentと同じ判定。BS13-010スカルザード：「相手によってこのスピリットが破壊されたとき」）
              | { ownNexusNameKindsAtLeast: { nameContains: string; count: number } } // 器BQ：カード名にnameContainsを含む自分のネクサスの「**異なるカード名の種類数**」（同名は1種類と数える。枚数ではない）がcount以上のときのみ発火（BS13-048古代戦艦アルゴ・ゴレム：「カード名に「古代戦艦」と入っている自分のネクサスが4種類あるとき」）
              | { ownBurstSet: boolean } // 発生源の持ち主が自分のバーストエリアにカードをセットしている間だけ発火（docs/design/BURST.md）。false指定時は**セットしていない**間だけ発火（SD06-009キジ・トリアLv2＝「自分のバーストをセットしていないとき」）
      }
    | {
          id: string
          kind: "magic"
          timing: "main" | "flash"
          action: EffectAction
          afterBlockForbidden?: true // trueなら、**ブロック宣言後**のフラッシュタイミングでは使用できない（効果文「この効果は、ブロック宣言後のフラッシュタイミングで使えない」。BS11-078 ブレイヴフラッシュ）。判定は state.battle.blockerInstanceId が入っているか（ブロックしない＝takeLife はその場でライフ処理まで進むので窓が無い）
          mainForbidden?: boolean // trueなら、このエントリがtimingとして採用されるメインステップでの使用そのものを拒否する（効果文「メインステップで使えない」の忠実化。ネイチャーフォース）
          ownTurnForbidden?: true // trueなら、発生源の持ち主のターン中はこのマジックを使用できない（効果文「この効果は、『自分のターン』で使えない」の忠実化。RuleValidator.validateCastMagicが使用宣言そのものを拒否する。BS12-080バキュームシンボル）
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
          kind: "burst" // バーストエリアから条件発動する。発生源は場ではなくバーストエリア（docs/design/BURST.md）。
          // effectSources() には入れない＝継続効果（aura/constraint等）の発生源にはならない。
          // fireFieldEventTriggers の末尾が、両プレイヤーのバーストエリアをこのkindだけ特別に走査する
          event: FieldEvent // 発動条件（既存のFieldEventを流用する）
          subjectSide?: "own" | "opponent" // fieldEvent の同名軸と同じ意味（own=バーストの持ち主自身の事象、opponent=その相手の事象）
          byOpponentEffectOnly?: true // event: "ownSpiritDestroyed" 限定：**相手の**スピリット/ネクサス/マジックの効果で破壊されたときのみ発火（fieldEvent の同名軸と同じ判定＝eventInfo.byOpponentEffectを見る。BS14-103幻影氷結晶【バースト：相手による自分のスピリット破壊後】）
          destroyedColorFilter?: Color // event: "ownSpiritDestroyed" 限定：このバースト発動時に破壊されたスピリットがこの色を持つときのみ発火（fieldEvent の colorFilter と同じくeventColorsで判定。BS14-061ヤギュード・ジューベイ「このバースト発動時に青のスピリットが破壊されていたら」）
          condition?:
              | { ownLifeAtMost: number } // 自分のライフがこれ以下（BS14-X01 龍の覇王ジーク・ヤマト・フリード＝ライフ3以下）
              | { ownNexusAtLeast: number } // 自分のフィールドのネクサス数がこれ以上（BS14-064 レボルシング・ゼヨン＝3つ以上）
              | { ownTrashColorCountAtLeast: { color: Color; count: number } } // 自分のトラッシュにある指定色のカード枚数がこれ以上（BS14-020 ナスノ・アーチャー＝紫4枚以上）
              | { ownTrashCardTypeCountAtLeast: { cardType: CardType; count: number } } // 自分のトラッシュにある指定種別のカード枚数がこれ以上（BS14-055 ミスティック・ヒミコ＝マジック3枚以上）
              | { ownCoresTotalAtLeast: number } // 自分のフィールド/リザーブ/トラッシュのコアの**合計**がこれ以上（BS14-X03 風の覇王ドルクス・ウシワカ＝8個以上）
          // 「〜のとき、このスピリットカードを召喚する」等の発動条件。
          // **バーストの宣言自体はeventの時点で成立している**ので、これを満たさないときはactionの解決だけを飛ばす（噛み合わせはBURST.md §1参照）。
          // 既存の triggered.condition / shared/cost.ts の同名軸を流用（BS14-X01：ownLifeAtMost、BS14-064：ownNexusAtLeast）
          destroyedAsTarget?: true // 指定時、resolveActionへ渡すtargetInstanceIdの枠に、このバースト発動時に破壊されたスピリットの**cardId**を入れる（破壊済みの個体は場に無く、トラッシュにはcardIdでしか残らないため。受け手は recoverMagicFromTrash の onlyBurstDestroyedCard だけ）（BS14-103幻影氷結晶：「このバースト発動時に破壊された、自分のトラッシュにあるスピリットカード1枚を手札に戻す」）
          action: EffectAction // バースト効果本体
          thenPay?: "main" | "flash" // 「その後コストを支払うことで、このカードのメイン/フラッシュ効果を発揮する」。
          // このカード自身の kind:"magic" で timing が一致するエントリを、通常どおりコストを支払えれば追加で発揮できる（任意）
          alsoDrawIfDestroyedColor?: Color // event: "ownSpiritDestroyed" 限定：actionと**同時に**（CONJUNCTION.md「さらに」）、このバースト発動時に破壊されたスピリットがこの色を持っていたら自分はデッキから1枚ドローする。destroyedColorFilterと違いaction全体は止めない（actionは無条件、ドローだけが条件付き。BS14-X02呪の覇王カオティック・セイメイ：「相手のスピリットのコア1個を相手のトラッシュに置く。さらに、このバースト発動時に紫のスピリットが破壊されていたら、自分はデッキから1枚ドローする」）
          returnSelfToHandAfter?: true // 指定時、finishBurstActivationの既定の行き先（トラッシュ）を上書きし、actionとalsoDrawIfDestroyedColorの解決後（CONJUNCTION.md「その後」）にこのバーストカード自身を持ち主の手札へ戻す（BS14-X02：「その後、このカードを手札に戻す」）
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
          cost?: { exhaustSelf: true } // 「ステップ開始時、このスピリットを疲労させることで〜」（COST_MODEL.md）。既に疲労状態なら発火しない（払えない）。fireStepTriggersが発火が確定した時点で疲労させる（interactiveTargetsの確認を断った場合も疲労する簡略化。BS12-043大地の狩人コンドラッドLv1）
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
              | { ownTrashOnlyColor: Color } // 発生源の持ち主のトラッシュにあるカードがこの色のカードだけ（cardHasColorで判定。トラッシュが0枚のときは満たさない扱い＝簡略化。BS14-024ツチピッグ：緑のカードだけのとき）
              | { ownSpiritMinCost: number } // 発生源の持ち主のフィールドに、コストがこの値以上のスピリットが1体以上いるとき（instHasCostで判定＝付与コストも見る。BS09-032飛鋼獣ゲイル・フォッカー＝コスト7以上）
              | { ownSpiritMinBp: number } // 発生源の持ち主のフィールドに、実効BPがこの値以上のスピリットが1体以上いるとき（BS09-015獄獣ガシャベルス＝BP8000以上）
              | { ownRefreshedSpiritsAtLeast: number } // 発生源の持ち主のフィールドに回復状態（isRested:false）のスピリットがこの体数以上（BS02紫水晶の森Lv2＝3体以上）
              | { ownBurstSet: boolean } // 発生源の持ち主が自分のバーストエリアにカードをセットしている間（false指定時はセットしていない間）だけ発火（triggered.conditionと同じ意味。SD06-009キジ・トリアLv2＝「自分のバーストをセットしていないとき」）
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
          whileOwnBurstSet?: true // 発生源の持ち主が自分のバーストエリアにカードをセットしている間だけ発揮する（kind:"constraint"の同名軸と同じゲート形式。docs/design/BURST.md。BS14-019シュテン・ドーガLv2：「自分のバーストをセットしている間、系統：「魔影」を持つスピリット1体につき、このスピリットをBP+2000する」）
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ホスト側のスピリット（braveRefs を持つ）と、合体中のブレイヴ自身（braveCombined）の両方で成立する。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（実装が読まない指定を無言で通さないため）
          whileOwnBurstSet?: true // 発生源の持ち主が自分のバーストエリアにカードをセットしている間だけ発揮する（whileCombinedと同じゲート形式。docs/design/BURST.md）
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
          kind: "destroyAsMaxLevelGrant" // 発生源が場にありレベル有効の間、対象スピリットは「相手のスピリット/ブレイヴ/マジックの効果でコアが0個になったとき、通常の維持コア割れ（消滅・onDestroy不発火）ではなく、**最高Lvとして破壊される**（onDestroy誘発あり）」扱いになる（器N。BS12-057ハイドランディア【合体時】/BS12-069定規山脈）。
          // destroySpirit がcause:"deplete"でcores===0のとき、state.currentEffectSourceが「持ち主と異なるpidのspirit/brave/magic」を指しているかで「相手の効果で」を判定し、該当すればcauseを"destroy"に切り替えてinst.destroyAsMaxLevel=trueを立てる（levelOf/currentLevelがこれを見て最大Lvを返す＝levelsに最大Lvを含む『破壊時』だけが発揮する）。
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身（【合体時】ならbravesOfのホスト合流でホストに効く。BS12-057）／ownAll=持ち主のスピリットすべて（BS12-069）
          whileCombined?: true // target:"self"のとき、発生源が合体しているときだけ（BS12-057）
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
          winnerIsLentChoiceTarget?: true // 勝利したスピリットが、**targetChoiceLendThisTurnで選んだ1体**のときのみ発火（CardInstance.lentChoiceInstanceId と照合）。「自分のスピリット1体に“…このスピリットは回復する”という効果を与える」の与える側（BS13-078ネバーギブアップ）。lentOnly とセットで使う
          winnerCombinedOnly?: true // 勝利したスピリットが**合体スピリット**のときのみ発火（instIsCombined。BS11-062 オールトの竜巣Lv2）
          loserMinBp?: number // **敗北して破壊された側**の実効BPがこれ以上のときのみ発火（state.lastBattleDestroyedBpで判定＝破壊直前の実効BP。BS13-050輝竜シャイン・ブレイザー【合体時】：BP8000以上の相手のスピリットを破壊したとき）
          whileCombined?: true // 【合体時】＝**発生源自身が合体しているときだけ**発火する（docs/design/BRAVE.md §12.3。winnerCombinedOnlyと違い判定対象は勝利したスピリットでなく発生源。BS12-X03独眼武神マンティクス・マサムネ）
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
          oncePerTurn?: true // 「この効果はターンに1回しか使えない」。kind:"triggered".oncePerTurnと同じ形（CardInstance.triggeredUsedTurnをeffect.idで共有）。BS13-070星宿の障壁Lv2
          whileCombined?: true // 【合体時】＝**このカードが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          combinedBraveColors?: Color[] // 【合体時】と併用：合体しているブレイヴの**いずれか1つ**がこの色のどれかを持つときだけ発火する（triggered の同名軸と同じ判定。X008＝「緑/白/黄のブレイヴとの合体時」）
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
          subjectKeywordFilter?: Keyword | Keyword[] // イベントの主体（破壊されたスピリット等）がこのキーワードを持つときのみ発火（配列＝OR。静的・一時付与・継続付与を考慮）。**主体の実体（selfOverride）で判定する**ので、破壊のように場を離れるイベントでも破壊待機中の個体をそのまま見る（BS11-069 黄金の鐘楼Lv2＝【聖命】を持つ自分のスピリットが破壊されたとき）
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火（運命分かつ岐路）
          attackerOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがそのバトルの**アタッカー**だったときのみ発火（＝ブロッカーとして破壊された場合は発火しない）。
          // 「**アタックした**自分のスピリットが破壊されるたび」の限定（BS06ベリアルドロー）。state.battle.attackerInstanceId と一致するかで判定するので byBattleOnly と併用する
          selfOnly?: true // event: "ownSpiritDestroyed" 限定：**発生源自身が破壊されたとき**だけ発火する（同じ持ち主の他のスピリットの破壊では発火しない）。
          // 破壊された個体は effectSources から消えているので、removal.ts の fireOwnSpiritDestroyed が extraSources に自分自身を渡している。
          // 印刷テキストに『破壊時』が無い＝『』カテゴリを持たない破壊起点の効果をここへ振り分ける（SEMANTICS_AUDIT.md §3.17。BS13-010 スカルザード）
          byOpponentEffectOnly?: true // event: "ownNexusDestroyed" | "ownSpiritDestroyed" | "ownSpiritExhausted" 限定：**相手の**スピリット/ネクサス/マジックの効果で破壊/疲労したときのみ発火（BS07の各色ネクサス6枚／BS12-005星角獣ユニゴーント／BS12-062白煙の大山脈）。ownSpiritDestroyedはバトルのBP比較で敗れた場合も含める（byOpponentEffectOf||byBattle）。ownSpiritExhaustedはネクサスの効果を含まない＝スピリット/ブレイヴ/マジックのみ（fireExhaustedTriggersが判定）。
          // destroyNexus に渡された DestroyContext で判定する（sourceType があり＝効果による破壊、かつ sourcePid が持ち主と異なる）。
          // 発生源不明（context 省略＝テストや将来の経路）のときは**発火しない**側に倒す：
          // 「相手の効果で」という限定を、文脈が分からないときに緩める方が誤りが大きいため
          byOpponentSpiritEffectOnly?: true // event: "ownSpiritDestroyed" 限定：**相手のスピリットの**効果で破壊されたときのみ発火する（DestroyContextのsourceType==="spirit"かつsourcePidが持ち主と異なるときのみ。eventInfo.bySpiritEffectで判定）。
          summonedSpiritAsTarget?: true // event: "ownSpiritSummoned" 限定：selfMode:"source"と併用し、actionTargetIdを**召喚されたスピリット自身**（eventInfo.sourceInstanceId）にする。selfMode:"source"はselfを発生源自身に固定するため、召喚されたスピリットへの参照が失われる（既定はselfOverrideでそちらがselfになる）。両方を両立させたいとき用（BS13-053モクバオーLv1：selfは合体させるブレイヴ自身、targetは合体先になる召喚されたスピリット）
          attackerAsTarget?: true // event: "anySpiritAttacked" 限定：summonedSpiritAsTargetの同型。selfMode:"source"と併用し、actionTargetIdを**アタックしたスピリット自身**（selfOverride.inst）にする（BS13-068遥かなる衛星砲Lv2：selfは発生源自身＝疲労させるこのネクサス、targetはアタックしたスピリット＝手札に戻す対象）
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
              | { lastFunsaiHasSpirit: true } // event: "ownFunsaiMilled" 限定：直前の【粉砕】で破棄したカードの中にスピリットカードがあったときのみ発火（GameState.lastFunsai。triggered.conditionの同名軸と同じ判定。BS11-042海賊ラッコルセア：「相手のトラッシュにスピリットカードが1枚以上置かれたとき」）
              | { opponentHandAtLeastOwnHand: true } // event: "opponentMagicUsed" 限定：発生源の持ち主から見た相手の手札枚数が、自分の手札枚数以上のときのみ発火（state.players[opp].hand.length >= state.players[pid].hand.length。BS13-042ナイト・ゴーンLv2）
              | { opponentMagicUsedAtLeast: number } // event: "opponentMagicUsed" 限定：発生源の持ち主から見た相手が、このターンにマジックの効果を使用した回数（GameState.magicUsedThisTurn。opponentMagicUsedの発火前に加算済み）がこれ以上のときのみ発火（BS13-071巨人港Lv2：2回以上）
              | { burstCostAtMost: number } // event: "ownBurstActivated" 限定：発動したバーストのカードのコスト（eventInfo.burstCost）がこれ以下のときのみ発火（SD06-007英雄龍ロード・ドラゴン：「発動したカードがコスト5以下のとき」）
          repeatPerCount?: boolean // event: "ownFunsaiMilled" | "opponentHandAdded" | "opponentCorePlaced" 用：実カウント数ぶんアクションを繰り返す（省略時/falseは1回のみ。修理屋バラン・バラン／犬人マードック／SD01-029 蠢く地下墓地＝置かれたコア1個につき）
          countMode?: "cores" // event: "ownSpiritCoresRemovedByOpponent" 限定：repeatPerCountの繰り返し回数を「影響を受けたスピリット数」でなく「取り除かれたコア数」にする（省略時は従来どおりスピリット数。既存の極光の大地はこの指定が無いため挙動は変わらない。BS06希望の大灯台Lv1）
          minEventCount?: number // eventCount がこの値以上のときのみ発火（「一度に◯枚以上破棄したとき」。BS04アリゲイド＝5枚以上）
          magicCostEquals?: number // event: "opponentMagicUsed" 限定：使用されたマジックのコストがこれと一致するときのみ発火（BS04氷の女神フリッグ）
          magicTiming?: "main" | "flash" // event: "opponentMagicUsed" 限定：使用タイミングが一致するときのみ発火
          paidCostOnly?: true // event: "ownMagicUsed" 限定：「コストを支払って」使用されたときのみ発火（eventInfo.paidCostで判定）。
          // 「支払った」＝通常の使用手続きを踏んだか（軽減で実質0コストでも支払った扱い）。
          // 「コストを支払わずに使用」と書かれた効果経由の使用（本カード自身の無償使用も含む）だけが除外される（BS11-X05 魔導双神ジェミナイズ Lv2-3。2026-09-07 ユーザー確認）
          magicFreeUseMaxPerTurn?: number // event: "ownMagicUsed" 限定：発生源が実際に無償使用を行った回数（CardInstance.magicFreeUseCount。ターン基準はmagicFreeUseTurn）がこの値未満のときのみ発火。
          // 発動確認で「使わない」を選んだときや候補が無く不発だったときは消費しない（実際に無償使用した回数だけを数える。BS11-X05 魔導双神ジェミナイズ Lv2-3。2026-09-07 ユーザー確認）
          familyFilter?: FamilyFilter // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "ownSpiritExhausted" | "anySpiritExhausted" 限定：破壊/召喚/疲労したスピリットの系統がこれを含むときのみ発火（配列＝いずれかの系統でOR。英雄の喪失／BS04七龍帝の玉座・鋼葉の樹林）
          // ※ 破壊/召喚は eventInfo.families（**カード静的な系統**）で判定する。疲労イベントは families を渡さないため、
          //    selfOverride のインスタンスに対して matchesFamilyFilter で**継続付与された系統も含めて**判定する
          //    （BS02生み出される尖兵：自身のLv1が与える「武装」を Lv2 が見る）
          fromHandOnly?: true // event: "ownSpiritSummoned" 限定：**手札から**召喚されたときのみ発火（トラッシュ・デッキからの召喚では発火しない。BS11-X05 魔導双神ジェミナイズ）
          sokuSummonOnly?: true // event: "ownSpiritSummoned" 限定：その召喚が**【神速】によるもの**（フラッシュタイミングでの手札からの召喚）だったときのみ発火（「【神速】の効果で召喚されたとき」。BS11-065 満天の牧草地Lv2）。⚠️ keywordFilter:"soku"（＝召喚されたカードが【神速】を持つ）とは別物で、こちらは**その召喚が神速で行われたか**を見る
          fushiSummonOnly?: true // event: "ownSpiritSummoned" 限定：その召喚が【不死】によるものだったときのみ発火（「【不死】の効果で召喚されたとき」。BS09-013ミミズクロ）。
          // 【不死】召喚も通常の召喚と同じくこのイベントを起こす（TIMING_CHART.md）ので、限定したいときだけ指定する
          subjectCombined?: boolean // 指定時、**イベントの主体が合体しているか**で絞る（true=合体スピリット／false=合体していない）。
          // subjectSide（どちら側か）とは別の軸。BS10-070 鎧馬アルファズル＝「合体していない相手のスピリットがアタックしたとき」
          keywordFilter?: Keyword // event: "ownSpiritSummoned" 限定：召喚されたスピリットがこのキーワードエントリを静的に持つときのみ発火（hasKeywordで判定。BS05最古龍の顎：転召持ちが召喚されたとき）。
          // event: "anySpiritAttacked" | "ownSpiritDealtLife" 限定：イベント対象（selfOverride）が該当キーワードを持つときのみ発火（静的・一時付与・継続付与すべて考慮。spiritHasKeywordで判定。BS06冥騎士アンドラー／冥府の深淵／ベルゼビート＝【呪撃】）
          costFilter?: { max?: number; min?: number } // event: "ownSpiritDestroyed" | "anySpiritAttacked" | "ownSpiritExhausted" | "anySpiritExhausted" | "ownSpiritSummoned" 限定：破壊/消滅したスピリット、アタックしたスピリット、疲労したスピリット、召喚されたスピリットのコストがmax以下/min以上のときのみ発火（BS05天使クレイオ：コスト2／BS04鎧装獣ヘイズ・ルーン：コスト1以下／BS05藍紫の虚空：コスト1以下）。ownSpiritSummoned限定：ここで見るのは**カード静的なコスト（本来のコスト）**で、軽減後の支払いコストではない（BS13-003カメレオプス：本来のコストが7以上）
          maxBp?: number // event: "anySpiritAttacked" 限定：アタックしたスピリット（selfOverride）の実効BPがこれ以下のときのみ発火（BS08ダークスカルデーモン：BP6000以下）
          subjectMaxCores?: number // event: "anySpiritAttacked" 限定：アタックしたスピリット（selfOverride）の上に置かれているコア数がこれ以下のときのみ発火（filter.maxCoresの兄弟。fieldEventの主体は場を離れないため直接inst.coresで判定できる。BS13-063血塗られた魔具＝2個以下。両陣営に効く＝ownOnlyは指定しない）
          symbolCount?: number // event: "anySpiritAttacked" 限定：アタックしたスピリット（selfOverride）のシンボル数がこれと完全一致するときのみ発火（instanceSymbolCountで判定。BS12-037オリンピアの天使ベトール：シンボル2つ）
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
          then: "castThisMagicFree" | "deployThisNexusFree" | "summonThisSpiritFree" // castThisMagicFree=このマジックの効果をコストを支払わず即時に発揮（BS06ディスコンティニュー）／deployThisNexusFree=このネクサスをコストを支払わず配置（BS08鳳翼の聖剣）／summonThisSpiritFree=器AR：このスピリットカードをコストを支払わず召喚する（BS13-034ミノガメン）
          optional?: true // 器AR：「〜できる」＝任意。interactiveTargetsでは確認を出す（PendingChoice.spiritMillFreeSummon。非対話は自動で召喚する）。summonThisSpiritFree専用
          thenProtectDeckThisTurn?: true // 器AR：この召喚が成立したときだけ、このターンの間、持ち主のデッキは（相手の効果では）破棄されなくなる（GameState.turnConstraintsにnoDeckMillForPidThisTurnを積む。BS13_PLAN.md §1 #27＝「召喚しなければデッキ破棄防止も付かない」）
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          whileCombined?: true // 【合体時】＝このカードが合体しているときだけ発揮する（docs/design/BRAVE.md §12.3）。
          // BS10-074 きぐるみクマッターの「疲労状態のネクサスすべての効果は発揮されない」が使う
          whileOwnBurstSet?: true // 発生源の持ち主が自分のバーストエリアにカードをセットしている間だけ発揮する（docs/design/BURST.md）
          constraint: GlobalConstraintDef // フィールド発生源から全スピリット／全ネクサスに効く制約（発生源の持ち主を問わない。ただしownNexusIndestructibleは発生源の持ち主自身のみに効く）
          condition?: { ownVanillaSpiritsAtLeast?: number; allOwnNexusesHaveColor?: Color; ownNexusCountExactly?: number; ownFamilyCountAtLeast?: { family: FamilyFilter; count: number } } // ownNexusCountExactly＝発生源の持ち主のフィールドのネクサス数がちょうどこの数のときだけ有効（BS11-027 海戦機ニヨルドLv2＝ネクサスが1つだけある間、そのネクサスは破壊されない） // constraint: "ownNexusIndestructible" 用の発揮条件。ownVanillaSpiritsAtLeast＝発生源の持ち主のバニラスピリット数がこれ以上（サファイアの城壁）。allOwnNexusesHaveColor＝**持ち主のネクサスすべてが**その色を持つとき（BS11-069 黄金の鐘楼＝「自分のネクサスすべてが黄の間」。発生源自身も数に入る） // ownFamilyCountAtLeast＝発生源の持ち主のフィールドに指定系統（配列＝OR）のスピリットがcount体以上（constraint:"ownLifeFloor"用。BS12-070天の階Lv2＝「天霊」5体以上）
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
          superAwakenOnly?: true // 指定時は【超覚醒】を持つスピリットにだけ有効（canAwakenFromReserveの第3引数instで判定。BS13-002鎧竜人アンキロングLv2：「自分のスピリットの【超覚醒】の効果を使用するとき」＝超覚醒持ち限定。効果文は「かわりに」だが、リザーブを追加の選択肢にする実装は結果として同じ選択肢を提供するため許容する簡略化）
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
          scope?: "self" // 指定時は「手札にあるこのカード自身」の効果（hasTrashSymbolReductionと同型）。
          // costSetOverride は cardData.effects を直接見て判定する（effectSourcesの発生源走査では拾えないため）。BS10-059フォート・ゴレム
          condition?: { ownNexusAtLeast: number } | { ownLifeAtMost: number } | { ownTrashFamilyCountAtLeast: { family: FamilyFilter; count: number } } // ownLifeAtMost＝発生源の持ち主のライフがこれ以下のときのみ有効（BS11-X03 星騎士ハーキュリーΩ＝ライフ3以下の間、手札のこのカードのコストを4にする）。// scope:"self"用：発生源の持ち主（＝このカードを使おうとしているプレイヤー）のネクサス数がこれ以上のときのみ有効（BS10-059＝1以上）
          // ownTrashFamilyCountAtLeast＝発生源の持ち主のトラッシュにある、指定系統（配列＝OR）を持つ**スピリットカード**の枚数がcount以上のときのみ有効（BS12-016骸巨人ギ・ガッシャ：トラッシュに「無魔」5枚以上でコスト3）
      }
    | {
          id: string
          kind: "activated"
          whileCombined?: true // 【合体時】＝**このブレイヴが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // 起動の対象は合体中のブレイヴ自身の instanceId だが、効果の self には**ホスト（合体スピリット）**が渡る
          // （効果文の「このスピリット」は合体スピリットを指すため。BS12-050 突機竜アーケランサー）
          timing: "flashBattle" | "flash" | "main" // 発動可能タイミング。flashBattle＝フラッシュ中のバトルのみ／flash＝フラッシュで使えるタイミング全般（バトル外も含む。BS08機人フィアラル）／
          // main＝**自分のメインステップ中の任意のタイミング**（バトル中は不可。フラッシュ優先権も見ない）。
          // 『自分のメインステップ』としか書かれておらず「ステップ開始時」の指定が無い効果はこちら。
          // kind:"step" step:"main" は**ステップ開始時に自動で発揮する**ので別物（BS04-065機織のハーフェレシテ＝「ステップ開始時」の明記あり）
          levels: number[] | null
          // 『自分のアタックステップ』のようにステップと手番を明示している効果の絞り込み（AuraDef.phaseTurn と同型）。
          // timing だけでは「フラッシュで使えるタイミング全般」になり、相手ターンにも撃ててしまうため、
          // 印刷テキストがステップを明示しているカードには必ず付ける（SD06-005 ツインブレード・ドラゴン＝
          // フラッシュ『自分のアタックステップ』／BS11-067・BS13-026・BS13-062＝『お互いのアタックステップ』）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          // 発動コスト。reserveToTrash=リザーブからトラッシュへ置くコア数／
          // exhaustSelf=このスピリット自身を疲労させる（既に疲労していれば発動不可。BS07桜の妖精オウカ）。
          // **省略時は追加コストなし**（BS08帝竜騎サイクル＝「ターンに1回、〜できる」だけでコストの記載が無い）
          cost?: { reserveToTrash: number } | { exhaustSelf: true } | { selfCoresToTrash: number } | { discardHandFamily: FamilyFilter } // selfCoresToTrash=**発生源自身**の上のコアをこの数だけ持ち主のトラッシュへ（足りなければ発動不可。BS11-067 白き楯の長城Lv2＝このネクサスのコア3個）。discardHandFamily=自分の手札にある指定系統（配列＝OR）のスピリットカード1枚を破棄する（払えなければ発動不可。候補2枚以上ならinteractiveTargetsで選ばせ、非対話はコスト最大の1枚を自動選択。BS13-062光り輝く大銀河Lv2：神星/光導）
          oncePerTurn?: true // 「ターンに1回」。**発生源のスピリット1体につき**ターン1回（同名が2体いればそれぞれ1回使える）。
          // 消費は CardInstance.activatedUsedTurn に effectId ごとのターン番号で記録する（BS08帝竜騎サイクル6枚）
          condition?: "selfInBattle" // 発動条件（self が現在のバトルの当事者＝attacker/blocker）
          action: EffectAction // 発動時の効果
      }
    | {
          id: string
          kind: "altSummonFromHand" // 手札にある**このカード自身**の代替召喚ルート。
          // 通常の召喚とは別に、召喚コストの代わりに指定の支払い（cost）をして召喚できる（「できる」＝任意。
          // 実装は通常の summon アクションに altSummonNexusInstanceIds を渡す形で乗せる。維持コアは通常どおりリザーブから払う。
          // BS10-058水星神龍メルクリウス・サーペント：青のネクサス1つをデッキの下に戻すことでコストを支払わずに召喚できる
          levels: null
          timing: "main" // 自分のメインステップ中の任意のタイミング
          cost: { returnOwnNexusToDeckBottom: { color: Color; count: number } } // 指定色の自分のネクサスcount個をデッキの下（末尾）に戻すことがコスト
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
          whileCombined?: true // 【合体時】＝**このブレイヴが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。scope:"self"専用：ブレイヴが合体しているホスト（合体スピリット）が破壊されるときに、ホストの破壊を代わりに防ぐ（効果文の「このスピリット」はホストを指す）。合体中ブレイヴのscope:"self"はカード自身（getCard(inst.cardId)）の走査では拾えないため、tryReviveOnDestroyがinst（ホスト）のcombinedBravesを別途走査する（BS12-052デス・ヘイズ）
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
          combinedOnly?: true // scope:"ownAll" 用：**合体スピリットのみ**対象（instIsCombinedで判定。BS12-068光の聖剣Lv2＝「自分の合体スピリットが破壊されたとき」。revived:{toHand:true}と組むと、手札へ戻るのはホストのスピリットカードだけで、合体していたブレイヴはdetachBravesOnLeave経由で通常の「残す」確認に入る＝別途の実装は不要）
          requireOwnFieldHasName?: string // 持ち主のフィールド（スピリット）にこのカード名を持つ個体が1体以上いるときのみ有効（BS05プリンセス・スノーホワイト：自分のフィールドに[ドワッフー・セブン]がいるとき）
          when: {
              byOpponentEffect?: boolean // 相手の効果による破壊のみ（context.sourcePidが相手のとき）。効果文が「相手の**スピリット/ネクサス/マジックの効果で**破壊されたとき」と書いているカード（チャガマル／紫水晶の森／ブラックリチュアル）
              byOpponent?: boolean // 「**相手によって**破壊されたとき」＝相手の効果による破壊 **または** バトルのBP比較による破壊（BS12-X05 戦神乙女ヴィエルジェ Lv2-3。2026-09-07 ユーザー確認）。
              // 自分の効果で自分のスピリットを破壊した場合は含まない。byOpponentEffect より広い（同じ弾の BS12-023 が「効果で」と明示しているのと書き分けられている）
              byBattleVsArmorColor?: boolean // 装甲で指定した色の相手とのBP比較による破壊のみ
              byBattleVsHeavyArmorColor?: boolean // 器AI：【重装甲】で指定した色の相手とのBP比較による破壊のみ（hasHeavyArmorAgainstで判定。byBattleVsArmorColorの重装甲版。BS13-067光導く巨塔：「【重装甲】で指定された色の相手のスピリットに破壊されたとき」）
              byBattle?: boolean // BP比較による破壊のみ（context.battleがあるとき）
              byBattleKillerLevel?: number // BP比較による破壊で、破壊した側（勝者）のcurrentLevel（context.battle.attackerLevel）がこの値のときのみ
              byBattleKillerMaxBp?: number // BP比較による破壊で、破壊した側（勝者）の実効BP（context.battle.attackerBp）がこの値以下のときのみ（BS08勝者のグリーンフィールドLv2＝BP7000以下）
          }
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 発動できるステップ条件（発生源の持ち主基準。"both"=どちらのターンでも）
          revived: { rested: boolean } | { toHand: true; braveStay?: "rested" | "refreshed" } // 戻るときの状態（false=回復状態、true=疲労状態）／toHand=場に留まらず持ち主の手札に戻る（コアはリザーブへ、カードは手札へ。トラッシュは経由しない）。器AT：braveStay指定時（combinedOnly併用）は、ホストに合体していたブレイヴを通常の「残す」確認（コア支払い）に乗せず、**無償かつ指定状態のまま**フィールドへ残す（BS13-057ポッポール：「ブレイヴを回復状態でフィールドに残し、スピリットだけを手札に戻す」）。省略時は従来どおりdetachBravesOnLeave（残すか確認しコアを払う）へ流す
          cost?: {
              sourceCoresToTrash?: number // **発生源自身**（このネクサス等）の上のコアをこの数だけ持ち主のトラッシュへ。足りなければ支払い不可＝不発（scope:"ownAll" 用。BS11-066 発見されし世界樹Lv2＝このネクサス上のコア3個）
              keepOneCoreRestToTrash?: boolean // 自身のコアを1個だけ残し、残りを持ち主のトラッシュへ
              oneCoreToVoid?: boolean // 対象のコア1個をボイドへ（コア1個の個体は支払い不可＝不発）
              oneCoreToTrash?: boolean // 対象のコア1個を持ち主のトラッシュへ。**コア1個の個体でも支払う**（2026-08-14 ユーザー確認）。
              // 破壊待機中はコアが乗ったままなので支払いは成立し、待機解除の後に維持コア割れで消滅する（BS09-063花の宮殿）
              reserveOneToTrash?: boolean // 持ち主のリザーブのコア1個を持ち主のトラッシュへ（リザーブ0なら支払い不可＝不発。果て無き地平線）
              fieldOrReserveOneToTrash?: boolean // 持ち主のリザーブのコア1個（無ければ自分のフィールド＝スピリット/ネクサス、発生源自身を除く、からコア1個）を持ち主のトラッシュへ（どちらも無ければ支払い不可＝不発。BS04宝石虫スカラベール）
              handDiscardOne?: boolean // 持ち主の手札1枚（末尾＝決定的簡略化）をトラッシュへ。手札0枚なら支払い不可＝不発（BS06暴かれた墓石Lv2）
              handDiscardCardType?: CardType // 指定時はhandDiscardOneが破棄する手札を末尾からその種別に絞って探す（該当が無ければ支払い不可＝不発）。省略時は従来どおり種別を問わず末尾1枚（BS10-046龍仙公主＝magic）
              millSelfOneMatching?: { color: Color; cardType: CardType } // 自分のデッキを上から1枚破棄し、そのカードが指定の色・種別に一致したときだけ成立（一致しなければ支払い不可＝不発。デッキが空でも不発。BS07冥勇士デスカラビア＝紫のスピリットカード）
              exhaustOwnFamilyOne?: FamilyFilter // 持ち主のフィールドの、この系統（配列＝OR）を持つ回復状態のスピリット1体（実効BP最小＝犠牲を最小化する簡略化。破壊される個体自身は除く）を疲労させる。該当なしなら支払い不可＝不発（BS07パオ・ペイール＝「想獣」）
              ownLifeOneToVoid?: boolean // 持ち主のライフのコア1個をボイドへ（リザーブへは戻らない）。ライフ0枚なら支払い不可＝不発。支払った結果ライフが0になった場合はそのまま勝敗が決まる（BS08太陽石の神殿）
              ownLifeOneToReserve?: boolean // 器AR：持ち主のライフのコア1個を自分のリザーブへ。ライフ0枚なら支払い不可＝不発（BS13-036星鳥クージャ：「自分のライフのコア1個を自分のリザーブに置くことで」）
              millSelfCount?: number // 器AR：自分のデッキを上からこの枚数だけ無条件に破棄する（millSelfOneMatchingと違い一致判定はなし。デッキが尽きていれば0枚でも成立＝COST_MODEL.md「あるだけ処理してコストも払う」。BS13-040金星神龍ヴィーナ・フェーザー：デッキ上3枚）
              exhaustOwnSameFamilyOne?: true // 器AR：**このスピリット自身の系統（配列＝OR。カード静的なfamily）と一致する**、自身以外の持ち主のフィールドの回復状態スピリット1体を疲労させる（exhaustOwnFamilyOneの「自身と同じ系統」動的版。候補は実効BP最小を選ぶ＝犠牲を最小化する簡略化。BS13-X05麒麟星獣リーン：「このスピリットと同じ系統を持つ自分のスピリット1体を疲労させることで」）
              opponentLifeOneToTrash?: true // 器BW：**相手**のライフのコア1個を相手のトラッシュに置く（ownLifeOneToVoid等の自分版とは別軸）。相手のライフが0なら支払い不可＝不発。支払った結果相手のライフが0になれば持ち主の勝利が決まる（【呪滅撃】の定義そのもの。BS14-X02呪の覇王カオティック・セイメイLv3：「相手のライフのコア1個を相手のトラッシュに置くことで、このスピリットは回復状態でフィールドに残る」）
          }
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
          whileCombined?: true // 【合体時】＝**発生源自身が合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3）。
          // ⚠️ **このキーはゲートを実装した kind にしか宣言していない**。他の kind に書くと
          // validate:cards の「型宣言の無いキー」検査が落ちる（BS13-005強暴竜ディラノ・レックス【合体時】Lv3）
          onlyWhileSpiritState?: true // whileCombinedの逆：**発生源自身がスピリット状態（合体していない）のときだけ**発揮する。
          // combinedBravesは合体中もeffectSources()に含まれ続けるため、whileCombinedを付けない継続付与は既定では
          // 合体後も効き続ける。これを明示的に止める（BS13-056ホーク・ブレイカー：「このブレイヴがスピリット状態の間」）
          keyword: Keyword
          target: "ownAll"
          combinedFilter?: true // 指定時は対象（合体スピリット。instIsCombinedで判定）のみ（constraintGrant.combinedFilterと同型。BS13-005強暴竜ディラノ・レックス：系統「地竜」を持つ自分の**合体**スピリットすべて）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ（BS06冥府の深淵：冥主/無魔）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。familyFilterとはAND条件。BS03バッチ）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効。**2026-08-24 追加**：データには書いてあったが型に無く、実装が読んでいなかった
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時付与・継続付与を考慮。spiritHasKeywordで判定）を持つスピリットのみ（BS05黄道の虚空Lv2：転召持ちに光芒を付与）
          keywordFilterAny?: Keyword[] // keywordFilter の OR 版（いずれか1つを持てば対象）。兄弟の effectEntryGrant と同じ軸（BS12-068光の聖剣Lv1＝【装甲】/【重装甲】持ちに【氷壁】を配る）
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
          kind: "braveImmuneGrant" // 発生源が場にありレベル有効の間、対象スピリットに「相手のブレイヴの効果を受けない」を継続付与する。
          // 【装甲】【重装甲】とは完全に別枠の**第3の耐性軸**（BS12_PLAN.md §1 の1と同じ線引き。KEYWORD_INCLUDESには入れない）。
          // CardInstance.braveImmuneAll / braveImmuneMatchArmorColors へEffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、
          // shared/rules.hasBraveImmuneAgainstが参照する（BS12初出）
          levels: number[] | null
          target: "self" | "ownAll"
          scope: "all" | "matchArmorColors" // all=色を問わず相手のブレイヴの効果を受けない（BS12-028セイルフィッシュLv2）／matchArmorColors=対象が持つ【装甲】の色と一致する色の相手のブレイヴだけ防ぐ（BS12-067月光集める塔Lv2）
          colorFilter?: Color // target:"ownAll" 用：この色を持つスピリットのみ（instHasColorで判定。BS12-028＝白）
          keywordFilter?: Keyword // target:"ownAll" 用：このキーワードを持つスピリットのみ（spiritHasKeywordで判定。BS12-067＝armor）
          phase?: Phase // 指定時はこのステップの間のみ有効
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『相手のメインステップ』を表す（BS12-028）
      }
    | {
          id: string
          kind: "armorEffectiveGrant" // 【合体時】等で「このスピリットが持つ【装甲】（付与された分も含めた実効の色）を自分のスピリットすべてに与える」。
          // keywordGrantのkeyword:"armor"と違い、**発生源自身の実効【装甲】色を都度算出して配る**のが差（BS12-031メカニフォンLv2）。
          // EffectModules.refreshLevelAsOverridesが**2パス目**（①静的＋通常付与が確定した後）で処理する（循環回避。配布元自身も配布対象に含む）
          levels: number[] | null
          target: "ownAll"
          whileCombined?: true // 【合体時】＝発生源自身が合体しているときだけ発揮する（BS12-031メカニフォンLv2）
      }
    | {
          id: string
          kind: "effectEntryGrant" // 発生源が場にありレベル有効の間、対象スピリットに**任意のeffectエントリ本体**を継続付与する。
          // effectGrant は誘発（trigger+action）しか配れないため、magicNegate等の常在エントリを配るための兄弟（BS12-068光の聖剣Lv1）。
          // CardInstance.grantedMagicNegateへEffectModules.refreshLevelAsOverridesが毎回全消去→再構築し、
          // triggers.findMagicNegateSourceがcard自身のeffectsと合わせて走査する。**疲労コストは配られた側自身**を疲労させる
          levels: number[] | null
          target: "ownAll"
          keywordFilterAny?: Keyword[] // 対象がこのいずれかのキーワードを持つスピリットのみ（OR。BS12-068＝armor/heavyArmor）
          granted: Extract<EffectDef, { kind: "magicNegate" }> // 付与するエントリ本体（levelsは常に有効扱い）
      }
    | {
          id: string
          kind: "familyGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに系統を継続付与する（ポム／生み出される尖兵）
          levels: number[] | null
          whileCombined?: true // 【合体時】＝**発生源自身が合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3。BS13-X05麒麟星獣リーン【合体時】Lv3）
          target: "ownAll" | "self" // 器BH：self＝発生源自身にだけ付与する（familiesFromOwnField専用。BS13-X05麒麟星獣リーン【合体時】Lv3）
          family?: string // 付与する系統（familyFromChoice / familiesFromOwnField 指定時は不要）
          familyFromChoice?: true // family の代わりに、発生源インスタンスの lentChoiceFamily（貸与時にプレイヤーが選んだ系統）を付与する（音鳥クルーク）
          familiesFromOwnField?: true // 器BH：family の代わりに、**持ち主のフィールドのスピリットが（カード静的に）持つ系統すべて**を動的に付与する（target:"self"専用。付与系統の再帰を避けるため静的familyのみ見る。BS13-X05：「自分のスピリットすべてが持つ系統すべてを与える」）
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
          costs?: number[] // 複数の値を同時に与える（「コスト3/4のスピリットとしても扱う」。BS11-064 闇の聖剣）
          whenDestroyedOnly?: true // 指定時は**破壊されたときの判定にだけ**効く（CardInstance.alsoCostsWhenDestroyed に入り、【不死】の引き金コスト判定だけが読む）。
          // 効果文が「自分のスピリットが破壊されたとき、そのスピリットをコスト3/4のスピリットとしても扱う」と場面を限っているため、
          // 常時の alsoCostsContinuous（コスト参照の効果すべてに効く）とは別の置き場にする（2026-09-02 ユーザー確認。BS11-064 闇の聖剣Lv1）
          plus?: number // 指定時は固定値ではなく「**元のコスト+plus**としても扱う」（SD02-013 転召の祭壇Lv2＝コスト+3）。
          // 目的は【転召：コスト◯以上】の条件を満たしやすくすること（2026-08-16 ユーザー確認。docs/design/SD02_PLAN.md §1）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          combinedOnly?: true // 器AY：合体スピリット（instIsCombined）のみ対象（BS13-069星空のコンサートホールLv2：「自分の合体スピリットすべてはコスト2としても扱う」）
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
          selfOnly?: true // 器BJ：対象を**発生源自身のカード（手札にあるこのカード）だけ**に絞る（cardData.cardId === source.cardIdで判定。BS13-039神獣バーロン：「手札にあるこのスピリットカードに」）
          symbolCountFromFamily?: FamilyFilter // 器BJ：symbolsを固定1組ではなく、**持ち主のフィールドの指定系統（配列＝OR）のスピリット数ぶん**繰り返し付与する（BS13-039：「系統：「戯狩」を持つ自分のスピリット1体につき」）
          symbols: Color[] // 与える軽減シンボル（symbolCountFromFamily指定時は先頭の1色を繰り返す）
          replace?: true // 指定時は素の印刷軽減シンボル（cardData.reduction）を**置き換える**（加算ではなく置換。効果文「シンボルを◯にする」。BS08超時空重力炉Lv2：軽減シンボルを白3つにする＝白1つ＋白2つ追加ではなく白3つに置換）。省略時は従来どおり加算
          vanillaFilter?: true // 指定時は対象カードが効果の記述を持たない（バニラ）ときのみ付与（isVanillaCardで判定。BS10-080炎の結晶石：効果の記述を持たないスピリットカード）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（BS07リボーンフレイム）
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』。BS06賢獣アイベリックス＝アタックステップ）
          turn?: "own" | "opponent" // phaseと併用: 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（『自分の〜ステップ』限定。BS14-074千識の渓谷：自分のメインステップ）
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // 発生源の持ち主のスピリット+ネクサス合計が指定色でcount以上（ペンタン）
              | { ownColorSpiritsAtLeast: { color: Color; count: number } } // 発生源の持ち主の指定色スピリットがcount体以上（ネクサスは数えない。BS04黒の妖精ティ・ターニャ）
      }
    | {
          id: string
          kind: "trashSymbolReduction" // 対象のカードは、フィールドのシンボルに加え自分のトラッシュにあるカードのシンボルでも召喚コストを軽減できる（BS10-092明星きらめく花園／BS10-X05堕天神龍ヴィーナ・ルシファー）
          levels: number[] | null
          scope: "self" | "ownHand" // self=手札にあるこのカード自身にだけ効く（X05）／ownHand=発生源の持ち主の手札のカードに効く（092＝ネクサス）
          cardType?: CardType // scope:"ownHand" 用の絞り込み（092＝spirit）
          cardColor?: Color // scope:"ownHand" 用の絞り込み（092＝yellow。cardHasColorで判定）
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
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ対象（instIsVanillaで判定。BS12-071未完成の古代戦艦：帆）
          against: "magic" | "bounce" // magic=相手のマジックの効果を受けない（ポークン等）／bounce=相手の効果によるバウンス（returnToHand/returnAllToHand）を受けない。自分自身の効果によるバウンスは対象外（BS06恐竜姫ジュラ）
          condition?: { ownCostCountAtLeast: { cost: number; count: number } } // 発生源の持ち主のフィールドに指定コストのスピリットがcount体以上のときのみ有効（BS05リトルナイト・ランスロット：コスト2が3体以上）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効（BS12-071未完成の古代戦艦：帆Lv1-2＝『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "costDelta" // 発生源が場にありレベル有効の間、対象スピリットのコストを amount だけ増減する（継続）。
          // EffectModules.refreshLevelAsOverrides が CardInstance.costDeltaContinuous へ毎回再計算し、
          // shared/rules.instCostDelta が読む（コストを見る判定すべてに一度で効く）。
          // ⚠️ **増減は置き換えであって追加ではない**（tempCostDelta と同じ。「コスト+3」したスピリットは
          // 「コスト3以下を破壊」にもう当たらない）。BS11-017 ムシャツバメLv2-3＝『自分のアタックステップ』このスピリットをコスト+3
          levels: number[] | null
          target: "self" | "ownAll"
          amount: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効
      }
    | {
          id: string
          kind: "trashSummonOnNameSummoned" // **トラッシュにあるこのカード自身**の効果：持ち主のフィールドに、
          // カード名に nameIncludes を含むスピリットが召喚されたとき、このカードをコストを支払わずに召喚できる（任意）。
          // 【不死】（fushiCandidates）と同じく**トラッシュに置かれたカードが発生源**なので effectSources では拾えず、
          // fireSummonSequence が持ち主のトラッシュを走査する（BS11-004 プロミネンスワイバーン＝「太陽」）。
          // 維持コアはリザーブから払う（払えなければ確認自体を出さない）
          levels: null
          nameIncludes: string
      }
    | {
          id: string
          kind: "levelAs" // 継続的な「Lv◯として扱う」置換（EffectModules.refreshLevelAsOverridesが毎回再計算する。ナイフ投げのジャグリーン／トパーズの流星）
          levels: null
          whileCombined?: true // 【合体時】＝このカードが合体しているときだけ発揮する（docs/design/BRAVE.md §12.3）。
          // 走査は EffectModules.refreshLevelAsOverrides の levelAs 分岐で見る
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsAll" | "ownSpiritsByKeyword" | "ownSpiritsByFamily" | "ownSpiritsVanilla" | "opponentSpiritsAll" | "allSpiritsByChosenColor" | "opponentBlockersOfOwnKeyword" // ownSpiritsAll=発生源の持ち主のスピリットすべて（修飾なし。BS10-056蒼天大聖モンゴクウ「自分のスピリットすべてを、そのスピリットが持つ最高Lvとして扱う」）／ownSpiritsByKeyword=keywordFilterのキーワードエントリを静的に持つ持ち主のスピリットすべて（レベル不問。斬竜刀のガイ／崩壊する戦線）／ownSpiritsByFamily=familyFilterの系統（配列＝OR。matchesFamilyFilterで判定）を持つ持ち主のスピリットすべて（BS06マッスルチャージ：闘神）／ownSpiritsVanilla=カードに効果の記述を持たない（バニラ）持ち主のスピリットすべて（サファイアの城壁）／opponentNexusesAll=発生源の持ち主の相手の全ネクサス（ウッド・ゴレム）／opponentSpiritsAll=発生源の持ち主の相手の全スピリット（BS03フォーカード／BS04ジャッジメントライツ）／allSpiritsByChosenColor=両陣営の、貸与時に選ばれた色（CardInstance.lentChoiceColor）を持つスピリットすべて（BS02-111スピリットイリュージョン）
          treatAs: number | "max" | "coresScaled" | { plus: number } // 扱うレベル。
          // 数値=そのレベル固定／"max"=対象カード自身が持つ最高Lv（card.levelsのlevel最大値。対象ごとに算出）／
          // "coresScaled"=対象のコア数で換算（1個→Lv1、2個→Lv2、3個以上→"max"と同じ。サファイアの城壁）／
          // **{ plus: N }=いまのレベルから相対的にN上げる**（BS10-094 未完成の古代戦艦：竜骨Lv2
          // 「Lvを1つ上のものとして扱う」。2026-08-25 ユーザー確認で「文字どおり」）。
          // ⚠️ 相対シフトは**そのカードが持つ最高Lvで頭打ち**にする：Lv1-Lv2 のカードが Lv2 のとき
          // 「1つ上」は Lv3 になるが、そのレベル定義が無いと levelOf が置き換えを黙って無視して
          // **効果が無言で消える**（レベル表に無い override はフォールバックされる仕様のため）
          costMinFilter?: number // target: "ownSpiritsAll" 用：対象スピリットのコストがこれ以上のときのみ（付与コストも見る＝instAllCosts。aura.costMinFilter と同じ意味。BS11-047 海王神獣トライ・ポセイドス＝コスト7以上）
          nameContains?: string // target: "ownNexusesAll" 用：カード名にこの文字列を含む自分のネクサスのみ対象（BS13-072未完成の古代戦艦：羅針盤Lv2：「カード名に「古代戦艦」と入っている自分のネクサスすべてをLv2として扱う」）
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
              | { ownBurstSet: true } // 発生源の持ち主が自分のバーストエリアにカードをセットしている間有効（docs/design/BURST.md。SD06-003ワン・ケンゴー＝「自分のバーストをセットしている間、このスピリットをLv3として扱う」）
          sourceMinLevel?: number // 発生源の素のレベル（コア数基準。上書き無視）がこれ以上のときのみ有効
          sourceLevels?: number[] // 発生源の素のレベル（コア数基準。上書き無視）がこの配列に完全一致で含まれるときのみ有効（sourceMinLevelの完全一致版。ウッド・ゴレム）
      }
    | {
          id: string
          kind: "bpAs" // 継続的な「BPを◯として扱う」置換（levelAsのBP版。EffectModules.refreshLevelAsOverridesが毎回再計算する。CardInstance.bpAsContinuous。器Q。BS13-X011光導龍騎ゾディアックアポロクリムゾン【合体時】Lv2：「系統：「光導」を持つ自分のスピリットすべてのLv1/Lv2/Lv3BPを12000として扱う」＝場にいる間ずっと実効BPが固定される。BS12のsetBattleBpFixedはバトル中だけなので別物）
          levels: number[] | null
          whileCombined?: true // 【合体時】＝発生源自身が合体しているときだけ発揮する（docs/design/BRAVE.md §12.3）
          target: "ownSpiritsByFamily" // 現状はこれだけ対応。増やす必要が出たらlevelAsに合わせる
          familyFilter: FamilyFilter
          amount: number
      }
    | {
          id: string
          kind: "nexusAsSpiritDuringAttackStep" // 器BJ：発生源が場にありレベル有効の間、条件に合う自分のネクサスを
          // **お互いのアタックステップの間だけ**スピリットとして扱う（treatOwnNexusesAsSpiritsThisTurn＝BS03ゴーレムクラフトの
          // ターン限定版に対する、アタックステップ限定版。field.nexuses→field.spiritsへ**同じインスタンスのまま**移し、
          // ステップ終了で戻す。中身はasSpiritThisTurnと同じ上書き（cost/family/spiritLevels）を積み、
          // CardInstance.asSpiritAttackStepScopedで「アタックステップ終了時に戻す対象」だと示す。
          // 移動・復帰は PhaseManager.applyAttackStepNexusAsSpirit / revertAttackStepNexusAsSpirit が
          // toAttackPhase / endTurn のフックから呼ぶ（BS13-048古代戦艦アルゴ・ゴレムLv2：
          // 「カード名に「古代戦艦」と入っている、コアが1個以上の自分のネクサスすべては、ネクサスとしての
          // 効果を失い"コスト：6/系統：「造兵・星魂」/Lv1コスト：1/Lv1BP：8000/効果の記述なし"のスピリットとして扱う」）
          levels: number[] | null
          nameContains?: string // カード名にこの文字列を含む自分のネクサスのみ対象（省略時は絞り込みなし。BS13-048＝「古代戦艦」）
          minCores?: number // コアがこの数以上のネクサスのみ対象（省略時1。treatOwnNexusesAsSpiritsThisTurnと同じ既定。BS13-048＝「コアが1個以上の」）
          cost: number
          family: string[]
          spiritLevels: LevelDef[]
      }
    | {
          id: string
          kind: "colorAs" // 発生源自身（target:"ownAll" 指定時は持ち主のスピリットすべて）が指定色のスピリットとしても扱われる（継続。EffectModules.refreshLevelAsOverridesが毎回再計算する。levelsで発動レベルを指定＝百面相のフラットフェイス）
          levels: number[] | null
          colors: Color[]
          target?: "self" | "ownAll" | "ownNexusesAll" // 省略時は "self"。"ownAll"＝発生源の持ち主のスピリットすべて（妖精ティングリー）／"ownNexusesAll"＝発生源の持ち主のネクサスすべて（BS12-042ヒノキ・ゴレムLv2「自分のネクサスすべては青のネクサスとしても扱う」）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効。aura.lentOnly と同じ意味（妖精ティングリー）
          nameIncludes?: string // target:"ownAll" 用：カード名にこの文字列を含むスピリットのみ（cardNameContainsで判定。BS12-027近衛機クリザンテMk-VIII Lv2＝[月光神龍ルナテック・ストライクヴルム]）
          turn?: "own" | "opponent" // 指定時、発生源の持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（BS12-027Lv2＝『相手のターン』）
      }
    | {
          id: string
          kind: "symbolAddGrant" // 発生源が場にありレベル有効の間、対象（target:"self"=発生源自身／"ownAll"=持ち主のスピリットすべて。filterでさらに絞る）に
          // 指定色のシンボルをcount個（counter指定時はEffectCounterの値）継続的に追加する。**盤面のシンボル数に効く**
          // （2026-09-04ユーザー確認）。EffectModules.refreshLevelAsOverridesが毎回全消去→再構築しCardInstance.symbolsAddedContinuousへ反映。
          // instanceSymbolCount / countSymbols の両方がこれを見るため、軽減計算にもライフダメージにも効く。
          // symbolsOverrideContinuous（kind:"symbolFix"）が有る個体では固定値が勝つ既存の規則は変えない＝固定値に追加分を加算する。BS12-006竜拳士アルディ・バロン／BS12-X01金牛龍神ドラゴニック・タウラス
          whileCombined?: true // 【合体中】＝**発生源自身（ホストのスピリット）にブレイヴが合体しているときだけ**発揮する（docs/design/BRAVE.md §12.3。BS12-X04と同型のホスト側【合体中】。BS13-X04獅機龍神ストライクヴルム・レオ【合体中】Lv3）
          levels: number[] | null
          target: "self" | "ownAll"
          filter?: TargetFilter // target:"ownAll" 用の絞り込み（braveInSpiritState / combined / symbolCount 等。matchesTargetで判定）
          color: Color
          count?: number // 省略時1
          counter?: EffectCounter // 指定時はcountを無視し、カウント値ぶん追加する（0なら追加しない）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          condition?: { ownFieldHasBraveInSpiritState: true } // 指定時は持ち主のフィールドにスピリット状態のブレイヴが**いる間**だけ有効（BS13-006炎獣ファイオリックLv2-3：「自分のフィールドにスピリット状態のブレイヴがいる間、このスピリットに赤のシンボル1つを追加する」）
      }
    | {
          id: string
          kind: "symbolFix" // 発生源が場にありレベル有効の間、持ち主の対象スピリット（familyFilter一致）のシンボルを、
          // そのスピリットが元々持つシンボルの1色目でcount個に固定する（複数色シンボルは先頭の色を採用する簡略化）。
          // 継続（EffectModules.refreshLevelAsOverridesが毎回再計算しCardInstance.symbolsOverrideContinuousへ反映）。
          // instanceSymbolCount / countSymbols の両方がこれを見るため、軽減計算（コスト）にも効く。BS08海底に眠りし古代都市
          levels: number[] | null
          target: "ownAll" | "self" // self=発生源自身のシンボルだけを固定する（BS11-039 天使ティアエル）
          familyFilter?: FamilyFilter
          count: number
          color?: Color // 指定時は固定するシンボルの色をこの色にする（省略時は対象が元々持つシンボルの1色目。BS11-039 天使ティアエル＝黄）
          summonReductionOnly?: true // 指定時は**スピリット召喚の軽減計算のあいだだけ**この固定を使う（CardInstance.symbolsForSummonReduction に入り、countSymbols が forSummon のときだけ読む）。
          // 「自分がスピリットカードを召喚するとき、このスピリットのシンボルを黄のシンボル3つにする」＝ライフダメージ等の他のシンボル参照には効かない（2026-09-02 ユーザー確認。BS11-039 天使ティアエル）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効（own=発生源の持ち主がturnPlayer。BS09-008炎皇帝アグニフォンLv2-3＝『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "braveStatsAs" // 発生源が場にありレベル有効の間、持ち主の**スピリット状態のブレイヴすべて**
          // （card.type==="brave" かつ field.spirits にいる個体。合体中のブレイヴは field.combinedBraves
          // にいるため自然に対象外＝BRAVE.md §12.7）のコスト・系統・レベル表（BP）・シンボルを継続的に
          // 上書きする。**そのブレイヴが元から持つ効果は上書きしない**（効果文がステータスにしか
          // 触れていないため）。継続（EffectModules.refreshLevelAsOverridesが毎回再計算し
          // CardInstance.braveStatsAsContinuous / symbolsOverrideContinuous へ反映）。BS10-X06天蠍神騎スコル・スピア
          levels: number[] | null
          target: "ownAll"
          cost: number
          family: string[]
          braveLevels: LevelDef[] // 上書き後のレベル表（BP）。ブレイヴのスピリット状態は常にLv1のみ1件（§2.2）
          symbolCount: number // シンボルを固定する個数。色はそのブレイヴ自身の色（colors[0]）。
          // symbolFixはsymbol[0]（元々持つシンボルの1色目）を使うが、こちらはそれだと使えない
          // （BS10のブレイヴはsymbolが0個のものがあるため）。ブレイヴは全カード単色でcolorsを必ず1つ持つ
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
          whileCombined?: true // 【合体時】＝発生源自身が合体しているときだけ付与する（BS12-024木星魔龍ノブナガード・ゼクスト）
          granted: {
              trigger: TriggerEvent
              action: EffectAction
              // 付与された誘発の発火条件。fireTrigger が渡す targetInstanceId（onBlock ならアタッカー、
              // onBlocked ならブロッカー）を見る。triggered.condition の同名軸と同じ判定
              condition?: { targetMaxCost: number } | { targetMaxBp: number } // BS07ライフセービング＝相手のコスト3以下をブロックしたとき。targetMaxBpはonBattleEnd用（BS14-030グラント・ベンケイLv2＝バトルした相手の実効BPが7000以下）
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
          target: "ownAll" | "self" // 器BK：self＝発生源自身にだけ付与する（BS13-037皇子ペンタン：「このスピリットはカード名：「皇帝アンプルール」としても扱う」）
          nameIncludes: string // 扱わせるカード名の部分文字列
          costFilter?: number // 対象のコストがこれと一致するスピリットのみ（instMatchesCostFilterで判定＝付与コストも考慮）
          colorFilter?: Color // 対象がこの色を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効（BS03パペットストリング）
      }
    | {
          id: string
          kind: "trashNameAs" // トラッシュにあるこのカードは、指定名としても扱う（カード静的。nameAsGrantのトラッシュ版で、
          // フィールドの発生源やレベル判定を持たない＝levelsは無視される。トラッシュのカード名照合はすべて
          // shared/rules.trashCardNameMatchesを通す。BS10-056蒼天大聖モンゴクウ「トラッシュにあるこのスピリットカードは、[猿人モンゴクウ]として扱う」）
          levels: null
          name: string // 扱わせるカード名
      }
    | {
          id: string
          kind: "vanillaAsGrant" // 発生源が場にありレベル有効の間、対象スピリットを「カードに効果の記述を持たないスピリット（バニラ）としても扱う」
          // （instIsVanilla が CardInstance.treatedAsVanillaContinuous を見る。BS04スイッチヒッターLv—＝系統「造兵」）
          levels: number[] | null
          target: "ownAll" | "chosenInstance" | "self" // chosenInstance＝targetChoiceLendThisTurnで選んだ1体だけ（陣営を問わない。source.lentChoiceInstanceIdで判定。BS12-081メロディアスハープ）／self＝発生源自身（【合体時】ならbravesOfのホスト合流でホストに効く。destroyAsMaxLevelGrantのtarget:"self"と同じ考え方。BS12-046ナタ・ゴレム／BS12-059ショゴルス）
          whileCombined?: true // target:"self"のとき、発生源が合体しているときだけ（BS12-059）
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
          target: "ownAll" | "opponentAll" | "chosenInstance" // ownAll=発生源の持ち主のスピリットすべて／opponentAll=持ち主から見た相手のスピリットすべて（BS07ルナースラッシュ）／chosenInstance=targetChoiceLendThisTurnで選んだ1体だけ（陣営を問わない。BS12-081メロディアスハープ）
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
          whileCombined?: true // 【合体時】＝**発生源自身が合体しているときだけ**付与する（docs/design/BRAVE.md §12.3。BS13-X006太陽極龍セブンス・アポロドラゴン【合体時】）
          target: "ownAll"
          minLevel?: number // 対象のcurrentLevelがこれ以上のときのみ付与
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR。matchesFamilyFilterで判定）を持つスピリットのみ（BS06計画された場外乱闘：闘神）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ（instHasColorで判定。BS13-029剣馬グラニム：自分の赤のスピリットすべて）
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
          whileCombined?: true // 【合体時】＝このカードが合体しているときだけ発揮する（docs/design/BRAVE.md §12.3。BS12-047海王神龍トライ・メルクリウス）
          restriction:
              | "oncePerTurnAll" // お互い、ターンに1回しかマジックの効果を使用できない（作戦参謀フォクシン）
              | "noReductionOpponent" // 発生源の持ち主の相手は、マジック使用時に軽減シンボルによるコスト軽減ができない（イワトビペンタン）
              | "noReductionOpponentNexus" // 器AZ：発生源の持ち主の相手は、**ネクサス配置時**に軽減シンボルによるコスト軽減ができない（noReductionOpponentのネクサス版。kindの名前は歴史的に"magicRestriction"のままだが判定はeffectiveCostのnexus分岐で読む。BS13-069星空のコンサートホールLv1-2）
              | "colorLockOpponent" // 発生源の持ち主の相手は、自分（=使用者）のフィールドのシンボルと同じ色を含まないマジックカードを使用できない（力奪う凱旋門）
              | "reserveOnlyOpponent" // 発生源の持ち主の相手は、マジックのコストをすべてリザーブから支払わなければならない（フィールドのコアを支払い元にできない。BS02螺旋の塔Lv2）
              | "noFreeCastOpponent" // 発生源の持ち主の相手は、マジックの無償化（kind:"magicFreeGrant"）を適用できない（力奪う凱旋門Lv2）
              | "costLimitAll" // お互い、maxCost以下のコストのマジックの効果を使用できない（BS05青嵐の虚空Lv2。判定は shared/cost.hasMagicCostLock）
              | "noFlashAll" // お互い、マジックカードのフラッシュ効果を使用できない（BS06軍師ショウジョウジ）
              | "trashColorLockOpponent" // 発生源の持ち主の相手は、**その相手自身のトラッシュにあるマジックカード**と
              // 同じ色を含むマジックカードを使用できない（colorLockOpponent の裏返し。トラッシュが育つほど使える色が減る。
              // SD02-011 獣皇子バハムンドLv2-3）
              | "noFlashOpponent" // 発生源の持ち主の相手は、マジックカードのフラッシュ効果を使用できない（BS06鎖縛の武舞台Lv2）
              | "noSpiritCoresOpponent" // 発生源の持ち主の相手は、マジックのコストを支払うとき、**スピリット上のコア**では支払えない（ネクサス上のコアは可。reserveOnlyOpponentの「フィールド全体」より狭い。BS12-046ナタ・ゴレム）
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
          kind: "exhaustImmunityGrant" // 発生源の持ち主のfamilyFilter一致スピリットは、相手のスピリット/ネクサス/マジックの効果で疲労しない（トランプの王国）。isExhaustImmuneOnBoard（shared/rules.ts）の判定はop:"exhaust"かどうかしか見ずsourceTypeを区別しないため、ブレイヴの効果も同じ経路で防げる
          levels: number[] | null
          familyFilter?: string // scope:"self"のときは省略可（familyFilterとscopeは排他。両方省略しない）
          scope?: "self" // 指定時はfamilyFilterを無視し、**発生源自身だけ**が対象（BS12-012戦車皇ディルガン：「このスピリットは、相手の…効果では疲労しない」）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "lifeDamageNegate" // ブロックされなかったアタッカーの実効BPが発生源の実効BP以下のとき、発生源の持ち主のライフは減らない（硝子の女神フレイア）
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }

// カードマスターデータ（不変）。data.md 4 / 6.1 に対応
