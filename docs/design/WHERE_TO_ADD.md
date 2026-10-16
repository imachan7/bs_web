# 差し込み先の手順書（REFACTOR_PLAN R1）

変更の種類ごとに、触るファイルと関数、手本、検査への追記の要否、罠だけを書く。
**R3 の分割1つごとに、その概念の行を足す**（2026-09-26 から書き始めた。まだ全部の種類はそろっていない）。
関数の置き場は [CODEMAP.md](../CODEMAP.md) を名前で grep する。

## 0. ファイルの置き場と分割のルール（2026-10-15 ユーザー決定。機械的に決めるため）

**置き場は下の表で決まる。** 判断が要らないように、足すものの種類から置き場を引く。表に無い種類が出たら、先に表へ1行足す。

| 足すもの | 置き場 |
| :-- | :-- |
| キーワード能力1つ | `server/src/logic/keywords/<名前>.ts` |
| ゾーン（デッキ・トラッシュ・手札・ライフ…）の操作 | `server/src/logic/zones/<名前>.ts` |
| EffectAction の type | ACTION_VOCABULARY の分類ごとに `server/src/logic/actions/<分類>.ts` |
| 型の union／interface 1つ（TargetFilter・TimedContent・PendingChoice…）。**5KB 以上のもの** | `server/src/types/<名前>.ts`（利用側は従来どおり `type.ts` から import。type.ts が再輸出する＝`split-file.ts --reexport`）。5KB 未満は type.ts に置く |
| 画面の部品1つ（フェーズ帯・支払いUI・選択ダイアログ…） | `public/src/ui/<部品>.ts` |

- **各ファイルの1行目は、そのファイルの概念を述べるコメント**（`// 〜`）。無いファイルは `validate:size` が落とす。CODEMAP がこの行を索引に載せる
- 上限は従来どおり 2000行（型ファイルは 120KB）。**分割するときは、切った後の各ファイルを1000行（型は60KB）以下にする**（ぎりぎりで切るとすぐ次の分割が要る）
- **分割は `scripts/split-file.ts` で行う**（`npx tsx scripts/split-file.ts <元> <先> <名前…>`）。関数・型の移動、import の付け直し（元を import している側も書き換える）、移したものの本体が1文字も変わっていないかの検査、CODEMAP の作り直しまでを1回で行う。手で切らない
- 分割1つごとに、この文書に移した先の節を足す

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

## 選択の解決と再開（`server/src/logic/choice.ts`）

| 変更の種類 | 触るところ | 手本 | 罠 |
| :-- | :-- | :-- | :-- |
| 新しい `PendingChoice` の応答 | `doResolveChoice` に `if (pending.<印>)` の分岐を1つ足す（型は `types/choice.ts`、UI は `public/src`） | `pending.blockBattlePick` | 分岐の最後は必ず `finishChoiceResolution` を返す（返さないと再開スタックが消化されず、後続の誘発が放置される）。**分岐の順番に意味がある**：`kind === "option"`／`"card"` の汎用分岐より前に置く |
| 新しい再開フレーム（`ResumeFrame` の kind） | `drainResumeStack` に `frame.kind === "…"` の分岐 | `battleResolve`（→ `resumeBattleResolution`） | 積むのは `pushResumeFrames`。挿入順の規則は RESUME_STACK.md |
| 「やめた」ときに「ターンに1回」を戻す | `PendingChoice.revertActivated`／`revertTriggered` を立てる（戻すのは `revertActivatedIfSkipped`） | `GameEngine.doActivateAbility` | — |

## バトル解決（`server/src/logic/battleResolve.ts`）

| 変更の種類 | 触るところ | 手本 | 罠 |
| :-- | :-- | :-- | :-- |
| BP 比較後の破壊・バトル終了時の処理 | `runBattleStep` の `case` に足す。ステップを増やしたら `BATTLE_LAST_STEP` も上げる | case 5（【呪撃】） | **1ステップ＝中断しうる呼び出し1つ**（選択待ちが立つとその次のステップから再開する）。順序は TIMING_CHART.md の ＞６〜＞７ |
| ライフで受けたときのライフ減少 | `resolveLifeDamage` | — | 宣言した時点の盤面を読む（フラッシュ①で変わりうる） |
| 指定アタックのブロック確定 | `resolveDirectedBlock` | — | 疲労状態でもブロックさせる（`validateBlock` を通さない） |
| ブロック宣言で誘発する効果 | `blockDeclared.ts` の `resolveBlockDeclared` に収集を1行足す（`fireTrigger`／`fireFieldEventTriggers` の `collect` 引数） | 【粉砕】の `funsaiOnBlock` | すべて同時発揮で、解決順はターンプレイヤーが選ぶ（2026-10-08）。バーストは列を解決し終えてから判定し、列の途中で選択待ちが立つとバーストは判定しない |

アクションの実行（召喚・アタック・ブロック宣言・起動能力・【烈神速】）は `GameEngine.ts` に残した。

## 継続効果の再計算（`server/src/logic/state/continuous.ts`）

| 変更の種類 | 触るところ | 手本 | 罠 |
| :-- | :-- | :-- | :-- |
| 個体に書き戻す継続効果（`〜Continuous` のフィールド） | `refreshLevelAsOverrides` の先頭の `delete` 群に1行、本体に付与を1か所 | `levelAsContinuous` | **先頭で消してから付け直す**ので、消し忘れると効果が切れても残る。GameState の型にフィールドを足すのは `type.ts` |
| 期間つき効果を置くだけのアクション | `recordTimed`（プレイヤーの制約は `recordPlayerRule`、BP+ は `recordBp`） | — | 中身の種類は TIMED_EFFECTS.md §3.2 |

## 対象の選び方と選択待ち（`server/src/logic/targeting.ts`）

| 変更の種類 | 触るところ | 手本 | 罠 |
| :-- | :-- | :-- | :-- |
| 対象を選ぶアクション | 候補を作って `requestChoice`（カードなら `requestCardChoice`）。複数体を1体ずつ選ばせるなら `tryInteractiveTargetChoice` | — | 候補0件は不発、1件は即解決、2件以上で選択待ち。応答側は `choice.ts` |
| 自動で選ぶ規則（AI・非対話） | `pickEnemyCandidates`・`pickEnemyByBp`・`pickEnemyLowestCost` など | — | 対戦者が選ぶべき場面を自動にしていないかは `npm run audit:choices` |
| 「〜することで」の発動確認 | `requestActivationConfirm` | — | — |

## 効果の定義の型（`server/src/types/effectDef*.ts`。2026-10-16 に分割）

`EffectDef` は `effectDef.ts` の union で、中身を分類ごとの union に分けてある。新しい kind はどれか1つに足す（利用側は従来どおり `type.ts` から `EffectDef` を import する）。

| 分類 | ファイル |
| :-- | :-- |
| 事象で起きる誘発（召喚時・ステップ・盤面の出来事・破壊時の復活・デッキから破棄されたとき…） | `effectDefTrigger.ts` |
| 場にある間効く継続効果と付与（〜Grant・〜As・抑制・制約） | `effectDefContinuous.ts` |
| コスト・軽減・支払い方を変えるもの | `effectDefCost.ts` |
| キーワード・マジック・起動能力・ブロック時のキーワードの置き換え | `effectDef.ts` |

- `validate:cards` の「型に無いキー」の検査は `types/effectDef*.ts` を全部読む。分類のファイルを足すときは名前を `effectDef` で始める

## 誘発（`server/src/logic/triggers.ts`・`fieldEventTriggers.ts`・`stepTriggers.ts`。2026-10-16 に分割）

| 変更の種類 | 触るところ |
| :-- | :-- |
| 自分のカードの事象（召喚時・アタック時・破壊時など `TriggerEvent`）で起きる誘発 | `triggers.ts` の `fireTrigger` |
| 盤面の出来事（`FieldEvent`）で起きる誘発、手札を得た・ネクサスを配置したときの通知 | `fieldEventTriggers.ts` の `fireFieldEventTriggers`・`notifyHandGained`・`fireNexusDeployed` |
| ステップの開始・終了、バトルに勝ったとき、BP が達したとき | `stepTriggers.ts` の `fireStepTriggers`・`fireBattleWonTriggers`・`fireBpReachedTriggers` |
| 【バースト】の発動条件 | `keywords/burst.ts` の `burstConditionMet` |

## 【バースト】（`server/src/logic/keywords/burst.ts`）

セットは `placeBurst`、発動後の後始末は `finishBurstActivation`、「自分のバーストを発動したとき」の誘発は `fireOwnBurstActivated`。発動条件の走査は `fireBurstOnEvent`（持ち主から見た事象だけ拾う）、【相手の『召喚時』発揮後】の発火は `finishSummonEffect`（2026-09-27 に triggers.ts から移した）。バーストの条件と解決順は BURST.md。

## 召喚時の誘発と効果による無償召喚（`server/src/logic/summon.ts`）

| 変更の種類 | 触るところ | 罠 |
| :-- | :-- | :-- |
| 召喚時の誘発の並び | `fireSummonSequence` | 手札からの通常の召喚の入口は `GameEngine.doSummon`（【烈神速】も GameEngine） |
| 効果による手札・トラッシュからの無償召喚 | `summonFreeFromHandIndex`・`summonFreeFromTrashIndex` | — |

## 直前に動いたカードの記録（`server/src/logic/record.ts`）

「この効果で〜した数だけ」「そのカードが〜のとき」が読む記録。カードを動かすアクションは、**開始時に `currentRecordScope` で枠を控え**、動かし終えたら `recordMoved(state, ids, scope)` で書く。読む側は `lastMovedOf(state)`。枠は `sequence`／`pay` が作り、再開フレームと選択待ちが運ぶ（IF_UNIFY.md §6）。

## アクションのハンドラ（`server/src/logic/actions/`）

新しいアクション type のハンドラは、概念の合うファイルに `const xxxHandler: ActionHandler<"xxx">` を書き、そのファイル末尾の `handlers` に1行足す。
新しいファイルを作ったら `actions/index.ts` の `ACTION_HANDLERS` に `...名前` を足す（書き漏れは `ActionRegistry` の型で検出される）。

| 概念 | ファイル |
| :-- | :-- |
| 相手のコアを取り除く・自分のコアを払う／動かす | `cores.ts` |
| ボイド・トラッシュからコアを置く、コアチャージ | `coreGain.ts` |
| ライフを増やす・減らす | `life.ts` |
| 【転召】のコアの置き先・再開・代わりの支払い | `tensho.ts`（判定の本体は `keywords/tensho.ts`） |

## 画面（`public/src/`。2026-10-16 に main.ts・renderer.ts から `ui/` へ分割）

| 変更の種類 | 触るところ |
| :-- | :-- |
| 描画の入口・全体の再描画 | `renderer.ts` の `render` |
| フィールドのカード1枚（コア・レベル・ボタン） | `ui/fieldCard.ts` の `fieldCardEl`・`coreButtonsEl` |
| 手札 | `ui/hand.ts` の `renderHand` |
| 情報欄・バースト欄・バトル欄 | `ui/infoPanels.ts` |
| 効果のツールチップ | `ui/tooltip.ts` |
| 支払いモードの状態と残りコストの計算 | `ui/paying.ts`（`PayingState`・`payingNeed`） |
| 支払いの入力と送信（自動／手動の切り替え） | `ui/payInput.ts` |
| 手札・スピリットのクリック、召喚・アタック・選択の応答 | `ui/play.ts` |
| デッキの一覧・お知らせ | `ui/lobby.ts` |
| 接続と `init`（イベントの登録） | `main.ts` |

- `ui/` から `main.ts`・`renderer.ts` の `let` を書き換えることはできない（import した変数は代入不可）。書き換えが要るときは持ち主のファイルに `setXxx` を置く（`setCardDb`・`setDeckRecipes`・`suppressEffectTooltip`）

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

