# bs_web 統合ロビー Phase 2 詳細設計（永続シーク＋Web Push 呼び戻し）

- 作成日: 2026-11-11
- 状態: **設計（未実装）**。本書はコードを変更しない。実装は本書のレビュー承認後に 2a → 2b の順で別 PR に分ける
- 親文書: `docs/design/INTEGRATED_LOBBY.md`（全体設計・優先順位・Phase 0〜3 の段階計画）。本書はその §10 Phase 2 を実装可能な粒度まで掘り下げたもの
- 対象: bs_web（https://github.com/imachan7/bs_web ／ 本番 https://bs-web-battle.app）

---

## 1. 目的と範囲

Phase 1 で入れた対戦募集掲示板（シーク掲示板）はオンライン限定である。投稿者がタブを閉じる・回線が切れる・Cloud Run がデプロイ／再起動すると募集は消える。これでは統合ロビーの狙いである「時間差のある需要同士を当てる」ことができない。

Phase 2 の目的は次の2点に尽きる。

1. **2a 永続化**: シークをサーバーメモリの外（Firestore）に置き、切断・デプロイ・インスタンス再起動を跨いで募集が残るようにする
2. **2b 呼び戻し**: 募集が claim されたら Web Push で投稿者を呼び戻し、応答窓の内に復帰・承認すれば対戦を開始できるようにする

### スコープ外（本書で扱わない）

- プールの Cloudflare Durable Object への分離（Phase 3）
- 対戦実行のホスト P2P 化（別メモ）
- レーティング／条件マッチ（2026-08-23 の「条件なし FIFO」判断を維持）
- アカウント登録の導入（「登録不要ですぐ遊べる」は維持する）
- 即時ランダムマッチ（`MatchQueue`）の永続化。待機列は「今いる人同士」の仕組みなので Phase 2 でもメモリ上のままにする。永続化するのは掲示板シークだけ

## 2. 前提（2026-11-11 時点のコード・環境確認に基づく）

| 項目 | 現状 |
|---|---|
| シーク実装 | `server/src/seekBoard.ts` の `SeekBoard` クラス。メモリ上の `Map`、`post/get/list/remove/removeBySocket/expire/has/bySocket`。1人（1 socket）1件、TTL 30分（`SEEK_TTL_MS`、既定 30×60×1000） |
| サーバー連携 | `server/src/index.ts` が `postSeek` / `cancelSeek` / `claimSeek` を処理。claim は待機列成立と同じ経路でルームを作り、投稿者が先攻 p1。`GET /api/seeks` で接続前でも一覧を返し、接続中は `seekList` を broadcast |
| 掃除 | `setInterval` 60秒で `seekBoard.expire()` を回し、切れた募集は投稿者へ `seekExpired` を送る |
| 放置切断 | 対戦中でない socket は15分で切断されるが、待機列・募集中・ルーム待ちは「対戦中」扱いで対象外（`isPlaying()` が `seekBoard.has()` を見る） |
| クライアント | `public/src/main.ts` が掲示板 UI を持ち、未接続時は `/api/seeks` を1分間隔で fetch、接続後は `seekList` で更新。自分の募集は `mySeekId`（メモリ）で識別 |
| データベース | **存在しない**。部屋・待機列・募集はすべてサーバーメモリ上（2026-11-08 ユーザー確認済み） |
| GCP | プロジェクト `bs-web-imachan`、リージョン `asia-northeast1`。Firestore も未作成 |
| Cloud Run | サービス `bs-web`、`--min-instances=0` / `--max-instances=1`（`docs/ops/DEPLOY_CLOUDRUN.md`）。**max=1 のため現在は単一インスタンス前提が成立している**。部屋がメモリ上にある以上、この制約は Phase 2 後も維持する |
| PWA 資産 | `public/` に manifest / Service Worker は無い（`icon-192.png` 等のアイコンのみ）。2b で新規導入する。これは Android（TWA）化の前提部品と同一である |
| 計測 | Phase 0 の `#MATCH` ログ（`server/src/matchLog.ts`）と `npm run match:stats` が稼働済み。シークの離脱理由として `expired` / `to_seek` / `to_queue` 等を記録済み |
| デッキ表現 | `DeckSpec = string \| Record<string, number>`（`server/src/type.ts`）。レシピ名かカスタムデッキの中身そのもの。掲示板表示はラベルのみで中身は公開しない（Phase 1 の決定） |

## 3. 決め方針（レビューで承認／変更する初期値）

親文書 §12 の未決事項のうち Phase 2 に関わるものを、本書では次の初期値で固定して設計する。**数字の変更は設計の形を変えない**ので、レビューで数値だけ差し替えてよい。

| # | 論点 | 本書の初期値 | 根拠 |
|---|---|---|---|
| D1 | シーク総寿命（投稿からの上限） | **2時間** | 非同期の意味が出る長さと、ゴースト募集の抑制のバランス |
| D2 | オンライン時の TTL | Phase 1 と同じ **30分**（延長操作で総寿命まで延ばせる） | 既存挙動を変えない |
| D3 | 切断後（away）の保持 | **60分**、ただし D1 の総寿命を超えない | 親文書の仮置きを採用 |
| D4 | claim 応答窓：投稿者が online | **即成立**（Phase 1 と同じ、応答窓なし） | 既存挙動を変えない |
| D5 | claim 応答窓：投稿者が away | **5分** | Push 到達＋復帰操作の現実的な所要時間。親文書 §12-2 の「away のみ長くする」案 |
| D6 | 掲示板でのデッキ公開範囲 | **表示名（ラベル）のみ**（Phase 1 の決定を継続） | 対戦前の情報開示を避ける |
| D7 | 有効シーク数 | **端末あたり1件**（Phase 1 の「1人1件」を socket から端末へ読み替え） | スパム対策の水準（親文書 §12-6）はこれ＋作成レート制限で足りると判断 |
| D8 | Push 許可をしない場合 | そのシークは **オンライン限定**（切断＝失効、Phase 1 と同じ）として投稿できる | 通知許可を強制すると「登録不要・すぐ遊べる」が崩れる。段階仕様とする |
| D9 | 待機中 AI 戦とシークの併存 | シークはセッションと別レイヤーなので**併存可**。ただし claim 成立時の AI 戦破棄の扱いは親文書 §8 の原則（破棄して対人へ）に従い、2b の復帰フローでモーダル確認する | 構造分離が Phase 2 で初めて可能になる |

## 4. 全体構成

```
クライアント（public/）
  main.ts        … 掲示板UI、resume/claim 応答、Push 購読の開始
  sw.ts (新規)   … Service Worker。Push 受信と通知クリックでの復帰導線
  manifest (新規)… PWA manifest（TWA の下地を兼ねる）
        │ Socket.io（対戦操作・在席中イベント） / HTTP（/api/seeks, /api/push/*）
サーバー（Cloud Run、単一インスタンス）
  index.ts        … イベント配線、60秒スイープ、在席判定（現行を拡張）
  seekStore.ts (新規) … SeekStore インターフェース＋メモリ実装（Phase 1 互換）
  seekStoreFirestore.ts (新規) … Firestore 実装（一覧キャッシュ＋トランザクション）
  push.ts (新規)      … Web Push 送信、購読の保存/失効掃除、VAPID 鍵管理
        │ Admin SDK（サーバーからのみ）
Firestore（bs-web-imachan / asia-northeast1 / Native モード）
  seeks/{seekId}              … 募集レコード（§6）
  playerSeeks/{playerRefHash} … 端末→有効シークの索引（1端末1件の担保）
  pushSubs/{playerRefHash}    … Push 購読（エンドポイント等。クライアントから直接読ませない）
```

要点は3つ。

1. **`SeekBoard` を `SeekStore` インターフェースの背後に隠す**。`index.ts` はストアの種類を知らない。環境変数 `SEEK_STORE=memory|firestore` で切り替え、2a のロールバックはこの切替だけでできる
2. **一覧表示は Firestore を毎回読まない**。単一インスタンス前提を活かし、サーバーが `onSnapshot` で変更だけを受けてメモリ上に一覧キャッシュを持つ。現行の `seekBoard.list()` / `GET /api/seeks` / `seekList` broadcast はキャッシュを読むだけになり、読み取り課金は「変更分」だけに収まる
3. **claim の調停だけは必ずトランザクションで原子的に行う**。二重 claim の防止はキャッシュではなく Firestore のトランザクションで担保する（§7）

## 5. 本人性：playerRef（端末 ID）

永続化すると「投稿者」が socket では識別できなくなる。アカウントは作らないので、識別は端末単位の匿名 ID で行う。

- クライアントは初回に UUID v4 を生成し `localStorage` の `bs_player_ref` に保存する。これが `playerRef`
- 投稿・取消・復帰・Push 購読はすべて `playerRef` を提示して行い、サーバーは「そのシークの持ち主の `playerRef` と一致するか」で本人確認する
- `playerRef` は**能力（capability）として扱う**。掲示板一覧や他人の画面には絶対に出さない。ログには `matchLog` の visitor と同じ流儀で日替わりハッシュ化して記録する
- 限界の明記：`playerRef` を知る者はその端末のシークを取消・横取りできる。ただし現行の前提は「チート対策は当面気にしない」（2026-11-08）であり、対戦自体は従来通りサーバー権威で進むため、被害は「募集の取消・成りすまし投稿」に限られる。localStorage を消せば別端末扱いになり、旧シークは TTL で自然消滅する。これ以上の防御（署名付きトークン等）は将来アカウントを入れる時に再検討する

### socket との関係

- 接続中の socket は、その接続で提示された `playerRef` に紐付く（`socket.data.playerRef`）
- シークの `presence` は「その `playerRef` を名乗る socket が現在接続しているか」で決まる。切断で即 `away` にせず、**90秒の猶予**（回線瞬断・スマホのスリープ復帰対策。現行 ops ドキュメント §4.2 が挙げる既存の弱点への対処を兼ねる）の後に `away` へ落とす
- 復帰時は新しい socket が同じ `playerRef` を提示すれば、それが投稿者本人の接続として扱われる

## 6. Firestore 設計

### 6.1 データベース作成（ユーザー作業・初回だけ）

- GCP コンソールで Firestore を **Native モード**、ロケーション **asia-northeast1** で作成する（ロケーションは後から変更不可。本番 Cloud Run と同リージョンにする）
- 無料枠はプロジェクトに1つ。保存 1 GiB / 読み取り 50,000 回/日 / 書き込み 20,000 回/日 / 削除 20,000 回/日（2026-11-08 公式価格ページで確認済み）で、本用途は §6.5 の見積もり通り十分に収まる
- Firestore の TTL ポリシーによる自動削除は**使わない**（TTL 削除は無料枠の対象外になるため）。期限切れの掃除は現行と同じくアプリ側スイープ（60秒間隔）で行う

### 6.2 `seeks/{seekId}` ドキュメント

| フィールド | 型 | 内容 |
|---|---|---|
| `seekId` | string | ドキュメント ID と同値。形式は現行踏襲（`seek-` + UUID 先頭8桁）だが、衝突回避のため 2a で全桁 UUID に変える |
| `playerRefHash` | string | 持ち主の `playerRef` のハッシュ（サーバー側照合用に平文の `playerRef` もサーバー専用フィールドとして持つ。一覧には一切出さない） |
| `name` | string | 表示名（現行の名前入力） |
| `deck` | string \| map | `DeckSpec` そのまま（Firestore は string と map の両方を素直に保持できる） |
| `deckLabel` | string | 掲示板表示用ラベル（レシピ名 or「カスタムデッキ」） |
| `status` | string | `waiting` / `claimed` / `matched` / `expired` / `cancelled`（§8 の状態機械） |
| `presence` | string | `online` / `away`（`status` とは別次元） |
| `source` | string | `web` / `android` / `discord` / `link`（流入計測用） |
| `pushEnabled` | bool | このシークが `away` になれるか（＝投稿時に Push 購読があったか） |
| `claim` | map \| null | claim 中のみ：`claimId`（ランダムなトークン）、`claimerName`、`claimerPlayerRefHash`、`claimedAt`、`claimExpiresAt` |
| `createdAt` / `updatedAt` | timestamp | 作成・最終更新 |
| `expiresAt` | timestamp | 現在の失効時刻。online は投稿＋30分、away 移行で「切断＋60分」と D1 の小さい方へ更新 |
| `hardExpiresAt` | timestamp | 総寿命の上限（作成＋2時間）。延長操作でもこれを超えられない |
| `lastSeenAt` | timestamp | 在席ハートビート（60秒に1回まで間引いて更新） |
| `clientVersion` | string | 対戦互換の確認用（任意） |

### 6.3 索引・付随コレクション

- `playerSeeks/{playerRefHash}`：`{ seekId, updatedAt }` のみ。「1端末1件」は、投稿トランザクションがこのドキュメントを読み、既存シークを `cancelled` にしてから新シークを作ることで担保する
- `pushSubs/{playerRefHash}`：Web Push の `endpoint` / `keys` / `createdAt` / `lastSuccessAt`。**サーバー専用**。クライアントへ返す API は作らない
- 複合インデックス：`seeks` の `status + createdAt`（一覧の並び）と `expiresAt`（スイープの範囲取得）。`onSnapshot` のクエリは `status in [waiting, claimed]` に限定する

### 6.4 セキュリティルール

クライアントから Firestore へ直接アクセスさせない。ルールは全面拒否にし、読み書きは Cloud Run のサーバー（Admin SDK、ルールバイパス）だけが行う。

```
match /{document=**} { allow read, write: if false; }
```

これにより「Firestore を公開 DB として使う」設計（親文書の候補 B）が抱える調停ロジックの分散を避け、Phase 1 までのサーバー権威の構造をそのまま保つ。Cloud Run のサービスアカウントには `roles/datastore.user` を付与する（デプロイ手順は `docs/ops/DEPLOY_CLOUDRUN.md` §1.1 の流儀に追記する）。

### 6.5 読み書き量の見積もり（無料枠との対比）

前提：1日の投稿 100件、claim 50件、常時の一覧閲覧は HTTP ポーリング（現行通り1分間隔）。

| 操作 | 発生 | Firestore アクセス |
|---|---|---|
| 投稿 | 100/日 | 書き込み3（seek・索引・旧シーク取消） |
| 一覧表示 | 閲覧側はサーバーのメモリキャッシュから返す | **0**（`onSnapshot` が変更分だけを読む：投稿・claim・失効で数百読み/日） |
| claim / 応答 / 取消 | 約150/日 | トランザクション読み書き 各2〜4 |
| ハートビート | 在席中60秒間隔 | 書き込み最大 1,440/端末/日だが、対象は募集中の端末だけ。現実には数十件規模 |
| スイープ | 60秒間隔 | 変更が無ければ `onSnapshot` キャッシュ判定で **クエリを発行しない** |

合計しても読み取り・書き込みとも無料枠の1割に遠く及ばない見込み。**一覧を毎回 Firestore クエリに変える実装だけは避ける**（ポーリング人数×分数の読み取りが発生し、無料枠を食い潰す唯一の経路になる）。

## 7. 並行制御：claim トランザクション

claim は Phase 2 で唯一、競合が実害になる箇所である（2人が同時に同じ募集を取る／応答窓タイムアウトと復帰が交差する／再起動直後に古いキャッシュで判定する）。

- `claimSeek` は Firestore トランザクションで実行する：対象ドキュメントを読み、`status == waiting` かつ `expiresAt > now` を確認して、`status = claimed` と `claim`（新しい `claimId` を含む）を書き込む。条件を満たさなければ「埋まった／切れた」として claimer に `seekList` の最新を返す（現行の「シークが無いとき」の応答と同じ流儀）
- 応答窓の満了処理（`claimed → waiting` へ戻す）は、必ず **`claimId` が現在のものと一致する場合だけ**実行する。古いタイマーが新しい claim を解放してしまう事故を防ぐ
- 投稿者の承認・拒否、claimer のキャンセルも同じく `claimId` を提示させ、一致しない操作は無視する（冪等）
- ルーム作成自体は現行経路（投稿者を p1、claimer を p2 として `roomManager.join()`）を再利用する。Firestore 側は成立時点で `status = matched` にして役目を終える。**対戦の状態は Firestore に持たせない**

## 8. 状態機械

`status` の遷移（`presence` は別次元で `online ⇄ away` を動く）。

| 遷移 | トリガー | 付随処理 |
|---|---|---|
| （なし）→ `waiting` | `postSeek` | 同端末の旧シークがあれば `cancelled` にしてから作る。`#MATCH queued` を記録 |
| `waiting` → `claimed` | `claimSeek`（トランザクション） | 投稿者へ通知：online なら socket で `seekClaimed`、away なら Push（§10）。claimer へ `seekClaimPending`（応答窓の残り時間つき）。投稿者が online なら即 `matched` へ進めてよい（D4） |
| `claimed` → `matched` | 投稿者の承認（away 時）／即成立（online 時） | ルーム作成、両者へ `matchFound` 相当を送り対戦セッションへ。`#MATCH matched` に待ち時間（投稿からの総時間と away 時間の内訳）を記録 |
| `claimed` → `waiting` | 応答窓タイムアウト／投稿者の拒否／claimer のキャンセル | `claimId` 一致を確認してから戻す。claimer へ `seekReturned`、投稿者へは（away なら）追加通知しない |
| `waiting` → `cancelled` | 投稿者の `cancelSeek`／別モードへの移動（現行の `to_room` / `to_ai` / `to_queue` の離脱理由を踏襲） | `#MATCH left` を記録 |
| `waiting` / `claimed` → `expired` | スイープが `expiresAt`（claimed 中は `claimExpiresAt` とは別に総寿命も）超過を検出 | 投稿者が online なら `seekExpired`。`#MATCH left(expired)` |
| `presence: online` → `away` | 切断＋90秒猶予を過ぎても復帰しない／インスタンス再起動で在席が確認できない | `pushEnabled` でなければ即 `expired`（D8）。あれば `expiresAt` を D3 で更新し Push 待ち受けに入る |
| `presence: away` → `online` | 同じ `playerRef` の socket が接続し `resumeSeek` | 自分のシーク状態（`waiting` か、`claimed` で応答待ちか）をクライアントへ返し、UI を投稿直後の状態に復元する |

インスタンス再起動時の扱い：再起動すると全 socket が消えるため、全シークが一斉に「在席不明」になる。起動直後のスイープは `lastSeenAt` が90秒より古い `online` シークを `away` 扱いに倒すことでこれを吸収する。再起動しても募集そのものは Firestore に残る、というのが 2a の主眼である。

## 9. イベント / API の追加・変更

現行イベントは壊さない。追加は次の通り。

| 向き | 名前 | 内容 |
|---|---|---|
| C→S（socket） | `hello`（接続直後） | `{ playerRef }` を提示し socket と端末を紐付ける。現行は接続時に ID を持たないため新設 |
| C→S（socket） | `resumeSeek` | 自分の有効シークの状態取得。復帰・リロード時の UI 復元用 |
| C→S（socket） | `acceptClaim` / `declineClaim` | away claim への投稿者の応答。`{ seekId, claimId }` |
| C→S（socket） | `cancelClaim` | claimer 側の取り下げ。`{ seekId, claimId }` |
| S→C（socket） | `seekClaimed` | 投稿者（online 時）：claimer 名と応答窓。「承認」操作は online では即成立のため、主に通知用途 |
| S→C（socket） | `seekClaimPending` | claimer：応答待ち開始と残り時間。以後 `matched` か `seekReturned` のどちらかが来る |
| S→C（socket） | `seekReturned` | claimer：応答が無かった／拒否された。掲示板へ戻す |
| HTTP | `POST /api/push/subscribe` | `{ playerRef, subscription }` を保存。`DELETE` 同パスで解除 |
| HTTP | `GET /api/seeks`（変更） | 返す `SeekView` に `presence`（「オンライン」表示用）と残り分を追加。**中身は現行通り `seekId / name / deckLabel / createdAt / expiresAt` が上限**で、`deck` の中身と `playerRef` は出さない |

クライアントの掲示板ポーリング（1分間隔 fetch）は現行のまま使える。サーバー側はキャッシュから返すので Firestore 読み取りは増えない。

## 10. Web Push（2b）

- 依存は `web-push` パッケージ1つ。VAPID 鍵は環境変数／Secret Manager で持ち、公開鍵だけクライアントへ配る（`GET /api/push/key`）
- 購読を求めるタイミングは**募集を出す操作のときだけ**（D8）。トップ表示や初回訪問では求めない。拒否されたらそのシークはオンライン限定として投稿し、UI にその旨を出す
- 通知ペイロードにデッキ情報や対戦内容は入れない。`{ type: "seekClaimed", seekId }` と遷移先 URL（`/?seek=<seekId>`）だけを送り、詳細は開いた後の `resumeSeek` で取得する（通知の配送経路に個人情報を載せない）
- 送信失敗の扱い：Push サービスが 404/410 を返した購読は `pushSubs` から削除し、その端末のシークは `pushEnabled: false` に落とす（次回切断時にオンライン限定として失効する）。一時失敗は1回だけ再試行し、それ以上は追わない
- Service Worker は Push 受信と通知クリックの処理に限定し、オフラインキャッシュは初期スコープ外（キャッシュ戦略は TWA 化の検討と一緒に決める）。manifest は名前・アイコン・テーマ色の最小構成で入れ、インストール可能性だけ先に満たす

## 11. 障害時の振る舞い

| 障害 | 振る舞い |
|---|---|
| Firestore に接続できない（起動時） | `SEEK_STORE` のフォールバックとしてメモリ実装で起動し、シーク機能は Phase 1 相当（オンライン限定）で提供する。ヘルスチェックに状態を含め、ログに明示する。**対戦機能自体は止めない** |
| Firestore が途中で失敗（投稿時） | 投稿を失敗としてクライアントへ返し、黙ってメモリにだけ載せることはしない（再起動で消える募集を「残る」と誤認させない） |
| 一覧キャッシュが古い | `onSnapshot` 切断時は再購読し、再購読が完了するまで `/api/seeks` は最後のキャッシュに取得時刻をつけて返す。claim はトランザクションで常に最新を見るため、古い一覧で claim しても二重成立は起きない |
| Push が届かない | 応答窓（5分）満了でシークは `waiting` に戻るだけ。投稿者・claimer 双方の状態は壊れない |

## 12. 実装の切り分け（PR 単位）

### PR-2a：永続化だけ（Push なし）

1. `server/src/seekStore.ts`：現行 `SeekBoard` の公開メソッドをインターフェース化し、メモリ実装を移す（挙動不変のリファクタを先行コミットにする）
2. `server/src/seekStoreFirestore.ts`：Firestore 実装（`onSnapshot` キャッシュ、投稿／取消／claim トランザクション、スイープ連携）
3. `server/src/index.ts`：`hello` による `playerRef` 紐付け、切断時の即削除を「presence を落とす」へ変更、起動時リカバリ（§8）、`SEEK_STORE` 切替
4. `public/src/main.ts`：`playerRef` の生成・保持・送信、リロード時の `resumeSeek` 復元
5. 運用：`docs/ops/DEPLOY_CLOUDRUN.md` に Firestore 作成・サービスアカウント権限・環境変数を追記
6. テスト：§13

この段階でも「タブを閉じたら消えるが、**デプロイ／再起動では消えない**」「同じ端末で開き直せば自分の募集が復元できる」が成立する。away の募集は Push が無いので claim されても呼び戻せず、応答窓の考え方が要るのは投稿者が online の場合のみ、という割り切りで 2a は出す（away シークへの claim は、投稿者が online に戻るまで `claimed` にせず、掲示板で「不在」と表示して claim を受け付けない）。

### PR-2b：呼び戻し

1. `public/manifest.webmanifest`、`public/src/sw.ts`（Service Worker）とビルド配線
2. `server/src/push.ts`：VAPID、購読の保存 API、送信と失効掃除
3. claim フローの拡張：away claim、応答窓タイマー、`acceptClaim` / `declineClaim` / `cancelClaim`
4. クライアント：購読導線、復帰モーダル、claimer の待機 UI（残り時間表示とキャンセル）

## 13. テスト計画

- **単体**：`SeekStore` のメモリ／Firestore（エミュレータ）両実装で同じスイートを通す。状態遷移表（§8）の全行、1端末1件、TTL と総寿命の境界、`claimId` 不一致の操作が無視されること
- **競合**：同一シークへの同時 claim を2クライアントで撃ち、成立が1件だけであること。応答窓タイムアウトと承認の競合で、古い `claimId` が新しい claim を解放しないこと
- **再起動**：Phase 1 で行った実サーバー検証の手順を拡張し「投稿 → サーバー再起動 → 一覧に残っている → 別クライアントが claim → 成立して盤面が届く」を通す
- **Push**：`web-push` をモックした送信成否・410 掃除の単体テスト。実機（Android Chrome）での到達確認は手動チェックリストとして ops に残す
- **回帰**：既存 smoke（50,883件）と typecheck、`validate:size` を全て通す。`#MATCH` の新理由（`claim_timeout` / `returned` 等）を `scripts/match-stats.ts` の集計に足し、未知の理由で集計が落ちないことを確認する

## 14. 計測（Phase 0 の延長）

- 離脱理由に追加：`claim_timeout`（応答窓切れ）、`declined`（投稿者の拒否）、`claim_cancelled`（claimer の取下げ）
- `matched` 記録に「投稿からの総待ち時間」と「away だった時間」を分けて持たせ、非同期化が実際に新規の成立を生んだか（親文書 §13 の「シーク経由の成立割合」）を `match:stats` で見られるようにする
- Firestore の読み書き実績は GCP コンソールで週次確認し、無料枠に対する比率を ops に記録する

## 15. リスクと制約

| リスク | 対処 |
|---|---|
| `max-instances=1` 前提への依存 | claim はトランザクションで守られるが、ルームはメモリ上のため複数インスタンス化は元々できない。Phase 3 でプールを分離するまでは max=1 を維持し、本書の設計もそれを前提に明記する |
| `playerRef` の漏洩・なりすまし | §5 の通り被害範囲を限定して受容する（チート不問の既存方針）。一覧・ログへの露出だけは設計で塞ぐ |
| Push の許可率・到達率が低い | D8 の段階仕様により、許可しないユーザーは Phase 1 相当の体験のまま損をしない。成立率への寄与は §14 の計測で判断し、低ければ Discord 連携（入口C）へ投資先を変える |
| iOS Safari の Push 制約 | 主対象は Android（ユーザー端末・TWA 計画）なので 2b の必須範囲から外す。iOS はオンライン限定として動く |
| Firestore の無料枠超過 | 一覧キャッシュ方式（§6.5）で構造的に防ぐ。超過が見えた場合は先にポーリング間隔とハートビート間引きを調整する |

## 16. レビューで決めてほしいこと

設計の形ではなく数値と要否だけを残す。未回答の項目は §3 の初期値で実装に入る。

1. D1〜D5 の数字（総寿命2時間／away 保持60分／away 応答窓5分）でよいか
2. D8 の段階仕様（Push なし＝オンライン限定）でよいか。それとも投稿自体に Push を必須にするか
3. 2a の割り切り（away シークは掲示板に出るが、投稿者が戻るまで claim 不可）でよいか
4. Firestore 作成（§6.1）はユーザーが GCP コンソールで行う前提でよいか。作成後に着手する 2a の実装順（§12）でよいか

---

## 付記

本書は親文書 `INTEGRATED_LOBBY.md` §10 Phase 2 と、2026-11-08 の Phase 2 検討（2a 永続化 → 2b 呼び戻しの分割、ストアは Firestore 本命、本人確認は端末 ID＋Push 購読、通知許可は投稿時にだけ求める）をもとに、2026-11-11 時点のコードを確認して具体化した。親文書 §12 の未決事項のうち本書で初期値を置いたものは §3 に集約してある。判断が変わる場合は本書と親文書の両方を更新すること。
