# BS22 調査メモ：blue（調査役）
対象：BS22-046・047・048・049・050・051・052・053・054・065・066・072・083・084・X06、X13-06（16枚）。実装はしていない。
手本の効果 id は、効果文を引用したうえで「同じ形」と書いた。

## 1. 集計
| 項目 | 数 |
| :-- | --: |
| 節の数（Lv 見出し／キーワード単独／フラッシュ。合体条件・効果なしは数えない） | 28 |
| 既存の器で書ける | 20 |
| 新しい部品が要る | 8（部品は6件） |
| 連鎖の節（連鎖元は別に数えない） | 4（051・052×2・083） |
| 強化の節 | 1（053 青） |
| 分身 | 0 |

効果なしの BS22-046（取り込み元の効果文が空。§4-1）は節0。

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| N1 | `revealHandCard`（アクション。手札の条件に合う1枚を移動させずに相手に見せ、`lastMoved` に記録する） | `revealOpen` は from が ownDeck／opponentDeck／burst だけ、`peekOpponentHand` は相手の手札を見る側、`moveCards from:"hand"` は動かしてしまう。見せるだけで「見せたカードのコスト」を `sameCostAsLast` に渡す口が無い。pay の cost に置ける（pay の cost は EffectAction） | 049 |
| N2 | TargetFilter `maxCostAsLast`（条件の軸。直前に動いたカードのコスト以下） | `sameCostAsLast` は同コストのみ、`maxCostAsEventTarget` はイベント対象のコスト、`maxCostAsSelf` は self。pay のコストで破壊した自分のスピリットのコストを参照する以下版が無い（`sameCostAsLast` の以下版） | 084 |
| N3 | `spiritEffectsDisabledGrant` に target `bothAll` と `filter`（コスト in・nameExcludes）（条件の軸） | target は ownAll／opponentAll／chosenInstance、絞り込みは familyFilter／keywordExclude だけ。「[海皇子イオン]以外のコスト6/7のスピリットすべて」は両陣営＋コスト＋名前除外（nameExcludes は BS20 N1 で TargetFilter にある） | 049 Lv2 |
| N4 | globalConstraint `braveCostZero`（条件の軸。両陣営の合体スピリットのブレイヴのコストを0として扱う） | `braveBpBonusZero` は BP の加算だけ、`braveStatsAs` はスピリット状態のブレイヴ専用（合体中は対象外）。合体スピリットのコスト（`instAllCosts` のブレイヴ込み合計）からブレイヴ分を引く口が無い。054 は同じ中身を「この効果の間」だけ使う（§4-4） | 050・054 |
| N5 | `costMod`（加算）の絞り込みに「元コストが in の一覧」と「cardType 複数（スピリット／ブレイヴ）」（条件の軸） | 加算の costMod は colorFilter／cardType（1種）／side だけ。`costFilter` {max,min} は置換（mode:"set"）側のみ。「コスト0/3/4のスピリットカード/ブレイヴカード」は離れた3値と2種別 | 072 |
| N6 | `effectGrant` に `filter`（コストmin・合体していない）（条件の軸） | effectGrant の絞り込みは nameIncludes／colorFilter／familyFilter／keywordFilter／phaseTurn／whileCombined だけ。`keywordGrant` には `costFilter`・`uncombinedFilter` があるが、効果（アタック時の破棄）を配る側には無い。BS21 の familyGrant の受取側 filter（N8）と同じ穴 | X06 Lv2-3 |

## 3. カードごとの表
手順書で決まるもの：連鎖は BS19_PLAN §2.1・§2.15、強化は §2.1（青：Q757・Q764・Q766）。

### BS22-046 薬売りのカーサ（スピリット 0コスト 創手）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| （効果文なし） | 効果なし | `effects: []`。§4-1 |

### BS22-047 アトラック・ナチャ
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･2『自分のターン』系統「無魔」の自分のスピリットすべてのLvを1つ上のものとして扱う | 既存 | `levelAs`。手本 BS16-071-e2「系統：「海首」を持つ自分のスピリットすべてのLvを、1つ上のものとして扱う」＝`{"kind":"levelAs","target":"ownSpiritsByFamily","familyFilter":"海首","treatAs":{"plus":1},"phase":"attack"}`。同じ形で familyFilter を無魔、`phase` を外して `turn:"own"`（SD02-005-e2 に `turn:"own"` の書き方）。levels は [1,2]（`sourceLevels`／levels の置き方は BS19-095-e2 `"sourceLevels":[2]` を参照） |

### BS22-048 熱血巨人ディーン
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1-3『相手のアタックステップ』相手のスピリットがアタックしたとき、相手のデッキを上から1枚破棄／そのカードがスピリットカードなら回復 | 既存 | fieldEvent `anySpiritAttacked`（`subjectSide:"opponent"`,`turn:"opponent"`,`selfMode:"source"`）＋ sequence［discard from deck side opponent count1 → if `last.cardType:["spirit"]` then `refresh target self`］。手本 BS11-071-e2「自分のスピリットがアタックしたとき、相手のデッキを上から1枚破棄する。そのカードがコスト3以下のとき、相手のスピリット1体を疲労させる」＝`{"event":"anySpiritAttacked","action":{"type":"sequence","actions":[{"type":"discard","from":"deck","side":"opponent","count":1},{"type":"if","cond":{"last":{"cost":{"max":3}}},"then":{"type":"exhaust","count":1}}]}}`、BS04-037-e2「コスト1以下の相手のスピリットがアタックしたとき、このスピリットは回復する」＝`{"event":"anySpiritAttacked","turn":"opponent","subjectFilter":{"cost":{"max":1}},"selfMode":"source","action":{"type":"refresh","target":"self"}}`、条件の `last.cardType` は BS14-111-e1 `{"last":{"cardType":["spirit","brave"]}}` |

### BS22-049 海皇子イオン
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･2『召喚時』手札のスピリット/ブレイヴ1枚を相手に見せることで、そのカードと同じコストの相手のスピリット1体を破壊 | 新（N1） | `triggered onSummon`＋`pay`{cost: **revealHandCard**(cardType spirit/brave), then: `destroy count1 filter{sameCostAsLast:true}`}。手本 BS11-045-e2「その破棄されたカードと同じコストの相手のスピリット1体を破壊する」＝`[discard…,{"type":"destroy","count":1,"filter":{"sameCostAsLast":true}}]`、pay の形は BS13-051-e1。両方が解決できるときだけ（COST_MODEL §1）＝同じコストの相手スピリットがいなければ、そのカードは選べない |
| Lv2 [海皇子イオン]以外のコスト6/7のスピリットすべての効果は発揮しない | 新（N3） | `spiritEffectsDisabledGrant`（両陣営・filter cost.in [6,7]・nameExcludes [海皇子イオン]）。手本 BS20-009-e4／BS12-081-e2 は spiritEffectsDisabledGrant だが自分側／相手側のみ。「Lv2 のとき」は levels [2]。§4-2 |

### BS22-050 海皇帝アイヴァン
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1-3 お互いの合体スピリットのブレイヴすべてをコスト0として扱う | 新（N4） | globalConstraint `braveCostZero`（両陣営）。手本は `braveBpBonusZero`（P054-e2「相手の合体スピリットすべての「合体時BP+」を0として扱う」＝`{"kind":"globalConstraint","constraint":{"type":"braveBpBonusZero","side":"opponent"}}`）の形 |
| Lv1-3『このスピリットのバトル時』コスト3/4の相手のスピリット1体を破壊 | 既存 | `triggered`／`onBattleStart`＋`destroy count1 filter{cost:{in:[3,4]}}`。手本 P038-e1「…破壊する」＝`{"trigger":"onBattleStart","eventTarget":"ignore","action":{"type":"destroy","count":1,"filter":{"exactBp":"selfBp"}},"optional":false}` の形（filter だけ cost in。`cost.in` は TargetFilter にある） |
| Lv2･3『お互いのアタックステップ』コスト6/7のスピリットすべてはアタック/ブロックできない | 既存 | globalConstraint `cantAttackByCost{costs:[6,7]}` ＋ `cantBlockByCost{costs:[6,7]}`、`phase:"attack"`,`turn:"both"`。手本 SD03-009-e4「コスト4以下のスピリットはアタックできない」＝`{"kind":"globalConstraint","phase":"attack","turn":"opponent","constraint":{"type":"cantAttackByCost","costs":[0,1,2,3,4]}}`、BS17-071-e1「コスト0/3/6のスピリットはブロックできない」＝`{"constraint":{"type":"cantBlockByCost","costs":[0,3,6]}}`（両陣営）。コスト6/7の判定は N4 のあとの合体スピリットのコスト |

### BS22-051 ピューマウロス
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･2『召喚時』コスト4の相手のスピリットすべてを破壊 | 既存 | `triggered onSummon`＋`destroy all:true filter{cost:{in:[4]}}`（side 既定は相手）。手本 BS19-114-e1「…コスト5/8/11のバースト持ちを破壊」＝`{"type":"destroy","all":true,"filter":{"cost":{"in":[5,8,11]},"hasBurst":true}}` |
| 連鎖（条件 白×1）[白]：相手のスピリット1体を手札に戻す | 既存 | 連鎖元の action と同じ `triggered` の `sequence` 末尾に `if{count:{ownColorSymbols:"white"},atLeast:1} then return to hand count1`、`keyword:"rensa"`。手本 BS21-080-e1（`"keyword":"rensa"`＋`sequence[…,{"type":"if","cond":{"count":{"ownColorSymbols":"green"},"atLeast":1},"then":{"type":"exhaust","count":1}}…]`）。連鎖元（破壊）が空振りでも連鎖は発揮（Q773） |

### BS22-052 古剣使ティグリス（剣使・異合）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1-3『自分のアタックステップ』コスト5の自分のスピリットすべてをBP+4000 | 既存 | `aura` bp ownAll `costFilter:5`,`amount:4000`,`phaseTurn{attack,own}`。手本 BS02-076-e3（`"costFilter":2,"battlingOnly":true`…）と BS14-062-e2 の phaseTurn。costFilter は auraDef の一致指定 |
| 【合体時】Lv2･3『合体アタック時』バースト効果を持つ相手のスピリット1体を破壊 | 既存 | `triggered`／`onAttack`＋`whileCombined:true`＋`destroy count1 filter{hasBurst:true}`。手本 BS15-034-e3「バースト効果を持たない相手のスピリット1体を手札に戻す」＝`{"action":{"type":"return","to":"hand","count":1,"filter":{"hasBurst":false}}}`、合体アタック時は BS17-057-e2 の `trigger:"onAttack","whileCombined":true` |
| 連鎖（条件 緑×1）[緑]：相手はバーストを発動できない | 既存（連鎖） | 『合体アタック時』の続き：`if{ownColorSymbols green ≥1} then timedEffect[playerRule noBurstActivation] duration "battle" side "opponent"`。手本 BS20-004-e2「[青]：相手は白のマジックカードを使用できない」＝`{"type":"timedEffect","content":[{"type":"playerRule","rule":{"type":"cantUseMagicForPid","colors":["white"]}}],"duration":"battle","side":"opponent"}`、noBurstActivation は BS21-072-e2 の `playerRule`。そのアタックの間（BS19_PLAN §2.15）。§4-5 |
| 連鎖（条件 白×1）[白]：ネクサスの色1色を指定できる。指定した色の相手のネクサスすべてを手札に戻す | 既存（連鎖） | `if{ownColorSymbols white ≥1} then declare what:"color" from:"nexuses" fromSide:"opponent" then{return to hand nexus:"only" all:true filter{declared:"match"}}`。手本 BS17-074-e1「ネクサスのカード名1つを指定…」＝`{"type":"declare","what":"name","from":"nexuses","fromSide":"opponent","then":{"type":"destroy","nexus":"only","count":1,"all":true,"filter":{"declared":"match"}}}`（what だけ color）、ネクサスを戻す `{"type":"return","to":"hand","nexus":"only","count":1,"all":true}` は BS21-080-e1。「指定できる」＝任意（`optional`）。§4-6 |

### BS22-053 災将ナグリアス
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･2【強化】（青）自分の「相手へのデッキ破棄効果」の枚数を+1枚する | 強化（青） | `{"kind":"keyword","keyword":"kyoka","kyoka":"deckMill","levels":[1,2]}`（SD16-002-e1「Lv1･Lv2【強化】アルティメット以外の自分の「相手へのデッキ破棄効果」の枚数を+1枚する」と同じ形） |

### BS22-054 インペリアル・ハイドラ
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1-3『召喚時』お互いの合体スピリットのブレイヴすべてをコスト0として扱い、コスト4/6/7の中からコスト1つを指定する。指定したコストのスピリットすべてを破壊する。この効果で破壊したスピリットの効果は発揮されない | 新（N4）＋既存 | sequence［（N4 を「この効果の間」だけ。§4-4）→ `declare what:"cost" options:[4,6,7] then destroy all:true anySide:true filter{declared:"match"} suppressOnDestroy:true`］。手本 P043-e2「コスト3/4を指定…」＝`{"type":"declare","what":"cost","options":[3,4],"then":…}`、BS19-068-e1 の `destroy…filter{"declared":"match"}`、BS15-008-e1 の `all:true,anySide:true`、BS17-073-e1「この効果で破壊したスピリットの『このスピリットの破壊時』効果は発揮されない」＝`{"type":"destroy","count":1,"filter":{"maxBp":4000},"suppressOnDestroy":true}`。§4-3 |
| Lv2･3『自分のアタックステップ』系統「闘神」/「海首」の自分のスピリットがアタックしたとき、相手のバースト1つの内容を見て、コスト6以上のカードのとき破棄 | 既存 | fieldEvent `anySpiritAttacked` `subjectSide:"own"`,`subjectFilter{family:[闘神,海首]}`,`phase:"attack"`,`turn:"own"`＋sequence［revealOpponentBurst → if `last.cost.min 6` then `discard from burst side opponent`］。手本 BS18-084-e2「相手のバースト1つをオープンする。そのカードがスピリットカードのとき破棄する」＝`{"type":"sequence","actions":[{"type":"revealOpponentBurst"},{"type":"if","cond":{"last":{"cardType":"spirit"}},"then":{"type":"discard","from":"burst","side":"opponent"}}]}`。「見て」と「オープン」の差は §4-7 |

### BS22-065 ブル・アームズ（ブレイヴ）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| 合体条件：コスト5以上 | 合体条件 | `braveCondition`（BS20-066 などと同じ） |
| 【合体時】『このスピリットのバトル時』相手の合体スピリットとバトルしている間、このスピリットをBP+10000 | 既存 | `triggered onBattleStart`＋`whileCombined`＋`condition{battleOpponentMatches:{combined:true}}`＋`timedEffect[bp 10000] duration "battle" target self`。手本 BS11-X02-e3「相手の合体スピリットとバトルしたとき、このスピリットをBP+10000する」＝`{"trigger":"onBattleStart","eventTarget":"use","condition":{"battleOpponentMatches":{"combined":true}},"action":{"type":"timedEffect","content":[{"type":"bp","amount":10000}],"duration":"battle","target":"self"}}`。「している間」の読みは §4-8 |

### BS22-066 コーラル・ジャガー（ブレイヴ）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1『このブレイヴの召喚時』最もコストの低い相手のスピリット1体を破壊 | 既存 | `triggered onSummon` levels [1]＋`destroy count1 lowestCost:true`。手本 BS12-084-e1「相手のフィールドで最もコストが低いスピリット1体を破壊する」＝`{"type":"destroy","count":1,"lowestCost":true}`、ブレイヴの召喚時は BS10-070-e1 の `onSummon` levels [1]。同コストが複数なら使う側が選ぶ（BS19_PLAN §2.2 X01 の読み） |
| 合体条件：コスト5以上 | 合体条件 | `braveCondition` |

### BS22-072 アトライア海帝国（ネクサス）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･2『お互いのメインステップ』お互い、コスト0/3/4のスピリットカード/ブレイヴカードを召喚するとき、1コスト余分に支払う | 新（N5） | `costMod` 加算 amount 1（両陣営＝side 省略）`phaseTurn{main,both}`＋ cost in [0,3,4]・cardType スピリット/ブレイヴ。手本 BS04-085-e1「相手はスピリットを召喚するとき、1コスト余分に支払わなければならない」＝`{"kind":"costMod","cardType":"spirit","side":"opponent","amount":1,"phaseTurn":{"phase":"main","turn":"opponent"}}`。§4-9 |
| Lv2『相手のメインステップ』相手は、コスト6/7のスピリットカード/ブレイヴカードを召喚するとき、3コスト余分に支払う | 新（N5） | 上と同じ部品で `side:"opponent"`,`amount:3`,`phaseTurn{main,opponent}`、cost in [6,7] |

### BS22-083 アビスブレイク（マジック）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| フラッシュ：コスト4以下の相手のスピリット1体を破壊。この効果は、メインステップで使えない | 既存 | `magic timing:"flash" mainForbidden:true` ＋ `destroy count1 filter{cost:{max:4}}`。手本 BS18-084-e2「…この効果は、メインステップで使えない」＝`{"kind":"magic","timing":"flash","mainForbidden":true,"action":…}` |
| 連鎖（条件 白×1）[白]：相手のバースト1つを破棄 | 既存（連鎖） | 同じ magic の sequence 末尾に `if{ownColorSymbols white ≥1} then discard from:"burst" side:"opponent"`、`keyword:"rensa"`。手本 BS21-080-e1（マジックの連鎖。「相手のネクサスすべてを手札に戻す」＋連鎖）の形、burst の破棄は BS18-084-e2 の `{"type":"discard","from":"burst","side":"opponent"}` |

### BS22-084 レゾリューション（マジック）
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| フラッシュ：合体していない自分のスピリット1体を破壊することで、そのスピリット以下のコストの相手のスピリット1体を破壊する | 新（N2） | `magic timing:"flash"`＋`pay`{cost: `destroy side:"own" count1 filter{combined:false}`, then: `destroy count1 filter{maxCostAsLast:true}`}。手本 BS10-105-e1「コスト3以上の自分のスピリット1体を破壊することで、ボイドからコア3個を…」＝`{"type":"pay","cost":{"type":"destroy","side":"own","count":1,"filter":{"cost":{"min":3}}},"then":…}`、`combined:false` は BS10-070-e2 の `subjectFilter{combined:false}`、then の参照は BS11-045-e2 の `sameCostAsLast`（以下版が N2） |

### BS22-X06 海皇巨神デュランザム
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1-3【大粉砕】『アタック時』相手のデッキを上から、Lv1につき5枚破棄し、バースト効果を持つカードが破棄されたとき、相手のスピリット1体を破壊 | 既存 | BS15-X06-e2／e3 と同じ。手本 BS15-X06 の効果文「Lv1･Lv2･Lv3【大粉砕】『このスピリットのアタック時』相手のデッキを上から、このスピリットのLv1につき5枚破棄し、バースト効果を持つカードが破棄されたとき、相手のスピリット1体を破壊する」（**同一文**）。`{"kind":"keyword","keyword":"daifunsai","levels":[1,2,3]}`＋`{"kind":"triggered","trigger":"onAttack","action":{"type":"sequence","actions":[{"type":"discard","from":"deck","side":"opponent","count":5,"countCounter":"selfLevel"},{"type":"if","cond":{"last":{"hasBurst":true}},"then":{"type":"destroy","count":1}}]}}`。【強化】（青）が効く |
| Lv1-3 系統「闘神」を持つ自分のスピリットすべてをBP+5000 | 既存 | `aura` bp ownAll `familyFilter` 闘神 amount 5000。手本 BS14-062-e2 の aura 形（`keywordsFilter` の代わりに family）。phaseTurn なし（常時） |
| Lv2･3 系統「闘神」を持つコスト5以上の自分の合体していないスピリットすべてに【大粉砕】を与える | 新（N6） | `keywordGrant daifunsai`（familyFilter 闘神・`costFilter{min:5}`・`uncombinedFilter:true`。これは既存＝SD16-008-e2「系統：「闘神」を持つ自分のスピリットすべてに“【粉砕】…”を与える」＝`{"kind":"keywordGrant","keyword":"funsai","target":"ownAll","familyFilter":"闘神"}`）＋ 本体の効果は `effectGrant{keywordBody:"daifunsai", granted:{onAttack: 上の sequence}}`（BS19 の【聖命】付与と同じ作り）で、effectGrant に N6 の filter が要る。**【大粉砕】は keyword 宣言だけで読む側が無い（CLAUDE.md の実行時カバレッジの節）ので、配る先で破棄と破壊が起きるには本体の付与が要る**。§4-10 |

### BS22-X13-06 機動大帝アレク・キャッスル
| 節 | 仕分け | 使う器 |
| :-- | :-- | :-- |
| Lv1･2【強襲：2】『アタック時』ターンに2回まで、自分のネクサス1つを疲労させることで回復できる | 既存 | `{"kind":"keyword","keyword":"kyoshu","count":2,"levels":[1,2]}`。手本 BS14-066 の効果文「Lv1･Lv2･Lv3【強襲：2】『このスピリットのアタック時』このスピリットは、ターンに2回まで、自分のネクサス1つを疲労させることで回復できる」（**同一文**）、EX006-e2／EX023-e1 の `kyoshu` count |
| Lv2『アタック時』自分の青のシンボル1つにつき、相手のデッキを上から1枚破棄 | 既存 | `triggered onAttack` levels [2]＋`discard from deck side opponent count 1 countCounter {ownColorSymbols:"blue"}`。手本 BS08-X34-e2「…自分の青のシンボル1つにつき+1枚する」（粉砕の加算）とカウンタ `ownColorSymbols`（effectCounter.ts）、`discard count:1,countCounter` は BS15-X06-e1 の形。青シンボル0なら破棄0（強化は0枚に足さない：BS19_PLAN Q766） |

## 4. 効果文から決められない点
1. **BS22-046 の効果文が空**。取り込み元（staging）の `effect` が空。Lv1・Lv2 のデータだけある 0コストのスピリットで、効果が本当に無いのか、取り込みの欠けかは staging だけでは分からない。（引いた語：創手。同系統の既存カードに空効果は無い／当たり無し。実カードのページで確かめる必要）
2. **049 Lv2「コスト6/7のスピリットすべての効果は発揮しない」の範囲**：両陣営・イオン自身を除く／Lv の効果すべて（常在・誘発・フラッシュの起動）が止まる、と読む。止まる効果に「召喚時」を含むか（召喚前に判定？）：Lv2 の間コスト6/7のスピリットを召喚しても『召喚時』は発揮しない、と読む。別の読み＝すでに場にいるものだけ。（引いた語：発揮しない／発揮されない → BS04-086 古代闘技場「相手のスピリットすべての『このスピリットの召喚時』効果は発揮されない」は召喚される側に掛かる。当たりは近いが、効果すべてを止める「両陣営＋コスト」の手本は無い）
3. **054 の「この効果で破壊したスピリットの効果は発揮されない」**：手本 BS17-073 は『このスピリットの破壊時』効果だけ（`suppressOnDestroy`）。054 は「効果」全般。破壊時効果だけ止めるなら `suppressOnDestroy` で足りる。【不死】や「破壊されたとき手札に戻る」のような、そのスピリット自身が持つ「破壊されたとき」の置き換えも止めるかで結果が変わる。止める読み＝別の器が要る。（引いた語：発揮されない／suppressOnDestroy／当たり無し）
4. **054 の「コスト0として扱い」の期間**：効果文は期間を書かない。読み(a)この効果の解決の間だけ（指定から破壊までのコスト判定にだけ効く）、読み(b)ターン終了まで、読み(c)ずっと（050 のように場にいる間）。(a) なら N4 を「効果の解決中だけ」使う口（timedEffect の duration に該当する値が無い）が追加で要る。（引いた語：として扱い／当たり無し。`timedEffect.duration` は turn／battle／nextRefresh／step／firstAttack／beforeBlock）
5. **052 [緑]「相手はバーストを発動できない」の期間**：『合体アタック時』の続きなので、そのアタックの間（BS19_PLAN §2.15 の 025・BS20 004 [青]）と読み `duration:"battle"` で書く。そのバトルに入る前（ブロック宣言前）に発動するバーストは止まるか：アタック宣言の誘発の列で連鎖が解決された後の、ブロック宣言前のバーストも「そのアタックの間」に含む、と読む。別の読み＝バトル開始から。（引いた語：発動できない／BS15-X03・BS17-057 は battleLock の battle。当たりあり／アタック全体かバトルかは手順書に明記なし）
6. **052 [白]「ネクサスの色1色を指定できる」**：指定するのは使う側、候補は相手のネクサスにある色に限らない任意の1色と読む（`declare` は場の色から選ぶので実質同じ）。空振り（どの色も無い）でも連鎖は終わる。「できる」＝確認式で、断ってよい（BS19_PLAN §2.15 の連鎖元「できる」と同様に連鎖側の任意）。（引いた語：指定できる／SEMANTICS_AUDIT「〜できるは確認式」）
7. **054 Lv2･3 の「内容を見て」**：非公開に見る（`peekOpponentBurst`＝持ち主だけが見る、`lastMoved` に載らない）か、オープン（`revealOpponentBurst`＝両者に公開、`last` で判定できる）か。結果（コスト6以上なら破棄）は同じ。違いは、相手が自分のバーストが見られたことを知るか、バーストの「オープンされたとき」を持つ効果が誘発するか。プールにオープン時の誘発は無いので `revealOpponentBurst` で書く。`peekOpponentBurst` で書くなら、見た結果を `last` に渡す小さな追加が要る。（引いた語：内容を見て／BS17-049-e3 `peekOpponentBurst`＝見るだけ、BS18-084-e2＝オープン）
8. **065「相手の合体スピリットとバトルしている間」**：BS11-X02 は「バトルしたとき」（バトル開始時に一度判定し、そのバトルの間 BP+）。065 は「している間」で、バトル開始の瞬間に相手が合体スピリットなら、そのバトルの間 BP+10000 と読む。バトルの途中で相手が合体でなくなったら止まるか（継続判定）：止めない（一度判定）。別の読み＝継続判定。（引いた語：バトルしている間／当たり＝BS11-X02-e3 のみ）
9. **072「コスト0/3/4のスピリットカード/ブレイヴカードを召喚するとき」のコスト**：印刷コスト（記載コスト）で判定し、軽減や他の加算の前のコストを見る、と読む。ブレイヴカードも対象（スピリット状態で出すときも合体召喚のときも）。別の読み＝軽減後のコストで判定。（引いた語：余分に支払わなければならない／BS01-100・BS04-085・SD02-013 は記載コスト。SD02-013 は `maxCost` が記載コスト＝costMod の `costFilter` 置換側も「元コスト」。同じ読み）
10. **X06 Lv2-3「【大粉砕】を与える」で与えるもの**：キーワードだけか、アタック時の破棄と破壊の効果まで含むか。SD16-008 の【粉砕】付与は効果文で効果本体を書いている（“【粉砕】『…』…を与える”）ので本体ごと与える。X06 の文は【大粉砕】の名前だけで、【大粉砕】の本体は X06 自身の Lv1 の文に書かれた「Lv1につき5枚破棄し、バースト効果を持つカードが破棄されたとき、相手のスピリット1体を破壊」と同じ、と読む。この読みなら与えられた側のスピリットも、Lv に応じて 5枚×Lv のデッキ破棄と、バースト持ちが破棄されたときの破壊を行う（Lv1 の闘神なら5枚）。別の読み＝名前の宣言だけ（参照する効果にだけ効き、破棄は起きない）。（引いた語：大粉砕／BS15_PLAN 14 は【大粉砕】の効果を X06 で定義。他に与える手本は無い／当たり無し）
