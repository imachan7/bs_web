# リファクタリング計画（実装役が差し込み先を探す費用を減らす）

2026-09-22 起票。**着手は BS16 の PR がマージされてから**（`handDeck.ts` などを BS16 ブランチでも触っているため）。
1項目＝1ブランチ＝1PR（CLAUDE.md「PR は1つの作業単位で出す」）。

## 0. 測った結果（BS16 バッチ2の実装役4体、2026-09-22）

| 体 | 呼び出し | grep＋sed | 最初の Edit |
| :-- | --: | --: | --: |
| ① X03 | 119 | 96 | 57回目 |
| ② 021/065/058/067 | 203 | 129 | 34回目 |
| ③ X04/036/079 | 151 | 104 | 81回目 |
| ④ 027/P071/080 | 209 | 148 | 59回目 |

**呼び出しの約7割が grep と sed の探索だった。** 差し込み先メモ（`BS16_HOOKS_A/B.md`）を渡してもこの量になる。
探していたものは次の5種類。

| 記号 | 探していたもの | 実例 |
| :-- | :-- | :-- |
| A | 共有ヘルパーの置き場所 | `matchesFamilyFilter` を存在しないパスで6回続けて探した。`opponentOf`・`destroySpirit`・`findSpiritAny`・`ActionCtx` も同様 |
| B | 型がどのファイルにあるか | `type.ts`／`types/effectDef.ts`／`types/effectAction.ts` を行き来した。CLAUDE.md の索引1行が `type.ts` しか見ておらず、570個中144個しか出ていなかった（09-22 に修正済み） |
| C | クライアントとサーバーの二重実装 | ②のコスト支払いが `shared/rules.ts`・`RuleValidator.ts`・`GameEngine.ts`・`public/src/main.ts`・`renderer.ts` の5ファイルにまたがった |
| D | 誘発条件の軸がどこで判定されているか | `triggers.ts` の `effect.attackerOnly` などが散らばっている（`effect.X` の参照が381か所） |
| E | 巨大なファイルの中の位置 | `handDeck.ts` 4566行など |

## 1. 項目（上から順に着手する）

| # | 項目 | 効くもの | 規模 | 状態 |
| :-- | :-- | :-- | :-- | :-- |
| R1 | **差し込み先の手順書** `docs/design/WHERE_TO_ADD.md`：変更の種類ごとに、触るファイルと関数を列挙する（下の表） | A・B・C | 小（メインループが書く） | 未着手 |
| R2 | **ヘルパーの索引を自動生成**：`npm run codemap` → `docs/CODEMAP.md`（export 名・ファイル:行・先頭コメント1行）。CI で「生成し直すと差分が出る」なら落とす | A | 小 | 未着手 |
| R3 | `handDeck.ts` を6ファイルに分ける（`drawDiscard` / `tegamoto` / `reveal` / `trashRecover` / `mill` / `bounce`）。中身は移すだけ | E | 小 | 決定済み |
| R4 | 型3ファイルのコメント削減（CLAUDE.md「コードスタイル」の基準で） | B・E | 中（機械的） | 決定済み |
| R5 | 手札破棄をコストにする7つの type を `costDiscardHand { count, filter?, then }` へまとめる | 器の増殖 | 中 | **「then が完全に解決できるか」の判定一覧をユーザーに確認してから** |
| R6 | 誘発条件の軸を `triggers.ts` の1関数に集める（軸の一覧＝その関数を読めば分かる形にする） | D | 中 | 調査から |
| R7 | クライアントとサーバーの判定を `shared/rules.ts` に一本化する（まずコスト支払いから） | C | 大 | 調査から。`audit:parity` で挙動が変わらないことを確かめる |

R1 と R2 は挙動を変えずに効くので最初にやる。R6 と R7 は着手前に調査役（Sonnet）が「どこに何があるか」のメモを書き、設計をユーザーに確認する。

### R1 の手順書に載せる「変更の種類」

新しいアクション type／新しい `EffectDef` の kind／新しい fieldEvent と発火点／誘発条件の新しい軸／
新しい `TargetFilter` の軸／新しい `PendingChoice`（サーバーとクライアントの両方）／
`GameState` の一時フィールド（「直前の〜」を橋渡しするもの）／代替コスト（【神速】の支払い補助など）／
継続制約（`constraint`・`turnConstraints`）。

各行に書くのは次の4つだけ：**触るファイル:関数、既存の手本（1つ）、`validate-cards.ts`・`coverage-effects.ts` への追記要否、罠**。
