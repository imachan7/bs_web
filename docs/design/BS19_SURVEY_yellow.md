# BS19 調査メモ：yellow（調査役）
対象：BS19-045〜055、BS19-075/076、BS19-091/092/093、BS19-109/110/111、BS19-X05。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）

- 節の数：**30**（Lv見出し・キーワード単独行・フラッシュ／メインのブロック単位。連鎖行・強化行は含めない）
- 既存の器で書ける：**21**（うち「BP-する」5節は器 `bpMinus` が実装済みだが既存カードデータに手本なし。2節は【連鎖】キーワード値の追加が必要で軸は既存）
- 新しい部品が要る：**9**
- 連鎖：**3組**（BS19-051・055・111。すべて条件《白シンボル》×1）
- 強化：**1**（BS19-052、yellow）

## 2. 新しい部品の候補（表：# | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード）

| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
|---|---|---|---|
| 1 | FieldEvent「opponentSpiritBpReachedZero」：相手のスピリットがBP0になったとき（タイミング） | `ownSpiritBpReached`（fieldEvent.ts:42）は**自分側**限定で、判定式も「前回 < bpReachedAt <= 今回」の**増加**到達のみ。相手のスピリットがBP-効果で**減少して**0になる検知はどのイベントでも書けない。「ターンで初めて」は既存の `oncePerTurn` で表す | BS19-091 Lv1 |
| 2 | FieldEvent「ownSpiritBattleLost」：自分のスピリットがBPを比べ（相打ちでなく）破壊されたとき（タイミング） | `ownSpiritBattleWon`（fieldEvent.ts:41）は勝ち側の鏡像のみ。TriggerEvent `onBattleLose`（type.ts:122）は発生源**自身**限定で、ネクサスが他のスピリットの破壊に反応できない。`ownSpiritDestroyed` は手段を問わずBP比べに絞れない | BS19-091 Lv2 |
| 3 | FieldEvent「ownBraveOnlyDestroyed」：自分の合体スピリットのブレイヴだけが破壊されたとき（タイミング） | FieldEvent 一覧にブレイヴ破壊系のイベントがない（`anyBraveSummoned` はある）。`destroyBrave` はアクションで引き金ではない。手札に戻す側は既存の `return`（`target:"selfBrave"`）で書ける | BS19-093 Lv2 |
| 4 | coreStepBonus の行き先変更軸「リザーブに置くかわりにライフに置くことができる」＋条件 ownLifeAtMost＋任意（アクション／条件の軸） | `coreStepBonus`（effectDefContinuous.ts:242）は `amount`（+N個）しか書けず、置く場所の変更も「かわりに」の置き換えも任意選択もない | BS19-092 Lv2 |
| 5 | フィールドマジックの器：マジックをフィールドに置き効果を発揮し続ける kind（終了条件＝相手スピリットのアタックによるライフ減少。「効果が無効になったとき破棄」）（アクション） | 既存の `kind:"magic"` は解決後にトラッシュへ行く。場に留まって効果を発揮し続けるマジックの置き場所・継続・破棄を書く器がどの kind にもない。中身の制約（noDeckMill／noRefreshByAnyEffect）は既存 | BS19-110 |
| 6 | reviveOnDestroy の復活後追加アクション軸（ドロー）（アクション） | `reviveOnDestroy`（effectDefTrigger.ts:303）の定義に then／追加アクションの欄がない。「回復状態でフィールドに残り、**ドローする**」の後半が書けない。復活そのものは手本 BS02-052-e1（when byOpponentEffect・rested:false）で書ける | BS19-X05 Lv2-3 |
| 7 | treatAsUnblocked の when に「blockerMaxBp: 3000」（条件の軸） | `treatAsUnblocked`（effectAction.ts:108）の when は `blockerLevel1`／`levelAtLeastBlocker` のみで、ブロッカーのBP上限での判定がない。手本 BS09-044-e1 の「Lv1のとき」をBP3000以下に置き換えるだけの軸 | BS19-X05 Lv3 |
| 8 | 継続制約 unblockableBy に「fromMaxBpSelf」（条件の軸） | 「そのスピリットのBP以下の相手からブロックされない」。`unblockableBy`（constraintDef.ts:9）は filter（系統など）しかなくBP比較軸がない。期間つきの timedContent `unblockable` には `fromMaxBpSelf` があり、判定器は流用できると見る | BS19-055 白連鎖 |
| 9 | payAssistByExhaust のマジック使用対応（via:"magic"、cost:3）（条件の軸） | `payAssistByExhaust`（effectDefCost.ts:42）は定義コメントの通り**スピリットカードの召喚時**限定（via は shinsoku/any）。マジックカードを使用するときの肩代わりが書けない。手本 BS17-062-e1 の形をそのまま拡張するだけ | BS19-054 |

メインループ設計に任せる部分（このメモでは部品表に入れない）：【連鎖】の本体（連鎖行の表現・条件判定）、Keyword 型への「連鎖」「強化」の値追加、強化（yellow）のBP-加算。`filter.keyword`／`keywordGrant.keywordFilter`／`fieldEvent.subjectFilter` の軸は既存なので、「連鎖を持つ」絞り込みは値の追加だけで書ける。

## 3. カードごとの表（表：cardId | 節 | 使う器（手本の効果 id））

### バニラ（効果節なし）
- BS19-045 チョコロネ、BS19-047 眠りの花の妖精フィリー、BS19-050 レイ・フォーン

| cardId | 節 | 使う器（手本の効果 id） |
|---|---|---|
| BS19-046 | Lv1-3：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-002-e1） |
| BS19-048 | Lv1-2『召喚時』：上から1枚オープン、系統「想獣」のスピリットカードなら手札、他は破棄 | triggered onSummon optional ＋ sequence [revealOpen 1 → moveCards pick{cardType spirit, family 想獣}→hand → moveCards all→trash]（reveal部 BS17-022-e2／pick→手札 BS17-041-e1） |
| BS19-049 | Lv1-2-3『召喚時』：このターンの間、相手のスピリット1体をBP-2000 | bpMinus amount 2000 count 1（器は buff.ts に実装済み・既存データに手本なし。ターン終了時まで） |
| BS19-051 | Lv1-2-3『召喚時』：このターンの間、相手のスピリットすべてをLv1として扱う | triggered onSummon ＋ timedEffect [level set 1] turn all（BS17-059-e1） |
| BS19-051 | 連鎖（条件 白×1） | （メインループ設計） |
| BS19-051 | [白]：相手のスピリット1体を手札に戻す | return to hand count 1（BS10-035-e1） |
| BS19-052 | Lv1-2-3：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-002-e1） |
| BS19-052 | Lv1-2-3【強化】：自分の「BP-効果」を-1000 | 強化（yellow） |
| BS19-053 | Lv1-2-3『アタック時』：このターンの間、相手のスピリット1体をBP-2000 | bpMinus amount 2000 count 1（器のみ・手本なし） |
| BS19-053 | 【合体時】Lv2-3『合体アタック時』：黄のマジック1枚をフラッシュタイミングでコストを支払わずに使用 | triggered onAttack whileCombined ＋ magicFreeUseFromHandOrTegamoto colorFilter yellow handOnly（BS14-055-e3。手本は onBattleStart、ここは onAttack whileCombined） |
| BS19-053 | Lv3『アタック時』：コスト3のマジックを使用したとき、その効果発揮後、このスピリットは回復 | fieldEvent ownMagicUsed ＋ magicPick{cost:3} ＋ refresh self（BS17-042-e2。差分：oncePerTurn・selfIsAttacking なし、magicPick は既存軸 effectDefTrigger.ts:264） |
| BS19-054 | Lv1-2『お互いのアタックステップ』：マジック使用時、このスピリットを疲労させることでリザーブから3コストまで支払った扱い | **新部品9** payAssistByExhaust のマジック拡張（手本構造 BS17-062-e1。cost 3・phase attack） |
| BS19-055 | Lv1-3【聖命】『アタック時』：アタックでライフを減らしたときボイドからコア1個をライフに | keyword seimei ＋ triggered onLifeDealt placeCores void→life（BS14-054-e1/e2） |
| BS19-055 | Lv2-3：【連鎖】を持つ自分のスピリットすべてに【聖命】を与える（絞り込み：連鎖を持つ） | keywordGrant keyword seimei target ownAll keywordFilter 連鎖（BS14-054-e4。keywordFilter 軸は既存、値「連鎖」は本弾で追加） |
| BS19-055 | 連鎖（条件 白×1） | （メインループ設計） |
| BS19-055 | [白]：【聖命】を持つ自分のスピリットすべては、そのスピリットのBP以下の相手からブロックされない（絞り込み：聖命を持つ） | **新部品8** constraintGrant target ownAll filter{keyword seimei} ＋ unblockableBy fromMaxBpSelf（手本構造 BS14-055-e2） |
| BS19-075 | Lv1『このブレイヴの召喚時』：このターンの間、コスト3以下の相手のスピリットすべてはブロックできない | triggered onSummon ＋ timedEffect [cantBlock] turn all filter{cost 3以下}（BS11-057-e2）。合体条件コスト4以上はカードデータ braveCondition{minCost:4}（BS13-057） |
| BS19-076 | 【合体時】『合体アタック時』：マジックを使用したとき、その効果発揮後、このターンの間、相手のスピリット1体をBP-2000 | fieldEvent ownMagicUsed whileCombined ＋ bpMinus 2000（手本構造 BS17-039-e2 のアクション差し替え）。合体条件は braveCondition |
| BS19-091 | Lv1-2：相手のスピリットがターンで初めてBP0になったとき1ドロー | **新部品1** FieldEvent opponentSpiritBpReachedZero oncePerTurn ＋ draw 1 |
| BS19-091 | Lv2『自分のアタックステップ』：天霊の自分のスピリットがBPを比べ相手のスピリットだけに破壊されたとき、ボイドからコア1個をライフに | **新部品2** FieldEvent ownSpiritBattleLost（loserFamilyFilter 天霊）＋ placeCores void→life（BS10-035-e2 のアクション） |
| BS19-092 | Lv1-2：お互いのデッキは破棄されない | globalConstraint noDeckMill（BS18-002-e1） |
| BS19-092 | Lv2『自分のコアステップ』：ライフ2以下のとき、リザーブに置くかわりにライフにコア1個を置ける | **新部品4** coreStepBonus 行き先変更（条件 ownLifeAtMost 2・任意） |
| BS19-093 | Lv1-2『自分のメインステップ』：【連鎖】を持つ自分のスピリットが召喚されたとき、上から1枚オープン、ブレイヴ/マジックなら手札、他は破棄（絞り込み：連鎖を持つ） | fieldEvent ownSpiritSummoned subjectFilter{keyword 連鎖} ＋ sequence [revealOpen 1 → moveCards pick{cardType [brave, magic]}→hand → all→trash]（イベント部 BS06-087-e1／reveal部 BS17-022-e2） |
| BS19-093 | Lv2：合体スピリットのブレイヴだけが破壊されたとき、そのブレイヴを手札に戻せる | **新部品3** FieldEvent ownBraveOnlyDestroyed ＋ return 手札 |
| BS19-109 | フラッシュ：このターンの間、相手のスピリット1体をBP-3000 | bpMinus amount 3000 count 1（器のみ・手本なし） |
| BS19-110 | メイン：お互い、デッキを破棄できず、効果でスピリットを回復できない | globalConstraint noDeckMill（BS18-002-e1）＋ noRefreshByAnyEffect（BS15-072-e1） |
| BS19-110 | メイン：ライフが減るまでフィールドに置き、効果を発揮し続ける。無効になったとき破棄 | **新部品5** フィールドマジックの器（終了条件 ownLifeDamaged・無効化時破棄） |
| BS19-110 | フラッシュ：このターンの間、スピリット1体をBP+2000 | timedEffect [bp 2000] turn side both（BS10-098-e2） |
| BS19-111 | フラッシュ：バトル解決時、BPを比べずにバトルを終了させる | magic flash ＋ skipBpCompare（BS06-109-e1） |
| BS19-111 | 連鎖（条件 白×1） | （メインループ設計。マジックの連鎖は効果発揮時に条件確認＝Q780） |
| BS19-111 | [白]：相手のスピリット1体を手札に戻す | return to hand count 1（BS10-035-e1） |
| BS19-X05 | Lv1-2-3『バトル時』：このターンの間、相手のスピリット2体をBP-3000 | triggered onBattleStart（BS06-021-e1）＋ bpMinus amount 3000 count 2（器のみ・手本なし） |
| BS19-X05 | Lv2-3：相手の効果によって破壊されたとき回復状態でフィールドに残り、1ドロー | reviveOnDestroy scope self when{byOpponentEffect} revived{rested:false}（BS02-052-e1。差分：コストなし・強制）＋ **新部品6** 復活後ドロー軸 |
| BS19-X05 | Lv3『自分のアタックステップ』：天霊の自分のスピリットすべては、バトル解決時、BP3000以下のブロッカーからBPを比べずブロックされなかった扱い | effectGrant target ownAll familyFilter 天霊 ＋ treatAsUnblocked when **blockerMaxBp 3000**（**新部品7**。手本 BS09-044-e1） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）

1. **BS19-091 Lv2「BPを比べ相手のスピリットだけに破壊されたとき」**：(a) BP比べで自分だけが破壊された（相打ちは除外。TriggerEvent onBattleLose の「相打ちでは発火しない」に合わせた）、(b) 効果ではなく相手スピリットとのバトルによる破壊（相打ちも含む）。(a) で新部品2を提案したが要確認。
2. **BS19-091 Lv1「ターンで初めてBP0になったとき」**：ターン全体で1回（oncePerTurn と読んだ）か、BP0になったスピリット1体ごとに1回か。複数体が同時にBP0になったときの回数もセットで要確認。
3. **BS19-092 Lv2「リザーブに置くかわりに…ライフにコア1個を置くことができる」**：コアステップで得られるコアすべてを置き換える（通常1個なので実害なし）と読んだが、コアステップで得られるコア数が+1系（BS03-040 型）で2個以上になっている場合、1個だけ替えられるのか全部がライフに行くのか。
4. **BS19-093 Lv2**：「ブレイヴだけが破壊されたとき」は合体スピリットのブレイヴのみ（スピリット状態のブレイヴの破壊は含まない）と読む。ブレイヴ上のコアの行き先（破壊時と同じ扱いか）と、「戻すことができる」＝任意。
5. **BS19-110**：「この効果が無効になったとき破棄される」の「効果」はメイン効果（2制約）のみと読む（フラッシュ効果は使用時のみ）。また場に置いてある間、フラッシュ効果は使用できないと読む。
6. **BS19-110**：「効果でスピリットを回復できない」＝リフレッシュステップの回復は通る（noRefreshByAnyEffect の定義通り）と読む。
7. **BS19-053 Lv3「コスト3のマジックカード」**：印刷コスト3と読む（軽減後の実支払いでない）。手本 BS17-042 の「ターンに1回」の記載が本カードに無い＝回数制限なしと読む。
8. **BS19-055 白連鎖「そのスピリットのBP以下」**：ブロック宣言時点の実効BPで判定（継続制約・Q777 で条件喪失時に止まる）と読む。効果解決時点か宣言時点か。
9. **BS19-X05 Lv2-3「回復状態でフィールドに残り」**：効果文に「できる」がなく**強制**と読む（手本 BS02-052 は任意）。強制でよいか。
10. **BS19-054**：「3コストまで」は軽減後の残りコストからの肩代わり（payAssistByExhaust の定義通り）。ターンに1回の制限の記述がない＝疲労できる限り（実質1体1回/ターン）と読む。
