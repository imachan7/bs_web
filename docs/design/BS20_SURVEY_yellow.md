# BS20 調査メモ：yellow（調査役）
対象：BS20-037, 038, 039, 040, 041, 042, 043, 044, 045, 063, 064, 071, 081, 082, X05, X08（BS20-074 は取り込み済みのため除外）。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数（カードごとの表の行数。連鎖は「連鎖元」と「連鎖」で別行）：**30**
- 既存の器で書ける：**28**
- 新しい部品が要る：**2**（§2 の #1・#2）
- 連鎖の節：**3**（045・063・082。いずれも条件《紫シンボル》×1）
- 強化の節：**6**（037・038・039・X05・X08×2。すべて黄の「BP-効果」−1000）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | triggered の「フラッシュタイミングで使う」軸（種別：タイミング） | 既存の triggered onAttack はアタック宣言の瞬間に自動発火する（BS19-053-e1 は `trigger:"onAttack"` の即時発火）。activated／magicFreeGrant（BS19-053-e2 は `condition:"selfInBattle"` だがマジックカード専用）を確認したが、「このスピリットのアタック時だが、そのバトルのフラッシュタイミングで使う」を書ける器は無い | BS20-041 Lv1 |
| 2 | reviveOnDestroy.cost の色軸（種別：コストの軸） | cost の既存の軸を effectDefTrigger.ts:340-357 で確認したところ `exhaustOwnFamilyOne`（系統）・`exhaustOwnSameFamilyOne`（自身と同じ系統）はあるが「自分の黄のスピリット1体を疲労させる」の色指定が無い | BS20-044 Lv1 |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-037 | 強化（黄） | keyword kyoka bpMinus（BS19-052-e1。効果文「自分の「BP-効果」を-1000する。」と同じ形） |
| BS20-038 | 強化（黄） | 同上（BS19-052-e1） |
| BS20-039 | Lv1-3：コスト3以下の自分のスピリットすべて、相手の効果で破壊されたとき疲労状態で残ることができる | reviveOnDestroy scope ownAll filter cost max 3 when byOpponentEffect optional revived rested（BS18-044-e3。効果文「相手によって破壊されたとき、疲労状態でフィールドに残ることができる」の JSON `{"kind":"reviveOnDestroy","scope":"ownAll","when":{"byOpponent":true},"revived":{"rested":true},"optional":true}` と同じ形。byOpponentEffect は BS18-038-e1 の `when:{byOpponent:true}` に対し効果限定にする軸も既存） |
| BS20-039 | 強化（黄） | BS19-052-e1 |
| BS20-040 | （効果なし・バニラ） | なし |
| BS20-041 | Lv1-3：フラッシュ『このスピリットのアタック時』手札1枚破棄でBP-1000 | **新部品 #1**（タイミング）。中身は pay（BS15-014-e2。効果文「自分の手札1枚を破棄することで、疲労状態の相手のスピリット1体を破壊する。」の `{"type":"pay","cost":{"type":"moveCards","from":"hand","dest":"trash","count":1},"then":{...}}` と同じ形）＋ bpMinus amount 1000（SD15-003-e1） |
| BS20-041 | Lv2-3『お互いのアタックステップ』相手のスピリットがBP0になったときBP0のスピリットすべてを破壊 | fieldEvent opponentSpiritBpReachedZero（BS19-091-e1。効果文「相手のスピリットがターンで初めてBP0になったとき、自分はデッキから1枚ドローする。」の `{"kind":"fieldEvent","event":"opponentSpiritBpReachedZero",...}` と同じイベント）＋ destroy all filter maxBp 0 |
| BS20-042 | Lv1-3：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-015-e1。効果文「お互いのデッキは破棄されない。」の `{"kind":"globalConstraint","constraint":{"type":"noDeckMill"}}` と同じ形） |
| BS20-042 | Lv1-3『このスピリットのアタック時』BP-2000 | triggered onAttack ＋ bpMinus（BS19-053-e1。効果文「このターンの間、相手のスピリット1体をBP-2000する。」の `{"kind":"triggered","trigger":"onAttack","action":{"type":"bpMinus","amount":2000,"count":1}}` と同じ形） |
| BS20-043 | Lv1-2：系統「想獣」が相手によって破壊されたときドロー | fieldEvent ownSpiritDestroyed subjectFilter family byOpponentOnly ＋ draw（BS16-038-e1。効果文「相手によって系統：「四道」を持つ自分のスピリットが破壊されたとき、自分はデッキから1枚ドローする。」の `{"kind":"fieldEvent","event":"ownSpiritDestroyed","subjectFilter":{"family":"四道"},"byOpponentOnly":true,"action":{"type":"draw","count":1}}` と同じ形） |
| BS20-044 | Lv1-2『このスピリットの破壊時』黄のスピリット1体を疲労させることで残る | reviveOnDestroy scope self optional revived rested ＋ **新部品 #2**（cost の色軸。疲労コストの器自体は BS13-036-e1 の `cost:{ownLifeOneToReserve:true}` と同じ位置） |
| BS20-044 | 【合体時】Lv2-3『このスピリットのアタック/ブロック時』BP-3000 | triggered onAttack whileCombined ＋ bpMinus（BS19-053-e1 に whileCombined を付ける形。whileCombined は effectDefTrigger.ts:26 等）と triggered onBlock whileCombined ＋ bpMinus の2エントリ（onAttack と onBlock を1節にまとめる器は無いが2エントリで書ける） |
| BS20-045 | Lv1-2『このスピリットのアタック時』コスト5/6以外からブロックされない | triggered onAttack ＋ timedEffect unblockable duration battle（BS10-073-e1。効果文「このターンの間、自分のスピリットすべては、Lv2の相手のスピリットからブロックされない。」の `{"type":"timedEffect","content":[{"type":"unblockable","opponentOnly":true,"from":{"level":[2]}}],"duration":"turn"}` と同じ形。cost notIn は targetFilter.ts:27 に既存） |
| BS20-045 | 連鎖（条件 紫×1）／中身：相手のスピリットのコア2個を相手のトラッシュに | 連鎖の枠：sequence＋if ownColorSymbols purple atLeast 1（BS19-010-e2。効果文「[紫]：相手のスピリットのコア2個を…」と同じ連鎖構造 `{"type":"sequence","actions":[連鎖元,{"type":"if","cond":{"count":{"ownColorSymbols":"purple"},"atLeast":1},"then":{...}}]}`。中身の removeCores to trash も BS19-010-e2 の `{"type":"removeCores","to":"trash","target":"spread","count":7,"chooser":"owner"}` と同じ形（count 2） |
| BS20-045 | Lv2【聖命】『このスピリットのアタック時』 | keyword seimei ＋ triggered onLifeDealt placeCores void→life（BS11-037-e1/e2。効果文「このスピリットのアタックによって相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く。」の `{"kind":"keyword","keyword":"seimei"}＋{"kind":"triggered","trigger":"onLifeDealt","action":{"type":"placeCores","from":"void","to":"life","count":1}}` と同じ形） |
| BS20-063 | 【合体時】『このスピリットの合体アタック時』Lv1の相手からブロックされない | triggered onAttack whileCombined ＋ timedEffect unblockable from level [1] duration battle（BS10-073-e1/e2 の合成。e2 は `{"kind":"triggered","trigger":"onAttack","whileCombined":true,"action":{"type":"timedEffect","content":[...],"duration":"battle"}}` と同じ形） |
| BS20-063 | 連鎖（条件 紫×1）／中身：相手のフィールドのコア1個を相手のリザーブに | 連鎖の枠：BS19-098-e1（マジックの連鎖。効果文「[紫]：疲労状態のコスト4以下の相手のスピリット1体を破壊する。」の `{"kind":"magic","timing":"flash","keyword":"rensa","action":{"type":"sequence","actions":[連鎖元,{"type":"if","cond":{"count":{"ownColorSymbols":"purple"},"atLeast":1},"then":{...}}]}}` と同じ形）。中身の removeCores は BS18-075-e2 の `{"type":"removeCores","target":"all","filter":{"cost":{"max":5}},"count":1}`（to 省略＝リザーブ）と同じ形 |
| BS20-064 | Lv1『このブレイヴの召喚時』手札の【強化】持ち黄スピリットを無償召喚 | triggered onSummon ＋ summon from hand keywordFilter kyoka colorFilter yellow（BS17-X06-e1。効果文「自分の手札にある系統：「雄将」を持つスピリットカード1枚を、コストを支払わずに召喚できる。」の `{"kind":"triggered","trigger":"onSummon","action":{"type":"summon","from":"hand","familyFilter":"雄将"}}` と同じ形。summon の keywordFilter・colorFilter は effectAction.ts:162 に既存） |
| BS20-071 | Lv1-2『自分のアタックステップ』天霊のアタックでライフを減らしたときドロー | fieldEvent ownSpiritDealtLife subjectFilter family 天霊 ＋ draw（fieldEvent.ts:48「自分のスピリットのアタックによって相手のライフを減らしたとき、self にはライフを減らしたスピリットが渡る」。subjectFilter の使い方は BS19-091-e2 と同じ） |
| BS20-071 | Lv2：【強化】持ちが相手によって破壊されたとき、このネクサスを疲労させることで残す | reviveOnDestroy scope ownAll keywordFilter kyoka when byOpponentEffect optional revived rested ＋ cost exhaustSelf（keywordFilter は effectDefTrigger.ts:323 に既存。コストの位置は BS15-063-e2 の `cost:{handDiscardOne:true}` と同じ。exhaustSelf は effectDefTrigger.ts:341 に既存。§4 の確認点あり） |
| BS20-081 | フラッシュ：このターンの間、相手のスピリット1体のシンボルを0にする | timedEffect content symbolLoss duration turn（timedContent.ts:31「指定した色のシンボルを1つ失う」。§4 の確認点あり） |
| BS20-081 | この効果は、メインステップで使えない | castRestriction notInMainStep levels null（effectDefContinuous.ts:18-22「メインステップ中の使用だけを禁止」） |
| BS20-082 | フラッシュ：このターンの間、BP-3000 | magic timing flash ＋ bpMinus（BS19-053-e1 と同じ bpMinus。マジックの枠は BS19-098-e1） |
| BS20-082 | 連鎖（条件 紫×1）／中身：疲労状態のBP5000以下の相手のスピリット1体を破壊 | 連鎖の枠：BS19-098-e1 と同じ形。中身の destroy filter rested maxBp も BS19-098-e1 の `{"type":"destroy","count":1,"filter":{"rested":true,"cost":{"max":4}}}` と同じ形（maxBp 5000） |
| BS20-X05 | Lv1-3『自分のアタックステップ』天霊がアタックしたときBP-3000 | fieldEvent anySpiritAttacked subjectSide own subjectFilter family 天霊 ＋ bpMinus（fieldEvent.ts:14「両陣営どちらかのスピリットがアタックを宣言したとき（self はアタックしたスピリット）」。subjectSide の使い方は anySpiritReturnedToHand のコメントと同じ） |
| BS20-X05 | Lv2-3『このスピリットのアタック時』BP0になったスピリットすべてをデッキの上に戻すことができる | fieldEvent opponentSpiritBpReachedZero（BS19-091-e1 と同じイベント）＋ return to deckTop all filter maxBp 0（effectAction.ts:80 `{"type":"return","to":"deckTop",...,"all":true,"filter":...}`） |
| BS20-X05 | Lv3 強化（黄） | BS19-052-e1 |
| BS20-X08 | Lv1 強化（黄） | keyword kyoka bpMinus（BS19-052-e1）。「アルティメット以外の」の限定は §4 参照 |
| BS20-X08 | 【合体中】強化（黄） | 同上 ＋ whileCombined（BS19_PLAN §3.1「ラベルでも whileCombined のものは合体中だけ」） |
| BS20-X08 | 【合体中】『このスピリットのアタック時』BP-3000 | triggered onAttack whileCombined ＋ bpMinus（BS19-053-e1 に whileCombined） |
| BS20-X08 | 【合体中】その相手のスピリットがターンで初めてBP0になったとき、このスピリットは回復する | fieldEvent opponentSpiritBpReachedZero bySelfEffectOnly oncePerTurn ＋ refresh self（bySelfEffectOnly は effectDefTrigger.ts:215「発生源自身の効果でBP0になったときだけ発火」、oncePerTurn は BS19-091-e1 と同じ） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
- **BS20-041 Lv1「フラッシュ『このスピリットのアタック時』」**：フラッシュタイミングの範囲が読めない。(a) このスピリットのアタックによるバトル中のフラッシュタイミングであればいつ使える (b) アタック宣言直後のフラッシュタイミング1回だけ。既存データに「フラッシュ『このスピリットのアタック時』」の例は無く、新部品 #1 の仕様とセットで決める必要がある。また「手札1枚を破棄することで」は pay（BS15-014-e2 と同じ）だが、手札0枚のときに効果全体が発動しないのか選択自体が出ないのかも処理の順として要確認
- **BS20-041 Lv2「BP0になったスピリットすべてを破壊する」**：(a) この誘発で0に到達した個体のみ (b) 解決時点でフィールドにいるBP0のスピリットすべて。X05 Lv2 の「デッキの上に戻す」も同じ読みの分かれを持つ
- **BS20-044 Lv1「自分の黄のスピリット1体を疲労させることで」**：疲労させる個体を誰が選ぶか（既存の cost 軸は「実効BP最小を選ぶ簡略化」等の自動選択が多い）。新部品 #2 とセットで決める。また疲労させる個体がいない（すべて疲労済み）ときの不発も確認が要る
- **BS20-044【合体時】『このスピリットのアタック/ブロック時』**：BP-3000 は (a) そのバトルの間 (b) このターンの間。効果文は「このターンの間」と書いており (b) が素直な読みだが、onAttack と onBlock の2エントリに分けたとき同じ対象に重ならないか（重なっても BP-は累積する）も要確認
- **BS20-045 Lv1-2「コスト5/6以外のスピリットからブロックされない」**：(a) このアタックのバトルの間だけ（BS19_PLAN §2.2 の064と同じ読み） (b) このターンの間。効果文に『このスピリットのアタック時』とあるので (a) を想定したが、BS10-073-e1 は duration:"turn" で書かれており、器上は両方書ける
- **BS20-071 Lv2「このネクサスを疲労させることで」**：reviveOnDestroy.cost の exhaustSelf はスピリット発生源の実績しか無い。ネクサス発生源で exhaustSelf が機能するか（effectDefTrigger.ts:313 の ownNexus コメント「破壊待機状態では疲労できずコストが払えない」と同じ制約が効かないか）は実装時に確認が要る。またこのネクサスが疲労済みのときは不発でよいか
- **BS20-081「相手のスピリット1体のシンボルを0にする」**：symbolLoss は「1つ失う」器。(a) シンボル2つ持ち（ダブルシンボル等）もすべて0にするのか (b) 1つだけ失うのか。効果文は「0にする」なので (a) の可能性が残る
- **BS20-X05 Lv2「デッキの上に戻すことができる」**：任意（optional）だが、複数体戻すときの順番（orderedIds）を誰が選ぶか。また「戻すことができる」の確認を出す時点（破壊と違い fieldEvent の確認待ちの既存形に合わせる）
- **BS20-X08（ソードブレイヴ）**：
  - 「アルティメット以外の自分の「BP-効果」を-1000する」：エンジンにアルティメットは存在しない（server/src/types に ultimate の型が無い）。現状は BS19-052-e1 と同じで書けるが、将来アルティメットを足すとき kyoka に範囲の軸が要る。効果文からは「アルティメットがいる場合に自分のBP-効果のうちアルティメットへの分だけ除外する」ことしか読めない
  - 【合体中】の印がブロック全体（BP-3000 と「ターンで初めてBP0」の回復の両方）に掛かるのか、直後の【強化】行だけか。効果文の並びからは両方に掛かると読めるが、回復の節を別エントリに分けたとき whileCombined を付けるかは決められない
  - 効果文から読み取れるソードブレイヴの通常ブレイヴとの違いは、(1)【合体時】ではなく【合体中】という表記（whileCombined と同じ読み）、(2)「アルティメット以外」の限定、の2点のみ。ほかに専用ルールがあるかは効果文からは決められない
