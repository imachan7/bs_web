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

### BS15 バッチ1（赤・紫）は実装済み（2026-09-17。smoke part331/332）— 残した判断

- **未実装3節（card-notes に partial）**：011 手札から使うフラッシュ（器が無い）／015 紫マジックの色を無いものとして扱う／
  064 Lv2 【不死】の無償召喚。**ユーザーに実装するか確認する**
- 簡略化（card-notes 無し）：X01 Lv2-3 はスピリット状態のブレイヴも破壊候補に含む／016・X02 のコア除去は1体からまとめて取る（既存と同じ）／
  004 の Q3469（その破壊の解決中は発動できない）は未実装
- 008 は「指定色の和集合に無い色を1つでも持つスピリットを両陣営とも破壊」で実装（ユーザーに事後報告済み）

### BS15 バッチ2（緑・白 30種）は実装済み（2026-09-17。smoke part333）— 残した課題と決めたこと

- **未実装：X04 ナウマンガルド Lv2**（card-notes に partial）。PhaseManager にアタックステップ後の割り込み地点が要る。下の決定どおりに作る
- **既存エンジンの二重発火（2026-09-17 再現済み・未修正）**：BS13-010 スカルザードを相手の効果で破壊すると、「2枚まで」の無償召喚が2回走り**4体**出た。
  原因は `triggers.ts` `fireFieldEventTriggers` の `[...effectSources(state, pid), ...extraSources]`（instanceId で重複を除いていない）。
  破壊処理の時点で対象はまだ `field.spirits` に居るので、`fireOwnSpiritDestroyed` が `extraSources` に渡した同じ個体が2回数えられる。
  **直し方**：この連結で instanceId の重複を除く（共通関数1か所。全呼び出し元に効く）。現データでこの形は BS13-010 だけ。
  **BS15 とは別ブランチ・別PR**（対戦の挙動が変わる修正）で、smoke に「召喚は2体まで」を入れてから直す。
  X04 Lv1-2 はこれを避けて `triggered.onDestroy` にしてある（直したあとも戻す必要はない）
- **ブロッカーの疲労が遅い（2026-09-17 実測・未修正）**：ブロック宣言の直後は**回復状態のまま**で、疲労は `resolveBattle`（`GameEngine.ts` の `exhaustSpirit(state, defenderPid, blocker)`）で起きる。
  `TIMING_CHART.md` §3「１Ｂ：ブロッカーを疲労してブロック宣言」と食い違う。ブロック後のフラッシュで「疲労状態のスピリット数」（026 バースト条件等）や
  回復状態を対象にする効果の判定がずれる。**直すときは一緒に宣言時へ移すもの**：`noRestWhenBlocking*` の判定（ターン1回の消費を含む）、
  直下の `hasKyoshuOnBlock`（疲労の直後に置く前提のコメントあり）、『ブロック時』効果の発火順（疲労→ブロック時効果）。別PR
- **バースト効果が装甲・効果耐性をすり抜ける（未修正）**：バースト発動と `thenPay`（対話経路）が `resolveAction` に色も種別も渡していない。BURST.md §7.2。別PR（015 の前提）。
  【氷壁】がバーストと `thenPay` に効かないのは**正しい**（BURST.md §7.1、ユーザー確認）
- **ブロッカーの疲労はPR #71 で修正**（マージ待ち）
- **アタックステップを飛ばすターン終了（未修正）**：メインから直接 `endTurn` するとアタックステップを経由しない。BS15_PLAN §7.0。別PR（X04 Lv2 の前提）
- **未実装節の設計**（X04 Lv2／011／015／064 Lv2 と 064 Lv1 の簡略化）は [BS15_PLAN.md](./docs/design/BS15_PLAN.md) §7。015 に決めてほしいことが2点
- 統合時に `scripts/coverage-effects.ts` の差し込み先2件（deckMillNegate のコスト移行、nexusEffectsDisabled の bothAll）を追随させた

出力は `data/cards/BS15-green.json` / `BS15-white.json`。
- **X04 ナウマンガルド Lv2**：アタックステップ終了後、ドロー/リフレッシュ/メインのどれかを選び、**そのステップを通常どおり丸ごと**行う
  （そのステップの効果もすべて発揮。メインなら召喚もコア移動も可）。**そのあとエンドステップへ**。ターンに1回。
  アタックステップ自体が行われないターン（ルナティックシール）は発揮しない（Q3622〜Q3626）
- **079 プロボケイション**：相手がメインステップの終了を宣言したとき、アタックステップに入る前に使える。
  **手札にあり、コストを払えるときだけ**確認を出す。使ったらすぐアタックステップ。指定したスピリットが後で合体しても必ずアタック、
  スピリット状態のブレイヴを指定して後で合体した場合は不要（Q24996〜Q25000）
- **035 メガ・テュール**：相手が相手のスピリットの色から1色指定し、指定外の色を1つでも持つスピリット/ブレイヴを相手が手札に戻す。
  **合体スピリットはホストとブレイヴの色を合わせた1体**として判定し、戻すなら合体スピリットごと戻す（ユーザー確認 E）
- **034 ミブロック・ジーナス**：「ネクサスすべての効果は発揮されない」は**両陣営のネクサス**
- 合体条件「コスト4以上/【暴風】を持つ」の「/」は**または**（ユーザー確認 C）
- 068 は共通の器（`beforeReduction` / `amountCounter:"opponentFieldColors"` / `condition.opponentFieldColorsAtLeast`）で書く

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
