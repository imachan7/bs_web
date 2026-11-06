# BS21 調査メモ：yellow（調査役）
対象：BS21-037・038・039・040・041・042・043・044・045・063・064・071・081・082・X05。実装はしていない。
（多色 BS21-072 珊瑚の樹海は colors[0]=blue なので青担当。CP13-01 は対象外。）

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：28（037:1 / 038:0 / 039:3 / 040:1 / 041:2 / 042:3 / 043:2 / 044:2 / 045:2 / 063:1 / 064:2 / 071:2 / 081:2 / 082:2 / X05:3）
- 既存の器で書ける：25
- 新しい部品が要る：3（N1・N2・N3。§2）
- 【連鎖】を持つカード：5枚（042・043・044・081・X05。すべて条件《緑》で、044・081 は緑/白の2色）
- 【強化】を持つカード：1枚（039。黄）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | globalConstraint `noRefreshByAnyEffect` に片側軸（`side: "opponent"`）（条件の軸） | 「回復できない」の既存の器は3つあるが、constraint `noRefresh`（server/src/types/constraintDef.ts:34）は発生源自身限定、`constraintGrant`（effectDefContinuous.ts:574）は `target: "ownAll"` 固定で相手のスピリットに付けられない、globalConstraint `noRefreshByAnyEffect`（globalConstraint.ts:23）は両陣営固定で「相手のスピリットすべて」の片側に効かせられない。phase/turn（相手のアタックステップ）の絞り込みは globalConstraint の既存の軸 | 041 Lv2-3 |
| N2 | `symbolAddGrant` に `onlyWhileSpiritState` 軸（条件の軸） | ブレイヴの「スピリット状態の間だけ」の既存の器は `keywordGrant` の `onlyWhileSpiritState`（effectDefContinuous.ts:253）だけ。`symbolAddGrant`（effectDefContinuous.ts:426）にはこの軸が無く、コメントのとおり combinedBraves は合体中も effectSources に残り続けるため、軸を足さないと合体後もシンボル追加が効いたままになる。`whileCombined`（合体中だけ）はあるが逆の意味。手本なし：data/cards にブレイヴの symbolAddGrant の前例は無い | 064 Lv1 |
| N3 | 自分側の「バーストを発動できない」ロック（playerRule または battleLock の自分側・ターン期間）（アクション） | `noBurstEffectForPid`（type.ts:315）は「発動は成立し解決だけ飛ぶ」別物で発動を止めない。`battleLock: "burst"`（timedContent.ts:23）は timedEffect の side で陣営が決まるが、実績は相手側・バトル期間のみ（BS19-033-e2・BS19-060）。082 は「この効果で（使った）自分が」ターン中発動できなくなる読みで、ターン期間の自分側ロックの前例が無い。§4 の読み次第では battleLock で足りる | 082 メイン |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））

| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS21-037 カメロンパン | Lv1-2『このスピリットの破壊時』自分はデッキから1枚ドローする | 既存。triggered `onDestroy`＋draw（手本 BS11-009-e1。効果文「『このスピリットの破壊時』\n自分はデッキから1枚ドローする。」と同じ形） |
| BS21-038 ボジャノーイ | （効果なし） | ― |
| BS21-039 天使リセル | Lv1-2『自分のアタックステップ』このスピリットはアタックできない | 既存。constraint `cantAttack`（手本 BS02-036-e2。効果文「Lv1『自分のアタックステップ』\nこのスピリットはアタックできない。」と同じ形。アタックは元々自分のアタックステップでしかできないので phase 指定は不要） |
| BS21-039 | Lv1-2【強化】自分の「BP-効果」を-1000する | 既存。強化（黄）。keyword `kyoka`／`bpMinus`（手本 BS19-052-e1） |
| BS21-039 | Lv2『お互いのアタックステップ』系統：「天霊」を持つ自分のスピリットすべてをBP+2000する | 既存。aura `bp`（target ownAll・familyFilter・phaseTurn attack/both）（手本 BS09-006-e1。効果文「Lv1･Lv2『お互いのアタックステップ』\n系統：「星竜」を持つ自分のスピリットすべてをBP+3000する。」と同じ形） |
| BS21-040 ガトーブレパス | Lv1-3【聖命】『このスピリットのアタック時』アタックによって相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く | 既存。keyword `seimei`＋triggered `onLifeDealt`＋placeCores void→life（手本 BS14-052-e1・e2。効果文「Lv1･Lv2･Lv3【聖命】『このスピリットのアタック時』\nこのスピリットのアタックによって相手のライフを減らしたとき、ボイドからコア1個を自分のライフに置く。」と同一文） |
| BS21-041 アドペンタン＆チャール | Lv1-3 相手のスピリットがターンで初めてBP0になったとき、自分はデッキから1枚ドローする | 既存。fieldEvent `opponentSpiritBpReachedZero`・oncePerTurn・draw（手本 BS19-091-e1。効果文同一） |
| BS21-041 | Lv2-3『相手のアタックステップ』相手のスピリットすべては回復できない | 新しい部品 N1（§2） |
| BS21-042 十剣聖ナラシンハ | Lv1-3『このスピリットのアタック時』このスピリットは、Lv1の相手のスピリットからブロックされない | 既存。timedEffect `unblockable`（opponentOnly・from level [1]・duration battle）（手本 BS20-063-e1。効果文「【合体時】『このスピリットの合体アタック時』\nこのスピリットはLv1の相手のスピリットからブロックされない。」と同じ形。期間の書かれていない『アタック時』の継続はそのアタックの間＝BS20_PLAN §1） |
| BS21-042 | 【合体時】Lv2-3『このスピリットの合体アタック時』自分のトラッシュにあるコスト2のスピリットカード1枚を手札に戻す | 既存。triggered `onAttack`・whileCombined＋moveCards trash→hand（pick cardType spirit・cost 2）（手本 BS11-051-e2。効果文「【合体時】『このスピリットの合体アタック時』\n自分のトラッシュにあるコスト6以下のスピリットカード1枚を手札に戻す。」と同じ形） |
| BS21-042 | 連鎖（条件 緑×1） | 既存。sequence＋if（ownColorSymbols green・atLeast 1）。中身「[緑]：相手のスピリット1体を疲労させる」＝`exhaust` count 1（手本 BS19-108-e1 の if-then の `{"type": "exhaust", "count": 2, "chooserIsTarget": true}`。081 は自分が選ぶので chooserIsTarget 無し） |
| BS21-043 ダーク・アイベリックス | Lv2-3『このスピリットのアタック時』このスピリットは、Lv1/Lv2の相手のスピリットからブロックされない | 既存。timedEffect `unblockable`（from level [1,2]・duration battle）（手本 BS20-063-e1 と同じ形。level 軸は配列可＝targetFilter.ts:28） |
| BS21-043 | 連鎖（条件 緑×1） | 既存。中身は 042 と同じ（exhaust count 1） |
| BS21-044 凶獣トウコツ | Lv1-2『このスピリットのブロック時』自分のトラッシュにある黄のマジックカード1枚を手札に戻す | 既存。triggered `onBlock`＋moveCards trash→hand（pick cardType magic・color yellow）（手本 BS09-X39-e1。効果文「相手のスピリットによって自分のライフが減ったとき、自分のトラッシュにある黄のマジックカード1枚を手札に戻す。」の moveCards 部分と同じ形） |
| BS21-044 | 連鎖（条件 緑/白×各1） | 既存。if を入れ子（BS19_PLAN §2.2 A）。[緑]「ボイドからコア1個をこのスピリットに置く」＝placeCores void→self（手本 BS19-039-e1 の `{"type": "if", "cond": {"count": {"ownColorSymbols": "green"}, "atLeast": 1}, "then": {"type": "placeCores", "from": "void", "to": "spirit", "target": "self", "count": 1}}` と同一）。[白]「BP4000以下の相手のスピリット1体を手札に戻す」＝return to hand・filter maxBp 4000（手本 BS19-039-e1 の `{"type": "return", "to": "hand", "count": 1, "filter": {"maxBp": 4000}}` と同一） |
| BS21-045 美の天使カフオペイア | Lv1-3『このスピリットのアタック時』このターンの間、相手のスピリット1体をBP-3000する | 既存。bpMinus amount 3000 count 1（手本 BS19-022-e2 の `{"type": "bpMinus", "amount": 2000, "count": 1}`。効果文「このターンの間、相手のスピリット1体をBP-2000する」と同じ形） |
| BS21-045 | Lv2-3『自分のアタックステップ』系統：「星魂」を持つ自分のスピリットすべては、BP0の相手のスピリットからブロックされない | 既存。constraintGrant（target ownAll・filter family 星魂・phaseTurn attack/own）＋constraint `unblockableBy`（filter maxBp 0）（手本 BS14-052-e3 の `{"kind": "constraintGrant", "target": "ownAll", "filter": {"keyword": "seimei"}, "phaseTurn": {...}, "constraint": {"type": "unblockableBy", "opponentOnly": true, "filter": {"level": [1]}}}` と同じ形。BP0＝実効BP 0（BS20 データ黄のバッチで実効BPは0で下止め済み）なので maxBp 0 で書ける。実装時に要確認） |
| BS21-063 ぐるみパンダ | 【合体時】このスピリットが相手によって破壊されたとき、ボイドからコア1個を自分のライフに置く | 既存。triggered `onDestroy`・whileCombined・condition `selfDestroyedByOpponent`＋placeCores void→life（手本 BS15-X04-e1 の `{"kind": "triggered", "trigger": "onDestroy", "condition": {"selfDestroyedByOpponent": true}, ...}` と BS15-059-e1 の `{"kind": "triggered", "trigger": "onBattleLose", "whileCombined": true, "action": {"type": "placeCores", "from": "void", "to": "life", "count": 1}}`。「相手によって」＝効果とBP比べの両方（effectDefTrigger.ts:63）。§4 の読み参照） |
| BS21-064 ブリキタイガー | Lv1 このブレイヴがスピリット状態の間、このスピリットに黄のシンボル1つを追加する | 新しい部品 N2（§2） |
| BS21-064 | 合体条件：コスト3以上／【合体時】【聖命】『このスピリットのアタック時』（聖命の本文） | 既存。040 と同じ（手本 BS14-052-e1・e2 に whileCombined を付けた形。合体中のブレイヴの【合体時】ステップ効果の発火は BS20 で直し済み） |
| BS21-071 四雲庵 | Lv1-2『自分のスタートステップ』手札の系統：「想獣」/「星魂」のスピリットカード1枚を破棄することで、ボイドからコア1個を自分のリザーブに置く。この効果はターンに1回しか使えない | 既存。step（step start・turn own・optional・oncePerTurn＋onceScope name）＋pay（cost moveCards hand→trash・pick family）→placeCores void→reserve（手本 BS09-039-e1。効果文「『自分のスタートステップ』\n自分の手札の[キャラクターロスト]を破棄することで、…」と同じ形。「この効果はターンに1回しか使えない」＝カード名ごと（BS20_PLAN §1・RULES_BATSPI_WIKI）） |
| BS21-071 | Lv2『自分のメインステップ』自分がコスト7以上のスピリットカードを召喚するとき、このネクサスのシンボルを黄のシンボル3つにする | 既存。`symbolWhenSummoning`（color yellow・count 3・minCost 7）（effectDefCost.ts:7。手本 BS13-003-e1。効果文「自分が本来のコストが7以上のスピリットカードを召喚するとき、このスピリットに赤のシンボル2つを追加する。」と同じ形。軽減計算で足す（shared/cost.ts）） |
| BS21-081 サプライズスラップ | フラッシュ：アタックしている回復状態の相手のスピリット1体を破壊する | 既存。destroy（filter attackingOnly＋refreshed）（手本 BS14-107-e2。効果文「アタックしている回復状態の相手のスピリット1体を破壊する。」と同一文） |
| BS21-081 | 連鎖（条件 緑/白×各1） | 既存。[緑]「コスト3の相手のスピリット2体を疲労させる」＝exhaust count 2・filter cost in [3]（手本 BS19-108-e1 の exhaust。[白]「相手のスピリット1体を指定する。このターンの間、指定された相手のスピリットのアタックによって、自分のライフは減らない」＝`negateLifeDamageFromTarget`（手本 BS19-106-e1。効果文「このターンの間、指定された相手のスピリットのアタック/効果によって、自分のライフは減らない。」のアタックのみ版＝includeEffects 無し） |
| BS21-082 ライフドリーム | メイン：このターンの間、自分の黄のスピリットすべてに“『このスピリットのアタック時』自分のライフのコア1個をこのスピリットに置くことで、このスピリットはブロックされない。この効果で自分はバーストを発動できない”を与える | 付与の枠は既存：timedEffect（all・filter color yellow・side own・duration turn）＋content `grantTrigger`（trigger onAttack）（手本 BS08-068-e1。効果文「このターンの間、カード名に「ヴルム」と入っている自分のスピリット1体に“『このスピリットのアタック時』…”を与える。」と同じ形）。与える中身＝pay（cost moveCores life→self 1）→timedEffect `unblockable`（duration battle・target self）は既存（pay＝effectAction.ts:120、unblockable＝timedContent.ts:22）。「この効果で自分はバーストを発動できない」は新しい部品 N3（§2）＋§4 の読み |
| BS21-082 | フラッシュ：このターンの間、スピリット1体をBP-2000する | 既存。bpMinus amount 2000 count 1（手本 BS19-022-e2 と同じ形） |
| BS21-X05 陸獣神ベヒモス | Lv1-3『自分のアタックステップ』相手のスピリットすべてをLv1として扱う | 既存。`levelAs`（target opponentSpiritsAll・treatAs 1・phase attack・turn own）（手本 BS04-107-e3。効果文「このターンの間、相手のスピリットすべてをLv1として扱う。」と同じ扱い。BS04-107-e3 はマジックの turn 版 `{"id": "BS04-107-e3", "kind": "levelAs", "levels": null, "target": "opponentSpiritsAll", "treatAs": 1, "lentOnly": true}`。levelAs に phase/turn 軸はある（effectDefContinuous.ts:363-364）） |
| BS21-X05 | Lv2-3『このスピリットのアタック時』このスピリットは、コアが1個の相手のスピリットからブロックされない | 既存。timedEffect `unblockable`（from filter cores 1・duration battle）（手本 BS20-063-e1 と同じ形。cores 軸＝targetFilter.ts:39） |
| BS21-X05 | 連鎖（条件 緑×1） | 既存。中身「[緑]：コスト4以下の相手のスピリットすべてを疲労させる」＝exhaust all・filter cost max 4（手本 BS19-108-e1 の exhaust。all 軸＝effectAction.ts:70） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

| # | カード・節 | 読みの候補 |
| :-- | :-- | :-- |
| 1 | 082 メイン「この効果で自分はバーストを発動できない」 | (a) この効果（ライフのコアを置く）を使った後、**そのターンの間**自分はバーストを発動できない。(b) この効果の解決中（そのバトルの間）だけ発動できない。(c) この効果を使ったことに対する代償で、発動できないのは1回だけ。器もこれで変わる（ターン期間なら N3、バトル期間なら battleLock で足りる可能性） |
| 2 | 063【合体時】「このスピリットが相手によって破壊されたとき」 | (a) 合体中に**合体スピリット（ホスト）**が相手によって破壊されたときに発揮（ブレイヴが「残す」で場に残る場合も含む）。(b) ホストが破壊されブレイヴが場に残った場合は「このスピリット」が破壊されていないとみなして発揮しない。処理の順（破壊待機の列と「残す」確認の前後）も聞く |
| 3 | 045 Lv2「BP0の相手のスピリットからブロックされない」 | (a) 実効BPが0の相手（BP-効果で0になった個体。maxBp 0 で書ける）。(b) 「BP0になった」印を持つ個体だけ。BS20 の「BP0になったとき」の実装（0以下に届いたときに起こす）と同じ扱いなら (a) で足りるが要確認 |
| 4 | 041 Lv2「相手のスピリットすべては回復できない」の効く範囲 | (a) 相手のアタックステップの間の**効果による回復**すべて（リフレッシュステップはこのステップに含まれないので影響しない）。(b) 何らかの理由でこのステップ中に回復する処理すべて（同じだが、N1 の実装範囲を noRefreshByAnyEffect と同じ「効果による回復」に絞るか、マジック・ネクサス・スピリットの区別なく全部か） |
