# bs-web

# ディレクトリ構造

```
bs_web/
├── data/               # カードデータや定数
│   ├── cards.json      # data.mdをJSON化したマスターデータ
│   └── constants.ts    # フェーズ名や色の定義など
├── server/             # サーバーサイド（Node.js / Socket.io）
│   └── src/
│       ├── index.ts          # エントリポイント（サーバー起動、Socket接続）
│       ├── roomManager.ts    # 対戦部屋の管理
│       └── logic/            # ゲームエンジン（心臓部）
│           ├── GameState.ts      # ゲームの状態管理クラス
│           ├── GameEngine.ts     # アクション実行・効果発動の統括
│           ├── EffectModules.ts  # 個別の効果（ドロー、破壊など）の部品
│           ├── RuleValidator.ts  # ルールチェック（コスト計算など）
│           └── PhaseManager.ts   # ターンの進行管理
├── public/             # クライアントサイド（ブラウザで表示するもの）
│   ├── index.html      # メイン画面（簡易UI）
│   ├── css/
│   │   └── style.css   # スタイル
│   └── src/
│       ├── main.ts     # サーバーとの通信、イベント購読
│       └── renderer.ts # データの画面反映（DOM操作）
├── package.json        # 依存ライブラリ管理
└── README.md
```
