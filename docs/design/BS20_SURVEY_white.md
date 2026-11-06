# BS20 調査メモ：white（調査役）
対象：BS20-028, 029, 030, 031, 032, 033, 034, 035, 036, 061, 062, 070, 079, 080, X04。実装はしていない。
ルールは docs/design/BS19_PLAN.md §2.1・§2.15・§2.2 で確認した。【連鎖】は sequence＋if（`ownColorSymbols`）、【強化】は `keywords/kyoka.ts`（既存の器）。BS20-074 は取り込み済みなので飛ばした。ソードブレイヴ X07（紫）・X08（黄）は white ではないので本メモの対象外。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：29（028 は効果なしの0節を含むカード15枚ぶん）
- 既存の器で書ける：26 節
- 新しい部品が要る：3 節（BS20-061 の1節、BS20-X04 の2節。カード2枚）
- 連鎖：7 節（031・033・034・062・079 の各1節、X04 の2節。【連鎖】を持つカード6枚）
- 強化：1 節（036。【強化】を持つカード1枚）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | TargetFilter `lowerCostThanSelf`（条件の軸） | targetFilter.ts のコスト軸は sameCostAsSelf（:63）・maxCostAsSelf（:66）の「同じ／以下」だけ。「未満」の軸は BP の lowerBpThanBattleLoser（:61）しか無く、コストの未満は maxCostAsSelf から1引く動的な値も書けない | BS20-061（「このスピリットよりコストの低い自分のスピリット1体を回復させる」） |
| 2 | kind `freeSummonFromHandOnOwnSpiritDestroyed`（タイミング。条件に色=白・コスト6以上・相手による破壊） | 手札のカード自身が発揮する freeSummonFromHand 系は LifeDamaged／DiscardedByOpponent／OwnNexusDeployed の3種のみ（effectDefTrigger.ts:150-165）。「自分のスピリットが相手によって破壊されたとき」の発火点が無い。altSummonFromHand（effectDef.ts:117）は代替コストの支払いルートで発動タイミングを持たない | BS20-X04（「手札にあるこのスピリットカードは、コスト6以上の自分の白のスピリットが相手によって破壊されたとき、コストを支払わずに召喚できる」） |
| 3 | `return` の budget に `counter`（EffectCounter）または `amount: "selfBp"`（アクション） | return の budget は `{ by: "cost" \| "bp"; amount: number }` の固定値のみ（effectAction.ts:77）。destroy の budget は `counter?: EffectCounter` を持つ（:48）のに return 側に受け皿が無い。EffectCounter `"selfBp"`（effectCounter.ts:24）は既存なので、return budget に渡せば書ける | BS20-X04（「BP合計(このスピリットのBP)まで相手のスピリットを、好きなだけ手札に戻す」） |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-028 | （効果なし） | effects 空配列（BS19-001 ドク・リザードと同じ形） |
| BS20-029 | Lv1･Lv2 お互いのデッキは破棄されない | globalConstraint `noDeckMill`（BS19-038-e2。効果文「お互いのデッキは破棄されない。」と同じ文） |
| BS20-029 | Lv2【重装甲：紫/青】 | keyword `heavyArmor` colors（BS13-030-e1。「Lv1･Lv2【重装甲：紫/青】このスピリットは、相手の紫/青の…効果を受けない。」と同じ形） |
| BS20-030 | Lv1･Lv2 コスト3以下の自分のスピリットすべては相手の効果で破壊されたとき疲労状態で残る | `reviveOnDestroy` scope:"ownAll" filter:{cost:{max:3}} when:{byOpponentEffect:true} optional revived:{rested:true}（BS18-038-e1。「このスピリットは相手によって破壊されたとき、疲労状態で自分のフィールドに残ることができる。」と同じ形。scope/filter の拡張は既存の型どおり） |
| BS20-030 | Lv1･Lv2『相手のメインステップ』相手の手札が増えたとき1枚につき相手は手札1枚を破棄 | fieldEvent `opponentHandAdded`（BS18-066-e2。「『相手のドローステップ』以外で相手の手札が増えたとき、相手は、相手の手札1枚を破棄する。」と同じ形）＋ repeatPerCount（BS19-088-e2。「増えたカード1枚につき」の書き方）＋ phase 限定 |
| BS20-031 | Lv1･Lv2『このスピリットのブロック時』BP+3000 | triggered onBlock → timedEffect bp 3000 duration battle（SD11-004-e2。「『このスピリットのブロック時』このスピリットをBP+3000する。」と同じ文） |
| BS20-031 | 連鎖（条件 黄×1）：このターンの間、相手のスピリット1体をBP-3000 | sequence＋if（`ownColorSymbols: "yellow"`）（BS19-039-e1 の連鎖の形）＋ `bpMinus` amount 3000（BS19-109-e1。「このターンの間、相手のスピリット1体をBP-3000する。」と同じ文） |
| BS20-032 | Lv1･Lv2･Lv3 自分のスピリット1体につきBP+1000 | aura bp amountPer 1000 counter（BS01-021-e1。「自分のフィールドの系統：「竜人」を持つスピリット1体につき、このスピリットをBP+1000する。」と同じ形。counter は EffectCounter `ownSpirits`） |
| BS20-032 | 【合体時】Lv2･Lv3『このスピリットのブロック時』ボイドからコア1個を自分のスピリットに | triggered onBlock whileCombined → `placeCores` from void to spirit（BS06-029-e1。「ボイドからコア1個を自分のスピリットに置く。」と同じ文。whileCombined の書き方は BS13-030-e2） |
| BS20-033 | Lv1･Lv2『このスピリットのバトル時』BP8000以上の相手1体を手札に戻す | triggered onBattleStart → `return` to hand filter:{minBp:8000}（BS19-039-e1 の return と targetFilter.ts:15 の minBp 軸。「BP8000以上」は BS05 火龍王ボルケノスの minBp:"selfBp" と同じ軸） |
| BS20-033 | 連鎖（条件 黄×1）：相手1体を指定し、このターンの間アタック/ブロック不可 | sequence＋if（BS19-039-e1）＋ timedEffect content:[cantAttack, cantBlock] duration turn（BS15-082-e2。「このターンの間、…アタック/ブロックできない」を timedEffect cantAttack＋cantBlock で書いた例と同じ形） |
| BS20-034 | Lv1･Lv2･Lv3『相手のアタックステップ』疲労状態でブロックできる | constraint `canBlockWhileRested`（SD11-004-e1。「このスピリットは疲労状態でブロックできる。」と同じ文） |
| BS20-034 | Lv2･Lv3『このスピリットのブロック時』自分のスピリット1体につきBP+2000 | triggered onBlock → timedEffect bp 2000 duration battle ＋ amountCounter（SD11-004-e2 ＋ BS17-032-e2 の amountCounter。「自分の白のスピリット1体につき、このスピリットをBP+1000する。」と同じ形） |
| BS20-034 | 連鎖（条件 黄×1）：1枚ドロー | sequence＋if（BS19-039-e1）＋ `draw`（BS19-006-e1 の連鎖 `[紫]：自分はデッキから1枚ドローする。` と同じ形） |
| BS20-035 | Lv1･Lv2･Lv3【重装甲：紫/緑/白/黄】 | keyword `heavyArmor` colors 4色（BS13-X04-e1。「Lv1･Lv2･Lv3【重装甲：紫/緑/白/黄】…」と同じ文） |
| BS20-036 | Lv1･Lv2【強化】 | keyword `kyoka` kyoka:"refresh"（BS19-038-e1。白の【強化】「自分の「スピリット回復効果」の体数を+1体する。」と同じ） |
| BS20-036 | Lv2『このスピリットのアタック時』4枚オープン・武装1枚につき戻す・破棄 | sequence：`revealOpen` count 4 → `moveCards` from:"revealed" pick:{family:武装, spirit} count:"all" dest:"trash" → `return` countCounter:"lastMoved" → `moveCards` from:"revealed" count:"all" dest:"trash"（SD10-016-e1 の revealOpen→moveCards from:"revealed" の形。「その中の…スピリットカードすべてを手札に加える。残ったカードは…戻す。」と同じ組み合わせ。lastMoved カウンタは effectCounter.ts:39） |
| BS20-061 | 【合体時】『合体アタック時』ターンに1回、コストの低い自分1体を回復 | triggered onAttack whileCombined maxPerTurn:1 → `refresh` filter（refresh は filter を持つ。effectAction.ts:94）＋ **新部品 #1** `lowerCostThanSelf` |
| BS20-062 | Lv1『このブレイヴの召喚時』相手1体を手札に戻す | triggered onSummon → `return` to hand count 1（BS19-042-e1 の return。「相手のスピリット1体を手札に戻す」類は BS19-039-e1 と同じ形） |
| BS20-062 | 連鎖（条件 黄×1）：このターンの間、相手1体をBP-3000 | sequence＋if（BS19-039-e1）＋ `bpMinus`（BS19-109-e1 と同じ文） |
| BS20-070 | Lv1･Lv2 自分の手札は相手の効果を受けない | globalConstraint `handImmuneForPid` includeNexus（BS14-082-e1。「自分の手札は相手のスピリット/ブレイヴ/ネクサス/マジックの効果を受けない。」と同じ文） |
| BS20-070 | Lv2『相手のアタックステップ』相手がアタックしたときコスト以下の自分1体を回復 | fieldEvent `anySpiritAttacked` turn:"opponent" → `refresh` count 1 filter:{maxCostAsSelf:true}（BS04-037-e2 の anySpiritAttacked＋refresh の形。「コスト1以下の相手のスピリットがアタックしたとき、このスピリットは回復する。」と同じ形。maxCostAsSelf は targetFilter.ts:66） |
| BS20-079 | フラッシュ：このターンの間、自分1体をBP+3000 | magic flash → timedEffect bp 3000 duration turn（BS01-128-e2。「このターンの間、スピリット1体をBP+3000する。」と同じ文） |
| BS20-079 | 連鎖（条件 黄×1）：このターンの間、相手1体をBP-3000 | sequence＋if（BS19-039-e1）＋ `bpMinus`（BS19-109-e1 と同じ文。マジックの連鎖は BS19_PLAN §2.1 Q780） |
| BS20-080 | フラッシュ：1体回復 → その後、回復したスピリットは相手のスピリットの効果を受けない | sequence：`refresh` count 1 → timedEffect duration turn target:"lastTargets" content:[{type:"immune", against:["spirit"]}]（BS01-142-e1。「この効果で回復したスピリットはアタックできない。」を refresh→timedEffect target:"lastTargets" で書いた例と同じ形。immune against は timedContent.ts:39・ImmuneSource="spirit" は type.ts:45） |
| BS20-X04 | 手札にあるこのカードは白コスト6以上が相手によって破壊されたときコストを支払わずに召喚できる | **新部品 #2** `freeSummonFromHandOnOwnSpiritDestroyed`（手本は BS08-038-e1 `freeSummonFromHandOnLifeDamaged`。「手札にあるこのスピリットカードは、自分のライフが減ったとき、コストを支払わずに召喚できる。」と同じ形だが発火点が違う） |
| BS20-X04 | Lv2･Lv3『このスピリットのバトル時』BP合計(このBP)まで好きなだけ手札に戻す | triggered onBattleStart → `return` budget:{by:"bp"} ＋ **新部品 #3** budget counter（SD11-016-e1。「BP合計5000まで相手のスピリットを好きなだけ手札に戻す。」を `return` budget:{by:"bp", amount:5000} で書いた例と同じ形。amount を selfBp にする所だけ足りない） |
| BS20-X04 | 連鎖（条件 緑×1）：相手はバーストを発動できない | sequence＋if（2色は if の入れ子。BS19_PLAN §2.2 A）＋ timedEffect content:[{type:"battleLock", lock:"burst"}] duration battle（BS19-033-e2。「相手はバーストを発動できない」を battleLock lock:"burst" で書いた例と同じ形） |
| BS20-X04 | 連鎖（条件 黄×1）：このスピリットは相手のスピリットからブロックされない | sequence＋if ＋ timedEffect content:[{type:"unblockable"}] duration battle（timedContent.ts:22 の unblockable。BS01-035-e1 は「このスピリットは、緑のスピリットからブロックされない。」を constraint unblockableBy filter で書いた例。filter 省略＝すべて） |

## 4. 効果文から決められない点
- **BS20-030 Lv1**：「相手の効果で破壊されたとき」— 効果による破壊のみ（バトルのBP比較を含まない）と読み、`when:{byOpponentEffect:true}` で書く。手本 BS18-038 は「相手によって」で `byOpponent`（バトル含む、effectDefTrigger.ts の定義コメント）を使っており、書き分けが必要。効果のみかバトル含むかは要確認。
- **BS20-036 アタック時**：「オープンできる」は任意。しなければ戻さない。戻す枚数はオープンした4枚の中の武装スピリットカードの枚数で、破棄はその後（表の順序は枚数確定→戻す→破棄だが、結果は同じ）。0枚なら戻さない。
- **BS20-061**：「ターンに1回」の単位はこの効果（カード）ごとと読む（持ち主ごとに数える読みも不可能ではない）。「このスピリットよりコストの低い」の「このスピリット」は合体スピリット全体（ブレイヴ単体のコストではない）と読む。
- **BS20-070 Lv2**：refresh の filter `maxCostAsSelf` の self が、fieldEvent ではイベント対象（アタックした相手スピリット）として解決されるか（targetFilter.ts:63 の sameCostAsSelf のコメントはその読み）。発生源（ネクサス）自身のコストと読むと意味が通らないので対象基準で確定させたい。「コスト以下」は同コストを含む。
- **BS20-080**：「その後」＝回復を解決し終えてから免疫を付ける。回復した対象が複数ならすべてに付く（lastTargets）。回復できない・しなかったら免疫も付かない。
- **BS20-X04 手札の節**：「相手によって破壊されたとき」— バトルのBP比較での破壊も含む（BS18-038 の byOpponent と同じ語）。破壊されたスピリット1体ごとに1回確認するか、同時破壊で1回かも書かれていない。召喚時効果の無効化の記述がないので『召喚時』効果は発揮される。
- **BS20-X04 バトル時**：「BP合計(このスピリットのBP)まで」のBPは効果解決時の実効BP（バトル時のBP+系を含む）と読む。「好きなだけ」なので0体でもよい。
- **BS20-X04 連鎖[緑]・[黄]**：期間の記述がない。どちらもそのバトルの間（duration battle）と読むが、ターンの間という読みもできる（BS19_PLAN §2.1 Q777 は継続の連鎖の裁定）。要確認。
- **BS20-031・034 のブロック時BP+**：期間の記述がないが、手本 SD11-004 と同じくそのバトルの間（duration battle）。
