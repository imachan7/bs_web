# BS20 調査メモ：purple（調査役）
対象：BS20-010, 011, 012, 013, 014, 015, 016, 017, 018, 057, 058, 068, 075, 076, X02, X07。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：30（効果なしの BS20-010 を除く15枚）
- 既存の器で書ける：25
- 新しい部品が要る：5（016 連鎖[赤]／017 合体時／058 連鎖[赤]／X02 破壊時の条件付き残留／X07 バトル時）
- 連鎖：6節（012・015・016・058・075・X02。すべて条件《赤シンボル》×1）
- 強化：1節（018。紫＝コア除去）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | アタック対象の指定（アクション。このバトルの間、指定した相手スピリットにアタックしたものとして扱う／そのスピリットがブロックしなければならない） | 「〜を指定してアタックできる」の常在版は `constraint canDirectAttack`（constraintDef.ts:25。手本 BS19-068-e2 は【合体時】の常在で `{"type":"canDirectAttack","targetFilter":"any","targetMinBp":7000}`）。しかし 016・058 は『アタック時』の連鎖として**このバトルの対象を決める**効果で、constraint は常在用。`designate`（effectAction.ts:194）は recordTargets 用、`mustBeAttackTarget`（constraintDef.ts:19）は相手側の常在で、どちらも「発動したアタックの対象を指定する」にはならない | 016（連鎖[赤]）、058（連鎖[赤]） |
| 2 | fieldEvent「相手のスピリットのコアが自分の効果で0個になった」（タイミング軸） | fieldEvent.ts の FieldEvent 一覧にコア0個到達のイベントが無い（`opponentSpiritBpReachedZero` はBP用）。`IfCond lastEmptied`（effectAction.ts:44）は同一効果の sequence 内の直後判定だけ（手本 BS19-070-e1）で、017 は『自分のアタックステップ』の間ずっと自分の**任意の**効果を監視する常在 | 017（【合体時】Lv2-3） |
| 3 | reviveOnDestroy の条件「直前の自分の効果で破棄したカードがスピリットカード」（条件の軸） | reviveOnDestroy の `condition` は opponentFieldSymbolColorsAtLeast 等の固定セット（effectDefTrigger.ts）で、自分の『破壊時』効果の結果を参照できない。「フィールドに残る」は action ではなく kind:reviveOnDestroy でしか書けないため、`if cond {last:{cardType:"spirit"}}`（BS19-X02-e3 が action 内で使用）を組み合わせることもできない | X02（Lv2-3 破壊時） |
| 4 | pay の cost「このスピリットのブレイヴ（発生源自身のブレイヴ）を破壊する」（アクション／コスト軸） | `cost:{type:"destroy"}`（手本 BS13-X02-e1 `{"type":"pay","cost":{"type":"destroy","side":"own","count":1,"filter":{"family":"星魂"}}}`）は TargetFilter で対象を絞るが、targetFilter.ts に「発生源の合体ブレイヴ」軸が無い（excludeSelf はあるがブレイヴ側の軸は無い）。`destroyBrave`（effectAction.ts:155）は**相手の**合体スピリットのブレイヴ専用 | X07（【合体時】バトル時） |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-010 | （効果なし） | ― |
| BS20-011 | Lv1-2 破壊時：ドロー1 | triggered onDestroy + draw（BS11-009-e1。効果文「Lv1･Lv2『このスピリットの破壊時』自分はデッキから1枚ドローする。」と同じ形） |
| BS20-012 | Lv1-2 召喚時：ドロー1 | triggered onSummon + draw（BS19-014-e1 の連鎖元。`{"type":"draw","count":1}`） |
| | 連鎖（条件 赤×1）[赤]：相手のネクサス1つ破壊 | sequence + if ownColorSymbols red atLeast 1 + destroy nexus only（BS05-054-e1。効果文「相手のネクサス1つを破壊する」→ `{"type":"destroy","nexus":"only","count":1}` と同じ形） |
| BS20-013 | Lv1-3 常在：コスト3以下の自分スピリットすべて、相手の効果で破壊されたとき疲労状態で残ることができる | reviveOnDestroy scope ownAll + filter cost max3 + when byOpponentEffect + revived rested + optional（BS06-087-e2。効果文「自分の黄のスピリットすべては…疲労状態でフィールドに残ることができる」→ `{"kind":"reviveOnDestroy","scope":"ownAll","filter":{"color":"yellow"},"when":{...},"revived":{"rested":true}}` と同じ形） |
| | Lv2-3 ブロック時：相手スピリット1体のコアを1個だけになるように相手のリザーブへ | triggered onBlock + removeCores target one / count all / leaveAtLeast 1（BS14-022-e2。効果文「相手のスピリット2体のコアを、それぞれ1個ずつになるように相手のリザーブに置く」→ `{"type":"removeCores","targets":2,"count":"all","leaveAtLeast":1}` と同じ形） |
| BS20-014 | Lv2-3 アタック時：トラッシュの【連鎖】持ちスピリットカード1枚回収 | triggered onAttack + moveCards trash→hand pick cardType spirit keyword rensa（SD17-011-e1。効果文「自分のトラッシュにある【連鎖】を持つスピリットカード1枚を手札に戻す。」→ `{"type":"moveCards","from":"trash","count":1,"dest":"hand","pick":{"cardType":"spirit","keyword":"rensa"}}` と同じ形） |
| BS20-015 | Lv2 アタック時：疲労状態の相手合体スピリット1体破壊 | triggered onAttack + destroy filter rested combined（P050-e1。効果文「疲労状態の相手の合体スピリット1体を破壊する。」→ `{"type":"destroy","count":1,"filter":{"rested":true,"combined":true}}` と同じ形） |
| | 連鎖（条件 赤×1）[赤]：ドロー1 | sequence + if ownColorSymbols red + draw（BS19-014-e1 の連鎣の if の形） |
| BS20-016 | Lv1-3 アタック時：相手スピリットのコア1個を相手のリザーブへ | triggered onAttack + coreRemove count 1（BS19-015-e1。効果文「相手のスピリットのコア1個を相手のリザーブに置く。」→ `{"type":"coreRemove","count":1}` と同じ形） |
| | 連鎖（条件 赤×1）[赤]：相手スピリット1体を指定しそのスピリットにアタックできる | **新部品 #1**（§4参照） |
| BS20-017 | Lv1-3 召喚時：トラッシュのブレイヴカード1枚回収 | triggered onSummon + moveCards trash→hand pick cardType brave（SD17-011-e1 の pick を brave に変える形） |
| | Lv1-3 アタック時：相手スピリットのコア1個を相手のリザーブへ | triggered onAttack + coreRemove count 1（BS19-015-e1） |
| | 【合体時】Lv2-3 自分のアタックステップ：自分の効果で相手のコアが0個になったときこのスピリット回復 | **新部品 #2**（fieldEvent + refresh。refresh は BS19-013-e1 の連鎖 `{"type":"refresh","count":1,"filter":{"excludeSelf":true}}` の形） |
| BS20-018 | Lv1-2 強化（紫） | keyword kyoka coreRemove（BS19-017-e1。効果文「Lv2･Lv3【強化】自分の「コア除去効果」でリザーブに置くコアを+1個する。」→ `{"kind":"keyword","keyword":"kyoka","kyoka":"coreRemove","levels":[2,3]}` と同じ形） |
| | Lv2 アタック時：相手スピリットのコア1個を相手のリザーブへ | triggered onAttack + coreRemove count 1（BS19-015-e1） |
| BS20-057 | 【合体時】合体アタック時：相手スピリットのコア1個を相手のリザーブへ | triggered onAttack whileCombined + removeCores from spirit to reserve count 1（P030-e1。効果文「【合体時】『このスピリットの合体アタック時』…コスト4以下の相手のスピリットのコア1個を相手のリザーブに置く。」→ `{"type":"removeCores","from":["spirit"],"to":"reserve","count":1,...}` と同じ形。057 はコスト条件なし） |
| BS20-058 | 【合体時】アタック時：相手スピリット1体のコアを1個だけになるように相手のリザーブへ | triggered onAttack whileCombined + removeCores target one / count all / leaveAtLeast 1（BS14-022-e2 と同じ形） |
| | 連鎖（条件 赤×1）[赤]：相手スピリット1体を指定してアタックできる | **新部品 #1**（§4参照） |
| BS20-068 | Lv1-2 常在：自分の紫スピリットすべて BP+1000 | aura bp target ownAll filter color purple amount 1000（BS09-057-e1。効果文「【不死】を持つ自分のスピリットすべてをBP+1000する。」→ `{"kind":"aura","aura":{"type":"bp","target":"ownAll","keywordFilter":"fushi","amount":1000}}` と同じ形。keywordFilter を color 軸に替える） |
| | Lv2 相手のアタックステップ：BP6000以下の相手スピリットのアタック時、相手は相手スピリットのコア1個を相手のトラッシュへ | fieldEvent anySpiritAttacked phase attack turn opponent subjectSide opponent + subjectFilter maxBp 6000 + removeCores to trash count 1（BS11-063-e1。効果文「相手のスピリットがアタックしたとき、相手は、相手のスピリットのコア1個を相手のリザーブに置く。」→ `{"kind":"fieldEvent","event":"anySpiritAttacked","phase":"attack","turn":"opponent","subjectSide":"opponent","action":{"type":"removeCores","count":1}}` と同じ形。068 は to:"trash" と subjectFilter を足す） |
| BS20-075 | メイン：このターンの間、コスト4以上の自分スピリットすべての色を無いものとして扱う | magic timing main + timedEffect content colorless duration turn all true filter cost min4（BS13-015-e3。効果文「アタックしている【呪撃】/【不死】を持つ自分のスピリットすべての色を無いものとして扱う」→ `{"type":"timedEffect","content":[{"type":"colorless"}],"duration":"battle","target":"self"}` と同じ content。duration を turn に） |
| | 連鎖（条件 赤×1）[赤]：相手のネクサス1つ破壊 | sequence + if ownColorSymbols red + destroy nexus only（BS05-054-e1 と同じ形） |
| | フラッシュ：このターンの間、スピリット1体 BP+2000 | magic timing flash + timedEffect bp 2000 duration turn（BS19-101-e2。効果文「このターンの間、スピリット1体をBP+2000する。」→ `{"type":"timedEffect","content":[{"type":"bp","amount":2000}],"duration":"turn","side":"both"}` と同じ形） |
| BS20-076 | メイン：このターンの間、自分スピリットが相手によって破壊されたとき相手スピリットのコア2個を相手のリザーブへ | magic timing main + lendSelfThisTurn + fieldEvent ownSpiritDestroyed lentOnly + byOpponentOnly + removeCores count 2 to reserve（BS10-101。効果文「このターンの間、【不死】を持つ自分のスピリットが破壊されたとき、相手は、相手のスピリット1体を破壊する。」→ `{"type":"lendSelfThisTurn"}` + `{"kind":"fieldEvent","event":"ownSpiritDestroyed","lentOnly":true,...}` と同じ形。§4参照） |
| | フラッシュ：このターンの間、スピリット1体 BP+3000 | magic timing flash + timedEffect bp 3000 duration turn（BS19-101-e2 と同じ形） |
| BS20-X02 | Lv1-3 アタック時：疲労状態のコスト7以下の相手スピリット1体破壊 | triggered onAttack + destroy filter rested cost max7（BS09-X36-e2。効果文「疲労状態のコスト4以下の相手のスピリット1体を破壊する。」→ `{"type":"destroy","count":1,"filter":{"rested":true,"cost":{"max":4}}}` と同じ形） |
| | 連鎖（条件 赤×1）[赤]：相手は可能ならば必ずブロックする | sequence + if ownColorSymbols red + timedEffect content mustBlock duration battle target self（timedContent.ts:15 `{"type":"mustBlock"}`「期間は battle」。手本は【激突】の宣言と mustBlockGrant） |
| | Lv2-3 破壊時：相手の手札1枚を破棄。スピリットカードを破棄したとき回復状態で残る | 破棄は discard from hand side opponent count 1 random（BS19-084-e1。効果文「自分は、相手の手札1枚を破棄する。」→ `{"type":"discard","from":"hand","side":"opponent","count":1,"random":true}` と同じ形）。残留は **新部品 #3**（§4参照） |
| BS20-X07 | 【不死：無魔】お互いのアタックステップ | keyword fushi triggerFamilies 無魔（BS13-014-e1。効果文「トラッシュにあるこのスピリットカードは、系統：「妖蛇」を持つ自分のスピリットが破壊されたとき召喚できる。」→ `{"kind":"keyword","keyword":"fushi","triggerFamilies":"妖蛇"}` と同じ形） |
| | 【合体時】バトル時：このブレイヴを破壊することで、相手は相手のスピリット1体を破壊する | triggered onBattleStart whileCombined（type.ts「勝敗を問わない『このスピリットのバトル時』はこちら」）+ pay。then 側は destroy count 1 chooserIsTarget true（BS10-101-e2。効果文「相手は、相手のスピリット1体を破壊する。」→ `{"type":"destroy","count":1,"chooserIsTarget":true}` と同じ形）。cost 側は **新部品 #4** |

## 4. 効果文から決められない点
- **016・058 連鎖[赤]「相手のスピリット1体を指定し、そのスピリットにアタックできる」**：『アタック時』の連鎖として解決するが、アタックの対象はアタック宣言の時点で決まっている。読みが2通りある：(a) このバトルの対象を指定したスピリットに変える（＝そのスピリットがブロックしなければライフを減らせる）、(b) 単に「ブロックできるのはそのスピリットだけ」。常在版の手本 BS19-068（constraint canDirectAttack）はアタック宣言前に効く常在で、状況が違う。処理の順（連鎖の解決時点で対象を確定するのか）も要確認
- **X02 破壊時「この効果でスピリットカードを破棄したとき、このスピリットは回復状態でフィールドに残る」**：復活の判定を『破壊時』効果（ランダム破棄）の解決**の後**に出す必要があるが、reviveOnDestroy の確認は破壊確定の時点で出る実装になっている可能性がある（BS19-X02 の cost discardUnderOne は確認時の支払いで、順序が逆）。破棄結果を見てから「残るかどうか」を決めるのか、残る前提で確認を出すのか
- **076 メイン「自分のスピリットが相手によって破壊されたとき」**：「相手によって」を byOpponentOnly（相手の効果＋バトルのBP比較。effectDefTrigger.ts の 2026-09-07 確認の定義）で取るか、byOpponentEffectOnly（効果のみ）で取るか。このマジックは相手ターンに使う前提だが、バトル破壊を含めるかで発火範囲が変わる
- **068 Lv2「相手は、相手のスピリットのコア1個を相手のトラッシュに置く」**：行き先がトラッシュ（リザーブに戻らない）なので、どのスピリットから置くかの選択を相手がする（「相手は、」の主語）。手本 BS11-063 はリザーブ行きで同じ文だが、removeCores の対象選択の既定が持ち主側の選択になっているか要確認
- **013「疲労状態でフィールドに残ることができる」**：「ことができる」＝任意（optional）。手本 BS06-087-e2 と同じ形だが、BS06-087 は byBattle（バトル限定）で 013 は「相手の効果で破壊されたとき」＝byOpponentEffect。破壊の理由の範囲（相手の効果のみか、バトルも含むか）は効果文のとおり効果のみ
- **X07 ソードブレイヴ（BS20-X07。系統「剣刃」）**：効果文から読み取れる違いは、(1) ブレイヴでありながら【不死】を持つ（手本 BS13-014 はスピリット）、(2) 合体条件がコスト5以上、(3)『バトル時』の効果が【合体時】限定、の3点。それ以外のソードブレイヴ固有ルール（召喚制限・合体時の特別扱い等）は効果文に書かれておらず、ここからは決められない
- **X07「このブレイヴを破壊することで」**：「〜することで」＝任意発動（optional）。破壊するのは合体中のこのブレイヴ自身（スピリット状態では発動できない＝whileCombined で表現）。破壊したブレイヴはトラッシュへ行く（コアは合体スピリットに残るか、ブレイヴのコア扱いは要確認）
