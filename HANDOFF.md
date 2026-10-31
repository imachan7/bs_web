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

### 次の本線：プロモ P0・PX0 → BS19 の取り込み（2026-10-31 ユーザー決定）

- 取り込み済みは BS01〜BS18・SD01/02/04/06・プロモ P069〜P071（`data/cards/`）。BS19 から先は staging にも無い
- **プロモは P001〜P084 と PX01〜PX19**（新しいのは100枚）。年の番号（P13〜・PX13〜）はまだやらない（10-31 ユーザー指示）。一覧は batspi.com の「プロモーションカード」ページ。BS19 とは別の PR にする
- **BS19 の前にソウルコアの方針を決める**（剣刃編から入る。今は常に無効。下の「standard 版エンジンの持ち込み」）
- 進め方は [BS18_PLAN.md](./docs/design/BS18_PLAN.md) §1 と同じ（調査役 → 確認 → 期待値役 → 実装役 → データ役 → `merge-set.ts`）。取得は `scripts/fetch_wiki_cards.py`（`--refer` は Wiki に実在するページ名でないと0件）。着手時に `BS19_PLAN.md` を作る
- **プロモの前に、絞り込みの統一を進めている**（2026-10-31 ユーザー決定「全部いま寄せる」）。器ごとの個別の軸を `filter: ResolvedTargetFilter`（`matchesTarget`）へ寄せる。済み：ブロックまわり（#350）・fieldEvent の主語と付与・コア系（#351）。残り：条件（PR 5）。決定と寄せずに残したものは [FILTER_UNIFY.md](./docs/design/FILTER_UNIFY.md) §7。プロモの計画と確定した解釈は [PROMO_PLAN.md](./docs/design/PROMO_PLAN.md)（ブランチ `feat/promo-p0-px0-import`）。プロモの部品は寄せた後の書き方で作る
- データの移行をしたら `npm run coverage:check`（#352。smoke の全緑だけでは、場面を組めずに黙って発火しなくなった効果が見えない）
- 3役の流れは [TEST_STRATEGY.md](./docs/design/TEST_STRATEGY.md) §5・§6。**実装役の「❌ 0」は自分で実行し直して確かめる**（10-29 に食い違いがあった）
- 新しい禁止・耐性は [EFFECT_GATE.md](./docs/design/EFFECT_GATE.md) の問い合わせへ足す。**新しい行・一般則を設計する前に、主役のカードの batspi.com の公式Q&Aを読む**
- 取り込み時に足すもの：待機状態の改訂の残りの規則（[PENDING_STATE.md](./docs/design/PENDING_STATE.md) §2）、発生源の属性で絞る貫通（耐性ごとの発生源の記録が要る）
- 5h 枠の上限は 85%（10-29 ユーザー指定。週は見ない）

### 既知の残り（触るときに読む）

- 保留：使ったマジックを手札に戻す（`returnLastUsedMagicToHand`。26RBS01-X14 だけ）にトラッシュ回収の禁止を効かせるか。このリポジトリのプールに無い
- 専用 type の統一は一区切り（[ACTION_UNIFY_PLAN.md](./docs/design/ACTION_UNIFY_PLAN.md) §4）。新しく統一するときは、分かれている理由がルール上の処理の違いかを先に確かめる
- 「〜することで」の確認関門：規則と既知の限界は [COST_MODEL.md](./docs/design/COST_MODEL.md) §10。`if` の器は [IF_UNIFY.md](./docs/design/IF_UNIFY.md) §3・§5（残した2枚は §5「残す」）
- 「破壊されたとき」は同時破壊でも1回：必須の `reviveOnDestroy` がコスト不足で不発になった場合、グループの消費を戻していない（次の1体で使えない）
- keywordState.ts 81行（`spiritHasLabeledKeyword`）は置き換えると【合体時】の判定が新たに掛かるので残した（ENTRY_ACTIVE.md）
- `coverage:effects` の「場に出ているのに一度も適用されていない効果」は【大粉砕】（BS15-X06-e2）・【呪滅撃】（BS14-X02-e2）の2件だけ。宣言だけのキーワードで、挙動は同じカードの別エントリが持つ（読む側が無いので計測されない）

### standard 版エンジンの持ち込み（ブランチ `feat/legacy-port`。2026-10-15）— 残したもの

`~/develop/bs_web_standard` のエンジン（ソウルコア・moveCards・26系の語彙・ルールの直し）を持ち込み、旧版の #260〜#264 を当て直した。
索引は standard の `docs/legacy-port` ブランチの `docs/design/LEGACY_PORT.md`（`git -C ~/develop/bs_web_standard show docs/legacy-port:docs/design/LEGACY_PORT.md`）。
- **ソウルコアは常に無効**（`createGame` で `soulCore: null`）。有効にする条件は未決：場にあるだけで旧カードの裁定（ボイド行き・【転召】の対象など）が変わるため、烈火伝などを取り込むときに決める
- **第2メインステップは入口だけ閉じた**（`PhaseManager.ts` の `SECOND_MAIN_STEP = false`）。周りのコードは残っている
- 26系カードのデータを読む smoke 76パートは持ち込んでいない（データが非公開）。26系だけの action 16種は `validate:cards` の `STANDARD_POOL_ONLY`
- **この先の standard 側のエンジン修正は自動では入らない**。旧カードにも効く直しは、そのつど持ち込む

### ファイルの分割（R3）

- R3 の残り（`validate:size` の据え置き5本。持ち込みで type.ts 222KB・effectDef.ts・triggers.ts・main.ts・renderer.ts が基準超え）と R6・R7 は随時。
   R3 の済み：removal（#156）・shared/rules（#157）・GameEngine（#160）・EffectModules（#162）・actions/cores（#163）。**分割1つごとに [WHERE_TO_ADD.md](./docs/design/WHERE_TO_ADD.md)（R1）に行を足す**
**分割の手順**（09-26 に2回やった形。スクリプトはジョブの tmp に置いたので残っていない）：
関数名（か区切りコメント）でブロックに分けて移す → 型検査の「名前が見つからない」から import を足す（非公開なら export を付ける）→
`tsc --noUnusedLocals` の報告で写った不要な import を消す → **元の関数本体が1文字も変わらず残っているかをスクリプトで確かめる** →
`npm run codemap`・据え置き一覧の更新。
罠：import 元が2つに分かれると行が増えて `validate:size` に掛かる（据え置きの上限を上げるなら PR に理由を書く）。

**「N まで」＝0〜N は軸 `upTo: true`**（09-28。対象は `requestUpToChoice`、カードは `requestCardChoice(optional, alwaysAsk)`、コアの個数は stepper）。placeCores の旧 `upTo: number`（その数になるまで置く）は `fillTo` に改名。
`toTegamoto.upTo`・`lifeCharge.upTo`（数値）は別の意味のまま残っている（使っているのはそれぞれ1枚・smoke だけ）

### M8（期間つき効果）は一区切り（2026-09-26）

一覧 `timedEffects` に全内容を移した（[TIMED_EFFECTS.md](./docs/design/TIMED_EFFECTS.md) §3.2）。期間つき効果を置くだけの旧 action 19種は入口として残し、周りを触るときに書き直す（REFACTOR_PLAN §2.2 の6行目）。
未着手の決定済み事項：②破壊直前の発生源を控える（ユーザー決定 a）。
回答待ち：④セイ・ドリガンの「このステップの最初に」（今は「そのターンの間、可能ならアタック」。案＝義務がある間は他のスピリットでアタックできず、最初のアタック宣言で消える。直すかを確認中）。
クロスシザース（指定は必須）・ベトール等の【装甲】・コストの時点は 2026-10-08 に決着（#261）

### R4 の残り（type.ts 222KB）

effectAction.ts・effectDefTrigger.ts・effectDefContinuous.ts・globalConstraint.ts（#155・#287）とロジック側4ファイル（#346）は済み。type.ts が残り。
type.ts は2段でやる：①カード ID・作業番号の除去のような機械的な部分はメインループがスクリプトで行う ②長いコメントの上位だけを小さな委譲で書き直す（Read 禁止・行範囲を指定）。
検査は `python3 scripts/check-comment-trim.py <元> <新>`（コードの一致と Q番号・日付・⚠️ の保存）。作業ファイルはリポジトリの外に置く。


### BS15 で残した判断

- **未実装3節（card-notes に partial）**：011 手札から使うフラッシュ（器が無い）／015 紫マジックの色を無いものとして扱う／
  064 Lv2 【不死】の無償召喚。**ユーザーに実装するか確認する**
- 簡略化（card-notes 無し）：X01 Lv2-3 はスピリット状態のブレイヴも破壊候補に含む／016・X02 のコア除去は1体からまとめて取る（既存と同じ）／
  004 の Q3469（その破壊の解決中は発動できない）は未実装
- 008 は「指定色の和集合に無い色を1つでも持つスピリットを両陣営とも破壊」で実装（ユーザーに事後報告済み）
- X04 の追加メインステップ中は、プロボケイションの確認を出さず、アタック強制でターン終了を止めない（その後にアタックステップが無いため）
- 082 の「好きな順番でデッキの下に戻す」は既存の「1枚ずつ選ぶ」器を流用（番号付きUIは作っていない。2026-09-18 ユーザー確認）

### 済んでいること（参照先を消さないこと）

BS01〜BS18 は全枚数投入済み。BS14〜BS18 の確定した解釈と器は各 `BSnn_PLAN.md`（§1〜§3）。
**BS12 で確定した解釈18件と全バッチの器は [BS12_PLAN.md](./docs/design/BS12_PLAN.md) §1 と §5〜§8。**
**BS13 の解釈32件と各色の器は [BS13_PLAN.md](./docs/design/BS13_PLAN.md) §1・§12.3・§6〜§12。**
**「支払った」の判定規則は [COST_MODEL.md](./docs/design/COST_MODEL.md) §8**（smoke part295 / part296）。
ブレイヴの段階1〜7は完了済み（[BRAVE.md](./docs/design/BRAVE.md) §9、確定した規則は §12.5.1〜§12.5.5）。
**宣言そのものに追加コストが要る効果の作り方は [INTERRUPTION_POINTS.md](./docs/design/INTERRUPTION_POINTS.md) パターンE**。

残課題は [REMAINING_WORK.md](./docs/design/REMAINING_WORK.md)（検証の穴80件＋計測点の無い kind 10種）。

### 効果の動作検証（2026-09-30 設計。ユーザー発案）

「効果を発動させて結果が効果文どおりにならない」を落とす。**効果文だけを AI に読ませて期待値を作り、実装と突き合わせる**（実装・データは見せない）。
先に変換規則を確定する：[EFFECT_SPEC_RULES.md](./docs/design/EFFECT_SPEC_RULES.md)（下書き。⚠️印と §5 の未決をユーザー確認 → §2 の表に1行ずつ足す）。
試験運用の結果（2026-09-30。50枚×2回、狙いの3欄＝誘発の主体・実行者・対象の一致）：Sonnet自由記述94%／Haiku自由記述46%／**Haiku選択式（下ごしらえ＋一覧から選ぶ）84%**。未分類は選択式で6〜14%。既知バグ3枚は全モデルで正しい期待値。
道具：`data/spec/vocab.json`（一覧）・`scripts/spec-skeleton.ts`（下ごしらえ＝skeleton／合成＝merge）・`scripts/validate-spec-output.ts`（機械検査）。**次**：①実装データとの突き合わせ（期待値の3欄 vs 実装の解決先）を作る ②既知バグを戻して検出できるか確認 ③50枚→全カード。
**全体への突き合わせ（2026-09-30。データ側で自己参照/ドローを持つ fieldEvent 71枚・Haiku選択式1回）**：`npm run audit:spec -- <期待値.json>`（道具は PR「chore/spec-audit-tools」）。実バグ2系統は修正済み（データ＝fix/field-event-self-mode-source、実行者＝fix/self-action-cause-context。解釈は SEMANTICS_AUDIT §3.18）。**次**：色・コスト・系統の指定の突き合わせ（偽陽性が増える見込み）／`audit:spec` のイベント名の対応不足（未照合の偽陽性）を減らす。

## 2. 未決（答えが出たら手順書へ1行移して、ここから消す）

- 対象がいないマジックのボタンはクライアントでは消えない（押すとサーバーが理由つきで拒否する）





（なし。「破壊されたときは1回」は 2026-09-18 に決着・実装 → TIMING_CHART.md。コスト固定が複数あるときは「使う側が好きな方を選ぶ」（Q3570・Q3597）で、最小値の実装と結果は同じ）

## 3. 決着済み（蒸し返さないこと）

- **再開スタック方式を採る**（ジェネレータ化はしない）。理由は [RESUME_STACK.md](./docs/design/RESUME_STACK.md) §8
- **`allowSuspend` と `pendingReviveConfirms` は消さない。** この2つは「その場で聞く」と
  「恩恵の後に聞く」の使い分けそのもの（RESUME_STACK.md §7）
- **「〜することで」は聞く前に成立しないなら確認を出さない**（2026-10-02 ユーザー決定で、以前の「確認の抑止はやらない」を改めた）。理由はログに出す。COST_MODEL §10
- **破壊待機状態の導入で挙動が変わった既存16枚は、そのまま受け入れる**（2026-09-09 ユーザー合意）。
  多くが強くなる方向だが仕様の帰結。中身は [TIMING_CHART.md](./docs/design/TIMING_CHART.md) §1.5 とテストにある

---

## 4. 間欠的に踏む罠（文書化先が無いのでここに置く）

- **`createGame(seed, …)` の seed は名前だけで、シャッフルは `Math.random()`**（`GameState.ts` の `shuffle`）。
  **デッキの中身に依存するテストは間欠的に落ちる。** 必要なカードは自分で山札の先頭へ置くこと。
  smoke が1〜2件落ちたら、まず**同じコマンドを再実行**して再現するか見る
- **smoke パートが例外で止まると `❌` は0件のまま**（2026-09-28 に踏んだ）。単独で回すときは `grep -c "❌"` に加えて末尾の「合格しました」が出たかも見る
- **`assert` は失敗しても例外を投げず、smoke パートの末尾の成功バナーはそのまま出る。**
  合否は必ず `npx tsx scripts/smoke/partN.ts 2>&1 | grep -c "❌"` が0であることで見ること。
  `tail -3` でバナーを見て「通った」と判断すると、実際の失敗を見落とす（2026-09-12 に実際に踏んだ）
- **再開スタックは `act()` の解決ループでしか消化されない。** 束を積むだけでは `pendingChoice` が立たず、
  呼び出し元からは「何も起きなかった」ように見えて誘発が放置される
