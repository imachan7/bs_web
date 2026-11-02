# 構築済みデッキ 調査メモ：pyg（調査役）
対象：BS01-125 BSC05-001 BSC05-020 BSC05-022 EX005 EX032 SD13-001 SD13-002 SD13-003 SD13-004 SD13-005 SD13-006 SD13-007 SD13-008 SD13-X01 SD14-001 SD14-002 SD14-003 SD14-004 SD14-005 SD14-006 SD14-007 SD14-008 SD14-X01 SD15-001 SD15-002 SD15-003 SD15-004 SD15-005 SD15-006 SD15-007 SD15-008 SD15-X01。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**64**
- 既存の器で書ける：**60**
- 新しい部品が要る：**4**（SD13-005 連鎖[黄]／SD15-003 破壊時／SD15-004 Lv2／SD15-X01 Lv2）
- 連鎖を含むカード：**9枚**（SD13-003・004・005・006・008／SD14-002・003・004・008。連鎖の節は9つ。いずれも BS19_PLAN §2.2 A の `sequence`＋`if ownColorSymbols` で書ける）
- 強化を含むカード：**3枚**（SD15-001・002・005。いずれも黄の【強化】「BP-効果を-1000」＝ `keyword kyoka bpMinus`。BS19-052 と同じ）
- 【神速】を含むカード：4枚（EX032・SD14-003・004・007。いずれも既存の `keyword soku`）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | TargetFilter に「最もLvの高い」軸（条件の軸） | targetFilter.ts:95 には `highestBp`（実効BPが最も高い）はあるが Lv 版が無い。`maxLevelAsSelf`（targetFilter.ts:64）は「self 以下」で「最も高い1体」の選択に使えず、exhaust の対象を「最もLvの高い相手1体」に絞れない | SD13-005 連鎖[黄]「最もLvの高い相手のスピリット1体を疲労させる」 |
| 2 | PlayerRuleDef に「cantAttackByCostForPid」（条件の軸） | コスト軸のアタック制限は globalConstraint `opponentCantAttackByCost`（BS12-X05-e2。常在効果の器のみ）にしかない。「このターンの間」で置ける timedEffect playerRule の PlayerRuleDef（type.ts:294）にはコスト軸のアタック制限が無い（cantUseMagicForPid 等はある） | SD15-003 破壊時「このターンの間、コスト3以下の相手のスピリットはアタックできない」 |
| 3 | treatAsUnblocked の when に「blockerBpBelowSelf」（発生源の実効BPより低い）軸（条件の軸） | effectAction.ts:111 の when は `blockerLevel1`｜`levelAtLeastBlocker`｜`{blockerMaxBp: number}`（固定値）のみ。BS19-X05-e3 は固定値 3000 で、発生源自身のBPとの相対比較（「このスピリットよりBPの低い」）が書けない | SD15-004 Lv2「このスピリットよりBPの低い相手のスピリットとBPを比べるとき、BPを比べずにブロックされなかったものとして扱う」 |
| 4 | fieldEvent `opponentSpiritBpReachedZero` に「発生源が self の効果で」の軸（条件の軸） | FieldEventDef（effectDefTrigger.ts:195）の発生源絞り込みは `sourceColorFilter`（色）と `sourceTypes`（opponentHandAdded 限定）のみ。BP0 到達の発生源がこのスピリット自身の効果かを判定できず、BS19-091-e1 は条件なしの形しかない | SD15-X01 Lv2「このスピリットの効果で相手のスピリットがBP0になったとき、BP0になったスピリットすべてを破壊する」 |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS01-125 | フラッシュ：お互いそれぞれ1体を破壊 | `mutualDestroyChoice`（BS05-016-e3。「お互い、フィールドのスピリット1体を選び、破壊する。」と同じ形） |
| BSC05-001 | Lv1-2：色とシンボルは赤としても扱う | `colorAs`（BS12-009-e1。「このスピリットの色とシンボルは白としても扱う。」と同じ形） |
| BSC05-020 | Lv1：ライフ減→上1枚オープン→コスト2以下を無償召喚・残り手札 | fieldEvent ownLifeDamaged ＋ `revealOpen`＋`moveCards`（BS11-X05-e1。「そのカードがスピリットカード/ブレイヴカードのとき、コストを支払わずに召喚する。残ったカードは手札に加える」と同じ形。pick に cost max 2） |
| BSC05-020 | Lv2：効果で回復した赤/緑/青を破壊 | fieldEvent `anySpiritRefreshed`＋`refreshSourceTypeFilter`＋destroy（BS14-085-e2r。「スピリット/マジックの効果で回復した赤/緑/白/青のスピリットすべてを破壊する。」と同じ形。色を行ごとに3エントリ） |
| BSC05-022 | フラッシュ：合体していない相手のコア2個をリザーブへ | `removeCores` count 2（BS17-056-e1。「相手のスピリットのコア2個を相手のリザーブに置く。」）＋TargetFilter `uncombined`（targetFilter.ts:43） |
| EX005 | Lv1-3 アタック時：疲労状態の相手にアタックできる | `canDirectAttack` targetFilter rested（BS01-037-e1。「疲労状態の相手のスピリット1体を指定し、そのスピリットにアタックできる。」と同じ形） |
| EX005 | Lv2-3 アタック時：BP比べ破壊時にコア1個の相手1体を破壊 | triggered `onBattleWin`（BS17-009-e2。「BPを比べ相手のスピリットだけを破壊したとき、」）＋destroy filter `maxCores: 1`（BS16-056-e2 の maxCores と同型） |
| EX032 | フラッシュ【神速】 | `keyword soku`（BS19-024-e1） |
| EX032 | 【合体時】バトル時：BP比べ破壊時に回復 | triggered `onBattleWin` whileCombined（BS17-009-e2 と同型）＋`refresh` target self（BS04-037-e2） |
| SD13-001 | Lv1-2 破壊時：疲労状態のコスト3以下を破壊 | destroy filter rested＋cost max（BS19-013-e1。「コスト4以下の疲労状態の相手のスピリット1体を破壊する。」と同じ形） |
| SD13-002 | Lv1-2：自分のコスト3以下紫が相手スピリット効果で破壊→発揮元のコア全トラッシュ | fieldEvent ownSpiritDestroyed `byOpponentSpiritEffectOnly`＋removeCores target event to trash count all（BS10-012-e2。「このスピリットが相手のスピリットの効果で破壊されたとき、その効果を発揮したスピリットのコアすべてを…」と同じ形）＋subjectFilter（cost3以下・紫） |
| SD13-003 | Lv2-3 破壊時：疲労状態の相手1体を破壊 | destroy filter rested（BS19-013-e1） |
| SD13-003 | 連鎖（条件 黄×1）：ドロー1 | 連鎖の器＝`sequence`＋`if ownColorSymbols`（BS19-014-e1。「自分はデッキから1枚ドローする。／【連鎖：条件《黄シンボル》】」と同じ形）＋`draw` |
| SD13-004 | Lv1-2 召喚時：ドロー1 | `draw`（BS19-014-e1） |
| SD13-004 | 連鎖（条件 黄×1）：相手1体をこのターンLv1扱い | timedEffect `level` set 1 duration turn（BS08-079-e1。「このターンの間、相手のスピリット1体をLv1として扱う。」と同じ形） |
| SD13-005 | Lv1-2 召喚時：ドロー1 | `draw`（BS19-014-e1） |
| SD13-005 | 連鎖（条件 黄×1）：最もLvの高い相手1体を疲労 | **新部品 #1**（TargetFilter「最もLvの高い」軸）＋`exhaust` |
| SD13-005 | Lv2 アタック時：疲労状態の相手1体を破壊 | destroy filter rested（BS19-013-e1） |
| SD13-006 | Lv1-2 アタック時：疲労状態のコスト6以下を破壊 | destroy filter rested＋cost max（BS19-013-e1） |
| SD13-006 | 連鎖（条件 黄×1）：Lv2/Lv3の相手からブロックされない | timedEffect `unblockable` from level [2,3]（BS19-014-e1。「[黄]：このターンの間、このスピリットはLv1の相手のスピリットからブロックされない。」と同じ形。期間は §4 参照） |
| SD13-007 | Lv1 召喚時：ドロー1 | `draw`（BS19-014-e1） |
| SD13-007 | 【合体時】合体アタック時：疲労状態の合体していない相手1体を破壊 | triggered onAttack whileCombined＋destroy filter rested＋`uncombined`（BS17-056-e2 の whileCombined＋filter と同型） |
| SD13-008 | フラッシュ：疲労状態のコスト4以下を破壊 | destroy filter rested＋cost max（BS19-013-e1） |
| SD13-008 | 連鎖（条件 黄×1）：色1色を指定し自分1体をその色として扱う | timedEffect `color`（色選択）duration turn（BS02-104。「このターンの間、スピリット1体に、本来持っている色とは別に、もう1色、好きな色を与える。」と同じ形。§4 参照） |
| SD13-X01 | Lv1-3 召喚時：疲労状態2体を破壊＋破壊数ドロー | `sequence`：destroy count 2＋draw `countCounter lastMoved`（P047-e1。「この効果で破壊されたスピリット1体につき、自分はデッキから1枚ドローする。」と同じ形） |
| SD13-X01 | Lv2-3 アタック時：相手2体のコア1個ずつをリザーブへ | `removeCores` target spread targets 2 count 1（BS16-056-e1 の「すべてのコア1個ずつ」と同型。removeCores の targets 軸で2体に） |
| SD14-001 | Lv2 アタック時：リザーブのコア1個につきBP+1000 | triggered onAttack→timedEffect `bp` amountCounter `ownReserve` duration battle（BS06-007-e2 の timedEffect bp と同型。カウンタは BS14-031-e2「自分のリザーブのコア1個につき、このスピリットをBP+…」の ownReserve） |
| SD14-002 | Lv1-2 破壊時：怪虫1体を回復 | `refresh` filter family（BS19-013-e1 の refresh filter と同型） |
| SD14-002 | 連鎖（条件 青×1）：コスト2以下の相手1体を破壊 | 連鎖の器＋destroy cost max 2（BS19-024-e2。「[青]：コスト2以下の相手のスピリット1体を破壊する。」と同じ形） |
| SD14-003 | フラッシュ【神速】 | `keyword soku`（BS19-024-e1） |
| SD14-003 | Lv2 アタック時：ボイドからコア1個を自分のスピリットへ | `placeCores` from void to spirit（BS14-031-e1 の placeCores と同型） |
| SD14-003 | 連鎖（条件 青×1）：このバトルの間、相手は白のマジックを使用できない | timedEffect `playerRule cantUseMagicForPid` colors ["white"] duration battle（BS17-083。「このターンの間、相手は、…同じ色のマジックカードは使用できない。」と同じ形。期間を battle に） |
| SD14-004 | フラッシュ【神速】 | `keyword soku`（BS19-024-e1） |
| SD14-004 | 連鎖（条件 青×1）：コスト3以下の相手1体を破壊 | 連鎖の器＋destroy cost max 3（BS19-024-e2。「[青]：コスト2以下の相手のスピリット1体を破壊する。」と同じ形。神速召喚時のみ発揮＝BS19-024-e2 の `summonedBy soku` 条件と同じ） |
| SD14-005 | Lv1-2 召喚時：相手1体を疲労 | `exhaust`（標準） |
| SD14-005 | Lv2：ボイドからコアが置かれるとき+1個 | `coreBonus`（BS01-057-e1。「このスピリット上に、スピリット/ネクサス/マジックの効果によってコアが置かれるとき、その数を+1個する。」と同じ形。§4 参照） |
| SD14-006 | Lv1-3 召喚時：相手は相手のスピリット2体を疲労 | `exhaust` chooserIsTarget count 2（BS07-X26-e2。「相手は、相手のスピリット2体を疲労させる。」と同じ形） |
| SD14-006 | Lv2-3 アタック時：ボイドから【神速】持ち2体にコア1個ずつ | `placeCores` from void to spirit filter keyword soku targets 2 count 1（placeCores の targets・filter 軸） |
| SD14-007 | フラッシュ【神速】 | `keyword soku`（BS19-024-e1） |
| SD14-007 | 【合体時】バトル時：バトル終了時にボイドからコア1個 | triggered `onBattleEnd` whileCombined（BS02-050-e1。「このスピリットは、バトル終了時に破壊される。」と同じタイミングの器）＋`placeCores` from void |
| SD14-008 | フラッシュ：怪虫3体を回復 | `refresh` count 3 filter family（BS19-013-e1 の refresh と同型） |
| SD14-008 | 連鎖（条件 青×1）：コスト3以下の相手1体を破壊 | 連鎖の器＋destroy cost max 3（BS19-024-e2 と同じ形） |
| SD14-X01 | Lv1-3 自アタックステップ：このスピリットか【神速】持ちのアタックは2体ブロック必須・1体とだけバトル | `constraintGrant` constraint `blockRequiresCount` count 2（BS10-X03-e1。「相手はブロックするならスピリット2体か、アルティメット1体でないとブロックできない。そのスピリットがブ…」と同じ形。付与先＝self＋filter keyword soku。§4 参照） |
| SD14-X01 | Lv2-3：怪虫すべてをBP+2000 | `aura` bp target ownAll familyFilter（BS03-062-e1。「系統：「遊精」を持つ自分のスピリットすべてをBP+1000する。」と同じ形） |
| SD15-001 | Lv1-2【強化】：BP-効果を-1000 | `keyword kyoka bpMinus`（BS19-052-e1。「自分の「BP-効果」を-1000する。」と同じ形） |
| SD15-002 | Lv1-2【強化】：BP-効果を-1000 | `keyword kyoka bpMinus`（BS19-052-e1） |
| SD15-002 | Lv2：相手がBP0になったらBP0のスピリットすべてを疲労 | fieldEvent `opponentSpiritBpReachedZero`（BS19-091-e1。「相手のスピリットがターンで初めてBP0になったとき」の器。oncePerTurn 無し）＋`exhaust` all filter maxBp 0 |
| SD15-003 | Lv1-3 アタック時：このターン相手1体をBP-1000 | timedEffect `bpMinus` duration turn（BS19-X05-e1。「このターンの間、相手のスピリット2体をBP-3000する。」と同じ形） |
| SD15-003 | Lv2-3 破壊時：このターンコスト3以下の相手はアタック不可 | **新部品 #2**（PlayerRuleDef cantAttackByCostForPid）＋timedEffect duration turn |
| SD15-004 | Lv1-3 アタック時：このターン相手1体をBP-2000 | timedEffect `bpMinus` duration turn（BS19-X05-e1 と同型） |
| SD15-004 | Lv2-3 アタック時：BPの低い相手と比べるときブロックされなかった扱い | **新部品 #3**（treatAsUnblocked に相対BP軸） |
| SD15-005 | Lv1-3【強化】：BP-効果を-1000 | `keyword kyoka bpMinus`（BS19-052-e1） |
| SD15-005 | Lv2-3 相手アタックステップ：BP4000以下のアタックでライフ減らない | globalConstraint `noLifeDamageByCost` maxBp 4000 ownOnly（BS09-036-e2。「コスト4以下のスピリットのアタックでは、お互いのライフは減らない。」と同じ形。maxBp 軸＋ownOnly） |
| SD15-005 | Lv3 破壊時：手札に戻る | `reviveOnDestroy` scope self revived toHand（BS03-062-e2。「…が破壊されたとき、そのスピリットすべてを自分の手札に戻す。」の toHand と同じ形） |
| SD15-006 | Lv1 召喚時：トラッシュの天霊コスト3以下3枚を無償召喚 | `moveCards` from trash dest summon count 3 pick（BS12-057-e1。「自分のトラッシュにあるコスト2のスピリットカード3枚をコストを支払わずに召喚する。」と同じ形。pick に family 天霊＋cost max 3） |
| SD15-006 | 【合体時】合体アタック時：相手1体を指定しブロック不可 | timedEffect `cantBlock` duration turn（BS16-059-e2。「このバトルの間、そのスピリットはブロックできない。」と同じ形。期間を turn に） |
| SD15-007 | フラッシュ：このターンBP0になったらすべて疲労＋その後BP-2000 | `lendSelfThisTurn`＋fieldEvent lentOnly（BS01-123-e1/e2。「このターンの間、自分のスピリットが手札に戻るとき、戻るスピリット1体につき…」と同じターン限定 fieldEvent の形）＋exhaust all maxBp 0＋`bpMinus` |
| SD15-008 | メイン：ドロー＋上5枚オープン・【強化】持ちを回収・残りを上に戻す | `draw`＋`revealOpen` count 5＋`moveCards` hand pick keyword kyoka＋`moveCards` deckTop（BS06-007-e1。「自分のデッキを上から1枚オープンし、そのカードが…のとき手札に加える。他のカードのときはデッキの上に戻す。」と同じ形。pick に CardPick keyword） |
| SD15-008 | フラッシュ：このターン1体をBP-3000 | timedEffect `bpMinus` duration turn（BS19-X05-e1 と同型） |
| SD15-X01 | Lv1-3 アタック時：このターン相手1体をBP-3000 | timedEffect `bpMinus` duration turn（BS19-X05-e1 と同型） |
| SD15-X01 | Lv1-3：コスト3以下が相手効果で破壊→手札に戻る＋ドロー | `reviveOnDestroy` scope ownAll filter cost max 3 when byOpponentEffect revived toHand then draw（BS03-062-e2 の toHand＋BS19-X05-e2。「このスピリットは相手の効果によって破壊されたとき回復状態でフィールドに残り、自分はデッキから1枚ドローする。」の when／then と同じ形） |
| SD15-X01 | Lv2-3 アタック時：このスピリットの効果でBP0になったらすべて破壊 | **新部品 #4**（fieldEvent opponentSpiritBpReachedZero に発生源 self 軸）＋destroy all maxBp 0 |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
- **SD13-006 連鎖[黄]**「このスピリットはLv2/Lv3の相手のスピリットからブロックされない」：期間の記述が無い。§2.1 Q777/778（条件を満たす間ずっと効く）で書くか、BS19-014（「このターンの間」明記）に合わせてアタックしたバトル／ターンの間と読むか。
- **SD13-008 連鎖[黄]**「自分のスピリット1体を指定した色のスピリットとして扱う」：手本 BS02-104 は「もう1色、**与える**」（色の追加）。SD13-008 は「指定した色**として扱う**」で、追加（timedEffect color）か置き換え（colorAs）かで使う器と手本が変わる。
- **SD14-005 Lv2**「ボイドからこのスピリットにコアが置かれるとき、その数を+1個する」：手本 BS01-057 は「スピリット/ネクサス/マジックの**効果によって**」。SD14-005 は効果によるものだけか、コアステップ等のルールによるボイドからの配置も含むか（coreBonus の適用範囲）。
- **SD14-X01**「このスピリットか、【神速】を持つ自分のスピリットがアタックしたとき、相手はスピリット2体でないとブロックできない」：手本 BS10-X03-e1 は系統持ちへの常時 grant。SD14-X01 は「アタックしたとき」発動なので、(a) 該当アタッカーへの常時 grant（アタック時にしか意味がないので実質同じ）、(b) アタック時の timedEffect としてそのバトルだけ付与、の2通りに書ける。
- **BSC05-020 Lv1**「コスト2以下のスピリットカードのとき、コストを支払わずに召喚**できる**」：任意。断った場合そのカードは「残ったカード」扱いで手札に加わるか、オープンしたまま場に置かれない（手札固定）か。BS11-X05 の `orHand` は「召喚できない/しないときは手札」と同じ読み。
- **SD15-002 Lv2／SD15-007**「BP0になったとき、BP0になったスピリット**すべて**を疲労」：BS19-091 は「ターンで**初めて**」だったがここは無記名。BP0到達のたび毎回発火（複数同時到達ならまとめて1回）と読んだ。ターン1回という読みも可能。
