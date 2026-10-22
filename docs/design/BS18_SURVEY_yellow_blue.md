# BS18 調査メモ：黄・青（調査役）

対象：`data/staging/BS18.json` のうち黄・青32枚（BS18-037〜054, 059, 060, 069〜072, 081〜084, X05, X06, X012S, X012T）。**実装はしていない**（このメモのみ）。
節の数え方：Lv見出し単位＋キーワード単独行＋バースト単独ブロック。バニラ2枚（037 ホムンクー・049 グラッディ・スクアーロ。効果文が空）は節0。

## 集計

- 全節数：51節
- 既存の器で書ける：26節（同じ書き方の実カードがある）
- 型には軸があるが同じ書き方の実カードが0：4節（046・071 Lv2・083・X06 Lv1-3。部品は実在するので「既存（型のみ）」と区別した。smoke で動作を確かめてから使う）
- 新しい部品が要る：21節・部品候補21種

### 新しい部品の候補

| # | 部品（種類） | 対象 | 組み合わせで書けない理由 |
| :-- | :-- | :-- | :-- |
| 1 | fieldEvent「自分にボイドからコアが増えた」（イベント軸） | 040 Lv1-3 | `opponentCorePlaced` は相手側のコアを見るだけ。自分側・ボイド由来・個数（`repeatPerCount`）の組が無い。発生源の絞りは `opponentEffectSourceTypes` が使える |
| 2 | fieldEvent「自分か相手のライフにコアが置かれた」（イベント軸） | 041 | `opponentLifeCoreFromVoid`＝相手ライフ・ボイド由来のみ。`ownSeimeiLifeCharged`＝自分の【聖命】のみ。自分ライフ・出所不問が無い |
| 3 | `unblockableBy` に「コストがこの一覧のいずれかと一致」の軸（軸） | 043 Lv1-3, 044 Lv1-3 | 既存は `costNot`（1値）・`maxCost` のみ。0/1/3/5/7 と 0/2/4/6/8 の列挙が書けない。名前指定の付与は `constraintGrant.nameIncludes`（BS17-054）で足りる |
| 4 | `immunityGrant` に `nameIncludes`（軸） | 043 Lv2-3 | `against:"bounce"` の付与は family/color/keyword 等でしか絞れない。`constraintGrant` 側には「戻らない」制約の type が無いので乗り換えもできない |
| 5 | `reviveOnDestroy`（scope:"ownAll"）に `nameIncludes`（軸） | 044 Lv2-3 | ownAll の絞りは vanilla/color/keyword/minBp/minCost/family のみ |
| 6 | `IfCond.event.destroyed` に「コスト以上」と「色のOR」（条件の軸） | 045 バースト | `destroyedColor` は単色・コスト軸なし。`burst.destroyedColorFilter` も単色 |
| 7 | globalConstraint「手札のカードの軽減シンボルを増やせない」（制約） | 047 | `noReductionBySummonCost` は軽減の適用を止める別物。`reductionGrant`（22枚）の付与そのものを止める制約が無い |
| 8 | globalConstraint「お互いのデッキは破棄されない」（制約） | 050 Lv1-2 | `noDeckMillInMain` はメイン限定、`noDeckMillByOpponent` は持ち主側・相手の効果のみ。`millCap{maxCount:0,perTurn,mutual}` で書ける可能性はあるが0の前例が無い（実装確認が要る） |
| 9 | 手札/トラッシュにあるスピリットカードの効果を発揮させない（制約） | 052 Lv1-3 | `spiritEffectsDisabledGrant` は場のスピリット対象。ゾーン軸が無い |
| 10 | 「シンボル2つ以上のスピリットがアタック中、相手は手札のマジックを使えない」（制約） | 053 | `flashLockWhileAttackingFamily` は系統軸・「手札の効果すべて」で、シンボル数軸とカード種別（マジック）軸が無い |
| 11 | 「相手の次のメインステップを行えない」（継続効果の内容） | 054 Lv2 | `forceEndMainStep` は今のメインステップを打ち切るだけ。`endStepLock` はアタックステップ等のみ。次ターンのメインステップを飛ばす期間つき内容が無い |
| 12 | 相手の手札も含めてコストを置き換える（継続効果の内容） | 060 | `costMod mode:"set"` は「効果を持つ側の持ち主の手札のみ」と型コメントが明言（相手のカードは構造上不可）。誘発から置く経路も無い |
| 13 | `noLifeDamageByCost` にアタッカーのコア数の軸（軸） | 070 Lv1-2 | 既存はコスト・BP・シンボル・Lv。コア数は `opponentCantAttackByCores`（アタック不可）のみで別物 |
| 14 | `symbolFix` に対象の絞り（色・`minCores`）（軸） | 072 Lv2 | 絞りは `familyFilter` のみ |
| 15 | 相手が発揮した『召喚時』効果を、自分が発揮したものとして再発揮するアクション | 081 バースト | `fireEffect` は自分のスピリットの効果を発揮させる。直前に相手が解決した効果を持ち主を入れ替えて再発揮する器が無い |
| 16 | 相手のスピリットを疲労させ、そのスピリットでブロックさせるアクション | 082 | `block` は GameAction でプレイヤー自身の宣言。効果から相手側スピリットをブロッカーに指定する経路が無い |
| 17 | タイミング「相手のアタックステップのブロック前のフラッシュ」 | 082 使用条件, X06 Lv2-3 | `mainForbidden`（メインでは使えない）はあるが「ブロック宣言前のフラッシュだけ」を指す軸が無い |
| 18 | 相手のバースト1つをオープン（両者に公開し結果を `last` に残す）アクション | 084 フラッシュ | `peekOpponentBurst` は持ち主のみが見て、`last` に何も記録しない（`peekHand.ts` で確認）。`if{last}` でスピリットか判定できない |
| 19 | オープンしたカードのバースト効果をバースト条件を無視して発動するアクション | X05 Lv1-3 | `handBurstEffectGrant`（BS17-043）は手札のマジック用。オープン中のカード・スピリットの両方を対象にする器が無い |
| 20 | `reviveOnDestroy.revived` に「手札かデッキの上（選ぶ）」（軸） | X05 Lv2-3 | `revived` は rested／toHand／toBurst のみ。デッキの上が無く、選択も無い |
| 21 | `cantUseHandCardsForPid` にコスト下限の軸（軸）と、期間「ブロック宣言まで」 | X06 Lv2-3 | 軸は allowedColor／bannedColors／cardType のみ。期間は battle／turn のみ（#17と同じタイミング部品を使う） |

## 確認事項

1. **BS18-048 レオニダース Lv1-2**（と、同文のBS15-052）「お互い、〜の効果で、手札を増やすことができない」
   → 私はこう読みました：ドロー・手札に戻す・トラッシュ回収・オープンして手札に加える、効果で手札に入る経路すべてを止める。現行の `noHandGainByEffect` は `draw` と `returnToHand` の2経路だけ（`drawDiscard.ts`・`bounce.ts` で確認）。トラッシュ回収や reveal→hand は止まらない。これでよいか。広げると BS15-052 の挙動も変わる。
2. **BS18-060 チャリオット・アームズ**「お互いの手札にあるカードすべてのコストを8にする」
   → 私はこう読みました：アタック時に一度だけ発揮し、期間は「このターンの間」。効果の解決後に手札へ入ったカードにも効く（「すべて」は後から出たものにも効く既定に合わせる）。対象は種別を問わず（スピリット／マジック／ネクサス／ブレイヴ）。期間の記述が無いので、ここが割れる（バトル中だけ／ターン終了時まで／永続）。どれか確認したい。
3. **BS18-081 フェアヴァイレ バースト**「発揮した『召喚時』効果を、自分のスピリットが発揮したものとして、もう1度だけ発揮できる」
   → 私はこう読みました：使用者・選択者は自分。効果文の「このスピリット」は元の相手スピリットを指し、場を離れていれば「このスピリット」に依存する部分は不発。コストの追加支払いは無し。バースト元の効果が任意効果で未発動だった場合は再発揮の対象外。これでよいか。
4. **BS18-082 パニックヴォイス**「アタックしていない相手のスピリット1体を疲労させ、そのスピリットでブロックする」
   → 私はこう読みました：疲労したスピリットでもブロックが成立し、それがブロッカーになる（ブロック宣言の追加は無し）。ブロックできない効果（`cantBlock` 等）や追加コストを持つスピリットは候補から外す。候補が無ければ使用不可。相手のアタックステップのブロック前のフラッシュにだけ使える。これでよいか。
5. **BS18-084 ディクタトールレギオン フラッシュ**「相手のバースト1つをオープンする。スピリットなら破棄、それ以外は元に戻す」
   → 私はこう読みました：オープンは両者に公開（`peekOpponentBurst` の持ち主だけが見る扱いとは別）。スピリットカードならトラッシュへ、それ以外は伏せたままバーストに戻す。バーストが無ければ不発。これでよいか。
6. **BS18-070 ワルプルギスの夜 Lv1-2**「コアが1個の相手のスピリットのアタックでは、自分のライフは減らない」
   → 私はこう読みました：コア数はライフを減らす処理の時点で見る（アタック宣言時の数ではない）。これでよいか。
7. **BS18-040 ペンタン Lv2-3**「バトルしたコスト4以下の相手のスピリットをLv1として扱う」
   → 私はこう読みました：期間は「そのバトルの間」。実カードの前例が食い違う（BS07-041＝`duration:"turn"`、BS16-045＝`duration:"battle"`）。ACTION_VOCABULARY §4（『バトル時』の効果はバトルの間だけ）に従い `battle`。コスト判定は付与込みの現在コスト。これでよいか。
8. **BS18-045 ドクトル・ファウスト バースト**「コスト5以上の白/黄のスピリットが破壊されていたら」
   → 私はこう読みました：コスト5以上、かつ（白または黄）。同時破壊なら、いずれか1体が満たせば成立。これでよいか（部品#6）。
9. **BS18-052 ハンニ・ヴァル Lv1-3**「お互いの手札/トラッシュにあるスピリットカードすべての効果は発揮されない」
   → 私はこう読みました：止めるのは手札・トラッシュでだけ働く効果（手札からの起動・フラッシュ、【神速】【不死】【転召】の代替召喚、手札の軽減付与、トラッシュの復帰系）。召喚そのもの（通常召喚）は止めない。場に出れば通常どおり。これでよいか。影響範囲が広いので、止める効果の種類を先に決めたい。
10. **BS18-047 アザーフェロム**「スピリット/ネクサスの効果で、手札のカードの軽減シンボルを増やすことができない」
   → 私はこう読みました：止めるのは軽減シンボルを増やす付与（`reductionGrant`）。`handReductionColorAsForPid`（色を置き換えるだけ、件数は変えない）は止めない。これでよいか。
11. **BS18-054 ディクタトール・シーザー Lv2**「相手は、次のターンの『相手のメインステップ』を行えない」
   → 私はこう読みました：次の相手ターンのメインステップが丸ごと飛び、そのままアタックステップへ進む。召喚・ネクサス配置・メインのマジックは不可、フラッシュとアタックは可。「次のターン」は、いま自分のターン中なら次に来る相手のターン。これでよいか。
12. **BS18-053 タイラントール・ネロ Lv1-2**「シンボル2つ以上を持つ自分のスピリットがアタックしている間、相手は手札にあるマジックカードを使用できない」
   → 私はこう読みました：アタック宣言からバトル終了まで。止めるのは手札のマジックのみ（手元・トラッシュからの使用、セット済みバーストの発動は止めない）。これでよいか。

## 対応表

### BS18-037 ホムンクー（黄・spirit・コスト1）／ BS18-049 グラッディ・スクアーロ（青・spirit・コスト3）

効果文が空（バニラ）。節0。

### BS18-038 グリムの天使グレーテル（黄・spirit・コスト2）／ BS18-039 グリムの天使ヘンゼル（黄・spirit・コスト2）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv2 自分の[相方]がいる間、相手によって破壊されたとき疲労状態で残る | 既存 | `kind:"reviveOnDestroy" scope:"self" requireOwnFieldHasName:"グリムの天使ヘンゼル" when:{byOpponent:true} revived:{rested:true}`（039は名前が逆） | BS17-054（`requireOwnFieldHasName`＋rested）。`byOpponent` は BS14-078 |

### BS18-040 詩人ペンタン（黄・spirit・コスト3）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 相手のスピリット/ネクサスの効果でボイドからコアが増えたとき、増えたコア1個につき1枚ドロー | 新規 | 部品#1。action は `draw count:1` ＋ `repeatPerCount:true`、`opponentEffectSourceTypes:["spirit","nexus"]` | `repeatPerCount` は BS17-014、`opponentEffectSourceTypes` は型に実在 |
| Lv2-3『バトル時』バトルしたコスト4以下の相手をLv1として扱う（確認事項7） | 既存 | `triggered onBlocked`／`onBlock` の2エントリ、`eventTarget:"use"`、`condition:{targetMaxCost:4}`、`timedEffect content:[{type:"level",set:1}] duration:"battle"` | BS07-041（level set 1）、条件は BS06-X21（`targetMaxCost`） |

### BS18-041 クロック・リカオー（黄・spirit・コスト4）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3『お互いのアタックステップ』自分か相手のライフにコアが置かれたとき、このスピリットは回復する | 新規 | 部品#2。action は `refreshSelf`、`selfMode:"source"`、`phase:"attack"` | `refreshSelf`＋`selfMode:"source"` は BS09-021 |

### BS18-042 双天使メロディエル（黄・spirit・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『お互いのメインステップ』ネクサスすべてのLv1効果は発揮されない | 既存 | `kind:"nexusEffectsDisabled" target:"bothAll" targetLevels:[1] phase:"main"` | BS16-041（`targetLevels:[1]`＋phase）、`bothAll` は BS15-034（`condition` 省略可の型） |

### BS18-043 創造主グリム・ウィル（黄・spirit・コスト5）／ BS18-044 創造主グリム・ジェイ（黄・spirit・コスト5）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| 043 Lv1-3『自分のアタックステップ』このスピリットと自分の[ジェイ]すべては、コスト0/1/3/5/7の相手にブロックされない（044は[ウィル]・0/2/4/6/8） | 新規 | 部品#3。`kind:"constraintGrant" target:"ownAll" nameIncludes:["創造主グリム・ウィル","創造主グリム・ジェイ"] phaseTurn:{attack,own} constraint:{type:"unblockableBy", costs:[…]}` | `constraintGrant.nameIncludes`＝BS17-054、`unblockableBy`＋phaseTurn＝BS07-035 |
| 043 Lv2-3 このスピリットと自分の[ジェイ]すべては、相手の効果ではフィールドから手札に戻らない | 新規 | 部品#4。`kind:"immunityGrant" target:"ownAll" against:"bounce" nameIncludes:[…]` | `against:"bounce"`＝BS06-005 |
| 044 Lv2-3 このスピリットと自分の[ウィル]すべては、相手によって破壊されたとき疲労状態で残る | 新規 | 部品#5。`kind:"reviveOnDestroy" scope:"ownAll" nameIncludes:[…] when:{byOpponent:true} revived:{rested:true}` | ownAll＋`byOpponent`＋rested＝BS14-078 |

### BS18-045 ドクトル・ファウスト（黄・spirit・コスト12）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト：相手による自分のスピリット破壊後。コスト5以上の白/黄が破壊されていたら召喚する | 新規 | 部品#6。`kind:"burst" event:"ownSpiritDestroyed" byOpponentEffectOnly:true subjectSide:"own"`、action は `if{cond:{event:{destroyed:{minCost:5,colors:["white","yellow"]}}}, then:{type:"summonBurstCardFree"}}` | 骨格は BS16-X04（`if cond.event.destroyedColor`）。色の単色・コスト軸なしが新規 |
| Lv1-3『召喚時』バースト効果で召喚されたとき、デッキ上5枚をオープンし、スピリット1枚を無償召喚できる。残りは好きな順でデッキの下 | 既存 | `triggered onSummon burstSummonOnly:true`、action は `sequence keepScope:[revealOpen 5, moveCards from:"revealed" dest:"summon" pick:{cardType:"spirit"} optional:true, moveCards from:"revealed" count:"all" dest:"deckBottom"]` | `burstSummonOnly`＝BS17-044、reveal→summon＝BS05-069／BS08-X29、deckBottom＝BS09-064 |

### BS18-046 シャッガイ・バグ（青・spirit・コスト1）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv2『自分のアタックステップ』シンボル2つ以上を持つ自分のスピリットは、BPを比べ相手のスピリットだけを破壊したとき回復する | 既存（型のみ） | `kind:"fieldEvent" event:"ownSpiritBattleWon" phase:"attack" turn:"own" subjectMinSymbols:2 action:{type:"refreshSelf"}`（self＝勝ったスピリット） | 型に実在、`battleResolve.ts:825` で発火。実カードは data/cards に0。smoke で確認してから使う |

### BS18-047 アザーフェロム（青・spirit・コスト2）

| 節 | 判定 | 足りない部品 |
| :-- | :-- | :-- |
| Lv1-2 お互い、スピリット/ネクサスの効果で、手札のカードの軽減シンボルを増やすことができない | 新規 | 部品#7（確認事項10） |

### BS18-048 猛将レオニダース（青・spirit・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2 お互い、スピリット/ブレイヴ/ネクサス/マジックの効果で手札を増やすことができない（確認事項1） | 既存 | `kind:"globalConstraint" constraint:{type:"noHandGainByEffect"}` | BS15-052-e2（同文）。ただし止める経路が draw／returnToHand だけ |
| Lv1-2 自分のネクサス1つにつき、このスピリットをBP+1000 | 既存 | `kind:"aura" aura:{type:"bp",target:"self",amountPer:1000,counter:"ownNexuses"}` | BS01-088 |

### BS18-050 アウグスドス（青・spirit・コスト4）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1『自分のアタックステップ』このスピリットはアタックできない | 既存 | `kind:"constraint" constraint:{type:"cantAttack"}` | BS02-036 |
| Lv1-2 お互いのデッキは破棄されない | 新規 | 部品#8 | |

### BS18-051 メテオライト・ゴレム（青・spirit・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2【強襲：1】『アタック時』ターンに1回まで、自分のネクサス1つを疲労させることで回復できる | 既存 | `keyword kyoshu count:1`＋`triggered onAttack action:{type:"pay",cost:{type:"exhaust",side:"own",nexusOnly:true,count:1},then:{type:"refreshSelf"},limitByKeyword:"kyoshu"}` | BS07-052（同文） |

### BS18-052 雷光将軍ハンニ・ヴァル（青・spirit・コスト6）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3 お互いの手札/トラッシュにあるスピリットカードすべての効果は発揮されない | 新規 | 部品#9（確認事項9） | |
| Lv2-3『アタック時』相手のスピリットにブロックされたとき、系統「覇皇」の自分のスピリット1体を回復させる | 既存 | `triggered onBlocked eventTarget:"ignore" action:{type:"refreshOne",filter:{family:"覇皇"}}` | `onBlocked` は BS06-X21／BS17-003、`refreshOne` の family 絞りは BS03-040 |

### BS18-053 タイラントール・ネロ（青・spirit・コスト7）

| 節 | 判定 | 足りない部品 |
| :-- | :-- | :-- |
| Lv1-2『自分のアタックステップ』シンボル2つ以上を持つ自分のスピリットがアタックしている間、相手は手札のマジックを使用できない | 新規 | 部品#10（確認事項12） |

### BS18-054 ディクタトール・シーザー（青・spirit・コスト8）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト：自分のライフ減少後。ライフが2以下のとき召喚する | 既存 | `kind:"burst" event:"ownLifeDamaged" action:{type:"if",cond:{count:"ownLife",atMost:2},then:{type:"summonBurstCardFree"}}` | BS17-X05（atMost 3） |
| Lv1-2【強襲：1】（051と同文） | 既存 | 051と同じ | BS07-052 |
| Lv2『アタック時』BPを比べ相手のスピリットだけを破壊したとき、相手は次のターンの相手のメインステップを行えない | 新規 | 部品#11。起点は `triggered onBattleWin battleRole:"attacker"`（BS03-101） | 確認事項11 |

### BS18-059 ザッカ・パンツァー（青・brave・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| 【合体時】『合体アタック時』手札のマジックカードすべての軽減シンボルすべてを[黄]として扱う | 既存 | `triggered onAttack whileCombined:true action:{type:"timedEffect",content:[{type:"playerRule",rule:{type:"handReductionColorAsForPid",color:"yellow",cardType:"magic"}}],duration:"turn",side:"own"}` | 合体アタック時の書き方＝BS10-061、`handReductionColorAsForPid`＝BS12-042（cardType は nexus。型は CardType 全般） |

### BS18-060 チャリオット・アームズ（青・brave・コスト4）

| 節 | 判定 | 足りない部品 |
| :-- | :-- | :-- |
| 【合体時】『合体アタック時』お互いの手札にあるカードすべてのコストを8にする | 新規 | 部品#12（確認事項2） |

### BS18-069 お菓子の豪邸（黄・nexus・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2 相手によって自分のスピリットが破壊されたとき、ターン1回、手札のカード名「グリム」入りのスピリット1枚を無償召喚できる | 既存 | `kind:"fieldEvent" event:"ownSpiritDestroyed" byOpponentOnly:true oncePerTurn:true optional:true action:{type:"summonFromHandFree",nameIncludes:"グリム"}` | `byOpponentOnly`＝BS12-005、`nameIncludes`＝BS05-064 |
| Lv2『自分のアタックステップ』系統「天霊」の自分のスピリットが疲労したとき、デッキから1枚ドロー | 既存 | `fieldEvent event:"ownSpiritExhausted" phase:"attack" turn:"own" familyFilter:"天霊" action:{type:"draw",count:1}` | BS02-082（familyFilter＋phase） |

### BS18-070 ワルプルギスの夜（青・nexus・コスト4）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『相手のアタックステップ』コアが1個の相手のスピリットのアタックでは、自分のライフは減らない | 新規 | 部品#13。`globalConstraint noLifeDamageByCost` に `attackerCores:1`＋`ownOnly:true`＋エントリの `phase:"attack" turn:"opponent"` | `ownOnly` は型に実在（確認事項6） |
| Lv2 系統「導魔」の自分のスピリットすべてに【聖命】を与える | 既存 | `kind:"keywordGrant" keyword:"seimei" target:"ownAll" familyFilter:["導魔"]` | BS11-070-e2 |

### BS18-071 サファイアの街道（青・nexus・コスト3）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『お互いのアタックステップ』【強襲】を持つ自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、ボイドからコア1個を自分のリザーブに置く | 既存 | `kind:"battleWon" role:"any" winnerKeywordFilter:"kyoshu" action:{type:"placeCores",from:"void",to:"reserve",count:1}` | `winnerKeywordFilter`＝BS06-010-e3、void→reserve は BS02-081 |
| Lv2『自分のエンドステップ』疲労状態の自分のネクサス1つにつき、自分のスピリット1体を回復させる | 既存（型のみ） | `kind:"step" step:"end" turn:"own" action:{type:"refreshOne",count:1,countCounter:"ownRestedNexuses"}` | `refreshOne.countCounter` は実装あり（`exhaustRefresh.ts`）、`ownRestedNexuses` は BS07-082。refreshOne＋countCounter の実カードは0 |

### BS18-072 破壊と創造の釜（青・nexus・コスト4）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-2『配置時』コスト3以下の相手のスピリット1体を破壊する | 既存 | `triggered onDeploy action:{type:"destroy",count:1,filter:{cost:{max:3}}}` | `onDeploy`＝BS09-066、コスト絞りの destroy＝BS07-X28 |
| Lv2『自分のアタックステップ』コアが4個以上の自分の青のスピリットすべての持つシンボルを青2つにする | 新規 | 部品#14。`kind:"symbolFix" target:"ownAll" color:"blue" count:2 phaseTurn:{attack,own}` に対象絞り（`colorFilter:"blue"`・`minCores:4`） | `symbolFix`＋phaseTurn＝BS09-008 |

### BS18-081 フェアヴァイレ（青・magic・コスト3）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト：相手の『召喚時』発揮後。発揮した効果を自分が発揮したものとしてもう1度だけ発揮できる。その後コストを支払ってフラッシュ効果 | 新規 | 部品#15。`kind:"burst" event:"opponentSummonEffectResolved" thenPay:"flash"` は既存形 | `thenPay:"flash"`＝BS14-112（確認事項3） |
| フラッシュ 相手のスピリット1体を指定。このターンの間、アタック/ブロックできない | 既存 | `kind:"magic" timing:"flash" action:{type:"timedEffect",content:[{type:"cantAttack"},{type:"cantBlock"}],duration:"turn",side:"opponent",count:1}` | 内容の2つ組＝BS02-110（`all` の版）。体数1・side:"opponent" は型に実在 |

### BS18-082 パニックヴォイス（青・magic・コスト7）

| 節 | 判定 | 足りない部品 |
| :-- | :-- | :-- |
| フラッシュ アタックしていない相手のスピリット1体を疲労させ、そのスピリットでブロックする。相手のアタックステップのブロック前のフラッシュでのみ | 新規 | 部品#16・#17（確認事項4）。対象の絞りは `filter:{notAttacking:true}`（型に実在） |

### BS18-083 アイアンファランクス（青・magic・コスト4）

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| フラッシュ 自分の青のシンボル合計以下のコストの相手のスピリット1体を破壊する | 既存（型のみ） | `kind:"magic" timing:"flash" action:{type:"destroy",count:1,filter:{cost:{max:0},maxCostPer:{counter:{ownColorSymbols:"blue"},amount:1}}}` | `maxCostPer` は `TargetFilter` に実在・`filter.ts:188` で実装済み。`ownColorSymbols` は BS04-X16（`mill` の countCounter）。destroy＋`maxCostPer` の実カードは0 |

### BS18-084 ディクタトールレギオン（青・magic・コスト5）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト：自分のライフ減少後。ボイドからコア2個を自分のネクサス1つに置く。その後コストを支払ってフラッシュ | 既存 | `burst event:"ownLifeDamaged" thenPay:"flash" action:{type:"placeCores",from:"void",to:"nexus",target:"one",count:2}` | `target:"one"`＝BS04-059（count 1）、`thenPay`＝BS14-112 |
| フラッシュ 相手のバースト1つをオープン。スピリットなら破棄、それ以外は元に戻す。メインステップでは使えない | 新規 | 部品#18（確認事項5）。破棄は `discardOpponentBurst`（BS16-X04）、`mainForbidden:true`（BS05-073） | |

### BS18-X05 聖魔皇メフィスト・フェレス（黄・spirit・コスト6）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3『アタック時』自分がマジックを使用したとき、その効果発揮後、デッキ上4枚をオープンし、バースト効果を持つ1枚を条件無視で発動できる。残りは好きな順でデッキの下 | 新規 | 部品#19。起点は `fieldEvent event:"ownMagicUsed" condition:"selfIsAttacking"`、`revealOpen 4`、残りは `moveCards dest:"deckBottom"` | 起点＝BS03-050／BS12-058、reveal＋deckBottom＝BS09-064 |
| Lv2-3『お互いのアタックステップ』相手によって破壊されたとき、手札かデッキの上に戻ることができる | 新規 | 部品#20。`reviveOnDestroy scope:"self" when:{byOpponent:true} phaseTurn:{attack,both} optional:true` | `toHand`＝BS05-040 |

### BS18-X06 混沌魔皇アザートゥース（青・spirit・コスト9）

| 節 | 判定 | 書き方 / 足りない部品 | 前例 |
| :-- | :-- | :-- | :-- |
| Lv1-3『召喚時』自分のシンボル2つのスピリット1体につき、相手のシンボル1つのスピリット1体を破壊する | 既存（型のみ） | `triggered onSummon action:{type:"destroy",count:1,countCounter:{ownSpirits:{symbolCount:2}},filter:{symbolCount:1}}` | `countCounter:{ownSpirits}`＝SD02-004（draw）、destroy＋countCounter＝BS08-X29、`symbolCount` 絞り＝BS12-006。この組合せの実カードは0 |
| Lv2-3『アタック時』相手は、ブロック前のフラッシュタイミングで、手札のコスト4以上のカードを使えない | 新規 | 部品#21・#17。`timedEffect playerRule cantUseHandCardsForPid` の枠は既存 | `cantUseHandCardsForPid`＝BS11-082 |

### BS18-X012S・X012T 英雄皇ロード・ドラゴン・ドミニオン（青／黄・spirit・コスト6）

BS14 の X012R（赤）と効果文が完全に同じ。`data/cards/BS14.json` の X012R-e1〜e3 をそのまま写せる。

| 節 | 判定 | 書き方 | 前例 |
| :-- | :-- | :-- | :-- |
| バースト：自分のライフ減少後。このスピリットカードを召喚する | 既存 | `burst event:"ownLifeDamaged" action:{type:"summonBurstCardFree"}` | X012R-e1 |
| Lv1-3『召喚時』手札のバースト効果持ち1枚をセットすることで1枚ドロー | 既存 | `triggered onSummon action:{type:"pay",cost:{type:"setBurstFromHand"},then:{type:"draw",count:1}}` | X012R-e2 |
| Lv3『自分のアタックステップ』自分のバーストをセットしている間、BP+3000 | 既存 | `aura levels:[3] aura:{type:"bp",target:"self",amount:3000,phaseTurn:{attack,own},condition:"hasOwnBurstSet"}` | X012R-e3 |
