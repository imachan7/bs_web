# SJ12・SJ13・EX 付録プロモ43枚 調査メモ（調査役）

対象：`data/staging/SJ.json` の43枚（SJ12-01〜08／SJ13-01〜26／EX007〜009・EX012〜014・EX018〜020）。実装はしていない。
「節」＝効果文の見出しブロック1つ（合体条件は含めない）。手本の効果 id は `data/cards` を読んで確かめたものだけ。

## 1. 集計
- 節の数：58（効果なし＝0節の6枚：SJ13-10 11 13 14 15 19）
- 既存の器で書ける：55
- 新しい部品が要る：3節（SJ13-03・EX014 合体時Lv3・EX009 破壊時）。部品は2つ（§2）
- 確認すべき解釈：1（EX014 の範囲。§4）。そのほかは手順書・既存データで決定済み

内訳（節）：SJ12 15／SJ13 24（SJ13-01〜09 が11、SJ13-12〜26 が13）／EX007〜014 13／EX018〜020 6。

## 2. 新しい部品の候補
器の索引（kind/type）と ACTION_VOCABULARY.md、型ファイルの grep で確かめた。

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | 「破壊されたスピリット／ライフ減少で取り除かれるコア」の行き先を、バトルの間だけ trash／void に変える（種別：タイミング＝期間つき＋行き先の軸の値） | 既存は3つとも固定の形：`lifeDamageToVoid`（constraintDef.ts:32。行き先 void のみ・ライフ側のみ）、`battleLoserCoresToVoid`（BS10-065-e1。BPを比べ破壊した1体のみ・void のみ）、`destroyedCoresToTrash`（BS01-101-e1。『自分のターン』の常時で全スピリット対象・バトルに限らない）。SJ13-03 は「trash」「BP比較で破壊した相手のスピリット＋このアタックで減るライフ」、EX014 は「void」「このバトルで破壊された相手のスピリットすべて（効果破壊も含む読み。§4 なし・文面どおり）」で、行き先も範囲も期間も既存の組み合わせに無い | SJ13-03 合体時、EX014 合体時Lv3 |
| 2 | `reviveOnDestroy` の `cost` に「手札1枚か、オープンしたマジック1枚（手元）を破棄」の選択（種別：組み合わせ方の値） | `cost` は `handDiscardOne`（手札の末尾1枚。effectDefTrigger.ts:364）か `discardOwnBurst` で、手元（オープン領域）のマジックを選べる欄が無い。`magicFreeGrant` の `scope:"allMagicHandAndTegamoto"`（BS09-X39-e4）が手札/手元を同時に扱う前例 | EX009 破壊時 |

1枚専用の複合 type は提案していない。#1 は SJ13-03 と EX014 の2枚で使う。

## 3. カードごとの表
略号：aura／fieldEvent などは kind。手本は実在を確認した効果 id。

### SJ12（最強シリーズ。カード名に「最強」＝`nameContains:"最強"`／`ownNameIncludes:"最強"`）
| cardId | 節 | 使う器（手本） |
|---|---|---|
| SJ12-01 | Lv1-3：「最強」自分のスピリットすべてに【重装甲：赤/紫】を与える | `keywordGrant heavyArmor ownAll colors:[red,purple] filter{nameContains:"最強"}`。手本 BS22-070-e2（filter＋colors）・BS03-059-e2（nameContains の filter） |
| SJ12-02 | バースト【自分のライフ減少後】：このスピリットを召喚 | `burst ownLifeDamaged summon from:burst`。手本 BS14-X04-e1 |
| 〃 | Lv1-3 アタック時：最強1体につきこのスピリットBP+1000 | `onAttack timedEffect bp amountCounter{ownNameIncludes:"最強"} battle self`。手本 BS03-067-e1（名前版カウンタ） |
| 〃 | Lv2-3 アタック時：最強1体につき BP5000以下の相手1体を破壊 | `onAttack destroy count:1 countCounter{ownNameIncludes} filter{maxBp:5000}`。手本 BS08-X29-e2（countCounter）・BS17-X01-e1（maxBp） |
| SJ12-03 | Lv1-3 召喚時：最強1体につき相手のスピリットのコア1個をリザーブへ | `onSummon removeCores count:1 countCounter{ownNameIncludes} target:spread`。手本 BS10-020-e1（同形・系統版） |
| 〃 | Lv2-3 アタック時：相手のスピリットのコア1個をリザーブへ | `onAttack removeCores count:1 target:spread`。手本 BS10-020-e1 |
| 〃 | Lv3 アタック時：このスピリットの色を無いものとして扱う | `colorlessGrant whileAttacking target:self`。手本 BS13-011-e2 |
| SJ12-04 | Lv1-3 自分のアタックステップ：最強の自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個をリザーブへ | `battleWon role:attacker winnerNameContains:"最強" lifeCrush 1`。手本 BS08-024-e2（winnerFamilyFilter 版）。`winnerNameContains` は effectDefTrigger.ts:183 に有る。Q18636：自身のアタックも含む |
| SJ12-05 | Lv2-3 自分のアタックステップ：最強の自分のスピリットすべては Lv1 の相手からブロックされない | `constraintGrant ownAll filter{nameContains:"最強"} phaseTurn attack/own unblockableBy opponentOnly filter{level:[1]}`。手本 BS14-052-e3 |
| SJ12-06 | Lv1-2 召喚時：2枚ドロー。その後、手札2枚を破棄 | `onSummon sequence[draw 2, discard hand side:own count:2]`。手本 BS01-099-e1/e2（ドロー→破棄の別エントリ）・BS14-X05-e1（sequence の書き方）。「その後」＝順次（§CONJUNCTION） |
| 〃 | Lv2 アタック時：最強1体につき相手のデッキを上から2枚破棄（上限12） | `onAttack discard from:deck side:opponent count:2 countCounter{ownNameIncludes} countMax:12`。手本 BS04-X16-e1（countMax 15） |
| SJ12-07 | Lv1-3 自分のアタックステップ：最強の自分のスピリットすべてBP+2000 | `aura bp ownAll filter{nameContains:"最強"} amount:2000 phaseTurn attack/own`。手本 BS03-059-e2（同形・Lv3の +2000） |
| 〃 | Lv2-3 バトル時：BPを比べ相手のスピリットだけを破壊したとき、最強の自分1体を回復 | `onBattleWin refresh count:1 filter{nameContains:"最強"}`。手本 BS01-071-e1（self 版）・EX005-e2（count 1 の形）。refresh の filter は BS11-046-e3 |
| SJ12-08 | Lv1-3 アタック時：1枚ドロー | `onAttack draw 1` |
| 〃 | Lv2-3 自分のアタックステップ：最強の自分のスピリットすべては、アタックするとき相手のスピリット1体を指定してアタックできる | `constraintGrant ownAll filter{nameContains} phaseTurn attack/own canDirectAttack targetFilter:any`。手本 X006-e2 |

### SJ13-01〜09（剣刃ブレイヴ5色＋サイキョー）
| cardId | 節 | 使う器（手本） |
|---|---|---|
| SJ13-01 | 【合体時】合体アタック時：BP3000以下の相手2体を破壊 | `onAttack whileCombined destroy count:2 filter{maxBp:3000}`。手本 BS13-056-e2（whileCombined の onAttack）・BS08-X29-e2（destroy＋maxBp） |
| SJ13-02 | Lv1-3 召喚時：手札のブレイヴ1枚を無償召喚できる。この効果で系統「剣刃」のブレイヴが召喚されたとき BP7000以下の相手1体を破壊 | `onSummon optional sequence[summon from:hand bravesOnly, if cond.last{family:"剣刃"} then destroy maxBp:7000]`。手本 X005R-e1（bravesOnly）・BS11-032-e2（`if cond.last`）。召喚が `last` を記録するかは未確認（推測：要確認＝実装役が smoke で確かめる） |
| 〃 | 【合体時】Lv2-3 合体アタック時：BP5000以下の相手1体を破壊 | `onAttack whileCombined levels[2,3] destroy filter{maxBp:5000}` |
| SJ13-03 | 【合体時】合体アタック時：BP比較で破壊した相手のスピリットのコアと、このアタックで減る相手のライフのコアはトラッシュへ | **新部品 #1**。Q21820：【重装甲】で防げない（スピリットを対象にしない） |
| SJ13-04 | 【合体時】合体アタック時：Lv1の相手のスピリット2体を疲労 | `onAttack whileCombined exhaust count:2 filter{level:[1]}`。手本 SD01-029-e2（exhaust）・BS14-052-e3（filter level） |
| SJ13-05 | 【合体時】相手のアタックステップ：コスト3以下の相手がアタックしたとき回復／コスト6以上の相手がアタックしたときこのバトルBP+5000 | `fieldEvent anySpiritAttacked turn:opponent subjectFilter{cost:{max:3}} selfMode:source refresh self`＋同 `subjectFilter{cost:{min:6}}` で `timedEffect bp 5000 battle self`。手本 BS04-037-e2。whileCombined を付ける。2エントリ |
| SJ13-06 | 【合体時】合体アタック時：このターンBP-2000。その相手のスピリットがターンで初めてBP0になったとき1ドロー | `onAttack bpMinus 2000 count:1`＋`fieldEvent opponentSpiritBpReachedZero oncePerTurn bySelfEffectOnly draw 1`。手本 BS20-X08-e3/e4（決定済み。BS20_SURVEY_yellow.md:50） |
| SJ13-07 | 【合体時】合体アタック時：相手の合体スピリットにブロックされたときBP+5000 | `onBlocked heading:attack eventTarget:ignore condition{battleOpponentMatches:{combined:true}} timedEffect bp 5000 battle self whileCombined`。手本 BS17-003-e1 |
| SJ13-08 | Lv1-2 召喚時：相手1体を手札へ。【連鎖：条件《黄シンボル》】[黄]：トラッシュのコスト2のスピリット1枚を手札へ | `onSummon keyword:rensa sequence[return to:hand 1, if rensa:true cond{ownSymbol yellow} then moveCards from:trash dest:hand pick{cardType:spirit cost:{min:2,max:2}}]`。手本 BS19-013-e1（rensa の if）・BS08-044-e2（トラッシュ→手札 pick）。連鎖の条件欄は BS19-013-e1 の `cond.count` を見て写す |
| SJ13-09 | Lv1-2【強化】スピリット回復効果の体数+1 | `keyword kyoka kyoka:refresh`。手本 BS19-038-e1 |
| 〃 | Lv2 バトル時：系統「武装」の自分のスピリット1体につきBP+1000 | `onBattleStart timedEffect bp amountCounter{ownFamily:"武装"} battle self`。手本 PX06-e2（onBattleStart）・BS03-067-e1（amountCounter） |

### SJ13-10〜26（白銀の最強ロボ＋SJ13-23〜26）
| cardId | 節 | 使う器（手本） |
|---|---|---|
| SJ13-10 11 13 14 15 19 | 効果なし | 0節 |
| SJ13-12 | Lv2【重装甲：赤】 | `keyword heavyArmor colors:[red] levels[2]`。手本 BS17-035-e1 |
| SJ13-16 | Lv2：黄のスピリットとしても扱う | `colorAs colors:[yellow] levels[2]`。手本 BS03-053-e1 |
| SJ13-17 | Lv1-2 破壊時：相手1体を手札へ | `onDestroy return to:hand 1`。手本 BS16-030-e1 |
| SJ13-18 | Lv1-2：お互いのデッキは破棄されない | `globalConstraint noDeckMill`。手本 BS18-002-e1 |
| SJ13-20 | Lv1-3 お互いのアタックステップ：相手がコスト3のマジックを使用したとき、その効果発揮後、相手1体を手札へ | `fieldEvent opponentMagicUsed magicCostEquals:3 selfMode:source return to:hand 1`。手本 BS13_PLAN.md:446（BS13-042 同形。決定済み）・BS09-X39-e3 |
| SJ13-21 | Lv1-2 ブロック時：BPを比べ相手のスピリットだけを破壊したとき、自分の1体を回復 | `onBattleWin heading:block refresh count:1`。手本 BS02-041-e1（self 版） |
| SJ13-22 | Lv1-3【強化】スピリット回復効果+1 | `keyword kyoka refresh`。手本 BS19-038-e1 |
| 〃 | Lv2-3 自分のアタックステップ：BPを比べ自分のスピリットが破壊されたとき、自分の1体を回復 | `fieldEvent ownSpiritDestroyed byBattleOnly phase:attack turn:own refresh count:1`。手本 BS18-068-e2 |
| SJ13-23 | Lv1 召喚時：コスト4以下の相手1体を手札へ。この効果でコスト4を戻したとき、ボイドからコア1個をリザーブへ | `onSummon sequence[return to:hand filter{cost:{max:4}}, if cond.last{cost:{min:4,max:4}} then placeCores from:void to:reserve 1]`。手本 BS11-032-e2（`cond.last` のコスト）。コストは場にいたときの値（CONJUNCTION.md 決定済み） |
| SJ13-24 | Lv1-2 アタック時：BP+2000 | `onAttack timedEffect bp 2000 battle self`。手本 BS03-067-e1 |
| 〃 | Lv1-2 アタック時：自分の分身スピリットがいるとき、相手は相手の1体を疲労 | `onAttack condition{ownSpiritMatches:{bunshin:true}} exhaust count:1 chooserIsTarget`。手本 BS06-028-e2（chooserIsTarget）・BS22-069-e2（`ownSpiritMatches{bunshin}`）。triggered の `condition` に載るかは未確認（推測） |
| SJ13-25 | Lv1-2【分身：1】召喚時 | `triggered onSummon keyword:bunshin bunshin max:1`。手本 BS23-022-e1（同文） |
| SJ13-26 | Lv1-2 召喚時：ボイドからコア1個をこのスピリットへ | `onSummon placeCores from:void to:spirit target:self 1`。手本 BS02-029-e1（アタック時の同形）・BS01-X03-e1 |

### EX007〜014（リミテッドパック。合体時あり）
| cardId | 節 | 使う器（手本） |
|---|---|---|
| EX007 | Lv1-3 バトル時：BP比較で相手だけ破壊したとき回復 | `onBattleWin refresh target:self`。手本 BS01-071-e1 |
| 〃 | 【合体時】Lv2-3 合体アタック時：このアタックでライフを減らしたとき、このスピリットのコスト以下の相手1体を手札へ | `onLifeDealt whileCombined return to:hand filter{maxCostAsSelf:true}`。手本 BS07-X26-e3（onLifeDealt）・BS10-X06-e2（maxCostAsSelf） |
| EX008 | Lv1-3：相手のスピリットが回復したとき、このスピリットは回復 | `fieldEvent anySpiritRefreshed subjectSide:opponent selfMode:source refresh self`（turn 指定なし）。手本 BS18-066-e1 |
| 〃 | 【合体時】Lv2-3 ブロック時：疲労状態の相手のスピリットすべてを手札へ | `onBlock whileCombined return to:hand all filter{rested:true}`。手本 BS09-072-e1（rested＋all の filter） |
| EX009 | Lv1-3 破壊時：手札1枚かオープンしたマジック1枚を破棄することで回復状態で残る | `reviveOnDestroy scope:self revived{rested:false}` ＋ cost。**新部品 #2**。手本 BS14-X05-e2・BS16-X02-e2 |
| 〃 | 【合体時】Lv2-3 合体アタック時：BP比較で相手だけ破壊したとき、ボイドからコア1個をライフへ | `onBattleWin whileCombined placeCores from:void to:life 1`。手本 BS10-065-e1（whileCombined）・BS01-X01-e2（配置） |
| EX012 | Lv1-3 アタック時：回復状態の相手1体を指定してアタックできる | `constraint canDirectAttack targetFilter:recovered`。手本 BS02-004-e1 |
| 〃 | 【合体時】Lv2-3 合体アタック時：コア1個の相手1体を破壊 | `onAttack whileCombined destroy filter{maxCores:1}`。手本 EX005-e2 |
| EX013 | Lv1-3 アタック時：疲労状態の相手1体を指定してアタックできる | `constraint canDirectAttack targetFilter:rested`。手本 EX005-e1 |
| 〃 | 【合体時】Lv2-3 合体アタック時：相手1体のコアを1個になるようにトラッシュへ | `onAttack whileCombined removeCores targets:1 count:all leaveAtLeast:1 to:trash`。手本 BS10-082-e2（leaveAtLeast）・BS01-087-e1（to:trash）。`to:trash` と leaveAtLeast の併用は未確認（推測） |
| EX014 | 【転召：コスト5以上/ボイド】 | `keyword tensho minCost:5 dest:void`。手本 BS08-044-e1（dest:trash）。dest:void が型に有るかは未確認（推測） |
| 〃 | Lv1-3 自分のアタックステップ：自分のスピリットすべては、アタックするとき相手1体を指定してアタックできる | `constraintGrant ownAll phaseTurn attack/own canDirectAttack any`。手本 X006-e2・BS07-X25-e3 |
| 〃 | 【合体時】Lv3 合体アタック時：このバトルの間、破壊された相手のスピリットすべてのコアはボイドへ | **新部品 #1** |

### EX018〜020（最強戦友パック。覇王編）
| cardId | 節 | 使う器（手本） |
|---|---|---|
| EX018 | Lv1-3：系統「覇皇」/「雄将」の自分のスピリットすべてに【激突】を与える | `keywordGrant clash ownAll familyFilter:["覇皇","雄将"]`。手本 BS07-X25-e2。付与文は「【激突】『アタック時』相手は可能ならば必ずブロック」＝キーワード本体 |
| 〃 | Lv2-3 アタック時：1枚ドロー | `onAttack draw 1` |
| EX019 | Lv1-2 自分のアタックステップ：自分のバーストをセットしている間、覇皇/雄将の自分のスピリットすべてBP+3000 | `aura bp ownAll familyFilter whileOwnBurstSet amount:3000 phaseTurn attack/own`。手本 BS14-019-e2（whileOwnBurstSet）・BS03-059-e2（ownAll の aura） |
| 〃 | Lv2 自分のバースト発動後：BP5000以下の相手1体を破壊 | `fieldEvent ownBurstActivated destroy filter{maxBp:5000}`。手本 BS14-022-e2 |
| EX020 | Lv1-2 相手のターン：自分のバーストをセットしている間、覇皇/雄将の自分のスピリットすべてBP+3000 | EX019 と同形で `phaseTurn` の turn だけ opponent（ターン全体に効かせる指定が aura に有るかは未確認：推測） |
| 〃 | Lv2 自分のエンドステップ：バーストをセットしていないとき、手札のバースト効果を持つカード1枚をセットできる | `step end own optional condition{ownBurstSet:false} setBurstFromHand`。手本 BS14-X04-e2（fieldEvent 版。step への載せ替え） |

## 4. 確認すべき解釈
手順書で決定済みのものは質問にしない。

| # | カード | 私はこう読みました | 割れる点・選択肢 |
|---|---|---|---|
| 1 | EX014 | 「このバトルの間、破壊された相手のスピリットすべて」は、バトル中に起きた**BP比較以外の破壊（効果破壊）も含む**。コアはトラッシュではなくボイド | A：含む（文面どおり。私の読み）／B：BP比較破壊だけ（SJ13-03 と同範囲。SJ13-03 の破壊側は「BPを比べ破壊した」のでBP比較のみ） |

SJ13-02（この効果で剣刃のブレイヴが召喚されたとき）は CONJUNCTION「この効果で〜したとき」・BS11-032 と同形で決定済み。そのほかに確認が要る点（接続詞・選ぶ人）は無い。「その後」（SJ12-06）・「この効果発揮後」（SJ13-20＝BS13-042 と同形で決定済み）・「その相手のスピリット」（SJ13-06＝BS20-X08 と同形で決定済み）は手順書に答えがある。

公式Q&A（batspi。取得できたもの）：
- SJ12-04 Q18636：このスピリット自身がアタックして相手のスピリットだけを破壊した場合も、ライフのコア1個を置ける（はい）。Q18635 は汎用編を参照
- SJ13-03 Q21820：【重装甲】では防げない
- SJ13-25 Q18657：【分身】の説明は汎用編参照（答えの本文なし）

## 5. 時代の確認
- **SJ13-24（鎖鎌のクロヅル）・SJ13-25（忍法鳥ジンライ）は【分身】と「分身スピリット」を使う**。【分身】は BS22・BS23 の語彙（既にプールにある。BS22-024・BS23-022）。プールの後の時代のキーワードではないが、**これらの付録は 2013年ではなく 2022〜2023年の可能性が高い**（推測：SJ13-26 ファラオンの「ボイドからコア1個をこのスピリットに置く」自体は古い書き方だが、24・25 の存在から SJ13-24〜26 は新しい）。出どころの年は依頼文と食い違う可能性がある
- 【】はすべて照合済みで未知のキーワードは無い（重装甲・激突・強化・連鎖・分身・転召・バースト・合体時）。ソウルコア・【アクセル】・【煌臨】・アルティメットの語は無い
- 系統「分身」「剣刃」「武装」「覇皇」「雄将」「神星」はプールに有る。SJ13 の「スピリット回復効果」の【強化】は BS19-038 と同文

## 6. 付録の出どころ（依頼文より。参考）
- 白銀の最強ロボデッキ（2013年5月号）：SJ13-10〜23
- 最強合体パック（2013年1月号）：SJ13-03〜07
- 最強限定パック（2012年4月号）：SJ12-02〜06
- 最強戦友パック（2012年2月）：EX018〜020（覇王編の時代）
- リミテッドパック2（2010年12月）：EX007〜009／リミテッドパック3（2011年7月）：EX012〜014
- 不明：SJ12-01・07・08、SJ13-01・02・08・09・24〜26（SJ13-24〜26 は §5 のとおり新しい時代の疑い）

## 7. 確定した器の欄（2026-11-17・18。実装済み）
- 期間つき `destroyedCoresTo.byBattle`：BP比較の破壊だけに効く（removal.ts）。`lifeDamageCoresTo`：アタックによるライフ減少のコアの行き先（battleResolve.ts。効果のライフ減少には効かない）
- `reviveOnDestroy` の cost `alsoFromTegamoto`：手札と手元のマジックの両方があれば option で破棄元を選ばせる。非対話は手札の末尾→手元
- 効果でブレイヴを召喚したら、そのカードを記録する（battleFlow.ts の finishBraveSummon）。「この効果で〜が召喚されたとき」は `if cond.last` で読む
