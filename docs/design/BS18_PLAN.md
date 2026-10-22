# BS18「覇王編 第5弾：覇王大決戦」実装計画

**全90種**（BS18-001〜084 ＋ X01〜X06）。スピリット・ネクサス12・マジック12・ブレイヴ6、バニラ6枚、多色4枚（紫/赤・緑/青・黄/白・赤/白）。
データは `data/staging/BS18.json`（2026-10-22 取り込み。`python3 scripts/fetch_wiki_cards.py --set BS18 --refer '覇王編 第5弾：覇王大決戦' --pages 2`。番号の抜け・重複なし）。
同じリストに X レアの色違い X012A/D/E/S/T（赤の X012R は BS14 で取り込み済み）と X021・X022 の8枚が入っている。含める（§2）。
`--refer` は Wiki に実在するページ名でないと「〜からは呼び出せません」で0件になる（弾名は公式の商品ページで確かめた）。

## 1. 進め方（BS17 と同じ）

1. 調査役3体（2色ずつ・並行）：節ごとに既存／新しい部品を仕分ける。メモは `BS18_SURVEY_<色>.md`
2. メインループが見直し、新しい部品の一覧と確認事項をまとめてユーザーに確認 → §2・§3 に書く
3. ①期待値役（効果文だけから場面テスト）→ 部品の実装役 → データ役 → ③見直し → `merge-set.ts BS18`
4. 定型の検証 → PR は弾ごと1つ（このブランチ `feat/bs18-import`）

## 2. 解釈

**確定（2026-10-23 ユーザー回答）。一般則は RULES_BATSPI_WIKI §6・BURST.md §7 に1行ずつ書いた**
- 060 手札コスト8：このターンの間。後から手札に入ったカードにも効く
- 016 条件を無視して発動したバースト：任意。きっかけの出来事に依存する部分は不発（BURST §7.1 の既存則と同じ）
- 052 手札・トラッシュの効果の停止／048 手札を増やせない（全経路）／「お互いのデッキは破棄されない」／ボイドからコアが増える（ライフ込み）／回復の同時性 → RULES_BATSPI_WIKI §6
- X01【バースト転召】・081 マジックバーストの「このスピリット」 → BURST.md §7.4
- 082 パニックヴォイス（相手のスピリットを疲労させ、そのスピリットでブロック）：
  - ブロックできないスピリットも疲労させられる。ブロック部分は不発
  - キャンサーのような「複数体でないとブロックできない」アタッカーには、防御側がブロッカーとして追加できる
  - 「相手のスピリットにブロックされない」等の陣営指定のブロック不可は、アタッカー自身の陣営のスピリットには効かない（ブロックされる）
  - ブロック宣言はブロック前のフラッシュタイミングが終わった後。応酬中に疲労させた対象が場を離れたら、防御側が通常どおり自分のスピリットでブロックを宣言する
  - 「BPを比べ相手のスピリットを破壊したとき」は、同じ陣営どうしのバトルでは発揮しない（「相手」を「自分」に読み替える効果はアルティメット編。今回は対象外）
- B の既定の読みはすべてそのまま採用：022・023 アタック中だけ／027 効果による回復のみ止める／029 プレイヤー単位で1回以上／033 0〜2体／035 疲労状態も指定対象・ライフ狙い不可／078 手札6枚以上の間だけ常時／079 回復しなかった対象にアタック不可は付かない／080 BP合計は実際に疲労した分／057 シンボルちょうど2／034・045 同時破壊は1体でも満たせば成立／X04 相打ちでも発揮／026 自身を含む／014 1体ごとに払うか選ぶ／006 破壊された戦竜は対象外／003 現在Lvで有効な召喚時効果／084 オープンは両者に公開／070 コア数はライフを減らす時点／040 バトルの間／047 軽減の付与だけ止める／054 次の相手ターンのメインステップを飛ばす／053 手札のマジックだけ止める
- 範囲：X012A/D/E/S/T と X021・X022 も含める（ユーザーの回答がなかったので推奨どおり。違えば外す）

## 3. 新しい部品（2026-10-23 確定。調査メモの N＝赤紫／P＝緑白／#＝黄青 を統合）

差し込み先は調査メモの該当行を見る（ここには名前と形だけ書く）。

**バッチ1：小さな軸（2体並行）**
- 1a 対象の絞り（`types/targetFilter.ts`・`logic/filter.ts`）
  - `TargetFilter.color?: Color | Color[]`（配列＝OR。N12・P3：018・027）
  - `notInBattle?: true`（P13：080）
  - `sameLevelAsSource?: true`（発生源のスピリットと同じ Lv。N5：006）
  - `exhaust.count` に `"any"`（好きなだけ。P12：080）
- 1b 誘発の条件
  - `onBlock`・`onBlocked` の condition に `{ targetMinCost: number }`（P8・N8：035・009）
  - burst の condition に `{ burstDestroyed: { colors?: Color[]; minCost?: number; family?: FamilyFilter } }`（同時破壊のうち1体でも全部を満たせば真。#6・P6：034・045）
  - `reviveOnDestroy`・`fieldEvent` の condition に `{ ownHandAtLeast }`（N10：015・063）
  - `ownSpiritBattleEnded` に `familyFilter`（N6：006）
- 1c 付与・継続の軸
  - `keywordGrant.uncombinedFilter`（P5：031）
  - `summonFromHandFree.symbolCount`（P9：057）・`BraveConditionTerm.minSymbols`（P10：057）
  - `unblockableBy.costIn: number[]`（#3：043・044）・`immunityGrant.nameIncludes`（#4：043）・`reviveOnDestroy(ownAll).nameIncludes`（#5：044）
  - `symbolFix` の対象の絞り `colorFilter`・`minCores`（#14：072）
  - `heavyArmor` の `colorsFrom:"opponentFieldSymbols"`（P14：X04）
  - `noLifeDamageByCost` の `attackerCores`（#13：070）
  - `canDirectAttack.targetFilter` に `"hasSummonTrigger"`（N4：003）
  - `coreGainCap` を両陣営・`max:0` で（N13：063）
  - `reviveOnDestroy.revived` に `"handOrDeckTop"`（持ち主が選ぶ。#20：X05）

**バッチ2：規則（制約）**（1 は 2026-10-23 に済み。2 は 4 体並行：D=2a・2b part638〜639／E=2c・2d part640〜641／F=2e・2f part642〜643／G=2g part644〜645）
- 2a globalConstraint `{ type: "noDeckMill" }`：両陣営・常時。効果・コストの支払い（デッキを破棄するコストは払えない）・【粉砕】（0枚で成立）を止める。公開したカードの破棄は止めない（N1・P2・#8）
- 2b `noHandGainByEffect`（既存）の経路を、効果で手札に加わるものすべてに広げる（トラッシュ回収・オープンして加える・復活で手札へ・moveCards の手札行き）。止められたカードは「選ばれなかった」扱いで、効果の残りの行き先へ（048・BS15-052）
- 2c globalConstraint `{ type: "noBurstActivationByEvent"; events: FieldEvent[]; whileOwnAttackerFamily?: FamilyFilter }`：発生源の持ち主の相手が、その種類のバーストを発動できない（P1：022・023）
- 2d playerRule `{ type: "mustAttackOnce" }`（アタックできるスピリットがいる間は、そのターン1回もアタックせずにアタックステップを終えられない。P4：029）／constraint `{ type: "mustBeAttackTarget"; attackerMinCost: number }`（コストが以上の相手のスピリットは、発生源を指定してアタックしなければならない。疲労状態でも指定でき、ライフは狙えない。P7：035）
- 2e `flashLockWhileAttackingFamily` に `minSymbols?: number`・`cardType?: CardType`（family は省略可に。#10：053）
- 2f マジックの `useWindow?: "beforeBlock"`（相手のアタックステップのブロック前のフラッシュでだけ使える）／`cantUseHandCardsForPid.minCost?: number` と timedEffect の期間 `"beforeBlock"`（そのアタックのブロック宣言まで）（#17・#21：082・X06）
- 2g playerRule `{ type: "skipMainStep" }`（次の相手ターンのメインステップを飛ばす。#11：054）／手札コストの置き換え `costMod mode:"set"` を timedEffect で両陣営の手札へ（このターンの間、後から手札に入ったカードにも効く。#12：060）／globalConstraint `{ type: "noReductionGrantToHand"; sourceTypes }`（#7：047）／playerRule の `activeWhile?: { handAtLeast: number }`（制限を受ける側の手札枚数を毎回判定。P11：078）

**バッチ3：手順・イベント**（バッチ2 は 2026-10-23 に済み。6 体並行：H=3a part646〜647／I=3b・3d part648〜649／J=3c part650／K=3e part651〜652／L=3f part653〜654／M=3g part655）
- 3a fieldEvent `coresGainedFromVoid`（効果1回の解決ごとに1回。eventInfo に、コアが増えた側・個数・発生源の種別・**発生源の個体**・増えたコアの置き場所を持つ。ライフに置かれたときも含む。コアステップは効果ではないので含めない）。`subjectSide`／`opponentEffectSourceTypes` で絞る。参照は、破壊などの対象 `target:"eventSource"` と、増えたコアをボイドへ戻すアクション `voidGainedCores`。個数ぶん繰り返すのは既存の `repeatPerCount`（001・013・040）／fieldEvent `lifeCorePlaced`（どちらのライフでも、出所を問わない。041）
- 3b fieldEvent `anySpiritSummoned` に `subjectSide`（064 は相手側）／リフレッシュステップの回復は同時：陣営で数える `ownSpiritRefreshed`・`anySpiritRefreshed` は、1回のリフレッシュステップにつき陣営ごとに1回だけ発火する（066）
- 3c globalConstraint `{ type: "handTrashSpiritEffectsDisabled" }`（両陣営。手札・トラッシュにあるスピリットカードの効果を止める。範囲は RULES_BATSPI_WIKI §6。判定は1つの述語にまとめ、手札・トラッシュの効果を読む入口すべてから呼ぶ。052）
- 3d 継続効果 `exhaustPreventByPay { filter; bySourceTypes; cost }`（疲労するとき、1体ごとにコストを払うか選び、払えば疲労しない。デッキが破棄されない間は払えない。014）／`placeCores.from` を配列にし、`"ownSpirits"`（自分の他のスピリット）と `"life"` を足す。`to:"self"` と `to:"life"`＋`fillTo`（008・X01）
- 3e アクション `activateBurstIgnoringCondition { from: "set" | "revealed"; filter? }`（任意。きっかけの出来事に依存する部分は不発。発動しなかった公開カードは効果の残りの行き先へ。016・X05）／キーワード【バースト転召】（BURST.md §7.4。X01）
- 3f アクション `replayOpponentSummonEffect`（バーストのきっかけになった相手の『召喚時』効果を、自分のスピリット1体を選び、そのスピリットが発揮したものとして解決し直す。自分のスピリットがいなければこの部分は発揮しないが、CONJUNCTION の「その後」の規則どおり thenPay は払える。081）／アクション `revealOpponentBurst`（相手のバースト1つを両者に公開し、`last` に残す。続きは if で書く。084）
- 3g アクション `exhaustAndForceBlock`（§2 の 082 の細部どおり。疲労させた相手のスピリットを「この後のブロック宣言でブロックするスピリット」として記録し、ブロック前のフラッシュが終わったら、その個体でブロックする）


## 4. データ役への注意（部品バッチ1〜3 の実装役の報告から）

- `revived` は `{ handOrDeckTop: true }` のオブジェクト形（文字列ではない）
- 064・066 の `anySpiritSummoned`／`anySpiritRefreshed` は `selfMode:"source"` が必須（無いと実行者が相手になる）
- 013 は `sequence` に `passEventTarget:true`（イベントの対象を後続に渡す）。001 は fieldEvent の `eventSourceAsTarget`
- X01：`{kind:"keyword", keyword:"burstTensho", levels:[…], familyFilter:["覇皇"], dest:"void"}`。バーストは `sequence{keepScope:true, actions:[summonBurstCardFree, {type:"if", cond:{last:{cardType:"spirit"}}, then:placeCores(from:["ownSpirits","reserve"], to:"life", fillTo:5, count:"any")}]}`（召喚できなければ続きも起きない＝「この効果発揮後」）。X01 の「フィールド」にネクサスを含めるなら from に `"field"`
- 016：`step` 相手のエンドステップ＋`condition:{noAttacksThisTurn:true}`＋`activateBurstIgnoringCondition{from:"set", filter:{color:"purple"}, optional:true}`
- X05：`revealOpen 4` → `activateBurstIgnoringCondition{from:"revealed", optional:true}` → `moveCards{from:"revealed", count:"all", dest:"deckBottom"}`
- 084：`sequence{actions:[revealOpponentBurst, if{last:{cardType:"spirit"}} then discardOpponentBurst]}`（`sequence` のフィールドは `actions`）
- 060：`timedEffect content:[{type:"playerRule", rule:{type:"handCostSetForPid", value:8}}] duration:"turn" side:"both"`／054：`rule:{type:"skipMainStep"}` duration:"nextRefresh"
- 029 は globalConstraint `opponentMustAttackOnce`（playerRule ではない）
- **「相手のスピリットにブロックされない」と書かれた既存の12枚に `opponentOnly:true` を付ける**（082 で同じ陣営のスピリットがブロックできるように。付けないと陣営指定なしとして扱われる）
- データを書いたら `scripts/validate-cards.ts` の `AWAITING_MIGRATION` から BS18 の6つ（exhaustAndForceBlock・voidGainedCores・replayOpponentSummonEffect・revealOpponentBurst・activateBurstIgnoringCondition）を外す

## 5. 既知の限界（部品の段で受け入れたもの）

- 【転召】参照の竜使い系列との組み合わせ（BURST §7.4）は、`spiritHasKeyword(tensho)` が真になるところまでしか確かめていない
- coresGainedFromVoid の個数は効果前後の純増。同じ効果の中で減らすと相殺される。1つの効果で両陣営に増えたとき、置き場所の記録は後の陣営だけ
- 082：強制ブロッカーには防御側のブロック追加コストを課さない。相手を対向陣営と仮定して読む BP 系の参照（battlingOpponentSymbols 等）は同陣営バトルで 0／false
- exhaustPreventByPay：対話では疲労を確認の答えまで保留するので、同じ効果の「その後」は防ぐ前の盤面で動きうる
- placeCores の複数取り元は coreGainCap を見ない。行き先は self・life・reserve・trash だけ
- skipMainStep は追加のメインステップ（第2メイン）を飛ばさない
- noBurstActivationByEvent は「相手による」破壊かどうかを区別しない（いまの破壊後バーストはすべて相手による）
- 手札のフラッシュ封じのボタン連動はマジックだけ（スピリットの召喚ボタンは未対応）

**確認待ち（2026-10-23 ユーザーへ）**：082 の同陣営バトルで【呪撃】【光芒】を発揮するか（いまは発揮しない）／052 で、場から付与された【神速】も止まるか（いまは止めない）
