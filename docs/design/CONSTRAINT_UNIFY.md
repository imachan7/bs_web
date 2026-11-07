# 禁止・保護の型の統一（2026-11-07 ユーザー決定「まとめたい」）

調査メモ：①② は UNIFY_SURVEY_A、③④⑤ は UNIFY_SURVEY_B（このファイルと同じ PR で docs/design/ に置く）。
方針は ACTION_UNIFY_PLAN と同じ：分かれている理由がルール上の処理の違いかを先に確かめ、旧い型は全部移してから消し、`validate:cards` で書けなくする。移す前後で smoke の ✅ の文言と coverage:check を突き合わせる。

## 順番（1つずつ PR。BS22 #399 のマージ後に main から）

| # | まとめ先 | まとめる型 | 残す型 |
| :-- | :-- | :-- | :-- |
| 0 | `removeCores` | `coreRemove`（11枚。drawIfEmptied の3枚は sequence＋if lastEmptiedSpirits） | — |
| ① | `coresProtected { side, filter, battle, by, causes, sourceTypes, to }` | coresCantBeRemoved・coresCantBeRemovedByOpponent・coresCantBeRemovedAll・coresImmovableByOpponent・battlingCoresProtected・blockerCoresProtected | coreFloorByCost・noCoreZeroOutsideEffect・coresToOpponentReserveGoToTrash |
| ③ | `lifeGuard { side, attacker, from, max, per, floor }` | noLifeDamageByCost(ForPid)・lifeFloorForPid・ownLifeFloor・lifeDamageMaxForPid・lifeDamagePerSpiritPerTurn・ownLifeDamageCapPerSourcePerTurn・lifeImmuneForPid・ownLifeImmuneToSpiritEffects | ownLifeFloor{costSelfToTrash}・negateLifeDamageFromTarget・cantReduceOpponentLifeWhileSelfRefreshed |
| ② | `noDeckMill { side, by }`（メイン限定はエントリの phase） | noDeckMill・noDeckMillInMain・noDeckMillByOpponent・noDeckMillForPid・noDeckMillByOpponentForPid | millCap |
| ④ | `cantRefresh` | noRefreshByAnyEffect ほか6種 | markNoRefreshTarget・noRefresh・refreshOnlyOneUncombined |
| ⑤ | `cantBounce { by, to, target }` | noBounceByEffect・allSpiritsCantBounce | bounceToDeckTopForPid |

## 決まったこと（2026-11-07 ユーザー確認）
- ①：プレイヤーの操作（効果でないコアの移動）まで止める型は、統合後も止める。`causes` の既定は「効果・コスト・プレイヤーの操作のすべて」にし、今「効果だけ」の型にだけ `causes:["effect"]` を書いて移す（既定を効果だけにしない）
- ⑤：BS22-016 プリシラの「戻らない」は効果による戻しだけでよい（効果以外で手札/デッキに戻す操作はプールに無い。「〜することで」の支払いの戻しも効果の解決中なので止まる）
- ②：noDeckMillByOpponent は名前に反して誰の破棄でも止める（10-30 の記録どおり）。挙動は変えず `by:"any"` で移す
- ③：lifeFloorForPid の OR は lifeGuard を2つ並べて書く
- `ForPid` 系は場に残らない発生源（マジック）の入口なので残し、定義を共有して判定を1か所に集める
- ついでに直す：BS13-027-e2 の Lv2『相手のアタックステップ』の期間がデータに無い（効果文との食い違い。④ の PR）
