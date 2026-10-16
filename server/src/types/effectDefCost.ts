// 効果の定義のうち、コスト・軽減・支払い方を変えるもの
import type { CardPick, CardType, Color, EffectCounter, FamilyFilter, Keyword, Phase } from "../type"

export type EffectDefCost =
    | {
          id: string
          kind: "symbolWhenSummoning" // 自分が team／minCost に合うスピリットカードを召喚する時、このカードに color のシンボルを count 個（省略時1）追加する（shared/cost.ts の軽減計算で足す）
          levels: number[] | null
          color: Color
          count?: number
          team?: string
          minCost?: number
          pick?: CardPick // 召喚するカードの絞り込み（cardType/family/cost/color/nameIncludes/team。shared/cost.ts の cardMatchesSummonPick）
          ownMainStepOnly?: true
          opponentSpiritVanishedThisTurn?: true // このターンに相手のスピリットが消滅（維持コア割れ）していたときだけ有効（state.spiritVanishedThisTurn）
          toOwnSpiritsCost?: number // 追加先を「コストNの自分のスピリットすべて」にする。該当する個体ごとに count 個ぶん足す（召喚中の軽減計算にだけ効く）
      }
    | {
          id: string
          kind: "fchangeCostAs" // 手札のこのカードは、自分の【Fチェンジ】の召喚候補を判定する時、自分か相手のライフが anyLifeAtMost 以下なら cost としても扱う（summon.ts の候補判定）
          levels: null
          cost: number
          anyLifeAtMost: number
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
          kind: "effectCostExhaustDiscount" // 発生源が場にありレベル有効の間、持ち主の「team を持つカードの効果」の「Nコスト支払う」（pay の removeCores／起動の reserveToTrash）で、発生源を疲労させて amount コスト払ったものとして扱える（任意。〔重複不可〕＝1回の支払いにつき1つだけ）。カードの召喚・使用コストは対象外。効果による召喚の支払いは未対応
          levels: number[] | null
          team: string // 払う効果の発生源が持つチーム
          amount: number
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
          kind: "nexusCostMillPay" // 発生源が場にありレベル有効の間、持ち主はネクサスの配置コストを「コスト1につきデッキ上から1枚破棄」で支払える（コアは払えない）。
          // 全額コアか全額デッキ破棄かのどちらかを選ぶ
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
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
          kind: "summonCostHandDiscardPay" // 発生源が場（このターンの仮想発生源）にある間、持ち主はスピリットの召喚コストを「コスト1につき手札1枚破棄」で支払える
          levels: null // 貸与専用（マジックがlendSelfThisTurnで自分を貸す）。仮想発生源はLv0なのでnull固定
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
          condition?: { ownNexusAtLeast: number } | { ownLifeAtMost: number } | { ownTrashFamilyCountAtLeast: { family: FamilyFilter; count: number } } | { ownBurstSet: boolean } | { opponentSpiritCostAtMost: number } | { ownNoSpirit: true } // opponentSpiritCostAtMost＝相手のフィールドにコストがこれ以下のスピリットがいるときのみ有効／ownNoSpirit＝自分のスピリットがいないときのみ有効（26RBS03-017/037）。ownLifeAtMost＝ライフがこれ以下のときのみ有効。
          // scope:"self"用：発生源の持ち主のネクサス数がこれ以上のときのみ有効。ownBurstSet＝バーストセット中(true)／未セット(false)のみ有効
          // ownTrashFamilyCountAtLeast＝トラッシュにある指定系統（配列＝OR）のスピリットカード枚数がcount以上のときのみ有効
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
          kind: "levelCostMod" // 発生源が場にありレベル有効の間、対象スピリットすべての「Lvコスト」（各レベルに必要なコア数）をamountだけ増やす。
          // Lv1のコストも上がるので、コアが足りなくなった個体は維持コア割れで消滅する（2026-08-14確認。BS09-017蛇凰神バァラル）
          levels: number[] | null
          target: "opponentAll" | "ownAll" | "opponentNexusesAll" // opponentNexusesAll=対象がスピリットでなく相手のネクサスすべて
          amount: number
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
          kind: "exTrashReduction" // 《継召》等：トラッシュのEXシンボル持ちカードを除外することで、そのカードのシンボル数ぶん召喚コストを軽減できる。効果は「召喚しようとするこのカード自身」が持っているかで判定（手札以外＝トラッシュ等からコストを支払う召喚でも効く）。除外するカードはプレイヤーが召喚時に選ぶ（summon アクションの exReductionTrashIndices）。軽減の合計はこのカードの軽減シンボル数を超えない
          levels: number[] | null
      }
    | {
          id: string
          // 手札のこのカード自身の召喚コストの注記（shared/cost.ts の effectiveCost が読む）。
          // fullReduction＝軽減シンボルすべてを満たす（軽減シンボルの数だけ軽減。軽減できない状況では効かない）／
          // trashSymbols＝自分のトラッシュのシンボルでも軽減できる／
          // perOppReserveCore＝相手のリザーブのコア1個につき軽減シンボル1つを（色を問わず）満たせる（軽減シンボルの数が上限）／
          // perOwnFamilySpirit＝family を持つ自分のスピリット1体につきコストを per ずつ増減する（maxTotal が累計の上限。軽減の前に総コストへ足す）
          kind: "selfSummonCost"
          levels: null
          // setCost＝総コストを setTo にする（そこから軽減できる）。oncePerTurnName＝同じカード名でターンに1回（この注記で setTo になった状態で召喚したら1回。2026-10-10 ユーザー確認）
          mode: "fullReduction" | "trashSymbols" | "perOppReserveCore" | "perOwnFamilySpirit" | "setCost"
          viaSoryo?: true // 【操霊】で召喚する時だけ有効
          condition?: { ownAttacksAtLeast: number } | { ownMagicUsedThisTurn: CardPick } | { ownTrashAllColor: Color } | { ownEffectDestroyedOwnSpirit: true }
          setTo?: number
          oncePerTurnName?: true
          family?: FamilyFilter
          per?: number
          maxTotal?: number
      }
    | {
          id: string
          kind: "soulCoreOnlyCast" // 「自分の◯シンボルがあれば[ソウルコア]だけで使用できる」（26系マジック32枚。2026-10-05ユーザー確定）: 自分のフィールドに color のシンボルが1つ以上あるなら、使用コスト全額をリザーブの[ソウルコア]1個だけで支払って使用できる（軽減シンボルは無関係。ソウルコアは支払いとしてトラッシュへ。リザーブに[ソウルコア]がなければこの道は使えない）。castMagic の useSoulCoreOnly で指定
          levels: null // 使用コストの性質でレベルの概念が無いため常にnull
          color: Color // 「自分の◯シンボル」の色
          symbolAs?: { family: string; color: Color } // 指定系統を持つ自分のスピリット/ネクサスのシンボルを color としても数える（このマジックをソウルマジックで使用できるかの判定のときだけ。26RDB01-060）
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
          kind: "magicFreeGrant" // 発生源の持ち主は、指定色のマジックカードをコストを支払わずに使用できる
          levels: number[] | null
          colorFilter?: Color // scope省略時にこの色のマジックのみ無償化（scope指定時は色不問なので省略する）
          hasBurst?: true // 指定時は【バースト】効果を持つマジックカードだけ無償化する
          scope?: "allMagicHandAndTegamoto" // 色を問わず、持ち主の手札/手元(tegamoto)のマジックカードすべてを無償化
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
          condition?: "selfInBattle" // 指定時、発生源自身が現在のバトルの当事者であるときのみ有効
          oncePerBattle?: true // 指定時、この発生源が無償化できるのは1バトルにつきマジック1枚だけ
      }
