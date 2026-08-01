# バトスピ Web対戦 — UI/UX 診断レポート

> **作成日**: 2026-07-21  
> **対象**: ブラウザ対戦型バトルスピリッツ（ターン制 TCG、PC/スマホ両対応想定）  
> **競技志向**: 中〜高（初期弾のルールを忠実に再現、フラッシュ優先権・覚醒等の競技要素あり）  
> **カード表現**: 手札 = 矩形カード (100×140px)、フィールドスピリット = 円形トークン (76px)、ネクサス = 六角形トークン (70×78px)  
> **調査対象**: `public/css/style.css`, `public/src/renderer.ts`, `public/src/main.ts`, `public/index.html`, `public/css/deck.css`, `public/deck.html`

---

## 目次

1. [サマリー](#1-サマリー)
2. [課題一覧](#2-課題一覧)
3. [改善提案](#3-改善提案)
4. [優先度マップ](#4-優先度マップ)
5. [検証方法](#5-検証方法)

---

## 1. サマリー

### 強み
- **ゲームロジックの成熟度が極めて高い**。フラッシュ優先権・覚醒・装甲・pendingChoice・起動能力など競技レベルのルール処理が完成。403枚のカードプールで3弾分をカバー
- **CSS変数による設計基盤が整っている**。`:root` に色・パネル色を集約済み。スピリット=円形・ネクサス=六角形のトークン表現はヴィジュアルとしてユニークで、紙カードゲームとの差別化が効いている
- **操作ガイドの基盤がある**。`#targeting-info` バナー、`#btn-cancel-target` キャンセルボタン、トースト通知 (`showToast`)、トラッシュ閲覧パネルが既に実装済み

### 最も深刻な課題 トップ3

1. **トークンの情報密度不足（フィールド致命的）** — スピリットが 76px 円形トークンで名前・効果テキスト非表示（`display: none`）。コスト表示なし。ツールチップでの確認に完全依存するため、盤面把握に毎回ホバーが必要。6体以上並ぶとどれが何かの識別が色+BP数値だけに依存
2. **フェイズ・フラッシュ優先権の視認性不足** — `#status-bar` 内の `#phase-info`（14px テキスト）と `#flash-info`（デフォルト非表示）が画面上端に押し込まれ、フェイズ遷移とフラッシュタイミングの到来に気づきにくい。バトスピの7ステップ構造と優先権の交互移動が勝敗を分けるため致命的
3. **アニメーション/フィードバックの不在** — カードプレイ・ドロー・破壊・バトル解決にアニメーションがなく、`render()` の `innerHTML = ""` による全 DOM 差し替えで「何が起きたか」を伝達する手段がない。相手ターンの出来事を知覚できず、競技性・観戦性を損ねる

---

## 2. 課題一覧

| # | 画面/要素 | 課題 | 重大度 | 影響するプレイ体験 | UXヒューリスティック/根拠 |
|---|----------|------|--------|-------------------|------------------------|
| 1 | フィールド（スピリット） | 76px 円形トークンに名前・効果非表示。色の内側 border + BP/コア数のみで、同色の複数スピリットを即座に識別できない | **致命** | 盤面把握・戦略判断 | Nielsen #2「システムと現実世界の対応」— 紙カードは名前で個体識別 |
| 2 | フェイズ表示 | `#phase-info` が `#status-bar` 内の 14px テキスト。7ステップの進行状況を能動的に探さないと分からない | **致命** | ターン構造の理解、フラッシュの見落とし | Nielsen #1「システム状態の可視性」/ バトスピ固有 — 7ステップ認識は操作判断の前提 |
| 3 | フラッシュ優先権 | `#flash-info` が `hidden` → 表示のトグルのみ。優先権が自分にあるかの表示が弱く、パスと何もしないの区別がつきにくい | **致命** | 競技性（フラッシュ戦略） | バトスピ固有 — 優先権の交互移動が勝敗を分ける |
| 4 | アニメーション | カードプレイ・ドロー・破壊・バトル解決にアニメなし。`innerHTML = ""` で全 DOM 差し替え | **高** | 「何が起きたか」の知覚。観戦体験 | Nielsen #1 / カードゲーム慣習 |
| 5 | 操作モード | `#targeting-info` と `#btn-cancel-target` はあるが、`paying`・`awakeningSource`・`attackTargeting` のモードにはガイダンス表示が不完全 | **高** | 誤操作 | Nielsen #1 / #3「ユーザーのコントロールと自由」 |
| 6 | 色覚多様性 | カード色の識別がトークンの `inset box-shadow` 色のみに依存。赤/緑（P型/D型）、青/紫（T型）の区別困難 | **高** | 全操作（軽減計算・装甲判定で色の正確な識別が必須） | WCAG 1.4.1「色だけに依存しない」 |
| 7 | 盤面の所有者識別 | 自分フィールドと相手フィールドの境界が `#center-info-area` の `min-height: 50px` のみ。背景差なし | **高** | 盤面の認識（特にネクサス） | Nielsen #2 / 対戦ゲーム慣習 |
| 8 | 手札カード可読性 | 100×140px に名前(11px)・stats(10px)・コア(10px)・効果テキスト(9px)。テキスト 9px は WCAG の推奨最小サイズ未満 | **中** | 手札情報の読み取り | WCAG 1.4.4 テキストサイズ |
| 9 | コア操作ボタン | `.core-buttons`（24×24px）がカード上にホバーで出現。モバイルでは hover 不可。タップ領域 44px 未満 | **高** | モバイルでのコア管理 | Apple HIG 44pt / WCAG 2.5.8 |
| 10 | ライフ表示 | `.life` が `♥` 文字列のみ。5つのハートの正確なカウントが瞬時に困難 | **中** | リソース把握 | カードゲーム慣習 — 数値ラベルの併記が標準 |
| 11 | 対戦相手の思考中 | 相手ターン中 / 相手の優先権保持中の待機状態が不明瞭 | **中** | オンライン体験 | Nielsen #1 |
| 12 | ゲームログ | `#log` がテキスト一覧。ターン/フェイズの区切りなし。全テキスト `--text-muted` | **中** | 行動履歴の確認 | Nielsen #6「記憶よりも認識」 |
| 13 | ツールチップ | `max-width: 280px` で長い効果テキストが溢れる。`z-index: 1000` で衝突の可能性。レベル区分なし | **中** | カード効果の確認 | Nielsen #6 |
| 14 | バッジのタップ領域 | `.awaken-badge`/`.activate-badge` が `padding: 2px 6px; font-size: 10px` で極小 | **高** | モバイルでの覚醒・起動操作 | Apple HIG 44pt |
| 15 | レスポンシブ | CSS に `@media` ブレークポイントなし。`.nexus-zone` の `min-width: 260px` がスマホで溢れる | **高** | モバイルでのプレイ不能 | 基本的なレスポンシブ対応 |
| 16 | デッキビルダーのタップ領域 | カウント操作ボタンが小さい | **中** | モバイルでのデッキ構築 | Apple HIG 44pt |
| 17 | `prefers-reduced-motion` | 未対応 | **低** | アクセシビリティ | WCAG 2.3.3 |
| 18 | ARIA 属性 | カード要素に `role`/`tabindex`/`aria-label` なし。キーボード操作不可 | **中** | スクリーンリーダー・キーボード操作 | WCAG 4.1.2 |

---

## 3. 改善提案

### #1 — トークンにカード名を復活

**Before**: 76px 円形トークンで名前 `display: none`。同色スピリット3体の区別不可  
**After**:
- `.spirit-zone .card .name` の `display: none` を `display: block` に上書き
- `font-size: 9px; max-width: 64px; text-overflow: ellipsis; white-space: nowrap; text-align: center`
- 配置: トークン上部に名前 → 中央に BP/Lv → 下部にコア数
- 各色に Unicode アイコン（🔥💀🌿◇⭐💧）をコア数の隣に表示

**理由**: 紙バトスピはカード名で個体識別。名前なしトークンでは確認のたびにホバーが必要で操作テンポが激しく劣化  
**実装コスト**: 小（CSS上書き。renderer.ts は既に name 要素を生成しているため変更不要の可能性大）  
**リスク**: 76px 円に名前を入れると窮屈。長い名前は省略記号で対処。必要ならトークンサイズを 88px に拡大  
**対象ファイル**: `public/css/style.css`（CSS追加）、必要なら `public/src/renderer.ts`

---

### #2 — フェイズ進行バー

**Before**: `#status-bar` 内の `#phase-info` が 14px テキスト1行  
**After**:
- `#status-bar` に 7ステップのフェイズ進行バーを追加
- 各ステップをコンパクトなピルで横並び。現在フェイズをハイライト（`background: var(--warning); color: #000; transform: scale(1.1)`）
- フェイズ遷移時にパルスアニメーション（300ms）

```html
<!-- #status-bar 内に追加 -->
<div id="phase-bar">
    <span class="phase-step" data-phase="start">開始</span>
    <span class="phase-step" data-phase="core">コア</span>
    <span class="phase-step" data-phase="draw">ドロー</span>
    <span class="phase-step" data-phase="refresh">リフレ</span>
    <span class="phase-step" data-phase="main">メイン</span>
    <span class="phase-step active" data-phase="attack">アタック</span>
    <span class="phase-step" data-phase="end">終了</span>
</div>
```

```css
#phase-bar { display: flex; gap: 4px; align-items: center; }
.phase-step {
    padding: 3px 8px; font-size: 11px; border-radius: 12px;
    background: rgba(255,255,255,0.05); color: var(--text-muted);
    transition: all 0.3s;
}
.phase-step.active {
    background: var(--warning); color: #000; font-weight: 700;
    transform: scale(1.1);
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
}
```

**理由**: バトスピの7ステップはアクション判断に直結。MTG Arena のフェイズバーが参考例  
**実装コスト**: 小（HTML追加 + CSS + renderer の `render()` でアクティブクラス更新）  
**リスク**: モバイルで横幅不足。2文字略称（「開」「コ」「ド」「リ」「メ」「ア」「終」）にフォールバック  
**対象ファイル**: `public/index.html`, `public/css/style.css`, `public/src/renderer.ts`

---

### #3 — フラッシュ優先権の強化

**Before**: `#flash-info` が `hidden` → テキスト表示のトグルのみ  
**After**:
1. 優先権保持中に `#board` にボーダーグロー:
   ```css
   #board.your-priority {
       box-shadow: inset 0 0 0 3px var(--warning), inset 0 0 20px rgba(245, 158, 11, 0.15);
   }
   ```
2. パスボタンに脈動アニメーション:
   ```css
   @keyframes pulse-btn {
       0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6); }
       50% { box-shadow: 0 0 0 8px rgba(59, 130, 246, 0); }
   }
   #btn-pass.pulse { animation: pulse-btn 1.5s infinite; }
   ```
3. 相手が優先権保持中は `#targeting-info` に `「相手が検討中…」` 表示
4. `#battle-info` にアタッカー名・BP・ブロッカー名・BPを明記

**実装コスト**: 小（CSS + renderer の条件分岐にクラス付与追加）  
**対象ファイル**: `public/css/style.css`, `public/src/renderer.ts`

---

### #4 — アニメーション/フィードバック（段階的導入）

**Phase 1 — イベント通知レイヤー**:
- サーバーから `events[]`（`{type: 'summon' | 'destroy' | 'draw' | 'damage', ...}`）を配信
- `render()` の前にイベントごとのアニメーション再生:
  - 召喚: カード名フェードイン（300ms）
  - 破壊: shake アニメ（200ms）+ 赤フラッシュ
  - ライフダメージ: ライフエリアにシェイク + 赤パルス
  - バトル解決: BP数値の衝突エフェクト

**Phase 2 — DOM 差分更新**（大規模）:
- `render()` を `instanceId` キーの差分更新に分解

**実装コスト**: Phase 1 = 中、Phase 2 = 大  
**リスク**: 過剰アニメでテンポ悪化。duration 上限 500ms + `prefers-reduced-motion` 対応  
**対象ファイル**: `server/src/index.ts`（イベント配信）, `public/src/renderer.ts`, `public/css/style.css`

---

### #5 — 全操作モードのガイダンス拡張

**Before**: `#targeting-info` でターゲット選択のみ案内  
**After**: 全モードでバナー表示:
- `paying`: `「💎 コスト支払い: 残り {n} コア。スピリットをクリック」`
- `awakeningSource`: `「🔄 覚醒: コアの移動元を選択」`
- `attackTargeting`: `「⚔️ 指定アタック: 対象スピリットを選択」`
- `choiceMode`: `「⚡ {prompt}」`
- 全モードで `#btn-cancel-target` を表示

**実装コスト**: 小（renderer の各モード分岐で `#targeting-info` テキスト更新）  
**対象ファイル**: `public/src/renderer.ts`, `public/src/main.ts`

---

### #6 — 色覚多様性への対応

**Before**: カード色が色のみで区別  
**After**: 各色に Unicode シンボル追加（赤🔥 紫💀 緑🌿 白◇ 黄⭐ 青💧）。トークン内部とシンボルアイコンの両方に表示  
**実装コスト**: 小  
**対象ファイル**: `public/src/renderer.ts`, `public/css/style.css`

---

### #7 — フィールド境界の明確化

**Before**: 自分/相手フィールドの区別が空白のみ  
**After**:
```css
#center-info-area {
    border-top: 1px solid rgba(239, 68, 68, 0.3);
    border-bottom: 1px solid rgba(59, 130, 246, 0.3);
}
#opponent-area { border-left: 3px solid rgba(239, 68, 68, 0.3); }
#player-area { border-left: 3px solid rgba(59, 130, 246, 0.3); }
```

**実装コスト**: 小（CSSのみ）  
**対象ファイル**: `public/css/style.css`

---

### #9 — モバイルのコア操作ボタン

**Before**: `.core-buttons` がホバーで出現。24×24px  
**After**:
```css
@media (hover: none) {
    .core-buttons { opacity: 1; }
    .core-buttons button { width: 36px; height: 36px; font-size: 16px; }
}
```

**実装コスト**: 小（CSS `@media (hover: none)` 追加）  
**対象ファイル**: `public/css/style.css`

---

### #10 — ライフ数値の併記

**Before**: `♥♥♥♥♥` のみ  
**After**: ハート表示に数値併記 `❤ 5`。変動時にスケールアニメーション  
**実装コスト**: 小  
**対象ファイル**: `public/src/renderer.ts`

---

### #14 — バッジのタップ領域拡大

**Before**: `padding: 2px 6px; font-size: 10px` で極小  
**After**:
```css
.awaken-badge, .activate-badge {
    min-width: 44px; min-height: 28px;
    padding: 4px 10px; font-size: 12px;
}
```

**実装コスト**: 小（CSSのみ）  
**対象ファイル**: `public/css/style.css`

---

### #15 — レスポンシブ対応

**Before**: `@media` ブレークポイントなし  
**After**:
```css
@media (max-width: 768px) {
    .field-row { flex-direction: column; gap: 8px; min-height: auto; }
    .nexus-zone { min-width: auto; }
    .spirit-zone .card { width: 60px; height: 60px; }
    #action-buttons-container {
        position: fixed; bottom: 0; left: 0; right: 0; top: auto; transform: none;
    }
    #action-buttons { flex-direction: row; justify-content: center; }
}
@media (max-width: 480px) {
    .spirit-zone .card { width: 50px; height: 50px; }
    #hand .card { width: 64px; height: 90px; font-size: 9px; }
}
```

**実装コスト**: 中  
**対象ファイル**: `public/css/style.css`, 必要なら `public/src/renderer.ts`

---

## 4. 優先度マップ

```
        ┌─────────────────────────────────────────────────────┐
        │              効果 高 ↑                               │
        │                                                     │
        │  【QuickWin ★★★】          【大型改善】             │
        │  #2 フェイズ進行バー         #4 アニメーション        │
        │  #3 優先権ボーダーグロー      #15 レスポンシブ全体     │
        │  #5 モード別ガイダンス拡張     #1 トークン名前表示     │
        │  #7 フィールド境界線                                 │
        │  #10 ライフ数値併記                                  │
        │  #14 バッジタップ領域拡大                             │
        │                                                     │
        │  【やるべき】               【長期計画】             │
        │  #6 色覚対応アイコン          #18 ARIA/キーボード     │
        │  #8 手札テキストサイズ         #4 Phase2 DOM差分      │
        │  #9 モバイルコアボタン         #17 motion-reduce      │
        │  #11 相手思考中表示                                  │
        │  #12 ログの構造化                                    │
        │  #13 ツールチップ改善                                │
        │  #16 デッキビルダー修正                               │
        │                                                     │
        │              効果 低 ↓                               │
        │  ← 実装コスト 小                実装コスト 大 →      │
        └─────────────────────────────────────────────────────┘
```

### まず着手すべきクイックウィン

| 順位 | 課題# | 内容 | 推定作業時間 |
|------|-------|------|-------------|
| 1 | #2 | フェイズ進行バー | 1.5–2h |
| 2 | #3 | フラッシュ優先権グロー + パス脈動 | 1h |
| 3 | #7 | フィールド境界線 + ラベル | 30min |
| 4 | #5 | 全操作モードのガイダンス拡張 | 1–2h |
| 5 | #10 | ライフ数値併記 | 30min |
| 6 | #14 | バッジタップ領域拡大 | 30min |
| 7 | #1 | トークンにカード名復活 | 1h |
| 8 | #6 | 色覚対応アイコン | 1h |
| 9 | #11 | 相手思考中表示 | 1h |
| 10 | #9 | モバイルコアボタン対応 | 1–2h |

> **上位6つ（#2, #3, #7, #5, #10, #14）で約5.5時間**。これだけで操作体験が劇的に改善する。

---

## 5. 検証方法

| 課題# | 改善内容 | 検証方法 | 計測指標 |
|-------|---------|---------|---------|
| #1 | トークン名前表示 | タスクテスト: 「相手の○○を指差して」 | 正答時間（目標 3秒以内） |
| #2 | フェイズバー | 任意の瞬間に「今何フェイズか」を質問 | 正答率（目標 95%） |
| #3 | 優先権パルス | A/B: パルスあり vs テキストのみ | 意図しないパス率 |
| #4 | アニメーション | 5ターン後に「何が起きたか」記述 | 正答率 + SUS スコア |
| #5 | モード別ガイダンス | A/B: ガイダンスあり vs なし | 誤操作率（無効アクション / ターン） |
| #6 | 色覚対応 | Sim Daltonism で P/D/T 型確認 | 6色識別正答率（目標: 全型100%） |
| #7 | 所有者識別 | 「このネクサスはどちらのか」 | 正答率 + 所要時間 |
| #9 | コアボタン | モバイルでコア移動タスク | 誤タップ率、完了時間 |
| #14 | バッジ拡大 | モバイルで覚醒発動タスク | 初回成功率（目標 90%） |
| #15 | レスポンシブ | 各ブレークポイントのスクリーンショット比較 | overflow・重なりの有無 |
