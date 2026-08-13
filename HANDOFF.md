# 引き継ぎ（2026-08-13 セッション終了時点）

作業内容そのものは `git log` で足りるので、**次のセッションが知らないと困ることだけ**を書く。

## 1. 進め方が変わった（最重要）

**ゲームルールの解釈は、実装前に設計を示して確認を取る。** 詳細は CLAUDE.md の
「⚠️ ゲームルールの解釈は、実装前に設計を示して確認する」節。聞く／聞かないの線引きもそこにある。

背景：カードの「語彙」（action 179種）は SPEC.md に厚く書かれているのに、ゲームの「手順」は
46行しか無く、解決順序が `doSummon` の文の並び順として暗黙に存在していた。そのため推測実装が通り、
**テストが実装の写しになっていた**（`part36.ts` に「対象がいなくても召喚は成立する」という
バグを仕様として固定したテストが実在した）。

**確認して得た答えは `docs/design/` の手順書に1行として書くこと。** チャットに残すだけだと
同じ規則を何度も発見し直す（`chooserIsTarget` は3枚で3回再発明された）。

## 2. 新しい手順書2本（着手時に読む）

| 文書 | いつ読むか |
| :-- | :-- |
| `docs/design/COST_MODEL.md` | 「〜することで〜する」を実装するとき |
| `docs/design/CHOOSER_RULES.md` | 効果文の主語が「相手は」のとき |

どちらも §3 に**現状の適合表**があり、今日の時点で全件適合済み。新しいカードを足したら表を更新する。

## 3. 未決・保留

- **「Aすることで、Bを2つする」で B が1つしか満たせないとき**（COST_MODEL.md §1 の保留節）。
  該当は剣王獣ビャク・ガロウLv2 とカイザーアトラス皇帝Lv2 の2枚。
  **現状の挙動（いる分だけ処理してコストは払う）を維持**し、smoke part178 で固定してある。
  ユーザーが正解を確認したら切り替える。しきい値は1か所（`>= 1` を `>= count` にする）に寄せてある
- **`.txt` 3本（約1万行）がリポジトリに入っている**。UI担当のコミットで混入したセッション書き出し。
  削除の可否は未確認（chatbox `2026-08-13-1804` で連絡済み）

## 4. 決着済み（蒸し返さないこと）

- **発動確認の抑止はやらない。** 成立しない任意コスト効果でも確認は出る。押しても損はせず、
  理由がログに出るぶん確認が出ないより親切、というユーザー判断（COST_MODEL.md に記載済み）

## 5. 割り込み（中断・再開）の土台整備 ← 2026-08-13 着手・進行中

設計は **[docs/design/RESUME_STACK.md](./docs/design/RESUME_STACK.md)**。方針は
「**割り込み点を予測しない**」＝後から割り込みを持つカードが見つかっても、
**割り込む側だけ書けば済む**ようにする。

済み（コミット `c66f347` / `647c1a7` / `5799782`）:

1. **対話モードの再実行**（`npm run smoke:interactive`）。既存178パートを
   `interactiveTargets = true` で走らせ、選択を候補の先頭で自動応答する
2. **保存則の検査**。`act()` のたびにカード総数の差分を見る（故意のリークで発火を確認済み）
3. **再開スタック**。`PendingChoice.queue` を廃止し `GameState.resumeStack` へ。
   継続が選択待ちから独立したので、深い場所からでも中断できる下地ができた
4. **中断中の盤面変更ガード**（`BS_DEBUG_CHECKS=1`）

**未着手（次にやる順）**:

1. **⚠️ ガードが検出した3件の扱いを決める**（下記「6. 未決」）
2. `turnStartResumeStep` を `ResumeFrame` に吸収する
3. `pendingReviveConfirms` / `pendingDeckMillNegates` を廃し、**本来のタイミングで確認を出す**
   （ユーザー確認済み。今は `handleAction` の末尾まで遅延している）
4. 既存5つの割り込み（`magicNegate` / `magicRedirect` / `deckMillNegate` / `reviveConfirm` /
   `handFreeSummon`）をチェックポイント方式へ移行する
5. その上で **BS09（超星91枚）の設計調査**（`data/staging/BS09.json` に取り込み済み・未投入）

## 6. 未決（ユーザー確認待ち）

**選択待ちの間に、ターン終了やレベル再計算による消滅を進めてよいか。**

中断ガードが3件検出した（part1付近の `endTurn` 1件、part81 の `summon` 2件）。
`handleAction` は `dispatchAction` の後に事後フックを並べているが、そのうち
`forceEndTurnIfFlagged`（`endTurn` を呼ぶ）と `refreshLevelAsOverrides`
（レベル置換の再計算 → 維持コア割れの消滅）に `state.pendingChoice` のガードが無い。

進めてよくないなら、事後フックにガードを足すか、フックごと再開フレームにする。

## 7. 検証の定型（変わらず）

```
npm run typecheck && npm run validate:cards && npm run validate:notes && npm run validate:gaps && npm run smoke:quiet && npm run build:client
```

**`npm run smoke:interactive` は定型に入れない**（診断用。上記3件の検出で現在 exit 1）。

E2E は `PORT=3100 npx tsx server/src/index.ts` を起動してから `PORT=3100 npx tsx scripts/e2e.ts`。
現在 smoke 6750件・E2E 全緑。
