// カード効果の定義（いつ・どんな条件で・何をするか）。type.ts の肥大化を避けるため 2026-09-12 に切り出した（type.tsがre-export）。

import type {
    AuraCondition,
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
          whileCombined?: true // 合体中のみ発揮（一次資料はBRAVE.md §12.3）
          // ⚠️ このキーはゲートを実装したkindにしか宣言できない（他kindに書くとvalidate:cardsが落ちる）
          colors?: Color[] // 装甲用: この色の相手効果を受けない
          colorsFrom?: "opponentFieldSymbols" | "selfColors" // 装甲/重装甲用: 固定値の代わりに相手フィールド色または自分の色（instColors込み）を毎回算出（【装甲：∞】【重装甲：可変】）
          count?: number // 暴風用: 指定数（【暴風：2】＝2体）
          minCost?: number // 転召用: 対象スピリットのコスト下限
          familyFilter?: FamilyFilter // 転召用: 対象スピリットの系統（配列＝OR）。minCostとは排他
          dest?: "trash" | "void" // 転召用: コアの行き先（trash=持ち主のトラッシュ、void=消滅）
          triggerCosts?: number[] // 不死用: 引き金になる自分のスピリットのコスト（省略時は「キーワードを持つ」宣言だけ）
          triggerFamilies?: FamilyFilter // 不死用: 引き金になる自分のスピリットの系統。triggerCostsとはどちらか一致で可
      }
    | {
          id: string
          kind: "trashImmunity" // トラッシュにある間このカード自身が一切の効果を受けない（levels無し＝常時有効）。自分の効果からも守られる
      }
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
          trigger: TriggerEvent
          levels: number[] | null
          whileCombined?: true
          combinedBraveColors?: Color[] // 【合体時】併用：合体しているブレイヴのいずれか1つがこの色を持つときのみ発揮（多色は1色でも該当。2026-09-07確認。X008）
          action: EffectAction
          optional: boolean // 「〜できる」= 任意。interactiveTargetsではpendingChoice（option/confirm）で発動確認、選ばなければ発動しない
          oncePerTurn?: true // 「ターンに1回」。発生源1体につきターン1回
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
              | { bothFieldsHaveMinBpSpirit: number } // 両陣営のフィールドに実効BPがこの値以上のスピリットがそれぞれいるときのみ発火
              | { battleOpponentCombined: true } // 現在のバトルの相手側個体が合体スピリットのときのみ発火（onBattleStart用）
              | { requirePrevAttackerCombined: true } // 直前のアタック宣言が自分の合体スピリットによるものだったときのみ発火（ターン開始でリセット）
              | { ownLifeAtMost: number } // 自分のライフがこの数以下のときのみ発火
              | { selfSummonedByFushi: true } // trigger:"onSummon"限定：自分自身の召喚が【不死】によるものだったときのみ発火
              | { selfDestroyedByOpponent: true } // trigger:"onDestroy"限定：相手によって破壊されたときのみ発火（バトルのBP比較も含む）
              | { ownNexusNameKindsAtLeast: { nameContains: string; count: number } } // nameContainsを含む自分のネクサスの異なるカード名の種類数（枚数でない）がcount以上のときのみ発火
              | { ownBurstSet: boolean } // 自分がバーストエリアにセットしている間だけ発火。false指定時はセットしていない間だけ発火
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数がこれ以上のときのみ発火
              | { ownFieldOnlyColor: Color; spiritsOnly?: true } // 自分のフィールドが指定色1色だけのときのみ発火
      }
    | {
          id: string
          kind: "magic"
          timing: "main" | "flash"
          action: EffectAction
          afterBlockForbidden?: true // trueならブロック宣言後のフラッシュタイミングでは使用不可
          mainForbidden?: boolean // trueならこのエントリがtimingとして採用されるメインステップでの使用そのものを拒否
          ownTurnForbidden?: true // trueなら発生源の持ち主のターン中は使用不可
          usableAtOpponentMainEnd?: true // timing:"flash"限定：相手がメインステップ終了を宣言した瞬間にも使用できる
          oncePerTurn?: true // 使用者ごと・cardIdごとにそのターン1回だけ発揮。2枚目は使用はできるが効果は発揮されない
          condition?:
              | { ownFamilyCountAtLeast: { family: string; count: number } } // 指定系統を持つ自分のスピリットがcount体以上のときのみ実行
              | { ownFieldHasMinSymbolSpirit: number } // 自分のフィールドにシンボル数がこれ以上のスピリットが1体以上いるときのみ実行
              | { ownFieldSymbolColorsAtLeast: number } // 自分のフィールド全体が持つシンボルの色の種類数（重複除く）がこれ以上のときのみ実行
              | { bothFieldsHaveNexus: true } // お互いのフィールドにネクサスが1つ以上あるときのみ実行
              | { ownSpiritIsBlocking: true } // 自分のスピリットが現在のバトルでブロッカーになっているときのみ実行
              | { ownSpiritCountAtLeast: number } // 自分のフィールドのスピリット数がこれ以上のときのみ実行
              | { ownFieldHasColorSpirits: Color[] } // 自分のフィールドに指定した色のスピリットがそれぞれ1体以上いるときのみ実行（1体が多色で複数色満たしてもよい）
              | { ownFieldHasAllNames: string[] } // 自分のフィールドに指定したカード名すべてが1体ずつ揃っているときのみ実行（cardIdでなく名前の完全一致）
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数がこれ以上のときのみ実行
      }
    | {
          id: string
          kind: "handActivated" // 手札にあるこのカードを使う効果
          timing: "flash" // 現状フラッシュのみ
          phase?: Phase // 指定時、このステップ中のみ使用できる
          cost: { discardSelf: true } // 手札にあるこのカード自身を破棄することがコスト（現状これのみ対応）
          asSpiritEffect?: true // resolveActionにsrcColors=このカードの色／srcType="spirit"を渡す印
          action: EffectAction
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
          // BS10-008のようにこの効果自身が追加のエンドステップを生む場合、無いと無限ループになる
          levels: number[] | null
          action: EffectAction
          optional?: true // 「〜できる」= 任意。triggered.optionalと同じく発動確認を出す
          cost?: { exhaustSelf: true } | { reserveToTrash: number } | { selfCoresToTrash: number } | { discardHandFamily: FamilyFilter } // 疲労させることで発火（COST_MODEL.md）。既に疲労なら不発。fireStepTriggersが発火確定時に疲労させる
          // reserveToTrash=リザーブのコアをこの数だけトラッシュへ。selfCoresToTrash=発生源自身の上のコアをこの数だけトラッシュへ。
          // discardHandFamily=手札にある指定系統（配列＝OR）を1枚破棄
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
      }
    | {
          id: string
          kind: "aura"
          levels: number[] | null
          whileCombined?: true
          aura: AuraDef
          lentOnly?: boolean // lendSelfThisTurn で貸した効果（仮想発生源）からだけ有効（2026-08-24）
          whileOwnBurstSet?: true // バーストをセットしている間だけ発揮
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          whileCombined?: true
          whileOwnBurstSet?: true // バーストをセットしている間だけ発揮
          condition?: AuraCondition // aura.conditionと同じ判定式を流用
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // aura.phaseTurnと同義
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "sokuPaySourceGrant" // 発生源が場にある間、持ち主の【神速】召喚コストをフィールドのコアからも支払えるようにする（基礎ルールはリザーブのみ）
          levels: number[] | null
          scope: "anyField" | "self" // anyField=フィールドのスピリット/ネクサスすべて／self=発生源自身の上のみ
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" // 指定時、持ち主がturnPlayerのときのみ有効（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "shinsokuPayAssist" // 発生源が場にありレベル有効の間、持ち主の【神速】召喚時、発生源自身を疲労させることを追加コストにcostまでを支払ったものとして扱う
          levels: number[] | null
          cost: number // 肩代わりする召喚コストの上限（021＝2）
          phase?: Phase // 指定時はこのステップ中のみ有効（021＝アタックステップ）
      }
    | {
          id: string
          kind: "magicTargetRedirect" // 発生源が場にありレベル有効の間、相手が使用したマジックが発生源を対象に含むとき、対象を発生源のみに絞る
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
          phase?: Phase // 指定時、state.phaseが一致するときのみ有効
          protectFamily?: FamilyFilter // 指定時、「発生源自身が対象」でなく「持ち主のこの系統（配列＝OR）が対象に含まれる」ときに絞り込む。絞り込み先は発生源自身
          protectColor?: Color // protectFamilyと併用：守る対象をこの色を持つスピリットに限る（スノーホワイト＝白）
          protectCost?: number // protectFamilyと同型：守る対象を持ち主のこのコストのスピリットに限る
          optional?: true // 「〜にできる」＝任意。対話モードでは絞り込む前に確認を出す（PendingChoice.magicRedirect）。未指定＝強制。現行4枚はすべて「できる」なのでtrue
      }
    | {
          id: string
          kind: "jugekiCoreToVoid" // 発生源が場にありレベル有効の間、持ち主のスピリットの【呪撃】で破壊される相手スピリット上のコアをcount個ボイドへ
          levels: number[] | null
          count: number
      }
    | {
          id: string
          kind: "countAsMultiple" // 発生源が場にありレベル有効の間、持ち主の効果が「スピリットの数を数える」とき、この個体をcount体分として数える
          levels: number[] | null
          count: number
          sourceTypes?: CardType[] // 数える側の効果の発生源種別をこれに限る。省略時は種別を問わない
      }
    | {
          id: string
          kind: "nexusCostMillPay" // 発生源が場にありレベル有効の間、持ち主はネクサスの配置コストを「コスト1につきデッキ上から1枚破棄」で支払える（コアは払えない）。
          // 全額コアか全額デッキ破棄かのどちらかを選ぶ
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "magicNegate" // 発生源が場にありレベル有効の間、相手が使用したマジックの効果を無効にする（カード自体は通常どおりトラッシュへ。「マジック使用時」誘発は発揮される）。実対戦では防御側に確認を出す
          levels: number[] | null
          cost: { selfCoresToVoid: number } | { exhaustSelf: true } | { none: true } // none=支払い無し。selfCoresToVoid=発生源上のコアをN個ボイドへ／exhaustSelf=発生源を疲労（回復状態でなければ使えない。【氷壁】）
          colors?: Color[] // 指定時、そのいずれかの色を持つマジックだけを無効にできる（【氷壁：赤】＝赤のみ）
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのときのみ／opponent=でないときのみ（【氷壁】＝『相手のターン』）
          afterNegate?: "selfToDeckBottom" // 無効にした後、発生源自身をデッキの下へ戻す（「その後」＝結果であり支払いではない。無効にしなければ戻らない。2026-08-16確認。SD02-014 Lv2）
          oncePerTurn?: true // 発生源1つにつきターン1回だけ
      }
    | {
          id: string
          kind: "burstSetCost" // 発生源が場にありレベル有効の間、相手がバーストをセットするにはリザーブのコアreserveToTrash個をトラッシュに置かなければならない
          levels: number[] | null
          reserveToTrash: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // own/opponentは持ち主基準
      }
    | {
          id: string
          kind: "magicNegatePayByNexusGrant" // 発生源が場にありレベル有効の間、持ち主の【氷壁】（cost:{exhaustSelf}のmagicNegate）の支払いを自分のネクサス1つを疲労させることで代替できるようにする
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "magicNegateTurnOverrideGrant" // 発生源が有効な間、持ち主のスピリットが持つ【氷壁】の発揮タイミングをturnへ置き換える
          levels: number[] | null
          turn: "own" | "opponent"
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効。aura.lentOnlyと同じ意味
      }
    | {
          id: string
          kind: "bothSidesTargetRedirect" // 発生源が場にありレベル有効の間、「お互いを対象とするマジックの効果」の対象を片側だけに変更する。選択を挟む仕組みが無いため発生源の持ち主に有利な側に固定する
          levels: number[] | null
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのときのみ有効（『自分のターン』）
      }
    | {
          id: string
          kind: "familySuppression" // 発生源が場にありレベル有効の間、条件に合うスピリットは系統をないものとして扱う
          levels: number[] | null
          target: "anyAll" | "opponentAll" // anyAll=両陣営のスピリットすべて（『すべては』）／opponentAll=相手のスピリットすべて
          maxCores?: number // 指定時、置かれているコアがこの数以下のスピリットのみ対象
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのときのみ有効（『自分のターン』）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効。aura.lentOnlyと同じ意味
      }
    | {
          id: string
          kind: "battleSwapSummon" // 手札のスピリットを、フラッシュ中のバトルで「バトル中の自分のsubstituteName一致スピリット1体を手札に戻す」ことを追加コストに疲労状態で召喚し、バトルを引き継ぐ
          // 召喚コストは通常どおり支払う
          levels: number[] | null // 手札のカードが対象なので実質レベル不問だが、効果文の見出しに合わせて持つ
          substituteName: string // 手札に戻す対象のカード名。完全一致（部分一致にすると自分自身も対象になりうる）
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
          kind: "handKeywordGrant" // 発生源が場にありレベル有効の間、持ち主の手札にある条件一致のカードにキーワードを与える。tempHandKeywordGrants（ターン限定の一時付与）と違い、手札には書き込まず判定時に発生源を見る
          levels: number[] | null
          keyword: Keyword
          familyFilter?: string // 指定時はカード静的な系統にこれを含むカードのみ
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）カードのみ
          cardType?: CardType // 指定時はこの種別のカードのみ（省略時はスピリット）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "battleBpAsLevel" // 発生源が場にありレベル有効の間、持ち主のfromLevelのスピリットはバトルのBP比較のときだけuseLevelのBPを使う
          levels: number[] | null
          fromLevel: number
          useLevel: number
          side?: "both" // 指定時は持ち主だけでなく両陣営のスピリットが対象
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          keywordFilter?: Keyword // 指定時はこのキーワードを持つスピリットのみ対象
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnでこのターンだけ貸した効果）からのみ有効
      }
    | {
          id: string
          kind: "destroyAsMaxLevelGrant" // 発生源が場にある間、対象は相手効果でコア0になったとき消滅でなく最高Lv破壊（onDestroy誘発あり）扱いになる
          // 判定はstate.currentEffectSourceが「持ち主と異なるpidのspirit/brave/magic」を指しているかで「相手の効果で」を見る
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身／ownAll=持ち主のスピリットすべて
          whileCombined?: true // target:"self"時は発生源自身が対象
      }
    | {
          id: string
          kind: "constraintSuppression" // 発生源が場にありレベル有効の間、持ち主の対象スピリットが持つ指定タイプの制約を発揮させない
          levels: number[] | null
          target: "ownAll"
          constraintType: ConstraintDef["type"] // 発揮させない制約のタイプ
          nameContains?: string // 指定時はカード名にこの文字列を含むスピリットのみ
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのときのみ
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
          subjectMaxCost?: number // イベントの主体のコストがこれ以下のときのみ発火
          subjectHasTrigger?: TriggerEvent // イベントの主体が指定トリガーの誘発効果を現在のレベルで静的に持つときのみ発火
          byBattleOnly?: true // event: "ownSpiritDestroyed" 限定：バトルのBP比較による破壊のときのみ発火
          attackerOnly?: true // event: "ownSpiritDestroyed" 限定：破壊されたスピリットがそのバトルのアタッカーだったときのみ発火
          duringSelfAttack?: true // event: "opponentSpiritDestroyed" 限定：発生源自身が現在のバトルのアタッカーのときだけ発火
          excludeSelfSubject?: true // 主体が発生源自身なら発火しない
          selfOnly?: true // event: "ownSpiritDestroyed" 限定：発生源自身が破壊されたときだけ発火
          byOpponentOnly?: true // event: "ownSpiritDestroyed" 限定：相手によって破壊されたとき
          byOpponentEffectOnly?: true // event: "ownNexusDestroyed" | "ownSpiritDestroyed" | "ownSpiritExhausted" 限定：相手のスピリット/ネクサス/マジックの効果で破壊/疲労したときのみ発火。
          // ownSpiritDestroyedはバトルのBP比較で敗れた場合も含む。ownSpiritExhaustedはネクサスの効果を含まない。
          // destroyNexusに渡されたDestroyContextで判定し、発生源不明のときは発火しない側に倒す（文脈不明時に限定を緩める方が誤りが大きいため）
          byOpponentSpiritEffectOnly?: true // event: "ownSpiritDestroyed" 限定：相手のスピリットの効果で破壊されたときのみ発火（DestroyContext.sourceType==="spirit"かつsourcePidが持ち主と異なるときのみ）
          refreshSourceTypeFilter?: CardType[] // event: "anySpiritRefreshed" 限定：回復させた効果の発生源種別（配列＝OR）で絞る
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
          paidCostOnly?: true // event: "ownMagicUsed" 限定：「コストを支払って」使用されたときのみ発火。「コストを支払わずに使用」経由の使用だけが除外される（2026-09-07確認。BS11-X05 Lv2-3）
          magicFreeUseMaxPerTurn?: number // event: "ownMagicUsed" 限定：発生源が実際に無償使用を行った回数（CardInstance.magicFreeUseCount）がこの値未満のときのみ発火。
          // 発動確認で「使わない」を選んだ・候補が無く不発だったときは消費しない（2026-09-07確認。BS11-X05 Lv2-3）
          familyFilter?: FamilyFilter // event: "ownSpiritDestroyed" | "ownSpiritSummoned" | "ownSpiritExhausted" | "anySpiritExhausted" 限定：主体の系統がこれを含むときのみ発火
          // 破壊/召喚はeventInfo.families（カード静的な系統）で判定。疲労イベントはfamiliesを渡さないためselfOverrideをmatchesFamilyFilterで判定
          fromHandOnly?: true // event: "ownSpiritSummoned" 限定：手札から召喚されたときのみ発火
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
          kind: "targetNegateByHandDiscard" // 発生源が場にありレベル有効の間、持ち主のfamilyFilter一致スピリットは、相手のスピリットの効果の対象になるたび手札をdiscardCount枚破棄することでその効果を受けない。
          // probing（候補列挙）では払わない＝対象にはなる。「〜することで」は本来任意コストだが、確認を都度出すと解決が止まるため常に支払う簡略化（手札0枚なら免除）。破棄は手札末尾から
          levels: number[] | null
          familyFilter: FamilyFilter // 守られる側の系統（配列＝いずれかでOR）
          bySourceType: "spirit" // 効果の発生源の限定（いまは「相手のスピリットの効果」のみ）
          discardCount: number // 1回の対象化につき破棄する手札の枚数
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" } // 『自分のアタックステップ』などの限定
      }
    | {
          id: string
          kind: "summonCostHandDiscardPay" // 発生源が場（このターンの仮想発生源）にある間、持ち主はスピリットの召喚コストを「コスト1につき手札1枚破棄」で支払える
          levels: null // 貸与専用（マジックがlendSelfThisTurnで自分を貸す）。仮想発生源はLv0なのでnull固定
      }
    | {
          id: string
          kind: "deckMillNegate" // 発生源が場にありレベル有効の間、持ち主のデッキが破棄されるとき、コストを払ってその破棄を無効にできる。
          // 任意コストなので確認を出す：millDeckは破棄を見送ってpendingDeckMillNegatesへ積み、handleActionの末尾で確認する（破棄処理の途中では中断できないため）。断られたら改めて破棄する。非対話（smoke）では自動で支払う
          levels: number[] | null
          by: "opponentSpiritEffect" | "opponentEffect" // 破棄の発生源の限定。opponentSpiritEffect=相手のスピリットの効果で（従来）／opponentEffect=相手によって
          turn?: "opponent" // 見出しの『相手のターン』限定。相手のフラッシュ効果で自分のターン中にデッキが破棄されたときは無効にできない
          exceptFunsai?: true // 【粉砕】による破棄は対象外
          cost: { ownLifeToReserve: number } | { exhaustSelf: true } // 支払うコスト。ownLifeToReserve=ライフのコアをこの数だけリザーブへ（足りなければ確認自体を出さない）／exhaustSelf=このスピリット自身を疲労
          thenReturnCauseToDeckBottom?: true // 無効化成立時、破棄を引き起こした相手のスピリット（currentEffectSource.instanceId。破壊済みならno-op）を相手のデッキの下に戻す
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
          thenProtectDeckThisTurn?: true // この召喚が成立したときだけ、このターンの間デッキは（相手の効果では）破棄されなくなる
          thenBlockAllDeckMillThisTurn?: true // then:"destroyMillSource"専用：破壊解決後、このターンの間自分の効果も含めデッキは破棄されなくなる
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          whileCombined?: true
          whileOwnBurstSet?: true // バーストをセットしている間だけ発揮
          constraint: GlobalConstraintDef // フィールド発生源から全スピリット／全ネクサスに効く制約（発生源の持ち主を問わない。ただしownNexusIndestructibleは持ち主自身のみに効く）
          condition?: { ownVanillaSpiritsAtLeast?: number; allOwnNexusesHaveColor?: Color; ownNexusCountExactly?: number; ownFamilyCountAtLeast?: { family: FamilyFilter; count: number } } // ownNexusCountExactly＝ネクサス数がちょうどこの数のときだけ有効。
          // constraint:"ownNexusIndestructible"用の発揮条件。ownVanillaSpiritsAtLeast＝バニラスピリット数がこれ以上。allOwnNexusesHaveColor＝ネクサスすべてがその色。ownFamilyCountAtLeast＝指定系統がcount体以上
          phase?: Phase // constraint: "battlingCoresProtected" | "opponentCantAttackByCost" 用：指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" | "both" // 同上用：own=持ち主がturnPlayerのとき。opponentCantAttackByCostのopponentは「相手のアタックステップ」
      }
    | {
          id: string
          kind: "mustBlockGrant" // 発生源が場にありレベル有効の間、持ち主のスピリットのアタックに対し相手は可能なら必ずブロックしなければならない
          levels: number[] | null
          familyFilter?: FamilyFilter // 指定時はその系統（配列＝OR）を持つアタッカーのアタックのみ強制ブロック
          blockerMaxBp?: number // 指定時は実効BPがこれ以下の合法ブロッカーがいるときのみ強制ブロック
          firstAttackOnly?: boolean // trueならそのターンの最初のアタックのみ
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのとき（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "summonedExhaustGrant" // 発生源が場にありレベル有効の間、相手のスピリットは召喚されたとき疲労する
          levels: number[] | null
          condition?: { selfRested: true } // 指定時、発生源自身が疲労状態のときのみ有効（ファニムLv2-3＝「このスピリットが疲労状態の間」）
      }
    | {
          id: string
          kind: "awakenFromReserve" // 発生源が場にありレベル有効の間、持ち主のスピリットすべての【覚醒】は「自分のスピリット上」に加え自分のリザーブからもコアを置けるようになる
          levels: number[] | null
          target: "ownAll"
          superAwakenOnly?: true // 指定時は【超覚醒】を持つスピリットにだけ有効
      }
    | {
          id: string
          kind: "bpBuffSuppression" // 発生源が場にありレベル有効の間、相手のスピリット/ネクサス/マジックによる「BPを+する」効果を発揮させない。BPを-する効果は対象外
          levels: number[] | null
          phase?: Phase // 指定時はこのステップの間のみ有効
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのときのみ（『自分のアタックステップ』）
      }
    | {
          id: string
          kind: "triggerSuppression" // 発生源が場にありレベル有効の間、相手のスピリットの指定トリガーを発揮させない
          levels: number[] | null
          trigger: TriggerEvent
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのとき、opponent=非turnPlayerのとき（『相手のメインステップ』＝opponent）
      }
    | {
          id: string
          kind: "costMod" // 加算：軽減後コストにamountを足す
          levels: number[] | null
          mode?: undefined // 置換は下のmode:"set"側の枝。ここでsetを書けないようにして両者を排他にする
          amount: number // 軽減後コストに加算する量（amountCounter指定時はamount×カウンタ値）
          amountCounter?: EffectCounter // 指定時、amountはカウンタ1につきの増分にする
          beforeReduction?: true // 指定時、この加算は軽減の前に総コストへ足す
          colorFilter?: Color // 対象カードの色（省略時は色不問。両陣営に効く）
          cardType?: CardType // 対象カードの種別
          side?: "opponent" // 指定時は「発生源の持ち主から見て相手」のカードのみに適用
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 持ち主基準のステップ・turn条件
          turn?: "own" | "opponent" // phaseTurnと違いステップを問わないturn限定
          condition?:
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // フィールドに指定系統がcount体以上
              | { opponentFieldColorsAtLeast: number } // 相手フィールドの色の種類数がこれ以上
      }
    | {
          id: string
          // 置換：使用コストをsetToにする。
          // effectiveCostは「置換→costMod加算」の順で適用し、置換が効くときは軽減シンボルを一切適用しない（原文の値をそのまま使う）。
          // 加算側のフィールド（colorFilter/cardType/side/phaseTurn/condition）はここには書けない（costSetOverrideが読まないため型で塞いである）。
          // costSetOverrideはeffectSources(board, usingPid)＝自分の発生源しか見ないため、「相手のカードのコストを◯にする」は構造上表現できない
          kind: "costMod"
          levels: number[] | null
          mode: "set"
          setTo: number // 置換後のコスト値（2026-07-26に旧amountから改名。「+5」と読み違えないため）。setToCounter指定時は無視される
          setToCounter?: "ownLife" // 指定時はsetToでなく、その時点の値を置換後のコストにする
          familyFilter?: FamilyFilter // 対象カードが持つ系統
          keywordFilter?: Keyword // 対象カードが静的に持つキーワード
          costFilter?: { max?: number; min?: number } // 対象カードの元コストの範囲
          nameContains?: string // 対象カードのカード名にこの文字列を含むもののみ
          cardTypeFilter?: CardType // 対象カードの種別
          scope?: "self" // 指定時は「手札にあるこのカード自身」の効果
          condition?: { ownNexusAtLeast: number } | { ownLifeAtMost: number } | { ownTrashFamilyCountAtLeast: { family: FamilyFilter; count: number } } | { ownBurstSet: boolean } // ownLifeAtMost＝ライフがこれ以下のときのみ有効。
          // scope:"self"用：発生源の持ち主のネクサス数がこれ以上のときのみ有効。ownBurstSet＝バーストセット中(true)／未セット(false)のみ有効
          // ownTrashFamilyCountAtLeast＝トラッシュにある指定系統（配列＝OR）のスピリットカード枚数がcount以上のときのみ有効
      }
    | {
          id: string
          kind: "activated"
          whileCombined?: true
          // 起動の対象は合体中のブレイヴ自身のinstanceIdだが、効果のselfにはホスト（合体スピリット）が渡る
          timing: "flashBattle" | "flash" | "main" // flashBattle＝フラッシュ中のバトルのみ／flash＝フラッシュで使えるタイミング全般／
          // main＝自分のメインステップ中の任意のタイミング（バトル中は不可、フラッシュ優先権も見ない）。
          // 『自分のメインステップ』としか書かれておらず「ステップ開始時」の指定が無い効果はこちら
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 『自分のアタックステップ』等の絞り込み（AuraDef.phaseTurnと同型）。
          // timingだけでは「フラッシュで使えるタイミング全般」になり相手ターンにも撃ててしまうため、ステップを明示しているカードには必ず付ける
          cost?: { reserveToTrash: number } | { exhaustSelf: true } | { selfCoresToTrash: number } | { discardHandFamily: FamilyFilter } | { exhaustOwnFamilyOne: FamilyFilter } | { discardHandOne: true; exhaustSelf: true } | { discardHandKeyword: Keyword } | { discardHandColor: Color } // 発動コスト。reserveToTrash=リザーブから／exhaustSelf=自身を疲労。省略時は追加コストなし
          // discardHandColor=手札にある指定色のカード（種別不問）1枚を破棄。selfCoresToTrash=発生源自身の上のコアをこの数だけトラッシュへ。
          // discardHandFamily=手札にある指定系統（配列＝OR）のスピリットカード1枚を破棄。exhaustOwnFamilyOne=フィールドの指定系統（配列＝OR）の回復状態スピリット1体を疲労。
          // { discardHandOne; exhaustSelf }=手札1枚（末尾。決定的簡略化）を破棄しこのスピリット自身を疲労。{ discardHandKeyword }=指定キーワードを静的に持つ手札のスピリットカード1枚を破棄
          oncePerTurn?: true // 「ターンに1回」。発生源のスピリット1体につきターン1回
          condition?: "selfInBattle" // 発動条件（selfが現在のバトルの当事者＝attacker/blocker）
          action: EffectAction // 発動時の効果
      }
    | {
          id: string
          kind: "altSummonFromHand" // 手札にあるこのカード自身の代替召喚ルート。通常の召喚コストの代わりに指定の支払い（cost）をして召喚できる
          levels: null
          timing: "main" // 自分のメインステップ中の任意のタイミング
          cost: { returnOwnNexusToDeckBottom: { color: Color; count: number } } // 指定色の自分のネクサスcount個をデッキの下（末尾）に戻すことがコスト
      }
    | {
          id: string
          kind: "coreBonus" // このスピリットに効果でコアが置かれるとき、置く数を+amount（ボイド由来）する
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "tenshoSelfCostBonus" // 持ち主が【転召】を持つスピリットカードを召喚するとき、このスピリット自身のコストを+amountとして扱う。
          // 【転召】は「コストN以上の自分のスピリット1体」を生贄に要求するため、これがあると本来コストの足りない自身も生贄に選べる。
          // 効くのは転召の生贄判定だけで、召喚コストやinstAllCosts一般には影響しない
          levels: number[] | null
          amount: number
          target?: "ownAll" // 省略時は「このカード自身」（従来＝グングニル）。"ownAll"指定時は持ち主のスピリットすべてが対象
          familyFilter?: FamilyFilter // target:"ownAll"用。指定系統（配列＝OR）を持つスピリットのみ
      }
    | {
          id: string
          kind: "coreReturnBonus" // 発生源が場にありレベル有効の間、お互いのスピリットから効果でリザーブへ置かれるコアの数を+amountする
          levels: number[] | null
          amount: number
          targetSide?: "opponent" // 相手のスピリットから取り除くときだけ効く
          includeTrash?: true // リザーブ行きに加えトラッシュ行きにも効かせる
          ownBurstOnly?: true // 発生源の持ち主のバースト効果を解決している間だけ効く
      }
    | {
          id: string
          kind: "coreStepBonus" // 持ち主のコアステップで得られるコアを+amountする
          levels: number[] | null
          amount: number
          condition?: { ownFieldHasNames: string[] } | { ownFieldHasFamily: string } // ownFieldHasNames=指定カード名すべてがフィールドにそろっているときのみ有効／ownFieldHasFamily=指定系統を持つスピリットがいるときのみ有効
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
          kind: "levelCostMod" // 発生源が場にありレベル有効の間、対象スピリットすべての「Lvコスト」（各レベルに必要なコア数）をamountだけ増やす。
          // Lv1のコストも上がるので、コアが足りなくなった個体は維持コア割れで消滅する（2026-08-14確認。BS09-017蛇凰神バァラル）
          levels: number[] | null
          target: "opponentAll" | "ownAll" | "opponentNexusesAll" // opponentNexusesAll=対象がスピリットでなく相手のネクサスすべて
          amount: number
      }
    | {
          id: string
          kind: "keywordGrant" // 発生源が場にありレベル有効の間、持ち主のfamilyFilter一致スピリットすべてにキーワードを継続付与する
          levels: number[] | null
          whileCombined?: true
          onlyWhileSpiritState?: true // whileCombinedの逆：発生源自身がスピリット状態（合体していない）のときだけ発揮。
          // combinedBravesは合体中もeffectSourcesに含まれ続けるため、whileCombinedを付けない継続付与は既定では合体後も効き続ける
          keyword: Keyword
          target: "ownAll"
          combinedFilter?: true // 指定時は対象（合体スピリット）のみ
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnでこのターンだけ貸した効果）からのみ有効
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時/継続付与を考慮）を持つスピリットのみ
          keywordFilterAny?: Keyword[] // keywordFilterのOR版
          colors?: Color[] // keyword:"armor"用：付与する装甲の対象色
          costFilter?: { max?: number; min?: number } // 指定時は対象スピリットのコストがmax以下/min以上のみ
          phase?: Phase // 指定時はこのステップの間のみ有効（turnPlayerを問わない＝『お互いの〜ステップ』）
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『自分のアタックステップ』を表す
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ
          braveInSpiritState?: true // 指定時はスピリット状態のブレイヴのみ
          minBp?: number // 指定時は実効BPがこれ以上のスピリットのみ
          count?: number // keyword:"kyoshu"/"bofu"等、数値を伴うキーワード用の指定数
      }
    | {
          id: string
          kind: "braveImmuneGrant" // 発生源が場にありレベル有効の間、対象スピリットに「相手のブレイヴの効果を受けない」を継続付与する。【装甲】【重装甲】とは別枠の第3の耐性軸
          levels: number[] | null
          target: "self" | "ownAll"
          scope: "all" | "matchArmorColors" // all=色を問わず相手のブレイヴの効果を受けない／matchArmorColors=対象が持つ【装甲】の色と一致する色の相手のブレイヴだけ防ぐ
          colorFilter?: Color // target:"ownAll"用：この色を持つスピリットのみ
          keywordFilter?: Keyword // target:"ownAll"用：このキーワードを持つスピリットのみ
          phase?: Phase // 指定時はこのステップの間のみ有効
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『相手のメインステップ』を表す
      }
    | {
          id: string
          kind: "armorEffectiveGrant" // 【合体時】等で「このスピリットが持つ【装甲】（付与された分も含めた実効の色）を自分のスピリットすべてに与える」。
          // keywordGrantのkeyword:"armor"と違い、発生源自身の実効【装甲】色を都度算出して配る
          levels: number[] | null
          target: "ownAll"
          whileCombined?: true
      }
    | {
          id: string
          kind: "effectEntryGrant" // 発生源が場にありレベル有効の間、対象スピリットに任意のeffectエントリ本体を継続付与する。
          // effectGrantは誘発（trigger+action）しか配れないため、magicNegate等の常在エントリを配るための兄弟。疲労コストは配られた側自身を疲労させる
          levels: number[] | null
          target: "ownAll"
          keywordFilterAny?: Keyword[] // 対象がこのいずれかのキーワードを持つスピリットのみ
          familyFilter?: FamilyFilter // 対象がこの系統（配列＝OR）を持つスピリットのみ
          granted: Extract<EffectDef, { kind: "magicNegate" }> // 付与するエントリ本体（levelsは常に有効扱い）
      }
    | {
          id: string
          kind: "familyGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに系統を継続付与する
          levels: number[] | null
          whileCombined?: true
          target: "ownAll" | "self" // self＝発生源自身にだけ付与する
          family?: string // 付与する系統（familyFromChoice / familiesFromOwnField指定時は不要）
          familyFromChoice?: true // familyの代わりに、発生源インスタンスのlentChoiceFamily（貸与時にプレイヤーが選んだ系統）を付与する
          familiesFromOwnField?: true // familyの代わりに、持ち主のフィールドのスピリットが（カード静的に）持つ系統すべてを動的に付与する
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          colorFilter?: Color // 指定時は対象スピリットの色がこれと一致するときのみ
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ
          phase?: Phase // 指定時はこのステップ中のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』）
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。phaseと併用して『自分のアタックステップ』を表す
          condition?: { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサス合計が指定色でcount以上
      }
    | {
          id: string
          kind: "alsoCostGrant" // 発生源が場にありレベル有効の間、持ち主のスピリットすべてを「コストNのスピリットとしても扱う」
          levels: number[] | null
          target: "ownAll"
          cost?: number // 「このコストとしても扱う」値
          costs?: number[] // 複数の値を同時に与える
          whenDestroyedOnly?: true // 指定時は破壊されたときの判定にだけ効く（【不死】の引き金コスト判定だけが読む）。
          // 効果文が場面を限っているため常時のalsoCostsContinuous（コスト参照の効果すべてに効く）とは別の置き場にする（2026-09-02確認。BS11-064 Lv1）
          plus?: number // 指定時は固定値ではなく「元のコスト+plus」として扱う。
          // 目的は【転召：コスト◯以上】の条件を満たしやすくすること（2026-08-16確認。docs/design/SD02_PLAN.md §1）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          combinedOnly?: true // 合体スピリットのみ対象
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "reductionGrant" // 発生源が場にありレベル有効の間、条件成立時に対象カード種別/色の使用コストへ軽減シンボルを付与する
          levels: number[] | null
          cardType?: CardType // 対象カード種別（省略時は種別不問）
          cardColor?: Color // 対象カードの色（省略時は色不問）
          keywordFilter?: Keyword // 対象手札カードがこのキーワードを静的に持つ場合のみ付与
          familyFilter?: FamilyFilter // 対象カードが持つ系統（カード静的なfamilyのみ）。配列＝OR
          selfOnly?: true // 対象を発生源自身のカード（手札にあるこのカード）だけに絞る
          symbolCountFromFamily?: FamilyFilter // symbolsを固定1組ではなく、持ち主のフィールドの指定系統（配列＝OR）のスピリット数ぶん繰り返し付与する
          symbols: Color[] // 与える軽減シンボル（symbolCountFromFamily指定時は先頭の1色を繰り返す）
          replace?: true // 指定時は素の印刷軽減シンボルを置き換える。省略時は加算
          vanillaFilter?: true // 指定時は対象カードが効果の記述を持たない（バニラ）ときのみ付与
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // phaseと併用: 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサス合計が指定色でcount以上
              | { ownColorSpiritsAtLeast: { color: Color; count: number } } // 指定色スピリットがcount体以上
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数がこれ以上
      }
    | {
          id: string
          kind: "trashSymbolReduction" // 対象のカードは、フィールドのシンボルに加え自分のトラッシュにあるカードのシンボルでも召喚コストを軽減できる
          levels: number[] | null
          scope: "self" | "ownHand" // self=手札にあるこのカード自身にだけ効く／ownHand=持ち主の手札のカードに効く（092＝ネクサス）
          cardType?: CardType // scope:"ownHand"用の絞り込み（092＝spirit）
          cardColor?: Color // scope:"ownHand"用の絞り込み（092＝yellow）
      }
    | {
          id: string
          kind: "immunityGrant" // 持ち主のfamilyFilter一致スピリットすべては、相手のマジックの効果を受けない。target:"self"は発生源自身だけが受けない
          levels: number[] | null
          target: "ownAll" | "self"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          includeSelf?: boolean // 指定時はfamilyFilterに関わらず発生源自身も対象に含む
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時/継続付与を考慮）を持つスピリットのみ
          combinedFilter?: true // 指定時は合体スピリットのみ対象
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ対象
          against: "magic" | "bounce" // magic=相手のマジックの効果を受けない／bounce=相手の効果によるバウンスを受けない。自分自身の効果によるバウンスは対象外
          condition?: { ownCostCountAtLeast: { cost: number; count: number } } // フィールドに指定コストのスピリットがcount体以上のときのみ有効
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効
      }
    | {
          id: string
          kind: "costDelta" // 発生源が場にありレベル有効の間、対象スピリットのコストをamountだけ増減する（継続）。
          // ⚠️ 増減は置き換えであって追加ではない（tempCostDeltaと同じ。「コスト+3」したスピリットは「コスト3以下を破壊」にもう当たらない）。BS11-017 Lv2-3＝『自分のアタックステップ』コスト+3
          levels: number[] | null
          target: "self" | "ownAll"
          amount: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効
      }
    | {
          id: string
          kind: "trashSummonOnNameSummoned" // トラッシュにあるこのカード自身の効果：持ち主のフィールドにnameIncludesを含むスピリットが召喚されたとき、このカードを無償召喚できる（任意）。
          // 【不死】と同じくトラッシュのカードが発生源なのでeffectSourcesでは拾えず、fireSummonSequenceが持ち主のトラッシュを走査する。維持コアはリザーブから払う
          levels: null
          nameIncludes: string
      }
    | {
          id: string
          kind: "levelAs" // 継続的な「Lv◯として扱う」置換
          levels: null
          whileCombined?: true
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsAll" | "ownSpiritsByKeyword" | "ownSpiritsByFamily" | "ownSpiritsVanilla" | "opponentSpiritsAll" | "allSpiritsByChosenColor" | "opponentBlockersOfOwnKeyword" // ByKeyword=keywordFilter一致（Lv不問）／ByFamily=familyFilterのOR／Vanilla=無地スピリット／allSpiritsByChosenColor=貸与時に選んだ色の両陣営
          treatAs: number | "max" | "coresScaled" | { plus: number } // 扱うレベル。
          // 数値=そのレベル固定／"max"=対象カード自身が持つ最高Lv（対象ごとに算出）／"coresScaled"=対象のコア数で換算／
          // { plus: N }=いまのレベルから相対的にN上げる（BS10-094 Lv2「Lvを1つ上のものとして扱う」。2026-08-25確認で「文字どおり」）。
          // ⚠️ 相対シフトはそのカードが持つ最高Lvで頭打ち（そのレベル定義が無いとlevelOfが置き換えを黙って無視し効果が無言で消える）
          costMinFilter?: number // target: "ownSpiritsAll" 用：対象スピリットのコストがこれ以上のときのみ
          nameContains?: string // target: "ownNexusesAll" 用：カード名にこの文字列を含む自分のネクサスのみ対象
          keywordFilter?: Keyword // target: "ownSpiritsByKeyword" 用。target: "opponentBlockersOfOwnKeyword" では「このキーワードを持つ自分のスピリットをブロックしている相手」を指す
          familyFilter?: FamilyFilter // target: "ownSpiritsByFamily" 用
          effectsOnly?: true // この置き換えを効果の発揮判定にだけ効かせる。表示や他カードから見えるレベル（displayLevel）は無視する。
          // 効果文が「Lv◯として扱う」でなく「Lv◯効果は発揮されない」と書いているカード用
          summonedThisTurnOnly?: true // target: "ownSpiritsVanilla" 用：対象のsummonedTurnが現在のターンのときのみ
          phase?: Phase // 指定時、state.phaseが一致するときのみ有効
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          condition?:
              | { maxOwnSpirits: number } // 自分のフィールドのスピリット数がこの値以下の間有効（発生源自身を含む）
              | { anyFieldHasColorSpirit: Color } // 自分か相手のどちらかのフィールドに指定色のスピリットがいる間有効
              | { ownFieldHasFamily: string } // フィールドに指定系統を持つスピリットがいる間有効
              | { ownSpiritCountBelowOpponent: true } // フィールドのスピリット数が相手より少ない間有効
              | { ownFieldHasCombinedSpirit: true } // フィールドに合体スピリットがいる間有効
              | { ownBurstSet: true } // バーストをセットしている間有効
              | { ownLifeAtLeast: number } // ライフがこの数以上の間有効
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数がこれ以上の間有効
          sourceMinLevel?: number // 発生源の素のレベル（コア数基準。上書き無視）がこれ以上のときのみ有効
          sourceLevels?: number[] // 発生源の素のレベル（コア数基準。上書き無視）がこの配列に完全一致で含まれるときのみ有効
      }
    | {
          id: string
          kind: "bpAs" // 継続的な「BPを◯として扱う」置換
          levels: number[] | null
          whileCombined?: true
          target: "ownSpiritsByFamily" // 現状はこれだけ対応。増やす必要が出たらlevelAsに合わせる
          familyFilter: FamilyFilter
          amount: number
      }
    | {
          id: string
          kind: "destroyBpThresholdBonus" // 発生源が場にある間、持ち主の「BP◯以下破壊」判定の閾値にamountを加算（重ねがけ可）。ブレイヴ自身・ネクサスの効果には効かない（Q22378〜Q22382）
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "bpEqualizeFamily" // 発生源が場にありレベル有効の間、指定系統を持つ発生源以外の自分のスピリットすべてのLv別BPを、発生源自身の現在の実効BP（合体時BP込み）と同じとして扱う。
          // 全面上書き
          levels: number[] | null
          familyFilter: FamilyFilter
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効
      }
    | {
          id: string
          kind: "nexusAsSpiritDuringAttackStep" // 発生源が場にある間、条件に合う自分のネクサスをお互いのアタックステップ中だけスピリット扱いにする（treatOwnNexusesAsSpiritsThisTurnのアタックステップ限定版）
          // field.nexuses→field.spiritsへ同じインスタンスのまま移し、ステップ終了で戻す
          levels: number[] | null
          nameContains?: string // カード名にこの文字列を含む自分のネクサスのみ対象
          minCores?: number // コアがこの数以上のネクサスのみ対象
          cost: number
          family: string[]
          spiritLevels: LevelDef[]
      }
    | {
          id: string
          kind: "colorAs" // 発生源自身（target:"ownAll"指定時は持ち主のスピリットすべて）が指定色のスピリットとしても扱われる
          levels: number[] | null
          colors: Color[]
          target?: "self" | "ownAll" | "ownNexusesAll" // 省略時は"self"。"ownAll"＝持ち主のスピリットすべて／"ownNexusesAll"＝持ち主のネクサスすべて
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          nameIncludes?: string // target:"ownAll"用：カード名にこの文字列を含むスピリットのみ
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "symbolAddGrant" // 発生源が場にある間、対象（self/ownAll、filterで絞り込み）に指定色シンボルをcount個（counter指定時はその値）継続付与。盤面シンボル数に反映（2026-09-04確認）
          // 軽減計算にもライフダメージにも効く。symbolsOverrideContinuous（kind:"symbolFix"）が有る個体では固定値が勝つ既存の規則は変えない＝固定値に追加分を加算する。BS12-006／BS12-X01
          whileCombined?: true // 発生源（ホスト）にブレイヴが合体している間のみ
          levels: number[] | null
          target: "self" | "ownAll"
          filter?: TargetFilter // target:"ownAll"用の絞り込み（braveInSpiritState / combined / symbolCount等）
          color: Color
          count?: number // 省略時1
          counter?: EffectCounter // 指定時はcountを無視し、カウント値ぶん追加する（0なら追加しない）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          condition?: { ownFieldHasBraveInSpiritState: true } | { ownBurstSet: true } // 指定時はフィールドにスピリット状態のブレイヴがいる間だけ有効。ownBurstSet＝バーストをセットしている間だけ有効
      }
    | {
          id: string
          kind: "symbolFix" // 発生源が場にありレベル有効の間、持ち主の対象スピリット（familyFilter一致）のシンボルを、そのスピリットが元々持つシンボルの1色目でcount個に固定する
          levels: number[] | null
          target: "ownAll" | "self" // self=発生源自身のシンボルだけを固定する
          familyFilter?: FamilyFilter
          count: number
          color?: Color // 指定時は固定するシンボルの色をこの色にする
          summonReductionOnly?: true // スピリット召喚の軽減計算の間だけこの固定値を使う（ライフダメージ等の他のシンボル参照には効かない。2026-09-02確認）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時はこのステップかつturn条件のときのみ有効
      }
    | {
          id: string
          kind: "braveStatsAs" // 発生源が場にありレベル有効の間、持ち主のスピリット状態のブレイヴすべて（合体中のブレイヴは対象外＝BRAVE.md §12.7）のコスト・系統・レベル表（BP）・シンボルを継続的に上書きする。
          // そのブレイヴが元から持つ効果は上書きしない
          levels: number[] | null
          target: "ownAll"
          cost: number
          family: string[]
          braveLevels: LevelDef[] // 上書き後のレベル表（BP）。ブレイヴのスピリット状態は常にLv1のみ1件（§2.2）
          symbolCount: number // シンボルを固定する個数。色はそのブレイヴ自身の色（colors[0]）。
          // symbolFixはsymbol[0]（元々持つシンボルの1色目）を使うが、こちらはそれだと使えない
      }
    | {
          id: string
          kind: "magicBuffBonus" // マジックによるBPバフに追加でBP+する
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効。
          // 実装側が常にstate.phase==="attack"を要求しているので、『自分のアタックステップ』はturn:"own"で表す
          target: "self" | "ownOthers" | "ownAll" // self=発生源自身が対象になったとき / ownOthers=発生源以外の持ち主の緑スピリットが対象になったとき / ownAll=対象になった持ち主のスピリットすべて
          colorFilter?: Color // 使用されたマジックの色（省略時は色不問）
          amountBonus: number
      }
    | {
          id: string
          kind: "effectGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットに誘発効果を継続的に付与する
          levels: number[] | null
          target: "ownAll"
          nameIncludes?: string // 対象スピリットのカード名に含まれる文字列（省略時は自分のスピリットすべてが対象。発生源自身も一致すれば含む）
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          keywordFilter?: Keyword // 指定時はこのキーワードを持つスピリットのみ（効果で得たキーワードも含む。2026-09-25 ユーザー確認）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 見出しの『自分のアタックステップ』等＝そのステップの間だけ付与する（own/opponentは持ち主基準）
          whileCombined?: true
          granted: {
              trigger: TriggerEvent
              action: EffectAction
              condition?: { targetMaxCost: number } | { targetMaxBp: number } // BS07ライフセービング＝相手のコスト3以下をブロックしたとき。targetMaxBpはonBattleEnd用
          } // 付与される誘発効果（levelsは常に有効扱い）
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "drawDouble" // 持ち主フィールドにある間、自分がスピリット/マジックの効果でデッキからドローする合計枚数を2倍にする
          levels: number[] | null
          phaseTurn: { phase: Phase; turn: "own" }
      }
    | {
          id: string
          kind: "nameAsGrant" // 発生源が場にありレベル有効の間、持ち主の対象スピリットを「カード名に指定文字列が入っているもの」として扱う
          levels: number[] | null
          target: "ownAll" | "self" // self＝発生源自身にだけ付与する
          nameIncludes: string // 扱わせるカード名の部分文字列
          costFilter?: number // 対象のコストがこれと一致するスピリットのみ（付与コストも考慮）
          colorFilter?: Color // 対象がこの色を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "trashNameAs" // トラッシュにあるこのカードは、指定名としても扱う
          levels: null
          name: string // 扱わせるカード名
      }
    | {
          id: string
          kind: "vanillaAsGrant" // 発生源が場にありレベル有効の間、対象スピリットを「カードに効果の記述を持たないスピリット（バニラ）としても扱う」
          levels: number[] | null
          target: "ownAll" | "chosenInstance" | "self" // chosenInstance＝targetChoiceLendThisTurnで選んだ1体だけ／self＝発生源自身
          whileCombined?: true // target:"self"時は発生源自身が対象
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          colorFilter?: Color // 指定時は対象がこの色を持つスピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "spiritEffectsDisabledGrant" // 発生源が場にありレベル有効の間、対象スピリットが持つ効果すべてを発揮させない。
          // vanillaAsGrantは「バニラとして扱う」＝対象判定用の述語を変えるだけで発揮は止めないので別物として持つ
          levels: number[] | null
          target: "ownAll" | "opponentAll" | "chosenInstance" // ownAll=持ち主のスピリットすべて／opponentAll=相手のスピリットすべて／chosenInstance=targetChoiceLendThisTurnで選んだ1体だけ
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          keywordExclude?: Keyword // 指定時はこのキーワードを静的に持たないスピリットのみ。
          // 一時/継続付与を見ないのは、spiritHasKeywordがeffectsDisabledContinuousを見るため自己参照になるから
          blockingOnly?: true // 指定時は現在のバトルのブロッカーのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "nexusEffectsDisabled" // 発生源が場にありレベル有効の間、ネクサスすべての効果を発揮させない
          levels: number[] | null
          target: "opponentAll" | "bothAll" // opponentAll=相手ネクサスのみ／bothAll=両陣営のネクサス（白1色縛りは両陣営に効く。2026-09-17確認）
          condition?: { ownFieldOnlyColor: Color; spiritsOnly?: true } // target:"bothAll"用の発揮条件
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "destroyedCoresToTrash" // 発生源が場にありレベル有効の間、スピリットが破壊/消滅したとき、その上のコアを持ち主のリザーブでなくトラッシュへ置く
          levels: number[] | null
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "exhaustOnManualCoreAdd" // 持ち主から見て相手がスピリット/ネクサス/マジックの効果以外（moveCore/awaken）でスピリットのコアを増やしたとき、そのスピリットを疲労させる
          levels: number[] | null
          trigger?: "manual" | "effect" // 省略時="manual"（従来通り。moveCore/awakenのみ、持ち主の相手のメインステップ限定）。
          // "effect"指定時はスピリット/ネクサス/マジックの効果によるコア増加時に判定し、フェーズ不問
          onRemove?: boolean // trueならコア減少時にも同様に疲労させる
          colorFilter?: Color // 指定時、対象スピリットがこの色を持つときのみ疲労させる
          scope?: "opponent" | "any" // 省略時="opponent"（従来通り相手のスピリットのみ）。"any"指定時は自分のスピリットも対象
          anyPhase?: true // 指定時、trigger:"manual"でもメインステップ限定を外す
      }
    | {
          id: string
          kind: "constraintGrant" // 発生源が場にありレベル有効の間、持ち主フィールドの対象（ownAll、minLevel条件）に制約を継続付与する
          levels: number[] | null
          whileCombined?: true
          target: "ownAll"
          minLevel?: number // 対象のcurrentLevelがこれ以上のときのみ付与
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時/継続付与を考慮）を持つスピリットのみ
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          minSymbols?: number // 指定時はシンボル数がこれ以上のスピリットのみ
          nameIncludes?: string[] // 指定時はカード名にいずれかの文字列を含むスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は持ち主基準でこのステップ・turn条件のときのみ有効
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ有効
          turn?: "own" | "opponent" | "both" // 指定時はフェーズを問わずこのturn条件の間だけ有効
          combinedFilter?: true // 指定時は合体スピリットのみ対象
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "funsaiBonus" // 持ち主のスピリットの【粉砕】の破棄枚数を+amountする
          levels: number[] | null
          amount?: number // 固定加算値（従来通り。amountPerSymbolColor / amountPerBurstCount指定時は無視される）
          amountPerSymbolColor?: Color // 指定時はamountの代わりに、フィールドが持つこの色のシンボル総数を加算する
          amountPerBurstCount?: true // amountの代わりに「自分と相手のバースト1つにつき+1」（合計0〜2）を加算する
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は持ち主基準でこのステップ・turn条件の間だけ有効
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "millCapBonus" // 「◯枚まで」の上限（mill.countMax）に足す。破棄枚数そのものではない
          levels: number[] | null
          amount: number
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "bofuCountBonus" // 発生源が場にありレベル有効の間、持ち主のスピリットが持つ【暴風】の指定数（静的keywordのcount）に+amountする。
          // 暴風を持たない（base=0）スピリットには加算しない。funsaiBonusの暴風版
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "funsaiOnBlock" // 持ち主のスピリットの【粉砕】を『このスピリットのブロック時』にも発揮させる
          levels: number[] | null
      }
    | {
          id: string
          kind: "jugekiOnBlockReplace" // 持ち主のスピリットの【呪撃】の発揮タイミングを『このスピリットのブロック時』へ差し替える
          levels: number[] | null
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
      }
    | {
          id: string
          kind: "flashLockWhileAttackingFamily" // 発生源が場にある間、familyFilter一致スピリットがアタックしている間だけ、相手はフラッシュで手札のカードを使用できない
          levels: number[] | null
          familyFilter: FamilyFilter
      }
    | {
          id: string
          kind: "bofuOnBlock" // 発生源が場にありレベル有効の間、持ち主のスピリットの【暴風】を『このスピリットのアタック時』でなく『このスピリットのブロック時』に発揮させる
          levels: number[] | null
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効（『相手のアタックステップ』＝opponent）
      }
    | {
          id: string
          kind: "bofuChooserSelf" // 発生源が場にありレベル有効の間、持ち主のスピリットの【暴風】で疲労させる相手のスピリットを持ち主自身が選ぶ
          levels: number[] | null
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          phase?: Phase // 指定時はこのステップでのみ有効
      }
    | {
          id: string
          kind: "kyoshuOnBlock" // 持ち主のスピリットの【強襲】を『このスピリットのブロック時』にも発揮させる
          levels: number[] | null
          phase?: Phase // 指定時はこのステップでのみ有効
      }
    | {
          id: string
          kind: "koboOnBlock" // 持ち主のスピリットの【光芒】を『このスピリットのブロック時』にも発揮させる
          levels: number[] | null
      }
    | {
          id: string
          kind: "blockTriggersAsAttackGrant" // 発生源が場にありレベル有効の間、対象スピリットの『このスピリットのブロック時』効果を『このスピリットのアタック時』に発揮させる
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 持ち主基準でこのステップ・turn条件のときのみ有効
          whileOwnBurstSet?: true // バーストをセットしている間だけ有効
      }
    | {
          id: string
          kind: "lifeDamageMillGuard" // 発生源が場にありレベル有効の間、持ち主のライフが相手のアタックで減るとき、デッキを上から1枚破棄し、そのカードがmatch（色・種別）に一致していればライフが減らない。
          // 「〜できる」は自動適用の簡略化
          levels: number[] | null
          match: { color?: Color; cardType: CardType } // 破棄したカードがこれに一致したときだけライフを守る
          keepToHandIfType?: CardType // 指定時、破棄したカードがこの種別なら（守れたかに関わらず）トラッシュでなく手札に加える（サーガLv2-3）
          keepToHandIfKeyword?: Keyword // 指定時、破棄したカードがこのキーワードを静的に持つなら手札に加える
          attackerFilter?: { maxLevel?: number; keywordExclude?: Keyword } // 指定時、この条件を満たすアタッカーのアタックでのみ働く
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "attackTriggersAsBlockGrant" // 発生源が場にありレベル有効の間、対象スピリットの『このスピリットのアタック時』効果を『このスピリットのブロック時』に発揮させる
          levels: number[] | null
          target: "anyAll" | "ownAll" | "self" // anyAll=両陣営のスピリット／self=発生源自身のみ
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          keywordFilter?: Keyword // 指定時はこのキーワードを持つスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 持ち主基準でこのステップ・turn条件のときのみ有効
      }
    | {
          id: string
          kind: "magicRestriction" // フィールドの発生源からマジックの使用に制約をかける
          levels: number[] | null
          whileCombined?: true
          restriction:
              | "oncePerTurnAll" // お互い、ターンに1回しかマジックの効果を使用できない
              | "noReductionOpponent" // 相手は、マジック使用時に軽減シンボルによるコスト軽減ができない
              | "noReductionOpponentNexus" // 相手は、ネクサス配置時に軽減シンボルによるコスト軽減ができない
              | "colorLockOpponent" // 相手は、自分（使用者）のフィールドのシンボルと同じ色を含まないマジックカードを使用できない
              | "reserveOnlyOpponent" // 相手は、マジックのコストをすべてリザーブから支払わなければならない
              | "noFreeCastOpponent" // 相手は、マジックの無償化（kind:"magicFreeGrant"）を適用できない
              | "costLimitAll" // お互い、maxCost以下のコストのマジックの効果を使用できない
              | "noFlashAll" // お互い、マジックカードのフラッシュ効果を使用できない
              | "trashColorLockOpponent" // 相手は、その相手自身のトラッシュにあるマジックカードと同じ色を含むマジックカードを使用できない
              | "noFlashOpponent" // 相手は、マジックカードのフラッシュ効果を使用できない
              | "noSpiritCoresOpponent" // 相手は、マジックのコストを支払うときスピリット上のコアでは支払えない
          maxCost?: number // restriction:"costLimitAll"専用：カード記載のコスト（軽減前）がこの値以下のマジックを使用できなくする
          requireOwnKeyword?: Keyword // 指定時、持ち主のフィールドにこのキーワードを持つスピリットがいる間のみ有効
          phase?: Phase // 指定時はこのステップ中のみ有効
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "magicFreeGrant" // 発生源の持ち主は、指定色のマジックカードをコストを支払わずに使用できる
          levels: number[] | null
          colorFilter?: Color // scope省略時にこの色のマジックのみ無償化（scope指定時は色不問なので省略する）
          hasBurst?: true // 指定時は【バースト】効果を持つマジックカードだけ無償化する
          scope?: "allMagicHandAndTegamoto" // 色を問わず、持ち主の手札/手元(tegamoto)のマジックカードすべてを無償化
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          condition?: "selfInBattle" // 指定時、発生源自身が現在のバトルの当事者であるときのみ有効
          oncePerBattle?: true // 指定時、この発生源が無償化できるのは1バトルにつきマジック1枚だけ
      }
    | {
          id: string
          kind: "magicRepeatGrant" // 発生源が場にありレベル有効の間、持ち主が使用したマジックの効果を解決後にもう1度だけ発揮する
          levels: number[] | null
          condition?: "selfInBattle" // magicFreeGrantと同じ（『このスピリットのバトル時』）
          oncePerBattle?: true // 指定時、この発生源が再発揮させるのは1バトルにつきマジック1枚だけ
      }
    | {
          id: string
          kind: "ownMagicColorless" // 発生源自身が現在のバトルの当事者の間、自分が使用する指定色のマジックカードすべての色を無いものとして扱う
          levels: number[] | null
          color: Color
          whileBattling: true // 現状これのみ対応（selfInBattleと同じ判定だが、フィールドに名前がある方が読みやすいため別名にしてある）
      }
    | {
          id: string
          kind: "exhaustImmunityGrant" // 持ち主のfamilyFilter一致スピリットは、相手のスピリット/ネクサス/マジックの効果で疲労しない。sourceTypeを区別しないためブレイヴの効果も同じ経路で防げる
          levels: number[] | null
          familyFilter?: string // scope:"self"のときは省略可（familyFilterとscopeは排他。両方省略しない）
          scope?: "self" // 指定時はfamilyFilterを無視し、発生源自身だけが対象
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "lifeDamageNegate" // ブロックされなかったアタッカーの実効BPが発生源の実効BP以下のとき、発生源の持ち主のライフは減らない
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "fushiFreeByExhaust" // 【不死】召喚をこの発生源（未疲労ネクサス）の疲労でコスト無償化（維持コアは通常どおり要る）。対象はカード記載コストがmaxCost以下の【不死】のみ
          // 無償召喚を選んだ場合、召喚時効果は発揮されない（BS15_PLAN.md §7.4）
          levels: number[] | null
          maxCost: number
      }

// カードマスターデータ（不変）。data.md 4 / 6.1 に対応
