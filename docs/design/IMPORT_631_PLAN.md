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
