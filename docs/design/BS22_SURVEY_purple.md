# BS22 調査メモ：purple（調査役）
対象：BS22-010・011・012・013・014・015・016・017・018・057・058・068・075・076・X02、X13-02。実装はしていない。
（BS22-070 は colors[0] が白の担当。【分身】を含む節は無し。ソードブレイヴ該当なし。013 は効果なし。合体条件はカードのデータ欄 `braveCondition` で、効果の節に数えない。）

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**29**（効果なしの 013 を除く15枚。うち連鎖元 3・連鎖の中身 3・【強化】1）
- 既存の器で書ける：**18**
- 新しい部品が要る：**11**（012 Lv1-3 の召喚税・014 の緑の効果・016 の2節・018/068 の分離・058 召喚時・X02 の2節・015/017 の連鎖の中身）。部品としては **9件**（§2 の N1〜N9。N5 は 018/068、N9 は 015/017 で共用）
- 連鎖を持つカード：**3**（015・017・075。条件はすべて「青×1」）
- 強化を持つカード：**1**（014 Lv3。紫＝コア除去）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | globalConstraint `summonPayToll`（条件の軸＋コスト）：召喚するプレイヤーがリザーブのコア count 個をボイドに置かなければ、コストが `in` のスピリットカードを召喚できない（両陣営） | `costMod`（BS04-085-e1）は「コスト+N」で払い先がトラッシュ・フィールドのコアでも払える。`attackPayToll`（globalConstraint.ts:108）はアタック専用。`blockCost`／`effectTax` も召喚そのものには掛からない。転召の祭壇系（summonSurcharge.ts）は余分コストをトラッシュへ払う仕組みで、行き先ボイド・リザーブ限定・コスト絞り込みの口が無い | 012 Lv1-3 |
| N2 | fieldEvent `sourceColorFilter` を自分の効果にも掛ける軸（例：`sourceSide: "both"`）（条件の軸） | `coresGainedFromVoid`＋`opponentEffectSourceTypes`／`causedByOwnEffect: "spirit"`（BS18-013-e2・e3）で陣営とスピリットは絞れるが、色は `sourceColorFilter` だけで、fieldEventTriggers.ts:231〜235 が `src.pid === pid` なら continue（相手の効果専用）。緑の絞り込みを自分の効果の e3 に付けられない | 014 Lv1-3 |
| N3 | globalConstraint `noBounceByEffect`（または `allSpiritsCantBounce`）に絞り込み `filter`（`hasSummonTrigger`）と行き先 手札/デッキ（条件の軸） | `immunityGrant` は target が ownAll／self だけで「相手の効果」が前提（BS20-006-e1）。`allSpiritsCantBounce` は手札行きだけで全スピリット、`noBounceByEffect`（BS19-099）は手札/デッキ両方だが絞り込めず効果限定。「『召喚時』効果を持つ」は TargetFilter の `hasSummonTrigger`（canDirectAttack の targetFilter にだけある）で、globalConstraint に載せる口が無い | 016 Lv1-3 |
| N4 | destroy の旗 `braveCantRemain`（アクションの軸）：この効果で合体スピリットを破壊したとき、ブレイヴはスピリット状態で残せない（トラッシュへ） | 破壊の後ろに `destroyBrave` などを `sequence` で足しても、破壊待機の列でブレイヴを残す確認（`pendingBraveKeeps`、TIMING_CHART §1.5 手順3）が先に走る。「残す確認を出さない」を指定できるのは破壊アクション側だけ（`forced`＝強制的に残す方向の旗はあるが逆は無い） | 016 【合体時】Lv2-3 |
| N5 | `detachOpponentBrave` に `side: "both"`（両陣営の持ち主がコアの移動を行う）と `filter`（コスト13以下／ブレイヴ込みの系統「剣刃」を含まない）（アクションの軸） | `detachOpponentBrave`（effectAction.ts:163）は「相手の合体スピリット」専用で絞り込みは `minSymbols`・`battlingOnly` だけ。`detachBrave` は自分の1体でコア不要。両陣営すべてを持ち主が分離する形が無い。`familyExclude`・`cost.max` は TargetFilter に既存（targetFilter.ts:23・27） | 018 召喚時・068 配置時 |
| N6 | fieldEvent `opponentSpiritCoresMovedToReserve`（タイミング）：自分のスピリット/ブレイヴ/ネクサス/マジックの効果で、相手のスピリット上のコアがリザーブに置かれたとき。主体＝コアを取られたスピリット（効果1回の解決につき1回） | `ownSpiritCoresRemovedByOpponent` は自分側が取られる向き。`opponentCorePlaced` は置かれた先（フィールド/リザーブ）の増加で、取られたスピリットを渡さない。`opponentSpiritCoresEmptied`（BS20-017-e3）は0個になったときだけ。「このターンの間」は `lendSelfThisTurn`（BS01-070-e1）で貸す形が既にあり、タイミング側だけが無い | 058 Lv1 |
| N7 | timedEffect の `blockCost.cost` に `"destroyOwnSpirit"`（コストの軸） | `blockCost`（timedContent.ts:47）は `reserveCoreToTrash`／`discardMagic` の2種だけ。破壊は `constraint blockExhaustSpirit`（疲労版）が別 type で、破壊版は無い。アタック時の誘発の形は BS16-054-e3（fieldEvent anySpiritAttacked＋blockCost）で書ける | X02 Lv1-3 |
| N8 | CardPick `lowerCostThanEventTarget`（条件の軸）：イベント対象（破壊されたスピリット）よりコストの低い | TargetFilter には `maxCostAsEventTarget`（BS20 N18）があるが以下で、未満ではなく、かつ CardPick（トラッシュのカードの絞り込み）には無い。`costBudget`／`cost.max` は固定値 | X02 Lv2-3 |
| N9 | `peekOpponentBurst` が見たカードを lastMoved に載せる（アクションの軸。`revealOpponentBurst` と同じ recordMoved） | 見たバーストの内容で分岐するのに必要。`peek` は `peekedOpponentBurstCardId` に控えるだけで `if { last }` が読めない。載せれば CardPick の `burstEvent`（【自分のライフ減少後】）・`cardType` で `if` が書け、新しい IfCond は要らない | 015 連鎖・017 連鎖 |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））

| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS22-010 | Lv1-2『自分のメインステップ』白のシンボル2つを追加 | 既存。`symbolAddGrant` target self color white count 2＋`phaseTurn {main, own}`。BS13-006-e2 `{"kind":"symbolAddGrant","levels":[2,3],"target":"self","color":"red","count":1,"condition":{...}}`（効果文「このスピリットに赤のシンボル1つを追加する」）の条件無し版。phaseTurn は BS12-006-e1 |
| BS22-011 | Lv1-2『このスピリットの破壊時』疲労状態のコスト12以下の相手の合体スピリット1体を破壊 | 既存。triggered `onDestroy`（BS20-X02-e2）＋destroy filter `{rested:true, combined:true, cost:{max:12}}`（BS09-X36-e2 `{"rested":true,"cost":{"max":4}}`、`combined` は targetFilter.ts:82）。コスト判定は §4 の1 |
| BS22-012 | Lv1-3 お互いのデッキは破棄されない | 既存。globalConstraint `noDeckMill`（BS18-002-e1 `{"kind":"globalConstraint","levels":[1,2,3],"constraint":{"type":"noDeckMill"}}`、同じ文言） |
| BS22-012 | Lv1-3『お互いのメインステップ』コスト4/6/7のスピリットカードを召喚するとき、持ち主のリザーブのコア1個をボイドに置かなければ召喚できない | **新しい部品 N1**（`summonPayToll`、phase main、両陣営、cost in [4,6,7]、count 1、to void）。§4 の2 |
| BS22-013 | （効果なし） | ― |
| BS22-014 | Lv1-3 お互いのデッキは破棄されない | 既存。`noDeckMill`（BS18-002-e1） |
| BS22-014 | Lv1-3 緑のスピリットの効果でボイドからコアが増えたとき、増えたコアすべてをボイドに置く。さらに、その効果を発揮したスピリットのコアすべてをボイドに置く | **新しい部品 N2**（器は BS18-013-e2・e3：`fieldEvent coresGainedFromVoid`＋`eventSourceAsTarget`＋`sequence passEventTarget [voidGainedCores, removeCores target event to void count all]`、`opponentEffectSourceTypes: ["spirit"]`／`causedByOwnEffect: "spirit"`。これに `phase: "main"` を外し緑の絞り込みを足す。BS18-013 は「スピリットの効果で」、014 は「緑のスピリットの効果で」） |
| BS22-014 | Lv3【強化】コア除去 | 既存。`keyword kyoka "coreRemove"`（BS19-017-e1 `{"kind":"keyword","keyword":"kyoka","kyoka":"coreRemove","levels":[2,3]}`、同じ文言）の levels を [3] に |
| BS22-015 | Lv1-2『このスピリットの召喚時』デッキから1枚ドロー（連鎖元） | 既存。triggered onSummon draw 1（BS10-064-e1 `{"trigger":"onSummon","levels":[1],"action":{"type":"draw","count":1}}`）。連鎖元なので `keyword: "rensa"` の `sequence` に入れる（BS20-X02-e1 の形） |
| BS22-015 | 連鎖（条件 青×1）：相手のバースト1つの内容を見て、バースト条件が【自分のライフ減少後】のとき、このターンの間、相手はバーストを発動できない | **新しい部品 N9**＋既存。`sequence [peekOpponentBurst, if {last:{burstEvent:"ownLifeDamaged"}} then timedEffect [playerRule {type:"noBurstActivation"}] duration turn side opponent]`。後半は BS21-080-e1 の `{"type":"timedEffect","content":[{"type":"playerRule","rule":{"type":"noBurstActivation","byEvent":"ownLifeDamaged"}}],"duration":"turn","side":"opponent"}`（効果文「このターンの間、相手は、バースト条件が【自分のライフ減少後】のバーストを発動できない」）の byEvent を外した形。禁止の範囲は §4 の3。peek は BS17-049-e3 |
| BS22-016 | Lv1-3『このスピリットの召喚時』デッキから1枚ドロー | 既存。onSummon draw 1（BS10-064-e1、levels [1,2,3]） |
| BS22-016 | Lv1-3『召喚時』効果を持つスピリットすべては、フィールドから手札/デッキに戻らない | **新しい部品 N3**。「『召喚時』効果を持つ」の判定は BS18-003-e3 `{"kind":"constraint","levels":[2,3],"constraint":{"type":"canDirectAttack","targetFilter":"hasSummonTrigger"}}`（効果文「『このスピリットの召喚時』効果を持つ相手のスピリット1体を指定し」）の `instHasTriggerEffect(target, "onSummon")`（shared/block.ts:202）と同じとする |
| BS22-016 | 【合体時】Lv2-3『このスピリットのアタック時』疲労状態の相手のスピリット1体を破壊する。この効果で合体スピリットを破壊したとき、ブレイヴはフィールドに残せない | 前半は既存：triggered onAttack `whileCombined`＋destroy filter rested（BS10-064-e2 `{"trigger":"onAttack","levels":null,"whileCombined":true,"action":{"type":"destroy","count":1,"filter":{"rested":true}}}`）で levels [2,3]。後半は**新しい部品 N4** |
| BS22-017 | Lv2『このスピリットのアタック時』相手のスピリットのコア1個を相手のトラッシュに置く（連鎖元） | 既存。`removeCores {from:["spirit"], to:"trash", count:1}`（BS04-094-e1。効果文「相手のスピリット1体のコア1個を相手のトラッシュに置く」）を onAttack levels [2] に。`keyword: "rensa"`、sequence の先頭 |
| BS22-017 | 連鎖（条件 青×1）：相手のバースト1つの内容を見て、スピリットカードのとき破棄する | **新しい部品 N9**＋既存。`sequence [peekOpponentBurst, if {last:{cardType:"spirit"}} then discard {from:"burst", side:"opponent"}]`。discard from burst は effectAction.ts:74（既存） |
| BS22-018 | Lv1-3『このスピリットの召喚時』コスト13以下の合体スピリットすべてを分離させる。ただし、分離するときのコアの移動は持ち主が行う | **新しい部品 N5**（器は BS11-034-e1 `detachOpponentBrave allHosts`＋`pendingBraveKeeps` の「ブレイヴの持ち主に聞く」。これに両陣営と filter `{combined:true, cost:{max:13}}`）。コスト判定は §4 の1 |
| BS22-018 | Lv1-3 コスト7以下のスピリットすべては合体できない | 既存。`constraintGrant` target ownAll と opponentAll の2エントリ（opponentAll は BS21_PLAN §3 N9）＋constraint `cantCombine`（BS11-X02 の constraint）＋filter `{cost:{max:7}}`。`cantCombine` は合体先の候補から外す（shared/summon.ts braveCombineCandidates）。分離は別（上の節）で、合体済みのものは分離される |
| BS22-018 | Lv2-3『このスピリットのアタック時』疲労状態の相手のスピリット1体を破壊することで、自分はデッキから2枚ドロー | 既存。`pay {cost:{type:"destroy", filter:{rested:true}, count:1}, then:{type:"draw", count:2}}`。BS14-096-e2 `{"type":"pay","cost":{"type":"destroy","side":"own","count":1},"then":{"type":"destroy","count":1,"chooserIsTarget":true}}` の cost を相手側にしたもの（`destroy` は pay の cost に使える：pay.ts:61・155）。払えなければ発揮しない（COST_MODEL §10） |
| BS22-057 | Lv1『このブレイヴの召喚時』デッキから1枚ドロー | 既存。onSummon levels [1] draw 1（BS10-064-e1）。合体条件コスト4以上は `braveCondition: [{minCost:4}]`（BS20-061 と同じ） |
| BS22-058 | Lv1『このブレイヴの召喚時』このターンの間、自分のスピリット/ブレイヴ/ネクサス/マジックの効果で、相手のスピリットのコアをリザーブに置いたとき、その相手のスピリットすべてを疲労させる | **新しい部品 N6**。召喚時に `lendSelfThisTurn`（BS01-070-e1）＋`lentOnly` の fieldEvent（BS06-102-e2）＋action `exhaust target event`。マジック・ネクサスの効果も含む（`sourceTypes` は絞らない） |
| BS22-058 | 【合体時】『このスピリットの合体アタック時』相手のスピリットのコア1個を相手のリザーブに置く | 既存。triggered onAttack `whileCombined`＋`removeCores count 1`（BS10-066-e2 `{"trigger":"onAttack","levels":null,"whileCombined":true,"action":{"type":"removeCores","filter":{"combined":false},"count":1}}` の filter を外す。効果文「相手の合体していないスピリットのコア1個を相手のリザーブに置く」） |
| BS22-068 | Lv1『このネクサスの配置時』合体スピリットの系統：「剣刃」を持たないブレイヴすべてを分離させる。ただし、分離するときのコアの移動は持ち主が行う | **新しい部品 N5**（filter `{combined:true, familyExclude:"剣刃"}`。「合体スピリットの系統」＝ブレイヴ込みの系統か（付与系統も見る）は §4 の1と同じ型の確認）。配置時は triggered `onDeploy`（BS10-096-e1 `{"kind":"triggered","trigger":"onDeploy","levels":[1,2],"action":{...}}`） |
| BS22-068 | Lv1 コスト4/6/7のスピリットすべては合体できない | 既存。018 の `cantCombine` と同形、filter `{cost:{in:[4,6,7]}}`（`in` は targetFilter.ts:27） |
| BS22-075 | フラッシュ：相手の合体スピリットのブレイヴ1つを破壊することで、自分はデッキから1枚ドロー（連鎖元） | 既存。magic flash `keyword: "rensa"`、`pay {cost:{type:"destroyBrave"}, then:{type:"draw", count:1}}`（`destroyBrave` は pay の cost に使える：pay.ts:68・112。BS14-096-e2 が pay の形） |
| BS22-075 | 連鎖（条件 青×1）：コスト4以下の相手のスピリット1体を破壊する | 既存。BS19-098-e1 `{"kind":"magic","timing":"flash","keyword":"rensa","action":{"type":"sequence","actions":[<連鎖元>,{"type":"if","cond":{"count":{"ownColorSymbols":"purple"},"atLeast":1},"then":{"type":"destroy","count":1,"filter":{"rested":true,"cost":{"max":4}}}}]}}`（同じ「フラッシュ＋連鎖」。色を blue、filter を `{cost:{max:4}}` に） |
| BS22-076 | フラッシュ：自分のスピリット3体のコアすべてを自分のリザーブに置くことで、相手は、相手のスピリット3体のコアすべてを相手のリザーブに置く | 既存。`pay {cost:{type:"removeCores", side:"own", targets:3, count:"all"}, then:{type:"removeCores", targets:3, count:"all", chooser:"owner"}}`。BS09-070-e1（効果文「自分のスピリット上のコア1個を自分のトラッシュに置くことで、相手は、相手のスピリット上のコア1個を相手のトラッシュに置く」）の pay＋`chooser:"owner"` の形。`targets: N`＋`count:"all"` は BS14-022-e2。相手が3体未満のときは §4 の4 |
| BS22-X02 | Lv1-3『自分のアタックステップ』系統：「無魔」を持つ自分のスピリットがアタックしたとき、相手は、相手のスピリット1体を破壊しなければブロックできない | **新しい部品 N7**。fieldEvent anySpiritAttacked `ownOnly`＋`subjectFilter:{family:["無魔"]}`＋`phase attack turn own`＋timedEffect `blockCost`（BS16-054-e3 の形：`"content":[{"type":"blockCost","cost":"reserveCoreToTrash","count":2}]`）。自分自身を壊してよいかは §4 の5 |
| BS22-X02 | Lv2-3『自分のアタックステップ』系統：「無魔」を持つ自分のスピリットが相手によって破壊されたとき、トラッシュにある破壊されたスピリットよりコストの低いスピリットカード1枚を、コストを支払わずに召喚できる。ただし『召喚時』効果は発揮されない | **新しい部品 N8**＋既存。BS13-010-e1 `{"kind":"fieldEvent","event":"ownSpiritDestroyed","byOpponentOnly":true,"optional":true,"action":{"type":"moveCards","from":"trash","dest":"summon","pick":{"cardType":"spirit","cost":{"max":1}},"count":2,"upTo":true}}` の形。`selfOnly` を `subjectFilter:{family:["無魔"]}`（BS20-043 の「系統を持つ自分のスピリットが相手によって破壊されたとき」と同形）に、`count:1`、`skipOnSummon:true`（moveCards に既存）を足し、pick を N8 に。破壊誘発は破壊待機の列に並ぶ（BS20_PLAN §2 の3） |
| BS22-X13-02 | Lv1-2『このスピリットの召喚時』相手のスピリットすべてのコアを、それぞれ1個だけになるように相手のリザーブに置く | 既存。BS14-022-e1 `{"trigger":"onSummon","levels":[1,2],"action":{"type":"removeCores","target":"all","count":"all","leaveAtLeast":1}}`（同じ文言） |
| BS22-X13-02 | Lv2『このスピリットのアタック時』相手のスピリットのコア1個を相手のリザーブに置く。この効果でそのスピリットのコアが0個になったとき、自分はデッキから1枚ドロー | 既存。BS10-066-e1 `{"trigger":"onSummon","levels":[1],"action":{"type":"coreRemove","count":2,"drawIfEmptied":true}}`（効果文「この効果でそのスピリットのコアが0個になったとき、自分はデッキから1枚ドローする」と同じ後段）。count 1、trigger onAttack、levels [2]。【強化】の加算先でもある（自分のコア除去に当たる） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

| # | カード | 何を決めるか | 私の案 | 引いた語 |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 011「コスト12以下の合体スピリット」・018「コスト13以下の合体スピリット」・X02 Lv2（破壊された合体スピリットよりコストが低い） | 合体スピリットのコストは、ホストとブレイヴの**合計**か、**どちらか1枚**か（068 の「合体スピリットの系統」も同じ型：ブレイヴの系統を含めるか） | 合計（ブレイヴ込み）。破壊待機のままの値で判定（CONJUNCTION 30行：場にいたときのコア増減込み・バウンス待機のままの判定、BS16_PLAN 126行「合体ならブレイヴ込みのコスト」） | 引いた語：合体スピリットのコスト／instAllCosts／ブレイヴ込みのコスト。FILTER_UNIFY 198行は instAllCosts が「総当たり」と書くだけで合計かは未記載。BS20-061 の lowerCostThanSelf の注記は「ブレイヴ込みのコスト」。当たりは類推のみ |
| 2 | 012 Lv1-3 の召喚税 | (a) 「コスト4/6/7」は**印刷コスト**か軽減後の支払いコストか (b) 無償召喚（効果・バースト・【神速】）でも払うか (c) リザーブが0のときは召喚できないのか (d) 払う時点（コスト支払いの前か後か） | (a) 印刷コスト（コスト7以上の召喚を見る BS13-003 `minCost` と同じ） (b) 払う（COST_MODEL §11：余分コストは無償召喚でも払う、払えなければ召喚できない・候補に出さない。ただし余分コストは払い先がトラッシュで、ボイド行きの通行料への適用は未記載） (c) 召喚できない (d) 召喚コストの支払いと同じ時点（RULES_BATSPI_WIKI 123行 ①〜④ の ④で一緒に） | 引いた語：余分／ボイドに置かなければ／召喚できない。当たり：COST_MODEL §11 と RULES_BATSPI_WIKI 123〜124行（類推のみ）。ボイドの行き先に直接当たる行は無し |
| 3 | 015 連鎖「相手はバーストを発動できない」 | 禁止の範囲：(a) 見たバーストだけ (b) 【自分のライフ減少後】のバーストすべて (c) **相手のバーストすべて** | (c)。効果文は「バーストを発動できない」で、BS21-080 は「バースト条件が【自分のライフ減少後】のバーストを発動できない」と範囲を書き分けている。見たバーストの条件は「発揮するか」の判定にだけ使う | 引いた語：バーストを発動できない／バーストの内容。BS21-080・BS21-072 Lv2（「お互いはバーストを発動できない」）が文言の違いの手がかり。BURST.md に当たる行は無し |
| 4 | 076 | 相手のスピリットが3体未満のとき：(a) いる分だけコアをリザーブに置く (b) 3体いないので何もしない | (a)。自分側は「自分のスピリット3体のコアすべて」が**コスト**なので3体いなければ払えない（COST_MODEL §10）。相手側の「相手は、相手のスピリット3体」はコストではなく効果で、いる分だけ置く | 引いた語：N体のコア（`targets`）。BS14-022-e2 の `targets: 2` が体数不足でどうなるかは実装を未確認。手順書に当たる行は無し |
| 5 | X02 Lv1-3 | 「相手のスピリット1体を破壊しなければブロックできない」の1体に、**ブロックしようとしているスピリット自身**を含めてよいか | 含めない（自分を壊したらブロックが成り立たない。疲労版の `blockExhaustSpirit` は「ブロックするスピリット以外」と書いてある。破壊版も同じ型に揃える）。ただし効果文に除外の記述が無いので、含めて「ブロック宣言が取り消される」と読む余地がある | 引いた語：しなければブロックできない。BS13_PLAN 437行（マジック破棄版）は相手の手札を払うだけで当たらない。類推のみ |
