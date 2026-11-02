# 構築済みデッキ 調査メモ：redA（調査役）
対象：BS20-074 EX004 SD03-001 SD03-002 SD03-003 SD03-004 SD03-005 SD03-006 SD03-010 SD03-011 SD03-013 SD03-015 SD03-016 SD10-001 SD10-002 SD10-003 SD10-004 SD10-005 SD10-006 SD10-007 SD10-008 SD10-009 SD10-010 SD10-011 SD10-012。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：32（バニラ3枚＝SD03-001・SD03-005・SD10-006 を除く22枚）
- 既存の器で書ける：32
- 新しい部品が要る：0
- 連鎖：0（【連鎖】を持つカードは無し）
- 強化：5節（SD10-001・SD10-002・SD10-005・SD10-008・SD10-009）＋絞り込み「強化を持つ」3件（SD10-008 節1／SD10-010 節2／SD10-011 合体条件）

## 2. 新しい部品の候補
なし。全節とも既存の器の組み合わせで書ける（根拠は §3 の手本）。

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-074 | フラッシュ：BP10000以下の相手スピリット1体を破壊 | `magic` timing flash ＋ `destroy` maxBp（BS19-097-e1「フラッシュ：このターンの間、アタックしている自分のスピリットすべてをBP+1000する」の kind:"magic" と BS11-006-e1「BP5000以下の相手のスピリット1体を破壊する」の destroy。強化で maxBp は+1000される） |
| EX004 | Lv1-3【激突】『アタック時』 | `keyword` clash（BS10-062-e2「【合体時】【激突】『このスピリットのアタック時』相手は可能ならスピリットでブロックする」） |
| EX004 | Lv2-3『アタック時』BP比べ相手だけ破壊したとき同じ系統の相手1体破壊 | `triggered` onBattleWin ＋ destroy filter sameFamilyAsBattleLoser（BS10-063-e1「BPを比べ相手のスピリットだけを破壊したとき、そのスピリットと同じ系統を持つ相手のスピリットすべてを破壊する」の all:true を外し count:1） |
| SD03-001 | （効果なし） | ― |
| SD03-002 | Lv1-3 自分フィールド2体以下の間Lv3として扱う | `levelAs` treatAs:3 condition maxOwnSpirits:2（BS02-002-e1「自分のフィールドにスピリットが2体以下しかいない間、このスピリットはLv3として扱う」） |
| SD03-003 | Lv1-3『アタック時』このスピリットをBP+2000 | `triggered` onAttack ＋ timedEffect bp duration battle（BS01-004-e1「『このスピリットのアタック時』このスピリットをBP+2000する」） |
| SD03-004 | Lv1-2『アタック時』上から3枚オープン、星竜スピリット/ブレイヴ1枚手札、残りデッキ下 | `triggered` onAttack ＋ sequence(revealOpen→moveCards pick→moveCards deckBottom)（BS08-005-e1「自分のデッキを上から2枚オープンできる。その中の系統：「虚神」/「神将」を持つスピリットカード1枚を手札に加える。残ったカードは好きな順番でデッキの下に戻す」。pick は CardPick の cardType 配列 ["spirit","brave"]＋family 星竜、upTo） |
| SD03-005 | （効果なし） | ― |
| SD03-006 | Lv1-3『アタック時』回復状態の相手1体を指定しアタック | `constraint` canDirectAttack targetFilter recovered（BS16-003-e1「回復状態の相手のスピリット1体を指定し、そのスピリットにアタックできる」） |
| SD03-006 | 【合体時】Lv3『合体アタック時』BP9000以下1体破壊 | `triggered` onAttack whileCombined ＋ destroy maxBp（BS10-061-e2「【合体時】『このスピリットの合体アタック時』BP合計3000まで相手のスピリットを好きなだけ破壊する」の whileCombined ＋ BS11-006-e1 の destroy） |
| SD03-010 | 【合体時】『合体アタック時』1枚ドローしBP4000以下1体破壊 | `triggered` onAttack whileCombined ＋ sequence(draw→destroy)（BS01-034-e1「『このスピリットのアタック時』自分はデッキから1枚ドローする」＋ BS10-061-e2）。合体条件：コスト4以上は braveCondition（既存） |
| SD03-011 | Lv1『このブレイヴの召喚時』相手ネクサス1つ破壊 | `triggered` onSummon ＋ destroy nexus only（PX14-e1「相手のネクサス1つを破壊する」の {type:"destroy", nexus:"only"}） |
| SD03-011 | 【合体中】『アタック時』相手ネクサス1つ破壊 | `triggered` onAttack whileCombined ＋ destroy nexus only（PX14-e1 ＋ BS10-061-e2 の whileCombined） |
| SD03-013 | Lv1-2 手札のブレイヴカードすべてに軽減シンボル[赤] | `reductionGrant` cardType:"brave" symbols:["red"]（BS06-079-e1「自分の手札にある【神速】を持つスピリットカードすべてに軽減シンボル[緑]を与える」。CardType に "brave" がある） |
| SD03-013 | Lv2『自分のドローステップ』ドロー+1枚 | `step` step:"draw" ＋ draw count 1（BS01-099-e1「『自分のドローステップ』ドローの枚数を+1枚する」） |
| SD03-015 | メイン：2枚ドロー、その後上3枚オープンしブレイヴ1枚手札、残りデッキ上 | `magic` timing main ＋ sequence(draw 2→revealOpen 3→moveCards pick cardType:"brave" upTo→moveCards all dest deckTop)（BS08-005-e1 の形。moveCards の dest に "deckTop" がある） |
| SD03-015 | フラッシュ：このターンの間スピリット1体をBP+2000 | `magic` timing flash ＋ timedEffect bp duration turn（BS19-097-e1） |
| SD03-016 | フラッシュ：BP合計5000まで好きなだけ破壊。またはネクサス1つ破壊 | `magic` flash ＋ chooseActionMode（BS10-062-e1「BP4000以下の相手のスピリット2体を破壊する。または、BP4000以下の相手のスピリット1体と相手のネクサス1つを破壊する」の chooseActionMode。mode1 は BS10-061-e2 の destroy budget by bp 5000 count any、mode2 は destroy nexus only） |
| SD10-001 | Lv1-3【強化】BP破壊効果の上限+1000 | 強化（赤）＝ `keyword` kyoka bpDestroy（BS19-009-e1「【強化】自分の「BP破壊効果」の上限を+1000する」） |
| SD10-002 | Lv1-2『アタック時』このスピリットをBP+2000 | BS01-004-e1 と同じ |
| SD10-002 | Lv2【強化】 | 強化（赤）＝ BS19-009-e1 |
| SD10-003 | Lv2-3『アタック時』1枚ドロー | BS01-034-e1 と同じ |
| SD10-004 | Lv1-2『このスピリットの破壊時』BP4000以下1体破壊 | `triggered` onDestroy ＋ destroy maxBp（BS01-032-e1「『このスピリットの破壊時』」の trigger onDestroy ＋ BS11-006-e1 の destroy） |
| SD10-005 | Lv1-3【強化】 | 強化（赤）＝ BS19-009-e1 |
| SD10-006 | （効果なし） | ― |
| SD10-007 | Lv1-3『アタック時』BP3000以下1体破壊 | `triggered` onAttack ＋ destroy maxBp（BS11-006-e1 と同じ形） |
| SD10-008 | Lv1-2『自分のアタックステップ』絞り込み：強化を持つ自分のスピリットすべてをBP+2000 | `aura` bp ownAll keywordFilter kyoka phaseTurn attack own（BS11-002-e1「『自分のアタックステップ』系統：「星竜」を持つ自分のスピリットすべてをBP+1000する」の familyFilter を auraDef の keywordFilter に替える） |
| SD10-008 | Lv2【強化】 | 強化（赤）＝ BS19-009-e1 |
| SD10-009 | Lv1-2『このスピリットの召喚時』トラッシュの星竜スピリット/ブレイヴ1枚手札 | `triggered` onSummon ＋ moveCards from trash pick（BS04-083-e1「自分のトラッシュにある系統：「甲獣」を持つスピリットカード1枚を選んで手札に戻す」＋ BS19-079-e2 の pick cardType:"brave"。pick は cardType ["spirit","brave"]＋family 星竜） |
| SD10-009 | Lv2【強化】（アルティメット以外） | 強化（赤）＝ BS19-009-e1（表記差は §4） |
| SD10-010 | Lv1-3『召喚時』BP4000以下2体破壊 | `triggered` onSummon ＋ destroy count 2 maxBp 4000（BS10-062-e1 の mode1「BP4000以下の相手のスピリット2体を破壊する」） |
| SD10-010 | Lv2-3『アタック時』絞り込み：強化を持つ自分のスピリット1体につきBP+2000 | `triggered` onAttack ＋ timedEffect bp amountCounter {ownKeyword:"kyoka"}（BS05-027-e2「【神速】を持つ自分のスピリット1体につき、このスピリットをBP+1000する」の amountCounter ownKeyword を kyoka に） |
| SD10-010 | Lv3『アタック時』相手1体を指定しアタック | `constraint` canDirectAttack targetFilter any（PX14-e3「相手のスピリット1体を指定し、そのスピリットにアタックできる」） |
| SD10-011 | Lv1『このブレイヴの召喚時』相手ネクサス1つ破壊 | PX14-e1 と同じ |
| SD10-011 | 合体条件：【強化】を持つ | braveCondition {keyword:"kyoka"}（BS19-077「合体条件：【強化】を持つ」の braveCondition） |
| SD10-011 | 【合体時】『合体アタック時』BP3000以下1体破壊 | BS10-061-e2 の whileCombined ＋ BS11-006-e1 の destroy |
| SD10-012 | Lv1-2『自分のアタックステップ』星竜すべてBP+2000 | `aura` bp ownAll familyFilter 星竜 phaseTurn attack own（BS11-002-e1 と同じ、amount 2000） |
| SD10-012 | Lv2『お互いのアタックステップ』自分の効果で相手を破壊したとき1枚ドロー | `fieldEvent` opponentSpiritDestroyed destroyedByOwnEffect {sourceType:"spirit"} phase attack（BS19-079-e3「系統：「星竜」を持つ自分のスピリットが相手のスピリットを破壊したとき」の destroyedByOwnEffect。sourceFamily の指定は無し、turn 省略＝お互い） |

## 4. 効果文から決められない点
- **SD10-001・SD10-009 の【強化】は「アルティメット以外の自分の『BP破壊効果』」と書く**。BS19 の赤【強化】（BS19-009）にこの語は無い。青の BS19-057 は「アルティメット以外の自分の『相手へのデッキ破棄効果』」と書きながら平文の `kyoka:"deckMill"` で encode している（アルティメットが現エンジンに存在しないため実質同じ）。赤も同じ扱い（`kyoka:"bpDestroy"` のまま）でよいか、それとも表記差をデータに残すか。
- **SD03-002「スピリットが2体以下」の数え方**：合体スピリットを1体と数えるか、ブレイヴも数えるか。手本 BS02-002-e1 の maxOwnSpirits と同じ器・同じ扱いになるはずだが、BS02-002 の実装時の裁定を引き継ぐこと。
- **SD10-010 Lv3「相手のスピリット1体を指定し」**：疲労状態の相手も指定できる（targetFilter any。BS01-037「疲労状態の相手のスピリット1体を指定し」の器の条件を外しただけ）。読みは一通りだが、ブロック可能な範囲（回復状態のみ等）の制限が無いことを確認しておく。
- **EX004 Lv2「BPを比べ相手のスピリットだけを破壊したとき」**：相打ちは含まない（BS19_PLAN §2.2 の 091 と同じ読み）。手本 BS10-063-e1 の onBattleWin が「だけ破壊」を含むトリガーであることは、同カードの効果文「BPを比べ相手のスピリットだけを破壊したとき」から確認済み。
- **SD10-012 Lv2「自分のスピリットの効果で破壊したとき」**：バトルによる破壊は含まない（destroyedByOwnEffect の定義が「バトルは含まない」と明記）。効果文どおり。ネクサスの効果やマジックの効果は含まれない（sourceType:"spirit"）。
