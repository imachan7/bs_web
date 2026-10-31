# 絞り込みを `filter: TargetFilter` に寄せる洗い出し（調査メモ）

2026-10-31 作成。実装はしていない。件数は `data/cards/*.json` の `effects` を再帰で走査した実測（エントリ数／カード数）。
判定の置き場は `ファイル:行`（2026-10-31 時点）。

## 1. 目的

- 継続効果・誘発・制約の器が、`colorFilter`・`keywordFilter`・`familyFilter`・`maxCost` … と器ごとに軸を持つのをやめ、`filter: TargetFilter` 1本にする（既存データも移す。挙動は変えない）。
- 軸が増えるたびに「型・判定・validate・データ」を器の数だけ直す状態をなくす。軸は `shared/rules/targetFilter.ts` の `matchesTarget` に足せば全器で使える。
- 先例：`timedContent` の `unblockable.from`（`shared/block.ts:158`、`ResolvedTargetFilter`）と、`AuraCondition.ownSpiritMatches`（`shared/rules/bp.ts:306`。ただしカード使用0件）。

## 2. 器ごとの対応表

### 2-1. braveImmuneGrant（2エントリ／2枚。BS12-028, BS12-067）

| 今の軸 | 型 | 誰を絞るか | TargetFilter |
| :-- | :-- | :-- | :-- |
| `colorFilter` | Color | 付与先の自分のスピリット（`target:"ownAll"` のとき。`"self"` でも発生源に適用される） | `color` |
| `keywordFilter` | Keyword | 同上。`spiritHasKeyword`（BS12-067は `armor`） | `keyword` |

`target`・`scope`・`phase`・`turn` は絞り込みでなく残す。判定：`server/src/logic/state/continuous.ts:315-330`。

### 2-2. fieldEvent の主語の軸（140エントリ／125枚。fieldEvent 全体は325エントリ）

「主語」＝`selfOverride`（イベントの主体のスピリット）。省略時は絞らない。主体が居ない（`selfOverride` 無し）と不成立。判定：`server/src/logic/fieldEventTriggers.ts:176-410`。

| 今の軸 | 件数（エントリ） | 意味 | TargetFilter |
| :-- | --: | :-- | :-- |
| `colorFilter` | 24 | 主語の色。`eventColors`（**カード静的**の色）で判定 | `color` |
| `familyFilter` | 51 | 主語の系統。破壊/召喚/タッチ系は `eventInfo.families`（**静的**）、疲労等は付与込み | `family` |
| `keywordFilter` | 16 | 主語が持つキーワード（付与込み。`spiritHasKeywordOrLabel`） | `keyword` |
| `subjectKeywordFilter` | 10 | 同上（**`keywordFilter` と同じ意味の別名**。配列OR可） | `keyword`（`keywordFilter` と統合） |
| `costFilter` | 11 | 主語のコスト（`eventInfo.costs`＝付与コスト込み） | `cost` |
| `maxBp` | 8 | 主語の実効BP以下 | `maxBp` |
| `nameIncludes` | 10 | 主語のカード名。`ownTensho` だけは犠牲になったスピリットの名前（`eventInfo.names`） | `nameContains`（`ownTensho` の4枚は別扱い。§6） |
| `vanillaOnly` | 5 | 効果の記述を持たない主語。`eventInfo.vanilla`（スナップショット）を優先 | `vanilla: true` |
| `symbolCount` | 1 | シンボル数が一致 | `symbolCount` |
| `subjectCombined` | 2 | 主語が合体している／いない | `combined` |
| `subjectMaxCores` | 1 | 主語のコア数以下 | `maxCores` |
| `subjectMaxCost` | 1 | 主語のコスト以下 | `cost.max` |
| `subjectHasTrigger` | 1 | 主語が指定誘発を静的に持つ | `hasTrigger` |
| `subjectMinSymbols` | 1 | シンボル数以上 | `minSymbols` |
| `targetColorFilter` | 1 | **主語でなく相手役**（`targetInstanceId`＝ブロッカー等）の色 | 主語の `filter` では書けない（§3の`partnerFilter`） |
| `targetSameLevelAsSelf` | 1 | 相手役のLvが主語と同じ | 同上（`partnerFilter` ＋ 相対軸） |
| `subjectMinBp`・`subjectMinCost`・`subjectRefreshed`・`subjectNotInBattle`・`subjectOriginalNexus`・`subjectTeamFilter` | **0** | カードに使われていない（26系の語彙） | `minBp`／`cost.min`／`refreshed`／`notInBattle`／`originallyNexus`／`team` |
| `subjectReceivesBpPlus`・`subjectDifferentNameFromSelf` | **0** | 使われていない。TargetFilter に同じ意味の軸が無い | **足さず削除**を推奨 |

- `excludeSelfSubject`（2枚）・`excludeSelfAsEventTarget`（4枚）は「主語が発生源自身なら発火しない」で同じ意味。`filter.excludeSelf`（`selfInstanceId`＝発生源）に寄せられる。
- 同一エントリに複数軸があるのは2件のみ（BS16-064 `subjectMaxCost`＋`subjectHasTrigger`、BS18-X02 `colorFilter`＋`familyFilter`）。どちらも AND で、TargetFilter の意味と同じ。
- 寄せない（主語の属性ではなく、イベントの文脈）：`subjectSide`・`ownOnly`・`selfOnly`・`eventTargetIsSelf`・`byOpponent*`・`sourceColorFilter`・`magic*`・`fushiSummonOnly` など。
- `condition` 内の `targetMaxBp`（`ownLifeDamaged`、2）・`targetKeywordExclude`（1）・`targetMaxCostOfEventTarget`（1）も相手役／アタッカーの属性。`partnerFilter` の候補（§3）。

### 2-3. unblockableBy（38エントリ／27枚。フィルタ軸を持つのは35）

誰を絞るか＝**ブロッカー**（アタッカーが持つ制約。「条件に合うブロッカーにはブロックされない」）。軸なしは「すべてにブロックされない」。判定：`shared/block.ts:164-250`。

| 今の軸 | 件数 | 意味 | TargetFilter |
| :-- | --: | :-- | :-- |
| `colorFilter` | 7 | ブロッカーがその色を持つ | `color` |
| `keywordFilter` | 4 | ブロッカーがそのキーワードを持つ | `keyword` |
| `keywordFilterAbsent` | 1 | 持たない | `keywordExclude` |
| `familyFilterAbsent` | 1 | 指定系統を持たない | `familyExclude` |
| `levelFilter` | 9 | ブロッカーのLvが含まれる | `level` |
| `maxCores` | 1 | コア数が以下 | `maxCores` |
| `maxCost` | 2 | コストが以下（付与コスト込み） | `cost.max` |
| `costIn` | 4 | いずれかのコストが一致 | `cost.in` |
| `costNot` | 2 | どのコストも n でない | **足す軸：`cost.notIn`**（名称案） |
| `maxBp` | 1 | 実効BPが以下 | `maxBp` |
| `nonVanilla` | 1 | 効果の記述を持つ | `vanilla: false` |
| `costAtMostAttacker` | 1 | ブロッカーのコストがアタッカー以下（付与コストの総当たり） | `maxCostAsSelf`（既存。ただし意味がずれる §6） |
| `levelAtMostAttacker` | 1 | ブロッカーのLvがアタッカー以下 | **足す軸：`maxLevelAsSelf`** |
| `noSoulCore` | 0 | `blockerInst.soulCoreOn` を見る | 使用0。`soulCore:"absent"` とは判定元が違うので削除推奨 |

寄せない：`opponentOnly`（12件。ブロッカーとアタッカーの陣営の関係で、属性でない）・`require*`（持ち主の盤面条件。制約が有効かどうかで、ブロッカーの絞り込みでない）。
**現データに複数軸が同居するエントリは無い**（現状の判定は軸ごとの OR、TargetFilter は AND。意味が違うが移行では起きない）。

### 2-4. canBlockWhileRested（17エントリ／15枚。軸があるのは8エントリ／7枚）

誰を絞るか＝**アタッカー**（疲労していてもブロックできる相手の条件）。判定：`shared/block.ts:104-130`。

| 今の軸 | 件数 | TargetFilter |
| :-- | --: | :-- |
| `targetMaxCost` | 4 | `cost.max` |
| `targetKeywordExclude` | 2 | `keywordExclude` |
| `targetMaxBp` | 1 | `maxBp` |
| `targetCombinedOnly` | 1 | `combined: true` |

4つとも1対1で対応する。`attackerInst === undefined`（アタッカー不明）のときは今 false で、`filter` ありのときもそれを保つ。タイムド版 `{type:"canBlockWhileRested"}` は軸なし。

### 2-5. summonedExhaustGrant（1エントリ／1枚。BS06-060）

絞り込みの軸は**無い**（「相手のスピリットすべて」が固定。あるのは `condition.selfRested`＝発生源が疲労状態の間だけ、のみ）。判定：`EffectModules.ts:626`、`summon.ts:151`。**移す件数0**。`filter` を足す理由が今は無い（足さない）。

### 2-6. 「コアを取り除けない」系

`constraintGrant` 自体はこの器の軸でなく、付与先の絞り込み（§付録）。個別の名前・色の軸を持つのは globalConstraint 側：

| 器 | 軸 | 件数 | 誰を絞るか | TargetFilter |
| :-- | :-- | --: | :-- | :-- |
| `coresCantBeRemovedByOpponent` | `nameContains`（必須） | 1（BS12-022） | 発生源の持ち主のスピリット | `nameContains` |
| `coreFloorByCost` | `colorFilter`（`ownOnly`・`byOpponentOnly` は陣営の軸で別） | 1（BS12-065） | 両陣営のスピリット | `color` |
| `coreFloorOwnNamedByOpponent` | `nameContains`（必須） | 0 | 発生源の持ち主のスピリット | `nameContains` |
| `coresCantBeRemovedAll` | `side`（陣営） | 2 | 陣営の軸のみ | 移さない |
| `constraintGrant` で付与される `coresCantBeRemoved` | 付与先の `keywordFilter`＋`combinedFilter` | 1（BS13-005） | 付与先 | §付録 |

判定：`shared/rules/activation.ts:231-250`（`coresCantBeRemovedByOpponent`）、`server/src/logic/removal.ts:1480`（`coreFloorByCostFor`）。

### 2-7. noRestWhenBlocking{Color,Cost,WithoutKeyword}（計4エントリ／4枚）→ 1種 `noRestWhenBlocking{filter, oncePerTurn?}`

誰を絞るか＝**アタッカー**（ブロックしても疲労しない相手）。判定：`server/src/logic/GameEngine.ts:1252-1290`。

| 今 | 件数 | filter |
| :-- | --: | :-- |
| `noRestWhenBlockingColor{color}` | 1（BS02-X07） | `{color}` |
| `noRestWhenBlockingCost{maxCost}` | 1（BS07-048） | `{cost:{max}}`（付与コストのいずれか以下 ＝ `instMatchesCostFilter` と同じ） |
| `noRestWhenBlockingCost{sameCost}` | 1（BS07-065） | `{sameCostAsSelf:true}`（self＝ブロッカー。意味がずれる §6） |
| `noRestWhenBlockingWithoutKeyword{keyword, oncePerTurn}` | 1（BS07-062） | `{keywordExclude}` ＋ `oncePerTurn` はエントリ側に残す |

「ターンに1回」の消費（発生源のネクサスごとに数える。`isOnce` の判定が型名 `noRestWhenBlockingWithoutKeyword` に依存している）は統合後に `oncePerTurn` 見に書き換える。

### 2-8. reviveOnDestroy.condition／triggered.condition の「自分のフィールドに〜がいる」系

**前提のずれ**：`reviveOnDestroy.condition` に該当する軸は無い（`opponentFieldSymbolColorsAtMost`・`ownBurstSet`・`ownFieldOnlyColor`・`ownHandAtLeast` の4種のみ、計4エントリ。どれも「いる」でなく数・全称・手札）。実際に該当するのは triggered／step／fieldEvent／magic／burst／costMod の condition。

| 今の軸 | 使われる器（エントリ） | 現在の意味 | `ownSpiritMatches` で表せるか |
| :-- | :-- | :-- | :-- |
| `ownFieldHasColorSpirit` | triggered 4（BS03-056/057, BS09-048/052） | 色を持つスピリットが1体以上（付与色込み） | 表せる（`{color}`） |
| `ownFieldHasKeyword` | triggered 1（BS04-001） | キーワード持ちが1体以上（`spiritHasKeywordOrLabel`） | 表せる（`{keyword}`） |
| `ownFieldHasCombinedSpirit` | triggered 1（BS10-X03）、levelAs 1（BS10-002） | 合体スピリットが1体以上 | 表せる（`{combined:true}`） |
| `ownNameIncludesCountAtLeast` | step 1・triggered 1・magic 1（BS04-052, BS07-039, BS12-079/BS13-080） | 名前に含む自分のスピリットが count 体以上（**重みなしの素の数**） | 件数付きの形が要る |
| `ownFamilyCountAtLeast` | magic 4・step 3・burst 2・costMod 1・fieldEvent 1・globalConstraint 1（12エントリ） | 系統が count 体以上（**`countSpiritsWeighted`＝重みつき**） | 件数付きの形が要る |
| `ownFieldHasColorNexus`／`ownColorTotalAtLeast` | triggered 3＋fieldEvent 1／fieldEvent 1・step 1 ほか | ネクサス／スピリット＋ネクサスの合計 | ネクサスを含むので `ownSpiritMatches` では表せない（`ownFieldCards` カウンタの領域） |
| `ownFieldOnlyColor`・`ownAllHave*` | 7〜8 | 「〜だけ」「すべて」（全称） | 表せない（存在でなく全称） |

寄せる先の案（§6で相談）：「1体以上」は既存 `ownSpiritMatches`、件数つきは新設 `ownSpiritsAtLeast: {filter, count}`（`countSpiritsWeighted` を通す）。既存の `EffectCounter.ownSpirits: TargetFilter`（`EffectModules.ts:1219`）／`AuraCounter.ownSpiritsMatching`（`bp.ts:223`）と IfCond の `count` で既に書けるので、**新設せず `if{cond:{count:{ownSpirits:filter},atLeast}}` に寄せる**のも選択肢。
判定の場所：`triggers.ts:314,346,356,448`／`stepTriggers.ts:236,289`／`fieldEventTriggers.ts:437`／`keywords/burst.ts:516`／`shared/magicCondition.ts:12,39`／`shared/cost.ts:47`／`shared/rules/constraints.ts:995`。

### 2-9. バトル相手の条件

| 今の軸 | 件数 | 誰を見るか | TargetFilter |
| :-- | --: | :-- | :-- |
| `battleOpponentCombined`（triggered.condition） | 2（BS11-X02, BS17-003） | 発生源がアタッカーかブロッカーかで、**もう一方の参加者** | `combined:true` |
| `battleOpponentHasKeyword`（AuraCondition） | 1（BS17-014） | 持ち主から見た**相手側の参加者**（陣営で引く） | `keyword: Keyword[]`（OR・同じ意味） |

新設案：条件側に `battleOpponentMatches: TargetFilter` を1つ（2つの引き方の違いは判定側で吸収）。判定：`triggers.ts:418`／`shared/rules/bp.ts:359`。

## 3. TargetFilter に足す軸（と、軸でない追加）

| 名前（案） | 意味 | 必要なカード | 判定の置き場 |
| :-- | :-- | --: | :-- |
| `cost.notIn?: number[]` | どのコストも n と一致しない（付与コスト込み） | 2（BS02-048, BS14-044） | `matchesTarget` の `cost` 判定（`instHasCost`） |
| `maxLevelAsSelf` | Lvが self 以下 | 1（SD02-012） | `matchesTarget`＋self 相対の解決（下） |
| `maxCostAsSelf`／`sameCostAsSelf`（既存）の修正 | 現在は `normalizeFilter` が印刷コスト1個で `cost` に解決する。`block.ts`／`GameEngine` は `instAllCosts` の総当たり | 2（BS05-084, BS07-065） | 解決を `shared` へ移し、`instAllCosts` を使う |
| `partnerFilter: TargetFilter`（fieldEvent・条件の相手役） | `targetInstanceId` の個体への絞り込み | 2（fieldEvent）＋相手役の条件 約14 | `fieldEventTriggers.ts` |
| 条件側 `battleOpponentMatches` | §2-9 | 3 | `triggers.ts`／`bp.ts` |
| 条件側 `ownSpiritsAtLeast`（またはカウンタ） | §2-8 | 15 | `triggers.ts` ほか |

- 軸そのものの追加は `cost.notIn`・`maxLevelAsSelf` の2つだけ（ほかは既存の軸で足りる）。
- **解決の置き場所**：`maxLevelAsSelf` や `maxCostAsSelf` のような self 相対の軸は、今 `server/src/logic/actions/filter.ts` の `normalizeFilter`（`ActionCtx` が要る）が解決する。`shared/block.ts` はクライアントも使うため、`ActionCtx` を要らない軽い解決関数（`board`・`self` インスタンスだけを取る）を `shared/rules/targetFilter.ts` に作る必要がある。

## 4. 判定の入口（`matchesTarget` に置き換える場所）

| 器 | 置き換える場所 | 呼び方 |
| :-- | :-- | :-- |
| unblockableBy | `shared/block.ts:164-250` | `matchesTarget(board, blockerPid, blockerInst, c.filter, attackerInst.instanceId)`（`from` の先例が `:158`） |
| canBlockWhileRested | `shared/block.ts:104-130` | `matchesTarget(board, attackerPid, attackerInst, c.filter)`。アタッカー不明なら false |
| noRestWhenBlocking | `GameEngine.ts:1252-1290`（`exhaustDeclaredBlocker`） | `matchesTarget(state, attackerPid, attacker, c.filter, blocker.instanceId)` |
| braveImmuneGrant | `state/continuous.ts:315-330` | `matchesTarget(state, pid, spirit, effect.filter)` |
| fieldEvent 主語 | `fieldEventTriggers.ts:176-410` | `matchesTarget(state, selfOverride.pid, selfOverride.inst, effect.filter, inst.instanceId)` 1回。十数個の `if` が消える |
| 自分のフィールド条件 | `triggers.ts:314-356,448`・`stepTriggers.ts`・`magicCondition.ts`・`burst.ts`・`cost.ts` | `ownSpiritMatches`／カウンタ |
| バトル相手 | `triggers.ts:418`・`bp.ts:359` | `matchesTarget(..., oppPid, opponent, filter)` |
| cores／floor | `shared/rules/activation.ts:231`・`removal.ts:1480` | `matchesTarget(board, ownerPid, target, filter)` |
| 検査ツール | `scripts/validate-cards.ts`（既知の軸表）・`scripts/check-effect-semantics.ts`・`scripts/audit-spec-vs-data.ts` | 旧軸名を新軸に更新（旧軸が残っていたら落とす） |

## 5. 移す件数と PR の分け方

移す件数（エントリ）：braveImmuneGrant 2、fieldEvent 140、unblockableBy 35、canBlockWhileRested 8、noRestWhenBlocking 4、cores系 2、条件の「いる」系 約15（triggered 4＋1＋2＋3 の 10 ＋ battleOpponent 3 ＋ family 系 12 を希望する場合）。**合計およそ 210〜230 エントリ**（fieldEvent が6割強）。

案（器ごとに別 PR。同じ種類の作業を重ねない）：

| PR | 内容 | エントリ | 理由 |
| :-- | :-- | --: | :-- |
| 1 | 共通部品：`cost.notIn`・`maxLevelAsSelf`・self 相対の `shared` 解決・`instAllCosts` 化。データは触らない | 0 | 以降の前提。挙動を変えないテストを先に |
| 2 | ブロックまわり：unblockableBy＋canBlockWhileRested＋noRestWhenBlocking（判定が `block.ts`・`GameEngine` に集まる） | 47 | `from` の先例があり簡単 |
| 3 | fieldEvent の主語（0件の軸の削除含む） | 140 | 最大。破壊/召喚のスナップショット論点があるので単独 |
| 4 | 付与の絞り込み：braveImmuneGrant＋cores系 | 4 | 小さい |
| 5 | 条件：自分の「いる」系＋バトル相手 | 約15 | 件数つきの形が決まってから |

PR 2〜5 は PR 1 の後なら並行できる（編集ファイルが重ならない）。

## 6. 迷った点・ずれる危険（自分で決めない）

1. **破壊/召喚の主語は「カード静的」で判定している**。`colorFilter`（12件が `ownSpiritDestroyed`）は `eventColors`＝マスターの色、`familyFilter` は `eventInfo.families`＝静的な系統、`vanillaOnly` は `eventInfo.vanilla`。`matchesTarget` に寄せると、付与された色・系統（`timedColors`・付与系統・「バニラとしても扱う」）を拾う。`ownSpiritDestroyed` の `selfOverride` には破壊待機中の個体が渡るので判定自体は可能だが、挙動が変わる。**静的に保つか、付与込みに変えてよいか**。
2. **`ownTensho` の `nameIncludes`（4件）は主語が居ない**（犠牲になったスピリットは場に居ない。`eventInfo.names` を見る）。`filter` に寄せない／個体のスナップショットを渡す、のどちらか。
3. **`ownNexusDestroyed` の `colorFilter`（1件）の主語はネクサス**で、`selfOverride` が渡っているか未確認（`removal.ts` の呼び出し側）。
4. **`keywordFilter` と `subjectKeywordFilter` は同じ意味の別名**。`keywordFilter` の型コメントは「静的に持つとき」と書いてあるが、実装は付与込み（2026-09-25 ユーザー確認）。統合してよいか。
5. **件数つき条件の数え方が2通りある**：`ownFamilyCountAtLeast` は `countSpiritsWeighted`（「N体として数える」効果の重みつき）、`ownNameIncludesCountAtLeast` は素の `.filter().length`、`ownSpiritMatches` は `.some`。寄せるとき、**名前の件数も重みつきにしてよいか**（挙動が変わりうる）。
6. **self 相対の軸（`maxCostAsSelf`・`sameCostAsSelf`）の意味のずれ**：`normalizeFilter` は印刷コストで解決、`block.ts`・`GameEngine` は `instAllCosts` の総当たり。道化師クラン（付与コスト）が絡むときだけ結果が変わる。寄せ方の確認が要る。
7. **`unblockableBy` の軸は今 OR、`TargetFilter` は AND**。現データに複数軸の同居は無いので移行は安全。型上も複数軸を許すか（許すなら意味が変わる）、`filter` は1本のみとして OR は書けなくするか。
8. **制約の `filter` に載せる型**：`TargetFilter` は `"selfBp"` や `sameColorAsBattleLoser` など `normalizeFilter` が要る軸を含む。制約・fieldEvent のデータには `ResolvedTargetFilter` 相当（解決不要の軸だけ）に絞った型が要る。絞った型をどこに置くか。
9. **循環 import**：`targetFilter.ts` は `constraints.ts`（`activeConstraints`）を import している。`constraints.ts` 内（`:995`、`constraintGrant`）で `matchesTarget` を呼ぶと循環する。`block.ts` から呼ぶ分には問題ない。
10. **0件の軸**（`subjectMinBp` など26系の語彙8個、`noSoulCore`、`coreFloorOwnNamedByOpponent`）は移さず**削除**でよいか。削除ならデータ移行が無く最小。
11. **`reviveOnDestroy.condition` は指示にあった「いる」系を持たない**（§2-8）。この器を対象から外してよいか。代わりに `reviveOnDestroy` 自体の個別軸（`colorFilter`・`familyFilter`・`keywordFilter`・`vanillaFilter`・`minBp`・`nameIncludes`ほか。計約32）が同じ問題を持つ。

## 付録：同じ問題を持つが今回の対象外の器（軸の延べ数／実測）

AuraDef（`bp` など）約68・`constraintGrant` 47（`familyFilter`14・`keywordFilter`12・`nameIncludes`5・`combinedFilter`7・`vanillaFilter`2 ほか）・`summon` アクション39・`keywordGrant` 34・`reviveOnDestroy` 32・`effectGrant` 27・`levelAs` 17・`costMod` 13・`reductionGrant` 11・`nameAsGrant` 10・`immunityGrant` 8 など。**`constraintGrant` は付与先の絞り込み専用の12軸を持ち、`braveImmuneGrant` と同じ形**なので、PR 4 に入れるなら一緒に寄せるのが自然（43エントリ／39枚）。`burst` 器の `destroyedColorFilter`・`destroyedMinBp`・`burstDestroyed` も同型。

## 7. 決定（2026-10-31）

- **主語の色・系統・バニラは付与込みで見る**（ユーザー決定。場を離れる直前の状態を見る規則＝ACTION_VOCABULARY と同じ）。挙動が変わるので、統一より先に fix PR で直す。統一の PR は挙動を変えない
- 対象は §2 の9つに、同じ形の `constraintGrant` と `reviveOnDestroy` の個別軸を加える（プロモで使う）。付録の残り（AuraDef・keywordGrant・effectGrant など）はプロモの後
- `reviveOnDestroy.condition` は「いる」系を持たないので、§2-8 の条件の対象からは外す（器の個別軸は上のとおり寄せる）
- 件数つきの条件（`ownFamilyCountAtLeast` などの15件）は寄せない。数え方（重みつき／素の数）が違い、揃えると挙動が変わる
- self 相対の軸（`maxCostAsSelf`・`sameCostAsSelf`）は、各所の今の判定のまま移す（印刷コストか `instAllCosts` の総当たりか、を変えない）
- `unblockableBy` の `filter` は1本の AND。いまのデータに複数軸の同居は無い
- 制約・fieldEvent のデータに載せる型は、解決の要らない軸だけの `ResolvedTargetFilter`
- 循環 import：`constraints.ts` からは `matchesTarget` を呼ばない。判定は呼び出し側（`block.ts` など）か、新しい概念のファイルに置く
- `keywordFilter` と `subjectKeywordFilter` は同じ意味なので1つにする
- `ownTensho` の名前軸（主語が場に居ない）は寄せない
- 0件の軸（26系の語彙8個・`noSoulCore`・`coreFloorOwnNamedByOpponent`）は消さず、移しもしない（26系は意図して持ち込んだもの）

### PR の順番

1. fix：主語の色・系統・バニラを付与込みで判定する（場面テストつき）
2. 共通部品＋ブロックまわり（`TargetFilter` の `cost.notIn`・`maxLevelAsSelf`、`noRestWhenBlocking{filter}` への統合、`canBlockWhileRested`・`unblockableBy`）
3. fieldEvent の主語（1 のマージ後）
4. 付与とコア系（`braveImmuneGrant`・`constraintGrant`・コア除去の制約）
5. 条件（「いる」系→`ownSpiritMatches`、バトル相手→`battleOpponentMatches`、`reviveOnDestroy` の個別軸）

### PR 3・4 で寄せずに残したもの（挙動が変わるため）

- BS07-X25-e3（constraintGrant の `keywordFilter:"clash"`）：`matchesTarget` は【激突】をラベル付きキーワードとして狭く見る（継続効果の付与を見ない）。寄せると Lv2 で【激突】を与えた勇傑が Lv3 の対象から外れる。`matchesTarget` のラベル付きキーワードの見方は、ほかのカードにも響きうるので別に調べる
- BS12-022（`coresCantBeRemovedByOpponent` の `nameContains`）：今は印刷名だけ。寄せると「〜として扱う」の名前も数える
- BS13-003（`ownSpiritSummoned` の `costFilter`）：召喚の経路は印刷コストだけを渡している。寄せると付与コストも数える
- `targetSameLevelAsSelf`（1件）：TargetFilter に「主語と同じ Lv」の軸が無い
- `ownTensho` の名前・系統（主語が場に居ない）と、`ownNexusDestroyed` の色（主語がネクサス）

**移行の確かめ方**：smoke の全緑だけでは足りない。全カードを発火させるテスト（part190・part197）は旧軸名を読んで場面を組むので、データだけ移すと場面が組めずに黙って発火しなくなる。`npm run coverage:effects` の実行率と「場に出ているのに一度も適用されていない効果」を main と比べ、一致することを確かめる
