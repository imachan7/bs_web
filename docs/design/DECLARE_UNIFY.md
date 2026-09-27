# 「〜を指定する。指定した〜」を部品 `declare` で書く（R5。2026-09-27）

R5_TRIAGE の G-exceptColor・G-familyChoice と、「指定する」を名前に持つ1枚専用 type をまとめる。

## §1 足りない部品と、組み合わせで書けない理由

| 部品 | 種類 | 形 | 組み合わせで書けない理由 |
| :-- | :-- | :-- | :-- |
| `declare` | 組み合わせ方 | `{ what: "color"｜"family"｜"cost", options?, from?, chooser?: "opponent"｜"each", then }` | 「値を1つ選び、後ろの効果の絞り込みに使う」を書く器が無い。`if`・`sequence` は値を渡さない |
| `declared` | 絞り込みの軸 | `TargetFilter.declared`・`CardPick.declared` に `"match"`（指定した値を持つ）／`"except"`（指定されなかった色を1つでも持つ） | 既存の `color`・`family`・`cost` は固定値しか書けない |

- 指定した値は記録の枠に置かず、`then` の中の `declared` を実際の値（`color`・`family`・`cost`・`colorNotIn`）に**書き換えてから**解決する（`then` が `sequence` だと記録の枠が変わって読めないため。継続効果にも値がそのまま残る）。`declare` の外の `declared` は validate:cards が落とす
- 候補：`options`（効果文が並べる：「緑/黄から」「コスト4以下から」「想獣か獣頭」）か `from`（盤面から：「自分のフィールドに出ているスピリットの色」）。どちらも無ければ全色
- `chooser: "each"`（お互い）は、発生源の持ち主→相手の順に指定し、`except` はどちらかが指定した色を安全とする（今の実装どおり）
- 「このターンの間、指定した色の〜」（継続効果）は、置く時点で `declared` を実際の値に置き換えて `timedEffect` に書く（PR3）

## §2 移すもの（1行1種）

| type | 枚数 | 書き方 | 今の実装との違い |
| :-- | --: | :-- | :-- |
| destroyAllByChosenCost | 1 | `declare{cost, options 0〜4}` → `destroy{all, filter{declared match}}` | なし |
| exhaustAllByColor | 3 | `declare{color}` → `exhaust{all, anySide／side, filter{declared match}}` | **色を自動で選んでいた → プレイヤーが選ぶ** |
| refreshByFamilyAuto | 2 | `declare{family, from 自分のスピリット}` → `refreshOne{count 3, filter{declared match}}` | **系統を自動で選んでいた → プレイヤーが選ぶ** |
| familyChoiceThenBpBuffAll | 1 | `declare{family, from 自分のスピリット}` → `timedEffect bp`（filter{declared, uncombined}） | なし |
| drawPerChosenFamily | 1 | `declare{family, options[想獣,獣頭]}` → `draw{countCounter: 指定した系統の自分のスピリット}` | なし |
| destroyNexus.chooseColor | 1 | `declare{color}` → `destroyNexus{all, filter{declared match}}` | なし |
| destroyAllExceptChosenColors | 2 | `declare{color, from 各自のスピリット, chooser each}` → `destroy{all, anySide, filter{declared except}}` | なし |
| destroyAllNexusesExceptChosenColors | 1 | 同上のネクサス版 | **お互いの色を自動で選んでいた → 各自が選ぶ** |
| destroyFieldExceptOpponentChosenColor | 1 | `declare{color, from 相手のスピリット, chooser opponent}` → `destroy`＋`destroyNexus`（except） | なし |
| returnFieldExceptOpponentChosenColor | 1 | 同上 → `returnToHand{all, filter{declared except}}` | なし |
| recoverAllMagicFromTrashByColorChoice | 1 | `declare{color, options[緑,黄]}` → トラッシュ→手札（pick{declared}） | トラッシュ→手札の器がそろってから |
| colorChoiceLendThisTurn・grantFamilyChoiceAll・refreshWhenBlockedByChosenColorThisTurn | 4 | `declare` → `timedEffect`（PR3） | |

## §3 確認したいこと（私はこう読みました → これでいいですか）

2026-09-27 ユーザー確認（3つとも私の読みどおり）
- 自動で決めていた6枚（exhaustAllByColor 3枚・refreshByFamilyAuto 2枚・プレシオス）は、プレイヤーが選べるようにする。非対話（AI・テスト）の自動選択は近い形で残す
- 「色をひとつ選び」「色1色を指定する」（候補の書かれていないもの）は6色すべて。場にいない色も指定できる
- 「系統1つを指定する」は自分のフィールドのスピリットが持つ系統（五輪転生炎の 09-16 の決定と同じ）
- 多色の個体と「指定されなかった色」：指定されなかった色を1つでも持てば対象（ケンドラゴス・マタドーラの今の実装と同じ。確認は不要だった）

## §4 PR の分け方

1. 器：`declare`・`declared`／`colorNotIn` 軸。カードデータは触らない
2. 移行（即時の効果）：済み＝destroyAllByChosenCost・exhaustAllByColor・refreshByFamilyAuto・destroyAllExceptChosenColors・returnFieldExceptOpponentChosenColor（8枚）。
   ネクサスを含む3種（destroyNexus.chooseColor・destroyFieldExceptOpponentChosenColor・destroyAllNexusesExceptChosenColors）も済み：destroyNexus に `filter` を足した。プレシオスの「ネクサスが合計3色以上あるとき」は `if{count: bothNexusColors}`。
   familyChoiceThenBpBuffAll（五輪転生炎）は `timedEffect{all}` で書いた。「このターンの間…すべて」は後から出た個体にも効く（SEMANTICS_AUDIT §3.12。旧実装は使った時点の個体だけだった）。drawPerChosenFamily（SD02-004）はカウンタ `{ ownSpirits: TargetFilter }` で書いた
3. 継続効果の4種と、トラッシュ→手札の器がそろったらヴァリエル
