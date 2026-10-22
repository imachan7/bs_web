# BS18 調査メモ：赤・紫（調査役）

対象：`data/staging/BS18.json` のうち 33 枚（BS18-001〜018、055・056・061〜064・073〜076、X01・X02、X012A・X021・X022）。**実装はしていない**（このメモのみ）。
色は staging の `colors` が空のため、番号の範囲で振り分けた（赤 001〜009 ほか、紫 010〜018 ほか）。
**BS18-007・010 は効果文が空（バニラ）**なので節数に入れていない。X012A は X012R（BS14 取り込み済み）と効果文が同一。

## 1. 集計

節は「Lv 見出し単位＋キーワード単独行＋バースト単独ブロック」で数え、1ブロックに既存と新規が混ざるものは 2 行に割った。

| 区分 | 行数 |
| :-- | --: |
| 全体 | 61 |
| 既存の器で書ける | 39 |
| 新しい部品が要る | 22 |

新しい部品の候補（17 種。番号は §3 の表で参照）:

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | 「お互いのデッキは破棄されない」（globalConstraint の型） | 既存は `noDeckMillByOpponent`（持ち主だけ・相手の効果だけ）と `noDeckMillInMain`（両陣営だが**メインステップ限定**）のみ。両陣営・ステップ不問が無い | 002・003・005・013・015（5 枚） |
| N2 | `opponentCorePlaced` に「ボイドから置かれた」「発生源がスピリット」の軸（条件の軸） | 現状は出所を問わず、色（`sourceColorFilter`）でしか発生源を絞れない | 001・013 |
| N3 | 「その効果を発揮したスピリット」「増えたコア」を指す参照（対象の取り方） | `currentEffectSource` は pid・種別・色しか持たず、個体 ID が無い。増えたコアの置き場も記録されない | 001（破壊）・013（コアすべてをボイドへ） |
| N4 | `canDirectAttack` の targetFilter に「『召喚時』効果を持つ」（軸） | targetFilter は rested/singleCore/recovered/any のみ。`TargetFilter.hasTrigger` は別型で、ここでは読まれない | 003 |
| N5 | `TargetFilter` に「発生源のスピリットと同じ Lv」（軸） | `sameLevelAsBattleLoser` はバトル敗者との比較のみ。`onBlocked` の `targetSameLevelAsSelf` は条件側で、`destroy` の filter では使えない | 006 |
| N6 | `ownSpiritBattleEnded` に `familyFilter`（軸）＋実カードでの裏取り | イベントは型とエンジンにあるが `data/cards` に使用 0 件。familyFilter は別イベント限定の記述 | 006 |
| N7 | `placeCores` の「自分の他スピリットのコアを自分（このスピリット）へ」（`from:"field"` → `to:"spirit"`） | `from:"field"` の実カードは `to:"life"` の 1 枚のみ。`moveCoresLeavingOne` は「1個残して他へ」で別 | 008 |
| N8 | `onBlocked` の条件に `targetMinCost`（軸） | 条件側は `targetMaxCost` だけ。`canDirectAttack` の `targetMinCost` は別の器 | 009 |
| N9 | 「疲労するとき、コストを払って疲労しない」（置換の型） | `exhaustImmunityGrant` は払わず常に防ぐ。色・発生源種別・「疲労する1体につき払う」を持たない | 014 |
| N10 | 条件ユニオンに `ownHandAtLeast`（`reviveOnDestroy.condition` と `fieldEvent.condition`） | 両方の condition に無い（`step`・`triggered`・`burst` には既存） | 015・063 |
| N11 | 「セット中のバーストを条件無視で発動する」（アクション） | `moveCards dest:activateBurst` は公開（revealOpen）したカードを `burstEvent` で絞って発動する形（BS16-X01）。条件を無視する指定が無く、発動しなかったときの戻し先が deckBottom 前提 | 016 |
| N12 | `TargetFilter.color` を配列（OR）に（軸） | `TargetFilter.color` は単色。`CardPick.color` は配列可。「赤/紫」を 1 つの filter で書けない | 018 |
| N13 | `coreGainCap` を両陣営・`max:0` で書けるように（軸） | 現状は「発生源の持ち主の**相手**」だけに掛かる | 063 |
| N14 | イベント「相手のスピリットが召喚されたとき」（fieldEvent） | `ownSpiritSummoned` は自分側のみ。`opponentSummonEffectResolved` は召喚時効果の解決後で別物 | 064 |
| N15 | 「バースト転召」（バースト内の転召） | `summonBurstCardFree` に tensho の指定が無い。転召の対象選択・コア移動・誘発（`ownTensho`）との関係が未定 | X01 |
| N16 | `placeCores` の `from` を「フィールド/リザーブ」の和集合に（軸） | `from` は単一値。`fillTo`（BS09-X35・BS16-045）は `from:"reserve"`/`void` で実績あり | X01 |
| N17 | ライフのコアを自分のスピリットへ置く（`removeCores` の `to:"spirit"`） | `removeCores.to` は reserve/trash/void/life のみ。`from:["life"]` は BS16-008 で実績ありだが行き先がボイド | X01 |

## 2. 確認事項

1. **「ボイドからコアが増える」の範囲**（BS18-001・013・063）
   → 私はこう読みました：「増える」はボイドからリザーブ／スピリット／ネクサス上に置かれることで、**ライフへ置く（聖命など）は含めない**。063「ボイドからコアを増やすことができない」も同じ範囲で、ライフには置ける。013 の「増えたコア」は、その効果で置かれたコアそのもの（置き場がリザーブでもスピリット上でも）。
   → 確認したい：ライフを含めるか。BS17-063 の `coreGainCap` は life を含む定義なので、063 だけ含める読みもありえる。

2. **「お互いのデッキは破棄されない」が止める範囲**（002・003・005・013・015、波及：014・064・X021）
   → 私はこう読みました：BS14-085 の `noDeckMillInMain` と同じく、**陣営を問わず、自分の効果・コスト支払いによる破棄も止める**。ただしデッキから公開して「残ったカードは破棄する」（X021）の公開中カードはデッキの外なので止めない。
   → 確認したい：014 の「デッキの上から 1 枚をトラッシュに置くことで」や 064 の「デッキの上から 3 枚をトラッシュに置くことができる」も、これらが場にいる間は払えない／置けないでよいか。

3. **BS18-014 冥司書ダンタリアン**「疲労するスピリット 1 体につき、デッキの上から 1 枚をトラッシュに置くことで、そのスピリットは疲労しない」
   → 私はこう読みました：疲労する紫スピリットが複数いるとき、**1 体ごとに払うかどうかを別々に決められる**（払った体だけ疲労しない）。デッキが足りなければ払えない体は疲労する。
   → 確認したい：1 体ずつ選べるか、全員まとめて払うか払わないかか。

4. **BS18-016 闇王妃グネヴィア**「自分の紫のバーストを、バースト条件を無視して発動できる」
   → 私はこう読みました：相手のエンドステップの開始時に判定し、このターン相手が 1 回もアタックしていなければ、セット中の紫のバーストを**発動するか選べる**（任意）。きっかけに依存する効果（例：「破壊されたスピリット」を参照する効果）は、きっかけが無いので対象なしで不発になる。
   → 確認したい：きっかけに依存するバーストを無理に発動した場合の扱い。紫バーストは多いので影響が広い。発動しなかったバーストはセットされたままでよいか。

5. **BS18-X01 超覇王ロード・ドラゴン・セイバー**【バースト転召】
   → 私はこう読みました：バースト効果として「系統：覇皇のスピリット 1 体のコアすべてをボイドに置く」を転召のコストとして払い、**【転召】したものとして**（`ownTensho` 系の誘発・転召の対象のスピリットの効果発揮・対象の消滅を通常の【転召】と同じ手順で）このカードを無償で召喚する。その後「ライフが 5 になるまで、フィールド/リザーブから好きなだけコアを置く」は、置ける分だけ（足りなければ 5 未満で止まる）。
   → 確認したい：通常の【転召】と同じ手順に乗せるか、単に「コストを払って無償召喚」とするか。前者なら N15 は転召の経路をバーストから呼ぶ部品になり、後者なら `pay`＋`summonBurstCardFree` に「1体のコアすべてを取り除く」コストを足すだけで済む。

6. **BS18-006 ガンナー・ドラゴン** Lv1-3「系統：『戦竜』を持つ自分のスピリットのバトル終了時」
   → 私はこう読みました：既存の `ownSpiritBattleEnded` と同じく、**バトル終了時に場に残っている戦竜だけ**が対象（バトルで破壊された戦竜には発動しない）。
   → 確認したい：破壊された戦竜のバトル終了時にも発動させるか。

7. **BS18-003 アサシン・ドラゴン** Lv2-3「『このスピリットの召喚時』効果を持つ相手のスピリット 1 体を指定し」
   → 私はこう読みました：**現在の Lv で有効な**召喚時効果（Lv 見出しの範囲内）を持つスピリット。効果を失っているスピリットや、付与された召喚時効果は数えない。
   → 確認したい：現在 Lv で絞るか、カードに書かれていれば Lv 不問か。

## 3. 対応表

記号：「既」＝既存の器で書ける、「新」＝新しい部品が要る。根拠カードは同じ書き方が `data/cards` にあるもの。

### BS18-001 テリジーノ（赤・spirit・コスト 1）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-2『相手のメインステップ』ボイドからコアが増えたとき、このスピリットを疲労させることで、その効果を発揮したスピリット 1 体を破壊 | 新 | `fieldEvent opponentCorePlaced`（SD01-029）＋`pay exhaustSelf`＋`destroy`。足りないのは N2（ボイド由来・スピリットの効果）と N3（発生源スピリットを破壊対象にする） |

### BS18-002 守獣シシンガ（赤・spirit・コスト 2）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3 お互いのデッキは破棄されない | 新 | N1 |
| Lv1-3 自分のスピリットが 1 体の間、Lv3 として扱う | 既 | `levelAs target:self treatAs:3 condition:{maxOwnSpirits:1}`（BS02-002 は 2 体） |

### BS18-003 アサシン・ドラゴン（赤・spirit・コスト 3）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3 お互いのデッキは破棄されない | 新 | N1 |
| Lv1-3『アタック時』BP+3000 | 既 | `triggered onAttack`＋`timedEffect bp 3000 duration:battle target:self`（BS12-008-e2） |
| Lv2-3『アタック時』『召喚時』効果を持つ相手のスピリット 1 体を指定してアタック | 新 | `constraint canDirectAttack`（BS01-037 など）。足りないのは N4（確認事項 7） |

### BS18-004 バサ・ラザン（赤・spirit・コスト 3）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1-3『自分のアタックステップ』系統「皇獣」1 体につき BP+1000 | 既 | `aura bp target:self amountPer:1000 counter:{ownFamily:"皇獣"} phaseTurn:{phase:"attack",turn:"own"}`（BS02-070 の型＋BS01-021 の ownFamily） |

### BS18-005 護獣シシンギニ（赤・spirit・コスト 4）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3 お互いのデッキは破棄されない | 新 | N1 |
| Lv1-3 自分のスピリットが 2 体以下の間 Lv3 扱い | 既 | `levelAs … maxOwnSpirits:2`（BS02-002 と同一） |

### BS18-006 ガンナー・ドラゴン（赤・spirit・コスト 5）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3『自分のアタックステップ』戦竜のバトル終了時、バーストが無ければ手札のバースト持ち 1 枚をセットできる | 新 | `fieldEvent`＋`condition:{ownBurstSet:false}`＋`setBurstFromHand ask:true`（BS14-X04-e2・BS17-005）。足りないのは N6（確認事項 6） |
| Lv2-3『アタック時』バースト 1 つを破棄することで、このスピリットと同じ Lv の相手のスピリット 1 体を破壊 | 新 | `pay discardBurst`（BS14-015）＋`destroy`。足りないのは N5 |

### BS18-007 ヤクシャモリ（赤・spirit・コスト 5）

効果文なし（バニラ）。節 0。

### BS18-008 モンク・ドラゴン（赤・spirit・コスト 6）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3『自分のバースト発動後』このスピリットは回復する | 既 | `fieldEvent ownBurstActivated selfMode:"source" refreshSelf`（BS16-X01-e3） |
| 同ブロック「さらに、自分のスピリットのコア 1 個を、このスピリットに置くことができる」 | 新 | `placeCores`（optional）。足りないのは N7 |

### BS18-009 炎の覇獣ハヌ・マーグ（赤・spirit・コスト 7）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| 【バースト：相手の『このスピリット/ブレイヴの召喚時』発揮後】このスピリットカードを召喚する | 既 | `burst event:opponentSummonEffectResolved action:summonBurstCardFree`（BS17-005-e1） |
| Lv1-2『召喚時』BP4000 以下の相手のスピリット 2 体を破壊 | 既 | `destroy count:2 filter:{maxBp:4000}`（BS14-010 と同文） |
| Lv2『アタック時』コスト 7 以上の相手にブロックされたとき、相手のライフのコア 1 個を相手のリザーブに置く | 新 | `triggered onBlocked eventTarget:"use"`（BS06-X21 の `targetMaxCost` 形）＋`lifeCrush count:1`。足りないのは N8 |

### BS18-010 キャメロット・ポーン（紫・spirit・コスト 0）

効果文なし（バニラ）。節 0。

### BS18-011 ゾンビ・スネーク（紫・spirit・コスト 2）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1-3『破壊時』系統「古竜」を持つ相手のスピリット 1 体を破壊 | 既 | `triggered onDestroy`＋`destroy count:1 filter:{family:"古竜"}`（BS16-054-e2 の filter 形） |

### BS18-012 闇騎士ラモラック（紫・spirit・コスト 3）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1-2『召喚時』手札 2 枚までを破棄することで、破棄 1 枚につき相手のスピリット 1 体のコア 1 個を相手のトラッシュに置く | 既 | `pay{cost:moveCards hand→trash count:2 upTo}`（BS04-022）＋`then removeCores to:trash count:1 countCounter:"lastMoved"`（BS15-076）。同じスピリットに重ねてよい（CONJUNCTION.md の BS04-094・BS15-076 の行） |

### BS18-013 ドン・ディエゴッド（紫・spirit・コスト 3）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3 お互いのデッキは破棄されない | 新 | N1 |
| Lv1-3『お互いのメインステップ』スピリットの効果でボイドからコアが増えたとき、増えたコアすべてをボイドに置く。さらに、その効果を発揮したスピリットのコアすべてをボイドに置く | 新 | `fieldEvent opponentCorePlaced` の両陣営版（持ち主側も見る）＋`removeCores to:void`。足りないのは N2・N3（確認事項 1）。「さらに」は同時（CONJUNCTION.md）なので `simultaneous` か、増えたコアの確定を先にして 2 つの `removeCores` を並べる形 |

### BS18-014 冥司書ダンタリアン（紫・spirit・コスト 4）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3 紫の自分のスピリットが相手のスピリット/ブレイヴの効果で疲労するとき、疲労する 1 体につきデッキの上 1 枚をトラッシュに置くことで疲労しない | 新 | 払うコストは `mill side:"own"`（型の注釈。BS03-073 は相手側の mill）。足りないのは N9（確認事項 2・3）。`exhaustImmunityGrant`（BS12-012）では払う手順と体ごとの判断が書けない |

### BS18-015 タワーミンゴ（紫・spirit・コスト 5）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-2 お互いのデッキは破棄されない | 新 | N1 |
| Lv1-2【呪撃】『アタック時』ブロックした相手のスピリット 1 体をバトル終了時に破壊 | 既 | `keyword jugeki levels:[1,2]`（BS02-015） |
| Lv2『破壊時』自分の手札が 5 枚以上のとき、疲労状態で残る | 新 | `reviveOnDestroy scope:self revived:{rested:true}`（BS16-X02-e2）。足りないのは N10 |

### BS18-016 闇王妃グネヴィア（紫・spirit・コスト 6）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-2『相手のエンドステップ』このターン相手が 1 回もアタックしていなかったら、自分の紫のバーストを、条件を無視して発動できる | 新 | `step`＋`condition:{noAttacksThisTurn:true}`（BS16-X04-e2）は既存。足りないのは N11（確認事項 4） |

### BS18-017 闇騎士パーシヴァル（紫・spirit・コスト 6）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| 【不死：コスト 3/4】『お互いのアタックステップ』 | 既 | 【不死】（BS16-016 が同じ「コスト 3/4」） |
| Lv2 カード名に「闇騎士」と入っている自分のスピリットが相手によって破壊されたとき、相手のスピリット 1 体を疲労させる | 既 | `fieldEvent ownSpiritDestroyed byOpponentOnly:true nameIncludes:["闇騎士"]`＋`exhaust count:1`（`byOpponentOnly` は BS12-005、`nameIncludes` は BS17-063-e2 が単独で実績。同一エントリでの併用の実カードは無い） |

### BS18-018 冥怪傑ゾロ（紫・spirit・コスト 12）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】コスト 5 以上の自分の赤/紫のスピリット 1 体をデッキの下に戻すことで、このスピリットカードを召喚する | 新 | `burst event:ownLifeDamaged action:pay{cost:returnToDeckBottom side:"own" filter:{cost:{min:5}}, then:summonBurstCardFree}`（BS04-104 の `returnToDeckBottom` コスト、BS17-016 の pay 形）。足りないのは N12。代案は `choose` で赤・紫の 2 択に割る（コスト支払いの選択が増えるので非推奨） |
| Lv1-3『召喚時』バースト効果で召喚されたとき、このスピリット以外のスピリットすべてのコア 1 個ずつをリザーブへ。0 個になった 1 体につきボイドからコア 1 個をこのスピリットへ | 既 | `triggered onSummon burstSummonOnly:true`（BS17-044-e2）＋`coreDrainAllOthers`（BS01-X02・BS10-X02。消滅した体数ぶん self へ置く挙動が型の注釈どおり）。1 枚専用の複合 type だが、既存 2 枚で使用済み |

### BS18-055 ドレイク・バヤー（赤・brave・コスト 4）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1『ブレイヴの召喚時』トラッシュの系統「雄将」のスピリットカード 1 枚を手札に戻す | 既 | `moveCards from:trash dest:hand pick:{cardType:"spirit",family:"雄将"} count:1`（BS04-083。BS15-056 が同じブレイヴ召喚時の型） |
| 合体条件：コスト 4 以上 | 既 | カード側の合体条件（BS15-056 が同じ） |

### BS18-056 聖剣竜エクス・ワイバーン（赤・brave・コスト 4）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1『召喚時』相手のスピリットのコア 3 個を相手のリザーブに置く。0 個にはできない | 既 | `removeCores count:3 leaveAtLeast:1`（BS06-014・SD01-013） |
| 【合体時】『合体アタック時』疲労状態の相手のスピリット 1 体を指定してアタック | 既 | `constraint whileCombined:true canDirectAttack targetFilter:"rested"`（BS01-037 の constraint＋BS11-055 の whileCombined） |
| 合体条件：コスト 4 以上/魔影 | 既 | カード側（BS16-056「覇皇/雄将」が同じ形の合体条件） |

### BS18-061 戦史の石碑（赤・nexus・コスト 3）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1-2『自分のアタックステップ』系統「戦竜」の自分のスピリットがアタックしたとき、1 枚ドロー | 既 | `fieldEvent anySpiritAttacked ownOnly:true familyFilter:["戦竜"] phase:attack turn:own`＋`draw`（BS16-054-e3 の event 形） |
| Lv2 相手によって自分の赤のスピリットが破壊されたとき、BP5000 以下の相手のスピリット 1 体を破壊 | 既 | `fieldEvent ownSpiritDestroyed colorFilter:"red" byOpponentOnly:true`＋`destroy filter:{maxBp:5000}`（BS05-064-e1 と BS12-005 の flag） |

### BS18-062 最も高き山頂（赤・nexus・コスト 3）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1-2『自分のターン』赤の自分のスピリットすべて BP+1000 | 既 | `aura bp target:ownAll colorFilter:"red" amount:1000 turn:"own"`（BS10-079 の turn、BS04-006 の colorFilter） |
| Lv2『自分のアタックステップ』自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のネクサス 1 つを破壊 | 既 | `battleWon role:"any" selfMode:"source"`（BS14-079-e2）＋`destroyNexus side:"opponent" count:1`（BS01-011 の destroyNexus） |

### BS18-063 魂の海塔（紫・nexus・コスト 3）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-2 お互い、スピリット/ブレイヴの効果でボイドからコアを増やすことができない | 新 | `globalConstraint coreGainCap sourceTypes:["spirit","brave"] from:["void"]`（BS17-063-e1）。足りないのは N13（確認事項 1 でライフの扱いが変わる） |
| Lv2 手札が 5 枚以上の間、相手によって自分のスピリットが破壊されたとき 1 枚ドロー | 新 | `fieldEvent ownSpiritDestroyed byOpponentOnly:true`＋`draw`（BS12-005）。足りないのは N10（fieldEvent の condition に ownHandAtLeast） |

### BS18-064 黄昏のキャメロット城（紫・nexus・コスト 3）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| Lv1-2『相手のメインステップ』相手のスピリットが召喚されたとき、デッキの上から 3 枚をトラッシュに置くことができる | 新 | `mill count:3 side:"own"`、任意（`optional`）。足りないのは N14（確認事項 2） |
| Lv2『自分のスタートステップ』トラッシュの系統「雄将」/「魔影」のスピリットカード 1 枚を手札に戻すことができる | 既 | `step start own`＋`moveCards from:trash dest:hand pick:{cardType:"spirit",family:["雄将","魔影"]}`（BS04-083 の step 形、BS07-015 の family 配列）。「できる」は optional |

### BS18-073 ヒロイックエントリー（赤・magic・コスト 4）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| メイン：このターンの間、手札の系統「覇皇」のスピリットカードすべてのコストを自分のライフと同じ数にする | 既 | BS09-067（系統「星竜」を「覇皇」に替えるだけ。同文） |
| フラッシュ：このターンの間、スピリット 1 体を BP+2000 | 既 | BS09-067 のフラッシュと同文 |

### BS18-074 救世神撃覇（赤・magic・コスト 4）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】BP 合計 6000 まで相手のスピリットを好きなだけ破壊。その後コストを支払うことでフラッシュ効果を発揮 | 既 | `burst event:ownLifeDamaged action:destroyByBpBudget budget:6000 thenPay:"flash"`（BS07-009 の budget、BS15-076 の thenPay） |
| フラッシュ：1 枚ドロー。その後、手札のバーストカード 1 枚をセットできる | 既 | `sequence[draw, setBurstFromHand ask:true]`（BS17-005 の ask 形） |

### BS18-075 マーク・オブ・ゾロ（紫・magic・コスト 5）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| 【バースト：相手による自分のスピリット破壊後】1 枚ドローし、相手のスピリットのコア 2 個を相手のトラッシュに置く。その後コストを支払うことでフラッシュ効果 | 既 | `burst event:ownSpiritDestroyed subjectSide:"own" byOpponentEffectOnly:true thenPay:"flash"`（BS14-101・BS14-095）＋`sequence[draw, removeCores target:"spread" count:2 to:"trash" chooser:"owner"]`（BS14-095 が同じ「相手のスピリットのコア N 個」の書き方） |
| フラッシュ：コスト 5 以下の相手のスピリットすべてのコア 1 個ずつを相手のリザーブに置く | 既 | `removeCores target:"all" filter:{cost:{max:5}} count:1`（BS13-013） |

### BS18-076 クリスタルクラック（紫・magic・コスト 5）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| フラッシュ：相手のスピリット 1 体のコアを、1 個だけになるように相手のトラッシュに置く | 既 | `removeCores targets:1 count:"all" leaveAtLeast:1 to:"trash"`（BS16-076-e1。行き先だけ trash） |

### BS18-X01 超覇王ロード・ドラゴン・セイバー（赤・spirit・コスト 10）

| 節 | 区分 | 使う器（根拠）／足りない部品 |
| :-- | :-- | :-- |
| 【バースト転召：自分のライフ減少後】系統「覇皇」の自分のスピリット 1 体のコアすべてをボイドに置くことで、このカードをコストを支払わずに召喚する | 新 | `burst event:ownLifeDamaged`＋`pay{cost:removeCores…to:void, then:summonBurstCardFree}`（BS17-016 の pay 形）。足りないのは N15（確認事項 5）。「1 体指定してコアすべて」を払う pay の実カードは無い |
| 同 この効果発揮後、ライフが 5 になるまで、フィールド/リザーブから好きなだけコアを置く | 新 | `placeCores to:"life" fillTo:5 upTo`（BS09-X35・BS16-045 の fillTo）。足りないのは N16。「この効果発揮後」は CONJUNCTION.md の通り、召喚の誘発を解決してから |
| Lv2-3『アタック/ブロック時』ライフのコア 1 個をこのスピリットに置くことで、このターンの間、自分のスピリットすべて BP+5000 | 新 | `triggered onAttack` と `onBlock` の 2 エントリ（BS12-X04 の「アタック/ブロック時」）＋`pay`＋`timedEffect bp 5000 target:ownAll duration:turn`（「このターンの間、すべて」は後から出たスピリットにも効く：確定済み）。足りないのは N17 |
| Lv3『自分のバースト発動後』このスピリットは回復する | 既 | BS16-X01-e3 と同一 |

### BS18-X02 騎神皇アヴァロ・パラディオン（紫・spirit・コスト 8）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| Lv1-2『召喚時』トラッシュの系統「覇皇」のスピリットカードを好きなだけ、コストを支払わずに召喚できる。召喚時効果は発揮されない | 既 | `moveCards from:trash dest:summon pick:{cardType:"spirit",family:"覇皇"} count:"all" skipOnSummon:true`（BS06-X22 の `count:"all"`、BS13-014 の `skipOnSummon`）。「好きなだけ」は `upTo`（BS17-044）。3 つの flag が同一エントリに揃う実カードは無いが、各 flag は別の実カードで実績あり |
| Lv2『自分のアタックステップ』覇皇の自分の紫のスピリットがBPを比べ相手のスピリットだけを破壊したとき、破壊したスピリットのコアすべては相手のトラッシュに置かれる | 既 | `fieldEvent anySpiritAttacked ownOnly familyFilter:["覇皇"] colorFilter:"purple"`＋`battleOpponentDestroyedCoresTo to:"trash"`（BS14-073-e3 の型にフィルタを足す） |

### BS18-X012A 英雄皇ロード・ドラゴン・ドミニオン（紫・spirit・コスト 6）

X012R（BS14 取り込み済み）と効果文が同一。色違いのため、X012R のエントリをそのまま写せる。

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】このスピリットカードを召喚する | 既 | X012R のバーストエントリ |
| Lv1-3『召喚時』手札のバースト持ち 1 枚をセットすることで 1 枚ドロー | 既 | X012R-e2（`pay{cost:setBurstFromHand, then:draw}`） |
| Lv3『自分のアタックステップ』バーストをセットしている間 BP+3000 | 既 | X012R の Lv3 aura エントリ |

### BS18-X021 黄金の覇王ロード・ドラゴン・インティ（赤・spirit・コスト 8）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】ライフが 3 以下のとき召喚 | 既 | `burst event:ownLifeDamaged condition:{ownLifeAtMost:3} summonBurstCardFree`（BS16-054-e1） |
| Lv1-3『召喚時』デッキの上から 5 枚オープン。名前に「ロード・ドラゴン」のスピリットを好きなだけ無償召喚、残りは破棄。ターンに 1 回 | 既 | `sequence keepScope[revealOpen count:5, moveCards from:revealed dest:summon count:"all" pick:{cardType:"spirit",nameIncludes:"ロード・ドラゴン"}, moveCards from:revealed dest:trash count:"all"]`（BS08-X29・BS11-007）＋`oncePerTurn`（カード名ごとは `onceScope:"name"`＝RULES_BATSPI_WIKI.md の 2026-10-01 実装）。召喚時効果は**発揮される**ので `noSummonEffects` は付けない |

### BS18-X022 覇王ロード・ドラゴン・ザ・ワールド（赤・spirit・コスト 9）

| 節 | 区分 | 使う器（根拠） |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】ライフが 3 以下のとき召喚 | 既 | BS16-054-e1 |
| Lv1-3『召喚時』1 枚ドロー。その後、手札のバースト持ち 1 枚をセットできる | 既 | `sequence[draw, setBurstFromHand ask:true]`（BS17-005） |
| Lv2-3『自分のアタックステップ』名前に「ロード・ドラゴン」の自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア 1 個を相手のトラッシュに置く | 既 | `battleWon role:"any" winnerNameContains:"ロード・ドラゴン"`＋`lifeCrush count:1 dest:"trash"`（BS15-036 の同文、BS08-036-e4） |
