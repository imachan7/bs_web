# BS20 調査メモ：blue（調査役）
対象：BS20-046, 047, 048, 049, 050, 051, 052, 053, 054, 065, 066, 072, 083, 084, X06。実装はしていない。
（BS20-074 シャイニングフレイムは取り込み済みのため対象外）

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の総数：28（連鎖の行5つ・強化の行1つを含む。046 は効果なしで0節）
- 既存の器で書ける：24
- 新しい部品が要る：4（054 アタック時・065・072 Lv2・X06 Lv1）
- 連鎖を持つカード：5（049・053・066・083・X06。いずれも条件《緑シンボル》×1）
- 強化を持つカード：1（054。青＝デッキ破棄+1枚）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | reviveOnDestroy の cost に `destroyOwnNexusOne`（種別：コストの軸） | 「場に残る」は `reviveOnDestroy`（effectDefTrigger.ts:313）だが、cost の列挙（effectDefTrigger.ts:341 付近）には自分のネクサスを破壊する軸が無い。`exhaustOwnNexusOne` は疲労のみで破壊ではない。`destroyNexusCommit` はアクションであり破壊待機のコストには置けない | BS20-065 |
| 2 | triggered 等の pay cost に `exhaustOwnSpiritOne`（TargetFilter 付き。種別：コストの軸） | 「疲労させることで回復」は `pay`（cost exhaust）→ `refresh` の形（BS19-032-e2 と同じ）。しかし cost の疲労軸は `exhaustOwnFamilyOne`（系統のみ）で、TargetFilter の `keyword`（絞り込み：強化を持つ）と名前除外（[戦騎将パトロクロス]以外）を同時に書けない。TargetFilter 自体（targetFilter.ts:30/75）に軸はあるが cost 側から参照できない | BS20-054 |
| 3 | globalConstraint `attackEffectCost`（相手のアタックしたスピリットの『アタック/バトル時』効果すべての発揮に、リザーブ→トラッシュ1個の支払いを要求。種別：条件の軸） | `blockCost`（timedContent.ts:47）はブロック時専用。`attackRequiresCoreToll`（globalConstraint.ts:108）と `attackPayToll`（:107）は「アタックできない」ための通行料で、アタックはできて効果の発揮だけを制限する軸が無い。`triggerSuppression` は無条件に止めるのみ | BS20-072 |
| 4 | globalConstraint `burstOnlyOpponentFieldSymbolColors`（発生源の持ち主から見た相手は、その相手のフィールドにあるシンボルと同じ色のバーストしか発動できない。種別：条件の軸） | `noBurstActivationByColor`（globalConstraint.ts:111）は固定色の禁止リストで、色が「相手の場のシンボル」で動的に決まる書き方ができない。`magicOnlyOwnFieldSymbolColors`（BS19-112-e2）はマジック用でバーストの軸が無い | BS20-X06 |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-046 | （効果なし） | ― |
| BS20-047 | Lv1：コスト3以下の自分のスピリットすべては、相手の効果で破壊されたとき疲労状態で残ることができる | `reviveOnDestroy`（scope ownAll・filter cost max3・when byOpponentEffect・revived rested・optional）。手本 BS06-087-e2：`{"id":"BS06-087-e2","kind":"reviveOnDestroy","levels":[2],"scope":"ownAll","filter":{"color":"yellow"},"when":{"byBattle":true},"condition":{"opponentFieldSymbolColorsAtMost":1},"revived":{"rested":true}}`（BS06-087「BPを比べ相手のスピリットに破壊されたとき、疲労状態でフィールドに残る」と同じ形。byBattle を byOpponentEffect に、optional を付ける） |
| BS20-047 | Lv2『このスピリットのバトル時』：相手のデッキを上から2枚破棄 | `triggered`（trigger onBattleStart）+ `discard from deck`。手本 BS05-053-e1：`{"id":"BS05-053-e1","kind":"triggered","trigger":"onBattleStart","eventTarget":"use","levels":[2],"optional":false,"action":{"type":"discard","from":"deck","side":"opponent","count":5}}`（『このスピリットのバトル時』破棄と同じ形。count 2） |
| BS20-048 | Lv1-3『このスピリットのアタック時』：このスピリットのLvを1つ上のものとして扱う | `triggered`（onAttack）→ `timedEffect`（content level up1・duration battle・target self）。手本 BS14-112-e2：`{"id":"BS14-112-e2","kind":"magic","timing":"flash","action":{"type":"timedEffect","content":[{"type":"level","up":1}],"duration":"turn","side":"own"}}`（「Lvを1つ上のものとして扱う」の level up 1 と同じ形。期間は§4参照） |
| BS20-049 | Lv1-2『このスピリットのアタック時』：ボイドからコア1個を自分のネクサスに置く | `triggered`（onAttack）+ `placeCores`（void→nexus target one）。手本 SD16-007-e1：`{"id":"SD16-007-e1","kind":"triggered","trigger":"onSummon","levels":[1],"optional":false,"action":{"type":"placeCores","from":"void","to":"nexus","target":"one","count":1}}`（「ボイドからコア1個を自分のネクサスに置く」と同じ形） |
| BS20-049 | 連鎖（条件 緑×1）：[緑]ボイドからコア1個を自分のスピリットに置く | 連鎖元の action を `sequence` の先頭に、`if`（ownColorSymbols green atLeast 1）を後ろに（BS19_PLAN §2.2 A）。`placeCores`（void→spirit）。手本 BS19-039-e1 の連鎖部：`{"type":"if","cond":{"count":{"ownColorSymbols":"green"},"atLeast":1},"then":{"type":"placeCores","from":"void","to":"spirit","target":"self","count":1}}`（[緑]ボイドからコア1個と同じ形。target は self でなく自分のスピリット1体の選択） |
| BS20-050 | Lv1-3【粉砕】『このスピリットのアタック時』：デッキをLvと同じ枚数破棄 | `keyword`（funsai）。手本 BS19-062-e1：`{"id":"BS19-062-e1","kind":"keyword","keyword":"funsai","levels":[1,2,3]}`（【粉砕】と同じ形） |
| BS20-051 | Lv1-2『このスピリットの召喚時』：コスト4以下の相手のスピリット1体を破壊 | `triggered`（onSummon）+ `destroy`（filter cost max4）。手本 SD16-002-e2：`{"id":"SD16-002-e2","kind":"triggered","trigger":"onDestroy","levels":[2],"optional":false,"action":{"type":"destroy","count":1,"filter":{"cost":{"max":4}}}}`（コスト4以下1体破壊と同じ形。trigger を onSummon に） |
| BS20-051 | 【合体時】Lv2『自分のアタックステップ』：自分の青のスピリットがアタックしたときコスト3以下の相手1体を破壊 | `fieldEvent`（anySpiritAttacked・ownOnly・subjectFilter color blue）+ `destroy`（cost max3）。手本 BS05-066-e1：`{"id":"BS05-066-e1","kind":"fieldEvent","event":"anySpiritAttacked","levels":[1,2],"phase":"attack","turn":"own","subjectFilter":{"color":"blue"},"action":{...}}`（「自分の青のスピリットがアタックしたとき」と同じ形。whileCombined を付ける） |
| BS20-052 | Lv1-2：フラッシュ『お互いのアタックステップ』：自分のフィールドのコア1個をトラッシュに置くことで、「ブロックされない」効果を持つ相手1体を破壊 | `activated`（timing flash・phaseTurn attack both）+ `pay`（removeCores self→trash 1）→ `destroy`（filter hasUnblockableEffectOrActive）。手本 BS15-051-e2（効果文が同一）：`{"id":"BS15-051-e2","kind":"activated","timing":"flash","phaseTurn":{"phase":"attack","turn":"opponent"},"levels":[2],"action":{"type":"pay","cost":{"type":"removeCores","side":"own","target":"self","to":"trash","count":1},"then":{"type":"destroy","count":1,"filter":{"hasUnblockableEffectOrActive":true}}}}`（turn を both に） |
| BS20-053 | Lv2-3『このスピリットのアタック時』：コスト4以下の相手のスピリット1体を破壊 | `triggered`（onAttack）+ `destroy`（cost max4）。手本 SD16-002-e2（上記。コスト4以下1体破壊と同じ形） |
| BS20-053 | 連鎖（条件 緑×1）：[緑]相手のスピリット1体を疲労させる | `sequence`＋`if`（green 1）→ `exhaust`（count 1）。手本 SD11-014-e2 の連鎖部：`{"type":"if","cond":{"count":{"ownColorSymbols":"green"},"atLeast":1},"then":{"type":"exhaust","count":1}}`（[緑]疲労と同じ形） |
| BS20-054 | Lv1-3【強化】：自分の「相手へのデッキ破棄効果」の枚数を+1枚 | 強化（青）。手本 BS19-057-e1：`{"id":"BS19-057-e1","kind":"keyword","keyword":"kyoka","kyoka":"deckMill","levels":[1,2]}`（同じ効果文） |
| BS20-054 | Lv1-3『このスピリットのアタック時』：[戦騎将パトロクロス]以外の【強化】を持つ自分のスピリット1体を疲労させることで、このスピリットは回復する | `triggered`（onAttack）+ `pay`（cost exhaust）→ `refresh`（self）。手本 BS19-032-e2：`{"id":"BS19-032-e2","kind":"triggered","keyword":"rensa","trigger":"onBattleWin","levels":[1,2],"oncePerTurn":true,"optional":false,"action":{"type":"if","cond":{"count":{"ownColorSymbols":"blue"},"atLeast":1},"then":{"type":"pay","cost":{"type":"exhaust","side":"own","nexusOnly":true,"count":1},"then":{"type":"refresh","target":"self"}}}}`（「疲労させることで、このスピリットは回復する」と同じ形。ただし cost に§2-2 の新部品が要る） |
| BS20-065 | 【合体時】『このスピリットの破壊時』：自分のネクサス1つを破壊することで、このスピリットは疲労状態でフィールドに残る | `reviveOnDestroy`（scope self・whileCombined・revived rested・optional）。手本 SD16-008-e1：`{"id":"SD16-008-e1","kind":"reviveOnDestroy","levels":[1,2],"scope":"ownNexus","filter":{"color":"blue"},"cost":{"exhaustSelf":true},"revived":{"rested":true},"optional":true,"when":{}}`（「疲労状態でフィールドに残る」の revived rested と同じ形。cost に§2-1 の新部品が要る） |
| BS20-066 | 【合体時】『このスピリットのアタック時』：このスピリットのLvを1つ上のものとして扱う | `triggered`（onAttack・whileCombined）→ `timedEffect`（level up1・battle・self）。手本 BS14-112-e2（048 と同じ。効果文「このスピリットのLvを1つ上のものとして扱う」も同一） |
| BS20-066 | 連鎖（条件 緑×1）：[緑]ボイドからコア1個を自分のスピリットに置く | `sequence`＋`if`（green 1）→ `placeCores`（void→spirit）。手本 BS19-039-e1 の連鎖部（049 と同じ形） |
| BS20-072 | Lv1-2『お互いのアタックステップ』：コスト2以下のスピリットはアタックできない | `globalConstraint`（cantAttackByCost）。手本 SD06-010-e3：`{"id":"SD06-010-e3","kind":"globalConstraint","levels":[1,2,3],"constraint":{"type":"cantAttackByCost","costs":[0,1,2]}}`（「コスト2以下のスピリットはアタックできない」と同じ形） |
| BS20-072 | Lv2『相手のアタックステップ』：相手がアタックしたとき、相手はリザーブのコア1個をトラッシュに置かなければ『このスピリットのアタック/バトル時』効果すべてを発揮できない | §2-3 の新部品（attackEffectCost）。既存の `blockCost`（手本 BS11-037-e3：`{"type":"blockCost","cost":"reserveCoreToTrash","count":1}}` は「置かなければブロックできない」）と同型の支払いだが、ブロックでなく効果発揮の軸が無い |
| BS20-083 | フラッシュ：「ブロックされない」効果を持つ相手のスピリット1体を破壊 | `magic`（flash）+ `destroy`（filter hasUnblockableEffectOrActive）。手本 BS15-051-e2 の then 部（効果文「「ブロックされない」効果を持つ相手のスピリット1体を破壊する」と同一） |
| BS20-083 | 連鎖（条件 緑×1）：[緑]相手のスピリット1体を疲労させる。または、コスト4以下の相手のスピリット2体を疲労させる | `sequence`＋`if`（green 1）→ `chooseActionMode`（exhaust 1／exhaust 2 filter cost max4）。手本 BS19-107-e1：`{"id":"BS19-107-e1","kind":"magic","timing":"flash","action":{"type":"chooseActionMode","modes":[{"label":"自分のスピリット1体を回復させる","actions":[{"type":"refresh","count":1}]},{"label":"このターンの間、自分のスピリットすべてをBP+3000する","actions":[{"type":"timedEffect","content":[{"type":"bp","amount":3000}],"duration":"turn","all":true,"side":"own"}]}]}}`（「または」の二択と同じ形） |
| BS20-084 | フラッシュ：このバトルの間、自分のスピリット1体をBP+3000する。そのスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のデッキを上から7枚破棄する | `timedEffect`（bp 3000・battle）+ `lendSelfThisBattle` + `battleWon`（lentOnly・winnerIsLentBuffTarget）→ `discard from deck` 7。手本 BS07-074（効果文「このバトルの間、〜をBP+2000する。そのスピリットが、BPを比べ相手のスピリットだけを破壊したとき〜」と同じ形）：`{"id":"BS07-074-e1","kind":"magic","timing":"flash","action":{"type":"timedEffect","content":[{"type":"bp","amount":2000}],"duration":"battle","side":"own","filter":{"family":"剣獣"}}}`／`{"id":"BS07-074-e2","kind":"magic","timing":"flash","action":{"type":"lendSelfThisBattle"}}`／`{"id":"BS07-074-e3","kind":"battleWon","levels":null,"lentOnly":true,"role":"any","winnerFamilyFilter":"剣獣","action":{"type":"exhaust","count":1},"winnerIsLentBuffTarget":true}`（BP+の対象を系統でなく1体選択にする） |
| BS20-X06 | Lv1-3：相手は、相手のフィールドにあるシンボルと同じ色のバーストしか発動できない | §2-4 の新部品（burstOnlyOpponentFieldSymbolColors）。手本 BS19-112-e2：`{"id":"BS19-112-e2","kind":"globalConstraint","levels":null,"constraint":{"type":"magicOnlyOwnFieldSymbolColors"}}`（「それぞれのフィールドにあるシンボルと同じ色の〜しか使用できず」のマジック版と同じ形。バースト版の型が無い） |
| BS20-X06 | Lv2-3『このスピリットのアタック時』：相手はマジックカードを使用できない | `triggered`（onAttack）→ `timedEffect`（duration battle・content playerRule cantUseHandCardsForPid magic）。手本 BS14-112-e1：`{"id":"BS14-112-e1","kind":"burst","event":"opponentSummonEffectResolved","action":{"type":"timedEffect","content":[{"type":"playerRule","rule":{"type":"cantUseHandCardsForPid","cardType":"magic"}}],"duration":"turn"},"thenPay":"flash"}`（「相手はマジックカードを使用できない」と同じ playerRule。期間をバトルにする） |
| BS20-X06 | 連鎖（条件 緑×1）：[緑]BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア2個を相手のリザーブに置く | `if`（green 1）→ `lifeCrush`（count 2）。手本 BS19-032-e1：`{"id":"BS19-032-e1","kind":"triggered","trigger":"onBattleWin","battleRole":"attacker","levels":[1,2],"optional":false,"action":{"type":"lifeCrush","count":1}}`（「BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く」と同じ形。count 2。タイミングは§4参照） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
- **BS20-048・066「このスピリットのLvを1つ上のものとして扱う」の期間**：そのバトルの間（BS19_PLAN §2.15 の BS19-025「最高Lvとして扱う」と同じ読み）か、アタックしている間ずっとか。timedEffect duration battle を想定したが要確認。
- **BS20-054 アタック時**：「疲労させることで回復する」は pay の形なので、対象にできる【強化】持ちがいない（すべて疲労状態）なら全体が不発と読む。対象を選ぶ確認をアタック時効果の解決時に出す想定。また「【強化】を持つ」は付与された【強化】も含むか（Q774 と同じ読みで含むと想定）。
- **BS20-065**：ネクサスが無ければ「残る」は不発と読む。破壊するネクサスの選択を破壊待機の確認のどの時点で出すか（reviveOnDestroy の optional の確認と同時）。
- **BS20-072 Lv2**：支払いの確認を出す時点（アタック宣言時か、各『アタック/バトル時』効果の発揮直前か）。「効果すべて」はそのスピリット自身が持つ『このスピリットのアタック/バトル時』効果のみで、バーストや他のカードの効果は含まないと読む。払わない場合もアタック自体は可能。
- **BS20-X06 連鎖**：連鎖元（『アタック時』）と連鎖（BP比べ破壊時）で発揮タイミングが違う。§2.1 の読み（連鎖元を発揮した時点で緑シンボル条件があれば発揮）から「アタック時に条件を判定し、そのバトル中のBP比べ勝利で発揮」と読むが、条件判定の時点を実装時に確認する必要がある。
- **BS20-X06 Lv2**：「相手はマジックカードを使用できない」の期間は、このスピリットのアタック中（そのバトルの間）と読む。`cantUseHandCardsForPid` の pid が発生源の持ち主から見た相手を指す前提（BS14-112 と同じ運用）。
- **BS20-083**：「または」は緑シンボル条件を満たしたときに二択を出すと読む（chooseActionMode）。条件を満たさなければ二択自体が出ない。
- **BS20-051 合体時**：「自分の青のスピリットがアタックしたとき」にこのスピリット自身（合体スピリットは青）のアタックも含むと読む。
- **ソードブレイヴ（BS20-X07・X08）**：紫と黄のブレイヴで、blue の対象外。合体条件は「コスト5以上」と通常のブレイヴと同じ書式で、効果文からは通常のブレイヴとのルールの違いは読み取れない（専用のサポートがあるかは各色の調査で確認する）。
