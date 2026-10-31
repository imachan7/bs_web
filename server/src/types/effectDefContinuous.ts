// 効果の定義のうち、場にある間ずっと効く継続効果と付与（〜Grant・〜As・抑制など）
import type { AuraCondition, AuraDef, CardPick, CardType, Color, ConstraintDef, EffectAction, EffectCounter, FamilyFilter, GlobalConstraintDef, Keyword, LevelDef, Phase, ResolvedTargetFilter, TargetFilter, TriggerEvent } from "../type"
import type { EffectDef } from "./effectDef"

export type EffectDefContinuous =
    | {
          id: string
          kind: "aura"
          levels: number[] | null
          whileCombined?: true
          aura: AuraDef
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸した効果）からだけ有効（2026-08-24）
          whileOwnBurstSet?: true
          uniqueByName?: true // 〔重複不可〕：同じカード名の発生源は対象1体につき1回分だけ効く
      }
    | {
          id: string
          kind: "castRestriction" // メインステップ中の使用だけを禁止（フラッシュでもメインステップ中なら不可。2026-10-08 ユーザー確定）
          levels: null
          notInMainStep: true
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          whileCombined?: true
          whileSpirit?: true // ブレイヴがスピリット状態（単独）のときだけ。whileCombinedの逆
          whileOwnBurstSet?: true
          condition?: AuraCondition
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "magicTargetRedirect" // 相手が使用したマジックが発生源を対象に含むとき、対象を発生源のみに絞る
          levels: number[] | null
          turn?: "own" | "opponent" // own=持ち主がturnPlayerのとき／opponent=でないとき
          phase?: Phase
          protectFamily?: FamilyFilter // 指定時は「持ち主のこの系統が対象に含まれる」ときに絞り込む。絞り込み先は発生源自身
          protectColor?: Color
          protectCost?: number // 持ち主のこのコストのスピリットに限る
          optional?: true // 未指定＝強制
      }
    | {
          id: string
          kind: "countAsMultiple" // 持ち主の効果が「スピリットの数を数える」とき、この個体をcount体分として数える
          levels: number[] | null
          count: number
          sourceTypes?: CardType[] // 数える側の効果の発生源種別。省略時は種別を問わない
      }
    | {
          id: string
          kind: "magicNegate" // カード自体は通常どおりトラッシュへ。「マジック使用時」誘発は発揮される
          levels: number[] | null
          cost: { selfCoresToVoid: number } | { exhaustSelf: true } | { none: true } // exhaustSelf=発生源を疲労（回復状態でなければ使えない）
          colors?: Color[]
          phase?: Phase
          turn?: "own" | "opponent"
          afterNegate?: "selfToDeckBottom" // 「その後」＝結果であり支払いではない。無効にしなければ戻らない（2026-08-16確認）
          oncePerTurn?: true
          onceScope?: "name" // oncePerTurnと併用。プレイヤーごと・カード名ごとに1回
      }
    | {
          id: string
          kind: "magicNegatePayByNexusGrant" // 【氷壁】の支払いを自分のネクサス1つの疲労で代替できる
          levels: number[] | null
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "magicNegateTurnOverrideGrant"
          levels: number[] | null
          turn: "own" | "opponent"
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "bothSidesTargetRedirect" // 選択を挟む仕組みが無いため、持ち主に有利な側に固定
          levels: number[] | null
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "familySuppression"
          levels: number[] | null
          target: "anyAll" | "opponentAll" // anyAll=両陣営のスピリットすべて／opponentAll=相手のスピリットすべて
          maxCores?: number
          turn?: "own" | "opponent"
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "handKeywordGrant" // 手札には書き込まず判定時に発生源を見る（tempHandKeywordGrantsと違う点）
          levels: number[] | null
          keyword: Keyword
          familyFilter?: string
          vanillaFilter?: true
          cardType?: CardType // 省略時はスピリット
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "battleBpAsLevel" // 持ち主のfromLevelのスピリットは、バトルのBP比較のときだけuseLevelのBPを使う
          levels: number[] | null
          fromLevel?: number // 省略時はどのLvにも効く
          useLevel: number | "max" // "max"＝対象カードが持つ最高Lv
          maxCost?: number
          side?: "both" // 指定時は持ち主だけでなく両陣営のスピリットが対象
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          keywordFilter?: Keyword
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "destroyAsMaxLevelGrant" // 対象は相手効果でコア0になったとき消滅でなく最高Lv破壊（onDestroy誘発あり）扱い
          // 「相手の効果で」は、currentEffectSourceが持ち主と異なるpidのspirit/brave/magicを指しているかで見る
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身／ownAll=持ち主のスピリットすべて
          whileCombined?: true // target:"self"時は発生源自身が対象
      }
    | {
          id: string
          kind: "constraintSuppression" // 持ち主の対象スピリットが持つ指定タイプの制約を発揮させない
          levels: number[] | null
          target: "ownAll"
          constraintType: ConstraintDef["type"]
          nameContains?: string
          phase?: Phase
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "targetNegateByHandDiscard" // 持ち主のfamilyFilter一致スピリットが相手のスピリットの効果の対象になるたび、手札をdiscardCount枚破棄してその効果を受けない
          // probing（候補列挙）では払わない＝対象にはなる。「〜することで」は任意コストだが、確認を都度出すと解決が止まるため常に支払う簡略化（手札0枚なら免除）。破棄は手札末尾から
          levels: number[] | null
          familyFilter: FamilyFilter
          bySourceType: "spirit" // 相手のスピリットの効果のみ
          discardCount: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" }
      }
    | {
          id: string
          kind: "exhaustPreventByPay" // 持ち主の filter 合致スピリットが相手の bySourceTypes の効果で疲労するとき、疲労する1体ごとに cost を払って疲労を防げる（BS18-014）
          // exhaustSpirit（疲労の唯一の入口）で判定する。対話では確認を出して、疲労をその答えまで保留する（同じ効果の後続は先に進む）
          levels: number[] | null
          filter: TargetFilter
          bySourceTypes: CardType[]
          cost: EffectAction // 払えるかは pay と同じ canPayResolve で判定。払えなければ確認も出さず疲労する
      }
    | {
          id: string
          kind: "deckMillNegate" // 持ち主のデッキが破棄されるとき、コストを払って無効にできる
          // 任意コストなので確認を出す。破棄処理の途中では中断できないため、millDeckは見送ってpendingDeckMillNegatesへ積みhandleActionの末尾で確認する。非対話（smoke）では自動で支払う
          levels: number[] | null
          by: "opponentSpiritEffect" | "opponentEffect" // opponentSpiritEffect=相手のスピリットの効果で／opponentEffect=相手によって
          turn?: "opponent" // 相手のフラッシュ効果で自分のターン中に破棄されたときは無効にできない
          exceptFunsai?: true
          cost: { ownLifeToReserve: number } | { exhaustSelf: true } // ownLifeToReserve=ライフのコアをこの数だけリザーブへ（足りなければ確認自体を出さない）
          thenReturnCauseToDeckBottom?: true // 破壊済みならno-op
      }
    | {
          id: string
          kind: "globalConstraint"
          levels: number[] | null
          whileCombined?: true
          whileOwnBurstSet?: true
          whileSelfAttacking?: true // アタック中窓。hasGlobalConstraintが見る
          constraint: GlobalConstraintDef // 持ち主を問わず効く。ただしownNexusIndestructibleは持ち主自身のみ
          condition?: { ownVanillaSpiritsAtLeast?: number; allOwnNexusesHaveColor?: Color; allOwnNexusesHaveFamily?: string; ownNexusCountExactly?: number; ownFamilyCountAtLeast?: { family: FamilyFilter; count: number } }
          phase?: Phase
          turn?: "own" | "opponent" | "both" // opponentCantAttackByCostのopponentは「相手のアタックステップ」
      }
    | {
          id: string
          kind: "mustBlockGrant" // 持ち主のスピリットのアタックに対し、相手は可能なら必ずブロックする
          levels: number[] | null
          familyFilter?: FamilyFilter
          blockerMaxBp?: number
          firstAttackOnly?: boolean
          phase?: Phase
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "summonedExhaustGrant" // 相手のスピリットが召喚されたとき疲労する
          levels: number[] | null
          condition?: { selfRested: true }
      }
    | {
          id: string
          kind: "burstMagicFreeEffect" // 解決後にコストを支払わずメイン/フラッシュのどちらか1つを発揮できる（任意）
          levels: number[] | null
      }
    | {
          id: string
          // 発揮であって【バースト】の発動でもマジックの使用でもない（ユーザー確認 2026-10-17）。操作は GameAction "useHandBurstEffect"
          kind: "handBurstEffectGrant"
          levels: number[] | null
          attackerKeyword: Keyword[]
      }
    | {
          id: string
          kind: "bpBuffSuppression" // BPを-する効果は対象外
          levels: number[] | null
          phase?: Phase
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "triggerSuppression" // 相手のスピリットの指定トリガーを発揮させない
          levels: number[] | null
          trigger: TriggerEvent
          phase?: Phase
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "coreBonus" // ボイド由来
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "coreReturnBonus" // お互いのスピリットから効果でリザーブへ置かれるコアの数を+amountする
          levels: number[] | null
          amount: number
          targetSide?: "opponent" // 相手のスピリットから取り除くときだけ
          includeTrash?: true
          ownBurstOnly?: true // 持ち主のバースト効果を解決している間だけ
      }
    | {
          id: string
          kind: "drawStepBonus" // 持ち主のドローステップのドロー枚数
          levels: number[] | null
          amount: number
          uniqueByName?: true
      }
    | {
          id: string
          kind: "coreStepBonus" // 持ち主のコアステップで得られるコア
          levels: number[] | null
          amount: number
          condition?: { ownFieldHasNames: string[] } | { ownFieldHasFamily: string }
      }
    | {
          id: string
          kind: "keywordGrant" // 持ち主のfamilyFilter一致スピリットすべてに付与
          levels: number[] | null
          whileCombined?: true
          onlyWhileSpiritState?: true // whileCombinedの逆。combinedBravesは合体中もeffectSourcesに含まれ続けるため、付けない継続付与は既定では合体後も効き続ける
          keyword: Keyword
          target: "ownAll"
          combinedFilter?: true
          uncombinedFilter?: true // combinedFilter の逆（付与先が合体していないスピリットのみ）
          familyFilter?: FamilyFilter
          colorFilter?: Color
          lentOnly?: boolean
          keywordFilter?: Keyword
          keywordFilterAny?: Keyword[]
          colors?: Color[]
          costFilter?: { max?: number; min?: number }
          phase?: Phase
          turn?: "own" | "opponent"
          vanillaFilter?: true
          braveInSpiritState?: true
          minBp?: number
          count?: number
      }
    | {
          id: string
          kind: "braveImmuneGrant" // 【装甲】【重装甲】とは別枠の第3の耐性軸
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身／ownAll=持ち主のスピリットすべて
          scope: "all" | "matchArmorColors" // matchArmorColors=対象が持つ【装甲】の色と一致する色の相手ブレイヴだけ防ぐ
          filter?: ResolvedTargetFilter // 付与先（持ち主のスピリット）の絞り込み。発生源自身も同じ filter を通る
          phase?: Phase
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "armorEffectiveGrant" // 【合体時】等で、発生源が持つ実効【装甲】（付与分込み）を自分のスピリットすべてに与える
          // keywordGrantのkeyword:"armor"と違い、発生源自身の実効【装甲】色を都度算出して配る
          levels: number[] | null
          target: "ownAll"
          whileCombined?: true
      }
    | {
          id: string
          kind: "effectEntryGrant"
          // effectGrantは誘発しか配れないため、常在エントリを配る兄弟。疲労コストは配られた側自身を疲労させる
          levels: number[] | null
          target: "ownAll"
          keywordFilterAny?: Keyword[]
          familyFilter?: FamilyFilter
          granted: Extract<EffectDef, { kind: "magicNegate" }>
      }
    | {
          id: string
          kind: "familyGrant" // 持ち主の対象スピリットに付与
          levels: number[] | null
          whileCombined?: true
          target: "ownAll" | "self"
          family?: string
          familyFromChoice?: true // 発生源インスタンスのlentChoiceFamily（貸与時に選んだ系統）
          familiesFromOwnField?: true // 持ち主のフィールドのスピリットが（カード静的に）持つ系統すべてを動的に付与
          familyFilter?: FamilyFilter
          lentOnly?: boolean
          colorFilter?: Color
          costFilter?: number
          phase?: Phase
          turn?: "own" | "opponent"
          condition?: { ownColorTotalAtLeast: { color: Color; count: number } } // スピリット+ネクサスの合計で数える
      }
    | {
          id: string
          kind: "chimeiBonus" // 【地鳴：N】のNを増やす。millハンドラが発生源のレベル・phaseTurnを見て合計を足す
          levels: number[] | null
          amount: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "allTeams" // cardHasTeamが全チームに当たる。カード単体で見る場所だけ
          levels: null
      }
    | {
          id: string
          kind: "immunityGrant" // target:"self"は発生源自身だけが受けない
          levels: number[] | null
          target: "ownAll" | "self"
          familyFilter?: FamilyFilter
          includeSelf?: boolean // familyFilterに関わらず発生源自身も対象に含む
          colorFilter?: Color
          keywordFilter?: Keyword
          combinedFilter?: true
          vanillaFilter?: true
          nameIncludes?: string[] // 配列＝OR・部分一致（constraintGrant.nameIncludes と同じ）
          against: "magic" | "bounce" // 自分自身の効果によるバウンスは対象外
          sourceTypes?: CardType[] // bounce：防ぐ相手の効果の種類（省略＝すべて）。ブレイヴ自身の効果は "brave"、【合体時】は "spirit"
          condition?: { ownCostCountAtLeast: { cost: number; count: number } }
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "levelAs"
          levels: null
          whileCombined?: true
          whileAttacking?: true
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsAll" | "ownSpiritsByKeyword" | "ownSpiritsByFamily" | "ownSpiritsVanilla" | "opponentSpiritsAll" | "opponentBlockersOfOwnKeyword" // ByKeyword＝keywordFilter 一致（Lv不問）／ByFamily＝familyFilter のどれか／Vanilla＝効果の記述を持たないスピリット
          treatAs: number | "max" | "coresScaled" | { plus: number } // 数値=固定／"max"=対象カードの最高Lv（対象ごとに算出）／"coresScaled"=コア数で換算／{plus:N}=相対（2026-08-25確認で「文字どおり」）。⚠️相対シフトは最高Lvで頭打ち（レベル定義が無いとlevelOfが黙って無視し効果が無言で消える）
          costMinFilter?: number
          nameContains?: string
          keywordFilter?: Keyword // target:"opponentBlockersOfOwnKeyword"では「このキーワードを持つ自分のスピリットをブロックしている相手」を指す
          familyFilter?: FamilyFilter
          effectsOnly?: true // 効果の発揮判定にだけ効かせ、displayLevelは無視する。「Lv◯効果は発揮されない」用
          summonedThisTurnOnly?: true
          phase?: Phase
          turn?: "own" | "opponent"
          lentOnly?: boolean
          condition?:
              | { maxOwnSpirits: number } // 発生源自身を含む
              | { anyFieldHasColorSpirit: Color } // 自分か相手のどちらかのフィールドに指定色のスピリットがいる間
              | { ownFieldHasFamily: string }
              | { ownSpiritCountBelowOpponent: true } // 自分のスピリット数が相手より少ない間
              | { ownFieldHasCombinedSpirit: true }
              | { ownBurstSet: true }
              | { ownLifeAtLeast: number }
              | { opponentTrashAtLeast: number } // 相手のトラッシュの枚数
              | { ownAllSpiritsHaveFamily: string[] } // 0体では不成立
              | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数
          sourceMinLevel?: number // 素のレベル（コア数基準。上書き無視）
          sourceLevels?: number[] // 素のレベル（上書き無視）がこのどれかのとき
      }
    | {
          id: string
          kind: "bpAs"
          levels: number[] | null
          whileCombined?: true
          target: "ownSpiritsByFamily" // 現状これだけ対応
          familyFilter: FamilyFilter
          amount: number
      }
    | {
          id: string
          kind: "destroyBpThresholdBonus" // ブレイヴ自身・ネクサスの効果には効かない（Q22378〜Q22382）
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "bpEqualizeFamily" // Lv別BPを発生源の実効BP（合体時込み）と同じとして扱う全面上書き
          levels: number[] | null
          familyFilter: FamilyFilter
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "nexusAsSpiritDuringAttackStep" // 自分のネクサスをお互いのアタックステップ中だけスピリット扱いにする
          // field.nexuses→field.spiritsへ同じインスタンスのまま移し、ステップ終了で戻す
          levels: number[] | null
          nameContains?: string
          minCores?: number
          cost: number
          family: string[]
          spiritLevels: LevelDef[]
      }
    | {
          id: string
          kind: "colorAs" // target:"ownAll"は持ち主のスピリットすべて
          levels: number[] | null
          colors: Color[]
          target?: "self" | "ownAll" | "ownNexusesAll" // 省略時は"self"
          lentOnly?: boolean
          nameIncludes?: string
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "symbolAddGrant" // 盤面シンボル数に反映（2026-09-04確認）
          // 軽減計算にもライフダメージにも効く。symbolFixがある個体では固定値に追加分を加算する（固定値が勝つ既存規則は変えない）
          whileCombined?: true
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身／ownAll=持ち主のスピリットすべて
          filter?: TargetFilter
          color: Color
          count?: number // 省略時1
          counter?: EffectCounter // 指定時はcountを無視（0なら追加しない）
          phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" } // phase省略＝そのターンの間ずっと
          condition?: { ownFieldHasBraveInSpiritState: true } | { ownBurstSet: true } | { ownMagicUsedThisTurn: CardPick } | { count: EffectCounter; atLeast?: number; atMost?: number } // ownFieldHasBraveInSpiritState＝スピリット状態のブレイヴがいる間。ownMagicUsedThisTurn＝このターンに自分が pick に合うマジックを使用している間
      }
    | {
          id: string
          kind: "symbolFix" // 元々持つシンボルの1色目でcount個に固定する
          levels: number[] | null
          target: "ownAll" | "self"
          familyFilter?: FamilyFilter
          colorFilter?: Color // target:"ownAll" の絞り。その色を持つスピリットだけ（familyFilterと併用ならAND）
          minCores?: number // target:"ownAll" の絞り。載っているコアがこの数以上のスピリットだけ。毎回の再計算で判定するのでコアが減れば外れる
          count: number
          color?: Color
          summonReductionOnly?: true // 召喚の軽減計算の間だけ。ライフダメージ等の他のシンボル参照には効かない（2026-09-02確認）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "braveStatsAs" // スピリット状態のブレイヴのコスト・系統・BP・シンボルを上書き（合体中は対象外＝BRAVE.md §12.7）
          // そのブレイヴが元から持つ効果は上書きしない
          levels: number[] | null
          target: "ownAll"
          cost: number
          family: string[]
          braveLevels: LevelDef[] // スピリット状態は常にLv1のみ1件（§2.2）
          symbolCount: number // 色はブレイヴ自身のcolors[0]。symbolFixのsymbol[0]では使えない
      }
    | {
          id: string
          kind: "magicBuffBonus"
          levels: number[] | null
          turn?: "own" | "opponent"
          // 実装が常にstate.phase==="attack"を要求するため、『自分のアタックステップ』はturn:"own"で表す
          target: "self" | "ownOthers" | "ownAll" // ownOthers=発生源以外の持ち主の緑スピリット
          colorFilter?: Color
          amountBonus: number
      }
    | {
          id: string
          kind: "effectGrant" // 持ち主の対象スピリットに付与
          levels: number[] | null
          target: "ownAll"
          nameIncludes?: string // 省略時は自分のスピリットすべて（発生源自身も一致すれば含む）
          colorFilter?: Color
          familyFilter?: FamilyFilter
          keywordFilter?: Keyword // 効果で得たキーワードも含む（2026-09-25 ユーザー確認）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          whileCombined?: true
          granted: {
              trigger: TriggerEvent
              action: EffectAction
              condition?: { targetMaxCost: number } | { targetMaxBp: number } // targetMaxBp は onBattleEnd 用
          } // 付与される誘発効果（levelsは常に有効扱い）
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "drawDouble" // スピリット/マジックの効果によるドローのみ
          levels: number[] | null
          phaseTurn: { phase: Phase; turn: "own" }
      }
    | {
          id: string
          kind: "nameAsGrant" // 持ち主の対象スピリットに付与
          levels: number[] | null
          target: "ownAll" | "self"
          nameIncludes: string
          costFilter?: number
          colorFilter?: Color
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "trashNameAs"
          levels: null
          name: string
      }
    | {
          id: string
          kind: "vanillaAsGrant"
          levels: number[] | null
          target: "ownAll" | "chosenInstance" | "self" // chosenInstance＝targetChoiceLendThisTurnで選んだ1体だけ
          whileCombined?: true
          familyFilter?: FamilyFilter
          colorFilter?: Color
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "spiritEffectsDisabledGrant"
          // vanillaAsGrantと違い、対象判定用の述語でなく発揮自体を止める
          levels: number[] | null
          target: "ownAll" | "opponentAll" | "chosenInstance" // ownAll=持ち主のスピリットすべて／opponentAll=相手のスピリットすべて／chosenInstance=targetChoiceLendThisTurnで選んだ1体だけ
          familyFilter?: FamilyFilter
          keywordExclude?: Keyword // 静的に持たないスピリットのみ。一時/継続付与を見ないのは、spiritHasKeywordがeffectsDisabledContinuousを見て自己参照になるため
          blockingOnly?: true
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "nexusEffectsDisabled"
          levels: number[] | null
          target: "opponentAll" | "bothAll" // bothAll（白1色縛り）は両陣営に効く（2026-09-17確認）
          targetLevels?: number[] // levelsは発生源自身の有効Lv、こちらは止める側の対象ネクサスのLv
          targetEffectLevels?: number[] // 止める対象は「Lvが合う」エントリ。levels が null か、これのいずれかを含むエントリが止まる（ネクサスの現在Lvは問わない）
          phase?: Phase
          condition?: { ownFieldOnlyColor: Color; spiritsOnly?: true } // target:"bothAll" 用の発揮条件
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "destroyedCoresToTrash" // 破壊/消滅したスピリット上のコアを持ち主のリザーブでなくトラッシュへ置く
          levels: number[] | null
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "exhaustOnManualCoreAdd" // スピリット/ネクサス/マジックの効果以外（moveCore/awaken）でコアが増えたとき
          levels: number[] | null
          trigger?: "manual" | "effect" // 省略時"manual"（moveCore/awakenのみ、持ち主の相手のメインステップ限定）。"effect"＝効果によるコア増加時で、フェーズ不問
          onRemove?: boolean
          colorFilter?: Color
          scope?: "opponent" | "any" // 省略時"opponent"
          anyPhase?: true // trigger:"manual"でもメインステップ限定を外す
      }
    | {
          id: string
          kind: "constraintGrant" // 持ち主フィールドの対象に付与
          levels: number[] | null
          whileCombined?: true
          target: "ownAll"
          condition?: AuraCondition
          filter?: ResolvedTargetFilter // 付与先の絞り込み。発生源は selfInstanceId として渡す
          // filter に移していない唯一の残り。ラベル系キーワード（【激突】）は matchesTarget だと見方が変わる（要判断。BS07-X25）
          keywordFilter?: Keyword
          lentOnly?: boolean
          combinedBraveColors?: Color[]
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          turn?: "own" | "opponent" | "both"
          constraint: ConstraintDef
      }
    | {
          id: string
          kind: "funsaiBonus" // 持ち主のスピリットの【粉砕】の破棄枚数
          levels: number[] | null
          amount?: number // amountPerSymbolColor / amountPerBurstCount指定時は無視される
          amountPerSymbolColor?: Color
          amountPerBurstCount?: true // 自分と相手のバースト1つにつき+1（合計0〜2）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "millCapBonus" // 「◯枚まで」の上限（mill.countMax）に足す。破棄枚数そのものではない
          levels: number[] | null
          amount: number
          lentOnly?: boolean
      }
    | {
          id: string
          kind: "bofuCountBonus" // 持ち主のスピリットの【暴風】の指定数（静的keywordのcount）
          // 暴風を持たない（base=0）スピリットには加算しない
          levels: number[] | null
          amount: number
      }
    | {
          id: string
          kind: "flashLockWhileAttackingFamily" // 相手はフラッシュで手札のカードを使用できない
          levels: number[] | null
          familyFilter?: FamilyFilter // 省略時は系統を問わない
          minSymbols?: number // アタッカーのシンボル数がこれ以上の間だけ
          cardType?: CardType // その種別の手札のカードだけ使えない（手元・バーストの発動は止めない。2026-10-23 ユーザー確認）
      }
    | {
          id: string
          kind: "blockTriggersAsAttackGrant"
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          whileOwnBurstSet?: true
          alsoBlock?: true // 付け替えず、『ブロック時』のままアタック時にも発揮する
      }
    | {
          id: string
          kind: "lifeDamageMillGuard" // 持ち主のライフが相手のアタックで減るとき、デッキ上1枚を破棄し、matchに一致すればライフが減らない
          // 「〜できる」は自動適用の簡略化
          levels: number[] | null
          match: { color?: Color; cardType: CardType }
          keepToHandIfType?: CardType // 守れたかに関わらず手札に加える
          keepToHandIfKeyword?: Keyword
          attackerFilter?: { maxLevel?: number; keywordExclude?: Keyword }
          turn?: "own" | "opponent"
      }
    | {
          id: string
          kind: "attackTriggersAsBlockGrant"
          levels: number[] | null
          target: "anyAll" | "ownAll" | "self" // anyAll=両陣営のスピリット／self=発生源自身のみ
          familyFilter?: FamilyFilter
          keywordFilter?: Keyword
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "magicRestriction"
          levels: number[] | null
          whileCombined?: true
          restriction:
              | "oncePerTurnAll" // お互い、ターンに1回しかマジックの効果を使用できない
              | "noReductionOpponent" // 相手は、マジック使用時に軽減シンボルによるコスト軽減ができない
              | "noReductionOpponentNexus" // 相手は、ネクサス配置時に軽減シンボルによるコスト軽減ができない
              | "colorLockOpponent" // 相手は、自分（使用者）のフィールドのシンボルと同じ色を含まないマジックカードを使用できない
              | "reserveOnlyOpponent" // 相手は、マジックのコストをすべてリザーブから支払わなければならない
              | "noFreeCastOpponent" // 相手は、マジックの無償化を適用できない
              | "costLimitAll" // お互い、maxCost以下のコストのマジックの効果を使用できない
              | "noFlashAll" // お互い、マジックカードのフラッシュ効果を使用できない
              | "trashColorLockOpponent" // 相手は、その相手自身のトラッシュにあるマジックカードと同じ色を含むマジックカードを使用できない
              | "noFlashOpponent" // 相手は、マジックカードのフラッシュ効果を使用できない
              | "noSpiritCoresOpponent" // 相手は、マジックのコストを支払うときスピリット上のコアでは支払えない
          maxCost?: number // restriction:"costLimitAll"専用：カード記載のコスト（軽減前）がこの値以下のマジックを使用できなくする
          requireOwnKeyword?: Keyword // 指定時、持ち主のフィールドにこのキーワードを持つスピリットがいる間のみ有効
          phase?: Phase
          turn?: "own" | "opponent" // 指定時、持ち主がturnPlayerのとき(own)／でないとき(opponent)のみ有効
      }
    | {
          id: string
          kind: "magicRepeatGrant" // 持ち主が使用したマジックの効果を解決後にもう1度だけ発揮する
          levels: number[] | null
          condition?: "selfInBattle" // magicFreeGrantと同じ
          oncePerBattle?: true
      }
    | {
          id: string
          kind: "ownMagicColorless" // 自分が使用する指定色のマジックの色を無いものとして扱う
          levels: number[] | null
          color: Color
          whileBattling: true // selfInBattleと同じ判定だが、フィールドに名前がある方が読みやすいため別名
      }
    | {
          id: string
          kind: "exhaustImmunityGrant"
          levels: number[] | null
          sourceTypes?: CardType[] // 防ぐ相手の効果の種類（省略＝すべて）。ブレイヴ自身の効果は "brave"、【合体時】は "spirit"
          familyFilter?: string // scope:"self"のときは省略可（familyFilterとscopeは排他）
          scope?: "self"
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "effectTax" // cost（相手視点で解決する）を支払わなければ効果を発揮できない
          levels: number[] | null
          on: "magic" | "burst"
          cost: EffectAction
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // turnは発生源の持ち主から見る
      }
    | {
          id: string
          kind: "lifeDamageNegate" // 発生源の持ち主のライフが減らない
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "lifeDamageReplace" // 減ったライフは「ライフの減少」として後続を通す
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身／ownAll=持ち主のスピリットすべて
          familyFilter?: FamilyFilter
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          action: EffectAction
      }
