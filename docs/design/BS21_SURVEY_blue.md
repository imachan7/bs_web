# BS21 調査メモ：blue（調査役）
対象：BS21-046〜054・065・066・072・083・084・X06・X08（CP13-01 は対象外）。実装はしていない。
ルールの読みは BS19_PLAN §2.1・§2.15・§2.2、BS20_PLAN §1〜§3 に従う。ソードブレイヴ（X08）は通常のブレイヴと同じ扱い（2026-11-05 ユーザー確認）。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の総数：31（046:1 / 047:1 / 048:2 / 049:0 / 050:3 / 051:1 / 052:2 / 053:3 / 054:2 / 065:2 / 066:1 / 072:2 / 083:1 / 084:4 / X06:4 / X08:2）
- 既存の器で書ける：24 節
- 新しい部品が要る：7 節（§2 の 1〜7。各 1 節ずつ）
- 連鎖：5 枚・8 節（048×1・050×2・053×1・084×2・X06×2）。いずれも連鎖の中身は既存の器
- 強化：【強化】を持つカードは 0 枚。絞り込み「強化を持つ」2 箇所（X06 連鎖[赤]・053 は【強化】の無効化）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | timedContent `noRefreshByAnyEffect`（side 軸：相手・期間 battle）（アクション） | 「回復できない」は globalConstraint `noRefreshByAnyEffect`（BS15-072-e1。両陣営・発生源が場にある間）しか無く、side・期間の軸が無い。timedEffect（duration:"battle", side:"opponent"）に載せる内容型が無い | 048 連鎖元 |
| 2 | fieldEvent `opponentBurstActivating`（相手のバースト発動の解決前。タイミング）＋ action「そのバーストの発動を無効にして破棄」（アクション） | fieldEvent には `ownBurstActivated`（解決が**終わった後**・自分側）しか無い。無効化も `magicNegate` はマジック専用で、バーストの発動を無効にする action が無い。pay（自分の異合1体を破壊する）は既存の `pay`＋`destroy` で書ける | 052 節1 |
| 3 | 相手の【強化】の無効化（globalConstraint `kyokaSuppressed` side: opponent。条件の軸） | 【強化】は keyword エントリで `logic/keywords/kyoka.ts` が effectSources を数える。止める側の軸が無い（`constraintSuppression` は constraint 向け・`triggerSuppression` は誘発向けで、kyoka の加算に効かない） | 053 Lv2 |
| 4 | EffectCounter `selfCost`（self の印刷コスト。カウンタ） | self 系のカウンタに selfBp・selfLevel・selfCores・selfSymbols はあるがコストが無い。`lastCost` は「直前に動いたカード」で、ライフを減らしたアタッカーのコストは取れない | 054 Lv2 |
| 5 | symbolAddGrant `whileSpirit: true`（スピリット状態の間。条件の軸） | symbolAddGrant は `whileCombined` と condition（ownFieldHasBraveInSpiritState 等）しか持たず、発生源自身がスピリット状態の間、の軸が無い。constraint には同じ軸 `whileSpirit` がある（BS14-070-e1） | 065 Lv1 |
| 6 | ターン全体・両陣営のバースト発動禁止（timedContent/globalConstraint `noBurstActivation` side: both, 期間 turn。条件の軸） | `battleLock lock:"burst"` は期間 battle のみ（BS15-X03-e1）。`noBurstActivationByColor`/`ByEvent` は発生源の**相手側**限定で色・イベント軸（globalConstraint.ts:110-111）。「このターンの間、お互いは」の書き方が無い | 072 Lv2 |
| 7 | 相手のブレイヴの合体条件の下限（globalConstraint `braveConditionMinCost` minCost: 7, side: opponent。条件の軸） | 合体条件を触る既存の器は `ignoreBraveCondition`（自分が無視できる：constraintDef.ts:28）・`cantCombine`・`combineLimit` だけで、**相手の**ブレイヴ/ブレイヴカードの合体条件の値を書き換える軸が無い（matchesBraveCondition に差し込む口が無い） | X06 Lv2-3 |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| 046 | Lv1-2『相手のアタックステップ』コスト0の相手のスピリットはアタックできない | globalConstraint `opponentCantAttackByCost costs:[0]`（BS12-X05-e2。「コスト2/3/5/7/11の相手のスピリットはアタックできない」の同じ形。phase/turn の絞りは BS20-072-e1 参照） |
| 047 | Lv1-2『自分のアタックステップ』闘神がアタックしたとき、そのスピリットをBP+2000し、相手のデッキを1枚破棄 | fieldEvent `anySpiritAttacked` subjectFilter family 闘神（BS20-X05-e1「系統：「天霊」を持つ自分のスピリットがアタックしたとき」の同じ形）＋ action sequence：timedEffect bp+2000（BS19-008-e1 の `{"type":"timedEffect","content":[{"type":"bp","amount":5000}],"duration":"battle","target":"self"}` と同じ形）＋ discard from deck 1（BS06-090-e1） |
| 048 | Lv1-3『このスピリットのバトル時』このバトルの間、相手のスピリットすべては回復できない | triggered onBattleStart（BS15-X03-e1）＋ **新しい部品 1**（timedEffect duration battle side opponent） |
| 048 | 連鎖（条件 紫×1）：相手のスピリットのコア1個を相手のリザーブに置く | 連鎖の形は sequence＋if ownColorSymbols（BS19-006-e1）。removeCores は BS13-013-e1 の removeCores の行き先リザーブ版 |
| 049 | （効果文なし） | 書くもの無し |
| 050 | Lv1-2『このスピリットの召喚時』コスト3の相手のスピリット1体を破壊する（連鎖元） | triggered onSummon＋destroy filter cost（BS20-051-e1「コスト4以下の相手のスピリット1体を破壊する」の `{"type":"destroy","count":1,"filter":{"cost":{"max":4}}}` と同じ形） |
| 050 | 連鎖（条件 赤×1／紫×1）[赤]：相手のネクサス1つを破壊する | destroy nexus:"only"（BS20-012-e1 の `{"type":"destroy","nexus":"only","count":1}` と同じ形） |
| 050 | 連鎖（条件 赤×1／紫×1）[紫]：自分はデッキから1枚ドローする | draw 1（BS19-006-e1 の連鎖[紫]と同じ形） |
| 051 | Lv2：このスピリットは赤のスピリットとしても扱う | kind `colorAs`（BS03-053-e1「このスピリットは白のスピリットとしても扱う」の `{"kind":"colorAs","levels":[2],"colors":["white"]}` と同じ形） |
| 052 | Lv1-3『お互いのアタックステップ』相手のバーストが発動したとき、異合1体を破壊することで、そのバーストの発動を無効にして破棄する | **新しい部品 2**（fieldEvent＋無効化 action）。pay（cost: destroy 自分の異合1体）は `pay`＋destroy filter family（BS20-009-e1 の destroy と COST_MODEL §1 の pay） |
| 052 | Lv2-3【合体時】『このスピリットのバトル時』異合1体につきBP+2000 | aura type bp target self amountPer 2000 counter `{ownFamily:"異合"}`（BS15-X03-e2 の aura bp＋counter と同じ形。auraCounter `ownFamily` は auraCounter.ts:16）＋ whileCombined（BS14-070-e2） |
| 053 | Lv1-2『このスピリットの召喚時』天霊を持つ相手1体を破壊する（連鎖元） | triggered onSummon＋destroy filter family（BS20-009-e1「系統：「覇皇」を持つ相手のスピリット1体を破壊する」の `{"type":"destroy","count":1,"filter":{"family":"覇皇"}}` と同じ形） |
| 053 | 連鎖（条件 紫×1）：星魂を持つ相手1体を破壊する | destroy filter family（BS19-008-e1 の連鎖[紫]「系統：「殻人」を持つ相手のスピリット1体を破壊する」と同じ形） |
| 053 | Lv2：相手のスピリットの【強化】は発揮されない | **新しい部品 3** |
| 054 | Lv1-3：相手の効果によって相手の手札が増えたとき、増えたカード1枚につき、相手のデッキを1枚破棄する | fieldEvent `opponentHandAdded` repeatPerCount（BS19-088-e2「相手のスピリット/マジックの効果で相手の手札が増えたとき、増えたカード1枚につき」の `{"kind":"fieldEvent","event":"opponentHandAdded","sourceTypes":["spirit","magic"],"repeatPerCount":true}` と同じ形。action は discard from deck 1） |
| 054 | Lv2-3『自分のアタックステップ』星魂のアタックでライフを減らしたとき、そのスピリットのコストと同じ枚数破棄 | fieldEvent `ownSpiritDealtLife` subjectFilter family 星魂（fieldEvent.ts「自分のスピリットのアタックによって相手のライフを減らしたとき。self にはライフを減らしたスピリットが渡る」）＋ discard from deck countCounter **新しい部品 4**（selfCost） |
| 065 | Lv1：このブレイヴがスピリット状態の間、このスピリットに青のシンボル1つを追加する | kind `symbolAddGrant` target self color blue（BS13-006-e2 の `{"kind":"symbolAddGrant","levels":[2,3],"target":"self","color":"red","count":1}` と同じ形）＋ **新しい部品 5**（whileSpirit） |
| 065 | 【合体時】『このスピリットの合体アタック時』トラッシュのネクサスカード1枚を手札に戻す | triggered onAttack whileCombined（BS12-006-e3）＋ moveCards trash→hand pick cardType nexus（BS19-079-e2 の `{"type":"moveCards","from":"trash","count":1,"dest":"hand","pick":{"cardType":"brave"}}` と同じ形） |
| 066 | Lv1『このブレイヴの召喚時』トラッシュの白/青のネクサスカードすべてを手札に戻す | triggered onSummon（ブレイヴも同じ器）＋ moveCards trash→hand all pick {cardType:"nexus", color:["white","blue"]}（BS19-079-e2 の moveCards と同じ形。CardPick の color 配列＝どれかの色: effectAction.ts:27） |
| 072 | Lv1-2『自分のアタックステップ』【連鎖】を持つ自分の青のスピリットがアタックしたとき、1枚ドローできる。この効果でドローしたとき、手札1枚を破棄する | fieldEvent `anySpiritAttacked` subjectFilter {keyword:"rensa", color:"blue"}（subjectFilter の keyword 軸は BS19-079-e1、color 軸は BS20-051-e2）＋ sequence：draw optional → if count lastDrawn atLeast 1 then discard from hand 1（discard from hand: effectAction.ts:74） |
| 072 | Lv2『自分のアタックステップ』ステップ開始時、ライフのコア1個をリザーブに置くことで、このターンの間、お互いはバーストを発動できない | kind `step` step:"attack" turn:"own"（effectDefTrigger.ts:110。BS19-086-e1 と同じ器）＋ pay（cost: moveCore life→reserve 1）＋ **新しい部品 6**（timedEffect duration turn side both） |
| 083 | フラッシュ：自分のネクサスの数以下のコストの相手のスピリット1体を破壊する | destroy filter cost.max 0 ＋ `maxCostPer {counter:"ownNexuses", amount:1}`（targetFilter.ts:93「counter の数×amount を cost.max に足す」。26RSD06-013 と同じ形） |
| 084 | メイン：このターンの間、自分のスピリット1体を、そのスピリットが持つ最高Lvとして扱う（連鎖元） | timedEffect content `{"type":"level","max":true}` duration turn（BS02-111-e2「このターンの間、指定した色のスピリットすべてを、そのスピリットの持つ最高Lvとして扱う」の `{"type":"timedEffect","content":[{"type":"level","max":true}],"duration":"turn"}` と同じ形。対象は 1体選択） |
| 084 | 連鎖（条件 赤×1／紫×1）[赤]：自分はデッキから1枚ドローする | draw 1（BS19-060-e1 の連鎖[赤]と同じ形） |
| 084 | 連鎖（条件 赤×1／紫×1）[紫]：自分はデッキから1枚ドローする | draw 1（BS19-006-e1 の連鎖[紫]と同じ形） |
| 084 | フラッシュ：このターンの間、スピリット1体をBP+3000する | timedEffect bp 3000 duration turn（BS02-111-e1 と同じ形） |
| X06 | Lv1-3『このスピリットのアタック時』コスト5以下の相手のスピリット1体を破壊する（連鎖元） | triggered onAttack＋destroy filter cost max 5（BS20-051-e1 と同じ形） |
| X06 | 連鎖（条件 赤×1／紫×1）[赤]：【強化】を持つ相手のスピリット1体を破壊する（絞り込み：強化を持つ） | destroy filter {keyword:"kyoka"}（keyword 軸は BS19-079-e1 の subjectFilter と同じ軸。連鎖の形は BS19-008-e1） |
| X06 | 連鎖（条件 赤×1／紫×1）[紫]：疲労状態の相手の合体スピリット1体を破壊する | destroy filter {rested:true, combined:true}（targetFilter.ts:50 rested・:82 combined。連鎖の形は BS19-008-e1） |
| X06 | Lv2-3：相手のブレイヴ/ブレイヴカードすべての合体条件をコスト7以上にする | **新しい部品 7** |
| X08 | Lv1『このブレイヴの召喚時』このターンの間、自分のスピリットすべてを、そのスピリットが持つ最高Lvとして扱う | triggered onSummon＋timedEffect content `{"type":"level","max":true}` duration turn all side own（BS04-069-e1「このターンの間、自分のスピリットすべてを、そのスピリットが持つ最高Lvとして扱う」の `{"type":"timedEffect","content":[{"type":"level","max":true}],"duration":"turn","all":true,"side":"own"}` と同じ形） |
| X08 | 【合体中】相手は、相手のフィールドにあるシンボルと同じ色のバーストしか発動できず、同じ色のマジックカードしか使用できない | globalConstraint `burstOnlyOwnFieldSymbolColors`（BS20-X06-e1「相手は、相手のフィールドにあるシンボルと同じ色のバーストしか発動できない」の `{"kind":"globalConstraint","levels":[1,2,3],"constraint":{"type":"burstOnlyOwnFieldSymbolColors"}}` と同じ形）＋ `magicOnlyOwnFieldSymbolColors`（BS19-112-e2 と同じ形）。両方に whileCombined |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
| cardId | 点 | 読みA | 読みB |
| :-- | :-- | :-- | :-- |
| 047 | 「アタックしたとき、そのスピリットをBP+2000」の期間（効果文に期間の記述なし） | そのバトルの間（『アタック時』のBP+と同じ: BS20_PLAN §1・BS19-008-e1） | このターンの間 |
| 048 | 「このバトルの間、相手のスピリットすべては回復できない」 | 効果による回復だけ（リフレッシュステップはバトル中に来ないので実質同じ） | リフレッシュステップの回復も止める（バトル中には無いので無差） |
| 052 | バースト無効化の確認時点と割り込み | バーストの発動条件を満たした時点（解決前）に破壊するかを聞き、払えば発動を無効化 | 発動の解決後に聞く（ownBurstActivated の位置。この読みだと「無効化」が成立しないので A が自然だが、誘発の列のどこに入るかは要確認） |
| 052 | 「お互いのアタックステップ」の対象 | 相手が発動を宣言したバーストだけ（その発動を無効化） | 条件を満たしたバーストすべてに先回りして無効化 |
| 054 Lv1 | 「相手の効果」の範囲 | スピリット/ネクサス/マジック/ブレイヴの効果すべて | 一部の種別だけ（BS19-088 は「スピリット/マジックの効果」と限定されていた） |
| 072 節1 | 「この効果でドローしたとき、手札1枚を破棄する」の処理の順 | ドロー（任意）→ 破棄の順で解決。ドローを断れば破棄も無し | 破棄を先に選ぶ（効果文の順から A が自然） |
| 072 節2 | 「ステップ開始時、〜置くことで」の確認時点 | ステップ開始時に払うかを聞き、断れば効果全体が不発（COST_MODEL §10） | 払わなくてもバースト発動禁止だけ発揮 |
| X06 Lv2-3 | 「相手のブレイヴ/ブレイヴカードすべて」の範囲 | 場のスピリット状態のブレイヴと手札のブレイヴカードの両方（合体中のブレイヴも「ブレイヴ」に含む） | スピリット状態のブレイヴだけ（「ブレイヴカード」を手札に限定しないと文が余るので A が自然） |
| X08 | 【合体中】のバースト/マジック制限の効き始め | 合体している間ずっと（合体した瞬間から） | 合体アタック時だけ（「【合体中】」の見出しなので A） |
