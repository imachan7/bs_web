# 収録漏れ49種 調査メモ（調査役）

対象：BS01-chaos 15種（026 028 039 043 075 078 080 085 092 095 103 110 111 124 145）／BSC05 21種（002〜028 の抜け番）／PROMO-missing 12種（EX024 EX025 EX026 X013 X016 X13-07 X13-08 X13-13 X13-14 X13-15 X13-16 X13-17）／BS11-076。実装はしていない。
「節」＝効果文の見出しブロック1つ（合体条件は含めない。1ブロックが複数のエントリになるものは §3 に明記）。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：75（効果なし＝0節の6種：BS01-026 028 039 043 075 092）
- 既存で書ける：62（BS01 14／BSC05 28／PROMO 18／BS11 1）
- 新しい部品が要る：13（BS01-111 e2／BSC05-006 e1・011 Lv3・017 e1／X013 バースト／X016 Lv2／X13-13 アタック時／X13-15／X13-16 バースト・Lv2-4／X13-17 Lv1-3・Lv3／BS11-076 メイン）
- 連鎖：1（X13-13。条件《緑シンボル》×1。BS20-X06-e2 と同形）
- 強化：0（X13-07 が「【強化】を持つ自分のスピリット」を絞り込みに使うだけ。【強化】の加算は無い）

## 2. 新しい部品の候補
器の索引（`kind`/`type` 約570個）と `ACTION_VOCABULARY.md`、各型ファイルの grep で確かめた。1枚専用の複合 type は提案していない。

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | `timedContent` の `coresProtected` に `battle:"participants"` と `side:"both"`（種別：軸の値） | 期間つき側は `battle:"blocker"` しか無い（timedContent.ts:55。BS09-027-e3）。両者対象は globalConstraint の `battle:"participants"`（BS05-060-e1）だけで、これは「自分のアタックステップ」の常時効果。「アタック時に、このバトルの間だけお互い」は timedEffect にしか載らない | BSC05-006 e1 |
| 2 | `reviveOnDestroy` の `cost` に「発生源を手札に戻す」＋`revived` に「破壊時の状態のまま」（種別：組み合わせ方の値） | cost の一覧（effectDefTrigger.ts:327〜）に自分を手札に戻す欄が無い。`revived` は `{rested:boolean}`／`toHand` で「同じ状態」を持てない。`reviveLastDestroyedNexus`（BS16-047-e1）はネクサス専用でスピリット版が無い。fieldEvent＋`pay`（return self）で書くと、発生源も同時に破壊されたとき（Q2814）に場から戻せない | BSC05-011 Lv3 |
| 3 | `magicTargetRedirect` の一般化：絞り込み先を「持ち主が選ぶ1体」にし、発生源種別にスピリットも含める（種別：アクションの引数） | 既存は絞り込み先が発生源自身に固定（effectDefContinuous.ts:36。`protectFamily/Color/Cost` で絞るだけ）。`bothSidesTargetRedirect` は「選択を挟む仕組みが無い」と注記あり（同:86）。選ぶ・スピリットの効果も対象という2点が足りない | BSC05-017 e1 |
| 4 | 相手のスピリットに「バトル終了時に破壊」を与える遅延（種別：タイミング） | `destroyBlockerAtBattleEnd`（effectDefContinuous.ts:111）は発生源の持ち主のアタッカー（コスト指定）をブロックしたレベル指定のブロッカー専用で、赤のアタッカー側・色指定に使えない。`grantTrigger` は自分（target:self）に与える形しか前例が無い（BS20-X06-e2） | BS01-111 e2 |
| 5 | `moveCards` の `from` を「手札かトラッシュ」の複数指定にする（種別：軸の値） | `from` は `"trash"|"hand"|"revealed"` の単一値（effectAction.ts:218）。`chooseActionMode` で2択にすると「手札かトラッシュにある1枚」の選択肢が1枚ずつの2モードに割れる | X013 バースト2文目 |
| 6 | `burstAltEventFromOpponentSummon` に代替先イベントを引数で持たせる（種別：軸の引数） | 現行は引数なしで「相手の召喚時」バーストを「自分のライフ減少後」にも許す専用（BS15-069-e2）。X016 は「相手による自分のスピリット破壊後」にも許すので、専用 type をもう1つ作らずに代替先を引数にしたい（原則3） | X016 Lv2・Lv3 |
| 7 | 指定アタックの「必ず」版（種別：軸の値） | 既存の `canDirectAttack`（`targetFilter`）は「できる」で、指定しない選択ができる（BS01-037-e1／SD06-006-e2）。Q18927 は「必ず指定アタックしなければならない」。`mustAttack` は「アタックする」だけで指定先を持たない | X13-13 e1 |
| 8 | `placeCores` を相手が任意で行う（種別：アクションの引数） | `placeCores` に `chooser`／`optional` が無い（effectAction.ts:99 を grep）。相手が「置くことができる」で、置かない選択がある（Q21818）。続く「置かれたとき」は `if cond {count:"lastMoved"}` で書ける見込み | X13-15 |
| 9 | カウンタ `ownFieldSpiritColors`（種別：条件の軸） | `opponentFieldSpiritColors` は相手側だけ（effectCounter.ts）。自分側の色の種類数が無い（`ownColor` は特定色の体数） | X13-16 バースト |
| 10a | AuraCondition `opponentSpiritMatches: filter`（種別：条件の軸） | `ownSpiritMatches` は自分側のみ。「バースト効果を持つ相手のスピリットがいる間」の相手側版が無い（filter 軸 `hasBurst` は有る） | X13-16 Lv2-4 |
| 10b | 条件の OR 合成 `anyOf`（種別：組み合わせ方） | 「セットしている間/いる間」はどちらか成立で+10000（重複しない読み。§4 #8）。aura を2エントリにすると両方成立で+20000になる | X13-16 Lv2-4 |
| 11 | `ImmuneSource` に `"burst"`（種別：軸の値） | `ImmuneSource` は spirit/brave/magic/nexus（type.ts:51）。バースト効果は発生源のカード種別と別軸（マジック由来もスピリット由来もある） | X13-17 Lv1-3 |
| 12 | TargetFilter 軸 `sameColorAsLastTarget`（種別：条件の軸） | `maxCostAsLast`／`sameCostAsLastTarget` は有るが色版が無い（`sameColorAsBattleLoser` は直前のバトルの敗者専用） | X13-17 Lv3 |
| 13 | `destroy` の `budget` に下限（「合計がN以上になるように」）と相手選択（種別：アクションの引数） | `budget` は `{by, amount}`＝上限（BS17-055-e1）。下限の意味の軸が無い。`chooserIsTarget` は有る | BS11-076 メイン |

## 3. カードごとの表
略号：「手本」は `grep -n '"id": "…"' data/cards/*.json` で効果文と構造を確かめたもの。

### BS01-chaos
| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS01-026/028/039/043/075/092 | 効果なし | 0節（staging の effect が空） |
| BS01-078 | Lv1-3 アタック時：トラッシュからコア1個を自分のリザーブへ | `triggered onAttack placeCores from:trash to:reserve count:1`。手本 P014-e1（同文でコア2個） |
| BS01-080 | Lv1-2 ブロック時：このスピリットをBP+1000 | `triggered onBlock timedEffect bp 1000 duration:battle target:self`。手本 BS01-077-e1（同文） |
| BS01-085 | Lv1-2 ブロック時：BP+2000 | 同上、amount 2000 |
| BS01-095 | Lv1-2 アタック時：相手に赤のスピリットがいない間アタックできない | `constraint cantAttack unlessOpponentHasColorSpirit:"red"`。手本 BS04-037-e1（同文） |
| 〃 | Lv2：自分の緑のスピリットすべてをBP+1000 | `aura bp ownAll filter{color:green} amount:1000`（levels:[2]）。手本 BS15-061-e1（赤のスピリットすべて+3000。条件なし版）。常時とする読みは §4 #2、Q1691 で支持 |
| BS01-103 | Lv1-2 自分のスタートステップ：相手のリザーブのコアすべてをトラッシュへ | `step start own removeCores side:opponent from:[reserve] to:trash target:spread count:all`。手本 BS09-017-e3（同動作） |
| 〃 | Lv2 自分のスタートステップ：相手のスピリット1体を疲労 | `step start own exhaust count:1`。手本 SD01-029-e2（exhaust count 1） |
| BS01-110 | Lv1-2 相手のアタックステップ：ブロックしている自分のスピリットすべてBP+1000 | `aura bp ownAll filter{blocking:true} amount:1000 phaseTurn{attack,opponent}`。手本 BS06-083-e2 |
| 〃 | Lv2 相手のスタートステップ：相手のスピリット1体を指定、そのターン必ずアタック | `step start turn:opponent timedEffect mustAttack duration:turn count:1`。手本 SD01-032-e2（同文） |
| BS01-111 | Lv1-2 お互いのアタックステップ：相手の赤のスピリットとバトルしている自分のスピリットすべてBP+1000 | `aura bp ownAll filter{inBattle:true} amount:1000 condition{battleOpponentMatches:{color:red}}`。Q21908 でアタック側もブロック側も含むと確定（§4 の別読みは消えた）。手本 BS06-083-e2 の aura 形＋条件軸 battleOpponentMatches（auraCondition.ts） |
| 〃 | Lv2：自分のスピリットとバトルした相手の赤のスピリットはバトル終了時に破壊 | 新部品 #4（Q21909：赤のアタッカー・赤のブロッカーの両方） |
| BS01-124 | フラッシュ：スピリット1体の上にボイドからコア4個 | `magic flash placeCores from:void to:spirit target:one count:4`。手本 BS01-065-e1（召喚時・コア1個・自分）。どちらの陣営かは §4 #1 |
| 〃 | エンドステップに：自分のコア4個をボイドへ | `atTurnEnd{removeCores side:own from:[spirit,nexus,reserve,trash] to:void count:4}`。手本 PX18-e2・BS16-068-e1（atTurnEnd）。範囲は Q24499。時点は §4 #1 |
| BS01-145 | フラッシュ：このターン中、ブロックしている自分のスピリットすべてBP+3000 | `magic flash timedEffect bp 3000 duration:turn all:true side:own filter{blocking:true}`。手本は ACTION_VOCABULARY.md:93（後から出た個体にも効く全体ルール）。BS06-104-e1〜e3 は貸与の旧形なので手本にしない |

### BSC05
| cardId | 節 | 使う器 |
|---|---|---|
| BSC05-002 | Lv1-3 召喚時：1枚ドロー | `triggered onSummon draw count:1`（`kind:triggered` の標準形） |
| 〃 | Lv3 アタック時：相手のスピリットのコア1個を相手のリザーブへ | `triggered onAttack removeCores side:opponent from:[spirit] to:reserve target:spread count:1`。手本 BS17-056-e1（同動作・count 2。「1体の」なし＝spread） |
| BSC05-003 | Lv1-3 召喚時：相手のスピリット2体のコアをそれぞれ1個だけになるように相手のリザーブへ | `removeCores targets:2 count:all leaveAtLeast:1 side:opponent`。手本 BS16-064-e1／BS21-076-e1（同文） |
| 〃 | Lv3 自分のアタックステップ：最初にアタックする自分のスピリット1体は疲労状態の相手のスピリット1体を指定してアタックできる | `constraintGrant target:ownAll phaseTurn{attack,own} constraint{canDirectAttack targetFilter:"rested" firstAttackOfTurnOnly:true}`。手本 BS17-061-e1（firstAttackOfTurnOnly）＋BS01-037-e1（targetFilter "rested"）。Q2790：最初に攻撃するのは他のスピリットでも可 |
| BSC05-004 | Lv1-2 色とシンボルは赤としても扱う | `colorAs colors:[red]`。手本 BS12-009-e1（同文・白） |
| BSC05-005 | Lv1-2 召喚時：ボイドからコア1個を自分のスピリットに置く | `onSummon placeCores from:void to:spirit target:one count:1`。手本 BS01-065-e1／BS01-069（「自分のスピリット1体の上に」） |
| 〃 | Lv2 バトル時：BPを比べ相手のスピリットだけを破壊したとき回復 | `triggered onBattleWin refresh target:self`。手本 BS09-027-e2（同文） |
| BSC05-006 | Lv1-2 アタック時：お互い、バトルしているスピリット上のコアは取り除けない | 新部品 #1（Q2797〜2800 はこのスピリット・ブロッカー双方のコアを守る。自分のマジックのコスト支払いも不可） |
| 〃 | Lv2 アタック時：相手のライフを減らしたとき、[自身]以外の自分のスピリット1体を回復 | `triggered onLifeDealt heading:attack refresh count:1 filter{nameExcludes:"武神獣タイガード・シンゲン"}`。手本 BS15-024-e4（onLifeDealt refresh）。nameExcludes 軸は targetFilter.ts に有る。Q2801 は合体中でも発揮 |
| BSC05-008 | Lv1-3：コスト2以下のスピリットのアタックではお互いのライフは減らされない | `globalConstraint lifeGuard from:attack source{cost{max:2}} max:0`。手本 BS07-005-e1（同文） |
| 〃 | Lv2-3 【装甲：白/青】 | `keyword armor colors:[white,blue]`。手本 BS11-026-e2（紫/青） |
| BSC05-010 | Lv1-3 色とシンボルは赤としても扱う | BSC05-004 と同じ |
| BSC05-011 | Lv1-3 破壊時：1枚ドロー | `triggered onDestroy draw count:1` |
| 〃 | Lv3：他の自分のスピリットが破壊されたとき、このスピリットを手札に戻すことで同じ状態で戻す | 新部品 #2（Q2813：1回で1体のみ。Q2814：同時破壊で自分は手札・他は復活できる） |
| BSC05-012 | Lv1-3 【聖命】アタック時：相手のライフを減らしたときボイドからコア1個をライフへ | `keyword seimei` ＋ `triggered onLifeDealt heading:attack placeCores void→life count:1`。手本 BS21-040-e1/e2（同文）。【聖命】の1行目だけで済ませない（2エントリ必要） |
| 〃 | Lv3 自分のアタックステップ：コスト10の自分のスピリットすべては効果の記述を持つ相手のスピリットからブロックされない | `constraintGrant target:ownAll filter{cost{min:10,max:10}} phaseTurn{attack,own} constraint{unblockableBy filter{vanilla:false} opponentOnly:true}`。手本 BS07-035-e3（opponentOnly＋filter）・BS11-082-e1（vanilla:false） |
| BSC05-013 | 【合体時】バトル時：BPを比べ相手のスピリットに破壊されたとき相手のライフのコア1個をリザーブへ。その後ブレイヴを残しスピリットだけ手札へ（1ブロック＝2エントリ） | `triggered onBattleLose whileCombined lifeCrush count:1`（手本 BS15-059-e1。同トリガー）＋`reviveOnDestroy scope:self whileCombined revived{toHand:true,braveStay:…} when{byBattle:true}`（手本 BS13-057-e1・P039-e3）。順序と残すブレイヴの状態は §4 #5。Q19971：ブレイヴはスピリット状態で残る |
| BSC05-014 | 【合体時】アタック時：BPを比べ相手のスピリットだけを破壊したとき相手のライフのコア2個をリザーブへ | `triggered onBattleWin heading:attack whileCombined lifeCrush count:2`。手本 BS01-X03-e2（count 1）・BS20-X06-e2（count 2） |
| BSC05-016 | 【合体時】合体アタック時：バトル解決時、ブロックした相手のスピリットがBP6000以下のときブロックされなかったものとして扱う | `triggered onAttack whileCombined treatAsUnblocked when{blockerMaxBp:6000}`。手本 SD15-004-e2（blockerBpBelowSelf）。型は effectAction.ts:130 で確認。Q19975〜19978 |
| BSC05-017 | Lv1-2：相手が自分のスピリットを対象に含むスピリット/マジックの効果を使用したとき、その効果を受ける自分のスピリット1体を選び対象をそのスピリットのみにできる | 新部品 #3 |
| 〃 | Lv2 お互いのアタックステップ：自分の合体スピリットが疲労したとき1枚ドロー | `fieldEvent ownSpiritExhausted subjectFilter{combined:true} phase:attack draw count:1`。手本 BS17-064-e2（同イベント・コスト3の体） |
| BSC05-018 | Lv1-2 自分のメインステップ：自分のスピリット状態のブレイヴが召喚されたときボイドからコア1個を自分のリザーブへ | `fieldEvent anyBraveSummoned phase:main turn:own subjectSide:own subjectFilter{braveInSpiritState:true} selfMode:source placeCores void→reserve count:1`。手本 BS23-072-e2（anyBraveSummoned・subjectSide・selfMode）。Q23569：分離は「召喚」でない |
| 〃 | Lv2 自分のエンドステップ：自分の合体スピリットすべてを回復 | `step end own refresh all:true filter{combined:true}`。手本 BS13-023-e1（`step end own refresh all:true filter{minLevel:2}`） |
| BSC05-021 | メイン：コアが1個しか置かれていない疲労状態のスピリット1体を破壊 | `magic main destroy count:1 anySide:true filter{cores:1,rested:true}`。手本 BS05-027-e1（filter cores:1）。`rested` は targetFilter.ts の軸 |
| 〃 | フラッシュ：このターンの間スピリット1体をBP+2000 | `magic flash timedEffect bp 2000 duration:turn count:1 side:both`。手本 BS20-081-e1（count:1 の形）・BS11-082 は all 形。Q26090（コア0でLv0） |
| BSC05-023 | フラッシュ：相手のスピリット1体を指定し、疲労させこのターン回復できない | `sequence[designate side:opponent count:1, exhaust filter{lastTarget}, timedEffect{cantRefresh target:{lastTarget}} duration:turn]`。`cantRefresh` は timedEffect の内容に載る（cantRefresh.ts 冒頭）。designate の手本は effectAction.ts:220 の型のみ（実カード未確認） |
| BSC05-024 | フラッシュ：系統を1つ指定、指定した系統の自分のスピリット2体を回復 | `declare what:family from:spirits then refresh count:2 filter{declared:"match"}`。手本 BS03-129-e1（3体） |
| BSC05-025 | フラッシュ：自分の合体スピリット1体を回復させ、このターンの間BP+2000 | `sequence[refresh count:1 filter{combined:true}, timedEffect bp 2000 duration:turn target:lastTargets]`（「し、」＝同時。CONJUNCTION.md:11）。手本 BS14-X03-e4（timedEffect の組み立て） |
| BSC05-026 | フラッシュ：このターンの間、自分のスピリット状態のブレイヴすべてはブロックされない | `timedEffect unblockable duration:turn all:true side:own filter{braveInSpiritState:true}`。手本 BS07-044-e2（unblockable 内容）・ACTION_VOCABULARY.md:93（all の意味） |
| BSC05-027 | フラッシュ：バトルしている自分のスピリット1体を破壊することで、そのスピリット上からコア1個を自分のライフへ | `pay{cost:destroy side:own filter{inBattle:true}} then placeCores from:destroyed to:life count:1`。手本 BS13-027-e1（pay の形）。`from:"destroyed"` は effectAction.ts:99 で確認、実カード手本は未確認（§4 #6） |
| BSC05-028 | フラッシュ：合体しておらず【転召】を持たない相手のスピリットすべてのLv1/2/3BPを2000として扱う。メインステップで使えない | `timedEffect all:true side:opponent filter{uncombined:true,keywordExclude:"tensho"} content[bpAs levels:[1,2,3] amount:2000] duration:turn`（手本 BS12-037-e1。bpAs の timedEffect 形）＋`mainForbidden:true`（手本 SD11-016-e1）。AND の読みは Q26095 |

### PROMO-missing / BS11
| cardId | 節 | 使う器 |
|---|---|---|
| EX024 | Lv1-3 自分のアタックステップ：相手によって破壊されたとき相手のスピリット1体を破壊し手札に戻る | `reviveOnDestroy scope:self when{byOpponent:true} phaseTurn{attack,own} revived{toHand:true} then{destroy count:1}`。手本 BS19-X05-e2（then つき）・BS18-X05-e2（toHand＋when.byOpponent）。Q18605：相手からのあらゆる破壊を含む（Lv0 を除く） |
| 〃 | Lv2-3 自分のバースト発動後：相手のスピリット1体のコア2個を相手のリザーブへ | `fieldEvent ownBurstActivated removeCores side:opponent from:[spirit] to:reserve target:one count:2`（「1体の」あり＝one）。手本 SD06-007-e2（同イベント） |
| EX025 | フラッシュ【神速】 | `keyword soku`。手本 BS14-X03-e3 |
| 〃 | Lv1-3 召喚時：自分のスピリット1体を回復 | `onSummon refresh count:1`（自分側。「このスピリット」でないので target self にしない） |
| 〃 | Lv2-3 自分のバースト発動後：相手のスピリット1体を疲労 | `fieldEvent ownBurstActivated exhaust count:1`。手本 SD06-007-e2／BS17-064-e1（同イベント） |
| EX026 | Lv1-3 自分のターン：自分のネクサスがある間BP+5000 | `aura bp self amount:5000 phaseTurn{turn:own} condition{ownNexusAtLeast:1}`（auraCondition.ts:ownNexusAtLeast）。手本 BS15-061-e1（aura 形） |
| 〃 | Lv2-3 自分のバースト発動後：自分のネクサス1つにつきコスト5以下の相手のスピリット1体を破壊 | `fieldEvent ownBurstActivated destroy count:1 countCounter:"ownNexuses" filter{cost{max:5}}`。手本 BS17-X01-e1（countCounter ownColor＋maxBp） |
| X013 | バースト：相手による自分のスピリット破壊後。このバースト発動時にBP7000以上のスピリットが破壊されていたらこのスピリットカードを召喚 | `burst event:ownSpiritDestroyed byOpponent… action if{cond{event{targetBpAtLeast:7000}} then summon from:burst}`。手本 BS14-X03-e1（burst＋if＋summon）。型 IfCond は effectAction.ts:51。Q18865：破壊された自分のスピリットのBP |
| 〃 | この効果発揮後、手札かトラッシュの「ロード・ドラゴン」入りスピリット1枚を召喚できる | 新部品 #5（`moveCards dest:summon pick{nameContains}`。コストは払わない：Q18868） |
| 〃 | Lv2-3 自分のアタックステップ：名前に「ロード・ドラゴン」の自分のスピリットすべてBP+2000 | `aura bp ownAll filter{nameContains:"ロード・ドラゴン"} amount:2000 phaseTurn{attack,own}`。手本 BS15-061-e1（aura 形）。nameContains は targetFilter.ts。Q18867：自身も対象 |
| X016 | バースト：自分のライフ減少後：このスピリットカードを召喚 | `burst event:ownLifeDamaged summon from:burst`。手本 SD06-007-e1 |
| 〃 | Lv2-3：バースト条件が【相手の召喚時発揮後】の自分のバーストは【相手による自分のスピリット破壊後】にも発動できる | 新部品 #6 |
| 〃 | Lv3 自分のバースト発動後：相手のブレイヴ/ネクサスどちらか1つを破壊 | `fieldEvent ownBurstActivated removeOneOfAnyType mode:destroy types:[brave,nexus]`。手本 SD06-006-e1（同文・召喚時）。Q18885：スピリット状態のブレイヴも対象 |
| X13-07 | Lv1 召喚時：BP合計5000まで相手のスピリットを好きなだけ破壊し、1体につき1枚ドロー | `onSummon destroy count:any budget{by:bp,amount:5000} drawPerDestroyed:1`（destroy の軸は effectAction.ts:62 で確認）。手本 BS12-052-e1（sequence destroy＋draw countCounter lastMoved）・BS17-055-e1（budget bp）。「し、」＝同時だが drawPerDestroyed は破壊した数で数える |
| 〃 | Lv1 自分のアタックステップ：【強化】を持つ自分のスピリットすべてBP+1000 | `aura bp ownAll filter{keyword:"kyoka"} amount:1000 phaseTurn{attack,own}`。手本 P055-e2（kyoshu 版） |
| 〃 | 【合体時】自分のアタックステップ：同上 | 同上＋`whileCombined:true`（手本 BS21-060-e1 の whileCombined） |
| X13-08 | Lv1 自分のアタックステップ：【連鎖】を持つ自分のスピリットすべてBP+1000 | 同上（`keyword:"rensa"`。triggered に `keyword:"rensa"` を書く前例が BS21-048-e2） |
| 〃 | 【合体時】自分のアタックステップ：同上 | `whileCombined:true` 版 |
| 〃 | 【合体時】【強襲：1】合体アタック時：ターンに1回までネクサス1つを疲労させ回復 | `keyword kyoshu count:1`（手本 BS16-052-e1）＋`triggered onAttack pay{cost:exhaust side:own nexusOnly:true count:1} then refresh self limitByKeyword:kyoshu`（手本 BS16-052-e2。強襲は2エントリ）。どちらも `whileCombined:true`（キーワード側に付く前例は未確認＝実装役が確かめる） |
| X13-13 | Lv1-3 アタック時：相手のスピリット1体を指定し、そのスピリットにアタックする | 新部品 #7（Q18926：疲労状態も可／Q18927：必ず） |
| 〃 | 【連鎖：条件《緑シンボル》】BPを比べ相手のスピリットだけを破壊したときライフのコア1個を相手のリザーブへ | `triggered keyword:rensa onAttack if{cond{count{ownColorSymbols:green} atLeast:1} then timedEffect grantTrigger onBattleWin battleRole:attacker lifeCrush count:1 duration:battle target:self}`。手本 BS20-X06-e2（count 2） |
| X13-14 | 【合体時】合体アタック時：自分のスピリット1体を破壊することでドロー。ただし『破壊時』効果は発揮されない | `pay{cost:destroy side:own suppressOnDestroy:true} then draw count:1`。手本 BS12-052-e1（suppressOnDestroy＋draw）・BS13-027-e1（pay の形）。Q21817：ドローできない相手の場では破壊もできない |
| X13-15 | 【合体時】合体アタック時：相手はリザーブからコア1個をライフに置くことができる。置かれたとき自分もリザーブからコア1個をライフに置くことができる | 新部品 #8 ＋`if{cond{count:"lastMoved" atLeast:1} then placeCores from:reserve to:life optional}`。Q21818：置かない選択もできる |
| X13-16 | バースト：相手による自分のスピリット破壊後：自分のスピリットの色が2色以上のときこのスピリットカードを召喚 | `burst ownSpiritDestroyed byOpponent if{cond{count{ownFieldSpiritColors} atLeast:2} then summon from:burst}`（#9）。手本 BS14-X03-e1 |
| 〃 | Lv1-4 アタック時：系統「覇皇」を持つ相手のスピリット1体を破壊 | `onAttack destroy count:1 filter{family:"覇皇"}`（`triggered`。手本 BS16-052-e3（`destroy count:1 filter{familyExclude}`。`family` 指定版）） |
| 〃 | Lv2-4：相手がバーストをセットしている間／バースト効果を持つ相手のスピリットがいる間BP+10000 | `aura bp self amount:10000 condition{anyOf:[{opponentBurstSet:true},{opponentSpiritMatches:{hasBurst:true}}]}`（#10a・#10b）。手本 BS15-061-e1（aura）＋auraCondition.ts:opponentBurstSet |
| X13-17 | このカードは1コスト以上支払わなければ召喚できない | `summonNeedsCost`。手本 BS23-X07-e1。Q18934〜18936：無料召喚・0軽減では出せない |
| 〃 | Lv1-3 お互いのアタックステップ：自分のスピリットすべては相手のバースト効果を受けない | 新部品 #11（`constraintGrant target:ownAll constraint{immuneToOpponentEffects against:"burst"}`。手本 BS17-036-e2）。Q18937：自身も対象 |
| 〃 | Lv3 自分のエンドステップ：自分のスピリット1体をデッキの下に戻すことで、戻したスピリットのコスト以下で同じ色の自分のバーストをバースト条件を無視して発動 | `step end own pay{cost:return to:deckBottom target one filter side:own} then activateBurstIgnoringCondition from:set filter{maxCostAsLast, sameColorAsLastTarget}`（#12）。手本 BS18-016-e1（activateBurstIgnoringCondition from:set）・BS14-X03-e4（pay return）。Q18938：ターンに1度／Q18939：発動できるバーストが無いと戻せない |
| BS11-076 | メイン：自分のスピリット1体を破壊することで、相手はコスト合計がそのコスト以上になるように相手のスピリットを好きなだけ破壊 | 新部品 #13（`pay{cost:destroy side:own} then destroy count:any chooserIsTarget:true budget{by:cost,atLeast:…}`） |
| 〃 | フラッシュ：このターンの間スピリット1体をBP+3000 | `magic flash timedEffect bp 3000 duration:turn count:1 side:both`。手本 BS20-081-e1 の形（BSC05-021 と同形） |

## 4. 解釈が割れる点
| # | カード | 論点 | 私の読み（根拠） | 別の読み | 影響する枚数 |
|---|---|---|---|---|---|
| 1 | BS01-124 | 「エンドステップに」自分のコア4個をボイドへ：どの時点か、どの陣営のスピリットに置くか | 時点は `atTurnEnd`（エンドステップの誘発の後・期間効果が消える直前。BS16_BATCH3.md の定義）。置く先は「スピリット1体」＝自分・相手のどちらでも。取り除くコアは Q24499 どおり自分のスピリット/ネクサス/リザーブ/トラッシュから自由（持ってきたコアに限らない） | エンドステップ開始時（`step end`）に解決／置く先は自分のスピリットだけ | 1 |
| 2 | BS01-095 | Lv2「自分の緑のスピリットすべてをBP+1000」は見出しなしの1行 | Lv2 の間ずっと続く常時効果（Q1691） | 直前の『アタック時』の続きとして、アタック時だけ | 1 |
| 3 | BSC05-011 | Lv3 の「同じ状態で戻す」：コアも戻るか。戻すタイミング | 状態（疲労/回復）のみ。コアは破壊でトラッシュ/リザーブへ行ったまま（戻したスピリットは破壊時の状態でコア0〜維持分だけ）。発動は他のスピリットの破壊の直後に確認（Q2813：同時破壊は1体のみ） | コアも破壊前と同数に戻す | 1（類似：BS16-047/BS11-066 のネクサス版が前例） |
| 4 | BSC05-017 | 対象の付け替え：確認を出す時点と誰に | 相手が対象を選び終えた直後・効果解決前に、持ち主（自分）へ確認。使用時に選んだ対象（モード）は変更不可（Q23563）、効果を受けないスピリットには変更不可（Q23560/62）、バースト・持続・連鎖は対象外（Q23566〜68） | 相手が効果を宣言した時点（対象選択前） | 1 |
| 5 | BSC05-013 | 「その後」ライフ削り→ブレイヴを残し手札へ：順序と、残すブレイヴの状態 | `onBattleLose`（BP比べで先に決着。RESUME_STACK.md の「BP比較は破壊処理より先」）でライフ削り、その後に `reviveOnDestroy`（toHand）が解決。残すブレイヴはスピリット状態（Q19971）。疲労/回復は文に無いので `braveStay` を指定しない（既定＝破壊時の状態）。BS13-057 は「回復状態で」と明記しており、本文に無いので回復にはしない | `braveStay:"refreshed"` で回復 | 1 |
| 6 | BSC05-027 | 「破壊することで」ライフに置くコアの取り方・順序 | Q26091/92：コア1個をライフに置いた後に破壊時効果を解決。置いたことでコア0になっても Lv0 破壊時効果は発揮されない。`pay` の destroy→`placeCores from:destroyed`。コスト（破壊）が完全に解決できるときだけ払う（COST_MODEL.md） | 破壊時効果の解決後にライフへ置く | 1 |
| 7 | BSC05-028 | 「合体していない、または【転召】を持たない」 | AND（合体しておらず【転召】を持たない）。Q26095 が明記。Q26094：BP+後でも5000（基礎BPを変える）、Q26096：合体で効果は外れる | OR（どちらかを満たせば対象） | 1 |
| 8 | X13-16 | Lv2-4「バーストをセットしている間／バースト効果を持つ相手のスピリットがいる間」 | OR（どちらか成立で+10000、重複しない） | 両方成立で+20000 | 1 |
| 9 | X13-16 | バースト条件「自分のスピリットの色が2色以上」の判定盤面 | バースト発動時（破壊後）の自分のフィールドのスピリットの色の種類（多色1体で2色も可）。破壊されたスピリットは含まない | 破壊されたスピリットも含めて数える | 1 |
| 10 | X013 | 「BP7000以上のスピリットが破壊されていたら」の主語 | 破壊された自分のスピリット（バーストの発動条件の対象）。Q18865：自分BP6000＋相手BP7000の同時破壊では召喚不可 | 破壊されたスピリット全体（相手含む） | 1 |
| 11 | X13-13 | 必ず指定アタック：相手のスピリットがいない／指定先が場を離れたとき | 対象がいなければ通常のアタック。指定先が離れれば通常のアタックに戻る（BS12_PLAN.md の指定アタック規則）。Q18927 は「必ず」 | 対象がいなければアタック自体を取り消す | 1 |
| 12 | X13-14 | 「自分のスピリット1体を破壊することで」の選択肢にホスト自身を含むか | 含む（自分のスピリットすべて）。Q21817：ドローできない場合は破壊もできない（pay の完全解決規則） | ホスト自身は選べない | 1 |
| 13 | X13-15 | 「この効果で相手のライフにコアが置かれたとき」の範囲 | この効果の中で相手が実際に置いたときだけ（sequence＋`if lastMoved`）。Q21818：どちらも置かない選択がある | `fieldEvent lifeCorePlaced`（誰の効果でも拾う） | 1 |
| 14 | X13-17 | 「戻したスピリットのコスト以下で同じ色」の色の一致 | 戻したスピリットの持つ色のどれか1つでも一致すればよい（ケイ自身は6色）。コストの上限は Q18941（合体スピリットを戻すと、そのコスト12以下まで発動できる） | 色の集合が完全一致 | 1 |
| 15 | BS11-076 | 相手が選ぶ「コスト合計がコスト以上になるように」：最低限の枚数・足りないとき | Q24867：必要最小限で足りる分まで（コスト5なら2コスト3体）／Q24868：全部壊しても足りない分は壊せない／Q24869：コスト0は壊しても壊さなくてもよい／Q24870：コスト0を破壊してもコスト10の1体を破壊する、つまり合計が0でも1体は壊す。最後の1つは Q&A の要約が曖昧なので、実装前に確認したい | 合計が足りていれば0体 | 1 |
| 16 | X016 | Lv2-3 の「発動できる」にした場合の発動条件（byOpponent か byOpponentEffectOnly か） | 新たに許すイベントは【相手による自分のスピリット破壊後】と同じ判定（バトル破壊も含む `byOpponent`）。BS14-X03-e1 は `byOpponentEffectOnly:true` なので、カードごとに判定が違う点に注意 | 効果破壊のみ | 1 |

## 5. 公式Q&A（batspi wiki。Q番号つき）
| カード | 要点 |
|---|---|
| BSC05-017 古の魔王城 | Q23559/61/64/65：対象を1体のみに変更できる／Q23560/62：効果を受けないスピリットには変更できない／Q23563：使用時に選んだモードは変更不可／Q23566：持続効果は不可／Q23567：バースト由来は不可／Q23568：連鎖は不可 |
| BSC05-011 電精ビリット | Q2813：同時破壊の自分の他のスピリット2体は両方残せない（1回のみ）／Q2814：Lv3 の自分と他1体が同時破壊なら、自分を手札に戻し他を戻せる |
| BSC05-006 タイガード・シンゲン | Q2797〜2800：アタック中の自分、ブロックしている相手のスピリットのコアはマジック・ポイズンシュートでも自分のマジックコストでも取り除けない／Q2801：合体中でも Lv2 は発揮 |
| BSC05-003 マルバレオン | Q2789：召喚時でコアが足りずLv0になれば破壊／Q2790：他のスピリットが最初にアタックしても Lv3 の指定アタックが可 |
| BSC05-013 バーン・クロウ | Q19970：「BPを比べ〜破壊されたとき」は汎用編参照／Q19971：ブレイヴはスピリット状態で残る／Q19972：同時のライフ減少の解決順はターンプレイヤーが選ぶ |
| BSC05-016 バイコーン | Q19975：ブロックされてもブロックされなかったものとして扱いライフを減らせる／Q19976：BP6000超なら不発／Q19977：相手のブロック時効果は発揮／Q19978：ブロックした相手は回復しない |
| BSC05-018 動かざる山の本陣 | Q23569：合体スピリットの分離は「スピリット状態のブレイヴが召喚された」ではない |
| BSC05-027 エレキトリック | Q26090：コア0にするとLv0／Q26091：コア1個をライフへ→先、破壊時効果は後／Q26092：Lv0なら破壊時効果は発揮されない |
| BSC05-028 サンダーブランチ | Q26093：同マジックのBP+3000は上乗せ（5000）／Q26094：後から使ってもBP5000のまま（基礎BPを変える）／Q26095：【転召】を持たず合体もしていないスピリットのみ／Q26096：BP2000の後に合体すると効果が外れる |
| BS01-111 ダイヤモンドの月 | Q21908：Lv1 は自分のアタッカーが赤にブロックされた、または赤のアタッカーを自分がブロックしたとき／Q21909：Lv2 の対象は、自分をブロックした、または自分にブロックされた赤の相手スピリット |
| BS01-095 ベア・ゲルミル | Q1690：相手に赤がいなくてもブロックは可／Q1691：Lv2 の効果はLv2の間ずっと続く |
| BS01-124 イビルオーラ | Q24499：エンドステップにボイドへ置くコアは自分のスピリット・ネクサス・リザーブ・トラッシュから自由に4個（持ってきたコアでなくてよい） |
| EX024 ドラキュラ | Q18605：相手からのあらゆる破壊（Lv0を除く）／Q18606：コア0でLv0破壊 |
| X013 インティ | Q18865：自分BP6000＋相手BP7000の同時破壊は召喚不可／Q18866：海賊王の秘宝島下で本カード自身は召喚可・英雄龍は不可／Q18867：自身もLv2・3のBP+2000／Q18868：手札のロード・ドラゴンはコスト不要 |
| X016 バゼル | Q18884：Lv2・3でBS15-X06のバーストを発動しても条件を満たさなければ不発／Q18885：Lv3 はスピリット状態のブレイヴも破壊できる |
| X13-13 オーバーレックス | Q18926：疲労状態にも指定アタック可／Q18927：必ず指定アタックしなければならない／Q21851（関連）：合体時の「条件を無視して発揮」で連鎖が発揮する |
| X13-14 ボンバーハンマー | Q21817：相手にチョウハッカイがいてドローできないとき、スピリット1体だけの破壊はできない |
| X13-15 マジカルハンマー | Q21818：自分はライフへのコア配置をしないこともできる |
| X13-16 覇王マナカ | Q&Aなし（取得したページに記載なし） |
| X13-17 ケイ | Q18931〜33：6色のスピリット・手札やトラッシュでも6色・シンボルは赤のみ／Q18934〜36：無料召喚・0軽減では召喚できない／Q18937：自身もバースト効果を受けない／Q18938：Lv3 はターン1回／Q18939：発動できるバーストが無ければ戻せない／Q18940：コスト以下・同色でなければ発動できず効果前の状態に戻す／Q18941：合体スピリットを戻してもコスト12以下まで可／Q18942：発動したバーストは通常どおりフィールドの解決後に発揮／Q18943：自身を戻しても発揮できる |
| BS11-076 シェアリングペイン | Q24867：コスト5を破壊→相手のコスト2×4体から3体（合計5以上）／Q24868：足りない合計を超えて壊せない／Q24869：コスト0は壊しても壊さなくてもよい／Q24870：コスト0を破壊し相手がコスト10の1体のみなら、その1体を破壊する（要約のため原文の確認が必要。§4 #15） |
| 上記以外（BS01-026/028/039/043/075/078/080/085/092/103/110/145、BSC05-002/004/005/008/010/012/014/021/023/024/025/026、EX025/EX026、X13-07/08） | 取得せず（新部品が無く §4 にも載らないため） |

## 6. メインループの見直し（2026-11-16。§2・§4 より優先）
- §2 #1 は不要：BSC05-006 は期間の指定が無い『アタック時』なので、#595 の裁定（アタックしている間ずっと効く継続効果）に合わせ、既存の `globalConstraint coresProtected side:"both" battle:"participants"`＋`whileSelfAttacking:true`（BS05-060-e1 の形）で書く
- §2 #7 は `canDirectAttack` に「必ず」の値を1つ足すだけ（「指定し、そのスピリットにアタックする」は全カードで X13-13 だけ。ほかは「できる」）
- §4 #1 BS01-124：`atTurnEnd`（このターン終了時）ではなく、#592 と同じく**エンドステップの誘発と同じ列**で解決する読みに改める（確認待ち）
- §4 #3 BSC05-011：「同じ状態で戻す」は Q2813 の「フィールドに残せる」から、**破壊を取り消して残す**（既存の `stayOnFieldRevived`＝コアも疲労状態も破壊時のまま）と読む。調査役の「コアは離れたまま」は採らない（確認待ち）
- §4 #15 BS11-076：Q24867〜70 の原文を確認した。Q24868 は「相手のスピリットのコスト合計より高いコストの自分のスピリットは破壊できない」（支払える条件）、Q24870 は「自分がコスト0を破壊しても、相手はコスト10の1体を破壊する」（最低1体）
- §4 #2・#6・#7・#10・#12・#13・#16 は Q&A か既存の規則で決着済み。確認に出さない

### 確認の答え（2026-11-16 ユーザー）
- Q1 BS01-124：使ったターンのエンドステップに、エンドステップの誘発と同じ列で解決。コアを置く「スピリット1体」はどちら側でも可。足りなければ置ける分だけ → OK
- Q2 BSC05-011 Lv3：破壊待機状態のスピリットに使い、待機状態から元の状態に戻す（コア・疲労状態とも破壊時のまま。stayOnFieldRevived の経路）
- Q3 BSC05-017：相手が対象を選び終えた後・解決前に、自分が元の対象に含まれる自分のスピリット1体を選び、対象をそれ1体だけにできる → OK
- Q4 BS11-076：相手は1体ずつ選び、合計がコスト以上に届いたらコスト1以上は選べない（最低1体。コスト0は任意）。自分が破壊できるのは相手の合計コスト以下の自分のスピリット。相手のスピリット0体なら使えない → OK
- Q5 X13-17：「同じ色」は1色でも共通すればよい → OK
- Q6 BS01-111 Lv2：`destroyBlockerAtBattleEnd` を一般化して使う（新しい kind を足さない） → OK
