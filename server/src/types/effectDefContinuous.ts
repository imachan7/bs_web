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
          cost: { selfCoresToVoid: number } | { selfCoresToTrash: number } | { exhaustSelf: true } | { none: true } // exhaustSelf=発生源を疲労（回復状態でなければ使えない）。selfCoresToTrash=selfCoresToVoid と同じ判定・支払いで行き先が持ち主のトラッシュ（BS21-X04 Lv3）
          colors?: Color[]
          phase?: Phase
          turn?: "own" | "opponent"
          afterNegate?: "selfToDeckBottom" // 「その後」＝結果であり支払いではない。無効にしなければ戻らない（2026-08-16確認）
          oncePerTurn?: true
          onceScope?: "name" // oncePerTurnと併用。プレイヤーごと・カード名ごとに1回
      }
    | {
          id: string
          kind: "burstActivationNegate" // 相手のバーストが発動したとき、destroyFamily の系統を持つ自分のスピリット1体を破壊して発動を無効にし破棄する（任意）。効果を受けないバーストには効かない（Q7012）
          levels: number[] | null
          phase?: Phase
          destroyFamily: string
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
          kind: "targetNegateByHandDiscard" // 持ち主の対象スピリットが、相手の bySourceType(s) の効果の対象になるたび、手札をdiscardCount枚破棄してその効果を受けない
          // 払うかは対象1体ごとに守る側へ確認する（askPayToNegateIfNeeded）。probing（候補列挙）では払わない＝対象にはなる。非対話（テスト・自動解決）だけ払える限り自動で払う（破棄は手札末尾から）
          levels: number[] | null
          familyFilter?: FamilyFilter // 省略可。filter と併用すると両方に合うものだけ
          filter?: ResolvedTargetFilter // 受け手（持ち主のスピリット）の絞り込み
          bySourceType?: "spirit" // bySourceTypes の旧書式（BS08-055）。どちらか1つを書く
          bySourceTypes?: CardType[]
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
          condition?: { ownVanillaSpiritsAtLeast?: number; allOwnNexusesHaveColor?: Color; allOwnNexusesHaveFamily?: string; ownNexusCountExactly?: number; ownFamilyCountAtLeast?: { family: FamilyFilter; count: number }; ownSpiritMatches?: ResolvedTargetFilter }
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
          condition?: { selfRested?: true; ownBurstSet?: true }
          filter?: ResolvedTargetFilter // 召喚されたスピリットがこれに合うときだけ（コストは印刷された値＝軽減前）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
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
          condition?: { ownFieldHasNames: string[] } | { ownFieldHasFamily: string } | { ownLifeAtMost: number } // ownLifeAtMost は toLife と併用（ライフがこの値以下のときだけ行き先を変える）
          toLife?: true // コアステップでリザーブに置く1個のかわりにライフに置く（amount の追加コアはリザーブのまま。「置くことができる」＝任意だが、条件を満たせば自動で置く簡略化。BS19-092）
      }
    | {
          id: string
          kind: "keywordGrant" // 持ち主のfamilyFilter一致スピリットすべてに付与
          levels: number[] | null
          whileCombined?: true
          onlyWhileSpiritState?: true // whileCombinedの逆。combinedBravesは合体中もeffectSourcesに含まれ続けるため、付けない継続付与は既定では合体後も効き続ける
          keyword: Keyword
          kyoka?: "bpDestroy" | "coreRemove" | "exhaust" | "refresh" | "bpMinus" | "deckMill" // keyword:"kyoka" のとき、与える【強化】の種類（kyokaBonus が付与分を数える）
          target: "ownAll"
          filter?: ResolvedTargetFilter // 付与先の絞り込み（keywordFilter の統一軸。ラベル専用キーワードの参照＝【連鎖】持ちなどはここに書く。Q774：Lvで判定される）
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
          filter?: ResolvedTargetFilter // 付与先の絞り込み（keywordGrant の filter と同じ判定。付与した系統をこの軸で参照すると自己再帰するので、family 軸には書かない）
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
          toDeck?: true // against:"bounce"限定。デッキの上/下に戻す効果も防ぐ（省略時は手札に戻す効果だけ防ぐ）
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
          keywordFilter?: Keyword // target:"opponentBlockersOfOwnKeyword"では「このキーワードを持つ自分のスピリットをブロックしている相手」を指す。ラベル系キーワード（【連鎖】等）は現在Lvで「持つ」（Q774）
          attackerOnly?: true // 対象をいまアタックしている個体（board.battle.attackerInstanceId）だけに絞る（「〜がアタックしたとき、そのスピリットは」の継続版。BS19-096）
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
              | { ownSpiritMatches: ResolvedTargetFilter } // 発生源自身も数える
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
          kind: "coresAs" // 持ち主のカード名に nameContains を含むネクサスを、コアが count 個置かれているものとして扱う（coresOverride。Lv判定に効く。Q4578）
          levels: number[] | null
          nameContains: string
          count: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "bpAs"
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
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
          keyword?: Keyword // 効果の見出しに付くキーワードのラベル（triggered と同型。【連鎖】を含む継続効果＝Q774）
          whileCombined?: true
          whileSpirit?: true // ブレイヴがスピリット状態（単独）のときだけ。whileCombinedの逆
          levels: number[] | null
          target: "self" | "ownAll" // self=発生源自身／ownAll=持ち主のスピリットすべて
          filter?: TargetFilter
          color: Color
          count?: number // 省略時1
          counter?: EffectCounter // 指定時はcountを無視（0なら追加しない）
          phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" } // phase省略＝そのターンの間ずっと
          condition?: { ownFieldHasBraveInSpiritState: true } | { ownBurstSet: true } | { ownMagicUsedThisTurn: CardPick } | { count: EffectCounter; atLeast?: number; atMost?: number } | { combinedWithSymbollessBrave: true } // ownFieldHasBraveInSpiritState＝スピリット状態のブレイヴがいる間。ownMagicUsedThisTurn＝このターンに自分が pick に合うマジックを使用している間。combinedWithSymbollessBrave＝発生源自身がシンボルを持たないブレイヴと合体している間（BS19-040【合体時】Lv3）
      }
    | {
          id: string
          kind: "symbolFix" // 元々持つシンボルの1色目でcount個に固定する
          levels: number[] | null
          target: "ownAll" | "self"
          familyFilter?: FamilyFilter
          orKeyword?: Keyword // familyFilter とOR。このキーワード（ラベル専用の【連鎖】等を含む）を持つスピリットも対象（「系統：「異合」を持つ／【連鎖】を持つ」）
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
          battleOnly?: true // 『アタック時』『ブロック時』など効果文に期間が書かれていないBP+はバトルの間だけ（バトル終了で消える）。省略時はターン終了時まで
      }
    | {
          id: string
          kind: "effectGrant" // 持ち主の対象スピリットに付与
          levels: number[] | null
          target: "ownAll"
          filter?: ResolvedTargetFilter // 付与先の絞り込み（keywordGrant の filter と同じ判定。コスト下限・合体していない等）
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
              keywordBody?: Keyword // この誘発がキーワードの本体（【聖命】等）。同じキーワードは重ねて持っても1回なので、元から持つ個体には付けず、付与が重なっても1回
          } // 付与される誘発効果（levelsは常に有効扱い）
          lendFrom?: "sourceBraves" | "self" // granted.action のかわりに、ブレイヴが持つ onAttack＋whileCombined のエントリすべてを与える。sourceBraves＝発生源に合体しているブレイヴ（BS23-031）、self＝付与された個体自身（BS23-044）。2026-11-08 ユーザー決定：『合体アタック時』と【合体時】『アタック時』を区別しない。granted.action は使われない
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
          whileCombined?: true // ブレイヴの【合体時】限定。合体中の間、ホスト（合体スピリット）に付与する（P044 星鎧龍ジーク・ブレイヴ）
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
          target: "ownAll" | "opponentAll" | "bothAll" | "chosenInstance" // ownAll=持ち主のスピリットすべて／opponentAll=相手のスピリットすべて／bothAll=お互い／chosenInstance=targetChoiceLendThisTurnで選んだ1体だけ
          familyFilter?: FamilyFilter
          filter?: TargetFilter // コスト・名前のように状態を読まない軸だけ使う（BP軸などは再構築中に自己参照する）
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
          // 破壊された自分のスピリットのコアすべては、リザーブではなくこのスピリットに置かれる（BS20-X01 Lv1）。
          // 破壊された個体自身と破壊待機中の個体は行き先になれない。候補が複数なら持ち主が、
          // トラッシュ/ボイド行き（destroyedCoresToTrash・timed の destroyedCoresTo）と衝突するときはターンプレイヤーが選ぶ
          kind: "destroyedCoresToSelf"
          levels: number[] | null
      }
    | {
          id: string
          kind: "exhaustOnManualCoreAdd" // スピリット/ネクサス/マジックの効果以外（moveCore/awaken）でコアが増えたとき
          levels: number[] | null
          trigger?: "manual" | "effect" | "nonSummon" // 省略時"manual"（moveCore/awakenのみ、持ち主の相手のメインステップ限定）。"effect"＝効果によるコア増加時で、フェーズ不問。"nonSummon"＝効果・手操作の区別なくコアを置かれたとき（083。召喚の維持コア配置はそもそもこの検査に来ない。対象側のターンのメインステップ限定）
          onRemove?: boolean
          colorFilter?: Color
          scope?: "opponent" | "any" // 省略時"opponent"
          anyPhase?: true // trigger:"manual"でもメインステップ限定を外す
      }
    | {
          id: string
          kind: "constraintGrant" // 持ち主フィールドの対象に付与
          levels: number[] | null
          keyword?: Keyword // 効果の見出しに付くキーワードのラベル（triggered と同型。【連鎖】を含む継続効果＝Q774）
          whileCombined?: true
          target: "ownAll" | "opponentAll" // opponentAll＝発生源の持ち主から見て相手のスピリットすべて（BS21_PLAN §3 の N9）
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
              | "colorBanAll" // お互い、colors のいずれかの色のマジックカードを使用できない（BS19-066「お互い、緑/白/黄のマジックカードを使用できない」）
          maxCost?: number // restriction:"costLimitAll"専用：カード記載のコスト（軽減前）がこの値以下のマジックを使用できなくする
          colors?: Color[] // restriction:"colorBanAll"専用：使用できない色
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
          on: "magic" | "burst" | "deckMill" // deckMill＝このカードの持ち主のデッキを破棄する効果（破棄する側が払う。084）
          cost: EffectAction
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // turnは発生源の持ち主から見る
      }
    | {
          id: string
          kind: "sokuFreeSummon" // 持ち主が【神速】で手札から召喚するとき（フラッシュタイミング）、ターンに1回コストを支払わずに召喚できる（維持コアは置く）
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          oncePerTurn: true
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
    | {
          id: string
          kind: "seimeiReplace" // 持ち主の【聖命】すべてのライフ増加を、発揮のたびに聞いて action に置き換える
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          action: EffectAction
      }
    | {
          id: string
          kind: "deckRule" // デッキ構築の規則。継続効果ではなく印（盤面では読まない。validateDeckCards が読む）
          rule: "anyCopies" // 同名カードの枚数上限を外す（CP13-01）
      }
    | {
          id: string
          kind: "braveExtraCombine" // このブレイヴ自身の特性：要求した名前のブレイヴと合体中の自分のホストに、合体条件・数を無視して1つだけ追加で合体できる（Q20340〜Q20342）
          requireHostBraveName: string
      }
    | {
          id: string
          kind: "rensaIgnoreCondition" // 合体中のブレイヴの【合体時】効果。ホストスピリットの【連鎖】の条件（if ownColorSymbols）を無視して発揮させる（SD11-X02）
          levels: number[] | null
          whileCombined?: true
      }
