# 構築済みデッキ 調査メモ：blue（調査役）
対象：EX006 EX023 SD03-007 SD03-008 SD03-009 SD03-012 SD03-014 SD03-017 SD16-001 SD16-002 SD16-003 SD16-004 SD16-005 SD16-006 SD16-007 SD16-008 SD16-X01。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：30
- 既存の器で書ける：24
- 新しい部品が要る：6（EX006×1、SD03-009×1、SD03-014×1、SD16-004×1、SD16-005×1、SD16-008×1。部品としては5種）
- 連鎖：0（連鎖の節なし）
- 強化：2節（SD16-002・SD16-003。ともに【強化】（青）＝BS19-057-e1 と同一文）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | canDirectAttack の targetFilter にコスト上限軸（targetMaxCost）（条件の軸） | constraintDef.ts:25 の targetFilter は rested/singleCore/recovered/hasSummonTrigger/any のみでコストが書けない。手本 BS01-044-e1（constraint canDirectAttack targetFilter:"singleCore"）は「コアが1個しか置かれていない相手のスピリット1体を指定し、そのスピリットにアタックできる」で同じ形だが、コスト4以下の指定が書けない | EX006 |
| 2 | globalConstraint の condition に「自分の合体スピリットがいる間」軸（ownSpiritMatches{combined:true}）（条件の軸） | effectDefContinuous.ts:168 の condition は ownVanillaSpiritsAtLeast/allOwnNexusesHaveColor/allOwnNexusesHaveFamily/ownNexusCountExactly/ownFamilyCountAtLeast の5種で合体の有無が無い。BS10-002-e1（levelAs）は condition に ownSpiritMatches{combined:true} を持つが、globalConstraint ではこの条件が使えない。constraint 本体（cantAttackByCost costs:[1,2,3,4]）は SD06-010-e3 で既存 | SD03-009 |
| 3 | attackRequiresCoreToll に side（相手限定）軸とアタッカー絞り込み（合体していない）軸（条件の軸） | globalConstraint.ts:107 は「両陣営とも・maxCost 以下・持ち主のリザーブ→持ち主のトラッシュ」固定。手本 BS13-043-e1 は「お互いのコスト3以下のスピリットがアタックするとき、持ち主のリザーブにあるコア1個を持ち主のトラッシュに置かなければアタックできない」で同じ形だが、SD16-004（相手限定）と SD03-014（相手限定＋合体していない相手）が書けない | SD03-014、SD16-004 |
| 4 | destroy に millPerDestroyed（drawPerDestroyed のデッキ破棄版）（アクション） | effectAction.ts:48 の destroy は drawPerDestroyed しかなく、EffectCounter（effectCounter.ts）に「この効果で破壊した体数」に当たるカウンタも無い。手本 BS08-067-e2 は「この効果で破壊したスピリット1体につき、自分はデッキから1枚ドローする」（destroy drawPerDestroyed:1）で同じ形だが、破棄ぶん（discard from deck）を数値で足す器が無い | SD16-005 |
| 5 | reviveOnDestroy の scope にネクサス版（ownNexusAll＋色フィルタ。cost に exhaustSelf、revived に rested は既存）（条件の軸＝kind の拡張） | effectDefTrigger.ts:311 の scope は self/ownAll でスピリット限定。手本 BS13-036-e1 は「破壊された自分の黄のスピリット1体を疲労状態でフィールドに残す」（reviveOnDestroy scope ownAll filter color yellow cost ownLifeOneToReserve revived rested）で同じ形だが、対象がネクサスだと書けない。reviveLastDestroyedNexus（effectAction.ts:162）はトラッシュから戻す別物で「疲労状態で場に残す」指定も無い | SD16-008 |

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| EX006 | Lv1･Lv2『このスピリットのアタック時』コスト4以下の相手のスピリット1体を指定し、そのスピリットにアタックできる | **新部品1**（形は BS01-044-e1 の canDirectAttack） |
| EX006 | Lv2【強襲：1】『このスピリットのアタック時』ネクサス1つ疲労で回復 | BS16-052-e1（keyword kyoshu）＋BS16-052-e2（pay exhaust nexusOnly → refresh。同一文「ターンに1回まで、自分のネクサス1つを疲労させることで回復できる」） |
| EX023 | Lv1･Lv2【強襲：1】 | BS16-052-e1＋e2 |
| EX023 | Lv2『このスピリットのアタック時』コスト3以下の相手のスピリット1体を破壊する | BS14-072-e1（triggered onAttack destroy filter cost max3。同一文） |
| SD03-007 | Lv1･Lv2 色とシンボルは赤としても扱う | BS12-009-e1（colorAs。同一文の白版「このスピリットの色とシンボルは白としても扱う」） |
| SD03-008 | Lv1･Lv2『このスピリットのアタック時』Lvと同じ個数のコアを自分のネクサス1つへ | BS13-022-e1（placeCores countCounter selfLevel）＋BS04-059-e1（placeCores to:"nexus" target one） |
| SD03-009 | Lv1･Lv2『このスピリットの召喚時』コスト4以下の相手のスピリット1体を破壊する | BS09-X36-e2（destroy filter cost max4） |
| SD03-009 | Lv1･Lv2【強襲：1】 | BS16-052-e1＋e2 |
| SD03-009 | Lv2『相手のアタックステップ』合体スピリットがいる間、コスト4以下はアタックできない | **新部品2**（constraint は SD06-010-e3 の cantAttackByCost costs:[1,2,3,4]） |
| SD03-012 | 【合体時】『このスピリットのアタック時』デッキ5枚破棄で回復、ターンに1回 | BS16-052-e2 の pay 形（cost に discard from deck side own count 5＝BS05-053-e1 と同じ discard、then refresh self）＋oncePerTurn（BS19-032-e2 と同じ triggered oncePerTurn） |
| SD03-014 | Lv1･Lv2『お互いのメインステップ』効果でスピリットを召喚できない | BS12-072-e1（globalConstraint noSummonByEffect phase main。「スピリット/ブレイヴ/ネクサス/マジックの効果でスピリット/ブレイヴを召喚できない」同じ形） |
| SD03-014 | Lv2『相手のアタックステップ』合体していない相手のアタックにコア1個の通行料 | **新部品3**（形は BS13-043-e1 の attackRequiresCoreToll） |
| SD03-017 | フラッシュ：コスト3以下破壊 または トラッシュのネクサス1枚を手札に | BS10-062-e1（chooseActionMode。破壊モードは destroy filter cost max3）＋BS10-112-e2（moveCards trash→hand pick cardType nexus） |
| SD16-001 | Lv1･Lv2 闘神が相手によって破壊されたとき、相手のデッキを上から2枚破棄 | BS13-036-e2（fieldEvent ownSpiritDestroyed subjectFilter）＋byOpponentOnly（effectDefTrigger.ts:240 に既存）＋BS05-053-e1（discard from deck side opponent） |
| SD16-002 | Lv1･Lv2【強化】 | BS19-057-e1（keyword kyoka deckMill。同一文「アルティメット以外の自分の『相手へのデッキ破棄効果』の枚数を+1枚する」） |
| SD16-002 | Lv2『このスピリットの破壊時』コスト4以下の相手のスピリット1体を破壊する | BS09-X36-e2 の destroy 形（trigger は onDestroy。onDestroy の例は BS15-050-e2） |
| SD16-003 | Lv1･Lv2【強化】 | BS19-057-e1 |
| SD16-003 | Lv2 自分の青のネクサスすべては相手の効果では破壊されない | BS10-053-e1（globalConstraint ownNexusIndestructible colors blue sourceTypes。同一文） |
| SD16-004 | Lv1･Lv2･Lv3【粉砕】 | BS15-050-e1（keyword funsai。同一文） |
| SD16-004 | Lv2･Lv3『相手のアタックステップ』コスト3以下のアタックに通行料（相手限定） | **新部品3**（形は BS13-043-e1） |
| SD16-005 | Lv1･Lv2『このスピリットの召喚時』コスト3以下2体破壊、1体につき3枚破棄 | destroy count2 filter cost max3 は BS13-046-e1 と同じ記述。破棄ぶんは **新部品4** |
| SD16-006 | Lv1･Lv2『このスピリットの召喚時』相手のネクサス1つを破壊することで7枚破棄 | BS17-016-e1 の pay 形（cost に destroy nexus:"only"＝PAYABLE_TYPES に destroy がある）＋BS05-053-e1（discard from deck count 7） |
| SD16-006 | 【合体時】Lv2『相手のアタックステップ』コスト4以下の相手のスピリットはアタックできない | BS12-X05 の opponentCantAttackByCost（globalConstraint costs:[1,2,3,4]。「コスト2/3/5/8の相手のスピリットはアタックできない」同じ形） |
| SD16-007 | Lv1『このブレイヴの召喚時』ボイドからコア1個を自分のネクサスに | BS04-059-e1（placeCores void→nexus。同一文「ボイドからコア1個を自分のネクサス1つの上に置く」） |
| SD16-007 | 【合体時】『このスピリットの合体アタック時』コスト3以下の相手のスピリット1体を破壊する | BS14-072-e1（同一文） |
| SD16-008 | Lv1･Lv2 ネクサスが破壊されたとき、このネクサスの疲労で青のネクサス1つを疲労状態で残す | **新部品5**（形は BS13-036-e1 の reviveOnDestroy。cost exhaustSelf・revived rested は既存） |
| SD16-008 | Lv2 闘神すべてに【粉砕】を与える | BS05-082-e2（keywordGrant funsai target ownAll）＋familyFilter 闘神（effectDefContinuous.ts:262 に既存） |
| SD16-X01 | Lv1〜3『このスピリットの召喚時』コスト5以下の相手のスピリット1体を破壊する | BS09-X36-e2 の destroy 形（cost max5） |
| SD16-X01 | Lv1〜3『このスピリットのアタック時』相手のデッキを上から5枚破棄する | BS05-053-e1（discard from deck side opponent count 5） |
| SD16-X01 | Lv2･Lv3『このスピリットのアタック時』闘神1体を疲労させることで回復、ターンに1回 | BS19-032-e2（pay exhaust → refresh、oncePerTurn。「ターンに1回、自分のネクサス1つを疲労させることで、このスピリットは回復する」同じ形。疲労元をネクサスから系統フィルタのスピリットに変えるだけ＝exhaust の filter で書ける） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
- SD03-014 Lv1「スピリット/ネクサス/マジックの効果で**スピリット**を召喚できない」：既存の noSummonByEffect はスピリット/ブレイヴ両方を止める（手本 BS12-072 は「スピリット/**ブレイヴ**を召喚できない」と明記）。このカードはブレイヴの効果による召喚を含むか、スピリットの召喚だけか。
- SD16-001「系統：『闘神』を持つ自分のスピリットが相手によって破壊されたとき」：複数体が同時に破壊されたとき、体数ぶん発揮するか（perDestroyed）グループで1回か。fieldEvent の既定は1回（Q22359）だが、2体同時破壊で2回と読むこともできる。
- SD16-005「コスト3以下の相手のスピリット2体を破壊する」：該当が1体のときも1体破壊するか（upTo）、2体揃わなければ不発か。
- SD16-008 Lv1「破壊された青のネクサス1つ」：このネクサス自身が破壊されたときも、自分を疲労させて自身を残せるのか（「自分のネクサス」に自身は含まれるか）。
- SD03-017「または」：どちらのモードも対象がいないときは不発か、選べる方だけ発揮か（chooseActionMode の既定の確認事項）。
