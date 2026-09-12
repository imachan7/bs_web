# bs-web

バトルスピリッツをブラウザ上で対戦できる Web アプリです。
サーバーでゲーム状態を一元管理し、Socket.io でリアルタイムに同期します。

**遊べる場所: https://bs-web-battle.app**

## 実装状況

- **カード 1602枚**（第一弾 BS01 〜 第十四弾 BS14「英雄龍の伝説」、構築済みデッキ SD01 / SD02 / SD04 / SD06、プロモ）
- **ブレイヴ**（合体スピリット）60枚、**バースト**34件、キーワード能力16種
- **AI対戦**（1人でも遊べる）
- **デッキビルダー**と、構築済み13種のプリセットデッキ

## 動かす

```bash
npm install
npm run dev     # サーバーとクライアントを同時起動
```

ブラウザで `http://localhost:3000` を2つ開き、同じルームIDで入室すると対戦が始まります
（1人目が先攻 p1、2人目が後攻 p2）。1人で試すなら AI 対戦を選びます。

## 技術スタック

- サーバー: Node.js / TypeScript / Socket.io
- クライアント: TypeScript（esbuild でバンドル）/ Vanilla DOM
- 開発実行: tsx
- 本番: Google Cloud Run（`main` へのマージで GitHub Actions が自動デプロイ）

**ルール判定はサーバーとクライアントで同じ実装を共有します**（`shared/`）。
二重に書くとズレて「押せるのに弾かれるボタン」が生まれるためです。

## 検証

```bash
npm run typecheck
npm run smoke          # エンジン単体テスト（11,600件超）
npm run validate:cards # カードデータの構造検査
npm run validate:gaps  # 効果の実装漏れ検査
```

カードデータは型検査の対象外なので、**「効果を書き忘れた」は typecheck も smoke もすり抜けます**。
`validate:gaps` がそれを検出します。カードデータを触ったら必ず通してください。

その他の検査（実行時カバレッジ、効果文と実装の意味照合、サーバー／クライアントの判定ズレ）は
[CLAUDE.md](./CLAUDE.md) の「検証コマンド」にまとまっています。

## ドキュメント

**このリポジトリを保守・拡張するなら [docs/guide/](./docs/guide/README.md) から読む**（目的別の索引）。

- [docs/guide/](./docs/guide/README.md) — 保守の手引き（コードの地図・カード追加・効果実装・日々の保守）
- [CLAUDE.md](./CLAUDE.md) — 開発の進め方・検証コマンド・踏みやすい罠
- [data.md](./data.md) — データ構造・設計方針の仕様書
- [SPEC.md](./SPEC.md) — 実装状況・カード/効果の対応・今後の課題（開発メモ）
- [docs/design/](./docs/design/) — ゲームの手順・解決順の一次資料（**実装前に読む**）
- [docs/ops/](./docs/ops/) — デプロイ・インフラ

## ステータス

開発中（WIP）。カードデータは [バトスピ Wiki](https://batspi.com/) のカードリストを基にした非公式の実装で、
ファンによる学習目的のプロジェクトです。
