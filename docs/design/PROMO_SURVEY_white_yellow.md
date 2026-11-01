# プロモ調査メモ：白・黄（調査役）

対象：`data/staging/PROMO.json` のうち 29 枚（P003 P007 P008 P015 P016 P021 P024 P026 P028 P033 P036 P037 P041 P045 P052 P053 P056 P063 P064 P075 P076 P078 P079 P084 PX02 PX05 PX10 PX11 PX17）。**実装はしていない**（このメモのみ）。
P003 封印獣マルコは効果文が空（バニラ）なので節数に入れていない。合体条件（「合体条件：コスト4以上」）はカードの属性なので節に数えない。
「既存で書ける」の根拠は、同じ器を使う既存カードの cardId。`(要確認)` は型の定義まで追い切れていない点。

## 1. 集計

節は「Lv 見出し単位＋キーワード単独行＋バースト／フラッシュの単独ブロック」で数えた。

| 区分 | 節数 |
| :-- | --: |
| 全体 | 48 |
| 既存の器で書ける | 35 |
| 新しい部品が要る | 13（部品は 11 種。うち 3 件は既存の同じ器への軸の追加） |

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | `reviveOnDestroy.condition` に「自分のフィールドに指定キーワードを持つスピリットがいる」「指定色（複数色のOR）のスピリットがいる」（条件の軸） | reviveOnDestroy の condition は `ownBurstSet`／`ownFieldOnlyColor`／`ownHandAtLeast`／`opponentFieldSymbolColorsAtMost` の4つだけ。`ownFieldHasKeyword`・`ownFieldHasColorSpirit` は triggered 側の condition にはあるが、reviveOnDestroy 側の型には無い（条件の語彙が器ごとに別々に持たれている） | P024（【聖命】）・P078（緑/白） |
| N2 | TargetFilter の「コストが直前に使用したマジックのコスト以下」（軸） | `lastMagicUsed`（GameState）に cardId は載るがコストを filter から引く手段が無い。`magicCostEquals` は fieldEvent の発火条件側で「使用したマジックが等しいコスト」しか見ず、破壊・バウンス対象のコスト上限には使えない | P033（破壊）・P076（手札に戻す） |
| N3 | fieldEvent `ownMagicUsed` の condition に「発生源自身がバトル中（アタッカーでもブロッカーでも）」（条件の軸） | 既存の condition は `selfIsAttacking`（アタッカーのみ。BS11-040・BS12-058）。P033 は『このスピリットのバトル時』なのでブロック側でも成立しなければならない | P033 |
| N4 | `braveImmuneGrant` に `nameIncludes`（軸） | 現状の絞り込みは `colorFilter`・`keywordFilter` のみ。カード名での絞り込みが無い（reviveOnDestroy・constraintGrant・effectGrant は nameIncludes を持つので、同じ軸を足すだけ） | P036 |
| N5 | `reviveOnDestroy.when` に `byBattleKillerMinBp`（軸） | 既存は `byBattleKillerMaxBp`（BS08-063＝「BP7000以下に」）と `byBattleKillerLevel` のみ。「BP10000以上」の下限が無い | P036 |
| N6 | fieldEvent `ownSpiritSummoned` に「召喚されたカードの名前に〜を含む」（軸。`subjectNameIncludes`） | fieldEvent の主語絞り込みは `familyFilter`・`colorFilter`・`subjectMinCost` 等まで。nameIncludes が無い（`nameIncludes` は同じ型の別 kind＝`trashSummonOnNameSummoned` 等のみ）。P037 の1つ目は「召喚するとき」で既存 BS13-003 と同じ addSymbolPermanent を使うので、足りないのは名前の絞り込みだけ | P037（2節） |
| N7 | 発生源自身の「合体していない」条件（triggered／aura の condition）（条件の軸） | `whileCombined` は合体している側だけ。aura の `uncombinedFilter` は `ownAll` の対象絞りで、**自分自身が合体していない**ことを条件にする手段が無い（`target:"self"` で効くかは未確認＝実装時に確かめ、効くなら新規部品は不要） | P052 |
| N8 | `canBlockWhileRested` の上限を「このスピリット自身のコア以下」にする相対指定（軸。`targetMaxCostSelf`） | `targetMaxCost` は固定数のみ（BS06-088）。`unblockableBy` に `costAtMostAttacker` という相対指定があり、同じ考え方を足すだけ | P063 |
| N9 | `summonedExhaustGrant` に「対象のコスト下限」と `ownBurstSet` 条件（軸＋条件） | 現状は `condition?: { selfRested: true }` だけで、どの相手スピリットかを絞れない（BS06-060 は全部）。コスト6以上に絞る手段が無い。フェーズ（相手のメインステップ）の指定も持たない | P064 |
| N10 | `unblockableBy` に `minCost`（軸） | `maxCost`・`costNot`・`costIn` はあるが下限が無い。「コスト6以上」を `costIn:[6,7,…]` で並べるのは数を決め打つので避けたい | P078 |
| N11 | `noRestWhenBlocking*` に「相手の Lv1 スピリット」（軸。`noRestWhenBlockingLevel`） | 既存は Color／Cost（max・same）／WithoutKeyword の兄弟3種。Level 軸だけ無い。**兄弟が4種目になるので、足す前に共通の filter 型へ寄せる相談をしたい**（§4-8） | PX02 |

## 3. カードごとの表

| cardId | 節 | 使う器 |
| :-- | :-- | :-- |
| P003 | （バニラ） | ― |
| P007 | Lv1-3 アタック時 マジックの BP+ に重ねて +1000 | `magicBuffBonus` amountBonus:1000 levels[1,2,3]（BS02-075-e2 と同形。`amountBonus` を 3000 から 1000 に変えるだけ。発動場面が「アタック時」見出しなのは BS02-075 と同じ） |
| P008 | Lv2-3 破壊時 系統：爪鳥の自分のスピリット1体を回復 | `triggered` onDestroy ＋ `refresh` filter:{family:"爪鳥"}（BS03-112-e2 の refresh filter family） |
| P015 | Lv2 相手のアタックステップ 空魚すべて BP+1000 | `aura` ownAll familyFilter:"空魚" phaseTurn{attack, opponent}（BS03-034-e1。phaseTurn は BS08-063-e1） |
| P016 | Lv1-2【装甲：緑】 | `keyword` armor colors[green]（BS06-037-e1） |
| P021 | Lv1-3 アタック時 トラッシュから［大龍皇ジークムンド］1枚を手札に | `triggered` onAttack ＋ `moveCards` from trash dest hand pick{name:"大龍皇ジークムンド"}（BS02-072-e1 の pick を cardType から name に。CardPick に `name` あり） |
| P024 | Lv1-3 破壊時 【聖命】持ちが場にいる間は疲労状態で戻る | `reviveOnDestroy` scope self revived{rested:true} ＋ **N1**（condition ownFieldHasKeyword:seimei） |
| P026 | Lv1-3 相手のアタックステップ 甲竜/神将すべて BP+1000 | `aura` ownAll familyFilter:["甲竜","神将"] phaseTurn{attack, opponent}（BS04-029 の familyFilter 配列。BS03-034-e1） |
| P026 | Lv3 ブロック時 ブロックした空牙を手札に戻す | `triggered` onBlock eventTarget:"use" ＋ `return` to hand filter{family:"空牙"}（BS06-044-e2 と同形、levels だけ[3]） |
| P028 | 【合体時】【装甲：白】 | `keyword` armor colors[white] whileCombined（BS10-071-e1 と同形） |
| P033 | 【合体時】バトル時 マジックを使用したら、発揮後に使用マジックのコスト以下の相手スピリット1体を破壊 | `fieldEvent` ownMagicUsed whileCombined ＋ `destroy` count 1 ＋ **N2**（filter）＋ **N3**（condition）。BS13-042-e1 が「発揮後に破壊」の形 |
| P036 | Lv1-2 月光カード名の自分のスピリットすべては相手のブレイヴの効果を受けない | `braveImmuneGrant` target ownAll scope all ＋ **N4**（BS12-028-e2 が colorFilter 版） |
| P036 | 【合体時】Lv2 ブロック時 BP10000以上に破壊されたら、コア1個を払って回復状態で残る | `reviveOnDestroy` scope self whileCombined levels[2] cost{sourceCoresToTrash:1} revived{rested:false} when{byBattle:true} ＋ **N5**（byBattleKillerMinBp）。cost は同じ型に既にある（BS08-063-e2 が when の形） |
| P037 | Lv1-3 自分のメインステップ 月光スピリットを召喚するとき白シンボル2つを追加 | `fieldEvent` ownSpiritSummoned selfMode:"source" ＋ `addSymbolPermanent` count 2 color white（BS13-003-e1）＋ **N6** |
| P037 | 【合体時】Lv3 自分のメインステップ 月光スピリットが召喚されたとき、ボイドからコア1個をライフに | `fieldEvent` ownSpiritSummoned whileCombined ＋ `placeCores` void→life count 1（BS08-066-e1 が void→reserve、BS07-040-e2 が to:"life"）＋ **N6** |
| P041 | 【合体時】【重装甲：赤/紫】 | `keyword` heavyArmor colors[red,purple] whileCombined（BS10-071-e1 の armor を heavyArmor に。BS12-028-e1 が heavyArmor の書き方） |
| P045 | Lv1-2 召喚時 トラッシュのマジック1枚を手札またはデッキの上に | `triggered` onSummon ＋ `chooseActionMode` の2モード（moveCards dest hand／dest deckTop、pick{cardType:magic}）（BS14-091-e2 が chooseActionMode、BS02-072-e1 が pick） |
| P045 | Lv2 お互いのアタックステップ 手札のマジックの軽減シンボルを黄として扱う | `step` attack 開始 turn:both ＋ `timedEffect` content[`playerRule` handReductionColorAsForPid yellow magic] duration:"step"（BS18-059-e1 が playerRule の形。**duration:"step" で手札に後から入るカードにも効くか要確認**） |
| P052 | Lv1-2 ブロック時 バーストをセットしていて合体していなければ BP+4000 | `triggered` onBlock ＋ `timedEffect` bp 4000 duration battle target self ＋ condition ownBurstSet:true ＋ **N7**（BS14-009-e2 が burst 条件の aura） |
| P052 | Lv2 相手のアタックステップ コスト5以下がアタックしたとき回復 | `fieldEvent` anySpiritAttacked costFilter{max:5} turn:opponent selfMode:source ＋ `refresh` target self（BS04-037-e2 と同形で max だけ変える） |
| P053 | Lv2-3 破壊時 バーストをセットしていれば疲労状態で残る | `reviveOnDestroy` scope self revived{rested:true} condition{ownBurstSet:true}（BS15-030-e2 の condition 形＋BS14-071-e1） |
| P056 | バースト：相手による自分のスピリット破壊後 相手のスピリット1体を手札に戻す。その後コストを払えばフラッシュ | `burst` event ownSpiritDestroyed byOpponentEffectOnly ＋ `return` to hand count 1 ＋ `thenPay:"flash"`（BS14-091-e1。「相手による」が効果限定かバトル含みかは §4-5） |
| P056 | フラッシュ：相手のネクサス1つを手札に戻す | `magic` timing flash ＋ `return` to hand nexus:"only" count 1（BS10-089-e1） |
| P063 | バースト：自分のライフ減少後 このスピリットを召喚し、その後このターンの間、自分のスピリットすべてを BP+3000 | `burst` event ownLifeDamaged ＋ `sequence`[`summon` from burst, 「ターン中の自分のスピリットすべて +3000」]（BS14-020-e1 が summon from burst。後半は BS03-145 の `lendSelfThisTurn`＋aura `lentOnly` 形。**後から出るスピリットにも効くか＝§4-4**） |
| P063 | Lv1-3 ブロック時 ボイドからコア1個をこのスピリットに | `triggered` onBlock ＋ `placeCores` void→spirit target self count 1（BS17-024-e1） |
| P063 | Lv2-3 相手のアタックステップ 自身のコスト以下の相手スピリットを疲労状態でブロックできる | `constraint` canBlockWhileRested ＋ **N8**（BS08-029-e2 が固定値でなく keyword 版、BS06-088-e1 が targetMaxCost 固定） |
| P064 | Lv1-3 相手のメインステップ バーストをセットしている間、コスト6以上の相手のスピリットは召喚されたとき疲労 | `summonedExhaustGrant`（BS06-060-e2）＋ **N9** |
| P075 | Lv1-2【氷壁：赤/青】相手の赤/青のマジックを疲労して無効 | `keyword` hyoheki ＋ `magicNegate` cost{exhaustSelf} colors[red,blue] turn:opponent（BS12-032-e1,e2 と同形） |
| P075 | Lv1-2 相手のメインステップ 相手の手札が増えたとき、増えたカード1枚につき相手は手札1枚を破棄 | `fieldEvent` opponentHandAdded phase main ＋ `discard` side opponent count 1 ＋ `countMode`／`repeatPerCount`（BS18-066-e2 が opponentHandAdded→discard。**repeatPerCount が opponentHandAdded で効くか要確認**。効かなければ countMode に枚数を足す程度） |
| P076 | Lv1-3 自分のアタックステップ マジックを使用したら、発揮後に使用マジックのコスト以下の相手スピリット1体を手札に戻す | `fieldEvent` ownMagicUsed phase attack ＋ `return` to hand count 1 ＋ **N2**（BS13-042-e1 が発揮後に破壊） |
| P078 | Lv1-2 緑/白のスピリットがいる間、相手に破壊されたら疲労状態で残る | `reviveOnDestroy` scope self when{byOpponent:true} revived{rested:true} ＋ **N1**（複数色OR） |
| P078 | Lv2 アタック時 赤/紫/青がいる間、コスト6以上の相手にブロックされない | `triggered` onAttack ＋ `constraint` unblockableBy ＋ condition ownFieldHasColorSpirit（複数色）＋ **N10**（minCost）＋ **N1 と同じ複数色OR**（triggered 側の condition は単色 `ownFieldHasColorSpirit: Color` のみ） |
| P079 | メイン：このターンの間、スピリット1体にもう1色好きな色を与える | `magic` timing main ＋ `timedEffect` content[color] duration turn side both（BS02-104-e1 は flash なので timing だけ main に） |
| P079 | フラッシュ：ブロックしている自分のスピリット1体を回復 | `magic` timing flash ＋ `refresh` filter{blocking:true}（BS01-139-e1 が timedEffect で filter blocking。**refresh の filter が blocking を受けるか要確認**） |
| P084 | Lv1-3 自分のアタックステップ このスピリット以外の自分のスピリットすべて BP+2000 | `aura` target:"ownOthers" amount 2000 phaseTurn{attack, own}（`ownOthers` は型にある。BS03-102-e1 が phaseTurn の形） |
| P084 | Lv3 破壊時 手札に戻る | `triggered` onDestroy ＋ `return` target self（BS14-020-e3 と同形） |
| PX02 | Lv1-2 ブロック時 相手の Lv1 をブロックしたとき疲労しない | `constraint` noRestWhenBlocking* ＋ **N11**（BS02-X07-e1 が Color 版） |
| PX02 | Lv2 ブロック時 BP+4000 | `triggered` onBlock eventTarget:"use" ＋ `timedEffect` bp 4000 duration battle target self（BS02-044-e2） |
| PX05 | Lv1-3 召喚時 トラッシュの黄のマジックすべてを手札に | `triggered` onSummon ＋ `moveCards` from trash dest hand count:"all" pick{cardType:magic,color:["yellow"]}（BS03-X11-e2 が count all／BS02-072-e1 が pick） |
| PX05 | Lv2-3 アタック時 自分のマジックすべてをフラッシュタイミングでコストを払わず使用できる | `triggered` onAttack ＋ `magicFreeGrant`（BS15-044-e2 が色・burst で絞った版。色絞りなしで手札のマジックすべて。**同時に何枚使えるか＝§4-6**） |
| PX10 | 【不死：コスト2/3/4】 | `keyword` fushi triggerCosts[2,3,4]（BS09-014-e1。BS09-016-e1 が複数コスト） |
| PX10 | Lv1-3 相手のスピリットの効果で自分のデッキからマジックが破棄されたら、このターンデッキは破棄されない | `fieldEvent` ownDeckMilled byOpponentSpiritEffectOnly ＋ `timedEffect` playerRule noDeckMillForPid duration turn side own ＋ magicPick で絞る（BS17-070-e1 が同じ構成） |
| PX10 | Lv2-3 バトル時 トラッシュ1枚をデッキの下に戻して、相手スピリットのコア2個をリザーブへ | `triggered` onBattleStart ＋ `pay`{cost: moveCards from trash dest deckBottom count 1, then: removeCores target spread count 2}（BS11-075-e1 が pay＋spread、dest deckBottom は moveCards の型にある） |
| PX11 | Lv1-3 召喚時 BP5000以下の相手スピリットすべてを手札に戻し、戻した1体につきボイドからコア1個を自分のリザーブに | `triggered` onSummon ＋ `sequence`[`return` to hand all:true filter{maxBp:5000}, `placeCores` void→reserve countCounter:"lastMoved"]（BS08-X33-e1 が lastMoved、BS08-007-e2 が all＋maxBp。**return が lastMoved を更新するか要確認**） |
| PX11 | Lv1-3 相手のスピリットの効果を受けない | `constraint` immuneToOpponentEffects against spirit（BS14-044-e1） |
| PX11 | Lv2-3【聖命】アタックで相手のライフを減らしたらボイドからコア1個をライフに | `keyword` seimei ＋ `triggered` onLifeDealt ＋ `placeCores` void→life（BS07-040-e1,e2 と同形） |
| PX17 | Lv1-3 相手のスピリットの効果を受けない | `constraint` immuneToOpponentEffects against spirit（BS14-044-e1） |
| PX17 | Lv1-3 相手のアタックステップ開始時 相手のスピリット1体を指定すると、このターンアタックできない | `step` attack turn:opponent optional ＋ `timedEffect` content[cantAttack] duration turn（BS11-030-e1 は filter combined なので filter を外す） |
| PX17 | Lv2-3 アタック/ブロック時 バトル終了時に白のスピリット1体を手札に戻して回復 | `triggered` onBattleEnd eventTarget:"ignore" ＋ `pay`{cost: return to hand side own filter{color white}, then: refresh target self}（BS07-025-e1 が onBattleEnd、BS13-008-e2 が pay＋return＋refresh） |

## 4. 解釈が割れる点

CONJUNCTION.md の早見表と照らした。**自分では決めていない**。

1. **P033・P076「その効果発揮後」**：早見表どおり「マジックの効果を発揮し終えてから（誘発の解決後）」。BS13-042 と同じ扱いで割れない。割れるのは「使用したマジックのコスト」＝軽減や効果税を引く前の印刷コストか、実際に支払ったコストか。候補A：印刷コスト（`lastMagicUsed.cardId` から引ける）／候補B：支払った実コスト。「場にいたときのコスト（増減込み）」の一般則（2026-09-27）はスピリットの話なので、マジックには未確定。影響：P033・P076 の2枚。
2. **P036 の「このスピリット上のコア1個を…トラッシュに置くことで」**：「ことで」＝コストを払えるときだけ発揮（COST_MODEL）。コアが1個のとき（置くと消滅）は払えるか。reviveOnDestroy の `oneCoreToTrash` に2026-08-14確認の裁定あり（払えて、破壊待機の解除後に維持コア割れで消える）。P036 もこれに従う読みが自然だが、1枚ぶんの確認は要る。
3. **P036 の「BPを比べBP10000以上の相手のスピリットに破壊されたとき」**：BS08-063（BP7000以下）と同じ読み（バトルの BP 比較による破壊のみ）。10000 以上の下限は、破壊した側の実効BP（効果で増えた分を含む）で見る読みと、基本BPで見る読みが理論上あるが、BS08-063 は実効BP。同じにする方向で割れない。
4. **P063 バーストの「その後、このターンの間、自分のスピリットすべてをBP+3000」**：「このターンの間〜すべて」は後から出たスピリットにも効く（TEST_STRATEGY §6 の注意点）。候補A：発生源が召喚スピリット自身の効果なので BS03-145 の `lendSelfThisTurn`＋aura（後から出たスピリットにも効く）／候補B：`timedEffect` side own（その時点のスピリットのみ）。「その後」＝Aを完全に解決していなくても B。召喚が維持コア不足で不発でもBP+3000は起きる読みで合っているか。影響：P063 の1枚。
5. **P056 の「相手による自分のスピリット破壊後」**：BS14-091 は `byOpponentEffectOnly:true`（効果による破壊のみ）。「相手による」にバトルでの破壊を含めるか。候補A：効果のみ（BS14-091・BS16-X04 と同じ）／候補B：バトル破壊も含む。印刷の言い回しは同じなので A で揃えるのが自然だが、バースト条件の一般則なのでユーザー確認が要る（既に PROCEDURES に決定があれば従う）。
6. **PX05 の「自分のマジックカードすべてを、フラッシュタイミングでコストを支払わずに使用できる」**：何枚まで使えるか。候補A：このバトル中は手札のマジックを何枚でも／候補B：1枚（BS14-055 は「1枚を」と書いてあるので別）。「すべて」は対象の範囲の話なので A が素直だが、効果期間（そのバトルの間か、アタック時1回の解決中か）が文面にない。影響：PX05 の1枚。また「手元（tegamoto）のマジック」を含むか（`magicFreeUseFromHandOrTegamoto` は手札/手元）。
7. **P045 の「手札にあるマジックカードすべての軽減シンボルすべてを［黄］として扱う」**：BS18-059 は『合体アタック時』で duration:battle。P045 は『お互いのアタックステップ』の継続。ステップ中に手札へ加わったカードにも効くかが割れる。候補A：その時点で手札にあるカードだけ／候補B：ステップ中に手札にあるカードすべて（後入りも）。「手札にある」は状態を指すので B が自然。
8. **P045 の「手札またはデッキの上に戻す」**：誰が選ぶか。候補A：自分（効果の発揮者）が選ぶ／候補B：なし。主語が省略されているので A で割れない。ただし**デッキの上に戻す場合の順序**（1枚なので無関係）。
9. **PX11「この効果で手札に戻したスピリット1体につき」**：BS11-032 の一般則（場にいたときのコスト）はコストの話。ここは**体数**なので、バウンス待機のまま数える（合体スピリットがブレイヴを残す選択をしても体数は1）読みでよいか。ブレイヴを残して手札に戻らなかった場合の数え方（ホスト1体のみ戻る）。影響：PX11。
10. **PX17「相手のスピリット1体を指定できる」**：BS11-030 と同形（任意＋指定）。「指定されたスピリットはアタックできない」を**そのターンの間**で書く。指定後に別のステップでも効くか（`duration:"turn"` で足りる）。割れない。
11. **PX17「バトル終了時、自分の白のスピリット1体を手札に戻すことで」**：自分自身も候補に含むか。含めると自分を戻したあと回復する対象がいない（「ことで」＝両方を完全に解決できるときだけ発揮なので自分を選ぶと不発）。候補A：自分も選べるが選ぶと不発扱い／候補B：自分以外のみ。文面は「自分の白のスピリット1体」で自分を除いていないので A が忠実。影響：PX17（BS13-008 は `excludeSelf:true`＋「地竜」と別系統）。
12. **P075 の「増えたカード1枚につき、相手は、相手の手札1枚を破棄する」**：同時に2枚増えたら2枚破棄（1枚ずつ繰り返す）。誰が選ぶかは「相手は」＝相手が選ぶ（CHOOSER_RULES）で割れない。1回の増加イベントでまとめて処理するか、増えた1枚ごとに分けるかだけ。BS18-066-e2 は1回につき1枚。

### この調査で見つけた統一の候補（相談したい）

- **N1 と N4 と N10 と N11 はいずれも「ある器の絞り込み軸が、兄弟の器にだけ無い」**。reviveOnDestroy／triggered／fieldEvent／summonedExhaustGrant／unblockableBy／constraintGrant で、色・名前・キーワード・コストの絞り込みがそれぞれ別に定義されている。1枚ずつ足す前に、共通の `SubjectFilter`（色・系統・名前・キーワード・コスト帯・Lv）を1つ決めて各器が参照する形にできるか相談したい（設計の2原則の1）。
- **noRestWhenBlocking 系は兄弟が3種（Color／Cost／WithoutKeyword）で、PX02 が4種目**。足す前に「`noRestWhenBlocking` ＋ 相手の絞り込み filter」へ寄せる案を出したい。
