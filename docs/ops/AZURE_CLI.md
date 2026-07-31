# Azure CLI ガイド（bs_web のメンテナンス＋学習用）

bs_web の本番環境（Azure App Service）を Azure CLI で管理するためのガイド。
初期構築の手順は [DEPLOY.md](./DEPLOY.md) を参照。ここでは「日常のメンテナンスで使うコマンド」と
「Azure CLI の読み書きができるようになるための基礎知識」をまとめる。

---

## 1. Azure CLI の基礎知識

### コマンドの構造

Azure CLI のコマンドはすべて次の形をしている:

```
az <サービス> [<サブグループ>] <動詞> --パラメータ 値 ...
```

例: `az webapp log tail` は「webapp サービスの log サブグループの tail（追いかけ表示）」。
動詞は `create` / `show`（1件表示）/ `list`（一覧）/ `update` / `delete` / `set` あたりが頻出で、
**`show` と `list` は読み取り専用なので何度実行しても安全**。`delete` 系だけは慎重に。

### 困ったら --help

すべての階層で `--help` が使える。コマンドを覚えるより「掘り方」を覚える方が早い:

```bash
az webapp --help              # webapp でできることの一覧
az webapp log --help          # ログ関連のサブコマンド一覧
az webapp deploy --help       # deploy の全パラメータと使用例
```

### 出力の整形（--query と -o）

出力は既定で JSON。`-o table` で表形式、`--query`（JMESPath 記法）で絞り込みができる:

```bash
# 表形式で一覧
az webapp list -o table

# 欲しいフィールドだけ抜き出す（JMESPath）
az webapp show -n bs-web -g bs-web-rg --query "{状態:state, URL:defaultHostName}" -o json

# 配列から名前だけ
az webapp list --query "[].name" -o tsv
```

### リソースの階層（このプロジェクトの場合）

```
サブスクリプション: Azure for Students（月次クレジット。az account show で確認）
└─ リソースグループ: bs-web-rg（japaneast。関連リソースをまとめる箱）
   └─ App Service プラン: bs-web-plan（課金単位。サーバーの性能・料金はここで決まる）
      └─ Web App: bs-web（アプリ本体 → https://bs-web.azurewebsites.net）
```

- ほとんどのコマンドで `-n <リソース名> -g <リソースグループ名>` の2つを指定する
- **プラン（bs-web-plan）とアプリ（bs-web）は別物**。料金・スペックの変更はプラン側、
  デプロイ・設定・ログはアプリ側のコマンドを使う

### ログインとアカウント確認

```bash
az login                # ブラウザが開いて認証（初回や期限切れのとき）
az account show         # いまどのサブスクリプションに繋がっているか確認
```

---

## 2. 日常のメンテナンスコマンド集

### 状態確認（すべて読み取り専用・安全）

```bash
# アプリが動いているか（state が Running なら稼働中）
az webapp show -n bs-web -g bs-web-rg --query "{state:state, host:defaultHostName}" -o json

# プランの現在の SKU（F1 か B1 か）
az appservice plan show -n bs-web-plan -g bs-web-rg --query "{sku:sku.name, tier:sku.tier}" -o json

# 主要な設定（WebSocket・Always On）
az webapp config show -n bs-web -g bs-web-rg --query "{webSockets:webSocketsEnabled, alwaysOn:alwaysOn}" -o json
```

### デプロイ（コード更新の反映）

```bash
# 1. クライアントをビルド
npm run build:client

# 2. 必要ファイルだけを zip に固める
zip -qr /tmp/bs_web_deploy.zip package.json package-lock.json tsconfig.json server public data

# 3. デプロイ（SCM_DO_BUILD_DURING_DEPLOYMENT=true のためサーバー側で npm install が走る。数分かかる）
az webapp deploy -n bs-web -g bs-web-rg --src-path /tmp/bs_web_deploy.zip --type zip
```

- 進行中の対戦は**再デプロイで消える**（ゲーム状態はメモリ内のため）
- 同じデプロイを二重に実行しても後発が弾かれるだけで壊れはしない
- デプロイの進行状況・失敗理由はデプロイログで見る:

```bash
az webapp log deployment show -n bs-web -g bs-web-rg   # 最新デプロイの詳細ログ
```

### アプリのログを見る（トラブルシューティングの基本）

```bash
# リアルタイムでログを流す（Ctrl+C で終了）。起動失敗・実行時エラーの調査はまずこれ
az webapp log tail -n bs-web -g bs-web-rg

# ログ一式を zip でダウンロード
az webapp log download -n bs-web -g bs-web-rg --log-file /tmp/bs-web-logs.zip
```

### 再起動・停止・開始

```bash
az webapp restart -n bs-web -g bs-web-rg   # 挙動がおかしいときの再起動
az webapp stop    -n bs-web -g bs-web-rg   # 完全停止（アクセス不可になる）
az webapp start   -n bs-web -g bs-web-rg   # 再開
```

### プラン変更（節約運用）

プラン変更は秒単位課金で即反映されるため、**遊ぶ期間だけ B1、使わないときは F1** の運用ができる:

```bash
# 無料に戻す（Always On は自動で無効化される。20分アイドルでスリープ・WebSocket 5接続に制限）
az appservice plan update -g bs-web-rg -n bs-web-plan --sku F1

# 有料 B1 へ（戻したら Always On も再有効化する）
az appservice plan update -g bs-web-rg -n bs-web-plan --sku B1
az webapp config set -n bs-web -g bs-web-rg --always-on true
```

| | F1（無料） | B1（約$13/月） |
| :-- | :-- | :-- |
| WebSocket 同時接続 | 5本 | 制限緩和 |
| アイドルスリープ | 20分で停止（次アクセスが遅い） | Always On で常時稼働 |
| 用途 | 動作確認・一人で試す | 友達と対戦する期間 |

※ Linux プランに F1 と B1 の中間（Shared/D1）は存在しない（Windows 専用）。

### アプリ設定（環境変数）

```bash
az webapp config appsettings list -n bs-web -g bs-web-rg -o table
# 例: デプロイ時ビルドの有効化（設定済み）
az webapp config appsettings set -n bs-web -g bs-web-rg --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

---

## 3. トラブルシューティング早見表

| 症状 | 最初にやること |
| :-- | :-- |
| サイトが開かない・503 | `az webapp show ... --query state`（Running か）→ `az webapp log tail` で起動エラー確認 → `az webapp restart` |
| デプロイしたのに反映されない | `az webapp log deployment show` でビルド失敗を確認（npm install のエラーが多い） |
| 最初のアクセスだけ異常に遅い | F1 のスリープ復帰。仕様なので、常用するなら B1 + Always On |
| 対戦の接続が切れる・入れない | F1 の WebSocket 5接続制限の可能性 → B1 へ |
| `az` が認証エラー | `az login` し直し → `az account show` で Azure for Students になっているか確認 |

## 4. お金の管理

- Azure for Students は年間 $100 のクレジット。使用状況は [Azure Portal](https://portal.azure.com) の
  「Cost Management」で確認するのが確実（CLI でも `az consumption usage list` があるが Portal が見やすい）
- 課金が発生するのは実質 **App Service プラン（B1 のとき）だけ**。不安になったら F1 に戻せば課金は止まる
- リソースを完全に消すなら `az group delete -g bs-web-rg`（**取り返しがつかないので注意**。
  再構築は DEPLOY.md の手順で可能）

## 5. 学習を進めるときのコツ

1. **読み取り系（show/list/log）は好きなだけ叩いて壊れない**。まず `-o table` で眺める癖をつける
2. 知らない操作は `az <サービス> --help` で掘る → 出てきたコマンドを `--query` で整形してみる
3. Portal（GUI）と CLI は同じものを見ている。CLI でやった変更を Portal で見てみると対応関係が掴める
4. 本リポジトリでは: 初期構築= [DEPLOY.md](./DEPLOY.md)、日常運用=このファイル、と分担している
