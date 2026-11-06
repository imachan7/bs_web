# BS22 調査メモ：white（調査役）
対象：BS22-028・029・030・031・032・033・034・035・036・061・062・070（多色。白が先頭）・079・080・X04・X13-04（X13-04 は cardId が `X13-04`）。SD11-X02 は既存なので飛ばした。【分身】を使う節は見つからなかった。実装はしていない。

## 1. 集計
| 項目 | 数 |
| :-- | --: |
| カード | 16枚（032 は効果文が空） |
| 節（Lv 見出し・キーワード行・メイン／フラッシュの単位。連鎖は別に数える） | 37 |
| 既存の器で書ける | 32 |
| 新しい部品が要る | 5（部品5件。§2 の N1〜N5） |
| うち連鎖の行（条件 色×個数） | 5（033・035・080・X04×2。すべて紫×1。中身は既存の器） |
| 強化の行 | 0（029 に「絞り込み：強化を持つ」が1件） |
| 分身（別調査） | 0 |
| 効果文から決められない点 | 2（§4。ともに X04） |

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | `lifeDamagePerSpiritPerTurn` に `minSymbols`（条件の軸） | お互いに効く型は `lifeDamagePerSpiritPerTurn`（BS15-005-e1 `{"type":"lifeDamagePerSpiritPerTurn","max":1}`）で、シンボルの軸が無い。シンボルの軸を持つのは `ownLifeDamageCapPerSourcePerTurn`（BS19-043-e1 `minSymbols:2`）だが自分のライフ専用の片側型。031 は「お互いの」ライフで、片側型を2つ並べても相手側を守れない | 031 |
| N2 | `return` の対象に相手の合体スピリットのブレイヴ（アクションの軸。例 `target:"opponentBrave"`） | `return` の target は `self`/`selfBrave`（BS17-033-e1 `target:"selfBrave"`）だけ。相手のブレイヴを個別に外す既存は `destroyBrave`（破壊）と `detachOpponentBrave`（分離）で、手札に戻す口は無い。分離＋`return` では、分離で場に残ったスピリット状態のブレイヴを戻す形になり、「合体スピリットのブレイヴ1つを手札に戻す」と同じ結果にはなるが分離時のコア移動（相手が行う）が余計に起きる | 034 Lv2 |
| N3 | `return` に「合体スピリットを戻すときブレイヴを残せない」フラグ（アクションの軸。例 `braveCantStay:true`） | ブレイヴを残す確認は破壊・手札に戻るの共通手順（BRAVE.md §6）で、効果側から「残せない」を指定する口が無い。`reviveOnDestroy`・`bounceGate` は戻りを止める側で、残し方には触れない | 062 Lv1 |
| N4 | `coreFloorByCost` に `floor`（条件の軸。Lv1コストの代わりに固定の個数） | `coreFloorByCost`（BS16-039-e1 `{"ownOnly":true,"byOpponentOnly":true}`）は「Lv1コストを下回らない」固定。079 は「0個にならない」＝下限1個。`coreFloorOwnNamedByOpponent` は `floor` を持つが名前で絞る型で、自分のスピリットすべてには使えない | 079 |
| N5 | `keywordGrant`（`heavyArmor`）が `filter`（色の配列）を読む（条件の軸） | `keywordGrant` の付与先の絞りは `colorFilter`（単色）。複数色は `filter` で書けるが、BS21_PLAN §5「後回し」のとおり【装甲】【重装甲】の付与は `filter` を読まない。070 は「紫/白のスピリットすべて」に付与するので `colorFilter` 1つでは書けない | 070 Lv2 |

## 3. カードごとの表
手本は効果文を1行引用してから「同じ形」と書く。

### BS22-028 キャリバラー（機獣・コスト2）
| 節 | 仕分け | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| Lv1･Lv2「このスピリットはアタックできない。」 | 既存 | `{"kind":"constraint","levels":[1,2],"constraint":{"type":"cantAttack"}}`（BS02-038-e1「Lv1･Lv2『自分のアタックステップ』このスピリットはアタックできない。」と同じ形） |
| Lv2「このスピリットは相手のスピリットの効果を受けない。」 | 既存 | `{"kind":"constraint","levels":[2],"constraint":{"type":"immuneToOpponentEffects","against":"spirit"}}`（BS14-044-e1「自分のバーストをセットしている間、このスピリットは、相手のスピリットの効果を受けない。」から条件を除いた形） |

### BS22-029 ダーク・ドーベル（機獣・コスト3）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『ブロック時』【強化】を持つ相手のスピリット1体を手札に戻す | 既存（絞り込み：強化を持つ） | `{"kind":"triggered","trigger":"onBlock","levels":[1,2],"optional":false,"action":{"type":"return","to":"hand","count":1,"filter":{"keyword":"kyoka"}}}`（手本：return は BS06-044-e2「このスピリットがブロックした系統：「空牙」を持つ相手のスピリット1体を手札に戻す。」の `onBlock`＋`return`＋`filter`。`filter:{keyword:"kyoka"}` は BS21-X06-e2「[赤]：【強化】を持つ相手のスピリット1体を破壊する。」の destroy と同じ。ブロックした相手に限らないので BS06-044-e2 の `eventTarget:"use"` は付けない） |

### BS22-030 透輝亀マタマタ（甲獣・コスト3）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2【重装甲：紫】（と説明文） | 既存 | `{"kind":"keyword","keyword":"heavyArmor","levels":[1,2],"colors":["purple"]}`（BS12-027-e2「Lv1･Lv2【重装甲：紫】このスピリットは、相手の紫のスピリット/ブレイヴ/ネクサス/マジックの効果を受けない。」と同じ） |
| Lv2 系統：「異合」を持つ自分のスピリットすべてに【重装甲：紫】を与える | 既存 | `{"kind":"keywordGrant","levels":[2],"keyword":"heavyArmor","colors":["purple"],"target":"ownAll","familyFilter":"異合"}`（SD11-013-e2「系統：「機獣」を持つ自分のスピリットすべてに“【重装甲：赤】…”を与える。」と同じ） |

### BS22-031 水晶竜シリマナイト（甲竜/機獣・コスト4）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2･Lv3 お互いのライフは、ターンごとに、シンボル2つ以上のスピリット1体から1しか減らない | **新しい部品 N1** | 土台は `{"kind":"globalConstraint","levels":[1,2,3],"constraint":{"type":"lifeDamagePerSpiritPerTurn","max":1}}`（BS15-005-e1「お互いのライフは、ターンごとにスピリット1体から1までしか減らされない。」）に `minSymbols:2`。数え方は SEMANTICS_AUDIT §3.25 による（発生源ごと・効果由来も数える・シンボル数は発生源で見る。手順書による） |
| Lv1･Lv2･Lv3【重装甲：赤/緑/白】 | 既存 | `{"kind":"keyword","keyword":"heavyArmor","levels":[1,2,3],"colors":["red","green","white"]}`（BS12-030-e1 の2色版と同じ） |
| Lv2･Lv3 自分の合体していないスピリットすべてに【重装甲：赤/緑/白】を与える | 既存 | `{"kind":"keywordGrant","levels":[2,3],"keyword":"heavyArmor","colors":["red","green","white"],"target":"ownAll","uncombinedFilter":true}`（BS18-031-e3「Lv2 自分の合体していないスピリットすべてに【重装甲：赤/白】を与える。」と同じ） |

### BS22-032 近衛機マリナー2号（武装・コスト4）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| （効果文が空） | 節なし | 取り込みデータの `effect` が空文字（Lv表だけ）。実カードに効果が無いのか Wiki の取りこぼしかは、このメモからは判断できない。メインループが batspi.com のカードページで確認してほしい |

### BS22-033 ジャコウ・キャット（機獣・コスト4）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『召喚時』相手のスピリット1体を手札に戻す | 既存 | `triggered onSummon` ＋ `return` count 1（BS06-046 の召喚時「相手のスピリット1体を手札に戻す。」と同じ。BS06-046-e2 の JSON は未引用。同じ文面が BS01・BS04・BS06 に多数ある） |
| 連鎖（条件 紫×1）[紫]：自分はデッキから1枚ドローする | 既存・連鎖 | 連鎖元と同じエントリ `{"keyword":"rensa","trigger":"onSummon","action":{"type":"sequence","actions":[<return>,{"type":"if","cond":{"count":{"ownColorSymbols":"purple"},"atLeast":1},"then":{"type":"draw","count":1}}]}}`（BS20-034-e2「【連鎖：条件《黄シンボル》】[黄]：自分はデッキから1枚ドローする。」の `sequence`＋`if` と同じ） |
| Lv2 自分の手札は相手の効果を受けない | 既存 | `{"kind":"globalConstraint","levels":[2],"constraint":{"type":"handImmuneForPid","includeNexus":true}}`（BS14-082-e1「自分の手札は相手のスピリット/ブレイヴ/ネクサス/マジックの効果を受けない。」。ネクサスまで入れる理由＝効果文が「相手の効果」で列挙が無いため） |

### BS22-034 戦術機神コナン・バウル（武装・コスト5）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2【重装甲：紫/緑/白】 | 既存 | `keyword heavyArmor` colors 3色（BS12-030-e1 と同じ形） |
| Lv1･Lv2『相手のアタックステップ』相手のスピリットがアタックしたとき、系統：「武装」を持つ自分のスピリット1体を回復させる | 既存 | `{"kind":"fieldEvent","event":"anySpiritAttacked","levels":[1,2],"phase":"attack","turn":"opponent","subjectSide":"opponent","selfMode":"source","action":{"type":"refresh","filter":{"family":["武装"]},"count":1}}`（BS21-032-e1「相手のスピリットがアタックしたとき、系統：「星魂」を持つ自分のスピリット1体を回復させる。」と同じ） |
| Lv2『ブロック時』アタックしている相手の合体スピリットのブレイヴ1つを手札に戻すことができる | **新しい部品 N2** | `triggered onBlock` levels [2] ＋ `optional:true`（「できる」は確認式。SEMANTICS_AUDIT の一般則による）＋ N2 のアクション。アタッカーはブロック時点で1体に決まる |

### BS22-035 ダーク・バイソン（機獣・コスト5）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『ブロック時』このスピリットをBP+4000する | 既存 | `triggered onBlock` ＋ `timedEffect bp +4000 duration:"battle" target:"self"`（BS20-034-e2 の `{"type":"timedEffect","content":[{"type":"bp","amount":2000,...}],"duration":"battle","target":"self"}` と同じ。BS20_PLAN §1「『〜時』の BP+ で期間の記述なし＝そのバトルの間」） |
| 連鎖（条件 紫×1）[紫]：疲労状態のコスト5以下の相手のスピリット1体を破壊する | 既存・連鎖 | 上のエントリの `sequence` に `if` 紫≥1 → `{"type":"destroy","count":1,"filter":{"rested":true,"cost":{"max":5}}}`（BS21-X06-e2 の `{"type":"destroy","count":1,"filter":{"rested":true,"combined":true}}` と BS21-X06-e1 の `"filter":{"cost":{"max":5}}` の合わせ） |
| Lv2【重装甲：赤/緑/白】 | 既存 | `keyword heavyArmor` levels [2] colors 3色 |

### BS22-036 氷剣使モリガン（剣使/氷姫・コスト8）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『相手のアタックステップ』疲労状態でブロックできる | 既存 | `{"kind":"constraint","levels":[1,2],"phaseTurn":{"phase":"attack","turn":"opponent"},"constraint":{"type":"canBlockWhileRested"}}`（BS21-030-e1「Lv1･Lv2･Lv3『相手のアタックステップ』このスピリットは疲労状態でブロックできる。」と同じ） |
| Lv1･Lv2『ブロック時』相手の合体スピリットをブロックしたとき、このスピリットをBP+8000する | 既存 | `triggered onBlock` ＋ `condition:{"battleOpponentMatches":{"combined":true}}` ＋ `timedEffect bp +8000 battle self`（条件の軸は effectDefTrigger の `battleOpponentMatches`「いま成立しているバトルのブロッカーなら相手側のアタッカーが絞り込みに合う」。手本 BS18-035「コスト6以上の相手のスピリットをブロックしたとき、このスピリットをBP+10000する。」は `targetMinCost` で書かれており、「合体」を見る軸は `battleOpponentMatches` を使う） |
| 【合体時】Lv2『合体アタック時』相手のバーストがセットされているとき、このバトルの間、このスピリットはブロックされない | 既存 | `triggered onAttack` ＋ `whileCombined:true` ＋ `condition:{"opponentBurstSet":true}` ＋ `timedEffect unblockable duration:"battle" target:"self"`（BS21-042-e1 の `{"type":"timedEffect","content":[{"type":"unblockable","opponentOnly":true,...}],"duration":"battle","target":"self"}` から `from` を外す。条件は effectDefTrigger.ts の `opponentBurstSet`） |

### BS22-061 近衛機ホルノート1号（武装・ブレイヴ・コスト4）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| 合体条件：コスト4以上 | 既存 | braveCondition コスト最小4（BS14-070「合体条件：コスト4以上」） |
| 【合体時】自分の手札は相手の効果を受けない | 既存 | `{"kind":"globalConstraint","whileCombined":true,"levels":null,"constraint":{"type":"handImmuneForPid","includeNexus":true}}`（BS14-082-e1 の `handImmuneForPid` に BS19-040-e1 の `whileCombined:true` を足した形） |

### BS22-062 獣爆マナティ・マローダ（機獣・ブレイヴ・コスト4）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1『このブレイヴの召喚時』相手のスピリット1体を手札に戻す。この効果で合体スピリットが手札に戻るとき、ブレイヴはフィールドに残せない | 既存（戻す）＋**新しい部品 N3**（残せない） | `triggered onSummon` levels [1] ＋ `return count 1`（BS11-051 の「Lv1『このブレイヴの召喚時』…」と同じ書き出し）。ブレイヴが同じ領域（手札）へ行く扱いは BRAVE.md L397（手順書による） |
| 合体条件：コスト4以上 | 既存 | braveCondition コスト最小4 |

### BS22-070 水銀海に浮かぶ工場島（ネクサス・紫/白・コスト5）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『相手のターン』相手の効果で相手の手札が増えたとき、増えたカード1枚につき、相手は、相手の手札1枚を破棄する | 既存 | `{"kind":"fieldEvent","event":"opponentHandAdded","levels":[1,2],"turn":"opponent","sourceTypes":["spirit","brave","nexus","magic"],"repeatPerCount":true,"action":{"type":"discard","from":"hand","side":"opponent","count":1}}`（BS20-030-e2「相手の手札が増えたとき、増えたカード1枚につき、相手は、相手の手札1枚を破棄する。」に、BS21-054-e1「相手の効果によって相手の手札が増えたとき」の `sourceTypes` を足す） |
| Lv2 自分の紫/白のスピリットすべてに“【重装甲：紫/白】…”を与える | **新しい部品 N5** | `{"kind":"keywordGrant","levels":[2],"keyword":"heavyArmor","colors":["purple","white"],"target":"ownAll"}` に付与先の絞り（紫/白のいずれか）。SD11-013-e2 は `familyFilter`、BS21-029-e2 は `colorFilter`（単色）＋`keywordFilter` |

### BS22-079 クリスタルフィールド（マジック・コスト3）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| メイン：自分の手札は相手の効果を受けず | 既存 | `globalConstraint levels:null handImmuneForPid includeNexus:true`（BS19-103-e2 と同じ置き方で、中身が `handImmuneForPid`。手札の免疫は BS14-082-e1） |
| メイン：自分のスピリットのコアは相手によって0個にならない | **新しい部品 N4** | `globalConstraint levels:null coreFloorByCost {ownOnly:true, byOpponentOnly:true}` ＋ `floor:1`（BS16-039-e1「自分のスピリットすべてのコアの数は、相手によってLv1コストより少なくならない。」の下限をLv1コストから1に） |
| メイン：このマジックは、相手のスピリットのアタックによって自分のライフが減るまで自分のフィールドに置いておき、その間、効果を発揮し続ける。この効果が無効になったとき破棄される | 既存 | `{"kind":"magic","timing":"main","action":{"type":"placeSelfOnField"}}` ＋ `{"kind":"fieldEvent","event":"ownLifeDamaged","levels":null,"byAttackOnly":true,"selfMode":"source","optional":false,"action":{"type":"trashSelfFromField"}}`（BS19-103-e1・e4「このマジックカードは、相手のスピリットのアタックによって自分のライフが減るまで自分のフィールドに置いておき、その間、効果を発揮し続ける。この効果が無効になったとき破棄される。」と文面まで同じ） |
| フラッシュ：このターンの間、スピリット1体をBP+2000する | 既存 | `{"kind":"magic","timing":"flash","action":{"type":"timedEffect","content":[{"type":"bp","amount":2000}],"duration":"turn","side":"both"}}`（BS19-103-e5 と同じ） |

### BS22-080 フェーズチェンジ（マジック・コスト4）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| フラッシュ：このターンの間、自分のライフは、相手のスピリットの効果と、コスト4以上の相手のスピリットのアタックでは0にならない | 既存 | `{"type":"timedEffect","content":[{"type":"playerRule","rule":{"type":"lifeFloorForPid","floor":1,"byAttackMinCost":4,"byEffectSourceTypes":["spirit"]}}],"duration":"turn","side":"own"}`（BS11-080-e1「このターンの間、相手のスピリット/マジックの効果と、コスト4以上の相手のスピリットのアタックでは、自分のライフは0にならない。」の `byEffectSourceTypes` から `magic` を除く） |
| 連鎖（条件 紫×1）[紫]：自分のトラッシュにあるコスト8以上のスピリットカード1枚を召喚できる | 既存・連鎖 | 上と同じ flash の `sequence` に `if` 紫≥1 → `{"type":"moveCards","from":"trash","dest":"summon","pick":{"cardType":"spirit","cost":{"min":8}},"count":1,"optional":true}`（BS21-073-e2 の紫「自分のトラッシュにあるコスト7のスピリットカード1枚を召喚できる。」の `moveCards` から `skipOnSummon` を外す＝「召喚時」効果も発揮。コスト支払いありは BS21_PLAN §2 の 2 による）。`keyword:"rensa"` を付ける |

### BS22-X04 黒皇機獣ダークネス・グリフォン（機獣・コスト8）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2･Lv3『召喚時』相手のスピリット2体までを手札に戻す | 既存 | `triggered onSummon` ＋ `return count 2`（上限2体＝候補が少なければ少なく。BS06-X24-e3 の `all` ではなく数指定。「N体まで」の `return` は BSC05-009・SD11-016・BS14-X04 の「好きなだけ」とは別。同じ「X体までを手札に戻す」文面の手本は未確認で、実装役が `grep -rn '体までを手札に戻す' data/cards` で探す） |
| 連鎖（条件 紫×1）[紫]：自分はデッキから2枚ドローする | 既存・連鎖 | 上と同じ `sequence` に `if` 紫≥1 → `draw count 2`（BS20-034-e2 の draw 1 と同じ形） |
| 【合体中】Lv2･Lv3『アタック/ブロック時』ターンに1回、このスピリットは回復する | 既存（回数の数え方は §4 の X04-1） | `triggered onAttack`＋`onBlock`（`eventTarget:"ignore"`）の2エントリ、`whileCombined:true`、`levels:[2,3]`、`action:{"type":"refresh","target":"self"}`（二重エントリは BS20-044-e2・e3「【合体時】Lv2･Lv3『このスピリットのアタック/ブロック時』」と同じ。`oncePerTurn:true` の refresh self は BS15-024-e4） |
| 連鎖（条件 紫×1）[紫]：相手のスピリットのコア2個を相手のトラッシュに置く | 既存・連鎖 | 上と同じタイミングの `sequence` の後ろに `if` 紫≥1 → `{"type":"removeCores","side":"opponent","from":["spirit"],"to":"trash","target":"one","count":2}`（BS20-045-e1「[紫]：相手のスピリットのコア2個を相手のトラッシュに置く。」と同じ） |

### X13-04 獅機鎧神ヴァルハランス・レオ（武装/機獣・コスト7）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2･Lv3【重装甲：紫/緑/白/黄】 | 既存 | `keyword heavyArmor` levels [1,2,3] colors 4色 |
| Lv1･Lv2･Lv3『相手のアタックステップ』相手のスピリットがアタックしたとき、自分のスピリット1体を回復させる | 既存 | BS21-032-e1 から `filter` を外す（`{"kind":"fieldEvent","event":"anySpiritAttacked",...,"action":{"type":"refresh","count":1}}`）。発生源自身を含むかは BS21-032-e1 の `selfMode:"source"` に従う |
| Lv2･Lv3『バトル時』自分の白のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する | 既存 | `{"kind":"triggered","trigger":"onBattleStart","eventTarget":"ignore","levels":[2,3],"action":{"type":"pay","cost":{"type":"exhaust","side":"own","autoPickMaxBp":true,"count":1,"filter":{"color":"white"}},"then":{"type":"timedEffect","target":"self","duration":"battle","content":[{"type":"bp","amount":1,"amountCounter":"lastBp","countOnce":true}]}},"optional":true}`（BS06-X24-e2「系統：「武装」を持つ自分のスピリット1体を疲労させることで、このスピリットをBP+(疲労させたスピリットのBP)する。」の `filter` を `{family:"武装"}` から色に替える。BS20_PLAN N14 により、疲労させる1体は持ち主が選ぶ） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
| # | カード・節 | 読み | もう1つの読み | 引いた語／当たり |
| :-- | :-- | :-- | :-- | :-- |
| X04-1 | X04 【合体中】Lv2･Lv3『アタック/ブロック時』ターンに1回、このスピリットは回復する。＋連鎖 | 回数は個体ごとに1つ（RULES_BATSPI_WIKI L106 の①「ターンに1回、Aする」＝個体ごと）。アタック時に使えばそのターンのブロック時には使えない。データ上は `onAttack`・`onBlock` の2エントリになるので、2エントリで1つの枠を共有する印が要る（新しい部品かどうかは実装役に確認させる） | アタック時とブロック時で別々に1回ずつ | 引いた語：ターンに1回、アタック/ブロック時。当たり：BS20-044（ターンに1回なし）、BS13-039-e3・BS15-024-e4（1つのタイミングだけ）。2タイミングで1枠を共有する前例は見つからなかった |
| X04-2 | X04 同上。その回復が「ターンに1回」の枠を使い切って発揮されないとき、下の連鎖（相手のコア2個）を発揮するか | 発揮する（アタック/ブロック時というタイミングは来ているので連鎖元の「発揮タイミング」は成立。Q773「連鎖元が解決できなくても発揮」） | 発揮しない（Q776「連鎖元が発揮されないなら連鎖も発揮しない」。枠が尽きた回復は発揮されない側に寄る） | 引いた語：連鎖、ターンに1回、Q773、Q776。当たり：BS19_PLAN §2.1・§2.15、BS21_PLAN §2 の 5（036・X03 の連鎖はターンに1回の効果を「与える」側で別件）。今回の形に直接当たる行は無し |

（上の2件のほか、読みが割れるものは見つからなかった。031 の数え方は SEMANTICS_AUDIT §3.25、062 のブレイヴの行き先は BRAVE.md L397、080 の召喚は BS21_PLAN §2 の 2、029 の「【強化】を持つ」は BS19_PLAN §2.1 の Q774・Q775、070 の「相手の効果で手札が増えた」は BS21-054-e1 の `sourceTypes`、079 の「相手によって」は BS16-039-e1 の `byOpponentOnly` で、それぞれ手順書・既存データで決まる。）
