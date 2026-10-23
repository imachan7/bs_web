# BS18 調査メモ：緑・白（調査役）

対象 32 枚：BS18-019〜036, 057, 058, 065〜068, 077〜080, X03, X04, X012D, X012E。実装はしていない。元データ：`data/staging/BS18.json`。
019・028 はバニラ（効果文なし。節に数えない）。

## 1. 集計

- 節数：61（バニラ 2 枚を除く）
- 既存の器で書ける：43
- 既存の器だが実カードの前例が無い（型・実装は実在、`data/cards` に同じ書き方なし）：3（表では「既存*」）
- 新しい部品が要る：15 節（部品は下の 14 個）

### 新しい部品の候補

| # | 足りない部品（種類／差し込み先） | 対象 | 組み合わせで書けない理由 |
| :-- | :-- | :-- | :-- |
| P1 | 軸：バースト発動の封じを**バースト条件の種類別**に（`globalConstraint` に `noBurstActivationByEvent`。判定は `logic/keywords/burst.ts` の発動可否）。ゲートは「系統：雄将の自分のスピリットがアタック中」 | 022, 023 | 既存の `battleLock{lock:"burst"}` は**全バースト**を塞ぐだけで、条件種別（相手のスピリットのアタック後／相手による自分のスピリット破壊後）で絞れない。`noBurstEffectForPid` は「解決を飛ばす」で別物（022/023 は発動不可） |
| P2 | `globalConstraint` に `noDeckMill`（両陣営・常時・自分の効果と支払いも止める） | 025, 031 | 既存は `noDeckMillInMain`（メインステップ限定）と `noDeckMillByOpponent`（持ち主だけ守る）のみ。「お互い・いつでも」が無い。`mill.ts:127` の `noDeckMillInMain` 判定から phase 条件を外した兄弟 |
| P3 | 軸：`TargetFilter.color` の複数色 OR（緑/青） | 027 | `TargetFilter.color` は単色。複数色 OR は `CardPick.color`（配列）にしか無く、場のスピリット選択（`returnToDeckBottom` の filter）では使えない |
| P4 | 規則：`playerRule` に「ターンに1回以上アタックしなければならない（誰でもよい）」 | 029 | 既存 `mustAttack` は**個々のスピリット**への義務（BS08-076「相手のコスト3以下すべて」）。「プレイヤーとして1回以上」は、アタック可能なスピリットのどれでもよく、義務の主体が違う |
| P5 | 軸：`keywordGrant` に `uncombinedFilter`（`auraDef` には既にある同名軸） | 031 | `keywordGrant` には `combinedFilter`（合体中のみ）しかなく、逆の「合体していない」が無い |
| P6 | 軸：`burst` に `destroyedFamilyFilter`（既存 `destroyedColorFilter`／`destroyedMinBp` の系統版） | 034 | 破壊されたスピリットの系統でバースト召喚を絞る軸が無い。`if` で包むにも破壊イベントの系統参照が無い |
| P7 | 規則：アタック対象の強制指定（`constraint` に「コスト◯以上の相手のスピリットは、アタックするとき発生源を指定しなければならない」） | 035 | 既存 `canDirectAttack{targetFilter}` は「指定してアタックできる」（許可）で、強制はできない。`mustAttack` は「アタックする」義務で、対象を縛らない |
| P8 | 軸：`triggered.condition` に `targetMinCost`（`onBlock` 用。既存 `targetMinBp`／`targetMaxCost` の対） | 035 | 「コスト6以上の相手のスピリットをブロックしたとき」。`onBlock` の条件にコスト下限が無い |
| P9 | 軸：`summonFromHandFree` に `symbolCount`（シンボル数の絞り込み） | 057 | `TargetFilter.symbolCount` は場のスピリット用。手札から召喚するカードの絞り込み（`costFilter`／`colorFilter` 等）にシンボル数が無い |
| P10 | 軸：`BraveConditionTerm` に `minSymbols`（合体先のシンボル数） | 057 | 合体条件が family／コスト／名前／バニラ／キーワードしか持たない |
| P11 | タイミング：`timedEffect` の `playerRule` に持続条件（「相手の手札が6枚以上の間」だけ有効） | 078 | `noBurstEffectForPid` は期間（turn）でしか区切れない。解決時の1回判定（`if`）では「手札が増減して6枚を跨ぐ」に追従しない |
| P12 | 軸：`exhaust` の `count:"any"`（好きなだけ） | 080 | `exhaust` は `count:number`＋`upTo` のみ（`removeCores` には `"any"` がある）。上限を大きな数にする代用もできるが、候補数に追従しない |
| P13 | 軸：`TargetFilter` に `notInBattle`（バトルしていない） | 080 | `inBattle`（している）はあるが否定形が無い。`excludeIds` は内部用 |
| P14 | 軸：`heavyArmor` の `colorsFrom:"opponentFieldSymbols"`（【重装甲：∞】） | X04 | `colorsFrom:"opponentFieldSymbols"` は `armor` 専用（`state/continuous.ts:299`）、`heavyArmor` は `selfColors` だけ。ブレイヴを含む重装甲版が無い |

P1 と P2 は 2 枚ずつで共用。P12 と P13 は 080 の 1 節に両方要る。

## 2. 確認事項（私はこう読みました → 確認したい）

1. **022／023「アタックしている間、相手は、バースト条件が【…】のバーストを発動できない」** → 「雄将」を持つ自分のスピリットのアタック宣言から、そのバトルの終了までの間、相手はその条件種別のバーストを**発動できない**（カードは伏せたまま残る）。他の条件のバーストは影響なし、と読みました。複数枚あっても重ならない。→ この読みでよいか。
2. **025／031「お互いのデッキは破棄されない」** → 自分の【粉砕】やコスト支払いによる破棄も含め、両陣営のいかなる破棄も起きない（`noDeckMillInMain` と同じ「陣営を問わない」）、常時（ステップを問わない）、と読みました。【粉砕】は破棄 0 枚でも効果は発揮される扱い。→ 【粉砕】が空振りで成立する扱いでよいか。
3. **027 召喚時「この効果で疲労したスピリットは回復しない（このターンの間）」** → バースト召喚は相手のターンに起きるので、そのターンが終わるまで、**効果による回復**を受けない（リフレッシュステップは次の相手ターンで、この制約の外）。耐性などで疲労しなかったスピリットは対象外。既存の `noRefreshUntilOwnEndSteps:1`（持ち主のエンドステップで解除）で書ける見込み。→ 「このターンの間」を、相手のターン終了まで効果による回復を止める、でよいか。
4. **029「相手は、可能ならば必ずターンに1回以上アタックする」** → 相手がアタックできるスピリットを持つなら、そのターンのアタックステップ中に**どのスピリットででも**1回以上アタックしなければならない（各スピリットに義務ではない）。アタックできるスピリットが1体もいなければ免除。→ 各スピリットに「必ずアタック」（BS08-076 型）ではなく、プレイヤー単位の「1回以上」でよいか。
5. **033「疲労状態の相手のスピリット2体までを指定する」** → 指定する時点（相手のスタートステップ）で疲労状態のものだけ。0〜2体、次のリフレッシュステップでだけ回復できない（その後は通常どおり）。BS11-055 の複数体版と読みました。→ 「2体まで」は 0 体でもよいでよいか。
6. **035「コスト6以上の相手のスピリットすべては、アタックするときこのスピリットを指定してアタックしなければならない」** → 既存の「スピリットを指定してアタック」（BS11-X01、`canDirectAttack`）と同じ処理で、相手のコスト6以上のスピリットはアタックのたびに**このスピリットを対象に指定**する（ライフへのアタックを選べない）。このスピリットが疲労状態でも指定対象になる、と読みました。→ アタックの対象に疲労状態のスピリットを指定してよいか。ライフ狙いのアタックが完全に封じられる、でよいか。
7. **066 Lv1「相手のスピリットが回復したとき、自分のスピリット1体を回復させる」** → 相手の**リフレッシュステップでの回復も含む**。回復した相手スピリット 1 体ごとに 1 回誘発する。→ 相手のリフレッシュステップで、回復した体数ぶん自分のスピリットを回復できる、でよいか（強い読み）。Lv2「ドローステップ以外で相手の手札が増えたとき」は、効果で手札に加わるたびに 1 回、相手が選んで 1 枚破棄。
8. **078「さらに、相手の手札が6枚以上の間、相手のバースト効果は発揮されない」** → 「このターンの間」が後半にも掛かる。解決時の1回判定でなく、そのターンの間、**手札が6枚以上のときだけ常時**効く（手札が減れば発揮される）。前半の「手札1枚につき BP+1000」も同じく手札の増減に追従。→ 常時判定でよいか（P11 の要否が変わる）。
9. **079 フラッシュ「この効果で回復したスピリットはアタックできない」** → 指定した自分のスピリットがもともと回復状態で実際には回復しなかったときは、アタック不可は付かない（BP+2000 は「そのスピリット」に付く）。→ 回復状態の対象を選んだ場合の扱いでよいか。
10. **080 キズナブレード「疲労させたスピリットすべてのBP合計」** → 疲労済みのスピリットも「疲労させる」の対象に選べる（確定済み）が、**BP合計は実際に回復状態から疲労状態になった個体の分だけ**。0 体疲労なら BP+0 で解決。BP+ する「自分のスピリット1体」は疲労させたスピリット自身でもよい。→ 疲労済みを選んだ分は合計に入れない、でよいか。
11. **057 召喚時「シンボル2つを持つスピリットカード」** → ちょうど 2 つ（既存の `symbolCount` と同じ。BS12 初出）。合体条件「シンボル2つ以上」は 2 つ以上。→ 3 つ以上のスピリットは召喚対象外でよいか。
12. **034 バースト「このバースト発動時に系統：「機獣」を持つスピリットが破壊されていたら」** → 同時に破壊された自分のスピリットのうち 1 体でも「機獣」を持てば成立（BS14-061 の色版と同じ）。**034 フラッシュ**「バトルしている相手のスピリット」＝ブロック中の相手のアタッカー。コスト（このスピリットのコア 1 個をトラッシュ）が払えないときは不発。
13. **X04 Lv2･Lv3「このスピリットが相手のスピリットを破壊したとき」（『バトル時』）** → 「BPを比べ相手のスピリットだけを」の限定が無いので、相打ち（自分も破壊された）でも、このスピリットが相手を破壊していれば発揮される、と読みました（BS14-033 と同形）。→ 相打ちでも発揮でよいか。
14. **026 Lv2「系統：「雄将」を持つ自分のスピリット1体につき」** → このスピリット自身が「雄将」なら自身も数える（解決時に数える）。→ 自身を含むでよいか。

## 3. カードごとの表

凡例：既存＝同じ書き方の実カードあり／既存*＝型・実装はあるが実カード無し／新規＝足りない部品あり。

### BS18-020 ブフモット
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『破壊時』BP4000以下の相手2体を疲労 | 既存 | `triggered onDestroy`（BS11-001）＋`exhaust count:2 filter:{maxBp:4000}`（BS06-048 の count:2） |

### BS18-021 駿将ムカリ
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv2『自分のAS』雄将がアタックしたとき void→リザーブ1 | 既存 | `fieldEvent anySpiritAttacked`＋`familyFilter`＋`phase:attack turn:own`（BS16-054／BS17-005）＋`placeCores void→reserve`（BS02-034） |

### BS18-022 駿将チラウン
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3『自分のAS』雄将アタック中、相手は【相手のスピリットのアタック後】バーストを発動できない | 新規 | P1（`battleLock burst` は全バースト封じ。条件種別別が無い） |

### BS18-023 駿将ボオルチュ
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1･Lv2『自分のAS』雄将アタック中、相手は【相手による自分のスピリット破壊後】バーストを発動できない | 新規 | P1（イベントは `ownSpiritDestroyed`＋`byOpponentEffectOnly`。022 と同じ部品） |

### BS18-024 駿将ボロクル
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1-3『自分のAS』雄将の自分のスピリットすべて BP+2000 | 既存 | `aura bp target:ownAll familyFilter phaseTurn{attack,own}`（BS02-054） |

### BS18-025 大怪虫リオック
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1･Lv2 お互いのデッキは破棄されない | 新規 | P2 |
| Lv1･Lv2『アタック時』void→自分のスピリットにコア1 | 既存 | `triggered onAttack`＋`placeCores void→spirit`（BS06-029 の onSummon 版を trigger だけ替える） |

### BS18-026 大首長ジャムカ
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『自分のAS』雄将はBPを比べ相手のスピリットだけを破壊したとき回復 | 既存 | `battleWon role:any winnerFamilyFilter:["雄将"] action:refreshSelf`（BS07-060 e3） |
| Lv2『アタック時』ライフを減らしたとき、雄将1体につき相手1体を疲労 | 既存 | `triggered onLifeDealt`（BS06-036）＋`exhaust count:1 countCounter:{ownFamily:"雄将"}`（BS12-038 の ownFamily、BS10-029 の exhaust countCounter） |

### BS18-027 翼の覇獣スパ・ルーダ
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| 【バースト：相手の召喚時発揮後】コスト5以上の自分の緑/青のスピリット1体をデッキの下に戻すことで召喚 | 新規 | `burst event:opponentSummonEffectResolved`（BS17-005）＋`pay{cost:returnToDeckBottom side:own filter, then:summonBurstCardFree}`（BS17-016 の pay 形、BS08-045 の returnToDeckTop コスト）。足りないのは緑/青の OR 色（P3） |
| Lv1･Lv2『召喚時』バースト効果で召喚されたとき、相手3体を疲労／この効果で疲労したスピリットは回復しない | 既存 | `triggered onSummon burstSummonOnly:true`（BS17-044）＋`exhaust count:3 noRefreshUntilOwnEndSteps:1`（BS12-078 は 5。確認事項 3） |

### BS18-029 バット・ホリディ
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3『自分のAS』このスピリットはアタックできない | 既存 | `constraint cantAttack`（BS02-038） |
| Lv2･Lv3『相手のAS』相手は可能ならば必ずターンに1回以上アタック | 新規 | P4 |

### BS18-030 ワイルド・ホーン
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『ブロック時』void→自分のスピリットにコア1 | 既存 | `triggered onBlock`（BS06-048）＋`placeCores void→spirit` |
| Lv2『ブロック時』機獣1体につきBP+1000 | 既存 | `onBlock`＋`timedEffect bp amountCounter:{ownFamily:"機獣"} duration:battle target:self`（BS06-048 e1 と同形） |

### BS18-031 ジェロニモンド
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1･Lv2 お互いのデッキは破棄されない | 新規 | P2 |
| Lv1･Lv2【重装甲：赤/白】 | 既存 | `keyword heavyArmor colors:["red","white"]`（BS12-028） |
| Lv2 合体していない自分のスピリットすべてに【重装甲：赤/白】を与える | 新規 | `keywordGrant keyword:heavyArmor colors target:ownAll`（BS17-067）。足りないのは「合体していない」（P5） |

### BS18-032 アルマジドラゴン
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1-3 赤のスピリットとしても扱う | 既存 | `colorAs colors:["red"]`（BS09-010） |
| Lv2『アタック時』BP+2000 | 既存 | `onAttack`＋`timedEffect bp duration:battle target:self`（BS01-004） |
| Lv3『ブロック時』BP+2000 | 既存 | `onBlock`＋同上（BS02-037） |

### BS18-033 アウトロー・キッド
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv2『相手のSS』疲労状態の相手2体までを指定／次の相手のリフレッシュステップで回復できない | 既存* | `step start turn:opponent`＋`timedEffect content:[skipRefresh] duration:nextRefresh filter:{rested:true}`（BS11-055 は 1 体）。`count:2` と「まで」が通るかの実例なし（`timedEffect.count` は number\|"any"、`upTo` 無し。確認事項 5） |

### BS18-034 シェリフ・イーグル
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| 【バースト：相手による自分のスピリット破壊後】機獣が破壊されていたら召喚 | 新規 | `burst ownSpiritDestroyed byOpponentEffectOnly`＋`summonBurstCardFree`（BS17-044）。足りないのは破壊された系統の絞り込み（P6。色版は BS14-061） |
| Lv2:フラッシュ『ブロック時』コア1をトラッシュに置くことで、バトル中の相手のコア1をリザーブへ | 既存* | `pay{cost:removeCores target:self to:trash（BS01-104）, then:removeCores side:opponent filter:{inBattle:true} to:reserve count:1}`。`inBattle` は `shared/rules/targetFilter.ts` に実装済みだが実カード 0（フラッシュ起動の枠は BS07 系の `activated`／ブロック時フラッシュ誘発の前例を要確認） |

### BS18-035 バッファロング・ビル
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1-3『相手のAS』コスト6以上の相手のスピリットはこのスピリットを指定してアタックしなければならない | 新規 | P7（許可の `canDirectAttack` は BS11-X01／BS14-X01） |
| Lv2･Lv3『ブロック時』コスト6以上の相手をブロックしたとき BP+10000 | 新規 | `onBlock`＋`timedEffect bp duration:battle target:self`（BS04-041 の condition 形）。足りないのはコスト下限（P8） |

### BS18-036 聖地の巨獣ベルロック
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『ブロック時』相手2体を手札に戻す | 既存 | `onBlock`＋`returnToHand count:2`（BS07-X26 の count:2） |

### BS18-057 ギアゼル（ブレイヴ）
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| Lv1『召喚時』手札のシンボル2つのスピリット1枚を無償召喚できる／召喚時は発揮されない | 新規 | `summonFromHandFree skipOnSummon:true`（BS10-029／BS05-009）。足りないのは手札側のシンボル数絞り込み（P9） |
| 合体条件：シンボル2つ以上 | 新規 | `braveCondition`（BS10-063 の minCost 形）。足りないのは `minSymbols`（P10） |
| 【合体時】『バトル時』コスト3以下の相手1体を疲労 | 既存 | `onBattleStart whileCombined:true`（BS10-X03／BS13-056）＋`exhaust count:1 filter:{cost:{max:3}}` |

### BS18-058 ガン・ホース（ブレイヴ）
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1『召喚時』相手のネクサス1つを手札に戻す | 既存 | `onSummon`＋`returnNexusToHand count:1`（BS17-025 は count:2） |
| 合体条件：コスト6以上 | 既存 | `braveCondition{minCost:6}`（BS10-063） |
| 【合体時】『相手のAS』【転召】を持たない相手を疲労状態でブロックできる | 既存 | `constraint canBlockWhileRested targetKeywordExclude:"tensho"`（BS08-029）＋`whileCombined:true`（BS11-055） |

### BS18-065 蒼き大草原
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『お互いのAS』覇皇/雄将の自分のスピリットすべて BP+2000 | 既存 | `aura bp ownAll familyFilter:["覇皇","雄将"] phaseTurn{attack,both}`（BS02-054＋`turn:"both"`は BS16-072 の用法） |
| Lv2『お互いのAS』自分のスピリットがBPを比べ相手のスピリットだけを破壊したとき、相手1体を疲労 | 既存 | `battleWon role:any selfMode:source`＋`exhaust count:1`（BS14-079 の同形） |

### BS18-066 エメラルドの海に散らばる島々
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『相手のターン』相手のスピリットが回復したとき、自分1体を回復 | 既存 | `fieldEvent anySpiritRefreshed subjectSide:opponent turn:opponent`（BS14-085）＋`refreshOne count:1`。リフレッシュステップの回復を含む読み（確認事項 7） |
| Lv2 ドローステップ以外で相手の手札が増えたとき、相手は手札1枚を破棄 | 既存 | `fieldEvent opponentHandAdded turn:opponent excludePhase:"draw"`（BS16-X04／BS08-003 の excludePhase）＋`discardOpponent count:1`（BS01-056） |

### BS18-067 巨獣の森
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2『相手のAS』巨獣/機獣がブロックしたとき、void→そのスピリットにコア1 | 既存 | BS09-061 e1（`effectGrant familyFilter onBlock placeCores target:self`）と同じ書き方、系統を巨獣/機獣に替える |
| Lv2『相手のAS』ステップ開始時、相手1体を指定できる／このステップの最初に必ずアタック | 既存 | `step attack turn:opponent optional:true`＋`timedEffect mustAttack duration:firstAttack count:1`（BS08-035） |

### BS18-068 O.K.コラル
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| Lv1･Lv2 コスト4以下のスピリット/ブレイヴの召喚時効果は発揮しない | 既存 | `globalConstraint noSummonTriggerByCost maxCost:4`（BS08-061） |
| Lv2『自分のAS』BPを比べ自分のスピリットが破壊されたとき、相手1体を手札に戻す | 既存 | `fieldEvent ownSpiritDestroyed phase:attack byBattleOnly`（BS03-104）＋`returnToHand count:1` |

### BS18-077 ブルトサリフ（マジック）
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| 自分のトラッシュの[ブルトサリフ]1枚はエンドステップに手札に戻る（ターン1回） | 既存 | `trashReturnAtEndStep maxCount:1`（BS15-077） |
| 【バースト：相手の召喚時発揮後】自分1体を回復／その後コスト支払いでフラッシュ発揮 | 既存 | `burst event:opponentSummonEffectResolved action:refreshOne count:1 thenPay:"flash"`（BS17-005 のイベント、BS14-101／BS15-084 の thenPay） |
| フラッシュ：このターンの間、スピリット1体 BP+2000 | 既存 | `magic flash timedEffect bp 2000 duration:turn side:both`（BS01-136 系） |

### BS18-078 サンダーストーム（マジック）
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| フラッシュ：このターンの間、相手の手札1枚につき自分の1体を BP+1000 | 既存 | `magic flash timedEffect bp 1000 amountCounter:"opponentHand" duration:turn`（`opponentHand` は RULE_COUNTERS。BS16-049 が同カウンタ） |
| さらに、相手の手札が6枚以上の間、相手のバースト効果は発揮されない | 新規 | `timedEffect playerRule noBurstEffectForPid`（BS17-084）。足りないのは「手札が6枚以上の間」の持続条件（P11。確認事項 8） |

### BS18-079 ウィンドスポウト（マジック）
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| 【バースト：相手の召喚時発揮後】相手1体を指定／このターン必ずアタック／その後コスト支払いでフラッシュ発揮 | 既存 | `burst opponentSummonEffectResolved action:timedEffect mustAttack duration:turn count:1`（BS15-079）＋`thenPay:"flash"`（BS14-103） |
| フラッシュ：自分1体を回復／そのスピリットを BP+2000／この効果で回復したスピリットはアタックできない | 既存* | `refreshOne chosenByPlayer thenCantAttackThisTurn:true`＋`timedEffect bp 2000 filter:{lastTarget:true}`の `sequence`。`thenCantAttackThisTurn`・`filter.lastTarget` とも型・実装あり、実カード 0（BS01-142 は `refreshAllOwn` が組み込みで同義）。確認事項 9 |

### BS18-080 キズナブレード（マジック）
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| フラッシュ：バトルしていない自分のスピリットを好きなだけ疲労／疲労させたスピリットのBP合計だけ自分の1体を BP+／メインステップで使えない | 新規 | `mainForbidden:true`（BS02-097）＋`timedEffect bp amountCounter:"lastBp" countOnce`（BS06-X24。`lastBp` は `lastTargetsOf` の合計を返す＝複数体可）。足りないのは「好きなだけ」（P12）と「バトルしていない」（P13） |

### BS18-X03 蒼穹の覇王カーン・ウルフ
| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| 【バースト：相手による自分のスピリット破壊後】ライフ3以下のとき召喚 | 既存 | `burst ownSpiritDestroyed byOpponentEffectOnly condition:{ownLifeAtMost:3} action:summonBurstCardFree`（BS17-044＋BS16-054） |
| Lv1-3『召喚時』剣獣の自分の1体を回復 | 既存 | `onSummon`＋`refreshOne count:1 filter:{family:"剣獣"}` |
| Lv3『アタック時』BPを比べ相手のスピリットだけを破壊したとき、相手のライフのコア1個をリザーブへ／このスピリットは回復 | 既存 | `onBattleWin battleRole:attacker`（BS02-036）＋`sequence[lifeCrush count:1, refreshSelf]`（BS08-027 の lifeCrush、BS04-025 の refreshSelf） |

### BS18-X04 爆氷の覇王ロード・ドラゴン・グレイザー
| 節 | 判定 | 使う器／足りない部品 |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】自分の白のスピリットがいるとき召喚 | 既存 | `burst ownLifeDamaged condition:{ownColorCountAtLeast:{color:"white",count:1}}`（BS15-043）＋`summonBurstCardFree` |
| Lv1-3【重装甲：∞】相手のフィールドのシンボルの色の効果を受けない | 新規 | P14（`armor`＋`colorsFrom:opponentFieldSymbols` は BS06-X24） |
| Lv2･Lv3『バトル時』相手のスピリットを破壊したとき、同系統の相手すべてを手札に戻す | 既存 | `onBattleWin`（BS14-033）＋`returnToHand all:true filter:{sameFamilyAsBattleLoser:true}`（BS10-063 の filter、BS06-X24 の returnToHand all）。確認事項 13 |

### BS18-X012D／X012E 英雄皇ロード・ドラゴン・ドミニオン（白／緑）
X012R（赤。BS14 取り込み済み）と効果文が同一。X012R の `effects` をカード ID だけ替えて写せる。

| 節 | 判定 | 使う器 |
| :-- | :-- | :-- |
| 【バースト：自分のライフ減少後】召喚 | 既存 | `burst ownLifeDamaged summonBurstCardFree`（X012R-e1） |
| Lv1-3『召喚時』手札のバースト効果を持つカード1枚をセットすることで1枚ドロー | 既存 | `pay{cost:setBurstFromHand, then:draw 1}`（X012R-e2。`setBurstFromHand` の自動選択は「コスト最大の1枚」の決定的簡略化＝X012R と同じ） |
| Lv3『自分のAS』バーストをセットしている間 BP+3000 | 既存 | `aura bp target:self 3000 condition:hasOwnBurstSet phaseTurn{attack,own}`（X012R-e3） |
