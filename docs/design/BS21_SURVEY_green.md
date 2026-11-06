# BS21 調査メモ：green（調査役）
対象：BS21-019, 020, 021, 022, 023, 024, 025, 026, 027, 059, 060, 069, 077, 078, X03。実装はしていない。
（多色 BS21-072 は colors[0] が green でないため対象外。CP13-01 も対象外。green に【強化】は無し）

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**22**（BS21-020 は効果なしの0節。連鎖の節は連鎖元と別に数えている）
- 既存の器で書ける：**18**
- 新しい部品が要る：**4**（025-Lv2／069-Lv2／077／X03-連鎖[青]）
- 連鎖：**3節**（022・078・X03。いずれも連鎖元＋連鎖で2行。連鎖の中身が新部品なのは X03 の[青]のみ）
- 強化：**0**

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | fieldEvent `opponentSpiritExhaustedByOwnSpiritEffect` に発生源種別の軸 `sourceTypes: ["magic"]`（条件の軸） | 「自分の効果で相手のスピリットを疲労させたとき」は BS20-069-e2（N9）で実装済みだが、定義コメント（fieldEvent.ts:70）のとおり**スピリット/ブレイヴの効果限定**。マジックの効果限定に絞る軸が無い（`opponentEffectSourceTypes` は「相手の効果」用で、自分の効果の種別を絞る軸は無い） | BS21-025 Lv2 |
| N2 | 「この効果は重複しない」＝同名カードの効果を複数枚引かれても1回にする軸（カウンタ） | 069 Lv2 の効果自体は `battleWon`＋`lifeCrush` で書けるが、ネクサスを2枚置いたときの重複排除を書く器が無い（`oncePerTurn`/`onceScope:"name"` はターン単位・起動/誘発用で、常在の誘発の恒常的重複排除には使えない。BS02-087 の「(この効果は重複しない)」もデータに反映されていない） | BS21-069 Lv2 |
| N3 | `reviveOnDestroy`（lent）の対象に `chosenInstance`（targetChoiceLendThisTurn で選んだ1体）を指定する軸（条件の軸） | 「破壊されたら手札に戻る」は BS07-070-e3（`reviveOnDestroy` lentOnly `when.byOpponentEffect` `revived.toHand`）で書けるが、`scope` は self/ownAll/ownNexus のみで、**マジックで指定した1体だけ**に絞れない（cardInstance.ts:112 のとおり chosenInstance を読むのは vanillaAsGrant/spiritEffectsDisabledGrant だけ） | BS21-077 |
| N4 | 連鎖（＝if の then アクション）の中で、自身に起動能力「pay（自分のネクサス1つを疲労）→回復、ターンに1回」を**与える**器（アクション） | pay＋refresh＋ターン1回は既存（triggered の pay cost `{type:"exhaust", side:"own", nexusOnly:true}` BS14-066-e2／activated の `maxPerTurn`）。しかし連鎖の中身はアクションで、継続の連鎖は BS19 M1 のとおり aura/constraint の condition に書くことになっており、**起動能力を個体に付与するアクションが無い**（`effectGrant` の granted は TriggerEvent 誘発限定で activated を付与できない） | BS21-X03 連鎖[青] |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS21-019 | フラッシュ【神速】（手札からリザーブ支払いで召喚） | keyword `soku`（BS20-021-e1） |
| BS21-020 | （効果なし） | エントリなし |
| BS21-021 | Lv1-2『自分のアタックステップ』星魂アタック時→BP4000以下の相手1体を疲労 | fieldEvent `anySpiritAttacked` subjectFilter family＋exhaust filter maxBp（BS19-086-e2＋TargetFilter maxBp） |
| BS21-022 | Lv2『このスピリットのアタック時』合体していない相手1体を疲労 | triggered onAttack→exhaust filter（BS20-015-e1。filter に `combined:false`） |
| BS21-022 | 連鎖（条件 赤×1）：ドロー1枚 | sequence＋if ownColorSymbols red→draw（BS20-015-e2 と同じ形） |
| BS21-023 | Lv2『自分のアタックステップ』想獣アタック時→ボイドからコア1個をそのスピリットに | fieldEvent＋placeCores target self（SD11-012-e2 と同じ形。anySpiritAttacked に替えるだけ） |
| BS21-024 | Lv1-3【暴風：2】『アタック時』ブロックされたら相手は相手の2体を疲労 | keyword `bofu` count 2＋triggered onBlocked exhaust countFromBofu（BS14-032-e1・e2） |
| BS21-025 | Lv1-2 爪鳥のコアは相手によってLv1コストより少なくならない | globalConstraint `coreFloorByCost` ownOnly byOpponentOnly＋filter family（BS16-039-e1＋filter 軸） |
| BS21-025 | Lv2 自分のマジックの効果で相手が疲労したとき回復 | **N1**。fieldEvent `opponentSpiritExhaustedByOwnSpiritEffect`（BS20-069-e2）にマジック限定の軸 |
| BS21-026 | Lv2 神速持ちの自分のスピリット/ブレイヴ召喚時→回復 | fieldEvent `ownSpiritSummoned` subjectFilter keyword soku（BS11-X03-e2）＋`anyBraveSummoned` subjectSide own（ブレイヴぶん。2エントリ） |
| BS21-027 | Lv1-3 BP比べで破壊したとき→怪虫2体を回復 | triggered onBattleWin attacker→refresh count 2 filter family（BS11-024-e2） |
| BS21-027 | 【合体時】Lv2-3 合体アタック時→相手2体を疲労 | triggered onAttack whileCombined→exhaust 2（BS17-X03-e2 と同じ形） |
| BS21-059 | Lv1 スピリット状態の間、緑シンボル1つ追加 | symbolAddGrant target self filter braveInSpiritState（BS12-006-e1 の filter 軸） |
| BS21-059 | 【合体時】BP比べで破壊したとき回復 | triggered onBattleWin whileCombined→refresh self（BS14-069-e1 の onBattleWin＋refresh） |
| BS21-060 | 【合体時】合体アタックでライフを減らしたとき→ボイドからコア1個 | triggered onLifeDealt whileCombined→placeCores（BS07-X26-e3＋BS14-069-e1） |
| BS21-069 | Lv1-2 バトルしている自分のスピリットをBP+2000 | aura bp battlingOnly（BS20-025-e2） |
| BS21-069 | Lv2 怪虫がBP比べで破壊したとき→相手のライフのコア1個をリザーブ | battleWon role attacker winnerFamilyFilter→lifeCrush（BS20-069-e1＋BS01-X03-e2）。**N2**（重複なし） |
| BS21-077 | フラッシュ：爪鳥1体をBP+5000（このターン）＋相手によって破壊されたら手札に | timedEffect bp＋reviveOnDestroy lent toHand（BS07-070-e3）。**N3**（指定した1体限定の軸） |
| BS21-078 | フラッシュ：相手は、相手のスピリット2体を疲労させる | magic flash→exhaust count 2 chooserIsTarget（BS06-100-e1） |
| BS21-078 | 連鎖（条件 赤/青 各1）：[赤]ネクサス1つ破壊／[青]トラッシュのネクサス1枚回収 | sequence＋if 入れ子（BS19 M1）。赤=destroy nexus only（BS20-012-e1）／青=moveCards trash→hand pick nexus（SD03-017-e1） |
| BS21-X03 | フラッシュ【神速】 | keyword `soku`（BS20-021-e1） |
| BS21-X03 | Lv2-3『このスピリットのアタック時』相手はバーストを発動できない | triggered onAttack→timedEffect battleLock burst duration battle（BS17-021-e1） |
| BS21-X03 | 連鎖（条件 赤/青 各1）：[赤]ドロー1枚／[青]ネクサス1つを疲労させることで回復（ターンに1回） | 赤=draw（BS20-015-e2）。[青]は**N4**（起動能力の付与） |

### 3.1 手本の引用（効果文と効果エントリ）
- BS20-021-e1（【神速】の宣言）：「フラッシュ【神速】手札にあるこのスピリットカードは、召喚コストの支払いと上に置くコアをリザーブから使用することで召喚できる。」
  `{"id": "BS20-021-e1", "kind": "keyword", "keyword": "soku", "levels": [1, 2]}`
- BS19-086-e2（系統アタック時の疲労。021 と同じ形）：「Lv2『自分のアタックステップ』系統：「爪鳥」を持つ自分のスピリットがアタックしたとき、相手のスピリット1体を疲労させる。」
  `{"id": "BS19-086-e2", "kind": "fieldEvent", "event": "anySpiritAttacked", "levels": [2], "phase": "attack", "turn": "own", "ownOnly": true, "subjectFilter": {"family": "爪鳥"}, "action": {"type": "exhaust", "count": 1}}`
- BS20-015-e1/e2（022 と同じ形。連鎖元＋[赤]ドロー）：「Lv2『このスピリットのアタック時』疲労状態の相手の合体スピリット1体を破壊する。【連鎖：条件《赤シンボル》】[赤]：自分はデッキから1枚ドローする。」
  e1 `{"id": "BS20-015-e1", "kind": "triggered", "keyword": "rensa", "trigger": "onAttack", "levels": [2], "optional": false, "action": {"type": "sequence", "actions": [{"type": "destroy", "count": 1, "filter": {"rested": true, "combined": true}}, {"type": "if", "cond": {"count": {"ownColorSymbols": "red"}, "atLeast": 1}, "then": {"type": "draw", "count": 1}}]}}`
- SD11-012-e2（023 と同じ形。イベント主体にコア補充）：「Lv2『相手のアタックステップ』系統：「機獣」を持つ自分のスピリットがブロックしたとき、ボイドからコア1個をそのスピリットに置く。」
  `{"id": "SD11-012-e2", "kind": "fieldEvent", "event": "ownSpiritDeclaredBlock", "levels": [2], "subjectFilter": {"family": "機獣"}, "action": {"type": "placeCores", "from": "void", "to": "spirit", "target": "self", "count": 1}}`
- BS14-032-e1/e2（024 と同じ【暴風：2】）：「Lv1･Lv2【暴風：2】『このスピリットのアタック時』このスピリットがブロックされたとき、相手は、相手のスピリット2体を疲労させる。」
  e2 `{"id": "BS14-032-e2", "kind": "triggered", "trigger": "onBlocked", "eventTarget": "ignore", "levels": [1, 2], "optional": false, "action": {"type": "exhaust", "count": 2, "chooserIsTarget": true, "excludeTarget": true, "countFromBofu": true}}`
- BS16-039-e1（025 Lv1 と同じ形）：「Lv1･Lv2 自分のスピリットすべてのコアの数は、相手によってLv1コストより少なくならない。」
  `{"id": "BS16-039-e1", "kind": "globalConstraint", "levels": [1, 2], "constraint": {"type": "coreFloorByCost", "ownOnly": true, "byOpponentOnly": true}}`
- BS20-069-e2（025 Lv2 の元）：「Lv2『自分のターン』自分のスピリットの効果で相手のスピリットを疲労させたとき、ボイドからコア1個を自分のスピリット…」
  `{"id": "BS20-069-e2", "kind": "fieldEvent", "event": "opponentSpiritExhaustedByOwnSpiritEffect", "levels": [2], "turn": "own", "selfMode": "source", "action": {"type": "placeCores", "from": "void", "to": "spirit", "count": 1}}`
- BS11-X03-e2（026 と同じ形）：「【合体時】Lv2･Lv3【神速】を持つ自分のスピリットが召喚されたとき、このスピリットは回復する。」
  `{"id": "BS11-X03-e2", "kind": "fieldEvent", "event": "ownSpiritSummoned", "levels": [2, 3], "whileCombined": true, "subjectFilter": {"keyword": "soku"}, "selfMode": "source", "action": {"type": "refresh", "target": "self"}}`
- BS11-024-e2（027 と同じ形。条件付き回復2体）：「Lv2『このスピリットのアタック時』【神速】を持つ自分のスピリット2体を回復させる。」
  `{"id": "BS11-024-e2", "kind": "triggered", "trigger": "onAttack", "levels": [2], "action": {"type": "refresh", "filter": {"keyword": "soku"}, "count": 2}, "optional": false}`
- BS17-X03-e2（027 合体時と同じ形）：「Lv2『このスピリットのアタック時』…相手のスピリット2体を疲労させる。」（原文は【暴風】の下の onBlocked）
  `{"id": "BS17-X03-e2", "kind": "triggered", "trigger": "onBlocked", "eventTarget": "ignore", "levels": [2], "action": {"type": "exhaust", "count": 2}, "optional": false}`
- BS12-006-e1（059 Lv1 と同じ形。スピリット状態のブレイヴの絞り込み）：「シンボルを持たない自分のスピリット状態のブレイヴすべてと…に、赤のシンボル1つを追加する。」
  `{"id": "BS12-006-e1", "kind": "symbolAddGrant", "levels": [1, 2, 3], "target": "ownAll", "filter": {"braveInSpiritState": true, "symbolCount": 0}, "color": "red", "count": 1, "phaseTurn": {"phase": "attack", "turn": "own"}}`
- BS14-069-e1（059 合体時・060 と同じ形）：「【合体時】『このスピリットの合体アタック時』BPを比べ相手のスピリットだけを破壊したとき、ボイドからコア1個をこのスピリットに置く。」
  `{"id": "BS14-069-e1", "kind": "triggered", "trigger": "onBattleWin", "levels": null, "whileCombined": true, "battleRole": "attacker", "optional": false, "action": {"type": "placeCores", "from": "void", "to": "spirit", "target": "self", "count": 1}}`
- BS07-X26-e3（060 のトリガー）：「Lv2『このスピリットのアタック時』このスピリットのアタックによって相手のライフを減らしたとき…」
  `{"id": "BS07-X26-e3", "kind": "triggered", "trigger": "onLifeDealt", "levels": [2], "action": {...}, "optional": true}`
- BS20-025-e2（069 Lv1 と同じ形。バトル中のBP+）：「【合体時】Lv2･Lv3『お互いのアタックステップ』バトルしている自分のスピリットのコア1個につき、そのスピリットをBP+1000する。」
  `{"id": "BS20-025-e2", "kind": "aura", "levels": [2, 3], "whileCombined": true, "aura": {"type": "bp", "target": "ownAll", "battlingOnly": true, "amountPer": 1000, "counter": "targetCores", "phaseTurn": {"phase": "attack", "turn": "both"}}}`
- BS20-069-e1（069 Lv2 のトリガー）：「Lv1･Lv2『相手のアタックステップ』自分の緑のスピリットは、BPを比べ相手のスピリットだけを破壊したとき回復する。」
  `{"id": "BS20-069-e1", "kind": "battleWon", "role": "blocker", "levels": [1, 2], "turn": "opponent", "winnerColorFilter": "green", "action": {"type": "refresh", "target": "self"}}`
- BS01-X03-e2（069 Lv2 のアクション）：「Lv2･Lv3『このスピリットのアタック時』BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く。」
  `{"id": "BS01-X03-e2", "kind": "triggered", "trigger": "onBattleWin", "battleRole": "attacker", "levels": [2, 3], "action": {"type": "lifeCrush", "count": 1}, "optional": false}`
- BS07-070-e3（077 と同じ形。相手効果で破壊されたら手札）：「メイン：このターンの間、相手のスピリット/ネクサス/マジックの効果で破壊されて『このスピリットの破壊時』効果を発揮した自分のスピリットすべては手札に戻る。」
  `{"id": "BS07-070-e3", "kind": "reviveOnDestroy", "levels": null, "lentOnly": true, "scope": "ownAll", "when": {"byOpponentEffect": true}, "revived": {"toHand": true}}`
- BS06-100-e1（078 と同じ文）：「フラッシュ：相手は、相手のスピリット2体を疲労させる。」
  `{"id": "BS06-100-e1", "kind": "magic", "timing": "flash", "action": {"type": "exhaust", "count": 2, "chooserIsTarget": true}}`
- BS20-012-e1（078 連鎖[赤]と同じ形）：「【連鎖：条件《赤シンボル》】[赤]：相手のネクサス1つを破壊する。」
  `{"id": "BS20-012-e1", "kind": "triggered", "keyword": "rensa", "trigger": "onSummon", "levels": [1, 2], "optional": false, "action": {"type": "sequence", "actions": [{"type": "draw", "count": 1}, {"type": "if", "cond": {"count": {"ownColorSymbols": "red"}, "atLeast": 1}, "then": {"type": "destroy", "nexus": "only", "count": 1}}]}}`
- SD03-017-e1（078 連鎖[青]と同じ形。トラッシュのネクサス回収）：「または、自分のトラッシュにあるネクサスカード1枚を手札に戻す。」
  `{"id": "SD03-017-e1", "kind": "magic", "timing": "flash", "action": {"type": "chooseActionMode", "modes": [..., {"label": "自分のトラッシュにあるネクサスカード1枚を手札に戻す", "actions": [{"type": "moveCards", "from": "trash", "count": 1, "dest": "hand", "pick": {"cardType": "nexus"}}]}]}}`
- BS17-021-e1（X03 Lv2-3 と同じ文）：「Lv2･Lv3『このスピリットのアタック時』相手はバーストを発動できない。」
  `{"id": "BS17-021-e1", "kind": "triggered", "trigger": "onAttack", "levels": [2], "action": {"type": "timedEffect", "content": [{"type": "battleLock", "lock": "burst"}], "duration": "battle"}, "optional": false}`
- BS14-066-e2（X03 連鎖[青]の中身の部品。ネクサス疲労で回復）：「Lv2【強襲：2】『このスピリットのアタック時』このスピリットは、ターンに2回まで、自分のネクサス1つを疲労させることで回復できる。」
  `{"id": "BS14-066-e2", "kind": "triggered", "trigger": "onAttack", "levels": [1, 2, 3], "action": {"type": "pay", "cost": {"type": "exhaust", "side": "own", "nexusOnly": true, "count": 1}, "then": {"type": "refresh", "target": "self"}, "limitByKeyword": "kyoshu"}}`

## 4. 効果文から決められない点
- **X03 連鎖[青]「このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる」**：タイミングの明記が無い。【強襲】（BS14-066）は『このスピリットのアタック時』と書いてあるが X03 には無いので、（a）フラッシュタイミングならいつでも使える起動能力、（b）【強襲】と同じくアタック時限定、の2通り。また付与の期間も、期間の書かれていない継続の連鎖（BS19 §2.1 Q777）なら「青シンボルがある間」だが、（c）このターンの間だけ、という読みもできる。「ターンに1回」の数え方は個体ごと（X03 が2体なら各1回）と読む
- **025 Lv2「自分のマジックの効果で相手のスピリットが疲労したとき」**：効果の発生源がマジックなら常に該当と読む。スピリットの効果で付与された能力（effectGrant 等）で疲労させた場合も「マジックの効果」に含めるかは2通り。また「疲労したとき」は BS20-069 と同じく効果1回の解決につき1回（2体疲労でも1回）と読む
- **026「【神速】を持つ自分のスピリット/ブレイヴが召喚されたとき」**：ブレイヴの「召喚」に、手札から合体スピリットへ直接合体した場合（ダイレクトブレイヴ）を含めるか。実装上 anyBraveSummoned は含む（summon.ts:175 のコメント）ので含める想定だが、文言上は2通り
- **069 Lv2「この効果は重複しない」**：同名のこのネクサスを2枚置いたとき1回、と読む。「重複しない」の範囲を（a）同名カードのみ、（b）同じ効果文を持つ別名カードまで、の2通り。処理の順（lifeCrush の解決は破壊の後）は自明
- **077「そのスピリットが相手によって破壊されたとき、そのスピリットを手札に戻す」**：「相手によって」＝効果とBP比べの両方（BS20_PLAN §1 の 076 と同じ読み）と読む。手札に戻すのは破壊の待機を挟まず破壊の代わりに手札へ（reviveOnDestroy toHand と同じ）と読むが、（b）破壊を解決した後に手札へ戻す、の読みも一応可能（破壊時効果が発揮するかが変わる）
- **027 Lv1-3「BPを比べ相手のスピリットだけを破壊したとき」**：回復の解決は破壊の解決後（破壊時効果の列の後）と読む。破壊時効果と同じ列で順を選ぶかは2通りだが、onBattleWin の既存の挙動に従う
