// プレイヤーの操作 GameAction（クライアントからサーバーへ送る1手）
import { PaySource } from "../type";

export type GameAction =
    | { type: "summon"; handIndex: number; level?: number; paySources?: PaySource[]; substituteInstanceId?: string; discardHandIndices?: number[]; braveTargetInstanceId?: string; altSummonNexusInstanceIds?: string[]; shinsokuAssistInstanceIds?: string[]; exReductionTrashIndices?: number[]; paySoulCoreFromReserve?: boolean; placeSoulCoreFromReserve?: true } // paySoulCoreFromReserve指定時はリザーブの[ソウルコア]をコスト支払い1個ぶんとして使う（ソウルコアはトラッシュへ）。placeSoulCoreFromReserve指定時は[ソウルコア]を**コストでなく維持コアとして**召喚したスピリットに置く（通常コアがコスト+残りの維持コアを担う。2026-10-06 ユーザー確定。両方の同時指定は不可）。**《真界放》マーカー付きカードではwaiver配置**＝[ソウルコア]1個のみを置く（level指定を問わず1コア。placedCoresForSummon。2026-10-07 ユーザー裁定。レベル選択の3パターン「Lv1分置く/Lv2分置く/Lv2を[ソウルコア]で置く」の3つ目） // exReductionTrashIndices指定時は《継召》(kind:"exTrashReduction")：トラッシュのEXシンボル持ちカード（trashCards内インデックス）を除外して1枚につき召喚コスト1を軽減する。候補は shared/cost.ts の exTrashReductionCandidateIndices // shinsokuAssistInstanceIds指定時はkind:"shinsokuPayAssist"（BS16-021）：疲労させることで召喚コストの一部を肩代わりする（【神速】召喚限定） // braveTargetInstanceId指定時は**ダイレクトブレイヴ**＝そのスピリットに合体した状態でブレイヴを召喚する（維持コアを置かない。docs/design/BRAVE.md §5）。省略時、ブレイヴは単体のスピリットとして召喚される // discardHandIndices指定時は、その手札を破棄して**1枚につきコスト1**を支払う（BS08ビクティム）。省略時は従来どおり「コアで足りない分を自動で手札破棄に回す」（非対話・旧クライアント互換） // 召喚（神速持ちはフラッシュ時も可）。level指定時はそのレベルに必要なコア数をリザーブから置いて召喚する（省略時はLv1）。substituteInstanceId指定時は kind:"battleSwapSummon" の召喚＝バトル中の自分のスピリット1体を手札に戻し（追加コスト）、その代わりに疲労状態で召喚してバトルを引き継ぐ（召喚コストは通常どおり必要。発動可否は shared/rules.ts の canBattleSwapSummon で判定できる。BS07ブラックカラカロッサム） // altSummonNexusInstanceIds指定時は kind:"altSummonFromHand" の代替召喚＝指定したネクサス（自分の色一致・cost.countぶん）を自分のデッキの下に戻すことを支払いとし、召喚コストは支払わない（維持コアはリザーブから通常どおり置く。発動可否は shared/rules.ts の canAltSummonFromHand で判定できる。BS10-058水星神龍メルクリウス・サーペント）
    | { type: "resshinsokuSummon"; handIndex: number } // 【烈神速】：お互いのアタックステップ、トラッシュのコア5個以上を自分のフィールド/リザーブに好きに置くことで、コストを支払わずに召喚する（BS16-X03）。置き先は distributeCores の選択で1個ずつ決める
    | { type: "setBurst"; handIndex: number } // バーストのセット。自分のターンのメインステップ限定・ターン1回（docs/design/BURST.md）。既にセット済みなら旧カードをトラッシュへ送ってから新しいものをセットする
    | { type: "setNexus"; handIndex: number; level?: number; paySources?: PaySource[]; millPay?: number; paySoulCoreFromReserve?: boolean; placeSoulCoreFromReserve?: true } // paySoulCoreFromReserve指定時はリザーブの[ソウルコア]を配置コスト支払い1個ぶんとして使う。placeSoulCoreFromReserve指定時は[ソウルコア]を維持コアとして配置したネクサスに置く（2026-10-06。両方同時は不可）。**《真界放》マーカー付きネクサスではwaiver配置**＝[ソウルコア]1個のみを置く（summonと同じ。placedCoresForSummon。2026-10-07） // millPayは配置コストの支払い方法の選択（BS04栄光の表彰台）。0＝コアで払う／実効コストと同じ値＝その枚数だけデッキを上から破棄して払う。**中間の枚数は不可**（併用できない）。省略時は「コアで足りるならコア、足りなければ全額デッキ破棄」 // 配置。level指定時はそのレベルに必要なコア数をリザーブから置いて配置する（省略時はLv1）
    | { type: "castMagic"; handIndex: number; targetInstanceId?: string; paySources?: PaySource[]; fromTegamoto?: boolean; exReductionTrashIndices?: number[]; paySoulCoreFromReserve?: boolean; useSoulCoreOnly?: true } // useSoulCoreOnly指定時は「自分の◯シンボルがあれば[ソウルコア]だけで使用できる」（kind:"soulCoreOnlyCast"）: フィールドに該当色シンボル＋リザーブの[ソウルコア]1個でコスト全額を支払う（通常コア・軽減・paySourcesは使わない） // paySoulCoreFromReserve指定時はリザーブの[ソウルコア]を使用コスト支払い1個ぶんとして使う // exReductionTrashIndices指定時は《継召》(kind:"exTrashReduction")：トラッシュのEXシンボル持ちカード（trashCards内インデックス）を除外して使用コストを軽減する（summonと同じ仕様。2026-10-05ユーザー確定）。fromTegamoto指定時はhandIndexが手元(tegamoto)のインデックスを指す（手元からの使用でも《継召》は有効）
    | { type: "useHandAbility"; handIndex: number; effectId: string } // 手札にあるカードを使う効果（kind:"handActivated"。マジックではない。BS15-011ミーアバット）。検証は validateHandFlash（フラッシュマジック・【神速】と共有）＋手札の実在・タイミングだけ
    | { type: "swapSoulCore"; fromInstanceId: string; toInstanceId: string } // メインステップの1:1交換（docs/design/SOULCORE.md §1.4）: [ソウルコア]が載った自分の個体1つと、通常コア1個以上を持つ自分の個体1つの間で「[ソウルコア]1個と通常コア1個」を同時に交換する。消滅判定は挟まない（「同時に移動している」ため）。コア増加の誘発（夢魔の寝所）は両方の個体に発火する
    | { type: "moveCore"; instanceId: string; direction: "add" | "remove"; confirmDeplete?: true; soulCore?: true } // soulCore指定時は[ソウルコア]を動かす（add=リザーブの[ソウルコア]をこの個体へ置く／remove=この個体の[ソウルコア]をリザーブへ戻す。docs/design/SOULCORE.md §1.4と同じメインステップの自由なコア移動の一部。通常コアの数値は一切不変でポインタだけ移る。removeで維持コアを割るときはconfirmDepleteが要る）。confirmDeplete指定時は、維持コア（Lv1）を下回るコアの取り除きを許可し、そのスピリットを消滅させる（コアを他へ回すために自分のスピリットをあえて退かせる操作。クライアントが確認を取ってから送る。2026-08-23 ユーザー要望）
    | {
          type: "awaken" // 覚醒：fromInstanceId のコアを instanceId へ移す
          instanceId: string
          fromInstanceId: string
          count: number
      }
    | { type: "combineBrave"; braveInstanceId: string; hostInstanceId: string } // メインステップの任意合体（docs/design/BRAVE.md §6.4）。スピリット状態のブレイヴを自分のスピリット1体へ合体させる。ブレイヴが載せていたコアは**リザーブへ戻す**（§1.1 の出典とは異なる。分離でリザーブから払うことと対称にするための決定）。合体先の候補は shared/summon.ts の braveCombineCandidates を通す（サーバーとUIで判定を共有する。§5.0）
    | { type: "detachBrave"; braveInstanceId: string; paySources?: PaySource[] } // メインステップの任意分離（§6.4）。⚠️ **Effect の "detachBrave"（効果による分離。コア不要）とは別物**。こちらは braveKeepCores（スピリット状態のLv1維持コスト）以上のコアを置く必要がある。paySources 省略時はリザーブから自動で払い、リザーブが足りなければ拒否する（クライアントは支払いUIへ入って paySources を付けて再送する）
    | { type: "attack"; instanceId: string; targetSpiritInstanceId?: string; paySources?: PaySource[]; paySoulCoreFromReserve?: boolean } // paySources＝制約 attackPayToll の支払いをフィールドのコアからも払う（省略時はリザーブから）。 targetSpiritInstanceId 指定時は指定アタック（canDirectAttack 持ちのみ）
    | { type: "block"; instanceId: string; paySources?: PaySource[]; paySoulCoreFromReserve?: boolean } // paySources＝ブロックの追加コスト（制約 blockPayCost）をフィールドのコアからも払う。省略時はリザーブから払う
    | { type: "activateAbility"; instanceId: string; effectId: string } // 起動能力の発動（kind:"activated"、コストを払って任意発動する能力）
    | { type: "resolveChoice"; instanceId?: string; option?: string; cardIndex?: number; paySources?: PaySource[]; paySoulCoreFromReserve?: boolean } // pendingChoice への応答（kind:"target"はinstanceId、kind:"option"はoption、kind:"card"はcardIndex。すべて省略＝スキップ。optionalのときのみ許可）。// paySources指定時は、選んだカードの召喚コストをフィールドのコアからも支払う（「コストを支払って召喚できる」起動効果＝summonFromHandFreeのpayCost。通常の召喚と同じ支払いUIから送られる。2026-08-23）
    | { type: "setPayToNegate"; enabled: boolean } // ⚠️ **廃止予定・効果は無い**（2026-08-17。効果ごとに聞く形へ移した）。UI からトグルが消えたら PlayerState.payToNegate ごと削除する。// 「手札を破棄して効果を受けない」（BS08竜騎集う円卓Lv2）を払うかどうかの方針を切り替える。
    // 効果の判定自体は装甲と同じ同期の述語なので、**その場で聞くのではなく、あらかじめ盤面の状態にしておく**（PlayerState.payToNegate）。
    // 手順の外側の操作なので、自分のターンでなくても選択待ち中でも受け付ける。既定は true（従来どおり払って防ぐ）
    | { type: "takeLife" }
    | { type: "pass" } // フラッシュの優先権を相手に渡す
    | { type: "nextPhase" } // main → attack
    | { type: "endTurn" }
    | { type: "surrender" }
