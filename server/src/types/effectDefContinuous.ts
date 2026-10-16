// 効果の定義のうち、場にある間ずっと効く継続効果と付与（〜Grant・〜As・抑制など）
import type { AuraCondition, AuraDef, CardPick, CardType, Color, ConstraintDef, EffectAction, EffectCounter, FamilyFilter, GlobalConstraintDef, Keyword, LevelDef, Phase, TargetFilter, TriggerEvent } from "../type"
import type { EffectDef } from "./effectDef"

export type EffectDefContinuous =
    | {
          id: string
          kind: "aura"
          levels: number[] | null
          whileCombined?: true
          aura: AuraDef
          lentOnly?: boolean // lendSelfThisTurn で貸した効果（仮想発生源）からだけ有効（2026-08-24）
          whileOwnBurstSet?: true // バーストをセットしている間だけ発揮
          uniqueByName?: true // 〔重複不可〕：同じカード名の発生源は、対象1体につき1回分だけ効く（drawStepBonus と同じ考え方）
      }
    | {
          id: string
          kind: "castRestriction" // 《ソウルマジック》の「このカードはメインステップでは使用できない。」: メインステップ中の使用だけを禁止（フラッシュでもメインステップ中なら不可。2026-10-08 ユーザー確定）
          levels: null
          notInMainStep: true
      }
    | {
          id: string
          kind: "constraint"
          levels: number[] | null
          whileCombined?: true
          whileSpirit?: true // ブレイヴがスピリット状態（単独）のときだけ。合体してホストの制約に合流する側では外す（whileCombined の逆）
          whileOwnBurstSet?: true // バーストをセットしている間だけ発揮
          condition?: AuraCondition // aura.conditionと同じ判定式を流用
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // aura.phaseTurnと同義
          constraint: ConstraintDef
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
          kind: "countAsMultiple" // 発生源が場にありレベル有効の間、持ち主の効果が「スピリットの数を数える」とき、この個体をcount体分として数える
          levels: number[] | null
          count: number
          sourceTypes?: CardType[] // 数える側の効果の発生源種別をこれに限る。省略時は種別を問わない
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
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤーごと・カード名ごとに1回（「この効果はターンに1回しか使えない」）
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
          fromLevel?: number // 省略時はどのLvにも効く
          useLevel: number | "max" // "max"＝対象のカードが持つ最高Lv
          maxCost?: number // 対象の印刷コストがこれ以下のときだけ
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
          kind: "globalConstraint"
          levels: number[] | null
          whileCombined?: true
          whileOwnBurstSet?: true // バーストをセットしている間だけ発揮
          whileSelfAttacking?: true // 発生源自身が現在のバトルのアタッカーの間だけ発揮（『アタック中』窓。hasGlobalConstraint が見る。26RBS02-054）
          constraint: GlobalConstraintDef // フィールド発生源から全スピリット／全ネクサスに効く制約（発生源の持ち主を問わない。ただしownNexusIndestructibleは持ち主自身のみに効く）
          condition?: { ownVanillaSpiritsAtLeast?: number; allOwnNexusesHaveColor?: Color; allOwnNexusesHaveFamily?: string; ownNexusCountExactly?: number; ownFamilyCountAtLeast?: { family: FamilyFilter; count: number } } // ownNexusCountExactly＝ネクサス数がちょうどこの数のときだけ有効。
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
          kind: "burstMagicFreeEffect" // 発生源が場にありレベル有効の間、自分のバーストがマジックカードで発動したとき、バースト効果の解決後にコストを支払わずメイン/フラッシュのどちらか1つを発揮できる（任意。BS16-070）
          levels: number[] | null
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
          kind: "coreBonus" // このスピリットに効果でコアが置かれるとき、置く数を+amount（ボイド由来）する
          levels: number[] | null
          amount: number
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
          kind: "drawStepBonus" // 持ち主のドローステップのドロー枚数を+amountする（26系「ドローの枚数を+1枚する」）
          levels: number[] | null
          amount: number
          uniqueByName?: true // 〔重複不可〕：同じカード名の発生源は何枚あっても1回分だけ数える
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
          kind: "chimeiBonus" // 自分の【地鳴】で指定された枚数（【地鳴：N】のN）を amount 枚増やす（mill ハンドラが【地鳴】の破棄枚数を求めるとき、発生源のレベルが合い phaseTurn に合うものの合計を N に足す）
          levels: number[] | null
          amount: number
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
    | {
          id: string
          kind: "allTeams" // このカードはすべてのチームを持つ（チームを見る判定 cardHasTeam が全チームに当たる。カード単体で見る場所だけ：オープン・トラッシュの絞り込み、軽減シンボル等）
          levels: null
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
          kind: "levelAs" // 継続的な「Lv◯として扱う」置換
          levels: null
          whileCombined?: true
          whileAttacking?: true // 発生源自身が現在のバトルのアタッカーの間だけ有効（『アタック中』）
          target: "self" | "ownNexusesAll" | "opponentNexusesAll" | "ownSpiritsAll" | "ownSpiritsByKeyword" | "ownSpiritsByFamily" | "ownSpiritsVanilla" | "opponentSpiritsAll" | "opponentBlockersOfOwnKeyword" // ByKeyword=keywordFilter一致（Lv不問）／ByFamily=familyFilterのOR／Vanilla=無地スピリット／allSpiritsByChosenColor=貸与時に選んだ色の両陣営
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
              | { opponentTrashAtLeast: number } // 相手のトラッシュのカードがこの枚数以上の間有効
              | { ownAllSpiritsHaveFamily: string[] } // 自分のスピリットすべてが、配列のどれかの系統を持つ間有効（0体では不成立）
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
          phaseTurn?: { phase?: Phase; turn: "own" | "opponent" | "both" } // phase 省略＝そのターンの間ずっと（『自分のターン』）
          condition?: { ownFieldHasBraveInSpiritState: true } | { ownBurstSet: true } | { ownMagicUsedThisTurn: CardPick } | { count: EffectCounter; atLeast?: number; atMost?: number } // ownMagicUsedThisTurn＝このターンに自分が pick に合うマジックを使用している間。指定時はフィールドにスピリット状態のブレイヴがいる間だけ有効。ownBurstSet＝バーストをセットしている間だけ有効
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
          targetLevels?: number[] // 指定時、止まるのは現在このLvのネクサスだけ（BS16-041）。levelsは発生源自身の有効Lv、こちらは止める側の対象ネクサスのLv
          phase?: Phase // 指定時はこのステップの間のみ有効（ターンプレイヤー不問＝『お互いの〜ステップ』）
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
          condition?: AuraCondition // 発生源の持ち主基準で満たすときだけ付与する（26RBS03-060）
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          colorFilter?: Color // 指定時はこの色を持つスピリットのみ
          keywordFilter?: Keyword // 指定時はこのキーワード（静的・一時/継続付与を考慮）を持つスピリットのみ
          vanillaFilter?: true // 指定時は効果の記述を持たない（バニラ）スピリットのみ
          lentOnly?: boolean // 仮想発生源（lendSelfThisTurnで貸したもの）からのみ有効
          minSymbols?: number // 指定時はシンボル数がこれ以上のスピリットのみ
          symbolCount?: number // シンボル数の完全一致（minSymbols とは別軸）
          combinedBraveColors?: Color[] // 発生源がこの色のブレイヴと合体している間だけ（triggered と同じ判定）
          nameIncludes?: string[] // 指定時はカード名にいずれかの文字列を含むスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 指定時は持ち主基準でこのステップ・turn条件のときのみ有効
          costFilter?: number // 指定時は対象スピリットのコストがこれと一致するときのみ有効
          turn?: "own" | "opponent" | "both" // 指定時はフェーズを問わずこのturn条件の間だけ有効
          combinedFilter?: true // 指定時は合体スピリットのみ対象
          teamFilter?: string // 指定時は指定チーム（CardData.team）所属のスピリットのみ
          restedOnly?: true // 指定時は疲労状態のスピリットのみ
          summonedBy?: string // 指定時は召喚経路（CardInstance.summonedBy。"soryo" 等）が一致するスピリットのみ
          summonedThisTurnOnly?: true // 指定時は今のターンに召喚されたスピリットのみ
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
          kind: "flashLockWhileAttackingFamily" // 発生源が場にある間、familyFilter一致スピリットがアタックしている間だけ、相手はフラッシュで手札のカードを使用できない
          levels: number[] | null
          familyFilter: FamilyFilter
      }
    | {
          id: string
          kind: "blockTriggersAsAttackGrant" // 発生源が場にありレベル有効の間、対象スピリットの『このスピリットのブロック時』効果を『このスピリットのアタック時』に発揮させる
          levels: number[] | null
          target: "ownAll"
          familyFilter?: FamilyFilter // 指定時はこの系統（配列＝OR）を持つスピリットのみ
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 持ち主基準でこのステップ・turn条件のときのみ有効
          whileOwnBurstSet?: true // バーストをセットしている間だけ有効
          alsoBlock?: true // 付け替えず、『ブロック時』のままアタック時にも発揮する（26RBS02-X10）
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
          kind: "effectTax" // 発生源の持ち主の相手が使うマジック／発動するバーストは、cost（相手視点で解決する）を支払わなければ効果を発揮できない
          levels: number[] | null
          on: "magic" | "burst"
          cost: EffectAction
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // turn は発生源の持ち主から見る
      }
    | {
          id: string
          kind: "lifeDamageNegate" // ブロックされなかったアタッカーの実効BPが発生源の実効BP以下のとき、発生源の持ち主のライフは減らない
          levels: number[] | null
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" }
      }
