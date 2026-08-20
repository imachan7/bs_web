# 日々の保守

動かす・調べる・直す・出す。作業の種類ごとのコマンドと、詰まったときの手順。

---

## 1. 動かす

```bash
npm run dev          # サーバー（tsx watch）とクライアント（esbuild --watch）を同時に起動
```

個別に動かすとき:

```bash
npm run dev:server   # サーバーだけ（ファイル変更で自動再起動）
npm run dev:client   # クライアントのビルドだけ監視
npm start            # 本番同等でサーバーを起動（watch なし）
PORT=3100 npm start  # ポートを変える
```

対戦は2人必要なので、**ブラウザのタブを2つ開いて同じルームに入る**（片方をシークレットウィンドウにすると混乱が少ない）。

### 盤面を作って試す（デバッグ機能）

「この盤面でこの効果を試したい」ができる。**ローカル実行時だけ有効**。

- 判定は `WEBSITE_SITE_NAME`（Azure が必ず設定する）が無いこと。明示切り替えは `BS_DEBUG_TOOLS=1` / `0`
- 2人が揃って対戦が始まってから使う（始まる前は 409 が返る）
- クライアント側の入口は `/api/debug/enabled` が `true` のときだけ出る

実体は `server/src/logic/debugBoard.ts` と `POST /api/debug/setup`。

---

## 2. 調べる（検査ツールの使い分け）

**それぞれ見ているものが違う。** 目的に合ったものを選ぶ。

| コマンド | 何を見るか | いつ回すか |
| :-- | :-- | :-- |
| `npm run typecheck` | 型（`tsc --noEmit`） | 常に |
| `npm run smoke` / `smoke:quiet` | **書いた期待どおりに動くか**（218パート・約8,000件） | 常に。`:quiet` は失敗と集計のみ |
| `npm run validate:cards` | カードデータの構造（旧フィールド・未知の軸・未知の trigger 名） | カードデータを触ったら |
| `npm run validate:gaps` | **効果の書き忘れ**（テキストのブロック数 vs `effects` のエントリ数） | カードデータを触ったら |
| `npm run validate:notes` | `card-notes.json` の整合と文字数（140字以内・句点終わり） | `card-notes.json` を触ったら |
| `npm run audit:semantics` | **書いてあるが解釈が間違っている**疑い（報告のみ・修正しない） | 効果を実装する前後 |
| `npm run coverage:effects` | **書いたのに一度も発火していない**効果エントリ | 弾・大きなバッチを入れ終えたとき（遅い） |
| `npm run fuzz` | ランダム対戦で**壊れ方**だけを見る（例外・進行不能・カード数の保存・デッドロック） | 中断まわり・解決順を触ったとき |
| `npm run gaps:report` | 残っている実装漏れの全体像 | 次に何をやるか決めるとき |

**静的（書き忘れ）と実測（発火していない）と意味（解釈違い）は別物**で、
どれか1つでは他の2つを見つけられない。実際に見つかった事故:

- `validate:gaps` 型: マジック48枚のメイン側とスピリット13枚が長期間見過ごされた
- `coverage:effects` 型: `returnSelfToHand` の実行実績0、【激突】と turnStartResumeStep の実バグ
- `audit:semantics` 型: 「相手のスピリットが疲労したとき**自分が**ドロー」を相手がドローしていた（全緑のまま2日間）
- `fuzz` 型: 選択に応答しても解消せず**実プレイで進行不能**になるバグ

### バッチ完了時の定型

```bash
npm run typecheck && npm run validate:cards && npm run validate:notes && npm run validate:gaps && npm run smoke:quiet && npm run build:client
```

実装漏れを減らしたら `npm run gaps:update` でベースラインを縮める（消し忘れも検出される）。

### E2E

```bash
PORT=3100 npx tsx server/src/index.ts      # 別ターミナルで起動しておく
PORT=3100 npx tsx scripts/e2e.ts
```

### コードの構造を見る

```bash
npx tsx tools/analyze.ts && open tools/graph.html
```

依存関係と関数の呼び出し関係を1枚のHTMLで見る。詳しくは `ARCHITECTURE.md` 9章と `tools/memo.md`。

---

## 3. 詰まったときの手順

### 「効果が動かない」

1. `npm run validate:gaps` — そもそも書けているか
2. カードデータを直接見る — `grep -n "カード名" data/cards/*.json`
3. `levels` は合っているか、`trigger` と `fieldEvent` を取り違えていないか（`EFFECT_RECIPES.md` 3章）
4. `npm run coverage:effects` — そのエントリは一度でも発火しているか
5. デバッグ盤面で再現する（1章）

### 「smoke が落ちた」

`npm run smoke:quiet` は失敗行だけを出す。落ちたパート番号のファイル（`scripts/smoke/partN.ts`）を開き、
`assert` の説明文から何を期待していたかを読む。

⚠️ **落ちたテストが正しいとは限らない。** 効果文と照らして、テストの期待値のほうが間違っていないか確認する
（「バグを仕様として固定したテスト」が実在した）。

### 「実プレイで進行不能になった」

`npm run fuzz` を回す。選択待ちが解消しない系のバグはこれが見つける。
中断まわりは `BS_DEBUG_CHECKS=1`（smoke は常にオン）で
「中断したのに処理を続けた」を検出できる。

### 「対戦者からバグ報告が来た」

報告は `POST /api/bug-report` で `data/bug-reports.jsonl` に溜まる
（Azure では `BUG_REPORT_DIR=/home/bugreports` に逃がしてある。デプロイの上書きで消えないため）。
`GET /api/bug-reports` で読める。

---

## 4. 出す（デプロイ）

Azure App Service（Linux, Node）。手順は `docs/ops/DEPLOY.md`、CLI の詳細は `docs/ops/AZURE_CLI.md`。

構成上の制約を忘れない:

- **状態はメモリのみ**なので、インスタンスは常に1つ（スケールアウト不可）
- **再起動・再デプロイで進行中の対戦は消える**
- Socket.IO のため **WebSocket を有効化**する必要がある
- 現在は B1（WebSocket 同時100・アイドルスリープなし）

### お知らせ

対戦者に見せる更新情報は `data/announcements.json` に書く（`GET /api/changelog` が読む）。

```json
{ "date": "2026-08-20", "category": "new", "text": "第十弾のカードを追加しました" }
```

`category` は `fix` / `ui` / `new` / `info` / `update`。
**`text` は対戦者が読む文面**なので内部用語・ファイル名・カードIDを書かない。
出すのは「まとまった単位が入り終わったとき」と「対戦者に影響するバグを直したとき」だけ。

かつてコミットメッセージの `[release]` を拾っていたが、①文面の訂正に履歴書き換えが要る
②`.git` の無いデプロイ成果物では常に空になる ③開発者向けの履歴と対戦者向けの文面は目的が別、
の3点で JSON に移した。

---

## 5. 作業の進め方

### コミット

検証が全緑になった単位でコミットする。未コミットの巨大な差分は、確認のたびに読む量が増えて損をする。

```bash
git add <触ったファイルを明示>    # git add -A を使わない
git commit -m "日本語で変更の要約"
```

`git add -A` を避けるのは、古いベースで作業していたときに**他の人が消した変更を「削除の取り消し」として復活させる**事故が
実際に起きたため（セッションログ4,375行と削除済みのUI要素が復活した）。

作業を始める前に main を取り込む。

### 変更したら更新する文書

| 変えたもの | 直す文書 |
| :-- | :-- |
| ルールの解釈・手順を決めた | `docs/design/` の該当する手順書に**1行**足す |
| 効果の語彙・3層設計 | `SPEC.md` §2（アクション一覧）・§3 |
| カードプールの構成 | `SPEC.md` §1 の該当する弾 |
| 意図的に実装しないと決めた | `data/card-notes.json` |
| デッキ構築の禁止・制限 | `server/src/logic/deckPolicy.ts`（→ `SPEC.md` §5.5） |

**決めたことを文書に落とす**のがこのリポジトリで一番効く習慣。
チャットに残すだけだと同じ規則を何度も発見し直すことになる。

---

## 6. 環境変数の一覧

| 変数 | 効果 |
| :-- | :-- |
| `PORT` | 待ち受けポート（既定 3000） |
| `BS_DEBUG_CHECKS=1` | 中断まわりの整合性検査を有効化（smoke は常にオン） |
| `BS_DEBUG_TOOLS=1` / `0` | デバッグ盤面の明示的な有効化・無効化（既定はローカルのみ有効） |
| `BUG_REPORT_DIR` | バグ報告の保存先（Azure では `/home/bugreports`） |
| `WEBSITE_SITE_NAME` | Azure が自動で設定。**あるとデバッグ機能が自動的に無効になる** |
