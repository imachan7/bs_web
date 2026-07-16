# Azure App Service へのデプロイ手順

bs_web を Azure App Service（Linux, Node）にデプロイするための手順書。
Azure for Students（クレジットカード不要）での利用を前提とする。

## 前提・制約

- ゲーム状態はサーバーのメモリ内に保持している（DBなし）。そのため:
  - **インスタンスは常に1つ**（スケールアウト不可。複数台にすると対戦相手が別インスタンスに割り振られて成立しない）
  - **再起動・再デプロイで進行中の対戦は消える**
- Socket.IO を使うため **WebSocket を有効化**する必要がある
- 無料プラン（F1）は WebSocket 同時接続数が5、かつ20分アイドルでスリープする。人に見せる程度の検証用途は問題ないが、複数人が同時に遊ぶ想定なら B1 以上へのスケールアップを検討する

## 1. Azure for Students に登録する

https://azure.microsoft.com/ja-jp/free/students/ から大学発行のメールアドレスで登録する（クレジットカード不要、無料枠付き）。

## 2. Azure CLI でリソースを作成する

以下はユーザー自身が実行する（このリポジトリの準備作業では az コマンドは実行していない）。

```bash
# Azure にログイン
az login

# リソースグループを作成（リージョンは東日本を例に）
az group create \
  --name bs-web-rg \
  --location japaneast

# App Service プランを作成（F1: 無料プランで試験公開。あとで B1 にスケールアップ可）
az appservice plan create \
  --name bs-web-plan \
  --resource-group bs-web-rg \
  --sku F1 \
  --is-linux

# Web App を作成（Linux, Node 20 LTS）
# --name はグローバルに一意である必要がある。<your-app-name> を変更すること
az webapp create \
  --name <your-app-name> \
  --resource-group bs-web-rg \
  --plan bs-web-plan \
  --runtime "NODE:20-lts"
```

F1 で動作確認できたら、必要に応じて B1 へスケールアップする:

```bash
az appservice plan update \
  --name bs-web-plan \
  --resource-group bs-web-rg \
  --sku B1
```

## 3. WebSocket を有効化する

Socket.IO の接続に必須。作成しただけでは無効になっているため、明示的に有効化する:

```bash
az webapp config set \
  --name <your-app-name> \
  --resource-group bs-web-rg \
  --web-sockets-enabled true
```

## 4. GitHub Actions 用に発行プロファイルを設定する

1. Azure ポータルで対象の Web App を開く
2. 「概要」タブの「発行プロファイルの取得」をクリックしてダウンロード（XMLファイル）
3. GitHub リポジトリの `Settings > Secrets and variables > Actions > New repository secret` を開く
4. 名前を `AZURE_WEBAPP_PUBLISH_PROFILE`、値をダウンロードしたXMLの中身全体にして登録する
5. `.github/workflows/azure-deploy.yml` の `env.AZURE_WEBAPP_NAME` を実際の Web App 名（手順2の `<your-app-name>`）に書き換えてコミットする

## 5. デプロイする

`main` ブランチに push すると GitHub Actions が自動で以下を実行する:

```
checkout → Node 20 セットアップ → npm ci → npm run build
  → npm run typecheck → npm run smoke → npm run e2e相当の疎通確認
  → azure/webapps-deploy で Azure へデプロイ
```

typecheck・smoke・E2E のいずれかが失敗した場合はデプロイされない。

初回デプロイ後、`https://<your-app-name>.azurewebsites.net/health` にアクセスして
`{"ok":true,"rooms":0}` が返ることを確認する。

## 6. 運用上の注意（再掲）

- **F1 プランはアイドル20分でスリープする**。スリープ後の初回アクセスは起動待ちで数秒〜十数秒かかる
- **F1 プランは WebSocket 同時接続数が5まで**。1対戦あたり2接続を使うため、同時に遊べるのは最大2組程度
- デプロイ・再起動のたびに進行中の対戦はすべて失われる（メモリ内状態のため）。人に見せるタイミングでは事前にデプロイを済ませておくこと
- スケールアウト（インスタンス数を2以上にする）は絶対に行わない。対戦の同期が壊れる
