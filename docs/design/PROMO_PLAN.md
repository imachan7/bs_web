# プロモ P0・PX0 実装計画

**対象は100枚**（P001〜P084 と PX01〜PX19。うち P069〜P071 は BS16 で取り込み済みなので除く）。スピリット82・ブレイヴ13・マジック8、バニラ4枚、多色9枚。
P13〜P25 のような「P＋年」の番号と PX13 以降はまだやらない（2026-10-31 ユーザー指示）。
データは `data/staging/PROMO.json`（2026-10-31 取り込み。`python3 scripts/fetch_wiki_cards.py --set プロモ --refer 'プロモーションカード' --pages 31 --id-pattern 'P0\d\d|PX\d\d'`）。
一覧は全時代のプロモを含む31ページで、アルティメット等の解釈できない行があるので `--id-pattern` で先に絞る。番号の抜け・重複なし、名前と色は Wiki のページの一覧と一致した。
既存カードと同名のものは P069〜P071 だけ（効果文も同一）。効果文にソウルコア・アルティメットなど、このプールに無い語彙は出てこない。

## 1. 進め方（BS18 と同じ）

1. 調査役4体（並行）：節ごとに既存／新しい部品を仕分ける。メモは `PROMO_SURVEY_<組>.md`
   - red（29）・purple_green（27）・white_yellow（29）・blue（15）。多色は最初の色の組に入れた
2. メインループが見直し、新しい部品の一覧と確認事項をまとめてユーザーに確認 → §2・§3 に書く
3. ①期待値役（効果文だけから場面テスト）→ 部品の実装役 → データ役 → ③見直し
4. プロモは `merge-set.ts` を通さず、`data/staging/PROMO.json` を `data/cards/PROMO.json` へ（BS16_PLAN §1 の4）
5. 定型の検証 → PR は1つ（ブランチ `feat/promo-p0-px0-import`）

## 2. 解釈

調査メモ4本（`PROMO_SURVEY_*.md` §4）の約50件を、手順書と公式Q&Aで突き合わせた。

### 2.1 手順書・Q&A で決まるもの（確認不要）

- 主語の無い「スピリット」はお互い（BS12_PLAN #14・BS15_PLAN #19）：P019・P047・PX01 は自分のスピリットも対象。PX01 のドローは破壊した全員で数える
- 「〜1体につき」「〜が2体以上」は自身も数える（BS16_PLAN Q3667 ほか）：P010・P040
- 『バトル時』はアタック時・ブロック時（ACTION_VOCABULARY）：P042
- 「このターンの間、自分のスピリットすべて」は後から出たスピリットにも効く（TEST_STRATEGY §6）：P081・P063
- 「手札にある」は状態なので、後から手札に入ったカードにも効く（BS18_PLAN 060 と同じ）：P045
- 「コストを支払わずに召喚」に但し書きが無ければ召喚時効果は発揮する（既定）：P073・PX16
- 「この効果で破壊したとき」は直前の結果（`if` の `last`）で読む（ACTION_VOCABULARY）：PX14・PX19
- 「相手による自分のスピリット破壊後」のバーストはバトル破壊も含む（BS17_PLAN）：P056。fieldEvent の「相手によって」は既存どおり効果による破壊だけ：P057
- 「さらに」「Aし、B」は同時（CONJUNCTION）：P030・P068
- コア1個のスピリットの「コア1個をトラッシュに置くことで」は払える（`oneCoreToTrash` の 08-14 裁定）：P036
- コストの候補は完全に払えるものだけ（EFFECT_GATE §1）：PX17 で自身を戻すと回復が解決できないので、自身は候補に出ない
- P040（Q17764）：止めるのは効果による無償召喚だけ。軽減でコスト0になったブレイヴは「0を払った」ので召喚できる
- PX05（Q18421〜Q18426）：このスピリットのアタック中だけ。手札と手元のマジックが対象で、デッキ・トラッシュは不可。全額払うか払わないかのどちらか。螺旋の塔などの追加コストは要る
- PX18（Q18465〜Q18472）：エンドステップの後にアタックステップとエンドステップを1回ずつ足す。ターンに1回は同名で1回（`onceScope:"name"`）。最初のエンドステップでターン中の効果は切れる。発揮の確定後に Lv が下がっても足す
- P072（Q17811〜Q17813）：もう1度発揮するバースト効果は対象を選び直す。召喚もやり直せる。すでに場にいるスピリットの召喚時効果は出ない
- PX19（Q18473・Q18475）：【不死】と「デッキから破棄されたとき」の効果は使えない。コスト3としても扱う＝元のコストと3の両方で当たる（Q18474）

### 2.2 こう読んだ（2026-10-31 ユーザー確認済み）

1. PX19 のトラッシュ凍結：トラッシュのカードを動かす効果（回収・トラッシュからの召喚）と、トラッシュのカード自身の効果（【不死】・トラッシュのシンボルによる軽減など）を全部止める。トラッシュの枚数を数えるだけの効果は止めない。PX19 自身がトラッシュにあるときは効かない（場にいる間だけの効果）
2. 期間の書かれていない禁止は、アタック時の誘発なので「このバトルの間」：P029（シンボルの色のマジックしか使えない）・P077（疲労ネクサスと同じコストは使えない）・P074（バーストを発動できない）。色・コストは使うたびに見る
3. P033・P076「使用したマジックのコスト」は印刷されたコスト（軽減前）
4. P039 の「スピリットだけを手札に戻す」は、破壊待機から手札へ移す（トラッシュに置かれない）。相手の合体スピリットがいなくても戻す（「その後」）
5. P019「破壊し、1枚ドロー」は同時なので、破壊できる相手がいなくてもドローする
6. P022「ネクサスがある間 BP+2000」は、アタック中ずっと見る（ネクサスが無くなれば下がる）
7. PX09「疲労したとき、1体につき3枚」は、【暴風：5】で5体同時に疲労したら15枚
8. P050「コア1個ずつ」は1個残さない（コア1個のスピリットは消滅する）
9. P072 の条件「そのバースト発動時に自分のスピリットが召喚されていたら」は、そのバースト効果の解決で自分のスピリットを召喚したとき

## 3. 新しい部品（案。調査メモ4本の34種を畳んだもの）

番号は調査メモの組と番号（赤＝R、紫緑＝G、白黄＝W、青＝B）。

### 3.1 統一のあとの書き方（#349〜#353 で寄せ終えた）

絞り込みは器ごとの `filter`／`subjectFilter`／`partnerFilter`／`ownSpiritMatches`／`battleOpponentMatches`（`ResolvedTargetFilter`）に書く。§3.1 の旧案のうち、既存の軸で書けるようになったもの：

- W4 `braveImmuneGrant.filter.nameContains`、W6 `fieldEvent.subjectFilter.nameContains`、W10 `unblockableBy.filter.cost.min`、W11 `noRestWhenBlocking.filter.level`、G1 `filter.nameContains`、G2 `subjectFilter{keyword:"bofu",keywordCount:1}`、R2 `battleOpponentMatches.nameContains`
- W8（自身のコスト以下）は `canBlockWhileRested.filter.maxCostAsSelf`。self がブロッカーかを実装役が確かめる

まだ足りないもの：`TargetFilter` の `notBlocking`（G5）・`maxCostLastMagic`（W2。直前に使ったマジックの印刷コスト以下）、`reviveOnDestroy.condition` の `ownSpiritMatches`（W1）、`summonedExhaustGrant` の `filter`＋`ownBurstSet` 条件（W9）

### 3.2 そのほかの部品

| 部品 | 種別 | 該当 |
| :-- | :-- | :-- |
| 自身が合体していない（`selfNotCombined`） | 条件の軸 | R1・W7 |
| 発生源自身がバトル中（`selfInBattle`。アタッカー・ブロッカーとも） | 条件の軸 | W3 |
| このターンに BP 比較で自分のスピリットが破壊された | 条件の軸＋ターン内の記録 | R3 |
| `reviveOnDestroy.when.byBattleKillerMinBp` | 条件の軸（Max の対） | W5 |
| `ownBurstActivated` の条件：そのバーストの解決で自分のスピリットを召喚した／そのバーストの event | 条件の軸2つ | R5・R6 |
| `repeatBurstEffect`（直前に発動したバースト効果をもう1度。対象は選び直す） | 単純なアクション | R4 |
| カウンタ `ownCombinedBraves`／`blockerCost` | カウンタ2つ | R7・G4 |
| `exhaust` の `budget`（destroy と同じ形） | 軸 | G6 |
| `ownSpiritReturnedToHand` に `byOpponentOnly` と1体ごとの発火 | 条件の軸 | G3 |
| `cantUseMagicForPid` に `allowColors:"opponentFieldSymbols"` と `costs`（配列・宣言・疲労ネクサスから集める） | 軸 | B1・B3・B7 |
| ブレイヴは無償で召喚できない（globalConstraint。お互い） | 制約の型 | B2 |
| `braveBpBonusZero` に `side` と条件 | 軸 | B4 |
| 【強襲】の疲労をこのスピリットで払える | 支払い方の部品 | B5（1枚専用） |
| `ownFunsaiMilled` の `lastFunsaiHasBurst` | 条件の軸 | B6 |
| お互いのトラッシュの凍結（globalConstraint。§2.2 の1） | 制約の型 | B8 |
| timedEffect の内容「コスト N としても扱う」 | 内容の型 | B9 |

R8（この効果で破壊した数）は既存の `lastMoved`（BS12-052）で書けるので部品にしない。

### 3.3 バッチ（カード単位。1バッチの新しい部品は2〜3種）

| バッチ | カード | 新しい部品 |
| :-- | :-- | :-- |
| A1 | P049・P052・P033・P076 | `selfNotCombined`・`selfInBattle`・`maxCostLastMagic` |
| A2 | P032・P036・P024・P078 | R3 の記録・`byBattleKillerMinBp`・`reviveOnDestroy.condition.ownSpiritMatches` |
| B | P072・P060・P065 | `repeatBurstEffect`・`ownBurstActivated` の条件2つ・`lastFunsaiHasBurst` |
| C1 | PX13 | `notBlocking`・`blockerCost`・`ownSpiritReturnedToHand` の `byOpponentOnly` と1体ごと |
| C2 | P047・PX15 | `ownCombinedBraves`・`exhaust.budget` |
| D | P029・P043・P077・P074・P040・P054 | `cantUseMagicForPid` の `allowColors`／`costs`・ブレイヴの無償召喚の禁止・`braveBpBonusZero` の `side` と条件 |
| E | PX19・P055・P064 | トラッシュの凍結・「コスト N としても扱う」・【強襲】の代わりの疲労・`summonedExhaustGrant.filter` |

進め方：①期待値役がバッチのカードの場面テストを効果文だけから書く → ②実装役（2〜3体並行、触るファイルが重ならない組で）→ ③残りの約75枚（既存の器だけで書ける）はデータ役が色ごとに書き、`validate:gaps`・`coverage:check`・part190 で確かめる。§2.2 の解釈のカード（P019・P022・P039・P050・PX09）も①の場面テストに入れる
