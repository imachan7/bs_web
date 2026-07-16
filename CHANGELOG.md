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
