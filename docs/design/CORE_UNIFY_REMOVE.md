# コアを取り除く28種の実態調査（R3 コア統合・調査役）

対象：`server/src/logic/actions/cores.ts` の「コアを取り除く」系28種。ハンドラ本体を全件 `sed -n` で読んで書いた。
禁止（CORE_UNIFY.md・型ファイル・カードJSON）は開いていない。行番号は今回読んだ本体の位置（元資料と数行前後する場合がある＝関数の宣言行 vs コメント開始行の違い）。

## §0 共通関数のメモ（`server/src/logic/removal.ts`）

- **`canTakeCoresFrom`**（removal.ts:1294）: `isResisted(op:"coreRemove", scope:"area")` を呼ぶだけの薄いラッパー。装甲・マジック効果耐性だけを見る（下限・消滅・誘発は見ない）。範囲効果（候補を自前で走査するもの）が耐性を無視しないための入口
- **`removeCores`**（removal.ts:1315）: 見るもの＝①`isBattlingCoreProtected`（バトル中の保護。0なら発動せず終了）②`coreReturnBonusFor`（リザーブへの加算ボーナス）③`coreFloorFor`（下限。これを下回る分は取れない）。することは＝リザーブへ加算（`coresToOpponentReserveGoToTrash`成立時はトラッシュへ振替）→`checkExhaustOnCoreChange`→`instMinLevelCores`未満なら`destroySpirit(...,"deplete")`→`actorPid!==ownerPid`なら`notifySpiritCoresRemovedByOpponent`。**戻り値＝実際に取れた数**
- **`removeCoresToTrash`**（removal.ts:1370）: `removeCores`とほぼ同じ（保護・下限・消滅・通知）だが行き先はトラッシュ固定、ボーナスは`coreReturnBonusFor(...,true)`（トラッシュ版）
- **`removeCoresToVoid`**（removal.ts:1409）: 同じ保護・下限・消滅・通知の並びだが、リザーブ／トラッシュどちらにも加算しない（ボーナス無し）
- **`coreFloorFor`**（removal.ts:1447）: `globalConstraint:"coreFloorByCost"`（BS08聖なる柱状彫刻）が有効なら`instMinLevelCores`（Lv1コスト＝コア数）を下限として返す。`type!=="spirit"`（ネクサス）は常に0。`ownOnly`・`colorFilter`・`phase`・`turn`条件あり

## §1 1種類1行の表（28行、未確認0件）

| type | 枚数 | 取り先 | 行き先 | 量 | 選ぶ人 | 自動選択順 | 下限/耐性/誘発/消滅 | ほか | 根拠 |
| :-- | --: | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| coreRemove | 51 | 相手/自分(side:own)/両陣営(anySide)、1体 or spreadで複数体1個ずつ | 既定リザーブ／dest:void,trash | count(countCounter可)／all(そのスピリット全部)／leaveAtLeast下限 | 既定owner。spreadでchooserIsTarget時は相手 | 相手側=実効BP最大。spread自動時=コア最多個体から | removeCores系フル（保護・下限・消滅・通知） | drawIfEmptied(0にしたらドロー) | cores.ts:77-278 |
| coreRemoveByPayingSelfCores | 1 | selfのコアを支払い→coreRemove(filter付き)へ委譲 | dest指定に従う | 0〜self.coresをstepper選択、支払った数=除去数 | 発生源owner(自分が払う数を決める) | 非対話時は0個(何もしない) | self減算はdestroySpiritのみ手動。委譲先は通常経路 | なし | cores.ts:285-330 |
| voidCoresFromField | 1 | side(own/opponent)のフィールド(スピ+ネクサス)合計、コア最多から機械的に | ボイド固定 | count個＋コスト分costOwnFieldCoresToVoid個(pay) | 誰も選ばない(対話分岐なし) | コア最多個体固定(唯一の順) | スピリットはremoveCoresToVoid、ネクサスは直接減算(耐性・下限概念なし) | 自分側コストも同じ関数で消費 | cores.ts:333-396 |
| coreDrainToLowerLevel | 1 | 相手1体(targetInstanceId優先/自動=実効BP最大) | トラッシュ固定 | 現コア-(1つ下のLv必要コア数)。Lv1は不発 | 発生源owner | 実効BP最大 | askPayToNegateIfNeeded→resistanceAgainst(targeted)→removeCoresToTrash | なし | cores.ts:400-447 |
| coreRemoveMulti | 7 | 相手。allTargets=条件一致すべて／自動targets体=実効BP上位から重複なく | dest既定リザーブ／void／trash | count(対象1体あたり) | 発生源owner(tryInteractiveTargetChoiceで1体ずつ再入) | 実効BP上位から | 個体ごとにresistanceAgainst(targeted)→removeCores系 | costFilter/keywordExclude絞り込み | cores.ts:450-538 |
| coreRemoveSelf | 1 | self固定 | リザーブ固定 | count | 選択なし | (該当なし) | removeCores(actorPid省略=通知なし) | なし | cores.ts:549-558 |
| coreToTrashSelf | 4 | self固定 | トラッシュ固定 | count | 選択なし | (該当なし) | removeCoresToTrash(actorPid省略) | なし | cores.ts:560-570 |
| coreSqueezeAll | 2 | 両陣営の全スピリット(コア>1すべて) | リザーブ固定 | 各自コア-1 | なし(範囲効果) | (該当なし、全数処理) | canTakeCoresFromで事前フィルタ→removeCores | 相手陣営が影響を受けた分notifySpiritCoresRemovedByOpponent | cores.ts:857-889 |
| coreSqueezeOne | 10 | 相手count体(BP上位)／all=相手全部／anySide=両陣営から選択可 | 既定リザーブ／dest:trash | 各対象コア-1 | anySide時はowner側が選ぶ(chooserPid指定なし) | 実効BP最大(count回) | anySide解決時はresistanceAgainstを個別呼出し。removeCores/ToTrash | なし | cores.ts:891-964 |
| coreToVoidOwn | 1 | 自分(トラッシュのコア優先→フィールド実効BP最小のスピリット) | ボイド固定 | count | なし(対話分岐なし) | (該当なし、機械的) | ⚠️removeCores系を通らず直接cores-=。destroySpiritのみ手動 | なし | cores.ts:966-999 |
| bothSidesCoreToTrash | 2 | 両陣営(bothSidesPids)各自コア最多個体から繰越 | トラッシュ固定 | 陣営ごとcount | なし(範囲効果) | コア最多から繰越 | canTakeCoresFrom事前フィルタ→removeCoresToTrash | なし | cores.ts:1001-1042 |
| coreDrainAllOthers | 2 | self以外の全スピリット(両陣営) | リザーブ固定 | 各1個 | なし | (該当なし、全数処理) | removeCores(actorPid=owner) | 消滅数分rewardDrawならドロー、無ければselfにボイドから同数コア追加 | cores.ts:1097-1140 |
| voidCoresAndMillByCost | 1 | 自分1体(familyFilter一致、自動=コスト最大) | ボイド固定 | 対象のコアすべて | 発生源owner(候補2体以上でrequestChoice) | コスト最大 | ⚠️target.cores=0を直接代入(removeCoresToVoidを通らない＝保護・下限を素通り)。destroySpiritだけ自前チェック | millDeck(相手デッキを対象コストと同枚数破棄) | cores.ts:1218-1258 |
| coreRemoveDistributed | 2 | 相手、count個を1個ずつ複数体へ配分(候補=floor超過かつisResisted除外) | coreRemove{count:1,dest,leaveAtLeast}へ委譲 | 1個ずつcount回 | 既定owner／chooserIsTarget時は相手 | ⚠️chooserIsTarget時=コア最多／既定時=コア最少 | 委譲先coreRemoveの経路(removeCores系) | なし | cores.ts:1290-1343 |
| coreToOpponentTrashChoice | 3 | 相手のスピリット1体／ネクサス1つ(spiritsOnly時はスピリットのみ)／includeReserve時はリザーブも候補 | トラッシュ固定 | count | 既定owner／chooserIsTarget時は相手 | ⚠️自動選択ロジックなし。常にrequestChoiceで選択要求(interactiveTargets判定なし) | 初回候補作成時にスピリットだけisResisted(targeted)で事前除外。ネクサス/リザーブは無条件 | なし | cores.ts:1345-1410 |
| coreTradeToOpponentTrash | 1 | 自分のリザーブ(支払い)＋相手のリザーブ(同数) | 両者トラッシュ固定 | X=1〜min(自分リザーブ,相手リザーブ)を選択(option、0個スキップ可) | 発生源owner(自分が払う数を決める=pay) | 非対話時は上限個(min)を実行 | リザーブのみでremoveCores系は通らない | なし | cores.ts:1554-1599 |
| coreRemoveAllOpponent | 1 | 相手スピリットすべて(isResisted area除外) | dest既定リザーブ／void／trash | 対象ごとmin(count,現コア) | なし(範囲効果) | (該当なし、全数処理) | removeCores系を通すが⚠️removeCores呼び出し時にsrcType未指定(他typeはsrcTypeを渡す) | なし | cores.ts:1606-1620 |
| coreToTrashAllByCost | 1 | 相手のコストmaxCost以下すべて(isResisted area除外) | トラッシュ固定 | 対象ごと1個 | なし | (該当なし、全数処理) | removeCoresToTrash | なし | cores.ts:1622-1636 |
| coreRemovePerHandDiscard | 2 | 相手(1枚破棄につき1体、実効BP最大、既選択個体は除外) | トラッシュ固定 | 破棄枚数と同数、1個ずつ | 手札破棄は発生源owner(requestCardChoiceで1枚ずつ、任意継続) | 実効BP最大 | pickEnemyByBp経由(装甲耐性込み)→removeCoresToTrash | canDiscardHand制約チェック。非対話時は手札全部破棄→一括除去(決定的簡略化) | cores.ts:1638-1700 |
| opponentCoresToTrash | 3 | 相手のリザーブ優先→フィールドのコア最多個体へ繰越(reserveAll時はリザーブのみ) | トラッシュ固定 | count(reserveAll時は全部) | なし(合計効果) | コア最多から繰越 | canTakeCoresFrom事前フィルタ→removeCoresToTrash | なし | cores.ts:1702-1745 |
| destroyerCoresToTrash | 2 | targetInstanceId(fieldEventが渡す「自分を破壊した相手」)固定1体 | トラッシュ固定 | 対象のコアすべて | なし(イベント対象固定) | (該当なし) | removeCoresToTrash(耐性判定なし＝既に破壊成立後) | なし | cores.ts:1748-1760 |
| opponentNexusOrReserveCoreToTrash | 1 | 相手のネクサス(コア>0)またはリザーブ | トラッシュ固定 | count | 発生源owner(「相手は」の記載なし)。取り先が2つ以上のときだけkind:optionで聞く | コア最多ネクサス→無ければリザーブ | ネクサス・リザーブとも直接減算(耐性・維持コア概念なし) | なし | cores.ts:2082-2148 |
| bothSidesCoreToVoid | 1 | 両陣営(bothSidesPids)スピ+ネクサス、コア最多から繰越 | ボイド固定 | 陣営ごとcount | なし | コア最多から繰越 | スピリットはcanTakeCoresFrom事前フィルタ→removeCoresToVoid(消滅処理あり)。ネクサスは直接減算(消滅処理なし) | なし | cores.ts:2153-2205 |
| coreToVoidEqualizeByTotal | 1 | 合計コア(フィールド+リザーブ+トラッシュ)が多い側1陣営 | coresDownToLimitへ委譲(limit=少ない方の合計) | 差分を自動計算 | 委譲先coresDownToLimitに従う | 委譲先に従う | 委譲先に従う | なし | cores.ts:2363-2376 |
| opponentCoresToVoidByTotal | 1 | 相手のリザーブ/トラッシュ/フィールド個体(コア>0、装甲耐性除外)から1個ずつ | ボイド固定 | tiers(合計コアの段階)で決まるcount | **相手(コアを失う側)**がkind:optionで1個ずつ選ぶ(chooserPid=opp) | リザーブ→トラッシュ→フィールド(コア最多)の順(autoTakeCoresToVoid) | coreSourcesOfで装甲耐性事前フィルタ、スピリットはremoveCoresToVoid、ネクサスは直接減算 | なし | cores.ts:2378-2452 |
| coresDownToLimit | 1 | sides配列の順に1陣営ずつ、その陣営のリザーブ/トラッシュ/フィールド個体から1個ずつ | ボイド固定 | 合計がlimit以下になるまで(残りは毎回数え直す) | **その陣営の持ち主**がkind:optionで選ぶ(chooserPid=pid) | opponentCoresToVoidByTotalと同じ順(共通ヘルパー)、上限を切るまでループ | 同上(coreSourcesOf/removeCoresToVoid) | なし | cores.ts:2457-2527 |
| moveCoresLeavingOne | 2 | 対象1体(selfTarget固定/targetInstanceId/anySide自動=BP最大/既定=相手BP最大) | 同じフィールドの別スピリット(先頭側)、allowNexusDest時はネクサス(先頭側) | 対象コア-keep(keep=max(1,coreFloorFor))を丸ごと移動 | なし(移し先も対象選択もBP自動のみ、対話分岐なし) | (該当なし、機械的) | coreFloorForのみ直接参照。cores-=/+=を直接操作(removeCores系は通らない) | なし | cores.ts:2533-2577 |
| swapOpponentCores | 1 | 相手のスピリット2体(isResisted area除外) | 2体間で入れ替え(ゾーン移動ではない) | 全コア交換 | 発生源owner側が2体とも指定(tryInteractiveTargetChoiceで1体目→2体目) | 実効BP上位2体 | coreFloorForを両者について直接判定(下回るなら入れ替え自体を中止)。減った側にcheckExhaustOnCoreChange+destroySpirit+notifyを手動適用(removeCores系は通らない) | なし | cores.ts:2581-2680 |

## §2 挙動の食い違い

1. **「複数体から合計N個を1個ずつ」の自動選択の向きが逆**：`coreRemove`のspread（対象は相手、anySide無し）は非対話時「コア最多」の個体から取る（cores.ts:151 `richest`）。一方`coreRemoveDistributed`（同じく「相手のスピリットから合計count個を1個ずつ」の形。SD01-013・SD01-029、2枚）は`chooserIsTarget`が無いとき「コア最少」の個体から取る（cores.ts:1332）。両者は同じ「合計N個を配分」という形なのに、非対話の決定が逆向き。影響枚数：coreRemoveのspread指定分（未集計。51枚のうち一部）＋coreRemoveDistributed2枚
2. **「相手は」の効果で選ぶ人がバラバラ**：`opponentCoresToVoidByTotal`（BS02-094ブラッディレイン、1枚）は効果文「相手はその中から◯個をボイドに置く」通りに相手が選ぶ（chooserPid=opp）。`coresDownToLimit`（BS10-019、1枚）も「相手は」「自分は」の段をそれぞれの持ち主に選ばせる。一方`coreRemoveDistributed`はSD01-013の効果文が「相手は、相手のスピリット上のコア3個を相手のリザーブに置く」（主語「相手は」）なのに、`chooserIsTarget`をカード側が付けているかは**カードデータ未読のため確認できていない**（cores.ts側は両対応の分岐を持つ。CHOOSER_RULES.md §1の一般則に沿っているかはデータ側の設定次第）
3. **removeCores系（保護・下限・消滅・通知）を通らない手直し系が4種**：`coreToVoidOwn`（フィールドから取る分）、`voidCoresAndMillByCost`（`target.cores=0`を直接代入）、`moveCoresLeavingOne`、`swapOpponentCores`。いずれも「取り除く」ではなく「消す／移す／入れ替える」という別カテゴリの動きだが、`isBattlingCoreProtected`（バトル中のコア保護）をこの4種は一切見ていない（`coreFloorFor`は`moveCoresLeavingOne`と`swapOpponentCores`だけ個別に見ている）。影響枚数：4枚（各1〜2枚）
4. **`srcType`の受け渡し漏れ**：`coreRemoveAllOpponent`（BS16-056、1枚）の`removeCores`呼び出しだけ`srcType`引数を渡していない（cores.ts:1620付近）。同じ「範囲効果でremoveCores系を呼ぶ」他のtype（`coreToTrashAllByCost`・`bothSidesCoreToTrash`等）は渡している
5. **効果文と実装の対応が一段間接的なもの**：`voidCoresAndMillByCost`は効果文「コアすべてをボイドに置く」を`removeCoresToVoid`ではなく直接代入で実現しており、（3）と同じ論点だがこちらは「そのスピリットのコアをすべて0にする」という全消し系なので他の「取り除く」typeと挙動の粒度が異なる（対象が1体・保護/下限を無視する点が唯一）

## 最終報告用サマリ

| 項目 | 内容 |
| :-- | :-- |
| §1行数 | 28行（未確認0件） |
| §2項目数 | 5件（上位3件：①spread系の自動選択順が逆、②「相手は」の選択者がカード側設定に依存、③removeCores系を通らない4 type） |
| 相談事項 | (a) coreRemoveDistributed既定時の自動選択（コア最少）とcoreRemove spread（コア最多）のどちらが正か、(b) SD01-013にchooserIsTargetが付いているかはカードデータ側で別途確認要、(c) coreToVoidOwn/voidCoresAndMillByCost/moveCoresLeavingOne/swapOpponentCoresの「バトル中保護を見ない」を統合後も踏襲するか |

## §3 確定スキーマ `removeCores`（2026-09-26。名前を変えない）

```ts
| { type: "removeCores"
    side?: "opponent" | "own" | "any" | "both"   // 既定 opponent。any＝両陣営の中から選ぶ、both＝お互いそれぞれ（各持ち主が自分の分を選ぶ。ターンプレイヤーから）
    from?: ("spirit" | "nexus" | "reserve" | "trash" | "life")[]   // 既定 ["spirit"]。複数なら選ぶ人が1個ずつどこから取るか選ぶ。"life" は side "own" で単独だけ（「自分のライフのコアを置くことで」のコスト。止める判定は lifeCostBlockedByFloor＝COST_MODEL §9。2026-09-27）
    to?: "reserve" | "trash" | "void"   // 既定 reserve（持ち主の）
    target?: "one" | "spread" | "all" | "self" | "event"   // 既定 one。spread＝複数体から合計 count を1個ずつ、event＝誘発のきっかけの個体
    targets?: number; filter?: TargetFilter
    count: number | "all" | "toLowerLevel"; countCounter?: EffectCounter
    leaveAtLeast?: number   // 1体に最低残す数（「0個にはできない」＝1）
    downTo?: number | "equalize"   // 合計（from の全ゾーン）がこの数以下になるまで。equalize＝お互いの合計を比べて多い方が少ない方に揃える
    chooser?: "owner" }   // 「相手は」＝コアを失う側が選ぶ。既定は効果の使用者
```

規則（ACTION_VOCABULARY §4 に書いたユーザー確認どおり）：選ぶ人の得になる自動選択（使用者が選ぶ＝スピリットのコア最少→ネクサス→リザーブ→トラッシュ、相手が選ぶ＝その逆でスピリットはコア最多）／
スピリットから取るときは必ず removal.ts の共通処理（保護・下限・消滅・通知。行き先ごとに removeCores／removeCoresToTrash／removeCoresToVoid／takeCoresFromSpirit）／
耐性は既存 coreRemove の判定を踏襲（one・targets＝対象を取る、spread・all＝範囲）。

| 旧 type（枚数） | 書き方 |
| :-- | :-- |
| coreRemove（51） | side（anySide→any・side own→own）・target（spread→spread、all:true→count "all"）・to（dest）・chooser（chooserIsTarget→owner）・leaveAtLeast・countCounter・filter をそのまま。**drawIfEmptied・costDiscardOwnBurst を持つものは if／pay がそろうまで旧 type のまま** |
| coreRemoveMulti（7） | target one・targets・filter（costFilter→cost） |
| coreRemoveSelf（1）／coreToTrashSelf（4） | side own・target self・to reserve／trash |
| coreSqueezeOne（10）／coreSqueezeAll（2） | 「コアを1個だけ残す」＝count "all"・leaveAtLeast 1。target one（targets＝旧 count）／all（旧 all:true）。anySide→any、to（dest）。Squeeze All は side both・target all |
| coreRemoveDistributed（2） | target spread・leaveAtLeast・chooser |
| coreRemoveAllOpponent（1）／coreToTrashAllByCost（1） | target all（後者は filter maxCost・count 1・to trash） |
| coreToOpponentTrashChoice（3） | from [spirit, nexus]（spiritsOnly→[spirit]）・to trash・target one・chooser。includeReserve（BS03-075 犬人マードック「フィールド/リザーブから」）は from [spirit, nexus, reserve]・target spread |
| opponentCoresToTrash（3） | from [spirit, nexus, reserve]・to trash・target spread（reserveAll→from [reserve]・count "all"） |
| opponentNexusOrReserveCoreToTrash（1） | from [nexus, reserve]・to trash・target spread |
| coreToVoidOwn（1） | side own・from [spirit, nexus, trash]・to void・target spread |
| bothSidesCoreToTrash（2）／bothSidesCoreToVoid（1） | side both・target spread・chooser owner（「お互い、それぞれの」）。BS01-087 は使用者が「指定する」ので target one・chooser 無し。to trash／void（後者は from [spirit, nexus]） |
| destroyerCoresToTrash（2） | target event・count "all"・to trash |
| coreDrainToLowerLevel（1） | count "toLowerLevel"・to trash |
| voidCoresFromField（1） | pay { cost: removeCores{side own・from [spirit, nexus]・to void・spread・count 3}, then: removeCores{同・side opponent・count 4} }。**pay の対応一覧（actions/pay.ts の PAYABLE_TYPES）に removeCores を足すまで旧 type のまま** |
| coresDownToLimit（1）／coreToVoidEqualizeByTotal（1） | from 4ゾーン・to void・downTo（5／equalize）・chooser owner。前者は相手→自分の sequence |

**旧 type のまま残す9種**（組み合わせの器が足りない）：coreRemoveByPayingSelfCores・coreTradeToOpponentTrash・coreRemovePerHandDiscard（量が支払いで決まる pay）／
coreDrainAllOthers・voidCoresAndMillByCost・opponentCoresToVoidByTotal（直前の結果・段階の if）／moveCoresLeavingOne・swapOpponentCores（取り除くではなく移動・入れ替え）。
voidCoresAndMillByCost・moveCoresLeavingOne・swapOpponentCores・coreToVoidOwn の「保護・下限を見ない」は、残す種類も含めて直す（ユーザー確認 §4）。
