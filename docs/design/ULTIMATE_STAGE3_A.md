# アルティメット段3 仕分け A（AI・logic・shared の `field.spirits`）

調査のみ。コードは変えていない。対象は 49 ファイル、**`field.spirits` を含むコード行 300 行**（コメント行 20 行は除外）。
数え方は行単位（1行に2回出ても1件）。`p1.spirits` のように `field.` を付けない別名経由の走査は拾えていない。
走査箇所の機械的な洗い出しは `git grep -n "field\.spirits"`、関数名は直前の `function` 宣言から付けた（ラムダ内の行は外側の関数名になる）。

## 仕分けの前提（自分で置いたもの）

- 「バトルの参加者・攻撃側・防御側をidで引く」は**実体**（アタック・ブロックするのがアルティメットでも引けるように）。条件の中身（系統・BP）は後段の `matchesTarget` 側で絞る。
- 「[...spirits, ...nexuses] を回して継続効果・誘発を探す」は**発生源**。`effectSources`（level.ts:245）に ultimates を足せば済むものは、そこに寄せる前提。
- 「自分のスピリットが N 体以上」「系統スピリットがいる」など**条件文がスピリットと書いているもの**は B1・B7 でスピリット。
- 「コアを置く先」は実体、「払う・数える・外す」はコア（prompt の分類どおり）。
- AI の合法手生成（legalMoves）の攻撃・ブロック・起動・コア配置は、漏れると AI がアルティメットを動かせなくなるので**実体**にした（評価関数だけを AI・表示とした）。
- debugBoard（デバッグ盤面の構築）は画面向けではないが後回しでよいので AI・表示に入れた。
- `GameState.ts:668`（fieldInstanceIdsOf）と `GameState.ts:769`（playerView）は、すでに ultimates を足してある。変更不要。

## 1. ファイルごとの表

### server/src/ai/attackPlan.ts（11）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 31 | planAttacks | 攻撃役をidで引く | AI・表示 |
| 33 | blockersOf | 相手ブロッカー列挙 | AI・表示 |
| 34 | blockersOf | ブロッカー数の見積り | AI・表示 |
| 42 | hits | 相手の脅威シンボル | AI・表示 |
| 50 | hits | 自軍の回復中の数 | AI・表示 |
| 52 | hits | 致死判定の相手シンボル | AI・表示 |
| 89 | levelPick | 回復中の味方id | AI・表示 |
| 95 | spare | コア融通の提供元 | AI・表示 |
| 97 | spare | コア融通の受け手 | AI・表示 |
| 111 | spare | コア融通の仮適用 | AI・表示 |
| 115 | spare | コア融通の仮適用 | AI・表示 |

### server/src/ai/blockPlan.ts（4）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 17 | blockPick | 攻撃側をidで引く | AI・表示 |
| 22 | blockPick | 相手の残り脅威 | AI・表示 |
| 23 | blockPick | 自軍の回復中の数 | AI・表示 |
| 27 | id | ブロッカーのBP | AI・表示 |

### server/src/ai/boardEval.ts（2）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 49 | sideParts | 盤面評価の自軍 | AI・表示 |
| 68 | sideParts | 相手の場の有無 | AI・表示 |

### server/src/ai/evaluate.ts（12）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 29 | findOnBoard | 盤面の個体検索 | AI・表示 |
| 45 | hasBlocker | 相手のブロッカー有無 | AI・表示 |
| 54 | hasLethalBlocker | 致死級ブロッカー有無 | AI・表示 |
| 116 | strongestOpponentBp | 相手の最大BP | AI・表示 |
| 126 | bonusFlipsBattle | 勝敗反転の自軍個体 | AI・表示 |
| 127 | bonusFlipsBattle | 勝敗反転の相手個体 | AI・表示 |
| 169 | scoreMove | 攻撃手の評価 | AI・表示 |
| 180 | scoreMove | 残る防御役の数 | AI・表示 |
| 183 | scoreMove | 相手の脅威数 | AI・表示 |
| 210 | scoreMove | コア移動の評価 | AI・表示 |
| 222 | scoreMove | ブロック手の評価 | AI・表示 |
| 225 | scoreMove | 攻撃側の取得 | AI・表示 |

### server/src/ai/legalMoves.ts（8）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 85 | choiceMoves | バースト無駄打ち判定 | AI・表示 |
| 196 | handMoves | 合体先の名前（手札のブレイヴ） | 実体 |
| 236 | push | マジックの使用先候補 | スピリット |
| 267 | abilityMoves | 起動効果の手の列挙 | 実体 |
| 288 | coreMoves | コアを置く手の候補 | 実体 |
| 295 | coreMoves | コアを外す手の候補 | コア |
| 324 | attackStepMoves | アタック手の列挙 | 実体 |
| 360 | blockMoves | ブロック手の列挙 | 実体 |

### server/src/ai/lookahead.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 90 | side | 探索ログの盤面表示 | AI・表示 |

### server/src/ai/moveTags.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 156 | pruneMoves | 手の絞り込み（自軍の有無） | AI・表示 |

### server/src/ai/spellFilter.ts（2）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 27 | wastedSpell | マジックの無駄打ち判定 | AI・表示 |
| 28 | wastedSpell | 相手の場の確認 | AI・表示 |

### server/src/logic/EffectModules.ts（25）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 269 | autoPayPlan | 自動払いの支払い元 | コア |
| 275 | autoPayPlan | レベル1維持コアの余り | 実体 |
| 476 | ownerPidOfInstance | 個体の持ち主逆引き | 実体 |
| 706 | hasLifeDamageNegate | ライフ減少無効の発生源 | 発生源 |
| 744 | drawStepBonusFor | ドロー加算の発生源 | 発生源 |
| 764 | coreStepBonusFor | コアステップ加算の発生源 | 発生源 |
| 777 | coreStepBonusFor | 自分の場に[名前]がいる条件 | スピリット |
| 780 | coreStepBonusFor | 自分の場に系統がいる条件 | スピリット |
| 796 | coreStepToLifeActive | コア→ライフ変換の発生源 | 発生源 |
| 842 | sweepLevelCostDepletion | 維持コア不足で消滅 | 実体 |
| 944 | findSpiritAny | 両陣営からid検索（findSpiritAny） | 実体 |
| 1079 | countEffectCounter | 合体ブレイヴのホスト探し | 実体 |
| 1093 | countEffectCounter | 合体ブレイヴのホスト探し | 実体 |
| 1137 | countEffectCounter | 場のコア総数 | コア |
| 1155 | countEffectCounter | 合体スピリットを数える | スピリット |
| 1158 | countEffectCounter | 合体中ブレイヴを数える | 判断が要る |
| 1161 | countEffectCounter | スピリット状態ブレイヴ数 | スピリット |
| 1171 | countEffectCounter | バトル相手をidで引く | 実体 |
| 1183 | countEffectCounter | バトル相手をidで引く | 実体 |
| 1261 | countEffectCounter | 系統スピリット数 | スピリット |
| 1270 | drawDoubleMultiplier | ドロー倍化の発生源 | 発生源 |
| 1305 | hasCorePlacedWatcher | コア配置監視の発生源 | 発生源 |
| 1319 | snapshotCorePlaces | コア配置の事前記録 | コア |
| 1334 | fireCorePlacedFromDiff | コア配置の誘発の発生源 | 発生源 |
| 1358 | fireCoreGainEvents | コア増加の誘発の発生源 | 発生源 |

### server/src/logic/GameEngine.ts（13）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 253 | requestPendingReviveConfirm | 破壊待機の復活確認の個体 | 実体 |
| 479 | doBattleSwapSummon | バトルスワップ召喚で場へ | スピリット |
| 527 | placeSummonedSpirit | ブレイヴの合体先 | 実体 |
| 531 | placeSummonedSpirit | 召喚スピリットを場へ | スピリット |
| 596 | doSummon | 神速で疲労させる個体 | スピリット |
| 658 | doSummon | 即召喚無償の発生源記録 | 発生源 |
| 732 | doSummon | 合体先名のログ | 実体 |
| 775 | payOffDestroy | 破壊で軽減の発生源 | 発生源 |
| 824 | requestResshinsokuDestination | コアの置き先候補 | 実体 |
| 1055 | doDetachBrave | 分離するブレイヴのホスト | 実体 |
| 1068 | doExchangeBrave | 交換元のホスト | 実体 |
| 1340 | doBlock | ブロックで疲労させる味方 | スピリット |
| 1659 | doActivateAbility | 起動コストで疲労させる系統 | スピリット |

### server/src/logic/GameState.ts（6）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 315 | boardFingerprint | 盤面指紋の体数 | 実体 |
| 317 | boardFingerprint | 盤面指紋のコア数列 | 実体 |
| 538 | clearBattle | バトル終了の一時状態消去 | 実体 |
| 652 | findSpirit | id検索ヘルパー（findSpirit） | 実体 |
| 668 | fieldInstanceIdsOf | 場のid集合（ultimates含む済） | 実体 |
| 769 | playerView | クライアント向け盤面（ultimates別送済） | AI・表示 |

### server/src/logic/PhaseManager.ts（13）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 42 | applyAttackStepNexusAsSpirit | ネクサスをスピリット化 | スピリット |
| 59 | revertAttackStepNexusAsSpirit | スピリット化の巻き戻し | スピリット |
| 65 | revertAttackStepNexusAsSpirit | スピリット化の巻き戻し | スピリット |
| 208 | turnStartSegments | リフレッシュ制限の判定 | 実体 |
| 210 | turnStartSegments | リフレッシュで回復 | 実体 |
| 290 | extraStepSource | 追加ステップの発生源 | 発生源 |
| 455 | endTurn | 回復不可カウンタ減算 | 実体 |
| 482 | endTurn | エンドで山札下へ戻す印 | 実体 |
| 501 | endTurn | ターン終了の一時状態消去 | 実体 |
| 516 | endTurn | スピリット化の巻き戻し | スピリット |
| 520 | endTurn | スピリット化の巻き戻し | スピリット |
| 608 | consumeNextRefreshRecords | 次リフレッシュ記録の場判定 | 実体 |
| 609 | consumeNextRefreshRecords | 次リフレッシュ記録の場判定 | 実体 |

### server/src/logic/RuleValidator.ts（11）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 184 | validateSummon | 合体先ホストの検証 | 実体 |
| 342 | grantedSoku | コア除去不可の個体探し | コア |
| 921 | validateDetachBrave | 分離のホスト検証 | 実体 |
| 1174 | validateActivateAbility | 疲労コストの候補有無 | スピリット |
| 1245 | validateAttack | 最初にアタックすべき個体 | 実体 |
| 1338 | forcedBlockers | 強制ブロッカー列挙 | 実体 |
| 1394 | validateBlock | ブロック疲労コストの候補 | スピリット |
| 1427 | validateBlock | 複数ブロックの候補 | 実体 |
| 1433 | validateBlock | 宣言済みブロッカー確認 | 実体 |
| 1473 | validateEndTurn | ターン終了時の強制アタック | 実体 |
| 1529 | hasLegalBlocker | ブロック可能な個体有無 | 実体 |

### server/src/logic/battleOutcomeTriggers.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 23 | collectBattleOutcomeTriggers | バトル勝者の個体 | 実体 |

### server/src/logic/battleResolve.ts（2）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 292 | destroyMarkedAtBattleEnd | バトル終了時の破壊印 | 実体 |
| 295 | destroyMarkedAtBattleEnd | 合体ブレイヴの破壊印 | 実体 |

### server/src/logic/brave.ts（9）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 46 | attachBrave | 単体ブレイヴを場から抜く | スピリット |
| 47 | attachBrave | 単体ブレイヴを場から抜く | スピリット |
| 79 | detachBraveByEffect | 分離ブレイヴをスピリット状態へ | スピリット |
| 291 | detachBravesOnLeaveFree | ホストにまだ合体中か | 実体 |
| 297 | detachBravesOnLeaveFree | ブレイヴをスピリット状態へ | スピリット |
| 318 | detachBravesOnLeave | ホストにまだ合体中か | 実体 |
| 338 | payableCores | 払えるコア数 | コア |
| 412 | keepBrave | 残したブレイヴを場へ | スピリット |
| 445 | autoPaySources | 自動払いの支払い元 | コア |

### server/src/logic/braveConditionGate.ts（4）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 36 | separateOnce | 合体条件割れの分離 | 実体 |
| 76 | separateBravesOverLimit | 合体上限超過の分離 | 実体 |
| 101 | trashSpiritStateBravesWhenForbidden | スピリット状態ブレイヴの廃棄 | スピリット |
| 103 | trashSpiritStateBravesWhenForbidden | スピリット状態ブレイヴの廃棄 | スピリット |

### server/src/logic/burstNegate.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 24 | findBurstNegate | 破壊できる系統スピリット | スピリット |

### server/src/logic/counted.ts（2）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 11 | countForTarget | 持ち主の逆引き | 実体 |
| 14 | countForTarget | 系統スピリット数 | スピリット |

### server/src/logic/debugBoard.ts（3）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 143 | applyDebugBoard | デバッグ盤面の構築 | AI・表示 |
| 146 | applyDebugBoard | デバッグ盤面の構築 | AI・表示 |
| 147 | applyDebugBoard | デバッグ盤面の構築 | AI・表示 |

### server/src/logic/derivedSettle.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 156 | collectSpiritEntries | 破壊・消滅待機の集計 | 実体 |

### server/src/logic/designation.ts（3）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 18 | redirectOffers | 指定先の申し出候補 | スピリット |
| 54 | holderSpirit | 指定の持ち主側id検索 | 実体 |
| 126 | settleOne | 指定後の個体をid検索 | 実体 |

### server/src/logic/destroyGate.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 23 | hasOwnNexusIndestructible | 破壊不可の発生源 | 発生源 |

### server/src/logic/fieldEventTriggers.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 444 | fireFieldEventTriggers | スピリット+ネクサスの色合計 | 判断が要る |

### server/src/logic/forcedBlock.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 28 | giveUp | 複数ブロックの揃え判定 | 実体 |

### server/src/logic/removal.ts（20）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 205 | enterDestroyWaiting | 破壊待機に入る個体 | 実体 |
| 209 | enterDestroyWaiting | 破壊待機に入る個体 | 実体 |
| 593 | flushDeferredCommits | 保留した破壊の確定 | 実体 |
| 605 | resumeDestroyCommit | 破壊確定の再開 | 実体 |
| 632 | destroyedCoresToSelfCandidates | 破壊コアを自身へ置く発生源 | 発生源 |
| 684 | applyCoreDestination | 破壊コアの置き先 | 実体 |
| 709 | commitPendingDestruction | 破壊の確定（場から離れる） | 実体 |
| 734 | commitPendingDestruction | 破壊の確定（場から抜く） | 実体 |
| 757 | winnerSurvives | 勝者が残るかの判定 | 実体 |
| 846 | fireQueuedDestroyBursts | ブレイヴ同時破壊のコスト集計 | スピリット |
| 1009 | destroyTargetsBatch | 破壊対象のid検索 | 実体 |
| 1428 | markBounce | 戻す待機に入れる判定 | 実体 |
| 1463 | flushBounces | 戻す待機の順序付け | 実体 |
| 1471 | flushBounces | 戻す待機の収集 | 実体 |
| 1519 | rank | 戻す待機の確定 | 実体 |
| 1523 | rank | 戻す待機の確定 | 実体 |
| 1525 | rank | 戻す待機の確定（場から抜く） | 実体 |
| 1835 | coreFloorOwnNamedFor | コア下限の発生源 | 発生源 |
| 1852 | coreFloorBlockingKeywordFor | バトル中の攻撃側取得 | 実体 |
| 1853 | coreFloorBlockingKeywordFor | バトル中の自分判定 | 実体 |

### server/src/logic/revive.ts（18）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 207 | wouldAskReviveConfirm | 復活確認の個体 | 実体 |
| 559 | applyFushiSummon | 【不死】等の召喚で場へ | スピリット |
| 648 | applySpiritMillFreeSummon | 山札破棄召喚で場へ | スピリット |
| 669 | applyReviveConfirm | 復活確認の応答 | 実体 |
| 692 | applyReviveCostPick | 復活コスト選択の応答 | 実体 |
| 714 | declineReviveConfirm | 復活辞退の応答 | 実体 |
| 878 | exhaustCostCandidates | 復活の疲労コスト候補 | スピリット |
| 912 | applyCost | 自身を手札へ戻すコスト | 実体 |
| 915 | applyCost | 自身を手札へ戻すコスト | 実体 |
| 968 | removable | 復活コストのコア置き元 | コア |
| 1201 | reviveCostReason | 自身を手札へ戻せるか | 実体 |
| 1209 | reviveCostReason | トラッシュへ置けるコア有無 | コア |
| 1263 | applyRevived | 復活の代替で場から抜く | 実体 |
| 1264 | applyRevived | 復活の代替で場から抜く | 実体 |
| 1276 | applyRevived | 復活の代替で場から抜く | 実体 |
| 1277 | applyRevived | 復活の代替で場から抜く | 実体 |
| 1311 | matchesRequireOwnFieldHasName | 場に[名前]がいる条件 | スピリット |
| 1320 | matchesReviveCondition | 自分のスピリット条件 | スピリット |

### server/src/logic/revivePickMany.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 38 | nextOffer | 複数復活の個体検索 | 実体 |

### server/src/logic/soulCore.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 58 | soulInstance | ソウルコアの宿主検索 | 実体 |

### server/src/logic/stepTriggers.ts（5）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 234 | fireStepTriggers | ステップ誘発の発生源 | 発生源 |
| 300 | fireStepTriggers | コスト以上のスピリット条件 | スピリット |
| 305 | fireStepTriggers | BP以上のスピリット条件 | スピリット |
| 513 | ensureBpSeen | BP推移の初期記録 | 実体 |
| 533 | fireBpReachedTriggers | BP到達の検出 | 実体 |

### server/src/logic/summon.ts（6）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 170 | stillOnField | 召喚後に場にいるか | スピリット |
| 236 | stillOnField | 召喚後に場にいるか | スピリット |
| 375 | fromField | 合体先ホスト | 実体 |
| 379 | fromField | 召喚スピリットを場へ | スピリット |
| 469 | fromField | 合体先ホスト | 実体 |
| 471 | fromField | 召喚スピリットを場へ | スピリット |

### server/src/logic/summonGate.ts（2）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 112 | summonDenial | 召喚数の上限 | スピリット |
| 116 | summonDenial | ターン召喚数の制限 | スピリット |

### server/src/logic/targeting.ts（3）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 32 | targetableSpirits | 対象候補の入口（targetableSpirits） | スピリット |
| 261 | pickOwnKeywordTarget | 自分のキーワード対象 | スピリット |
| 354 | onField | 場の待機中の安全網 | 実体 |

### server/src/logic/triggers.ts（4）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 152 | isTriggerSuppressed | 誘発抑制の発生源 | 発生源 |
| 307 | matches | 自分のスピリット条件 | スピリット |
| 389 | has | BP以上のスピリット条件 | スピリット |
| 425 | has | 名前を含むスピリット数 | スピリット |

### shared/block.ts（3）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 99 | blockDestroyCandidates | ブロックで破壊する味方 | スピリット |
| 219 | matchesDirectedAttackFilter | 最高BPの相手スピリット | スピリット |
| 262 | mandatoryDirectAttackTargetIds | 強制の指定アタック先 | スピリット |

### shared/cost.ts（16）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 34 | costModSum | 軽減加算の発生源 | 発生源 |
| 64 | costModSum | 系統スピリット数の軽減条件 | スピリット |
| 173 | reductionGrantSymbols | 色スピリット数の軽減条件 | スピリット |
| 194 | reductionGrantSymbols | 系統スピリット数ぶんの軽減 | スピリット |
| 212 | reductionGrantSymbols | 軽減に使う系統スピリット数 | スピリット |
| 247 | hasMagicRestriction | マジック使用制限の発生源 | 発生源 |
| 273 | hasMagicCostLock | マジックコスト固定の発生源 | 発生源 |
| 286 | hasMagicCostLock | キーワード持ちスピリット条件 | スピリット |
| 305 | hasMagicColorBan | マジック色禁止の発生源 | 発生源 |
| 391 | findMagicFreeGrantSource | マジック無償の発生源 | 発生源 |
| 439 | findSokuFreeSummonSource | 即召喚無償の発生源 | 発生源 |
| 485 | ownFieldSymbolColors | 場の色（シンボル）集合 | 判断が要る |
| 541 | costSetOverride | 相手のコスト条件スピリット | スピリット |
| 544 | costSetOverride | 自分にスピリットがいない条件 | スピリット |
| 722 | summoningSymbolBonus | 召喚時シンボルの加算数 | スピリット |
| 732 | ownFamilySpiritCostAdjust | 系統スピリット数でコスト増減 | スピリット |

### shared/handBurstEffect.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 19 | handBurstEffectDenial | アタッカーの取得 | 実体 |

### shared/magicCondition.ts（8）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 19 | magicConditionFailure | シンボル数条件のスピリット | スピリット |
| 31 | magicConditionFailure | バトル中の系統スピリット | スピリット |
| 38 | magicConditionFailure | ブロック中のスピリット | スピリット |
| 44 | magicConditionFailure | スピリット数条件 | スピリット |
| 47 | magicConditionFailure | 相手スピリット数条件 | スピリット |
| 51 | magicConditionFailure | 色スピリット条件 | スピリット |
| 55 | magicConditionFailure | 名前一致のスピリット | スピリット |
| 60 | magicConditionFailure | 名前一致のスピリット数 | スピリット |

### shared/rules/activation.ts（13）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 54 | sokuPayableInstanceIds | 即召喚の支払い元 | コア |
| 82 | payAssistCandidates | 疲労軽減の候補 | スピリット |
| 83 | payAssistCandidates | 疲労軽減の制約判定 | スピリット |
| 117 | magicPayAssistCandidates | マジック疲労軽減の候補 | スピリット |
| 118 | magicPayAssistCandidates | マジック疲労軽減の制約判定 | スピリット |
| 282 | braveCombineOntoSelfCandidates | 合体できるブレイヴ候補 | スピリット |
| 323 | returnFilter | 戻すコストの対象数 | スピリット |
| 337 | returnFilter | 戻すコストの対象数 | スピリット |
| 351 | timedTargetsExist | 時限効果の対象有無 | スピリット |
| 362 | filter | 疲労コストの対象数 | スピリット |
| 451 | hasCard | 疲労コストの候補有無 | スピリット |
| 543 | handSummonCostPayable | 手札召喚のコア総数 | コア |
| 595 | isFlashLockedFor | フラッシュ制限の攻撃側 | 実体 |

### shared/rules/bp.ts（16）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 81 | countSpiritsWeighted | 重み付きスピリット数 | スピリット |
| 125 | countAuraCounter | 系統スピリット数 | スピリット |
| 127 | countAuraCounter | 持ち主の逆引き | 実体 |
| 140 | countAuraCounter | ブレイヴ数 | スピリット |
| 153 | countAuraCounter | バトル相手をidで引く | 実体 |
| 272 | checkAuraCondition | 相手のアタッカー取得 | 実体 |
| 312 | checkAuraCondition | 自分のスピリット条件 | スピリット |
| 317 | checkAuraCondition | 相手のスピリット条件 | スピリット |
| 323 | checkAuraCondition | バニラスピリット数条件 | スピリット |
| 336 | checkAuraCondition | 系統スピリット数条件 | スピリット |
| 359 | checkAuraCondition | 場の色の有無（スピリット+ネクサス） | 判断が要る |
| 363 | checkAuraCondition | 色スピリット条件 | スピリット |
| 367 | checkAuraCondition | キーワード持ちスピリット条件 | スピリット |
| 381 | checkAuraCondition | スピリット数の上限条件 | スピリット |
| 387 | checkAuraCondition | バトル相手の取得 | 実体 |
| 394 | checkAuraCondition | 系統スピリット条件 | スピリット |

### shared/rules/constraints.ts（15）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 104 | activeConstraintsWithSource | 系統スピリット不在条件 | スピリット |
| 112 | activeConstraintsWithSource | 相手の色スピリット条件 | スピリット |
| 395 | costExhaustLocked | 効果疲労禁止の判定 | スピリット |
| 460 | onField | 合体ホストが場にいるか | 実体 |
| 748 | instCantBlockByCost | 持ち主の逆引き | 実体 |
| 839 | instCantAttackByFewOwnSpirits | スピリット数でアタック不可 | スピリット |
| 998 | protectedByBpUpToSelf | 持ち主の逆引き | 実体 |
| 1000 | protectedByBpUpToSelf | BP以下の相手スピリット条件 | スピリット |
| 1128 | hasImmunityAgainst | 耐性付与の発生源 | 発生源 |
| 1202 | timedRecordsOn | スピリットすべて記録の判定 | スピリット |
| 1259 | magicUseWindowDenial | 攻撃側の逆引き | 実体 |
| 1328 | burstActivationForbidden | 攻撃側の取得 | 実体 |
| 1339 | burstActivationForbidden | 攻撃側の取得 | 実体 |
| 1409 | mustAttackOnceBlocksEnd | アタック宣言できる個体 | 実体 |
| 1420 | mustBeAttackTargetIds | 指定されるべき相手スピリット | スピリット |

### shared/rules/keywordState.ts（4）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 261 | familiesSuppressed | 持ち主の逆引き | 実体 |
| 265 | familiesSuppressed | 持ち主の逆引き | 実体 |
| 368 | spiritHasFamily | 場の系統からの付与 | スピリット |
| 404 | spiritHasFamily | スピリット+ネクサスの色合計 | 判断が要る |

### shared/rules/level.ts（15）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 237 | battlers | battlers の定義 | 実体 |
| 245 | effectSources | effectSources の定義 | 発生源 |
| 299 | nexusEffectsDisabledFor | ネクサス無効化の発生源 | 発生源 |
| 322 | nexusEffectsDisabledFor | ネクサス無効化の発生源 | 発生源 |
| 458 | colorlessWhenAttacking | 色無し化の対象判定 | スピリット |
| 478 | fieldColorCount | 場の色の種類数 | 判断が要る |
| 489 | ownFieldOnlyColor | 場が単色か | 判断が要る |
| 502 | ownTeamAtLeast | チーム数条件 | スピリット |
| 515 | ownAllHaveTeam | 全員がチーム（スピリット+ネクサス） | 判断が要る |
| 522 | ownAllHaveFamily | 全員が系統（スピリット+ネクサス） | 判断が要る |
| 528 | ownAllSpiritsHaveFamily | スピリット全員が系統 | スピリット |
| 624 | hostsOf | ブレイヴのホスト列挙 | 実体 |
| 650 | braveBpBonus | 持ち主の逆引き | 実体 |
| 741 | isSpiritOnField | 場にスピリットとしているか | 実体 |
| 752 | isOnFieldAnyZone | 場のどこかにいるか | 実体 |

### shared/rules/resistance.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 194 | isExhaustImmuneOnBoard | 疲労耐性の発生源 | 発生源 |

### shared/rules/symbols.ts（3）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 75 | combinedSpiritSymbolColors | 合体先ホストのシンボル | 実体 |
| 100 | countSymbols | 軽減シンボルの集計 | 判断が要る |
| 130 | flexibleSymbolUnits | 多色シンボルの集計 | 判断が要る |

### shared/rules/waiting.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 89 | anyWaiting | 待機状態の有無 | 実体 |

### shared/summon.ts（5）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 33 | braveCombineCandidates | ブレイヴの合体先候補 | 実体 |
| 51 | refsOf | 交換元のホスト | 実体 |
| 52 | refsOf | 交換先のホスト | 実体 |
| 67 | braveExchangeTargets | 交換できる先 | 実体 |
| 130 | battleSwapSummonCheck | バトル中の名前一致スピリット | スピリット |

### shared/summonPayOff.ts（1）

| 行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 23 | summonPayOffOptions | 破壊で軽減の発生源 | 発生源 |

## 2. 分類ごとの件数

| 分類 | 件数 | うち ai/ | うち logic/ | うち shared/ |
| :-- | --: | --: | --: | --: |
| 実体 | 112 | 5 | 81 | 26 |
| スピリット | 100 | 1 | 46 | 53 |
| 発生源 | 28 | 0 | 16 | 12 |
| コア | 11 | 1 | 8 | 2 |
| AI・表示 | 38 | 34 | 4 | 0 |
| 判断が要る | 11 | 0 | 2 | 9 |
| 合計 | 300 | 41 | 157 | 102 |

実体の 112 件のうち、`field.spirits.find((s) => s.instanceId === …)` 型の id 検索は 33 件（下の 4 節）。

## 3. 判断が要る（11 件）

問いは 3 つにまとまる。

| ファイル:行 | 何を問うているか | 候補の分類 | 見立て |
| :-- | :-- | :-- | :-- |
| keywordState.ts:404 / fieldEventTriggers.ts:444 | `ownColorTotalAtLeast`「スピリットとネクサスの合計が指定色で N 以上」にアルティメットを数えるか | スピリット（数えない）／実体（数える） | スピリット。効果文が「スピリット/ネクサス」と書いてあるので B1・B7。ただし実カードの文面で「フィールドのカード」と書かれたものがあれば実体 |
| bp.ts:359（hasOwnColor） | 「自分のフィールドに赤のカードがある」でアルティメットの色を見るか | 実体／スピリット | 実体。この条件は文面が「スピリット」と限定していない。ただし B11（極シンボルは色に数えない）はシンボルの話で、カードの色とは別。要確認 |
| cost.ts:485（ownFieldSymbolColors） | 場の色シンボル集合。B11 で極シンボルを色に数えないと決まっているが、アルティメットのカード自体を走査に入れるか | 実体（含めて極だけ除く）／スピリット | 実体。ULTIMATE.md §5 が「ownFieldSymbolColors にも countSymbols と同じ判断を入れる」と書いており、走査には入れる前提 |
| symbols.ts:100（countSymbols）・symbols.ts:130（flexibleSymbolUnits） | 軽減のシンボル集計。ULTIMATE.md §5 の表では、アルティメットのシンボルは「究極シンボルを軽減に持つカード」だけ数える | 実体（走査に入れて極の扱いを中で分ける）／スピリット | 実体。走査に入れないと「究極シンボルを軽減に持つカード」の軽減が出ない |
| level.ts:478（fieldColorCount）・level.ts:489（ownFieldOnlyColor） | `spiritsOnly` でない側（ネクサスも含む側）にアルティメットを足すか。`spiritsOnly` 側は B1 でスピリットのまま | 実体（非 spiritsOnly 側）／スピリット | 非 spiritsOnly 側は実体、spiritsOnly 側はスピリット。1行の中で分岐しているので、行ごとの仕分けではなく分岐ごとに直す |
| level.ts:515・level.ts:522（ownAllHaveTeam / ownAllHaveFamily） | 「自分のスピリット/ネクサスすべてが〜」でアルティメットが混ざると条件が割れるか | スピリット／実体 | スピリット。文面が「スピリット/ネクサス」で、アルティメットを足すとすべてが成立しにくくなる方向にだけ効くため、安全側に倒す |
| EffectModules.ts:1158（ownCombinedBraves） | 「合体しているブレイヴの数」を、ホストがアルティメットでも数えるか（B13 で合体できる） | スピリット（ホストはスピリットだけ）／実体（ホスト種別を問わない） | 実体。数えるのはブレイヴで、ホストの種別は B7 の「スピリットを数える」に当たらない。この counter を使うカードの効果文を見てから確定 |

**判断のうち、段4（B11・B13）で決まるもの**: symbols.ts:100・130、cost.ts:485、EffectModules.ts:1158。段3 では「走査に入れる」ところまでを先に決め、中身の扱いは各段の規則に任せるのが自然。

## 4. ヘルパー1つで済む候補

| 候補 | 影響する出現 | 中身 |
| :-- | --: | :-- |
| `findSpirit(player, id)`（GameState.ts:652）の中身を `battlers()` に変える | この定義 1 行。**外からの呼び出しが 80 件**あり、そのうち実体の id 検索は多い | 1行の置換で多数が済む。ただし `RuleValidator.ts:772`（マジックの使用先がスピリットか）のように「スピリットか」の判定に使う呼び出しもあるので、**新名 `findBattler` を足して呼び出しを移す**か、全呼び出しを仕分ける必要がある。そのまま findSpirit を広げると B1 の判定が黙って崩れる |
| `findSpiritAny(state, id)`（EffectModules.ts:944） | 定義 1 行、外からの呼び出し 84 件 | 同上。`pendingChoice.selfInstanceId` の解決用と書かれており、実体の id 検索が大半の見込み |
| 実体の id 検索（`field.spirits.find((s) => s.instanceId === id)` 型の直書き） | 33 件（removal 7、revive 4、GameEngine 3、designation 2、EffectModules 2、constraints 2、summon 2、ほか） | `findSpirit` を使わず直書きされている分。ヘルパー（findBattler）に寄せれば仕分けが要らなくなり、以後の走査追加で書き漏らさなくなる |
| `isOnFieldAnyZone`（level.ts:752）に ultimates を足す | 定義 1 行、呼び出し 6 件 | 1 行足せば済む。実体の「まだ場にいるか」の判定は全部ここを通っている |
| `effectSources`（level.ts:245）に ultimates を足す | `effectSources` の呼び出し元 149 件は仕分け不要になる | 発生源 28 件のうち 19 件は `[...spirits, ...nexuses]` の直書き（cost.ts 6、EffectModules.ts 8、constraints・destroyGate・resistance・triggers・stepTriggers 各 1）で `effectSources` を通っていない。**この 19 件を `effectSources` 経由に直す**ほうが、1つずつ ultimates を足すより安全（ただし仮想発生源を混ぜてはいけない箇所があるので、直す前に level.ts:225 付近のコメントを読む） |
| 持ち主の逆引き（`board.players.p1.field.spirits.includes(x) ? "p1" : "p2"`） | 9 件（counted、bp、constraints 2、keywordState 2、level、EffectModules.ts:476 ほか） | `oncePerTurn.ts:24` に `ownerPidOfInstance` があるが `field.spirits` と `nexuses` しか見ていない。これに ultimates を足し、直書き 9 件をこれに寄せれば、逆引きの仕分けが消える |
| ホスト検索（`braveRefs` で合体先を探す） | 15 件（EffectModules 2、GameEngine 2、RuleValidator 2、brave 2、summon.ts 2、shared/summon.ts 2、constraints、symbols、level.ts:624） | `hostsOf(player, brave)`（level.ts:624）がすでにある。ここを battlers に変え、直書き 14 件を寄せる。B13 の「アルティメットに合体できる」の実現で必要 |
| 場から抜く手順（`splice` + `trashUnderCards` + `soulCoreLeavesField` + `detachBravesOnLeave`） | removal 2、revive 2、PhaseManager 1、brave 1、braveConditionGate 1（計7か所）| `detachBravesOnLeave` だけが共通入口で、splice から下の4行は各所に書き写されている。**`leaveField(state, player, inst)` を1つ作って寄せる**と、アルティメットの配列（ultimates）を抜く処理を1か所に足せる。段3 より先にやる価値がある |

## 5. 段3 を何本の PR に分けるかの見立て

仕分けの結果から、種類が違うものは分ける（プロジェクト規則）。

| PR | 中身 | 件数の目安 |
| :-- | :-- | --: |
| 3a | 上の4節のヘルパー（`findBattler`・`isOnFieldAnyZone`・`effectSources`・`ownerPidOfInstance`・`hostsOf`・`leaveField`）を直し、直書きをヘルパー経由にする。挙動は変えない | 実体のうち約 70、発生源 19 |
| 3b | 残りの実体（バトル・維持コア・リフレッシュ・待機状態）を `battlers()` へ | 約 40 |
| 3c | コア 11 件（払う・数える・外す）にアルティメットを含める | 11 |
| 3d | AI・表示 38 件 | 38 |
| （段4 へ） | 判断が要る 11 件。B11・B13 の確定後 | 11 |

スピリット 100 件は触らない。3a で直書きを減らしてから 3b に進むと、3b の差分が小さくなる。
