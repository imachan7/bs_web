# BS16 バッチ3（黄15・青15・緑白の残り6）解釈一覧

調査役メモ。実装はしていない。BS16_PLAN.md §2 の確定事項・Q&A、CONJUNCTION.md の早見表を前提にする。

## 確定した新しい部品（2026-09-28 メインループが見直して確定。実装はこの名前を使う）

調査役の表（下）の「新規」を見直した。**050/066 のエンドステップの「〜することで」は既存の `kind:"step"`＋`pay`（前例 BS13-019）、
069 Lv2 は既存の `fieldEvent ownSpiritDestroyed`＋`returnToDeckTop`（前例 BS14-104）で書けるので新設しない。**

| 組 | 部品 | 種類 | 形 | 使うカード | 組み合わせで書けない理由 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| A | `draw.countMax` | 軸 | `draw{countCounter, countMax?: number}`（`mill.countMax` と同じ意味） | 040 | draw に上限の軸が無い |
| A | `reveal.pickCount` に数 | 軸 | `pickCount?: 1 \| "all" \| 0 \| number`（N＝N枚まで。1枚ずつ選び、途中でやめられる） | 044 | 「2枚まで」が書けない |
| A | `TargetFilter.familyExclude` | 絞り込みの軸 | `familyExclude?: FamilyFilter`（並べた系統をどれも持たない。付与系統も見る） | 052 | 「系統◯を持たない」の軸が無い |
| B | FieldEvent `opponentLifeDamaged` | 条件の軸（出来事） | 相手のライフが減ったとき（原因を問わない）。`ownLifeDamaged` の鏡 | 042 | アタック限定の `ownSpiritDealtLife` しか無い |
| B | FieldEvent `opponentBurstSet` | 条件の軸（出来事） | 相手がバーストをセットしたとき（効果によるセットも含む） | 050 | 相手のセットを見る出来事が無い |
| B | FieldEvent `ownDeckMilled` ＋ `toDeck.fromEvent` | 出来事＋軸 | 自分のデッキが破棄されたとき（fieldEvent に `milledAtLeast`・`byOpponentSpiritEffect`）。出来事が破棄したカードを渡し、`toDeck{from trash, fromEvent: true, upTo, count 5, position top}` はその中からだけ選ぶ | 039 | 自分のデッキが破棄された出来事と、その回に破棄されたカードだけを選ぶ軸が無い |
| C | `coreFloorByCost` に `byOpponentOnly` | 軸 | 「相手によって」減るときだけ床を張る | 039 | 既存は誰の減少でも床を張る |
| C | `nexusEffectsDisabled` に `levels` | 軸 | 指定Lvのネクサスだけ効果を止める（今のLvで判定） | 041 | Lvで絞れない |
| C | `battleLock` に `"magic"` | 内容の値 | このバトルの間、マジックを使用できない | X06 | `"flash"`・`"burst"` しか無い |
| D | タイミング `atTurnEnd` | タイミング | `{ type: "atTurnEnd"; action }`：このターン終了時に action を解決する（記録して、ターン終了処理で持ち主の順に解決） | 068 | 「このターン終了時に〜する」を書く器が無い |
| D | `fireEffect` の対象に「発動したバーストのマジック」 | 軸 | 発動したバーストがマジックなら、そのメイン／フラッシュのどちらか1つを無償で発揮（マジックの「使用」ではない＝Q22399） | 070 | 発動中のバーストのカードを発揮元にできない |
| D | 手札とトラッシュからの無償召喚・名前の除外 | 軸 | `summonFromHandFree` に `alsoFrom?: "trash"`（合計の枚数を共有）と `nameExcludes?: string` | X05 | 2つの場所から合計N枚、と「◯以外」が書けない |

**測定**（REFACTOR_PLAN §0・§2.3）：実装役ごとに呼び出し数・grep＋sed の数・最初の Edit が何回目か（メインループが transcript を集計）。
データ役のあとに「新しい部品なしで JSON だけで書けた効果節の割合」を数える。

## 凡例
判定：既存＝既存の kind／type／TargetFilter 軸だけで書ける。新規＝足りない部品が要る。

---

## BS16-022 マー・バチョウ（green spirit c3）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| フラッシュ【神速】＋「召喚コストとコアをリザーブから使用できる」 | 既存 | `kind:"keyword" keyword:"soku"` 1件（本文はkeywordの定義の再掲） | ― | BS01-064 |
| Lv1･Lv2『召喚時』『お互いのアタックステップ』で召喚されたとき、ボイドからコア1個をリザーブに置く | 既存（軸の新規組み合わせ） | `kind:"fieldEvent" event:"ownSpiritSummoned" phase:"attack" eventTargetIsSelf:true action:{placeCores from:"void" to:"reserve" count:1}` | ― （`eventTargetIsSelf`・`phase` はどちらも既存フィールドだが、`eventTargetIsSelf` の doc コメントは `ownSpiritExhausted`/`anySpiritExhausted` 限定と書かれている。ハンドラ（triggers.ts:1442）はイベント種別を見ずに selfOverride と比較するだけなので技術的には動くはずだが、コメントの想定外の使い方になる） | eventTargetIsSelf: BS02-042／phase+ownSpiritSummoned: BS05-062 |

## BS16-026 クマタカンウ（green spirit c6）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| フラッシュ【神速】＋reprint | 既存 | `kind:"keyword" keyword:"soku"` | ― | BS01-064 |
| Lv2『バトル時』BP比較で相手だけ破壊したとき、【神速】/【烈神速】持ちを手札に戻すことで、ボイドからコア2個をリザーブに置く | 既存 | `kind:"triggered" trigger:"onBattleWin" action:{pay cost:{returnToHand side:"own" count:1 filter:{keywords:["soku","resshinsoku"]}} then:{placeCores from:"void" to:"reserve" count:2}}` | ― | pay+returnToHand(soku): BS13-019／placeCores void→reserve: BS05-020 |

## BS16-037 ブレーペンタンの音楽隊
バニラ。

## BS16-038 クラブソーサラー・スケアクロウ（yellow c3）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1･Lv2 相手によって系統「四道」が破壊されたとき、デッキから1枚ドロー | 既存 | `kind:"fieldEvent" event:"ownSpiritDestroyed" familyFilter:"四道" byOpponentOnly:true action:{draw count:1}` | ― | familyFilter+draw: BS10-084／byOpponentOnly: BS15-027 |
| Lv2【光芒】『アタック時』（バトル終了時、このバトルで使ったマジックすべて手札に戻る＝光芒の定義そのもの） | 既存 | `kind:"keyword" keyword:"kobo"` 1件 | ― | 光芒持ちカード一般 |

## BS16-039 グリムの天使ラプンツェル（yellow c3）※確定済み（Q3708/Q3709、PLAN§2.2）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1･Lv2 自分のスピリット全てのコアは相手によってLv1コストより減らない | 既存だが軸不足の疑い | `kind:"coreFloorByCost" ownOnly:true` | **確認事項参照**：既存 `coreFloorByCost` に「相手の効果限定」の軸が無い（既存は誰の減少でも一律で床を張る） | BS09-059／BS12-065 |
| Lv2 相手のスピリットの効果で自分のデッキが1度に10枚以上破棄されたとき、その回で破棄された中の5枚までを好きな順でデッキの上に戻す | **新規** | `kind:"fieldEvent" event:"ownDeckMilled" byOpponentSpiritEffectOnly:true minEventCount:10 action:{toDeck from:"trash" position:"top" count:5 upTo:true pick:{fromThisMill:true}}` のような形 | **足りない部品**：FieldEvent に「自分のデッキが破棄されたとき」（`opponentDeckMilled` の鏡）が無い。現状は相手のデッキ視点の `opponentDeckMilled` しかない。差し込み先：`server/src/type.ts` の `FieldEvent` union（244行付近）、発火は `server/src/logic/zones/mill.ts` の `millDeck`。加えて「その回の破棄だけ」を対象にする `toDeck` の pick 軸も要る（順番選択の器自体は BS15-082 で前例あり） | 順番選択: BS15-082／milledバッチの内部保持: `zones/mill.ts` の `onMilledFromDeck` 系フック |

## BS16-040 ハートナイト・ティン（yellow c4）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv2『破壊時』系統「四道」1体につきドロー（上限4枚） | ほぼ既存 | `kind:"triggered" trigger:"onDestroy" action:{draw countCounter:{ownFamily:"四道"} countMax:4}` | **足りない部品**：`draw` action に上限軸が無い（`mill` にはある `countMax` を `draw` にも足す） | countCounter+draw: SD02-004／countMaxの前例(mill): 各種【粉砕】カード |

## BS16-041 グリムの天使赤ずきん（yellow c4）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-3『お互いのアタックステップ』Lv1の相手のネクサスすべての効果は発揮されない | **新規** | `kind:"constraint" phaseTurn:{phase:"attack",turn:"both"} constraint:{type:"levelNexusEffectsDisabled", level:[1], side:"opponent"}` のような形 | **足りない部品**：ConstraintDef に「対象ネクサスの**現在Lv**で絞る」軸が無い。既存の `restedNexusEffectsDisabled`（疲労で絞る）と同じ発想で、Lv版を足す。差し込み先：`server/src/type.ts` の ConstraintDef union（524行付近） | 疲労版: BS10-074／`kind:"constraint"`のphaseTurn: 既存一般 |

## BS16-042 グリムの天使シンデレラ（yellow c5）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| 【バースト：ライフ減少後】系統「天霊」がいるとき、このカードを召喚する | 既存 | `kind:"burst" event:"ownLifeDamaged" condition:{ownFamilyCountAtLeast:{family:"天霊",count:1}} action:summon` | ― | 一般的なバースト召喚パターン |
| Lv2-3『アタックステップ』相手のライフが減ったとき、トラッシュのマジック1枚を手札に戻す | 既存（要確認） | `kind:"fieldEvent" event:"ownSpiritDealtLife" phase:"attack" turn:"own" action:{recoverMagicFromTrash count:1}` | ― （**確認事項**：`ownSpiritDealtLife`はアタックによるライフ減少限定。カード文面はアタック以外の減少も含みうるか） | ownSpiritDealtLife: 既存イベント一般 |
| Lv3『アタック時』バースト1つ破棄することで、このバトルの間ブロックされない | 既存 | `kind:"triggered" trigger:"onAttack" action:{pay cost:{discardBurst count:1} then:{timedEffect content:[{type:"unblockable"}] duration:"battle" target:"self"}}` | ― | 光芒系のバトル中不可視化と同型の pay+timedEffect |

## BS16-043 スペードビースト・レオ
バニラ。

## BS16-044 ダイヤプリンセス・ドロシー（yellow c6）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-3『召喚時』デッキ上から6枚オープン。中の系統「四道」2枚まで無償召喚（それらの召喚時は発揮されない）。残りは破棄 | **新規（1軸）** | `kind:"triggered" trigger:"onSummon" action:{reveal from:"ownDeck" count:6 pick:{family:"四道"} pickCount:2 dest:"summon" noSummonEffects:true}`（残りは reveal の破棄で自動処理） | **足りない部品**：`reveal` の `pickCount` が `1 \| "all" \| 0` しか無く「2枚まで」が書けない。`pickCount: number` を受けられるように一般化する。差し込み先：`server/src/types/effectAction.ts` の `reveal` 定義 | 1枚版: 各種「オープンしてその中の1枚を無償召喚」カード |
| Lv2-3『バースト発動後』デッキから1枚ドロー | 既存 | `kind:"fieldEvent" event:"ownBurstActivated" action:{draw count:1}` | ― | 既存のバースト発動後ドロー一般 |

## BS16-045 オリンピアの天使長オフィエル（yellow c8）※確定済み（PLAN§2.2 Q3739系列）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-3『召喚時』バースト1つ破棄することで、ライフが5になるようにボイドからコアを置く | 既存 | `pay{cost:{discardBurst count:1} then:{placeCores to:"life" untilCount:5}}` 系 | ― | 「ライフが◯になるように」既存器（PLAN§3前例あり） |
| Lv3 カード名に「オリンピア」を含む自分のスピリット全てに"バトル時、相手を全てLv1として扱う"を付与 | 既存 | `kind:"effectGrant"` で `nameContains:"オリンピア"` に triggered on BattleStart 系の効果文字列を付与 | ― | effectGrant一般 |

## BS16-046 サケビバード
バニラ。

## BS16-047 警備兵パグ（blue c2）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv2-3 自分のネクサスが破壊されたとき、このスピリットのコア1個をトラッシュに置くことで、そのネクサスを同じ状態でフィールドに残す | 既存（ほぼそのまま） | `kind:"fieldEvent" event:"ownNexusDestroyed" action:{pay cost:{selfCoresToTrash:1} then:{reviveLastDestroyedNexus}}` | ― （PLAN§3では「前例なし」に分類されているが、`reviveLastDestroyedNexus` は既存 type で BS05-047 の効果文がほぼ一字一句一致する。**確認事項**にPLANとの食い違いとして記載） | BS05-047（コスト・効果文とも同型） |

## BS16-048 グガランナー（blue c3）
Lv2『アタック時』コスト3以下の相手1体を破壊。既存・自明（`triggered onAttack` + `destroy filter cost.max:3`）。

## BS16-049 フンババー（blue c3）
Lv1-2『アタック時』相手の手札1枚につき、このスピリットをBP+1000。既存（`timedEffect bp target:"self" amountCounter:"opponentHand"`、EffectCounter `opponentHand` 既存）。

## BS16-050 ガイメイル・ヒドラ（blue c4）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-2『相手のメインステップ』相手がバーストをセットしたとき、トラッシュのネクサス1枚を無償配置できる | **新規** | `kind:"fieldEvent" event:"opponentBurstSet" phase:"main" turn:"opponent" action:{deployNexus from:"trash" ...}` | **足りない部品**：FieldEvent に「相手がバーストをセットしたとき」が無い（`ownBurstSet`＝自分視点しかない）。差し込み先：`server/src/type.ts` FieldEvent union（264行付近）、発火は `setBurst`/`setBurstFromHand` | ネクサス無償配置自体は071/060などと同型 |
| Lv2『自分のエンドステップ』自分のネクサス1つを破壊することで、ボイドからコア1個をリザーブに置く | **新規** | `kind:"activated" timing:"end" phaseTurn:{phase:"end",turn:"own"} cost:{destroyOwnNexus:true} action:{placeCores from:"void" to:"reserve" count:1}` | **足りない部品**：`kind:"activated"` の `timing` が `flashBattle\|flash\|main` までで「自分のエンドステップ中に起動できる」が無い。また `cost` の選択肢に「自分のネクサス1つを破壊する」が無い（現状は reserve/exhaust/discard系のみ）。差し込み先：`server/src/types/effectDef.ts` の `kind:"activated"` 定義（616行付近） | timing="main"の活性化能力: 既存一般 |

## BS16-051 シュドーメル（blue c5）
Lv1-2『召喚時』デッキ上から4枚オープン、中のネクサス1枚を手札に加え、残りは破棄。既存（`reveal`+`revealApplyOne dest:"hand"`、cardType絞り込み。既存パターン多数）。

## BS16-052 エンキドゥ・ゴレム（blue c5）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-2【強襲：1】『アタック時』ターンに1回、ネクサス1つ疲労で回復できる | 既存 | `kind:"keyword" keyword:"kyoshu" count:1` ＋ `kind:"triggered" trigger:"onAttack" action:{refreshSelfByExhaustNexus}` | ― | BS10-076／BS14-066 ほか多数 |
| Lv2『アタック時』BP比較で相手だけ破壊したとき、系統「覇皇」/「雄将」を持たない相手1体を破壊する | **新規（1軸）** | `kind:"triggered" trigger:"onBattleWin" action:{destroy count:1 filter:{familyExclude:["覇皇","雄将"]}}` | **足りない部品**：`TargetFilter` に系統除外の軸が無い（似た概念は `summonExhausted.familyExclude` と `unblockableBy.familyFilterAbsent` に個別実装済みだが、汎用 `TargetFilter` には無い）。`destroy` 等どのアクションからも使えるよう一般化する。差し込み先：`server/src/type.ts` の `TargetFilter` interface | 概念の前例：BS14-055（`familyFilterAbsent`）、SD02-013（`familyExclude`） |

## BS16-053 イルルヤンカッシュ
バニラ。

## BS16-054 古の獣王ギルガメシュ（blue c7）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| 【バースト：ライフ減少後】ライフ3以下でこのカードを召喚 | 既存 | `kind:"burst" event:"ownLifeDamaged" condition:{ownLifeAtMost:3}`（triggered.conditionの`ownLifeAtMost`をburstにも） | ― | 既存の`ownLifeAtMost`条件一般 |
| Lv1-3『召喚時』系統「覇皇」の相手1体を破壊 | 既存 | 自明 | ― | ― |
| Lv2-3『アタックステップ』系統「覇皇」/「雄将」の自分がアタックしたとき、相手はリザーブのコア2個をトラッシュに置かないとブロックできない（PLAN§2.4確定：装甲でも払う） | 既存（型は宣言済み・未使用） | `kind:"fieldEvent" event:"anySpiritAttacked" ownOnly:true familyFilter:["覇皇","雄将"] action:{grantConstraint 相手へ blockCost:{cost:"reserveCoreToTrash",count:2} thisBattle}` | ― （`blockCost`の`"reserveCoreToTrash"`はtypeに既にあるが使用カードが現状ゼロ） | blockCost自体: BS13-047（cost違い） |

## BS16-059 カイメイジュー（brave yellow c5）※確定済み（Q20182）
合体条件c5以上【合体時】『合体アタック時』相手1体を指定、このバトルの間ブロックできない。既存（指定＋timedEffect unblockable、対象保持は既存の「指定したスピリット」の印）。

## BS16-060 テクノヒュード（brave blue c7）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1『召喚時』デッキ上から5枚破棄、その後トラッシュのネクサス1枚を無償配置できる | 既存 | `sequence[{mill count:5 side:"own"},{deployNexus from:"trash" optional:true}]` | ― | ネクサス無償配置は071/050と同型 |
| 合体条件覇皇/雄将【合体時】『合体アタック時』自分のネクサス1つを破壊することで、相手のデッキを、破壊したネクサスのコストと同じ枚数破棄する | 既存 | `pay{cost:{destroyNexus side:"own" count:1} then:{mill countCounter:"lastCost"}}` | ― | `lastCost`カウンタは既存軸 |

## BS16-066 浮遊関（nexus green c5）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-2『配置時』手札から配置したとき、相手2体を疲労 | 既存 | `fieldEvent event:"ownNexusDeployed" fromHandOnly:true action:{exhaust count:2}` | ― | 一般 |
| Lv2『エンドステップ』【神速】持ちを手札に戻すことで、ボイドからコア1個をリザーブに置く | 既存（050と同型） | 050と同じ `kind:"activated" timing:"end"` の新設が必要 | 050と共通の部品（`timing:"end"`） | 050参照 |

## BS16-068 イ・ケダヤンの階段山脈（nexus white c5）※PLAN§2.4で仕様確定済み

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-2『配置時』手札から配置したとき、このターン終了時、自分のスピリット全てを回復させる | **新規** | 一案：`fieldEvent event:"ownNexusDeployed" fromHandOnly:true action:{scheduleAtEndOfTurn:{refreshAllOwn}}` | **足りない部品**：「いま起きたイベントを条件に、後のステップで1回だけ実行する」遅延実行の組み合わせ方が無い（`timedEffect`は期間中ずっと効く継続、`step`kindは毎ターン継続。単発の予約が無い） | 予約に近い既存: `trashReturnAtEndStep`（ただしこれは「トラッシュにある間ずっと」の継続で単発予約ではない） |
| Lv2『メインステップ』スピリット/ブレイヴ召喚時、このネクサスのシンボルを白3つにする | 既存（PLAN確定） | `symbolFix summonReductionOnly` を流用 | ― | PLAN§4.2 |

## BS16-069 セブンブリッジ（nexus yellow c3）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-2『ドローステップ開始時』黄1枚破棄でドロー+1 | 既存（PLAN§3で062が前例と明記） | 062と同型 | ― | BS16-062（先行実装済み） |
| Lv2 系統「四道」が破壊されたとき、その破壊された1体をデッキの上に戻せる | **新規（1軸）** | `fieldEvent event:"ownSpiritDestroyed" familyFilter:"四道" optional:true action:{toDeck from:"trash" position:"top" count:1 pick:{thisDestroyedInstance:true}}` | **足りない部品**：破壊された「その個体」をトラッシュから名指しで戻す軸が無い（`toDeck`のpickはcardId/系統等の属性一致のみで、同名重複時に別カードを戻す誤りうる） | 属性一致でのtoDeck: BS15-082 |

## BS16-070 創造の原典（nexus yellow c5）※新kindはPLAN§3で予告済み

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-2『配置時』手札から配置したとき、トラッシュの黄マジック1枚を手札に戻す | 既存 | `fieldEvent ownNexusDeployed fromHandOnly action:{recoverMagicFromTrash colorFilter:"yellow" count:1}` | ― | 一般 |
| Lv2 自分のバースト発動時、そのバーストがマジックなら、コストを支払わずにメイン/フラッシュ効果を発揮できる | **新規** | `kind:"magicFreeGrant"`系の新設、または`fieldEvent event:"ownBurstActivated" condition:{burstCardType:"magic"} action:{magicFreeUseFromHandOrTegamoto}`寄りの専用kind | **足りない部品**：「発動したバーストがマジックだったら、そのマジックのメイン/フラッシュ効果を無償発揮できる」の器が無い。PLAN§2.2/§2.4で解決順は確定済み（バースト解決後に無償発揮、マジックの「使用」にはカウントしない） | 無償発揮の概念: `magicFreeUseFromHandOrTegamoto`（別文脈） |

## BS16-071 海の主を祭る島（nexus blue c4）
Lv1-2『破壊時』トラッシュのネクサス1枚を無償配置できる／Lv2『お互いのアタックステップ』系統「海首」のLvを1つ上として扱う。どちらも既存（`deployNexus from:"trash"`一般、`levelAs`一般）。

## BS16-072 二つの川に挟まれた王国（nexus blue c5）※PLAN§3で072自体が「ネクサス/マジックで回復しない」の前例カードとして既出
Lv1-2『配置時』ネクサス1つ指定→同コストの相手1体を破壊（`declare`＋`sameCostAsSelf`系、既存）。Lv2『お互いのアタックステップ』ネクサス/マジックの効果で回復しない（既存、PLAN§3前例あり）。

## BS16-077 タフネスリカバリー（magic green c3）
フラッシュ：BP+2000、その後、対象がBP10000以上なら回復。既存（`sequence[bpBuff, if{cond:{targetBpAtLeast:10000} then:refreshOne target:"same"}]`、`IfCond`に`targetBpAtLeast`が既存で確認済み）。

## BS16-078 翔烈降臨（magic green c4）※PLAN§2.3で明記：BS14バーストマジックの器
【バースト：ライフ減少後】ライフ2以下で手札の緑1枚を召喚、その後コストでフラッシュ発揮。フラッシュ：このターン自分の全スピリットBP+2000。既存（burstAltEvent系＋バーストマジックのthenPay。081-084と同型）。

## BS16-081 マジック・オブ・オズ（magic yellow c4）
メイン：手札全部破棄でデッキから3枚ドロー。フラッシュ：スピリット1体BP+3000。既存（`pay{cost:{discardHandAll:true} then:{draw count:3}}`、`discardHandAll`既存type）。

## BS16-082 マギアゲフリュスター（magic yellow c6）※PLAN§2.4で確定
バースト：系統指定→回復。その後コストでフラッシュ。フラッシュ：このターン、バトル解決はBPでなくLv比較、同値ならお互い破壊。既存（`declare`＋`compareBy`＋`mutualDestroyChoice`、PLAN確定済み）。

## BS16-083 クラッシュ・ザ・バビロン（magic blue c4）※PLAN§2.1 #5で確定
バースト：コスト合計まで相手を好きなだけ破壊（実際は1体、複数破壊時は発動者が選択）。その後コストでフラッシュ。フラッシュ：このターン系統「覇皇」/「雄将」自分全てBP+4000。既存（batch0で用意された`eventInfo.costs`基盤＋既存の1体選択パターン、BS15-084前例）。

## BS16-084 エグゾーステッドガード（magic blue c5）
フラッシュ：このターン、シンボル2つ以上の自分の全スピリットは疲労状態でブロックできる。既存（`timedEffect content:{type:"canBlockWhileRested"} filter:{minSymbols:2} side:"own" all:true`）。

## BS16-X05 アルカナマスター・オズ（yellow c7）※PLAN§2.4のQ&Aで一部確定（1体につき＝自身も数える 等）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-3『召喚時』系統「四道」が6体以上いるとき、相手の全スピリットを好きな順でデッキの上に戻す | 既存 | `triggered onSummon condition:{ownFamilyCountAtLeast:{family:"四道",count:6}} action:{returnToDeckTop all:true anySide:false side:"opponent" chooserIsTarget/order}` | ― | 一般 |
| Lv2-3 相手によって破壊されたとき、手札/トラッシュの[アルカナマスター・オズ]以外の黄スピリット3枚まで無償召喚（それらの召喚時効果は発揮されない） | **新規（1〜2軸）** | `triggered onDestroy condition:{selfDestroyedByOpponent:true} action:{summonFromHandOrTrashFree colorFilter:"yellow" nameExcludesSelf:true count:3 upTo noSummonEffects:true}` | **足りない部品**：①`summonFromHandFree`/`summonFromTrashFree`が別々の型で「手札とトラッシュの両方から合計N枚まで」を選べる形が無い、②カード名を「自身以外」で除外する軸（`nameExcludes`）が無い（現状`nameIncludes`は包含のみ） | 手札からの無償召喚: `summonFromHandFree`／トラッシュから: `summonFromTrashFree`／`noSummonEffects`軸自体は既存 |

## BS16-X06 霊峰魔龍ヤマタノヒドラ（blue c8）

| 節 | 判定 | 書き方 | 新しい部品 | 前例 |
| :-- | :-- | :-- | :-- | :-- |
| Lv1-3【強襲：8】『アタック時』ターンに8回までネクサス1つ疲労で回復できる | 既存 | `keyword kyoshu count:8` ＋ `triggered onAttack action:{refreshSelfByExhaustNexus}` | ― | BS10-076ほか（052と同型、countの値違いだけ） |
| Lv2-3『アタック時』バトル終了時、トラッシュのネクサス1枚を無償配置できる | 既存 | `deployNexus from:"trash"` を`onBattleEnd`跨ぎで発火 | ― | 060/071と同型 |
| Lv3『アタック時』相手はマジックを使用できない | **新規（1軸）** | `timedEffect content:{type:"battleLock", lock:"magic"} duration:"battle" side:"opponent"` | **足りない部品**：`battleLock`の`lock`が`"flash"\|"burst"`のみで、メイン含む「マジックを一切使えない」を表す`"magic"`が無い | `battleLock`自体: 既存（lock列挙の拡張のみ） |

---

## 確認事項

私はこう読みました → 確認したい点、の順。BS16_PLAN.md §2 で既に確定しているものはそのまま引用し、新規のものだけ質問にする。

1. **039 Lv1-2「コアはLv1コストより少なくならない」の主体限定**：既存 `coreFloorByCost` は誰の効果によるコア減少でも一律で床を張るが、039の原文は「相手によって」なので自分の効果には効かない差分がある。→ **私はこう読みました**：既存の`coreFloorByCost`をそのまま流用し「誰の減少でも床を張る」簡略化にする（自分で自分のコアをLv1未満に減らす効果を持つ黄スピリットが今のところ無いため実害が薄い）。これでよいか、それとも`byOpponentOnly`軸を新設して原文どおりにするか。
2. **042 Lv2-3「相手のライフが減ったとき」の範囲**：既存イベント`ownSpiritDealtLife`は「アタックによって」ライフを減らしたときに限定される。→ **私はこう読みました**：このカードの効果はどれも直接ライフを削らないため実質アタックによる減少しか起こらず、`ownSpiritDealtLife`で問題ない。これでよいか。
3. **047 警備兵パグ**：PLAN§3では「前例なし（新設）」に分類されているが、`reviveLastDestroyedNexus`（BS05-047と一字一句近い効果文）が既存 type として実在し、そのまま流用できそうに見える。→ **私はこう読みました**：PLANの新規リストは実装前の見立てで、実際は既存で足りる。既存流用でよいか、それとも見落としている差分（例えば「同じ状態で」の解釈がBS05-047と違う）があるか。
4. **022 マー・バチョウ**：`eventTargetIsSelf`をコメント上の想定外イベント（`ownSpiritSummoned`）で使うことになる。ハンドラのコード上は動くはずだが、コメントの更新（対象イベントの追記）が必要になる。→ **私はこう読みました**：技術的に問題なければそのまま使い、コメントだけ更新する。これでよいか。
5. **X05 の「手札/トラッシュ両方から合計3枚まで」**：`summonFromHandFree`と`summonFromTrashFree`は別ゾーン専用で、合計本数を共有する器が無い。→ **私はこう読みました**：新しい複合アクション（または`source:"handOrTrash"`軸の追加）が要る。器の形（1つの新type vs 既存2つを`choose`で束ねて合計本数だけ共有カウンタで縛る）はどちらがよいか判断を仰ぎたい。
