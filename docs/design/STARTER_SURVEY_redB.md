# 構築済みデッキ 調査メモ：redB（調査役）
対象：SD10-013 SD10-014 SD10-015 SD10-016 SD10-X01 SD10-X02 SD17-001 SD17-002 SD17-003 SD17-004 SD17-005 SD17-006 SD17-007 SD17-008 SD17-009 SD17-010 SD17-011 SD17-012 SD17-013 SD17-014 SD17-015 SD17-016 SD17-X01 SD17-X02 X009。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：**45**（SD17-010 は効果なしの0節。連鎖の行6・強化の行3を含む）
- 既存の器で書ける：**43**
- 新しい部品が要る：**2**（SD10-013 Lv2・SD10-015 の使用制限）
- 連鎖：**6**（SD17-004・007・008・014・015・X01。すべて条件《緑シンボル》×1）
- 強化：**3**（SD10-X01 Lv3・SD10-X02 Lv1・SD10-X02 合体時。すべて赤＝bpDestroy）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | `destroyedByOwnEffect` に `sourceKeyword?: Keyword`（条件の軸） | fieldEvent `opponentSpiritDestroyed` の発生源絞り込み `destroyedByOwnEffect` は `sourceType`/`sourceFamily` だけ（effectDefTrigger.ts:225。手本 BS19-079-e3 は「系統：「星竜」を持つ自分のスピリットが相手のスピリットを破壊したとき」を sourceFamily で書いた）。キーワード（【強化】）を持つ発生源の軸が無い。バトル側は `battleWon` の `winnerKeywordFilter`（effectDefTrigger.ts:176）があるが、効果による破壊が拾えない | SD10-013 Lv2 |
| 2 | magic エントリに「相手のアタックステップ限定」の使用制限（タイミング） | magic kind の既存の使用制限は `useWindow:"beforeBlock"`（ブロック宣言前のみ）と `ownTurnForbidden`（相手のターン全体でないと使えない）だけ（effectDef.ts:42-48）。『相手のアタックステップ』の間いつでも使えるが相手のメイン/フラッシュステップでは使えない、が書けない。MagicCondition（effectDef.ts:187-215）にも phase の軸は無い | SD10-015 |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| SD10-013 | Lv1『相手のアタックステップ』ライフ減→アタッカー破壊 | fieldEvent `ownLifeDamaged` + `byAttackOnly`（手本 BS19-103-e4「相手のスピリットのアタックによって自分のライフが減るまで」）＋ destroy `filter:{maxBp:5000, attackingOnly:true}`（attackingOnly 軸＝targetFilter.ts:76。§4 の読み参照） |
| SD10-013 | Lv2『自分のアタックステップ』【強化】持ちが破壊したらネクサス破壊 | **新部品1**。効果破壊側は fieldEvent `opponentSpiritDestroyed` + `destroyedByOwnEffect:{sourceType:"spirit", sourceKeyword:"kyoka"}`（手本 BS19-079-e3 と同じ形・軸だけ追加）＋ destroy `nexus:"only"`。バトル側は `battleWon` + `winnerKeywordFilter:"kyoka"`（effectDefTrigger.ts:176）の2エントリ |
| SD10-014 | フラッシュ：BP2000以下2体破壊 | destroy `count:2, filter:{maxBp:2000}`（手本 BS10-062-e1「BP4000以下の相手のスピリット2体を破壊する」） |
| SD10-015 | フラッシュ：自分の赤1体を破壊することでアタックステップ終了 | `pay`（cost: destroy `side:"own", filter:{color:"red"}`）→ `endAttackStepAfterBattle`（手本 BS01-144-e1「今行っているバトルが終了したとき、アタックステップを終了する」）。使用制限「『相手のアタックステップ』でしか使えない」は**新部品2** |
| SD10-016 | メイン：2枚ドロー→オープンし【強化】持ち回収→残りを上に | `sequence`：draw 2（手本 BS12-074-e1 の sequence）→ `revealOpen:2` → moveCards revealed→hand `pick:{cardType:["spirit","brave"], keyword:"kyoka"}` all（pick keyword 軸は手本 BS08-070-e1「【転召】を持つスピリットカード1枚を手札に戻す」）→ moveCards revealed→deckTop all（手本 BS14-051-e1「そのカードを好きな順番でデッキの上に戻す」） |
| SD10-016 | フラッシュ：BP+3000 | timedEffect bp 3000 duration turn（手本 BS12-074-e2） |
| SD10-X01 | Lv1 召喚時：赤ブレイヴをコストを支払わず召喚 | triggered onSummon → summon `from:"hand", colorFilter:"red", bravesOnly:true`（手本 BS02-034-e2「手札にある緑のスピリットカード1枚をコストを支払わずに召喚できる」＋ summon の bravesOnly 軸 effectAction.ts:159） |
| SD10-X01 | Lv2 アタック時：BP5000以下1体破壊 | destroy `filter:{maxBp:5000}`（手本 BS19-011-e1「BP7000以下…1体を破壊する」） |
| SD10-X01 | Lv3 強化（赤） | keyword `kyoka:"bpDestroy"`（手本 BS19-009-e1「自分の「BP破壊効果」の上限を+1000する」） |
| SD10-X02 | Lv1 召喚時：BP3000以下すべて破壊＋破壊数ドロー | destroy `all:true, filter:{maxBp:3000}, drawPerDestroyed:1`（手本 BS11-006-e1「この効果で相手のスピリットを破壊したとき、自分はデッキから1枚ドローする」） |
| SD10-X02 | Lv1 強化（赤） | keyword `kyoka:"bpDestroy"`（手本 BS19-009-e1） |
| SD10-X02 | 【合体時】強化（赤） | keyword `kyoka:"bpDestroy", whileCombined:true`（手本 BS10-062-e2「【合体時】【激突】」の whileCombined 書式） |
| SD17-001 | Lv1-3 色とシンボルは緑としても扱う | `colorAs` colors:["green"]（手本 BS12-009-e1「このスピリットの色とシンボルは白としても扱う」） |
| SD17-002 | Lv2-3 緑のスピリットとしても扱う | `colorAs` colors:["green"]（手本 BS12-009-e1 と同じ器） |
| SD17-003 | Lv1-3【激突】 | keyword `clash`（手本 BS11-003-e2「【激突】『このスピリットのアタック時』相手は可能ならば必ずブロックする」） |
| SD17-004 | Lv1 召喚時：ネクサス1つ破壊 | destroy `nexus:"only", count:1`（手本 BS18-062-e2 の destroy nexus only） |
| SD17-004 | 連鎖（条件 緑×1） | `if` `count:{ownColorSymbols:"green"}, atLeast:1` → placeCores void→spirit self 1（if の手本 BS19-024-e2。placeCores の手本 BS19-085-e1） |
| SD17-005 | Lv1-3『自分のアタックステップ』地竜すべてBP+2000 | aura bp `target:"ownAll", familyFilter:"地竜", amount:2000, phaseTurn:{phase:"attack",turn:"own"}`（手本 BS18-062-e1「自分の赤のスピリットすべてをBP+1000する」） |
| SD17-006 | Lv1-2【激突】 | keyword `clash`（手本 BS11-003-e2） |
| SD17-006 | Lv2 アタック時：1枚ドロー | triggered onAttack → draw 1（手本 BS19-027-e1 と同じ triggered onAttack の形） |
| SD17-007 | Lv1-2 アタック時：自分BP+3000 | triggered onAttack → timedEffect bp 3000 duration battle target self（手本 BS11-003-e1「このスピリットをBP+2000する」） |
| SD17-007 | 連鎖（条件 緑×1） | `if` ownColorSymbols green → placeCores void→spirit self 1（手本 BS19-024-e2＋BS19-085-e1） |
| SD17-008 | Lv1-2【激突】 | keyword `clash`（手本 BS11-003-e2） |
| SD17-008 | 連鎖（条件 緑×1） | triggered onAttack `condition:{firstAttackOfTurn:true}` → `if` ownColorSymbols green → refresh self（手本 BS12-020-e2「自分のターンの最初のアタックのとき、このスピリットは回復する」＋if は BS19-024-e2） |
| SD17-009 | Lv1-3【激突】 | keyword `clash`（手本 BS11-003-e2） |
| SD17-009 | Lv2-3 アタック時：このBP以下1体破壊 | destroy `filter:{maxBp:"selfBp"}`（selfBp 軸＝targetFilter.ts:11「発生源の実効BP以下」。手本 BS14-X01-e3 は固定値だが同じ destroy filter の形） |
| SD17-010 | （効果の記述なし） | effects なし（data/staging の effect が空） |
| SD17-011 | Lv1 召喚時：トラッシュの【連鎖】持ち1枚回収 | moveCards trash→hand `pick:{cardType:"spirit", keyword:"rensa"}`（手本 BS08-070-e1「自分のトラッシュにある【転召】を持つスピリットカード1枚を手札に戻す」） |
| SD17-011 | 【合体時】【激突】 | keyword `clash, whileCombined:true`（手本 BS10-062-e2） |
| SD17-012 | Lv1『自分のアタックステップ』BP比べ勝ったらドロー | `battleWon` `role:"any", turn:"own", selfMode:"source"` → draw 1（手本 BS18-062-e2「自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手のネクサス1つを破壊する」＝同じトリガーで action が違うだけ） |
| SD17-012 | Lv2 相手に破壊されたら地竜回収 | fieldEvent `ownSpiritDestroyed` + `byOpponentOnly:true` → moveCards trash→hand `pick:{cardType:"spirit", family:"地竜"}`（手本 BS19-079-e3 の fieldEvent→moveCards trash の形） |
| SD17-013 | Lv1『自分のアタックステップ』地竜すべてBP+3000 | aura bp ownAll familyFilter 地竜 3000 phaseTurn attack own（手本 BS18-062-e1） |
| SD17-013 | Lv2『自分のエンドステップ』地竜3体回復 | `step` `step:"end", turn:"own"` → refresh `count:3, filter:{family:"地竜"}`（手本 BS09-061-e2「『自分のエンドステップ』…スピリットすべてを回復させる」の refresh filter family。count 軸は effectAction.ts:94） |
| SD17-014 | フラッシュ：BP3000以下1体破壊 | destroy `filter:{maxBp:3000}`（手本 BS19-011-e1） |
| SD17-014 | 連鎖（条件 緑×1） | `if` ownColorSymbols green → exhaust 1（手本 BS19-024-e2 の if＋exhaust） |
| SD17-015 | フラッシュ：BP合計5000まで破壊 | destroy `count:"any", budget:{by:"bp", amount:5000}`（手本 BS17-055-e1「BP合計4000まで相手のスピリットを好きなだけ破壊する」） |
| SD17-015 | 連鎖（条件 緑×1） | `if` ownColorSymbols green → refresh `count:2, filter:{symbolCount:1}`（symbolCount 軸＝targetFilter.ts:33「シンボル1つを持つ」。if は BS19-024-e2） |
| SD17-016 | メイン：2枚ドロー→オープンし【連鎖】持ち1枚回収→残りを上に | SD10-016 と同じ `sequence`（draw 2＋revealOpen 2＋moveCards pick `{cardType:["spirit","brave"], keyword:"rensa"}` count 1＋deckTop）。手本 BS12-074-e1・BS14-051-e1・BS08-070-e1 |
| SD17-016 | フラッシュ：BP+3000 | timedEffect bp 3000 turn（手本 BS12-074-e2） |
| SD17-X01 | Lv1 アタック時：このBP以下1体破壊 | destroy `filter:{maxBp:"selfBp"}`（selfBp 軸＝targetFilter.ts:11） |
| SD17-X01 | 連鎖（条件 緑×1） | `battleWon` `role:"attacker"` → `if` ownColorSymbols green → lifeCrush 1（手本 BS19-011-e2「BPを比べ…のとき、相手のライフのコア1個を相手のリザーブに置く」＝lifeCrush。if は BS19-024-e2。§4 参照） |
| SD17-X01 | Lv2-3『自分のアタックステップ』地竜すべてBP+3000 | aura bp ownAll familyFilter 地竜 3000 phaseTurn attack own（手本 BS18-062-e1） |
| SD17-X02 | Lv1 召喚時：ネクサス1つ破壊＋破壊したらドロー | destroy `nexus:"only", count:1, drawPerDestroyed:1`（手本 BS11-006-e1「この効果で…破壊したとき、自分はデッキから1枚ドローする」） |
| SD17-X02 | 【合体時】アタック時：指定してアタック | constraint `canDirectAttack, targetFilter:"any", whileCombined:true`（手本 BS14-X01-e2「相手のスピリット1体を指定してアタックできる」） |
| X009 | Lv1 召喚時：BP4000以下すべて破壊 or ネクサスすべて破壊 | `chooseActionMode` 2モード（手本 BS10-062-e1「BP4000以下の相手のスピリット2体を破壊する。または、…ネクサス1つを破壊する」）。モード1: destroy all `filter:{maxBp:4000}`（§4 参照）、モード2: destroy `nexus:"only", count:"all"` |
| X009 | 【合体時】合体アタック時：指定してアタック | constraint `canDirectAttack, targetFilter:"any", whileCombined:true`（手本 BS14-X01-e2） |

## 4. 効果文から決められない点
- **SD10-013 Lv1**：「アタックしたBP5000以下の相手のスピリット1体を破壊する」の対象を、`attackingOnly`（今のバトルのアタッカー）で拾う読みにした。ライフ減少はバトル中に解決するのでアタッカーは `board.battle.attackerInstanceId` にいる。もう1つの読みは「イベントの targetInstanceId（アタッカー）を直接対象にする軸」で、そちらが要るなら destroy に eventTarget 系の軸が足りない
- **SD10-013 Lv2**：「破壊したとき」をバトル（battleWon）と効果破壊（fieldEvent）の2エントリで書く読み。もう1つの読みは「手段を問わない1つのイベント」で、その場合は `opponentSpiritDestroyed` に発生源キーワードを見る単一の軸が要る（新部品1の別の形）
- **SD10-015**：`ownTurnForbidden`（相手のターンなら全体OK）で代用する読みもできるが、文言は『相手のアタックステップ』限定なので新部品2とした
- **SD10-X02**：「アルティメット以外の自分の“BP破壊効果”」。このエンジンにアルティメットはいない（BS19_PLAN 冒頭）ので「アルティメット以外の」を無視して BS19 と同じ `kyoka:"bpDestroy"` にするか
- **SD17-008**：連鎖元が【激突】（キーワードで action を持たない）。連鎖は『このスピリットのアタック時』の triggered として独立に書く読み（Q773：連鎖元の発揮タイミングが来ていれば発揮）。ブロッカーがいず直接攻撃になった場合もアタック時は来るので発揮する
- **SD17-X01 連鎖**：連鎖元『このスピリットのアタック時』と連鎖の中身（BP比べ勝利時）で発揮タイミングが違う。裁定4（連鎖元を発揮した時点で緑シンボルがあれば、後で失っても発揮）により `battleWon`＋`if` で書く読み。もう1つの読みは「アタック時の sequence の中に条件付きで置く」
- **SD17-015 連鎖**：「シンボル1つだけを持つ」を `symbolCount:1` で拾うと、合体スピリット（ブレイヴのシンボルも数える＝instanceSymbolCount）は必ず2つ以上なので対象外になる。合体を含める読みが要るなら軸の追加が要る
- **X009 Lv1**：「BP4000以下のスピリットすべて」に「相手の」が付いていない。BS10-062 は「相手のスピリット2体」と明示しているので相手側だけの読みが自然だが、お互いのスピリットすべての読みも残る
- **SD17-013 Lv2**：「3体を回復させる」は地竜が3体いなければ不発（対象が足りない）か、いる分だけ回復するか。refresh `count:3` の解釈に影響する
