# BS16 器メモA（調査のみ・未実装）

対象: 021・065（【烈神速】系）／058／067／068。実装先エージェント向けの差し込み先メモ。

## 1. キーワード【烈神速】resshinsoku（BS16-X03）

- 型：`server/src/type.ts:248` の `Keyword` union に `"resshinsoku"` を追加（`"soku"`の直後）。
  `shared/rules.ts:39` の keyword ラベル表にも `resshinsoku: { id: "resshinsoku", label: "烈神速" }` を追加。
- ロジック：**新しい effectDef kind が要る**（既存の器では書けない）。
  `freeSummonFromHandOnOwnNexusDeployed`（`server/src/types/effectDef.ts:362`）と同型の「手札のこのカード自身」系だが、
  トリガーが field event ではなく「フラッシュタイミング＋条件（自分のトラッシュのコア5個以上）」という点が違う。
  走査関数は `tryHandFreeSummonOnOwnNexusDeployed`（`server/src/logic/triggers.ts:1879`）と
  `tryHandFreeSummonOnLifeDamaged`（`server/src/logic/removal.ts:993`）を参考に、
  フラッシュタイミング開始点（`state.isFlashTiming` が立つ箇所。`GameEngine.ts:545`付近）から呼ぶ新関数を作る。
- 参考の器：`sokuPaySourceGrant`（`effectDef.ts:247`）と `sokuPayableInstanceIds`（`shared/rules.ts:2845`）＝
  【神速】の特別支払いルールをどう継続効果として持たせているかの実例。
- クライアント対応：要る。手札のこのカードに「烈神速で召喚」ボタン/確認UIを出す必要がある
  （既存の `handFreeSummon` 確認ダイアログ＝`suspend(...){ kind:"option", handFreeSummon: {...} }` を流用できるか要確認）。
- テスト：`scripts/smoke/TEMPLATE.md` の型。トラッシュにコア5個を用意し（`createInstance`→トラッシュへ置く、
  もしくは直接 `s.players.p1.trashCores` 相当のフィールドを操作）、フラッシュタイミングを作る
  （相手のアタック宣言後など）。
- 迷う点（要確認）：
  1. 「トラッシュのコアすべてを自分のフィールド/リザーブに好きなように置く」＝**複数個を分配して置く**UIの前例が
     コードベースに一切ない（`好きなように置く`でgrep 0件）。「全部リザーブへ」に簡略化してよいか、
     それとも１個ずつ配置先を選ばせる新規 pendingChoice を作るべきか。
  2. コア移動を制限する相手の効果（Q22409）との相互作用＝どの既存 constraint 型で塞ぐか未調査。

## 2. 継続 kind `shinsokuPayAssist`（021 Lv?・065 Lv1）

- 型：`server/src/types/effectDef.ts` に新規 kind を追加（`sokuPaySourceGrant` の直後が自然、247行目付近）。
  `mode: "exhaustSelfAs2" | "fieldCores"` を持たせる案。021は「このスピリットを疲労させることでリザーブから
  2コストまで支払ったものとして扱う」＝exhaustSelf を条件にした特別な soku 支払い。065 Lv1 は
  `sokuPaySourceGrant` とほぼ同じ（フィールドのコアも使えるようにする）なので、**065は新kind不要で
  既存 sokuPaySourceGrant で足りる可能性が高い**（要確認：065の対象範囲が anyField/self どちらか原文で見る）。
- ロジック：021専用の「exhaustSelf を条件に2コストぶんを免除」は
  `RuleValidator.ts:222`付近（【神速】召喚の支払い制限チェック）に条件分岐を足す形になる。
  cost計算箇所は `effectiveCost`（RuleValidator内、`sed -n`で `function effectiveCost` を検索）。
- 参考の器：`exhaustSelf` コスト形（`effectDef.ts:201,590,715`。既存の「疲労させることで」パターン）。
- クライアント対応：支払いUI（コア入力・exhaust選択）に影響するため要る可能性が高い。未調査。
- 迷う点：021は「このスピリットを疲労させる」がコストなのか、それとも常時免除で疲労は別効果か、
  原文の接続詞をCONJUNCTION.mdで確認してから実装すること。

## 3. turnConstraint `noBurstSpiritSummonThisTurn`（058）

- 型：`server/src/type.ts:1386` の `TurnConstraintDef` union に
  `{ type: "noBurstSpiritSummonThisTurn"; pid?: PlayerId }`相当を追加（058は「お互い」なのでpid無しの全体版）。
- ロジック：ゲート箇所は `summonBurstCardFreeHandler`（`server/src/logic/actions/control.ts:110`）。
  現状 `card.type === "nexus"` を先に分岐しているので、その次のspirit/brave分岐の先頭で
  `state.turnConstraints.some(c => c.type === "noBurstSpiritSummonThisTurn")` を見て、
  真なら**召喚せず**バーストカードをトラッシュへ送るだけの処理に分岐する
  （「バースト発動は止めない、中の召喚だけ不発」という要件どおり）。
  `summonBurstCardFreeIfCoresAtLeast` 等の姉妹ハンドラ（同ファイル188〜271行）も同じ経路
  （最終的に `ctx.resolve({ type: "summonBurstCardFree" })` へ委譲）なので、ここ1箇所を直せば全部に効く。
- 参考の器：他の `xxxThisTurn` turnConstraint（`effectAction.ts:387-401`）の押し込み方＝
  `state.turnConstraints.push({ type: "...", pid })`。
- クライアント対応：不要見込み（バースト発動はプレイヤーの選択操作ではなく自動解決のため）。未調査で断定はしない。
- 迷う点：ブレイヴのバースト召喚（ダイレクトブレイヴ合体分岐、control.ts:120行台）も`card.type==="brave"`なので
  同じ分岐に含まれる。058の原文が「スピリットを召喚できない」で「ブレイヴは止めない」なら、
  `card.type === "spirit"` のみをゲートし `brave` は素通しする必要がある（現状の実装ではspirit/braveが
  同じ分岐にまとまっているため、ここを分ける一手間が要る）。

## 4. 継続 kind `burstSetCost { reserveToTrash: number }`（067 Lv2）

- 型：`server/src/types/effectDef.ts` に新規 kind（`magicNegatePayByNexusGrant`＝300行付近 と近い形式。
  「発生源が場にありレベル有効の間、相手の setBurst にコストを課す」継続効果）。
  `phaseTurn`（『相手のメインステップ』＝phase:"main", turn:"opponent"）を持たせる。
- ロジック：`validateSetBurst`（`server/src/logic/RuleValidator.ts:434`）にコストチェックを足す。
  現状は手札にburst kindがあるかとターン1回制限だけを見ている。ここに
  「相手が `burstSetCost` を持つ発生源を場に出しているなら、リザーブのコア2個をトラッシュへ**移す**ことを
  要求する」処理を追加。実際の消費（コアをトラッシュへ移す副作用）は `doSetBurst`（validateSetBurstの
  呼び出し元、GameEngineのアクション実処理）側に置く。GameActionの `setBurst` に
  支払い方法パラメータが要るか（自動でリザーブから引くだけなら不要）は原文次第。
- クライアント対応：**要確認**。「セット可否表示」（バーストのセットボタンの活性判定）は
  `shared/rules.ts` の canSetBurst 相当の関数（`validateSetBurst`をクライアントも見ているか、
  クライアント専用の簡易チェックがあるか）を grep `canSetBurst\|setBurstAvailable` で特定してから合わせる。
  未調査＝サブエージェントは着手時に `grep -rn 'burst' public/*.ts shared/rules.ts | grep -i can` を打つこと。
- 迷う点：リザーブが2個未満のとき「セットできない（設置不可）」なのか「セット自体は失敗して手札に残る」のか、
  ルール文言だけでは判断できないので実装前にユーザー確認が要る。

## 5. 068 Lv2：`symbolFix` をネクサスに流用

- **調査結果：既存の `symbolFix`（`effectDef.ts:1115`）はカード種別を見ない**。
  `target: "self"` のとき `symbolFixTargets = [source]`（`EffectModules.ts:2667`）で、
  `source` がネクサス自身でもそのまま入る。`countSymbols`（`shared/rules.ts:619`）も
  `[...player.field.spirits, ...player.field.nexuses]` を対象にしており、ネクサスの
  `symbolsForSummonReduction` を型ゲートなしに読む。つまり**そのまま流用できる**。
- 使い方：068 Lv2の効果は `kind:"symbolFix", target:"self", color:"white", count:3,
  summonReductionOnly:true, phaseTurn:{phase:"main", turn:"own"}`（BS11-039天使ティアエルと同型）。
  新しい型もロジック追加も不要、**データだけで書ける**（`data/cards/BS16.json` の該当カードに追記）。
- 迷う点：無し。原文が「スピリット/ブレイヴカードを召喚するとき」＝ブレイヴ召喚も対象に含める必要があるが、
  `summonReductionOnly` の軽減計算がブレイヴの召喚コストにも通っているかだけ実装前に
  `grep -n 'symbolsForSummonReduction' server/src/logic/*.ts` で確認すること（未調査）。

## 未調査

- ①のコア分配UIの実装可否（新規pendingChoice種別が要るか）
- ②065の対象範囲（anyField/selfのどちらで足りるか）と021のexhaustSelfが「コスト」か「別効果」か
- ③のクライアント側UI影響（無い見込みだが未確認）
- ④のクライアント可否表示の該当箇所（grep未実施）
- ⑤のブレイヴ召喚が `summonReductionOnly` の軽減対象に入っているか
