# 専用 type の統一計画（R5 の続き。2026-10-27）

計画だけ。まだ実装していない。数字は 2026-10-27 に `effectAction.ts` とカードデータから数え直したもの
（ACTION_DECOMPOSITION.md・REFACTOR_PLAN.md の 328種は 09-22 時点の数字で古い）。

## 0. いまの全体像

アクション type は **154種**（1枚だけで使うもの 39種。09-22 は 328種・180種）。

| 区分 | 種数 | 扱い |
| :-- | --: | :-- |
| 単純なアクション（ACTION_VOCABULARY §3 のとおり） | 23 | そのまま |
| 組み合わせ方（`pay`・`sequence`・`if`・`declare`・`chooseActionMode`・`simultaneous`・`atTurnEnd`） | 7 | そのまま。`forEach` は未実装 |
| ① 単純なアクションの対象違い | 約18 | **統一する（§1）** |
| ② 期間つき効果の旧い入口 | 約12 | **`timedEffect` へ移す（§1）** |
| ③ バトル・ステップの進行 | 約12 | 固有として残す（2026-10-27 ユーザー了承） |
| ④ 量・選び方が特殊（予算・お互いに選ぶ・コアの特殊な移し方） | 約17 | 今回は触らない |
| ⑤ 1枚専用の固有の仕組み | 約17 | 残す。仲間が来たら一般化する（ACTION_VOCABULARY §1 に追記した規則） |
| カードに出ない | 39 | 内部の再開用と、standard 版から持ち込んだ語彙15種（`validate:cards` の `STANDARD_POOL_ONLY`。10-15 に意図して入れたので残す）。本当の消し忘れは `revealDiscardRest` 1種（生成元の `revealAndSummonKeyword` が既に無い） |

`lendSelfThisTurn`・`lendSelfThisBattle`・`targetChoiceLendThisTurn`・`grantFamilyChoiceAll` は②に入れない
（マジックを仮想発生源として置く土台。09-23 決定のとおり残す）。

## 1. PR の単位と順番

着手は PR 3 から（論点が無い）。PR 1・2 は §2 の A・B の決定に従う。

| 順 | PR | 対象（枚数） | 書き換え先 | 着手前に決めること |
| :-- | :-- | :-- | :-- | :-- |
| 0 | ~~消し忘れの削除~~ | 10-29 に取り消し：16種中15種は `STANDARD_POOL_ONLY`（意図して持ち込んだ語彙）。残る `revealDiscardRest` は PR 3b で消す | — | — |
| 1 | 破壊の対象違い | `destroyNexus` 35・`destroyBrave` 9・`destroySelf` 8・`destroyOwnByCost` 3 | `destroy` ＋対象の種類の軸／`target: "self"`／`filter` のコスト | **論点 A・B** |
| 2 | 戻す・疲労の「自分」版 | `returnSelfToHand` 5・`returnSelfToDeckTop` 1・`returnNexusToHand` 9・`exhaustSelf` 3 | `returnToHand`・`returnToDeckTop`・`exhaust` ＋ `target: "self"`／対象の種類 | `exhaustSelf` は名前で判定する箇所が6ファイルある（コストの判定など）。全部追う。PR 1 の論点 A・B の答えを使う |
| 3a（#304） | 破棄の統一 | `discardOpponent` 22・`discardBurst` 10・`discardHandAll` 3・`discardBothHands` 3・`discardSelfOne` 3・`discardOpponentBurst` 2・`discardOpponentTegamoto` 2 | 新しい `discard`（§4 のスキーマ）。共通の破棄アクションは語彙表に概念があるだけで type が無かった（10-29 に判明） | なし（スキーマは §4 で確定） |
| 3b（#305） | 小物 | `drawUpTo` 2・`nexusCoresToTrash` 2・`revealDiscardRest` 0 | `draw` ＋ `fillTo`（「〜枚になるまで」。`upTo` は 0〜N の意味なので使わない＝09-28 の命名）、`removeCores`、削除 | なし |
| 後 | 回復の統一 | `refreshAllOwn` 9・`refreshSelf`・`refreshOne`・`refreshOwnNexus` | 共通の `refresh` が無いので、回復をまとめて1本で設計する（PR 3 から外した） | 着手時にスキーマ |
| 4 | `bpBuff` の残りと無色化 | `bpBuff` 7・`colorlessSelfThisBattle` 4 | `costMillSelfCount`→`pay { cost: mill }`、`thenAddSymbolThisBattle`→`sequence`＋`timedEffect` の `symbolAdd`、`thenRefreshIfMilledFamily`→`if { cond: last }`、無色化→`timedEffect` の内容 | `amountIfTarget`（選んだ対象が条件に合えば量を変える）は今の `if` の3種の `cond` に当たらない。「選んだ対象を見る条件」を部品として足すか、`amountCounter` で書けるかを決める |
| 5 | 1枚専用の付与・印 | `setTargetBpAsThisBattle`・`countAsMultipleThisTurn`・`markUnblockableByIceWallColorThisTurn`・`grantBlockerImmunity`・`levelOverrideOpponentNexuses`・`requireCoreToBlockThisBattle`・`addSymbolPermanent`・`markNoRefreshTarget`・`grantHostUnblockableThisTurn`・`protectBlockerCoresThisBattle` 2・`treatOwnNexusesAsSpiritsThisTurn` 2・`grantKeywordToHandCard` 2 | `timedEffect`（既存の内容で書けないものは、足りない内容を1つずつ足す） | 1枚ずつ。既存の `TimedContent` で書けるか、足す内容は何かを着手時に表にする。`grantKeywordToHandCard` は手札のカードが対象なので期間つき効果の器に入るか自体を確かめる |

対象から外したもの：`coreRemove` 2枚（`all` の意味がほかと衝突していて 09-24 から保留）。

## 2. 論点 A・B（10-29 にメインループが決めた。挙動を変えない型の形の判断なので確認は取っていない）

- **A. ネクサスは `destroy` の軸、ブレイヴは固有。** ネクサスは `returnToHand` の `nexus: "only" | "also"` と同じ軸で `destroy` に入れる。
  `destroyBrave` は「合体を外してブレイヴだけ破壊し、ホストは残す」（`destroyCombinedBrave`）という手順が違うので③に移して残す
- **B. 「このスピリットを〜」は `target: "self"`。** 今の `destroySelf` は自分のスピリットなら耐性を見ず、fieldEvent で相手のスピリットが self のときだけ見る
  （`returnToHand` の `target: "self"` も耐性を見ない）。移行ではこの挙動をそのまま写す。自分の効果に【破壊されない】が効くべきかは別の論点で、今回は変えない

## 3. 1本ごとの進め方

1. **調査役**（Sonnet）：旧 type の定義・ハンドラ・名前で判定している箇所を読み、旧 type の挙動を
   効果文の言葉ごとに分けた表を書く（共通部分／1枚目にしか無い但し書き）。置き場はこの文書の §4 に追記
2. **期待値役**（Sonnet）：効果文だけを見て、対象カードの場面テストを書く。
   とくに「誰が・何から選ぶか」を固定する（②で旧い入口を残した理由が「カードごとに対象の選び方が変わる」なので、それを検出できるようにする）
3. **実装役**（Sonnet）：2 の part を変更禁止で通す。データを新しい書き方に移し、旧 type を型とハンドラから消す。報告に「簡略化」欄
4. **見直し役**（2 を再開）：差分を読み、効果節ごとの表と未申告の簡略化を出す
5. メインループ：定型の検証を1回、`npm run audit:shared` で但し書きの食い違いが増えていないかを見る、PR を出す

旧 type を残したまま新しい書き方を足すことはしない（書き方が2通り並存するのを M3 で解消した経緯がある）。
1本の PR で、データの移行と旧 type の削除まで終える。

## 4. 確定スキーマ

### PR 3a `discard`（10-29 確定。#304）

既知の限界：2枚以上の手札破棄は `lastMoved` に最後の1枚だけ／`side:both` の相手側は相手自身の破棄として解決され「相手の効果で破棄されたとき」が起きない（旧も同じ）

```ts
{ type: "discard"; from: "hand" | "burst" | "tegamoto"; side: "own" | "opponent" | "both";
  count?: number | "all"; countCounter?: EffectCounter; downTo?: number;
  random?: boolean; cardTypeFilter?: CardType; chooserIsSource?: boolean;
  revealAllHandIfNone?: true; countAttackerSymbols?: true; forcedTargetPid?: PlayerId }
```

- `side` は必須（旧 type ごとに既定が違ったため省略させない）。`both` は自分→相手の順で、各自が自分の手札から選ぶ
- 破棄したカードを `lastMoved` に書く（`if { cond: { last } }` で「破棄したとき」を書くため）
- 旧→新：`discardOpponent{…}`＝`side:"opponent", from:"hand"`＋同じ軸／`discardHandAll`＝`count:"all"`、`thenDrawOpponentHand` は `sequence[discard, if{cond:{last:{}}, then: draw countCounter:"opponentHand"}]`／
  `discardBothHands{all}`＝`side:"both", count:"all"`／`discardSelfOne`＝`side:"own", count:1`（**自分で選ぶ**。旧は手札の末尾を自動で選ぶ簡略化だった）／
  `discardBurst`・`discardOpponentBurst`＝`from:"burst"`／`discardOpponentTegamoto`＝`from:"tegamoto", side:"opponent", count:"all"`
- 外したもの：`randomOpponentHandMagicDiscard`（「無作為に1枚見て、マジックなら破棄」で選び方が違う。⑤の1枚専用）、`mill`（デッキの破棄。【粉砕】【地鳴】の誘発が絡むので別の機会）

### PR 1 の前の修正 `fix/nexus-destroy-choice`（10-29 確定。PR 1 の調査で見つかった実バグ）

- `destroyNexus` の既定経路（相手側・`side:"both"`、`all` でないもの。16件）は対話でも先頭のネクサスを自動で壊していた。**効果を使う人が選ぶ**（候補2つ以上のとき。`count:2` は1つずつ2回）。
  `side:"both"` は**各陣営の持ち主が自分のネクサスを選ぶ**（BS02-088 クロスファイア「お互いは、それぞれ自分の…を選び」）
- 既定経路でも破壊したネクサスを `lastMoved` に書く（either・own の経路と同じ）
- BS05-054 鉄槌のオズワルドは「自分か相手のネクサス」なので `side:"either"`。Lv2 の `discardOpponentPerDestroyed` は `sequence[destroyNexus either, if{cond:{last:{}}} → discard{from:hand, side:opponent, count:1}]` に分解する

### PR 1 `destroy` へ統一（10-29 確定。調査メモの要点。実装は refactor/destroy-unify）

- `destroy` に足す軸：`nexus?: "only"`（ネクサスの破壊。ハンドラは冒頭で既存のネクサス用処理へ委譲する＝軸の統一で、手順は別のまま）・`side?: "own" | "both"`（"both"＝両陣営それぞれ。`anySide`＝どちらか1つ、とは別）・`levelFilter?: number[]`（ネクサスだけ。表示レベルで判定するので `filter.level` とは別）
- `drawPerDestroyed` は `number` にそろえる（スピリット側の `true` 2件は `1` に移す）。ネクサスで「相手のネクサスを破壊した場合だけ引く」は今の挙動のまま
- 旧→新：`destroyNexus{side}` → `destroy{nexus:"only"}`＋`side` は opponent→省略／own→"own"／both→"both"／either→`anySide:true`。`costSacrificeChosen`（データ0件・ハンドラが読まない）は消す
- `destroySelf` → `destroy{target:"self", count:1}`。耐性の扱いは今のまま（§2 B）。記録（lastMoved）が増えるのは許容
- `destroyOwnByCost` → `sequence[destroy{side:"own", count:1, filter:{コスト上限}}, placeCores{from:"void", to:"reserve", countCounter:"lastCost"}]`／BS07-084 は後半が `destroyByCostBudget`（予算＝`lastCost`）。**自分で選ぶ**（旧は非対話でコスト最大を自動で選んでいた）。BS02-075 の self 除外は保つ
- `destroyBrave` は対象外

### PR 2 の前の修正 `fix/nexus-bounce-choice`（10-29 確定）

- `returnNexusToHand` の既定経路（相手側・`count` 指定。6件）も対話中に先頭を自動で戻していた。**効果を使う人が選ぶ**（候補2つ以上のとき。`count:2` は1つずつ）。#306 と同じ形
- 戻したネクサスは今どおり `lastMoved` に書く

### PR 2 を2本に分ける（10-29 確定）

- **2a `refactor/self-unify`**：`returnSelfToHand`（5）→ `returnToHand{target:"self", count:1}`／`returnSelfToDeckTop`（1）→ `returnToDeckTop{target:"self"}`（`target` 軸を足す）／`exhaustSelf`（3）→ `exhaust{target:"self", count:1}`。
  中身は旧ハンドラのまま入口で振り分ける（破壊待機中の個体を手札に戻す経路を含む）。`returnSelfToHand` の `optional`／`confirmed` はデータ0件なので消す。耐性の扱いは今のまま（§2 B）
- **2b（修正のマージ後）**：`returnNexusToHand`（9）→ `returnToHand{nexus:"only"}`（`side` に "both" を足す）、`dest:"deckTop"` の1件は `returnToDeckTop{nexus:"only"}`（`nexus` 軸を足す）。
  `voidCoreToOwnTrashIfOpponent`（BS03-130 の1件）は `if` の条件に「戻したカードが相手のもの」を表す部品が無いので軸として残す
### PR 4 `bpBuff`・`colorlessSelfThisBattle` → `timedEffect`（10-29 確定）

- `amountIfTarget` はデータ0件なので消すだけ（§1 の「着手前に決めること」は不要になった）
- `bpBuff{amount, filter, scope, target}` → `timedEffect{content:[{type:"bp", amount}], duration: scope==="battle" ? "battle" : "turn", count:1, filter}`（`target:"self"` はそのまま）。`anySide` は timedEffect の両陣営から1体を選ぶ書き方へ
- `amountFromSelfBp` → `amountCounter:"selfBp"`（amount 1）／`amountCounter:"lastBp"` はそのまま
- `thenAddSymbolThisBattle` → 同じ timedEffect の content に `{type:"symbolAdd", color, count}` を足す
- `costMillSelfCount`＋`thenRefreshIfMilledFamily`（BS13-060）→ `pay{cost: mill 自分6枚, then: sequence[timedEffect bp, if{cond:{last:{系統 光導・スピリット}}} → 自身を回復]}`。
  **挙動の変化**：デッキが6枚未満なら使えない（COST_MODEL §1「数も完全に」09-24）
- `extraPerCoreToTrash`（BS10-103）→ `sequence[timedEffect bp 3000, pay{cost: removeCores 好きなだけ 自分のフィールド/リザーブ→トラッシュ, then: timedEffect bp 1000×lastCores, target:"lastBuffed"}]`。
  **足りない部品**：`timedEffect` の `target:"lastBuffed"`（直前に BP を上げた個体＝`if` の `lastBuffed` と同じ記録）。「そのスピリット」を前の効果の対象で受ける書き方が他に無いため
- `colorlessSelfThisBattle` → `timedEffect{content:[{type:"colorless"}], duration:"battle", target:"self"}`
- 見つかった別の穴（使う・起動する時点で `pay` を払えるか・後半を解決できるかを見ていない）は #312 で直した。BS08-030 は自分自身も武装なので起動して自分を選べる（10-29 ユーザー確認）

### PR 6 「戻す」を1つにまとめる（10-29 ユーザー合意。PR 2b の後）

- `returnToHand`・`returnToDeckTop`・`returnToDeckBottom` → `return{to:"hand"|"deckTop"|"deckBottom", …}`。何を戻すかは今の軸のまま（`target:"self"`・`nexus`・`filter`・`side`・`count`・`all` など）
- 理由：上・下・手札で type が分かれていると、「自分版」「ネクサス版」のような軸を3か所に持つことになる（PR 2a で `returnToDeckTop` だけに `target:"self"` を足した）。語彙表 §3 の「戻す｜to：手札／デッキの上／デッキの下」を到達点にする
- 中身は今の3つのハンドラのまま、入口で `to` により振り分ける（PR 1 と同じやり方）
- 型は `to` で分けた共用体にする（`Extract<EffectAction,{type:"return";to:"hand"}>` で今のハンドラの型がそのまま書ける）。`to` ごとに持てる軸は今のまま。使われていない組（`to:"hand"` の `chooserIsTarget` など）は、要るカードが来たときに足す
- 着手時の突き合わせ（10-29）。ルール上の違いは無く、どれも「片方にだけ足された」もの:

  | 軸 | hand | deckTop | deckBottom | PR 6 での扱い |
  | :-- | :-- | :-- | :-- | :-- |
  | `count` | 必須 | 省略可（既定1） | 省略可（既定1） | 今のまま |
  | `side` | own／both | own | own | 今のまま |
  | `target` | self／selfBrave | self（破壊されたこのカード） | self（コスト） | 今のまま |
  | マジックの対象を使用時に選ぶ（`OPPONENT_DEFAULT_TYPES`・`COUNT_IS_BODIES`・クライアントの `magicTargetSide`） | 入る | 入る | **入らない** | `return` 全体で入れる。光速三段突も氷河零刀斬と同じく使用時に相手のスピリットを選ぶようになる（今は解決時にサーバーが聞く。戻す先は同じ） |
- イベントの `returnToHand`（`GameEvent`）と【転召】の `mode:"returnToHand"` は別物なので変えない。`returnOwnNexusToDeckBottom`（マジックのコスト1枚）・`returnToBurst` は PR 6 に入れない

### ✅ PR 8 予算つき破壊を `destroy` へ（10-30）

- 突き合わせ：2つの違いは予算の数え方（実効BPの合計／印刷コストの合計）と予算の出し方（固定値・`budgetFromSelfBp`・`budgetFromFamilyBpSum`・`budgetCounter`）だけ。トグル式の選ばせ方・自動選択（残り予算内で重いものから貪欲。コスト版は同コストなら実効BP最大）・まとめて破壊する手順は共通（`budgetToggleDestroy`）。ルール上の処理の違いではない
- スキーマ：`destroy` に `budget?: { by: "bp" | "cost"; amount?: number; fromFamilyBpSum?: FamilyFilter; counter?: EffectCounter }`。`count: "any"` と組む。`amount × counter` は今の `budget × budgetCounter` と同じ。BP 版の `maxCount` はデータで使っていないので持ち込まない
- 期待値先行の part700 で見つけたデータの食い違い：太陽石の神殿は予算が「破壊したスピリットのBP」なのに自分のBP（`budgetFromSelfBp`）になっていた → `counter: "lastBattleDestroyedBp"` に直し、`budgetFromSelfBp` は消した
- 対象13件（12枚）：BS05-X19・BS07-009・BS07-084・BS08-052・BS08-056・BS09-X35・BS10-061・BS13-008・X014・BS16-083・BS17-055（2件）・BS18-074。`pay` の払える判定（`destroyByBpBudget`）も `destroy` の中へ

### ✅ PR 9 `mill` を `discard{from:"deck"}` へ（10-30）

- 突き合わせ：`mill` のハンドラは `millDeck` を呼ぶ入口で、【粉砕】【地鳴】・「デッキから破棄されたとき」の誘発・破棄の禁止と上限は `millDeck` の中にある。入口の名前が違うだけで、ルール上の処理の違いではない
- スキーマ：`discard` を `from` で分けた共用体にした。デッキの形は `{ from: "deck"; side: "own" | "opponent"; count; countCounter?; countMax?; until?; chimei? }`。旧 `mill` は `side` 省略＝相手だったので、データには `"side": "opponent"` を明示した
- データ51件を移し、旧→新を1対1で機械的に突き合わせた（枚数・側・軸が同じ）。名前の付け替えだけなので期待値役の場面テストは書かず、既存の smoke 49か所で挙動を確かめた（§3 の手順から外した）

### ✅ PR 10a `refreshAllOwn` を消す（10-30）

- 突き合わせ：`refreshAllOwn` は「疲労状態の自分のスピリットすべてを回復」と「このターン、この効果で回復したスピリットはアタックできない」を1つでやっていた。9件のうち4件（隠されたる賢者の樹・賢者の樹の実・イ・ケダヤンの階段山脈・獣の楽園）は効果文にアタック不可が無いのに付けていた（どれもエンドステップ・ターン終了時なので対戦の結果は変わらない）
- 足りない部品1つ：`timedEffect` の `target: "lastTargets"`（直前の効果が実際に対象にした個体それぞれに、`filter` に合うものだけ付ける）。「すべて」（`all`）はルールとして後から出たスピリットにも効くので「この効果で回復した」は書けない
- `refreshOne` の `all` は、実際に回復した個体を記録する（`recordTargets`）
- 書き換え：アタック不可のある5件＝`sequence[ refreshOne{all:true}, timedEffect{duration:"turn", target:"lastTargets", filter:{除外}, content:[cantAttack]} ]`。除外は キャバルリー `familyExclude:"戦騎"`・エマージェンシー `keywordExclude:"tensho"`・リブートコード `uncombined:true`。無い4件＝`refreshOne{all:true}`
- ✅ PR 10b（10-30）：`refreshOne`・`refreshSelf` を `refresh` にまとめた（`refreshSelf`＝`refresh{target:"self"}`。データ193件。名前の付け替えだけ）

### PR 5 1枚専用の付与・印の突き合わせ（10-30。調査役）

判定の記号：A＝今の `TimedContent` とハンドラの配置経路でそのまま書ける／B1＝内容は既にあり、`timedEffect` ハンドラ（`logic/actions/timedEffect.ts`）の配置経路を足すだけ（RECORDED と末尾の分岐。内容の新設なし）／B2＝内容の項目か対象の軸を1つ足す／C＝固有として残す。

| type | カード | 効果文の要点 | 判定 | 書き方または理由 | 失われる但し書き |
| :-- | :-- | :-- | :-: | :-- | :-- |
| `setTargetBpAsThisBattle` | BS12-037 オリンピアの天使ベトール | シンボル2つを持つ相手のアタッカーのLv1/2/3 BPを、そのバトルの間2000として扱う | A | `timedEffect{ duration:"battle", count:1, content:[{type:"bpAs", levels:[1,2,3], amount:2000}] }`。対象はイベントの `targetInstanceId`（BS15 に同形あり） | 旧は `resistanceAgainst(scope:"area")` で【装甲】等を判定（2026-10-08 ユーザー確認）。`timedEffect.ts` に耐性判定の呼び出しが無いので、統合時に入れる（さもないと【装甲】持ちにも効く） |
| `countAsMultipleThisTurn` | BS05-079 スリーカード | 指定したスピリット1体（どちらの陣営でも）を、自分のスピリット/ネクサスの効果では3体分と数える | B1 | `timedEffect{ duration:"turn", count:1, side:"both", content:[{type:"countAs", count:3, sourceTypes:["spirit","nexus"]}] }`。`countAs` は RECORDED に無いので足す。`side:"both"` の1体指定は今 `bp` だけが通る（`placeBp`）ので、内容を問わない1体指定にする | 旧の「対象無指定なら BP 最大を自動選択（anySide は両陣営）」。`side:"both"` の非対話フォールバックは自分の場から選ぶ読みになり順序が変わる（対話では選ばせるので実害は小さい） |
| `markUnblockableByIceWallColorThisTurn` | BS16-079 ムーンボウクローク | 【氷壁】を持つ自分の1体は、そのスピリットの【氷壁】と同じ色の相手スピリットからブロックされない | B2 | `timedEffect{ duration:"turn", count:1, side:"own", filter:{keyword:"hyoheki"}, content:[{type:"unblockable", opponentOnly:true, fromKeywordColors:"hyoheki"}] }`。足す項目は `unblockable.fromKeywordColors`（対象が持つそのキーワードの色を**置いた時点で固定**して `from.colorAny` に写す）。今の `from` は色を固定値でしか持てない。1枚専用で、他に使うカードは無い（他の氷壁色参照は継続効果側）。専用が嫌なら C のまま | 候補が2体以上のときの対話選択（旧は `requestChoice` で再開）。`timedEffect` の自分1体選択に載るので失われないが、再開用の `{type:"markUnblockable…"}` が消えるため再開経路を確認する。色の固定（置いたあとに【氷壁】が無効になっても保つ。Q25026〜Q25028）は新項目の仕様として必須 |
| `grantBlockerImmunity` | BS01-139 フェザーバリア | このターンの間、ブロックしている自分のスピリット1体は相手のカードの効果を受けない | B1 | `timedEffect{ duration:"turn", count:1, side:"own", filter:{blocking:true}, content:[{type:"immune"}] }`。`immune` は RECORDED と配置経路に無い。`filter.blocking` は既にある | 旧は「ブロッカー→アタッカー→自分の先頭」の順に代わりの対象を取っていた（効果文は「ブロックしている」だけ）。新はブロッカーがいなければ不発。旧の拡大解釈が消えるので挙動が変わる（読みは1通りなので直してよい側） |
| `levelOverrideOpponentNexuses` | BS02-073 皇帝アンプルール | コア1個をボイドに置くことで、このターンの間、相手のネクサスすべてをLv1として扱う | B2 | `pay{cost, then: timedEffect{ duration:"turn", all:true, （side 省略＝相手）, 対象の軸＝ネクサス, content:[{type:"level", set:1}] }}`。`TargetFilter` にネクサスを選ぶ軸が無い（`matchesTarget` はスピリット前提）ので、`timedEffect` にネクサス対象の軸を1つ足す。内容 `level` は既存。ネクサスを対象にするカードは今のところ他に無い | 旧は発揮時点にいるネクサスの個体ごとに記録（あとから置かれたネクサスは対象外）。`all` の rule 記録にするとあとから置かれたものにも効く。個体記録のまま `timedEffect` で全件に置く形にすれば保てる。`pay.ts:61`・`pay.ts:298` が type 名で解決可能性を見ているので置き換える |
| `requireCoreToBlockThisBattle` | BS11-037 ヒポグリフィー | アタック時、相手はリザーブのコア1個をトラッシュに置かなければブロックできない（このバトル） | A | `timedEffect{ target:"self", duration:"battle", content:[{type:"blockCost", cost:"reserveCoreToTrash", count:1}] }`。`blockCost` の同形が BS13-047 にある（期間だけ違う）。発生源がアタッカー自身（onAttack）なので `target:"self"` で足りる | 旧は `state.battle.attackerInstanceId` に置き、バトル外なら不発。新はバトル外でも記録が残る（このカードは onAttack でしか発揮されないので実害なし）。`self` がアタッカーでない発動は書けない |
| `addSymbolPermanent` | BS13-003 カメレオプス | 本来のコスト7以上を召喚するたび、このスピリットに赤のシンボル2つを追加する | C | 期間つきではなく、トリガーのたびに `extraSymbolsPermanent` へ**蓄積して残る**（継続付与の再計算でも消えない）。期間（turn／battle／step…）のどれにも当たらない | なし（そのまま残す） |
| `markNoRefreshTarget` | BS02-042 スクルディア | 疲労したとき相手の疲労スピリット1体を指定。このスピリットが疲労状態で自分の場にいる間、指定されたスピリットは回復できない | C | 寿命が「発生源が疲労状態で場にいる間」で、期間の一覧に当たらない（`skipRefresh` の寿命は `nextRefresh`）。指定を発生源の `noRefreshTargetInstanceId` に持ち、リフレッシュ側が毎回発生源の状態を引く。`validate-cards.ts:127` も type 名を見ている | なし（そのまま残す） |
| `grantHostUnblockableThisTurn` | BS12-055 ゲッコ・グライダー | このターンの間、このブレイヴと合体しているスピリットはブロックされない | B2 | `timedEffect{ target:"braveHost", duration:"turn", content:[{type:"unblockable"}] }`。記録の `target.kind:"braveHost"` は既にあり、足すのは `timedEffect.target` の値 `"braveHost"` と配置経路だけ（読むたびにホストを引き直す仕組みは記録側にある）。他のブレイヴの「合体しているスピリットは〜」にも使える | なし（`self` がブレイヴ自身という前提は `target:"self"` と同じ扱い） |
| `protectBlockerCoresThisBattle` | BS09-027 密林の勇者皇ヴォルザ／BS09-X40 凶悪巨人タイタス・ザ・ブラック | このスピリットをブロックしているスピリット上のコアは取り除けない（このバトル） | B1 | `timedEffect{ duration:"battle", content:[{type:"blockerCoresProtected"}] }`。`restedNexusEffectsDisabled` と同じ `target.kind:"battle"` の内容なので、`placeBattleCompare` に渡す2つの条件（644行・887行付近）へ `blockerCoresProtected` を足すだけ | なし（旧もバトル外は不発。`placeBattleCompare` も同じ） |
| `treatOwnNexusesAsSpiritsThisTurn` | BS03-147 ゴーレムクラフト／BS09-082 トランスフォーメーション | コアの載った自分のネクサスを、このターンの間、指定したコスト・系統・Lv表のスピリットとして扱う | C | `field.nexuses`→`field.spirits` への**ゾーン移動**と、ターン終了時の復帰（`PhaseManager.endTurn`）という手順を持つ。期間つき効果は「個体に付く値」の器で、ゾーンを動かさない。兄弟の `nexusAsSpiritThisStep` が同じ移動を持つので、統一するならそちらと（`filter`・`all`・`until` を持つ形で）まとめる別 PR | なし（そのまま残す） |
| `grantKeywordToHandCard` | BS03-033 ビートプリースト／BS08-073 ライトニングスピード | 手札の「殻虫」等のスピリットカードに、このターンの間【神速】を与える | C | 対象が**手札のカード**（場の個体ではない）。`PlayerState.tempHandKeywordGrants` に cardId 単位で持ち、期間つき効果の記録（`state.timedEffects` は場の個体・ルール・プレイヤーが対象）に手札カードの対象が無い | なし（そのまま残す） |

A・B1・B2 だけを移すと消える type は 8 個（A=2、B1=3、B2=3）。C の 4 個（`addSymbolPermanent`・`markNoRefreshTarget`・`treatOwnNexusesAsSpiritsThisTurn`・`grantKeywordToHandCard`）は残る。足す部品は、内容の項目 `unblockable.fromKeywordColors` と、`timedEffect` の対象の軸 2 つ（ネクサス、`target:"braveHost"`）。内容の新設は 0。

✅ **決定（10-30 ユーザー了承。実装済み）**：A の2種と B1 の3種（`setTargetBpAsThisBattle`・`requireCoreToBlockThisBattle`・`countAsMultipleThisTurn`・`grantBlockerImmunity`・`protectBlockerCoresThisBattle`）だけを `timedEffect` に移す。B2 の3種は足す部品がどれも1枚専用なので、仲間のカードが来るまで固有として残す。C の4種も残す。移すときの注意：`setTargetBpAsThisBattle` の耐性（【装甲】など。10-08 確認）を移した先でも効かせる。`grantBlockerImmunity` はブロッカーがいなければ不発（旧の「代わりにアタッカー等に付ける」は効果文に無い）

実装で足したもの：`timedEffect` に「誘発が渡したイベントの主語に置く bpAs」（耐性を判定する。ベトール）・`countAs`・`immune` を置く経路。`TimedRecord.sourceType` を足し、期間つき効果の可変量を数えるとき発生源の種類を渡す（スリーカードは「自分のスピリット/ネクサスの効果で数えるとき」だけ3体分。以前はマジックの効果でも3体分だった）。フェザーバリアは「ブロックしている」が指定ではないので、ブロック前でも使用でき、そのときは何も起きない

### PR 7〜10 統一の候補（10-29 ユーザー選択。PR 6 の後に順に。着手前に「分かれている理由がルール上の処理の違いか」を定義とハンドラで確かめ、違えば固有として残す）

| 順 | 今の type（データの件数） | まとめる形の案 | 着手前に確かめること |
| :-- | :-- | :-- | :-- |
| 7 | `summonFromHandFree`(51)・`summonBurstCardFree`(59) | `summon{from:"hand"\|"burst", pay:"free"}` | バーストからの召喚が「発動」の手順を持つか |

| 8 | `destroyByBpBudget`(9)・`destroyByCostBudget`(4) | `destroy{budget:{by:"bp"\|"cost", amount}}` | 予算の数え方（BP の合計とコストの合計）以外の違い |
| 9 | `mill`(51) | `discard{from:"deck"}`（PR 3a の器） | 【粉砕】【地鳴】の誘発・「デッキから破棄されたとき」の扱い |
| 10 | `refreshOne`(72)・`refreshSelf`(112)・`refreshAllOwn`(9) | `refresh{target:"self"\|count\|all, side}` | `refreshAllOwn` のアタック不可の付与は `sequence`＋`timedEffect` へ分ける |

- PR 7 の突き合わせ（10-29）：`summon{from:"hand"|"burst"}`。型は `to` と同じく `from` で分けた共用体。バーストからの召喚は「発動中のバーストのカード自身」を出す（ネクサスなら配置、ブレイヴは合体先を自動で選ぶ、【バースト転召】）。手札は条件に合うカードを選ぶ。軸の重なりは `payCost` だけで、ルールの手順は別なので中身は今の2つのハンドラのまま
- 見つかったバグ（未修正）：サテライド・バードの「バースト効果でスピリットを召喚できない」は `from:"burst"` の中でしか見ておらず、翔烈降臨（バースト効果で手札から召喚）を止めない。直すには「いまバースト効果を解決中か」を選択の再開をまたいで持つ必要がある
- 次の候補：`summonRepeatFromHand`（`mode: free|paid`）は手札からの召喚で、`summon{from:"hand"}` の `repeatWhileChosen`・`payCost` と意味が重なる。ユーザーに提案する
- 候補（ライフの扱いは確認済み）：`lifeCrush`(27)（相手のライフを減らす）を `removeCores{from:["life"]}` に寄せられるか。自分のライフをコストで減らすときも「ライフは減らない」で止まる（2026-10-29 ユーザー確認。COST_MODEL §9）ので、止める判定は同じ。寄せるかは PR 7〜10 の後にユーザーへ提案する
- 候補の見つけ方：type 名を動詞ごとに並べ、同じ動詞で行き先・対象だけ違う組を探す（10-29。ユーザーから「こういうのを見つけて聞いてほしい」）
