// 効果の定義のうち、事象で起きる誘発（召喚時・ステップ・盤面の出来事・破壊時の復活など）
import type { CardPick, CardType, Color, EffectAction, FamilyFilter, FieldEvent, Keyword, Phase, TriggerEvent } from "../type"

export type EffectDefTrigger =
    | {
          id: string
          kind: "extraStepAfterAttackStep" // 『自分のアタックステップ』終了後、ドロー/リフレッシュ/メインのどれか1つを行う（ターン1回・断れない）。アタックステップが無いターンは発揮しない
          levels: number[]
      }
    | {
          id: string
          kind: "trashReturnAtEndStep" // トラッシュにある間、持ち主の『自分のエンドステップ』に自動で手札へ戻る
          maxCount?: number // 「ターンに1回」＝このcardIdにつき1ターンに戻る上限枚数
      }
    | {
          id: string
          kind: "triggered"
          keyword?: Keyword // 【増幅】等のキーワード能力を持つことを示すラベル（spiritHasLabeledKeyword が判定。UI文言にはまだ使わない）
          trigger: TriggerEvent
          levels: number[] | null
          whileCombined?: true
          combinedBraveColors?: Color[] // 【合体時】併用：合体しているブレイヴのいずれか1つがこの色を持つときのみ発揮（多色は1色でも該当。2026-09-07確認。X008）
          action: EffectAction
          optional: boolean // 「〜できる」= 任意。interactiveTargetsではpendingChoice（option/confirm）で発動確認、選ばなければ発動しない
          eventTarget?: "use" | "ignore" // onBlock/onBlocked/onBattleStart/onBattleEnd では必須（validate-cards）。"ignore"＝行動に渡さない（行動が新たに対象を選ぶ）。condition 等の判定には常に渡す
          oncePerTurn?: true // 「ターンに1回」。発生源1体につきターン1回
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤーごと・カード名ごとに1回（「この効果はターンに1回しか使えない」）
          battleRole?: "attacker" | "blocker" // onBattleWin/onBattleEnd：勝利/生存時の自分の役割がこれと一致する場合のみ発火。省略時は常に発火
          fromHandOnly?: true // trigger:"onDeploy"限定：手札から配置されたときのみ発火
          turn?: "own" | "opponent" // 指定時、発生源の持ち主基準のturn条件のときのみ発火
          condition?:
              | { opponentNexusColorsAtLeast: number } // 相手フィールドのネクサス色数（重複除く）がこれ以上のときのみ発火
              | { ownFieldHasColorSpirit: Color } // 自分のフィールドに指定色のスピリットがいるときのみ発火（timedColors考慮）
              | { ownFieldHasColorNexus: Color } // 自分のフィールドに指定色のネクサスがあるときのみ発火
              | { targetSameLevelAsSelf: true } // targetInstanceIdのスピリットのLvがselfと同じときのみ発火（onBlocked用）
              | { ownFieldHasKeyword: Keyword } // 自分のフィールドに指定キーワード持ちがいるときのみ発火（一時/継続付与も考慮）
              | { ownFieldHasCombinedSpirit: true } // 自分のフィールドに合体スピリットがいるときのみ発火
              | { firstAttackOfTurn: true } // そのターンの最初のアタックのときのみ発火
              | { lastFunsaiHasNexus: true } // 直前の【粉砕】で破棄した中にネクサスがあったときのみ発火
              | { lastMilledHasEx: true } // event: "ownChimeiMilled" 限定：直近の破棄（state.lastDeckMill）にEXシンボルを持つカードがあったときのみ発火
              | { lastFunsaiHasSpirit: true } // 直前の【粉砕】で破棄した中にスピリットがあったときのみ発火
              | { targetMinBp: number } // targetInstanceIdの実効BPがこれ以上のときのみ発火（onBlock用）
              | { targetBlockedMaxBp: number } // targetMinBpの鏡。実効BPがこれ以下のときのみ発火（onBlock用）。
              // fieldEvent.condition側のtargetMaxBpとは別物（あちらはonLifeDamagedのアタッカーを見る）
              | { targetHasColor: Color } // targetInstanceIdがこの色を持つときのみ発火（onBlocked用）
              | { targetMaxCost: number } // targetInstanceIdのコストがこれ以下のときのみ発火（onBlocked用）
              | { targetNotMaxLevel: true } // targetInstanceIdのcurrentLevelがそのカードの最高Lv未満のときのみ発火（onBlocked用）
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 自分のフィールドにnamesいずれかを含むスピリットがcount体以上いるときのみ発火
              | { battleLoserMaxCost: number } // onBattleWin専用：直前バトルで破壊した相手のコストがこれ以下のときのみ発火
              | { opponentHandAtLeast: number } // 相手の手札枚数がこれ以上のときのみ発火
              | { ownHandAtLeast: number } // 自分の手札枚数がこれ以上のときのみ発火（発火しないので確認も出ない）
              | { bothFieldsHaveMinBpSpirit: number } // 両陣営のフィールドに実効BPがこの値以上のスピリットがそれぞれいるときのみ発火
              | { battleOpponentCombined: true } // 現在のバトルの相手側個体が合体スピリットのときのみ発火（onBattleStart用）
              | { requirePrevAttackerCombined: true } // 直前のアタック宣言が自分の合体スピリットによるものだったときのみ発火（ターン開始でリセット）
              | { ownLifeAtMost: number } // 自分のライフがこの数以下のときのみ発火
              | { selfSummonedByFushi: true } // trigger:"onSummon"限定：自分自身の召喚が【不死】によるものだったときのみ発火
              | { selfDestroyedByOwnEffect: { sourceFamily: string | string[] } } // trigger:"onDestroy"限定：自分の効果（発生源のカードが静的に持つ系統。配列＝OR。バトルは含まない）で破壊されたときのみ発火。pendingDestroyContext を読む（26RBS03-013）
              | { selfDestroyedByOpponent: true } // trigger:"onDestroy"限定：相手によって破壊されたときのみ発火（バトルのBP比較も含む）
              | { ownNexusNameKindsAtLeast: { nameContains: string; count: number } } // nameContainsを含む自分のネクサスの異なるカード名の種類数（枚数でない）がcount以上のときのみ発火
              | { ownBurstSet: boolean } // 自分がバーストエリアにセットしている間だけ発火。false指定時はセットしていない間だけ発火
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数がこれ以上のときのみ発火
              | { ownFieldOnlyColor: Color; spiritsOnly?: true } // 自分のフィールドが指定色1色だけのときのみ発火
              | "selfWasAttacker" // selfが現在のバトルのアタッカーのときのみ発火（『アタック中』窓。state.battle.attackerInstanceId と突合。26系【地鳴】）
              | { ownAllHaveTeam: string } // 自分のフィールドのスピリット/ネクサスが1体以上あり、そのすべてが指定チーム（CardData.team）に所属するときのみ発火（26系「自分のスピリット/ネクサスすべてが【X】を持つなら」。0体では不成立とする簡略化）
              | { ownAllHaveFamily: string }
              | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } // 【X】を持つ自分のスピリットがcount体以上いるときのみ発火（AuraCondition.ownTeamAtLeastと同じ判定。restedOnly指定時は疲労状態の個体だけを数える。26系「【X】を持つ自分のスピリットがN体以上いるなら」）
              | { soulCoreInReserve: true } // 自分のリザーブに[ソウルコア]があるときのみ発火（26系「自分のリザーブに[ソウルコア]があるなら」）
              | { ownKeishoExcludedTeamAtLeast: { team: string; count: number } } // 直近の《継召》で除外したカードのうち指定チーム所属がcount枚以上のときのみ発火（26系「この継召で【X】を持つカードをN枚以上除外していたなら」）
              | { summonedBy: string } // 発生源自身（src）の召喚経路が一致するときのみ発火（CardInstance.summonedByと突合。26系「【Fチェンジ】で召喚していたなら」）
      }
    | {
          id: string
          kind: "burst" // バーストエリアから条件発動する。発生源は場ではなくバーストエリア（docs/design/BURST.md）。
          // effectSourcesには入れない＝継続効果（aura/constraint等）の発生源にはならない
          event: FieldEvent // 発動条件（既存のFieldEventを流用する）
          subjectSide?: "own" | "opponent" // fieldEventの同名軸と同じ意味（own=バーストの持ち主自身の事象、opponent=相手の事象）
          byOpponentEffectOnly?: true // event: "ownSpiritDestroyed" 限定：相手のスピリット/ネクサス/マジックの効果で破壊されたときのみ発火
          destroyedColorFilter?: Color // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがこの色を持つときのみ発火
          destroyedMinBp?: number // event: "ownSpiritDestroyed" 限定：破壊されたスピリットの実効BPがこれ以上のときのみ発火
          condition?:
              | { ownLifeAtMost: number } // 自分のライフがこれ以下
              | { ownNexusAtLeast: number } // 自分のフィールドのネクサス数がこれ以上
              | { ownTrashColorCountAtLeast: { color: Color; count: number } } // 自分のトラッシュにある指定色のカード枚数がこれ以上
              | { ownTrashCardTypeCountAtLeast: { cardType: CardType; count: number } } // 自分のトラッシュにある指定種別のカード枚数がこれ以上
              | { ownCoresTotalAtLeast: number } // 自分のフィールド/リザーブ/トラッシュのコアの合計がこれ以上
              | { ownHandAtLeast: number } // 自分の手札枚数がこれ以上
              | { bothFieldsRestedSpiritsAtLeast: number } // 自分と相手のフィールドに疲労状態のスピリットが合計でこれ以上
              | { ownColorCountAtLeast: { color: Color; count: number } } // 自分の指定色のスピリットが合計count体以上
              | { ownFieldHasKeywordAny: Keyword[] } // 自分のフィールドに指定キーワード（配列＝OR）を持つスピリットが1体以上
              | { opponentHandAtLeast: number } // 相手の手札枚数がこれ以上
              | { burstDestroyedColor: Color } // event: "ownSpiritDestroyed" 限定：破壊された（同時破壊なら全メンバーの）色にこの色が含まれるとき。
              // destroyedColorFilterはバースト自体の発動可否を絞るのに対し、こちらはaction内側の条件分岐に使う
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 自分のフィールドに指定系統（配列＝OR）のスピリットがcount体以上
              | { opponentFamilyCountAtLeast: { family: FamilyFilter; count: number } } // ownFamilyCountAtLeastの相手版
          // 「〜のとき、このスピリットカードを召喚する」等の発動条件。バーストの宣言自体はeventの時点で成立しており、
          // 満たさないときはactionの解決だけを飛ばす（BURST.md §1）。triggered.conditionの同名軸を流用
          destroyedAsTarget?: true // 指定時、resolveActionのtargetInstanceIdへこのバースト発動時に破壊されたスピリットのcardIdを入れる
          //
          action: EffectAction // バースト効果本体
          thenPay?: "main" | "flash" // 「その後コストを支払うことで、このカードのメイン/フラッシュ効果を発揮する」。同カードのkind:"magic"で timing一致のエントリを追加で発揮できる（任意）
          alsoDrawIfDestroyedColor?: Color // event: "ownSpiritDestroyed" 限定：actionと同時に（「さらに」）、破壊されたスピリットがこの色ならデッキから1枚ドロー。destroyedColorFilterと違いaction全体は止めない
          returnSelfToHandAfter?: true // 指定時、finishBurstActivationの既定の行き先（トラッシュ）を上書きし、action/alsoDrawIfDestroyedColorの解決後（「その後」）にこのバーストカード自身を手札へ戻す
      }
    | {
          id: string
          kind: "step"
          // ⚠️ ステップ開始時に自動で発揮する（timing:"end"指定時のみ終了時）。
          // 『自分のメインステップ』でも「ステップ開始時」の明記が無いもの（＝任意タイミングで使うもの）はkind:"activated" timing:"main"を使う
          step: Phase // 発火するステップ
          turn: "own" | "opponent" | "both" // own=持ち主がturnPlayerの時、opponent=非turnPlayerの時、both=常に
          timing?: "end" // 指定時は「そのステップの終了時」に発火（省略時＝開始時）。いまはattackのみ発火点あり
          whileCombined?: true
          oncePerTurn?: true // 「ターンに1回」。発生源1体につきターン1回（同名複数体はそれぞれ1回）。
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤーごと・カード名ごとに1回（「この効果はターンに1回しか使えない」）
          // BS10-008のようにこの効果自身が追加のエンドステップを生む場合、無いと無限ループになる
          levels: number[] | null
          action: EffectAction
          optional?: true // 「〜できる」= 任意。triggered.optionalと同じく発動確認を出す
          beforeStepAction?: true // step:"draw" | "core" 限定：そのステップの本体の動き（ドロー／コア配置）より前に発火する。「ドローしないことで〜」「コアを置かないことで〜」用。
          // 指定が無ければ本体の後（2026-08-27）
          condition?:
              | "handNotGreaterThanOpponent" // 持ち主の手札枚数が相手以下
              | "selfWasRefreshedThisStep" // 発生源自身がこのリフレッシュステップで回復した場合のみ
              | { ownSymbolColorAtLeast: { color: Color; count: number }; noAttacksThisTurn?: true } // 発生源のフィールドが持つ指定色のシンボル数がcount以上。noAttacksThisTurn指定時はさらにこのターン未アタック
              | { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサス合計が指定色でcount以上
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // フィールドに指定系統（配列＝OR）のスピリットがcount体以上
              | { ownHandAtLeast: number } // 手札がこの枚数以上
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // フィールドにnamesいずれかを含むスピリットが合計count体以上
              | { opponentDeckNotEmpty: true } // 相手のデッキが0枚のときは発揮しない
              | { ownTrashOnlyColor: Color } // トラッシュがこの色のカードだけ
              | { ownSpiritMinCost: number } // フィールドにコストがこの値以上のスピリットが1体以上
              | { ownSpiritMinBp: number } // フィールドに実効BPがこの値以上のスピリットが1体以上
              | { ownRefreshedSpiritsAtLeast: number } // フィールドに回復状態のスピリットがこの体数以上
              | { ownBurstSet: boolean } // バーストをセットしている間（false指定時はしていない間）だけ発火
              | { noAttacksThisTurn: true } // このターン未アタックのときのみ発火
              | { opponentBurstSet: boolean } // 相手がバーストをセットしている間（false指定時はしていない間）だけ発火
              | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } // 【X】を持つ自分のスピリットがcount体以上いるときのみ発火（AuraCondition.ownTeamAtLeastと同じ判定。restedOnly指定時は疲労状態の個体だけを数える。26系「【X】を持つ自分のスピリットがN体以上いるなら」）
              | { ownAllHaveTeam: string } // 自分のスピリット/ネクサスが1体以上あり、そのすべてが指定チーム（CardData.team）に所属するときのみ発火（triggered/activatedの条件系と同じ判定。26系セフィ・アリエス『相手のアタックステップ開始時』）
              | { ownAllHaveFamily: string }
              | { soulCoreInReserve: true } // 自分のリザーブに[ソウルコア]があるときのみ発火（triggeredの条件系と同じ判定。26系「自分のリザーブに[ソウルコア]があるなら」）
              | { ownKeishoExcludedTeamAtLeast: { team: string; count: number } } // 直近の《継召》で除外したカードのうち指定チーム所属がcount枚以上のときのみ発火（triggeredの条件系と同じ判定。26系「この継召で【X】を持つカードをN枚以上除外していたなら」）
              | { summonedBy: string } // 発生源インスタンス自身の召喚経路が一致するときのみ発火（CardInstance.summonedByと突合。triggeredの条件系と同じ判定）
      }
    | {
          id: string
          kind: "freeSummonFromHandOnLifeDamaged" // 手札にあるこのカード自身の効果。持ち主のライフが相手によって減らされたとき、コストを支払わずに召喚できる（「できる」＝任意）。
          // 手札のカードが発揮する唯一の形なので、GameEngineのownLifeDamaged発火点が持ち主の手札を直接走査する
          levels: null // 手札のカードにレベルは無いので常にnull
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 『相手のアタックステップ』等の限定
          condition?: { ownLifeAtMost: number } // 指定時、持ち主のライフがこの数以下のときだけ召喚できる
      }
    | {
          id: string
          kind: "freeSummonFromHandOnDiscardedByOpponent" // 手札にあるこのカード自身の効果。相手のスピリットの効果で手札から破棄されたとき、そのカード自身をコストを支払わずに召喚できる
          levels: null // 手札のカードにレベルは無いので常にnull
      }
    | {
          id: string
          kind: "freeSummonFromHandOnOwnNexusDeployed" // 手札にあるこのカード自身の効果。自分のフィールドにネクサスが配置されたとき（通常・効果・復活いずれも）、コストを支払わずに召喚できる
          levels: null // 手札のカードにレベルは無いので常にnull
      }
    | {
          id: string
          kind: "battleWon"
          role: "attacker" | "blocker" | "any" // 持ち主のスピリットがこの役割で勝利したとき（ネクサスのバトル結果誘発）。any=どちらの役割でも
          levels: number[] | null
          action: EffectAction
          turn?: "own" // 指定時、持ち主がturnPlayerのときのみ発火
          vanillaWinnerOnly?: true // 勝利したスピリットが効果の記述を持たない（バニラ）ときのみ発火
          winnerNameContains?: string // 勝利したスピリットのカード名がこの文字列を含むときのみ発火
          winnerMinCores?: number // 勝利したスピリットに置かれているコアがこの数以上のときのみ発火
          winnerFamilyFilter?: FamilyFilter // 勝利したスピリットが指定系統を持つときのみ発火
          winnerKeywordFilter?: Keyword | Keyword[] // 勝利したスピリットがこのキーワードを持つときのみ発火。
          // 配列＝OR。
          // ⚠️ ORをエントリ2つに分けて書かないこと。両方持つスピリットで二重に発火する
          winnerIsLentBuffTarget?: true // 勝利したスピリットが、同じマジックの直前の効果でBP増加した1体のときのみ発火。「〜をBP+2000する。そのスピリットが、BPを比べ〜」と前の文を指すカード用。lentOnlyとセットで使う
          winnerIsLentChoiceTarget?: true // 勝利したスピリットが、targetChoiceLendThisTurnで選んだ1体のときのみ発火。「自分のスピリット1体に“…このスピリットは回復する”という効果を与える」の与える側。lentOnlyとセットで使う
          winnerCombinedOnly?: true // 勝利したスピリットが合体スピリットのときのみ発火
          winnerColorFilter?: Color // 勝利したスピリットがこの色を持つときのみ発火
          loserMinBp?: number // 敗北して破壊された側の実効BPがこれ以上のときのみ発火
          loserCostAtMost?: number // 敗北して破壊された側のコストがこれ以下のときのみ発火
          whileCombined?: true
          selfOnly?: true // 発生源自身が勝利したときのみ発火
          firstAttackOfTurn?: true // そのターンの最初のアタックで勝利したときのみ発火
          optional?: true // 「〜できる」＝任意。interactiveTargetsでは発動確認を出す
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          selfMode?: "source" // 指定時、resolveActionのselfに勝利スピリットでなく発生源インスタンス（ネクサス）を渡す
          condition?: { ownFieldOnlyColor: Color; spiritsOnly?: true } // フィールドが指定色1色だけのときのみ発火
      }
    | {
          id: string
          kind: "fieldEvent"
          event: FieldEvent
          levels: number[] | null
          perDestroyed?: true // event: "ownSpiritDestroyed" | "opponentSpiritDestroyed" 限定：同時破壊でも破壊された体数ぶん発火する（「1体につき」「すべて」用。省略時は同時破壊グループにつき1回＝Q22359）
          oncePerTurn?: true // 「ターンに1回」。kind:"triggered".oncePerTurnと同じ形
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤーごと・カード名ごとに1回（「この効果はターンに1回しか使えない」）
          whileCombined?: true
          combinedBraveColors?: Color[] // 【合体時】併用：合体しているブレイヴのいずれか1つがこの色を持つときだけ発火
          action: EffectAction
          phase?: Phase // 指定時はこのステップでのみ発火
          excludePhase?: Phase // 指定時はこのステップでは発火しない
          turn?: "own" | "opponent" // 指定時はこの陣営条件でのみ発火（own=持ち主がturnPlayerの時、opponent=非turnPlayerの時。省略時はどちらでも発火）
          subjectSide?: "own" | "opponent" // 指定時、イベントの主体がどちら側かで絞る（turn＝誰のターンかとは別軸。「相手のスピリットが疲労したとき」用。2026-08-16判断。SD01-028 Lv2）
          colorFilter?: Color // event: "ownSpiritDestroyed" | "ownSpiritBlocked" | "anySpiritAttacked" | "ownSpiritSummoned" 限定：対象スピリットの色が一致するときのみ発火
          sourceColorFilter?: Color // 指定時、そのイベントが「相手のこの色のスピリット/ネクサス/マジックの効果によって」起きたときだけ発火（currentEffectSourceで判定）。
          // colorFilterが「イベント対象」の色を見るのに対し、こちらは「効果の発生源」の色を見る
          targetColorFilter?: Color // 指定時、targetInstanceIdのスピリットがこの色を持つときのみ発火
          ignoreEventTarget?: true // 指定時、resolveActionにtargetInstanceIdを渡さない
          selfMode?: "source" // 指定時、resolveActionのselfにイベント対象でなく発生源インスタンス自身を渡す
          vanillaOnly?: true // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "anySpiritAttacked" | "ownSpiritDeclaredBlock" 限定：主体が効果の記述を持たない（バニラ）ときのみ発火。
          // 破壊・召喚は主体が既にフィールドを離れているためeventInfo.vanillaで、アタック/ブロックは場に残るためinstIsVanillaで判定
          subjectKeywordFilter?: Keyword | Keyword[] // イベントの主体がこのキーワードを持つときのみ発火
          bpReachedAt?: number // event: "ownSpiritBpReached" 限定：eventInfo の前回BP < この値 <= 今回BP のときだけ発火（26RBS01-055/X10/X11「BPがN以上になった時」）
          blockerMaxBp?: number // event: "ownSpiritBlocked" 限定：ブロックしたスピリット（targetInstanceId）の実効BPがブロック宣言の時点でこれ以下のときのみ発火（26RDB01-X01）
          subjectMinBp?: number // イベントの主体の実効BPがこれ以上のときのみ発火（26RBS03-005「BP10000以上の自分のスピリットのバトル終了時」）
          subjectRefreshed?: true // イベントの主体が回復状態のときのみ発火（そのイベントの時点の状態。26RBS03-X11「回復状態の自分の白のスピリットのバトル終了時」）
          subjectMinSymbols?: number // イベントの主体のシンボル数（付与込み）がこれ以上のときのみ発火（26RBS02-X08「シンボル2つ以上の自分のスピリットがブロックされた時」）
          subjectMaxCost?: number // イベントの主体のコストがこれ以下のときのみ発火
          subjectReceivesBpPlus?: true // イベントの主体が「BPを+する」効果を受けているときのみ発火（期間つき・常時・自身の効果を問わない。receivesBpPlus。26RBS02-007）
          subjectMinCost?: number // イベントの主体のコストがこれ以上のときのみ発火（26RSD04-010）
          subjectOriginalNexus?: true // イベントの主体が本来はネクサスのカード（スピリットとして扱われているネクサス）のときのみ発火（26RBS02-X16「本来はネクサスの自分のスピリットが疲労した時」・26RBS02-085「…がアタックした時」）
          subjectDifferentNameFromSelf?: true // イベントの主体が発生源と異なるカード名のときのみ発火（26RCB01-046）
          subjectTeamFilter?: string // イベントの主体が指定チーム（CardData.team）に所属するときのみ発火（26RDB01-008「【レッドステラ】を持つ自分のスピリットがアタックした時」）
          subjectHasTrigger?: TriggerEvent // イベントの主体が指定トリガーの誘発効果を現在のレベルで静的に持つときのみ発火
          destroyedByOwnEffect?: { sourceType: CardType; sourceFamily?: string | string[] } // event: "opponentSpiritDestroyed" 限定：自分の（sourceType 種別の）効果で破壊したときのみ発火（バトルは含まない）。sourceFamily＝その発生源のカードが持つ系統（静的な系統。配列＝OR）。26RBS02-055・26RBS03-051・26RBS01-105
          destroyedMaxBp?: number // event: "opponentSpiritDestroyed" 限定：破壊されたスピリットの破壊直前の実効BPがこれ以下のときのみ発火（26RBS03-051「BP0の相手のスピリット」）
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火
          attackerOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがそのバトルのアタッカーだったときのみ発火
          duringSelfAttack?: true // event: "opponentSpiritDestroyed" 限定：発生源自身が現在のバトルのアタッカーのときだけ発火
          excludeSelfSubject?: true // 主体が発生源自身なら発火しない
          selfOnly?: true // 発生源自身が主体のときだけ発火（ownSpiritDestroyed / ownSpiritExhausted / ownSpiritReducedLife。26RBS02-001）
          causedByOpponent?: true // 疲労イベント限定：相手の効果（ネクサスの効果も含む。byOpponentEffectOnly はネクサスを除く）で疲労したときのみ発火（26RBS02-050）
          byOpponentOnly?: true // event: "ownSpiritDestroyed" 限定：相手によって破壊されたとき
          byOpponentEffectOnly?: true // event: "ownNexusDestroyed" | "ownSpiritDestroyed" | "ownSpiritExhausted" 限定：相手のスピリット/ネクサス/マジックの効果で破壊/疲労したときのみ発火。
          // ownSpiritDestroyedはバトルのBP比較で敗れた場合も含む。ownSpiritExhaustedはネクサスの効果を含まない。
          // destroyNexusに渡されたDestroyContextで判定し、発生源不明のときは発火しない側に倒す（文脈不明時に限定を緩める方が誤りが大きいため）
          causedByOwnEffect?: true | "spirit" // 疲労イベント限定：発生源の持ち主の効果（"spirit"＝スピリットの効果）で疲労したときのみ発火（26系「自分の効果で自分か相手のスピリットが疲労した時」）
          byOpponentSpiritEffectOnly?: true // event: "ownSpiritDestroyed" 限定：相手のスピリットの効果で破壊されたときのみ発火（DestroyContext.sourceType==="spirit"かつsourcePidが持ち主と異なるときのみ）
          refreshSourceTypeFilter?: CardType[] // event: "anySpiritRefreshed" 限定：回復させた効果の発生源種別（配列＝OR）で絞る
          keywordActivatedFilter?: Keyword // event: "ownKeywordActivated" 限定：発揮されたキーワードが一致するときのみ発火（「自分のスピリットが【増幅】を発揮した時」＝zofuku限定。26RBS02-041アージェントール。レビュー修正: 発揮イベントは文言がキーワードを限定している）
          summonedSpiritAsTarget?: true // event: "ownSpiritSummoned" 限定：selfMode:"source"と併用し、actionTargetIdを召喚されたスピリット自身にする
          attackerAsTarget?: true // selfOverrideを渡すイベント全般で使える（summonedSpiritAsTargetの同型）。selfMode:"source"と併用し、actionTargetIdをイベントの主体自身にする
          // 指定時、resolveActionへ渡す対象は通常のイベント対象ではなく、その効果を発揮したスピリット自身（DestroyContext.sourceInstanceId）になる（既存の経路とは独立）
          // BS10-012/BS10-014＝「このスピリットが相手のスピリットの効果で破壊されたとき、その効果を発揮したスピリット上のコアすべてを相手のトラッシュに置く」
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサス合計が指定色でcount以上のときのみ発火
              | { ownFieldHasColorNexus: Color } // フィールドに指定色のネクサスがあるときのみ発火
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // フィールドに指定系統（配列＝OR）のスピリットがcount体以上のときのみ発火
              | "selfIsAttacking" // 発生源自身が現在のバトルのアタッカーであるときのみ発火
              | { firstAttackOfTurn: true } // event: "anySpiritAttacked" 限定：そのターンの最初のアタックのときのみ発火
              | { attacksThisTurnAtLeast: number } // event: "anySpiritAttacked" 限定：そのターンのN回目以降のアタックのときのみ発火（26RBS02-082）
              | { targetMaxBp: number } // event: "ownLifeDamaged" 限定：ライフを減らしたスピリット（アタッカー）の実効BPがこれ以下のときのみ発火
              | { targetMaxCostOfEventTarget: number } // targetInstanceIdのスピリットのコストがこれ以下のときのみ発火。
              // event:"ownSpiritBlocked" ではブロッカー。targetMaxBpのコスト版
              | { targetKeywordExclude: Keyword } // event: "ownLifeDamaged" 限定：ライフを減らしたスピリットがそのキーワードを持つときは発火しない
              | { lastFunsaiHasSpirit: true } // event: "ownFunsaiMilled" 限定：直前の【粉砕】で破棄した中にスピリットがあったときのみ発火
              | { lastFunsaiHasCostAtLeast4: true } // event: "ownFunsaiMilled" 限定：直前の【粉砕】で破棄した中にコスト4以上が1枚でもあれば発火
              | { opponentHandAtLeastOwnHand: true } // event: "opponentMagicUsed" 限定：相手の手札枚数が自分以上のときのみ発火
              | { opponentMagicUsedAtLeast: number } // event: "opponentMagicUsed" 限定：相手がこのターンにマジックの効果を使用した回数がこれ以上のときのみ発火
              | { burstCostAtMost: number } // event: "ownBurstActivated" 限定：発動したバーストのコストがこれ以下のときのみ発火
              | { ownBurstSet: boolean } // バーストをセットしている間だけ発火
          repeatPerCount?: boolean // event: "ownFunsaiMilled" | "opponentHandAdded" | "opponentCorePlaced" 用：実カウント数ぶんアクションを繰り返す
          countMode?: "cores" | "funsaiSpirits" // event: "ownSpiritCoresRemovedByOpponent" 限定：repeatPerCountの回数を「取り除かれたコア数」にする。
          // "funsaiSpirits"：event: "ownFunsaiMilled" 限定：回数を実破棄枚数でなく直前の【粉砕】で破棄したスピリット枚数にする
          minEventCount?: number // eventCountがこの値以上のときのみ発火
          magicCostEquals?: number // event: "opponentMagicUsed" 限定：使用されたマジックのコストが一致するときのみ発火
          magicTiming?: "main" | "flash" // event: "opponentMagicUsed" 限定：使用タイミングが一致するときのみ発火
          magicPick?: CardPick // event: "ownMagicUsed" 限定：使用したマジックのカードがこの条件に合うときのみ発火（eventInfo.magicCardId で判定）
          paidCostOnly?: true // event: "ownMagicUsed" 限定：「コストを支払って」使用されたときのみ発火。「コストを支払わずに使用」経由の使用だけが除外される（2026-09-07確認。BS11-X05 Lv2-3）
          magicFreeUseMaxPerTurn?: number // event: "ownMagicUsed" 限定：発生源が実際に無償使用を行った回数（CardInstance.magicFreeUseCount）がこの値未満のときのみ発火。
          // 発動確認で「使わない」を選んだ・候補が無く不発だったときは消費しない（2026-09-07確認。BS11-X05 Lv2-3）
          familyFilter?: FamilyFilter // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "ownSpiritExhausted" | "anySpiritExhausted" | "anySpiritAttacked" 限定：主体の系統がこれを含むときのみ発火
          // 破壊/召喚はeventInfo.families（カード静的な系統）で判定。疲労イベントはfamiliesを渡さないためselfOverrideをmatchesFamilyFilterで判定
          fromHandOnly?: true // event: "ownSpiritSummoned" 限定：手札から召喚されたときのみ発火
          subjectNotInBattle?: true // イベントの主体が今のバトルのアタッカーでもブロッカーでもないときのみ発火（26RBS02-083「アタック/ブロックしていない〜が相手によって破壊された時」）
          keishoSummonOnly?: true // event: "ownSpiritSummoned" 限定：その召喚が《継召》（トラッシュのEXシンボル持ちを除外してコストを軽減）によるものだったときのみ発火（26RBS02-079）
          byOpponentVanishOnly?: true // event: "ownSpiritDestroyed" 限定：消滅（維持コア割れ。破壊ではない）で、その原因が相手の効果のときのみ発火（26RBS02-079）
          sokuSummonOnly?: true // event: "ownSpiritSummoned" 限定：その召喚が【神速】によるものだったときのみ発火。⚠️ keywordFilter:"soku"（召喚されたカードが【神速】を持つ）とは別物
          fushiSummonOnly?: true // event: "ownSpiritSummoned" 限定：その召喚が【不死】によるものだったときのみ発火。【不死】召喚も通常と同じくこのイベントを起こすので限定したいときだけ指定
          subjectCombined?: boolean // 指定時、イベントの主体が合体しているかで絞る
          keywordFilter?: Keyword // event: "ownSpiritSummoned" 限定：召喚されたスピリットがこのキーワードを静的に持つときのみ発火。
          // event: "anySpiritAttacked" | "ownSpiritDealtLife" 限定：イベント対象（selfOverride）が該当キーワードを持つときのみ発火
          costFilter?: { max?: number; min?: number } // event: "ownSpiritDestroyed" | "anySpiritAttacked" | "ownSpiritExhausted" | "anySpiritExhausted" | "ownSpiritSummoned" 限定：主体のコストがmax以下/min以上のときのみ発火。
          // ownSpiritSummoned限定：カード静的なコスト（本来のコスト）で判定し、軽減後の支払いコストではない
          maxBp?: number // event: "anySpiritAttacked" 限定：アタックしたスピリット（selfOverride）の実効BPがこれ以下のときのみ発火
          subjectMaxCores?: number // event: "anySpiritAttacked" 限定：アタックしたスピリットの上のコア数がこれ以下のときのみ発火
          symbolCount?: number // event: "anySpiritAttacked" 限定：アタックしたスピリットのシンボル数が一致するときのみ発火
          eventTargetIsSelf?: true // event: "ownSpiritExhausted" | "anySpiritExhausted" 限定：イベント対象が発生源自身のときのみ発火
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効。この場合levelsは必ずnull
          nameIncludes?: string[] // イベント対象のカード名がいずれかの文字列を含むときのみ発火。event:"ownTensho"限定ではeventInfo.names（【転召】の犠牲になったスピリットのカード名）、それ以外はselfOverride
          targetSameLevelAsSelf?: true // targetInstanceIdのLvが、イベント対象（selfOverride）のLvと同じときのみ発火
          ownOnly?: true // event: "anySpiritAttacked" 限定：発生源の持ち主のスピリットがアタックしたときのみ発火
          excludeSelfAsEventTarget?: true // イベント対象（selfOverride）が発生源自身のときは発火しない
          optional?: true // 「〜できる」＝任意。interactiveTargetsでは発動確認を出す
      }
    | {
          id: string
          kind: "milledMagicToTegamoto" // 発生源が場にありレベル有効の間、持ち主のデッキが相手の効果で破棄されるとき、中のマジックカードすべてをトラッシュでなく手元(tegamoto)へ置き手札同様に使用できるようにする
          levels: number[] | null
      }
    | {
          id: string
          kind: "onMilledFromDeck" // このカード自身がデッキから破棄されたときに発揮する（手札・フィールドからの破棄は対象外）。
          // millDeckが破棄したカードを1枚ずつ見て発火。トラッシュへ入れた直後にそこから取り除いて解決するため、破棄されたカードはトラッシュに残らない
          levels: null // デッキのカードにレベルは無いので常にnull
          by: "opponentEffect" | "opponentSpiritEffect" // 破棄の発生源の限定。opponentSpiritEffectは「相手のスピリットの効果で」
          then: "castThisMagicFree" | "deployThisNexusFree" | "summonThisSpiritFree" | "destroyMillSource" | "voidOpponentLife" // castThisMagicFree=このマジックの効果を無償で即時発揮／deployThisNexusFree=このネクサスを無償配置／summonThisSpiritFree=このスピリットカードを無償召喚／
          // destroyMillSource=破棄を引き起こした相手のスピリットを破壊（発生源はトラッシュに残る）。最初の1枚で打ち切る（2026-09-21）
          // voidOpponentLife=resolveActionへlifeCrush count:1 dest:"void"を委譲し、相手のライフのコア1個をボイドに置く
          optional?: true // 「〜できる」＝任意。interactiveTargetsでは確認を出す（非対話は自動召喚）。summonThisSpiritFree専用
          thenProtectDeckThisTurn?: true // 破棄された時点で（召喚の成否・確認より先に）このターンの間デッキは相手の効果では破棄されなくなり、その回の残りの破棄も止まる
          thenBlockAllDeckMillThisTurn?: true // then:"destroyMillSource"専用：破壊解決後、このターンの間自分の効果も含めデッキは破棄されなくなる
      }
    | {
          id: string
          kind: "reviveOnDestroy" // 破壊される代わりに場に留まる
          levels: number[] | null
          scope: "self" | "ownAll" // self=このスピリット自身が対象／ownAll=発生源の持ち主の全スピリットが対象
          perDestroyed?: true // scope:"ownAll"限定：同時破壊でも破壊された体数ぶん確認する（省略時は同時破壊グループにつき1回。Q22359）。scope:"self"は対象外
          whileCombined?: true // scope:"self"専用：合体しているホストが破壊されるとき、代わりに防ぐ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnでこのターンだけ貸した効果）からのみ有効
          optional?: true // 「〜できる」の任意指定。承認でコスト支払い＋復活確定、断ればその場で破壊（非対話は即時確定）。省略時は必ず戻る
          vanillaFilter?: true // scope:"ownAll"用：効果の記述を持たない（バニラ）スピリットのみ対象
          colorFilter?: Color // scope:"ownAll"用：この色を持つスピリットのみ対象
          keywordFilter?: Keyword // scope:"ownAll"用：このキーワードを静的に持つカードのみ対象
          minBp?: number // scope:"ownAll"用：対象スピリットの実効BPがこれ以上のときのみ
          minCost?: number // scope:"ownAll"用：対象スピリットのコストがこれ以上のときのみ
          familyFilter?: FamilyFilter // scope:"ownAll"用：指定系統（配列＝OR）を持つスピリットのみ対象
          minFamilies?: number // scope:"ownAll"用：対象スピリットのカード静的なfamily配列の要素数がこれ以上のときのみ対象
          combinedOnly?: true // scope:"ownAll"用：合体スピリットのみ対象
          requireOwnFieldHasName?: string // 持ち主のフィールドにこのカード名の個体が1体以上いるときのみ有効
          when: {
              byOpponentEffect?: boolean // 相手の効果による破壊のみ
              byOpponent?: boolean // 「相手によって破壊されたとき」＝相手の効果による破壊 または バトルのBP比較による破壊（2026-09-07確認。BS12-X05 Lv2-3）。
              // 自分の効果で自分のスピリットを破壊した場合は含まない。byOpponentEffectより広い
              byBattleVsArmorColor?: boolean // 装甲で指定した色の相手とのBP比較による破壊のみ
              byBattleVsHeavyArmorColor?: boolean // 【重装甲】で指定した色の相手とのBP比較による破壊のみ
              byBattle?: boolean // BP比較による破壊のみ
              byBattleKillerLevel?: number // BP比較による破壊で、破壊した側（勝者）のcurrentLevelがこの値のときのみ
              byBattleKillerMaxBp?: number // BP比較による破壊で、破壊した側（勝者）の実効BPがこの値以下のときのみ
          }
          phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" } // 発動できるステップ条件
          revived: { rested: boolean } | { toHand: true; braveStay?: "rested" | "refreshed" } | { toBurst: true } // toBurst=トラッシュの代わりにバーストエリアへ。Q3469（解決中は発動不可）は未実装（簡略化）
          // 戻るときの状態はfalse=回復／true=疲労。toHand=場に残らず手札へ（コアはリザーブへ）。braveStay指定時は合体していたブレイヴを確認なしで指定状態のまま残す。省略時はdetachBravesOnLeaveへ
          cost?: {
              sourceCoresToTrash?: number // 発生源自身の上のコアをこの数だけトラッシュへ。足りなければ支払い不可＝不発
              keepOneCoreRestToTrash?: boolean // 自身のコアを1個だけ残し、残りをトラッシュへ
              oneCoreToVoid?: boolean // 対象のコア1個をボイドへ（コア1個の個体は支払い不可＝不発）
              oneCoreToTrash?: boolean // 対象のコア1個をトラッシュへ。コア1個の個体でも支払う（2026-08-14確認。破壊待機中はコアが乗ったままなので成立し、待機解除の後に維持コア割れで消滅する。BS09-063）
              reserveOneToTrash?: boolean // リザーブのコア1個をトラッシュへ
              fieldOrReserveOneToTrash?: boolean // リザーブのコア1個（無ければ自分のフィールドから1個、発生源自身を除く）をトラッシュへ
              handDiscardOne?: boolean // 手札1枚（末尾＝決定的簡略化）をトラッシュへ。手札0枚なら不発
              handDiscardCardType?: CardType // 指定時はhandDiscardOneが破棄する手札を末尾からその種別に絞って探す
              millSelfOneMatching?: { color: Color; cardType: CardType; thenHandIfNameIncludes?: string } // デッキ上から1枚破棄し色・種別が一致したときだけ成立。thenHandIfNameIncludes指定時は成立可否と独立に、名前が一致すれば手札へ
              exhaustOwnFamilyOne?: FamilyFilter // フィールドの指定系統（配列＝OR）を持つ回復状態スピリット1体（実効BP最小の簡略化。破壊される個体自身は除く）を疲労させる。該当なしなら不発
              ownLifeOneToVoid?: boolean // ライフのコア1個をボイドへ（リザーブへは戻らない）。ライフ0なら不発。結果0になればそのまま勝敗が決まる
              ownLifeOneToReserve?: boolean // ライフのコア1個を自分のリザーブへ。ライフ0なら不発
              millSelfCount?: number // デッキを上からこの枚数だけ無条件に破棄する
              exhaustOwnSameFamilyOne?: true // このスピリット自身の系統と一致する、自身以外の持ち主のフィールドの回復状態スピリット1体を疲労させる
              opponentLifeOneToTrash?: true // 相手のライフのコア1個を相手のトラッシュに置く。相手のライフが0なら不発。結果0になれば持ち主の勝利が決まる
              discardOwnBurst?: true // 自分のバースト1つを破棄（トラッシュへ）することがコスト
              exhaustOwnNexusOne?: true // フィールドの回復状態ネクサス1つ（コア最少の簡略化）を疲労させる。候補が無い・相手のconstraintで疲労させられないなら不発
          }
          //
          oncePerTurn?: boolean // 発生源1つにつきターン1回だけ
          condition?: { opponentFieldSymbolColorsAtMost: number } | { ownBurstSet: boolean } | { ownFieldOnlyColor: Color; spiritsOnly?: true } // AtMost=相手シンボル色数（重複除く）がこの値以下／ownBurstSet=セット中(true)/未(false)／ownFieldOnlyColor=場が指定色1色だけ
          alsoVoidCoreToReserve?: number // 復活の成立とセットで、ボイドからコアをこの数だけリザーブに置く
      }
    | {
          id: string
          kind: "trashReturnOnOwnHeavyExhaust" // トラッシュにあるこのカード自身の効果：『自分のターン』に自分の効果で相手のスピリットが重疲労した時、
          // familyFilter の系統を持つ自分のスピリット/ネクサスがあれば手札に戻る（26RBS02-032。heavyExhaustSpirit が走査する）
          levels: null
          familyFilter: string
      }
    | {
          id: string
          kind: "trashReturnOnOwnSpiritDestroyed" // トラッシュにあるこのカード自身の効果：familyFilter の系統を持つ自分のスピリットが破壊された時、手札に戻せる（26RSD05-012）。
          // 同じカード名のこの効果はターンに1回（onceByNameUsed）。removal.fireOwnSpiritDestroyed が持ち主のトラッシュを走査する
          levels: null
          familyFilter: string
      }
    | {
          id: string
          kind: "trashSummonOnNameSummoned" // トラッシュにあるこのカード自身の効果：持ち主のフィールドにnameIncludesを含むスピリットが召喚されたとき、このカードを無償召喚できる（任意）。
          // 【不死】と同じくトラッシュのカードが発生源なのでeffectSourcesでは拾えず、fireSummonSequenceが持ち主のトラッシュを走査する。維持コアはリザーブから払う
          levels: null
          nameIncludes: string
      }
