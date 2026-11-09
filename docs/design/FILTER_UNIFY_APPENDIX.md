# 絞り込みの統一：付録の器の調査（2026-11-09）

[FILTER_UNIFY.md](./FILTER_UNIFY.md) の「付録：今回の対象外の器」を、`matchesTarget`（`shared/rules/targetFilter.ts`）の軸へ寄せたときに挙動が変わるかで仕分けた調査。コードは変更していない。

- 件数は **data/cards の走査によるカード数**（その欄を1つ以上使うカードの数）。付録本体の「約68」などとは数え方が違い、突き合わせていない
- 「不変」＝判定関数を読んで比べ、同じ結果になると確かめたもの。「変わる」＝結果が変わりうるもの。読めなかったものは「未確認」
- 寄せ先の述語は2系統ある。**場の個体**（AuraDef・各 Grant・levelAs）は `matchesTarget`（`ResolvedTargetFilter`）。**手札のカード**（summon・costMod・reductionGrant）は `matchesPick`（`server/src/logic/actions/revealAction.ts`、型 `CardPick`）で、`ResolvedTargetFilter` には寄せられない

## 0. 集計（欄の数。使用0件の欄も数える）

| 器 | 絞り込みの欄 | 不変 | 変わる | 寄せられない | 寄せ先 |
| :-- | --: | --: | --: | --: | :-- |
| AuraDef（`bp`。204エントリ） | 28 | 25 | 1 | 2 | matchesTarget |
| `keywordGrant`（52） | 10 | 7 | 3 | 0 | matchesTarget |
| `effectGrant`（35） | 4 | 2 | 2 | 0 | matchesTarget |
| `levelAs`（50） | 6 | 5 | 1 | 0 | matchesTarget（再構築パス内の注意あり） |
| `immunityGrant`（11） | 7 | 5 | 1 | 1 | matchesTarget |
| `nameAsGrant`（7） | 2 | 1 | 1 | 0 | matchesTarget（再構築パス内） |
| `costMod` 加算（7） | 6 | 5 | 0 | 1 | matchesPick |
| `costMod` 置換 `mode:"set"`（20） | 8 | 6 | 0 | 2 | matchesPick |
| `reductionGrant`（23） | 6 | 5 | 0 | 1 | matchesPick |
| `summon` from:"hand"（72。from:"burst" の62は絞り込み欄なし） | 11 | 6 | 2 | 3 | matchesPick |
| 合計 | 88 | 67 | 11 | 10 | |

その他（付録の「など」）は §10 に別表。

## 1. 先に見つかった既存の食い違い（統一とは別に直す候補）

**armor／heavyArmor の `keywordGrant` は判定箇所が2つあり、片方が欄を読み落としている。**

- 箇所A `shared/rules/keywordState.ts:210-257`（`continuousKeywordGrantCount`。`spiritHasKeyword` 経由）：全欄を読む
- 箇所B `server/src/logic/state/continuous.ts:301-325`（`armorColorsGranted`／`heavyArmorColorsGranted` の再構築。装甲の色判定はこちら）：`combinedFilter`・`familyFilter`・`colorFilter`・`keywordFilter`・`keywordFilterAny`・`costFilter`・`filter` だけ。**`uncombinedFilter`・`vanillaFilter`・`braveInSpiritState`・`minBp` を読まない**
- データで該当するのは **BS18-031**（heavyArmor＋`uncombinedFilter`）と **BSC05-019**（armor＋`braveInSpiritState`）。どちらも装甲の色が条件外の個体にも付く疑い（場面で未確認。`vanillaFilter`・`minBp` は armor／heavyArmor のエントリには無い）
- 統一の副産物として、keywordGrant の「付与先の判定」を1つの関数にして A・B から呼べばこの食い違いは消える

## 2. AuraDef（`bp`）

判定は `shared/rules/bp.ts:380-525`（`auraAppliesTo`）の1か所。`filter`（matchesTarget）は既にあり、BS 使用1件。**`phaseTurn`・`turn`・`battlingOnly`・`attackingOnly`・`blockingOnly` は `target:"self"` の早期リターンより前で判定される**（self でも効く）ので、寄せるときは ownAll 以外でも `filter` を通す経路が要る。

| 欄（カード数） | 今の判定 | 寄せ先の軸 | 判定 |
| :-- | :-- | :-- | :-- |
| `colorFilter`（19） | `instHasColor`（印刷＋`timedColors`＋`colorsAsContinuous`。**合体ブレイヴの色を見ない**） | `color` | **変わる**：`matchesTarget` は `instColors`＝合体ブレイヴの色（`braveComposite.colors`）も見る。合体ホストが、ホスト自身に無い色のブレイヴと合体しているときだけ差が出る。影響候補：BS01-091, BS01-102, BS02-043, BS03-055, BS04-006, BS04-050, BS12-030, BS14-073, BS14-080, BS15-061, BS16-032, BS18-062, BS20-068, BS20-X03, BS21-009, BS21-070, SD01-023, SD01-028, SD11-006 |
| `keywordFilter`（15） | `spiritHasKeywordOrLabel` | `keyword` | 不変（`matchesTarget` と同じ関数） |
| `keywordsFilter`（2） | `spiritHasKeywordOrLabel` の OR | `keyword`（配列） | 不変（BS11-081 ほか。キーワードは kobo/seimei・funsai/daifunsai で、ラベル系を含まない） |
| `familyFilter`（53） | `matchesFamilyFilter` | `family` | 不変 |
| `familyAllFilter`（1） | `spiritHasFamily` の every | `familyAll` | 不変 |
| `nameIncludesFilter`（3） | `cardNameContains`（配列OR） | `nameContains` | 不変 |
| `costFilter`（2） | `instHasCost` | `cost:{in:[n]}` | 不変（`instMatchesCostFilter` は印刷・`tempAlsoCosts`・`alsoCostsContinuous` のどれかが一致で、`instHasCost` と同集合） |
| `costMinFilter`（2）／`costMaxFilter`（0） | `instAllCosts` の some | `cost.min`／`cost.max` | 不変（同上。どれかのコストが範囲内） |
| `levelFilter`（1） | `currentLevel` ∈ 配列 | `level` | 不変 |
| `vanillaFilter`（1） | `instIsVanilla` | `vanilla:true` | 不変 |
| `combinedFilter`（2）／`uncombinedFilter`（3） | `instIsCombined` | `combined:true`／`uncombined:true` | 不変 |
| `braveOnly`（3） | `card.type==="brave"` | `braveInSpiritState` | 不変（走査は `field.spirits` のみ＝合体中のブレイヴは入らない。`braveInSpiritState` の「合体していない」も常に真） |
| `refreshedOnly`（0）／`restedOnly`（1） | `isRested` | `refreshed:true`／`rested:true` | 不変 |
| `summonedThisTurnOnly`（2）／`summonedByFilter`（0） | `summonedTurn`／`summonedBy` | `summonedThisTurn`／`summonedBy` | 不変 |
| `minCores`（1）／`coresExact`（1） | `cores` | `minCores`／`cores` | 不変 |
| `minSymbols`（1） | `instanceSymbolCount` | `minSymbols` | 不変 |
| `excludeSelf`（1） | 発生源自身を除く | `excludeSelf`（呼び出しが `selfInstanceId=発生源`） | 不変 |
| `attackingOnly`（10）／`blockingOnly`（6）／`battlingOnly`（10） | `board.battle` の ID 一致 | `attackingOnly`／`blocking`／`inBattle` | 不変（ただし上記のとおり self 経路にも要る） |
| `teamFilter`（0） | `card.team` | `team` | 不変（0件） |
| `keishoFilter`（0） | `effects` に `exTrashReduction` | なし（`CardPick.keisho` は手札用） | 寄せられない（0件） |
| `reductionColorsAtLeast`（0） | 印刷の軽減シンボルの色数 | なし | 寄せられない（0件） |

## 3. keywordGrant

判定箇所：`keywordState.ts:210-257`（箇所A）と `continuous.ts:301-325`（箇所B。armor／heavyArmor のみ）。§1 のとおり欄の読み落としがある。`filter`（既存、5件）は `matchesTarget`。

| 欄（カード数） | 今の判定 | 寄せ先 | 判定 |
| :-- | :-- | :-- | :-- |
| `familyFilter`（23） | `matchesFamilyFilter` | `family` | 不変 |
| `colorFilter`（3：BS05-032, BS21-029, SD01-026） | `instHasColor` | `color` | **変わる**（§2 と同じ理由。合体ブレイヴの色。3枚とも装甲系なので箇所A・B両方に効く） |
| `keywordFilter`（8） | `spiritHasKeyword`（ラベル系は静的宣言・付与・合体ブレイヴまで広く見る） | `keyword`（`spiritHasKeywordOrLabel`） | **変わる**：旧キーワードは同じ関数なので不変。**ラベル系（`LABELED_KEYWORDS`）は `matchesTarget` のほうが狭い**（付与を見ない）。影響は BS21-029（rensa）の1枚。他の7枚（tensho・hyoheki・fushi・kyoshu・awaken）は不変 |
| `keywordFilterAny`（1：BS12-068） | `spiritHasKeyword` の OR | `keywords` | 不変（装甲・重装甲はラベル系でない） |
| `costFilter`（4） | `instMatchesCostFilter` | `cost` | 不変 |
| `combinedFilter`（2）／`uncombinedFilter`（1） | `instIsCombined` | `combined`／`uncombined` | 不変 |
| `vanillaFilter`（1） | `instIsVanilla` | `vanilla` | 不変 |
| `braveInSpiritState`（3） | `matchesTarget` と同じ式 | `braveInSpiritState` | 不変 |
| `minBp`（1：BS09-056） | `bpForKeywordGrant`（再入ガード付き `effectiveBp`） | `minBp` | **変わる**：値は同じ実効BPだが、ガードが無いので「キーワードを見る→BP→BPオーラがキーワードを見る」で循環しうる。ガードを `matchesTarget` 側へ移す設計が要る |

## 4. effectGrant

判定は `server/src/logic/triggers.ts:731-753` の1か所（主語＝誘発を持つ個体 `selfInstance`）。

| 欄（カード数） | 今の判定 | 寄せ先 | 判定 |
| :-- | :-- | :-- | :-- |
| `nameIncludes`（4：BS02-056, BS04-051, BS16-045, BS16-065） | `cardNameContains` | `nameContains` | 不変 |
| `familyFilter`（17） | `matchesFamilyFilter` | `family` | 不変 |
| `colorFilter`（2：BS03-X10, BS06-074） | `instHasColor` | `color` | **変わる**（合体ブレイヴの色） |
| `keywordFilter`（6） | `spiritHasKeyword` | `keyword` | **変わる**：ラベル系のみ。影響は BS19-055（rensa）の1枚。残り5枚（funsai・tensho・bofu）は不変 |
| `filter`（4） | `matchesTarget` | — | 既存 |

## 5. levelAs

判定は `server/src/logic/state/continuous.ts:762-930`。**`refreshLevelAsOverrides` の再構築パスの中**で呼ばれる（レベル・色・名前の「〜として扱う」を全消去→再構築する処理）。ここから `matchesTarget` を呼ぶと、`currentLevel`・`instColors`・`cardNameContains` が再構築途中の値を読む順序依存が生まれる（今は `familyFilter` が `matchesFamilyFilter` を呼んでいるので前例はあるが、`level`・`cost` 軸はまだ呼んでいない）。

`target` の `ownSpiritsByKeyword`／`ByFamily`／`Vanilla`／`opponentBlockersOfOwnKeyword` は、主語の集合と絞り込みの軸が混ざった値。`ownSpiritsAll`＋`filter` に分けられる。

| 欄（カード数） | 今の判定 | 寄せ先 | 判定 |
| :-- | :-- | :-- | :-- |
| `familyFilter`（15、ByFamily） | `matchesFamilyFilter` | `family` | 不変 |
| `keywordFilter`（5、ByKeyword 4＋opponentBlockers 1） | ByKeyword は**カード静的**（`kind:"keyword"` の宣言を現在Lvを見ずに探す）＋ラベル系だけ `spiritHasLabeledKeyword` | `keyword`（`spiritHasKeywordOrLabel`） | **変わる**：静的→付与込み・Lv尊重・合体ブレイヴ込みになる。影響は BS04-067（awaken）・BS03-090・BS03-115（funsai）の3枚。BS19-096（rensa）は両方ラベル判定なので不変、SD02-005（kobo、`spiritHasKeyword`）も不変 |
| `costMinFilter`（1、ownSpiritsAll） | `instAllCosts` の some | `cost.min` | 不変 |
| `nameContains`（1、ネクサス対象） | `cardNameContains` | `nameContains` | 不変 |
| `summonedThisTurnOnly`（1、Vanilla） | `summonedTurn` | `summonedThisTurn` | 不変 |
| `attackerOnly`（1） | `battle.attackerInstanceId` | `attackingOnly` | 不変 |
| Vanilla 対象（`instIsVanilla`） | — | `vanilla:true` | 不変 |

## 6. immunityGrant

判定は `shared/rules/constraints.ts:1120-1180`（`hasImmunityAgainst`）の1か所。発生源は `field.spirits＋nexuses` だけ（`effectSources` ではない）。

| 欄（カード数） | 今の判定 | 寄せ先 | 判定 |
| :-- | :-- | :-- | :-- |
| `familyFilter`（3） | `matchesFamilyFilter` | `family` | 不変 |
| `includeSelf`（1：BS05-034） | 系統が合わなくても発生源自身は対象（OR） | なし（`filter` は全軸 AND） | 寄せられない |
| `colorFilter`（2：BS05-044, BS20-006） | `instHasColor` | `color` | **変わる**（合体ブレイヴの色） |
| `keywordFilter`（1：BS09-055、tensho） | `spiritHasKeyword` | `keyword` | 不変（旧キーワード） |
| `combinedFilter`（1）／`vanillaFilter`（1） | `instIsCombined`／`instIsVanilla` | `combined`／`vanilla` | 不変 |
| `nameIncludes`（1：BS18-043、配列OR） | `cardNameContains` | `nameContains`（配列） | 不変 |

## 7. nameAsGrant

判定は `continuous.ts:515-550`（再構築パス内）。`nameIncludes` は**与える名前**であって絞り込みではない。

| 欄（カード数） | 今の判定 | 寄せ先 | 判定 |
| :-- | :-- | :-- | :-- |
| `costFilter`（3：BS02-070, BS03-067, BS06-057） | `instHasCost` | `cost:{in:[n]}` | 不変 |
| `colorFilter`（1：BS03-134） | `instHasColor` | `color` | **変わる**（合体ブレイヴの色）。さらに再構築パス内で `colorsAsContinuous` を読む順序は今の `instHasColor` と同じ |

## 8. costMod・reductionGrant（手札のカードが対象。寄せ先は matchesPick）

判定は `shared/cost.ts`（加算 `costModSum:30-`、軽減付与 `:148-`、置換 `:565-`）。すべて**カード静的**（`cardHasColor`・`card.family`・`hasKeyword`＝宣言とラベルを現在Lv不問で見る・`isVanillaCard`・`matchesCostFilter(cardData.cost)`）で、場の個体を見ない。`matchesPick`（`revealAction.ts:34`）の対応する軸も同じ静的判定なので、欄の読み替えは不変。

| 器 | 欄（カード数） | 寄せ先（`CardPick`） | 判定 |
| :-- | :-- | :-- | :-- |
| costMod 加算 | `colorFilter`（2）・`cardType`（3）・`cardTypes`（1）・`costIn`（1）・`cardName`（1、完全一致） | `color`・`cardType`（配列）・`costIn`・`name` | 不変 |
| costMod 加算 | `side`（5：BS02-086, BS04-085, BS15-068, BS22-072, BS23-046。使う側が相手か自分か） | なし（カードの属性でない） | 寄せられない |
| costMod 置換 | `familyFilter`（10）・`keywordFilter`（1）・`colorFilter`（1）・`costFilter`（2、範囲）・`nameContains`（1）・`cardTypeFilter`（5） | `family`・`keyword`・`color`・`cost`・`nameIncludes`・`cardType` | 不変 |
| costMod 置換 | `scope:"self"`（BS10-059, BS11-X03, BS12-016, BS15-009, BS15-027, BS15-036, BS15-X02 ほか）・`fromHandOnly`（BS23-068） | なし（絞り込みでなく適用の経路・自己参照） | 寄せられない |
| reductionGrant | `cardType`（19）・`cardColor`（2）・`keywordFilter`（5）・`familyFilter`（5）・`vanillaFilter`（1） | `cardType`・`color`・`keyword`・`family`・`vanilla` | 不変 |
| reductionGrant | `selfOnly`（1：BS13-039） | なし | 寄せられない |

## 9. summon（from:"hand"）

判定は `server/src/logic/summon.ts:411-478`（`summonFromHandFreeCandidateMatches`。`pay.ts` の checker と共有）。対象は手札（`alsoFrom:"trash"` でトラッシュ）のカードで、`CardPick` に寄せる。

| 欄（カード数） | 今の判定 | 寄せ先（`CardPick`） | 判定 |
| :-- | :-- | :-- | :-- |
| `bravesOnly`（27） | `candidate.type` がブレイヴか（無指定はスピリット） | `cardType:"brave"`／`"spirit"` | 不変（既定の「スピリット」を明示する必要あり） |
| `familyFilter`（19）・`colorFilter`（13）・`keywordFilter`（10）・`nameIncludes`（7） | 静的な family・色・`hasKeyword`・名前の部分一致 | `family`・`color`・`keyword`・`nameIncludes` | 不変 |
| `costFilter`（7）。数値・`{max,min,in}` | `matchesCostFilter`＋【Fチェンジ】の `fchangeCostAs` | `cost`・`costIn`＋`matchesPick` の `costOverride` 引数 | 不変（`fchangeCostAs` を呼び出し側から渡す形になる） |
| `nameExcludes`（1：BS16-X05）・`nameExcludesSelf`（0） | **部分一致**（`includes`） | `nameExcludes`・`differentNameFromSelf` | **変わる**：`matchesPick` は完全一致（`===`）。BS16-X05 の値は「アルカナマスター・オズ」で、実カードに部分一致で効く名前があるかは未確認 |
| `symbolCount`（1：BS18-057） | 印刷シンボル数が一致 | なし | 寄せられない |
| `sameFamilyAsSelf`（1：BS02-048） | 発生源と系統が1つでも共通（self 相対） | なし | 寄せられない |
| `maxCostFromOwnTrashCores`（1：BS02-096） | コスト≦自分のトラッシュのコア数（数値は実行時） | なし | 寄せられない |

## 10. その他（付録の「など」。欄は数えたが判定箇所は読んでいない＝未確認が多い）

| 器（エントリ数） | 欄（カード数） | 備考 |
| :-- | :-- | :-- |
| `familyGrant`（9） | `familyFilter`（4）・`colorFilter`（2）・`costFilter`（1）・`filter`（1） | `spiritHasFamily` の中で判定（`keywordState.ts:371-`）。**`familyFilter` は自己再帰を避けるため意図して静的な `instFamilies` だけを見る**。`matchesTarget` の `family` 軸へ寄せると再帰するので寄せられない。`colorFilter` は `instHasColor`（§2 と同じ差）。`filter` 欄の `family` 軸も同じ理由で書けない |
| `vanillaAsGrant`（7） | `familyFilter`（2） | 再構築パス内（`continuous.ts:402-`）。`matchesFamilyFilter`＋`instHasColor`。色欄の使用は0件 |
| `alsoCostGrant`（5）・`tenshoSelfCostBonus`（2） | `familyFilter`（1）・`combinedOnly`（1）ほか | 未確認 |
| `handKeywordGrant`（2）・`effectEntryGrant`（2）・`mustBlockGrant`（3）・`bpAs`（1）・`bpEqualizeFamily`（2）・`symbolFix`（8）・`attackTriggersAsBlockGrant`（2）・`blockTriggersAsAttackGrant`（3）・`exhaustImmunityGrant`（3）・`lifeDamageReplace`（2）・`flashLockWhileAttackingFamily`（2）・`targetNegateByHandDiscard`（2） | 主に `familyFilter`（各1〜4）、一部 `vanillaFilter`・`keywordFilter`・`nameContains`・`colorFilter` | 判定箇所は未確認 |
| `battleBpAsLevel`（4）・`coresAs`（1）・`nexusAsSpiritDuringAttackStep`（1）・`constraintSuppression`（1）・`magicBuffBonus`（5）・`exhaustOnManualCoreAdd`（8）・`colorAs`（39） | `keywordFilter`（1）・`nameContains`（各1）・`colorFilter`（各1） | 未確認 |
| `burst`・`battleWon`・`fieldEvent`・`reviveOnDestroy`・`constraintGrant` | — | FILTER_UNIFY.md §2〜§7 の対象（調査せず） |

## 11. まとめ：変わる欄の共通原因（3つ）

1. **色**（付与系6器・§2〜§7）：個別欄は `instHasColor`、`matchesTarget` は `instColors`。差は合体ブレイヴの色だけ。BRAVE.md §12.2「色の絞り込みは合成後の色で行う」に照らすと、`instHasColor` 側が古い。
2. **ラベル系キーワード**（keywordGrant BS21-029・effectGrant BS19-055）：個別欄は `spiritHasKeyword`（付与・合体ブレイヴ込み）、`matchesTarget` は `spiritHasKeywordOrLabel`（付与を見ない）。FILTER_UNIFY §7 の BS07-X25-e3 と同じ話。
3. **静的キーワード**（levelAs ByKeyword 3枚）：`matchesTarget` に静的専用の軸が無く、寄せると付与込みになる。

## 12. 決定（2026-11-09 メインループ。§11 の3原因は既存の規則で決まる）

- 色：付与系の `colorFilter` は合体中のブレイヴの色を含める（BRAVE §12.2・2026-11-08 ユーザー確認の当てはめ）。`instHasColor` → `instColors`
- キーワード：「【X】を持つ」は効果で得たキーワードを含める（2026-09-25 ユーザー決定の当てはめ）。`matchesTarget` のラベル付きキーワードを `spiritHasKeyword` と同じ見方に広げる（BS07-X25-e3・BS21-029・BS19-055 が同時に解ける）。levelAs の ByKeyword 3枚も付与込みになる
- `refreshLevelAsOverrides` の再構築の中で読む器（levelAs・nameAsGrant・vanillaAsGrant・familyGrant）は今回は寄せない（再構築の途中の値を `matchesTarget` が読む順序依存を持ち込まないため）
- 手札のカードが対象の器（summon from:"hand"・costMod・reductionGrant）は `CardPick`（`matchesPick`）へ寄せる別の PR にする。summon の `nameExcludes`（部分一致）は寄せずに残す
- self 相対・OR 的な欄（`includeSelf`・`keishoFilter` など）は個別欄のまま残す

### PR の順番
1. fix：armor／heavyArmor の付与先を1つの判定にし、§1 の読み落とし（BS18-031・BSC05-019）を直す
2. fix：付与系の色に合体中のブレイヴの色を含める
3. fix：`matchesTarget` のラベル付きキーワードを付与込みにする
4. 統一（挙動は変えない）：AuraDef bp・keywordGrant・effectGrant・immunityGrant の個別欄を `filter` へ
5. 統一（挙動は変えない）：手札の器を `CardPick` へ
