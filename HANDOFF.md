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

### 次にやること（2026-11-16 時点。上から順に）

1. **#437 第4ラウンドの報告は直し終えた**（2026-11-16 に履歴とデータで確認。後始末飛び F1〜F5＝#463・#464・#465・#469・#470／色の素通り＝#457／トラッシュの保護＝#460／データ＝costMod と【連鎖】の levels は入っている）。残りは検出の穴だけ：validate:gaps は見出しの無い効果行を数えない（costMod の欠落が出ない）。spec 照合の復活は #443（開いたまま）
2. **#431（統合ロビー Phase 2＝Web Push＋外部ストア）は先送り**（2026-11-14 ユーザー判断「一旦それで」）。待っている間の接続は、3秒おきの問い合わせに置き換えて解消した（DEPLOY_CLOUDRUN §5.2）。タブを閉じても待てる仕組みは、待ちの件数が増えてから。Phase 0（計測）・Phase 1（掲示板）は `feat/seek-board-phase1` のまま（PR 無し。掲示板は接続中だけ有効な作りなので、出すなら問い合わせ方式に合わせ直す）
3. **アルティメット：期待値役は使わない**（2026-11-12 ユーザー決定）。テストは**1枚ずつ、ユーザーが Claude に既存のコードを聞きながら書く**（ユーザーがコードを把握する勉強期間を兼ねる。進みは遅くてよい）。実装のバッチは Claude（サブ）がやる。**一番大事なのは、テストできちんとバグを見つけること**。設計は [ULTIMATE.md](./docs/design/ULTIMATE.md)
4. 小さい残り：同名の【不死】が解決順の一覧で1行にまとまる（動きは正しい）

- 素材は本人提供：裏面 `public/imgs/card-back.jpg`（銀色）、タイミングアイコン `public/imgs/timing/{burst,flash,main}.png`（フラッシュ＝黄の稲妻・メイン＝青・バースト＝赤。#613 で使う）
- サーバー：`playerView` に `burstRevealed: boolean` を足す（`buildView` が state から求めて渡す。真＝`state.declaredBursts` にその pid・cardId がある／`pendingChoice.burst` が一致／`currentEffectSource.burst` で pid・cardId が一致）。真なら相手にも `burst` の cardId を返す。新しい状態は足さない
- 画面：伏せている間は裏面の画像（相手は画像だけ、自分は画像の上に名前）。`burstRevealed` なら表向き（色の枠＋名前、🔒なし）。発動のイベント（#620 で cardId つき）を受けたら、その陣営のバースト欄を表向きにめくる演出を約2.5秒出す（宣言から適用・トラッシュまで1回の操作で済むと、画面に表向きの状態が届かないため）

### 未着手：カード画像を Cloud Run を通さずバケットから直接配る（2026-11-18 ユーザーと合意。設計のみ）

背景：今は Cloud Run がバケット `bs-web-card-images` をマウントし、express（`server/src/index.ts:43`、maxAge 7d）で返している。画像の数だけインスタンスが動き、コールドスタートの遅れも画像に乗る
1. **公開の仕方**：`allUsers` に `roles/storage.legacyObjectReader`（ファイル単位の読み取りだけ）を付ける。`objectViewer` は一覧も取れるので使わない（カード画像は合言葉で出す隠し要素。URL を知っていれば開けるのは今と同じ）。IAM の変更はユーザーが実行する
2. **キャッシュ**：同期に `--cache-control="public, max-age=2592000"`（30日。差し替えはほぼ無い）を足す。既に上がっているものは `gcloud storage objects update gs://bs-web-card-images/** --cache-control=...` で1回付け直す。手順は docs/ops/DEPLOY_CLOUDRUN.md の画像の節を書き換える
3. **クライアント**：`public/src/cardArt.ts` の画像 URL（7行目 `/imgs/cards/...`）の頭を1か所の定数にし、本番は `https://storage.googleapis.com/bs-web-card-images`、ローカル開発（localhost）は今の `/imgs/cards` のまま。`<img>` なので CORS は要らない
4. **後片付け**：本番で表示とキャッシュの応答ヘッダーを確かめてから、Cloud Run のバケットのマウントと index.ts:43 の配信を外す（同じ PR にしない。切り戻せるように）
- ロードバランサ＋Cloud CDN は入れない（公開オブジェクトは Google 側でもキャッシュされる。必要になったら測ってから）
- Discord Activity（未着手）では Portal の URL Mapping で画像の頭をバケットへ向ける必要が出る。DISCORD_ACTIVITY.md の表に追記済み

### 未着手：「既存の部品の組み合わせで書けるか」を推理でなく検索で決める道具（2026-11-18 ユーザーと合意。設計のみ）

背景：P13 で調査役が新しい部品を3つ提案し、2つは既存で書けた（効果の貸し出し `lendSelfThisTurn` がスピリットでも使える・`bySelfEffectOnly` を知らない）。データ役も同じ文面の BS20-069 を探さず独自に書いた。どれも「同じ文面の既存カードの書き方を写せば済む」もの。今の索引は kind/type の名前だけで欄（`lentOnly`・`bySelfEffectOnly` など）が載っておらず、サブは推理するしかない
1. **前例検索**（最優先）：`scripts/find-precedent.ts "効果文の1節"`。全カードの効果文を節（見出し『…』や句点で区切る）に分け、数値→`{N}`・カード名/系統/色/キーワードの括弧内→記号に正規化した「型」で索引を作り、同じ型・近い型（編集距離など）の既存カードの effects エントリを並べて出す。調査役・データ役のプロンプトで、各節に道具の出力を添えさせ、**新しい部品の提案は「前例なし」が出た節だけ**にする。受け入れ確認：P13-11（BS20-069 が出る）・P13-15（SJ13-06・BS20-X08 が出る）・P13-09（BS07-075・BS10-095 が出る）
2. **欄の索引**：型ファイル（types/*.ts）から「kind/type ごとの欄名＋行末コメント1行」を書き出す（`npm run fields` → `docs/FIELD_INDEX.md`。CODEMAP と同じく CI で古さを検査）。1 で前例が無い節の組み合わせを考えるときに引く
3. **反証の手順**：調査役が出した新しい部品の候補は、別の役（または同じ役を再開）に「既存の部品だけで書いてみる」をさせ、書けなかったものだけをユーザー確認に回す（11-18 はメインループが手で行い3つ中2つが消えた）
- PR は「開発の道具」として 1 と 2 を1本、3 は CLAUDE.md の3役の手順に1行足す

### SJ の取り込みの残り（`feat/sj-promo` の PR 済み。11-18）

- 一度も実行されていない16エントリ（coverage の基準に入れた）。場面テストを足して基準から消す：EX007-e2 EX008-e1 EX008-e2 EX012-e2 EX019-e1 SJ12-02-e1 SJ12-03-e3 SJ13-05-e1 SJ13-05-e2 SJ13-09-e1 SJ13-12-e1 SJ13-20-e1 SJ13-21-e1 SJ13-22-e1 SJ13-22-e2 SJ13-24-e2
- 期待値役が書けなかった場面：EX014 の転召・EX014 のバトル中の効果破壊・SJ13-03 と【重装甲】・SJ13-02 で剣刃でないブレイヴ・単体召喚を選ぶ場面（scenario に手元・分身・合体状態を start に置く欄が無い）

### 進行中：P13 プロモ＋P14-09 の29枚（`feat/p13-promo`。11-18 開始。issue #631 の残り）

- 範囲：P13-01〜28 と P14-09（2026-11-18 ユーザー了承「それで続けて良いよ」）。P14-01〜08・CP14-01 はアルティメットを参照するか自身がアルティメットなので外す。配布系66種は後回し
- データ：`data/staging/P13.json`（プロモの一覧のキャッシュから parse_row で抜いた）。入れ先は `data/cards/P13.json`
- 手順：調査役（Sonnet）が `docs/design/P13_PLAN.md` → ユーザー確認 → 期待値役 → 実装役 → データ役
- **確定（11-18 ユーザー確認）**：新しい部品は作らない。①`globalConstraint.condition` を共通の `AuraCondition`（auraCondition.ts、判定は shared/rules/bp.ts）に寄せる（専用の6軸は AuraCondition へ移しデータも移行。P13-04 は `ownColorSymbolsAtLeast` をそのまま使う）②P13-09 は `lendSelfThisTurn` で既存の `bpBuffSuppression`（lentOnly）を貸す ③P13-15 は `lendSelfThisTurn` で `fieldEvent opponentSpiritBpReachedZero`（bySelfEffectOnly＝SJ13-06・BS20-X08 と同形）を貸す。P13-25 の「好きなだけ召喚」は同時（BS16-X05 と同形）
- 分担：期待値役 part997〜1001、条件の統合（Sonnet）part1002、その後データ役
- 残り：一度も実行されていない8エントリを coverage の基準に入れた（P13-05-e1 P13-06-e3 P13-07-e1 P13-21-e2 P13-22-e1 P13-23-e2 P13-25-e2 P13-26-e2）。場面テストを足して基準から消す。期待値役が書けなかった場面：P14-09 の「ムゲン」がいるとき（プールに該当なし）、P13-15 の効果の前から BP0 の場面

### 派生効果を効果の後に（#606・#609・召喚の PR で済み。設計は DERIVED_AFTER_EFFECT §8・§10・§11）

- 残り：なし（印の無い【連鎖】は fix/rensa-unmarked で直した。BS19-055-e4・BS19-066-e3 は付与で対象を取らない）
- 既知の限界：戻す待機の `rank` 衝突／`holdDerivedFor`・`resumeEffectId`・`derivedItems` が state 経由（原則3の例外）／遅らせる出来事は `derivedSettle.ts` の `HELD_EVENTS`（fieldEvent を足したら入れるか決める）

### 進行中：AI戦をブラウザの中で動かす（2026-11-13 確定。`feat/local-ai-battle`）

- 実測（直近30日）：Cloud Run の稼働 92.9 時間（無料枠は月約50時間）。対戦開始 1,626 件の 88% が AI戦。AI戦をサーバーから外せば、接続を張るのは対人戦だけになる
- AI戦は Web Worker（`public/src/aiWorker/worker.ts` → `public/dist/aiWorker.js`）がエンジンと AI を動かす。Worker とのやりとりは socket と同じイベント名（`startAi`／`action` → `joined`／`state`／`errorMessage`）で、`main.ts` は同じハンドラで受ける
- 束ねるときに差し替えるのは `data/loadCards`（`/api/cards` を同期で取る）と `coverageRecorder`（何もしない）の2つだけ。エンジンに Node 専用の import を足すと束ねられなくなるので、ビルド（`scripts/build-ai-worker.mjs`）が束ねた直後に `process` の無い環境で1戦を始めて確かめる
- 対戦開始の処理（デッキ指定の解決・先攻決め・最初のターン開始）は `server/src/matchSetup.ts` に出し、サーバーと Worker の両方が使う
- サーバーの `startAi` は残す（Worker を起動できないブラウザの退避先・E2E）。件数の記録は `POST /api/ai-start` で続ける

### 進行中：待機状態の作り替え（2026-11-15。確認の答えは [PENDING_STATE.md](./docs/design/PENDING_STATE.md) §3 の C1〜C4）

C1〜C4（同時破壊を1本の列に・対象に取れるのは同じ出来事の待機だけ・戻す待機の順番・待機の変化）は実装済み（PENDING_STATE §3、TIMING_CHART §1.5・§1.6）。破壊待機の間だけ使う控え（破壊の発生源・「残る」を見ない印・破壊後バースト用の値）は `waiting` の中に移した（読むのは `destroyContextOf`・`destroyBurstInfoOf`）。段取り6（『消滅時』の誘発と、消滅を直前の Lv で解決する）は見送り（2026-11-16 ユーザー決定。プールに該当カードが無い。『消滅時』を持つカードを取り込むときに、解釈を確認してから入れる）。

段取り5（合体中のブレイヴだけの破壊の待機）は実装済み（PENDING_STATE §3 C5〜C8、BRAVE.md §6.5）。

### 進行中：復活を「戻す体を持ち主が複数選ぶ」にする＋選択バーの counter（2026-11-10 確定。`feat/revive-pick-many`）

- **対象**：BS13-038 魔女タランダ（手札のスピリット）・BS10-046 龍仙公主（手札のマジック）。「好きなだけ破棄、**破棄した1枚につき**破壊された体を1体戻す」。#423（perDestroyed）の置き換え（#423 は閉じる）
- **流れ**（同時破壊グループにつき誘発1回＝Q22359）：①破壊された対象（filter 一致）のうち**戻す体をトグルで複数選ぶ**（`kind:"target"`＋`selectedIds`・確定は `skipLabel`「これで戻す」。0体で確定＝戻さない。上限＝min(対象の体数, cost を払える手札の枚数)）→ ②選んだ体数 k ぶん、手札の該当カードを**トグルで k 枚選んで破棄**（`kind:"card"`＋`selectedCardIndices`。k 枚そろうまで確定できない）→ ③選んだ体が疲労状態で戻る。対象が1体だけのときは従来の確認（「復活させますか？」）のまま
- **スキーマ**：`reviveOnDestroy.pickMany?: true`（`effectDefTrigger.ts` に追加済み。`scope:"ownAll"` 限定・既存の `cost.handDiscardOne`/`handDiscardCardType` を選んだ体数ぶん払う。`perDestroyed` とは併用しない）。BS13-038-e1 から `perDestroyed` を外して `pickMany` を付け、BS10-046-e1 にも付ける
- **選択ステップは同時破壊グループの先頭**（`destroyTargetsBatch` が1体目を処理する前）に1回だけ出す。選んだ結果は `destroyGroup` に控え、各体の処理では「選ばれた体は確認・コストなしで戻す／選ばれなかった体は通常どおり破壊」。中断・再開は `destroyBatch` の再開スタックを通す（RESUME_STACK.md）
- **counter**：`PendingChoice.counter?: { label; current; max }`（`types/choice.ts` に追加済み。相手視点ではマスク）。トグル選択3か所（合計BP破壊 `destroy.ts`・疲労の合計 `exhaustBudget.ts`・`timedEffect.ts`）と今回の選択で、**プロンプト文から「合計 x／y」を外して `counter` に入れる**。クライアントは `renderer.ts`（`btn-skip-choice` の近く）で選択バーに目立つ表示（例「BP合計 3000／10000」「戻す 1／2」）を出す。カードのハイライト（`fieldCard.ts` の `selectedIds`）は今のまま
- 検証：part 新規（期待値役が効果文から。同時2体・手札3枚・手札1枚・導魔でない体・手札0枚・龍仙公主）＋既存の復活 smoke が全緑

### バグ探し（2026-11-02〜05。済み）

- ①〜③ は 11-05 に終わった。一度も実行されていない効果は、宣言だけのキーワード2件（【大粉砕】BS15-X06-e2・【呪滅撃】BS14-X02-e2）と BS13-081-e0 だけ（`data/coverage-baseline.json`）
- 道具：`audit:paths`（`VIA=direct|attack|block|summon`。TEST_STRATEGY §7）、全カードの火入れはブレイヴとバーストも撃つ（`fireAll.ts`）
- **11-05 の反省：バグ修正でも、直し方に処理の順（どちらを先に・確認をいつ出す・条件をいつ判定する）の選択が入るなら、実装前に聞く**

### 弾の取り込み（2026-11-09 時点）

- BS22 は #399、BS23 は #409 で入った（計画は BS22_PLAN・BS23_PLAN。既知の限界は各 §5）
- 禁止・保護の型の統一（#400〜#405）は済み。結果と残した型は [CONSTRAINT_UNIFY.md](./docs/design/CONSTRAINT_UNIFY.md)
- BS20 は #395、BS21・CP13-01 は #396 で入った
- 取り込み済みは BS01〜BS23・CP13-01・X13・SD01〜SD18・プロモ P001〜P084・PX01〜PX19（`data/cards/`。構築済みデッキの専用カードと BSC05・EX・X009・BS01-125/141 は `STARTER.json`）。BS24 から先は staging にも無い。**BS20-074 シャイニングフレイムは SD18 のために `STARTER.json` へ先に入れたので、BS20 の取り込みでは飛ばす**
- **ソウルコアは烈火伝（BS31〜）から**（batspi「ソウルコア」）。それまでの約束は [SOULCORE.md](./docs/design/SOULCORE.md) §2 の「有効化までに足すコアの移動」
- **サブ**：Mistral の枠は11月分を使い切った（月初に戻る）ので、今は Claude のサブ。以下は vibe の使い方（調査・期待値・部品＝GLM、データ＝Large 4、完成形がある機械作業＝devstral）。Mistral の枠は Vibe Code（ログイン）と API（`~/.config/mistral_api_key`。`MISTRAL_API_KEY="$(tr -d '\n ' < ~/.config/mistral_api_key)" vibe …`）の2つで、どちらも月初に戻る。**両方尽きたら Claude のサブ（期待値・実装＝Sonnet、データ＝Haiku）**。モデルは `vibe -p … --model glm|large4|devstral-latest` で選ぶ（別名は `~/.vibe/config.toml`）。指示の型は BS19_PLAN §4
- 進め方は [BS18_PLAN.md](./docs/design/BS18_PLAN.md) §1 と同じ（調査役 → 確認 → 期待値役 → 実装役 → データ役 → `merge-set.ts`）
- **絞り込みの統一は済み**（#349〜#353。2026-10-31 ユーザー決定「全部いま寄せる」）。絞り込みは `filter`／`subjectFilter`／`partnerFilter`／`ownSpiritMatches`／`battleOpponentMatches`（`ResolvedTargetFilter`）に書く。寄せずに残したものは [FILTER_UNIFY.md](./docs/design/FILTER_UNIFY.md) §7、付録の器（約250件）はプロモの後
- **プロモ P0・PX0 の100枚は実装済み**（#354。解釈は [PROMO_PLAN.md](./docs/design/PROMO_PLAN.md) §2）
- データの移行をしたら `npm run coverage:check`（#352。smoke の全緑だけでは、場面を組めずに黙って発火しなくなった効果が見えない）
- 3役の流れは [TEST_STRATEGY.md](./docs/design/TEST_STRATEGY.md) §5・§6。**実装役の「❌ 0」は自分で実行し直して確かめる**（10-29 に食い違いがあった）
- 新しい禁止・耐性は [EFFECT_GATE.md](./docs/design/EFFECT_GATE.md) の問い合わせへ足す。**新しい行・一般則を設計する前に、主役のカードの batspi.com の公式Q&Aを読む**
- 取り込み時に足すもの：待機状態の改訂の残りの規則（[PENDING_STATE.md](./docs/design/PENDING_STATE.md) §2）、発生源の属性で絞る貫通（耐性ごとの発生源の記録が要る）
- 5h 枠の上限は 85%（10-29 ユーザー指定。週は見ない）

### BS23 の残り（取り込みは完了。PR #409）

- 読み・裁定は [BS23_PLAN.md](./docs/design/BS23_PLAN.md) §1・§2、限界は §5

### 絞り込みの付録の統一（2026-11-09 着手）

- 調査と決定は [FILTER_UNIFY_APPENDIX.md](./docs/design/FILTER_UNIFY_APPENDIX.md) §12。PR は fix 3本（装甲の付与先・色・ラベル付きキーワード）→ 統一2本の順
- fix 3本（#412〜#414）と AuraDef bp の統一は済み。**残り**：keywordGrant・effectGrant・immunityGrant を `filter` へ（§3・§4・§6）→ 手札の器（summon from:"hand"・costMod・reductionGrant）を `CardPick` へ（§8・§9）。挙動を変えないことは、移行前後の smoke の ✅ の文言を python で突き合わせて確かめる（macOS の sed は日本語の行も潰すので使わない）

### 既知の残り（触るときに読む）

- **保留（2026-11-12 ユーザー判断）：ソウルコアを有効にする前に直すもの**（Muse 監査 #437 R9-4・R11A-3〜5）。いまはソウルコアが無効（`soulCore: null` が既定）か、使うカードが0枚なので起きない。有効にするときに、自動の支払いでソウルコアを使わない（SOULCORE §2）・ボイドへ取り除く処理と【覚醒】がソウルコアを通常コアと区別する・【迷彩】の支払いが維持コアを残す・トークンの支払い元を選ばせる・reveal 経由の pay:"cost" がフィールドから払えない、を点検する
- 見えない経路で情報を運ぶ既存の state の一時フィールド（`payNegateDecision`・`meisaiPaidFor`・`magicRedirectDecision`・`magicSideDecision`・`magicFreeDeclined`・`destroyOrderPick`・`triggerOrderPick`・`summoningFromHand`・`effectFizzled`・`bpMinusSourceBy` など）は、設計の原則3に反する。触るときに action・引数へ移す（2026-11-12 の棚卸し）
- 保留：使ったマジックを手札に戻す（`returnLastUsedMagicToHand`。26RBS01-X14 だけ）にトラッシュ回収の禁止を効かせるか。このリポジトリのプールに無い
- 専用 type の統一は一区切り（[ACTION_UNIFY_PLAN.md](./docs/design/ACTION_UNIFY_PLAN.md) §4）。新しく統一するときは、分かれている理由がルール上の処理の違いかを先に確かめる
- 「〜することで」の確認関門：規則と既知の限界は [COST_MODEL.md](./docs/design/COST_MODEL.md) §10。`if` の器は [IF_UNIFY.md](./docs/design/IF_UNIFY.md) §3・§5（残した2枚は §5「残す」）
- 「破壊されたとき」は同時破壊でも1回：必須の `reviveOnDestroy` がコスト不足で不発になった場合（非対話のときだけ通る経路）、グループの消費を戻していない。今のプールのコスト（手札・自身の疲労・ライフ）は破壊されたスピリットによらないので、戻しても次の1体も払えず結果は変わらない（2026-11-09 確認）
- `coverage:effects` の「場に出ているのに一度も適用されていない効果」は【大粉砕】（BS15-X06-e2）・【呪滅撃】（BS14-X02-e2）の2件だけ。宣言だけのキーワードで、挙動は同じカードの別エントリが持つ（読む側が無いので計測されない）

### standard 版エンジンの持ち込み（ブランチ `feat/legacy-port`。2026-10-15）— 残したもの

`~/develop/bs_web_standard` のエンジン（ソウルコア・moveCards・26系の語彙・ルールの直し）を持ち込み、旧版の #260〜#264 を当て直した。
索引は standard の `docs/legacy-port` ブランチの `docs/design/LEGACY_PORT.md`（`git -C ~/develop/bs_web_standard show docs/legacy-port:docs/design/LEGACY_PORT.md`）。
- **ソウルコアは常に無効**（`createGame` で `soulCore: null`）。有効にする条件は未決：場にあるだけで旧カードの裁定（ボイド行き・【転召】の対象など）が変わるため、烈火伝などを取り込むときに決める
- **第2メインステップは入口だけ閉じた**（`PhaseManager.ts` の `SECOND_MAIN_STEP = false`）。周りのコードは残っている
- 26系カードのデータを読む smoke 76パートは持ち込んでいない（データが非公開）。26系だけの action 16種は `validate:cards` の `STANDARD_POOL_ONLY`
- **この先の standard 側のエンジン修正は自動では入らない**。旧カードにも効く直しは、そのつど持ち込む

### ファイルの分割（R3）

- R3 は済み（`validate:size` の据え置き0本）。removal（#156）・shared/rules（#157）・GameEngine（#160）・EffectModules（#162）・actions/cores（#163）ほか。R6・R7 は随時。**分割1つごとに [WHERE_TO_ADD.md](./docs/design/WHERE_TO_ADD.md)（R1）に行を足す**
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
