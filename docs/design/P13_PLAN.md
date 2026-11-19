# P13 プロモ・P14-09 調査メモ（調査役）

対象：`data/staging/P13.json` の29枚（P13-01〜28・P14-09）。実装はしていない。
「節」＝効果文の見出しブロック1つ。【連鎖】の続き（[色]：…）は連鎖元と同じ効果エントリに入るが、継続効果（常時）は別エントリになるので節として別に数えた。手本の効果 id は `data/cards` を読んで実在を確かめたものだけ。
（SJ_PLAN.md はこのブランチに無い。履歴 aa50c018 の構成に合わせた）

## 1. 集計
- 節の数：49（効果なし＝0節の枚数：0）
- 既存の器で書ける：46
- 新しい部品が要る：3節（P13-04 連鎖の継続／P13-09 連鎖の青／P13-15 マジックの「この効果で」）。部品は3つ（§2）
- 実装役が先に smoke で確かめる推測つき：5件（§3 に「未確認」）
- 確認すべき解釈：1（P13-25。§4）。そのほかは手順書・公式Q&Aで決定済み

内訳（節）：P13-01〜10 が18／P13-11〜18 が12／P13-19〜28 が18／P14-09 が1。
語彙はすべて BS19〜BS23 の時代（【連鎖】【強化】【粉砕】【強襲】【激突】【合体時】）。未知のキーワードは無い（§5）。

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当 |
|---|---|---|---|
| 1 | `globalConstraint` の `condition` に `ownColorSymbolsAtLeast`（条件の軸の値を足す） | 連鎖の継続は「継続効果の condition に同じ条件」（BS19_PLAN §2）。`constraint`（BS20-016-e2）は `condition.ownColorSymbolsAtLeast` を持つが、`globalConstraint` の condition（effectDefContinuous.ts:187）は列挙された別の軸しか無く、シンボル条件を書けない。`coreFloorByCost` に条件を付けるのに他の器が無い（aura／constraint では「コアの下限」を表せない） | P13-04 [緑] |
| 2 | `timedEffect` の `playerRule` に「相手の BP+ 効果は発揮されない」（`bpBuffSuppression` の期間つき版） | 現在の `bpBuffSuppression` は継続効果（effectDefContinuous.ts:229）で、BS07-075 のようにマジックを `lendSelfThisTurn` でフィールドに借りて載せる形。P13-09 はブレイヴの召喚時（連鎖）で、借りる元が無く、「このターンの間」を timedEffect の期間で持つ口が無い。`playerRule`（P029-e2 の `cantUseMagicForPid` の置き場）に同じ軸の値を足すのが最小 | P13-09 [青] |
| 3 | `IfCond` に「直前の `bpMinus` が、効果の前は BP 0 超だった対象を 0 にした」（条件の軸） | 公式 Q26733・Q26734：このマジックの効果で**初めて0になったスピリットごと**に回復し、効果の前から0だった／別の効果で0になったものでは回復しない。SD15-007-e2 の借りる fieldEvent（`opponentSpiritBpReachedZero`）は「そのターンに他の効果で0になった」ものも拾い、`lastBpBuffTarget`（bpMinus の注記）は `destroy` の filter にしか無く、IfCond に出せない。借りる fieldEvent を使うと、効果の対象に絞る記録の枠が要る（3原則の3に反する）ので、`sequence[bpMinus, if{…} then refresh]` で action の中に収める | P13-15 |

1枚専用の複合 type は提案していない。#1・#2 は既存の器の欄の追加、#3 は IfCond の1軸。

## 3. カードごとの表
略号は kind／type。「未確認」は実装役が先に smoke で確かめること。

| cardId | 節 | 使う器（手本） |
|---|---|---|
| P13-01 | Lv1-3 アタック時：BP4000以下の相手1体を破壊 | `onAttack destroy count:1 filter{maxBp:4000}`。手本 SD10-010-e1（count 2）・BS21-007-e1（maxBp） |
| 〃 | Lv2-3：【強化】を持つ自分のスピリットすべてに【激突】を与える | `keywordGrant clash ownAll filter{keyword:"kyoka"}`。手本 BS21-007-e2（filter keyword kyoka）・BS22-X06-e4（keywordGrant の書き方） |
| 〃 | Lv3【強化】BP破壊効果の上限+1000 | `keyword kyoka kyoka:"bpDestroy"`。手本 BS23-008-e2 |
| P13-02 | Lv2 破壊時：相手のスピリットのコア1個を相手リザーブへ。【連鎖：黄】ターンに1回、回復状態で残る | `triggered rensa onDestroy sequence[removeCores count:1 target:spread, if rensa cond ownColorSymbols yellow then (if oncePerTurn remainOnFieldSelf rested:false)]`。手本 BS19-015-e1（removeCores）・BS20-X02-e2（`remainOnFieldSelf`）・BS22-X04-e2（`if oncePerTurn`）・BS19-010-e2（破壊時の rensa） |
| P13-03 | Lv1-2 召喚時：ボイドからコア1個を自分のスピリットへ。【連鎖：青】このターン、相手は自分のフィールドのシンボルと同じ色のマジックしか使えない | `triggered rensa onSummon sequence[placeCores from:void to:spirit count:1, if rensa blue then timedEffect playerRule cantUseMagicForPid allowColors:"opponentFieldSymbols" duration:"turn" side:opponent]`。手本 BS06-031-e1・P029-e2（allowColors。期間は battle なので turn に変える）・BS20-004-e2（rensa の if＋timedEffect）。置き先は「自分のスピリット」（置くスピリットを選ぶ。BS06-031 と同じ） |
| P13-04 | Lv1-2：BP4000以下のスピリットのアタックでは、お互いのライフは減らない | `globalConstraint lifeGuard from:"attack" source{maxBp:4000} max:0`（side 省略＝両陣営）。手本 BS09-036-e2（source{cost}）。**未確認**：`source`（ResolvedTargetFilter）で `maxBp` が使えるか（BP は動的値） |
| 〃 | 【連鎖：緑】スピリットすべてのコアの数は Lv1 コストより少なくならない | `globalConstraint keyword:"rensa" constraint{coreFloorByCost} condition{ownColorSymbolsAtLeast}`。手本 BS12-X03-e1（両陣営の coreFloorByCost）。**新部品 #1** |
| P13-05 | Lv1-3【強化】「BP-効果」を-1000 | `keyword kyoka kyoka:"bpMinus"`。手本 BS23-041-e1 |
| P13-06 | Lv1-3【粉砕】アタック時：Lv1につき1枚破棄 | `keyword funsai`。手本 BS03-076-e1（Lv と同じ枚数＝この文面）。「Lv1につき1枚」は通常の【粉砕】と同じ枚数 |
| 〃 | Lv1-3：このスピリットの【粉砕】でバースト持ちが破棄されたとき、コスト5以下の相手1体を破壊 | `fieldEvent ownFunsaiMilled condition{lastFunsaiHasBurst:true} destroy filter{cost:{max:5}}`。手本 P065-e2（同じ event・condition）。**未確認**：「このスピリットの」に絞る欄（`selfMode:"source"` か `selfOnly`）が ownFunsaiMilled で効くか。効かなければ【粉砕】の発生源を eventInfo に載せる（既存の欄の追加） |
| 〃 | Lv3【強化】相手へのデッキ破棄効果+1枚 | `keyword kyoka kyoka:"deckMill"`。手本 BS19-057（同文） |
| P13-07 | Lv1-3：このスピリットが相手によって破壊されたとき1枚ドロー | `fieldEvent ownSpiritDestroyed selfOnly byOpponentOnly draw 1`。手本 BS16-X05-e2（selfOnly＋byOpponentOnly）・BS23-042-e2 |
| 〃 | Lv2-3 アタック時：このターン、相手1体をBP-2000 | `onAttack bpMinus amount:2000 count:1`。手本 BS19-053-e1 |
| P13-08 | メイン：【強化】を持つ自分のスピリット1体につき、BP2000以下の相手1体を破壊 | `magic main destroy count:1 countCounter{ownKeyword:"kyoka"} filter{maxBp:2000}`。手本 BS23-008-e1（ownKeyword kyoka）・BS21-007-e1（countCounter＋maxBp） |
| 〃 | フラッシュ：このターン、スピリット1体をBP+3000 | `magic flash timedEffect bp 3000 duration:turn side:both count:1`。手本 BS06-101-e3（side both） |
| P13-09 | Lv1 召喚時：自分のフィールドかトラッシュのコア1個をボイドへ | `triggered onSummon removeCores side:own from[spirit,nexus,trash] to:void target:spread count:1`。手本 BS01-007-e1（「フィールド上、またはトラッシュ」＝同文）。ブレイヴの召喚時は levels [1] |
| 〃 | 【連鎖：青】このターン、相手の BP+ 効果は発揮されない | 連鎖元の後ろに `if rensa blue then timedEffect playerRule(bpBuffSuppression) duration:turn side:opponent`。**新部品 #2**。対象の範囲（スピリット/ブレイヴ/ネクサス/マジック）は BS10-095-e2・BS04-086-e2 と同じ。SEMANTICS_AUDIT §3.13：BP を増やす効果だけ止める |
| P13-10 | Lv1-2 アタック時：疲労状態のコスト3以下の相手1体を破壊することで1枚ドロー | `onAttack pay{cost:destroy filter{rested:true,cost:{max:3}}, then:draw 1}`。手本 BS23-008-e1（pay＋destroy）・BS19-013-e1（rested＋cost の filter）。破壊できなければ不発（COST_MODEL） |
| 〃 | Lv2 破壊時：相手のスピリットのコア1個を相手リザーブへ | `onDestroy removeCores count:1 target:spread`。手本 BS19-015-e1 |
| P13-11 | Lv1-3 アタック時：相手は、相手のスピリット1体を疲労させる | `onAttack exhaust count:1 chooserIsTarget`。手本 BS06-028-e2・BS08-021（同文）。選ぶのは相手（CHOOSER_RULES・SEMANTICS_AUDIT §3.28） |
| 〃 | Lv2-3：この効果で疲労させたとき、疲労させた1体につき、ボイドからコア1個をこのスピリットへ | 上のエントリを `sequence[exhaust, if{count selfLevel atLeast 2} then placeCores from:void to:spirit target:self countCounter lastMoved]` にして、1つの action に収める（後から読む枠を作らない）。手本 BS20-069-e2（疲労を条件に置く fieldEvent `opponentSpiritExhaustedByOwnSpiritEffect`）は「自分のスピリットの効果」全般で、「このスピリットの効果」には広い。**未確認**：exhaust が `lastMoved`／`lastTargetCount` を記録するか（記録しないなら record.ts に足す。新しい器ではない）、`if` の cond に `selfLevel` を載せられるか |
| P13-12 | 【合体時】合体アタック時：コスト4以下の相手にブロックされたとき、自分の合体スピリット1体を回復 | `onBlocked whileCombined eventTarget:use condition{targetMaxCost:4} refresh count:1 filter{combined:true}`。手本 BS06-X21-e3（targetMaxCost）・BSC05-025（自分の合体スピリット1体を回復。「このスピリット」ではないので target:self にしない。#641） |
| P13-13 | 【合体時】合体アタック時：手札1枚を破棄することで1枚ドロー。【連鎖：白】コスト4以下の相手1体を手札へ | `triggered rensa onAttack whileCombined sequence[pay{cost:discard hand 1, then:draw 1}, if rensa white then return to:hand filter{cost:{max:4}}]`。手本 BS22-075（pay＋rensa）・BS19-044-e1（return）。連鎖元が不発でも連鎖は解決（BS19_PLAN Q773） |
| P13-14 | Lv1-2【強襲：1】 | `keyword kyoshu count:1` と `triggered onAttack pay{cost:exhaust nexusOnly, then:refresh self, limitByKeyword:"kyoshu"}`。手本 BS07-052-e1・e2 |
| 〃 | 【連鎖：赤】相手は可能ならば必ずブロックする | `triggered rensa onAttack if rensa red then timedEffect mustBlock duration:…`。手本 BS20-X02-e1 |
| P13-15 | フラッシュ：このターン、相手1体をBP-1000。この効果でそのスピリットがターンで初めてBP0になったとき、自分の1体を回復 | `magic flash sequence[bpMinus amount:1000 count:1, if{新軸：直前の bpMinus が0超から0にした} then refresh count:1]`。**新部品 #3**。手本 SD15-007-e3（bpMinus）。Q26732：0になっても破壊されない／Q26733：別の相手スピリットなら同ターンに何度でも／Q26734：別の効果で0にした後では回復しない |
| P13-16 | Lv1-2：自分の合体スピリットが相手によって破壊されたとき、ブレイヴを残しスピリットだけ手札へ戻せる | `reviveOnDestroy scope:ownAll filter{combined:true} when{byOpponent:true} revived{toHand:true} optional:true`。手本 BS12-068-e2（合体スピリットのブレイヴを残して戻す）・BS20-071-e2（when byOpponent）・BS12-052-e2（optional） |
| 〃 | Lv2 自分のアタックステップ：自分の合体スピリットがアタックしたとき、BP4000以下の相手1体を破壊。この効果は重複しない | `fieldEvent anySpiritAttacked turn:own ownOnly subjectFilter{combined:true} noStackByName:true destroy filter{maxBp:4000}`。手本 BS18-X02-e2（ownOnly＋subjectFilter）・BS21-070-e2（noStackByName） |
| P13-17 | 【合体時】このスピリットのアタック時：1枚ドローし、BP3000以下の相手1体を破壊 | `onAttack whileCombined sequence[draw 1, destroy maxBp:3000]`。手本 BS10-066-e2（whileCombined の onAttack）。「し」＝同時（CONJUNCTION） |
| P13-18 | Lv1-2 自分のアタックステップ：自分のスピリットすべてBP+2000 | `aura bp ownAll amount:2000 phaseTurn{attack,own}`。手本 BS09-059-e1 |
| 〃 | Lv2：自分のスピリットのアタックで相手のライフを減らしたとき1枚ドロー | `fieldEvent ownSpiritDealtLife phase:attack turn:own draw 1`。手本 BS20-071-e1 |
| P13-19 | Lv1-2 バトル時：BP比較で相手だけ破壊したとき、相手1体を手札へ | `onBattleWin return to:hand count:1`。手本 BS21-033-e2（heading を書く）・BS01-071-e1 |
| 〃 | Lv2：「武装」の自分のスピリット1体につきこのスピリットBP+1000 | `aura bp target:self amountCounter{ownFamily:"武装"} amount:1000`。手本 SD10-010-e2（amountCounter）。自分自身も数える（SEMANTICS_AUDIT §3.8） |
| P13-20 | Lv1-2 アタック時：【連鎖】を持つ自分のスピリット1体につきBP+1000。【連鎖：緑】BP7000以下の相手1体を疲労 | `triggered rensa onAttack sequence[timedEffect bp 1000 amountCounter{ownKeyword:"rensa"} battle self, if rensa green then exhaust count:1 filter{maxBp:7000}]`。手本 BS19-044-e1（ownKeyword rensa）・SD10-010-e2・BS19-044-e2（rensa と timedEffect の組） |
| P13-21 | Lv1-3 お互いのアタックステップ：自分の紫のスピリット1体につきBP+1000 | `aura bp target:self amountCounter{ownSpirits:{color:"purple"}} phaseTurn{attack,both}`。手本 BS09-006-e1（phaseTurn both） |
| 〃 | Lv2-3 自分のアタックステップ：自分のスピリットの効果で相手のスピリットのコアが0個になったとき1枚ドロー | `fieldEvent opponentSpiritCoresEmptied phase:attack turn:own draw 1`。手本 BS20-017-e3 |
| P13-22 | Lv1-2【強化】相手への疲労効果の体数+1 | `keyword kyoka kyoka:"exhaust"`。手本 BS21-033-e1（refresh 版） |
| 〃 | Lv1-2：【強化】を持つ自分のスピリット1体につきBP+1000 | `aura bp target:self amountCounter{ownKeyword:"kyoka"}`。手本 SD10-010-e2 |
| P13-23 | Lv1-2 ブロック時：BP+3000。【連鎖：紫】1枚ドロー | `triggered rensa onBlock sequence[timedEffect bp 3000 battle self, if rensa purple then draw 1]`。手本 BS19-044-e2 |
| 〃 | Lv2 ブロック時：BP比較で相手だけ破壊したとき回復 | `onBattleWin heading:"block" refresh target:self`。手本 BS21-033-e2・BS01-071-e1 |
| P13-24 | Lv1-3 召喚時：手札のコスト2のスピリット1体を無償で召喚できる。【連鎖：赤】BP2000以下の相手2体を破壊 | `triggered rensa onSummon optional sequence[summon from:hand costFilter:2, if rensa red then destroy count:2 filter{maxBp:2000}]`。手本 BS05-009-e1（optional の summon）・BS20-X02-e1。「ただし召喚時は発揮しない」が無いので skipOnSummon は付けない（SEMANTICS_AUDIT §3.7） |
| P13-25 | Lv1-2 召喚時：手札/トラッシュの【強化】持ちコスト3以下の青のスピリットを好きなだけ無償で召喚 | `summon from:hand alsoFrom:"trash" colorFilter:blue costFilter{max:3} keywordFilter:"kyoka" upTo`。手本 BS16-X05-e2（alsoFrom trash＋upTo）・BS10-029-e1（好きなだけ）・BS18-X02-e1（「好きなだけ」＝count all＋upTo）。**未確認**：count が `"all"` を取れるか／`keywordFilter` で手札・トラッシュのカードの【強化】（Lv1-3 の印刷）を見られるか。§4 の1 |
| 〃 | Lv1-2【強化】相手へのデッキ破棄効果+1枚 | `keyword kyoka kyoka:"deckMill"`。手本 BS19-057 |
| P13-26 | Lv1-2 自分のメインステップ：自分のスピリットが召喚されたとき、BP2000以下の相手1体を破壊 | `fieldEvent ownSpiritSummoned phase:main turn:own destroy filter{maxBp:2000}`。手本 BS09-002-e1（subjectFilter なし版は BS11-061 系） |
| 〃 | Lv2 自分のアタックステップ：アタックしている自分のスピリットすべてBP+2000 | `aura bp ownAll filter{attackingOnly:true} amount:2000 phaseTurn{attack,own}`。手本 BS01-098-e1（inBattle の aura）。「アタックしている」は attackingOnly（targetFilter.ts:87） |
| P13-27 | Lv1-3【激突】 | `keyword clash`。手本 BS06-003-e1 |
| 〃 | Lv2-3 アタック時：1枚ドロー | `onAttack draw 1`。手本 SD06-005-e1 |
| P13-28 | Lv1-2 自分のアタックステップ：自分のスピリットすべてBP+2000 | `aura bp ownAll amount:2000 phaseTurn{attack,own}`。手本 BS09-059-e1 |
| 〃 | Lv2：自分のスピリットがBP比較で相手だけを破壊したとき1枚ドロー | `fieldEvent ownSpiritBattleWon phase:attack turn:own draw 1`。手本 BS19-091-e2（ownSpiritBattleLost の同形）。event 定義 fieldEvent.ts:41 |
| P14-09 | フラッシュ：BP3000以下の相手1体を破壊。名前に「ムゲン」の自分のスピリットがいるとき、さらにBP3000以下の相手1体を破壊 | `magic flash if{count ownSpirits{nameContains:"ムゲン"} atLeast 1} then destroy count:2 filter{maxBp:3000} else destroy count:1 filter{maxBp:3000}`。手本 BS23-083-e1（if/else）。「さらに」＝同時で、対象は先に全部決める（CONJUNCTION 表の1行目）。**未確認**：if の cond が nameContains を取れるか（`ownSpirits: TargetFilter` なので取れる見込み） |

## 4. 確認すべき解釈
手順書・公式Q&Aで決定済みのものは質問にしない（P13-15 は Q26732〜34 で決定済み）。

| # | カード | 私はこう読みました | 割れる点・選択肢 |
|---|---|---|---|
| 1 | P13-25 | 「手札/トラッシュ」から**同時に**好きなだけ召喚する。途中で手札・トラッシュに来たカード（召喚した青のスピリットの召喚時で加わるもの）は選べない（COST_MODEL §11 の `zoneBounds`＝BS16-X05-e2 と同じ）。召喚した体の召喚時効果は、同時の誘発としてターンプレイヤーが順を決める | A：私の読み（BS16-X05 と同じ。新しい欄は不要）／B：1体ずつ召喚して、前の召喚時効果を解決してから次を選ぶ（BS10-029 の `repeatWhileChosen` 形。手札を召喚時で増やすカードがあれば結果が変わる） |

公式Q&A（batspi。取得できたもの）：
- P13-15 マジックスイーツ：Q26732（0になっても破壊されない）／Q26733（別の相手スピリットなら同ターンに再び回復）／Q26734（別の効果で0になった後のこの効果では回復しない）
- そのほかのカード（P13-03・04・09・16 など新しい欄が絡むもの）は、このメモでは公式Q&Aを取っていない。実装前に主役のページを見る

## 5. 時代の確認
- 【連鎖】【強化】は BS19（2023年）以降の語彙で、BS19〜BS23 の手本が揃っている。P13 は BS22〜BS23 の時代のプロモ。未知のキーワードは無い（連鎖・強化・粉砕・強襲・激突・合体時）
- 26系の語彙は無い。ソウルコア・【アクセル】・【煌臨】・アルティメットの語も無い
- 系統「武装」「剣刃」「星竜」「地竜」「想獣」はプールにある。P14-09 の「ムゲン」は名前の部分一致（`nameContains`）

## 6. 実装前に先に smoke で確かめること（推測の一覧）
1. `lifeGuard.source` の `maxBp`（P13-04）
2. `ownFunsaiMilled` を「このスピリットの【粉砕】」に絞る欄（P13-06）
3. exhaust が `lastMoved` を記録するか・`if` の cond に `selfLevel` を載せられるか（P13-11）
4. `summon` の count `"all"` と `keywordFilter` が手札/トラッシュのカードの印刷【強化】を見るか（P13-25）
5. `if` の cond の `ownSpirits{nameContains}`（P14-09）
