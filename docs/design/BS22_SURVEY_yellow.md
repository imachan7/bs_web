# BS22 調査メモ：yellow（調査役）
対象：BS22-037・038・039・040・041・042・043・044・045・063・064・071（多色。黄が先頭）・081・082・X05・X08、X13-05・X13-09（18枚）。実装はしていない。
手本は `data/cards/*.json` の既存カード。効果文は手本ごとに1行引用した。BS19_PLAN §2.1・§2.15・§2.2、BS20_PLAN §1〜§3、BS21_PLAN §1〜§3 は読んだ。

## 1. 集計
| 項目 | 数 |
| :-- | --: |
| 節の数（連鎖の行を除く。BS22-037 は効果文なしで0） | 30 |
| 既存の器で書ける節 | 24 |
| 新しい部品が要る節 | 6（P1〜P6。1節に1部品） |
| 連鎖の行（すべて中身は既存の器で書ける） | 4（039・042・082・X05） |
| 強化 | 1（044 Lv2-3 強化（黄）） |
| 分身 | 0 |

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| P1 | placeCores の from に「破壊されたスピリット上のコア（破壊直前の個数）」（アクションの軸） | `placeCores.from` は void/reserve/trash/self/field/ownSpirits/life だけ。`destructionCoresToOwnSpirit`（BS06-075-e1）は「リザーブから自分の最大BPのスピリットへ」固定でライフへ置けず個数も決められない。`removeCores target:"event"`（SD13-002-e1）は取り除く側で、置き先が trash/void/reserve | 038 |
| P2 | 【聖命】のライフ増加を置き換える継続効果（継続効果の kind：発揮時に「相手のライフのコア1個を相手のトラッシュ」を選べる） | `lifeDamageReplace`（BS17-051-e1）は「相手のライフを減らすとき」の置換で、聖命の `placeCores`（logic/actions/placeCores.ts の seimei 分岐）は置換点を持たない。`fieldEvent ownSeimeiLifeCharged`（BS09-064-e1）は置いた後の事後誘発。相手ライフ→トラッシュ自体は `removeCores`（side opponent from life to trash）で書ける | X05 Lv1-3 |
| P3 | `playerRule handReductionColorAsForPid` の絞り込みと「追加」モード（条件の軸：cardColor・cardType 複数・`also`） | 既存は `cardType` 1種だけで色の絞りが無く、`color` は「として扱う」＝置き換え（shared/cost.ts:720 は `c.cardType === cardData.type`）。X13 の「赤のスピリット/ブレイヴの軽減を黄**としても**」は赤のまま黄も足す追加 | 071 Lv2 |
| P4 | `chooseActionMode` の選ぶ側（アクションの軸：`chooserIsTarget` 相当） | `chooseActionMode` は使用者が選ぶ形だけ（effectAction.ts:187）。`chooserIsTarget` は exhaust/destroy など個別のアクションにあり、モード選択には無い。「相手は〜のうち1つを選ぶ。その後その効果を発揮する」の前例カードは無い。モード自体は既存の refresh／timedEffect cantAttack で書ける | 081 |
| P5 | triggered の trigger「ブロックされなかったとき」（タイミング） | trigger は `onBlocked`（ブロックされた）まで。`onLifeDealt` はライフが減った後で、ブロックされなくても防がれたら起きない別物。`treatAsUnblocked` はBP比較の扱いで誘発ではない。ブロックなし受けは「バトル」にならず onBattleEnd も出ない（TIMING_CHART §1.9） | X08 合体中 |
| P6 | 「トラッシュのスピリットカード1枚の『召喚時』効果1つを、自分の効果として発揮する」（アクション） | `fireEffect`（effectAction.ts:209）は場のスピリットが持つ効果、`borrowCombinedAttackEffect`（BS13-049-e2）は合体スピリットのブレイヴの『合体アタック時』。トラッシュのカードの効果を借りる器が無い。選択（候補カードと効果の選び方）と除外（同名）が違う | 045 |

## 3. カードごとの表
手本の効果文は `data/cards/` の `effect` 欄から引いたもの。「手続きで決まる」は手順書による。

### BS22-037 カマウィゼル（スピリット・想獣・コスト1）
| 節 | 使う器 |
| :-- | :-- |
| 効果文なし（バニラ） | `effects: []` |

### BS22-038 ロールマイマイ（スピリット・菓族・コスト2）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『自分の緑のスピリットが相手によって破壊されたとき、破壊されたスピリットからコア1個を自分のライフに置くことができる』 | **P1**。誘発は fieldEvent ownSpiritDestroyed（手本 SD16-001-e1「系統：「闘神」を持つ自分のスピリットが相手によって破壊されたとき、相手のデッキを上から2枚破棄する。」＝`{"kind":"fieldEvent","event":"ownSpiritDestroyed","levels":[1,2],"subjectFilter":{"family":"闘神"},"byOpponentOnly":true,"action":{…}}`）に subjectFilter color green、optional true（「置くことができる」）。中身が P1。「相手によって」は効果とBP比べの両方（BS20_PLAN §1） |

### BS22-039 凶獣トウテツ（スピリット・想獣・コスト3）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-2『このスピリットの破壊時』系統：「想獣」を持つ自分のスピリット2体を回復させる | triggered onDestroy＋`refresh count 2 filter{family:["想獣"]}`。手本 SD14-002-e1「系統：「怪虫」を持つ自分のスピリット1体を回復させる。」＝`{"kind":"triggered","keyword":"rensa","trigger":"onDestroy","levels":[1,2],"optional":false,"action":{"type":"sequence","actions":[{"type":"refresh","count":1,"filter":{"family":["怪虫"],"excludeSelf":true}},{"type":"if",…}]}}` |
| 連鎖（条件 赤×1）：BP4000以下の相手のスピリット1体を破壊する | 上の sequence の2番目に `if{cond:{count:{ownColorSymbols:"red"},atLeast:1},then:{type:"destroy",count:1,filter:{maxBp:4000}}}`（手本 SD14-002-e1 と同じ組み立て。entry に `keyword:"rensa"`） |

### BS22-040 宝の番人ズラトロック（スピリット・想獣・コスト3）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『相手のアタックステップ』コスト3/4の相手のスピリットはアタックできない | globalConstraint `opponentCantAttackByCost costs:[3,4]` phase attack turn opponent。手本 SD16-006-e2「コスト4以下の相手のスピリットはアタックできない。」＝`{"kind":"globalConstraint","levels":[2],"whileCombined":true,"phase":"attack","turn":"opponent","constraint":{"type":"opponentCantAttackByCost","costs":[0,1,2,3,4]}}`（costs に3/4だけ入れる） |
| Lv2-3『相手のアタックステップ』コスト7/8の相手のスピリットはアタックできない | 同上 costs:[7,8] levels:[2,3]（手本 BS12-X05-e2「コスト2/3/5/7/11の相手のスピリットはアタックできない。」＝`{"kind":"globalConstraint","levels":[1,2,3],"constraint":{"type":"opponentCantAttackByCost","costs":[2,3,5,7,11]}}`） |

### BS22-041 アルミラージ（スピリット・想獣・コスト4）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3【聖命】『このスピリットのアタック時』ライフを減らしたとき、ボイドからコア1個を自分のライフに置く | keyword seimei＋triggered onLifeDealt placeCores void→life（手本 BS14-052-e1・e2） |
| Lv2-3【聖命】を持つ自分のスピリットすべては、相手の効果で破壊されたとき、疲労状態でフィールドに残る | reviveOnDestroy `scope:"ownAll"` `filter:{keyword:"seimei"}` `when:{byOpponentEffect:true}` `revived:{rested:true}`（手本 BS20-002-e1「コスト3以下の自分のスピリットすべては、相手の効果で破壊されたとき、疲労状態でフィールドに残ることができる。」＝`{"kind":"reviveOnDestroy","levels":[1,2,3],"scope":"ownAll","filter":{"cost":{"max":3}},"when":{"byOpponentEffect":true},"revived":{"rested":true},"optional":true}`）。本文は「残る」なので optional を付けない（強制） |

### BS22-042 ハーピーガール（スピリット・想獣・コスト4）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3【聖命】（041 と同じ） | BS14-052-e1・e2 |
| Lv2-3『アタック時』このスピリットはLv2/Lv3の相手のスピリットからブロックされない | triggered onAttack＋timedEffect `unblockable{opponentOnly:true,from:{level:[2,3]}}` duration の扱いは BS20_PLAN §1（期間なしの『アタック時』はそのアタックの間）。手本 SD13-006-e1 の連鎖先「このスピリットはLv2/Lv3の相手のスピリットからブロックされない。」＝`{"type":"timedEffect","content":[{"type":"unblockable","opponentOnly":true,"from":{"level":[2,3]}}],"duration":"turn","target":"self"}` |
| 連鎖（条件 赤×1）：BP3000以下の相手のスピリット1体を破壊する | 連鎖元＝直上の Lv2-3『アタック時』。SD13-006-e1 と同じく `sequence[unblockable, if(red≥1, destroy maxBp 3000)]` を同じ entry に入れる（Lv2-3、keyword rensa） |

### BS22-043 聖天使エトワール（スピリット・天霊・コスト5）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『相手のアタックステップ』自分の黄のスピリットが回復状態の相手のスピリットをブロックしたとき、その相手のスピリットを破壊する | fieldEvent ownSpiritDeclaredBlock `subjectFilter{color:"yellow"}` `partnerFilter{refreshed:true}` `phase attack turn opponent` ＋ `destroy count 1`（イベントの相手役が対象）。手本 BS08-055-e1「BP5000以下の相手のスピリットのアタックによって自分のライフが減らされたとき、そのスピリットを破壊する。」＝`{"kind":"fieldEvent","event":"ownLifeDamaged","levels":[1,2],"partnerFilter":{"maxBp":5000},"action":{"type":"destroy","count":1}}`。ブロック宣言の fieldEvent は BS21-034-e1。回復状態の絞りは TargetFilter `refreshed`（BS12-039-e3） |
| Lv2-3『このスピリットのアタック時』このターンの間、相手のスピリット1体をBP-3000する | triggered onAttack＋`bpMinus amount 3000`（手本 SD15-X01 のLv1-3「このターンの間、相手のスピリット1体をBP-3000する。」、SD15-003-e1 は amount 1000 の同形） |

### BS22-044 天剣使キリエル（スピリット・剣使/天霊・コスト8）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『自分のアタックステップ』系統：「天霊」を持つ自分のスピリットがBPを比べるとき、BPのかわりにLvを比べ、Lvの低いスピリットが破壊される。Lvが同じとき、お互いのスピリットが破壊される | 既存の組み合わせ：fieldEvent anySpiritAttacked `subjectSide:"own"` `subjectFilter{family:["天霊"]}` `phase attack turn own`（BS12-037-e1 のアタック検知）→ timedEffect `compareBy by:"level"` duration battle。手本 BS10-073-e2「バトル解決時、BPのかわりにLvを比べ、Lvの低いスピリットが破壊される。Lvが同じとき、お互いのスピリットが破壊される。」＝`{"kind":"triggered","trigger":"onAttack","whileCombined":true,"action":{"type":"timedEffect","content":[{"type":"compareBy","by":"level"}],"duration":"battle"}}`。**新しい部品にしない理由**：compareBy は timedEffect の中身で、アタックの検知＋系統の絞りは fieldEvent の subjectFilter で書ける |
| Lv2-3【強化】自分の「BP-効果」を-1000する | 強化（黄）。keyword `kyoka:"bpMinus"` levels[2,3]（手本 SD15-001-e1＝`{"kind":"keyword","keyword":"kyoka","kyoka":"bpMinus","levels":[1,2]}`） |
| 【合体時】Lv2-3『このスピリットのバトル時』相手のスピリットを破壊したとき、自分はデッキから1枚ドローする | triggered onBattleWin whileCombined levels[2,3] `draw 1`（手本 BS18-X04-e3「このスピリットが相手のスピリットを破壊したとき、…」＝`{"kind":"triggered","trigger":"onBattleWin","levels":[2,3],"optional":false,"action":{…}}`、whileCombined は EX032-e2）。相打ちの扱いは §4 |

### BS22-045 時空の魔女グランディース（スピリット・導魔・コスト9）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『このスピリットの召喚時』自分のトラッシュにある[時空の魔女グランディース]以外のスピリットカード1枚の『このスピリットの召喚時』効果1つを、このスピリットの効果として発揮させることができる | **P6**。候補の選び方は moveCards の pick（`cardType:"spirit"`＋nameExcludes）に近い。持ち主のスピリットの『召喚時』を借りる前例は BS13-052-e1（fireEffect oneEffect）で、自分の効果として発揮する前例は BS13-049-e2（`borrowCombinedAttackEffect`）。optional true（「できる」）。Lv判定は §4 |

### BS22-063 ペンタンブレイヴ（ブレイヴ・歌鳥/動玩・コスト4）
| 節 | 使う器 |
| :-- | :-- |
| 合体条件：コスト4以上 | カードの合体条件欄（BS20-065 と同じ。効果エントリではない） |
| 【合体時】このスピリットが相手によって破壊されたとき、自分の黄のスピリット1体を疲労させることで、このスピリットは疲労状態でフィールドに残る | reviveOnDestroy `scope:"self"` `whileCombined:true` `when:{byOpponent:true}` `cost:{exhaustOwnOne:{color:"yellow"}}` `revived:{rested:true}`。手本 BS20-044-e1「自分の黄のスピリット1体を疲労させることで、このスピリットは疲労状態でフィールドに残る。」＝`{"kind":"reviveOnDestroy","levels":[1,2,3],"scope":"self","when":{},"revived":{"rested":true},"cost":{"exhaustOwnOne":{"color":"yellow"}}}`、BS20-065-e1「自分のネクサス1つを破壊することで、このスピリットは疲労状態でフィールドに残る。」＝`{"kind":"reviveOnDestroy","levels":[1],"scope":"self","whileCombined":true,"when":{},"revived":{"rested":true},"cost":{"destroyOwnNexusOne":true}}`、「相手によって」は BS12-X05-e3 の `when:{byOpponent:true}` |

### BS22-064 スイーツファイター（ブレイヴ・菓族・コスト4）
| 節 | 使う器 |
| :-- | :-- |
| Lv1『このブレイヴの召喚時』このターンの間、相手のスピリット1体をBP-4000する | triggered onSummon levels[1]＋`bpMinus amount 4000`（手本 BS12-058-e1 の onSummon levels[1] の形、SD15-X01 の bpMinus） |
| 合体条件：コスト4以上 | 合体条件欄 |

### BS22-071 朱に染まる薔薇園（ネクサス・黄/赤・コスト5）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-2『自分のアタックステップ』自分のライフが増えたとき、自分はデッキから1枚ドローする | fieldEvent lifeCorePlaced `subjectSide:"own"` `phase attack turn own` `draw 1`。手本 BS18-041-e1「自分か相手のライフにコアが置かれたとき、このスピリットは回復する。」＝`{"kind":"fieldEvent","event":"lifeCorePlaced","levels":[1,2,3],"phase":"attack","selfMode":"source","action":{"type":"refresh","target":"self"}}`（subjectSide はライフが増えた側。fieldEvent.ts:56） |
| Lv2『自分のメインステップ』自分の手札にある赤のスピリットカード/ブレイヴカードすべての軽減シンボルすべてを黄としても扱う | **P3**。形は P045-e2＝`{"kind":"step","step":"attack","turn":"both","levels":[2],"action":{"type":"timedEffect","content":[{"type":"playerRule","rule":{"type":"handReductionColorAsForPid","color":"yellow","cardType":"magic"}}],"duration":"step","side":"own"}}`（step を main、cardType を spirit/brave、cardColor red、also を足す） |

### BS22-081 ドリーミングバタフライ（マジック・コスト3）
| 節 | 使う器 |
| :-- | :-- |
| フラッシュ：相手は、下の効果のうち1つを選ぶ。その後、その効果を発揮する。この効果はターンに1回しか使えない。①自分の紫/黄のスピリットすべてを回復させる ②このターンの間、相手のスピリットすべてはアタックできない | **P4**（相手が選ぶ）。モード①＝`refresh all:true filter{color:["purple","yellow"]}`（手本 BS09-061-e2 の `refresh all filter`。color の配列は targetFilter.ts:18）。モード②＝timedEffect `cantAttack` を相手の全スピリットに（手本 SD06-012-e1・PX17-e2 の `{"type":"timedEffect","content":[{"type":"cantAttack"}],"duration":"turn"}`、全体配布は BS10-073-e1 の `side/all`）。「ターンに1回」はマジックの oncePerTurn（手続きで決まる：RULES_BATSPI_WIKI:106「マジックの `oncePerTurn` は常にカード名ごと」。手本 BS03-133-e1＝`{"kind":"magic","timing":"flash","oncePerTurn":true,"action":{…}}`） |

### BS22-082 ライフレボリューション（マジック・コスト5）
| 節 | 使う器 |
| :-- | :-- |
| メイン：ボイドからコア1個を自分のライフに置く。この効果はターンに1回しか使えない | magic main＋`oncePerTurn:true`（手本 BS03-133-e1）＋`placeCores void→life count 1`（手本 BS12-X05-e1 の `{"type":"placeCores","from":"void","to":"life","count":1}`） |
| 連鎖（条件 赤×1）：BP合計5000まで相手のスピリットを好きなだけ破壊する | 連鎖元＝直上のメイン。上の action を `sequence[placeCores, if(red≥1, destroy count:"any" budget{by:"bp",amount:5000})]` に（手本 SD17-015-e1「BP合計5000まで相手のスピリットを好きなだけ破壊する。」＝`{"kind":"magic","keyword":"rensa","timing":"flash","action":{"type":"sequence","actions":[{"type":"destroy","count":"any","budget":{"by":"bp","amount":5000}},{"type":"if",…}]}}`）。oncePerTurn と連鎖の関係は §4 |
| フラッシュ：このターンの間、スピリット1体をBP+3000する | magic flash＋timedEffect bp 3000（手本 BS13-077-e2「このターンの間、スピリット1体をBP+3000する。」＝`{"kind":"magic","timing":"flash","action":{"type":"timedEffect","content":[{"type":"bp","amount":3000}],"duration":"turn","side":"both"}}`） |

### BS22-X05 凶神獣カオス・ペガサロス（スピリット・想獣・コスト7）
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『自分のアタックステップ』【聖命】で自分のライフが増えるかわりに、相手のライフのコア1個を相手のトラッシュに置ける | **P2**（置換）。置き換え後の中身は `removeCores side:"opponent" from:["life"] to:"trash" count:1`（手本 BS17-051-e1 の removeCores 形）。【聖命】持ちの限定（「【聖命】で」）は §4 |
| Lv3【聖命】『このスピリットのアタック時』ライフを減らしたとき、ボイドからコア1個を自分のライフに置く | keyword seimei＋onLifeDealt placeCores void→life、levels[3]（手本 BS14-052-e1・e2 の levels を[3]に） |
| 連鎖（条件 赤×1）：自分のトラッシュにあるスピリットカード1枚を手札に戻す | 連鎖元の特定は §4。中身は `moveCards from trash dest hand pick{cardType:"spirit"}`（手本 SD17-012-e2「自分のトラッシュにある系統：「地竜」を持つスピリットカード1枚を手札に戻す。」＝`{"type":"moveCards","from":"trash","count":1,"dest":"hand","pick":{"cardType":"spirit","family":"地竜"}}`）を if(red≥1) の then に |

### BS22-X08 夢幻の天剣トワイライト・ファンタジア（ブレイヴ・剣刃・コスト5）
| 節 | 使う器 |
| :-- | :-- |
| Lv1『このブレイヴの召喚時』自分のライフが5以下のとき、自分のリザーブの[ソウルコア]以外のコア1個を自分のライフに置ける | triggered onSummon levels[1] `condition:{ownLifeAtMost:5}` optional true `placeCores from reserve to life count 1`。手本 BS12-X05-e1（condition ownLifeAtMost 5＋placeCores）・BS10-092-e2（`{"type":"placeCores","from":"reserve","to":"life","count":1}`）。ソウルコアはライフに置けない一般則（SOULCORE.md §1.3）で別の軸は要らない |
| 合体条件：コスト5以上 | 合体条件欄 |
| 【合体中】『このスピリットのアタック時』このスピリットが相手のスピリットにブロックされたとき、このスピリットは回復する | triggered onBlocked `eventTarget:"use"` `whileCombined:true` `refresh target:"self"`。手本 BS06-011-e2「白のスピリットにブロックされたとき、このスピリットは回復する。」＝`{"kind":"triggered","trigger":"onBlocked","eventTarget":"use","levels":[3],"condition":{"targetHasColor":"white"},"action":{"type":"refresh","target":"self"},"optional":false}`（条件は付けない）。【合体中】の書式は SD03-011-e2 |
| 【合体中】『このスピリットのアタック時』ブロックされなかったとき、ボイドからコア1個を自分のライフに置く | **P5**（新しい trigger）＋`placeCores void→life count 1` |

### BS22-X13-05 星天使ミカリーン（スピリット・天霊/想獣・コスト4） — cardId は `X13-05`
| 節 | 使う器 |
| :-- | :-- |
| Lv1-3『このスピリットの召喚時』このターンの間、相手のスピリット1体をBP-3000する | triggered onSummon＋`bpMinus amount 3000`（SD15-X01・SD15-003-e1 の bpMinus の形） |
| Lv1-3 このスピリットは、合体条件を無視して合体できる | constraint `ignoreBraveCondition`（手本 BS13-X05-e1「このスピリットは、合体条件を無視して合体できる。」＝`{"kind":"constraint","levels":[1,2,3],"constraint":{"type":"ignoreBraveCondition"}}`） |
| Lv3『このスピリットのアタック時』デッキを上から3枚オープン。その中のマジックカード1枚を手札に加える。残ったカードは好きな順番でデッキの上に戻す | triggered onAttack levels[3]＋`sequence keepScope[revealOpen count 3, moveCards from revealed count 1 dest hand pick{cardType:"magic"}, moveCards from revealed count "all" dest deckTop]`（手本 SD03-015-e1「自分のデッキを上から3枚オープンし、その中のブレイヴカード1枚を手札に加える。残ったカードは好きな順番でデッキの上に戻す。」＝`{"type":"sequence","actions":[…,{"type":"revealOpen","count":3},{"type":"moveCards","from":"revealed","count":1,"dest":"hand","pick":{"cardType":"brave"}},{"type":"moveCards","from":"revealed","count":"all","dest":"deckTop"}]}`）。強制（「できる」なし） |

### BS22-X13-09 渚のトリックスター（スピリット・道化/導魔・コスト6） — cardId は `X13-09`
| 節 | 使う器 |
| :-- | :-- |
| Lv1-2『このスピリットの召喚時』自分のトラッシュにあるマジックカード1枚を手札に戻す | triggered onSummon levels[1,2]＋`moveCards from trash count 1 dest hand pick{cardType:"magic"}`（手本 BS12-058-e1「自分のトラッシュにあるマジックカード1枚を手札に戻す。」＝`{"kind":"triggered","trigger":"onSummon","levels":[1],"optional":false,"action":{"type":"moveCards","from":"trash","count":1,"dest":"hand","pick":{"cardType":"magic"}}}`） |

## 4. 効果文から決められない点
引いた語は各項目に添えた（grep 対象：TIMING_CHART・RULES_BATSPI_WIKI・SEMANTICS_AUDIT・CONJUNCTION・CHOOSER_RULES・COST_MODEL・ACTION_VOCABULARY・BRAVE・BURST・BS*_PLAN）。

| # | カード・節 | 読みA | 読みB | 結果が変わる点 | 引いた語 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | 038 「破壊されたスピリットからコア1個を」 | 破壊直前にそのスピリット上にあったコアから1個（リザーブへ移る前に取る） | リザーブへ移った後のそのコア1個（持ち主のリザーブから取る） | 破壊されたスピリットの上にコアが0個だった場合、Aは置けない／Bも元の個数分しか無い。また【不死】やコアの行き先を変える効果（BS20-X01）と同時のとき、どこにあるコアかが変わる | 「破壊されたスピリット上のコア」「coresAtDestruction」は BS06-075・BS20_PLAN N4 に近い記述のみ。当たり無し |
| 2 | 044 【合体時】Lv2-3「バトル時、相手のスピリットを破壊したとき」 | 「BPを比べ相手のスピリットだけを破壊」と同じ（相打ちは含まない。onBattleWin） | 自分も破壊されても、相手のスピリットを破壊すればよい | 同じLvで相打ちになる（044 Lv1-3 のLv比べが書き換わる）とき、ドローするか。この組み合わせでは相打ちが頻繁に起きる | 「破壊したとき」。BS18-X04-e3 が同じ文言を onBattleWin にしているが相打ちの扱いは書かれていない |
| 3 | 045 コピーした『召喚時』効果のLv | 045 の現在Lvで有効なエントリだけ（BS13_PLAN §12：借りた効果は「持っているスピリットの現在Lv」） | トラッシュのカードのLvは無く、Lvを問わず全エントリが候補 | 「Lv1-2 の召喚時」しか持たないカードを045がLv3のとき借りられるか | 「このスピリットの効果として」。BS13_PLAN の049（借り手＝自分）と052（持ち主）の違いの行のみ。トラッシュのカードの前例無し |
| 4 | 071 Lv2「軽減シンボルすべてを黄としても扱う」 | 赤の軽減シンボルが黄も兼ねる（赤のまま、黄でも軽減できる） | P045 などの「として扱う」と同じ置き換え（黄に変わり赤では軽減できなくなる） | 赤のシンボルがあるプレイヤーが、手札の赤カードを赤の軽減で使えるか | 「としても扱う」。SEMANTICS_AUDIT §3.9 は「◯色のスピリットとしても扱う」＝追加の意味でシンボルの色にも及ぶとあり、Aが近い。軽減シンボルの前例は無い |
| 5 | 071 Lv1-2「ライフが増えたとき」 | 1回の効果で複数のコアが置かれても1回ドロー（lifeCorePlaced は効果1回の解決ごとに1回） | 置かれたコア1個ごとにドロー | 1回の効果でライフが2個以上増えるとき（BS19-092 のコアステップなど）のドロー枚数 | 「ライフが増えた」は当たり無し。BS18_PLAN の `coresGainedFromVoid`（効果1回につき1回、個数は eventInfo）が近い |
| 6 | 081 フラッシュ「相手は、下の効果のうち1つを選ぶ」 | 相手が選び、効果は081の使用者の「自分」で解決（モード①の「自分」＝使用者） | 相手が選び、「自分」も選んだ側として読む | モード①の回復対象が使用者の紫/黄か、相手の紫/黄か。CHOOSER_RULES は「主語が「相手は」なら選ぶのは相手」までで、効果の主体は書いていない | 「相手は」。CHOOSER_RULES.md:8 |
| 7 | 082 メイン「この効果はターンに1回しか使えない」＋連鎖 | 使えないのは直前のライフ増加だけ。2回目は連鎖の破壊だけが発揮できる | マジックのメイン効果全体が1回（連鎖も出ない。連鎖は連鎖元と一体：BS19_PLAN Q776） | 同名の2枚目を同じターンに使ったとき、BP合計5000までの破壊が出るか | 「ターンに1回」。RULES_BATSPI_WIKI:106（マジックはカード名ごと）。何を止めるかは書かれていない |
| 8 | X05 Lv1-3「【聖命】で自分のライフが増えるかわりに」 | 【聖命】持ちのスピリットなら誰でも（自分のスピリットすべて）。置換するかは聖命が誘発するたびに聞く（「置ける」） | X05 自身の【聖命】だけ | 他の【聖命】持ち（041・042 など）の聖命でも相手のライフを削れるか | 「かわりに」。BURST.md:109（置換もライフ減少として扱う）は別の置換。聖命の置換は当たり無し |
| 9 | X05 連鎖の連鎖元 | 直上の Lv3【聖命】（ライフを減らしたとき）の解決後に連鎖。置換した場合も連鎖は出る | 聖命が実際にボイドからライフにコアを置いたときだけ（置換したら出ない） | 置換を選んだ場合に、トラッシュのスピリットを回収できるか | 「連鎖」。BS19_PLAN §2.1（連鎖元が発揮されるタイミングなら出る：Q773）。置換で連鎖元の結果が変わる前例無し |
| 10 | X08 合体中「ブロックされなかったとき」 | ブロック宣言なしでライフで受けると決まった時点（ブロックステップの終わり。ライフ減少の前） | 「BPを比べずブロックされなかったものとして扱う」（treatAsUnblocked）の場合も含む | 他の効果でブロックされなかった扱いになったとき、コアが置かれるか | 「ブロックされなかった」。TIMING_CHART §1.9（ブロックなしはバトルにならない）。誘発の時点は書かれていない |
