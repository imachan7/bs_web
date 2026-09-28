# BS17 調査メモ：赤・紫30枚（調査役）

対象：`data/staging/BS17.json` のうち赤14枚（001〜009, X01, 055, 061, 062, 073, 074）
・紫16枚（010〜018, X02, 056, 063, 064, 075, 076）。**実装はしていない**（このメモのみ）。

## 集計

- 全節数：約52節（バニラ2枚を除く。Lv見出し単位＋キーワード単独行＋バースト単独ブロックで数えた）
- 既存の器で書ける：約44節
- 新しい部品が要る：8節・部品候補6種
  1. **EffectCounter「勝ったバトルのBP差を閾値で割った数」**（BS17-009 Lv2-3）
  2. **onBlocked/onBattleStart 系条件「ブロッカーが対象フィルタに一致する」の一般形**は既存で足りた（`battleOpponentCombined` を流用）が、
     **aura に「バトル中の相手側がキーワードを持つときだけ」の軸が無い**（BS17-014 Lv1-3）
  3. **FieldEvent「相手の（自分から見て）ライフにボイドからコアが置かれたとき」の一般形が無い**（既存は【聖命】専用の `ownSeimeiLifeCharged` のみ。BS17-014 Lv2-3）
  4. **「ターンに1個までしか」のコア獲得回数キャップ**（`millCap` のコア版が無い。BS17-063 Lv1-2）
  5. **`shinsokuPayAssist` の【神速】限定を外し、コスト下限条件・ターン1回制限を持たせた版**（BS17-062）
  6. **`declare` の `what` が color/family/cost のみで「特定の1体」を指定して同名参照する形が無い**（BS17-074 バースト部・フラッシュ部、BS17-076 フラッシュ）

## 確認事項

1. **BS17-004 リュー・ラーダー**「バースト効果を持つ自分のスピリット1体をバーストとしてセットできる」
   → 私はこう読みました：文言は「スピリット」だが、バーストは常に**手札**からしかセットできないルールなので、
   既存の `setBurstFromHand`（手札のバースト持ちカード1枚をセット）と同じ意味で、「スピリット」は
   対象をスピリットカードに限定する修飾（マジックのバーストは対象外）と解釈しました。これでよいか確認したいです。
   → 既存の `setBurstFromHand` にはカード種別の絞り込みが無いため、スピリット限定を反映するなら
   フィルタ（`cardType: "spirit"`）を1つ足す新しい部品が要ります。
2. **BS17-003 アルジュナス Lv1-3**「相手の合体スピリットにブロックされたとき」
   → 私はこう読みました：`onBattleStart` ＋ `battleRole: "attacker"` ＋ `condition: { battleOpponentCombined: true }`
   （BS11-X02 と同型）で表現できると判断しました。「ブロックされたとき」と「バトルが成立した時点」の区別は
   このケースでは結果が変わらない（自分がアタッカーのときにしか起きない）ため、と理解しています。これでよいか確認したいです。
3. **BS17-062 彷徨う天空寺院**「本来のコストが8以上のスピリットカードを召喚するとき」
   → 印刷コストで判定（軽減後ではない）と解釈しました。`shinsokuPayAssist` のコメントにある
   「costFilter は本来のコストで判定」という既存の一般則を流用しています。これでよいか確認したいです。

## 対応表

### BS17-001 バリ・バーン（赤・spirit・コスト2）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3『アタック時』バトル終了時、このターンの間、自分のスピリット1体をBP+3000 | 既存 | `kind:"triggered" trigger:"onAttack"` → `action:{type:"timedEffect", content:[{type:"bp",amount:3000}], duration:"battle", target:{...}, side:"own"}`（対象選択1体） | 「バトル終了時」まで残る型は `duration:"battle"` の `timedEffect` が既存語彙 |

### BS17-002 フェンサー・ドラゴン（赤・spirit・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2 このスピリットはブロックできない | 既存 | `kind:"constraint" constraint:{type:"cantBlock"}` | 多数 |
| Lv1-2『アタック時』自分のバーストをセットしている間、BP+2000 | 既存 | `kind:"aura" whileOwnBurstSet:true aura:{type:"bp",target:"self",amount:2000}` | BS14-034 スリー・レッガー |

### BS17-003 アルジュナス（赤・spirit・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 相手の合体スピリットにブロックされたとき、BP+4000 | 既存（確認事項2） | `kind:"triggered" trigger:"onBattleStart" battleRole:"attacker" condition:{battleOpponentCombined:true}` → `timedEffect bp+4000 duration:"battle" target:"self"` | BS11-X02 滅神星龍ダークヴルム・ノヴァ |
| Lv2-3 自分のバーストをセットしているとき、相手の合体スピリット1体を指定しアタックできる | 既存 | `kind:"constraint" whileOwnBurstSet:true constraint:{type:"canDirectAttack", targetFilter:"any", targetCombinedOnly:true}` | BS01-037／BS11-X02（`targetCombinedOnly`） |

### BS17-004 リュー・ラーダー（赤・spirit・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『スタートステップ』バーストをセットしていないとき、バースト効果を持つ自分のスピリット1体をセットできる | 既存／要確認（確認事項1） | `kind:"turnStart"` 系 or `handActivated` → `action:{type:"pay",cost:...,then:{type:"setBurstFromHand"}}` 相当 | X012R 英雄皇ロード・ドラゴン・ドミニオン（`setBurstFromHand`） |

### BS17-005 ドラグ・クリシュナー（赤・spirit・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：相手の召喚時】召喚。その後バーストをセットしていないとき手札のバースト持ち1枚をセットできる | 既存 | `kind:"burst" event:"opponentSummonEffectResolved"` → `sequence`（`summonBurstCardFree` → `if{cond:{count:{ownBurstSet相当}}, ...}` or `pay`任意）＋`setBurstFromHand` | BS16-X01／X012R |
| Lv2-3『自分のアタックステップ』バーストセット中、系統「覇皇」/「雄将」の自分のスピリットがアタックしたとき、ドロー1 | 既存 | `kind:"fieldEvent" event:"anySpiritAttacked" ownOnly:true familyFilter:["覇皇","雄将"] condition:{ownBurstSet:true} phase:"attack" turn:"own"` → `draw count:1` | fieldEvent condition `{ownBurstSet:boolean}` 既存 |

### BS17-006 ツクヨミドラグーン（赤・spirit・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『アタック時』デッキ上3枚オープン、条件一致のバーストを発動できる。残りは破棄 | 既存 | `kind:"triggered" trigger:"onAttack" optional:true action:{type:"reveal", from:"ownDeck", count:3, pick:{burstEvent:"opponentSummonEffectResolved"}, dest:"activateBurst", rest:"trash"}` | BS16-X01（`from:"burst"`版の同型。`from`/`count`/`rest`を差し替え） |

### BS17-007 ヴァジュランガ（赤・spirit・コスト6）

バニラ

### BS17-008 紅玉の巨龍ボルガンド（赤・spirit・コスト7）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 フラッシュ【覚醒】自分のスピリットのコアを好きなだけこのスピリットに置ける | 既存 | `kind:"keyword" keyword:"awaken"` | BS14系の同文言カード（例：BS14該当カード） |

### BS17-009 ソードマスター・ドラゴン（赤・spirit・コスト8）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3【激突】『アタック時』相手は可能なら必ずブロック | 既存 | `kind:"keyword" keyword:"clash"` ＋ `kind:"mustBlockGrant"` | BS06-003ほか多数（【激突】）／BS07-009 剣龍皇エクス・キャリバス（【激突】+必ずブロック併記） |
| Lv2-3『アタック時』BP比較で相手だけ破壊したとき、上回ったBP3000につき相手ライフのコア1個をリザーブへ（上限3個） | **新しい部品**：勝ったバトルのBP差を閾値（3000）で割った数を返す `EffectCounter`（既存の `EffectCounter` に「バトルの実効BP差」を数える軸が無い。`lastBattleDestroyedBp` はTargetFilter用の軸で数値自体を返さない）。差し込み先：`server/src/type.ts` の `EffectCounter` 定義＋算出側は `logic/counted.ts` 相当 | 上限3個は既存の `countMax`（`coreRemove`/`removeCores`系）で表現可 | なし（コメント検索・grep共に既存例なし） |
| Lv3『アタック時』BP+3000 | 既存 | `kind:"aura"` or `timedEffect` self bp+3000（Lv限定オーラ） | 多数 |

### BS17-010 マッドーロ（紫・spirit・コスト0）

バニラ

### BS17-011 キャメロット・ナイト（紫・spirit・コスト2）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【不死：コスト0】お互いのアタックステップ、トラッシュのこのカードはコスト0破壊時に召喚できる | 既存 | `kind:"keyword" keyword:"fushi" triggerCosts:[0]` | BS09-014 闇騎士ボールス（triggerCosts形式） |
| Lv2 カード名に「闇騎士」が入っているものとして扱う | 既存 | `kind:"nameAsGrant" target:"self" nameIncludes:"闇騎士"` | 既存 nameAsGrant 定義そのもの（同型カード多数） |

### BS17-012 闇騎士アグロヴァル（紫・spirit・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【不死：コスト4】お互いのアタックステップ、トラッシュのこのカードはコスト4破壊時に召喚できる | 既存 | `kind:"keyword" keyword:"fushi" triggerCosts:[4]` | BS09-014ほか |
| Lv2 コスト3の自分のスピリットが相手によって破壊されたとき、相手のスピリット/ネクサスのコア1個をリザーブへ | 既存 | `kind:"fieldEvent" event:"ownSpiritDestroyed" costFilter:{max:3,min:3} byOpponentOnly:true` → `removeCores`（対象を相手スピリット/ネクサスから1個選ぶ） | costFilter・byOpponentOnly は effectDef.ts に既存フィールド |

### BS17-013 スモックジラ（紫・spirit・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 コスト3の自分のスピリットが相手によって破壊されたとき、コスト3以下のスピリット1体を破壊できる | 既存 | `kind:"fieldEvent" event:"ownSpiritDestroyed" costFilter:{max:3,min:3} byOpponentOnly:true optional:true` → `destroy filter:{cost:{max:3}} count:1` | 上と同型の条件軸 |

### BS17-014 チェーンバイパー（紫・spirit・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3『自分のアタックステップ』【装甲】/【重装甲】を持つ相手のスピリットとバトルしている自分のスピリットすべてをBP+3000 | **新しい部品**：`AuraDef` に「現在のバトルの相手側がこのキーワードを持つときだけ有効」の軸が無い（`battlingOnly` はバトル中かどうかだけを見る。相手側の属性は見ない）。差し込み先：`server/src/type.ts` の `AuraDef`（`opponentBattlerKeywordFilter?: Keyword[]` のような軸を1つ追加） | なし | なし |
| Lv2-3 ボイドから相手のライフにコアが置かれたとき、置かれたコア1個につき相手は手札2枚破棄 | **新しい部品**：`FieldEvent` に「相手（自分から見て）のライフへ、ボイドからコアが置かれたとき」の一般形が無い（既存は【聖命】専用の `ownSeimeiLifeCharged`＝**自分の**ライフだけ）。差し込み先：`server/src/type.ts` の `FieldEvent`（`opponentLifeCoreFromVoid` を1つ追加。`placeCores` のvoid→life解決点から発火） | なし | なし |

### BS17-015 闇騎士パロミデス（紫・spirit・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【不死：コスト3】お互いのアタックステップ、トラッシュのこのカードはコスト3破壊時に召喚できる | 既存 | `kind:"keyword" keyword:"fushi" triggerCosts:[3]` | BS09-014ほか |
| Lv1-2『召喚時』疲労状態のコスト5以下の相手のスピリット1体を破壊 | 既存 | `kind:"triggered" trigger:"onSummon"` → `destroy filter:{rested:true, cost:{max:5}} count:1` | `rested` は TargetFilter に既存軸 |

### BS17-016 闇騎士ランスロット（紫・spirit・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：相手による自分のスピリット破壊後】トラッシュの紫スピリット2枚を手札に戻すことで召喚 | 既存 | `kind:"burst" event:"ownSpiritDestroyed" byOpponentOnly:true` → `pay{cost:{type:"returnToHand", from:"trash", filter:{color:"purple", cardType:"spirit"}, count:2}, then:{type:"summonBurstCardFree"}}` | `pay`＋`returnToHand`（from:trash）は既存語彙。イベント自体はBS09-014系 |
| 【不死：コスト6】お互いのアタックステップ、トラッシュのこのカードはコスト6破壊時に召喚できる | 既存 | `kind:"keyword" keyword:"fushi" triggerCosts:[6]` | BS09-014ほか |
| Lv1-2『召喚時』疲労状態のコスト5以下の相手のスピリット1体を破壊 | 既存 | BS17-015と同型 | 同上 |

### BS17-017 冥天獣フル・フール（紫・spirit・コスト6）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3『自分のメインステップ』バーストをセットしたとき、相手のスピリットのコア1個をトラッシュへ | 既存 | `kind:"fieldEvent" event:"ownBurstSet" phase:"main" turn:"own"` → `removeCores{to:"trash", filter:相手スピリット, count:1}` | `ownBurstSet` は FieldEvent に既存 |

### BS17-018 紫晶の大蛇ザウム（紫・spirit・コスト7）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2【呪撃】『アタック時』ブロックした相手スピリット1体をバトル終了時に破壊 | 既存 | `kind:"keyword" keyword:"jugeki" levels:[1,2]`（付随処理はキーワード側が持つ） | BS02-015ほか多数（同一文言） |

### BS17-055 ヤサカニ・ウィング（赤・brave・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1『召喚時』BP合計4000まで相手のスピリットを好きなだけ破壊。自分の[天剣の覇王ジーク・スサノ・フリード]がいるとき代わりに7000まで | 既存 | `kind:"triggered" trigger:"onSummon"` → `if{cond:{count:{ownNameIncludes:"天剣の覇王ジーク・スサノ・フリード"}, atLeast:1}, then:{type:"destroyByBpBudget", budget:7000}, else:{type:"destroyByBpBudget", budget:4000}}` | `destroyByBpBudget`・`if/else`・`EffectCounter.ownNameIncludes` すべて既存 |
| 合体条件：覇皇/雄将/戦竜 | 既存 | カードデータの `braveCondition`（family配列） | 既存フィールド |

### BS17-056 アロンダイザー（紫・brave・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】相手スピリットのコア2個をリザーブへ。その後このカードを召喚 | 既存 | `kind:"burst" event:"ownLifeDamaged"` → `sequence`（`removeCores`→`summonBurstCardFree`） | BS16-X01（`event:"ownLifeDamaged"`）、`sequence`は既存組み合わせ方 |
| 【合体時】『合体アタック時』疲労状態の相手のスピリット1体を破壊 | 既存 | `kind:"triggered" trigger:"onAttack" whileCombined:true battleRole:"attacker"`（合体アタック限定） → `destroy filter:{rested:true} count:1` | `whileCombined` は既存フィールド |
| 合体条件：覇皇/雄将/魔影 | 既存 | 同上 | 既存フィールド |

### BS17-061 神焔の高天ヶ原（赤・nexus・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『自分のアタックステップ』系統「覇皇」の自分のスピリットがターン最初にアタックするとき、相手のスピリット1体を指定しアタックできる | 既存 | `kind:"constraint" phaseTurn:{phase:"attack",turn:"own"} condition:{firstAttackOfTurn:true}`（対象は familyFilter で絞る） → `constraint:{type:"canDirectAttack", targetFilter:"any"}` | `condition:{firstAttackOfTurn:true}` は aura/constraint 共通の既存条件 |
| Lv2 系統「覇皇」の自分の赤スピリットが相手に破壊されたとき、ライフのコア1個をボイドに置くことで回復状態でフィールドに残す | 既存 | `kind:"fieldEvent" event:"ownSpiritDestroyed" byOpponentOnly:true familyFilter:"覇皇" colorFilter:"red"` → `pay{cost:{type:"coreRemove",...to void...}, then:{type:"applyReviveOnDestroy"}}` 系 | `reviveOnDestroy`／`applyReviveOnDestroy` kind・type が既存 |

### BS17-062 彷徨う天空寺院（赤・nexus・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1『メインステップ』本来コスト8以上のスピリット召喚時、このネクサスを疲労させリザーブから2コストまで支払ったものとして扱う（ターン1回） | **新しい部品**：既存 `shinsokuPayAssist` は【神速】召喚限定（コメントに明記）。BS17-062は**通常召喚**が対象かつ「本来コスト8以上」という下限条件・ターン1回制限を持つ。差し込み先：`server/src/types/effectDef.ts` の `shinsokuPayAssist` 近辺に、対象召喚をsoku限定でない版として `minCost`・`oncePerTurn` を持つ兄弟 kind（例：`summonCostReserveAssist`）を追加 | なし | なし（`shinsokuPayAssist` はBS16-021のみ） |

### BS17-063 黒き聖杯（紫・nexus・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2 相手のスピリット/ブレイヴ/ネクサスの効果では、ターンに1個までしかボイド/トラッシュ→相手ライフ/フィールド/リザーブへコアを置けない | **新しい部品**：ターンをまたぐ「コア移動の回数上限」を持つ器が無い（`millCap`/`millCapBonus` はデッキ破棄の上限で別軸）。差し込み先：`server/src/types/effectDef.ts` に `coreGainCap` 相当の kind（対象＝相手、経路＝spirit/brave/nexus効果、`from`＝void/trash、`to`＝life/field/reserve、`limitPerTurn:1`）を追加 | なし | なし |
| Lv2 カード名に「闇騎士」を含む自分のスピリットが相手のスピリット/マジックの効果で破壊されたとき、相手は自分のスピリット1体を破壊 | 既存 | `kind:"fieldEvent" event:"ownSpiritDestroyed" byOpponentEffectOnly:true nameIncludes:["闇騎士"]` → `destroy side:"own"(相手視点で自分)` | `byOpponentEffectOnly`＝スピリット/ネクサス/マジック効果を包括、`nameIncludes` は既存フィールド |

### BS17-064 死者の湖（紫・nexus・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『自分のバースト発動後』相手の合体スピリットのブレイヴ1つを破壊 | 既存 | `kind:"fieldEvent" event:"ownBurstActivated"` → `destroyBrave filter:{combined:true}` | `ownBurstActivated`／`destroyBrave` とも既存 |
| Lv2『お互いのアタックステップ』コスト3の自分のスピリットが疲労したとき、ドロー1 | 既存 | `kind:"fieldEvent" event:"ownSpiritExhausted" costFilter:{max:3,min:3}` → `draw count:1` | costFilter は ownSpiritExhausted で既存 |

### BS17-073 アーダーフレイム（赤・magic・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| フラッシュ：BP4000以下の相手のスピリット1体を破壊。破壊時効果は発揮されない | 既存 | `kind:"magic"` → `destroy filter:{maxBp:4000} count:1 suppressOnDestroy:true` | `suppressOnDestroy` は destroy に既存フィールド |

### BS17-074 殲剣火炎陣（赤・magic・コスト6）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：相手の召喚時】ネクサス1つを指定し、同名ネクサスすべて破壊。その後コスト支払いでフラッシュ発揮 | **新しい部品**：`declare` の `what` は color/family/cost のみ（DECLARE_UNIFY.md §1）。「特定の1個体を指定し、それと同名のものすべて」を選ぶ形が無い。差し込み先：`declare` に `what:"instance"`（候補＝対象フィールドの個体）を足し、`declared`側に `sameNameAsDeclared` を追加、または専用の一体宣言+同名破壊アクションを追加 | `burstMagicFreeOrThenPay` は「その後コストを支払うことでフラッシュ発揮」の既存語彙 | なし |
| フラッシュ：同名2体以上の相手のスピリット1体を指定し、同名すべて破壊 | 同上（新しい部品と同じ理由） | 同上 | `destroyDuplicateNames` は近いが「自動で全同名グループを処理」であり「1体指定→その名前だけ破壊」とは形が違う |

### BS17-075 ストラングルフォッグ（紫・magic・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| フラッシュ：相手のスピリットのコア1個をリザーブへ。両者のコア合計差が3個以上のとき、さらにコア3個をボイドへ | 既存 | `kind:"magic"` → `sequence`（`removeCores`→`if{cond:{state相当の合計比較}, then:{removeCores to void count:3}}`） | `if` の `cond` に「相手が自分よりコア合計◯個以上多い」を見る軸が既存（`opponentCoresTotal`／`ownCoresTotal` の `EffectCounter` と `minus` の組み合わせで判定可） |

### BS17-076 ラウンドテーブルナイツ（紫・magic・コスト5）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】トラッシュのコスト5以下スピリット1枚を召喚。その後コスト支払いでフラッシュ発揮 | 既存 | `kind:"burst" event:"ownLifeDamaged"` → `summonFromTrashFree filter:{cost:{max:5}}` ＋ `burstMagicFreeOrThenPay` | `summonFromTrashFree`／`burstMagicFreeOrThenPay` とも既存 |
| フラッシュ：カード名に「闇騎士」を含む自分のスピリット1体につき、相手のスピリットのコア1個をリザーブへ | 既存 | `kind:"magic"` → `removeCores countCounter:{ownNameIncludes:"闇騎士"}` | `{ownNameIncludes:string}` は EffectCounter に既存 |

### BS17-X01 天剣の覇王ジーク・スサノ・フリード（赤・spirit・コスト9）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】ライフ3以下のとき、赤スピリット1体につきBP6000以下の相手スピリットを破壊。その後召喚 | 既存 | `kind:"burst" event:"ownLifeDamaged" condition:{ownLifeAtMost:3}` → `destroy filter:{maxBp:6000} countCounter:{ownColor:"red"}` → `sequence` → `summonBurstCardFree` | `condition:{ownLifeAtMost}` は burst に既存。`{ownColor:Color}` は EffectCounter に既存 |
| Lv2-4『アタック時』BP+10000 | 既存 | `timedEffect`/`aura` bp+10000 self | 多数 |
| Lv3-4 バーストセット中、赤シンボル1つ追加 | 既存 | `kind:"symbolAddGrant" target:"self" color:"red" condition:{ownBurstSet:true}` | effectDef.ts 969行付近に既存フィールド（`condition?: {...}|{ownBurstSet:true}`） |

### BS17-X02 騎士の覇王ソーディアス・アーサー（紫・spirit・コスト12）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】ライフ3以下のとき召喚 | 既存 | `kind:"burst" event:"ownLifeDamaged" condition:{ownLifeAtMost:3}` → `summonBurstCardFree` | 同上 |
| Lv2-3『アタック時』トラッシュの【不死】持ち1枚をコストを支払わず召喚できる | 既存 | `kind:"triggered" trigger:"onAttack" optional:true` → `action:{type:"summonFromTrashFree", filter:{keyword:"fushi"}}` | `summonFromTrashFree` は既存type（keyword絞り込み対応） |
| 【合体時】Lv3『合体アタック時』相手のスピリットのコア1個をボイドへ | 既存 | `kind:"triggered" trigger:"onAttack" whileCombined:true battleRole:"attacker"` → `removeCores to:"void" count:1` | `whileCombined` 既存 |
