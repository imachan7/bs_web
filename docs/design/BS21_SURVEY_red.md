# BS21 調査メモ：red（調査役）
対象：BS21-001・002・003・004・005・006・007・008・009・055・056・067・073・074・X01（CP13-01 は対象外・BS21-072 は colors[0] が緑なので対象外）。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**29**（BS21-005 は効果なしの0節。連鎖の [色] 括弧ごとに1節と数えた）
- 既存の器で書ける：**27**
- 新しい部品が要る：**2**（BS21-001「重複しない」・BS21-007 Lv2 の familyGrant 受取側 keyword 絞り込み）
- 連鎖：**5節**（003 の[紫][黄]・009 の[黄]・073 の[紫][黄]。うち4節は既存の器、073[紫]は既存の器だが §4 の読みあり）
- 強化：**3枚**（002・004・X01。いずれも既存の器 `keyword:"kyoka"`）

## 2. 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| R1 | fieldEvent の「この効果は重複しない」（カウンタ／タイミングの軸。同名カードの発生源が複数あっても、同じ出来事には1回だけ発火） | fieldEvent の回数制限は `oncePerTurn`／`onceScope:"name"`（effectDefTrigger.ts:207-209。どちらも「ターン内の回数」）だけで、同名2体が並んだときの**同時発火の重複**を除く軸が無い。継続効果の `uniqueByName`（effectDefContinuous.ts:14「同じカード名の発生源は対象1体につき1回分だけ効く」）は continuous 専用。手元の唯一の前例 BS02-087「(この効果は重複しない)」は `drawDouble` という専用 kind の中に暗黙に畳まれていた（`{"id": "BS02-087-e2", "kind": "drawDouble", "levels": [2], "phaseTurn": {"phase": "attack", "turn": "own"}}`） | BS21-001 |
| R2 | familyGrant の受取側絞り込みに keyword（条件の軸。`filter?: ResolvedTargetFilter` を keywordGrant と同じ形で持たせる） | keywordGrant は受取側を `filter` で絞れる（BS19-055-e3 `{"kind": "keywordGrant", "keyword": "seimei", "target": "ownAll", "filter": {"keyword": "rensa"}}`＝「【連鎖】を持つ自分のスピリットすべてに【聖命】を与える」）。familyGrant の受取側は familyFilter／colorFilter／costFilter（effectDefContinuous.ts:303-317）だけで、キーワード（【強化】持ち）を書く軸が無い | BS21-007 Lv2 |

## 3. カードごとの表

| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS21-001 | Lv2『お互いのアタックステップ』相手によって自分の緑のスピリットが破壊されたとき、1ドロー | fieldEvent `ownSpiritDestroyed`＋`byOpponentOnly`（BS13-066-e1「相手によって自分のスピリットが破壊されたとき、ボイドからコア1個を自分のリザーブに置く」）＋`destroyedColorFilter:"green"`（BS14-061-e1）＋`phase:"attack"`（BS14-075-e1）＋action `draw`。**「この効果は重複しない」は R1 が必要** |
| BS21-002 | Lv1-2【強化】（赤） | 強化（赤）。`{"kind": "keyword", "keyword": "kyoka", "kyoka": "bpDestroy", "levels": [1, 2]}`（SD10-X02-e2 と同じ形） |
| BS21-003 | Lv1-2『このスピリットのアタック時』このスピリットをBP+3000する | triggered `onAttack`＋`timedEffect` bp 3000 `duration:"battle"` `target:"self"`（BS19-008-e1 の第1アクションと同じ形） |
| BS21-003 | 連鎖（条件 紫×1）[紫]：コスト2以下の相手のスピリットのコア1個を相手のリザーブに置く | 連鎖元の sequence の中の `if`（`count:{ownColorSymbols:"purple"}, atLeast:1`）→ `removeCores` `to:"reserve"` `count:1` `filter:{cost:{max:2}}`（P030-e1「コスト4以下の相手のスピリットのコア1個を相手のリザーブに置く」の removeCores と同じ形） |
| BS21-003 | 連鎖（条件 黄×1）[黄]：BPを比べ相手のスピリットだけを破壊したとき、ボイドからコア1個を自分のライフに置く | `if`（黄シンボル）→ `timedEffect` `grantTrigger` `trigger:"onBattleWin"` `battleRole:"attacker"` `duration:"battle"`（BS20-X06-e2「[緑]：BPを比べ相手のスピリットだけを破壊したとき、…」と同じ形。条件はアタック時に判定＝BS19 裁定4）。付与する中身は `placeCores` `from:"void"` `to:"life"` `count:1`（BS19-055-e2 と同じ形） |
| BS21-004 | Lv1-2【強化】（赤） | 強化（赤）。SD10-X02-e2 と同じ形 |
| BS21-004 | Lv2『自分のメインステップ』コスト5以上の自分のスピリットが召喚されたとき1ドロー・ターンに1回 | fieldEvent `ownSpiritSummoned`＋`phase:"main"`＋`subjectFilter`（BS19-021-e2「【連鎖】を持つ自分のスピリットが召喚されたとき」の代わりに `costFilter:{min:5}`（effectDefTrigger.ts:292））＋`oncePerTurn`（effectDefTrigger.ts:207）＋action `draw`。スコープは §4-1 |
| BS21-005 | （効果なし） | ― |
| BS21-006 | Lv1-2『このスピリットのアタック時』1ドロー | triggered `onAttack`＋`draw`（BS19-014-e1 の第1アクション「自分はデッキから1枚ドローする」と同じ形） |
| BS21-006 | Lv2【合体時】『自分のアタックステップ』このスピリット以外の系統：「皇獣」の自分のスピリットがアタックしたとき1ドロー | fieldEvent `anySpiritAttacked`＋`ownOnly`＋`subjectFilter:{family:"皇獣"}`（BS18-X02-e2「系統：「覇皇」を持つ自分の紫のスピリットがアタックしたとき」）＋`excludeSelf:true`（BS13-X04-e2 の subjectFilter と同じ形）＋`whileCombined:true`＋action `draw` |
| BS21-007 | Lv1-2『このスピリットのアタック時』系統：「星魂」1体につき、BP3000以下の相手1体を破壊 | triggered `onAttack`＋`destroy` `countCounter:{ownFamily:"星魂"}` `filter:{maxBp:3000}`（P046-e1「系統：「地竜」を持つ自分のスピリット1体につき、BP3000以下の相手のスピリット1体を破壊する」と同じ形） |
| BS21-007 | Lv2『自分のアタックステップ』【強化】を持つ自分のスピリットすべてに系統：「星魂」を与える | familyGrant `target:"ownAll"` `family:"星魂"`（effectDefContinuous.ts:303）。**受取側の「【強化】を持つ」絞り込みは R2 が必要**（絞り込み：強化を持つ） |
| BS21-008 | Lv1-3【激突】 | `{"kind": "keyword", "keyword": "clash", "levels": [1, 2, 3]}`（BS06-003-e1「Lv1･Lv2･Lv3【激突】『このスピリットのアタック時』相手は可能ならば必ずブロックする」と同じ形） |
| BS21-009 | Lv1-3『このスピリットのアタック時』相手のスピリット1体を指定し、そのスピリットにアタックできる | constraint `canDirectAttack` `targetFilter:"any"`（BS20-009-e2「相手のスピリット1体を指定し、そのスピリットにアタックできる」と同じ文言・同じ形） |
| BS21-009 | 連鎖（条件 黄×1）[黄]：BPを比べ相手のスピリットだけを破壊したとき、ボイドからコア1個を自分のライフに置く | 連鎖元が constraint（action でない）なので BS20-009-e3 と同じく連鎖だけの triggered `keyword:"rensa"` `onAttack`＋`if`（黄）→ `grantTrigger` `onBattleWin`（BS20-X06-e2 と同じ形）＋`placeCores` void→life（BS19-055-e2） |
| BS21-009 | Lv2-3『自分のアタックステップ』自分の赤/黄のスピリットすべてをBP+3000する | aura `bp` `target:"ownAll"` `amount:3000` `filter:{color:["red","yellow"]}` `phaseTurn:{phase:"attack",turn:"own"}`（BS06-006-e2「【激突】を持つ自分のスピリットすべてをBP+1000する」の aura と同じ形。color 配列＝OR は targetFilter.ts:18） |
| BS21-055 | Lv1『このブレイヴの召喚時』相手のネクサス1つを破壊する | triggered `onSummon`＋`destroy` `nexus:"only"` `count:1`（SD03-011-e1『このブレイヴの召喚時』と同じ形） |
| BS21-055 | 【合体時】『このスピリットの合体アタック時』このスピリットをBP+5000する | triggered `onAttack` `whileCombined:true`（SD10-011-e2 と同じ形）＋`timedEffect` bp 5000 `duration:"battle"` `target:"self"`（BS19-008-e1 と同じ形） |
| BS21-056 | Lv1『このブレイヴの召喚時』BP3000以下の相手のスピリット2体を破壊する | triggered `onSummon`＋`destroy` `count:2` `filter:{maxBp:3000}`（P048-e1「BP3000以下の相手のスピリット2体を破壊する」と同じ形） |
| BS21-067 | Lv1-2 このネクサスが相手によって破壊されたとき、BP10000以下の相手1体を破壊する | fieldEvent `ownNexusDestroyed`＋`selfMode:"source"`＋`byOpponentEffectOnly:true`＋action `destroy` `filter:{maxBp:10000}`（BS07-056-e1「相手によって破壊されたとき、BP3000以下の…を破壊する」と同じ形・同じ文言） |
| BS21-067 | Lv2『自分のアタックステップ』【強化】/【連鎖】を持つ自分のスピリットがアタックしたとき、BP1000以下の相手1体を破壊する | fieldEvent `anySpiritAttacked`＋`ownOnly`＋`subjectFilter:{keyword:["kyoka","rensa"]}`（keyword 配列＝OR：targetFilter.ts:30。BS19-021-e2 の subjectFilter:{keyword:"rensa"} と同じ軸）＋action `destroy` `filter:{maxBp:1000}`（絞り込み：強化を持つ／連鎖を持つ） |
| BS21-073 | フラッシュ：BP4000以下の相手1体を破壊する | magic `timing:"flash"`＋`destroy` `count:1` `filter:{maxBp:4000}`（BS06-012-e2「BP4000以下の相手のスピリット1体を破壊する」と同じ形） |
| BS21-073 | 連鎖（条件 紫×1）[紫]：自分のトラッシュにあるコスト7のスピリットカード1枚を召喚できる。ただし『このスピリットの召喚時』効果は発揮されない | magic の連鎖（BS19-101-e1 `{"kind": "magic", "keyword": "rensa", "timing": "main", "action": {"type": "sequence", ...}}` と同じ形）の `if`（紫）→ `moveCards` `from:"trash"` `dest:"summon"` `pick:{cardType:"spirit", cost:{min:7,max:7}}` `skipOnSummon:true`（BS19-101-e1「自分のトラッシュにあるコスト5以下のスピリットカード1枚を、コストを支払わずに召喚する。ただし、『このスピリットの召喚時』効果は発揮されない」の moveCards と同じ形）。**コスト支払いの有無は §4-2** |
| BS21-073 | 連鎖（条件 黄×1）[黄]：このバトルの間、アタックしている自分のスピリット1体は、コスト6以上の相手のスピリットからブロックされない | `if`（黄）→ `timedEffect` `duration:"battle"` `content:[{type:"unblockable", from:{cost:{min:6}}}]` `count:1` `choosing:true` `filter:{attackingOnly:true}`（unblockable＋from は BS19-014-e1「このターンの間、このスピリットはLv1の相手のスピリットからブロックされない」の timedEffect と同じ形。attackingOnly＝targetFilter.ts:79「アタックしている自分のスピリット」） |
| BS21-074 | メイン：相手のネクサスすべてを破壊する。破壊したネクサス1つにつき1ドロー | magic `timing:"main"`＋`destroy` `nexus:"only"` `count:1` `all:true` `drawPerDestroyed:1`（BS11-073-e1「指定した色のネクサスすべてを破壊する。この効果で破壊したネクサス1つにつき、自分はデッキから1枚ドローする」と同じ形） |
| BS21-074 | フラッシュ：このターンの間、スピリット1体をBP+3000する | magic `timing:"flash"`＋`timedEffect` `content:[{type:"bp", amount:3000}]` `duration:"turn"` `count:1` `choosing:true`（BS08-067-e3 の timedEffect bp／duration:"turn" と同じ形。1体選ぶのは effectAction.ts:118 の count/choosing） |
| BS21-X01 | Lv1-3『自分のアタックステップ』【強化】を持つ自分の赤のスピリットすべてに赤のシンボル1つを追加する | symbolAddGrant `target:"ownAll"` `filter:{color:"red", keyword:"kyoka"}` `color:"red"` `count:1` `phaseTurn:{phase:"attack", turn:"own"}`（BS12-006-e1「『自分のアタックステップ』…に赤のシンボル1つを追加する」の symbolAddGrant と同じ形。filter の keyword 軸は targetFilter.ts:30）（絞り込み：強化を持つ） |
| BS21-X01 | Lv2-3『このスピリットのアタック時』BP10000以下の相手1体を破壊する | triggered `onAttack`＋`destroy` `count:1` `filter:{maxBp:10000}`（BS06-012-e2 と同じ形） |
| BS21-X01 | Lv3【強化】（赤） | 強化（赤）。SD10-X02-e2 と同じ形（levels:[3]） |

## 4. 効果文から決められない点
1. **BS21-004「この効果はターンに1回しか使えない」のスコープ**。個体ごと（`oncePerTurn`。同名2体なら各1回）か、持ち主・カード名ごと（`onceScope:"name"`。2体並べても合計1回）か。SEMANTICS_AUDIT §234 は「ターンに1回」を発生源1体ごととするが、BS20_PLAN §1 は X01 の「この効果は、ターンに3回までしか使えない」を**カード名ごと**に読んだ。同じ「この効果は」の文言なので要確認。
2. **BS21-073 連鎖[紫]「コスト7のスピリットカード1枚を召喚できる」に「コストを支払わずに」の文言が無い**。文言どおりなら召喚コストを支払う（軽減も通常どおり）読みになるが、類例（BS19-101・BS05-004・BS14-097 などトラッシュからの効果召喚）はすべて「コストを支払わずに」と明記し、`moveCards dest:"summon"`（無償）で実装している。どちらで書くか要確認。
3. **BS21-001「この効果は重複しない」の解決**。読み自体は1通り（同名2体が並んでいても、緑スピリット1体の破壊につきドローは1回）だが、どの個体の効果として解決した記録にするか（順番は結果に影響しないが、ログ・発生源表示に必要）。R1 の実装時に決める。
