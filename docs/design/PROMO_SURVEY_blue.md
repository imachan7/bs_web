# プロモ 調査メモ：青（調査役）

対象：`data/staging/PROMO.json` のうち 15 枚（P009 P012 P022 P027 P029 P040 P043 P054 P055 P058 P065 P077 PX06 PX09 PX19）。**実装はしていない**（このメモのみ）。
根拠は既存カードの `effects`（cardId を添えた）。合体条件（P029 コスト4以上・P043 コスト3以上）はカードのフィールドで、効果節に数えていない。

## 1. 集計

節は「Lv 見出し単位＋キーワード単独行」で数えた。

| 区分 | 節数 |
| :-- | --: |
| 全体 | 32 |
| 既存の器で書ける | 23 |
| 新しい部品が要る | 9 |

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | `cantUseMagicForPid`（playerRule）の `colors` に「相手のフィールドのシンボルの色**以外**」（軸の値） | 既存の `colors` は `"event"` か色の配列で「禁じる色」を持つ。「許す色だけ」を表せない。静的版は `colorLockOpponent`（BS10-095-e1・BS03-113-e1）だが、期間つきの timedEffect では使えない | P029 |
| N2 | 「ブレイヴは、コストを支払わなければ召喚できない」（globalConstraint の型） | `noSummonByEffect`（BS12-072-e1）は効果による召喚を全部禁じ、ブレイヴ限定・両陣営・「コストを払えば可」の区別を持たない。`noFreeCastOpponent`（BS04-074-e2）はマジック用 | P040 |
| N3 | `cantUseMagicForPid` に `costs`（禁じるコストの配列）の軸 | 既存は色（`colors`・`bannedColors:"last"` の BS11-060-e1）だけ。コストで絞る軸が無い。宣言は `declare what:"cost"`（BS16-072-e1）で出せるので、禁止の側だけが足りない | P043（宣言した 3/4）、P077（N7 と併せて） |
| N4 | `braveBpBonusZero` に「持ち主側の指定（相手の合体スピリットだけ）」と発動条件（`ownBurstSet`） | 既存（BS14-090-e1）は両陣営・無条件。主語を持たない | P054 |
| N5 | 【強襲】の疲労コストの出所を「このスピリット」に差し替える（`kyoshu` の `pay` の別経路） | 【強襲】は `pay` の `cost` が `exhaust nexusOnly`（BS07-051-e3 ほか）で固定。`payAssistByExhaust` は**召喚コスト**の肩代わりで【強襲】には効かない。条件つきの選択式の置換が要る | P055 |
| N6 | `ownFunsaiMilled` の `condition` に `lastFunsaiHasBurst` | 既存の兄弟は `lastFunsaiHasSpirit`（BS11-042）・`lastFunsaiHasCostAtLeast4`（BS15-053）。バースト持ちの軸だけ無い（`if {last:{hasBurst:true}}` は自分の粉砕ではなく直前の `discard` を見る器なので、他スピリットの粉砕では使えない） | P065 |
| N7 | `cantUseMagicForPid` の `costs` を「疲労状態の自分のネクサスのコスト（解決時に集める）」で作る供給源 | `declare` は 1 つを選ぶ器。「疲労している全ネクサスのコスト集合」を作る部品が無い | P077 |
| N8 | 「お互いのトラッシュのカードは、効果を受けず・使えない」（globalConstraint の型。両陣営） | 既存の `trashImmunity`（BS10-108-e0）は**そのカード自身**だけ。両陣営のトラッシュ全体を凍結する型が無い。`noTrashRecovery`（BS06-089）・`opponentCantReturnFromTrashToHand`（BS13-044）は回収の一部だけ | PX19 |
| N9 | timedContent に「`cost` を**追加の値として**持つ（としても扱う）」（`alsoCostGrant` の期間・対象つき版） | timedContent の `cost` は増減（元のコストは残らない）。`alsoCostGrant`（BS06-052-e3）は `lendSelfThisTurn` で**自分側**にしか付かず、指定した相手のスピリット 1 体に付ける経路が無い | PX19 |

## 3. カードごとの表

| cardId | 節 | 使う器（根拠の既存カード） |
| :-- | :-- | :-- |
| P009 | Lv1･2 アタック時 BPを比べ相手のスピリットだけを破壊→デッキ1枚破棄 | `triggered onBattleWin`＋`discard from:deck side:opponent`（BS03-022-e1 と BS03-097-e1 の合成） |
| P012 | Lv1〜3【粉砕】 | `keyword funsai`（BS04-063-e1）。【粉砕】の破棄は `keyword` 側が持つ |
| P022 | Lv1･2 アタック時 ネクサスがある間 BP+2000 | 器あり：`triggered onAttack`＋`condition ownNexusAtLeast:1`（effectDefTrigger の condition）＋`timedEffect bp`（BS04-063-e2）。読み方は §4-1 |
| P022 | Lv2【強襲：1】 | `keyword kyoshu count:1`＋`pay exhaust nexusOnly → refresh self limitByKeyword`（BS07-051-e2・e3） |
| P027 | Lv1･2【強襲：1】（ターン中に1回） | 同上（BS11-046-e1・e2。「指定された回数」と「1回」は `count:1` で同じ） |
| P027 | Lv2 アタック時 コスト3以下を1体破壊 | `triggered onAttack`＋`destroy count:1 filter cost max 3`（BS16-052-e3 の形） |
| P029 | Lv1 ブレイヴの召喚時 相手のコスト3以下1体を破壊 | `triggered onSummon`＋`destroy filter cost max 3`（BS03-012-e1 の形） |
| P029 | 【合体時】合体アタック時 相手は同色シンボルのマジックしか使用できない | **N1**。`triggered onAttack whileCombined`（BS11-060-e1）＋`timedEffect playerRule`。期間は §4-2 |
| P040 | Lv1･2 お互いのメインステップ ブレイヴはコストを払わなければ召喚できない | **N2** |
| P040 | 【合体時】Lv2 合体アタック時 「太陽」入りの自分のスピリット1体につき相手のコスト3以下を1体破壊 | `destroy count:1 countCounter {ownNameIncludes:"太陽"} filter cost max 3`（BS08-X29-e2 の形＋BS07-043-e3 の counter）。`whileCombined` は BS11-050-e1 |
| P043 | Lv1 ブレイヴの召喚時 ボイドからコア2個を自分のネクサス1つに | `placeCores from:void to:nexus target:one count:2`（BS18-084 burst） |
| P043 | 【合体時】合体アタック時 コスト3/4を指定→このバトルの間そのコストのマジックを使えない | `declare what:cost options:[3,4] then timedEffect duration:battle playerRule`（BS16-072-e1 の declare）＋**N3** |
| P054 | Lv1･2 召喚時 系統「異合」/「海首」1体につきコスト3以下の相手を1体破壊 | `destroy count:1 countCounter {ownFamily:["異合","海首"]} filter cost max 3`（BS08-X29-e2。配列は effectCounter.ts の `ownFamily`） |
| P054 | Lv1･2 自分のバーストをセットしている間、相手の合体スピリットの「合体時BP+」を0 | **N4** |
| P055 | Lv1〜3 お互いのアタックステップ 【強襲】をネクサスでなくこのスピリットの疲労で使用できる | **N5** |
| P055 | Lv2･3 自分のアタックステップ ネクサス1つにつき【強襲】持ち自分のスピリットすべてBP+1000 | `aura bp target:ownAll keywordFilter:kyoshu`（SD02-010-e4）＋`amountPer:1000 counter:"ownNexuses"`（BS18-048-e2）。**両者を一つに合成した例は無い**ので smoke で確認 |
| P058 | Lv1･2 召喚時 自分のスピリット1体を指定→同コストの相手を1体破壊 | `declare what:cost from:spirits then destroy filter {declared:"match"}`（BS16-072-e1。`from` に `spirits` あり）。「指定できる」＝任意 |
| P058 | Lv2 自分のネクサスが配置されたとき コスト3以下の相手を1体破壊 | `fieldEvent ownNexusDeployed selfMode:source`（BS09-050-e1）＋`destroy filter cost max 3` |
| P065 | Lv1〜3【粉砕】 | `keyword funsai`（BS04-063-e1） |
| P065 | Lv3 自分のスピリットの【粉砕】/【大粉砕】でバースト持ちが破棄されたとき、さらに2枚破棄 | `fieldEvent ownFunsaiMilled`（BS11-042-e1）＋**N6**＋`discard count:2`。【大粉砕】(`daifunsai`) でも発火するかは §4-8 |
| P077 | Lv1･2【強襲：1】（ターンに1回） | 同 P027（BS18-051 と同形） |
| P077 | Lv2 アタック時 疲労状態の自分のネクサスと同じコストのマジックを使用できない | **N3**＋**N7** |
| PX06 | Lv1･2 召喚時 コスト3以下のスピリットすべてを破壊 | `destroy all:true anySide:true filter cost max 3`（BS06-072-e1） |
| PX06 | 同 この効果で破壊されたスピリット1体につき相手のデッキを2枚破棄 | `sequence`＋`discard count:2 countCounter:"lastMoved"`（count×counter は BS11-048 で確認）。`lastMoved` が `destroy all` の件数を持つかは smoke で確認 |
| PX06 | Lv2 バトル時 相手のデッキを3枚破棄 | `triggered onBattleStart`（BS08-035-e3）＋`discard count:3` |
| PX09 | Lv1･2【暴風：5】 | `keyword bofu count:5`＋`onBlocked exhaust countFromBofu chooserIsTarget`（BS17-023-e2・e3） |
| PX09 | Lv1･2 アタックで相手のライフを減らしたとき デッキを12枚破棄 | `triggered onLifeDealt`＋`discard count:12`（BS03-097-e1） |
| PX09 | Lv2 自分のアタックステップ 相手のスピリットが疲労したとき1体につき3枚破棄 | `fieldEvent anySpiritExhausted subjectSide:opponent`（BS10-083-e1）＋`discard count:3`。同時疲労の数え方は §4-7 |
| PX19 | Lv1〜3 お互いのトラッシュのカードはこの効果以外の一切の効果を受けず、使えない | **N8** |
| PX19 | Lv2･3 アタック時 コスト4以下を破壊。破壊したとき回復 | `sequence`: `destroy filter cost max 4`＋`if {last:…} then refresh self`（BS17-070-e1 の `if`。単純な形は BS07-021-e2 の `onBattleWin refresh`）。条件の読み方は §4-9 |
| PX19 | Lv3 ステップ開始時 相手のスピリット1体を指定→このターン、コスト3としても扱う | `step attack own optional`（BS11-030-e1）＋**N9** |

## 4. 解釈が割れる点（自分では決めていない）

CONJUNCTION.md の早見表（`grep -n '^|' docs/design/CONJUNCTION.md`）と照らした。

| # | カード | 割れ目 | 読み方の候補と影響 |
| :-- | :-- | :-- | :-- |
| 1 | P022 | 「ネクサスがある間BP+2000」が『アタック時』ブロックの中にある | A：誘発時点で判定し `timedEffect`（以後ネクサスが減っても残る）。B：アタック中ずっと `aura` で判定（ネクサスが破壊されると下がる）。器は A が既存、B は `aura` に `phaseTurn` と condition を足す形 |
| 2 | P029 | 「相手は…しか使用できない」に期間の記載が無い | 候補：合体アタック時の**バトルの間**／**ターンの間**／合体している間。N1 の期間を決めてから器を確定する。また「相手のフィールドのシンボル」を解決時に固定するか、使うたびに見るか。相手にシンボルが無い場合は「何も使えない」か（`colorLockOpponent` の既存挙動に合わせる案） |
| 3 | P040 | 「コストを支払わなければ召喚できない」の「コスト」 | A：召喚コストを払う通常召喚だけ可で、効果による無償の召喚を禁じる。B：支払うコストが 0 のブレイヴ（軽減後）も禁じる。両陣営か、ブレイヴだけか（スピリットの召喚は影響なし）。影響は N2 の型の形 |
| 4 | P040 | 「カード名に『太陽』と入っている自分のスピリット」に自身を含めるか | 名前に太陽を含むので自身も数える（BS08-X29-e2 と同じ「以外」と書かれていない読み）。合体中ブレイヴの名前を数えるかも同時に決まる |
| 5 | P043 | 「このバトルの間、相手は指定されたコストのマジックカードを使えない」の範囲 | 手札のマジックだけか、トラッシュ・手元・バーストのマジックも含むか（BS11-060-e1 は手札のカード、BS17-083-e1 は使用元不問）。フラッシュの使用も止まるか。「指定する」のは P043 の持ち主（`declare` の選択者） |
| 6 | P054 | 「相手の合体スピリットすべての『合体時BP+』を0として扱う」の条件 | 「自分のバーストをセットしている間」を継続判定にする（BS14-090 の globalConstraint は無条件）。0 として扱うのはブレイヴ自体のLv判定を変えない（BS14-090 の注記と同じ） |
| 7 | PX09, PX19 他 | 「疲労したとき、そのスピリット1体につき」の数え方 | 自身の【暴風：5】で一度に 5 体疲労すると 15 枚破棄。イベントを疲労した個体ごとに発火させるか（`repeatPerCount`）。既存の `anySpiritExhausted`（BS10-083-e1）が 1 体 1 発火か、同時疲労を 1 回にまとめるかは未確認 |
| 8 | P065 | 「【粉砕】/【大粉砕】で…バースト持ちが破棄されたとき、さらに」 | 発火は粉砕の解決ごとに 1 回。追加の 2 枚は粉砕ではないので連鎖しない。「さらに」は「そうしたとき」ではなく同時扱い（CONJUNCTION 早見表）で、バースト持ちが複数でも 1 回。大粉砕でも発火させるか（`ownFunsaiMilled` が `daifunsai` を含むか） |
| 9 | PX19 | 「この効果でスピリットを破壊したとき、回復する」 | 「そうしたとき」型（破壊を完全に解決できたときだけ）と読むか、「この効果発揮後」型（破壊を試みれば足りる）か。破壊が置換された場合（【不死】等で場に残る）に回復するか。`if {last:…}` の `last` が破壊できた個体を指すか要確認 |
| 10 | PX19 | トラッシュ凍結の範囲 | 「効果を受けず、使えない」＝トラッシュのカードに対する移動（回収・コア・シンボル軽減の `trashSymbolReduction` BS11-039-e1）、トラッシュから使う効果（BS13-081 系の召喚）を全部止めるか。**トラッシュに新しく置かれるカード**は影響なしと読む。この効果自身の `PX19` がトラッシュにあるとき（手札から捨てられて）は自分で止まるか。範囲が広く、複数カードに効く一般則なので、実装前にユーザー確認が要る |
| 11 | PX19 | 「コスト3としても扱う」＝元のコストに**加えて**3 | `alsoCostGrant` と同じ読み（BS06-052）。スピリットが元のコストと 3 の両方で絞り込みに当たる。指定は「指定できる」任意。ステップ開始時に指定するので、そのターン後から登場するスピリットには効かない（個体指定） |
| 12 | P055 | 「【強襲】の効果をネクサスではなくこのスピリットを疲労させて使用できる」 | 代替コスト（選択式）として読む：P055 が回復状態のときだけ選べる。P055 自身が【強襲】で回復したとき（自分で自分を）どうするか。回数制限（`limitByKeyword`）は元の【強襲】のまま。N5 が複数カードに効く一般則か 1 枚専用かを決める必要がある（今は P055 のみ） |
| 13 | P077 | 「疲労状態の自分のネクサスと同じコスト」の評価時点と期間 | アタック時に集めた**固定集合**か、マジック使用のたびに見る**継続**か。直前の【強襲】で疲労させたネクサスのコストも含む。期間の記載は無い（バトル／ターン） |
| 14 | P058 | Lv2「配置されたネクサス1つにつき」 | 同時に複数のネクサスが置かれることは通常無く、1 回の配置=1 回の破壊。`repeatPerCount` を使うか単発かだけの違い |
