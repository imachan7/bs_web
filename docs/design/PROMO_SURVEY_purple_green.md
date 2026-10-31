# プロモ調査メモ：紫・緑（調査役）

対象：`data/staging/PROMO.json` のうち 27 枚（紫 P004 P011 P025 P030 P039 P050 P057 P061 P073 PX04 PX13 PX16、緑 P005 P010 P014 P018 P031 P035 P042 P051 P062 P066 P068 P074 PX03 PX08 PX15）。**実装はしていない**（このメモのみ）。
**P011 は効果文が空（バニラ）**なので節数に入れていない。根拠は既存カードの `effects`（`grep`／スクリプトで確認）。「（型）」は型ファイルに定義はあるが、同じ形の実カード例は見つけていないもの。

## 1. 集計

節は「Lv 見出し単位＋キーワード単独行＋バースト単独ブロック」で数え、合体条件の行は数えない。

| 区分 | 行数 |
| :-- | --: |
| 全体 | 54 |
| 既存の器で書ける | 49 |
| 新しい部品が要る | 5（部品は6種。PX13 のブロック時1行が2部品を使う） |

### 新しい部品の候補

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | `coresCantBeRemoved` 系の適用対象を「カード名に〜を含む自分のスピリット」に絞る（条件の軸） | 既存は `coresCantBeRemoved`／`...ByOpponent`／`...All` と `coreFloorOwnNamedByOpponent`（名前指定だが「下限」で別物）。名前で絞った「取り除けない」は実カードで見つからず、`constraintGrant` に名前軸があるかは未確認（実装役が `grep` で確かめ、無ければこの1軸） | P035（1行目） |
| N2 | `ownSpiritDealtLife` の `keywordFilter` に「【暴風：N】の N 指定」（条件の軸） | `keywordFilter:"bofu"` は段数を区別しない（BS06-034）。【暴風：1】限定を書くには段数の軸が要る。プール内に別段数の【暴風】持ちがいるかで要否が変わる（未確認） | P062（Lv2） |
| N3 | `ownSpiritReturnedToHand` に「相手によって」軸（`byOpponentEffectOnly` 相当）＋「戻るスピリット1体につき」 | `repeatPerCount` は `ownSpiritCoresRemovedByOpponent` にはあるが、手札に戻るイベントは出所を問わない（BS01-123 は lentOnly のみ）。タイミングが「戻るとき」なので、事後イベントで足りるかは §4 の 7 | PX13（Lv1-3 の 2 行目） |
| N4 | `EffectCounter` に「このバトルで自分のアタックをブロックしたスピリットのコスト」（対象の取り方） | 既存は `lastBattleDestroyedCost`（破壊された側）と `lastBattleBlockerTrashCost`（トラッシュ内の合計。バトル終了時点）のみ。ブロッカーが破壊されず場に残るときの値が取れない | PX13（3 行目） |
| N5 | `TargetFilter` に「このバトルでブロックしていない」（軸） | `removeCores` の filter にバトル参加の有無の軸が無い（`lastTarget` は記録した個体だけ） | PX13（3 行目） |
| N6 | `exhaust` に `budget`（`destroy` が持つ `budget:{by:"bp",amount}` と同形。軸） | `exhaust` の型に `budget` が無い。`destroy` の `count:"any"`＋`budget`（BS09-X35-e3）が同じ「合計まで好きなだけ」なので、同じ形を足すだけ | PX15（Lv1-2 のアタック時） |

## 2. カードごとの表

器の根拠に挙げる ID は、同じ形の効果を持つ既存カード。

### 紫

| cardId | 節 | 使う器 |
| :-- | :-- | :-- |
| P004 | Lv1-2 アタック時：BP比較で相手だけ破壊したとき、疲労している相手のスピリット上のコア1個を相手のトラッシュ | 既存。`triggered onBattleWin battleRole:"attacker"`（BS03-101）＋`removeCores{count:1, filter:{rested:true}}`（BS06-019 の removeCores、rested は BS09-X36 の filter） |
| P011 | （バニラ） | ― |
| P025 | Lv1-3 召喚時：1枚ドロー | 既存。`triggered onSummon draw`（BS12-050-e1） |
| P025 | Lv2-3 破壊時：トラッシュの系統「妖蛇」スピリット1枚を手札へ | 既存。`triggered onDestroy moveCards{from:"trash",dest:"hand",pick:{cardType:"spirit",family}}`（BS08-044-e2 の pick） |
| P030 | 【合体時】合体アタック時：1枚ドロー、コスト4以下の相手のスピリットのコア1個を相手のリザーブへ | 既存。`onAttack whileCombined`（BS10-061-e2）＋`sequence/simultaneous{draw, removeCores{to:"reserve",filter:{cost:{max:4}}}}`（BS11-014-e1 の to:"reserve"）。「ドローし、」は同時（§4 の 1） |
| P039 | Lv1-3 召喚時：トラッシュのカード名に「太陽」を含むスピリット1枚を手札へ | 既存。`onSummon moveCards{from:"trash",dest:"hand",pick:{cardType:"spirit",nameIncludes:"太陽"}}`（BS08-044-e2） |
| P039 | 【合体時】Lv2-3 破壊時：相手の合体スピリット1体を破壊 | 既存。`onDestroy whileCombined destroy{filter:{combined:true}}`（filter は BS10-114-e1） |
| P039 | 同：その後、ブレイヴを残しスピリットだけ手札へ | 既存。`reviveOnDestroy{toHand:true, braveStay:...}`（BS13-057-e1、BS12-068-e2）。置換か事後移動かは §4 の 2 |
| P050 | Lv1-3 召喚時：疲労状態の相手の合体スピリット1体を破壊 | 既存。`onSummon destroy{filter:{rested:true,combined:true}}`（BS09-X36-e2 の rested、BS10-114-e1 の combined。2 軸の併用は未確認） |
| P050 | Lv2-3 自分のバースト発動後：コスト4以下の相手のスピリットすべてのコア1個ずつを相手のリザーブへ | 既存。`fieldEvent ownBurstActivated`＋`removeCores{target:"all",count:1,to:"reserve",filter:{cost:{max:4}}}`（BS14-022-e2、BS11-014）。`leaveAtLeast` を付けない点は §4 の 6 |
| P057 | 【不死：コスト5/6】 | 既存。`keyword fushi triggerCosts:[5,6]`（BS09-016-e1） |
| P057 | Lv2-3 お互いのアタックステップ：相手によって自分のスピリットが破壊されたとき、トラッシュのコア1個をリザーブへ | 既存。`fieldEvent ownSpiritDestroyed phase:"attack"`（BS09-016-e2、`byOpponentEffectOnly` は BS15-017-e1）＋`placeCores{from:"trash",to:"reserve",count:1}`。「相手によって」の範囲は §4 の 4 |
| P061 | 【不死：コスト4】 | 既存。`keyword fushi triggerCosts:[4]`（BS09-X36 の [4,5] と同形） |
| P061 | Lv1-2：相手のスピリットの効果で自分のデッキが1度に10枚以上破棄されたとき、相手のライフのコア2個を相手のリザーブへ | 既存。`fieldEvent ownDeckMilled byOpponentSpiritEffectOnly minEventCount:10`（BS16-039-e2）＋`lifeCrush{count:2}` |
| P073 | バースト：相手の召喚時発揮後、このスピリットカードを召喚 | 既存。`burst event:"opponentSummonEffectResolved" action:{summon from:"burst"}`（BS14-010-e1、BS14-X04-e1） |
| P073 | 【不死：コスト6/7】 | 既存。`keyword fushi triggerCosts:[6,7]`（BS17-016-e2 は [6]） |
| P073 | Lv1-3 召喚時：【不死】で召喚されたとき、トラッシュのブレイヴ1枚をコストを支払わずに召喚できる | 既存。`onSummon condition:{selfSummonedByFushi:true}`（BS16-013-e2）＋`moveCards{from:"trash",dest:"summon",pick:{cardType:"brave"},count:1}`（BS16-011-e1、BS06-X22-e1）。「ただし召喚時は発揮されない」が無い点は §4 の 5 |
| PX04 | Lv1-3 召喚時：コア1個だけの相手のスピリットすべてを疲労 | 既存。`onSummon exhaust{all:true,filter:{cores:1}}`（cores は BS05 ドラグノ爆弾兵の filter） |
| PX04 | Lv2-3 アタック時：1枚ドロー | 既存。`onAttack draw` |
| PX13 | Lv1-3【激突】アタック時：相手は可能ならば必ずブロック | 既存。`keyword clash`（BS12-X01-e1、BS09-X35-e4） |
| PX13 | Lv1-3：相手によって自分のスピリットが手札に戻るとき、戻る1体につき相手は手札1枚を破棄 | **新規 N3**（＋`discard` で相手の手札。chooser は相手＝CHOOSER_RULES） |
| PX13 | Lv2-3 アタック時：ブロックされたとき、ブロックしたスピリットのコスト1につき、ブロックしていない相手のスピリット上のコア1個を相手のトラッシュへ | **新規 N4＋N5**。`onBlocked`＋`removeCores{count:0 相当,countCounter:N4,filter:N5}`。枠は既存 |
| PX16 | Lv1-3 召喚時：トラッシュのカード名に「魔界七将」を含むスピリット1枚をコストを支払わず召喚できる | 既存。`onSummon moveCards{from:"trash",dest:"summon",pick:{cardType:"spirit",nameIncludes:"魔界七将"}}`（BS16-011-e1）。「ただし」無しなので召喚時は発揮（§4 の 5） |
| PX16 | Lv1-3 破壊時：相手のフィールドのコア1個を相手のトラッシュへ | 既存。`onDestroy removeCores{count:1,from:["spirit","nexus"]}`（`from` はスピリット／ネクサスの指定が型にある。実カード例は未確認＝（型）） |
| PX16 | Lv2-3 アタック時：自分のスピリット1体の『破壊時』効果1つを破壊させずに発揮 | 既存。`fireEffect{trigger:"onDestroy",oneEffect:true}`（BS13-052 のブレイヴ側と同じ文。BS02-107 の `oneEffect`、BS07-018 の `all`）。自分の1体を選ぶ部分は BS13-052 の実装を参照 |

### 緑

| cardId | 節 | 使う器 |
| :-- | :-- | :-- |
| P005 | Lv1-2 アタック時：系統「歌鳥」のスピリットがいるとき BP+2000 | 既存。`onAttack condition:{ownFieldHasFamily/ownFamilyCountAtLeast}`＋`timedEffect bp duration:"battle"`（BS04-001-e1）。条件は `ownFamilyCountAtLeast{family,count:1}`（effectDefTrigger） |
| P010 | Lv1-2 アタック時：系統「翼竜」が2体以上のとき BP+1000 | 既存。同上で `count:2`。自身が翼竜を含むか §4 の 3 |
| P014 | Lv1-2 アタック時：トラッシュのコア2個をリザーブへ | 既存（型）。`onAttack placeCores{from:"trash",to:"reserve",count:2}`（`from:"trash"` `to:"reserve"` は型の union にある。BS02-057 は to:"spirit"） |
| P018 | Lv1-2 アタック時：ボイドからコア1個を【暴風】持ちの自分のスピリット1体の上へ | 既存。`onAttack placeCores{from:"void",to:"spirit",count:1,filter:{keyword:"bofu"}}`（BS04-089 の keyword filter、BS07-024-e1 の void→spirit＋filter） |
| P030 | （紫の表に記載） | ― |
| P031 | Lv1 ブレイヴの召喚時：相手のスピリット1体を疲労 | 既存。`onSummon exhaust{count:1}`（BS01-047） |
| P031 | 【合体時】合体アタック時：自分のターンの最初のアタックのとき回復 | 既存。`onAttack whileCombined condition:{firstAttackOfTurn:true} refresh target:"self"`（BS04-024-e1 の条件、BS10-061-e2 の whileCombined） |
| P035 | Lv1-2：相手の効果でカード名に「月光」を含む自分のスピリット上のコアは取り除けない | **新規 N1**（または `constraintGrant` に名前軸があれば既存。要確認） |
| P035 | 【合体時】Lv2：相手の効果で自分のスピリット上のコアが取り除かれたとき、1個につき相手のスピリット上のコア1個をボイドへ | 既存。`fieldEvent ownSpiritCoresRemovedByOpponent countMode:"cores" repeatPerCount:true whileCombined`（BS06-083-e1、BS03-109-e1）＋`removeCores{to:"void",count:1}` |
| P042 | フラッシュ【神速】 | 既存。`keyword soku`（BS01-053-e1） |
| P042 | 【合体時】バトル時：BP比較で相手だけ破壊したとき回復 | 既存。`onBattleWin whileCombined refresh target:"self"`（BS10-063-e1 の形、BS01-071-e1 の refresh）。アタック側・ブロック側の両方で出るか §4 の 8 |
| P051 | バースト：相手の召喚時発揮後、【神速】/【暴風】持ちの自分のスピリット1体を手札に戻すことで、このカードを召喚 | 既存。`burst opponentSummonEffectResolved pay{cost:return to hand own filter keyword anyOf, then:summon from burst}`（BS18-018-e1 の pay→summon、BS16 の returnToHand 例は docs/design/BS16_BATCH3.md の 72 行目） |
| P051 | Lv2 相手のアタックステップ：ステップ開始時、このスピリットを疲労させることで相手のスピリット1体を疲労 | 既存。`step attack turn:"opponent" pay{cost:{type:"exhaust",target:"self"}, then:{type:"exhaust",count:1}}`（BS14-043-e3 の形） |
| P062 | Lv1-2【暴風：1】 | 既存。`keyword bofu count:1`（BS06-028-e1） |
| P062 | Lv1-2 アタック時：ブロックされたとき、相手は相手のスピリット1体を疲労 | 既存。`onBlocked exhaust{count:1,chooserIsTarget:true,excludeTarget:true,countFromBofu:true}`（BS06-028-e2。`countFromBofu` は暴風の段数を使う点だけ要確認＝P062 は段数1固定でよいか） |
| P062 | Lv2 自分のアタックステップ：【暴風：1】持ちの自分のスピリットのアタックで相手のライフを減らしたとき、相手のスピリット1体を疲労 | 既存の枠＋**N2**。`fieldEvent ownSpiritDealtLife phase:"attack" turn:"own" keywordFilter:"bofu" selfMode:"source" exhaust`（BS06-034-e3）。段数1の限定が N2 |
| P066 | Lv1-2：色とシンボルは赤/紫/白/黄/青としても扱う | 既存。`colorAs colors:[red,purple,white,yellow,blue]`（BS12-009。BS12_PLAN.md：「色とシンボルは◯としても扱う」は colorAs 1件で足りる） |
| P068 | バースト：自分のライフ減少後、コアが1個の相手のスピリットすべてを疲労 | 既存。`burst event:"ownLifeDamaged" exhaust{all:true,filter:{cores:1}}` |
| P068 | 同：その後コストを支払うことで、このカードのフラッシュ効果を発揮 | 既存。`thenPay:"flash"`（BS14-094-e1、BS16-purple の同形） |
| P068 | フラッシュ：ボイドからコア1個を自分のスピリットに置く | 既存。`magic flash placeCores{from:"void",to:"spirit",count:1}` |
| P068 | 同：さらにボイドからコア1個を[風の覇王ドルクス・ウシワカ]か[グラント・ベンケイ]に置く | 既存（型）。`placeCores{...filter:{名前の列挙}}`。名前を OR で絞る filter のキー名は未確認（`nameIncludes`／`ownNameIncludesCountAtLeast.names` が近い）。実装役が確かめ、無ければ軸1つ |
| P074 | Lv1-2 アタック時：ボイドからコア1個をリザーブへ | 既存。`onAttack placeCores{from:"void",to:"reserve",count:1}`（BS02-032-e1） |
| P074 | Lv2 アタック時：リザーブのコア2個をトラッシュに置くことで、相手はバーストを発動できない | 既存。`onAttack pay{cost:{removeCores 自分のリザーブ→トラッシュ 2}, then:timedEffect{battleLock lock:"burst"}}`（BS12-032-e3 の pay 形、BS15-X03-e1 の `battleLock lock:"burst" duration:"battle"`）。期間は §4 の 9 |
| PX03 | Lv1-2 召喚時：ボイドからコア1個ずつ自分のスピリットすべての上へ | 既存。`onSummon placeCores{from:"void",to:"spirit",target:"all",count:1}`（BS10-087-e2） |
| PX03 | Lv2 アタック時：ボイドからコア1個をリザーブへ | 既存。BS02-032-e1 と同形 |
| PX08 | Lv1-2【氷壁：紫/白/青】 | 既存。`keyword hyoheki`＋`magicNegate cost:{exhaustSelf:true} colors:[purple,white,blue] turn:"opponent"`（BS08-036-e1/e2） |
| PX08 | Lv1-2 相手のアタックステップ：疲労状態でブロックできる | 既存。`constraint canBlockWhileRested`（BS08-036-e3） |
| PX08 | Lv2 アタック時：BP比較で相手だけ破壊したとき回復し、相手のスピリット1体を疲労 | 既存。`onBattleWin battleRole:"attacker" sequence{refresh self, exhaust count:1}`（BS01-071-e1、BS01-047-e1） |
| PX15 | Lv1-2 召喚時：ボイドからコア3個をこのスピリットに置く | 既存。`onSummon placeCores{from:"void",to:"spirit",target:"self",count:3}`（BS01-065-e1 の count 違い） |
| PX15 | Lv1-2 アタック時：BP合計10000まで相手のスピリットを好きなだけ疲労 | **新規 N6**（`exhaust count:"any" budget:{by:"bp",amount:10000}`。枠は BS09-X35-e3 の destroy と同じ） |
| PX15 | Lv2 アタック時：相手のライフを減らしたとき、このスピリットのコア3個をトラッシュに置くことで回復 | 既存。`fieldEvent ownSpiritDealtLife selfMode:"source"`（BS06-034-e3）＋`pay{cost:removeCores target:"self" to:"trash" count:3, then:refresh self}`（BS12-032-e3 の pay 形） |

## 3. 新しい部品を使う行（まとめ）

| 部品 | 行 |
| :-- | :-- |
| N1 | P035 1行目 |
| N2 | P062 Lv2 |
| N3 | PX13 2行目 |
| N4・N5 | PX13 3行目 |
| N6 | PX15 2行目 |

N3〜N5 は PX13 の 2 行に集中する（このカードは器 3 種で、「新しい器2〜3種まで」の目安いっぱい）。

## 4. 解釈が割れる点（自分では決めていない）

CONJUNCTION.md の早見表（その後＝前後／さらに・し＝同時／ことで＝両方完全に解決できるときだけ／このとき）で照らした。

| # | カード | 論点 | 読み方の候補と影響 |
| :-- | :-- | :-- | :-- |
| 1 | P030 | 「ドローし、〜置く」の「し」は同時（早見表 2 行目）。 | 同時＝`simultaneous`、前後＝`sequence`。引いたカードは置き先に影響しないので結果は変わらない。誘発の割り込みタイミングだけが変わる |
| 2 | P039 | 「相手の合体スピリット1体を破壊。**その後**、この合体スピリットのブレイヴを残しスピリットだけ手札に戻す」。 | (a) 自分の破壊を置換して手札へ（`reviveOnDestroy`。トラッシュに置かれない）。(b) 破壊後に、トラッシュに置かれたスピリットカードを手札へ戻す事後移動。(a) と (b) で、他の破壊時誘発・トラッシュ参照の効果の見え方が変わる。早見表は「その後＝Aが不完全でもB」なので、相手の合体スピリットがいなくても戻す読み。もう1点、「この合体スピリット」が自分自身を指すか（破壊された自分）の確認 |
| 3 | P010 | 「系統：翼竜を持つスピリットが2体以上」にケロロドラゴン自身（翼竜）を数えるか。 | 数える＝自分＋もう1体で成立。数えない＝他に2体必要。P005 は自身が爪鳥なので影響なし。`ownFamilyCountAtLeast` の既存解釈（フィールド全体で数えるなら自身込み）に従うなら「数える」 |
| 4 | P057 | 「相手によって自分のスピリットが破壊されたとき」の「によって」の範囲。 | (a) 相手の効果による破壊だけ（`byOpponentEffectOnly`）。(b) 相手のスピリットとのバトルでの破壊も含む（「お互いのアタックステップ」の限定なので、バトルでの破壊を含む読みが自然）。影響は (b) のほうが大幅に発動機会が多い。「自分のスピリット」にこのスピリット自身（場にいる場合）を含むかも同時に決める |
| 5 | P073・PX16 | 「コストを支払わずに召喚できる」で、「ただし召喚時は発揮されない」の但し書きが**無い**。 | 無い＝召喚時効果は発揮される（BS02・BS05 の既存は但し書きがあるカード）。PX16 のトラッシュから出すカード（魔界七将）や P073 のブレイヴの召喚時を発揮する読みで合っているか。ブレイヴを召喚する P073 は、そのまま合体するかどうかも選ぶか |
| 6 | P050 | 「コア1個ずつをリザーブに置く」に「1個残して」が無い。 | 残さない＝コア1個のスピリットは0個になり消滅（破壊）する。BS14-022 は文に「1個だけになるように」があり `leaveAtLeast:1` を使っている。P050 は付けない読みでよいか（P004 の「疲労している相手のスピリット上のコア1個」も同様に、0個になり得る） |
| 7 | PX13 | 「相手によって自分のスピリットが手札に戻る**とき**」は置換か事後か。 | (a) 戻る直前に誘発（置換に近い）。(b) 戻った後のイベント（`ownSpiritReturnedToHand`）で処理。結果（相手が手札1枚を捨てる）は同じで、戻るスピリットの数え方（同時に複数戻るとき）だけが変わる。(b) で足りるなら新しい種類のタイミングは不要。誰が捨てるかは相手（CHOOSER_RULES.md） |
| 8 | P042 | 「このスピリットの**バトル時**」で、BP比較で相手だけ破壊したとき。 | アタック側でもブロック側でも発動する読み（`onBattleWin` の `battleRole` を省略）か、アタック時だけか。文面は「バトル時」なので両方の読みが自然 |
| 9 | P074 | 「相手はバーストを発動できない」の**期間**。 | 『アタック時』に書かれ、持続の指定が無い。(a) このバトル中（`battleLock burst`）。(b) このターンの間。(c) このアタックステップの間。アタック時の誘発はバトル開始の前なので、(a) の `duration:"battle"` が使えるかを確認（BS15-X03 は『バトル時』）。「ことで」なので、リザーブのコア2個を払えない（2個未満）ときは何も起きない |
| 10 | P062 | 「ブロックされたとき、**相手は**、相手のスピリット1体を疲労させる。」 | 相手が自分のスピリットから選ぶ（`chooserIsTarget`）。BS06-028 と同じ文なので既存の読みに従う。Lv2 のほうは「相手のスピリット1体」を自分が選ぶ。ただし「【暴風：1】」の「1」は疲労させる数ではなく段数なので、`countFromBofu` をそのまま使うと段数1固定になる点の確認 |
| 11 | PX15 | Lv2「相手のライフを減らしたとき、**このスピリットのコア3個**をトラッシュに置くことで回復」。 | このスピリットのコアが3個未満なら払えず何も起きない（早見表 4 行目）。コスト「ことで」の完全解決の読みでよいか。また Lv1-2「BP合計10000まで好きなだけ疲労」は、疲労済みのスピリットを選べるか（選んでも BP 枠を消費するか） |
| 12 | PX13 | 「ブロックしたスピリットのコスト1につき、**ブロックしていない**相手のスピリット上のコア1個」を**誰が**どう振り分けるか。 | 自分の効果なので自分が選ぶ（1個ずつ別のスピリットでも同じスピリットでもよいか）。ブロックしたスピリットが破壊済み・場にいない場合のコストの取り方（N4 の定義）も決める必要がある |
| 13 | P035 | 見出しが「Lv1･Lv2」と「【合体時】Lv2」で、スピリットカードなのに【合体時】を持つ。 | 合体している間（`whileCombined`）だけ有効という読みでよいか。Lv2 限定の行であること |
| 14 | P068 | フラッシュの「さらに」は同時（早見表 2 行目）。2 個目の置き先に名前指定があり、いなければ 1 個目だけ置く。 | 同時なので、1 個目でドルクス・ウシワカを選んで置き先が重なってもよい。名前指定の対象がフィールドにいないとき、1 個目は置くか（早見表の「同時」は分けないため、全体不発の読みもあり得る）。影響は低い |
