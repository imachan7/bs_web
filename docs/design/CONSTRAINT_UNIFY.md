# 禁止・保護の型の統一（2026-11-07 ユーザー決定「まとめたい」）

調査メモ：①② は UNIFY_SURVEY_A、③④⑤ は UNIFY_SURVEY_B（このファイルと同じ PR で docs/design/ に置く）。
方針は ACTION_UNIFY_PLAN と同じ：分かれている理由がルール上の処理の違いかを先に確かめ、旧い型は全部移してから消し、`validate:cards` で書けなくする。移す前後で smoke の ✅ の文言と coverage:check を突き合わせる。

## 順番と結果（2026-11-07 にすべてマージ：#400〜#405）

| # | まとめ先 | まとめる型 | 残す型 |
| :-- | :-- | :-- | :-- |
| 0 | `removeCores` | `coreRemove`（11枚。drawIfEmptied の3枚は sequence＋if lastEmptiedSpirits） | — |
| ① | `coresProtected { side, filter, battle, by, causes, sourceTypes, to }` | coresCantBeRemoved・coresCantBeRemovedByOpponent・coresCantBeRemovedAll・coresImmovableByOpponent・battlingCoresProtected・blockerCoresProtected | coreFloorByCost・noCoreZeroOutsideEffect・coresToOpponentReserveGoToTrash |
| ③ | `lifeGuard { side, attacker, from, max, per, floor }` | noLifeDamageByCost(ForPid)・lifeFloorForPid・ownLifeFloor・lifeDamageMaxForPid・lifeDamagePerSpiritPerTurn・ownLifeDamageCapPerSourcePerTurn・lifeImmuneForPid・ownLifeImmuneToSpiritEffects | ownLifeFloor{costSelfToTrash}・negateLifeDamageFromTarget・cantReduceOpponentLifeWhileSelfRefreshed |
| ② | `noDeckMill { side, by }`（メイン限定はエントリの phase） | noDeckMill・noDeckMillInMain・noDeckMillByOpponent・noDeckMillForPid・noDeckMillByOpponentForPid | millCap |
| ④ | `cantRefresh` | noRefreshByAnyEffect ほか6種 | markNoRefreshTarget・noRefresh・refreshOnlyOneUncombined |
| ⑤ | `cantBounce { by, to, target }` | noBounceByEffect・allSpiritsCantBounce | bounceToDeckTopForPid |

## 0 の結果（coreRemove → removeCores）
- 11枚と smoke 18 part を移し、`coreRemove` の型・処理を消した。データに書くと validate:cards が落とす
- removeCores に[ソウルコア]を含めるかの確認が無かった（旧 coreRemove だけが持っていた。2026-10-05 確定の一律の規則）。removeCores の共通処理に足した。ソウルコアは今は常に無効なので対戦の挙動は変わらない
- IfCond `lastEmptied` は `lastEmptiedSpirits` を読む形にした
- 既知の限界：[ソウルコア]の答え待ちで中断して再入すると、それまでに0個にした体数が lastEmptiedSpirits から落ちる（複数体を取り除く途中で聞いた場合だけ。使うカードは1体対象）

## ①〜⑤ の結果
- ① #401：旧型ごとに止める原因を今の判定から書き出して移した（既定は全部）。バトル中／ブロッカーの保護（BS05-060・BS09-027・BS09-X40）は効果文どおり原因を問わず止める。判定は coreGate の `coreProtectedBy`
- ③ #402：BS13-027 に効果文の期間（相手のアタックステップ）を足した（part830）。判定は shared/rules/lifeGuard.ts。BS11-080・BS22-080 の「アタック、または効果」は lifeGuard を2つ並べる（効果側がアタックに当たらないのは、アタックのときに発生源の種別を渡していないことに頼っている）
- ② #403：判定は `deckMillBlockedByRule`。ネクサスの配置コストと【粉砕】の0枚判定は常時・両陣営のものしか見ない（メイン限定の BS14-085・自分側だけの BS08-064 は見ない。正しいかは未確認）
- ④ #404：止める回復は `by`（step／effect）で明示。判定は shared/rules/cantRefresh.ts
- ⑤ #405：効果の「〜することで」の支払いで戻すときも止まるようにした（これまでは戻らずに後ろの効果だけ発揮していた。part831）。判定は bounceGate.ts
- どの型も、旧型をデータに書くと validate:cards が落とす。手順書の旧型名は「新しい型（旧 〜）」に置き換えた（記録として残す文書 R5_TRIAGE・CORE_UNIFY_REMOVE はそのまま）

## 決まったこと（2026-11-07 ユーザー確認）
- ①：プレイヤーの操作（効果でないコアの移動）まで止める型は、統合後も止める。`causes` の既定は「効果・コスト・プレイヤーの操作のすべて」にし、今「効果だけ」の型にだけ `causes:["effect"]` を書いて移す（既定を効果だけにしない）
- ⑤：BS22-016 プリシラの「戻らない」は効果による戻しだけでよい（効果以外で手札/デッキに戻す操作はプールに無い。「〜することで」の支払いの戻しも効果の解決中なので止まる）
- ②：noDeckMillByOpponent は名前に反して誰の破棄でも止める（10-30 の記録どおり）。挙動は変えず `by:"any"` で移す
- ③：lifeFloorForPid の OR は lifeGuard を2つ並べて書く
- `ForPid` 系は場に残らない発生源（マジック）の入口なので残し、定義を共有して判定を1か所に集める
- ついでに直す：BS13-027-e2 の Lv2『相手のアタックステップ』の期間がデータに無い（効果文との食い違い。④ の PR）
