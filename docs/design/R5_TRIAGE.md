# R5 の仕分け：カード1枚だけで使われているアクション type（2026-09-27）

R5（器の統合）の終わりを決めるための表。終わりの基準は [REFACTOR_PLAN.md](./REFACTOR_PLAN.md) §2.3。

**判定の基準**（2026-09-27 ユーザー了承）
- **Q-A 仲間がいるか**：同じ動詞で対象・量・期間だけが違う type がある／既存の器の組み合わせで書ける → **まとめる**
- **Q-B 共通処理を通っているか**：ゾーンの配列を直接いじり、移動・破壊の共通関数（誘発・耐性・記録）を通っていない → **共通処理に直す**
- どちらでもない（ルールの手順そのものを変える・他に無い記録先を持つ） → **固有として残す**。今後のカードの邪魔にならないので移さない

集計：まとめる 66種（21グループ）／共通処理に直す 6種（全部 G-toDeck と重複）／固有 16種／要相談 9種／対象外 15種

**限界**：Q-B はハンドラ本体を読んだ G-toDeck・G-pay・入れ替え系だけで確かめた。それ以外は型定義のコメントから判定している。
まとめる PR では、着手時にハンドラを読んで判定を確かめる（違ったらこの表を直す）。

---

## 進み具合

| PR | グループ | 消えた type |
| :-- | :-- | :-- |
| #189 | G-toDeck | 6種 → `toDeck` |
| #190 | G-delegate の一部 | `voidCoreToSelf`→`placeCores`、`returnOwnSpiritToHand`→`returnToHand{side own}`、`opponentNexusCoresToTrashOne`→`removeCores{from nexus}`、`discardSelfDownTo`・`discardOpponentDownTo`→`downTo` 軸 |
| #191 | G-compose | `skipBpCompareThenRefreshOne` → `skipBpCompare`＋`refreshOne` |
| #192・#193 | 「指定する」 | `destroyAllByChosenCost`・`exhaustAllByColor`・`refreshByFamilyAuto`・`destroyAllExceptChosenColors`・`returnFieldExceptOpponentChosenColor` → `declare`（DECLARE_UNIFY） |
| #194 | 「指定する」のネクサス3種＋フレイム・エルク | `destroyAllNexusesExceptChosenColors`・`destroyFieldExceptOpponentChosenColor`・`destroyAllNexusesWithCores` と `destroyNexus.chooseColor`・`colorFilter` → `destroyNexus{filter}`（`minCores` 軸） |
| #195 | 「指定する」の系統2種 | `familyChoiceThenBpBuffAll`・`drawPerChosenFamily` → `declare`＋`timedEffect`／カウンタ `ownSpirits` |
| #196 | 「指定する」の継続効果3種 | `colorChoiceLendThisTurn`・`refreshWhenBlockedByChosenColorThisTurn` → `declare`＋`timedEffect` |
| #197 | G-matchCount・G-coresToVoid の一部 | `exhaustOpponentToMatch`・`opponentCoresToVoidByTotal` → カウンタ `minus`・`opponentCoresTotal` |
| #198 | G-perCost | `destroyCostsEachOne`・`destroyOnePerCost`・`destroySpiritBraveNexusEach` → `sequence` |
| #199 | G-existingContent の一部 | `protectLifeByCostThisTurn`・`grantBlockRequiresMagicDiscardThisTurn`・`setOpponentBpAsThisBattle` → `timedEffect` |
| #200 | G-refire・G-borrow | `refireSummonEffect`・`fireOwnDestroyTriggers`・`borrowDestroyEffect`・`borrowSummonEffect` → `fireEffect` |
| #201 | G-millUntil の2種 | `millUntilFamilyToHand`・`millUntilCostSpiritSummonFree` → `mill{until}`＋`takeLast` |
| #202 | G-matchCount の残り・M2 の BS04-022 | `destroyDownToOwnCount` → `destroy{countCounter: minus}`、`coreRemovePerHandDiscard` → `pay`＋`removeCores{targetsCounter}` |
| #203 | G-pay（手元・自分を疲労・手札破棄） | `handMagicToTegamotoDraw`・`revealHandMagicToTegamotoDraw` → `pay`＋`toTegamoto`＋`draw`、`discardHandNexusToVoidCoreSelf`・`exhaustSelfThenLendThisTurn` → `pay` |
| #204 | G-pay（コアを払う） | `coreRemoveByPayingSelfCores`・`coreTradeToOpponentTrash` → `pay`＋`removeCores{count any}`＋カウンタ `lastCores`、`voidCoresAndMillByCost` → `sequence`＋`mill{countCounter lastCost}` |
| #205 | G-pay（戻す・疲労させた BP） | `returnBothSidesToDeckBottom` → `pay`＋`returnToDeckBottom{side,count}`、`returnToHandCostBudget` → `returnToHand{costBudget}`、`bpBuffByExhaustOwn` → `exhaust`＋`bpBuff{amountCounter lastBp}` |
| feat/filter-recorded-sets | 要相談（記録の絞り込み） | `returnBofuExhaustedToDeckBottom`・`returnBofuExhaustedToHand`・`destroyLifeDamager` → 絞り込み `bofuExhausted`・`damagedOwnLife`（内部軸 `instanceIn`）＋`returnToDeckBottom{all}`／`returnToHand{all}`／`destroy` |
| feat/exhaust-nexus-family | 要相談（疲労） | `exhaustOpponentSameFamilyAll`・`exhaustAllOpponentNexuses`・`exhaustSpiritsAndNexusesUpTo` → `exhaust`＋絞り込み `sameFamilyAsDestroyed`／`nexus: "only"｜"also"` |
| feat/pay-peek-mill-color | 要相談（pay・継続効果の色） | `costDiscardNamedThenPeek` → `pay`＋`discardSelfChoose{cardName}`＋`peekOpponentHand`、`millOpponentThenReact` → `sequence`＋`timedEffect{playerRule battle, bannedColors "last"}`、`lifeCharge` の埋め込みコスト → `pay{mill own}`＋`sequence` |
| chore/remove-life-charge | 使われなくなった旧 type | `lifeCharge` → smoke を `placeCores{to life}` へ書き換えて削除 |
| feat/timed-next-refresh | G-refreshBlock の2種 | `markSkipNextRefresh`・`capOpponentTrashCoreReturnNextRefresh` → `timedEffect{duration nextRefresh}`（`markNoRefreshTarget` は期間が違うので残す） |
| feat/recover-from-trash | トラッシュ→手札 | 単純なアクション `toHand{from trash, count, pick}` を新設。`recoverNexusFromTrash` → `toHand{pick nexus}`、`recoverAllMagicFromTrashByColorChoice` → `declare{autoFrom}`＋`toHand{count all}` |
| feat/treat-as-unblocked | ブロックされなかった扱い | `treatAsUnblockedIfBlockerLevel1`・`treatAsUnblockedIfLevelAtLeastBlocker`・`unblockedByVoidSelfCore` → `treatAsUnblocked{when}`（スフィン・クロスは `pay`＋`removeCores{self→void}`） |
| feat/bofu-count-bp | 【暴風】の数ぶんの BP | `bpBuffAllByBofuCount` → `timedEffect{all, own, bp × カウンタ targetBofuCount}`（あとから出たスピリットにも効く。09-28 ユーザー了承）。`bofuCountFor` は shared/rules/keywordState.ts へ |
| feat/return-then-refresh-cost | G-sequence | `returnOneThenRefreshIfMaxCost` → `sequence`＋`returnToHand{1}`＋`if{last cost max 4}`＋`refreshOne`（待機状態に入ったときのコストを記録） |
| feat/destroy-together | G-sequence | `destroyOwnByFamilyThenWipeEnemy` → 組み合わせ方の部品 `simultaneous`＋`destroy{all, side own, family}`＋`destroy{all}` |

**G-delegate・G-sequence・G-compose の残りの振り分け**（09-27 にハンドラを読んで直した）
- 「指定する」部品（色・コスト・系統を1つ指定して後ろで使う）へ：`destroyAllByChosenCost`・`recoverAllMagicFromTrashByColorChoice`・`grantFamilyChoiceAll`（G-exceptColor・G-familyChoice と一緒に）
- ネクサスを対象に取る軸（疲労・破壊の絞り込み）へ：`exhaustAllOpponentNexuses`（要相談の `exhaustSpiritsAndNexusesUpTo` と一緒に）
- トラッシュ→手札へ：`recoverNexusFromTrash`。pay へ：`revealHandMagicToTegamotoDraw`
- ルールの確認待ち：`skipBpCompareThenRefreshOne`（BS06-109 と同じ文面で実装が違う）、`destroyOwnByFamilyThenWipeEnemy`（同時か順か）、`returnOneThenRefreshIfMaxCost`（戻したコストの見方）
- 残す候補（判断が要る）：`mutualKeepChoice`・`bpBuffAllByBofuCount`・`destroyByOwnFamilyCostSet`
- 09-27 に回したもの：G-existingContent の残り6種は、対象の選び方が timedEffect に無い（バトル中のアタッカー・ブレイヴの合体先・相手のネクサスすべて・自分か相手の1体・【氷壁】の色）ので、M8 の決定どおり入口として残す

## 0. 前提整理：timedEffect / PlayerRuleDef の中身（15種、対象外）

`single.py` の一覧には `kind:"timedEffect"` の `content` 配列の要素や `playerRule` の `rule` がそのまま `type` として出てくる。これらは **既に統一された器**（`TimedContent` / `PlayerRuleDef` という1つの判別共用体）のバリアントで、「カード1枚専用の type」ではなく「1枚しか使っていないバリアント」にすぎない。まとめ直す動機がない。

`bounceToDeckTopForPid, cost, freeFushiSummonForPid, handReductionColorAsForPid, ignoreUnblockableForPid, invertBattleWinner, lifeDamageMaxForPid, lifeFloorForPid, lifeImmuneForPid, nexusEffectsDisabledForPid, noBurstSpiritSummonForPid, noLifeDamageByCostForPid, symbolAdd, symbolLoss, symbolSet`

（定義：`server/src/type.ts` 1396-1460行付近。`TimedContent`／`PlayerRuleDef`）

---

## 1. まとめる（グループごと）

### G-borrow：他カードの誘発効果を借りて自分の効果として発揮する
- `borrowCombinedAttackEffect`（BS13-049）／`borrowDestroyEffect`（BS13-052）／`borrowSummonEffect`（BS13-084）
- 型定義コメント同士が「borrowCombinedAttackEffectとは逆で」「もう1つと同様」と互いを参照済み。
- 部品案：`borrowTriggeredEffect{ trigger: "onAttack"|"onDestroy"|"onSummon"; scope: "self"|"otherSpirit"; nameIncludes?: string }` の1種に統合。

### G-millUntil：デッキを条件のカードが出るまで破棄する（プロンプト例と同一）
- `millUntilCostSpiritSummonFree`（BS11-038）／`millUntilFamilyToHand`（BS08-014）／`millUntilMagicCastFree`（BS10-X05）
- 既存の `mill` 部品＋停止条件（`if`／`filter`）＋見つかった後の処理（`sequence`）で書ける。ハンドラは3つとも `server/src/logic/actions/mill.ts` に隣接（11〜193行）。

### G-toDeck：手札／トラッシュのカードをデッキの上下へ（★共通処理に直すも該当）
- `trashCardsToDeckBottom`／`trashSpiritsToDeckBottom`／`trashMagicToDeckTop`／`opponentTrashCardToDeckBottom`／`handToOwnDeckTop`／`opponentHandToDeckTop`
- 実コードを読んで確認：`trashSpiritsToDeckBottom`（trashRecover.ts:15-73）と`trashCardsToDeckBottom`（同82-133）はカード種別フィルタが違うだけの**ほぼ全文コピペ**（`player.trashCards.splice` → `player.deck.push` を2箇所で重複実装）。`handToOwnDeckTop`（drawDiscard.ts:668-709）と`opponentHandToDeckTop`（同717-757）も同様に自分／相手の違いだけで全文コピペ（`player.hand.pop/splice` → `player.deck.unshift`）。`trashMagicToDeckTop`（trashRecover.ts:142-165）と`opponentTrashCardToDeckBottom`（同747-780）も同型。
- 部品案：`moveCardsToDeck{ zone: "hand"|"trash"; side: "self"|"opponent"; position: "top"|"bottom"; count: number; cardType?: CardType }` の1種＋共通ヘルパー関数（配列操作を1箇所に）。

### G-perCost：指定コストごとに1体ずつ処理する
- `destroyCostsEachOne`（BS09-052）／`destroyOnePerCost`（SD02-010）／`destroySpiritBraveNexusEach`（SD06-014）
- `destroySpiritBraveNexusEach`のコメントに明記：「destroyOnePerCostと同型：内部で"destroy"/"destroyBrave"へ委譲」。
- 部品案：`filter`（costs配列に一致）＋既存の単体destroy/destroyBraveのループ。

### G-exceptColor：相手が1色指定し、それ以外を一掃する
- `destroyAllNexusesExceptChosenColors`（BS02-010）／`destroyFieldExceptOpponentChosenColor`（BS15-055）／`returnFieldExceptOpponentChosenColor`（BS15-035）
- `returnFieldExceptOpponentChosenColor`のコメント明記：「destroyFieldExceptOpponentChosenColorの手札バウンス版」。
- 部品案：`filter{ colorNotIn: chosenColor }` ＋ 既存の `destroy{all}` / `returnToHand{all}`。

### G-matchCount：相手の数を自分の数に合わせる
- `destroyDownToOwnCount`（BS08-069）／`exhaustOpponentToMatch`（BS03-139）
- `exhaustOpponentToMatch`のコメント明記：「既存exhaustの単体処理へcountを渡して委譲」＝差分カウントを計算する前段だけの違い。

### G-familyChoice：系統を1つ選んでから一括処理
- `drawPerChosenFamily`（SD02-004）／`familyChoiceThenBpBuffAll`（BS15-073）
- 「optionでfamilyを1つ選ぶ」→「一致する自分のスピリットに一括で作用」という同じ手順。

### G-pay：「〜することで／支払って〜する」（R5で `pay` 部品を新設予定＝CLAUDE.mdに明記済み）
- `bpBuffByExhaustOwn`（BS03-131）／`coreRemoveByPayingSelfCores`（BS12-012）／`coreRemovePerHandDiscard`（BS04-022）／`discardHandNexusToVoidCoreSelf`（BS04-065）／`exhaustSelfThenLendThisTurn`（BS06-052）／`returnToHandCostBudget`（BS14-X04）／`unblockedByVoidSelfCore`（BS15-045）／`voidCoresAndMillByCost`（BS05-083）／`returnBothSidesToDeckBottom`（BS04-104、相互版）／`coreTradeToOpponentTrash`（BS03-124、相互版）
- いずれも「自分が何かを払う（疲労／コア／手札破棄）→効果」の型。`coreRemoveByPayingSelfCores`と`coreRemovePerHandDiscard`は「払った数だけ相手コアを除去」で完全に同型（払うものが違うだけ）。`returnToHandCostBudget`はコメントで既存文書 `INTERRUPTION_POINTS.md` パターンBを明記＝既に一般則がある。
- 部品案：`pay`（コスト側）＋既存効果。相互版2種は「自分がXすることで相手も同数Xされる」の一般形が要る。

### G-refire：破壊／召喚させずにトリガー効果だけ再発揮する
- `fireOwnDestroyTriggers`（BS07-018）／`refireSummonEffect`（BS02-107）
- 「このスピリットのX時」を、Xの発生なしに発揮させる、という同じ考え方（自分全体か対象1体かの違いのみ）。

### G-existingContent：既存の `TimedContent`／`PlayerRuleDef` バリアントで書けるはずのラッパー（新しい器は不要）
- `grantBlockRequiresMagicDiscardThisTurn`（BS13-047）・`requireCoreToBlockThisBattle`（BS11-037）→ 既存 `blockCost{cost,count}`
- `grantBlockerImmunity`（BS01-139）→ 既存 `immune`
- `grantHostUnblockableThisTurn`（BS12-055）→ 既存 `unblockable` ＋ 既存の `target.kind:"braveHost"`
- `levelOverrideOpponentNexuses`（BS02-073）→ 既存 `level{set}` ＋ `target.kind:"rule"`（相手ネクサス全体）
- `markUnblockableByIceWallColorThisTurn`（BS16-079）→ 既存 `unblockable{from: colorFilter}`
- `refreshWhenBlockedByChosenColorThisTurn`（BS11-054）→ 既存 `refreshWhenBlockedBy{color}`（色を選ぶ前段だけが固有）
- `setOpponentBpAsThisBattle`（BS15-X05）→ 既存 `bpAs{levels,amount}`
- `protectLifeByCostThisTurn`（BS07-063）→ コメントに明記：「playerRule "noLifeDamageByCostForPid" を記録する」＝既存 PlayerRuleDef そのもの
- `countAsMultipleThisTurn`（BS05-079）→ 既存 `countAs{count,sourceTypes}`（`anySide` だけ差分）
- これらは「新しい器」を作る話ですらなく、**既存の器へ選択前段（色を選ぶ・対象を選ぶ）を足すだけ**で吸収できる可能性が高い。実装を開いての裏取りが必要（「要相談」に格上げしてもよい）。

### G-delegate：型コメントが既存の多用途 type への委譲・対応版であることを明記
- `destroyAllByChosenCost`（BS14-114）→「destroy{all}へ委譲」
- `destroyAllNexusesWithCores`（BS03-007）→ フィルタ(コア1個以上)＋destroy{all}
- `destroyByOwnFamilyCostSet`（BS12-X06）→ フィルタ(コスト集合一致)＋destroy{all}
- `exhaustAllOpponentNexuses`（BS10-074）→ フィルタ(相手ネクサス全体)＋exhaust{all}
- `discardSelfDownTo`（BS14-089）→「既存discardSelfChooseへ委譲」
- `opponentNexusCoresToTrashOne`（BS14-095）→「nexusCoresToTrashの単体版」
- `recoverNexusFromTrash`（BS10-112）／`recoverAllMagicFromTrashByColorChoice`（BS03-X11）→ どちらも「recoverMagicFromTrashの◯◯版」
- `revealHandMagicToTegamotoDraw`（BS06-054）→「handMagicToTegamotoDrawの単発版」
- `mutualKeepChoice`（BS12-015）→「mutualDestroyChoiceの否定版」
- `grantFamilyChoiceAll`（BS02-064）→「lendSelfThisTurnと同じ貸与」
- `returnOwnSpiritToHand`（BS13-002）→「returnToHandの自陣専用版」
- `bpBuffAllByBofuCount`（BS08-074）→「bpBuffAllByArmorColorsの暴風版」
- `voidCoreToSelf`（BS14-069）→ `placeCores` で書ける（CORE_UNIFY_PLACE.md。当初「固有」と判定したのを 09-27 に訂正）

### G-sequence：既存アクションの直列実行で書ける
- `destroyOwnByFamilyThenWipeEnemy`（BS04-108）→ フィルタ破壊→destroy{all} を `sequence` で繋ぐだけ
- `returnOneThenRefreshIfMaxCost`（BS11-032）→ 相手を1体手札に戻す（既存returnToHand）→ `if`（戻したコストがmaxCost以下）→ 既存 `refreshOne`（フィルタ絞り込み）。CONJUNCTION.md の「そうしたとき」に相当する`if`の条件パターンで書ける

### G-coresToVoid：条件でコア個数を決めてボイドへ
- `opponentCoresToVoidByTotal`（BS02-094）／`battleLoserCoresToVoid`（BS10-065）
- どちらも「対象と個数の決め方」が違うだけで、最終処理は既存の removeCoresToVoid 系。

### G-refreshBlock：相手の回復を封じる（期間違い）
- `markNoRefreshTarget`（BS02-042、疲労中ずっと）／`markSkipNextRefresh`（BS11-055、次の1回だけ）／`capOpponentTrashCoreReturnNextRefresh`（BS12-047、次の1回のトラッシュ→リザーブ上限）
- 既存 `trashCoreReturnCap`（TimedContent、次リフレッシュ限定）とほぼ同型の「相手版・次リフレッシュ限定フラグ」。

### G-compose：既存フラグ＋既存部品の組み合わせ
- `skipBpCompareThenRefreshOne`（BS13-082）→ 既存の `BattleState.skipBpCompare` フラグ＋既存の `refreshOne`

---

## 2. 共通処理に直す（Q-B：配列を直接操作。実際に読んだもののみ）

| type | カード | 直接いじっている箇所 |
| :-- | :-- | :-- |
| trashSpiritsToDeckBottom | BS04-105 | `server/src/logic/actions/trashRecover.ts:29-30,66-67` `player.trashCards.splice` → `player.deck.push` |
| trashCardsToDeckBottom | BS15-082 | `trashRecover.ts:97-98,126-127` 同上（trashSpiritsToDeckBottomと全文重複） |
| trashMagicToDeckTop | BS15-082 | `trashRecover.ts:147-148` `player.trashCards.splice` → `player.deck.unshift` |
| opponentTrashCardToDeckBottom | BS14-113 | `trashRecover.ts:754-755` `oppPlayer.trashCards.splice` → `oppPlayer.deck.push` |
| handToOwnDeckTop | BS09-058 | `drawDiscard.ts:676-677,702-704` `player.hand.splice/pop` → `player.deck.unshift` |
| opponentHandToDeckTop | BS07-013 | `drawDiscard.ts:722-723,749-751` 同上（handToOwnDeckTopと全文重複） |

上記6種は G-toDeck と同一グループ。**まとめる**ことで自動的にQ-Bも解消する（共通ヘルパー1つに集約されるため）。

他に読んだ範囲では `swapOpponentCores`（cores.ts:868-907）が `a.cores = beforeB` 等コアを直接書き換えているが、`isResisted`／`coreFloorFor`／`checkExhaustOnCoreChange`／`destroySpirit`／`notifySpiritCoresRemovedByOpponent` という共通関数群を正しく経由しており、「入れ替え」という処理の性質上コア数の代入自体は避けられない。Q-B違反とは見なさない。

---

## 3. 固有として残す

| type | カード | 理由 |
| :-- | :-- | :-- |
| addSymbolPermanent | BS13-003 | シンボルの永続蓄積は他に無い一意の記録先（extraSymbolsPermanent） |
| destroyBlockerAfterBattle | BS01-104 | 「バトル終了後」という時点への破壊予約。既存の【呪撃】と同じ実行タイミングに乗るがラップする type 自体は他に無い |
| destroyDuplicateNames | BS02-090 | カード名の重複排除という一意の集約ロジック |
| discardOpponentBurst | BS16-X04 | バーストゾーン限定の破棄。手札／トラッシュ破棄と対象ゾーンが異なる |
| endAttackStep | BS01-096 | アタックステップ終了フラグを立てるだけの手順制御。仲間なし |
| extraAttackStep | BS10-008 | アタック＋エンドステップをもう1周する手順制御。仲間なし |
| lifeCoresBySymbolDiff | BS12-X01 | onBlockedでのシンボル差分計算という一意の式 |
| linkNexusCoresChoice | BS02-028 | ネクサス間のコアリンクという一意の記録（coresLinkedTo） |
| magicMirrorRepeat | BS08-080 | 相手の直前マジック効果を再現するという一意の参照（lastMagicCast） |
| negateContinuousMagicByName | BS12-049 | 名前一致でendStepLockを解除する一意の検索 |
| negateOwnBlockConstraint | BS01-119 | 既存の禁止フラグ（cantBlock等）を打ち消す一意の逆操作 |
| randomOpponentHandMagicDiscard | BS10-058 | 「内容を見ずランダムに選び、中身次第で処理を変える」一意の手順 |
| refreshSelfBraveThenCombine | BS13-053 | 回復と合体をセットで行うブレイヴ固有の手順 |
| swapBattler | BS03-138 | バトル参加者を入れ替える一意の手順（ゲームの手順そのものを変える） |
| swapOpponentCores | BS04-053 | 2体間でコアを入れ替える一意の処理（下限チェック等を伴う） |
| markNoRefreshTarget | BS02-042 | 期間が「発生源が疲労状態で場にいる間」で、他に無い（09-28 ユーザー了承） |
| battleLoserCoresToVoid | BS10-065 | バトルで破壊されたスピリットのコアの行き先を変える。今は破壊後にリザーブから引き直す近似（09-28 ユーザー了承） |
| mutualKeepChoice | BS12-015 | お互い1体ずつ指定し、それ以外すべてを破壊。仲間なし（09-28 ユーザー了承） |

---

## 4. 要相談（2026-09-27 に全件決定。「残す」2種以外は 09-28 に実装）

| type | カード | 決定 | 書き方 |
| :-- | :-- | :-- | :-- |
| returnBofuExhaustedToDeckBottom・returnBofuExhaustedToHand | BS06-080・BS14-032 | 部品で書く | TargetFilter に「【暴風】で疲労した」軸（`bofuExhaustedThisBattle` を読む）＋`returnToDeckBottom`／`returnToHand` の `all` |
| destroyLifeDamager | BS16-080 | 部品で書く | TargetFilter に「ライフを減らした」軸（`battle.lifeDamagers`、バースト発動時の分も）＋`destroy` |
| exhaustOpponentSameFamilyAll | BS16-027 | 部品で書く | TargetFilter に「きっかけのスピリットと同じ系統」軸（前例：`sameFamilyAsBattleLoser`）＋`exhaust{all}` |
| exhaustSpiritsAndNexusesUpTo・exhaustAllOpponentNexuses | BS10-018・BS10-074 | 部品で書く | `exhaust` に「ネクサスも対象」軸。エル・クラーケンは対話時に使う人が1つずつ選ぶ（今の優先順位の自動選択をやめる＝挙動が変わる） |
| lifeCharge | BS13-058 | 部品で書く | `pay`（cost＝自分のデッキ5枚破棄、then＝`placeCores{void→life}`＋このバトルの間 Lv1/Lv2 からブロックされない）。デッキ5枚未満では発揮しない |
| costDiscardNamedThenPeek | BS09-039 | 部品で書く | `pay`（`discardSelfChoose` に名前の絞り込み）＋新部品「相手の手札を見ないで1枚選び、内容を見る」 |
| millOpponentThenReact | BS11-060 | 部品で書く | `sequence`（`mill`＋`timedEffect`）。継続効果の色を「直前に破棄したカードの色」から読む軸（`declared` と同じ形。`mill` は lastMoved に書く） |
| deployNexusFromTrashByFieldCores | BS09-065 | 固有として残す | 配置コストの支払い元を変える効果（COST_MODEL §4 の代替支払い）。トラッシュからの配置は「マジックの使用」と一緒に見直す |
| returnToHandEachHeavyArmorColor | BS13-030 | 残す | `forEach`（各〜ごとに）を足すときに一緒に移す |

---

## 5. 集計内訳（グループ別件数、多い順）

| グループ | 件数 |
| :-- | --: |
| G-pay（支払ってから効果。R5で`pay`部品予定） | 10 |
| G-existingContent（既存TimedContent/PlayerRuleDefで代替可） | 9 |
| G-delegate（型コメントが既存typeへの委譲・対応版と明記） | 13 |
| G-toDeck（手札/トラッシュ→デッキ上下。共通処理も要修正） | 6 |
| G-borrow / G-millUntil / G-perCost / G-exceptColor | 各3 |
| G-matchCount / G-familyChoice / G-refire / G-coresToVoid / G-refreshBlock | 各2〜3 |
| G-sequence / G-compose | 各1 |
- G-pay で残したもの（09-27）：`unblockedByVoidSelfCore`（虚獣帝スフィン・クロス。バトル中の「ブロックされなかったものとして扱う」の部品と一緒に）
- 残したもの（09-27）：`borrowCombinedAttackEffect`（イリテバン。借りた効果を自分の効果として発揮・自分を選べるのは2回まで）、`millUntilMagicCastFree`（マジックの使用と一緒に）、`millOpponentThenReact`（破棄したカードの色を継続効果へ渡す部品が要る）
