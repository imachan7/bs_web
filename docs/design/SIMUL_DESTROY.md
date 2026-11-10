# 同時破壊：全員の誘発を解決し終えてからまとめてトラッシュへ（調査メモ 2026-11-10）

凡例：【確認】＝コードを読んで確かめた／【推測】＝読んでいない・動かしていない。行番号はブランチ feat/revive-pick-many の時点。

## 0. 食い違いの要約【確認】

`destroySpiritsFrom`（removal.ts:912）は targets を for で1体ずつ `destroySpirit` に渡し、**1体ぶんの「破壊待機→誘発の列→commitPendingDestruction」を終えてから次へ進む**。
一次資料（TIMING_CHART §1.5）は「全員の誘発を解決し終えてから、破壊待機の全員をトラッシュへ」なので、体1は体2の誘発中にすでに場に居ない。
`scope:"ownAll"` の「残る」の発生源（コロナ）が先に処理されて残らないと、トラッシュへ移り、`effectSources` から消えるので、後の体に効果が届かない。

## 1. 同時破壊の流れの地図【確認】

| 関数（removal.ts） | 行 | 役割 |
| :-- | --: | :-- |
| `destroyTargetsBatch` | 951 | 入口。`state.destroyGroup`（id・memberIds・used・familiesByPid・pickMany）を作り、pickMany の選択→`destroySpiritsFrom`→（完了なら）`restoreDestroyGroup`→`fireQueuedDestroyBursts`→`applyDestroyBatchAfter`。中断なら `destroyBatch` フレームを積む |
| `destroySpiritsFrom` | 912 | for で1体ずつ。`askDestroyOrder`（残る確認が2体以上なら破壊処理の順をTPに聞く）→`destroySpirit`。pendingChoice／winner で抜ける。`record()`＝`recordDestroyedCount`（`context.trashedCount` を使う） |
| `resumeDestroyBatch` | 1007 | `destroyBatch` フレームの再開。`state.lastReviveDestroyed`（復活を断って破壊された）を破壊できた数に足す→`destroySpiritsFrom`続き |
| `destroySpirit` | 152 | 1体の破壊。204行で `pendingDestruction=true`（破壊待機の印）、`pendingDestroyContext` 等を控え、`extraItems`（自身の破壊時 first／onBattleLose／`collectReviveEntries`＝残る／【不死】／手札からの無償召喚）を作り、`fireOwnSpiritDestroyed` へ渡す。中断なら `suspendDestroyCommit`、そうでなければ**358行で `commitPendingDestruction`**、グループ外なら `fireQueuedDestroyBursts` |
| `fireOwnSpiritDestroyed` | 273付近 | ownSpiritDestroyed／opponentSpiritDestroyed の fieldEvent を `fireFieldEventTriggers`（fieldEventTriggers.ts。列＝triggerBatch を作り TP が順を選ぶ）へ。`state.lastOpponentSpiritDestroyedFamilies` に group.familiesByPid を入れる |
| `suspendDestroyCommit` | 369 | 誘発が中断したとき、破壊待機のまま `destroyCommit` フレームを積む（既に `triggerBatch` があればその `after` に付ける） |
| `resumeDestroyCommit` | 479 | `destroyCommit` 再開。step≤1 なら fieldEvent 続き→**491行で `commitPendingDestruction`**→グループ外なら `fireQueuedDestroyBursts` |
| `commitPendingDestruction` | 573 | 確定。`pendingDestruction` が無ければ即 return（復活済み）。破壊後バースト材料を `pendingBurstDestroyQueue` へ→場から splice→トラッシュ（BP0はデッキ下・トークン・分身）→コアをリザーブ/トラッシュ/ボイド/destroyedCoresToSelf→`delete pendingDestruction`→`detachBravesOnLeave`（ブレイヴを残すかの確認は `pendingBraveKeeps` に積むだけで、ここでは中断しない）→`separateBravesOverLimit` |
| `fireQueuedDestroyBursts` | 696 | `pendingBurstDestroyQueue` を `groupKey`（=`destroyGroup.id`）＋持ち主でまとめて発火。ブレイヴ確認・コア行き先選びが決着するまで待つ |
| `restoreDestroyGroup` | 1034 | 入れ子に備え、バッチ前の `destroyGroup` に戻す |
| `applyDestroyBatchAfter` | 1041 | 「この効果で破壊した1体につき」の後処理 |
| revive.ts `collectReviveEntries` | 263 | `tryReviveOnDestroy` を collect モードで呼び、列の項目を作る。ownAll で perDestroyed でない発生源は `group.used` に `${source}:${effectId}` を仮消費（グループ1回） |
| revive.ts `tryReviveOnDestroy` | 708 | 残る/戻るの本体。self→合体ブレイヴ→ownAll の順に走査（1300〜1350） |
| choice.ts | 867/876 | drainResumeStack が `destroyBatch`／`destroyCommit` フレームを回す |
| revivePickMany.ts | 111/126 | `askNextPickMany`（グループ先頭で戻す体を選ばせる）と `selectedFirst`（**選ばれた体を先に処理する並べ替え。今回の食い違いの対症療法**） |

呼び出し元：`destroyTargetsBatch` は battleResolve.ts（相打ちは**1バッチに2体**：同:648〜650・803）と actions/destroy.ts:231。直接 `destroySpirit` は単体（バトル後の個別破壊・消滅 deplete 等。グループ外なので従来どおり即トラッシュでよい）。

## 2. 最小の変更案

### 案A（推奨）：`commitPendingDestruction` をグループ内では「後回し」にし、バッチ完了時にまとめて呼ぶ【推測。コードの流れは読んだが動かしていない】

- 型：`destroyGroup` に `deferred: { pid; instanceId }[]` を足す（gameState.ts:119）。
- 新関数 `commitOrDefer(state, pid, inst)`（removal.ts）：`state.destroyGroup?.memberIds.includes(inst.instanceId)` なら `deferred` へ積む、でなければ従来どおり `commitPendingDestruction`。
- 差し替え箇所：`destroySpirit` の358行、`resumeDestroyCommit` の491行、`suspendDestroyCommit` の winner 分岐（369付近は勝敗が決まったら即確定でよいので据え置き可）。
- 新関数 `flushDeferredCommits(state)`：`deferred` を順に `commitPendingDestruction`（`pendingDestruction` が消えていれば自然に空振り）。`destroyTargetsBatch` の完了側（982〜999）と `resumeDestroyBatch`（1017〜1029）の、`restoreDestroyGroup` の**直前**で呼ぶ。winner で `stoppedAt=targets.length` を返す経路でも呼ぶ（呼ばないと破壊待機の印が残る）。
- 「実際に破壊できた数」：`destroySpiritsFrom` の `record()` が `context.trashedCount` を読むが、`trashedCount` は commit 時に増える（commitPendingDestruction 内）。後回しにすると `record()` 時点で0になる。**`record()` を flush の後へ移す**（destroySpiritsFrom 内の2か所の `record()` を外し、`destroyTargetsBatch`／`resumeDestroyBatch` が flush 後に `recordDestroyedCount` する）。中断で抜けるときは記録しない（最後に一度）。
- `selectedFirst` は不要になる（発生源は全員の確認が終わるまで場に居るため）。`askNextPickMany` は残す（選択そのものは別機能）。
- 副産物：`destroyedCoresToSelfCandidates` が `source.pendingDestruction` を除外しているので、グループ内で待機中の体にコアが集まる事故は起きない（読んだ）。

変更ファイル見積もり：本体 removal.ts、型 gameState.ts、削除 revivePickMany.ts（`selectedFirst` のみ）＝**3ファイル**。テスト追加 1 part。

壊れそうな既存の挙動【推測を含む】：

| 挙動 | 何が起きうるか | 確認する smoke |
| :-- | :-- | :-- |
| 破壊できた数 | 上の `record()` 移動を忘れると「1体につき」が0体になる | part348（perDestroyed の3節）、`trashedCount` を使う各 part（grep では part 名の直接ヒット無し。`recordDestroyedCount` を呼ぶ側の part を `grep -ln "1体につき" scripts/smoke` で探す） |
| 後の体の誘発が先の体を「まだ居る」と見る | 体1が待機のまま場にあるので、体2の「自分のスピリット数」「選べる対象」に体1が入る。**一次資料どおりの正しい挙動だが、既存テストが「先の体は居ない」前提のものは落ちる** | 相打ち系（part10, 12, 97, 101, 129, 152, 162, 180, 254, 317, 4, 622, 620, 659, 661, 669, 722, 723, 735, 739, 752, 777, 785, 809, 826, 828, 833, 853, 855） |
| 【不死】 | 体2の破壊で【不死】を撃つとき、体1が場に居る分の枠（スピリット数上限・維持コア）が変わる | part181, 183, 195, 277, 300, 302, 319, 336, 475, 478, 596, 598, 602〜605, 618, 650, 657, 660, 664, 674, 718, 721, 732, 785, 808, 872 |
| 破壊後バースト | `groupKey=destroyGroup.id` のキューへの積む順がバッチ末の flush に集中するだけで、発火は従来どおり末尾。ただし flush 中にコア行き先選び（`pendingCoreDestinations`）が立つと `fireQueuedDestroyBursts` が待つ | part349 |
| ブレイヴを残す確認 | `pendingBraveKeeps` は commit が積むだけなので、flush で複数体ぶん一度に積まれる。順序は deferred の順＝targets の処理順 | part180・part217（destroyOrder）、ブレイヴ系 part は `grep -ln braveCantRemain scripts/smoke` |
| 入れ子の破壊 | 体1の破壊時で別バッチが走ると `destroyGroup` が内側に差し替わる。内側の flush は内側 deferred だけ、外側体は待機のまま。**外側の `destroyCommit` 再開が、内側がまだ group のときに走らない順であること**を確認要（resumeStack の順序は未確認） | part348、`grep -ln destroyGroup`は part348 のみ。入れ子は part182, 202, 204, 300, 329, 440, 453, 787（pendingDestruction を触る part） |
| 中断と再開 | `deferred` は state にあるので `destroyBatch`／`destroyCommit` をまたいで残る。`prevGroup` を frame が抱える設計なので、`deferred` も group と一緒に退避される | part151, 180, 217, 302（destroyOrder）、pickMany：part324, 880, 882 |
| 勝敗 | winner で途中終了したとき deferred を commit しないと待機の印が残る | 勝敗が絡む相打ち系 |

### 案B：1回の破壊につき1本の列に全員ぶんの誘発をまとめる（TIMING_CHART §0-3 の本来の姿）【推測】

全員を先に `pendingDestruction` にし、全員の `extraItems` と fieldEvent を1つの `triggerBatch` に入れて TP に並べ替えさせ、最後に全員を commit する。`destroySpirit` を「待機にする／列を作る／確定」の3つに割る必要があり、`fireFieldEventTriggers` の呼び出し（体ごと）・`destroyCommit` フレーム・`askDestroyOrder`・`collectReviveEntries` の `used` 管理・pickMany の「選ばれた体を先に」がすべて作り直しになる。変更は removal.ts・fieldEventTriggers.ts・triggers.ts・revive.ts・choice.ts 周辺で **5〜7ファイル**、相打ち系 part の期待値の組み替えも広い。案Aで「体ごとに順に列を解決するが、確定は全員が終わってから」という近似になる（列の順序をTPが体をまたいで選べない点だけ案Bと違う。現行の `askDestroyOrder` が体の順だけは聞いている）。**今回は案Aで足りる**。

## 3. 破壊待機中の発生源は `effectSources`／`tryReviveOnDestroy` の ownAll に入るか【確認】

- `effectSources`（shared/rules/level.ts:233）は `field.spirits` を `instEffectsSuppressed` で除くだけで、**`pendingDestruction` では除かない**。待機中でも発生源に数える。
- `tryReviveOnDestroy` の ownAll 走査（revive.ts:1320〜1350）にも `pendingDestruction` の除外は無い。待機中の発生源は有効。
- 除外される所：シンボル数・Lv条件の数え上げ（level.ts:474〜491。待機の個体を数えない）、`destroyedCoresToSelfCandidates`（removal.ts:509）、ネクサスの復活の発生源（revive.ts:191。ネクサスが待機中なら使えない）。
- よって案Aでは、コロナが待機のまま場に居る間は後の体へ効果が届く。**追加の変更は不要**。コロナ自身が「残る」を断って待機のままでも、その `reviveOnDestroy` は発生源として生きる（効果を自分で打ち消すのは「残る」成立時のみ＝`pendingDestruction` が消えたとき）。ただし、コロナが先に**残った**場合はそのまま場に居る通常の発生源になるだけ。

## 4. `reviveOnDestroy` の同時破壊1回制限【確認】

- 仕組み：`collectReviveEntries`（revive.ts:263）が ownAll の発生源に `${sourceInstanceId}:${effectId}` を `group.used` へ仮消費。`perDestroyed:true` のエントリは消費しない。`declineReviveConfirm` が断った枠を戻す。pickMany は選ばれた体について `perDestroyed` を強制（revive.ts:1345）。
- 「すべては」型を体ごとにするには、**カードデータに `perDestroyed:true` を付ければ足りる**（コード変更不要）。現状、ownAll の reviveOnDestroy で `perDestroyed` を持つのは pickMany 由来以外に無い（data/cards の ownAll 全件で false を確認）。つまり**今は「すべては」型も同時破壊につき1体にしか効かない**。
- ただし案Aを入れる前に `perDestroyed` を付けると、「先に処理された発生源が消えて後の体に届かない」問題が体ごとの確認に変わるだけで解決しない。**案Aとセットで入れる**。
- 「すべては」を含む ownAll の reviveOnDestroy 一覧（python で機械抽出。主語が「〜すべては」のもの）：

| cardId | 名前 | 該当節 |
| :-- | :-- | :-- |
| BS02-083 | 鏡の回廊 | 【装甲】を持つ自分のスピリットすべては…破壊されたとき、疲労状態で自分のフィールドに戻ることができる |
| BS03-102 | 無法者の荒野 | 効果の記述を持たない自分のスピリットすべては…破壊されたとき、疲労状態で戻る |
| BS03-106 | 深緑の樹海 | 同上（手札に戻る） |
| BS03-107 | 果て無き地平線 | 【神速】を持つ自分のスピリットすべては…コア1個をトラッシュに置くことで手札に戻る |
| BS03-111 | 子供部屋 午前0時 | e1・e2（Lv1／Lv3の相手に破壊） |
| BS03-132 | パーフェクトガード | このターン、【装甲】を持つ自分のスピリットすべては…戻る |
| BS03-135 | エスケープルート | このターン、系統2つ以上を持つ自分のスピリットすべては…手札に戻る |
| BS04-039 | 宝石虫スカラベール | 【神速】…コア1個をトラッシュに置くことで手札に戻る |
| BS04-081 | 強者統べる大地 | BP6000以上の自分のスピリットすべては…戻る |
| BS04-084 | 奇跡の丘 | 系統「天霊」…手札に戻る |
| BS05-036 | 氷の魔女ヘル | 「氷姫」…手札に戻る |
| BS05-071 | リアニメイト | このターン、【呪撃】…戻る |
| BS06-082 | 無限なる軌道母艦 | 「武装」…手札に戻る |
| BS06-087 | 夢中漂う桃幻郷 | 黄のスピリットすべては…疲労状態でフィールドに残る |
| BS07-070 | ブラックリチュアル | 破壊時効果を発揮した自分のスピリットすべては手札に戻る |
| BS08-063 | 勝者のグリーンフィールド | 「四道」…回復状態で戻る |
| BS09-026 | 軍艦長ドレッドノート | 【暴風】…疲労状態で戻る |
| BS12-X05 | 戦神乙女ヴィエルジェ | 「光導」/「天霊」…手札に戻る |
| BS13-X02 | 蛇皇神帝アスクレピオーズ | 「光導」/「妖蛇」…フィールドに残る |
| BS13-067 | 光導く巨塔 | 【重装甲】…戻る |
| BS14-109 | アルターミラージュ | このターン、コスト3以上…残る |
| BS18-044 | 創造主グリム・ジェイ | このスピリットと自分の[創造主グリム・ウィル]すべては…残ることができる |
| BS20-002/013/022/030/039/047 | 楯の守護者6種 | コスト3以下の自分のスピリットすべては…残ることができる |
| BS22-041 | アルミラージ | 【聖命】…残る |
| BS13-038 | 魔女タランダ | ※ pickMany 型（別機構。perDestroyed 不要） |

注：機械抽出は効果文に「すべては」を含む ownAll を拾ったもの。BS09-063 花の宮殿・BS13-038 の別効果などは「すべては」が別の節にあるだけなので一覧から外した（BS09-063 は単数型）。BS15-049「破壊されたスピリットすべてを」は「すべては」でなく別型（同時破壊につき1回で正しい）。
BS03-062 チワール（「そのスピリットすべてを」）・BS15-063 吊られた古城（「そのスピリット」）は単数・グループ1回型。

## 5. 案Aで落ちうる既存 smoke（上の表の再掲＋重点）

- 同時破壊グループの直接テスト：**part348**（used／perDestroyed）、**part349**（破壊後バースト）。
- 破壊順・確認：**part151, 180, 217, 302**（`destroyOrder`）。
- 破壊待機の中身を読む：**part182, 202, 204, 300, 329, 440, 453, 787**。
- 相打ち：上の表の30 part（`grep -ln 相打ち` の全件。実際に落ちるのは「先の体が居ない前提」のものだけ）。
- 【不死】：28 part（相打ち・同時破壊と【不死】が絡む part181/183/300/302/785 を重点）。
- pickMany：part324, 880, 882（`selectedFirst` を消すので、選ばれた体が先に処理される前提のテストが落ちうる）。
- 追加で必要なもの：コロナ＋ゴラドンを相手の効果で同時に破壊し、コロナが断ってもゴラドンに確認が出る場面（新 part）。`perDestroyed` 付与後は2体とも確認が出ること。

## 私（調査役）の推奨案

**案A**。理由：①`commitPendingDestruction` が確定の唯一の窓口で、呼び出しは358・491の2か所だけなので、後回しの差し込みが小さい。②中断・再開は `destroyGroup` が state に居るので `deferred` を足せば `destroyBatch`／`destroyCommit` をまたげる（新フレームは不要）。③`effectSources` と ownAll 走査は待機中の個体を除外していないので、データ以外の追加変更が要らない。④案Bは5〜7ファイル＋相打ち系の期待値の総組み替えで、得るものは「TP が体をまたいで順を選べる」だけ。
そのうえで `scope:"ownAll"` の「すべては」型（上の一覧の約26枚）に `perDestroyed:true` を付ける（案Aとセット。データ編集）。`selectedFirst` は削除する。
実装前に見たい点：入れ子バッチの外側 `destroyCommit` 再開の順序（外側が内側 flush より前に commit されないか）と、`recordDestroyedCount` を flush 後へ移す影響（part348 と「1体につき」系）。
