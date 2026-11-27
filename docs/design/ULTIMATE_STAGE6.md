# アルティメット 段6：【Uトリガー】設計メモ（2026-11-27）

規則は ULTIMATE_PLAN の C1〜C14（確定済み）。ULTIMATE.md §7 の型案（`kind:"uTrigger"` の効果定義・`perHit`）は古いので使わない。
**作るのは action `uTrigger` と、その手順・出来事・戦闘状態だけ。** 作らないもの：【トリガーカウンター】の窓の中身、カードデータ。

## 1. 型（`server/src/types/effectAction.ts` に 1 種）

効果定義の新 kind は作らない。『このアルティメットのアタック時』は既存の `trigger: onAttack`（召喚時・ブロック時も同じ）の効果の中に、action `uTrigger` を 1 つ書く。

```ts
{ type: "uTrigger"
  count: number | "cost"        // 置く枚数。U=1・WU=2・TU=3・QU=4・OU=8（C1）。XU 以外の「CU」は別名で足す（質問 Q3）
  hit: EffectAction[]           // ヒット効果（C10）。ヒット1回につき…は countCounter で書く（既存）
  hitBonus?: { need: number | "all"; actions: EffectAction[] }[]   // 【ダブルヒット】need:2・トリプル need:"all"（TU）など。hit と同時に発揮（C10・C11）
  xu?: EffectAction[]           // 段6（C14）
  progress?: UTriggerProgress   // 内部。カードデータには書かない（パターンB）
}
type UTriggerProgress = {
  stage: "window" | "hit" | "after" | "xu"
  ultimateInstanceId: string          // 発生源（合体中ならホスト）
  placed: { cardId: string; verdict: "hit" | "miss" | "guard" }[]   // 段1・2 の結果。札ごと（C4・C5）
  guardedAll?: true                   // 【トリガーカウンター】でUトリガー全体がガードされた（後の段が入れる。C8）
  hitFired?: boolean                  // 段4 に進んだか（ヒットあり・全体ガードでない・まだ場にいる）。ヒット効果の対象がいなくて何も起きなくても true（Q806 と同じ考え方）
}
```

- 札ごとの結果（`placed`）は action の中に持つ。再開フレームは `ResumeFrame{kind:"action"}` に `progress` つきの `uTrigger` を積むだけなので、中断・再開をまたいで一緒に運ばれる（設計の3原則の3）。state の一時フィールドは使わない。
- 「ヒット」は `placed.some(verdict==="hit")`。ヒット数 `n = placed.filter(hit).length`。ダブルヒット = n>=2、「すべて」= n===count。ガード札が1枚でもあれば「すべて」は成立しない（C4）。
- ガード札の判定はカード側のデータを読む（質問 Q1）。

## 2. 手順（新ファイル）

| 置き場 | 中身 |
| :-- | :-- |
| `server/src/logic/uTrigger.ts`（新） | `resolveUTrigger(ctx, action)`：段の振り分け。段1〜6 の関数をここに集める |
| `server/src/logic/actions/uTrigger.ts`（新） | `ActionRegistry` への登録（`actions/index.ts` に 1 行足す） |
| `shared/rules/uTrigger.ts`（新） | 純関数 `uTriggerVerdict(placedPrintedCost, ultimateCost, guarded)`・`isUTriggerGuard(cardData, ultimateInst)`。クライアントの表示でも使えるように shared |

段ごと：

1. **置く**（`uTriggerPlace`）：相手の `deck` の上から `min(count, deck.length)` 枚を `trashCards` へ直接移す。`millDeck` は使わない（`opponentDeckMilled`・`ownDeckMillPrevented`・破棄税・【強化】は全部通らない。C2）。移した枚数 0 なら `placed=[]`。ログ：「〜のデッキの上から◯枚をトラッシュに置いた」。
2. **判定**（`uTriggerJudge`）：札ごとに verdict を決める。ガード札（Q1）→ guard。そうでなければ `getCard(cardId).cost < instBaseCost(ultimate)` で hit、それ以外 miss。CU は右辺を自分のカウント（Q3）。
3. **窓**（`uTriggerWindow`）：**何もしない関数**として置く。段4 の手前で呼ぶ。後で BS26 を入れるときに、ここへ選択待ち（相手手札のトリガーカウンターから0枚以上）を足し、`progress.stage:"window"` のフレームで再開させる。ヒット（n>=1）のときだけ呼ぶ（ヒット効果が発揮できなくても窓は出る：C6）。
4. **ヒット効果**（`uTriggerHit`）：ヒットあり・`guardedAll` でない・発生源が `field.ultimates`（合体中なら `field` のどこか）にまだいる、のときだけ。`hit` と、`need` を満たす `hitBonus.actions` を**1本の列**にして `pushResumeFrames` で積む（対象選びは各 action が普通に出す）。それ以外は `hitFired=false`。
5. **派生**（`uTriggerAfter`）：段4 の列の**後ろ**に積む内部フレーム（`progress.stage:"after"`）。§3 の出来事を発火する。
6. **XU**（`uTriggerXu`）：`settleDerived` フレームを挟んでから `xu` を積む（§5）。

積む順（`pushResumeFrames` は先頭から解決）：`[ …hit列, {uTrigger stage:"after"}, {settleDerived}, …xu ]`。段1・2 は同期で終わる（中断なし）。段3 以降に中断がありうる：①ヒット効果の対象選び ②派生の誘発の順番選び（`resolveInOrder` の `askOrder`）③ XU の対象選び。いずれも既存の再開スタックの仕組みに乗り、新しい選択待ちの種類は作らない。

**C11（破壊したとき1回）**：ヒット効果とダブルヒットの破壊は、同じ効果の中で待機に入るだけで、確定と「破壊したとき」の列は効果の出口（`settleDerived`）で1本にまとまる。`hit` と `hitBonus` を別々の effectId にしないこと（同じ `uTrigger` の effectId で解決する）。

## 3. 出来事（`server/src/types/fieldEvent.ts` に 3 つ）

| 名前（案） | 発火する場所 | 条件（C12） |
| :-- | :-- | :-- |
| `ownUTriggerHit` | `uTriggerAfter`。持ち主のフィールドから、`selfOverride=発生源のアルティメット` | `hitFired===true`（段4 に進んだとき。ヒット効果の対象がいなくても出る。ダブルヒットでも1回） |
| `ownUTriggerGuarded` | 同上 | （verdict に guard が1枚以上 または `guardedAll`）かつ アルティメットがまだ場にいる。ヒット効果が出たかは問わない（1枚の U がガード札で止まったとき・【トリガーカウンター】で全体がガードされたときも出る：Q871・C12） |
| `ownUTriggered` | 同上（「Uトリガー発揮後」） | 常に（デッキ0枚・場を離れていても） |

- `derivedSettle.ts` の `HELD_EVENTS` に3つを足す。効果の中の出来事は出口で1本の列にまとめて解決する既存の仕組み（派生の列）に乗せる。これでヒット効果で起きた破壊の誘発と同じ列になり、「ヒット効果の後に派生として解決」になる。
- 発火は `fireFieldEventTriggers(state, owner, event, {pid, inst: ultimate}, …)`。`opponentDeckMilled` は出さない。
- 「ヒットしたとき」の持ち主：自分のアルティメットのUトリガーだけを想定（Q4）。

## 4. コストの比較

- アルティメット側：`shared/rules/level.ts` の `instBaseCost(inst)`。`braveComposite.cost`（合体したブレイヴのコスト合計）・`costDeltaContinuous`・`timedCostDelta` を全部足した「今のコスト」が唯一の算出口。ブレイヴ側にコストを減らす効果がある場合は、その減算が `braveComposite.cost` に入っているかを実装役が確かめる（入っていなければ質問 Q5）。
- 置いた札：`getCard(cardId).cost`（印刷。デッキのカードに軽減は効かない：C3）。`instBaseCost` は使わない。

## 5. 既存への差し込み

- `attackDeclared.ts` は**変えない**。『アタック時』の効果は `fireTrigger(... "onAttack")` が `items`（`CollectedTrigger`）に集め、`resolveInOrder` が1件ずつ解決する。`uTrigger` はその1件の中の action。
- 「XU は同時の別のアタック時効果より先に」（C14）：`uTrigger` が積んだフレームは、`resolveInOrder` が控えた残りの項目より上に積まれる（RESUME_STACK §3 の挿入順）。これで、ヒット列→派生→XU が終わってから次の項目へ進む。実装役は「アタック時の効果が2つ（片方に XU つき）ある盤面」で順を確かめること。
- `settleDerived` を XU の手前に挟むのは、派生（ヒット時・破壊時・発揮後）が **XU の前に全部終わる**ため（C14「すべて解決した後」）。既存の action `settleDerived` をそのまま使う。
- ヒット／ガードの結果を戦闘に持つ（C12例外・ライオドラス用）：`BattleState` に `uTriggerHitters?: string[]`（いまヒットしているアルティメットの instanceId）を足す。段2 の終わりに、ヒットがあれば追加。カウンターのガード（段3 の将来の窓）が `guardedAll` を立てたら外す。バトルが終われば BattleState ごと消える。召喚時などバトル外では書かない。常時効果側は新しい条件 `ifCond` の kind `uTriggerHitting`（`self` のバトルに自分のアルティメットのヒットがあるか）で読み、`globalConstraint`（マジック使用禁止）に付ける。ここは「バトルの事実」であって一時フィールドへの隠れた書き込みではないので許容する（action 内の `placed` が正で、これは常時効果が読むための写し）。
- クライアントは段6 では触らない。

## 6. テストの場面案（`scripts/smoke/partN.ts`。偽のアルティメットカードを登録して組む）

| 節 | 動く盤面 | 動かない盤面 |
| :-- | :-- | :-- |
| 段1 置く | デッキ上 N 枚がトラッシュへ（U=1・WU=2・TU=3）。デッキ破棄無効の相手にも置ける | `opponentDeckMilled`／粉砕系の誘発が発火しない。【強化】で枚数が増えない。「デッキ破棄されたとき」のカードが反応しない（C2） |
| 段2 判定 | コスト3の札・コスト5のアルティメットでヒット。合体前はコスト5で miss・合体後（ブレイヴのコスト加算）は hit | コスト5の札・コスト5でヒットしない（同じ）。コストを減らすブレイヴと合体して合計が札以下で miss。置いた札のコストに軽減は効かない |
| ガード（C4） | WU：ガード札＋ヒット札 → ヒット効果と「ガードされたとき」が出る。ダブルヒットは出ない | コスト8のアルティメットにサーベルセセリ（コスト7以下のみ）が効かず hit |
| ダブルヒット（C5） | WU 2枚ヒット→hit 効果＋ダブルヒット追加。TU 3枚すべて→トリプル | WU 1枚ヒットでダブルなし。TU 2枚ヒットでトリプルなし |
| 段4 離れた | — | ヒット判定後、置いた効果の途中でアルティメットが場を離れていたらヒット効果が出ず、「ヒットしたとき」「ガードされたとき」も出ない、「Uトリガー発揮後」は出る（C12）。※窓がまだ無いので、テストは `hit` の先頭に自分を破壊する action を置いて組む |
| C11 | ヒット効果＋ダブルヒットで2体破壊→「破壊したとき」が1回 | — |
| C13 | 相手デッキ0枚：何も置かず、ヒット効果・窓なし、「発揮後」は出る。負けない | 「ヒットしたとき」が出ない |
| 派生3つ | ヒット→`ownUTriggerHit` の誘発がヒット効果の後に解決（順序をログ・盤面で確認） | ミス（全部 miss）：3つのうち「発揮後」だけ |
| C14 XU | `xu` が派生（ヒット時誘発・破壊時誘発）の後に解決。同時の別アタック時効果より先 | ガードされても XU は行う。Uトリガーが発揮されない（`uTrigger` が条件で不発）と XU は行わない |
| 戦闘の印 | ヒットでバトル中に `uTriggerHitters` が入り、条件 `uTriggerHitting` が真。バトル後は消える | 全 miss・ガードで偽 |

期待値役が効果文なしで書けるよう、偽カードは「コスト・合体・ガード札」をテスト側で組む。実装役には変異テスト（`<` を `<=` に変える・`min(count, deck.length)` を外す・`HELD_EVENTS` から外す）で落ちることを確かめさせる。

## 7. 質問（規則の表で決まらないもの）

| # | 問い | 何に効くか |
| :-- | :-- | :-- |
| Q1 | ガード札（サーベルセセリ・ホソアカクワガー）をカードデータでどう書くか。案：札側の効果エントリ `{kind:"uTriggerGuard", ultimateMaxCost?: 7}`（デッキ／トラッシュにあるカードの静的な性質として `shared/rules/uTrigger.ts` が読む）。1枚専用の type にならないよう、条件はコスト上限だけ | `isUTriggerGuard` の形。カード取り込み前に決めたい |
| Q2 | デッキ0枚で `uTrigger` が発揮されたとき、XU は行うか（C14「発揮されなければ行えない」と C12「発揮後は常に発揮」から、行う側に読めるが未確認） | 段6 の分岐 |
| Q3 | CU（コスト参照）の書き方：`count:"cost"` の「自分のカウント」の中身（何を数えるか）。プールに CU が出てから決めるなら、段6 では枚数 `number` だけにする | 型 |
| Q4 | 「ヒットしたとき」「ガードされたとき」は、相手のアルティメットのUトリガーに対して自分のカードが反応する形（`opponent…`）はあるか。当面は自分のだけ | 出来事の名前 |
| Q5 | コストを減らすブレイヴの減算が `braveComposite.cost` に既に反映されているか（読んでいない）。反映されていなければ、「合体でコストが大きくなりすぎない」ための別の算出口が要る | C3 の判定 |
| Q6 | ライオドラスの条件（`uTriggerHitting`）が効く時点：ヒット確定（段2）から。窓より前なので §5 のとおりでよいか（C12例外の文面どおり） | BattleState の書き込み時点 |

## 8. 実装役への分け方

1 体で収まる見込みだが、新しい器が「action 1・出来事3・戦闘の印と条件1」あるので、次の2つに分けると安全（目安は 150 呼び出し）。

- **6a**：型・`uTrigger` ハンドラ・段1〜5・出来事3 と `HELD_EVENTS`・`isUTriggerGuard`（Q1 の確定後）。テスト：段1・段2・ガード・ダブルヒット・離れた・C11・C13・派生3つ。
- **6b**：段6（XU・`settleDerived` の挟み）・段3 の窓の位置（何もしない関数）・`BattleState.uTriggerHitters` と条件 `uTriggerHitting`。テスト：C14・戦闘の印・変異テスト。

6a の完了条件：typecheck と自分の part だけの実行（定型は統合後にメインループが1回）。

## 9. メインループの回答（2026-11-27）

- Q1：案どおり `{kind:"uTriggerGuard", ultimateMaxCost?}`。
- Q2：行う。Q836（デッキ0枚でも Uトリガーは発揮している）・Q820（Uトリガーが発揮されれば XU は行える）から。
- Q3：段6 では枚数 `number` だけ。CU はプールに出てから決める。
- Q4：相手の Uトリガーに反応するのは【トリガーカウンター】（窓）と、置かれた札を見る効果。出来事は当面 own だけでよい（相手側が要るカードを入れるときに opponent を足す）。
- Q5：実装役が確かめる。反映されていなければ報告に書く（規則は C3「減らす効果があれば減らした後」）。
- Q6：段2 のヒット確定から（決めた文面「ヒットしているバトルの間」どおり）。
- §3 の `ownUTriggerGuarded` と `hitFired` の条件をメインループが直した（ガードの出来事はヒット効果の有無を問わない。Q871）。

