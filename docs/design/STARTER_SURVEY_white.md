# 構築済みデッキ 調査メモ：white（調査役）
対象：BS01-141 BSC05-007 BSC05-009 BSC05-015 BSC05-019 EX011 SD11-001 SD11-002 SD11-003 SD11-004 SD11-005 SD11-006 SD11-007 SD11-008 SD11-009 SD11-010 SD11-011 SD11-012 SD11-013 SD11-014 SD11-015 SD11-016 SD11-X01 SD11-X02。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：44（合体条件は効果節ではないため含めず。SD11-002 は効果なしで 0）
- 既存で書ける：41
- 新しい部品が要る：3（BSC05-009 Lv3・SD11-016・SD11-X02【合体時】）
- 連鎖：8（SD11-003 / SD11-005 / SD11-007 / SD11-009 / SD11-010 / SD11-014 / SD11-015 / SD11-X01。すべて条件《緑シンボル》×1）
- 強化：0

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | `return`（手札に戻す）の静的 budget `{by:"bp"\|"cost", amount}`（種別：アクション） | `destroy` には budget がある（BS17-055-e1「BP合計4000まで相手のスピリットを好きなだけ破壊する」＝`destroy budget:{by:"bp",amount:4000}`、BS16-083-e1 は `by:"cost"`）。`return` to hand の `costBudget` は EffectCounter（動的カウンタ）専用で静的な数値上限が書けず、BP 合計の軸はそもそも無い（server/src/types/effectAction.ts:77）。sequence + 繰り返しでも「好きなだけ・合計上限」は表現できない | BSC05-009 Lv3（コスト合計4まで）、SD11-016（BP合計5000まで） |
| 2 | 【連鎖】の条件を無視して発揮する修飾（種別：条件の軸） | 既存の【連鎖】は `if cond:{count:{ownColorSymbols:"色"},atLeast:N}` で条件を書く（BS19-006-e1）。この if を省略/常時成立にする軸が型に無い（`grep 'rensa.*ignore\|condition' server/src/types/*.ts` で該当なし）。SD11-X02 は「このスピリットの【連鎖】は、条件を無視して発揮する」で、既存カードにも効果文の前例が無い（`条件を無視して発揮` で data/cards 全検索 0 件） | SD11-X02【合体時】 |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS01-141 | フラッシュ：このターンの間、自分か相手のスピリット1体はブロックされない | `timedEffect content:[{type:"unblockable"}] duration:"turn"`。手本 BS07-044-e2（「このターンの間、このスピリットはブロックされない」＝timedEffect unblockable target self）。単体選択・両陣営は timedEffect の count/side で（side:"both" は BS16-079-e2 が使用） |
| BSC05-007 | Lv1･Lv2：色とシンボルは赤としても扱う | `colorAs`（BS12-009-e1「このスピリットの色とシンボルは白としても扱う」＝colorAs colors:[white] だけでシンボルも扱う） |
| BSC05-009 | Lv1･Lv2･Lv3『相手のアタックステップ』：合体していない相手のスピリットすべてを疲労状態でブロックできる | `constraint {type:"canBlockWhileRested", filter:{uncombined:true}}`（BS08-029-e2「【転召】を持たない相手のスピリットを疲労状態でブロックできる」＝canBlockWhileRested + filter。uncombined 軸は targetFilter.ts にあり） |
| BSC05-009 | Lv3『バトル時』：BPを比べ相手のスピリットだけを破壊したとき、コスト合計4まで相手のスピリットを好きなだけ手札に戻す | `triggered onBattleWin`（BS10-X04-e2「BPを比べ…破壊したとき」＝onBattleWin + return）+ **新部品 #1**（return の cost budget） |
| BSC05-015 | 【合体中】【装甲：赤/緑/白】 | `keyword armor whileCombined`（BS08-029-e1【装甲：紫/白/青】＝keyword armor colors。whileCombined は constraint 系で実績あり） |
| BSC05-019 | Lv1･Lv2『相手のターン』：ライフは、ターンごとに相手のスピリット1体から1までしか減らない | `globalConstraint ownLifeDamageCapPerSourcePerTurn max:1`（BS19-043-e1「自分のライフは、ターンごとにシンボル2つ以上を持つ相手のスピリット1体から1までしか減らされない」＝同型。minSymbols を省くだけ） |
| BSC05-019 | Lv2：スピリット状態のブレイヴすべてに【装甲：赤/青】を与える | `keywordGrant armor target:"ownAll" braveInSpiritState:true`（BS10-083-e2「自分のスピリット状態のブレイヴすべてに“【呪撃】…”を与える」＝keywordGrant braveInSpiritState。装甲付与は BS10-037-e1 が同型） |
| EX011 | 【合体時】【装甲：白】 | `keyword armor whileCombined`（BS08-029-e1 と同じ形） |
| SD11-001 | Lv1･Lv2【重装甲：赤】 | `keyword heavyArmor colors:["red"]`（BS12-025-e2「Lv2【重装甲：赤】」＝keyword heavyArmor） |
| SD11-001 | Lv2：色とシンボルは緑としても扱う | `colorAs`（BS12-009-e1） |
| SD11-002 | （効果なし） | なし |
| SD11-003 | Lv1･Lv2『ブロック時』：BP+3000 | `triggered onBlock eventTarget:"use"` + `timedEffect bp duration:"battle"`（BS10-037-e2『ブロック時』BP+5000＝onBlock + timedEffect bp） |
| SD11-003 | Lv2『ブロック時』：ボイドからコア1個をこのスピリットに置く | `triggered onBlock` + `placeCores from:"void" to:"spirit" target:"self"`（BS14-037-e2『ブロック時』ボイドからコア1個＝onBlock + placeCores） |
| SD11-003 | 連鎖（条件 緑シンボル×1）→ [緑]：相手のスピリット1体を疲労させる | `triggered keyword:"rensa"` + `sequence [元効果, if cond:{ownColorSymbols:"green",atLeast:1} then exhaust]`（BS19-006-e1【連鎖：条件《紫シンボル》】＝rensa + sequence + if ownColorSymbols。exhaust は BS01-047-e1 と同じ器） |
| SD11-004 | Lv1〜3：疲労状態でブロックできる | `constraint {type:"canBlockWhileRested"}`（BS08-029-e2 の filter 無し版） |
| SD11-004 | Lv2･Lv3『ブロック時』：BP+3000 | BS10-037-e2 と同じ形 |
| SD11-005 | Lv1･Lv2『召喚時』：BP2000以下の相手のスピリット1体を手札に戻す | `triggered onSummon` + `return to:"hand" count:1 filter:{maxBp:2000}`（BS10-070-e1『このブレイヴの召喚時』相手のスピリット1体を手札に戻す＝onSummon + return。maxBp 軸は BS01-023-e1 が使用） |
| SD11-005 | 連鎖（条件 緑シンボル×1）→ [緑]：ボイドからコア1個をこのスピリットに置く | BS19-006-e1 の形（if の then を placeCores target self：BS01-023-e2 と同じ器） |
| SD11-005 | Lv2【重装甲：赤/青】 | `keyword heavyArmor colors:["red","blue"]`（BS12-025-e2） |
| SD11-006 | Lv1〜3『相手のアタックステップ』：自分の白のスピリットすべてをBP+2000 | `aura {type:"bp", target:"ownAll", colorFilter 白, phaseTurn:{phase:"attack",turn:"opponent"}}`（BS15-X03-e2『自分のアタックステップ』系統「華兵」すべてをBP+1000＝aura bp + phaseTurn + counter） |
| SD11-007 | Lv1･Lv2『相手のアタックステップ』：相手は、可能ならば必ずターンに1回以上アタックする | `globalConstraint opponentMustAttackOnce`（BS18-029-e2「相手は、可能ならば必ずターンに1回以上アタックする」＝同文） |
| SD11-007 | Lv2『ブロック時』：BP+3000 | BS10-037-e2 と同じ形 |
| SD11-007 | 連鎖（条件 緑シンボル×1）→ [緑]：相手のスピリット1体を疲労させる | BS19-006-e1 と同じ形 |
| SD11-008 | Lv1･Lv2『自分のアタックステップ』：系統「機獣」の『ブロック時』効果すべては『アタック時』に発揮される | `blockTriggersAsAttackGrant target:"ownAll" familyFilter:"機獣" phaseTurn:{phase:"attack",turn:"own"}`（BS07-036「系統：「機獣」/「巨獣」を持つ自分のスピリットの、『このスピリットのブロック時』と指定されている効果はすべて、『このスピリットのアタック時』に発揮される」＝同型。ターン限定版は BS10-072-e1 の triggerSwap） |
| SD11-009 | Lv1〜3『ブロック時』：BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く | `triggered onBattleWin battleRole:"blocker"` + `lifeCrush count:1`（BS02-036-e1「BPを比べ相手のスピリットだけを破壊したとき、相手のライフにあるコア1個を相手のリザーブに置く」＝onBattleWin + lifeCrush。blocker 側は BS10-X04-e2 が使用） |
| SD11-009 | 連鎖（条件 緑シンボル×1）→ [緑]：相手はバーストを発動できない | BS19-006-e1 の形。中身は `timedEffect content:[{type:"battleLock",lock:"burst"}] duration:"battle"`（BS15-X03-e1『バトル時』相手はバーストを発動できない＝battleLock burst。BS19-060-e1 は色限定版） |
| SD11-010 | Lv2･Lv3：このスピリットは緑のスピリットとしても扱う | `colorAs colors:["green"]`（BS12-025-e1「このスピリットは赤のスピリットとしても扱う」＝colorAs） |
| SD11-010 | 【合体時】Lv2･Lv3『合体アタック時』：BP7000以上の相手のスピリット1体を疲労させることで、このスピリットは回復する | `pay cost:{type:"exhaust", filter:{minBp:7000}, count:1} then:{type:"refresh", target:"self"}`（BS19-032-e2【連鎖】「自分のネクサス1つを疲労させることで、このスピリットは回復する」＝pay cost exhaust + then refresh self。minBp 軸は targetFilter.ts にあり） |
| SD11-010 | 連鎖（条件 緑シンボル×1）→ [緑]：ボイドからコア1個を自分のスピリットに置く | BS19-006-e1 の形。中身は placeCores（対象選択は BS19-013-e1 の refresh filter と同じ選択の器） |
| SD11-011 | Lv1『このブレイヴの召喚時』：相手のネクサス1つを手札に戻す | `triggered onSummon` + `return to:"hand" count:1 nexus:"only"`（BS10-070-e1 と同じ器。return の nexus:"only" 軸は effectAction.ts:77 にあり） |
| SD11-011 | 【合体時】『相手のアタックステップ』：BP4000以上の相手のスピリットがアタックしたとき、このスピリットは回復する | `fieldEvent anySpiritAttacked subjectSide:"opponent" subjectFilter:{minBp:4000, combined:false} selfMode:"source"` + `refresh target:"self"`（BS10-070-e2「合体していない相手のスピリットがアタックしたとき、このスピリットは回復する」＝同型。minBp を足すだけ） |
| SD11-012 | Lv1･Lv2『相手のアタックステップ』：系統「機獣」の自分のスピリットすべてをBP+2000 | `aura bp + familyFilter + phaseTurn`（BS15-X03-e2 と同じ形） |
| SD11-012 | Lv2『相手のアタックステップ』：系統「機獣」がブロックしたとき、ボイドからコア1個をそのスピリットに置く | `fieldEvent ownSpiritDeclaredBlock subjectFilter:{family:"機獣"}` + `placeCores from:"void"`（BS10-088-e1「効果の記述を持たない自分のスピリットがブロックしたとき、ボイドからコア1個をそのスピリット上に置く」＝ownSpiritDeclaredBlock + placeCores。※手本の to は nexus self になっている点は §4 参照） |
| SD11-013 | Lv1･Lv2『このネクサスの破壊時』：手札の白のスピリットカード1枚をコストを支払わずに召喚できる | `triggered onDestroy` + `summon from:"hand" skipOnSummon:true colorFilter:"white"`（BS05-038-e1『破壊時』手札のコスト2のスピリットカード1枚をコストを支払わずに召喚＝onDestroy + summon skipOnSummon。色絞りは BS02-034-e2 colorFilter:"green"） |
| SD11-013 | Lv2：系統「機獣」すべてに“【重装甲：赤】…”を与える | `keywordGrant heavyArmor target:"ownAll" familyFilter:"機獣" colors:["red"]`（BS10-037-e1「系統：「機獣」を持つ自分のスピリットすべてに“【装甲：赤/青】…”を与える」＝keywordGrant + familyFilter） |
| SD11-014 | フラッシュ：このバトルが終了したとき、アタックステップを終了する | `magic timing:"flash"` + `endAttackStepAfterBattle`（BS01-144-e1「フラッシュ：今行っているバトルが終了したとき、アタックステップを終了する」＝同文） |
| SD11-014 | 連鎖（条件 緑シンボル×1）→ [緑]：相手のスピリット1体を疲労させる | BS19-006-e1 と同じ形 |
| SD11-015 | フラッシュ：相手のスピリット1体を手札に戻す | `magic timing:"flash"` + `return to:"hand" count:1`（BS10-070-e1 と同じ器） |
| SD11-015 | 連鎖（条件 緑シンボル×1）→ [緑]：自分の白のスピリット1体を回復させる | BS19-006-e1 の形。中身は `refresh count:1 filter:{color:"white"}`（BS19-013-e1「自分のスピリット1体を回復させる」＝if then refresh count 1） |
| SD11-016 | フラッシュ：BP合計5000まで相手のスピリットを好きなだけ手札に戻す。または、相手のバースト1つを破棄する。この効果は、メインステップで使えない | `chooseActionMode`（P049-e1「BP4000以下の相手のスピリット1体を破壊する。または、相手のネクサス1つを破壊する」＝chooseActionMode 2モード）。モード1 は **新部品 #1**（return の bp budget）。モード2 は `discard from:"burst" side:"opponent" count:1`（discard の from:"burst" は BS14-015-e2 が使用、side:"opponent" は型が対応）。メインステップ制限は `castRestriction notInMainStep:true`（server/src/types/effectDefContinuous.ts:18「メインステップ中の使用だけを禁止」。データでの使用例はまだ無い） |
| SD11-X01 | Lv1〜3『ブロック時』：BPを比べ相手のスピリットだけを破壊したとき、このスピリットは回復し、このターンの間、BP+3000 | `triggered onBattleWin battleRole:"blocker"` + `sequence [refresh self, timedEffect bp duration:"turn"]`（refresh は BS01-071-e1「BPを比べ…このスピリットは回復する」、bp duration:"turn" は BS16-079-e2 が使用） |
| SD11-X01 | Lv3『バトル時』：コスト6以下の相手のスピリット1体を手札に戻す | `triggered onBattleStart` 系 + `return to:"hand" count:1 filter:{cost:{max:6}}`（BS10-X04-e2 と同じ器。cost max 軸は targetFilter.ts にあり） |
| SD11-X01 | 連鎖（条件 緑シンボル×1）→ [緑]：相手のスピリット1体を疲労させる | BS19-006-e1 と同じ形 |
| SD11-X02 | 【合体時】【重装甲：緑/白/黄/青】 | `keyword heavyArmor colors:["green","white","yellow","blue"] whileCombined`（BS12-025-e2 と同じ器） |
| SD11-X02 | 【合体時】：このスピリットの【連鎖】は、条件を無視して発揮する | **新部品 #2**（連鎖条件無視の軸） |

## 4. 効果文から決められない点
- BS01-141「自分か相手のスピリット1体はブロックされない」：timedEffect unblockable の単体選択で side:"both"（両陣営から1体選ぶ）ができるか。手本 BS07-044-e2 は target:"self"、BS10-073-e1 は side:"own" all で、「両陣営から1体選択」の前例は見つかっていない。
- BSC05-019 Lv1「ターンごとに」：相手のターンごと（ownLifeDamageCapPerSourcePerTurn のターン累計で解釈した）でよいか。BS19-043 も同じ簡略化に載っている。
- SD11-009 連鎖 [緑]「相手はバーストを発動できない」：効きの範囲が「このバトルの間」か「破壊処理の間だけ」か。battleLock duration:"battle" と解釈したが、効果文には期間が書かれていない。
- SD11-012 Lv2「そのスピリットに置く」：手本 BS10-088-e1 は効果文と同じ「そのスピリット上に置く」なのにデータは `to:"nexus" target:"self"`（発生源ネクサス自身）になっており、手本の実装が効果文と食い違う。eventTarget（ブロックしたスピリット）に置けるか要確認。
- SD11-016「この効果は、メインステップで使えない」：フラッシュ効果全体（両モード）に掛かるか、「または」以降のモードだけか。文面は後者にも読めるが、castRestriction はカード単位の制限なので前者で書くことになる。
- SD11-X02「このスピリットの【連鎖】は、条件を無視して発揮する」：合体時効果なので、合体している間だけ（合体解除で戻る）という解釈でよいか。
