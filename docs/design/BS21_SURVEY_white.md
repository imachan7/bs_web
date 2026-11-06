# BS21 調査メモ：white（調査役）
対象：BS21-028・029・030・031・032・033・034・035・036（スピリット9）・061・062（ブレイヴ2）・070（ネクサス1）・079・080（マジック2）・X04・X07（計16枚）。実装はしていない。CP13-01 は対象外。BS21-072 珊瑚の樹海は colors[0] が white でないため本メモの対象外。ソードブレイヴ（X07）は通常のブレイヴと同じ扱い（2026-11-05 ユーザー確認）。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：29（連鎖は「連鎖元」と「連鎖（条件 …）」で別行。強化・重装甲などキーワード単独行は1節）
- 既存の器で書ける：23
- 新しい部品が要る：6（§2 の W1〜W6）
- 連鎖：2枚（036・080。連鎖節2。いずれも条件《緑/青シンボル》＝各色1個）
- 強化：6節（028・031・033-Lv1・X04-Lv2・X07-Lv1・X07-合体中。すべて白＝「スピリット回復効果」の体数+1）
- 備考：X04-Lv2 と X07 の強化には「アルティメット以外の」とあるが、アルティメットは未実装（constraintDef.ts:16 の注記と同じ）なので BS19-038-e1 と同じ器・同じ意味で書ける。差を付ける軸は不要。

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| W1 | constraintGrant（または aura）の target に `"opponentAll"`＋`uncombinedFilter`（条件の軸） | 「合体していない**相手の**スピリットすべては必ずアタックする」は継続の付与。aura の target は `self \| ownAll`（auraDef.ts:8）、constraintGrant は `ownAll`（effectDefContinuous.ts:578）までで、相手側へ制約を配る器が無い。timedContent の `mustAttack` は期間 turn で対象1体の指定（BS15-079-e1）で「すべて」にできない。constraintDef に `mustAttack`（constraintDef.ts:20）はあるので、target の軸を足すだけでよい | 034-Lv3 |
| W2 | 連鎖など効果の解決で「起動（pay）能力」を一時的に与える軸（アクション。effectGrant.granted を TriggerEvent 以外に広げる、または timedEffect の content に pay 能力） | 036 の連鎖[青]「このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる」は任意タイミングの起動能力。effectGrant.granted は `trigger: TriggerEvent` の誘発のみ（effectDefContinuous.ts:487-491）、timedEffect の content は制約・playerRule で pay 能力を与えられない。手本 BS14-066-e2（`pay` cost exhaust nexusOnly → refresh self）はカード自身の恒常効果で、後から与える形が無い | 036-連鎖[青] |
| W3 | TargetFilter／IfCond に「シンボルの色」軸（`symbolColor`。条件の軸） | 062「このスピリットが紫のシンボルを持つとき」。TargetFilter は `color`（カードの色）・`symbolCount`（数）・`exSymbol`（EX専用）だけ（targetFilter.ts:25,33）で、シンボルの色を見る軸が無い。IfCond（effectAction.ts:44）にも無い。中身の removeCores（side opponent／from spirit+nexus／to reserve）は既存 | 062-合体時 |
| W4 | battleWon（fieldEvent も）に `uniqueByName: true`（同名の発生源は重複して発火しない。カウンタ） | 070-Lv2「この効果は重複しない」＝同名ネクサスを2枚置いても1回だけ発火。aura には `uniqueByName`（effectDefContinuous.ts:14）があるが battleWon（effectDefTrigger.ts:175-）には同名・同カードで重複を防ぐ軸が無い。BS02-087 の「重複しない」は drawBoost 専用 kind の内部処理で流用できない | 070-Lv2 |
| W5 | PlayerRuleDef（timedEffect playerRule）に「バースト条件が指定イベントのバーストを発動できない」軸（条件の軸。globalConstraint `noBurstActivationByEvent` のターン限定版） | 080 の連鎖[青]「このターンの間、相手は、バースト条件が【自分のライフ減少後】のバーストを発動できない」。`noBurstActivationByEvent` は globalConstraint（継続）専用（globalConstraint.ts:110。手本 BS18-022-e1）で、「このターンの間」を書く timedEffect playerRule（PlayerRuleDef＝type.ts:300）に置けない。PlayerRuleDef の `noBurstEffectForPid` は発動が成立し解決だけが飛ぶ別物 | 080-連鎖[青] |
| W6 | magicNegate の cost に `{ selfCoresToTrash: number }`（アクションの軸） | X04-Lv3「このスピリットのコア2個を自分のトラッシュに置くことで、その効果を無効にする」。magicNegate の cost は `selfCoresToVoid \| exhaustSelf \| none` のみ（effectDefContinuous.ts:55）。手本 BS02-083-e2 は `cost: { selfCoresToVoid: 2 }` で、行き先がトラッシュの軸が無い。activated の cost には `selfCoresToTrash` がある（effectDef.ts:104）ので同じ軸を magicNegate に足す | X04-Lv3 |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS21-028 | Lv3 強化（白） | keyword kyoka refresh（BS19-038-e1。「Lv1･Lv2【強化】／自分の「スピリット回復効果」の体数を+1体する。」と同じ文言） |
| BS21-029 | Lv1-2【重装甲：赤/緑】 | keyword heavyArmor colors [red,green]（BS17-035-e1。「Lv2【重装甲：赤/紫】」と同じ形） |
| BS21-029 | Lv2：【連鎖】を持つ自分の紫のスピリットすべてに【重装甲：赤/緑】を与える | keywordGrant heavyArmor＋colorFilter purple＋filter（keyword rensa。絞り込み：連鎖を持つ）。手本 BS17-067-e2 `{"kind":"keywordGrant","keyword":"heavyArmor","colors":["red","blue"],"target":"ownAll","combinedFilter":true,"phase":"attack","turn":"opponent"}`（「自分の合体スピリットすべてに“【重装甲：赤/青】…”を与える」と同じ形）＋keywordGrant の filter（keywordFilter の統一軸。effectDefContinuous.ts:254） |
| BS21-030 | Lv1-3『相手のアタックステップ』疲労状態でブロックできる | constraint canBlockWhileRested（BS20-034-e1。「このスピリットは疲労状態でブロックできる。」と同じ文言）＋phaseTurn attack/opponent |
| BS21-030 | Lv2-3【重装甲：赤/紫】 | keyword heavyArmor colors [red,purple]（BS17-035-e1 と同じ形） |
| BS21-031 | Lv2 強化（白） | keyword kyoka refresh（BS19-038-e1） |
| BS21-032 | Lv1-3『相手のアタックステップ』相手のスピリットがアタックしたとき、系統：「星魂」の自分のスピリット1体を回復させる | fieldEvent anySpiritAttacked（subjectSide opponent／turn opponent／phase attack）＋refresh filter family 星魂 count 1。手本 BS12-X04-e2 `{"kind":"fieldEvent","event":"anySpiritAttacked","phase":"attack","turn":"opponent","selfMode":"source","action":{"type":"refresh","target":"self"}}`（「相手のスピリットがアタックしたとき、このスピリットは回復する。」と同じ誘発）＋refresh の filter/count（BS13-X03-e2 `{"kind":"battleWon","role":"any","action":{"type":"refresh","filter":{"family":["光導","星魂"]}}}` と同じ refresh の書き方） |
| BS21-033 | Lv1-3 強化（白） | keyword kyoka refresh（BS19-038-e1） |
| BS21-033 | Lv2-3『ブロック時』BPを比べ相手のスピリットだけを破壊したとき、相手のスピリット1体を手札に戻す | triggered onBattleWin battleRole blocker（BS02-041-e1 `{"kind":"triggered","trigger":"onBattleWin","battleRole":"blocker","action":{"type":"refresh","target":"self"}}`。「BPを比べ相手のスピリットだけを破壊したとき」＝onBattleWin は TriggerEvent の定義どおり）＋return to hand count 1（BS14-083-e2 の `{"type":"return","to":"hand","nexus":"only","count":1}` と同じ return。対象はスピリット） |
| BS21-034 | Lv1-3『相手のアタックステップ』自分の白のスピリットがブロックしたとき、そのスピリットをBP+3000する | fieldEvent ownSpiritDeclaredBlock（self=ブロックしたスピリット。fieldEvent.ts の定義どおり）＋subjectFilter color white＋timedEffect bp 3000 duration battle target self（BS12-036-e1 `{"trigger":"onBlock","action":{"type":"timedEffect","content":[{"type":"bp","amount":3000,"amountCounter":"battlingOpponentCombinedSymbols"}],"duration":"battle","target":"self"}}` と同じ timedEffect bp battle の形） |
| BS21-034 | Lv3『相手のアタックステップ』合体していない相手のスピリットすべては、可能ならば必ずアタックする | **W1**：constraintGrant target opponentAll＋uncombinedFilter＋constraint mustAttack＋phaseTurn attack/opponent |
| BS21-035 | Lv1-2『ブロック時』このスピリットをBP+5000する | triggered onBlock＋timedEffect bp 5000 duration battle target self（BS12-036-e1 と同じ形） |
| BS21-036 | Lv2-3『アタック時』相手のネクサス1つを手札に戻す（連鎖元） | triggered onAttack＋return to hand nexus only count 1（BS14-083-e2 の return と同じ形） |
| BS21-036 | 連鎖（条件 緑/青×1） | [緑]：if（count ownColorSymbols green, atLeast 1）→ exhaust count 1。BS20-034-e2 `{"type":"if","cond":{"count":{"ownColorSymbols":"yellow"},"atLeast":1},"then":{"type":"draw","count":1}}` と同じ if の形（BS19 M1）。[青]：**W2**（起動 pay 能力の付与。中身は BS14-066-e2 `{"type":"pay","cost":{"type":"exhaust","side":"own","nexusOnly":true,"count":1},"then":{"type":"refresh","target":"self"}}` と同じ pay） |
| BS21-036 | 【合体時】Lv3『相手のアタックステップ』自分の合体スピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く | battleWon role blocker／turn opponent／whileCombined／winnerCombinedOnly＋lifeCrush count 1。手本 BS14-065-e2 `{"kind":"battleWon","role":"attacker","turn":"own","winnerKeywordFilter":"funsai","action":{...}}`（「【粉砕】を持つ自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき」＝battleWon の winner 側フィルタと同じ形）＋lifeCrush（BS02-036-e1 `{"trigger":"onBattleWin","battleRole":"attacker","action":{"type":"lifeCrush","count":1}}`。「相手のライフにあるコア1個を相手のリザーブに置く」と同じ文言。lifeCrush の定義＝effectAction.ts:90「相手のライフのコアcount個を相手のリザーブへ」） |
| BS21-061 | 【合体時】『ブロック時』このスピリットをBP+3000する | triggered onBlock whileCombined＋timedEffect bp 3000 duration battle target self（BS12-036-e1＋whileCombined） |
| BS21-062 | 【合体時】『ブロック時』ボイドからコア1個をこのスピリットに置く。このスピリットが紫のシンボルを持つとき、相手のフィールドのコア1個を相手のリザーブに置く | 前段：triggered onBlock whileCombined＋placeCores from void to spirit target self count 1（BS02-029-e1 `{"trigger":"onAttack","action":{"type":"placeCores","from":"void","to":"spirit","target":"self","count":1}}`。「ボイドからコア1個をこのスピリットに置く」と同じ文言）。後段：**W3**（if＋シンボルの色軸）→ removeCores side opponent from [spirit,nexus] to reserve count 1（removeCores の定義どおり。effectAction.ts:85） |
| BS21-070 | Lv1-2『相手のアタックステップ』自分の白のスピリットすべてをBP+3000する | aura bp target ownAll colorFilter white amount 3000 phaseTurn attack/opponent（BS02-043-e1 `{"kind":"aura","aura":{"type":"bp","target":"ownAll","colorFilter":"white","amount":1000,"phaseTurn":{"phase":"attack","turn":"opponent"}}}`。「『相手のアタックステップ』自分の白のスピリットすべてをBP+1000する。」と同じ形） |
| BS21-070 | Lv2『相手のアタックステップ』系統：「武装」を持つ自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個を相手のリザーブに置く。この効果は重複しない | battleWon role any／turn opponent／winnerFamilyFilter 武装＋lifeCrush count 1（BS14-065-e2＋BS02-036-e1 と同じ形）＋**W4**（uniqueByName） |
| BS21-079 | フラッシュ：自分のスピリット1体を指定する。このターンの間、指定されたスピリットは、疲労状態でブロックできる | magic flash＋timedEffect content canBlockWhileRested duration turn side own count 1（BS14-101-e2 `{"kind":"magic","timing":"flash","action":{"type":"timedEffect","content":[{"type":"canBlockWhileRested"}],"duration":"turn","side":"own","count":1,"filter":{"color":"green"}}}`。「このターンの間、指定されたスピリットは、相手のス…（疲労状態でブロックできる）」と同じ形。色の絞り込みが無い分だけ緩い） |
| BS21-080 | メイン：相手のネクサスすべてを手札に戻す（連鎖元） | magic main＋return to hand nexus only all（BS14-083-e2 の return に all。return の all＝候補すべて。effectAction.ts:77） |
| BS21-080 | 連鎖（条件 緑/青×1） | [緑]：if（ownColorSymbols green）→ exhaust count 1（BS20-034-e2 と同じ if の形）。[青]：**W5**（timedEffect playerRule＋バースト条件イベントの発動禁止） |
| BS21-080 | フラッシュ：このターンの間、スピリット1体をBP+3000する | magic flash＋timedEffect bp 3000 duration turn count 1（BS20-073-e1 `{"type":"timedEffect","content":[{"type":"bp","amount":3000}],"duration":"turn","side":"own","count":1}`。「このターンの間、自分のスピリット1体をBP+3000する。」と同じ形） |
| BS21-X04 | Lv1-3：【強化】を持つ自分のスピリットすべては、相手のスピリットの効果を受けない | constraintGrant target ownAll keywordFilter kyoka（絞り込み：強化を持つ）＋constraint immuneToOpponentEffects against spirit。手本 PX17-e1 `{"kind":"constraint","constraint":{"type":"immuneToOpponentEffects","against":"spirit"}}`（「このスピリットは、相手のスピリットの効果を受けない。」と同じ constraint）を constraintGrant（effectDefContinuous.ts:574。target ownAll＋keywordFilter）で配る |
| BS21-X04 | Lv2-3 強化（白。アルティメット以外） | keyword kyoka refresh（BS19-038-e1。アルティメットは未実装なので軸不要。§1 備考） |
| BS21-X04 | Lv3『相手のターン』相手がマジックカードを使用したとき、その効果発揮前にこのスピリットのコア2個を自分のトラッシュに置くことで、その効果を無効にする | magicNegate turn opponent＋**W6**（cost selfCoresToTrash 2）。手本 BS02-083-e2 `{"kind":"magicNegate","levels":[2],"phase":"attack","cost":{"selfCoresToVoid":2},"oncePerTurn":true,"onceScope":"name"}`（「コア2個をボイドに置くことでマジックを無効」の既存の器。行き先がトラッシュの軸だけ足りない） |
| BS21-X07 | Lv1 強化（白） | keyword kyoka refresh levels [1]（BS19-038-e1） |
| BS21-X07 | 【合体中】強化（白） | keyword kyoka refresh whileCombined（BS19 M1：ラベルキーワードは whileCombined を付けると合体中だけ。BS19_PLAN §3.1） |
| BS21-X07 | 【合体時】『このスピリットのアタック/ブロック時』合体していない自分のスピリット1体を回復させる | triggered onAttack＋onBlock の2エントリ（BS20-026-e2/e3 `{"trigger":"onAttack",...}` `{"trigger":"onBlock",...}`。「『このスピリットのアタック/ブロック時』」を2エントリに分けた手本）＋whileCombined＋refresh filter uncombined count 1（targetFilter.ts:43 `uncombined?: true`。BS13-X03-e2 の refresh filter と同じ書き方） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
1. **034-Lv1「ブロックしたとき、そのスピリットをBP+3000する」の期間**：そのバトルの間（BS12-036-e1 の timedEffect bp duration battle と同じ形）と読んだ。もう1つの読みは、効果解決時の1回きりの加算（期間の器に置かない）。BS01-004-e1 は「このバトルの間」と文言があるが 034 には無い。
2. **034-Lv3「合体していない相手のスピリットすべては、可能ならば必ずアタックする」の強制の単位**：相手のアタックステップの間、アタックできるスピリットがいるならそのすべてが（個体ごとに）アタックを強制される、と読んだ（constraint mustAttack を opponentAll に配る）。もう1つの読みは、アタックステップを終える条件（1回でもアタックすればよい）で、これは既存の globalConstraint `opponentMustAttackOnce` の意味になる。文言は「すべては…必ずアタックする」なので前者寄りだが、実装前に確認したい。
3. **036 連鎖[青]「このスピリットは、ターンに1回まで、自分のネクサス1つを疲労させることで回復できる」の期間**：連鎖の解決でこの能力が与えられるのは、そのターンの間だけと読んだ（連鎖は連鎖元の発揮タイミングで1回解決される効果なので、付与にも期間が要る。BS14-066 の【強襲】はカード自身の恒常効果で期間の問題が無い）。もう1つの読みは、以後ずっと（そのスピリットが場にいる間）有効な能力として与えられる。W2 の器には duration が要る。
4. **062「このスピリットが紫のシンボルを持つとき」の判定**：合体スピリット（ホスト）のシンボルの色で判定すると読んだ。もう1つの読みは、カードの色（colors）で代用する（色とシンボルが一致しないカードは「赤のスピリットとしても扱う」等の例外的なものだけ）。W3 をシンボルで作るか色で済ませるかの決め手が効果文からは取れない。
5. **070-Lv2「この効果は重複しない」の範囲**：同名のネクサス（フィアナ空母都市）を2枚以上置いたとき、この誘発（lifeCrush）は1回だけ発火すると読んだ。Lv1 の BP+3000 は加算で自然に重なる（「この効果」は Lv2 節にあるので Lv1 には及ばない）。もう1つの読みは、同名に限らず「系統：「武装」…リザーブに置く」効果全般の重複排除（他カードとの組み合わせ）。W4 は同名解釈の軸。
6. **X04-Lv3「コア2個を自分のトラッシュに置くことで、その効果を無効にする」の任意・強制と判定時点**：magicNegate の確認フローどおり、相手がマジックを使用したときに払うかを聞き、払わなければ無効化しない（任意）と読んだ。コアが2個に満たないときは聞けない。「その効果発揮前に」も magicNegate（BS02-083）と同じ時点。読みは1通りだが、確認を出す時点の明示のため記す。
