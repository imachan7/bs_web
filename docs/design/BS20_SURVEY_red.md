# BS20 調査メモ：red（調査役）
対象：BS20-001, 002, 003, 004, 005, 006, 007, 008, 009, 055, 056, 067, 073, X01（074 シャイニングフレイムは取り込み済みなので除外）。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の総数：28（効果なしの BS20-001 を除く13枚）
- 既存の器で書ける：19
- 新しい部品が要る：5（#1〜#5。下の表）
- 連鎖の行：3（BS20-004・009・073。いずれも条件《青シンボル》×1）
- 強化の行：1（BS20-008。赤）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | `magicRestriction` に `colorBanOpponent`（相手のみ colors の色のマジックを使用できない）（アクションでなく制約の軸） | 既存の `colorBanAll`（effectDefContinuous.ts:659）は「お互い」限定で相手だけに効かない。`colorLockOpponent` は「相手のフィールドのシンボルと同じ色」という別の条件。`playerRule cantUseMagicForPid`（type.ts:314）は colors に固定色を取れるが timedEffect（ターン限定）の器で、Lv 条件付きの継続効果（Q777 の継続の連鎖）としては宣言できない | BS20-004 連鎖[青] |
| 2 | `immunityGrant` against:"bounce" のデッキ戻し対応（bounceDenial が to が hand 以外でも hasBounceImmunity を見る。または `alsoDeck: true` 軸） | `immunityGrant`（effectDefContinuous.ts:342）には colorFilter（赤）と sourceTypes（["magic"]）の軸はあるが、bounceGate.ts:24 で `if (to !== "hand") return null` となっており、デッキへ戻すを防げない。`noBounceByEffect`（globalConstraint）は両陣営・全効果で色絞り込みが無い | BS20-006 Lv1-3 |
| 3 | `destructionCoresToOwnSpirit` に行き先 `to: "source"`（発生源のスピリット自身）の軸（アクション） | 既存の `destructionCoresToOwnSpirit`（effectAction.ts:163）は「自分の実効BP最大のスピリットへ移す（決定的簡略化）」で行き先を発生源に指定できない。手本 BS06-075-e1 も「自分のスピリット1体の上に置く」で X01 の「このスピリットに置かれる」と行き先が違う | BS20-X01 Lv1-4 |
| 4 | TargetFilter に `nameExclude`（カード名が〜以外、の軸）（条件の軸） | targetFilter.ts には nameIs／nameContains（肯定）と excludeSelf（発生源の個体だけ除外）しか無い。「カード名：「滅龍帝ジエンド・ドラゴニス」以外」は同名の別個体（2体目の X01）も除外する必要があり、excludeSelf では書けない | BS20-X01 Lv2-4 |
| 5 | `activated` に `maxPerTurn: number`（ターンにN回まで）（カウンタ） | activated（effectDef.ts:94）は oncePerTurn／oncePerBattle しか持たず回数指定が書けない。回数版の maxPerTurn は fieldEvent（effectDefTrigger.ts:201）にしか無い | BS20-X01 Lv3-4 |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））

### BS20-001 シチノムス（効果なし）
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-001 | 効果なし | ―（effects 無し。BS19-001 と同じ扱い） |

### BS20-002 炎楯の守護者コロナ・ドラゴン
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-002 | Lv1-3：コスト3以下の自分のスピリットすべては、相手の効果で破壊されたとき、疲労状態でフィールドに残ることができる | `reviveOnDestroy` scope:ownAll・filter cost max3・when.byOpponentEffect・revived {rested:true}・optional（手本 SD15-X01-e2。効果文「コスト3以下の自分のスピリットが相手の効果で破壊されたとき、そのスピリットは手札に戻る。」＝同じ絞り込みとトリガー。疲労状態で残る＋optional は BS18-044-e3 `{"kind":"reviveOnDestroy","scope":"ownAll","when":{"byOpponent":true},"revived":{"rested":true},"optional":true}` と同じ形） |
| BS20-002 | Lv2･Lv3『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットすべてをBP+2000する | `aura` type:bp・familyFilter 星竜（手本 BS07-055-e2。効果文「系統：「星竜」を持つ自分のスピリットすべてをBP+2000する。」と同じ文） |

### BS20-003 ハルパードニクス
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-003 | Lv1･Lv2：このスピリットはブロックできない | `constraint` type:cantBlock（手本 BS17-002-e1 `{"kind":"constraint","constraint":{"type":"cantBlock"}}`。効果文「このスピリットはブロックできない。」と同じ形） |
| BS20-003 | Lv2『このスピリットのアタック時』このスピリットをBP+3000する | `triggered` onAttack → `timedEffect` bp・duration:battle・target:self（手本 BS01-004-e1。効果文「『このスピリットのアタック時』このスピリットをBP+2000する。」と同じ形） |

### BS20-004 シンタル・ザウル
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-004 | Lv1-3【激突】『このスピリットのアタック時』相手は可能ならば必ずブロックする | `keyword` clash（手本 BS17-009-e1 `{"kind":"keyword","keyword":"clash","levels":[1,2,3]}`。効果文「【激突】『このスピリットのアタック時』相手は可能ならば必ずブロックする。」と同じ形） |
| BS20-004 | 連鎖（条件 青×1） | `keyword` rensa ＋ 継続の連鎖は condition ownColorSymbolsAtLeast（BS19_PLAN §2.2 A・§3.1 M1 と同じ） |
| BS20-004 | [青]：相手は白のマジックカードを使用できない | **新しい部品 #1**。継続の連鎖（Q777）なので連鎖の条件を満たす間だけ効く |

### BS20-005 クイックサンド・ドラゴン
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-005 | Lv1･Lv2『このスピリットの召喚時』BP4000以下の相手のスピリット1体を破壊する | `triggered` onSummon → `destroy` filter maxBp:4000（手本 BS15-007-e1。効果文「『このスピリットの召喚時』BP5000以下の相手のスピリット1体を破壊する。」と同じ形） |

### BS20-006 魔炎の剣使いシュマルド
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-006 | Lv1-3『自分のアタックステップ』自分の赤のスピリットすべては、相手のマジックの効果では、フィールドから手札/デッキに戻らない | **新しい部品 #2**。colorFilter red・sourceTypes ["magic"] の絞り込み軸は `immunityGrant` に既にある（手本 BS10-079-e2。効果文「自分の合体スピリットすべては、相手のスピリット/ブレイヴ/ネクサス/マジックの効果では、フィールドから手札に戻らない。」＝同じ器。デッキ行きが足りない） |
| BS20-006 | 【合体時】Lv2･Lv3『このスピリットの合体アタック時』BP6000以下の相手のスピリット1体を破壊する | `triggered` onAttack・whileCombined → `destroy` filter maxBp:6000（手本 BS16-056-e2。効果文「【合体時】『このスピリットの合体アタック時』コアが2個以下の相手の…破壊する」＝同じトリガー。maxBp の軸は BS15-007-e1 と同じ） |

### BS20-007 スレイヴ・ガイアスラ
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-007 | Lv1-4：お互い、このスピリットのコアは取り除くことができない | `constraint` coresCantBeRemoved（手本 BS10-X01-e1。効果文「お互い、このスピリットのコアを取り除けない。」と同じ形） |
| BS20-007 | Lv1-4：フラッシュ【超覚醒】自分のスピリットのコアを、好きなだけこのスピリットに置くことができる。この効果でコアが置かれたとき、このスピリットは回復する | `keyword` superAwaken（手本 BS10-X01-e2。効果文「フラッシュ【超覚醒】自分のスピリットのコアを、好きなだけこのスピリットに置ける。この効果でコアを置いたとき、このスピリットは回復する。」と同じ形） |

### BS20-008 ネビュラ・ドラゴン
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-008 | Lv1･Lv2【強化】自分の「BP破壊効果」の上限を+1000する | 強化（赤）（手本 BS19-009-e1 `{"kind":"keyword","keyword":"kyoka","kyoka":"bpDestroy","levels":[1,2,3]}`。効果文「【強化】自分の「BP破壊効果」の上限を+1000する。」と同じ形） |

### BS20-009 破壊恐竜ダイノ・ブレイカー
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-009 | Lv1-3『このスピリットの召喚時』系統：「覇皇」を持つ相手のスピリット1体を破壊する | `triggered` onSummon → `destroy` filter family:覇皇（手本 BS16-054-e2。効果文「『このスピリットの召喚時』系統：「覇皇」を持つ相手のスピリット1体を破壊する。」と同一文） |
| BS20-009 | Lv1-3『このスピリットのアタック時』相手のスピリット1体を指定し、そのスピリットにアタックできる | `constraint` canDirectAttack targetFilter:"any"（手本 SD06-006-e2。効果文「相手のスピリット1体を指定し、そのスピリットにアタックできる。」と同じ形） |
| BS20-009 | 連鎖（条件 青×1） | `keyword` rensa（BS19_PLAN §2.2 A と同じ） |
| BS20-009 | [青]：このスピリットをブロックしているスピリットの効果すべては発揮されない | `spiritEffectsDisabledGrant` target:opponentAll・blockingOnly（手本 BS07-081-e3。効果文「自分のスピリットをブロックした【転召】を持たない相手のスピリットが持つ効果すべては発揮されない。」＝「ブロックしたスピリットの効果を止める」同じ形。§4 参照） |

### BS20-055 ティロック・ケファレ（ブレイヴ）
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-055 | 【合体時】『このスピリットのアタック時』このスピリットをBP+4000する | `triggered` onAttack・whileCombined → `timedEffect` bp・duration:battle・target:self（BS01-004-e1 の本体に BS16-056-e2 の whileCombined:true を足した形。両軸とも既存） |

### BS20-056 ホットジュピター・ドラゴン（ブレイヴ）
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-056 | Lv1『このブレイヴの召喚時』BP合計5000まで相手のスピリットを好きなだけ破壊する | `triggered` onSummon → `destroy` count:"any"・budget by bp 5000（手本 BS10-061-e2。効果文「『このスピリットの合体アタック時』BP合計3000まで相手のスピリットを好きなだけ破壊する。」＝同じ「BP合計〜まで好きなだけ破壊」の形） |
| BS20-056 | 【合体時】『このスピリットの合体アタック時』自分はデッキから1枚ドローする | `triggered` onAttack・whileCombined → `draw` count:1（手本 P030-e1。効果文「【合体時】『このスピリットの合体アタック時』…自分はデッキから1枚ドローする」を含む同じトリガーの形） |

### BS20-067 ボルカニックキャニオン（ネクサス）
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-067 | Lv1･Lv2『自分のアタックステップ』系統：「地竜」を持つ自分のスピリット1体につき、自分のスピリットすべてをBP+1000する | `aura` type:bp・target:ownAll・amountPer:1000・counter ownFamily:地竜（手本 BS01-106-e1 `{"aura":{"type":"bp","target":"ownAll","amountPer":1000,"counter":"ownExhausted"}}`。効果文「系統：「地竜」を持つ自分のスピリット1体につき」の counter ownFamily の軸は SD06-006-e3 `{"amountPer":3000,"counter":{"ownFamily":"戦竜"}}` と同じ） |
| BS20-067 | Lv2『自分のアタックステップ』自分の赤のスピリットは、BPを比べ相手のスピリットだけを破壊したとき回復する | `battleWon` role:any・winnerColorFilter:red・turn:own → `refresh` target:self（手本 BS04-092-e3。効果文「BPを比べ相手のスピリットだけを破壊したとき回復する。」と同じ形。winnerColorFilter の軸は effectDefTrigger.ts:183） |

### BS20-073 パワーブースト（マジック）
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-073 | フラッシュ：このターンの間、自分のスピリット1体をBP+3000する | `magic` timing:flash → `timedEffect` bp 3000・duration:turn（手本 BS04-092-e1。効果文「このターンの間、スピリット1体をBP+3000する。」と同じ形） |
| BS20-073 | 連鎖（条件 青×1） | `keyword` rensa ＋ `if`（count ownColorSymbols 青 atLeast 1）。マジックの連鎖は効果を発揮するときに条件を見る（Q780） |
| BS20-073 | [青]：自分のネクサス1つを破壊することで、自分のスピリット1体を回復させる | `pay` cost `destroy` nexus:"only" side:"own" count:1 → then `refresh` count:1（手本 BS13-045-e1。効果文「自分のネクサス1つを破壊することで、相手のネクサス1つを破壊する。」＝同じ pay の形。refresh count:1 の軸は BS19-036-e2 と同じ） |

### BS20-X01 滅龍帝ジエンド・ドラゴニス
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-X01 | Lv1-4：破壊された自分のスピリットのコアすべては、リザーブではなく、このスピリットに置かれる | **新しい部品 #3**。`fieldEvent` ownSpiritDestroyed → `destructionCoresToOwnSpirit` の形は手本 BS06-075-e1（効果文「【激突】を持つ自分のスピリットが、BPを比べ相手のスピリットに破壊されたとき、その破壊されたスピリット上のコアすべてを自分のスピリット1体の上に置く。」）だが、行き先が「このスピリット」に指定できない |
| BS20-X01 | Lv2-4『自分のアタックステップ』カード名：「滅龍帝ジエンド・ドラゴニス」以外の自分のスピリットが相手のスピリットにブロックされたとき、このスピリットは回復する | `fieldEvent` ownSpiritBlocked・phase:attack・turn:own → `refresh` target:self（手本 BS01-104-e2。効果文『自分のアタックステップ』『このネクサス上のコア1個を…』＝同じイベントの形。ただし subjectFilter の「カード名以外」は**新しい部品 #4**） |
| BS20-X01 | Lv3-4：フラッシュ『このスピリットのアタック時』自分のスピリット1体を破壊することで、このスピリットは回復する。この効果は、ターンに3回までしか使えない | `activated` timing:flashBattle・condition selfAttacking → `pay` cost `destroy` side:"own" count:1 → then `refresh` target:self（pay+destroy side own の形は手本 BS13-045-e1 と同じ。refresh target self は BS17-024-e2 と同じ。ただし「ターンに3回まで」は**新しい部品 #5**） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
- **BS20-009 連鎖[青]「このスピリットをブロックしているスピリットの効果すべては発揮されない」**：連鎖元は『このスピリットのアタック時』だが、アタック宣言の時点ではブロッカーはまだ決まっていない。①フラッシュタイミング（ブロック宣言後）に解決してそのバトルの間だけ止める、②アタック時から「ブロックしたスピリット」に効く、の2通りが読める。手本 BS07-081 はマジックで「このターンの間」なので解決時点の参考にならない。処理の順と効く期間の確認が必要。
- **BS20-055「『このスピリットのアタック時』このスピリットをBP+4000する」**：①そのバトルの間だけ（BS01-004-e1 の timedEffect duration:battle）、②アタックステップの間ずっと（aura attackingOnly）、の2通り。BS01-004 と同じ文言なので①で書いたが、要確認。
- **BS20-X01 Lv1-4「破壊された自分のスピリットのコアすべては、リザーブではなく、このスピリットに置かれる」**：①X01 自身が破壊されたとき、そのコアはどこへ置くのか（自分には置けないのでリザーブ？トラッシュ？）、②複数同時破壊のときコアを置く順、③この効果自身が「破壊」に含まれるか（X01 のアタック時効果で破壊したスピリットのコアも X01 へ？文言上は含まれる）、が効果文から決められない。
- **BS20-X01 Lv3-4「この効果は、ターンに3回までしか使えない」**：①X01 の個体ごとに3回、②プレイヤー／カード名ごとに3回（2体並べても合計3回）、の2通り。onceScope:"name" の有無で決まる。
- **BS20-073 連鎖[青]「自分のネクサス1つを破壊することで」**：自分のネクサスが1つも無いときは連鎖ごと不発（Q773 は「対象なしでも発揮」だが pay のコストが払えない）と読んだ。連鎖元（BP+3000）は発揮する。この読みで良いか確認が必要。
- **ソードブレイヴ（BS20-X07 紫・X08 黄。red の対象外だが指示により記す）**：効果文から読み取れる違いは、①X07 がブレイヴに【不死：無魔】を持つ（既存の `fushi` は triggerFamilies を取れる＝BS13-014。ただし既存の【不死】持ちがすべてスピリットカードで、トラッシュのブレイヴカードからの【不死】召喚が通るかはデータ側の確認が要る）、②X08 がブレイヴに【強化】を持ち【合体中】表記で書かれている（`keyword` の whileCombined 軸は effectDef.ts:22 に既にある）、の2点。合体条件は「コスト5以上」と通常のブレイヴと同じ書式で、効果文からはソードブレイヴ固有のルール（装備先の制限・「剣」としての扱い）は読み取れない。推測では決めない。
