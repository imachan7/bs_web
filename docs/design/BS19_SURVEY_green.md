# BS19 調査メモ：green（調査役）
対象：BS19-023, 024, 025, 026, 027, 028, 029, 030, 031, 032, 033, 071, 072, 085, 086, 087, 103, 104, 105, X03, X07。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**37**（効果文なし 3 枚：023・026・031 は 0 節）
- 既存の器で書ける：**27**
- 新しい部品が要る：**10**（内訳：連鎖の行 5・強化の行 1・キーワード値を要する節 3・エメラルドフィールドのメイン節 1）
  - 連鎖の節：**5**（024・025・032・105・X03。行の中身はすべて既存の器で書ける。連鎖を包む器そのものはメインループ設計の新部品）
  - 強化の節：**1**（029-Lv2。強化の器そのものはメインループ設計の新部品）
- 新しい部品の候補は 7 件（§2。うち 2 件はメインルール設計対象の【連鎖】【強化】そのもの）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | 連鎖の器（種別：器／条件の軸「自分のシンボルの色×個数」）※メインループ設計対象 | 連鎖元の発揮タイミングに**続けて**（連鎖元と一体で）発揮する条件付き節の器が無い。kind "triggered"/"fieldEvent" は発生源自身のイベント起点で、他効果の解決に追随する軸が無い。`if` の条件軸（effectDefTrigger.ts の condition）にも「自分のシンボルの色×個数」は無い | 024・025・032・105・X03 |
| 2 | 強化（緑）の器（種別：グローバル修正）※メインループ設計対象 | 「自分の『相手への疲労効果』の体数 +1」という効果種別横断の数値修正が書けない。`bofuCountBonus` は【暴風】専用、`magicBuffBonus` はマジックのBP系専用。type "exhaust" の count/countCounter は個々の効果内の数え方で、他の効果の数値を書き換える器ではない | 029 |
| 3 | Keyword 値「rensa」（種別：条件の軸） | filter.keyword / subjectFilter.keyword の器はある（BS04-033-e1 が `keyword:"soku"` で使用）が、Keyword 型（server/src/types/keyword.ts）に「連鎖」の値がまだ無い。「絞り込み：連鎖を持つ」に必要 | 072・087（Lv1） |
| 4 | Keyword 値「kyoka」（種別：条件の軸） | 同上。「絞り込み：強化を持つ」に必要。BS04-033-e1 と同じ器に値を足すだけ | 085（Lv1） |
| 5 | フィールドマジックの器（種別：器／アクション） | kind "magic"（effectDef.ts:39）は発揮後トラッシュへ置かれる一方通行で、フィールドに置き続けて効果を発揮し続ける器が無い。`lendSelfThisTurn`（BS08-067-e1）はそのターン限りの仮想発生源で、「ライフが減るまで残り、効果が無効になったとき破棄」は書けない | 103（メイン） |
| 6 | globalConstraint「効果以外のコア移動でコアを0個にできない」（種別：条件の軸） | coreFloor 系 3 種（coreFloorByCost / coreFloorWhileBlockingKeyword / coreFloorOwnNamedByOpponent）は**すべて「効果によって」の軸**で、床値もコスト・キーワード・カード名限定。手動コア移動・コスト支払いを 0 コアで止める軸が無い | 103（メイン） |
| 7 | globalConstraint「ドローステップ以外で手札を増やせない」（種別：条件の軸） | `noDrawOutsideDrawStep` はドロー限定、`noHandGainByEffect` は「効果による」軸（ドローとバウンスのみ）。タイミング軸で**あらゆる**手札増加（トラッシュ回収・オープン回収を含む）を止める器が無い | 103（メイン） |

※ 087-Lv2（神速召喚をターン1回無料）は既存の組合せ（activated + oncePerTurn + summon from hand + keywordFilter:"soku"、payCost 省略＝無償。手本 BS08-024-e1）で書けると判断し、§2 には入れない。読みの注意は §4-2。

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS19-023 | （効果文なし） | — |
| BS19-024 | フラッシュ【神速】 | keyword soku（BS11-017-e1） |
| | 連鎖（条件 青×1）：コスト2以下の相手のスピリット1体を破壊する | destroy + filter cost max 2（BS14-072-e1。コスト上限違いは BS04-011-e3 も同型） |
| BS19-025 | Lv1-3『アタック時』：自分のスピリットのコア3個までを自分のリザーブに置くことができる | removeCores side own / to reserve / count "any" + anyMax 3 + optional（BS02-024-e1 の「2個まで」型） |
| | 連鎖（条件 青×1）：このスピリットは最高Lvとして扱う | levelAs target self / treatAs "max"（BS10-078-e1。phase 無しの常時は BS04-087-e2 が前例） |
| BS19-026 | （効果文なし） | — |
| BS19-027 | Lv1-2『アタック時』：ボイドからコア1個をリザーブに | triggered onAttack + placeCores void→reserve（BS01-082-e1） |
| | Lv2『アタック時』：自分のターンの最初のアタックのとき回復 | triggered onAttack + condition firstAttackOfTurn + refresh self（BS12-020-e2） |
| BS19-028 | フラッシュ【神速】 | keyword soku（BS11-017-e1） |
| | Lv1-2『召喚時』：系統「怪虫」の自分のスピリット1体を回復 | triggered onSummon + refresh filter family（BS04-011-e2 の action 型。手元 P008 も同文） |
| BS19-029 | Lv1-2：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-002-e1） |
| | Lv2：強化（緑） | 強化（緑）※§2-2。メインループ設計 |
| BS19-030 | Lv1-3『召喚時』：手札の「華兵」/「爪鳥」スピリット1枚をコストを支払わずに召喚（召喚時効果は発揮されない） | triggered onSummon + summon from hand familyFilter + skipOnSummon（BS17-X06-e1 の familyFilter 軸 + BS02-034-e2 の skipOnSummon） |
| BS19-031 | （効果文なし） | — |
| BS19-032 | Lv1-2『アタック時』：BP比べで相手だけを破壊したとき、相手のライフのコア1個を相手のリザーブに | triggered onBattleWin battleRole attacker + lifeCrush 1（BS01-X03-e2） |
| | 連鎖（条件 青×1）：ターンに1回、自分のネクサス1つを疲労させることでこのスピリットは回復 | triggered onAttack oncePerTurn + pay cost exhaust own nexusOnly + then refresh self（BS07-052-e2 と同型。【強襲】ラベル無しの分は triggered の oncePerTurn（effectDefTrigger.ts:26）で表現） |
| BS19-033 | Lv1-2『アタック時』：相手のスピリット1体を疲労 | triggered onAttack + exhaust count 1（BS17-020-e1） |
| | 【合体時】Lv1-2：「爪鳥」すべてに『バトル時』バースト発動不可を与える | effectGrant target ownAll familyFilter 爪鳥 + granted onBattleStart → timedEffect battleLock burst（BS16-065-e2。nameIncludes 軸を familyFilter 軸に置き換え。effectGrant の def に familyFilter あり） |
| | Lv2『アタック時』：最初のアタックのとき回復 | BS12-020-e2 |
| BS19-071 | Lv1『ブレイヴの召喚時』：相手のスピリット1体を疲労 | triggered onSummon + exhaust count 1（BS17-020-e1 の action） |
| | 【合体時】『合体アタック時』：相手のスピリット1体を疲労 | triggered onAttack whileCombined + exhaust count 1（BS14-072-e1 の骨格の action を exhaust へ） |
| BS19-072 | Lv1『ブレイヴの召喚時』：ボイドからコア1個ずつを【連鎖】を持つ自分のスピリットすべてに | triggered onSummon + placeCores void→spirit target all filter keyword（BS04-033-e1 と同型。keyword 値「rensa」が新規＝§2-3） |
| BS19-085 | Lv1-2『自分のアタックステップ』：自分の緑がアタックしたとき、ボイドからコア1個を【強化】を持つ自分のスピリットに | fieldEvent anySpiritAttacked ownOnly + subjectFilter color green + placeCores void→spirit filter keyword（BS08-060-e1 と同型。keyword 値「kyoka」が新規＝§2-4） |
| | Lv2『相手のアタックステップ』：相手のスピリットのアタックで自分のライフが減ったとき1枚ドロー | fieldEvent ownLifeDamaged + phase attack + turn opponent + draw 1（BS01-107-e1 の draw + BS08-055-e1 のアタック限定の書き方） |
| BS19-086 | Lv1-2『自分のエンドステップ』：自分の緑のスピリットすべてを回復 | kind step step:"end" turn own + refresh all filter color green（BS08-060-e2 / BS01-106-e2。filter を color 軸へ） |
| | Lv2『自分のアタックステップ』：「爪鳥」がアタックしたとき、相手のスピリット1体を疲労 | fieldEvent anySpiritAttacked ownOnly + subjectFilter family 爪鳥 + exhaust count 1（BS08-067-e2 の骨格 + BS17-020-e1 の action） |
| BS19-087 | Lv1-2『自分のアタックステップ』：【連鎖】を持つ自分のスピリットのアタックでライフが減ったとき、ボイドからコア1個をリザーブに | fieldEvent ownSpiritDealtLife + phase attack turn own + subjectFilter keyword rensa + placeCores void→reserve（BS06-X22-e2 の subjectFilter keyword 型 + BS02-034-e1 の placeCores。rensa が新規＝§2-3） |
| | Lv2『お互いのアタックステップ』：【神速】で手札のスピリット/ブレイヴを召喚するとき、ターンに1回、コストを支払わずに | activated timing flash + phaseTurn attack both + oncePerTurn + summon from hand keywordFilter soku（payCost 省略＝無償。BS08-024-e1 型。読みの注意は §4-2） |
| BS19-103 | メイン：フィールドに置いて発揮し続ける（コア0個禁止＋ドローステップ以外手札増加禁止＋ライフが減ったら破棄） | 新部品 3 つ＝§2-5/6/7（フィールドマジックの器＋globalConstraint 2 件）。中身の制約は globalConstraint で書く |
| | フラッシュ：このターンの間、スピリット1体をBP+2000 | magic timing flash + timedEffect bp 2000 duration turn（BS08-067-e3） |
| BS19-104 | メイン：このターンの間、コスト4以下の自分のスピリットがアタックするとき、相手はバーストを発動できない | magic timing main + lendSelfThisTurn（BS08-067-e1）+ fieldEvent anySpiritAttacked lentOnly ownOnly subjectFilter cost max 4 + action timedEffect battleLock burst duration battle（BS08-067-e2 の骨格 + BS17-021-e1 の battleLock） |
| | フラッシュ：このターンの間、スピリット1体をBP+2000 | BS08-067-e3 |
| BS19-105 | フラッシュ：相手のスピリット1体を疲労 | magic timing flash + exhaust count 1（BS17-020-e1 の action） |
| | 連鎖（条件 青×1）：コスト3以下の相手のスピリット1体を破壊する | destroy + filter cost max 3（BS14-072-e1） |
| BS19-X03 | Lv1-2『アタック時』：相手のスピリット1体を疲労 | triggered onAttack + exhaust count 1（BS17-020-e1） |
| | 連鎖（条件 青×1）：2枚ドローし、その後手札2枚を破棄 | triggered の draw 2（BS12-060-e1）+ moveCards hand→trash 2（BS12-060-e2）。「その後」を sequence で括るか同時2エントリにするかは §4-5 |
| | Lv2『自分のアタックステップ』：このスピリットと【神速】を持つ自分のスピリットのアタックでライフを減らしたとき、相手のライフのコア1個を相手のリザーブに | 2 エントリ：triggered onLifeDealt + lifeCrush 1（BS02-034-e1 のトリガー + BS08-024-e2 の lifeCrush）＋fieldEvent ownSpiritDealtLife subjectFilter keyword soku + lifeCrush 1（BS06-X22-e2 型）。書き分けは §4-6 |
| BS19-X07 | フラッシュ【神速】 | keyword soku（BS11-017-e1。ブレイヴも同じ器） |
| | 【合体時】『バトル時』：相手はバーストを発動できない | triggered onBattleStart + timedEffect battleLock burst duration battle（BS15-X03-e1 / BS17-021-e1） |
| | 【合体時】『アタック時』：BP比べで相手だけを破壊したとき、相手のライフのコア1個を相手のトラッシュに | triggered onBattleWin battleRole attacker + lifeCrush 1 dest:"trash"（BS08-036-e4。effectAction.ts:87 に dest 軸あり） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
1. **BS19-025**「コア3個までを自分のリザーブに置くことができる」— 1体のスピリットから3個か、複数体から合計3個かが決まらない。BS02-024-e1（removeCores count:"any" anyMax）は「ブロックしたスピリット1体」への言及なので配分の前例にならない。
2. **BS19-087-Lv2**「【神速】で…召喚するとき、ターンに1回、コストを支払わずに召喚できる」— (a) 起動能力として「ターン1回、手札の【神速】持ちを無償召喚」を書く（§3 の案。実質同義）か、(b) 【神速】による通常召喚の支払いを免除する grant を作るか。器 (b) は既存に無い（sokuPaySourceGrant は支払い元を増やすだけ）。また「スピリットカード/ブレイヴカード」の両方を1エントリで召喚できるか（summon に両方を含む軸が見当たるか）は実装確認が要る。
3. **BS19-103-メイン**「効果以外でスピリットのコアを0個にできず」— 「効果以外」の範囲（メイン/フラッシュの手動コア移動のみか、コスト支払いによるコアの取り出しも含むか）が効果文から確定しない。
4. **BS19-103-メイン**「この効果が無効になったとき破棄される」— 「無効」がマジック無効化（magicNegate）のみか、constraint 個別の打ち消しも含むか。フィールドマジックの器の仕様として決める必要がある。
5. **BS19-X03 の連鎖**「2枚ドローする。その後、手札2枚を破棄する」— BS12-060 は同トリガーの2エントリ（同時）で書いているが、本カードは連鎖の節の中の「その後」なので、sequence で直列にするか同時2エントリでよいかは、連鎖の器の解決単位（メインループ設計）に依存する。
6. **BS19-X03-Lv2**「このスピリットと【神速】を持つ自分のスピリット」— subjectFilter に自己を含める OR 軸は ResolvedTargetFilter に無い。§3 のように onLifeDealt（自己）と ownSpiritDealtLife（絞り込み付き）の 2 エントリに分けるのが現状の書き方だが、同一タイミングで両方に引っかかったとき（このスピリット自身が【神速】を得た場合）二重発動の恐れがある。
7. **BS19-024 の連鎖** — 連鎖元が【神速】（フラッシュ）。通常のメインステップ召喚でも連鎖が発揮されるか（連鎖元が「このカードの召喚」全体か【神速】効果のみか）は効果文から決まらない。§2.1 の Q&A（連鎖は連鎖元と一体）をどう適用するかメインループで決める。
8. **BS19-104-メイン**「コスト4以下の自分のスピリットがアタックするとき、相手はバーストを発動できない」— 発動不可が効くのはアタック宣言の時点のみか、そのバトルの間か。§3 は duration:"battle"（BS17-021-e1 型）で書いたが、テキストは「このターンの間」の常時禁止とも読める（ブロック後のフラッシュでバーストを伏せるケース等の差）。
