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

**次の本線は BS15「覇王編 第2弾：黄金の大地」全90種**（C46/U18/R12/M8/X6）。
計画は [BS15_PLAN.md](./docs/design/BS15_PLAN.md)。**データは staging に取り込み済み、解釈は §2 で確定（公式Q&A＋ユーザー確認）。**
**次の一手はバッチ0（色をまたぐ共通の器）の設計確定**（BS15_PLAN §4）。ブランチは `feat/bs15-import`。

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

### 進行中：BS15 バッチ1（赤・紫 31種）— 決めたこと（2026-09-16）

出力は `data/cards/BS15-red.json` / `BS15-purple.json`（Wiki 掲載順。バニラも含める）。smoke は part331〜。
- **008 パラディン**：お互いが自分のスピリットの色から1色ずつ指定し、**指定された色の和集合に無い色を1つでも持つ**スピリットを
  **両陣営とも**破壊する（Q3478 の例と矛盾しない最も文字どおりの読み。ユーザーには事後報告）
- **055 マタドーラ**：相手が相手のスピリットの色から1色指定。指定外の色を1つでも持つ**相手のスピリットとネクサス**を破壊
- **004 ハンゾウ**：破壊時・バースト未セット時に任意で「トラッシュに置く代わりにバーストエリアへ」。その破壊の一連の解決中は発動できない（Q3469）
- **075 ブラッディロンド**：ボイドへ置くコアの出どころは**持ち主が選ぶ**。ブラッディレイン（2026-08-17）の選択の器を流用する
- **063 吊られた古城 Lv2**：いまのエンジンどおり1体ごとに判定（「破壊されたときは1回」＝Q22359 は §2 の未決。決まったら直す）
- **073 五輪転生炎**：指定する系統の候補は**自分のフィールドのスピリットが持つ系統**

### BS15_PLAN §0 の借金はすべて返済済み（2026-09-16）

監査 S3・S4 の残0件化、実行実績0の継続効果の解消、永久凍土の王都（COST_MODEL §9）、
Wiki 食い違い（RULES_BATSPI_WIKI）まで片付いた。**BS15 の実装に入ってよい。**
`coverage:effects` の action 側だけ穴が残る: (a) 未実行3種（destroyOwnFreelyThenDraw /
negateContinuousMagicByName / unblockableAboveBpThisBattle）、(b) カードデータ経由が未検証10種。

### 作業の進め方が2026-09-13 に変わった（CLAUDE.md に反映済み）

- **委譲は2色で1エージェント**（色ごとに1体を立てない。BS14 の4色並列で5時間制限に達した）
- **サブに全 smoke と build:client を回させない**（typecheck と自分の part だけ。統合検証はメインループ1回）
- **PR は1つの作業単位**で出す（弾の取り込みは弾ごと1つでよい）
- **`main` へのマージで Cloud Run へ自動デプロイされる**。手で `gcloud run deploy` を打たない
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

**「破壊されたとき」は一度に2体以上破壊されても1回と数える**（公式Q&A Q22359）。現行の `fireOwnSpiritDestroyed` は
**1体ごとに誘発**していて食い違う。既存カード全般に効くので、直すかどうか・範囲をユーザーに確認してから着手する
（BS15_PLAN §2.4）。コスト固定が複数あるときは「使う側が好きな方を選ぶ」（Q3570・Q3597）で、最小値の実装と結果は同じ。

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
