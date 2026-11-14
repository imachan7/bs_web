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

## 1.2 デプロイは手動で起動する（2026-09-23）

`.github/workflows/ci.yml` は、main への push と PR では **typecheck / カードデータ検査 / smoke / E2E を回すだけ**。
本番へ出すのは、GitHub の Actions 画面で「Run workflow」を押して **main** を選んだときだけ（`deploy` ジョブ）。
認証は Workload Identity Federation。

マージのたびに出さないのは、部屋の状態がメモリ上にあり、**デプロイで対戦中の試合が消える**ため。
いくつかの PR をまとめてから、対戦が少ない時間を選んで出す。

Azure 時代の `azure-deploy.yml` は 2026-09-12 に `ci.yml` へ改名し、
Azure へのデプロイ手順を落とした（クレジット切れで宛先が死んでいたため）。

## 1.2.1 対戦中のルームを待ってから出す・状態を見る（2026-11-12）

デプロイの前に、対戦中の人へ画面上部の帯でお知らせを出し、**対戦中のルームが無くなるまで最大20分待ってから**出す（空けばすぐ出す）。
時間切れなら、お知らせを消してデプロイを止める。急ぐときは「Run workflow」の **force** にチェックを入れる（対戦中の試合は消える）。

- 「対戦中」＝決着前・人間が接続中・最後の操作から10分以内のルーム（`server/src/admin.ts`）。相手待ちや放置のルームは待たない
- 状態は `npm run status` で見る（`-- notice "文面"`／`-- notice --clear`／`-- wait 20` も使える。`scripts/status.ts`）
- 口は `GET /api/admin/status`・`POST /api/admin/notice`。鍵を `x-admin-key` ヘッダーで渡したときだけ応答し、ほかは 404

**鍵の準備（1回だけ。ルームが空いているときに行う。2〜3はリビジョンが入れ替わる）**

```bash
# 1. 鍵を作る（中身は表示しない。ユーザーと Claude はこのファイルから読む）
openssl rand -hex 24 > ~/.config/bs_web_admin_key && chmod 600 ~/.config/bs_web_admin_key
# 2. Secret Manager に入れ、実行用のサービスアカウントに読ませる
gcloud secrets create bs-web-admin-key --data-file="$HOME/.config/bs_web_admin_key" --project=bs-web-imachan
SA=$(gcloud run services describe bs-web --region asia-northeast1 --project bs-web-imachan --format='value(spec.template.spec.serviceAccountName)')
SA=${SA:-910728969072-compute@developer.gserviceaccount.com}   # 空なら既定のサービスアカウント
gcloud secrets add-iam-policy-binding bs-web-admin-key --project=bs-web-imachan --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
# 3. Cloud Run に環境変数 ADMIN_KEY として渡す（以後の gcloud run deploy でも残る）
gcloud run services update bs-web --region asia-northeast1 --project bs-web-imachan --update-secrets=ADMIN_KEY=bs-web-admin-key:latest
# 4. GitHub Actions に同じ値を渡す
gh secret set ADMIN_KEY < ~/.config/bs_web_admin_key
```

**この仕組みが入る最初のデプロイは force で出す**（それまでの本番には口が無く、待機の手順が 404 で止まるため）。

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

### 4.2 60分でリクエストがタイムアウト → 席に戻る（2026-11-13 対応）

`--timeout=3600` が上限なので、**60分を超える対局は WebSocket が一度切られる**。Wi-Fi の瞬断・スマホのスリープ復帰・ページの読み直しでも接続は切れる。

接続が変わっても同じ席に戻す：クライアントは端末ごとの合言葉（`localStorage` の `bs_player_ref`）を接続時に送り、席がそれを覚える。
繋ぎ直したクライアントは `resume` を送り、サーバーは合言葉が一致する決着前の対局の席に座らせ直す（`roomManager.resume`）。

- 決着前の対局は、全員が切れても部屋を残す。全員が切れたまま15分（`RESUME_GRACE_MS`）で片付ける。全員が切れるとインスタンス自体が止まって部屋ごと消える（§4.1）ので、これより長くしても意味がない
- **決着前のまま20分（`ROOM_IDLE_MS`）誰も操作しない対局は、接続を切って課金を止める**（2026-11-13 ユーザー決定）。席は残るので、画面を操作すれば繋ぎ直して続きから遊べる
- 対戦を途中でやめるには降参する（ページを読み直すと席に戻るため）
- 合言葉を知っていれば席に座れるので、相手・一覧・ログには出さない

### 4.3 バグ報告はログに残す（2026-09-22 対応）

`/api/bug-report` は報告を**1行のJSONで標準出力にも出す**（`severity: NOTICE`、本文は `jsonPayload.bugReport`）。
Cloud Run のディスクはデプロイで消えるので、**正本は Cloud Logging**。ファイル（`bug-reports.jsonl`）と
管理画面 `https://bs-web-battle.app/api/bug-reports?key=<BUG_REPORT_KEY>` は、最後のデプロイ以降の分しか見えない。

```
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.bugReport:*' --limit=20 --format=json
```

ゆくゆくは Discord の Webhook へも送り、チャンネルで読めるようにしたい（ユーザー希望。未着手）。

## 5. ロビーのタブ放置に注意（コストの主因）

`public/src/main.ts` はページを開いた瞬間 `io()` で接続する。**タブを開きっぱなしにされると
その間ずっとインスタンスが生き、無料枠を食う。** 友達1人が24時間放置すると、それだけで月720時間（無料枠は50時間）。

**対策済み（2026-09-18）**：対戦していない状態が15分続いた socket をサーバーが切る
（`server/src/index.ts` の「放置接続の切断」。待機列・相手待ちのルーム・決着前の対局は対象外）。
クライアントは次の操作かタブ復帰で再接続する。時間は環境変数 `IDLE_DISCONNECT_MS` で変えられる。
残る穴は「決着しないまま2人とも放置した対局」で、これは `--timeout=3600` の60分で切れる。

### 5.1 AI戦はブラウザの中で動かす（2026-11-13）

実測（2026-11-13 までの30日）：課金対象の稼働は 92.9 時間で、無料枠（月約50時間）を超えていた。
対戦開始 1,626 件の内訳は AI戦 1,443（88%）・合言葉 135・ランダムマッチ 48。稼働時間の大半は AI戦の接続だった。

AI戦は Web Worker（`public/src/aiWorker/worker.ts` → `public/dist/aiWorker.js`）がエンジンと AI を動かし、サーバーへ接続しない。
サーバーが動くのは対人戦の間だけになる。副作用として、AI戦はデプロイ・再起動・60分のタイムアウト（§4.2）で切れなくなる。

- 始めた件数は `POST /api/ai-start` が従来と同じ `#ACCESS join （AI戦）` の行で残す
- Worker を起動できないブラウザは、従来どおりサーバーの `startAi` で対戦する（その分は接続を張る）
- **エンジンに Node 専用の import や `process` の参照を足すと Worker に束ねられない。** `npm run build:client` が束ねた直後に Node 無しの環境で1戦を始めて確かめるので、そこで落ちる
- 利用者が増えたときに次に効くつまみは `--concurrency=80`（同時接続の上限。対人戦40卓ぶん）。対人戦が同時に30卓を超え始めたら引き上げる（料金は変わらない）

### 5.2 相手待ちは接続を張らずに問い合わせる（2026-11-14）

ランダムマッチの待機列と合言葉ルームの相手待ちは、15分切断の対象外で、待っている間ずっと接続（＝課金）が続いていた。
いまは待っている間 socket をつながず、クライアントが3秒おきに `POST /api/match/wait` で聞きに行く（`server/src/matchTickets.ts`・`public/src/matchWait.ts`）。
課金は要求を処理している間だけなので、待ち時間の分はほぼ掛からない。

- 同じ待ち場所（ランダムマッチは `random`、合言葉ルームは `room:<合言葉>`）に2人そろうと、2人に同じ roomId（`match-…`）を返す。受け取った側が socket をつないで、従来の `join` でそのルームへ入る
- 待ちはメモリ上にしか無い。インスタンスが止まって消えても、クライアントの次の問い合わせで並び直す
- 10秒問い合わせが無い待ちは捨てる（閉じたタブと組ませない）。**裏に回したタブはブラウザがタイマーを間引くので、長く裏に置くと列から外れ、表に戻したときに並び直す**
- 相手が roomId を受け取る前に閉じた場合、残った側は15秒待ってから席を外して自動で待ち直す
- 待ち始めは従来と同じ `#ACCESS join` の行で残す（問い合わせ自体は記録しない）。待ち直しも1件に数える
- サーバーの socket の `randomMatch`・合言葉の `join` は残してある（デプロイ前から開いているタブ・E2E）。デプロイの直後だけ、古いタブで待っている人と新しいタブの人は当たらない
- タブを閉じても待てるようにする（Web Push＋外部ストア。INTEGRATED_LOBBY の Phase 2）のは、待ちの件数が増えてから考える

## 6. Discord Activity との関係

Cloud Run が返す `https://bs-web-xxxxx.asia-northeast1.run.app` は安定したドメインなので、
[DISCORD_ACTIVITY.md](../design/DISCORD_ACTIVITY.md) の URL Mapping にそのまま使える。
独自ドメインの購入は不要。

## 旧カードの画像（隠し要素。2026-11-02）

画像は git 管理外。手元で取って縮小し、Cloud Storage のバケット（`bs-web-card-images`）に置く。**イメージには含めず、Cloud Run にバケットをつないで `/app/public/imgs/cards` として読む**（2026-11-12。以前はデプロイのたびに全部取って焼き込んでいて、毎回1分前後かかっていた）。画像を足すときはバケットに上げるだけで、デプロイは要らない。同じドメインから配るので Discord Activity の「外部ホスト禁止」も守れる。
画面に出るのは、入力欄に「ゲートオープン開放」と打った端末だけ（`public/src/cardArt.ts`）。

1. 画像を取る・縮小する（取得済みは飛ばす。全部で1時間強）
   `npx tsx scripts/download-card-images.ts && npx tsx scripts/optimize-card-images.ts`
2. 画像を上げる（画像を足したら同じコマンドで上げ直す。**original は上げない**＝バケットの中身がそのまま配られる）
   `gcloud storage rsync --recursive --exclude 'original/.*' public/imgs/cards gs://bs-web-card-images`
3. **初回だけ**：実行用のサービスアカウントにバケットの読み取りを付け、Cloud Run にバケットをつなぐ（つなぐ設定はサービスに残り、以後の `gcloud run deploy` でも消えない。リビジョンが入れ替わるので、ルームが空いているときに行う）
   ```bash
   SA=$(gcloud run services describe bs-web --region asia-northeast1 --project bs-web-imachan --format='value(spec.template.spec.serviceAccountName)')
   SA=${SA:-910728969072-compute@developer.gserviceaccount.com}   # 空なら既定のサービスアカウント
   gcloud storage buckets add-iam-policy-binding gs://bs-web-card-images --member="serviceAccount:$SA" --role=roles/storage.objectViewer
   gcloud run services update bs-web --region asia-northeast1 --project bs-web-imachan \
     --execution-environment=gen2 \
     --add-volume=name=cards,type=cloud-storage,bucket=bs-web-card-images,readonly=true \
     --add-volume-mount=volume=cards,mount-path=/app/public/imgs/cards
   ```
   バケットをつなぐには第2世代の実行環境（gen2）が要る。サーバーは `/imgs/cards` に7日のキャッシュを付けて返す（`server/src/index.ts`）

容量の上限は無い。約2,200枚で md/sm/xs 合わせて数十MB、保存料は月1円未満。
