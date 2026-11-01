# BS19 調査メモ：white（調査役）

対象：BS19-034, 035, 036, 037, 038, 039, 040, 041, 042, 043, 044, 073, 074, 088, 089, 090, 106, 107, 108, X04。実装はしていない。
出典：効果文は `data/staging/BS19.json`、手本は `data/cards/*.json` の effects、器の定義は `server/src/types/*.ts`（globalConstraint.ts / effectAction.ts / effectDefTrigger.ts / effectDefContinuous.ts / auraDef.ts / effectCounter.ts / timedContent.ts / fieldEventTriggers.ts）。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）

- 節の数：**32**（バニラ3枚 BS19-034/037/041 は 0 節。連鎖の行 4 節・強化の行 1 節を含む）
- 既存で書ける：**22**
- 新しい部品が要る：**9**（§2 の #1〜#9。連鎖の中身 1 節を含む）
- 連鎖：**4 節**（039/042/044/108。中身は既存 3・新部品 1【042 の「コスト合計12まで」】）
- 強化：**1 節**（038 のみ。白＝「スピリット回復効果」の体数 +1。仕組みはメインループ設計）

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | `aura` type bp に「疲労状態の自分のスピリットのみ」フィルタ（restedOnly）（条件の軸） | auraDef.ts には colorFilter / battlingOnly / blockingOnly / keywordFilter / minCores 等はあるが rested が無い。代替の `bpBuffAll`（effectAction.ts:70）は familyFilter/teamFilter のみで状態絞りができない。 | BS19-035 Lv2 |
| 2 | 「このスピリットのブレイヴ（合体中ブレイヴ）は破壊されない」（制約／条件の軸） | `braveImmuneGrant`（effectDefContinuous.ts:273）は「相手のブレイヴの効果を受けない」耐性で別物。globalConstraint.ts に nexusIndestructible はあるがブレイヴ版が無い。data/cards に「ブレイヴは破壊されない」の前例なし（grep 0 件）。 | BS19-040 【合体時】 |
| 3 | 「シンボルを持たないブレイヴと合体している間」の条件（条件の軸） | `symbolAddGrant`（effectDefContinuous.ts:421）の condition には `ownFieldHasBraveInSpiritState`（BS13-006-e2）などはあるが、合体中のブレイヴのシンボル有無を見る軸が無い。 | BS19-040 【合体時】Lv3 |
| 4 | `summon`（from hand）にコスト合計上限（costBudget）（アクション） | BS10-029-e1（手札のブレイヴを好きなだけ無料召喚・召喚時効果なし）で「好きなだけ」は書けるが、effectAction.ts:156 の summon 定義に costBudget が無い。`moveCards` の pick（BS06-X22-e1）や `destroy` の budget にはコスト合計上限があるのに summon には無い。 | BS19-042 連鎖[緑] |
| 5 | `ownLifeDamageCapPerSourcePerTurn` に発生源フィルタ（シンボル2つ以上の相手スピリット）（条件の軸） | globalConstraint.ts の定義は `max` のみ（source 絞りなし）。手本 BS12-043-e1（step + timedEffect playerRule で相手アタックステップ限定化）の形は使えるが、cap をかける相手スピリットをシンボル数で絞る軸がどの制約にも無い。 | BS19-043 |
| 6 | 「【連鎖】を持つ自分のスピリットの数」カウンタ（カウンタ） | effectCounter.ts の EffectCounter に「指定キーワードを持つ自分のスピリット数」が無い（nearest は targetSameFamilyOwn＝系統）。`return` の countCounter 枠（effectAction.ts:74）は既存だが数える物が無い。【連鎖】自体が新キーワードなので、キーワード追加とセットで必要。 | BS19-044 召喚時 |
| 7 | `opponentHandAdded` に発生源種別フィルタ（スピリット/マジックの効果）（条件の軸） | `opponentEffectSourceTypes` は ownSpiritDestroyed 限定の実装（fieldEventTriggers.ts:78, 255 で eventInfo.destroySourceType を見る）。手本 BS18-066-e2 は excludePhase のみで効果の種別を絞れない。repeatPerCount（枚数分繰り返し）はあるので、枚数分ドロー自体は既存。 | BS19-088 Lv2 |
| 8 | fieldEvent `ownSpiritDestroyed` で破壊された個体をアクション対象に取る（destroyedAsTarget 相当）（条件の軸） | 「破壊されたスピリットを手札に戻す」の手本 BS14-103-e1 は burst 専用の `destroyedAsTarget` + `moveCards onlyEventCard`。fieldEvent ownSpiritDestroyed の発火は selfOverride/targetInstanceId を渡さない（removal.ts:420）ので、ネクサスの継続効果では破壊された個体を指せない。 | BS19-090 Lv2 |
| 9 | `negateLifeDamageFromTarget` に「効果によるライフ減少も無効」の軸（条件の軸） | 手本 BS04-101-e1 は「そのスピリットのアタックでは減らない」のみ。`ownLifeImmuneToSpiritEffects`（BS13-027-e2）は全相手スピリット効果対象で「指定した1体」ではない。アタックと効果の両方を指定個体に縛る器が無い。 | BS19-106 |

## 3. カードごとの表

| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS19-034 リヴァードフィン | （効果の記述なし＝バニラ） | 器なし |
| BS19-035 ジュレヌーク | Lv1･Lv2：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-002-e1） |
| BS19-035 | Lv2『相手のターン』：疲労状態の自分のスピリットすべてをBP+2000 | aura type bp target ownAll amount 2000 + turn opponent（BS01-060-e2）＋**新部品 #1**（restedOnly） |
| BS19-036 近衛機バイキング1号 | 【重装甲：白/青】 | keyword heavyArmor colors [white, blue]（BS18-031-e2） |
| BS19-036 | Lv2･Lv3『相手のアタックステップ』：BP6000以下の相手がアタックしたとき自分のスピリット1体を回復 | fieldEvent anySpiritAttacked subjectSide opponent subjectFilter maxBp 6000（BS13-006-e1）+ refresh count 1（BS18-066-e1） |
| BS19-037 アーマー・フィッシュ | （効果の記述なし＝バニラ） | 器なし |
| BS19-038 近衛機キュリオシティ | Lv1･Lv2：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-002-e1） |
| BS19-038 | Lv1･Lv2【強化】：回復効果の体数 +1 | 強化（白）。メインループ設計 |
| BS19-039 ペガシオーネ | Lv1･Lv2『このスピリットのアタック時』：BP4000以下の相手のスピリット1体を手札に戻す | triggered onAttack + return to hand count 1 filter maxBp 4000（BS11-032-e2 に filter を足す。return+filter の形は BS07-035-e2） |
| BS19-039 | 連鎖（条件 緑×1）：[緑]ボイドからコア1個をこのスピリットに置く | placeCores from void to spirit target self count 1（BS18-025-e2）。連鎖の枠はメインループ |
| BS19-040 十剣聖ヴォル・クーガ | 【合体時】Lv1〜3：このスピリットのブレイヴは破壊されない | **新部品 #2**（手本なし。braveImmuneGrant は別物） |
| BS19-040 | Lv2･Lv3『このスピリットのアタック時』：ターンに1回、[名]以外の自分のスピリット1体を回復 | triggered onAttack oncePerTurn（BS11-032-e2）+ refresh count 1 filter excludeSelf（BS11-079-e1 の refresh + TargetFilter） |
| BS19-040 | 【合体時】Lv3：シンボルを持たないブレイヴと合体中、白シンボル1つ追加 | symbolAddGrant target self color white（BS13-006-e2）＋**新部品 #3**（条件） |
| BS19-041 アザラ・バーグ | （効果の記述なし＝バニラ） | 器なし |
| BS19-042 機甲要塞ソーベック・タートル | Lv1･Lv2『このスピリットの召喚時』：相手のスピリット1体を手札に戻す | triggered onSummon + return to hand count 1（BS07-035-e2／BS06-046-e2） |
| BS19-042 | 連鎖（条件 緑×1）：[緑]手札のブレイヴをコスト合計12まで無料で好きなだけ召喚（召喚時効果なし） | summon from hand bravesOnly repeatWhileChosen skipOnSummon（BS10-029-e1）＋**新部品 #4**（costBudget 12） |
| BS19-043 銀の女神アリアンロッド | Lv1･Lv2『相手のアタックステップ』：シンボル2つ以上の相手スピリット1体からはターンごとに1までしかライフが減らない | kind step attack turn opponent + timedEffect playerRule ownLifeDamageCapPerSourcePerTurn max 1（BS12-043-e1 の形）＋**新部品 #5**（発生源フィルタ） |
| BS19-044 高速機獣オセローダー | Lv1〜3『このスピリットの召喚時』：【連鎖】を持つ自分のスピリット1体につき相手1体を手札に戻す | triggered onSummon + return to hand countCounter（return の countCounter 枠）＋**新部品 #6**（カウンタ） |
| BS19-044 | Lv2･Lv3『このスピリットのブロック時』：このスピリットをBP+4000 | triggered onBlock + timedEffect bp 4000 duration battle target self（BS17-028-e1） |
| BS19-044 | 連鎖（条件 緑×1）：[緑]BP4000以下の相手のスピリットすべてを疲労させる | exhaust all true filter maxBp 4000（SD01-017-e1） |
| BS19-073 銃機トラドール | 【合体時】『合体アタック時』：BP5000以下の相手のスピリット1体を手札に戻す | triggered onAttack whileCombined + return to hand count 1 filter maxBp 5000（BS11-032-e2 + whileCombined は BS10-069-e2） |
| BS19-074 砲獣アークィドリー | 【合体中】『相手のアタックステップ』：ライフが減ったときこのスピリットは回復 | fieldEvent ownLifeDamaged + refresh self（BS06-038-e2／BS10-034-e3）+ phase attack turn opponent + whileCombined（BS12-040-e3） |
| BS19-088 獣の氷窟 | Lv1･Lv2『お互いのアタックステップ』：BP4000以下のアタックではお互いのライフは減らない | globalConstraint noLifeDamageByCost maxBp 4000（BS12-020-e1 は symbolCount 版。maxBp は定義にあり） |
| BS19-088 | Lv2：相手のスピリット/マジックの効果で相手の手札が増えたとき、増えた枚数ドロー | fieldEvent opponentHandAdded + repeatPerCount + draw count 1（BS18-066-e2 + repeatPerCount、draw は BS15-005-e2）＋**新部品 #7**（発生源種別フィルタ） |
| BS19-089 フォートレスキューブ | Lv1･Lv2『お互いのアタックステップ』：自分の白のスピリットが回復したとき、ボイドからコア1個を自分のスピリットに | fieldEvent anySpiritRefreshed subjectSide own subjectFilter color white（BS18-066-e1）+ placeCores from void to spirit count 1（BS18-025-e2／BS06-047-e1） |
| BS19-089 | Lv2『相手のアタックステップ』：ライフが相手のアタックで減ったとき、そのスピリット1体を手札に戻す | fieldEvent ownLifeDamaged（BS06-038-e2）+ return to hand（アタッカーが targetInstanceId として渡る：battleResolve.ts:227） |
| BS19-090 凍てつくつららの逆塔 | Lv1･Lv2『自分のメインステップ』：自分の緑のスピリットが召喚されたとき、ボイドからコア1個を自分の白のスピリットに | fieldEvent ownSpiritSummoned subjectFilter color green（BS05-070-e2 の subjectFilter 形）+ placeCores from void to spirit filter color white（BS18-025-e2 + TargetFilter color） |
| BS19-090 | Lv2：【連鎖】持ちが相手の効果で破壊されたとき、破壊された自分のスピリット1体を手札に戻す | fieldEvent ownSpiritDestroyed byOpponentEffectOnly subjectFilter keyword 連鎖（BS12-023-e3）+ moveCards trash→hand onlyEventCard（BS14-103-e1）＋**新部品 #8**（fieldEvent で破壊された個体を対象に） |
| BS19-106 アイスエイジシールド | フラッシュ：相手1体を指定。このターン、そのアタック/効果でライフは減らない | negateLifeDamageFromTarget（BS04-101-e1）＋**新部品 #9**（効果によるライフ減少も無効） |
| BS19-107 リゲイン | フラッシュ：自分のスピリット1体を回復。または、このターン自分のスピリットすべてをBP+3000 | magic flash + chooseActionMode（BS16-076-e2／P045-e1）modes = refresh count 1（BS11-079-e1）／timedEffect bp 3000 duration turn all true side own（BS16-078-e2／BS10-061-e1） |
| BS19-108 リカバリーラッシュ | フラッシュ：自分の白のスピリットすべてを回復。このターン、この効果で回復したコスト10以下はアタック不可 | sequence refresh all filter color white + timedEffect duration turn target lastTargets filter maxCost 10 content cantAttack（BS11-079-e1 とほぼ同型。filter を uncombined→maxCost 10 に置き換えるだけ） |
| BS19-108 | 連鎖（条件 緑×1）：[緑]相手は、相手のスピリット2体を疲労させる | exhaust count 2 chooserIsTarget（BS06-100-e1） |
| BS19-X04 黄金騎神フィン・マックラン | 【重装甲：赤/紫/白】 | keyword heavyArmor colors [red, purple, white]（BS18-031-e2／BS15-031-e2） |
| BS19-X04 | Lv2･Lv3『このスピリットのアタック時』：このスピリットのシンボルを白のシンボル2つにする | triggered onAttack + timedEffect duration battle content symbolSet color white count 2（timedContent.ts:30、手本 BS16-005-e2） |
| BS19-X04 | Lv3『お互いのアタックステップ』：相手のスピリットが手札に戻ったとき、自分のスピリット1体を回復 | fieldEvent anySpiritReturnedToHand subjectSide opponent + refresh count 1（BS12-040-e3。定義コメントがまさに「相手のスピリットが手札に戻ったとき」用と明記） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

- **BS19-043**「ターンごとにシンボル2つ以上を持つ相手のスピリット**1体から**1までしか減らされない」：個体ごとに1まで（BS15「スピリット1体から1まで」と同じ個体読み）か、シンボル2つ以上持ち全体で合計1までか。また cap が効くのは『相手のアタックステップ』中のみ＝それ以外のタイミングの効果によるライフ減少は無制限と読むが、要確認。
- **BS19-042** 連鎖[緑]「コスト合計12まで…好きなだけ」：合計12を超えない範囲で最大化（超える召喚はできない）と読む。「コストを支払わずに」なので合体先の選択・スピリット状態で出すかは通常どおりでよいか。
- **BS19-044** 召喚時「【連鎖】を持つ」の判定：Q774/Q775（連鎖を含む効果を発揮できるLvにいればシンボル不足でも「持つ」）に従い、絞り込みはLvで見る。実装では静的な effects 定義から判定する形になる。
- **BS19-089** Lv2「相手のスピリットのアタックで減ったとき、そのスピリットを手札に戻す」：実装上、ownLifeDamaged の発火のうちアタッカーが targetInstanceId として渡るのは battleResolve.ts:227 のバトル解決時のみ（battleFlow.ts:336/345 の効果によるライフ減少では渡らない）。「アタックで減った」以外では不発になるはずだが、効果ダメージ時にこの効果が空振りしないか（発火自体するか）は実装時の確認事項。
- **BS19-090** Lv2「破壊された自分のスピリット**1体**を手札に戻す」：破壊された【連鎖】持ちそのもの限定か、同時破壊された自分のスピリットの中から1体選べるか（文面は後者とも読める）。
- **BS19-106**「アタック/効果によって」：指定したスピリットの効果によるライフ減少（ライフクラッシュ等）も含むと読む（文面どおり）。#9 の部品の範囲を決めるときに確定させる。
- **BS19-108**「この効果で回復した、コスト10以下のスピリット」：コストは静的値なので回復時点で確定するが、【強化：白】で回復体数が増えた場合も「この効果で回復した」に含まれる（含めて問題ないはず）。
