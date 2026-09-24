# PAY_HOOKS.md（調査メモ：12種を `pay` へ移す下ごしらえ）

## 0. 確定スキーマ（2026-09-24 メインループ。**名前を変えない**。バッチ完了時にこのファイルは消して手順書へ移す）

今回（試し）の範囲は **`pay` の器＋`discardSelfChoose` の絞り込み軸** だけ。移すのは5種
（`costDiscardHandThenDraw`・`costDiscardHandThenDiscardOpponentMagic`・`costSetBurstThenDraw`・`selfBuffByHandDiscard`・`costDiscardHandKeywordThenDraw`）。
残り7種（「自分側だけ・自分を除く」の軸、`coreRemove` の `dest:"reserve"`、1個ずつ複数体）と、アクションに焼き込まれた `costXxx` 42種を 09-24 の規則に揃える作業は別バッチ。

- アクション `{ type: "pay"; cost: EffectAction; then: EffectAction }`（`server/src/types/effectAction.ts`）
- `discardSelfChoose` に `cardType?: CardType | CardType[]; keyword?: Keyword | Keyword[]`（配列はOR、cardType と keyword はAND。`costDiscardHandKeywordThenDraw` と同じ名前・意味）
- 新ファイル `server/src/logic/actions/pay.ts`：`pay` のハンドラと、**アクション type ごとの「書いてある数どおりに解決できるか」の判定表**
  （`discardSelfChoose`＝`canDiscardHand` かつ条件に合う手札が count 枚以上／`draw`＝デッキが count 枚以上／
  `discardOpponent`＝相手の手札に条件に合うカードが count 枚以上／`setBurstFromHand`＝手札にバースト持ちが1枚以上／`selfBuff`＝self がいる）。
  表に無い type を cost・then に書いたら発揮せずログを出す。`scripts/validate-cards.ts` で表に無い type を使った `pay` を落とす
- 流れ：cost と then を両方判定 → どちらか不可ならログを出して終わる（何も動かさない）→ 可なら `resolveInOrder([cost, then])`（`sequence` のハンドラ `actions/control.ts` と同じ frame の作り方）。
  判定を通したあとは数がそろっているので、`resolveInOrder` の「不完全でも進める」契約はここでは問題にならない
- テストは smoke `part356`（新規）。カードデータと旧 type には触らない（移行は別 PR）


`pay { type: "pay"; cost: EffectAction; then: EffectAction }`（09-24確定。cost/thenとも書いてある数どおりに解決できるときだけ発揮）。

## ① 12種の写像表

| 旧type | cost | then | 足りないパラメータ |
| :-- | :-- | :-- | :-- |
| sacrificeNexusThenWipeEnemyNexusCores | `destroy`{対象:自分のネクサス1つ, anySide無指定, filter無し（destroy typeはスピリット/ネクサス両対応かは要確認。無ければ `destroyNexus`{count:1, own:自分側}が必要）} | `coreRemove`{対象:相手ネクサスすべて, all:true, dest:"trash"} | destroyアクションが自分側ネクサス1つを直接対象にできるか未確認（現状ハンドラは`state.players[owner].field.nexuses`を直接操作。既存`destroy` typeの対象がスピリット主体ならネクサス版の軸が要る） |
| refreshSelfByDestroyFamily | `destroy`{対象:familyFilter一致・self以外の自分のスピリット1体, anySide不要（自分側固定）} | `refreshSelf`{}（対象=cost.destroyの実行者=self） | destroyの「自分側だけ・self除外」を表すfilter軸（現状は専用ハンドラのcandidates計算に埋め込み） |
| refreshSelfByReturnToDeckTopName | `returnToDeckTop`{対象:nameIncludes一致・self以外の自分のスピリット1体} | `refreshSelf`{} | returnToDeckTopに「自分側だけ・self除外・nameIncludes」の軸（現状専用実装） |
| refreshSelfByReturnToHandFamily | `returnToHand`{対象:familyFilter一致・self以外の自分のスピリット1体} | `refreshSelf`{} | returnToHandに「自分側だけ・self除外」の軸 |
| selfBuffByHandDiscard | `discardSelfChoose`{count:1, cardTypeFilter:discardCardType}（discardSelfChooseは種別絞り込み軸が無い＝要追加） | `selfBuff`{amount} | discardSelfChooseにcardType絞り込み軸が無い |
| costDiscardHandKeywordThenDraw | `discardSelfChoose`{count:1, cardType, keyword}（同上、キーワード絞り込み軸も無い） | `draw`{count} | discardSelfChooseにcardType/keyword絞り込み軸が無い |
| costOwnSpiritCoresToTrashThenOpponent | `coreRemove`{対象:自分のスピリット, count, dest:"trash", 選ぶ人:自分} | `coreRemove`{対象:相手のスピリット, count, dest:"trash", chooserIsTarget:true} | 既存`coreRemove`は単一スピリットのコアをまとめて除去する形。「1個ずつ・複数体にまたがって選ぶ」軸（現状専用ハンドラのphase/remaining相当）が無ければ複数体対応できない |
| costDiscardHandThenDiscardOpponentMagic | `discardSelfChoose`{count:1} | `discardOpponent`{count:1, cardTypeFilter:"magic", chooserIsSource:true} | 無し（cost/thenとも既存typeでそのまま書ける） |
| costDiscardHandThenDraw | `discardSelfChoose`{count:discardCount} | `draw`{count:drawCount} | 無し |
| costDiscardHandTypeThenCoreRemove | `discardSelfChoose`{count:1, cardTypeFilter:cardTypes}（種別絞り込み軸が要る） | `coreRemove`{対象:相手スピリットのコア, count, dest:"reserve"（相手のリザーブへ＝現状coreRemoveのdestは"void"\|"trash"のみ。"reserve"が無い）} | discardSelfChooseの種別絞り込み軸、coreRemoveのdest:"reserve"軸 |
| costOwnAllCoresThenEnemyCoresToReserve | `coreRemove`{対象:実効BP≥minBpの自分のスピリット1体のコアすべて, all:true, dest:"void"} | `coreRemove`{対象:相手スピリットのコア合計count個, dest:"reserve"} | coreRemoveのdest:"reserve"軸（上と同じ不足） |
| costSetBurstThenDraw | `setBurstFromHand`{} | `draw`{count} | 無し（最も素直にpayへ移せる） |

**まとめ**：既存の単純typeで足りるのは4種（costDiscardHandThenDiscardOpponentMagic / costDiscardHandThenDraw / costSetBurstThenDraw、および refreshSelfBy系3種はreturnToHand/returnToDeckTop/destroyへ「自分側限定・self除外」絞り込み軸さえ足せば書ける）。
**足りない部品**：
1. `discardSelfChoose` に cardType/keyword 絞り込み軸（selfBuffByHandDiscard・costDiscardHandKeywordThenDraw・costDiscardHandTypeThenCoreRemoveの3種で必要）
2. `coreRemove` に dest:"reserve"（現状 void/trash のみ。2種で必要）
3. `destroy`/`returnToHand`/`returnToDeckTop` に「自分側のみ・self除外」の絞り込み軸（TargetFilterに無ければ、専用ハンドラの`candidates`計算と同じ絞り込みをfilterへ昇格させる形。3種で必要）
4. `coreRemove`（または新軸）に「1個ずつ・複数体にまたがって選ぶ」（costOwnSpiritCoresToTrashThenOpponentのphase/remaining相当。1種のみ）

## ② 既存ステップの `cost` の現状と統合案

`pay`（EffectAction間のA→B）とは**別の仕組み**が既に2つ存在する：

- **トリガー側の`cost`**（`server/src/types/effectDef.ts` 202行・298行・611行・736行等）：`triggered.cost?: { exhaustSelf: true } | { reserveToTrash: number } | ...`。「ステップ開始時、このスピリットを疲労させることで〜」のような**発動条件としてのコスト**（既に疲労状態なら発火自体しない＝EffectDef側で完結）。`pay`が対象にするのはEffectActionの列（1枚の効果本文の中のA→B）なので、こちらのtriggered.costは**統合対象ではない**（別レイヤー）
- **アクション埋め込みの`costXxx`パラメータ**：`server/src/types/effectAction.ts`に42種類（`grep -o 'cost[A-Z][a-zA-Z]*' server/src/types/effectAction.ts | sort -u`で列挙）。例：`returnToHand.costReturnOwnSpiritKeyword`、`lifeCrush.costReserveToVoid`、`destroy.costDestroyOwnSpirit`、`refreshSelf.costReserveToVoid`等。これらは「1つのアクション型の中に、そのアクション専用のコストを焼き込む」形で、`pay`が汎用化しようとしている構造そのもの。**統合案**：新規カードは`pay`で書き、既存の42種のcostXxxパラメータは当面残す（置き換えはこのバッチの範囲外。片っ端から`pay`へ書き換えると影響カードが大量で今回のスコープを超える）

## ③ 09-02の旧規則（しきい値＝候補1体以上）の所在

`scripts/smoke/part178.ts`のコメントが一次資料。**体数のしきい値は現状「候補1体以上あれば発揮＝1体だけ処理してコストも払う」で、「2体戻すのに1体しかいない」場合の扱いは保留中**と明記されている（09-24の「数どおりに解決できるときだけ」ルールは、この保留を「不可」側で確定させるもの）。
該当する旧規則の実装は42種の`costXxx`パラメータ側に分散しており、個別のcount比較（`if (candidates.length < N)`のようなガード）を1つずつ確認しないと全量は出せない（本調査の呼び出し予算内では網羅できず、今回移行する12種の中では**該当なし**＝12種はいずれも既にcount/候補数を比較するガードを持っている。costOwnSpiritCoresToTrashThenOpponentはコアの個数, costOwnAllCoresThenEnemyCoresToReserveはminBp以上のスピリットの有無で判定）。
**相談**：42種の`costXxx`の全数を「候補1体以上」から「数どおり」へ揃えるかどうかは、今回の12種移行とは別バッチとして扱ってよいか要確認。

## ④ 中断と再開

`resolveInOrder`（`server/src/logic/GameState.ts:327`）が`sequence`の再開機構。`items`を順に`handlers.resolve`し、`state.pendingChoice`が立ったら残りを`pushResumeFrames`で`state.resumeStack`へ積んで`return`する（自前ループは禁止、コメントに明記）。

`pay`は「cost→then」の2要素だが、**cost/thenとも書いてある数どおり解決できることを先に確認してから初めて着手する**必要があるため、`resolveInOrder`をそのまま使うのは不向き（resolveInOrderは「不完全でも進める」前提＝sequenceの契約）。実装は既存12種のパターン（costDiscardHandThenDraw等）を踏襲するのが妥当：
1. 非対話 or 選択再入前：cost・thenの両方が**数どおり解決可能か**を判定関数で確認（不可ならログのみで終了、コストも払わない）
2. 対話時：`tryInteractiveCardChoice`／`tryInteractiveTargetChoice`でcostの対象を選ばせ、選び終わった呼び出し（`chosenCardIndex`/`targetInstanceId`が付く再入）でcostを実際に解決してから`ctx.resolve(then)`する（`costDiscardHandThenDrawHandler`の`tryInteractiveCardChoice`の第2引数に「次に何をresolveするaction」を渡す形がそのまま流用できる）
3. costが複数体・複数フェーズにまたがる場合（costOwnSpiritCoresToTrashThenOpponent相当）は、内部専用フィールド（`phase`/`remaining`相当）をpay自身に持たせて再入のたびに引き継ぐ

## ⑤ 解決可能判定に使える既存関数

- `matchesFamilyFilter`（destroy/exhaustRefresh系で使用）：familyFilter一致判定
- `matchesFilter` / `normalizeFilter`（`server/src/logic/actions/*.ts`各所、`SELF_REQUIRED`を返す形で「self不在で判定不能」を表す）：TargetFilter一致判定
- `canDiscardHand(state, owner)`（`drawDiscard.ts`）：満天の牧草地等の手札破棄禁止の継続効果を見る。discardSelfChoose系のcostは必ずこれを先頭で確認している
- `hasGlobalConstraint(state, "noHandGainByEffect")`：手札増加禁止（draw/returnToHand系のthen側で確認要）
- `cardNameContains(s, nameIncludes)`：refreshSelfByReturnToDeckTopName相当のname一致
- `player.hand.length < N` / `candidates.length === 0`：個別ハンドラに埋め込まれた候補数チェック（汎用の「N個以上あるか」判定関数は現状**存在しない**。pay用に新設するなら各typeごとの候補列挙ロジックを判定関数へ切り出す必要がある）

## ⑥ 旧type名の参照箇所

`public/src`・`server/src/ai`・`shared`には参照なし（クライアント/AIはaction.typeを直接分岐していない）。参照があるのは：
- `data/cards/*.json`（各カードの`effects[].action.type`。移行本体）
- `scripts/validate-cards.ts`, `scripts/check-effect-semantics.ts`（`selfBuffByHandDiscard`等をハードコードで認識。特に`check-effect-semantics.ts`の`COST_BAKED_ACTION_TYPES`セット（171-190行）に4種（selfBuffByHandDiscard/refreshSelfByDestroyFamily/refreshSelfByReturnToDeckTopName/sacrificeNexusThenWipeEnemyNexusCores）が載っている。**pay移行後はtype名が"pay"に統一されるため、hasCostEvidence関数が`action.type === "pay"`も等価表現として認識するよう修正が要る**（さもないと4種が「コスト実装なし」に誤検出される＝過検出でなく見落とし方向なので方針的には許容範囲内だが、意図的に直すなら1行追加で済む）
- `scripts/smoke/part*.ts`（part90/145/148/176/244/278/295/300/313等が`resolveAction`で直接旧type名を指定。**移行時はこれらのsmokeも書き換えが必要**）

## 相談事項

1. costRemoveのdest:"reserve"軸、discardSelfChooseのcardType/keyword軸、destroy/returnToHand/returnToDeckTopの「自分側のみ・self除外」軸——これらを**共通の新規パラメータとして正式に足す**か、それとも12種それぞれに残す専用ハンドラ（payの外側の薄いラッパー）として実装するか。前者はACTION_DECOMPOSITION.mdの原則（既存の器を太らせる）に沿うが、影響範囲（既存の他カードへの副作用確認）が増える
2. costOwnSpiritCoresToTrashThenOpponentの「1個ずつ・複数体にまたがって選ぶ」構造は、pay の cost 側に単純に収まらない可能性がある。pay の cost を「1回のEffectActionで完結する」前提のままこの型を書き切れるか、それとも従来どおり専用ハンドラを残すか判断が要る
3. 42種の`costXxx`パラメータ群のうち「09-02の候補1体以上」規則のまま残っているものを洗い出して09-24ルールへ揃える作業は、このバッチに含めるか別バッチにするか
