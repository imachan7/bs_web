# 差し込み先の手順書（REFACTOR_PLAN R1）

変更の種類ごとに、触るファイルと関数、手本、検査への追記の要否、罠だけを書く。
**R3 の分割1つごとに、その概念の行を足す**（2026-09-26 から書き始めた。まだ全部の種類はそろっていない）。
関数の置き場は [CODEMAP.md](../CODEMAP.md) を名前で grep する。

## ブレイヴ（`server/src/logic/brave.ts`）

| 変更の種類 | 触るところ | 手本 | 罠 |
| :-- | :-- | :-- | :-- |
| 合体させる新しい経路 | `attachBrave` を呼ぶだけ（合体の入口はここ1つ） | 効果による再合体（`detachBrave.combineToChosenSpirit`） | 自分自身との合体は `attachBrave` が弾く。「スピリットが合体したとき」の誘発は `attachBrave` が出すので、呼び出し側で出さない |
| 効果で分離・破壊・手札／デッキに戻す（ブレイヴだけ） | `detachBraveByEffect`・`detachBraveByOwnerChoice`・`destroyCombinedBrave`・`returnCombinedBraveTo*` | — | 自分の効果での分離はコア不要、相手の効果での分離は持ち主がコアを選ぶ（BRAVE.md §12.5） |
| ホストが場を離れるときの扱い | `detachBravesOnLeave`（残すかの確認は `flushBraveKeeps`／`applyBraveKeep`／`declineBraveKeep`） | — | 破壊・バウンス・消滅のどの経路も `detachBravesOnLeave` を通す。コアを移した**後**に呼ぶ |
| 合体中だけ効く効果 | カードデータの `whileCombined: true`（判定は各 kind 側） | — | 誘発は `triggers.ts` の `fireTrigger` が合体中のブレイヴの効果も合流させる（BRAVE.md §4） |

## 破壊されたときの復活・【不死】（`server/src/logic/revive.ts`）

| 変更の種類 | 触るところ | 手本 | 罠 |
| :-- | :-- | :-- | :-- |
| 「破壊されたとき、〜することでフィールドに残る」系 | `tryReviveOnDestroy`（確認は `queueReviveConfirm`・`applyReviveConfirm`・`declineReviveConfirm`） | — | 破壊の確定前に聞く。複数体の同時破壊では順番を `removal.ts` の `askDestroyOrder` が聞く |
| 【不死】の条件・コスト | `fushiCandidates`（引き金は `destroyedCostsOf`・`destroyedFamiliesOf`）、召喚は `applyFushiSummon` | — | 召喚コスト＋維持コアを払えないものは確認自体を出さない |
| デッキ破棄からの無償召喚 | `spiritMillFreeSummonOrConfirm`・`applySpiritMillFreeSummon` | — | 呼び出しは `zones/mill.ts` |

## 除去（`server/src/logic/removal.ts`）

スピリット・ネクサスの破壊（`destroySpirit`・`destroyNexus`）、手札・デッキへ戻す、コアを取り除く。ブレイヴと復活は上の2ファイルへ分けた。

## 共有の判定（`shared/rules/`。import は従来どおり `shared/rules` から）

| 変更の種類 | 触るところ |
| :-- | :-- |
| レベル・BP の表・ブレイヴの合成・キーワードの定義 | `rules/level.ts` |
| シンボルの数と色 | `rules/symbols.ts` |
| 盤面の付与効果を含めたキーワード・系統の判定 | `rules/keywordState.ts` |
| 効果耐性（装甲・効果を受けない・対象にならない） | `rules/resistance.ts`（入口は `boardResistanceAgainst`） |
| オーラ・実効BP・数を数えるときの重み | `rules/bp.ts` |
| 対象の絞り込み（`TargetFilter` の新しい軸） | `rules/targetFilter.ts` の `matchesTarget` |
| 継続制約・期間つき効果の読み取り（`timedContentsOn` など） | `rules/constraints.ts` |
| 覚醒・起動能力・指定アタック・維持コア・フラッシュのロック | `rules/activation.ts` |

