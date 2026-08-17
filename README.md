# bs-web

バトルスピリッツの第一弾（BS01）を、ブラウザ上で2人対戦できるWebアプリです。
サーバーでゲーム状態を一元管理し、Socket.io でリアルタイムに同期します。

## 特徴

- BS09までは実装済み
- 現在はデバック中で、これが終わり次第ブレイブの実装に移ろうかなと思っています

## 動かす

```bash
npm install
npm run dev     # サーバーとクライアントを同時起動
```

ブラウザで `http://localhost:3000` を2つ開き、同じルームIDで入室すると対戦が始まります
（1人目が先攻 p1、2人目が後攻 p2）。

## 技術スタック

- サーバー: Node.js / TypeScript / Socket.io
- クライアント: TypeScript（esbuildでバンドル）/ Vanilla DOM
- 開発実行: tsx

## ドキュメント

- [data.md](./data.md) — データ構造・設計方針の仕様書
- [SPEC.md](./SPEC.md) — 実装状況・カード/効果の対応・今後の課題（開発メモ）

## ステータス

開発中（WIP）。カードデータは [バトスピ Wiki](https://batspi.com/) のカードリストを基にした非公式の実装で、
ファンによる学習目的のプロジェクトです。
https://bs-web.azurewebsites.net/
