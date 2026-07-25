# 変更履歴

（bs_web の実装変更ログ。仕様の現状は SPEC.md 参照。サブエージェントは読まなくてよい）

- 第一弾135枚を Wiki から収集し、`data/cards.json` を実データで再構築
- キーワードをレジストリ方式に変更（神速・覚醒を実装、激突・装甲は予約）
- 誘発効果を5トリガー × 6アクションで構造化（34枚分を自動化）
- デッキを赤・紫・緑・白の4色に拡張
- `coreRemove` / `bpBuff` アクションと `castMagic` の対象指定（`targetInstanceId`）を実装。
  マジック17枚のタイミング別効果を構造化（構造化合計42枚）
- DECK_RECIPES を cards.json の実IDで4色分再構築（旧レシピはID全面ズレで全滅していた）。
  smoke.ts の旧ID（BS01-100 → BS01-122 等）も是正
- `exhaust` / `destroyExhausted` アクションを実装（バインディングソーン・ダークコフィンを構造化）。
  あわせて `magicTargetSide` がタイミングを無視して対象側を誤判定するバグを修正
- バトル中フラッシュの交互優先権パスを実装（`pass` アクション、優先権表示とパスボタンのUI追加）
- 覚醒のクライアントUIを実装（覚醒バッジ→移動元クリックの2段階操作）。
  覚醒の優先権整合（優先権チェック＋使用後の優先権移動）も追加
- ブロック宣言後の追加フラッシュを実装（ブロック→フラッシュ再オープン→両者パスでバトル解決）
- デッキビルダーページ `/deck.html` を新規実装（フィルタ・制約検証・統計・localStorage保存・JSON入出力）
- コスト支払いにスピリット上のコアを使えるようにした（v1: スピリット上のコアのみ、ネクサス上は将来対応）。
  `PaySource` 型・`validatePaySources`・`payCost` の拡張と、クライアントの支払いモードUIを追加
- デッキビルダーを対戦ロビーに統合（カスタムデッキでの join、サーバー側 `validateDeckCards` 検証、
  E2E に有効/不正デッキのケースを追加）
- 可変数ドロー系アクション（`drawPer` / `bpBuffPer` / `discardHandAll` / `bpBuffAll`）と
  複合効果（resolveMagic の全効果実行）を実装。カオスドロー・リレイションソウル・ハンドリバース・
  パワーオーラ・オフェンシブオーラを構造化（構造化合計46枚）
- バウンス・コア操作系アクション（`returnToHand` / `returnToDeckTop` / `coreCharge` / `lifeCharge` /
  `coreGain`）を実装。ドリームリボン・ドリームチェスト・アウェイクン（複合）・シャドウエリクサー・
  ギャザーフォースを構造化（構造化合計50枚）
- バトル制御・疲労回復系アクション（`refreshAllOwn` / `endBattle` / `exhaustAllByColor` / `lockFlash`）を
  実装。ピュアエリクサー・ラークドライブ・バインディングウッズ・ディバインチェインを構造化
  （構造化合計53枚。`clearBattle` は循環依存回避のため GameState.ts へ移設）
- スピリット効果を一括構造化（11枚追加: シャ・ズー、ダークウィッチ、吸血姫ヴァンピレス、
  幽騎士ナイトライダー、エメアント、イーグラス、エイプウィップ、エメラルドシーザー、
  月甲モノケイロス、ウル・ディーネ、ヘル・ブリンディ）。ジークフリード Lv3 破壊時も複合で構造化
  （構造化合計64枚）。「1体を選ぶ」系は自動選択で意味が変わらない場合のみ採用
- ステップ誘発システム（`kind: "step"`、`returnNexusToHand` / `reclaimTrashCores`）を実装。
  千年雪の尖塔・侵食されゆく銀世界を構造化（ネクサス初、合計66枚）
- 常時BP修正（オーラ）システム（`kind: "aura"`、`effectiveBp`）を実装。バトル解決・対象選択・
  BP表示を実効BP化し、スピリット8枚＋ネクサス4枚を構造化（合計78枚）
- `destroy` に maxBp 省略（BP不問）と keywordFilter を追加し、晶輝龍ディアマットを構造化（合計79枚）
- 状態バッジのクライアント表示（「アタック不可」バッジ、フラッシュ封印の文言＋ハイライト抑止）
- バトル勝利時効果を構造化（onBattle の等価性を利用。`refreshSelf` / `lifeCrush` /
  `voidCoreToSelf(Per)` を追加、フェニキオス・ナージャ・ブランボアー・キングタウロス大公で合計82枚）
- ブロック制約レイヤー（`kind: "constraint"`）と `discardOpponent` を実装。ブロック制限7枚＋
  手札破棄2枚（マッチュラ・ハングリートゥリー）を構造化（合計91枚）
- バトル結果誘発（`battleRole` / `kind: "battleWon"`）と `mustAttack` 制約を実装。
  キングタウロス大公 Lv2-3・無限蟲の蟻塚・古龍の縄張り Lv2・ウィル・オーブ・ディザスターを構造化
  （合計95枚。endTurn 検証は validateEndTurn へ集約）
- フィールドイベント誘発（`kind: "fieldEvent"`）・`refreshOne` / `coreRemoveSelf`・
  オーラ `summonedThisTurnOnly` を実装。命の果実・風吹く丘陵・メラット・侵食Lv2 を構造化（合計98枚）
- 7機能バンドル: `selfBuffPer`（相手回復数比例）・`voidCoreToOther`・`coreSqueezeAll`（全スピリット
  コア1個残し）・`unblockableBy maxCores`・`destroyNexus drawPerDestroyed`（バスタースピア）・
  step 条件 `handNotGreaterThanOpponent`（主無き古城Lv2）・遅延アタックステップ終了
  （サイレントウォール。`endAttackStepAfterBattle` フラグを handleAction の事後フックで一元消費し、
  ライフ受け・バトル解決・endBattle 全経路に対応）。スケルトン・ジョウ e1 の誤データ
  （固定+1000 → 回復数比例）も是正（合計104枚）
- フィールド全体制約（`kind: "globalConstraint"`）と fieldEvent の `anySpiritAttacked`・
  `coreToTrashSelf` を実装。魔帝の墓標（コア1個スピリットのアタック/ブロック禁止＋アタック宣言時コア送り）・
  オーディーン Lv2-3（ネクサス破壊耐性）を構造化（合計105枚）
- トラッシュ回収系バッチ: `recoverSpiritFromTrash` / `coreSqueezeOne` / `coreToVoidOwn` /
  `bothSidesCoreToTrash` と fieldEvent `opponentDrew` を実装。ドラグノ祈祷師・コブライガ・
  ハンマドレイク・メタルディー・バグ・シダフクロウ・甲精ディース(e2) を構造化（合計111枚）
- ドキュメント/テストのトークン最適化: 変更履歴を CHANGELOG.md へ分離（SPEC 縮小）、
  smoke に `--quiet` モード（`npm run smoke:quiet`、成功時は集計1行）、CLAUDE.md に委譲時のトークン規律を明文化
- コスト修飾（`kind: "costMod"`）・`discardSelfOne`・`coreDrainAllOthers` を実装。
  ルビーの太陽（白カードのコスト+1）・百識の谷（ドローステップ+1、Lv1は破棄）・
  魔界七将デスペラード（コアドレイン）を構造化（合計114枚）
- 免疫・効果無効システムを実装。constraint `untargetableByOpponent`（ワルキューレ）、
  一時フラグ `immuneToOpponentThisTurn`（フェザーバリア）・`blockConstraintNegatedThisTurn`
  （バーストファイア）。pickEnemyByBp/destroyAll/validateCastMagic/validateBlock とクライアント対象選択に反映。
  マジック32枚すべて構造化完了（合計117枚）
- 指定アタック（constraint `canDirectAttack` ＋ attack の `targetSpiritInstanceId` ＋ BattleState.directed）と
  アタックステップ終了（`endAttackStep`、既存の遅延フラグ機構を再利用）を実装。イリュージョナ・
  牛霊スモゥグ・妖機妃ソールを構造化（合計120枚。ネクサス12/12・マジック32/32完了、残り効果持ちは3枚）
- 山札公開（`deckReveal`）・フラッシュ起動能力フレームワーク（`kind:"activated"` ＋ `activateAbility`）・
  コア配置修飾（`kind:"coreBonus"`）を実装。スワロウアイヴィー・グラン・ドルバルカン・グラーバを構造化。
  これで効果文を持つ全カードの構造化が完了（合計123枚、残り12枚はバニラ）
- 先攻1ターン目のアタック禁止ルールを実装（validateAttack で拒否、mustAttack もターン1では
  endTurn を妨げない。クライアントのアタック可能ハイライトにもミラー）。smoke はテスト用
  runTurnStart ラッパーでターン3開始に変更し、ターン1専用テストを追加
- 効果テキストのツールチップを実装（PC: カードにホバー、スマホ: 長押し500ms でカード名＋効果全文を
  カードの上に重ねて表示。長押し後のタップはカード操作として誤発火しないよう抑止）
- 第二弾：激翔（BS02）全115枚を Wiki から取得し cards.json へ追加（合計250枚）。新色・黄のUI対応
  （デッキビルダーのフィルタ/プリセット・ロビー・CSSの色クラス）、DECK_RECIPES に黄単色40枚を追加、
  禁止カード4枚（BS02-063/085/097/099）を limited フラグで反映。effects は未構造化
  （【装甲】【呪撃】のエンジン実装と構造化は次バッチ）
- BS02 新キーワード【装甲：色】【呪撃】をエンジン実装（keyword エントリに colors 追加、resolveAction に
  sourceColor 伝播、resolveBattle 末尾に呪撃フック、クライアント対象選択ミラー）。
  BS02-015/020/040/044/045 の5枚を構造化（smoke +6ケース、732件全合格）
- BS02 赤・紫の効果構造化バッチ（15枚構造化・17枚は新概念のためスキップ、スキップ分は SPEC 5章に課題として記録）。
  BS02-X06 の効果文分断（Wiki リストページの br 起因）を個別ページと突き合わせて修正
- BS02 緑・白の効果構造化バッチ（11枚構造化・20枚スキップ）。サブエージェントが battleWon で構造化した
  BS02-036/041 の『このスピリットの〜時』限定効果を triggered onBattle + battleRole に是正
  （battleWon は持ち主の全スピリット勝利で発火するため自己限定効果には不正確）。smoke +18件（790件全合格）
- BS02スキップ分を拾うエンジン小拡張8件（cantAttack制約・recovered指定アタック・unblockableBy levelFilter・
  refreshOne/fieldEventの色フィルタ・系統カウンタのdrawPer/coreGainPer・refreshAllByCost・destroyOwnByCost）を
  実装し8枚を追加構造化（計45/103枚。smoke 830件全合格）
- キーワード付与を実装: grantKeyword アクション（tempKeywords による一時付与、ターン終了リセット）、
  kind:"keywordGrant"（フィールド発生源からの系統・フェーズ限定の継続付与）、状態対応判定 spiritHasKeyword、
  aura の keywordFilter。スピリットリンク・インビンシブルシールド・暴双龍ディラノスを構造化
  （計48/103枚。クライアントの覚醒バッジ・ブロック可否・装甲対象選択・実効BP表示もミラー。smoke 842件全合格）
- BS02構造化バッチ2: fieldEvent anyNexusDestroyed（アーケオルニ）、攻撃側トリガー onBlocked（バット・バット・
  シーザー。fireTrigger に targetInstanceId 転送を追加）、destroyExhausted anySide（両陣営対応）、
  exhaustAllByLevel（デストロードLv1）、destroyAllExceptChosenColors（ケンドラゴス、色自動指定の簡略化）。
  計52/103枚（smoke 864件全合格）
- BS02構造化バッチ3: destroy bpEqualsSelf（プテラトマホーク）・onBattleEnd/destroySelf（コリスタル）・
  lifeDamageToVoid（スライミー）・reductionGrant＝軽減シンボル付与（ペンタン・バーチュ、サーバー/クライアント両方）・
  refireSummonEffect（タイムリープ）・ホワイトポーション（前バッチ見逃しの refreshOne）。
  計59/103枚（smoke 895件全合格）
- BS02構造化バッチ4（11枚。監査で発見した既存アクションのみで書ける見逃し2枚を含む）:
  recoverMagicFromTrash・trashCoresToSpirit・grantKeywordAll・aura phaseTurn/minCores・
  fieldEvent ownMagicUsed・トリガー onLifeDealt・ターン限定全体制約（ヘビィゲート）を新設。
  計68/103枚（smoke 940件全合格）
- BS02構造化バッチ5（9枚+部分1）: aura costFilter・unblockableBy costNot・ブロック時不疲労・
  破壊時コア数カウンタ・costMod拡張（相手マジック限定+1等）・immunityGrant（漂精のマジック耐性）・
  deployNexus（手札/トラッシュから無償配置）・サクリファイス専用処理。計77/103枚（smoke 984件全合格）
- smoke テストを分割: scripts/smoke.ts（約5000行）を scripts/smoke/part1〜6.ts（各900行以下）と
  helpers.ts（assert/act/QUIET/テスト用runTurnStart/summary＋エンジン関数のre-export）に機械分割し、
  smoke.ts はランナー化。テスト内容は無変更（分割前後で984件合格が一致）。CLAUDE.md のトークン規律も更新
- BS02構造化バッチ6: レベル置換「〜として扱う」（ジャグリーン・トパーズの流星・皇帝アンプルール）。
  currentLevel/levelOf がインスタンス上の上書き（levelOverrideThisTurn > levelAsContinuous）を優先し、
  事後フック refreshLevelAsOverrides で継続条件を再計算。あわせてバッチ4のデータ入れ忘れ
  （BS02-081 緑芽吹く原野）を修正・テスト追加。計81/103枚（smoke 997件全合格）
- BS02構造化バッチ7: 系統の継続付与（kind familyGrant＋spiritHasFamily。ポム・生み出される尖兵）と
  手札からの無料召喚（summonFromHandFree、召喚時効果は不発。トレントン・アースガルド）。
  計83/103枚で区切りとし、残り20枚は表示のみで確定（分類は SPEC 5章。smoke 1021件全合格）
- BS02構造化を再開（波1a+1b、計9枚+部分完成）: プレシオス・ラングリーズ・スクルディアe1・花の子リップ・
  決闘台地e2・オベロe1・デストロードe2完成・ミカファールe1・スレイプホース。aura の phaseTurn が
  target:"self" で無視されるバグも発見・修正。計90/103枚（smoke 1080件全合格）
- 効果解決中のプレイヤー選択（pendingChoice）基盤を実装: 効果解決を中断して対象を選ばせ、
  resolveChoice で再開する直列化可能な機構（誘発キューの退避・再中断対応・view マスク・クライアント選択UI）。
  初適用としてコキュートス（相手のスピリット/ネクサスを選んでコアをトラッシュへ）を構造化。
  計91/103枚（smoke 1098件全合格）
- BS02構造化 波3a: エンジェルボイス（Lv比較バトル）・ケン（effectGrant＝誘発効果の付与）・
  クラン（コストとしても扱う）・封印された魔導書e2（効果ドロー倍化）。計95/103枚（smoke 1139件全合格）
- BS02構造化 波3b: 破壊への割り込み復活（reviveOnDestroy。チャガマル・紫水晶の森・鏡の回廊e1）と
  選択肢式choice（kind:"option"。アディショナルカラー＝対象→色の2段階選択、クルーク＝系統選択、
  tempColors/tempFamilies/instHasColor 新設）。計100/103枚（smoke 1197件全合格）
- BS02構造化 最終波: クロスシザース（ネクサスのコア数リンク choice）・夢魔の寝所（手動コア増加検知＋
  constraintGrant による指定アタック付与）・ケルル・ベロスe1。これで効果文を持つ全103枚の構造化が完了
  （未対応はケルル・ベロスe2の強奪と紫水晶の森Lv2のみ。smoke 1228件・E2E 全合格）
- 対戦体験改善①: 誘発効果の対象選択をプレイヤー選択式に（opt-in の interactiveTargets。実対戦のみ有効、
  テストは従来の自動選択を維持。対象6アクション＋destroy count連鎖。smoke 1259件・E2E 全合格）
- 対戦体験改善②: コスト支払いをネクサス上のコアにも対応（validatePaySources/payCost の拡張、
  クライアント支払いモードのネクサスクリック対応。smoke 1275件全合格）
- 対戦体験改善③: 手札・トラッシュのカード選択を choice 化（pendingChoice kind:"card"。discardOpponent は
  捨てられる側が選ぶ原作準拠に、トラッシュ回収・無料召喚・無償配置は使用者選択に）。ネイチャーフォースの
  メインステップ使用禁止を忠実化。メインステップフラッシュ優先権は原作に存在しないため実装しない判断を記録
  （smoke 1339件・E2E 全合格）
- 第三弾：覇闘（BS03）全153枚を取り込み（計403枚）。新色・青のUI対応（ロビー・デッキビルダー・CSS）、
  DECK_RECIPES に青単色40枚、禁止カード BS03-030 反映、複数レアリティ表記対応。
  新キーワード【粉砕】【光芒】はエンジン未実装（次バッチ）。smoke 1345件全合格
- BS03新キーワード【粉砕】（相手デッキをLv枚数ミル）【光芒】（バトル使用マジックの回収）をエンジン実装。
  保持カード7枚（粉砕3・光芒4）にキーワード付与（smoke 1367件全合格）
- BS03構造化バッチ1（赤・紫）: 21枚構造化（全文10・部分11）・9枚スキップ（コア数フィルタ破壊・
  バニラ参照・手札公開など新概念はSPEC課題へ）。smoke 1400件全合格
- BS03構造化バッチ2（緑・白）: 13枚構造化（全文8・部分5）・19枚スキップ（カウンタ不足・バニラ参照・
  付与系のcolorFilter欠如など。頻出分は次のエンジン拡張バッチで対応）。smoke 1423件全合格
- BS03エンジン拡張バッチ: EffectCounter統一（Per系5アクションのカウンタを12種に一般化）・
  keywordGrant/effectGrantのcolorFilter・exhaustのlevelFilter。緑・白のスキップから8枚を追加構造化
  （smoke 1454件全合格）
- BS03構造化バッチ3（黄）: 14枚構造化（全文5・部分9）・12枚スキップ（色/名前の「として扱う」付与・
  トリガーの色条件ゲート・マジック無償化などが未対応。仕上げ拡張バッチ候補）。smoke 1475件全合格
- BS03構造化バッチ4（青）: 13枚構造化（全文6・部分7）・22枚スキップ（最多は汎用ミルアクション不在の8枚前後。
  仕上げ拡張バッチで対応）。smoke 1495件全合格
- BS03仕上げ拡張バッチ: 汎用ミル（mill/millPer）・EffectCounter ownColor・bpBuffAll familyFilter・
  deployNexus all を新設し8枚を追加構造化。BS03 は 78/128 で区切り（残り50枚は任意コスト誘発・
  効果無効・手札加入検知など深い新概念。smoke 1512件・E2E 全合格）
- **リファクタリング: 共有ルール層の抽出と `resolveAction` の分割**（REFACTOR.md の計画を完遂し同ファイルは削除）
  - **Phase A**: サーバーとクライアントで二重実装されていたルール判定を `shared/` に一本化。
    `shared/cardDb.ts`（カードマスタ参照の注入。`shared/` は node:fs 非依存でクライアントにもバンドルできる）・
    `shared/board.ts`（`GameState` と `GameView` が両方満たす読み取り専用インターフェース。適合をコンパイル時に固定）・
    `shared/rules.ts`（キーワード／系統／オーラ／実効BP／制約・免疫の約25関数）・
    `shared/cost.ts`（軽減・コスト修正・マジック制約・無償化）・`shared/block.ts`（ブロック可否）。
    `renderer.ts` 1731→1214行、`RuleValidator.ts` 803→625行。サーバー側の実装を正として統合した
  - この過程で**クライアント表示バグ3件が解消**: ①ミカファールLv2下で色の合わない手札マジックが
    コスト0表示・使用可能ハイライトにならない ②`GameView` に `magicUsedThisTurn` が無くフォクシンの
    使用制限が表示されない ③レッドウォール使用中もブロック可能ハイライトが「ブロックされない」効果を
    無視できない。回帰テストを `scripts/smoke/part56.ts` に追加（共有実装になったため
    サーバー側テストがそのままクライアント挙動の保証になる）
  - **Phase B**: 3,189行・105 case の単一関数だった `resolveAction` を
    `server/src/logic/actions/` の6モジュール（destroy / cores / exhaustRefresh / handDeck / grant /
    battleFlow ＋ buff）へ分割し、本体は54行のディスパッチャに。`ActionRegistry`（全 `EffectAction.type` を
    網羅する型）により**旧 switch の網羅性チェックを型で維持**。`EffectModules.ts` 5469→2017行
  - 移設は機械変換でロジック不変。closure ローカル11個は `ActionCtx` に集約し、再帰呼び出しは
    `ctx.resolve` へ（省略引数を暗黙に引き継がない設計で移設前の挙動を厳密に保持）
  - 検証: typecheck 0エラー・smoke 2144件全合格・build:client 成功・E2E 合格。
    あわせて E2E の陳腐化していた期待値（初期手札4枚 → 先攻1ターン目のドロー込みで5枚）を現行ルールに追随
