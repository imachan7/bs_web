# EffectDef の分割（WHERE_TO_ADD §0 の適用。2026-10-15 設計）

`server/src/types/effectDef.ts`（139KB）は `export type EffectDef = | {…} | {…} …` の **union 1つ**（120種・130メンバー）なので、
`split-file.ts`（最上位の宣言を移す道具）では切れない。**種類ごとの小さな union に分け、`EffectDef` はそれらの和にする。**

## 1. 分け方（kind → ファイル。この表が正。新しい kind はこの表に1行足してから書く）

置き場は `server/src/types/effectDef/<ファイル>.ts`、各ファイルは `export type <名前> = | {…} …` を1つだけ持つ。
`types/effectDef.ts` は `export type EffectDef = TriggerDef | ActivationDef | …` と `MagicCondition` だけになる（利用側の import は変わらない）。

| ファイル（型名） | 判定の言葉 | kind |
| :-- | :-- | :-- |
| `trigger.ts`（TriggerDef） | 引き金があって発揮する | triggered, step, fieldEvent, battleWon, burst, onMilledFromDeck, reviveOnDestroy, extraStepAfterAttackStep, milledMagicToTegamoto, trashReturnAtEndStep, trashReturnOnOwnHeavyExhaust, trashReturnOnOwnSpiritDestroyed, trashSummonOnNameSummoned, freeSummonFromHandOnLifeDamaged, freeSummonFromHandOnDiscardedByOpponent, freeSummonFromHandOnOwnNexusDeployed |
| `activation.ts`（ActivationDef） | プレイヤーが使う・宣言する | activated, magic, handActivated, flashSummonFromHand, altSummonFromHand, battleSwapSummon, awakenFromReserve |
| `continuous.ts`（ContinuousDef） | 場にある間ずっと、状態・扱いを変える | aura, keyword, keywordGrant, effectGrant, effectEntryGrant, familyGrant, nameAsGrant, trashNameAs, vanillaAsGrant, levelAs, bpAs, colorAs, symbolAddGrant, symbolFix, braveStatsAs, allTeams, bpEqualizeFamily, nexusAsSpiritDuringAttackStep, countAsMultiple, handKeywordGrant, battleBpAsLevel, destroyAsMaxLevelGrant, spiritEffectsDisabledGrant, nexusEffectsDisabled, braveImmuneGrant, armorEffectiveGrant, immunityGrant, trashImmunity, exhaustImmunityGrant, ownMagicColorless |
| `constraint.ts`（ConstraintEffectDef） | 禁止・強制・発揮させない | constraint, globalConstraint, constraintGrant, constraintSuppression, mustBlockGrant, summonedExhaustGrant, castRestriction, magicRestriction, familySuppression, triggerSuppression, bpBuffSuppression, flashLockWhileAttackingFamily, exhaustOnManualCoreAdd |
| `cost.ts`（CostDef） | コストの増減・支払い方 | costMod, costDelta, levelCostMod, alsoCostGrant, reductionGrant, trashSymbolReduction, exTrashReduction, selfSummonCost, fchangeCostAs, symbolWhenSummoning, soulCoreOnlyCast, sokuPaySourceGrant, effectCostExhaustDiscount, shinsokuPayAssist, burstSetCost, nexusCostMillPay, summonCostHandDiscardPay, tenshoSelfCostBonus, magicFreeGrant, magicRepeatGrant, burstMagicFreeEffect, fushiFreeByExhaust |
| `negate.ts`（NegateDef） | 効果・ダメージを無効にする／対象を変える | magicNegate, magicNegatePayByNexusGrant, magicNegateTurnOverrideGrant, magicTargetRedirect, bothSidesTargetRedirect, targetNegateByHandDiscard, deckMillNegate, lifeDamageNegate, lifeDamageMillGuard |
| `bonus.ts`（BonusDef） | 数の補正（＋N・倍） | coreBonus, coreReturnBonus, drawStepBonus, coreStepBonus, chimeiBonus, destroyBpThresholdBonus, magicBuffBonus, drawDouble, funsaiBonus, millCapBonus, bofuCountBonus, destroyedCoresToTrash |
| `keywordTiming.ts`（KeywordTimingDef） | キーワードの発揮の時機・やり方を変える | jugekiCoreToVoid, funsaiOnBlock, jugekiOnBlockReplace, bofuOnBlock, bofuChooserSelf, kyoshuOnBlock, koboOnBlock, blockTriggersAsAttackGrant, attackTriggersAsBlockGrant, meisai |

迷ったときの順：引き金があれば trigger → プレイヤーが使うなら activation → 禁止・強制なら constraint → コストなら cost → 無効化なら negate → 数の補正なら bonus → キーワードの時機なら keywordTiming → 残りは continuous。
大きさの見込み：trigger が最大（fieldEvent 17KB・triggered 7KB・reviveOnDestroy 7KB ほか）で約45KB。どれも 60KB 以下。

## 2. 移す道具：`scripts/split-union.ts`（split-file.ts と同じ作りの別の道具）

`npx tsx scripts/split-union.ts <ファイル> <型名> <対応表.json> [--dry-run]`
- TypeScript の API で `<型名>` の union の各メンバー（TypeLiteral）を取り、`kind` の文字列リテラルで対応表のファイルへ振り分ける。**メンバー直前のコメントも一緒に移す**。対応表に無い kind があれば何も書かずに失敗
- 各ファイルの import は元ファイルの import から、メンバーが参照する名前だけを付ける（split-file.ts の仕組みを流用）
- 検査：移した各メンバーのテキストが元と1文字も一致すること、メンバーの数が元と同じことを確かめ、違えば書き戻す。そのあと `tsc` と `codemap`
- 対応表は §1 の表から作る（`docs/design/effectdef-groups.json` に置き、表と同じ中身にする）

## 3. 追随が要るもの

- `scripts/validate-cards.ts` の `findUndeclaredEffectKeys`：`types/effectDef.ts` の本文を読んでいる。**`types/effectDef/` の全ファイルを読む**形に直し、1つも宣言が読めなければ落とす（黙って空にしない）
- `scripts/coverage-effects.ts`：`types/effectAction.ts` は触らないので影響なし（effectDef 側は COVERAGE_V2 で作り替える）
- CLAUDE.md の「型の置き場」とトークン規律の表（effectDef.ts の大きさ）を直す
