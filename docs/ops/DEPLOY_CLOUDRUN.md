# Cloud Run へのデプロイ

**本番: https://bs-web-battle.app**
（プロジェクト `bs-web-imachan` / リージョン `asia-northeast1` / サービス `bs-web`）
Cloud Run 既定の `https://bs-web-910728969072.asia-northeast1.run.app` も**生きたまま**で、
どちらでも同じサービスに届く。詳細は §1.3。

**2026-09-11 に Azure（bs-web-rg / bs-web・B1）から移行。** 理由は Azure for Students の
クレジットが尽きたこと。旧環境の手順は [DEPLOY.md](./DEPLOY.md)（残してあるが本線ではない）。

## 0. なぜ Cloud Run なのか（と、その代償）

このアプリの host 要件は「**常時1プロセス・WebSocket・永続ディスク不要**」。
部屋の状態が `roomManager.rooms`（メモリ上の `Map`）なので**水平スケールできない**。
Vercel / Netlify / Cloudflare Workers はサーバーレス関数で WebSocket が張れないため失格。

Cloud Run を選んだのは、無料枠に収まる見込みがあり、かつ OS の面倒を見なくていいから。
**代償が3つある**（§4）。どれも致命傷ではないが、知らずに踏むと原因が分からなくなる。

無料枠は月あたり 180,000 vCPU秒 / 360,000 GiB秒 / 200万リクエスト。
**課金されるのは「インスタンスが生きている時間」で、WebSocket が張られている間はずっと生きている。**
`--cpu=1 --memory=512Mi` で**月およそ50時間**の接続時間まで無料。

⚠️ **`--cpu` を1未満にはできない。** 0.5 を指定すると
`Total cpu < 1 is not supported with concurrency > 1` で弾かれる（2026-09-11 に実際に踏んだ）。
CPU を減らすには `--concurrency=1` が必要だが、それは「同時に1接続だけ」の意味で
**2人対戦が成立しない**（WebSocket 接続がそれぞれ1リクエストとして数えられる）。
つまり**このアプリで無料枠を月50時間より伸ばす方法は無い**。

## 1. 初回セットアップ

```bash
brew install --cask google-cloud-sdk     # gcloud が未インストール
gcloud auth login
gcloud projects create bs-web-<任意の接尾辞>   # プロジェクトIDは全世界で一意
gcloud config set project <上で作ったID>
# 課金アカウントの紐付けが必須（無料枠を使うだけでもカード登録が要る）。コンソールで行う
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### 1.1 ⚠️ デフォルトのサービスアカウントに権限を付ける（初回だけ・必須）

新規プロジェクトでは**デフォルトの Compute サービスアカウントに Cloud Build 用の権限が付かない**。
これを忘れると初回デプロイが `PERMISSION_DENIED: Build failed because the default service account is
missing required IAM permissions` で落ちる（2026-09-11 に実際に踏んだ）。

```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member=serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
  --role=roles/cloudbuild.builds.builder --condition=None
```

## 1.2 GitHub Actions はデプロイしない

`.github/workflows/ci.yml` は **typecheck / カードデータ検査 / smoke / E2E を回すだけ**。
デプロイは下の `gcloud run deploy` を手元から叩く運用（GitHub に GCP の資格情報を
置く判断をしていないため）。自動デプロイにするなら Workload Identity Federation を
設定して `google-github-actions/deploy-cloudrun` を足す。

Azure 時代の `azure-deploy.yml` は 2026-09-12 に `ci.yml` へ改名し、
Azure へのデプロイ手順を落とした（クレジット切れで宛先が死んでいたため）。

## 1.3 カスタムドメイン（2026-09-12 に設定）

`bs-web-battle.app`（name.com で取得）を **Cloud Run のドメインマッピング**で繋いである。
**グローバル外部 ALB は使っていない** — 転送ルールだけで月 $18〜かかり、
無料枠で運用している意味が無くなるため。マッピングは無料だが Google 曰く preview 扱いで
「レイテンシの問題があり production-ready ではない」。趣味規模なので許容した。

```
gcloud beta run domain-mappings describe --domain=bs-web-battle.app --region=asia-northeast1
```

**DNS（name.com の Manage DNS Records、すべて Host `@`）**:

| 種別 | 値 |
| :-- | :-- |
| A ×4 | `216.239.32.21` / `216.239.34.21` / `216.239.36.21` / `216.239.38.21` |
| AAAA ×4 | `2001:4860:4802:32::15` / `:34::15` / `:36::15` / `:38::15` |
| TXT | `google-site-verification=...`（所有権確認。**消すとマッピングが壊れる**） |

証明書は Google 管理で自動更新（発行元 Google Trust Services、90日）。

**踏まないための注意:**

- **`--use-http2` を有効にしないこと。** WebSocket のハンドシェイクが壊れる
- クライアントは `public/src/main.ts` で `io()` を**引数なし**で呼ぶ＝同一オリジン接続。
  だからドメインを増やしてもクライアント側の変更は要らない。ここにURLをベタ書きしないこと
- 頂点ドメインなので CNAME は使えない。A/AAAA は**出た本数を全部**入れる（1本だけだと不安定）
- SEO 用のURL（`og:url` / `canonical` / `sitemap.xml` / `robots.txt`）は `bs-web-battle.app` に統一済み

## 2. デプロイ（毎回これ1本）

ローカルビルドは不要。**イメージの中で `npm run build:client` が走る**ので、
Azure 時代の「古い zip を再デプロイして反映されない」事故は構造的に起きない。

```bash
gcloud run deploy bs-web \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --cpu=1 \
  --memory=512Mi \
  --cpu-boost \
  --timeout=3600 \
  --concurrency=80
```

**各フラグは全部意味がある。消さないこと:**

| フラグ | 理由 |
| :-- | :-- |
| `--max-instances=1` | **これが一番効く安全弁。** 部屋がメモリ上にあるので2台目が立つと対戦が壊れる。暴走課金の上限にもなる |
| `--min-instances=0` | 誰も居ない間は課金しない。代償は §4.1 |
| `--timeout=3600` | **既定は300秒で、5分で WebSocket が切られる。** 3600秒が Cloud Run の上限 |
| `--cpu-boost` | 起動時だけCPUを増やす。`tsx` が毎回 TypeScript を変換するので起動が重い |
| `--cpu=1` | **1未満は指定できない**（上記）。無料枠は月50時間ぶん |

デプロイ後の検証（Azure 時代と同じ観点）:

```bash
URL=$(gcloud run services describe bs-web --region asia-northeast1 --format='value(status.url)')
curl -s $URL/health
curl -s $URL/data/cards.json | head -c 200      # 件数がローカルと合うか
curl -sI $URL/dist/main.js | grep -i length      # サイズがローカルと合うか
```

## 3. 課金事故を防ぐ

- **予算アラートを必ず作る**（コンソール → お支払い → 予算とアラート。$1 で通知）。
  Cloud Run にハードな停止機構は無いので、`--max-instances=1` とアラートが防御線
- **Artifact Registry の無料枠は 0.5GB しかない。** イメージは1世代 250MB 前後なので
  2世代で埋まる。**クリーンアップポリシーを設定して古い版を自動削除する**
  （リポジトリ `cloud-run-source-deploy` に「最新3件を残す」を設定）
- ログ（`accessLog.ts` の `console.log`）は Cloud Logging に自動で乗る。無料枠は月50GiB
- **予算アラートは設定済み**（請求先 `0103EF-09E4D3-248E0D`・¥500 で 50%/90%/100% 通知）
- **クリーンアップポリシーも設定済み**（`keep-recent-3` と `delete-old`（7日）。初回時点で 119MB）

## 4. Cloud Run の代償（3つ）

### 4.1 全員が切断すると部屋が消える

`--min-instances=0` なのでアイドルでインスタンスが落ち、`roomManager.rooms` が飛ぶ。
ただし Cloud Run は**最後のリクエストが終わってもしばらくインスタンスを保持する**ため、
リロード程度では消えない。消えるのは「両者が数分以上いなくなったとき」。
実害が出るようなら `--min-instances=1` にする（**無料枠を常時食うので月50時間＝2日で尽きる**）。

### 4.2 60分でリクエストがタイムアウト → 席に戻れない

`--timeout=3600` が上限なので、**60分を超える対局は WebSocket が一度切られる**。
socket.io は自動で再接続するが、**このアプリは座席を `socket.id` で引いている**
（`roomManager.findBySocket`）ため、再接続すると別人扱いで席に戻れない。

これは Cloud Run 固有ではなく**元からある弱点**（Wi-Fi の瞬断・スマホのスリープ復帰でも同じ）。
直すなら「join 時にクライアントが `localStorage` の再接続トークンを送り、座席にトークンを持たせ、
同じトークンなら `connected:false` の席に座り直せる」。20行程度。**未着手。**

### 4.3 バグ報告のファイルが消える

`fs.appendFileSync(BUG_REPORT_FILE, ...)`（`server/src/index.ts:254`）はコンテナのローカルディスクに
書くので、**デプロイやインスタンス再作成で消える**。Azure では `BUG_REPORT_DIR=/home/bugreports` に
逃がしていたが、Cloud Run に永続ディスクは無い。

対処は「同じ内容を `console.log` にも出す」の1行（Cloud Logging に残り、`gcloud logging read` で拾える）。
`/api/bug-reports` の画面は使えなくなる。**未着手。**

## 5. ロビーのタブ放置に注意（コストの主因）

`public/src/main.ts` はページを開いた瞬間 `io()` で接続する。**タブを開きっぱなしにされると
その間ずっとインスタンスが生き、無料枠を食う。** 友達1人が24時間放置すると、それだけで月720時間（無料枠は50時間）。

対策は「対戦に入っていない socket を15分で切る」をサーバー側に入れること（数行）。**未着手。**
まず様子を見て、請求アラートが鳴ってから入れてもよい。

## 6. Discord Activity との関係

Cloud Run が返す `https://bs-web-xxxxx.asia-northeast1.run.app` は安定したドメインなので、
[DISCORD_ACTIVITY.md](../design/DISCORD_ACTIVITY.md) の URL Mapping にそのまま使える。
独自ドメインの購入は不要。
