# 派生効果は、元の効果を解決し終えてから解決する（調査メモ。2026-11-17）

調査役の記録。コードは変えていない。**推測は「推測」と書いた**。ファイル:行は 2026-11-17 時点（ブランチ fix/destroy-triggers-after-effect）。

## 0. 一次資料と、すでに書かれている規則

- RULES_BATSPI_WIKI.md:93「解決軸が完全に終わるまで、消滅・破壊状態のカードはトラッシュに置かれない」（✅ と書かれているが、効果の**途中**では実装と食い違う）。TIMING_CHART §0-4「新しく発揮した効果を先に解決する」。Q26091・Q26092（MISSING_CARDS_SURVEY.md:133）。
- **CONJUNCTION.md:10**：「A。その後、B。」は「**誘発は割り込まず、B の後に解決する**」。:14「A。この効果発揮後、B。」だけが「Aによる誘発とその派生をすべて解決してから B へ」。つまり**効果の範囲＝1つの効果エントリの文全体**（文が分かれていても同じ効果）で、「効果発揮後」だけが例外の区切り。
- RESUME_STACK §7 ②「破壊する**ことで**〜」は恩恵が先、派生（フィールドに残る）が後。いまは `pendingReviveConfirms`（GameEngine.ts:240付近）で「残る」の**確認だけ**を末尾へ遅らせている。誘発の列そのものは遅らせていない。
- BURST.md §1.4（バーストの宣言と適用）が**同じ考え方の先例**：宣言は即時、適用は「以降に解決する効果が無くなってから」（`applyDeclaredBursts`、keywords/burst.ts:434）。
- 先行テスト：`scripts/smoke/part978.ts:142-` に `DESTROY_AFTER_EFFECT = false` で無効化された BSC05-027 の場面がある（この PR で戻す対象）。`data/card-notes.json` に BSC05-027 が partial で載っている。

## 1. 効果の境目

### 1.1 共通の入口は `resolveAction`（EffectModules.ts:1382）だけ

マジック・誘発・起動・バースト・再開のすべてが最後は `resolveAction` を通る（呼び出し元 約50か所）。ctx（`ActionCtx`）はここで作られ、入れ子は `ctx.resolve`（:1432-）が `resolveAction` を再帰で呼ぶ。

「一番外側の効果」の判定はすでにある：`isOutermostEffect = state.currentEffectSource === undefined`（:1467）。これを使っているもの：コア配置の差分検出（:1485 `fireCorePlacedFromDiff`）、「効果1回につき1回」の印と `until:"effect"` の掃除（:1497）。**効果の終わりの検出点として既に使われている**。

ただし限界が2つある。
1. 選択待ちで止まると `currentEffectSource` は消え、再開（choice.ts の `resolveAction` 呼び出し、`kind:"action"` フレーム）は**また一番外側として入る**。「同じ効果の続き」と「新しい効果」を区別する印が無い（区別に使えそうなのは `recordScope` だけ。ただし `newRecordScope()` は sequence（control.ts:119）・pay（pay.ts:851）・再開（choice.ts:111,889）が作るので**効果ごとの一意な id ではない**。推測を含む）。
2. `flushBounces`（:1508付近）は**入れ子の `resolveAction` の出口でも**毎回走る（一番外側に限っていない）。つまり戻す待機は、sequence の途中の手の後で移動が済む。破壊と同じ型の食い違いが戻す待機にもある（推測：要テスト）。

### 1.2 種類ごとの入口（効果の始まり／終わり）

| 種類 | 始まり（`resolveAction` を呼ぶ所） | 終わりを検出できる所 |
| :-- | :-- | :-- |
| マジックの使用 | magic/resolve.ts:187, 242（`runMagicEntryAction`・複数エントリを sequence で包む） | **`finishMagicUseOrDefer`（magic/inUse.ts:16）が先例**。選択待ちなら `{kind:"action", action:{type:"finishMagicUse"}}` を最外層として積み、無ければその場で実行。「使用中」のマジックは派生効果の後でトラッシュへ（RULES:161） |
| triggered（召喚時・アタック時・破壊時など） | triggers.ts:538, 593（`run`）, 614（付与分）, 681 | `fireTrigger` の resolveEntry。複数件は `resolveInOrder`（GameState.ts:427）が1件ずつ解決し、選択待ちなら残りを再開スタックへ積む |
| fieldEvent | fieldEventTriggers.ts:647, 670（`handlers.resolve`） | 同上（列の項目） |
| step（ターン開始・エンド等） | stepTriggers.ts:144, 375, 400, 404, 482。PhaseManager.ts:504（turnEndActions） | `fireStepTriggers` 末尾（:436 で `applyDeclaredBursts`） |
| 起動効果 | GameEngine.ts:1675（スピリット／ネクサス）, 1016（手札からの起動） | 呼び出し側の関数の終わり |
| バースト効果の適用 | keywords/burst.ts:176-177, 476, 521（`applyDeclaredBurst`）／handBurstEffect.ts:46 | `finishBurstActivation`（burst.ts の `burstFinish` フレーム `stage:"finish"/"settle"/"notify"`） |
| 召喚時の列 | summon.ts（`fireSummonTrigger`＋召喚の手順）。RESUME_STACK §6 | `placeSummon` フレーム→召喚時効果の列 |
| 再開スタックからの再開 | choice.ts:797 `drainResumeStack`（フレーム `kind:"action"` は :925-945 で `resolveAction`）。`pendingChoice` の答えは choice.ts:344-770 が `resolveAction` | `state.resumeStack.length === 0 && !pendingChoice` |
| バトル解決 | battleResolve.ts:407（【暴風】のみ。BP 比較自体は効果ではない） | `battleResolve` フレーム |

### 1.3 1アクション（handleAction）の外側の層

`handleAction`（GameEngine.ts:178-212）は `dispatchAction` → `settleAfterResolution`（:143）→ `applyDeclaredBursts` のループ → `fireBpReachedTriggers`。**効果の終わり直後に何かをしたいなら、ここ（アクション全体の末尾）は遅すぎる**：1回の `handleAction` の中で、列の次の項目（兄弟の誘発）が先に走ってしまう。TIMING_CHART §0-4（新しく発揮した効果を、待たせている兄弟より先に解決する）に合わせるには、**効果エントリの出口（＝`resolveAction` の一番外側の出口、選択待ちなら最外層のフレーム）**で処理する必要がある。

## 2. いまその場で列を解決している箇所

### 2.1 破壊・消滅・戻す待機

| 箇所 | 中身 | 呼び出し元 |
| :-- | :-- | :-- |
| `destroySpirit`（removal.ts:398） | `enterDestroyWaiting`→`fireOwnSpiritDestroyed`（:540 付近。`resolveDestroyQueue`）→`commitOrDefer`→`fireQueuedDestroyBursts` | 効果（actions/destroy.ts:302, 981 ほか）／**効果でない**もの：維持コア割れ（EffectModules.ts:843 `sweepLevelCostDepletion`・:930 支払い・GameEngine.ts:1106・:1131 手動のコア移動）／バトル（battleResolve.ts:283, 817, 840）／召喚の支払い（GameEngine.ts:769 `payOffDestroy`）／ブロックの代価（GameEngine.ts:1342）／バースト破壊（burstNegate.ts:60） |
| `destroyTargetsBatch`→`startDestroyBatch`（removal.ts:965, 1004） | 全員を待機にし、全員ぶんを1本の列で解決→`finishDestroyBatch`（確定→破壊した数→`after`→破壊後バースト） | 効果（actions/destroy.ts:216, 288, 387, 481, 535, 1173, 1248, 1407）／バトル（battleResolve.ts:641-789。`deferBurst`） |
| ネクサスの破壊（removal.ts:1112 `destroyNexus`→`driveNexusDestruction` :1161→`finishNexusDestruction` :1200） | 同じ型（列を解決→確定。`destroyNexusCommit` フレーム） | 効果（`after` に破壊した側の続き） |
| 合体中のブレイヴだけの破壊（brave.ts `destroyCombinedBraves`、`braveDestroy` フレーム） | 同じ型 | 効果 |
| 消滅（`cause:"deplete"`） | `destroySpirit` と同じ関数。『破壊時』は集めない（`enterDestroyWaiting` の `waiting.kind:"vanish"`） | 効果の途中で起きるのは removal.ts:1642, 1688, 1710, 1738（コアを取り除く効果）。それ以外はルール処理 |
| 戻す待機（`flushBounces` removal.ts:1399→`moveReturned` :1439） | 誘発の列→移動。**効果の出口の `resolveAction` ごと**に走る（§1.1 の限界2） | 効果 |

### 2.2 ほかに「効果の途中で誘発をその場で解決している」経路（件数のみ）

`fireFieldEventTriggers`／`fireTrigger`／`fireSummonTrigger` の呼び出しが logic/ 配下の約25ファイルに約120か所（battleResolve 19・removal 10・actions/battleFlow 9・state/exhaust 7・blockDeclared 6・summon 5 ほか）。`resolveInOrder` を使う所が11ファイル16か所。疲労・回復・ドロー・コア配置・ライフ減少・召喚などの「〜したとき」は、**どれも効果の途中でその場で列を解決する**（推測：効果の出口へ遅らせるべきかは規則の問い。§6 の論点1）。**待機状態を持つのは破壊・消滅・戻す（と除外）だけ**で、PENDING_STATE §3 の P2・P7 が「待機のあいだ列を解決してから移動」と決めているので、遅らせた結果が観測できるのもこの3種に限られる。

## 3. 遅らせた列の置き場の候補

前提（いまの形）：破壊待機のカードは場に残り、列が終わると `commitPendingDestruction` でトラッシュへ。中断は `destroyCommit`／`destroyBatch`／`braveDestroy`／`destroyNexusCommit` フレーム。同時破壊の単位は `state.destroyGroup`（`deferred`・`used`・`recordScope`）。

先例から取れる形は3つ。

### 案A：`state` に「この効果の派生の列」を置き、効果の出口で流す（`declaredBursts` 型）
- 置き場：`GameState` に新しい欄（`derivedQueue`）。`destroySpirit` は待機に入れるまでを行い、列の収集・解決は出口の `flushDerived`（`resolveAction` の一番外側の出口）が行う。選択待ちなら出口の代わりに `{kind:"action", action:{type:"settleDerived", scope}}` を最外層に積む（`finishMagicUseOrDefer` と同じ）。
- 長所：呼び出し元約25か所（§2.1）を変えずに済む。`declaredBursts`・`pendingReviveConfirms` と同型で、読む人が追いやすい。
- 短所：設計の3原則の3（state の一時フィールドに書いて後で読む）に**当たる**。再開スタックの途中で別の効果が挟まったとき、欄の中身がどの効果のものかを `scope` で持たないと混ざる（`recordScope` と同じ失敗：IF_UNIFY §6）。`applyDeclaredBursts` の冒頭の `state.currentEffectSource !== undefined` のような**ガード条件が増える**。

### 案B：列の項目を再開スタックのフレームとして最外層に積む（`kind:"action"` フレーム／新フレーム）
- 置き場：`ResumeFrame`。破壊の収集（`collectDestroyTriggers`）は待機に入れた時点で行い（盤面の控えが必要なため）、**結果の項目（`CollectedTrigger`＝`run` と `frame`）をその効果の「最外層」に積む**。選択待ちでなければ出口でその場で `resolveInOrder`。
- 長所：中断・フレームをまたいで運ばれる（3原則の3に合う。`requiresPendingDestructionOf`・`groupOnce`・`waitingEvent` がすでにフレームにある）。`destroyCommit`（step 1＝列から、step 2＝確定のみ）は**そのまま使える形**（再開時に `fireOwnSpiritDestroyed` から始まる）。
- 短所：**フレームは効果の同期の続きを追い越せない**。`destroySpirit` が戻った後、呼び出し元の効果は同期で続く（次の手・兄弟）。同期の続きの末尾で積んだフレームを流す「出口」が結局要る（案Aの `flushDerived` と同じ）。また `CollectedTrigger.run` は関数なのでフレームに入らず、`resolveInOrder` が使う `frame` 側の記述に落とせるかを確かめる必要がある（推測）。

### 案C：`ActionCtx` に集め箱を持たせ、`ctx.resolve` で明示的に引き継ぐ
- 置き場：`ctx.derived`（`resolveAction` の一番外側が作り、`ctx.resolve` が同じ参照を渡す。:1432 `ctx.resolve` はすでに発生源を明示的に引き継いでいる）。破壊のハンドラが `destroyTargetsBatch(..., ctx.derived)` へ渡す。
- 長所：3原則の3に最もよく合う（見えない経路を使わない）。
- 短所：`ctx` を持たない呼び出し元（維持コア割れ・`removeCores` からの `destroySpirit`・`payOffDestroy`・バースト破壊）が約10か所ある。それらは「効果の外」か「別の入口」なので、集め箱が無ければ**今までどおりその場で解決**にするしかなく、**2通りの経路が並ぶ**（3原則の1「単純な部品」に反する）。中断をまたぐには結局フレームに落とす必要があり、案Bと組み合わせになる。

**調査役の見立て（推測）**：「出口で流す関数（`resolveAction` の一番外側の出口）＋選択待ちのときは最外層に action フレームを積む（`finishMagicUse` 型）」が土台で、列の項目の運び方は案B（フレーム）に寄せ、案Aの `derivedQueue` は**選択待ちを挟まない間だけの一時置き場**に限ると、3原則の3との衝突を最小にできる。最終判断は設計担当。

## 4. 影響を受けるカードの規模（`data/cards/*.json` 2747枚を python で数えた）

「効果の中で破壊の後に、同じ効果の続きがある」形の枚数（重なりあり。和集合 **103枚**）。**下限**（`pay`・`sequence`・`simultaneous`・`destroy` の付帯欄だけを数えた。`if`／`forEach` の中や、別エントリに分かれて同じ文の続きを持つものは数えていない）。

| 形 | 枚数 | 代表 |
| :-- | --: | :-- |
| `pay` の cost が destroy（「破壊することで〜」） | 27 | BSC05-027 エレキトリック（then＝`placeCores from:"destroyed"`）／BS02-095／BS06-111／BS10-105／BS13-X02。then の種類は destroy 7・refresh 4・draw 4・placeCores 3・summon 2・discard 2 ほか |
| `sequence` の途中に destroy（「破壊する。その後／ボイドから…」） | 57（先頭の destroy だけを数えて50） | BS02-075 天使長プリンシパール（破壊→コスト分のコアを置く）／BS02-099 ライフチェイン／BS12-052 デス・ヘイズ（破壊→ドロー）／BS05-054 鉄槌のオズワルド（破壊→if）／BS14-X01・BS15-004（破壊→召喚。**「この効果発揮後」**） |
| `destroy` の付帯欄（`drawPerDestroyed` 11・`millPerDestroyed`・`voidCoreToSelfPerDestroyed`・`thenDrawFixed`） | 18 | BS01-114／BS06-091／BS08-067／BS11-006／BS14-010 |
| `simultaneous`（同時破壊） | 2 | BS04-108／BS13-004 |
| 「破壊したスピリットのコア・コスト」を続きで読む（`destroyedCores`・`selfCoresAtDestruction`・`from:"destroyed"`・`lastDestroyed`） | 約6 | BS01-101／BS20-X01／BS02-035／BS22-038／BSC05-027／BS22-073 |

**要注意：効果文に「この効果発揮後」を持つカードが36枚**（BS07-X27・BS10-108・BS13-042・BS14-X01・BS15-004・BS16-018・BS17-038 ほか）。これらは CONJUNCTION.md:14 により**派生を先に解決してから B へ**進むのが正しく、**いまの実装（その場で解決）がこちらには合っている**。遅らせる実装にすると、データ上は「sequence の destroy→B」と同じ形で書かれているので、**「その後」と「この効果発揮後」を区別する印が要る**（データに印は無い。推測：新しい `sequence` の欄か、区切りを入れる action）。36枚のすべてが破壊の後に続くわけではない（召喚後・ドロー後なども含む）。

「破壊することで」（`pay`）の cost の破壊は、RESUME_STACK §7 ②と COST_MODEL の「コスト」の扱いに従って**恩恵（then）の後に派生**で良く、ここは遅らせる実装と一番素直に合う。

## 5. バトルの破壊・ルール処理

- **バトルの破壊（BP比較）は効果ではない**。TIMING_CHART §2 は「BP比較（＞５）は破壊処理（＞６）より先」と順序を固定し、`battleResolve` 自身が破壊→勝敗誘発→バトル終了→バーストの順を持つ（RESUME_STACK 「バトル解決の移行」）。`destroyTargetsBatch` の `deferBurst` 引数も、その流れの側で時点を決めるための印。**変えなくてよい**（根拠：TIMING_CHART §1.5・§2。「解決軸」は効果の連なりの話）。`currentEffectSource` が立たない経路なので、「一番外側の出口」のフックも**自然に走らない**＝そのまま今の挙動が残る。ただし【暴風】（battleResolve.ts:407）は `resolveAction` 経由の効果なので、効果と同じ扱いになる。
- **維持コア割れ（ルール処理）**：効果ではない。TIMING_CHART に即消滅の記述（`sweepLevelCostDepletion`・GameEngine.ts:1106/1131）。**変えなくてよい**。ただし**効果がコアを取り除いて割れた場合**（removal.ts:1642 などの `removeCores` 経由、`deplete`）は効果の途中の消滅で、**同じ枠組みに入る**（消滅の派生も効果の後）。この区別は `currentEffectSource` が立っているかで付けられる（EffectModules.ts:1467 と同じ判定。`enterDestroyWaiting` もすでに :236 で読んでいる）。
- **Q26092（コア0→消滅扱い、『破壊時』は発揮しない）はいまは再現できない**：破壊待機のカードに `destroySpirit(..., "deplete")` を呼ぶと `enterDestroyWaiting`（removal.ts:210）が `isTrashWaiting` で `null` を返す。PENDING_STATE §3 P6 は「戻す→破壊」だけを実装済みで、**「破壊待機→消滅への切り替え」は未実装**（P3 の『消滅時』は 2026-11-16 に見送り）。遅らせる実装にすると、BSC05-027 の場面（コアをライフに置いて 0 になる）で**この切り替えが必要になる**。

## 6. 既存テストへの影響の見込み

`scripts/smoke/` は 895 ファイル。『破壊時』に言及するもの 123 本、`onDestroy` 44 本。効果の途中の破壊の後の結果を確かめているものの当たり（grep のみ・未実行）：

| テスト | 見ているもの | 見込み |
| :-- | :-- | :-- |
| part978 | BSC05-027（`DESTROY_AFTER_EFFECT=false` で無効）。この PR の完了条件の1本 | 戻す |
| part670 | BS02-075・BS02-099・BS07-084（破壊したコストでコアを置く） | **順序依存**：続きがコアを読むので、待機のままコアが残る前提に変わると期待値が動きうる |
| part949 | レーヴェンの5体同時破壊→`drawPerDestroyed`の後処理→バースト（#552）。「破壊→誘発→トラッシュ→バースト」の順 | 順序の再確認が要る（`after` の時点が変わる） |
| part313 | BS14-X01・BS14-010（「この効果発揮後」） | **派生を先に解決**のまま維持（§4 の区別が要る） |
| part289・part404 | BS12-052（破壊→ドロー、破壊時は発揮されない） | 確認 |
| part151 | `pendingReviveConfirms`（「ことで」の「残る」を末尾で確認） | 遅らせる範囲の再設計次第。置き換えの候補 |
| part331・352・612・887 | BS15-004 | 「この効果発揮後」 |
| part953・954・955・956・957・958 | 同時破壊の列・待機の対象・戻す待機・ブレイヴの列 | 列の中身は変えないので、列を**いつ流すか**だけが動く |

## 7. 設計の論点（決めるべき問い）

1. **範囲**：遅らせるのは破壊・消滅・戻す待機（待機状態を持つ3種）だけか、疲労・ドロー・召喚など**すべての派生効果**か。§2.2 のとおり後者は約120か所。待機でないものは「その後」の続きが読む盤面が変わるだけなので、**まず待機の3種だけ**で足りるか（Q26091 は破壊の例）。
2. **「効果」の範囲**：1つの効果エントリの文全体（sequence・pay・if をすべて含む）で良いか。CONJUNCTION.md:10 は肯定。**「この効果発揮後」（36枚）の区別**をデータ・型のどこに持つか：(a)`sequence` に区切りの欄 (b)区切り専用の action（既存の器で書けるか検討。3原則の1）(c)文言から機械的に移行。
3. **出口の置き場**：`resolveAction` の一番外側の出口に共通の `settleDerived` を置くか、効果の種類ごとの入口（§1.2 の9種）に置くか。後者は入口ごとの漏れが出る（RESUME_STACK §9 の実バグ4件と同じ型）。
4. **選択待ちを挟むとき**：最外層に積む `settleDerived` フレーム（`finishMagicUse` 型）の置き方。**再開側が「新しい効果」として入って出口を二重に走らせない**ための印（同じ効果の id）を何にするか：`recordScope` は一意でないので不可（§1.1）。新しい効果 id を `resolveAction` の一番外側が発行し、`ctx.resolve`・`kind:"action"` フレームに載せる案がある。
5. **列の項目の運び方**：案A（state の列）・案B（フレーム）・案C（ctx の集め箱）。設計の3原則の3に照らすと C＞B＞A、呼び出し元の変更量は A＜B＜C。折衷案（§3 の見立て）で良いか。
6. **同時破壊のグループ（`destroyGroup`）と「効果の後に列を流す」の関係**：いまは `destroyTargetsBatch` の中で「全員を待機→列→確定→`after`」。遅らせるなら `after`（`drawPerDestroyed`、「破壊した数」の記録）の時点が**列の前**になる（RESUME_STACK §7 は「破壊待機のまま解決していれば数える」＝列の前で数えるのが規則に合う）。`finishDestroyBatch`（removal.ts:1034）の分割が要る。
7. **破壊待機から消滅への切り替え**（Q26092）：`destroySpirit(..., "deplete")` を待機中のカードに許し、待機を `destroy`→`vanish` に変える（`waiting.kind` の変更と、すでに集めた『破壊時』の項目の取り消し）。P6 の延長として今回入れるか、別 PR にするか。
8. **効果の途中で待機のカードが場に残る間の扱い**：続きの文（`placeCores from:"destroyed"`・「破壊したスピリットのコスト」）は待機中のカードを読む。PENDING_STATE C2・`canBeTargeted` は「その待機を誘発した効果」しか対象に取れないと決めている。**同じ効果の続き**（破壊した側）が待機中のカードを対象・参照にできる必要がある（`GameState.waitingEvent` を効果の続きにも立てるか。`recordLeftCost` は参照を持っている）。
9. **効果でない破壊との区別**：維持コア割れ（ルール処理）・バトル・召喚の支払い（`payOffDestroy`）・ブロックの代価は**出口が無い／すぐ流す**。「一番外側の効果の中か」を `currentEffectSource` で判断する（EffectModules.ts:1467、`enterDestroyWaiting` :236 の既存判定と同じ）で十分か。
10. **戻す待機（`flushBounces`）の出口**：入れ子の出口ごとに走る現状を、一番外側の出口に揃えるか（`finishMagicUse` と同じ層）。同じ調整で破壊の派生と戻すの派生が**同じ出口**になるのが保守しやすい（推測）。
11. **`pendingReviveConfirms`（「ことで」の「残る」を末尾で確認）との統合**：効果の出口で列を流す仕組みに乗せれば不要になるか。part151 などの期待値が絡む。
12. **バースト・ブレイヴ・ネクサスの同じ型（`destroyNexusCommit`・`braveDestroy`）**：4種類のフレームを共通の出口に乗せるか、1つずつ順に移すか。段取り（PENDING_STATE の段取りと同じ要領で1段ずつ別 PR か）。
13. **対戦者の見え方（クライアント・AI）**：効果の途中で破壊待機のカードが盤面に残る時間が長くなる。UI の表示・`ai/evaluate.ts` の評価・`audit:parity`（クライアント／サーバー判定の突き合わせ）への影響を、実装前に洗う。

## 8. 確定した設計（2026-11-17。ユーザー確認つき）

ユーザー確認：範囲は**待機の3種（破壊・効果による消滅・戻す）だけ**（疲労・ドロー・召喚などの「〜したとき」は別の PR で同じ出口に乗せる）／1つの効果の中で何度に分けて待機に入っても、効果の後に**1本の列**にまとめてターンプレイヤーが順番を決める（出来事ごとの「1回」は `waiting.event` で分けたまま）／**破壊待機→消滅待機の切り替え**もこの PR（Q26092）。

1. **効果の id**：`resolveAction` の一番外側が `effectId` を発行し `state.currentEffectSource.effectId` に載せる。`pushResumeFrames` は `kind:"action"` フレームに `effectId` を付ける（`burst`・`waitingEvent` と同じ既存の付け方）。そのフレームから再開した `resolveAction` は同じ `effectId` を引き継ぐ＝同じ効果の続き
2. **待機に印**：効果の中（`currentEffectSource` が立っている）で待機に入ったカードは `waiting.effectId` を持ち、`destroySpirit`／`startDestroyBatch`（とネクサス・合体中のブレイヴの破壊）は**待機に入れて、効果の一部の後処理（`drawPerDestroyed` などの「破壊した数」）までで戻る**。誘発の収集・列の解決・トラッシュへの確定・破壊後バーストはしない。効果の外（バトルの BP 比較・維持コア割れ・召喚の支払い・ブロックの代価・バーストの破壊）は今までどおりその場で全部やる
3. **出口 `settleDerived(state, effectId)`**：`resolveAction` の一番外側の出口で、選択待ちが無く、再開スタックに同じ `effectId` のフレームが残っていないときに呼ぶ。`waiting.effectId === effectId` のカード（破壊・消滅・戻す）を集め、全員ぶんの誘発を1本の列（`resolveInOrder`。破壊は `collectDestroyTriggers`、戻すは `flushBounces` の列）→ 確定（トラッシュ・手札など）→ 破壊後バースト。いまの `flushBounces` の呼び出し（入れ子の出口ごと）はこれに置き換える。列が選択待ちで止まったら、残りは既存のフレーム（`destroyBatch` の finish など）で運ぶ
4. **「この効果発揮後」**：区切りの action `{ type: "settleDerived" }` を足す（その時点までに待機に入った派生をここで解決してから次の手へ）。効果文に「この効果発揮後」を持つ36枚のデータで、`sequence` の該当位置に挟む（データ移行。CONJUNCTION.md:14）
5. **破壊待機→消滅待機**：効果で破壊待機のカードのコアが0個になったら、`waiting.kind` を `vanish` に変える（`event`・`effectId`・`burstInfo` は保つ）。誘発は出口で集めるので、『破壊時』は自然に発揮されない（Q26092）。PENDING_STATE §3 P6 の延長
6. **「破壊したスピリット」を続きで読む**：待機中のカードは同じ効果の続きから参照できる（エレキトリック：pay の then に払ったスピリットを値で渡す。`placeCores` の `from:"paidSpirit"` を `bindPaidValues` が `instanceId` に置き換える）
7. `pendingReviveConfirms`（「ことで」の「残る」を末尾で確認）は、効果の中の破壊では出口の列に入るので使わなくなる。効果の外の経路で残るなら残す
8. **待機中のカードは効果の続きでも場に存在する**：「その後」の続きが数える「自分のスピリットの数」・Lv の条件に、破壊待機の体も入る（2026-11-17 ユーザー確認。part767・808 の期待値を改めた）。トラッシュに置かれた後を見るのは「この効果発揮後」だけ（CONJUNCTION.md:14）。烈光閃刃の「その後…メイン効果」でバーストが破壊したスピリットはまだトラッシュに無い（part976）
9. **「この効果で破壊したスピリット1体につき」**：「この効果発揮後」の後で数えるもの（ジェネレートファイア）は、区切りで実際にトラッシュに置かれた数（Q25205）。区切りの無い「破壊し、1体につき〜」は従来どおり待機に入った数（RESUME_STACK §7）
