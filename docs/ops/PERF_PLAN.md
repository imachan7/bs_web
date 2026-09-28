# フロントエンド性能改善プラン（2026-09-28）

**前提**：PageSpeed Insights 実測でパフォーマンススコアは既に100/100（FCP/LCP 1.5秒、TBT 0ms、CLS 0）。
ここに挙げる項目はどれも「体感速度を今すぐ上げる」ためではなく、**バンドル・カードデータが今後
肥大化したときの保険**と**デッキビルダーの実際の重さ**への対応。緊急度は低い。

着手済み（`chore/pagespeed-optimizations` ブランチ）:
- `build:client` に `--minify`（main.js 252KB→127KB）
- サーバーに `compression`（gzip）ミドルウェア追加
- ロビー主要ボタンのコントラスト比修正・`<main>` ランドマーク追加

## 1. gzip 効果の実測（優先度: 高、工数: 小）

`/api/cards` は1.4MBのJSON。compression 導入後、実際にどこまで縮むかをまず数字で見る。

```
curl -s -H "Accept-Encoding: gzip" -o /dev/null -w "%{size_download}\n" https://bs-web-battle.app/api/cards
```

JSONは圧縮率が高いはずなので、ここで十分な効果が出ているなら他の項目の優先度は下がる。

## 2. デッキビルダーの初期化・再描画（優先度: 高、工数: 小〜中）

`public/src/deck.ts` の実測済みの問題と対応方針。**効果が高ければ工数増は許容**（2026-09-28 ユーザー方針）。

### 2.1 初期化の並列化（工数: 小）

`init()`（`deck.ts:1221`）が `card-notes.json` → `/api/cards` を await で直列に取得している。
依存関係が無い2つの fetch なので `Promise.all` で並列化する。実装は1箇所の書き換えのみ。

### 2.2 検索欄の debounce（工数: 小）

`deck.ts:1140` の `input` リスナーが1文字ごとに `renderPool()`（全件再構築）を呼ぶ。
150ms 程度の `setTimeout` debounce を挟む。他の filter chip（色・タイプ・コスト等）は
クリック単位の離散操作なので debounce 不要（現状のままでよい）。

### 2.3 renderPool の呼び出しを「構造が変わる場合」と「バッジだけでよい場合」に分ける（工数: 中、効果: 大）

**わかったこと**：`passesFilter()`（`deck.ts:158`）は `filterColors` / `filterTypes` / `searchText` などの
フィルタ状態と静的なカードデータだけを見ており、**`deck`（デッキ内訳）を一切参照していない**。
つまり `addCard` / `removeCard`（`deck.ts:464, 479`）は毎回 `renderAll()` → `renderPool()` を呼び、
**プールの表示対象・並び順が変わらないのに1600枚を丸ごと作り直している**。デッキ構築中は
カードをクリックするたびにこれが起きるので、フィルタの重さとは別に効いている。

対応方針：

- 各 `.pool-card` 生成時に `el.dataset.cardId = card.cardId` を持たせる（今は付いていない）
- `updatePoolBadges()` を新設：既存の `.pool-card` 要素を`dataset.cardId` で引き、
  枚数バッジ（`count-badge`）と `+` ボタンの状態だけを書き換える。**要素の再生成はしない**
- 呼び分け:
  - フィルタ・検索・ソートの変更 → 従来通り `renderPool()`（表示対象/並び順が変わるため全体再構築が必要）
  - `addCard` / `removeCard` / デッキ読み込み（`deck.ts:852, 1258` の `renderAll()`）→
    `updatePoolBadges()` + `renderDeck()` + `renderStats()` に置き換える（`renderPool()` を呼ばない）
- デッキ読み込み時は「新しいデッキに含まれない旧カードのバッジも0に戻す」必要があるため、
  `updatePoolBadges()` は差分ではなく**描画済み全 `.pool-card` を毎回舐めて `deck` の値と同期**する
  （バッジのテキスト/クラス書き換えだけなので、要素再生成に比べて十分軽い）

### 2.4 イベント委譲（工数: 小〜中）

現状は1枚ごとに `mouseenter` / `mouseleave` / `click` の3リスナーを登録しており、
1600枚では最大4800個。`#pool-grid` に1つずつ委譲すれば `renderPool()` 実行時のコストも下がる。

**注意点**：`mouseenter` / `mouseleave` はバブリングしないため、委譲するときは
`mouseover` / `mouseout` を使い、`event.target.closest(".pool-card")` と
`event.relatedTarget` が同じカード内かどうかのチェックを自前で書く必要がある
（`click` は `closest()` だけで単純に委譲できる）。

### 2.5 content-visibility: auto（工数: 小、CSSのみ）

`.pool-card`（`public/css/deck.css:255`）に `content-visibility: auto` と
`contain-intrinsic-size`（カード実測高さの概算値）を付ける。画面外のカードはブラウザが
レイアウト・描画をスキップするようになり、スクロール時と初回表示の描画コストが下がる。
**DOM要素の生成コスト自体は減らない**ので 2.3・2.4 とセットで効く。

### 2.6 本格的な仮想化（見送り）

表示範囲だけDOMを持つ windowing は効果が最大だが、`grid-template-columns: repeat(auto-fill, ...)` で
列数が画面幅依存のため行位置計算を新設する必要があり、リスクの割に 2.1〜2.5 で得られる効果と
差が小さいと判断。2.1〜2.5 を入れてまだ重ければ改めて検討する。

## 3. main.js のコード分割（優先度: 中、工数: 中）

`main.ts` はロビー用コードと対局盤面のレンダリング／カード効果処理を1本のバンドルにまとめている。
ロビーしか見ない訪問者にも対局用コードまで読ませており、PageSpeed の「未使用JS 211KiB」の主因。
対局開始時にだけ `import()` で読み込むよう分割すると効果が大きいが、`main.ts` の初期化順序に依存する
グローバル状態があるかもしれないので、分割は小さく切り出して都度 smoke で確認しながら進める。

## 4. 静的アセットへの Cache-Control（優先度: 低、工数: 中）

`express.static` は既定で `Cache-Control` を設定していない（ETag/Last-Modified のみで条件付きGET）。
`/dist` `/css` に `maxAge` を付ければ再訪問時の待ち時間を減らせるが、**Cloud Run は再デプロイのたびに
同じURLでファイル内容が変わる**ため、長い `maxAge` は「再訪問者が古いJS/CSSを掴む」事故になる。
esbuild の出力にコンテンツハッシュを付けるところとセットで設計しないと安全に導入できない。

## 5. socket.io 接続の遅延（優先度: 低、工数: 小〜中。要調査）

`main.ts:34` の `const socket = io()` はスクリプト読み込み直後に即接続している。対戦操作前は不要な接続で、
初期ネットワークの帯域を他の重要リソース（`main.js` 本体・`/api/cards`）と奪い合っている。
[DEPLOY_CLOUDRUN.md](./DEPLOY_CLOUDRUN.md) にある「タブ放置でインスタンス課金が伸びる」問題の緩和にもなる。
ただし、ロビーの「マッチング待ち人数」表示など、ページ読み込み直後の接続に依存しているUIがあるかもしれないので、
着手前に main.ts の該当箇所を洗い出す必要がある。
