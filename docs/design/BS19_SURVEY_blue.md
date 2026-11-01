# BS19 調査メモ：blue（調査役）

対象：BS19-056, BS19-057, BS19-058, BS19-059, BS19-060, BS19-061, BS19-062, BS19-063, BS19-064, BS19-065, BS19-066, BS19-077, BS19-078, BS19-094, BS19-095, BS19-096, BS19-112, BS19-113, BS19-114, BS19-X06, BS19-X08。実装はしていない。

メモ内の略記：連鎖の行は「連鎖（条件 色×個数）」と書き、[色]：の中身は別の行で仕分ける。強化の行は「強化（青）」とだけ書く（中身はメインループ設計の新キーワード【強化】で共通）。「【連鎖】を持つ」「【強化】を持つ」の絞り込みは「絞り込み：連鎖を持つ」「絞り込み：強化を持つ」のように書く。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）

- 効果の節：**39**（効果なし3枚＝056/058/063 を含む全21枚の合計。合体条件2行は条件であって効果の節ではないため集計外）
- 既存の器で書ける：**32**
- 新しい部品が要る：**7**（BS19-060・064・066・078・096・112・X06 の各1節）
- 連鎖：**4**（060/065/066/114。条件はすべて 赤×1。[赤]：の中身4つはすべて既存の器で書ける）
- 強化：**6**（057/059/061/X06/X08×2。すべて「強化（青）」＝デッキ破棄+1枚。メインループ設計のキーワードとして扱う）

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | バースト発動禁止の「色」の軸（アクション／条件の軸：`battleLock` の `lock:"burst"` に色指定、または globalConstraint に「指定色のバーストは発動できない」） | 「相手は白のバーストを発動できない」は `battleLock lock:"burst"`（手本 BS17-021-e1）でバトル中の発動禁止は書けるが、`lock` は `"flash"|"burst"|"magic"` のフラグのみで色の軸が無い（timedContent.ts:23）。`noBurstActivationByEvent`（globalConstraint.ts:107）はバースト条件のイベント軸であって色の軸が無い。096 は『お互いのアタックステップ』限定の継続版が必要（battleLock の期間 battle では書けない） | BS19-060, BS19-064, BS19-096 |
| 2 | アタッカーのキーワードを条件にする軸（条件の軸：`noBurstActivationByEvent` の `whileOwnAttackerFamily` のキーワード版） | 「絞り込み：強化を持つ がアタックしたとき」は BS18-022-e1 の `whileOwnAttackerFamily:["雄将"]` と同形だが、系統の軸しか無くキーワードの軸が無い（globalConstraint.ts:107） | BS19-064 |
| 3 | magicRestriction に「固定色リスト・両陣営」の restriction（条件の軸） | 「お互い、緑/白/黄のマジックカードを使用できない」は `magicRestriction`（effectDefContinuous.ts:636）で書きたいが、既存の restriction は `colorLockOpponent`（相手のみ・使用者のフィールドのシンボル基準）や `costLimitAll`（コスト基準）で、固定の色リスト・両陣営の組合せが無い | BS19-066 |
| 4 | 手札カードの軽減シンボルを無いものとして扱う playerRule ＋ 手札カードの「キーワードを持たない」絞り込み（アクション） | 「相手の手札にある【連鎖】を持たないマジックカードすべての軽減シンボルすべてを無いものとして扱う」は、playerRule の `handReductionColorAsForPid`（type.ts:306）が「色を置き換える（件数は変えない）」だけで消去が書けず、CardPick（effectAction.ts:27）に `keyword` はあっても `keywordExclude`（持ちません軸）が無い。手本の形は BS18-059-e2（合体アタック時→timedEffect playerRule duration:"battle"） | BS19-078 |
| 5 | フィールドに残り続けるマジック（アクション／マジックの居場所） | 「このマジックカードは、〜ライフが減るまで自分のフィールドに置いておき、その間、効果を発揮し続ける。この効果が無効になったとき破棄される」— `magic` の効果は使用後にトラッシュへ送る前提で、場に残るマジックの器が型にもゲーム状態にも無い（grep しても既存データに「フィールドに置いておき」の前例なし）。中身のマジック色制限（`cantUseMagicForPid allowColors`＝手本 P029-e2）と `noTrashRecovery`（手本 BS06-089-e1）は既存 | BS19-112 |
| 6 | 「自分のデッキ破棄効果の解決で1枚も破棄できなかったとき」のトリガー（タイミング） | X06 の「デッキ破棄効果を発揮したとき、1枚も破棄できなければ回復」は、`ownFunsaiMilled`（fieldEvent.ts:25）や `opponentDeckMilled`（同:31）が**実破棄ありき**で発火し、0枚のときに発火するイベントが無い。`if` の条件軸（effectAction.ts:43）にも「直前の自分の破棄効果の実破棄枚数0」が無い | BS19-X06 |
| 7 | 「ターンにN回まで」の回数カウンタ（カウンタ） | X06 の回復は「ターンに3回まで」だが、`triggered` の `oncePerTurn` は boolean で1回しか書けない（effectDefTrigger.ts:26）。【強襲】のターン回数カウンタ（cardInstance.ts:113 kyoshuUsed）はキーワード専用で、キーワードを介さない効果には使えない（手本 BS13-X06-e4 は `limitByKeyword:"kyoshu"` で【強襲】に乗っている） | BS19-X06 |

## 3. カードごとの表

| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS19-056 | （効果なし） | — |
| BS19-057 | 強化（青） | 新キーワード【強化】（メインループ設計） |
| BS19-058 | （効果なし） | — |
| BS19-059 | 強化（青） | 新キーワード【強化】 |
| BS19-060 | Lv1-2 アタック時：相手は白のバーストを発動できない | `battleLock lock:"burst"`（手本 BS17-021-e1）＋新部品#1（白の色軸） |
| BS19-060 | 連鎖（条件 赤×1） | 【連鎖】の枠組み（メインループ設計） |
| BS19-060 | [赤]：自分はデッキから1枚ドローする | `draw count:1`（手本 SD06-002-e1） |
| BS19-061 | 強化（青） | 新キーワード【強化】 |
| BS19-062 | Lv1-3【粉砕】アタック時 | `keyword:"funsai"`（手本 BS17-053-e1） |
| BS19-062 | Lv2-3【強襲：1】アタック時 | `keyword:"kyoshu" count:1`（手本 BS16-052-e1） |
| BS19-063 | （効果なし） | — |
| BS19-064 | Lv1-3 アタック時：相手のデッックを上から2枚破棄する | `discard from:"deck" side:"opponent" count:2`（手本 BS11-041-e1） |
| BS19-064 | Lv2-3 自分のアタックステップ：絞り込み：強化を持つ がアタックしたとき、相手は赤のバーストを発動できない | `noBurstActivationByEvent`（手本 BS18-022-e1）＋新部品#1（色）・#2（キーワード軸） |
| BS19-064 | 合体時Lv3 合体アタック時：このスピリットのコスト以下の相手のスピリット1体を破壊する | `destroy filter:{maxCostAsSelf:true}`（手本 BS10-X06-e2 の granted。合体時は手本 BS11-059-e2 の `whileCombined`） |
| BS19-065 | Lv1-2 召喚時：コスト5以下の相手のスピリット1体を破壊する | `destroy filter:{cost:{max:5}}`（手本 BS17-016-e3） |
| BS19-065 | 連鎖（条件 赤×1） | 【連鎖】の枠組み（メインループ設計） |
| BS19-065 | [赤]：自分のトラッシュにあるスピリットカード1枚を手札に戻す | `moveCards from:"trash" dest:"hand" pick:{cardType:"spirit"} count:1`（手本 BS14-103-e1） |
| BS19-066 | Lv1-2：お互い、緑/白/黄のマジックカードを使用できない | `magicRestriction`（器のみ。手本 BS03-113-e1）＋新部品#3 |
| BS19-066 | Lv2：相手は、トラッシュのカードを手札に戻せない | `opponentCantReturnFromTrashToHand`（手本 BS13-044-e2） |
| BS19-066 | 連鎖（条件 赤×1） | 【連鎖】の枠組み（メインループ設計） |
| BS19-066 | [赤]：このスピリットに青のシンボル2つを追加する | `timedEffect content:[{symbolAdd, color:"blue", count:2}]`（手本 BS13-062-e2。対象はこのスピリット＝`target:"self"`） |
| BS19-077 | Lv1 このブレイヴの召喚時：このターンの間、絞り込み：強化を持つ 自分のスピリット1体を、そのスピリットが持つ最高Lvとして扱う | `timedEffect content:[{level, max:true}] duration:"turn" count:1 filter:{keyword:"kyoka"}`（手本 BS04-069-e1。1体選択は timedEffect の count/choosing、filter の keyword 軸は targetFilter.ts:30） |
| BS19-077 | 合体条件：【強化】を持つ | `braveCondition {keyword:"kyoka"}`（器あり。type.ts:73 の `keyword` 軸。データ上の手本は無いが型が対応） |
| BS19-077 | 合体時【粉砕】合体アタック時：相手のデッックを上から、このスピリットのLvと同じ枚数破棄する | `keyword:"funsai" whileCombined:true`（手本 BS11-059-e2） |
| BS19-078 | 合体条件：コスト4以上 | `braveCondition {minCost:4}`（手本 BS11-053） |
| BS19-078 | 合体時 合体アタック時：相手の手札にある【連鎖】を持たないマジックカードすべての軽減シンボルすべてを無いものとして扱う | 新部品#4（`timedEffect playerRule` の形は手本 BS18-059-e2） |
| BS19-094 | Lv1-2：『このスピリットの召喚時』効果と、『このブレイヴの召喚時』効果は発揮されない | `noSummonTriggerByCost`（maxCost 省略＝コスト問わず全て・両陣営。手本 BS11-072-e2 が同文言） |
| BS19-094 | Lv2 自分のアタックステップ：絞り込み：闘神 がブロックされたとき、ボイドからコア1個を自分のスピリットに置く | `fieldEvent event:"ownSpiritBlocked" subjectFilter:{family:"闘神"}` ＋ `placeCores from:"void" to:"spirit" count:1`（手本 BS08-065-e1。placeCores 自体は P063-e3） |
| BS19-095 | Lv1-2 配置時：自分の手札にあるブレイヴカード1枚をコストを支払わずに召喚できる。ただし『このブレイヴの召喚時』効果は発揮されない | `trigger:"onDeploy"` ＋ `moveCards from:"hand" dest:"summon" pick:{cardType:"brave"} count:1 noSummonEffects:true`（手本 BS16-044-e1 が「コストを支払わずに＋ただし召喚時効果は発揮されない」の同構文） |
| BS19-095 | Lv2 自分のアタックステップ：絞り込み：闘神 の自分のスピリットすべてを、そのスピリットが持つ最高Lvとして扱う | `levelAs target:"ownSpiritsByFamily" familyFilter:"闘神" treatAs:"max" phase:"attack"`（手本 BS08-065-e2） |
| BS19-096 | Lv1-2 自分のアタックステップ：絞り込み：連鎖を持つ がアタックしたとき、そのスピリットのLvを1つ上のものとして扱う | `levelAs target:"ownSpiritsByKeyword" keywordFilter:"rensa" treatAs:{plus:1} whileAttacking:true`（手本 BS16-071-e2（plus:1）。キーワード軸は手本 BS03-090-e1。plus は最高Lvで頭打ち） |
| BS19-096 | Lv2 お互いのアタックステップ：相手は赤/緑/白のバーストを発動できない | 新部品#1（globalConstraint の色指定バースト発動禁止。『お互いのアタックステップ』の phase/turn は既存の書き方） |
| BS19-112 | メイン：お互い、それぞれのフィールドにあるシンボルと同じ色のマジックカードしか使用できず、自分のトラッシュにあるカードを手札に加えられない。ライフが減るまで自分のフィールドに置いて効果を発揮し続ける | 新部品#5（フィールドマジック）。中身は既存：`cantUseMagicForPid allowColors:"opponentFieldSymbols"` を両陣営に（手本 P029-e2）、`noTrashRecovery`（手本 BS06-089-e1） |
| BS19-112 | フラッシュ：このターンの間、スピリット1体をBP+2000する | `timedEffect content:[{bp, amount:2000}] duration:"turn"`（手本 BS17-038-e1） |
| BS19-113 | フラッシュ：このターンの間、自分のスピリット1体のLvを2つまで上のものとして扱う | `timedEffect content:[{level, up:2}] duration:"turn" count:1 side:"own"`（手本 BS14-112-e2 の up:1。実装は up で最高Lvに頭打ち＝「2つまで」と一致） |
| BS19-114 | フラッシュ：コスト5/8/11のバースト効果を持つスピリットすべてを破壊する | `destroy all:true filter:{cost:{in:[5,8,11]}, hasBurst:true}`（手本 BS01-023-e1 の all:true。cost.in は targetFilter.ts:27、hasBurst は同:84） |
| BS19-114 | 連鎖（条件 赤×1） | 【連鎖】の枠組み（メインループ設計） |
| BS19-114 | [赤]：BP3000以下のスピリットすべてを破壊する | `destroy all:true anySide:true filter:{maxBp:3000}`（手本 BS01-023-e1） |
| BS19-X06 | Lv1-3 アタック時：相手のデッックを上から5枚破棄し、マジックカードが破棄されたとき、このスピリットに青のシンボル1つを追加する | `sequence [discard 5, if {last:{cardType:"magic"}} then シンボル追加]`（手本 P071-e2・BS15-X06-e3。`if last` は「直前に動いたカードの1枚でも一致」＝control.ts:184） |
| BS19-X06 | Lv2-3 強化（青） | 新キーワード【強化】 |
| BS19-X06 | Lv3 アタック時：デッキ破棄効果を発揮したとき、1枚も破棄できなければ、ターンに3回まで、このスピリットは回復できる | `refresh target:"self"`（手本 BS13-X06-e2）＋新部品#6（0枚破棄のタイミング）・#7（ターンに3回のカウンタ） |
| BS19-X08 | Lv1 強化（青） | 新キーワード【強化】 |
| BS19-X08 | 合体条件：コスト5以上 | `braveCondition {minCost:5}`（手本 BS17-058） |
| BS19-X08 | 合体時 強化（青） | 新キーワード【強化】（`whileCombined` は手本 BS11-059-e2 の形） |
| BS19-X08 | 合体時【強襲：1】アタック時：このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる | `keyword:"kyoshu" count:1 whileCombined:true`（手本 BS16-052-e1・合体時の形は BS11-059-e2） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

- BS19-064「【強化】を持つ自分のスピリットがアタックしたとき、相手は赤のバーストを発動できない」：見出しは『自分のアタックステップ』だが、効く範囲は (a) そのスピリットのバトルの間（battleLock 式）か (b) アタックステップ全体か。同構文の BS18-022（駿将チラウン）は `noBurstActivationByEvent`（ステップ継続）で実装済みなので BS18-022 に合わせるなら (b)。
- BS19-094「ボイドからコア1個を自分のスピリットに置く」：置く先は (a) ブロックされた闘神のスピリット自身か (b) 自分のスピリットから選ぶか。文言は「自分のスピリットに」で対象を指定していない。
- BS19-096「【連鎖】を持つ自分のスピリットがアタックしたとき、そのスピリットのLvを1つ上のものとして扱う」：(a) アタック宣言からバトル終了まで（levelAs の whileAttacking）か (b) 自分のアタックステップの間ずっとか。levelAs は (a) で書ける。
- BS19-X06 節1「このスピリットに青のシンボル1つを追加する」：期間の記述が無い。(a) このバトルの間（手本 BS13-062-e2 は duration:"battle"）か (b) 場を離れるまで（`addSymbolPermanent`）か。
- BS19-X06 節3「相手の効果で1枚も破棄できなければ」：(a) 相手の「デッキは破棄されない」効果で阻止されたときだけか (b) デッキ切れなど理由を問わず実破棄0枚ならいつでもか。
- BS19-112 フィールドマジックの細部（「相手のスピリットのアタックによって自分のライフが減るまで」「この効果が無効になったとき破棄される」の扱い、無効化されたときの中身の制限がどう残るか）は、フィールドマジックの器（新部品#5）の設計と一緒にメインルールで決める必要がある。
