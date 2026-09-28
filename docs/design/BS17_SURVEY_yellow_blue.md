# BS17 黄・青（30枚）調査メモ

対象: `data/staging/BS17.json` のうち黄（037-045, 059, 069, 070, 081, 082, X05）・青（046-054, 060, 071, 072, 083, 084, X06）30枚。

## 集計

- 全節数: 45（バニラ3枚除く。BS17-040/046 はバニラ、BS17-X05のバースト条件を1節に含む）
- 既存の器だけで書ける節: 33
- 新しい部品が要る節: 12（下記一覧。同じ部品が複数カードで再利用されるものを含む）

## 新しい部品一覧

| 部品名 | 対象カード | 理由 | 差し込み先 |
| :-- | :-- | :-- | :-- |
| Keyword `"makobo"`（【魔光芒】） | X05、他29枚中20枚超が参照 | 【光芒】(kobo)とは別枠のキーワード。既存 `Keyword` union に無い。X05の全文が「バトル終了時トラッシュのマジックを手札に戻す」（=koboの挙動）＋「マジック使用後もう1度発揮できる」の複合であり、kobo一枚では表現できない | `server/src/type.ts`（Keyword union）、`server/src/logic/keywords/kobo.ts`（`hasStaticKobo`判定に`makobo`も含める） |
| tieredコア数（ライフのコアを段階的に減らして代わりに置く） | BS17-051, X06（同一文言） | 既存`removeCores`の`leaveAtLeast`/`downTo`は固定値のみ。「7個以上→4個、6/5個→3個、4個→2個」という閾値テーブルは無い。ライフダメージの代替処理（`negateLifeDamageFromTarget`系ではなくコア減算量を差し替える）としても前例なし | `server/src/types/effectAction.ts`（`removeCores`に`tieredLeaveAtLeast`のような軸を追加）、`server/src/logic/EffectModules.ts` |
| `cantBlockByCost`（GlobalConstraintDef） | BS17-071 Lv1-2 | 既存`cantAttackByCost`のブロック版が無い。`costCantAct`はアタック/ブロック両方を止めてしまい、この効果はブロックだけを止める | `server/src/type.ts`（`GlobalConstraintDef`）、`server/src/logic/EffectModules.ts` |
| 「相手のバースト1つの内容を見る」（見る対象がバーストエリア） | BS17-049 Lv2 | 既存`peekOpponentHand`は手札からランダム1枚を見る専用。バーストエリアにセットされたカードを見る器が無い | `server/src/types/effectAction.ts`、`server/src/logic/EffectModules.ts` |
| コスト指定バースト無効化（このターンの間、指定コストのバースト効果を発揮できない） | BS17-084 | 「バースト効果を発揮できない」の前例なし（`burstSetCost`はセットに追加コストを課すだけで、発揮自体は止めない） | `server/src/types/effectDef.ts`（新規`kind`か`playerRule`拡張）、`server/src/logic/EffectModules.ts` |
| マジック使用への「コスト以上のカードを破棄しなければ発揮できない」課税 | BS17-060 | 既存の氷壁(`magicNegate`)は無効化のみで、「破棄しなければ発揮できない」という条件付き無効化の前例なし | `server/src/types/effectDef.ts`、`server/src/logic/EffectModules.ts` |
| `spiritEffectsDisabledGrant`への対象Lv絞り込み | BS17-081 | 既存は発生源自身の`levels`（＝いつ有効か）のみで、**対象スピリットの現在Lv**で絞る軸が無い。「指定したLvの相手のスピリットすべては効果を失う」は対象側のLv一致が必須 | `server/src/types/effectDef.ts`（`spiritEffectsDisabledGrant`に`targetLevel`等を追加） |
| `immunityGrant`への名前（nameIncludes）絞り込み | BS17-054 Lv1-2, BS17-072 Lv2 | 既存`immunityGrant`はfamily/color/keyword/vanillaの絞り込みのみで、カード名（[ロック・アラディン]）による絞り込みが無い。`constraintGrant`にはnameIncludesがあるが`immunityGrant`には無い | `server/src/types/effectDef.ts`（`immunityGrant`に`nameIncludes`追加） |
| 疲労数を「回復状態がN体になるまで」で指定する`exhaust`の閾値版 | BS17-072 Lv1-2 | 既存`exhaust`は疲労させる体数を直接指定するのみ。「回復状態のスピリットが3体になるように」という現在の回復状態数を見て差分だけ疲労させる軸が無い | `server/src/types/effectAction.ts`（`exhaust`に`untilRefreshedCount`等を追加） |

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
| エンドステップ: 光芒/魔光芒持ち1体につきデッキ上1枚オープン、マジックなら手札、他は破棄 | **新しい部品**（「1体につき」の反復自体は`countCounter`で書けるが、「デッキをN回1枚ずつオープンし判定」という複合手順の前例確認まで至らず。要追加調査） | `kind:"step", step:"end", action:{type:"reveal", count:<countCounter ownKeywords:["kobo","makobo"]>, ...}` の形で書けるか要検証 | 要確認 |
| Lv3【光芒】アタック時 | 既存 | `kind:"keyword", keyword:"kobo"` | kobo.ts |

### BS17-042 アマゾネス・ガール

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3【光芒】アタック時 | 既存 | `kind:"keyword", keyword:"kobo"` | kobo.ts |
| Lv2-3 ターン1回、マジック使用後このスピリット回復 | 既存 | `kind:"fieldEvent", event:"ownMagicUsed", oncePerTurn:true, condition:"selfIsAttacking", action:{type:"refreshSelf"}` | BS09-X39-e2形 |

### BS17-043 神獣セグー

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 光芒/魔光芒持ちアタック中、フラッシュで手札のバーストマジックのコストを払いバースト条件無視で発揮 | 要確認（`burstMagicFreeOrThenPay`等の既存actionで書けるか未検証。バースト条件無視は前例が薄い可能性） | 未確定 | 要確認 |

### BS17-044 アマゾネス・クィーン

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件 | 既存 | `kind:"burst"` | 汎用 |
| 召喚時（バーストで召喚時）: トラッシュの光芒持ちスピリット1枚無償召喚 | 既存 | `kind:"triggered", trigger:"onSummon", condition/burstSummonOnly的な軸 + action:{type:"summonFromTrashFree", filter:{keywords:["kobo","makobo"]}}` | 要cardId確認だが型は揃っている |
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
| 自分スピリット3体以下の間、このスピリットBP+2000 | 既存（要`aura`/`bpBuff`系のcondition確認だが「自分スピリット数」条件は一般的） | `kind:"aura"` か `kind:"fieldEvent"` + `phaseTurn` + 条件 | 要cardId確認 |

### BS17-048 熊人ラーテシード

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| お互いボイドからライフにコア置けない | 既存 | `kind:"globalConstraint", constraint:{type:"noVoidToLife"}` | 型一覧に存在 |
| 相手アタック中、自分スピリット3体以下ですべてBP+2000 | 既存（047と同系統） | `aura`かfieldEvent | 要cardId確認 |

### BS17-049 ロック・アラディン

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件 | 既存 | `kind:"burst"` | 汎用 |
| 召喚時: 手札のネクサス1枚無償配置 | 既存 | `action:{type:"deployNexus", free:true}` 相当 | 要cardId確認 |
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
| 雄将持ち自分スピリット破壊時、デッキ5枚破棄で回復状態で残す | 既存 | `kind:"fieldEvent", event:"ownSpiritDestroyed", familyFilter:"雄将", action` 経由の`reviveOnDestroy`＋mill5コスト | 要cardId確認（`applyReviveOnDestroy`型あり） |
| 相手バーストセット時、コスト6以下相手スピリット1体破壊 | 既存 | `kind:"fieldEvent", event:"opponentBurstSet", action:{type:"destroy", filter:{cost:{max:6}}}` | 上のBS17-050と同系 |

### BS17-053 青玉の海竜シュトロドーム

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【粉砕】アタック時、Lv分デッキ破棄 | 既存 | `kind:"keyword", keyword:"funsai"` | type.ts:296コメント通り |

### BS17-054 マジン・ゴレム

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 自分の[ロック・アラディン]すべて、相手マジックの効果を受けない | **新しい部品**（immunityGrantへのnameIncludes） | — | — |
| 破壊時: [ロック・アラディン]がいる間、疲労状態で残る | 既存の可能性（`reviveOnDestroy`＋条件`ownFieldHasName`相当）だが条件軸の存在未確認 | 要確認 | 要確認 |

### BS17-059 ホルス・ジェッター（ブレイヴ）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 召喚時: このターン相手スピリットすべてLv1として扱う | 既存 | `action:{type:"timedEffect", content:[{type:"levelAs", level:1}], duration:"turn", side:"opponent"?, all:true}`（levelAs type存在確認済み） | 要cardId確認 |

### BS17-060 ジン・アームズ（ブレイヴ）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 召喚時: このターン相手のマジック使用に「使用コスト以上を破棄しないと発揮できない」課税 | **新しい部品** | — | — |

### BS17-069 輝く三連王墓（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 自分アタック中フラッシュ: 手札マジック1枚破棄でこのターン1体BP+3000 | 既存 | `kind:"activated"`, `pay:{discardHand:1}` + `timedEffect bpBuff` | 汎用pay+timedEffect |
| お互いアタック中: 光芒/魔光芒持ち自分スピリットが相手に破壊時、ネクサス疲労で疲労状態で残す | 既存（052と同系のreviveOnDestroy、コストがネクサス疲労） | 要cardId確認 | 要確認 |

### BS17-070 密林の秘境都市（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 相手によりデッキからバースト持ちが破棄時、手札に加え、このターンデッキ破棄されない | 既存（`hasBurst`フィルタ＋`fieldEvent`＋`noDeckMillForPid`系timed grant） | 要組み合わせ確認 | TargetFilter.hasBurst |
| 自分アタック中、マジック使用後ドロー1（ターン1回） | 既存 | `fieldEvent ownMagicUsed, oncePerTurn:true, action:{type:"draw",count:1}` | 汎用 |

### BS17-071 開かれた岩扉（ネクサス）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| お互いアタック中: コスト0/3/6のスピリットはブロックできない | **新しい部品**（cantBlockByCost） | — | — |
| お互いアタック中: 雄将持ち自分スピリットがBP比較で相手だけ破壊時、ボイドからコア1個をこのネクサスへ | 要確認（battle勝利イベントの前例調査未了） | 要確認 | 要確認 |

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
| このターン相手は、召喚時効果を発揮したスピリット/ブレイヴと同色のマジックを使用できない | 要確認（色を動的に記録して縛る前例の有無は未調査） | 要確認 | 要確認 |
| その後払いフラッシュ | 既存 | `pay`/`sequence` | 汎用 |
| フラッシュ: 召喚時効果持つスピリットすべて疲労 | 既存 | `action:{type:"exhaust", filter:{hasTrigger:"onSummon"}, all:true}` | TargetFilter.hasTrigger |

### BS17-084 トライアングルバン（マジック）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| フラッシュ: コスト指定、このターン相手は指定コストのバースト効果を発揮できない | **新しい部品** | — | — |

### BS17-X05 魅惑の覇王クレオパトラス

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト条件（自分ライフ減少後）＋自分ライフ3以下でコスト無償召喚 | 要確認（burst条件に「自分の残りライフ」を見る軸があるか未調査） | 要確認 | 要確認 |
| Lv1-3 召喚時: トラッシュのマジック1枚を手札に戻す | 既存 | `action:{type:"recoverMagicFromTrash"}` | BS12-058-e1 |
| Lv2-3【魔光芒】アタック時、マジック使用後もう1度だけ同じ効果発揮 | 既存（keyword部分はmakobo新設が前提。中身のrepeatはmagicRepeatGrantで既存） | `kind:"magicRepeatGrant", condition:"selfInBattle"` | BS07-X27-e2 |
| バトル終了時、トラッシュの使用済みマジックすべて手札に戻る | 既存だがkoboの挙動そのもの＝makoboキーワードに統合される想定 | kobo.ts拡張 | — |

### BS17-X06 千夜一夜物語の女帝シェハラザード

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 召喚時: 手札の雄将持ちスピリット1枚無償召喚 | 既存 | `action:{type:"summonFromHandFree", filter:{family:"雄将"}}` | 要cardId確認だがtype一覧に`summonFromHandFree`あり |
| Lv2-3 アタック中、覇皇/雄将持ちがライフ減少時、代わりにコア段階減算 | **新しい部品**（BS17-051と同一。tieredコア数） | — | — |

## 確認事項

1. **【魔光芒】の正式な定義をどう切り出すか**: X05にしか全文が無い。私はこう読みました → 「【魔光芒】＝【光芒】の効果（バトル終了時トラッシュのマジックを手札へ）＋アタック中のマジック使用後もう1度だけ発揮（`magicRepeatGrant`相当）」を1つのキーワードとして丸ごと持つ。これでよいか、それとも印刷上は「光芒とは無関係の全く別の派生キーワード」（=X05以外のカードが「光芒/魔光芒」と併記するのは単に"どちらでも対象になる"という意味で、魔光芒自体にトラッシュ回収効果は含まれない可能性）か、解釈確認をお願いします。
2. **BS17-041のエンドステップ効果**（光芒/魔光芒持ち1体につきデッキ1枚オープン）の反復方法（`countCounter`で複数回`reveal`を回すか、専用actionが要るか）は前例未確認のため、実装着手前に別途調査が必要です。
3. **BS17-043の「バースト条件を無視して発揮」**は前例の有無を確認できていません。バースト条件無視の既存器があるか、実装側で改めて調査してください。
4. **BS17-047/048/059/069/071/X06の一部節**（自分スピリット数条件のBP修正、reviveOnDestroyのコスト差し替え、battle勝利イベント等）は「既存で書けるはず」と判定しましたが、対応するcardIdでの実地確認（grep）まで手が回っていません。実装前にそれぞれ1件、既存カードのJSONを確認してください。
5. **BS17-054/072の「[カード名]がいる間」「[カード名]すべては〜効果を受けない」**: immunityGrantへのnameIncludes追加でよいか、それとも既存のconstraintGrant（nameIncludesあり）とconstraint:{type:"..."}の組み合わせで書けるか（immunityGrantの"against"軸がconstraintGrant側に無いため、単純に統合できない可能性）を確認してください。
