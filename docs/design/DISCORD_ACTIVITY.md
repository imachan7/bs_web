# Discord Activity 化の計画

**状態: 未着手（2026-09-10 調査のみ）。** この文書は「Discord 上で対戦できるようにする」ための
調査結果と段取りを置く場所。実装に入るときは §5 の段0から。

## 1. 結論

**Discord Activity（Embedded App SDK）で実装する。** ボイスチャンネルの iframe 内で web アプリを
動かす仕組みで、Discord 上でゲームを遊ばせる方法は実質これしかない。

**エンジン・カードデータ・smoke には一切触らない。** 作業はロビーの入口（`public/src/main.ts`）と
Developer Portal の設定に閉じる。新規依存は `@discord/embedded-app-sdk` 1本だけ。

## 2. なぜこのリポジトリは適合が良いのか

Discord は全通信を `<client_id>.discordsays.com` のプロキシ経由に強制し、CSP で
**自分のアプリのプロキシドメイン以外への通信を全部落とす**（`blocked:csp`）。
外部リソースは Portal の URL Mapping に登録するか `patchUrlMappings()` で書き換えないと動かない。

| Discord の制約 | 現状 | 判定 |
| :-- | :-- | :-- |
| 外部CDN禁止 | socket.io クライアントは `/socket.io/socket.io.js`（自前配信）、CSS に外部URLゼロ、カード画像なし | ✅ そのまま |
| fetch は同一オリジンのみ | `/api/cards` `/api/changelog` `/data/card-notes.json` すべて相対パス | ✅ そのまま |
| WebSocket のみ可（WebRTC / WebTransport 不可） | socket.io。Azure B1 で WebSocket 有効済み | ✅ そのまま |
| iframe 埋め込み可 | helmet 等を入れていないので `X-Frame-Options` 無し | ✅ そのまま |
| HTTPS 必須 | `https://bs-web-910728969072.asia-northeast1.run.app`（[DEPLOY_CLOUDRUN.md](../ops/DEPLOY_CLOUDRUN.md)） | ✅ そのまま |

**この表を壊す変更に注意する。** 外部CDNからライブラリを読む・カード画像を外部ホストに置く・
helmet を入れる、のどれかをやった時点で Activity 側が黙って壊れる。

## 3. 手を入れる必要がある点

### 3.1 ルームIDを `instanceId` にする（最大の価値）

Activity は起動チャンネルごとに `discordSdk.instanceId` を持ち、同じチャンネルで起動した人は
全員同じ ID を見る。これを `join` の `roomId` に流し込めば**合言葉入力が消える**。
「ボイスチャンネルで起動 → 相手も参加 → 即対戦開始」になる。
`roomManager.join(roomId, ...)` はそのまま使える。

### 3.2 3人目問題（⚠️ 未決。実装前にユーザーへ確認する）

`roomManager` は満員だと `"このルームは満員です"` を返して終わる（`server/src/roomManager.ts:90`）。
Activity はチャンネルの人が何人でも入ってこられるので**3人目以降が確実に発生する**。

- **A（推奨・最小）**: 3人目には「対戦中（〇〇 vs 〇〇）」とだけ出して待機させ、席が空いたら入れる
- **B**: 観戦モード。サーバー側で GameView をもう1本配る必要があり重い

まず A で出し、要望が出たら B。

### 3.3 名前を Discord アカウントから取る

`discordSdk.commands.authorize({ scope: ["identify"] })` → 返った `code` をサーバーの新規
エンドポイント `/api/discord/token` で client_secret と交換 → `commands.authenticate()`。
ユーザー名とアバターが取れるので名前入力欄が消える。
Azure の App Settings に `DISCORD_CLIENT_SECRET` が1本増える（**リポジトリに置かない**）。

### 3.4 socket.io のパス（段0で確定させる）

プロキシ経由だと `/.proxy/` 接頭辞が要る場合がある（旧形式のURL）。ルートマッピング
（`/` → Cloud Run の `*.run.app`）にすれば相対パスのまま通るのが基本だが、
通らなければ `io({ path: "/.proxy/socket.io" })` に切り替える。**実機で試して分岐する。**

### 3.5 localStorage が分離される

Activity 内のオリジンは `discordsays.com` 配下なので、**Web版で作った自作デッキは Discord 側から見えない**。

- 何もしない（Discord ではプリセットデッキのみ）← まずこれ
- `/deck.html` を Activity 内で開けるようにする（同一オリジンなので iframe 内遷移で動くはず）
- デッキをサーバー保存にする ← 大工事。やらない

### 3.6 画面サイズ

iframe はデスクトップで横長・モバイルで縦長。`style.css` に `@media (max-width:768px/480px)` の
土台はあるが、盤面が iframe サイズで成立するかは実機確認が要る。
モバイル対応は Portal でオフにできるので、**まずデスクトップのみで出す**。

## 4. 公開範囲と配信（Discovery）

**未検証（Unverified）Activity のまま運用する。**

- 未検証は **25人未満のサーバーと DM でしか起動できず**、開発チーム＋招待したテスターだけが使える。
  身内運用はこれで成立し、審査は要らない。コミュニティ設定も Discovery も不要
- 検証済みにして一般公開するには、チームオーナーの本人確認＋アプリ審査＋公開された
  プライバシーポリシーと利用規約が必要
- ⚠️ **バンダイ非公式のファンメイド作品なので、検証申請は App Directory のコンテンツ規約で
  IP 権利を問われる導線に自分から乗ることになる。** 技術的に失うものは何も無いので、
  未検証のまま止める

**ホスティング側（Azure）は公開必須だが、要件はすでに満たしている。**
Discord のプロキシ（Cloudflare Workers）がサーバー側から取りに来るので、インターネットから
到達できる HTTPS の URL が要る（`localhost` 不可。開発時は `cloudflared tunnel` を挟む）。
Cloud Run が返す `*.run.app` が安定ドメインなので追加作業ゼロ（独自ドメインの購入も不要）。
さらに絞るなら `Origin` が `<client_id>.discordsays.com` かを検査するか、OAuth トークンを
サーバーで検証してから `join` を通す。**IP 制限は不可**（Discord がプロキシIP範囲を公開していない）。

## 5. 段取り

| 段 | 内容 | 規模 |
| :-- | :-- | :-- |
| **0. スパイク** | Portal でアプリ作成 → Activities 有効化 → URL Mapping `/` → `bs-web-910728969072.asia-northeast1.run.app`。SDK を入れて `index.html` をそのまま iframe で開き、**socket.io が繋がるか**だけ確認（§3.4 の分岐を確定させる） | 半日。技術リスクはここでほぼ消える |
| **1. Discord モード** | `public/src/discord.ts` を新規1本（SDK 初期化・authorize・instanceId 取得）、`main.ts` のロビーを「Discord 内なら名前とルームIDを自動で埋めて即 join」に分岐。サーバーに `/api/discord/token` を追加 | 1〜2日・3〜4ファイル |
| **2. 3人目の扱い** | §3.2 の A 案 | 半日 |
| **3. 画面調整** | iframe サイズでの盤面確認、必要なら CSS 微調整 | 実機次第 |

## 6. やらないこと

観戦モード / デッキのサーバー保存 / モバイル最適化 / 検証申請。必要になってから。

## 7. 一次資料

- [Activities Overview](https://docs.discord.com/developers/activities/overview)
- [Networking（URL Mappings・CSP・patchUrlMappings）](https://docs.discord.com/developers/activities/development-guides/networking)
- [Building an Activity（Portal 設定・OAuth の流れ）](https://docs.discord.com/developers/activities/building-an-activity)
- [Multiplayer Experience（instanceId・participants）](https://docs.discord.com/developers/activities/development-guides/multiplayer-experience)
- [Verified と Unverified Activity](https://support-dev.discord.com/hc/en-us/articles/26576097154199-What-are-Verified-and-Unverified-Activities)

## 8. 余談（将来 Cookie を使うとき）

Discord は iframe 内の Cookie に `SameSite=None; Partitioned` を要求する。
現在このアプリは Cookie を使っていない（socket.io も不要）ので該当しない。
