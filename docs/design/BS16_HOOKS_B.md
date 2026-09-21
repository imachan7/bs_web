# BS16 バッチ2 B群 差し込み先メモ（調査専用・実装しない）

対象: BS16-X04 / BS16-036 / BS16-079 / BS16-027 / P071 / BS16-080。
staging: `data/staging/BS16.json`（X04/036/079/027）、`data/staging/PROMO.json`（P071）。BS16-080 は同じ `BS16.json` のマジック。

## 1. fieldEvent `opponentHandIncreased` / action `discardOpponentBurst`（X04）

- **⚠️ 既存の `opponentHandAdded`（`server/src/type.ts:217`）が既にほぼこの意味**：`notifyHandGained`（`server/src/logic/triggers.ts:1862`）はドロー（`GameState.ts:526`）・トラッシュ回収・バウンス（`removal.ts:1842,2003,2415,2594`）・アタック時の手札戻し（`EffectModules.ts:1350,1731,3276`）から全部呼ばれ、Q3748〜Q3750の「増える手段を問わない」と一致する。**新規イベントを起こす前に「opponentHandAdded 流用＋自分の合体時＆相手のアタックステップ限定の条件を足すだけ」で足りないか確認したほうがよい**（迷う点として報告に残す）
- 新規にするなら: `FieldEvent` に `"opponentHandIncreased"` を追加（`type.ts:200`〜の並びに1行）、発火元は `notifyHandGained` と同じ呼び出し群に並べて追加
- action: `discardOpponentBurst`（`effectAction.ts` に1行追加）。ハンドラは `placeBurst` の逆（`EffectModules.ts:3234`付近）：`player.burst !== null` なら `trashCards.push(player.burst)` → `null` 化 → ログ。対象プレイヤーは `opponentOf(owner)`
- 合体時＆『相手のアタックステップ』の限定は既存の `whileCombined` / fieldEvent の `turn:"opponent"` 軸で表現可能（`effectDef.ts:438`付近のfieldEvent定義）

## 2. 【氷壁：色】色スコープ（036 対象絞り込み `sameIceWallColorAs`／079 付与 `unblockableByIceWallColor`）

- 【氷壁】の色は `kind:"keyword" keyword:"hyoheki"` **ではなく** 同じカードの `kind:"magicNegate"` エントリの `colors` に載る（`data/cards/BS08.json:2040-2069` が実例）。ヘルパーが必要：`iceWallColorsOf(board, ownerPid, inst)` で該当インスタンスの `magicNegate` エントリ（レベル条件つき・`whileCombined`考慮）の `colors` を集めて返す
- 036: 新しいフィルタ軸 `sameIceWallColorAs?: true`（`server/src/type.ts:104`付近、`sameCostAsSelf`の隣に追加）。解決は `server/src/logic/actions/filter.ts:102`の`sameCostAsSelf`ブロックと同型で、`ctx.self`（fieldEvent `anySpiritAttacked` の selfOverride＝アタックしたスピリット）から `iceWallColorsOf` を呼び、複数色ならOR。**既存 `resolved.color` は単色専用**（`shared/rules.ts:1640`）なので、OR用に新フィールド（例 `colorAny?: Color[]`）を `ResolvedTargetFilter` に足し、`matchesTarget`（`shared/rules.ts:1629`）に1行追加が要る
- 079: `kind:"constraint"` 系の一時付与（`unblockableBy`。`TargetFilter.unblockableOnly`の説明にある通り継続制約は`constraint`）。新種別 `unblockableByIceWallColor`。効果解決時にメインの「指定スピリット」の`iceWallColorsOf`を固定値として保存する必要あり（このターン中に氷壁が無効化されても保持＝Q25026〜Q25028）。ブロック可否判定箇所（`shared/rules.ts`のブロック候補判定。`unblockableBy`系constraintの既存箇所をgrep: `grep -n 'unblockableBy' shared/rules.ts`）に分岐追加
- 多色の相手は指定色を1つでも持てば該当 → `instHasColor`のOR済みロジック（`instHasColor`自体は単色判定なので、呼び出し側で`colors.some(c=>instHasColor(inst,c))`にする）

## 3. 誘発 `opponentSpiritDestroyedDuringOwnAttack` / action `exhaustOpponentSameFamilyAll`（027）

- 唯一の発火点は `removal.ts:815`（`fireFieldEventTriggers(state, opponentOf(ownerPid), "opponentSpiritDestroyed", ...)`）。`eventInfo.families`（`master.family`）は既に渡っている
- 「このスピリットのアタック時」限定は、既存の`opponentSpiritDestroyed`に軸を足すのではなく別イベント名にする指示（HANDOFF確定名）。実装は次のどちらか: (a) `removal.ts:815`のすぐ後に、`state.battle?.attackerInstanceId`を持つ側のフィールドへ向けて`opponentSpiritDestroyedDuringOwnAttack`を追加発火（`self`が現在のアタッカー自身のときだけ効果が生きるよう、`fireFieldEventTriggers`の走査ですでにinstance側フィルタが効くなら②の条件チェックだけで足りる場合もある）。(b) 新イベントを起こさず、`opponentSpiritDestroyed`のfieldEvent定義に`attackingSelfOnly?: true`のような軸を足し、判定側で`inst.instanceId === state.battle?.attackerInstanceId`を見る。**どちらにするかは実装前にユーザー確認が要る**（HANDOFFの名前は前者寄り）
- `families`をアクション側で使うための橋渡しがまだ無い：`lastBattleDestroyedFamilies`（`filter.ts:71`）と同じパターンで、新しい transient state（例 `state.lastOpponentSpiritDestroyedFamilies: string[]`）を発火直前にセットし、`exhaustOpponentSameFamilyAll`ハンドラがそこを読んで`opponentOf(owner)`のスピリットを`spiritHasFamily`でOR一致 exhaust。exhaustの実処理は`exhaustSpirit`（`EffectModules.ts`か`actions/`配下、`grep -n 'function exhaustSpirit' server/src/logic/*.ts`で1回引くこと）
- 「同時破壊は1回」の前提（PR #77適用済み）と、破壊のたびに発火する`perDestroyed`軸（`effectDef.ts:441`）の関係を要確認：027は「破壊されたとき」単発でも複数体destroyでも1回ずつ疲労処理でよいか？→ 迷う点

## 4. action `millThenCoreIfBurst { count: number }`（P071）

- 既存の`destroyIfLastMillHadBurst`（`server/src/types/effectAction.ts:153`、ハンドラ`server/src/logic/actions/destroy.ts:136`）が「直前のミルにバーストがあれば」を読む器＝`state.lastMillHadBurst`を使う。**同じ変数を再利用できる**
- 参考実装は`millPerThenSummonSelfIfBurstMilledHandler`（`server/src/logic/actions/handDeck.ts:3194-3216`）とほぼ同型: `millDeck(state, opponentOf(owner), action.count, owner, ...)` → `beforeLen`〜`actual`区間の`trashCards`を`getCard(cardId).effects.some(e=>e.kind==="burst")`で判定 → `state.lastMillHadBurst`更新 → trueなら`ctx.resolve({type:"voidCoreToSelf", count:1})`（`effectAction.ts:109`、self＝合体ホストへ配置。P071はブレイヴなので`ctx.self`がホストに揃っているか要確認）
- `action.count`は固定2（milPerのような`counter`ベースでなく単純な数値でよい）

## 5. action `destroyLifeDamager`（080）

- 材料は**BS16バッチ0で既に用意済み**（このカードのための布石）：
  - `board.battle.lifeDamagers?: string[]`（`server/src/type.ts:838`。`GameEngine.ts:1396`でアタックのたび push）
  - `state.burstEventLifeDamagerId?: string`（`server/src/type.ts:1317`。バースト発動時に`triggers.ts:1833`がセット）
- 使用時にどちらを使うか選ぶ：`chosenOption`パターンを流用（実例`server/src/logic/actions/cores.ts:677`の`if (chosenOption === "...")`分岐）。選択肢文言例:「このバトルの間」/「このバースト発動時」。両方対象なしなら不発
- 対象決定: 「このバトルの間」＝`board.battle`が無ければ対象なし、あれば`lifeDamagers.at(-1)`（複数アタッカーが混在するケースは未確認・迷う点）のインスタンスを`destroySpirit`。「このバースト発動時」＝`state.burstEventLifeDamagerId`が無ければ対象なし
- 「その後コストを支払うことで、フラッシュ効果」は既存の`thenPay:"flash"`（`tryBurstThenPay`、`EffectModules.ts`付近。`finishBurstActivation`内`server/src/logic/EffectModules.ts`の近く）の器をそのまま使える見込み。バーストのメイン効果（バウンス）が解決してからburstEventLifeDamagerIdがまだ生きているかを要確認（`triggers.ts:1833`のセット/`1834`の削除タイミング次第）

## クライアント対応

- 1・3は選択UIなし（自動解決）。2の079は既存の「スピリット1体を指定」PendingChoice（`kind:"card"`系）を流用できる見込み。5は`chosenOption`のoptions選択＝既存の`kind:"option"`PendingChoiceを流用（新規UIは不要）

## 未調査

- `spiritHasFamily`のシグネチャ・`exhaustSpirit`の正確な関数名と場所（未grep）
- `shared/rules.ts`の`unblockableBy`系constraint一覧の行番号（未grep）
- P071の`ctx.self`が合体ホストを指すか、ブレイヴ自身を指すか（BRAVE.mdの該当箇所は未読）
- `tryBurstThenPay`の正確な行番号・thenPay解決順（burstEventLifeDamagerIdの寿命との整合）
