# ヘルパーの索引（自動生成：`npm run codemap`。手で編集しない）

export されている関数・定数・型の置き場。名前で引いて、ファイルが分かったら `grep -n` で行に届く。

## shared/block.ts

- `blockRequiredCount`（fn）：このアタッカーをブロックするのに必要なブロッカーの体数（blockRequiresCount）。
- `canBlock`（fn）
- `matchesDirectedAttackFilter`（fn）：指定アタック（canDirectAttack）の対象条件に、指定された相手スピリットが合致するか。

## shared/board.ts

- `BoardPlayer`（型）
- `Board`（型）
- `_GameStateIsBoard`（型）
- `_GameViewIsBoard`（型）

## shared/cardDb.ts

- `setCardLookup`（fn）：サーバーは GameState.getCard、クライアントは renderer.setCardDb 内の master を注入する
- `card`（fn）

## shared/cost.ts

- `costModTotal`（fn）：コスト修正（kind: "costMod"）の合計を求める。両プレイヤーのフィールド（スピリット＋ネクサス）を
- `reductionGrantSymbols`（fn）：軽減シンボル付与（kind: "reductionGrant"）で追加される軽減シンボルを求める。
- `hasMagicRestriction`（fn）：マジック使用制約（kind: "magicRestriction"）の判定。両陣営のフィールドを走査し、
- `hasMagicCostLock`（fn）：コスト上限によるマジック使用制約（restriction:"costLimitAll"）の判定。
- `canPayNexusCostByMill`（fn）：栄光の表彰台Lv1（kind:"nexusCostMillPay"）：ネクサスの配置コストを
- `canPaySummonCostByHandDiscard`（fn）：BS08ビクティム（kind:"summonCostHandDiscardPay"）：スピリットの召喚コストを
- `hasMagicFreeGrant`（fn）：マジック無償化（kind: "magicFreeGrant"）の判定。使用者pid自身のフィールドに、
- `findMagicFreeGrantSource`（fn）：hasMagicFreeGrant の実体。無償化を成立させている**発生源のinstanceId**を返す（無ければ null）。
- `isSelfInBattle`（fn）：発生源自身が現在のバトルの当事者（アタッカー/ブロッカー）か。
- `magicEffectiveColors`（fn）：kind:"ownMagicColorless"（BS15-015吸血令嬢エサルフリーダ Lv1-3）：発生源自身が現在のバトルの当事者
- `ownFieldSymbolColors`（fn）：pidのフィールド（スピリット＋ネクサス）が持つシンボルの色集合（力奪う凱旋門のcolorLockOpponent判定用。
- `costSetOverride`（fn）：コスト置換（kind:"costMod"のmode:"set"）を求める。pid自身のeffectSources（フィールド＋
- `effectiveCost`（fn）：軽減後の実コスト（フィールドの一致シンボル数だけ軽減、軽減シンボル数が上限）に

## shared/magicCondition.ts

- `magicConditionFailure`（fn）：満たしていれば null、満たしていなければ理由の文を返す

## shared/rules/activation.ts

- `sokuPayableInstanceIds`（fn）：【覚醒】を現在レベルで持っているか。
- `shinsokuAssistCandidates`（fn）：kind:"shinsokuPayAssist"（BS16-021ノウゼンサーバル）を持つ、pidの自分フィールドの回復状態スピリット。
- `burstSetCoresRequired`（fn）：kind:"burstSetCost"（BS16-067氷聖女の塔Lv2）が課す、pidがバーストをセットするために必要な
- `coreZoneChoiceId`（fn）：pendingChoice の候補に混ぜる「そのプレイヤーのリザーブ／トラッシュのコア」の番兵（removeCores で取り先を1個ずつ選ぶとき）。
- `AWAKEN_FROM_RESERVE`（const）：GameAction awaken の fromInstanceId に渡すと「自分のリザーブから」の意味になる番兵。
- `canAwakenFromReserve`（fn）：【覚醒】のコア移動元に自分のリザーブを使えるか（kind:"awakenFromReserve" が有効な発生源が
- `hasSuperAwaken`（fn）：この個体が【超覚醒】を持つか（＝コアを置いたあと回復するか）。
- `isEndStepLocked`（fn）：このスピリットのコアを取り除けないか（constraint:"coresCantBeRemoved"）。
- `coresCantBeRemoved`（fn）
- `summonExhausted`（fn）：globalConstraint "summonExhausted"（BS13緑バッチ 器AB）：お互い、条件を満たすカードを召喚するとき、
- `coresCantBeRemovedByOpponent`（fn）：globalConstraint "coresCantBeRemovedByOpponent"（BS12-022太陽武者ゲンジ・ボルタ）：
- `canAwaken`（fn）
- `activatableAbility`（fn）：起動能力（kind: "activated"）が今このスピリットで発動可能なら {effectId, costLabel} を返す。
- `DirectAttackFilter`（型）：指定アタック（canDirectAttack）の対象条件（targetFilter状態条件＋targetMinBpのBP条件）
- `directAttackFilter`（fn）：指定アタック（canDirectAttack）を現在レベルで持っていれば、その対象条件を返す
- `minLevelCores`（fn）：維持コア数＝そのカードが持つ**最小レベル**の必要コア数。
- `minLevelCoresOf`（fn）：レベル表から最小レベルの必要コア数を求める素の計算（minLevelCores / instMinLevelCores の共通実体）
- `isFlashLockedFor`（fn）：pid がいま「フラッシュで手札のカードを使えない」状態か。
- `AltSummonFromHandOption`（型）
- `altSummonFromHandCheck`（fn）：判定の本体。**サーバー（RuleValidator.validateSummon）とクライアントUIの唯一の判定元**
- `canAltSummonFromHand`（fn）：UI向け：手札の handIndex 枚目がいま代替召喚できるなら候補ネクサスを返す（できなければ ok:false）

## shared/rules/bp.ts

- `spiritCountWeight`（fn）：オーラのカウンタを、発生源の持ち主（sourcePid）基準で数える。
- `countSpiritsWeighted`（fn）：ownerPid のフィールドで predicate に合うスピリットを、上記の重みつきで数える。
- `countAuraCounter`（fn）
- `checkAuraCondition`（fn）：オーラの発動条件を、発生源の持ち主（sourcePid）基準で判定する
- `auraAppliesTo`（fn）：オーラ1件が対象インスタンス（targetOwnerPid が持ち主）に効くか判定する
- `auraAmount`（fn）：オーラ1件の増加量（発生源の持ち主 sourcePid 基準でカウンタ・条件を評価する）。
- `isBpBuffSuppressed`（fn）：「BPを+する」効果が、effectOwnerPid（効果を出す側）にとって発揮されない状態か
- `effectiveBp`（fn）：実効BP：基礎BP（tempBpBuff加算済み）に、両陣営の常時BP修正（オーラ）を加算した値。
- `timedRuleBp`（fn）：全体ルール（timedEffect の all:true）の BP 増減。対象も量も計算のたびに判定し直す

## shared/rules/constraints.ts

- `ConstraintWithSource`（型）：指定インスタンスが現在レベルで持つ制約定義の一覧（RuleValidator の validateBlock が参照する）
- `activeConstraints`（fn）：制約だけが要る呼び出し（大多数）はこちら。判定の本体は activeConstraintsWithSource に1本化してある
- `activeConstraintsWithSource`（fn）
- `isUntargetableByOpponent`（fn）：⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
- `hasFullEffectImmunity`（fn）：untargetableByOpponentと異なり範囲効果（destroy{all}/exhaust{all}等）にも効く「効果を受けない」判定。
- `hasArmorAgainst`（fn）：⚠️ 原則 boardResistanceAgainst の内部実装。**直接呼んでよいのはバトル文脈だけ**
- `hasHeavyArmorAgainst`（fn）：【重装甲】。装甲との差は**ブレイヴの効果も防ぐ**ことだけで、判定の形は hasArmorAgainst と同じ。
- `heavyArmorColorsOf`（fn）：器AJ：instがその時点で実際に持つ【重装甲】の色を列挙する（静的keyword＋heavyArmorColorsGranted。
- `hasBraveImmuneAgainst`（fn）：第3の耐性軸：相手のブレイヴの効果を受けない（kind:"braveImmuneGrant"）。装甲/重装甲とは別枠
- `hasGlobalConstraint`（fn）
- `attackOncePerTurnLimitApplies`（fn）：器AQ：globalConstraint "attackOncePerTurnBySymbolCount"（BS13-068遥かなる衛星砲）。
- `attackOncePerTurnByCostLimitApplies`（fn）：attackOncePerTurnLimitAppliesのコスト版（BS14-088青玉の巨大迷宮）。
- `ownLifeImmuneToOpponentSpiritEffects`（fn）：globalConstraint "ownLifeImmuneToSpiritEffects"（BS13-027ムーンショウウオLv2）：
- `canDiscardHand`（fn）：手札破棄の関門（BS11-065 満天の牧草地Lv1-2「お互い、手札を破棄できない」）。
- `cantSpiritStateBrave`（fn）：pid は「ブレイヴをスピリット状態にできない」側か（BS11-X02 滅神星龍ダークヴルム・ノヴァLv3）。
- `coresToOpponentReserveGoToTrash`（fn）：globalConstraint "coresToOpponentReserveGoToTrash"（BS12-X02魔羯邪神シュタイン・ボルグLv2-3）:
- `refreshRestrictionsFor`（fn）：リフレッシュステップの制限（BS11-X04 宝瓶神機アクア・エリシオン）。
- `costCantAct`（fn）：フィールド全体制約 costCantAct（両陣営）：コストがmaxCost以下（またはcostsに完全一致）のスピリットは
- `instCostCantAct`（fn）：フィールド上のインスタンスに対する「全体制約による行動不可」判定。実コストに加えて、道化師クランの
- `instCantAttackByOpponentCost`（fn）：BS12-X05戦神乙女ヴィエルジェ：発生源の持ち主から見た**相手**のスピリットのうち、コストが
- `instCantAttackByCost`（fn）：器AW：globalConstraint "cantAttackByCost"（両陣営）：コストが配列のいずれかと完全一致するスピリットは
- `instAttackRequiresCoreToll`（fn）：器BM：globalConstraint "attackRequiresCoreToll"（両陣営）：コストがmaxCost以下のスピリットが
- `instCantAttackByFewOwnSpirits`（fn）：器BV：globalConstraint "cantAttackIfFewOwnSpirits"（両陣営それぞれ独立に判定）：
- `opponentCantReturnFromTrashToHand`（fn）：器BO：globalConstraint "opponentCantReturnFromTrashToHand"。pid は「トラッシュから手札に戻そうとしている本人」。
- `levelCantAct`（fn）：フィールド全体制約 levelCantAct（両陣営）：currentLevel が指定リストに含まれるスピリットは
- `noLifeDamageByCost`（fn）：フィールド全体制約 noLifeDamageByCost（両陣営）：コストがmaxCost以下のスピリットのアタックでは
- `lifeDamageLimit`（fn）：片側限定のライフ保護（playerRule "noLifeDamageByCostForPid"。BS07秘密の花園Lv2）：
- `lifeFloorByEffect`（fn）：このターンの間、この pid のライフはあらゆる原因（アタック・lifeCrushアクション）で減らないか
- `ownLifeDamageCapRemaining`（fn）：SD06-010海皇龍シーマ・クリーク：「自分のライフは、ターンごとに相手のスピリット1体からmaxまでしか
- `lifeDamagePerSpiritRemaining`（fn）：神将「自分のバーストをセットしている間、お互いのライフは、ターンごとにスピリット1体から
- `cantReduceOpponentLife`（fn）：attackerPid は「ライフを減らそうとしている側」。その持ち主のフィールドに
- `lifeImmuneThisTurn`（fn）
- `ownLifeFloorContinuous`（fn）：BS12-070天の階Lv2：「自分のフィールドに系統：「天霊」を持つスピリットが5体以上いる間、
- `lifeProtectedByCostThisTurn`（fn）
- `mustAttackThisTurn`（fn）：このターンだけの強制アタック（timedEffect の内容 mustAttack）が、恒久的な constraint:"mustAttack" と同じ扱いで掛かっているか
- `canBlockWhileRestedThisTurn`（fn）：このターンだけの疲労状態ブロック許可（timedEffect の内容 canBlockWhileRested。constraint:"canBlockWhileRested" のタ…
- `protectedByBpUpToSelf`（fn）：constraint:"protectOwnLifeByBpUpToSelf"（BS08空帝竜騎プラチナム）：ブロックされなかったアタッカーの
- `noOpponentTriggerByColor`（fn）：フィールド全体制約 noOpponentTriggerByColor（片側のみ）：発生源の持ち主から見た**相手**の、
- `noSummonTriggerByCost`（fn）：フィールド全体制約 noSummonTriggerByCost（両陣営）：コストがmaxCost以下のスピリットの
- `summonByEffectBlocked`（fn）：フィールド全体制約 noSummonByEffect（両陣営・主語なし）：スピリット/ブレイヴ/ネクサス/マジックの
- `noReductionBySummonCost`（fn）：フィールド全体制約 noReductionBySummonCost（両陣営）：コストがmaxCost以下のスピリットカードを
- `hasMagicImmunity`（fn）：⚠️ **これは boardResistanceAgainst の内部実装**。個別に呼ぶと他の耐性軸が抜けるので、
- `hasBounceImmunity`（fn）：発生源の持ち主の familyFilter/colorFilter 一致スピリットは、相手の効果によるバウンス
- `hasTimedUnblockable`（fn）：この個体にいま掛かっている期間つき効果の内容（docs/design/TIMED_EFFECTS.md）。1体指定と「すべて」の両方を追加順に返す。
- `timedContentsOn`（fn）
- `timedKeywords`（fn）：この個体に期間つき効果で与えられたキーワード（colors＝【装甲】の色）
- `timedContentsFor`（fn）：このプレイヤーに掛かっている期間つき効果の内容
- `timedPlayerRules`（fn）：このプレイヤーに掛かっている「このターンの間」の制約
- `timedBattleContents`（fn）：このバトルの解決方法（比べるもの・勝敗の逆転）
- `timedFlashLocked`（fn）：期間つき効果で、このバトルの間フラッシュで手札のカードを使えないか
- `cantActByTimed`（fn）：期間つき効果でアタック／ブロックできないか

## shared/rules/keywordState.ts

- `spiritHasKeyword`（fn）：状態を考慮したキーワード判定：カード静的 ‖ 一時付与（tempKeywords） ‖ 継続付与（keywordGrant）。
- `iceWallColorsOf`（fn）：【氷壁】の色（kind:"magicNegate"のcolors。BS08-032等）。同じカードの複数レベルに分かれていることがあるので
- `hasDestroyAsMaxLevelGrant`（fn）：器N（BS12-057ハイドランディア【合体時】/BS12-069定規山脈）：「相手のスピリット/ブレイヴ/マジックの
- `hasContinuousKeywordGrant`（fn）：継続付与（kind: "keywordGrant"）によるキーワード保持判定（暴双龍ディラノス）
- `continuousKeywordGrantCount`（fn）：継続付与（kind: "keywordGrant"）で持つキーワードの指定数（【強襲】等、数値を伴うキーワード用。
- `targetArmorColorCount`（fn）：対象インスタンス自身が持つ【装甲】の指定色数（静的keyword・期間つきの付与・継続付与armorColorsGrantedを
- `familiesSuppressed`（fn）：状態を考慮した系統判定：カード静的 ‖ 継続付与（kind: "familyGrant"。ポム／尖兵／音鳥クルーク）。
- `hasHandKeywordGrant`（fn）：緑芽吹く原野Lv2（kind:"handKeywordGrant"）：持ち主の手札にある条件一致のカードが
- `spiritHasFamily`（fn）
- `matchesFamilyFilter`（fn）：FamilyFilter（string | string[]）共通の判定：配列指定時はいずれかの系統を持てばよい（OR）

## shared/rules/level.ts

- `KeywordInfo`（型）：キーワードの存在と表示名を一元管理する（挙動は GameEngine / RuleValidator が hasKeyword で参照する）
- `KEYWORDS`（const）：キーワード効果のレジストリ。カードデータには名前だけを持たせ、挙動はエンジン側で解決する
- `keywordMatches`（fn）
- `hasKeyword`（fn）：カード静的なキーワード保持判定（一時付与・継続付与は spiritHasKeyword を使うこと）
- `instHasTriggerEffect`（fn）：指定トリガーの誘発効果（kind:"triggered"）を現在のレベルで静的に持つか（TargetFilter.hasTrigger）。
- `staticKeywordCount`（fn）：効果の levels 指定が現在のレベルで有効か（null = レベル不問）
- `effectActiveAtLevel`（fn）
- `instIsCombined`（fn）：このインスタンスが**合体しているか**（docs/design/BRAVE.md §12.3）。
- `effectActiveOn`（fn）：効果エントリが**いま発揮されているか**。レベル条件に加えて【合体時】のゲートも見る。
- `combinedBraveColorsOk`（fn）：【合体時】の色条件（X008 神星皇ストライク・アポロドラゴン＝「赤/紫/青のブレイヴとの合体時」）。
- `isVanillaCard`（fn）：カードに効果の記述を持たない（バニラ）か
- `isTrashCardProtected`（fn）：トラッシュにあるこのカードが、一切の効果を受けない（kind:"trashImmunity"）か。
- `isTrashReturnAtEndStep`（fn）：トラッシュにあるこのカードが、持ち主の『自分のエンドステップ』に手札へ戻るか（kind:"trashReturnAtEndStep"）。
- `instIsVanilla`（fn）：インスタンス単位のバニラ判定：カード静的（効果テキストが空）‖ 継続付与された「バニラとしても扱う」
- `instEffectsSuppressed`（fn）：この個体が「持つ効果すべてを発揮しない」状態か。判定軸は2つ:
- `effectSources`（fn）：「効果の発生源」をすべて返す器。**フィールドに実在する発生源＋実在しないが効果を出す発生源**の両方を返す。
- `isVirtualSource`（fn）：このインスタンスがターン限定の仮想発生源（マジックが貸した継続効果）かどうか。
- `instHasCost`（fn）：状態を考慮したコスト判定：カード本来のコスト ‖ 一時的に「コストとしても扱う」値（tempAlsoCosts） ‖
- `instCostDelta`（fn）：このインスタンスに掛かっている**コストの増減の合計**（「このターンの間、コスト+3する」など）。
- `instBaseCost`（fn）：このインスタンスの「本来のコスト」。asSpiritThisTurn（このターンだけスピリットとして扱われている
- `instFamilies`（fn）：このインスタンスの「カード側の系統」。braveStatsAsContinuous / asSpiritThisTurn があればその系統で置き換わる
- `instAllCosts`（fn）：インスタンスが「扱われている」コストの一覧（本来のコスト＋tempAlsoCosts＋alsoCostsContinuous）。
- `cardHasColor`（fn）：カード（手札・デッキ・トラッシュ＝インスタンスが無い経路）の色判定。
- `instHasColor`（fn）：状態を考慮した色判定：master色 ‖ 一時付与された色（timedColors。アディショナルカラー） ‖
- `instColors`（fn）：状態を考慮した色の一覧。「発生源の色」を装甲判定などへまとめて渡すときに使う
- `opponentFieldColorCount`（fn）：持ち主から見た相手フィールド（スピリット+ネクサス）の色の種類数（重複除く）。
- `ownFieldOnlyColor`（fn）：自分のフィールド（スピリット+ネクサス）のカードがすべて指定色1色だけか。
- `currentLevel`（fn）：現在のレベルとBP。timedLevel（このターンの上書き）または levelAsContinuous（継続置換）が
- `displayLevel`（fn）：「見た目・他のカードから見えるレベル」。**効果の発揮判定にだけ効く置き換え**
- `bravesOf`（fn）：ホストに合体しているブレイヴの実体。参照が切れている（実体が既に無い）ぶんは黙って落とす
- `hostsOf`（fn）：ブレイヴが合体しているホスト。**異魔神ブレイヴは2体returnsする**（実体1つ・参照2本）
- `braveLevelOf`（fn）：合体状態のブレイヴのレベル。**合体スピリット上のコア数**（＝ホストのコア数）を
- `braveBpBonus`（fn）：合体しているブレイヴが足す「合体時BP+」の合計。**ホストのコア数で合体状態のレベルが変わる**ため、
- `braveKeepCores`（fn）：スピリット状態のブレイヴを場に残すのに必要なコア数（＝**スピリット状態の**Lv1維持コスト。§1.4）。
- `matchesBraveCondition`（fn）：このブレイヴが対象のスピリットに合体できるか（合体条件。§1.2）。
- `instLevels`（fn）：このインスタンスが参照すべきレベル表。asSpiritThisTurn の上書きがあればそちらを使う
- `instMinLevelCores`（fn）：インスタンス単位の維持コア数（最小レベルに必要なコア数）。
- `isSpiritOnField`（fn）：指定インスタンスがそのプレイヤーのフィールドにスピリットとして存在するか
- `isOnFieldAnyZone`（fn）：この個体が**まだ場にいるか**（スピリット／ネクサス／**合体中のブレイヴ**）。

## shared/rules/resistance.ts

- `ResistanceCategory`（型）：耐性の分類。**分岐用ではなくログ・UI表示用**（呼び出し側は「防がれたかどうか」だけ見ればよい）
- `Resistance`（型）
- `EffectAttempt`（型）：「何をしようとしているか」。耐性ごとに効く操作が違うので、**この2軸は必ず渡す**
- `boardResistanceAgainst`（fn）：盤面だけで決まる耐性を判定する。防がれるなら理由を、通るなら null を返す。
- `hasUntargetableConstraint`（fn）：constraint:"untargetableByOpponent" だけを見る（immuneToOpponentThisTurn は上で別扱いにしたので含めない）。
- `isInBattle`（fn）：現在のバトルに参加しているか（サーバーの isInCurrentBattle と同じ判定。Board だけで決まる）
- `isExhaustImmuneOnBoard`（fn）：【疲労しない】（kind:"exhaustImmunityGrant"。トランプの王国）。

## shared/rules/symbols.ts

- `instanceSymbolCount`（fn）：インスタンスのシンボル数。ライフダメージ計算・シンボル数の条件・比較が共用する
- `countSymbols`（fn）：軽減計算用：プレイヤーのフィールドにある指定色シンボルの数を数える。
- `countTrashSymbols`（fn）：軽減計算用：トラッシュにあるカードのシンボル数（BS10-092／BS10-X05）。
- `handSizeOf`（fn）：手札の枚数（内容は隠匿されても枚数は公開情報）。BoardPlayer.handCountがあればそれを使い、

## shared/rules/targetFilter.ts

- `matchesTarget`（fn）：対象インスタンス1体が ResolvedTargetFilter の全条件を満たすかを判定する純粋な述語。
- `cardNameContains`（fn）：カード名に指定文字列を含むか。「カード名に『◯◯』と入っているスピリット」の共通判定。
- `trashCardNameMatches`（fn）：トラッシュ（インスタンスを持たない、cardIdだけのゾーン）のカード名照合。cardNameContainsのトラッシュ版。
- `matchesCostFilter`（fn）：コスト範囲の判定（TargetFilter.cost）。
- `instMatchesCostFilter`（fn）：フィールド上のインスタンスに対するコスト範囲の判定。実コストに加えて

## shared/summon.ts

- `isSummonableCardType`（fn）：召喚（type:"summon"）で場に出せるカードか。
- `braveCombineCandidates`（fn）：合体先（ダイレクトブレイヴ）に選べる自分のスピリットの instanceId 一覧。
- `combineLimitFor`（fn）：このスピリットに合体できるブレイヴの上限数（既定1）。器P。BS13-X01光龍騎神サジット・アポロドラゴン
- `BattleSwapSummonOption`（型）：手札のこのスピリットカードを、フラッシュ中のバトルで
- `battleSwapSummonCheck`（fn）：判定の本体。**サーバー（RuleValidator.validateSummon）とクライアントUIの唯一の判定元**。
- `canBattleSwapSummon`（fn）：UI向け：手札の handIndex 枚目がいま入れ替え召喚できるなら、その選択肢を返す（できなければ null）。

## server/src/accessLog.ts

- `ACCESS_TAG`（const）：集計側が grep で拾う目印。docker ログには起動ログや例外も混ざるため、
- `accessLogMiddleware`（fn）：Express ミドルウェア。**express.static より前に登録すること**
- `logSocketJoin`（fn）：Socket.IO 側。HTTPのページビューは「開いただけ」を含むので、

## server/src/ai/evaluate.ts

- `scoreMove`（fn）：1手の点数。高いほど「打ちたい手」
- `pickBestMove`（fn）：候補のうち最も点数の高い手を返す。同点なら列挙順（＝決定的）
- `boardStrength`（fn）：フィールドの厚み（テストとログ用の簡易指標。手の選択には使わない）

## server/src/ai/index.ts

- `moveKey`（fn）：アクションを一意の文字列にする。ランナーが「サーバーに弾かれた手」を覚えて避けるのに使う
- `decideAiAction`（fn）：AI が次に打つ手を決める。null は「今は AI の手番ではない」（相手の入力待ち）。

## server/src/ai/legalMoves.ts

- `AiMove`（型）：1手の候補。reason は対戦ログとテストのために持つ（AIがなぜその手を選んだかを後から追えるように）
- `enumerateLegalMoves`（fn）：今このプレイヤーが打てる手をすべて返す。空配列＝相手の手番待ち（AIは何もしない）

## server/src/ai/runner.ts

- `AI_STEP_DELAY_MS`（const）
- `AiPumpOptions`（型）
- `pumpAi`（fn）：AI が打てる手が無くなるまで1手ずつ進める。すでに走っていれば何もしない
- `pumpAiSync`（fn）：テスト用：間隔を空けずに、AI が打てなくなるまでその場で進める。

## server/src/logic/EffectModules.ts

- `getAllFamilies`（fn）
- `emitEvent`（fn）：state.events にイベントを1件積む（seqはstate.eventSeqをインクリメントして自動採番）。
- `resistanceAgainst`（fn）：このインスタンスが、いま解決中の効果を「受けない」状態か。
- `askPayToNegateIfNeeded`（fn）：「手札を破棄することで効果を受けない」を**払うかどうか、守る側に聞く**。
- `isResisted`（fn）：resistanceAgainst の真偽値版（理由を使わない呼び出し側用）
- `destroyedCoresGoToTrash`（fn）：スピリットのコアが効果／手動操作で増減したとき、相手フィールドの exhaustOnManualCoreAdd 持ち
- `consumeSummonHandDiscardPay`（fn）：BS08ビクティム（kind:"summonCostHandDiscardPay"）：「スピリットカード**1枚**の召喚に」なので、
- `destroyBpThresholdBonusFor`（fn）：器BS16：発生源の持ち主（ownerPid）のスピリット/マジックの効果による「BP◯以下を破壊する」判定の
- `handImmuneFor`（fn）：発生源の持ち主（targetPid）の**手札**が、相手のスピリット/ブレイヴ/マジックの効果を受けないか
- `tryLifeDamageMillGuard`（fn）：kind:"lifeDamageMillGuard"（BS07六花の司書長サーガ）：defenderPid のライフが減る直前に呼ぶ。
- `lifeCostBlockedByFloor`（fn）：BS14-084永久凍土の王都：「自分のライフが0になるとき、このネクサスを自分のトラッシュに置くことで、
- `tryOwnLifeFloorByCost`（fn）
- `hasSummonedExhaustGrant`（fn）：kind:"summonedExhaustGrant"（天使長ファニム）：ownerPidのフィールドに、
- `hasBlockTriggersAsAttack`（fn）：kind:"attackTriggersAsBlockGrant" の継続付与（BS04ドラグノ近衛兵）：
- `hasAttackTriggersAsBlock`（fn）
- `hasLifeDamageNegate`（fn）：硝子の女神フレイア：ブロックされなかったアタッカーの実効BPが、発生源（defenderPid側）の
- `coreStepBonusFor`（fn）：持ち主のコアステップで得られるコアの追加数（kind: "coreStepBonus"）を集計する。
- `placeCoresOnSpirit`（fn）：対象スピリットへ「効果で」コアを置く共通処理。coreBonus（グラーバ）ぶんをボイドから追加する。
- `voidCoreToOwnTrash`（fn）：ボイドからコアcount個を直接、持ち主のトラッシュに置く（無限に湧くボイドが原資。
- `voidCorePlacementBlocked`（fn）：globalConstraint "voidCoreBlockedOutsideCoreStep"（BS10-056蒼天大聖モンゴクウ）：
- `sweepLevelCostDepletion`（fn）：継続的なレベル置換（kind: "levelAs"）を再計算する。
- `payCost`（fn）：summonFromHandFree 共通の召喚実行部：指定した手札インデックスのスピリットを、
- `findSpiritAny`（fn）：instanceId から両プレイヤーのフィールドを検索し、対象スピリットと持ち主を返す
- `applyMagicBuffBonus`（fn）：騎獣スレイプホース：マジックによるBPバフ（bpBuff）が対象に適用された直後にフックし、
- `countEffectCounter`（fn）：selfBuff / bpBuff / voidCoreToSelf / draw / coreGain 共通のカウンタ集計（BS03バッチで統一）。
- `drawDoubleMultiplier`（fn）：効果ドロー倍化（封印された魔導書）：owner のフィールドにレベル有効かつ phaseTurn 一致の
- `resolveAction`（fn）

## server/src/logic/GameEngine.ts

- `handleAction`（fn）：アクションを実行し、エラーがあれば理由を返す（null = 成功）
- `passFlashPriority`（fn）：バトル中のフラッシュで行動したら優先権を相手へ移し、連続パス数をリセットする
- `placeSummonedSpirit`（fn）：【転召】まで解決し終えたスピリットを、維持コアを置いて実際にフィールドへ出す。
- `applyResshinsokuDestination`（fn）：distributeCores の選択を1件適用し、残りがあれば続けて聞く
- `MAGIC_FREE_OPTIONS`（const）：無償化の確認の選択肢。**この並び順に doResolveChoice が依存する**（0=無償で使う / 1=コストを払って使う）
- `COUNT_IS_BODIES`（const）：count が「対象の**体数**」を表すアクション。ここに挙げたものだけを
- `finishBlockDeclaration`（fn）
- `revertActivatedUse`（fn）：フラッシュの優先権を相手へ渡す。両者が連続でパスするとフラッシュ終了。

## server/src/logic/GameState.ts

- `ALL_CARDS`（const）：弾ごとに分割された data/cards/BS0N.json をまとめて読む（data/loadCards.ts 参照）。
- `CARD_DB`（const）
- `getCard`（fn）
- `createInstance`（fn）
- `validateDeckCards`（fn）：カスタムデッキの内容を検証する。問題があれば日本語のエラーメッセージ、なければ null を返す
- `buildDeck`（fn）：色キー（DECK_RECIPES）またはカスタムカードリストからデッキ（cardId の配列）を構築する
- `createGame`（fn）
- `opponentOf`（fn）
- `log`（fn）
- `suspend`（fn）：── 中断と再開（docs/design/RESUME_STACK.md）──────────────────────────────
- `noteHandleActionEntry`（fn）：handleAction の**入口**から呼ぶ。すでに中断中なら、そこを新しい基準にし直す。
- `checkNoMutationAfterSuspend`（fn）：handleAction の出口から呼ぶ。中断中に盤面が変わっていたら記録する
- `takeMutationAfterSuspend`（fn）：検査結果の取り出し（smoke のハーネスが集計に使う）
- `pushResumeFrames`（fn）：中断した残りの処理を再開スタックへ積む。
- `resolveInOrder`（fn）：複数の効果／アクションを**順に解決する**共通形（docs/design/RESUME_STACK.md §9）。
- `resumeTriggerBatch`（fn）：誘発バッチの再開：残りが2件以上ならターンプレイヤーに解決順を聞き、
- `clearBattle`（fn）：バトル状態を終了させる（GameEngine の通常解決・endBattle アクションの双方から使う共有ヘルパー）
- `draw`（fn）：デッキからドローする。引けない場合は相手の勝利（デッキアウト）
- `rawLevel`（fn）：コア数のみによる素のレベル判定（levelAsContinuous / levelOverrideThisTurn による上書きは無視する）。
- `coresForLevel`（fn）：召喚／配置でそのレベルにするために置くコア数。存在しないレベルを指定された場合は null を返す
- `findSpirit`（fn）
- `findNexus`（fn）
- `fieldInstanceIdsOf`（fn）：pid のフィールド（スピリット/ネクサス/合体中ブレイヴ）にある instanceId の集合。
- `findInstanceAnywhere`（fn）：両プレイヤーのスピリット（ネクサスは含まない）から instanceId を検索する。
- `viewFor`（fn）

## server/src/logic/PhaseManager.ts

- `driveTurnStart`（fn）：ターン開始処理のステップ列を fromIndex から順に実行する。
- `EXTRA_STEP_OPTIONS`（const）
- `runExtraStep`（fn）：BS15-X04 Lv2：選んだステップを通常どおり丸ごと行う（そのステップの効果もすべて発揮する）
- `runTurnStart`（fn）：ターン開始処理：start → core → draw → refresh を自動で進めて main で止める。
- `toAttackPhase`（fn）：メインステップ → アタックステップ
- `endTurn`（fn）：ターン終了処理：エンドステップを経て相手のターンを開始する

## server/src/logic/RuleValidator.ts

- `validatePaySources`（fn）：コスト支払いの妥当性を検証する（スピリット上のコアを併用する場合）。
- `validateSummon`（fn）
- `validateResshinsokuSummon`（fn）：【烈神速】：お互いのアタックステップのフラッシュタイミングで、トラッシュのコア5個以上を
- `validateSetNexus`（fn）
- `validateSetBurst`（fn）：バーストのセット（docs/design/BURST.md）：自分のターンのメインステップ限定・ターン1回。
- `nexusMillPayAmount`（fn）：ネクサスの配置コストをデッキ破棄で支払う枚数を決める（栄光の表彰台Lv1）。
- `summonHandDiscardPayAmount`（fn）：スピリットの召喚コストのうち、手札破棄で支払う枚数を決める（BS08ビクティム）。
- `validateHandFlash`（fn）：バトル中に手札のカードを使うときの共通検証（フラッシュマジック・神速召喚・手札から使うフラッシュ効果＝
- `validateUseHandAbility`（fn）：011ミーアバット：手札から使うフラッシュ（kind:"handActivated"）の検証。
- `validateCastMagic`（fn）
- `validateCombineBrave`（fn）：メインステップの任意合体（docs/design/BRAVE.md §6.4）。
- `validateDetachBrave`（fn）：メインステップの任意分離（§6.4）。**効果による分離（コア不要）とは別の手順**で、
- `validateMoveCore`（fn）
- `validateAwaken`（fn）：覚醒：フラッシュタイミングで、自分のスピリットのコアを覚醒持ちへ移す
- `validateActivateAbility`（fn）：起動能力（kind: "activated"）の発動可否。コストを払って任意発動する能力の汎用検証。
- `validateAttack`（fn）
- `validateBlock`（fn）
- `validatePass`（fn）：フラッシュの優先権を相手に渡す（パス）
- `validateEndTurn`（fn）：ターン終了（endTurn）の妥当性を検証する。
- `validateTakeLife`（fn）

## server/src/logic/actions/bounce.ts

- `returnToHandCandidateCountForPay`（fn）：ponytail: self相対フィルタ（maxBp:"selfBp"等）は解決せずに比べる。pay で使うカードが出たら normalizeFilter を通す
- `returnToDeckTopCandidateCountForPay`（fn）：pay の判定表（returnToDeckTop）が使う候補数

## server/src/logic/actions/cores.ts

- `coreRemoveAchievableCountForPay`（fn）：pay の判定表（coreRemove）が使う候補。spread＝候補の合計コア数、all＝候補数（0/1）、
- `payCoresFromFieldOrReserveToTrash`（fn）：「自分のフィールド/リザーブのコアを自分のトラッシュに置く」の共通処理。
- `fieldOrReserveCores`（fn）：「自分のフィールド/リザーブ」から払えるコアの総量

## server/src/logic/actions/destroy.ts

- `ownSideDestroyCandidates`（fn）：side:"own"（destroyの自分側対象）の候補列挙。ハンドラ本体とpayの判定表（CHECKERS）の両方から呼び、
- `destroyCandidateCountForPay`（fn）：ponytail: self相対フィルタ（maxBp:"selfBp"等）は解決せずに比べる。pay で使うカードが出たら normalizeFilter を通す
- `destroyNexusCandidateCountForPay`（fn）：pay の判定表（destroyNexus）が使う候補数。levelFilter/colorFilterのみ対応（他は今回のpay移行対象外）
- `nexusHasCoresForPay`（fn）：pay の判定表（nexusCoresToTrash）：対象側のネクサスのどれかにコアが1個以上あるか

## server/src/logic/actions/drawDiscard.ts

- `discardSelfChooseEligible`（const）：pay.ts の判定表からも使う

## server/src/logic/actions/exhaustRefresh.ts

- `refreshOneOwnCandidates`（fn）：refreshOne の「own側・疲労状態・filter一致」の候補集め（all/eventTargetOnly/anySideは含まない、

## server/src/logic/actions/filter.ts

- `attemptOf`（fn）：耐性判定（EffectModules.resistanceAgainst / isResisted）へ渡す「何をしようとしているか」を
- `FilterCarrier`（型）：normalizeFilter に渡せるアクションの形。filter を持つアクションはすべてこれを満たす
- `SELF_REQUIRED`（const）：self 相対のBP指定が必要なのに self が不在だったことを表す。
- `normalizeFilter`（fn）：action.filter を ResolvedTargetFilter へ解決する。

## server/src/logic/actions/pay.ts

- `PAYABLE_TYPES`（const）：判定表に載っている type だけが pay の cost/then に書ける（scripts/validate-cards.ts が突き合わせる）
- `canPayResolve`（const）：判定表に無い type、または判定に落ちた場合は false

## server/src/logic/actions/placeCores.ts

- `availableFromSource`（fn）：from の残量（count:"all" の解決に使う。void は上限なしなので呼び出し側で扱う）。
- `placeCoresPoolCandidates`（fn）：to:"spirit"/"nexus" の置き先候補（filter一致分のみ。target:"self"/"all"/"one" の絞り込みは

## server/src/logic/actions/removeCores.ts

- `removeCoresAchievableCountForPay`（fn）：pay の判定表（removeCores）が使う、取れる最大数。filter は self相対軸を解決せずに比べる

## server/src/logic/actions/revealAction.ts

- `matchesPick`（fn）

## server/src/logic/actions/timedEffect.ts

- `isAllowedRuleCounter`（fn）

## server/src/logic/actions/trashRecover.ts

- `recoverSpiritFromTrashCandidateOk`（fn）：recoverSpiritFromTrash の対象判定（カード種別・色・系統・キーワード・名前・コスト等の絞り込み）。
- `recoverMagicFromTrashCandidateOk`（fn）：recoverMagicFromTrash の対象判定（カード種別・色・バースト有無・onlyBurstDestroyedCard）。

## server/src/logic/actions/types.ts

- `ActionCtx`（型）
- `ResolveOpts`（型）：ctx.resolve の任意引数。旧 resolveAction の第3・5〜9引数に対応する
- `ActionHandler`（型）：単一アクションのハンドラ。action は type で絞り込まれた具体型が渡る
- `ActionRegistry`（型）：全 EffectAction.type を網羅するハンドラ表。

## server/src/logic/battleResolve.ts

- `resolveLifeDamage`（fn）：ライフで受けることを宣言した場でライフダメージを解決する（doTakeLifeから直接呼ばれる）。
- `resolveDirectedBlock`（fn）：指定アタック（canDirectAttack）で指定された相手スピリットを、正規のブロック宣言として
- `resolveBattle`（fn）：ブロック成立後のバトル解決：BP比較で敗者を破壊（同値は相打ち）
- `resumeBattleResolution`（fn）：中断されていたバトル解決の続き（drainResumeStack から呼ぶ）

## server/src/logic/brave.ts

- `attachBrave`（fn）：**合体処理の唯一の入口。** ブレイヴの実体を field.combinedBraves へ入れ、
- `detachBraveByEffect`（fn）：効果によるブレイヴの分離（§12.5）。**コアは要らない**（「場を離れるときに残す」＝
- `detachBraveByOwnerChoice`（fn）：相手の効果で分離させられるとき、**コアの移動はブレイヴの持ち主が行う**（BRAVE.md §12.5.1）。
- `destroyCombinedBrave`（fn）：合体中のブレイヴ**だけ**を破壊する（BRAVE.md §6.5。2026-09-02 ユーザー確認）。
- `returnCombinedBraveToHand`（fn）：合体中のブレイヴ**だけ**を手札へ戻す（destroyCombinedBrave のバウンス版。
- `returnCombinedBraveToDeckBottom`（fn）：合体中のブレイヴ**だけ**をデッキの一番下へ戻す（returnCombinedBraveToHand のデッキ下版。
- `detachBraveVoluntary`（fn）：メインステップの任意分離（§6.4）。**効果による分離（detachBraveByEffect）とは別の手順**で、// メインステップの任意分離（§6.4）。**効果による分離…
- `detachBravesOnLeaveFree`（fn）：**ホストが場を離れるときに必ず1回だけ呼ぶ共通の入口。**
- `detachBravesOnLeave`（fn）
- `flushBraveKeeps`（fn）：脇に置いてあるブレイヴを1体ずつ決着させる。
- `applyBraveKeep`（fn）：「残す」が選ばれた（doResolveChoice から呼ぶ）。支払いは召喚と同じ payCost に通す
- `declineBraveKeep`（fn）：「残さない」が選ばれた（doResolveChoice から呼ぶ）。合体元と同じくトラッシュへ

## server/src/logic/choice.ts

- `doResolveChoice`（fn）：pendingChoice（効果解決中のプレイヤー選択）への応答を処理する。

## server/src/logic/counted.ts

- `countedAmount`（fn）

## server/src/logic/debugBoard.ts

- `DebugInstance`（型）：場に置く1体の指定。cores を省略するとLv1に必要なコア数（最低でも1個）
- `DebugPlayerBoard`（型）
- `DebugBoard`（型）
- `applyDebugBoard`（fn）：盤面を適用する。問題があればエラーメッセージ、成功なら null を返す。

## server/src/logic/deckPolicy.ts

- `applyDeckPolicy`（fn）：カードデータの limited / limitCount を、上のポリシーに沿って上書きしたコピーを返す。

## server/src/logic/keywords/bofu.ts

- `bofuCountBonusFor`（fn）：持ち主フィールドの bofuCountBonus（BS08ゲラン准将Lv2）合計：【暴風】の指定数に加算する。
- `bofuCountFor`（fn）：このスピリットが持つ【暴風】の実効指定数（静的keywordのcount + bofuCountBonus合計）。
- `hasBofuOnBlock`（fn）：持ち主のフィールドに bofuOnBlock（BS07大風車の丘Lv2）が有効な発生源があるか。
- `hasBofuChooserSelf`（fn）：持ち主のフィールドに bofuChooserSelf（BS07ワールウィンド）が有効な発生源があるか。

## server/src/logic/keywords/burst.ts

- `placeBurst`（fn）：バーストのセット共通処理（docs/design/BURST.md）。既にセット済みなら旧カードを先にトラッシュへ送る。
- `finishBurstActivation`（fn）：バースト発動の後処理（docs/design/BURST.md）。summonBurstCardFree はアクション自身が場へ出すので
- `fireOwnBurstActivated`（fn）：バーストの解決がすべて終わった後（ownBurstActivated）。**発動開始時点で場にいた発生源にだけ発火させる**
- `finishSummonEffect`（fn）：召喚時効果を解決しきった地点で呼ぶ（選択を挟んだときは handleAction の事後フック）。
- `fireBurstOnEvent`（fn）：kind:"burst" の走査本体（docs/design/BURST.md）。fireFieldEventTriggers の末尾から呼ぶほか、

## server/src/logic/keywords/funsai.ts

- `funsaiBonusTotal`（fn）：持ち主フィールドの funsaiBonus（崩壊する戦線／デモリッシュ）合計：【粉砕】の破棄枚数に加算する。
- `millCapBonusFor`（fn）：持ち主フィールドの millCapBonus（BS06マキシマムブレイク）合計：mill.countMax の上限値に加算する。
- `hasFunsaiOnBlock`（fn）：持ち主フィールドに funsaiOnBlock（士気高き大本営）が有効な発生源があるか
- `resolveFunsai`（fn）：【粉砕】の解決：spirit が現在レベルで粉砕を持つなら、相手のデッキを

## server/src/logic/keywords/jugeki.ts

- `hasJugekiOnBlockReplace`（fn）：持ち主のスピリットの【呪撃】が『ブロック時』へ差し替えられているか（BS06カウンターカース）。

## server/src/logic/keywords/kobo.ts

- `hasKoboOnBlock`（fn）：士気高き大本営の光芒版（BS03星降る巡礼地Lv2）：持ち主のスピリットの【光芒】を
- `resolveKoboOnBattleEnd`（fn）：【光芒】: バトル終了時、アタッカーがレベル有効で光芒を持つなら、

## server/src/logic/keywords/kyoshu.ts

- `hasKyoshuOnBlock`（fn）：持ち主のフィールドに kyoshuOnBlock（BS07蹴撃の戦場跡Lv2）が有効な発生源があるか。

## server/src/logic/keywords/tensho.ts

- `TENSHO_SUBSTITUTE_REST`（const）：【転召】置換（tenshoCoreSubstitute）の選択肢ラベル。cores.ts の tenshoSubstituteChoice ハンドラと共有する
- `TENSHO_SUBSTITUTE_DUMP`（const）
- `TENSHO_SUBSTITUTE_HAND`（const）：mode:"returnToHand"（SD02-009 獣将軍クジャルタ）用のラベル。疲労版と選択肢の文言だけが違う
- `TENSHO_SUBSTITUTE_HAND_DUMP`（const）
- `tenshoSpecOf`（fn）：【転召】の解決：spirit が現在レベルで転召を持つなら、召喚コスト支払い後（doSummonの末尾）に呼ぶ。
- `tenshoCandidates`（fn）：【転召】でコアを置く対象になれる自分のスピリット。
- `resolveTensho`（fn）
- `tenshoSelfCostBonus`（fn）：kind:"tenshoSelfCostBonus"：【転召】の生贄候補列挙でだけ、その候補のコストに+amountする。
- `fireTenshoEvent`（fn）：フィールドイベント誘発「自分の【転召】が解決したとき」（BS08関将龍皇ドラグロン）。
- `flushPendingTenshoEvent`（fn）：保留していた『転召したとき』を、召喚されたスピリットが場に出てから発火する。
- `dumpAllCoresTensho`（fn）：対象スピリットの上のコアすべてをdestへ置く（trash=持ち主のトラッシュ、void=消滅）。
- `tenshoAfterTargetTrigger`（fn）：dumpAllCoresTensho の後半：置換（疲労で代替）の判断 → 『転召が解決したとき』の誘発 → コア処理。
- `applyTenshoSubstitute`（fn）：【転召】の置換を実際に適用する（疲労 or 手札に戻す）。どちらもコアは指定場所へ行かない。
- `applyTenshoSubstituteCrossSource`（fn）：tenshoCoreSubstituteのfamilyFilter/costFilter版（BS12-061剣の誕生地）：疲労するのは対象スピリット
- `tenshoDumpAndDestroy`（fn）：【転召】の最終段：対象の上のコアをすべて dest へ置き、維持コア割れなら消滅させる。

## server/src/logic/magic/cast.ts

- `resolveMagic`（fn）
- `consumeOncePerBattleMagicFree`（fn）：oncePerBattle の magicFreeGrant を「このバトルで1枚使った」として記録する。
- `usableMagicTarget`（fn）：クライアントが**先に選んだ対象**をそのまま使ってよいかを見る（2026-08-21 利用者確定）。
- `doCastMagic`（fn）
- `offerOpponentMainEndMagic`（fn）：kind:"magic" usableAtOpponentMainEnd（BS15-079プロボケイション）：相手（＝これからアタックステップに
- `applyProvocationUse`（fn）：プロボケイションの使用確定：コストを払い、手札から取り除いてフラッシュ効果を解決する

## server/src/logic/magic/negate.ts

- `magicNegateNexusPayer`（fn）：マジックを無効にできる発生源（kind:"magicNegate"）を、使用者の相手側のフィールドから探す。
- `magicNegateTurnOverride`（fn）：【氷壁】の発揮タイミングの置き換え（BS09-077アイスバーグ）。無ければ undefined
- `findMagicNegateSource`（fn）
- `payMagicNegate`（fn）：無効化のコストを支払い、ログを残す。呼び出し側はこのあとマジックの効果を解決しない
- `applyMagicNegateChoice`（fn）：pendingChoice（無効化の確認）で「無効にする」が選ばれたときの後処理。
- `declineMagicNegateChoice`（fn）：pendingChoice（無効化の確認）で「無効にしない」が選ばれたときの後処理。中断していた解決を続ける

## server/src/logic/magic/redirect.ts

- `bothSidesPids`（fn）：封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）：「お互いを対象とするマジックの効果」の
- `findBothSidesRedirectSource`（fn）：封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の発生源を探す。
- `bothSidesRedirectKeepPid`（fn）：封印された魔導書Lv1 の答えのうち「**対象として残る側**」を返す（null＝絞らない）。
- `applyBothSidesRedirectToCandidates`（fn）：上の答えで候補列挙（pickAnySideCandidates）を片側に絞る。スピリットとネクサスの両方を見る
- `setTargetRedirect`（fn）：マジックカードの効果を実行する（timing に一致するすべての効果を配列順に実行）。
- `isRedirectOptional`（fn）：この発生源の絞り込みが「〜にできる」＝任意か（optional:true）。
- `findMagicRedirectSource`（fn）：magicTargetRedirect の発生源を探す（実際に絞り込むかは呼び出し側が決める）。
- `redirectTargetMatches`（fn）：絞り込み対象（サンク）が、そのアクションの filter に合致するか。
- `askBothSidesRedirect`（fn）：封印された魔導書Lv1（kind:"bothSidesTargetRedirect"）の「対象を相手のみ／自分のみに変更できる」の確認。
- `BOTH_SIDES_REDIRECT_OPTIONS`（const）：確認の選択肢。**この並び順に GameEngine.doResolveChoice が依存する**（0=変更しない / 1=相手のみ / 2=自分のみ）。
- `BOTH_SIDES_ACTION_TYPES`（const）：「お互いを対象とする」効果（side:"both" 等）か、陣営を指定しない単体対象（anySide）を含むか。
- `actionTouchesBothSides`（fn）
- `applyMagicSideChoice`（fn）：pendingChoice（対象の変更の確認）の後処理。keepPid=null なら変更せず、
- `findMagicRedirectSourceForCard`（fn）：このマジックが解決する効果のうち、1つでも magicTargetRedirect の絞り込み対象になるものがあるか。
- `applyMagicRedirectChoice`（fn）：pendingChoice（対象の絞り込みの確認）の後処理。承認・拒否のどちらでも、中断していた解決を続ける。

## server/src/logic/magic/resolve.ts

- `resolveMagicEffects`（fn）：マジックの効果本体の解決。resolveMagic から（無効化されなかったときに）呼ぶ。
- `findMagicRepeatGrantSource`（fn）：使用者pidのフィールドにある、kind:"magicRepeatGrant" の有効な発生源を返す（BS07大天使イスフィール）。
- `consumeMagicRepeatGrant`（fn）：上で見つけた発生源を「このバトルで使い切った」として記録する（oncePerBattle のときだけ）
- `MAGIC_REPEAT_OPTIONS`（const）：再発揮の確認の選択肢。**この並び順に GameEngine.doResolveChoice が依存する**（0=発揮する / 1=しない）
- `applyMagicRepeatChoice`（fn）：pendingChoice（再発揮の確認）の後処理。GameEngine.doResolveChoice から呼ぶ
- `runMagicActions`（fn）：マジックの効果エントリを1周ぶん解決する。resolveMagicEffects が1〜2回呼ぶ
- `fireMagicUsedTriggers`（fn）：「マジックの効果を使用したとき」の誘発（使用者側・相手側）。
- `magicMirrorRepeatHandler`（const）：このフラッシュタイミングで相手が直前に使用したマジックの効果を、自分が使用したものとして

## server/src/logic/removal.ts

- `recordDestroysOf`（fn）
- `destroySpirit`（fn）
- `resumeDestroyCommit`（fn）：中断していた破壊処理の続き（drainResumeStack から呼ぶ）
- `commitPendingDestruction`（fn）：破壊待機状態のカードを実際にトラッシュへ置き、乗っていたコアをリザーブへ移す（＞６の3と4）。
- `fireQueuedDestroyBursts`（fn）：破壊後バースト（kind:"burst".event:"ownSpiritDestroyed"）を、pendingBurstDestroyQueueにたまった分だけ
- `tryFreeSummonOnHandDiscard`（fn）：手札のカード自身が持つ「相手のスピリットの効果で手札から破棄されたとき、コストを支払わずに
- `tryHandFreeSummonOnLifeDamaged`（fn）：手札のカード自身が持つ「ライフが減ったとき、コストを支払わずに召喚できる」（BS08猫娘アニー）。
- `applyHandFreeSummon`（fn）：pendingChoice（手札からの無償召喚の確認）で「召喚する」が選ばれたときの後処理。
- `destroySpiritsFrom`（fn）：複数体をまとめて破壊する（1体ごとに「破壊される代わりに復活できる」の確認で中断しうる）。
- `destroyTargetsBatch`（fn）：事前に確定した対象リストをまとめて破壊する（呼び出し元の定型）。
- `resumeDestroyBatch`（fn）：破壊バッチの続きを回す。1体ごとに「破壊される代わりに復活できる」の確認で中断しうるので、
- `applyDestroyBatchAfter`（fn）：「この効果で破壊したスピリット1体につき」の後処理。
- `destroyNexus`（fn）：ネクサスを破壊する。破壊できたら true、破壊耐性（nexusIndestructible）で不発だった場合は false を返す
- `resumeDestroyNexusCommit`（fn）：中断していたネクサスの破壊処理の続き（drainResumeStack から呼ぶ）
- `commitPendingNexusDestruction`（fn）：破壊待機状態のネクサスを実際にトラッシュへ置き、乗っていたコアをリザーブへ移す（＞６の3と4）
- `returnNexusToHand`（fn）：ネクサスを持ち主の手札へ戻す（バウンス）：コアはリザーブへ、カードは手札へ。
- `returnNexusToDeckBottom`（fn）：ネクサスを持ち主のデッキの下（末尾）へ戻す：コアはリザーブへ、カードはデッキの下へ。
- `returnNexusToDeckTop`（fn）：ネクサスを持ち主のデッキの上へ戻す：returnNexusToDeckBottomのデッキ上版（unshift）。
- `returnSpiritToHand`（fn）：スピリットを持ち主の手札へ戻す（バウンス）。
- `markBounce`（fn）
- `flushBounces`（fn）：バウンス待機状態のカードを実際に手札／デッキへ移し、そのあとで誘発をまとめて発揮する。
- `fireBounceTriggers`（fn）：移動後の誘発をまとめて発揮する。**選択待ちで中断したら残りを再開スタックへ送る**
- `returnSpiritToDeckTop`（fn）：スピリットを持ち主のデッキの一番上へ戻す：コアはリザーブへ、カードはデッキトップへ。
- `returnSpiritToDeckBottom`（fn）：スピリットをデッキの一番下へ戻す（returnSpiritToDeckTop のデッキ下版。BS04グラシアルブレス）。
- `canTakeCoresFrom`（fn）：相手のスピリットからコアを奪う効果が、そのスピリットに届くか（＝耐性で弾かれないか）。
- `removeCores`（fn）：コアを取り除き、維持コア（Lv1）を下回ったら消滅させる
- `removeCoresToTrash`（fn）：コアを取り除いて持ち主のトラッシュへ置き、維持コア（Lv1）を下回ったら消滅させる
- `takeCoresFromSpirit`（fn）：コアを取り除いてボイドへ送る（消滅させる。リザーブ・トラッシュどちらも増えない）。
- `removeCoresToVoid`（fn）
- `coreFloorFor`（fn）：globalConstraint "coreFloorByCost"（BS08聖なる柱状彫刻）：有効な発生源があれば、スピリット上のコアは
- `isBattlingCoreProtected`（fn）：バトルをしている両陣営のスピリット上のコアは、globalConstraint "battlingCoresProtected" が

## server/src/logic/revive.ts

- `wouldAskReviveConfirm`（fn）：この個体を今このコンテキストで破壊しようとしたとき、
- `collectReviveEntries`（fn）：この破壊で成立しうる「フィールドに残る／戻る」のエントリを集める（**副作用ありに変わった**：
- `applyReviveEntry`（fn）：集めておいた「フィールドに残る／戻る」エントリを1つだけ適用する（列から選ばれたときに呼ぶ）。
- `destroyedCostsOf`（fn）：この破壊で【不死】の確認が出るトラッシュのカード位置を列挙する（**副作用なし**）。
- `destroyedFamiliesOf`（fn）：破壊された個体が【不死：系統】の引き金として持つ系統の一覧（静的な系統。BS13-014 闇騎士アグラヴェイン）
- `fushiCandidates`（fn）
- `fushiSummonOrConfirm`（fn）：【不死】の確認で「召喚する」が選ばれたときの後処理。**コストはここで支払う**
- `applyFushiSummon`（fn）
- `spiritMillFreeSummonOrConfirm`（fn）：器AR：BS13-034ミノガメン「相手のデッキ破棄効果で破棄されたこのカードは、コストを支払わずに
- `declineSpiritMillFreeSummon`（fn）
- `applySpiritMillFreeSummon`（fn）
- `applyReviveConfirm`（fn）：保留していた復活の確認で「復活させる」が選ばれたときの後処理。
- `declineReviveConfirm`（fn）：保留していた復活の確認で「復活させない」が選ばれたときの後処理。見送っていた破壊をここで行う

## server/src/logic/state/continuous.ts

- `recordTimed`（fn）：期間つき効果を一覧に記録する（docs/design/TIMED_EFFECTS.md）。一覧への追加はここだけにし、記録したら必ず個体の写しを作り直す
- `recordPlayerRule`（fn）：pid にこのターンの間の制約を掛ける（効果の中の「さらに、このターンの間〜」から書く）
- `recordBp`（fn）：1体を BP+（このターン／このバトルの間）。ownerPid＝効果を出した側
- `refreshLevelAsOverrides`（fn）

## server/src/logic/state/exhaust.ts

- `checkExhaustOnCoreChange`（fn）
- `exhaustSpirit`（fn）：スピリットを疲労させる唯一の入口。すでに疲労していれば何もしない（誘発も起きない）。
- `refreshSpirit`（fn）：スピリットを回復させる唯一の入口。すでに回復状態なら何もしない（誘発も起きない）。
- `fireExhaustedTriggers`（fn）：「スピリットが疲労したとき」のフィールドイベント発火。
- `isRefreshBlockedByMark`（fn）：スクルディア：相手のスピリットから「回復できない」と指定されていて、
- `canExhaustNexus`（fn）：BS09-063花の宮殿Lv2：発生源の持ち主から見た相手のネクサスは疲労させられない。

## server/src/logic/summon.ts

- `fireSummonSequence`（fn）
- `summonFreeFromHandIndex`（fn）
- `summonFreeFromTrashIndex`（fn）：summonFromTrashFree 共通の召喚実行部：summonFreeFromHandIndexのトラッシュ版。
- `summonFromHandFreeCandidateMatches`（fn）：summonFromHandFree の候補判定（色・系統・コスト等の絞り込み＋payCost指定時の支払い可否）。
- `summonFromTrashFreeCandidateMatches`（fn）：summonFromTrashFree の候補判定。summonFromHandFreeCandidateMatches のトラッシュ版。

## server/src/logic/targeting.ts

- `pickEnemyCandidates`（fn）：相手スピリットから BP <= maxBp かつ extraPredicate を満たすものをすべて集める
- `pickAnySideCandidates`（fn）：「自分か相手のスピリット1体」を対象にする効果（action.anySide）の候補列挙。
- `pickAnySideByBp`（fn）：「自分か相手のスピリット1体」を対象にする効果（action.anySide）の自動選択（非対話時）で使う共通ロジック。
- `pickEnemyByBp`（fn）：相手スピリットから BP <= maxBp かつ extraPredicate を満たすものの中で
- `pickEnemyLowestCost`（fn）：destroy.lowestCost（BS12-084マーキュリーゴブレット）：相手スピリットからコスト最小のものを1体選ぶ
- `tryInteractiveTargetChoice`（fn）：interactiveTargets 有効時、count で複数体を処理するアクション（destroy/exhaust/destroyExhausted/
- `tryInteractiveCardChoice`（fn）：tryInteractiveTargetChoice のカード版：interactiveTargets有効時、count等で複数回に分けて
- `bpBuffTargetPasses`（fn）：bpBuff の「対象になれるか」の判定。
- `pickBpBuffTarget`（fn）：bpBuff の対象選択：
- `pickOwnKeywordTarget`（fn）：grantKeyword 共通の対象選択：自分のスピリットのみが対象（targetInstanceId は自分側のみ有効）。
- `requestActivationConfirm`（fn）：「〜できる」（EffectDef.triggered.optional）の発動確認。
- `requestChoice`（fn）：選択を要するアクションの共通ヘルパー。候補が0件なら不発、1件なら即座に解決、
- `requestCardChoice`（fn）：requestChoice の kind:"card" 版：自分の手札／トラッシュのカードから選ばせる共通ヘルパー。

## server/src/logic/triggers.ts

- `isTriggerSuppressed`（fn）：selfInstance が持つ、指定イベントの誘発効果を実行する。
- `fireSummonTrigger`（fn）：『このスピリットの召喚時』効果の発火。解決中だけ GameState.resolvingSummonTriggerPid を立て、
- `revertOncePerTurn`（fn）：「ターンに1回」の消費を戻す（発揮しなかったと分かったとき）。GameEngine の revertActivatedUse の誘発版
- `revertDestroyGroupUsage`（fn）：同時破壊グループの「使った」印を戻す（「〜できる」を断った・コストが払えず不発だったとき）。
- `fireTrigger`（fn）
- `fireCombinedAttackTrigger`（fn）：BS13-007豹竜パンドランサー：「自分のスピリット状態のブレイヴ1体と合体できる。その後、このスピリットが持つ
- `fireBattleWonTriggers`（fn）：バトルの勝者側プレイヤーのフィールド（ネクサス＋スピリット）を走査し、
- `fireStepTriggers`（fn）：指定ステップに到達したときの誘発（ネクサス・スピリット共通）を、
- `FieldEventExtraItem`（型）：フィールドイベント誘発：「フィールド上の他の何かに起きたこと」に対してネクサス／スピリットが反応する。
- `burstConditionMet`（fn）：kind:"burst" の condition 判定（docs/design/BURST.md）。未指定なら常に満たす
- `fireFieldEventTriggers`（fn）
- `notifyHandGained`（fn）：フィールドイベント誘発「持ち主から見て相手の手札にカードが加えられたとき」：
- `notifyNexusDeployed`（fn）：フィールドイベント誘発「自分のフィールドにネクサスが配置されたとき」（BS04栄光の表彰台Lv2）。
- `fireNexusDeployed`（fn）：ネクサスが「配置」されたときの発火をまとめたもの。通知は2種類あり別物:
- `battleBp`（fn）：果て無き地平線Lv1（kind:"battleBpAsLevel"）：バトルのBP比較のときだけ、指定レベルのスピリットが
- `applyJugekiCoreToVoid`（fn）：魔影街Lv1（kind:"jugekiCoreToVoid"）：アタッカー側のフィールドに発生源がある間、
- `notifySpiritCoresRemovedByOpponent`（fn）：フィールドイベント誘発「自分のスピリット上のコアが相手の効果でリザーブ/トラッシュへ置かれたとき」

## server/src/logic/zones/mill.ts

- `millCapFor`（fn）：globalConstraint "millCap"（BS05エターナルシールド）：pid自身のeffectSources（フィールド＋
- `mutualMillCapRemainingFor`（fn）：器AM：globalConstraint "millCap" の mutual:true 版（BS13-026キグナ・スワンMk-II）。
- `millCapPerTurnRemaining`（fn）：globalConstraint "millCap" の perTurn:true 版（BS04侵されざる聖域Lv2）：pidのデッキが
- `millDeck`（fn）：【粉砕】: デッキ上から count 枚を持ち主のトラッシュへ送る（不足時はある分だけ）。
- `collectMilledMagicToTegamoto`（fn）：kind:"milledMagicToTegamoto"（BS06混迷する魔法実験場Lv2）：破棄されたマジックカードを
- `isDeckMillBlocked`（fn）：「自分のデッキは破棄されない」（globalConstraint "noDeckMillByOpponent"）が pid に対して有効か。
- `findDeckMillNegate`（fn）：kind:"deckMillNegate"（BS08鳳翼の聖剣Lv2）：この破棄を無効にできる発生源を探す。
- `trySuspendDeckMillNegate`（fn）：破棄を見送って**その場で**確認を出す。出した（＝この破棄を保留した）なら true。
- `payDeckMillNegateCost`（fn）：無効化のコスト（ライフのコアN個を持ち主のリザーブへ）を支払い、無効になった旨をログに出す
- `applyDeckMillNegate`（fn）：保留していた「デッキ破棄の無効化」の確認で、承認されたときの処理。
- `declineDeckMillNegate`（fn）：同上、断られたときの処理。見送っていた破棄をここで行う（skipNegate で確認の再入を防ぐ）
- `resolveMilledFromDeck`（fn）：破棄されたカードのうち kind:"onMilledFromDeck" を持つものを解決する。

## server/src/roomManager.ts

- `RoomPlayer`（型）
- `Room`（型）
- `RoomManager`（class）
- `MatchQueueEntry`（型）：---- ランダムマッチの待機キュー ----
- `MatchQueue`（class）

## server/src/type.ts

- `PlayerId`（型）：プレイヤーIDやステップ名を厳格に定義（タイポを防ぎます）
- `Phase`（型）
- `Color`（型）
- `CardType`（型）：ブレイヴは「カードタイプ」。単体で場に出すとスピリットとして扱われ、
- `DeckSpec`（型）：デッキの指定方法: DECK_RECIPES の色キー（"red" 等）またはカスタムデッキのカードリスト（cardId -> 枚数）
- `LevelDef`（型）：スピリット/ネクサスのレベル定義（ネクサスは bp: 0）
- `BraveConditionTerm`（型）：ブレイヴの合体条件（docs/design/BRAVE.md §2.2）。読点区切りの複数条件は配列＝OR。
- `BraveCondition`（型）
- `PaySource`（型）：コスト支払い時に使うコアの割り当て（自分のスピリット上またはネクサス上のコア）
- `FamilyFilter`（型）：系統フィルタ：単一文字列 or 配列（配列＝いずれかの系統を持てばよいOR条件）。
- `TargetFilter`（型）：---- 対象選択の絞り込み軸（TargetFilter） ----
- `ResolvedTargetFilter`（型）：normalizeFilter() が self 相対のBP指定（"selfBp"）を数値へ解決した後の形。
- `EffectCounter`（型）：効果の実行内容。EffectModules のアクションハンドラと 1:1 で対応する。
- `TriggerEvent`（型）：誘発イベント（data.md 5.1 のイベント層）。
- `FieldEvent`（型）：フィールドイベント誘発（data.md 5.1 のイベント層の追加分）。
- `Keyword`（型）：キーワード効果。今後同名キーワードを持つカードが多数追加されるため、
- `AuraCounter`（型）：常時BP修正（オーラ）のカウンタ。発生源の持ち主基準で数える。
- `AuraCondition`（型）：常時BP修正（オーラ）の発動条件。満たすときのみ amount を適用する。
- `AuraDef`（型）：常時BP修正の定義
- `GameEvent`（型）：クライアント演出用のゲームイベント（アクション単位の一時データ）。
- `EndStepLock`（型）：ブロック可否などの制約定義（RuleValidator が参照する宣言的ルール）
- `ConstraintDef`（型）
- `GlobalConstraintDef`（型）：フィールド全体制約の定義（kind: "globalConstraint" が参照する宣言的ルール）。
- `DestroyContext`（型）：破壊の発生源コンテキスト（省略可）。復活系効果（reviveOnDestroy）が参照する。
- `CardData`（型）：効果定義（kind による判別ユニオン）。
- `CardInstance`（型）：盤面インスタンス（可変）。data.md 6.2 に対応
- `PlayerState`（型）：プレイヤーの状態
- `BattleState`（型）：バトル（アタック〜解決まで）の状態
- `PendingChoice`（型）：効果解決中のプレイヤー選択（v1は対象選択のみ）。resolveAction が候補2件以上のときに
- `ResumeFrame`（型）：中断した処理の再開情報（GameState.resumeStack の要素）。
- `GameState`（型）：ゲーム全体の状態（サーバーで一元管理）
- `TimedContent`（型）：期間つき継続効果（timedEffect）の内容。bp の amountCounter は、全体ルールでは計算のたびに数え直す（ダークパワーの Q&A）。
- `TimedRecord`（型）：期間つき効果の記録（docs/design/TIMED_EFFECTS.md）。追加順に意味がある（後から掛けた方が勝つもの）
- `PlayerRuleDef`（型）：プレイヤーに掛かる「このターンの間」の制約（期間つき効果の一覧に target.kind:"player" で記録する。効くプレイヤーは timedEffect の side）
- `PlayerView`（型）
- `GameView`（型）
- `GameAction`（型）

## server/src/types/effectAction.ts

- `CardPick`（型）：カードデータ1枚に対する条件（reveal の pick・if の cond.last）
- `IfCond`（型）：last＝GameState.lastMoved に pick を満たすカードが1枚以上。count＝既存カウンタとの比較
- `EffectAction`（型）

## server/src/types/effectDef.ts

- `EffectDef`（型）
- `MagicCondition`（型）：マジックの条件（判定は shared/magicCondition.ts）

## public/src/renderer.ts

- `setCardDb`（fn）
- `master`（fn）
- `levelOf`（const）：main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.currentLevel）
- `spiritHasKeywordView`（const）：main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.spiritHasKeyword）
- `instHasColorView`（const）：main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.instHasColor）
- `spiritHasFamilyView`（const）：main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.spiritHasFamily）
- `canBlockAttacker`（fn）：ブロック可能ハイライト用: blocker が attacker をブロックできるか。
- `hasMagicImmunityView`（const）：main.ts など既存の呼び出しを壊さないための別名（実体は shared/rules.hasMagicImmunity）
- `payableFieldCores`（fn）：支払いに使える自分のフィールドのコア総数（スピリット/ネクサス上）。
- `payingNeed`（fn）：支払いモードで満たすべき合計コア数（フィールド割り当て＋リザーブの合計がこれに達すれば送信可能）
- `payingRemaining`（fn）：支払いモードでの残り不足コア数（0なら送信可能）
- `TargetSide`（型）：マジックが対象を必要とするか（"opponent" = 相手スピリット、"self" = 自分スピリット）
- `magicTargetSide`（fn）：timing: メイン効果とフラッシュ効果で対象側が異なるカード（例: BS01-131）があるため、
- `canAwaken`（fn）：【覚醒】を現在レベルで持っているか（判定はサーバー validateAwaken と同一の共有実装）
- `activatableAbility`（fn）：起動能力が今このスピリットで発動可能なら {effectId, costLabel} を返す
- `PayingState`（型）：支払いモード：コストをフィールドのコア／代替コストで賄うための一時状態
- `AltPayInfo`（型）：この支払いで使える代替コストの種類と上限。
- `payingCardId`（fn）：支払いモードで使える代替コストを求める。**サーバーの上限計算と同じ式にすること**
- `payingAltPay`（fn）
- `payingShinsokuAssistCandidates`（fn）：kind:"shinsokuPayAssist"（BS16-021）：この支払いで選べる肩代わり候補（【神速】召喚のときだけ）
- `payingShinsokuAssistDiscount`（fn）：選択済みの肩代わり候補ぶんの合計割引
- `UiState`（型）
- `canDirectAttack`（fn）：指定アタック（canDirectAttack）を現在レベルで持っていれば対象条件を返す（共有実装）
- `matchesDirectedAttackFilter`（fn）：指定アタックの対象条件に相手スピリットが合致するか（判定はサーバーと同一の共有実装）。
- `render`（fn）
- `showWaiting`（fn）：ロビー側の表示制御
- `hideWaiting`（fn）
- `showToast`（fn）
- `hideEffectTooltip`（fn）
- `setupEffectTooltip`（fn）
