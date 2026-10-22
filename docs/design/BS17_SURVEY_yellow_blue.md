# BS17 黄・青（30枚）調査メモ

対象: `data/staging/BS17.json` のうち黄（037-045, 059, 069, 070, 081, 082, X05）・青（046-054, 060, 071, 072, 083, 084, X06）30枚。

## 集計

- 全節数: 52（バニラ2枚＝BS17-040/046 除く）
- 既存の器だけで書ける節: 34（前例cardIdは各行に記載）
- 新しい部品が要る節: 18（下記一覧。同じ部品が複数カードで再利用されるものを含む）

（2回目の検証で「要確認」8か所・「要cardId確認」系5か所を全て grep + cardId で決着。既存に確定4件（054Lv2/071Lv2/X05/X06Lv1-3/052/059/049Lv1のdeployNexus）、新しい部品に確定9件（041/043/047/048/069Lv2/083/044Lv1のburstSummonOnly/070）を追加した。）

## 新しい部品一覧

| 部品名 | 対象カード | 理由 | 差し込み先 |
| :-- | :-- | :-- | :-- |
| Keyword `"makobo"`（【魔光芒】） | X05、他29枚中20枚超が参照 | 【光芒】(kobo)とは別枠のキーワード。既存 `Keyword` union に無い。X05の全文が「バトル終了時トラッシュのマジックを手札に戻す」（=koboの挙動）＋「マジック使用後もう1度発揮できる」の複合であり、kobo一枚では表現できない | `server/src/type.ts`（Keyword union）、`server/src/logic/keywords/kobo.ts`（`hasStaticKobo`判定に`makobo`も含める） |
| tieredコア数（ライフのコアを段階的に減らして代わりに置く） | BS17-051, X06（同一文言） | 既存`removeCores`の`leaveAtLeast`/`downTo`は固定値のみ。「7個以上→4個、6/5個→3個、4個→2個」という閾値テーブルは無い。ライフダメージの代替処理としても前例なし（grep 0件） | `server/src/types/effectAction.ts`（`removeCores`に`tieredLeaveAtLeast`のような軸を追加）、`server/src/logic/EffectModules.ts` |
| `cantBlockByCost`（GlobalConstraintDef） | BS17-071 Lv1-2 | 既存`cantAttackByCost`のブロック版が無い。`costCantAct`はアタック/ブロック両方を止めてしまい、この効果はブロックだけを止める | `server/src/type.ts`（`GlobalConstraintDef`）、`server/src/logic/EffectModules.ts` |
| 「相手のバースト1つの内容を見る」（見る対象がバーストエリア） | BS17-049 Lv2 | 既存`peekOpponentHand`は手札からランダム1枚を見る専用。`reveal`の`from:"burst"`は前例2件（BS16-X01）とも**自分の**バースト限定（発動判断つき）で、相手のバーストを黙って見るだけの前例なし | `server/src/types/effectAction.ts`、`server/src/logic/EffectModules.ts` |
| コスト指定バースト無効化（このターンの間、指定コストのバースト効果を発揮できない） | BS17-084 | grep 0件。「バースト効果を発揮できない」の前例なし（`burstSetCost`はセットに追加コストを課すだけで、発揮自体は止めない） | `server/src/types/effectDef.ts`（新規`kind`か`playerRule`拡張）、`server/src/logic/EffectModules.ts` |
| マジック使用への「コスト以上のカードを破棄しなければ発揮できない」課税 | BS17-060 | grep 0件。既存の氷壁(`magicNegate`)は無効化のみで、「破棄しなければ発揮できない」という条件付き無効化の前例なし | `server/src/types/effectDef.ts`、`server/src/logic/EffectModules.ts` |
| `spiritEffectsDisabledGrant`への対象Lv絞り込み | BS17-081 | 既存は発生源自身の`levels`（＝いつ有効か）のみで、**対象スピリットの現在Lv**で絞る軸が無い。「指定したLvの相手のスピリットすべては効果を失う」は対象側のLv一致が必須 | `server/src/types/effectDef.ts`（`spiritEffectsDisabledGrant`に`targetLevel`等を追加） |
| `immunityGrant`への名前（nameIncludes）絞り込み | BS17-054 Lv1-2, BS17-072 Lv2 | 既存`immunityGrant`はfamily/color/keyword/vanillaの絞り込みのみで、カード名（[ロック・アラディン]）による絞り込みが無い。`constraintGrant`にはnameIncludesがあるが`immunityGrant`には無い。072 Lv2はさらに`against`軸が"magic"\|"bounce"のみで"spirit"/"brave"が無い | `server/src/types/effectDef.ts`（`immunityGrant`に`nameIncludes`と`against`拡張を追加） |
| 疲労数を「回復状態がN体になるまで」で指定する`exhaust`の閾値版 | BS17-072 Lv1-2 | 既存`exhaust`は疲労させる体数を直接指定するのみ。「回復状態のスピリットが3体になるように」という現在の回復状態数を見て差分だけ疲労させる軸が無い | `server/src/types/effectAction.ts`（`exhaust`に`untilRefreshedCount`等を追加） |
| `reveal`の`countPer`に`ownKeyword`軸が無い | BS17-041 | 既存`countPer`は`{ownColorTotal}`\|`{ownNexuses:true}`\|`{ownSymbols}`のみで、`EffectCounter`にある`{ownKeyword: Keyword}`（BS05双剣虎ジェン・フー前例）に相当する軸が無い。「光芒/魔光芒持ち1体につき1枚オープン」を`count`に直結できない。ownKeywordはKeyword単数のみでOR（kobo/makobo）も別途要る | `server/src/types/effectAction.ts`（`reveal.countPer`に`{ownKeyword: Keyword \| Keyword[]}`を追加） |
| バースト条件を無視して発揮する器 | BS17-043 | grep 0件（`type.ts`/`effectDef.ts`に`burstCondition`関連の無視軸なし、カードデータにも「バースト条件を無視」の前例なし） | `server/src/types/effectAction.ts`、`server/src/logic/EffectModules.ts` |
| `aura`（`AuraCondition`）に自軍スピリット数条件が無い | BS17-047, BS17-048 Lv2 | `{maxOwnSpirits}`は`kind:"levelAs"`の`condition`union（BS08-004, BS12-062で確認）にしか無く、`AuraCondition`（`kind:"aura"`/`"constraint"`が使う）には無い。BP増減の継続効果には流用できない | `server/src/type.ts`（`AuraCondition`に`{maxOwnSpirits: number}`を追加） |
| `reviveOnDestroy.cost`に`exhaustSelf`（発生源自身＝ネクサスを疲労）が無い | BS17-069 Lv2 | `reviveOnDestroy.cost`は`millSelfCount`等はあるが`exhaustSelf`が無い（grep 0件）。他の多くのkind（`activated`/`magicNegate`等）は`{exhaustSelf:true}`を持つが、`reviveOnDestroy`側には同種の選択肢が定義されていない | `server/src/types/effectDef.ts`（`reviveOnDestroy.cost`に`{exhaustSelf:true}`を追加） |
| マジック色ロックを「直前のイベントの色」で動的に決める軸が無い | BS17-083 | `magicRestriction`の`colorLockOpponent`は使用者自身のフィールド色を見る静的判定で、「相手の召喚時効果が解決されたときの、そのカードの色」という**都度記録する色**を参照する前例・状態フィールドが無い（grep 0件） | `server/src/type.ts`（GameStateに色の一時記録フィールドを追加）、`server/src/types/effectDef.ts`（`magicRestriction`か新規kindに軸追加） |
| `triggered.onSummon`に「バースト効果による召喚のときだけ発火」の軸が無い | BS17-044 Lv1-3 | `fushiSummonOnly`/`sokuSummonOnly`相当の`burstSummonOnly`が無い（grep 0件）。カードデータにも「バースト効果で召喚されたとき」の前例なし | `server/src/types/effectDef.ts`（`triggered`に`burstSummonOnly`追加） |
| デッキが相手に破棄されるとき、条件一致カードをトラッシュでなく手札へ差し替える器の汎用化 | BS17-070 Lv1-2 | 唯一の近似前例`milledMagicToTegamoto`（BS06-085）はマジック限定・行き先tegamoto固定で引数化されておらず、hasBurstフィルタ／手札行きに使えない。「このターンの間デッキは破棄されない」の`playerRule noDeckMillForPid`も型定義はあるが実カードでの使用例が0件 | `server/src/types/effectDef.ts`（`milledMagicToTegamoto`にfilter/dest軸を追加するか新規kind）、`data/cards`側で`noDeckMillForPid`の初適用例を確認 |

## 節ごとの対応表

### BS17-037 カピッパ（バニラではない・低コスト）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1/2 破壊時: 光芒/魔光芒持ち自分スピリット1体を回復 | 既存 | `kind:"triggered", trigger:"onDestroy"`, `action:{type:"refreshOne", filter:{keywords:["kobo","makobo"]}}` | BS11-081（keywordsFilter OR） |

### BS17-038 カルミオン・キャット

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| マジック使用後、このターンBP+2000 | 既存 | `kind:"fieldEvent", event:"ownMagicUsed", action:{type:"timedEffect", content:[{type:"bp", amount:2000}], duration:"turn", target:"self"}` | BS12-058-e2（ownMagicUsed fieldEvent） |

### BS17-039 イラス・バード

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3【光芒】アタック時 | 既存 | `kind:"keyword", keyword:"kobo"` | kobo.ts |
| Lv2-3 アタック時中、マジック使用後、相手スピリット1体疲労 | 既存 | `kind:"fieldEvent", event:"ownMagicUsed", condition:"selfIsAttacking", action:{type:"exhaust", count:1}` | 既存condition一覧（selfIsAttacking） |

### BS17-040 呪術士リオ

バニラ。

### BS17-041 天使グレイエル

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| エンドステップ: 光芒/魔光芒持ち1体につきデッキ上1枚オープン、マジックなら手札、他は破棄 | **新しい部品**（`reveal.countPer`に`ownKeyword`軸が無い。grep: `countPer`は`{ownColorTotal}`\|`{ownNexuses:true}`\|`{ownSymbols}`のみ） | `kind:"step", step:"end", action:{type:"reveal", count:1, pick:{cardType:"magic"}, pickCount:1, dest:"hand", rest:"trash"}` の`count`を動的化する軸が要る | 新しい部品 |
| Lv3【光芒】アタック時 | 既存 | `kind:"keyword", keyword:"kobo"` | kobo.ts |

### BS17-042 アマゾネス・ガール

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3【光芒】アタック時 | 既存 | `kind:"keyword", keyword:"kobo"` | kobo.ts |
| Lv2-3 ターン1回、マジック使用後このスピリット回復 | 既存 | `kind:"fieldEvent", event:"ownMagicUsed", oncePerTurn:true, condition:"selfIsAttacking", action:{type:"refreshSelf"}` | BS09-X39-e2形 |

### BS17-043 神獣セグー

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 光芒/魔光芒持ちアタック中、フラッシュで手札のバーストマジックのコストを払いバースト条件無視で発揮 | **新しい部品**（grep: `type.ts`/`effectDef.ts`に「バースト条件を無視」に相当する軸なし、カードデータにも同文言の前例0件） | 未確定 | 新しい部品 |

### BS17-044 アマゾネス・クィーン

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件 | 既存 | `kind:"burst"` | 汎用 |
| 召喚時（バーストで召喚時）: トラッシュの光芒持ちスピリット1枚無償召喚 | **新しい部品**（`triggered.onSummon`に「バースト効果による召喚のときだけ発火」の軸が無い。grep: `fushiSummonOnly`/`sokuSummonOnly`はあるが`burstSummonOnly`相当は0件。カードデータにも「バースト効果で召喚されたとき」の前例なし。action自体は`summonFromTrashFree`で既存だが、keywordFilterも単数のみでkobo/makoboのOR未対応） | `kind:"triggered", trigger:"onSummon", action:{type:"summonFromTrashFree", keywordFilter:"kobo"}` の発火条件側が要拡張 | 新しい部品 |
| エンドステップ: 光芒/魔光芒持ち3体回復 | 既存 | `refreshOne, count:3, filter:{keywords:[...]}` | 同上 |

### BS17-045 黄玉の女王フェルネイト

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3【光芒】アタック時 | 既存 | `kind:"keyword", keyword:"kobo"` | kobo.ts |

### BS17-046 オリクス盗賊団

バニラ。

### BS17-047 戦獣キャメルーン

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 自分スピリット3体以下の間、このスピリットBP+2000 | **新しい部品**（`AuraCondition`に`maxOwnSpirits`が無い。grep: `{maxOwnSpirits}`は`kind:"levelAs"`の`condition`union専用＝BS08-004/BS12-062の前例はいずれも`levelAs`で、`aura`/`constraint`が使う`AuraCondition`には同軸が定義されていない） | `kind:"aura", aura:{type:"bp", target:"self", amount:2000, condition:{maxOwnSpirits:3}}` の`condition`拡張が要る | 新しい部品 |

### BS17-048 熊人ラーテシード

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| お互いボイドからライフにコア置けない | 既存 | `kind:"globalConstraint", constraint:{type:"noVoidToLife"}` | 型一覧に存在 |
| 相手アタック中、自分スピリット3体以下ですべてBP+2000 | **新しい部品**（047と同じ部品＝`AuraCondition`に`maxOwnSpirits`が無い） | `kind:"aura", aura:{type:"bp", target:"ownAll", amount:2000, condition:{maxOwnSpirits:3}, phaseTurn:{phase:"attack", turn:"opponent"}}` | 新しい部品（047と共通） |

### BS17-049 ロック・アラディン

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件 | 既存 | `kind:"burst"` | 汎用 |
| 召喚時: 手札のネクサス1枚無償配置 | 既存 | `kind:"triggered", trigger:"onSummon", action:{type:"deployNexus", from:"hand", optional:true}` | BS10-076バズーカ・アームズ（ブレイヴの`onSummon`+`deployNexus from:"hand"`。deployNexus自体が常時無償） |
| 相手スタート時: ネクサス疲労で相手バースト1つを見る | **新しい部品**（上表） | — | — |

### BS17-050 ランテゴス

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 相手がバーストセット時、ボイドからコア1個を自分スピリット/ネクサスに | 既存 | `kind:"fieldEvent", event:"opponentBurstSet"` | type.ts:269 |

### BS17-051 豹人アリババ

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| アタック時、ライフ減少の代わりにコアを段階的に残してリザーブへ | **新しい部品**（tieredコア数） | — | — |

### BS17-052 アラビアン騎士シンド・バード

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 雄将持ち自分スピリット破壊時、デッキ5枚破棄で回復状態で残す | 既存 | `kind:"reviveOnDestroy", scope:"ownAll", familyFilter:"雄将", when:{byOpponent:true}, phaseTurn:{phase:"attack", turn:"opponent"}, cost:{millSelfCount:5}, revived:{rested:true}` | BS14-078幽鬼集う廃都（`scope:"ownAll"`+`millSelfCount`+`phaseTurn`own-attackの組み合わせ）yReviveOnDestroy`型あり） |
| 相手バーストセット時、コスト6以下相手スピリット1体破壊 | 既存 | `kind:"fieldEvent", event:"opponentBurstSet", action:{type:"destroy", filter:{cost:{max:6}}}` | 上のBS17-050と同系 |

### BS17-053 青玉の海竜シュトロドーム

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【粉砕】アタック時、Lv分デッキ破棄 | 既存 | `kind:"keyword", keyword:"funsai"` | type.ts:296コメント通り |

### BS17-054 マジン・ゴレム

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 自分の[ロック・アラディン]すべて、相手マジックの効果を受けない | **新しい部品**（immunityGrantへのnameIncludes） | — | — |
| 破壊時: [ロック・アラディン]がいる間、疲労状態で残る | 既存 | `kind:"reviveOnDestroy", scope:"self", requireOwnFieldHasName:"ロック・アラディン", revived:{rested:true}` | BS05-040プリンセス・スノーホワイト（`requireOwnFieldHasName:"ドワッフー・セブン"`） |

### BS17-059 ホルス・ジェッター（ブレイヴ）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 召喚時: このターン相手スピリットすべてLv1として扱う | 既存 | `action:{type:"timedEffect", content:[{type:"level", set:1}], duration:"turn", all:true}` | BS14-110天災之禍風（全く同文「このターンの間、相手のスピリットすべてをLv1として扱う」で同一の書き方）認 |

### BS17-060 ジン・アームズ（ブレイヴ）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 召喚時: このターン相手のマジック使用に「使用コスト以上を破棄しないと発揮できない」課税 | **新しい部品** | — | — |

### BS17-069 輝く三連王墓（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 自分アタック中フラッシュ: 手札マジック1枚破棄でこのターン1体BP+3000 | 既存 | `kind:"activated"`, `pay:{discardHand:1}` + `timedEffect bpBuff` | 汎用pay+timedEffect |
| お互いアタック中: 光芒/魔光芒持ち自分スピリットが相手に破壊時、ネクサス疲労で疲労状態で残す | **新しい部品**（`reviveOnDestroy.cost`に`exhaustSelf`が無い。grep: `reviveOnDestroy`の`cost`union は`millSelfCount`等はあるが`exhaustSelf`は無い。他kindの`{exhaustSelf:true}`はcardId一致例なし＝この`kind`専用の別unionのため流用不可） | `kind:"reviveOnDestroy", scope:"ownAll", keywords:["kobo","makobo"], when:{byOpponent:true}, cost:{exhaustSelf:true}` の`cost`拡張が要る | 新しい部品 |

### BS17-070 密林の秘境都市（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 相手によりデッキからバースト持ちが破棄時、手札に加え、このターンデッキ破棄されない | **新しい部品**（前半：`milledMagicToTegamoto`が唯一の近い前例＝BS06-085だが、マジック限定・行き先tegamoto固定で引数化されておらず、hasBurstフィルタ／手札行きに使えない。後半：`playerRule`の`noDeckMillForPid`は`type.ts`に定義はあるが実カードでの使用例が0件＝precedent条件を満たせない） | 未確定 | 新しい部品 |
| 自分アタック中、マジック使用後ドロー1（ターン1回） | 既存 | `fieldEvent ownMagicUsed, oncePerTurn:true, action:{type:"draw",count:1}` | 汎用 |

### BS17-071 開かれた岩扉（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| お互いアタック中: コスト0/3/6のスピリットはブロックできない | **新しい部品**（cantBlockByCost） | — | — |
| お互いアタック中: 雄将持ち自分スピリットがBP比較で相手だけ破壊時、ボイドからコア1個をこのネクサスへ | 既存 | `kind:"battleWon", role:"any", winnerFamilyFilter:"雄将", selfMode:"source", action:{type:"placeCores", from:"void", to:"nexus", target:"self", count:1}` | BS09-056星創られし場所（ネクサスの`battleWon`+`winnerFamilyFilter`）／BS06-063造兵技師ガタン（`selfMode:"source"`+`placeCores`from void to self） |

### BS17-072 願い叶えるランプ（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 相手アタック開始時、自分スピリット2体以下なら相手は回復状態が3体になるよう疲労 | **新しい部品**（exhaustの閾値版） | — | — |
| 自分の[ロック・アラディン]すべて、相手スピリット/ブレイヴの効果を受けない | **新しい部品**（immunityGrantへのnameIncludes、against軸も"spirit/brave"が必要か要確認） | — | — |

### BS17-081 ネフェルウアーブ（マジック）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件 | 既存 | `kind:"burst"` | 汎用 |
| Lv指定、このターン指定Lv相手スピリットすべて効果を失い新たに得ない | **新しい部品**（spiritEffectsDisabledGrantへの対象Lv軸） | — | — |
| その後コストを払いフラッシュ発揮 | 既存 | `type:"pay"` / `sequence` | COST_MODEL.md |
| フラッシュ: このターンスピリット1体BP+3000 | 既存 | `timedEffect bpBuff` | 汎用 |

### BS17-082 リバーシブルスパーク（マジック）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| フラッシュ: このバトルBP比較時、自分と相手のスピリットのBPを入れ替える | 既存 | `action:{type:"swapBattler"}` | effectAction一覧に型名あり |

### BS17-083 アブラカダブラ（マジック）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件（相手の召喚時効果発揮後） | 既存 | `kind:"burst"`, event:"opponentSummonEffectResolved" | type.ts:267 |
| このターン相手は、召喚時効果を発揮したスピリット/ブレイヴと同色のマジックを使用できない | **新しい部品**（grep: `magicRestriction`の`colorLockOpponent`は使用者自身のフィールド色を見る静的判定のみで、「直前に解決した召喚時効果の色」を記録する`GameState`フィールド・軸のいずれも存在しない） | 未確定 | 新しい部品 |
| その後払いフラッシュ | 既存 | `pay`/`sequence` | 汎用 |
| フラッシュ: 召喚時効果持つスピリットすべて疲労 | 既存 | `action:{type:"exhaust", filter:{hasTrigger:"onSummon"}, all:true}` | TargetFilter.hasTrigger |

### BS17-084 トライアングルバン（マジック）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| フラッシュ: コスト指定、このターン相手は指定コストのバースト効果を発揮できない | **新しい部品** | — | — |

### BS17-X05 魅惑の覇王クレオパトラス

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件（自分ライフ減少後）＋自分ライフ3以下でコスト無償召喚 | 既存 | `kind:"burst", event:"ownLifeDamaged", condition:{ownLifeAtMost:3}, action:{type:"summonBurstCardFree"}` | BS16-054古の獣王ギルガメシュ（完全一致：`event:"ownLifeDamaged", condition:{ownLifeAtMost:3}, action:{type:"summonBurstCardFree"}`）／BS16-X03烈の覇王セイリュービ |
| Lv1-3 召喚時: トラッシュのマジック1枚を手札に戻す | 既存 | `action:{type:"recoverMagicFromTrash"}` | BS12-058-e1 |
| Lv2-3【魔光芒】アタック時、マジック使用後もう1度だけ同じ効果発揮 | 既存（keyword部分はmakobo新設が前提。中身のrepeatはmagicRepeatGrantで既存） | `kind:"magicRepeatGrant", condition:"selfInBattle"` | BS07-X27-e2 |
| バトル終了時、トラッシュの使用済みマジックすべて手札に戻る | 既存だがkoboの挙動そのもの＝makoboキーワードに統合される想定 | kobo.ts拡張 | — |

### BS17-X06 千夜一夜物語の女帝シェハラザード

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 召喚時: 手札の雄将持ちスピリット1枚無償召喚 | 既存 | `kind:"triggered", trigger:"onSummon", action:{type:"summonFromHandFree", familyFilter:"雄将"}` | BS05-009火龍王ボルケノス（`summonFromHandFree, familyFilter:"竜人"`）／BS05-042／BS07-045 |
| Lv2-3 アタック中、覇皇/雄将持ちがライフ減少時、代わりにコア段階減算 | **新しい部品**（BS17-051と同一。tieredコア数） | — | — |

## 確認事項

1. **【魔光芒】の正式な定義をどう切り出すか**: X05にしか全文が無い。私はこう読みました → 「【魔光芒】＝【光芒】の効果（バトル終了時トラッシュのマジックを手札へ）＋アタック中のマジック使用後もう1度だけ発揮（`magicRepeatGrant`相当）」を1つのキーワードとして丸ごと持つ。これでよいか、それとも印刷上は「光芒とは無関係の全く別の派生キーワード」（=X05以外のカードが「光芒/魔光芒」と併記するのは単に"どちらでも対象になる"という意味で、魔光芒自体にトラッシュ回収効果は含まれない可能性）か、解釈確認をお願いします。
2. **BS17-054/072の「[カード名]がいる間」「[カード名]すべては〜効果を受けない」**: immunityGrantへのnameIncludes追加＋against軸拡張でよいか、それとも既存のconstraintGrant（nameIncludesあり）とconstraint:{type:"..."}の組み合わせで書けるか（immunityGrantの"against"軸がconstraintGrant側に無いため、単純に統合できない可能性）を確認してください。

（確認事項3「BS17-047/048/059/069/071/X06の実地確認」は grep + cardId 検証で解消しました。059/052/054/071Lv2/X05/X06Lv1-3 は既存の器で書ける（前例cardIdは各行に記載）。047/048/069Lv2/083 は grep 0件のため新しい部品へ移しました。041・043 も同様に検証し、新しい部品へ確定しています。）
