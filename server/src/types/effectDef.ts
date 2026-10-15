// カード効果の定義（いつ・どんな条件で・何をするか）。type.ts の肥大化を避けるため 2026-09-12 に切り出した（type.tsがre-export）。

import type {
    Color, EffectAction, FamilyFilter, Keyword, Phase
} from "../type"
import type { EffectDefTrigger } from "./effectDefTrigger"
import type { EffectDefContinuous } from "./effectDefContinuous"
import type { EffectDefCost } from "./effectDefCost"
export type { EffectDefCost } from "./effectDefCost"
export type { EffectDefContinuous } from "./effectDefContinuous"
export type { EffectDefTrigger } from "./effectDefTrigger"

export type EffectDef =
    | EffectDefTrigger
    | EffectDefContinuous
    | EffectDefCost
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
          kind: "magic"
          timing: "main" | "flash"
          action: EffectAction
          afterBlockForbidden?: true // trueならブロック宣言後のフラッシュタイミングでは使用不可
          mainForbidden?: boolean // trueならこのエントリがtimingとして採用されるメインステップでの使用そのものを拒否
          ownTurnForbidden?: true // trueなら発生源の持ち主のターン中は使用不可
          usableAtOpponentMainEnd?: true // timing:"flash"限定：相手がメインステップ終了を宣言した瞬間にも使用できる
          oncePerTurnByName?: true // 「自身は同じカード名のこの効果をターンに1回しか使えない」：プレイヤーごとに、そのカード名のその効果（timing）をターンに1回。2回目は使用できない（2026-10-08 ユーザー確定）
          oncePerTurn?: true // 使用者ごと・カード名ごとにそのターン1回だけ発揮。2枚目は使用はできるが効果は発揮されない
          condition?: MagicCondition // 「〜とき、〜する」：使うことはでき、解決の時点で満たさなければこのエントリは発揮しない
          useCondition?: MagicCondition // 「この効果は〜ないと使えない」：使う前に見て、満たさなければ使用できない（解決の時点でも見る。2026-09-26 ユーザー確認）
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
          kind: "flashSummonFromHand" // 手札のこのカードは phaseTurn の間、フラッシュで【神速】と同じく召喚できる（支払いはリザーブ。shared の flashSummonFromHandNow）
          levels: null
          phaseTurn: { phase: Phase; turn: "own" | "opponent" | "both" }
          condition?: { ownLifeLostThisTurn?: true; ownTrashAllColor?: Color; ownTrashHasFamily?: string; ownAllHaveTeam?: string; soulCoreInReserve?: true } // 書いたものをすべて満たすときだけ召喚できる。ownTrashAllColor＝自分のトラッシュのカードすべてがその色（0枚は成立。ownTrashOnlyColor と同じ空虚な真）／ownAllHaveTeam＝自分のスピリット/ネクサスすべてがそのチーム
          oncePerTurn?: true
          onceScope?: "name" // 「自身は同じカード名のこの効果をターンに1回しか使えない」。この許可で召喚した時に枠を消費する（GameEngine.summon）
      }
    | {
          id: string
          kind: "jugekiCoreToVoid" // 発生源が場にありレベル有効の間、持ち主のスピリットの【呪撃】で破壊される相手スピリット上のコアをcount個ボイドへ
          levels: number[] | null
          count: number
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
          kind: "awakenFromReserve" // 発生源が場にありレベル有効の間、持ち主のスピリットすべての【覚醒】は「自分のスピリット上」に加え自分のリザーブからもコアを置けるようになる
          levels: number[] | null
          target: "ownAll"
          superAwakenOnly?: true // 指定時は【超覚醒】を持つスピリットにだけ有効
      }
    | {
          id: string
          kind: "activated"
          keyword?: Keyword // 【増幅】等のキーワード能力を持つことを示すラベル（triggered と同型。spiritHasLabeledKeyword が判定）
          oncePerBattle?: true // 〔バトル1回〕。同バトルで発動済みなら拒否（使用済み記録は activatedUsedTurn と別のバトル単位で持ち、clearBattle で消える）
          whileCombined?: true
          // 起動の対象は合体中のブレイヴ自身のinstanceIdだが、効果のselfにはホスト（合体スピリット）が渡る
          timing: "flashBattle" | "flash" | "main" // flashBattle＝フラッシュ中のバトルのみ／flash＝フラッシュで使えるタイミング全般／
          // main＝自分のメインステップ中の任意のタイミング（バトル中は不可、フラッシュ優先権も見ない）。
          // 『自分のメインステップ』としか書かれておらず「ステップ開始時」の指定が無い効果はこちら
          levels: number[] | null
          ownTurnOnly?: true // 『自分のターン』：ステップを絞らず自分のターンだけ（26RBS02-X07）
          phaseTurn?: { phase: Phase; turn: "own" | "opponent" | "both" } // 『自分のアタックステップ』等の絞り込み（AuraDef.phaseTurnと同型）。
          // timingだけでは「フラッシュで使えるタイミング全般」になり相手ターンにも撃ててしまうため、ステップを明示しているカードには必ず付ける
          cost?: { reserveToTrash: number } | { exhaustSelf: true } | { selfCoresToTrash: number } | { discardHandFamily: FamilyFilter } | { exhaustOwnFamilyOne: FamilyFilter } | { discardHandOne: true; exhaustSelf: true } | { discardHandKeyword: Keyword } | { discardHandColor: Color } // 発動コスト。reserveToTrash=リザーブから／exhaustSelf=自身を疲労。省略時は追加コストなし
          // discardHandColor=手札にある指定色のカード（種別不問）1枚を破棄。selfCoresToTrash=発生源自身の上のコアをこの数だけトラッシュへ。
          // discardHandFamily=手札にある指定系統（配列＝OR）のスピリットカード1枚を破棄。exhaustOwnFamilyOne=フィールドの指定系統（配列＝OR）の回復状態スピリット1体を疲労。
          // { discardHandOne; exhaustSelf }=手札1枚（末尾。決定的簡略化）を破棄しこのスピリット自身を疲労。{ discardHandKeyword }=指定キーワードを静的に持つ手札のスピリットカード1枚を破棄
          oncePerTurn?: true // 「ターンに1回」。発生源のスピリット1体につきターン1回
          onceScope?: "name" // oncePerTurn と併用。個体でなくプレイヤーごと・カード名ごとに1回（「この効果はターンに1回しか使えない」）
          condition?: "selfInBattle" | "selfAttacking" | "selfBlocking" | { ownAllHaveTeam: string } | { ownAllHaveFamily: string } | { ownTeamAtLeast: { team: string; count: number; restedOnly?: true } } | { soulCoreInReserve: true } | { ownKeishoExcludedTeamAtLeast: { team: string; count: number } } | { selfRested: true } | { summonedBy: string } // 発動条件（selfが現在のバトルの当事者＝attacker/blocker／selfが現在のバトルのブロッカー＝『ブロック中』窓／selfが現在のバトルのアタッカー＝『アタック中』窓（26系【魔述】。地鳴のtriggered selfWasAttackerと同じ判定／自分のスピリット/ネクサスすべてが指定チーム所属。0体では不成立／【X】を持つ自分のスピリットがcount体以上いる。AuraCondition.ownTeamAtLeastと同じ判定／自分のリザーブに[ソウルコア]がある／直近の《継召》で除外した指定チーム所属カードがcount枚以上／発生源自身が疲労状態のときのみ発動できる（26系【Fチェンジ】「疲労状態のこのスピリットを手札に戻し」）／発生源自身の召喚経路が一致するときのみ発動できる（CardInstance.summonedByと突合）
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
          kind: "fushiFreeByExhaust" // 【不死】召喚をこの発生源（未疲労ネクサス）の疲労でコスト無償化（維持コアは通常どおり要る）。対象はカード記載コストがmaxCost以下の【不死】のみ
          // 無償召喚を選んだ場合、召喚時効果は発揮されない（BS15_PLAN.md §7.4）
          levels: number[] | null
          maxCost: number
      }
    | {
          id: string
          kind: "meisai" // 【迷彩：N】「対戦相手は、スピリットの効果でこのスピリットを指定する時、Nコスト支払わなければ指定できない」。
          // 指定する側（対戦相手）がリザーブからコアN個をトラッシュへ支払わなければこのスピリットを対象に取れず、
          // 払えなければ候補から除外される。マジック/ネクサスの効果・持ち主自身の効果には支払い不要。
          // 範囲効果（「すべてに」等）は「指定」ではないので対象外。判定は EffectModules.resistanceAgainst
          // の tryMeisaiToll（サーバー側のみ。候補列挙では払わず、実適用の1点だけで払う）
          keyword?: Keyword // 【迷彩】を持つ参照（spiritHasLabeledKeyword）用のラベル
          levels: number[] | null
          cost: number // 指定時に要求するコア数（リザーブ→トラッシュ）
      }

// カードマスターデータ（不変）。data.md 4 / 6.1 に対応

// マジックの条件（判定は shared/magicCondition.ts）
export type MagicCondition =
    | { ownFamilyCountAtLeast: { family: string; count: number } } // 指定系統を持つ自分のスピリットがcount体以上のときのみ実行
    | { ownFieldHasMinSymbolSpirit: number } // 自分のフィールドにシンボル数がこれ以上のスピリットが1体以上いるときのみ実行
    | { ownFieldSymbolColorsAtLeast: number } // 自分のフィールド全体が持つシンボルの色の種類数（重複除く）がこれ以上のときのみ実行
    | { bothFieldsHaveNexus: true } // お互いのフィールドにネクサスが1つ以上あるときのみ実行
    | { ownSpiritIsBlocking: true } // 自分のスピリットが現在のバトルでブロッカーになっているときのみ実行
    | { ownSpiritCountAtLeast: number } // 自分のフィールドのスピリット数がこれ以上のときのみ実行
    | { ownFieldHasColorSpirits: Color[] } // 自分のフィールドに指定した色のスピリットがそれぞれ1体以上いるときのみ実行（1体が多色で複数色満たしてもよい）
    | { ownFieldHasAllNames: string[] } // 自分のフィールドに指定したカード名すべてが1体ずつ揃っているときのみ実行（cardIdでなく名前の完全一致）
    | { ownNameIncludesCountAtLeast: { names: string[]; count: number } } // 自分のフィールドに names のいずれかをカード名に含むスピリットが count 体以上いるときのみ実行
    | { opponentFieldColorsAtLeast: number; spiritsOnly?: true } // 相手フィールドの色の種類数がこれ以上のときのみ実行
