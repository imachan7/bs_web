# 実装仕様・開発メモ

このファイルは bs-web の仕様・実装状況・今後の課題をまとめる開発用ドキュメント。
仕様が固まったり実装が進むたびにここへ追記していく。
（データ構造そのものの定義は [data.md](./data.md)、公開用の紹介は [README.md](./README.md)）

⚠️ ここには `REFACTOR.md`（共有ルール層の抽出と `resolveAction` の分割）へのリンクがあったが、
**その文書は既に削除されている**（リンク切れだった。2026-07-31 に除去）。共有ルール層への一本化は
`3f02796` で完了済み（2章の冒頭を参照）、`resolveAction` も `server/src/logic/actions/` へ分割済み。

**先行設計（いずれも設計のみ・実装未着手）**: [BRAVE.md](./docs/design/BRAVE.md)（ブレイヴ。§11＝異魔神ブレイヴ）・
[ULTIMATE.md](./docs/design/ULTIMATE.md)（アルティメット）・[SOULCORE.md](./docs/design/SOULCORE.md)（ソウルコア）・
[BURST.md](./docs/design/BURST.md)（バースト）。**Wiki を出典に「確定した事実」と「未確定」を分けて記録**してあり、
実装順の依存関係は ULTIMATE ↔ SOULCORE が `minLevelCores` を共有、異魔神ブレイヴは BRAVE の
データモデル選択に影響する（詳細は各文書の §0）。

---

## 1. カードプール

`data/cards.json` に第一弾135枚＋第二弾115枚＋第三弾153枚＋第四弾118枚＋第五弾88枚の全 **609枚** を収録。

Wiki からの取り込みは `scripts/fetch_wiki_cards.py` に常設化した（弾ごとに `--set` / `--refer` / `--pages` を渡す）。
`--verify` を付けると既存 `data/cards.json` と全項目を突き合わせて差分を報告するので、
**パーサーを変更したら既存の弾で差分0を確認してから新しい弾に使うこと**
（BS04 118枚・BS03 153枚・BS05 88枚で差分0を確認済み。BS02 のみ既知の Wiki 表記ゆれ1件）。

### 第一弾（BS01・135枚）

| 色 | スピリット | ネクサス | マジック | 合計 |
| :-- | --: | --: | --: | --: |
| 赤 | 25 | 2 | 7 | 39 |
| 紫 | 20 | 2 | 7 | 30 |
| 緑 | 21 | 2 | 7 | 38 |（※ 緑は欠番込みで集計）
| 白 | 18 | 2 | 7 | 28 |
| Xレア | 4 | - | - | 4 |

- 取得元: [バトスピ Wiki リスト解析](https://batspi.com/index.php?cmd=listcard&sdan=BS01)
- 取得方法: `curl` で全ページ（`&rowid=...&pcnt1=N`）のHTMLを取得し、要約を介さず原文をパース
- 各カードが持つ情報: コスト・軽減シンボル・系統・各レベルのコア数とBP・シンボル・効果テキスト（原文）・レアリティ・禁止フラグ・構造化済み効果（`effects`）

### 第二弾：激翔（BS02・115枚）

| 色 | スピリット | ネクサス | マジック | 合計 |
| :-- | --: | --: | --: | --: |
| 黄 | 28 | 4 | 8 | 40 |
| 赤 | 13 | 2 | 4 | 19 |
| 紫 | 13 | 2 | 4 | 19 |
| 緑 | 12 | 2 | 4 | 18 |
| 白 | 13 | 2 | 4 | 19 |

（Xレア4枚 BS02-X05〜X08 は各色の内訳に含む。通常ナンバーは 001〜111 で欠番なし）

- 取得元: `https://batspi.com/index.php?cmd=listcard&sdan=BS02&refer=第二弾：激翔`（`refer` パラメータ必須、
  `rowid=59632&pcnt1=1..3` の3ページ。1ページ50枚）
- 新色 **黄** が追加（`Color` 型は当初から対応済み。デッキビルダーのフィルタ/プリセット・
  ロビーのデッキ選択・CSS の色クラスも黄対応済み。青は第三弾で登場予定のため未使用）
- 禁止カード4枚: BS02-063（冥犬ケルル・ベロス）・BS02-085・BS02-097・BS02-099
- 新キーワード: **【装甲：色】**（指定色の相手スピリット/ネクサス/マジックの効果を受けない）、
  **【呪撃】**（ブロックした相手スピリットをバトル終了時に破壊）— **実装済み**（2章のキーワード表を参照）
- 構造化の進捗: キーワード5枚＋赤・紫15枚＋緑・白11枚＋黄6枚＋エンジン小拡張バッチ8枚
  （BS02-004/018/019/061/071/075/084/106。cantAttack・recovered指定アタック・levelFilter・
  色フィルタ・系統カウンタ・refreshAllByCost・destroyOwnByCost を新設）＋キーワード付与バッチ3枚
  （BS02-089/100/X05。grantKeyword・keywordGrant・aura keywordFilter を新設）＋バッチ2の4枚
  （BS02-009/013/024/X06。anyNexusDestroyed・onBlocked・destroyExhausted anySide・
  exhaustAllByLevel・destroyAllExceptChosenColors を新設、ケンドラゴス e2 追加）＋バッチ3の7枚
  （BS02-006/016/050/058/067/102/107。bpEqualsSelf・onBattleEnd/destroySelf・lifeDamageToVoid・
  reductionGrant・refireSummonEffect を新設）＋バッチ4の11枚（BS02-027/034/043/057/072/080/081/
  097/099/101/110。recoverMagicFromTrash・trashCoresToSpirit・grantKeywordAll・aura の
  phaseTurn/minCores・fieldEvent ownMagicUsed・トリガー onLifeDealt・ターン限定全体制約
  turnConstraints/banActByCostThisTurn を新設）＋バッチ5の9枚（BS02-031/035/048/062/068/069/086/
  095/X07 と太古の断層の追加エントリ。aura costFilter・unblockableBy costNot・noRestWhenBlockingColor・
  selfCoresAtDestruction カウンタ・costMod の cardType/side/phaseTurn 拡張・immunityGrant＝マジック効果耐性・
  deployNexus・sacrificeNexusThenWipeEnemyNexusCores を新設）＋バッチ6のレベル置換3枚
  （BS02-002/073/085。CardInstance の levelAsContinuous / levelOverrideThisTurn、kind "levelAs"、
  refreshLevelAsOverrides 事後フック、levelOverrideOpponentNexuses を新設。currentLevel/levelOf が
  上書きを優先参照、rawLevel で発生源の再帰回避）＋バッチ4のデータ入れ忘れ修正1枚（BS02-081
  緑芽吹く原野＝ownMagicUsed のエンジンだけ実装されデータ未登録だった）＋バッチ7の系統付与・無料召喚
  （BS02-054 ポム・082 尖兵の familyGrant/aura familyFilter、034 トレントン・048 アースガルドの
  summonFromHandFree。spiritHasFamily で系統参照を状態対応化）＋波1（2026-07-18 再開。
  波1a: プレシオス・ラングリーズ・スクルディアe1・花の子リップ・決闘台地e2 —
  destroyAllNexusesExceptChosenColors・destructionCoresToOwnSpirit・noRefresh・
  fieldEvent ownSpiritBlocked/condition・levelOverrideTarget・refreshOne all を新設。
  波1b: オベロe1・デストロードe2・ミカファールe1・スレイプホース — AuraCounter ownNameIncludes・
  lastBattleDestroyedCores・deckReveal countPer/pickAllOfType・kind magicBuffBonus を新設。
  副産物として aura の phaseTurn が target:"self" で無視されるバグを修正）＋波2の pendingChoice 基盤
  （コキュートスを構造化。2章の「効果解決中のプレイヤー選択」を参照）＋波3a（エンジェルボイス＝
  BattleState.compareByLevel の Lv比較バトル、ケン＝kind effectGrant の誘発効果付与、クラン＝
  instHasCost の「コストとしても扱う」（2026-07-31 に kind "alsoCostGrant" の継続効果へ移行）、魔導書e2＝kind drawDouble の効果ドロー倍化）の
  計95枚＋波3b（チャガマル・紫水晶の森・鏡の回廊e1＝kind reviveOnDestroy による破壊への割り込み復活
  （destroySpirit に破壊文脈を伝播、「できる」は常時発動の簡略化）、アディショナルカラー・クルーク＝
  pendingChoice の kind:"option"（ボタン選択UI）と tempColors・instHasColor。クルークの系統付与は
  2026-07-31 に継続効果へ移行し、tempFamilies は廃止）の
  計100枚＋最終波（クロスシザース＝coresLinkedTo/coresOverride のコア数リンク choice、夢魔の寝所＝
  exhaustOnManualCoreAdd（手動コア増加の検知）と constraintGrant（制約の付与。activeConstraints が
  フィールド発生源からの付与も合成）、ケルル・ベロス e1＝既存 constraint のみ）で
  **効果文を持つ全103枚の構造化が完了（2026-07-18）**。
- 未対応として残る効果は2つのみ: ケルル・ベロス e2（強奪。禁止カードのため優先度なし）と
  紫水晶の森 Lv2（ステップ終了時ドロー。ステップ終了フック不在）
  ※ 2026-07-24 追記: 手元ゾーン実装により マジックブック main（手札マジック→手元＋ドロー）と
  ミカファール Lv2（手元/手札マジック無償使用）も構造化完了（2章「手元ゾーン」参照）
  ※「このスピリットの〜時に勝ったとき」系は battleWon（持ち主の全スピリット勝利で発火）ではなく
  `triggered onBattle + battleRole`（自身の勝利のみ）で構造化すること（BS02-036/041 で修正済みの罠）
- BS02-X06 の効果文はリストページで「Lv2」と「スピリットすべてを疲労させる。」が
  `<br>` で分断されていたが、個別ページで「Lv2スピリットすべてを疲労させる。」（レベル2の全スピリット疲労）が
  正であることを確認し修正済み
- 軽減シンボルは「コスト(軽減数)」表記から自色×個数で再構成（BS02 は全カード単色）

### 第三弾：覇闘（BS03・153枚）

| 色 | スピリット | ネクサス | マジック | 合計 |
| :-- | --: | --: | --: | --: |
| 青 | 32 | 5 | 9 | 46 |
| 黄 | 23 | 3 | 7 | 33 |
| 赤 | 12 | 2 | 4 | 18 |
| 紫 | 12 | 2 | 4 | 18 |
| 緑 | 13 | 2 | 4 | 19 |
| 白 | 13 | 2 | 4 | 19 |

- 取得元: `cmd=listcard&sdan=BS03&refer=第三弾：覇闘`（4ページ・BS02 と同じパーサーを流用。
  複数レアリティ表記「C,R」対応を追加）。通常001〜141＋Xレア X09〜X12、欠番なし
- 新色 **青** 追加（UI・デッキビルダー・CSS 対応済み）。禁止カード: BS03-030 の1枚
- 新キーワード **実装済み**: **【粉砕】**（`funsai`。アタック時、相手のデッキを上からこのスピリットの
  Lvと同じ枚数トラッシュへ。millDeck。デッキ0でも敗北はドロー不能時のみ）・
  **【光芒】**（`kobo`。バトル終了時、自分がこのバトルで使用したマジックカードをトラッシュから手札へ回収。
  BattleState.usedMagicCardIds で追跡、全バトル終了経路で解決）。
  キーワード保持カードは粉砕3枚・光芒4枚（他は参照のみ）。激突は今弾も未収録
- 構造化の進捗: キーワード7枚＋赤・紫バッチ21枚（全文10・部分11。スキップ9枚の未対応概念は
  課題リストに集約: コア数フィルタ破壊・バニラ参照・手札公開・動的Lv/BP比較・シンボル付与など）の
  計28枚＋緑・白バッチ13枚（全文8・部分5。スキップ19枚の主因: 各種Perアクションのカウンタが
  固定的・付与系kindにcolorFilterが無い・バニラ参照など）＋エンジン拡張バッチ8枚
  （EffectCounter 統一＝Per系アクションのカウンタを12種に一般化、keywordGrant/effectGrant の colorFilter、
  exhaust の levelFilter。BS03-030/031/032/036/046/048/128/X10）＋黄バッチ14枚（全文5・部分9。
  スキップ12枚の主因: 色/名前の継続付与・トリガーの色条件ゲート・マジック無償化・疲労免疫など）の
  計62枚＋青バッチ13枚（全文6・部分7。スキップ22枚の最多要因は「相手のデッキを◯枚破棄」の
  汎用ミルアクション不在＝8枚前後。ほか手札加入検知・任意コスト誘発・効果無効など）の
  計73枚＋仕上げ拡張バッチ（mill/millPer・EffectCounter ownColor・bpBuffAll familyFilter・
  deployNexus all を新設、BS03-073/087/097/100/144/145/148/X12）の計78枚＋条件ゲートバッチ10枚
  （2026-07-21 再開。triggered condition に ownFieldHasColorSpirit/ownFieldHasColorNexus/
  targetSameLevelAsSelf、magic condition ownFamilyCountAtLeast、AuraCondition ownHasKeyword、
  新アクション destroyAllNexusesWithCores・voidCoreToAllOwnByFamily・voidCoreToTarget・
  refreshByFamilyAuto を新設。BS03-004/007/008/035/056/057/065/126/129/149。
  refreshByFamilyAuto は「系統1つを指定」を疲労中スピリットの最多系統の自動指定で簡略化）の
  計88枚＋粉砕連動バッチ4枚（BS03-086/090/115/117。粉砕解決を resolveFunsai に共通化し、
  fieldEvent "ownFunsaiMilled"（repeatPerCount で「置かれるたび」対応）・kind "funsaiBonus"＝
  破棄枚数修正・kind "funsaiOnBlock"＝ブロック時にも粉砕発揮・levelAs 拡張
  （target ownSpiritsByKeyword／treatAs "max"／phase・turn／condition anyFieldHasColorSpirit）を新設。
  millDeck が実破棄枚数を返すようになった）の計92枚＋バニラ参照バッチ6枚
  （BS03-102/104/106/108/111/114 の各色ネクサス群。isVanillaCard＝効果原文が空のカード判定を新設し、
  aura vanillaFilter・reviveOnDestroy の when byBattle/byBattleKillerLevel と revived toHand・
  fieldEvent vanillaOnly/byBattleOnly・battleWon の role "any"/turn/vanillaWinnerOnly/selfMode "source"・
  refreshOne vanillaFilter・levelAs ownSpiritsVanilla/coresScaled・
  globalConstraint ownNexusIndestructible（バニラ数条件付き）を追加。
  DestroyContext.battle に attackerLevel を伝播。運命分かつ岐路 e2 の「自分か相手のスピリット1体を疲労」は
  相手側のみに簡略化）の計98枚＋任意コスト支払いバッチ5枚（BS03-033/088/092/107/124。
  新アクション selfBuffByHandDiscard・grantKeywordToHandCard・coreTradeToOpponentTrash、
  reviveOnDestroy の keywordFilter・cost.reserveOneToTrash・phaseTurn turn:"both" を新設。
  PlayerState.tempHandKeywordGrants で手札カードへの一時キーワード付与を管理し、
  RuleValidator の神速召喚判定とクライアントの手札フラッシュ使用可能ハイライトの双方に反映
  （副次効果として、既存の神速持ちカードもクライアントから手札フラッシュ召喚が操作可能になった＝
  従来はサーバーのみ許可でクライアントUIが未実装だった潜在バグの修正）。
  果て無き地平線 e1（Lv1スピリットがLv2BPを参照するBP参照元の置換）は未対応のためスキップ）の
  計103枚＋マジック制約バッチ5枚（2026-07-24。BS03-069/075/079/113/116。
  kind "magicRestriction"＝oncePerTurnAll（フォクシン）／noReductionOpponent（イワトビペンタン）／
  colorLockOpponent（力奪う凱旋門 e1）を新設し validateCastMagic / effectiveCost に反映
  （noReduction はクライアントのコスト表示にもミラー）。fieldEvent "opponentHandAdded"
  （notifyHandGained をドロー・トラッシュ回収・バウンス・deckReveal 等の手札追加11箇所に配線、
  repeatPerCount で枚数連動）と familyFilter（英雄の喪失 e2＝勇傑）を追加。
  GameState.magicUsedThisTurn を新設。凱旋門 e2（コスト無償化の打ち消し）は概念未実装のためスキップ。
  マードックの「フィールド/リザーブから」はフィールドのみに簡略化）の
  計108枚＋条件付き誘発バッチ6枚（BS03-021/027/040/050/082/101。
  lastBattleDestroyedLevel＝破壊ブロッカーLvの記録と exhaustAllByLevel の動的Lv対応、
  FieldEvent "ownNexusDestroyed"、fieldEvent condition "selfIsAttacking"、
  reductionGrant keywordFilter、refreshOne familyFilter、kind "coreStepBonus"
  （カード名そろい条件つきコアステップ増加）、voidCoreToOwnNexuses を新設）の
  計114枚＋色・シンボル・レベル操作バッチ4枚（BS03-053/058/121/141。
  CardInstance.colorsAsContinuous（kind "colorAs"、フラットフェイス。レベル表記は完全一致で有効。
  ティングリーは 2026-07-31 に colorAs target:"ownAll" の継続効果へ移行）・
  tempExtraSymbols（ダブルハート。ライフダメージとコスト軽減シンボル集計に反映）、
  アクション addSymbolThisTurn・levelUpThisTurn（ビルドアップ。
  最大Lvキャップ）を新設。ダブルハート/ビルドアップの「自分か相手のスピリット1体」は
  自分側のみに簡略化）の計118枚＋新概念バッチ4a の5枚（BS03-047/095/112/131/139。
  kind "exhaustImmunityGrant"＝相手効果の疲労免疫（トランプの王国。exhaust系3経路にガード）・
  kind "lifeDamageNegate"＝非ブロックアタッカーBPが発生源以下ならライフ減少無効（フレイア）、
  アクション discardOpponentDownTo（オリバー。捨てる側選択の discardOpponent に委譲）・
  bpBuffByExhaustOwn（ユナイテッドパワー。2段choice）・exhaustOpponentToMatch（セイムタイアード）を
  新設）の計123枚＋最終バッチ4b の4枚＋凱旋門e2（BS03-064/085/109/138 と BS03-113 e2。
  kind "magicFreeGrant"＝色指定マジック無償化（バロッサ）と magicRestriction "noFreeCastOpponent"＝
  無償化打ち消し（凱旋門 e2。これで凱旋門は完全構造化）、levelAs の sourceLevels 完全一致・
  target "opponentNexusesAll"（ウッド・ゴレム＝相手ネクサスをLv1扱いにして「Lv2効果は発揮されない」を
  表現。レベル表示も1になる簡略化）、FieldEvent "ownSpiritCoresRemovedByOpponent"（極光の大地 e1。
  コア除去6アクションに actorPid 伝播）・coreStepBonus condition ownFieldHasFamily（同 e2）、
  アクション swapBattler（テレポートチェンジ＝バトル参加スピリットを疲労状態の自分のスピリットと
  入れ替え）を新設）の計 **127枚** / 効果文持ち128枚。
- **BS03 の構造化はこれで完了（2026-07-24）**。同日中に公開ゾーン「手元」を実装し、
  最後まで表示のみだったエクリア（BS03-016）も構造化済み（2章「手元ゾーン」参照）。
  部分構造化で残るのは果て無き地平線 e1（Lv1スピリットのLv2BP参照）のみ

### 第四弾：龍帝（BS04・118枚）

| 色 | スピリット | ネクサス | マジック | 合計 |
| :-- | --: | --: | --: | --: |
| 青 | 19 | 3 | 6 | 28 |
| 赤 | 12 | 2 | 4 | 18 |
| 紫 | 12 | 2 | 4 | 18 |
| 緑 | 12 | 2 | 4 | 18 |
| 白 | 12 | 2 | 4 | 18 |
| 黄 | 12 | 2 | 4 | 18 |

（Xレア4枚 BS04-X13〜X16 は各色の内訳に含む。通常ナンバーは 001〜114 で欠番なし。全カード単色）

- 取得元: `cmd=listcard&sdan=BS04&refer=第四弾：龍帝`（3ページ・BS02/BS03 と同じパーサーを流用。
  タイプ行の「(禁止カード)」「(制限カード<1>)」表記への対応を追加）。**cards.json へ追加済み（2026-07-24）**
- 禁止カード4枚: BS04-088（栄光の表彰台）・BS04-089（グレートリンク）・BS04-096（インフェルノアイズ）・
  BS04-105（トリックプランク）。**制限カード1枚**: BS04-082（侵されざる聖域、1枚制限）—
  カードデータに `limitCount: 1` を新設（デッキ検証への反映は今後）
- 新キーワード **【転召：コストN以上/トラッシュorボイド】**: 召喚コスト支払い後、自分のコストN以上の
  スピリット1体の上のコアすべてを指定先に置かなければならない。保持8枚＝六帝サイクル
  （BS04-010/020/031/044/055/073、コスト5以上/トラッシュ）＋ Xレア2枚（X13/X15、コスト6以上/ボイド）
- **ダブルシンボル初登場**: シンボル2つ持ち8枚（転召持ちと同一）。`symbol` 配列は2要素
  （ライフダメージ・シンボル集計のエンジン対応は要確認）
- 装甲の複数色表記が初登場: BS04-034（装甲：赤/緑）・BS04-082（装甲：紫/緑/白/黄/青、付与型）
- 既存キーワード保持: 神速4・粉砕3・覚醒4・呪撃3・光芒3・装甲3。激突は今弾も未収録
- 効果文なしのバニラ21枚（効果文持ち97枚）
- 構造化の進捗: 転召8枚（基盤エンジンバッチ。上記）＋キーワードバッチ11枚
  （soku/awaken/jugeki/armor/funsai/kobo の keyword エントリ＋セブンスポット coreBonus・
  シャドウジャグラー破壊時ドロー）＋赤・紫バッチ（全文3枚: カメレウィップ・ゾン・サウル・アゼル、
  部分9枚: ドラグノ近衛兵・バ・ゴゥ・ダンピール・ケツァルカトル・魔影街・ドラゴンズラッシュ・
  ヴェノムショット・X13・X14。データのみ・既存アクションの範囲）
- 緑・白バッチ（全文4: ファル・コンドル・槍蟲ルカニドス・オッドセイ・ジャングルロウ、
  部分3: スカラベール・ワルキューレ・ヒルド・フルアッド）＋副産物として **onBlock トリガーの欠陥修正**
  （fireTrigger が targetInstanceId＝アタッカーを渡しておらず targetSameLevelAsSelf 等の対象条件が
  発火しなかった。修正のうえフェンリルキャノンMk-II e2 を構造化）＋黄・青バッチ
  （全文7: BS04-051/067/068/071/074/111/113、部分9: 050/053/065/084/087/105/106/108/109）で
  **全色一巡完了（2026-07-24）**
- 赤・紫バッチのスキップ（新概念が必要。エンジン拡張バッチの設計候補）:
  自陣キーワード有無の triggered 条件（001）・コストフィルタ付き破壊/疲労破壊（011/017/021）・
  手札任意破棄→枚数連動（022/094）・ネクサス無条件全破壊（011）・手札枚数条件 step（018）・
  系統OR配列の aura/bpBuffAll（076）・reductionGrant 系統フィルタ（077）・ドロー枚数修正（079）・
  一時トリガー付与・トリガー付け替え（007/008/090/092/093）・シンボル数条件/制限マジック（091/096）・
  相手コア単体ボイド送り（095）・両陣営色除外全体破壊（X13）・敗北時疲労/双方手札5枚破棄（X14）
- 緑・白・黄・青バッチのスキップ（主な分類）: 系統OR配列の familyFilter（029/052/097/103）・
  シンボル数条件/対象制限（091/096/104/107/114/X16）・光芒の一時付与が解決側未対応（106）・
  levelAs の対象/条件拡張（058/069/087/107/114）・コスト閾値の keywordGrant とデッキ破棄上限（082）・
  神速テキスト書換（033/080）・個別コスト付き複数無償召喚（057）・マジック対象リダイレクト（054）・
  破壊ネクサス復活（061）・デッキ破棄代替支払い（088）・unblockable無効化（110）ほか
- **エンジン拡張バッチ1（2026-07-24）**: familyFilter の OR 配列（bpBuff/bpBuffAll、共通ヘルパー
  matchesFamilyFilter）・シンボル数条件（magic condition ownFieldHasMinSymbolSpirit・対象フィルタ minSymbols・
  instanceSymbolCount 共通化）・光芒の一時/継続付与対応（resolveKoboOnBattleEnd が tempKeywords も参照。
  レベル判定は保持）で8枚を構造化（029/091/097 全文、096/104/106/107/114 部分）
- **エンジン拡張バッチ2（2026-07-24）**: 破壊/疲労の costFilter（destroy/destroyExhausted/exhaust。
  matchesCostFilter）・手札任意破棄連動（coreRemovePerHandDiscard）・coreRemove の dest:"void"・
  destroyAll の anySide/colorExclude・destroyNexus の all・refreshOne の excludeSelf・
  coreToTrashAllByCost・opponentTrashCores カウンタで7枚を全文構造化（011/017/021/022/094/095/X13）
- **エンジン拡張バッチ3（2026-07-25）**: triggered 条件 ownFieldHasKeyword・汎用 exhaustAll（BP範囲・side）・
  returnAllToHand（コスト条件・side）・refreshByFamily（OR配列・count）・trashCoresToKeywordSpirit で
  5枚を全文構造化（001/089/099/102/103）
- **エンジン拡張バッチ4（2026-07-25）**: levelAs 条件 ownFieldHasFamily・新アクション levelMaxAllOwnThisTurn・
  millPer の multiplier/cap・EffectCounter ownColorSymbols で3枚を全文構造化（058/069/X16）
- **クライアント連動バッチ（2026-07-25）**: `reductionGrant` に familyFilter（OR配列。対象は手札カードの
  静的系統）と条件 `ownColorSpiritsAtLeast`（ネクサスを数えない色別スピリット数）を追加、
  `AuraDef.familyFilter` を FamilyFilter（OR配列）へ拡張。**tsconfig が public/src も型検査対象のため、
  renderer.ts のクライアントミラー（reductionGrantSymbols / auraAppliesTo）も同一コミットで追随させた**
  （`matchesFamilyFilterView` を新設）。049 全文・076/077 部分を構造化
- **召喚時誘発バッチ（2026-07-25）**: FieldEvent `"ownSpiritSummoned"`（doSummon の召喚時効果・転召の解決後に
  発火。転召でコアが尽きて消滅した場合は発火しない）と、destroy / returnToHand の `maxBpFromSelf` を新設。
  **selfOverride で self に「召喚されたスピリット」を渡す**設計により「召喚されたスピリットのBP以下」を表現できる
  （既存の anySpiritAttacked と同じ方式。発生源の色ではなく召喚スピリットの色が装甲判定に使われる簡略化あり）。
  fieldEvent の familyFilter を OR 配列対応、recoverSpiritFromTrash に familyFilter を追加し、
  **BS04-077 七龍帝の玉座・BS04-083 鋼葉の樹林を全文構造化**。
  この効果は**召喚レベル指定（1章のルール参照）と組み合わせて初めて意味を持つ**
  （Lv1召喚ならBP3000以下、Lv2召喚ならBP5000以下が対象になる）。
- **トリガー無効化バッチ（2026-07-25）**: kind `"triggerSuppression"`（フィールド発生源からの継続抑止。
  発生源の持ち主から見た相手のスピリットの指定トリガーを発揮させない）と、アクション
  `suppressTriggerThisTurn`（`GameState.triggerSuppressionThisTurn`。ターン終了でリセット）を新設し、
  `fireTrigger` 冒頭で `isTriggerSuppressed` を判定。BS04-093 ユーサネイジア（全文）・
  BS04-086 古代闘技場 Lv2（部分）を構造化
- **ドロー枚数修正バッチ（2026-07-25）**: step 誘発の condition に `ownFamilyCountAtLeast`（OR配列）・
  `ownNameIncludesCountAtLeast` を追加。「ドローの枚数を+1枚」は既存の百識の谷と同じ
  **「ドローステップに追加で1枚引く step 誘発」**で表現する。BS04-052 郵便ペンタン（全文）・
  BS04-079 王蛇の住処のドロー行（部分）を構造化
- **強制ブロックバッチ（2026-07-25）**: `GameState.attacksThisTurn`（doAttack で加算・ターン終了でリセット）を
  新設し、kind `"mustBlockGrant"`（familyFilter / firstAttackOnly / phase / turn）を `validateTakeLife` で判定。
  **「可能ならば」の解釈として `validateBlock` を通る実ブロッカーがいるときのみ強制する**
  （cantBlock・unblockableBy で実際にブロックできない場合に詰まないようにするため。既存の【激突】判定は
  従来の hasBlocker のまま据え置き）。triggered condition `firstAttackOfTurn` も追加。
  BS04-076 翼持つ者の空域・**BS01-098 燃えさかる戦場**（BS01最後の未対応行）・BS04-024 ダックルを全文構造化。
- **個別設計バッチA（2026-07-25）**: step condition `ownHandAtLeast`（018）／`voidCoreToOwnNexuses` の
  single（059）／globalConstraint `maxSpiritsOnField`（080 Lv1。メインステップの通常召喚のみ制限し
  神速召喚は対象外という簡略化）／`GameState.ignoreUnblockableThisTurn` とアクション（110）／
  `levelOverrideTarget` の colorFilter・requireLevelExists（112）で5枚を構造化
- **個別設計バッチB（2026-07-25）**: FieldEvent `"opponentDeckMilled"`（millDeck から発火。`minEventCount` で
  「一度に◯枚以上」）・`"opponentMagicUsed"`（resolveMagic から発火。`magicCostEquals`／`magicTiming` で絞る）を
  新設し、costMod と fieldEvent に条件 `ownFamilyCountAtLeast`、アクション `opponentCoresToTrash`・
  `negateLifeDamageFromTarget`（CardInstance.lifeDamageNegatedFor）を追加。
  027 アリゲイド・045 氷の女神フリッグ・085 魔力満ちる泉・101 ミストカーテンを全文構造化
- **個別設計バッチC（2026-07-25）**: アクション `voidCoreToOwnByKeyword`（033 の召喚時行）・
  `reviveLastDestroyedNexus` と `GameState.lastDestroyedNexus`（061。破壊されたネクサスの記録は
  lastBattleDestroyedCores と同じ「直近の出来事を state に残す」パターン）・reviveOnDestroy の `minBp`（081 Lv1）で
  3枚を構造化。**BS04 構造化は effects付き 91/97枚に到達。残る未着手6枚は下記**
- **未着手で残る6枚（表示のみ。既存関数のシグネチャ変更が広範に及ぶか、単発概念のため見送り）**:
  - **082 侵されざる聖域**: コスト8以上へ【装甲：5色】を継続付与。`hasArmorAgainst(inst, color)` が state を
    受け取らない設計のため、keywordGrant 由来の装甲を見るには全呼び出し箇所の signature 変更が必要
  - **090 ニーベルングリング**: ターン限定の誘発付与＋「破壊したスピリットと同じ系統」の伝播（新機構2つ）
  - **037 鎧装獣ヘイズ・ルーン / 042 獣使いドヴェルグ**: 条件付き cantAttack と、その名前フィルタでの無効化（対）
  - **054 アルカナソルジャー・サンク**: マジックの効果範囲を自身1体に絞る。
    **⚠️ かつてここに「現エンジンのマジックは単体対象のため実質 no-op」と書いていたのは誤り**（2026-07-30 訂正）。
    複数体に及ぶマジックは実際に7枚ある（フレイムテンペスト BS01-122／バインディングウッズ BS01-140／
    セイムタイアード BS03-139／グラウンドハウリング BS04-099／ジャングルロウ BS04-100／
    ドリームハンド BS04-102／ブランチロック BS05-074）。
    **原作ルールでは「全体を含む効果」も『対象に含む』**（2026-07-30 利用者に確認）ため、
    全体効果を自身1体に限定できる＝実装価値がある。設計は chatbox.md の同日エントリを参照
  - **088 栄光の表彰台**: ネクサス配置コストのデッキ破棄による代替支払い（禁止カード）
  - 各カードの一部の行のみ未対応: 033 Lv2-3・080 Lv2（【神速】テキストの書き換え）・081 Lv2・086 Lv1
    （「BPを+する」効果そのものの無効化）・079 Lv2

### 第五弾：皇騎（BS05・88枚）

| 色 | スピリット | ネクサス | マジック | 合計 |
| :-- | --: | --: | --: | --: |
| 黄 | 10 | 2 | 3 | 15 |
| 青 | 10 | 2 | 3 | 15 |
| 赤 | 9 | 2 | 3 | 14 |
| 紫 | 9 | 2 | 3 | 14 |
| 緑 | 9 | 2 | 3 | 14 |
| 白 | 9 | 2 | 3 | 14 |
| 多色 | 2 | - | - | 2 |

（Xレア4枚 BS05-X17〜X20 は各色の内訳に含む。通常ナンバーは 001〜084 で欠番なし）

- 取得元: `cmd=listcard&sdan=BS05&refer=第五弾：皇騎`（2ページ）。**`scripts/fetch_wiki_cards.py` でパース**し、
  投入後に `--verify` で Wiki と突き合わせて差分0を確認済み
- **禁止カード・制限カードはゼロ**。効果文なしのバニラ18枚（効果文持ち70枚）
- **新キーワードなし**。保持は11枚（転召4＝Xレア全部がコスト6以上/ボイド、覚醒1・呪撃1・神速1・
  装甲2・光芒1・粉砕1）。**BS05-032 珊瑚蟹シオマネキッドは【装甲：赤/白】の複数色指定**
- **多色カードが初登場**（下記）

#### 多色カード（BS05-X19 / BS05-X20）

| cardId | 名前 | 色 | コスト | 軽減シンボル | シンボル |
| :-- | :-- | :-- | --: | :-- | :-- |
| BS05-X19 | 聖皇ジークフリーデン | 赤・白 | 9 | 赤3＋白3（**混色**） | 赤白 |
| BS05-X20 | 大甲帝デスタウロス | 紫・緑 | 9 | 紫3＋緑3（**混色**） | 紫緑 |

これに合わせて `CardData.color: Color` を **`colors: Color[]` へ置換**した（2026-07-25。設計は削除前の
`docs/archive/MULTICOLOR.md` に記録）。要点:

- **色の一致判定は必ず述語を通す**。場のインスタンスは `instHasColor(inst, color)`、
  手札・デッキ側のカードは `cardHasColor(cardData, color)`、色の一覧が要るときは `instColors(inst)`。
  **`card.colors[0] === c` のような直接比較を新しく書かないこと**（多色で静かに壊れる）
- 判定はすべて **OR**（多色カードは両方の色を完全に持つ）。ただし次の3つは OR にしてはいけない:
  - **軽減シンボル集計**（`countSymbols`）— 赤/白スピリットは「赤1個・白1個」を別々に供給する
  - **ライフダメージ**（`instanceSymbolCount`）— シンボル数そのもの。色は無関係
  - **デッキビルダーの単色プリセット**（`buildPreset`）— `colors.length === 1` で多色を除外する
- **装甲は発生源の色を配列で運ぶ**: `hasArmorAgainst(inst, sourceColors: Color[])`。
  `resolveAction` の `sourceColors`・`ActionCtx.srcColors`・`DestroyContext.battle.attackerColors`・
  `fireFieldEventTriggers` の `eventColors` がすべて `Color[]`。多色の発生源はいずれの色の装甲でも防がれる
- 「最多色の自動選択」（ケンドラゴス等）では**多色カードは各色に1票**を入れる
- クライアントは表示のみ主色 `colors[0]` を使い、デッキビルダーの色フィルタは OR、
  色内訳は「赤・白」の複合ラベルで1件計上する（両方に数えると合計が40を超えるため）
- 回帰テストは `scripts/smoke/part58.ts`（色の両方ヒット・装甲・軽減・ライフダメージ・単色プリセット・
  BS05 のキーワード保持）

### デッキ

`data/constants.ts` の `DECK_RECIPES` に赤・紫・緑・白・黄・青の単色40枚を定義。
各色とも スピリット9種×3（27枚）＋ネクサス2種（3+1=4枚）＋マジック3種×3（9枚）の構成。
低コスト帯のスピリット中心で、禁止カード（ストームドロー BS01-132）は除外。
黄は BS02 の低コスト帯から機械生成（コスト順選出、禁止カード除外）。
全エントリは cards.json の実 cardId・名前・色と機械検証済み
（※ 過去に cards.json を Wiki 実データで再構築した際に cardId が全面的にズレたため、
cardId をハードコードする箇所は必ず cards.json と突き合わせて検証すること）。

---

## 2. 実装済みのルール・効果

> **⚠️ 以下の「クライアントミラー」の記述は当時の経緯です。** `3f02796` の共有ルール層への一本化で
> **ミラー実装は全廃**され、現在 `public/src/` はルール判定を自前で持っていません
> （`shared/rules.ts` / `shared/cost.ts` / `shared/block.ts` から import して再エクスポートするだけ）。
> **新しい判定を足すときに「サーバーとクライアントの両方を直す」必要はありません**。`shared/` だけです。
> 逆に、ルール判定を `renderer.ts` に自前実装すると表示バグの温床になります（実際に3件出ました）。


### ルール

- ステップ進行: スタート / コア / ドロー / リフレッシュ / メイン / アタック / エンド
- 先攻1ターン目は**コアステップなし**（コア追加なし。リザーブ初期4個のまま）・**ドローステップはあり**
  （公式ルール準拠。2026-07-24 修正: 従来は「コアあり・ドローなし」と逆に実装されていた。
  smoke のテストヘルパー runTurnStart は既存テストの期待値を保つため通常ターン相当＋初回ドロー打ち消しで動作）
- 先攻1ターン目はアタック不可（`validateAttack` で拒否。mustAttack もターン1では
  ターン終了を妨げない。クライアントのアタック可能ハイライトにも同条件をミラー）
- コスト軽減（フィールドの一致シンボル数だけ軽減、軽減シンボル数が上限）
- 維持コア（Lv1コア）、コア移動とレベル変動、維持コア割れでの消滅
- **召喚・配置時のレベル指定**（2026-07-25）: `summon` / `setNexus` の `level?` で、そのレベルに必要な
  コア数をリザーブから置いて場に出せる（省略時は従来どおり Lv1）。`coresForLevel` で必要数を求め、
  カードに存在しないレベル・コア不足は `RuleValidator` が拒否する。召喚時効果はコア配置後に発火するため、
  Lv2 以上で召喚すればそのレベルの効果・BPが適用される（七龍帝の玉座 Lv2「召喚されたスピリットのBP以下」
  のような**召喚レベル依存の効果の前提**。従来は Lv1 固定でしか場に出せなかった）。
  神速召喚（フラッシュ中）でも指定可能。`level` は任意パラメータのため既存クライアント呼び出しは無変更で動作し、
  レベル選択UIは Gemini 側で実装（chatbox.md 参照）
- バトル（BP比較・相打ち）、ライフダメージ（ライフのコアはリザーブへ）
- バトル中フラッシュの交互優先権: アタック後は防御側から優先権を持ち、
  フラッシュマジック／神速召喚／覚醒を使うと優先権が相手へ移る（flashCount リセット、
  共通ヘルパー `passFlashPriority`）。`pass` アクションで優先権を譲り、両者連続パスでフラッシュ終了。
  ブロック／ライフ受けは「防御側が優先権保持中」または「フラッシュ終了後」のみ可能
- ブロック宣言後の追加フラッシュ: ブロックしてもバトルは即解決せず、フラッシュが再オープン
  （優先権は防御側から）。両者連続パスで `resolveBattle` が実行される。
  BP比較は `tempBpBuff` を加味した実効BP（`currentLevel` が加算済み）。
  ブロック済みでの再ブロック／ライフ受けは拒否される
- 覚醒のクライアントUI: フラッシュ中（優先権あり）の覚醒持ちスピリットに「覚醒可能」バッジを表示。
  バッジクリック → 移動元スピリットのクリックでコア1個ずつ移動（バッジ方式なのは、
  スピリット本体クリックが既にブロック送信に割り当てられているため）
- デッキ切れ（ドロー不能）で敗北
- 相手の手札・デッキ内容はサーバー側でマスクして配信
- 効果テキストのツールチップ: カード（手札・フィールド共通）にカーソルを合わせると、
  カード名＋効果全文をカードの上（画面上端にかかる場合は下）に表示。スマホは長押し500msで表示し、
  長押し後のタップがアタック等の操作として誤発火しないよう直後のクリックを抑止
  （`renderer.ts` の `setupEffectTooltip`、document への委譲で再描画に依存しない）
- コスト支払い（リザーブ＋スピリット上のコアの併用）: `summon` / `setNexus` / `castMagic` は
  任意で `paySources`（`{ instanceId, count }[]`）を受け付け、自分のスピリット上のコアを
  コストの支払いに充てられる（v1はスピリット上のコアのみ対応、ネクサス上は将来対応）。
  維持コア分は従来通り必ずリザーブから払う。`RuleValidator.validatePaySources` が
  対象の実在・重複禁止・コア数上限・過払い禁止・残額のリザーブ充足を検証し、
  `GameEngine.payCost` が支払い元スピリットのコアをトラッシュへ送った後、
  維持コア（Lv1）を下回った支払い元を消滅させる。クライアントは軽減後コストがリザーブで
  足りない場合に「支払いモード」（`UiState.paying`）を開始し、自分のスピリットをクリックする
  たびに1個ずつ割り当て、必要数に達したら自動送信する（対象選択モード・覚醒モードとは排他制御）

### キーワード効果

`server/src/logic/EffectModules.ts` の `KEYWORDS` レジストリで一元管理。
カードデータには名前だけを持たせ、挙動はエンジン側が `hasKeyword(cardId, keyword)` で解決する。

| キーワード | id | 状態 |
| :-- | :-- | :-- |
| 神速 | `soku` | 実装済み（バトル中のフラッシュタイミングで手札から召喚可能） |
| 覚醒 | `awaken` | 実装済み（サーバーAPI＋クライアントUI。優先権整合済み） |
| 激突 | `clash` | 実装済み（保持カードは未収録。part65 で一時付与により動作確認済み） |
| 装甲 | `armor` | 実装済み（BS02。keyword エントリの `colors` に対象色を持つ） |
| 呪撃 | `jugeki` | 実装済み（BS02。アタック時のみ、バトル終了時にブロッカーを破壊） |

- **装甲（【装甲：色】）**: 指定色の相手のスピリット/ネクサス/マジックの**効果**を受けない。
  効果解決に発生源の色を伝播（`resolveAction` の `sourceColor` 引数。マジックは `resolveMagic` が
  カード色を渡し、スピリット/ネクサス発生源は `self` の色から導出）。`hasArmorAgainst(inst, color)` で判定し、
  対象自動選択（pickEnemyByBp）・範囲効果（destroyAll / exhaustAllByColor）・明示ターゲット
  （coreRemove / exhaust / destroyExhausted / returnToHand / returnToDeckTop）の全経路で防ぐ。
  バトルによる破壊・BP比較は効果ではないため防がない。クライアントのマジック対象選択にもミラー
- **激突（【激突】）**: アタック時、相手はブロックできるなら必ずブロックしなければならない
  （`validateTakeLife` がライフ受けを拒否する）。**保持カードはまだ1枚も収録されていない**ため、
  `grantKeyword` による一時付与で `scripts/smoke/part65.ts` が経路を通している。
  判定は `hasLegalBlocker`（`validateBlock` を実際に通る個体がいるか）で行うこと。
  かつて `hasBlocker`（疲労とレベルしか見ない）を使っていたため、`cantBlock` 持ちしか
  場にいない場合に**ブロックもライフ受けもできない詰み**になっていた（2026-07-26 修正）。
  強制ブロック（`mustBlockGrant`）と同じ「可能ならば」の解釈に揃えてある
- **呪撃（【呪撃】）**: アタッカーが呪撃を現レベルで持ちブロックされたバトルの解決後、
  BP比較の結果に関係なく（アタッカー自身が破壊されていても）ブロッカーを破壊する
  （`resolveBattle` 末尾フック、onDestroy 誘発あり）。ブロッカーがアタッカー色への装甲を持てば防がれる

### 誘発効果（トリガー × アクション）

トリガー: `onSummon` / `onAttack` / `onDestroy` / `onBattle` / `onBlock` / `onBlocked`

- `onBlocked` は相手のブロック宣言時に**アタッカー側**で発火（self=アタッカー、対象=ブロッカー。
  `fireTrigger` の第5引数 targetInstanceId 経由で coreRemove 等がブロッカーを対象に取る。
  バット・バット／ブラッディ・シーザー）。`destroyExhausted` は `anySide: true` で両陣営の
  疲労スピリットから実効BP最大を自動選択（シーザーLv2）。
  fieldEvent は `anyNexusDestroyed`（どちらのネクサスでも破壊で発火、バウンスは対象外。アーケオルニ）にも対応

| アクション | 内容 |
| :-- | :-- |
| `draw` | 自分がデッキから引く |
| `destroy` | 相手スピリットを破壊（1体、BP最大を自動選択。maxBp 省略=BP不問、keywordFilter で「【神速】持ちのみ」等の限定可） |
| `destroyAll` | BP以下の相手スピリットを全破壊 |
| `selfBuff` | このスピリット自身をBP+（ターン終了時まで） |
| `destroyNexus` | 相手ネクサスを破壊 |
| `returnSelfToHand` | このスピリットを持ち主の手札に戻す |
| `coreRemove` | 対象スピリットのコアを持ち主のリザーブへ置く（対象指定可） |
| `bpBuff` | 対象スピリット1体をBP+（ターン終了時まで、対象指定可） |
| `exhaust` | 相手スピリットを疲労させる（対象指定可、疲労済みは no-op） |
| `destroyExhausted` | 疲労状態の相手スピリットを破壊（対象指定可、回復状態は no-op） |
| `drawPer` | カウント値ぶんドロー（counter: `exhaustedEnemies` / `opponentHand`） |
| `bpBuffPer` | 対象1体をカウント値×amountPer だけBP+（ターン終了時まで） |
| `discardHandAll` | 自分の手札をすべて破棄（トラッシュへ） |
| `bpBuffAll` | 自分のスピリットすべてをBP+（ターン終了時まで） |
| `returnToHand` | 対象スピリットを持ち主の手札に戻す（バウンス。onDestroy 不発火、対象指定可） |
| `returnToDeckTop` | 対象スピリットを持ち主のデッキの上に戻す（対象指定可） |
| `coreCharge` | 自分のリザーブから対象の自分スピリットへコアを置く（不足時は可能な分） |
| `lifeCharge` | 自分のリザーブからライフへコアを置く |
| `coreGain` | ボイドから自分のリザーブへコアを追加 |
| `discardOpponent` | 相手の手札を破棄（手札末尾からの決定的選択。本来は相手が選ぶ処理の簡略化） |
| `refreshSelf` | このスピリット自身を回復 |
| `lifeCrush` | 相手のライフのコアを相手のリザーブへ（ライフ0で勝敗決定） |
| `voidCoreToSelf` | ボイドからこのスピリット上にコアを置く |
| `voidCoreToSelfPer` | 自分の他スピリット数ぶん、ボイドからこのスピリット上にコアを置く |
| `refreshAllOwn` | 自分の疲労スピリットを全回復（回復分は `cantAttackThisTurn` でこのターンアタック不可） |
| `endBattle` | 今のバトルをただちに終了（BP比較もライフダメージもなし） |
| `exhaustAllByColor` | 相手最多色を自動選択し、その色の両者全スピリットを疲労（色選択の簡略化） |
| `lockFlash` | このバトルの間、相手はフラッシュで手札のカードを使用不可（`flashLockedPlayer`。覚醒は対象外） |
| `recoverSpiritFromTrash` | 自分のトラッシュのスピリットカードを手札へ（末尾＝新しい方から、選択の簡略化） |
| `coreSqueezeOne` | 相手BP最大のスピリット1体をコア1個残しにし超過分を持ち主リザーブへ（coreSqueezeAll の単体版） |
| `coreGainPer` | カウント値ぶんボイドから自分のリザーブへ（counter: drawPer と共通の `DrawPerCounter`。宝石の獣カーバルク） |
| `refreshAllByCost` | **両陣営**の指定コストのスピリットをすべて回復（cantAttackThisTurn は付かない。ローヤルポーション） |
| `destroyOwnByCost` | self 以外の自分スピリットからコスト ≤ maxCost かつコスト最大の1体を破壊（プレイヤー選択の決定的簡略化）。gainCoresEqualCost でそのコスト数のコアをボイドから自分リザーブへ（天使長プリンシパール） |
| `grantKeyword` | 自分のスピリット1体にこのターンの間キーワードを一時付与（`tempKeywords`、ターン終了でリセット。colors 付きで装甲も付与可。スピリットリンク＝覚醒、インビンシブルシールド＝装甲） |
| `exhaustAllByLevel` | 両陣営の指定レベルのスピリットをすべて疲労（範囲効果。デストロードLv1） |
| `destroyAllExceptChosenColors` | お互いが自フィールド最多のスピリット色を自動指定し、どちらの指定色でもないスピリットを全破壊（色選択の決定的簡略化。ケンドラゴス） |
| `destroySelf` | self を破壊（onDestroy 誘発あり。onBattleEnd と組み合わせてコリスタルの自壊） |
| `refireSummonEffect` | 対象の自分スピリット1体の onSummon 効果を再発揮（タイムリープ） |

- `destroy` は `bpEqualsSelf: true` で「self と同BPの相手のみ」に限定可（プテラトマホーク）
- 新トリガー `onBattleEnd`: バトル解決の最後（呪撃の後）に、生存しているバトル参加者それぞれで発火
- constraint `lifeDamageToVoid`: このアタッカーがライフを減らしたとき、コアはリザーブでなくボイドへ（スライミーLv3）
- kind `reductionGrant`: 自分のフィールド発生源から、手札の指定種別/色のカードに軽減シンボルを付与
  （`effectiveCost` が card.reduction に連結してから軽減計算。条件 ownColorTotalAtLeast 対応。
  ペンタン＝黄3つ以上でマジックに[黄]（Lv2は[黄][黄]）、天使バーチュ＝黄スピリットカードに[黄]。
  サーバー・クライアント両実装）
| `coreToVoidOwn` | 自分のコアをボイドへ（trashCores 優先、次に実効BP最小スピリット） |
| `bothSidesCoreToTrash` | 両者の各BP最大スピリットのコアを各持ち主のトラッシュへ |
| `discardSelfOne` | 自分の手札末尾1枚を破棄（百識の谷Lv1） |
| `coreDrainAllOthers` | self 以外の全スピリットからコア1個ずつ持ち主リザーブへ、消滅数ぶんボイドから self へ（魔界七将デスペラード） |
| `grantBlockerImmunity` | ブロック中の自分スピリットにこのターンの免疫を付与（フェザーバリア） |
| `negateOwnBlockConstraint` | 自分スピリット1体の cantBlock/cantBlockLowerBp をこのターン無効化（バーストファイア） |

構造化済みの効果は135枚中 **123枚**（スピリット79/91・ネクサス12/12・マジック32/32）。
**効果文を持つ全カードの構造化が完了**（残り12枚は効果テキストのないバニラ）。

### 山札公開（deckReveal）

`{ type: "deckReveal", count, pickType? }`。自分のデッキ上から count 枚を公開し、pickType に一致する
最初の1枚（省略時は先頭）を手札へ、残りを元の順で山札の下に戻す（公開はログで両者可視、選択は自動の簡略化）。
スワロウアイヴィー。今後の「上N枚を見て〇〇を手札」系に再利用可。

### 手元ゾーン（PlayerState.tegamoto）

公開ゾーン「手元」（2026-07-24 実装）。`PlayerState.tegamoto: string[]`（cardId 配列）で、
viewFor は公開ゾーンとして両者分をそのまま配信する（`GameView.players[pid].tegamoto`）。

- `handMagicToTegamotoDraw` — 自分の手札のマジックカードを好きなだけ手元に置き、置いた枚数ぶんドロー
  （マジックブック main。interactive 時は optional な card choice を1枚ずつ繰り返し、スキップで終了。
  テスト時は全マジック一括の決定的簡略化）
- `discardOpponentTegamotoDestroyPer` — 相手の手元すべてを相手トラッシュへ破棄し、枚数ぶん既存 `destroy`
  に委譲（エクリア。装甲/免疫・interactive 対象選択は destroy 経路を継承。
  「オープンして置かれたカードか」の由来は問わない簡略化）
- `magicFreeGrant` の `scope: "allMagicHandAndTegamoto"` — 色を問わず持ち主の手札/手元のマジックを無償化
  （ミカファール Lv2）。`castMagic` の `fromTegamoto: true` で手元のカードを使用（handIndex は手元の
  インデックス）。手元からの使用はこの scope を持つ発生源が有効なときのみ許可され、
  `noFreeCastOpponent`（凱旋門 e2）で打ち消される。使用後は通常どおり持ち主のトラッシュへ
- クライアント UI（手元パネル・fromTegamoto 送信）は Gemini 担当で実装中（chatbox.md 参照）

### マジックが「このターンの間」継続効果を貸す（turnVirtualInstances / lendSelfThisTurn）

マジックは使用後トラッシュへ行くため、従来は「このターンの間、〜する」という**継続効果**を
表現できなかった（BS05 だけで10枚前後がこれで構造化できずにいた）。
`PlayerState.turnVirtualInstances: CardInstance[]` に**このターンだけの仮想発生源**を持たせて解決する。
設計の全文は `docs/design/TURN_EFFECT_SOURCES.md`。

- **データの書き方**: マジック自身の `effects` に `kind:"magic"` の `{ type: "lendSelfThisTurn" }` と、
  貸したい継続効果を **`levels: null`** で並べる。実例は BS05-071 リアニメイト
  （`reviveOnDestroy` を貸して「【呪撃】持ちが破壊されたら疲労状態で戻る」を1ターンだけ成立させる）
- **新しい kind を作らなくてよい**のが利点。`reviveOnDestroy` / `constraint` / `aura` /
  `keywordGrant` / `mustBlockGrant` などが一斉にマジックから使えるようになる
- **スピリットの「このターンの間」効果も同じ器を使う**（2026-07-31 ルール確認：「このターンの間、
  自分のスピリットすべて〜」は**使用後に召喚したスピリットにも乗る**継続効果が正）。誘発／スタートステップ側の
  action を `lendSelfThisTurn` にし、継続エントリに **`lentOnly: true`** を付ける。
  `lentOnly` は「仮想発生源（`isVirtualSource`）からのみ有効」の意味で、実在するスピリットが同じエントリを
  持っていても恒久化しないためのゲート。`aura` / `keywordGrant` 相当・`colorAs` / `familyGrant` /
  `alsoCostGrant` が対応する。これにより発生源が破壊されてもそのターンは効果が持続する（原作どおり）
- 選択を伴う貸与（BS02-064 音鳥クルーク＝与える系統を選ぶ）は、選択結果を仮想発生源の
  `CardInstance.lentChoiceFamily` に載せ、継続エントリ側は `familyGrant.familyFromChoice: true` で読む
- 走査は `shared/rules.ts` の **`effectSources(board, pid)`** に集約する。
  「フィールドに実在する発生源＋実在しないが効果を出す発生源」を返す器で、将来ここに種類が増える

#### ⚠️ 3つの罠（いずれも「無言で壊れる」ため必ず守ること）

| 罠 | 内容 |
| :-- | :-- |
| **`levels: null` 必須** | 既存の走査はすべて `effectActiveAtLevel(effect.levels, currentLevel(source).level)` を通す。仮想発生源はコア0なのでレベル0になり、`levels` を書くと**無言で発火しない**。`scripts/validate-cards.ts` が検査する |
| **`self` は使えない** | マジックの `resolveAction` は `self = null` で呼ばれる。ハンドラで `if (!self) return` と書くと**唯一の用途で必ず no-op** になる（型検査も smoke も通ってしまう）。発生源は **`ctx.sourceCardId`** から取る |
| **走査の A/B 分類** | 「誰が継続効果を出しているか」＝A（`effectSources` を使う）。「盤面に何が存在するか」＝B（`player.field` を直接見る）。**関数単位ではなく、その走査が何を問うているかで判定する**。`countSymbols`（軽減シンボル集計）・`ownFieldSymbolColors`（色ロック）・`checkAuraCondition` の `hasOwnColor` 分岐はB。混ぜると「場に赤が1枚も無いのに赤のマジックを貸しただけで条件成立」「軽減シンボルが増える」といった別のバグになる |

現在 `effectSources` へ差し替え済みのA分類は8つ（`tryReviveOnDestroy` / `activeConstraints` /
`hasContinuousKeywordGrant` / `checkAuraCondition` / `effectiveBp` のaura走査 / `mustBlockGrant` 走査 /
`spiritHasFamily` の familyGrant 走査 / `refreshLevelAsOverrides`）。残りは段階移行の対象。

`instHasCost` / `instHasColor` のように **state を受け取らない純粋述語**が読む値は、走査ではなく
`refreshLevelAsOverrides` が `CardInstance` へ**都度全消去→再構築**する
（`colorsAsContinuous` / `alsoCostsContinuous` / `armorColorsGranted`）。全呼び出し箇所の signature を
変えずに継続効果へ対応させる定石。

### 効果の無効化・読み替え（2026-08-01 バッチ）

「効果そのものに介入する」層。既存の走査点に最小の分岐を足す方針で、4枚ぶんの器を入れた。

| 器 | 内容 | 走査点 |
| :-- | :-- | :-- |
| `kind:"bpBuffSuppression"` | 発生源の持ち主から見た**相手**の「BPを+する」効果を発揮させない（古代闘技場Lv1） | BP増加アクションは `actions/buff.ts` の**レジストリを包んで**1箇所でゲート／BP増加オーラは `effectiveBp` のオーラ走査。BPを-する効果は対象外 |
| `globalConstraint:"battlingEffectImmune"` | バトル中の両陣営スピリットは、お互いの**スピリット/マジック**の効果を受けない（茨の決戦地Lv2。ネクサスの効果は通る） | `isBattlingEffectImmune` を装甲・マジック効果耐性と**同じガード地点すべて**へ（破壊・コア除去・疲労・バウンス・候補列挙・マジック対象検証） |
| `action:"attackTriggersAsBlockThisTurn"` | 対象1体の『アタック時』効果をこのターン『ブロック時』へ移す（ブレイブチャージ） | `fireTrigger`（`CardInstance.attackTriggersAsBlockThisTurn`。アタック時には発揮されなくなる） |
| `kind:"awakenFromReserve"` | 【覚醒】のコア移動元に**自分のリザーブ**を追加する（ディノゾールLv2の効果差し替え） | `validateAwaken` / `doAwaken`。`GameAction awaken` の `fromInstanceId` に番兵 `AWAKEN_FROM_RESERVE` を渡す（判定は shared の `canAwakenFromReserve` でクライアントと共用） |

⚠️ 免疫のガードは**5ファイル18箇所に散っている**（`hasArmorAgainst` / `hasMagicImmunity` /
`isImmuneToArea` / `isUntargetableByOpponent` の組み合わせ）。新しい「効果を受けない」を足すときは
**全箇所に入れる**こと。1箇所漏らすと、その経路だけ無言ですり抜ける。
`grep -n "hasArmorAgainst\|hasMagicImmunity"` の各ヒットの前後に新しい述語が同居しているかを機械確認する。

### 起動能力（kind: "activated"）

`{ kind: "activated", timing: "flashBattle", levels, cost: { reserveToTrash }, condition?, action }`。
プレイヤーがコストを払って任意発動する能力の汎用の器。GameAction `activateAbility{instanceId, effectId}` で発動、
`validateActivateAbility`（タイミング・条件 selfInBattle・優先権・コスト）→ `doActivateAbility`（コスト支払い→
resolveAction→passFlashPriority）。個別効果は `action` に載せるだけ。クライアントは「起動」バッジUI（覚醒バッジ踏襲）。
グラン・ドルバルカン（コア1個で endBattle）。

### コア配置修飾（kind: "coreBonus"）

`{ kind: "coreBonus", levels, amount }`。このスピリットに効果でコアが置かれるとき置く数を +amount（ボイド由来）。
コアを置く各アクション（coreCharge / voidCoreToSelf / voidCoreToOther）が `placeCoresOnSpirit` 経由で参照。グラーバ。
**マジックは32枚すべて構造化完了。**
fieldEvent に `opponentDrew`（相手のドロー時に発火。シダフクロウ）を追加。

### 対象選択の絞り込み軸（TargetFilter）— 直交化完了

対象の絞り込み（BP・色・系統・コスト・レベル・キーワード・バニラ・シンボル数・コア数・疲労・self除外）は
`server/src/type.ts` の **`TargetFilter`** に一本化されている。アクションは `filter?: TargetFilter` を持つだけでよく、
新しい軸の組み合わせを表現するのにエンジン改修は要らない。

- 判定は `shared/rules.ts` の `matchesTarget(state, pid, inst, filter, selfInstanceId?)`
- self 相対のBP指定（`maxBp: "selfBp"` / `minBp` / `exactBp`）は
  `server/src/logic/actions/filter.ts` の **`normalizeFilter`** が数値へ解決する
  （self 不在なら `SELF_REQUIRED` を返し、呼び出し側は「対象がいなかった」で no-op）
- `filter` を通るアクション: `destroy` / `destroyAll` / `destroyExhausted` / `exhaust` /
  `refreshOne` / `bpBuff` / `bpBuffAll`。**新しいアクションはこの形で書く**

経緯: 従来は `destroy.maxBp` / `refreshOne.colorFilter` のように**同じ軸がアクションごとに個別フィールドとして
後付け**されていた（BS01〜BS04 で計28個）。第1段階で互換層 `legacyToSpec` を挟んで経路を新形式へ一本化し、
**第2段階（2026-07-30）で cards.json の40箇所・35枚を `filter` へ移行し、旧フィールドと互換層を削除**した。

⚠️ **cards.json は tsc の型検査対象外**なので、旧フィールドを書いても TypeScript は何も言わず、
`normalizeFilter` は `filter` しか見ないため**絞り込みが無言で消えて効果が広く当たる**。
`npm run validate:cards` が (1) 旧フィールドの残存、(2) `filter` の未知の軸（キーの打ち間違い）、
(3) そのアクションが見ない軸（`exhaustAll` は `cores` / `excludeSelf` のみ対応）の3つを検査する。

### 免疫・効果無効

- `constraint untargetableByOpponent`（ワルキューレ）: 相手の**対象を取る**効果（`pickEnemyByBp` 自動選択・
  明示ターゲット）の対象にならない。範囲効果（destroyAll 等）には無力
- CardInstance の一時フラグ `immuneToOpponentThisTurn`（フェザーバリア、ターン終了でリセット）:
  相手のカード効果を一切受けない（対象＋範囲の両方から除外）
- CardInstance の一時フラグ `blockConstraintNegatedThisTurn`（バーストファイア）:
  validateBlock で自身の cantBlock/cantBlockLowerBp を無視。免疫判定はクライアントの対象選択にもミラー

### コスト修飾（kind: "costMod"）

`{ kind: "costMod", levels, colorFilter, amount }`。フィールドの発生源から、指定色のカードの
使用コストを両プレイヤー分 amount だけ増やす（`effectiveCost` にフック、サーバー/クライアント両方）。
例: ルビーの太陽（白カードのコスト+1）。

### フィールドイベント誘発（kind: "fieldEvent"）

`{ kind: "fieldEvent", event: "ownLifeDamaged" | "ownSpiritDestroyed" | "anySpiritAttacked", phase?, turn?, levels, action }`。
自分のライフ被弾（致死時は発火しない）・自分のスピリット破壊（destroy/deplete 両方、onDestroy の後）・
アタック宣言（両陣営のフィールドから発火、self はアタックしたスピリット）に反応してフィールドから発火する。
phase / turn で『相手のアタックステップ』等の限定が可能。
例: 命の果実（被弾で draw、Lv2 は +coreGain）、侵食されゆく銀世界 Lv2、魔帝の墓標 Lv2（アタック宣言で自コアをトラッシュへ）。
アクション `refreshOne`（キーワード／色フィルタ付き1体回復。天使エンジュ＝黄限定）・`coreRemoveSelf`・`coreToTrashSelf`、
オーラの `summonedThisTurnOnly`（風吹く丘陵 Lv2「このターン召喚された自分のスピリット+1000」）も追加。
fieldEvent は `colorFilter`（ownSpiritDestroyed で破壊されたスピリットの色を限定。祝福されし大聖堂＝黄）にも対応。

### フィールド全体制約（kind: "globalConstraint"）

`{ kind: "globalConstraint", levels, constraint }`。フィールドの発生源から**両陣営の全スピリット／ネクサス**に効く。
`hasGlobalConstraint(state, type)` で判定。
- `singleCoreCantAct` — コア1個のスピリットはアタック/ブロック不可（魔帝の墓標）。validateAttack/Block と
  クライアントのハイライトに反映
- `nexusIndestructible` — すべてのネクサスは破壊されない（オーディーン Lv2-3）。destroyNexus 冒頭で遮断
  （バウンス returnNexusToHand は破壊ではないため対象外）

### キーワード付与（tempKeywords / kind: "keywordGrant"）

- **一時付与**: `grantKeyword` アクションが対象の `CardInstance.tempKeywords` に
  `{ keyword, colors? }` を push（ターン終了でリセット。PhaseManager の一時フラグ処理）
- **継続付与**: `{ kind: "keywordGrant", levels, keyword, target: "ownAll", familyFilter?, phase? }` —
  発生源が場にありレベル有効の間、持ち主の familyFilter 一致スピリットすべてに付与。
  phase 指定でそのステップ中のみ（ターンプレイヤー不問＝『お互いの〜ステップ』。暴双龍ディラノス Lv2-3）
- **状態対応の判定** `spiritHasKeyword(state, ownerPid, inst, keyword)`: 静的 ‖ 一時付与 ‖ 継続付与。
  フィールド上のスピリットを判定する箇所（覚醒API・unblockableBy keywordFilter・激突・
  destroy/refreshOne の keywordFilter・aura keywordFilter）はすべてこちらを使う。
  手札の神速判定はカード静的（hasKeyword）のまま。付与された装甲は `hasArmorAgainst` が
  tempKeywords も見るので機能する。クライアントは `spiritHasKeywordView` でミラー
  （覚醒バッジ・ブロック可否・装甲対象選択・実効BP表示）
- aura は `keywordFilter?: Keyword` に対応（「【覚醒】を持つ自分のスピリットすべて+1000」＝ディラノス Lv1-3。
  keywordGrant で付与された覚醒もカウントされる）

### 効果解決中のプレイヤー選択（pendingChoice）

`GameState.pendingChoice = { pid, kind: "target", prompt, candidates, optional, action, selfInstanceId, queue }`。
効果解決が対象選択を要するとき中断してセットし、選択待ち中は `resolveChoice` 以外のアクションを拒否する。
`{ type: "resolveChoice", instanceId? }` で再開（省略＝スキップは optional のみ）。中断時に残っていた
誘発エントリは queue（instanceId ベースで直列化可能）に積まれ、選択後に順に消化される（再中断も可）。
候補1件は選択なしで即解決、0件は不発。viewFor は相手視点の candidates をマスクする。
クライアントは candidates を `targetable` ハイライトし、クリックで送信（「選ばない」ボタンは optional 時のみ）。
共通ヘルパー `requestChoice`。選択を使う初のアクションは `coreToOpponentTrashChoice`
（魔界侯爵コキュートス: 自分のリフレッシュステップで自身が回復したとき（step condition
`selfWasRefreshedThisStep`）、相手のスピリット/ネクサスを選んでコアを相手トラッシュへ）。
**既存の自動選択アクションは変更していない**（選択式への置き換えは今後 opt-in で段階導入）。

### バトル結果誘発（battleRole / kind: "battleWon"）

- triggered の `battleRole?: "attacker" | "blocker"` — onBattle を勝利時の役割で限定
  （キングタウロス大公 Lv2-3「アタック時に相手だけ破壊→ライフクラッシュ」）
- `{ kind: "battleWon", role, levels, action }` — 持ち主のスピリットが指定役割で勝利したとき、
  フィールドのネクサス等から発火。**resolveAction の self には勝利したスピリットが渡る**
  （refreshSelf が「勝った自分のスピリットを回復」として機能する。無限蟲の蟻塚・古龍の縄張り Lv2）

### 必ずアタック（constraint: mustAttack）

`validateEndTurn` が、レベル有効な mustAttack 持ちでアタック可能（回復状態・cantAttack でない）な
スピリットがいる間はターン終了を拒否する（ウィル・オーブ・ディザスター）。

### ブロック制約（kind: "constraint"）

`{ kind: "constraint", levels, constraint: ConstraintDef }`。RuleValidator.validateBlock が参照する宣言的ルールで、
クライアントのブロック可能ハイライトにも同判定をミラー。
- `cantBlock` — このスピリットはブロックできない（テラノセイバー等）
- `cantAttack` — このスピリットはアタックできない（カイザレオン大帝Lv1。mustAttack の対象からも除外）
- `cantBlockLowerBp` — 自分より実効BPが低いアタッカーをブロックできない（リザードマン等）
- `unblockableBy`（colorFilter / keywordFilter / maxCores / levelFilter）— このスピリットのアタックは指定色／
  キーワード持ち／コア数以下／**指定レベル**のスピリットにブロックされない（ボーン・グラディエイター＝緑、
  ラビクリスタ＝赤、スピノアックス＝神速、悪魔スプラー・デースペル＝レベル基準）
- `mustAttack` — アタック可能なら必ずアタック（ウィル・オーブ等）
- `untargetableByOpponent` — 相手の対象を取る効果の対象にならない（ワルキューレ）
- `canDirectAttack`（targetFilter: rested / singleCore / recovered）— アタック時に条件を満たす相手スピリットを
  指定してアタックできる（指定アタック）。attack アクションの `targetSpiritInstanceId` で対象を渡し、
  doAttack が BattleState を `directed:true`＋blocker 事前設定＝強制バトルにする。
  クライアントは「アタッカー→対象選択 or プレイヤーへ」の分岐UI（イリュージョナ＝疲労指定、スモゥグ＝コア1個指定）

### アタックステップ終了（endAttackStep）

`{ type: "endAttackStep", onlyOpponentTurn? }` は既存の遅延フラグ `endAttackStepAfterBattle` を立て、
handleAction 事後フック `forceEndTurnIfFlagged` がバトル終了後に安全にターンを終了する
（サイレントウォールと同じ機構）。`onlyOpponentTurn:true` は相手ターン限定（妖機妃ソール onDestroy）。

`onBattle` は「BPを比べて勝った側（相手だけを破壊した側）」にのみ発火し相打ちでは発火しないため、
効果文『BPを比べ相手のスピリットだけを破壊したとき』と厳密に等価
（フェニキオス・ナージャ・ブランボアーを構造化。『アタック時』限定は `battleRole` で対応済み）。

未構造化の残り（31枚）— **※ この一覧は当時（BS01作業中）の履歴。現在は BS01〜BS03 の効果文を持つ
全カードが構造化済みで、ここに挙がったカードもすべて対応済み**:
- マジック2枚: バーストファイア（効果無効）・フェザーバリア（効果耐性）
- ネクサス3枚: 燃えさかる戦場Lv2（強制ブロック。2026-07-25 に mustBlockGrant で対応）・
  ルビーの太陽（コスト増ルール）・百識の谷（ドロー枚数修正）・
  魔帝の墓標（全体アタック/ブロック制約＋アタック時コアボイド送り）等
- スピリット: 効果耐性・破壊耐性、疲労スピリットへの指定アタック、トラッシュ回収（選択依存）、
  コア再配置（プレイヤー選択依存: 要塞龍ギガLv2・チェンジングコアmain等）、
  相手ドロー時誘発、条件付きバトル効果の一部など

`fireTrigger` は同一トリガーの複数エントリを配列順にすべて実行する（複合可。
例: ジークフリード Lv3 破壊時 = coreGain + lifeCharge で「ボイド→ライフ」を厳密等価に表現）。

### ステップ誘発（kind: "step"）

`{ kind: "step", step: Phase, turn: "own"|"opponent"|"both", levels, action }`。
PhaseManager が各ステップ処理直後に `fireStepTriggers(state, step)` を呼び、
両者のフィールド（スピリット＋ネクサス）から該当効果を実行する（勝敗決定で打ち切り）。
例: 千年雪の尖塔（自分スタートステップにネクサス/スピリットバウンス）、
侵食されゆく銀世界（相手アタックステップにトラッシュコア全回収）、
賢者の樹 Lv2（自分エンドステップに全回復）。

### 常時BP修正（kind: "aura"）

`{ kind: "aura", levels, aura: AuraDef }`。AuraDef は
対象（self / ownAll）× colorFilter × battlingOnly × 量（amount 固定 / amountPer×counter）×
condition（色・系統・リザーブ有無）の組み合わせ。
`effectiveBp(state, pid, inst)` が基礎BP（tempBpBuff込み）にオーラを加算し、
**バトル解決（resolveBattle）・効果の対象自動選択（pickEnemyByBp / destroyAll）・
クライアントのBP表示**はすべて実効BPを使う。
counter: ownReserve / ownNexuses / allNexuses / ownExhausted / {ownFamily}。
発生源のレベル判定は素の currentLevel（再帰回避）。
例: ガウシルヴィア（リザーブ数比例）、オーディーン（両者ネクサス数比例）、
主無き古城（自分の紫全体+1000）、燃えさかる戦場（バトル中の自分スピリット+1000）。

`destroy` は `maxBp` 省略（BP不問）と `keywordFilter`（指定キーワード持ちのみ）に対応
（晶輝龍ディアマット「【神速】を持つスピリット1体を破壊できる」を構造化）。

### 複合効果（1タイミング複数アクション）

`resolveMagic` は timing に一致する**すべての** magic 効果を配列順に実行する
（例: ハンドリバース main = 手札全破棄 → 相手手札数ぶんドロー）。
既存カードに同一 timing の複数エントリは無かったため、この変更で挙動が変わったカードはない。

### マジックの対象指定

`castMagic` コマンドは `targetInstanceId`（任意）を受け付ける。
`resolveMagic` → `resolveAction` へ伝播し、`coreRemove` / `bpBuff` / `exhaust` / `destroyExhausted` が対象として使用する。
対象未指定時のフォールバック: `coreRemove` は相手フィールドのBP最大スピリット、
`bpBuff` はバトル中の自分スピリット優先（いなければ自分フィールド先頭）。
クライアントは `magicTargetSide()` で対象側（自分/相手）を判定し、
手札クリック → 対象スピリットクリックの2段階UIで送信する。
`RuleValidator` は指定された対象がフィールドに実在するかを検証する。

---

## 3. 効果・キーワードの追加方法（3層設計）

[data.md](./data.md) 5章の方針に沿い、以下の手順で追加する。既存処理に影響を与えない。

1. **型を足す**: `server/src/type.ts` の `EffectAction` / `Keyword` / `TriggerEvent` に追加
2. **ハンドラを足す**: `server/src/logic/EffectModules.ts` の `resolveAction`（アクション）または `KEYWORDS` レジストリ（キーワード）に処理を追加
3. **データに書く**: `data/cards.json` の対象カードの `effects` 配列に定義を追加

キーワードは名前参照（`hasKeyword`）で判定するため、「神速を持つスピリットを参照する効果」のような
カード間の参照も使い回せる。

---

## 4. 未対応（表示のみ）の効果

**実装状況の台帳は `data/card-notes.json`**（`npm run validate:notes` で検査）。
status は `unimplemented`（未実装）/ `partial`（一部未実装）/ `simplified`（簡略化）の3種で、
**デッキビルダー `/deck.html` がこれを読んでプレイヤーに警告を表示する**（`public/src/deck.ts`）。
この章は要約であり、**個別の状況は card-notes.json を正とする**。

2026-08-01 に実態を機械照合した結果、**効果が丸ごと未実装のカードは6枚だけ**（全609枚中）:

| cardId | 名前 | 未実装の理由 |
| :-- | :-- | :-- |
| BS04-037 | 鎧装獣ヘイズ・ルーン | 「相手フィールドに赤がいない間アタックできない」＋相手アタック時の条件付き効果 |
| BS04-042 | 獣使いドヴェルグ | カード名条件で「アタックできない」効果**そのものを無効化**する（効果の無効化層） |
| BS04-054 | アルカナソルジャー・サンク | 相手マジックの**対象を絞り込む**置換（対象変更） |
| BS04-088 | 栄光の表彰台 | 禁止カード。コスト支払いをデッキ破棄で代替するルール置換 |
| BS04-090 | ニーベルングリング | カード名条件＋「相手だけ破壊したとき」の条件付きバトル効果 |
| BS05-079 | スリーカード | 「数を数えるとき3体分」。**実装しない判断済み**（DECISIONS.md 参照） |

一部未実装（`partial`）8枚・簡略化（`simplified`）18枚の内訳は card-notes.json を参照。
`simplified` の大半は「対象を選べず自動選択される」もので、`interactiveTargets` の
choice 化が進めば解消する系統。

### 台帳に載っていない未実装（2026-08-01 発見・未対処）

**マジック48枚で「メイン：」側の効果が未実装なのに、card-notes.json に注意書きがない。**
「メイン：〈固有の効果〉／フラッシュ：〈BP+N〉」という構造のマジックで、**フラッシュ側の
単純な BP バフだけが構造化され、メイン側が丸ごと落ちている**（コールオブロスト／
パーフェクトガード／ポテンシャルパワー／キラーテレスコープ 等）。
スキップ自体は §5 の方針（既存アクションで完全表現できる場合のみ構造化）どおりの意図的なものだが、
**注意書きが無いためデッキビルダーで警告が出ず、プレイヤーには完全実装に見える**。

同様の台帳漏れがスピリット／ネクサスにもある（例: BS01-100 ルビーの太陽 Lv2 の
「白のスピリットはコア増減で疲労する」）。

検出方法（`data/cards.json` を python3 でパースする）:

- **マジック**: `effect` テキストが「メイン：」と「フラッシュ：」の両方を持ち、
  かつ**本文が異なる**のに、`effects` の `kind:"magic"` の `timing` が片方しか無いもの
  → 48件検出（全件 `timing:"flash"` のみ実装。うち注意書きありは0件）
- **スピリット／ネクサス**: 効果テキストの見出し行数（`Lv1･Lv2` / `『…』`）が
  `effects` 件数を上回るもの → 133件が候補に挙がるが**誤検出が多い**
  （1エントリの `levels` が複数レベルを兼ねるため）。個別確認が必要

**残作業**: 上記48件に `partial` の注意書きを付ける（データ作業。文面は機械生成できる）。
`npm run validate:notes` は注意書きと cards.json の整合は見るが、
**「注意書きが無いこと」自体は検出できない**ため、この網羅性チェックを
`validate:notes` 側に組み込むのが望ましい。

---

## 5. 既知の簡略化・今後の課題

### 残りの未対応カード（2026-08-01 時点。data/card-notes.json が唯一の実態）

**BS01〜BS03 に「表示のみ」のカードは1枚も残っていない**（かつてここにあった「BS02 の未対応20枚」の表は
すべて解消済みのため削除した）。現在の残りは `data/card-notes.json` の状態で数えるのが正確:

| 状態 | 枚数 | 内訳 |
| :-- | --: | :-- |
| `unimplemented`（効果が発揮されない） | 6 | 残りは**カード名参照**の3枚（BS04-037/042＝「鎧装獣」の「アタックできない」を無効化する2枚1組・BS04-090＝「ジーク」＋バトル破壊の追撃）と BS04-054（マジックの対象変更）／**着手しないと決めた2枚**: BS04-088（禁止カード）・BS05-079 スリーカード（DECISIONS.md 参照） |
| `partial`（一部のレベル・節だけ未実装） | 8 | 共通テーマは**【神速】の召喚条件の書き換え**（BS04-033・BS04-080）。残りは単発（BS02-079・BS03-107・BS04-079・BS04-081・BS04-086 は解消済み・BS04-X14・BS05-060 はコア保護のすり抜けのみ） |
| `simplified`（原作と挙動が異なる簡略化） | 18 | 対戦は成立する。カード詳細に注記を表示している |

### BS02 構造化で洗い出された未対応概念（履歴。対応済みは取り消し線）

黄で追加された主な未対応概念: 系統・カード名の付与（ポムLv2・オベロ・クルーク）、
手札カードへの軽減シンボル付与（ペンタン・バーチュ・トパーズの流星）、
コスト/レベル/色の置換（クラン・リップ・アンプルール・螺旋の塔・アディショナルカラー・X08 等）、
マジック限定の効果耐性（ポークン）、相手スピリットの一時強奪（ケルル・ベロス）、
トラッシュからのマジック回収（トリックスター）、破壊からの復活（チャガマル）。

緑・白のスキップ20枚（BS02-027/028/031/033/034/035/038/042/043/048/080/081/082/083/
097/099/100/101/102/X07）も大半が下記と同系統（選択依存・一時的キーワード付与・効果無効・
条件付きバトル効果・「疲労しない」等の新概念）。

後続の弾でも再出現しそうなものから優先度をつけて対応する:

- ~~一時的キーワード付与（スピリットリンク・ディラノスLv2-3・インビンシブルシールド）と
  aura の keywordFilter（ディラノスLv1）~~ — **キーワード付与バッチで対応済み（2026-07-17）**
- ~~ネクサス破壊への誘発トリガー（アーケオルニ）／相手のブロック宣言への攻撃側誘発（バット・バット・シーザー）／
  レベル指定の全体疲労（デストロードLv1）／色指定の全体破壊（ケンドラゴス。自動色指定で簡略化）~~
  — **バッチ2で対応済み（2026-07-17）**。デストロードLv2（破壊コア数連動）とプレシオス（条件付き・ネクサス版）は未対応のまま
- ~~**条件付きレベル変更**「スピリット2体以下の間Lv3として扱う」（ジャグリーン）~~ — **対応済み**（kind "levelAs" の condition maxOwnSpirits）
- ~~レベル基準のブロック制限（スプラー・デースペル）~~ / ~~回復状態への指定アタック（オルカリア）~~ /
  ~~色フィルタ回復・fieldEvent（エンジュ・大聖堂）~~ / ~~系統カウンタ（カーバルク）~~ /
  ~~コスト指定全回復（ローヤルポーション）~~ / ~~自陣営破壊＋コスト連動コア獲得（プリンシパール）~~
  — **エンジン小拡張バッチで対応済み（2026-07-17）**
- ~~プレシオス／スライミー／シーザー／コキュートス／夢魔の寝所／紫水晶の森／サクリファイス／
  プテラトマホーク~~ — **いずれも構造化済み**（2026-08-01 に実データで確認。紫水晶の森のみ Lv2 が partial）

- フラッシュの交互優先権パス・ブロック宣言後の追加フラッシュは実装済み（バトル中のみ）。
  メインステップのフラッシュ（バトル外）は優先権制の対象外
- コスト支払いはスピリット上・**ネクサス上**のコアとの併用に対応済み（2026-07-19 対戦体験改善②。
  ネクサスは維持コア割れでも消滅せずレベルが下がるだけ。クライアントの支払いモードもネクサスクリック対応）
- ブロック後フラッシュ中に攻撃側／ブロック側が破壊された場合は、双方パス時の
  `resolveBattle` の不在ガードで安全終了する簡略実装（破壊時点での即時バトル終了は未対応）
- マジックの対象選択UIは実装済み。誘発効果の対象は **実対戦では選択式**（`GameState.interactiveTargets`。
  サーバー index.ts がゲーム開始時に true を設定し、destroy / coreRemove / exhaust / destroyExhausted /
  returnToHand / returnToDeckTop の6アクションで候補2体以上なら pendingChoice を発行。destroy の count≥2 は
  queue で連続選択）。テスト（interactiveTargets=false 既定）では従来の自動選択（破壊は相手のBP最大）を維持
- カード選択も choice 化済み（pendingChoice kind:"card"、cardZone hand/trash）: discardOpponent は
  **捨てられる側の相手**が選ぶ（原作準拠）、トラッシュ回収・無料召喚・無償ネクサス配置は使用者が選ぶ。
  手札はハイライトクリック、トラッシュはカード名ボタンで選択。ネイチャーフォースの
  「メインステップで使えない」制限も `mainForbidden` で忠実化
- メインステップのフラッシュ優先権は**実装しない**（原作にメインステップの相手応答フラッシュは存在せず、
  現行実装が原作準拠のため。2026-07-19 判断）
- マジックの構造化は「タイミングの文面が既存アクション（複合可）で完全表現できる場合のみ」。
  条件付き・色選択・未対応概念（効果無効・効果耐性・バトル終了系など）はスキップ
  （バウンス・コア操作系は `returnToHand` / `returnToDeckTop` / `coreCharge` / `lifeCharge` / `coreGain` で対応済み）
- クライアントの `magicTargetSide` はタイミング内の**最初の**効果で対象側を判定する。
  複合効果で対象付きアクションが2番目以降に来ると対象選択UIが誤判定する可能性
  （現構造化データでは該当なし）
- `cantAttackThisTurn` は「アタック不可」バッジ（左上・グレー）＋アタックハイライト除外、
  `flashLockedPlayer` はバトル文言への「フラッシュ封印中」追記＋手札の使用可能ハイライト抑止で
  クライアント表示済み（クリック自体は可能で、サーバー拒否は既存のトースト表示）
- カードデータはWiki由来。効果文の細部は実カードとの突き合わせ確認まではしていない

---

## 5.5 デッキビルダー

`/deck.html` にデッキ構築ページを実装（`public/src/deck.ts` → `dist/deck.js`、専用CSS `deck.css`）。

- カードプール面: 全135枚のグリッド表示。色・タイプ・コスト帯・名前検索の複合フィルタ。
  禁止カードは追加不可。ホバー/クリックで効果テキスト全文の詳細パネル
- デッキ面: 種別リスト（±操作）、`枚数/40` 常時表示、コストカーブ・色/タイプ内訳の統計
- 制約検証: 合計40枚ちょうど・**同名**3枚まで（cardId でなく名前で合算）・禁止カード不可
- 保存: localStorage（キー `bsweb:decks`）に保存/読込/削除、JSONダウンロード、
  JSONインポート（不正データは内容表示して中止。合計≠40のみ警告付きで許容）、4色プリセット自動生成
- **対戦ロビー統合（実装済み）**: ロビーに「デッキ構築」リンク、deck-select に localStorage の
  カスタムデッキを列挙（40枚でないものは disabled）。join は `deckCards`（`Record<cardId, 枚数>`）を
  受け付け、サーバー側 `validateDeckCards`（GameState.ts。実在ID・合計40枚・同名3枚・禁止カード不可）で
  検証してエラー時は join 拒否。`DeckSpec = string | Record<string, number>` で色キーと共存
- 既知の簡略化: ロビーのカスタムデッキ一覧はページ表示時に読み込む（ビルダーで保存直後は
  ロビーのリロードで反映。storage イベントによるライブ更新は未実装）

---

## 6. テスト

| コマンド | 内容 |
| :-- | :-- |
| `npm run typecheck` | `tsc --noEmit` による型チェック |
| `npm run smoke` | エンジン単体の動作確認（召喚時破壊・アタック時BP+・神速召喚など） |
| E2E | `PORT=3100 npx tsx server/src/index.ts` 起動後に `PORT=3100 npx tsx scripts/e2e.ts` |

| `npm run smoke:quiet` | 失敗と集計のみ表示（全 ✅ 行を出さない。委譲時はこちらを使わせる） |
| データ取り込みの検証 | `python3 scripts/fetch_wiki_cards.py --set BS04 --refer '第四弾：龍帝' --pages 3 --verify` |

| `npm run validate:cards` | cards.json の構造検査（型検査では止まらないデータ誤りの本体。costMod mode:"set" の setTo 必須、TargetFilter の旧フィールド残存・未知の軸など） |
| `npm run coverage:effects` | **実行時カバレッジ**。HEAD の使い捨て worktree に計測コードを差し込んで smoke を回し、どの効果エントリが実際に適用されたかを数える（`--all` で ★一覧を全件表示） |

smoke テストの本体は `scripts/smoke/part1〜74.ts` に分割（`scripts/smoke.ts` はランナー、
共通ヘルパー＝assert/act/テスト用 runTurnStart/summary は `scripts/smoke/helpers.ts`）。
テストを追加するときは新しい partN.ts を作って smoke.ts に import を1行足す。
現在の合格数は **2,860件**（part57＝TargetFilter 直交化。第2段階で旧形式ケース3件を撤去、part58＝多色カード対応、
part68＝カードデータ経由で未検証だった action 13種、part69/part73/part74＝
「場に出ているのに発火していない効果」48件の回帰）。

### 実行時カバレッジの読み方（2026-07-30 時点）

`coverage:effects` は3つの指標を出す。**★が最重要**で、「カードは場に出ているのに
その効果行だけ一度も適用されていない＝通っているつもりで通っていない」を指す。

| 指標 | 現在値 |
| :-- | :-- |
| ★ 場に出ているのに未適用 | **0件**（48件を part68/69/73/74 で解消） |
| (a) 一度も実行されていない action.type | 0種 |
| (b) 手で組んだ action でしか実行されていない（カードデータ経由が未検証） | 0種 |
| action を持つ効果の実行率 | 299/443（67.5%） |
| 継続効果（計測対応済み）の実行率 | 99/117（84.6%） |
| 継続効果（未計測の kind） | 121件 ※ keyword / globalConstraint / levelAs / effectGrant 等 |

**⚠️ 計測点の追随が要る**: 走査点を増やす／改名するとカバレッジが誤検出になる。実例2件——
`costMod` の `amount` → `setTo` 改名で計測スクリプトが起動時に落ちた（2026-07-30 修正）。
装甲の `keywordGrant` は `hasContinuousKeywordGrant` を通らず
`refreshLevelAsOverrides` が `armorColorsGranted` へ materialize する別経路のため、
実際に効いているのに「未適用」と出ていた（同日、materialize 地点にも計測点を追加）。

---

## 7. 変更履歴

実装の変更ログは [CHANGELOG.md](./CHANGELOG.md) に分離（SPEC の肥大を防ぐため）。
