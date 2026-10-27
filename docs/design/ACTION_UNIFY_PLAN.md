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
| カードに出ない | 39 | 内部の再開用と、消し忘れの疑い16種（§1 の PR 0） |

`lendSelfThisTurn`・`lendSelfThisBattle`・`targetChoiceLendThisTurn`・`grantFamilyChoiceAll` は②に入れない
（マジックを仮想発生源として置く土台。09-23 決定のとおり残す）。

## 1. PR の単位と順番

着手は PR 3 から（論点が無い）。PR 1 は §2 の論点 A・B に答えをもらってから。

| 順 | PR | 対象（枚数） | 書き換え先 | 着手前に決めること |
| :-- | :-- | :-- | :-- | :-- |
| 0 | 消し忘れの削除 | `bpMinus`・`bpBuffAll`・`grantKeywordThisTurn`・`spawnToken`・`placeSoulCore`・`soulCoreToTrash`・`openAwakenMode`・`levelAsSelfThisBattle`・`designate`・`revealDiscardRest`・`returnOwnNexusToDeckBottom`・`refreshOwnNexus`・`exhaustOwnNexuses`・`nexusAsSpiritThisStep`・`returnLastUsedMagicToHand`・`heavyExhaust`（カード0枚） | 型とハンドラを消す | `type: "名前"` の grep では生成箇所が無い。文字列を組み立てて作っていないかを1つずつ確かめてから消す |
| 1 | 破壊の対象違い | `destroyNexus` 35・`destroyBrave` 9・`destroySelf` 8・`destroyOwnByCost` 3 | `destroy` ＋対象の種類の軸／`target: "self"`／`filter` のコスト | **論点 A・B** |
| 2 | 戻す・疲労の「自分」版 | `returnSelfToHand` 5・`returnSelfToDeckTop` 1・`returnNexusToHand` 9・`exhaustSelf` 3 | `returnToHand`・`returnToDeckTop`・`exhaust` ＋ `target: "self"`／対象の種類 | `exhaustSelf` は名前で判定する箇所が6ファイルある（コストの判定など）。全部追う。PR 1 の論点 A・B の答えを使う |
| 3 | 破棄の陣営・ゾーン違いほか | `discardBurst` 10・`discardOpponentBurst` 2・`discardOpponentTegamoto` 2・`discardHandAll` 3・`discardBothHands` 3・`discardSelfOne` 3・`drawUpTo` 2・`nexusCoresToTrash` 2・`refreshAllOwn` 9 | 破棄＝トラッシュに置く（`from`・`side`・`all`）、`draw` ＋`upTo`、`removeCores`、`refreshAllOwn` は `sequence`（回復 → `timedEffect` の `cantAttack`） | なし（器の軸の適用だけ） |
| 4 | `bpBuff` の残りと無色化 | `bpBuff` 7・`colorlessSelfThisBattle` 4 | `costMillSelfCount`→`pay { cost: mill }`、`thenAddSymbolThisBattle`→`sequence`＋`timedEffect` の `symbolAdd`、`thenRefreshIfMilledFamily`→`if { cond: last }`、無色化→`timedEffect` の内容 | `amountIfTarget`（選んだ対象が条件に合えば量を変える）は今の `if` の3種の `cond` に当たらない。「選んだ対象を見る条件」を部品として足すか、`amountCounter` で書けるかを決める |
| 5 | 1枚専用の付与・印 | `setTargetBpAsThisBattle`・`countAsMultipleThisTurn`・`markUnblockableByIceWallColorThisTurn`・`grantBlockerImmunity`・`levelOverrideOpponentNexuses`・`requireCoreToBlockThisBattle`・`addSymbolPermanent`・`markNoRefreshTarget`・`grantHostUnblockableThisTurn`・`protectBlockerCoresThisBattle` 2・`treatOwnNexusesAsSpiritsThisTurn` 2・`grantKeywordToHandCard` 2 | `timedEffect`（既存の内容で書けないものは、足りない内容を1つずつ足す） | 1枚ずつ。既存の `TimedContent` で書けるか、足す内容は何かを着手時に表にする。`grantKeywordToHandCard` は手札のカードが対象なので期間つき効果の器に入るか自体を確かめる |

対象から外したもの：`coreRemove` 2枚（`all` の意味がほかと衝突していて 09-24 から保留）。

## 2. ユーザーに確認する論点（ルールの解釈。PR 1・2 の前）

- **A. ネクサス・ブレイヴを `destroy` の「対象の種類」の軸にしてよいか。**
  基準は「ルール上の処理が違うときだけ分ける」（ACTION_VOCABULARY §1）。合体中のブレイヴの破壊は分離を伴い、
  ネクサスには破壊時の誘発・シンボルの扱いがある。違うのが行き先とその後の処理だけなら軸、手順まで違うなら
  `destroyBrave` は③（固有）へ。**定義とハンドラを読んで違いの一覧を作り、それを示して聞く。**
- **B. 「このスピリットを破壊する／手札に戻す」を `target: "self"` で書いてよいか。**
  `timedEffect` は既にこの書き方。【破壊されない】などの耐性が自分自身を対象にした効果にも効くかで結果が変わる。
  いまの `destroySelf`・`returnSelfToHand` がどちらで動いているかを読んでから聞く。

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

## 4. 調査メモ（PR ごとに調査役が書き足す）

（未着手）
