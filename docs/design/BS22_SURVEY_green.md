# BS22 調査メモ：green（調査役）
対象：BS22-019・020・021・022・023・024・025・026・027・059・060・069・077・078・X03・X07・X13-03（緑 colors[0] の17枚。多色の 070・071 は含まない）。実装はしていない。
手順書の根拠：BS19_PLAN §2.1・§2.15（連鎖・強化）、BS20_PLAN §1（「または」＝chooseActionMode、「相手は、相手の〜」＝相手が選ぶ）、BS21_PLAN §3（済みの部品）、CHOOSER_RULES。
分身（024・X03・069・077）は別調査。ソードブレイヴは通常のブレイヴと同じ扱い（該当なし）。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の合計：32（022 カブトゼミは効果なし＝0節）
- 既存で書ける：13
- 新しい部品が要る：5（020 の1節、026 の連鎖元、027 召喚時、078 の連鎖元、X07 合体時アタック時）。うち 069 Lv2 は分身との混在で下の「分身」に数え、部品 N3 は別に要る
- 連鎖：3（026・060・078 の「[黄]：」の節）
- 強化：6（021・024・025・X03・X07×2）
- 分身（別調査・分身を参照する節を含む）：5（024 分身・X03 分身・069 Lv1-2・069 Lv2・077）
- 新しい部品：4件（N1〜N4）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | exhaust の `budget.by:"cost"`（アクションの軸。コスト合計まで好きなだけ疲労） | `exhaust.budget` の型は `{ by: "bp"; amount }` だけ（effectAction.ts の exhaust 行）。同じ「合計まで好きなだけ」の destroy／return は `budget.by:"cost"` を持つ（BSC05-009-e2・SD03-016-e1 の形）ので、足りないのは exhaust の by だけ。sequence／filter／count:"any" では合計の上限を表せない | 026 連鎖元・078 |
| N2 | exhaust が疲労させた個体を `lastMoved` に記録する（アクションの挙動。カウンタ・IfCond は既存の `lastMoved`／`{count, atLeast}` をそのまま使う） | `lastMoved` は `recordMoved`（record.ts）を呼ぶアクションだけが書く。exhaustRefresh.ts・exhaustBudget.ts に `recordMoved` が無く、疲労は書かない（BS17-025-e1 は `return` の後の `exhaust` の countCounter に lastMoved を使うが、疲労側の記録は無い）。「この効果で疲労した1体につき」（placeCores の countCounter:"lastMoved"）と「3体以上疲労したとき」（if count lastMoved atLeast 3）はこれで書ける。新しい type は不要 | 027 召喚時・X07 合体時アタック時 |
| N3 | `ImmuneSource` に `"nexus"` を足す（条件の軸。「相手のスピリット/ネクサスの効果を受けない」） | `immuneToOpponentEffects.against` は `"spirit"\|"brave"\|"magic"`（type.ts:46）で、ネクサスの効果は常に通る（constraintDef.ts:24「ネクサスの効果・自分の効果は通る」）。against 無指定はスピリット/マジックで、ネクサスを止められない。手本は BS21-X04-e1・BS17-036-e2（constraintGrant＋immuneToOpponentEffects against:"spirit"）。この配り方はそのまま使い、against の値を増やすだけ。分身の条件（「自分の分身スピリットがいる間」）は別調査 | 069 Lv2 |
| N4 | `coresImmovableByOpponent` を「行き先がリザーブの除去だけ」に絞る軸（条件の軸）と、それを絞り込みつきで配ること（constraintGrant の filter は既存） | 手本の `coresImmovableByOpponent`（constraintDef.ts:10）は相手の効果の coreRemove をすべて防ぎ、行き先を見ない。`coreRemovalAllowed`（coreGate.ts）の `CoreRemovalAttempt` に行き先が無い。020 の「リザーブに置かれない」は行き先がトラッシュ／ボイドの除去を止めない読みが自然なので、全部止める既存の器だと過剰に止まる。読みの確認は §4-1 | 020 |

## 3. カードごとの表
手本の効果文の引用は節の下にまとめて書く。

| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS22-019 | Lv1-2『破壊時』相手のスピリット2体を、相手が疲労させる | 既存：triggered onDestroy（SD10-004-e1）の action に exhaust count 2・chooserIsTarget（SD14-006-e1）。CHOOSER_RULES「相手は〜」＝相手が選ぶ |
| BS22-020 | Lv1-3 コスト5以下の自分のスピリットすべては、相手によってコアをリザーブに置かれない | **新（N4）**：constraintGrant target ownAll・filter {cost:{max:5}}（BS21-X04-e1 の形）の constraint に N4 |
| BS22-020 | Lv1-3『破壊時』ボイドからコア1個を自分のリザーブに置く | 既存：triggered onDestroy＋placeCores void→reserve（SD01-018-e2 の action と X001-e1 の trigger）。`{"type":"placeCores","from":"void","to":"reserve","count":1}` |
| BS22-021 | Lv1-2 相手は、このスピリットのコアを取り除くことができない | 既存：constraint `coresImmovableByOpponent`（constraintDef.ts:10。データの手本は無い＝型だけ。BS10-X01-e1 は「お互い」の coresCantBeRemoved で別物）。要確認は §4 に置かない（相手の効果の除去をすべて防ぐ読みで決まる） |
| BS22-021 | Lv2【強化】 | 強化（緑）。keyword kyoka:"exhaust"（BS20-020-e1） |
| BS22-022 | （効果なし） | なし |
| BS22-023 | フラッシュ【神速】 | 既存：keyword soku levels null（SD14-003-e1・EX032-e1） |
| BS22-023 | Lv1-3『召喚時』ボイドからコア1個を自分の赤/白のスピリットに置く | 既存：triggered onSummon＋placeCores void→spirit・filter color（BS09-020-e1）。color は配列で OR（targetFilter.ts の color?: Color\|Color[]）→ `"filter":{"color":["red","white"]}` |
| BS22-024 | Lv1-2【強化】 | 強化（緑）。keyword kyoka:"exhaust"（BS20-020-e1） |
| BS22-024 | Lv1-2【分身：1】『相手によるこのスピリットの破壊時』 | 分身（別調査） |
| BS22-025 | Lv1-3【強化】 | 強化（緑）。keyword kyoka:"exhaust"（BS19-029-e1 の形で levels [1,2,3]） |
| BS22-025 | 【合体時】Lv2-3『自分のアタックステップ』爪鳥を持つ自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く | 既存：battleWon role "attacker"・turn "own"・winnerFamilyFilter "爪鳥"・whileCombined true・levels [2,3]・action lifeCrush（BS21-069-e2：「系統：「怪虫」を持つ自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く」と同じ文。`{"kind":"battleWon","role":"attacker","levels":[2],"turn":"own","winnerFamilyFilter":"怪虫","noStackByName":true,"action":{"type":"lifeCrush","count":1}}`。BS21-069 の「この効果は重複しない」は 025 に無いので noStackByName は付けない） |
| BS22-026 | Lv1-2『アタック時』アタックで相手のライフを減らしたとき、コスト合計8まで相手のスピリットを好きなだけ疲労させる | **新（N1）**：triggered onLifeDealt（BS19-055-e2）の action exhaust count "any"・budget {by:"cost",amount:8}（destroy の形は BS16-083-e1、return は BSC05-009-e2） |
| BS22-026 | 連鎖（条件 黄×1）：[黄]：ライフを減らしたとき、ボイドからコア1個を自分のライフに置く | 連鎖。上の節と同じ triggered に sequence［連鎖元, if {count:{ownColorSymbols:"yellow"},atLeast:1} then placeCores void→life］（BS19-X03-e1 の sequence＋if の形。placeCores void→life は BS19-055-e2） |
| BS22-027 | Lv1-2『召喚時』コスト12以下の相手のスピリット2体を疲労させる。この効果で疲労したスピリット1体につき、ボイドからコア1個をこのスピリットに置く | **新（N2）**：triggered onSummon の sequence［exhaust count 2・filter cost max 12, placeCores void→self・countCounter:"lastMoved"］（手本：SD13-X01-e1「この効果で破壊した相手のスピリット1体につき、自分はデッキから1枚ドローする」＝sequence［destroy, draw count 1 countCounter "lastMoved"］。X003A-e2 は破壊用の別の器） |
| BS22-027 | Lv2『バトル時』相手の合体スピリット1体を疲労させる | 既存：triggered onBattleStart（SD01-018-e2）＋exhaust count 1・filter {combined:true}（targetFilter.ts。BS10-029-e2 は exhaust countCounter） |
| BS22-059 | Lv1『このブレイヴの召喚時』コスト4以下の相手のスピリット2体を疲労させる。または、相手の合体スピリット1体を疲労させる／合体条件：コスト4以上 | 既存：triggered onSummon levels [1]（BS20-056-e1）＋chooseActionMode modes［exhaust count 2・filter cost max 4, exhaust count 1・filter combined true］（SD03-016-e1。「または」は BS20_PLAN §1）。braveCondition {"minCost":4}（BS20-056 の braveCondition 欄） |
| BS22-060 | 合体条件：コスト4以上 | braveCondition {"minCost":4} |
| BS22-060 | 【合体時】『合体アタック時』アタックで相手のライフを減らしたとき、ボイドからコア1個を自分のリザーブに置く | 既存：triggered onLifeDealt・levels null・whileCombined true（P069-e2）＋placeCores void→reserve（SD01-018-e2） |
| BS22-060 | 連鎖（条件 黄×1）：[黄]：ライフを減らしたとき、ボイドからコア1個を自分のライフに置く | 連鎖。上の節と同じ triggered に sequence［placeCores void→reserve, if {count:{ownColorSymbols:"yellow"},atLeast:1} then placeCores void→life］（BS19-X03-e1・BS19-055-e2） |
| BS22-069 | Lv1-2『お互いのアタックステップ』爪鳥を持つ自分のスピリットすべてと、自分の分身スピリットすべてをBP+2000 | 分身（別調査。爪鳥の部分は aura bp target ownAll・familyFilter "爪鳥"・phaseTurn attack/both＝BS20-002-e2 の形で書けるが、分身スピリットの絞り込みは別調査） |
| BS22-069 | Lv2『お互いのアタックステップ』自分の分身スピリットがいる間、爪鳥を持つ自分のスピリットすべては相手のスピリット/ネクサスの効果を受けない | 分身（別調査＝「分身スピリットがいる間」の condition）＋ **新（N3）**：constraintGrant ownAll・filter {family:"爪鳥"}・constraint immuneToOpponentEffects against ["spirit","nexus"]（BS21-X04-e1）。期間は phaseTurn attack/both |
| BS22-077 | フラッシュ：相手のスピリット1体を疲労させる。この効果発揮後、自分の[光牙鳳凰レックウマル]がいるとき、自分の[光牙鳳凰レックウマル]1体の【分身：2】を発揮させる | 前半は既存：magic flash＋exhaust count 1（P083-e2）。後半は分身（別調査）。「この効果発揮後」は CONJUNCTION の「この効果発揮後」＝前の解決の後に続けて（sequence の後ろ）。後半の条件「[光牙鳳凰レックウマル]がいる」は if |
| BS22-078 | フラッシュ：コスト合計8まで相手のスピリットを好きなだけ疲労させる | **新（N1）**：magic flash＋exhaust count "any"・budget {by:"cost",amount:8} |
| BS22-078 | 連鎖（条件 黄×1）：[黄]：相手の合体スピリット1体を指定する。このターンの間、指定された合体スピリットはアタック/ブロックできない | 連鎖。上と同じ magic の action を sequence［連鎖元, if {count:{ownColorSymbols:"yellow"},atLeast:1} then timedEffect content［cantAttack,cantBlock］duration "turn"・filter {combined:true}］（SD06-012-e1 の timedEffect。BS18-081-e2 は count 1 の形。BS20_PLAN §3.1 の 078「指定」と同じ扱い） |
| BS22-X03 | Lv1-3【分身：2】『召喚時』 | 分身（別調査） |
| BS22-X03 | Lv2-3【強化】アルティメット以外の自分の「相手への疲労効果」の体数を+1体する | 強化（緑）。keyword kyoka:"exhaust"・levels [2,3]（BS19-057-e1 も「アルティメット以外の」付きで同じ keyword 1件だけ） |
| BS22-X03 | Lv3『アタック時』相手のスピリット1体を疲労させる | 既存：triggered onAttack＋exhaust count 1（BS19-X03-e1 の exhaust） |
| BS22-X07 | Lv1【強化】アルティメット以外の自分の「相手への疲労効果」の体数を+1体する／合体条件：コスト6以上 | 強化（緑）。keyword kyoka:"exhaust"・levels [1]（BS19-X08-e1）。braveCondition {"minCost":6} |
| BS22-X07 | 【合体時】【強化】 | 強化（緑）。keyword kyoka:"exhaust"・levels null・whileCombined true（BS19-X08-e2） |
| BS22-X07 | 【合体時】『アタック時』相手のスピリット1体を疲労させる。この効果で相手のスピリットが3体以上疲労したとき、このスピリットは回復する | **新（N2）**：triggered onAttack・levels null・whileCombined true の sequence［exhaust count 1, if {count:"lastMoved",atLeast:3} then refresh target self］（refresh target self は BS08-X31-e3。if の count 形は BS19-X03-e1）。【強化】で体数が増えても「この効果で疲労した体数」で数える（§4-2） |
| BS22-X13-03 | フラッシュ【神速】 | 既存：keyword soku（SD14-003-e1） |
| BS22-X13-03 | Lv2-3『アタック時』相手のスピリット1体を疲労させる | 既存：triggered onAttack＋exhaust（BS19-X03-e1） |
| BS22-X13-03 | Lv3『アタック時』ターンに1回、自分のリザーブにあるコア1個をボイドに置くことで、このスピリットは回復する | 既存：triggered onAttack・oncePerTurn true の pay［cost removeCores side own from ["reserve"] to "void" count 1, then refresh target self］（BS20-059-e1 は「ターンに1回、自分のリザーブのコア3個を自分のトラッシュに置くことで、このスピリットは回復する」と同じ形：`{"oncePerTurn":true,"action":{"type":"pay","cost":{"type":"removeCores","side":"own","from":["reserve"],"to":"trash","count":3},"then":{"type":"refresh","target":"self"}}}`。行き先 "void" は BS06-X23-e3） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
1. **BS22-020 Lv1-3「コスト5以下の自分のスピリットすべては、相手によってコアをリザーブに置かれない」**：読みA＝行き先がリザーブになる除去（コアを取り除いてリザーブへ）だけを止める／読みB＝相手の効果によるコア除去をすべて止める（トラッシュ・ボイドへの除去も）。結果が変わる場面は、相手の「コアをトラッシュに置く」除去（紫など）が020の味方に効くか。Aなら効く、Bなら効かない。部品 N4 の作りが変わる。引いた語：「リザーブに置かれない」「相手によってコア」→ 当たり無し（`grep -rn` で効果文に無し、constraintDef.ts:10 の `coresImmovableByOpponent` は26系の1枚の裁定で行き先を問わない）。「相手によって」は BS20_PLAN §1 の通り効果と BP 比べの両方だが、コア除去は効果だけなので差は出ない。
2. **BS22-027「この効果で疲労したスピリット1体につき」・X07「この効果で相手のスピリットが3体以上疲労したとき」と【強化】**：疲労の体数が【強化】で増えたとき、増えたぶんも「この効果で疲労した」に数えるか。読みA＝実際に疲労した体数（強化ぶんも数える。Q770 の「相手への疲労効果」の体数に含まれる）／読みB＝効果文の体数（2体）まで。結果が変わる場面：027 は強化を持つ自分のスピリットがいる間のコア数、X07 は【強化】を持つので強化ぶんで3体に届く。X07 は自身が【強化】を持つので必ず問題になる。引いた語：「この効果で疲労した」「体につき」→ 手順書に当たり無し（BS20_PLAN §2 の4は「効果1回の解決ごとに1回」の話で別）。BS19_PLAN §2.1 の「数値は効果を解決するときの最終の値に足す」に従うとAだが、「この効果で疲労した」の数え方は記載が無い。
