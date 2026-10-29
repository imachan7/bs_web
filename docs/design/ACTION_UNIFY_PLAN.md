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
