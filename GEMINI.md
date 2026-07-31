# GEMINI.md

UI担当（Gemini）向けのガイド。実装担当・設計担当（Claude）は `CLAUDE.md` を参照する。

## 担当範囲

`public/`（`src/` / `css/` / `*.html`）のクライアント側。
**エンジン（`server/src/`・`shared/`）と `data/cards.json` は変更しない。**
変更が必要になったら chatbox で実装担当に依頼する。

## エージェント間連絡（chatbox）

連絡は `chatbox/` を使う。運用ルールの全文は `chatbox/README.md`。**守るべき点は5つ**:

- 起動時に読むのは `chatbox/INDEX.md` と自分宛の未処理メッセージ**だけ**。
  自分宛は次のコマンドで出る:

  ```
  npx tsx scripts/chatbox.ts inbox UI担当
  ```

- **`chatbox/archive/` を無条件に読まない**。`archive/2026-07.md` だけで約7万トークンある。
  必要なときは `grep` で当たりを付け、該当箇所だけ読む
- 1メッセージは 4KB / 60行以内。長い調査結果は別ドキュメントに書いて参照リンクを張る
- 返信は**新しいファイルを作らず**、受け取ったメッセージの `## 返信` に追記して `status` を更新する。
  完了したら `npx tsx scripts/chatbox.ts done <id>` を打つ
- 完了時、残すべき結論があれば `DECISIONS.md` へ1〜3行で転記する

新しく依頼・質問を出すときは:

```
npx tsx scripts/chatbox.ts new --from UI担当 --to 実装担当 --title "件名"
```

## 検証

変更後は必ず次を通す。

```
npm run typecheck && npm run build:client
```

動作確認は `PORT=3100 npx tsx server/src/index.ts` で起動して行う。

## コードスタイル

- セミコロンなし、4スペースインデント
- コメント・ログ・エラーメッセージ・UI文言は日本語
- コミットメッセージは日本語

## 注意

- **ルール判定を `public/src/` に自前実装しない。** 判定は `shared/rules.ts` /
  `shared/cost.ts` / `shared/block.ts` から import する（自前実装は過去に表示バグを3件出した）
- **バグ報告フォームの `clientContext` に対戦ログを入れない。** サーバーが末尾200行を付けており、
  クライアントから送ると `express.json({ limit: "32kb" })` に引っかかって報告自体が 413 で失敗する
  （詳細は `DECISIONS.md`）
