# 効果の対象の付け替え（【影武者】・古の魔王城・サンク系・魔導書）

「相手の効果の対象を、自分のスピリット1体（または片方の陣営）だけに変える」効果を、1つの部品で扱うための手順書。
#634（古の魔王城が単体対象・timedEffect・全体効果で発揮されない）を機に、2026-11-19 ユーザーと合意。

## 1. 規則（2026-11-19 ユーザー確認）

根拠は【影武者】の Q955〜Q968（バトスピWiki「影武者」の本文。長い回答は一部言い換え）と、古の魔王城の Q23559〜Q23568。

- **割り込むのは「同時に指定された対象が出そろった時点」に1回**。複数体を1体ずつ選ぶ UI でも、選び終えた後の1回（1文の中の複数の対象は同時）
- **同じ時点で指定されたフィールドのカードはまとめて付け替わる**：スピリット・ネクサス・ブレイヴ・アルティメット（Q962）。手札・トラッシュ・デッキ・バーストを対象にする部分は変わらない（Q961）
- **「その後」「効果発揮後」【連鎖】で区切られた部分は別の指定の時点**。前半の付け替えは後半に及ばず、後半には改めて割り込める（Q963）
- **効果の解決の前に割り込む**（Q955）。【影武者】は手札から召喚（コストを払う）するので、ここはプレイヤーの選択で中断できる場所にする
- **「すべて」を対象にする効果も付け替えられる**。付け替えた後は、ほかの対象（相手側のものも含む）は効果を受けない（Q956・Q957・Q23559）
- **一騎打ちの指定にも割り込める**（Q964）
- **割り込めないもの**：常時効果（フィールドにいる間ずっと働く効果。ステップ限定のものも含む。Q958 ラカン・Q966 子フィンクス）、すでに発揮している効果（Q965・Q968）。「このターンの間、1体をBP+」のように使った時点で対象を決めて続く効果は、使った時点なら割り込める、バースト効果そのもの（Q23567）、【連鎖】の部分（Q23568）、持続効果（Q23566）
- **1つの指定の時点で割り込めるのは1回**。付け替えで新しく対象になったスピリットを起点に、別の付け替えは起きない（Q960）。【影武者】を同時に複数出すことはできる（Q959）
- **付け替え先の条件はカードで違う**
  - 古の魔王城：「その効果を受ける自分のスピリット」＝効果の条件に合い、効果を受けられるものだけ選べる。未選択の個体も選べる（Q23560・Q23562・Q23564）
  - 【影武者】：条件に合わなくても付け替えられる。合わなければ効果は空振りする（Q956・Q957）
  - サンク系（サンク・ケット・シー・スノーホワイト・ティンカ）：付け替え先は「このスピリット」
  - 魔導書（封印された・開かれし）：お互いを対象にするマジックの効果を、片方の陣営だけに絞る
- **「このターンの間、相手のスピリットすべては〜」も使った時点なら付け替えられ、付け替えた後はその1体だけに効く**（後から出たスピリットにも効かない。対象がその1体に置き換わるため。直接の裁定は無い。2026-11-19 ユーザー確認）
- **同じ指定に付け替えの効果が2つ以上かかるときは、持ち主が使うものを選ぶ**（1つの指定で付け替えは1回。Q960）。各効果の付け替え先の候補をまとめて1回の確認にし、選ばれた個体を付け替え先にできる効果を使う（2026-11-19 ユーザー確認）
- **サンク系も「すべて」の付け替えで相手側が外れる**（魔王城 Q23559 と同じ扱いにそろえる。2026-11-19 ユーザー合意）

## 2. 部品（2026-11-19 ユーザー合意）

**対象を決める段（指定の段）を共通の関数に切り出し、各ハンドラがそれを呼ぶ**。割り込みは action 1個の単位で、1文に複数の action が並ぶカードは実質無い（SD06-014 爆烈十紋刃は destroy の types で1つにまとめ直す。BS04-108 は simultaneous を1回の指定として扱う）。

### 2.1 データ：`kind: "targetRedirect"`（`magicTargetRedirect`・`bothSidesTargetRedirect` を置き換える）

```ts
| { id: string; kind: "targetRedirect"; levels: number[] | null; turn?: "own" | "opponent"; phase?: Phase
    sourceTypes?: CardType[]                 // 付け替えられる相手の効果の発生源の種類（省略＝問わない）
    includes: "self" | "own" | "bothSides" | { filter: TargetFilter } // 起きる条件：同時に指定された対象に何が含まれるか（持ち主側から見て）
    to: "self" | "chosenOwn" | "side"         // 付け替え先（【影武者】の取り込み時に "summoned" を足す）
    requireReceivable?: true                 // 付け替え先は、その指定の候補に入り、効果を受けられるものに限る
    optional?: true }
```

| カード | includes | to | sourceTypes | requireReceivable |
| :-- | :-- | :-- | :-- | :-- |
| サンク BS04-054 | self | self | magic | true（今の `redirectTargetMatches` と同じ） |
| ケット・シー BS06-056 | {filter:{cost:2}} | self | magic | true |
| スノーホワイト BS05-040 | {filter:{family:["氷姫"],color:"white"}} | self | spirit,magic | true |
| ティンカ BS09-038 | {filter:{family:["楽族"]}} | self | spirit,magic | true |
| 古の魔王城 BSC05-017 | own | chosenOwn | spirit,magic | true |
| 封印された／開かれし魔導書 | bothSides | side | magic | なし |

### 2.2 エンジン：`server/src/logic/designation.ts`（新設。ownTargetChoice.ts はここへ移して消す）

```ts
// 指定の段：同時に指定された対象が出そろった時点で呼ぶ。付け替えの割り込みを挟み、決まった対象を返す。確認を出したら null
export function settleTargets(ctx: ActionCtx, action: EffectAction & PickProgress, ids: string[], candidates: string[], attempt: EffectAttempt): string[] | null
```

- `candidates`＝その指定で取りえた候補（pickTargets の `opts.candidates`、「すべて」なら集めた全体）。`chosenOwn` の選択肢は「対象の持ち主のスピリットで、candidates に入り、耐性で弾かれないもの」。未選択の個体も選べる（Q23564）
- 付け替えたら、返す対象は付け替え先1体だけ（相手側・ネクサスも外れる。Q23559・Q962）。`side` なら、その陣営のものだけ残す
- 割り込みの済んだ印は action の `picked` に入れて運ぶ（`PickedTargets.ownRedirectAsked` を `settled?: true` に改める）。state には置かない
- 割り込めないもの：バースト効果（`currentEffectSource.burst`）・【連鎖】の部分（`action.rensa`）。発生源の種類は `ctx.srcType` を `sourceTypes` と照らす。**どの入口（マジック・誘発・起動・fieldEvent）から来ても同じ判定**になる
- 非対話（`interactiveTargets` が偽）は付け替えない（今の魔王城と同じ）。サンク系・魔導書の非対話の既定は §2.3 の3で移すときに決める
- 順番：指定（選ぶ）→ settleTargets → 耐性と円卓（`gateTargetedApply`）→ 適用。【迷彩】は今は適用の段で払っており、指定の段へ移すかは後で決める（未決）

### 2.3 移行の順番（PR を分ける。移していない action は今のまま動く）

1. designation.ts を作り、`gatePickedTargets` の中の `ownTargetRedirect` を `settleTargets` に置き換える。魔王城のデータを `targetRedirect` に移す。単体対象でも聞き、候補を未選択の個体まで広げる（#634 のフレイムガスト）
2. 「すべて」と timedEffect を指定の段に乗せる（#634 の残りの場面）。2本に分ける
   - 2a「すべて」（G4）：一覧を作る関数（例 `destroyAllTargetList`）の直後に `settleTargets(ctx, action, 一覧, 一覧, attempt)` を挟み、返った ids で一覧を絞って適用する。確認の間は盤面が変わらないので、再入では一覧を作り直してよい（picked.settled が答えを運ぶ）
   - 2b-1 timedEffect の主な経路（#647）：①振り分けの末尾の汎用（相手N体に cantAttack 等）は「1体選ぶ→適用→次」をやめ、`pickTargets` で全部選んでから `settleTargets`→適用（#437 SP-1 と同じ）②`placeAny` は確定した集合を `settleList` ③`placeBp` は1体が決まった後に `settleTargets([その1体], 候補)`。付け替えの答えで再入したら `picked` から対象を取る ④`placeRule`（「すべて」のルール型）は今の該当個体を `settleList` に通し、付け替えたらその1体に置く記録（`apply`）へ切り替える
   - 2b-2 残りの place*：placeLevel・placeRule の Lv 分岐・placeSymbolOrCost・placeSymbolLossRule・placeColor・placeUnblockable・placeCountAs。形は 2b-1 の placeBp（1体）・placeRule（すべて）と同じ。battleLock はプレイヤーへの制限でスピリットを対象にしないので対象外
   - 未決：きっかけの出来事で対象が決まるもの（ベトール BS12-037「アタックしたとき、そのスピリットのBPを2000として扱う」の placeEventTargetBpAs）を付け替えられるか
2c. **3 より先に**、1体ずつ耐性を見ている残りの経路（G2・G5 の個体指定。gateTargetedApply／resistanceAgainst を直接呼ぶ約16か所）に `settleOne`（designation.ts）を挟む。サンク系は今 `magicRedirectTo`＋耐性の入口で全経路に効いているので、先に指定の段を全経路に通さないと 3 で効かなくなる経路が出る
3. 3a サンク系：`settleTargets` を一般化する（発生源を全部集め、includes で起きるかを判定し、各効果の付け替え先の候補をまとめて1回の確認。to:"self" の候補は発生源自身）。非対話は to:"self" なら自動で付け替え（今のサンク系と同じ）、chosenOwn は付け替えない。データ4枚を移し、`magicRedirectTo`・`magicRedirectDecision`・使用時の確認（pendingChoice.magicRedirect）・耐性の入口の ① と `magicRedirect` カテゴリ・`setTargetRedirect` ほか・`magicTargetRedirect` を消す
   3b 魔導書：データを `targetRedirect`（includes:"bothSides"・to:"side"・sourceTypes:["magic"]）に移し、今の仕組み（magic/redirect.ts の `findBothSidesRedirectSource`・`bothSidesPids`）が新しい型を読むようにして `bothSidesTargetRedirect` を消す。**確認はマジックを使った時点で1回のまま**（2026-11-19 ユーザー確認）。Q21940・Q22088「その対象を相手のみ／自分のみにして使える」が使う時点で決める読みに合い、陣営で絞るので選ばれた個体に左右されない
   - 未決：答えを `state.magicSideDecision` に置く形は残る（設計の3原則の3から外れる）。候補を集める共通の関数（`pickAnySideCandidates` ほか）が state だけを受け取り中断できないため。明示的に運ぶなら、それらを ctx を受け取る形に作り替える
   （元の文）サンク系・魔導書を `targetRedirect` に移し、`magicRedirectTo`・`magicRedirectDecision`・`magicSideDecision`・`magicTargetRedirect`・`bothSidesTargetRedirect` を消す
4. 残り（G2・G5 のコア・指定アタック・持ち主が選ぶもの）

## 3. 入口の洗い出し（調査役の報告。2026-11-19。確認済み＝コードを読んだ／推測＝名前から判断）

### 3.1 効果の使用の入口（確認済み）

どの経路も最後は `resolveAction`（EffectModules.ts:1383）に集まり、`ACTION_HANDLERS[action.type]` を呼ぶ。`sequence`（actions/control.ts:118）は子を `resolveInOrder` で1つずつ `ctx.resolve` する（中断時は残りを再開スタックへ）。**割り込み点を共通の1か所に置くなら resolveAction が唯一の候補**（ただしここは action 1個の単位。「1文の中の複数の対象は同時」の単位とは違う→未決1）。

| 経路 | 解決が始まる所 | 付け替えの掛け方（現状） |
| :-- | :-- | :-- |
| マジック | magic/cast.ts `resolveMagicInner` → 無効化の確認 → サンク系の確認(:99-125) → 魔導書の確認(`askBothSidesRedirect` :133) → `resolveMagicEffects` → `runMagicActions`(resolve.ts:202) → `runMagicEntryAction`(:187) | **使用の確認の段**（対象が決まる前）に2回聞き、`runMagicActions` が `setTargetRedirect`（:227）で `magicRedirectTo` を立て、抜けるとき3か所で delete（:244・252・257） |
| スピリット／ブレイヴの誘発 | triggers.ts `resolveEntry`(~:540-556) と `entryFrame`(:566-580)（同時発揮の列・中断の残り） | `setTargetRedirect`（:550）→ `resolveAction` → delete（:554）。ネクサス発生源は対象外。列で後回しにしたものは frame の `redirectTarget:true`（types/choice.ts:421）を choice.ts:840 が読んで立て直す |
| 付与された誘発（grantedActions） | triggers.ts:611・633・700 | 付け替えなし（掛けていない。**漏れ**の可能性。推測） |
| fieldEvent 誘発 | fieldEventTriggers.ts:648・671 | 付け替えなし（確認済み＝呼び出しに setTargetRedirect が無い） |
| 起動能力 | stepTriggers.ts:375・400・404 ほか | 付け替えなし |
| バースト | keywords/burst.ts:179・478・523、handBurstEffect.ts:46（`burst:true` を渡す） | 付け替えなし。規則上もバースト効果そのものは対象外（Q23567）で一致 |
| マジックの税・支払い後 | magic/payThenResolve.ts:31 | `magicRedirectTo` は立たない（推測。要確認） |
| 中断からの再開 | choice.ts:355〜781（`pending.action` を `resolveAction` へ）、choice.ts:844 | `redirectTarget` の frame のときだけ立て直す。**pendingChoice の通常の再開では `magicRedirectTo` は消えている**（resolve.ts:244・252 で delete）ので、選択待ちの後ろ半分は付け替えが効かない（推測。smoke で確認すべき） |

### 3.2 対象の指定が出そろう地点（action の type 別）

**A. 選んで gatePickedTargets（pickTargets.ts:92）を通る**（確認済み。付け替えの `ownTargetRedirect` はここにだけ入っている）

| action | 場所 |
| :-- | :-- |
| destroy（選ぶ・「N体まで」） | destroy.ts:205（eachChosen 経路）・:373 |
| returnToHand / bounce（スピリット・ネクサス・ブレイヴ） | bounce.ts:307・:469・:733 |
| exhaust / refresh | exhaustRefresh.ts:400 |

**B. 選ぶが gatePickedTargets を通らない**（`gateTargetedApply` を1体ずつ呼ぶ／`resistanceAgainst` を直接呼ぶ）。**魔王城はここに効かない（#634 の原因）**

| action | 場所 | 呼び方 |
| :-- | :-- | :-- |
| exhaust（1体・サイドを問わない） | exhaustRefresh.ts:515・553・311・656 | gateTargetedApply／resistanceAgainst |
| refresh 系（markNoRefreshTarget ほか） | exhaustRefresh.ts:897 | gateTargetedApply |
| timedEffect の BP・ルール・アタック/ブロック不可・レベル等 | timedEffect.ts:410(placeRule)・:523(placeLevel)・:617 ほか | gateTargetedApply／resistanceAgainst |
| bpMinus（単体） | buff.ts:94 | resistanceAgainst |
| removeCores（個体指定） | removeCores.ts:393 | resistanceAgainst |
| moveCoresLeavingOne | cores.ts:310 | gateTargetedApply |
| grant 系（targetChoiceLend・pickSingleTarget） | grant.ts:337 | gateTargetedApply |
| detach／destroyBrave／removeOneOfAnyType | braveTargetGate.ts:26・34、battleFlow.ts:1472 | gateTargetedApply／resistanceAgainst |
| exhaustAndForceBlock | forcedBlock.ts:46 | resistanceAgainst |
| designate（「指定する」。後続が lastTarget で使う） | designate.ts（耐性は pickEnemyCandidates の probing のみ。**適用点が無い**） | 候補列挙のみ |
| bounce の一部（returnOpponentBrave :239、destroy :275、exhaust :311） | 上記ファイル | resistanceAgainst |

**C. 「すべて」を対象にする**（scope:"area"。確認済み）

| action | 場所 |
| :-- | :-- |
| destroy all（destroyAllTargets / destroyAllTargetList） | destroy.ts:445・:409（:422・:432・:529 で isResisted）、simultaneous（control.ts:134）も同関数を共用 |
| exhaust all / refresh all | exhaustRefresh.ts:427・:440・:585 |
| returnToHand all / returnToDeck all | bounce.ts:536・:562・:601 |
| bpBuffAll・bpMinus all | buff.ts:61 |
| removeCores（all・spread） | removeCores.ts:765 ほか |
| coreDrainAllOthers／swapOpponentCores | cores.ts:108・:353 |
| timedEffect の side:"both"・area（placeBp ほか） | timedEffect.ts:121・:552・:723・:952（`bothSidesPids`） |
| draw / discard の side:"both" | drawDiscard.ts:46・65・131（両陣営だが「対象」はプレイヤー。付け替え先が陣営だけなら魔導書側の話） |

**D. 一騎打ち（指定アタック）**：エンジン内に「一騎打ち」の語は無く、実体は `battle.directed`／`directedTargetInstanceId`（確認済み）。経路は3つ。
- 効果の `directAttack`（battleFlow.ts:1391。候補は `targetableSpirits`＋`matchesDirectedAttackFilter`。耐性の関門なし）
- 能力による宣言時の指定（GameEngine.ts:1195 `doAttack` の `targetSpiritInstanceId`）
- ブロックの成立点（battleResolve.ts:308 `resolveDirectedBlock`。ここで `boardResistanceAgainst` を1回だけ通す）
→ 「指定が出そろう」のは宣言（2番目）か効果（1番目）の時点で、3番目は成立点。付け替えるなら前の2つ（未決2）。

**E. 相手（対象の持ち主）が選ばされる**（chooserIsTarget。CHOOSER_RULES.md。確認済み）：`pickTargets` の `chooserPid`（pickTargets.ts:25・56）、destroy の `chooserIsTarget`（destroy.ts:183〜367。自動選択の `pickEnemyCandidates` 経路含む）、tryInteractiveTargetChoice の `chooserPid`（targeting.ts:170）。**この場合の対象は「持ち主が選んだ自分のスピリット」なので、付け替えは相手＝持ち主自身の選択に対して起きる。「対象が出そろった」時点は選び終えた後で、付け替える側（影武者の持ち主）は選んだ側と同じこともある。規則（Q962〜）の確認が要る**（未決3）。

**F. 1つの action でスピリットとネクサスを同時に指定**（確認済み）：returnToHandNexusOrSpirit（bounce.ts:441）、removeOneOfAnyType（battleFlow.ts:1439）、exhaustNexusOrSpirit（exhaustRefresh.ts:476）、destroy の types（nexus 含む）。ここは候補の配列を1つに束ねて選ぶので、**束ねた後の1か所で付け替えを掛ければ両方まとめて覆える**。`applyBothSidesRedirectToCandidates`（triggers.ts→redirect.ts:86）はスピリットとネクサスの両方を見ている。

### 3.3 既存の付け替えの3つの仕組み（確認済み）

| 仕組み | 書く所 | 読む所 | 消す所 |
| :-- | :-- | :-- | :-- |
| `state.magicRedirectTo`（サンク系） | redirect.ts:122 `setTargetRedirect`（呼び出し：resolve.ts:227、triggers.ts:550、choice.ts:840） | **EffectModules.ts:186 `resistanceAgainst`** の ①（種別 magic/spirit のみ） | resolve.ts:244・252・257、triggers.ts:554、choice.ts:857、redirect.ts:113（立て直しの前） |
| `state.magicRedirectDecision` | redirect.ts:302（`applyMagicRedirectChoice`）、cast.ts:106 で delete | redirect.ts:119（`setTargetRedirect`） | cast.ts:106 |
| `magicTargetRedirect` の確認（pendingChoice.magicRedirect） | cast.ts:111-128 | choice.ts:677-688 → `applyMagicRedirectChoice` | — |
| `state.magicSideDecision`＋`askBothSidesRedirect`（魔導書） | redirect.ts:269（`applyMagicSideChoice`）、choice.ts:661-670 | redirect.ts:26 `bothSidesPids`（draw/discard/destroy/exhaust/bounce/timedEffect/removeCores/battleFlow ほか10か所）・:77 `bothSidesRedirectKeepPid`・:86 `applyBothSidesRedirectToCandidates`（targeting.ts:73、bounce.ts:394、destroy.ts） | redirect.ts:215（`askBothSidesRedirect` の冒頭で delete） |
| `ownTargetRedirect`（魔王城） | ownTargetChoice.ts:30（`picked.ownRedirectAsked` を action に載せて再入） | pickTargets.ts:103 だけ | picked が消えるとき |

廃止時に消す・置き換える：上の表の全行＋types/gameState.ts:54・58・73、types/choice.ts:274-290・421、shared/rules/resistance.ts:40（`magicRedirect` カテゴリ）、EffectModules.ts:169-195 の ①、effectDefContinuous.ts の `magicTargetRedirect`・`bothSidesTargetRedirect`（カード：5ファイル各1＋魔導書2枚＋STARTER の魔王城）、スモーク part83・117・120・129・186・236・361、scripts/validate-cards.ts・check-effect-semantics.ts。**`bothSidesPids` の呼び出し10か所は「付け替え後の陣営の列挙」で、新しい部品の下では「指定の段で決まった陣営」を読む形になる**。

**注意（確認済み）**：サンク系は「絞り込み先以外を resistance で弾く」実装＝**適用の段で効く**。魔導書は**使用の確認の段（対象が決まる前）で聞く**。魔王城は**指定の後の1か所**。3つはタイミングも置き場もバラバラで、同時に指定された対象の集合を見て判断できるのは魔王城だけ。

### 3.4 中断・再開で情報を運ぶ形（確認済み）

- action に載せて再入する前例は十分ある：`pickTargets` の `choosing`／`chosenIds`／`picked`（`picked.ids/passed/failed/ownRedirectAsked`。pickTargets.ts:1-30・96-127）、`destroy` の `eachChosen`、`designate` の `chosen`／`awaiting`、`simultaneous` の `chosenIds`。**付け替えの結果（対象の集合）を `picked.ids` に入れる形は、gatePickedTargets の中ではすでに動いている**（`ownTargetRedirect` が `[pick]` を返し、以降 `targets` で耐性を回す。picked.ids にも反映）。
- 運べない／運びにくい経路：(1) `sequence` の子の間（子の action は別オブジェクトなので、前の子の付け替えは `state.recordScope` の記録＝見えない経路でしか渡せない。Q963 は「別の指定の時点」なので渡さなくてよい）。(2) `resumeMagicEntry`（resolve.ts:164〜、エントリ単位で解決し直す）。(3) 「すべて」系は picked を持たない action が大半（destroyAllTargets など）で、指定の結果を載せる欄が無い。(4) 非対話（テスト）は `interactiveTargets` が偽で聞けず、`ownTargetRedirect` は `ids.length<2` や非対話で素通しにしている。

### 3.5 共通化の候補

- **候補1：`resistanceAgainst` の手前に「付け替えの結果」を渡す**（現状の `magicRedirectTo` と同じ位置）。覆う範囲はA・B・Cのほぼ全部（確認済みの呼び出し元で数えると約50地点のうち、`gateTargetedApply`／`isResisted`／`resistanceAgainst` を通る全部）。**ただし1体ずつ呼ばれるので「出そろった時点」を知らない**（集合を見て確認を出せない）。現状のサンク系はこの形。集合が要らない付け替え（サンク＝自分のみ、魔導書＝陣営）には足りるが、魔王城・影武者（持ち主が選ぶ・条件を見る）には足りない。
- **候補2：指定の段を切り出す**（「指定 → 割り込み → 適用」。協議中の方針）。覆えるのは「集合を作ってから適用する」形になっているA（3 type、`pickTargets`→`gatePickedTargets`）だけが現状で即日対応可。B・Cは次に詳しく：Bは1体ずつ決めて直ちに適用（候補列挙→1体選ぶ→gate→適用）なので、**指定の段の切り出し＝各ハンドラを書き換える**作業で、15か所弱。Cは `destroyAllTargetList`（destroy.ts:409）のように「集めて返す関数」が既にある型と、集めながら適用する型（exhaustAllTargets・returnAllMatchingToDeck・bpBuffAll）が混在。
- **寄せられない残り**：D（指定アタックの3経路）、E（持ち主が選ぶ。割り込む権利者との関係）、timedEffect（placeBp〜placeAny ほか約20関数が個別に候補を集める。timedEffectHandler が `content` の種類で分岐 :975-1175）、`designate`（適用の段が無く、後続の `lastTarget` で使う。**指定そのものが効果の本体**＝ここに割り込めば後続の「それを」が付け替え先になる）。

### 3.6 集め方のグループ（item 6。型の数＝handler の関数単位、使用カード数＝data/cards の `"type"` 値の出現。いずれも対象を取るもの以外（filter 無し等）を含む概数）

| グループ | 集め方 | 該当 action（確認済み＝読んだもの） | 使用カード数（概数） |
| :-- | :-- | :-- | :-- |
| G1 pickTargets 系 | `pickTargets`＋`gatePickedTargets` | destroy・bounce（hand）・exhaust/refresh の選ぶ分（3 type） | destroy 435・return 148・exhaust 238・refresh 109（のうち選ぶ分） |
| G2 pickEnemy*/pickAnySide* ＋ 自前の gateTargetedApply | 候補を targeting.ts の関数で列挙し、1体ずつ gate | exhaust（1体）・refresh 1体・moveCoresLeavingOne・grant 系・removeOneOfAnyType・destroyBrave・detach 系・designate・exhaustAndForceBlock | 約30（designate 3・detach 2 ほか） |
| G3 timedEffect の place* 関数群 | 各 place* が `pickEnemyCandidates`／`targetableSpirits` を直に呼び、`gateTargetedApply`／`resistanceAgainst` で適用 | timedEffect（BP・ルール・不可・レベル・色・シンボル等）＋bp・bpMinus | timedEffect 332・bp 142・bpMinus 25 |
| G4 フィールドを自前で走査（area） | `state.players[pid].field.spirits` を直に走査して `isResisted` | destroyAllTargets・exhaustAllTargets・returnAll*・bpBuffAll・coreDrainAllOthers・simultaneous | destroy all・exhaust all・return all（概数 100） |
| G5 removeCores / placeCores / moveCards | 独自の source 列挙（`spreadCandidatesFor`・`pickAutoSource`）。個体指定は `resistanceAgainst`、spread は個体ごと | removeCores（239）・placeCores（286）・moveCards（211） | 計 700 超（相手のスピリット/ネクサスが対象のものは一部。**種類別の数は未調査**） |
| G6 anySide／bothSidesPids | 陣営を `bothSidesPids`／`applyBothSidesRedirectToCandidates` で絞る | draw/discard・destroy・exhaust・bounce・timedEffect・removeCores の side:"both"/anySide | 魔導書2枚が読む（実際の使用カードは 10 前後。推測） |
| G7 一騎打ち | directAttack／doAttack／resolveDirectedBlock | 3経路（D） | directAttack 数枚（canDirectAttack は能力） |

type 数と使用枚数は最後まで数えていない（G5 の「相手の盤面を対象にするものだけ」は別途 grep が要る）。

### 3.7 指定の時点で働くルールが今どこにあるか（item 7。確認済み）

| ルール | 場所 | 候補の列挙側 | 耐性の入口（resistanceAgainst）側 |
| :-- | :-- | :-- | :-- |
| 対象にならない `untargetable`（装甲・指定されない） | shared/rules/resistance.ts:140-170 `untargetableAgainst`（scope:"targeted" のみ） | `pickEnemyCandidates` が `probing:true` で `isResisted` を呼ぶ（targeting.ts:54）。例外：battleFlow.ts:1466・exhaustRefresh.ts:482・timedEffect.ts:422 は自前で probing | 適用の点で再度判定（`boardResistanceAgainst`＝resistanceAgainst:208）。**両方に載る** |
| 【迷彩：N】`meisai` | EffectModules.ts:211 `tryMeisaiToll`（:222〜）。支払いの副作用があり shared/rules に置けない | 候補列挙では**払わず除外のみ**（probing） | 適用の1点で `tryMeisaiToll` が支払いを要求。**入口に相乗り**（scope:"targeted"・spirit 発生源のみ） |
| 円卓 `targetNegateByHandDiscard` | EffectModules.ts:288-330（`tryPayableTargetNegate`）、:380 `askPayToNegateIfNeeded`（対話で確認）、:449 `gateTargetedApply` が先に確認 | 候補列挙は防がない（「対象にはなる→受けない」の順） | 適用の1点だけ（`gateTargetedApply` → `askPayToNegateIfNeeded`）。**入口に相乗り＋確認の割り込み** |
| `magicRedirect`（サンク系） | EffectModules.ts:186 `resistanceAgainst` ① | 候補列挙の probing にも載る（attempt が magic/spirit なら）が、`magicRedirectTo` は解決中だけ立つので列挙時は常に未設定 | 適用の1点（`category:"magicRedirect"`）。**入口に相乗り** |
| 魔導書（両陣営の絞り込み） | redirect.ts `bothSidesPids`／`applyBothSidesRedirectToCandidates` | **候補列挙の側**（targeting.ts:73、bounce.ts:394 ほか）と**陣営の列挙の側**（10か所） | 入口には無い |
| 魔王城 | ownTargetChoice.ts:30 | gatePickedTargets の中（選び終えた後） | 入口には無い（`isResisted` を候補の絞り込みに使うだけ） |

読み取れること：**耐性側は「列挙では probing で除外のみ、適用では支払い・確認つきで判定」と二段になっている**。指定の段を切り出すなら、この二段の規約（「列挙は払わない・適用は払う」）を指定の段と適用の段にそのまま対応させるのが自然（円卓は「対象になった後」に払うので、**付け替えの割り込みは「指定の後・円卓の支払いの前」か「円卓の後」かで結果が変わる**。未決4）。

### 3.8 未決（判断が要る点。自分では決めていない）

1. **割り込みの単位**：「1文の中の複数の対象は同時」の単位は action 1個とは限らない（destroy の `count:N` は1 action、timedEffect の複数 content、`simultaneous` は複数 action で1回の破壊）。割り込み点を resolveAction に置くのか、各ハンドラが「指定の段」の関数を呼ぶ形にするのか。後者は B・C で約25か所の書き換え。
2. **指定アタックの割り込み点**：宣言時（GameEngine.ts:1236）／効果の指定（battleFlow.ts:1429）／ブロック成立点（battleResolve.ts:315）のどれか。現状の `resolveDirectedBlock` は「指定先が有効でなくなったら通常のアタックに戻る」（2026-11-10）ので、成立点に付け替えを足すと重複する。
3. **chooserIsTarget（持ち主が選ぶ）の指定の時点**：選び終えた後が「出そろった」か。そのとき割り込む権利者は影武者の持ち主（＝選んだ持ち主）であり、付け替え先を選ぶのも同じ人になる。
4. **円卓・【迷彩】との順序**：付け替え → 耐性（円卓の支払い・【迷彩】）か、耐性 → 付け替えか。Q955「効果の解決の前」は付け替えが先と読めるが、新しい対象に対する円卓・迷彩の支払いをどうするか。
5. **付与された誘発・fieldEvent・起動能力・バースト以外のネクサス効果**：現状 `setTargetRedirect` は triggered のスピリット／ブレイヴとマジックにだけ掛かる（起動能力・fieldEvent・付与誘発は掛かっていない。確認済み）。新しい部品では「相手の効果」全部を覆うか。規則（Q23566 持続効果は対象外）は別。
6. **サンク系の「このスピリット以外は効果を受けない」の持ち方**：指定の段が集合を返すなら、`magicRedirectTo` を置き換えて action／picked に入れられる。**ただし「すべて」系（G4）には picked が無い**ので、集合を返す関数（`destroyAllTargetList` 型）に揃えるのが先。
7. **非対話（テスト・自動解決）での既定**：`interactiveTargets` が偽のとき、持ち主に有利な側へ固定する簡略化（`bothSidesPids`:36）が今あるが、新しい部品でも続けるか。
8. **移行の順番（案）**
   - **案A（タイミング優先）**：①指定の段の関数を1つ作り、まず G1（`gatePickedTargets`）に入れて魔王城を新しい部品へ移す（#634 の本件が直る）→②サンク系を `magicRedirectTo` から移す（Bの gate 経由の地点）→③G4・G3 を順次→④魔導書を最後に移す。**利点**：PR ごとに旧仕組みを1つずつ消せる。**欠点**：途中で3方式が並ぶ。
   - **案B（集合を返す形が先）**：先に G4（すべて）と G3（timedEffect）を「集めて返す関数＋適用」に分ける純リファクタ（挙動不変）を出し、その上に付け替えを足す。**利点**：指定の段が全 action で同じ形になる。**欠点**：#634 の修正が遅れ、書き換えが大きい（約25か所）。
   - **案C（resolveAction 手前）**：まず resolveAction に「付け替え済みの集合」を渡す欄を作り、1体ずつ呼ぶ `gateTargetedApply` が読む（候補1の拡張）。**利点**：変更が小さい。**欠点**：集合を見て確認を出せず（影武者・魔王城には不足）、`magicRedirectTo` の再発明になる（設計の3原則の3に反する恐れ）。
