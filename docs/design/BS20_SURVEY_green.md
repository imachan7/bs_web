# BS20 調査メモ：green（調査役）
対象：BS20-019・020・021・022・023・024・025・026・027・059・060・069・077・078・X03（BS20-074 は取り込み済みのため除外）。実装はしていない。

## 1. 集計（節の数／既存で書ける／新しい部品が要る／連鎖／強化）
- 節の数：22（バニラの BS20-019 を除く。連鎖の節は連鎖元と別カウント）
- 既存の器で書ける：18
- 新しい部品が要る：4（BS20-025 合体時・BS20-069 Lv2・BS20-078 フラッシュ・BS20-X03 Lv1）
- 連鎖を含むカード：3（BS20-021・027・078。いずれも条件《白シンボル》×1）
- 強化を含むカード：1（BS20-020。緑＝疲労効果 +1体）

## 2. 新しい部品の候補
| # | 足りない部品（種別） | 組み合わせで書けない理由 | 該当カード |
| :-- | :-- | :-- | :-- |
| 1 | AuraCounter に「対象自身のコア数」（種別：カウンタ。例 `targetCores`） | aura は `amountPer` + `counter` で可変 BP を書ける（BS01-106-e1 が `counter: "ownExhausted"` で「疲労状態の自分のスピリット1体につきBP+1000」を書いているのを確認）。しかし `server/src/types/auraCounter.ts` を見ると ownReserve・ownExhausted・ownFamily 等はあるが「対象自身の上のコア数」の軸が無い。EffectCounter の `selfCores`（effectCounter.ts:45）は aura では使えない | BS20-025【合体時】 |
| 2 | fieldEvent に「自分のスピリットの効果で相手のスピリットを疲労させたとき」（種別：タイミング。ownBofuExhausted の一般化） | `server/src/types/fieldEvent.ts` のイベント一覧を見ると、効果による疲労を拾うのは `ownBofuExhausted`（【暴風】限定）だけ。効果全般の疲労を拾うイベントが無い。action 側（ボイドからコア1個を自分のスピリットに置く＝BS11-021-e2 の placeCores）は既存 | BS20-069 Lv2 |
| 3 | effectGrant の `target` に `"chosenInstance"`（種別：アクション／付与対象の軸） | 「スピリット1体を指定する」は `targetChoiceLendThisTurn`（BS12-081-e1）で選べるが、付与側の `kind: "effectGrant"`（effectDefContinuous.ts:475）は `target: "ownAll"` 固定で、選んだ1体へ granted trigger を渡せない。`vanillaAsGrant`・`spiritEffectsDisabledGrant` は chosenInstance を持つ（BS12-081-e2/e3）が、誘発の付与には使えない | BS20-078 フラッシュ |
| 4 | exhaust 等の対象絞り込み（TargetFilter）に「イベント主体のBP以下」（種別：条件の軸。`maxBp: "subjectBp"` 相当） | 「爪鳥がアタックしたとき」は fieldEvent `anySpiritAttacked` + `subjectFilter: {family}` で書けるが、action `exhaust` の `filter`（TargetFilter）は maxBp が数値固定。effectDefTrigger.ts:4 のとおり `subjectBp` は `partnerFilter` 限定で、partnerFilter は targetInstanceId（ブロッカー等の相手役）の絞り込みであり、anySpiritAttacked には相手役がいない（BS19-011-e2 は「ブロックされたら」だから partnerFilter で書けた） | BS20-X03 Lv1 |

## 3. カードごとの表
| cardId | 節 | 使う器（手本の効果 id） |
| :-- | :-- | :-- |
| BS20-019 | （効果の記述なし） | ― |
| BS20-020 | 強化（緑） | keyword `kyoka: "exhaust"`（BS19-029-e1。効果文「自分の『相手への疲労効果』の体数を+1体する。」と同じ形） |
| BS20-021 | 【神速】 | keyword `soku`（BS19-024-e1。効果文「手札にあるこのスピリットカードは、召喚コストの支払いと上に置くコアをリザーブから使用することで召喚できる。」と同じ形） |
| BS20-021 | 連鎖（条件 白×1）：BP3000以下の相手1体を手札に戻す | triggered onSummon + `condition: {summonedBy: "soku"}` + `keyword: "rensa"` + `if ownColorSymbols white`（連鎖元＝【神速】召喚。BS19-024-e2 と同じ形。中身の return は BS19-051-e1 の `{type:"return", to:"hand", count:1}` に `filter: {maxBp: 3000}`） |
| BS20-022 | Lv1･Lv2：コスト3以下の自分すべて、相手の効果で破壊されたとき疲労状態で残れる | `reviveOnDestroy` `scope: "ownAll"` + `filter: {cost: {max: 3}}` + `when: {byOpponentEffect: true}` + `revived: {rested: true}` + `optional`（BS18-038-e1 が scope:"self" で「相手によって破壊されたとき、疲労状態で自分のフィールドに残ることができる。」と同じ形。scope:"ownAll"・filter は effectDefTrigger.ts:313-330 に既にある） |
| BS20-022 | Lv2『バトル時』：相手は相手のスピリット1体を疲労させる | triggered（バトル時）+ `exhaust` `chooserIsTarget: true`（BS06-028-e2 の action「相手は、相手のスピリット1体を疲労させる。」＝【暴風】と同じ形。バトル時の trigger 名は §4-1） |
| BS20-023 | Lv1-3『アタック時』：ボイドからコア1個をリザーブか自分のスピリットに | triggered onAttack + `placeCores` `from: "void"` `to: "spirit"` `orReserve: true`（BS12-077-e2 の action「ボイドからコア1個を、自分のリザーブか、そのスピリット上に置く。」と同じ形。対象は自分のスピリットから選ぶ） |
| BS20-024 | Lv1･Lv2『召喚時』：相手1体を疲労 | triggered onSummon + `exhaust count: 1`（action は BS01-047-e1 と同じ形） |
| BS20-025 | Lv1-3：相手がドローしたとき回復 | fieldEvent `opponentDrew` + `refresh target: "self"`（BS11-023-e1「相手がデッキからカードをドローしたとき、このスピリットは回復する。」と同じ形。BS12-053-e2 は【合体中】版） |
| BS20-025 | 【合体時】Lv2･Lv3『お互いのアタックステップ』：バトルしている自分のスピリットのコア1個につきBP+1000 | aura `bp` `target: "ownAll"` `battlingOnly: true` `amountPer: 1000` + **部品1**（BS01-106-e1 が `battlingOnly` + `amountPer` + counter の形。counter に「対象のコア数」が要る） |
| BS20-026 | Lv1･Lv2『召喚時』：疲労 または ボイドからコア1個 | triggered onSummon + `chooseActionMode`（BS10-062-e1「BP4000以下の相手のスピリット2体を破壊する。または、…1体と相手のネクサス1つを破壊する。」と同じ形。モードA＝exhaust、モードB＝placeCores void→spirit） |
| BS20-026 | Lv2『アタック/ブロック時』：バトル終了時、手札に戻ることができる | triggered `onBattleEnd` `eventTarget: "use"` + `optional` + `return to: "hand" target: "self"`（BS02-050-e1 が『このスピリットのバトル時』バトル終了時の onBattleEnd の形。return の `target: "self"` は effectAction.ts:77 にあり） |
| BS20-027 | Lv1･Lv2『アタック時』：BP3000以下のスピリットすべてを疲労 | triggered onAttack + `exhaust all: true` `filter: {maxBp: 3000}`（BS01-023-e1 が「BP3000以下のスピリットすべてを破壊する。」＝destroy all anySide の同型） |
| BS20-027 | 連鎖（条件 白×1）：相手1体を手札に戻す | 連鎖元の triggered onAttack の action を `sequence` の先頭に、`if ownColorSymbols white` で return（BS19-051-e1 の sequence＋if の形。§2.2 A） |
| BS20-059 | 【合体時】『合体アタック時』：ターンに1回、リザーブのコア3個をトラッシュに置くことで回復 | triggered onAttack `whileCombined` `oncePerTurn` + `pay`（cost＝`placeCores from: "reserve" to: "trash" count: 3`、then＝refresh self）（pay+refresh は BS19-032-e2「ターンに1回、自分のネクサス1つを疲労させることで、このスピリットは回復する。」と同じ形。placeCores の from/to に reserve/trash は effectAction.ts:84 にある） |
| BS20-060 | 【合体時】『自分のエンドステップ』：回復 | `kind: "step"` `step: "end"` `turn: "own"` `whileCombined` + refresh self（BS01-106-e2 が kind step end own + refresh の形。whileCombined は effectDefTrigger.ts:110-116 にある） |
| BS20-069 | Lv1･Lv2『相手のアタックステップ』：緑の自分はBP比べで相手だけを破壊したとき回復 | `effectGrant` `target: "ownAll"` `colorFilter: "green"` `phaseTurn: {phase: "attack", turn: "opponent"}` + `granted: {trigger: "onBattleWin", action: refresh self}`（effectDefContinuous.ts:475-486。battleWon の回復は BS01-071-e1 と同じ形） |
| BS20-069 | Lv2『自分のターン』：自分の効果で相手を疲労させたときボイドからコア1個 | fieldEvent + **部品2** + `placeCores from: "void" to: "spirit" count: 1`（action は BS11-021-e2 と同じ形） |
| BS20-077 | メイン：このターンの間、爪鳥すべてをBP+2000 | magic main `lendSelfThisTurn` + aura `bp` `target: "ownAll"` `familyFilter: ["爪鳥"]` `amount: 2000` `lentOnly`（BS06-093 の「このターンの間、アタックしている自分のスピリットすべてをBP+1000する。」と同じ貸与の形） |
| BS20-077 | フラッシュ：相手1体を疲労 | magic flash + `exhaust count: 1`（action は BS01-047-e1 と同じ形） |
| BS20-078 | フラッシュ：1体を指定し、このターンそのスピリットはBP比べで相手だけを破壊したとき回復 | magic flash `targetChoiceLendThisTurn`（BS12-081-e1 と同じ形）+ **部品3**（effectGrant chosenInstance + `granted: {trigger: "onBattleWin", action: refresh self}`） |
| BS20-078 | 連鎖（条件 白×1）：相手1体を手札に戻す | フラッシュ効果の action を `sequence` の先頭に、`if ownColorSymbols white` で return（BS19-051-e1 と同じ形。マジックの連鎖は Q780） |
| BS20-X03 | Lv1-3『自分のアタックステップ』：爪鳥がアタックしたとき、そのスピリットのBP以下の相手1体を疲労 | fieldEvent `anySpiritAttacked` `subjectSide: own` `subjectFilter: {family: "爪鳥"}` `phase: attack` `turn: own` + `exhaust count: 1` + **部品4** |
| BS20-X03 | Lv2･Lv3『自分のアタックステップ』：爪鳥1体につき緑の自分すべてをBP+1000 | aura `bp` `target: "ownAll"` `colorFilter: "green"` `amountPer: 1000` `counter: {ownFamily: "爪鳥"}`（BS01-106-e1 の amountPer+counter の形。ownFamily は auraCounter.ts:16 にある） |
| BS20-X03 | Lv3『自分のエンドステップ』：爪鳥すべてを回復 | `kind: "step"` `step: "end"` `turn: "own"` + `refresh all: true` `filter: {family: "爪鳥"}`（BS01-106-e2 の step end + refresh all の形。refresh の filter は effectAction.ts:94 にあり） |

## 4. 効果文から決められない点（読みが2通り以上あるもの）
1. **BS20-022 Lv2『このスピリットのバトル時』の発揮時点**。BS02-050（『このスピリットのバトル時』このスピリットは、バトル終了時に破壊される）は onBattleEnd で実装されているが、あちらは「バトル終了時に破壊」と文中に明記がある。BS20-022 は疲労を求める効果で、バトル終了時だとブロック判定に間に合わない。onBattleStart（バトル開始時）に発揮する読みと、BS02-050 に合わせて onBattleEnd の読みが両方立つ。処理の順の確認が必要。
2. **BS20-026 Lv2「『このスピリットのアタック/ブロック時』バトル終了時、このスピリットは手札に戻ることができる」**。誘発の起点は「アタック/ブロックしたとき」で、戻るかどうかの確認を「バトル終了時」に出す読み（trigger は onBattleEnd・確認もバトル終了時）と、アタック/ブロック宣言時に誘発して解決をバトル終了時まで遅らす読みの2通り。また「戻ることができる」の確認は合体していたブレイヴの扱い（ブレイヴも一緒に手札に戻るか）も効果文に書いていない。
3. **BS20-026 召喚時「または」の選択を出す時点**。chooseActionMode（BS10-062-e1）は解決時に選ぶ形。召喚時効果の解決時点で「疲労させる」か「コアを置く」かを選ばせる形でよいか（「または」が失敗後の代替かの読みも一応立つが、通常はモード選択）。
4. **BS20-025【合体時】「バトルしている自分のスピリットのコア1個につき、そのスピリットをBP+1000する」の「そのスピリット」**。「バトルしている自分のスピリット」＝この合体スピリット自身（合体時効果なので自分がバトルしている場面）と読むのが自然だが、対象を「バトル中の自分のスピリットすべて」と取る読みも文面上は可能。単数表記なので自身のみと読んだ。
5. **BS20-X03 Lv1「そのスピリットのBP以下」の判定時点**。アタック宣言時点の実効BP（オーラ等込み）で判定するか、疲労の解決時点で再判定するか。また「BP以下」に「同じBP」を含む（通常ルール上は含む）。
6. **BS20-069 Lv2「自分のスピリットの効果で相手のスピリットを疲労させたとき」の範囲**。【強化】で疲労体数が増えたぶんも「疲労させたとき」に含むか（含むと読むのが自然だが、効果文からは決まらない）。また、自分のマジック・ネクサスの効果は「スピリットの効果」に含まない（スピリット限定と読む）。
7. **ソードブレイヴ（BS20-X07・X08）**：いずれも purple／yellow で、green の対象外。効果文からソードブレイヴ特有のルールを読む機会は green には無かった（推測で決めない）。
