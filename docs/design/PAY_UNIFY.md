# 埋め込みコスト28種の `pay` 統一：現状調査（調査役、未実装）

`EffectAction` の `costXxx` 系フィールド28種・延べ約40か所を、汎用の器 `pay { cost, then }`
（`server/src/logic/actions/pay.ts`）へ移す前の事実集め。正解は決めない。COST_MODEL.md §1・§2・§2.5 が一般則。

## §1 1フィールド1行の表

| フィールド | か所数 | 何を払うか | 払えないとき今は | 効果が解決できないとき今は | 犠牲を選ばせるか | §1 適合 | pay移行時のcost側 | 根拠（行番号） |
| :-- | --: | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| costDiscardOwnBurst（coreRemove/coreGain経路） | 3 | 自分のバースト1つ破棄 | 効果も出ない | 払わない | 対象外（バーストは1つ） | 合う | 足りない：discard系がPAYABLE_TYPESに無い | cores.ts:63-78, coreGain.ts:17-30 |
| costDiscardOwnBurst（voidCoreToSelf経路） | 1 | 同上 | 効果も出ない（B未確認） | **先に払ってから判定** | 対象外 | **合わない**：self/コアステップ確認前に支払う | 同上 | coreGain.ts:70-80（B確認は再入後のみ） |
| costDiscardOwnBurst（bpBuff経路） | 1 | 同上 | 効果も出ない（B未確認） | **先に払ってから対象探索** | 対象外 | **合わない**：コメントが明言 | 同上 | buff.ts:131-142 |
| costSelfCoresToTrash | 3 | 自身の上のコアN個→持ち主トラッシュ | 効果も出ない | 払わない | 対象外（同種コア） | 合う | 足りない：selfコア消費系が無い | exhaustRefresh.ts:434-440, 646-654 |
| costReserveToVoid | 3 | リザーブのコアN個→ボイド | 効果も出ない（B先確認） | 払わない | 対象外 | 合う | 足りない：reserve払い系が無い | battleFlow.ts:292-311, exhaustRefresh.ts:617-625 |
| costDestroyOwnSpirit | 3 | 自分のスピリット1体破壊（minCost条件あり） | 効果も出ない | destroy.tsのみ両方確認／coreGainはB自明成立 | 候補2体以上で選択 | 合う | destroyがPAYABLE_TYPES済み。minCost条件は絞り込みfilterで表現可 | coreGain.ts:20-33, destroy.ts:239-260 |
| costHandDiscardOne | 3（destroy2+buff1） | 自分の手札1枚破棄 | 効果も出ない | 払わない | 候補2体以上で選択（destroy.ts） | 合う | discardSelfChooseがPAYABLE_TYPES済み | destroy.ts:282-327, buff.ts:72-100 |
| costDestroyOwnFamily | 3（battleFlow/drawDiscard） | 指定系統の自分のスピリット1体破壊 | 効果も出ない | 払わない（drawDiscardはB=deck.length未確認、下記§3） | 候補2体以上で選択 | battleFlowは合う／drawDiscardは**合わない疑い** | destroyがPAYABLE_TYPES済み、familyFilterはfilterで表現可 | battleFlow.ts:778-833, drawDiscard.ts:35-70 |
| costDestroyOwnNexus | 2（battleFlow/destroy） | 自分のネクサス1つ破壊（コア最少自動） | 効果も出ない | 払わない | 候補2体以上で選択 | 合う | destroyNexusがPAYABLE_TYPES済み | battleFlow.ts:836-850, destroy.ts:1233-1260 |
| costExhaustFamily | 2（grant/buff） | 指定系統の自分のスピリット1体疲労 | 効果も出ない | 払わない | 候補2体以上で選択 | 合う | 足りない：疲労系（exhaust）はPAYABLE_TYPESに無い | grant.ts:214-230, buff.ts:186-210 |
| costReturnOwnSpiritKeyword | 2（exhaustRefresh/bounce） | 指定キーワード持ち自分のスピリット1体を手札へ | 効果も出ない | 払わない | 候補2体以上で選択 | 合う | returnToHandがPAYABLE_TYPES済み、keywordFilterはfilterで表現可 | exhaustRefresh.ts:726-745, bounce.ts:301-330 |
| costReturnSelfToHand | 2（grant/buff） | 自身を手札へ戻す | 効果も出ない | 払わない | 対象外（自身固定） | 合う | returnToHandがPAYABLE_TYPES済み（selfを対象にできるか要確認） | grant.ts:341-358, buff.ts:119-129 |
| costExhaustSelf | 2（life/bounce） | 発生源自身（ネクサス）を疲労 | 効果も出ない | 払わない | 対象外（自身固定） | 合う | 足りない：exhaustはPAYABLE_TYPESに無い | life.ts:12-19, bounce.ts:287-297 |
| costMillSelfCount | 2（buff/life） | デッキ上からN枚を無条件破棄 | **N枚無くても「あるだけ」処理して払う** | 払う（後続処理は続行） | 対象外 | **合わない：09-24の「数も完全に」規則に反する（COST_MODEL.md自身が明記）** | 足りない：mill系が無い | buff.ts:145-157, life.ts:22-25 |
| costDestroyOwnKeyword | 1 | 指定キーワード持ち自分のスピリット1体破壊 | 効果も出ない | 払わない | 候補2体以上で選択 | 合う | destroyがPAYABLE_TYPES済み、keywordFilterはfilterで表現可 | trashRecover.ts:288-303 |
| costSkipDraw | 1 | そのドローステップのドローをスキップ | 払わない（回収0件のとき） | 効果（回収）成立後にのみ払う | 対象外 | 合う（効果先行だがフラグに失敗が無いため安全） | 足りない：ステップスキップ系が無い | trashRecover.ts:209 |
| costReserveToTrash | 1 | リザーブのコアN個→トラッシュ | 効果も出ない | 払わない | 対象外（同種コア） | **合わない：count>=2のとき候補1体でも払える（コメントで保留中と明記）** | 足りない：reserve払い系が無い | bounce.ts:360-389 |
| costSelfCoresToVoid | 1 | 自身の上のコアN個→ボイド（維持コア割れ回避） | 効果も出ない | 払わない | 対象外 | 合う | 足りない：selfコア消費系が無い | exhaustRefresh.ts:634-641 |
| costDestroyOwnSpiritSameCost | 1 | 自分のスピリット1体破壊（破壊したコストと同額の手札のみ召喚可） | 効果も出ない | 払わない | 候補2体以上で選択 | 合う | summonFromHandFreeはPAYABLE_TYPES外。cost一致条件が動的（破壊対象依存）で表現しづらい | battleFlow.ts:950-990 |
| costSkipCoreStep | 1 | そのコアステップのコア配置をスキップ | **B未確認のまま無条件にフラグを立てる** | 払う（効果は後続で通常判定） | 対象外 | **合わない：draw側のdeck.length未確認で先に払う** | 足りない：ステップスキップ系が無い | drawDiscard.ts:79-80 |
| costOwnFieldCoresToVoid | 1 | 自分のフィールド（スピリット+ネクサス）合計コアN個→ボイド | 効果も出ない | 払わない | 対象外（自動で最多個体から） | 合う | 足りない：フィールド合計払い系が無い | cores.ts:365-377 |
| costDestroyOwnVanillaSpirit | 1 | 効果の記述を持たない自分のスピリット1体破壊 | 効果も出ない（refreshSelf冒頭で自明self.isRested確認済み） | 払わない | 候補2体以上で選択 | 合う | destroyがPAYABLE_TYPES済み、vanilla条件はfilterで表現可 | exhaustRefresh.ts:688-700 |
| costDestroySelfAndCostFilter | 1 | 自身＋コストmin以上の自分のスピリット1体を破壊 | 効果も出ない | 払わない | 候補2体以上で選択（selfは固定） | 合う | summonFromHandFreeはPAYABLE_TYPES外。「自身＋他1体」の複合破壊はdestroy単体で表現しづらい | battleFlow.ts:883-940 |
| costReserveCoreToTrash | 1 | リザーブのコア1個→トラッシュ | 効果も出ない | 払わない | 対象外 | 合う | summonFromTrashFreeはPAYABLE_TYPES外。足りない：reserve払い系 | battleFlow.ts:1209-1224 |
| costReturnOwnBrave | 1 | 自身に合体しているブレイヴ1つを手札へ | 効果も出ない（refreshSelf冒頭でself.isRested確認済み） | 払わない | 候補2体以上で選択 | 合う | 足りない：ブレイヴ切り離し払いは returnToHand と別処理（detachBraveByEffect） | exhaustRefresh.ts:763-780 |
| costOwnLifeToReserve | 1 | 持ち主のライフのコアN個→リザーブ | 効果も出ない（refreshSelf冒頭でself.isRested確認済み） | 払わない | 対象外 | 合う | 足りない：ライフ払い系が無い（lifeCostBlockedByFloor考慮も必要） | exhaustRefresh.ts:661-684 |
| costSelfToTrash | 1 | **対象外**：`ownLifeFloor` constraintの一部で、「Aすることで、Bする」の任意効果ではなく、ライフ0を止める自動処理 | — | — | — | — | pay対象外（COST_MODEL.md §9で別枠として確定済み） | EffectModules.ts:499-540 |
| costReserveToTrashFromBofu | 1 | リザーブのコアを実効【暴風】数ぶん→トラッシュ | 効果も出ない（bofu==0またはreserve不足） | **B（countFromBofu体数ぶんの疲労）未確認のまま払う** | 対象外 | **合わない：数どおり疲労させられるか未確認で先払い** | 足りない：暴風連動払いが無い | exhaustRefresh.ts:48-58（B確認は後続のcountFromBofu処理、失敗しても払い戻さない） |
| costDiscardOwnHandOne | 1 | 自分の手札1枚（末尾）破棄 | 効果も出ない | **B（deck.length>=count）未確認のまま払う** | 対象外（末尾固定） | **合わない** | discardSelfChooseがPAYABLE_TYPES済み（ただし本カードは「好きな1枚」でなく末尾固定の簡略化） | drawDiscard.ts:20-33 |
| costOwnLifeToVoid | 1 | 自分のライフのコアN個→ボイド（lifeCostBlockedByFloor考慮） | 効果も出ない | 払わない | 対象外 | 合う | 足りない：ライフ払い系が無い | destroy.ts:334-354 |

## §2 足りないもの

`PAYABLE_TYPES`（`pay.ts:15-18`）に無い cost 側の型・軸:

- **コア払い系**：リザーブ→ボイド/トラッシュ、自身の上のコア→ボイド/トラッシュ、フィールド合計コア→ボイド、ライフ→リザーブ/ボイド。現行 `PAYABLE_TYPES` にコア移動アクションが1つも無い（`coreRemove`/`removeCores` はスピリット**から**取る形のみで、リザーブ・ライフ・フィールド合計は対象外）
- **疲労払い**：`exhaust`（`costExhaustFamily`/`costExhaustSelf`/`costReserveToTrashFromBofu`のB側）
- **手札破棄「末尾固定」**：`discardSelfChoose` はプレイヤーが選ぶ前提。`costDiscardOwnHandOne`（末尾固定の決定的簡略化）はそのままでは載せられない
- **ステップスキップ**：`costSkipDraw`／`costSkipCoreStep`（`state.drawStepSkipped`/`state.coreStepSkipped` を立てるだけの副作用）
- **複合破壊**：`costDestroySelfAndCostFilter`（自身＋他1体の同時破壊）、`costDestroyOwnSpiritSameCost`（破壊対象のコストが召喚候補の絞り込み条件になる、cost側とthen側が相互依存）
- **ブレイヴ切り離し**：`costReturnOwnBrave`（`detachBraveByEffect` 経由で `returnToHand` とは別処理）
- **then側（summonFromHandFree / summonFromTrashFree）のchecker**：`PAYABLE_TYPES` に無いため、`costDestroyOwnFamily`/`costDestroyOwnNexus`/`costDestroyOwnSpiritSameCost`/`costDestroySelfAndCostFilter`/`costReserveCoreToTrash` はB側判定を汎用checkerで共有できない

## §3 挙動が変わるもの（相談材料）

1. **costMillSelfCount（buff.ts:145-157／life.ts:22-25）**
   今：デッキがN枚無くても`Math.min(N, deck.length)`枚だけ破棄して常に成立する（コメントが明言：「あるだけ処理してコストも払う」）。
   pay に移すと：COST_MODEL.md §1の2026-09-24確定則（「数も完全に」）により、デッキがN枚未満なら**発揮不可**（破棄も回避）になる。
   影響カード：BS13-058 シユウ（5枚）／BS13-060 トレス・ベルーガ（6枚）。**COST_MODEL.md自身がこの2枚を「M1で書き換える」と予告済み**（smoke part178との関係も要確認）。

2. **costReserveToTrash（bounce.ts:360-370、コメントで「保留中」と明記）**
   今：`action.count`が2以上でも、戻せる候補が**1体**いれば発動できる（体数ぶんの達成は見ていない）。
   pay に移すと：候補が`count`体（例：2体）そろわなければ発揮不可になる。
   影響カード：BS07-X26 剣王獣ビャク・ガロウLv2（コスト1個で相手2体を手札に戻す）。**COST_MODEL.md §1の例示（行45-49）そのもの**。

3. **costDiscardOwnBurst（voidCoreToSelf経路・coreGain.ts:70-80／bpBuff経路・buff.ts:131-142）**
   今：バーストの有無だけ確認して即座に破棄し、その後で自身の有無／コアステップかどうか／対象探索を確認する（B未確認のまま支払う）。
   pay に移すと：Bが成立しない場面（コアステップ外、対象なし）ではバーストを破棄せずに発揮不可となる。
   影響カード：BS15-022 アナグマッド・デビル（voidCoreToSelf）。bpBuff経路は該当カード名がpay-pack.mdに載っておらず未特定（要追跡）。

4. **costDestroyOwnFamily（drawDiscard.ts:35-70）／costSkipCoreStep（drawDiscard.ts:79-80）／costReserveToTrashFromBofu（exhaustRefresh.ts:48-58）**
   今：いずれもB側（`deck.length >= count`のドロー可否、または暴風数ぶん疲労させられるか）を確認せずに先に支払う。
   pay に移すと：デッキ残量不足・疲労対象不足のときは支払わなくなる。
   影響カード：BS13-X02 蛇皇神帝アスクレピオーズ（ドロー3、デッキ3枚未満で今は払い損）／BS10-087 戦場に息づく命（デッキ0枚でも今はコアステップをスキップしてしまう）／BS15-026 軍師鳥ショカツリョーLv2（疲労対象が暴風数に満たなくても今は払ってしまう）。

5. **costDiscardOwnHandOne（drawDiscard.ts:20-33）**
   今：手札があれば末尾1枚を破棄し、その後ドロー処理へ進む（`deck.length>=count`未確認）。
   pay に移すと：デッキが尽きていれば発揮不可（手札を破棄しない）になる。
   影響カード：BS15-040 ネコマーダ（ドロー1）。

## 最終報告

| 項目 | 値 |
| :-- | --: |
| §1 の行数 | 28行（未確認0件、全行コードを実読） |
| §2 の項目数 | 8項目（コア払い系はさらに4軸に細分） |
| §3 の項目数 | 5項目 |
| §3 上位3件 | ①costMillSelfCount（デッキ不足でも成立、COST_MODEL.md既に予告）／②costReserveToTrash（体数2以上で候補1体でも成立、COST_MODEL.mdの例示カード）／③costDiscardOwnBurst 2経路（B未確認のまま先払い） |
| 相談事項 | (a) costMillSelfCountとcostReserveToTrashは09-24規則の適用対象として明示済みなので、pay移行と同時に直してよいか。(b) costDiscardOwnBurst/costDestroyOwnFamily(drawDiscard)/costSkipCoreStep/costReserveToTrashFromBofu/costDiscardOwnHandOneの「B未確認先払い」5経路は§1違反の新規発見（COST_MODEL.mdに未記載）。pay移行で自動的に直る（checker必須になるため）が、影響カード（アナグマッド・デビル／アスクレピオーズ／戦場に息づく命／ショカツリョー／ネコマーダ）の挙動が変わることをどこまで一括で許容するか。(c) PAYABLE_TYPESに無い「コア払い」「疲労払い」「複合破壊」の3軸は、pay移行前にcost側のchecker設計が要る（§2）。 |

## §4 移行計画（2026-09-26。一般則は COST_MODEL §1 の確定どおり＝コストか効果のどちらかが完全に解決できないなら、払わずに発揮しない。§3 の8枚もこれに揃える）

`pay { cost, then }` へ移すには、cost 側の部品（その支払いを書ける action と、完全に払えるかの判定）と、
then 側の判定（その効果が完全に解決できるか）の両方が要る。then 側は host の action type ごとに1つずつ判定を足す。

**段階1：cost 側の部品（器の PR）**
| 部品 | 中身 | これで書けるフィールド |
| :-- | :-- | :-- |
| removeCores の判定を広げる | 取り先（reserve・trash・nexus）・自分自身（target self）・countCounter を数えられるようにする | costSelfCoresToTrash・costSelfCoresToVoid・costReserveToVoid・costReserveToTrash・costReserveCoreToTrash・costOwnFieldCoresToVoid・costReserveToTrashFromBofu（countCounter selfBofuCount） |
| exhaust に side と自分自身 | `side?: "own"`・`target?: "self"` を足し、判定を足す | costExhaustFamily・costExhaustSelf |
| mill の判定 | デッキが count 枚以上 | costMillSelfCount |
| discardBurst { side } | 旧 discardOpponentBurst を置き換え（自分のバーストも捨てられる）、判定はバーストがセットされているか | costDiscardOwnBurst |
| 既存の部品で書けるもの | destroy・destroyNexus・returnToHand・discardSelfChoose（手札は選ばせる） | costDestroyOwnSpirit／Family／Keyword／VanillaSpirit・costDestroyOwnNexus・costReturnOwnSpiritKeyword・costReturnSelfToHand・costHandDiscardOne・costDiscardOwnHandOne |

**判定の原則（2026-09-26 ユーザー指摘）**：cost 側の「完全に払えるか」は数だけでなく、**支払いを止める効果**まで見る。実際に払う処理と同じ判定を使う（ライフのコア＝永久凍土の王都 `lifeCostBlockedByFloor`（COST_MODEL §9）、スピリットのコア＝バトル中の保護・下限・「取り除けない」、手札＝`canDiscardHand`、疲労＝既に疲労している等）。払えないと分かったら cost も then も何もしない（途中まで払って止まる状態を作らない）。
**段階1の追加**（済み。2026-09-27）：ライフのコアを払う部品は `removeCores { from: ["life"] }`。誘発のコスト（太陽石の神殿など3枚）は効果定義の cost のまま（アクションではなく、王都の判定も入っているため）。

**段階2：then 側の判定**：段階1で書けるフィールドの host（bpBuff・refreshSelf・refreshOne・draw・returnToHand・destroy・summonFromHandFree・summonFromTrashFree・exhaust・placeCores・recoverSpiritFromTrash など）に、完全に解決できるかの判定を1つずつ足す。
**段階3：カードの移行**：フィールドを消し、pay{cost, then} に書き換える（§3 の8枚は挙動が変わるので PR に表で書く）。旧 coreGain・lifeCharge・voidCoreToSelf のコスト付き4か所と revealHandMagicToTegamotoDraw もここで placeCores・reveal へ移す。

**移さないもの（理由つき）**：costSkipDraw・costSkipCoreStep（ステップを飛ばす部品が無い。1枚ずつ）／
costReturnOwnBrave（ブレイヴの分離は別処理）／costDestroySelfAndCostFilter・costDestroyOwnSpiritSameCost（破壊したものが召喚の条件になる＝直前の結果を見る if が要る）／costSelfToTrash（対象外）

## §5 段階3の変換規則（2026-09-26。host の action から costXxx を外したものが then、下が cost）

| フィールド | cost |
| :-- | :-- |
| costDiscardOwnBurst | `discardBurst { side: "own" }` |
| costHandDiscardOne・costDiscardOwnHandOne | `discardSelfChoose { count: 1 }`（捨てる手札は選ばせる。§2） |
| costReserveToVoid N／costReserveToTrash N／costReserveCoreToTrash | `removeCores { side: "own", from: ["reserve"], to: "void"／"trash", count: N（CoreToTrash は1） }` |
| costSelfCoresToTrash N／costSelfCoresToVoid N | `removeCores { side: "own", target: "self", to: "trash"／"void", count: N }`（旧ハンドラが維持コアを割らない条件を持つなら `leaveAtLeast` 等で同じ条件にする） |
| costOwnFieldCoresToVoid N | `removeCores { side: "own", from: ["spirit", "nexus"], to: "void", target: "spread", count: N }` |
| costReserveToTrashFromBofu | `removeCores { side: "own", from: ["reserve"], to: "trash", count: 1, countCounter: "selfBofuCount" }` |
| costDestroyOwnSpirit（true／{minCost}） | `destroy { side: "own", count: 1, filter: { cost: { min } } }` |
| costDestroyOwnFamily／Keyword／VanillaSpirit | `destroy { side: "own", count: 1, filter: { family／keyword／vanilla } }` |
| costDestroyOwnNexus | `destroyNexus { side: "own", count: 1 }` |
| costExhaustFamily／costExhaustSelf | `exhaust { side: "own", count: 1, filter: { family } }`／`exhaust { target: "self", count: 1 }` |
| costReturnOwnSpiritKeyword | `returnToHand { side: "own", count: 1, filter: { keyword } }` |
| costReturnSelfToHand | `returnSelfToHand`（pay の判定を足す：自身が場にいる） |
| costMillSelfCount N | `mill { side: "own", count: N }` |

then の書き換え：旧 coreGain → `placeCores { from: "void", to: "reserve" }`、旧 voidCoreToSelf → `placeCores { from: "void", to: "spirit", target: "self" }`、旧 lifeCharge → `placeCores { to: "life", from }`、
旧 coreRemove → `removeCores`（CORE_UNIFY_REMOVE §3 の対応）、旧 voidCoresFromField → `removeCores { side: "opponent", from: ["spirit", "nexus"], to: "void", target: "spread" }`。

**旧 type に残す**（then が cost の結果を見る＝if 待ち）：BS13-024（BP を疲労させたスピリットから取る）、BS13-060（破棄したカードの系統で回復）、BS13-058（「その後、このバトルの間ブロックされない」）、BS15-067（誘発のきっかけの1体だけを回復）。
このうち一般則に合っていない BS13-058・BS13-060 は、旧ハンドラで「デッキが N 枚以上あるか」を払う前に確かめる形に直す。
BS14-X03・BS13-027（costReturnSelfToHand）も残す（2026-09-27）：then の対象が「戻した自身以外」になる／「指定する」＝選ばせるのが cost 付きのときだけ、で、どちらも pay の then 判定（bpBuff は `excludeSelf` を見ない）では同じ条件を書けない。

どのカードも使わなくなった costXxx 16種は型・ハンドラ・smoke から消した（2026-09-27）。
