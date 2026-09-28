# BS17「覇王編 第4弾：剣舞う世界」実装計画

**全90種**（BS17-001〜084 ＋ X01〜X06）。スピリット60 / ネクサス12 / マジック12 / ブレイヴ6、バニラ6枚、各色15枚、多色なし。
データは `data/staging/BS17.json`（2026-09-28 取り込み。`python3 scripts/fetch_wiki_cards.py --set BS17 --refer '覇王編 第4弾：剣舞う世界' --pages 2`。番号の抜け・重複なし）。
覇王編なので【バースト】（19枚）が主題。系統「雄将」（25枚）「覇皇」（9枚）を参照する札が多い。
**新しいキーワード【魔光芒】**（本文があるのは X05 クレオパトラスだけ。037・041・043・044・069 は「【光芒】/【魔光芒】を持つ」で参照）。

## 1. 進め方（BS16 バッチ3 の反省を入れた形）

1. 調査役3体（2色ずつ・並行）：節ごとに既存／新しい部品を仕分ける。**「既存」は、使うフィールドが型に実在し、同じ書き方の実カードがあるときだけ**（BS16 ではデータ役が「書けそうで書けない器」で確かめ直しを繰り返した）。メモは `BS17_SURVEY_<色>.md`
2. メインループが見直し、新しい部品の一覧と確認事項をまとめてユーザーに確認 → この文書の §2・§3 に書く
3. 部品の実装役（器2〜3個ずつ・直列）→ データ役（2色ずつ。**別の作業ディレクトリにするときは今のブランチの先頭から切る**）→ 仕上げ役
4. 定型の検証 → PR は弾ごと1つ（このブランチ `feat/bs17-import`）

## 2. 解釈（確定したもの）

（調査のあとで書く）

## 3. 新しい部品（草案。§2 の確認が済むまで実装しない）

調査メモ：`BS17_SURVEY_red_purple.md` / `_yellow_blue.md` / `_green_white.md`。重なりはまとめた（060・068 の「〜しなければ発揮できない」は1部品）。

**A. 既存の型に軸を足すだけ（22個）**

| 部品 | カード |
| :-- | :-- |
| `AuraCondition` に `battleOpponentKeyword`／`maxOwnSpirits` | 014 / 047・048 |
| `AuraDef.levelFilter` | 065 |
| `cantAttackByCost` に `act:"block"`（ブロック版。新しい type にしない） | 071 |
| `immunityGrant` に `nameIncludes` と `against:"spirit"/"brave"` | 054・072 |
| `constraintGrant`/`immunityGrant` に `combinedBraveColors`、`constraintGrant.symbolCount`（完全一致） | 036 |
| `TimedContent` に免疫（`immuneTo`） | 058 |
| `spiritEffectsDisabledGrant.targetLevel`（declare したLv） | 081 |
| `exhaust.untilRefreshedCount` | 072 |
| `reveal.countPer` に EffectCounter をそのまま受ける（`ownKeyword` 配列＝光芒/魔光芒の OR） | 041 |
| `reviveOnDestroy` に `cost:{exhaustSelf}` と `blockingOnly` | 069 / 079 |
| `triggered.onSummon.burstSummonOnly` | 044 |
| `milledMagicToTegamoto` を filter/dest 付きに一般化 | 070 |
| `battleBpAsLevel` に `costFilter`・`useLevel:"max"` | 023 |
| `summonExhausted` の自分だけ版 | 026 |
| `if` の条件に「このバーストを発動したステップ」 | 032 |
| `toDeck` の対象に「直前のバトルで破壊された側」（`lastBattleDestroyedInstanceId`） | 034 |
| `symbolFix` の種別絞り込み（ブレイヴ） | 067 |
| `MagicCondition` に自他スピリット数の比較 | 077 |
| `combineLimit` の追加枠をシンボル0に限定 | X04 |
| `returnToHand.nexus:"also"` | X04 |
| `declare` に `what:"card"`（同じカード名で広げる） | 074 |
| EffectCounter「勝ったバトルのBP差 ÷ N（上限つき）」 | 009 |

**B. 新しい部品（エンジンの手順に差し込む。12個）**

| 部品 | 種類 | カード |
| :-- | :-- | :-- |
| キーワード【魔光芒】＝【光芒】＋`magicRepeatGrant(selfInBattle)` の合成 | キーワード | X05（参照：037・041・043・044・069） |
| 「〜しなければ、その効果を発揮できない」＝相手のバースト／マジック解決前の課税 | タイミング | 060・068 |
| 指定コストのバースト効果を発揮できない | 条件の軸 | 084 |
| 手札のバースト持ちマジックを、コストを払ってバースト条件を無視して発揮 | アクション | 043 |
| ライフを減らす代わりに段階表どおりにコアを置く（置換） | タイミング | 051・X06 |
| 場のスピリットをバーストとしてセット | アクション | 004 |
| 相手のバースト1枚を見る | アクション | 049 |
| 直前に召喚時効果を発揮したカードの色を記録し、その色のマジックを使用禁止 | 記録＋条件の軸 | 083 |
| 相手のボイド/トラッシュからのコア配置をターン1個までに制限 | 条件の軸 | 063 |
| FieldEvent「ボイドから相手のライフにコアが置かれた（個数つき）」（`ownSeimeiLifeCharged` の一般化） | タイミング | 014 |
| `shinsokuPayAssist` を【神速】以外にも（本来のコスト下限・ターン1回） | 軸の一般化 | 062 |
| 「このスピリットのブレイヴ1つを手札に戻す」を単独アクションに（今は refreshSelf のコストの中だけ） | アクション | 033 |

