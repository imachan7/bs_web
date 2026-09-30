# 効果文 → 期待値 の変換規則（下書き 2026-09-30）

**目的**: AI に効果文だけを読ませ、「この効果が発動したら盤面はどうなるべきか」を**一意に**起こさせる。
起こした期待値を実装・データと突き合わせて、食い違いを落とす（実装を見せない。見せると実装の写しになる）。
**この文書は変換の規則であって、ルールの正解ではない。** 正解は既存の手順書（下の「出典」）に従う。

⚠️ 印は**新しく決める規則**（既存文書に根拠が無い）。確認が取れるまで AI には使わせず、該当する文は「未分類」で返させる。

## 1. 出力の形（1節＝1レコード）

| 欄 | 取れる値 | 効果文のどこから |
| :-- | :-- | :-- |
| `trigger.kind` | `field`（〜たとき／〜するとき）／`onSummon` 等の『』見出し／`activated`（〜できる：起動）／`continuous`（〜間・〜する）／`keyword` | 文頭・『』見出し |
| `trigger.event` | 疲労／召喚／アタック／破壊／回復／ドロー／合体／ライフ減少…（一覧は effectDef.ts の `FieldEvent`） | 「〜たとき」の動詞 |
| `trigger.subject` | `own`／`opponent`／`any`。**イベントの主体の陣営** | 「自分の」「相手の」「お互い」 |
| `trigger.subjectFilter` | 系統・色・コスト・キーワード・「このスピリット以外」 | 主体の修飾語 |
| `actor` | `owner`（発生源の持ち主）／`opponent`（選択・実行が相手）／`eventSubjectOwner` | 「自分は」「相手は」。**無記は `owner`** |
| `op` | ACTION_VOCABULARY §3 のアクション名 | 述語の動詞 |
| `target.ref` | `source`／`eventSubject`／`chosen`／`allMatching`／`prevTarget` | §2 の指示語表 |
| `target.filter` | 陣営・種別・系統・色・コスト・BP・状態 | 対象の修飾語 |
| `amount` | 数値／`all`／「〜につき」の数え方 | 数詞 |
| `cond` | 「〜のとき／〜なら／〜間」の条件（軸は既存の `condition` に合わせる） | 節頭・節末 |
| `link` | 次の節との接続：`then`／`also`／`ifResolved`／`pay`／`afterEffect`／`while` | CONJUNCTION の早見表 |
| `optional` | 「〜できる」なら true | 文末 |
| `unclassified` | 上のどれにも当てはまらないとき、**推測せず**理由を書く | ― |

## 2. 語句 → 欄（一意に決める表）

### 2.1 指示語（最重要。レオ／ハーキュリー／呪われし神殿の実バグ元）

| 語 | `target.ref` | 補足 |
| :-- | :-- | :-- |
| 「**このスピリット**」「このネクサス」「このブレイヴ」 | `source` | 合体中のブレイヴが持つ効果なら `source` は**ホスト**（SEMANTICS_AUDIT・triggers.ts の selfMode 注記） |
| 「**そのスピリット**」（誘発の見出しに出たものを受ける） | `eventSubject` | 「Xが〜したとき、そのXを〜」 |
| 「そのスピリット」（直前の節で選んだ／動かしたものを受ける） | `prevTarget` | 前方照応。直前の名詞句に解決する ⚠️ 直前が複数あるときの規則は要確認 |
| 「〜以外の」 | `filter.excludeSource` | イベント主体から外すなら `trigger.subjectFilter` 側 |
| 「自分の◯◯のスピリット」 | `filter` に**自分自身も含む** | SEMANTICS_AUDIT §3.8 |

**`trigger.kind = field` で `op` が「このスピリットは〜する」型（`source` を対象に取る）なら、`source` と `eventSubject` は別物。
`eventSubject` が `source` と同一になりうるのは、`trigger.subjectFilter` が発生源を除外していないときだけ。**

### 2.2 主語（誰が実行・選択するか）

| 語 | `actor` | 出典 |
| :-- | :-- | :-- |
| 主語なし／「自分は」 | `owner` | CHOOSER_RULES §1.6 |
| 「相手は、〜」 | `opponent`（**選ぶのは相手、解決は発生源の持ち主の効果**） | CHOOSER_RULES §1 |
| 「相手は、〜できない」 | 選択でなく制約。`actor` を持たない | CHOOSER_RULES §1 例外 |
| 「相手がドローしたとき、自分は〜」 | `trigger.subject = opponent`、`actor = owner` | SEMANTICS_AUDIT §3.1（selfMode:"source" が要る） |

### 2.3 接続詞 → `link`

CONJUNCTION.md の早見表をそのまま使う（「その後」＝`then`、「さらに」「〜し、〜する」＝`also`、「そうしたとき」＝`ifResolved`、
「〜ことで」＝`pay`、「この効果発揮後」＝`afterEffect`、「このとき」＝`also`＋Aが完全に解決できるときのみ）。
複合するときは**直前の節にだけ**制約が及ぶ。

### 2.4 見出し・任意・回数

| 語 | 欄 | 出典 |
| :-- | :-- | :-- |
| 『このスピリットの召喚時』『…アタック時』ほか『』見出し | `trigger.kind`。**ブロックの外には及ばない** | CONJUNCTION「効果ブロックの範囲」 |
| 「〜できる。」で終わる | `optional = true`（実対戦では確認式） | SEMANTICS_AUDIT §3.2 |
| 「ターンに1回」「ゲーム中に1回」 | `limit` | audit S1 |
| 「〜につき」 | `amount` = 数え方（何を何単位で） | ACTION_VOCABULARY 「組み合わせ方」 |
| 「〜まで」「〜以下」 | 上限。**選ぶ人が下限0から選べる** | ⚠️ 要確認（既存文書に一般則が無い） |

## 3. 決めておく運用

1. **AI に渡すのは効果文と、この文書の §1・§2 だけ**。カードデータ・実装・過去の期待値は渡さない。
2. **1文ごとに、同じ入力を2回変換**し、レコードが完全一致しなければ「割れた」として人に回す。
3. 語句が §2 の表に無い／複数の欄に取れるときは `unclassified`。**AIの推測で埋めない。**
4. 生成物は `data/spec/` にコミットする（テストは生成結果を読む＝決定的にする）。
5. 人が確認して決まった語句は §2 の表に**1行足す**。表が育つほど「割れる」件数が減る。
6. 効果は実装済みデータ側に**意味が解決できる形**で持たせて比較する（例：`source` かどうかは `selfMode` と `self` の解決から導く）。

## 4. 出典（規則の根拠。ここに書かれたことをコピーせず参照する）

CONJUNCTION.md／CHOOSER_RULES.md／SEMANTICS_AUDIT.md §3／ACTION_VOCABULARY.md／COST_MODEL.md／TIMING_CHART.md。

## 5. 未決（ユーザー確認待ち）

- 「そのスピリット」が `prevTarget` を指すとき、直前の名詞句が複数ある場合の解決規則
- 「〜まで」「〜以下」の下限
- `trigger.subject = any`（お互い）のとき `actor` が誰になるか
- 期待値レコードの置き場（`data/spec/BS0N.json`）と、突き合わせを定型検証に入れるか監査にするか
