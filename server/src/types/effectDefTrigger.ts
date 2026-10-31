// 効果の定義のうち、事象で起きる誘発（召喚時・ステップ・盤面の出来事・破壊時の復活など）
import type { CardPick, CardType, Color, EffectAction, FamilyFilter, FieldEvent, Keyword, Phase, ResolvedTargetFilter, TriggerEvent } from "../type"

export type EffectDefTrigger =
    | {
          id: string
          kind: "extraStepAfterAttackStep" // ターン1回・断れない。アタックステップが無いターンは発揮しない
          levels: number[]
      }
    | {
          id: string
          kind: "trashReturnAtEndStep" // トラッシュにある間、持ち主の『自分のエンドステップ』に自動で手札へ戻る
          maxCount?: number // cardIdごとの1ターンの上限枚数
      }
    | {
          id: string
          kind: "triggered"
          keyword?: Keyword // ラベルのみ（spiritHasLabeledKeyword が判定）
          trigger: TriggerEvent
          levels: number[] | null
          whileCombined?: true
          combinedBraveColors?: Color[] // 合体中のブレイヴのいずれかがこの色を持つとき（多色は1色でも該当。2026-09-07確認）
          action: EffectAction
          optional: boolean // 「〜できる」＝任意。interactiveTargetsでは発動確認を出す
          eventTarget?: "use" | "ignore" // onBlock/onBlocked/onBattleStart/onBattleEnd では必須。"ignore"＝行動に渡さない（condition 等の判定には常に渡す）
          oncePerTurn?: true // 発生源1体につきターン1回
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤー・カード名ごとに1回
          battleRole?: "attacker" | "blocker" // 省略時は常に発火
          fromHandOnly?: true // trigger:"onDeploy" 限定。手札から配置されたときのみ
          burstSummonOnly?: true // バースト効果の解決中の召喚のみ（バーストで自身を召喚した場合を含む）
          turn?: "own" | "opponent" // 発生源の持ち主基準
          condition?:
              | { opponentNexusColorsAtLeast: number } // 色数は重複除く
              | { ownFieldHasColorSpirit: Color } // timedColors 考慮
              | { ownFieldHasColorNexus: Color } // 自分のフィールド
              | { targetSameLevelAsSelf: true } // onBlocked 用
              | { ownFieldHasKeyword: Keyword } // 一時/継続付与も考慮
              | { ownFieldHasCombinedSpirit: true } // 自分のフィールドに合体スピリットがいる
              | { firstAttackOfTurn: true }
              | { lastFunsaiHasNexus: true }
              | { lastMilledHasEx: true } // ownChimeiMilled 限定（state.lastDeckMill を見る）
              | { lastFunsaiHasSpirit: true }
              | { targetMinBp: number } // onBlock 用
              | { targetBlockedMaxBp: number } // targetMinBp の鏡（onBlock 用）
              // fieldEvent.condition 側の targetMaxBp とは別物（あちらは onLifeDamaged のアタッカーを見る）
              | { targetHasColor: Color } // onBlocked 用
              | { targetMaxCost: number } // onBlocked 用
              | { targetMinCost: number } // targetMaxCost の鏡。onBlock＝アタッカー、onBlocked＝ブロッカーのコストがこれ以上
              | { targetNotMaxLevel: true } // onBlocked 用
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 自分のフィールドのスピリットを数える
              | { battleLoserMaxCost: number } // onBattleWin 専用
              | { opponentHandAtLeast: number } // 相手の手札枚数
              | { ownHandAtLeast: number } // 発火しないので確認も出ない
              | { bothFieldsHaveMinBpSpirit: number } // 両陣営のフィールドにそれぞれ実効BPがこの値以上のスピリットがいる
              | { battleOpponentCombined: true } // onBattleStart 用
              | { requirePrevAttackerCombined: true } // ターン開始でリセット
              | { ownLifeAtMost: number } // 自分のライフ
              | { selfSummonedByFushi: true } // onSummon 限定
              | { selfDestroyedByOwnEffect: { sourceFamily: string | string[] } } // onDestroy 限定。sourceFamily＝発生源カードが静的に持つ系統（配列＝OR）。バトルは含まない。pendingDestroyContext を読む
              | { selfDestroyedByOpponent: true } // onDestroy 限定。バトルのBP比較も含む
              | { ownNexusNameKindsAtLeast: { nameContains: string; count: number } } // 枚数でなく異なるカード名の種類数
              | { ownBurstSet: boolean } // false 指定時はセットしていない間だけ
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数
              | { ownFieldOnlyColor: Color; spiritsOnly?: true } // 自分のフィールドが指定色1色だけ
              | "selfWasAttacker" // state.battle.attackerInstanceId と突合
              | { ownAllHaveTeam: string } // 1体以上かつ全員が所属。0体は不成立とする簡略化
              | { ownAllHaveFamily: string }
              | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } // AuraCondition.ownTeamAtLeast と同じ判定。restedOnly 指定時は疲労状態の個体だけを数える
              | { soulCoreInReserve: true } // 自分のリザーブ
              | { ownKeishoExcludedTeamAtLeast: { team: string; count: number } } // 直近の《継召》で除外したカードを数える
              | { summonedBy: string } // CardInstance.summonedBy と突合
      }
    | {
          id: string
          kind: "burst" // 発生源は場でなくバーストエリア（docs/design/BURST.md）
          // effectSources には入れない＝継続効果（aura/constraint 等）の発生源にはならない
          event: FieldEvent // 既存のFieldEventを流用
          subjectSide?: "own" | "opponent" // fieldEvent の同名軸と同じ意味
          byOpponentEffectOnly?: true // ownSpiritDestroyed 限定
          destroyedColorFilter?: Color // ownSpiritDestroyed 限定
          destroyedMinBp?: number // ownSpiritDestroyed 限定
          condition?:
              | { ownLifeAtMost: number } // 自分のライフ
              | { ownNexusAtLeast: number } // 自分のフィールドのネクサス数
              | { ownTrashColorCountAtLeast: { color: Color; count: number } } // 自分のトラッシュ
              | { ownTrashCardTypeCountAtLeast: { cardType: CardType; count: number } } // 自分のトラッシュ
              | { ownCoresTotalAtLeast: number } // 自分のフィールド/リザーブ/トラッシュのコアの合計
              | { ownHandAtLeast: number } // 自分の手札枚数
              | { bothFieldsRestedSpiritsAtLeast: number } // 自分と相手のフィールドの疲労状態スピリットの合計
              | { ownColorCountAtLeast: { color: Color; count: number } } // 自分の指定色のスピリットの合計体数
              | { ownFieldHasKeywordAny: Keyword[] } // 配列＝OR
              | { opponentHandAtLeast: number } // 相手の手札枚数
              | { burstDestroyedColor: Color } // ownSpiritDestroyed 限定（同時破壊なら全メンバーの色）
              | { burstDestroyed: { colors?: Color[]; minCost?: number; family?: FamilyFilter } } // ownSpiritDestroyed 限定。同時破壊のうち**1体でも**指定（色はOR・コスト・系統）をすべて満たせば真。メンバーごとに判定するので、別々の個体で満たした組み合わせは偽
              // destroyedColorFilter は発動可否を絞るのに対し、こちらは action 内側の条件分岐用
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // family 配列＝OR
              | { opponentFamilyCountAtLeast: { family: FamilyFilter; count: number } } // 相手のフィールドのスピリット
          // 満たさないときは action の解決だけを飛ばす（宣言自体は event の時点で成立。BURST.md §1）
          destroyedAsTarget?: true // 破壊されたスピリットの cardId を targetInstanceId に入れる
          action: EffectAction
          thenPay?: "main" | "flash" // 同カードの kind:"magic" で timing 一致のエントリを追加で発揮できる（任意）
          alsoDrawIfDestroyedColor?: Color // ownSpiritDestroyed 限定。「さらに」＝同時。destroyedColorFilter と違い action 全体は止めない
          returnSelfToHandAfter?: true // finishBurstActivation の既定の行き先（トラッシュ）を上書きし、「その後」に手札へ戻す
      }
    | {
          id: string
          kind: "step"
          // ⚠️ ステップ開始時に自動で発揮する（timing:"end" 指定時のみ終了時）。
          // 『自分のメインステップ』でも「ステップ開始時」の明記が無い（任意タイミングで使う）ものは kind:"activated" timing:"main" を使う
          step: Phase
          turn: "own" | "opponent" | "both" // own=持ち主がturnPlayerの時、opponent=非turnPlayerの時、both=常に
          timing?: "end" // 省略時＝開始時。発火点があるのは attack のみ
          whileCombined?: true
          oncePerTurn?: true // 発生源1体につきターン1回（同名複数体はそれぞれ1回）
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤー・カード名ごとに1回
          // この効果自身が追加のエンドステップを生む場合、無いと無限ループになる
          levels: number[] | null
          action: EffectAction
          optional?: true // triggered.optional と同じ
          beforeStepAction?: true // step:"draw" | "core" 限定。「ドローしないことで〜」「コアを置かないことで〜」用
          // 指定が無ければ本体の後（2026-08-27）
          condition?:
              | "handNotGreaterThanOpponent" // 持ち主の手札枚数が相手以下
              | "selfWasRefreshedThisStep" // 発生源自身がこのリフレッシュステップで回復した場合のみ
              | { ownSymbolColorAtLeast: { color: Color; count: number }; noAttacksThisTurn?: true } // noAttacksThisTurn 指定時はさらにこのターン未アタックが必要
              | { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサス合計
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // family 配列＝OR
              | { ownHandAtLeast: number } // 自分の手札枚数
              | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 自分のフィールドのスピリットを数える
              | { opponentDeckNotEmpty: true } // 相手のデッキが0枚のときは発揮しない
              | { ownTrashOnlyColor: Color } // 自分のトラッシュ
              | { ownSpiritMinCost: number } // 自分のフィールド
              | { ownSpiritMinBp: number } // 自分のフィールド
              | { ownRefreshedSpiritsAtLeast: number } // 自分のフィールド
              | { ownBurstSet: boolean } // false 指定時はしていない間だけ
              | { noAttacksThisTurn: true } // このターン未アタック
              | { opponentBurstSet: boolean } // false 指定時はしていない間だけ
              | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } // AuraCondition.ownTeamAtLeast と同じ判定。restedOnly 指定時は疲労状態の個体だけを数える
              | { ownAllHaveTeam: string } // triggered/activated と同じ判定
              | { ownAllHaveFamily: string }
              | { soulCoreInReserve: true } // 自分のリザーブ
              | { ownKeishoExcludedTeamAtLeast: { team: string; count: number } } // 直近の《継召》で除外したカードを数える
              | { summonedBy: string } // CardInstance.summonedBy と突合
      }
    | {
          id: string
          kind: "freeSummonFromHandOnLifeDamaged" // 手札にあるこのカード自身の効果（「できる」＝任意）
          // 手札のカードが発揮する唯一の形なので、GameEngine の ownLifeDamaged 発火点が持ち主の手札を直接走査する
          levels: null // 手札のカードにレベルは無いので常にnull
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 『相手のアタックステップ』等の限定
          condition?: { ownLifeAtMost: number } // 持ち主のライフがこの数以下のときだけ召喚できる
      }
    | {
          id: string
          kind: "freeSummonFromHandOnDiscardedByOpponent" // 手札にあるこのカード自身の効果
          levels: null // 手札のカードにレベルは無いので常にnull
      }
    | {
          id: string
          kind: "freeSummonFromHandOnOwnNexusDeployed" // 手札にあるこのカード自身の効果。通常・効果・復活いずれの配置も含む
          levels: null // 手札のカードにレベルは無いので常にnull
      }
    | {
          id: string
          kind: "battleWon"
          role: "attacker" | "blocker" | "any" // ネクサスのバトル結果誘発。any＝どちらの役割でも
          levels: number[] | null
          action: EffectAction
          turn?: "own" // 持ち主がturnPlayerのときのみ
          vanillaWinnerOnly?: true // 勝利したスピリットが効果の記述を持たない（バニラ）ときのみ
          winnerNameContains?: string // 勝ったスピリットのカード名
          winnerMinCores?: number
          winnerFamilyFilter?: FamilyFilter
          winnerKeywordFilter?: Keyword | Keyword[]
          // 配列＝OR。
          // ⚠️ ORをエントリ2つに分けて書かないこと。両方持つスピリットで二重に発火する
          winnerIsLentBuffTarget?: true // 同じマジックの直前の効果でBP増加した1体のときのみ。lentOnly とセットで使う
          winnerIsLentChoiceTarget?: true // targetChoiceLendThisTurn で選んだ1体のときのみ。lentOnly とセットで使う
          winnerCombinedOnly?: true
          winnerColorFilter?: Color
          loserMinBp?: number // 敗北して破壊された側の実効BP
          loserCostAtMost?: number // 敗北して破壊された側のコスト
          whileCombined?: true
          selfOnly?: true // 発生源自身が勝利したときのみ
          firstAttackOfTurn?: true
          optional?: true // 「〜できる」＝任意
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効
          selfMode?: "source" // self に勝利スピリットでなく発生源インスタンス（ネクサス）を渡す
          condition?: { ownFieldOnlyColor: Color; spiritsOnly?: true }
      }
    | {
          id: string
          kind: "fieldEvent"
          event: FieldEvent // 既存のFieldEventを流用
          levels: number[] | null
          perDestroyed?: true // ownSpiritDestroyed | opponentSpiritDestroyed 限定。同時破壊でも破壊体数ぶん発火（「1体につき」「すべて」用）。省略時は同時破壊グループにつき1回＝Q22359
          oncePerTurn?: true // 発生源1体につきターン1回
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤー・カード名ごとに1回
          whileCombined?: true
          combinedBraveColors?: Color[] // 合体中のブレイヴのいずれかがこの色を持つとき
          action: EffectAction
          phase?: Phase // このステップでのみ発火
          excludePhase?: Phase // このステップでは発火しない
          turn?: "own" | "opponent" // own=持ち主がturnPlayerの時、opponent=非turnPlayerの時。省略時はどちらでも発火
          subjectSide?: "own" | "opponent" // イベントの主体がどちら側か（turn＝誰のターンかとは別軸。2026-08-16判断）
          subjectFilter?: ResolvedTargetFilter // イベントの主体（selfOverride）の絞り込み。主体が居ないイベントでは不成立。excludeSelf＝主体が発生源自身なら発火しない
          partnerFilter?: ResolvedTargetFilter // targetInstanceId（ブロッカー・アタッカーなどの相手役）の絞り込み
          colorFilter?: Color // ownNexusDestroyed 限定（主体が selfOverride を持たず eventColors で渡す）。ほかのイベントは subjectFilter.color
          sourceColorFilter?: Color // 「相手のこの色の〜の効果によって」起きたときだけ（currentEffectSource で判定）。colorFilter はイベント対象、こちらは効果の発生源の色
          ignoreEventTarget?: true // resolveActionにtargetInstanceIdを渡さない
          selfMode?: "source" // self にイベント対象でなく発生源インスタンス自身を渡す
          bpReachedAt?: number // ownSpiritBpReached 限定。前回BP < この値 <= 今回BP のときだけ
          blockerMaxBp?: number // ownSpiritBlocked 限定。ブロック宣言の時点の実効BP
          subjectMinBp?: number // イベントの主体の実効BP
          subjectRefreshed?: true // そのイベントの時点の状態
          subjectReceivesBpPlus?: true // 期間つき・常時・自身の効果を問わない（receivesBpPlus）
          subjectMinCost?: number // イベントの主体のコスト
          subjectOriginalNexus?: true // 本来はネクサスのカード（スピリットとして扱われているネクサス）
          subjectDifferentNameFromSelf?: true // 主体が発生源と異なるカード名のときのみ
          subjectTeamFilter?: string // CardData.team
          destroyedByOwnEffect?: { sourceType: CardType; sourceFamily?: string | string[] } // opponentSpiritDestroyed 限定。バトルは含まない。sourceFamily＝発生源カードが静的に持つ系統（配列＝OR）
          destroyedMaxBp?: number // opponentSpiritDestroyed 限定。破壊直前の実効BP
          byBattleOnly?: true // ownSpiritDestroyed 限定
          attackerOnly?: true // ownSpiritDestroyed 限定
          duringSelfAttack?: true // opponentSpiritDestroyed 限定
          selfOnly?: true // ownSpiritDestroyed | ownSpiritExhausted | ownSpiritReducedLife 用
          causedByOpponent?: true // 疲労イベント限定。ネクサスの効果も含む（byOpponentEffectOnly は含まない）
          byOpponentOnly?: true // ownSpiritDestroyed 限定
          opponentEffectSourceTypes?: CardType[] // 「相手のスピリット/マジックの効果で」はネクサスを含まない
          byOpponentEffectOnly?: true // ownNexusDestroyed | ownSpiritDestroyed | ownSpiritExhausted 限定。
          // ownSpiritDestroyed はバトルのBP比較で敗れた場合も含む。ownSpiritExhausted はネクサスの効果を含まない。
          // destroyNexus に渡された DestroyContext で判定し、発生源不明のときは発火しない側に倒す（文脈不明時に限定を緩める方が誤りが大きいため）
          causedByOwnEffect?: true | "spirit" // 疲労イベント限定。"spirit"＝スピリットの効果のみ
          eventSourceAsTarget?: true // coresGainedFromVoid 限定。アクションの対象を「その効果を発揮した発生源の個体」（eventInfo.sourceInstanceId）にする。場にいなければ対象なしで不発（BS18-001）
          byOpponentSpiritEffectOnly?: true // ownSpiritDestroyed 限定。DestroyContext.sourceType=="spirit" かつ sourcePid が持ち主と異なるとき
          refreshSourceTypeFilter?: CardType[] // anySpiritRefreshed 限定。回復させた効果の発生源種別（配列＝OR）
          keywordActivatedFilter?: Keyword // ownKeywordActivated 限定。「【増幅】を発揮した時」＝zofuku 限定
          summonedSpiritAsTarget?: true // ownSpiritSummoned 限定。selfMode:"source" と併用し、actionTargetId を召喚されたスピリット自身にする
          attackerAsTarget?: true // summonedSpiritAsTarget の同型で、selfOverride を渡すイベント全般で使える。selfMode:"source" と併用
          // 指定時、resolveAction へ渡す対象は通常のイベント対象ではなく、その効果を発揮したスピリット自身（DestroyContext.sourceInstanceId）になる
          condition?:
              | { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサス合計
              | { ownHandAtLeast: number } // 自分の手札枚数
              | { ownFieldHasColorNexus: Color } // 自分のフィールド
              | { ownFamilyCountAtLeast: { family: FamilyFilter; count: number } } // family 配列＝OR
              | "selfIsAttacking" // 発生源自身が現在のバトルのアタッカーのとき
              | { firstAttackOfTurn: true } // anySpiritAttacked 限定
              | { attacksThisTurnAtLeast: number } // anySpiritAttacked 限定。N回目以降のアタック
              | { targetMaxBp: number } // ownLifeDamaged 限定。ライフを減らしたスピリット（アタッカー）の実効BP
              | { targetMaxCostOfEventTarget: number } // targetInstanceIdのスピリットのコスト
              // event:"ownSpiritBlocked" ではブロッカー。targetMaxBp のコスト版
              | { targetKeywordExclude: Keyword } // ownLifeDamaged 限定
              | { lastFunsaiHasSpirit: true } // ownFunsaiMilled 限定
              | { lastFunsaiHasCostAtLeast4: true } // ownFunsaiMilled 限定
              | { opponentHandAtLeastOwnHand: true } // 相手の手札枚数
              | { opponentMagicUsedAtLeast: number } // opponentMagicUsed 限定。このターンの使用回数
              | { burstCostAtMost: number } // ownBurstActivated 限定
              | { ownBurstSet: boolean } // false 指定時はしていない間だけ
          repeatPerCount?: boolean // ownFunsaiMilled | opponentHandAdded | opponentCorePlaced | opponentLifeCoreFromVoid 用。実カウント数ぶんアクションを繰り返す
          countMode?: "cores" | "funsaiSpirits" // ownSpiritCoresRemovedByOpponent 限定。repeatPerCount の回数を「取り除かれたコア数」にする
          // "funsaiSpirits"：event: "ownFunsaiMilled" 限定。回数を直前の【粉砕】で破棄したスピリット枚数にする
          minEventCount?: number // eventCountがこの値以上のときのみ
          magicCostEquals?: number // opponentMagicUsed 限定
          magicTiming?: "main" | "flash" // opponentMagicUsed 限定
          magicPick?: CardPick // ownMagicUsed 限定。eventInfo.magicCardId で判定
          paidCostOnly?: true // ownMagicUsed 限定。「コストを支払わずに使用」経由の使用だけが除外される（2026-09-07確認）
          magicFreeUseMaxPerTurn?: number // ownMagicUsed 限定。発生源が実際に無償使用を行った回数（CardInstance.magicFreeUseCount）がこの値未満のときのみ
          // 確認で「使わない」を選んだ・候補が無く不発だったときは消費しない（2026-09-07確認）
          familyFilter?: FamilyFilter // ownTensho 限定（主体が場に居ないので eventInfo.families で判定）。ほかのイベントは subjectFilter.family
          fromHandOnly?: true
          subjectNotInBattle?: true // 主体が今のバトルのアタッカーでもブロッカーでもないときのみ
          keishoSummonOnly?: true // ownSpiritSummoned 限定。《継召》（トラッシュのEXシンボル持ちを除外してコスト軽減）による召喚のみ
          byOpponentVanishOnly?: true // ownSpiritDestroyed 限定。消滅（維持コア割れ。破壊ではない）で、その原因が相手の効果のとき
          sokuSummonOnly?: true // ownSpiritSummoned 限定。⚠️ keywordFilter:"soku"（召喚されたカードが【神速】を持つ）とは別物
          fushiSummonOnly?: true // ownSpiritSummoned 限定。【不死】召喚も通常と同じくこのイベントを起こすので限定したいときだけ指定
          costFilter?: { max?: number; min?: number } // ownSpiritSummoned 限定。カード静的な本来のコストで判定する（付与コスト込みの subjectFilter.cost とは別。軽減後の支払いコストでもない）
          eventTargetIsSelf?: true // ownSpiritExhausted | anySpiritExhausted 限定
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn で貸したもの）からのみ有効
          nameIncludes?: string[] // ownTensho 限定。eventInfo.names（【転召】の犠牲になったスピリットのカード名）で判定。ほかのイベントは subjectFilter.nameContains
          targetSameLevelAsSelf?: true // targetInstanceIdのLvがイベント対象（selfOverride）のLvと同じときのみ。TargetFilter に主体と同じLvを表す軸が無いので partnerFilter へは寄せていない
          ownOnly?: true // anySpiritAttacked 限定
          optional?: true // 「〜できる」＝任意
      }
    | {
          id: string
          kind: "milledMagicToTegamoto" // デッキが相手の効果で破棄されるとき、中のマジックをトラッシュでなく手元(tegamoto)へ置き手札同様に使用できるようにする
          levels: number[] | null
      }
    | {
          id: string
          kind: "onMilledFromDeck" // このカード自身がデッキから破棄されたときに発揮（手札・フィールドからの破棄は対象外）。
          // millDeck が破棄したカードを1枚ずつ見て発火。トラッシュへ入れた直後に取り除いて解決するため、破棄されたカードはトラッシュに残らない
          levels: null // デッキのカードにレベルは無いので常にnull
          by: "opponentEffect" | "opponentSpiritEffect" // opponentSpiritEffect＝相手のスピリットの効果で
          then: "castThisMagicFree" | "deployThisNexusFree" | "summonThisSpiritFree" | "destroyMillSource" | "voidOpponentLife"
          // destroyMillSource＝破棄を引き起こした相手のスピリットを破壊（発生源はトラッシュに残る）。最初の1枚で打ち切る（2026-09-21）
          // voidOpponentLife＝lifeCrush count:1 dest:"void" に委譲し、相手のライフのコア1個をボイドに置く
          optional?: true // summonThisSpiritFree 専用。非対話は自動召喚
          thenProtectDeckThisTurn?: true // 破棄された時点で（召喚の成否・確認より先に）このターンの間デッキは相手の効果では破棄されなくなり、その回の残りの破棄も止まる
          thenBlockAllDeckMillThisTurn?: true // then:"destroyMillSource" 専用。破壊解決後、このターンの間自分の効果も含めデッキは破棄されなくなる
      }
    | {
          id: string
          kind: "reviveOnDestroy" // 破壊される代わりに場に留まる
          levels: number[] | null
          scope: "self" | "ownAll" // self＝このスピリット自身／ownAll＝発生源の持ち主のスピリットすべて
          perDestroyed?: true // scope:"ownAll" 限定。同時破壊でも破壊された体数ぶん確認する（省略時は同時破壊グループにつき1回。Q22359）
          whileCombined?: true // scope:"self" 専用
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurn でこのターンだけ貸した効果）からのみ有効
          blockingOnly?: true // scope:"ownAll" 用。現在のバトルのブロッカーだけ
          optional?: true // 承認でコスト支払い＋復活確定、断ればその場で破壊（非対話は即時確定）。省略時は必ず戻る
          vanillaFilter?: true // scope:"ownAll" 用。効果の記述を持たない（バニラ）スピリットのみ
          colorFilter?: Color // scope:"ownAll" 用。この色を持つスピリットのみ
          keywordFilter?: Keyword | Keyword[] // scope:"ownAll" 用。配列はOR
          minBp?: number // scope:"ownAll" 用。対象の実効BP
          minCost?: number // scope:"ownAll" 用。対象のコスト
          nameIncludes?: string[] // scope:"ownAll" 用。カード名に含む（配列＝OR・部分一致。constraintGrant.nameIncludes と同じ）
          familyFilter?: FamilyFilter // scope:"ownAll" 用。指定系統（配列＝OR）を持つスピリットのみ
          minFamilies?: number // scope:"ownAll" 用。カード静的な family 配列の要素数
          combinedOnly?: true // scope:"ownAll" 用。合体スピリットのみ
          requireOwnFieldHasName?: string // 持ち主のフィールドにこのカード名の個体が1体以上いるときのみ
          when: {
              byOpponentEffect?: boolean // 相手の効果による破壊のみ
              byOpponent?: boolean // 相手の効果による破壊 または バトルのBP比較による破壊（2026-09-07確認）
              // 自分の効果で自分のスピリットを破壊した場合は含まない。byOpponentEffect より広い
              byBattleVsArmorColor?: boolean // 【装甲】で指定した色の相手とのBP比較による破壊のみ
              byBattleVsHeavyArmorColor?: boolean // 【重装甲】で指定した色の相手とのBP比較による破壊のみ
              byBattle?: boolean
              byBattleKillerLevel?: number // 破壊した側（勝者）の currentLevel
              byBattleKillerMaxBp?: number // 破壊した側（勝者）の実効BP
          }
          phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" } // 発動できるステップ条件
          revived: { rested: boolean } | { toHand: true; braveStay?: "rested" | "refreshed" } | { handOrDeckTop: true; braveStay?: "rested" | "refreshed" } | { toBurst: true } // handOrDeckTop＝toHand と同じく場に残らず（コアはリザーブへ）、行き先を持ち主が手札かデッキの上から選ぶ（非対話は手札。選択は handleAction の末尾で出す＝pendingReviveDestinations。braveStay も toHand と同じ）。toBurst の Q3469（解決中は発動不可）は未実装（簡略化）
          // false＝回復／true＝疲労。toHand＝場に残らず手札へ（コアはリザーブへ）。braveStay 指定時は合体していたブレイヴを確認なしで指定状態のまま残す。省略時は detachBravesOnLeave へ
          cost?: {
              exhaustSelf?: true // 疲労済みなら支払えず不発
              sourceCoresToTrash?: number // 足りなければ支払い不可＝不発
              keepOneCoreRestToTrash?: boolean // 自身のコアを1個だけ残し、残りをトラッシュへ
              oneCoreToVoid?: boolean // コア1個の個体は支払い不可＝不発
              oneCoreToTrash?: boolean // コア1個の個体でも支払う（2026-08-14確認。破壊待機中はコアが乗ったままなので成立し、待機解除の後に維持コア割れで消滅する）
              reserveOneToTrash?: boolean // 自分のリザーブのコア1個をトラッシュへ
              fieldOrReserveOneToTrash?: boolean // リザーブに無ければ自分のフィールドから（発生源自身を除く）
              handDiscardOne?: boolean // 手札の末尾1枚を使う決定的簡略化。手札0枚なら不発
              handDiscardCardType?: CardType // 手札を末尾からその種別に絞って探す
              millSelfOneMatching?: { color: Color; cardType: CardType; thenHandIfNameIncludes?: string } // 成立可否と独立に、thenHandIfNameIncludes に名前が一致すれば手札へ
              exhaustOwnFamilyOne?: FamilyFilter // 実効BP最小の個体を選ぶ簡略化。破壊される個体自身は除く。該当なしなら不発
              ownLifeOneToVoid?: boolean // リザーブへは戻らない。ライフ0なら不発。結果0になればそのまま勝敗が決まる
              ownLifeOneToReserve?: boolean // 自分のライフのコア1個を自分のリザーブへ。ライフ0なら不発
              millSelfCount?: number // 自分のデッキを上からこの枚数だけ無条件に破棄
              exhaustOwnSameFamilyOne?: true // このスピリット自身の系統と一致する、自身以外の持ち主のフィールドの回復状態スピリット1体
              opponentLifeOneToTrash?: true // 相手のライフが0なら不発。結果0になれば持ち主の勝利が決まる
              discardOwnBurst?: true // 自分のバースト1つを破棄することがコスト
              exhaustOwnNexusOne?: true // コア最少の個体を選ぶ簡略化。候補が無い・相手のconstraintで疲労させられないなら不発
          }
          oncePerTurn?: boolean // 発生源1つにつきターン1回
          condition?: { opponentFieldSymbolColorsAtMost: number } | { ownBurstSet: boolean } | { ownFieldOnlyColor: Color; spiritsOnly?: true } | { ownHandAtLeast: number } // AtMost＝相手シンボル色数（重複除く）がこの値以下／ownBurstSet＝セット中(true)/未(false)
          alsoVoidCoreToReserve?: number // 復活の成立とセットで、ボイドからリザーブに置くコアの数
      }
    | {
          id: string
          kind: "trashReturnOnOwnHeavyExhaust" // トラッシュにあるこのカード自身の効果：『自分のターン』に自分の効果で相手のスピリットが重疲労した時、familyFilter の系統を持つ自分のスピリット/ネクサスがあれば手札に戻る
          // heavyExhaustSpirit が走査する
          levels: null
          familyFilter: string
      }
    | {
          id: string
          kind: "trashReturnOnOwnSpiritDestroyed" // トラッシュにあるこのカード自身の効果：familyFilter の系統を持つ自分のスピリットが破壊された時、手札に戻せる（任意）
          // 同じカード名のこの効果はターンに1回（onceByNameUsed）。removal.fireOwnSpiritDestroyed が持ち主のトラッシュを走査する
          levels: null
          familyFilter: string
      }
    | {
          id: string
          kind: "trashSummonOnNameSummoned" // トラッシュにあるこのカード自身の効果：持ち主のフィールドに nameIncludes を含むスピリットが召喚されたとき、無償召喚できる（任意）
          // 【不死】と同じくトラッシュのカードが発生源なので effectSources では拾えず、fireSummonSequence が持ち主のトラッシュを走査する。維持コアはリザーブから払う
          levels: null
          nameIncludes: string
      }
