# 引き継ぎ

**この文書は「次のセッションが知らないと困ること」だけを書く。目安は80行で、超えたら削る。**
**ただし削ると必要な情報（手順書へのポインタなど）が落ちるなら、超過してよい**（2026-09-08 ユーザー指示）。
2026-09-08 に80行へ収めようとして、BS12_PLAN §1/§5〜§8 と COST_MODEL §8 への参照を落とした。
**行数はポインタを削る理由にならない。** 削ってよいのは「何をやったか」の記録（`git log` で足りる）だけ。
**ただし §1 の「進行中バッチの設計」は一時的に超えてよい**（バッチ完了時に手順書へ移して消すため）。

| 書くもの | 書かないもの（＝どこにあるか） |
| :-- | :-- |
| 未決の論点、合意待ちの変更、まだ文書化していない罠 | 何をやったか → `git log` |
| 進行中の作業の**次の一手**（1行＋リンク） | なぜそう決めたか → `docs/design/` の手順書 |
| 確定したがまだ手順書に移していないスキーマ | 検証コマンド・手順書の地図 → `CLAUDE.md` |

**書くのは設計を確定した時点で、実装より先にコミットする**（詳細は CLAUDE.md）。実装が終わったら手順書へ移して消す。

**手順書へ1行として移したら、ここからは消す。** 二重に持つと必ず片方が古くなる
（2026-08-27 に、この文書が10日ぶんの実装とズレて「本線」を間違って指していた事故があった）。

---

## 1. いまの本線と次の一手

**BS14「覇王編 第1弾：英雄龍の伝説」121種は完了**（2026-09-13。gaps 0件・smoke part313〜323）。
確定した解釈は [BS14_PLAN.md](./docs/design/BS14_PLAN.md) §1、バーストの確定スキーマは同 §2。

**BS15「覇王編 第2弾：黄金の大地」91種は完了**（2026-09-18。gaps 0件・smoke part330〜347・`data/cards/BS15.json` に結合済み）。
確定した解釈は [BS15_PLAN.md](./docs/design/BS15_PLAN.md) §2、未実装節の設計は同 §7。PR #70 はマージ済み。

**次の本線は BS16「覇王編 第3弾：爆烈の覇道」90種＋プロモ3枚**（ブランチ `feat/bs16-import`。staging 取り込み済み・解釈 §2.1 確定済み）。
計画は [BS16_PLAN.md](./docs/design/BS16_PLAN.md)。前提の「破壊されたときは1回」は PR #77（このブランチにマージ済み）。バッチ0（破壊後バーストの器）は済み → BURST.md §7.3。公式Q&Aの裏取りは済み（BS16_PLAN §2.2・§2.4）。バッチ1・2の器は実装済み。

**進め方（2026-09-22 ユーザー決定）**：①赤・紫・緑・白＋プロモ3枚は PR #79 でマージ済み（027 の修正は #81）。
②次は main で [REFACTOR_PLAN.md](./docs/design/REFACTOR_PLAN.md) を進める（進み具合は同 §1 の表と §2.2 の表の「状態」列。09-24 に M1 の一部・M3・M4 の大半・R4 の effectDef.ts が済んだ） ③黄・青（バッチ3）は新しいブランチで、分割後の構成と `pay`・`ifLast` を前提に設計し直す

### いまの本線（2026-09-26 午後にユーザー決定で順番を変えた）

**統合（R5）を先にやり、BS16 の黄・青は統合後の新しい書き方がそろってから実装する**（旧 type で書いて移し替える二度手間を避ける）。
実装役の呼び出し数の測定（REFACTOR_PLAN §0 と同じ形）は、その BS16 の実装のときに行う。

1. ✅ R2 ヘルパーの索引 `docs/CODEMAP.md`（#154。export を足したら `npm run codemap`）と `validate:size`（#153）
2. ✅ **R5：コアの統合**（#165〜#169）。置く `placeCores`＝[CORE_UNIFY_PLACE.md](./docs/design/CORE_UNIFY_PLACE.md) §3、取り除く `removeCores`＝[CORE_UNIFY_REMOVE.md](./docs/design/CORE_UNIFY_REMOVE.md) §3。
   旧 type で残るのはコスト付き・条件付き・直前の結果を使うもの・入れ替え／移動の約10種（pay・if・移動の器がそろったら移す）
   支払いの自動／手動の切り替え（#164）の次の段＝起動能力・効果の中の支払いは、サーバーが支払い元を受け取らないので未対応（使ってみて要れば）
3. **R5 の残り（REFACTOR_PLAN §2.2）**（いまここ）：M5 オープンは移行済み（器 #170・移行はブランチ `feat/reveal-migrate`。[REVEAL_UNIFY.md](./docs/design/REVEAL_UNIFY.md) §4）。旧 type で残るのは revealTopToHandThenRefreshOwn（if 待ち）と revealHandMagicToTegamotoDraw（pay が reveal に対応するまで）。次は §2.2 の M1 pay の残り／M2 if（どちらも着手前にユーザー確認）
4. BS16 の黄・青（バッチ3）を新しい書き方で実装し、実装役の呼び出し数を測る
5. R3 の残り（`validate:size` の据え置き4本：destroy・battleFlow・triggers・type.ts）と R6・R7 は随時。
   R3 の済み：removal（#156）・shared/rules（#157）・GameEngine（#160）・EffectModules（#162）・actions/cores（#163）。**分割1つごとに [WHERE_TO_ADD.md](./docs/design/WHERE_TO_ADD.md)（R1）に行を足す**

**分割の手順**（09-26 に2回やった形。スクリプトはジョブの tmp に置いたので残っていない）：
関数名（か区切りコメント）でブロックに分けて移す → 型検査の「名前が見つからない」から import を足す（非公開なら export を付ける）→
`tsc --noUnusedLocals` の報告で写った不要な import を消す → **元の関数本体が1文字も変わらず残っているかをスクリプトで確かめる** →
`scripts/coverage-effects.ts` の差し込み先を移した先へ直す（part160 が壊れた差し込み先を検出する）→ `npm run codemap`・据え置き一覧の更新。
罠：`patch()` に `f.replace("rules.ts", ...)` のようにパス文字列を組み立てている箇所がある／import 元が2つに分かれると行が増えて `validate:size` に掛かる（据え置きの上限を上げるなら PR に理由を書く）。

**マージ待ち**：#157（shared/rules の分割。クライアントのバンドルが +2KB。**マージ後にブラウザで対戦画面を開いて動作確認する**）、#158（part363・364 がカバレッジの `__eid` で落ちていたのを直す。修正後の `coverage:effects` の再実行はまだ）。

### M8（期間つき効果）は一区切り（2026-09-26）

一覧 `timedEffects` に全内容を移した（[TIMED_EFFECTS.md](./docs/design/TIMED_EFFECTS.md) §3.2）。期間つき効果を置くだけの旧 action 19種は入口として残し、周りを触るときに書き直す（REFACTOR_PLAN §2.2 の6行目）。
未着手の決定済み事項：②破壊直前の発生源を控える（ユーザー決定 a）。
回答待ち：④セイ・ドリガンの「このステップの最初に」の義務が消える条件／クロスシザースの「指定する」は必須か任意か／ブロック時効果と『ブロックされたとき』効果を同時発揮にしてターンプレイヤーに解決順を選ばせるか（今は決まった順。TIMING_CHART ＞３）／ベトール・サンダ・バードの「Lv◯BP を2000として扱う」は相手の【装甲】等で防げるか（今は防げない）。

### R4 の残り（type.ts 211KB）

effectAction.ts は #155 で済み（コメント32%減。190→138KB）。**その委譲1体で5時間枠を約25ポイント使った**（「分けて sed で読め」と指示したのに Read で大きな範囲を読み、文脈29万トークン）。
type.ts は2段でやる：①カード ID・作業番号の除去のような機械的な部分はメインループがスクリプトで行う ②長いコメントの上位だけを小さな委譲で書き直す（Read 禁止・行範囲を指定）。
検査は `python3 scripts/check-comment-trim.py <元> <新>`（コードの一致と Q番号・日付・⚠️ の保存）。作業ファイルはリポジトリの外に置く。

### M1 `pay`：12種は移行済み（2026-09-24。PR #91 の器 → `feat/pay-migrate` の移行。書き方は COST_MODEL §1「実装の形」）

残りは REFACTOR_PLAN §2 の表の3行目（量が支払いの結果で決まる6種と `costXxx` 31種）。`costXxx` は移すときに数どおりの規則へ揃え、挙動が変わるカードを PR に表で書く。

### 「破壊されたとき」は同時破壊でも1回（ブランチ `fix/destroyed-trigger-once`・smoke part348）— 残した制限

- BS12-052 デス・ヘイズの「好きなだけ破壊」（`destroyOwnFreelyThenDrawHandler`）は独自ループのまま＝同時破壊グループに入らない（`suppressOnDestroy` をバッチに通す改修が要る）
- 必須（任意でない）の `reviveOnDestroy` がコスト不足で不発になった場合、グループの消費を戻していない（次の1体で使えない）

### 監査の借金は2本を残して返済済み（2026-09-16。ブランチ chore/semantics-s3-s4）

**`audit:semantics` は S3・S4 とも残0件**（実バグ14件を修正。中身は
[SEMANTICS_AUDIT.md](./docs/design/SEMANTICS_AUDIT.md) §4「S3・S4 も残0件にした」）。
**`coverage:effects` の実行実績0だった継続効果11件も smoke part324 で解消**（BS13-038 のコスト欠落を1件修正）。

### BS15 共通の器（バッチ0。2026-09-16 実装済み・smoke part330）— **色バッチはこの名前を使う**

**サブエージェントは1体ずつ直列に回す**（ユーザー指示。0→1→2→3）。バッチ0は**器とテストだけ**で、カードデータは書かない。

1. **相手のフィールドの色の数**：`shared/rules.ts` に `opponentFieldColorCount(board, pid, spiritsOnly?)`。
   相手のスピリット（**合体中ブレイヴの色を含む**）とネクサスの**色の種類数**。多色は各色、`instColors`（◯色としても扱う）を使い、
   `colorlessThisBattle` の個体は数えない。`EffectCounter` に `"opponentFieldColors"` / `"opponentFieldSpiritColors"`、
   条件に `{ opponentFieldColorsAtLeast: number; spiritsOnly?: true }`
2. **自分のフィールドが◯色しかない**：`ownFieldOnlyColor(board, pid, color, spiritsOnly?)`。**全カードの色が指定色1色だけ**
   （多色が1枚でもあれば不成立＝Q3515）。**0枚なら不成立**。条件名 `{ ownFieldOnlyColor: Color; spiritsOnly?: true }`
3. 上の2つの条件は `AuraCondition` と `triggered.condition` に足す。**他の kind が要るときは色バッチが同じ名前で足す**（名前を変えない）
4. **神将のライフ上限**：`globalConstraint` に `{ type: "lifeDamagePerSpiritPerTurn"; max: number }`（バースト条件は kind 側の既存 `whileOwnBurstSet: true`）。
   **お互い**に効く。スピリット1体（合体スピリットはホスト）が**1ターンに減らしたライフの合計**を 既存の `CardInstance.lifeDealtThisTurn`（SD06-010 と共用。ターン終了でリセット）で数える。
   アタック（`lifeDamageLimit`）と**スピリットが発生源の効果によるライフ減少**の両方に掛ける（Q3470〜Q3472）。マジック・ネクサスの効果は対象外
5. **虚神のコスト固定**：`costMod`（`mode:"set"`）の `condition` に `{ ownBurstSet: boolean }`
6. **軽減前のコスト増**：`costMod`（加算側）に `beforeReduction?: true`（`effectiveCost` の①総コストに足す）と
   `amountCounter?: EffectCounter`（`amount × カウンタ`）、`condition` に `{ opponentFieldColorsAtLeast: number }`（068）

### BS15 バッチ1（赤・紫）は実装済み（2026-09-17。smoke part331/332）— 残した判断

- **未実装3節（card-notes に partial）**：011 手札から使うフラッシュ（器が無い）／015 紫マジックの色を無いものとして扱う／
  064 Lv2 【不死】の無償召喚。**ユーザーに実装するか確認する**
- 簡略化（card-notes 無し）：X01 Lv2-3 はスピリット状態のブレイヴも破壊候補に含む／016・X02 のコア除去は1体からまとめて取る（既存と同じ）／
  004 の Q3469（その破壊の解決中は発動できない）は未実装
- 008 は「指定色の和集合に無い色を1つでも持つスピリットを両陣営とも破壊」で実装（ユーザーに事後報告済み）

### BS15 で残した課題（次に触るときに読む）

- **簡略化（card-notes 無し）**：X01 Lv2-3 はスピリット状態のブレイヴも破壊候補に含む／016・X02 のコア除去は1体からまとめて取る／004 の Q3469（その破壊の解決中は発動できない）は未実装
- X04 の追加メインステップ中は、プロボケイションの確認を出さず、アタック強制でターン終了を止めない（その後にアタックステップが無いため）
- **`coverage:effects` の「未計測の kind」が19種86件まで増えている**（BS10以降の積み残し。`extraStepAfterAttackStep` / `handActivated` / `ownMagicColorless` / `trashNameAs` など）。
  計測点を足すまで、その kind は発火したか分からない
- 082 の「好きな順番でデッキの下に戻す」は既存の「1枚ずつ選ぶ」器を流用（番号付きUIは作っていない。2026-09-18 ユーザー確認）

### BS15_PLAN §0 の借金はすべて返済済み（2026-09-16）

監査 S3・S4 の残0件化、実行実績0の継続効果の解消、永久凍土の王都（COST_MODEL §9）、
Wiki 食い違い（RULES_BATSPI_WIKI）まで片付いた。**BS15 の実装に入ってよい。**
`coverage:effects` の action 側だけ穴が残る: (a) 未実行3種（destroyOwnFreelyThenDraw /
negateContinuousMagicByName / unblockableAboveBpThisBattle）、(b) カードデータ経由が未検証10種。

### 作業の進め方が2026-09-13 に変わった（CLAUDE.md に反映済み）

- **委譲は2色で1エージェント**（色ごとに1体を立てない。BS14 の4色並列で5時間制限に達した）
- **サブに全 smoke と build:client を回させない**（typecheck と自分の part だけ。統合検証はメインループ1回）
- **PR は1つの作業単位**で出す（弾の取り込みは弾ごと1つでよい）
- **デプロイは Actions の「Run workflow」で手動**（main へのマージでは出ない。2026-09-23）。手で `gcloud run deploy` を打たない
- 新しい監査は「**既知のバグをわざと戻して検出できること**」を確かめるまで信用しない

### 済んでいること（参照先を消さないこと）

BS10（121枚）・BS11（91枚）・BS12（91枚）・BS13（97枚）は全枚数投入済み。
**BS12 で確定した解釈18件と全バッチの器は [BS12_PLAN.md](./docs/design/BS12_PLAN.md) §1 と §5〜§8。**
**BS13 の解釈32件と各色の器は [BS13_PLAN.md](./docs/design/BS13_PLAN.md) §1・§12.3・§6〜§12。**
**「支払った」の判定規則は [COST_MODEL.md](./docs/design/COST_MODEL.md) §8**（smoke part295 / part296）。
ブレイヴの段階1〜7は完了済み（[BRAVE.md](./docs/design/BRAVE.md) §9、確定した規則は §12.5.1〜§12.5.5）。
**宣言そのものに追加コストが要る効果の作り方は [INTERRUPTION_POINTS.md](./docs/design/INTERRUPTION_POINTS.md) パターンE**。

残課題は [REMAINING_WORK.md](./docs/design/REMAINING_WORK.md)（検証の穴80件＋計測点の無い kind 10種）。

---

## 2. 未決（答えが出たら手順書へ1行移して、ここから消す）

**「【X】を持つ」を印刷だけで見ている kind が残っている**：規則は「効果で得たものも含む」に確定（2026-09-25、ACTION_VOCABULARY）。`effectGrant` だけ揃えた。`effectDef.ts` で `keywordFilter` に「静的に持つ」と注記のある kind（fieldEvent の召喚・costMod・手札付与など）と `triggers.ts` の `hasKeyword(cardId…)` を洗い、挙動が変わるカードを一覧にしてから揃える。



**バーストの既知の不具合3件（未修正）**：相手のライフ減少で「自分のライフ減少後」が発動する／「相手の召喚時発揮後」が発動しない等。REFACTOR_PLAN の完了後に直す → [BURST.md](./docs/design/BURST.md) §10。
**テストの方針（検討中・未決定）**：場面テスト（本物の操作だけで進めて左右反転も見る）と、AI対戦＋Haiku 審判。**もう少し検討してから決める** → [TEST_STRATEGY.md](./docs/design/TEST_STRATEGY.md)。

（なし。「破壊されたときは1回」は 2026-09-18 に決着・実装 → TIMING_CHART.md。コスト固定が複数あるときは「使う側が好きな方を選ぶ」（Q3570・Q3597）で、最小値の実装と結果は同じ）

## 3. 決着済み（蒸し返さないこと）

- **再開スタック方式を採る**（ジェネレータ化はしない）。理由は [RESUME_STACK.md](./docs/design/RESUME_STACK.md) §8
- **`allowSuspend` と `pendingReviveConfirms` は消さない。** この2つは「その場で聞く」と
  「恩恵の後に聞く」の使い分けそのもの（RESUME_STACK.md §7）
- **発動確認の抑止はやらない。** 成立しない任意コスト効果でも確認は出る
- **破壊待機状態の導入で挙動が変わった既存16枚は、そのまま受け入れる**（2026-09-09 ユーザー合意）。
  多くが強くなる方向だが仕様の帰結。中身は [TIMING_CHART.md](./docs/design/TIMING_CHART.md) §1.5 とテストにある

---

## 4. 間欠的に踏む罠（文書化先が無いのでここに置く）

- **`createGame(seed, …)` の seed は名前だけで、シャッフルは `Math.random()`**（`GameState.ts` の `shuffle`）。
  **デッキの中身に依存するテストは間欠的に落ちる。** 必要なカードは自分で山札の先頭へ置くこと。
  smoke が1〜2件落ちたら、まず**同じコマンドを再実行**して再現するか見る
- **`assert` は失敗しても例外を投げず、smoke パートの末尾の成功バナーはそのまま出る。**
  合否は必ず `npx tsx scripts/smoke/partN.ts 2>&1 | grep -c "❌"` が0であることで見ること。
  `tail -3` でバナーを見て「通った」と判断すると、実際の失敗を見落とす（2026-09-12 に実際に踏んだ）
- **再開スタックは `act()` の解決ループでしか消化されない。** 束を積むだけでは `pendingChoice` が立たず、
  呼び出し元からは「何も起きなかった」ように見えて誘発が放置される
