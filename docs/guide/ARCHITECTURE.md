# コードの地図

このアプリの実装を初めて読む人が、**どこに何があるか**と**1つの操作がどう流れるか**を掴むための文書。
バトスピのルールとこのアプリの遊び方は知っている前提で、コード側の構造だけを説明する。

ルールそのものの一次資料は `docs/design/` にある（解決順・接続詞・コストなど）。
ここはあくまで「コードの地図」で、ルールの正解は書かない。

---

## 1. 全体像

```
ブラウザ（public/）  ──── Socket.IO ────  サーバー（server/src/）
  画面の描画だけ                            対戦の状態と判定のすべて
  カードデータは /api/cards で取得           GameState をメモリに保持
```

押さえるべき性質が3つある。

| | |
| :-- | :-- |
| **状態はサーバーのメモリにしかない** | DBがない。プロセスを再起動すると進行中の対戦は消える。だから Azure でもインスタンスは常に1つ（`docs/ops/DEPLOY.md`） |
| **クライアントは判定しない** | ブラウザは受け取った `GameView` を描くだけ。「召喚できるか」の最終判定は必ずサーバー側 |
| **カードデータは型検査の対象外** | `data/cards/*.json` は実行時に `fs` で読む。**書き忘れた効果は typecheck でも smoke でも落ちない**。これがこのリポジトリで一番よく踏む罠（→ `npm run validate:gaps`） |

---

## 2. 1つの操作が流れる道筋

「スピリットを召喚する」ボタンを押してから画面が更新されるまで。

```
① ブラウザ           socket.emit("action", { type: "summon", ... })
                                    ↓
② server/src/index.ts   socket.on("action")            … 入口。ルームと手番を確認するだけ
                                    ↓
③ GameEngine.handleAction(state, pid, action)          … すべてのアクションの単一入口
                                    ↓
④ RuleValidator                                        … 「今それをしてよいか」の判定
                                    ↓
⑤ GameEngine.doSummon など                             … 実際に状態を書き換える
                                    ↓
⑥ triggers.fireTrigger("onSummon")                     … 誘発を集めて発火
                                    ↓
⑦ EffectModules.resolveAction / logic/actions/*        … 効果1つ1つを解決
                                    ↓
⑧ handleAction の事後フック                            … 不変条件を回復（後述）
                                    ↓
⑨ GameState.viewFor(state, pid)                        … プレイヤーごとに情報を伏せて
                                    ↓
⑩ io.to(socketId).emit("state", view)                  … 両者へ配信
```

**③〜⑧が1つの関数呼び出しの中で完結する**のがこの実装の基本形。非同期はどこにもない。
プレイヤーへの問いかけが必要なときだけ、途中で止めて状態に「中断」を書き込む（→ 6章）。

### handleAction の事後フック（`server/src/logic/GameEngine.ts:101`）

`handleAction` は本体（`dispatchAction`）を呼んだ後に、**毎回きまった後始末**をする。
効果の途中でどんな経路を通っても盤面の不変条件が壊れないようにするための安全網で、
新しい効果を足すときも原則ここに手を入れずに済むよう作られている。

| フック | 何を回復するか |
| :-- | :-- |
| `forceEndTurnIfFlagged` | サイレントウォールの遅延効果（アタックステップ終了） |
| `refreshLevelAsOverrides` | 「Lv◯として扱う」「◯色としても扱う」など継続置換の再計算 |
| `sweepLevelCostDepletion` | Lvコストが上がって維持コアを下回った個体の掃除 |
| `flushBounces` | 手札／デッキへ戻す途中で盤面に残っているカードを必ず動かす |
| `flushRevealedCardsIfIdle` | 「デッキを上からN枚オープン」の公開ゾーンを片付ける |
| `requestPendingReviveConfirm` | 「破壊される代わりに復活できる」の確認を安全な地点で1件ずつ出す |
| `checkNoMutationAfterSuspend` | **中断したのに処理を続けていないか**の検査（`BS_DEBUG_CHECKS=1` のときだけ） |

最後の2つが重要。効果の解決中に「プレイヤーに選ばせたい」場面は破壊処理の途中など**中断できない地点**で
起きることがあり、その場合はキューに積んでここまで運ぶ。

---

## 3. ディレクトリの地図

| 場所 | 中身 | 行数の目安 |
| :-- | :-- | --: |
| `server/src/index.ts` | HTTP と Socket.IO の入口。ルーム管理、`/api/cards` などのエンドポイント | 435 |
| `server/src/type.ts` | **型定義のすべて**。効果の語彙（`EffectAction` 198種・`EffectDef` の kind 89種）もここ | 2,168 |
| `server/src/logic/` | エンジン本体（下表） | 約12,000 |
| `server/src/logic/actions/` | 効果アクションの実装を種類別に分割（destroy / cores / handDeck / buff / grant / battleFlow / exhaustRefresh / control / filter） | 約9,000 |
| `shared/` | **サーバーとクライアントの両方が使う判定**（rules / cost / block / summon / board） | 約2,500 |
| `data/` | カードデータ（`cards/BS01〜BS09.json` 他）と定数・ローダー | — |
| `public/src/` | クライアント（main / renderer / deck / bugreport）。**UI担当の担当領域** | 約4,000 |
| `scripts/` | 検証・テスト（smoke 218ファイル）・カード取り込み | — |
| `tools/` | コード可視化ツール（git 管理外・個人用。→ 9章） | — |

### エンジンの中核

読む順に並べてある。上から3つを読めば大枠は掴める。

| ファイル | 担当 | 行数 |
| :-- | :-- | --: |
| `GameEngine.ts` | **すべてのアクションの入口**。召喚・アタック・ブロック・バトル解決の手順 | 1,854 |
| `GameState.ts` | 状態の生成と土台の操作（カードDB・デッキ検証・ドロー・`viewFor`） | 622 |
| `RuleValidator.ts` | 「今それをしてよいか」の判定を集めた場所。**状態を書き換えない** | 881 |
| `EffectModules.ts` | 効果の解決の中枢。キーワードのレジストリと `resolveAction` | 2,961 |
| `triggers.ts` | 誘発（`onSummon` などの `TriggerEvent`）の発火とマジックの解決 | 2,067 |
| `removal.ts` | 破壊・消滅・除去まわり（誰の効果で消えたかの追跡を含む） | 1,858 |
| `PhaseManager.ts` | ターン開始からエンドステップまでのフェイズ進行 | 224 |

`triggers.ts` は元々 `EffectModules.ts` の一部で、4,640行まで肥大化したため2026-08-10に切り出された。
**ロジックは移しただけ**なので、片方で見つからない関数はもう片方にある。

---

## 4. 効果を足すときの3層設計

カードの効果は「型 → ハンドラ → データ」の3層で追加する。この順を崩さない。

```
① server/src/type.ts            EffectAction に1行足す（＝効果の語彙を増やす）
        ↓
② server/src/logic/actions/*.ts  その語彙を解釈して状態を書き換えるハンドラ
        ↓
③ data/cards/BS0N.json           カードの effects 配列にデータとして書く
```

**多くの場合①②は不要**で、③だけで済む。既存の語彙が198種あるため、
新しいカードの効果はたいてい既存アクションの組み合わせで書ける。
どれを使うかの探し方は `EFFECT_RECIPES.md` に書いた。

`effects` の1エントリは `EffectDef`（`type.ts:589`）で、`kind` で種類が分かれる判別共用体になっている。
よく使うのは次の5つ。

| kind | 意味 | 例 |
| :-- | :-- | :-- |
| `keyword` | 【激突】【装甲】などキーワードを持つ宣言 | `{"kind":"keyword","keyword":"gekitotsu","levels":[1,2]}` |
| `triggered` | 「〜したとき」で発火する誘発 | 召喚時・アタック時・破壊時 |
| `magic` | マジックカードの効果（`timing: "main" \| "flash"`） | — |
| `step` | 特定のステップに発揮する効果 | — |
| `aura` | 場にある間ずっと効く継続効果 | BP+1000 など |

⚠️ **`keyword` を1件書いた時点で `effects` が非空になる**ため、「効果あり＝実装済み」に見えてしまう。
キーワードは効果文の1行目にすぎず、同じカードに別の効果が続いていることが多い。
これが実装漏れの最大の原因で、`npm run validate:gaps` はこれを検出するためにある。

---

## 5. `shared/` があるのはなぜか

同じ判定をサーバーとクライアントの両方が必要とするから。

- サーバー: 「その召喚は正当か」を**最終判定**する
- クライアント: 「召喚できるカードを光らせる」ために**同じ判定を先読み**する

判定が二重実装だとズレて「押せるのにエラーになる」が起きる。そこで判定の本体を `shared/` に置き、
両方が同じ関数を呼ぶ。とくに `shared/rules.ts`（1,764行）は色・系統・キーワード・BPなどの述語の集積地で、
**カードの性質を調べたいときはまずここを探す**。

多色カードがあるため、色の判定を `card.colors[0] === "red"` のように書いてはいけない。
必ず `cardHasColor` / `instHasColor` などの述語を通す。

---

## 6. 中断と再開（この実装で一番難しいところ）

効果の解決中に「どれを対象にするか」をプレイヤーに選ばせる必要が出たとき、
処理を**その場で止めて状態に書き込み**、次のアクション（`resolveChoice`）で続きから再開する。

| 状態 | 役割 |
| :-- | :-- |
| `GameState.pendingChoice` | 「今プレイヤーに何を聞いているか」。1つだけ |
| `GameState.resumeStack` | 「中断された残りの処理」。`pendingChoice` とは独立したスタック |

`pendingChoice` が「問い」で、`resumeStack` が「続き」。両者が別なのは、
1つの問いへの回答が複数の処理の再開を引き起こしうるため。

新しく中断点を作りたくなったら、**自分で `suspend` を呼ぶ前に**次の2つを読む。

- `docs/design/INTERRUPTION_POINTS.md` — どの層なら中断できるか・3つの実装パターンと使い分け
- `docs/design/RESUME_STACK.md` — 中断された側の書き方・挿入順の規則

`BS_DEBUG_CHECKS=1`（smoke は常にこれ）で走らせると、**中断したのに処理を続けた**場合に
`checkNoMutationAfterSuspend` が検出する。中断まわりを触るときはこの検査を頼りにする。

---

## 7. カードデータの構造

```
data/cards/BS01.json 〜 BS09.json    弾ごとに分割（1ファイル566KBまで肥大化したため2026-08-03に分割）
data/staging/BS0N.json               Wikiから取り込んだ生データ（effects なし）
data/card-notes.json                 「意図的に実装しない」理由を書く場所
data/effect-gaps-baseline.json       実装漏れの既知件数（減らす方向にしか更新しない）
```

読み書きは必ず `data/loadCards.ts` の `loadAllCards()` / `loadCardsBySet()` を通す。
**個別ファイルを直接 `readFileSync` しない**。
`data/loadCards.ts` は `node:fs` を使うので、**クライアントから import してはいけない**
（ブラウザへはサーバーの `GET /api/cards` が結合済みの1配列を返す）。

⚠️ **cardId をハードコードしない。** カードデータは Wiki 実データ由来で、過去にIDが全面的にズレた事故がある。
デッキレシピやテストでIDを書くときは、python3 等でカードデータをパースしてID・名前・色の一致を機械検証する。

---

## 8. 相互依存の塊

エンジン中核の **14ファイルが1つの相互依存の塊**になっている。

```
GameState ↔ EffectModules ↔ removal ↔ triggers ↔ actions/index ↔ actions/* ↔ RuleValidator
```

循環しているので層に順序を付けられない。これは CommonJS の循環 require で動いている:
**すべて関数宣言であり、トップレベルでは呼び合わない**（呼び出しは対戦処理中＝全モジュール読み込み後）ため安全。

この前提が崩れると起動時に `undefined is not a function` で落ちる。つまり:

- 循環している2ファイルの間で、**トップレベルで相手の関数を呼ばない**（定数の初期化などで踏みやすい）
- 新しい循環をここに増やさない

---

## 9. コードを探すときの道具

### 構造マップ（`tools/analyze.ts`）

TypeScript コンパイラ API で `server/src` / `shared` / `public/src` / `data` を解析し、
**依存関係と関数の呼び出し関係を1枚のHTML**にする。サーバー不要でブラウザから直接開ける。

```bash
npx tsx tools/analyze.ts     # tools/graph.html を生成（約0.5秒）
open tools/graph.html
```

- 依存図タブ: 上ほど入口、下ほど土台。ノードをクリックすると使用先が青・使用元が橙で残る
- 呼び出しツリータブ: 関数を起点に「何を呼んでいるか」を辿る
- 左の検索窓は**関数名・型名も引く**

**自動更新されない**ので、コードを足したら回し直す（古さは画面右上の生成時刻で判断）。
使い方の詳細は `tools/memo.md`。`tools/` は個人用として git 管理外なので、
クローンし直した環境には存在しない（実体は git 履歴の `resume-stack` ブランチに残っている）。

### grep で探すときの型

| 探しもの | 探し方 |
| :-- | :-- |
| 効果の語彙（何ができるか） | `server/src/type.ts` の `EffectAction` を `type: "` で grep。**各行に日本語の説明と実例カード名が付いている** |
| ある効果の実装 | アクション名で `server/src/logic/actions/` を grep |
| カードの効果データ | `data/cards/` をカード名で grep |
| あるルールの判定 | `shared/rules.ts` を述語名（`hasX` / `instX` / `matchesX`）で grep |
| 「なぜこう実装したか」 | `docs/design/` と、コード中の日本語コメント（この repo はコメントが厚い） |

`type.ts` の型定義には**実装の理由と対象カード名が日本語で書かれている**。
新しい効果を書く前にここを読むのが結局いちばん速い。
