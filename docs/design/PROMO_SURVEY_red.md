# プロモ調査メモ：赤（調査役）

対象：`data/staging/PROMO.json` の赤 29 枚（P001 P002 P006 P013 P017 P019 P020 P023 P032 P034 P038 P044 P046 P047 P048 P049 P059 P060 P067 P072 P080 P081 P082 P083 PX01 PX07 PX12 PX14 PX18）。**実装はしていない**。
**P001・P006 は効果文が空**（staging の `effect` が空文字。バニラか取得漏れかは未確認。§4-0）。節の数に入れていない。
`合体条件：コスト〜` の行は `effects` ではなくカード側の項目（BS11-051 は effects に載せていない）なので、節に数えない。

## 1. 集計

節は「Lv 見出し単位＋キーワード単独行＋バースト／フラッシュのブロック」で数えた。

| 区分 | 節 |
| :-- | --: |
| 全体（27 枚） | 52 |
| 既存の器で書ける | 45 |
| 新しい部品が要る | 7 |

「既存で書ける」45 節のうち、**器の組み合わせが実カードで一度も使われていない**ものが 10 節ある（§3 の「要確認」）。

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | 「合体していないこのスピリット」（条件の軸。`triggered.condition` に `selfNotCombined`） | 合体を見る既存は `whileCombined`（合体中だけ）・`battleOpponentCombined`（相手側）・`requirePrevAttackerCombined`（前のアタッカー）。`uncombinedFilter` は付与先の絞り込みで誘発の条件ではない。`ownBurstSet:false` のような否定の逃げ道も無い | P049 |
| N2 | 「カード名に〜と入っている相手のスピリットとバトルしたとき」（条件の軸。`battleOpponentNameIncludes`） | 既存は `battleOpponentCombined`（onBattleStart 用）と aura 側の `battleOpponentHasKeyword` だけ。名前で絞る軸が無い | PX14 |
| N3 | 「このターンにBPを比べ自分のスピリットが破壊されている」（条件の軸＋ターン内の記録） | ターン内の記録は `ownLifeLostThisTurn` など別の事実のみ。BP 比較で自分のスピリットが破壊されたかを持つ値が無い。`onBattleWin` は「いま」の勝敗で履歴ではない | P032 |
| N4 | 「そのバースト効果をもう1度発揮する」（単純なアクション。`repeatBurstEffect`） | `replayOpponentSummonEffect` は相手の召喚時効果の再発揮、`magicRepeatGrant`/`magicMirrorRepeat` はマジック。**自分が発動したバーストの action** を再実行するものが無い | P072 |
| N5 | 「そのバースト発動時に自分のスピリットが召喚されていた」（条件の軸。`ownBurstActivated.condition`） | 既存は `burstCostAtMost` のみ。発動の結果（召喚があったか）を持たない | P072 |
| N6 | 「発動したカードのバースト条件が【自分のライフ減少後】だったら」（条件の軸。`burstEvent`） | 同上。発動したバーストの `event` 名を見る軸が無い。`burstDestroyedColor` などは ownSpiritDestroyed 専用 | P060 |
| N7 | 「自分のスピリット状態のブレイヴ＋合体スピリットのブレイヴの合計」（カウンタ。`ownCombinedBraves`） | `ownBraveSpirits` はスピリット状態のみ（合体中は対象外と注記あり）、`selfBraveCount` は self だけ。自分の全合体スピリットのブレイヴ数が無い。足せば `plus:[ownBraveSpirits, ownCombinedBraves]` で書ける | P047 |
| N8 | 「この効果で破壊したスピリット1体につき」の個数（カウンタ。`lastDestroyedCount`） | `drawPerDestroyed` はドロー専用。`placeCores` に使える「直前の破壊数」が無い（`lastDestroyedChimei`・`lastBattleDestroyedCores` は別の値） | PX12 |

## 3. カードごとの表

器の根拠は既存カードの cardId。「要確認」は、器の組み合わせがその形で実在しない（実カードでの使用 0 件）もの。

| cardId | 節 | 使う器 |
| :-- | :-- | :-- |
| P001 | （効果文なし） | ― |
| P006 | （効果文なし） | ― |
| P002 | Lv2 自分のアタックステップ 竜人/翼竜すべて BP+1000 | `aura` bp ownAll familyFilter 配列 phaseTurn attack/own（BS11-002-e1）。levels [2] |
| P013 | Lv1-3 自分のアタックステップ 地竜の自分のスピリットすべて BP+1000 | 同上（BS11-002-e1）。自身も地竜なので含まれる |
| P017 | Lv1-3 空牙/神将 すべて BP+1000 | 同上（BS11-002-e1） |
| P017 | Lv3【激突】 | `keyword` clash levels [3]（BS07-009-e3） |
| P019 | 【転召：コスト3以上/トラッシュ】 | `keyword` tensho minCost 3 dest trash（BS07-009-e1） |
| P019 | Lv1-3 召喚時 BP4000以下のスピリット1体を破壊し、1枚ドロー | `triggered onSummon` + `sequence[destroy{maxBp:4000}, draw 1]`（BS11-001-e1 と SD06-005-e1 の部品）。**要確認：相手限定でなく自分も候補（§4-2）、「し、」（§4-4）** |
| P020 | Lv1-3 自分のアタックステップ 機人がいる間 BP+3000 | `aura` bp self amount 3000 condition `{hasOwnFamily:"機人"}` phaseTurn attack/own（SD01-003-e1・X012A-e3 の形） |
| P023 | Lv1-3 星竜/翼竜 すべて BP+1000 | BS11-002-e1 |
| P032 | Lv1-3 アタック時 このターンにBP比較で自分のスピリットが破壊されているとき ブロックされない | `triggered onAttack` + `timedEffect unblockable battle target self`（BS10-047-e3）。**条件は N3** |
| P032 | Lv3 お互いのスタートステップ 色1色指定 相手のスピリットすべてシンボル1つ失う | `step start both` + `timedEffect symbolLoss all`（BS02-073-e1 の step、BS12-080-e1 の中身）。**要確認：step と symbolLoss の組み合わせは実在しない** |
| P034 | 【合体時】合体アタック時 BP4000以下のスピリット1体、または相手のネクサス1つを破壊 | `triggered onAttack whileCombined` + `chooseActionMode{modes:[destroy maxBp 4000, destroy nexus only]}`（BS17-056-e2 の枠、SD01-033-e1 のモード） |
| P038 | Lv1-3 バトル時 同じBPの相手のスピリット1体を破壊 | `destroy filter{exactBp:"selfBp"}`（BS10-003-e1。トリガは onBattleStart eventTarget use） |
| P038 | 【合体時】Lv2-3 バトル時 「太陽」入りの自分のスピリット1体につき BP+1000 | `triggered onBattleStart whileCombined` + `timedEffect bp amountCounter{ownNameIncludes:"太陽"}`（BS06-058-e1 は anyNameIncludes。ownNameIncludes は BS07-043-e3） |
| P044 | 【合体時】合体アタック時 BP4000以下の相手のスピリット1体を破壊 | `triggered onAttack whileCombined` + `destroy maxBp 4000`（BS11-001-e1、BS17-056-e2 の枠） |
| P044 | 【合体時】「ジークヴルム」が入っているものとして扱う | `nameAsGrant target self nameIncludes`（BS17-011-e2）+ `whileCombined`。**要確認：nameAsGrant に whileCombined が付くかは未確認** |
| P046 | Lv1-3 アタック時 地竜1体につき BP3000以下の相手のスピリット1体を破壊 | `destroy countCounter{ownFamily:"地竜"} filter{maxBp:3000}`（BS08-X29-e2） |
| P047 | Lv1-3 召喚時 BP4000以下のスピリット2体まで破壊、破壊1体につき1枚ドロー | `destroy count 2 drawPerDestroyed 1`（BS11-006-e1）。「2体まで」は任意枚数。**要確認：自分も候補（§4-2）、2体まで×drawPerDestroyed は実在しない** |
| P047 | 【合体時】Lv3 合体アタック時 ブレイヴ1体か1つにつき BP7000以下の相手のスピリット1体を破壊 | `triggered onAttack whileCombined` + `destroy countCounter filter{maxBp:7000}`（BS13-X01-e3）。カウンタは **N7** |
| P048 | 【バースト：自分のライフ減少後】BP3000以下の相手のスピリット2体を破壊、その後コストでフラッシュ | `burst event ownLifeDamaged thenPay:"flash"` + `destroy count 2 maxBp 3000`（SD06-015-e1、SD01-033-e1） |
| P048 | フラッシュ 相手のネクサス1つを破壊 | `magic flash` + `destroy nexus only count 1`（SD01-033-e1） |
| P049 | Lv1-3 自分のバースト発動後 BP4000以下の相手のスピリット1体、または相手のネクサス1つを破壊 | `fieldEvent ownBurstActivated` + `chooseActionMode`（BS16-044-e2、SD06-007-e2、SD01-033-e1） |
| P049 | Lv1-3【激突】 | `keyword` clash（BS07-009-e3） |
| P049 | Lv2-3 アタック時 バーストをセットしている間、合体していないとき BP+4000 | `triggered onAttack condition{ownBurstSet:true}` + `timedEffect bp 4000 battle target self`（SD06-005-e2、X012A-e3）。**「合体していない」は N1** |
| P059 | Lv1-3 アタック時 BP+3000 | `triggered onAttack` + `timedEffect bp 3000 battle target self`（BS17-X01-e2） |
| P059 | Lv2-3 アタック時 BP3000以下の相手のスピリット1体を破壊 | `destroy maxBp 3000`（BS11-001-e1）levels [2,3] |
| P060 | Lv1-3【激突】 | `keyword` clash |
| P060 | Lv1-3 アタック時 バーストをセットしているとき BP+3000 | SD06-005-e2 の条件形 + `timedEffect bp 3000` |
| P060 | Lv2-3 自分のバースト発動後 発動したカードのバースト条件が【ライフ減少後】だったら、リザーブからコア1個をライフに置く。ターンに1回 | `fieldEvent ownBurstActivated` + `placeCores reserve→life 1`（BS10-092-e2）+ `oncePerTurn`（BS11-032-e2）。**条件は N6** |
| P067 | Lv1-2 アタック時 BP+5000 | BS17-X01-e2 の形（BP+5000） |
| P072 | Lv1-3 フラッシュ【覚醒】 | `keyword` awaken levels [1,2,3]（BS17-008-e1） |
| P072 | Lv2-3 自分のバースト発動後 召喚されていたら、疲労させることで、そのバースト効果をもう1度発揮 | `fieldEvent ownBurstActivated` + `pay{cost: exhaust self, then: repeatBurstEffect}`。**N4（アクション）・N5（条件）**。`cost.type:"exhaust"` は BS07-X28-e2（ネクサス）。**要確認：自己疲労のコストは未確認** |
| P080 | メイン 1枚ドロー | `magic main` + `draw 1` |
| P080 | フラッシュ コスト3以下の相手のスピリット1体を破壊 | `magic flash` + `destroy cost{max:3}`（BS07-X28-e3 の filter 形、BS16-048） |
| P081 | メイン このターンの間、自分のスピリットすべてに【激突】を与える | `magic main` + `timedEffect content[keyword clash] duration turn all side own`（TimedContent の `keyword`）。**後から出たスピリットに効くか→§4-3** |
| P081 | フラッシュ 系統1つを指定、その系統の自分のスピリット2体を回復 | `declare what:"family" from spirits then refresh filter{declared:"match"}`（BS16-082-e1）。**要確認：count 2 で選ぶ形は実在しない（BS16-082 は all）** |
| P082 | メイン 相手のスピリット2体を手札に戻す | `return to hand count 2`（BS07-X26-e3、BS18-036） |
| P082 | フラッシュ 相手のネクサスすべてを破壊 | `destroy nexus only all:true`（BS17-074-e1 の all 形） |
| P083 | メイン BP10000以下の相手のスピリット1体を破壊 | `destroy maxBp 10000`（BS13-X01-e3、X008、X014） |
| P083 | フラッシュ 相手は、相手のスピリット3体を疲労させる | `exhaust count 3 chooserIsTarget`（BS06-X23-e2）。**要確認：BS06-X23 は暴風の `countFromBofu` 付き。マジックで使う形は未確認** |
| PX01 | Lv1-3 召喚時 BP3000以下のスピリットすべてを破壊し、破壊1体につき1枚ドロー | `destroy all:true maxBp 3000 drawPerDestroyed 1`（BS04-108-e1 の `all`、BS11-006-e1 の `drawPerDestroyed`）。**要確認：この2つの併用は実在しない。自分も候補（§4-2）** |
| PX01 | Lv2-3 アタック時 BP+4000 | BS17-X01-e2 の形 |
| PX07 | Lv1-3【強襲：2】 | `keyword` kyoshu count 2 + `pay{cost exhaust nexusOnly, then refresh self, limitByKeyword}`（BS07-X28-e1・e2） |
| PX07 | Lv1-3 アタック時 BP5000以下の相手のスピリット1体を破壊、破壊したら1枚ドロー | `destroy maxBp 5000 drawPerDestroyed 1`（BS11-006-e1） |
| PX12 | 【転召：コスト5以上/ボイド】 | `keyword` tensho minCost 5 dest void（BS09-X40-e1） |
| PX12 | Lv1-3 召喚時 「ヴルム」入りの自分のスピリット1体につき相手のスピリット1体を破壊、破壊1体につきボイドからライフにコア1個 | `sequence[destroy countCounter{ownNameIncludes:"ヴルム"}, placeCores void→life countCounter]`。破壊は BS08-X29-e2 の形。**個数は N8** |
| PX12 | 【合体時】Lv3 バトル時 BP+5000 | `triggered onBattleStart whileCombined` + `timedEffect bp 5000 battle target self`（BS11-X02-e3 の枠） |
| PX14 | Lv1-3 アタック時 相手のネクサス1つを破壊、破壊したら回復 | `sequence[destroy nexus only count 1, if{last:…} refresh target self]`（BS11-032-e2 の `if last`）。**要確認：last の CardPick がネクサスに使えるか** |
| PX14 | Lv1-3 バトル時 「神」入りの相手のスピリットとバトルしたとき BP+5000 | `triggered onBattleStart` + `timedEffect bp 5000 battle target self`（BS11-X02-e3）。**条件は N2** |
| PX14 | Lv2-3 アタック時 相手のスピリット1体を指定してアタックできる | `constraint canDirectAttack targetFilter any`（BS11-X02-e2、SD06-006-e2 の `whileOwnBurstSet` 無し版） |
| PX18 | Lv1-3 召喚時 相手のスピリット1体を破壊 | `triggered onSummon` + `destroy count 1`（BS17-016-e3 から rested 条件を外した形） |
| PX18 | Lv3 アタック時 BP比較で相手のスピリットだけを破壊したとき、ターン終了時に赤のスピリットすべてを回復、アタックステップ→エンドステップを1回。ターンに1回 | `triggered onBattleWin battleRole attacker`（BS09-X40-e2）+ `atTurnEnd{ sequence[refresh all filter{color:red}, extraAttackStep] }`（BS16-068-e1 と BS10-008-e2・e3）+ `oncePerTurn`。**要確認：atTurnEnd の中で extraAttackStep を使う形は実在しない。「エンドステップを1回」が extraAttackStep に含まれるかも未確認（§4-5）** |

## 4. 解釈が割れる点

自分では決めない。読み方の候補と影響だけ書く。CONJUNCTION.md の早見表（`Aし、Bする`＝同時／`この効果で〜したとき`／`ことで`）と照らした。

0. **P001・P006 の効果文が空。** staging の取得漏れなら、実カードの効果が丸ごと抜けている。バニラなら effects 0 件で足りる。公式のカード詳細で確認が要る（2 枚）。
1. **P060「発動したカードのバースト条件が【自分のライフ減少後】だったら」の「条件」。** 候補A：バーストの `event`（内部では `ownLifeDamaged`）で見る。候補B：カードの印刷された条件文で見る。実装上は A だが、ライフ減少後の別名の条件が出たら食い違う。影響：P060 1 枚（N6 の形を決める）。
2. **P019・P047・PX01「スピリット」に「相手の」が付かない。** 候補A：自分のスピリットも対象（破壊の候補に自分が入る）。候補B：相手のみ。文面どおりなら A。PX01 は「すべて」なので自分のスピリットも壊れる。ドローは破壊した全員の数で数える（文面どおり）か、相手のぶんだけか。影響：3 枚。
3. **P081「このターンの間、自分のスピリットすべてに【激突】を与える」は後から出たスピリットにも効くか。** 候補A：メイン解決時点の全員だけ。候補B：このターンに後から出たスピリットにも効く（TEST_STRATEGY §6 の注意点は B）。`timedEffect all:true` の既存の挙動と合わせる必要がある。影響：1 枚。
4. **P019「破壊し、1枚ドロー」の「し、」。** CONJUNCTION の「Aし、Bする」は同時で、片方だけ起きない扱いは書かれていない。候補A：対象がいなくてもドローする（`sequence`）。候補B：破壊できたときだけ（BS11-006 の `drawPerDestroyed` と同じ）。P047 のように「この効果で破壊されたスピリット1体につき」と書かれていれば B だが、P019 は書かれていない。影響：1 枚。
5. **PX18「アタックステップとエンドステップを順番に1回ずつ行う」。** BS10-008 は `extraAttackStep` 1 件で書かれているが、エンドステップまで含むのかは未確認。さらに「ターン終了時」に起動する形（`atTurnEnd`）と、BP 比較の勝ちを条件にする点が BS10-008 と違う。**「ターンに1回」の `onceScope` は BS10-008 では name。PX18 でも name でよいか。** 影響：1 枚。
6. **P032 Lv3「お互いのスタートステップ」の「相手のスピリットすべて」の「相手」。** 自分のスタートステップでは相手側、相手のスタートステップでは自分側を指すと読むのが自然（BS02-073 も同型）。候補：発動した側から見た相手。影響：1 枚。
7. **P072「このスピリットを疲労させることで、そのバースト効果をもう1度発揮」は「ことで」。** COST_MODEL に従えば、疲労できない（すでに疲労）か、バースト効果が再発揮できないとき何も起きない。再発揮の対象が「そのバーストの action」で、**対象を選び直すのか、前回の選択を引き継ぐのか**が割れる。影響：1 枚。
8. **PX14「この効果でネクサスを破壊したとき、このスピリットは回復する」。** 「破壊したとき」を `if last`（破壊に成功したか）で読む。破壊待機のままのときに回復するか（RULES_BATSPI_WIKI の破壊待機）。影響：1 枚。
9. **P047・PX01 の「スピリット2体まで」「すべて」の破壊とドロー。** 破壊待機で破壊されなかったスピリットは数えない（候補）。影響：2 枚。

## 5. まとめ

- 新しい部品の候補は 8 個（N1〜N8）。うち **条件の軸が 5 つ（N1・N2・N3・N5・N6）、アクション 1、カウンタ 2**。
- 1 枚でしか使わない軸が多い（N1 は P049、N2 は PX14、N3 は P032、N4・N5 は P072、N6 は P060）。**実装前に、同じ軸が他色のプロモ（他 3 体のメモ）でも要るかを突き合わせる**のが先。
- 要確認の組み合わせは 10 件（§3 の太字）。実装役に渡すときは、器の組み合わせが実カードで一度も使われていない節として明記する。
