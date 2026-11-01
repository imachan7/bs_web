# BS19 調査メモ：red（調査役）

対象：BS19-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 011, 067, 068, 079, 080, 081, 097, 098, 099, X01。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）

- 節の数：**34**（効果なしの BS19-001/002/004 を除く17枚）
- 既存の器で書ける：**22**
- 連鎖：**6**（連鎖の節4＝006/008/010/098。中身はすべて既存の器。「【連鎖】を持つ」絞り込み2＝081。枠とキーワードはメインルール設計）
- 強化：**3**（【強化】本体1＝009＝部品#2。「【強化】を持つ」絞り込み2＝079/097＝部品#3）
- 新しい部品が要る：**4節**（011 Lv2＝#1、099 メイン＝#4、X01 Lv1＝#5、009 強化本体＝#2）


## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | イベント主体基準のブロッカーBP比較軸（例：maxBp:"subjectBp"）（条件の軸） | fieldEvent `ownSpiritBlocked` の partnerFilter は matchesTarget に**発生源**の instanceId を渡す（fieldEventTriggers.ts:193）。maxBp:"selfBp" は normalizeFilter が ctx.self（発生源）の BP に解決する（actions/filter.ts:188-192）。どちらも「ブロックされた側（イベント主体）のBP以下」を書けない。effectGrant の granted.condition は固定値の targetMaxCost/targetMaxBp のみ | BS19-011 |
| 2 | 強化（赤）の効果適用範囲（メインルール設計。連続効果） | 既存の `destroyBpThresholdBonus`（BS16-061-e1）は「スピリット/マジックの効果限定」の裁定が型に焼き付いている（effectDefContinuous.ts:387）。強化はブレイヴ・ネクサス・バーストの効果にも効く（設計書§2.1・Q758）ため流用できず、強化専用の器が必要 | BS19-009 ほか強化持ち全般 |
| 3 | 絞り込み「連鎖を持つ」「強化を持つ」（条件の軸／キーワード） | targetFilter の `keyword` 軸は既存だが、Keyword 型に連鎖・強化が無い。メインルールの連鎖・強化設計に付随して決まる（§2.1 の Q774・Q775：シンボルが足りなくても持っている） | BS19-079, 081, 097 |
| 4 | フィールドマジック配置（このマジックをフィールドに置き、継続効果の発源泉にする。「自分のスピリットが相手の効果で破壊されたときこのカードを破棄」のトリガー込み）（アクション＋配置先） | マジックを場に残す器が無い（解決後はトラッシュへ。`setNexus` はネクサス専用、`spawnToken` はトークン生成でカードそのものを置けない）。継続内容も軸が足りない：immunityGrant（effectDefContinuous.ts:330）は target ownAll/self で相手側のスピリットに効かせられない／allSpiritsCantBounce（globalConstraint.ts:14）は「手札に戻らない」のみで「デッキに戻らない」「効果による原因限定」が無い／「入れ替わらない」（swapBattler 等の無効化）の軸が無い | BS19-099 |
| 5 | 破壊対象の選択軸「実効BPが最も高い相手1体」（アクションの対象軸） | `destroy` の選択は choosing で任意選択、TargetFilter に最高BP軸が無い。targetHighestBp は canDirectAttack（アタック対象指定）専用（shared/block.ts:184）。destroy の自動選択基準は lowestCost のみ（effectAction.ts destroy 定義） | BS19-X01 |


## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））

| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS19-001 | （効果なし） | — |
| BS19-002 | （効果なし） | — |
| BS19-004 | （効果なし） | — |
| BS19-003 | Lv1〜3『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットは、【重装甲】を持つ相手のスピリットにブロックされたとき回復する | 既存：kind `fieldEvent` event `ownSpiritBlocked` + subjectFilter family「星竜」 + partnerFilter keyword `heavyArmor` + action `refresh` self（手本：BS18-046-e1 の fieldEvent+subjectFilter+refresh self、ownSpiritBlocked の使い方＝BS02-065） |
| BS19-003 | Lv2･Lv3『このスピリットのアタック時』BP+3000 | 既存：triggered `onAttack` + timedEffect `bp` duration battle（手本：BS17-009-e3） |
| BS19-005 | Lv1･Lv2『このスピリットの召喚時』トラッシュのスピリットカード1枚を手札に戻す | 既存：triggered `onSummon` + `moveCards` trash→hand pick spirit（手本：BS01-014-e1） |
| BS19-005 | Lv2『自分のアタックステップ』手札1枚につきBP+1000 | 既存：kind `aura` type `bp` counter `ownHand` amountPer 1000 + phaseTurn attack/own（手本：BS10-049-e2 と同一効果。ステップ限定を phaseTurn で足すのみ） |
| BS19-006 | Lv1･Lv2『このスピリットの召喚時』『このスピリットの召喚時』効果を持つ相手1体を破壊 | 既存：triggered `onSummon` + `destroy` filter `hasTrigger:"onSummon"`（手本：BS08-002-e1） |
| BS19-006 | 連鎖（条件 紫×1）／[紫]：1枚ドロー | 連鎖の枠はメインルール設計。中身は既存：`draw` |
| BS19-007 | Lv1〜3 お互いのデッキは破棄されない | 既存：kind `globalConstraint` type `noDeckMill`（手本：BS18-002-e1） |
| BS19-007 | Lv2･Lv3『このスピリットのアタック時』BP4000以下の相手1体を破壊 | 既存：triggered `onAttack` + `destroy` filter maxBp（手本：BS08-002-e1 と同形） |
| BS19-008 | Lv1〜3『このスピリットのアタック時』BP+5000 | 既存：triggered `onAttack` + timedEffect `bp`（手本：BS17-009-e3） |
| BS19-008 | 連鎖（条件 紫×1）／[紫]：系統：「殻人」を持つ相手1体を破壊 | 連鎖の枠はメインルール設計。中身は既存：`destroy` filter family |
| BS19-009 | Lv1〜3【強化】（BP破壊効果の上限+1000） | 強化（赤）。既存の器 `destroyBpThresholdBonus`（手本：BS16-061-e1）は**スピリット/マジックの効果限定**の別効果。強化はブレイヴ・ネクサス・バーストにも効く（設計書§2.1）ため、適用範囲が違う。メインルール設計待ち |
| BS19-009 | 【合体時】Lv2･Lv3『このスピリットの合体アタック時』このスピリットのBP以下にブロックされたときBP6000以下の相手1体を破壊 | 既存：triggered `onBlocked` + whileCombined + condition `battleOpponentMatches` {maxBp:"selfBp"} + `destroy` maxBp 6000（手本：BS17-003-e1 の onBlocked+battleOpponentMatches、maxBp:"selfBp" 軸＝targetFilter.ts。合体アタック時の whileCombined＝BS17-056-e2） |
| BS19-010 | Lv1･Lv2【激突】『このスピリットのアタック時』 | 既存：kind `keyword` clash（手本：BS06-011-e1） |
| BS19-010 | Lv2『このスピリットの破壊時』このターンの間、系統：「地竜」の自分すべてに赤シンボル1つ追加 | 既存：triggered `onDestroy` + `timedEffect` duration turn / side own / all / filter family「地竜」 + content `symbolAdd`（手本：timedEffect all+filter＝BS16-083、symbolAdd content＝BS13-062-e2） |
| BS19-010 | 連鎖（条件 紫×1）／[紫]：相手のスピリットのコア7個を相手のトラッシュへ | 連鎖の枠はメインルール設計。中身は既存：`removeCores` side opponent / from spirit / to trash / count 7 / chooser owner（手本：SD01-013 の removeCores chooser:"owner"） |
| BS19-011 | Lv1〜3『このスピリットの召喚時』BP7000以下の相手1体を破壊 | 既存：triggered `onSummon` + `destroy` maxBp（手本：BS08-002-e1 と同形） |
| BS19-011 | Lv2･Lv3『自分のアタックステップ』星竜がブロックされたら（ブロッカーがそのスピリットのBP以下なら）相手のライフのコア1個をリザーブへ | **新しい部品**（§2 #1）：イベント主体基準のブロッカー BP 比較。アクションは既存：`lifeCrush` count 1（手本：BS17-009-e2） |
| BS19-067 | 合体条件：コスト4以上 | 既存：ブレイヴの合体条件フィールド（手本：BS17-056） |
| BS19-067 | 【合体時】『このスピリットのアタック時』1枚ドローし、相手のネクサス1つを破壊 | 既存：triggered `onAttack` + whileCombined + `sequence` [`draw`, `destroy` nexus:"only"]（手本：whileCombined onAttack＝BS17-056-e2、sequence＝SD06-014-e1、nexus 破壊＝SD06-014-e1） |
| BS19-068 | Lv1『このブレイヴの召喚時』系統1つを指定し、指定系統のBP5000以下の相手2体を破壊 | 既存：triggered `onSummon` + `declare` what family / fromSide opponent / then `destroy` declared:"match" + maxBp 5000 count 2（手本：BS16-082-e1、fromSide opponent＝BS17-074） |
| BS19-068 | 合体条件：コスト4以上 | 既存：ブレイヴの合体条件フィールド |
| BS19-068 | 【合体時】『このスピリットの合体アタック時』BP7000以上の相手1体を指定しアタックできる | 既存：kind `constraint` whileCombined + `canDirectAttack` targetFilter "any" + targetMinBp 7000（手本：BS01-044-e1、targetMinBp＝BS05 シンクロニシティ） |
| BS19-079 | Lv1･Lv2『自分のアタックステップ』【強化】を持つコスト2以上の自分がアタックしたとき1枚ドロー | 構造は既存：fieldEvent `anySpiritAttacked` + subjectSide own + subjectFilter {keyword 強化, cost {min: 2}} + `draw`（手本：BS13-006-e1 の anySpiritAttacked+subjectFilter）。**キーワード待ち**（絞り込み：強化を持つ＝§2 #3） |
| BS19-079 | Lv2『自分のアタックステップ』星竜が相手のスピリットを破壊したとき、トラッシュのブレイヴカード1枚を手札に戻す | 既存：2本立て。①kind `battleWon` role attacker / winnerFamilyFilter 星竜 + `moveCards` trash→hand pick brave（手本：BS09-056-e2 と同形）②fieldEvent `opponentSpiritDestroyed` + `destroyedByOwnEffect` {sourceType:"spirit", sourceFamily:["星竜"]} + 同アクション（効果破壊ぶん。手本：opponentSpiritDestroyed＝BS04-X14 パンデミウム） |
| BS19-080 | Lv1･Lv2 系統：「地竜」の自分すべてに【激突】を与える | 既存：kind `keywordGrant` keyword clash / target ownAll / familyFilter 地竜（手本：BS09-056-e1） |
| BS19-080 | Lv2『自分のアタックステップ』地竜がアタックしたとき、そのスピリットと同じBPの相手1体を破壊 | 既存：fieldEvent `anySpiritAttacked` + subjectSide own + subjectFilter family 地竜 + `destroy` {exactBp:"selfBp"} count 1（ctx.self はアタッカーに差し替わる＝fieldEventTriggers.ts:23 の selfOverride。手本：subjectFilter＝BS13-006-e1、exactBp selfBp＝P038-e1） |
| BS19-081 | Lv1･Lv2『自分のアタックステップ』【連鎖】を持つ自分が、相手の効果で破壊された/手札に戻ったとき、相手1体を破壊 | 構造は既存：2本立て。①fieldEvent `ownSpiritDestroyed` byOpponentEffectOnly + subjectFilter 連鎖 + `destroy` ②fieldEvent `ownSpiritReturnedToHand` byOpponentOnly + 同アクション。**キーワード待ち**（絞り込み：連鎖を持つ＝§2 #3） |
| BS19-081 | Lv2『自分のアタックステップ』【連鎖】を持つ自分すべてをBP+3000 | 構造は既存：kind `aura` type bp / target ownAll / amount 3000 / keywordFilter 連鎖 / phaseTurn attack own（手本：aura ownAll familyFilter＝BS04 翼持つ者の空域）。**キーワード待ち** |
| BS19-097 | フラッシュ：このターンの間、アタックしている自分すべてBP+1000。さらに、アタックしている【強化】持ちすべてBP+3000 | 構造は既存：`timedEffect` duration turn / side own / all / filter {attackingOnly} → +1000 と、filter {attackingOnly, keyword 強化} → +3000 の2アクション（手本：timedEffect all+filter＝BS16-083、attackingOnly 軸＝targetFilter.ts）。**キーワード待ち**（絞り込み：強化を持つ＝§2 #3） |
| BS19-098 | フラッシュ：BP5000以下の相手1体を破壊 | 既存：`destroy` maxBp 5000（手本：SD06-014-e1 と同型のフラッシュ） |
| BS19-098 | 連鎖（条件 紫×1）／[紫]：疲労状態のコスト4以下の相手1体を破壊 | 連鎖の枠はメインルール設計。中身は既存：`destroy` filter {rested, cost max 4} |
| BS19-099 | メイン：お互いのスピリットすべては、お互いの効果で疲労せず、手札/デッキに戻らず、入れ替わらない。このカードはフィールドに置かれ効果を発揮し続ける。自分のスピリットが相手の効果で破壊されたときこのカードを破棄 | **新しい部品**（§2 #4）：フィールドマジック配置 |
| BS19-099 | フラッシュ：このターンの間、スピリット1体をBP+3000 | 既存：`timedEffect` duration turn / bp 3000（手本：BS05 シンクロニシティのフラッシュ） |
| BS19-X01 | Lv1〜4『このスピリットのアタック時』最もBPの高い相手1体を破壊 | **新しい部品**（§2 #5）：destroy の最高BP選択軸 |
| BS19-X01 | Lv2〜4『このスピリットのアタック時』BP+5000 | 既存：triggered `onAttack` + timedEffect `bp`（手本：BS17-009-e3） |
| BS19-X01 | 【合体中】Lv3･Lv4『このスピリットのアタック時』BP7000以下の相手1体を破壊。コスト6以上を破壊したときライフのコア1個をリザーブへ | 既存：triggered `onAttack` whileCombined + `sequence` [`destroy` maxBp 7000, `if` {last:{cardType:"spirit", cost:{min:6}}} then `lifeCrush` count 1]（手本：destroy+if last cost＝BS11-032-e2、lifeCrush＝BS17-009-e2、whileCombined＝BS17-056-e2） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

- **BS19-003／BS19-011**：「ブロックされたとき」の BP 判定の時点（ブロック宣言時点の実効BPか、効果解決時点か。BS19-011 は部品#1の仕様と併せて決める必要がある）
- **BS19-079 Lv2**：「破壊したとき」をバトル限定と読むか効果破壊も含むと読むか。同文の BS09-056 星創られし場所は「BPを比べ」とバトル限定で書かれており、BS19-079 にはその限定が無い。本メモは**両方を含む**と読み、実装は2本立てとしたが、確定はメインルールで
- **BS19-010 連鎖[紫]**：「相手のスピリットのコア7個」の配分。複数のスピリットから自由に配れるか（spread）、コアを0個にしてスピリットが破壊されるのを許すか（本文に「1個残して」等の下限が無い）
- **BS19-X01 Lv1**：「最もBPの高い」相手が同値で複数いるときの扱い（部品#5の仕様で決める。canDirectAttack の targetHighestBp は同値全部を候補にする）
- **BS19-099**：「お互いのスピリットすべては、お互いの効果で〜」の「お互いの効果」＝**両プレイヤーの効果**（自分の効果による疲労・バウンスも防ぐ）と読んだ。もう1つの読みは「それぞれ相手側の効果のみ防ぐ」

