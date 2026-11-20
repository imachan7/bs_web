# #631 収録漏れ（配布系・P14・CP14）調査メモ（調査役）

対象：`data/staging/631.json` の75枚。実装はしていない。cardId は Wiki の表記のまま。
入れない：SD19・SD20。issue の「SJ12」は収録済みなので除いた。P14-10 以降・CP14-02 以降・GX16-01 など issue の範囲外の番号は取っていない。
「節」＝効果文の見出しブロック1つ（マジックはメイン・フラッシュで各1節。バーストとその後の「コストを支払うことで」は1節）。「手本」は `data/cards` を読んで実在を確かめた効果 id。手本が書いていない行は、P13_PLAN.md §3 の同じ形を指す。

## 1. 集計

| 取り込み | 枚数 | 取り方 |
| :-- | --: | :-- |
| GX01〜GX26（GX12 ルナテックドロー含む） | 26 | Wiki のプロモ一覧（取得済みキャッシュ）をパーサーで |
| GX12-01〜03 | 3 | 同上 |
| KF-01〜15 | 15 | 同上 |
| PB12-01〜06／PB13-01〜05 | 6／5 | 同上 |
| LM13-01〜03／KA12-01 | 3／1 | 同上 |
| X010・X015・X017・X018・X019・X020 | 6 | 同上 |
| P14-01〜08 | 8 | 同上（P14-07 は種類がアルティメット） |
| CP14-01 | 1 | 同上（種類がアルティメット） |
| トロフィー封入 アマテラス・ドラゴン | 1 | **手で書いた1枚**（一覧に無い。カードページを読んだ。効果文は要約からの復元なので原文と照らすこと。BP は「X0000」表記のため levels の bp を 0 にした） |
| 計 | 75 | 一覧から取れた74＋手書き1 |

- 節の数：140（「しか使えない」の制限は別に29。下の §3）。うち P14・CP14 のアルティメット関連が 12 節（§5）
- 既存の器で書ける：およそ 113 節（確実でない箇所は「未確認」と付けた）
- 新しい部品が要る節：約 27 節。部品の候補は 9（§2）
- 「しか使えない」を持つカード：29 枚（§4）
- 冗談の効果：4 枚・5 節（§6）
- P14 系でアルティメットを含む：9 枚（P14-01〜08・CP14-01。うち種類がアルティメットが 2 枚）
- 確認すべき解釈：8（§7）
- cardId：トロフィーの1枚は `NOID:絶対なる幻龍神アマテラス・ドラゴン`（issue の表記）で仮置き。Wiki のページ上は BS55-XX01（転醒編に再録）と出た。**決めるのはユーザー**（§7-1）
- 種類 `ultimate` は現在の `CardType`（spirit/nexus/magic/brave）に無い。staging の P14-07・CP14-01 は `"type": "ultimate"` で出したので、そのまま data/cards に移すと validate:cards が落ちる見込み（§7-2）

## 2. 新しい部品の候補（組み合わせで書けない理由つき）

| # | 足りない部品 | 組み合わせで書けない理由 | 該当 |
| :-- | :-- | :-- | :-- |
| 1 | カードの欄 `onlyUsableBy: string[]`（対戦画面のプレイヤー名が一覧のどれかと一致するときだけ召喚・使用できる）。照らし合わせ方は §4 | 既存の `castRestriction`・`magicRestriction`・`summonNeedsCost` は盤面・コスト・色を読むもので、プレイヤー名を読む軸が無い。召喚・使用の入口（RuleValidator とクライアントの出し分けの両方）で読む欄なので、効果エントリでは書けない | 29 枚 |
| 2 | デッキ全体から選ぶ `moveCards.from:"deck"` と `shuffleDeck` | `moveCards.from` は trash/hand/revealed だけ（effectAction.ts の定義）。`revealOpen`（上から N 枚）は全体を見られない。シャッフル動作はどの型にも無い。部品は「デッキを見る元」と「シャッフル」の2つだが、検索→無償召喚→シャッフルは常に組で出るので1バッチで入れる | GX02・09・12・17・21、GX12-03、GX15（ブレイヴ検索） |
| 3 | `removeFromGame`（デッキすべてをゲームから取り除く）と「ゲームから除外」ゾーン | ゾーンの終点が trash/deck/hand 等しか無く、データにも「ゲームから除外」を扱うカードが無い（grep 空） | GX01 |
| 4 | `skipCoreStep` の期間つき版（「次のターンの間、コアステップとドローステップを行えない」） | `skipDrawStep`（BS07-058-e2）はドロー専用・自分の直前の手順用。`skipMainStep` を `playerRule`＋`duration:"nextRefresh"` で入れる形（BS18-054-e4）は手本になるが、コアステップを止める rule が無い | GX14 |
| 5 | 追加ターンの全手順（コア→ドロー→リフレッシュ→メイン→アタックを1回ずつ） | `extraAttackStep`（BS10-008-e3・PX18-e2）はアタックステップだけの追加。コア〜メインまでを順に走らせる器が無い | GX08 |
| 6 | `timedEffect` の期間 `"game"`（このゲームの間）と、そこへ載せる `fieldEvent` ／装甲グラント | `duration` は turn/nextRefresh 等。「このゲームの間」を持つ手本が data に無い（`"duration": "game"` の grep 空）。継続効果をマジックから `lendSelfThisTurn` で借りる形（BS07-075）はターン限りで、ゲーム中は残らない | GX05・GX20 |
| 7 | フィルタの軸 `rarity`（Xレアのスピリット） | `targetFilter` は系統・色・コスト・名前・キーワードを読み、レアリティを読む欄が無い（未確認：`ResolvedTargetFilter` に rarity があるか。実装役が先に確かめる） | GX07 |
| 8 | 「デッキの上から N 枚目をドロー」（先頭を残す） | `draw` は先頭から引く。`revealOpen` で上を開けて戻す形でも「2枚目だけ手札へ」は書けない | GX19 |
| 9 | `if` の条件の軸：直前に破棄したカードの種類（スピリット／ブレイヴ／ネクサス／マジック） | 既存の `if` は `lastMoved` の枚数を読むが、種類で4分岐する軸が無い（未確認：`moveCards` の pick で4回引いて代用できるか） | PB12-06 |

そのほかの確認が要る器（新部品かどうかを実装役が先に smoke で見る）：
- X015・アマテラス「一切の効果を受けない」：`immune`（BS01-139-e1）は `against` で種類を絞れる定義（timedContent.ts:48）。**自分自身の効果まで受けない**書き方があるか。`immuneToOpponentEffects`（BS04-043-e1）は相手の効果だけ
- アマテラス「BP＝このスピリット上のコア×10000」：`aura bp amountPer` の `counter` に「このスピリットのコア数」があるか（SD06-006-e3 の amountPer は系統の体数）
- PB12-03「このターンの間、スピリットすべては、カード名に「ペンタン」を含むものとして扱う」：`nameAsGrant`（BS17-011-e2・BS06-057-e2）は継続効果で、`timedEffect` の content に載る形が無い。相手のスピリットにも効かせる（side both）形が要る

## 3. カードごとの表

略号は kind／type。「バースト」の末尾の「その後コストを支払うことで、このカードのフラッシュ効果を発揮する」は `burst ... thenPay:"flash"`（手本 BS16-083-e1。flash は別エントリ）。マジックのフラッシュ「このターンの間、スピリット1体をBP+N」は `magic timing:flash timedEffect bp N duration:turn side:both`（手本 BS21-084-e2）。下の表では **「F」と略す**。

「しか使えない」「しか使用できない」は全 29 枚で別に1節ずつあり、**§2 の #1 で書く**。下の表には載せない（§4）。

| cardId | 節 | 使う器（手本） |
| :-- | :-- | :-- |
| GX01 | メイン：7枚ドロー、その後デッキすべてをゲームから取り除く | `magic main sequence[draw 7, removeFromGame deck]`。**新部品 #3** |
| 〃 | F（BP+7000） | F |
| GX02 | メイン：デッキからカード名に「ヴルム」のスピリット1枚を無償召喚、その後シャッフル | `magic main sequence[moveCards from:deck dest:summon pick{cardType:spirit,nameIncludes:"ヴルム"}, shuffleDeck]`。**新部品 #2**。「その後」＝順次（CONJUNCTION） |
| 〃 | F（+1000） | F |
| GX03 | メイン：トラッシュの「魔界七将」入りスピリットすべてを無償で召喚できる | `moveCards from:trash dest:summon count:all upTo pick{cardType:spirit,nameIncludes:"魔界七将"}`。手本 BS04-057-e2（好きなだけ召喚の `summon` 版）・SD06 等。未確認：moveCards の pick に `nameIncludes` があるか（`name` は BS23-055-e2 で確認） |
| 〃 | F（+2000） | F |
| GX04 | メイン：このターンの間、【神速】/【暴風】を持つ自分のスピリットすべては、アタックするとき相手のスピリット1体を指定してアタックできる | `timedEffect duration:turn side:own all filter{keyword:[sokuh,bofu]} content[constraint canDirectAttack targetFilter:any]`。手本 BS17-061-e1（`constraintGrant canDirectAttack`＝継続版）。期間つきの形は未確認 |
| 〃 | F（+3000） | F |
| GX05 | メイン：このゲームの間、自分のスピリットすべてに「【装甲：全色】」を与える | `timedEffect duration:game content[keywordGrant armor 全6色]`。手本 BS02-101-e2（`keywordGrant armor colors`）。**新部品 #6** |
| 〃 | F（+4000） | F |
| GX06 | メイン：上から5枚オープン、系統「天霊」のスピリットすべてを無償召喚、残りは好きな順番でデッキの上へ | `sequence[revealOpen 5, moveCards from:revealed pick{family:天霊} count:all dest:summon, moveCards from:revealed count:all dest:deckTop]`。手本 BS17-006-e1（revealOpen→moveCards）・BS17-022-e2（dest:summon）。残りは「revealed＋count all＋dest deckTop＝残りを順番に戻す」（effectAction.ts の moveCards の説明） |
| 〃 | F（+5000） | F |
| GX07 | メイン：このターンの間、自分のXレアのスピリットがアタックしたとき、相手のデッキを上から10枚破棄 | `timedEffect duration:turn content[fieldEvent anySpiritAttacked ownOnly subjectFilter{rarity:"X"} discard from:deck side:opponent count:10]`。手本 BS11-048-e1（discard from deck）。**新部品 #7**。期間つき fieldEvent の形は未確認（SD15-007 の借りる fieldEvent は P13_PLAN §2 #3） |
| 〃 | F（+6000） | F |
| GX08 | メイン：このターンのアタックステップ終了後、コア・ドロー・リフレッシュ・メイン・アタックの各ステップを順に1回ずつ | `magic main atTurnEnd? extraTurnSteps`。**新部品 #5**。手本 BS10-008-e3・PX18-e2（アタックだけ追加） |
| 〃 | F（+7000） | F |
| GX09 | メイン：デッキから名前に「太陽」のスピリット1枚を無償召喚、その後シャッフル | GX02 と同形。**新部品 #2** |
| 〃 | F（+5000） | F |
| GX10 | メイン：トラッシュのブレイヴすべてを無償で召喚できる | GX03 と同形（pick{cardType:brave}）。手本 BS11-020-e2（bravesOnly） |
| 〃 | F（+5000） | F |
| GX11 | メイン：このターンの間、系統「怪虫」/「殻虫」/「殻人」の自分のスピリットすべてに「【呪撃】『このスピリットのアタック時』…」を与える | `timedEffect duration:turn all filter{family:[…]} content[grant keyword jugeki]`。手本 BS02-101-e2（keywordGrant の書き方）。期間つきの形は未確認（`grantKeywordThisTurn` が型にある。BS?? は grep 空） |
| 〃 | F（+5000） | F |
| GX12 | メイン：デッキから名前に「月光」のスピリット1枚を無償召喚、その後シャッフル | **新部品 #2** |
| 〃 | F（+5000） | F |
| GX12-01 | バースト（ライフ減少後）：ライフ1のとき、お互いのデッキを5枚以下になるよう破棄。この効果発揮後、このスピリットカードを召喚 | `burst ownLifeDamaged if{ownLife atMost 1} sequence[discard from:deck both downTo 5, settleDerived, summon from:burst]`。手本 BS14-X01-e1（burst＋if＋summon from:burst）・moveCards の `downTo`（手札用）。デッキを「枚数以下になるまで」は未確認 |
| 〃 | Lv1-2：相手の一切の効果を受けない | `constraint immuneToOpponentEffects`。手本 BS04-043-e1。「相手の一切」は相手の効果だけ＝同じ |
| 〃 | Lv2 フラッシュ：トラッシュの名前に「犬」のスピリット/ブレイヴ1枚を無償召喚できる | `triggered/handActivated flash moveCards from:trash dest:summon pick{nameIncludes:犬}`。未確認：Lv2 限定のフラッシュ能力の手本（SD06-005 型） |
| GX12-02 | Lv1-3 アタック時：上から3枚オープンできる。系統「天霊」のスピリットすべてを手札に。残りは好きな順番でデッキの上へ | `onAttack optional sequence[revealOpen 3, moveCards from:revealed pick{family:天霊} count:all dest:hand, moveCards from:revealed count:all dest:deckTop]`。手本 BS17-006-e1 |
| 〃 | Lv2-3 アタック時：系統「天霊」のスピリット1体につき相手のデッキを上から5枚破棄 | `onAttack discard from:deck side:opponent count:5 countCounter{ownFamily:天霊}`。手本 BS11-048-e1 |
| GX12-03 | Lv1-3 バトル時：「諏訪部順一」「ミスター」「ギャラクシー渡辺」がかわりにバトルしてくれる | **冗談の効果（§6）。実装しない候補** |
| 〃 | Lv2-3 アタック時：デッキからイケメンスピリット1枚を無償召喚、その後シャッフル | **新部品 #2**。「イケメン」が系統・名前のどれか不明（Wiki の系統欄に「イケメン」が出る。未確認） |
| 〃 | Lv3 破壊時：相手は負けたことになる | **冗談の効果（§6）。実装しない候補**（処理自体は「相手が敗北する」と書けるが、勝敗の処理に対応する action 名が型にあるか未確認：`surrender` は grep 空） |
| GX13 | メイン：このターンの間、系統「天霊」の自分のスピリットが破壊されたとき、自分のライフが5になるように、ボイドからコアを置く | `timedEffect duration:turn content[fieldEvent ownSpiritDestroyed subjectFilter{family:天霊} placeCores from:void to:life untilLife:5]`。手本 BS09 の「ライフが5になるように」（【転召】ジークヴルム系。action 名は未確認）。期間つき fieldEvent は未確認 |
| 〃 | F（+5000） | F |
| GX14 | メイン：次のターンの間、相手はコアステップとドローステップを行えない | `timedEffect duration:nextRefresh? content[playerRule skipCoreStep, skipDrawStep]`。手本 BS18-054-e4（skipMainStep）。**新部品 #4**（コアステップ）。ドローは `skipDrawStep` を rule に載せられるか未確認 |
| 〃 | F（+5000） | F |
| GX15 | メイン：デッキから「アポロ」入りの自分のスピリットすべてにブレイヴを合体させるだけ選んで直接合体の召喚、その後シャッフル | `moveCards from:deck dest:summon pick{cardType:brave} combineToSelf…`。手本 BS11-020-e2（`combineToSelf`＝1体に直接合体）。**新部品 #2**。「スピリットすべてに（それぞれ別のブレイヴを）」は 1体ずつ選ぶ繰り返しで、手本は無い（§7-5） |
| 〃 | F（+3000） | F |
| GX16 | メイン：相手の合体スピリットすべてのブレイヴすべてを破壊、破壊したブレイヴ1つにつき相手のライフのコア1個をボイドへ | `sequence[destroyBrave allHosts, removeCores side:opponent from:[life] to:void countCounter:lastMoved]`。手本 BS11-016-e1（allHosts は「ブレイヴ1つずつ」だったので「すべて」は未確認）・BS17-051-e1（removeCores from life） |
| 〃 | F（+6000） | F |
| GX17 | メイン：デッキから系統「光導」のスピリット1枚を無償召喚、その後シャッフル | **新部品 #2** |
| 〃 | F（+5000） | F |
| GX18 | メイン：このターンの間、名前に「ストライク」の自分のスピリットすべてはブロックされない | `timedEffect duration:turn all filter{nameContains:ストライク} content[unblockable]`。手本 BS02 系の `unblockable`（kind にある）。期間つきの形は未確認 |
| 〃 | F（+4000） | F |
| GX19 | メイン：お互い手札すべてを破棄。その後お互いデッキの上から2枚目をドロー | `sequence[discard from:hand both count:all, drawNth 2]`。手本 BS01-138-e1（手札すべて破棄）。**新部品 #8** |
| 〃 | F（+2000） | F |
| GX20 | メイン：このゲームの間、系統「光導」のスピリットが召喚されたとき、相手のデッキを上から12枚破棄 | `timedEffect duration:game content[fieldEvent anySpiritSummoned subjectFilter{family:光導} discard from:deck side:opponent count:12]`。**新部品 #6** |
| 〃 | F（+1000） | F |
| GX21 | バースト（ライフ減少後）：デッキから名前に「ロード・ドラゴン」のスピリット1枚を召喚、シャッフル、その後コストを支払ってフラッシュ | `burst ownLifeDamaged sequence[moveCards from:deck…, shuffleDeck] thenPay:"flash"`。**新部品 #2**。手本 BS16-083-e1 |
| 〃 | F（+3000） | F |
| GX22 | バースト（相手のスピリットのアタック後）：自分のスピリットすべてを回復、このターンの間、自分のスピリットすべてを最高Lvとして扱う、その後フラッシュ | `burst anySpiritAttacked subjectSide:opponent sequence[refresh all, timedEffect level max all]` thenPay flash。手本 BS15-053-e1（burst の event）・BS21-084-e1（`level max`） |
| 〃 | F（+4000） | F |
| GX23 | バースト（ライフ減少後）：上から5枚オープンできる。スピリット1枚を召喚。残りはすべて手札へ。その後フラッシュ | `burst ownLifeDamaged sequence[revealOpen 5, moveCards from:revealed pick{spirit} count:1 dest:summon, moveCards from:revealed count:all dest:hand]` thenPay flash。手本 BS17-022-e2・BS17-006-e1 |
| 〃 | F（+5000） | F |
| GX24 | バースト（ライフ減少後）：ライフ1のとき、手札のスピリットとブレイヴを好きなだけ召喚、その後フラッシュ | `burst ownLifeDamaged if{ownLife atMost 1} then moveCards from:hand dest:summon count:all upTo pick{spirit,brave}`。手本 BS04-057-e2（好きなだけ召喚）。**召喚コストを支払うかは「召喚する」（無償と書かれていない）なので `payCost:true`**（§7-6）。ライフ1は `atMost 1` |
| 〃 | フラッシュ：ライフ1のとき、ライフが5になるようにボイドからコアを置く | `magic flash if{ownLife atMost 1} then placeCores…untilLife 5`。GX13 と同じ action（未確認） |
| GX25 | バースト（自分がオナラをした後）：相手のスピリット1体を疲労、その後フラッシュ | **冗談の効果（§6）。実装しない候補**（きっかけ「オナラ」を判定できない） |
| 〃 | フラッシュ：自分のスピリットのコア1個を自分のトラッシュへ | `magic flash removeCores side:own from:[spirit] to:trash count:1`。手本 BS01-007-e1 系の removeCores |
| GX26 | バースト（ライフ減少後）：デッキから7枚ドロー、その後フラッシュ | `burst ownLifeDamaged draw 7` thenPay flash。手本 BS16-083-e1 |
| 〃 | フラッシュ：相手のデッキを上から7枚破棄 | `magic flash discard from:deck side:opponent count:7`。手本 BS11-048-e1 |
| KA12-01 | Lv1-2【暴風：1】 | `keyword bofu count:1` ＋ `triggered onBlocked exhaust countFromBofu chooserIsTarget`。手本 BS17-023-e2・e3（文面が同じ） |
| 〃 | Lv2：系統「華兵」の自分のスピリットすべてに【暴風：1】を与える | `keywordGrant bofu ownAll filter{family:華兵}`。手本 BS02-101-e2（keywordGrant の書き方） |
| KF-01 | Lv1-3 アタック時：BP+3000 | `onAttack timedEffect bp 3000 battle self`。手本 P13-23 の BP+3000 |
| 〃 | Lv2-3【激突】 | `keyword clash`。手本 BS06-003-e1 |
| KF-02 | Lv1-3：名前に「カーネル」/「ケンタ」の自分のスピリット1体につき BP+1000 | `aura bp target:self amountCounter{ownSpirits{nameContains:[カーネル,ケンタ]}} amount:1000`。手本 SD10-010-e2。未確認：nameContains が配列を取るか |
| KF-03 | Lv2 アタック時：コスト4以下の相手1体を破壊 | `onAttack destroy count:1 filter{cost:{max:4}}`。手本 BS21-007-e1 |
| KF-04 | Lv1-3 召喚時：相手のスピリットのコア1個を相手のリザーブへ | `onSummon removeCores count:1 target:spread`。手本 BS19-015-e1 |
| KF-05 | Lv2 ブロック時：BP+3000 | `onBlock timedEffect bp 3000 battle self`。手本 P13-23 |
| KF-06 | Lv1-2 アタック時：BP比較で相手のスピリットだけを破壊したとき回復 | `onBattleWin refresh target:self`。手本 BS21-033-e2・BS01-071-e1 |
| KF-07 | Lv1-2：名前に「カーネル」/「ケンタ」の自分のスピリットすべて BP+2000（お互いのアタックステップ） | `aura bp ownAll filter{nameContains} amount:2000 phaseTurn{attack,both}`。手本 BS09-006-e1 |
| 〃 | Lv2『相手のメインステップ』：相手のスピリットすべての召喚時効果は発揮されない | `globalConstraint noSummonTriggerByCost`（kind にある）の形。手本の id は未確認（`noSummonTriggerByCost` の grep は空だった。`noOpponentTriggerByColor` 等を見る） |
| KF-08 | 【合体時】ブロック時：BP4000以下の相手1体を手札へ | `onBlock whileCombined return to:hand filter{maxBp:4000}`。手本 BS19-044-e1（return）・BS10-066-e2（whileCombined） |
| KF-09 | Lv2-3 破壊時：自分のスピリット1体を回復 | `onDestroy refresh count:1`。手本 BS06-X21-e3 系 |
| KF-10 | Lv1-2 召喚時：ボイドからコア1個を自分のリザーブへ | `onSummon placeCores from:void to:reserve count:1`。手本 BS10-087 系 |
| KF-11 | Lv1-2 召喚時：1枚ドロー | `onSummon draw 1` |
| KF-12 | メイン：BP4000以下のスピリットすべてを破壊 | `magic main destroy all filter{maxBp:4000} side:both`。手本 BS21-007-e1（maxBp） |
| 〃 | F（+4000） | F |
| KF-13 | バースト（ライフ減少後）：ライフ3以下のとき、BP10000以下の相手1体を破壊。この効果発揮後このスピリットカードを召喚 | `burst ownLifeDamaged if{ownLife atMost 3} sequence[destroy maxBp:10000, settleDerived, summon from:burst]`。手本 BS14-X01-e1（文面ほぼ同じ） |
| 〃 | Lv2-4 アタック時：名前に「カーネル」の自分のスピリットがいるとき、このスピリットのBP以下の相手1体を破壊 | `onAttack condition{ownSpirits nameContains カーネル} destroy maxBp:selfBp`。手本 BS14-X01-e3（`maxBp:"selfBp"`） |
| KF-14 | バースト：このスピリットカードを召喚 | `burst ownLifeDamaged summon from:burst`。手本 BS17-022-e1 |
| 〃 | Lv2-3 アタック時：名前に「カーネル」の自分のスピリットがいるときBP+5000 | `onAttack condition{…} timedEffect bp 5000 battle self` |
| 〃 | Lv3『自分のバースト発動後』：このスピリットは回復する | `fieldEvent ownBurstActivated refresh target:self`。未確認：「バースト発動後」の event 名（`grep -n burst server/src/types/fieldEvent*`） |
| KF-15 | Lv1-2 召喚時：トラッシュの名前に「カーネル」のスピリット1枚を手札へ | `onSummon moveCards from:trash dest:hand pick{nameContains:カーネル}`。手本 BS23-055-e2（name の pick）・BS13-X? 系 |
| 〃 | Lv2 アタック時：Lv1の相手のスピリットからブロックされない | `onAttack unblockableBy filter{level:1}`。手本 BS11-016 系の `unblockableBy`（kind にある。手本 id 未確認） |
| LM13-01 | Lv1【強化】BP破壊効果の上限+1000 | `keyword kyoka kyoka:"bpDestroy"`。手本 P13-01 の BS23-008-e2 |
| 〃 | 【合体時】合体アタック時：BP5000以下の相手1体を破壊。この効果発揮後、相手のスピリット1体を指定してアタックできる | `onAttack whileCombined sequence[destroy maxBp:5000, timedEffect constraint canDirectAttack targetFilter:any]`。手本 BS14-X01-e2（canDirectAttack）・BS10-066-e2 |
| LM13-02 | フラッシュ【神速】 | `keyword soku`。手本 BS11-020-e1 |
| 〃 | Lv1 召喚時：相手のスピリット1体を疲労 | `onSummon exhaust count:1`。手本 BS06-028-e2 の exhaust（対象は自分が選ぶ） |
| 〃 | 【合体時】【強化】相手への疲労効果の体数+1 | `keyword kyoka kyoka:"exhaust" whileCombined`。手本 BS21-033-e1（同系） |
| LM13-03 | Lv1【強化】スピリット回復効果の体数+1 | `keyword kyoka kyoka:"refresh"`。手本 BS21-033-e1 |
| 〃 | 【合体時】このスピリットの【連鎖】は条件を無視して発揮 | `rensaIgnoreCondition whileCombined`。手本 SD11-X02-e2（同文） |
| 〃 | 【合体時】バトル時：自分の合体していないスピリット1体を回復 | `onBattle whileCombined refresh count:1 filter{combined:false}`。手本 BSC05-025（P13_PLAN P13-12） |
| PB12-01 | Lv1-2『相手のターン』：系統「機獣」の自分のスピリットすべて BP+2000 | `aura bp ownAll filter{family:機獣} amount:2000 phaseTurn{turn:opponent}`。手本 BS09-059-e1 の phaseTurn |
| PB12-02 | Lv1-3 召喚時：このスピリットを疲労させることで、コスト8以上の相手のスピリットすべてを疲労 | `onSummon pay{cost:exhaust self, then:exhaust all filter{cost:{min:8}}}`。手本 BS23-008-e1（pay） |
| PB12-03 | Lv1-3 召喚時：このターンの間、スピリットすべては名前に「ペンタン」を含むものとして扱う | `timedEffect duration:turn all side:both content[nameAs ペンタン]`。**§2 末尾の確認事項**（手本 BS17-011-e2 は継続効果） |
| 〃 | Lv2-3：名前に「ペンタン」の自分のスピリットは相手に破壊されたとき手札へ／相手のスピリットは自分に破壊されたとき手札へ | `reviveOnDestroy scope:ownAll filter{nameContains} when{byOpponent} revived{toHand}`＋相手側の同形。手本 BS12-068-e2・BS20-071-e2。**相手側（opponentAll）の scope があるか未確認** |
| PB12-04 | バースト：BP（自分のスピリットの体数×1000）以下の相手1体を破壊。この効果発揮後召喚 | `burst ownLifeDamaged sequence[destroy maxBp:{counter ownSpirits ×1000}, settleDerived, summon from:burst]`。手本 BS14-X01-e1。BP 上限を数で指定する形は未確認 |
| PB12-05 | （効果なし。Wiki も空） | `effects: []`。validate:gaps は効果文が空のカードを落とさない前提（要確認） |
| PB12-06 | Lv1-2 アタック時：デッキを上から1枚破棄。スピリット→相手1体疲労／ブレイヴ→相手の合体スピリット2体疲労／ネクサス→1枚ドロー／マジック→ボイドからコア1個 | `onAttack sequence[discard from:deck count:1, if{破棄したカードの種類} then …]×4`。**新部品 #9** |
| PB13-01 | Lv1-2【呪撃】アタック時：バトル解決時にブロックしていた相手1体をバトル終了時に破壊 | `keyword jugeki`。手本 BS06 系の jugeki |
| 〃 | Lv2 アタック時：相手の合体スピリットのコスト4以下のブレイヴ1つを破壊。【連鎖：黄】アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフへ | `triggered rensa onAttack sequence[destroyBrave filter{cost max 4}, if rensa yellow then timedEffect fieldEvent ownLifeDealt placeCores to life]`。手本 BS19-044-e1 の連鎖。未確認：連鎖の後半が期間つき fieldEvent になる形（P13-04 の連鎖の継続と同種） |
| PB13-02 | Lv1-3 召喚時：自分のスピリットを好きなだけ破壊することで、破壊1体につき相手のスピリット1体を手札へ | `onSummon pay{cost:destroy own count:any, then:return to:hand countCounter:lastMoved}`。手本 BS04-057-e2（`count:any` の pay）・BS19-044-e1 |
| 〃 | Lv2-3『相手のアタックステップ』：疲労状態でブロックできる | `constraint canBlockWhileRested phaseTurn{attack,opponent}`。手本 kind `canBlockWhileRested` |
| 〃 | Lv3 フラッシュ：このスピリットを破壊しトラッシュに置くことで相手のスピリット1体を破壊 | `handActivated/activated flash pay{cost:destroy self, then:destroy count:1}` 手本 BS23-008-e1 |
| PB13-03 | バースト：自分の黄のスピリットすべてを回復、その後このスピリットカードを召喚 | `burst ownLifeDamaged sequence[refresh all filter{color:yellow}, summon from:burst]` |
| 〃 | Lv2-3 バトル時：このターンの間、相手1体を BP-3000 | `onBattle bpMinus amount:3000 count:1`。手本 BS19-053-e1 |
| 〃 | Lv2-3：相手に破壊されたとき、系統「天霊」の自分の1体を疲労させることで、このスピリットは回復状態で残る | `reviveOnDestroy … cost{exhaust 天霊} revived{rested:false}`。手本 BS17-061-e2（cost つき）・BS20-X02-e2（remainOnFieldSelf） |
| PB13-04 | Lv1-3 フラッシュ：このスピリットを破壊することで、手札の[超神星龍ジークヴルム・ノヴァ]を無償召喚 | `activated flash pay{cost:destroy self, then:summon from:hand pick{name}}`。手本 P13 の SD06 系 |
| 〃 | Lv2-3：赤のスピリットとしても扱う | `colorAs red`。手本 SD06-008-e1 |
| PB13-05 | このネクサスカードは6コストを支払わなければ配置できない | `summonNeedsCost`。手本 BS23-X07-e1・X13-17-e1 |
| 〃 | Lv1 エンドステップ：赤/紫/緑/白/黄/青のスピリットが1体ずついるとき、カードすべてをデッキへ戻しシャッフル、ライフ以外のコアをボイドへ、コア6個ずつをリザーブへ、手札2枚、ジャンケンで先攻を決めゲーム再開。ゲーム中に1回だけ | **ゲームの再開始（§6・§7-7）**。処理自体は書けるが、新部品が 4〜5（全カードをデッキへ／シャッフル／ジャンケン／ターン数のリセット／ゲーム1回の記録）。実装しない候補 |
| X010 | 【転召：歌鳥/ボイド】 | `keyword tensho family:歌鳥 dest:void`。手本 PX12-e1（dest:void）。系統指定の欄は SD02-011-e1 の `minCost` と別（未確認：`family` を取るか） |
| 〃 | Lv1-3 召喚時：[皇帝アンプルール]で転召したとき、手札とトラッシュの「ペンタン」入りスピリットを好きなだけ無償召喚。ただし召喚時効果は発揮されない | `onSummon condition{tenshoFrom name} moveCards from:[hand,trash] pick{nameContains:ペンタン} count:all dest:summon skipOnSummon`。手本 BS09 のジークヴルム転召（condition）・BS17-034-e1（skipOnSummon）・P13-25（alsoFrom trash） |
| 〃 | Lv3 アタック時：名前に「ペンタン」の自分のスピリット3体を破壊することでこのスピリットは回復 | `onAttack pay{cost:destroy own count:3 filter{nameContains}, then:refresh self}`。手本 BS23-008-e1 |
| X015 | このカードは、コストを支払わなければ召喚できない | `summonNeedsCost`。手本 BS23-X07-e1 |
| 〃 | Lv1-2：アタックと合体ができず、このスピリット以外の一切の効果を受けない | `cantAttack`＋`cantCombine`（BS01-142-e1・BS11-X02-e1）＋ 一切の効果を受けない（§2 末尾の確認事項。**自分の効果も受けない**。手本は無い） |
| X017 | メイン：系統「覇皇」の相手のスピリット1体を破壊。破壊したとき1枚ドロー | `magic main sequence[destroy filter{family:覇皇}, if lastMoved≥1 then draw 1]`。手本 BS14-X01-e1 系の if |
| 〃 | F：このターンの間、系統「覇皇」の自分のスピリット1体 BP+5000 | `magic flash timedEffect bp 5000 filter{family:覇皇} side:own`。手本 BS16-083-e2（family のフィルタ） |
| X018 | バースト：ライフ3以下のとき、BP15000以下の相手1体を指定。このターンの間そのスピリットはアタックできない。この効果発揮後召喚 | `burst ownLifeDamaged if{ownLife atMost 3} sequence[timedEffect cantAttack filter{maxBp:15000}, settleDerived, summon from:burst]`。手本 BS14-X01-e1・BS01-142 の cantAttack |
| 〃 | Lv2-4『自分のアタックステップ』：名前に「ペンタン」の自分のスピリットがLv2以下の相手のスピリットとBPを比べるとき、比べずブロックされなかったものとして扱う | `kind treatAsUnblocked`（kind にある）＋ filter{level max 2}。手本の id は未確認 |
| X019 | Lv1-2：赤/紫のスピリットとしても扱う | `colorAs red,purple`。手本 P066-e1 |
| 〃 | Lv1-2『自分のアタックステップ』：系統「神星」/「光導」/「星魂」の自分のスピリットすべて BP+1000 | `aura bp ownAll filter{family:[…]} amount:1000 phaseTurn{attack,own}`。手本 BS09-059-e1 |
| 〃 | Lv2：このスピリットと自分の[星文学者リリア]すべては、相手に破壊されたとき手札へ | `reviveOnDestroy scope:ownAll filter{name} when{byOpponent} revived{toHand}`。手本 BS12-068-e2・BS20-071-e2 |
| X020 | Lv1-2：緑/白のスピリットとしても扱う | `colorAs green,white` |
| 〃 | Lv1-2：相手のライフが減ったとき、手札の系統「光導」のスピリット1枚を無償召喚できる | `fieldEvent opponentLifeDamaged optional moveCards from:hand pick{family:光導} dest:summon`。手本 BS20-071-e1 の event 系 |
| 〃 | Lv2：自分の[交渉人ミクス]がいる間、系統「光導」/「星魂」の自分のスピリットすべてを最高Lvとして扱う | `levelAs treatAs:max target:ownSpiritsAll condition{ownNamed ミクス}`。手本 BS10-056-e3（`levelAs treatAs:max`）・BS02-002-e1（condition） |
| NOID アマテラス | Lv1：あらゆる効果を受けない | §2 末尾の確認事項。手本無し。**加えて Wiki の公式Q&A（Q8743〜Q8755）が手札・デッキ・トラッシュにある間の扱いまで定めている**（手札から効果で召喚できない・トラッシュから戻せない・デッキから開かれたらトラッシュへ等）。1枚専用の分岐が多く、実装前にユーザーと範囲を決める（§7-1） |
| 〃 | Lv1：合体できない。BPはこのスピリット上のコア×10000 | `cantCombine`（BS11-X02-e1）＋ BP のカウンタ（§2 末尾の確認事項） |
| 〃 | Lv1 召喚時：このスピリット以外のスピリットすべてを破壊 | `onSummon destroy all side:both exceptSelf`。手本 BS11-016-e1 系（destroy all の except self が書けるか未確認） |
| P14-01 | Lv1-2 アタック時：BP3000以下の相手1体を破壊。自分のアルティメットがいるとき、かわりに BP5000以下 | **アルティメットを含む（§5）** |
| P14-02 | Lv1-3 召喚時：コスト3以下の相手のスピリットすべてのコア1個ずつを相手のリザーブへ。自分のアルティメットがいるとき、トラッシュへ | 〃 |
| P14-03 | Lv1-2 アタック時：ボイドからコア1個を自分のアルティメットへ。【連鎖：赤】BP4000以下の相手1体を破壊 | 〃 |
| P14-04 | Lv1-2 召喚時：BP合計5000まで相手のスピリットを好きなだけ手札へ | 〃（この節自体はアルティメットを含まない。§5・§7-3） |
| 〃 | Lv2：自分のアルティメットがいる間、相手のスピリットの効果を受けない | 〃 |
| P14-05 | Lv1-3 相手に破壊されたとき：1枚ドロー。自分のアルティメットがいるとき、さらにこのスピリットは手札へ | 〃 |
| P14-06 | Lv1-3【粉砕】アタック時：Lvと同じ枚数破棄 | 〃（この節はアルティメットを含まない。`keyword funsai`。手本 BS03-076-e1） |
| 〃 | Lv1-3：自分のアルティメットがいる間、【粉砕】の自分のスピリットが相手に破壊されたとき相手のデッキを破壊したコスト分破棄 | 〃 |
| P14-07 | 【召喚条件】自分の白スピリット1体以上。Lv3-4 ブロック時：BP+3000。Lv4【Uトリガー】… | **種類アルティメット。実装しない（§5）** |
| P14-08 | Lv1-2 配置時：BP2000以下の相手1体を破壊。Lv2 自分のアタックステップ：自分のアルティメットすべて BP+3000 | 〃（1節目はアルティメットを含まない。`onSummon`相当の配置時。手本 BS21-007-e1） |
| CP14-01 | 【召喚条件】赤スピリット1体以上。Lv4【Uトリガー】アタック時… | **種類アルティメット。実装しない（§5）** |

注意：KF・LM13・PB12・PB13・X 系で「手本 id 未確認」としたものは、実装役が `data/cards` を grep して手本を決めてから書く。

## 4. 「しか使えない」を持つカード（29枚）

書かれた名前＝カードの文面そのまま。照らし合わせ方（ユーザー決定 2026-11-19）：**一覧のどれかと一致すれば使える。比べるとき、空白（半角・全角）は無視する。** 「コアの光主」は人物名ではなく、アニメ『少年激覇ダン』の6人を指す（Wiki の人物ページの見出し）。

| 書かれた名前 | 指す名前（一覧） | カード |
| :-- | :-- | :-- |
| コアの光主 | 馬神弾・馬神ダン・ヴィオレ魔ゐ・紫乃宮まゐ・兵堂剣蔵・百瀬勇貴・硯秀斗・クラッキー・レイ | GX02・GX03・GX04・GX05・GX06・GX07（6枚） |
| ギャラクシー（「ギャラクシー」と認められたカードバトラー） | 書かれたとおりの1件「ギャラクシー」 | GX01・GX08・GX26 |
| 馬神弾 | 書かれたとおり1件 | GX09・GX15 |
| 紫乃宮まゐ | 書かれたとおり1件（コアの光主の一覧にも入れる。ヴィオレ魔ゐと同一人物） | GX10 |
| 暴将デュック／獄将デュック | 書かれたとおり各1件 | GX11／GX16 |
| 月光のバローネ | 同上 | GX12・GX18 |
| バトスピ大好き声優 | 書かれたとおり1件 | GX12-01・GX12-02・GX12-03 |
| クラッキー・レイ | 同上 | GX13 |
| 暗闇のザジ | 同上 | GX14 |
| 兵堂剣蔵 | 同上 | GX17 |
| ハンサム | 同上 | GX19 |
| 硯秀斗 | 同上 | GX20 |
| 陽昇ハジメ／棚志テガマル／薬師寺アラタ | 書かれたとおり各1件 | GX21／GX22／GX23 |
| ジャスティス（「ジャスティス」と認められたカードバトラー） | 書かれたとおり1件 | GX24 |
| ボンバー（「ボンバー」と認められたカードバトラー） | 書かれたとおり1件 | GX25 |

- 「と認められたカードバトラー」「～しか使えない」の文末の違いは、同じ欄の値の違いとして扱う（`onlyUsableBy` に名前だけを入れる。文言は表示用）。
- マジックの GX01〜GX20 は、メインとフラッシュの両方に同じ文が付いている（使用の制限は1つにまとめる）。
- 「コアの光主」の一覧に「馬神ダン」と「馬神弾」、「ヴィオレ魔ゐ」と「紫乃宮まゐ」が両方あるのは、空白を無視するだけでは同じにならない表記ゆれのため（ユーザー指定）。
- 確認：GX01・GX08・GX26（「ギャラクシー」と認められたカードバトラーしか使用できない）、GX24（「ジャスティス」と認められたカードバトラーしか使えない）、GX25（「ボンバー」と認められたカードバトラーしか使用できない）は、効果文に制限の文が実在する（staging の effect で確認）。別の言い回しで使える人を限っているカードは、ほかに見つからなかった（「デッキに入れられる」等の文は無し）。

## 5. P14 系でアルティメットを含むもの（9枚）

カードデータは入れる。効果は実装しない扱い（ユーザー決定）。
| cardId | アルティメットに関わる節 | 補足 |
| :-- | :-- | :-- |
| P14-01 | アタック時の「自分のアルティメットがいるとき、かわりに BP5000以下」 | 前半（BP3000以下を破壊）だけなら既存の器で書ける |
| P14-02 | 召喚時の「…アルティメットがいるとき、トラッシュに置かれる」 | 前半だけなら `onSummon removeCores target:spread` |
| P14-03 | アタック時「コア1個を自分のアルティメットに置く」 | 連鎖の破壊は書ける |
| P14-04 | Lv2「アルティメットがいる間、相手のスピリットの効果を受けない」 | Lv1-2 の手札へ戻す節は書ける |
| P14-05 | 破壊時の「さらに手札に戻る」 | ドローは書ける |
| P14-06 | Lv1-3 の2節目（粉砕破壊時の破棄） | 1節目の【粉砕】は書ける |
| P14-07 | **種類がアルティメット**（召喚条件・Lv3-4・Uトリガー） | 全節未実装 |
| P14-08 | Lv2「自分のアルティメットすべて BP+3000」 | Lv1-2 配置時の破壊は書ける |
| CP14-01 | **種類がアルティメット**（Uトリガー） | 全節未実装 |

アルティメットの種類・Uトリガー・召喚条件は docs/design/ULTIMATE.md の領域。アルティメットを含まない節だけ実装して残りを card-notes に載せるかはユーザーが決める（§7-3）。

## 6. 冗談の効果（実装しない候補。決めるのはユーザー）

| cardId | 節 | 内容 |
| :-- | :-- | :-- |
| GX12-03 | Lv1-3 バトル時 | 「諏訪部順一」か「ミスター」か「ギャラクシー渡辺」がかわりにバトルしてくれる（現実の人物がバトルする） |
| GX12-03 | Lv3 破壊時 | 相手は負けたことになる（勝敗の処理としては書けるが、冗談の位置づけ） |
| GX25 | バースト | きっかけが「自分がオナラをした後」（ゲーム状態から判定できない） |
| PB13-05 | Lv1 エンドステップ | ゲーム全体のやり直し（判定は書けるが、全カードをデッキに戻し先攻をジャンケンで決め直す。冗談というより重い仕様。§7-7） |
| GX12-03 | Lv2-3 アタック時の「イケメン」 | 冗談ではないが、「イケメン」が何を指すか不明（系統か名前か） |

## 0. ユーザーの決定（2026-11-19）

- **使える人の名前**（部品 #1 `onlyUsableBy`）：対戦画面のプレイヤー名が一覧のどれかと一致すれば使える。空白（半角・全角）は無視
  - 「コアの光主」（GX02〜07）＝馬神弾・馬神ダン・ヴィオレ魔ゐ・紫乃宮まゐ・兵堂剣蔵・百瀬勇貴・硯秀斗・クラッキー・レイ
  - 「ギャラクシー」と認められた（GX01・GX08・GX26）＝ギャラクシー渡辺／「ジャスティス」（GX24）＝ジャスティス立花／「ボンバー」（GX25）＝暗黒戦士ボンバー
  - 「バトスピ大好き声優」：GX12-01 偽☆ギャラクシー＝諏訪部順一・ギャラクシー渡辺（イラストは諏訪部順一がギャラクシー渡辺に扮したもの）／GX12-02 青嵐帝 阪口＝阪口大助／GX12-03 遠藤ビャク・ガロ子ちゃん＝遠藤綾
  - ほかの人物名は書かれたとおりの1件
- **どう実装するかわからない冗談の効果は実装しない**（GX12-03「かわりにバトルしてくれる」・GX25「オナラをした後」）。card-notes に理由を書く。GX12-03「相手は負けたことになる」は勝敗として書けるので実装する。GX12-03「イケメンスピリット1枚を召喚」も冗談として実装しない（2026-11-20）
- **PB13-05 グラウンド・オブ・ロロのゲームのやり直しは実装する**（優先度は低い。最後に回す）
- **GX15 は同時に全員へ直接合体**（1文の複数の対象は同時）
- **アマテラス・ドラゴンは入れる**（cardId は Wiki の BS55-XX01 に合わせる）
- **P14 系9枚はどれも効果にアルティメットを含むので効果は実装しない**。種類がアルティメットの P14-07・CP14-01 は取り込みも保留（CardType に無い。SD19・SD20 と同じ扱い）
- ~~GX24「召喚する」はコストを払って召喚~~ → **撤回（2026-11-20）**：バーストの「召喚する」はコストを支払わずに（BURST.md の規則どおり。GX21・GX23・GX24・KF-14・PB12-04・X018 すべて無償）

## 0.1 入れる順（PR は弾の取り込みと同じく1つの draft に積む）

1. 部品 #1 `onlyUsableBy`（使える人の名前）と、既存の部品だけで書けるカードのデータ
2. 部品 #2（デッキから探す＋シャッフル）・#8（上から N 枚目をドロー）・#9（破棄した種類で分岐）
3. 部品 #3（ゲームから取り除く）・#4（期間つきでコアステップを止める）・#6（期間「このゲームの間」）・#7（レアリティの軸）
4. 部品 #5（追加ターン）と、アマテラス・X015 の「一切の効果を受けない」・コア数×10000 の BP・PB12-03 の名前扱い
5. ロロ（ゲームのやり直し）

## 7. 確認すべき解釈

| # | カード | 私はこう読みました | 割れる点 |
| :-- | :-- | :-- | :-- |
| 1 | アマテラス・ドラゴン | cardId は `NOID:…` のまま仮置き。Wiki では BS55-XX01（プロモ版は XX00）。「あらゆる効果を受けない」は自分の効果も含む。公式Q&A（Q8743〜Q8755）の手札・デッキ・トラッシュの扱いは別扱い | cardId の決め方／Q&A のどこまで実装するか／そもそもプレイ用カードとして入れるか（issue も「除外する判断もあり得る」と注記） |
| 2 | P14-07・CP14-01 | 種類 `ultimate` を staging に出した | `CardType` に無い。data に入れる時点で validate:cards をどうするか（種類を足す／入れない）。ULTIMATE.md との関係 |
| 3 | P14-01〜06・08 | アルティメットを含まない節だけ実装し、含む節は card-notes に載せる | 全節を未実装にするか |
| 4 | GX の「このターンの間、〜とき」「このゲームの間」 | 期間つきの fieldEvent／keywordGrant を `timedEffect` に載せる。載せられない型なら §2 の #6 を拡張 | 手本が data に無く、型を足すかどうかの判断 |
| 5 | GX15 | 「スピリットすべてに」＝1体ずつ別のブレイヴを選んで直接合体の召喚（同時ではなく順次） | 同時に全員へ（手本無し） |
| 6 | GX24 | 「召喚する」（無償と書かれていない）＝召喚コストを支払う。支払えない分は召喚できない | 無償召喚として読む（GX21・GX23 の「召喚する」も同じ読みか） |
| 7 | PB13-05 | 冗談寄りの重い効果として実装しない候補 | 実装する場合の範囲（ジャンケン・ターン数のリセット） |
| 8 | GX08 | 追加ターンの手順を1回ずつ走らせる（`extraAttackStep` の拡張） | 追加のメインステップ中に出たマジック等の扱い |

## 8. 時代の確認
- GX・KF・PB・LM13 は2010〜2013年の配布で、語彙は 【暴風】【激突】【粉砕】【強化】【連鎖】【神速】【転召】【呪撃】など（既存プールにある）。26系の語彙は無い（ソウルコア・煌臨・アクセル）
- 例外：「アルティメット」「Uトリガー」「召喚条件」は ULTIMATE.md の領域（§5）

## 9. 3段目以降の調査（2026-11-20）

対象：GX01・03・04・05・07・08・11・12-01・13・14・15・16・18・20・24、KF-02・07・14・15、PB12-03・04・05、PB13-01・05、X010・X015・X018、アマテラス（cardId は BS55-XX01）。§3 の「未確認」を既存カードの効果文の grep と型・ハンドラの読みで潰した。§2 の部品番号とは別に、9.3 で番号を振り直した（#3＝部品1、#4＝部品5、#5＝部品6、#6＝部品2、#7＝部品3）。
使用者の名前制限（`onlyUsableBy`）は全カード共通で §4 の表のとおり。下の表には書かない。マジックのフラッシュ（BP+N）は 1・2段目と同じ形なので省く。

### 9.1 前例の形（実装役・データ役が写す。どれも `data/cards` の実在エントリ）

- **このターンの間の継続効果をマジックから貸す**：`{kind:"magic",timing:"main",action:{type:"lendSelfThisTurn"}}` ＋ `lentOnly:true` の継続エントリ。手本 BS02-101（keywordGrant）・BS08-084・BS05-070（fieldEvent）・BS08-067（`anySpiritAttacked`＋`ownOnly`＋`subjectFilter`）・BS03-134（nameAsGrant）。**後から出たスピリットにも効くのは貸す形だけ**（`timedEffect all` は付与時点のスピリット向きの手本 P081 しか無い）。
- 貸与の仕組み：`server/src/logic/actions/grant.ts` の `pushVirtualSource`（約360行）・`lendSelfThisTurnHandler`。仮想発生源は `PlayerState.turnVirtualInstances` に積み、`PhaseManager.endTurn`（約462行）で空にする。走査は `shared/rules/level.ts` の `effectSources`（約255行）。

### 9.2 カードごとの表

判定：**既存**＝既存の器の組み合わせで書ける／**部品N**＝9.3 の部品／**確認N**＝9.4 のユーザー確認。

| cardId | 効果節 | 判定 | JSON の形・足す場所 |
| :-- | :-- | :-- | :-- |
| GX01 | メイン：7枚ドロー。その後デッキすべてをゲームから取り除く | 部品1 | `sequence[draw 7, removeDeckFromGame]`。draw は GX26-e1 と同形 |
| GX03 | メイン：トラッシュの「魔界七将」入りスピリットすべてを無償で召喚できる | 既存 | GX10-e1 と同形：`moveCards from:trash count:"all" dest:summon ask:true pick:{cardType:"spirit",nameIncludes:"魔界七将"}` |
| GX04 | メイン：このターンの間、【神速】/【暴風】を持つ自分のスピリットすべては、アタックするとき相手のスピリット1体を指定してアタックできる | 既存 | `lendSelfThisTurn` ＋ `{kind:"constraintGrant",levels:null,target:"ownAll",lentOnly:true,filter:{keyword:["soku","bofu"]},constraint:{type:"canDirectAttack",targetFilter:"any"}}`。手本 BS05-056-e2（constraintGrant＋canDirectAttack）・BS11-X01-e1。keyword の配列＝OR（P051 のコストで実在） |
| GX05 | メイン：このゲームの間、自分のスピリットすべてに【装甲：全色】を与える | 部品2 | `lendSelfThisGame` ＋ `{kind:"keywordGrant",levels:null,target:"ownAll",lentOnly:true,keyword:"armor",colors:[red,purple,green,white,yellow,blue]}`（BS02-101-e2 と同形） |
| GX07 | メイン：このターンの間、自分のXレアのスピリットがアタックしたとき相手のデッキを上から10枚破棄 | 部品3 | `lendSelfThisTurn` ＋ BS08-067-e2 と同形の `fieldEvent anySpiritAttacked ownOnly lentOnly subjectFilter:{rarity:"X"} action:{type:"discard",from:"deck",side:"opponent",count:10}` |
| GX08 | メイン：このターンのアタックステップ終了後、コア・ドロー・リフレッシュ・メイン・アタックの各ステップを順に1回ずつ | 部品6・確認1 | 9.3 の部品6 |
| GX11 | メイン：このターンの間、「怪虫」「殻虫」「殻人」の自分のスピリットすべてに【呪撃】を与える | 既存 | `lendSelfThisTurn` ＋ `{kind:"keywordGrant",levels:null,target:"ownAll",lentOnly:true,keyword:"jugeki",familyFilter:["怪虫","殻虫","殻人"]}`（手本 BS08-084-e2・BS06-077-e1。【呪撃】の本体は keyword が持つので効果文の本文を別エントリに書かない） |
| GX12-01 | バースト：ライフ1のとき、お互いのデッキを5枚以下になるよう破棄。この効果発揮後、召喚 | 部品4 | `burst ownLifeDamaged if{count:"ownLife",atMost:1} then sequence[discard from:deck side:own downTo:5, discard from:deck side:opponent downTo:5, settleDerived, summon from:burst]`。形は KF-13-e1 と同じ |
| 〃 | Lv1-2：相手の一切の効果を受けない | 既存・確認3 | `constraint immuneToOpponentEffects levels:[1,2] against:["spirit","magic","brave","nexus","burst"]`（未指定はスピリット/マジックだけ。`shared/rules/constraints.ts` の `hasFullEffectImmunity`・`resistance.ts` 130行がバーストを読む） |
| 〃 | Lv2：フラッシュ：トラッシュの「犬」入りスピリット/ブレイヴ1枚を無償召喚できる | 既存 | `kind:"activated",timing:"flash",levels:[2]`＋`moveCards from:trash count:1 dest:summon optional:true pick:{cardType:["spirit","brave"],nameIncludes:"犬"}`。手本 BS13-026-e1（無コスト版は smoke で確かめる）。`pick.cardType` の配列は GX24 と同じ |
| GX13 | メイン：このターンの間、「天霊」の自分のスピリットが破壊されたとき、ライフが5になるようボイドからコアを置く | 既存 | `lendSelfThisTurn` ＋ `fieldEvent ownSpiritDestroyed lentOnly subjectFilter:{family:"天霊"} action:{type:"placeCores",from:"void",to:"life",count:0,fillTo:5}`（BS12-082-e2・BS09-X35-e2 と同形） |
| GX14 | メイン：次のターンの間、相手はコアステップとドローステップを行えない | 部品5・確認2 | `timedEffect duration:"nextRefresh" content:[{type:"playerRule",rule:{type:"skipSteps",steps:["core","draw"]}}]`（side 省略＝相手。`placePlayerRule`＝timedEffect.ts 約595行）。手本 BS18-054-e4 |
| GX15 | メイン：デッキのブレイヴを「アポロ」入りの自分のスピリットすべてに合体させるだけ選び、直接合体で召喚。その後シャッフル | 部品7・確認6 | `sequence[moveCards{from:"deck",dest:"summon",combineToEach:{nameContains:"アポロ"}}, shuffleDeck]` |
| GX16 | メイン：相手の合体スピリットすべてのブレイヴすべてを破壊、破壊したブレイヴ1つにつき相手のライフのコア1個をボイドへ | 部品8・確認7 | `sequence[destroyBrave{allHosts:true,allBraves:true}, settleDerived, lifeCrush{count:1,countCounter:"lastDestroyedCount",dest:"void"}]`。lifeCrush は BS13-050-e1・BS15-027-e2 |
| GX18 | メイン：このターンの間、「ストライク」入りの自分のスピリットすべてはブロックされない | 既存 | BSC05-026-e1 と同形：`timedEffect content:[{type:"unblockable"}] duration:"turn" all:true side:"own" filter:{nameContains:"ストライク"}`（`all` は rule で置くので後から出たスピリットにも効く＝timedEffect.ts `placeUnblockable`） |
| GX20 | メイン：このゲームの間、「光導」のスピリットが召喚されたとき相手のデッキを上から12枚破棄 | 部品2 | `lendSelfThisGame` ＋ `fieldEvent anySpiritSummoned lentOnly subjectFilter:{family:"光導"} action:{type:"discard",from:"deck",side:"opponent",count:12}`（BS18-064-e1 が anySpiritSummoned の手本。**両陣営のスピリットで発火**し、subjectSide は付けない） |
| GX24 | バースト：ライフ1のとき、手札のスピリットとブレイヴを好きなだけ召喚。その後フラッシュ | 既存 | `burst ownLifeDamaged if{count:"ownLife",atMost:1} then moveCards{from:"hand",dest:"summon",count:"all",upTo:true,pay:"cost",pick:{cardType:["spirit","brave"]}}` ＋ `thenPay:"flash"`。`pay:"cost"` は moveCards.ts 136・168・434行で実在（GX23 の `pay:"cost"` と同じ） |
| 〃 | フラッシュ：ライフ1のとき、ライフが5になるようボイドからコアを置く | 既存 | `magic flash if{count:"ownLife",atMost:1} then placeCores{from:"void",to:"life",count:0,fillTo:5}` |
| KF-02 | Lv1-3：「カーネル」/「ケンタ」入りの自分のスピリット1体につき BP+1000 | 既存 | `aura{type:"bp",target:"self",amountPer:1000,counter:{ownSpiritsMatching:{nameContains:["カーネル","ケンタ"]}}}`（AuraCounter の `ownSpiritsMatching`＝auraCounter.ts。発生源自身も数える＝効果文どおり） |
| KF-07 | Lv1-2『お互いのアタックステップ』：「カーネル」/「ケンタ」入りの自分のスピリットすべて BP+2000 | 既存 | `aura{type:"bp",target:"ownAll",filter:{nameContains:[…]},amount:2000,phaseTurn:{phase:"attack",turn:"both"}}`（BS14-039-e2 と同形） |
| 〃 | Lv2『相手のメインステップ』：相手のスピリットすべての召喚時効果は発揮されない | 既存 | BS04-086-e1 と同形：`triggerSuppression levels:[2] trigger:"onSummon" phase:"main" turn:"opponent"` |
| KF-14 | バースト：召喚／Lv2-3 アタック時：「カーネル」入りがいればBP+5000／Lv3『自分のバースト発動後』：回復 | 既存 | `burst ownLifeDamaged summon from:burst`（BS14-X04-e1）、`onAttack`＋KF-13-e2 と同形の if（BP+5000 は `timedEffect bp 5000 duration:battle target:self`）、`fieldEvent ownBurstActivated levels:[3] selfMode:"source" action:{type:"refresh",target:"self"}`（BS14-X05-e3 が `ownBurstActivated` の手本。self 解決は `selfMode:"source"` を付けて確かめる） |
| KF-15 | Lv1-2 召喚時：トラッシュの「カーネル」入りスピリット1枚を手札へ／Lv2 アタック時：Lv1の相手からブロックされない | 既存 | P039-e1 と同形（`nameIncludes:"カーネル"`）／BS13-058-e1 と同形の `timedEffect target:self duration:battle content:[{type:"unblockable",opponentOnly:true,from:{level:[1]}}]` |
| PB12-03 | Lv1-3 召喚時：このターンの間、スピリットすべてはカード名に「ペンタン」を含むものとして扱う | 部品9 | `triggered onSummon levels:[1,2,3] lendSelfThisTurn`（BS03-058-e1 型）＋ `{kind:"nameAsGrant",levels:null,lentOnly:true,target:"anyAll",nameIncludes:"ペンタン"}`。**`target` に両陣営を足す**（現在 ownAll／self。continuous.ts 500〜532行） |
| 〃 | Lv2-3：「ペンタン」の自分のスピリットは相手によって破壊されたとき手札へ／「ペンタン」の相手のスピリットは自分によって破壊されたとき手札へ | 既存＋部品9 | 前半：`reviveOnDestroy scope:"ownAll" filter:{nameContains:"ペンタン"} when:{byOpponent:true} revived:{toHand:true}`（BS12-068-e2 型）。後半：`scope:"opponentAll"` を足す（部品9。revive.ts 1411〜1421行の走査） |
| PB12-04 | バースト：BP(自分のスピリットの体数×1000)以下の相手1体を破壊。この効果発揮後召喚 | 既存 | `burst ownLifeDamaged sequence[destroy{count:1,filter:{maxBp:0,maxBpPer:{counter:{ownSpirits:{}},amount:1000}}}, settleDerived, summon from:burst]`。`maxBpPer` は actions/filter.ts 232行で実在、counter `ownSpirits:TargetFilter` は effectCounter.ts 69行。**maxBp:0 の足し算が 0 を落とさないか smoke で確かめる**（体数0のとき BP0以下だけが対象＝効果文どおり） |
| PB12-05 | 効果なし | 既存 | `effects:[]`（BS01-001 など270枚が同形） |
| PB13-01 | Lv1-2【呪撃】 | 既存 | `keyword jugeki levels:[1,2]` |
| 〃 | Lv2 アタック時：相手の合体スピリットのコスト4以下のブレイヴ1つを破壊 | 部品8 | `destroyBrave{filter:{cost:{max:4}}}`（destroyBrave に filter が無い） |
| 〃 | 【連鎖：黄】アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のライフへ | 既存 | `triggered keyword:"rensa" trigger:"onLifeDealt" heading:"attack" levels:[2] if{rensa:true,cond:{count:{ownColorSymbols:"yellow"},atLeast:1}} then placeCores void→life`（BS22-026-e1・BS22-060-e1 と同形） |
| PB13-05 | 6コストを支払わなければ配置できない／Lv1 エンドステップ：ゲームの再開始 | 部品10・確認8 | 9.3 の部品10。**最後** |
| X010 | 【転召：歌鳥/ボイド】 | 既存 | `keyword tensho familyFilter:["歌鳥"] dest:"void"`（BS12-007-e1 と同形） |
| 〃 | Lv1-3：[皇帝アンプルール]で転召したとき、手札とトラッシュの「ペンタン」入りスピリットを好きなだけ無償召喚。召喚時効果は発揮されない | 既存 | `fieldEvent ownTensho levels:[1,2,3] nameIncludes:["皇帝アンプルール"] selfMode:"source" action:{type:"summon",from:"hand",alsoFrom:"trash",nameIncludes:"ペンタン",skipOnSummon:true,count:99,upTo:true}`（BS09-X37-e3 が ownTensho の形、P13-25-e1 が `alsoFrom:"trash"`＋`count:99`、BS06-057-e1 が `nameIncludes`＋`skipOnSummon`） |
| 〃 | Lv3 アタック時：「ペンタン」入りの自分のスピリット3体を破壊することで回復 | 既存 | `onAttack levels:[3] pay{cost:{type:"destroy",side:"own",count:3,filter:{nameContains:"ペンタン"}},then:{type:"refresh",target:"self"}}`（BS02-X07-e3 型。count 3 は smoke で確かめる） |
| X015 | コストを支払わなければ召喚できない | 既存 | `summonNeedsCost`（X13-17-e1） |
| 〃 | Lv1-2：アタックと合体ができず、このスピリット以外の一切の効果を受けない | 部品11・確認4 | `cantAttack`＋`cantCombine`（BS01-142-e1・BS11-X02-e1）＋ 部品11 |
| X018 | バースト：ライフ3以下のとき、BP15000以下の相手1体を指定。このターンの間アタックできない。この効果発揮後召喚 | 既存 | `burst ownLifeDamaged if{count:"ownLife",atMost:3} then sequence[timedEffect{content:[{type:"cantAttack"}],duration:"turn",count:1,filter:{maxBp:15000}}, settleDerived, summon from:burst]`（PX17-e2 の cantAttack＋KF-13-e1 の形。side 省略＝相手） |
| 〃 | Lv2-4：「ペンタン」の自分のスピリットがLv2以下の相手とBPを比べるとき、比べずブロックされなかったものとして扱う | 部品12 | `effectGrant levels:[2,3,4] target:"ownAll" nameIncludes:"ペンタン" granted:{trigger:"onAttack",action:{type:"treatAsUnblocked",when:{blockerMaxLevel:2}}}`（BS19-X05-e3 と同形。`when` に Lv の上限を足す） |
| アマテラス（BS55-XX01） | Lv1：あらゆる効果を受けない | 部品11・確認4 | 同上 |
| 〃 | 合体できない。BPはこのスピリット上のコア×10000 | 既存 | `cantCombine`＋`aura{type:"bp",target:"self",amountPer:10000,counter:"selfCores"}`（levels の bp は 0。`selfCores` の手本 BS13-020 ブッシュベイベ。auraCounter.ts の `selfCores`） |
| 〃 | Lv1 召喚時：このスピリット以外のスピリットすべてを破壊 | 既存 | `onSummon destroy{count:1,all:true,anySide:true,filter:{excludeSelf:true}}`（BS05-070-e2 が all＋anySide、`excludeSelf` は BS15-045-e2 の subjectFilter で実在。**自分のスピリットも壊す**ので両陣営で確かめる） |

### 9.3 新部品の一覧

原則1の確認：どれも既存の器の組み合わせで書けるかを、効果文の grep（9.1 の前例）と型で確かめたうえで残ったもの。

| # | 部品 | 足す場所 | 組み合わせで書けない理由 | 使うカード |
| :-- | :-- | :-- | :-- | :-- |
| 1 | `removeDeckFromGame`（自分のデッキすべてをゲームから取り除く） | `types/effectAction.ts`（`shuffleDeck` の隣）、`logic/actions/` に概念ごとの新ファイル（`deckZone.ts`）か `drawDiscard.ts`、`PlayerState.removedCards: string[]`（`types/playerState.ts`・`shared/board.ts`・`GameState.ts` 781行のコピー・`type.ts` 374行のビュー） | `moveCards` の dest は手札/デッキ/トラッシュ等でゲーム外が無く、`moveCards from:deck` は選ぶ動作で「全部」に向かない。「ゲームから除外」を扱う既存カードが無い（grep 空） | GX01 |
| 2 | `lendSelfThisGame`＋`PlayerState.gameVirtualInstances` | `grant.ts` の `pushVirtualSource`（`scope:"game"` を足す。`lendSelfThisBattle` と同形で、積む先が違うだけ）、`level.ts` `effectSources`（256行）と 295・317行、`board.ts` 40行、`GameState.ts` 193・782行、`playerState.ts` 59行、`type.ts` 375行。**どこでも消さない**（`PhaseManager` 462・470行と `GameState.ts` 540行の消去には足さない）。`debugBoard.ts` 144行だけ空にする | `TimedContent` に fieldEvent が無く、`timedEffect` の duration に game が無い。貸与（`lendSelfThisTurn`）は turnVirtualInstances がターン終了で消える | GX05・GX20 |
| 3 | フィルタの軸 `rarity: string` | `types/targetFilter.ts`（`nameContains` の隣。`validate-cards` の軸一覧はこの型から自動で読む）、`shared/rules/targetFilter.ts` の `matchesTarget`（141行付近。`card(inst.cardId).rarity.split(",").includes(filter.rarity)`＝"X,PX" も X に当たる） | `targetFilter` にレアリティを読む軸が無い（`CardData.rarity` は type.ts 234行にある） | GX07 |
| 4 | `discard from:"deck"` に `downTo:number`（デッキがその枚数以下になるまで） | `types/effectAction.ts` 90行の定義、`logic/actions/mill.ts` の `discardFromDeck`（`count` を `max(0, deck.length-downTo)` に解く。上限枚数・【強化】は `side:"opponent"` の count≥1 にだけ乗る＝`deckDiscardKyokaCount`） | `count` は固定数かカウンタで、デッキの現在枚数を読む EffectCounter が無い。hand の `downTo` と同じ意味の語を deck にも通す | GX12-01 |
| 5 | `PlayerRuleDef` に `{type:"skipSteps";steps:("core"|"draw")[]}`（寿命 nextRefresh） | `type.ts` の PlayerRuleDef（skipMainStep の隣・325行）、`logic/actions/timedEffect.ts` の許可リスト（597行・1093行の `skipMainStep` 限定を広げる）、`PhaseManager.turnStartSegments` の core②（コア置き。133行付近）と draw②（ドロー。183行付近）で `timedPlayerRules(state,pid)` を読んで飛ばす。**消費はしない**（リフレッシュステップが `consumeNextRefreshRecords` で使い切る） | `skipMainStep`（BS18-054-e4）はメイン専用、`skipDrawStep` は「ドローしないことで」の支払い用でコアステップを止める器が無い。コアとドローを別々の部品にせず `steps` 配列で1つにまとめた | GX14 |
| 6 | 追加ターン：`extraTurnSteps` アクション＋`GameState.extraTurnAfterAttackPending` | `types/effectAction.ts`（`extraAttackStep` 154行の隣）、`logic/actions/battleFlow.ts` の `extraAttackStepHandler`（187行）をまねてフラグを立てる（自分のターンでなければ不発・立っていれば何もしない）、`PhaseManager.endTurn` の BS15-X04 の枠（`state.phase==="attack" && !state.extraStepAfterAttackUsed`。351行）の**前**に「フラグがあれば消して `driveTurnStart(state, 1, MAIN_SEGMENT)` を呼んで return」を足す（区間1〜6＝コア・ドロー・リフレッシュ・メイン。区間番号は `turnStartSegments`）。**`runExtraStep` は使わない**（`extraMainStep` を立てるのでメイン後に追加のアタックへ進めない）。追加メインを普通のメインとして扱い、「アタックステップへ」で `toAttackPhase` → もう一度アタック→エンドの流れに戻る。ターン終了の消去（522行付近の `delete`）にフラグを足す。先攻1ターン目はアタックステップが無い（`toAttackPhase` が止める）のでフラグは使われずに消える | `extraAttackStep`（BS10-008・PX18）はアタックとエンドの追加だけ。コア〜メインを順に走らせる処理が `runExtraStep`（1ステップだけ・メイン後はアタックへ進めない）以外に無い | GX08 |
| 7 | `moveCards` の `combineToEach:{filter}`（デッキのブレイヴを、フィルタに合う自分のスピリットそれぞれに1枚ずつ直接合体で召喚） | `types/effectAction.ts` 220行の moveCards、`logic/actions/moveCards.ts`（`sendOne` 150行の `hostId`＝`braveTargetInstanceId` と `combineIndex` の再開が手本。2段目で入った「召喚したブレイヴの合体先の選択」）。ホストごとにブレイヴ1枚を（使用者が）選び、**全員ぶん決めてから同時に召喚**（`surchargeBatch`／`summonBatchFlush` 系。ユーザー決定：同時に全員）。合体条件を満たさないブレイヴはそのホストの候補から外す（`braveCombineCandidates`） | `count`＋`combineIndex` は「選んだ1枚の合体先を選ぶ」で、「各ホストに別のブレイヴ1枚ずつ」の割り当てが無い（手本無し）。**判断が残る＝Sonnet** | GX15 |
| 8 | `destroyBrave` に `allBraves?:true`（`allHosts` と併用で各ホストのブレイヴすべて）・`filter?:TargetFilter`（ブレイヴの絞り込み）、破壊数の記録 | `types/effectAction.ts` 181行、`logic/actions/battleFlow.ts` の `destroyBraveHandler`（1043行。`allHosts` は `affectableBraves(...)[0]` の1つだけ取っている）、`logic/braveTargetGate.ts` の `affectableBraves`（16行。第5引数 `braves` を filter で絞る）、`logic/brave.ts` の `destroyCombinedBraves`（151行）で `passed.length` を `recordDestroyedCount`（`logic/record.ts` 72行）に書く（**【破壊されない】等で弾かれた分は数えない**） | `allHosts` は1ホスト1つだけ。ブレイヴの絞り込み欄が無い。破壊数は `lastDestroyedCount`（`destroy` だけが書く）にブレイヴ破壊が書かない | GX16・PB13-01 |
| 9 | `nameAsGrant.target:"anyAll"`（両陣営のスピリット）・`reviveOnDestroy.scope:"opponentAll"`（発生源の持ち主の相手のスピリットが破壊されるとき） | `types/effectDefContinuous.ts` 544行・`types/effectDefTrigger.ts` 327行、`logic/state/continuous.ts` 500〜532行（`player.field.spirits` を両陣営に回す）、`logic/revive.ts` 1411〜1421行（`effectSources(state, opponentOf(ownerPid))` も走査し、`entryActive` に発生源側の pid を渡す。`when.byOpponent` は復活する側から見た相手＝発生源の持ち主なので条件はそのまま通る） | 既存の2つは自分側（ownAll／self）しか持たない。1文が「自分のスピリットは〜／相手のスピリットは〜」の両側を指す | PB12-03 |
| 10 | ロロ：①`summonNeedsCost` をネクサスの配置へ広げる（確認8）②ゲーム再開始アクション `restartGame` ③「ゲーム中に1回」の記録 | ①`RuleValidator.validateSetNexus`（449行）と効果による配置の入口。②全カード（フィールド・手札・トラッシュ・バースト・ブレイヴ・手元）をデッキへ戻しシャッフル、ライフ以外のコアをボイドへ、ボイドから6個をリザーブへ、手札2枚、先攻をジャンケン（ランダム）で決め、`state.turn=1` に戻す（先攻1ターン目はコアステップ・アタックステップなし＝既存の `turn===1` 判定が使える）、`state.timedEffects`・`turnVirtualInstances` 等の一時状態を消す。③`GameState.restartUsed`。条件（6色のスピリットが1体ずつ）は `if` の入れ子6つ（`{count:{ownSpirits:{color:"red"}},atLeast:1}`）で書ける＝新部品なし | ゲームの手順そのものを置き換える処理で、既存のどの action にも無い（`GameState.ts` の初期化 `createInitialState` 相当を部分的に呼ぶ形になる） | PB13-05 |
| 11 | 「一切／あらゆる効果を受けない」：`constraint immuneToAllEffects{exceptSelf?:true}` | `types/constraintDef.ts`（`immuneToOpponentEffects` の隣・24行）、`shared/rules/resistance.ts` の `boardResistanceAgainst`（78行。「ここから下は相手の効果限定」の**前**に置く）、`EffectAttempt` に `sourceInstanceId?` を足し（`exceptSelf` の判定用）、`continuousEffectReaches`（217行。`source.pid === targetPid → true` の近道が自分の継続効果を通してしまうので、自分のほかの発生源の継続効果を止める分岐を足す。`source` に `instanceId` を渡す）。呼び出しは約70か所だが**入口は `boardResistanceAgainst` の1か所**（resistance.ts 冒頭の方針） | `immuneToOpponentEffects` は相手の効果だけ（`actorPid===targetOwnerPid` で通す）。`immune`（timedContent）も相手のカード限定で against を絞る形。自分の効果・自分の継続効果まで止める器が無い | X015・アマテラス |
| 12 | `treatAsUnblocked.when:{blockerMaxLevel:number}` | `types/effectAction.ts` 132行、`type.ts` 272行（battle.treatAsUnblocked）、`logic/battleResolve.ts` 429〜441行の判定、`logic/actions/battleFlow.ts` 1731行（ラベル）・1738行（stored へ写す） | `when` は blockerLevel1（Lv1固定）・blockerMaxBp・levelAtLeastBlocker・blockerBpBelowSelf だけで、Lv2以下を表せない（`blockerLevel1` の一般化） | X018 |

### 9.4 ユーザーに確認すべき解釈（8件）

| # | カード | 私はこう読みました | 割れる点 | 影響 |
| :-- | :-- | :-- | :-- | :-- |
| 1 | GX08 | アタックステップが終わった直後（エンドステップ・第2メインの前）に、コア→ドロー→リフレッシュ→メインを順に行い、メインの後でアタックステップをもう1回行う。そのあと従来どおり第2メイン→エンド。追加のメイン中は普通のメインで、マジックも使える | 第2メインを追加ステップの前に行うのか／追加のメインの終わりでアタックを飛ばせるか（飛ばせない読み） | GX08の1枚 |
| 2 | GX14 | 「コアステップ／ドローステップを行えない」＝コアを置く・ドローするだけを行わず、ステップ開始・終了時の誘発は発揮される（既存の「コアを置かない」「ドローしない」の処理と同じ扱い） | ステップごと行わず誘発も出ない読み | GX14と、コア・ドローステップに誘発を持つスピリット/ネクサス |
| 3 | GX12-01 | 「相手の一切の効果を受けない」＝相手のスピリット・マジック・ブレイヴ・ネクサス・バーストすべて（`against` 5種を並べる）。既存の「相手の効果を受けない」（スピリット/マジックだけ）より広い | 既存と同じ範囲でよいか | GX12-01の1枚 |
| 4 | X015・アマテラス | 「このスピリット以外の一切の効果を受けない」（X015）は、自分のマジック・自分のほかのスピリットの継続効果（BP+など）・自分の誘発も受けない。自分自身の効果は通る。アマテラスの「あらゆる効果を受けない」は自分自身の効果も含めて受けない（ただしBPの継続効果は自身の定義なので通す）。**アマテラスの手札・デッキ・トラッシュにあるときの Q&A（Q8743〜Q8756：効果で召喚できない・手札に戻せない・デッキからオープンされたら破棄 等）は実装せず `card-notes` に載せる**（26系の【Uトリガー】【超装甲】【天照界放】に依存するものを含む）。**staging の効果文には Wiki にある先頭の「このカードは一切の効果を受けない。」が無い**ので、入れるか | Q&Aの範囲／自分の効果まで止めてよいか／先頭の1文を足すか | X015・アマテラスの2枚 |
| 5 | GX07 | 「Xレア」＝レアリティ欄が X（"X,PX" のような複数表記は X を含めば該当） | PXなど別のレアリティを含めない読み | GX07の1枚 |
| 6 | GX15 | 「アポロ」入りの自分のスピリットすべてに、デッキのブレイヴを1枚ずつ（別のカード）、合体条件を満たすものだけ、使用者が選んで同時に直接合体で召喚。ホストの数よりブレイヴが少なければ、選べた分だけ（「合体させるだけ」）。選ばずに終えることも可 | 同名ブレイヴを複数ホストに使ってよいか（デッキに同名が複数あれば別カード扱い） | GX15の1枚 |
| 7 | GX16 | 「破壊したブレイヴ1つにつき」は**実際に破壊できた数**（効果を受けない・破壊されないブレイヴは数えない）。ライフが0になれば勝敗が決まる | 指定した数で数える読み | GX16の1枚 |
| 8 | PB13-05 | 「6コストを支払わなければ配置できない」＝`summonNeedsCost`（1コスト以上の支払いが要る。軽減で0になる・無償の配置は不可）と同じ扱い。ネクサスへの対応は新しく足す | 「ちょうど6支払う（軽減不可）」と読むか。軽減シンボルの無いネクサスなので差が出るのは軽減・コスト変更の効果だけ | PB13-05の1枚 |

### 9.5 バッチ案（実装役1体あたり新部品2〜3個。上から順）

| バッチ | 内容 | 担当 | 対象カード |
| :-- | :-- | :-- | :-- |
| 3a データのみ（部品なし） | 9.2 の「既存」の行：GX03・04・11・13・18・24、KF-02・07・14・15、PB12-04・05、PB13-01（呪撃と連鎖）、X010、X015の cantAttack/cantCombine/summonNeedsCost、X018-e1、GX12-01（バースト除く）。**使用者の名前制限（§4）も同時に**。`lendSelfThisTurn` の形は 9.1。part1017 以降で期待値役が先に場面テスト | Haiku（形を貼る）／期待値役は Sonnet | 上記17枚 |
| 3b | 部品2（ゲームの間の貸与）・3（rarity）・1（ゲームから除外） | Sonnet 1体 | GX05・07・20・01 |
| 3c | 部品4（デッキ downTo）・12（treatAsUnblocked の Lv 上限）・9（両陣営の名前扱い・相手の復活） | Sonnet 1体 | GX12-01・X018・PB12-03 |
| 3d | 部品8（destroyBrave の全ブレイヴ・filter・数の記録） | Haiku でも可（場所と形が確定。smoke の場面は期待値役） | GX16・PB13-01 Lv2 |
| 3e | 部品5（ステップを止める rule）・6（追加ターン） | Sonnet 1体（PhaseManager の再開フレームをまたぐ。確認1・2の答えが先） | GX14・GX08 |
| 3f | 部品11（全効果耐性）＋アマテラス・X015 のデータ | Sonnet 1体（確認4の答えが先。`resistance.ts` の呼び出し元を表にして、戻すと落ちる smoke を書く） | X015・アマテラス |
| 3g | 部品7（各ホストへの同時直接合体） | Sonnet 1体（判断が残る。確認6が先） | GX15 |
| 4 | 部品10（ロロ） | Sonnet（最後。確認8が先） | PB13-05 |

注：バッチ 3a のうち GX12-01 の Lv1-2 耐性は確認3の答え待ち、GX24 は `moveCards pay:"cost"` の手札からの召喚で2段目の決定（フィールドのコアにも広げる）が入っていることが前提（HANDOFF §1 の 0）。

### 9.6 ユーザーの答え（2026-11-20）

- GX08：旧カードの対戦に第2メインステップは無い（PhaseManager に既に決定あり）。アタックステップ終了後にコア→ドロー→リフレッシュ→メイン→アタックを1回ずつ行い、そのあとエンドステップ
- GX14：「行えない」ステップは行わない＝そのステップの誘発も発揮されない
- GX07：「Xレア」＝X・PX・XX（「X,PX」のような複数表記は区切って照らす）。EX・GX は含めない（2026-11-20 ユーザー決定）
- X015・PB13-05「コストを支払わなければ召喚／配置できない」：軽減でコスト0になっても0コストを支払ったことになる（召喚・配置できる）。できないのは「コストを支払わずに」と書かれた効果で召喚・配置すること。既存の `summonNeedsCost`（「1コスト以上支払わなければ」。BS23-X07・X13-17。Q20363・Q20364）とは別の読みなので、X015 には使わない
- アマテラス：ユーザー案「自分・相手どちらのスピリットでもない扱いにし、出したプレイヤーが操作できる」＝どの効果（自分のものも）も届かない。**ただし「自分のスピリット1体につき」「自分のスピリットがいるとき」などを数えるときは自分のスピリットとして数える**（2026-11-20）。実装は場の持ち主側に置いたまま、効果の届く判定の入口（resistance.ts）で止める。自身の BP（コア数×10000）は自身の定義なので通す
- バーストの「召喚する」はすべて無償（上の §0 の訂正）
- 指定アタック＋【暴風】：【暴風】はブロックが確定したときに発揮し、その時点で指定されたスピリットはブロックして疲労している。疲労させるのはそれ以外のスピリット（いまのエンジンの挙動どおり）
- 「その後コストを支払うことで」のフラッシュが何もできないときも、対戦者には払う選択肢を出してよい。AI は払わない
- GX12-01 のデッキ downTo に【強化】は乗らない
- 部品 #11 は1つの器 `immuneToEffects { from: "opponent" | "own" | "any"; exceptSelf?: true; against? }` にする（X015＝any＋exceptSelf、アマテラス＝any、味方から＝own）。既存の `immuneToOpponentEffects`（17枚）は `from:"opponent"` へ移す（2026-11-20 ユーザー決定。判定は resistance.ts の1か所）
- 「〜することで」の支払い（効果のコスト）に、immuneToEffects（own/any）を持つスピリットのコアは使えない。召喚コストの支払いは効果ではないので使える（2026-11-20）
- GX08：追加のリフレッシュステップで「次のリフレッシュステップまで」の効果は終わる。BS15-X04 の追加ステップは追加のアタックステップの後にも起きる（2026-11-20）
- ロロの再開：ゲームから取り除いたカードは戻さない。「このターンの間」「このゲームの間」の期間つき効果はすべて消える。「ゲーム中1回」の記録は残る（2026-11-20）

