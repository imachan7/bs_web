# M2 `if`（〜とき／〜なら）・「〜1枚につき」の統合：解釈一覧（2026-09-27。§3 はユーザー回答済み）

REFACTOR_PLAN §2.2 の4行目。直前の結果・いまの盤面・誘発のきっかけで分岐する旧 type を、
`sequence`・`if`・`countCounter` の組み合わせに移す。器の形は ACTION_VOCABULARY §3.1（2026-09-23 決定）。
§3 の答え（2026-09-27 ユーザー回答）：**Q1＝(a)**・**Q2＝(b)**・**Q3〜Q5＝下の読みのまま**。

## §1 器の形（案）

| 部品 | 形 | 使う場面 |
| :-- | :-- | :-- |
| `if` | `{ type: "if"; cond; then; else? }` | 「〜とき／〜なら B（他のときは C）」。`else` は BS14-053・BS16-X01・BS14-111 のような二択のため（`if` を2つ並べると2つ目の判定時に盤面が変わっている） |
| `cond.last` | 直前のアクションで動いたカードに、条件（既存のカード条件の軸：バースト効果を持つ・系統・種別・色・コスト）を満たすものが1枚以上あるか | 「破棄したカードが〜のとき」「そのカードが〜のとき」「この効果で〜を戻したとき」 |
| `cond.state` | 既存の `condition` の語彙（いまの盤面） | 「コアが合計8個以上のとき」「ネクサスが3つ以上あるとき」 |
| `cond.event` | 誘発のきっかけの記録（破壊されたスピリットの色、アタックしたスピリットの BP） | 「このバースト発動時に紫のスピリットが破壊されていたら」 |
| `countCounter: lastCount`／`lastCost` | 直前のアクションで動いたカードの枚数／そのカードのコスト | 「破棄したカード1枚につき」「破壊したスピリットのコストと同じ枚数」 |
| 絞り込みの `sameAsLast` | `filter.cost`・色に「直前に動いたカードと同じ」 | 「破棄されたカードと同じコストの相手のスピリット」 |

「直前のアクション」＝同じ `sequence`／`if` の中で1つ前のアクションが動かしたカードだけ（その間に誘発した効果が動かしたカードは含めない）。
記録の置き場（`GameState` に1つ）と、どのハンドラが記録するか（破棄・オープン・手札に戻す・破壊）は調査役が決める。

## §2 1種類1行の表（38種。ほぼ1枚専用）

| 旧 type | カード | 書き方（案） |
| :-- | :-- | :-- |
| millThenCoreIfBurst | P071 | `mill 2` → `if last{バースト効果}` → `placeCores void→spirit 1` |
| millPerThenSummonSelfIfBurstMilled／destroyIfLastMillHadBurst | BS15-X06 | `mill（countCounter）` → `if last{バースト効果}` → 自身を召喚／相手1体破壊 |
| millSelfTopThenRefreshSelfIfFamily | BS14-X05 | 任意の `mill 1` → `if last{系統「想獣」のスピリット}` → 自身を回復 |
| millOpponentThenReact | BS11-071 | `mill 1` → `if last{コスト3以下}` → 相手1体を疲労 |
| 同上 | BS11-045・BS09-084 | `mill 1` → `destroy { filter.cost: sameAsLast }`（1体／すべて） |
| 同上 | BS11-060 | `mill 1` →（さらに）同じ色の手札を使えない `timedEffect`（色：sameAsLast） |
| millThenDestroyByCardType | BS14-111 | `mill 1` → `if last{スピリット/ブレイヴ}` then 相手が自分のスピリット1体を破壊 else `if last{ネクサス/マジック}` then 相手がネクサス1つを破壊 |
| revealOwnBurstThenSortByType | BS14-053 | バーストをオープン → `if last{マジック}` then 手札 else 破棄 |
| revealTopToHandThenRefreshOwn | BS14-086 | 任意でデッキ上1枚オープン → `if last{黄のマジック}` → 自分1体回復 → オープンしたカードを手札へ |
| openOwnBurstActivateIfSummonCond | BS16-X01 | バーストをオープン → `if last{バースト条件が召喚時発揮後}` then 発動 else デッキの下 |
| returnOneThenRefreshIfMaxCost | BS11-032 | `returnToHand 1` → `if last{コスト4以下}` → 「光導」/「神星」1体を回復 |
| summonBurstCardFreeIfCoresAtLeast | BS14-X03 | `exhaust 2` → その後 `if state{コア合計8以上}` → 自身を召喚 |
| summonBurstCardFreeIfOwnNexusAtLeast | BS14-064 | ネクサスを配置 → その後 `if state{ネクサス3以上}` → 自身を召喚 |
| destroyOwnByFamilyThenWipeEnemy | BS04-108 | `if state{「四道」5体以上}` → 自分の「四道」すべてを破壊し、相手すべてを破壊 |
| burstDestroyThenSummonSelf | BS14-X01 | **§3 Q1** |
| summonBurstCardFreeIfDestroyedColor | BS16-018・BS16-X04 | （018 は破壊の後）`if event{破壊された色}` → 自身を召喚 |
| burstSummonSelfIfTargetBpAtLeast | BS15-X01 | `if event{アタックしたスピリットの BP5000以上}` → 自身を召喚 → その後 BP+3000 |
| drawPerHandDiscard・discardHandNexusesThenDraw | BS08-X33・BS03-146 | 手札を好きなだけ破棄 → `draw（countCounter: lastCount）` |
| coreRemovePerHandDiscard・discardHandAnyThenCoreRemove | BS04-094・BS15-076・BS04-022 | 手札を好きなだけ破棄 → `removeCores（lastCount）`。**§3 Q2**。BS04-022 は「することで」＝量が支払いの結果で決まる形 |
| discardOpponentTegamotoDestroyPer・…VoidCoresPer | BS03-016・BS12-011 | 相手の手元を破棄 → `destroy`／`removeCores`（lastCount） |
| destroyOwnFreelyThenDraw | BS12-052 | 自分を好きなだけ破壊 → `draw（lastCount）` |
| sacrificeOwnNexusesThenEnemyDestroysOwn | BS04-114 | 自分のネクサスを好きなだけ破壊 → 相手が自分のスピリットを `destroy（lastCount）` |
| destroyThenMillByCost | BS07-X28 | `destroy 1` → `mill（lastCost）` |
| drawThenDiscard | BS01-132 | `sequence [draw 3, discardSelfChoose 2]`（`if` 不要。今すぐ移せる） |

**M2 の対象外**（別の器・1枚固有の処理のまま）：destroyOnePerCost（`forEach`）・drawPerChosenFamily／familyChoiceThenBpBuffAll（`choose`）・exhaustSelfThenLendThisTurn・costDiscardNamedThenPeek（`pay` で書けるか別途）・refreshSelfBraveThenCombine・refreshWhenBlockedByChosenColorThisTurn・skipBpCompareThenRefreshOne・treatAsUnblocked*（バトル解決のルール）。
pay で旧 type に残した BS13-024・BS13-060・BS15-067 も、この `last`／`event` がそろったら移す（PAY_UNIFY §5）。

## §3 確認したいこと（私はこう読みました → これでいいですか）

**Q1. BS14-X01 龍の覇王ジーク・ヤマト・フリード**「自分のライフが3以下のとき、BP15000以下の相手のスピリット1体を破壊する。この効果発揮後、このスピリットカードを召喚する」
- 今の実装：ライフが4以上でも（破壊はせず）**必ず召喚する**
- 私の読み：「ライフ3以下のとき」は破壊だけに掛かる条件。召喚は「この効果発揮後」なので、**破壊の効果を発揮したとき（ライフ3以下）だけ召喚**。ライフ4以上なら何も起きない
- 選択肢：(a) 私の読み（挙動が変わる） (b) 今のまま（条件は破壊だけ、召喚は常に）
- **答え：(a)**（2026-09-27）。`if state{ライフ3以下} then [destroy, summonSelf]`
- あわせて：ライフ3以下で**破壊できる相手がいない**ときは、「発揮」したとみなして召喚する（CONJUNCTION 早見表「Aを発揮すればよい（完全でなくてよい）」）と読みました

**Q2. 「破棄したカード1枚につき、相手のスピリット1体のコア1個」**（BS04-094 ダンスマカブル・BS15-076 妖華吸血爪）
- 今の実装：**毎回別のスピリット**から1個ずつ（同じスピリットは選べない）
- 私の読み：今のままでよい（BS04-022 の「枚数と同じ数の相手のスピリット上から、コア1個ずつ」と同じ意味）
- 選択肢：(a) 別々のスピリット（今のまま） (b) 同じスピリットを重ねて選べる
- **答え：(b) 重ねて選べる**（2026-09-27。挙動が変わる）。BS04-022「枚数と同じ数の相手のスピリット上から、コア1個ずつ」は書き方が違うので別々のまま

**Q3. 「その後、〜のとき」**（BS14-X03・BS14-064）
- 私の読み：前半（疲労／配置）を解決した**後の**盤面で判定する。前半が不完全（疲労させる相手が1体しかいない）でも後半は判定する（早見表「その後」）。今の実装がこの読みと合っているかは器の PR で確かめる（未確認）

**Q4. 「〜できる。そのカードが〜のとき」**（BS14-X05・BS14-086）
- 私の読み：前半をしなかった（破棄／オープンを選ばなかった・デッキが0）なら後半も起きない。今の実装がこの読みと合っているかは器の PR で確かめる（未確認）

**Q5. 「Aし、B が〜されたとき、C」**（P071・BS15-X06）
- 私の読み：判定に使うのは**この効果で破棄したカードだけ**（前から トラッシュにあったものは見ない）。デッキが足りず少なく破棄したら、破棄できた分で判定する。今の実装がこの読みと合っているかは器の PR で確かめる（未確認）

## §4 進め方（答えをもらった後）
1. 調査役：`last` の記録の置き場と、記録するハンドラ（mill・reveal・discard・returnToHand・destroy）の差し込み先をこのファイル §5 に書く
2. 実装役：`if`・`cond`（last／state／event）・`lastCount`／`lastCost`・`sameAsLast` を足す（器の PR。カードはまだ移さない）
3. データ役：§2 の表どおりにカードを移し、旧 type を消す（移行の PR）

## §5 器の確定スキーマ（2026-09-27。PR を2つに分ける）

**器 PR 1（`feat/if-core`）**：
- アクション `{ type: "if"; cond: IfCond; then: EffectAction; else?: EffectAction }`（`control.ts`。複数なら `then` に `sequence`）
- `IfCond = { last: CardPick } | { count: EffectCounter; atLeast?: number; atMost?: number }`。
  `last`＝`GameState.lastMoved` に `CardPick` を満たすカードが1枚以上。`count`＝既存カウンタとの比較（新しい条件の語彙を作らない）
- `CardPick`＝`reveal.pick` を名前付きの型に切り出したもの（判定は revealAction.ts の `matchesPick` を export して共用）
- `EffectCounter` に `"lastMoved"`（`lastMoved.length`）
- `GameState.lastMoved: string[]`：記録するアクションが**完了時に上書き**（0枚なら空）。PR 1 で書くのは `mill`・`reveal`（オープンしたカード全部）。
  **`sequence` の開始時に空にする**（前半を選ばなかったときに前の効果の記録を見ないため＝Q4）

**器 PR 2**：`cond.event`・`lastCost`・`sameAsLast`、破棄／手札に戻す／破壊の記録。そのあと §2 の表どおりに移行し、`lastMillHadBurst` を消す。
