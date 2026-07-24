# 実装仕様・開発メモ

このファイルは bs-web の仕様・実装状況・今後の課題をまとめる開発用ドキュメント。
仕様が固まったり実装が進むたびにここへ追記していく。
（データ構造そのものの定義は [data.md](./data.md)、公開用の紹介は [README.md](./README.md)）

---

## 1. カードプール

`data/cards.json` に第一弾135枚＋第二弾115枚＋第三弾153枚の全 **403枚** を収録。

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
  tempAlsoCosts/instHasCost の「コストとしても扱う」、魔導書e2＝kind drawDouble の効果ドロー倍化）の
  計95枚＋波3b（チャガマル・紫水晶の森・鏡の回廊e1＝kind reviveOnDestroy による破壊への割り込み復活
  （destroySpirit に破壊文脈を伝播、「できる」は常時発動の簡略化）、アディショナルカラー・クルーク＝
  pendingChoice の kind:"option"（ボタン選択UI）と tempColors/tempFamilies・instHasColor）の
  計100枚＋最終波（クロスシザース＝coresLinkedTo/coresOverride のコア数リンク choice、夢魔の寝所＝
  exhaustOnManualCoreAdd（手動コア増加の検知）と constraintGrant（制約の付与。activeConstraints が
  フィールド発生源からの付与も合成）、ケルル・ベロス e1＝既存 constraint のみ）で
  **効果文を持つ全103枚の構造化が完了（2026-07-18）**。
- 未対応として残る効果は2つのみ: ケルル・ベロス e2（強奪。禁止カードのため優先度なし）と
  紫水晶の森 Lv2（ステップ終了時ドロー。ステップ終了フック不在）
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
  CardInstance.colorsAsContinuous（kind "colorAs"、フラットフェイス。レベル表記は完全一致で有効）・
  tempExtraSymbols（ダブルハート。ライフダメージとコスト軽減シンボル集計に反映）、
  アクション grantColorAll（ティングリー）・addSymbolThisTurn・levelUpThisTurn（ビルドアップ。
  最大Lvキャップ）を新設。ダブルハート/ビルドアップの「自分か相手のスピリット1体」は
  自分側のみに簡略化）の計118枚＋新概念バッチ4a の5枚（BS03-047/095/112/131/139。
  kind "exhaustImmunityGrant"＝相手効果の疲労免疫（トランプの王国。exhaust系3経路にガード）・
  kind "lifeDamageNegate"＝非ブロックアタッカーBPが発生源以下ならライフ減少無効（フレイア）、
  アクション discardOpponentDownTo（オリバー。捨てる側選択の discardOpponent に委譲）・
  bpBuffByExhaustOwn（ユナイテッドパワー。2段choice）・exhaustOpponentToMatch（セイムタイアード）を
  新設）の計 **123枚** / 効果文持ち128枚。
- **残り5枚は表示のみ（2026-07-24 時点）**:
  ウッド・ゴレム（相手ネクサスLv2効果無効）・バロッサ（マジック無償化）・
  テレポートチェンジ（バトル参加者の入れ替え）・極光の大地（相手効果によるコア移動の検知）・
  エクリア（「手元」ゾーン参照＝エンジンにゾーン自体が無く対応予定なし）。
  ほか部分構造化の残り: 果て無き地平線 e1（Lv1スピリットのLv2BP参照）・力奪う凱旋門 e2（無償化打ち消し）
  （粉砕連動・バニラ参照・任意コスト支払い・マジック制約・色シンボル操作クラスタは対応済み）

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

### ルール

- ステップ進行: スタート / コア / ドロー / リフレッシュ / メイン / アタック / エンド
- 先攻1ターン目は**コアステップなし**（コア追加なし。リザーブ初期4個のまま）・**ドローステップはあり**
  （公式ルール準拠。2026-07-24 修正: 従来は「コアあり・ドローなし」と逆に実装されていた。
  smoke のテストヘルパー runTurnStart は既存テストの期待値を保つため通常ターン相当＋初回ドロー打ち消しで動作）
- 先攻1ターン目はアタック不可（`validateAttack` で拒否。mustAttack もターン1では
  ターン終了を妨げない。クライアントのアタック可能ハイライトにも同条件をミラー）
- コスト軽減（フィールドの一致シンボル数だけ軽減、軽減シンボル数が上限）
- 維持コア（Lv1コア）、コア移動とレベル変動、維持コア割れでの消滅
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
| 激突 | `clash` | 予約（第一・二弾未収録。将来弾向け） |
| 装甲 | `armor` | 実装済み（BS02。keyword エントリの `colors` に対象色を持つ） |
| 呪撃 | `jugeki` | 実装済み（BS02。アタック時のみ、バトル終了時にブロッカーを破壊） |

- **装甲（【装甲：色】）**: 指定色の相手のスピリット/ネクサス/マジックの**効果**を受けない。
  効果解決に発生源の色を伝播（`resolveAction` の `sourceColor` 引数。マジックは `resolveMagic` が
  カード色を渡し、スピリット/ネクサス発生源は `self` の色から導出）。`hasArmorAgainst(inst, color)` で判定し、
  対象自動選択（pickEnemyByBp）・範囲効果（destroyAll / exhaustAllByColor）・明示ターゲット
  （coreRemove / exhaust / destroyExhausted / returnToHand / returnToDeckTop）の全経路で防ぐ。
  バトルによる破壊・BP比較は効果ではないため防がない。クライアントのマジック対象選択にもミラー
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

未構造化の残り（31枚）:
- マジック2枚: バーストファイア（効果無効）・フェザーバリア（効果耐性）
- ネクサス3枚: 燃えさかる戦場Lv2（強制ブロック）・ルビーの太陽（コスト増ルール）・
  百識の谷（ドロー枚数修正）・魔帝の墓標（全体アタック/ブロック制約＋アタック時コアボイド送り）等
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

第一弾には現エンジン未対応の効果が多く、これらは効果テキストを表示するだけで自動発動しない。
対応する場合はそれぞれ新しいアクション型／トリガー／状態が必要。

- コア整理（「コア1個を残す」「別のスピリットに置く」等。単純なコア除去は `coreRemove` で対応済み）
- 疲労状態のスピリットへの指定アタック（キラーテレスコープ。疲労付与自体は `exhaust` で対応済み）
- （必ずアタックは `mustAttack`、ブロック制限は `constraint`、手札破棄は `discardOpponent` で対応済み）
- 破壊耐性（オーディーンLv2-3「ネクサスは破壊されない」）、コスト増ルール（ルビーの太陽）、
  強制ブロック（燃えさかる戦場Lv2）、ドロー枚数修正（百識の谷）
  （常時BP参照は `aura`、ステップ起点のネクサス効果は `step` で対応済み）
- バトル時の条件付き効果（「相手だけ破壊したとき〜」）の多く

---

## 5. 既知の簡略化・今後の課題

### BS02 の未対応20枚（表示のみで確定。再開する場合の分類）

| 分類 | カード |
| :-- | :-- |
| 対話的な選択が本質 | コキュートス（スピリット/ネクサス択一）・クルーク（好きな系統）・アントマンLv2（好きなだけ召喚）・クロスシザース（ネクサス指定） |
| 破壊への割り込み（置換・復活） | チャガマル・紫水晶の森・鏡の回廊e1 |
| 効果無効・対象変更 | 鏡の回廊e2・封印された魔導書 |
| バトル解決の置換 | エンジェルボイス（Lv比較バトル） |
| 単発の新概念 | プレシオス・ラングリーズ（破壊時コア移譲）・スクルディア（回復ロック）・スレイプホース（マジック反応バフ）・リップ・ケン（能力付与）・オベロLv2-3（名前扱い）・クラン（コスト扱い）・アディショナルカラー（色付与）・ケルル・ベロス（強奪。禁止カード）・ミカファール・デストロードe2（破壊コア数連動）・トールe1/e3（選択コスト）・決闘台地e2・尖兵e2 ほか部分未対応 |

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
- **条件付きレベル変更**「スピリット2体以下の間Lv3として扱う」（ジャグリーン）
- ~~レベル基準のブロック制限（スプラー・デースペル）~~ / ~~回復状態への指定アタック（オルカリア）~~ /
  ~~色フィルタ回復・fieldEvent（エンジュ・大聖堂）~~ / ~~系統カウンタ（カーバルク）~~ /
  ~~コスト指定全回復（ローヤルポーション）~~ / ~~自陣営破壊＋コスト連動コア獲得（プリンシパール）~~
  — **エンジン小拡張バッチで対応済み（2026-07-17）**
- **条件付き・ネクサス版の色指定全体破壊**（プレシオス。ネクサス3色以上条件＋ライフ減少時の追撃も未対応）
- **ライフ被弾コアの行き先変更**（スライミー: リザーブでなくボイドへ）
- **自分か相手を選べる対象**（シーザーの疲労破壊）、**スピリット/ネクサス択一の対象**（コキュートス）
- **コア増加の検知**（夢魔の寝所）、**破壊からの復活**（紫水晶の森）、
  **自ネクサス破壊をコストにする効果**（サクリファイス）、**自身と同BPの破壊対象**（プテラトマホーク）

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
- オフェンシブオーラ（BS01-116）は「アタック中の自分スピリットすべて」を単体 bpBuff で簡略化
  （現エンジンは同時アタック1体のため等価）
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

smoke テストの本体は `scripts/smoke/part1〜6.ts` に分割（`scripts/smoke.ts` はランナー、
共通ヘルパー＝assert/act/テスト用 runTurnStart/summary は `scripts/smoke/helpers.ts`）。
テストを追加するときは新しい partN.ts を作って smoke.ts に import を1行足す。

---

## 7. 変更履歴

実装の変更ログは [CHANGELOG.md](./CHANGELOG.md) に分離（SPEC の肥大を防ぐため）。
