# 「ことで」確認関門の棚卸し（59枚・64節）

調査日 2026-10-02。対象は `validate:cards` に足す予定の検査「効果文の『ことで』の数 ≦ 確認関門を通る器の数」で、数え方では足りなかった59枚。
規則は [COST_MODEL.md](./COST_MODEL.md) §10。コード・データは変更していない。

分類：**A** 別の正しい関門がある／**B** コストの意味ではない／**C** 確認を通っていない疑い。

## 先に分かったこと

- **検査の関門リストの `shinsoku` は存在しないキーワード名**。データのキーワードは `soku`（29枚）と `resshinsoku`（1枚）。このため神速持ち約18枚がまとめて足りない側に出ていた。
- 確認を出す場所は大きく4種類：
  1. **任意効果の確認**：`triggered`／`step`／`fieldEvent`／破壊時誘発／合体時誘発の `optional:true` → `requestActivationConfirm`（triggers.ts:566・643・825・1039・1647）。コストは action 側の欄に入っている（`reviveLastDestroyedNexus.coreCost` など）
  2. **プレイヤー自身の操作**：召喚アクションの引数（`substituteInstanceId`・`altSummonNexusInstanceIds`・`discardHandIndices`・`shinsokuAssistInstanceIds`）、`resshinsokuSummon`、手札の起動（`handActivated`）。押す操作そのものが確認
  3. **専用の選択**：【転召】置換（tensho.ts:232 `requestChoice`）、【不死】（revive.ts `suspendFushiSummon`）、コア数の増減選択（buff.ts:250）
  4. **キーワード宣言**：`soku`（RuleValidator.ts:190-194。フラッシュで召喚できる許可で、召喚を選んで初めて払う）

## 表

| カード | 節（40字以内） | 分類 | 根拠 |
| :-- | :-- | :-- | :-- |
| BS02-026 マッハジー | 〜リザーブから使用することで召喚できる | A | keyword `soku`。召喚操作が確認（RuleValidator.ts:190） |
| BS04-057 天使長セラフィー | コア1個を置くことで…好きなだけ召喚 | A | triggered onSummon `optional:true`（triggers.ts:566）→ `summonRepeatFromHand`（battleFlow.ts:979）。⚠ 召喚する枚数と順は自動（貪欲）で、本人は選べない |
| BS04-061 戦闘獣ジャッカー | コアすべてを置くことで…ネクサスを戻す | A | fieldEvent `optional:true`（triggers.ts:825）→ `reviveLastDestroyedNexus`。支払えるかは確認の後で判定（destroy.ts:1098） |
| BS05-007 ロッソ | 疲労させることで…置いたものとして扱う | A | constraint `tenshoCoreSubstitute`。tensho.ts:232 で `requestChoice`（対話時） |
| BS05-017 ヴァイオレット | 同上 | A | 同上 |
| BS05-026 グリューン | 同上 | A | 同上 |
| BS05-034 アルブス | 同上 | A | 同上 |
| BS05-043 フラウム | 同上 | A | 同上 |
| BS05-047 ブロンズ・ゴレム | コア1個を置くことで…ネクサスを戻す | A | fieldEvent `optional:true` → `reviveLastDestroyedNexus`（coreCost:1） |
| BS05-053 アズール | 疲労させることで…置いたものとして扱う | A | `tenshoCoreSubstitute` |
| BS06-035 ツクシンモア | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS07-022 ブラックカラカロッサム | 手札に戻すことで…代わりにバトルする | A | kind `battleSwapSummon`。召喚アクションの `substituteInstanceId`（RuleValidator.ts:164-173、GameEngine.ts:349） |
| BS07-058 常闇の聖堂 | ①コアをコストとして使うことで召喚できる | A | step `optional:true`（triggers.ts:1039）→ `summonFromTrashFree{payCost}` |
| BS07-058 常闇の聖堂 | ②ドローしないことで…手札に戻す | A | step `optional:true` + `beforeStepAction` → `recoverSpiritFromTrash{costSkipDraw}`（trashRecover.ts:117）。before／after とも同じ確認（triggers.ts:932） |
| BS08-003 ダークアンキラーザウルス | 疲労させることで【転召】させずに召喚 | A | `tenshoCoreSubstitute`。⚠ 効果文は「【転召】させずに召喚」だが実装は竜使いと同じ「コアを置いたものとして扱う」。確認の有無とは別の問題 |
| BS08-012 ダークスカルデーモン | 同上 | A | 同上 |
| BS08-021 ブラックアメンボーグ | 同上 | A | 同上 |
| BS08-039 ダークチュンポポ | 同上 | A | 同上 |
| BS08-048 ブラックウガルルム | 同上 | A | 同上 |
| BS08-071 ビクティム | 手札1枚を破棄することで支払える | A | kind `summonCostHandDiscardPay`。召喚アクションの `discardHandIndices` で本人が選ぶ（EffectModules.ts:419） |
| BS09-062 ノルンの泉 | ネクサスを代わりに疲労させることで【氷壁】 | A | kind `magicNegatePayByNexusGrant`。`magicNegate` の支払い肩代わり（negate.ts:15-30）。使うかの確認は magicNegate 側 |
| BS09-065 名工集いし大工房 | コアをコストとして使うことで…配置できる | A | step `optional:true` → `deployNexusFromTrashByFieldCores` |
| BS10-096 最後の優勝旗 | スピリット1体を破壊することで…召喚 | A | step `optional:true` → `summonFromHandFree{costDestroyOwnSpiritSameCost}`（battleFlow.ts:851-865 で対象を選ばせる） |
| BS10-026 老兵ノーガン | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS10-085 浮遊する岩塊 | （付与文）〜使用することで召喚できる | A | kind `handKeywordGrant{soku}`。実処理は `soku` と同じ（RuleValidator.ts:193 `hasHandKeywordGrant`） |
| BS10-087 戦場に息づく命 | コアを置かないことでドロー | A | step `optional:true` + `beforeStepAction` → `draw{costSkipCoreStep}`（drawDiscard.ts:21） |
| BS10-103 グロウイングソード | コアをトラッシュに好きなだけ置くことで | A | `bpBuff.extraPerCoreToTrash`。0〜最大の増減選択（buff.ts:250）。0が「払わない」。非対話は0個 |
| BS10-X05 ヴィーナ・ルシファー | スピリットカード1枚を破棄することで | A | triggered `optional:true`（triggers.ts:643 合体時）→ `millUntilMagicCastFree{discardCardType}`（mill.ts:73-86 で手札を選ぶ） |
| BS10-058 メルクリウス・サーペント | ネクサスをデッキの下に戻すことで召喚 | A | kind `altSummonFromHand`。召喚アクションの `altSummonNexusInstanceIds`（GameEngine.ts:466-484、RuleValidator.ts:251） |
| BS10-086 巨星望む大樹 | 分離することで…回復させる | A | fieldEvent `optional:true` → `detachBrave` |
| BS11-017 ムシャツバメ | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS11-020 陰陽ヤマセミ | 同上 | A | keyword `soku`（召喚時のブレイヴ合体は ことで ではない） |
| BS11-021 ゴクラクチョー | 同上 | A | keyword `soku` |
| BS11-053 カーミュラ1 | 同上 | A | keyword `soku` |
| BS11-066 発見されし世界樹 | ①コア1個を置くことで…ネクサスを戻す | A | fieldEvent `optional:true` → `reviveLastDestroyedNexus`（この節だけが検査で足りない） |
| BS11-066 発見されし世界樹 | ②コア3個を置くことで…スピリットを戻す | A | `reviveOnDestroy{cost}`（既に関門リストに入っている） |
| BS11-X03 ハーキュリーΩ | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS12-019 くノ一ジョロウ | 同上 | A | keyword `soku` |
| BS12-061 剣の誕生地 | このネクサスを疲労させることで…扱う | A | `tenshoCoreSubstitute{familyFilter,costFilter}`。発生源が別（crossSource）でも同じ `requestChoice`（tensho.ts:232） |
| BS12-064 偶像の館 | 同上 | A | 同上 |
| BS12-066 巨木の門 | 同上 | A | 同上 |
| BS12-068 光の聖剣 | （付与文）疲労させることで無効にする | A | `effectEntryGrant.granted` が `magicNegate{cost:exhaustSelf}`。**入れ子の中なので検査は数えていない**。関門の本体は magicNegate |
| BS12-075 ボオーテスコール | 〜リザーブから使用することで召喚する | B | マジックの使用が選択そのもの。「ことで」は通常の召喚コストを払う手段の言い直しで、断る余地のある任意コストではない（`summonFromTrashFree{payCost}`） |
| BS13-021 サイゾロング | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS13-060 トレス・ベルーガ | デッキを6枚破棄することで | A | triggered `optional:true`（合体時 triggers.ts:643）→ `bpBuff{costMillSelfCount}`（buff.ts:77-90） |
| BS14-025 ムシャメガ | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS14-084 永久凍土の王都 | このネクサスをトラッシュに置くことで | A | `globalConstraint.ownLifeFloor{costSelfToTrash}`。**確認なしで自動で払う例外**（COST_MODEL §10。2026-10-02 ユーザー決定） |
| BS14-X03 ドルクス・ウシワカ | ①〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS14-X03 ドルクス・ウシワカ | ②手札に戻すことで…BP+3000 | A | `pay`（既に関門リストに入っている） |
| BS15-011 ミーアバット | 手札のこのカードを破棄することで | A | kind `handActivated{cost:discardSelf}`。プレイヤーの起動操作が確認（GameEngine.ts:790-803、RuleValidator.ts:584-598） |
| BS15-025 カヒョウトン | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS15-064 冥府へ続く魔門 | ①手札1枚を破棄することで…色を無いものとして扱う | A | `pay`（既に関門リストに入っている） |
| BS15-064 冥府へ続く魔門 | ②疲労させることでコストを支払わずに召喚 | A | kind `fushiFreeByExhaust`。【不死】の確認で選択肢「魔門を疲労させて無償で召喚する」（revive.ts:243-262 `suspendFushiSummon`。払えない道は提示しない） |
| BS16-047 警備兵パグ | コア1個を置くことで…ネクサスを残す | A | fieldEvent `optional:true` → `reviveLastDestroyedNexus`（coreCost:1） |
| BS16-X03 烈の覇王セイリュービ | トラッシュのコアをすべて置くことで召喚 | A | keyword `resshinsoku`。`resshinsokuSummon` アクション（GameEngine.ts:259）が確認 |
| BS16-021 ノウゼンサーバル | 疲労させることで…2コストまで支払ったものとして扱う | A | kind `shinsokuPayAssist`。召喚アクションの `shinsokuAssistInstanceIds`（GameEngine.ts:467-489、RuleValidator.ts:134・235） |
| BS16-022 マー・バチョウ | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS16-023 コノハズクロー | 同上 | A | keyword `soku` |
| BS16-026 クマタカンウ | ①〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS16-026 クマタカンウ | ②手札に戻すことで…コア2個 | A | `pay`（既に関門リストに入っている） |
| BS16-057 コテツ・ティーガー | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| BS16-067 氷聖女の塔 | （付与文）疲労させることで無効にする | A | `effectEntryGrant.granted` が `magicNegate{cost:exhaustSelf}`（BS12-068 と同じ入れ子） |
| SD01-016 アメンボーグ | 〜リザーブから使用することで召喚できる | A | keyword `soku` |
| SD02-009 獣将軍クジャルタ | 手札に戻すことで…置いたものとして扱う | A | `tenshoCoreSubstitute{mode:returnToHand}`（tensho.ts:232 で手札に戻す選択肢） |

## 件数

| 分類 | 節数 | 備考 |
| :-- | --: | :-- |
| A | 63 | うち `soku`／`resshinsoku`／`handKeywordGrant{soku}` が20、【転召】置換が15、`pay`・`reviveOnDestroy` で既に数えている節が4 |
| B | 1 | BS12-075 |
| C | 0 | 確認が全く無い節は見つからなかった（下の補足は C ではなく別件） |

## A の器の名前一覧（検査の関門リストに足すもの）

数えているのに `shinsoku` が存在しない名前だったので、これを直すのが最大の差分。

- keyword `soku`、`resshinsoku`（`shinsoku` は削除）、kind `handKeywordGrant`（keyword:soku）
- constraint `tenshoCoreSubstitute`（keyword `tensho` とは別。【転召】置換）
- kind `shinsokuPayAssist`、`battleSwapSummon`、`altSummonFromHand`、`summonCostHandDiscardPay`（召喚アクションの引数で払うもの）
- kind `handActivated`（cost あり）、`fushiFreeByExhaust`、`magicNegatePayByNexusGrant`
- `effectEntryGrant.granted` の中の `magicNegate`（入れ子を辿る）
- `optional:true` の `triggered`／`step`／`fieldEvent` のうち、action が次のもの：`reviveLastDestroyedNexus`、`summonRepeatFromHand`、`summonFromTrashFree{payCost}`、`summonFromHandFree{costDestroyOwnSpiritSameCost}`、`draw{costSkipCoreStep}`、`recoverSpiritFromTrash{costSkipDraw}`、`bpBuff{costMillSelfCount}`、`millUntilMagicCastFree`、`detachBrave`、`deployNexusFromTrashByFieldCores`
- `bpBuff{extraPerCoreToTrash}`（コア数の選択）
- 例外として `globalConstraint.ownLifeFloor{costSelfToTrash}`（BS14-084。確認なしが正）

B：BS12-075 の1節（`summonFromTrashFree{payCost}` を持つ**マジック**。「ことで」は支払い手段の言い直し）。検査からは個別に免除するか、マジック本体の使用を関門とみなす。

## C の一覧

なし。ただし次の3点は C ではないが、規則 §10 とのずれとして残る。

| 件 | 中身 |
| :-- | :-- |
| BS04-057 | 「好きなだけ」の枚数と対象が自動（`summonRepeatFromHand` が貪欲に最大数を召喚。battleFlow.ts:979-1010）。確認は発動の1回のみ |
| `reviveLastDestroyedNexus` を使う4枚（BS04-061・BS05-047・BS11-066・BS16-047） | 「聞く前に成立しないなら確認を出さない」が未適用。確認を出したあとにコア不足・戻せるネクサス無しを判定してログに出す（destroy.ts:1098-1119） |
| BS08-003・012・021・039・048 | 効果文は「【転召】させずに召喚できる」だが `tenshoCoreSubstitute`（コアを置いたものとして扱う）で代用している。確認は出るので関門としては A、解釈の問題として別に確認が要る |
