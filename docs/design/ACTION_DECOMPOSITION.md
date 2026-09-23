# アクション type の分解（REFACTOR_PLAN §2.1 ④）

[ACTION_VOCABULARY.md](./ACTION_VOCABULARY.md) の一覧に、既存の EffectAction の type 329種を1行ずつ割り振る。
これが器の統合（M1〜M6）の作業リストになる。

§「表」は名前の単語だけから機械的に割り振った下書き（2026-09-23）。
**「要確認」の行と一覧に無い種類は、調査役が定義・ハンドラ・効果文を読んで §A・§B に分解した**（同日）。§A・§B の方が正しい。

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

1. ~~調査役：「要確認」と「一覧に無い種類」の行を埋める~~ → §A・§B（済み）。「自動」の行の軸はまだ名前から拾っただけ
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

## A. 期間つきの付与・制約とバトル進行（88種。対象・内容・期間に分解）

「同じ内容の既存の継続効果」は EffectDef 側の kind／constraint type。器「継続効果を期間つきで置く」の内容の語彙はここから取る。

| type | 対象 | 内容 | 期間 | 同じ内容の既存の継続効果 | 備考 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| lendSelfThisTurn | プレイヤー（自分） | マジック自身を仮想発生源として場に置いたものとして扱う（貸与機構の基盤） | ターン | なし | 「対象・内容」を持たず、後続の継続効果エントリが読む仮想発生源を作るだけの土台。単体では継続効果として書けない（何を制限/付与するかを持たない） |
| forceAttackThisTurn | スピリット（相手・絞り込みあり：コスト/合体除外/カード名条件/任意数） | 「可能ならば必ずアタックする」を課す（mustAttack） | ターン | constraint / turnConstraint 内 `mustAttack`（`type: "mustAttack"` 相当） | 対象＝プレイヤーが選ぶ（interactiveTargets）選択を伴うが、内容自体は既存語彙で書ける |
| levelOverrideTarget | スピリット（自分or相手1体、色/Lv存在で絞り込み） | Lvを指定値として扱う | ターン | 同じ内容の継続効果あり（`levelOverrideThisTurn`系。`levelAs`/`kind:"levelAs"`） | 対象選択を伴うが内容は既存語彙 |
| grantKeyword | スピリット（自分1体） | 指定キーワードを得る | ターン | `keywordGrant`（kind） | なし |
| banActByCostThisTurn | スピリット（自分or相手・コスト/キーワード有無で絞り込み） | アタックとブロックができない（blockOnlyでブロックのみ） | ターン | `constraint` の `cantAttack`/`cantBlock` 相当 | なし |
| colorlessSelfThisBattle | スピリット（自分1体、self固定） | 色を無いものとして扱う | バトル | `colorAs`（kind。ただしこちらは「無色化」専用の語彙が必要） | 手札破棄という任意コストを伴う（コスト解決は継続効果の器の外）。コスト部分は書けないが「効果本体」は書ける |
| forceEndMainStep | バトル（相手 or ターンプレイヤーのメインステップ） | メインステップを強制終了させる | 即時 | なし | 一度きりの手順操作（フェーズ遷移）。継続的な制約ではなく単発の進行操作 |
| lendSelfThisBattle | プレイヤー（自分） | マジック自身を仮想発生源としてバトル中貸し出す | バトル | なし | lendSelfThisTurnと同じ理由で単体では書けない（土台のみ） |
| lockFlash | プレイヤー（相手・attackerFamilyFilterで絞り込み条件あり） | フラッシュで手札のカードを使用できない | バトル | `constraint`/`globalConstraint` 相当（`cantUseHandCardsForPid`のバトル限定版） | なし |
| grantEffectToTargetThisTurn | スピリット（自分1体、filter絞り込み） | 指定の誘発効果（trigger＋action）を直接付与する | ターン | `effectEntryGrant`/`effectGrant`（kind） | 「内容」が誘発効果の付与そのものなので継続効果というより効果の複合追加に近いが、grant語彙で表現可 |
| markUnblockableThisTurn | スピリット（自分1体、BP下限 or self固定） | ブロックされない（1回限り） | ターン（ただし「次のバトル終了まで」の一度きり消費） | `constraintGrant`/`unblockableByLevelThisTurn`類似だが「1回だけ」という消費型が既存に無い | 消費型（使用後に印が消える）なので単純な期間つき継続効果（期間終了までずっと有効）とは性質が違う |
| negateLifeDamageFromTarget | スピリット（相手1体を対象指定）／効果はプレイヤー（自分）のライフに掛かる | そのスピリットのアタックでは自分のライフが減らない | ターン | `lifeDamageNegate`（kind）に近い | costReturnSelfToHand（自分を手札に戻すコスト）を伴う版があり、コスト部分は継続効果の器の外 |
| banAttackTargetThisTurn | スピリット（相手1体、合体限定可） | アタックできない（alsoCantBlock指定でブロックも） | ターン | `constraint` の `cantAttack`/`cantBlock` | なし |
| banHandCardsThisTurn | プレイヤー（相手・色/種別で絞り込み） | 手札のカードを使えない | ターン | `globalConstraint`/`constraint` の `cantUseHandCardsForPid` | なし |
| colorChoiceLendThisTurn | プレイヤー（自分）→（色選択後は対象色のスピリット全体） | 選んだ色を仮想発生源に載せて貸し出す | ターン | なし（`levelAs`のlentOnlyエントリが読む土台） | 色選択という中間ステップを持ち、単体では書けない（土台） |
| disableOpponentBurstThisBattle | プレイヤー（相手） | バーストを発動できない | バトル | なし（バトル限定の`disableOpponentBurstThisBattle`相当が既存になければ`globalConstraint`類似の新語彙） | なし |
| disableOwnArmorThisTurn | スピリット（自分or相手・side指定） | 【装甲】が働かない（新たに得ることもない） | ターン | `constraintSuppression`/`globalConstraint`近似 | なし |
| endStepLock | プレイヤー（お互い） | 複数種の制限（アタックステップ不可／デッキ破棄不可／コア移動不可／召喚時効果不可）を課す | `自分のエンドステップ`をturns回まで | `globalConstraint`の各種相当を束ねたもの | 「回数」で切れる期間（ターンでもバトルでもない特殊な期間）。既存の3種の期間区分に当てはまらない |
| grantCanBlockWhileRestedThisTurn | スピリット（自分・系統/色で絞り込み、singleTarget可） | 疲労状態でもブロックできる | ターン | `constraintGrant`の`canBlockWhileRested`相当 | なし |
| grantColorChoice | スピリット（自分1体固定 or 選択、targetSideで相手も） | 選んだ色を追加で持つ | ターン | `colorAs`/`grantColorThisTurn`と同内容（色が固定か選択かの違いだけ） | 色選択という中間ステップを挟む点のみ既存と異なる |
| grantKeywordToHandCard | 手札のカード（自分・cardType/系統で絞り込み、all指定で複数） | 指定キーワードを持つ | ターン | `handKeywordGrant`（kind） | なし |
| levelUpThisTurn | スピリット（自分or相手1体、anySide） | Lvを1つ上として扱う（最大Lvでキャップ） | ターン | `levelAs`/`levelOverrideTarget`と同型（差分算出という点のみ違う） | なし |
| protectBlockerCoresThisBattle | バトル（ブロックしているスピリット上のコア） | コアが効果で取り除けない | バトル | `coreBonus`/`trashImmunity`近似だが「コア除去耐性」の語彙が既存に薄い | なし |
| protectLifeByCostThisTurn | プレイヤー（自分）／絞り込みはアタック側スピリットのコスト・系統・シンボル数 | 指定条件のアタックでライフが減らされない | ターン | `lifeDamageNegate`/`globalConstraint`の`noLifeDamageByCost`の片側版 | costExhaustFamily（系統1体を疲労させるコスト）を伴う版があり、コスト部分は器の外 |
| targetChoiceLendThisTurn | スピリット（自分or相手・選択で1体） | 効果を貸す（対象が1体固定の貸与） | ターン | なし（土台。lendSelfThisTurnの対象版） | 対象選択という中間ステップを持つ土台のみで、単体では書けない |
| treatOwnNexusesAsSpiritsThisTurn | ネクサス（自分・コア数条件） | スピリットとして扱う（コスト/系統/Lv構成も上書き） | ターン | なし（`kind`の中に該当語彙が無い） | 「ゾーン移動を伴う」（fieldNexuses→fieldSpirits）ため、単純な制約付与では表現できない。新しい部品が要る可能性 |
| attackTriggersAsBlockThisTurn | スピリット（自分1体） | 『アタック時』効果が『ブロック時』に発揮される（移し替え） | ターン | なし（`kind`にトリガー種別の付け替えという語彙が無い） | トリガーの発火タイミングそのものを書き換える効果で、既存の「制約」「付与」語彙とは別物 |
| blockBurstSpiritSummonThisTurn | プレイヤー（お互い） | バースト効果でスピリットを召喚できない | ターン | `globalConstraint`の`noBurstSpiritSummonThisTurn`相当 | なし |
| blockTriggersAsAttackAllThisTurn | スピリット（お互い全員） | 『ブロック時』効果が『アタック時』に発揮される | ターン | なし（attackTriggersAsBlockThisTurnと同種の未整備語彙） | 同上（トリガー付け替え） |
| blockTriggersAsAttackOwnThisTurn | スピリット（自分全員） | 『ブロック時』効果が『アタック時』に発揮される | ターン | なし | 同上 |
| blockTriggersAsAttackTargetThisTurn | スピリット（自分1体） | 『ブロック時』効果が『アタック時』に発揮される | ターン | なし | 同上 |
| borrowCombinedAttackEffect | スピリット（自分の合体ブレイヴが持つ効果1つを選択） | 選んだ『合体アタック時』効果を自分自身の効果として発揮 | 即時 | なし | 一度きりの効果借用（選択を伴う実行）で継続効果ではない |
| borrowDestroyEffect | スピリット（自分1体の効果を選択） | 選んだ『破壊時』効果を破壊させずに発揮 | 即時 | なし | 同上。一度きりの効果借用 |
| borrowSummonEffect | スピリット（自分・カード名条件） | 『召喚時』効果を召喚し直さず発揮 | 即時 | なし | 同上。一度きりの効果借用 |
| bounceToDeckTopThisTurn | プレイヤー（自分の効果で手札に戻る対象すべて） | 手札にではなくデッキの上に戻る | ターン | なし（`globalConstraint`に近い語彙が無い） | 「戻し先の振替」という処理経路の変更で、対象・内容・期間の枠に馴染むが「内容」語彙が既存に無い |
| capLifeDamageThisTurn | プレイヤー（自分） | 1回のアタックでのライフ減少がmax個まで | ターン | `globalConstraint`の`lifeDamageMaxForPid`相当 | なし |
| capOpponentTrashCoreReturnNextRefresh | プレイヤー（相手） | 次のリフレッシュステップでトラッシュのコアがmax個までしか戻らない | `次のリフレッシュステップまで`（1回限り） | なし | 「次の1回だけ」という一度きり消費の期間で、ターン/バトルどちらでもない |
| costBuffThisTurn | スピリット（自分1体） | コストが増減する（置き換え） | ターン | `costMod`/`costDelta`（kind） | なし |
| countAsMultipleThisTurn | スピリット（自分or相手1体、anySide、sourceTypesで発生源限定） | 効果内で複数体分として数えられる | ターン | なし（`countAsMultiple`という語彙自体は`kind`一覧に見当たらない） | 「数え方」の書き換えで、対象・内容の枠には収まるが同じ内容の既存語彙は無い |
| freeFushiSummonThisTurn | プレイヤー（自分） | このターン最初の【不死】召喚のコストが0になる | ターン | `magicFreeGrant`近似だが【不死】専用の語彙は無い | なし |
| grantBlockRequiresMagicDiscardThisTurn | スピリット（自分1体、self固定）→効果は相手に掛かる | このスピリットがアタックしたとき、相手はマジック1枚破棄しなければブロックできない | ターン（以後の全アタックに効く） | なし | 「召喚時に一度だけ付与し、以後のアタックに効き続ける」という、通常の「ターンの間ずっと」とは異なる発火条件つき継続 |
| grantBlockerImmunity | スピリット（自分・ブロック中優先で1体自動選択） | 相手のカードの効果を受けない | ターン | `immunityGrant`（kind） | なし |
| grantColorThisTurn | スピリット（自分1体） | 指定色としても扱う（追加） | ターン | `colorAs`（kind） | なし |
| grantEffectToAllByKeywordThisTurn | スピリット（自分・指定キーワード持ち全員） | 指定の誘発効果を直接付与する | ターン | `effectEntryGrant`/`effectGrant`（grantEffectToTargetThisTurnの全体版） | なし |
| grantFamilyChoiceAll | スピリット・手札のカード（自分・指定系統持ちすべて） | 選んだ系統を追加で持つ | ターン | `familyGrant`（kind、familyFromChoiceエントリ） | 発動条件判定（場か手札に対象系統が要る）を経て系統選択という中間ステップがある土台寄り |
| grantHostUnblockableThisTurn | スピリット（自分・selfが合体しているホスト1体） | ブロックされない | ターン | `constraintGrant`/`unblockableByLevelThisTurn`近似 | なし |
| grantKeywordAll | スピリット（自分全員、コスト/vanilla条件） | 指定キーワードを得る | ターン | `keywordGrant`（kind、全体版） | なし |
| grantSymbolLossThisTurn | スピリット（相手全員） | 指定色のシンボル1つを失う | ターン | なし（`symbolFix`/`symbolAddGrant`はあるが「失う」方向の語彙が無い） | 色選択という中間ステップを挟む |
| grantUnblockableByLevelThisTurn | スピリット（自分全員）／絞り込みは相手側のLv | 指定Lvの相手からブロックされない | ターン | `globalConstraint`の`unblockableByLevelThisTurn`相当 | なし |
| handReductionColorAsThisTurn | 手札のカード（自分・cardType） | 軽減シンボルを指定色一色として扱う | ターン | なし（`globalConstraint`の`handReductionColorAsForPid`相当はあるが専用kindは無い） | なし |
| ignoreUnblockableThisTurn | プレイヤー（自分） | 「ブロックされない」効果を無視してブロックできる | ターン | なし | なし |
| levelMaxAllOwnThisTurn | スピリット（自分全員） | 各カードの最高Lvとして扱う | ターン | `levelAs`/levelOverrideTargetと同型（全体版） | なし |
| levelOverrideOpponentNexuses | ネクサス（相手全員） | Lvを指定値として扱う | ターン | `levelAs`と同内容 | costReserveToVoid（リザーブのコアを払う任意コスト）を伴う版があり、コスト部分は器の外 |
| levelOverrideOpponentSpiritsAllThisTurn | スピリット（相手全員） | Lvを指定値として扱う | ターン | `levelAs`と同内容 | なし |
| lifeFloorThisTurn | プレイヤー（自分）／絞り込みはアタック側の最低コスト・発生源種別 | ライフが指定値を下回らない | ターン | `globalConstraint`の`lifeFloorForPid`相当 | なし |
| lifeImmuneThisTurn | プレイヤー（自分） | あらゆる原因でライフが減らない | ターン | `globalConstraint`の`lifeImmuneForPid`相当 | なし |
| markCantBlockThisBattle | スピリット（相手1体） | ブロックできない | バトル | `constraint`の`cantBlock`相当（バトル限定版） | なし |
| markCantBlockThisTurn | スピリット（相手・counter体分、繰り返し指定） | ブロックできない | ターン | `constraint`の`cantBlock`相当 | 指定体数ぶん1体ずつ選ぶ繰り返し処理（再帰呼び出し）を伴うが、内容自体は既存語彙 |
| markNoRefreshTarget | スピリット（相手1体） | 回復できない（発生源が疲労状態で場にいる間だけ有効という条件付き） | `発生源（self）が疲労状態で場にいる間`（可変の期間） | `globalConstraint`の`noRefresh`類似 | 期間が「ターン」でも「バトル」でもなく「発生源の状態に連動」という第三の期間で、既存の期間分類に無い |
| markSkipNextRefresh | スピリット（相手1体） | 次のリフレッシュステップで回復できない | `次のリフレッシュステップまで`（1回限り） | なし | capOpponentTrashCoreReturnNextRefreshと同じ「次の1回だけ」の期間 |
| markSuppressTriggerThisTurn | スピリット（相手1体） | 指定トリガーが発揮されない | ターン | `triggerSuppression`（kind、個体限定版） | なし |
| markUnblockableByIceWallColorThisTurn | スピリット（自分・【氷壁】持ち1体） | 【氷壁】の色と同色の相手からブロックされない | ターン | `constraintGrant`の`unblockableByLevelThisTurn`近似だが「色」基準の語彙は薄い | なし |
| negateContinuousMagicByName | バトル外（相手が発揮中の`endStepLock`1件を解除） | 効果発揮中の継続効果を無効化する | 即時 | なし | 継続効果を「打ち消す」一度きりの操作で、継続効果そのものではない |
| negateOwnBlockConstraint | スピリット（自分1体） | 『ブロックできない』制約を無効化する | ターン | なし | 既存の制約を打ち消す一度きりの操作 |
| opponentNexusEffectsDisabledThisTurn | ネクサス（相手全員） | 効果が発揮されない | ターン | `nexusEffectsDisabled`（kind、常在版のターン限定版） | なし |
| refreshWhenBlockedByChosenColorThisTurn | スピリット（自分1体、self固定） | 指定色のスピリットにブロックされたとき回復する | ターン | なし（`kind`一覧に「ブロックされたとき回復」の専用誘発語彙は無い） | 色選択という中間ステップに加え、「トリガー付与」に近い内容で通常の制約/付与とは性質が異なる |
| requireCoreToBlockThisBattle | プレイヤー（相手） | コアをトラッシュに置かなければブロックできない | バトル | なし（`constraint`にコスト要求付きブロック制限の語彙は無い） | ブロックに追加コストを課す内容で、既存の「できない」系とは別の語彙が要る |
| restrictActionsToColorThisTurn | スピリット（お互い・指定色以外） | アタック/ブロックができない | ターン | `globalConstraint`の`cantActExceptColor`相当 | なし |
| suppressTriggerThisTurn | スピリット（相手全員） | 指定トリガーが発揮されない | ターン | `triggerSuppression`（kind、全体版） | なし |
| symbolOverrideThisBattle | スピリット（自分1体、filter絞り込み） | シンボルを指定数・指定色として扱う | バトル | `symbolFix`/`symbolAddGrant`近似だが「上書き」語彙は薄い | なし |
| unblockableAboveBpThisBattle | スピリット（自分1体、self固定） | 指定BP以上の相手からブロックされない | バトル | `constraintGrant`の`unblockableByLevelThisTurn`近似（Lv基準ではなくBP基準） | なし |
| unblockedByVoidSelfCore | バトル（selfがアタッカーのときのみ） | コア1個を払うことでBPを比べずブロックされなかった扱いにする | 即時（そのバトル1回きり） | なし | コアを払う任意コストを伴う一度きりの判定変更で、継続効果ではない |
| endAttackStepAfterBattle | バトル | バトル終了時にアタックステップを終了する | バトル（フラグは即時実行） | なし | フラグを立てて直後に消費される一度きりの処理 |
| endBattle | バトル | ただちにバトルを終了させる（BP比較・ライフダメージなし） | 即時 | なし | 一度きりの進行操作 |
| battleCompareByLevel | バトル | BPの代わりにLvを比較する | バトル | `battleBpAsLevel`（kind）に近い内容だが対象がバトル全体 | なし |
| battleOpponentDestroyedCoresToVoid | バトル（相手の破壊されたスピリットのコア） | コアがリザーブでなくボイドに送られる | バトル | なし | なし |
| setBattleBpFixed | スピリット（targetInstanceIdで指定された1体） | 実効BPを固定値として扱う | バトル | `battleBpAsLevel`/`bpAs`近似 | なし |
| battleCompareByCores | バトル | BPの代わりにコア数を比較する | バトル | battleCompareByLevelと同型（比較基準違い） | なし |
| battleCompareByCost | バトル | BPの代わりにコストを比較する | バトル | battleCompareByLevelと同型 | なし |
| battleInvertBpWinner | バトル | BPの高い方が破壊される（勝敗反転） | バトル | なし | なし |
| battleLoserCoresToVoid | バトル（直前バトルで破壊されたスピリットのコア） | コアがリザーブでなくボイドに送られる | 即時（直前バトル1回きり） | なし | battleOpponentDestroyedCoresToVoidの「継続フラグ」版と異なり、その場限りの一度きり処理 |
| endAttackStep | バトル（アタックステップ） | アタックステップを終了する | 即時 | なし | 一度きりの進行操作 |
| extraAttackStep | プレイヤー（自分のターン） | アタックステップとエンドステップをもう1回ずつ行う | 即時（フラグは次周で消費） | なし | 一度きりの進行操作 |
| setOpponentBpAsThisBattle | スピリット（相手1体） | 指定Lvのとき基礎BPを指定値として扱う | バトル | `bpAs`（kind）と同内容（バトル限定・単体版） | なし |
| skipBpCompareThenRefreshOne | バトル＋スピリット（自分1体、refreshOneへの複合） | BP比較を飛ばしてバトル終了、その後1体回復 | 即時 | なし | 「バトル終了」と「回復」という2つの単純アクションの連結（sequence）で書けるはずのもの |
| swapBattler | スピリット（自分のバトル参加中の1体と疲労状態の1体） | バトル参加者を入れ替える | 即時 | なし | 一度きりの入れ替え処理 |
| treatAsUnblockedIfBlockerLevel1 | バトル | ブロッカーがLv1ならBPを比べずブロックされなかった扱い | バトル | なし | なし |
| treatAsUnblockedIfLevelAtLeastBlocker | バトル | アタッカーのLvがブロッカーのLv以上ならBPを比べずブロックされなかった扱い | バトル | treatAsUnblockedIfBlockerLevel1と同型（条件違い） | なし |

## B. 複合型（79種。単純なアクションと組み合わせ方の式）

| type | 式 | 足りない部品 | 備考 |
| :-- | :-- | :-- | :-- |
| revealAndSummonAllByFamily | sequence[ オープン{from:デッキ上, 量:count（またはcountFromSelfLevel時は自身Lv）}, 召喚{対象:公開エリア中 系統∈familyFilter ∧ コスト∈costFilter のスピリットすべて, コスト無し}, トラッシュに置く{対象:残り} ] | 量の値源に「自身の現在Lv」 | 量の軸は今「数値かEffectCounter」のみ。自身Lvはどちらでもない。costFilterはfilterで表現可 |
| revealAndSummonKeyword | sequence[ オープン{from:デッキ上,量:count}, 召喚{対象:公開エリア中の指定キーワード持ちスピリット1枚（選ぶ人:使用者）, コスト無し, 転召省略フラグ}, トラッシュに置く{対象:残り} ] | 「【転召】を発揮したものとして扱う」＝転召処理を省略する召喚の特殊指定 | 召喚時効果自体は通常どおり発揮。returnToDeckBottomAtEndStepは別の期間付き継続効果として外出しできる |
| openOwnBurstActivateIfSummonCond | sequence[ オープン{from:自分のバースト,1}, ifLast{cond: オープンしたバーストの発動条件式を評価, then: その効果のactionを解決, else: 戻す{to:デッキの下}} ] | ifLastのcondに「カード固有の発動条件（バーストのevent/condition）を動的に評価する」 | 直前アクション結果の分岐ではなくカードデータ側の条件式評価なので、既存ifLastのcondの範囲を超える可能性あり（相談） |
| revealAndPlaceNexusFree | sequence[ オープン{from:デッキ上,count}, 配置{対象:公開エリア中のネクサスカード1枚(選択可・任意), コスト無し}, トラッシュに置く{対象:残り} ] | なし | 非interactive時はコスト最大の1枚を選ぶ簡略化（実装都合） |
| revealAndSummonAllByKeyword | sequence[ オープン{from:デッキ上,count}, 召喚{対象:公開エリア中の指定キーワード持ちスピリットすべて, コスト無し}, トラッシュに置く{対象:残り} ] | なし | 召喚時効果・転召は通常どおり発揮。pendingCardIdsは召喚を1体ずつ中断する内部実装詳細で式には現れない |
| revealOpponentDeckPickBottomRestTop | sequence[ オープン{from:相手のデッキ上,count}, 戻す{対象:選んだ1枚, to:相手のデッキの下, 選ぶ人:効果の使用者}, 戻す{対象:残り, to:相手のデッキの上（順番は使用者が指定）, 選ぶ人:効果の使用者} ] | なし | 選ぶ人は両方とも効果の使用者（相手ではない）。「戻す」を繰り返し1枚ずつ適用する形で順番指定を表現 |
| revealOwnBurstThenSortByType | sequence[ オープン{from:自分のバースト,1}, ifLast{cond:公開したカードがマジックカード, then:手札に加える{対象:そのカード}, else:トラッシュに置く{対象:そのカード}} ] | なし | burstがnullなら不発 |
| revealTopBurstOneToHandRestBottom | sequence[ オープン{from:デッキ上,count}, 手札に加える{対象:公開エリア中のバースト効果(kind:"burst")持ちカード1枚（複数時は公開順で先頭固定）}, 戻す{対象:残り, to:デッキの下（公開順のまま）} ] | なし | 複数該当時に先頭固定は決定的簡略化（「好きな1枚」ではない点は要確認） |
| revealTopToHandIfColorSpiritElseReturnToDeck | sequence[ オープン{from:デッキ上,1}, ifLast{cond:公開カードが指定色のスピリット, then:手札に加える{対象:そのカード}, else:戻す{to:デッキの上, 対象:そのカード}} ] | なし | 「無条件で手札→条件外なら戻す」という手順で実装（結果は同じ） |
| revealTopToHandThenRefreshOwn | sequence[ オープン{from:デッキ上,1}, 手札に加える{対象:そのカード}, ifLast{cond:そのカードが指定色(省略時不問)のマジック, then:回復{対象:自分のスピリット1体(選択)}} ] | なし | refreshOneへ委譲。姉妹型と違い「手札に残るか」自体は無条件 |
| millPer | トラッシュに置く{from:デッキ(相手／side:own時は自分), 量:countCounter(counter)×multiplier（cap指定時は上限つき）} | なし | multiplier・capは量の値の後処理。mill専用の上限加算（マキシマムブレイク）はEffectCounterの範囲内の話として扱う |
| millOpponentThenReact | sequence[ トラッシュに置く{from:相手のデッキ,量:1}, ifLast{cond:react種別, then: 破壊{対象:破棄カードと同コストの相手スピリット1体} ／ 疲労{対象:相手スピリット1体,条件:破棄カードのコスト≤maxCost} ／ 行動制限{このバトルの間,相手は破棄カードと同色の手札を使用不可} } ] | 「行動制限（〜を使用できない、期間つき）」という軸 | banHandColorThisBattleは状態変化でも数値変更でもない「使用禁止」。既存の単純アクション一覧に対応するものが無い |
| millPerLoserCost | トラッシュに置く{from:相手のデッキ, 量:countCounter(直前バトルで破壊されたスピリットのコスト=lastBattleDestroyedCost)} | なし | 記録が0（直前バトルで破壊が無い）ならno-op |
| discardHandAnyThenCoreRemove | sequence[ トラッシュに置く{from:手札, 量:好きなだけ(0以上・1枚ずつ選択)}, countCounter{破棄した枚数ぶん: コアを取り除く{対象:相手スピリット1体(都度選択), to:トラッシュ}} ] | なし | 非対話時は手札全破棄→まとめて1体からという決定的簡略化 |
| discardHandNexusesThenDraw | sequence[ トラッシュに置く{from:手札, 対象:ネクサスカードすべて}, ドロー{枚数:countCounter(破棄した枚数)} ] | なし | 「好きなだけ」を「すべて」に決定的簡略化 |
| discardOpponentTegamotoDestroyPer | sequence[ トラッシュに置く{from:相手の手元, 対象:すべて}, 破壊{対象:相手スピリット, 量:countCounter(破棄した枚数), BP不問} ] | なし | 手元が0枚ならno-op |
| discardOpponentTegamotoVoidCoresPer | sequence[ トラッシュに置く{from:相手の手元, 対象:すべて}, countCounter{破棄した枚数ぶん: コアを取り除く{from:相手のリザーブ優先→フィールド(コア最多のスピリット/ネクサス優先), to:ボイド}} ] | なし | ソウルコア以外という絞り込みは現状ソウルコア未実装のため実質全コア対象 |
| millPerThenSummonSelfIfBurstMilled | sequence[ トラッシュに置く{from:相手のデッキ, 量:countCounter(counter)×multiplier}, ifLast{cond:破棄カードにバースト効果(kind:"burst")持ちが含まれる, then:召喚{対象:このカード自身, コスト無し}} ] | なし | finishBurstActivationの扱いはsummonBurstCardFreeと同一という実装都合 |
| millSelfTopThenRefreshSelfIfFamily | sequence[ トラッシュに置く{from:自分のデッキ, 量:1}, ifLast{cond:破棄カードが指定系統のスピリット, then:回復{対象:このスピリット}} ] | なし | デッキ0枚なら不発 |
| millThenCoreIfBurst | sequence[ トラッシュに置く{from:相手のデッキ, 量:count}, ifLast{cond:破棄カードにバースト効果持ちが含まれる, then:コアを置く{from:ボイド, to:このスピリット, 1}} ] | なし | 合体中はホストへ置かれる（selfがホスト） |
| millThenDestroyByCardType | sequence[ トラッシュに置く{from:相手のデッキ, 量:1}, ifLast{cond:破棄カードの種別（スピリット/ブレイヴ or ネクサス/マジック）, then: 破壊{対象:相手のスピリット1体, 選ぶ人:相手（対象側）} ／ 破壊{対象:相手のネクサス1つ, 選ぶ人:相手（対象側）} } ] | なし | 破壊対象は相手のフィールド、選ぶのも相手（chooserIsTarget＝CHOOSER_RULES.md） |
| millThenDestroySameCost | sequence[ トラッシュに置く{from:自分のデッキ, 量:1}, 破壊{対象:破棄カードと同コストの相手スピリットすべて} ] | なし | デッキ0枚なら不発 |
| drawPer | ドロー{枚数:countCounter(counter)} | なし | drawDoubleMultiplier（引き倍加）は別の継続効果として外側で乗算される前提 |
| drawPerChosenFamily | choose{選択肢:families（1つ選ぶ・選ぶ人:使用者。非対話時は該当数最多の系統）, then:ドロー{枚数:countCounter(選んだ系統を持つ自分のスピリット数)}} | なし | familiesが1件なら選択なしで確定 |
| drawPerHandDiscard | sequence[ トラッシュに置く{from:手札, 量:好きなだけ(0以上・1枚ずつ選択)}, ドロー{枚数:countCounter(破棄した枚数)} ] | なし | 満天の牧草地等の「メインステップに破棄できない」制約は別の継続効果として外側にある前提 |
| drawThenDiscard | sequence[ ドロー{枚数:drawCount}, トラッシュに置く{from:手札, 量:discardCount(選択)} ] | なし | |
| summonBurstCardFreeIfDestroyedColor | ifLast{cond:このバースト発動時に破壊された自分のスピリットの色にactionのcolorが含まれる（burstEventColors）, then:召喚{対象:このカード自身,コスト無し}} | なし（要相談） | condが「直前アクションの結果」ではなくバースト発動イベントの記録に基づく。ifLastのcondをこの種の外部状態参照まで含めてよいか要確認 |
| burstSummonSelfIfTargetBpAtLeast | sequence[ ifLast{cond:イベント対象（アタックしたスピリット等）の実効BP≥minBp, then:召喚{対象:このカード自身,コスト無し}}, ifLast{cond:召喚できた, then:BPの変更{対象:新しく出た個体,+thenBuffSelf,期間:このターン}} ] | なし（要相談。上と同種） | イベント対象参照は同上の懸念 |
| summonBurstCardFreeIfCoresAtLeast | ifLast{cond:自分のフィールド/リザーブ/トラッシュのコア合計≥coresAtLeast, then:召喚{対象:このカード自身,コスト無し}} | なし（要相談。上と同種） | 「A。その後、条件を満たすときだけB」のB側だけを条件化する形はifLastそのもの |
| summonBurstCardFreeIfOwnNexusAtLeast | ifLast{cond:自分のフィールドのネクサス数≥nexusAtLeast, then:召喚{対象:このカード自身,コスト無し}} | なし（要相談。上と同種） | |
| returnOneThenRefreshIfMaxCost | sequence[ 戻す{対象:相手スピリット1体(選択), to:手札}, ifLast{cond:戻したスピリットのコスト≤maxCost, then:回復{対象:指定系統を持つ自分のスピリット1体(選択)}} ] | なし | ターン1回制限は別軸（頻度制限）で外側にある前提。候補複数時は非対話でBP最大を自動選択 |
| returnToHandEachHeavyArmorColor | 【重装甲】の色（self静的に持つ色の集合）を1つずつ取り出し、色ごとに 戻す{対象:その色の相手スピリット1体(選択), to:手札} を繰り返す | 集合の各要素ごとに同じアクションを繰り返す組み合わせ方（forEach） | countCounterは量の計算止まりで、色ごとに別対象を選びながら繰り返す構造には使えない。remainingColorsによる中断再開は実装都合でありforEachが要る |
| destroyPer | 破壊{対象:相手スピリット, 量:countCounter(counter), filter絞り込み, 選ぶ人:実効BP最大から自動} | なし | 選び方（BP最大優先）は破壊アクション共通の既定順で、これ専用の仕様ではない |
| burstDestroyThenSummonSelf | sequence[ ifLast{cond:condition省略 または 自分のライフ≤ownLifeAtMost, then:破壊{対象:相手スピリット1体, filter}}, 召喚{対象:このカード自身, コスト無し} ] | なし | 「この効果発揮後」＝破壊の成否によらず召喚は必ず実行。condは直前アクションでなく自分のライフという外部状態（前掲の相談事項と同種） |
| destroyCostsEachOne | costs配列の各コストについて 破壊{対象:相手スピリット1体, filter:コスト=その値} を繰り返す（forEach） | 集合の各要素ごとに同じアクションを繰り返す組み合わせ方（forEach。returnToHandEachHeavyArmorColorと同一部品） | destroyOnePerCostと実質同型（重複type） |
| destroyIfLastMillHadBurst | ifLast{cond:直前のトラッシュに置く{from:デッキ}アクションでバースト効果持ちカードが破棄された（lastMillHadBurst）, then:破壊{対象:相手スピリット1体, filter}} | なし | condが「直前のアクション（millPer系）の結果」そのものなので純粋なifLastの例 |
| destroyOnePerCost | costs配列の各コストについて 破壊{対象:相手スピリット1体, filter:コスト=その値} を繰り返す（forEach） | 集合の各要素ごとに同じアクションを繰り返す組み合わせ方（forEach） | destroyCostsEachOneと重複type（統合候補） |
| destroyOwnByFamilyThenWipeEnemy | sequence[ 破壊{対象:指定系統を持つ自分のスピリットすべて}, 破壊{対象:相手のスピリットすべて} ] | なし | 対象は解決開始時に自分側→相手側の順で確定（中断復帰時の順序保証は実装都合） |
| destroyOwnFreelyThenDraw | sequence[ 破壊{対象:自分のスピリット好きなだけ(0以上・選択), 破壊時トリガー抑制}, ドロー{枚数:countCounter(破壊した数)} ] | 「破壊時（『このスピリットの破壊時』）トリガーを抑制する」という破壊アクションの軸 | 破壊は既存の単純アクションだが、「破壊時効果を発揮させない」という付随指定が現状の破壊アクションの軸に無い |
| destroySpiritBraveNexusEach | sequence[ 破壊{対象:相手スピリット1体(spiritFilter)}, 破壊{対象:相手の合体スピリットのブレイヴ1つ}, 破壊{対象:相手のネクサス1つ} ]（いずれか対象なしでも他は独立して成立） | なし | ブレイヴ破壊・ネクサス破壊も「破壊」の対象種別バリエーションとして表現可能という前提 |
| destroyThenMillByCost | sequence[ 破壊{対象:相手スピリット1体(filter, 非対話時実効BP最大)}, ifLast{cond:直前で破壊できた, then:トラッシュに置く{from:相手のデッキ, 量:countCounter(破壊したスピリットのコスト)}} ] | なし | |
| sacrificeNexusThenWipeEnemyNexusCores | pay{ cost:破壊{対象:自分のネクサス1つ(選択、非対話時コア数最小・同数は配列先頭)}, then:コアを取り除く{対象:相手のネクサスすべて, to:トラッシュ} } | なし | 「〜することで」構造。自分のネクサスが無い／破壊耐性で不発なら不発 |
| sacrificeOwnNexusesThenEnemyDestroysOwn | sequence[ 破壊{対象:自分のネクサスすべて（好きなだけの決定的簡略化）}, countCounter{破壊した数ぶん: 破壊{対象:相手自身のスピリット1体, 選ぶ人:相手}} ] | なし | 使用条件（自分フィールドにシンボル2つ以上のスピリットが必要）は別の発動条件軸として外側にある前提 |
| opponentTrashCardToDeckBottom | 戻す{対象:相手のトラッシュのカード1枚(選択), to:相手のデッキの下} | なし | |
| trashCardsToDeckBottom | 戻す{対象:自分のトラッシュのカード最大count枚（1枚ずつ選択・好きな順番・スキップ可）, to:自分のデッキの下} | なし | trashSpiritsToDeckBottomのカード種別問わない版（重複type気味） |
| trashMagicToDeckTop | 戻す{対象:自分のトラッシュのマジックカード1枚(選択、非対話時は末尾＝新しい方), to:自分のデッキの上} | なし | |
| trashSpiritsToDeckBottom | 戻す{対象:自分のトラッシュのスピリットカードcount枚（1枚ずつ選択・選んだ順、非対話時は末尾からその順）, to:自分のデッキの下} | なし | trashCardsToDeckBottomとほぼ同型（種別絞り込みだけが差分） |
| castMagicFromTrashByColor | 自分のトラッシュの指定色（省略時不問）マジックカード1枚（選択、非対話時は支払える中で最もコスト高い）を、コストを支払って使用する | 「カードを（手札以外のゾーンから）コストを支払って使用する」という起動そのものの部品 | 単純アクション一覧にはゾーン移動はあるが「カードとして使用し効果を解決する」起動が無い。支払い元がリザーブ＋フィールドコアのみという簡略化あり |
| magicFreeUseFromHandOrTegamoto | 自分の手札/手元にある指定色（省略時不問）マジックカード1枚（選択。非対話時は手札→手元の順でコスト最大）を、コストを支払わずに使用する | 「カードを（ゾーン問わず）コストを支払わず使用する」起動そのものの部品（castMagicFromTrashByColorと同一部品） | handOnly指定時は手元を候補から除外というfilter条件で表現可 |
| magicMirrorRepeat | 直前に相手が使用したマジック（GameState.lastMagicCast、[マジックミラー]自身は除く）の効果を、自分が使用したものとして対象・コスト無償のまま再解決する | 「直前に使用されたマジックの効果を、使用者を差し替えて再解決する」という部品 | 既存のマジック使用部品（要る）とifLast的な「直前の状態参照」の組み合わせだけでは、対象・タイミングをそのまま引き継いで再解決する動きまでは表せない |
| handToOwnDeckTop | 戻す{対象:自分の手札count枚(選択、非対話時は手札末尾), to:自分のデッキの上} | なし | |
| opponentHandToDeckTop | 戻す{対象:相手の手札count枚(選択、選ぶ人:相手、非対話時は手札末尾), to:相手のデッキの上} | なし | |
| coreRemovePerHandDiscard | sequence[ トラッシュに置く{from:手札, 量:好きなだけ}, countCounter{破棄した枚数ぶん: コアを取り除く{対象:相手スピリット1体(実効BP最大、同一解決内の既選択は除外して広げる), to:トラッシュ}} ] | なし | 満天の牧草地の破棄禁止は外側の継続効果として前提 |
| coreRemoveByPayingSelfCores | pay{ cost:コアを取り除く{対象:このスピリット自身, 量:好きなだけ(0〜保持数の増減選択), to:トラッシュ}, then:countCounter{支払った数ぶん: コアを取り除く{対象:filter一致の相手スピリット1個, to:トラッシュ}} } | なし | 支払いで維持コア未満になれば消滅（既存の維持コア判定に委譲） |
| voidCoresAndMillByCost | sequence[ コアを取り除く{対象:familyFilter一致の自分のスピリット1体(選択、非対話時コスト最大)のコアすべて, to:ボイド}, トラッシュに置く{from:相手のデッキ, 量:countCounter(そのスピリットのコスト)} ] | なし | 該当スピリットがいなければ不発 |
| coreGainPer | コアを置く{from:ボイド, to:自分のリザーブ, 量:countCounter(counter)} | なし | コアステップ限定などの発動制限（voidCorePlacementBlocked）は別の期間・タイミング軸で外側にある前提 |
| voidCoreToSelfPer | コアを置く{from:ボイド, to:このスピリット, 量:countCounter(counter)} | なし | コアステップ限定の発動制限は外側の前提 |
| voidCoreToSelfPerBofuCount | コアを置く{from:ボイド, to:このスピリット, 量:countCounter(このスピリット自身が持つ【暴風】の指定数、無ければ0)} | なし | selfがfieldEventのselfOverride（召喚された当該スピリット）である点に注意 |
| refreshSelfByExhaustNexus | pay{ cost:疲労{対象:自分の回復状態のネクサス1つ(選択)}, then:回復{対象:このスピリット} }（ターン中の回数上限＝【強襲】の指定数） | なし | 回数上限は既存キーワード【強襲】の数値をそのまま使う。合体中のブレイヴ側keyword・継続付与も含めて上限を見る |
| refreshSelfBraveThenCombine | ifLast{cond:selfがスピリット状態・バトル外・召喚された対象スピリットと合体条件を満たす, then: sequence[回復{対象:このブレイヴ}, 合体{対象:このブレイヴ→召喚されたスピリット}]} | なし | 「回復してから合体」の順で実装。条件を満たさなければ回復もしない＝セット |
| refreshSelfByDestroyFamily | pay{ cost:破壊{対象:familyFilter一致・self以外の自分のスピリット1体(選択、非対話時実効BP最小)}, then:回復{対象:このスピリット} } | なし | 何を犠牲にするかはプレイヤーが選ぶ（COST_MODEL.md §2） |
| refreshSelfByReturnToDeckTopName | pay{ cost:戻す{対象:nameIncludes一致・self以外の自分のスピリット1体(選択), to:デッキの上}, then:回復{対象:このスピリット} } | なし | refreshSelfByDestroyFamilyの「破壊」を「戻す」に差し替えた同型 |
| refreshSelfByReturnToHandFamily | pay{ cost:戻す{対象:familyFilter一致・self以外の自分のスピリット1体(選択), to:手札}, then:回復{対象:このスピリット} } | なし | 同上の「手札に戻す」版 |
| exhaustSelfThenLendThisTurn | pay{ cost:疲労{対象:このスピリット自身}, then:このスピリットをこのターンの間、自分の仮想発生源として貸し出す } | 「効果の発生源をこのターン/このバトルの間、貸し出す（仮想発生源）」という組み合わせ方 | 単純アクション一覧の状態変化・数値変更・コア移動・ゾーン移動のどれにも当たらない継続効果の仕組み。lendSelfThisTurn/lendSelfThisBattleと共有の器（pushVirtualSource） |
| selfBuffPer | BPの変更{対象:このスピリット, 量:countCounter(counter)×amountPer, 期間:ターン終了時まで} | なし | selfが無い／カウント0ならno-op |
| bpBuffPer | BPの変更{対象:対象スピリット1体(選択、keywordFilterで絞り込み可), 量:countCounter(counter)×amountPer, 期間:ターン終了時まで} | なし | マジックの単発バフ専用の器。継続的な「〜1体につき」はkind:"aura"+AuraCounterで別に書く区分がある（型コメントの通り）。targetSameFamilyOwn等は対象選択後に対象依存で数えるEffectCounterの一種 |
| selfBuffByExhaustFamily | pay{ cost:疲労{対象:familyFilter一致(省略可)・回復状態の自分のスピリット1体(選択、非対話時実効BP最大)}, then:BPの変更{対象:このスピリット, 量:疲労させたスピリットの実効BP, 期間:ターン終了時まで} } | なし | 発生源自身も候補に含む（2026-08-20確認） |
| selfBuffByHandDiscard | pay{ cost:トラッシュに置く{from:手札, 対象:指定種別カード1枚(選択・任意)}, then:BPの変更{対象:このスピリット, 量:amount, 期間:ターン終了時まで} } | なし | 満天の牧草地の破棄禁止は外側の前提 |
| bpBuffAllPer | BPの変更{対象:filter一致(省略時絞り込みなし)の自分のスピリットすべて, 量:countCounter(counter)×amountPer, 期間:ターン終了時まで} | なし | bpBuffPerの単体対象を全体に広げた版 |
| bpBuffByExhaustOwn | pay{ cost:疲労{対象:回復状態の自分のスピリット1体(選択、非対話時実効BP最大)}, then:BPの変更{対象:自分のスピリット1体(選択、非対話時バトル中の自分のスピリットかフィールド先頭), 量:疲労させたスピリットの実効BP, 期間:ターン終了時まで} } | なし | |
| familyChoiceThenBpBuffAll | choose{選択肢:自分のフィールドが持つ系統の集合（1つ選ぶ・選ぶ人:使用者、非対話時は該当数最大の系統）, then:BPの変更{対象:選んだ系統を持つ自分のスピリットすべて（uncombinedOnly指定時は合体していないものだけ）, 量:amount, 期間:ターン終了時まで}} | なし | |
| costDiscardHandKeywordThenDraw | pay{ cost:トラッシュに置く{from:手札, 対象:指定キーワード(省略可)・指定種別(省略時spirit)のカード1枚(選択)}, then:ドロー{枚数:count} } | なし | 満天の牧草地の破棄禁止は外側の前提 |
| costOwnSpiritCoresToTrashThenOpponent | pay{ cost:countCounter{count回: コアを取り除く{対象:自分のスピリット1体(選択、非対話時コア最多), 1個, to:トラッシュ}}, then:countCounter{count回: コアを取り除く{対象:相手のスピリット1体(選ぶ人:相手, 非対話時コア最多), 1個, to:トラッシュ}} } | なし | コアを取り除くスピリットは自分側=支払う本人が選び、相手側=相手が選ぶ（CHOOSER_RULES.md） |
| costDiscardHandThenDiscardOpponentMagic | pay{ cost:トラッシュに置く{from:手札, 1枚(選択)}, then:トラッシュに置く{対象:相手の手札のマジックカード1枚, 選ぶ人:自分(相手の手札すべてを見て選ぶ)} } | なし | 自分の手札1枚以上・相手の手札にマジック1枚以上の両方が揃うときだけ発揮（COST_MODEL.md §1） |
| costDiscardHandThenDraw | pay{ cost:トラッシュに置く{from:手札, discardCount枚(選択)}, then:ドロー{枚数:drawCount} } | なし | |
| costDiscardHandTypeThenCoreRemove | pay{ cost:トラッシュに置く{from:手札, 対象:指定種別(cardTypes)のカード1枚(選択)}, then:コアを取り除く{対象:相手のスピリットのコアcount個, to:相手のリザーブ} } | なし | |
| costDiscardNamedThenPeek | pay{ cost:トラッシュに置く{from:手札, 対象:指定カード名のカード1枚}, then:相手の手札1枚(ランダムに選び、盤面は動かさず使用者だけに内容を見せる) } | 「カードの内容を、盤面を動かさず特定プレイヤーにだけ開示する（覗き見）」という部品 | ゾーン移動を伴わない情報開示は単純アクション一覧のどれにも該当しない。ランダム選択は「内容を見ないで選ぶ」の必然（SEMANTICS_AUDIT.md §3.14） |
| costOwnAllCoresThenEnemyCoresToReserve | pay{ cost:コアを取り除く{対象:実効BP≥minBpの自分のスピリット1体(選択、非対話時BP最大)のコアすべて, to:ボイド}, then:コアを取り除く{対象:相手のスピリットのコア合計count個(コアの多い個体優先/選択), to:相手のリザーブ} } | なし | コストを払えるスピリットがいなければ不発 |
| costSetBurstThenDraw | pay{ cost:バーストのセット{対象:自分の手札にあるバースト効果持ちカード1枚(選択)}, then:ドロー{枚数:count} } | なし | セットできたときだけドローする |
