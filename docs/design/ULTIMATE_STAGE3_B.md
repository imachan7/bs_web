# アルティメット 段3 仕分け B（field.spirits の走査 214 か所・担当ファイル分）

調査だけ。コードは変えていない（2026-11-27）。規則は ULTIMATE_PLAN の B 行（B1・B2・B3・B6・B7・B8・B10・B13）。
- 対象：担当 46 ファイルの `field.spirits` 全出現のうち、コメント行を除いた 218 か所から、型ファイルの行末コメント 4 か所（effectAction.ts:182・183、effectCounter.ts:58、targetFilter.ts:96）を除いた **214 か所**。`gameState.ts`・`cardInstance.ts`・`choice.ts`・`effectDefContinuous.ts` はコメントだけで実コードの出現が 0。
- 「関数」欄は直前にある function／const の名前を機械で拾った推定（入れ子の無名関数の中では外側の名前になる）。
- 「実体」は `battlers()`、「発生源」は `effectSources` に ultimates を足す、「コア」はアルティメットのコアも含める。「スピリット」「AI・表示」は今は変えない。
- 仕分けの線引き（迷ったときの基準）：
  - **選ばれた対象を id で再び引く行**は、候補を作った側と同じ分類に揃える（候補が「スピリット」なら再引きも「スピリット」。ここだけ battlers にすると、段5 の `kinds` 導入前にアルティメットが紛れ込める）。
  - **発生源・ホスト・アタッカー・ブロッカー・維持コアの対象など「その個体が場にいるか／その個体を引く」行**は「実体」。
  - **「コスト・取り元として場のコアを払う／数える」行**は「コア」（B2）。「スピリット上のコア」と書かれる取り先（from:"spirit" 等）は「判断が要る」に回した。


## index.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 276 | buildGameAttachment | 画面用の場の一覧を作る | AI・表示 |

## logic/actions/battleFlow.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 125 | (関数外/式) | バトルで破壊された個体のコアをボイドへ | 実体 |
| 285 | (関数外/式) | アタッカー入れ替え先の自分スピリットを引く | スピリット |
| 560 | finishBraveSummon | 合体先ホストをidで再引き(合体後回復) | 実体 |
| 576 | resolveBraveSummon | 合体先候補を名前で絞るためidで引く | 実体 |
| 925 | askPick | 同コストの自分スピリットを生贄候補に | スピリット |
| 1171 | candidates | 発生源ブレイヴがスピリット状態か確認 | スピリット |
| 1173 | candidates | 合体先ホストをidで引く | 実体 |
| 1227 | candidates | 選択済みブレイヴ(スピリット状態)を引く | スピリット |
| 1228 | candidates | 合体先ホストをidで引く | 実体 |
| 1276 | brave | 合体先ホストを引く | 実体 |
| 1329 | collect | スピリット状態のブレイヴを集める | スピリット |
| 1334 | collect | ホストに合体中のブレイヴを集める | 実体 |
| 1537 | removeOne | ブレイヴが合体しているホストを探す | 実体 |
| 1646 | removeOne | 相手のブレイヴ持ちホストを列挙 | 実体 |
| 1710 | plan | 外したブレイヴ(スピリット状態)を引く | スピリット |
| 1713 | plan | 合体先ホストをidで引く | 実体 |
| 1721 | plan | ブレイヴ持ちホストをidで引く | 実体 |

## logic/actions/bounce.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 32 | ownSideBounceCandidates | 自分側の手札へ戻す候補 | スピリット |
| 118 | returnOwnAsCost | 発生源が場にいるか(コストで戻す) | 実体 |
| 157 | returnOpponentBrave | 相手のブレイヴ持ちホストを列挙 | 実体 |
| 180 | returnToHandHandler | 発生源が場にいるか(戻す入口の判定) | 実体 |
| 676 | returnSelfToDeckBottomAsCost | 発生源が場にいるか(デッキ下コスト) | 実体 |
| 835 | blocked | 破壊待機の発生源の位置を探す | 実体 |
| 837 | blocked | 破壊待機の発生源を場から抜く | 実体 |
| 875 | returnDestroyedSelfToDeckTop | 破壊待機の発生源の位置を探す | 実体 |
| 877 | returnDestroyedSelfToDeckTop | 破壊待機の発生源を場から抜く | 実体 |

## logic/actions/control.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 51 | modeHasDestroyTarget | 相手の破壊対象が居るか(モード先頭) | スピリット |
| 449 | summonBurstCardFreeHandler | バーストで召喚したスピリットを場へ | スピリット |

## logic/actions/coreGain.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 26 | (関数外/式) | 破壊されたコアの付け替え先スピリット | スピリット |

## logic/actions/cores.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 48 | moveRichestSpiritCoresToTrash | コスト用にフィールドのコアをトラッシュへ | コア |
| 81 | fieldOrReserveCores | フィールド/リザーブの払えるコア総量 | コア |
| 94 | fieldOrReserveCores | 自分以外のスピリットのコアを吸う対象 | スピリット |
| 105 | fieldOrReserveCores | 吸う対象をidで再引き | スピリット |
| 114 | fieldOrReserveCores | 吸った後の体数(破壊数の検出) | スピリット |
| 117 | fieldOrReserveCores | 吸った後の体数(破壊数の検出) | スピリット |
| 202 | n | コアの取り元(フィールド)の選択肢 | コア |
| 239 | autoTakeCoresToVoid | フィールドから最多コアを自動で取る | コア |
| 280 | totalCoresOf | フィールド+トラッシュ+リザーブのコア合計 | コア |
| 335 | totalCoresOf | コアの移し先は別のスピリット | スピリット |

## logic/actions/declare.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 71 | zoneOf | 宣言の候補となる場のスピリット/ネクサス | スピリット |
| 105 | candidatesFor | 宣言の最頻値を取る母集団(自分) | スピリット |
| 106 | candidatesFor | 宣言の最頻値を取る母集団(相手) | スピリット |

## logic/actions/designate.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 19 | finish | 指定したスピリット名のログ | スピリット |

## logic/actions/destroy.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 94 | destroyCandidateCountForPay | 発生源の場の個体(同Lv指定の基準) | 実体 |
| 427 | destroyAllTargetList | 相手スピリットを全破壊する対象 | スピリット |
| 437 | destroyAllTargetList | 自分スピリットを全破壊する対象 | スピリット |
| 503 | destroyTargetList | 同名スピリットの破壊(相手側) | スピリット |
| 825 | onField | 選択済み対象を場でidから引く | スピリット |
| 878 | budgetOf | 自分の系統スピリットのBP合計(予算) | スピリット |
| 934 | onField | 選択済み対象を場でidから引く | スピリット |
| 1034 | reviveLastDestroyedNexusBlockReason | フィールド/リザーブから払えるコア数 | コア |
| 1086 | reviveLastDestroyedNexusBlockReason | コアを取った後の維持コア割れ消滅 | 実体 |
| 1203 | candidatesOf | 2体を残す全体破壊の候補 | スピリット |
| 1258 | pickMaxBp | 2体を残す全体破壊の実行対象 | スピリット |
| 1413 | destroyOwnSpiritsAny | 自分のスピリットを任意で破壊する候補 | スピリット |

## logic/actions/destroyOwnBrave.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 33 | ownBraveCandidates | 選んだブレイヴのホストを探す | 実体 |

## logic/actions/exhaustBudget.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 18 | onField | 選択済み対象を場でidから引く | スピリット |

## logic/actions/exhaustRefresh.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 63 | spirits | 疲労の前後で疲労済みを記録 | スピリット |
| 135 | ask | 疲労の上限=相手(と自分)のスピリット数 | スピリット |
| 148 | exhaustCore | 回復状態のスピリット数から逆算 | スピリット |
| 198 | matchesOwn | 選択済み対象をidで再引き | スピリット |
| 224 | better | 選択済み対象をidで再引き | スピリット |
| 446 | exhaustAllTargets | 全体疲労の対象を集める | スピリット |
| 604 | exhaustSpiritsOfColor | 指定色のスピリットを疲労 | スピリット |
| 750 | refreshOneHandler | イベント対象を回復(再引き) | スピリット |
| 773 | refreshOneHandler | 全体回復の対象を集める | スピリット |
| 888 | applyLevelUpThisTurn | 対象の持ち主側を判定(Lv上げ記録) | 実体 |
| 974 | refreshSpiritsOfFamily | 系統スピリットを回復 | スピリット |

## logic/actions/filter.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 95 | normalizeFilter | 発生源が場にいるか(同Lv指定) | 実体 |
| 143 | normalizeFilter | 自分の系統スピリットのコスト集合 | スピリット |
| 205 | normalizeFilter | 直前の対象を引いてLv1のBP取得 | スピリット |
| 228 | normalizeFilter | 自分のスピリット数でBP上限を加算 | スピリット |

## logic/actions/fireEffect.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 55 | bunshinEntries | 分身を発揮できる自分のスピリット候補 | スピリット |
| 89 | fire | 効果を発揮させる自分のスピリット一覧 | スピリット |
| 95 | fire | 発揮対象をidで再引き | スピリット |
| 159 | fire | 相手召喚時効果を再発揮する自分の候補 | スピリット |

## logic/actions/grant.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 107 | grant | 系統スピリットが場にいるか(付与の可否) | スピリット |
| 193 | pickSingleTarget | 付与先の自分スピリット候補 | スピリット |
| 271 | pickSingleTarget | ブロック不可を受けた自分スピリット | スピリット |
| 406 | pred | 付与先の自分スピリット候補 | スピリット |
| 448 | doTargetChoiceLendThisTurn | 貸与先をidで引く(両陣営) | スピリット |
| 449 | doTargetChoiceLendThisTurn | 貸与先をidで引く(相手側・続き) | スピリット |
| 512 | doTargetChoiceLendThisTurn | ネクサスをスピリット扱いで場へ(貸与) | スピリット |
| 548 | doTargetChoiceLendThisTurn | 貸与で置けるコアの上限(場+リザーブ) | コア |
| 563 | doTargetChoiceLendThisTurn | 貸与のコスト用に場のコアを取る | コア |
| 576 | doTargetChoiceLendThisTurn | ネクサスをスピリット扱いで場へ | スピリット |

## logic/actions/moveCards.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 138 | affordable | 場+リザーブで払えるか(場のコア) | コア |
| 150 | fieldCoresSpendable | 場のコアで払える量(維持コア除く) | コア |
| 279 | fromField | 支払い元の場のコア量をidで引く | コア |
| 549 | nextHost | ブレイヴを合体させるホスト候補の列挙 | 判断が要る |
| 589 | finish | 選んだホスト名をidで引く | 実体 |

## logic/actions/pay.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 129 | summonFromHandPayable | 相手のブレイヴ持ちホストが居るか | 実体 |
| 143 | summonFromHandPayable | 自分スピリット破壊コストの数 | スピリット |
| 164 | summonFromHandPayable | 付与の対象が居るか(支払い可否) | スピリット |
| 171 | summonFromHandPayable | 発生源が場にいるか(支払い可否) | 実体 |
| 178 | summonFromHandPayable | 発生源が場にいるか(デッキ下コスト) | 実体 |
| 183 | summonFromHandPayable | 発生源が場にいるか(手札コスト) | 実体 |
| 199 | filter | コア除去の体数が足りるか | スピリット |
| 217 | filter | 疲労コストを払えるスピリット数 | スピリット |
| 232 | filter | 相手の疲労コストを払える数 | スピリット |
| 267 | refreshable | 回復コスト(イベント対象)の支払い可否 | スピリット |
| 286 | refreshable | 発生源が場にいるか(コア移動コスト) | 実体 |
| 505 | paidSpiritCandidates | 相手スピリットのコスト合計で頭打ち | スピリット |
| 523 | narrowCostByLastRecord | 相手スピリットのコスト合計で頭打ち | スピリット |
| 532 | narrowCostByLastRecord | 相手の同コスト候補 | スピリット |

## logic/actions/placeCores.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 68 | availableFromSource | フィールドのコア総量 | コア |
| 101 | takeFromSource | 発生源が場にいるか(維持コアあり) | 実体 |
| 111 | takeFromSource | コア0で消滅へ切り替え(維持コア) | 実体 |
| 129 | takeFromSource | フィールドから自動でコアを取る | コア |
| 163 | placeCoresPoolCandidates | コアを置く先の候補(spirit/anyField/anySide混在) | 判断が要る |
| 266 | placeCoresLegacy | stepper再入の置き先をスピリットから引く | スピリット |
| 282 | placeCoresLegacy | 発生源が場にいるか | 実体 |
| 303 | placeCoresLegacy | コアを置く先の指定(spirit/nexus/anySide混在) | 判断が要る |

## logic/actions/placeCoresGather.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 35 | addInst | 維持コアを除いた余剰コアの計算 | 実体 |
| 42 | addInst | ownSpirits指定の取り元 | スピリット |
| 43 | addInst | field指定の取り元(ネクサス+スピリット) | コア |
| 81 | take | 取る際の維持コア・装甲の判定 | 実体 |
| 108 | gatherPayable | 発生源が場にいるか | 実体 |
| 205 | place | 発生源が場にいるか(置き先) | 実体 |

## logic/actions/removeCores.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 103 | soulFor | ソウルコアを持つ個体か | 実体 |
| 131 | applyToIndividual | スピリット/ネクサスで取り方を分ける | 実体 |
| 200 | removeCoresAchievableCountForPay | 発生源が場にいるか | 実体 |
| 215 | filter | from:"spirit"の取り元候補(体数) | 判断が要る |
| 244 | resolveSelfTarget | 発生源が場にいるか | 実体 |
| 303 | resolveAllTarget | from:"spirit"の全体対象 | 判断が要る |
| 380 | candidatesFor | from:"spirit"の選択候補 | 判断が要る |
| 545 | spreadCandidatesFor | from:"spirit"のspread候補 | 判断が要る |
| 589 | takeOneFromSource | 選んだ取り元の個体をidで引く | 実体 |
| 705 | totalCoresAcross | from:"spirit"のコア総数 | 判断が要る |

## logic/actions/revealAction.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 255 | askCores | ブレイヴ召喚の合体先ホストを引く | 実体 |
| 257 | askCores | 召喚したスピリットを場へ | スピリット |
| 392 | askCores | 場の色つきカード数(スピリット+ネクサス) | スピリット |

## logic/actions/soulCoreEffects.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 24 | filter | ソウルコア効果の対象(スピリット/ネクサス) | スピリット |

## logic/actions/summonRepeat.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 79 | summonAll | 召喚したスピリットを場へ | スピリット |

## logic/actions/tensho.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 20 | (関数外/式) | 転召で選んだ自分スピリットを引く | スピリット |

## logic/actions/timedEffect.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 499 | passes | Lvを上げる自分スピリット候補 | スピリット |
| 557 | candidates | 時限効果の自分スピリット対象 | スピリット |
| 653 | placeUnblockable | 自分側の候補を絞る(非対話の既定) | スピリット |
| 662 | placeUnblockable | 対象が自分側のスピリットか | スピリット |
| 810 | placeBattleCompare | バトルに出ている自分の個体か | 実体 |
| 871 | placeSymbolOrCost | シンボル追加先の自分スピリット候補 | スピリット |
| 889 | placeSymbolOrCost | コストを変える自分スピリット候補 | スピリット |
| 953 | placeSymbolLossRule | 色別のスピリット数で最多色を決める | スピリット |

## logic/actions/token.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 31 | (関数外/式) | トークンのスピリットを場へ | スピリット |

## logic/actions/voidGainedCores.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 28 | (関数外/式) | 得たコアが乗った個体をidで引く | 実体 |

## logic/keywords/bofu.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 14 | hasBofuOnBlock | 【暴風】の発生源を走査 | 発生源 |

## logic/keywords/bunshin.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 60 | announce | 分身スピリットを場へ | スピリット |

## logic/keywords/burst.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 232 | fireOwnBurstActivated | バースト発動で召喚されたか | スピリット |
| 569 | restedCount | 疲労状態のスピリット数(両場) | スピリット |
| 575 | restedCount | 自分の指定色スピリット数 | スピリット |
| 579 | restedCount | キーワード持ちスピリットが居るか | スピリット |
| 605 | restedCount | 自分の系統スピリット数 | スピリット |
| 611 | restedCount | 相手の系統スピリット数 | スピリット |
| 616 | restedCount | 場+リザーブ+トラッシュのコア合計 | コア |

## logic/keywords/funsai.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 62 | hasFunsaiOnBlock | 粉砕系の発生源を走査 | 発生源 |

## logic/keywords/kyoka.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 30 | kyokaBonus | 【強化】を付与された個体を数える | 発生源 |

## logic/keywords/kyoshu.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 13 | hasKyoshuOnBlock | 【強襲】系の発生源を走査 | 発生源 |
| 49 | kyoshuSelfExhaustSources | 疲労させる発生源の走査 | 発生源 |

## logic/keywords/tensho.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 61 | tenshoCandidates | 転召で動かせる自分スピリット候補 | スピリット |

## logic/magic/cast.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 122 | consumeOncePerBattleMagicFree | マジックを無償にする発生源をidで引く | 発生源 |
| 260 | doCastMagic | ソウルコアを持つ個体をidで引く | 実体 |
| 299 | doCastMagic | 支払い補助の発生源を疲労させる | 発生源 |

## logic/magic/negate.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 163 | payMagicNegate | 無効化後に自身をデッキ下へ移す位置 | 実体 |
| 164 | payMagicNegate | 無効化後に自身をデッキ下へ移す位置 | 実体 |

## logic/magic/targetRequirement.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 33 | dependsOnPrev | 宣言の対象が居るか(使用条件) | スピリット |
| 91 | matches | 対象が居るか(使用条件) | スピリット |

## logic/state/continuous.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 61 | applyTimedCopies | 継続効果の再計算前に個体の状態を消去 | 実体 |
| 85 | applyTimedCopies | 一時コピーの対象に個体を集める | 実体 |
| 134 | applyTimedCopies | 免疫の付与先(フィルター一致) | スピリット |
| 179 | recordBp | 自分スピリットのフラッシュBP+の検出 | スピリット |
| 202 | refreshLevelAsOverrides | levelAsの上書きを再計算前に消去 | 実体 |
| 242 | refreshLevelAsOverrides | ホストの合体ブレイヴからBP/ステ反映 | 実体 |
| 315 | maxLevel | キーワード付与の対象走査 | スピリット |
| 355 | maxLevel | 付与効果の対象(自分のスピリット) | スピリット |
| 368 | maxLevel | 魔法無効を付与する自分スピリット | スピリット |
| 406 | own | 選ばれた対象をidで引く(両陣営) | スピリット |
| 407 | own | 選ばれた対象をidで引く(両陣営・続き) | スピリット |
| 427 | own | 付与の対象走査(自分のスピリット) | スピリット |
| 454 | own | Lvコスト修正の対象走査 | スピリット |
| 474 | own | 選ばれた対象をidで引く(両陣営) | スピリット |
| 475 | own | 選ばれた対象をidで引く(両陣営・続き) | スピリット |
| 483 | own | Lvコスト修正の対象走査(両側) | スピリット |
| 529 | own | 名前付与の対象走査 | スピリット |
| 553 | own | ownAllの対象(自分のスピリット) | スピリット |
| 578 | own | スピリット状態のブレイヴが居る条件 | スピリット |
| 614 | own | BP増減の対象(自分のスピリット) | スピリット |
| 633 | own | コスト増減の対象走査 | スピリット |
| 650 | own | シンボル固定の対象走査 | スピリット |
| 673 | own | ブレイヴ能力値の上書き対象 | スピリット |
| 700 | own | 追加コストの対象走査 | スピリット |
| 726 | own | BPを〜として扱う対象走査 | スピリット |
| 743 | own | BP同期の対象走査(発生源以外) | スピリット |
| 786 | own | 自分のスピリット数の上限条件 | スピリット |
| 790 | own | 指定系統スピリットが居る条件 | スピリット |
| 793 | own | 相手のスピリット数を数える条件 | スピリット |
| 794 | own | 自分のスピリット数との比較条件 | スピリット |
| 797 | own | 条件に合うスピリットが居るか | スピリット |
| 820 | own | どちらかの場に指定色スピリットが居る | スピリット |
| 821 | own | どちらかの場に指定色スピリットが居る | スピリット |
| 851 | own | levelAsの対象(自分のスピリット全て) | スピリット |
| 867 | own | levelAsの対象(キーワード持ち) | スピリット |
| 879 | own | levelAsの対象(系統指定) | スピリット |
| 887 | own | levelAsの対象(バニラ) | スピリット |
| 895 | own | levelAsの対象(相手のスピリット全て) | スピリット |
| 906 | own | バトル中のアタッカーを引く | 実体 |
| 910 | own | バトル中のブロッカーを引く | 実体 |
| 943 | own | 装甲付与の対象走査 | スピリット |
| 986 | granted | アタッカーを無色にする判定 | 実体 |

## logic/state/exhaust.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 151 | returnTrashOnHeavyExhaust | 場に系統持ちの発生源が居るか | 発生源 |
| 271 | isRefreshBlockedByMark | 回復不可の指定元が場で疲労しているか | 実体 |

## logic/zones/mill.ts

| ファイル:行 | 関数 | 何をしているか | 分類 |
| :-- | :-- | :-- | :-- |
| 158 | fireOwnDeckMillPrevented | 山札破棄を起こした発生源を引く | 発生源 |
| 406 | payDeckMillNegateCost | 破棄を起こした相手の発生源を引く | 発生源 |
| 492 | resolveMilledFromDeck | 破棄を起こした相手の発生源を引く | 発生源 |

## 分類ごとの件数

| 分類 | 件数 |
| :-- | --: |
| 実体 | 56 |
| スピリット | 123 |
| 発生源 | 11 |
| コア | 15 |
| AI・表示 | 1 |
| 判断が要る | 8 |
| 合計 | 214 |

### ファイルごとの内訳（実体／スピリット／発生源／コア／AI・表示／判断）

| ファイル | 実体 | スピリット | 発生源 | コア | AI・表示 | 判断 |
| :-- | --: | --: | --: | --: | --: | --: |
| index.ts | 0 | 0 | 0 | 0 | 1 | 0 |
| logic/actions/battleFlow.ts | 11 | 6 | 0 | 0 | 0 | 0 |
| logic/actions/bounce.ts | 8 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/control.ts | 0 | 2 | 0 | 0 | 0 | 0 |
| logic/actions/coreGain.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/cores.ts | 0 | 5 | 0 | 5 | 0 | 0 |
| logic/actions/declare.ts | 0 | 3 | 0 | 0 | 0 | 0 |
| logic/actions/designate.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/destroy.ts | 2 | 9 | 0 | 1 | 0 | 0 |
| logic/actions/destroyOwnBrave.ts | 1 | 0 | 0 | 0 | 0 | 0 |
| logic/actions/exhaustBudget.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/exhaustRefresh.ts | 1 | 10 | 0 | 0 | 0 | 0 |
| logic/actions/filter.ts | 1 | 3 | 0 | 0 | 0 | 0 |
| logic/actions/fireEffect.ts | 0 | 4 | 0 | 0 | 0 | 0 |
| logic/actions/grant.ts | 0 | 8 | 0 | 2 | 0 | 0 |
| logic/actions/moveCards.ts | 1 | 0 | 0 | 3 | 0 | 1 |
| logic/actions/pay.ts | 5 | 9 | 0 | 0 | 0 | 0 |
| logic/actions/placeCores.ts | 3 | 1 | 0 | 2 | 0 | 2 |
| logic/actions/placeCoresGather.ts | 4 | 1 | 0 | 1 | 0 | 0 |
| logic/actions/removeCores.ts | 5 | 0 | 0 | 0 | 0 | 5 |
| logic/actions/revealAction.ts | 1 | 2 | 0 | 0 | 0 | 0 |
| logic/actions/soulCoreEffects.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/summonRepeat.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/tensho.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/timedEffect.ts | 1 | 7 | 0 | 0 | 0 | 0 |
| logic/actions/token.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/actions/voidGainedCores.ts | 1 | 0 | 0 | 0 | 0 | 0 |
| logic/keywords/bofu.ts | 0 | 0 | 1 | 0 | 0 | 0 |
| logic/keywords/bunshin.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/keywords/burst.ts | 0 | 6 | 0 | 1 | 0 | 0 |
| logic/keywords/funsai.ts | 0 | 0 | 1 | 0 | 0 | 0 |
| logic/keywords/kyoka.ts | 0 | 0 | 1 | 0 | 0 | 0 |
| logic/keywords/kyoshu.ts | 0 | 0 | 2 | 0 | 0 | 0 |
| logic/keywords/tensho.ts | 0 | 1 | 0 | 0 | 0 | 0 |
| logic/magic/cast.ts | 1 | 0 | 2 | 0 | 0 | 0 |
| logic/magic/negate.ts | 2 | 0 | 0 | 0 | 0 | 0 |
| logic/magic/targetRequirement.ts | 0 | 2 | 0 | 0 | 0 | 0 |
| logic/state/continuous.ts | 7 | 35 | 0 | 0 | 0 | 0 |
| logic/state/exhaust.ts | 1 | 0 | 1 | 0 | 0 | 0 |
| logic/zones/mill.ts | 0 | 0 | 3 | 0 | 0 | 0 |

## 判断が要るもの（8 か所・3 件の問い）

| ファイル:行 | 何を問うているか | 候補の分類 | 見立て |
| :-- | :-- | :-- | :-- |
| removeCores.ts:215・303・380・545・705（5 か所） | コア除去の `from: ["spirit"]` は「スピリット上のコア」か「フィールドのコア」か。ゾーン名が `"spirit"` 1 つで、B1（スピリット上のコア＝当たらない）と B2（フィールドのコア＝当たる）を書き分けられない | スピリット／コア | **`from` に `"nexus"` が入っているときだけアルティメットを足し（コア）、`["spirit"]` 単独（既定を含む）はそのまま（スピリット）が自然。** データでは `from` 省略 146 件＋`["spirit"]` 35 件が単独、`spirit`＋`nexus` を含むものが約 26 件。「`spirit`＋`nexus`＝フィールド」という読みは効果文と突き合わせていない推測。段階的に `"ultimate"` ゾーンを足す案もあるが、今は不要 |
| placeCores.ts:163・303（2 か所） | コアの置き先候補の 1 行に、`to:"spirit"`（スピリット）・`anyField`（フィールド）・`anySide`（両陣営のスピリット）の 3 分岐が混ざっている | スピリット／コア | **分岐ごとに別の分類で直す。** `anyField` だけコア（アルティメットも置き先に含める。B2）、`to:"spirit"`・`anySide` は ultimate の置き先として扱わない（スピリット）。1 行を 3 行に割る小さな手戻りが要る |
| moveCards.ts:549 | ブレイヴを合体させるホスト候補（フィルター付きの列挙）。B13 で「合体条件にアルティメットと書かれたブレイヴだけ」が乗れる | スピリット／実体 | **スピリット（そのまま）が自然。** 「合体できるか」の判定は braveCombineCandidates 側の入口（battleFlow.ts:1171・1173 近辺）で B13 を見るのが筋で、ここは列挙の絞り込みだけ。段 5 の `kinds` と合わせて再確認する |

## ヘルパー 1 つで済む候補（「実体」56 か所のうち 45 か所）

呼び出し元ごとの仕分けが要らなくなる。いずれも新設（既存の `findSpirit`／`findSpiritAny` は担当ファイルの外。下の注を参照）。

| ヘルパー（新設案・置き場は GameState.ts） | 影響する出現 | 中身 |
| :-- | --: | :-- |
| `findBattler(player, id)` ＝ `battlers(player).find(id 一致)` | 15 | battleFlow.ts:125・560・576・1173・1228・1276・1713・1721、moveCards.ts:589、voidGainedCores.ts:28、removeCores.ts:589、revealAction.ts:255、magic/cast.ts:260、state/continuous.ts:906・910 |
| `isOnField(player, inst)` ＝ スピリット・アルティメット・（ネクサス）のどれかに含まれるか | 19 | bounce.ts:118・180・676、pay.ts:171・178・183・286、placeCores.ts:101・111・282、placeCoresGather.ts:35・81・108・205、removeCores.ts:103・131・200・244、filter.ts:95 |
| `removeFromField(player, inst)` ＝ 位置を探して抜く（`findIndex`＋`splice` を 1 つに） | 4 | bounce.ts:835・837・875・877（破壊待機の発生源を場から抜く） |
| `braveHostsOf(player)` ＝ `battlers(player)` のうち合体ブレイヴを持つもの | 5 | battleFlow.ts:1334・1646、bounce.ts:157、pay.ts:129、state/continuous.ts:242 |
| `findBraveHost(player, braveId)` | 2 | battleFlow.ts:1537、destroyOwnBrave.ts:33 |

ヘルパーにしても残る「実体」は 11 か所で、1 か所ずつ直す：destroy.ts:94・1086、exhaustRefresh.ts:888、timedEffect.ts:810、state/continuous.ts:61・85・202・986（継続効果の再計算前に個体の状態を消す所など。**ここを直し忘れるとアルティメットだけ前回の値が残る**）、state/exhaust.ts:271、magic/negate.ts:163・164。

注：
- 既存の `findSpirit(player, id)`（server/src/logic/GameState.ts:648、呼び出し 81 か所）と `findSpiritAny(state, id)`（server/src/logic/EffectModules.ts:939、呼び出し 84 か所）は、**担当ファイルの外にも呼び出し元がある**。名前のまま中身だけ battlers に変えると「選ばれた対象を id で再引き」（上の仕分けでは「スピリット」）まで当たってしまうので、新設の別名で受けて、呼び出し元ごとに乗り換える進め方を勧める。
- 「選ばれた対象を id で再引きする」行（スピリット 約 25 か所）は、段 5 の `kinds` が入ったときに候補の作り方と一緒に見直す。

## 段3 の PR の分け方の材料（参考）

| 分類 | 件数 | 直す中身 | 手戻りの見え方 |
| :-- | --: | :-- | :-- |
| 実体 | 56 | `battlers()`／上のヘルパーへ置換 | 置換漏れはアタック・消滅が動かず**すぐ気づく** |
| 発生源 | 11 | `effectSources` 相当に ultimates を足す（keywords の 4 本・magic・exhaust・mill） | 漏れると誘発・継続が出ない |
| コア | 15 | フィールドのコア合計・支払い元に ultimates を足す | 漏れるとアルティメットのコアが払えない・数えられない |
| 判断 | 8 | 上の 3 つの問いを決めてから | — |
| スピリット／AI・表示 | 124 | 変えない（AI・表示 1 か所は後回し） | 変えなければルール上安全（B1・B7・B8） |

実際に手を入れるのは 実体＋発生源＋コア＝82 か所（＋判断 8 か所）。実体を「ヘルパーの新設と乗り換え」「継続効果の再計算前の消去（continuous.ts）」「その他」に、発生源・コアをもう 1〜2 本に分けると、1 本あたり 20〜40 か所に収まる。
