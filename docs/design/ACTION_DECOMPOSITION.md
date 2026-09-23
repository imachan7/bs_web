# アクション type の分解（REFACTOR_PLAN §2.1 ④）

[ACTION_VOCABULARY.md](./ACTION_VOCABULARY.md) の一覧に、既存の EffectAction の type 329種を1行ずつ割り振る。
これが器の統合（M1〜M6）の作業リストになる。

**いまの表は名前の単語だけから機械的に割り振った下書き**（2026-09-23）。定義もハンドラも読んでいない。

| 状態 | 意味 | 件数 |
| :-- | :-- | --: |
| 自動 | 名前から1つのアクションに割り振れた。**軸の欄は名前から拾っただけなので、定義を読んで直す** | 246 |
| 要確認 | 組み合わせ（`pay`・`ifLast`・`sequence`・`countCounter`）を含むか、一覧に無いアクション | 83 |

使用枚数はカードデータでその type を使っているカードの枚数。0 は中断・再開用の内部 type。

## 一覧に無い種類（④の中で決める）

名前から割り振ると、ACTION_VOCABULARY の一覧に無い種類がまとまって出た。

- **期間つきの付与・制約**（72種）：`grant*`・`mark*`・`ban*`・`lend*` など。「このターンの間〜できない／〜として扱う」。
  単純なアクションではなく、`EffectDef` の継続効果（`constraint`・`turnConstraints`）を期間つきで置く形に寄せられないかを調べる
- **バトル・ステップの進行**（16種）：`endBattle`・`battleCompare*`・`extraAttackStep` など
- 一覧に無いゾーン移動3つ：手札をデッキへ（`handToOwnDeckTop` ほか）、トラッシュをデッキへ（`trashCardsToDeckBottom` ほか）、マジックの使用（`castMagicFromTrashByColor` ほか）

## 次の手順

1. 調査役：「要確認」と「一覧に無い種類」の行を、定義（`server/src/types/effectAction.ts`）とハンドラを読んで埋める。
   「自動」の行も軸を定義に合わせて直す
2. メインループ：判断が割れる行だけユーザーに確認する
3. この表から M1〜M6 の PR の単位を切る

## 表

| type | 使用枚数 | 分類 | アクション | 軸（名前から） | 組み合わせ | 状態 |
| :-- | --: | :-- | :-- | :-- | :-- | :-- |
| `deckReveal` | 17 | ゾーン移動 | オープン |  |  | 自動 |
| `revealAndSummonAllByFamily` | 3 | ゾーン移動 | オープン | すべて・filter：系統 | sequence | 要確認 |
| `revealAndSummonKeyword` | 2 | ゾーン移動 | オープン | filter：キーワード | sequence | 要確認 |
| `openOwnBurstActivateIfSummonCond` | 1 | ゾーン移動 | オープン | 陣営：自分 | ifLast | 要確認 |
| `revealAndPlaceNexusFree` | 1 | ゾーン移動 | オープン | コストなし・対象：ネクサス | sequence | 要確認 |
| `revealAndSummonAllByKeyword` | 1 | ゾーン移動 | オープン | すべて・filter：キーワード | sequence | 要確認 |
| `revealHandMagicToTegamotoDraw` | 1 | ゾーン移動 | オープン | 手元 |  | 自動 |
| `revealOpponentDeckPickBottomRestTop` | 1 | ゾーン移動 | オープン | 陣営：相手 | sequence | 要確認 |
| `revealOwnBurstThenSortByType` | 1 | ゾーン移動 | オープン | 陣営：自分 | sequence | 要確認 |
| `revealTopBurstOneToHandRestBottom` | 1 | ゾーン移動 | オープン | to：手札 | sequence | 要確認 |
| `revealTopCastMagicFreeOrHand` | 1 | ゾーン移動 | オープン | コストなし |  | 自動 |
| `revealTopFamilyToHand` | 1 | ゾーン移動 | オープン | filter：系統・to：手札 |  | 自動 |
| `revealTopSummonFreeByFamily` | 1 | ゾーン移動 | オープン | filter：系統・コストなし |  | 自動 |
| `revealTopSummonFreeOrHand` | 1 | ゾーン移動 | オープン | コストなし |  | 自動 |
| `revealTopSummonFreeOrReturnToDeck` | 1 | ゾーン移動 | オープン | コストなし |  | 自動 |
| `revealTopToHandIfColorSpiritElseReturnToDeck` | 1 | ゾーン移動 | オープン | filter：色・to：手札 | ifLast | 要確認 |
| `revealTopToHandThenRefreshOwn` | 1 | ゾーン移動 | オープン | 陣営：自分・to：手札 | sequence | 要確認 |
| `mill` | 16 | ゾーン移動 | トラッシュに置く（破棄） |  |  | 自動 |
| `discardOpponent` | 14 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手 |  | 自動 |
| `millPer` | 10 | ゾーン移動 | トラッシュに置く（破棄） |  | countCounter | 要確認 |
| `discardOpponentDownTo` | 4 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手・量：上限・下限 |  | 自動 |
| `discardBothHands` | 3 | ゾーン移動 | トラッシュに置く（破棄） |  |  | 自動 |
| `discardSelfOne` | 3 | ゾーン移動 | トラッシュに置く（破棄） | 対象：このカード |  | 自動 |
| `millOpponentThenReact` | 3 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手 | sequence | 要確認 |
| `discardHandAll` | 2 | ゾーン移動 | トラッシュに置く（破棄） | すべて |  | 自動 |
| `discardSelfChoose` | 2 | ゾーン移動 | トラッシュに置く（破棄） | 対象：このカード |  | 自動 |
| `millPerLoserCost` | 2 | ゾーン移動 | トラッシュに置く（破棄） | filter：コスト | countCounter | 要確認 |
| `discardHandAnyThenCoreRemove` | 1 | ゾーン移動 | トラッシュに置く（破棄） |  | sequence | 要確認 |
| `discardHandNexusToVoidCoreSelf` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 対象：このカード・対象：ネクサス |  | 自動 |
| `discardHandNexusesThenDraw` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 対象：ネクサス | sequence | 要確認 |
| `discardOpponentBurst` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手 |  | 自動 |
| `discardOpponentTegamotoDestroyPer` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手・手元 | countCounter | 要確認 |
| `discardOpponentTegamotoVoidCoresPer` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手・手元 | countCounter | 要確認 |
| `discardSelfDownTo` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 対象：このカード・量：上限・下限 |  | 自動 |
| `millPerThenSummonSelfIfBurstMilled` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 対象：このカード | ifLast・sequence・countCounter | 要確認 |
| `millSelfTopThenRefreshSelfIfFamily` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 対象：このカード・filter：系統 | ifLast・sequence | 要確認 |
| `millThenCoreIfBurst` | 1 | ゾーン移動 | トラッシュに置く（破棄） |  | ifLast・sequence | 要確認 |
| `millThenDestroyByCardType` | 1 | ゾーン移動 | トラッシュに置く（破棄） |  | sequence | 要確認 |
| `millThenDestroySameCost` | 1 | ゾーン移動 | トラッシュに置く（破棄） | filter：コスト | sequence | 要確認 |
| `millUntilCostSpiritSummonFree` | 1 | ゾーン移動 | トラッシュに置く（破棄） | filter：コスト・コストなし |  | 自動 |
| `millUntilFamilyToHand` | 1 | ゾーン移動 | トラッシュに置く（破棄） | filter：系統・to：手札 |  | 自動 |
| `millUntilMagicCastFree` | 1 | ゾーン移動 | トラッシュに置く（破棄） | コストなし |  | 自動 |
| `randomOpponentHandMagicDiscard` | 1 | ゾーン移動 | トラッシュに置く（破棄） | 陣営：相手 |  | 自動 |
| `draw` | 108 | ゾーン移動 | ドロー |  |  | 自動 |
| `drawPer` | 6 | ゾーン移動 | ドロー |  | countCounter | 要確認 |
| `drawUpTo` | 2 | ゾーン移動 | ドロー | 量：上限・下限 |  | 自動 |
| `drawPerChosenFamily` | 1 | ゾーン移動 | ドロー | filter：系統 | countCounter | 要確認 |
| `drawPerHandDiscard` | 1 | ゾーン移動 | ドロー |  | countCounter | 要確認 |
| `drawThenDiscard` | 1 | ゾーン移動 | ドロー |  | sequence | 要確認 |
| `setBurstFromHand` | 2 | ゾーン移動 | バーストのセット | from：手札 |  | 自動 |
| `detachOpponentBrave` | 4 | ゾーン移動 | 分離 | 陣営：相手・対象：ブレイヴ |  | 自動 |
| `detachBrave` | 2 | ゾーン移動 | 分離 | 対象：ブレイヴ |  | 自動 |
| `summonFromHandFree` | 41 | ゾーン移動 | 召喚 | from：手札・コストなし |  | 自動 |
| `summonBurstCardFree` | 22 | ゾーン移動 | 召喚 | コストなし |  | 自動 |
| `summonFromTrashFree` | 19 | ゾーン移動 | 召喚 | trash・コストなし |  | 自動 |
| `reviveLastDestroyedNexus` | 4 | ゾーン移動 | 召喚 | 対象：ネクサス |  | 自動 |
| `summonBurstCardFreeIfDestroyedColor` | 2 | ゾーン移動 | 召喚 | filter：色・コストなし | ifLast | 要確認 |
| `summonRepeatFromHand` | 2 | ゾーン移動 | 召喚 | from：手札 |  | 自動 |
| `burstSummonSelfIfTargetBpAtLeast` | 1 | ゾーン移動 | 召喚 | 対象：このカード | ifLast | 要確認 |
| `refireSummonEffect` | 1 | ゾーン移動 | 召喚 |  |  | 自動 |
| `summonBurstCardFreeIfCoresAtLeast` | 1 | ゾーン移動 | 召喚 | コストなし | ifLast | 要確認 |
| `summonBurstCardFreeIfOwnNexusAtLeast` | 1 | ゾーン移動 | 召喚 | 陣営：自分・コストなし・対象：ネクサス | ifLast | 要確認 |
| `combineOwnBrave` | 3 | ゾーン移動 | 合体 | 陣営：自分・対象：ブレイヴ |  | 自動 |
| `returnToHand` | 31 | ゾーン移動 | 戻す | to：手札 |  | 自動 |
| `returnNexusToHand` | 7 | ゾーン移動 | 戻す | to：手札・対象：ネクサス |  | 自動 |
| `returnAllToHand` | 6 | ゾーン移動 | 戻す | すべて・to：手札 |  | 自動 |
| `returnToDeckTop` | 6 | ゾーン移動 | 戻す | to：デッキの上 |  | 自動 |
| `returnSelfToHand` | 5 | ゾーン移動 | 戻す | to：手札 |  | 自動 |
| `returnToDeckBottom` | 2 | ゾーン移動 | 戻す | to：デッキの下 |  | 自動 |
| `returnBofuExhaustedToDeckBottom` | 1 | ゾーン移動 | 戻す | to：デッキの下 |  | 自動 |
| `returnBofuExhaustedToHand` | 1 | ゾーン移動 | 戻す | to：手札 |  | 自動 |
| `returnBothSidesToDeckBottom` | 1 | ゾーン移動 | 戻す | 陣営：お互い・to：デッキの下 |  | 自動 |
| `returnFieldExceptOpponentChosenColor` | 1 | ゾーン移動 | 戻す | 陣営：相手・filter：色 |  | 自動 |
| `returnOneThenRefreshIfMaxCost` | 1 | ゾーン移動 | 戻す | filter：コスト | ifLast・sequence | 要確認 |
| `returnOwnSpiritToHand` | 1 | ゾーン移動 | 戻す | 陣営：自分・to：手札 |  | 自動 |
| `returnToHandCostBudget` | 1 | ゾーン移動 | 戻す | 予算で選ぶ・to：手札 |  | 自動 |
| `returnToHandEachHeavyArmorColor` | 1 | ゾーン移動 | 戻す | filter：色・to：手札 | sequence | 要確認 |
| `handMagicToTegamotoDraw` | 2 | ゾーン移動 | 手元に置く | 手元 |  | 自動 |
| `recoverSpiritFromTrash` | 37 | ゾーン移動 | 手札に加える | trash |  | 自動 |
| `recoverMagicFromTrash` | 11 | ゾーン移動 | 手札に加える | trash |  | 自動 |
| `recoverAllMagicFromTrashByColorChoice` | 1 | ゾーン移動 | 手札に加える | すべて・filter：色・trash |  | 自動 |
| `recoverNexusFromTrash` | 1 | ゾーン移動 | 手札に加える | trash・対象：ネクサス |  | 自動 |
| `destroy` | 120 | ゾーン移動 | 破壊 |  |  | 自動 |
| `destroyAll` | 36 | ゾーン移動 | 破壊 | すべて |  | 自動 |
| `destroyNexus` | 23 | ゾーン移動 | 破壊 | 対象：ネクサス |  | 自動 |
| `destroyBrave` | 7 | ゾーン移動 | 破壊 | 対象：ブレイヴ |  | 自動 |
| `destroySelf` | 7 | ゾーン移動 | 破壊 | 対象：このカード |  | 自動 |
| `destroyByBpBudget` | 6 | ゾーン移動 | 破壊 | 予算で選ぶ |  | 自動 |
| `destroyOwnByCost` | 3 | ゾーン移動 | 破壊 | 陣営：自分・filter：コスト |  | 自動 |
| `destroyPer` | 3 | ゾーン移動 | 破壊 |  | countCounter | 要確認 |
| `destroyAllExceptChosenColors` | 2 | ゾーン移動 | 破壊 | すべて・filter：色 |  | 自動 |
| `destroyByCostBudget` | 2 | ゾーン移動 | 破壊 | filter：コスト・予算で選ぶ |  | 自動 |
| `burstDestroyThenSummonSelf` | 1 | ゾーン移動 | 破壊 | 対象：このカード | sequence | 要確認 |
| `destroyAllByChosenCost` | 1 | ゾーン移動 | 破壊 | すべて・filter：コスト |  | 自動 |
| `destroyAllNexusesExceptChosenColors` | 1 | ゾーン移動 | 破壊 | すべて・filter：色・対象：ネクサス |  | 自動 |
| `destroyAllNexusesWithCores` | 1 | ゾーン移動 | 破壊 | すべて・対象：ネクサス |  | 自動 |
| `destroyBlockerAfterBattle` | 1 | ゾーン移動 | 破壊 |  |  | 自動 |
| `destroyByOwnFamilyCostSet` | 1 | ゾーン移動 | 破壊 | 陣営：自分・filter：系統・filter：コスト |  | 自動 |
| `destroyCostsEachOne` | 1 | ゾーン移動 | 破壊 | filter：コスト | sequence | 要確認 |
| `destroyDownToOwnCount` | 1 | ゾーン移動 | 破壊 | 陣営：自分・量：上限・下限 |  | 自動 |
| `destroyDuplicateNames` | 1 | ゾーン移動 | 破壊 |  |  | 自動 |
| `destroyFieldExceptOpponentChosenColor` | 1 | ゾーン移動 | 破壊 | 陣営：相手・filter：色 |  | 自動 |
| `destroyIfLastMillHadBurst` | 1 | ゾーン移動 | 破壊 |  | ifLast | 要確認 |
| `destroyLifeDamager` | 1 | ゾーン移動 | 破壊 |  |  | 自動 |
| `destroyOnePerCost` | 1 | ゾーン移動 | 破壊 | filter：コスト | countCounter | 要確認 |
| `destroyOwnByFamilyThenWipeEnemy` | 1 | ゾーン移動 | 破壊 | 陣営：自分・filter：系統 | sequence | 要確認 |
| `destroyOwnFreelyThenDraw` | 1 | ゾーン移動 | 破壊 | 陣営：自分・コストなし | sequence | 要確認 |
| `destroySpiritBraveNexusEach` | 1 | ゾーン移動 | 破壊 | 対象：ネクサス・対象：ブレイヴ | sequence | 要確認 |
| `destroyThenMillByCost` | 1 | ゾーン移動 | 破壊 | filter：コスト | sequence | 要確認 |
| `sacrificeNexusThenWipeEnemyNexusCores` | 1 | ゾーン移動 | 破壊 | 対象：ネクサス | pay | 要確認 |
| `sacrificeOwnNexusesThenEnemyDestroysOwn` | 1 | ゾーン移動 | 破壊 | 陣営：自分・対象：ネクサス | pay | 要確認 |
| `deployNexus` | 18 | ゾーン移動 | 配置 | 対象：ネクサス |  | 自動 |
| `deployNexusFromTrashByFieldCores` | 1 | ゾーン移動 | 配置 | trash・対象：ネクサス |  | 自動 |
| `opponentTrashCardToDeckBottom` | 1 | ゾーン移動 | （トラッシュをデッキへ：一覧に無い） | to：デッキの下・trash |  | 要確認 |
| `trashCardsToDeckBottom` | 1 | ゾーン移動 | （トラッシュをデッキへ：一覧に無い） | to：デッキの下 |  | 要確認 |
| `trashMagicToDeckTop` | 1 | ゾーン移動 | （トラッシュをデッキへ：一覧に無い） | to：デッキの上 |  | 要確認 |
| `trashSpiritsToDeckBottom` | 1 | ゾーン移動 | （トラッシュをデッキへ：一覧に無い） | to：デッキの下 |  | 要確認 |
| `castMagicFromTrashByColor` | 2 | ゾーン移動 | （マジックの使用：一覧に無い） | filter：色・trash |  | 要確認 |
| `magicFreeUseFromHandOrTegamoto` | 2 | ゾーン移動 | （マジックの使用：一覧に無い） | 手元・from：手札・コストなし |  | 要確認 |
| `magicMirrorRepeat` | 1 | ゾーン移動 | （マジックの使用：一覧に無い） |  |  | 要確認 |
| `handToOwnDeckTop` | 1 | ゾーン移動 | （手札をデッキへ：一覧に無い） | 陣営：自分・to：デッキの上 |  | 要確認 |
| `opponentHandToDeckTop` | 1 | ゾーン移動 | （手札をデッキへ：一覧に無い） | to：デッキの上 |  | 要確認 |
| `coreRemove` | 46 | コア移動 | コアを取り除く |  |  | 自動 |
| `coreSqueezeOne` | 10 | コア移動 | コアを取り除く |  |  | 自動 |
| `coreRemoveMulti` | 7 | コア移動 | コアを取り除く |  |  | 自動 |
| `removeOneOfAnyType` | 7 | コア移動 | コアを取り除く |  |  | 自動 |
| `coreToTrashSelf` | 4 | コア移動 | コアを取り除く | 対象：このカード・trash |  | 自動 |
| `coreToOpponentTrashChoice` | 3 | コア移動 | コアを取り除く | 陣営：相手・trash |  | 自動 |
| `opponentCoresToTrash` | 3 | コア移動 | コアを取り除く | trash |  | 自動 |
| `bothSidesCoreToTrash` | 2 | コア移動 | コアを取り除く | 陣営：お互い・trash |  | 自動 |
| `coreDrainAllOthers` | 2 | コア移動 | コアを取り除く | すべて |  | 自動 |
| `coreRemoveDistributed` | 2 | コア移動 | コアを取り除く |  |  | 自動 |
| `coreRemovePerHandDiscard` | 2 | コア移動 | コアを取り除く |  | countCounter | 要確認 |
| `coreSqueezeAll` | 2 | コア移動 | コアを取り除く | すべて |  | 自動 |
| `destroyerCoresToTrash` | 2 | コア移動 | コアを取り除く | trash |  | 自動 |
| `moveCoresLeavingOne` | 2 | コア移動 | コアを取り除く |  |  | 自動 |
| `bothSidesCoreToVoid` | 1 | コア移動 | コアを取り除く | 陣営：お互い |  | 自動 |
| `coreDrainToLowerLevel` | 1 | コア移動 | コアを取り除く | filter：レベル |  | 自動 |
| `coreRemoveAllOpponent` | 1 | コア移動 | コアを取り除く | 陣営：相手・すべて |  | 自動 |
| `coreRemoveByPayingSelfCores` | 1 | コア移動 | コアを取り除く | 対象：このカード | pay | 要確認 |
| `coreRemoveSelf` | 1 | コア移動 | コアを取り除く | 対象：このカード |  | 自動 |
| `coreToTrashAllByCost` | 1 | コア移動 | コアを取り除く | すべて・filter：コスト・trash |  | 自動 |
| `coreToVoidEqualizeByTotal` | 1 | コア移動 | コアを取り除く |  |  | 自動 |
| `coreToVoidOwn` | 1 | コア移動 | コアを取り除く | 陣営：自分 |  | 自動 |
| `coreTradeToOpponentTrash` | 1 | コア移動 | コアを取り除く | 陣営：相手・trash |  | 自動 |
| `coresDownToLimit` | 1 | コア移動 | コアを取り除く | 量：上限・下限 |  | 自動 |
| `linkNexusCoresChoice` | 1 | コア移動 | コアを取り除く | 対象：ネクサス |  | 自動 |
| `nexusCoresToTrash` | 1 | コア移動 | コアを取り除く | trash |  | 自動 |
| `opponentCoresToVoidByTotal` | 1 | コア移動 | コアを取り除く |  |  | 自動 |
| `opponentNexusCoresToTrashOne` | 1 | コア移動 | コアを取り除く | trash・対象：ネクサス |  | 自動 |
| `opponentNexusOrReserveCoreToTrash` | 1 | コア移動 | コアを取り除く | trash・対象：ネクサス |  | 自動 |
| `swapOpponentCores` | 1 | コア移動 | コアを取り除く | 陣営：相手 |  | 自動 |
| `voidCoresAndMillByCost` | 1 | コア移動 | コアを取り除く | filter：コスト | sequence | 要確認 |
| `voidCoresFromField` | 1 | コア移動 | コアを取り除く |  |  | 自動 |
| `voidCoresToNexusLevel` | 1 | コア移動 | コアを取り除く | filter：レベル・対象：ネクサス |  | 自動 |
| `coreGain` | 37 | コア移動 | コアを置く |  |  | 自動 |
| `voidCoreToSelf` | 29 | コア移動 | コアを置く | 対象：このカード |  | 自動 |
| `voidCoreToTarget` | 12 | コア移動 | コアを置く |  |  | 自動 |
| `coreGainPer` | 9 | コア移動 | コアを置く |  | countCounter | 要確認 |
| `voidCoreToReserve` | 8 | コア移動 | コアを置く |  |  | 自動 |
| `voidCoreToSelfPer` | 6 | コア移動 | コアを置く | 対象：このカード | countCounter | 要確認 |
| `trashCoresToSpirit` | 5 | コア移動 | コアを置く |  |  | 自動 |
| `voidCoreToOwnNexuses` | 5 | コア移動 | コアを置く | 陣営：自分・対象：ネクサス |  | 自動 |
| `voidCoreToOther` | 4 | コア移動 | コアを置く |  |  | 自動 |
| `destructionCoresToOwnSpirit` | 2 | コア移動 | コアを置く | 陣営：自分 |  | 自動 |
| `reclaimTrashCores` | 2 | コア移動 | コアを置く | trash |  | 自動 |
| `voidCoreToAllOwnByFamily` | 2 | コア移動 | コアを置く | 陣営：自分・すべて・filter：系統 |  | 自動 |
| `voidCoreToOwnByKeyword` | 2 | コア移動 | コアを置く | 陣営：自分・filter：キーワード |  | 自動 |
| `coreCharge` | 1 | コア移動 | コアを置く |  |  | 自動 |
| `trashCoresToKeywordSpirit` | 1 | コア移動 | コアを置く | filter：キーワード |  | 自動 |
| `trashCoresToReserve` | 1 | コア移動 | コアを置く |  |  | 自動 |
| `voidCoreToDeckSide` | 1 | コア移動 | コアを置く |  |  | 自動 |
| `voidCoreToOwnTrash` | 1 | コア移動 | コアを置く | 陣営：自分・trash |  | 自動 |
| `voidCoreToSelfPerBofuCount` | 1 | コア移動 | コアを置く | 対象：このカード | countCounter | 要確認 |
| `lifeCharge` | 39 | コア移動 | コアを置く（to: ライフ） |  |  | 自動 |
| `selfCoreToOwnLife` | 2 | コア移動 | コアを置く（to: ライフ） | 陣営：自分 |  | 自動 |
| `fieldCoreToLife` | 1 | コア移動 | コアを置く（to: ライフ） |  |  | 自動 |
| `lifeCoresBySymbolDiff` | 1 | コア移動 | コアを置く（to: ライフ） |  |  | 自動 |
| `refreshSelf` | 72 | 状態変化 | 回復 | 対象：このカード |  | 自動 |
| `refreshOne` | 38 | 状態変化 | 回復 |  |  | 自動 |
| `refreshSelfByExhaustNexus` | 18 | 状態変化 | 回復 | 対象：このカード・対象：ネクサス | pay | 要確認 |
| `refreshAllByKeyword` | 7 | 状態変化 | 回復 | すべて・filter：キーワード |  | 自動 |
| `refreshAllOwn` | 7 | 状態変化 | 回復 | 陣営：自分・すべて |  | 自動 |
| `refreshByFamily` | 4 | 状態変化 | 回復 | filter：系統 |  | 自動 |
| `refreshAllOwnByFilter` | 3 | 状態変化 | 回復 | 陣営：自分・すべて |  | 自動 |
| `refreshByFamilyAuto` | 2 | 状態変化 | 回復 | filter：系統 |  | 自動 |
| `refreshAllByCost` | 1 | 状態変化 | 回復 | すべて・filter：コスト |  | 自動 |
| `refreshSelfBraveThenCombine` | 1 | 状態変化 | 回復 | 対象：このカード・対象：ブレイヴ | sequence | 要確認 |
| `refreshSelfByDestroyFamily` | 1 | 状態変化 | 回復 | 対象：このカード・filter：系統 | pay | 要確認 |
| `refreshSelfByReturnToDeckTopName` | 1 | 状態変化 | 回復 | 対象：このカード・to：デッキの上 | pay | 要確認 |
| `refreshSelfByReturnToHandFamily` | 1 | 状態変化 | 回復 | 対象：このカード・filter：系統・to：手札 | pay | 要確認 |
| `exhaust` | 69 | 状態変化 | 疲労 |  |  | 自動 |
| `exhaustAll` | 8 | 状態変化 | 疲労 | すべて |  | 自動 |
| `exhaustAllByColor` | 3 | 状態変化 | 疲労 | すべて・filter：色 |  | 自動 |
| `exhaustAllByLevel` | 3 | 状態変化 | 疲労 | すべて・filter：レベル |  | 自動 |
| `exhaustSelf` | 3 | 状態変化 | 疲労 | 対象：このカード |  | 自動 |
| `exhaustAllOpponentNexuses` | 1 | 状態変化 | 疲労 | 陣営：相手・すべて・対象：ネクサス |  | 自動 |
| `exhaustOpponentSameFamilyAll` | 1 | 状態変化 | 疲労 | 陣営：相手・すべて・filter：系統 |  | 自動 |
| `exhaustOpponentToMatch` | 1 | 状態変化 | 疲労 | 陣営：相手 |  | 自動 |
| `exhaustSelfThenLendThisTurn` | 1 | 状態変化 | 疲労 | 対象：このカード・期間：ターン | sequence | 要確認 |
| `exhaustSpiritsAndNexusesUpTo` | 1 | 状態変化 | 疲労 | 量：上限・下限・対象：ネクサス |  | 自動 |
| `bpBuff` | 151 | 数値変更 | BPの変更 |  |  | 自動 |
| `selfBuff` | 49 | 数値変更 | BPの変更 |  |  | 自動 |
| `selfBuffPer` | 28 | 数値変更 | BPの変更 |  | countCounter | 要確認 |
| `bpBuffAll` | 9 | 数値変更 | BPの変更 | すべて |  | 自動 |
| `bpBuffPer` | 6 | 数値変更 | BPの変更 |  | countCounter | 要確認 |
| `selfBuffByExhaustFamily` | 4 | 数値変更 | BPの変更 | filter：系統 | pay | 要確認 |
| `selfBuffByHandDiscard` | 3 | 数値変更 | BPの変更 |  | pay | 要確認 |
| `bpBuffAllPer` | 2 | 数値変更 | BPの変更 | すべて | countCounter | 要確認 |
| `bpBuffAllByBofuCount` | 1 | 数値変更 | BPの変更 | すべて |  | 自動 |
| `bpBuffByExhaustOwn` | 1 | 数値変更 | BPの変更 | 陣営：自分 | pay | 要確認 |
| `familyChoiceThenBpBuffAll` | 1 | 数値変更 | BPの変更 | すべて | sequence | 要確認 |
| `addSymbolPermanent` | 1 | 数値変更 | シンボルの変更 | 期間：永続 |  | 自動 |
| `addSymbolThisTurn` | 1 | 数値変更 | シンボルの変更 | 期間：ターン |  | 自動 |
| `lifeCrush` | 21 | 数値変更 | ライフを減らす |  |  | 自動 |
| `opponentLifeToReserve` | 3 | 数値変更 | ライフを減らす |  |  | 自動 |
| `lendSelfThisTurn` | 81 | 期間つきの付与・制約 | （付与・制約） | 対象：このカード・期間：ターン |  | 自動 |
| `forceAttackThisTurn` | 8 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `levelOverrideTarget` | 6 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `grantKeyword` | 5 | 期間つきの付与・制約 | （付与・制約） | filter：キーワード |  | 自動 |
| `banActByCostThisTurn` | 4 | 期間つきの付与・制約 | （付与・制約） | filter：コスト・期間：ターン |  | 自動 |
| `colorlessSelfThisBattle` | 4 | 期間つきの付与・制約 | （付与・制約） | 対象：このカード・期間：バトル |  | 自動 |
| `forceEndMainStep` | 4 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `lendSelfThisBattle` | 4 | 期間つきの付与・制約 | （付与・制約） | 対象：このカード・期間：バトル |  | 自動 |
| `lockFlash` | 4 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `grantEffectToTargetThisTurn` | 3 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `markUnblockableThisTurn` | 3 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `negateLifeDamageFromTarget` | 3 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `banAttackTargetThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `banHandCardsThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `colorChoiceLendThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `disableOpponentBurstThisBattle` | 2 | 期間つきの付与・制約 | （付与・制約） | 陣営：相手・期間：バトル |  | 自動 |
| `disableOwnArmorThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 陣営：自分・期間：ターン |  | 自動 |
| `endStepLock` | 2 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `grantCanBlockWhileRestedThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `grantColorChoice` | 2 | 期間つきの付与・制約 | （付与・制約） | filter：色 |  | 自動 |
| `grantKeywordToHandCard` | 2 | 期間つきの付与・制約 | （付与・制約） | filter：キーワード・to：手札 |  | 自動 |
| `levelUpThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `protectBlockerCoresThisBattle` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：バトル |  | 自動 |
| `protectLifeByCostThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | filter：コスト・期間：ターン |  | 自動 |
| `targetChoiceLendThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `treatOwnNexusesAsSpiritsThisTurn` | 2 | 期間つきの付与・制約 | （付与・制約） | 陣営：自分・期間：ターン・対象：ネクサス |  | 自動 |
| `attackTriggersAsBlockThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `blockBurstSpiritSummonThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `blockTriggersAsAttackAllThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | すべて・期間：ターン |  | 自動 |
| `blockTriggersAsAttackOwnThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 陣営：自分・期間：ターン |  | 自動 |
| `blockTriggersAsAttackTargetThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `borrowCombinedAttackEffect` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `borrowDestroyEffect` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `borrowSummonEffect` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `bounceToDeckTopThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | to：デッキの上・期間：ターン |  | 自動 |
| `capLifeDamageThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `capOpponentTrashCoreReturnNextRefresh` | 1 | 期間つきの付与・制約 | （付与・制約） | 陣営：相手・trash |  | 自動 |
| `costBuffThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン | pay | 要確認 |
| `countAsMultipleThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `freeFushiSummonThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `grantBlockRequiresMagicDiscardThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `grantBlockerImmunity` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `grantColorThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | filter：色・期間：ターン |  | 自動 |
| `grantEffectToAllByKeywordThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | すべて・filter：キーワード・期間：ターン |  | 自動 |
| `grantFamilyChoiceAll` | 1 | 期間つきの付与・制約 | （付与・制約） | すべて・filter：系統 |  | 自動 |
| `grantHostUnblockableThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `grantKeywordAll` | 1 | 期間つきの付与・制約 | （付与・制約） | すべて・filter：キーワード |  | 自動 |
| `grantSymbolLossThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `grantUnblockableByLevelThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | filter：レベル・期間：ターン |  | 自動 |
| `handReductionColorAsThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | filter：色・期間：ターン |  | 自動 |
| `ignoreUnblockableThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `levelMaxAllOwnThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 陣営：自分・すべて・期間：ターン |  | 自動 |
| `levelOverrideOpponentNexuses` | 1 | 期間つきの付与・制約 | （付与・制約） | 陣営：相手・対象：ネクサス |  | 自動 |
| `levelOverrideOpponentSpiritsAllThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 陣営：相手・すべて・期間：ターン |  | 自動 |
| `lifeFloorThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `lifeImmuneThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `markCantBlockThisBattle` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：バトル |  | 自動 |
| `markCantBlockThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `markNoRefreshTarget` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `markSkipNextRefresh` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `markSuppressTriggerThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `markUnblockableByIceWallColorThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | filter：色・期間：ターン |  | 自動 |
| `negateContinuousMagicByName` | 1 | 期間つきの付与・制約 | （付与・制約） |  |  | 自動 |
| `negateOwnBlockConstraint` | 1 | 期間つきの付与・制約 | （付与・制約） | 陣営：自分 |  | 自動 |
| `opponentNexusEffectsDisabledThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン・対象：ネクサス |  | 自動 |
| `refreshWhenBlockedByChosenColorThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | filter：色・期間：ターン |  | 自動 |
| `requireCoreToBlockThisBattle` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：バトル |  | 自動 |
| `restrictActionsToColorThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | filter：色・期間：ターン |  | 自動 |
| `suppressTriggerThisTurn` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：ターン |  | 自動 |
| `symbolOverrideThisBattle` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：バトル |  | 自動 |
| `unblockableAboveBpThisBattle` | 1 | 期間つきの付与・制約 | （付与・制約） | 期間：バトル |  | 自動 |
| `unblockedByVoidSelfCore` | 1 | 期間つきの付与・制約 | （付与・制約） | 対象：このカード |  | 自動 |
| `endAttackStepAfterBattle` | 6 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `endBattle` | 4 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `battleCompareByLevel` | 3 | バトル・ステップの進行 | （進行） | filter：レベル |  | 自動 |
| `battleOpponentDestroyedCoresToVoid` | 2 | バトル・ステップの進行 | （進行） | 陣営：相手 |  | 自動 |
| `setBattleBpFixed` | 2 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `battleCompareByCores` | 1 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `battleCompareByCost` | 1 | バトル・ステップの進行 | （進行） | filter：コスト |  | 自動 |
| `battleInvertBpWinner` | 1 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `battleLoserCoresToVoid` | 1 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `endAttackStep` | 1 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `extraAttackStep` | 1 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `setOpponentBpAsThisBattle` | 1 | バトル・ステップの進行 | （進行） | 陣営：相手・期間：バトル |  | 自動 |
| `skipBpCompareThenRefreshOne` | 1 | バトル・ステップの進行 | （進行） |  | sequence | 要確認 |
| `swapBattler` | 1 | バトル・ステップの進行 | （進行） |  |  | 自動 |
| `treatAsUnblockedIfBlockerLevel1` | 1 | バトル・ステップの進行 | （進行） | filter：レベル | ifLast | 要確認 |
| `treatAsUnblockedIfLevelAtLeastBlocker` | 1 | バトル・ステップの進行 | （進行） | filter：レベル | ifLast | 要確認 |
| `costDiscardHandKeywordThenDraw` | 3 | 組み合わせ | pay（M1） | filter：キーワード | pay | 要確認 |
| `costOwnSpiritCoresToTrashThenOpponent` | 3 | 組み合わせ | pay（M1） | 陣営：相手・陣営：自分・trash | pay | 要確認 |
| `costDiscardHandThenDiscardOpponentMagic` | 1 | 組み合わせ | pay（M1） | 陣営：相手 | pay | 要確認 |
| `costDiscardHandThenDraw` | 1 | 組み合わせ | pay（M1） |  | pay | 要確認 |
| `costDiscardHandTypeThenCoreRemove` | 1 | 組み合わせ | pay（M1） |  | pay | 要確認 |
| `costDiscardNamedThenPeek` | 1 | 組み合わせ | pay（M1） |  | pay | 要確認 |
| `costOwnAllCoresThenEnemyCoresToReserve` | 1 | 組み合わせ | pay（M1） | 陣営：自分・すべて | pay | 要確認 |
| `costSetBurstThenDraw` | 1 | 組み合わせ | pay（M1） |  | pay | 要確認 |
| `sequence` | 16 | 組み合わせ | sequence（既存） |  |  | 自動 |
| `mutualDestroyChoice` | 2 | 組み合わせ | お互いが選ぶ |  |  | 自動 |
| `mutualKeepChoice` | 1 | 組み合わせ | お互いが選ぶ |  |  | 自動 |
| `chooseActionMode` | 9 | 組み合わせ | または（既存） |  |  | 自動 |
| `fireOwnDestroyTriggers` | 1 | その他 | （誘発を出す） | 陣営：自分 |  | 自動 |
| `applyReviveOnDestroy` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `noop` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `payNegateDecide` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `resolveFushiSummon` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `resolveOwnDestroyTriggers` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `revealDiscardRest` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `revealReturnToDeck` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `summonFreeFromTrashIndexInternal` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `summonSequence` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `tenshoCoreDump` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `tenshoResume` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
| `tenshoSubstituteChoice` | 0 | 内部 | （中断・再開用） |  |  | 自動 |
