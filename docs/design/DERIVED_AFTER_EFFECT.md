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

## 9. 待機を持たない出来事の派生（調査。2026-11-17）

調査役の記録。コードは変えていない。行番号は 2026-11-17 時点（ブランチ feat/derived-other-triggers）。数は `data/cards/*.json` 2747枚を python で数えた。**推測は「推測」と書いた**。§8 の `settleDerived`（`derivedSettle.ts`）・`effectId`・区切り action の上に乗せる前提。

### 9.1 出来事ごとの誘発の出し方

効果の中から起こりうるかは、`resolveAction` の外（バトル・ステップ・ルール処理）でも同じ関数が呼ばれるかで分けた。「いま」はどれも、出来事ごとにその場で `fireFieldEventTriggers`／`fireTrigger` が列を作り `resolveInOrder`（GameState.ts:429）で解決している。

| 出来事 | 誘発を出す関数:行 | 効果の中から | 効果の外からも | 注記 |
| :-- | :-- | :-- | :-- | :-- |
| 疲労 | `exhaustSpirit`（state/exhaust.ts:58、発火 :92/:103/:105）→`fireExhaustedTriggers`（:225） | 疲労させる action・【暴風】 | アタック・ブロック宣言（ブロックは `exhaustedEvents` を blockDeclared.ts:42 が収集して宣言の列に入れる） | ネクサスは `exhaustNexus`（:119） |
| 回復 | `refreshSpirit`（:160、:186 `onRefreshed`・:187 `fireRefreshedSideEvents` :193） | 回復させる action（exhaustRefresh.ts:727-843 ほか） | リフレッシュステップ（PhaseManager.ts:207。陣営ごとに1回） | |
| ドロー | `draw`（GameState.ts:607 `opponentDrew`・:610 `opponentDrewByEffect`・`notifyHandGained`＝fieldEventTriggers.ts:770 `opponentHandAdded`） | draw action | ドローステップ（`fromDrawStep`） | 手札に加わる全経路（回収・バウンスなど）が `notifyHandGained` を通る |
| 召喚（召喚時＋「召喚されたとき」） | `fireSummonSequence`（summon.ts:112。召喚時と `ownSpiritSummoned`／`anySpiritSummoned` を1本の列にしている :133-195）→`finishSummonSequence`（:200。ブレイヴ召喚・トラッシュ召喚・疲労付与の尾） | summon action（revealAction.ts:246-274・summonRepeat.ts:100・control.ts:423・summon.ts:371/448）・バーストの召喚 | 手札から通常召喚（GameEngine.ts:493/538）・【不死】（revive.ts:543）・復活（:622） | **唯一の合流点**。呼び出し元12か所。`state.summonBatch`（:92-115）が「同時召喚を後回しにして `summonBatchFlush` でまとめて発揮」の先例 |
| コア配置（ボイド→） | `fireCorePlacedFromDiff`（EffectModules.ts:1337 `opponentCorePlaced`・:1377 `coresGainedFromVoid`・:1379 `lifeCorePlaced`）。差分検出で、`resolveAction` の一番外側の出口（:1485）で発火 | **すでに出口で発火** | コアステップ等は対象外（効果限定） | 他に placeCores.ts:510 `ownSeimeiLifeCharged`・:512 `opponentLifeCoreFromVoid` は配置の場で即発火 |
| コア除去 | removeCores.ts:122 `opponentSpiritCoresEmptied`・:798 `ownSpiritCoresRemovedByOpponent`、removal.ts:1708 `opponentSpiritCoresToReserve` | 除去 action | 維持コア割れ・手動のコア移動 | 0個になる体は消滅（§8 の消滅待機と同じ出口に入る） |
| ライフ減少 | life.ts:23-24 `ownLifeLost`・`ownChimeiMilled`、mill.ts:58 `ownSpiritReducedLife`、revive.ts:1037/1076 | ライフ破壊・【地鳴】系 | バトル（battleResolve.ts:245-262・battleFlow.ts:365-374） | 【ライフ減少後】バーストが付随（burst.ts:41） |
| デッキ破棄 | mill.ts:236 `opponentDeckMilled`・:242 `ownDeckMilled`・:155 `ownDeckMillPrevented`・:394、funsai.ts:123 | mill action・【粉砕】 | ブロック宣言の【粉砕】（blockDeclared.ts の `funsaiOnBlock`） | |
| マジック使用 | magic/resolve.ts:278 `ownMagicUsed`／`opponentMagicUsed` | マジックの効果の**後**に発火済み | — | `finishMagicUseOrDefer`（magic/inUse.ts:16）が先例の出口 |
| キーワード発揮 | GameEngine.ts:1690・rensa.ts:39・tensho.ts:174/183 `ownTensho` | 起動・転召の解決 | | 【連鎖】は §0 CONJUNCTION の節印あり（#608） |
| ネクサス配置・バースト設置・合体・ブレイヴ召喚 | fieldEventTriggers.ts:784・removal.ts:1588-1589・brave.ts:58-59・summon.ts:221-225 | 効果で起こりうる | 通常の配置・合体など | 件数が少ない（fieldEvent を持つカード 1〜3枚ずつ） |

### 9.2 既存の「集めて後で解決する」仕組み

| 場所 | 何を集めるか | どう解決するか |
| :-- | :-- | :-- |
| `CollectedTrigger`（blockDeclared.ts:20）＝`{key, label, frame, run, skip?}` | `fireTrigger`（triggers.ts:223 の `collect`。:574-598）と `fireFieldEventTriggers`（fieldEventTriggers.ts:169。:727-740。`askOrder` が無いと集めない）が1件ずつ積む | 呼び出し側が同じ関数内で `resolveInOrder(items, {askOrder: ターンプレイヤー})`（blockDeclared.ts:104、attackDeclared.ts:41、battleOutcomeTriggers.ts:21、summon.ts:133-195、removal.ts:567/1053/1215/1472、brave.ts:186）。**集めたものを同じ関数の中で解決する形で、持ち越しはしていない** |
| イベントバースト | `checks: EventBurstCheck[]` を並行して作り、列の後で `fireEventBursts`／選択待ちなら `eventBurstsFrame` を積む | 列の後（blockDeclared.ts:111-118、summon.ts:195-212） |
| `summonBatch`（summon.ts:92-115） | 効果の同時召喚の個体 id を `state` に溜める | `summonBatchFlush` action で後からまとめて発揮 |

流用できるか：
- **frame（`ResumeFrame`）は直列化できる**ので、集めた項目を `state` や再開スタックに持ち越すのには使える。`levelRecheck`・`requiresPendingDestructionOf`・`confirmPrompt` など再開後に必要な情報は `entryFrame`（triggers.ts:551）がすでに詰めている。
- **`run` と `skip` はクロージャで持ち越せない**。frame を再開スタックから解くとき（choice.ts の `kind:"action"` 再開）に同じ結果になるかは、blockDeclared の「中断した残りを `frame` で積む」経路が実績（#437 F3 で `entryFrame` に統一）。**出口で解くときは `run` を使わず `frame` を `resolveInOrder` の `resolve` で `resolveAction` へ渡す形に統一する必要がある**（推測：`resumeTriggerBatch` の解決フレーム経路が使えるはず。要確認）。
- `fireFieldEventTriggers` の `collect` は誘発の集めだけで、**イベントバーストの判定（`checks`）は呼び出し側の責任**。出口の列にも `EventBurstCheck` を一緒に持ち越す必要がある。
- 集める時点は**出来事の時点**にすべき（誘発の成否は出来事の時点の盤面で決まる。出口で再発火すると、効果の途中で場を離れた発生源の誘発が消える）。§8 の待機の3種は `waiting.derived` に素材を持たせ**出口で収集し直す**形なので、**集め方が逆**になる（待機はカードが場に残るので再収集で足りた）。

### 9.3 列の運び方の案

| 案 | 中身 | 長所 | 短所 |
| :-- | :-- | :-- | :-- |
| X `state.derivedItems: {effectId, items: ResumeFrame[], checks}[]`（効果 id ごと） | 出来事の時点で `collect` に集め、frame を `effectId` つきで `state` に積む。出口の `settleDerived` が §8 の待機の列と**同じ `resolveInOrder`**（`runDestroyQueue` の `destroyExtraItems` :1056 に足す）に入れる | 呼び出し元をほぼ変えず（`fireFieldEventTriggers`/`fireTrigger` の内側で分岐）、選択待ちの中断・再開をまたいで失われない（`state` にあるので）。`pendingEffectIds`（derivedSettle.ts:23）と同じ型。1本の列に破壊と混ぜられる | 原則3「state の一時フィールドに書いて後で読む」に**当たる**（`declaredBursts`・`pendingReviveConfirms` と同型）。`effectId` ごとに分けるので混ざらないが、書く側・消す側・読む側が増える。勝敗・中断で捨てる処理が要る |
| Y 再開スタックの**最外層フレーム**として積む（`finishMagicUse` 型） | 出来事の時点で `{kind:"action", action:{type:"settleDerived", items:[…]}}` を、その効果の最外層（効果の続きより後）へ積む | action の引数に持たせるので原則3に合う。中断・再開で自然に運ばれる | **同期で続く効果（選択待ちなし）には積み先が無い**（再開スタックは `act()` の解決ループでしか消化されない。§3 案B の短所と同じ）。出口で結局明示的に流す必要があり、積む位置（`resumeInsertAt`）が出来事の発生時点で複数回変わる。同じ効果の2回目以降を**1本の列にまとめる**には、既存の `settleDerived` フレームへ追記するか、複数フレームを出口で束ねる処理が要る |
| Z `ctx`（`ActionCtx`）に集め箱を持たせ、選択待ちで止まる瞬間だけ Y 型フレームに落とす | 同期の間は `ctx.derived`、`suspend` 時に最外層フレームへ変換 | 見えない経路を使わない | `ctx` を持たない呼び出し元（`exhaustSpirit` は ctx 無しで約10か所から呼ばれる。draw・refreshSpirit も同様）が多く、**2通りの経路**が並ぶ（原則1に反する）。変換点が `suspend` 全箇所になる |

**推奨：X**（`state.derivedItems`）。理由：(1) 出来事を起こす関数（`exhaustSpirit`・`draw`・`fireSummonSequence` 等）は `ctx` を受け取っておらず、Z は呼び出し元の改修が桁違い。(2) Y は同期の効果を扱えず、結局 X 相当の出口処理が要る。(3) X の原則3違反は、**値を `effectId` で束ね、frame（直列化できる action）だけを持ち、読む場所を `settleDerived` の1か所に限る**ことで抑えられる（#606 の `waiting.derived` が同じ考え方で、待機を持たない出来事の受け皿が `state` になるだけ）。保守のしやすさ比較：X は「書く点（`fireX` の内側1か所）・読む点（`settleDerived` 1か所）」、Y は積む位置の規則が増える。
- **#606 の破壊の列と1本にまとめられる**：`settleSpirits`（derivedSettle.ts:60）→`runDestroyQueue`（removal.ts:1051）の `items` に `derivedItems` の項目を足せば、ターンプレイヤーが全体の順番を決める（`resolveDestroyQueue` :977 の `askOrder`）。ただし `runDestroyQueue` は破壊の同時グループ（`destroyGroup`）の中で動くので、**破壊が無い効果は別の入口**（待機が無いとき `settleDerived` が `derivedItems` だけで `resolveInOrder` する）が要る。破壊と混ぜるときの `groupOnce` の鍵（出来事ごと）は触らない（推測）。

### 9.4 召喚の扱い

- **区別の仕方**：出来事の入口（`fireSummonSequence` summon.ts:112）で `state.currentEffectSource !== undefined`（＝`resolveAction` の中）なら派生、無ければその場。手札からの通常召喚（GameEngine.ts:493/538）は `resolveAction` の外なので今のまま即時（召喚の支払いで破壊が起きても、§8 の「効果の外はその場」と同じ）。【不死】（revive.ts:543）・復活（:622）は破壊待機の列の中の項目から呼ばれ、`settleDerived` が `currentEffectSource` を消して解決している間（derivedSettle.ts:123）に呼ばれるので**その効果の外＝その場**になる（推測：`applyReviveEntry` が `resolveAction` を通る経路で再び currentEffectSource が立つなら、その召喚の派生はその項目の出口で解決される。要テスト）。
- **効果の召喚の派生を遅らせる範囲**：召喚時の列（召喚時＋「召喚されたとき」＋イベントバースト）は `fireSummonSequence` の前半。**尾（`finishSummonSequence`：トラッシュ召喚・疲労付与・ブレイヴ召喚の fieldEvent）も同じ出来事の派生**なので、前半と尾を**1つの項目（frame `{type:"summonSequence"}`）**として持ち越すのが素直。frame はすでにある（summon.ts:123 の `triggerOnly`、tail の再開）。
- **持ち越すと壊れるもの**：`state.summoningBySoku`・`summoningFromHand`・`summoningPaid`（`fireSummonSequence` が読んで消す。:187-190）。これらは**手札からの召喚（効果の外）でしか立たない**ので、効果の召喚（持ち越す側）は常に false/未設定。ただし GameEngine.ts:904 `summoningFromHand = true` が効果の中の召喚（手札から召喚する action）でも立つかは未確認（推測：立つなら frame に値を持たせる必要がある）。
- **`summonEffectSources`／`resolvingSummonTriggerPid`**（triggers.ts:186-191・GameEngine.ts:164-166）：召喚時効果を解決している間だけ立つ。出口で frame を解決するときに `fireSummonTrigger` が立てるので、**効果の最中には立たない**＝BS05 リトルナイト・ランスロットの「相手の召喚時効果を受けない」判定（EffectModules.ts:196）は出口の解決時に正しく読める。効果の最中に別の召喚時効果を解決する経路（いまの積み重ね）は、遅らせると**積み重ねが発生しなくなる**（入れ子ではなく列になる）。burst.ts:241-249 の `resolved` 印の読み手が変わらないか要確認。
- `summonBatch`（同時召喚）との関係：`summonBatchFlush` が出口と別に走る。**出口へ一本化**するなら `summonBatch` は不要になる（推測）が、別 PR にしてよい。

### 9.5 影響を受けるカードの規模

「効果エントリの action 木を JSON の出現順に並べ、その出来事の後に別の action（`settleDerived`・`noop` 以外）が続く」ものを数えた。**続きが同じ文の続きかは数えていない上限**（「召喚する。その後バーストをセット」のように、続きが派生の結果と無関係なものも含む）。コストの疲労・コア除去（`pay` の cost）は別に数えた（コストの出来事は、恩恵の後に派生＝§7②と同じ扱いか、COST_MODEL を見て決める）。

| 出来事 | 出来事を含む効果のあるカード | 続きあり（コスト以外） | コスト（`pay.cost`） | 続きなし（最後の手） | 代表 |
| :-- | --: | --: | --: | --: | :-- |
| 疲労 | 230 | 22 | 59 | 156 | BS10-104 トライアングルトラップ（3体疲労）・BS14-100 ストームアタック（疲労→その後回復）・BS14-X03 |
| 回復 | 275 | 21 | 0 | 255 | BS01-142 ピュアエリクサー・BS06-103 キャバルリー・BS09-076 |
| ドロー | 239 | 30 | 0 | 210 | BS01-132 ストームドロー（ドロー→破棄）・BS15-074 三札之術・BS10-098 |
| 召喚 | 135 | 5 | 0 | 131 | BS17-005 ドラグ・クリシュナー・BS17-032 ヴァイキング・レイヴ・BS18-X01 |
| コア配置 | 269 | 14 | 3 | 258 | BS01-124 イビルオーラ・BS13-058 シユウ・BS14-106 |
| コア除去 | 196 | 20 | 34 | 160 | BS02-094・BS05-083・BS10-019 |
| ライフ減少 | 38 | 1 | 0 | 37 | BS18-X03 蒼穹の覇王カーン・ウルフ |
| ネクサス配置 | 24 | 1 | 0 | 23 | BS14-064 レボルシング・ゼヨン |

- 5出来事（疲労・回復・ドロー・召喚・コア配置）の「続きあり（コスト以外）」の和集合は **91枚**、コスト疲労・コスト配置を含めると 149枚（重なりあり。他の行は別集計）。**続きの無いもの（約 90%）は遅らせても観測できない**（出口でも同じ結果）。
- 出来事を**見張る側**の fieldEvent を持つカード：疲労 `ownSpiritExhausted` 15・`anySpiritExhausted` 7、回復 `anySpiritRefreshed` 4・`ownSpiritRefreshed` 1、ドロー `opponentDrew` 9・`opponentDrewByEffect` 2、召喚 `ownSpiritSummoned` 35・`anySpiritSummoned` 1、`coresGainedFromVoid` 4。**召喚時（`onSummon`）は442枚**で、効果の召喚の遅れは最も多くの札に波及する。
- **「この効果発揮後」**：効果文に持つカードが36枚、`settleDerived` がデータにあるのが14枚（BS14-X01・BS15-004・BS15-083・BS15-X05・BS16-018・BS17-056/057/058・BS17-X01・BS18-X01・BS22-073/077・BS23-052・X013）。**区切りが未挿入の22枚**：BS07-X27・BS10-108・BS11-X05・BS12-058・BS12-078・BS13-042・BS13-046・BS13-067・BS13-071・BS13-081・BS17-038・BS17-039・BS17-042・BS17-066・BS17-070・BS17-X05・BS18-X05・BS19-053・BS19-076・BS22-009・P033・P076。破壊以外の派生（召喚後・ドロー後など）が前にあるものを含む。**今回の範囲に入れるなら、これらに区切りを入れる**（データ移行。コードは §8 で済み）。

### 9.6 既存テストへの影響の見込み

scripts/smoke/ は 897 ファイル（part 889本）。当たり（grep のみ・未実行）。

| 当たりの付け方 | 件数 | 代表 |
| :-- | --: | :-- |
| 上の「続きあり」149枚の cardId を含む part | **204本**（カード単位で 143枚に当たりがある） | part6・31・34・68・69・74・104・106・115・128 ほか |
| fieldEvent 名を含む part | 疲労 `ownSpiritExhausted` 4・`anySpiritExhausted` 3（part108・288・303・322・452）、召喚 `ownSpiritSummoned` 9（part112・183・184）・`anySpiritSummoned` 1（part648）、`opponentDrew` 6（part144・146・216）・`opponentDrewByEffect` 1（part316）、回復 `anySpiritRefreshed` 4（part317・452・648）、コア `coresGainedFromVoid` 1（part646）・`lifeCorePlaced` 1（part647）、`opponentHandAdded` 3（part31・353・635） | 見張る側のテストは**効果の途中で誘発の結果を見ている**可能性が高い（推測）。`part646/647` は「効果1回につき1回」を扱っており、出口との関係を要確認 |
| 召喚時の列を扱う part | `onSummon` 言及 56本・「召喚時」言及 282本（重なりあり） | 召喚の出口化は数が最も大きい |

204本のうち、**期待値が動くのは「続きが派生の結果を読む」か「派生が続きの前提を変える」形だけ**（推測。1割未満の見込みだが、数えていない）。

### 9.7 ユーザーに確認すべき論点（私はこう解釈しました）

公式 Q&A は ストームアタック（Q24956 のみ。回復できるかの質問）・ドラグ・クリシュナー（Q3759・Q3760）・ヴァイキング・レイヴ（Q3804・Q3805）のページを見たが、**派生の解決順に触れる Q&A は見つからなかった**。根拠は RULES_BATSPI_WIKI.md:93 と CONJUNCTION.md:10・:14 のみ（破壊以外は Q 番号なし）。

1. **範囲：疲労・回復・ドロー・召喚・コア配置・除去・ライフ減少・デッキ破棄のすべてを遅らせる**（規則は出来事の種類で変わらない）。影響：続きあり約91枚＋コスト59＋34。**段階導入にするなら、召喚（`onSummon` 442枚に波及）を最後の1本にする**案。
2. **効果で召喚したスピリットの『召喚時』は、元の効果を最後まで解決してから**（「この効果発揮後」だけが先に解決。CONJUNCTION.md:14）。影響：効果の召喚を含む札（summon action 135枚のうち続きありは5枚だが、召喚時効果を**見る側**は442枚）。ドラグ・クリシュナー「召喚する。その後バーストをセットできる」は、召喚時効果より**セットが先**になる。
3. **コストの疲労・コア除去（「疲労させることで」59枚・「コアを取り除くことで」34枚）の派生は、恩恵（then）の後**（§7②の破壊と同じ）。違うなら（コスト払いの時点で即解決）、`pay` の中だけ別の扱い。
4. **1本の列に全部まとめ、ターンプレイヤーが順番を決める**（§8 と同じ。破壊・疲労・召喚の派生を混ぜる）。同時発揮の「1回」は出来事ごと。
5. **「〜したとき」を数える効果の扱い**：`eventCount`（ドローした枚数・置いたコア数）や `repeatPerCount` は、出来事の**時点**で数を確定して持ち越す（出口で数え直さない）。影響：`opponentDrew` 9・`coresGainedFromVoid` 4・`lifeCorePlaced` 2 ほか。
6. **効果の続きは、派生が解決される前の盤面を読む**（例：ストームアタックで相手を疲労させた派生で自分のスピリットが回復しても、続きの「回復させる」の対象選びには影響しない）。破壊待機の体が場に残る扱い（§8-8）と同じ。
7. **「この効果発揮後」が未挿入の22枚**に区切りを入れる範囲（今回含めるか、各出来事の PR で必要になったものから入れるか）。
8. **効果の外の出来事（アタック宣言の疲労・ステップの回復・ドローステップ）は今のまま即時**。**バーストが起こす召喚・疲労は効果の中**（`resolveAction` を通る）なので派生の対象。バースト効果の出口の扱いは `finishBurstActivation` の `settle` 段（burst.ts）と二重にならないか要確認。

### 9.8 実装時の注意（推測を含む）

- 出来事の入口は集約済み（`exhaustSpirit`・`refreshSpirit`・`draw`／`notifyHandGained`・`fireSummonSequence`・`fireCorePlacedFromDiff`）。**入口ごとに「効果の中か」を `state.currentEffectSource?.effectId !== undefined` で見て集め先を変える**のが最小。`fireFieldEventTriggers`／`fireTrigger` の内側に1か所だけ書くか、入口に書くかは設計担当が決める（内側に書くと、バトル・ステップの collect との2通りの `collect` が混ざる）。
- **イベントバーストの `checks`** を一緒に持ち越す必要がある（9.2）。持ち越さないと【ライフ減少後】・【召喚後】系の確認が効果の最中のままになり、列とバーストの順が合わない。
- 勝敗確定・サドンデスのとき、`derivedItems` を捨てる処理が要る（`settleSpirits` の `state.winner` 分岐と同じ）。

## 10. 確定した設計：待機を持たない出来事（2026-11-17。ユーザー確認「それでいいよ」）

範囲と順番：**1本目の PR** で疲労・回復・ドロー（手札に加わる `notifyHandGained` を含む）・コア配置（`fireCorePlacedFromDiff` もこの列へ）・コア除去・ライフ減少・デッキ破棄。**2本目の PR** で召喚（効果で召喚したスピリットの『召喚時』も効果の後。`fireSummonSequence` を前半と尾ごと1項目で持ち越す。§9.4）。

1. **集める場所（案X）**：`state.derivedItems: { effectId; items: { key; label; frame }[] }[]`（key・label は順番の選択に使う）。出来事の時点で、`state.currentEffectSource?.effectId` が立っていれば誘発を `collect` で集めて frame を積む（その時点の盤面で成否を決め、出口で集め直さない）。立っていなければ今のまま即時。読むのは `settleDerived` の1か所だけ。勝敗が決まったら捨てる。state 経由の受け渡しは `holdDerivedFor`・`resumeEffectId` に続く3つ目（既知の制限に書く）
2. **1本の列**：出口で、待機の3種の列（`runDestroyQueue` の `destroyExtraItems`）に `derivedItems` の項目を足し、ターンプレイヤーが順番を決める。破壊が無い効果は `derivedItems` だけで `resolveInOrder`。**イベントバーストの判定は遅らせない**（宣言は条件を満たした時点、適用は効果の後＝BURST.md §1.4。最初は一緒に遅らせて part953 が落ちた）
3. **コストの派生**（「疲労させることで」「コアを取り除くことで」）も恩恵の後（RESUME_STACK §7②。11-17 から効果の中すべて）
4. **数は出来事の時点で確定**（`eventCount`・`coresRemoved` などは frame に入れて運ぶ）。効果の続きは派生を解決する前の盤面を読む
5. **効果の外**（アタック・ブロック宣言の疲労・リフレッシュステップ・ドローステップ・バトルのライフ減少）は今のまま即時
6. **区切り**：カシオペアシール（BS12-078）の「疲労させる。…この効果発揮後」に `settleDerived` を挟む。§9.5 の残り21枚は「マジックを使用したとき、その効果発揮後」（誘発の形）か、前に出来事が無いので入れない

## 11. 確定した設計：召喚（2本目。2026-11-17。範囲はユーザー確認済み「それでいいよ」）

効果で召喚したスピリットの『召喚時』と、ほかのカードの「召喚されたとき」も、元の効果を解決し終えてから #609 の列と1本で解決する（ドラグ・クリシュナー「召喚する。その後バーストをセットできる」はセットが先）。効果の外の召喚（手札からの通常召喚・【神速】・【烈神速】）と、出口の列の中の【不死】・復活の召喚はその場のまま。

1. `fireSummonSequence`：効果の中（`currentEffectSource.effectId`）なら、集めた `items`（自分の『召喚時』＝`summonSequence triggerOnly` の frame、「召喚されたとき」の fieldEvent）を `resolveInOrder` せず `holdDerived` へ。**イベントバーストの判定はその場**（宣言は条件の時点。BURST.md §1.4）
2. 後半（`finishSummonSequence`）：ブレイヴの「召喚されたとき」（`anyBraveSummoned`）は `HELD_EVENTS` に入れて自然に遅らせる。トラッシュから召喚・手札に戻る（`tryTrashSummonOnNameSummoned`・`returnTrashOnNameSummoned`）は誘発なので派生の1項目（`summonSequence` の tail を段2〜3に限る frame）として遅らせる。召喚されたスピリットが疲労する継続効果（`summonedExhaustGrant`）はその場
3. `ownSpiritSummoned`・`anySpiritSummoned` も `HELD_EVENTS` に入れる（`fireSummonSequence` 以外から出る経路があっても効果の中なら遅らせる）
   - 合体（`anySpiritCombined`）も入れる（#673。バーニングサンの「合体させて召喚し、回復させる」の後に闇の聖剣Lv2が疲労させる）
   - バースト設置・転召・ネクサス配置・キーワード発揮・【氷壁】使用・分身配置も入れる（2026-11-22 ユーザー確認：効果で起きた出来事の誘発は、その効果の処理をすべて終えてから。新しい出来事を足すときも入れる）
4. 同時召喚（`summonBatch`）：効果の中では、全員を場に出した後の順番の確認を出さない（各体の誘発は出口の1本の列で順番を聞く）
